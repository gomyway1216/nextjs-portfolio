import { describe, expect, it } from 'vitest';
import {
  expectedLog2Payoff,
  fairPriceForN,
  flipsUntilTails,
  logUtilityFairPrice,
  makeRng,
  partialExpectedValue,
  payoffForFlips,
  playGame,
  probOfFlips,
  runPetersburgSweepAsync,
} from '@/components/game/Petersburg/engine';

/** Deterministic rng that replays a fixed list of values (then a fallback). */
function sequence(values: number[], fallback = 0.9): () => number {
  let i = 0;
  return () => values[i++] ?? fallback;
}

describe('Petersburg payoff mechanics', () => {
  it('pays 2^(k-1) where k is the flip that first lands tails', () => {
    // 0.3 < 0.5 => heads (continue), 0.9 >= 0.5 => tails (stop).
    expect(flipsUntilTails(sequence([0.9]))).toBe(1); // immediate tails
    expect(payoffForFlips(1)).toBe(1); // T -> $1

    expect(flipsUntilTails(sequence([0.3, 0.9]))).toBe(2); // HT
    expect(payoffForFlips(2)).toBe(2); // HT -> $2

    expect(flipsUntilTails(sequence([0.1, 0.1, 0.9]))).toBe(3); // HHT
    expect(payoffForFlips(3)).toBe(4); // HHT -> $4

    expect(payoffForFlips(4)).toBe(8); // HHHT -> $8
    expect(payoffForFlips(11)).toBe(1024); // 2^10
  });

  it('playGame returns matching n and payoff', () => {
    const { n, payoff } = playGame(sequence([0.2, 0.2, 0.2, 0.99]));
    expect(n).toBe(4);
    expect(payoff).toBe(8);
  });

  it('caps huge exponents at MAX_SAFE_INTEGER without NaN/Infinity', () => {
    const capped = payoffForFlips(60);
    expect(capped).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isFinite(capped)).toBe(true);
  });
});

describe('Petersburg divergent expected value', () => {
  it('has every EV term equal to exactly 1/2', () => {
    // term(n) = P(n) * payoff(n) = (1/2)^n * 2^(n-1) = 1/2
    for (let n = 1; n <= 30; n++) {
      expect(probOfFlips(n) * payoffForFlips(n)).toBeCloseTo(0.5, 12);
    }
  });

  it('partial sum after m terms equals m/2 (diverges as m -> infinity)', () => {
    expect(partialExpectedValue(2)).toBe(1);
    expect(partialExpectedValue(20)).toBe(10);
    expect(partialExpectedValue(200)).toBe(100);
    // grows without bound
    expect(partialExpectedValue(1e6)).toBeGreaterThan(partialExpectedValue(1e5));
  });

  it('probabilities form a proper distribution summing to 1', () => {
    let s = 0;
    for (let n = 1; n <= 60; n++) s += probOfFlips(n);
    expect(s).toBeCloseTo(1, 10);
  });
});

describe('Petersburg fair-price / utility resolutions', () => {
  it('truncated fair price tracks log2(N)/2', () => {
    expect(fairPriceForN(1)).toBe(0);
    expect(fairPriceForN(4)).toBeCloseTo(1); // log2(4)/2 = 1
    expect(fairPriceForN(1024)).toBeCloseTo(5); // log2(1024)/2 = 5
    expect(fairPriceForN(1_000_000)).toBeCloseTo(Math.log2(1_000_000) / 2);
  });

  it('E[log2(payoff)] = 1 (log-utility certainty equivalent of the prize is $2)', () => {
    expect(expectedLog2Payoff()).toBe(1);
    // Confirm numerically from the series: sum (1/2)^n * (n-1) = 1.
    let s = 0;
    for (let n = 1; n <= 60; n++) s += probOfFlips(n) * (n - 1);
    expect(s).toBeCloseTo(1, 6);
  });

  it('log-utility willingness-to-pay is finite and increases with wealth', () => {
    const p10 = logUtilityFairPrice(10);
    const p1k = logUtilityFairPrice(1_000);
    const p1m = logUtilityFairPrice(1_000_000);
    // All finite and modest despite infinite raw EV.
    expect(p10).toBeGreaterThan(0);
    expect(p10).toBeLessThan(10);
    expect(p1m).toBeLessThan(50);
    // Monotonically increasing in wealth.
    expect(p1k).toBeGreaterThan(p10);
    expect(p1m).toBeGreaterThan(p1k);
  });

  it('log-utility fair price satisfies the indifference equation E[ln(w-c+X)] = ln(w)', () => {
    const wealth = 1000;
    const c = logUtilityFairPrice(wealth);
    let eu = 0;
    for (let n = 1; n <= 60; n++) {
      eu += probOfFlips(n) * Math.log(wealth - c + payoffForFlips(n));
    }
    expect(eu).toBeCloseTo(Math.log(wealth), 3);
  });

  it('returns 0 for non-positive wealth', () => {
    expect(logUtilityFairPrice(0)).toBe(0);
    expect(logUtilityFairPrice(-5)).toBe(0);
  });
});

describe('Petersburg empirical-mean growth (the paradox in action)', () => {
  it('empirical mean grows roughly like log2(N)/2, not to a finite limit', async () => {
    // Same seed, increasing N. Because the tail dominates, the mean is noisy,
    // but the mean at large N should exceed the mean at small N and stay in a
    // band around log2(N)/2 rather than converging.
    const meanAt = async (N: number) => {
      const summary = await runPetersburgSweepAsync(N, {}, makeRng(12345));
      return summary!.finalMean;
    };
    const m1e4 = await meanAt(10_000);
    const m1e6 = await meanAt(1_000_000);

    // Larger N -> larger empirical mean (does not settle to a constant).
    expect(m1e6).toBeGreaterThan(m1e4);
    // And it stays within a generous band of the log2(N)/2 prediction
    // (the mean is heavy-tailed, so we allow a wide multiplicative window).
    const predicted = Math.log2(1_000_000) / 2; // ~9.97
    expect(m1e6).toBeGreaterThan(predicted * 0.5);
    expect(m1e6).toBeLessThan(predicted * 2.5);
  });

  it('median stays pinned near $1-2 even as N grows huge', async () => {
    const summary = await runPetersburgSweepAsync(500_000, {}, makeRng(7));
    expect(summary!.finalMedian).toBeGreaterThanOrEqual(1);
    expect(summary!.finalMedian).toBeLessThanOrEqual(2);
  });

  it('payoff distribution is geometric: each log2 bucket ~ half the previous', async () => {
    const N = 400_000;
    const summary = await runPetersburgSweepAsync(N, {}, makeRng(2024));
    const hist = summary!.log2Hist;
    // Bucket 0 = $1 (~N/2), bucket 1 = $2 (~N/4), bucket 2 = $4 (~N/8) ...
    expect(hist[0] / N).toBeCloseTo(0.5, 1);
    expect(hist[1] / N).toBeCloseTo(0.25, 1);
    expect(hist[2] / N).toBeCloseTo(0.125, 1);
    // Ratio of consecutive buckets ~ 0.5 for the well-populated low buckets.
    for (let k = 0; k < 4; k++) {
      expect(hist[k + 1] / hist[k]).toBeCloseTo(0.5, 1);
    }
  });

  it('is reproducible for a fixed seed and varies across seeds', async () => {
    const a = await runPetersburgSweepAsync(20_000, {}, makeRng(99));
    const b = await runPetersburgSweepAsync(20_000, {}, makeRng(99));
    const c = await runPetersburgSweepAsync(20_000, {}, makeRng(100));
    expect(a!.finalMean).toBe(b!.finalMean);
    expect(a!.finalMean).not.toBe(c!.finalMean);
  });
});

describe('Petersburg sweep bookkeeping', () => {
  it('records log-spaced anchor points ending at maxN and reports summary fields', async () => {
    const summary = await runPetersburgSweepAsync(50_000, {}, makeRng(1));
    expect(summary).not.toBeNull();
    expect(summary!.total).toBe(50_000);
    expect(summary!.points[summary!.points.length - 1].N).toBe(50_000);
    expect(summary!.finalMax).toBeGreaterThanOrEqual(1);
    expect(summary!.maxFlips).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid maxN', async () => {
    await expect(runPetersburgSweepAsync(0)).rejects.toThrow('positive integer');
    await expect(runPetersburgSweepAsync(-3)).rejects.toThrow('positive integer');
    await expect(runPetersburgSweepAsync(1.5)).rejects.toThrow('positive integer');
  });

  it('returns null when aborted at a chunk boundary', async () => {
    const controller = new AbortController();
    const result = await runPetersburgSweepAsync(
      20_000,
      { signal: controller.signal, onProgress: () => controller.abort() },
      makeRng(5),
    );
    expect(result).toBeNull();
  });
});
