/**
 * Move-record helpers for Gomoku: rebuilding a position from its moves, taking
 * a turn back, and suggesting a move for the human side.
 */

import type { Difficulty } from '../common/types';
import { getBestMove } from './GomokuAI';
import { AI, BOARD_SIZE, GomokuBoard, PLAYER, Player, Position } from './types';

export interface MoveRecord extends Position {
  player: Exclude<Player, null>;
}

/** Search tier used for hints: strong enough to be useful, short enough to stay responsive. */
export const HINT_DIFFICULTY: Difficulty = 'hard';

export const boardFromMoves = (moves: ReadonlyArray<MoveRecord>): GomokuBoard => {
  const board: GomokuBoard = Array.from({ length: BOARD_SIZE }, () =>
    Array<Player>(BOARD_SIZE).fill(null)
  );
  for (const { row, col, player } of moves) board[row][col] = player;
  return board;
};

/**
 * Drop moves from the end until the human's most recent stone is gone, so the
 * human is to move again: the AI's reply and the move before it, or just the
 * human's own last move when the AI has not answered (e.g. it ended the game).
 * Returns the same array when there is no human move to take back.
 */
export const undoLastTurn = (moves: ReadonlyArray<MoveRecord>): ReadonlyArray<MoveRecord> => {
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    if (moves[i].player === PLAYER) return moves.slice(0, i);
  }
  return moves;
};

export const canUndo = (moves: ReadonlyArray<MoveRecord>): boolean =>
  moves.some((m) => m.player === PLAYER);

const swapColors = (board: GomokuBoard): GomokuBoard =>
  board.map((row) =>
    row.map((cell) => (cell === PLAYER ? AI : cell === AI ? PLAYER : null))
  );

/**
 * Suggest a move for the human. The search engine only ever moves for the AI
 * colour, so it is run on a colour-swapped copy of the position.
 */
export const getHintMove = (
  board: GomokuBoard,
  difficulty: Difficulty = HINT_DIFFICULTY
): Position | null => getBestMove(swapColors(board), difficulty);
