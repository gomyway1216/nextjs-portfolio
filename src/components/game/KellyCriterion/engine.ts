/**
 * The Kelly criterion: how much of a bankroll to stake on a bet that is in
 * your favor, and what happens to people who stake more or less than that.
 *
 * A bet is two numbers — the chance it wins and what it pays — and a strategy
 * is one more, the fraction of the bankroll staked every time. With a fixed
 * fraction the bankroll after n bets depends only on how many were won, so
 * everything here is counted exactly from the binomial distribution rather
 * than simulated. The table, the formula tab, the simulation and the tests
 * all use these functions.
 */

/** A repeatable bet: it wins with probability `p` and then pays `b` to 1. */
export interface Wager {
  p: number;
  b: number;
}

export const SCENARIO_IDS = ['coin60', 'edge53', 'longshot'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

/**
 * The bets on offer. `coin60` is the coin of Haghani and Dewey's 2016
 * experiment; the other two have the same kind of edge in a different shape.
 */
export const SCENARIOS: Record<ScenarioId, Wager> = {
  coin60: { p: 0.6, b: 1 },
  edge53: { p: 0.53, b: 1 },
  longshot: { p: 0.25, b: 4 },
};

function check({ p, b }: Wager): void {
  if (!(p >= 0 && p <= 1)) throw new Error('the win probability must be between 0 and 1');
  if (!(b > 0) || !Number.isFinite(b)) throw new Error('the payout odds must be positive');
}

function checkFraction(f: number): void {
  if (!(f >= 0 && f <= 1)) throw new Error('the fraction staked must be between 0 and 1');
}

/** Expected profit per unit staked: what the bet is worth before any sizing. */
export function edge(wager: Wager): number {
  check(wager);
  return wager.p * wager.b - (1 - wager.p);
}

/**
 * The Kelly fraction, f* = p − q / b: the share of the bankroll that makes it
 * grow fastest in the long run. A bet with no edge gets nothing.
 */
export function kellyFraction(wager: Wager): number {
  check(wager);
  return Math.max(0, wager.p - (1 - wager.p) / wager.b);
}

/**
 * Long-run growth per bet when staking the fraction `f` every time:
 * g(f) = p·ln(1 + b·f) + q·ln(1 − f). The typical bankroll after n bets is
 * e^(n·g). Staking everything (f = 1) on a bet that can lose is −∞: one loss
 * and it is over.
 */
export function growthRate(wager: Wager, f: number): number {
  check(wager);
  checkFraction(f);
  const { p, b } = wager;
  const q = 1 - p;
  const win = p === 0 ? 0 : p * Math.log1p(b * f);
  const lose = q === 0 ? 0 : f === 1 ? -Infinity : q * Math.log1p(-f);
  return win + lose;
}

/**
 * The fraction above Kelly at which growth falls back to zero: stake more than
 * this and the bankroll shrinks in the long run although every bet is in your
 * favor. `null` when the bet has no edge to begin with.
 */
export function zeroGrowthFraction(wager: Wager): number | null {
  const kelly = kellyFraction(wager);
  if (kelly <= 0) return null;
  if (wager.p === 1) return null;
  let lo = kelly;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (growthRate(wager, mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Bets needed to double the typical bankroll at this fraction, or `null` if it never does. */
export function betsToDouble(wager: Wager, f: number): number | null {
  const g = growthRate(wager, f);
  return g > 0 ? Math.LN2 / g : null;
}

/** P(k wins in n bets) for k = 0 … n, computed in log space so long runs do not underflow. */
export function binomial(n: number, p: number): Float64Array {
  if (!Number.isInteger(n) || n < 0) throw new Error('the number of bets must be a whole number');
  if (!(p >= 0 && p <= 1)) throw new Error('the win probability must be between 0 and 1');
  const out = new Float64Array(n + 1);
  if (p === 0) {
    out[0] = 1;
    return out;
  }
  if (p === 1) {
    out[n] = 1;
    return out;
  }
  const logOdds = Math.log(p) - Math.log1p(-p);
  let logPmf = n * Math.log1p(-p);
  out[0] = Math.exp(logPmf);
  for (let k = 1; k <= n; k++) {
    logPmf += Math.log((n - k + 1) / k) + logOdds;
    out[k] = Math.exp(logPmf);
  }
  return out;
}

/** The bankroll, as a multiple of the start, after `wins` wins in `n` bets at fraction `f`. */
export function multipleAfter(wager: Wager, f: number, n: number, wins: number): number {
  if (f === 1) return wins === n ? (1 + wager.b) ** n : 0;
  return Math.exp(wins * Math.log1p(wager.b * f) + (n - wins) * Math.log1p(-f));
}

export interface Outcome {
  /** The middle result: half of all runs end above it, half below. */
  median: number;
  /** The 5% and 95% results. */
  low: number;
  high: number;
  /** The average result, which a few huge runs can pull far above the median. */
  mean: number;
  /** Chance of ending with less than the starting bankroll. */
  belowStart: number;
}

/** The exact distribution of the bankroll after `n` bets at fraction `f`, as multiples of the start. */
export function outcomeAfter(wager: Wager, f: number, n: number): Outcome {
  check(wager);
  checkFraction(f);
  const pmf = binomial(n, wager.p);
  // More wins never means less money, so the results are already in order.
  const quantile = (level: number): number => {
    let cumulative = 0;
    for (let k = 0; k <= n; k++) {
      cumulative += pmf[k];
      if (cumulative >= level - 1e-12) return multipleAfter(wager, f, n, k);
    }
    return multipleAfter(wager, f, n, n);
  };
  let belowStart = 0;
  for (let k = 0; k <= n; k++) if (multipleAfter(wager, f, n, k) < 1 - 1e-12) belowStart += pmf[k];
  return {
    median: quantile(0.5),
    low: quantile(0.05),
    high: quantile(0.95),
    mean: (1 + f * edge(wager)) ** n,
    belowStart,
  };
}

/**
 * The chance that the bankroll crosses `level` (a multiple of the start) at
 * some point within `n` bets: falls to it or below when `level` < 1, climbs to
 * it or above when `level` > 1. The bankroll after t bets depends only on the
 * number of wins, so the paths that have not crossed yet are tracked on that
 * (bets, wins) grid and nothing is approximated.
 */
export function everCrosses(wager: Wager, f: number, n: number, level: number): number {
  check(wager);
  checkFraction(f);
  if (!(level > 0) || level === 1) throw new Error('the level must be a positive multiple other than 1');
  const down = level < 1;
  const crossed = (multiple: number) => (down ? multiple <= level * (1 + 1e-12) : multiple >= level * (1 - 1e-12));
  const { p } = wager;
  let alive = new Float64Array(n + 2);
  let next = new Float64Array(n + 2);
  alive[0] = 1;
  let hit = 0;
  for (let t = 0; t < n; t++) {
    next.fill(0, 0, t + 2);
    for (let k = 0; k <= t; k++) {
      const mass = alive[k];
      if (mass === 0) continue;
      next[k + 1] += mass * p;
      next[k] += mass * (1 - p);
    }
    for (let k = 0; k <= t + 1; k++) {
      if (next[k] !== 0 && crossed(multipleAfter(wager, f, t + 1, k))) {
        hit += next[k];
        next[k] = 0;
      }
    }
    [alive, next] = [next, alive];
  }
  return hit;
}

// ── The table game ───────────────────────────────────────────────────────────

/** The stakes of the 2016 experiment: $25 to start, payouts capped at ten times that. */
export const START_BANKROLL = 25;
export const CAP = 250;
export const MAX_FLIPS = 300;
/** The smallest stake the table takes; a bankroll below it is bust. */
export const MIN_STAKE = 0.01;

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;

/** A stake in whole cents for a fraction of the bankroll, never more than the bankroll itself. */
export function stakeFor(bankroll: number, fraction: number): number {
  checkFraction(fraction);
  const cents = Math.min(toCents(bankroll), Math.max(0, Math.round(toCents(bankroll) * fraction)));
  return fromCents(cents);
}

/** The bankroll after one bet, in whole cents and never above the cap. */
export function settle(bankroll: number, stake: number, won: boolean, b: number): number {
  if (!(stake >= 0) || toCents(stake) > toCents(bankroll)) throw new Error('the stake must be between zero and the bankroll');
  const cents = toCents(bankroll) + (won ? Math.round(toCents(stake) * b) : -toCents(stake));
  return Math.min(CAP, fromCents(cents));
}

/** Whether play is over: bust, at the cap, or out of flips. */
export function isFinished(bankroll: number, flipsUsed: number): boolean {
  return bankroll < MIN_STAKE || bankroll >= CAP || flipsUsed >= MAX_FLIPS;
}

/** `count` flips of the scenario's coin; `true` is a win. */
export function tossCoins(wager: Wager, count: number, rng: () => number = Math.random): boolean[] {
  check(wager);
  return Array.from({ length: count }, () => rng() < wager.p);
}

/**
 * The bankroll after each of `flips` when the same fraction is staked every
 * time, under the table's rules (whole cents, the cap, bust). The first entry
 * is the starting bankroll; the path stops growing once play is over.
 */
export function fixedFractionPath(wager: Wager, fraction: number, flips: readonly boolean[]): number[] {
  const path = [START_BANKROLL];
  let bankroll = START_BANKROLL;
  for (let i = 0; i < flips.length; i++) {
    if (!isFinished(bankroll, i)) {
      // A fraction too small to make a cent still stakes the table minimum.
      const stake = fraction === 0 ? 0 : Math.min(bankroll, Math.max(MIN_STAKE, stakeFor(bankroll, fraction)));
      bankroll = settle(bankroll, stake, flips[i], wager.b);
    }
    path.push(bankroll);
  }
  return path;
}
