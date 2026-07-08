/**
 * European single-zero roulette engine.
 * Pockets 0-36. 0 is green. House edge = 1/37 ≈ 2.70% on every bet.
 */

export type Color = 'red' | 'black' | 'green';

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/** Physical pocket order on a European wheel, clockwise from 0. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const POCKET_COUNT = 37;

export function colorOf(n: number): Color {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export type OutsideBet =
  | { kind: 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' };
export type DozenBet = { kind: 'dozen'; which: 1 | 2 | 3 };
/**
 * Column bet (2:1). Column 1 = {1,4,7,…,34}, column 2 = {2,5,8,…,35},
 * column 3 = {3,6,9,…,36}. A number n (1-36) is in column ((n-1) % 3) + 1.
 */
export type ColumnBet = { kind: 'column'; which: 1 | 2 | 3 };
export type StraightBet = { kind: 'straight'; number: number };
/**
 * Inside multi-number bets: split (2 nums, 17:1), street (3, 11:1),
 * corner (4, 8:1), line (6, 5:1). `numbers` is the exact set covered.
 * 0-involving variants (0-1, 0-2, 0-3 splits, 0-1-2 / 0-2-3 trio) are
 * not yet wired up — would need to bridge the 0-cell to the main grid.
 */
export type SplitBet = { kind: 'split'; numbers: [number, number] };
export type StreetBet = { kind: 'street'; numbers: [number, number, number] };
export type CornerBet = { kind: 'corner'; numbers: [number, number, number, number] };
export type LineBet = { kind: 'line'; numbers: [number, number, number, number, number, number] };
export type Bet = OutsideBet | DozenBet | ColumnBet | StraightBet | SplitBet | StreetBet | CornerBet | LineBet;

/**
 * Nominal odds displayed on the felt, in the "X:1" convention (profit-to-stake).
 * The payout multiplier returned by `payoutMultiplier` is this value + 1 (it
 * includes the returned stake). Kept as a single source of truth so UI labels
 * and tests can't drift from the engine.
 */
export const BET_ODDS = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  line: 5,
  dozen: 2,
  column: 2,
  even: 1,
} as const;

/** Returns payout multiplier (incl. stake) if bet wins, else 0. */
export function payoutMultiplier(bet: Bet, result: number): number {
  if (result === 0) {
    // Only straight-up 0 wins on green. Inside multi-number bets in this UI
    // don't include 0, so they all lose on green.
    return bet.kind === 'straight' && bet.number === 0 ? 36 : 0;
  }
  switch (bet.kind) {
    case 'red':
      return RED_NUMBERS.has(result) ? 2 : 0;
    case 'black':
      return RED_NUMBERS.has(result) ? 0 : 2;
    case 'odd':
      return result % 2 === 1 ? 2 : 0;
    case 'even':
      return result % 2 === 0 ? 2 : 0;
    case 'low':
      return result >= 1 && result <= 18 ? 2 : 0;
    case 'high':
      return result >= 19 && result <= 36 ? 2 : 0;
    case 'dozen': {
      const lo = (bet.which - 1) * 12 + 1;
      const hi = lo + 11;
      return result >= lo && result <= hi ? 3 : 0;
    }
    case 'column':
      // result is 1-36 here (0 handled above). Column = ((n-1) % 3) + 1.
      return ((result - 1) % 3) + 1 === bet.which ? 3 : 0;
    case 'straight':
      return result === bet.number ? 36 : 0;
    case 'split':
      return bet.numbers.includes(result) ? 18 : 0;
    case 'street':
      return bet.numbers.includes(result) ? 12 : 0;
    case 'corner':
      return bet.numbers.includes(result) ? 9 : 0;
    case 'line':
      return bet.numbers.includes(result) ? 6 : 0;
  }
}

/** True if the bet pays 1:1 (eligible for classic Martingale). */
export function isEvenMoney(bet: Bet): boolean {
  return ['red', 'black', 'odd', 'even', 'low', 'high'].includes(bet.kind);
}

export function spin(rng: () => number = Math.random): number {
  return Math.floor(rng() * POCKET_COUNT);
}

/**
 * The theoretical house edge of European single-zero roulette: 1/37.
 * Every bet type shares this edge because the payouts are calibrated to a
 * 36-pocket wheel while the wheel actually has 37 pockets.
 */
export const HOUSE_EDGE = 1 / POCKET_COUNT; // ≈ 0.027027 → 2.70%

// ---------- House-edge convergence simulation ----------

export interface HouseEdgePoint {
  /** Number of spins played so far (cumulative). */
  spins: number;
  /** Empirical player return = (total returned - total wagered) / total wagered. */
  edge: number;
}

export interface HouseEdgeResult {
  /** Sampled convergence points (log-ish spacing), for plotting. */
  points: HouseEdgePoint[];
  /** Final empirical player edge across all spins (negative = house wins). */
  finalEdge: number;
  totalSpins: number;
}

/**
 * Flat-bet one unit on `bet` every spin and track how the *empirical* player
 * return converges toward the theoretical -2.70%. This is the honest "law of
 * large numbers" demonstration: any single bet type drifts to the same edge.
 *
 * We record a point roughly every `samplePoints` steps on a logarithmic
 * schedule so early volatility and late convergence are both visible.
 */
export function simulateHouseEdge(
  bet: Bet,
  totalSpins: number,
  samplePoints = 60,
  rng: () => number = Math.random,
): HouseEdgeResult {
  if (!Number.isInteger(totalSpins) || totalSpins <= 0) {
    throw new Error('simulateHouseEdge: totalSpins must be a positive integer');
  }
  // Precompute the log-spaced spin counts at which we snapshot the edge.
  const sampleAt = new Set<number>();
  for (let i = 1; i <= samplePoints; i++) {
    const frac = i / samplePoints;
    sampleAt.add(Math.max(1, Math.round(totalSpins ** frac)));
  }
  sampleAt.add(totalSpins);

  const points: HouseEdgePoint[] = [];
  let wagered = 0;
  let returned = 0;
  for (let s = 1; s <= totalSpins; s++) {
    const result = spin(rng);
    wagered += 1;
    returned += payoutMultiplier(bet, result); // stake-inclusive return
    if (sampleAt.has(s)) {
      points.push({ spins: s, edge: (returned - wagered) / wagered });
    }
  }
  const finalEdge = (returned - wagered) / wagered;
  return { points, finalEdge, totalSpins };
}

// ---------- Martingale simulation ----------

export interface MartingaleConfig {
  initialBankroll: number;
  baseBet: number;
  tableMax: number;
  maxSpins: number;
  /** Which even-money side to bet (does not affect math, but kept for clarity). */
  side: 'red' | 'black';
}

export type RunOutcome = 'bust' | 'capped' | 'survived';

export interface RunResult {
  outcome: RunOutcome;
  spins: number;
  finalBankroll: number;
  peakBankroll: number;
  maxBetReached: number;
  /** True if the run was forced to lose because table max blocked the next double. */
  hitTableMax: boolean;
  /** Bankroll trajectory (length = spins + 1, starts at initialBankroll). */
  trajectory: number[];
}

/**
 * Simulate one Martingale run.
 * Rule: bet baseBet on even-money. On loss, double next bet (capped at tableMax
 * and bankroll). On win, reset to baseBet. Stop on bust, on maxSpins reached
 * (`capped` means we ran out of spins without busting), or if the table max
 * makes the required next bet impossible to recover from — we still play the
 * capped bet but mark `hitTableMax`.
 */
export function runMartingale(
  config: MartingaleConfig,
  rng: () => number = Math.random,
): RunResult {
  const { initialBankroll, baseBet, tableMax, maxSpins, side } = config;
  if (initialBankroll <= 0) {
    return { outcome: 'bust', spins: 0, finalBankroll: 0, peakBankroll: 0, maxBetReached: 0, hitTableMax: false, trajectory: [initialBankroll] };
  }
  if (baseBet <= 0 || tableMax <= 0 || maxSpins <= 0) {
    throw new Error('runMartingale: baseBet, tableMax, and maxSpins must be positive');
  }
  let bankroll = initialBankroll;
  let nextBet = baseBet;
  let peak = bankroll;
  let maxBetReached = baseBet;
  let hitTableMax = false;
  const trajectory: number[] = [bankroll];

  let i = 0;
  for (; i < maxSpins; i++) {
    // Can we even place the desired bet? Cap to bankroll and table max.
    const actualBet = Math.min(nextBet, tableMax, bankroll);
    if (nextBet > tableMax) hitTableMax = true;
    if (actualBet <= 0) break;
    maxBetReached = Math.max(maxBetReached, actualBet);

    const result = spin(rng);
    const won = colorOf(result) === side;

    if (won) {
      bankroll += actualBet;
      nextBet = baseBet;
    } else {
      bankroll -= actualBet;
      nextBet = actualBet * 2;
    }
    peak = Math.max(peak, bankroll);
    trajectory.push(bankroll);

    if (bankroll <= 0) {
      return {
        outcome: 'bust',
        spins: i + 1,
        finalBankroll: 0,
        peakBankroll: peak,
        maxBetReached,
        hitTableMax,
        trajectory,
      };
    }
  }

  return {
    outcome: i >= maxSpins ? 'capped' : 'survived',
    spins: i,
    finalBankroll: bankroll,
    peakBankroll: peak,
    maxBetReached,
    hitTableMax,
    trajectory,
  };
}

export interface MonteCarloSummary {
  trials: number;
  bustCount: number;
  cappedCount: number;
  bustRate: number;
  medianSpinsToBust: number | null;
  meanFinalBankroll: number;
  medianFinalBankroll: number;
  tableMaxHitCount: number;
  /** Final bankrolls across all trials (for histogram). */
  finalBankrolls: number[];
  /** Spins counts across all trials. */
  spinsCounts: number[];
}

export function runMonteCarlo(
  config: MartingaleConfig,
  trials: number,
  rng: () => number = Math.random,
): MonteCarloSummary {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runMonteCarlo: trials must be a positive integer');
  }
  const finals: number[] = new Array(trials);
  const spins: number[] = new Array(trials);
  const bustSpins: number[] = [];
  let bustCount = 0;
  let cappedCount = 0;
  let tableMaxHitCount = 0;
  let totalFinal = 0;

  for (let i = 0; i < trials; i++) {
    const r = runMartingale(config, rng);
    finals[i] = r.finalBankroll;
    spins[i] = r.spins;
    totalFinal += r.finalBankroll;
    if (r.outcome === 'bust') {
      bustCount++;
      bustSpins.push(r.spins);
    }
    if (r.outcome === 'capped') cappedCount++;
    if (r.hitTableMax) tableMaxHitCount++;
  }

  return {
    trials,
    bustCount,
    cappedCount,
    bustRate: bustCount / trials,
    medianSpinsToBust: bustSpins.length === 0 ? null : median(bustSpins),
    meanFinalBankroll: totalFinal / trials,
    medianFinalBankroll: median(finals),
    tableMaxHitCount,
    finalBankrolls: finals,
    spinsCounts: spins,
  };
}

export interface MonteCarloOptions {
  /** AbortSignal — when aborted, the next chunk boundary stops and the promise resolves to null. */
  signal?: AbortSignal;
  /** Called between chunks with (completed, total). */
  onProgress?: (done: number, total: number) => void;
  /** Trials per chunk before yielding to the event loop. Default 200. */
  chunkSize?: number;
}

/**
 * Async variant of runMonteCarlo that yields to the event loop between chunks
 * so a long run doesn't freeze the UI. Resolves to null if aborted.
 */
export async function runMonteCarloAsync(
  config: MartingaleConfig,
  trials: number,
  options: MonteCarloOptions = {},
  rng: () => number = Math.random,
): Promise<MonteCarloSummary | null> {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runMonteCarloAsync: trials must be a positive integer');
  }
  const chunkSize = options.chunkSize ?? 200;
  const finals: number[] = new Array(trials);
  const spinsCounts: number[] = new Array(trials);
  const bustSpins: number[] = [];
  let bustCount = 0;
  let cappedCount = 0;
  let tableMaxHitCount = 0;
  let totalFinal = 0;

  for (let i = 0; i < trials; i += chunkSize) {
    const end = Math.min(i + chunkSize, trials);
    for (let j = i; j < end; j++) {
      const r = runMartingale(config, rng);
      finals[j] = r.finalBankroll;
      spinsCounts[j] = r.spins;
      totalFinal += r.finalBankroll;
      if (r.outcome === 'bust') {
        bustCount++;
        bustSpins.push(r.spins);
      }
      if (r.outcome === 'capped') cappedCount++;
      if (r.hitTableMax) tableMaxHitCount++;
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) {
      await new Promise<void>((res) => setTimeout(res, 0));
    }
  }

  return {
    trials,
    bustCount,
    cappedCount,
    bustRate: bustCount / trials,
    medianSpinsToBust: bustSpins.length === 0 ? null : median(bustSpins),
    meanFinalBankroll: totalFinal / trials,
    medianFinalBankroll: median(finals),
    tableMaxHitCount,
    finalBankrolls: finals,
    spinsCounts,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
