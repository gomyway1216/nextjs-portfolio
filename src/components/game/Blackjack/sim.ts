/**
 * Monte Carlo simulations for the blackjack Simulation tab. Every round is
 * dealt from real six-deck shoes (burn card, cut card, reshuffle) and played
 * through the rules engine; the exact numbers they are compared with come from
 * the infinite-deck analysis.
 */

import { P, TABLE_RULES, VALUES, addValue, dealerBlackjackChance, policyValue, upcard, type Total, type Value } from './analysis';
import {
  DECKS,
  MAX_HANDS,
  STRATEGIES,
  basicStrategy,
  createShoe,
  handValue,
  playRound,
  type Card,
  type Round,
  type StrategyId,
} from './engine';

export const STRATEGY_IDS: readonly StrategyId[] = ['basic', 'mimic', 'neverBust'];
export const STRATEGY_COLORS: Record<StrategyId, string> = {
  basic: '#22c55e',
  mimic: '#f59e0b',
  neverBust: '#ef4444',
};

const cardOf = (v: Value): Card => ({ rank: v === 11 ? 'A' : v === 10 ? 'K' : (String(v) as Card['rank']), suit: '♠' });

/** Two cards with a given total and softness (only the total matters once doubling and splitting are off). */
function cardsFor({ total, soft }: Total): Card[] {
  if (soft) return total === 12 ? [cardOf(11), cardOf(11)] : [cardOf(11), cardOf((total - 11) as Value)];
  const a = Math.min(10, total - 2);
  return [cardOf(a as Value), cardOf((total - a) as Value)];
}

/**
 * The exact infinite-deck value of following the six-deck chart the table
 * uses (and the simulation plays) — every decision, including doubles,
 * splits and resplits, taken from the chart rather than from the optimum.
 */
export function chartValue(): number {
  const rules = TABLE_RULES;
  let ev = 0;
  for (const up of VALUES) {
    const a = upcard(up, rules);
    const upCard = cardOf(up);
    const memo = new Map<string, number>();
    // A hand of three or more cards: hit or stand by the chart.
    const cont = (hand: Total): number => {
      if (hand.total > 21) return -1;
      const key = `${hand.total},${hand.soft}`;
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      let v: number;
      if (basicStrategy(cardsFor(hand), upCard, { double: false, split: false }) === 'stand') v = a.stand(hand.total);
      else {
        v = 0;
        for (const c of VALUES) v += P[c] * cont(addValue(hand, c));
      }
      memo.set(key, v);
      return v;
    };
    // A two-card hand, with whatever the chart says given what is allowed.
    const two = (c1: Value, c2: Value, canDouble: boolean, canSplit: boolean): number => {
      const hand = addValue({ total: c1, soft: c1 === 11 }, c2);
      const play = basicStrategy([cardOf(c1), cardOf(c2)], upCard, { double: canDouble, split: canSplit });
      if (play === 'split') return split(c1);
      if (play === 'double') {
        let d = 0;
        for (const c of VALUES) d += P[c] * a.stand(addValue(hand, c).total);
        return 2 * d;
      }
      if (play === 'stand') return a.stand(hand.total);
      let h = 0;
      for (const c of VALUES) h += P[c] * cont(addValue(hand, c));
      return h;
    };
    const split = (r: Value): number => {
      const start: Total = { total: r, soft: r === 11 };
      if (r === 11) {
        let hand = 0;
        for (const c of VALUES) hand += P[c] * a.stand(addValue(start, c).total);
        return 2 * hand;
      }
      const das = rules.doubleAfterSplit;
      let other = 0;
      for (const c of VALUES) if (c !== r) other += P[c] * two(r, c, das, false);
      const asPair = two(r, r, das, false);
      const resplits = basicStrategy([cardOf(r), cardOf(r)], upCard, { double: das, split: true }) === 'split';
      const cache = new Map<string, number>();
      const value = (hands: number, pending: number): number => {
        if (pending === 0) return 0;
        const key = `${hands},${pending}`;
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
        const rest = value(hands, pending - 1);
        const again = hands < MAX_HANDS && resplits ? value(hands + 1, pending + 1) : asPair + rest;
        const v = other + (1 - P[r]) * rest + P[r] * again;
        cache.set(key, v);
        return v;
      };
      return value(2, 2);
    };
    const dBj = dealerBlackjackChance(up);
    let evUp = 0;
    for (const c1 of VALUES) {
      for (const c2 of VALUES) {
        const p = P[c1] * P[c2];
        const natural = (c1 === 11 && c2 === 10) || (c1 === 10 && c2 === 11);
        if (natural) evUp += p * (1 - dBj) * rules.blackjackPays;
        else evUp += p * (-dBj + (1 - dBj) * two(c1, c2, true, c1 === c2));
      }
    }
    ev += P[up] * evUp;
  }
  return ev;
}

/** Exact house edge (per initial bet) of each strategy for an infinite deck. */
export function exactEdge(id: StrategyId): number {
  switch (id) {
    case 'basic':
      return -chartValue();
    case 'mimic':
      return -policyValue((h) => h.total < 17);
    case 'neverBust':
      return -policyValue((h) => h.total <= 11 || (h.soft && h.total < 18));
  }
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * A reproducible generator (Park–Miller) from any finite seed: negative or
 * fractional seeds are folded into its valid state range 1 … 2³¹ − 2.
 */
export function seededRng(seed: number): () => number {
  if (!Number.isFinite(seed)) throw new Error('seed must be a finite number');
  let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
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
  if (options.signal?.aborted) return null;
  const checkpoints = logCheckpoints(rounds);
  const state = STRATEGY_IDS.map((id) => {
    // Same seed per strategy → the same sequence of shuffles (the rng is only used to shuffle).
    const rng = seededRng(seed);
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
