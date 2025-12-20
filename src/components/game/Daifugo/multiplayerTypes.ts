/**
 * Daifugo (大富豪) - Multiplayer Types
 */

import type { Card } from './types';
import type {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';

export type DaifugoPlayKind = 'group' | 'straight';

export interface DaifugoPile {
  kind: DaifugoPlayKind;
  cards: Card[];
  count: number;
  rankKey: number; // group: rank, straight: high-rank
  signature: string | null; // used for しばり (shibari)
  playedBy: string;
}

export type DaifugoRank = 'daifugo' | 'fugo' | 'heimin' | 'hinmin' | 'daihinmin';

export const DAIFUGO_RANK_LABEL_JA: Record<DaifugoRank, string> = {
  daifugo: '大富豪',
  fugo: '富豪',
  heimin: '平民',
  hinmin: '貧民',
  daihinmin: '大貧民',
};

export const DAIFUGO_RANK_PRIORITY: Record<DaifugoRank, number> = {
  daifugo: 0,
  fugo: 1,
  heimin: 2,
  hinmin: 3,
  daihinmin: 4,
};

export function daifugoRankToLabel(rank: DaifugoRank): string {
  return DAIFUGO_RANK_LABEL_JA[rank];
}

export interface DaifugoLogEntry {
  id: string;
  type: 'play' | 'pass' | 'trick_end' | 'round_end' | 'next_round';
  playerId: string;
  playKind?: DaifugoPlayKind;
  cardCount?: number;
  rankKey?: number;
  signature?: string | null;
  detail?: string;
  timestamp: number;
}

export interface DaifugoNetworkState {
  version: 2;
  round: number;
  playerOrder: string[];
  hands: Record<string, Card[]>;
  currentTurnPlayerId: string;
  pile: DaifugoPile | null;
  passes: string[];
  lastPlayedBy: string | null;
  finished: boolean; // round finished
  winnerId: string | null;
  finishedOrder: string[];
  forbiddenFinishers: string[];
  ranks: Record<string, DaifugoRank> | null;
  startDaifugoId: string | null;
  revolution: boolean;
  jackBack: boolean;
  lockSignature: string | null;
  lastPlaySignature: string | null;
  gekishibaNextRank: number | null; // 激縛り: expected next rank when active
  startedAt: number;
  log: DaifugoLogEntry[];
  lastUpdate: number;
}

export type DaifugoAction =
  | {
    actionId: string;
    type: 'play';
    playerId: string;
    cardIds: string[];
    giveCardIds?: string[];
    discardCardIds?: string[]; // 10捨て用
    timestamp: number;
  }
  | {
    actionId: string;
    type: 'pass';
    playerId: string;
    timestamp: number;
  };

export type DaifugoPlayer = BasePlayer;

export interface DaifugoGameRoom extends BaseGameRoom<DaifugoNetworkState> {
  gameType: 'daifugo';
  players: { [key: string]: DaifugoPlayer };
  pendingAction?: DaifugoAction | null;
}
