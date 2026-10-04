import { describe, expect, it } from 'vitest';

import { SCENARIOS, growthRate, kellyFraction } from '@/components/game/KellyCriterion/engine';
import {
  STRATEGY_IDS,
  exactFor,
  logCheckpoints,
  seededRng,
  simulateSessions,
  strategyFraction,
} from '@/components/game/KellyCriterion/sim';

const coin = SCENARIOS.coin60;

describe('seeded rng', () => {
  it('is reproducible and stays strictly between 0 and 1', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('accepts any finite seed and rejects the rest', () => {
    for (const seed of [0, -5, 3.7, 2 ** 31, 2147483646, 1e15]) {
      const v = seededRng(seed)();
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
    expect(() => seededRng(NaN)).toThrow();
    expect(() => seededRng(Infinity)).toThrow();
  });
});

describe('strategies', () => {
  it('are multiples of the Kelly fraction, with all-in staking everything', () => {
    expect(strategyFraction(coin, 'half')).toBeCloseTo(0.1, 12);
    expect(strategyFraction(coin, 'kelly')).toBeCloseTo(0.2, 12);
    expect(strategyFraction(coin, 'double')).toBeCloseTo(0.4, 12);
    expect(strategyFraction(coin, 'triple')).toBeCloseTo(0.6, 12);
    expect(strategyFraction(coin, 'allIn')).toBe(1);
    expect(strategyFraction(SCENARIOS.longshot, 'triple')).toBeCloseTo(0.1875, 12);
    // A multiple can never stake more than everything.
    expect(strategyFraction({ p: 0.9, b: 1 }, 'triple')).toBe(1);
  });

  it('take their exact numbers from the engine', () => {
    const kelly = exactFor(coin, 'kelly', 300);
    expect(kelly.fraction).toBeCloseTo(kellyFraction(coin), 12);
    expect(kelly.growth).toBeCloseTo(growthRate(coin, 0.2), 12);
    expect(kelly.median).toBeCloseTo(420.2, 0);
    expect(kelly.everHalf).toBeCloseTo(0.451, 3);
    const allIn = exactFor(coin, 'allIn', 300);
    expect(allIn.growth).toBe(-Infinity);
    expect(allIn.median).toBe(0);
    expect(allIn.everHalf).toBeCloseTo(1, 12);
  });

  it('spaces checkpoints on a log scale, ending on the last session', () => {
    const points = logCheckpoints(10_000);
    expect(points[0]).toBe(10);
    expect(points[points.length - 1]).toBe(10_000);
    for (let i = 1; i < points.length; i++) expect(points[i]).toBeGreaterThan(points[i - 1]);
    expect(logCheckpoints(7)).toEqual([7]);
  });
});

describe('simulateSessions', () => {
  it('converges to the exact numbers on a fixed seed', async () => {
    const result = (await simulateSessions(20_000, 100, coin, {}, 7))!;
    expect(result.sessions).toBe(20_000);
    expect(result.flips).toBe(100);
    expect(result.winRate).toBeCloseTo(0.6, 2);
    for (const id of STRATEGY_IDS) {
      const exact = exactFor(coin, id, 100);
      const sim = result.strategies[id];
      expect(sim.fraction).toBe(exact.fraction);
      expect(sim.belowStart).toBeCloseTo(exact.belowStart, 1);
      expect(sim.everHalf).toBeCloseTo(exact.everHalf, 1);
      if (id === 'allIn') {
        expect(sim.growth).toBe(-Infinity);
        expect(sim.median).toBe(0);
      } else {
        expect(sim.growth).toBeCloseTo(exact.growth, 2);
        // The median of 20,000 sessions sits within one win of the exact one.
        const step = Math.log1p(exact.fraction) - Math.log1p(-exact.fraction);
        expect(Math.abs(Math.log(sim.median / exact.median))).toBeLessThanOrEqual(step + 1e-9);
      }
      expect(sim.points[sim.points.length - 1].sessions).toBe(20_000);
    }
  });

  it('ranks the strategies as the theory says: Kelly grows fastest, double Kelly goes nowhere', async () => {
    const result = (await simulateSessions(20_000, 300, coin, {}, 11))!;
    const { half, kelly, double, triple } = result.strategies;
    expect(kelly.growth).toBeGreaterThan(half.growth);
    expect(half.growth).toBeGreaterThan(double.growth);
    expect(double.growth).toBeGreaterThan(triple.growth);
    expect(kelly.median).toBeGreaterThan(half.median);
    expect(double.median).toBeLessThan(1);
    // …and the bigger the bet, the rougher the ride.
    expect(half.everHalf).toBeLessThan(kelly.everHalf);
    expect(kelly.everHalf).toBeLessThan(double.everHalf);
  });

  it('gives the same result for the same seed, and another for another', async () => {
    const a = await simulateSessions(500, 50, coin, {}, 3);
    const b = await simulateSessions(500, 50, coin, {}, 3);
    const c = await simulateSessions(500, 50, coin, {}, 4);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('works for a long shot too', async () => {
    const wager = SCENARIOS.longshot;
    const result = (await simulateSessions(10_000, 300, wager, {}, 5))!;
    expect(result.winRate).toBeCloseTo(0.25, 2);
    expect(result.strategies.kelly.growth).toBeCloseTo(exactFor(wager, 'kelly', 300).growth, 2);
    expect(result.strategies.kelly.belowStart).toBeCloseTo(exactFor(wager, 'kelly', 300).belowStart, 1);
  });

  it('reports progress at every yield and once more at the end', async () => {
    const seen: number[] = [];
    await simulateSessions(5_000, 300, coin, { onProgress: (done) => seen.push(done) }, 1);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(5_000);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const result = await simulateSessions(1_000, 100, coin, { signal: controller.signal, onProgress: () => (called = true) }, 1);
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it('stops at the next yield when aborted mid-run', async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await simulateSessions(
      50_000,
      300,
      coin,
      {
        signal: controller.signal,
        onProgress: () => {
          calls++;
          controller.abort();
        },
      },
      1,
    );
    expect(result).toBeNull();
    expect(calls).toBe(1);
  });

  it('rejects invalid input', async () => {
    await expect(simulateSessions(0, 100, coin)).rejects.toThrow();
    await expect(simulateSessions(10.5, 100, coin)).rejects.toThrow();
    await expect(simulateSessions(10, 0, coin)).rejects.toThrow();
    await expect(simulateSessions(10, 100, coin, {}, NaN)).rejects.toThrow();
  });
});
