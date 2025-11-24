/**
 * Gomoku-specific types
 */

export type Player = 'black' | 'white' | null;

export interface Position {
  row: number;
  col: number;
}

export interface GomokuBoard extends Array<Array<Player>> {}

export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;
export const PLAYER: Player = 'black';
export const AI: Player = 'white';
