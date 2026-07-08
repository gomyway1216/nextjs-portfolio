/**
 * Memory Maze engine.
 *
 * Pure, deterministic-friendly logic for:
 *  - generating mazes that are ALWAYS solvable (start -> goal),
 *  - computing the shortest solution path (used for the memorize reveal + scoring),
 *  - difficulty tiers (grid size / wall density / peek time / lives),
 *  - scoring and level progression.
 *
 * Kept free of React so it can be unit-tested in isolation.
 */

import type { Difficulty } from '../common/types';

export const WALL = 1 as const;
export const OPEN = 0 as const;

export type Cell = typeof WALL | typeof OPEN;
export type Grid = Cell[][];

export interface Position {
  x: number;
  y: number;
}

export interface DifficultyTier {
  value: Difficulty;
  /** Grid width/height at stage 1. Grows slightly with stage. */
  baseSize: number;
  /** Max grid size the tier is allowed to grow to. */
  maxSize: number;
  /** Fraction of interior cells that become extra walls (on top of the maze walls). */
  wallDensity: number;
  /** Milliseconds the maze/path is revealed before recall. */
  peekMs: number;
  /** Recall time budget (seconds) at stage 1. */
  baseTimeSec: number;
  /** Number of wrong-move lives the player gets per stage. */
  lives: number;
  /** Score multiplier for the tier. */
  scoreMultiplier: number;
}

export const DIFFICULTY_TIERS: Record<Difficulty, DifficultyTier> = {
  easy: {
    value: 'easy',
    baseSize: 5,
    maxSize: 9,
    wallDensity: 0.08,
    peekMs: 4500,
    baseTimeSec: 45,
    lives: 5,
    scoreMultiplier: 1,
  },
  medium: {
    value: 'medium',
    baseSize: 7,
    maxSize: 11,
    wallDensity: 0.12,
    peekMs: 3800,
    baseTimeSec: 40,
    lives: 4,
    scoreMultiplier: 1.5,
  },
  hard: {
    value: 'hard',
    baseSize: 9,
    maxSize: 13,
    wallDensity: 0.16,
    peekMs: 3200,
    baseTimeSec: 34,
    lives: 3,
    scoreMultiplier: 2,
  },
  expert: {
    value: 'expert',
    baseSize: 11,
    maxSize: 15,
    wallDensity: 0.2,
    peekMs: 2600,
    baseTimeSec: 30,
    lives: 3,
    scoreMultiplier: 3,
  },
  master: {
    value: 'master',
    baseSize: 13,
    maxSize: 17,
    wallDensity: 0.24,
    peekMs: 2000,
    baseTimeSec: 26,
    lives: 2,
    scoreMultiplier: 4,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

const DIRECTIONS: Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const inBounds = (grid: Grid, x: number, y: number): boolean =>
  y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;

/**
 * Breadth-first search returning the shortest path (list of positions from
 * start to goal inclusive), or null if unreachable. Deterministic.
 */
export const findShortestPath = (
  grid: Grid,
  start: Position,
  goal: Position,
): Position[] | null => {
  if (!inBounds(grid, start.x, start.y) || grid[start.y][start.x] === WALL) return null;
  if (!inBounds(grid, goal.x, goal.y) || grid[goal.y][goal.x] === WALL) return null;

  const size = grid.length;
  const seen = Array.from({ length: size }, () => Array<boolean>(grid[0].length).fill(false));
  const prev = new Map<string, Position | null>();
  const key = (p: Position) => `${p.x},${p.y}`;

  const queue: Position[] = [start];
  seen[start.y][start.x] = true;
  prev.set(key(start), null);

  while (queue.length > 0) {
    const current = queue.shift() as Position;
    if (current.x === goal.x && current.y === goal.y) {
      // reconstruct
      const path: Position[] = [];
      let node: Position | null = current;
      while (node) {
        path.push(node);
        node = prev.get(key(node)) ?? null;
      }
      return path.reverse();
    }
    for (const dir of DIRECTIONS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (!inBounds(grid, nx, ny)) continue;
      if (seen[ny][nx]) continue;
      if (grid[ny][nx] === WALL) continue;
      seen[ny][nx] = true;
      prev.set(key({ x: nx, y: ny }), current);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
};

/** Convenience: is the goal reachable from the start? */
export const isSolvable = (grid: Grid, start: Position, goal: Position): boolean =>
  findShortestPath(grid, start, goal) !== null;

/**
 * Generate a solvable maze.
 *
 * Strategy:
 *  1. Carve a guaranteed winding corridor from start to goal (random walk that
 *     always makes progress) so a solution ALWAYS exists.
 *  2. Sprinkle additional walls on non-corridor cells up to `wallDensity`,
 *     re-checking solvability so we never block the only path.
 *
 * `rng` defaults to Math.random but can be injected for deterministic tests.
 */
export const generateMaze = (
  size: number,
  wallDensity: number,
  rng: () => number = Math.random,
): Grid => {
  const clampedSize = Math.max(3, Math.floor(size));
  const start: Position = { x: 0, y: 0 };
  const goal: Position = { x: clampedSize - 1, y: clampedSize - 1 };

  // Start fully walled, then carve.
  const grid: Grid = Array.from({ length: clampedSize }, () =>
    Array.from<Cell>({ length: clampedSize }).fill(WALL),
  );

  // 1. Carve a guaranteed corridor via a biased random walk toward the goal.
  const corridor = new Set<string>();
  let cx = start.x;
  let cy = start.y;
  grid[cy][cx] = OPEN;
  corridor.add(`${cx},${cy}`);

  let guard = clampedSize * clampedSize * 8;
  while ((cx !== goal.x || cy !== goal.y) && guard-- > 0) {
    // 65% of the time step toward the goal, otherwise wander (keeps it winding).
    const towardGoal = rng() < 0.65;
    let dx = 0;
    let dy = 0;
    if (towardGoal) {
      const preferX = Math.abs(goal.x - cx) >= Math.abs(goal.y - cy);
      if (preferX && cx !== goal.x) dx = goal.x > cx ? 1 : -1;
      else if (cy !== goal.y) dy = goal.y > cy ? 1 : -1;
      else dx = goal.x > cx ? 1 : -1;
    } else {
      const dir = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
      dx = dir.x;
      dy = dir.y;
    }
    const nx = cx + dx;
    const ny = cy + dy;
    if (!inBounds(grid, nx, ny)) continue;
    cx = nx;
    cy = ny;
    grid[cy][cx] = OPEN;
    corridor.add(`${cx},${cy}`);
  }

  // Safety net: if the walk somehow didn't reach the goal, carve an L-path.
  if (grid[goal.y][goal.x] === WALL || !isSolvable(grid, start, goal)) {
    for (let x = 0; x < clampedSize; x += 1) {
      grid[0][x] = OPEN;
      corridor.add(`${x},0`);
    }
    for (let y = 0; y < clampedSize; y += 1) {
      grid[y][clampedSize - 1] = OPEN;
      corridor.add(`${clampedSize - 1},${y}`);
    }
  }

  // 2. Open up some extra cells to create branches, then re-add walls up to the
  // density. First open everything not yet open, then re-wall randomly while
  // keeping solvable — this yields organic, memorizable layouts.
  for (let y = 0; y < clampedSize; y += 1) {
    for (let x = 0; x < clampedSize; x += 1) {
      if (grid[y][x] === WALL && rng() < 0.55) {
        grid[y][x] = OPEN;
      }
    }
  }

  const interior: Position[] = [];
  for (let y = 0; y < clampedSize; y += 1) {
    for (let x = 0; x < clampedSize; x += 1) {
      if ((x === start.x && y === start.y) || (x === goal.x && y === goal.y)) continue;
      interior.push({ x, y });
    }
  }
  // Shuffle interior (Fisher-Yates with injected rng).
  for (let i = interior.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [interior[i], interior[j]] = [interior[j], interior[i]];
  }

  const targetWalls = Math.floor(interior.length * wallDensity) + corridorWallBudget(clampedSize, wallDensity);
  let wallsAdded = grid.flat().filter((c) => c === WALL).length;

  for (const cell of interior) {
    if (wallsAdded >= targetWalls) break;
    if (grid[cell.y][cell.x] === WALL) continue;
    grid[cell.y][cell.x] = WALL;
    if (isSolvable(grid, start, goal)) {
      wallsAdded += 1;
    } else {
      grid[cell.y][cell.x] = OPEN; // revert – it was load-bearing
    }
  }

  grid[start.y][start.x] = OPEN;
  grid[goal.y][goal.x] = OPEN;
  return grid;
};

const corridorWallBudget = (size: number, density: number): number =>
  Math.floor(size * size * density * 0.4);

export interface StageConfig {
  size: number;
  peekMs: number;
  timeSec: number;
  lives: number;
}

/** Resolve stage-scaled parameters for a difficulty. */
export const getStageConfig = (difficulty: Difficulty, stage: number): StageConfig => {
  const tier = DIFFICULTY_TIERS[difficulty];
  const size = Math.min(tier.maxSize, tier.baseSize + Math.floor((stage - 1) / 2) * 2);
  // Peek shrinks slightly as stages climb, but never below 1.2s.
  const peekMs = Math.max(1200, tier.peekMs - (stage - 1) * 150);
  // Time budget scales with the maze area so bigger mazes stay fair.
  const areaFactor = Math.round((size * size) / (tier.baseSize * tier.baseSize) * 6);
  const timeSec = Math.max(16, tier.baseTimeSec - (stage - 1) * 2 + areaFactor - 6);
  return { size, peekMs, timeSec, lives: tier.lives };
};

export interface Maze {
  grid: Grid;
  start: Position;
  goal: Position;
  /** Shortest solution path from start to goal (inclusive). */
  solution: Position[];
  size: number;
}

/** Build a full, solvable maze for a stage. */
export const buildMaze = (
  difficulty: Difficulty,
  stage: number,
  rng: () => number = Math.random,
): Maze => {
  const { size } = getStageConfig(difficulty, stage);
  const tier = DIFFICULTY_TIERS[difficulty];
  const grid = generateMaze(size, tier.wallDensity, rng);
  const start: Position = { x: 0, y: 0 };
  const goal: Position = { x: size - 1, y: size - 1 };
  const solution = findShortestPath(grid, start, goal) ?? [start, goal];
  return { grid, start, goal, solution, size };
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreInput {
  difficulty: Difficulty;
  stage: number;
  /** Length of the optimal path (cells). */
  optimalLength: number;
  /** Moves the player actually took. */
  moves: number;
  /** Seconds left on the clock when the goal was reached. */
  timeLeftSec: number;
  /** Lives remaining at goal. */
  livesLeft: number;
}

/**
 * Deterministic stage score.
 *
 * Rewards: clearing (base), efficient routing (fewer extra moves), speed
 * (time remaining), and surviving (lives kept). Scaled by difficulty.
 */
export const computeStageScore = (input: ScoreInput): number => {
  const tier = DIFFICULTY_TIERS[input.difficulty];
  const optimal = Math.max(1, input.optimalLength - 1); // moves along optimal path
  const base = 100 + input.stage * 20;

  // Efficiency: full points at optimal, decaying with extra moves. Never negative.
  const extraMoves = Math.max(0, input.moves - optimal);
  const efficiency = Math.round(80 * (optimal / (optimal + extraMoves)));

  const timeBonus = Math.max(0, Math.round(input.timeLeftSec * 4));
  const livesBonus = Math.max(0, input.livesLeft) * 25;

  const raw = base + efficiency + timeBonus + livesBonus;
  return Math.round(raw * tier.scoreMultiplier);
};
