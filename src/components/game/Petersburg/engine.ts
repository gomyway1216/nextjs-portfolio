/**
 * St. Petersburg Paradox.
 *
 * Flip a fair coin until tails appears. If the first tails is on flip n,
 * payoff = 2^(n-1):  T = $1, HT = $2, HHT = $4, HHHT = $8, …
 *
 *   E[X] = Σ (1/2)^n · 2^(n-1) = Σ 1/2 = ∞
 *
 * The mean is infinite — yet most people wouldn't pay more than $5–10 to
 * play. With N samples the empirical mean grows roughly like log₂(N)/2,
 * driven entirely by the rare-but-huge tail; the median stays around $1–2.
 */

/** Returns the number of flips until (and including) the first tails. */
export function flipsUntilTails(rng: () => number = Math.random): number {
  let n = 1;
  // 0.5 probability heads, keep going.
  while (rng() < 0.5) n++;
  return n;
}

/** Payoff in one game = 2^(n-1) where n is the position of the first tails. */
export function playGame(rng: () => number = Math.random): { n: number; payoff: number } {
  const n = flipsUntilTails(rng);
  // Cap exponent to keep JS Number representable (2^53 ≈ 9e15). After ~50
  // straight heads we just return Number.MAX_SAFE_INTEGER; this happens
  // with probability 2^-50 ≈ 9e-16 so doesn't perturb statistics visibly.
  if (n - 1 >= 53) return { n, payoff: Number.MAX_SAFE_INTEGER };
  return { n, payoff: 2 ** (n - 1) };
}

// ----- Sweep simulation -----

export interface SweepPoint {
  N: number;
  /** Running mean of the first N payoffs. */
  mean: number;
  /** Running median of the first N payoffs. */
  median: number;
  /** Running maximum of the first N payoffs. */
  max: number;
  /** Theoretical "fair price" ≈ log₂(N)/2 (the truncated expected value). */
  fairPrice: number;
}

export interface SweepSummary {
  maxN: number;
  /** Anchor points sampled along the way for the chart. */
  points: SweepPoint[];
  /** Distribution of payoffs (log₂(payoff) → count) for the histogram. */
  log2Hist: number[];
  /** Total games played. */
  total: number;
}

export interface SweepOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Number of log-spaced sample points to record (default 60). */
  samplePoints?: number;
}

/**
 * Plays `maxN` games, recording running mean/median/max at log-spaced
 * anchor points. Median is approximated by quickselect (insertion sort
 * on the small running buffer is cheap when we only need it at sample
 * points).
 */
export async function runPetersburgSweepAsync(
  maxN: number,
  options: SweepOptions = {},
  rng: () => number = Math.random,
): Promise<SweepSummary | null> {
  if (!Number.isInteger(maxN) || maxN <= 0) {
    throw new Error('runPetersburgSweepAsync: maxN must be a positive integer');
  }
  const sampleCount = options.samplePoints ?? 60;
  // Log-spaced anchor Ns: 1, …, maxN.
  const anchors = new Set<number>();
  const lo = Math.log10(1);
  const hi = Math.log10(maxN);
  for (let i = 0; i < sampleCount; i++) {
    anchors.add(Math.max(1, Math.round(Math.pow(10, lo + ((hi - lo) * i) / (sampleCount - 1)))));
  }
  anchors.add(maxN);

  let sum = 0;
  let max = 0;
  // Payoffs are powers of 2, so the log₂(payoff) buckets capture the full
  // distribution. We use this for both the histogram AND for an O(buckets)
  // median lookup at each anchor — much faster than the O(N log N) sort we
  // were doing before (jank at N=10⁶).
  const log2Hist: number[] = [];
  const points: SweepPoint[] = [];

  const medianFromHist = (N: number): number => {
    // The k-th order statistic in a bucketed power-of-2 distribution: walk the
    // cumulative count until we cross N/2. Bucket k holds the value 2^k.
    const targetLow = Math.floor((N - 1) / 2);
    const targetHigh = Math.floor(N / 2);
    let running = 0;
    let lowVal = 0;
    let highVal = 0;
    for (let k = 0; k < log2Hist.length; k++) {
      const c = log2Hist[k] ?? 0;
      const prev = running;
      running += c;
      if (lowVal === 0 && prev <= targetLow && running > targetLow) lowVal = 2 ** k;
      if (highVal === 0 && prev <= targetHigh && running > targetHigh) {
        highVal = 2 ** k;
        break;
      }
    }
    return (lowVal + highVal) / 2;
  };

  const chunk = 5000;
  for (let i = 0; i < maxN; i += chunk) {
    const end = Math.min(i + chunk, maxN);
    for (let j = i; j < end; j++) {
      const { payoff } = playGame(rng);
      sum += payoff;
      if (payoff > max) max = payoff;
      const bucket = payoff >= Number.MAX_SAFE_INTEGER ? 60 : Math.floor(Math.log2(payoff));
      log2Hist[bucket] = (log2Hist[bucket] ?? 0) + 1;
      const N = j + 1;
      if (anchors.has(N)) {
        points.push({
          N,
          mean: sum / N,
          median: medianFromHist(N),
          max,
          fairPrice: Math.log2(N) / 2,
        });
      }
    }
    options.onProgress?.(end, maxN);
    if (options.signal?.aborted) return null;
    if (end < maxN) await new Promise<void>((res) => setTimeout(res, 0));
  }

  // Fill missing buckets with 0 for clean plotting.
  for (let i = 0; i < log2Hist.length; i++) if (log2Hist[i] === undefined) log2Hist[i] = 0;

  return { maxN, points, log2Hist, total: maxN };
}
