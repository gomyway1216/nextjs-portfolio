import {
  SENTE, GOTE, EMPTY, WALL,
  SFU, SKY, SKE, SGI, SKI, SKA, SHI, SOU, STO, SNY, SNK, SNG, SUM, SRY,
  GFU, GKY, GKE, GGI, GKI, GKA, GHI, GOU, GTO, GNY, GNK, GNG, GUM, GRY,
  FU, KY, KE, GI, KI, KA, HI, OU, UM, RY, PROMOTE,
  Te, komaValue, isSente, isGote, isSelf
} from './types';

/**
 * KyokumenImproved (fast shogi position representation)
 *
 * Differences vs the original `Kyokumen` implementation:
 * - Uses a 1D board array with (suji<<4)+dan indexing for faster access and simpler hashing.
 * - Maintains incremental evaluation (`eval`) and incremental Zobrist hash (`HashVal`) for TT.
 * - Uses count-based hands (`hand[koma] = count`) instead of arrays of captured pieces.
 *
 * Important invariant:
 * - `move(te)` and `back(te)` do NOT flip `teban`. Callers (search, UI) must change `teban` explicitly.
 */

export class KyokumenImproved {
  // Board array (1D array with encoding (suji<<4)+dan)
  ban: number[];

  // Hand array (count-based, indexed by piece with player flag)
  hand: number[];

  // Turn (SENTE or GOTE)
  teban: number;

  // Evaluation value from current position
  eval: number;

  // King positions (-34 when not on board)
  kingS: number;
  kingG: number;

  // Hash values for transposition table
  HashVal: number;
  BanHash: number;
  HandHash: number;

  // Hash seeds (Zobrist hashing)
  static HashSeed: number[][] = [];
  static HandHashSeed: number[][] = [];
  static TebanHashSeed = 0;
  static hashInitialized = false;

  constructor() {
    this.ban = new Array(16 * 11);
    this.hand = new Array(GHI + 1).fill(0);
    this.teban = SENTE;
    this.eval = 0;
    this.kingS = -34;
    this.kingG = -34;
    this.HashVal = 0;
    this.BanHash = 0;
    this.HandHash = 0;

    // Initialize board with WALL
    for (let i = 0; i < 16 * 11; i++) {
      this.ban[i] = WALL;
    }

    // Clear actual board positions
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        this.ban[(suji << 4) + dan] = EMPTY;
      }
    }

    // Initialize hash if not done
    if (!KyokumenImproved.hashInitialized) {
      KyokumenImproved.initializeHash();
    }
  }

  /**
   * Initialize Zobrist hash seeds (static).
   *
   * Why this is careful:
   * - Transposition Tables only work if hashes are well-distributed and actually change per position.
   * - A previous approach used 48-bit bitwise operations (like Java's LCG) but JavaScript bitwise operators are
   *   *32-bit*, which can accidentally produce all zeros and collapse the entire TT (every position hashes to 0).
   *
   * This implementation uses a deterministic 32-bit PRNG (Mulberry32-ish) via `Math.imul` so:
   * - seeds are stable across runtime/environment
   * - values are non-zero and well-mixed for our purposes
   */
  static initializeHash(): void {
    // Deterministic 32-bit PRNG (stable across runtimes)
    let seed = 0x6d2b79f5 >>> 0;
    const rand32 = (): number => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
    const rand30 = (): number => rand32() & 0x3fffffff;

    // Initialize board hash seeds
    this.HashSeed = Array(GRY + 1).fill(null).map(() => new Array(16 * 11).fill(0));
    for (let i = 0; i <= GRY; i++) {
      for (let j = 0; j < 16 * 11; j++) {
        this.HashSeed[i][j] = rand30();
      }
    }

    // Initialize hand hash seeds
    this.HandHashSeed = Array(GHI + 1).fill(null).map(() => new Array(20).fill(0));
    for (let i = 0; i <= GHI; i++) {
      for (let j = 0; j < 20; j++) {
        this.HandHashSeed[i][j] = rand30();
      }
    }

    // Side-to-move seed.
    // The transposition table key MUST include which side is to move; otherwise the same board+hand
    // position would be treated as identical for both turns, which is incorrect for negamax scoring
    // and will corrupt TT cutoffs / best-move ordering.
    this.TebanHashSeed = rand30() || 1;

    this.hashInitialized = true;
  }

  // Clone the position
  clone(): KyokumenImproved {
    const k = new KyokumenImproved();

    // Copy board
    for (let i = 0; i < 16 * 11; i++) {
      k.ban[i] = this.ban[i];
    }

    // Copy hand
    for (let i = SFU; i <= GHI; i++) {
      k.hand[i] = this.hand[i];
    }

    // Copy other properties
    k.teban = this.teban;
    k.eval = this.eval;
    k.kingS = this.kingS;
    k.kingG = this.kingG;
    k.HashVal = this.HashVal;
    k.BanHash = this.BanHash;
    k.HandHash = this.HandHash;

    return k;
  }

  /**
   * Set the side to move while keeping the incremental Zobrist hash consistent.
   *
   * Why a helper exists:
   * - `HashVal` now includes side-to-move, so `teban = ...` is no longer a "free" assignment.
   * - The search flips the side very frequently; XOR'ing a single seed is much cheaper than a full re-hash.
   */
  setTeban(teban: number): void {
    if (this.teban === teban) return;
    this.teban = teban;
    this.HashVal ^= KyokumenImproved.TebanHashSeed;
  }

  /**
   * Toggle side-to-move while keeping `HashVal` consistent.
   * Equivalent to `setTeban(this.teban === SENTE ? GOTE : SENTE)` but slightly cheaper.
   */
  toggleTeban(): void {
    this.teban = this.teban === SENTE ? GOTE : SENTE;
    this.HashVal ^= KyokumenImproved.TebanHashSeed;
  }

  // Check if positions are equal
  equals(k: KyokumenImproved): boolean {
    // Check turn
    if (this.teban !== k.teban) {
      return false;
    }

    // Check board
    for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
      for (let dan = 1; dan <= 9; dan++) {
        if (this.ban[suji + dan] !== k.ban[suji + dan]) {
          return false;
        }
      }
    }

    // Check hand
    for (let i = SFU; i <= GHI; i++) {
      if (this.hand[i] !== k.hand[i]) {
        return false;
      }
    }

    return true;
  }

  // Get piece at position
  get(p: number): number {
    if (p < 0 || p > 16 * 11) {
      return WALL;
    }
    return this.ban[p];
  }

  // Put piece at position
  put(p: number, koma: number): void {
    this.ban[p] = koma;
  }

  // Make a move (CRITICAL: matches Java logic exactly)
  move(te: Te): void {
    // NOTE:
    // - `teban` is NOT changed here (search/UI must toggle).
    // - `te.capture` must be accurate for undo logic (back()).
    // Remove piece from destination (for hash)
    this.BanHash ^= KyokumenImproved.HashSeed[this.get(te.to)][te.to];

    // Handle capture
    if (this.get(te.to) !== EMPTY) {
      // Remove captured piece value
      this.eval -= komaValue[this.get(te.to)];

      // Add to hand
      if (isSente(this.get(te.to))) {
        // Captured sente piece goes to gote's hand
        let koma = this.get(te.to);
        // Clear promotion and player flags
        koma = koma & 0x07;
        // Set gote flag
        koma = koma | GOTE;
        // Add to hand
        this.hand[koma]++;
        // Update hash (XOR with new count)
        this.HandHash ^= KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
        this.eval += komaValue[koma];
      } else {
        // Captured gote piece goes to sente's hand
        let koma = this.get(te.to);
        // Clear promotion and player flags
        koma = koma & 0x07;
        // Set sente flag
        koma = koma | SENTE;
        // Add to hand
        this.hand[koma]++;
        // Update hash (XOR with new count)
        this.HandHash ^= KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
        this.eval += komaValue[koma];
      }
    }

    if (te.from === 0) {
      // Drop move
      // Update hand hash before decrementing
      this.HandHash ^= KyokumenImproved.HandHashSeed[te.koma][this.hand[te.koma]];
      this.hand[te.koma]--;
    } else {
      // Regular move - remove piece from source
      this.put(te.from, EMPTY);
      this.BanHash ^= KyokumenImproved.HashSeed[te.koma][te.from];
      this.BanHash ^= KyokumenImproved.HashSeed[EMPTY][te.from];
    }

    // Place piece at destination
    let koma = te.koma;
    if (te.promote) {
      // Remove unpromoted value
      this.eval -= komaValue[koma];
      koma = koma | PROMOTE;
      // Add promoted value
      this.eval += komaValue[koma];
    }
    this.put(te.to, koma);
    this.BanHash ^= KyokumenImproved.HashSeed[koma][te.to];

    // Update king position
    if (te.koma === SOU) {
      this.kingS = te.to;
    } else if (te.koma === GOU) {
      this.kingG = te.to;
    }

    this.HashVal = this.BanHash ^ this.HandHash ^ (this.teban === GOTE ? KyokumenImproved.TebanHashSeed : 0);
  }

  // Undo a move (CRITICAL: matches Java logic exactly)
  back(te: Te): void {
    // Undo must precisely reverse `move()` including:
    // - restoring captured piece to destination
    // - restoring moved piece to `from` (or restoring to hand for drops)
    // - restoring incremental eval and hash values
    // Remove piece from destination (for hash)
    this.BanHash ^= KyokumenImproved.HashSeed[this.get(te.to)][te.to];

    // Restore captured piece
    this.put(te.to, te.capture);
    this.BanHash ^= KyokumenImproved.HashSeed[te.capture][te.to];

    // Restore evaluation
    this.eval += komaValue[te.capture];

    // Handle capture restoration
    if (te.capture !== EMPTY) {
      // Remove from hand
      if (isSente(te.capture)) {
        // Sente piece was in gote's hand
        let koma = te.capture;
        koma = koma & 0x07;
        koma = koma | GOTE;
        // Update hash before decrementing
        this.HandHash ^= KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
        this.hand[koma]--;
        this.eval -= komaValue[koma];
      } else {
        // Gote piece was in sente's hand
        let koma = te.capture;
        koma = koma & 0x07;
        koma = koma | SENTE;
        // Update hash before decrementing
        this.HandHash ^= KyokumenImproved.HandHashSeed[koma][this.hand[koma]];
        this.hand[koma]--;
        this.eval -= komaValue[koma];
      }
    }

    if (te.from === 0) {
      // Was a drop - restore to hand
      this.hand[te.koma]++;
      this.HandHash ^= KyokumenImproved.HandHashSeed[te.koma][this.hand[te.koma]];
    } else {
      // Regular move - restore piece to source
      this.put(te.from, te.koma);
      this.BanHash ^= KyokumenImproved.HashSeed[EMPTY][te.from];
      this.BanHash ^= KyokumenImproved.HashSeed[te.koma][te.from];

      if (te.promote) {
        // Restore evaluation for unpromotion
        let koma = te.koma | PROMOTE;
        this.eval -= komaValue[koma];
        this.eval += komaValue[te.koma];
      }
    }

    // Restore king position
    if (te.koma === SOU) {
      this.kingS = te.from;
    } else if (te.koma === GOU) {
      this.kingG = te.from;
    }

    this.HashVal = this.BanHash ^ this.HandHash ^ (this.teban === GOTE ? KyokumenImproved.TebanHashSeed : 0);
  }

  // Initialize king positions
  initKingPos(): void {
    this.kingS = -34;
    this.kingG = -34;

    for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
      for (let dan = 1; dan <= 9; dan++) {
        if (this.ban[suji + dan] === SOU) {
          this.kingS = suji + dan;
        }
        if (this.ban[suji + dan] === GOU) {
          this.kingG = suji + dan;
        }
      }
    }
  }

  // Search for king position
  searchGyoku(teban: number): number {
    if (teban === SENTE) {
      return this.kingS;
    } else {
      return this.kingG;
    }
  }

  // Initialize evaluation
  initEval(): void {
    this.eval = 0;

    // Board pieces
    for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
      for (let dan = 1; dan <= 9; dan++) {
        this.eval += komaValue[this.ban[suji + dan]];
      }
    }

    // Hand pieces
    for (let i = SFU; i <= SHI; i++) {
      this.eval += komaValue[i] * this.hand[i];
    }
    for (let i = GFU; i <= GHI; i++) {
      this.eval += komaValue[i] * this.hand[i];
    }
  }

  // Calculate hash from scratch
  calcHash(): void {
    this.HandHash = 0;
    this.BanHash = 0;

    // Hand hash (cumulative XOR from 0..count) so counts can be updated incrementally by XORing the old/new count seed.
    for (let i = 0; i <= GHI; i++) {
      for (let j = 0; j <= this.hand[i]; j++) {
        this.HandHash ^= KyokumenImproved.HandHashSeed[i][j];
      }
    }

    // Board hash
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        this.BanHash ^= KyokumenImproved.HashSeed[this.ban[i * 16 + j]][i * 16 + j];
      }
    }

    this.HashVal = this.HandHash ^ this.BanHash ^ (this.teban === GOTE ? KyokumenImproved.TebanHashSeed : 0);
  }

  // Initialize all
  initAll(): void {
    this.initEval();
    this.initKingPos();
    this.calcHash();
  }

  // Evaluate position - comprehensive evaluation beyond just material
  evaluate(): number {
    // `this.eval` is an incremental material score from SENTE's perspective.
    let score = this.eval; // Start with material evaluation

    // Pieces in hand are generally more valuable due to drop flexibility.
    score += this.evaluateHandBonus();

    // Add positional evaluation
    score += this.evaluateFileDefense();
    score += this.evaluatePromotionThreats();
    score += this.evaluateKingSafety();
    score += this.evaluateMajorPieceActivity();

    return score;
  }

  private evaluateHandBonus(): number {
    // Bonus values are intentionally modest; search still drives tactics.
    const handBonusByType: number[] = [
      0,   // EMPTY
      15,  // FU
      60,  // KY
      70,  // KE
      110, // GI
      130, // KI
      220, // KA
      260, // HI
      0,   // OU (not in hand)
      0, 0, 0, 0, 0, 0, 0, 0
    ];

    let score = 0;

    // SENTE hand pieces
    for (let koma = SFU; koma <= SHI; koma++) {
      const count = this.hand[koma];
      if (!count) continue;
      score += handBonusByType[this.getKomashu(koma)] * count;
    }

    // GOTE hand pieces
    for (let koma = GFU; koma <= GHI; koma++) {
      const count = this.hand[koma];
      if (!count) continue;
      score -= handBonusByType[this.getKomashu(koma)] * count;
    }

    return score;
  }

  /**
   * King safety (very simplified).
   *
   * Why this matters for "weird drops":
   * - With mostly material-based eval, many non-losing moves can look similar, so the engine may choose a
   *   "harmless" drop that doesn't actually improve king safety or piece activity.
   * - Adding even a small king-safety term helps the engine prefer moves that keep a defensive shape
   *   (and penalize wasting key defenders as random drops).
   *
   * This is intentionally lightweight:
   * - rewards friendly defenders in the 3x3 around the king
   * - penalizes adjacent empty squares (lack of shelter)
   * - penalizes enemy pieces adjacent to the king (danger)
   * - small "home rank" bonus so the engine doesn't keep the king in the open forever
   */
  private evaluateKingSafety(): number {
    let score = 0;

    if (this.kingS <= 0) {
      // Sente king missing => lost.
      return -50_000;
    }
    if (this.kingG <= 0) {
      // Gote king missing => won.
      return 50_000;
    }

    score += this.evaluateOneKingSafety(SENTE, this.kingS);
    score -= this.evaluateOneKingSafety(GOTE, this.kingG);
    return score;
  }

  private evaluateOneKingSafety(teban: number, kingPos: number): number {
    const suji = kingPos >> 4;
    const dan = kingPos & 0x0f;

    // Defender weights by komashu (1..15); index 0 unused.
    // Promoted minors (TO/NY/NK/NG) act like golds for king shelter.
    const defenderWeight: number[] = [
      0,
      10,  // FU
      18,  // KY
      16,  // KE
      22,  // GI
      28,  // KI
      16,  // KA (doesn't usually "shield" king)
      18,  // HI (doesn't usually "shield" king)
      0,   // OU
      26,  // TO
      24,  // NY
      24,  // NK
      24,  // NG
      0,   // (unused)
      18,  // UM
      18,  // RY
    ];

    const enemyAdjPenalty: number[] = [
      0,
      10,  // FU
      16,  // KY
      16,  // KE
      22,  // GI
      28,  // KI
      22,  // KA
      22,  // HI
      0,   // OU
      20,  // TO
      20,  // NY
      20,  // NK
      20,  // NG
      0,   // (unused)
      22,  // UM
      22,  // RY
    ];

    let safety = 0;

    for (let dSuji = -1; dSuji <= 1; dSuji++) {
      for (let dDan = -1; dDan <= 1; dDan++) {
        if (dSuji === 0 && dDan === 0) continue;
        const p = this.getAt(suji + dSuji, dan + dDan);
        if (p === WALL) continue;
        if (p === EMPTY) {
          // Fewer adjacent pieces => less shelter.
          safety -= 4;
          continue;
        }
        const komashu = this.getKomashu(p);
        if (isSelf(teban, p)) {
          safety += defenderWeight[komashu] ?? 0;
        } else {
          safety -= enemyAdjPenalty[komashu] ?? 0;
        }
      }
    }

    // Small "stay in home camp" encouragement (helps avoid leaving the king in the open early).
    // - SENTE home ranks: 8-9
    // - GOTE home ranks: 1-2
    if (teban === SENTE) {
      if (dan >= 8) safety += 10;
    } else {
      if (dan <= 2) safety += 10;
    }

    // Slight preference to be away from center (helps castling-ish behavior without hardcoding castles).
    const distFromCenter = Math.abs(suji - 5) + Math.abs(dan - 5);
    safety += distFromCenter; // very small

    return safety;
  }

  /**
   * Major piece activity (rook/bishop + promoted variants).
   *
   * This is a fast mobility-style term:
   * - reward rooks/bishops that have open lines
   * - reward having lines pointing at the enemy king (even if not immediate tactics yet)
   */
  private evaluateMajorPieceActivity(): number {
    let score = 0;

    const kingPosGote = this.kingG;
    const kingPosSente = this.kingS;

    const kingSujiG = kingPosGote >> 4;
    const kingDanG = kingPosGote & 0x0f;
    const kingSujiS = kingPosSente >> 4;
    const kingDanS = kingPosSente & 0x0f;

    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const p = this.getAt(suji, dan);
        if (p === EMPTY || p === WALL) continue;

        const komashu = this.getKomashu(p);
        const isS = isSente(p);

        // Rook / Dragon
        if (komashu === HI || komashu === RY) {
          const mobility = this.countSlidingMobility(suji, dan, [
            { ds: 1, dd: 0 }, { ds: -1, dd: 0 }, { ds: 0, dd: 1 }, { ds: 0, dd: -1 },
          ]);
          const lineBonus = isS
            ? this.lineToKingBonusRookLike(suji, dan, kingSujiG, kingDanG)
            : this.lineToKingBonusRookLike(suji, dan, kingSujiS, kingDanS);

          const base = mobility * 6 + lineBonus;
          score += isS ? base : -base;

          // Dragon gets a tiny extra for nearby diagonal influence (king-like diagonals).
          if (komashu === RY) {
            const diagAdj = this.countAdjacentMobility(suji, dan, [
              { ds: 1, dd: 1 }, { ds: 1, dd: -1 }, { ds: -1, dd: 1 }, { ds: -1, dd: -1 },
            ]);
            const extra = diagAdj * 3;
            score += isS ? extra : -extra;
          }
          continue;
        }

        // Bishop / Horse
        if (komashu === KA || komashu === UM) {
          const mobility = this.countSlidingMobility(suji, dan, [
            { ds: 1, dd: 1 }, { ds: 1, dd: -1 }, { ds: -1, dd: 1 }, { ds: -1, dd: -1 },
          ]);
          const lineBonus = isS
            ? this.lineToKingBonusBishopLike(suji, dan, kingSujiG, kingDanG)
            : this.lineToKingBonusBishopLike(suji, dan, kingSujiS, kingDanS);

          const base = mobility * 5 + lineBonus;
          score += isS ? base : -base;

          // Horse gets a tiny extra for adjacent orthogonal influence (king-like orthogonals).
          if (komashu === UM) {
            const orthoAdj = this.countAdjacentMobility(suji, dan, [
              { ds: 1, dd: 0 }, { ds: -1, dd: 0 }, { ds: 0, dd: 1 }, { ds: 0, dd: -1 },
            ]);
            const extra = orthoAdj * 3;
            score += isS ? extra : -extra;
          }
        }
      }
    }

    return score;
  }

  private countAdjacentMobility(
    suji: number,
    dan: number,
    dirs: ReadonlyArray<{ ds: number; dd: number }>
  ): number {
    let count = 0;
    for (const { ds, dd } of dirs) {
      const p = this.getAt(suji + ds, dan + dd);
      if (p === WALL) continue;
      if (p === EMPTY) count++;
    }
    return count;
  }

  private countSlidingMobility(
    suji: number,
    dan: number,
    dirs: ReadonlyArray<{ ds: number; dd: number }>
  ): number {
    let count = 0;
    for (const { ds, dd } of dirs) {
      for (let step = 1; step <= 8; step++) {
        const p = this.getAt(suji + ds * step, dan + dd * step);
        if (p === WALL) break;
        if (p !== EMPTY) {
          // Can "see" the first occupied square (capture influence), then stop.
          count++;
          break;
        }
        count++;
      }
    }
    return count;
  }

  private lineToKingBonusRookLike(
    suji: number,
    dan: number,
    kingSuji: number,
    kingDan: number
  ): number {
    // Same file
    if (suji === kingSuji) {
      const step = dan < kingDan ? 1 : -1;
      let blockers = 0;
      for (let d = dan + step; d !== kingDan; d += step) {
        const p = this.getAt(suji, d);
        if (p !== EMPTY) blockers++;
        if (blockers > 1) break;
      }
      if (blockers === 0) return 35;
      if (blockers === 1) return 15;
    }

    // Same rank
    if (dan === kingDan) {
      const step = suji < kingSuji ? 1 : -1;
      let blockers = 0;
      for (let s = suji + step; s !== kingSuji; s += step) {
        const p = this.getAt(s, dan);
        if (p !== EMPTY) blockers++;
        if (blockers > 1) break;
      }
      if (blockers === 0) return 25;
      if (blockers === 1) return 12;
    }

    return 0;
  }

  private lineToKingBonusBishopLike(
    suji: number,
    dan: number,
    kingSuji: number,
    kingDan: number
  ): number {
    const dS = kingSuji - suji;
    const dD = kingDan - dan;
    if (Math.abs(dS) !== Math.abs(dD) || dS === 0) return 0;

    const stepS = dS > 0 ? 1 : -1;
    const stepD = dD > 0 ? 1 : -1;
    let blockers = 0;
    for (let i = 1; i < Math.abs(dS); i++) {
      const p = this.getAt(suji + stepS * i, dan + stepD * i);
      if (p !== EMPTY) blockers++;
      if (blockers > 1) break;
    }
    if (blockers === 0) return 28;
    if (blockers === 1) return 12;
    return 0;
  }

  // Helper: Get piece at position using suji/dan coordinates
  private getAt(suji: number, dan: number): number {
    if (suji < 1 || suji > 9 || dan < 1 || dan > 9) return WALL;
    return this.ban[(suji << 4) + dan];
  }

  // Helper: Get komashu (piece type without player flag)
  private getKomashu(koma: number): number {
    return koma & 0x0F;
  }

  // Evaluate file defense - CRITICAL for opening
  // Prevents disasters like letting pawn promote on 2-file
  private evaluateFileDefense(): number {
    let score = 0;

    // === GOTE's 2-file defense (against SENTE's attack) ===
    // Check SENTE's pawn position on 2-file
    const sentePawnOn26 = isSente(this.getAt(2, 6)) && this.getKomashu(this.getAt(2, 6)) === FU;
    const sentePawnOn25 = isSente(this.getAt(2, 5)) && this.getKomashu(this.getAt(2, 5)) === FU;
    const sentePawnOn24 = isSente(this.getAt(2, 4)) && this.getKomashu(this.getAt(2, 4)) === FU;

    // Check GOTE's defenses
    const goteBishopOn33 = isGote(this.getAt(3, 3)) && this.getKomashu(this.getAt(3, 3)) === KA;
    const goteGoldOn32 = isGote(this.getAt(3, 2)) && this.getKomashu(this.getAt(3, 2)) === KI;
    const gotePawnOn23 = isGote(this.getAt(2, 3)) && this.getKomashu(this.getAt(2, 3)) === FU;
    const goteBishopOn22 = isGote(this.getAt(2, 2)) && this.getKomashu(this.getAt(2, 2)) === KA;

    // Check if bishop moved to a useless square (not 33, not 22)
    const goteBishopMissing = !goteBishopOn33 && !goteBishopOn22;

    const senteAttacking = sentePawnOn26 || sentePawnOn25 || sentePawnOn24;

    if (senteAttacking) {
      if (goteBishopOn33) {
        score -= 600; // Good defense for GOTE (negative because GOTE is negative in eval)
      } else if (goteGoldOn32 && gotePawnOn23) {
        score -= 400;
      } else {
        // NO PROPER DEFENSE - penalize GOTE (add to score since GOTE values are negative)
        if (sentePawnOn24) {
          if (!gotePawnOn23) {
            score += 1500; // Disaster for GOTE
          } else {
            score += 800;
          }
        } else if (sentePawnOn25) {
          score += 1000;
        } else if (sentePawnOn26) {
          score += 600;
        }

        // Extra penalty if bishop moved to wrong square
        if (goteBishopMissing && !goteBishopOn22) {
          score += 400;
        }
      }

      // Bishop trapped on 22
      if (goteBishopOn22 && (sentePawnOn25 || sentePawnOn24)) {
        score += 500;
      }
    }

    // === SENTE's 8-file defense (against GOTE's attack) ===
    const gotePawnOn84 = isGote(this.getAt(8, 4)) && this.getKomashu(this.getAt(8, 4)) === FU;
    const gotePawnOn85 = isGote(this.getAt(8, 5)) && this.getKomashu(this.getAt(8, 5)) === FU;
    const gotePawnOn86 = isGote(this.getAt(8, 6)) && this.getKomashu(this.getAt(8, 6)) === FU;

    const senteBishopOn77 = isSente(this.getAt(7, 7)) && this.getKomashu(this.getAt(7, 7)) === KA;
    const senteGoldOn78 = isSente(this.getAt(7, 8)) && this.getKomashu(this.getAt(7, 8)) === KI;
    const sentePawnOn87 = isSente(this.getAt(8, 7)) && this.getKomashu(this.getAt(8, 7)) === FU;
    const senteBishopOn88 = isSente(this.getAt(8, 8)) && this.getKomashu(this.getAt(8, 8)) === KA;

    const goteAttacking = gotePawnOn84 || gotePawnOn85 || gotePawnOn86;

    if (goteAttacking) {
      if (senteBishopOn77) {
        score += 600; // Good defense for SENTE
      } else if (senteGoldOn78 && sentePawnOn87) {
        score += 400;
      } else {
        // NO PROPER DEFENSE - penalize SENTE
        if (gotePawnOn86) {
          if (!sentePawnOn87) {
            score -= 1500;
          } else {
            score -= 800;
          }
        } else if (gotePawnOn85) {
          score -= 1000;
        } else if (gotePawnOn84) {
          score -= 600;
        }
      }

      if (senteBishopOn88 && (gotePawnOn85 || gotePawnOn86)) {
        score -= 500;
      }
    }

    return score;
  }

  // Evaluate promotion threats - penalize allowing enemy pieces to promote
  private evaluatePromotionThreats(): number {
    let score = 0;

    // Check for SENTE pieces about to promote in GOTE territory (dan 1-3)
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 4; dan <= 6; dan++) {
        const piece = this.getAt(suji, dan);
        if (piece === EMPTY || piece === WALL) continue;

        if (isSente(piece)) {
          const komashu = this.getKomashu(piece);
          // Rook or Bishop about to enter promotion zone
          if (komashu === HI || komashu === KA) {
            // Check if path to promotion zone is clear
            let pathClear = true;
            for (let checkDan = dan - 1; checkDan >= 1; checkDan--) {
              const blocking = this.getAt(suji, checkDan);
              if (blocking !== EMPTY) {
                if (isSente(blocking)) pathClear = false;
                break;
              }
            }
            if (pathClear) {
              score += 500; // Bonus for SENTE (threat to GOTE)
            }
          }
        }
      }

      // SENTE major piece already in promotion zone (dan 1-3)
      for (let dan = 1; dan <= 3; dan++) {
        const piece = this.getAt(suji, dan);
        if (piece !== EMPTY && isSente(piece)) {
          const komashu = this.getKomashu(piece);
          if (komashu === HI || komashu === KA) {
            score += 800; // Strong position for SENTE
          }
        }
      }
    }

    // Check for GOTE pieces about to promote in SENTE territory (dan 7-9)
    for (let suji = 1; suji <= 9; suji++) {
      for (let dan = 4; dan <= 6; dan++) {
        const piece = this.getAt(suji, dan);
        if (piece === EMPTY || piece === WALL) continue;

        if (isGote(piece)) {
          const komashu = this.getKomashu(piece);
          if (komashu === HI || komashu === KA) {
            let pathClear = true;
            for (let checkDan = dan + 1; checkDan <= 9; checkDan++) {
              const blocking = this.getAt(suji, checkDan);
              if (blocking !== EMPTY) {
                if (isGote(blocking)) pathClear = false;
                break;
              }
            }
            if (pathClear) {
              score -= 500; // Bonus for GOTE (threat to SENTE)
            }
          }
        }
      }

      // GOTE major piece already in promotion zone (dan 7-9)
      for (let dan = 7; dan <= 9; dan++) {
        const piece = this.getAt(suji, dan);
        if (piece !== EMPTY && isGote(piece)) {
          const komashu = this.getKomashu(piece);
          if (komashu === HI || komashu === KA) {
            score -= 800;
          }
        }
      }
    }

    return score;
  }

  // Initial position setup
  static ShokiBanmen: number[][] = [
    [GKY, GKE, GGI, GKI, GOU, GKI, GGI, GKE, GKY],
    [EMPTY, GHI, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, GKA, EMPTY],
    [GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU, GFU],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
    [SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU, SFU],
    [EMPTY, SKA, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, SHI, EMPTY],
    [SKY, SKE, SGI, SKI, SOU, SKI, SGI, SKE, SKY],
  ];

  // Initialize standard starting position
  initHirate(): void {
    this.teban = SENTE;

    for (let dan = 1; dan <= 9; dan++) {
      for (let suji = 9; suji >= 1; suji--) {
        this.ban[(suji << 4) + dan] = KyokumenImproved.ShokiBanmen[dan - 1][9 - suji];
      }
    }

    // Clear all hands
    for (let koma = SFU; koma <= GHI; koma++) {
      this.hand[koma] = 0;
    }

    this.initAll();
  }

  // Convert to string for display
  toString(): string {
    const sujiStr = ["", "１", "２", "３", "４", "５", "６", "７", "８", "９"];
    const danStr = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    let s = "";

    // Gote hand
    s += "後手持駒：";
    for (let i = GFU; i <= GHI; i++) {
      if (this.hand[i] === 1) {
        s += this.getKomaString(i);
      } else if (this.hand[i] > 1) {
        s += this.getKomaString(i) + this.hand[i];
      }
    }
    s += "\n";

    // Board
    s += " ９ ８ ７ ６ ５ ４ ３ ２ １\n";
    s += "+---+---+---+---+---+---+---+---+---+\n";
    for (let dan = 1; dan <= 9; dan++) {
      for (let suji = 9; suji >= 1; suji--) {
        s += "|";
        s += this.toBanStringForKoma(this.ban[(suji << 4) + dan]);
      }
      s += "|";
      s += danStr[dan];
      s += "\n";
      s += "+---+---+---+---+---+---+---+---+---+\n";
    }

    // Sente hand
    s += "先手持駒：";
    for (let i = SFU; i <= SHI; i++) {
      if (this.hand[i] === 1) {
        s += this.getKomaString(i);
      } else if (this.hand[i] > 1) {
        s += this.getKomaString(i) + this.hand[i];
      }
    }
    s += "\n";

    return s;
  }

  private getKomaString(koma: number): string {
    const komaString = [
      "  ",
      "歩", "香", "桂", "銀", "金", "角", "飛",
      "玉", "と", "杏", "圭", "全", "", "馬", "竜"
    ];
    return komaString[this.getKomashu(koma)];
  }

  private toBanStringForKoma(koma: number): string {
    const komaString = [
      "  ",
      "歩", "香", "桂", "銀", "金", "角", "飛",
      "玉", "と", "杏", "圭", "全", "", "馬", "竜"
    ];

    if (koma === EMPTY) {
      return "   ";
    } else if ((koma & SENTE) !== 0) {
      return " " + komaString[this.getKomashu(koma)];
    } else {
      return "v" + komaString[this.getKomashu(koma)];
    }
  }

  /**
   * Convert captured pieces to array format (for UI compatibility)
   * Converts from count-based hand[] to array of pieces
   */
  toHandArrays(): number[][] {
    const hands: number[][] = [[], []];

    // Sente's hand (pieces 1-7)
    for (let pieceType = FU; pieceType <= HI; pieceType++) {
      const senteHandKey = SENTE + pieceType;
      for (let j = 0; j < this.hand[senteHandKey]; j++) {
        hands[0].push(senteHandKey);
      }
    }

    // Gote's hand (pieces 1-7)
    for (let pieceType = FU; pieceType <= HI; pieceType++) {
      const goteHandKey = GOTE + pieceType;
      for (let j = 0; j < this.hand[goteHandKey]; j++) {
        hands[1].push(goteHandKey);
      }
    }

    return hands;
  }

  /**
   * Get piece at position (using Position class for UI compatibility)
   */
  getByPosition(pos: { suji: number; dan: number }): number {
    return this.ban[(pos.suji << 4) + pos.dan];
  }
}
