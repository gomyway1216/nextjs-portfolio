/**
 * Shichinarabe (七並べ) - Simple AI
 */

import type { ShichinarabeNetworkState } from './multiplayerTypes';
import type { Card, CardSuit } from './types';
import { SEVEN_RANK } from './types';
import { getPlayableCardsForPlayer } from './gameLogic';

export type ShichinarabeAIDecision =
  | { type: 'play'; cardId: string }
  | { type: 'pass' };

const SUIT_ORDER: Record<CardSuit, number> = { S: 0, H: 1, D: 2, C: 3 };

function buildSuitRankSets(hand: Card[]): Record<CardSuit, Set<number>> {
  const sets: Record<CardSuit, Set<number>> = { S: new Set(), H: new Set(), D: new Set(), C: new Set() };
  for (const c of hand) sets[c.suit].add(c.rank);
  return sets;
}

function consecutiveLengthFrom(ranks: Set<number>, start: number, dir: -1 | 1): number {
  let len = 0;
  let r = start;
  while (ranks.has(r)) {
    len += 1;
    r += dir;
  }
  return len;
}

function scorePlayableCard(state: ShichinarabeNetworkState, card: Card, suitRanks: Record<CardSuit, Set<number>>): readonly number[] {
  const bounds = state.table[card.suit];
  const downRank = bounds.low - 1;
  const upRank = bounds.high + 1;

  let dir: -1 | 1 = 1;
  let nextRank = card.rank + 1;
  if (card.rank === downRank) {
    dir = -1;
    nextRank = card.rank - 1;
  } else if (card.rank === upRank) {
    dir = 1;
    nextRank = card.rank + 1;
  }

  const futureLen = consecutiveLengthFrom(suitRanks[card.suit], nextRank, dir);
  const distanceFromSeven = Math.abs(card.rank - SEVEN_RANK);
  const suitWeight = SUIT_ORDER[card.suit] ?? 9;
  return [futureLen, distanceFromSeven, -card.rank, -suitWeight];
}

export function decideShichinarabeAction(state: ShichinarabeNetworkState, playerId: string): ShichinarabeAIDecision {
  if (state.finished) return { type: 'pass' };
  if (state.currentTurnPlayerId !== playerId) return { type: 'pass' };

  const hand = state.hands[playerId] ?? [];
  const playable = getPlayableCardsForPlayer(state, playerId);
  if (playable.length === 0) return { type: 'pass' };

  const suitRanks = buildSuitRankSets(hand);

  const scored = playable.map((card) => ({
    card,
    score: scorePlayableCard(state, card, suitRanks),
  }));

  scored.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      const diff = b.score[i]! - a.score[i]!;
      if (diff !== 0) return diff;
    }
    return a.card.id.localeCompare(b.card.id);
  });

  return { type: 'play', cardId: scored[0]!.card.id };
}

