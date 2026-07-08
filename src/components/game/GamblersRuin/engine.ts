/**
 * Gambler's ruin engine.
 *
 * You start with $a, play a fair-ish 1-unit even-money game each step,
 * and stop when you hit either $0 (ruin) or $N (target). Even in a perfectly
 * fair game (p=0.5) with infinite time, the probability of reaching N before
 * 0 is just a/N — proportional to your starting fortune. Make the game even
 * slightly unfavorable and ruin becomes nearly certain.
 *
 * Closed-form ruin probability for biased win prob p (q = 1-p):
 *   if p == q:  P(ruin) = (N - a) / N
 *   else:       P(ruin) = ( (q/p)^a - (q/p)^N ) / ( 1 - (q/p)^N )
 *
 * Expected duration until absorption at 0 or N (the classic result):
 *   if p == q:  E[T] = a * (N - a)
 *   else:       E[T] = a/(q-p) - (N/(q-p)) * (1 - (q/p)^a) / (1 - (q/p)^N)
 */

export interface RuinConfig {
  start: number;     // a — starting bankroll (1..N-1)
  target: number;    // N — stop-at-or-above target
  winProb: number;   // p in (0, 1)
}

export type Outcome = 'ruined' | 'reached' | 'capped';

export interface RunResult {
  outcome: Outcome;
  steps: number;
  finalBankroll: number;
  trajectory: number[];
}

/**
 * Treat p within this distance of 0.5 as a fair game. The biased closed forms
 * divide by (q - p), so for p extremely close to 0.5 they suffer catastrophic
 * cancellation and return inaccurate values; snapping to the exact fair-game
 * formula avoids that instability.
 */
const FAIR_EPS = 1e-5;

export function theoreticalRuinProb(config: RuinConfig): number {
  const { start: a, target: N, winProb: p } = config;
  if (a <= 0) return 1;
  if (a >= N) return 0;
  if (Math.abs(p - 0.5) < FAIR_EPS) return (N - a) / N;
  const q = 1 - p;
  const r = q / p;
  // Standard form (r^a - r^N) / (1 - r^N) overflows when r > 1 and N is large
  // (e.g., p=0.01, N=200 → r^N >> Number.MAX_VALUE → NaN). Divide num+denom
  // by r^N to stay in [0, 1] for r > 1; for r < 1, r^N → 0 so the standard
  // form is already safe.
  if (r > 1) {
    return (Math.pow(r, a - N) - 1) / (Math.pow(r, -N) - 1);
  }
  return (Math.pow(r, a) - Math.pow(r, N)) / (1 - Math.pow(r, N));
}

/**
 * Expected number of steps until absorption (hitting 0 or N), for any p in (0,1).
 * Fair game: E[T] = a(N-a). Biased game: the closed form above. The r^a / r^N
 * powers are bounded because a,N are small integers and r stays moderate for
 * the p range we allow (0.01..0.99); for extreme r the ratio still evaluates
 * to a finite value in practice.
 */
export function expectedDuration(config: RuinConfig): number {
  const { start: a, target: N, winProb: p } = config;
  if (a <= 0 || a >= N) return 0;
  if (Math.abs(p - 0.5) < FAIR_EPS) return a * (N - a);
  const q = 1 - p;
  const r = q / p;
  // E[T] = a/(q-p) - (N/(q-p)) * (1 - r^a) / (1 - r^N).
  // For r > 1 (p < 0.5), 1 - r^N can overflow for large N; rewrite by dividing
  // numerator and denominator of the fraction by r^N to keep terms in range.
  let frac: number;
  if (r > 1) {
    // (1 - r^a)/(1 - r^N) = (r^{-N} - r^{a-N}) / (r^{-N} - 1)
    frac = (Math.pow(r, -N) - Math.pow(r, a - N)) / (Math.pow(r, -N) - 1);
  } else {
    frac = (1 - Math.pow(r, a)) / (1 - Math.pow(r, N));
  }
  return a / (q - p) - (N / (q - p)) * frac;
}

/** @deprecated use expectedDuration. Kept for the fair-game path. */
export function fairExpectedDuration(config: RuinConfig): number {
  if (config.winProb !== 0.5) return NaN;
  return config.start * (config.target - config.start);
}

export function runRuin(
  config: RuinConfig,
  maxSteps: number,
  rng: () => number = Math.random,
): RunResult {
  const { start, target, winProb } = config;
  if (start <= 0 || start >= target) {
    throw new Error('runRuin: start must satisfy 0 < start < target');
  }
  if (winProb <= 0 || winProb >= 1) {
    throw new Error('runRuin: winProb must be in (0, 1)');
  }
  let bankroll = start;
  const trajectory: number[] = [bankroll];
  for (let i = 0; i < maxSteps; i++) {
    if (rng() < winProb) bankroll++;
    else bankroll--;
    trajectory.push(bankroll);
    if (bankroll <= 0) {
      return { outcome: 'ruined', steps: i + 1, finalBankroll: 0, trajectory };
    }
    if (bankroll >= target) {
      return { outcome: 'reached', steps: i + 1, finalBankroll: target, trajectory };
    }
  }
  return { outcome: 'capped', steps: maxSteps, finalBankroll: bankroll, trajectory };
}

// ---------- Simulation ----------

export interface SimSummary {
  trials: number;
  config: RuinConfig;
  maxSteps: number;
  ruinedCount: number;
  reachedCount: number;
  cappedCount: number;
  empiricalRuinProb: number;
  theoreticalRuinProb: number;
  meanSteps: number;
  medianSteps: number;
  theoreticalMeanSteps: number;
  /** Per-trial step counts (kept for downstream stats / histograms). */
  allSteps: number[];
  /** Histogram of step counts (equal-width bins) for the distribution chart. */
  stepHistogram: { binStart: number; binEnd: number; count: number }[];
  /** Running empirical ruin estimate sampled as trials accumulate (for the convergence chart). */
  convergence: { trial: number; ruinProb: number }[];
}

/** Build an equal-width histogram of the provided values. */
export function buildHistogram(
  values: number[],
  bins = 24,
): { binStart: number; binEnd: number; count: number }[] {
  // Guard against non-positive / non-integer bin counts, which would otherwise
  // yield Infinity/NaN bin widths or an invalid Array.from length.
  const binCount = Number.isFinite(bins) ? Math.max(1, Math.floor(bins)) : 24;
  if (values.length === 0) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi === lo) hi = lo + 1;
  const width = (hi - lo) / binCount;
  const out = Array.from({ length: binCount }, (_, i) => ({
    binStart: lo + i * width,
    binEnd: lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - lo) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out;
}

export interface SimOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  chunkSize?: number;
}

export async function runRuinMonteCarloAsync(
  config: RuinConfig,
  trials: number,
  maxSteps: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<SimSummary | null> {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runRuinMonteCarloAsync: trials must be a positive integer');
  }
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
    throw new Error('runRuinMonteCarloAsync: maxSteps must be a positive integer');
  }
  const chunkSize = options.chunkSize ?? 2000;
  const allSteps: number[] = new Array(trials);
  let ruined = 0;
  let reached = 0;
  let capped = 0;
  let totalSteps = 0;

  // Sample the running ruin estimate ~60 times over the whole run for a
  // convergence chart, plus the final point.
  const convergence: { trial: number; ruinProb: number }[] = [];
  const sampleEvery = Math.max(1, Math.floor(trials / 60));

  for (let i = 0; i < trials; i += chunkSize) {
    const end = Math.min(i + chunkSize, trials);
    for (let j = i; j < end; j++) {
      // Inline (no trajectory) for speed.
      let bk = config.start;
      let step = 0;
      while (step < maxSteps) {
        if (rng() < config.winProb) bk++; else bk--;
        step++;
        if (bk <= 0) { ruined++; break; }
        if (bk >= config.target) { reached++; break; }
      }
      if (step === maxSteps && bk > 0 && bk < config.target) capped++;
      allSteps[j] = step;
      totalSteps += step;
      if ((j + 1) % sampleEvery === 0 && j + 1 !== trials) {
        convergence.push({ trial: j + 1, ruinProb: ruined / (j + 1) });
      }
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) await new Promise<void>((res) => setTimeout(res, 0));
  }
  convergence.push({ trial: trials, ruinProb: ruined / trials });

  const sorted = [...allSteps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    trials,
    config,
    maxSteps,
    ruinedCount: ruined,
    reachedCount: reached,
    cappedCount: capped,
    empiricalRuinProb: ruined / trials,
    theoreticalRuinProb: theoreticalRuinProb(config),
    meanSteps: totalSteps / trials,
    medianSteps: median,
    theoreticalMeanSteps: expectedDuration(config),
    allSteps,
    stepHistogram: buildHistogram(allSteps, 24),
    convergence,
  };
}
