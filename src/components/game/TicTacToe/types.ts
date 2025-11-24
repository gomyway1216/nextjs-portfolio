/**
 * TicTacToe-specific types
 */

export type Player = 'X' | 'O' | null;

export const PLAYER: Player = 'X';
export const AI: Player = 'O';

export interface WinResult {
  winner: Player;
  line: number[] | null;
}
