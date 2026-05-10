/**
 * Territory Number — pure game logic.
 *
 * No React, no Firebase, no globals. Used by both the AI mode and the online
 * mode (host runs scoring on every move).
 */

import type {
  Board,
  BoardCell,
  BoardEvaluation,
  LineResult,
  LineWinner,
  PlayerSlot,
} from './types';
import { ALL_NUMBERS, LINES } from './types';

export function emptyBoard(): Board {
  return Array.from({ length: 9 }, () => ({ value: null, owner: null }));
}

export function emptyCell(): BoardCell {
  return { value: null, owner: null };
}

export function freshDeck(): number[] {
  return [...ALL_NUMBERS];
}

export function isCellEmpty(cell: BoardCell): boolean {
  return cell.value === null;
}

/**
 * Place a card on the board, returning a NEW board (no mutation).
 * Throws if the cell is occupied or the card is invalid.
 */
export function placeCard(
  board: Board,
  cellIndex: number,
  card: number,
  owner: PlayerSlot
): Board {
  if (cellIndex < 0 || cellIndex >= 9) {
    throw new Error(`Invalid cell index ${cellIndex}`);
  }
  if (!Number.isInteger(card) || card < 1 || card > 9) {
    throw new Error(`Invalid card ${card}`);
  }
  if (!isCellEmpty(board[cellIndex])) {
    throw new Error(`Cell ${cellIndex} is already occupied`);
  }
  const next = board.slice();
  next[cellIndex] = { value: card, owner };
  return next;
}

/** True iff every cell is filled. */
export function isBoardFull(board: Board): boolean {
  return board.every(c => c.value !== null);
}

/** Number of cells still empty. */
export function emptyCellCount(board: Board): number {
  return board.reduce((acc, c) => acc + (c.value === null ? 1 : 0), 0);
}

/** All empty-cell indices, in board order. */
export function emptyCellIndices(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i].value === null) out.push(i);
  }
  return out;
}

/** Cards still available in the shared pool, given a board (any order). */
export function remainingCards(board: Board): number[] {
  const used = new Set<number>();
  for (const cell of board) {
    if (cell.value !== null) used.add(cell.value);
  }
  return ALL_NUMBERS.filter(n => !used.has(n));
}

/** Score a single line. */
export function scoreLine(
  board: Board,
  cells: readonly [number, number, number]
): LineResult {
  let p1Sum = 0;
  let p2Sum = 0;
  for (const idx of cells) {
    const cell = board[idx];
    if (cell.value === null || cell.owner === null) continue;
    if (cell.owner === 'p1') p1Sum += cell.value;
    else p2Sum += cell.value;
  }
  let winner: LineWinner = null;
  if (p1Sum > p2Sum) winner = 'p1';
  else if (p2Sum > p1Sum) winner = 'p2';
  return { cells, p1Sum, p2Sum, winner };
}

/** Score every line on the board and tally captures. */
export function evaluateBoard(board: Board): BoardEvaluation {
  const lines = LINES.map(line => scoreLine(board, line));
  let p1Captures = 0;
  let p2Captures = 0;
  for (const r of lines) {
    if (r.winner === 'p1') p1Captures++;
    else if (r.winner === 'p2') p2Captures++;
  }
  return { lines, p1Captures, p2Captures };
}

/**
 * Match outcome:
 * - returns slot 'p1' or 'p2' when board is full and one has more captures
 * - returns null when board is full but captures are tied
 * - returns undefined when match is still in progress
 */
export function evaluateMatch(board: Board): PlayerSlot | null | undefined {
  if (!isBoardFull(board)) return undefined;
  const { p1Captures, p2Captures } = evaluateBoard(board);
  if (p1Captures > p2Captures) return 'p1';
  if (p2Captures > p1Captures) return 'p2';
  return null;
}

/**
 * Given a slot ('p1'|'p2') and the playerOrder used by the room
 * ([firstId, secondId]), figure out which playerId goes next.
 */
export function nextTurnSlot(currentSlot: PlayerSlot): PlayerSlot {
  return currentSlot === 'p1' ? 'p2' : 'p1';
}

/** How many cards `slot` has already placed on the board. */
export function placementsBy(board: Board, slot: PlayerSlot): number {
  return board.reduce((acc, c) => acc + (c.owner === slot ? 1 : 0), 0);
}

/**
 * Given the current board, decide whose turn it is by counting placements.
 * The first player gets one extra turn at the very end (5 vs 4).
 */
export function turnSlotForBoard(board: Board): PlayerSlot {
  const p1 = placementsBy(board, 'p1');
  const p2 = placementsBy(board, 'p2');
  // p1 always plays when they're at the same count; p2 plays when p1 is ahead.
  return p1 === p2 ? 'p1' : 'p2';
}
