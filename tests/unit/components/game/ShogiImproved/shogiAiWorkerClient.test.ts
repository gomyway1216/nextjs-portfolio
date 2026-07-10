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
    | PostedRequest
    | undefined;
  expect(request?.id).toEqual(expect.any(Number));
  return request as Required<Pick<PostedRequest, 'id' | 'type'>>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  WorkerStub.instances = [];
  WorkerStub.failConstructionAfter = Number.POSITIVE_INFINITY;
});

describe('shogiAiWorkerClient diagnostics protocol', () => {
  it('forwards the worker path, score, and depth', async () => {
    vi.stubGlobal('Worker', WorkerStub);
    const client = createShogiAiWorkerClient();
    const worker = currentWorker();

    const pending = client.requestBestMoveWithInfo(position, 'hard', 17);
    const request = bestMoveRequest(worker);
    const move = { koma: 1, from: 0x77, to: 0x76, promote: false };
    worker.emit({
      type: 'bestMoveResult',
      id: request.id,
      move,
      scoreCp: -123,
      depth: 8,
      searchPath: 'worker-js',
    });

    await expect(pending).resolves.toEqual({ move, scoreCp: -123, depth: 8, searchPath: 'worker-js' });
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
    worker.emit({ type: 'bestMoveResult', id: request.id, move: null, searchPath });

    await expect(pending).resolves.toEqual({
      move: null,
      scoreCp: undefined,
      depth: undefined,
      searchPath: 'unknown',
    });
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
    await vi.advanceTimersByTimeAsync(4_000);

    await rejection;
    expect(WorkerStub.instances).toHaveLength(1);
    await expect(client.requestBestMoveWithInfo(position, 'easy', 1)).rejects.toThrow('AI worker unavailable');
    client.terminate();
  });
});
