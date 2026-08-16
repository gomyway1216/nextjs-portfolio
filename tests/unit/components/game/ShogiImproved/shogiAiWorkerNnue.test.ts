/**
 * Worker-level NNUE integration: weights served via a stubbed fetch (the
 * worker fetches /shogi-halfkp64-rki16-weights.bin at startup), then the difficulty
 * gate is exercised through the real message protocol — NNUE for medium+,
 * V3 for easy — against the real WASM engine.
 *
 * Kept separate from the fetch-failure test file: the loaded/enabled state
 * lives at wasmEngine module scope, and vitest isolates modules per file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import { getOpeningMoveImproved } from '@/components/game/ShogiImproved/OpeningBookImproved';

type PostedMessage = {
  type: string;
  id?: number;
  move?: unknown;
  message?: string;
  scoreCp?: number;
  depth?: number;
  searchPath?: string;
};

const posted: PostedMessage[] = [];
const scope = {
  postMessage: (msg: PostedMessage) => posted.push(msg),
  onmessage: null as ((event: { data: unknown }) => void) | null,
};

let nnue: { isNnueWeightsLoaded: () => boolean; isNnueEnabled: () => boolean };

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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic random-play position that is GUARANTEED out of the opening
 * book: after the base 14 plies, keep playing until the book probe misses
 * (bounded), so computeBestMove() cannot short-circuit via the book and the
 * search/NNUE path under test is always exercised.
 */
function outOfBookPosition(): { k: KyokumenImproved; tesu: number } {
  const k = InitialPositionImproved.createInitialPosition();
  const rnd = mulberry32(0x00e1ee);
  let plies = 0;
  const playRandom = () => {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    expect(moves.length).toBeGreaterThan(0);
    const te = moves[Math.floor(rnd() * moves.length)];
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
    plies++;
  };
  for (let i = 0; i < 14; i++) playRandom();
  while (getOpeningMoveImproved(k, 'medium') !== null && plies < 60) playRandom();
  expect(getOpeningMoveImproved(k, 'medium')).toBeNull();
  return { k, tesu: plies };
}

function expectLegalMove(id: number, k: KyokumenImproved): PostedMessage {
  const res = posted.find((m) => m.type === 'bestMoveResult' && m.id === id);
  expect(res).toBeDefined();
  const move = res!.move as { koma: number; from: number; to: number; promote: boolean };
  expect(move).not.toBeNull();
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  expect(
    legal.some((m) => m.koma === move.koma && m.from === move.from && m.to === move.to && m.promote === move.promote)
  ).toBe(true);
  return res!;
}

beforeAll(async () => {
  const weights = readFileSync(join(process.cwd(), 'public', 'shogi-halfkp64-rki16-weights.bin'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      // The worker also fetches the external opening book at startup; answer 404 so this
      // test keeps exercising the curated-book + NNUE path in isolation.
      if (String(url) === '/shogi-opening-book-v2.bin') return { ok: false, status: 404 };
      expect(String(url)).toBe('/shogi-halfkp64-rki16-weights.bin');
      return {
        ok: true,
        arrayBuffer: async () => weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
      };
    })
  );
  (globalThis as Record<string, unknown>).self = scope;

  const worker = await import('@/components/game/ShogiImproved/shogi-ai.worker');
  void worker; // imported for its side effects (installs onmessage, starts the weights fetch)
  nnue = await import('@/components/game/ShogiImproved/wasmEngine');

  // The startup fetch is async; wait for the load to land.
  for (let i = 0; i < 100 && !nnue.isNnueWeightsLoaded(); i++) await sleep(20);
  expect(nnue.isNnueWeightsLoaded()).toBe(true);
}, 15_000);

afterAll(() => {
  send({ type: 'clearTT' }); // stop any ponder loop
  delete (globalThis as Record<string, unknown>).self;
  vi.unstubAllGlobals();
});

describe('shogi-ai.worker NNUE difficulty gate', () => {
  it('uses NNUE for medium (>= 1000ms) searches', () => {
    const { k, tesu } = outOfBookPosition();
    send({ type: 'bestMove', id: 101, position: serialize(k), difficulty: 'medium', tesu });
    const res = expectLegalMove(101, k);
    expect(res.searchPath).toBe('wasm');
    expect(res.scoreCp).toEqual(expect.any(Number));
    expect(res.depth).toBeGreaterThan(0);
    expect(nnue.isNnueEnabled()).toBe(true);
  }, 15_000);

  it('keeps easy on the V3 evaluation', () => {
    const { k, tesu } = outOfBookPosition();
    send({ type: 'bestMove', id: 102, position: serialize(k), difficulty: 'easy', tesu });
    const res = expectLegalMove(102, k);
    expect(res.searchPath).toBe('wasm');
    expect(res.scoreCp).toEqual(expect.any(Number));
    expect(res.depth).toBeGreaterThan(0);
    expect(nnue.isNnueEnabled()).toBe(false);
  }, 15_000);

  it.each(['hard', 'expert', 'master'] as const)(
    'uses NNUE for %s (re-enabled 2026-07-06 after the cycle-3 saturation fix)',
    (difficulty) => {
      const { k, tesu } = outOfBookPosition();
      const id = { hard: 105, expert: 106, master: 107 }[difficulty];
      send({ type: 'bestMove', id, position: serialize(k), difficulty, tesu });
      const res = expectLegalMove(id, k);
      expect(res.searchPath).toBe('wasm');
      expect(res.scoreCp).toEqual(expect.any(Number));
      expect(res.depth).toBeGreaterThan(0);
      expect(nnue.isNnueEnabled()).toBe(true);
    },
    15_000
  );

  it('keeps the NNUE setting across a new game (clearTT)', () => {
    const { k, tesu } = outOfBookPosition();
    send({ type: 'bestMove', id: 103, position: serialize(k), difficulty: 'medium', tesu });
    const first = expectLegalMove(103, k);
    expect(first.searchPath).toBe('wasm');
    expect(first.scoreCp).toEqual(expect.any(Number));
    expect(first.depth).toBeGreaterThan(0);
    expect(nnue.isNnueEnabled()).toBe(true);

    send({ type: 'clearTT' });
    expect(nnue.isNnueWeightsLoaded()).toBe(true);

    send({ type: 'bestMove', id: 104, position: serialize(k), difficulty: 'medium', tesu });
    const second = expectLegalMove(104, k);
    expect(second.searchPath).toBe('wasm');
    expect(second.scoreCp).toEqual(expect.any(Number));
    expect(second.depth).toBeGreaterThan(0);
    expect(nnue.isNnueEnabled()).toBe(true);
  }, 30_000);
});
