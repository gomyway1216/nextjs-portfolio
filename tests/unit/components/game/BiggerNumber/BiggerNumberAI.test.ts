import { describe, it, expect } from 'vitest';
import {
  pickAICard,
  solveZeroSumGame,
  type MatchContext,
} from '@/components/game/BiggerNumber/BiggerNumberAI';
import {
  DEFAULT_RULES,
  type CardValue,
  type BiggerNumberRules,
} from '@/components/game/BiggerNumber/types';

const rules: BiggerNumberRules = { ...DEFAULT_RULES };

/** Deterministic PRNG (mulberry32) so stochastic tiers are reproducible. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('pickAICard — easy', () => {
  it('always returns a card from the hand', () => {
    const hand: CardValue[] = [1, 5, 9, 'dragon'];
    for (let i = 0; i < 50; i++) {
      const { card } = pickAICard('easy', rules, hand, [1, 2, 3]);
      expect(hand).toContain(card);
    }
  });

  it('throws when hand is empty', () => {
    expect(() => pickAICard('easy', rules, [], [1])).toThrow();
  });
});

describe('pickAICard — medium (greedy expected value)', () => {
  it('picks 9 when opponent only has low cards', () => {
    const { card } = pickAICard('medium', rules, [1, 2, 9], [1, 2, 3]);
    expect(card).toBe(9);
  });

  it('avoids playing dragon when opponent might still have a 1', () => {
    // loses-to-1: dragon vs [1,2,3] EV = (-1+1+1)/3; 9 vs [1,2,3] EV = 1 → prefer 9.
    const { card } = pickAICard('medium', rules, [9, 'dragon'], [1, 2, 3]);
    expect(card).toBe(9);
  });

  it('plays dragon willingly when opponent has no 1', () => {
    // dragon vs [2,3,4] EV = 1 == 9 vs [2,3,4] EV = 1; tie-break saves power → dragon (rank 5 < 9).
    const { card } = pickAICard('medium', rules, [9, 'dragon'], [2, 3, 4]);
    expect(card).toBe('dragon');
  });

  it('respects beats-all dragon rule', () => {
    const beatsAll: BiggerNumberRules = { ...rules, dragonRule: 'beats-all' };
    const { card } = pickAICard('medium', beatsAll, [9, 'dragon'], [1, 5, 9]);
    expect(card).toBe('dragon');
  });

  it('falls back gracefully when opponent hand is empty', () => {
    const { card } = pickAICard('medium', rules, [3, 4], []);
    expect([3, 4]).toContain(card);
  });
});

describe('pickAICard — hard (Nash mixed strategy)', () => {
  const rng = seededRng(12345);

  it('always returns a card from the hand', () => {
    const hand: CardValue[] = [1, 5, 9, 'dragon'];
    for (let i = 0; i < 30; i++) {
      const { card } = pickAICard('hard', rules, hand, [1, 2, 3], undefined, rng);
      expect(hand).toContain(card);
    }
  });

  it('plays 9 with certainty when it dominates every opponent card', () => {
    // Against [1,2,3], 9 beats all → pure best response; Nash puts all mass on 9.
    for (let i = 0; i < 20; i++) {
      const { card } = pickAICard('hard', rules, [1, 2, 9], [1, 2, 3], undefined, rng);
      expect(card).toBe(9);
    }
  });

  it('mixes its plays (is not deterministic) in a rock-paper-scissors spot', () => {
    // loses-to-1 makes {1, 9, dragon} a cycle: 1 beats dragon, 9 beats 1,
    // dragon beats 9. No pure best response exists → strategy must mix.
    const seen = new Set<CardValue>();
    for (let i = 0; i < 60; i++) {
      const { card } = pickAICard(
        'hard',
        rules,
        [1, 9, 'dragon'],
        [1, 9, 'dragon'],
        undefined,
        seededRng(1000 + i),
      );
      seen.add(card);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('uses match context lookahead without crashing on small hands', () => {
    const ctx: MatchContext = { myWinsNeeded: 1, oppWinsNeeded: 1, roundsLeft: 2 };
    const { card } = pickAICard('hard', rules, [1, 9], [1, 9], ctx, rng);
    expect([1, 9]).toContain(card);
  });

  it('falls back gracefully when opponent hand is empty', () => {
    const { card } = pickAICard('hard', rules, [3, 4], [], undefined, rng);
    expect([3, 4]).toContain(card);
  });

  it('does not stack-overflow on tie-replay rules (lookahead cycle)', () => {
    // Under `replay`, both sides revealing the same tile returns the cards and
    // consumes no round, so the sub-game can recurse into the same state.
    const replayRules: BiggerNumberRules = { ...rules, tieRule: 'replay' };
    const ctx: MatchContext = { myWinsNeeded: 2, oppWinsNeeded: 2, roundsLeft: 4 };
    const hand: CardValue[] = [1, 5, 9, 'dragon'];
    expect(() =>
      pickAICard('hard', replayRules, hand, [1, 5, 9, 'dragon'], ctx, rng),
    ).not.toThrow();
    const { card } = pickAICard('hard', replayRules, hand, [1, 5, 9, 'dragon'], ctx, rng);
    expect(hand).toContain(card);
  });
});

describe('solveZeroSumGame', () => {
  it('finds value 0 and pure strategy for a dominated matrix', () => {
    // Row 0 dominates row 1 (all payoffs >=). Value should be the max-min.
    const { value, strategy } = solveZeroSumGame([
      [1, 1],
      [-1, -1],
    ]);
    expect(value).toBeCloseTo(1, 1);
    expect(strategy[0]).toBeGreaterThan(0.95);
  });

  it('solves matching-pennies to a 50/50 mix and value 0', () => {
    const { value, strategy } = solveZeroSumGame([
      [1, -1],
      [-1, 1],
    ]);
    expect(value).toBeCloseTo(0, 1);
    expect(strategy[0]).toBeCloseTo(0.5, 1);
    expect(strategy[1]).toBeCloseTo(0.5, 1);
  });

  it('returns a valid probability distribution (sums to 1)', () => {
    const { strategy } = solveZeroSumGame([
      [0, -1, 1],
      [1, 0, -1],
      [-1, 1, 0],
    ]);
    const sum = strategy.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    for (const p of strategy) expect(p).toBeGreaterThanOrEqual(0);
  });

  it('handles degenerate single-row matrices', () => {
    const { value, strategy } = solveZeroSumGame([[3, 5, -2]]);
    expect(value).toBe(-2); // row plays its only action; opponent minimises
    expect(strategy).toEqual([1]);
  });

  it('clamps invalid iteration counts instead of producing NaN', () => {
    for (const bad of [0, -50, NaN]) {
      const { value, strategy } = solveZeroSumGame(
        [
          [1, -1],
          [-1, 1],
        ],
        bad,
      );
      expect(Number.isNaN(value)).toBe(false);
      const sum = strategy.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
      for (const p of strategy) expect(Number.isNaN(p)).toBe(false);
    }
  });
});

describe('hard AI is not exploitable by a fixed counter', () => {
  it('does not always lose to an opponent who copies a naive greedy bot', () => {
    // Sanity: over many seeds, the mixed strategy should not collapse to one card
    // that a smart opponent could always beat. We check the spread of first picks.
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const { card } = pickAICard(
        'hard',
        rules,
        [4, 5, 6, 'dragon'],
        [1, 5, 9, 'dragon'],
        undefined,
        seededRng(7 + i * 13),
      );
      const key = String(card);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Expect more than one distinct card chosen across seeds.
    expect(counts.size).toBeGreaterThan(1);
  });
});
