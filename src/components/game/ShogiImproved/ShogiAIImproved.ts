import { SENTE, GOTE, Te } from './types';
import { KyokumenImproved } from './KyokumenImproved';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { TranspositionTableImproved } from './TranspositionTableImproved';
import { TTEntryImproved } from './TTEntryImproved';

export class ShogiAIImproved {
  // Search constants
  private static readonly INFINITE = 99999999;
  private static readonly DEPTH_MAX = 5; // Increased from 4 for better play
  private static readonly LIMIT_DEPTH = 16;

  // Transposition table
  private tt: TranspositionTableImproved;

  // Best move sequence storage
  private best: (Te | null)[][];

  // Node counters for debugging
  private leaf: number;
  private node: number;

  constructor() {
    this.tt = new TranspositionTableImproved();
    this.best = Array(ShogiAIImproved.LIMIT_DEPTH).fill(null).map(() =>
      Array(ShogiAIImproved.LIMIT_DEPTH).fill(null)
    );
    this.leaf = 0;
    this.node = 0;
  }

  // Negamax search with alpha-beta pruning
  private negaMax(
    t: Te,
    k: KyokumenImproved,
    alpha: number,
    beta: number,
    depth: number,
    depthMax: number
  ): number {
    // Reached maximum depth - return evaluation
    if (depth >= depthMax) {
      this.leaf++;
      if (k.teban === SENTE) {
        return k.evaluate();
      } else {
        return -k.evaluate();
      }
    }

    this.node++;

    // Check transposition table
    const e = this.tt.get(k.HashVal);
    if (e !== null) {
      if (e.value >= beta && e.depth <= depth && e.remainDepth >= depthMax - depth &&
          e.flag !== TTEntryImproved.UPPER_BOUND) {
        return e.value;
      }
      if (e.value <= alpha && e.depth <= depth && e.remainDepth >= depthMax - depth &&
          e.flag !== TTEntryImproved.LOWER_BOUND) {
        return e.value;
      }
    }

    // Initialize value to negative infinity
    let value = -ShogiAIImproved.INFINITE;

    // Try priority moves first
    const priorityMoves = GenerateMovesImproved.makeMoveFirst(k, depth, this.best, e);

    for (const te of priorityMoves) {
      // Make the move
      k.move(te);

      // Switch turn (move() doesn't do this)
      if (k.teban === SENTE) {
        k.teban = GOTE;
      } else {
        k.teban = SENTE;
      }

      // Recursively evaluate
      const tmpTe = new Te();
      const evaluation = -this.negaMax(tmpTe, k, -beta, -alpha, depth + 1, depthMax);

      // Undo the move
      k.back(te);

      // Switch turn back
      if (k.teban === SENTE) {
        k.teban = GOTE;
      } else {
        k.teban = SENTE;
      }

      // Update best value
      if (evaluation > value) {
        value = evaluation;

        // Update alpha
        if (evaluation > alpha) {
          alpha = evaluation;
        }

        // Update best move
        this.best[depth][depth] = te;
        t.koma = te.koma;
        t.from = te.from;
        t.to = te.to;
        t.promote = te.promote;

        // Update best sequence
        for (let j = depth + 1; j < depthMax; j++) {
          this.best[depth][j] = this.best[depth + 1][j];
        }

        // Beta cutoff
        if (evaluation >= beta) {
          this.tt.add(k.HashVal, value, alpha, beta, this.best[depth][depth],
            depth, depthMax - depth, 0);
          return evaluation;
        }
      }
    }

    // Generate all legal moves
    const v = GenerateMovesImproved.generateLegalMoves(k);

    // Evaluate and sort moves
    GenerateMovesImproved.evaluateTe(k, v);

    // Try all moves
    for (const te of v) {
      // Skip if move value is too low and we already have something
      if (te.value < -100 && value > -ShogiAIImproved.INFINITE) {
        break;
      }

      // Make the move
      k.move(te);

      // Switch turn
      if (k.teban === SENTE) {
        k.teban = GOTE;
      } else {
        k.teban = SENTE;
      }

      // Recursively evaluate
      const tmpTe = new Te();
      const evaluation = -this.negaMax(tmpTe, k, -beta, -alpha, depth + 1, depthMax);

      // Undo the move
      k.back(te);

      // Switch turn back
      if (k.teban === SENTE) {
        k.teban = GOTE;
      } else {
        k.teban = SENTE;
      }

      // Update best value
      if (evaluation > value) {
        value = evaluation;

        // Update alpha
        if (evaluation > alpha) {
          alpha = evaluation;
        }

        // Update best move
        this.best[depth][depth] = te;
        t.koma = te.koma;
        t.from = te.from;
        t.to = te.to;
        t.promote = te.promote;

        // Update best sequence
        for (let j = depth + 1; j < depthMax; j++) {
          this.best[depth][j] = this.best[depth + 1][j];
        }

        // Beta cutoff
        if (evaluation >= beta) {
          break;
        }
      }
    }

    // Store in transposition table
    this.tt.add(k.HashVal, value, alpha, beta, this.best[depth][depth],
      depth, depthMax - depth, 0);

    return value;
  }

  // Iterative deepening
  private ITDeep(k: KyokumenImproved, alpha: number, beta: number, depth: number, depthMax: number): number {
    let retval = -ShogiAIImproved.INFINITE;
    const te = new Te();

    for (let i = depth + 1; i <= depthMax; i++) {
      retval = this.negaMax(te, k, alpha, beta, depth, i);
    }

    return retval;
  }

  // Get next move for the AI
  getNextTe(k: KyokumenImproved, tesu: number = 0): Te | null {
    this.leaf = 0;
    this.node = 0;

    const startTime = Date.now();

    // Clone the position to avoid modifying the original
    const kCopy = k.clone();

    // Search for best move
    const te = new Te();
    const v = this.ITDeep(kCopy, -ShogiAIImproved.INFINITE, ShogiAIImproved.INFINITE, 0, ShogiAIImproved.DEPTH_MAX);

    if (v > -ShogiAIImproved.INFINITE) {
      const result = this.best[0][0];

      const endTime = Date.now();
      const time = endTime - startTime;

      console.log(`Evaluation: ${v}`);
      console.log(`Best sequence: ${this.getBestSequenceString()}`);
      console.log(`Nodes: ${this.node}, Leaves: ${this.leaf}, Time: ${time}ms`);
      console.log(`TT fill rate: ${this.tt.fillRate().toFixed(2)}%`);

      return result;
    }

    return null;
  }

  // Get best move sequence as string
  private getBestSequenceString(): string {
    let s = "";
    for (let i = 0; i < ShogiAIImproved.DEPTH_MAX; i++) {
      if (this.best[0][i]) {
        s += this.best[0][i]!.toString() + " ";
      }
    }
    return s;
  }

  // Clear transposition table
  clearTT(): void {
    this.tt.clear();
  }

  // Get statistics
  getStats(): { nodes: number; leaves: number; ttUsage: number } {
    return {
      nodes: this.node,
      leaves: this.leaf,
      ttUsage: this.tt.fillRate()
    };
  }
}

/**
 * Export getBestMove function for compatibility with UI
 */
export function getBestMove(
  k: KyokumenImproved,
  teban: number,
  difficulty: 'easy' | 'medium' | 'hard'
): Te | null {
  // Set the board to the correct turn
  k.teban = teban;

  // Adjust depth based on difficulty
  const depthMap = { easy: 2, medium: 3, hard: 4 };
  const ai = new ShogiAIImproved();
  // Note: ShogiAIImproved uses fixed DEPTH_MAX, we could make it configurable later

  return ai.getNextTe(k);
}