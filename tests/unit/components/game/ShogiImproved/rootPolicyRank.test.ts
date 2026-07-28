import { afterEach, describe, expect, it, vi } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import {
  computeRootPolicyRanks,
  rootPolicyMoveKey,
  setRootPolicyRankProvider,
  type RootPolicyRankProviderInput,
} from '@/components/game/ShogiImproved/rootPolicyRank';
import { EMPTY, GOU, SENTE, SKA, SOU } from '@/components/game/ShogiImproved/types';

afterEach(() => setRootPolicyRankProvider(null));

describe('rootPolicyRank provider boundary', () => {
  it('does zero provider work when student_enabled is false', () => {
    const provider = vi.fn(() => []);
    setRootPolicyRankProvider(provider);

    expect(
      computeRootPolicyRanks(InitialPositionImproved.createInitialPosition(), 1, false),
    ).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });

  it('invokes the provider once with the exact production-search move universe', () => {
    const provider = vi.fn(({ moveKeys }: RootPolicyRankProviderInput) =>
      [...moveKeys].reverse().map((moveKey, rank) => ({ moveKey, rank })),
    );
    setRootPolicyRankProvider(provider);

    const result = computeRootPolicyRanks(
      InitialPositionImproved.createInitialPosition(),
      17,
      true,
    );

    expect(provider).toHaveBeenCalledTimes(1);
    const input = provider.mock.calls[0][0];
    expect(input.sequence).toBe(17);
    expect(input.moveKeys).toEqual(input.moves.map(rootPolicyMoveKey));
    expect(new Set(input.moveKeys).size).toBe(input.moveKeys.length);
    expect(result).toEqual(
      [...input.moveKeys].reverse().map((moveKey, rank) => ({ moveKey, rank })),
    );
  });

  it('keeps the production bishop/rook non-promotion omission (not rules-complete legal moves)', () => {
    const board = Array.from({ length: 9 }, () => Array<number>(9).fill(EMPTY));
    board[0][0] = GOU;
    board[8][0] = SOU;
    const position = new KyokumenImproved();
    InitialPositionImproved.setupCustom(position, board);
    const from = (5 << 4) + 5;
    const to = (3 << 4) + 3;
    position.ban[from] = SKA;
    position.initAll();
    position.setTeban(SENTE);

    let capturedMoves: RootPolicyRankProviderInput['moves'] = [];
    setRootPolicyRankProvider((input) => {
      capturedMoves = [...input.moves];
      return input.moveKeys.map((moveKey, rank) => ({ moveKey, rank }));
    });
    expect(computeRootPolicyRanks(position, 23, true)).not.toBeNull();

    const variants = capturedMoves.filter((move) => move.from === from && move.to === to);
    expect(variants).toHaveLength(1);
    expect(variants[0].promote).toBe(true);
  });

  it.each([
    () => null,
    ({ moveKeys }: RootPolicyRankProviderInput) =>
      moveKeys.slice(1).map((moveKey, rank) => ({ moveKey, rank })),
    ({ moveKeys }: RootPolicyRankProviderInput) =>
      moveKeys.map((moveKey) => ({ moveKey, rank: 0 })),
    ({ moveKeys }: RootPolicyRankProviderInput) =>
      moveKeys.map((moveKey, rank) => ({
        moveKey: rank === 0 ? 123456789 : moveKey,
        rank,
      })),
  ])('fails closed on a malformed provider result', (provider) => {
    setRootPolicyRankProvider(provider);
    expect(
      computeRootPolicyRanks(InitialPositionImproved.createInitialPosition(), 9, true),
    ).toBeNull();
  });
});
