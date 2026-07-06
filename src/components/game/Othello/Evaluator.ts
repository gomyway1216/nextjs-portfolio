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
}

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
