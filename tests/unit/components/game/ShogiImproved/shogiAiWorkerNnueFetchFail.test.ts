/**
 * Fallback path: when the NNUE weights fetch fails at worker startup, the
 * worker must keep answering moves on the V3 evaluation exactly as before
 * (requirement: fetch failure silently falls back to the current behavior).
 *
 * Separate file from the success-path test on purpose — the loaded/enabled
 * flags live at wasmEngine module scope and vitest isolates modules per file.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';

type PostedMessage = { type: string; id?: number; move?: unknown; message?: string };

const posted: PostedMessage[] = [];
const scope = {
  postMessage: (msg: PostedMessage) => posted.push(msg),
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

let nnue: { isNnueWeightsLoaded: () => boolean; isNnueEnabled: () => boolean };
let fetchMock: ReturnType<typeof vi.fn>;

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
  fetchMock = vi.fn(async () => {
    throw new TypeError('network down (test)');
  });
  vi.stubGlobal('fetch', fetchMock);
  (globalThis as Record<string, unknown>).self = scope;

  await import('@/components/game/ShogiImproved/shogi-ai.worker');
  nnue = await import('@/components/game/ShogiImproved/wasmEngine');

  // Give the (rejected) startup fetch time to settle.
  for (let i = 0; i < 50 && fetchMock.mock.calls.length === 0; i++) await sleep(10);
  await sleep(20);
});

afterAll(() => {
  send({ type: 'clearTT' }); // stop any ponder loop
  delete (globalThis as Record<string, unknown>).self;
  vi.unstubAllGlobals();
});

describe('shogi-ai.worker NNUE fetch failure', () => {
  it('attempted the weights fetch at startup', () => {
    expect(fetchMock).toHaveBeenCalledWith('/shogi-nnue-weights.bin');
  });

  it('still answers a medium bestMove on the V3 path', () => {
    const k = InitialPositionImproved.createInitialPosition();
    send({ type: 'bestMove', id: 201, position: serialize(k), difficulty: 'medium', tesu: 0 });

    const res = posted.find((m) => m.type === 'bestMoveResult' && m.id === 201);
    expect(res).toBeDefined();
    const move = res!.move as { koma: number; from: number; to: number; promote: boolean };
    expect(move).not.toBeNull();
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    expect(
      legal.some((m) => m.koma === move.koma && m.from === move.from && m.to === move.to && m.promote === move.promote)
    ).toBe(true);

    // NNUE must never have turned on.
    expect(nnue.isNnueWeightsLoaded()).toBe(false);
    expect(nnue.isNnueEnabled()).toBe(false);
  }, 15_000);
});
