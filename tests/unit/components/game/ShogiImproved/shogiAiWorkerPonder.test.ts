/**
 * Integration test for the worker's ponder behavior, driven through the real
 * message protocol. The Worker global scope is simulated by installing a
 * `self` stub before importing the worker module (its onmessage/postMessage
 * plumbing works unchanged under node).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';

type PostedMessage = { type: string; id?: number; move?: unknown; message?: string };

type WorkerScopeStub = {
  postMessage: (msg: PostedMessage) => void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

const posted: PostedMessage[] = [];
const scope: WorkerScopeStub = {
  postMessage: (msg) => posted.push(msg),
  onmessage: null,
};

let ponder: { isPondering: () => boolean; getSpentMs: () => number };

function serialize(k: KyokumenImproved) {
  const board: number[] = new Array(81);
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      board[idx++] = k.ban[(suji << 4) + dan];
    }
  }
  return { board, hand: [...k.hand], teban: k.teban };
}

function send(msg: unknown): void {
  expect(scope.onmessage).toBeTypeOf('function');
  scope.onmessage!({ data: msg });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  (globalThis as Record<string, unknown>).self = scope;
  const worker = await import('@/components/game/ShogiImproved/shogi-ai.worker');
  ponder = worker.__ponderControllerForTests;
});

afterAll(() => {
  // Stop any remaining ponder loop so no timers outlive the test file.
  send({ type: 'clearTT' });
  delete (globalThis as Record<string, unknown>).self;
});

describe('shogi-ai.worker pondering', () => {
  it('does not ponder on easy', () => {
    const k = InitialPositionImproved.createInitialPosition();
    send({ type: 'bestMove', id: 1, position: serialize(k), difficulty: 'easy', tesu: 0 });

    const res = posted.find((m) => m.type === 'bestMoveResult' && m.id === 1);
    expect(res).toBeDefined();
    expect(res!.move).not.toBeNull();
    expect(ponder.isPondering()).toBe(false);
  });

  it('starts pondering after a bestMove response and can be interrupted by messages', async () => {
    const k = InitialPositionImproved.createInitialPosition();
    send({ type: 'bestMove', id: 2, position: serialize(k), difficulty: 'medium', tesu: 0 });

    // The response is synchronous; pondering must be armed right after it.
    const res = posted.find((m) => m.type === 'bestMoveResult' && m.id === 2);
    expect(res).toBeDefined();
    expect(res!.move).not.toBeNull();
    expect(ponder.isPondering()).toBe(true);

    // Let a couple of 200ms slices run on the real (wasm) engine; the loop
    // must yield between slices so this async wait gets scheduler time.
    await sleep(550);
    expect(ponder.getSpentMs()).toBeGreaterThan(0);

    // visibilitychange relay: suspend pauses, resume continues.
    send({ type: 'ponderControl', action: 'suspend' });
    expect(ponder.isPondering()).toBe(false);
    send({ type: 'ponderControl', action: 'resume' });
    expect(ponder.isPondering()).toBe(true);

    // A new game (clearTT) stops pondering entirely.
    send({ type: 'clearTT' });
    expect(ponder.isPondering()).toBe(false);
  }, 15_000);
});
