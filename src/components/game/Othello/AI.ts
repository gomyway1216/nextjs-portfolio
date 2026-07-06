/**
 * Othello AI - Alpha-beta search with iterative deepening
 * Based on Thell 3.0.3 implementation
 */

import { Board } from './Board';
import {
Evaluator,
FFEvaluator,
MidEvaluator,
PerfectEvaluator,
WLDEvaluator,
} from './Evaluator';
import {
AIParameter,
AI_PARAMETERS,
BLACK,
Color,
Difficulty,
EMPTY,
Infinity as InfinityVal,
MAX_TURNS,
MULTIPLIER,
Move,
Point,
WHITE,
createMove
} from './types';

/**
 * Options for constructing an OthelloAI.
 * Primarily used by the self-play A/B harness (scripts/othello-ai-match.ts)
 * to swap the mid-game evaluator without touching production defaults.
 */
export interface OthelloAIOptions {
  /** Override the mid-game evaluator (defaults to a fresh MidEvaluator). */
  midEvaluator?: Evaluator;
}

/**
 * AI class implementing alpha-beta search
 */
export class OthelloAI {
  private params: AIParameter;

  // Evaluators for different game phases
  private midEval: Evaluator;
  private wldEval: Evaluator;
  private perfectEval: Evaluator;
  private ffEval: Evaluator;

  // Current evaluator
  private eval: Evaluator;
  private orderingEval: Evaluator;

  // Search state
  private internalNodes: number = 0;
  private leafNodes: number = 0;
  private aborted: boolean = false;

  // Search parameters
  private orderingHeight: number = 4;
  private cachingHeight: number = 4;

  constructor(difficulty: Difficulty = 'medium', options?: OthelloAIOptions) {
    this.params = AI_PARAMETERS[difficulty];

    this.midEval = options?.midEvaluator ?? new MidEvaluator();
    this.wldEval = new WLDEvaluator();
    this.perfectEval = new PerfectEvaluator();
    this.ffEval = new FFEvaluator();

    this.eval = this.midEval;
    this.orderingEval = this.midEval;
  }

  /**
   * Get the best move for the current position
   */
  getBestMove(board: Board): Point | null {
    const movables = board.getMovablePos();

    if (movables.length === 0) {
      return null; // Must pass
    }

    if (movables.length === 1) {
      return movables[0]; // Only one choice
    }

    // Reset search state
    this.internalNodes = 0;
    this.leafNodes = 0;
    this.aborted = false;

    this.eval = this.midEval;
    this.orderingEval = this.midEval;

    board.setupEmptyList();

    let bestMove: Move;

    if (MAX_TURNS - board.getTurns() <= this.params.wldDepth) {
      bestMove = this.moveEndGame(board);
    } else {
      bestMove = this.moveMidGame(board);
    }

    console.log(`AI: nodes=${this.internalNodes}, leaves=${this.leafNodes}, eval=${bestMove.eval}`);

    return { x: bestMove.x, y: bestMove.y };
  }

  /**
   * Mid-game search with iterative deepening
   */
  private moveMidGame(board: Board): Move {
    const limit = this.params.midDepth + this.boostDepth(board.getTurns());

    this.orderingHeight = 4;
    this.cachingHeight = 4;

    let bestMove = createMove(0, 0, -InfinityVal);
    const initialDepth = Math.min(4, limit);

    for (let depth = initialDepth; depth <= limit; depth++) {
      const move = this.topAlphaBeta(board, depth, -InfinityVal, InfinityVal);
      if (!this.aborted) {
        bestMove = move;
      }
    }

    return bestMove;
  }

  /**
   * Endgame search
   */
  private moveEndGame(board: Board): Move {
    const limit = MAX_TURNS - board.getTurns();
    const presearchDepth = Math.max(limit - 9, 0);

    this.orderingHeight = 4;
    this.cachingHeight = 4;

    let bestMove = createMove(0, 0, -InfinityVal);

    // Pre-search with mid-game evaluator
    if (presearchDepth > 0) {
      const initialDepth = Math.min(6, presearchDepth);
      for (let depth = initialDepth; depth <= presearchDepth; depth++) {
        const move = this.topAlphaBeta(board, depth, -InfinityVal, InfinityVal);
        if (!this.aborted) {
          bestMove = move;
        }
      }
    }

    // Set evaluator based on remaining moves
    if (MAX_TURNS - board.getTurns() <= this.params.exactDepth) {
      this.eval = this.perfectEval;
    } else {
      this.eval = this.wldEval;
    }

    this.orderingHeight = 7;
    this.cachingHeight = Math.max(limit - 13, this.orderingHeight);

    // Full endgame search
    bestMove = this.topAlphaBeta(board, limit, -InfinityVal, InfinityVal);

    return bestMove;
  }

  /**
   * Boost search depth based on game progress
   */
  private boostDepth(turns: number): number {
    if (turns >= 38) return 2;
    if (turns >= 30) return 1;
    return 0;
  }

  /**
   * Top-level alpha-beta search
   */
  private topAlphaBeta(board: Board, limit: number, alpha: number, beta: number): Move {
    let evalMax = -InfinityVal;
    let bestPoint: Point = { x: 0, y: 0 };
    let a = alpha;

    const movables = board.getMovablePos();
    this.sortMoves(board, movables);

    for (let i = 0; i < movables.length; i++) {
      const point = movables[i];

      board.move(point);

      let evalScore: number;
      if (i > 0) {
        // Null-window search
        evalScore = -this.alphaBeta(board, limit - 1, -a - 1, -a);
        if (a < evalScore && evalScore < beta) {
          // Re-search with full window
          evalScore = -this.alphaBeta(board, limit - 1, -beta, -evalScore);
        }
      } else {
        evalScore = -this.alphaBeta(board, limit - 1, -beta, -a);
      }

      board.undo();

      if (evalScore >= beta) {
        return createMove(point.x, point.y, evalScore);
      }

      if (this.aborted) break;

      if (evalScore > evalMax) {
        a = Math.max(a, evalScore);
        evalMax = evalScore;
        bestPoint = point;
      }
    }

    return createMove(bestPoint.x, bestPoint.y, evalMax);
  }

  /**
   * Alpha-beta search
   */
  private alphaBeta(board: Board, limit: number, alpha: number, beta: number): number {
    if (limit <= this.orderingHeight) {
      return this.fastAlphaBeta(board, limit, alpha, beta);
    }
    return this.normalAlphaBeta(board, limit, alpha, beta);
  }

  /**
   * Normal alpha-beta with move ordering
   */
  private normalAlphaBeta(board: Board, limit: number, alpha: number, beta: number): number {
    if (limit === 0 || this.aborted) {
      this.leafNodes++;
      return this.eval.evaluate(board);
    }

    this.internalNodes++;

    const movables = board.getMovablePos();

    if (movables.length === 0) {
      // No moves - check if game over or pass
      if (board.isGameOver()) {
        this.leafNodes++;
        return this.eval.evaluate(board);
      }

      board.pass();
      const score = -this.normalAlphaBeta(board, limit, -beta, -alpha);
      board.undo();
      return score;
    }

    // Move ordering for better pruning
    if (MAX_TURNS - board.getTurns() >= 18) {
      this.sortMoves(board, movables);
    } else {
      this.sortMovesFastestFirst(board, movables);
    }

    let scoreMax = -InfinityVal;
    let a = alpha;
    let pvFound = false;

    for (const point of movables) {
      board.move(point);

      let score: number;
      if (pvFound) {
        // Null-window search
        score = -this.alphaBeta(board, limit - 1, -a - 1, -a);
        if (a < score && score < beta) {
          // Re-search with full window
          score = -this.alphaBeta(board, limit - 1, -beta, -score);
        }
      } else {
        score = -this.alphaBeta(board, limit - 1, -beta, -a);
      }

      board.undo();

      if (score >= beta) {
        return score;
      }

      if (score > scoreMax) {
        a = Math.max(a, score);
        scoreMax = score;
        if (score > alpha) pvFound = true;
      }
    }

    return scoreMax;
  }

  /**
   * Fast alpha-beta without move ordering (for shallow searches)
   */
  private fastAlphaBeta(board: Board, limit: number, alpha: number, beta: number): number {
    if (limit === 0) {
      this.leafNodes++;
      return this.eval.evaluate(board);
    }

    this.internalNodes++;

    // Special case for last few moves (endgame optimization)
    if (board.countDisc(EMPTY) <= 4 && this.eval === this.perfectEval) {
      const emptyList = board.getEmptyList();
      if (emptyList.length === 4) {
        return this.last4(board, emptyList[0], emptyList[1], emptyList[2], emptyList[3], alpha, beta);
      }
    }

    const movables = board.getMovablePos();

    if (movables.length === 0) {
      if (board.isGameOver()) {
        this.leafNodes++;
        return this.eval.evaluate(board);
      }

      board.pass();
      const score = -this.fastAlphaBeta(board, limit, -beta, -alpha);
      board.undo();
      return score;
    }

    let scoreMax = -InfinityVal;
    let a = alpha;

    for (const point of movables) {
      board.move(point);
      const score = -this.fastAlphaBeta(board, limit - 1, -beta, -a);
      board.undo();

      if (score >= beta) {
        return score;
      }

      a = Math.max(a, score);
      scoreMax = Math.max(score, scoreMax);
    }

    return scoreMax;
  }

  /**
   * Last 4 moves - hand-expanded endgame solver
   */
  private last4(
    board: Board,
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    alpha: number,
    beta: number
  ): number {
    let evalMax = -InfinityVal;
    let a = alpha;

    if (board.move(p0)) {
      this.internalNodes++;
      evalMax = -this.last3(board, p1, p2, p3, -beta, -a);
      board.undo();
    }

    if (evalMax >= beta) return evalMax;
    if (evalMax > a) a = evalMax;

    if (board.move(p1)) {
      this.internalNodes++;
      evalMax = Math.max(evalMax, -this.last3(board, p0, p2, p3, -beta, -a));
      board.undo();
    }

    if (evalMax >= beta) return evalMax;
    if (evalMax > a) a = evalMax;

    if (board.move(p2)) {
      this.internalNodes++;
      evalMax = Math.max(evalMax, -this.last3(board, p0, p1, p3, -beta, -a));
      board.undo();
    }

    if (evalMax >= beta) return evalMax;
    if (evalMax > a) a = evalMax;

    if (board.move(p3)) {
      this.internalNodes++;
      evalMax = Math.max(evalMax, -this.last3(board, p0, p1, p2, -beta, -a));
      board.undo();
      return evalMax;
    }

    if (evalMax === -InfinityVal) {
      // No valid moves
      if (!board.canMove(-board.getCurrentColor() as Color)) {
        // Game over
        this.leafNodes++;
        return this.eval.evaluate(board);
      }

      this.internalNodes++;
      board.pass();
      evalMax = -this.last4(board, p0, p1, p2, p3, -beta, -alpha);
      board.undo();
    }

    return evalMax;
  }

  /**
   * Last 3 moves
   */
  private last3(board: Board, p0: Point, p1: Point, p2: Point, alpha: number, beta: number): number {
    let evalMax = -InfinityVal;
    let a = alpha;

    if (board.move(p0)) {
      this.internalNodes++;
      evalMax = -this.last2(board, p1, p2, -beta, -a);
      board.undo();
    }

    if (evalMax >= beta) return evalMax;
    if (evalMax > a) a = evalMax;

    if (board.move(p1)) {
      this.internalNodes++;
      evalMax = Math.max(evalMax, -this.last2(board, p0, p2, -beta, -a));
      board.undo();
    }

    if (evalMax >= beta) return evalMax;
    if (evalMax > a) a = evalMax;

    if (board.move(p2)) {
      this.internalNodes++;
      evalMax = Math.max(evalMax, -this.last2(board, p0, p1, -beta, -a));
      board.undo();
      return evalMax;
    }

    if (evalMax === -InfinityVal) {
      if (!board.canMove(-board.getCurrentColor() as Color)) {
        this.leafNodes++;
        return this.eval.evaluate(board);
      }

      this.internalNodes++;
      board.pass();
      evalMax = -this.last3(board, p0, p1, p2, -beta, -alpha);
      board.undo();
    }

    return evalMax;
  }

  /**
   * Last 2 moves
   */
  private last2(board: Board, p0: Point, p1: Point, alpha: number, beta: number): number {
    let evalMax = -InfinityVal;

    if (board.move(p0)) {
      this.internalNodes++;
      evalMax = -this.last1(board, p1);
      board.undo();
    }

    if (evalMax >= beta) return evalMax;

    if (board.move(p1)) {
      this.internalNodes++;
      evalMax = Math.max(evalMax, -this.last1(board, p0));
      board.undo();
      return evalMax;
    }

    if (evalMax === -InfinityVal) {
      if (!board.canMove(-board.getCurrentColor() as Color)) {
        this.leafNodes++;
        return this.eval.evaluate(board);
      }

      this.internalNodes++;
      board.pass();
      evalMax = -this.last2(board, p0, p1, -beta, -alpha);
      board.undo();
    }

    return evalMax;
  }

  /**
   * Last 1 move - use fast check
   */
  private last1(board: Board, p: Point): number {
    const currentDiff = board.countDisc(BLACK) - board.countDisc(WHITE);
    const fr = board.fastCheckFinalResult(p);

    // Check if the move is valid
    if (fr !== currentDiff + board.getCurrentColor()) {
      // Valid move - return result
      this.leafNodes++;
      return board.getCurrentColor() * MULTIPLIER * fr;
    }

    // No valid move
    if (!board.canMove(-board.getCurrentColor() as Color)) {
      this.leafNodes++;
      return board.getCurrentColor() * MULTIPLIER * currentDiff;
    }

    this.internalNodes++;
    board.pass();
    const result = -this.last1(board, p);
    board.undo();

    return result;
  }

  /**
   * Sort moves by evaluation score
   */
  private sortMoves(board: Board, movables: Point[]): void {
    if (movables.length <= 1) return;

    const moves: Move[] = movables.map((p) => {
      board.move(p);
      const evalScore = -this.orderingEval.evaluate(board);
      board.undo();
      return createMove(p.x, p.y, evalScore);
    });

    moves.sort((a, b) => b.eval - a.eval);

    for (let i = 0; i < movables.length; i++) {
      movables[i] = { x: moves[i].x, y: moves[i].y };
    }
  }

  /**
   * Sort moves by mobility (fastest-first)
   */
  private sortMovesFastestFirst(board: Board, movables: Point[]): void {
    if (movables.length <= 1) return;

    const savedEval = this.orderingEval;
    this.orderingEval = this.ffEval;
    this.sortMoves(board, movables);
    this.orderingEval = savedEval;
  }

  /**
   * Get search statistics
   */
  getStats(): { internalNodes: number; leafNodes: number } {
    return {
      internalNodes: this.internalNodes,
      leafNodes: this.leafNodes,
    };
  }
}

/**
 * Helper function to get AI move
 */
export function getAIMove(board: Board, difficulty: Difficulty = 'medium'): Point | null {
  const ai = new OthelloAI(difficulty);
  return ai.getBestMove(board);
}
