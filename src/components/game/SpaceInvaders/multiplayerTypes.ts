/**
 * Space Invaders - Multiplayer Types
 * Game-specific types that extend shared multiplayer types
 */

import { EnemyFormation, Shield, UFO, Bullet } from './types';
import {
  GameRoom as BaseGameRoom,
  MultiplayerPlayer as BasePlayer,
} from '@/services/gameRoomService';

// Re-export shared types from the service
export {
  generatePlayerId,
  PLAYER_COLORS,
} from '@/services/gameRoomService';
export type { LobbyState } from '@/services/gameRoomService';

// Space Invaders specific player info
export interface MultiplayerPlayer extends BasePlayer {
  score: number;
  lives: number;
  x: number; // Player position
  color: string; // Player color for identification
}

// Space Invaders game room
export interface GameRoom extends BaseGameRoom<MultiplayerGameState> {
  gameType: 'space-invaders';
  players: { [key: string]: MultiplayerPlayer };
}

// Simplified game state for network sync
export interface MultiplayerGameState {
  formation: {
    enemies: NetworkEnemy[];
    direction: number;
    speed: number;
    moveDown: boolean;
  };
  bullets: NetworkBullet[];
  ufo: NetworkUFO | null;
  shields: NetworkShield[];
  level: number;
  animationTick: number;
  marchCounter: number;
  lastUpdate: number;
}

// Network-optimized enemy (minimal data)
export interface NetworkEnemy {
  x: number;
  y: number;
  type: number;
  active: boolean;
  animFrame: number;
}

// Network-optimized bullet
export interface NetworkBullet {
  x: number;
  y: number;
  isEnemy: boolean;
  ownerId?: string;
}

// Network-optimized UFO
export interface NetworkUFO {
  x: number;
  y: number;
  direction: number;
  points: number;
  active: boolean;
}

// Network-optimized shield
export interface NetworkShield {
  blocks: { x: number; y: number; active: boolean }[];
}

// Convert full game state to network state
export function toNetworkGameState(
  formation: EnemyFormation,
  bullets: Bullet[],
  ufo: UFO | null,
  shields: Shield[],
  level: number,
  animationTick: number,
  marchCounter: number
): MultiplayerGameState {
  return {
    formation: {
      enemies: formation.enemies.map(e => ({
        x: e.x,
        y: e.y,
        type: e.type,
        active: e.active,
        animFrame: e.animFrame,
      })),
      direction: formation.direction,
      speed: formation.speed,
      moveDown: formation.moveDown,
    },
    bullets: bullets.map(b => ({
      x: b.x,
      y: b.y,
      isEnemy: b.isEnemy,
    })),
    ufo: ufo ? {
      x: ufo.x,
      y: ufo.y,
      direction: ufo.direction,
      points: ufo.points,
      active: ufo.active,
    } : null,
    shields: shields.map(s => ({
      blocks: s.blocks.map(b => ({
        x: b.x,
        y: b.y,
        active: b.active,
      })),
    })),
    level,
    animationTick,
    marchCounter,
    lastUpdate: Date.now(),
  };
}
