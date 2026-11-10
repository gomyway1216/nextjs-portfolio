/**
 * Take-back support for single-player Othello.
 *
 * The game record (every disc placed and every pass, by both sides) is the
 * source of truth: undoing means cutting the record back to the player's last
 * own move and replaying what is left onto a fresh board.
 */

import { Board } from './Board';
import type { MoveHistoryEntry } from './multiplayerTypes';
import type { Color, Point } from './types';

type RecordedMove = Pick<MoveHistoryEntry, 'color' | 'move'>;

/**
 * How many record entries survive a take-back, or null when the player has
 * not placed a disc yet. Cutting just before the player's last placement
 * always lands on a position where it is their turn with a legal move, and it
 * drops the AI's reply (and any passes) that followed.
 */
export function takebackLength(history: readonly RecordedMove[], playerColor: Color): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].color === playerColor && history[i].move !== null) return i;
  }
  return null;
}

/**
 * Rebuild the board by replaying a record from the opening position.
 * Returns null if the record is not a legal game (wrong side to move, an
 * illegal placement, or a pass while a move was available).
 */
export function replayHistory(history: readonly RecordedMove[]): Board | null {
  const board = new Board();
  for (const entry of history) {
    if (entry.color !== board.getCurrentColor()) return null;
    if (entry.move === null) {
      if (board.getMovablePos().length > 0) return null;
      board.pass();
    } else {
      const { x, y } = entry.move;
      if (!board.getMovablePos().some((m) => m.x === x && m.y === y)) return null;
      board.move(entry.move);
    }
  }
  return board;
}

/** The most recent disc placement in a record (passes skipped), if any. */
export function lastPlacement(history: readonly RecordedMove[]): Point | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const move = history[i].move;
    if (move !== null) return move;
  }
  return null;
}
