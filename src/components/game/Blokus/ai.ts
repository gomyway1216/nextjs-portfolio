/**
 * Blokus AI: five levels over one evaluation.
 *
 * Blokus is a race for room, so the evaluation scores what a colour has placed
 * and what it can still reach:
 * - squares placed;
 * - reach: cells it can get to within a piece's length of an open corner,
 *   counted again when no other colour can get there.
 *
 * Reach is computed by dilating row masks, so one evaluation costs a few
 * microseconds and every level can afford to look at every legal move.
 *
 * | level  | what it does                                                  |
 * |--------|---------------------------------------------------------------|
 * | easy   | big pieces first, placed almost anywhere                      |
 * | medium | the move that gives itself the most room, with some noise     |
 * | hard   | the best move for its room against every rival's              |
 * | expert | plays out its best moves briefly, keeps the best one          |
 * | master | the same, with more candidates, longer playouts, nine times   |
 * |        | the time                                                      |
 *
 * The top two levels use playouts rather than a game-tree search because a tree
 * has to guess one reply per rival, and with four colours deepening that guess
 * did not help: a deeper search was level with a shallower one. Playouts sample
 * the rivals' replies instead. They beat that search 84-90% of the time at four
 * colours and match alpha-beta at two, so both modes share them.
 */

import type { Difficulty } from '../common/types';
import {
  PIECES,
  applyMove,
  cloneState,
  copyState,
  legalMoves,
  movePiece,
  passTurn,
  scoreOf,
  type GameState,
  type Mode,
} from './engine';

export type Random = () => number;

/** Small, fast, seedable: the AI's noise replays exactly, in the worker and the harness alike. */
export const seededRandom = (seed: number): Random => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export interface Weights {
  squares: number;
  reach: number;
  alone: number;
  /** How much the other colours' positions count against this colour's. */
  rivals: number;
  /** Extra value of getting a hard-to-place piece onto the board. */
  shape: number;
}

export const BEST_WEIGHTS: Weights = { squares: 3, reach: 0.25, alone: 0.25, rivals: 0.7, shape: 1 };

/** How awkward a piece is to place late: the more it branches, the less room it fits. */
const SHAPE_BONUS: Readonly<Record<string, number>> = {
  X5: 1.5,
  W5: 1.2,
  F5: 1,
  Z5: 0.8,
  T5: 0.6,
  U5: 0.6,
  Y5: 0.4,
  N5: 0.3,
  V5: 0.2,
};
const shapeBonus = PIECES.map((piece) => SHAPE_BONUS[piece.name] ?? 0);

/** Steps of reach from an open corner: as far as a five-square piece gets. */
const REACH_STEPS = 4;
/** Rows of the reach mask, one colour after another. */
const reachRows = new Int32Array(80);
const frontier = new Int32Array(20);
const colourValue = new Float64Array(4);

const popcount = (value: number): number => {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  value = (value + (value >>> 4)) & 0x0f0f0f0f;
  return Math.imul(value, 0x01010101) >>> 24;
};

/** Fill `reachRows` for one colour: the cells it can get to, stepping by edge from its open corners. */
const fillReach = (state: GameState, color: number): void => {
  const { size } = state.rules;
  const base = color * size;
  const { blocked, corners } = state;
  const full = (1 << size) - 1;
  for (let row = 0; row < size; row++) {
    const cells = corners[base + row] & ~blocked[base + row];
    reachRows[base + row] = cells;
    frontier[row] = cells;
  }
  for (let step = 1; step < REACH_STEPS; step++) {
    let above = 0;
    for (let row = 0; row < size; row++) {
      const here = frontier[row];
      const below = row + 1 < size ? frontier[row + 1] : 0;
      const grown = (((here << 1) | (here >>> 1) | above | below) & full & ~blocked[base + row]) | here;
      above = here;
      frontier[row] = grown;
      reachRows[base + row] |= grown;
    }
  }
};

/** Each colour's position, written to `colourValue`. */
const valueColours = (state: GameState, weights: Weights): void => {
  const { size, colors } = state.rules;
  for (let color = 0; color < colors; color++) {
    fillReach(state, color);
    colourValue[color] = weights.squares * state.placed[color];
  }
  for (let row = 0; row < size; row++) {
    let once = 0;
    let twice = 0;
    for (let color = 0; color < colors; color++) {
      const cells = reachRows[color * size + row];
      twice |= once & cells;
      once |= cells;
    }
    for (let color = 0; color < colors; color++) {
      const cells = reachRows[color * size + row];
      colourValue[color] += weights.reach * popcount(cells) + weights.alone * popcount(cells & ~twice);
    }
  }
};

/** The position as `color` sees it: its own value less the average rival's. */
export const evaluate = (state: GameState, color: number, weights: Weights = BEST_WEIGHTS): number => {
  valueColours(state, weights);
  const { colors } = state.rules;
  let rivals = 0;
  for (let other = 0; other < colors; other++) {
    if (other !== color) rivals += colourValue[other];
  }
  return colourValue[color] - (weights.rivals * rivals) / (colors - 1);
};

/** The value of a finished game to `color`: the lead over the best rival, scaled past any estimate. */
const finalValue = (state: GameState, color: number): number => {
  const { colors } = state.rules;
  let best = -Infinity;
  for (let other = 0; other < colors; other++) {
    if (other !== color) best = Math.max(best, scoreOf(state, other));
  }
  return (scoreOf(state, color) - best) * 100;
};

export interface Scored {
  move: number;
  score: number;
}

/** Scratch states per mode, so a decision allocates nothing. Two deep: one for a playout, one for its moves. */
const scratchPools: Partial<Record<Mode, [GameState, GameState]>> = {};

const scratchStates = (state: GameState): [GameState, GameState] => {
  const { mode } = state.rules;
  return (scratchPools[mode] ??= [cloneState(state), cloneState(state)]);
};

const moveScore = (state: GameState, move: number, color: number, weights: Weights, scratch: GameState): number => {
  copyState(scratch, state);
  applyMove(scratch, move);
  return evaluate(scratch, color, weights) + weights.shape * shapeBonus[movePiece(move)];
};

/** Every move scored by one step of evaluation, best first. */
export const rankMoves = (state: GameState, moves: readonly number[], weights: Weights = BEST_WEIGHTS): Scored[] => {
  const color = state.toMove;
  const scratch = scratchStates(state)[0];
  const scored = moves.map((move) => ({ move, score: moveScore(state, move, color, weights, scratch) }));
  scored.sort((a, b) => b.score - a.score);
  return scored;
};

export interface SearchBudget {
  /** Moves played out, the best by one-step score. */
  width: number;
  /** Plies each playout runs before it is evaluated. */
  horizon: number;
  /** Legal moves sampled at each ply of a playout. */
  sample: number;
  timeLimitMs: number;
  /** Playouts to stop at, so a fixed budget plays the same on every machine. */
  maxPlayouts: number;
}

// Expert is held well below master on purpose, because more time alone stops helping: at 350ms against 1400ms, with
// the same horizon, 90 four-colour games came out level. Master beats this budget 65-66% of the time in both modes.
export const EXPERT_BUDGET: SearchBudget = { width: 6, horizon: 12, sample: 4, timeLimitMs: 150, maxPlayouts: 100_000 };
export const MASTER_BUDGET: SearchBudget = { width: 12, horizon: 24, sample: 6, timeLimitMs: 1400, maxPlayouts: 100_000 };

export const budgetFor = (level: Difficulty): SearchBudget | null =>
  level === 'expert' ? EXPERT_BUDGET : level === 'master' ? MASTER_BUDGET : null;

/**
 * Play `horizon` plies from `state` (which it changes), each colour taking the
 * best of a random sample of its moves, and value the result for `root`.
 */
const playOut = (state: GameState, root: number, budget: SearchBudget, weights: Weights, random: Random, scratch: GameState): number => {
  for (let ply = 0; ply < budget.horizon && !state.over; ply++) {
    const moves = legalMoves(state);
    if (moves.length === 0) {
      passTurn(state);
      continue;
    }
    const color = state.toMove;
    let best = moves[0];
    let bestScore = -Infinity;
    for (let n = 0; n < Math.min(budget.sample, moves.length); n++) {
      const move = moves[Math.floor(random() * moves.length)];
      const score = moveScore(state, move, color, weights, scratch);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    applyMove(state, best);
  }
  return state.over ? finalValue(state, root) : evaluate(state, root, weights);
};

/** Successive halving: play out the candidates evenly, drop the worse half, repeat until the budget is spent. */
const searchByPlayouts = (state: GameState, moves: readonly number[], budget: SearchBudget, weights: Weights, now: () => number, random: Random): number => {
  const root = state.toMove;
  const deadline = now() + budget.timeLimitMs;
  const [scratch, playout] = scratchStates(state);
  let alive = rankMoves(state, moves, weights)
    .slice(0, budget.width)
    .map(({ move }) => ({ move, total: 0, visits: 0 }));
  const rounds = Math.ceil(Math.log2(alive.length));
  const perRound = Math.floor(budget.maxPlayouts / rounds);
  const mean = (entry: { total: number; visits: number }) => entry.total / Math.max(entry.visits, 1);
  let inTime = true;
  for (let round = 0; round < rounds && inTime; round++) {
    const each = Math.max(1, Math.floor(perRound / alive.length));
    for (let n = 0; n < each && inTime; n++) {
      for (const candidate of alive) {
        copyState(playout, state);
        applyMove(playout, candidate.move);
        candidate.total += playOut(playout, root, budget, weights, random, scratch);
        candidate.visits += 1;
        if (now() > deadline) {
          inTime = false;
          break;
        }
      }
    }
    alive.sort((a, b) => mean(b) - mean(a));
    if (inTime) alive = alive.slice(0, Math.ceil(alive.length / 2));
  }
  return alive[0].move;
};

export interface AiOptions {
  random: Random;
  /** Clock override, so a test can run on the playout budget alone. */
  now?: () => number;
  budget?: Partial<SearchBudget>;
  /** Evaluation override for tuning. */
  weights?: Weights;
}

const EASY_NOISE = 2.2;
const MEDIUM_NOISE = 5;
const MEDIUM_WEIGHTS: Weights = { ...BEST_WEIGHTS, rivals: 0, alone: 0, shape: 0 };
/** Hard is otherwise deterministic: its first moves vary among its top few, so no two games open alike. */
const OPENING_SQUARES = 10;
const OPENING_CHOICES = 3;

const bestWithNoise = <T>(items: readonly T[], score: (item: T) => number, noise: number, random: Random): T => {
  let best = items[0];
  let bestScore = -Infinity;
  for (const item of items) {
    const noisy = score(item) + random() * noise;
    if (noisy > bestScore) {
      bestScore = noisy;
      best = item;
    }
  }
  return best;
};

/** Choose a move for the colour to move. `moves` must be its legal moves and not empty. */
export const chooseMove = (state: GameState, moves: readonly number[], level: Difficulty, options: AiOptions): number => {
  const { random } = options;
  if (moves.length === 1) return moves[0];

  if (level === 'easy') return bestWithNoise(moves, (move) => PIECES[movePiece(move)].size, EASY_NOISE, random);

  if (level === 'medium') {
    return bestWithNoise(rankMoves(state, moves, MEDIUM_WEIGHTS), ({ score }) => score, MEDIUM_NOISE, random).move;
  }

  const weights = options.weights ?? BEST_WEIGHTS;
  if (level === 'hard') {
    const ranked = rankMoves(state, moves, weights);
    const opening = state.placed[state.toMove] < OPENING_SQUARES;
    return ranked[opening ? Math.floor(random() * Math.min(OPENING_CHOICES, ranked.length)) : 0].move;
  }

  const budget = { ...budgetFor(level)!, ...options.budget };
  return searchByPlayouts(state, moves, budget, weights, options.now ?? Date.now, random);
};
