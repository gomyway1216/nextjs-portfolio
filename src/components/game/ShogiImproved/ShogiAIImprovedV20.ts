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
 * V11 additions:
 * - Pooled move generation (`generateLegalMovesPooled`) to reuse `Te` objects and reduce per-node allocations.
 * - Keeps V10’s packed TT + V9’s root ordering and evaluation cache.
 *
 * V16 additions:
 * - More "purposeful" drop ordering (attack/defense proximity + anti-random far drops) to reduce ineffective drops
 *   without adding expensive per-drop safety calculations at non-root plies.
 * - Small repetition contempt on Level 4/5 to reduce aimless repetition when clearly ahead/behind.
 * - Enable conservative quiescence delta pruning on Level 4/5 to improve effective depth under tight time budgets.
 *
 * V18 additions:
 * - Lightweight per-node attack/defense cache for move ordering.
 * - "Hanging drop" ordering at all plies using cheap cached attack scans (reduces suicidal drops without make/unmake).
 *
 * V20.1 additions:
 * - Continuation history: a (previous move piece+to, reply piece+to) score table used in move ordering,
 *   generalizing the countermove heuristic to a graded signal. (~40% fewer nodes to the same depth in
 *   midgame benchmarks.)
 *   Tried and rejected after A/B matches vs the pre-V20.1 engine: ProbCut (per-capture, qsearch-filtered,
 *   margins 300/500 — cut real tactics at short time controls) and history gravity (halving history
 *   between iterative-deepening passes — strictly worse at 200ms/move).
 *
 * V19 additions:
 * - Futility pruning at frontier nodes (depthLeft <= 2): skips quiet moves when stand-pat + margin can't reach alpha,
 *   with guards for long-range pieces and moves near the enemy king (hard+).
 * - SEE-lite losing-capture pruning in quiescence using the cached attack scans (hard+).
 * - Countermove heuristic: quiet refutations of the previous move are ordered just below killers.
 * - Deeper Late Move Reductions for very late quiet moves (verified by re-search).
 * - LMR + null-move pruning now enabled from "hard" (previously expert/master only).
 *
 * It also includes V7/V8 features:
 * - Root-only check extensions (Master): deepen checking moves at the root to improve tactical accuracy.
 * - Root-only drop safety ordering: penalize hanging drops (immediately capturable & not defended) to reduce useless drops.
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
	import { EMPTY, FU, GI, GOTE, HI, KA, KE, KI, KY, OU, RY, SENTE, Te, UM, WALL, getKomashu, isSelf, komaValue } from './types';
		import { KyokumenImproved } from './KyokumenImproved';
		import { GenerateMovesImproved } from './GenerateMovesImproved';
		import { MateSolverImproved } from './MateSolverImproved';
		import { MoveListImproved } from './MoveListImproved';
		import { getOpeningMoveImproved } from './OpeningBookImproved';
		import { TranspositionTableImprovedPacked } from './TranspositionTableImprovedPacked';
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
   * Override the path check-extension budget (number of +1 check extensions a single
   * root-to-leaf path may spend). Defaults to the engine's tuned value. Set to 0 to
   * disable check extensions (used for A/B measurement of the feature's effect).
   */
  checkExtensionBudget?: number;

  /**
   * Evaluation profile selector.
   * - `v3` is the tuned default (same cost, more stable openings).
   * - `v3t` is v3 with candidate weights (KyokumenImproved.setEvalV3TunedWeights) for A/B tuning experiments.
   * - `v2` is the previous default and includes stronger king-safety/castling heuristics.
   * - `v1` is kept for regression/self-play comparisons.
   */
  evaluationMode?: 'v1' | 'v2' | 'v3' | 'v3t';
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
export class ShogiAIImprovedV20 {
  private static readonly INFINITE = 99_999_999;
  private static readonly MATE = 90_000_000;
  private static readonly MAX_PLY = 64;

  // Evaluation cache (direct-mapped).
  // We cache *SENTE-perspective* evaluation keyed by (BanHash ^ HandHash),
  // which intentionally does NOT include side-to-move (evaluation is position-only).
  private static readonly EVAL_CACHE_SIZE = 1 << 18;
  private static readonly EVAL_CACHE_SENTINEL = 0x7fffffff;

  private tt: TranspositionTableImprovedPacked;

  private evalCacheKeyV1: Int32Array;
  private evalCacheValV1: Int32Array;
  private evalCacheKeyV2: Int32Array;
  private evalCacheValV2: Int32Array;
  private evalCacheKeyV3: Int32Array;
  private evalCacheValV3: Int32Array;
  private evalCacheKeyV3T: Int32Array;
  private evalCacheValV3T: Int32Array;

  private leaf = 0;
  private node = 0;
  private startTime = 0;
  private maxTimeMs = 0;
  private quiescenceDepthMax = 0;
  private evaluationMode: 'v1' | 'v2' | 'v3' | 'v3t' = 'v3';

  // Repetition handling (sennichite) within the current search path.
  // HashVal already includes side-to-move, so a repeated `HashVal` means an actual repetition state.
  private enableRepetition = true;
  private drawContempt = 0;
  private repetitionCount = new Map<number, number>();
  private repetitionStack: number[] = [];

  // Null-move pruning (enabled only for higher difficulties to keep early levels stable).
  private enableNullMove = false;
  private nullMoveReduction = 2;

  // Check extensions: path-budgeted. `checkExtensionBudget` is how many +1 check
  // extensions a single root-to-leaf path may spend; `extByPly[ply]` tracks how many
  // this path has used so far. This deepens forced checking sequences (tsume) near
  // the root without letting perpetual/spite checks explode the tree. Mirrors the
  // WASM engine exactly (search-driver parity).
  private enableCheckExtension = false;
  private checkExtensionBudget = 0;

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

  // V19: futility pruning at frontier nodes (depthLeft <= 2).
  // Quiet moves rarely swing the static eval by more than a margin in one ply,
  // so when the stand-pat score is hopelessly below alpha we skip them entirely.
  private enableFutility = false;
  private futilityMargin1 = 350;
  private futilityMargin2 = 700;

  // V19: skip clearly losing captures inside quiescence (SEE-lite via cached attack scans).
  private enableQSeePruning = false;

  private killer1: number[] = new Array(ShogiAIImprovedV20.MAX_PLY).fill(0);
  private killer2: number[] = new Array(ShogiAIImprovedV20.MAX_PLY).fill(0);
  private history = new Map<number, number>();

  // V19: countermove heuristic.
  // "The refutation of move X is often the same move Y regardless of the rest of the position."
  // We remember, per previous-move key, the quiet move that last caused a beta cutoff in response.
  private counterMove = new Map<number, number>();
  // The move key that led into each ply on the current search path (index = ply).
  private prevKeyByPly: number[] = new Array(ShogiAIImprovedV20.MAX_PLY).fill(0);

  // Continuation history (V20.1): generalization of the countermove heuristic.
  // Indexed by (previous move's piece+to, current move's piece+to) — "after the opponent puts piece X
  // on square A, moving piece Y to square B tends to cause cutoffs". Unlike `counterMove` (one move per
  // key) this is a graded score added to ordering, so it also helps rank non-refutation quiet moves.
  //
  // Index compression: pieceType (0..15) * 81 board squares = 1296 states per move; side is implied
  // (the previous move is always by the opponent of the side to move). Flat Int32Array of 1296^2.
  private static readonly CONT_HIST_DIM = 1296;
  private contHist = new Int32Array(ShogiAIImprovedV20.CONT_HIST_DIM * ShogiAIImprovedV20.CONT_HIST_DIM);
  // pieceTo-index of the move that led into each ply on the current search path (-1 = unknown/root).
  private prevPtByPly: number[] = new Array(ShogiAIImprovedV20.MAX_PLY).fill(-1);

  // Path-budgeted check extension: number of +1 check extensions used on the root-to-ply
  // path so far (index = ply). Propagated to the child ply exactly like prevKeyByPly.
  private extByPly: number[] = new Array(ShogiAIImprovedV20.MAX_PLY).fill(0);

  private rootBest: Te | null = null;

  // V20 mate solver (詰みソルバー): dedicated checks-only AND/OR search used as a pre-search probe.
  // See `tryMateSolve()` for the gate/budget policy.
  private mateSolver = new MateSolverImproved();

  // V20: remaining depth at the node currently being move-ordered.
  // Used to skip expensive per-move attack scans at frontier nodes (see scoreMove).
  private orderDepthLeft = 99;

  // Root-only metadata (used for opening-like ordering heuristics).
  private rootTesu = 0;
  private rootHandTotal = 0;
  private rootInCheck = false;
  private rootKingDanger = 0;
  // Root-only ordering cache: avoids re-running expensive safety heuristics every iterative-deepening pass.
  // Keyed by `moveKey(te)` (capture is implicit in the root position).
  private rootOrderBonusCache = new Map<number, number>();

  // Per-ply move list pool (V11): reduces allocations by reusing `Te` objects across nodes.
  private moveLists: MoveListImproved[] = Array.from(
    { length: ShogiAIImprovedV20.MAX_PLY },
    () => new MoveListImproved()
  );

  // --- Lightweight "attack/defense" cache (per node) ---
  //
  // `GenerateMovesImproved.getLeastAttackerValue()` is already cheap (local 12-direction scan + slider rays),
  // but move ordering calls it multiple times per node when many drop moves exist (common in shogi midgame).
  //
  // This cache is:
  // - per-ply (node-local epoch) to avoid needing to clear arrays
  // - per target square (0..255 works for our (suji<<4)+dan encoding)
  // - separate per defender-side (SENTE/GOTE) because "who attacks" flips
  private static readonly ATTACK_CACHE_SQUARES = 256;
  private static readonly ATTACK_CACHE_INF = 0x7fffffff;

  private attackEpochByPly = new Int32Array(ShogiAIImprovedV20.MAX_PLY);
  private attackStampSente = new Int32Array(ShogiAIImprovedV20.MAX_PLY * ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);
  private attackStampGote = new Int32Array(ShogiAIImprovedV20.MAX_PLY * ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);
  private attackValSente = new Int32Array(ShogiAIImprovedV20.MAX_PLY * ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);
  private attackValGote = new Int32Array(ShogiAIImprovedV20.MAX_PLY * ShogiAIImprovedV20.ATTACK_CACHE_SQUARES);

  /**
   * `tt` is injected so callers can reuse a transposition table across moves (stronger) or create a fresh one (clean).
   */
  constructor(tt: TranspositionTableImprovedPacked = new TranspositionTableImprovedPacked()) {
    this.tt = tt;

    this.evalCacheKeyV1 = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV1 = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheKeyV2 = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV2 = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheKeyV3 = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV3 = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheKeyV3T = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);
    this.evalCacheValV3T = new Int32Array(ShogiAIImprovedV20.EVAL_CACHE_SIZE);

    this.evalCacheKeyV1.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV2.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3T.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
  }

  clearTT(): void {
    this.tt.clear();
    // Also clear eval caches for reproducibility across games (optional but helps deterministic benchmarks).
    this.evalCacheKeyV1.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV2.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
    this.evalCacheKeyV3T.fill(ShogiAIImprovedV20.EVAL_CACHE_SENTINEL);
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

  /**
   * Hanging-piece threat term (V20), SENTE-positive.
   *
   * Why: quiescence only resolves captures for the side to move. A piece that is merely *threatened*
   * stays on the board in the static eval, so shallow searches happily ignore attacks on their own
   * pieces ("攻撃されても無視する" behavior). This term charges each side ~50% of the expected loss of
   * its single most valuable hanging piece:
   * - 50% because the eval cache is side-to-move agnostic — if it's your turn you can usually save
   *   the piece (loss ≈ 0), if it's the opponent's turn the piece is usually lost (loss ≈ 100%).
   * - only the biggest threat per side matters (the opponent captures once per turn).
   *
   * Cost: one 81-square scan + two cheap attack scans for each piece worth >= lance (~10 pieces),
   * amortized by the eval cache.
   */
  private hangingThreatSente(k: KyokumenImproved): number {
    let worstSente = 0;
    let worstGote = 0;
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const pos = (suji << 4) + dan;
        const p = k.get(pos);
        if (p === EMPTY) continue;
        const type = getKomashu(p);
        if (type === OU) continue;
        const value = Math.abs(komaValue[p]) | 0;
        if (value < 1000) continue; // only silver and up: keeps the scan cheap and the signal strong

        const side = isSelf(SENTE, p) ? SENTE : GOTE;
        const attacker = GenerateMovesImproved.getLeastAttackerValue(k, pos, side);
        if (!Number.isFinite(attacker)) continue;

        const defender = GenerateMovesImproved.getLeastAttackerValue(k, pos, side === SENTE ? GOTE : SENTE);
        // Only truly hanging pieces (attacked and undefended) count. "Defended but attacked by a
        // cheaper piece" happens constantly in normal shogi (pawns touching silvers, etc.) and
        // penalizing it turned the term into pure noise in self-play.
        if (Number.isFinite(defender)) continue;
        const loss = Math.min(value, 700);

        if (side === SENTE) {
          if (loss > worstSente) worstSente = loss;
        } else if (loss > worstGote) {
          worstGote = loss;
        }
      }
    }
    return ((worstGote - worstSente) / 3) | 0;
  }

  private evaluateSenteCached(k: KyokumenImproved): number {
    const key = (k.BanHash ^ k.HandHash) | 0;
    const index = key & (ShogiAIImprovedV20.EVAL_CACHE_SIZE - 1);

    if (this.evaluationMode === 'v1') {
      if (this.evalCacheKeyV1[index] === key) return this.evalCacheValV1[index] | 0;
      const value = k.evaluateV1() | 0;
      this.evalCacheKeyV1[index] = key;
      this.evalCacheValV1[index] = value;
      return value;
    }

    if (this.evaluationMode === 'v2') {
      if (this.evalCacheKeyV2[index] === key) return this.evalCacheValV2[index] | 0;
      const value = k.evaluate() | 0;
      this.evalCacheKeyV2[index] = key;
      this.evalCacheValV2[index] = value;
      return value;
    }

    // v3t (candidate weights for tuning A/B; same structure as v3, separate cache)
    if (this.evaluationMode === 'v3t') {
      if (this.evalCacheKeyV3T[index] === key) return this.evalCacheValV3T[index] | 0;
      const value = (k.evaluateV3Tuned() + this.hangingThreatSente(k)) | 0;
      this.evalCacheKeyV3T[index] = key;
      this.evalCacheValV3T[index] = value;
      return value;
    }

    // v3 (V20: includes the hanging-piece threat term; cached together with the base eval)
    if (this.evalCacheKeyV3[index] === key) return this.evalCacheValV3[index] | 0;
    const value = (k.evaluateV3() + this.hangingThreatSente(k)) | 0;
    this.evalCacheKeyV3[index] = key;
    this.evalCacheValV3[index] = value;
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
    // Do not push too hard when the position is roughly equal; that can turn safe draws into blunders.
    if (Math.abs(standPat) < 150) return 0;
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

  /**
   * Compact (pieceType, toSquare) index for the continuation-history table.
   * Side is intentionally excluded: at any given ply the mover's side is fixed, so it carries no signal.
   */
  private pieceToIndex(te: Te): number {
    const toSuji = te.to >> 4;
    const toDan = te.to & 0x0f;
    return getKomashu(te.koma) * 81 + (toSuji - 1) * 9 + (toDan - 1);
  }

  private teFromMoveKey(key: number, k: KyokumenImproved): Te {
    const koma = key & 0x3f;
    const from = (key >> 6) & 0xff;
    const to = (key >> 14) & 0xff;
    const promote = ((key >> 22) & 1) === 1;
    const capture = k.get(to);
    return new Te(koma, from, to, promote, capture);
  }

  private recordKiller(ply: number, key: number): void {
    // "Killer moves" are non-captures that caused a beta cutoff at the same ply elsewhere.
    // They are often good again in similar tactical shapes.
    if (ply < 0 || ply >= ShogiAIImprovedV20.MAX_PLY) return;
    if (this.killer1[ply] !== key) {
      this.killer2[ply] = this.killer1[ply];
      this.killer1[ply] = key;
    }
  }

  private otherSide(teban: number): number {
    return teban === SENTE ? GOTE : SENTE;
  }

  private beginAttackCacheForNode(ply: number): void {
    if (ply < 0 || ply >= ShogiAIImprovedV20.MAX_PLY) return;
    let next = (this.attackEpochByPly[ply] + 1) | 0;
    // `0` is treated as "unset" in stamp arrays, so avoid it.
    if (next === 0) {
      // Extremely unlikely to happen in practice; reset stamps to keep correctness.
      this.attackStampSente.fill(0);
      this.attackStampGote.fill(0);
      next = 1;
    }
    this.attackEpochByPly[ply] = next;
  }

  private leastAttackerValueCached(k: KyokumenImproved, target: number, defender: number, ply: number): number {
    if (target <= 0 || k.get(target) === WALL) return Infinity;
    const sq = target & 0xff;
    const index = (ply << 8) | sq;
    const epoch = this.attackEpochByPly[ply] | 0;

    const isDefenderSente = defender === SENTE;
    const stamp = isDefenderSente ? this.attackStampSente : this.attackStampGote;
    const val = isDefenderSente ? this.attackValSente : this.attackValGote;

    if ((stamp[index] | 0) === epoch) {
      const cached = val[index] | 0;
      return cached === ShogiAIImprovedV20.ATTACK_CACHE_INF ? Infinity : cached;
    }

    const computed = GenerateMovesImproved.getLeastAttackerValue(k, target, defender);
    const stored = Number.isFinite(computed) ? ((computed | 0) & 0x7fffffff) : ShogiAIImprovedV20.ATTACK_CACHE_INF;
    stamp[index] = epoch;
    val[index] = stored;
    return stored === ShogiAIImprovedV20.ATTACK_CACHE_INF ? Infinity : stored;
  }

  /**
   * Cheap "king is under pressure" proxy for the opening phase.
   *
   * Motivation:
   * - In very low time budgets, root move ordering can dominate the move choice.
   * - If we keep pushing slow castling/development moves while the king is already surrounded,
   *   the AI looks (and plays) irrational.
   *
   * This returns an uncalibrated danger score (higher = more pressure).
   * It is intentionally local (5x5 around the king) and does not require generating moves.
   */
  private computeKingDanger(k: KyokumenImproved, teban: number, kingPos: number): number {
    if (kingPos <= 0) return 0;
    const kingSuji = kingPos >> 4;
    const kingDan = kingPos & 0x0f;

    // Same rough scale as `KyokumenImproved.enemyProximityDanger()` but reimplemented here
    // (that method is intentionally private to keep evaluation encapsulated).
    const dangerByKomashu: number[] = [
      0,
      6,  // FU
      10, // KY
      12, // KE
      16, // GI
      18, // KI
      22, // KA
      26, // HI
      0,  // OU
      14, // TO
      12, // NY
      12, // NK
      12, // NG
      0,  // (unused)
      26, // UM
      30, // RY
    ];

    let danger = 0;
    for (let ds = -2; ds <= 2; ds++) {
      for (let dd = -2; dd <= 2; dd++) {
        if (ds === 0 && dd === 0) continue;
        const suji = kingSuji + ds;
        const dan = kingDan + dd;
        if (suji < 1 || suji > 9 || dan < 1 || dan > 9) continue;

        const p = k.get((suji << 4) + dan);
        if (p === EMPTY || p === WALL) continue;
        if (isSelf(teban, p)) continue;

        const base = dangerByKomashu[getKomashu(p)] ?? 0;
        if (!base) continue;

        // Adjacent squares are especially urgent.
        const dist = Math.abs(ds) + Math.abs(dd);
        danger += base + (dist <= 1 ? 6 : dist <= 2 ? 3 : 0);
      }
    }
    return danger;
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

    // Countermove heuristic (V19): the quiet move that refuted the same previous move elsewhere
    // is likely to refute it here too. Slightly below killers in priority.
    if (ply > 0 && ply < ShogiAIImprovedV20.MAX_PLY) {
      const prevKey = this.prevKeyByPly[ply] | 0;
      if (prevKey !== 0 && this.counterMove.get(prevKey) === key) score += 1_200_000;
    }

    // 2) Long-term ordering signals (history + continuation history)
    const historyScore = this.history.get(key);
    if (historyScore) score += historyScore;

    // Continuation history (V20.1): graded "reply quality" signal for the previous move on the path.
    if (ply > 0 && ply < ShogiAIImprovedV20.MAX_PLY) {
      const prevPt = this.prevPtByPly[ply] | 0;
      if (prevPt >= 0) {
        score += this.contHist[prevPt * ShogiAIImprovedV20.CONT_HIST_DIM + this.pieceToIndex(te)] | 0;
      }
    }

    // 3) Promotions are usually correct/forcing in shogi.
    if (te.promote) score += 400_000;

    // 4) Captures: MVV-LVA-ish. This is cheap and helps alpha-beta a lot.
    if (te.capture !== EMPTY) {
      const victim = Math.abs(komaValue[te.capture]);
      const attacker = Math.abs(komaValue[te.koma]);
      score += 900_000 + victim * 20 - attacker;
    }

    // SEE-lite ordering for risky captures:
    // Capturing with a much more valuable piece often fails tactically in shogi if the landing square is attacked
    // and the capturing piece is not defended. We keep this as a *small ordering nudge* (not pruning).
    // V20: skipped at frontier nodes (orderDepthLeft < 3) — attack scans per move are too expensive
    // for the huge number of shallow nodes, and rough ordering suffices there.
    if (this.orderDepthLeft >= 3 && te.from !== 0 && te.capture !== EMPTY) {
      const attackerValue = Math.abs(komaValue[te.koma]) | 0;
      const victimValue = Math.abs(komaValue[te.capture]) | 0;

      if (attackerValue >= 1000 && victimValue + 200 < attackerValue) {
        const distToEnemyKing =
          enemyKing > 0
            ? Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 0x0f) - (enemyKing & 0x0f))
            : 99;

        // Avoid discouraging close-to-king tactics (often checks/forcing sacrifices).
        if (distToEnemyKing > 2) {
          const enemyLeastAttacker = this.leastAttackerValueCached(k, te.to, k.teban, ply);
          if (Number.isFinite(enemyLeastAttacker)) {
            const selfLeastDefender = this.leastAttackerValueCached(k, te.to, this.otherSide(k.teban), ply);
            if (Number.isFinite(selfLeastDefender)) {
              // Defended by an equal-or-cheaper piece: small positive tie-break (likely tactically sound).
              if (selfLeastDefender <= enemyLeastAttacker) score += 9_000;
            } else {
              // Hanging: keep penalty moderate so tactical sacs are still searched under time pressure.
              const penalty = Math.min(90_000, attackerValue * 30);
              score -= penalty;
            }
          }
        }
      }
    }

	    if (te.from === 0) {
	      // 5) Drops: drops are a huge part of shogi tactics.
	      //
	      // Ordering goals (cheap only):
	      // - Keep a meaningful drop bias (tactical strength depends on it).
	      // - Prefer "purposeful" drops:
	      //   - near the enemy king (attack)
	      //   - near our own king (defense / urgent blocking)
	      // - Deprioritize drops that are far from both kings (often random tempo losses).
	      //
	      // NOTE:
	      // - Root has a heavier safety adjustment via `rootMoveSafetyOrderAdjustment()`.
	      // - For non-root plies we add a very cheap cached "hanging drop" ordering adjustment below.
	      const pieceType = getKomashu(te.koma);
	      const selfKing = k.teban === SENTE ? k.kingS : k.kingG;

	      const distToEnemyKing =
	        enemyKing > 0
	          ? Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 0x0f) - (enemyKing & 0x0f))
	          : 99;
	      const distToSelfKing =
	        selfKing > 0
	          ? Math.abs((te.to >> 4) - (selfKing >> 4)) + Math.abs((te.to & 0x0f) - (selfKing & 0x0f))
	          : 99;

	      // Base drop bias (slightly lower than V15 to avoid over-searching random drops).
	      score += 120_000;

	      // Piece-type tie-breaker.
      if (pieceType === HI) score += 250_000;
      else if (pieceType === KA) score += 180_000;
      else if (pieceType === KI) score += 120_000;
      else if (pieceType === GI) score += 90_000;
      else if (pieceType === KE) score += 40_000;
      else if (pieceType === KY) score += 25_000;
      else if (pieceType === FU) score += 10_000;

	      // Attack proximity: drops near the enemy king are often forcing.
	      if (distToEnemyKing <= 4) score += (5 - distToEnemyKing) * 35_000;

	      // Defense proximity: drops near our king can be urgent defense / line blocking.
	      if (distToSelfKing <= 3) score += (4 - distToSelfKing) * 30_000;

	      // Penalize drops that are far from both kings (often "random" tempo losses).
	      if (distToEnemyKing >= 7 && distToSelfKing >= 7) score -= 45_000;

	      // Hanging-drop ordering:
	      // If the dropped piece is immediately capturable and not defended, it is often ineffective.
	      //
	      // Constraints:
	      // - no make/unmake (must stay fast)
	      // - avoid discouraging tactical sacrifices near the enemy king
	      // - keep penalties bounded so the search can still consider sacrifices when needed
	      // - V20: skipped at frontier nodes (orderDepthLeft < 3) — the attack scans are too costly there.
	      if (this.orderDepthLeft >= 3 && distToEnemyKing > 2) {
	        const enemyLeastAttacker = this.leastAttackerValueCached(k, te.to, k.teban, ply);
	        if (Number.isFinite(enemyLeastAttacker)) {
	          const selfLeastDefender = this.leastAttackerValueCached(k, te.to, this.otherSide(k.teban), ply);
	          if (Number.isFinite(selfLeastDefender)) {
	            // Prefer defended drops slightly, especially when defended by an equal-or-cheaper piece.
	            score += selfLeastDefender <= enemyLeastAttacker ? 14_000 : 3_000;
	          } else {
	            const pieceValue = Math.abs(komaValue[te.koma]) | 0;
	            // Allow low-value sacrifices/blocks (pawns are often dropped as tempo/shape).
	            if (pieceValue >= 1000) {
	              // Penalize most when the drop is capturable by a clearly cheaper piece.
	              const cheaperCapture = (enemyLeastAttacker | 0) + 200 < pieceValue;
	              const basePenalty = cheaperCapture ? Math.min(260_000, pieceValue * 120) : Math.min(120_000, pieceValue * 45);
	              // Defensive drops near our king can be necessary; soften the penalty.
	              const softened = distToSelfKing <= 3 ? Math.floor(basePenalty * 0.6) : basePenalty;
	              score -= softened;
	            }
	          }
	        }
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

	    if (ply === 0) {
	      const cached = this.rootOrderBonusCache.get(key);
	      if (cached !== undefined) {
	        score += cached;
	      } else {
	        const bonus = this.openingOrderBonusAtRoot(k, te) + this.rootMoveSafetyOrderAdjustment(k, te, enemyKing);
	        this.rootOrderBonusCache.set(key, bonus);
	        score += bonus;
	      }
	    }

	    return score;
	  }

		  private openingOrderBonusAtRoot(k: KyokumenImproved, te: Te): number {
		    if (this.rootInCheck) return 0;
		    if (this.rootTesu !== 0 && this.rootTesu >= 24) return 0;
		    if (this.rootHandTotal > 4) return 0;

	    // Only apply while the side-to-move king is still in the home camp (early game proxy).
	    const selfKing = k.teban === SENTE ? k.kingS : k.kingG;
	    if (selfKing <= 0) return 0;
	    const selfKingDan = selfKing & 0x0f;
	    if (k.teban === SENTE) {
	      if (selfKingDan < 7) return 0;
	    } else {
	      if (selfKingDan > 3) return 0;
	    }

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
		    const underPressure = this.rootKingDanger >= 45;

		    // 1) One-step pawn pushes from the starting pawn rank.
		    const pawnStartDan = k.teban === SENTE ? 7 : 3;
		    const pawnNextDan = k.teban === SENTE ? 6 : 4;
		    if (pieceType === FU && fromDan === pawnStartDan && toDan === pawnNextDan) {
		      // When the king is already under pressure, don't over-reward slow pawn pushes.
		      bonus += underPressure ? 90_000 : 140_000;
		      // Prefer central pawn pushes slightly (openings are often built from central files).
		      const distFromCenterFile = Math.abs(fromSuji - 5);
		      bonus += Math.max(0, 3 - distFromCenterFile) * (underPressure ? 10_000 : 18_000);
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
		      // If we are already under pressure, prioritise defense/tactics over slow king walks.
		      // Also, avoid suggesting king moves in the first couple of plies (looks unnatural and is rarely best).
		      if (underPressure || this.rootTesu < 4) return bonus;

		      const fromDist = Math.abs(fromSuji - 5) + Math.abs(fromDan - 5);
		      const toDist = Math.abs(toSuji - 5) + Math.abs(toDan - 5);
		      const away = toDist - fromDist;
		      if (away > 0) bonus += away * 25_000;

	      const inHomeCamp = k.teban === SENTE ? toDan >= 8 : toDan <= 2;
	      if (inHomeCamp) bonus += 20_000;
	    }

	    return bonus;
	  }

	  private rootMoveSafetyOrderAdjustment(k: KyokumenImproved, te: Te, enemyKing: number): number {
	    // Avoid discouraging very close-to-king tactics (often checks or forcing attacks).
	    if (enemyKing > 0) {
	      const dist =
	        Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 0x0f) - (enemyKing & 0x0f));
	      if (dist <= 2) return 0;
	    }

	    // Drops: cheap "is it immediately capturable?" check without making the move.
	    if (te.from === 0) {
	      const enemyLeastAttacker = GenerateMovesImproved.getLeastAttackerValue(k, te.to, k.teban);
	      if (!Number.isFinite(enemyLeastAttacker)) return 0;

	      const selfLeastDefender = GenerateMovesImproved.getLeastAttackerValue(k, te.to, this.otherSide(k.teban));
	      if (Number.isFinite(selfLeastDefender)) {
	        // Prefer defended drops slightly, especially when defended by an equal-or-cheaper piece.
	        return selfLeastDefender <= enemyLeastAttacker ? 25_000 : 8_000;
	      }

	      const pieceValue = Math.abs(komaValue[te.koma]) | 0;
	      const penalty = Math.min(320_000, pieceValue * 120);
	      return -penalty;
	    }

	    const attackerValue0 = Math.abs(komaValue[te.koma]) | 0;
	    const capturedValue0 = te.capture !== EMPTY ? (Math.abs(komaValue[te.capture]) | 0) : 0;

	    // Avoid expensive make/unmake analysis for very low-value quiet moves (pawns are often "hanging" by design).
	    if (te.capture === EMPTY && !te.promote && attackerValue0 <= 200) return 0;

	    // Avoid expensive make/unmake analysis unless it likely matters:
	    // - Quiet moves: only analyze when the moved piece is at least a knight (reduces overhead + avoids false negatives).
	    // - Captures: analyze only when the exchange *looks* suspicious (capturing much smaller material).
	    const isQuiet = te.capture === EMPTY && !te.promote;
	    if (isQuiet && attackerValue0 < 700) return 0;
	    const isSuspiciousCapture = te.capture !== EMPTY && capturedValue0 + 200 < attackerValue0;
	    if (!isQuiet && !isSuspiciousCapture) return 0;

	    // Ensure `capture` is correct for undo.
	    const captureOrig = te.capture;
	    const actualCapture = k.get(te.to);
	    if (captureOrig !== actualCapture) te.capture = actualCapture;

	    k.move(te);
	    try {
	      const moved = k.get(te.to);
	      const movedValue = Math.abs(komaValue[moved]) | 0;

	      const enemyLeastAttacker = GenerateMovesImproved.getLeastAttackerValue(k, te.to, k.teban);
	      if (!Number.isFinite(enemyLeastAttacker)) return 0;

	      const selfLeastDefender = GenerateMovesImproved.getLeastAttackerValue(k, te.to, this.otherSide(k.teban));
	      if (Number.isFinite(selfLeastDefender)) {
	        // Defended piece: mild preference when defended by an equal-or-cheaper piece (likely good exchange).
	        return selfLeastDefender <= enemyLeastAttacker ? 8_000 : 0;
	      }

	      // Hanging:
	      // - Allow low-value probes (e.g. pawns) without heavy ordering penalties.
	      // - For captures, partially offset by what we won (SEE-lite).
	      if (capturedValue0 === 0 && movedValue <= 200) return 0;

	      let penalty = Math.min(240_000, movedValue * 80);
	      if (capturedValue0 > 0) {
	        // If we at least won material, reduce the penalty (SEE-lite).
	        penalty = Math.max(0, penalty - capturedValue0 * 70);
	      }
	      return -penalty;
	    } finally {
	      k.back(te);
	      te.capture = captureOrig;
	    }
	  }

  private scoreAndSortMoves(
    k: KyokumenImproved,
    moves: Te[],
    ply: number,
    ttMoveKey: number,
    ttSecondMoveKey: number
  ): void {
    this.beginAttackCacheForNode(ply);
    // This mutates `Te.value` purely as a sort key. The move itself remains unchanged.
    for (const te of moves) {
      te.value = this.scoreMove(k, te, ply, ttMoveKey, ttSecondMoveKey);
    }
    moves.sort((a, b) => b.value - a.value);
  }

  private quiescence(k: KyokumenImproved, alpha: number, beta: number, ply: number, depthLeft: number): number {
    // Hard ply cap: the per-ply pools/caches (move lists, killers, attack cache) are sized for MAX_PLY.
    // Going past it would index typed arrays out of bounds (silently corrupting the attack cache),
    // and extremely long check chains must terminate somewhere anyway.
    if (ply >= ShogiAIImprovedV20.MAX_PLY - 1) {
      return this.evalForSideToMove(k);
    }
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

      // V20: pseudo-legal generation + lazy legality at make time (see search()).
      // Mate detection while in check is handled via `legalTried` after the loop — no pruning path
      // below can skip an evasion while in check, so `legalTried === 0` really means "no evasion".
      const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(
        k,
        this.moveLists[ply] ?? new MoveListImproved()
      );

      // V20: use the TT best move for quiescence ordering too (cheap probe, big cutoff gains
      // because many quiescence positions were already searched at depth >= 1).
      const qTtIndex = this.tt.probe(k.HashVal);
      const qTtMoveKey = qTtIndex >= 0 ? this.tt.bestKey[qTtIndex] | 0 : 0;

      // Quiescence nodes are all "frontier": skip the expensive per-move attack scans in ordering
      // (the SEE-lite *pruning* below still runs its own cached scans where it matters).
      this.orderDepthLeft = 0;
      if (inCheck) {
        // All evasions matter while in check: order them all.
        this.scoreAndSortMoves(k, moves, ply, qTtMoveKey, 0);
      } else {
        // V20 speed: when not in check, quiescence only ever searches noisy moves (plus a couple of
        // quiet check probes). Scoring & sorting the full move list (mostly quiet moves) at every
        // quiescence node was a major waste — partition the noisy moves to the front and order only
        // those (insertion sort; the noisy subset is small).
        let noisyCount = 0;
        for (let i = 0; i < moves.length; i++) {
          const m = moves[i]!;
          if (m.capture !== EMPTY || m.promote) {
            if (i !== noisyCount) {
              moves[i] = moves[noisyCount]!;
              moves[noisyCount] = m;
            }
            noisyCount++;
          }
        }
        this.beginAttackCacheForNode(ply);
        for (let i = 0; i < noisyCount; i++) {
          moves[i]!.value = this.scoreMove(k, moves[i]!, ply, qTtMoveKey, 0);
        }
        for (let i = 1; i < noisyCount; i++) {
          const m = moves[i]!;
          let j = i - 1;
          while (j >= 0 && moves[j]!.value < m.value) {
            moves[j + 1] = moves[j]!;
            j--;
          }
          moves[j + 1] = m;
        }
      }
      this.orderDepthLeft = 99;

      let quietChecksSearched = 0;
      let quietChecksTried = 0;
      let legalTried = 0;

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

        // SEE-lite losing-capture pruning (V19, quiescence only):
        // A capture that grabs a clearly cheaper piece on a square defended by a piece cheaper than
        // our attacker almost always loses material after the recapture. Searching these dominates
        // quiescence cost in shogi (many pieces, many captures), so we skip them.
        //
        // Guards to preserve tactics:
        // - never while in check (we search all evasions)
        // - never for promotions (promotion gain can outweigh the exchange)
        // - never for drops (`from === 0` never captures anyway)
        // - never near the enemy king (sacrifices there are often mating attacks)
        if (
          !inCheck &&
          this.enableQSeePruning &&
          te.capture !== EMPTY &&
          !te.promote &&
          te.from !== 0
        ) {
          const attackerValue = Math.abs(komaValue[te.koma]) | 0;
          const victimValue = Math.abs(komaValue[te.capture]) | 0;
          if (attackerValue >= 1000 && victimValue + 300 <= attackerValue) {
            const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;
            const distToEnemyKing =
              enemyKing > 0
                ? Math.abs((te.to >> 4) - (enemyKing >> 4)) + Math.abs((te.to & 0x0f) - (enemyKing & 0x0f))
                : 99;
            if (distToEnemyKing > 2) {
              // "Is the victim defended by something cheaper than our attacker?"
              // (The victim itself sits on `te.to` and does not count as its own defender.)
              const enemyLeastAttacker = this.leastAttackerValueCached(k, te.to, k.teban, ply);
              if (Number.isFinite(enemyLeastAttacker) && enemyLeastAttacker < attackerValue) {
                continue;
              }
            }
          }
        }

        k.move(te);
        // Lazy legality (V20): the pseudo-legal generator does not filter 王手放置.
        if (GenerateMovesImproved.isKingInCheck(k, k.teban)) {
          k.back(te);
          continue;
        }
        legalTried++;
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

      // In shogi, "no legal moves while in check" is checkmate.
      // (While in check no pruning path above skips a move, so this is exact.)
      if (inCheck && legalTried === 0) return -ShogiAIImprovedV20.MATE + ply;

      return alpha;
    } finally {
      if (this.enableRepetition) this.popRepetition();
    }
  }

  private search(k: KyokumenImproved, depthLeft: number, alpha: number, beta: number, ply: number): number {
    if (depthLeft <= 0) {
      return this.quiescence(k, alpha, beta, ply, this.quiescenceDepthMax);
    }

    // Hard ply cap (see quiescence): protects the per-ply pools/caches from out-of-bounds access.
    if (ply >= ShogiAIImprovedV20.MAX_PLY - 1) {
      return this.evalForSideToMove(k);
    }

    this.node++;
    this.maybeThrowOnTime();

    const pushed = this.enableRepetition ? this.pushRepetition(k.HashVal) : true;
    if (!pushed) return this.repetitionDrawScore(k);

    try {
      const alphaOrig = alpha;

      // Mate-distance bounds:
      // Stabilize the search around mate scores and avoid searching outside possible mate-in-N ranges.
      const alphaMate = -ShogiAIImprovedV20.MATE + ply;
      if (alpha < alphaMate) alpha = alphaMate;
      const betaMate = ShogiAIImprovedV20.MATE - ply;
      if (beta > betaMate) beta = betaMate;
      if (alpha >= beta) return alpha;

	      // Transposition table probe (packed).
	      const ttIndex = this.tt.probe(k.HashVal);
	      let ttMoveKey = 0;
	      let ttSecondMoveKey = 0;
	      if (ttIndex >= 0) {
	        ttMoveKey = this.tt.bestKey[ttIndex] | 0;
	        ttSecondMoveKey = this.tt.secondKey[ttIndex] | 0;

	        const ttRemainDepth = this.tt.remainDepth[ttIndex] | 0;
	        if (ttRemainDepth >= depthLeft) {
	          const ttValue = this.tt.value[ttIndex] | 0;
	          const ttFlag = this.tt.flag[ttIndex] | 0;

	          if (ttFlag === TranspositionTableImprovedPacked.EXACTLY_VALUE) {
	            if (ply === 0 && ttMoveKey !== 0) this.rootBest = this.teFromMoveKey(ttMoveKey, k);
	            return ttValue;
	          }
	          if (ttFlag === TranspositionTableImprovedPacked.LOWER_BOUND && ttValue >= beta) return ttValue;
	          if (ttFlag === TranspositionTableImprovedPacked.UPPER_BOUND && ttValue <= alpha) return ttValue;
	        }
	      }

      // Check extension: being in check is tactically sharp.
      const parentInCheck = GenerateMovesImproved.isKingInCheck(k, k.teban);
      if (parentInCheck) depthLeft++;

      // Internal Iterative Deepening (V20): deep node with no TT move → do a shallow probe search
      // first so the TT gives us a good first move. Ordering quality dominates alpha-beta efficiency.
      if (ttMoveKey === 0 && depthLeft >= 5 && !parentInCheck) {
        this.search(k, depthLeft - 2, alpha, beta, ply);
        const iidIndex = this.tt.probe(k.HashVal);
        if (iidIndex >= 0) {
          ttMoveKey = this.tt.bestKey[iidIndex] | 0;
          ttSecondMoveKey = this.tt.secondKey[iidIndex] | 0;
        }
      }

      // Reverse futility pruning (V20): at shallow depth, if the static eval already beats beta by a
      // comfortable margin, the opponent almost certainly has no way back within the remaining depth.
      // Much cheaper than null-move (no reduced search) and complements it.
      if (
        !parentInCheck &&
        depthLeft <= 3 &&
        beta > -ShogiAIImprovedV20.MATE + 10_000 &&
        beta < ShogiAIImprovedV20.MATE - 10_000
      ) {
        const staticEval = this.evalForSideToMove(k);
        if (staticEval - 200 * depthLeft >= beta) return staticEval;
      }

      // Null-move pruning:
      // - If a simple "pass" still holds beta, this node is likely so good we can cut it off.
      // - Disabled while in check, and enabled only at higher difficulties to keep early levels stable.
      if (this.enableNullMove && !parentInCheck && ply > 0 && depthLeft >= 3) {
        const standPat = this.evalForSideToMove(k);
        if (standPat >= beta) {
          // V20: adaptive reduction — reduce more at deeper nodes (standard null-move scaling).
          const nullR = this.nullMoveReduction + (depthLeft >= 7 ? 1 : 0);
          const reducedDepth = depthLeft - 1 - nullR;

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

      // V20: pseudo-legal generation + lazy legality at make time.
      // With alpha-beta most nodes cut off after 1-3 moves, so testing king safety for every
      // generated move up front wasted most of the budget. Legality is now checked right after
      // `k.move(te)` below; mate detection is handled via `legalTried` after the loop.
      const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(
        k,
        this.moveLists[ply] ?? new MoveListImproved()
      );

      this.orderDepthLeft = depthLeft;
      this.scoreAndSortMoves(k, moves, ply, ttMoveKey, ttSecondMoveKey);
      this.orderDepthLeft = 99;

      // Futility pruning (V19): at frontier nodes (depthLeft <= 2), a quiet move almost never lifts the
      // static eval above alpha when stand-pat + margin is already below it. Precompute the threshold once.
      // Disabled near mate scores where material heuristics stop being meaningful.
      const futilityApplicable =
        this.enableFutility &&
        !parentInCheck &&
        depthLeft <= 2 &&
        alpha > -ShogiAIImprovedV20.MATE + 10_000 &&
        beta < ShogiAIImprovedV20.MATE - 10_000;
      const futilityScore = futilityApplicable
        ? this.evalForSideToMove(k) + (depthLeft <= 1 ? this.futilityMargin1 : this.futilityMargin2)
        : 0;

      let bestMove: Te | null = null;
      let searched = 0;
      let legalTried = 0;
      let prunedAny = false;

      // Late Move Pruning (V20): at shallow depth, quiet non-drop moves sorted far down the list
      // almost never turn out best; skip them entirely after enough moves have been searched.
      const lmpApplicable =
        this.enableFutility &&
        !parentInCheck &&
        depthLeft <= 3 &&
        alpha > -ShogiAIImprovedV20.MATE + 10_000;
      const lmpThreshold = 7 + 5 * depthLeft;

      for (const te of moves) {
        if (
          lmpApplicable &&
          searched >= lmpThreshold &&
          te.from !== 0 && // never LMP drops: they are tactically critical in shogi
          te.capture === EMPTY &&
          !te.promote
        ) {
          const movedType = getKomashu(te.koma);
          const isLongRange =
            movedType === KY || movedType === KA || movedType === HI || movedType === UM || movedType === RY;
          if (!isLongRange) {
            const enemyKingSq = k.teban === SENTE ? k.kingG : k.kingS;
            const distToEnemyKing =
              enemyKingSq > 0
                ? Math.abs((te.to >> 4) - (enemyKingSq >> 4)) + Math.abs((te.to & 0x0f) - (enemyKingSq & 0x0f))
                : 99;
            if (distToEnemyKing > 3) {
              prunedAny = true;
              continue;
            }
          }
        }

        // Futility skip (V19): quiet moves at hopeless frontier nodes.
        //
        // Guards to preserve tactics:
        // - always search at least one move (avoid returning with no move examined)
        // - never skip captures/promotions (they can regain the margin)
        // - never skip long-range piece moves (KY/KA/HI and promotions thereof can give distant checks)
        // - never skip moves landing near the enemy king (cheap proxy for "may give check / mating attack")
        if (futilityApplicable && searched > 0 && futilityScore <= alpha && te.capture === EMPTY && !te.promote) {
          const movedType = getKomashu(te.koma);
          const isLongRange =
            movedType === KY || movedType === KA || movedType === HI || movedType === UM || movedType === RY;
          if (!isLongRange) {
            const enemyKingSq = k.teban === SENTE ? k.kingG : k.kingS;
            const distToEnemyKing =
              enemyKingSq > 0
                ? Math.abs((te.to >> 4) - (enemyKingSq >> 4)) + Math.abs((te.to & 0x0f) - (enemyKingSq & 0x0f))
                : 99;
            if (distToEnemyKing > 3) {
              prunedAny = true;
              continue;
            }
          }
        }

        // IMPORTANT: move()/back() do not flip side; we do it explicitly for correctness.
        k.move(te);
        // Lazy legality (V20): the pseudo-legal generator does not filter 王手放置.
        if (GenerateMovesImproved.isKingInCheck(k, k.teban)) {
          k.back(te);
          continue;
        }
        legalTried++;
        this.toggleTeban(k);
        // Track the path move so child nodes can use the countermove / continuation-history heuristics.
        if (ply + 1 < ShogiAIImprovedV20.MAX_PLY) {
          this.prevKeyByPly[ply + 1] = this.moveKey(te);
          this.prevPtByPly[ply + 1] = this.pieceToIndex(te);
        }

        const baseDepthNext = depthLeft - 1;
        // Path-budgeted check extension: allow a +1 extension for a checking move as long
        // as this path has not already spent its budget. Deepens forced checking sequences
        // (mates) near the root; the per-path cap prevents perpetual/spite-check explosion.
        const extUsed = this.extByPly[ply] | 0;
        const canCheckExtend = this.enableCheckExtension && extUsed < this.checkExtensionBudget;
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
        const extended = canCheckExtend && givesCheck;
        const depthNext = extended ? baseDepthNext + 1 : baseDepthNext;
        // Carry the path extension count to the child ply (mirrors prevKeyByPly).
        if (ply + 1 < ShogiAIImprovedV20.MAX_PLY) {
          this.extByPly[ply + 1] = extUsed + (extended ? 1 : 0);
        }
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
            // V20: staircase reductions — later quiet moves are reduced harder.
            // Safe because any fail-high below is verified by a full-depth re-search.
            reducedDepth = depthNext - 1;
            if (searched >= 8 && depthNext >= 3) reducedDepth = depthNext - 2;
            if (searched >= 20 && depthNext >= 5) reducedDepth = depthNext - 3;
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
            if (te.capture === EMPTY) {
              this.recordKiller(ply, key);
              // V19: remember this quiet move as the refutation of the previous move (countermove heuristic).
              if (ply > 0 && ply < ShogiAIImprovedV20.MAX_PLY) {
                const prevKey = this.prevKeyByPly[ply] | 0;
                if (prevKey !== 0) this.counterMove.set(prevKey, key);
                // Continuation history (V20.1): graded version of the same signal.
                const prevPt = this.prevPtByPly[ply] | 0;
                if (prevPt >= 0) {
                  const idx = prevPt * ShogiAIImprovedV20.CONT_HIST_DIM + this.pieceToIndex(te);
                  this.contHist[idx] = (this.contHist[idx] | 0) + depthLeft * depthLeft;
                }
              }
            }
            this.recordHistory(key, depthLeft);
            break;
          }
        }
      }

      // Mate detection with lazy legality (V20):
      // - If no pseudo-legal move survived the legality test AND nothing was pruned away,
      //   the side to move has no legal moves: checkmate when in check (stalemate is a draw).
      // - If moves were pruned (only possible when NOT in check), returning alpha (fail-low)
      //   is sound — pruned moves were quiet and cannot be the only legal ones while in check,
      //   because all pruning is disabled when `parentInCheck`.
      if (legalTried === 0) {
        if (!prunedAny) return parentInCheck ? -ShogiAIImprovedV20.MATE + ply : 0;
        return alpha;
      }

	      this.tt.add(k.HashVal, alpha, alphaOrig, beta, bestMove ? this.moveKey(bestMove) : 0, depthLeft);
	      return alpha;
    } finally {
      if (this.enableRepetition) this.popRepetition();
    }
  }

  /**
   * Lightweight gate for the mate solver (V20).
   *
   * The solver is exact but costs a slice of the move budget, so we only run it when a mate is
   * plausible: attacking material close to the enemy king and/or pieces in hand to drop. In the
   * opening/midgame (no pieces near the enemy king) the gate is essentially free and always off.
   *
   * Condition: at least one own non-king piece within Chebyshev distance 3 of the enemy king,
   * and (near pieces + hand pieces) >= 2 — one lone attacker with an empty hand almost never mates.
   */
  private shouldTryMateSolve(k: KyokumenImproved): boolean {
    const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;
    if (enemyKing <= 0) return false;

    const kingSuji = enemyKing >> 4;
    const kingDan = enemyKing & 0x0f;

    let near = 0;
    for (let ds = -3; ds <= 3; ds++) {
      const suji = kingSuji + ds;
      if (suji < 1 || suji > 9) continue;
      for (let dd = -3; dd <= 3; dd++) {
        const dan = kingDan + dd;
        if (dan < 1 || dan > 9) continue;
        const p = k.get((suji << 4) + dan);
        if (p === EMPTY || p === WALL) continue;
        if (isSelf(k.teban, p) && getKomashu(p) !== OU) near++;
      }
    }
    if (near === 0) return false;

    let handCount = 0;
    for (let type = FU; type <= HI; type++) handCount += k.hand[k.teban | type] | 0;

    return near + handCount >= 2;
  }

  /**
   * Pre-search mate probe (V20).
   *
   * Before the main iterative-deepening search we spend a small, bounded budget asking the exact
   * question "do I have a forced mate by consecutive checks?". If yes, the mating move is returned
   * immediately — this is both faster and strictly more reliable than hoping the pruned main
   * search stumbles onto a deep sacrifice mate.
   *
   * Budget policy:
   * - timed searches: ~20% of the move budget, capped at 200ms (and at least 30ms to be useful)
   * - untimed searches (maxTimeMs <= 0, e.g. deterministic tests): fixed 250ms + node cap
   */
  private tryMateSolve(k: KyokumenImproved, maxTimeMs: number): Te | null {
    if (!this.shouldTryMateSolve(k)) return null;

    const mateStart = this.nowMs();
    const budgetMs = maxTimeMs > 0 ? Math.max(30, Math.min(200, Math.floor(maxTimeMs * 0.2))) : 250;
    const mate = this.mateSolver.solve(k, {
      maxPlies: 9,
      maxNodes: 150_000,
      maxTimeMs: budgetMs,
    });
    if (mate) return mate;

    // No mate found: hand the remaining budget to the main search (keeps total move time honest,
    // which also keeps self-play A/B comparisons fair).
    if (maxTimeMs > 0) {
      const spent = this.nowMs() - mateStart;
      this.maxTimeMs = Math.max(Math.floor(maxTimeMs / 2), maxTimeMs - Math.ceil(spent));
    }
    return null;
  }

	  getNextTe(k: KyokumenImproved, tesu: number = 0, options: ShogiAISearchOptions = {}): Te | null {
	    // Root move number (used only for opening-like ordering heuristics).
	    this.rootTesu = tesu | 0;
	    this.rootOrderBonusCache.clear();

	    const difficulty = options.difficulty ?? 'medium';

	    // Opening book first: if a safe move exists, skip search entirely (stronger + faster in the opening).
	    const book = getOpeningMoveImproved(k, difficulty);
	    if (book) return book;

	    // V20: one unified "brain" for every level.
	    //
	    // Every search technique is enabled at every difficulty; the ONLY thing difficulty changes is
	    // how much the engine is allowed to think (time budget + depth cap). Harder levels simply think
	    // longer/deeper. This both simplifies reasoning about strength and makes lower levels play
	    // "coherently weaker" instead of "differently dumb".
	    //
	    // Budgets are also shorter than V19's: master 10s→5s, expert 5s→4s (long waits made the app
	    // feel unusable) while medium sits at a human-like ~1s.
	    const defaults: { maxDepth: number; maxTimeMs: number; quiescenceDepthMax: number } = (() => {
	      switch (difficulty) {
	        case 'easy':
	          return { maxDepth: 32, maxTimeMs: 250, quiescenceDepthMax: 6 };
        case 'medium':
          return { maxDepth: 32, maxTimeMs: 1000, quiescenceDepthMax: 8 };
        case 'hard':
          return { maxDepth: 32, maxTimeMs: 2000, quiescenceDepthMax: 10 };
        case 'expert':
          return { maxDepth: 32, maxTimeMs: 4000, quiescenceDepthMax: 12 };
        case 'master':
          return { maxDepth: 32, maxTimeMs: 5000, quiescenceDepthMax: 12 };
      }
    })();

	    // Depth cap is part of the difficulty ladder (easy is depth-limited even if time remains).
	    const maxTimeMs = options.maxTimeMs ?? defaults.maxTimeMs;
	    this.maxTimeMs = maxTimeMs;
	    const maxDepth = Math.max(1, Math.min(options.maxDepth ?? defaults.maxDepth, 32));
	    this.quiescenceDepthMax = Math.max(0, options.quiescenceDepthMax ?? defaults.quiescenceDepthMax);
    this.evaluationMode = options.evaluationMode ?? 'v3';

    // V20 mate solver: before the main search, spend a small budget on an exact "do I have a
    // forced mate by consecutive checks?" probe (endgame-gated). A found mate is returned
    // immediately; otherwise the remaining time goes to the normal search (deducted inside).
    const mateMove = this.tryMateSolve(k, maxTimeMs);
    if (mateMove) return mateMove;

    // Unified search features (V20): everything on, at every level.
    this.enableAspiration = true;
    // V19 used 700-1000 (7-10 pawns) which barely cuts anything; ~3 pawns keeps most
    // iterations inside the window while still failing over to a full re-search when needed.
    this.aspirationWindow = 300;
    // Null move is particularly safe in shogi: passing is essentially never the best option
    // (zugzwang is vanishingly rare because drops always provide useful moves).
    this.enableLMR = true;
    this.enableNullMove = true;
    this.nullMoveReduction = maxTimeMs >= 3000 ? 3 : 2;
    this.enableCheckExtension = true;
    // Path check-extension budget: how many +1 check extensions a single root-to-leaf path
    // may spend. Deliberately tiny (1): a single extension lets the horizon-most forced check
    // be read one ply deeper — enough to reveal a mate at the leaf — while a larger budget makes
    // check-heavy endgames explode (measured: budget 3 cut completed depth ~2x at fixed time,
    // budget 1 barely moved it while still changing the chosen move in decided positions).
    // Kept in lockstep with WASM checkExtBudgetG.
    this.checkExtensionBudget = options.checkExtensionBudget ?? 1;
    this.enableDeltaPruning = true;
    // Keep the margin small to avoid pruning away real tactics; this is purely a quiescence speed knob.
    this.deltaPruningMargin = 150;
    this.enableFutility = true;
    this.enableQSeePruning = true;
    this.drawContempt = 12;
    this.enableQuiescenceChecks = true;
    // Check-aware quiescence finds "quiet check" tactics near the horizon but slows the engine if we
    // probe too many quiet moves; scale the bounds with the time budget instead of the difficulty label.
    this.quiescenceCheckMoveLimit = maxTimeMs >= 2000 ? 2 : 1;
    this.quiescenceCheckTryLimit = maxTimeMs >= 2000 ? 8 : 2;

    this.node = 0;
    this.leaf = 0;
    this.resetRootBest();
    this.killer1.fill(0);
    this.killer2.fill(0);
    this.history.clear();
    this.counterMove.clear();
    this.prevKeyByPly.fill(0);
    this.contHist.fill(0);
    this.prevPtByPly.fill(-1);
    this.extByPly.fill(0);
    this.repetitionCount.clear();
    this.repetitionStack.length = 0;

    const start = this.nowMs();
    this.startTime = start;

    // Search on a clone to guarantee we never mutate the caller's position.
    const position = k.clone();

    // Root-only metadata for opening-like ordering heuristics.
    let handTotal = 0;
    for (let i = 0; i < position.hand.length; i++) handTotal += position.hand[i] | 0;
    this.rootHandTotal = handTotal;
    this.rootInCheck = GenerateMovesImproved.isKingInCheck(position, position.teban);
    const selfKing = position.teban === SENTE ? position.kingS : position.kingG;
    this.rootKingDanger = this.rootInCheck ? 999 : this.computeKingDanger(position, position.teban, selfKing);

    // Root fallback:
    // Even if the time budget is extremely small, we must return *some* legal move.
    // This avoids "null move" timeouts in the UI and makes match scripts more stable.
    const rootMoves = GenerateMovesImproved.generateLegalMovesPooled(position, this.moveLists[0]);
    if (rootMoves.length === 0) return null;

	    const ttIndexAtRoot = this.tt.probe(position.HashVal);
	    const ttMoveKeyAtRoot = ttIndexAtRoot >= 0 ? (this.tt.bestKey[ttIndexAtRoot] | 0) : 0;
	    const ttSecondMoveKeyAtRoot = ttIndexAtRoot >= 0 ? (this.tt.secondKey[ttIndexAtRoot] | 0) : 0;
	    this.scoreAndSortMoves(position, rootMoves, 0, ttMoveKeyAtRoot, ttSecondMoveKeyAtRoot);

    let bestMove: Te | null = rootMoves[0].clone();
    let bestScore = -ShogiAIImprovedV20.INFINITE;
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
        const alpha0 = useAspiration ? bestScore - this.aspirationWindow : -ShogiAIImprovedV20.INFINITE;
        const beta0 = useAspiration ? bestScore + this.aspirationWindow : ShogiAIImprovedV20.INFINITE;

        let score = this.search(position, depth, alpha0, beta0, 0);
        if (useAspiration && (score <= alpha0 || score >= beta0)) {
          // V20: gradual widening — first retry with a 4x window on the failing side, then full.
          const wide = this.aspirationWindow * 4;
          const alpha1 = score <= alpha0 ? bestScore - wide : alpha0;
          const beta1 = score >= beta0 ? bestScore + wide : beta0;
          this.resetRootBest();
          score = this.search(position, depth, alpha1, beta1, 0);
          if (score <= alpha1 || score >= beta1) {
            this.resetRootBest();
            score = this.search(position, depth, -ShogiAIImprovedV20.INFINITE, ShogiAIImprovedV20.INFINITE, 0);
          }
        }

        const rootBest = this.rootBest;
        if (rootBest) {
          bestMove = rootBest.clone();
          bestScore = score;
          completedDepth = depth;
        }

        // If a forced mate is found, stop early.
        if (bestScore >= ShogiAIImprovedV20.MATE - 10_000) break;
      } catch (e) {
        if (e instanceof TimeUpError) break;
        throw e;
      }

      if (this.timeUp()) break;
    }

    if (options.debug) {
      const elapsed = this.nowMs() - start;
      console.log(
        `[ShogiAIImprovedV20] depth=${completedDepth}/${maxDepth} score=${bestScore} nodes=${this.node} leaves=${this.leaf} time=${Math.round(elapsed)}ms`
      );
    }

    return bestMove;
  }
}

// Shared instance so the TT can persist across moves during a single game.
// This noticeably improves strength at the same time budget because many positions reoccur (especially via transpositions).
const sharedAIV20 = new ShogiAIImprovedV20();

/**
 * Exported helper for UI/script compatibility.
 * Used by `/games/shogi-improved` and the fast-search path in `/games/shogi`.
 */
export function getBestMoveV20(k: KyokumenImproved, teban: number, difficulty: Difficulty, tesu: number = 0): Te | null {
  // The UI passes `teban` explicitly; keep the position consistent.
  k.setTeban(teban);
  return sharedAIV20.getNextTe(k, tesu, { difficulty });
}
