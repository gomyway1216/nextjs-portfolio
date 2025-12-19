import {
  SENTE, GOTE, EMPTY, WALL, PROMOTE,
  FU, KY, KE, GI, KI, KA, HI, OU,
  SFU, SKY, SKE, SGI, SKI, SKA, SHI, SOU,
  GFU, GKY, GKE, GGI, GKI, GKA, GHI, GOU,
  Te, isSente, isGote, isSelf, isEnemy, getKomashu, canPromote
} from './types';
import { KyokumenImproved } from './KyokumenImproved';
import { TTEntryImproved } from './TTEntryImproved';

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
    if (target <= 0 || k.get(target) === WALL) return false;

    // Check all 12 directions for direct (non-sliding) attacks.
    // The move tables are encoded so that "subtract diff" walks from king outwards, matching the old Java logic.
    for (let direct = 0; direct < 12; direct++) {
      const pos = target - diff[direct];
      const koma = k.get(pos);
      if (isEnemy(teban, koma) && canMove[direct][koma]) {
        return true;
      }
    }

    // Check 8 directions for sliding attacks (rook/bishop/lance and promoted variants).
    for (let direct = 0; direct < 8; direct++) {
      for (
        let pos = target - diff[direct], koma = k.get(pos);
        koma !== WALL;
        pos -= diff[direct], koma = k.get(pos)
      ) {
        if (isSelf(teban, koma)) break;
        if (isEnemy(teban, koma)) {
          if (canJump[direct][koma]) return true;
          break;
        }
      }
    }

    return false;
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

    // Try the move
    const test = k.clone();
    test.move(te);
    test.setTeban(tebanAite);

    // Check if opponent has any legal moves
    const v = this.generateLegalMoves(test);
    if (v.length === 0) {
      // No legal moves - pawn drop checkmate
      return true;
    }

    return false;
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
