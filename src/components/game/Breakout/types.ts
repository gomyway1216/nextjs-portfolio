/**
 * Breakout Game - Types and Constants
 */

// Canvas dimensions
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

// Paddle settings
export const PADDLE_WIDTH = 100;
export const PADDLE_HEIGHT = 15;
export const PADDLE_SPEED = 10;
export const PADDLE_Y = CANVAS_HEIGHT - 40;

// Ball settings
export const BALL_RADIUS = 8;
export const INITIAL_BALL_SPEED = 6;
export const MAX_BALL_SPEED = 12;
export const BALL_SPEED_INCREMENT = 0.5;

// Brick settings
export const BRICK_ROWS = 6;
export const BRICK_COLS = 10;
export const BRICK_WIDTH = 70;
export const BRICK_HEIGHT = 25;
export const BRICK_PADDING = 5;
export const BRICK_OFFSET_TOP = 60;
export const BRICK_OFFSET_LEFT = (CANVAS_WIDTH - (BRICK_COLS * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING)) / 2;

// Power-up settings
export const POWERUP_SIZE = 20;
export const POWERUP_SPEED = 3;
export const POWERUP_CHANCE = 0.15; // 15% chance to drop

// Lives
export const INITIAL_LIVES = 3;

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
  duration?: number; // Duration in ms, undefined = permanent
}

export const POWERUP_CONFIGS: PowerUpConfig[] = [
  { type: PowerUpType.EXPAND_PADDLE, color: '#22c55e', symbol: '+', duration: 10000 },
  { type: PowerUpType.SHRINK_PADDLE, color: '#ef4444', symbol: '-', duration: 10000 },
  { type: PowerUpType.MULTI_BALL, color: '#8b5cf6', symbol: 'M' },
  { type: PowerUpType.SLOW_BALL, color: '#3b82f6', symbol: 'S', duration: 8000 },
  { type: PowerUpType.FAST_BALL, color: '#f97316', symbol: 'F', duration: 8000 },
  { type: PowerUpType.EXTRA_LIFE, color: '#ec4899', symbol: '♥' },
];

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
  type: number; // Index into BRICK_TYPES
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

export interface GameState {
  balls: Ball[];
  paddle: Paddle;
  bricks: Brick[];
  powerUps: PowerUp[];
  activeEffects: ActiveEffect[];
  score: number;
  lives: number;
  level: number;
  gameOver: boolean;
  victory: boolean;
  isPaused: boolean;
}

// Input state
export interface InputState {
  left: boolean;
  right: boolean;
}
