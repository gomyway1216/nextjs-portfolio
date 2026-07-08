/**
 * TicTacToe AI logic.
 *
 * The "master" tier is a perfect minimax player: it never loses and always
 * takes an immediate win or a forced block. Lower tiers deliberately blunder
 * at a believable, tunable rate so the game stays fun for casual players.
 */

import { Player, PLAYER, AI, WinResult } from './types';
import { Difficulty } from '../common/types';

export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

/**
 * Check for a winner and return the winning line if any.
 */
export const checkWinner = (board: Player[]): WinResult => {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  return { winner: null, line: null };
};

/**
 * Check if board is full.
 */
export const isBoardFull = (board: Player[]): boolean => {
  return board.every(cell => cell !== null);
};

const emptyCells = (board: Player[]): number[] => {
  const cells: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) cells.push(i);
  }
  return cells;
};

const opponentOf = (mark: Player): Player => (mark === AI ? PLAYER : AI);

/**
 * If `mark` can win outright on this move, return that cell; else -1.
 */
export const findWinningMove = (board: Player[], mark: Player): number => {
  for (const i of emptyCells(board)) {
    board[i] = mark;
    const won = checkWinner(board).winner === mark;
    board[i] = null;
    if (won) return i;
  }
  return -1;
};

/**
 * Minimax that scores the position from `me`'s perspective.
 * Faster/earlier wins and later losses are preferred via depth weighting.
 */
const minimax = (
  board: Player[],
  me: Player,
  toMove: Player,
  depth: number
): number => {
  const { winner } = checkWinner(board);
  if (winner === me) return 10 - depth;
  if (winner && winner !== me) return depth - 10;
  if (isBoardFull(board)) return 0;

  const maximizing = toMove === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const i of emptyCells(board)) {
    board[i] = toMove;
    const score = minimax(board, me, opponentOf(toMove), depth + 1);
    board[i] = null;
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
};

/**
 * The perfect move for `mark`: picks the highest-scoring cell via minimax.
 * Ties are broken toward center then corners for natural-looking play.
 */
const CELL_PRIORITY = [4, 0, 2, 6, 8, 1, 3, 5, 7];

export const getOptimalMove = (board: Player[], mark: Player): number => {
  const cells = emptyCells(board);
  if (cells.length === 0) return -1;

  let bestScore = -Infinity;
  let bestMove = cells[0];
  // Evaluate in priority order so equal-scoring moves favor center/corners.
  for (const i of [...CELL_PRIORITY].filter(c => board[c] === null)) {
    board[i] = mark;
    const score = minimax(board, mark, opponentOf(mark), 0);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
};

/**
 * Blunder rate per tier: probability the AI plays a random legal move
 * instead of the optimal one on any given turn. `master` never blunders.
 * Even when it "blunders", easier tiers still grab a free immediate win
 * (a human-like instinct) via the caller's win-check below.
 */
const BLUNDER_RATE: Record<Difficulty, number> = {
  easy: 0.8,
  medium: 0.45,
  hard: 0.2,
  expert: 0.07,
  master: 0
};

/**
 * Choose the AI's move for the given difficulty.
 *
 * `rng` is injectable for deterministic testing (defaults to Math.random).
 */
export const getBestMove = (
  board: Player[],
  difficulty: Difficulty,
  rng: () => number = Math.random
): number => {
  const cells = emptyCells(board);
  if (cells.length === 0) return -1;

  const rate = BLUNDER_RATE[difficulty] ?? 0;

  if (rate > 0 && rng() < rate) {
    // Believable blunder: still take a free immediate win if one exists,
    // otherwise pick a random legal cell.
    const winNow = findWinningMove(board, AI);
    if (winNow !== -1) return winNow;
    return cells[Math.floor(rng() * cells.length)];
  }

  return getOptimalMove(board, AI);
};
