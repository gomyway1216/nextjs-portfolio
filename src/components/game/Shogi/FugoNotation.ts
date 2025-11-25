/**
 * Fugo Notation - Convert moves to Japanese Shogi notation
 */

import { Te, Position, getKomashu, toString, isSente } from './types';

// Japanese numbers for columns (suji)
const SUJI_KANJI = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];

// Japanese numbers for rows (dan)
const DAN_KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * Convert a move to fugo notation
 * Example: "☗７六歩" (Sente pawn to 7-6)
 * Example: "☖３三角成" (Gote bishop to 3-3 with promotion)
 * Example: "☗５五歩打" (Sente drops pawn at 5-5)
 */
export function toFugo(te: Te): string {
  let notation = '';

  // Player marker
  notation += isSente(te.koma) ? '☗' : '☖';

  // Destination
  notation += SUJI_KANJI[te.to.suji];
  notation += DAN_KANJI[te.to.dan];

  // Piece name
  notation += toString(te.koma);

  // Drop move indicator
  if (te.from.suji === 0 && te.from.dan === 0) {
    notation += '打';
  }

  // Promotion indicator
  if (te.promote) {
    notation += '成';
  }

  return notation;
}

/**
 * Convert move to simple algebraic notation (for history display)
 * Example: "7六歩" or "5五歩打" or "3三角成"
 */
export function toSimpleFugo(te: Te): string {
  let notation = '';

  // Destination
  notation += SUJI_KANJI[te.to.suji];
  notation += DAN_KANJI[te.to.dan];

  // Piece name
  notation += toString(te.koma);

  // Drop move indicator
  if (te.from.suji === 0 && te.from.dan === 0) {
    notation += '打';
  }

  // Promotion indicator
  if (te.promote) {
    notation += '成';
  }

  return notation;
}

/**
 * Get piece name in Kanji
 */
export function getPieceName(koma: number): string {
  return toString(koma);
}
