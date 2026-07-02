import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  createInitialShichinarabeState,
  dealHands,
  getNextPlayerId,
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
    const deck = createDeck({ deckId: 'd' });

    expect(deck).toHaveLength(52);
    expect(Object.values(dealHands(deck, ['p1', 'p2'])).map((hand) => hand.length)).toEqual([26, 26]);
    expect(sortHand([card('c', 'C', 8), card('s', 'S', 6), card('h', 'H', 6)]))
      .toEqual([card('s', 'S', 6), card('h', 'H', 6), card('c', 'C', 8)]);
    expect(getNextPlayerId(['p1', 'p2'], 'p2')).toBe('p1');
    expect(getNextPlayerId(['p1'], 'missing')).toBe('p1');
  });

  it('creates an initial state with sevens placed on the table', () => {
    const state = createInitialShichinarabeState(['p1', 'p2'], { maxPasses: 2.9 });

    expect(state.maxPasses).toBe(2);
    expect(state.currentTurnPlayerId).toBe('p1');
    expect(state.table).toEqual({
      S: { low: 7, high: 7 },
      H: { low: 7, high: 7 },
      D: { low: 7, high: 7 },
      C: { low: 7, high: 7 },
    });
    expect(Object.values(state.hands).flat().some((c) => c.rank === 7)).toBe(false);
  });

  it('finds playable ranks and cards around suit bounds', () => {
    const state = stateForHand([card('s6', 'S', 6), card('s5', 'S', 5), card('h8', 'H', 8)]);

    expect(getPlayableRanksForSuit({ low: 7, high: 7 })).toEqual([6, 8]);
    expect(isCardPlayable(state, card('s6', 'S', 6))).toBe(true);
    expect(isCardPlayable(state, card('s5', 'S', 5))).toBe(false);
    expect(getPlayableCardsForPlayer(state, 'p1').map((c) => c.id)).toEqual(['s6', 'h8']);
    expect(getPlayableCardsForPlayer({ ...state, finished: true }, 'p1')).toEqual([]);
    expect(getPlayableCardsForPlayer({ ...state, finishedOrder: ['p1'] }, 'p1')).toEqual([]);
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

  it('finishes the game when a play leaves every player done', () => {
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      eliminatedOrder: ['p2'],
    };

    const result = applyAction(state, {
      actionId: 'a1',
      type: 'play',
      playerId: 'p1',
      cardId: 's6',
      timestamp: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.finished).toBe(true);
      expect(result.state.winnerId).toBe('p1');
      expect(result.state.resultOrder).toEqual(['p1', 'p2']);
      expect(result.state.ranks).toEqual({ p1: 1, p2: 2 });
    }
  });

  it('passes, eliminates at the pass limit, and skips done players', () => {
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      maxPasses: 1,
      hands: { p1: [card('s6', 'S', 6)], p2: [card('h6', 'H', 6)] },
    };

    const result = applyAction(state, {
      actionId: 'p1',
      type: 'pass',
      playerId: 'p1',
      timestamp: 20,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.eliminatedOrder).toEqual(['p1']);
      expect(result.state.currentTurnPlayerId).toBe('p2');
      expect(result.state.passCounts.p1).toBe(1);
    }
  });

  it('finishes the game when a pass leaves every player done', () => {
    const state = {
      ...stateForHand([card('s6', 'S', 6)]),
      maxPasses: 1,
      eliminatedOrder: ['p2'],
    };

    const result = applyAction(state, {
      actionId: 'p1',
      type: 'pass',
      playerId: 'p1',
      timestamp: 20,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.finished).toBe(true);
      expect(result.state.winnerId).toBeNull();
      expect(result.state.resultOrder).toEqual(['p2', 'p1']);
      expect(result.state.ranks).toEqual({ p2: 1, p1: 2 });
    }
  });

  it('rejects invalid plays and inactive players', () => {
    const state = stateForHand([card('s5', 'S', 5)]);

    expect(applyAction({ ...state, finished: true }, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p1',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Game is finished' });
    expect(applyAction(state, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p2',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Not your turn' });
    expect(applyAction({ ...state, finishedOrder: ['p1'] }, {
      actionId: 'x',
      type: 'pass',
      playerId: 'p1',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Player is not active' });
    expect(applyAction(state, {
      actionId: 'x',
      type: 'play',
      playerId: 'p1',
      cardId: 'missing',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Card not in hand' });
    expect(applyAction(state, {
      actionId: 'x',
      type: 'play',
      playerId: 'p1',
      cardId: 's5',
      timestamp: 1,
    })).toEqual({ ok: false, error: 'Card not playable' });
  });
});
