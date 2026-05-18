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
 * Expected duration (when reachable, p != q version is complex — we report
 * just the fair-game closed form: E[T] = a * (N - a) ).
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

export function theoreticalRuinProb(config: RuinConfig): number {
  const { start: a, target: N, winProb: p } = config;
  if (a <= 0) return 1;
  if (a >= N) return 0;
  if (p === 0.5) return (N - a) / N;
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

/** Expected duration for the fair game (p=0.5). For biased games we return NaN. */
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
  /** Final outcome bankrolls (mostly 0 or N) for the small distribution chip row. */
  allSteps: number[];
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
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) await new Promise<void>((res) => setTimeout(res, 0));
  }

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
    allSteps,
  };
}
