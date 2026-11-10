/**
 * Hint tests: the suggestion must be a legal move in every phase of the game
 * (opening, the clocked mid-game, and the endgame solver), must leave the
 * board it was asked about untouched, and must not run long in the phases the
 * engine's clock does not cover.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { Board } from '@/components/game/Othello/Board';
import { findHint } from '@/components/game/Othello/hint';
import { initMobilityTables } from '@/components/game/Othello/MobilityTable';

beforeAll(() => {
  initMobilityTables();
});

function fingerprint(b: Board): string {
  let cells = '';
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 8; x++) cells += b.getColor(x, y) + 1;
  }
  return `${cells}|${b.getCurrentColor()}|${b.getTurns()}|${b.getHash()}`;
}

describe('findHint', () => {
  it('suggests a legal move at every position without touching the board', () => {
    let seed = 12345;
    let hints = 0;
    let slowest = 0;
    for (let game = 0; game < 6; game++) {
      const board = new Board();
      while (!board.isGameOver()) {
        const moves = board.getMovablePos();
        if (moves.length === 0) {
          expect(findHint(board, 0)).toBeNull();
          board.pass();
          continue;
        }
        const before = fingerprint(board);
        // A zero budget leaves only the work the engine's clock cannot
        // interrupt, which is what has to stay small.
        const t0 = performance.now();
        const hint = findHint(board, 0);
        slowest = Math.max(slowest, performance.now() - t0);
        hints++;
        expect(hint).not.toBeNull();
        expect(moves.some((m) => m.x === hint!.x && m.y === hint!.y)).toBe(true);
        expect(fingerprint(board)).toBe(before);

        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        // Alternate between following the hint and a random move so both
        // sensible and odd positions are covered.
        board.move(game % 2 === 0 ? hint! : moves[seed % moves.length]);
      }
      expect(findHint(board, 0)).toBeNull();
    }
    expect(hints).toBeGreaterThan(300);
    // Measured at ~5 ms; the bound is loose so a loaded CI machine cannot
    // trip it, while an uninterruptible search (hundreds of ms) still would.
    expect(slowest).toBeLessThan(150);
  });
});
