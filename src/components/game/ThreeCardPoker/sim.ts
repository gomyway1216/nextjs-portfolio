/**
 * Monte Carlo simulation for the Three Card Poker Simulation tab. Every hand
 * is dealt from a freshly shuffled deck and settled by the rules engine, so
 * the simulation can't drift from the table; the exact numbers it is compared
 * with come from `analysis.ts`.
 */

import { strategyOdds } from './analysis';
import { STRATEGY_IDS, STRATEGY_PLAYS, dealRound, settle, type Bets, type StrategyId } from './engine';

export const STRATEGY_COLORS: Record<StrategyId, string> = {
  optimal: '#22c55e',
  mimic: '#f59e0b',
  always: '#ef4444',
};

/** The exact house edge of a strategy, relative to the Ante. */
export const exactEdge = (id: StrategyId): number => strategyOdds(id).houseEdge;

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const YIELD_EVERY = 10_000;

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

/** ~12 checkpoints per decade from 100 hands up to `hands`, always ending at `hands`. */
export function logCheckpoints(hands: number): number[] {
  const out = new Set<number>();
  for (let e = 2; e <= Math.log10(hands) + 1e-9; e += 1 / 12) out.add(Math.round(10 ** e));
  out.add(hands);
  return [...out].filter((n) => n <= hands).sort((a, b) => a - b);
}

export interface EdgePoint {
  hands: number;
  edge: number;
}

export interface StrategySummary {
  points: EdgePoint[];
  /** Observed house edge per Ante. */
  edge: number;
  /** Standard error of the edge estimate. */
  se: number;
  /** Hands the strategy played rather than folded. */
  played: number;
  /** Antes put at risk in total: one per hand plus one per Play bet. */
  wagered: number;
  /** Hands that finished ahead, level and behind. */
  wins: number;
  pushes: number;
  losses: number;
}

export interface SimResult {
  hands: number;
  /** Hands where the dealer held Queen-high or better. */
  dealerQualified: number;
  strategies: Record<StrategyId, StrategySummary>;
}

const ONE_ANTE: Bets = { ante: 1, pairPlus: 0 };

/**
 * Plays every strategy for `hands` hands of one Ante each. All three face the
 * same deals — one seeded shuffle per hand, shared — so the only difference
 * between them is which hands they fold.
 */
export async function simulateStrategies(
  hands: number,
  options: AsyncOptions = {},
  seed: number = Math.floor(Math.random() * 2 ** 31),
): Promise<SimResult | null> {
  if (!Number.isInteger(hands) || hands <= 0) throw new Error('simulateStrategies: hands must be a positive integer');
  const rng = seededRng(seed);
  if (options.signal?.aborted) return null;
  const checkpoints = logCheckpoints(hands);
  const stats = STRATEGY_IDS.map(() => ({ points: [] as EdgePoint[], sum: 0, sumSq: 0, played: 0, wins: 0, pushes: 0, losses: 0 }));
  let dealerQualified = 0;
  let next = 0;
  for (let i = 1; i <= hands; i++) {
    const { player, dealer } = dealRound(rng);
    const played = settle(ONE_ANTE, 'play', player, dealer);
    const folded = settle(ONE_ANTE, 'fold', player, dealer);
    if (played.dealerQualifies) dealerQualified++;
    for (let k = 0; k < STRATEGY_IDS.length; k++) {
      const plays = STRATEGY_PLAYS[STRATEGY_IDS[k]](played.player.score);
      const net = plays ? played.net : folded.net;
      const s = stats[k];
      s.sum += net;
      s.sumSq += net * net;
      if (plays) s.played++;
      if (net > 0) s.wins++;
      else if (net < 0) s.losses++;
      else s.pushes++;
    }
    if (i === checkpoints[next]) {
      for (const s of stats) s.points.push({ hands: i, edge: -s.sum / i });
      next++;
    }
    if (i % YIELD_EVERY === 0 && i < hands) {
      options.onProgress?.(i, hands);
      await yieldToBrowser();
      if (options.signal?.aborted) return null;
    }
  }
  options.onProgress?.(hands, hands);
  const strategies = Object.fromEntries(
    STRATEGY_IDS.map((id, k) => {
      const s = stats[k];
      const mean = s.sum / hands;
      const variance = hands > 1 ? (s.sumSq - hands * mean * mean) / (hands - 1) : 0;
      const summary: StrategySummary = {
        points: s.points,
        edge: -mean,
        se: Math.sqrt(Math.max(0, variance) / hands),
        played: s.played,
        wagered: hands + s.played,
        wins: s.wins,
        pushes: s.pushes,
        losses: s.losses,
      };
      return [id, summary];
    }),
  ) as Record<StrategyId, StrategySummary>;
  return { hands, dealerQualified, strategies };
}
