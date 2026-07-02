import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  createInitialDoubtState,
  dealHands,
  getNextPlayerId,
  nextRank,
  sortHand,
} from '@/components/game/Doubt/gameLogic';
import type { DoubtNetworkState } from '@/components/game/Doubt/multiplayerTypes';
import type { Card } from '@/components/game/Doubt/types';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

function stateForHands(
  hands: Record<string, Card[]>,
  overrides: Partial<DoubtNetworkState> = {},
): DoubtNetworkState {
  return {
    version: 1,
    phase: 'play',
    playerOrder: ['p1', 'p2'],
    hands,
    pile: [],
    pendingClaim: null,
    currentTurnPlayerId: 'p1',
    requiredRank: 1,
    finishedOrder: [],
    finished: false,
    winnerId: null,
    ranks: null,
    startedAt: 1,
    log: [],
    lastUpdate: 1,
    ...overrides,
  };
}

describe('Doubt gameLogic', () => {
  it('creates a 52-card deck and deals cards round-robin', () => {
    const deck = createDeck({ deckId: 'd' });
    const hands = dealHands(deck, ['p1', 'p2', 'p3', 'p4']);

    expect(deck).toHaveLength(52);
    expect(Object.values(hands).map((hand) => hand.length)).toEqual([13, 13, 13, 13]);
  });

  it('sorts by rank and suit order', () => {
    expect(sortHand([card('c', 'C', 2), card('s', 'S', 1), card('h', 'H', 1)]))
      .toEqual([card('s', 'S', 1), card('h', 'H', 1), card('c', 'C', 2)]);
  });

  it('cycles players and ranks', () => {
    expect(getNextPlayerId(['a', 'b', 'c'], 'b')).toBe('c');
    expect(getNextPlayerId(['a', 'b', 'c'], 'c')).toBe('a');
    expect(getNextPlayerId(['a'], 'missing')).toBe('a');
    expect(nextRank(13)).toBe(1);
    expect(nextRank(7)).toBe(8);
  });

  it('creates an initial shuffled state with all cards dealt', () => {
    const state = createInitialDoubtState(['p1', 'p2']);

    expect(state.phase).toBe('play');
    expect(state.requiredRank).toBe(1);
    expect(state.pile).toEqual([]);
    expect(state.pendingClaim).toBeNull();
    expect(Object.values(state.hands).reduce((total, hand) => total + hand.length, 0)).toBe(52);
    expect(['p1', 'p2']).toContain(state.currentTurnPlayerId);
  });

  it('plays a claim and advances to the next challenger', () => {
    const state = stateForHands({
      p1: [card('a', 'S', 1), card('b', 'H', 2)],
      p2: [card('c', 'D', 3)],
    });

    const result = applyAction(state, {
      actionId: 'play-1',
      type: 'play',
      playerId: 'p1',
      cardIds: ['a'],
      timestamp: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.phase).toBe('challenge');
      expect(result.state.currentTurnPlayerId).toBe('p2');
      expect(result.state.pendingClaim).toMatchObject({
        playerId: 'p1',
        declaredRank: 1,
        cardIds: ['a'],
        cardCount: 1,
        wentOut: false,
      });
      expect(result.state.hands.p1.map((c) => c.id)).toEqual(['b']);
      expect(result.state.pile.map((c) => c.id)).toEqual(['a']);
    }
  });

  it('accepts a went-out claim and finishes the game when one player remains', () => {
    const play = applyAction(stateForHands({
      p1: [card('a', 'S', 1)],
      p2: [card('b', 'H', 2)],
    }), {
      actionId: 'play-1',
      type: 'play',
      playerId: 'p1',
      cardIds: ['a'],
      timestamp: 10,
    });

    expect(play.ok).toBe(true);
    if (!play.ok) return;

    const accepted = applyAction(play.state, {
      actionId: 'accept-1',
      type: 'accept',
      playerId: 'p2',
      timestamp: 11,
    });

    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.state.finished).toBe(true);
      expect(accepted.state.phase).toBe('finished');
      expect(accepted.state.finishedOrder).toEqual(['p1', 'p2']);
      expect(accepted.state.winnerId).toBe('p1');
      expect(accepted.state.ranks).toEqual({ p1: 1, p2: 2 });
    }
  });

  it('resolves truthful doubt by giving the pile to the doubter', () => {
    const play = applyAction(stateForHands({
      p1: [card('a', 'S', 1), card('b', 'H', 2)],
      p2: [card('c', 'D', 3)],
    }), {
      actionId: 'play-1',
      type: 'play',
      playerId: 'p1',
      cardIds: ['a'],
      timestamp: 10,
    });

    expect(play.ok).toBe(true);
    if (!play.ok) return;

    const doubted = applyAction(play.state, {
      actionId: 'doubt-1',
      type: 'doubt',
      playerId: 'p2',
      timestamp: 11,
    });

    expect(doubted.ok).toBe(true);
    if (doubted.ok) {
      expect(doubted.state.currentTurnPlayerId).toBe('p2');
      expect(doubted.state.pile).toEqual([]);
      expect(doubted.state.hands.p2.map((c) => c.id)).toEqual(['a', 'c']);
      expect(doubted.state.log.at(-1)).toMatchObject({ claimTruth: true, pileTakerId: 'p2' });
    }
  });

  it('resolves false doubt by returning the pile to the claimant', () => {
    const play = applyAction(stateForHands({
      p1: [card('a', 'S', 2), card('b', 'H', 3)],
      p2: [card('c', 'D', 4)],
    }), {
      actionId: 'play-1',
      type: 'play',
      playerId: 'p1',
      cardIds: ['a'],
      timestamp: 10,
    });

    expect(play.ok).toBe(true);
    if (!play.ok) return;

    const doubted = applyAction(play.state, {
      actionId: 'doubt-1',
      type: 'doubt',
      playerId: 'p2',
      timestamp: 11,
    });

    expect(doubted.ok).toBe(true);
    if (doubted.ok) {
      expect(doubted.state.currentTurnPlayerId).toBe('p1');
      expect(doubted.state.pile).toEqual([]);
      expect(doubted.state.hands.p1.map((c) => c.id)).toEqual(['a', 'b']);
      expect(doubted.state.log.at(-1)).toMatchObject({ claimTruth: false, pileTakerId: 'p1' });
    }
  });

  it('rejects invalid actions for the current phase and hand', () => {
    const state = stateForHands({
      p1: [card('a', 'S', 1)],
      p2: [card('b', 'H', 2)],
    });

    expect(applyAction(state, { actionId: 'x', type: 'play', playerId: 'p2', cardIds: ['b'], timestamp: 1 }))
      .toEqual({ ok: false, error: 'Not your turn' });
    expect(applyAction(state, { actionId: 'x', type: 'accept', playerId: 'p1', timestamp: 1 }))
      .toEqual({ ok: false, error: 'Expected play action' });
    expect(applyAction(state, { actionId: 'x', type: 'play', playerId: 'p1', cardIds: [], timestamp: 1 }))
      .toEqual({ ok: false, error: 'Select 1–4 cards' });
    expect(applyAction(state, { actionId: 'x', type: 'play', playerId: 'p1', cardIds: ['a', 'a'], timestamp: 1 }))
      .toEqual({ ok: false, error: 'Duplicate cards' });
    expect(applyAction(state, { actionId: 'x', type: 'play', playerId: 'p1', cardIds: ['missing'], timestamp: 1 }))
      .toEqual({ ok: false, error: 'Card not in hand' });
  });
});
