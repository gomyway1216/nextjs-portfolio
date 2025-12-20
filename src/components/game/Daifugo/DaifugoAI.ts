/**
 * Daifugo (大富豪) - Simple AI
 *
 * Heuristic:
 * - Prefer low-impact moves (keep strong cards)
 * - Supports group and straight plays (階段)
 */

import type { DaifugoNetworkState } from './multiplayerTypes';
import type { Card } from './types';
import { isJoker, JOKER_RANK } from './types';
import { applyAction, getPlayShape, sortHand } from './gameLogic';

export type DaifugoAIDecision =
  | { type: 'play'; cardIds: string[]; giveCardIds?: string[]; discardCardIds?: string[] }
  | { type: 'pass' };

function groupByRank(hand: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const card of hand) {
    if (isJoker(card)) continue;
    const list = map.get(card.rank) ?? [];
    list.push(card);
    map.set(card.rank, list);
  }
  return map;
}

function groupBySuit(hand: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const card of hand) {
    if (isJoker(card)) continue;
    const list = map.get(card.suit) ?? [];
    list.push(card);
    map.set(card.suit, list);
  }
  return map;
}

function generateGroupCandidates(hand: Card[]): string[][] {
  const sorted = sortHand(hand);
  const joker = sorted.find(isJoker);
  const groups = groupByRank(sorted);
  const candidates: string[][] = [];

  for (const [, cards] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
    const maxCount = Math.min(4, cards.length);
    for (let count = 1; count <= maxCount; count++) {
      candidates.push(cards.slice(0, count).map(c => c.id));
    }
  }

  if (joker) candidates.push([joker.id]);
  return candidates;
}

function generateStraightCandidates(hand: Card[]): string[][] {
  const bySuit = groupBySuit(hand);
  const candidates: string[][] = [];

  for (const cards of bySuit.values()) {
    const sorted = [...cards].sort((a, b) => a.rank - b.rank);
    const byRank = new Map<number, Card>();
    for (const card of sorted) byRank.set(card.rank, card);

    const ranks = Array.from(byRank.keys()).sort((a, b) => a - b);

    // Find consecutive runs
    let runStart = 0;
    for (let i = 1; i <= ranks.length; i++) {
      const prev = ranks[i - 1];
      const cur = ranks[i];
      const continues = typeof cur === 'number' && cur === (prev ?? 0) + 1;
      if (continues) continue;

      const run = ranks.slice(runStart, i);
      if (run.length >= 3) {
        for (let start = 0; start <= run.length - 3; start++) {
          for (let len = 3; len <= run.length - start; len++) {
            const seq = run.slice(start, start + len);
            const ids = seq.map(r => byRank.get(r)!.id);
            candidates.push(ids);
          }
        }
      }

      runStart = i;
    }
  }

  return candidates;
}

function sortCandidatesForLead(state: DaifugoNetworkState, candidates: string[][]): string[][] {
  const reversed = state.revolution !== state.jackBack;

  const scored = candidates.map((ids) => {
    const cards = ids.map(id => state.hands[state.currentTurnPlayerId]?.find(c => c.id === id)).filter(Boolean) as Card[];
    const shape = getPlayShape(cards);
    const isJokerSingle = !!shape && shape.kind === 'group' && shape.rankKey === JOKER_RANK;
    const rankKey = shape?.rankKey ?? 999;
    const kindWeight = shape?.kind === 'straight' ? 10 : 0;
    const countWeight = -(shape?.count ?? 1);
    const rankScore = isJokerSingle ? 9999 : reversed ? -rankKey : rankKey;
    return { ids, score: [isJokerSingle ? 1 : 0, kindWeight, rankScore, countWeight] as const };
  });

  scored.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      const diff = a.score[i] - b.score[i];
      if (diff !== 0) return diff;
    }
    return 0;
  });

  return scored.map(s => s.ids);
}

function pickGiveCards(hand: Card[], count: number): string[] {
  const sorted = sortHand(hand);
  return sorted.slice(0, Math.max(0, Math.min(count, sorted.length))).map(c => c.id);
}

function pickDiscardCards(hand: Card[], count: number): string[] {
  // AI prefers to discard weak cards (lowest ranks)
  const sorted = sortHand(hand);
  return sorted.slice(0, Math.max(0, Math.min(count, sorted.length))).map(c => c.id);
}

export function decideDaifugoAction(state: DaifugoNetworkState, playerId: string): DaifugoAIDecision {
  const hand = state.hands[playerId] ?? [];
  if (state.finished) return { type: 'pass' };
  if (state.currentTurnPlayerId !== playerId) return { type: 'pass' };

  // If table is empty, passing is not allowed.
  const candidates = [
    ...generateGroupCandidates(hand),
    ...generateStraightCandidates(hand),
  ];

  const ordered = sortCandidatesForLead(
    { ...state, currentTurnPlayerId: playerId },
    candidates
  );

  for (const cardIds of ordered) {
    const cards = (state.hands[playerId] ?? []).filter(c => cardIds.includes(c.id));
    const shape = getPlayShape(cards);
    if (!shape) continue;

    const remainingHand = hand.filter(c => !cardIds.includes(c.id));

    const giveCardIds = (shape.kind === 'group' && shape.rankKey === 7)
      ? pickGiveCards(remainingHand, Math.min(shape.count, remainingHand.length))
      : undefined;

    // For 10-discard, calculate remaining after give
    const afterGiveHand = giveCardIds
      ? remainingHand.filter(c => !giveCardIds.includes(c.id))
      : remainingHand;

    const discardCardIds = (shape.kind === 'group' && shape.containsTen)
      ? pickDiscardCards(afterGiveHand, Math.min(shape.count, afterGiveHand.length))
      : undefined;

    const action = {
      actionId: 'ai_probe',
      type: 'play' as const,
      playerId,
      cardIds,
      giveCardIds,
      discardCardIds,
      timestamp: Date.now(),
    };

    const result = applyAction(state, action);
    if (result.ok) {
      return { type: 'play', cardIds, giveCardIds, discardCardIds };
    }
  }

  return state.pile ? { type: 'pass' } : { type: 'play', cardIds: ordered[0] ?? [] };
}
