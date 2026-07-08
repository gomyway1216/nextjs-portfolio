import { describe, expect, it } from 'vitest';
import {
  checkCircleSquareCollision,
  checkCollision,
  dodgePoints,
  getAllowedEnemyTypes,
  getJumpImpulse,
  stageForScore,
  updateEnemies,
  updatePowerups,
} from '@/components/game/JumpGame/gameLogic';
import { GAME_CONSTANTS } from '@/components/game/JumpGame/types';
import type { Enemy, Powerup } from '@/components/game/JumpGame/types';

describe('checkCircleSquareCollision (fair square hitbox)', () => {
  const half = GAME_CONSTANTS.ENEMY_RADIUS;

  it('collides when the circle center is inside the square', () => {
    expect(checkCircleSquareCollision(200, 200, 16, 200, 200, half)).toBe(true);
  });

  it('collides on a flat-edge approach within radius', () => {
    expect(checkCircleSquareCollision(300, 300 - half - 10, 16, 300, 300, half)).toBe(true);
  });

  it('catches edge/corner grazes the naive circle-vs-circle test misses', () => {
    const sqX = 300;
    const sqY = 300;
    // The rendered obstacle is a square, so its true reach extends to the
    // corners (~22.6px from center) — further than the inscribed r=16 circle.
    // A character grazing the corner therefore collides with the square but is
    // (wrongly) cleared by the old circle-vs-circle test.
    const charX = sqX + half + 9; // just past the corner, diagonally
    const charY = sqY + half + 9;
    expect(checkCircleSquareCollision(charX, charY, 16, sqX, sqY, half)).toBe(true);
    // Old behaviour would have missed this graze.
    expect(checkCollision(charX, charY, 16, sqX, sqY, half)).toBe(false);
  });
});

describe('dodgePoints (combo-scaled scoring)', () => {
  it('awards base points with no combo', () => {
    expect(dodgePoints(0)).toBe(GAME_CONSTANTS.BASE_DODGE_POINTS);
    expect(dodgePoints(1)).toBe(110);
  });

  it('rewards longer combos', () => {
    expect(dodgePoints(5)).toBeGreaterThan(dodgePoints(1));
  });

  it('caps the multiplier at +150%', () => {
    expect(dodgePoints(100)).toBe(250);
    expect(dodgePoints(1000)).toBe(250);
  });

  it('treats negative combos as zero', () => {
    expect(dodgePoints(-5)).toBe(GAME_CONSTANTS.BASE_DODGE_POINTS);
  });
});

describe('stageForScore (score-driven difficulty ramp)', () => {
  it('starts at stage 1 below the first threshold', () => {
    expect(stageForScore(0)).toBe(1);
    expect(stageForScore(499)).toBe(1);
  });

  it('advances one stage per 500 points', () => {
    expect(stageForScore(500)).toBe(2);
    expect(stageForScore(1000)).toBe(3);
    expect(stageForScore(2750)).toBe(6);
  });

  it('is clamped to stage 1 for negative scores', () => {
    expect(stageForScore(-100)).toBe(1);
  });
});

describe('getAllowedEnemyTypes (difficulty ramp)', () => {
  it('easy stage 1 is ground-only', () => {
    expect(getAllowedEnemyTypes(1, 'easy')).toEqual(['ground']);
  });

  it('easy early stages are ground-heavy but allow mid, not high', () => {
    const types = getAllowedEnemyTypes(3, 'easy');
    expect(types).toContain('ground');
    expect(types).toContain('mid');
    expect(types).not.toContain('high');
  });

  it('easy opens up to all heights from stage 5', () => {
    expect(new Set(getAllowedEnemyTypes(5, 'easy'))).toEqual(new Set(['ground', 'mid', 'high']));
  });

  it('medium/hard always allow every height', () => {
    expect(new Set(getAllowedEnemyTypes(1, 'medium'))).toEqual(new Set(['ground', 'mid', 'high']));
    expect(new Set(getAllowedEnemyTypes(1, 'hard'))).toEqual(new Set(['ground', 'mid', 'high']));
  });
});

describe('delta-time aware movement', () => {
  const enemies: Enemy[] = [{ x: 300, y: 400, r: 16, speed: 5, type: 'ground' }];

  it('scales enemy movement by dt', () => {
    expect(updateEnemies(enemies, 1, 1)[0].x).toBe(295);
    expect(updateEnemies(enemies, 1, 2)[0].x).toBe(290);
  });

  it('scales powerup movement by dt', () => {
    const powerups: Powerup[] = [{ x: 200, y: 350, r: 12, type: 'shield' }];
    expect(updatePowerups(powerups, 5, 1, 1)[0].x).toBe(195);
    expect(updatePowerups(powerups, 5, 1, 2)[0].x).toBe(190);
  });

  it('does not mutate inputs', () => {
    const before = enemies[0].x;
    updateEnemies(enemies, 1, 2);
    expect(enemies[0].x).toBe(before);
  });
});

describe('getJumpImpulse', () => {
  it('launches upward with positive gravity', () => {
    const { speed, acceleration } = getJumpImpulse();
    expect(speed).toBeLessThan(0);
    expect(acceleration).toBeGreaterThan(0);
  });
});
