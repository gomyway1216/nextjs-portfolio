/**
 * Bayesian update over a coin's bias.
 *
 * Setup: a coin has hidden bias p ∈ (0, 1). Each flip is Bernoulli(p).
 * Prior: Beta(α₀, β₀). With k heads in n flips the posterior is
 * Beta(α₀ + k, β₀ + n − k). Posterior mean = (α₀ + k) / (α₀ + β₀ + n) and
 * its variance shrinks like O(1/n) — so given enough flips, the posterior
 * concentrates around the truth regardless of (reasonable) prior.
 *
 * Default prior is Beta(1, 1) (uniform on [0, 1]) — Laplace's "rule of
 * succession" smoothing.
 */

export interface Posterior {
  alpha: number;
  beta: number;
}

export const UNIFORM_PRIOR: Posterior = { alpha: 1, beta: 1 };

export function posteriorMean(p: Posterior): number {
  return p.alpha / (p.alpha + p.beta);
}

export function posteriorVariance(p: Posterior): number {
  const s = p.alpha + p.beta;
  return (p.alpha * p.beta) / (s * s * (s + 1));
}

export function posteriorStd(p: Posterior): number {
  return Math.sqrt(posteriorVariance(p));
}

/**
 * Posterior mode (MAP estimate). Defined at the peak of the Beta density.
 * For α, β > 1 the mode is (α−1)/(α+β−2); with a flat/weak prior it may sit
 * at a boundary, so we clamp to [0, 1].
 */
export function posteriorMode(p: Posterior): number {
  const { alpha, beta } = p;
  if (alpha > 1 && beta > 1) return (alpha - 1) / (alpha + beta - 2);
  if (alpha <= 1 && beta <= 1) return 0.5; // uniform-ish: no interior peak
  return alpha <= 1 ? 0 : 1;
}

/** ln(Γ(z)) via Lanczos approximation. */
function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Continued fraction for the incomplete beta function, evaluated with the
 * modified Lentz method (Numerical Recipes §6.4, `betacf`).
 */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    // even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    // odd step
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b) = P(X ≤ x) for X ~ Beta(a, b).
 * Uses the continued fraction plus the symmetry I_x(a,b) = 1 − I_{1−x}(b,a) so
 * the fraction is only evaluated in its fast-converging regime. Accurate to ~1e-12.
 */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logFront = a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b);
  const front = Math.exp(logFront);
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Inverse CDF (quantile) of Beta(a, b) via bisection on betaCdf. */
export function betaQuantile(q: number, a: number, b: number): number {
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Exact equal-tailed credible interval [q_(1−level)/2, q_(1+level)/2] of the
 * Beta posterior, computed analytically (no sampling noise).
 */
export function credibleIntervalExact(p: Posterior, level = 0.95): [number, number] {
  const tail = (1 - level) / 2;
  return [betaQuantile(tail, p.alpha, p.beta), betaQuantile(1 - tail, p.alpha, p.beta)];
}

/** Beta(α, β) pdf at x ∈ [0, 1]. */
export function betaPdf(x: number, p: Posterior): number {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((p.alpha - 1) * Math.log(x) + (p.beta - 1) * Math.log(1 - x) - logBeta(p.alpha, p.beta));
}

/** Sample one Bernoulli flip. */
export function flip(trueP: number, rng: () => number = Math.random): 1 | 0 {
  return rng() < trueP ? 1 : 0;
}

export function update(prior: Posterior, observed: 1 | 0): Posterior {
  return observed === 1
    ? { alpha: prior.alpha + 1, beta: prior.beta }
    : { alpha: prior.alpha, beta: prior.beta + 1 };
}

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----- Sampling-based credible interval -----

// Reuse the Beta sampler. Marsaglia & Tsang gamma generator.
function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x = 0;
    let v = 0;
    do {
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
export function sampleBeta(alpha: number, beta: number, rng: () => number = Math.random): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

/** 95% credible interval via deterministic Monte Carlo sampling (defaults to 5000 samples). */
export function credibleInterval(
  p: Posterior,
  level = 0.95,
  samples = 5000,
  rng: () => number = createSeededRng(Math.imul(p.alpha, 1_000_003) ^ Math.imul(p.beta, 9_176)),
): [number, number] {
  const xs = new Array<number>(samples);
  for (let i = 0; i < samples; i++) xs[i] = sampleBeta(p.alpha, p.beta, rng);
  xs.sort((a, b) => a - b);
  const lo = Math.floor(((1 - level) / 2) * samples);
  const hi = Math.floor((1 - (1 - level) / 2) * samples);
  return [xs[lo], xs[hi]];
}

// ----- Simulation: many independent posterior trajectories -----

export interface ConvergenceSummary {
  trueP: number;
  trials: number;
  steps: number;
  /** trajectories[t][i] = posterior mean for trial t at step i (length trials × (steps+1)). */
  trajectories: number[][];
  /** Final posterior means, one per trial. */
  finalMeans: number[];
  /** Empirical mean / std of finalMeans (used for the histogram annotations). */
  finalMeanOfMeans: number;
  finalStd: number;
}

export interface SimOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  chunkSize?: number;
  prior?: Posterior;
}

export async function runConvergenceSimAsync(
  trueP: number,
  steps: number,
  trials: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<ConvergenceSummary | null> {
  if (!Number.isFinite(trueP) || trueP < 0 || trueP > 1) {
    throw new Error('runConvergenceSimAsync: trueP must be in [0, 1]');
  }
  if (!Number.isInteger(steps) || steps <= 0) throw new Error('steps must be positive');
  if (!Number.isInteger(trials) || trials <= 0) throw new Error('trials must be positive');
  const chunkSize = options.chunkSize ?? 50;
  const prior = options.prior ?? UNIFORM_PRIOR;

  const trajectories: number[][] = new Array(trials);
  const finalMeans: number[] = new Array(trials);

  for (let i = 0; i < trials; i += chunkSize) {
    const end = Math.min(i + chunkSize, trials);
    for (let t = i; t < end; t++) {
      const traj = new Array<number>(steps + 1);
      let post: Posterior = { ...prior };
      traj[0] = posteriorMean(post);
      for (let s = 0; s < steps; s++) {
        const obs = flip(trueP, rng);
        post = update(post, obs);
        traj[s + 1] = posteriorMean(post);
      }
      trajectories[t] = traj;
      finalMeans[t] = traj[steps];
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) await new Promise<void>((res) => setTimeout(res, 0));
  }

  const finalMeanOfMeans = finalMeans.reduce((s, x) => s + x, 0) / trials;
  const variance = finalMeans.reduce((s, x) => s + (x - finalMeanOfMeans) ** 2, 0) / trials;
  return {
    trueP,
    trials,
    steps,
    trajectories,
    finalMeans,
    finalMeanOfMeans,
    finalStd: Math.sqrt(variance),
  };
}
