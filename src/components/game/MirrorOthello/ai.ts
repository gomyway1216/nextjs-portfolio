/**
 * Mirror Othello — AI.
 *
 * Negamax with alpha-beta pruning that searches THROUGH the mirror flips
 * (via the shared `advance` transition), so it correctly anticipates that
 * the board reflects left↔right every `MIRROR_INTERVAL` plies. Evaluation
 * combines positional weights, mobility, frontier discs, corner control and
 * disc parity, phased by game stage.
 *
 * Difficulty tiers scale search depth and add a little randomness at the
 * easy end so the computer is beatable but the top tiers are genuinely hard.
 */

import type { Difficulty } from '../common';
import {
  AI,
  advance,
  Cell,
  countDiscs,
  DIRECTIONS,
  EMPTY,
  getValidMoves,
  inside,
  mirrorHorizontally,
  PLAYER,
  pliesUntilMirror,
  Point,
  shouldMirror,
  SIZE,
} from './engine';

/**
 * Static positional weights. This table is left-right symmetric, so it stays
 * valid after a horizontal mirror — exactly what Mirror Othello needs.
 * Corners are prized, X/C squares next to corners are penalised.
 */
const POSITION_WEIGHTS: ReadonlyArray<ReadonlyArray<number>> = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

const CORNERS: ReadonlyArray<Point> = [
  { x: 0, y: 0 },
  { x: 7, y: 0 },
  { x: 0, y: 7 },
  { x: 7, y: 7 },
];

const WIN_SCORE = 1_000_000;

export interface AIConfig {
  /** Full-width search depth in plies. */
  depth: number;
  /** 0..1 chance of playing a random legal move instead of the best one. */
  randomness: number;
  /** Standard deviation of noise added to leaf scores (breaks ties, adds variety). */
  jitter: number;
  /** Wall-clock cap on the search so the UI thread never freezes. */
  timeBudgetMs: number;
}

export const AI_CONFIGS: Record<Difficulty, AIConfig> = {
  easy: { depth: 1, randomness: 0.35, jitter: 40, timeBudgetMs: 200 },
  medium: { depth: 3, randomness: 0.08, jitter: 18, timeBudgetMs: 400 },
  hard: { depth: 5, randomness: 0, jitter: 6, timeBudgetMs: 600 },
  expert: { depth: 7, randomness: 0, jitter: 0, timeBudgetMs: 800 },
  master: { depth: 9, randomness: 0, jitter: 0, timeBudgetMs: 950 },
};

// Deadline shared by the whole search tree. The search runs synchronously on
// the main thread, so once the deadline passes we abort deepening and keep the
// best move from the last fully-completed iteration.
let searchDeadline = Infinity;
let searchTimedOut = false;

/** Count of a color's discs adjacent to at least one empty square (frontier). */
const frontierCount = (board: Cell[][], color: Cell): number => {
  let count = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] !== color) continue;
      for (const dir of DIRECTIONS) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        if (inside(nx, ny) && board[ny][nx] === EMPTY) {
          count += 1;
          break;
        }
      }
    }
  }
  return count;
};

/**
 * Static evaluation from the AI's perspective (positive = good for AI).
 * Phased weighting: mobility/position matter early, disc count late.
 */
export const evaluate = (board: Cell[][]): number => {
  const { player, ai, empty } = countDiscs(board);
  const filled = SIZE * SIZE - empty;

  // Terminal-ish: pure disc differential dominates when the board is nearly full.
  if (empty === 0) {
    return (ai - player) * 1000;
  }

  // Positional score.
  let position = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = board[y][x];
      if (cell === AI) position += POSITION_WEIGHTS[y][x];
      else if (cell === PLAYER) position -= POSITION_WEIGHTS[y][x];
    }
  }

  // Corner control (heavily weighted — corners are permanent even across mirrors).
  let corners = 0;
  for (const c of CORNERS) {
    if (board[c.y][c.x] === AI) corners += 1;
    else if (board[c.y][c.x] === PLAYER) corners -= 1;
  }

  // Mobility.
  const aiMoves = getValidMoves(board, AI).length;
  const playerMoves = getValidMoves(board, PLAYER).length;
  const mobility =
    aiMoves + playerMoves > 0
      ? (100 * (aiMoves - playerMoves)) / (aiMoves + playerMoves)
      : 0;

  // Frontier (fewer frontier discs is better — they are exposed to capture).
  const aiFrontier = frontierCount(board, AI);
  const playerFrontier = frontierCount(board, PLAYER);
  const frontier =
    aiFrontier + playerFrontier > 0
      ? (100 * (playerFrontier - aiFrontier)) / (aiFrontier + playerFrontier)
      : 0;

  // Disc parity.
  const parity =
    ai + player > 0 ? (100 * (ai - player)) / (ai + player) : 0;

  // Phase weights: early game emphasise mobility/position, late game parity.
  const late = filled / (SIZE * SIZE); // 0..1
  const early = 1 - late;

  return (
    position * (0.9 + 0.6 * early) +
    corners * 220 +
    mobility * (14 * early + 2) +
    frontier * (8 * early + 1) +
    parity * (2 + 22 * late)
  );
};

/** Order moves to improve alpha-beta pruning: corners first, X-squares last. */
const orderMoves = (moves: Point[]): Point[] =>
  [...moves].sort(
    (a, b) => POSITION_WEIGHTS[b.y][b.x] - POSITION_WEIGHTS[a.y][a.x],
  );

/**
 * Negamax with alpha-beta. `color` is the side to move; scores are always
 * returned from `color`'s perspective. The search uses `advance` so mirror
 * flips, passes and terminal states are handled identically to real play.
 */
const negamax = (
  board: Cell[][],
  color: Cell,
  turnCount: number,
  depth: number,
  alphaIn: number,
  beta: number,
): number => {
  if (searchTimedOut || Date.now() > searchDeadline) {
    searchTimedOut = true;
    const sign = color === AI ? 1 : -1;
    return sign * evaluate(board);
  }

  const moves = getValidMoves(board, color);

  if (depth <= 0) {
    const sign = color === AI ? 1 : -1;
    return sign * evaluate(board);
  }

  if (moves.length === 0) {
    // Current side passes. If opponent also has no move, game is over.
    const opponent = -color as Cell;
    const oppMoves = getValidMoves(board, opponent);
    if (oppMoves.length === 0) {
      // Double pass — game over. Use the exact disc-count outcome, not the
      // heuristic, so a winning majority is never mis-scored.
      const sign = color === AI ? 1 : -1;
      const { player, ai } = countDiscs(board);
      const diff = ai - player;
      const score = diff > 0 ? WIN_SCORE + diff : diff < 0 ? -WIN_SCORE + diff : 0;
      return sign * score;
    }
    // Passing does NOT consume a ply-count mirror here in real rules the
    // mirror is tied to actual moves, so a pass keeps turnCount as-is.
    return -negamax(board, opponent, turnCount, depth - 1, -beta, -alphaIn);
  }

  let alpha = alphaIn;
  let best = -Infinity;

  for (const move of orderMoves(moves)) {
    const step = advance(board, move, color, turnCount);
    if (!step) continue;

    let score: number;
    if (step.gameOver) {
      const sign = color === AI ? 1 : -1;
      const { player, ai } = countDiscs(step.board);
      const diff = ai - player;
      const terminalScore =
        diff > 0 ? WIN_SCORE + diff : diff < 0 ? -WIN_SCORE + diff : 0;
      score = sign * terminalScore;
    } else if (step.nextColor === color) {
      // Opponent passed — same side moves again, no perspective flip.
      score = negamax(
        step.board,
        color,
        step.turnCount,
        depth - 1,
        alpha,
        beta,
      );
    } else {
      score = -negamax(
        step.board,
        step.nextColor,
        step.turnCount,
        depth - 1,
        -beta,
        -alpha,
      );
    }

    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // prune
  }

  return best;
};

let rng: () => number = Math.random;

/** Test hook to make AI move selection deterministic. */
export const setAIRandom = (fn: () => number): void => {
  rng = fn;
};

export const resetAIRandom = (): void => {
  rng = Math.random;
};

/**
 * Choose the AI's move for the given board / difficulty. `turnCount` is the
 * number of plies already played (so the search knows when the next mirror
 * hits). Returns null only if there is no legal move.
 */
export const chooseAIMove = (
  board: Cell[][],
  difficulty: Difficulty,
  turnCount: number,
): Point | null => {
  const moves = getValidMoves(board, AI);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const config = AI_CONFIGS[difficulty];

  if (config.randomness > 0 && rng() < config.randomness) {
    return moves[Math.floor(rng() * moves.length)];
  }

  // Deepen the endgame: when few empties remain, exact search is cheap and
  // strong. Fill to the end once it's within reach of the tier's depth.
  const { empty } = countDiscs(board);
  const targetDepth =
    empty <= config.depth + 2 ? Math.max(config.depth, empty) : config.depth;

  searchDeadline = Date.now() + config.timeBudgetMs;
  searchTimedOut = false;

  // Iterative deepening up to targetDepth, keeping the best move of the last
  // FULLY completed iteration. A timed-out iteration's scores are unreliable,
  // so it is discarded. Completed iterations also re-order the root moves
  // best-first, which sharpens pruning on the next, deeper pass.
  const depths: number[] = [];
  for (let d = 1; d < targetDepth; d += 2) depths.push(d);
  depths.push(targetDepth);

  let ordered = orderMoves(moves);
  let best = ordered[0];

  for (const depth of depths) {
    const iteration: Array<{ move: Point; score: number }> = [];
    let iterBest: Point | null = null;
    let iterBestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const move of ordered) {
      const step = advance(board, move, AI, turnCount);
      if (!step) continue;

      let score: number;
      if (step.gameOver) {
        const { player, ai } = countDiscs(step.board);
        const diff = ai - player;
        score = diff > 0 ? WIN_SCORE + diff : diff < 0 ? -WIN_SCORE + diff : 0;
      } else if (step.nextColor === AI) {
        score = negamax(step.board, AI, step.turnCount, depth - 1, alpha, beta);
      } else {
        score = -negamax(
          step.board,
          step.nextColor,
          step.turnCount,
          depth - 1,
          -beta,
          -alpha,
        );
      }

      if (searchTimedOut) break;

      if (config.jitter > 0) {
        score += (rng() - 0.5) * 2 * config.jitter;
      }

      iteration.push({ move, score });
      if (score > iterBestScore) {
        iterBestScore = score;
        iterBest = move;
      }
      if (iterBestScore > alpha) alpha = iterBestScore;
    }

    if (searchTimedOut) break;

    if (iterBest) best = iterBest;
    iteration.sort((a, b) => b.score - a.score);
    ordered = iteration.map((s) => s.move);
  }

  return best;
};

// Re-export a couple of helpers so tests/UI can introspect timing.
export { mirrorHorizontally, pliesUntilMirror, shouldMirror };
