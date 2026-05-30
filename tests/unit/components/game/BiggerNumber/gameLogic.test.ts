import { describe, it, expect } from 'vitest';
import {
  resolveRound,
  evaluateMatch,
  removeCard,
  freshHand,
  isDragon,
} from '@/components/game/BiggerNumber/gameLogic';
import type { BiggerNumberRules } from '@/components/game/BiggerNumber/types';
import { DEFAULT_RULES } from '@/components/game/BiggerNumber/types';

const baseRules: BiggerNumberRules = { ...DEFAULT_RULES };

describe('resolveRound — number vs number', () => {
  it('returns p1 when p1 plays the higher number', () => {
    expect(resolveRound(baseRules, 9, 1).outcome).toBe('p1');
    expect(resolveRound(baseRules, 5, 4).outcome).toBe('p1');
  });

  it('returns p2 when p2 plays the higher number', () => {
    expect(resolveRound(baseRules, 1, 9).outcome).toBe('p2');
  });

  it('returns tie on equal numbers', () => {
    expect(resolveRound(baseRules, 5, 5).outcome).toBe('tie');
  });

  it('does not flag dragon when none was played', () => {
    expect(resolveRound(baseRules, 5, 6).involvedDragon).toBe(false);
  });
});

describe('resolveRound — dragon with loses-to-1 rule', () => {
  const rules: BiggerNumberRules = { ...baseRules, dragonRule: 'loses-to-1' };

  it('dragon beats every number except 1', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(resolveRound(rules, 'dragon', n).outcome).toBe('p1');
      expect(resolveRound(rules, n, 'dragon').outcome).toBe('p2');
    }
  });

  it('dragon loses to 1', () => {
    expect(resolveRound(rules, 'dragon', 1).outcome).toBe('p2');
    expect(resolveRound(rules, 1, 'dragon').outcome).toBe('p1');
  });

  it('flags involvedDragon', () => {
    expect(resolveRound(rules, 'dragon', 5).involvedDragon).toBe(true);
  });
});

describe('resolveRound — dragon with beats-all rule', () => {
  const rules: BiggerNumberRules = { ...baseRules, dragonRule: 'beats-all' };

  it('dragon beats every number including 1', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(resolveRound(rules, 'dragon', n).outcome).toBe('p1');
      expect(resolveRound(rules, n, 'dragon').outcome).toBe('p2');
    }
  });
});

describe('resolveRound — both dragons', () => {
  it('always ties regardless of dragon rule', () => {
    for (const dragonRule of ['loses-to-1', 'beats-all'] as const) {
      const rules: BiggerNumberRules = { ...baseRules, dragonRule };
      const result = resolveRound(rules, 'dragon', 'dragon');
      expect(result.outcome).toBe('tie');
      expect(result.involvedDragon).toBe(true);
    }
  });
});

describe('resolveRound — tie rule cardsReturnedToHand flag', () => {
  it('marks cards as returned when tie + replay rule', () => {
    const rules: BiggerNumberRules = { ...baseRules, tieRule: 'replay' };
    expect(resolveRound(rules, 5, 5).cardsReturnedToHand).toBe(true);
  });

  it('does not return cards on tie + discard rule', () => {
    const rules: BiggerNumberRules = { ...baseRules, tieRule: 'discard' };
    expect(resolveRound(rules, 5, 5).cardsReturnedToHand).toBe(false);
  });

  it('does not return cards when not a tie', () => {
    const rules: BiggerNumberRules = { ...baseRules, tieRule: 'replay' };
    expect(resolveRound(rules, 9, 1).cardsReturnedToHand).toBe(false);
  });
});

describe('evaluateMatch', () => {
  const ids = { p1: 'A', p2: 'B' };

  it('returns p1 winner once they hit winsToWin', () => {
    expect(evaluateMatch(baseRules, { p1Wins: 5, p2Wins: 2 }, 7, ids)).toBe('A');
  });

  it('returns p2 winner once they hit winsToWin', () => {
    expect(evaluateMatch(baseRules, { p1Wins: 2, p2Wins: 5 }, 7, ids)).toBe('B');
  });

  it('returns undefined when neither side has won and rounds remain', () => {
    expect(evaluateMatch(baseRules, { p1Wins: 2, p2Wins: 3 }, 5, ids)).toBeUndefined();
  });

  it('decides on score after totalRounds is exhausted', () => {
    expect(evaluateMatch(baseRules, { p1Wins: 4, p2Wins: 3 }, 10, ids)).toBe('A');
    expect(evaluateMatch(baseRules, { p1Wins: 3, p2Wins: 4 }, 10, ids)).toBe('B');
  });

  it('returns null for a draw on exhausted rounds with equal scores', () => {
    expect(evaluateMatch(baseRules, { p1Wins: 4, p2Wins: 4 }, 10, ids)).toBeNull();
  });
});

describe('removeCard', () => {
  it('removes a card from hand', () => {
    expect(removeCard([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('removes the dragon', () => {
    expect(removeCard([1, 'dragon', 9], 'dragon')).toEqual([1, 9]);
  });

  it('returns same hand when card not present', () => {
    expect(removeCard([1, 2, 3], 9)).toEqual([1, 2, 3]);
  });
});

describe('freshHand and isDragon', () => {
  it('fresh hand has 10 cards (1-9 + dragon)', () => {
    const hand = freshHand();
    expect(hand).toHaveLength(10);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(hand).toContain(n);
    }
    expect(hand).toContain('dragon');
  });

  it('isDragon discriminates correctly', () => {
    expect(isDragon('dragon')).toBe(true);
    expect(isDragon(5)).toBe(false);
  });
});
