/**
 * Monte Carlo simulations for the video poker Simulation tab. Hands are dealt
 * and drawn by the same engine as the machine; the strategies are compared
 * with exact paybacks from the analysis.
 */

import { TOTAL_HANDS, drawsFor, holdCounts, tables, tablesAsync, type Tables } from './analysis';
import { HANDS, MAX_COINS, deal, payout, rankHand, type PayTable } from './engine';

const PAYING = HANDS.length - 1;
/** Cards held by each of the 32 hold masks. */
const POPCOUNT = Array.from({ length: 32 }, (_, m) => [0, 1, 2, 3, 4].filter((i) => m & (1 << i)).length);

export const STRATEGY_IDS = ['optimal', 'simple', 'madeOnly'] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];
export const STRATEGY_COLORS: Record<StrategyId, string> = { optimal: '#22c55e', simple: '#f59e0b', madeOnly: '#ef4444' };

/** A strategy: which positions of a sorted (ascending) hand to hold, as a bit mask. */
export type Policy = (hand: readonly number[], pays: PayTable, scratch: Int32Array, t: Tables) => number;

/** Bits of the cards whose rank appears at least `min` times. */
function groupMask(hand: readonly number[], min: number): number {
  let mask = 0;
  for (let i = 0; i < 5; i++) {
    let n = 0;
    for (let j = 0; j < 5; j++) if (hand[i] % 13 === hand[j] % 13) n++;
    if (n >= min) mask |= 1 << i;
  }
  return mask;
}

/** The exact best hold (ties go to the hold that keeps more cards). */
export const optimalPolicy: Policy = (hand, pays, scratch, t) => {
  holdCounts(hand, scratch, t);
  let best = -1;
  let bestMask = 0;
  for (let m = 0; m < 32; m++) {
    let paid = 0;
    for (let r = 0; r < PAYING; r++) paid += scratch[m * PAYING + r] * pays[r + 1];
    const ev = paid / drawsFor(POPCOUNT[m]);
    if (ev > best + 1e-12 || (Math.abs(ev - best) <= 1e-12 && POPCOUNT[m] > POPCOUNT[bestMask])) {
      best = ev;
      bestMask = m;
    }
  }
  return bestMask;
};

/**
 * Common-sense rules without any arithmetic: keep a made straight or better;
 * otherwise keep any pair, two pair or three of a kind; otherwise four to a
 * flush; otherwise every jack or higher; otherwise draw five.
 */
export const simplePolicy: Policy = (hand) => {
  if (rankHand(hand[0], hand[1], hand[2], hand[3], hand[4]) >= 4) return 31;
  const grouped = groupMask(hand, 2);
  if (grouped) return grouped;
  for (let s = 0; s < 4; s++) {
    let mask = 0;
    let n = 0;
    for (let i = 0; i < 5; i++) {
      if (((hand[i] / 13) | 0) === s) {
        mask |= 1 << i;
        n++;
      }
    }
    if (n === 4) return mask;
  }
  let high = 0;
  for (let i = 0; i < 5; i++) if (hand[i] % 13 >= 9) high |= 1 << i;
  return high;
};

/** Keep only what already pays (a high pair, two pair, trips, or a made hand); otherwise draw five. */
export const madeOnlyPolicy: Policy = (hand) => {
  const rank = rankHand(hand[0], hand[1], hand[2], hand[3], hand[4]);
  if (rank >= 4) return 31;
  // A high pair, two pair or three of a kind: the matching cards. Nothing made: draw five.
  return rank === 0 ? 0 : groupMask(hand, 2);
};

export const POLICIES: Record<StrategyId, Policy> = { optimal: optimalPolicy, simple: simplePolicy, madeOnly: madeOnlyPolicy };

/** The exact payback of a strategy: its hold for every suit-distinct deal, weighted over all deals. */
export function policyPayback(policy: Policy, pays: PayTable, t: Tables = tables()): number {
  const scratch = new Int32Array(32 * PAYING);
  const counts = new Int32Array(32 * PAYING);
  const hand = [0, 0, 0, 0, 0];
  let payback = 0;
  for (let c = 0; c < t.classes; c++) {
    for (let i = 0; i < 5; i++) hand[i] = t.classHands[c * 5 + i];
    const mask = policy(hand, pays, scratch, t);
    holdCounts(hand, counts, t);
    let paid = 0;
    for (let r = 0; r < PAYING; r++) paid += counts[mask * PAYING + r] * pays[r + 1];
    payback += (t.classWeights[c] / TOTAL_HANDS) * (paid / drawsFor(POPCOUNT[mask]));
  }
  return payback;
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const YIELD_EVERY = 5_000;

export interface AsyncOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** A reproducible generator (Park–Miller) from any finite seed. */
export function seededRng(seed: number): () => number {
  if (!Number.isFinite(seed)) throw new Error('seed must be a finite number');
  let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/** ~12 checkpoints per decade from 100 hands up to `hands`, always ending at `hands`. */
export function logCheckpoints(hands: number): number[] {
  const out = new Set<number>();
  for (let e = 2; e <= Math.log10(hands) + 1e-9; e += 1 / 12) out.add(Math.round(10 ** e));
  out.add(hands);
  return [...out].filter((n) => n <= hands).sort((a, b) => a - b);
}

const ascending = (a: number, b: number) => a - b;

/** Plays a dealt hand with a strategy: returns the final hand's rank. */
function playHand(sorted: number[], stub: readonly number[], mask: number): number {
  let next = 0;
  const c = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) c[i] = mask & (1 << i) ? sorted[i] : stub[next++];
  return rankHand(c[0], c[1], c[2], c[3], c[4]);
}

export interface StrategyRun {
  points: { hands: number; payback: number }[];
  payback: number;
  /** Standard error of the payback. */
  se: number;
  royals: number;
  /** Hands on which this strategy's hold differed from the best one. */
  differed: number;
}

export type StrategiesResult = Record<StrategyId, StrategyRun>;

/**
 * Plays every strategy on the same deals — the same five cards and the same
 * replacement cards — betting five coins a hand. Results are per coin bet at
 * the five-coin pay table, so a royal flush counts as 800 per coin (a one-coin
 * bet would pay 250, and return 98.37% on 9/6 instead of 99.54%).
 */
export async function simulateStrategies(
  hands: number,
  pays: PayTable,
  options: AsyncOptions = {},
  seed: number = randomSeed(),
): Promise<StrategiesResult | null> {
  if (!Number.isInteger(hands) || hands <= 0) throw new Error('simulateStrategies: hands must be a positive integer');
  if (options.signal?.aborted) return null;
  const t = await tablesAsync();
  if (options.signal?.aborted) return null;
  const rng = seededRng(seed);
  const scratch = new Int32Array(32 * PAYING);
  const checkpoints = logCheckpoints(hands);
  const state = STRATEGY_IDS.map((id) => ({ id, sum: 0, sumSq: 0, royals: 0, differed: 0, points: [] as { hands: number; payback: number }[] }));
  let next = 0;
  for (let i = 1; i <= hands; i++) {
    const d = deal(rng);
    const sorted = d.hand.slice().sort(ascending);
    const best = optimalPolicy(sorted, pays, scratch, t);
    for (const s of state) {
      const mask = s.id === 'optimal' ? best : POLICIES[s.id](sorted, pays, scratch, t);
      const rank = playHand(sorted, d.stub, mask);
      const paid = pays[rank];
      s.sum += paid;
      s.sumSq += paid * paid;
      if (rank === 9) s.royals++;
      if (mask !== best) s.differed++;
    }
    if (i === checkpoints[next]) {
      for (const s of state) s.points.push({ hands: i, payback: s.sum / i });
      next++;
    }
    if (i % YIELD_EVERY === 0) {
      options.onProgress?.(i, hands);
      await yieldToBrowser();
      if (options.signal?.aborted) return null;
    }
  }
  options.onProgress?.(hands, hands);
  return Object.fromEntries(
    state.map((s) => {
      const mean = s.sum / hands;
      const variance = hands > 1 ? (s.sumSq - hands * mean * mean) / (hands - 1) : 0;
      return [s.id, { points: s.points, payback: mean, se: Math.sqrt(Math.max(0, variance) / hands), royals: s.royals, differed: s.differed }];
    }),
  ) as StrategiesResult;
}

export interface SessionsResult {
  sessions: number;
  handsPerSession: number;
  /** Net coins at the end of each session (five coins a hand). */
  nets: number[];
  mean: number;
  median: number;
  /** Share of sessions that ended ahead. */
  ahead: number;
  /** Share of sessions with at least one royal flush. */
  withRoyal: number;
  /** Median result of the sessions without a royal. */
  medianWithoutRoyal: number;
}

/** Many sessions of perfect play at five coins a hand. */
export async function simulateSessions(
  sessions: number,
  handsPerSession: number,
  pays: PayTable,
  options: AsyncOptions = {},
  seed: number = randomSeed(),
): Promise<SessionsResult | null> {
  if (!Number.isInteger(sessions) || sessions <= 0) throw new Error('simulateSessions: sessions must be a positive integer');
  if (!Number.isInteger(handsPerSession) || handsPerSession <= 0) throw new Error('simulateSessions: handsPerSession must be a positive integer');
  if (options.signal?.aborted) return null;
  const t = await tablesAsync();
  if (options.signal?.aborted) return null;
  const rng = seededRng(seed);
  const scratch = new Int32Array(32 * PAYING);
  const nets: number[] = [];
  const hadRoyal: boolean[] = [];
  const total = sessions * handsPerSession;
  let done = 0;
  for (let s = 0; s < sessions; s++) {
    let net = 0;
    let royal = false;
    for (let h = 0; h < handsPerSession; h++) {
      const d = deal(rng);
      const sorted = d.hand.slice().sort(ascending);
      const rank = playHand(sorted, d.stub, optimalPolicy(sorted, pays, scratch, t));
      net += payout(rank, pays, MAX_COINS) - MAX_COINS;
      if (rank === 9) royal = true;
      if (++done % YIELD_EVERY === 0) {
        options.onProgress?.(done, total);
        await yieldToBrowser();
        if (options.signal?.aborted) return null;
      }
    }
    nets.push(net);
    hadRoyal.push(royal);
  }
  options.onProgress?.(total, total);
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const sorted = xs.slice().sort(ascending);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  return {
    sessions,
    handsPerSession,
    nets,
    mean: nets.reduce((a, b) => a + b, 0) / sessions,
    median: median(nets),
    ahead: nets.filter((n) => n > 0).length / sessions,
    withRoyal: hadRoyal.filter(Boolean).length / sessions,
    medianWithoutRoyal: median(nets.filter((_, i) => !hadRoyal[i])),
  };
}
