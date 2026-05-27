import { describe, expect, it } from 'vitest';
import {
  checkCollision,
  getDifficultyMultiplier,
  getMaxEnemies,
  updateEnemies,
  updatePowerups,
} from '@/components/game/JumpGame/gameLogic';

describe('JumpGame gameLogic', () => {
  it('maps difficulty to enemy speed multiplier', () => {
    expect(getDifficultyMultiplier('easy')).toBe(0.7);
    expect(getDifficultyMultiplier('medium')).toBe(1);
    expect(getDifficultyMultiplier('hard')).toBe(1.5);
    expect(getDifficultyMultiplier('master')).toBe(1);
  });

  it('detects circular collisions by radius overlap', () => {
    expect(checkCollision(0, 0, 10, 15, 0, 10)).toBe(true);
    expect(checkCollision(0, 0, 10, 20, 0, 10)).toBe(false);
  });

  it('updates moving objects and drops offscreen entries', () => {
    expect(updateEnemies([
      { x: 50, y: 400, r: 20, speed: 5, type: 'ground' },
      { x: -100, y: 320, r: 20, speed: 1, type: 'mid' },
    ], 2).map((enemy) => enemy.x)).toEqual([40]);

    expect(updatePowerups([
      { x: 10, y: 200, r: 16, type: 'slowmo' },
      { x: -50, y: 200, r: 16, type: 'shield' },
    ], 10, 1).map((powerup) => powerup.x)).toEqual([0]);
  });

  it('caps max enemies by stage and difficulty', () => {
    expect(getMaxEnemies(1, 'easy')).toBe(1);
    expect(getMaxEnemies(10, 'easy')).toBe(2);
    expect(getMaxEnemies(9, 'hard')).toBe(3);
  });
});
