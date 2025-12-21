/**
 * Doubt (ダウト) - Simple AI
 *
 * Deterministic heuristic AI for both play and challenge decisions.
 */

import type { DoubtNetworkState } from './multiplayerTypes';
import type { Card } from './types';
import { sortHand } from './gameLogic';

export type DoubtAIDecision =
  | { type: 'accept' }
  | { type: 'doubt' }
  | { type: 'play'; cardIds: string[] };

function countRank(hand: Card[], rank: number): number {
  return hand.reduce((acc, c) => acc + (c.rank === rank ? 1 : 0), 0);
}

export function decideDoubtAIDecision(state: DoubtNetworkState, playerId: string): DoubtAIDecision {
  if (state.finished || state.phase === 'finished') return { type: 'accept' };
  if (state.currentTurnPlayerId !== playerId) return { type: 'accept' };

  const hand = sortHand(state.hands[playerId] ?? []);

  if (state.phase === 'challenge') {
    const claim = state.pendingClaim;
    if (!claim) return { type: 'accept' };

    const myCount = countRank(hand, claim.declaredRank);
    const maxPossibleTrue = 4 - myCount;

    // Certainty: they can't have played that many of the declared rank.
    if (claim.cardCount > maxPossibleTrue) return { type: 'doubt' };

    // Strong suspicion: you hold almost all copies.
    if (myCount >= 3) return { type: 'doubt' };

    // If this play would make the claimant go out, challenge a bit more aggressively.
    if (claim.wentOut) {
      if (myCount >= 2) return { type: 'doubt' };
      if (claim.cardCount >= 3) return { type: 'doubt' };
    }

    // Small pile => lower penalty to gamble.
    if (state.pile.length <= 6 && myCount >= 2 && claim.cardCount >= 2) return { type: 'doubt' };

    return { type: 'accept' };
  }

  // play phase
  const requiredRank = state.requiredRank;
  const matching = hand.filter(c => c.rank === requiredRank);

  if (matching.length > 0) {
    const wantAll = hand.length <= matching.length;
    const takeCount = wantAll ? matching.length : Math.min(2, matching.length);
    const chosen = matching.slice(0, Math.max(1, Math.min(4, takeCount)));
    return { type: 'play', cardIds: chosen.map(c => c.id) };
  }

  // Lying: play fewer cards to reduce suspicion.
  const lieCount = hand.length >= 12 ? 2 : 1;
  const chosen = hand.slice(-Math.max(1, Math.min(4, lieCount)));
  return { type: 'play', cardIds: chosen.map(c => c.id) };
}

