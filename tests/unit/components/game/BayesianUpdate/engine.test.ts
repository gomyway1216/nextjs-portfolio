import { describe, expect, it } from 'vitest';
import {
  betaPdf,
  flip,
  posteriorMean,
  posteriorStd,
  posteriorVariance,
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
});
