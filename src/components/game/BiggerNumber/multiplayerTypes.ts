/**
 * Bigger Number — multiplayer (RTDB) types.
 */

import type {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';
import type { BiggerNumberRules, CardValue } from './types';

export interface BiggerNumberRoundLog {
  round: number;
  p1Id: string;
  p2Id: string;
  p1Card: CardValue;
  p2Card: CardValue;
  winnerId: string | null; // null for tie
  involvedDragon: boolean;
  cardsReturnedToHand: boolean;
  timestamp: number;
}

export interface BiggerNumberLastReveal {
  round: number;
  picks: Record<string, CardValue>; // playerId -> card
  winnerId: string | null;
  involvedDragon: boolean;
  cardsReturnedToHand: boolean;
  revealedAt: number;
}

export interface BiggerNumberNetworkState {
  version: 1;
  rules: BiggerNumberRules;
  playerOrder: string[]; // [p1Id, p2Id]
  round: number; // 1-indexed
  scores: Record<string, number>;
  hands: Record<string, CardValue[]>;
  lastReveal: BiggerNumberLastReveal | null;
  log: BiggerNumberRoundLog[];
  finished: boolean;
  winnerId: string | null; // null if draw or in progress
  startedAt: number;
  lastUpdate: number;
}

export interface BiggerNumberPendingPick {
  actionId: string;
  playerId: string;
  card: CardValue;
  round: number;
  timestamp: number;
}

export type BiggerNumberPendingActions = Record<string, BiggerNumberPendingPick>;

export type BiggerNumberPlayer = BasePlayer;

export interface BiggerNumberGameRoom extends BaseGameRoom<BiggerNumberNetworkState> {
  gameType: 'bigger-number';
  players: { [key: string]: BiggerNumberPlayer };
  rules?: BiggerNumberRules;
  pendingActions?: BiggerNumberPendingActions | null;
}
