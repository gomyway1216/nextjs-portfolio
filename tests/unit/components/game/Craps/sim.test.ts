import { describe, expect, it } from 'vitest';

import { expectedShooterRolls, shooterSurvival, toNumber } from '@/components/game/Craps/analysis';
import {
  STRATEGY_IDS,
  UNIT,
  logCheckpoints,
  minimumStake,
  simulateHands,
  simulateSessions,
  simulateStrategies,
  strategyTopUp,
  theoreticalEdge,
} from '@/components/game/Craps/sim';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('strategyTopUp', () => {
  it('bets the line only on the come-out and adds max odds once a point is on', () => {
    expect(strategyTopUp('pass', null, {})).toEqual({ pass: UNIT });
    expect(strategyTopUp('pass', 6, { pass: UNIT })).toEqual({});
    expect(strategyTopUp('dontPass', null, {})).toEqual({ dontPass: UNIT });
    expect(strategyTopUp('passMaxOdds', null, {})).toEqual({ pass: UNIT });
    expect(strategyTopUp('passMaxOdds', 4, { pass: 5 })).toEqual({ passOdds: 15 });
    expect(strategyTopUp('passMaxOdds', 9, { pass: 5 })).toEqual({ passOdds: 20 });
    expect(strategyTopUp('passMaxOdds', 6, { pass: 5, passOdds: 25 })).toEqual({});
  });

  it('keeps place 6 & 8 up and re-bets one-roll bets every roll', () => {
    expect(strategyTopUp('place68', null, {})).toEqual({ place6: 6, place8: 6 });
    expect(strategyTopUp('place68', 5, { place6: 6 })).toEqual({ place8: 6 });
    expect(strategyTopUp('field', 8, {})).toEqual({ field: UNIT });
    expect(strategyTopUp('any7', null, { any7: UNIT })).toEqual({});
  });

  it('knows the exact edge each strategy converges to', () => {
    expect(theoreticalEdge('pass')).toBeCloseTo(7 / 495, 12);
    expect(theoreticalEdge('passMaxOdds')).toBeCloseTo(7 / 1870, 12);
    expect(theoreticalEdge('dontPass')).toBeCloseTo(3 / 220, 12);
    expect(theoreticalEdge('place68')).toBeCloseTo(1 / 66, 12);
    expect(theoreticalEdge('field')).toBeCloseTo(1 / 36, 12);
    expect(theoreticalEdge('any7')).toBeCloseTo(1 / 6, 12);
  });
});

describe('simulateStrategies', () => {
  it('converges toward each strategy’s exact edge (same dice for everyone)', async () => {
    const res = (await simulateStrategies(120_000, {}, seeded(7)))!;
    for (const id of STRATEGY_IDS) {
      const last = res[id].at(-1)!;
      expect(last.rolls).toBe(120_000);
      // Generous bound: ~4 standard errors for the noisiest strategy at this size.
      expect(Math.abs(last.edge - theoreticalEdge(id)), id).toBeLessThan(0.025);
    }
    // Any Seven is by far the worst deal.
    const final = Object.fromEntries(STRATEGY_IDS.map((id) => [id, res[id].at(-1)!.edge]));
    expect(final.any7).toBeGreaterThan(0.1);
    expect(final.passMaxOdds).toBeLessThan(0.03);
  });

  it('records checkpoints on a log scale and can be aborted', async () => {
    const cps = logCheckpoints(10_000);
    expect(cps[0]).toBe(100);
    expect(cps.at(-1)).toBe(10_000);
    for (let i = 1; i < cps.length; i++) expect(cps[i]).toBeGreaterThan(cps[i - 1]);

    const controller = new AbortController();
    controller.abort();
    expect(await simulateStrategies(100_001, { signal: controller.signal })).toBeNull();
    await expect(simulateStrategies(0)).rejects.toThrow(/positive integer/);
  });
});

describe('simulateSessions', () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  };

  it('keeps its books: finals and bust / ahead rates', async () => {
    const s = (await simulateSessions({ strategy: 'pass', bankroll: 1_000, maxRolls: 300 }, 1_500, {}, seeded(3)))!;
    expect(s.finals).toHaveLength(1_500);
    expect(s.finals.every((f) => f >= 0)).toBe(true);
    // Line bets are played out and nothing is left on the table: Pass pays even
    // money on 5-unit bets, so every final is a whole number.
    expect(s.finals.every((f) => Number.isInteger(f))).toBe(true);
    expect(s.bustRate).toBeCloseTo(s.finals.filter((f) => f < minimumStake('pass')).length / 1_500, 12);
    expect(s.aheadRate).toBeCloseTo(s.finals.filter((f) => f > 1_000).length / 1_500, 12);
    expect(s.sampleTrajectory[0]).toBe(1_000);
    expect(s.sampleTrajectory.at(-1)).toBe(s.finals[0]);
  });

  it.each([
    ['pass', 1_000],
    ['dontPass', 1_000],
    ['place68', 1_000],
    ['field', 1_000],
    // Small bankroll: max odds are often unaffordable, so the wager mix varies.
    ['passMaxOdds', 60],
  ] as const)('%s: mean final = bankroll − exact expected loss (bankroll %i)', async (strategy, bankroll) => {
    const trials = 3_000;
    const s = (await simulateSessions({ strategy, bankroll, maxRolls: 200 }, trials, {}, seeded(17)))!;
    const standardError = sd(s.finals) / Math.sqrt(trials);
    expect(Math.abs(s.meanFinal - (bankroll - s.meanExpectedLoss))).toBeLessThan(4 * standardError + 1e-9);
  });

  it('prices partial odds play correctly (a single blended edge would not)', async () => {
    const s = (await simulateSessions({ strategy: 'passMaxOdds', bankroll: 60, maxRolls: 200 }, 2_000, {}, seeded(23)))!;
    const blended = s.meanAction * theoreticalEdge('passMaxOdds');
    // Odds are skipped when unaffordable, so more of the action is the
    // higher-edge Pass line than the max-odds mix assumes.
    expect(s.meanExpectedLoss).toBeGreaterThan(blended * 1.05);
  });

  it('counts a session as broke when it cannot afford the strategy’s next bet', async () => {
    expect(minimumStake('place68')).toBe(12);
    expect(minimumStake('pass')).toBe(5);
    expect(minimumStake('passMaxOdds')).toBe(5);
    // 11 credits can't place both the 6 and the 8: broke before it starts.
    const s = (await simulateSessions({ strategy: 'place68', bankroll: 11, maxRolls: 100 }, 50, {}, seeded(5)))!;
    expect(s.bustRate).toBe(1);
    expect(s.finals.every((f) => f === 11)).toBe(true);

    const any7 = (await simulateSessions({ strategy: 'any7', bankroll: 5, maxRolls: 1_000 }, 200, {}, seeded(5)))!;
    expect(any7.bustRate).toBeGreaterThan(0.6);
    await expect(simulateSessions({ strategy: 'pass', bankroll: 0, maxRolls: 10 }, 5)).rejects.toThrow();
  });
});

describe('simulateHands', () => {
  it('matches the exact hand-length distribution', async () => {
    const hands = 60_000;
    const res = (await simulateHands(hands, {}, seeded(11)))!;
    expect(res.counts.reduce((a, b) => a + b, 0)).toBe(hands);
    expect(res.counts[0]).toBe(0);
    const mean = toNumber(expectedShooterRolls());
    // Hand length has a standard deviation of roughly 8 rolls.
    expect(Math.abs(res.meanRolls - mean)).toBeLessThan((4 * 8) / Math.sqrt(hands));
    const survival = shooterSurvival(30);
    for (let n = 1; n <= 30; n++) {
      const p = survival[n - 1] - survival[n];
      const expected = hands * p;
      expect(Math.abs(res.counts[n] - expected), `length ${n}`).toBeLessThan(5 * Math.sqrt(expected) + 1);
    }
  });
});
