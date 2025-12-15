/**
 * Tetris game logic - pure functions
 */

import {
  Board,
  Tetromino,
  TetrominoType,
  SHAPES,
  COLORS,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  GAME_CONSTANTS,
} from './types';
import { Difficulty } from '../common/types';

/**
 * Create an empty board
 */
export const createEmptyBoard = (): Board => {
  return Array(BOARD_HEIGHT)
    .fill(null)
    .map(() => Array(BOARD_WIDTH).fill(null));
};

/**
 * Get random tetromino type
 */
const getRandomTetrominoType = (): TetrominoType => {
  const types: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  return types[Math.floor(Math.random() * types.length)];
};

/**
 * Create a new tetromino
 */
export const createTetromino = (type?: TetrominoType): Tetromino => {
  const tetrominoType = type || getRandomTetrominoType();
  return {
    type: tetrominoType,
    shape: SHAPES[tetrominoType],
    position: { x: Math.floor(BOARD_WIDTH / 2) - 2, y: 0 },
    color: COLORS[tetrominoType],
  };
};

/**
 * Check if a piece position is valid (no collision)
 */
export const isValidPosition = (
  board: Board,
  piece: Tetromino,
  offset: { x: number; y: number } = { x: 0, y: 0 }
): boolean => {
  const { shape, position } = piece;
  const newX = position.x + offset.x;
  const newY = position.y + offset.y;

  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const boardX = newX + x;
        const boardY = newY + y;

        // Check bounds
        if (
          boardX < 0 ||
          boardX >= BOARD_WIDTH ||
          boardY >= BOARD_HEIGHT
        ) {
          return false;
        }

        // Check collision with existing pieces (but allow negative y for spawn)
        if (boardY >= 0 && board[boardY][boardX]) {
          return false;
        }
      }
    }
  }

  return true;
};

/**
 * Rotate tetromino 90 degrees clockwise
 */
export const rotatePiece = (piece: Tetromino): Tetromino => {
  // O piece doesn't rotate
  if (piece.type === 'O') return piece;

  const newShape = piece.shape[0].map((_, index) =>
    piece.shape.map(row => row[index]).reverse()
  );

  return {
    ...piece,
    shape: newShape,
  };
};

/**
 * Try to rotate with wall kicks
 */
export const tryRotate = (board: Board, piece: Tetromino): Tetromino | null => {
  const rotated = rotatePiece(piece);

  // Try normal rotation
  if (isValidPosition(board, rotated)) {
    return rotated;
  }

  // Try wall kicks (move left/right/up)
  const kicks = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: -1 },
  ];

  for (const kick of kicks) {
    if (isValidPosition(board, rotated, kick)) {
      return {
        ...rotated,
        position: {
          x: rotated.position.x + kick.x,
          y: rotated.position.y + kick.y,
        },
      };
    }
  }

  return null; // Rotation failed
};

/**
 * Merge piece into board
 */
export const mergePieceToBoard = (board: Board, piece: Tetromino): Board => {
  const newBoard = board.map(row => [...row]);
  const { shape, position, type } = piece;

  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x]) {
        const boardY = position.y + y;
        const boardX = position.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
          newBoard[boardY][boardX] = type;
        }
      }
    }
  }

  return newBoard;
};

/**
 * Check and clear completed lines
 */
export const clearLines = (board: Board): { newBoard: Board; linesCleared: number } => {
  let linesCleared = 0;
  const newBoard: Board = [];

  // Check each row from bottom to top
  for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
    if (board[y].every(cell => cell !== null)) {
      linesCleared++;
    } else {
      newBoard.unshift(board[y]);
    }
  }

  // Add new empty rows at the top
  while (newBoard.length < BOARD_HEIGHT) {
    newBoard.unshift(Array(BOARD_WIDTH).fill(null));
  }

  return { newBoard, linesCleared };
};

/**
 * Calculate score for cleared lines
 */
export const calculateScore = (linesCleared: number, level: number): number => {
  return GAME_CONSTANTS.POINTS_PER_LINE[linesCleared] * (level + 1);
};

/**
 * Get drop interval based on difficulty and level
 */
export const getDropInterval = (difficulty: Difficulty, level: number): number => {
  const baseInterval = {
    easy: 1200,
    medium: 1000,
    hard: 800,
    expert: 650,
    master: 500,
  }[difficulty];

  return Math.max(
    GAME_CONSTANTS.MIN_DROP_INTERVAL,
    baseInterval - level * GAME_CONSTANTS.LEVEL_SPEED_INCREASE
  );
};

/**
 * Get ghost piece position (where piece will land)
 */
export const getGhostPiecePosition = (board: Board, piece: Tetromino): number => {
  let ghostY = piece.position.y;

  while (isValidPosition(board, { ...piece, position: { ...piece.position, y: ghostY + 1 } })) {
    ghostY++;
  }

  return ghostY;
};
