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

export type ResultKey = 'wins' | 'losses' | 'draws';

/**
 * The session record plus which of its counters, if any, holds the result of
 * the game currently on the board. Keeping the two together lets a take-back
 * out of a finished game withdraw that result in one pure update, so a
 * repeated or stale take-back cannot withdraw it a second time.
 */
export interface SessionTally {
  wins: number;
  losses: number;
  draws: number;
  counted: ResultKey | null;
}

export const emptyTally = (): SessionTally => ({ wins: 0, losses: 0, draws: 0, counted: null });

export function resultKey(winner: Color | null, playerColor: Color): ResultKey {
  if (winner === null) return 'draws';
  return winner === playerColor ? 'wins' : 'losses';
}

/** Add the result of the game on the board to the record. */
export function countResult(tally: SessionTally, key: ResultKey): SessionTally {
  return { ...tally, [key]: tally[key] + 1, counted: key };
}

/** Remove the result of the game on the board from the record, if it was counted. */
export function withdrawCounted(tally: SessionTally): SessionTally {
  const { counted } = tally;
  if (counted === null) return tally;
  return { ...tally, [counted]: Math.max(0, tally[counted] - 1), counted: null };
}

/** A new game is on the board: its result is not in the record yet. */
export function clearCounted(tally: SessionTally): SessionTally {
  return tally.counted === null ? tally : { ...tally, counted: null };
}
