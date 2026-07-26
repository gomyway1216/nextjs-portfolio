/**
 * MateSolverImproved (詰み専用探索 / checkmate solver)
 *
 * What this is:
 * - A dedicated "tsume" (mate) solver that searches ONLY forced mating sequences by consecutive checks
 *   (連続王手): the attacker plays checking moves exclusively, the defender tries every legal reply.
 * - This is an AND/OR tree search with iterative deepening over the mate length (1, 3, 5, ... plies).
 *   df-pn would scale further, but a depth-limited AND/OR search with node/time budgets is simple,
 *   allocation-free (pooled move lists) and already solves typical 7-9 ply mates well within a
 *   couple hundred milliseconds on the positions this engine reaches.
 *
 * Why a separate solver (instead of relying on the main alpha-beta search):
 * - The main search prunes aggressively (futility/LMR/null-move) and its move ordering is tuned for
 *   general play; deep forced mates with sacrifices are exactly the lines those heuristics cut.
 * - A checks-only searcher has a tiny branching factor for the attacker, so it can prove/refute
 *   "mate in N" far faster and *exactly*.
 *
 * Rules handled:
 * - 打ち歩詰め (pawn-drop mate) is illegal: `generatePseudoLegalMovesPooled` already filters those
 *   drops via `isUtiFuDume`, so the solver never proposes them.
 * - 王手放置 / self-check: filtered lazily after make (`isKingInCheck(k, mover)`).
 * - 千日手 loops (e.g. perpetual-check shuffles): positions already on the current search path are
 *   never re-entered. Repetition can never be part of a shortest mate, and perpetual check is an
 *   attacker loss anyway, so pruning re-visits is both safe and correct here.
 *
 * Important engine invariants respected:
 * - `KyokumenImproved.move()/back()` do NOT flip `teban`; this solver toggles it explicitly.
 * - `Te.capture` must be accurate before `move()`; the pooled generator populates it.
 * - The caller's position is never mutated: `solve()` clones once and make/unmakes on the clone.
 */
import { KyokumenImproved } from './KyokumenImproved';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { MoveListImproved } from './MoveListImproved';
import { FU, GI, GOTE, HI, KA, KE, KI, KY, SENTE, Te, getKomashu } from './types';

export interface MateSolverOptions {
  /**
   * Maximum mate length in plies (attacker moves + defender replies). Must be odd; even values are
   * rounded down. Default 7 (= mate in 4 attacker moves).
   */
  maxPlies?: number;
  /** Node budget across the whole solve (attack+defend nodes). `<= 0` disables the limit. */
  maxNodes?: number;
  /** Time budget in ms. `<= 0` disables the limit. */
  maxTimeMs?: number;
}

export class MateSolverImproved {
  private static readonly MAX_PLY = 24;

  // Pooled per-ply move lists (same pattern as the engines): zero allocation per node.
  private moveLists: MoveListImproved[] = Array.from(
    { length: MateSolverImproved.MAX_PLY + 1 },
    () => new MoveListImproved()
  );

  private nodes = 0;
  private maxNodes = 0;
  private startTime = 0;
  private maxTimeMs = 0;
  private aborted = false;

  // Full dual-hash identities of every position on the current search path. The primary
  // 30-bit hash remains the outer-map index; the independent full-width secondary lock
  // prevents a collision from being mistaken for a repetition.
  private pathHashes = new Map<number, Set<number>>();

  private hasPathHash(primary: number, secondary: number): boolean {
    return this.pathHashes.get(primary)?.has(secondary) ?? false;
  }

  private addPathHash(primary: number, secondary: number): void {
    let bucket = this.pathHashes.get(primary);
    if (!bucket) {
      bucket = new Set<number>();
      this.pathHashes.set(primary, bucket);
    }
    bucket.add(secondary);
  }

  private deletePathHash(primary: number, secondary: number): void {
    const bucket = this.pathHashes.get(primary);
    if (!bucket) return;
    bucket.delete(secondary);
    if (bucket.size === 0) this.pathHashes.delete(primary);
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  /**
   * Returns true (and latches `aborted`) once the node or time budget is exhausted.
   * Once aborted, every result bubbling up is treated as "unknown / no mate proven".
   */
  private budgetExceeded(): boolean {
    if (this.aborted) return true;
    if (this.maxNodes > 0 && this.nodes >= this.maxNodes) {
      this.aborted = true;
      return true;
    }
    // Time checks are relatively expensive; sample every 128 nodes.
    if (this.maxTimeMs > 0 && (this.nodes & 127) === 0 && this.nowMs() - this.startTime >= this.maxTimeMs) {
      this.aborted = true;
      return true;
    }
    return false;
  }

  /**
   * Cheap pre-filter for drop moves: can a `koma` dropped on `to` possibly check the king on
   * `enemyKing`? Drops never give discovered check, so a geometric test is exact up to blockers
   * (sliding paths are validated by the real make/`isKingInCheck` test afterwards).
   *
   * This matters because endgame positions have large hands, and drops dominate the pseudo-legal
   * move list (~70 drop squares per piece type); skipping the make/unmake for the vast majority
   * of non-checking drops is the solver's main speed lever.
   */
  private dropMayGiveCheck(koma: number, to: number, enemyKing: number, attacker: number): boolean {
    const ds = (enemyKing >> 4) - (to >> 4);
    const dd = (enemyKing & 0x0f) - (to & 0x0f);
    const forward = attacker === SENTE ? -1 : 1; // attacker's forward direction in dan
    const type = getKomashu(koma);

    switch (type) {
      case FU:
        return ds === 0 && dd === forward;
      case KE:
        return Math.abs(ds) === 1 && dd === forward * 2;
      case GI:
        if (Math.abs(ds) > 1 || Math.abs(dd) > 1) return false;
        // Silver: straight forward + all four diagonals (never sideways).
        return dd === forward || (Math.abs(ds) === 1 && dd !== 0);
      case KI:
        if (Math.abs(ds) > 1 || Math.abs(dd) > 1) return false;
        // Gold: everything except the two backward diagonals.
        return !(dd === -forward && Math.abs(ds) === 1);
      case KY:
        return ds === 0 && (forward < 0 ? dd < 0 : dd > 0);
      case KA:
        return ds !== 0 && Math.abs(ds) === Math.abs(dd);
      case HI:
        return ds === 0 || dd === 0;
      default:
        return true; // unknown type: don't filter
    }
  }

  /**
   * Search for a forced mate for the side to move in `k0`.
   *
   * Returns the first move of the shortest forced mate found within the budget, or `null` when
   * no mate was proven (either genuinely no mate within `maxPlies`, or the budget ran out —
   * the caller should treat both the same way: fall back to the normal search).
   */
  solve(k0: KyokumenImproved, options: MateSolverOptions = {}): Te | null {
    const requested = options.maxPlies ?? 7;
    // Force an odd ply count (a mate always ends on an attacker move) and respect the pool size.
    const maxPlies = Math.min(MateSolverImproved.MAX_PLY - 1, requested % 2 === 0 ? requested - 1 : requested);
    if (maxPlies < 1) return null;

    this.maxNodes = options.maxNodes ?? 200_000;
    this.maxTimeMs = options.maxTimeMs ?? 200;
    this.nodes = 0;
    this.aborted = false;
    this.startTime = this.nowMs();
    this.pathHashes.clear();

    // Never mutate the caller's position.
    const k = k0.clone();
    this.addPathHash(k.HashVal, k.SecondaryHashVal);

    // Iterative deepening over the mate length: returns the *shortest* mate first and keeps
    // shallow (cheap) proofs from being drowned by the deep search.
    for (let plies = 1; plies <= maxPlies; plies += 2) {
      const te = this.attack(k, plies, 0);
      if (te) return te;
      if (this.aborted) return null;
    }
    return null;
  }

  /**
   * OR node: the attacker (side to move in `k`) tries every legal checking move.
   * Returns a mating move if one forces mate within `pliesLeft` plies, else null.
   */
  private attack(k: KyokumenImproved, pliesLeft: number, ply: number): Te | null {
    if (pliesLeft < 1) return null;
    if (ply >= MateSolverImproved.MAX_PLY) return null;
    this.nodes++;
    if (this.budgetExceeded()) return null;

    const attacker = k.teban;
    const defender = attacker === SENTE ? GOTE : SENTE;
    const enemyKing = attacker === SENTE ? k.kingG : k.kingS;
    if (enemyKing <= 0) return null;

    const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, this.moveLists[ply]!);

    for (const te of moves) {
      // Cheap geometric filter: most drops can't possibly check; skip the make/unmake for them.
      // (Board moves are never filtered here because they can give discovered check.)
      if (te.from === 0 && !this.dropMayGiveCheck(te.koma, te.to, enemyKing, attacker)) continue;

      k.move(te);
      // Lazy legality: the pseudo-legal generator does not filter 王手放置.
      if (GenerateMovesImproved.isKingInCheck(k, attacker)) {
        k.back(te);
        continue;
      }
      // Checks only: every attacker move in a tsume sequence must check the enemy king.
      if (!GenerateMovesImproved.isKingInCheck(k, defender)) {
        k.back(te);
        continue;
      }

      k.toggleTeban();
      let mated = false;
      const hashA = k.HashVal;
      const hashB = k.SecondaryHashVal;
      if (!this.hasPathHash(hashA, hashB)) {
        this.addPathHash(hashA, hashB);
        mated = this.defend(k, pliesLeft - 1, ply + 1);
        this.deletePathHash(hashA, hashB);
      }
      k.toggleTeban();
      k.back(te);

      if (this.aborted) return null;
      // The pooled `Te` is reused by the generator; clone before returning it upward.
      if (mated) return te.clone();
    }

    return null;
  }

  /**
   * AND node: the defender (side to move in `k`, currently in check) tries every legal reply.
   * Returns true only when EVERY legal reply still leads to mate within the remaining budget
   * (or when there is no legal reply at all — that is the checkmate base case).
   */
  private defend(k: KyokumenImproved, pliesLeft: number, ply: number): boolean {
    if (ply >= MateSolverImproved.MAX_PLY) return false;
    this.nodes++;
    if (this.budgetExceeded()) return false;

    const defender = k.teban;
    const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, this.moveLists[ply]!);

    for (const te of moves) {
      k.move(te);
      // Still in check after the reply → the reply was illegal.
      if (GenerateMovesImproved.isKingInCheck(k, defender)) {
        k.back(te);
        continue;
      }

      // The defender has at least one legal reply. If the attacker has no budget left for another
      // check (a reply costs 1 ply, the next check needs 1 more), this line is not a mate.
      if (pliesLeft <= 1) {
        k.back(te);
        return false;
      }

      k.toggleTeban();
      let refuted = true;
      const hashA = k.HashVal;
      const hashB = k.SecondaryHashVal;
      if (!this.hasPathHash(hashA, hashB)) {
        this.addPathHash(hashA, hashB);
        refuted = this.attack(k, pliesLeft - 1, ply + 1) === null;
        this.deletePathHash(hashA, hashB);
      }
      // Note: if the position repeats (`pathHashes` hit), we conservatively treat the reply as a
      // successful defense — perpetual check is a loss for the attacker under shogi rules.
      k.toggleTeban();
      k.back(te);

      if (this.aborted || refuted) return false;
    }

    // No legal reply while in check → checkmate. (The generator emits every pseudo-legal reply and
    // nothing above prunes a legal one, so reaching here really means "no legal defense".)
    return true;
  }
}
