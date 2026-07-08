/**
 * Tetris-specific types and constants (modern guideline mechanics).
 */

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type Cell = TetrominoType | null;

export type Board = Cell[][];

export interface Position {
  x: number;
  y: number;
}

/**
 * Rotation state following the SRS convention:
 * 0 = spawn, 1 = clockwise (R), 2 = 180, 3 = counter-clockwise (L).
 */
export type RotationState = 0 | 1 | 2 | 3;

export interface Tetromino {
  type: TetrominoType;
  /** Current shape matrix (square) for the active rotation state. */
  shape: number[][];
  position: Position;
  color: string;
  rotation: RotationState;
}

export interface GameState {
  board: Board;
  currentPiece: Tetromino | null;
  nextQueue: TetrominoType[];
  hold: TetrominoType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  isPaused: boolean;
}

/**
 * Base (spawn-state) tetromino matrices.
 * I uses a 4x4 grid and O a 2x2 grid (O is rotation-invariant); the rest use a
 * 3x3 grid so SRS rotation stays centred.
 */
export const SHAPES: Record<TetrominoType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

// Guideline tetromino colors.
export const COLORS: Record<TetrominoType, string> = {
  I: '#22d3ee', // Cyan
  O: '#fbbf24', // Yellow
  T: '#c084fc', // Purple
  S: '#4ade80', // Green
  Z: '#f87171', // Red
  J: '#60a5fa', // Blue
  L: '#fb923c', // Orange
};

export const ALL_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
/** Extra hidden rows above the visible field where pieces spawn. */
export const HIDDEN_ROWS = 2;
export const TOTAL_HEIGHT = BOARD_HEIGHT + HIDDEN_ROWS;
export const CELL_SIZE = 30;

export const GAME_CONSTANTS = {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  HIDDEN_ROWS,
  TOTAL_HEIGHT,
  CELL_SIZE,
  MIN_DROP_INTERVAL: 40, // ms
  POINTS_PER_LINE: [0, 100, 300, 500, 800], // 0,1,2,3,4 lines
  SOFT_DROP_POINTS: 1, // per cell
  HARD_DROP_POINTS: 2, // per cell
  LINES_PER_LEVEL: 10,
  LOCK_DELAY: 500, // ms
  MAX_LOCK_RESETS: 15,
  NEXT_QUEUE_SIZE: 5,
} as const;

/**
 * SRS wall-kick offset tables (dx, dy). y is measured downward (board space),
 * so the standard SRS "+y is up" tables are negated on the y axis here.
 *
 * Keyed by "<from><to>" rotation-state transitions.
 */
export const JLSTZ_KICKS: Record<string, Position[]> = {
  '01': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '10': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
  '12': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: -2 }, { x: 1, y: -2 }],
  '21': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: 2 }, { x: -1, y: 2 }],
  '23': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
  '32': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '30': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -2 }, { x: -1, y: -2 }],
  '03': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
};

export const I_KICKS: Record<string, Position[]> = {
  '01': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
  '10': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
  '12': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
  '21': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }],
  '23': [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: -1, y: 2 }],
  '32': [{ x: 0, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 1 }, { x: 1, y: -2 }],
  '30': [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 2 }, { x: -2, y: -1 }],
  '03': [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: 0 }, { x: -1, y: -2 }, { x: 2, y: 1 }],
};
