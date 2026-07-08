/**
 * Breakout Game - Types and Constants
 */

import type { Difficulty } from '../common/types';

// Canvas dimensions (logical game units; the canvas is scaled to fit responsively)
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

// Paddle settings
export const PADDLE_WIDTH = 110;
export const PADDLE_HEIGHT = 16;
export const PADDLE_SPEED = 11;
export const PADDLE_Y = CANVAS_HEIGHT - 44;

// Ball settings
export const BALL_RADIUS = 8;
export const MAX_BALL_SPEED = 15;
// The minimum vertical component so the ball never travels (near) horizontally
// forever and gets "stuck" bouncing between the walls.
export const MIN_VERTICAL_RATIO = 0.28;

// Brick settings
export const BRICK_COLS = 10;
export const BRICK_WIDTH = 70;
export const BRICK_HEIGHT = 26;
export const BRICK_PADDING = 5;
export const BRICK_OFFSET_TOP = 64;
export const BRICK_OFFSET_LEFT =
  (CANVAS_WIDTH - (BRICK_COLS * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING)) / 2;

// Power-up settings
export const POWERUP_SIZE = 22;
export const POWERUP_SPEED = 3;

// Number of levels before victory.
export const MAX_LEVEL = 6;

// Brick types with colors and points
export interface BrickType {
  color: string;
  gradientStart: string;
  gradientEnd: string;
  points: number;
  hits: number; // Hits required to destroy
}

export const BRICK_TYPES: BrickType[] = [
  { color: '#ef4444', gradientStart: '#f87171', gradientEnd: '#dc2626', points: 10, hits: 1 }, // Red
  { color: '#f97316', gradientStart: '#fb923c', gradientEnd: '#ea580c', points: 20, hits: 1 }, // Orange
  { color: '#eab308', gradientStart: '#facc15', gradientEnd: '#ca8a04', points: 30, hits: 1 }, // Yellow
  { color: '#22c55e', gradientStart: '#4ade80', gradientEnd: '#16a34a', points: 40, hits: 1 }, // Green
  { color: '#3b82f6', gradientStart: '#60a5fa', gradientEnd: '#2563eb', points: 50, hits: 1 }, // Blue
  { color: '#8b5cf6', gradientStart: '#a78bfa', gradientEnd: '#7c3aed', points: 60, hits: 1 }, // Purple
];

// A tougher, "steel" brick that needs several hits. Rendered specially.
export const STEEL_BRICK_TYPE = 6;
export const STEEL_BRICK: BrickType = {
  color: '#94a3b8',
  gradientStart: '#cbd5e1',
  gradientEnd: '#64748b',
  points: 80,
  hits: 3,
};

export function getBrickType(index: number): BrickType {
  return index === STEEL_BRICK_TYPE ? STEEL_BRICK : BRICK_TYPES[index];
}

// Difficulty tuning
export interface DifficultyConfig {
  ballSpeed: number; // initial ball speed (units/frame @60fps)
  speedIncrement: number; // added to ball speed each time a brick is destroyed
  lives: number;
  powerUpChance: number; // 0..1 drop chance per destroyed brick
  paddleWidth: number;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: { ballSpeed: 4.6, speedIncrement: 0.015, lives: 5, powerUpChance: 0.22, paddleWidth: 130 },
  medium: { ballSpeed: 5.6, speedIncrement: 0.03, lives: 3, powerUpChance: 0.16, paddleWidth: 110 },
  hard: { ballSpeed: 6.6, speedIncrement: 0.05, lives: 3, powerUpChance: 0.12, paddleWidth: 92 },
  expert: { ballSpeed: 7.6, speedIncrement: 0.07, lives: 2, powerUpChance: 0.1, paddleWidth: 80 },
  master: { ballSpeed: 8.6, speedIncrement: 0.09, lives: 2, powerUpChance: 0.08, paddleWidth: 70 },
};

// Power-up types
export enum PowerUpType {
  EXPAND_PADDLE = 'expand',
  SHRINK_PADDLE = 'shrink',
  MULTI_BALL = 'multi',
  SLOW_BALL = 'slow',
  FAST_BALL = 'fast',
  EXTRA_LIFE = 'life',
}

export interface PowerUpConfig {
  type: PowerUpType;
  color: string;
  symbol: string;
  good: boolean;
  duration?: number; // Duration in ms, undefined = permanent
}

export const POWERUP_CONFIGS: PowerUpConfig[] = [
  { type: PowerUpType.EXPAND_PADDLE, color: '#22c55e', symbol: '+', good: true, duration: 10000 },
  { type: PowerUpType.SHRINK_PADDLE, color: '#ef4444', symbol: '−', good: false, duration: 10000 },
  { type: PowerUpType.MULTI_BALL, color: '#8b5cf6', symbol: '×3', good: true },
  { type: PowerUpType.SLOW_BALL, color: '#3b82f6', symbol: 'S', good: true, duration: 8000 },
  { type: PowerUpType.FAST_BALL, color: '#f97316', symbol: 'F', good: false, duration: 8000 },
  { type: PowerUpType.EXTRA_LIFE, color: '#ec4899', symbol: '♥', good: true },
];

// Weighted draw: good power-ups are more likely than bad ones.
export const POWERUP_WEIGHTS: Record<PowerUpType, number> = {
  [PowerUpType.EXPAND_PADDLE]: 3,
  [PowerUpType.MULTI_BALL]: 3,
  [PowerUpType.SLOW_BALL]: 2,
  [PowerUpType.EXTRA_LIFE]: 1,
  [PowerUpType.SHRINK_PADDLE]: 2,
  [PowerUpType.FAST_BALL]: 2,
};

// Game objects
export interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  speed: number;
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  type: number; // Index into BRICK_TYPES (or STEEL_BRICK_TYPE)
  hits: number; // Remaining hits
  active: boolean;
}

export interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  config: PowerUpConfig;
}

export interface ActiveEffect {
  type: PowerUpType;
  endTime: number;
}

export interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number; // remaining life 0..1
  color: string;
  size: number;
}

export interface GameState {
  balls: Ball[];
  paddle: Paddle;
  bricks: Brick[];
  powerUps: PowerUp[];
  activeEffects: ActiveEffect[];
  particles: Particle[];
  score: number;
  lives: number;
  level: number;
  combo: number; // consecutive brick hits without touching paddle
  gameOver: boolean;
  victory: boolean;
  isPaused: boolean;
  // Ball is held on the paddle until launched (start of level / after losing a life).
  launched: boolean;
  difficulty: Difficulty;
  config: DifficultyConfig;
  flash: number; // screen-flash intensity 0..1 (decays each frame)
}

// Input state
export interface InputState {
  left: boolean;
  right: boolean;
  // Absolute paddle-center target in game units (mouse / touch). null = keyboard only.
  pointerX: number | null;
}
