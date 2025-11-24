/**
 * Tetris-specific types and constants
 */

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type Cell = TetrominoType | null;

export type Board = Cell[][];

export interface Position {
  x: number;
  y: number;
}

export interface Tetromino {
  type: TetrominoType;
  shape: number[][];
  position: Position;
  color: string;
}

export interface GameState {
  board: Board;
  currentPiece: Tetromino | null;
  nextPiece: Tetromino | null;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  isPaused: boolean;
}

// Tetromino shapes (4x4 matrices)
export const SHAPES: Record<TetrominoType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  T: [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 0, 1, 0],
    [0, 0, 0, 0],
  ],
  S: [
    [0, 0, 0, 0],
    [0, 0, 1, 1],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  Z: [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 1],
    [0, 0, 0, 0],
  ],
  J: [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 0, 0, 1],
    [0, 0, 0, 0],
  ],
  L: [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
};

// Tetromino colors
export const COLORS: Record<TetrominoType, string> = {
  I: '#00f0f0',  // Cyan
  O: '#f0f000',  // Yellow
  T: '#a000f0',  // Purple
  S: '#00f000',  // Green
  Z: '#f00000',  // Red
  J: '#0000f0',  // Blue
  L: '#f0a000',  // Orange
};

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const CELL_SIZE = 30;

export const GAME_CONSTANTS = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  CELL_SIZE,
  INITIAL_DROP_INTERVAL: 1000, // ms
  MIN_DROP_INTERVAL: 100, // ms
  LEVEL_SPEED_INCREASE: 50, // ms faster per level
  POINTS_PER_LINE: [0, 100, 300, 500, 800], // 0, 1, 2, 3, 4 lines
  LINES_PER_LEVEL: 10,
} as const;
