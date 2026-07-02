import { describe, expect, it } from 'vitest';
import {
  betaPdf,
  credibleInterval,
  flip,
  posteriorMean,
  posteriorStd,
  posteriorVariance,
  runConvergenceSimAsync,
  update,
} from '@/components/game/BayesianUpdate/engine';

describe('BayesianUpdate engine', () => {
  it('updates beta posterior for heads and tails', () => {
    const afterHead = update({ alpha: 1, beta: 1 }, 1);
    const afterTail = update(afterHead, 0);

    expect(afterHead).toEqual({ alpha: 2, beta: 1 });
    expect(afterTail).toEqual({ alpha: 2, beta: 2 });
  });

  it('computes posterior moments and density', () => {
    const posterior = { alpha: 2, beta: 2 };

    expect(posteriorMean(posterior)).toBe(0.5);
    expect(posteriorVariance(posterior)).toBeCloseTo(0.05);
    expect(posteriorStd(posterior)).toBeCloseTo(Math.sqrt(0.05));
    expect(betaPdf(0.5, posterior)).toBeCloseTo(1.5);
    expect(betaPdf(0, posterior)).toBe(0);
  });

  it('uses injected rng for flips', () => {
    expect(flip(0.7, () => 0.69)).toBe(1);
    expect(flip(0.7, () => 0.7)).toBe(0);
  });

  it('computes a stable credible interval by default', () => {
    const posterior = { alpha: 4, beta: 6 };

    const first = credibleInterval(posterior);
    const second = credibleInterval(posterior);

    expect(first).toEqual(second);
    expect(first[0]).toBeGreaterThanOrEqual(0);
    expect(first[1]).toBeLessThanOrEqual(1);
    expect(first[0]).toBeLessThan(first[1]);
  });

  it('runs a deterministic convergence simulation with progress callbacks', async () => {
    const progress: Array<[number, number]> = [];

    const result = await runConvergenceSimAsync(
      1,
      3,
      2,
      {
        chunkSize: 1,
        prior: { alpha: 2, beta: 2 },
        onProgress: (done, total) => progress.push([done, total]),
      },
      () => 0,
    );

    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result).toMatchObject({ trueP: 1, trials: 2, steps: 3 });
    expect(result?.trajectories).toEqual([
      [0.5, 0.6, 4 / 6, 5 / 7],
      [0.5, 0.6, 4 / 6, 5 / 7],
    ]);
    expect(result?.finalMeans).toEqual([5 / 7, 5 / 7]);
    expect(result?.finalMeanOfMeans).toBeCloseTo(5 / 7);
    expect(result?.finalStd).toBe(0);
  });

  it('validates convergence simulation inputs', async () => {
    await expect(runConvergenceSimAsync(-0.1, 1, 1)).rejects.toThrow('[0, 1]');
    await expect(runConvergenceSimAsync(0.5, 0, 1)).rejects.toThrow('steps must be positive');
    await expect(runConvergenceSimAsync(0.5, 1, 0)).rejects.toThrow('trials must be positive');
  });

  it('returns null when convergence simulation is aborted at a chunk boundary', async () => {
    const controller = new AbortController();

    const result = await runConvergenceSimAsync(
      0.5,
      1,
      2,
      {
        chunkSize: 1,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      },
      () => 0,
    );

    expect(result).toBeNull();
  });
});
