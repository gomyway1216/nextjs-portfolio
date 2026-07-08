import { describe, expect, it } from 'vitest';
import {
  buildHistogram,
  expectedDuration,
  fairExpectedDuration,
  runRuin,
  runRuinMonteCarloAsync,
  theoreticalRuinProb,
} from '@/components/game/GamblersRuin/engine';

function sequence(values: number[], fallback = 0): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

/**
 * Small seeded PRNG (mulberry32) so Monte-Carlo assertions are deterministic
 * across runs and machines.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('GamblersRuin engine', () => {
  it('computes fair-game ruin probability and duration', () => {
    expect(theoreticalRuinProb({ start: 3, target: 10, winProb: 0.5 })).toBe(0.7);
    expect(fairExpectedDuration({ start: 3, target: 10, winProb: 0.5 })).toBe(21);
    expect(expectedDuration({ start: 3, target: 10, winProb: 0.5 })).toBe(21);
    expect(expectedDuration({ start: 10, target: 20, winProb: 0.5 })).toBe(100);
  });

  it('stays numerically stable for p extremely close to 0.5', () => {
    // The biased closed forms divide by (q - p); without a fair-game epsilon
    // snap these would lose significance and drift from the true values.
    expect(expectedDuration({ start: 10, target: 20, winProb: 0.50000001 })).toBeCloseTo(100, 5);
    expect(expectedDuration({ start: 10, target: 20, winProb: 0.49999999 })).toBeCloseTo(100, 5);
    expect(theoreticalRuinProb({ start: 10, target: 20, winProb: 0.50000001 })).toBeCloseTo(0.5, 5);
    expect(theoreticalRuinProb({ start: 10, target: 20, winProb: 0.49999999 })).toBeCloseTo(0.5, 5);
  });

  it('matches the closed-form ruin probability for fair and biased cases', () => {
    // Fair game: P(ruin) = (N - a) / N.
    expect(theoreticalRuinProb({ start: 4, target: 10, winProb: 0.5 })).toBeCloseTo(0.6, 12);
    expect(theoreticalRuinProb({ start: 1, target: 4, winProb: 0.5 })).toBeCloseTo(0.75, 12);

    // Biased game closed form: ((q/p)^a - (q/p)^N) / (1 - (q/p)^N).
    const biased = (a: number, N: number, p: number) => {
      const r = (1 - p) / p;
      return (r ** a - r ** N) / (1 - r ** N);
    };
    for (const [a, N, p] of [
      [10, 20, 0.45],
      [5, 20, 0.55],
      [3, 12, 0.6],
      [8, 15, 0.4],
    ] as const) {
      expect(theoreticalRuinProb({ start: a, target: N, winProb: p })).toBeCloseTo(biased(a, N, p), 10);
    }
  });

  it('computes the biased-game expected duration in closed form', () => {
    // E[T] = a/(q-p) - (N/(q-p)) * (1 - (q/p)^a)/(1 - (q/p)^N).
    const edur = (a: number, N: number, p: number) => {
      const q = 1 - p;
      const r = q / p;
      return a / (q - p) - (N / (q - p)) * (1 - r ** a) / (1 - r ** N);
    };
    for (const [a, N, p] of [
      [10, 20, 0.45],
      [5, 20, 0.55],
      [50, 100, 0.4],
    ] as const) {
      expect(expectedDuration({ start: a, target: N, winProb: p })).toBeCloseTo(edur(a, N, p), 6);
    }
    // Guard the boundaries.
    expect(expectedDuration({ start: 0, target: 10, winProb: 0.4 })).toBe(0);
    expect(expectedDuration({ start: 10, target: 10, winProb: 0.4 })).toBe(0);
  });

  it('Monte-Carlo ruin rate converges to the closed form (fair and biased)', async () => {
    for (const [a, N, p] of [
      [10, 20, 0.5],
      [10, 20, 0.45],
      [5, 20, 0.55],
    ] as const) {
      const cfg = { start: a, target: N, winProb: p };
      const summary = await runRuinMonteCarloAsync(cfg, 20_000, 200_000, {}, mulberry32(12345 + a + N));
      expect(summary).not.toBeNull();
      // Empirical ruin within 2 percentage points (absolute) of the closed form
      // at >=20k trials. Use an explicit tolerance — toBeCloseTo's 2nd arg is a
      // digit count, not a percentage-point tolerance.
      expect(Math.abs(summary!.empiricalRuinProb - theoreticalRuinProb(cfg))).toBeLessThan(0.02);
      // Mean steps within 5% (relative) of the theoretical expected duration.
      const expected = expectedDuration(cfg);
      expect(Math.abs(summary!.meanSteps - expected) / expected).toBeLessThan(0.05);
    }
  });

  it('buildHistogram bins values and preserves the total count', () => {
    const hist = buildHistogram([1, 1, 2, 3, 5, 8, 8, 8], 4);
    expect(hist).toHaveLength(4);
    expect(hist.reduce((s, b) => s + b.count, 0)).toBe(8);
    expect(hist[0].binStart).toBeLessThan(hist[hist.length - 1].binEnd);
    expect(buildHistogram([], 4)).toEqual([]);
  });

  it('buildHistogram tolerates invalid bin counts', () => {
    // Non-positive / non-integer bin counts must not produce Infinity widths,
    // NaN, or throw from Array.from.
    for (const bad of [0, -3, 2.7, NaN, Infinity]) {
      const hist = buildHistogram([1, 2, 3, 4], bad);
      expect(hist.length).toBeGreaterThanOrEqual(1);
      expect(hist.reduce((s, b) => s + b.count, 0)).toBe(4);
      expect(hist.every((b) => Number.isFinite(b.binStart) && Number.isFinite(b.binEnd))).toBe(true);
    }
  });

  it('handles biased-game boundaries without overflow', () => {
    expect(theoreticalRuinProb({ start: 0, target: 10, winProb: 0.4 })).toBe(1);
    expect(theoreticalRuinProb({ start: 10, target: 10, winProb: 0.4 })).toBe(0);
    expect(theoreticalRuinProb({ start: 2, target: 200, winProb: 0.01 })).toBeGreaterThan(0.99);
    expect(fairExpectedDuration({ start: 3, target: 10, winProb: 0.49 })).toBeNaN();
  });

  it('runs deterministic paths to reached, ruined, or capped outcomes', () => {
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 5, () => 0).outcome).toBe('reached');
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 5, () => 1).outcome).toBe('ruined');
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 1, () => 0).outcome).toBe('capped');
  });

  it('rejects invalid run inputs', () => {
    expect(() => runRuin({ start: 0, target: 4, winProb: 0.5 }, 5)).toThrow('start');
    expect(() => runRuin({ start: 2, target: 4, winProb: 0 }, 5)).toThrow('winProb');
  });

  it('runs deterministic monte carlo trials across all outcomes', async () => {
    const progress: Array<[number, number]> = [];
    const rng = sequence([0, 0, 1, 1, 0, 1, 0, 1]);

    const result = await runRuinMonteCarloAsync(
      { start: 2, target: 4, winProb: 0.5 },
      3,
      4,
      {
        chunkSize: 1,
        onProgress: (done, total) => progress.push([done, total]),
      },
      rng,
    );

    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(result).toMatchObject({
      trials: 3,
      maxSteps: 4,
      ruinedCount: 1,
      reachedCount: 1,
      cappedCount: 1,
      empiricalRuinProb: 1 / 3,
      meanSteps: 8 / 3,
      medianSteps: 2,
      allSteps: [2, 2, 4],
    });
    expect(result?.theoreticalRuinProb).toBe(0.5);
  });

  it('validates monte carlo inputs', async () => {
    await expect(runRuinMonteCarloAsync({ start: 1, target: 2, winProb: 0.5 }, 0, 1)).rejects.toThrow('trials');
    await expect(runRuinMonteCarloAsync({ start: 1, target: 2, winProb: 0.5 }, 1, 0)).rejects.toThrow('maxSteps');
  });

  it('returns null when monte carlo is aborted at a chunk boundary', async () => {
    const controller = new AbortController();

    const result = await runRuinMonteCarloAsync(
      { start: 1, target: 2, winProb: 0.5 },
      2,
      1,
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
