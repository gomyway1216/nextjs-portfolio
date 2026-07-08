import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __setRng,
  createObstacle,
  DIFFICULTY_CONFIG,
  intersects,
  playerBox,
  requiredAction,
  resolveAction,
  speedForScore,
  stepPlayer,
  WORLD,
} from '@/components/game/ReverseJump/gameLogic';

const cfg = DIFFICULTY_CONFIG.medium;

describe('ReverseJump gameLogic', () => {
  afterEach(() => {
    __setRng(Math.random);
    vi.restoreAllMocks();
  });

  describe('intersects', () => {
    it('detects overlapping AABBs', () => {
      expect(intersects(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
    });
    it('returns false for touching-but-not-overlapping boxes', () => {
      expect(intersects(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
    });
    it('returns false for separated boxes', () => {
      expect(intersects(0, 0, 10, 10, 100, 100, 10, 10)).toBe(false);
    });
  });

  describe('resolveAction (the reverse mechanic)', () => {
    it('maps primary->jump and secondary->duck in normal mode', () => {
      expect(resolveAction('primary', 'normal')).toBe('jump');
      expect(resolveAction('secondary', 'normal')).toBe('duck');
    });
    it('swaps jump and duck when inverted', () => {
      expect(resolveAction('primary', 'inverted')).toBe('duck');
      expect(resolveAction('secondary', 'inverted')).toBe('jump');
    });
  });

  describe('requiredAction', () => {
    it('low obstacles must be jumped, high obstacles must be ducked', () => {
      expect(requiredAction('low')).toBe('jump');
      expect(requiredAction('high')).toBe('duck');
    });
  });

  describe('speedForScore', () => {
    it('increases with score', () => {
      expect(speedForScore(10, cfg)).toBeGreaterThan(speedForScore(0, cfg));
    });
    it('never exceeds the configured cap', () => {
      expect(speedForScore(100000, cfg)).toBe(cfg.maxSpeed);
    });
  });

  describe('createObstacle geometry (regression: overhead obstacles must be hittable)', () => {
    it('low obstacle: a standing player collides, a jumping player clears', () => {
      __setRng(() => 0.99); // > highChance -> low
      const obs = createObstacle(1, cfg);
      obs.x = WORLD.playerX; // align horizontally
      const standing = playerBox(WORLD.groundY, false);
      expect(
        intersects(standing.x, standing.y, standing.w, standing.h, obs.x, obs.y, obs.width, obs.height),
      ).toBe(true);
      // High enough in the air clears it.
      const jumping = playerBox(WORLD.groundY - 120, false);
      expect(
        intersects(jumping.x, jumping.y, jumping.w, jumping.h, obs.x, obs.y, obs.width, obs.height),
      ).toBe(false);
    });

    it('high obstacle: a standing player collides but a ducking player clears', () => {
      __setRng(() => 0.0); // < highChance -> high
      const obs = createObstacle(2, cfg);
      obs.x = WORLD.playerX;
      const standing = playerBox(WORLD.groundY, false);
      expect(
        intersects(standing.x, standing.y, standing.w, standing.h, obs.x, obs.y, obs.width, obs.height),
      ).toBe(true);
      const ducking = playerBox(WORLD.groundY, true);
      expect(
        intersects(ducking.x, ducking.y, ducking.w, ducking.h, obs.x, obs.y, obs.width, obs.height),
      ).toBe(false);
    });

    it('spawns off the right edge', () => {
      __setRng(() => 0.5);
      const obs = createObstacle(3, cfg);
      expect(obs.x).toBeGreaterThan(WORLD.width);
      expect(obs.scored).toBe(false);
    });
  });

  describe('stepPlayer physics', () => {
    it('launches upward only when grounded', () => {
      const grounded = stepPlayer(WORLD.groundY, 0, 1 / 60, true);
      expect(grounded.velocityY).toBeLessThan(0);
    });

    it('ignores jump input while airborne', () => {
      const airborne = stepPlayer(WORLD.groundY - 100, 50, 1 / 60, true);
      // velocity keeps accumulating downward from gravity, not reset to jump velocity
      expect(airborne.velocityY).toBeGreaterThan(0);
    });

    it('applies gravity so the player falls back to the ground', () => {
      let y: number = WORLD.groundY;
      let vy = 0;
      // jump
      ({ playerY: y, velocityY: vy } = stepPlayer(y, vy, 1 / 60, true));
      expect(y).toBeLessThan(WORLD.groundY);
      // simulate ~2s of falling
      let landed = false;
      for (let i = 0; i < 200; i++) {
        const r = stepPlayer(y, vy, 1 / 60, false);
        y = r.playerY;
        vy = r.velocityY;
        if (r.onGround) {
          landed = true;
          break;
        }
      }
      expect(landed).toBe(true);
      expect(y).toBe(WORLD.groundY);
    });

    it('clamps to the ground and zeroes velocity on landing', () => {
      const r = stepPlayer(WORLD.groundY - 1, 500, 1 / 60, false);
      expect(r.playerY).toBe(WORLD.groundY);
      expect(r.velocityY).toBe(0);
      expect(r.onGround).toBe(true);
    });
  });

  describe('playerBox', () => {
    it('is shorter when ducking', () => {
      const standing = playerBox(WORLD.groundY, false);
      const ducking = playerBox(WORLD.groundY, true);
      expect(ducking.h).toBeLessThan(standing.h);
      // both feet sit on the ground line
      expect(standing.y + standing.h).toBe(WORLD.groundY);
      expect(ducking.y + ducking.h).toBe(WORLD.groundY);
    });
  });
});
