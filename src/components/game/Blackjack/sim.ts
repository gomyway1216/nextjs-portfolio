/**
 * Monte Carlo simulations for the blackjack Simulation tab. Every round is
 * dealt from real six-deck shoes (burn card, cut card, reshuffle) and played
 * through the rules engine; the exact numbers they are compared with come from
 * the infinite-deck analysis.
 */

import { gameValue, policyValue } from './analysis';
import { DECKS, STRATEGIES, createShoe, handValue, playRound, type Round, type StrategyId } from './engine';

export const STRATEGY_IDS: readonly StrategyId[] = ['basic', 'mimic', 'neverBust'];
export const STRATEGY_COLORS: Record<StrategyId, string> = {
  basic: '#22c55e',
  mimic: '#f59e0b',
  neverBust: '#ef4444',
};

/** Exact house edge (per initial bet) of each strategy for an infinite deck. */
export function exactEdge(id: StrategyId): number {
  switch (id) {
    case 'basic':
      return gameValue().houseEdge;
    case 'mimic':
      return -policyValue((h) => h.total < 17);
    case 'neverBust':
      return -policyValue((h) => h.total <= 11 || (h.soft && h.total < 18));
  }
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const YIELD_EVERY = 10_000;

export interface AsyncOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** ~12 checkpoints per decade from 100 rounds up to `rounds`, always ending at `rounds`. */
export function logCheckpoints(rounds: number): number[] {
  const out = new Set<number>();
  for (let e = 2; e <= Math.log10(rounds) + 1e-9; e += 1 / 12) out.add(Math.round(10 ** e));
  out.add(rounds);
  return [...out].filter((n) => n <= rounds).sort((a, b) => a - b);
}

export interface EdgePoint {
  rounds: number;
  edge: number;
}

export interface StrategySummary {
  points: EdgePoint[];
  /** Observed house edge per initial bet. */
  edge: number;
  se: number;
  wins: number;
  pushes: number;
  losses: number;
  blackjacks: number;
  doubles: number;
  splits: number;
  busts: number;
}

export type StrategiesResult = Record<StrategyId, StrategySummary>;

/** Tallies one finished round into a strategy's running totals. */
function tally(s: StrategySummary & { sum: number; sumSq: number }, round: Round) {
  const r = round.result!;
  s.sum += r.net;
  s.sumSq += r.net * r.net;
  if (r.net > 0) s.wins++;
  else if (r.net < 0) s.losses++;
  else s.pushes++;
  if (r.hands.some((h) => h.outcome === 'blackjack')) s.blackjacks++;
  if (round.hands.some((h) => h.doubled)) s.doubles++;
  if (round.hands.length > 1) s.splits++;
  if (round.hands.some((h) => handValue(h.cards).total > 21)) s.busts++;
}

/**
 * Plays every strategy for `rounds` rounds of one unit each. Each strategy
 * gets its own copy of the same shuffled shoes, so they face the same cards
 * off the top of every shoe (their decisions then make the deals diverge).
 */
export async function simulateStrategies(
  rounds: number,
  options: AsyncOptions = {},
  seed: number = Math.floor(Math.random() * 2 ** 31),
): Promise<StrategiesResult | null> {
  if (!Number.isInteger(rounds) || rounds <= 0) throw new Error('simulateStrategies: rounds must be a positive integer');
  const checkpoints = logCheckpoints(rounds);
  const state = STRATEGY_IDS.map((id) => {
    // Same seed per strategy → the same sequence of shuffles.
    let s = (seed % 2147483646) + 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return {
      id,
      rng,
      shoe: createShoe(DECKS, rng),
      stats: { points: [] as EdgePoint[], edge: 0, se: 0, wins: 0, pushes: 0, losses: 0, blackjacks: 0, doubles: 0, splits: 0, busts: 0, sum: 0, sumSq: 0 },
    };
  });
  let next = 0;
  for (let i = 1; i <= rounds; i++) {
    for (const st of state) {
      const round = playRound(st.shoe, 1, STRATEGIES[st.id], st.rng);
      st.shoe = round.shoe;
      tally(st.stats, round);
    }
    if (i === checkpoints[next]) {
      for (const st of state) st.stats.points.push({ rounds: i, edge: -st.stats.sum / i });
      next++;
    }
    if (i % YIELD_EVERY === 0) {
      options.onProgress?.(i, rounds);
      await yieldToBrowser();
      if (options.signal?.aborted) return null;
    }
  }
  options.onProgress?.(rounds, rounds);
  return Object.fromEntries(
    state.map(({ id, stats }) => {
      const mean = stats.sum / rounds;
      const variance = rounds > 1 ? (stats.sumSq - rounds * mean * mean) / (rounds - 1) : 0;
      const { sum: _sum, sumSq: _sumSq, ...rest } = stats;
      return [id, { ...rest, edge: -mean, se: Math.sqrt(Math.max(0, variance) / rounds) }];
    }),
  ) as StrategiesResult;
}
