import { afterEach, describe, expect, it } from 'vitest';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import {
  computeRootPolicyRanks,
  setRootPolicyRankProvider,
} from '@/components/game/ShogiImproved/rootPolicyRank';
import {
  clearWasmTT,
  createWasmRootPolicyRankReceipt,
  getLastWasmRootPolicyRankDiagnostics,
  getLastWasmSearchStats,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

afterEach(() => setRootPolicyRankProvider(null));

describe('wasmEngine root-policy rank plumbing', () => {
  it('preserves exact fixed-depth behavior when disabled', () => {
    const position = InitialPositionImproved.createInitialPosition();

    clearWasmTT();
    const first = wasmSearchBestMove(position, 0, 0, 3, 8);
    const firstStats = getLastWasmSearchStats();
    const firstRank = getLastWasmRootPolicyRankDiagnostics();

    clearWasmTT();
    const second = wasmSearchBestMove(position, 0, 0, 3, 8, null);
    const secondStats = getLastWasmSearchStats();
    const secondRank = getLastWasmRootPolicyRankDiagnostics();

    expect(second).toEqual(first);
    expect(secondStats).toEqual(firstStats);
    expect(firstRank).toEqual({
      accepted: false,
      applyCount: 0,
      nonRootApplyCount: 0,
      fault: 0,
    });
    expect(secondRank).toEqual(firstRank);
  });

  it('persists the same rank through initial and iterative root sorts only', () => {
    const position = InitialPositionImproved.createInitialPosition();
    setRootPolicyRankProvider(({ moveKeys }) =>
      [...moveKeys].reverse().map((moveKey, rank) => ({ moveKey, rank })),
    );
    const ranks = computeRootPolicyRanks(position, 41, true);
    expect(ranks).not.toBeNull();
    const receipt = createWasmRootPolicyRankReceipt(position, 41, ranks!);
    expect(receipt).not.toBeNull();

    clearWasmTT();
    const move = wasmSearchBestMove(position, 0, 0, 3, 8, receipt);
    const diagnostics = getLastWasmRootPolicyRankDiagnostics();

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
    expect(diagnostics?.accepted).toBe(true);
    // One eager legal-root sort plus at least one ply-zero search sort.
    expect(diagnostics?.applyCount).toBeGreaterThanOrEqual(2);
    expect(diagnostics?.nonRootApplyCount).toBe(0);
    expect(diagnostics?.fault).toBe(0);
  });

  it('rejects a stale dual-hash receipt and searches with stable ordering', () => {
    const original = InitialPositionImproved.createInitialPosition();
    const ranks = computeRootPolicyRanks(original, 73, true);
    const stale = createWasmRootPolicyRankReceipt(original, 73, ranks!);
    expect(stale).not.toBeNull();

    const position = InitialPositionImproved.createInitialPosition();
    const firstMove = GenerateMovesImproved.generateLegalMoves(position)[0];
    firstMove.capture = position.get(firstMove.to);
    position.move(firstMove);
    position.toggleTeban();

    clearWasmTT();
    const fallback = wasmSearchBestMove(position, 1, 0, 2, 8, stale);
    const fallbackStats = getLastWasmSearchStats();
    const diagnostics = getLastWasmRootPolicyRankDiagnostics();

    clearWasmTT();
    const stable = wasmSearchBestMove(position, 1, 0, 2, 8);
    const stableStats = getLastWasmSearchStats();

    expect(fallback).toEqual(stable);
    expect(fallbackStats).toEqual(stableStats);
    expect(diagnostics).toMatchObject({
      accepted: false,
      applyCount: 0,
      nonRootApplyCount: 0,
    });
    expect(diagnostics!.fault).toBeGreaterThan(0);
  });
});
