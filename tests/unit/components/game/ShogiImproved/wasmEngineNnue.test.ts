/**
 * Unit tests for the NNUE weight-loading API of wasmEngine.ts.
 *
 * Uses the REAL active weight file (public/shogi-halfkp64-rki16-weights.bin) and the
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
  getLastWasmSearchStats,
  isNnueEnabled,
  isNnueWeightsLoaded,
  loadNnueWeights,
  NNUE_WEIGHTS_BYTES,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

const weightsPath = join(process.cwd(), 'public', 'shogi-halfkp64-rki16-weights.bin');
const HALFKP64_RKI16_EPOCH2_SHA256 = '43138cfa7a0d9317d612f518404f78224c0992b588e3d4e09afe32a6d1c627fb';
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
// With the regressed deep16 weights, fixed-depth 11 chooses P*8f. The known-
// good runOp1 weights choose 3a4b instead.
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

function rookPawnLoopPosition() {
  const position = InitialPositionImproved.createInitialPosition();
  for (const usi of ROOK_PAWN_LOOP_PREFIX) {
    const move = findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(position));
    move.capture = position.get(move.to);
    position.move(move);
    position.toggleTeban();
  }
  return position;
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

  it('pins the production asset to the forced HalfKP64-RKI16 epoch2 weights', () => {
    const digest = createHash('sha256').update(readFileSync(weightsPath)).digest('hex');
    expect(digest).toBe(HALFKP64_RKI16_EPOCH2_SHA256);
  });

  it('cannot be enabled before weights are loaded (stays on V3)', () => {
    expect(isNnueWeightsLoaded()).toBe(false);
    expect(setWasmNnueEnabled(true)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
  });

  it('rejects weights with a wrong byte size', () => {
    expect(loadNnueWeights(new Uint8Array(1), 1)).toBe(false);
    expect(loadNnueWeights(new Uint8Array(94_656_708), 1)).toBe(false);
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

  it('loads the real HalfKP64-RKI16 epoch2 weights', () => {
    expect(loadNnueWeights(readWeights(), 1)).toBe(true);
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
    'does not choose the third P*8f repetition at fixed depth 11',
    () => {
      expect(loadNnueWeights(readWeights(), 1)).toBe(true);
      expect(setWasmNnueEnabled(true)).toBe(true);
      const position = rookPawnLoopPosition();
      clearWasmTT();

      const move = wasmSearchBestMove(position, ROOK_PAWN_LOOP_PREFIX.length, 0, 11, 10);
      const stats = getLastWasmSearchStats();

      expect(move).not.toBeNull();
      expect(stats?.depth).toBe(11);
      // Preserve the actual regression contract without pinning a different
      // evaluator architecture to the former model's exact 3a4b choice.
      const repeatsPawnDrop = move!.from === 0 && move!.to === (8 << 4) + 6;
      expect(repeatsPawnDrop).toBe(false);
    },
    // The fixed depth-11 search is intentionally compute-bound and can take
    // longer on shared CI runners than on a local Apple Silicon machine.
    60_000,
  );

  it('can be switched back to V3', () => {
    expect(setWasmNnueEnabled(false)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
    // Weights stay loaded; re-enabling works without another load.
    expect(setWasmNnueEnabled(true)).toBe(true);
    setWasmNnueEnabled(false);
  });
});
