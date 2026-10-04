import { describe, expect, it } from 'vitest';

import {
  CAP,
  MAX_FLIPS,
  SCENARIOS,
  SCENARIO_IDS,
  START_BANKROLL,
  betsToDouble,
  binomial,
  edge,
  everCrosses,
  fixedFractionPath,
  growthRate,
  isFinished,
  kellyFraction,
  multipleAfter,
  outcomeAfter,
  settle,
  stakeFor,
  tossCoins,
  zeroGrowthFraction,
  type Wager,
} from '@/components/game/KellyCriterion/engine';

const coin = SCENARIOS.coin60;

/** Every sequence of n bets, with its probability and whether each bet won. */
function* sequences(n: number, p: number): Generator<{ wins: boolean[]; probability: number }> {
  for (let mask = 0; mask < 1 << n; mask++) {
    const wins = Array.from({ length: n }, (_, i) => (mask & (1 << i)) !== 0);
    const k = wins.filter(Boolean).length;
    yield { wins, probability: p ** k * (1 - p) ** (n - k) };
  }
}

describe('the Kelly fraction', () => {
  it('is p − q / b', () => {
    expect(kellyFraction(coin)).toBeCloseTo(0.2, 12);
    expect(kellyFraction(SCENARIOS.edge53)).toBeCloseTo(0.06, 12);
    expect(kellyFraction(SCENARIOS.longshot)).toBeCloseTo(0.0625, 12);
    expect(kellyFraction({ p: 0.5, b: 2 })).toBeCloseTo(0.25, 12);
  });

  it('is the edge divided by the odds', () => {
    for (const id of SCENARIO_IDS) {
      const wager = SCENARIOS[id];
      expect(kellyFraction(wager)).toBeCloseTo(edge(wager) / wager.b, 12);
    }
    expect(edge(coin)).toBeCloseTo(0.2, 12);
    expect(edge(SCENARIOS.longshot)).toBeCloseTo(0.25, 12);
  });

  it('stakes nothing without an edge', () => {
    expect(kellyFraction({ p: 0.5, b: 1 })).toBe(0);
    expect(kellyFraction({ p: 0.4, b: 1 })).toBe(0);
    expect(kellyFraction({ p: 0.2, b: 3 })).toBe(0);
    expect(zeroGrowthFraction({ p: 0.5, b: 1 })).toBeNull();
  });

  it('rejects bets that are not bets', () => {
    expect(() => kellyFraction({ p: 1.2, b: 1 })).toThrow();
    expect(() => kellyFraction({ p: 0.6, b: 0 })).toThrow();
    expect(() => growthRate(coin, 1.5)).toThrow();
    expect(() => growthRate(coin, -0.1)).toThrow();
  });
});

describe('growth per bet', () => {
  it('peaks at the Kelly fraction for every scenario', () => {
    for (const id of SCENARIO_IDS) {
      const wager = SCENARIOS[id];
      const kelly = kellyFraction(wager);
      const best = growthRate(wager, kelly);
      expect(best).toBeGreaterThan(0);
      for (let f = 0; f < 1; f += 0.001) expect(growthRate(wager, f)).toBeLessThanOrEqual(best + 1e-15);
    }
  });

  it('matches the published numbers for the 60% coin', () => {
    // 0.6·ln 1.2 + 0.4·ln 0.8
    expect(growthRate(coin, 0.2)).toBeCloseTo(0.0201355, 6);
    expect(betsToDouble(coin, 0.2)).toBeCloseTo(34.42, 1);
    expect(growthRate(coin, 0)).toBe(0);
  });

  it('turns negative a little under twice Kelly, and is ruin at all-in', () => {
    const zero = zeroGrowthFraction(coin)!;
    expect(zero).toBeCloseTo(0.3894, 3);
    expect(growthRate(coin, zero)).toBeCloseTo(0, 9);
    expect(growthRate(coin, 0.4)).toBeLessThan(0);
    expect(betsToDouble(coin, 0.4)).toBeNull();
    expect(growthRate(coin, 1)).toBe(-Infinity);
    // A bet that cannot lose can be staked in full.
    expect(growthRate({ p: 1, b: 1 }, 1)).toBeCloseTo(Math.LN2, 12);
    expect(zeroGrowthFraction({ p: 1, b: 1 })).toBeNull();
  });
});

describe('the binomial distribution', () => {
  it('sums to one, even over long runs', () => {
    for (const [n, p] of [[10, 0.6], [300, 0.6], [1000, 0.53], [1000, 0.25]] as const) {
      const pmf = binomial(n, p);
      expect(pmf).toHaveLength(n + 1);
      expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });

  it('agrees with direct counting', () => {
    const pmf = binomial(4, 0.6);
    expect(pmf[0]).toBeCloseTo(0.4 ** 4, 12);
    expect(pmf[2]).toBeCloseTo(6 * 0.6 ** 2 * 0.4 ** 2, 12);
    expect(pmf[4]).toBeCloseTo(0.6 ** 4, 12);
    expect(Array.from(binomial(3, 0))).toEqual([1, 0, 0, 0]);
    expect(Array.from(binomial(3, 1))).toEqual([0, 0, 0, 1]);
  });
});

describe('the bankroll after n bets', () => {
  it('depends only on the number of wins', () => {
    expect(multipleAfter(coin, 0.2, 3, 2)).toBeCloseTo(1.2 * 1.2 * 0.8, 12);
    expect(multipleAfter(coin, 0.2, 0, 0)).toBe(1);
    expect(multipleAfter(coin, 1, 3, 3)).toBe(8);
    expect(multipleAfter(coin, 1, 3, 2)).toBe(0);
  });

  it('matches a brute-force count of every sequence', () => {
    const n = 12;
    for (const wager of [coin, SCENARIOS.longshot] as Wager[]) {
      for (const f of [0.05, 0.2, 0.4, 0.9]) {
        const results: { multiple: number; probability: number }[] = [];
        for (const { wins, probability } of sequences(n, wager.p)) {
          let bankroll = 1;
          for (const won of wins) bankroll *= won ? 1 + wager.b * f : 1 - f;
          results.push({ multiple: bankroll, probability });
        }
        const mean = results.reduce((sum, r) => sum + r.multiple * r.probability, 0);
        const below = results.reduce((sum, r) => sum + (r.multiple < 1 - 1e-12 ? r.probability : 0), 0);
        results.sort((a, b) => a.multiple - b.multiple);
        const quantile = (level: number) => {
          let cumulative = 0;
          for (const r of results) {
            cumulative += r.probability;
            if (cumulative >= level - 1e-12) return r.multiple;
          }
          return results[results.length - 1].multiple;
        };
        const outcome = outcomeAfter(wager, f, n);
        expect(outcome.mean).toBeCloseTo(mean, 9);
        expect(outcome.belowStart).toBeCloseTo(below, 12);
        expect(outcome.median).toBeCloseTo(quantile(0.5), 9);
        expect(outcome.low).toBeCloseTo(quantile(0.05), 9);
        expect(outcome.high).toBeCloseTo(quantile(0.95), 9);
      }
    }
  });

  it('shows the average hiding the typical result', () => {
    const kelly = outcomeAfter(coin, 0.2, 300);
    expect(kelly.median).toBeCloseTo(420.2, 0);
    expect(kelly.belowStart).toBeCloseTo(0.044, 3);
    // Twice Kelly: the average is astronomically better, the typical result is a loss.
    const double = outcomeAfter(coin, 0.4, 300);
    expect(double.mean).toBeGreaterThan(kelly.mean * 1000);
    expect(double.median).toBeLessThan(1);
    expect(double.belowStart).toBeGreaterThan(0.5);
    // All in: one loss in 300 flips is all it takes.
    const allIn = outcomeAfter(coin, 1, 300);
    expect(allIn.median).toBe(0);
    expect(allIn.belowStart).toBeCloseTo(1, 12);
    expect(allIn.mean).toBeCloseTo(1.2 ** 300, -20);
  });

  it('has a median close to e^(n·g)', () => {
    for (const f of [0.1, 0.2, 0.3]) {
      const typical = Math.exp(1000 * growthRate(coin, f));
      const { median } = outcomeAfter(coin, f, 1000);
      expect(Math.abs(Math.log(median / typical))).toBeLessThan(0.5);
    }
  });
});

describe('crossing a level along the way', () => {
  it('matches a brute-force walk through every sequence', () => {
    const n = 12;
    for (const wager of [coin, SCENARIOS.longshot] as Wager[]) {
      for (const f of [0.1, 0.2, 0.5]) {
        for (const level of [0.5, 0.8, 2, 3]) {
          let expected = 0;
          for (const { wins, probability } of sequences(n, wager.p)) {
            let bankroll = 1;
            let crossed = false;
            for (const won of wins) {
              bankroll *= won ? 1 + wager.b * f : 1 - f;
              if (level < 1 ? bankroll <= level * (1 + 1e-12) : bankroll >= level * (1 - 1e-12)) crossed = true;
            }
            if (crossed) expected += probability;
          }
          expect(everCrosses(wager, f, n, level)).toBeCloseTo(expected, 12);
        }
      }
    }
  });

  it('reproduces the 95% of the 2016 experiment', () => {
    // Haghani & Dewey: constant stakes of 10–20% reach ten times the stake
    // within 300 flips with about 95% probability.
    expect(everCrosses(coin, 0.1, 300, 10)).toBeCloseTo(0.942, 3);
    expect(everCrosses(coin, 0.15, 300, 10)).toBeCloseTo(0.9525, 3);
    expect(everCrosses(coin, 0.2, 300, 10)).toBeCloseTo(0.938, 3);
  });

  it('prices the ride: full Kelly halves the bankroll at some point almost half the time', () => {
    expect(everCrosses(coin, 0.2, 300, 0.5)).toBeCloseTo(0.451, 3);
    expect(everCrosses(coin, 0.1, 300, 0.5)).toBeCloseTo(0.104, 3);
    expect(everCrosses(coin, 0.4, 300, 0.5)).toBeCloseTo(0.91, 2);
    // More bets can only add ways to get there.
    expect(everCrosses(coin, 0.2, 1000, 0.5)).toBeGreaterThan(everCrosses(coin, 0.2, 300, 0.5));
  });

  it('is fast enough for a thousand bets and rejects a level of 1', () => {
    const start = performance.now();
    everCrosses(coin, 0.2, 1000, 0.5);
    expect(performance.now() - start).toBeLessThan(500);
    expect(() => everCrosses(coin, 0.2, 10, 1)).toThrow();
    expect(() => everCrosses(coin, 0.2, 10, 0)).toThrow();
  });
});

describe('the table', () => {
  it('starts with the experiment’s $25, capped at ten times that, for 300 flips', () => {
    expect(START_BANKROLL).toBe(25);
    expect(CAP).toBe(250);
    expect(MAX_FLIPS).toBe(300);
  });

  it('stakes whole cents and never more than the bankroll', () => {
    expect(stakeFor(25, 0.2)).toBe(5);
    expect(stakeFor(25, 1)).toBe(25);
    expect(stakeFor(25, 0)).toBe(0);
    expect(stakeFor(0.07, 0.2)).toBe(0.01);
    expect(stakeFor(33.33, 0.2)).toBe(6.67);
  });

  it('settles a bet in whole cents and stops at the cap', () => {
    expect(settle(25, 5, true, 1)).toBe(30);
    expect(settle(25, 5, false, 1)).toBe(20);
    expect(settle(25, 5, true, 4)).toBe(45);
    expect(settle(25, 25, false, 1)).toBe(0);
    expect(settle(240, 48, true, 1)).toBe(CAP);
    expect(settle(0.1, 0.03, true, 1)).toBe(0.13);
    expect(() => settle(25, 30, true, 1)).toThrow();
    expect(() => settle(25, -1, true, 1)).toThrow();
  });

  it('knows when play is over', () => {
    expect(isFinished(25, 0)).toBe(false);
    expect(isFinished(0, 10)).toBe(true);
    expect(isFinished(0.005, 10)).toBe(true);
    expect(isFinished(CAP, 10)).toBe(true);
    expect(isFinished(100, MAX_FLIPS)).toBe(true);
    expect(isFinished(100, MAX_FLIPS - 1)).toBe(false);
  });

  it('tosses the scenario’s coin from the given rng', () => {
    const values = [0.1, 0.59, 0.6, 0.99];
    let i = 0;
    expect(tossCoins(coin, 4, () => values[i++])).toEqual([true, true, false, false]);
    let heads = 0;
    for (const won of tossCoins(coin, 20_000)) if (won) heads++;
    expect(heads / 20_000).toBeGreaterThan(0.58);
    expect(heads / 20_000).toBeLessThan(0.62);
  });

  it('follows a fixed fraction through a run of flips', () => {
    expect(fixedFractionPath(coin, 0.2, [true, false, true])).toEqual([25, 30, 24, 28.8]);
    // All in: the first tails ends it, and the path stays flat afterwards.
    expect(fixedFractionPath(coin, 1, [true, false, true, true])).toEqual([25, 50, 0, 0, 0]);
    // The cap ends the game too.
    const wins = Array.from({ length: 20 }, () => true);
    const path = fixedFractionPath(coin, 0.2, wins);
    expect(path[path.length - 1]).toBe(CAP);
    expect(Math.max(...path)).toBe(CAP);
    // Staking nothing changes nothing.
    expect(fixedFractionPath(coin, 0, [true, false])).toEqual([25, 25, 25]);
  });
});
