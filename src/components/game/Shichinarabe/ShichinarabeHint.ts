/**
 * Shichinarabe (七並べ) - move hint for the human player.
 *
 * Suggests a move and says why. The suggestion comes from the deterministic
 * expert heuristic, and the explanation is derived from the same public
 * information the AI is limited to (table, the player's own hand, hand sizes
 * and the play/pass log) — a hint never reveals an opponent's concealed cards.
 */

import type { ShichinarabeNetworkState } from './multiplayerTypes';
import type { Card } from './types';
import { MAX_RANK, MIN_RANK } from './types';
import { getPlayableCardsForPlayer } from './gameLogic';
import { decideShichinarabeAction } from './ShichinarabeAI';
import { buildShichinarabeEstimator } from './ShichinarabeEstimator';

export type ShichinarabeHintReason =
  /** No legal card: passing is the only option. */
  | 'forcedPass'
  /** Legal cards exist, but each would hand a rival an immediate play. */
  | 'hold'
  /** Exactly one legal card. */
  | 'onlyMove'
  /** The card frees more of the player's own cards further along the row. */
  | 'unblocksOwn'
  /** An ace or king: the row ends there, so nobody gains a new slot. */
  | 'deadEnd'
  /** No active opponent is likely to hold the card that would follow. */
  | 'safe'
  /** Every option helps someone; this one costs the least. */
  | 'leastHarm';

export interface ShichinarabeHint {
  action: 'play' | 'pass';
  /** The suggested card (null for a pass). */
  card: Card | null;
  reason: ShichinarabeHintReason;
  /** For 'unblocksOwn': how many of the player's cards lie beyond the suggested one. */
  ownCardsBehind: number;
}

/** Below this hold probability the slot a play exposes counts as safe (matches the AI's threshold). */
const SAFE_HOLD_PROBABILITY = 0.25;

/**
 * Hint for `playerId`, or null when it is not their turn / the game is over.
 */
export function getShichinarabeHint(
  state: ShichinarabeNetworkState,
  playerId: string,
): ShichinarabeHint | null {
  if (state.finished || state.currentTurnPlayerId !== playerId) return null;

  const playable = getPlayableCardsForPlayer(state, playerId);
  if (playable.length === 0) {
    return { action: 'pass', card: null, reason: 'forcedPass', ownCardsBehind: 0 };
  }

  const decision = decideShichinarabeAction(state, playerId, 'expert');
  if (decision.type === 'pass') {
    return { action: 'pass', card: null, reason: 'hold', ownCardsBehind: 0 };
  }
  const card = playable.find(c => c.id === decision.cardId) ?? playable[0]!;

  const dir = card.rank === state.table[card.suit].low - 1 ? -1 : 1;
  let ownCardsBehind = 0;
  for (const c of state.hands[playerId] ?? []) {
    if (c.suit === card.suit && (c.rank - card.rank) * dir > 0) ownCardsBehind += 1;
  }

  const base = { action: 'play' as const, card, ownCardsBehind };
  if (playable.length === 1) return { ...base, reason: 'onlyMove' };
  if (ownCardsBehind > 0) return { ...base, reason: 'unblocksOwn' };

  const exposedRank = card.rank + dir;
  if (exposedRank < MIN_RANK || exposedRank > MAX_RANK) return { ...base, reason: 'deadEnd' };

  const holdProbability = buildShichinarabeEstimator(state, playerId)
    .activeOpponentHoldProbability(card.suit, exposedRank);
  return { ...base, reason: holdProbability < SAFE_HOLD_PROBABILITY ? 'safe' : 'leastHarm' };
}
