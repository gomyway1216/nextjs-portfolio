import { describe, expect, it } from 'vitest';
import {
  expectedDraws,
  harmonic,
  runCollection,
  stddevDraws,
  varianceDraws,
} from '@/components/game/CouponCollector/engine';

describe('CouponCollector engine', () => {
  it('computes harmonic expectation and variance', () => {
    expect(harmonic(3)).toBeCloseTo(1 + 1 / 2 + 1 / 3);
    expect(expectedDraws(3)).toBeCloseTo(5.5);
    expect(varianceDraws(1)).toBe(0);
    expect(stddevDraws(1)).toBe(0);
  });

  it('runs a deterministic collection until every item appears', () => {
    const values = [0, 0.34, 0.67];
    const rng = () => values.shift() ?? 0;

    expect(runCollection(3, rng)).toEqual({
      draws: 3,
      counts: [1, 1, 1],
      uniqueCurve: [1, 2, 3],
    });
  });

  it('rejects invalid collection sizes', () => {
    expect(() => runCollection(0)).toThrow('positive integer');
  });
});
