/**
 * Monte Carlo simulation for the Kelly Criterion Simulation tab. Every session
 * tosses one run of coins and every strategy stakes its own fixed fraction on
 * that same run, so the only difference between them is the size of the bet.
 * The exact numbers they are compared with come from `engine.ts`.
 */

import { everCrosses, growthRate, kellyFraction, outcomeAfter, type Wager } from './engine';

export const STRATEGY_IDS = ['half', 'kelly', 'double', 'triple', 'allIn'] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

/** Each strategy as a multiple of the Kelly fraction; all-in stakes everything. */
const KELLY_MULTIPLE: Record<Exclude<StrategyId, 'allIn'>, number> = { half: 0.5, kelly: 1, double: 2, triple: 3 };

export const STRATEGY_COLORS: Record<StrategyId, string> = {
  half: '#38bdf8',
  kelly: '#22c55e',
  double: '#f59e0b',
  triple: '#ef4444',
  allIn: '#a855f7',
};

/** The fraction of the bankroll a strategy stakes on every bet. */
export function strategyFraction(wager: Wager, id: StrategyId): number {
  return id === 'allIn' ? 1 : Math.min(1, kellyFraction(wager) * KELLY_MULTIPLE[id]);
}

/** The level a bankroll has to fall to for a session to count as having lost half. */
export const HALF = 0.5;

export interface Exact {
  fraction: number;
  /** Long-run growth per bet; −∞ for all-in. */
  growth: number;
  median: number;
  belowStart: number;
  everHalf: number;
}

/** What the engine says a strategy does over `flips` bets, for the simulation to be checked against. */
export function exactFor(wager: Wager, id: StrategyId, flips: number): Exact {
  const fraction = strategyFraction(wager, id);
  const outcome = outcomeAfter(wager, fraction, flips);
  return {
    fraction,
    growth: growthRate(wager, fraction),
    median: outcome.median,
    belowStart: outcome.belowStart,
    everHalf: everCrosses(wager, fraction, flips, HALF),
  };
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Flips between two yields to the browser. */
const YIELD_EVERY_FLIPS = 600_000;

/**
 * A reproducible generator (Park–Miller) from any finite seed: negative or
 * fractional seeds are folded into its valid state range 1 … 2³¹ − 2.
 */
export function seededRng(seed: number): () => number {
  if (!Number.isFinite(seed)) throw new Error('seed must be a finite number');
  let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export interface AsyncOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** ~12 checkpoints per decade from 10 sessions up to `sessions`, always ending at `sessions`. */
export function logCheckpoints(sessions: number): number[] {
  const out = new Set<number>();
  for (let e = 1; e <= Math.log10(sessions) + 1e-9; e += 1 / 12) out.add(Math.round(10 ** e));
  out.add(sessions);
  return [...out].filter((n) => n <= sessions).sort((a, b) => a - b);
}

export interface GrowthPoint {
  sessions: number;
  /** Average growth per bet over the sessions so far. */
  growth: number;
}

export interface StrategyResult {
  fraction: number;
  points: GrowthPoint[];
  /** Average growth per bet over every session; −∞ once an all-in session has gone bust. */
  growth: number;
  /** The middle final bankroll, as a multiple of the start. */
  median: number;
  /** Share of sessions that ended below the starting bankroll. */
  belowStart: number;
  /** Share of sessions whose bankroll fell to half the start or less at some point. */
  everHalf: number;
}

export interface SimResult {
  sessions: number;
  flips: number;
  /** Share of all flips that won. */
  winRate: number;
  strategies: Record<StrategyId, StrategyResult>;
}

/**
 * Plays `sessions` sessions of `flips` bets each. All five strategies bet on
 * the same flips, one seeded run per session, each staking its own fixed
 * fraction of whatever it has left.
 */
export async function simulateSessions(
  sessions: number,
  flips: number,
  wager: Wager,
  options: AsyncOptions = {},
  seed: number = Math.floor(Math.random() * 2 ** 31),
): Promise<SimResult | null> {
  if (!Number.isInteger(sessions) || sessions <= 0) throw new Error('simulateSessions: sessions must be a positive integer');
  if (!Number.isInteger(flips) || flips <= 0) throw new Error('simulateSessions: flips must be a positive integer');
  const rng = seededRng(seed);
  if (options.signal?.aborted) return null;

  const count = STRATEGY_IDS.length;
  const fractions = STRATEGY_IDS.map((id) => strategyFraction(wager, id));
  // Work in logarithms: a win adds `up`, a loss adds `down` (−∞ when everything was staked).
  const up = fractions.map((f) => Math.log1p(wager.b * f));
  const down = fractions.map((f) => (f === 1 ? -Infinity : Math.log1p(-f)));
  const halfLog = Math.log(HALF);
  const finals = STRATEGY_IDS.map(() => new Float64Array(sessions));
  const sumLog = new Float64Array(count);
  const belowStart = new Int32Array(count);
  const everHalf = new Int32Array(count);
  const points: GrowthPoint[][] = STRATEGY_IDS.map(() => []);
  const checkpoints = logCheckpoints(sessions);
  const log = new Float64Array(count);
  const dipped = new Uint8Array(count);
  let next = 0;
  let wins = 0;
  let sinceYield = 0;

  for (let s = 1; s <= sessions; s++) {
    log.fill(0);
    dipped.fill(0);
    for (let i = 0; i < flips; i++) {
      const won = rng() < wager.p;
      if (won) wins++;
      for (let k = 0; k < count; k++) {
        log[k] += won ? up[k] : down[k];
        if (log[k] <= halfLog) dipped[k] = 1;
      }
    }
    for (let k = 0; k < count; k++) {
      finals[k][s - 1] = log[k];
      sumLog[k] += log[k];
      if (log[k] < -1e-12) belowStart[k]++;
      if (dipped[k]) everHalf[k]++;
    }
    if (s === checkpoints[next]) {
      for (let k = 0; k < count; k++) points[k].push({ sessions: s, growth: sumLog[k] / (s * flips) });
      next++;
    }
    sinceYield += flips;
    if (sinceYield >= YIELD_EVERY_FLIPS && s < sessions) {
      sinceYield = 0;
      options.onProgress?.(s, sessions);
      await yieldToBrowser();
      if (options.signal?.aborted) return null;
    }
  }
  options.onProgress?.(sessions, sessions);

  const strategies = Object.fromEntries(
    STRATEGY_IDS.map((id, k) => {
      const sorted = finals[k].slice().sort();
      // The lower middle value, as the exact median is defined.
      const middle = sorted[Math.ceil(sessions / 2) - 1];
      const result: StrategyResult = {
        fraction: fractions[k],
        points: points[k],
        growth: sumLog[k] / (sessions * flips),
        median: Math.exp(middle),
        belowStart: belowStart[k] / sessions,
        everHalf: everHalf[k] / sessions,
      };
      return [id, result];
    }),
  ) as Record<StrategyId, StrategyResult>;
  return { sessions, flips, winRate: wins / (sessions * flips), strategies };
}
