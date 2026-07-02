import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkCollision,
  createEnemy,
  getDifficultyMultiplier,
  getMaxEnemies,
  updateEnemies,
  updatePowerups,
} from '@/components/game/JumpGame/gameLogic';

describe('JumpGame gameLogic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      { x: 10, y: 200, r: 16, type: 'slow' },
      { x: -50, y: 200, r: 16, type: 'shield' },
    ], 10, 1).map((powerup) => powerup.x)).toEqual([0]);
  });

  it('caps max enemies by stage and difficulty', () => {
    expect(getMaxEnemies(1, 'easy')).toBe(1);
    expect(getMaxEnemies(10, 'easy')).toBe(2);
    expect(getMaxEnemies(9, 'hard')).toBe(3);
  });

  it('creates easy stage-one enemies as ground obstacles', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.5);

    expect(createEnemy(10, 1, 'easy')).toMatchObject({
      x: 600,
      y: 400,
      r: 16,
      speed: 10,
      type: 'ground',
    });
  });

  it('allows early easy stages to pick mid obstacles from the weighted pool', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0);

    expect(createEnemy(10, 4, 'easy')).toMatchObject({
      x: 600,
      y: 320,
      speed: 10.4,
      type: 'mid',
    });
  });

  it('avoids occupied heights and keeps enough spawn distance when possible', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.99);

    expect(createEnemy(10, 2, 'medium', [
      { x: 600, y: 400, r: 16, speed: 5, type: 'ground' },
    ])).toMatchObject({
      x: 897,
      y: 320,
      speed: 10.3,
      type: 'mid',
    });
  });

  it('falls back to a safe spawn when every height and attempted position is blocked', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(createEnemy(10, 2, 'hard', [
      { x: 600, y: 400, r: 16, speed: 5, type: 'ground' },
      { x: 600, y: 320, r: 16, speed: 5, type: 'mid' },
      { x: 600, y: 240, r: 16, speed: 5, type: 'high' },
    ])).toMatchObject({
      x: 900,
      y: 400,
      speed: 7.3,
      type: 'ground',
    });
  });
});
