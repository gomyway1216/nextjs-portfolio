import { describe, it, expect } from 'vitest';
import { reviewGame, TurnRecord } from '@/components/game/MemoryBattle/review';

// index:         0  1  2  3  4  5
const values = [0, 1, 0, 2, 1, 2];
const turn = (mover: TurnRecord['mover'], first: number, second: number): TurnRecord => ({
  mover,
  first,
  second,
});

describe('reviewGame', () => {
  it('calls a pair lucky when the partner had never been shown', () => {
    const r = reviewGame(values, [turn('player', 0, 2)]);
    expect(r.turns[0]).toMatchObject({ kind: 'lucky', firstValue: 0, secondValue: 0 });
    expect(r.player).toMatchObject({ turns: 1, lucky: 1, recalled: 0, missed: 0, longestStreak: 1 });
  });

  it('calls a pair recalled when the partner was shown earlier, by either side', () => {
    const r = reviewGame(values, [turn('player', 0, 1), turn('ai', 2, 0)]);
    expect(r.turns.map((t) => t.kind)).toEqual(['noMatch', 'recalled']);
    expect(r.ai.recalled).toBe(1);
  });

  it('flags a miss when the first card had a shown partner that was not picked', () => {
    const r = reviewGame(values, [turn('player', 0, 1), turn('ai', 2, 3)]);
    expect(r.turns[1].kind).toBe('missed');
    expect(r.ai.missed).toBe(1);
  });

  it('flags a miss when a fully shown pair was left on the table', () => {
    // Turn 1 shows cards 0 and 3; turn 2 shows 2 (partner of 0) second, so
    // both 0s are known before turn 3. Its first card (3) has no shown partner.
    const r = reviewGame(values, [turn('player', 0, 3), turn('ai', 1, 2), turn('player', 3, 1)]);
    expect(r.turns.map((t) => t.kind)).toEqual(['noMatch', 'noMatch', 'missed']);
    expect(r.player.missed).toBe(1);
    expect(r.ai.missed).toBe(0);
  });

  it('does not flag a miss once the shown pair has been taken', () => {
    const r = reviewGame(values, [turn('player', 0, 1), turn('ai', 2, 0), turn('ai', 3, 4)]);
    expect(r.turns.map((t) => t.kind)).toEqual(['noMatch', 'recalled', 'noMatch']);
  });

  it('does not count a known second card as a miss when nothing could be paired', () => {
    const r = reviewGame(values, [turn('player', 0, 1), turn('ai', 3, 1)]);
    expect(r.turns[1].kind).toBe('noMatch');
  });

  it('tracks the longest run of pairs per side and resets it on a failed turn', () => {
    const r = reviewGame(values, [
      turn('player', 0, 2),
      turn('player', 1, 3),
      turn('ai', 5, 3),
      turn('ai', 4, 1),
    ]);
    expect(r.player).toMatchObject({ turns: 2, lucky: 1, missed: 0, longestStreak: 1 });
    expect(r.ai).toMatchObject({ turns: 2, recalled: 2, lucky: 0, longestStreak: 2 });
  });

  it('skips malformed turns', () => {
    const r = reviewGame(values, [
      turn('player', 0, 0),
      turn('player', -1, 2),
      turn('player', 0, 9),
      turn('player', 0, 2),
      turn('ai', 0, 1),
    ]);
    expect(r.turns).toHaveLength(1);
    expect(r.ai.turns).toBe(0);
  });

  it('returns empty reports for a game with no turns', () => {
    const r = reviewGame(values, []);
    expect(r.turns).toEqual([]);
    expect(r.player).toEqual({ turns: 0, recalled: 0, lucky: 0, missed: 0, longestStreak: 0 });
    expect(r.ai).toEqual(r.player);
  });
});
