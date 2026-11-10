/**
 * Territory Number — exact solver + post-game review.
 *
 * The game is tiny (9 plies, a shared pool of 9 cards), so every position can
 * be solved to the end. The review replays
 * a finished match and, for each move, compares the line margin the mover
 * could have secured with perfect play against the margin their actual move
 * led to. No heuristics: a "loss" of 2 means the move really gave away two
 * lines against best play.
 *
 * Pure logic — no React. The solver works on flat typed arrays instead of the
 * immutable `Board`, with a transposition table, so even the empty board
 * solves in roughly a tenth of a second.
 */

import { emptyBoard, placeCard } from './gameLogic';
import { LINES } from './types';
import type { Board, PlayerSlot } from './types';

export interface MoveRecord {
  slot: PlayerSlot;
  card: number;
  cellIndex: number;
}

export interface Placement {
  card: number;
  cellIndex: number;
}

export type MoveGrade = 'best' | 'inaccuracy' | 'mistake';

export interface MoveReview {
  move: MoveRecord;
  /** Final line margin (mover − opponent) the mover could force before moving. */
  bestMargin: number;
  /** Final line margin (mover − opponent) with perfect play after the move made. */
  playedMargin: number;
  /** Lines given away against perfect play: bestMargin − playedMargin (≥ 0). */
  loss: number;
  grade: MoveGrade;
  /** A placement that keeps `bestMargin` (the played one when it was best). */
  best: Placement;
}

/** Lines through each cell, as indices into LINES. */
const CELL_LINES: readonly (readonly number[])[] = Array.from({ length: 9 }, (_, cell) =>
  LINES.flatMap((line, i) => (line.includes(cell) ? [i] : []))
);

/** Try the cells that sit on the most lines first: better alpha-beta cuts. */
const CELL_ORDER: readonly number[] = [4, 0, 2, 6, 8, 1, 3, 5, 7];

const FLAG_EXACT = 0;
const FLAG_LOWER = 1;
const FLAG_UPPER = 2;

class Solver {
  /** Per cell: 0 = empty, otherwise card * 2 + (owner is p2 ? 1 : 0). */
  private readonly cells = new Uint8Array(9);
  /** Per line: p1 sum − p2 sum. */
  private readonly diff = new Int8Array(8);
  private usedCards = 0;
  private empties = 9;
  private readonly table = new Map<number, number>();

  constructor(board: Board) {
    board.forEach((cell, idx) => {
      if (cell.value === null || cell.owner === null) return;
      this.place(idx, cell.value, cell.owner === 'p1' ? 1 : -1);
    });
  }

  private place(cell: number, card: number, sign: number): void {
    this.cells[cell] = card * 2 + (sign === 1 ? 0 : 1);
    this.usedCards |= 1 << card;
    this.empties -= 1;
    for (const l of CELL_LINES[cell]) this.diff[l] += sign * card;
  }

  private unplace(cell: number, card: number, sign: number): void {
    this.cells[cell] = 0;
    this.usedCards &= ~(1 << card);
    this.empties += 1;
    for (const l of CELL_LINES[cell]) this.diff[l] -= sign * card;
  }

  private key(sign: number): number {
    let k = 0;
    for (let i = 0; i < 9; i++) k = k * 20 + this.cells[i];
    return k * 2 + (sign === 1 ? 0 : 1);
  }

  /** Final margin (p1 lines − p2 lines) of a full board. */
  private terminal(): number {
    let m = 0;
    for (let l = 0; l < 8; l++) {
      const d = this.diff[l];
      if (d > 0) m += 1;
      else if (d < 0) m -= 1;
    }
    return m;
  }

  /**
   * Negamax with alpha-beta: the exact final margin from the point of view of
   * the side to move (`sign` = 1 for p1, −1 for p2). Negations are written as
   * `0 - x` so a drawn margin is always +0, never −0.
   */
  negamax(sign: number, alphaIn: number, betaIn: number): number {
    if (this.empties === 0) return sign === 1 ? this.terminal() : 0 - this.terminal();

    let alpha = alphaIn;
    let beta = betaIn;
    const useTable = this.empties >= 3;
    let k = 0;
    if (useTable) {
      k = this.key(sign);
      const hit = this.table.get(k);
      if (hit !== undefined) {
        const value = (hit >> 2) - 8;
        const flag = hit & 3;
        if (flag === FLAG_EXACT) return value;
        if (flag === FLAG_LOWER && value > alpha) alpha = value;
        else if (flag === FLAG_UPPER && value < beta) beta = value;
        if (alpha >= beta) return value;
      }
    }

    let best = -9;
    const alpha0 = alpha;
    search: for (let card = 9; card >= 1; card--) {
      if (this.usedCards & (1 << card)) continue;
      for (const cell of CELL_ORDER) {
        if (this.cells[cell] !== 0) continue;
        this.place(cell, card, sign);
        const score = 0 - this.negamax(-sign, -beta, -alpha);
        this.unplace(cell, card, sign);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break search;
      }
    }

    if (useTable) {
      const flag = best <= alpha0 ? FLAG_UPPER : best >= beta ? FLAG_LOWER : FLAG_EXACT;
      this.table.set(k, ((best + 8) << 2) | flag);
    }
    return best;
  }

  /** Exact margin for `sign` after it plays (card, cell). */
  marginAfter(cell: number, card: number, sign: number): number {
    this.place(cell, card, sign);
    const score = 0 - this.negamax(-sign, -9, 9);
    this.unplace(cell, card, sign);
    return score;
  }

  /**
   * The side to move's best placement and the exact margin it secures. Among
   * equally good placements the strongest card on the busiest cell wins.
   */
  bestMove(sign: number): Placement & { margin: number } {
    let best: (Placement & { margin: number }) | null = null;
    let alpha = -9;
    for (let card = 9; card >= 1; card--) {
      if (this.usedCards & (1 << card)) continue;
      for (const cell of CELL_ORDER) {
        if (this.cells[cell] !== 0) continue;
        this.place(cell, card, sign);
        const margin = 0 - this.negamax(-sign, -9, -alpha);
        this.unplace(cell, card, sign);
        if (best === null || margin > best.margin) {
          best = { card, cellIndex: cell, margin };
          if (margin > alpha) alpha = margin;
        }
      }
    }
    if (best === null) throw new Error('No legal move available');
    return best;
  }
}

const signOf = (slot: PlayerSlot): number => (slot === 'p1' ? 1 : -1);

/**
 * Exact final line margin (`toMove`'s lines − the opponent's) with both sides
 * playing perfectly from `board`. On a full board this is simply the result.
 */
export function solveMargin(board: Board, toMove: PlayerSlot): number {
  return new Solver(board).negamax(signOf(toMove), -9, 9);
}

/** `toMove`'s best placement from `board`, with the exact margin it secures. */
export function solveBestMove(
  board: Board,
  toMove: PlayerSlot
): Placement & { margin: number } {
  return new Solver(board).bestMove(signOf(toMove));
}

export function gradeForLoss(loss: number): MoveGrade {
  if (loss <= 0) return 'best';
  return loss === 1 ? 'inaccuracy' : 'mistake';
}

/** Boards after 0, 1, …, n moves (n + 1 entries). */
export function boardsFromMoves(moves: readonly MoveRecord[]): Board[] {
  const boards: Board[] = [emptyBoard()];
  for (const m of moves) {
    boards.push(placeCard(boards[boards.length - 1], m.cellIndex, m.card, m.slot));
  }
  return boards;
}

/**
 * Every match starts from the same empty board, and the game is symmetric in
 * the two colours, so the costliest solve of a review is done once per session.
 */
let openingBest: (Placement & { margin: number }) | null = null;

/** Review a single move played from `before`. */
export function reviewMove(before: Board, move: MoveRecord): MoveReview {
  if (before[move.cellIndex].value !== null || before.some(c => c.value === move.card)) {
    throw new Error('Reviewed move is not legal on its board');
  }
  const solver = new Solver(before);
  const sign = signOf(move.slot);
  let top: Placement & { margin: number };
  if (before.every(c => c.value === null)) {
    openingBest ??= solver.bestMove(sign);
    top = openingBest;
  } else {
    top = solver.bestMove(sign);
  }
  const playedMargin = solver.marginAfter(move.cellIndex, move.card, sign);
  const loss = top.margin - playedMargin;
  return {
    move,
    bestMargin: top.margin,
    playedMargin,
    loss,
    grade: gradeForLoss(loss),
    best: loss === 0
      ? { card: move.card, cellIndex: move.cellIndex }
      : { card: top.card, cellIndex: top.cellIndex },
  };
}

/** Review every move of a recorded match, in order. */
export function reviewGame(moves: readonly MoveRecord[]): MoveReview[] {
  const boards = boardsFromMoves(moves);
  return moves.map((m, i) => reviewMove(boards[i], m));
}

export interface ReviewSummary {
  moves: number;
  bestMoves: number;
  /** Total lines given away against perfect play. */
  linesLost: number;
}

export function summarizeReview(reviews: readonly MoveReview[], slot: PlayerSlot): ReviewSummary {
  const mine = reviews.filter(r => r.move.slot === slot);
  return {
    moves: mine.length,
    bestMoves: mine.filter(r => r.loss === 0).length,
    linesLost: mine.reduce((n, r) => n + r.loss, 0),
  };
}

/** Index of the first costliest move by `slot`, or null if none lost a line. */
export function biggestMistakeIndex(
  reviews: readonly MoveReview[],
  slot: PlayerSlot
): number | null {
  let idx: number | null = null;
  let worst = 0;
  reviews.forEach((r, i) => {
    if (r.move.slot === slot && r.loss > worst) {
      worst = r.loss;
      idx = i;
    }
  });
  return idx;
}
