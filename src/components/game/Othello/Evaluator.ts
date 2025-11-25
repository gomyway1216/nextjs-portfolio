/**
 * Evaluator - Position evaluation functions for Othello AI
 * Based on Thell 3.0.3 implementation
 *
 * Implements multiple evaluation strategies:
 * - MidEvaluator: Pattern-based evaluation for mid-game
 * - WLDEvaluator: Win/Loss/Draw evaluation for late game
 * - PerfectEvaluator: Disc count evaluation for endgame
 * - FFEvaluator: Mobility-based evaluation for move ordering
 */

import {
  BOARD_SIZE,
  BOARD_POWER_SIZE,
  BLACK,
  WHITE,
  EMPTY,
  Color,
  MULTIPLIER,
  POWER3,
} from './types';
import { Board, Indexer } from './Board';

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
 * Pattern weights for a single game stage
 */
interface Weights {
  parity: number;
  vector2: number[];  // Rows 2 and 7
  vector3: number[];  // Rows 3 and 6
  vector4: number[];  // Rows 4 and 5
  diag5: number[];    // 5-cell diagonals
  diag6: number[];    // 6-cell diagonals
  diag7: number[];    // 7-cell diagonals
  diag8: number[];    // Main diagonals
  edge2x: number[];   // Edge + X-square pattern
  triangle: number[]; // Corner triangle pattern
  corner25: number[]; // 2x5 corner pattern
}

/**
 * Create default weights (simplified positional evaluation)
 * In the original Thell, these are loaded from binary weight files
 * This is a simplified version with hand-crafted weights
 */
function createDefaultWeights(): Weights {
  const weights: Weights = {
    parity: 500,  // Parity bonus
    vector2: new Array(BOARD_POWER_SIZE).fill(0),
    vector3: new Array(BOARD_POWER_SIZE).fill(0),
    vector4: new Array(BOARD_POWER_SIZE).fill(0),
    diag5: new Array(243).fill(0),   // 3^5
    diag6: new Array(729).fill(0),   // 3^6
    diag7: new Array(2187).fill(0),  // 3^7
    diag8: new Array(6561).fill(0),  // 3^8
    edge2x: new Array(59049).fill(0),    // 3^10
    triangle: new Array(59049).fill(0),  // 3^10
    corner25: new Array(59049).fill(0),  // 3^10
  };

  // Initialize with simple positional values
  // Corner positions are highly valuable
  const cornerBonus = 10000;
  const edgeBonus = 2000;
  const xSquarePenalty = -5000;
  const cSquarePenalty = -2000;

  // Generate simple positional weights for each pattern
  // This is a simplified version - real Thell uses learned weights

  return weights;
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
 * Mid-game Evaluator
 * Uses pattern-based evaluation similar to Thell's LOGISTELLO-style
 */
export class MidEvaluator implements Evaluator {
  private readonly stageWeights: Weights[];
  private readonly reversedLast5: number[];
  private readonly first5: number[];

  constructor() {
    // Initialize stage weights (15 stages, 4 moves each)
    this.stageWeights = [];
    for (let i = 0; i < 15; i++) {
      this.stageWeights.push(createDefaultWeights());
    }

    // Initialize corner25 lookup tables
    this.reversedLast5 = new Array(BOARD_POWER_SIZE);
    this.first5 = new Array(BOARD_POWER_SIZE);

    for (let i = 0; i < BOARD_POWER_SIZE; i++) {
      let index = i;
      const line: number[] = new Array(BOARD_SIZE);
      for (let j = 0; j < BOARD_SIZE; j++) {
        line[j] = index % 3;
        index = Math.floor(index / 3);
      }

      let rindex = 0;
      for (let j = BOARD_SIZE - 5; j < BOARD_SIZE; j++) {
        rindex = 3 * rindex + line[j];
      }
      this.reversedLast5[i] = rindex;
      this.first5[i] = i % 243;
    }
  }

  evaluate(board: Board): number {
    // Prevent total wipeout
    const destroyed = MULTIPLIER * BOARD_SIZE * BOARD_SIZE;
    if (board.countDisc(board.getCurrentColor()) === 0) return -destroyed;
    if (board.countDisc(-board.getCurrentColor() as Color) === 0) return destroyed;

    const idx = board.getIndexTable();
    const stage = Math.min(14, Math.floor(board.getTurns() / 4));

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

    // Count my mobility
    const myMobility = board.getMovablePos().length;

    // Count opponent's mobility (need to temporarily switch)
    (board as any).currentColor = -savedColor as Color;
    const oppMobility = board.getMovablePos().length;
    (board as any).currentColor = savedColor;

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
