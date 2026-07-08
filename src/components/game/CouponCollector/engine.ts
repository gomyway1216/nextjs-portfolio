/**
 * Coupon collector engine.
 *
 * You're collecting a set of N distinct items (e.g., ガチャ). Each draw is
 * uniformly random over the N items. Expected number of draws to collect
 * all N is E[T] = N * H_N where H_N is the N-th harmonic number. This grows
 * roughly N * ln(N) + γ * N, much faster than N itself — the "last few"
 * coupons take by far the longest.
 *
 *   N=10   → E[T] ≈ 29.3
 *   N=50   → E[T] ≈ 224.9
 *   N=100  → E[T] ≈ 518.7
 *   N=200  → E[T] ≈ 1175.6
 */

export function harmonic(n: number): number {
  let h = 0;
  for (let i = 1; i <= n; i++) h += 1 / i;
  return h;
}

/** Expected number of draws to collect all N. */
export function expectedDraws(n: number): number {
  return n * harmonic(n);
}

/** Variance of T (the number of draws until completion). */
export function varianceDraws(n: number): number {
  let v = 0;
  for (let i = 1; i <= n; i++) v += (n / i) ** 2 - n / i;
  return v;
}

export function stddevDraws(n: number): number {
  return Math.sqrt(varianceDraws(n));
}

/**
 * Simulate one collection run, returning the number of draws and the count of
 * each item received (length n). Also returns a per-draw running "unique count"
 * trajectory so the UI can plot the famous diminishing-returns curve.
 */
export interface RunResult {
  draws: number;
  counts: number[];
  /** uniqueCount[i] = number of distinct items collected after i+1 draws. */
  uniqueCurve: number[];
}

export function runCollection(n: number, rng: () => number = Math.random): RunResult {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('runCollection: n must be a positive integer');
  }
  const counts = new Array<number>(n).fill(0);
  const uniqueCurve: number[] = [];
  let unique = 0;
  let draws = 0;
  // Safety cap (extremely unlikely to hit): 100 * E[T].
  const cap = Math.max(1000, Math.ceil(n * harmonic(n) * 100));
  while (unique < n && draws < cap) {
    const idx = Math.floor(rng() * n);
    if (counts[idx] === 0) unique++;
    counts[idx]++;
    draws++;
    uniqueCurve.push(unique);
  }
  return { draws, counts, uniqueCurve };
}

// ---------- Simulation ----------

/**
 * Percentile (0..100) of a numeric array using linear interpolation between
 * the two nearest ranks. `sorted` must already be ascending.
 */
export function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export interface SimSummary {
  trials: number;
  n: number;
  meanDraws: number;
  medianDraws: number;
  minDraws: number;
  maxDraws: number;
  /** Sample standard deviation of the simulated draw counts. */
  empiricalStd: number;
  /** 90th percentile — the "unlucky" completion time. */
  p90Draws: number;
  /** 99th percentile — the long right tail. */
  p99Draws: number;
  /** Histogram-bucketed draw counts across trials, used for the distribution chart. */
  drawCounts: number[];
  /**
   * Running empirical mean sampled at increasing trial counts, for the
   * convergence chart (empirical mean → theoretical n·H_n).
   */
  convergence: { trial: number; mean: number }[];
  theoreticalMean: number;
  theoreticalStd: number;
}

export interface SimOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  chunkSize?: number;
}

export async function runCollectorMonteCarloAsync(
  n: number,
  trials: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<SimSummary | null> {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runCollectorMonteCarloAsync: trials must be a positive integer');
  }
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('runCollectorMonteCarloAsync: n must be a positive integer');
  }
  const chunkSize = options.chunkSize ?? 2000;
  const drawCounts: number[] = new Array(trials);
  // Reusable seen-flag buffer + counter — avoids allocating a Set per trial.
  // At 200k trials that's a meaningful GC win.
  const seen = new Uint8Array(n);
  let total = 0;
  let min = Infinity;
  let max = -Infinity;

  // Running-mean samples for the convergence chart. We record ~120 points on a
  // roughly log-spaced schedule so early wobble and late convergence both show.
  const convergence: { trial: number; mean: number }[] = [];
  const sampleTargets = buildConvergenceSchedule(trials);
  let nextSampleIdx = 0;

  for (let i = 0; i < trials; i += chunkSize) {
    const end = Math.min(i + chunkSize, trials);
    for (let j = i; j < end; j++) {
      seen.fill(0);
      let unique = 0;
      let draws = 0;
      while (unique < n) {
        const idx = Math.floor(rng() * n);
        if (seen[idx] === 0) {
          seen[idx] = 1;
          unique++;
        }
        draws++;
      }
      drawCounts[j] = draws;
      total += draws;
      if (draws < min) min = draws;
      if (draws > max) max = draws;

      const done = j + 1;
      while (nextSampleIdx < sampleTargets.length && done === sampleTargets[nextSampleIdx]) {
        convergence.push({ trial: done, mean: total / done });
        nextSampleIdx++;
      }
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) await new Promise<void>((res) => setTimeout(res, 0));
  }

  const sorted = [...drawCounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const mean = total / trials;

  // Sample variance (n-1 denominator) → empirical standard deviation.
  let sq = 0;
  for (let i = 0; i < trials; i++) {
    const d = drawCounts[i] - mean;
    sq += d * d;
  }
  const empiricalStd = trials > 1 ? Math.sqrt(sq / (trials - 1)) : 0;

  return {
    trials,
    n,
    meanDraws: mean,
    medianDraws: median,
    minDraws: min,
    maxDraws: max,
    empiricalStd,
    p90Draws: percentileSorted(sorted, 90),
    p99Draws: percentileSorted(sorted, 99),
    drawCounts,
    convergence,
    theoreticalMean: expectedDraws(n),
    theoreticalStd: stddevDraws(n),
  };
}

/**
 * Build an ascending list of trial-count checkpoints (roughly log-spaced) at
 * which to snapshot the running mean. Always includes trial 1 and the final
 * trial so the convergence curve spans the whole run.
 */
function buildConvergenceSchedule(trials: number): number[] {
  if (trials <= 1) return [trials];
  const points = 120;
  const set = new Set<number>();
  set.add(1);
  const logMax = Math.log(trials);
  for (let k = 0; k < points; k++) {
    const t = Math.round(Math.exp((logMax * k) / (points - 1)));
    set.add(Math.min(trials, Math.max(1, t)));
  }
  set.add(trials);
  return [...set].sort((a, b) => a - b);
}
