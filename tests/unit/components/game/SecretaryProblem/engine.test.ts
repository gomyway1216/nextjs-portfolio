import { describe, expect, it } from 'vitest';
import {
  generateCandidates,
  runTrial,
  runSecretarySweepAsync,
  theoreticalRate,
  SUGGESTED_R_RATIO,
} from '@/components/game/SecretaryProblem/engine';

/** Deterministic RNG helper for reproducible permutations. */
function sequence(values: number[], fallback = 0): () => number {
  let i = 0;
  return () => values[i++] ?? fallback;
}

/** Mulberry32 — small, fast, seedable PRNG for statistical tests. */
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

describe('generateCandidates', () => {
  it('produces a permutation of 1..n', () => {
    const arr = generateCandidates(10, mulberry32(1));
    expect(arr).toHaveLength(10);
    expect([...arr].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('is deterministic under a seeded rng', () => {
    const a = generateCandidates(20, mulberry32(42));
    const b = generateCandidates(20, mulberry32(42));
    expect(a).toEqual(b);
  });
});

describe('theoreticalRate (Lindley formula)', () => {
  it('matches the exact hand-computed values for n = 3', () => {
    // n=3: r=0 -> 1/3, r=1 -> 1/2 (the classic exact optimum), r=2 -> 1/3.
    expect(theoreticalRate(0, 3)).toBeCloseTo(1 / 3, 10);
    expect(theoreticalRate(1, 3)).toBeCloseTo(1 / 2, 10);
    expect(theoreticalRate(2, 3)).toBeCloseTo(1 / 3, 10);
  });

  it('r=0 and r=n both give 1/n', () => {
    expect(theoreticalRate(0, 50)).toBeCloseTo(1 / 50, 10);
    expect(theoreticalRate(50, 50)).toBeCloseTo(1 / 50, 10);
  });

  it('peaks near n/e with value near 1/e for large n', () => {
    const n = 1000;
    let bestR = 0;
    let best = 0;
    for (let r = 0; r < n; r++) {
      const v = theoreticalRate(r, n);
      if (v > best) {
        best = v;
        bestR = r;
      }
    }
    // Optimal cutoff fraction and win probability both converge to 1/e.
    expect(bestR / n).toBeCloseTo(1 / Math.E, 2);
    expect(best).toBeCloseTo(1 / Math.E, 2);
  });
});

describe('runTrial', () => {
  it('accepts the first observation-phase-beating candidate', () => {
    // Observe first 2 (max 3), then hire the first > 3: that is 5 at index 3.
    const cands = [3, 1, 2, 5, 4];
    const res = runTrial(cands, 2);
    expect(res.pickedIndex).toBe(3);
    expect(res.picked).toBe(5);
    expect(res.isBest).toBe(true);
    expect(res.forcedLast).toBe(false);
  });

  it('forces the last candidate when nobody beats the observed best', () => {
    // Observe first 2 (max 5); nobody after beats 5, so last is forced.
    const cands = [5, 4, 3, 2, 1];
    const res = runTrial(cands, 2);
    expect(res.forcedLast).toBe(true);
    expect(res.pickedIndex).toBe(4);
    expect(res.picked).toBe(1);
    expect(res.isBest).toBe(false);
  });

  it('r=0 hires the very first candidate', () => {
    const res = runTrial([2, 5, 1, 4, 3], 0);
    expect(res.pickedIndex).toBe(0);
    expect(res.picked).toBe(2);
  });

  it('uses a deterministic permutation via seeded rng', () => {
    const cands = generateCandidates(6, sequence([0.9, 0.1, 0.5, 0.2, 0.8]));
    const res = runTrial(cands, 2);
    // Just assert it returns a coherent result on the fixed permutation.
    expect(res.picked).toBe(cands[res.pickedIndex as number]);
    expect(res.isBest).toBe(res.picked === Math.max(...cands));
  });
});

describe('runSecretarySweepAsync — empirical vs theory', () => {
  it('empirical success rate matches theory across all r (n=50)', async () => {
    const n = 50;
    const trials = 20_000;
    const summary = await runSecretarySweepAsync(n, trials, {}, mulberry32(12345));
    expect(summary).not.toBeNull();
    if (!summary) return;

    // Every r point should be within a tight tolerance of the Lindley theory.
    // SE of a proportion with 20k trials is <= 0.5/sqrt(20000) ≈ 0.0035, so
    // 0.02 comfortably covers Monte-Carlo noise across all 50 points.
    for (const p of summary.points) {
      expect(Math.abs(p.successRate - p.theoretical)).toBeLessThan(0.02);
    }
  });

  it('optimal cutoff (~37%) achieves ~1/e success rate', async () => {
    const n = 100;
    const trials = 40_000;
    const summary = await runSecretarySweepAsync(n, trials, {}, mulberry32(2024));
    expect(summary).not.toBeNull();
    if (!summary) return;

    // Empirical optimum should sit near the n/e cutoff fraction.
    expect(summary.bestR / n).toBeCloseTo(SUGGESTED_R_RATIO, 1);

    // Success rate at the theoretical cutoff r = round(n/e) must be close to 1/e.
    const rStar = Math.round(n * SUGGESTED_R_RATIO);
    const atOptimum = summary.points[rStar].successRate;
    expect(atOptimum).toBeGreaterThan(0.34);
    expect(atOptimum).toBeLessThan(0.4);
    expect(Math.abs(atOptimum - 1 / Math.E)).toBeLessThan(0.02);
  });

  it('endpoints r=0 and r=n-1 are both ~1/n', async () => {
    const n = 60;
    const trials = 20_000;
    const summary = await runSecretarySweepAsync(n, trials, {}, mulberry32(7));
    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(Math.abs(summary.points[0].successRate - 1 / n)).toBeLessThan(0.01);
    expect(Math.abs(summary.points[n - 1].successRate - 1 / n)).toBeLessThan(0.01);
  });

  it('reports progress and honors abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const summary = await runSecretarySweepAsync(20, 1000, { signal: controller.signal }, mulberry32(1));
    expect(summary).toBeNull();
  });

  it('rejects invalid arguments', async () => {
    await expect(runSecretarySweepAsync(1, 100)).rejects.toThrow();
    await expect(runSecretarySweepAsync(10, 0)).rejects.toThrow();
  });
});
