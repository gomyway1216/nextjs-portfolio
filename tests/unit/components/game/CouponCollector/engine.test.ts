import { describe, expect, it } from 'vitest';
import {
  expectedDraws,
  harmonic,
  runCollection,
  runCollectorMonteCarloAsync,
  stddevDraws,
  varianceDraws,
} from '@/components/game/CouponCollector/engine';

function sequence(values: number[], fallback = 0): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

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

  it('runs deterministic monte carlo trials and aggregates draw counts', async () => {
    const progress: Array<[number, number]> = [];
    const rng = sequence([0, 0.34, 0.67, 0, 0, 0.34, 0.67]);

    const result = await runCollectorMonteCarloAsync(
      3,
      2,
      {
        chunkSize: 1,
        onProgress: (done, total) => progress.push([done, total]),
      },
      rng,
    );

    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result).toMatchObject({
      trials: 2,
      n: 3,
      meanDraws: 3.5,
      medianDraws: 3.5,
      minDraws: 3,
      maxDraws: 4,
      drawCounts: [3, 4],
    });
    expect(result?.theoreticalMean).toBeCloseTo(expectedDraws(3));
    expect(result?.theoreticalStd).toBeCloseTo(stddevDraws(3));
  });

  it('validates monte carlo inputs', async () => {
    await expect(runCollectorMonteCarloAsync(3, 0)).rejects.toThrow('trials');
    await expect(runCollectorMonteCarloAsync(0, 1)).rejects.toThrow('n');
  });

  it('returns null when monte carlo is aborted at a chunk boundary', async () => {
    const controller = new AbortController();

    const result = await runCollectorMonteCarloAsync(
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
