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
 * V6 additions:
 * - Evaluation caching (direct-mapped) so leaf evaluation is cheaper => deeper search under the same time budget.
 * - Opening-aware root move ordering (quiet development + basic pawn pushes) to avoid "random-looking" openings.
 *
 * It also includes V5 features:
 * - Mate-distance bounds to stabilize alpha/beta around mate scores.
 * - Check-aware quiescence: expands checking moves in addition to captures/promotions (bounded).
 *
 * It also includes V4 features (repetition handling + TT second-best ordering + root fallback move).
 *
 * Important invariants:
 * - `KyokumenImproved.move(te)` and `KyokumenImproved.back(te)` DO NOT flip `teban`. The search toggles it explicitly.
 * - `Te.capture` must be correct before `move()` / `back()`; move generation populates it and legality checks must keep it.
 * - `KyokumenImproved.evaluate()` returns a score from SENTE's perspective; this search converts it to "side-to-move"
 *   perspective via `evalForSideToMove()` for negamax.
 */
import { EMPTY, FU, GI, GOTE, HI, KA, KE, KI, KY, OU, SENTE, Te, getKomashu, komaValue } from './types';
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
   * - `v2` is the default and includes stronger king-safety/castling heuristics.
   * - `v1` is kept for regression/self-play comparisons.
   */
  evaluationMode?: 'v1' | 'v2';
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
export class ShogiAIImprovedV6 {
  private static readonly INFINITE = 99_999_999;
  private static readonly MATE = 90_000_000;
  private static readonly MAX_PLY = 64;

  // Evaluation cache (direct-mapped).
  // We cache *SENTE-perspective* evaluation keyed by (BanHash ^ HandHash),
  // which intentionally does NOT include side-to-move (evaluation is position-only).
  private static readonly EVAL_CACHE_SIZE = 1 << 17; // 131,072 entries
  private static readonly EVAL_CACHE_SENTINEL = 0x7fffffff;

  private tt: TranspositionTableImproved;

  private leaf = 0;
  private node = 0;
  private startTime = 0;
  private maxTimeMs = 0;
  private quiescenceDepthMax = 0;
  private evaluationMode: 'v1' | 'v2' = 'v2';

  // Root move number (ply from the start of the game).
  // Used only for root move ordering (opening phase).
  private rootTesu = 0;
  private rootHandTotal = 0;
  private rootInCheck = false;

  // Two small caches so evalMode switching stays correct.
  private evalCacheKeyV1: Int32Array;
  private evalCacheValV1: Int32Array;
  private evalCacheKeyV2: Int32Array;
  private evalCacheValV2: Int32Array;

  // Repetition handling (sennichite) within the current search path.
  // HashVal already includes side-to-move, so a repeated `HashVal` means an actual repetition state.
  private enableRepetition = true;
  private drawContempt = 0;
  private repetitionCount = new Map<number, number>();
  private repetitionStack: number[] = [];

  // Null-move pruning (enabled only for higher difficulties to keep early levels stable).
  private enableNullMove = false;
  private nullMoveReduction = 2;

  // Check extensions (enabled only for higher difficulties to keep early levels stable).
  private enableCheckExtension = false;
  private checkExtensionMaxPly = 0;

  // Quiescence delta pruning (speed).
  private enableDeltaPruning = false;
  private deltaPruningMargin = 0;

  // Check-aware quiescence (strength).
  private enableQuiescenceChecks = false;
  private quiescenceCheckMoveLimit = 0;
  private quiescenceCheckTryLimit = 0;

  // Extra strength/speed knobs (enabled by higher difficulties).
  private enableAspiration = false;
  private aspirationWindow = 0;
  private enableLMR = false;

  private killer1: number[] = new Array(ShogiAIImprovedV6.MAX_PLY).fill(0);
  private killer2: number[] = new Array(ShogiAIImprovedV6.MAX_PLY).fill(0);
  private history = new Map<number, number>();

  private rootBest: Te | null = null;

  /**
   * `tt` is injected so callers can reuse a transposition table across moves (stronger) or create a fresh one (clean).
   */
  constructor(tt: TranspositionTableImproved = new TranspositionTableImproved()) {
    this.tt = tt;

    this.evalCacheKeyV1 = new Int32Array(ShogiAIImprovedV6.EVAL_CACHE_SIZE);
    this.evalCacheValV1 = new Int32Array(ShogiAIImprovedV6.EVAL_CACHE_SIZE);
    this.evalCacheKeyV2 = new Int32Array(ShogiAIImprovedV6.EVAL_CACHE_SIZE);
    this.evalCacheValV2 = new Int32Array(ShogiAIImprovedV6.EVAL_CACHE_SIZE);

    this.evalCacheKeyV1.fill(ShogiAIImprovedV6.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV2.fill(ShogiAIImprovedV6.EVAL_CACHE_SENTINEL);
  }

  clearTT(): void {
    this.tt.clear();
    // Also clear eval caches for reproducibility across games (optional but helps deterministic benchmarks).
    this.evalCacheKeyV1.fill(ShogiAIImprovedV6.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV2.fill(ShogiAIImprovedV6.EVAL_CACHE_SENTINEL);
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
    const evalSente = this.evaluateSenteCached(k);
    return k.teban === SENTE ? evalSente : -evalSente;
  }

  private evaluateSenteCached(k: KyokumenImproved): number {
    const key = (k.BanHash ^ k.HandHash) | 0;
    const index = key & (ShogiAIImprovedV6.EVAL_CACHE_SIZE - 1);

    if (this.evaluationMode === 'v1') {
      if (this.evalCacheKeyV1[index] === key) return this.evalCacheValV1[index] | 0;
      const value = k.evaluateV1() | 0;
      this.evalCacheKeyV1[index] = key;
      this.evalCacheValV1[index] = value;
      return value;
    }

    if (this.evalCacheKeyV2[index] === key) return this.evalCacheValV2[index] | 0;
    const value = k.evaluate() | 0;
    this.evalCacheKeyV2[index] = key;
    this.evalCacheValV2[index] = value;
    return value;
  }

  private repetitionDrawScore(k: KyokumenImproved): number {
    // A true repetition is a draw.
    //
    // Returning pure 0 is "neutral", but it can cause the engine to happily repeat forever even when it's winning,
    // especially in tactical perpetual-check shapes.
    //
    // We use a tiny contempt factor:
    // - if side-to-move is ahead (positive), make draw slightly bad => prefer playing on
    // - if side-to-move is behind (negative), make draw slightly good => prefer stabilizing
    //
    // The magnitude must stay much smaller than a pawn (100) to avoid turning safe draws into blunders.
    const standPat = this.evalForSideToMove(k);
    if (this.drawContempt <= 0) return 0;
    if (standPat > 0) return -this.drawContempt;
    if (standPat < 0) return this.drawContempt;
    return 0;
  }

  private promotionGain(te: Te): number {
    if (!te.promote) return 0;
    const side = te.koma & (SENTE | GOTE);
    const type = getKomashu(te.koma);
    const promoted = side | (type + 8);
    return Math.max(0, Math.abs(komaValue[promoted]) - Math.abs(komaValue[te.koma]));
  }

  private pushRepetition(hash: number): boolean {
    // Shogi sennichite is 4 occurrences of the same position+turn.
    // If we've already seen this position 3 times on the current path, the 4th would be a draw.
    const prev = this.repetitionCount.get(hash) ?? 0;
    if (prev >= 3) return false;

    this.repetitionCount.set(hash, prev + 1);
    this.repetitionStack.push(hash);
    return true;
  }

  private popRepetition(): void {
    const hash = this.repetitionStack.pop();
    if (hash === undefined) return;

    const prev = this.repetitionCount.get(hash) ?? 0;
    if (prev <= 1) this.repetitionCount.delete(hash);
    else this.repetitionCount.set(hash, prev - 1);
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
    if (ply < 0 || ply >= ShogiAIImprovedV6.MAX_PLY) return;
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

  private scoreMove(k: KyokumenImproved, te: Te, ply: number, ttMoveKey: number, ttSecondMoveKey: number): number {
    const key = this.moveKey(te);
    let score = 0;

    // Cache enemy king position cheaply (avoid scanning the board).
    // `KyokumenImproved` maintains `kingS` / `kingG` incrementally via move()/back().
    const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;

    // 1) Strong ordering signals (TT move, then killers)
    if (ttMoveKey !== 0 && key === ttMoveKey) score += 5_000_000;
    // Some TT implementations also store a "second best"; it's often a strong alternative.
    if (ttSecondMoveKey !== 0 && key === ttSecondMoveKey) score += 4_000_000;
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

      if (enemyKing > 0) {
        const dist =
          Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 0x0f) - (enemyKing & 0x0f));
        if (dist <= 4) score += (5 - dist) * 35_000;
      }
    } else {
      // 6) Quiet attacker moves that approach the enemy king are often tactical and good to search earlier,
      // especially when quiescence is allowed to include a limited number of quiet checking moves.
      if (enemyKing > 0) {
        const pieceType = getKomashu(te.koma);
        const isAttacker =
          pieceType === HI || pieceType === KA || pieceType === KI || pieceType === GI || pieceType === KE;
        if (isAttacker) {
          const dist =
            Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 0x0f) - (enemyKing & 0x0f));
          if (dist <= 3) score += (4 - dist) * 25_000;
        }
      }
    }

    // 7) Opening-aware root move ordering (to reduce "random-looking" opening moves).
    // This influences ordering only (not evaluation), and only at the root.
    if (ply === 0) {
      score += this.openingOrderBonusAtRoot(k, te);
    }

    return score;
  }

  private openingOrderBonusAtRoot(k: KyokumenImproved, te: Te): number {
    if (this.rootInCheck) return 0;
    if (this.rootTesu >= 24) return 0;
    if (this.rootHandTotal > 4) return 0;

    // Don't bias tactical moves; search already handles those well.
    if (te.from === 0) return 0;
    if (te.capture !== EMPTY) return 0;
    if (te.promote) return 0;

    const pieceType = getKomashu(te.koma);
    const fromSuji = te.from >> 4;
    const fromDan = te.from & 0x0f;
    const toSuji = te.to >> 4;
    const toDan = te.to & 0x0f;

    let bonus = 0;

    // 1) One-step pawn pushes from the starting pawn rank.
    const pawnStartDan = k.teban === SENTE ? 7 : 3;
    const pawnNextDan = k.teban === SENTE ? 6 : 4;
    if (pieceType === FU && fromDan === pawnStartDan && toDan === pawnNextDan) {
      bonus += 140_000;
      // Prefer central pawn pushes slightly (openings are often built from central files).
      const distFromCenterFile = Math.abs(fromSuji - 5);
      bonus += Math.max(0, 3 - distFromCenterFile) * 18_000;
    }

    // 2) Development (silvers/golds are core defenders and help start building a castle).
    if (pieceType === GI || pieceType === KI) {
      bonus += 70_000;
      // Reward moving away from the back rank (purely a tie-break).
      if (k.teban === SENTE && toDan <= fromDan) bonus += 8_000;
      if (k.teban === GOTE && toDan >= fromDan) bonus += 8_000;
    }

    // 3) Unblocking long-range pieces (bishop/rook).
    if (pieceType === KA || pieceType === HI) {
      bonus += 45_000;
    }

    // 4) King move (castling) tie-breaker: prefer moving away from center while staying in home camp.
    if (pieceType === OU) {
      const fromDist = Math.abs(fromSuji - 5) + Math.abs(fromDan - 5);
      const toDist = Math.abs(toSuji - 5) + Math.abs(toDan - 5);
      const away = toDist - fromDist;
      if (away > 0) bonus += away * 25_000;

      const inHomeCamp = k.teban === SENTE ? toDan >= 8 : toDan <= 2;
      if (inHomeCamp) bonus += 20_000;
    }

    return bonus;
  }

  private scoreAndSortMoves(
    k: KyokumenImproved,
    moves: Te[],
    ply: number,
    ttMoveKey: number,
    ttSecondMoveKey: number
  ): void {
    // This mutates `Te.value` purely as a sort key. The move itself remains unchanged.
    for (const te of moves) {
      te.value = this.scoreMove(k, te, ply, ttMoveKey, ttSecondMoveKey);
    }
    moves.sort((a, b) => b.value - a.value);
  }

  private quiescence(k: KyokumenImproved, alpha: number, beta: number, ply: number, depthLeft: number): number {
    // Quiescence search:
    // - when not in check, we only expand "noisy" moves (captures/promotions) so leaf eval isn't on a tactical cliff.
    // - when in check, we must expand *all* legal evasion moves, otherwise we'd miss forced mates.
    this.leaf++;
    this.maybeThrowOnTime();

    const pushed = this.enableRepetition ? this.pushRepetition(k.HashVal) : true;
    if (!pushed) return this.repetitionDrawScore(k);

    try {
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
        // In shogi, "no legal moves while in check" is checkmate.
        // If somehow not in check, treat it as a draw (stalemate-like).
        return inCheck ? -ShogiAIImprovedV6.MATE + ply : 0;
      }

      const moves = allMoves;
      if (moves.length === 0) return standPat;

      this.scoreAndSortMoves(k, moves, ply, 0, 0);

      let quietChecksSearched = 0;
      let quietChecksTried = 0;

      for (const te of moves) {
        const isNoisy = te.capture !== EMPTY || te.promote;
        const canProbeQuietCheck =
          !inCheck &&
          !isNoisy &&
          this.enableQuiescenceChecks &&
          quietChecksSearched < this.quiescenceCheckMoveLimit &&
          quietChecksTried < this.quiescenceCheckTryLimit;

        // In quiescence, ignore quiet non-check moves (they are handled by the main search).
        // We optionally probe a *very small* number of quiet moves to see if they give check
        // (bounded by `quiescenceCheckTryLimit` to avoid a big slowdown).
        if (!inCheck && !isNoisy && !canProbeQuietCheck) continue;

        // Delta pruning (quiescence):
        // If even an optimistic gain (captured piece + promotion gain) can't raise alpha, skip searching this move.
        //
        // This is intentionally conservative: promotions in shogi can be huge (e.g. 歩→と),
        // so promotion gain is included.
        if (!inCheck && isNoisy && this.enableDeltaPruning) {
          const victimGain = te.capture !== EMPTY ? Math.abs(komaValue[te.capture]) : 0;
          const promoteGain = this.promotionGain(te);
          if (standPat + victimGain + promoteGain + this.deltaPruningMargin <= alpha) {
            continue;
          }
        }

        k.move(te);
        this.toggleTeban(k);

        if (!inCheck && !isNoisy) {
          // Quiet move: only continue if it actually gives check.
          quietChecksTried++;
          const givesCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);
          if (!givesCheck) {
            this.toggleTeban(k);
            k.back(te);
            continue;
          }
          quietChecksSearched++;
        }

        const score = -this.quiescence(k, -beta, -alpha, ply + 1, depthLeft - 1);

        this.toggleTeban(k);
        k.back(te);

        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) break;
        }
      }

      return alpha;
    } finally {
      if (this.enableRepetition) this.popRepetition();
    }
  }

  private search(k: KyokumenImproved, depthLeft: number, alpha: number, beta: number, ply: number): number {
    if (depthLeft <= 0) {
      return this.quiescence(k, alpha, beta, ply, this.quiescenceDepthMax);
    }

    this.node++;
    this.maybeThrowOnTime();

    const pushed = this.enableRepetition ? this.pushRepetition(k.HashVal) : true;
    if (!pushed) return this.repetitionDrawScore(k);

    try {
      const alphaOrig = alpha;

      // Mate-distance bounds:
      // Stabilize the search around mate scores and avoid searching outside possible mate-in-N ranges.
      const alphaMate = -ShogiAIImprovedV6.MATE + ply;
      if (alpha < alphaMate) alpha = alphaMate;
      const betaMate = ShogiAIImprovedV6.MATE - ply;
      if (beta > betaMate) beta = betaMate;
      if (alpha >= beta) return alpha;

      // Transposition table probe
      const entry = this.tt.get(k.HashVal);
      let ttMoveKey = 0;
      let ttSecondMoveKey = 0;
      if (entry && entry.best) ttMoveKey = this.moveKey(entry.best);
      if (entry && entry.second) ttSecondMoveKey = this.moveKey(entry.second);
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

      // Null-move pruning:
      // - If a simple "pass" still holds beta, this node is likely so good we can cut it off.
      // - Disabled while in check, and enabled only at higher difficulties to keep early levels stable.
      if (this.enableNullMove && !parentInCheck && ply > 0 && depthLeft >= 3) {
        const standPat = this.evalForSideToMove(k);
        if (standPat >= beta) {
          const reducedDepth = depthLeft - 1 - this.nullMoveReduction;

          this.toggleTeban(k);
          let score: number;
          try {
            score = -this.search(k, reducedDepth, -beta, -beta + 1, ply + 1);
          } finally {
            this.toggleTeban(k);
          }

          if (score >= beta) return score;
        }
      }

      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) {
        // In shogi, the loss condition is "no legal evasion while in check".
        // If not in check, treat it as a draw (stalemate-like, extremely rare in shogi).
        return parentInCheck ? -ShogiAIImprovedV6.MATE + ply : 0;
      }

      this.scoreAndSortMoves(k, moves, ply, ttMoveKey, ttSecondMoveKey);

      let bestMove: Te | null = null;
      let searched = 0;

      for (const te of moves) {
        // IMPORTANT: move()/back() do not flip side; we do it explicitly for correctness.
        k.move(te);
        this.toggleTeban(k);

        const baseDepthNext = depthLeft - 1;
        const canCheckExtend = this.enableCheckExtension && ply <= this.checkExtensionMaxPly;
        const canLMRBase =
          this.enableLMR &&
          !parentInCheck &&
          baseDepthNext >= 3 &&
          searched >= 4 &&
          te.from !== 0 && // do not reduce drops; drops are tactically critical in shogi
          te.capture === EMPTY &&
          !te.promote;

        // "Gives check" is expensive to compute; only ask when a feature needs it.
        const givesCheck =
          canCheckExtend || canLMRBase ? GenerateMovesImproved.isKingInCheck(k, k.teban) : false;

        // Principal Variation Search (PVS):
        // - First move searched with full window.
        // - Later moves searched with a null window (alpha..alpha+1) to prove they don't beat alpha.
        // - If a null-window search beats alpha, re-search with full window.
        const depthNext = canCheckExtend && givesCheck ? baseDepthNext + 1 : baseDepthNext;
        let score: number;
        if (searched === 0) {
          score = -this.search(k, depthNext, -beta, -alpha, ply + 1);
        } else {
          // Late Move Reductions (LMR):
          // - On deeper nodes, most late "quiet" moves are unlikely to beat alpha.
          // - We search them at reduced depth first; only if they look promising do we re-search fully.
          //
          // This is enabled only on higher difficulties to preserve behavior for Levels 1-3.
          const canLMR = canLMRBase && !givesCheck;

          let reducedDepth = depthNext;
          if (canLMR) {
            // Avoid reducing checking moves (tactical) even if they're quiet.
            reducedDepth = depthNext - 1;
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
    } finally {
      if (this.enableRepetition) this.popRepetition();
    }
  }

  getNextTe(k: KyokumenImproved, tesu: number = 0, options: ShogiAISearchOptions = {}): Te | null {
    // `tesu` is the ply index from the start of the game (0-based).
    // We only use it for *root move ordering* so the engine behaves less randomly in the opening.
    this.rootTesu = tesu | 0;

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
    this.evaluationMode = options.evaluationMode ?? 'v2';

    // Enable extra search techniques only for higher levels to keep Levels 1-3 stable.
    this.enableAspiration = difficulty === 'hard' || difficulty === 'expert' || difficulty === 'master';
    this.aspirationWindow =
      difficulty === 'hard' ? 900
        : difficulty === 'expert' ? 800
          : difficulty === 'master' ? 700
            : 0;
    this.enableLMR = difficulty === 'expert' || difficulty === 'master';
    this.enableNullMove = difficulty === 'expert' || difficulty === 'master';
    this.nullMoveReduction = difficulty === 'master' ? 3 : 2;
    // Tuning notes:
    // - Check extensions / delta pruning / contempt can be powerful but also risky; keep them off until tuned.
    this.enableCheckExtension = false;
    this.checkExtensionMaxPly = 0;
    this.enableDeltaPruning = difficulty === 'master';
    // Keep the margin small (≈ 2 pawns) to avoid pruning away real tactics; this is purely a quiescence speed knob.
    this.deltaPruningMargin = this.enableDeltaPruning ? 200 : 0;
    this.drawContempt = 0;
    this.enableQuiescenceChecks = difficulty === 'master';
    if (this.enableQuiescenceChecks) {
      // Check-aware quiescence is useful for finding "quiet check" tactics near the horizon,
      // but it can also slow the engine significantly if we probe too many quiet moves.
      //
      // Tuning approach:
      // - keep it enabled only on Level 5 (Master)
      // - bound the number of *actual checking moves searched*
      // - bound the number of *quiet moves probed for check* (most quiet moves aren't checks)
      const timeBudget = this.maxTimeMs;
      this.quiescenceCheckMoveLimit = timeBudget >= 2000 ? 2 : 1;
      this.quiescenceCheckTryLimit = timeBudget >= 2000 ? 8 : 2;
    } else {
      this.quiescenceCheckMoveLimit = 0;
      this.quiescenceCheckTryLimit = 0;
    }

    this.node = 0;
    this.leaf = 0;
    this.resetRootBest();
    this.killer1.fill(0);
    this.killer2.fill(0);
    this.history.clear();
    this.repetitionCount.clear();
    this.repetitionStack.length = 0;

    const start = this.nowMs();
    this.startTime = start;

    // Search on a clone to guarantee we never mutate the caller's position.
    const position = k.clone();

    // Root-only metadata for opening ordering.
    // These are intentionally cheap and computed once per move search.
    let handTotal = 0;
    for (let i = 0; i < position.hand.length; i++) handTotal += position.hand[i] | 0;
    this.rootHandTotal = handTotal;
    this.rootInCheck = GenerateMovesImproved.isKingInCheck(position, position.teban);

    // Root fallback:
    // Even if the time budget is extremely small, we must return *some* legal move.
    // This avoids "null move" timeouts in the UI and makes match scripts more stable.
    const rootMoves = GenerateMovesImproved.generateLegalMoves(position);
    if (rootMoves.length === 0) return null;

    const ttAtRoot = this.tt.get(position.HashVal);
    const ttMoveKeyAtRoot = ttAtRoot?.best ? this.moveKey(ttAtRoot.best) : 0;
    const ttSecondMoveKeyAtRoot = ttAtRoot?.second ? this.moveKey(ttAtRoot.second) : 0;
    this.scoreAndSortMoves(position, rootMoves, 0, ttMoveKeyAtRoot, ttSecondMoveKeyAtRoot);

    let bestMove: Te | null = rootMoves[0].clone();
    let bestScore = -ShogiAIImprovedV6.INFINITE;
    // Small 1-ply sanity selection among the top candidates (cheap but helps a lot under tight time limits).
    for (let i = 0; i < Math.min(6, rootMoves.length); i++) {
      const te = rootMoves[i];
      position.move(te);
      this.toggleTeban(position);

      const score = -this.evalForSideToMove(position);

      this.toggleTeban(position);
      position.back(te);

      if (score > bestScore) {
        bestScore = score;
        bestMove = te.clone();
      }
    }
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
        const alpha0 = useAspiration ? bestScore - this.aspirationWindow : -ShogiAIImprovedV6.INFINITE;
        const beta0 = useAspiration ? bestScore + this.aspirationWindow : ShogiAIImprovedV6.INFINITE;

        let score = this.search(position, depth, alpha0, beta0, 0);
        if (useAspiration && (score <= alpha0 || score >= beta0)) {
          // Fail-high/low: re-search full window to get an exact score and stable PV.
          this.resetRootBest();
          score = this.search(position, depth, -ShogiAIImprovedV6.INFINITE, ShogiAIImprovedV6.INFINITE, 0);
        }

        const rootBest = this.rootBest;
        if (rootBest) {
          bestMove = rootBest.clone();
          bestScore = score;
          completedDepth = depth;
        }

        // If a forced mate is found, stop early.
        if (bestScore >= ShogiAIImprovedV6.MATE - 10_000) break;
      } catch (e) {
        if (e instanceof TimeUpError) break;
        throw e;
      }

      if (this.timeUp()) break;
    }

    if (options.debug) {
      const elapsed = this.nowMs() - start;
      console.log(
        `[ShogiAIImprovedV6] depth=${completedDepth}/${maxDepth} score=${bestScore} nodes=${this.node} leaves=${this.leaf} time=${Math.round(elapsed)}ms`
      );
    }

    return bestMove;
  }
}

// Shared instance so the TT can persist across moves during a single game.
// This noticeably improves strength at the same time budget because many positions reoccur (especially via transpositions).
const sharedAIV6 = new ShogiAIImprovedV6();

/**
 * Exported helper for UI/script compatibility.
 * (Not used by default UI; the main shogi page uses the V2 engine unless wired otherwise.)
 */
export function getBestMoveV6(k: KyokumenImproved, teban: number, difficulty: Difficulty): Te | null {
  // The UI passes `teban` explicitly; keep the position consistent.
  k.setTeban(teban);
  return sharedAIV6.getNextTe(k, 0, { difficulty });
}
