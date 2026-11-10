/**
 * Daifugo (大富豪) - Play hint for the human player.
 *
 * Asks the strongest AI tier what it would do with the player's hand, then
 * labels the suggestion with a reason the UI can explain. The AI only reads
 * public information (hand sizes, the play log) plus the asking player's own
 * hand, so a hint never leaks an opponent's cards.
 */

import { decideDaifugoAction, hasLegalDaifugoPlay } from './DaifugoAI';
import { applyAction, getPlayShape, getSelectedCards, sortHand } from './gameLogic';
import type { DaifugoNetworkState } from './multiplayerTypes';
import type { Card } from './types';

export type DaifugoHintReason =
  | 'finish'
  | 'forbiddenFinish'
  | 'eightCut'
  | 'revolution'
  | 'lead'
  | 'beat'
  | 'noLegalPlay'
  | 'holdStrong';

export type DaifugoHint =
  | {
    type: 'play';
    reason: Exclude<DaifugoHintReason, 'noLegalPlay' | 'holdStrong'>;
    cards: Card[];
    giveCards: Card[];
    discardCards: Card[];
  }
  | { type: 'pass'; reason: 'noLegalPlay' | 'holdStrong' };

/**
 * Suggested action for `playerId`, or null when it is not their turn (or the
 * round is over). A suggested play is always one the engine accepts.
 */
export function getDaifugoHint(state: DaifugoNetworkState, playerId: string): DaifugoHint | null {
  if (state.finished) return null;
  if (state.currentTurnPlayerId !== playerId) return null;

  const hand = state.hands[playerId] ?? [];
  if (hand.length === 0) return null;

  const decision = decideDaifugoAction(state, playerId, 'master');

  if (decision.type === 'pass') {
    if (!state.pile) return null;
    return { type: 'pass', reason: hasLegalDaifugoPlay(state, playerId) ? 'holdStrong' : 'noLegalPlay' };
  }

  const cards = getSelectedCards(hand, decision.cardIds);
  const shape = cards ? getPlayShape(cards) : null;
  if (!cards || !shape) return null;

  const result = applyAction(state, {
    actionId: 'hint_probe',
    type: 'play',
    playerId,
    cardIds: decision.cardIds,
    giveCardIds: decision.giveCardIds,
    discardCardIds: decision.discardCardIds,
    timestamp: 0,
  });
  if (!result.ok) return null;

  const after = result.state;
  const emptiesHand = (after.hands[playerId] ?? []).length === 0;
  // あがり禁止: going out on a joker / 2 / 8 (3 under revolution) ranks the player last.
  const penalized = emptiesHand && after.forbiddenFinishers.includes(playerId);

  let reason: Extract<DaifugoHint, { type: 'play' }>['reason'];
  if (penalized) reason = 'forbiddenFinish';
  else if (emptiesHand) reason = 'finish';
  else if (after.revolution !== state.revolution) reason = 'revolution';
  else if (shape.containsEight && !after.pile) reason = 'eightCut';
  else reason = state.pile ? 'beat' : 'lead';

  return {
    type: 'play',
    reason,
    cards: sortHand(cards),
    giveCards: sortHand(getSelectedCards(hand, decision.giveCardIds ?? []) ?? []),
    discardCards: sortHand(getSelectedCards(hand, decision.discardCardIds ?? []) ?? []),
  };
}
