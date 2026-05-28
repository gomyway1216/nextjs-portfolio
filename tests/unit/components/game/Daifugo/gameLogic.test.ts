import { describe, expect, it } from 'vitest';
import {
  createDeck,
  dealHands,
  getPlayShape,
  sortHand,
} from '@/components/game/Daifugo/gameLogic';
import { JOKER_RANK, TWO_RANK, type Card } from '@/components/game/Daifugo/types';

function card(id: string, suit: Card['suit'], rank: number): Card {
  return { id, suit, rank };
}

describe('Daifugo gameLogic', () => {
  it('creates a standard deck with optional joker', () => {
    expect(createDeck({ deckId: 'd' })).toHaveLength(53);
    expect(createDeck({ deckId: 'd', includeJoker: false })).toHaveLength(52);
  });

  it('sorts by rank before suit and deals all cards', () => {
    const sorted = sortHand([
      card('joker', 'J', JOKER_RANK),
      card('two', 'S', TWO_RANK),
      card('heart3', 'H', 3),
      card('spade3', 'S', 3),
    ]);

    expect(sorted.map((c) => c.id)).toEqual(['spade3', 'heart3', 'two', 'joker']);
    expect(Object.values(dealHands(createDeck({ deckId: 'd' }), ['p1', 'p2'])).flat()).toHaveLength(53);
  });

  it('detects group, straight, joker, and invalid play shapes', () => {
    expect(getPlayShape([card('s3', 'S', 3)])).toMatchObject({
      kind: 'group',
      count: 1,
      isSpade3Single: true,
    });

    expect(getPlayShape([card('joker', 'J', JOKER_RANK)])).toMatchObject({
      kind: 'group',
      rankKey: JOKER_RANK,
      isJokerSingle: true,
    });

    expect(getPlayShape([
      card('s4', 'S', 4),
      card('s5', 'S', 5),
      card('s6', 'S', 6),
    ])).toMatchObject({
      kind: 'straight',
      startRank: 4,
      endRank: 6,
      signature: 'SSS',
    });

    expect(getPlayShape([card('s4', 'S', 4), card('h5', 'H', 5)])).toBeNull();
  });
});
