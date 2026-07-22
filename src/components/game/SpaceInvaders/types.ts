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
export const ENEMY_MOVE_DOWN = 10; // pixels dropped each time the formation reverses
export const INITIAL_ENEMY_SPEED = 0.5;
export const ENEMY_SPEED_INCREASE = 0.12; // per-level speed scaling
export const ENEMY_SHOOT_CHANCE = 0.0012; // base per-shooter, per-frame chance

// Each new wave starts a little lower than the last (classic descending waves),
// clamped so it never spawns on top of the shields.
export const WAVE_DESCENT_STEP = 14;
export const MAX_WAVE_DESCENT = WAVE_DESCENT_STEP * 6;

// UFO settings
export const UFO_WIDTH = 60;
export const UFO_HEIGHT = 25;
export const UFO_SPEED = 3;
export const UFO_SPAWN_CHANCE = 0.0012;
export const UFO_POINTS = [50, 100, 150, 300];

// Shield settings
export const SHIELD_COUNT = 4;
export const SHIELD_WIDTH = 70;
export const SHIELD_HEIGHT = 50;
export const SHIELD_Y = CANVAS_HEIGHT - 130;
export const SHIELD_BLOCK_SIZE = 5;

// Lives
export const INITIAL_LIVES = 3;
export const MAX_LIVES = 5;
// Award an extra life every time the score crosses this threshold.
export const EXTRA_LIFE_EVERY = 1500;

// Difficulty tiers -------------------------------------------------------
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultySettings {
  /** Multiplier on formation march speed. */
  speedMultiplier: number;
  /** Multiplier on enemy fire rate. */
  fireRateMultiplier: number;
  /** Starting lives. */
  startingLives: number;
  /** Multiplier on enemy bullet fall speed. */
  bulletSpeedMultiplier: number;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  easy: {
    speedMultiplier: 0.8,
    fireRateMultiplier: 0.6,
    startingLives: 4,
    bulletSpeedMultiplier: 0.85,
  },
  normal: {
    speedMultiplier: 1,
    fireRateMultiplier: 1,
    startingLives: 3,
    bulletSpeedMultiplier: 1,
  },
  hard: {
    speedMultiplier: 1.3,
    fireRateMultiplier: 1.6,
    startingLives: 2,
    bulletSpeedMultiplier: 1.25,
  },
};

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
  /**
   * Multiplayer only: bullet mirrored from the host's published game state
   * rather than fired locally. On the joiner, remote enemy bullets can hit the
   * local ship; remote player bullets are purely cosmetic (their hits resolve
   * on the host). Never set in single-player.
   */
  remote?: boolean;
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
  extraLife: boolean;
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
    extraLife: false,
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
  difficulty: Difficulty;
  /** Score threshold for the next extra life. */
  nextExtraLifeAt: number;
  gameOver: boolean;
  isPaused: boolean;
  animationTick: number;
  marchCounter: number; // For enemy march sound timing
  /**
   * Multiplayer (joiner) only: enemy-bullet hits are ignored until this
   * timestamp after a respawn. The joiner can't clear the host-owned enemy
   * fire on death (the next snapshot would bring it back), so a short
   * invulnerability window replaces single-player's bullet clear.
   */
  invulnUntil?: number;
}

// Input state
export interface InputState {
  left: boolean;
  right: boolean;
  shoot: boolean;
}
