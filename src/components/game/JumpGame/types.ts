/**
 * JumpGame-specific types
 */

export enum Scene {
  GameMain = 'GameMain',
  GameOver = 'GameOver',
}

export type EnemyType = 'ground' | 'mid' | 'high';
export type PowerupType = 'shield' | 'slow' | 'heart';

export interface Enemy {
  x: number;
  y: number;
  r: number;
  speed: number;
  type: EnemyType;
}

export interface Powerup {
  x: number;
  y: number;
  r: number;
  type: PowerupType;
}

export interface GameState {
  characterPosX: number;
  characterPosY: number;
  characterR: number;
  /** vertical velocity in px/frame (60fps-normalised) */
  speed: number;
  /** vertical acceleration (gravity) in px/frame^2 */
  acceleration: number;
  enemies: Enemy[];
  powerups: Powerup[];
  baseSpeed: number;
  score: number;
  scene: Scene;
  frameCount: number;
  stage: number;
  difficulty: string;
  combo: number;
  bestCombo: number;
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
  GROUND_LINE_Y: 420,
  CHARACTER_X: 100,
  CHARACTER_RADIUS: 16,
  JUMP_SPEED: -17,
  JUMP_GRAVITY: 0.9,
  ENEMY_RADIUS: 16,
  POWERUP_RADIUS: 12,
  MAX_LIVES: 3,
  HEART_SPAWN_INTERVAL: 1800, // 30 seconds at 60fps
  INVINCIBILITY_FRAMES: 120, // 2 seconds
  SHIELD_FRAMES: 300, // 5 seconds
  SLOWMO_FRAMES: 180, // 3 seconds
  SLOWMO_FACTOR: 0.5,
  /** points awarded for clearing an obstacle (before combo bonus) */
  BASE_DODGE_POINTS: 100,
  /** score threshold that advances a stage */
  STAGE_SCORE_STEP: 500,
  /** enemy spawn heights keyed by type */
  HEIGHT_MAP: { ground: 400, mid: 320, high: 240 } as Record<EnemyType, number>,
} as const;
