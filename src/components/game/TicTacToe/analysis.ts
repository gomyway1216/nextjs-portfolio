/**
 * Exact analysis of TicTacToe positions: what a position is worth with perfect
 * play from both sides, which moves keep that value, and how each move of a
 * finished game compares. Drives the hint, the undo and the post-game review.
 */

import { checkWinner, isBoardFull } from './TicTacToeAI';
import { AI, Player, PLAYER } from './types';

export type Mark = 'X' | 'O';

/** Result with perfect play from both sides, from one side's point of view. */
export type Outcome = 'win' | 'draw' | 'loss';

/**
 * good      — the move keeps the best result the position allowed
 * missedWin — a forced win was available and the move only draws
 * blunder   — the move hands the opponent a forced win
 */
export type MoveGrade = 'good' | 'missedWin' | 'blunder';

export interface MoveRecord {
  cell: number;
  mark: Mark;
}

export interface MoveReview extends MoveRecord {
  grade: MoveGrade;
  /** What the mover could get, at best, from the position before the move. */
  before: Outcome;
  /** What the mover gets after the move actually played. */
  after: Outcome;
  /** Every cell that would have kept `before`, in board order. */
  bestCells: number[];
}

export const HUMAN_MARK = PLAYER as Mark;
export const AI_MARK = AI as Mark;

const otherMark = (mark: Mark): Mark => (mark === 'X' ? 'O' : 'X');

// Same preference as the AI: center, then corners, then edges.
const CELL_PRIORITY = [4, 0, 2, 6, 8, 1, 3, 5, 7];

const WIN_SCORE = 10;

const cache = new Map<string, number>();

/**
 * Negamax score for the side to move. Positive means a forced win, negative a
 * forced loss, 0 a draw; a win scores higher the sooner it arrives and a loss
 * scores higher the later it arrives. Only 3^9 positions exist, so every
 * result is cached and a lookup after the first is immediate.
 */
const score = (board: Player[], toMove: Mark): number => {
  const key = `${toMove}${board.map(cell => cell ?? '.').join('')}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let result: number;
  if (checkWinner(board).winner) {
    // A line can only have been completed by the side that just moved.
    result = -WIN_SCORE;
  } else if (isBoardFull(board)) {
    result = 0;
  } else {
    result = -Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== null) continue;
      board[i] = toMove;
      const reply = -score(board, otherMark(toMove));
      board[i] = null;
      // One move further from the end: pull the score one step toward 0.
      result = Math.max(result, reply - Math.sign(reply));
    }
  }
  cache.set(key, result);
  return result;
};

const toOutcome = (value: number): Outcome => (value > 0 ? 'win' : value < 0 ? 'loss' : 'draw');

/** Score, for `mark`, of playing each empty cell. Does not mutate `board`. */
const moveScores = (board: Player[], mark: Mark): { cell: number; value: number }[] => {
  const work = [...board];
  const scores: { cell: number; value: number }[] = [];
  for (let cell = 0; cell < work.length; cell++) {
    if (work[cell] !== null) continue;
    work[cell] = mark;
    scores.push({ cell, value: -score(work, otherMark(mark)) });
    work[cell] = null;
  }
  return scores;
};

/**
 * What `toMove` gets from this position with perfect play from both sides.
 * A position that is already decided or full is reported as it stands.
 */
export const evaluatePosition = (board: Player[], toMove: Mark): Outcome =>
  toOutcome(score([...board], toMove));

export interface Hint {
  cell: number;
  /** What the hinted move secures against perfect play. */
  outcome: Outcome;
}

/**
 * The strongest move for `mark`: the quickest forced win, else a move that
 * holds the draw, else the move that loses as late as possible. Equal moves
 * prefer the center, then corners. Null when the game is over.
 */
export const getHint = (board: Player[], mark: Mark): Hint | null => {
  if (checkWinner(board).winner) return null;
  const scores = moveScores(board, mark);
  if (scores.length === 0) return null;
  const byCell = new Map(scores.map(s => [s.cell, s.value]));
  let best: { cell: number; value: number } | null = null;
  for (const cell of CELL_PRIORITY) {
    const value = byCell.get(cell);
    if (value === undefined) continue;
    if (best === null || value > best.value) best = { cell, value };
  }
  return best && { cell: best.cell, outcome: toOutcome(best.value) };
};

/** The board after the first `count` moves of a game. */
export const boardAfter = (moves: readonly MoveRecord[], count: number = moves.length): Player[] => {
  const board: Player[] = Array(9).fill(null);
  for (const move of moves.slice(0, Math.max(0, count))) {
    board[move.cell] = move.mark;
  }
  return board;
};

/**
 * Take back the human's last move together with any AI reply that followed it,
 * leaving the human to move again. Returns the same list when the human has
 * not moved yet (an AI opening move is never taken back).
 */
export const undoLastPlayerMove = (moves: readonly MoveRecord[]): readonly MoveRecord[] => {
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i].mark === HUMAN_MARK) return moves.slice(0, i);
  }
  return moves;
};

/**
 * Grade every move of a game against perfect play. Moves that are illegal for
 * the position reached (occupied cell, or played after the game ended) stop
 * the review there.
 */
export const reviewGame = (moves: readonly MoveRecord[]): MoveReview[] => {
  const board: Player[] = Array(9).fill(null);
  const reviews: MoveReview[] = [];
  for (const move of moves) {
    if (board[move.cell] !== null || checkWinner(board).winner) break;
    const scores = moveScores(board, move.mark);
    const bestValue = Math.max(...scores.map(s => s.value));
    const played = scores.find(s => s.cell === move.cell);
    if (!played) break;
    const before = toOutcome(bestValue);
    const after = toOutcome(played.value);
    const grade: MoveGrade =
      after === before ? 'good' : after === 'draw' ? 'missedWin' : 'blunder';
    reviews.push({
      ...move,
      grade,
      before,
      after,
      bestCells: scores.filter(s => toOutcome(s.value) === before).map(s => s.cell)
    });
    board[move.cell] = move.mark;
  }
  return reviews;
};
