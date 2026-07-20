import { describe, expect, it } from 'vitest';
import { getBestMove } from '@/components/game/Gomoku/GomokuAI';
import {
  AI,
  BOARD_SIZE,
  GomokuBoard,
  PLAYER,
} from '@/components/game/Gomoku/types';

const emptyBoard = (): GomokuBoard =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

describe('Gomoku AI', () => {
  it('opens in the center on an empty board', () => {
    const mid = Math.floor(BOARD_SIZE / 2);
    expect(getBestMove(emptyBoard(), 'master')).toEqual({ row: mid, col: mid });
  });

  it('takes an immediate win', () => {
    const b = emptyBoard();
    // AI has four in a row horizontally: (7,3)..(7,6), blocked at (7,2), so
    // (7,7) is the only winning square.
    for (let c = 3; c <= 6; c += 1) b[7][c] = AI;
    b[7][2] = PLAYER;
    b[8][3] = PLAYER;
    b[8][4] = PLAYER;
    expect(getBestMove(b, 'hard')).toEqual({ row: 7, col: 7 });
  });

  it('blocks the human when they threaten an immediate win', () => {
    const b = emptyBoard();
    // Human has four in a row: (7,3)..(7,6), open at (7,7) only.
    for (let c = 3; c <= 6; c += 1) b[7][c] = PLAYER;
    b[7][2] = AI; // one end already blocked
    b[8][4] = AI;
    expect(getBestMove(b, 'expert')).toEqual({ row: 7, col: 7 });
  });

  it('answers within its time budget even at the deepest tiers (no UI freeze)', () => {
    // Regression: expert/master used to run fixed depth-8/10 alpha-beta on the
    // main thread (~1.8s / ~20s per move). With iterative deepening + a
    // deadline every tier must answer promptly.
    const b = emptyBoard();
    // Non-trivial midgame position with plenty of candidates.
    const stones: Array<[number, number, typeof AI]> = [
      [7, 7, PLAYER], [7, 8, AI], [8, 7, AI], [6, 7, PLAYER],
      [8, 8, PLAYER], [6, 6, AI], [9, 9, PLAYER], [5, 5, AI],
    ];
    for (const [r, c, p] of stones) b[r][c] = p;

    for (const difficulty of ['expert', 'master'] as const) {
      const t0 = Date.now();
      const move = getBestMove(b, difficulty);
      const elapsed = Date.now() - t0;
      expect(move).not.toBeNull();
      expect(b[move!.row][move!.col]).toBeNull(); // legal (empty) square
      // Generous CI margin over the ~1s configured budget.
      expect(elapsed).toBeLessThan(3000);
    }
  });
});
