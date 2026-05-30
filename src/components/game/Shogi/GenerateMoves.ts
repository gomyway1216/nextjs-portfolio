/**
 * Move Generation - Direct conversion from Java
 */

import { Kyokumen } from './Kyokumen';
import {
EMPTY,
FU,
GOTE,
KE,
KY,
Position,
SENTE,
Te,
WALL,
canJump,
canMove,
canPromote as canPromotePiece,
diffDan,
diffSuji,
getKomashu,
isEnemy,
isSelf
} from './types';

// Remove moves that leave own king in check
export function removeSelfMate(k: Kyokumen, v: Te[]): Te[] {
  const removed: Te[] = [];

  for (let i = 0; i < v.length; i++) {
    const te = v[i];

    // Try making the move
    const test = k.clone();
    test.move(te);

    // Find king position
    const gyokuPosition = test.searchGyoku(k.teban);

    // Flag for whether king is in check
    let isOuteHouchi = false;

    // Check all 12 directions from king
    for (let direct = 0; direct < 12 && !isOuteHouchi; direct++) {
      const pos = gyokuPosition.clone();
      pos.sub(direct);
      const koma = test.get(pos);

      // If enemy piece can move in this direction
      if (isEnemy(test.teban, koma) && canMove[direct][koma]) {
        isOuteHouchi = true;
        break;
      }
    }

    // Check sliding pieces (8 directions)
    for (let direct = 0; direct < 8 && !isOuteHouchi; direct++) {
      const pos = gyokuPosition.clone();
      let koma: number;

      // Slide until hitting something
      pos.sub(direct);
      koma = test.get(pos);
      while (koma !== WALL) {
        // If hit own piece, no check from this direction
        if (isSelf(test.teban, koma)) break;

        // If enemy sliding piece, check
        if (isEnemy(test.teban, koma) && canJump[direct][koma]) {
          isOuteHouchi = true;
          break;
        }

        // If hit enemy piece (non-sliding), stop
        if (isEnemy(test.teban, koma)) {
          break;
        }

        pos.sub(direct);
        koma = test.get(pos);
      }
    }

    if (!isOuteHouchi) {
      removed.push(te);
    }
  }

  return removed;
}

// Add move considering forced promotion
function addTe(v: Te[], teban: number, koma: number, from: Position, to: Position): void {
  if (teban === SENTE) {
    // Sente (first player)
    if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && to.dan === 1) {
      // Lance or pawn moving to first rank must promote
      const te = new Te(koma, from, to, true);
      v.push(te);
    } else if (getKomashu(koma) === KE && to.dan <= 2) {
      // Knight moving to first or second rank must promote
      const te = new Te(koma, from, to, true);
      v.push(te);
    } else if ((to.dan <= 3 || from.dan <= 3) && canPromotePiece(koma)) {
      // In or entering promotion zone - both options
      v.push(new Te(koma, from, to, true));
      v.push(new Te(koma, from, to, false));
    } else {
      // Normal move
      v.push(new Te(koma, from, to, false));
    }
  } else {
    // Gote (second player)
    if ((getKomashu(koma) === KY || getKomashu(koma) === FU) && to.dan === 9) {
      // Lance or pawn moving to ninth rank must promote
      const te = new Te(koma, from, to, true);
      v.push(te);
    } else if (getKomashu(koma) === KE && to.dan >= 8) {
      // Knight moving to eighth or ninth rank must promote
      const te = new Te(koma, from, to, true);
      v.push(te);
    } else if ((to.dan >= 7 || from.dan >= 7) && canPromotePiece(koma)) {
      // In or entering promotion zone - both options
      v.push(new Te(koma, from, to, true));
      v.push(new Te(koma, from, to, false));
    } else {
      // Normal move
      v.push(new Te(koma, from, to, false));
    }
  }
}

// Check if this is pawn drop checkmate (illegal)
function isUtiFuDume(k: Kyokumen, te: Te): boolean {
  if (te.from.suji !== 0 || te.from.dan !== 0) {
    // Not a drop
    return false;
  }
  if (getKomashu(te.koma) !== FU) {
    // Not a pawn drop
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

  // Check if pawn is dropped directly in front of opponent's king
  if (teban === SENTE) {
    if (gyokuPositionAite.suji !== te.to.suji || gyokuPositionAite.dan !== te.to.dan - 1) {
      return false;
    }
  } else {
    if (gyokuPositionAite.suji !== te.to.suji || gyokuPositionAite.dan !== te.to.dan + 1) {
      return false;
    }
  }

  // Try making the move
  const test = k.clone();
  test.move(te);
  test.teban = tebanAite;

  // If opponent has no legal moves, this is pawn drop checkmate
  const v = generateLegalMoves(test);
  if (v.length === 0) {
    return true;
  }

  return false;
}

// Generate all legal moves for current position
export function generateLegalMoves(k: Kyokumen): Te[] {
  const v: Te[] = [];

  // Generate moves for pieces on board
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const from = new Position(suji, dan);
      const koma = k.get(from);

      // Check if it's current player's piece
      if (isSelf(k.teban, koma)) {
        // Try each direction
        for (let direct = 0; direct < 12; direct++) {
          if (canMove[direct][koma]) {
            // Generate move
            const to = new Position(
              suji + diffSuji[direct],
              dan + diffDan[direct]
            );

            // Check if destination is on board
            if (1 <= to.suji && to.suji <= 9 && 1 <= to.dan && to.dan <= 9) {
              // Can't capture own piece
              if (isSelf(k.teban, k.get(to))) {
                continue;
              }
              // Add considering promotion
              addTe(v, k.teban, koma, from, to);
            }
          }
        }

        // Generate sliding moves
        for (let direct = 0; direct < 8; direct++) {
          if (canJump[direct][koma]) {
            // Slide as far as possible
            for (let i = 1; i < 9; i++) {
              const to = new Position(
                suji + diffSuji[direct] * i,
                dan + diffDan[direct] * i
              );

              // Stop if hit wall
              if (k.get(to) === WALL) break;

              // Stop if hit own piece
              if (isSelf(k.teban, k.get(to))) break;

              // Add move
              addTe(v, k.teban, koma, from, to);

              // Stop if captured enemy piece
              if (k.get(to) !== EMPTY) break;
            }
          }
        }
      }
    }
  }

  // Generate drop moves
  const isPutted: boolean[] = Array(8).fill(false);

  // Get captured pieces for current player
  const motigoma = k.teban === SENTE ? k.hand[0] : k.hand[1];

  // For each captured piece type
  for (let i = 0; i < motigoma.length; i++) {
    const koma = motigoma[i];
    const komashu = getKomashu(koma);

    if (isPutted[komashu]) {
      // Already generated drops for this piece type
      continue;
    }
    isPutted[komashu] = true;

    // Try dropping on each square
    for (let suji = 1; suji <= 9; suji++) {
      // Check for nifu (double pawn) rule
      if (komashu === FU) {
        let isNifu = false;
        for (let dan = 1; dan <= 9; dan++) {
          const p = new Position(suji, dan);
          if (k.get(p) === (k.teban | FU)) {
            isNifu = true;
            break;
          }
        }
        if (isNifu) {
          continue; // Skip this column
        }
      }

      for (let dan = 1; dan <= 9; dan++) {
        // Knight restrictions
        if (komashu === KE) {
          if (k.teban === SENTE && dan <= 2) continue;
          if (k.teban === GOTE && dan >= 8) continue;
        }

        // Pawn and lance restrictions
        if (komashu === FU || komashu === KY) {
          if (k.teban === SENTE && dan === 1) continue;
          if (k.teban === GOTE && dan === 9) continue;
        }

        const from = new Position(0, 0);
        const to = new Position(suji, dan);

        // Must be empty
        if (k.get(to) !== EMPTY) {
          continue;
        }

        // Check for pawn drop checkmate
        const te = new Te(koma, from, to, false);
        if (isUtiFuDume(k, te)) {
          continue;
        }

        // Add drop move
        v.push(te);
      }
    }
  }

  // Remove moves that leave king in check
  return removeSelfMate(k, v);
}
