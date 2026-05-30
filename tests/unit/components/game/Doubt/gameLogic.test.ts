import { describe, expect, it } from 'vitest';
import {
  createDeck,
  dealHands,
  getNextPlayerId,
  nextRank,
  sortHand,
} from '@/components/game/Doubt/gameLogic';
import type { Card } from '@/components/game/Doubt/types';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
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
});
