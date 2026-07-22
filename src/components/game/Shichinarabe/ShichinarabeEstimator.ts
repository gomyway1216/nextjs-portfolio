/**
 * Shichinarabe (七並べ) - fair hidden-card estimator.
 *
 * Estimates where the unseen cards are using ONLY information a human player
 * at the table could observe:
 *
 *  - the table runs (every rank between each suit's low/high bound is played),
 *  - the estimating player's own hand,
 *  - every player's hand SIZE (the UI shows a card count for each player),
 *  - player status (active / finished / eliminated),
 *  - the public game log: plays (including cards auto-revealed from eliminated
 *    hands) and passes.
 *
 * It never reads the identity of a card in another player's hand — not even
 * an eliminated player's residual (still un-flushed) cards, since the UI only
 * shows those as a count until the table reaches them.
 *
 * Because every card is dealt (there is no stock), an unseen card must sit in
 * either an active opponent's hand or an eliminated player's residual hand.
 * The estimator distributes each unseen card across those holders in
 * proportion to their hand sizes, then discounts a holder for every time that
 * holder PASSED while the card was playable — a pass is strong (not perfect:
 * expert/master pass strategically) evidence they did not hold any
 * then-playable card. Pass moments are reconstructed by replaying the public
 * log's play events to recover the table bounds at each pass.
 */

import type { ShichinarabeNetworkState } from './multiplayerTypes';
import type { CardSuit } from './types';
import { MAX_RANK, MIN_RANK, SEVEN_RANK, SUITS } from './types';

/**
 * Multiplier applied to a holder's weight for each observed pass while the
 * card was playable. Not 0 because a pass can be strategic (expert/master
 * deliberately hold blocking cards), so it is evidence, not proof.
 */
export const PASS_EVIDENCE_DISCOUNT = 0.3;

export interface UnknownCard {
  suit: CardSuit;
  rank: number;
}

export interface OpponentHoldProbability {
  playerId: string;
  /** The opponent's (public) hand size. */
  handSize: number;
  probability: number;
}

export interface ShichinarabeEstimator {
  /** Cards the estimating player cannot see: not on the table, not in their own hand. */
  unknownCards: UnknownCard[];
  /**
   * P(the card is currently held by an ACTIVE opponent of the estimating
   * player). 0 for cards on the table or in the estimator's own hand; in
   * (0, 1] for unseen cards (mass below 1 goes to eliminated residual hands).
   */
  activeOpponentHoldProbability(suit: CardSuit, rank: number): number;
  /**
   * Per-opponent breakdown of activeOpponentHoldProbability (the entries sum
   * to it). Lets callers weight by WHO likely holds the card, e.g. treat a
   * near-winner holding the blocker as more urgent.
   */
  activeOpponentHoldProbabilities(suit: CardSuit, rank: number): OpponentHoldProbability[];
  /** Times `playerId` passed while (suit, rank) was playable, per the public log. */
  passEvidence(playerId: string, suit: CardSuit, rank: number): number;
}

function cardKey(suit: CardSuit, rank: number): string {
  return `${suit}${rank}`;
}

/**
 * Replay the public log to count, per player, how many times they passed while
 * each edge slot was playable. Only play/pass entries are needed: play entries
 * (including elimination reveals) move the table bounds, pass entries snapshot
 * the then-playable slots.
 */
function buildPassEvidence(state: ShichinarabeNetworkState): Map<string, Map<string, number>> {
  const bounds: Record<CardSuit, { low: number; high: number }> = {
    S: { low: SEVEN_RANK, high: SEVEN_RANK },
    H: { low: SEVEN_RANK, high: SEVEN_RANK },
    D: { low: SEVEN_RANK, high: SEVEN_RANK },
    C: { low: SEVEN_RANK, high: SEVEN_RANK },
  };
  const evidence = new Map<string, Map<string, number>>();

  for (const entry of state.log) {
    if (entry.type === 'play' && entry.card) {
      const b = bounds[entry.card.suit];
      if (entry.card.rank === b.low - 1) b.low = entry.card.rank;
      else if (entry.card.rank === b.high + 1) b.high = entry.card.rank;
      continue;
    }
    if (entry.type !== 'pass') continue;

    let perPlayer = evidence.get(entry.playerId);
    if (!perPlayer) {
      perPlayer = new Map<string, number>();
      evidence.set(entry.playerId, perPlayer);
    }
    for (const suit of SUITS) {
      const b = bounds[suit];
      if (b.low > MIN_RANK) {
        const key = cardKey(suit, b.low - 1);
        perPlayer.set(key, (perPlayer.get(key) ?? 0) + 1);
      }
      if (b.high < MAX_RANK) {
        const key = cardKey(suit, b.high + 1);
        perPlayer.set(key, (perPlayer.get(key) ?? 0) + 1);
      }
    }
  }

  return evidence;
}

export function buildShichinarabeEstimator(
  state: ShichinarabeNetworkState,
  meId: string,
): ShichinarabeEstimator {
  // --- Public knowledge -----------------------------------------------------
  const myCards = new Set<string>();
  for (const card of state.hands[meId] ?? []) myCards.add(cardKey(card.suit, card.rank));

  const isOnTable = (suit: CardSuit, rank: number): boolean => {
    const b = state.table[suit];
    return rank >= b.low && rank <= b.high;
  };

  const unknownCards: UnknownCard[] = [];
  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
      if (isOnTable(suit, rank)) continue;
      if (myCards.has(cardKey(suit, rank))) continue;
      unknownCards.push({ suit, rank });
    }
  }

  // Hand SIZES are public (the UI shows a card count next to every player).
  // Note we only ever read `.length` of another player's hand — never a card.
  const eliminated = new Set(state.eliminatedOrder);
  const finished = new Set(state.finishedOrder);
  const activeOpponentSizes: { playerId: string; size: number }[] = [];
  const eliminatedResidualSizes: { playerId: string; size: number }[] = [];
  for (const playerId of state.playerOrder) {
    if (playerId === meId) continue;
    const size = (state.hands[playerId] ?? []).length;
    if (size === 0) continue;
    if (finished.has(playerId)) continue; // finished players hold nothing anyway
    if (eliminated.has(playerId)) eliminatedResidualSizes.push({ playerId, size });
    else activeOpponentSizes.push({ playerId, size });
  }

  const evidence = buildPassEvidence(state);
  const passEvidence = (playerId: string, suit: CardSuit, rank: number): number =>
    evidence.get(playerId)?.get(cardKey(suit, rank)) ?? 0;

  const activeOpponentHoldProbabilities = (suit: CardSuit, rank: number): OpponentHoldProbability[] => {
    if (rank < MIN_RANK || rank > MAX_RANK) return [];
    if (isOnTable(suit, rank) || myCards.has(cardKey(suit, rank))) return [];

    const activeWeights: number[] = [];
    let totalWeight = 0;
    for (const { playerId, size } of activeOpponentSizes) {
      const w = size * Math.pow(PASS_EVIDENCE_DISCOUNT, passEvidence(playerId, suit, rank));
      activeWeights.push(w);
      totalWeight += w;
    }
    for (const { playerId, size } of eliminatedResidualSizes) {
      totalWeight += size * Math.pow(PASS_EVIDENCE_DISCOUNT, passEvidence(playerId, suit, rank));
    }
    if (totalWeight <= 0) return [];
    return activeOpponentSizes.map(({ playerId, size }, i) => ({
      playerId,
      handSize: size,
      probability: activeWeights[i]! / totalWeight,
    }));
  };

  const activeOpponentHoldProbability = (suit: CardSuit, rank: number): number => {
    let total = 0;
    for (const { probability } of activeOpponentHoldProbabilities(suit, rank)) total += probability;
    return total;
  };

  return { unknownCards, activeOpponentHoldProbability, activeOpponentHoldProbabilities, passEvidence };
}
