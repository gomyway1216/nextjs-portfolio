import { describe, expect, it } from 'vitest';

import { MAX_KEYED_CARDS, cardIndexForKey, cardKeyLabel } from '@/components/game/MemoryBattle/cardKeys';

describe('card keys', () => {
  it('labels the first nine cards 1–9, the tenth 0, then A, B, C…', () => {
    expect([0, 1, 8].map(cardKeyLabel)).toEqual(['1', '2', '9']);
    expect(cardKeyLabel(9)).toBe('0');
    expect([10, 11, 15, 23].map(cardKeyLabel)).toEqual(['A', 'B', 'F', 'N']);
  });

  it('has no label outside the board', () => {
    expect(cardKeyLabel(-1)).toBeNull();
    expect(cardKeyLabel(1.5)).toBeNull();
    expect(cardKeyLabel(MAX_KEYED_CARDS)).toBeNull();
  });

  it('reads a pressed key back to the same card, letters in either case', () => {
    for (let index = 0; index < MAX_KEYED_CARDS; index++) {
      const label = cardKeyLabel(index)!;
      expect(cardIndexForKey(label)).toBe(index);
      expect(cardIndexForKey(label.toLowerCase())).toBe(index);
    }
  });

  it('ignores every other key', () => {
    for (const key of [' ', 'Enter', 'Tab', 'ArrowLeft', 'F1', 'Escape', '-', 'é', '']) {
      expect(cardIndexForKey(key)).toBeNull();
    }
  });

  it('gives every card of the largest board (6×4) its own key', () => {
    const cards = 24;
    expect(cards).toBeLessThanOrEqual(MAX_KEYED_CARDS);
    const labels = Array.from({ length: cards }, (_, index) => cardKeyLabel(index));
    expect(labels.every((label) => label !== null)).toBe(true);
    expect(new Set(labels).size).toBe(cards);
  });
});
