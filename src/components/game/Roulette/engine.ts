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
export type StraightBet = { kind: 'straight'; number: number };
export type Bet = OutsideBet | DozenBet | StraightBet;

/** Returns payout multiplier (incl. stake) if bet wins, else 0. */
export function payoutMultiplier(bet: Bet, result: number): number {
  if (result === 0) {
    // Only straight-up 0 wins on green.
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
    case 'straight':
      return result === bet.number ? 36 : 0;
  }
}

/** True if the bet pays 1:1 (eligible for classic Martingale). */
export function isEvenMoney(bet: Bet): boolean {
  return ['red', 'black', 'odd', 'even', 'low', 'high'].includes(bet.kind);
}

export function spin(rng: () => number = Math.random): number {
  return Math.floor(rng() * POCKET_COUNT);
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
  let bankroll = initialBankroll;
  let nextBet = baseBet;
  let peak = bankroll;
  let maxBetReached = baseBet;
  let hitTableMax = false;
  const trajectory: number[] = [bankroll];

  let i = 0;
  for (; i < maxSpins; i++) {
    // Can we even place the desired bet? Cap to bankroll and table max.
    let actualBet = Math.min(nextBet, tableMax, bankroll);
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
