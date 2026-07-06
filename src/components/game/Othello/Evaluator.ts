/**
 * Evaluator - Position evaluation functions for Othello AI
 * Based on Thell 3.0.3 implementation
 *
 * Implements multiple evaluation strategies:
 * - MidEvaluator: hand-crafted positional + mobility + stability + parity
 * - WLDEvaluator: Win/Loss/Draw evaluation for late game
 * - PerfectEvaluator: Disc count evaluation for endgame
 * - FFEvaluator: Mobility-based evaluation for move ordering
 */

import { Board } from './Board';
import {
BLACK,
BOARD_SIZE,
Color,
EMPTY,
MULTIPLIER,
WHITE
} from './types';

/**
 * Base Evaluator interface
 */
export interface Evaluator {
  evaluate(board: Board): number;
}

/**
 * Win/Loss/Draw Evaluator
 * Used for WLD endgame search
 */
export class WLDEvaluator implements Evaluator {
  static readonly WIN = 32;
  static readonly DRAW = 0;
  static readonly LOSE = -32;

  evaluate(board: Board): number {
    const discDiff = board.getCurrentColor() * (board.countDisc(BLACK) - board.countDisc(WHITE));

    if (discDiff > 0) return MULTIPLIER * WLDEvaluator.WIN;
    if (discDiff < 0) return MULTIPLIER * WLDEvaluator.LOSE;
    return WLDEvaluator.DRAW;
  }
}

/**
 * Perfect Evaluator
 * Returns exact disc difference for perfect endgame solving
 */
export class PerfectEvaluator implements Evaluator {
  evaluate(board: Board): number {
    return MULTIPLIER * board.getCurrentColor() * (board.countDisc(BLACK) - board.countDisc(WHITE));
  }
}

/**
 * Fastest-First Evaluator
 * Returns mobility count for move ordering in endgame
 */
export class FFEvaluator implements Evaluator {
  evaluate(board: Board): number {
    return board.countMobility();
  }
}

/**
 * Positional weight table for simple evaluation
 * Values represent the strategic importance of each square
 */
const POSITION_WEIGHTS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 120, -20, 20, 5, 5, 20, -20, 120, 0],
  [0, -20, -40, -5, -5, -5, -5, -40, -20, 0],
  [0, 20, -5, 15, 3, 3, 15, -5, 20, 0],
  [0, 5, -5, 3, 3, 3, 3, -5, 5, 0],
  [0, 5, -5, 3, 3, 3, 3, -5, 5, 0],
  [0, 20, -5, 15, 3, 3, 15, -5, 20, 0],
  [0, -20, -40, -5, -5, -5, -5, -40, -20, 0],
  [0, 120, -20, 20, 5, 5, 20, -20, 120, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

/**
 * Tunable options for MidEvaluator. `new MidEvaluator()` uses the current
 * production defaults; flags exist so the A/B harness can isolate one change
 * at a time and reproduce past baselines.
 */
export interface MidEvaluatorOptions {
  /**
   * Whether to evaluate mobility in the absolute (Black-positive) frame.
   * Defaults to `true` (the corrected behavior, shipped after A/B).
   *
   * The legacy code (opt out with `false`, kept as a frozen A/B baseline)
   * computed mobility relative to the side to move and then multiplied the
   * whole score by `currentColor` again, double-applying perspective and
   * inverting the mobility term for White — so White preferred having
   * *fewer* legal moves. Fixed by computing (blackMobility − whiteMobility)
   * independently of whose turn it is, matching the positional and stability
   * terms which are already in the absolute frame.
   */
  mobilityFrameFix?: boolean;

  /**
   * Corner-relative X/C-square correction. Default on (opt out with `false`).
   * The fixed PSQT penalizes X-squares (-40) and C-squares (-20)
   * unconditionally, but those squares are only dangerous while the adjacent
   * corner is still empty; once you *own* the corner they are safe (often
   * stable). This term adds back the PSQT penalty (plus a small bonus) for
   * X/C squares whose corner is held by the same color.
   */
  cornerRelative?: boolean;

  /**
   * Frontier-disc term. Default on (opt out with `false`). A "frontier" disc
   * is adjacent (8-dir) to at least one empty square and is exposed to being
   * flipped / tends to hand the opponent moves; fewer of one's own is better.
   * Scored in the absolute frame as (whiteFrontier - blackFrontier) * weight.
   *
   * A/B (both terms on) vs the mobility-only eval, medium, color-swapped:
   * 64.4%+-3.1% (n=240) and 59.0%+-3.2% (n=240) — clear, reproducible win;
   * neither term alone clears noise (corner ~51.6%, frontier ~53.8%).
   */
  frontier?: boolean;
}

/**
 * Corners and their adjacent X-square / C-squares, for the corner-relative
 * term. X-square = the diagonal neighbor; C-squares = the two orthogonal
 * edge neighbors.
 */
const CORNER_ADJACENCY: ReadonlyArray<{
  corner: [number, number];
  x: [number, number];
  c: ReadonlyArray<[number, number]>;
}> = [
  { corner: [1, 1], x: [2, 2], c: [[2, 1], [1, 2]] },
  { corner: [8, 1], x: [7, 2], c: [[7, 1], [8, 2]] },
  { corner: [1, 8], x: [2, 7], c: [[1, 7], [2, 8]] },
  { corner: [8, 8], x: [7, 7], c: [[7, 8], [8, 7]] },
];

/**
 * Mid-game Evaluator
 *
 * Hand-crafted evaluation: positional table (PSQT) + mobility (both in the
 * absolute frame) + corner stability + parity. The original Thell/LOGISTELLO
 * pattern-weight scaffolding was never populated (all-zero, unread) and has
 * been removed.
 */
export class MidEvaluator implements Evaluator {
  private readonly opts: MidEvaluatorOptions;

  constructor(opts: MidEvaluatorOptions = {}) {
    this.opts = opts;
  }

  evaluate(board: Board): number {
    // Prevent total wipeout
    const destroyed = MULTIPLIER * BOARD_SIZE * BOARD_SIZE;
    if (board.countDisc(board.getCurrentColor()) === 0) return -destroyed;
    if (board.countDisc(-board.getCurrentColor() as Color) === 0) return destroyed;

    let evalScore = 0;

    // Use simplified positional evaluation
    evalScore += this.evaluatePosition(board);

    // Add mobility evaluation
    evalScore += this.evaluateMobility(board);

    // Add stability evaluation
    evalScore += this.evaluateStability(board);

    // Corner-relative X/C correction (default on; see MidEvaluatorOptions)
    if (this.opts.cornerRelative !== false) {
      evalScore += this.evaluateCornerRelative(board);
    }

    // Frontier discs (default on; see MidEvaluatorOptions)
    if (this.opts.frontier !== false) {
      evalScore += this.evaluateFrontier(board);
    }

    // Add parity
    const parity = (board.countDisc(EMPTY) % 2 === 0 ? 1 : -1) * board.getCurrentColor();
    evalScore += 500 * parity;

    // Return evaluation from current player's perspective
    return board.getCurrentColor() * evalScore;
  }

  /**
   * Evaluate position based on piece placement
   */
  private evaluatePosition(board: Board): number {
    let score = 0;
    for (let x = 1; x <= BOARD_SIZE; x++) {
      for (let y = 1; y <= BOARD_SIZE; y++) {
        const color = board.getColor(x, y);
        if (color !== EMPTY) {
          score += POSITION_WEIGHTS[x][y] * color;
        }
      }
    }
    return score * 100;
  }

  /**
   * Evaluate mobility (number of available moves)
   * More mobility is generally better in Othello
   */
  private evaluateMobility(board: Board): number {
    // Save current state
    const savedColor = board.getCurrentColor();

    if (this.opts.mobilityFrameFix !== false) {
      // Absolute (Black-positive) frame: computed independently of whose turn
      // it is, so the caller's final `* currentColor` converts it to the
      // side-to-move frame consistently with the positional/stability terms.
      board.setCurrentColor(BLACK);
      const blackMobility = board.countMobility();
      board.setCurrentColor(WHITE);
      const whiteMobility = board.countMobility();
      board.setCurrentColor(savedColor);
      return (blackMobility - whiteMobility) * 1000;
    }

    // Legacy behavior (opt in via mobilityFrameFix: false; see MidEvaluatorOptions).
    const myMobility = board.getMovablePos().length;

    // Count opponent's mobility (need to temporarily switch)
    board.setCurrentColor(-savedColor as Color);
    const oppMobility = board.getMovablePos().length;
    board.setCurrentColor(savedColor);

    // Mobility difference (weighted)
    return (myMobility - oppMobility) * 1000;
  }

  /**
   * Evaluate corner stability
   * Stable corners are extremely valuable
   */
  private evaluateStability(board: Board): number {
    let score = 0;

    // Check corners
    const corners = [
      { x: 1, y: 1 },
      { x: 8, y: 1 },
      { x: 1, y: 8 },
      { x: 8, y: 8 },
    ];

    for (const corner of corners) {
      const color = board.getColor(corner.x, corner.y);
      if (color !== EMPTY) {
        // Corner is taken - add stability bonus
        score += 5000 * color;

        // Check for stable edges extending from corner
        score += this.countStableEdge(board, corner) * 500 * color;
      }
    }

    return score;
  }

  /**
   * Corner-relative X/C-square correction (absolute, Black-positive frame).
   * See MidEvaluatorOptions.cornerRelative. evaluatePosition already subtracts
   * ~4000 for an X-square and ~2000 for a C-square held; when the adjacent
   * corner is owned by that same color those squares are safe, so add it back
   * plus a small stability bonus.
   */
  private evaluateCornerRelative(board: Board): number {
    const X_SAFE = 4500; // cancels the -4000 PSQT X penalty + small bonus
    const C_SAFE = 2200; // cancels the -2000 PSQT C penalty + small bonus
    let score = 0;
    for (const { corner, x, c } of CORNER_ADJACENCY) {
      const cornerColor = board.getColor(corner[0], corner[1]);
      if (cornerColor === EMPTY) continue;
      if (board.getColor(x[0], x[1]) === cornerColor) {
        score += cornerColor * X_SAFE;
      }
      for (const cc of c) {
        if (board.getColor(cc[0], cc[1]) === cornerColor) {
          score += cornerColor * C_SAFE;
        }
      }
    }
    return score;
  }

  /**
   * Frontier-disc term (absolute, Black-positive frame). A disc adjacent to at
   * least one empty square is a "frontier" disc; fewer of one's own is better.
   * See MidEvaluatorOptions.frontier.
   */
  private evaluateFrontier(board: Board): number {
    const W = 75;
    let blackFrontier = 0;
    let whiteFrontier = 0;
    for (let x = 1; x <= BOARD_SIZE; x++) {
      for (let y = 1; y <= BOARD_SIZE; y++) {
        const color = board.getColor(x, y);
        if (color !== BLACK && color !== WHITE) continue;
        let isFrontier = false;
        for (let dx = -1; dx <= 1 && !isFrontier; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            if (board.getColor(x + dx, y + dy) === EMPTY) {
              isFrontier = true;
              break;
            }
          }
        }
        if (isFrontier) {
          if (color === BLACK) blackFrontier++;
          else whiteFrontier++;
        }
      }
    }
    return (whiteFrontier - blackFrontier) * W;
  }

  /**
   * Count stable discs on edges extending from a corner
   */
  private countStableEdge(board: Board, corner: { x: number; y: number }): number {
    const color = board.getColor(corner.x, corner.y);
    if (color === EMPTY) return 0;

    let stable = 0;
    const dx = corner.x === 1 ? 1 : -1;
    const dy = corner.y === 1 ? 1 : -1;

    // Count horizontal stable discs
    for (let x = corner.x + dx; x >= 1 && x <= 8; x += dx) {
      if (board.getColor(x, corner.y) === color) {
        stable++;
      } else {
        break;
      }
    }

    // Count vertical stable discs
    for (let y = corner.y + dy; y >= 1 && y <= 8; y += dy) {
      if (board.getColor(corner.x, y) === color) {
        stable++;
      } else {
        break;
      }
    }

    return stable;
  }
}

/**
 * Create evaluator based on game phase
 */
export function createEvaluator(type: 'mid' | 'wld' | 'perfect' | 'ff'): Evaluator {
  switch (type) {
    case 'mid':
      return new MidEvaluator();
    case 'wld':
      return new WLDEvaluator();
    case 'perfect':
      return new PerfectEvaluator();
    case 'ff':
      return new FFEvaluator();
    default:
      return new MidEvaluator();
  }
}
