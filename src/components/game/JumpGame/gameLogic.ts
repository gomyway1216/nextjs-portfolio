/**
 * JumpGame game logic - pure functions separated from UI.
 *
 * These functions carry no React/DOM state so they can be unit-tested in
 * isolation (see tests/unit/components/game/JumpGame).
 */

import { Difficulty } from '../common/types';
import { Enemy, EnemyType, GAME_CONSTANTS, Powerup } from './types';

const { HEIGHT_MAP } = GAME_CONSTANTS;

/**
 * Get difficulty multiplier for enemy speed.
 */
export const getDifficultyMultiplier = (difficulty: Difficulty): number => {
  switch (difficulty) {
    case 'easy':
      return 0.7;
    case 'medium':
      return 1.0;
    case 'hard':
      return 1.5;
    default:
      return 1.0;
  }
};

/**
 * Which obstacle heights are allowed for a given difficulty/stage.
 * Easy mode eases players in with ground-only, then ground-heavy stages.
 */
export const getAllowedEnemyTypes = (
  stage: number,
  difficulty: Difficulty
): EnemyType[] => {
  if (difficulty === 'easy' && stage === 1) {
    return ['ground'];
  }
  if (difficulty === 'easy' && stage < 5) {
    return ['ground', 'ground', 'ground', 'mid'];
  }
  return ['ground', 'mid', 'high'];
};

/**
 * Create a new enemy with random properties, avoiding both height and
 * horizontal collisions with existing enemies so the field stays fair.
 */
export const createEnemy = (
  baseSpeed: number,
  stage: number,
  difficulty: Difficulty,
  existingEnemies?: Enemy[],
  rng: () => number = Math.random
): Enemy => {
  const types = getAllowedEnemyTypes(stage, difficulty);

  const occupiedHeights = new Set<number>();
  (existingEnemies ?? []).forEach((enemy) => occupiedHeights.add(enemy.y));

  let availableTypes = types.filter(
    (type) => !occupiedHeights.has(HEIGHT_MAP[type])
  );

  if (availableTypes.length === 0) {
    const allTypes: EnemyType[] = ['ground', 'mid', 'high'];
    availableTypes = allTypes.filter(
      (type) => !occupiedHeights.has(HEIGHT_MAP[type])
    );
    if (availableTypes.length === 0) {
      availableTypes = ['ground'];
    }
  }

  const type = availableTypes[Math.floor(rng() * availableTypes.length)];

  // Per-difficulty speed variation, tightened so nothing feels unfair.
  let speedVariation: number;
  if (difficulty === 'easy') {
    speedVariation = baseSpeed * (0.95 + rng() * 0.1);
  } else if (difficulty === 'medium') {
    speedVariation = baseSpeed * (0.85 + rng() * 0.3);
  } else {
    speedVariation = baseSpeed * (0.7 + rng() * 0.6);
  }

  const speed = speedVariation + (stage - 1) * 0.3;

  // Horizontal spawn spacing so obstacles never cluster on top of each other.
  let spawnX = 600;
  const minDistance = 250;
  if (existingEnemies && existingEnemies.length > 0) {
    let attemptCount = 0;
    let validPosition = false;
    while (!validPosition && attemptCount < 10) {
      spawnX = 600 + rng() * 300;
      validPosition = existingEnemies.every(
        (enemy) => Math.abs(spawnX - enemy.x) >= minDistance
      );
      attemptCount++;
    }
    if (!validPosition) {
      spawnX = 900;
    }
  }

  return {
    x: spawnX,
    y: HEIGHT_MAP[type],
    r: GAME_CONSTANTS.ENEMY_RADIUS,
    speed,
    type,
  };
};

/**
 * Circle-vs-circle collision (used for round powerups).
 */
export const checkCollision = (
  charX: number,
  charY: number,
  charR: number,
  objX: number,
  objY: number,
  objR: number
): boolean => {
  const diffX = charX - objX;
  const diffY = charY - objY;
  // Compare squared distances to skip the per-frame sqrt.
  const combinedRadius = charR + objR;
  return diffX * diffX + diffY * diffY < combinedRadius * combinedRadius;
};

/**
 * Circle-vs-axis-aligned-square collision. Enemies are drawn as squares, so
 * treating them as circles made corners unfairly forgiving. This closest-point
 * test is pixel-accurate to the rendered hitbox.
 *
 * @param halfSize half the side length of the square (square spans objR*2).
 */
export const checkCircleSquareCollision = (
  charX: number,
  charY: number,
  charR: number,
  squareX: number,
  squareY: number,
  halfSize: number
): boolean => {
  const closestX = Math.max(squareX - halfSize, Math.min(charX, squareX + halfSize));
  const closestY = Math.max(squareY - halfSize, Math.min(charY, squareY + halfSize));
  const dx = charX - closestX;
  const dy = charY - closestY;
  return dx * dx + dy * dy < charR * charR;
};

/**
 * Update enemy positions (immutable). `dt` normalises to 60fps so the game
 * feels identical on 60/120/144Hz displays.
 */
export const updateEnemies = (
  enemies: Enemy[],
  slowMoMultiplier: number,
  dt = 1
): Enemy[] =>
  enemies
    .map((enemy) => ({
      ...enemy,
      x: enemy.x - enemy.speed * slowMoMultiplier * dt,
    }))
    .filter((enemy) => enemy.x >= -100);

/**
 * Update powerup positions (immutable, delta-time aware).
 */
export const updatePowerups = (
  powerups: Powerup[],
  baseSpeed: number,
  slowMoMultiplier: number,
  dt = 1
): Powerup[] =>
  powerups
    .map((powerup) => ({
      ...powerup,
      x: powerup.x - baseSpeed * slowMoMultiplier * dt,
    }))
    .filter((powerup) => powerup.x >= -50);

/**
 * Points awarded for clearing one obstacle, scaled by the current combo.
 * Combo 0/1 -> base points; each additional chained dodge adds a 10% bonus,
 * capped at +150% so scoring stays readable.
 */
export const dodgePoints = (combo: number): number => {
  const multiplier = 1 + Math.min(Math.max(combo, 0) * 0.1, 1.5);
  return Math.round(GAME_CONSTANTS.BASE_DODGE_POINTS * multiplier);
};

/**
 * Stage derived purely from score, so it can never drift out of sync with
 * the fragile `score % 500 === 0` check the old code relied on.
 */
export const stageForScore = (score: number): number =>
  Math.floor(Math.max(score, 0) / GAME_CONSTANTS.STAGE_SCORE_STEP) + 1;

/**
 * Calculate max concurrent enemies for the current stage (capped at 3 heights).
 */
export const getMaxEnemies = (stage: number, difficulty: Difficulty): number => {
  if (difficulty === 'easy') {
    return Math.min(2, 1 + Math.floor(stage / 5));
  }
  return Math.min(3, Math.floor(stage / 3) + 1);
};

/**
 * Jump launch velocity/gravity. Kept as a helper so physics tuning lives in
 * one place and is testable.
 */
export const getJumpImpulse = (): { speed: number; acceleration: number } => ({
  speed: GAME_CONSTANTS.JUMP_SPEED,
  acceleration: GAME_CONSTANTS.JUMP_GRAVITY,
});
