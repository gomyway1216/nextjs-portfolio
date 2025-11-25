/**
 * Othello types and constants
 * Based on Thell 3.0.3 implementation
 */

// Board constants
export const BOARD_SIZE = 8;
export const BOARD_POWER_SIZE = 6561; // 3^8
export const MAX_TURNS = 60;

// Color constants (following Thell convention)
export const EMPTY = 0;
export const BLACK = 1;  // First player
export const WHITE = -1; // Second player
export const WALL = 2;   // Sentinel value for board edges

export type Color = typeof EMPTY | typeof BLACK | typeof WHITE | typeof WALL;

// Infinity value for alpha-beta search
export const Infinity = 999999999;

// Evaluation multiplier (for integer arithmetic precision)
export const MULTIPLIER = 100000;

/**
 * Point representing a board position
 * Coordinates are 1-indexed (1-8 for x and y)
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Disc representing a piece on the board with its color
 */
export interface Disc extends Point {
  color: Color;
}

/**
 * Direction offsets for 8 directions
 * Order: NW, N, NE, W, E, SW, S, SE
 */
export const DIRECTIONS: readonly Point[] = [
  { x: -1, y: -1 }, // NW
  { x: 0, y: -1 },  // N
  { x: 1, y: -1 },  // NE
  { x: -1, y: 0 },  // W
  { x: 1, y: 0 },   // E
  { x: -1, y: 1 },  // SW
  { x: 0, y: 1 },   // S
  { x: 1, y: 1 },   // SE
] as const;

/**
 * Move with evaluation score for AI
 */
export interface Move extends Point {
  eval: number;
}

/**
 * Range of flippable discs in a direction
 */
export interface Flipable {
  lower: number; // Number of discs to flip in negative direction
  upper: number; // Number of discs to flip in positive direction
}

/**
 * Game state enum
 */
export enum GameState {
  Playing = 'playing',
  BlackWin = 'black_win',
  WhiteWin = 'white_win',
  Draw = 'draw',
}

/**
 * AI difficulty levels
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * AI parameters
 */
export interface AIParameter {
  midDepth: number;      // Search depth during mid-game
  wldDepth: number;      // Depth for win/loss/draw determination
  exactDepth: number;    // Depth for exact endgame solving
}

/**
 * Default AI parameters by difficulty
 */
export const AI_PARAMETERS: Record<Difficulty, AIParameter> = {
  easy: { midDepth: 2, wldDepth: 8, exactDepth: 6 },
  medium: { midDepth: 4, wldDepth: 12, exactDepth: 10 },
  hard: { midDepth: 6, wldDepth: 16, exactDepth: 14 },
};

/**
 * Point priority list for move ordering
 * Based on Zebra's history heuristic ordering
 */
export const POINT_PRIORITY_LIST: readonly Point[] = [
  // Corners (a1, h1, a8, h8)
  { x: 1, y: 1 }, { x: 8, y: 1 }, { x: 1, y: 8 }, { x: 8, y: 8 },
  // c1 positions (edge near corners)
  { x: 3, y: 1 }, { x: 6, y: 1 }, { x: 8, y: 3 }, { x: 8, y: 6 },
  { x: 6, y: 8 }, { x: 3, y: 8 }, { x: 1, y: 6 }, { x: 1, y: 3 },
  // c3 positions
  { x: 3, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 6 }, { x: 3, y: 6 },
  // d1 positions
  { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 8, y: 4 }, { x: 8, y: 5 },
  { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 1, y: 5 }, { x: 1, y: 4 },
  // d3 positions
  { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 },
  { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 5 }, { x: 3, y: 4 },
  // d2 positions
  { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 7, y: 4 }, { x: 7, y: 5 },
  { x: 5, y: 7 }, { x: 4, y: 7 }, { x: 2, y: 5 }, { x: 2, y: 4 },
  // c2 positions
  { x: 3, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 3 }, { x: 7, y: 6 },
  { x: 6, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 6 }, { x: 2, y: 3 },
  // b1 positions (X-squares adjacent to corners)
  { x: 2, y: 1 }, { x: 7, y: 1 }, { x: 8, y: 2 }, { x: 8, y: 7 },
  { x: 7, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 7 }, { x: 1, y: 2 },
  // b2 positions (diagonal to corners)
  { x: 2, y: 2 }, { x: 7, y: 2 }, { x: 7, y: 7 }, { x: 2, y: 7 },
  // Center positions (never playable initially)
  { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 5 },
] as const;

/**
 * Get enemy color
 */
export function getEnemyColor(color: Color): Color {
  return -color as Color;
}

/**
 * Convert point to string (e.g., "a1", "h8")
 */
export function pointToString(p: Point): string {
  return String.fromCharCode('a'.charCodeAt(0) + p.x - 1) + p.y;
}

/**
 * Convert string to point (e.g., "a1" -> {x:1, y:1})
 */
export function stringToPoint(s: string): Point | null {
  if (s.length < 2) return null;
  const x = s.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
  const y = parseInt(s[1], 10);
  if (x < 1 || x > 8 || y < 1 || y > 8) return null;
  return { x, y };
}

/**
 * Check if two points are equal
 */
export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Create a point
 */
export function createPoint(x: number, y: number): Point {
  return { x, y };
}

/**
 * Create a disc
 */
export function createDisc(x: number, y: number, color: Color): Disc {
  return { x, y, color };
}

/**
 * Create a move
 */
export function createMove(x: number, y: number, evalScore: number = 0): Move {
  return { x, y, eval: evalScore };
}

/**
 * Powers of 3 for index calculation (3^0 to 3^7)
 */
export const POWER3: readonly number[] = [1, 3, 9, 27, 81, 243, 729, 2187] as const;

/**
 * Calculate line index from colors
 * Each position contributes (color + 1) * 3^position to the index
 */
export function calculateLineIndex(colors: Color[]): number {
  let index = 0;
  for (let i = 0; i < colors.length && i < BOARD_SIZE; i++) {
    index += (colors[i] + 1) * POWER3[i];
  }
  return index;
}
