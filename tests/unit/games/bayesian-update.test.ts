import { describe, it, expect } from 'vitest';
import {
  UNIFORM_PRIOR,
  posteriorMean,
  posteriorVariance,
  posteriorStd,
  posteriorMode,
  update,
  betaCdf,
  betaQuantile,
  credibleIntervalExact,
  betaPdf,
  createSeededRng,
  flip,
  type Posterior,
} from '@/components/game/BayesianUpdate/engine';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('Beta-Binomial conjugate update', () => {
  it('adds heads to alpha and tails to beta', () => {
    let post: Posterior = { ...UNIFORM_PRIOR };
    post = update(post, 1); // heads
    post = update(post, 1);
    post = update(post, 0); // tails
    expect(post).toEqual({ alpha: 3, beta: 2 });
  });

  it('matches the closed-form posterior Beta(alpha0+k, beta0+n-k)', () => {
    const alpha0 = 2;
    const beta0 = 5;
    const obs: (0 | 1)[] = [1, 0, 1, 1, 0, 0, 1, 0, 0, 0]; // k=4 heads, 6 tails
    let post: Posterior = { alpha: alpha0, beta: beta0 };
    for (const o of obs) post = update(post, o);
    const k = obs.filter((o) => o === 1).length;
    const n = obs.length;
    expect(post.alpha).toBe(alpha0 + k);
    expect(post.beta).toBe(beta0 + (n - k));
  });
});

describe('posterior moments (closed form)', () => {
  it('mean = alpha / (alpha + beta)', () => {
    const p: Posterior = { alpha: 8, beta: 4 };
    expect(close(posteriorMean(p), 8 / 12)).toBe(true);
  });

  it('uniform prior mean is 1/2 (Laplace rule of succession)', () => {
    expect(close(posteriorMean(UNIFORM_PRIOR), 0.5)).toBe(true);
    // After 1 head from Beta(1,1): (1+1)/(2+1) = 2/3
    expect(close(posteriorMean(update(UNIFORM_PRIOR, 1)), 2 / 3)).toBe(true);
  });

  it('variance = ab / ((a+b)^2 (a+b+1))', () => {
    const p: Posterior = { alpha: 3, beta: 7 };
    const s = 10;
    const expected = (3 * 7) / (s * s * (s + 1));
    expect(close(posteriorVariance(p), expected)).toBe(true);
    expect(close(posteriorStd(p), Math.sqrt(expected))).toBe(true);
  });

  it('mode = (alpha-1)/(alpha+beta-2) when both > 1', () => {
    const mode = posteriorMode({ alpha: 5, beta: 3 });
    expect(mode).not.toBeNull();
    expect(close(mode as number, (5 - 1) / (5 + 3 - 2))).toBe(true);
  });

  it('mode is at the boundary for one-sided shapes', () => {
    expect(posteriorMode({ alpha: 1, beta: 4 })).toBe(0); // decreasing
    expect(posteriorMode({ alpha: 4, beta: 1 })).toBe(1); // increasing
    expect(posteriorMode({ alpha: 2, beta: 1 })).toBe(1); // beta = 1, increasing
    expect(posteriorMode({ alpha: 1, beta: 2 })).toBe(0); // alpha = 1, decreasing
  });

  it('mode is null when there is no unique MAP (uniform or U-shaped bimodal)', () => {
    expect(posteriorMode(UNIFORM_PRIOR)).toBeNull(); // Beta(1,1) uniform
    expect(posteriorMode({ alpha: 0.5, beta: 0.5 })).toBeNull(); // Jeffreys, bimodal at 0 and 1
    expect(posteriorMode({ alpha: 0.5, beta: 0.8 })).toBeNull(); // both < 1, U-shaped
  });
});

describe('Beta pdf', () => {
  it('uniform Beta(1,1) pdf is 1 everywhere in (0,1)', () => {
    expect(close(betaPdf(0.3, UNIFORM_PRIOR), 1)).toBe(true);
    expect(close(betaPdf(0.87, UNIFORM_PRIOR), 1)).toBe(true);
  });

  it('is zero outside [0,1]', () => {
    expect(betaPdf(0, { alpha: 2, beta: 2 })).toBe(0);
    expect(betaPdf(1, { alpha: 2, beta: 2 })).toBe(0);
  });

  it('integrates to ~1 over [0,1] (trapezoid)', () => {
    const p: Posterior = { alpha: 4, beta: 6 };
    const N = 20000;
    let area = 0;
    for (let i = 0; i < N; i++) {
      const x0 = i / N;
      const x1 = (i + 1) / N;
      area += ((betaPdf(x0, p) + betaPdf(x1, p)) / 2) * (1 / N);
    }
    expect(close(area, 1, 1e-3)).toBe(true);
  });
});

describe('Beta CDF / quantile (regularized incomplete beta)', () => {
  it('uniform Beta(1,1) CDF is the identity', () => {
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(close(betaCdf(x, 1, 1), x, 1e-9)).toBe(true);
    }
  });

  it('is symmetric: I_x(a,b) = 1 - I_{1-x}(b,a)', () => {
    const a = 3;
    const b = 7;
    for (const x of [0.2, 0.45, 0.63, 0.8]) {
      expect(close(betaCdf(x, a, b), 1 - betaCdf(1 - x, b, a), 1e-8)).toBe(true);
    }
  });

  it('CDF(0.5, a, a) = 0.5 for symmetric parameters', () => {
    expect(close(betaCdf(0.5, 4, 4), 0.5, 1e-8)).toBe(true);
    expect(close(betaCdf(0.5, 12, 12), 0.5, 1e-8)).toBe(true);
  });

  it('quantile inverts the CDF', () => {
    const a = 5;
    const b = 9;
    for (const q of [0.05, 0.25, 0.5, 0.9, 0.975]) {
      const x = betaQuantile(q, a, b);
      expect(close(betaCdf(x, a, b), q, 1e-6)).toBe(true);
    }
  });

  it('known value: median of Beta(2,2) ~ 0.5', () => {
    expect(close(betaQuantile(0.5, 2, 2), 0.5, 1e-6)).toBe(true);
  });
});

describe('exact 95% credible interval', () => {
  it('is symmetric around 0.5 for symmetric posteriors', () => {
    const [lo, hi] = credibleIntervalExact({ alpha: 10, beta: 10 }, 0.95);
    expect(close(lo, 1 - hi, 1e-5)).toBe(true);
    // Contains 0.95 probability mass.
    expect(close(betaCdf(hi, 10, 10) - betaCdf(lo, 10, 10), 0.95, 1e-5)).toBe(true);
  });

  it('captures exactly the requested probability mass', () => {
    const post: Posterior = { alpha: 7, beta: 3 };
    const [lo, hi] = credibleIntervalExact(post, 0.9);
    const mass = betaCdf(hi, post.alpha, post.beta) - betaCdf(lo, post.alpha, post.beta);
    expect(close(mass, 0.9, 1e-5)).toBe(true);
  });
});

describe('convergence sanity', () => {
  it('flip() respects the bias with a seeded RNG', () => {
    const rng = createSeededRng(42);
    const trueP = 0.75;
    let heads = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) heads += flip(trueP, rng);
    expect(close(heads / n, trueP, 0.02)).toBe(true);
  });

  it('posterior mean converges toward the true bias', () => {
    const rng = createSeededRng(7);
    const trueP = 0.3;
    let post: Posterior = { ...UNIFORM_PRIOR };
    for (let i = 0; i < 5000; i++) post = update(post, flip(trueP, rng));
    expect(close(posteriorMean(post), trueP, 0.02)).toBe(true);
  });
});
