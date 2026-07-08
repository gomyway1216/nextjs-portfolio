/**
 * Tetris game logic - pure functions implementing modern guideline mechanics:
 * SRS rotation with wall kicks, 7-bag randomizer, ghost piece, and scoring.
 */

import {
  Board,
  Tetromino,
  TetrominoType,
  RotationState,
  Position,
  SHAPES,
  COLORS,
  ALL_TYPES,
  BOARD_WIDTH,
  TOTAL_HEIGHT,
  HIDDEN_ROWS,
  GAME_CONSTANTS,
  JLSTZ_KICKS,
  I_KICKS,
} from './types';
import { Difficulty } from '../common/types';

/**
 * Create an empty board. The board includes HIDDEN_ROWS spawn rows on top of
 * the visible BOARD_HEIGHT rows so pieces have room to appear and rotate.
 */
export const createEmptyBoard = (): Board => {
  return Array(TOTAL_HEIGHT)
    .fill(null)
    .map(() => Array(BOARD_WIDTH).fill(null));
};

/**
 * Fisher-Yates shuffle (returns a new array).
 */
export const shuffle = <T>(arr: T[], rng: () => number = Math.random): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * 7-bag randomizer: returns a freshly shuffled permutation of all 7 pieces.
 * Guarantees every piece appears once per bag (no long droughts / floods).
 */
export const newBag = (rng: () => number = Math.random): TetrominoType[] =>
  shuffle(ALL_TYPES, rng);

/**
 * Refill a next-queue so it has at least `size` upcoming pieces, drawing from
 * fresh 7-bags as needed.
 */
export const refillQueue = (
  queue: TetrominoType[],
  size: number = GAME_CONSTANTS.NEXT_QUEUE_SIZE,
  rng: () => number = Math.random
): TetrominoType[] => {
  const out = [...queue];
  while (out.length <= size) {
    out.push(...newBag(rng));
  }
  return out;
};

/**
 * Spawn a tetromino of the given type at the top-centre in spawn orientation.
 */
export const createTetromino = (type: TetrominoType): Tetromino => {
  const shape = SHAPES[type];
  // Center horizontally; guideline spawns pieces so they straddle columns 4-5.
  const x = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
  // Spawn within the hidden rows so the piece enters from the top.
  const y = type === 'I' ? HIDDEN_ROWS - 2 : HIDDEN_ROWS - 1;
  return {
    type,
    shape,
    position: { x, y },
    color: COLORS[type],
    rotation: 0,
  };
};

/**
 * Check if a piece occupies a valid position (in bounds, no collision).
 */
export const isValidPosition = (
  board: Board,
  piece: Tetromino,
  offset: Position = { x: 0, y: 0 }
): boolean => {
  const { shape, position } = piece;
  const newX = position.x + offset.x;
  const newY = position.y + offset.y;

  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const boardX = newX + x;
      const boardY = newY + y;

      if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= TOTAL_HEIGHT) {
        return false;
      }
      // Allow cells above the board (negative y) for spawn; block occupied cells.
      if (boardY >= 0 && board[boardY][boardX]) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Rotate a square matrix 90 degrees. `dir` = 1 clockwise, -1 counter-clockwise.
 */
export const rotateMatrix = (shape: number[][], dir: 1 | -1): number[][] => {
  const n = shape.length;
  const out: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dir === 1) {
        out[x][n - 1 - y] = shape[y][x];
      } else {
        out[n - 1 - x][y] = shape[y][x];
      }
    }
  }
  return out;
};

const nextRotation = (r: RotationState, dir: 1 | -1): RotationState =>
  (((r + dir) % 4) + 4) % 4 as RotationState;

/**
 * Get the SRS kick offsets for a rotation transition of a given piece.
 */
export const getKicks = (
  type: TetrominoType,
  from: RotationState,
  to: RotationState
): Position[] => {
  if (type === 'O') return [{ x: 0, y: 0 }];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}${to}`] ?? [{ x: 0, y: 0 }];
};

/**
 * Attempt an SRS rotation with wall kicks. Returns the rotated piece if any
 * kick offset yields a valid position, otherwise null.
 *
 * @param dir 1 = clockwise, -1 = counter-clockwise
 */
export const tryRotate = (
  board: Board,
  piece: Tetromino,
  dir: 1 | -1 = 1
): Tetromino | null => {
  if (piece.type === 'O') return null; // O never needs rotation

  const to = nextRotation(piece.rotation, dir);
  const rotatedShape = rotateMatrix(piece.shape, dir);
  const rotated: Tetromino = { ...piece, shape: rotatedShape, rotation: to };
  const kicks = getKicks(piece.type, piece.rotation, to);

  for (const kick of kicks) {
    if (isValidPosition(board, rotated, kick)) {
      return {
        ...rotated,
        position: { x: rotated.position.x + kick.x, y: rotated.position.y + kick.y },
      };
    }
  }
  return null;
};

/**
 * Merge a locked piece into the board (returns a new board).
 */
export const mergePieceToBoard = (board: Board, piece: Tetromino): Board => {
  const newBoard = board.map(row => [...row]);
  const { shape, position, type } = piece;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const boardY = position.y + y;
      const boardX = position.x + x;
      if (boardY >= 0 && boardY < TOTAL_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
        newBoard[boardY][boardX] = type;
      }
    }
  }
  return newBoard;
};

/**
 * Return the indices of fully-filled rows (candidates for clearing).
 */
export const getFullRows = (board: Board): number[] => {
  const rows: number[] = [];
  for (let y = 0; y < board.length; y++) {
    if (board[y].every(cell => cell !== null)) rows.push(y);
  }
  return rows;
};

/**
 * Clear completed lines and collapse the board (returns new board + count).
 */
export const clearLines = (board: Board): { newBoard: Board; linesCleared: number } => {
  const kept = board.filter(row => !row.every(cell => cell !== null));
  const linesCleared = board.length - kept.length;
  const newBoard: Board = [];
  while (newBoard.length < linesCleared) {
    newBoard.push(Array(BOARD_WIDTH).fill(null));
  }
  return { newBoard: [...newBoard, ...kept], linesCleared };
};

/**
 * Calculate line-clear score. Level is 1-based here (level 1 = multiplier 1).
 */
export const calculateScore = (linesCleared: number, level: number): number => {
  const base = GAME_CONSTANTS.POINTS_PER_LINE[linesCleared] ?? 0;
  return base * Math.max(1, level);
};

/**
 * Level derived from total lines cleared (1-based; level 1 until 10 lines).
 */
export const getLevel = (lines: number): number =>
  Math.floor(lines / GAME_CONSTANTS.LINES_PER_LEVEL) + 1;

/**
 * Gravity interval (ms) based on difficulty (starting speed) and level.
 * Uses a guideline-inspired curve that accelerates as the level rises.
 */
export const getDropInterval = (difficulty: Difficulty, level: number): number => {
  const startLevel = {
    easy: 0,
    medium: 2,
    hard: 4,
    expert: 6,
    master: 8,
  }[difficulty] ?? 0;

  const effective = startLevel + (level - 1);
  // Classic Tetris-style gravity curve: ~0.8 - ((n-1)*0.007))^(n-1) seconds.
  const seconds = Math.pow(0.8 - effective * 0.007, effective);
  const ms = seconds * 1000;
  return Math.max(GAME_CONSTANTS.MIN_DROP_INTERVAL, Math.round(ms));
};

/**
 * Get the landing y for the piece (where a hard drop would place it).
 */
export const getGhostPiecePosition = (board: Board, piece: Tetromino): number => {
  let ghostY = piece.position.y;
  while (isValidPosition(board, { ...piece, position: { ...piece.position, y: ghostY + 1 } })) {
    ghostY++;
  }
  return ghostY;
};

/**
 * Number of cells the piece can hard-drop before landing.
 */
export const getDropDistance = (board: Board, piece: Tetromino): number =>
  getGhostPiecePosition(board, piece) - piece.position.y;
