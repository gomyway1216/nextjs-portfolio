/**
 * DfpnMateSolverImproved — df-pn (depth-first proof-number) tsume solver.
 *
 * What this is
 * ------------
 * A best-first proof-number search executed depth-first with thresholds (Nagai's df-pn), searching
 * only forced mating sequences by consecutive checks (連続王手): at OR nodes the attacker plays
 * legal *checking* moves exclusively, at AND nodes the defender tries every legal reply.
 *
 * Why df-pn instead of the iterative-deepening AND/OR search in `MateSolverImproved`:
 * - Depth-first ID re-searches the whole tree for every mate length and spends its budget uniformly.
 *   df-pn expands the *most proof-constrained* leaf first, so narrow forcing lines (exactly what a
 *   long tsume is) are followed to their end without paying for the wide shallow frontier.
 * - It has no fixed horizon: one search proves a mate of any length that fits the node/time budget.
 *
 * Correctness (this solver must NEVER report a mate that is not one)
 * -----------------------------------------------------------------
 * Proof numbers are heuristics, and a transposition table keyed by a 62-bit dual hash can in
 * principle collide. Therefore a df-pn "proved" verdict is never trusted on its own: after the
 * search, `extractProof()` re-walks the tree from the root using real move generation and returns a
 * move only when it has re-derived an explicit proof tree whose every leaf is a genuine checkmate
 * (defender to move, in check, zero legal replies). The transposition table is used only to *order*
 * that walk. If the walk cannot re-derive a proof within its own budget, `solve()` returns null.
 * A false positive would therefore require the re-walk itself to be wrong, not merely the search.
 *
 * Shogi-specific rules
 * --------------------
 * - 打ち歩詰め (pawn-drop mate) is illegal: `generatePseudoLegalMovesPooled` filters those drops via
 *   `isUtiFuDume`, so they never enter the OR-node move list.
 * - 王手放置 / self-check is filtered lazily after make (`isKingInCheck(k, mover)`).
 * - 連続王手の千日手 (perpetual check) is a loss for the attacker, and a repetition can never be part
 *   of a shortest mate. Positions already on the current search path are treated as *disproved for
 *   the attacker*: at an OR node the move is unusable, at an AND node it is a successful defense.
 *
 * GHI (graph history interaction)
 * -------------------------------
 * A value derived from a path repetition — or from the ply cap — is history dependent and must not
 * be cached for other paths. Such results are marked `unstable` and are never written to the
 * transposition table when they are *disproofs*. Proofs are always safe to cache: a proof tree is
 * an explicit forced mate and never contains a repetition-derived value (repetitions only ever
 * produce disproofs). Consequently GHI can only ever cost this solver a mate it might have found —
 * it can never manufacture one.
 *
 * Engine invariants respected
 * ---------------------------
 * - `KyokumenImproved.move()/back()` do NOT flip `teban`; this solver toggles it explicitly.
 * - `Te.capture` must be accurate before `move()`; the pooled generator populates it.
 * - The caller's position is never mutated: `solve()` clones once and make/unmakes on the clone.
 */
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { MoveListImproved } from './MoveListImproved';
import { FU, GI, GOTE, HI, KA, KE, KI, KY, SENTE, Te, getKomashu } from './types';

/**
 * "Infinite" proof/disproof number. Kept well below 2^31 so that the `sum` of a full move list of
 * children can never overflow an Int32Array slot (600 * INF < 2^31 would not hold, so all sums are
 * saturated at INF explicitly by `addSat`).
 */
const INF = 1 << 28;

export interface DfpnMateSolverOptions {
  /**
   * Hard cap on mate length in plies. Lines longer than this are treated as unproven. Must be odd;
   * even values are rounded down. Default 31 (= mate in 16 attacker moves).
   */
  maxPlies?: number;
  /** Node budget for the df-pn search (proof-tree extraction has its own budget). `<= 0` disables. */
  maxNodes?: number;
  /** Wall-clock budget in ms covering search *and* proof extraction. `<= 0` disables. */
  maxTimeMs?: number;
  /** Transposition table size in entries; rounded up to a power of two. Default 1 << 20. */
  ttEntries?: number;
}

export interface DfpnMateSolverStats {
  /** df-pn search nodes (OR + AND). */
  nodes: number;
  /** Nodes spent re-deriving the explicit proof tree. */
  verifyNodes: number;
  /** Wall-clock ms for search + verification. */
  elapsedMs: number;
  /** True when the df-pn search itself reached a verdict (proved or disproved) for the root. */
  rootResolved: boolean;
  /** True when the root was proved by df-pn (before verification). */
  proved: boolean;
  /** Length in plies of the verified proof tree; 0 when no move is returned. */
  mateDepth: number;
  /** True when the budget ran out before a verdict. */
  aborted: boolean;
  /** True when df-pn proved the root but the proof could not be re-derived (result discarded). */
  verificationFailed: boolean;
}

/** Result of a successful solve. */
export interface DfpnMateResult {
  move: Te;
  /** Verified mate length in plies (odd). */
  mateDepth: number;
}

export class DfpnMateSolverImproved {
  /** Hard recursion cap; also bounds the per-ply scratch arrays. */
  private static readonly MAX_PLY = 40;
  /** Upper bound on generated moves at one node (9x9 board + 7 drop types is far below this). */
  private static readonly MAX_MOVES = 640;

  private readonly moveLists: MoveListImproved[] = Array.from(
    { length: DfpnMateSolverImproved.MAX_PLY + 1 },
    () => new MoveListImproved()
  );

  // Per-ply child caches (flat, indexed by ply * MAX_MOVES + i).
  private readonly childMove: Int32Array;
  private readonly childHashA: Int32Array;
  private readonly childHashB: Int32Array;
  private readonly childRepeat: Uint8Array;
  private readonly childScore: Int32Array;

  // Transposition table (open addressing, 4-slot linear probe).
  private ttMask = 0;
  private ttKeyA: Int32Array;
  private ttKeyB: Int32Array;
  private ttPn: Int32Array;
  private ttDn: Int32Array;
  private ttUsed: Uint8Array;

  private attacker = SENTE;
  private maxPly = 31;
  private maxNodes = 0;
  private maxTimeMs = 0;
  private nodes = 0;
  private verifyNodes = 0;
  private verifyBudget = 0;
  private startTime = 0;
  private aborted = false;

  // `mid()` return channel (avoids allocating a result object per node).
  private retPn = 0;
  private retDn = 0;
  private retUnstable = false;

  // Path repetition detection: full dual-hash identities of every position on the current path.
  private readonly pathHashes = new Map<number, Set<number>>();

  constructor(ttEntries = 1 << 20) {
    const size = DfpnMateSolverImproved.roundUpPow2(Math.max(1 << 12, ttEntries));
    this.ttMask = size - 1;
    this.ttKeyA = new Int32Array(size);
    this.ttKeyB = new Int32Array(size);
    this.ttPn = new Int32Array(size);
    this.ttDn = new Int32Array(size);
    this.ttUsed = new Uint8Array(size);

    const cells = (DfpnMateSolverImproved.MAX_PLY + 1) * DfpnMateSolverImproved.MAX_MOVES;
    this.childMove = new Int32Array(cells);
    this.childHashA = new Int32Array(cells);
    this.childHashB = new Int32Array(cells);
    this.childRepeat = new Uint8Array(cells);
    this.childScore = new Int32Array(cells);
  }

  private static roundUpPow2(n: number): number {
    let v = 1;
    while (v < n) v <<= 1;
    return v;
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  private budgetExceeded(): boolean {
    if (this.aborted) return true;
    if (this.maxNodes > 0 && this.nodes >= this.maxNodes) {
      this.aborted = true;
      return true;
    }
    if (this.maxTimeMs > 0 && (this.nodes & 255) === 0 && this.nowMs() - this.startTime >= this.maxTimeMs) {
      this.aborted = true;
      return true;
    }
    return false;
  }

  /** Saturating add used for proof/disproof number sums. */
  private static addSat(a: number, b: number): number {
    const s = a + b;
    return s >= INF ? INF : s;
  }

  // ---------------------------------------------------------------------------
  // Transposition table
  // ---------------------------------------------------------------------------

  private ttIndex(hashA: number, hashB: number): number {
    // Mix both halves; `hashA` is only 30 bits wide and `hashB` is an independent 32-bit lock.
    return (Math.imul(hashA, 0x9e3779b1) ^ Math.imul(hashB, 0x85ebca6b)) & this.ttMask;
  }

  /** Reads (pn, dn) into `retPn`/`retDn`; unknown nodes default to (1, 1). */
  private ttLookup(hashA: number, hashB: number): void {
    const base = this.ttIndex(hashA, hashB);
    for (let i = 0; i < 4; i++) {
      const slot = (base + i) & this.ttMask;
      if (this.ttUsed[slot] === 0) break;
      if (this.ttKeyA[slot] === hashA && this.ttKeyB[slot] === hashB) {
        this.retPn = this.ttPn[slot]!;
        this.retDn = this.ttDn[slot]!;
        return;
      }
    }
    this.retPn = 1;
    this.retDn = 1;
  }

  private ttStore(hashA: number, hashB: number, pn: number, dn: number): void {
    const base = this.ttIndex(hashA, hashB);
    let victim = -1;
    for (let i = 0; i < 4; i++) {
      const slot = (base + i) & this.ttMask;
      if (this.ttUsed[slot] === 0) {
        victim = slot;
        break;
      }
      if (this.ttKeyA[slot] === hashA && this.ttKeyB[slot] === hashB) {
        victim = slot;
        break;
      }
      // Prefer evicting a non-terminal (still-unresolved) entry: solved entries are what the
      // proof-tree extraction walks afterwards, so they are the expensive ones to lose.
      if (victim < 0 && this.ttPn[slot] !== 0 && this.ttDn[slot] !== 0) victim = slot;
    }
    if (victim < 0) victim = base;
    this.ttKeyA[victim] = hashA;
    this.ttKeyB[victim] = hashB;
    this.ttPn[victim] = pn;
    this.ttDn[victim] = dn;
    this.ttUsed[victim] = 1;
  }

  private ttClear(): void {
    this.ttUsed.fill(0);
  }

  // ---------------------------------------------------------------------------
  // Path repetition
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Move generation helpers
  // ---------------------------------------------------------------------------

  /**
   * Cheap pre-filter for drop moves: can a `koma` dropped on `to` possibly check the king on
   * `enemyKing`? Drops never give discovered check, so a geometric test is exact up to blockers
   * (sliding paths are validated by the real make/`isKingInCheck` test afterwards).
   */
  private dropMayGiveCheck(koma: number, to: number, enemyKing: number, attacker: number): boolean {
    const ds = (enemyKing >> 4) - (to >> 4);
    const dd = (enemyKing & 0x0f) - (to & 0x0f);
    const forward = attacker === SENTE ? -1 : 1;
    const type = getKomashu(koma);

    switch (type) {
      case FU:
        return ds === 0 && dd === forward;
      case KE:
        return Math.abs(ds) === 1 && dd === forward * 2;
      case GI:
        if (Math.abs(ds) > 1 || Math.abs(dd) > 1) return false;
        return dd === forward || (Math.abs(ds) === 1 && dd !== 0);
      case KI:
        if (Math.abs(ds) > 1 || Math.abs(dd) > 1) return false;
        return !(dd === -forward && Math.abs(ds) === 1);
      case KY:
        return ds === 0 && (forward < 0 ? dd < 0 : dd > 0);
      case KA:
        return ds !== 0 && Math.abs(ds) === Math.abs(dd);
      case HI:
        return ds === 0 || dd === 0;
      default:
        return true;
    }
  }

  /**
   * Expand `k` at `ply` into the per-ply child cache and return the child count.
   *
   * OR nodes keep only legal moves that give check; AND nodes keep every legal reply. Each surviving
   * child records the *child* position's dual hash (side-to-move already toggled) so the df-pn loop
   * can re-read transposition entries without redoing make/unmake.
   */
  private expand(k: KyokumenImproved, ply: number, isOr: boolean): number {
    const base = ply * DfpnMateSolverImproved.MAX_MOVES;
    const mover = k.teban;
    const opponent = mover === SENTE ? GOTE : SENTE;
    const enemyKing = mover === SENTE ? k.kingG : k.kingS;
    if (isOr && enemyKing <= 0) return 0;

    const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, this.moveLists[ply]!);
    let n = 0;

    for (let i = 0; i < moves.length; i++) {
      const te = moves[i]!;
      if (isOr && te.from === 0 && !this.dropMayGiveCheck(te.koma, te.to, enemyKing, mover)) continue;

      k.move(te);
      if (GenerateMovesImproved.isKingInCheck(k, mover)) {
        k.back(te);
        continue;
      }
      if (isOr && !GenerateMovesImproved.isKingInCheck(k, opponent)) {
        k.back(te);
        continue;
      }
      k.toggleTeban();
      const hashA = k.HashVal;
      const hashB = k.SecondaryHashVal;
      k.toggleTeban();
      k.back(te);

      if (n >= DfpnMateSolverImproved.MAX_MOVES) break;
      const slot = base + n;
      this.childMove[slot] = i;
      this.childHashA[slot] = hashA;
      this.childHashB[slot] = hashB;
      this.childRepeat[slot] = this.hasPathHash(hashA, hashB) ? 1 : 0;
      // Ordering heuristic: at OR nodes prefer checks delivered next to the enemy king (they cut
      // escape squares) and captures; at AND nodes prefer king moves (most likely to refute).
      let score = 0;
      if (isOr) {
        const ds = Math.abs((enemyKing >> 4) - (te.to >> 4));
        const dd = Math.abs((enemyKing & 0x0f) - (te.to & 0x0f));
        score = -Math.max(ds, dd) * 4 + (te.capture !== 0 ? 2 : 0) + (te.from === 0 ? 0 : 1);
      }
      this.childScore[slot] = score;
      n++;
    }

    if (isOr && n > 1) this.sortChildren(base, n);
    return n;
  }

  /** Insertion sort of the child cache by descending `childScore` (n is small). */
  private sortChildren(base: number, n: number): void {
    for (let i = 1; i < n; i++) {
      const si = base + i;
      const move = this.childMove[si]!;
      const hashA = this.childHashA[si]!;
      const hashB = this.childHashB[si]!;
      const rep = this.childRepeat[si]!;
      const score = this.childScore[si]!;
      let j = i - 1;
      while (j >= 0 && this.childScore[base + j]! < score) {
        const from = base + j;
        const to = base + j + 1;
        this.childMove[to] = this.childMove[from]!;
        this.childHashA[to] = this.childHashA[from]!;
        this.childHashB[to] = this.childHashB[from]!;
        this.childRepeat[to] = this.childRepeat[from]!;
        this.childScore[to] = this.childScore[from]!;
        j--;
      }
      const to = base + j + 1;
      this.childMove[to] = move;
      this.childHashA[to] = hashA;
      this.childHashB[to] = hashB;
      this.childRepeat[to] = rep;
      this.childScore[to] = score;
    }
  }

  // ---------------------------------------------------------------------------
  // df-pn core
  // ---------------------------------------------------------------------------

  /**
   * Multiple-iterative-deepening node routine. Expands the subtree at `k` until its proof number
   * reaches `thpn` or its disproof number reaches `thdn`, then writes the result to
   * `retPn`/`retDn`/`retUnstable`.
   *
   * Proof/disproof numbers are always from the attacker's point of view:
   * - OR node (attacker to move): pn = min over children, dn = sum over children.
   * - AND node (defender to move): pn = sum over children, dn = min over children.
   */
  private mid(k: KyokumenImproved, ply: number, thpn: number, thdn: number): void {
    this.nodes++;
    if (this.budgetExceeded()) {
      this.retPn = 1;
      this.retDn = 1;
      this.retUnstable = true;
      return;
    }

    const isOr = k.teban === this.attacker;
    // The ply cap bounds the mate length. Only OR nodes are cut: cutting an AND node would let a
    // defender "escape" by running out the cap, which is the same disproof, but cutting at the OR
    // node keeps the cap aligned with odd mate lengths.
    if (ply >= this.maxPly) {
      this.retPn = INF;
      this.retDn = 0;
      this.retUnstable = true;
      return;
    }

    const hashA = k.HashVal;
    const hashB = k.SecondaryHashVal;

    this.ttLookup(hashA, hashB);
    let pn = this.retPn;
    let dn = this.retDn;
    if (pn >= thpn || dn >= thdn) {
      this.retUnstable = false;
      return;
    }

    const n = this.expand(k, ply, isOr);
    if (n === 0) {
      if (isOr) {
        // No legal checking move: the attacker cannot continue the mating sequence.
        pn = INF;
        dn = 0;
      } else {
        // The defender is in check (every AND node is entered through a checking move) and has no
        // legal reply: this is checkmate.
        pn = 0;
        dn = INF;
      }
      this.ttStore(hashA, hashB, pn, dn);
      this.retPn = pn;
      this.retDn = dn;
      this.retUnstable = false;
      return;
    }

    const base = ply * DfpnMateSolverImproved.MAX_MOVES;
    const moves = this.moveLists[ply]!.moves;
    let unstable = false;

    for (;;) {
      // Aggregate the children straight from the transposition table.
      let bestIdx = -1;
      let best = INF + 1; // best (minimised) number for this node type
      let second = INF;
      let sum = 0;

      for (let i = 0; i < n; i++) {
        const slot = base + i;
        let cpn: number;
        let cdn: number;
        if (this.childRepeat[slot] === 1) {
          // Repetition: disproved for the attacker (perpetual check is an attacker loss).
          cpn = INF;
          cdn = 0;
          unstable = true;
        } else {
          this.ttLookup(this.childHashA[slot]!, this.childHashB[slot]!);
          cpn = this.retPn;
          cdn = this.retDn;
        }

        const mine = isOr ? cpn : cdn; // minimised at this node type
        const other = isOr ? cdn : cpn; // summed at this node type
        sum = DfpnMateSolverImproved.addSat(sum, other);
        if (mine < best) {
          second = best;
          best = mine;
          bestIdx = i;
        } else if (mine < second) {
          second = mine;
        }
      }

      if (best > INF) best = INF;
      pn = isOr ? best : sum;
      dn = isOr ? sum : best;

      if (pn >= thpn || dn >= thdn || bestIdx < 0 || best >= INF) {
        break;
      }

      // Thresholds for the selected child (Nagai's df-pn).
      const slot = base + bestIdx;
      this.ttLookup(this.childHashA[slot]!, this.childHashB[slot]!);
      const childPn = this.retPn;
      const childDn = this.retDn;

      let childThPn: number;
      let childThDn: number;
      if (isOr) {
        childThPn = Math.min(thpn, second >= INF ? INF : second + 1);
        childThDn = Math.min(INF, thdn - sum + childDn);
      } else {
        childThDn = Math.min(thdn, second >= INF ? INF : second + 1);
        childThPn = Math.min(INF, thpn - sum + childPn);
      }

      const te = moves[this.childMove[slot]!]!;
      k.move(te);
      k.toggleTeban();
      this.addPathHash(k.HashVal, k.SecondaryHashVal);
      this.mid(k, ply + 1, childThPn, childThDn);
      const childUnstable = this.retUnstable;
      const childRetPn = this.retPn;
      this.deletePathHash(k.HashVal, k.SecondaryHashVal);
      k.toggleTeban();
      k.back(te);

      if (childUnstable) {
        unstable = true;
        // An unstable disproof is deliberately NOT written to the transposition table (GHI), so a
        // plain re-read would return "unknown" and this loop would re-search it forever. Latch it
        // on the child slot instead: the value is correct for *this* path, which is all the loop
        // needs, and it disappears with the node.
        if (childRetPn >= INF) this.childRepeat[base + bestIdx] = 1;
      }
      if (this.aborted) {
        this.retPn = pn;
        this.retDn = dn;
        this.retUnstable = true;
        return;
      }
    }

    // GHI: never cache a disproof that depended on a path repetition or on the ply cap. Proofs are
    // path independent (a proof tree contains no repetition-derived value) and are always cached.
    const isDisproof = pn >= INF;
    if (!(unstable && isDisproof)) {
      this.ttStore(hashA, hashB, pn, dn);
    }
    this.retPn = pn;
    this.retDn = dn;
    this.retUnstable = unstable;
  }

  // ---------------------------------------------------------------------------
  // Proof-tree extraction (the correctness gate)
  // ---------------------------------------------------------------------------

  /**
   * Re-derive an explicit proof tree from `k` using real move generation, and return its depth in
   * plies (odd, >= 1) or -1 when no proof could be re-derived within `verifyBudget` nodes.
   *
   * The transposition table is consulted only to try the children the search believes are solved
   * first. Every checkmate leaf is re-verified structurally: the defender is to move, has been given
   * check by the move above, and has zero legal replies.
   *
   * `bestMoveOut` receives the chosen root move when `ply === 0`.
   */
  private extractProof(k: KyokumenImproved, ply: number, bestMoveOut: Te[] | null): number {
    if (ply >= this.maxPly) return -1;
    if (this.verifyNodes++ >= this.verifyBudget) return -1;
    if (this.maxTimeMs > 0 && (this.verifyNodes & 255) === 0 && this.nowMs() - this.startTime >= this.maxTimeMs) {
      this.verifyNodes = this.verifyBudget;
      return -1;
    }

    const isOr = k.teban === this.attacker;
    const n = this.expand(k, ply, isOr);
    if (n === 0) {
      // OR node without a checking move proves nothing; AND node without a legal reply is mate.
      return isOr ? -1 : 0;
    }

    const base = ply * DfpnMateSolverImproved.MAX_MOVES;
    const moves = this.moveLists[ply]!.moves;

    if (isOr) {
      // Try transposition-proved children first, then everything else.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          const slot = base + i;
          if (this.childRepeat[slot] === 1) continue;
          this.ttLookup(this.childHashA[slot]!, this.childHashB[slot]!);
          const proved = this.retPn === 0;
          if ((pass === 0) !== proved) continue;

          const te = moves[this.childMove[slot]!]!;
          const teSnapshot = te.clone();
          k.move(te);
          k.toggleTeban();
          this.addPathHash(k.HashVal, k.SecondaryHashVal);
          const depth = this.extractProof(k, ply + 1, null);
          this.deletePathHash(k.HashVal, k.SecondaryHashVal);
          k.toggleTeban();
          k.back(te);

          if (depth >= 0) {
            if (bestMoveOut) bestMoveOut[0] = teSnapshot;
            return depth + 1;
          }
          if (this.verifyNodes >= this.verifyBudget) return -1;
        }
      }
      return -1;
    }

    // AND node: every legal reply must lead to mate; the tree depth is the worst case.
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const slot = base + i;
      // A defender reply that repeats a position on the path is a successful defense.
      if (this.childRepeat[slot] === 1) return -1;
      const te = moves[this.childMove[slot]!]!;
      k.move(te);
      k.toggleTeban();
      this.addPathHash(k.HashVal, k.SecondaryHashVal);
      const depth = this.extractProof(k, ply + 1, null);
      this.deletePathHash(k.HashVal, k.SecondaryHashVal);
      k.toggleTeban();
      k.back(te);

      if (depth < 0) return -1;
      if (depth + 1 > worst) worst = depth + 1;
    }
    return worst;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  private lastStats: DfpnMateSolverStats = {
    nodes: 0,
    verifyNodes: 0,
    elapsedMs: 0,
    rootResolved: false,
    proved: false,
    mateDepth: 0,
    aborted: false,
    verificationFailed: false,
  };

  /** Diagnostics for the most recent `solve()` / `solveDetailed()` call. */
  get stats(): DfpnMateSolverStats {
    return this.lastStats;
  }

  /**
   * Search for a forced mate for the side to move in `k0`.
   *
   * Returns the first move of a *verified* forced mate, or `null` when no mate was proven — either
   * genuinely no mate within the ply cap, or the budget ran out. Callers should treat both the same
   * way and fall back to the normal search.
   */
  solve(k0: KyokumenImproved, options: DfpnMateSolverOptions = {}): Te | null {
    return this.solveDetailed(k0, options)?.move ?? null;
  }

  /** As `solve()`, but also reports the verified mate length. */
  solveDetailed(k0: KyokumenImproved, options: DfpnMateSolverOptions = {}): DfpnMateResult | null {
    const requested = options.maxPlies ?? 31;
    const capped = Math.min(DfpnMateSolverImproved.MAX_PLY - 1, requested);
    this.maxPly = capped % 2 === 0 ? capped - 1 : capped;
    if (this.maxPly < 1) return null;

    this.maxNodes = options.maxNodes ?? 200_000;
    this.maxTimeMs = options.maxTimeMs ?? 200;
    this.nodes = 0;
    this.verifyNodes = 0;
    this.aborted = false;
    this.startTime = this.nowMs();
    this.pathHashes.clear();
    this.ttClear();

    const k = k0.clone();
    this.attacker = k.teban;
    this.addPathHash(k.HashVal, k.SecondaryHashVal);

    this.mid(k, 0, INF, INF);
    const rootPn = this.retPn;
    const rootDn = this.retDn;
    const proved = rootPn === 0;
    const rootResolved = rootPn === 0 || rootDn === 0 || rootPn >= INF || rootDn >= INF;

    let mateDepth = 0;
    let move: Te | null = null;
    let verificationFailed = false;

    if (proved) {
      // Never trust the search verdict on its own: re-derive the proof tree with real move
      // generation. `verifyBudget` is generous but finite so a corrupted table cannot hang the UI.
      this.verifyBudget = Math.max(20_000, Math.min(400_000, this.nodes));
      this.verifyNodes = 0;
      const out: Te[] = [];
      const depth = this.extractProof(k, 0, out);
      if (depth > 0 && out[0]) {
        mateDepth = depth;
        move = out[0];
      } else {
        verificationFailed = true;
      }
    }

    this.lastStats = {
      nodes: this.nodes,
      verifyNodes: this.verifyNodes,
      elapsedMs: this.nowMs() - this.startTime,
      rootResolved,
      proved,
      mateDepth,
      aborted: this.aborted,
      verificationFailed,
    };

    return move ? { move, mateDepth } : null;
  }
}
