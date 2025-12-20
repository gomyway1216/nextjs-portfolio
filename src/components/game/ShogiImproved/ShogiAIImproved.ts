/**
 * Shogi AI (Improved / Fast Engine)
 *
 * Why this exists:
 * - The original `/games/shogi` AI was correct but slow because it relied on cloning the entire position at
 *   every node and also cloned again inside legality filtering. In JS/TS this quickly becomes GC-bound.
 * - This implementation is make/unmake based (like typical board engines) and is intended to be fast enough
 *   for in-browser play while still being tactically reasonable.
 *
 * Core ideas:
 * - Iterative deepening (depth 1..N) with a time budget.
 * - Negamax + alpha-beta, with Principal Variation Search (PVS) for extra pruning.
 * - Quiescence search on captures/promotions (and full evasion search while in check) to reduce horizon effect.
 * - Transposition Table (TT) keyed by Zobrist hash (`KyokumenImproved.HashVal`) to reuse work across branches.
 * - Move ordering: TT move first, killer moves, history heuristic, MVV-LVA captures, promotion bonus, drop heuristics.
 *
 * Important invariants:
 * - `KyokumenImproved.move(te)` and `KyokumenImproved.back(te)` DO NOT flip `teban`. The search toggles it explicitly.
 * - `Te.capture` must be correct before `move()` / `back()`; move generation populates it and legality checks must keep it.
 * - `KyokumenImproved.evaluate()` returns a score from SENTE's perspective; this search converts it to "side-to-move"
 *   perspective via `evalForSideToMove()` for negamax.
 */
import { EMPTY, FU, GI, GOTE, HI, KA, KE, KI, KY, SENTE, Te, getKomashu, komaValue } from './types';
import { KyokumenImproved } from './KyokumenImproved';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { TranspositionTableImproved } from './TranspositionTableImproved';
import { TTEntryImproved } from './TTEntryImproved';
import { Difficulty } from '../common/types';

export interface ShogiAISearchOptions {
  /**
   * Higher difficulty increases depth and time budget.
   * You can override `maxDepth` / `maxTimeMs` directly if you want precise control.
   */
  difficulty?: Difficulty;
  /**
   * Maximum depth for iterative deepening.
   * - This is a *search depth*, not a ply counter from the start of the game.
   * - The engine may extend by +1 ply when the side to move is in check.
   */
  maxDepth?: number;
  /**
   * Time budget for the entire move search.
   * - Set to `0` (or any non-positive number) to disable the time limit (useful for deterministic tests).
   */
  maxTimeMs?: number;
  /**
   * Maximum additional depth for quiescence search.
   * Bigger values reduce horizon effect but increase runtime.
   */
  quiescenceDepthMax?: number;
  /**
   * If true, logs search summary for debugging/benchmarking.
   */
  debug?: boolean;

  /**
   * Evaluation profile selector.
   * - `v3` is the tuned default (same cost, more stable openings).
   * - `v2` is the previous default and includes stronger king-safety/castling heuristics.
   * - `v1` is kept for regression/self-play comparisons.
   */
  evaluationMode?: 'v1' | 'v2' | 'v3';
}

class TimeUpError extends Error {
  override name = 'TimeUpError';
}

/**
 * A compact shogi engine optimized for UI usage.
 *
 * Notes on strength vs speed:
 * - Most strength comes from being able to search deeper (speed), then from move ordering, then evaluation.
 * - The evaluation is intentionally simple; this project prioritizes responsiveness.
 */
export class ShogiAIImproved {
  private static readonly INFINITE = 99_999_999;
  private static readonly MATE = 90_000_000;
  private static readonly MAX_PLY = 64;

  private tt: TranspositionTableImproved;

  private leaf = 0;
  private node = 0;
  private startTime = 0;
  private maxTimeMs = 0;
  private quiescenceDepthMax = 0;
  private evaluationMode: 'v1' | 'v2' | 'v3' = 'v3';

  // Extra strength/speed knobs (enabled by higher difficulties).
  private enableAspiration = false;
  private aspirationWindow = 0;
  private enableLMR = false;

  private killer1: number[] = new Array(ShogiAIImproved.MAX_PLY).fill(0);
  private killer2: number[] = new Array(ShogiAIImproved.MAX_PLY).fill(0);
  private history = new Map<number, number>();

  private rootBest: Te | null = null;

  /**
   * `tt` is injected so callers can reuse a transposition table across moves (stronger) or create a fresh one (clean).
   */
  constructor(tt: TranspositionTableImproved = new TranspositionTableImproved()) {
    this.tt = tt;
  }

  clearTT(): void {
    this.tt.clear();
  }

  getStats(): { nodes: number; leaves: number; ttUsage: number } {
    return {
      nodes: this.node,
      leaves: this.leaf,
      ttUsage: this.tt.fillRate(),
    };
  }

  /**
   * We intentionally reset `rootBest` via a method call instead of `this.rootBest = null` inside `getNextTe()`.
   *
   * Reason:
   * - TypeScript's control-flow analysis will treat `this.rootBest` as always `null` after a direct assignment
   *   within the same function (it does not assume `this.search()` mutates the property).
   * - That breaks type narrowing and causes spurious "never" errors even though the runtime behavior is correct.
   */
  private resetRootBest(): void {
    this.rootBest = null;
  }

  private nowMs(): number {
    // `performance.now()` is monotonic and higher resolution, but isn't available in all non-browser environments.
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  private timeUp(): boolean {
    return this.maxTimeMs > 0 && this.nowMs() - this.startTime >= this.maxTimeMs;
  }

  private maybeThrowOnTime(): void {
    // Time checks are surprisingly expensive in tight loops.
    // We sample once per ~2048 visited nodes/leaves to keep overhead tiny.
    const counter = (this.node + this.leaf) | 0;
    if ((counter & 2047) !== 0) return;
    if (this.timeUp()) throw new TimeUpError();
  }

  private toggleTeban(k: KyokumenImproved): void {
    // Keep this as a dedicated helper to make "move, toggle, search, toggle, unmove" easy to audit.
    k.toggleTeban();
  }

  private evalForSideToMove(k: KyokumenImproved): number {
    // `KyokumenImproved.evaluate()` is a SENTE-centric score.
    // Negamax wants "side to move" centric scoring, so we flip the sign when it's GOTE's turn.
    const evalSente =
      this.evaluationMode === 'v1'
        ? k.evaluateV1()
        : this.evaluationMode === 'v2'
          ? k.evaluate()
          : k.evaluateV3();
    return k.teban === SENTE ? evalSente : -evalSente;
  }

  private moveKey(te: Te): number {
    // Compact stable encoding used for killer/history heuristics.
    // (Not required to be globally unique; just needs to be consistent within a run.)
    const piece = te.koma & 0x3f; // keep side flag
    const from = te.from & 0xff;
    const to = te.to & 0xff;
    const promote = te.promote ? 1 : 0;
    return piece | (from << 6) | (to << 14) | (promote << 22);
  }

  private recordKiller(ply: number, key: number): void {
    // "Killer moves" are non-captures that caused a beta cutoff at the same ply elsewhere.
    // They are often good again in similar tactical shapes.
    if (ply < 0 || ply >= ShogiAIImproved.MAX_PLY) return;
    if (this.killer1[ply] !== key) {
      this.killer2[ply] = this.killer1[ply];
      this.killer1[ply] = key;
    }
  }

  private recordHistory(key: number, depthLeft: number): void {
    // History heuristic: reward moves that improved alpha / caused cutoffs deeper in the tree.
    // Using depth^2 is a common quick heuristic.
    const bonus = depthLeft * depthLeft;
    this.history.set(key, (this.history.get(key) ?? 0) + bonus);
  }

  private scoreMove(k: KyokumenImproved, te: Te, ply: number, ttMoveKey: number): number {
    const key = this.moveKey(te);
    let score = 0;

    // 1) Strong ordering signals (TT move, then killers)
    if (ttMoveKey !== 0 && key === ttMoveKey) score += 5_000_000;
    if (key === this.killer1[ply]) score += 2_000_000;
    if (key === this.killer2[ply]) score += 1_500_000;

    // 2) Long-term ordering signal
    const historyScore = this.history.get(key);
    if (historyScore) score += historyScore;

    // 3) Promotions are usually correct/forcing in shogi.
    if (te.promote) score += 400_000;

    // 4) Captures: MVV-LVA-ish. This is cheap and helps alpha-beta a lot.
    if (te.capture !== EMPTY) {
      const victim = Math.abs(komaValue[te.capture]);
      const attacker = Math.abs(komaValue[te.koma]);
      score += 900_000 + victim * 20 - attacker;
    }

    if (te.from === 0) {
      // 5) Drops: drops are a big part of shogi tactics; prioritize major drops and "near-king" drops.
      const pieceType = getKomashu(te.koma);
      score += 150_000;

      if (pieceType === HI) score += 250_000;
      else if (pieceType === KA) score += 180_000;
      else if (pieceType === KI) score += 120_000;
      else if (pieceType === GI) score += 90_000;
      else if (pieceType === KE) score += 40_000;
      else if (pieceType === KY) score += 25_000;
      else if (pieceType === FU) score += 10_000;

      const enemyTeban = k.teban === SENTE ? GOTE : SENTE;
      const enemyKing = k.searchGyoku(enemyTeban);
      if (enemyKing > 0) {
        const dist =
          Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 0x0f) - (enemyKing & 0x0f));
        if (dist <= 4) score += (5 - dist) * 35_000;
      }
    }

    return score;
  }

  private scoreAndSortMoves(k: KyokumenImproved, moves: Te[], ply: number, ttMoveKey: number): void {
    // This mutates `Te.value` purely as a sort key. The move itself remains unchanged.
    for (const te of moves) {
      te.value = this.scoreMove(k, te, ply, ttMoveKey);
    }
    moves.sort((a, b) => b.value - a.value);
  }

  private quiescence(k: KyokumenImproved, alpha: number, beta: number, ply: number, depthLeft: number): number {
    // Quiescence search:
    // - when not in check, we only expand "noisy" moves (captures/promotions) so leaf eval isn't on a tactical cliff.
    // - when in check, we must expand *all* legal evasion moves, otherwise we'd miss forced mates.
    this.leaf++;
    this.maybeThrowOnTime();

    const inCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);

    const standPat = this.evalForSideToMove(k);
    if (!inCheck) {
      if (standPat >= beta) return standPat;
      if (standPat > alpha) alpha = standPat;
      if (depthLeft <= 0) return standPat;
    } else {
      // In check: no stand-pat (must respond)
      if (depthLeft <= 0) depthLeft = 1;
    }

    const allMoves = GenerateMovesImproved.generateLegalMoves(k);
    if (allMoves.length === 0) {
      // No legal moves while side to move is in check => checkmate.
      return -ShogiAIImproved.MATE + ply;
    }

    const moves = inCheck ? allMoves : allMoves.filter((m) => m.capture !== EMPTY || m.promote);
    if (moves.length === 0) return standPat;

    this.scoreAndSortMoves(k, moves, ply, 0);

    for (const te of moves) {
      k.move(te);
      this.toggleTeban(k);

      const score = -this.quiescence(k, -beta, -alpha, ply + 1, depthLeft - 1);

      this.toggleTeban(k);
      k.back(te);

      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) break;
      }
    }

    return alpha;
  }

  private search(k: KyokumenImproved, depthLeft: number, alpha: number, beta: number, ply: number): number {
    if (depthLeft <= 0) {
      return this.quiescence(k, alpha, beta, ply, this.quiescenceDepthMax);
    }

    this.node++;
    this.maybeThrowOnTime();

    const alphaOrig = alpha;

    // Transposition table probe
    const entry = this.tt.get(k.HashVal);
    let ttMoveKey = 0;
    if (entry && entry.best) ttMoveKey = this.moveKey(entry.best);
    if (entry && entry.remainDepth >= depthLeft) {
      if (entry.flag === TTEntryImproved.EXACTLY_VALUE) {
        if (ply === 0 && entry.best) this.rootBest = entry.best.clone();
        return entry.value;
      }
      if (entry.flag === TTEntryImproved.LOWER_BOUND && entry.value >= beta) return entry.value;
      if (entry.flag === TTEntryImproved.UPPER_BOUND && entry.value <= alpha) return entry.value;
    }

    // Check extension: being in check is tactically sharp.
    const parentInCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);
    if (parentInCheck) depthLeft++;

    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) return -ShogiAIImproved.MATE + ply;

    this.scoreAndSortMoves(k, moves, ply, ttMoveKey);

    let bestMove: Te | null = null;
    let searched = 0;

    for (const te of moves) {
      // IMPORTANT: move()/back() do not flip side; we do it explicitly for correctness.
      k.move(te);
      this.toggleTeban(k);

      // Principal Variation Search (PVS):
      // - First move searched with full window.
      // - Later moves searched with a null window (alpha..alpha+1) to prove they don't beat alpha.
      // - If a null-window search beats alpha, re-search with full window.
      const depthNext = depthLeft - 1;
      let score: number;
      if (searched === 0) {
        score = -this.search(k, depthNext, -beta, -alpha, ply + 1);
      } else {
        // Late Move Reductions (LMR):
        // - On deeper nodes, most late "quiet" moves are unlikely to beat alpha.
        // - We search them at reduced depth first; only if they look promising do we re-search fully.
        //
        // This is enabled only on higher difficulties to preserve behavior for Levels 1-3.
        const canLMR =
          this.enableLMR &&
          !parentInCheck &&
          depthNext >= 3 &&
          searched >= 4 &&
          te.from !== 0 && // do not reduce drops; drops are tactically critical in shogi
          te.capture === EMPTY &&
          !te.promote;

        let reducedDepth = depthNext;
        if (canLMR) {
          // Avoid reducing checking moves (tactical) even if they're quiet.
          const givesCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);
          if (!givesCheck) reducedDepth = depthNext - 1;
        }

        // PVS with (optional) reduced-depth probe
        score = -this.search(k, reducedDepth, -alpha - 1, -alpha, ply + 1);

        // If the reduced probe looks better than alpha, verify at full depth.
        if (reducedDepth !== depthNext && score > alpha) {
          score = -this.search(k, depthNext, -alpha - 1, -alpha, ply + 1);
        }

        if (score > alpha && score < beta) {
          score = -this.search(k, depthNext, -beta, -alpha, ply + 1);
        }
      }

      this.toggleTeban(k);
      k.back(te);
      searched++;

      if (score > alpha) {
        alpha = score;
        bestMove = te;
        if (ply === 0) this.rootBest = te.clone();

        if (alpha >= beta) {
          // Beta cutoff heuristics: record ordering info for sibling branches.
          const key = this.moveKey(te);
          if (te.capture === EMPTY) this.recordKiller(ply, key);
          this.recordHistory(key, depthLeft);
          break;
        }
      }
    }

    this.tt.add(k.HashVal, alpha, alphaOrig, beta, bestMove ? bestMove.clone() : null, ply, depthLeft, 0);
    return alpha;
  }

  getNextTe(k: KyokumenImproved, tesu: number = 0, options: ShogiAISearchOptions = {}): Te | null {
    // `tesu` (move number) is kept for API compatibility with older implementations.
    // This engine currently doesn't use it directly.
    void tesu;

    const difficulty = options.difficulty ?? 'medium';
    const defaults: { maxDepth: number; maxTimeMs: number; quiescenceDepthMax: number } = (() => {
      switch (difficulty) {
        case 'easy':
          return { maxDepth: 4, maxTimeMs: 250, quiescenceDepthMax: 4 };
        case 'medium':
          return { maxDepth: 6, maxTimeMs: 800, quiescenceDepthMax: 6 };
        case 'hard':
          return { maxDepth: 8, maxTimeMs: 2000, quiescenceDepthMax: 8 };
        case 'expert':
          return { maxDepth: 10, maxTimeMs: 5000, quiescenceDepthMax: 10 };
        case 'master':
          return { maxDepth: 12, maxTimeMs: 10_000, quiescenceDepthMax: 12 };
      }
    })();

    const maxDepth = Math.max(1, Math.min(options.maxDepth ?? defaults.maxDepth, 32));
    this.maxTimeMs = options.maxTimeMs ?? defaults.maxTimeMs;
    this.quiescenceDepthMax = Math.max(0, options.quiescenceDepthMax ?? defaults.quiescenceDepthMax);
    this.evaluationMode = options.evaluationMode ?? 'v3';

    // Enable extra search techniques only for higher levels to keep Levels 1-3 stable.
    this.enableAspiration = difficulty === 'hard' || difficulty === 'expert' || difficulty === 'master';
    this.aspirationWindow =
      difficulty === 'hard' ? 900
        : difficulty === 'expert' ? 800
          : difficulty === 'master' ? 700
            : 0;
    this.enableLMR = difficulty === 'expert' || difficulty === 'master';

    this.node = 0;
    this.leaf = 0;
    this.resetRootBest();
    this.killer1.fill(0);
    this.killer2.fill(0);
    this.history.clear();

    const start = this.nowMs();
    this.startTime = start;

    // Search on a clone to guarantee we never mutate the caller's position.
    const position = k.clone();

    // Root fallback:
    // Even if the time budget is extremely small, we must return *some* legal move.
    // This avoids "null move" timeouts (UI/match harness) and makes benchmarks more stable.
    const rootMoves = GenerateMovesImproved.generateLegalMoves(position);
    if (rootMoves.length === 0) return null;
    this.scoreAndSortMoves(position, rootMoves, 0, 0);
    let bestMove: Te | null = rootMoves[0]!.clone();
    let bestScore = -ShogiAIImproved.INFINITE;
    let completedDepth = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      try {
        // Reset PV for this iteration; iterative deepening will refine it.
        this.resetRootBest();

        // Aspiration windows:
        // - Use the previous iteration's score as a guess and search a narrow alpha/beta window around it.
        // - If it fails high/low, immediately re-search with a full window.
        //
        // Benefit: fewer nodes on average at deeper depths because most searches stay inside the window.
        const useAspiration = this.enableAspiration && depth >= 2 && bestMove !== null;
        const alpha0 = useAspiration ? bestScore - this.aspirationWindow : -ShogiAIImproved.INFINITE;
        const beta0 = useAspiration ? bestScore + this.aspirationWindow : ShogiAIImproved.INFINITE;

        let score = this.search(position, depth, alpha0, beta0, 0);
        if (useAspiration && (score <= alpha0 || score >= beta0)) {
          // Fail-high/low: re-search full window to get an exact score and stable PV.
          this.resetRootBest();
          score = this.search(position, depth, -ShogiAIImproved.INFINITE, ShogiAIImproved.INFINITE, 0);
        }

        const rootBest = this.rootBest;
        if (rootBest) {
          bestMove = rootBest.clone();
          bestScore = score;
          completedDepth = depth;
        }

        // If a forced mate is found, stop early.
        if (bestScore >= ShogiAIImproved.MATE - 10_000) break;
      } catch (e) {
        if (e instanceof TimeUpError) break;
        throw e;
      }

      if (this.timeUp()) break;
    }

    if (options.debug) {
      const elapsed = this.nowMs() - start;
      console.log(
        `[ShogiAIImproved] depth=${completedDepth}/${maxDepth} score=${bestScore} nodes=${this.node} leaves=${this.leaf} time=${Math.round(elapsed)}ms`
      );
    }

    return bestMove;
  }
}

// Shared instance so the TT can persist across moves during a single game.
// This noticeably improves strength at the same time budget because many positions reoccur (especially via transpositions).
const sharedAI = new ShogiAIImproved();

/**
 * Export getBestMove function for UI compatibility.
 */
export function getBestMove(k: KyokumenImproved, teban: number, difficulty: Difficulty): Te | null {
  // The UI passes `teban` explicitly; keep the position consistent.
  k.setTeban(teban);
  return sharedAI.getNextTe(k, 0, { difficulty });
}
