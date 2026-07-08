import { describe, it, expect } from 'vitest';
import {
  Card,
  countScores,
  createBoard,
  createRng,
  decideWinner,
  isBoardCleared,
  isMatch,
  remainingIndices,
  shuffle,
} from '@/components/game/MemoryBattle/engine';

const mk = (id: number, value: number, matched = false, matchedBy: Card['matchedBy'] = null): Card => ({
  id,
  value,
  matched,
  matchedBy,
});

describe('createBoard', () => {
  it('creates exactly two of each value for the requested pair count', () => {
    const board = createBoard(8, createRng(1));
    expect(board).toHaveLength(16);
    const counts = new Map<number, number>();
    for (const c of board) counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
    expect(counts.size).toBe(8);
    for (const n of counts.values()) expect(n).toBe(2);
  });

  it('assigns unique sequential ids and starts unmatched', () => {
    const board = createBoard(6, createRng(42));
    board.forEach((c, i) => {
      expect(c.id).toBe(i);
      expect(c.matched).toBe(false);
      expect(c.matchedBy).toBeNull();
    });
  });

  it('is deterministic for a given seed and varies across seeds', () => {
    const a = createBoard(6, createRng(7)).map((c) => c.value);
    const b = createBoard(6, createRng(7)).map((c) => c.value);
    const c = createBoard(6, createRng(8)).map((x) => x.value);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('shuffle', () => {
  it('is a permutation (same multiset) and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, createRng(3));
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('isMatch', () => {
  it('is true for two distinct unmatched cards of equal value', () => {
    expect(isMatch(mk(0, 5), mk(1, 5))).toBe(true);
  });
  it('is false for different values', () => {
    expect(isMatch(mk(0, 5), mk(1, 6))).toBe(false);
  });
  it('is false when the same card is passed twice (same id)', () => {
    expect(isMatch(mk(0, 5), mk(0, 5))).toBe(false);
  });
  it('is false if either card is already matched', () => {
    expect(isMatch(mk(0, 5, true), mk(1, 5))).toBe(false);
    expect(isMatch(mk(0, 5), mk(1, 5, true))).toBe(false);
  });
  it('is false for undefined inputs', () => {
    expect(isMatch(undefined, mk(1, 5))).toBe(false);
    expect(isMatch(mk(0, 5), undefined)).toBe(false);
  });
});

describe('remainingIndices / isBoardCleared', () => {
  it('lists only unmatched indices', () => {
    const board = [mk(0, 1, true, 'player'), mk(1, 1, true, 'player'), mk(2, 2), mk(3, 2)];
    expect(remainingIndices(board)).toEqual([2, 3]);
    expect(isBoardCleared(board)).toBe(false);
  });
  it('reports cleared when every card is matched', () => {
    const board = [mk(0, 1, true, 'ai'), mk(1, 1, true, 'ai')];
    expect(remainingIndices(board)).toEqual([]);
    expect(isBoardCleared(board)).toBe(true);
  });
});

describe('countScores', () => {
  it('counts whole pairs per owner', () => {
    const board = [
      mk(0, 1, true, 'player'),
      mk(1, 1, true, 'player'),
      mk(2, 2, true, 'ai'),
      mk(3, 2, true, 'ai'),
      mk(4, 3, true, 'player'),
      mk(5, 3, true, 'player'),
      mk(6, 4),
      mk(7, 4),
    ];
    expect(countScores(board)).toEqual({ player: 2, ai: 1 });
  });
});

describe('decideWinner', () => {
  it('picks the higher score', () => {
    expect(decideWinner({ player: 5, ai: 3 })).toBe('player');
    expect(decideWinner({ player: 2, ai: 6 })).toBe('ai');
  });
  it('returns draw on a tie', () => {
    expect(decideWinner({ player: 4, ai: 4 })).toBe('draw');
  });
});
