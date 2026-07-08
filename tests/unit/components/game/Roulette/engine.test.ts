import { describe, expect, it } from 'vitest';
import {
  BET_ODDS,
  HOUSE_EDGE,
  colorOf,
  isEvenMoney,
  payoutMultiplier,
  runMartingale,
  runMonteCarlo,
  runMonteCarloAsync,
  simulateHouseEdge,
  spin,
  RED_NUMBERS,
  WHEEL_ORDER,
  POCKET_COUNT,
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

  it('pays column bets 2:1 on the correct column', () => {
    // Column 1 = {1,4,7,…,34}, column 2 = {2,5,…,35}, column 3 = {3,6,…,36}.
    expect(payoutMultiplier({ kind: 'column', which: 1 }, 1)).toBe(3);
    expect(payoutMultiplier({ kind: 'column', which: 1 }, 34)).toBe(3);
    expect(payoutMultiplier({ kind: 'column', which: 1 }, 2)).toBe(0);
    expect(payoutMultiplier({ kind: 'column', which: 2 }, 5)).toBe(3);
    expect(payoutMultiplier({ kind: 'column', which: 2 }, 35)).toBe(3);
    expect(payoutMultiplier({ kind: 'column', which: 3 }, 36)).toBe(3);
    expect(payoutMultiplier({ kind: 'column', which: 3 }, 3)).toBe(3);
    // Zero loses every column.
    expect(payoutMultiplier({ kind: 'column', which: 1 }, 0)).toBe(0);
    expect(payoutMultiplier({ kind: 'column', which: 2 }, 0)).toBe(0);
    expect(payoutMultiplier({ kind: 'column', which: 3 }, 0)).toBe(0);
  });

  it('exposes odds that match the stake-inclusive payout multipliers', () => {
    // multiplier = odds + 1 (stake returned) for a winning bet.
    expect(payoutMultiplier({ kind: 'straight', number: 5 }, 5)).toBe(BET_ODDS.straight + 1);
    expect(payoutMultiplier({ kind: 'split', numbers: [8, 11] }, 8)).toBe(BET_ODDS.split + 1);
    expect(payoutMultiplier({ kind: 'street', numbers: [1, 2, 3] }, 1)).toBe(BET_ODDS.street + 1);
    expect(payoutMultiplier({ kind: 'corner', numbers: [1, 2, 4, 5] }, 4)).toBe(BET_ODDS.corner + 1);
    expect(payoutMultiplier({ kind: 'line', numbers: [1, 2, 3, 4, 5, 6] }, 2)).toBe(BET_ODDS.line + 1);
    expect(payoutMultiplier({ kind: 'dozen', which: 1 }, 5)).toBe(BET_ODDS.dozen + 1);
    expect(payoutMultiplier({ kind: 'column', which: 1 }, 1)).toBe(BET_ODDS.column + 1);
    expect(payoutMultiplier({ kind: 'red' }, 1)).toBe(BET_ODDS.even + 1);
  });

  it('has a correct European single-zero wheel layout', () => {
    expect(WHEEL_ORDER).toHaveLength(POCKET_COUNT);
    expect(POCKET_COUNT).toBe(37);
    // Every pocket 0-36 present exactly once.
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    for (let n = 0; n <= 36; n++) expect(WHEEL_ORDER).toContain(n);
    // Canonical order starts 0, 32, 15, 19, 4, 21, 2, 25 …
    expect(WHEEL_ORDER.slice(0, 8)).toEqual([0, 32, 15, 19, 4, 21, 2, 25]);
    // 18 red + 18 black + 1 green.
    expect(RED_NUMBERS.size).toBe(18);
    let black = 0;
    for (let n = 1; n <= 36; n++) if (!RED_NUMBERS.has(n)) black++;
    expect(black).toBe(18);
  });

  it('every bet type carries the same house edge (analytic EV check)', () => {
    // Expected stake-inclusive return per unit staked, averaged over 37 pockets.
    const expectedReturn = (winners: number, multiplier: number) =>
      (winners * multiplier) / POCKET_COUNT;
    const edgeOf = (winners: number, multiplier: number) => 1 - expectedReturn(winners, multiplier);
    // straight: 1 winner, 36x
    expect(edgeOf(1, 36)).toBeCloseTo(HOUSE_EDGE, 10);
    // even-money (18 winners, 2x)
    expect(edgeOf(18, 2)).toBeCloseTo(HOUSE_EDGE, 10);
    // dozen/column (12 winners, 3x)
    expect(edgeOf(12, 3)).toBeCloseTo(HOUSE_EDGE, 10);
    // corner (4 winners, 9x)
    expect(edgeOf(4, 9)).toBeCloseTo(HOUSE_EDGE, 10);
    expect(HOUSE_EDGE).toBeCloseTo(1 / 37, 12);
  });

  it('simulates house-edge convergence toward -2.70%', () => {
    // Deterministic rng cycling through all 37 pockets → exact analytic edge.
    let i = 0;
    const cyclingRng = () => {
      const pocket = i % POCKET_COUNT;
      i++;
      return pocket / POCKET_COUNT + 0.5 / POCKET_COUNT; // lands in pocket center
    };
    const res = simulateHouseEdge({ kind: 'red' }, POCKET_COUNT * 100, 30, cyclingRng);
    // Over whole cycles the empirical edge equals the theoretical exactly.
    expect(res.finalEdge).toBeCloseTo(-HOUSE_EDGE, 6);
    expect(res.totalSpins).toBe(POCKET_COUNT * 100);
    expect(res.points.length).toBeGreaterThan(0);
    // Points are monotonically increasing in spins and end at totalSpins.
    expect(res.points[res.points.length - 1].spins).toBe(POCKET_COUNT * 100);
    for (let j = 1; j < res.points.length; j++) {
      expect(res.points[j].spins).toBeGreaterThanOrEqual(res.points[j - 1].spins);
    }
  });

  it('validates house-edge simulation input', () => {
    expect(() => simulateHouseEdge({ kind: 'red' }, 0)).toThrow('totalSpins');
    expect(() => simulateHouseEdge({ kind: 'red' }, 1.5)).toThrow('totalSpins');
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
