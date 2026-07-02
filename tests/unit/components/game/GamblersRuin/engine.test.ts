import { describe, expect, it } from 'vitest';
import {
  fairExpectedDuration,
  runRuin,
  runRuinMonteCarloAsync,
  theoreticalRuinProb,
} from '@/components/game/GamblersRuin/engine';

function sequence(values: number[], fallback = 0): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

describe('GamblersRuin engine', () => {
  it('computes fair-game ruin probability and duration', () => {
    expect(theoreticalRuinProb({ start: 3, target: 10, winProb: 0.5 })).toBe(0.7);
    expect(fairExpectedDuration({ start: 3, target: 10, winProb: 0.5 })).toBe(21);
  });

  it('handles biased-game boundaries without overflow', () => {
    expect(theoreticalRuinProb({ start: 0, target: 10, winProb: 0.4 })).toBe(1);
    expect(theoreticalRuinProb({ start: 10, target: 10, winProb: 0.4 })).toBe(0);
    expect(theoreticalRuinProb({ start: 2, target: 200, winProb: 0.01 })).toBeGreaterThan(0.99);
    expect(fairExpectedDuration({ start: 3, target: 10, winProb: 0.49 })).toBeNaN();
  });

  it('runs deterministic paths to reached, ruined, or capped outcomes', () => {
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 5, () => 0).outcome).toBe('reached');
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 5, () => 1).outcome).toBe('ruined');
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 1, () => 0).outcome).toBe('capped');
  });

  it('rejects invalid run inputs', () => {
    expect(() => runRuin({ start: 0, target: 4, winProb: 0.5 }, 5)).toThrow('start');
    expect(() => runRuin({ start: 2, target: 4, winProb: 0 }, 5)).toThrow('winProb');
  });

  it('runs deterministic monte carlo trials across all outcomes', async () => {
    const progress: Array<[number, number]> = [];
    const rng = sequence([0, 0, 1, 1, 0, 1, 0, 1]);

    const result = await runRuinMonteCarloAsync(
      { start: 2, target: 4, winProb: 0.5 },
      3,
      4,
      {
        chunkSize: 1,
        onProgress: (done, total) => progress.push([done, total]),
      },
      rng,
    );

    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(result).toMatchObject({
      trials: 3,
      maxSteps: 4,
      ruinedCount: 1,
      reachedCount: 1,
      cappedCount: 1,
      empiricalRuinProb: 1 / 3,
      meanSteps: 8 / 3,
      medianSteps: 2,
      allSteps: [2, 2, 4],
    });
    expect(result?.theoreticalRuinProb).toBe(0.5);
  });

  it('validates monte carlo inputs', async () => {
    await expect(runRuinMonteCarloAsync({ start: 1, target: 2, winProb: 0.5 }, 0, 1)).rejects.toThrow('trials');
    await expect(runRuinMonteCarloAsync({ start: 1, target: 2, winProb: 0.5 }, 1, 0)).rejects.toThrow('maxSteps');
  });

  it('returns null when monte carlo is aborted at a chunk boundary', async () => {
    const controller = new AbortController();

    const result = await runRuinMonteCarloAsync(
      { start: 1, target: 2, winProb: 0.5 },
      2,
      1,
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
