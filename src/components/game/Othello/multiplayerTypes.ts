/**
 * Othello - Multiplayer Types
 */

import { Color, Point, BLACK, WHITE } from './types';
import {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';

// Othello-specific player info
export interface OthelloPlayer extends BasePlayer {
  color: Color; // BLACK or WHITE
  score: number; // Current disc count
}

// Othello board state for network sync
export interface OthelloNetworkState {
  // Board represented as array of 64 cells (8x8)
  // Values: 0 = empty, 1 = black, -1 = white
  board: number[];
  currentTurn: Color;
  blackCount: number;
  whiteCount: number;
  lastMove: Point | null;
  validMoves: Point[];
  gameOver: boolean;
  winner: Color | null;
  turnNumber: number;
  lastUpdate: number;
}

// Othello game room
export interface OthelloGameRoom extends BaseGameRoom<OthelloNetworkState> {
  gameType: 'othello';
  players: { [key: string]: OthelloPlayer };
}

// Move action sent to Firebase
export interface OthelloMoveAction {
  playerId: string;
  move: Point;
  timestamp: number;
}

// Convert board to network format (64 cells array)
export function boardToNetwork(getBoardColor: (x: number, y: number) => Color): number[] {
  const result: number[] = [];
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 8; x++) {
      result.push(getBoardColor(x, y));
    }
  }
  return result;
}

// Get color from network board
export function getNetworkBoardColor(board: number[], x: number, y: number): Color {
  const index = (y - 1) * 8 + (x - 1);
  return board[index] as Color;
}

// Assign colors to players (host is always black, goes first)
export function assignPlayerColors(
  hostId: string,
  playerId: string
): { myColor: Color; opponentColor: Color } {
  if (playerId === hostId) {
    return { myColor: BLACK, opponentColor: WHITE };
  }
  return { myColor: WHITE, opponentColor: BLACK };
}

// Check if it's the current player's turn
export function isMyTurn(
  gameState: OthelloNetworkState,
  myColor: Color
): boolean {
  return gameState.currentTurn === myColor && !gameState.gameOver;
}
