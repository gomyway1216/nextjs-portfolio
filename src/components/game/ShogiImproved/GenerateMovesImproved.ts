import { KyokumenImproved } from './KyokumenImproved';
import { MoveListImproved } from './MoveListImproved';
import { TTEntryImproved } from './TTEntryImproved';
import {
EMPTY,
FU,
GI,
GOTE,
HI,
KA,
KE,
KI,
KY,
SENTE,
Te,
WALL,
canPromote,
getKomashu,
isSelf,
komaValue
} from './types';

// Move directions (matching KomaMoves.java)
const diffDan = [1, 1, 1, 0, 0, -1, -1, -1, -2, -2, 2, 2];
const diffSuji = [-1, 0, 1, 1, -1, 1, 0, -1, 1, -1, -1, 1];
const diff = diffSuji.map((s, i) => s * 16 + diffDan[i]);

// Can move tables (12 directions for each piece type)
const canMove: boolean[][] = [
  // Direction 0 - diagonal down-left
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false, true,false,false,false,// Sente pieces
     true,false,false,false,false,false,false, true,// Sente promoted
    false,false,false,false, true, true,false,false,// Gote pieces
     true, true, true, true, true, true,false, true // Gote promoted
  ],
  // Direction 1 - straight down
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false, true,false,false,// Sente pieces
     true, true, true, true, true,false, true,false,// Sente promoted
    false, true,false,false, true, true,false,false,// Gote pieces
     true, true, true, true, true,false, true,false // Gote promoted
  ],
  // Direction 2 - diagonal down-right
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false, true,false,false,false,// Sente pieces
     true,false,false,false,false,false,false, true,// Sente promoted
    false,false,false,false, true, true,false,false,// Gote pieces
     true, true, true, true, true, true,false, true // Gote promoted
  ],
  // Direction 3 - right
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false, true,false,false,// Sente pieces
     true, true, true, true, true,false, true,false,// Sente promoted
    false,false,false,false,false, true,false,false,// Gote pieces
     true, true, true, true, true,false, true,false // Gote promoted
  ],
  // Direction 4 - left
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false, true,false,false,// Sente pieces
     true, true, true, true, true,false, true,false,// Sente promoted
    false,false,false,false,false, true,false,false,// Gote pieces
     true, true, true, true, true,false, true,false // Gote promoted
  ],
  // Direction 5 - diagonal up-right
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false, true, true,false,false,// Sente pieces
     true, true, true, true, true,false,false, true,// Sente promoted
    false,false,false,false, true,false,false,false,// Gote pieces
     true,false,false,false,false,false,false, true // Gote promoted
  ],
  // Direction 6 - straight up
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false, true,false,false, true, true,false,false,// Sente pieces
     true, true, true, true, true,false, true,false,// Sente promoted
    false,false,false,false,false, true,false,false,// Gote pieces
     true, true, true, true, true,false, true,false // Gote promoted
  ],
  // Direction 7 - diagonal up-left
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false, true, true,false,false,// Sente pieces
     true, true, true, true, true,false,false, true,// Sente promoted
    false,false,false,false, true,false,false,false,// Gote pieces
     true,false,false,false,false,false,false, true // Gote promoted
  ],
  // Direction 8 - knight left-up (sente)
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false, true,false,false,false,false,// Sente knight
    false,false,false,false,false,false,false,false,// Sente promoted
    false,false,false,false,false,false,false,false,// Gote pieces
    false,false,false,false,false,false,false,false // Gote promoted
  ],
  // Direction 9 - knight right-up (sente)
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false, true,false,false,false,false,// Sente knight
    false,false,false,false,false,false,false,false,// Sente promoted
    false,false,false,false,false,false,false,false,// Gote pieces
    false,false,false,false,false,false,false,false // Gote promoted
  ],
  // Direction 10 - knight left-down (gote)
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Sente pieces
    false,false,false,false,false,false,false,false,// Sente promoted
    false,false,false, true,false,false,false,false,// Gote knight
    false,false,false,false,false,false,false,false // Gote promoted
  ],
  // Direction 11 - knight right-down (gote)
  [
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Cannot move
    false,false,false,false,false,false,false,false,// Sente pieces
    false,false,false,false,false,false,false,false,// Sente promoted
    false,false,false, true,false,false,false,false,// Gote knight
    false,false,false,false,false,false,false,false // Gote promoted
  ]
];

// Can jump tables (8 directions for sliding pieces)
const canJump: boolean[][] = [
  // Direction 0 - diagonal down-left
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false,// Promoted
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false // Promoted
  ],
  // Direction 1 - straight down
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false, true,// Rook
    false,false,false,false,false,false,false, true,// Promoted
    false,false, true,false,false,false,false, true,// Lance/Rook
    false,false,false,false,false,false,false, true // Promoted
  ],
  // Direction 2 - diagonal down-right
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false,// Promoted
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false // Promoted
  ],
  // Direction 3 - right
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false, true,// Rook
    false,false,false,false,false,false,false, true,// Promoted
    false,false,false,false,false,false,false, true,// Rook
    false,false,false,false,false,false,false, true // Promoted
  ],
  // Direction 4 - left
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false, true,// Rook
    false,false,false,false,false,false,false, true,// Promoted
    false,false,false,false,false,false,false, true,// Rook
    false,false,false,false,false,false,false, true // Promoted
  ],
  // Direction 5 - diagonal up-right
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false,// Promoted
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false // Promoted
  ],
  // Direction 6 - straight up
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false, true,false,false,false,false, true,// Lance/Rook
    false,false,false,false,false,false,false, true,// Promoted
    false,false,false,false,false,false,false, true,// Rook
    false,false,false,false,false,false,false, true // Promoted
  ],
  // Direction 7 - diagonal up-left
  [
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false,false,false,// Cannot jump
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false,// Promoted
    false,false,false,false,false,false, true,false,// Bishop
    false,false,false,false,false,false, true,false // Promoted
  ]
];

export class GenerateMovesImproved {
  /**
   * Returns true if `teban`'s king is attacked by any enemy piece in the current position.
   *
   * This is a core primitive used in:
   * - legality filtering (`removeSelfMate`)
   * - move validation (`isLegalMove`)
   * - search extensions / quiescence (checking positions are tactically sharp)
   *
   * Notes:
   * - This function does NOT modify the position.
   * - It assumes `KyokumenImproved.searchGyoku(teban)` returns the current king square for that side.
   */
  static isKingInCheck(k: KyokumenImproved, teban: number): boolean {
    const gyokuPosition = k.searchGyoku(teban);
    if (gyokuPosition < 0) return true;

    return this.isSquareAttacked(k, gyokuPosition, teban);
  }

  /**
   * Returns true if `target` is attacked by the enemy of `teban`.
   *
   * This is a generalization of `isKingInCheck()`:
   * - `isKingInCheck(k, teban)` is equivalent to `isSquareAttacked(k, kingSquare, teban)`
   *
   * Why this exists:
   * - Move ordering heuristics sometimes need to know if a dropped/moved piece is immediately capturable.
   * - Doing a full `generateLegalMoves()` for the opponent is much more expensive than this direct attack test.
   *
   * Notes:
   * - This function does NOT modify the position.
   * - `teban` is the *defender* (the side that owns the piece sitting on `target`).
   */
  static isSquareAttacked(k: KyokumenImproved, target: number, teban: number): boolean {
    // Inlined board access (bit-exact fast path): read `k.ban` directly instead of
    // `k.get()` and replace `isEnemy`/`isSelf` helpers with precomputed bit masks.
    // Algorithm and `canMove`/`canJump` tables are unchanged, so results are
    // bit-identical to the old ray-walk (verified by perft / parity / search-driver).
    const ban = k.ban;
    if (target <= 0 || ban[target] === WALL) return false;

    const enemyFlag = teban === SENTE ? GOTE : SENTE;
    const selfFlag = teban === SENTE ? SENTE : GOTE;

    // Check all 12 directions for direct (non-sliding) attacks.
    // The move tables are encoded so that "subtract diff" walks from king outwards, matching the old Java logic.
    // NOTE: `target - diff[direct]` can be -1 for a corner king with a knight
    // direction (target=17, diff=18). `ban[-1]` would be `undefined`; guard with
    // `pos >= 0 ? ... : WALL` so the read is a real WALL sentinel — this matches the
    // old `k.get()` (which returned WALL for p<0) exactly and never relies on
    // `undefined` coercion. The other slots (index 0 and up) are always WALL padding
    // or real squares.
    for (let direct = 0; direct < 12; direct++) {
      const pos = target - diff[direct];
      const koma = pos >= 0 ? ban[pos] : WALL;
      if ((koma & enemyFlag) !== 0 && canMove[direct][koma]) {
        return true;
      }
    }

    // Check 8 directions for sliding attacks (rook/bishop/lance and promoted variants).
    // The walk terminates on WALL padding before leaving the playable area, so an
    // out-of-range read should not happen — but read through `?? WALL` anyway so a
    // stray index degrades to the WALL sentinel (matching the old `k.get()`) instead
    // of `undefined`, which would break under `noUncheckedIndexedAccess` and rely on
    // coercion. No behavioral change: parity/search-driver stay bit-exact.
    for (let direct = 0; direct < 8; direct++) {
      const step = diff[direct];
      const cj = canJump[direct];
      let pos = target - step;
      let koma = ban[pos] ?? WALL;
      while (koma !== WALL) {
        if (koma !== EMPTY) {
          if ((koma & selfFlag) !== 0) break;
          if (cj[koma]) return true;
          break;
        }
        pos -= step;
        koma = ban[pos] ?? WALL;
      }
    }

    return false;
  }

  /**
   * Returns the absolute value (material) of the least valuable *enemy* attacker of `target`,
   * or `Infinity` if `target` is not attacked.
   *
   * Conventions:
   * - `teban` is the *defender* (the side that owns the piece sitting on `target`).
   * - Attackers are the enemy of `teban`.
   */
  static getLeastAttackerValue(k: KyokumenImproved, target: number, teban: number): number {
    // Same inlined board-access fast path as isSquareAttacked() — bit-exact with
    // the old ray-walk (same tables, same first-blocker semantics).
    const ban = k.ban;
    if (target <= 0 || ban[target] === WALL) return Infinity;

    const enemyFlag = teban === SENTE ? GOTE : SENTE;
    const selfFlag = teban === SENTE ? SENTE : GOTE;

    let best = Infinity;

    // Direct attacks (non-sliding). Guard the single reachable negative index
    // (`target - diff` = -1 for a corner king + knight direction) with a WALL
    // sentinel, mirroring the old `k.get()` and isSquareAttacked() above.
    for (let direct = 0; direct < 12; direct++) {
      const pos = target - diff[direct];
      const koma = pos >= 0 ? ban[pos] : WALL;
      if ((koma & enemyFlag) !== 0 && canMove[direct][koma]) {
        const value = Math.abs(komaValue[koma]) | 0;
        if (value < best) best = value;
      }
    }

    // Sliding attacks (rook/bishop/lance and promoted variants). Read through
    // `?? WALL` so a stray out-of-range index degrades to the WALL sentinel
    // (matching the old `k.get()`) rather than `undefined`. No behavioral change.
    for (let direct = 0; direct < 8; direct++) {
      const step = diff[direct];
      const cj = canJump[direct];
      let pos = target - step;
      let koma = ban[pos] ?? WALL;
      while (koma !== WALL) {
        if (koma !== EMPTY) {
          if ((koma & selfFlag) !== 0) break;
          if (cj[koma]) {
            const value = Math.abs(komaValue[koma]) | 0;
            if (value < best) best = value;
          }
          break;
        }
        pos -= step;
        koma = ban[pos] ?? WALL;
      }
    }

    return best;
  }

  // Remove self-mate moves
  static removeSelfMate(k: KyokumenImproved, v: Te[]): Te[] {
    const removed: Te[] = [];

    for (const te of v) {
      // IMPORTANT:
      // `KyokumenImproved.back(te)` needs `te.capture` to restore the destination square.
      // Generated moves usually already contain `capture`, but we enforce it here because this filter
      // may run on externally created `Te` objects (e.g. TT moves / PV moves).
      te.capture = k.get(te.to);

      // Try the move (move/back is drastically faster than cloning per move).
      // `move()` does not flip `teban`, so `k.teban` still refers to the mover after the move.
      k.move(te);
      const isOuteHouchi = this.isKingInCheck(k, k.teban);
      k.back(te);

      if (!isOuteHouchi) removed.push(te);
    }

    return removed;
  }

  // Add a move with promotion consideration
  static addTe(k: KyokumenImproved, v: Te[], teban: number, koma: number, from: number, to: number): void {
    if (teban === SENTE) {
      // Sente moves
      if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 0x0f) === 1) {
        // Lance or pawn to rank 1 - must promote
        const te = new Te(koma, from, to, true, k.get(to));
        v.push(te);
      } else if (getKomashu(koma) === KE && (to & 0x0f) <= 2) {
        // Knight to rank 1-2 - must promote
        const te = new Te(koma, from, to, true, k.get(to));
        v.push(te);
      } else if (((to & 0x0f) <= 3 || (from & 0x0f) <= 3) && canPromote[koma]) {
        // Can promote in enemy camp
        //
        // NOTE on bishop/rook:
        // For KA/HI, promotion to UM/RY is *strictly better* because the promoted piece keeps all original moves
        // and gains extra king-like steps (UM: orthogonal 1-step, RY: diagonal 1-step).
        // There is no practical reason to keep them unpromoted when promotion is available, and pruning the
        // non-promote option reduces branching factor (stronger + faster search).
        const komashu = getKomashu(koma);
        const forcePromoteMajor = komashu === KA || komashu === HI;

        const te1 = new Te(koma, from, to, true, k.get(to));
        v.push(te1);
        if (!forcePromoteMajor) {
          const te2 = new Te(koma, from, to, false, k.get(to));
          v.push(te2);
        }
      } else {
        // Normal move
        const te = new Te(koma, from, to, false, k.get(to));
        v.push(te);
      }
    } else {
      // Gote moves
      if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 0x0f) === 9) {
        // Lance or pawn to rank 9 - must promote
        const te = new Te(koma, from, to, true, k.get(to));
        v.push(te);
      } else if (getKomashu(koma) === KE && (to & 0x0f) >= 8) {
        // Knight to rank 8-9 - must promote
        const te = new Te(koma, from, to, true, k.get(to));
        v.push(te);
      } else if (((to & 0x0f) >= 7 || (from & 0x0f) >= 7) && canPromote[koma]) {
        // Can promote in enemy camp (see bishop/rook note above).
        const komashu = getKomashu(koma);
        const forcePromoteMajor = komashu === KA || komashu === HI;

        const te1 = new Te(koma, from, to, true, k.get(to));
        v.push(te1);
        if (!forcePromoteMajor) {
          const te2 = new Te(koma, from, to, false, k.get(to));
          v.push(te2);
        }
      } else {
        // Normal move
        const te = new Te(koma, from, to, false, k.get(to));
        v.push(te);
      }
    }
  }

  // Check for pawn drop checkmate (uchifuzume)
  static isUtiFuDume(k: KyokumenImproved, te: Te): boolean {
    if (te.from !== 0) {
      // Not a drop
      return false;
    }
    if (getKomashu(te.koma) !== FU) {
      // Not a pawn
      return false;
    }

    let teban: number;
    let tebanAite: number;

    if ((te.koma & SENTE) !== 0) {
      teban = SENTE;
      tebanAite = GOTE;
    } else {
      teban = GOTE;
      tebanAite = SENTE;
    }

    const gyokuPositionAite = k.searchGyoku(tebanAite);

    if (teban === SENTE) {
      if (gyokuPositionAite !== te.to - 1) {
        // Not in front of enemy king
        return false;
      }
    } else {
      if (gyokuPositionAite !== te.to + 1) {
        // Not in front of enemy king
        return false;
      }
    }

	    // Try the move (make/unmake) instead of cloning.
	    //
	    // This is significantly faster than:
	    // - cloning the entire position
	    // - recalculating eval/hash/king positions on the clone
	    //
	    // Correctness notes:
	    // - `move()` / `back()` do not flip turns, so we explicitly `setTeban()` to the opponent
	    //   while generating legal replies.
	    // - We must restore `te.capture` if the caller passes a reused `Te` object.
	    const captureOrig = te.capture;
	    te.capture = k.get(te.to);
	
	    const tebanOrig = k.teban;
	    k.move(te);
	    k.setTeban(tebanAite);
	    try {
	      // If the opponent has no legal replies, the pawn drop is an illegal "uchifuzume" (打ち歩詰め).
	      return this.generateLegalMoves(k).length === 0;
	    } finally {
	      k.setTeban(tebanOrig);
	      k.back(te);
	      te.capture = captureOrig;
	    }
	  }

  // Generate all legal moves for the position
  static generateLegalMoves(k: KyokumenImproved): Te[] {
    const v: Te[] = [];

    // Generate piece moves
    for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
      for (let dan = 1; dan <= 9; dan++) {
        const from = dan + suji;
        const koma = k.get(from);

        // Is it our piece?
        if (isSelf(k.teban, koma)) {
          // Generate moves in all directions
          for (let direct = 0; direct < 12; direct++) {
            if (canMove[direct][koma]) {
              const to = from + diff[direct];

              // Is destination valid?
              if (1 <= (to >> 4) && (to >> 4) <= 9 && 1 <= (to & 0x0f) && (to & 0x0f) <= 9) {
                // Can't capture own piece
                if (isSelf(k.teban, k.get(to))) {
                  continue;
                }

                // Add the move
                this.addTe(k, v, k.teban, koma, from, to);
              }
            }
          }

          // Generate sliding moves
          for (let direct = 0; direct < 8; direct++) {
            if (canJump[direct][koma]) {
              // Slide in this direction
              for (let i = 1; i < 9; i++) {
                const to = from + diff[direct] * i;

                // Hit wall?
                if (k.get(to) === WALL) break;

                // Own piece blocks?
                if (isSelf(k.teban, k.get(to))) break;

                // Add the move
                this.addTe(k, v, k.teban, koma, from, to);

                // Captured enemy piece - stop
                if (k.get(to) !== EMPTY) break;
              }
            }
          }
        }
      }
    }

    // Generate drop moves
    for (let i = FU; i <= HI; i++) {
      // Drop piece with current teban
      const koma = i | k.teban;

      // Do we have this piece in hand?
      if (k.hand[koma] > 0) {
        const komashu = getKomashu(koma);

        // Check all squares
        for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
          // Check for nifu (double pawn)
          if (komashu === FU) {
            let isNifu = false;

            // Check this file for existing pawn
            for (let dan = 1; dan <= 9; dan++) {
              const p = suji + dan;
              if (k.get(p) === (k.teban | FU)) {
                isNifu = true;
                break;
              }
            }

            if (isNifu) {
              // Skip this file
              continue;
            }
          }

          for (let dan = 1; dan <= 9; dan++) {
            // Knight restrictions
            if (komashu === KE) {
              if (k.teban === SENTE && dan <= 2) {
                // Can't drop knight on ranks 1-2
                continue;
              } else if (k.teban === GOTE && dan >= 8) {
                // Can't drop knight on ranks 8-9
                continue;
              }
            }

            // Pawn and lance restrictions
            if (komashu === FU || komashu === KY) {
              if (k.teban === SENTE && dan === 1) {
                // Can't drop pawn or lance on rank 1
                continue;
              } else if (k.teban === GOTE && dan === 9) {
                // Can't drop pawn or lance on rank 9
                continue;
              }
            }

            const from = 0;  // Drop
            const to = suji + dan;

            // Must be empty square
            if (k.get(to) !== EMPTY) {
              continue;
            }

            // Create drop move
            const te = new Te(koma, from, to, false, EMPTY);

            // Check for pawn drop checkmate
            if (this.isUtiFuDume(k, te)) {
              // Illegal pawn drop checkmate
              continue;
            }

            // Legal drop
            v.push(te);
          }
        }
      }
    }

    // Remove self-mate moves
    return this.removeSelfMate(k, v);
  }

  /**
   * Generate all legal moves, but reuse `Te` objects inside `out` to avoid per-node allocations.
   *
   * Intended usage:
   * - engines that search deeply (V11+) should call this instead of `generateLegalMoves()`
   *   to reduce GC pressure and search deeper within the same time budget.
   *
   * Notes:
   * - The returned array is `out.moves` and is only valid until the next call that mutates `out`.
   * - This function mutates `out.size` and trims `out.moves.length` to `out.size`.
   */
  static generateLegalMovesPooled(k: KyokumenImproved, out: MoveListImproved): Te[] {
    this.generatePseudoLegalMovesPooled(k, out);
    this.removeSelfMateInPlace(k, out);
    return out.trim();
  }

  /**
   * Pseudo-legal pooled generation (V20 speed path).
   *
   * Same as `generateLegalMovesPooled` except moves that leave the mover's own king in check are
   * NOT filtered out. Rationale: with alpha-beta most nodes cut off after searching 1-3 moves, so
   * paying make/unmake + a king-attack scan for *every* generated move up front (60-120 per node)
   * wastes the bulk of the search budget. Callers must do the legality test lazily:
   *
   *   k.move(te);
   *   if (GenerateMovesImproved.isKingInCheck(k, k.teban)) { k.back(te); continue; }
   *
   * Nifu, drop restrictions and uchifuzume are still enforced here (they are cheap or rare).
   */
  static generatePseudoLegalMovesPooled(k: KyokumenImproved, out: MoveListImproved): Te[] {
    out.reset();

    // Generate piece moves.
    for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
      for (let dan = 1; dan <= 9; dan++) {
        const from = dan + suji;
        const koma = k.get(from);

        if (!isSelf(k.teban, koma)) continue;

        // Direct moves.
        for (let direct = 0; direct < 12; direct++) {
          if (!canMove[direct][koma]) continue;
          const to = from + diff[direct];
          if (1 <= (to >> 4) && (to >> 4) <= 9 && 1 <= (to & 0x0f) && (to & 0x0f) <= 9) {
            if (isSelf(k.teban, k.get(to))) continue;
            this.addTePooled(k, out, k.teban, koma, from, to);
          }
        }

        // Sliding moves.
        for (let direct = 0; direct < 8; direct++) {
          if (!canJump[direct][koma]) continue;
          for (let i = 1; i < 9; i++) {
            const to = from + diff[direct] * i;
            if (k.get(to) === WALL) break;
            if (isSelf(k.teban, k.get(to))) break;
            this.addTePooled(k, out, k.teban, koma, from, to);
            if (k.get(to) !== EMPTY) break; // captured: stop sliding
          }
        }
      }
    }

    // Generate drop moves.
    //
    // Bit-exact fast path: before iterating drop piece types, scan the board a
    // single time to build, per file (suji), a 9-bit mask of EMPTY squares and a
    // flag for whether the side to move already has a pawn on that file (nifu).
    // The old code re-read the board once per (type, suji, dan) via k.get() (a
    // bounds-checked accessor) and re-scanned each file for nifu once per drop
    // type. Precomputing collapses all of that into one 81-cell pass, and the
    // inner loop becomes a cheap bit test. Generated move set and ORDER are
    // unchanged (same type→suji→dan iteration, same push order).
    let hasDrop = false;
    for (let i = FU; i <= HI; i++) {
      if (k.hand[(i | k.teban)] > 0) {
        hasDrop = true;
        break;
      }
    }

    if (hasDrop) {
      const ban = k.ban;
      const ownPawn = k.teban | FU;
      // emptyBits[s] and sujiHasOwnPawn[s] are indexed by the file index 1..9
      // (suji >> 4). Index 0 is unused. These are allocated per call (not shared
      // statics): the uchifuzume probe below (isUtiFuDume) re-enters move
      // generation, so sharing one scratch buffer across calls would let the
      // recursion clobber the outer loop's precomputed masks. Two 10-element
      // arrays per drop-bearing node are far cheaper than the per-piece-type
      // board rescans they replace.
      const emptyBits = new Array<number>(10).fill(0);
      const sujiHasOwnPawn = new Array<boolean>(10).fill(false);
      for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
        let bits = 0;
        let nifu = false;
        for (let dan = 1; dan <= 9; dan++) {
          const c = ban[suji + dan];
          if (c === EMPTY) bits |= 1 << dan;
          else if (c === ownPawn) nifu = true;
        }
        const s = suji >> 4;
        emptyBits[s] = bits;
        sujiHasOwnPawn[s] = nifu;
      }

      const sente = k.teban === SENTE;
      for (let i = FU; i <= HI; i++) {
        const koma = i | k.teban;
        if (k.hand[koma] <= 0) continue;

        const komashu = getKomashu(koma);

        for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
          const s = suji >> 4;
          // Nifu (double pawn) restriction — precomputed.
          if (komashu === FU && sujiHasOwnPawn[s]) continue;

          const bits = emptyBits[s];
          if (bits === 0) continue;

          for (let dan = 1; dan <= 9; dan++) {
            // Only empty squares are drop targets.
            if ((bits & (1 << dan)) === 0) continue;

            // Knight restrictions.
            if (komashu === KE) {
              if (sente && dan <= 2) continue;
              if (!sente && dan >= 8) continue;
            }

            // Pawn and lance restrictions.
            if (komashu === FU || komashu === KY) {
              if (sente && dan === 1) continue;
              if (!sente && dan === 9) continue;
            }

            const to = suji + dan;

            const before = out.size;
            out.push(koma, 0, to, false, EMPTY);
            const te = out.moves[before]!;

            // Pawn drop checkmate (uchifuzume) is illegal.
            if (komashu === FU && this.isUtiFuDume(k, te)) {
              out.size = before;
              continue;
            }
          }
        }
      }
    }

    return out.trim();
  }

  private static addTePooled(k: KyokumenImproved, out: MoveListImproved, teban: number, koma: number, from: number, to: number): void {
    const capture = k.get(to);
    if (teban === SENTE) {
      if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 0x0f) === 1) {
        out.push(koma, from, to, true, capture);
      } else if (getKomashu(koma) === KE && (to & 0x0f) <= 2) {
        out.push(koma, from, to, true, capture);
      } else if (((to & 0x0f) <= 3 || (from & 0x0f) <= 3) && canPromote[koma]) {
        const komashu = getKomashu(koma);
        const forcePromoteMajor = komashu === KA || komashu === HI;
        out.push(koma, from, to, true, capture);
        if (!forcePromoteMajor) out.push(koma, from, to, false, capture);
      } else {
        out.push(koma, from, to, false, capture);
      }
      return;
    }

    // GOTE
    if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && (to & 0x0f) === 9) {
      out.push(koma, from, to, true, capture);
    } else if (getKomashu(koma) === KE && (to & 0x0f) >= 8) {
      out.push(koma, from, to, true, capture);
    } else if (((to & 0x0f) >= 7 || (from & 0x0f) >= 7) && canPromote[koma]) {
      const komashu = getKomashu(koma);
      const forcePromoteMajor = komashu === KA || komashu === HI;
      out.push(koma, from, to, true, capture);
      if (!forcePromoteMajor) out.push(koma, from, to, false, capture);
    } else {
      out.push(koma, from, to, false, capture);
    }
  }

  /**
   * Filter out moves that leave the mover's king in check (王手放置).
   *
   * This is the pooled equivalent of `removeSelfMate()`:
   * - It does not allocate a new array.
   * - It compacts the list in-place by swapping `Te` object references.
   */
  private static removeSelfMateInPlace(k: KyokumenImproved, out: MoveListImproved): void {
    const moves = out.moves;
    let write = 0;

    for (let read = 0; read < out.size; read++) {
      const te = moves[read]!;

      // Ensure `capture` is correct for undo.
      te.capture = k.get(te.to);

      k.move(te);
      const isOuteHouchi = this.isKingInCheck(k, k.teban);
      k.back(te);

      if (isOuteHouchi) continue;

      if (write !== read) {
        const tmp = moves[write]!;
        moves[write] = te;
        moves[read] = tmp;
      }
      write++;
    }

    out.size = write;
  }

  // Evaluate moves for ordering
  static evaluateTe(k: KyokumenImproved, v: Te[]): void {
    const nowEval = k.evaluate(); // Use full evaluation, not just material

    for (const te of v) {
      // Try the move
      k.move(te);

      // Move value is change in full evaluation
      te.value = k.evaluate() - nowEval;

      // Undo the move
      k.back(te);

      // Adjust for turn
      if (k.teban === GOTE) {
        te.value = -te.value;
      }

      // ALWAYS prefer promotion - this is almost never wrong
      if (te.promote) {
        te.value += 2000; // Large bonus for promoting
      }

      // Bonus for captures (higher for major pieces)
      if (te.capture !== EMPTY) {
        const captureKomashu = getKomashu(te.capture);
        if (captureKomashu === HI || captureKomashu === KA) {
          te.value += 3000; // Major piece capture
        } else if (captureKomashu === KI || captureKomashu === GI) {
          te.value += 2000; // Gold/Silver capture
        } else if (captureKomashu !== FU) {
          te.value += 1500; // Other non-pawn captures
        } else {
          te.value += 500; // Pawn capture
        }
      }
    }

    // Sort moves by value (descending)
    v.sort((a, b) => b.value - a.value);
  }

  // Check if a move is legal
  static isLegalMove(k: KyokumenImproved, t: Te): boolean {
    // Basic structural validation (piece exists, drop rules, etc.)
    if (t.from > 0 && k.ban[t.from] !== t.koma) {
      // Wrong piece at source
      return false;
    }
    if (t.from === 0 && k.hand[t.koma] === 0) {
      // Don't have piece in hand
      return false;
    }
    if (t.from === 0 && k.ban[t.to] !== EMPTY) {
      // Can't drop on occupied square
      return false;
    }
    if (isSelf((t.koma & (SENTE | GOTE)), k.ban[t.to])) {
      // Can't capture own piece
      return false;
    }
    if (this.isUtiFuDume(k, t)) {
      // Pawn drop checkmate
      return false;
    }

    // King safety validation (self-check):
    // - Apply move
    // - Ensure our own king is not in check
    // - Undo move
    t.capture = k.get(t.to);
    k.move(t);
    const isOuteHouchi = this.isKingInCheck(k, k.teban);
    k.back(t);
    if (isOuteHouchi) return false;

    return true;
  }

  // Make priority moves first (for move ordering)
  static makeMoveFirst(k: KyokumenImproved, depth: number, best: (Te | null)[][], e: TTEntryImproved | null): Te[] {
    const v: Te[] = [];

    if (e && e.best && this.isLegalMove(k, e.best)) {
      v.push(e.best);
    }

    if (depth > 0 && best[depth - 1][depth] && this.isLegalMove(k, best[depth - 1][depth]!)) {
      v.push(best[depth - 1][depth]!);
    }

    if (e && e.second && this.isLegalMove(k, e.second)) {
      v.push(e.second);
    }

    return v;
  }
}
