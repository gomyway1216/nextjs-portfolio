/**
 * JumpGame game logic - pure functions separated from UI
 */

import { Enemy, Powerup, GameState, GAME_CONSTANTS } from './types';
import { Difficulty } from '../common/types';

/**
 * Get difficulty multiplier for enemy speed
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
 * Create a new enemy with random properties
 */
export const createEnemy = (
  baseSpeed: number,
  stage: number,
  difficulty: Difficulty,
  existingEnemies?: Enemy[]
): Enemy => {
  const heightMap: Record<'ground' | 'mid' | 'high', number> = {
    ground: 400,
    mid: 320,
    high: 240,
  };

  let types: ('ground' | 'mid' | 'high')[] = ['ground', 'mid', 'high'];

  // Easy mode: only ground obstacles for stage 1
  if (difficulty === 'easy' && stage === 1) {
    types = ['ground'];
  } else if (difficulty === 'easy' && stage < 5) {
    types = ['ground', 'ground', 'ground', 'mid'];
  }

  // Get heights of existing enemies
  const occupiedHeights = new Set<number>();
  if (existingEnemies && existingEnemies.length > 0) {
    existingEnemies.forEach(enemy => {
      occupiedHeights.add(enemy.y);
    });
  }

  // Filter out occupied heights
  let availableTypes = types.filter(type => !occupiedHeights.has(heightMap[type]));

  if (availableTypes.length === 0) {
    const allTypes: ('ground' | 'mid' | 'high')[] = ['ground', 'mid', 'high'];
    availableTypes = allTypes.filter(type => !occupiedHeights.has(heightMap[type]));
    if (availableTypes.length === 0) {
      availableTypes = ['ground'];
    }
  }

  const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];

  // Speed variation based on difficulty
  let speedVariation: number;
  if (difficulty === 'easy') {
    speedVariation = baseSpeed * (0.95 + Math.random() * 0.1);
  } else if (difficulty === 'medium') {
    speedVariation = baseSpeed * (0.85 + Math.random() * 0.3);
  } else {
    speedVariation = baseSpeed * (0.7 + Math.random() * 0.6);
  }

  const speed = speedVariation + (stage - 1) * 0.3;

  // Calculate spawn position with minimum distance
  let spawnX = 600;
  const minDistance = 250;

  if (existingEnemies && existingEnemies.length > 0) {
    let attemptCount = 0;
    let validPosition = false;

    while (!validPosition && attemptCount < 10) {
      spawnX = 600 + Math.random() * 300;
      validPosition = true;

      for (const enemy of existingEnemies) {
        const distance = Math.abs(spawnX - enemy.x);
        if (distance < minDistance) {
          validPosition = false;
          break;
        }
      }
      attemptCount++;
    }

    if (!validPosition) {
      spawnX = 900;
    }
  }

  return {
    x: spawnX,
    y: heightMap[type],
    r: GAME_CONSTANTS.ENEMY_RADIUS,
    speed: speed,
    type: type,
  };
};

/**
 * Check collision between character and object
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
  const distance = Math.sqrt(diffX * diffX + diffY * diffY);
  return distance < charR + objR;
};

/**
 * Update enemy positions
 */
export const updateEnemies = (
  enemies: Enemy[],
  slowMoMultiplier: number
): Enemy[] => {
  return enemies.map(enemy => ({
    ...enemy,
    x: enemy.x - enemy.speed * slowMoMultiplier
  })).filter(enemy => enemy.x >= -100);
};

/**
 * Update powerup positions
 */
export const updatePowerups = (
  powerups: Powerup[],
  baseSpeed: number,
  slowMoMultiplier: number
): Powerup[] => {
  return powerups.map(powerup => ({
    ...powerup,
    x: powerup.x - baseSpeed * slowMoMultiplier
  })).filter(powerup => powerup.x >= -50);
};

/**
 * Calculate max enemies for current stage
 */
export const getMaxEnemies = (stage: number, difficulty: Difficulty): number => {
  if (difficulty === 'easy') {
    return Math.min(2, 1 + Math.floor(stage / 5));
  }
  return Math.min(3, Math.floor(stage / 3) + 1);
};
