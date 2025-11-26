/**
 * Space Invaders - Types and Constants
 */

// Canvas dimensions
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

// Player settings
export const PLAYER_WIDTH = 50;
export const PLAYER_HEIGHT = 30;
export const PLAYER_SPEED = 8;
export const PLAYER_Y = CANVAS_HEIGHT - 50;
export const PLAYER_SHOOT_COOLDOWN = 300; // ms

// Bullet settings
export const BULLET_WIDTH = 4;
export const BULLET_HEIGHT = 15;
export const BULLET_SPEED = 10;
export const ENEMY_BULLET_SPEED = 5;

// Enemy settings
export const ENEMY_ROWS = 5;
export const ENEMY_COLS = 11;
export const ENEMY_WIDTH = 40;
export const ENEMY_HEIGHT = 30;
export const ENEMY_PADDING = 15;
export const ENEMY_OFFSET_TOP = 80;
export const ENEMY_OFFSET_LEFT = (CANVAS_WIDTH - (ENEMY_COLS * (ENEMY_WIDTH + ENEMY_PADDING) - ENEMY_PADDING)) / 2;
export const ENEMY_MOVE_DOWN = 10; // Reduced from 20 - enemies drop less each time
export const INITIAL_ENEMY_SPEED = 0.5; // Reduced from 1 - slower initial speed
export const ENEMY_SPEED_INCREASE = 0.1; // Reduced from 0.3 - slower level scaling
export const ENEMY_SHOOT_CHANCE = 0.001; // Reduced from 0.002 - enemies shoot less often

// UFO settings
export const UFO_WIDTH = 60;
export const UFO_HEIGHT = 25;
export const UFO_SPEED = 3;
export const UFO_SPAWN_CHANCE = 0.001;
export const UFO_POINTS = [50, 100, 150, 300];

// Shield settings
export const SHIELD_COUNT = 4;
export const SHIELD_WIDTH = 70;
export const SHIELD_HEIGHT = 50;
export const SHIELD_Y = CANVAS_HEIGHT - 130;
export const SHIELD_BLOCK_SIZE = 5;

// Lives
export const INITIAL_LIVES = 3;

// Enemy types with colors and points
export enum EnemyType {
  SQUID = 0,    // Top row - 30 points
  CRAB = 1,     // Middle rows - 20 points
  OCTOPUS = 2,  // Bottom rows - 10 points
}

export interface EnemyConfig {
  type: EnemyType;
  points: number;
  color: string;
  accentColor: string;
}

export const ENEMY_CONFIGS: EnemyConfig[] = [
  { type: EnemyType.SQUID, points: 30, color: '#a855f7', accentColor: '#c084fc' },
  { type: EnemyType.CRAB, points: 20, color: '#3b82f6', accentColor: '#60a5fa' },
  { type: EnemyType.OCTOPUS, points: 10, color: '#22c55e', accentColor: '#4ade80' },
];

// Game objects
export interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  lastShot: number;
}

export interface Bullet {
  x: number;
  y: number;
  width: number;
  height: number;
  isEnemy: boolean;
}

export interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  type: EnemyType;
  config: EnemyConfig;
  active: boolean;
  animFrame: number;
}

export interface UFO {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: number; // 1 or -1
  points: number;
  active: boolean;
}

export interface ShieldBlock {
  x: number;
  y: number;
  active: boolean;
}

export interface Shield {
  blocks: ShieldBlock[];
}

export interface EnemyFormation {
  enemies: Enemy[];
  direction: number; // 1 = right, -1 = left
  speed: number;
  moveDown: boolean;
}

// Sound events that occurred during a frame
export interface SoundEvents {
  playerShoot: boolean;
  enemyHit: boolean;
  playerHit: boolean;
  ufoSpawn: boolean;
  ufoHit: boolean;
  enemyShoot: boolean;
  levelComplete: boolean;
  gameOver: boolean;
  enemyMarch: boolean;
  marchPitch: number;
}

export function createSoundEvents(): SoundEvents {
  return {
    playerShoot: false,
    enemyHit: false,
    playerHit: false,
    ufoSpawn: false,
    ufoHit: false,
    enemyShoot: false,
    levelComplete: false,
    gameOver: false,
    enemyMarch: false,
    marchPitch: 0,
  };
}

export interface GameState {
  player: Player;
  bullets: Bullet[];
  formation: EnemyFormation;
  ufo: UFO | null;
  shields: Shield[];
  score: number;
  highScore: number;
  lives: number;
  level: number;
  gameOver: boolean;
  victory: boolean;
  isPaused: boolean;
  animationTick: number;
  marchCounter: number; // For enemy march sound timing
}

// Input state
export interface InputState {
  left: boolean;
  right: boolean;
  shoot: boolean;
}
