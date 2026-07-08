/**
 * Reverse Jump - pure game logic (no React, no DOM).
 *
 * The twist: the controls invert on a timer. In NORMAL mode the primary
 * action jumps and the secondary action ducks; in INVERTED mode they swap.
 * Low obstacles must be jumped over, high (overhead) obstacles must be
 * ducked under. The player has to keep re-mapping their reflexes as the
 * mode flips.
 *
 * All positions use a fixed logical playfield (WORLD.width x WORLD.height)
 * with y measured from the top. The renderer scales this to whatever pixel
 * size the canvas ends up being, so the simulation is resolution independent.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export type ObstacleType = 'low' | 'high';
export type ControlMode = 'normal' | 'inverted';

export interface Obstacle {
  id: number;
  x: number;
  /** top edge (world coords, y down) */
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
  scored: boolean;
}

export interface DifficultyConfig {
  /** starting scroll speed in world-units / second */
  baseSpeed: number;
  /** additive speed per point scored */
  speedPerScore: number;
  /** hard speed cap */
  maxSpeed: number;
  /** how long a mode lasts before it flips, ms */
  swapIntervalMs: number;
  /** min gap between obstacle spawns, seconds */
  minSpawnGap: number;
  /** max gap between obstacle spawns, seconds */
  maxSpawnGap: number;
  /** probability a spawned obstacle is an overhead (duck) one */
  highChance: number;
}

export const WORLD = {
  width: 860,
  height: 320,
  groundY: 262,
  playerX: 96,
  playerW: 40,
  standH: 58,
  duckH: 30,
} as const;

/** Physics tuned in world-units and seconds (frame-rate independent). */
export const PHYSICS = {
  /** upward launch velocity (negative = up), units/sec */
  jumpVelocity: -720,
  /** gravity, units/sec^2 */
  gravity: 2100,
  /** extra gravity while falling for a snappier arc */
  fallGravityMultiplier: 1.35,
} as const;

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    baseSpeed: 260,
    speedPerScore: 2.4,
    maxSpeed: 460,
    swapIntervalMs: 11000,
    minSpawnGap: 1.35,
    maxSpawnGap: 2.1,
    highChance: 0.28,
  },
  medium: {
    baseSpeed: 320,
    speedPerScore: 3.2,
    maxSpeed: 560,
    swapIntervalMs: 8000,
    minSpawnGap: 1.0,
    maxSpawnGap: 1.7,
    highChance: 0.38,
  },
  hard: {
    baseSpeed: 380,
    speedPerScore: 4.0,
    maxSpeed: 680,
    swapIntervalMs: 6000,
    minSpawnGap: 0.78,
    maxSpawnGap: 1.35,
    highChance: 0.46,
  },
};

/** Axis-aligned bounding box overlap test. */
export const intersects = (
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

/** Current scroll speed given the score. */
export const speedForScore = (score: number, config: DifficultyConfig): number =>
  Math.min(config.maxSpeed, config.baseSpeed + score * config.speedPerScore);

/**
 * Which physical action does the player need to perform to clear this
 * obstacle, regardless of control mode.
 */
export const requiredAction = (type: ObstacleType): 'jump' | 'duck' =>
  type === 'high' ? 'duck' : 'jump';

/**
 * Given the raw input intent ('primary' or 'secondary') and the current
 * control mode, resolve the physical action the character performs.
 * NORMAL:   primary -> jump,  secondary -> duck
 * INVERTED: primary -> duck,  secondary -> jump
 */
export const resolveAction = (
  intent: 'primary' | 'secondary',
  mode: ControlMode,
): 'jump' | 'duck' => {
  const normal = intent === 'primary' ? 'jump' : 'duck';
  if (mode === 'normal') return normal;
  return normal === 'jump' ? 'duck' : 'jump';
};

let spawnRng: () => number = Math.random;
/** Test seam so obstacle generation can be made deterministic. */
export const __setRng = (fn: () => number) => {
  spawnRng = fn;
};

/**
 * Build a new obstacle entering from the right edge.
 *
 * Geometry is chosen so BOTH obstacle types genuinely require the right
 * action (a long-standing bug in the original was that overhead obstacles
 * sat above the standing player and could never be hit):
 *  - low:  sits on the ground, tall enough that a standing player collides
 *          but a jump clears it.
 *  - high: hangs from above with its lower edge below the standing player's
 *          head, so standing collides and only ducking clears it.
 */
export const createObstacle = (
  id: number,
  config: DifficultyConfig,
): Obstacle => {
  const isHigh = spawnRng() < config.highChance;

  if (isHigh) {
    const height = 30;
    // Lower edge must dip below the standing head so a standing player is hit,
    // but stay above the ducking head so ducking is safe.
    const standHead = WORLD.groundY - WORLD.standH; // 204
    const duckHead = WORLD.groundY - WORLD.duckH; // 232
    const bottom = (standHead + duckHead) / 2; // ~218 -> hits standing, clears duck
    return {
      id,
      x: WORLD.width + 40,
      y: bottom - height,
      width: 58,
      height,
      type: 'high',
      scored: false,
    };
  }

  const height = 46;
  return {
    id,
    x: WORLD.width + 40,
    y: WORLD.groundY - height,
    width: 34,
    height,
    type: 'low',
    scored: false,
  };
};

/** Player collision box for the current pose. */
export const playerBox = (
  playerY: number,
  ducking: boolean,
): { x: number; y: number; w: number; h: number } => {
  const h = ducking ? WORLD.duckH : WORLD.standH;
  return { x: WORLD.playerX, y: playerY - h, w: WORLD.playerW, h };
};

export interface PhysicsResult {
  playerY: number;
  velocityY: number;
  onGround: boolean;
}

/**
 * Advance the player's vertical physics by dt seconds.
 * A jump is only honored when the player is grounded.
 */
export const stepPlayer = (
  playerY: number,
  velocityY: number,
  dt: number,
  wantJump: boolean,
): PhysicsResult => {
  const groundedBefore = playerY >= WORLD.groundY - 0.001;
  let vy = velocityY;

  if (wantJump && groundedBefore) {
    vy = PHYSICS.jumpVelocity;
  }

  const g = vy > 0 ? PHYSICS.gravity * PHYSICS.fallGravityMultiplier : PHYSICS.gravity;
  vy += g * dt;
  let y = playerY + vy * dt;

  let onGround = false;
  if (y >= WORLD.groundY) {
    y = WORLD.groundY;
    vy = 0;
    onGround = true;
  }

  return { playerY: y, velocityY: vy, onGround };
};
