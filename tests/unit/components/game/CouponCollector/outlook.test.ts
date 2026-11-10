import { describe, expect, it } from 'vitest';
import { expectedDraws, runCollection } from '@/components/game/CouponCollector/engine';
import {
  completionCdf,
  currentDryStreak,
  expectedRemaining,
  expectedWaitForNext,
  formatChance,
  newCouponChance,
  waitsPerNewCoupon,
} from '@/components/game/CouponCollector/outlook';
import { getStrings } from '@/components/game/CouponCollector/i18n';

/** Deterministic mulberry32 RNG. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusion–exclusion P(T ≤ t); only trustworthy for small n. */
function cdfByInclusionExclusion(n: number, t: number): number {
  let sum = 0;
  let binom = 1;
  for (let j = 0; j <= n; j++) {
    sum += (j % 2 === 0 ? 1 : -1) * binom * (1 - j / n) ** t;
    binom = (binom * (n - j)) / (j + 1);
  }
  return sum;
}

describe('CouponCollector outlook', () => {
  it('gives the conditional outlook from the number already held', () => {
    expect(newCouponChance(20, 0)).toBe(1);
    expect(newCouponChance(20, 15)).toBeCloseTo(0.25, 12);
    expect(newCouponChance(20, 20)).toBe(0);

    expect(expectedWaitForNext(20, 0)).toBe(1);
    expect(expectedWaitForNext(20, 19)).toBe(20);
    expect(expectedWaitForNext(20, 20)).toBe(Infinity);

    for (const n of [3, 20, 100]) {
      expect(expectedRemaining(n, 0)).toBeCloseTo(expectedDraws(n), 9);
      expect(expectedRemaining(n, n - 1)).toBeCloseTo(n, 9);
      expect(expectedRemaining(n, n)).toBe(0);
    }
    // 10 coupons, 7 held: 10/3 + 10/2 + 10/1.
    expect(expectedRemaining(10, 7)).toBeCloseTo(10 / 3 + 5 + 10, 9);
  });

  it('rejects impossible counts', () => {
    expect(() => expectedRemaining(0, 0)).toThrow();
    expect(() => expectedRemaining(5, 6)).toThrow();
    expect(() => newCouponChance(5, -1)).toThrow();
    expect(() => expectedWaitForNext(5, 1.5)).toThrow();
    expect(() => completionCdf(0, 3)).toThrow();
    expect(() => completionCdf(3, -1)).toThrow();
  });

  it('expected remaining matches a simulation continued from a partial collection', () => {
    const rng = makeRng(7);
    const n = 12;
    const held = 8;
    const trials = 40_000;
    let total = 0;
    for (let i = 0; i < trials; i++) {
      const seen = new Uint8Array(n).fill(1, 0, held);
      let unique = held;
      while (unique < n) {
        const idx = Math.floor(rng() * n);
        if (!seen[idx]) {
          seen[idx] = 1;
          unique++;
        }
        total++;
      }
    }
    const theory = expectedRemaining(n, held);
    expect(Math.abs(total / trials - theory) / theory).toBeLessThan(0.02);
  });

  it('splits a run into the wait for each new coupon', () => {
    expect(waitsPerNewCoupon([])).toEqual([]);
    // new, dup, new, dup, dup, new
    expect(waitsPerNewCoupon([1, 1, 2, 2, 2, 3])).toEqual([1, 2, 3]);
    // trailing duplicates belong to a wait that has not finished yet
    expect(waitsPerNewCoupon([1, 2, 2, 2])).toEqual([1, 1]);

    const run = runCollection(25, makeRng(3));
    const waits = waitsPerNewCoupon(run.uniqueCurve);
    expect(waits).toHaveLength(25);
    expect(waits[0]).toBe(1);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(run.draws);
  });

  it('counts draws since the last new coupon', () => {
    expect(currentDryStreak([])).toBe(0);
    expect(currentDryStreak([1])).toBe(0);
    expect(currentDryStreak([1, 1, 1])).toBe(2);
    expect(currentDryStreak([1, 1, 2])).toBe(0);
    expect(currentDryStreak([1, 2, 2, 3, 3, 3, 3])).toBe(3);
  });

  it('computes the exact completion-time CDF', () => {
    expect(completionCdf(1, 0)).toBe(0);
    expect(completionCdf(1, 1)).toBe(1);
    expect(completionCdf(5, 4)).toBe(0);
    // n = 2: P(T ≤ t) = 1 − 2^(1−t)
    for (const t of [2, 3, 6, 12]) expect(completionCdf(2, t)).toBeCloseTo(1 - 2 ** (1 - t), 12);
    // Fastest possible finish: n!/n^n
    expect(completionCdf(3, 3)).toBeCloseTo(6 / 27, 12);
    expect(completionCdf(6, 6)).toBeCloseTo(720 / 6 ** 6, 12);
    for (const n of [3, 6, 10]) {
      for (const t of [n, n + 3, 3 * n, 8 * n]) {
        expect(completionCdf(n, t)).toBeCloseTo(cdfByInclusionExclusion(n, t), 9);
      }
    }
  });

  it('CDF is monotone, stays a probability for large n, and reproduces E[T]', () => {
    let prev = 0;
    for (let t = 100; t <= 2000; t += 50) {
      const p = completionCdf(100, t);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
    expect(completionCdf(100, 100)).toBeGreaterThan(0);
    expect(completionCdf(100, 100)).toBeLessThan(1e-40);
    // Median of T for n = 100 is 497 (mean 518.7): the CDF crosses one half there.
    expect(completionCdf(100, 496)).toBeLessThan(0.5);
    expect(completionCdf(100, 498)).toBeGreaterThan(0.5);

    // E[T] = Σ_{t ≥ 0} P(T > t)
    const n = 10;
    let mean = 0;
    for (let t = 0; t < 600; t++) mean += 1 - completionCdf(n, t);
    expect(mean).toBeCloseTo(expectedDraws(n), 6);
  });

  it('never rounds a real chance to 0% or 100%', () => {
    expect(formatChance(0)).toBe('0%');
    expect(formatChance(1)).toBe('100%');
    expect(formatChance(0.25)).toBe('25.0%');
    expect(formatChance(1 / 3)).toBe('33.3%');
    expect(formatChance(1e-40)).toBe('<0.1%');
    expect(formatChance(0.0009999)).toBe('<0.1%');
    expect(formatChance(0.001)).toBe('0.1%');
    expect(formatChance(0.00104)).toBe('0.1%');
    expect(formatChance(0.99996)).toBe('>99.9%');
    expect(formatChance(0.999)).toBe('99.9%');
    expect(formatChance(0.99899)).toBe('99.9%');
    expect(formatChance(1 - 1e-12)).toBe('>99.9%');
  });

  it('has every outlook string in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    const keys = [
      'outlookHeading',
      'nextNewChance',
      'expectedRemaining',
      'projectedTotal',
      'dryStreak',
      'luckPending',
      'waitTitle',
      'waitAxis',
      'waitLegendActual',
      'waitLegendPending',
      'waitLegendExpected',
      'waitSummaryEmpty',
    ] as const;
    for (const key of keys) {
      expect(en[key]).toBeTruthy();
      expect(ja[key]).toBeTruthy();
      expect(ja[key]).not.toBe(en[key]);
    }
    expect(en.luckResult(20, '61', '37.2%')).toContain('37.2%');
    expect(ja.luckResult(20, '61', '37.2%')).toContain('37.2%');
    expect(en.waitSummary('14', 20, '20.0')).toContain('#20');
    expect(ja.waitSummary('14', 20, '20.0')).toContain('20 番目');
  });
});
