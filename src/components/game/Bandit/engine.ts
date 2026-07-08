/**
 * K-armed Bernoulli bandit engine.
 *
 * K arms, each with a hidden reward probability p_i ∈ [0, 1]. Pull an arm at
 * each step and receive 0 or 1. Goal: maximise total reward over T pulls.
 * Pure-exploit (greedy) is fast but misses the actual best arm. Pure-explore
 * (random) wastes pulls. The classic strategies trade these off:
 *
 *   - ε-greedy: pick a random arm with prob ε, else the empirical best.
 *   - UCB1:     pick arm with the highest (mean + sqrt(2 ln t / n_i)).
 *   - Thompson: maintain Beta(α, β) per arm; sample each, pick the max.
 *
 * Regret = (T · p*) − (cumulative reward), where p* = max p_i. Small regret
 * means "we found the best arm fast." This is what the sim visualises.
 */

export type StrategyName = 'greedy' | 'eps-greedy' | 'ucb1' | 'thompson' | 'random' | 'optimal';

export interface BanditConfig {
  /** True hidden reward probability per arm; length = K. */
  trueProbs: number[];
  /** ε for ε-greedy (ignored otherwise). Default 0.1. */
  epsilon?: number;
}

export interface RunResult {
  /** Choice per step (length T). */
  choices: number[];
  /** Reward per step (length T). */
  rewards: number[];
  /** Cumulative reward through step i (length T). */
  cumReward: number[];
  /** Cumulative regret through step i (length T). */
  cumRegret: number[];
  /** Final estimated mean per arm. */
  finalMeans: number[];
  /** Number of pulls per arm. */
  finalCounts: number[];
}

/**
 * Deterministic PRNG (mulberry32). Seed with any 32-bit integer. Used by the
 * tests and by any caller that wants reproducible bandit runs. Returns a
 * function that yields uniform floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const argmax = (xs: number[], tiebreakRng: () => number): number => {
  let best = -Infinity;
  let bestIdx = 0;
  const ties: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] > best) { best = xs[i]; bestIdx = i; ties.length = 0; ties.push(i); }
    else if (xs[i] === best) { ties.push(i); }
  }
  return ties.length === 1 ? bestIdx : ties[Math.floor(tiebreakRng() * ties.length)];
};

// Beta(α, β) sampler — simple sum-of-gammas via two Gamma(α,1) draws using the
// Marsaglia & Tsang shape>=1 method. For shape<1 we use the standard boost
// trick: Gamma(α) = Gamma(α+1) * U^{1/α}.
function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x = 0;
    let v = 0;
    do {
      // Box-Muller for a standard normal
      const u1 = Math.max(Number.MIN_VALUE, rng());
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

/** Per-arm empirical statistics used to pick the next arm. */
export interface ArmStats {
  /** Pull count per arm. */
  counts: number[];
  /** Success (reward) sum per arm. */
  sums: number[];
  /** Total pulls so far across all arms (= sum of counts). */
  total: number;
}

/**
 * Decide which arm a learning strategy would pull next, given the current
 * empirical stats. Pure function shared by both the Monte-Carlo runner and the
 * interactive "hint" feature so the two can never diverge.
 *
 * `random`, `optimal` and unknown strategies are handled by the caller (they
 * don't depend on `stats`); this covers the four learning strategies. Returns
 * -1 for strategies this helper does not decide.
 */
export function chooseArm(
  strategy: StrategyName,
  stats: ArmStats,
  epsilon: number,
  rng: () => number,
): number {
  const { counts, sums, total } = stats;
  const K = counts.length;
  const means = () => counts.map((c, i) => (c === 0 ? 0 : sums[i] / c));

  if (strategy === 'eps-greedy') {
    if (rng() < epsilon) return Math.floor(rng() * K);
    return argmax(means(), rng);
  }
  if (strategy === 'greedy') {
    const unpulled = counts.indexOf(0);
    if (unpulled !== -1) return unpulled;
    return argmax(means(), rng);
  }
  if (strategy === 'ucb1') {
    const unpulled = counts.indexOf(0);
    if (unpulled !== -1) return unpulled;
    const lnt = Math.log(Math.max(1, total));
    const ucb = counts.map((c, i) => sums[i] / c + Math.sqrt((2 * lnt) / c));
    return argmax(ucb, rng);
  }
  if (strategy === 'thompson') {
    const samples = counts.map((c, i) => sampleBeta(sums[i] + 1, c - sums[i] + 1, rng));
    return argmax(samples, rng);
  }
  return -1;
}

/**
 * Wilson score interval for a Bernoulli proportion — a well-behaved confidence
 * interval even for small n (unlike the naive normal approximation). z=1.96 for
 * a 95% interval. Returns [low, high] clamped to [0, 1]; for n=0 returns the
 * full [0, 1] range. Used by the UI to draw per-arm confidence bars.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** One full run of T pulls with the given strategy. */
export function runStrategy(
  strategy: StrategyName,
  config: BanditConfig,
  T: number,
  rng: () => number = Math.random,
): RunResult {
  const K = config.trueProbs.length;
  if (K < 2) throw new Error('runStrategy: at least 2 arms required');
  if (!Number.isInteger(T) || T <= 0) throw new Error('runStrategy: T must be positive');
  const epsilon = config.epsilon ?? 0.1;
  const pStar = Math.max(...config.trueProbs);
  const bestArm = config.trueProbs.indexOf(pStar);

  const counts = new Array<number>(K).fill(0);
  const sums = new Array<number>(K).fill(0);
  const choices: number[] = new Array(T);
  const rewards: number[] = new Array(T);
  const cumReward: number[] = new Array(T);
  const cumRegret: number[] = new Array(T);

  let totalReward = 0;
  let totalRegret = 0;

  for (let t = 0; t < T; t++) {
    let choice: number;
    if (strategy === 'random') {
      choice = Math.floor(rng() * K);
    } else if (strategy === 'optimal') {
      choice = bestArm;
    } else {
      // The four learning strategies share their decision logic with the
      // interactive hint feature via chooseArm(). `t` equals the number of
      // pulls made so far, which is exactly UCB1's time index.
      choice = chooseArm(strategy, { counts, sums, total: t }, epsilon, rng);
    }

    // Fail fast on an unsupported strategy rather than indexing with -1 and
    // silently propagating undefined/NaN through the whole run.
    if (choice < 0 || choice >= K) {
      throw new Error(`runStrategy: unsupported strategy "${strategy}"`);
    }

    const reward = rng() < config.trueProbs[choice] ? 1 : 0;
    counts[choice]++;
    sums[choice] += reward;
    totalReward += reward;
    totalRegret += pStar - config.trueProbs[choice];

    choices[t] = choice;
    rewards[t] = reward;
    cumReward[t] = totalReward;
    cumRegret[t] = totalRegret;
  }

  return {
    choices,
    rewards,
    cumReward,
    cumRegret,
    finalMeans: counts.map((c, i) => (c === 0 ? 0 : sums[i] / c)),
    finalCounts: counts,
  };
}

// ---------- Monte Carlo across strategies ----------

export interface StrategySummary {
  strategy: StrategyName;
  trials: number;
  T: number;
  /** Mean cumulative reward per step, averaged across trials (length T). */
  avgCumReward: number[];
  /** Mean cumulative regret per step (length T). */
  avgCumRegret: number[];
  /** Mean final reward across trials. */
  meanFinalReward: number;
  /** Mean final regret across trials. */
  meanFinalRegret: number;
}

export interface SimOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  chunkSize?: number;
  /** Sample running averages every N steps (default: max(1, T/200)). */
  sampleEvery?: number;
}

/**
 * Run `trials` independent T-step runs of `strategy` and return averaged
 * cumulative-reward / cumulative-regret series (already downsampled).
 */
export async function runStrategyMonteCarloAsync(
  strategy: StrategyName,
  config: BanditConfig,
  T: number,
  trials: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<StrategySummary | null> {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runStrategyMonteCarloAsync: trials must be a positive integer');
  }
  const chunkSize = options.chunkSize ?? 100;

  const sumReward = new Array<number>(T).fill(0);
  const sumRegret = new Array<number>(T).fill(0);
  let finalRewardSum = 0;
  let finalRegretSum = 0;

  for (let i = 0; i < trials; i += chunkSize) {
    const end = Math.min(i + chunkSize, trials);
    for (let j = i; j < end; j++) {
      const r = runStrategy(strategy, config, T, rng);
      for (let t = 0; t < T; t++) {
        sumReward[t] += r.cumReward[t];
        sumRegret[t] += r.cumRegret[t];
      }
      finalRewardSum += r.cumReward[T - 1];
      finalRegretSum += r.cumRegret[T - 1];
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) await new Promise<void>((res) => setTimeout(res, 0));
  }

  return {
    strategy,
    trials,
    T,
    avgCumReward: sumReward.map((s) => s / trials),
    avgCumRegret: sumRegret.map((s) => s / trials),
    meanFinalReward: finalRewardSum / trials,
    meanFinalRegret: finalRegretSum / trials,
  };
}
