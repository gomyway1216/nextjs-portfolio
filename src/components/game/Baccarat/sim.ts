/**
 * Monte Carlo simulations for the baccarat Simulation tab. Every hand is dealt
 * from real shuffled eight-deck shoes through the rules engine, so the
 * simulations can't drift from the table; the exact numbers they are compared
 * with come from `analysis.ts`.
 */

import { betOdds, exactOdds, shoeOdds } from './analysis';
import {
  DEFAULT_DECKS,
  createShoe,
  dealHand,
  settleBet,
  shoeFinished,
  unseenCounts,
  type Hand,
  type Shoe,
  type Side,
} from './engine';

/** The bet lines the simulations track (the 9:1 tie is the same hands as 8:1). */
export const SIM_BETS = ['banker', 'bankerEz', 'player', 'tie', 'pair', 'dragon7', 'panda8'] as const;
export type SimBet = (typeof SIM_BETS)[number];

export const BET_COLORS: Record<SimBet, string> = {
  banker: '#ef4444',
  bankerEz: '#f97316',
  player: '#3b82f6',
  tie: '#22c55e',
  pair: '#a78bfa',
  dragon7: '#eab308',
  panda8: '#f472b6',
};

/** Profit of one unit on the line for this hand. */
export function lineProfit(id: SimBet, hand: Hand): number {
  const r =
    id === 'bankerEz'
      ? settleBet('banker', 1, hand, 'ez')
      : id === 'pair'
        ? settleBet('playerPair', 1, hand, 'commission')
        : settleBet(id, 1, hand, id === 'dragon7' || id === 'panda8' ? 'ez' : 'commission');
  return r.returned - 1;
}

/** The exact edge off the top of an eight-deck shoe. */
export const theoreticalEdge = (id: SimBet) => -betOdds(id, shoeOdds(DEFAULT_DECKS)).ev;

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const YIELD_EVERY = 20_000;
/** Exact odds cost a few ms per hand, so the counter yields every few hands. */
const COUNTING_YIELD_EVERY = 20;

export interface AsyncOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** Deals shoe after shoe, reshuffling after the cut card, as at a real table. */
export function createDealer(rng: () => number = Math.random) {
  let shoe: Shoe = createShoe(DEFAULT_DECKS, rng);
  let fresh = true;
  return {
    /** The shoe the next hand comes from, and whether that hand opens it. */
    peek() {
      if (shoeFinished(shoe)) {
        shoe = createShoe(DEFAULT_DECKS, rng);
        fresh = true;
      }
      return { shoe, fresh };
    },
    /** The cut card has come out of the current shoe: its last hand has been dealt. */
    shoeDone: () => shoeFinished(shoe),
    deal(): { hand: Hand; newShoe: boolean } {
      const { shoe: current, fresh: newShoe } = this.peek();
      const dealt = dealHand(current);
      shoe = dealt.shoe;
      fresh = false;
      return { hand: dealt.hand, newShoe };
    },
  };
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

export interface LineSummary {
  points: EdgePoint[];
  edge: number;
  /** Standard error of the edge estimate. */
  se: number;
}

export type LinesResult = Record<SimBet, LineSummary>;

/**
 * Bets one unit on every line on the same hands and tracks each line's
 * observed house edge at log-spaced checkpoints.
 */
export async function simulateLines(
  hands: number,
  options: AsyncOptions = {},
  rng: () => number = Math.random,
): Promise<LinesResult | null> {
  if (!Number.isInteger(hands) || hands <= 0) throw new Error('simulateLines: hands must be a positive integer');
  const dealer = createDealer(rng);
  const checkpoints = logCheckpoints(hands);
  const sum = SIM_BETS.map(() => 0);
  const sumSq = SIM_BETS.map(() => 0);
  const points = SIM_BETS.map(() => [] as EdgePoint[]);
  let next = 0;
  for (let i = 1; i <= hands; i++) {
    const { hand } = dealer.deal();
    SIM_BETS.forEach((id, k) => {
      const p = lineProfit(id, hand);
      sum[k] += p;
      sumSq[k] += p * p;
    });
    if (i === checkpoints[next]) {
      SIM_BETS.forEach((_, k) => points[k].push({ hands: i, edge: -sum[k] / i }));
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
    SIM_BETS.map((id, k) => {
      const mean = sum[k] / hands;
      const variance = hands > 1 ? (sumSq[k] - hands * mean * mean) / (hands - 1) : 0;
      return [id, { points: points[k], edge: -mean, se: Math.sqrt(Math.max(0, variance) / hands) }];
    }),
  ) as LinesResult;
}

// ---------------------------------------------------------------------------
// Chasing the road
// ---------------------------------------------------------------------------

export const PATTERN_IDS = ['banker', 'player', 'follow', 'chop', 'streak3', 'coin'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

/**
 * The side a road-reading system bets, given this shoe's decided results so
 * far (ties don't count, as on the big road), or null to sit out.
 */
export function patternChoice(id: PatternId, road: readonly Side[], coin: () => number): Side | null {
  const last = road[road.length - 1];
  const other = (s: Side): Side => (s === 'banker' ? 'player' : 'banker');
  switch (id) {
    case 'banker':
      return 'banker';
    case 'player':
      return 'player';
    case 'follow':
      return last ?? null;
    case 'chop':
      return last ? other(last) : null;
    case 'streak3': {
      if (road.length < 3) return null;
      const [a, b, c] = road.slice(-3);
      return a === b && b === c ? other(c) : null;
    }
    case 'coin':
      return coin() < 0.5 ? 'banker' : 'player';
  }
}

export interface PatternSummary {
  bets: number;
  bankerBets: number;
  edge: number;
  se: number;
  /** What the mix of Banker and Player bets it made should cost: the exact edges, weighted. */
  expectedEdge: number;
}

export interface PatternsResult {
  hands: number;
  /** Shoes dealt from; the last one may be unfinished. */
  shoes: number;
  strategies: Record<PatternId, PatternSummary>;
  /** Longest run of one side (ties skipped) in each complete shoe. */
  longestStreaks: number[];
}

export async function simulatePatterns(
  hands: number,
  options: AsyncOptions = {},
  rng: () => number = Math.random,
): Promise<PatternsResult | null> {
  if (!Number.isInteger(hands) || hands <= 0) throw new Error('simulatePatterns: hands must be a positive integer');
  const dealer = createDealer(rng);
  const stats = PATTERN_IDS.map(() => ({ bets: 0, bankerBets: 0, sum: 0, sumSq: 0 }));
  const longestStreaks: number[] = [];
  let road: Side[] = [];
  let run = 0;
  let longest = 0;
  let shoes = 0;
  for (let i = 1; i <= hands; i++) {
    if (dealer.peek().fresh) {
      // A new shoe: the old one is complete, and its road is wiped as at a real table.
      if (i > 1) longestStreaks.push(longest);
      shoes++;
      road = [];
      run = 0;
      longest = 0;
    }
    const choices = PATTERN_IDS.map((id) => patternChoice(id, road, rng));
    const { hand } = dealer.deal();
    choices.forEach((side, k) => {
      if (side === null) return;
      const p = settleBet(side, 1, hand, 'commission').returned - 1;
      const s = stats[k];
      s.bets++;
      if (side === 'banker') s.bankerBets++;
      s.sum += p;
      s.sumSq += p * p;
    });
    if (hand.winner !== 'tie') {
      run = road.length > 0 && road[road.length - 1] === hand.winner ? run + 1 : 1;
      longest = Math.max(longest, run);
      road.push(hand.winner);
    }
    if (i % YIELD_EVERY === 0) {
      options.onProgress?.(i, hands);
      await yieldToBrowser();
      if (options.signal?.aborted) return null;
    }
  }
  // A run that stops right after a cut-card hand has completed its last shoe too.
  if (dealer.shoeDone()) longestStreaks.push(longest);
  options.onProgress?.(hands, hands);
  const bankerEdge = theoreticalEdge('banker');
  const playerEdge = theoreticalEdge('player');
  const strategies = Object.fromEntries(
    PATTERN_IDS.map((id, k) => {
      const s = stats[k];
      const mean = s.bets > 0 ? s.sum / s.bets : 0;
      const variance = s.bets > 1 ? (s.sumSq - s.bets * mean * mean) / (s.bets - 1) : 0;
      const bankerShare = s.bets > 0 ? s.bankerBets / s.bets : 0;
      return [
        id,
        {
          bets: s.bets,
          bankerBets: s.bankerBets,
          edge: -mean,
          se: s.bets > 0 ? Math.sqrt(Math.max(0, variance) / s.bets) : 0,
          expectedEdge: bankerShare * bankerEdge + (1 - bankerShare) * playerEdge,
        },
      ];
    }),
  ) as Record<PatternId, PatternSummary>;
  return { hands, shoes, strategies, longestStreaks };
}

// ---------------------------------------------------------------------------
// Counting cards
// ---------------------------------------------------------------------------

export interface CountingLine {
  /** Hands where the line had a player edge given the unseen cards. */
  positive: number;
  /** Sum of those edges: the expected profit of betting 1 unit only then. */
  gain: number;
  /** What those bets actually returned in the simulation. */
  realized: number;
}

export interface CountingResult {
  shoes: number;
  hands: number;
  lines: Record<SimBet, CountingLine>;
  /** Each line's exact edge before every hand of the first shoe (negative = house edge). */
  sampleShoe: Record<SimBet, number[]>;
}

/**
 * A perfect counter: before every hand, the exact expectation of every line
 * from the cards not yet seen; bet one unit only when it is positive.
 */
export async function simulateCounting(
  shoes: number,
  options: AsyncOptions = {},
  rng: () => number = Math.random,
): Promise<CountingResult | null> {
  if (!Number.isInteger(shoes) || shoes <= 0) throw new Error('simulateCounting: shoes must be a positive integer');
  const lines = Object.fromEntries(SIM_BETS.map((id) => [id, { positive: 0, gain: 0, realized: 0 }])) as Record<SimBet, CountingLine>;
  const sampleShoe = Object.fromEntries(SIM_BETS.map((id) => [id, [] as number[]])) as Record<SimBet, number[]>;
  let hands = 0;
  for (let s = 0; s < shoes; s++) {
    let shoe = createShoe(DEFAULT_DECKS, rng);
    while (!shoeFinished(shoe)) {
      const odds = exactOdds(unseenCounts(shoe));
      const evs = SIM_BETS.map((id) => betOdds(id, odds).ev);
      const dealt = dealHand(shoe);
      shoe = dealt.shoe;
      SIM_BETS.forEach((id, k) => {
        if (s === 0) sampleShoe[id].push(evs[k]);
        if (evs[k] > 0) {
          lines[id].positive++;
          lines[id].gain += evs[k];
          lines[id].realized += lineProfit(id, dealt.hand);
        }
      });
      hands++;
      if (hands % COUNTING_YIELD_EVERY === 0) {
        // Progress in shoes, counting the part of this one dealt so far.
        options.onProgress?.(s + Math.min(1, shoe.next / shoe.cutIndex), shoes);
        await yieldToBrowser();
        if (options.signal?.aborted) return null;
      }
    }
    options.onProgress?.(s + 1, shoes);
    await yieldToBrowser();
    if (options.signal?.aborted) return null;
  }
  return { shoes, hands, lines, sampleShoe };
}
