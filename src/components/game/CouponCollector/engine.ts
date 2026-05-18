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

export interface SimSummary {
  trials: number;
  n: number;
  meanDraws: number;
  medianDraws: number;
  minDraws: number;
  maxDraws: number;
  /** Histogram-bucketed draw counts across trials, used for the distribution chart. */
  drawCounts: number[];
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
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) await new Promise<void>((res) => setTimeout(res, 0));
  }

  const sorted = [...drawCounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    trials,
    n,
    meanDraws: total / trials,
    medianDraws: median,
    minDraws: min,
    maxDraws: max,
    drawCounts,
    theoreticalMean: expectedDraws(n),
    theoreticalStd: stddevDraws(n),
  };
}
