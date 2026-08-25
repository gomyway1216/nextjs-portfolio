/**
 * The NNUE readiness gate in `shogiAiWorkerClient`.
 *
 * A worker that has not yet received its 94.7MB weights still answers a search
 * perfectly happily — on the hand-crafted V3 evaluation, measurably weaker
 * (depth 14 vs 15 on the same position) and completely invisible from the
 * outside. The gate lets the page hold the turn and SAY it is still getting
 * ready instead of playing that move silently.
 *
 * These tests pin the decisions that make the gate safe rather than annoying:
 * easy never waits, any settled fetch (success or failure) releases the wait,
 * and the cap always ends it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_READY_WAIT_MS } from '@/components/game/ShogiImproved/engineReadiness';
import { getShogiImprovedCopy } from '@/components/game/ShogiImproved/i18n';
import { createShogiAiWorkerClient } from '@/components/game/ShogiImproved/shogiAiWorkerClient';

class WorkerStub {
  static instances: WorkerStub[] = [];

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  readonly terminate = vi.fn();

  constructor() {
    WorkerStub.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

function latestWorker(): WorkerStub {
  const worker = WorkerStub.instances[WorkerStub.instances.length - 1];
  expect(worker).toBeDefined();
  return worker!;
}

/** The single unsolicited message the worker sends when weights delivery ends. */
function settleWeights(worker: WorkerStub, status = 'loaded'): void {
  worker.emit({ type: 'nnueWeightsStatus', status, attempts: 1, elapsedMs: 38 });
}

/** Drive the client into its permanent give-up state (respawn cap reached). */
async function stormTheWorker(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    latestWorker().onerror?.({ message: 'boom' } as ErrorEvent);
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  WorkerStub.instances = [];
});

/** Single-thread topology: the SMP helpers are irrelevant to the gate. */
function newClient() {
  vi.stubGlobal('navigator', { hardwareConcurrency: 1 });
  vi.stubGlobal('Worker', WorkerStub);
  return createShogiAiWorkerClient();
}

describe('shogiAiWorkerClient NNUE readiness gate', () => {
  it('never makes an easy search wait: that level does not read the weights', async () => {
    const client = newClient();

    // Nothing has settled, so an NNUE level would be parked right here — and
    // easy still starts immediately. Waiting 12s for a 94.7MB download that
    // level will never read is pure cost.
    expect(client.isEngineReady('master')).toBe(false);
    expect(client.isEngineReady('easy')).toBe(true);
    await expect(client.waitForEngineReady('easy')).resolves.toBe('not-required');

    client.terminate();
  });

  it.each(['medium', 'hard', 'expert', 'master'] as const)(
    'holds a %s search until the weights fetch settles, then releases it',
    async (difficulty) => {
      vi.useFakeTimers();
      const client = newClient();
      const worker = latestWorker();

      expect(client.isEngineReady(difficulty)).toBe(false);
      let outcome: string | null = null;
      void client.waitForEngineReady(difficulty).then((result) => {
        outcome = result;
      });

      // Still parked well into the wait. The wait is a listener plus a timer,
      // so the thread running this is never blocked by it.
      await vi.advanceTimersByTimeAsync(5_000);
      expect(outcome).toBeNull();

      settleWeights(worker);
      await vi.advanceTimersByTimeAsync(0);
      expect(outcome).toBe('ready');

      // Settled once is settled for this instance: later turns start instantly.
      expect(client.isEngineReady(difficulty)).toBe(true);
      await expect(client.waitForEngineReady(difficulty)).resolves.toBe('not-required');

      client.terminate();
    }
  );

  /**
   * 'unavailable' is still a verdict: the worker has exhausted its retries and
   * no amount of further waiting conjures weights, so the turn must go ahead on
   * V3 instead of sitting on the gate for the whole cap.
   */
  it.each(['rejected', 'unavailable'])('releases the wait on a %s fetch too', async (status) => {
    vi.useFakeTimers();
    const client = newClient();

    const pending = client.waitForEngineReady('master');
    settleWeights(latestWorker(), status);
    await expect(pending).resolves.toBe('ready');

    client.terminate();
  });

  /**
   * The cap turns a slow link into the old behaviour (a V3 move) instead of an
   * endless spinner — and it only bites once per session: a link that missed
   * the cap once will miss it again, and re-waiting on every move would cost
   * the player more than the stronger moves it buys.
   */
  it('gives up after the cap and then stops making later turns wait at all', async () => {
    vi.useFakeTimers();
    const client = newClient();

    const pending = client.waitForEngineReady('master');
    await vi.advanceTimersByTimeAsync(ENGINE_READY_WAIT_MS);
    await expect(pending).resolves.toBe('timed-out');

    expect(client.isEngineReady('master')).toBe(true);
    await expect(client.waitForEngineReady('master')).resolves.toBe('not-required');

    client.terminate();
  });

  it('does not give up one tick early', async () => {
    vi.useFakeTimers();
    const client = newClient();

    let outcome: string | null = null;
    void client.waitForEngineReady('master').then((result) => {
      outcome = result;
    });
    await vi.advanceTimersByTimeAsync(ENGINE_READY_WAIT_MS - 1);
    expect(outcome).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe('timed-out');

    client.terminate();
  });

  /**
   * A respawned instance re-fetches (a Cache Storage hit costs ~38ms), so
   * readiness has to go back to unknown with it. Leaving it optimistically true
   * would make the first search on the replacement worker exactly the silent V3
   * move this gate exists to prevent.
   */
  it('re-arms the gate when the worker is torn down and respawned', async () => {
    vi.useFakeTimers();
    const client = newClient();

    settleWeights(latestWorker());
    expect(client.isEngineReady('master')).toBe(true);

    latestWorker().onerror?.({ message: 'boom' } as ErrorEvent);
    await Promise.resolve();
    expect(WorkerStub.instances.length).toBeGreaterThan(1);
    expect(client.isEngineReady('master')).toBe(false);

    // The replacement announces its own outcome and the gate opens again.
    const pending = client.waitForEngineReady('master');
    settleWeights(latestWorker());
    await expect(pending).resolves.toBe('ready');

    client.terminate();
  });

  /**
   * Once the client has permanently given up on the worker there are no weights
   * coming and every request fails fast, so a parked turn must be released at
   * once rather than held for the cap it can no longer benefit from.
   */
  it('releases a parked turn when the client gives up on the worker', async () => {
    vi.useFakeTimers();
    const client = newClient();

    const pending = client.waitForEngineReady('master');
    await stormTheWorker();
    await expect(pending).resolves.toBe('ready');
    expect(client.isEngineReady('master')).toBe(true);

    client.terminate();
  });

  it('releases a parked turn on terminate instead of leaking its timer', async () => {
    vi.useFakeTimers();
    const client = newClient();

    const pending = client.waitForEngineReady('master');
    client.terminate();
    await expect(pending).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  /**
   * One client serves a whole session while the level changes under it (level
   * selector, resuming a save), so the easy exemption cannot be a value fixed
   * when the client was built — it is decided per call, from the level actually
   * being played.
   */
  it('decides the easy exemption per turn, not once per client', async () => {
    vi.useFakeTimers();
    const client = newClient();

    // The session opens on easy: no waiting.
    await expect(client.waitForEngineReady('easy')).resolves.toBe('not-required');
    // The player switches to master on the SAME client and is now gated.
    expect(client.isEngineReady('master')).toBe(false);
    const pending = client.waitForEngineReady('master');
    settleWeights(latestWorker());
    await expect(pending).resolves.toBe('ready');

    client.terminate();
  });
});

/**
 * "Preparing" and 低速互換モード are different states and must never read as the
 * same thing: one means the worker is healthy and the page is responsive, the
 * other means the worker died and the page is about to freeze for seconds.
 */
describe('shogi engine warm-up copy', () => {
  it('offers the preparing line in both languages', () => {
    for (const language of ['ja', 'en'] as const) {
      const line = getShogiImprovedCopy(language).enginePreparing;
      expect(line).toBeTruthy();
      expect(line).not.toContain('低速互換モード');
    }
    expect(getShogiImprovedCopy('ja').enginePreparing).not.toBe(
      getShogiImprovedCopy('en').enginePreparing
    );
  });

  it('shows the warm-up line ahead of the thinking and compatibility lines', () => {
    const gameUi = readFileSync(
      join(process.cwd(), 'src', 'components', 'game', 'ShogiImproved', 'ShogiImproved.tsx'),
      'utf8'
    );
    // Nothing is being searched during the warm-up, so a strip that fell through
    // to 'AIが考えています…' (or worse, the frozen-page compatibility warning)
    // would be describing the wrong state.
    const warmUp = gameUi.indexOf('copy.enginePreparing');
    const compatibility = gameUi.indexOf('低速互換モード：数秒間このページは反応しません');
    expect(warmUp).toBeGreaterThan(-1);
    expect(compatibility).toBeGreaterThan(warmUp);
  });
});
