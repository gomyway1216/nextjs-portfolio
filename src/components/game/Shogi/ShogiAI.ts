/**
 * Shogi AI using Alpha-Beta Pruning + Quiescence + Iterative Deepening
 */

import { Difficulty } from '../common/types';
import { KyokumenImproved } from '../ShogiImproved/KyokumenImproved';
import { getBestMoveV20 as getBestMoveImproved } from '../ShogiImproved/ShogiAIImprovedV20';
import { Te as TeImproved } from '../ShogiImproved/types';
import { generateLegalMoves } from './GenerateMoves';
import { Kyokumen } from './Kyokumen';
import { getOpeningMoveValidated } from './OpeningBookValidated';
import { EMPTY,GOTE,HI,KA,Position,SENTE,Te,getKomashu,komaValue } from './types';

const INFINITE = 99999999;
const LIMIT_DEPTH = 16;

export class ShogiAI {
  // Principal variation (kept for debugging / future use)
  private best: (Te | null)[][];

  private difficulty: Difficulty;

  private leaf: number;
  private node: number;
  private depthMax: number;
  private startTime: number;
  private maxTime: number;

  // NEW: limit for quiescence depth
  private quiescenceDepthMax: number;

  constructor(difficulty: Difficulty = 'medium') {
    this.difficulty = difficulty;
    this.best = Array(LIMIT_DEPTH)
      .fill(null)
      .map(() => Array(LIMIT_DEPTH).fill(null));

    this.leaf = 0;
    this.node = 0;
    this.startTime = 0;

    // Search depth and time limit by difficulty
    // Increased depth for better play - the AI needs to see threats further ahead
    this.depthMax = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6;
    this.maxTime =
      difficulty === 'easy' ? 3000 : difficulty === 'medium' ? 6000 : 12000; // ms

    this.quiescenceDepthMax = 10; // how deep we allow capture-only search
  }

  // Helper: has time limit been reached?
  private timeUp(): boolean {
    return Date.now() - this.startTime > this.maxTime;
  }

  // Check if a move is a drop (piece from hand)
  private isDrop(m: Te): boolean {
    return m.from.suji === 0 && m.from.dan === 0;
  }

  // Calculate drop threat score - how dangerous is this drop?
  private calculateDropScore(m: Te, k: Kyokumen): number {
    if (!this.isDrop(m)) return 0;

    const komashu = getKomashu(m.koma);
    const teban = k.teban;
    let score = 0;

    // Find enemy king position
    const enemyKingPos = k.findKingPosition(teban === SENTE ? GOTE : SENTE);
    if (!enemyKingPos) return 0;

    const distToKing = Math.abs(m.to.suji - enemyKingPos.suji) + Math.abs(m.to.dan - enemyKingPos.dan);

    // ROOK DROPS - Highest priority
    if (komashu === HI) {
      score = 5000; // Base score for rook drop

      // Same file as king = devastating (like ☖２八飛打)
      if (m.to.suji === enemyKingPos.suji) {
        score += 3000;
      }
      // Same rank as king
      if (m.to.dan === enemyKingPos.dan) {
        score += 2500;
      }
      // Back rank drops (dan 1-2 for SENTE attacking, dan 8-9 for GOTE attacking)
      const isBackRank = teban === SENTE ? m.to.dan <= 2 : m.to.dan >= 8;
      if (isBackRank) {
        score += 2000;
      }
      // Proximity to king
      if (distToKing <= 3) {
        score += (4 - distToKing) * 500;
      }
    }
    // BISHOP DROPS
    else if (komashu === KA) {
      score = 3000;

      // Diagonal to king
      const dSuji = Math.abs(m.to.suji - enemyKingPos.suji);
      const dDan = Math.abs(m.to.dan - enemyKingPos.dan);
      if (dSuji === dDan && dSuji > 0) {
        score += 2000;
      }
      // In promotion zone
      const inPromotionZone = teban === SENTE ? m.to.dan <= 3 : m.to.dan >= 7;
      if (inPromotionZone) {
        score += 1000;
      }
      if (distToKing <= 3) {
        score += (4 - distToKing) * 300;
      }
    }
    // GOLD DROPS - Good for king attacks
    else if (komashu === 5) { // KI = 5
      score = 1500;
      if (distToKing <= 2) {
        score += (3 - distToKing) * 800;
      }
    }
    // SILVER DROPS
    else if (komashu === 4) { // GI = 4
      score = 1200;
      if (distToKing <= 2) {
        score += (3 - distToKing) * 600;
      }
    }
    // KNIGHT DROPS - Fork potential
    else if (komashu === 3) { // KE = 3
      score = 800;
      // Knight check positions
      const knightCheck = teban === SENTE ?
        (m.to.dan === enemyKingPos.dan - 2 && Math.abs(m.to.suji - enemyKingPos.suji) === 1) :
        (m.to.dan === enemyKingPos.dan + 2 && Math.abs(m.to.suji - enemyKingPos.suji) === 1);
      if (knightCheck) {
        score += 1500;
      }
    }
    // LANCE DROPS
    else if (komashu === 2) { // KY = 2
      score = 600;
      if (m.to.suji === enemyKingPos.suji) {
        score += 800;
      }
    }
    // PAWN DROPS
    else if (komashu === 1) { // FU = 1
      score = 200;
      if (distToKing <= 2) {
        score += 300;
      }
    }

    return score;
  }

  // Order moves for better alpha-beta pruning
  // Combines MVV-LVA for captures with strong drop threat evaluation
  private orderMoves(moves: Te[], k: Kyokumen): Te[] {
    return moves.sort((a, b) => {
      const aTarget = k.get(a.to);
      const bTarget = k.get(b.to);

      // Calculate capture value (what we're capturing)
      const aCaptureValue = aTarget !== EMPTY ? Math.abs(komaValue[aTarget]) : 0;
      const bCaptureValue = bTarget !== EMPTY ? Math.abs(komaValue[bTarget]) : 0;

      // Calculate drop threat scores
      const aDropScore = this.calculateDropScore(a, k);
      const bDropScore = this.calculateDropScore(b, k);

      // Compare total move value: captures + drop threats
      // Multiply capture value to put it on similar scale as drop scores
      // Promotion gets a LARGE bonus - always prefer promoting when possible
      const aMoveValue = aCaptureValue * 5 + aDropScore + (a.promote ? 2000 : 0);
      const bMoveValue = bCaptureValue * 5 + bDropScore + (b.promote ? 2000 : 0);

      if (aMoveValue !== bMoveValue) {
        return bMoveValue - aMoveValue;
      }

      // For same value, prefer promotion
      if (a.promote && !b.promote) return -1;
      if (!a.promote && b.promote) return 1;

      // Use lower value pieces to capture (LVA - Less Valuable Attacker)
      const aAttackerValue = Math.abs(komaValue[a.koma]);
      const bAttackerValue = Math.abs(komaValue[b.koma]);
      if (aAttackerValue !== bAttackerValue) {
        return aAttackerValue - bAttackerValue;
      }

      // Moves toward enemy king
      const enemyKingPos = k.findKingPosition(k.teban === SENTE ? GOTE : SENTE);
      if (enemyKingPos) {
        const aDistToKing = Math.abs(a.to.suji - enemyKingPos.suji) + Math.abs(a.to.dan - enemyKingPos.dan);
        const bDistToKing = Math.abs(b.to.suji - enemyKingPos.suji) + Math.abs(b.to.dan - enemyKingPos.dan);
        return aDistToKing - bDistToKing;
      }

      return 0;
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

    // Consider captures, promotions, and aggressive major piece drops
    const noisyMoves = generateLegalMoves(k).filter((m) => {
      const target = k.get(m.to);
      // Captures and promotions are always noisy
      if (target !== EMPTY || m.promote) return true;
      // Major piece drops (Rook/Bishop) in enemy territory are noisy
      // For SENTE, enemy territory is dan 1-3
      if (m.from.suji === 0 && m.from.dan === 0) {
        const komashu = getKomashu(m.koma);
        if ((komashu === HI || komashu === KA) && m.to.dan <= 4) {
          return true;
        }
      }
      return false;
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

    // Consider captures, promotions, and aggressive major piece drops
    const noisyMoves = generateLegalMoves(k).filter((m) => {
      const target = k.get(m.to);
      // Captures and promotions are always noisy
      if (target !== EMPTY || m.promote) return true;
      // Major piece drops (Rook/Bishop) in enemy territory are noisy
      // For GOTE, enemy territory is dan 7-9
      if (m.from.suji === 0 && m.from.dan === 0) {
        const komashu = getKomashu(m.koma);
        if ((komashu === HI || komashu === KA) && m.to.dan >= 6) {
          return true;
        }
      }
      return false;
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
      const openingMove = getOpeningMoveValidated(k, moveNumber, k.teban, moveHistory, { difficulty: this.difficulty });
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
      const _te = new Te(
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
  /**
   * `/games/shogi` UI uses the original `Kyokumen` representation and opening book.
   *
   * Performance problem (old approach):
   * - The legacy search clones `Kyokumen` for every node.
   * - Legality filtering (`removeSelfMate`) also cloned per candidate move.
   * This is correct but becomes slow in JS/TS due to heavy allocations + GC.
   *
   * Current approach (fast path):
   * - Use the opening book for early plies (keeps variety and prevents early slow searches).
   * - Convert `Kyokumen` -> `KyokumenImproved` and search using make/unmake + TT.
   * - Convert the chosen move back into the UI-friendly `Te` format.
   *
   * Safety:
   * - Conversion is safe because both engines share the same piece encoding (SENTE/GOTE flags + PROMOTE flag).
   * - We still keep the legacy engine as a fallback in case anything unexpected happens.
   */
  // Ensure caller-provided turn is applied.
  k.teban = teban;

  // Opening book for first 12 plies (keeps variety and avoids slow early searches).
  if (moveNumber <= 12) {
    const openingMove = getOpeningMoveValidated(k, moveNumber, k.teban, moveHistory, { difficulty });
    if (openingMove) {
      console.log(`Using opening book move (move ${moveNumber})`);
      return openingMove;
    }
  }

  // Fast engine: convert position and search with make/unmake + TT.
  const kImproved = convertToImprovedKyokumen(k);
  // `moveNumber` is 1-based in the UI; the improved engine expects 0-based ply (`tesu`).
  const bestImproved = getBestMoveImproved(kImproved, teban, difficulty, Math.max(0, moveNumber - 1));
  if (bestImproved) return convertToMainTe(bestImproved);

  // Fallback (should be rare): legacy clone-based engine.
  const ai = new ShogiAI(difficulty);
  return ai.getNextTe(k, moveNumber, moveHistory);
}

/**
 * Convert from the UI/legacy position into the fast engine position.
 *
 * Representation mapping:
 * - Board: direct copy square-by-square into the 1D array using `(suji<<4)+dan` index.
 * - Hand:
 *   - legacy uses arrays of captured pieces (duplicates as multiple entries)
 *   - improved uses counts per piece code
 * - Turn (`teban`): copy as-is.
 */
function convertToImprovedKyokumen(k: Kyokumen): KyokumenImproved {
  const ki = new KyokumenImproved();

  // Board (same encoding between engines)
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      ki.ban[(suji << 4) + dan] = k.ban[suji][dan];
    }
  }

  // Hands (main engine stores arrays; improved engine stores counts)
  for (let i = 0; i < ki.hand.length; i++) {
    ki.hand[i] = 0;
  }
  for (const koma of k.hand[0]) {
    ki.hand[koma]++;
  }
  for (const koma of k.hand[1]) {
    ki.hand[koma]++;
  }

  ki.teban = k.teban;
  ki.initAll();
  return ki;
}

/**
 * Convert from the fast engine move (`TeImproved`) to the UI/legacy `Te` object.
 * - `from === 0` means a drop in the improved engine, which maps to (0,0) in the UI engine.
 */
function convertToMainTe(te: TeImproved): Te {
  const from =
    te.from === 0 ? new Position(0, 0) : new Position(te.from >> 4, te.from & 0x0f);
  const to = new Position(te.to >> 4, te.to & 0x0f);
  return new Te(te.koma, from, to, te.promote);
}
