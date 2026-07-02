import { describe, expect, it } from 'vitest';
import {
  colorOf,
  isEvenMoney,
  payoutMultiplier,
  runMartingale,
  runMonteCarlo,
  runMonteCarloAsync,
  spin,
} from '@/components/game/Roulette/engine';

function sequence(values: number[], fallback = 0.03): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

describe('Roulette engine', () => {
  it('classifies pocket colors', () => {
    expect(colorOf(0)).toBe('green');
    expect(colorOf(1)).toBe('red');
    expect(colorOf(2)).toBe('black');
  });

  it('calculates payout multipliers for outside and inside bets', () => {
    expect(payoutMultiplier({ kind: 'red' }, 1)).toBe(2);
    expect(payoutMultiplier({ kind: 'black' }, 1)).toBe(0);
    expect(payoutMultiplier({ kind: 'odd' }, 3)).toBe(2);
    expect(payoutMultiplier({ kind: 'even' }, 4)).toBe(2);
    expect(payoutMultiplier({ kind: 'low' }, 18)).toBe(2);
    expect(payoutMultiplier({ kind: 'high' }, 19)).toBe(2);
    expect(payoutMultiplier({ kind: 'dozen', which: 2 }, 18)).toBe(3);
    expect(payoutMultiplier({ kind: 'straight', number: 0 }, 0)).toBe(36);
    expect(payoutMultiplier({ kind: 'straight', number: 5 }, 4)).toBe(0);
    expect(payoutMultiplier({ kind: 'split', numbers: [8, 11] }, 11)).toBe(18);
    expect(payoutMultiplier({ kind: 'street', numbers: [1, 2, 3] }, 3)).toBe(12);
    expect(payoutMultiplier({ kind: 'corner', numbers: [1, 2, 4, 5] }, 5)).toBe(9);
    expect(payoutMultiplier({ kind: 'line', numbers: [1, 2, 3, 4, 5, 6] }, 6)).toBe(6);
    expect(payoutMultiplier({ kind: 'red' }, 0)).toBe(0);
  });

  it('detects even-money bets and spins with injected rng', () => {
    expect(isEvenMoney({ kind: 'high' })).toBe(true);
    expect(isEvenMoney({ kind: 'straight', number: 5 })).toBe(false);
    expect(spin(() => 0.999)).toBe(36);
  });

  it('runs martingale paths for capped, bust, and table-max outcomes', () => {
    expect(runMartingale(
      { initialBankroll: 10, baseBet: 2, tableMax: 4, maxSpins: 3, side: 'red' },
      () => 0.03,
    )).toMatchObject({
      outcome: 'capped',
      spins: 3,
      finalBankroll: 16,
      peakBankroll: 16,
      maxBetReached: 2,
      hitTableMax: false,
      trajectory: [10, 12, 14, 16],
    });

    expect(runMartingale(
      { initialBankroll: 3, baseBet: 2, tableMax: 10, maxSpins: 3, side: 'red' },
      () => 0.06,
    )).toMatchObject({
      outcome: 'bust',
      spins: 2,
      finalBankroll: 0,
      hitTableMax: false,
      trajectory: [3, 1, 0],
    });

    expect(runMartingale(
      { initialBankroll: 20, baseBet: 5, tableMax: 6, maxSpins: 3, side: 'red' },
      () => 0.06,
    )).toMatchObject({
      outcome: 'capped',
      spins: 3,
      finalBankroll: 3,
      peakBankroll: 20,
      maxBetReached: 6,
      hitTableMax: true,
      trajectory: [20, 15, 9, 3],
    });
  });

  it('handles martingale validation and immediate bust cases', () => {
    expect(runMartingale(
      { initialBankroll: 0, baseBet: 2, tableMax: 4, maxSpins: 3, side: 'red' },
    )).toMatchObject({ outcome: 'bust', spins: 0, finalBankroll: 0 });

    expect(() => runMartingale(
      { initialBankroll: 10, baseBet: 0, tableMax: 4, maxSpins: 3, side: 'red' },
    )).toThrow('must be positive');
  });

  it('aggregates synchronous monte carlo runs', () => {
    const result = runMonteCarlo(
      { initialBankroll: 2, baseBet: 2, tableMax: 10, maxSpins: 1, side: 'red' },
      2,
      sequence([0.06, 0.03]),
    );

    expect(result).toEqual({
      trials: 2,
      bustCount: 1,
      cappedCount: 1,
      bustRate: 0.5,
      medianSpinsToBust: 1,
      meanFinalBankroll: 2,
      medianFinalBankroll: 2,
      tableMaxHitCount: 0,
      finalBankrolls: [0, 4],
      spinsCounts: [1, 1],
    });
  });

  it('validates synchronous monte carlo inputs', () => {
    expect(() => runMonteCarlo(
      { initialBankroll: 2, baseBet: 2, tableMax: 10, maxSpins: 1, side: 'red' },
      0,
    )).toThrow('trials');
  });

  it('aggregates async monte carlo runs with progress callbacks', async () => {
    const progress: Array<[number, number]> = [];

    const result = await runMonteCarloAsync(
      { initialBankroll: 2, baseBet: 2, tableMax: 10, maxSpins: 1, side: 'red' },
      2,
      {
        chunkSize: 1,
        onProgress: (done, total) => progress.push([done, total]),
      },
      sequence([0.06, 0.03]),
    );

    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result).toMatchObject({
      trials: 2,
      bustCount: 1,
      cappedCount: 1,
      bustRate: 0.5,
      medianSpinsToBust: 1,
      meanFinalBankroll: 2,
      medianFinalBankroll: 2,
      finalBankrolls: [0, 4],
      spinsCounts: [1, 1],
    });
  });

  it('validates and aborts async monte carlo runs', async () => {
    const config = { initialBankroll: 2, baseBet: 2, tableMax: 10, maxSpins: 1, side: 'red' as const };
    const controller = new AbortController();

    await expect(runMonteCarloAsync(config, 0)).rejects.toThrow('trials');
    await expect(runMonteCarloAsync(
      config,
      2,
      {
        chunkSize: 1,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      },
      () => 0.03,
    )).resolves.toBeNull();
  });
});
