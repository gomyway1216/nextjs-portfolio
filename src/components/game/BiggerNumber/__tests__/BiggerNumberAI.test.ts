import { describe, it, expect } from 'vitest';
import { pickAICard } from '../BiggerNumberAI';
import { DEFAULT_RULES, type CardValue, type BiggerNumberRules } from '../types';

const rules: BiggerNumberRules = { ...DEFAULT_RULES };

describe('pickAICard — easy', () => {
  it('always returns a card from the hand', () => {
    const hand: CardValue[] = [1, 5, 9, 'dragon'];
    for (let i = 0; i < 50; i++) {
      const { card } = pickAICard('easy', rules, hand, [1, 2, 3]);
      expect(hand).toContain(card);
    }
  });

  it('throws when hand is empty', () => {
    expect(() => pickAICard('easy', rules, [], [1])).toThrow();
  });
});

describe('pickAICard — medium', () => {
  it('plays the median rank from a sorted-by-rank hand', () => {
    const { card } = pickAICard('medium', rules, [1, 2, 3, 4, 5], [1]);
    // sorted [1,2,3,4,5], median index 5/2 = 2 → value 3
    expect(card).toBe(3);
  });
});

describe('pickAICard — hard', () => {
  it('picks 9 when opponent only has low cards', () => {
    const { card } = pickAICard('hard', rules, [1, 2, 9], [1, 2, 3]);
    // 9 always wins → highest EV
    expect(card).toBe(9);
  });

  it('avoids playing dragon when opponent might still have a 1', () => {
    // With loses-to-1: dragon vs [1,2,3] EV = (-1+1+1)/3 = 1/3
    //                  9     vs [1,2,3] EV = (1+1+1)/3 = 1
    // → AI should pick 9, not dragon.
    const { card } = pickAICard('hard', rules, [9, 'dragon'], [1, 2, 3]);
    expect(card).toBe(9);
  });

  it('plays dragon willingly when opponent has no 1', () => {
    // With loses-to-1: dragon vs [2,3,4] EV = 1; 9 vs [2,3,4] EV = 1.
    // Tie-break prefers lower-ranked card (rank 5 for dragon vs 9 for 9) → dragon.
    const { card } = pickAICard('hard', rules, [9, 'dragon'], [2, 3, 4]);
    expect(card).toBe('dragon');
  });

  it('respects beats-all dragon rule when picking', () => {
    const beatsAllRules: BiggerNumberRules = { ...rules, dragonRule: 'beats-all' };
    // Dragon always wins → highest EV; rank 5 < 9 so dragon wins tie-break too.
    const { card } = pickAICard('hard', beatsAllRules, [9, 'dragon'], [1, 5, 9]);
    expect(card).toBe('dragon');
  });

  it('falls back gracefully when opponent hand is empty', () => {
    const { card } = pickAICard('hard', rules, [3, 4], []);
    expect([3, 4]).toContain(card);
  });
});
