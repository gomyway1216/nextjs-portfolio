/**
 * Shichinarabe (七並べ) - Multiplayer Types
 */

import type { CardSuit } from './types';
import type { Card } from './types';
import type {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';

export interface ShichinarabeSuitBounds {
  low: number;
  high: number;
}

export type ShichinarabeLogEntryType = 'start' | 'play' | 'pass' | 'eliminate' | 'finish';

export interface ShichinarabeLogEntry {
  id: string;
  type: ShichinarabeLogEntryType;
  playerId: string;
  card?: { suit: CardSuit; rank: number };
  passCount?: number;
  detail?: string;
  timestamp: number;
}

export interface ShichinarabeNetworkState {
  version: 1;
  playerOrder: string[];
  hands: Record<string, Card[]>;
  table: Record<CardSuit, ShichinarabeSuitBounds>;
  currentTurnPlayerId: string;
  passCounts: Record<string, number>;
  maxPasses: number;
  finishedOrder: string[];
  eliminatedOrder: string[];
  finished: boolean;
  winnerId: string | null;
  resultOrder: string[];
  ranks: Record<string, number> | null; // 1-based place
  startedAt: number;
  log: ShichinarabeLogEntry[];
  lastUpdate: number;
}

export type ShichinarabeAction =
  | {
    actionId: string;
    type: 'play';
    playerId: string;
    cardId: string;
    timestamp: number;
  }
  | {
    actionId: string;
    type: 'pass';
    playerId: string;
    timestamp: number;
  };

export type ShichinarabePlayer = BasePlayer;

export interface ShichinarabeGameRoom extends BaseGameRoom<ShichinarabeNetworkState> {
  gameType: 'shichinarabe';
  players: { [key: string]: ShichinarabePlayer };
  pendingAction?: ShichinarabeAction | null;
}

