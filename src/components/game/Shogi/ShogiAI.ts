/**
 * Shogi AI using Alpha-Beta Pruning - Direct conversion from Java
 */

import { Kyokumen } from './Kyokumen';
import { Te, Position, SENTE, GOTE, EMPTY, komaValue } from './types';
import { generateLegalMoves } from './GenerateMoves';
import { Difficulty } from '../common/types';

const INFINITE = 99999999;
const LIMIT_DEPTH = 16;

export class ShogiAI {
  private best: Te[][];
  private leaf: number;
  private node: number;
  private depthMax: number;
  private startTime: number;
  private maxTime: number;

  constructor(difficulty: Difficulty = 'medium') {
    this.best = Array(LIMIT_DEPTH).fill(0).map(() => Array(LIMIT_DEPTH).fill(null));
    this.leaf = 0;
    this.node = 0;
    this.startTime = 0;

    // Set search depth and time limit based on difficulty (increased for stronger play)
    this.depthMax = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
    this.maxTime = difficulty === 'easy' ? 5000 : difficulty === 'medium' ? 10000 : 20000; // ms
  }

  // Order moves for better alpha-beta pruning
  private orderMoves(moves: Te[], k: Kyokumen): Te[] {
    return moves.sort((a, b) => {
      // Check if moves are captures
      const aTarget = k.get(a.to);
      const bTarget = k.get(b.to);
      const aCaptureValue = aTarget !== EMPTY ? Math.abs(komaValue[aTarget]) : 0;
      const bCaptureValue = bTarget !== EMPTY ? Math.abs(komaValue[bTarget]) : 0;

      // Captures first (high value captures before low value)
      if (aCaptureValue !== bCaptureValue) {
        return bCaptureValue - aCaptureValue;
      }

      // Promotions next
      if (a.promote && !b.promote) return -1;
      if (!a.promote && b.promote) return 1;

      // Moves toward center
      const aToCenter = Math.abs(a.to.suji - 5) + Math.abs(a.to.dan - 5);
      const bToCenter = Math.abs(b.to.suji - 5) + Math.abs(b.to.dan - 5);
      return aToCenter - bToCenter;
    });
  }

  private getMax(
    t: Te,
    k: Kyokumen,
    alpha: number,
    beta: number,
    depth: number,
    depthMax: number
  ): number {
    // Check time limit
    if (Date.now() - this.startTime > this.maxTime) {
      return k.evaluate();
    }

    // Leaf node - return evaluation
    if (depth >= depthMax) {
      this.leaf++;
      return k.evaluate();
    }

    this.node++;

    // Generate and order legal moves
    const moves = generateLegalMoves(k);

    // No moves - return evaluation
    if (moves.length === 0) {
      return k.evaluate();
    }

    // Order moves for better pruning
    const v = this.orderMoves(moves, k);

    // Current best value
    let value = -INFINITE;

    // Try each move
    for (let i = 0; i < v.length; i++) {
      const te = v[i];

      // Make move
      const nextKyokumen = k.clone();
      nextKyokumen.move(te);
      nextKyokumen.teban = GOTE;

      // Recursively evaluate
      const tmpTe = new Te(0, new Position(0, 0), new Position(0, 0), false);
      const evaluation = this.getMin(tmpTe, nextKyokumen, alpha, beta, depth + 1, depthMax);

      // Update best move
      if (evaluation > value) {
        value = evaluation;

        // Update alpha
        if (evaluation > alpha) {
          alpha = evaluation;
        }

        // Update best move at this depth
        this.best[depth][depth] = te;
        t.koma = te.koma;
        t.from = te.from;
        t.to = te.to;
        t.promote = te.promote;

        // Update principal variation
        for (let j = depth + 1; j < depthMax; j++) {
          this.best[depth][j] = this.best[depth + 1][j];
        }

        // Alpha-beta cutoff
        if (evaluation >= beta) {
          break;
        }
      }
    }

    return value;
  }

  private getMin(
    t: Te,
    k: Kyokumen,
    alpha: number,
    beta: number,
    depth: number,
    depthMax: number
  ): number {
    // Check time limit
    if (Date.now() - this.startTime > this.maxTime) {
      return k.evaluate();
    }

    // Leaf node - return evaluation
    if (depth >= depthMax) {
      this.leaf++;
      return k.evaluate();
    }

    this.node++;

    // Generate and order legal moves
    const moves = generateLegalMoves(k);

    // No moves - return evaluation
    if (moves.length === 0) {
      return k.evaluate();
    }

    // Order moves for better pruning
    const v = this.orderMoves(moves, k);

    // Current best value
    let value = INFINITE;

    // Try each move
    for (let i = 0; i < v.length; i++) {
      const te = v[i];

      // Make move
      const nextKyokumen = k.clone();
      nextKyokumen.move(te);
      nextKyokumen.teban = SENTE;

      // Recursively evaluate
      const tmpTe = new Te(0, new Position(0, 0), new Position(0, 0), false);
      const evaluation = this.getMax(tmpTe, nextKyokumen, alpha, beta, depth + 1, depthMax);

      // Update best move
      if (evaluation < value) {
        value = evaluation;

        // Update beta
        if (evaluation < beta) {
          beta = evaluation;
        }

        // Update best move at this depth
        this.best[depth][depth] = te;
        t.koma = te.koma;
        t.from = te.from;
        t.to = te.to;
        t.promote = te.promote;

        // Update principal variation
        for (let j = depth + 1; j < depthMax; j++) {
          this.best[depth][j] = this.best[depth + 1][j];
        }

        // Alpha-beta cutoff
        if (evaluation <= alpha) {
          break;
        }
      }
    }

    return value;
  }

  // Get next move for AI
  getNextTe(k: Kyokumen): Te | null {
    this.leaf = 0;
    this.node = 0;
    this.startTime = Date.now();

    const te = new Te(0, new Position(0, 0), new Position(0, 0), false);

    let evalValue: number;
    if (k.teban === SENTE) {
      evalValue = this.getMax(te, k, -INFINITE, INFINITE, 0, this.depthMax);
    } else {
      evalValue = this.getMin(te, k, -INFINITE, INFINITE, 0, this.depthMax);
    }

    const time = Date.now() - this.startTime;
    console.log(`Evaluation: ${evalValue}, Leaves: ${this.leaf}, Nodes: ${this.node}, Time: ${time}ms`);

    // Return null if no valid move found
    if (te.koma === 0) {
      return null;
    }

    return te;
  }
}

// Export getBestMove function for compatibility
export function getBestMove(
  k: Kyokumen,
  teban: number,
  difficulty: Difficulty
): Te | null {
  const ai = new ShogiAI(difficulty);
  return ai.getNextTe(k);
}
