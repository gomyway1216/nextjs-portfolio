import { describe, expect, it } from 'vitest';

import {
  createRng,
  findWinningMoves,
  generatePuzzle,
  getDateKey,
  getPuzzleForDate,
  getWinningLine,
  hasAnyWinner,
  hashSeed,
  isValidPuzzle,
  type Mark,
} from '@/components/game/DailyMovePuzzle/engine';

describe('getWinningLine', () => {
  it('detects a completed row', () => {
    const board: Mark[] = ['X', 'X', 'X', null, 'O', null, 'O', null, null];
    expect(getWinningLine(board, 'X')).toEqual([0, 1, 2]);
    expect(getWinningLine(board, 'O')).toBeNull();
  });

  it('detects a diagonal', () => {
    const board: Mark[] = ['O', null, 'X', null, 'O', null, 'X', null, 'O'];
    expect(getWinningLine(board, 'O')).toEqual([0, 4, 8]);
  });

  it('returns null on an empty board', () => {
    expect(getWinningLine(new Array(9).fill(null), 'X')).toBeNull();
  });
});

describe('findWinningMoves', () => {
  it('finds the single square that completes a line', () => {
    const board: Mark[] = ['X', 'X', null, 'O', 'O', null, null, null, null];
    expect(findWinningMoves(board, 'X')).toEqual([2]);
  });

  it('finds multiple winning moves when they exist', () => {
    // X can win at index 2 (top row) or index 6 (left column).
    const board: Mark[] = ['X', 'X', null, 'X', 'O', 'O', null, null, null];
    expect(findWinningMoves(board, 'X').sort()).toEqual([2, 6]);
  });
});

describe('generatePuzzle - solvability & uniqueness', () => {
  it('produces a valid, uniquely-solvable puzzle for many seeds', () => {
    for (let seed = 0; seed < 2000; seed += 1) {
      const puzzle = generatePuzzle(seed);

      // Structurally valid per the solver.
      expect(isValidPuzzle(puzzle), `seed ${seed} invalid`).toBe(true);

      // No winner before the move.
      expect(hasAnyWinner(puzzle.board), `seed ${seed} already won`).toBe(false);

      // Exactly one winning move, and it matches correctMove.
      const winning = findWinningMoves(puzzle.board, puzzle.side);
      expect(winning, `seed ${seed} winning moves`).toEqual([puzzle.correctMove]);

      // The correct move actually completes the declared winning line.
      const after = puzzle.board.slice();
      after[puzzle.correctMove] = puzzle.side;
      expect(getWinningLine(after, puzzle.side)).toEqual(
        expect.arrayContaining([puzzle.correctMove]),
      );

      // The opponent does not already have a winning move (clean tactic).
      const opponent = puzzle.side === 'X' ? 'O' : 'X';
      expect(findWinningMoves(puzzle.board, opponent).length).toBe(0);
    }
  });

  it('always fills the correctMove cell as empty in the puzzle board', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const puzzle = generatePuzzle(seed);
      expect(puzzle.board[puzzle.correctMove]).toBeNull();
    }
  });
});

describe('isValidPuzzle - rejects malformed puzzles', () => {
  it('rejects a board that already has a winner', () => {
    expect(
      isValidPuzzle({
        board: ['X', 'X', 'X', 'O', 'O', null, null, null, null],
        side: 'O',
        correctMove: 5,
        winningLine: [3, 4, 5],
      }),
    ).toBe(false);
  });

  it('rejects when there is more than one winning move', () => {
    expect(
      isValidPuzzle({
        board: ['X', 'X', null, 'X', 'O', 'O', null, null, null],
        side: 'X',
        correctMove: 2,
        winningLine: [0, 1, 2],
      }),
    ).toBe(false);
  });

  it('rejects when correctMove is not actually a winning move', () => {
    expect(
      isValidPuzzle({
        board: ['X', 'X', null, 'O', 'O', null, null, null, null],
        side: 'X',
        correctMove: 8,
        winningLine: [0, 1, 2],
      }),
    ).toBe(false);
  });

  it('rejects an occupied correctMove cell', () => {
    expect(
      isValidPuzzle({
        board: ['X', 'X', 'O', 'O', 'O', null, null, null, null],
        side: 'X',
        correctMove: 2,
        winningLine: [0, 1, 2],
      }),
    ).toBe(false);
  });

  it('rejects impossible mark counts for O to move (needs X = O + 1)', () => {
    // O wins uniquely at 5, but X and O counts are equal, which is illegal for
    // an O-to-move position (X moves first).
    expect(
      isValidPuzzle({
        board: ['X', null, null, 'O', 'O', null, null, null, 'X'],
        side: 'O',
        correctMove: 5,
        winningLine: [3, 4, 5],
      }),
    ).toBe(false);
  });

  it('rejects impossible mark counts for X to move (needs X == O)', () => {
    // X to move but O already has more marks than X.
    expect(
      isValidPuzzle({
        board: ['O', 'O', null, 'X', null, null, null, null, null],
        side: 'X',
        correctMove: 2,
        winningLine: [0, 1, 2],
      }),
    ).toBe(false);
  });

  it('rejects when winningLine does not match the actual completed line', () => {
    // correctMove 2 genuinely wins on line [0,1,2], but a wrong line is declared.
    expect(
      isValidPuzzle({
        board: ['X', 'X', null, 'O', null, null, null, 'O', null],
        side: 'X',
        correctMove: 2,
        winningLine: [0, 4, 8],
      }),
    ).toBe(false);
  });

  it('accepts a correct winningLine that matches the actual win', () => {
    expect(
      isValidPuzzle({
        board: ['X', 'X', null, 'O', null, null, null, 'O', null],
        side: 'X',
        correctMove: 2,
        winningLine: [0, 1, 2],
      }),
    ).toBe(true);
  });
});

describe('daily determinism', () => {
  it('produces the same puzzle for the same date key', () => {
    const a = getPuzzleForDate('2026-07-08');
    const b = getPuzzleForDate('2026-07-08');
    expect(a).toEqual(b);
  });

  it('getPuzzleForDate matches generatePuzzle(hashSeed(key))', () => {
    const key = '2026-01-01';
    expect(getPuzzleForDate(key)).toEqual(generatePuzzle(hashSeed(key)));
  });

  it('varies across consecutive days', () => {
    const keys = [
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
    ];
    const serialized = keys.map((k) => JSON.stringify(getPuzzleForDate(k)));
    const unique = new Set(serialized);
    // Not necessarily all distinct, but the puzzle should not be constant.
    expect(unique.size).toBeGreaterThan(1);
  });

  it('all generated daily puzzles across a year are valid & unique-solution', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= 28; day += 1) {
        const key = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const puzzle = getPuzzleForDate(key);
        expect(isValidPuzzle(puzzle), `key ${key} invalid`).toBe(true);
        expect(findWinningMoves(puzzle.board, puzzle.side)).toEqual([
          puzzle.correctMove,
        ]);
      }
    }
  });
});

describe('getDateKey', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(getDateKey(new Date(2026, 6, 8))).toBe('2026-07-08');
    expect(getDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(getDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    seqA.forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    });
  });

  it('produces different streams for different seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});
