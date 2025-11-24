/**
 * JumpGame-specific types
 */

export enum Scene {
  GameMain = 'GameMain',
  GameOver = 'GameOver',
}

export interface Enemy {
  x: number;
  y: number;
  r: number;
  speed: number;
  type: 'ground' | 'mid' | 'high';
}

export interface Powerup {
  x: number;
  y: number;
  r: number;
  type: 'shield' | 'slow' | 'heart';
}

export interface GameState {
  characterPosX: number;
  characterPosY: number;
  characterR: number;
  speed: number;
  acceleration: number;
  enemies: Enemy[];
  powerups: Powerup[];
  baseSpeed: number;
  score: number;
  scene: Scene;
  frameCount: number;
  bound: boolean;
  stage: number;
  difficulty: string;
  combo: number;
  hasShield: boolean;
  shieldTimer: number;
  slowMoTimer: number;
  lives: number;
  maxLives: number;
  lastHeartSpawn: number;
  invincibilityTimer: number;
}

export const GAME_CONSTANTS = {
  CANVAS_SIZE: 480,
  GROUND_Y: 400,
  CHARACTER_X: 100,
  CHARACTER_RADIUS: 16,
  JUMP_SPEED: -17,
  JUMP_GRAVITY: 0.9,
  ENEMY_RADIUS: 16,
  POWERUP_RADIUS: 12,
  MAX_LIVES: 3,
  HEART_SPAWN_INTERVAL: 1800, // 30 seconds at 60fps
  INVINCIBILITY_FRAMES: 120, // 2 seconds
} as const;
