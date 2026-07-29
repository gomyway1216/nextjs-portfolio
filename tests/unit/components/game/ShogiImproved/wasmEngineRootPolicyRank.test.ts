import { afterEach, describe, expect, it } from 'vitest';
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
  type WasmRootPolicyRankReceipt,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

afterEach(() => setRootPolicyRankProvider(null));

describe('wasmEngine root-policy rank production enrollment boundary', () => {
  it('preserves exact fixed-depth behavior before the candidate binary is enrolled', () => {
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
    // The checked-in production WASM remains the previously authenticated
    // binary. It deliberately has no root-rank exports until the frozen
    // student, candidate WASM and same-build admission receipt are enrolled
    // together.
    expect(firstRank).toBeNull();
    expect(secondRank).toEqual(firstRank);
  });

  it('fails closed when asked to create a receipt against the stable production binary', () => {
    const position = InitialPositionImproved.createInitialPosition();
    setRootPolicyRankProvider(({ moveKeys }) =>
      [...moveKeys].reverse().map((moveKey, rank) => ({ moveKey, rank })),
    );
    const ranks = computeRootPolicyRanks(position, 41, true);
    expect(ranks).not.toBeNull();
    const receipt = createWasmRootPolicyRankReceipt(position, 41, ranks!);
    expect(receipt).toBeNull();
    expect(getLastWasmRootPolicyRankDiagnostics()).toBeNull();
  });

  it('ignores even a well-shaped rank receipt until candidate WASM enrollment', () => {
    const position = InitialPositionImproved.createInitialPosition();
    setRootPolicyRankProvider(({ moveKeys }) =>
      moveKeys.map((moveKey, rank) => ({ moveKey, rank })),
    );
    const ranks = computeRootPolicyRanks(position, 73, true);
    expect(ranks).not.toBeNull();
    const unenrolledReceipt: WasmRootPolicyRankReceipt = {
      schema: 'shogi-root-policy-rank-receipt-v1',
      sequence: 73,
      positionHashA: 1,
      positionHashB: 1,
      moveCount: ranks!.length,
      ranks: ranks!,
    };

    clearWasmTT();
    const fallback = wasmSearchBestMove(position, 0, 0, 2, 8, unenrolledReceipt);
    const fallbackStats = getLastWasmSearchStats();
    const diagnostics = getLastWasmRootPolicyRankDiagnostics();

    clearWasmTT();
    const stable = wasmSearchBestMove(position, 0, 0, 2, 8);
    const stableStats = getLastWasmSearchStats();

    expect(fallback).toEqual(stable);
    expect(fallbackStats).toEqual(stableStats);
    expect(diagnostics).toBeNull();
  });
});
