import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  getPlayableCardsForPlayer,
  getPlayableRanksForSuit,
  isCardPlayable,
  sortHand,
} from '@/components/game/Shichinarabe/gameLogic';
import type { ShichinarabeNetworkState } from '@/components/game/Shichinarabe/multiplayerTypes';
import type { Card } from '@/components/game/Shichinarabe/types';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

function stateForHand(hand: Card[]): ShichinarabeNetworkState {
  return {
    version: 1,
    playerOrder: ['p1', 'p2'],
    hands: { p1: hand, p2: [] },
    table: {
      S: { low: 7, high: 7 },
      H: { low: 7, high: 7 },
      D: { low: 7, high: 7 },
      C: { low: 7, high: 7 },
    },
    currentTurnPlayerId: 'p1',
    passCounts: { p1: 0, p2: 0 },
    maxPasses: 3,
    finishedOrder: [],
    eliminatedOrder: [],
    finished: false,
    winnerId: null,
    resultOrder: [],
    ranks: null,
    startedAt: 1,
    log: [],
    lastUpdate: 1,
  };
}

describe('Shichinarabe gameLogic', () => {
  it('creates and sorts a standard 52-card deck', () => {
    expect(createDeck({ deckId: 'd' })).toHaveLength(52);
    expect(sortHand([card('c', 'C', 8), card('s', 'S', 6), card('h', 'H', 6)]))
      .toEqual([card('s', 'S', 6), card('h', 'H', 6), card('c', 'C', 8)]);
  });

  it('finds playable ranks and cards around suit bounds', () => {
    const state = stateForHand([card('s6', 'S', 6), card('s5', 'S', 5), card('h8', 'H', 8)]);

    expect(getPlayableRanksForSuit({ low: 7, high: 7 })).toEqual([6, 8]);
    expect(isCardPlayable(state, card('s6', 'S', 6))).toBe(true);
    expect(isCardPlayable(state, card('s5', 'S', 5))).toBe(false);
    expect(getPlayableCardsForPlayer(state, 'p1').map((c) => c.id)).toEqual(['s6', 'h8']);
  });

  it('applies a legal play and advances the suit bounds', () => {
    const state = stateForHand([card('s6', 'S', 6)]);
    const result = applyAction(state, {
      actionId: 'a1',
      type: 'play',
      playerId: 'p1',
      cardId: 's6',
      timestamp: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.table.S).toEqual({ low: 6, high: 7 });
      expect(result.state.finishedOrder).toContain('p1');
    }
  });
});
