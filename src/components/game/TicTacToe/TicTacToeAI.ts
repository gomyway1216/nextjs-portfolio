/**
 * TicTacToe AI logic with minimax algorithm
 */

import { Player, PLAYER, AI, WinResult } from './types';
import { Difficulty } from '../common/types';

/**
 * Check for winner
 */
export const checkWinner = (board: Player[]): WinResult => {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6] // Diagonals
  ];

  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }

  return { winner: null, line: null };
};

/**
 * Check if board is full
 */
export const isBoardFull = (board: Player[]): boolean => {
  return board.every(cell => cell !== null);
};

/**
 * Minimax algorithm for TicTacToe
 */
const minimax = (board: Player[], isMaximizing: boolean, depth: number): number => {
  const { winner } = checkWinner(board);

  if (winner === AI) return 10 - depth;
  if (winner === PLAYER) return depth - 10;
  if (isBoardFull(board)) return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = AI;
        const score = minimax(board, false, depth + 1);
        board[i] = null;
        bestScore = Math.max(score, bestScore);
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = PLAYER;
        const score = minimax(board, true, depth + 1);
        board[i] = null;
        bestScore = Math.min(score, bestScore);
      }
    }
    return bestScore;
  }
};

/**
 * Get best move for AI based on difficulty
 */
export const getBestMove = (board: Player[], difficulty: Difficulty): number => {
  const emptyCells = board.map((cell, i) => cell === null ? i : null).filter(i => i !== null) as number[];

  if (emptyCells.length === 0) return -1;

  // Easy: Random move
  if (difficulty === 'easy') {
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }

  // Medium: 50% best move, 50% random
  if (difficulty === 'medium') {
    if (Math.random() < 0.5) {
      return emptyCells[Math.floor(Math.random() * emptyCells.length)];
    }
  }

  // Hard or Medium (50% of the time): Use minimax
  let bestScore = -Infinity;
  let bestMove = emptyCells[0];

  for (const i of emptyCells) {
    board[i] = AI;
    const score = minimax(board, false, 0);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }

  return bestMove;
};
