/**
 * Shogi AI using Alpha-Beta Pruning + Quiescence + Iterative Deepening
 */

import { Kyokumen } from './Kyokumen';
import { Te, Position, SENTE, GOTE, EMPTY, komaValue } from './types';
import { generateLegalMoves } from './GenerateMoves';
import { Difficulty } from '../common/types';
import { getOpeningMoveComprehensive } from './OpeningBookComprehensive';

const INFINITE = 99999999;
const LIMIT_DEPTH = 16;

export class ShogiAI {
  // Principal variation (kept for debugging / future use)
  private best: (Te | null)[][];

  private leaf: number;
  private node: number;
  private depthMax: number;
  private startTime: number;
  private maxTime: number;

  // NEW: limit for quiescence depth
  private quiescenceDepthMax: number;

  constructor(difficulty: Difficulty = 'medium') {
    this.best = Array(LIMIT_DEPTH)
      .fill(null)
      .map(() => Array(LIMIT_DEPTH).fill(null));

    this.leaf = 0;
    this.node = 0;
    this.startTime = 0;

    // Search depth and time limit by difficulty
    this.depthMax = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5;
    this.maxTime =
      difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 4000 : 8000; // ms

    this.quiescenceDepthMax = 8; // how deep we allow capture-only search
  }

  // Helper: has time limit been reached?
  private timeUp(): boolean {
    return Date.now() - this.startTime > this.maxTime;
  }

  // Order moves for better alpha-beta pruning
  // Slightly upgraded to MVV-LVA style for captures
  private orderMoves(moves: Te[], k: Kyokumen): Te[] {
    return moves.sort((a, b) => {
      const aTarget = k.get(a.to);
      const bTarget = k.get(b.to);

      const aCaptureGain =
        aTarget !== EMPTY
          ? Math.abs(komaValue[aTarget]) - Math.abs(komaValue[a.koma])
          : 0;
      const bCaptureGain =
        bTarget !== EMPTY
          ? Math.abs(komaValue[bTarget]) - Math.abs(komaValue[b.koma])
          : 0;

      // Good captures first
      if (aCaptureGain !== bCaptureGain) {
        return bCaptureGain - aCaptureGain;
      }

      // Promotions next
      if (a.promote && !b.promote) return -1;
      if (!a.promote && b.promote) return 1;

      // Moves toward board center
      const aToCenter =
        Math.abs(a.to.suji - 5) + Math.abs(a.to.dan - 5);
      const bToCenter =
        Math.abs(b.to.suji - 5) + Math.abs(b.to.dan - 5);
      return aToCenter - bToCenter;
    });
  }

  // =========================
  //   QUIESCENCE SEARCH
  // =========================

  // Max node (SENTE to move) – only explore "noisy" moves (captures/promotions)
  private quiescenceMax(
    k: Kyokumen,
    alpha: number,
    beta: number,
    depth: number
  ): number {
    const standPat = k.evaluate();

    if (this.timeUp() || depth >= this.quiescenceDepthMax) {
      return standPat;
    }

    // Alpha-beta on stand-pat evaluation
    if (standPat >= beta) {
      return standPat;
    }
    if (standPat > alpha) {
      alpha = standPat;
    }

    // Only consider captures or promotions
    const noisyMoves = generateLegalMoves(k).filter((m) => {
      const target = k.get(m.to);
      return target !== EMPTY || m.promote;
    });

    if (noisyMoves.length === 0) {
      return standPat;
    }

    const ordered = this.orderMoves(noisyMoves, k);

    for (const te of ordered) {
      const next = k.clone();
      next.move(te);
      next.teban = GOTE;

      const score = this.quiescenceMin(next, alpha, beta, depth + 1);

      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          break; // cutoff
        }
      }
    }

    return alpha;
  }

  // Min node (GOTE to move) – quiescence
  private quiescenceMin(
    k: Kyokumen,
    alpha: number,
    beta: number,
    depth: number
  ): number {
    const standPat = k.evaluate();

    if (this.timeUp() || depth >= this.quiescenceDepthMax) {
      return standPat;
    }

    if (standPat <= alpha) {
      return standPat;
    }
    if (standPat < beta) {
      beta = standPat;
    }

    const noisyMoves = generateLegalMoves(k).filter((m) => {
      const target = k.get(m.to);
      return target !== EMPTY || m.promote;
    });

    if (noisyMoves.length === 0) {
      return standPat;
    }

    const ordered = this.orderMoves(noisyMoves, k);

    for (const te of ordered) {
      const next = k.clone();
      next.move(te);
      next.teban = SENTE;

      const score = this.quiescenceMax(next, alpha, beta, depth + 1);

      if (score < beta) {
        beta = score;
        if (beta <= alpha) {
          break; // cutoff
        }
      }
    }

    return beta;
  }

  // =========================
  //   NORMAL ALPHA–BETA
  // =========================

  private getMax(
    t: Te,
    k: Kyokumen,
    alpha: number,
    beta: number,
    depth: number,
    depthMax: number
  ): number {
    if (this.timeUp()) {
      return k.evaluate();
    }

    // Leaf → go into quiescence instead of raw evaluate()
    if (depth >= depthMax) {
      this.leaf++;
      return this.quiescenceMax(k, alpha, beta, 0);
    }

    this.node++;

    const moves = generateLegalMoves(k);

    // No legal moves: SENTE is checkmated → huge negative
    if (moves.length === 0) {
      return -INFINITE + depth; // depth bonus prefers faster mates
    }

    const v = this.orderMoves(moves, k);

    let value = -INFINITE;

    for (let i = 0; i < v.length; i++) {
      const te = v[i];

      const nextKyokumen = k.clone();
      nextKyokumen.move(te);
      nextKyokumen.teban = GOTE;

      const tmpTe = new Te(
        0,
        new Position(0, 0),
        new Position(0, 0),
        false
      );
      const evaluation = this.getMin(
        tmpTe,
        nextKyokumen,
        alpha,
        beta,
        depth + 1,
        depthMax
      );

      if (evaluation > value) {
        value = evaluation;

        if (evaluation > alpha) {
          alpha = evaluation;
        }

        // Store best move at this depth
        this.best[depth][depth] = te;
        t.koma = te.koma;
        t.from = te.from;
        t.to = te.to;
        t.promote = te.promote;

        for (let j = depth + 1; j < depthMax; j++) {
          this.best[depth][j] = this.best[depth + 1][j];
        }

        if (evaluation >= beta) {
          break; // alpha-beta cutoff
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
    if (this.timeUp()) {
      return k.evaluate();
    }

    // Leaf → quiescence
    if (depth >= depthMax) {
      this.leaf++;
      return this.quiescenceMin(k, alpha, beta, 0);
    }

    this.node++;

    const moves = generateLegalMoves(k);

    // No legal moves: GOTE is checkmated → huge positive
    if (moves.length === 0) {
      return INFINITE - depth;
    }

    const v = this.orderMoves(moves, k);

    let value = INFINITE;

    for (let i = 0; i < v.length; i++) {
      const te = v[i];

      const nextKyokumen = k.clone();
      nextKyokumen.move(te);
      nextKyokumen.teban = SENTE;

      const tmpTe = new Te(
        0,
        new Position(0, 0),
        new Position(0, 0),
        false
      );
      const evaluation = this.getMax(
        tmpTe,
        nextKyokumen,
        alpha,
        beta,
        depth + 1,
        depthMax
      );

      if (evaluation < value) {
        value = evaluation;

        if (evaluation < beta) {
          beta = evaluation;
        }

        this.best[depth][depth] = te;
        t.koma = te.koma;
        t.from = te.from;
        t.to = te.to;
        t.promote = te.promote;

        for (let j = depth + 1; j < depthMax; j++) {
          this.best[depth][j] = this.best[depth + 1][j];
        }

        if (evaluation <= alpha) {
          break; // alpha-beta cutoff
        }
      }
    }

    return value;
  }

  // =========================
  //   PUBLIC ENTRY POINT
  // =========================

  getNextTe(
    k: Kyokumen,
    moveNumber: number = 0,
    moveHistory: Te[] = []
  ): Te | null {
    // Opening book for first 12 plies
    if (moveNumber <= 12) {
      const openingMove = getOpeningMoveComprehensive(
        k,
        moveNumber,
        k.teban,
        moveHistory
      );
      if (openingMove) {
        console.log(`Using opening book move (move ${moveNumber})`);
        return openingMove;
      }
    }

    this.leaf = 0;
    this.node = 0;
    this.startTime = Date.now();

    let bestMove: Te | null = null;
    let finalEval = 0;

    // NEW: Iterative deepening – depth 1 → depthMax
    for (let depth = 1; depth <= this.depthMax; depth++) {
      const te = new Te(
        0,
        new Position(0, 0),
        new Position(0, 0),
        false
      );

      let evalValue: number;
      if (k.teban === SENTE) {
        evalValue = this.getMax(te, k, -INFINITE, INFINITE, 0, depth);
      } else {
        evalValue = this.getMin(te, k, -INFINITE, INFINITE, 0, depth);
      }

      // If time is up after this iteration, stop and use best from previous depth
      if (this.timeUp()) {
        break;
      }

      if (te.koma !== 0) {
        bestMove = te.clone();
        finalEval = evalValue;
      }
    }

    const time = Date.now() - this.startTime;
    console.log(
      `Evaluation: ${finalEval}, Leaves: ${this.leaf}, Nodes: ${this.node}, Time: ${time}ms`
    );

    // If we somehow never found a move (should be rare), fall back to
    // a shallow search once to avoid returning null.
    if (!bestMove) {
      const te = new Te(
        0,
        new Position(0, 0),
        new Position(0, 0),
        false
      );
      const moves = generateLegalMoves(k);
      if (moves.length === 0) return null;
      bestMove = moves[0];
    }

    return bestMove;
  }
}

// Export getBestMove function for compatibility
export function getBestMove(
  k: Kyokumen,
  teban: number,
  difficulty: Difficulty,
  moveNumber: number = 0,
  moveHistory: Te[] = []
): Te | null {
  const ai = new ShogiAI(difficulty);
  return ai.getNextTe(k, moveNumber, moveHistory);
}
