/**
 * St. Petersburg Paradox.
 *
 * Flip a fair coin until tails appears. If the first tails is on flip n
 * (n ≥ 1), the payoff is 2^(n-1):  T = $1, HT = $2, HHT = $4, HHHT = $8, …
 *
 *   P(first tails on flip n) = (1/2)^n
 *   payoff(n)                = 2^(n-1)
 *   E[X] = Σ_{n≥1} (1/2)^n · 2^(n-1) = Σ_{n≥1} 1/2 = ∞
 *
 * Every term in the expected-value sum equals exactly 1/2, so the partial
 * sum after n terms is n/2 — the mean is infinite. Yet most people won't
 * pay more than a few dollars to play. With N samples the empirical mean
 * grows only like log₂(N)/2, driven entirely by the rare-but-huge tail,
 * while the median stays pinned at $1–2. That gap is the paradox.
 *
 * Two classic "why won't people pay ∞?" resolutions are computed here:
 *  1. Truncated / finite-horizon fair price ≈ log₂(N)/2 (see fairPriceForN).
 *  2. Bernoulli's expected-utility (log utility) certainty equivalent
 *     (see logUtilityFairPrice) — a bounded willingness-to-pay for a player
 *     with finite wealth.
 */

/** Smallest coin count we cap at, past which 2^(n-1) leaves safe-integer range. */
const MAX_SAFE_EXPONENT = 53;

/**
 * A tiny seedable PRNG (mulberry32). Deterministic given a seed, which lets
 * tests assert exact sequences and lets the UI reproduce a run.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns the number of flips until (and including) the first tails. */
export function flipsUntilTails(rng: () => number = Math.random): number {
  let n = 1;
  // rng() < 0.5 => heads, keep going.
  while (rng() < 0.5) n++;
  return n;
}

/** Payoff for a game whose first tails is on flip n: 2^(n-1). */
export function payoffForFlips(n: number): number {
  // Cap the exponent to keep JS Numbers exact (2^53 ≈ 9e15). After ~53
  // straight heads we return Number.MAX_SAFE_INTEGER; this happens with
  // probability < 2^-53 so it never perturbs statistics visibly.
  if (n - 1 >= MAX_SAFE_EXPONENT) return Number.MAX_SAFE_INTEGER;
  return 2 ** (n - 1);
}

/** Play one game. Returns the first-tails flip index and the payoff 2^(n-1). */
export function playGame(rng: () => number = Math.random): { n: number; payoff: number } {
  const n = flipsUntilTails(rng);
  return { n, payoff: payoffForFlips(n) };
}

/** Probability the first tails lands on flip n: (1/2)^n. */
export function probOfFlips(n: number): number {
  return Math.pow(0.5, n);
}

/**
 * Partial expected value after summing the first `terms` outcomes.
 * Each term contributes exactly 1/2, so this is terms/2 — the closed form
 * that makes the divergence obvious.
 */
export function partialExpectedValue(terms: number): number {
  if (terms <= 0) return 0;
  return terms / 2;
}

/**
 * The "truncated" fair price for a bank that can only pay out for the first
 * N games' worth of outcomes ≈ log₂(N)/2. This is what the empirical mean of
 * N plays hovers around.
 */
export function fairPriceForN(N: number): number {
  if (N <= 1) return 0;
  return Math.log2(N) / 2;
}

/**
 * E[log₂(payoff)] = Σ (1/2)^n · (n-1) = 1. The "prize-only" log-utility
 * certainty equivalent is therefore 2^1 = $2 (independent of wealth).
 */
export function expectedLog2Payoff(): number {
  return 1;
}

/**
 * Bernoulli's resolution: a player with wealth `w` and logarithmic utility
 * pays the price c that leaves expected utility unchanged, i.e. solves
 *
 *   E[ ln(w − c + payoff) ] = ln(w)
 *
 * The left side is decreasing in c, so we bisect for the unique root in
 * [0, w). Returns a finite, wealth-dependent willingness-to-pay — small even
 * though the raw expected value is infinite.
 */
export function logUtilityFairPrice(wealth: number, maxTerms = 60): number {
  if (!(wealth > 0)) return 0;

  // Expected utility of paying price c, truncating the (convergent) series.
  const expectedUtility = (c: number): number => {
    let eu = 0;
    for (let n = 1; n <= maxTerms; n++) {
      const p = probOfFlips(n);
      const payoff = payoffForFlips(n);
      const finalWealth = wealth - c + payoff;
      // finalWealth ≥ wealth - c + 1 > 0 for c < wealth, so ln is safe.
      eu += p * Math.log(finalWealth);
    }
    return eu;
  };

  const target = Math.log(wealth);
  let lo = 0;
  // Willingness-to-pay never exceeds wealth (can't risk going broke with log
  // utility); keep hi strictly below wealth to stay in the domain.
  let hi = wealth * (1 - 1e-9);
  // Monotone decreasing: EU(lo) ≥ target ≥ EU(hi). Bisection.
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (expectedUtility(mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
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
  /** Final running mean over all N games. */
  finalMean: number;
  /** Final running median over all N games. */
  finalMedian: number;
  /** Largest payoff observed. */
  finalMax: number;
  /** Longest head-streak observed (flips-until-tails). */
  maxFlips: number;
}

export interface SweepOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Number of log-spaced sample points to record (default 60). */
  samplePoints?: number;
}

/**
 * Plays `maxN` games, recording running mean/median/max at log-spaced
 * anchor points. Because every payoff is a power of two we bucket by
 * log₂(payoff); that bucketed distribution gives both the histogram and an
 * O(buckets) running median (no O(N log N) sort — avoids jank at N = 10⁶).
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
  let maxFlips = 0;
  const log2Hist: number[] = [];
  const points: SweepPoint[] = [];

  const medianFromHist = (N: number): number => {
    // k-th order statistic in a bucketed power-of-2 distribution: walk the
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
      const { n, payoff } = playGame(rng);
      sum += payoff;
      if (payoff > max) max = payoff;
      if (n > maxFlips) maxFlips = n;
      const bucket = payoff >= Number.MAX_SAFE_INTEGER ? 60 : Math.floor(Math.log2(payoff));
      log2Hist[bucket] = (log2Hist[bucket] ?? 0) + 1;
      const N = j + 1;
      if (anchors.has(N)) {
        points.push({
          N,
          mean: sum / N,
          median: medianFromHist(N),
          max,
          fairPrice: fairPriceForN(N),
        });
      }
    }
    options.onProgress?.(end, maxN);
    if (options.signal?.aborted) return null;
    if (end < maxN) await new Promise<void>((res) => setTimeout(res, 0));
  }

  // Fill missing buckets with 0 for clean plotting.
  for (let i = 0; i < log2Hist.length; i++) if (log2Hist[i] === undefined) log2Hist[i] = 0;

  const finalPoint = points[points.length - 1];
  return {
    maxN,
    points,
    log2Hist,
    total: maxN,
    finalMean: sum / maxN,
    finalMedian: finalPoint?.median ?? medianFromHist(maxN),
    finalMax: max,
    maxFlips,
  };
}
