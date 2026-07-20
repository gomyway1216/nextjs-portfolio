/**
 * Doubt (ダウト) - AI opponents
 *
 * Provides believable bluffing + doubting behaviour with real difficulty tiers.
 *
 * The AI reasons about two decisions:
 *  1. CHALLENGE (challenge phase): should it Accept or call Doubt on the pending
 *     claim? This is driven by an estimate of P(claim is truthful), tempered by
 *     the pile size (risk of picking up a big pile) and how aggressive the tier is.
 *  2. PLAY (play phase): which cards to place and whether to bluff. Truthful plays
 *     are preferred; when it must (or chooses to) bluff, it dumps its least useful
 *     cards and picks a believable count.
 *
 * The AI can only truly SEE its own hand. From that it knows how many copies of the
 * required rank it holds, which bounds how many the claimant could legitimately have
 * (there are only 4 of each rank). Card-counting tiers additionally lower their
 * effective threshold as fewer of a rank remain unaccounted for.
 */

import type { DoubtNetworkState } from './multiplayerTypes';
import type { Card, CardRank } from './types';
import { MAX_RANK, MIN_RANK } from './types';
import { sortHand } from './gameLogic';

export type DoubtAIDecision =
  | { type: 'accept' }
  | { type: 'doubt' }
  | { type: 'play'; cardIds: string[] };

export type DoubtDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface DoubtAIConfig {
  /** Probability the AI bluffs on a turn where it has 0 truthful cards is forced;
   * this is the extra propensity to bluff even when it *could* play truthfully. */
  bluffTendency: number;
  /** If estimated P(claim truthful) is below this, the AI leans toward doubting. */
  doubtThreshold: number;
  /** Uses its hand to bound how many copies opponents can hold. */
  countsCards: boolean;
  /** Extra willingness to doubt a claim that would let the claimant go out. */
  guardsGoingOut: boolean;
  /** 0..1 noise added to decisions so play is not perfectly predictable. */
  randomness: number;
  /** Times its own bluffs to try to go out (dump its whole hand as one rank). */
  timesGoingOut: boolean;
}

export const DOUBT_AI_CONFIGS: Record<DoubtDifficulty, DoubtAIConfig> = {
  easy: {
    bluffTendency: 0.1,
    doubtThreshold: 0.12,
    countsCards: false,
    guardsGoingOut: false,
    randomness: 0.35,
    timesGoingOut: false,
  },
  medium: {
    bluffTendency: 0.25,
    doubtThreshold: 0.3,
    countsCards: false,
    guardsGoingOut: true,
    randomness: 0.18,
    timesGoingOut: false,
  },
  hard: {
    bluffTendency: 0.4,
    doubtThreshold: 0.45,
    countsCards: true,
    guardsGoingOut: true,
    randomness: 0.08,
    timesGoingOut: true,
  },
  expert: {
    bluffTendency: 0.5,
    doubtThreshold: 0.55,
    countsCards: true,
    guardsGoingOut: true,
    randomness: 0.03,
    timesGoingOut: true,
  },
};

const COPIES_PER_RANK = 4;

export function countRank(hand: Card[], rank: number): number {
  let n = 0;
  for (const c of hand) if (c.rank === rank) n++;
  return n;
}

/**
 * Estimate the probability that a claim of `claimCount` cards of `declaredRank`
 * is fully truthful, given the AI holds `myCount` copies of that rank.
 *
 * There are 4 copies of the rank in the deck. The AI holds `myCount`, so at most
 * `4 - myCount` copies are anywhere else. If the claim needs more than that, it is
 * a certain lie (probability 0). Otherwise we estimate the chance the claimant's
 * hidden cards are all that rank using how "scarce" the rank is: the more copies
 * are unaccounted for relative to the unseen pool, the more plausible the claim.
 */
export function estimateClaimTruthProbability(params: {
  declaredRank: CardRank;
  claimCount: number;
  myCount: number;
  unseenCards: number;
}): number {
  const { claimCount, myCount, unseenCards } = params;
  const available = COPIES_PER_RANK - myCount;

  // Physically impossible: the claimant cannot own that many of the rank.
  if (claimCount > available) return 0;
  if (claimCount <= 0) return 1;
  if (available <= 0) return 0;

  // Hypergeometric-style estimate: probability that `claimCount` specific-rank
  // cards are among the claimant's hidden cards. We approximate by the chance
  // that each played card is one of the `available` copies drawn from `unseenCards`.
  const pool = Math.max(unseenCards, available, claimCount);
  let p = 1;
  for (let i = 0; i < claimCount; i++) {
    const favorable = Math.max(0, available - i);
    const remaining = Math.max(1, pool - i);
    p *= favorable / remaining;
  }
  // Scarcer ranks (fewer copies unaccounted for) make a large claim less credible.
  return Math.max(0, Math.min(1, p));
}

/** Count cards whose faces this AI cannot see: everything except its own hand.
 * Opponents' hands AND the face-down pile are all hidden, so both count as
 * "unseen" (we subtract only the AI's own hand from the 52-card deck). */
function countUnseen(state: DoubtNetworkState, playerId: string): number {
  const myHand = state.hands[playerId]?.length ?? 0;
  const total = 52;
  return Math.max(1, total - myHand);
}

function pickDifficulty(difficulty?: DoubtDifficulty): DoubtAIConfig {
  return DOUBT_AI_CONFIGS[difficulty ?? 'medium'];
}

/**
 * Decide whether to Accept or Doubt a pending claim.
 * Exposed for testing.
 */
export function decideChallenge(
  state: DoubtNetworkState,
  playerId: string,
  config: DoubtAIConfig,
  rng: () => number = Math.random,
): DoubtAIDecision {
  const claim = state.pendingClaim;
  if (!claim) return { type: 'accept' };

  const hand = state.hands[playerId] ?? [];
  const myCount = countRank(hand, claim.declaredRank);
  const available = COPIES_PER_RANK - myCount;

  // Certain lie: they cannot possibly hold this many of the rank.
  if (claim.cardCount > available) return { type: 'doubt' };

  const unseen = countUnseen(state, playerId);
  let pTrue = estimateClaimTruthProbability({
    declaredRank: claim.declaredRank,
    claimCount: claim.cardCount,
    myCount,
    unseenCards: unseen,
  });

  // Non-counting tiers reason more loosely: collapse toward a coin flip.
  if (!config.countsCards) {
    pTrue = 0.5 * pTrue + 0.5 * 0.5;
  }

  let threshold = config.doubtThreshold;

  // A big pile is a big penalty for a wrong doubt — become more cautious.
  const pileSize = state.pile.length;
  if (pileSize >= 12) threshold -= 0.12;
  else if (pileSize >= 6) threshold -= 0.05;

  // Someone about to go out is worth stopping even on a hunch.
  if (config.guardsGoingOut && claim.wentOut) {
    threshold += 0.2;
    if (myCount >= 2) return { type: 'doubt' };
  }

  // Holding many copies ourselves makes a multi-card claim implausible.
  if (config.countsCards && myCount >= 2 && claim.cardCount >= 2) {
    threshold += 0.15;
  }

  // Randomness so the AI is not perfectly readable.
  const jitter = (rng() - 0.5) * 2 * config.randomness;
  const effectiveP = pTrue + jitter;

  return effectiveP < threshold ? { type: 'doubt' } : { type: 'accept' };
}

/** Rank the AI would most like to keep (many copies) vs dump (singletons/far ranks). */
function scoreCardToDump(card: Card, hand: Card[], requiredRank: CardRank): number {
  // Higher score => better to dump now while bluffing.
  const copies = countRank(hand, card.rank);
  let score = 0;
  // Singletons are cheap to lie away.
  if (copies === 1) score += 3;
  // Prefer dumping ranks we will not soon be asked to declare truthfully.
  const distance = rankDistance(card.rank, requiredRank);
  score += Math.min(distance, 6) * 0.4;
  return score;
}

function rankDistance(a: CardRank, b: CardRank): number {
  const span = MAX_RANK - MIN_RANK + 1;
  const d = Math.abs(a - b);
  return Math.min(d, span - d);
}

/**
 * Decide which cards to play (and whether to bluff).
 * Exposed for testing.
 */
export function decidePlay(
  state: DoubtNetworkState,
  playerId: string,
  config: DoubtAIConfig,
  rng: () => number = Math.random,
): DoubtAIDecision {
  const requiredRank = state.requiredRank;
  const hand = sortHand(state.hands[playerId] ?? []);
  const matching = hand.filter(c => c.rank === requiredRank);

  // If we can go out this turn by playing every card as the required rank, do it
  // (only if it is actually truthful, or a smart tier decides to gamble the bluff).
  const canGoOutTruthfully = hand.length <= COPIES_PER_RANK && matching.length === hand.length && hand.length > 0;
  if (canGoOutTruthfully) {
    return { type: 'play', cardIds: hand.map(c => c.id) };
  }

  // Expert/hard: if the hand is tiny (<=4) time a bluff to go out by claiming them
  // all. Only attempt this high-risk bluff when the pile is small enough that being
  // doubted (opponents guard going-out aggressively) would not be catastrophic, AND
  // the claim is mostly truthful (at most one lie in it) or an occasional gamble —
  // never deterministically, or a human who tracks hand counts can always doubt it.
  if (config.timesGoingOut && hand.length >= 1 && hand.length <= 4 && state.pile.length <= 8) {
    const mostlyTruthful = matching.length >= hand.length - 1;
    if (mostlyTruthful || rng() < 0.2) {
      return { type: 'play', cardIds: hand.map(c => c.id) };
    }
  }

  if (matching.length > 0) {
    const wantBluffMore = rng() < config.bluffTendency;
    if (wantBluffMore && hand.length > matching.length) {
      // Add one or two "dump" cards on top of the truthful ones to shed junk.
      const truthfulIds = matching.slice(0, Math.min(matching.length, 3)).map(c => c.id);
      const junk = hand
        .filter(c => c.rank !== requiredRank)
        .map(c => ({ c, s: scoreCardToDump(c, hand, requiredRank) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, Math.max(0, 4 - truthfulIds.length))
        .map(x => x.c.id);
      const extra = junk.slice(0, rng() < 0.5 ? 1 : Math.min(2, junk.length));
      const chosen = [...truthfulIds, ...extra].slice(0, 4);
      return { type: 'play', cardIds: chosen };
    }

    // Straightforward truthful play: don't dump the whole stock at once early on.
    const takeCount = Math.min(matching.length, 2);
    const chosen = matching.slice(0, Math.max(1, takeCount)).map(c => c.id);
    return { type: 'play', cardIds: chosen };
  }

  // No truthful cards — we are forced to bluff. Dump our least useful cards.
  const ranked = hand
    .map(c => ({ c, s: scoreCardToDump(c, hand, requiredRank) }))
    .sort((a, b) => b.s - a.s);

  // Bigger, hand-shedding bluffs when the pile is small (cheap to lose it).
  const pileSmall = state.pile.length <= 6;
  const base = pileSmall ? 2 : 1;
  const bonus = rng() < config.bluffTendency ? 1 : 0;
  const bluffCount = Math.max(1, Math.min(4, Math.min(hand.length, base + bonus)));
  const chosen = ranked.slice(0, bluffCount).map(x => x.c.id);
  return { type: 'play', cardIds: chosen };
}

/**
 * Top-level AI entry point. `difficulty` selects the tier (defaults to medium
 * for backwards compatibility with existing callers).
 */
export function decideDoubtAIDecision(
  state: DoubtNetworkState,
  playerId: string,
  difficulty?: DoubtDifficulty,
  rng: () => number = Math.random,
): DoubtAIDecision {
  if (state.finished || state.phase === 'finished') return { type: 'accept' };
  if (state.currentTurnPlayerId !== playerId) return { type: 'accept' };

  const config = pickDifficulty(difficulty);

  if (state.phase === 'challenge') {
    return decideChallenge(state, playerId, config, rng);
  }

  return decidePlay(state, playerId, config, rng);
}
