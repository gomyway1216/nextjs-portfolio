import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_ORDER,
  DIFFICULTY_TIERS,
  buildMaze,
  computeStageScore,
  findShortestPath,
  generateMaze,
  getStageConfig,
  isSolvable,
  OPEN,
  WALL,
  type Grid,
} from '@/components/game/MemoryMaze/engine';

// Small seedable PRNG (mulberry32) for deterministic maze tests.
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('findShortestPath', () => {
  it('returns the optimal-length path on an open grid', () => {
    const grid: Grid = [
      [OPEN, OPEN, OPEN],
      [OPEN, OPEN, OPEN],
      [OPEN, OPEN, OPEN],
    ];
    const path = findShortestPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(path).not.toBeNull();
    // Manhattan distance 4 -> 5 cells inclusive.
    expect(path).toHaveLength(5);
    expect(path?.[0]).toEqual({ x: 0, y: 0 });
    expect(path?.[path.length - 1]).toEqual({ x: 2, y: 2 });
  });

  it('navigates around walls', () => {
    const grid: Grid = [
      [OPEN, WALL, OPEN],
      [OPEN, WALL, OPEN],
      [OPEN, OPEN, OPEN],
    ];
    const path = findShortestPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path).not.toBeNull();
    // Every step must be orthogonally adjacent and on an open cell.
    for (let i = 1; i < (path?.length ?? 0); i += 1) {
      const a = path![i - 1];
      const b = path![i];
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      expect(grid[b.y][b.x]).toBe(OPEN);
    }
  });

  it('returns null when the goal is walled off', () => {
    const grid: Grid = [
      [OPEN, WALL, OPEN],
      [WALL, WALL, OPEN],
      [OPEN, OPEN, OPEN],
    ];
    expect(findShortestPath(grid, { x: 0, y: 0 }, { x: 0, y: 0 })).not.toBeNull();
    // Goal isolated from start.
    const isolated: Grid = [
      [OPEN, WALL],
      [WALL, OPEN],
    ];
    expect(findShortestPath(isolated, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('returns null if start or goal is a wall', () => {
    const grid: Grid = [
      [WALL, OPEN],
      [OPEN, OPEN],
    ];
    expect(findShortestPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('generateMaze solvability', () => {
  it('always produces a solvable maze across many sizes/densities/seeds', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = seeded(seed * 7919);
      for (const size of [5, 7, 9, 11, 13, 15, 17]) {
        for (const density of [0.08, 0.16, 0.24, 0.35]) {
          const grid = generateMaze(size, density, rng);
          expect(grid).toHaveLength(size);
          expect(grid[0]).toHaveLength(size);
          expect(grid[0][0]).toBe(OPEN);
          expect(grid[size - 1][size - 1]).toBe(OPEN);
          expect(isSolvable(grid, { x: 0, y: 0 }, { x: size - 1, y: size - 1 })).toBe(true);
        }
      }
    }
  });

  it('keeps start and goal open even at extreme density', () => {
    const grid = generateMaze(9, 0.95, seeded(42));
    expect(grid[0][0]).toBe(OPEN);
    expect(grid[8][8]).toBe(OPEN);
    expect(isSolvable(grid, { x: 0, y: 0 }, { x: 8, y: 8 })).toBe(true);
  });
});

describe('buildMaze', () => {
  it('produces a maze whose solution is a valid path to the goal', () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      for (const stage of [1, 3, 6, 10]) {
        const maze = buildMaze(difficulty, stage, seeded(stage * 31 + 1));
        expect(maze.solution.length).toBeGreaterThanOrEqual(2);
        expect(maze.solution[0]).toEqual(maze.start);
        expect(maze.solution[maze.solution.length - 1]).toEqual(maze.goal);
        // Solution cells are all open and contiguous.
        for (let i = 1; i < maze.solution.length; i += 1) {
          const a = maze.solution[i - 1];
          const b = maze.solution[i];
          expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
          expect(maze.grid[b.y][b.x]).toBe(OPEN);
        }
      }
    }
  });
});

describe('getStageConfig', () => {
  it('never shrinks below fair limits and respects tier max size', () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      const tier = DIFFICULTY_TIERS[difficulty];
      for (let stage = 1; stage <= 20; stage += 1) {
        const cfg = getStageConfig(difficulty, stage);
        expect(cfg.size).toBeGreaterThanOrEqual(tier.baseSize);
        expect(cfg.size).toBeLessThanOrEqual(tier.maxSize);
        expect(cfg.peekMs).toBeGreaterThanOrEqual(1200);
        expect(cfg.timeSec).toBeGreaterThanOrEqual(16);
        expect(cfg.lives).toBe(tier.lives);
      }
    }
  });

  it('grid size grows monotonically with stage', () => {
    let prev = 0;
    for (let stage = 1; stage <= 12; stage += 1) {
      const cfg = getStageConfig('expert', stage);
      expect(cfg.size).toBeGreaterThanOrEqual(prev);
      prev = cfg.size;
    }
  });
});

describe('computeStageScore', () => {
  const base = {
    difficulty: 'easy' as const,
    stage: 1,
    optimalLength: 9, // 8 optimal moves
    moves: 8,
    timeLeftSec: 10,
    livesLeft: 3,
  };

  it('is always positive on a clear', () => {
    expect(computeStageScore(base)).toBeGreaterThan(0);
  });

  it('rewards efficient routing (fewer moves scores higher)', () => {
    const efficient = computeStageScore({ ...base, moves: 8 });
    const wasteful = computeStageScore({ ...base, moves: 30 });
    expect(efficient).toBeGreaterThan(wasteful);
  });

  it('rewards leftover time', () => {
    const fast = computeStageScore({ ...base, timeLeftSec: 20 });
    const slow = computeStageScore({ ...base, timeLeftSec: 1 });
    expect(fast).toBeGreaterThan(slow);
  });

  it('rewards saved lives', () => {
    const safe = computeStageScore({ ...base, livesLeft: 5 });
    const risky = computeStageScore({ ...base, livesLeft: 0 });
    expect(safe).toBeGreaterThan(risky);
  });

  it('scales with difficulty multiplier', () => {
    const easy = computeStageScore({ ...base, difficulty: 'easy' });
    const master = computeStageScore({ ...base, difficulty: 'master' });
    expect(master).toBeGreaterThan(easy);
  });

  it('never returns negative even with pathological input', () => {
    expect(
      computeStageScore({ ...base, moves: 9999, timeLeftSec: 0, livesLeft: 0 }),
    ).toBeGreaterThanOrEqual(0);
  });

  it('gives higher base score for later stages', () => {
    const early = computeStageScore({ ...base, stage: 1 });
    const late = computeStageScore({ ...base, stage: 10 });
    expect(late).toBeGreaterThan(early);
  });
});
