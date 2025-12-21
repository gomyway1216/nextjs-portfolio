/**
 * Doubt (ダウト) - Multiplayer Types
 */

import type { CardRank } from './types';
import type { Card } from './types';
import type {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';

export type DoubtPhase = 'play' | 'challenge' | 'finished';

export type DoubtLogEntryType = 'start' | 'play' | 'accept' | 'doubt' | 'resolve' | 'finish';

export interface DoubtLogEntry {
  id: string;
  type: DoubtLogEntryType;
  playerId: string;
  detail?: string;
  declaredRank?: CardRank;
  count?: number;
  // For resolve entries
  claimTruth?: boolean;
  pileTakerId?: string;
  timestamp: number;
}

export interface DoubtClaim {
  playerId: string;
  declaredRank: CardRank;
  cardIds: string[];
  cardCount: number;
  wentOut: boolean;
  timestamp: number;
}

export interface DoubtNetworkState {
  version: 1;
  phase: DoubtPhase;
  playerOrder: string[];
  hands: Record<string, Card[]>;
  pile: Card[];
  pendingClaim: DoubtClaim | null;
  currentTurnPlayerId: string;
  requiredRank: CardRank;
  finishedOrder: string[];
  finished: boolean;
  winnerId: string | null;
  ranks: Record<string, number> | null;
  startedAt: number;
  log: DoubtLogEntry[];
  lastUpdate: number;
}

export type DoubtAction =
  | {
    actionId: string;
    type: 'play';
    playerId: string;
    cardIds: string[];
    timestamp: number;
  }
  | {
    actionId: string;
    type: 'accept';
    playerId: string;
    timestamp: number;
  }
  | {
    actionId: string;
    type: 'doubt';
    playerId: string;
    timestamp: number;
  };

export type DoubtPlayer = BasePlayer;

export interface DoubtGameRoom extends BaseGameRoom<DoubtNetworkState> {
  gameType: 'doubt';
  players: { [key: string]: DoubtPlayer };
  pendingAction?: DoubtAction | null;
}

