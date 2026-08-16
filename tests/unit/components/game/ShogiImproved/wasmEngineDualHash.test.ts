import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { SharedTT, createSharedTTBuffer } from '@/components/game/ShogiImproved/sharedTT';
import {
  clearWasmTT,
  enableSharedTT,
  getLastWasmSearchStats,
  isNnueEnabled,
  isSharedTTEnabled,
  loadNnueWeights,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';
import { positionFromSfen } from '../../../../../ml/shogi-sfen';

const COLLISION_A =
  '1nk1s2n1/l1rs1+P3/+Pgp5N/1P1pp1ppl/p4P3/1GPPS+bP1p/B3P2P1/L3GG3/1NK1RS2L b 2P 89';
const COLLISION_B =
  '1sk3s1l/2g2r+B2/l1n1pp1+B1/p1p3p2/3p3np/PpP4P1/2NPPPP1P/R2SGG1S1/L4K1NL w GPp 56';
const USED_DEPTH_4 = (1 << 30) | (4 << 2);

function moveIdentity(move: {
  koma: number;
  from: number;
  to: number;
  promote: boolean;
}) {
  return {
    koma: move.koma,
    from: move.from,
    to: move.to,
    promote: move.promote,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wasmEngine dual-hash host integration', () => {
  it('preserves legal single-thread search while shared TT is disabled', () => {
    const position = InitialPositionImproved.createInitialPosition();
    clearWasmTT();
    const move = wasmSearchBestMove(position, 0, 0, 3, 4);
    expect(move).not.toBeNull();
    expect(
      GenerateMovesImproved.generateLegalMoves(position).some(
        (legal) =>
          legal.koma === move!.koma &&
          legal.from === move!.from &&
          legal.to === move!.to &&
          legal.promote === move!.promote,
      ),
    ).toBe(true);
  });

  it('keeps the final host legality guard fail-closed', () => {
    const position = InitialPositionImproved.createInitialPosition();
    vi.spyOn(GenerateMovesImproved, 'generateLegalMoves').mockReturnValue([]);
    expect(wasmSearchBestMove(position, 0, 0, 2, 3)).toBeNull();
  });

  it(
    'uses the pair-aware shared ABI and isolates the reproduced primary collision',
    () => {
      const sab = createSharedTTBuffer();
      expect(sab).not.toBeNull();
      expect(enableSharedTT(sab!, 'main')).toBe(true);
      expect(isSharedTTEnabled()).toBe(true);

      const a = positionFromSfen(COLLISION_A).position;
      const b = positionFromSfen(COLLISION_B).position;
      expect(a.HashVal).toBe(b.HashVal);

      clearWasmTT();
      expect(wasmSearchBestMove(a, 88, 0, 5, 8)).not.toBeNull();
      const afterA = wasmSearchBestMove(b, 55, 0, 5, 8);
      const afterAStats = getLastWasmSearchStats();

      clearWasmTT();
      const cleanB = wasmSearchBestMove(b, 55, 0, 5, 8);
      const cleanBStats = getLastWasmSearchStats();

      expect(afterA).not.toBeNull();
      expect(cleanB).not.toBeNull();
      expect(moveIdentity(afterA!)).toEqual(moveIdentity(cleanB!));
      expect(afterAStats).toMatchObject({
        score: cleanBStats?.score,
        depth: cleanBStats?.depth,
      });
      expect(
        GenerateMovesImproved.generateLegalMoves(b).some(
          (legal) =>
            legal.koma === afterA!.koma &&
            legal.from === afterA!.from &&
            legal.to === afterA!.to &&
            legal.promote === afterA!.promote,
        ),
      ).toBe(true);
    },
    30_000,
  );

  it('keeps helper clears private and lets the main role clear the shared pair table', () => {
    const sab = createSharedTTBuffer();
    expect(sab).not.toBeNull();
    const table = new SharedTT(sab!);
    const scratch = new Int32Array(4);

    expect(enableSharedTT(sab!, 'helper')).toBe(true);
    table.store(101, 202, 303, USED_DEPTH_4, 404);
    clearWasmTT();
    expect(table.probe(101, 202, scratch)).toBe(1);

    expect(enableSharedTT(sab!, 'main')).toBe(true);
    clearWasmTT();
    expect(table.probe(101, 202, scratch)).toBe(0);
  });

  it('clears shared scores on a main NNUE/V3 switch but not on the helper switch', () => {
    const weights = readFileSync(join(process.cwd(), 'public/shogi-halfkp64-rki16-weights.bin'));
    expect(loadNnueWeights(weights, 1)).toBe(true);
    const initialEval = isNnueEnabled();
    const sab = createSharedTTBuffer();
    expect(sab).not.toBeNull();
    const table = new SharedTT(sab!);
    const scratch = new Int32Array(4);

    expect(enableSharedTT(sab!, 'main')).toBe(true);
    table.store(505, 606, 707, USED_DEPTH_4, 808);
    expect(setWasmNnueEnabled(!initialEval)).toBe(!initialEval);
    expect(table.probe(505, 606, scratch)).toBe(0);

    expect(enableSharedTT(sab!, 'helper')).toBe(true);
    table.store(505, 606, 909, USED_DEPTH_4, 1001);
    expect(setWasmNnueEnabled(initialEval)).toBe(initialEval);
    expect(table.probe(505, 606, scratch)).toBe(1);
    expect(scratch[0]).toBe(909);
  });
});
