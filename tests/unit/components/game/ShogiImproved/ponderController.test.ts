import { describe, expect, it, vi } from 'vitest';
import {
  PonderController,
  type PonderEndReason,
} from '@/components/game/ShogiImproved/ponderController';

/**
 * Deterministic harness: a manual scheduler queue stands in for setTimeout(0),
 * and a fake clock advances exactly by each slice's budget. Draining the queue
 * one callback at a time mirrors the worker's event loop — messages arriving
 * "between slices" are simulated by calling stop()/suspend() between drains.
 */
function makeHarness(opts: { sliceMs: number; maxTotalMs: number }) {
  const queue: Array<() => void> = [];
  let time = 0;
  const ends: Array<{ reason: PonderEndReason; spentMs: number }> = [];

  const slices: number[] = [];
  const searchSlice = vi.fn((sliceMs: number) => {
    slices.push(sliceMs);
    time += sliceMs; // pretend the synchronous search consumed its budget
    return true;
  });

  const controller = new PonderController({
    sliceMs: opts.sliceMs,
    maxTotalMs: opts.maxTotalMs,
    now: () => time,
    schedule: (fn) => queue.push(fn),
    onSessionEnd: (reason, spentMs) => ends.push({ reason, spentMs }),
  });

  /** Run queued callbacks until the queue stays empty (or `maxSteps`). */
  const drain = (maxSteps = 1000) => {
    let steps = 0;
    while (queue.length > 0 && steps < maxSteps) {
      queue.shift()!();
      steps++;
    }
    return steps;
  };

  /** Run exactly one queued callback (one slice), like one event-loop turn. */
  const step = () => {
    const fn = queue.shift();
    if (fn) fn();
  };

  return { controller, searchSlice, slices, drain, step, queue, ends };
}

describe('PonderController', () => {
  it('runs slices until the total budget is exhausted', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 1000 });
    h.controller.start(h.searchSlice);
    h.drain();

    expect(h.searchSlice).toHaveBeenCalledTimes(5); // 5 x 200ms = 1000ms
    expect(h.controller.isPondering()).toBe(false);
    expect(h.ends).toEqual([{ reason: 'budgetExhausted', spentMs: 1000 }]);
  });

  it('clamps the final slice to the remaining budget', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 500 });
    h.controller.start(h.searchSlice);
    h.drain();

    expect(h.slices).toEqual([200, 200, 100]);
  });

  it('stop() between slices halts the loop (message-interrupt scenario)', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 30_000 });
    h.controller.start(h.searchSlice);

    h.step(); // slice 1
    h.step(); // slice 2
    expect(h.searchSlice).toHaveBeenCalledTimes(2);

    // A bestMove/clearTT message arrives: the worker calls stop() before the
    // queued slice callback runs.
    h.controller.stop();
    h.drain();

    expect(h.searchSlice).toHaveBeenCalledTimes(2);
    expect(h.controller.isPondering()).toBe(false);
    expect(h.ends).toEqual([{ reason: 'stopped', spentMs: 400 }]);
  });

  it('searchSlice returning false ends the session (no legal moves)', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 30_000 });
    const noMoves = vi.fn(() => false);
    h.controller.start(noMoves);
    h.drain();

    expect(noMoves).toHaveBeenCalledTimes(1);
    expect(h.ends.map((e) => e.reason)).toEqual(['searchEnded']);
  });

  it('a throwing searchSlice ends the session instead of propagating', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 30_000 });
    const boom = vi.fn(() => {
      throw new Error('wasm trap');
    });
    h.controller.start(boom);
    expect(() => h.drain()).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(h.ends.map((e) => e.reason)).toEqual(['searchEnded']);
  });

  it('suspend() pauses and resume() continues with the remaining budget', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 600 });
    h.controller.start(h.searchSlice);

    h.step(); // slice 1 (200ms spent)
    h.controller.suspend();
    h.drain();
    expect(h.searchSlice).toHaveBeenCalledTimes(1);
    expect(h.controller.isPondering()).toBe(false);

    h.controller.resume();
    expect(h.controller.isPondering()).toBe(true);
    h.drain();

    expect(h.searchSlice).toHaveBeenCalledTimes(3); // 200 + 200 + 200 = 600
    expect(h.ends).toEqual([{ reason: 'budgetExhausted', spentMs: 600 }]);
  });

  it('rapid suspend/resume never doubles the slice chain', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 1000 });
    h.controller.start(h.searchSlice);
    h.step(); // slice 1; next slice queued

    h.controller.suspend();
    h.controller.resume(); // re-queues; the pre-suspend callback must be dead

    h.drain();
    // 1000ms total at 200ms each = 5 slices; a doubled chain would exceed this.
    expect(h.searchSlice).toHaveBeenCalledTimes(5);
  });

  it('start() while suspended arms the session; it only runs after resume()', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 400 });
    h.controller.suspend();
    h.controller.start(h.searchSlice);
    h.drain();
    expect(h.searchSlice).not.toHaveBeenCalled();

    h.controller.resume();
    h.drain();
    expect(h.searchSlice).toHaveBeenCalledTimes(2);
  });

  it('start() replaces a previous session and its queued slices', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 1000 });
    const first = vi.fn(() => true);
    h.controller.start(first);
    h.step(); // one slice of the first session

    h.controller.start(h.searchSlice); // new bestMove answered -> new session
    h.drain();

    expect(first).toHaveBeenCalledTimes(1);
    expect(h.searchSlice).toHaveBeenCalledTimes(5); // fresh 1000ms budget
    expect(h.ends.map((e) => e.reason)).toEqual(['stopped', 'budgetExhausted']);
  });

  it('resume() without a session is a no-op', () => {
    const h = makeHarness({ sliceMs: 200, maxTotalMs: 1000 });
    h.controller.suspend();
    h.controller.resume();
    h.controller.resume();
    h.drain();
    expect(h.searchSlice).not.toHaveBeenCalled();
    expect(h.controller.isPondering()).toBe(false);
  });
});
