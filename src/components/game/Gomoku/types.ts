/**
 * Gomoku-specific types
 */

export type Player = 'black' | 'white' | null;

export interface Position {
  row: number;
  col: number;
}

export type GomokuBoard = Array<Array<Player>>;

export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;
export const PLAYER: Player = 'black';
export const AI: Player = 'white';

/** The four line directions (only forward halves; the backward half is the mirror). */
export const DIRECTIONS: ReadonlyArray<{ dr: number; dc: number }> = [
  { dr: 0, dc: 1 }, // horizontal
  { dr: 1, dc: 0 }, // vertical
  { dr: 1, dc: 1 }, // diagonal down-right \
  { dr: 1, dc: -1 }, // diagonal down-left /
];
