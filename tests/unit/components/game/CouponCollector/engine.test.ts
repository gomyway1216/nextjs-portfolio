import { describe, expect, it } from 'vitest';
import {
  expectedDraws,
  harmonic,
  percentileSorted,
  runCollection,
  runCollectorMonteCarloAsync,
  stddevDraws,
  varianceDraws,
} from '@/components/game/CouponCollector/engine';

function sequence(values: number[], fallback = 0): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

/** Deterministic mulberry32 RNG for stable statistical assertions. */
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

describe('CouponCollector engine', () => {
  it('computes harmonic expectation and variance', () => {
    expect(harmonic(3)).toBeCloseTo(1 + 1 / 2 + 1 / 3);
    expect(expectedDraws(3)).toBeCloseTo(5.5);
    expect(varianceDraws(1)).toBe(0);
    expect(stddevDraws(1)).toBe(0);
  });

  it('runs a deterministic collection until every item appears', () => {
    const values = [0, 0.34, 0.67];
    const rng = () => values.shift() ?? 0;

    expect(runCollection(3, rng)).toEqual({
      draws: 3,
      counts: [1, 1, 1],
      uniqueCurve: [1, 2, 3],
    });
  });

  it('rejects invalid collection sizes', () => {
    expect(() => runCollection(0)).toThrow('positive integer');
  });

  it('runs deterministic monte carlo trials and aggregates draw counts', async () => {
    const progress: Array<[number, number]> = [];
    const rng = sequence([0, 0.34, 0.67, 0, 0, 0.34, 0.67]);

    const result = await runCollectorMonteCarloAsync(
      3,
      2,
      {
        chunkSize: 1,
        onProgress: (done, total) => progress.push([done, total]),
      },
      rng,
    );

    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result).toMatchObject({
      trials: 2,
      n: 3,
      meanDraws: 3.5,
      medianDraws: 3.5,
      minDraws: 3,
      maxDraws: 4,
      drawCounts: [3, 4],
    });
    expect(result?.theoreticalMean).toBeCloseTo(expectedDraws(3));
    expect(result?.theoreticalStd).toBeCloseTo(stddevDraws(3));
  });

  it('validates monte carlo inputs', async () => {
    await expect(runCollectorMonteCarloAsync(3, 0)).rejects.toThrow('trials');
    await expect(runCollectorMonteCarloAsync(0, 1)).rejects.toThrow('n');
  });

  it('returns null when monte carlo is aborted at a chunk boundary', async () => {
    const controller = new AbortController();

    const result = await runCollectorMonteCarloAsync(
      1,
      2,
      {
        chunkSize: 1,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      },
      () => 0,
    );

    expect(result).toBeNull();
  });
});

describe('CouponCollector math: E[T] = n·H_n', () => {
  it('matches n·H_n for a range of n (closed-form check)', () => {
    // Known reference values of E[T] = n·H_n.
    const cases: Array<[number, number]> = [
      [1, 1],
      [2, 3],
      [3, 5.5],
      [6, 14.7],
      [10, 29.28968],
      [50, 224.96027],
      [100, 518.73775],
      [200, 1175.60638],
    ];
    for (const [n, expected] of cases) {
      expect(expectedDraws(n)).toBeCloseTo(expected, 2);
      // Redundant definition check: E[T] === n * H_n exactly.
      expect(expectedDraws(n)).toBeCloseTo(n * harmonic(n), 10);
    }
  });

  it('variance equals the sum of (n/i)^2 - n/i and std/n → π/√6 asymptotically', () => {
    // Direct definitional cross-check for n = 4.
    let v = 0;
    for (let i = 1; i <= 4; i++) v += (4 / i) ** 2 - 4 / i;
    expect(varianceDraws(4)).toBeCloseTo(v, 10);

    // Asymptotically Var(T) → n²·π²/6, so std(T)/n → π/√6 ≈ 1.2825.
    const ratio = stddevDraws(2000) / 2000;
    expect(ratio).toBeCloseTo(Math.PI / Math.sqrt(6), 1);
  });
});

describe('CouponCollector Monte Carlo: empirical ≈ theoretical', () => {
  it('empirical mean converges to n·H_n within tolerance (seeded, n=10)', async () => {
    const n = 10;
    const result = await runCollectorMonteCarloAsync(n, 30_000, {}, makeRng(12345));
    expect(result).not.toBeNull();
    const { meanDraws, theoreticalMean } = result!;
    // Sampling error of the mean ~ std/√trials = (0.64*10)/√30000 ≈ 0.037 of a
    // draw... but the mean itself is ~29.3, so relative error is tiny. Allow 1%.
    expect(Math.abs(meanDraws - theoreticalMean) / theoreticalMean).toBeLessThan(0.01);
  });

  it('empirical mean ≈ theoretical for n=20 with a different seed', async () => {
    const n = 20;
    const result = await runCollectorMonteCarloAsync(n, 20_000, {}, makeRng(98765));
    const { meanDraws, theoreticalMean } = result!;
    expect(meanDraws).toBeCloseTo(theoreticalMean, -1); // within ~5 draws of ~72
    expect(Math.abs(meanDraws - theoreticalMean) / theoreticalMean).toBeLessThan(0.02);
  });

  it('empirical std tracks the theoretical std', async () => {
    const n = 15;
    const result = await runCollectorMonteCarloAsync(n, 40_000, {}, makeRng(2024));
    const { empiricalStd, theoreticalStd } = result!;
    expect(Math.abs(empiricalStd - theoreticalStd) / theoreticalStd).toBeLessThan(0.05);
  });

  it('mean exceeds median (right-skewed distribution) and percentiles are ordered', async () => {
    const result = await runCollectorMonteCarloAsync(30, 20_000, {}, makeRng(7));
    const s = result!;
    expect(s.meanDraws).toBeGreaterThan(s.medianDraws);
    expect(s.minDraws).toBeLessThanOrEqual(s.medianDraws);
    expect(s.medianDraws).toBeLessThanOrEqual(s.p90Draws);
    expect(s.p90Draws).toBeLessThanOrEqual(s.p99Draws);
    expect(s.p99Draws).toBeLessThanOrEqual(s.maxDraws);
  });

  it('exposes a convergence trajectory that ends at the final empirical mean', async () => {
    const result = await runCollectorMonteCarloAsync(12, 5000, {}, makeRng(555));
    const s = result!;
    expect(s.convergence.length).toBeGreaterThan(10);
    // ascending trial checkpoints
    for (let i = 1; i < s.convergence.length; i++) {
      expect(s.convergence[i].trial).toBeGreaterThan(s.convergence[i - 1].trial);
    }
    const last = s.convergence[s.convergence.length - 1];
    expect(last.trial).toBe(s.trials);
    expect(last.mean).toBeCloseTo(s.meanDraws, 6);
  });
});

describe('percentileSorted', () => {
  it('interpolates linearly between ranks', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentileSorted(sorted, 0)).toBe(10);
    expect(percentileSorted(sorted, 100)).toBe(50);
    expect(percentileSorted(sorted, 50)).toBe(30);
    expect(percentileSorted(sorted, 25)).toBe(20);
    expect(percentileSorted(sorted, 75)).toBe(40);
  });

  it('handles degenerate inputs', () => {
    expect(percentileSorted([], 50)).toBeNaN();
    expect(percentileSorted([42], 90)).toBe(42);
  });
});
