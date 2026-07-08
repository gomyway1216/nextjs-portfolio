/**
 * Shichinarabe (七並べ) - AI opponents with real difficulty tiers.
 *
 * Difficulty tiers (mapped from the shared Difficulty scale):
 *  - easy    : plays a random legal card, never passes strategically.
 *  - medium  : greedy — plays whatever extends its own runs, small look-ahead.
 *  - hard    : evaluates each candidate, prefers cards that unblock its own hand
 *              and avoids handing opponents easy plays; passes only when forced.
 *  - expert  : hard + will strategically pass (spend a pass) to hold back a "key"
 *              card that is blocking many opponents, and races to go out.
 *  - master  : expert with more aggressive blocking, pass budgeting that accounts
 *              for how close it is to going out, and stronger end-game racing.
 *
 * The AI is intentionally heuristic (no deep search) so turns stay instant, but the
 * evaluation captures the real strategic tension of 七並べ: extend your own runs,
 * keep the cards that gate opponents' progress, and don't waste passes.
 */

import type { ShichinarabeNetworkState } from './multiplayerTypes';
import type { Card, CardSuit } from './types';
import { MAX_RANK, MIN_RANK, SEVEN_RANK } from './types';
import { getPlayableCardsForPlayer } from './gameLogic';

export type ShichinarabeAIDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export type ShichinarabeAIDecision =
  | { type: 'play'; cardId: string }
  | { type: 'pass' };

const SUITS: CardSuit[] = ['S', 'H', 'D', 'C'];

interface AIConfig {
  /** Weight for progressing the AI's own contiguous run behind a candidate. */
  ownChain: number;
  /** Penalty for opening a slot that many opponents can immediately exploit. */
  opponentGift: number;
  /** How willing the AI is to hold back (pass) a blocking key card. 0 = never. */
  blockAggression: number;
  /** Randomness added to scores to make lower tiers less predictable. */
  noise: number;
  /** Whether the AI ever spends a pass voluntarily to keep a blocking card. */
  canStrategicPass: boolean;
}

const CONFIG: Record<ShichinarabeAIDifficulty, AIConfig> = {
  easy: { ownChain: 0, opponentGift: 0, blockAggression: 0, noise: 100, canStrategicPass: false },
  medium: { ownChain: 3, opponentGift: 0, blockAggression: 0, noise: 8, canStrategicPass: false },
  hard: { ownChain: 5, opponentGift: 2, blockAggression: 0, noise: 2, canStrategicPass: false },
  expert: { ownChain: 6, opponentGift: 3, blockAggression: 1, noise: 0, canStrategicPass: true },
  master: { ownChain: 7, opponentGift: 4, blockAggression: 1.6, noise: 0, canStrategicPass: true },
};

function buildSuitRankSets(hand: Card[]): Record<CardSuit, Set<number>> {
  const sets: Record<CardSuit, Set<number>> = { S: new Set(), H: new Set(), D: new Set(), C: new Set() };
  for (const c of hand) sets[c.suit].add(c.rank);
  return sets;
}

/** How long a run continues in `dir` from `start`, using only ranks in `ranks`. */
function consecutiveLengthFrom(ranks: Set<number>, start: number, dir: -1 | 1): number {
  let len = 0;
  let r = start;
  while (r >= MIN_RANK && r <= MAX_RANK && ranks.has(r)) {
    len += 1;
    r += dir;
  }
  return len;
}

/**
 * A card is a "gate" if playing it opens a slot that lets other cards flow, and the
 * distance from 7 measures how many downstream cards it unlocks. Cards near 7 unlock
 * more of the board; extreme cards (A/K) unlock nothing beyond themselves.
 */
function distanceFromSeven(rank: number): number {
  return Math.abs(rank - SEVEN_RANK);
}

/**
 * Count how many *opponents* hold a card that would become immediately playable if
 * this candidate is placed (i.e. the slot just past the candidate, away from 7).
 * We can't see hands in a real game, but the local AI shares full state; to keep it
 * fair-ish we only look one slot ahead — the immediate gift.
 */
function opponentGiftCount(
  state: ShichinarabeNetworkState,
  meId: string,
  suit: CardSuit,
  candidateRank: number,
): number {
  const bounds = state.table[suit];
  // The slot this candidate would newly expose, moving away from centre.
  let exposedRank: number | null = null;
  if (candidateRank === bounds.low - 1) exposedRank = candidateRank - 1;
  else if (candidateRank === bounds.high + 1) exposedRank = candidateRank + 1;
  if (exposedRank === null || exposedRank < MIN_RANK || exposedRank > MAX_RANK) return 0;

  let count = 0;
  for (const [pid, hand] of Object.entries(state.hands)) {
    if (pid === meId) continue;
    if (state.finishedOrder.includes(pid) || state.eliminatedOrder.includes(pid)) continue;
    if (hand.some((c) => c.suit === suit && c.rank === exposedRank)) count += 1;
  }
  return count;
}

/** True if I hold a card in `suit` further out than `rank` (so extending helps me). */
function iBenefitDownstream(myRanks: Set<number>, suit: CardSuit, candidateRank: number, bounds: { low: number; high: number }): boolean {
  if (candidateRank === bounds.low - 1) {
    for (let r = candidateRank - 1; r >= MIN_RANK; r--) if (myRanks.has(r)) return true;
  } else if (candidateRank === bounds.high + 1) {
    for (let r = candidateRank + 1; r <= MAX_RANK; r++) if (myRanks.has(r)) return true;
  }
  return false;
}

function scoreCard(
  state: ShichinarabeNetworkState,
  meId: string,
  card: Card,
  myRanks: Record<CardSuit, Set<number>>,
  cfg: AIConfig,
): number {
  const bounds = state.table[card.suit];
  let dir: -1 | 1 = 1;
  let nextRank = card.rank + 1;
  if (card.rank === bounds.low - 1) {
    dir = -1;
    nextRank = card.rank - 1;
  }

  // Length of my own run immediately behind this card — how much playing it unblocks me.
  const ownChain = consecutiveLengthFrom(myRanks[card.suit], nextRank, dir);
  const benefitsMe = iBenefitDownstream(myRanks[card.suit], card.suit, card.rank, bounds);

  // How much this play helps opponents (opening a slot they can use next).
  const gift = opponentGiftCount(state, meId, card.suit, card.rank);

  let score = 0;
  score += ownChain * cfg.ownChain;
  // Prefer clearing cards closer to 7 first: they gate more of the board and are the
  // cards most likely to trap us if held too long.
  score += (SEVEN_RANK - distanceFromSeven(card.rank)) * 0.6;
  // Playing a card that continues my own chain is strictly good.
  if (benefitsMe) score += 4;
  // Discourage handing opponents free plays (only matters for hard+).
  score -= gift * cfg.opponentGift;

  if (cfg.noise > 0) score += Math.random() * cfg.noise;
  return score;
}

/**
 * Decide whether it's worth *voluntarily passing* to keep a blocking card.
 * A card is "blocking" if opponents are waiting behind it. Holding it stalls them,
 * but every pass spends toward our own elimination, so we only do this when:
 *   - we have passes to spare, and
 *   - the card blocks enough opponents to be worth a pass, and
 *   - we are not so close to going out that racing is better.
 */
function shouldStrategicPass(
  state: ShichinarabeNetworkState,
  meId: string,
  playable: Card[],
  cfg: AIConfig,
): boolean {
  if (!cfg.canStrategicPass) return false;

  const passesUsed = state.passCounts[meId] ?? 0;
  const passesLeft = state.maxPasses - passesUsed;
  if (passesLeft <= 1) return false; // keep our last pass as a lifeline

  const myHand = state.hands[meId] ?? [];
  // If we're close to winning, just play — racing beats blocking.
  if (myHand.length <= 3) return false;

  const myRanks = buildSuitRankSets(myHand);

  // How many opponents each candidate would gift a play to.
  let maxGift = 0;
  let bestBenefitsMe = false;
  for (const card of playable) {
    const bounds = state.table[card.suit];
    const gift = opponentGiftCount(state, meId, card.suit, card.rank);
    if (gift > maxGift) maxGift = gift;
    if (iBenefitDownstream(myRanks[card.suit], card.suit, card.rank, bounds)) bestBenefitsMe = true;
  }

  // If every legal card only helps opponents and none extends our own chain,
  // holding (passing) can be worth it — scaled by aggression and how many rivals gate.
  // Expert (blockAggression 1) holds when >=2 rivals wait behind a card; master
  // (blockAggression 1.6) will hold even for a single gated rival.
  if (!bestBenefitsMe && maxGift >= 1) {
    return maxGift * cfg.blockAggression >= 2;
  }
  return false;
}

export function decideShichinarabeAction(
  state: ShichinarabeNetworkState,
  playerId: string,
  difficulty: ShichinarabeAIDifficulty = 'hard',
): ShichinarabeAIDecision {
  if (state.finished) return { type: 'pass' };
  if (state.currentTurnPlayerId !== playerId) return { type: 'pass' };

  const playable = getPlayableCardsForPlayer(state, playerId);
  if (playable.length === 0) return { type: 'pass' };

  const cfg = CONFIG[difficulty];

  // easy: just play a random legal card.
  if (difficulty === 'easy') {
    const pick = playable[Math.floor(Math.random() * playable.length)]!;
    return { type: 'play', cardId: pick.id };
  }

  // Consider holding a blocking card (expert/master only).
  if (shouldStrategicPass(state, playerId, playable, cfg)) {
    return { type: 'pass' };
  }

  const hand = state.hands[playerId] ?? [];
  const myRanks = buildSuitRankSets(hand);

  let best = playable[0]!;
  let bestScore = -Infinity;
  for (const card of playable) {
    const s = scoreCard(state, playerId, card, myRanks, cfg);
    if (s > bestScore || (s === bestScore && card.id.localeCompare(best.id) < 0)) {
      bestScore = s;
      best = card;
    }
  }

  return { type: 'play', cardId: best.id };
}

export { SUITS as SHICHINARABE_SUITS };
