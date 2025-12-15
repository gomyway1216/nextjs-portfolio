/**
 * Gomoku AI logic with minimax and alpha-beta pruning
 */

import { Player, Position, GomokuBoard, BOARD_SIZE, WIN_LENGTH, PLAYER, AI } from './types';
import { Difficulty } from '../common/types';

/**
 * Check for winner starting from a position
 */
export const checkWinFromPosition = (
  board: GomokuBoard,
  row: number,
  col: number,
  player: Player
): Position[] | null => {
  if (!player) return null;

  const directions = [
    { dr: 0, dc: 1 },  // Horizontal
    { dr: 1, dc: 0 },  // Vertical
    { dr: 1, dc: 1 },  // Diagonal \
    { dr: 1, dc: -1 }, // Diagonal /
  ];

  for (const { dr, dc } of directions) {
    const line: Position[] = [{ row, col }];

    // Check forward direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== player) {
        break;
      }
      line.push({ row: r, col: c });
    }

    // Check backward direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== player) {
        break;
      }
      line.unshift({ row: r, col: c });
    }

    if (line.length >= WIN_LENGTH) {
      return line.slice(0, WIN_LENGTH);
    }
  }

  return null;
};

/**
 * Check if board is full
 */
export const isBoardFull = (board: GomokuBoard): boolean => {
  return board.every(row => row.every(cell => cell !== null));
};

/**
 * Get all valid moves (only near existing stones for efficiency)
 */
export const getValidMoves = (board: GomokuBoard): Position[] => {
  const moves: Position[] = [];
  const checked = new Set<string>();

  // If board is empty, return center
  const isEmpty = board.every(row => row.every(cell => cell === null));
  if (isEmpty) {
    return [{ row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) }];
  }

  // Only consider moves within 2 squares of existing stones
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null) {
        // Check surrounding area
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            const key = `${nr},${nc}`;

            if (
              nr >= 0 && nr < BOARD_SIZE &&
              nc >= 0 && nc < BOARD_SIZE &&
              board[nr][nc] === null &&
              !checked.has(key)
            ) {
              moves.push({ row: nr, col: nc });
              checked.add(key);
            }
          }
        }
      }
    }
  }

  return moves;
};

/**
 * Pattern evaluation - returns score for a line of stones
 */
const evaluateLine = (
  board: GomokuBoard,
  row: number,
  col: number,
  dr: number,
  dc: number,
  player: Player
): number => {
  let count = 0;
  let openEnds = 0;

  // Count consecutive stones
  let r = row;
  let c = col;
  while (
    r >= 0 && r < BOARD_SIZE &&
    c >= 0 && c < BOARD_SIZE &&
    board[r][c] === player
  ) {
    count++;
    r += dr;
    c += dc;
  }

  // Check if open end
  if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
    openEnds++;
  }

  // Check other direction
  r = row - dr;
  c = col - dc;
  while (
    r >= 0 && r < BOARD_SIZE &&
    c >= 0 && c < BOARD_SIZE &&
    board[r][c] === player
  ) {
    count++;
    r -= dr;
    c -= dc;
  }

  // Check if open end
  if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
    openEnds++;
  }

  // Score based on pattern
  if (count >= WIN_LENGTH) return 100000; // Win
  if (count === 4) {
    if (openEnds === 2) return 10000; // Open four
    if (openEnds === 1) return 1000;  // Half-open four
  }
  if (count === 3) {
    if (openEnds === 2) return 1000; // Open three
    if (openEnds === 1) return 100;  // Half-open three
  }
  if (count === 2) {
    if (openEnds === 2) return 100; // Open two
    if (openEnds === 1) return 10;  // Half-open two
  }

  return count;
};

/**
 * Evaluate board position
 */
const evaluateBoard = (board: GomokuBoard, player: Player): number => {
  let score = 0;
  const opponent = player === AI ? PLAYER : AI;

  const directions = [
    { dr: 0, dc: 1 },  // Horizontal
    { dr: 1, dc: 0 },  // Vertical
    { dr: 1, dc: 1 },  // Diagonal \
    { dr: 1, dc: -1 }, // Diagonal /
  ];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === player) {
        for (const { dr, dc } of directions) {
          score += evaluateLine(board, r, c, dr, dc, player);
        }
      } else if (board[r][c] === opponent) {
        for (const { dr, dc } of directions) {
          score -= evaluateLine(board, r, c, dr, dc, opponent);
        }
      }
    }
  }

  return score;
};

/**
 * Minimax with alpha-beta pruning
 */
const minimax = (
  board: GomokuBoard,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): number => {
  const moves = getValidMoves(board);

  // Check terminal states
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === AI && checkWinFromPosition(board, r, c, AI)) {
        return 1000000 - depth;
      }
      if (board[r][c] === PLAYER && checkWinFromPosition(board, r, c, PLAYER)) {
        return -1000000 + depth;
      }
    }
  }

  if (depth === 0 || moves.length === 0) {
    return evaluateBoard(board, AI);
  }

  // Sort moves by proximity to center for better move ordering
  const sortedMoves = moves.sort((a, b) => {
    const centerA = Math.abs(a.row - BOARD_SIZE/2) + Math.abs(a.col - BOARD_SIZE/2);
    const centerB = Math.abs(b.row - BOARD_SIZE/2) + Math.abs(b.col - BOARD_SIZE/2);
    return centerA - centerB;
  });

  if (isMaximizing) {
    let maxEval = -Infinity;

    for (const move of sortedMoves) {
      board[move.row][move.col] = AI;
      const evaluation = minimax(board, depth - 1, alpha, beta, false);
      board[move.row][move.col] = null;

      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);

      if (beta <= alpha) break; // Beta cutoff
    }

    return maxEval;
  } else {
    let minEval = Infinity;

    for (const move of sortedMoves) {
      board[move.row][move.col] = PLAYER;
      const evaluation = minimax(board, depth - 1, alpha, beta, true);
      board[move.row][move.col] = null;

      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);

      if (beta <= alpha) break; // Alpha cutoff
    }

    return minEval;
  }
};

/**
 * Get best move for AI based on difficulty
 */
export const getBestMove = (board: GomokuBoard, difficulty: Difficulty): Position | null => {
  const moves = getValidMoves(board);
  if (moves.length === 0) return null;

  const depthMap: Record<Difficulty, number> = {
    easy: 2,
    medium: 3,
    hard: 4,
    expert: 5,
    master: 6,
  };

  const searchDepth = depthMap[difficulty];
  let bestMove: Position | null = null;
  let bestValue = -Infinity;

  // Check for immediate wins or blocks first
  for (const move of moves) {
    board[move.row][move.col] = AI;
    if (checkWinFromPosition(board, move.row, move.col, AI)) {
      board[move.row][move.col] = null;
      return move; // Winning move
    }
    board[move.row][move.col] = null;

    board[move.row][move.col] = PLAYER;
    if (checkWinFromPosition(board, move.row, move.col, PLAYER)) {
      board[move.row][move.col] = null;
      bestMove = move; // Must block
    }
    board[move.row][move.col] = null;
  }

  if (bestMove) return bestMove;

  // Sort moves and limit to top 20 for performance
  const sortedMoves = moves.sort((a, b) => {
    const centerA = Math.abs(a.row - BOARD_SIZE/2) + Math.abs(a.col - BOARD_SIZE/2);
    const centerB = Math.abs(b.row - BOARD_SIZE/2) + Math.abs(b.col - BOARD_SIZE/2);
    return centerA - centerB;
  }).slice(0, Math.min(20, moves.length));

  for (const move of sortedMoves) {
    board[move.row][move.col] = AI;
    const moveValue = minimax(board, searchDepth - 1, -Infinity, Infinity, false);
    board[move.row][move.col] = null;

    if (moveValue > bestValue) {
      bestValue = moveValue;
      bestMove = move;
    }
  }

  return bestMove;
};
