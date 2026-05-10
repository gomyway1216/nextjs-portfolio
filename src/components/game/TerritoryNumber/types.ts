/**
 * Territory Number — shared types.
 *
 * 3×3 grid territory game. Players draw from a SHARED pool of 1-9 (each
 * number used exactly once across the match) and place onto the board with
 * their own colour. After the board is full, each of the 8 lines (3 rows +
 * 3 cols + 2 diagonals) is scored by summing each player's contributions;
 * the higher sum captures the line, ties capture nothing. Most lines wins.
 */

export type PlayerSlot = 'p1' | 'p2';

export interface BoardCell {
  /** 1..9, or null if empty. */
  value: number | null;
  /** Which player placed it ('p1' | 'p2'), or null if empty. */
  owner: PlayerSlot | null;
}

/** Board is a flat 9-element array indexed `row * 3 + col`. */
export type Board = BoardCell[];

export type FirstPlayerRule = 'host' | 'guest' | 'random';

export interface TerritoryNumberRules {
  firstPlayer: FirstPlayerRule;
}

export const DEFAULT_RULES: TerritoryNumberRules = {
  firstPlayer: 'host',
};

export type LineWinner = PlayerSlot | null; // null = tied / unowned line

export interface LineResult {
  /** Indices into `Board` for the 3 cells that make up this line. */
  cells: readonly [number, number, number];
  /** Sum of p1's cards on this line. */
  p1Sum: number;
  /** Sum of p2's cards on this line. */
  p2Sum: number;
  /** Owner of the line — null if tied or no cards from either side. */
  winner: LineWinner;
}

export interface BoardEvaluation {
  lines: LineResult[];
  p1Captures: number;
  p2Captures: number;
}

export type AIDifficulty = 'easy' | 'medium' | 'hard';

/** All 9 numbers, used as the shared draw pool. */
export const ALL_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * The 8 lines of a 3×3 board.
 * Order matters for tests / replay logs but not for game logic.
 */
export const LINES: readonly (readonly [number, number, number])[] = [
  // rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // diagonals
  [0, 4, 8],
  [2, 4, 6],
];
