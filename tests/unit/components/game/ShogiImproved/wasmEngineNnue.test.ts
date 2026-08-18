/**
 * Unit tests for the NNUE weight-loading API of wasmEngine.ts.
 *
 * Uses the REAL active weight file (public/shogi-halfkp81-production-weights.bin) and the
 * real WASM engine, so these tests also pin the deployed asset to the exact
 * size the engine requires. Test order matters: the module-scope loaded/
 * enabled state starts pristine in this file, so the "not loaded yet" paths
 * run first.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import {
  FU,
  GI,
  HI,
  KA,
  KE,
  KI,
  KY,
  SENTE,
  Te,
  getKomashu,
} from '@/components/game/ShogiImproved/types';
import {
  clearWasmTT,
  isNnueEnabled,
  isNnueWeightsLoaded,
  loadNnueWeights,
  NNUE_WEIGHTS_BYTES,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

const weightsPath = join(process.cwd(), 'public', 'shogi-halfkp81-production-weights.bin');
const HALFKP81_PRODUCTION_SHA256 = 'e04e60c7962ae89528ca384f2055866b01dd3c47f870c2eb1f21bcdf985a1e72';
const DROP_LETTER: Readonly<Record<string, number>> = {
  P: FU,
  L: KY,
  N: KE,
  S: GI,
  G: KI,
  B: KA,
  R: HI,
};

// Position immediately before move 32 in the reported rook-pawn loop game.
// The original bug: a regressed evaluator kept re-dropping P*8f and shuffled
// the rook into a repetition draw. The guarded property is loop-freedom, not
// any particular single move: the 2026-08 newdata weights pick P*8f once at
// fixed depth 11 (a depth-parity blip; depths 10/12/13 pick other moves) but
// were verified to break out of the cycle instead of repeating it.
const ROOK_PAWN_LOOP_PREFIX = [
  '2g2f', '8c8d', '2f2e', '8d8e', '6i7h', '4a3b', '2e2d', '2c2d', '2h2d', 'P*2c',
  '2d2h', '8e8f', '8g8f', '8b8f', 'P*8g', '8f8d', '3i3h', '3c3d', '5i6h', 'P*8f',
  '8g8f', '8d8f', 'P*8g', '8f8d', '3h2g', 'P*8f', '8g8f', '8d8f', 'P*8g', '8f8e',
  '2g2f',
] as const;

function readWeights(): Uint8Array {
  const buf = readFileSync(weightsPath);
  // Copy out of the (possibly pooled) Buffer into a plain Uint8Array.
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return bytes;
}

function usiSquare(file: string, rank: string): number {
  return ((file.charCodeAt(0) - 48) << 4) + (rank.charCodeAt(0) - 96);
}

function findUsiMove(usi: string, legal: Te[]): Te {
  if (usi[1] === '*') {
    const to = usiSquare(usi[2], usi[3]);
    const piece = DROP_LETTER[usi[0]] ?? -1;
    const match = legal.find((move) => move.from === 0 && move.to === to && getKomashu(move.koma) === piece);
    if (!match) throw new Error(`illegal test drop: ${usi}`);
    return match;
  }

  const from = usiSquare(usi[0], usi[1]);
  const to = usiSquare(usi[2], usi[3]);
  const promote = usi.endsWith('+');
  const match = legal.find((move) => move.from === from && move.to === to && move.promote === promote);
  if (!match) throw new Error(`illegal test move: ${usi}`);
  return match;
}

/** Position identity for repetition counting: board cells + hands + side to move. */
function positionKey(position: ReturnType<typeof InitialPositionImproved.createInitialPosition>): string {
  const cells: number[] = [];
  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++) {
      cells.push(position.get((file << 4) + rank));
    }
  }
  return `${cells.join(',')}|h:${position.hand.join(',')}|t:${position.teban}`;
}

describe('wasmEngine NNUE loading', () => {
  it.each([
    ['P', FU],
    ['L', KY],
    ['N', KE],
    ['S', GI],
    ['G', KI],
    ['B', KA],
    ['R', HI],
  ] as const)('parses a %s drop in USI test positions', (letter, piece) => {
    const move = new Te(SENTE + piece, 0, usiSquare('5', 'e'));

    expect(findUsiMove(`${letter}*5e`, [move])).toBe(move);
  });

  it('ships a weight asset of exactly the size the engine expects', () => {
    expect(readFileSync(weightsPath).byteLength).toBe(NNUE_WEIGHTS_BYTES);
  });

  it('pins the production asset to the restored HalfKP81 weights', () => {
    const digest = createHash('sha256').update(readFileSync(weightsPath)).digest('hex');
    expect(digest).toBe(HALFKP81_PRODUCTION_SHA256);
  });

  it('cannot be enabled before weights are loaded (stays on V3)', () => {
    expect(isNnueWeightsLoaded()).toBe(false);
    expect(setWasmNnueEnabled(true)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
  });

  it('rejects weights with a wrong byte size', () => {
    expect(loadNnueWeights(new Uint8Array(1), 1)).toBe(false);
    expect(loadNnueWeights(new Uint8Array(23_665_376), 1)).toBe(false);
    expect(loadNnueWeights(new Uint8Array(0), 600)).toBe(false);
    expect(isNnueWeightsLoaded()).toBe(false);
  });

  it('rejects an invalid sigmoid scale K', () => {
    const bytes = readWeights();
    expect(loadNnueWeights(bytes, 0)).toBe(false);
    expect(loadNnueWeights(bytes, -5)).toBe(false);
    expect(loadNnueWeights(bytes, Number.NaN)).toBe(false);
    expect(isNnueWeightsLoaded()).toBe(false);
  });

  it('loads the restored HalfKP81 production weights', () => {
    expect(loadNnueWeights(readWeights(), 600)).toBe(true);
    expect(isNnueWeightsLoaded()).toBe(true);
    // Loading alone must not flip the evaluation.
    expect(isNnueEnabled()).toBe(false);
  });

  it('enables NNUE after loading and searches a legal move with it', () => {
    expect(setWasmNnueEnabled(true)).toBe(true);
    expect(isNnueEnabled()).toBe(true);

    const k = InitialPositionImproved.createInitialPosition();
    const te = wasmSearchBestMove(k, 0, 200, 32, 8);
    expect(te).not.toBeNull();
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    expect(
      legal.some((m) => m.koma === te!.koma && m.from === te!.from && m.to === te!.to && m.promote === te!.promote)
    ).toBe(true);
  });

  it(
    'does not fall into the rook-pawn repetition loop at fixed depth 11',
    () => {
      expect(loadNnueWeights(readWeights(), 600)).toBe(true);
      expect(setWasmNnueEnabled(true)).toBe(true);

      // Replay the real game so sennichite counting matches the rules exactly:
      // same board, hands, and side to move, counted from move 1.
      const keyCounts = new Map<string, number>();
      const position = InitialPositionImproved.createInitialPosition();
      keyCounts.set(positionKey(position), 1);
      for (const usi of ROOK_PAWN_LOOP_PREFIX) {
        const move = findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(position));
        move.capture = position.get(move.to);
        position.move(move);
        position.toggleTeban();
        const key = positionKey(position);
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }

      // Self-play continuation at the fixed depth that historically triggered
      // the loop, with the TT retained within the game like production play.
      clearWasmTT();
      let tesu = ROOK_PAWN_LOOP_PREFIX.length;
      let pawnDrops8f = 0;
      for (let ply = 0; ply < 8; ply++) {
        const move = wasmSearchBestMove(position, tesu, 0, 11, 10);
        expect(move).not.toBeNull();
        if (move!.from === 0 && move!.to === (8 << 4) + 6) pawnDrops8f++;
        move!.capture = position.get(move!.to);
        position.move(move!);
        position.toggleTeban();
        tesu++;
        const key = positionKey(position);
        const count = (keyCounts.get(key) ?? 0) + 1;
        keyCounts.set(key, count);
        // Sennichite (4th occurrence of the same position) must never happen.
        expect(count).toBeLessThan(4);
      }

      // The engine may spend one pawn-drop cycle, but it must not restart it:
      // more than one P*8f in the continuation means the shuttle is back.
      expect(pawnDrops8f).toBeLessThanOrEqual(1);
    },
    // Eight fixed depth-11 searches are intentionally compute-bound and can
    // take much longer on shared CI runners than on a local Apple Silicon
    // machine.
    180_000,
  );

  it('can be switched back to V3', () => {
    expect(setWasmNnueEnabled(false)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
    // Weights stay loaded; re-enabling works without another load.
    expect(setWasmNnueEnabled(true)).toBe(true);
    setWasmNnueEnabled(false);
  });
});
