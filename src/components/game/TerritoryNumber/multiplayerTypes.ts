/**
 * Territory Number — multiplayer (RTDB) types.
 */

import type {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';
import type { Board, TerritoryNumberRules } from './types';

export interface TerritoryNumberLogEntry {
  turn: number;        // 1-indexed
  playerId: string;
  card: number;        // 1..9
  cellIndex: number;   // 0..8
  timestamp: number;
}

export interface TerritoryNumberNetworkState {
  version: 1;
  rules: TerritoryNumberRules;
  /** [firstPlayerId, secondPlayerId]; defines who is p1 / p2. */
  playerOrder: string[];
  board: Board;
  /** PlayerId whose turn it is. */
  currentTurnPlayerId: string;
  log: TerritoryNumberLogEntry[];
  finished: boolean;
  /** PlayerId of the winner, or null for a draw / still in progress. */
  winnerId: string | null;
  startedAt: number;
  lastUpdate: number;
}

export interface TerritoryNumberPendingAction {
  actionId: string;
  playerId: string;
  card: number;
  cellIndex: number;
  /** Snapshotted current turn at submission time, lets the host detect stale actions. */
  turn: number;
  timestamp: number;
}

export type TerritoryNumberPlayer = BasePlayer;

export interface TerritoryNumberGameRoom extends BaseGameRoom<TerritoryNumberNetworkState> {
  gameType: 'territory-number';
  players: { [key: string]: TerritoryNumberPlayer };
  rules?: TerritoryNumberRules;
  pendingAction?: TerritoryNumberPendingAction | null;
}
