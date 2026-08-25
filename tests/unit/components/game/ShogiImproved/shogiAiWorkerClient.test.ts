import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShogiAiWorkerClient,
  type SerializedKyokumenImproved,
} from '@/components/game/ShogiImproved/shogiAiWorkerClient';

type PostedRequest = { type?: string; id?: number };

class WorkerStub {
  static instances: WorkerStub[] = [];
  static failConstructionAfter = Number.POSITIVE_INFINITY;

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  readonly terminate = vi.fn();

  constructor() {
    if (WorkerStub.instances.length >= WorkerStub.failConstructionAfter) {
      throw new Error('forced worker construction failure');
    }
    WorkerStub.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

const position: SerializedKyokumenImproved = {
  board: new Array<number>(81).fill(0),
  hand: [],
  teban: 0,
};

function currentWorker(): WorkerStub {
  // The client constructs the main worker first, then may add SMP helpers on
  // Node versions that expose navigator.hardwareConcurrency/SharedArrayBuffer.
  const worker = WorkerStub.instances[0];
  expect(worker).toBeDefined();
  return worker!;
}

function bestMoveRequest(worker: WorkerStub): Required<Pick<PostedRequest, 'id' | 'type'>> {
  const request = worker.posted.find((message) => (message as PostedRequest).type === 'bestMove') as
    PostedRequest | undefined;
  expect(request?.id).toEqual(expect.any(Number));
  return request as Required<Pick<PostedRequest, 'id' | 'type'>>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  WorkerStub.instances = [];
  WorkerStub.failConstructionAfter = Number.POSITIVE_INFINITY;
});

/**
 * `nnueWeightsStatus` is unsolicited: the worker sends it without being asked,
 * so a listener attached too late would silently drop the very event the
 * delivery-failure logging exists to capture (raised in review of PR #718).
 *
 * The race cannot happen, and these tests pin the reason so a future refactor
 * cannot quietly reintroduce it. `createShogiAiWorkerClient` is a plain
 * synchronous function: from `new Worker(...)` to `attachWorkerHandlers(...)`
 * control never returns to the event loop, and message events are dispatched
 * as event-loop tasks. Insert a single `await` between the two and the first
 * test below fails.
 */
describe('shogiAiWorkerClient unsolicited message delivery', () => {
  it('attaches the message handler before returning, so nothing can arrive unheard', () => {
    vi.stubGlobal('Worker', WorkerStub);
    const client = createShogiAiWorkerClient();

    // Synchronously after construction — the earliest an event could ever be
    // dispatched is the next task, which is strictly after this point.
    expect(currentWorker().onmessage).toBeTypeOf('function');
    client.terminate();
  });

  it('receives a weights status delivered at the earliest possible moment', async () => {
    // A microtask queued during `new Worker(...)` runs as soon as the calling
    // synchronous block finishes — earlier than any real message event could
    // be delivered, so it is a strict lower bound on the race window.
    class EagerWorkerStub extends WorkerStub {
      constructor() {
        super();
        queueMicrotask(() =>
          this.emit({
            type: 'nnueWeightsStatus',
            status: 'unavailable',
            attempts: 1,
            elapsedMs: 12,
            httpStatus: 404,
            errorMessage: 'HTTP 404',
          })
        );
      }
    }
    vi.stubGlobal('Worker', EagerWorkerStub);

    const seen: unknown[] = [];
    const client = createShogiAiWorkerClient({
      onNnueWeightsStatus: (status) => seen.push(status),
    });

    await Promise.resolve();
    expect(seen).toEqual([
      {
        status: 'unavailable',
        attempts: 1,
        elapsedMs: 12,
        bytes: undefined,
        httpStatus: 404,
        errorMessage: 'HTTP 404',
      },
    ]);
    client.terminate();
  });
});

describe('shogiAiWorkerClient diagnostics protocol', () => {
  it('keeps the production game UI off the explicit diagnostic path', () => {
    const gameUi = readFileSync(
      join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'ShogiImproved.tsx'),
      'utf8'
    );
    expect(gameUi).not.toContain('requestEngineDiagnostics');
  });

  it('forwards the worker path, score, and depth', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const client = createShogiAiWorkerClient();
    const worker = currentWorker();

    const pending = client.requestBestMoveWithInfo(position, 'hard', 17);
    const request = bestMoveRequest(worker);
    expect(request).not.toHaveProperty('diagnostics');
    expect(worker.posted).not.toContainEqual(expect.objectContaining({ type: 'engineDiagnostics' }));
    const move = { koma: 1, from: 0x77, to: 0x76, promote: false };
    worker.emit({
      type: 'bestMoveResult',
      id: request.id,
      move,
      scoreCp: -123,
      depth: 8,
      searchPath: 'worker-js',
    });

    await expect(pending).resolves.toEqual({
      move,
      scoreCp: -123,
      depth: 8,
      searchPath: 'worker-js',
    });
    client.terminate();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'future-engine'],
  ])('maps a %s search path to unknown', async (_label, searchPath) => {
    vi.stubGlobal('Worker', WorkerStub);
    const client = createShogiAiWorkerClient();
    const worker = currentWorker();

    const pending = client.requestBestMoveWithInfo(position, 'easy', 0);
    const request = bestMoveRequest(worker);
    worker.emit({
      type: 'bestMoveResult',
      id: request.id,
      move: null,
      searchPath,
    });

    await expect(pending).resolves.toEqual({
      move: null,
      scoreCp: undefined,
      depth: undefined,
      searchPath: 'unknown',
    });
    client.terminate();
  });

  it('returns separate measured identity and load-state diagnostics', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const client = createShogiAiWorkerClient();
    const worker = currentWorker();

    const pending = client.requestEngineDiagnostics();
    const request = worker.posted.find((message) => (message as PostedRequest).type === 'engineDiagnostics') as
      PostedRequest | undefined;
    expect(request?.id).toEqual(expect.any(Number));
    expect(Object.keys(request!).sort()).toEqual(['id', 'type']);
    const diagnostics = {
      schema: 'shogi-ai-engine-diagnostics-v1',
      nnue: {
        fetchStatus: 'loaded',
        fetchedWeights: { bytes: 17, sha256: 'a'.repeat(64) },
        loaded: true,
        enabled: true,
      },
      wasm: {
        ready: true,
        embedded: { bytes: 35_597, sha256: 'b'.repeat(64) },
      },
      lastSearch: {
        requestId: 41,
        searchPath: 'wasm',
        evaluationPath: 'nnue-wasm',
      },
    };
    worker.emit({
      type: 'engineDiagnosticsResult',
      id: request!.id,
      diagnostics,
    });

    await expect(pending).resolves.toEqual(diagnostics);
    client.terminate();
  });

  it.each([
    [
      'pending fetch with a retained identity',
      {
        fetchStatus: 'pending',
        fetchedWeights: { bytes: 17, sha256: 'a'.repeat(64) },
        loaded: false,
        enabled: false,
      },
    ],
    [
      'rejected fetch with a retained identity',
      {
        fetchStatus: 'rejected',
        fetchedWeights: { bytes: 17, sha256: 'a'.repeat(64) },
        loaded: false,
        enabled: false,
      },
    ],
    [
      'unavailable fetch with a retained identity',
      {
        fetchStatus: 'unavailable',
        fetchedWeights: { bytes: 17, sha256: 'a'.repeat(64) },
        loaded: false,
        enabled: false,
      },
    ],
    [
      'loaded fetch without a retained identity',
      {
        fetchStatus: 'loaded',
        fetchedWeights: null,
        loaded: true,
        enabled: false,
      },
    ],
    [
      'pending fetch that claims to be loaded',
      {
        fetchStatus: 'pending',
        fetchedWeights: null,
        loaded: true,
        enabled: false,
      },
    ],
    [
      'rejected fetch that claims to be loaded',
      {
        fetchStatus: 'rejected',
        fetchedWeights: null,
        loaded: true,
        enabled: false,
      },
    ],
    [
      'unavailable fetch that claims to be loaded',
      {
        fetchStatus: 'unavailable',
        fetchedWeights: null,
        loaded: true,
        enabled: false,
      },
    ],
    [
      'loaded fetch that claims not to be loaded',
      {
        fetchStatus: 'loaded',
        fetchedWeights: { bytes: 17, sha256: 'a'.repeat(64) },
        loaded: false,
        enabled: false,
      },
    ],
    [
      'enabled evaluator without loaded weights',
      {
        fetchStatus: 'rejected',
        fetchedWeights: null,
        loaded: false,
        enabled: true,
      },
    ],
  ])('rejects inconsistent NNUE diagnostics: %s', async (_label, nnue) => {
    vi.stubGlobal('Worker', WorkerStub);
    const client = createShogiAiWorkerClient();
    const worker = currentWorker();

    const pending = client.requestEngineDiagnostics();
    const request = worker.posted.find((message) => (message as PostedRequest).type === 'engineDiagnostics') as
      PostedRequest | undefined;
    worker.emit({
      type: 'engineDiagnosticsResult',
      id: request!.id,
      diagnostics: {
        schema: 'shogi-ai-engine-diagnostics-v1',
        nnue,
        wasm: {
          ready: true,
          embedded: { bytes: 35_597, sha256: 'b'.repeat(64) },
        },
        lastSearch: null,
      },
    });

    await expect(pending).rejects.toThrow('Invalid AI engine diagnostics NNUE state');
    client.terminate();
  });

  it('rejects a timed-out request even when the recovery Worker cannot be constructed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { hardwareConcurrency: 1 });
    vi.stubGlobal('Worker', WorkerStub);
    WorkerStub.failConstructionAfter = 1;
    const client = createShogiAiWorkerClient();

    const pending = client.requestBestMoveWithInfo(position, 'easy', 0);
    const rejection = expect(pending).rejects.toThrow('AI worker timed out');
    // easy's 4s search deadline plus the startup allowance every never-yet-heard-from
    // instance gets (see WORKER_STARTUP_GRACE_MS).
    await vi.advanceTimersByTimeAsync(14_000);

    await rejection;
    expect(WorkerStub.instances).toHaveLength(1);
    await expect(client.requestBestMoveWithInfo(position, 'easy', 1)).rejects.toThrow('AI worker unavailable');
    client.terminate();
  });

  /**
   * A brand-new Worker still has to download its module bundle and instantiate
   * the WASM engine, and whichever request arrives first pays for all of it.
   * Measured on production 2026-08-25: the same master request answered in
   * ~5.05s on a warm instance and 7.61s on a cold page load — 2.5s of startup
   * charged to a deadline whose search alone is budgeted 5s. Killing a worker
   * that is merely still booting demotes the move to the (much weaker)
   * main-thread engine, so startup gets its own allowance and only a proven
   * instance is held to the bare search deadline.
   */
  it('gives a never-yet-heard-from worker a startup allowance, and drops it once the worker answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { hardwareConcurrency: 1 });
    vi.stubGlobal('Worker', WorkerStub);
    const client = createShogiAiWorkerClient();
    const worker = currentWorker();

    // Cold: still pending well past the bare 4s easy deadline.
    let settled = false;
    const cold = client.requestBestMoveWithInfo(position, 'easy', 0).then(
      () => { settled = true; },
      () => { settled = true; }
    );
    await vi.advanceTimersByTimeAsync(4_500);
    expect(settled).toBe(false);

    worker.emit({ type: 'bestMoveResult', id: bestMoveRequest(worker).id, move: null, searchPath: 'wasm' });
    await cold;
    expect(settled).toBe(true);

    // Warm: the instance has spoken, so the bare deadline applies again.
    const warm = client.requestBestMoveWithInfo(position, 'easy', 1);
    const warmRejection = expect(warm).rejects.toThrow('AI worker timed out');
    await vi.advanceTimersByTimeAsync(4_000);
    await warmRejection;

    client.terminate();
  });
});
