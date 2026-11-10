/**
 * Move suggestion for the single-player hint button.
 */

import { OthelloAI } from './AI';
import type { Board } from './Board';
import type { Point } from './types';

// The hint search runs on the main thread, so it gets a short fixed budget
// rather than the opponent's (up to 2.5s) one.
export const HINT_TIME_LIMIT_MS = 400;

/**
 * Suggest a move for the side to play, or null if it has none.
 *
 * The engine's clock only covers iterative deepening past its fixed-depth
 * floor; the floor itself and the exact endgame solver run to completion. The
 * 'easy' parameters keep both of those tiny (depth 2, solver from 8 empties),
 * so nearly all of the work is the time-limited deepening and the budget
 * holds in every phase of the game.
 */
export function findHint(board: Board, timeLimitMs: number = HINT_TIME_LIMIT_MS): Point | null {
  // Search a copy: the engine re-indexes the board it is handed.
  return new OthelloAI('easy', { timeLimitMs }).getBestMove(board.clone());
}
