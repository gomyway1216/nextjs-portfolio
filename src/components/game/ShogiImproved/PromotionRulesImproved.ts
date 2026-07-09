/**
 * PromotionRulesImproved
 *
 * Standard shogi promotion-choice rules, independent of the search engine's own
 * move-generation pruning.
 *
 * Why this exists:
 * `GenerateMovesImproved.addTe()` intentionally does NOT generate a non-promoting
 * `Te` for bishop/rook (角/飛) moves into, within, or out of the promotion zone —
 * promoting is always at least as good for the engine, so omitting the
 * non-promote branch shrinks the search tree for free. That optimization is
 * correct for the *engine*, but it is NOT a rule of shogi: a human player is
 * always allowed to decline promotion for 歩/香/桂/銀/角/飛, except in the
 * specific "the piece would have zero legal moves left unpromoted" cases:
 *   - 歩 (pawn) or 香 (lance) moving to the last rank (1段目 for Sente, 9段目 for Gote)
 *   - 桂 (knight) moving to the last two ranks (1-2段目 for Sente, 8-9段目 for Gote)
 * 銀 (silver), 角 (bishop) and 飛 (rook) can always legally decline promotion,
 * anywhere in the promotion zone — they never end up unable to move.
 *
 * The human-move UI (`ShogiImproved.tsx`'s `handleCellClick`) uses this module
 * to decide whether to show the promote/decline dialog, reconstructing the
 * non-promote `Te` itself when the engine's `validMoves` list omitted it (i.e.
 * for 角/飛). The AI's own move selection is untouched — it keeps using
 * `generateLegalMoves()` as-is, which is correct/desired for search strength.
 */

import { KE, KY, FU, SENTE, Te, getDan, getKomashu } from './types';

/**
 * True when a promoting move of this piece type into `toDan` is mandatory
 * (declining would leave the piece with no legal moves at all).
 */
export function isForcedPromotion(koma: number, teban: number, toDan: number): boolean {
  const komashu = getKomashu(koma);
  if (komashu === FU || komashu === KY) {
    return teban === SENTE ? toDan === 1 : toDan === 9;
  }
  if (komashu === KE) {
    return teban === SENTE ? toDan <= 2 : toDan >= 8;
  }
  return false;
}

/**
 * Given a promoting move the engine returned (the only variant it generates for
 * 角/飛 per the note above), return the equivalent non-promoting `Te` the human
 * player is still legally allowed to choose — or `null` when promotion here is
 * mandatory (歩/香 to the last rank, 桂 to the last two ranks) or the piece can't
 * promote at all.
 */
export function buildDeclinablePromotion(promoteMove: Te, teban: number): Te | null {
  if (!promoteMove.promote) return null;
  const toDan = getDan(promoteMove.to);
  if (isForcedPromotion(promoteMove.koma, teban, toDan)) return null;

  const nonPromote = promoteMove.clone();
  nonPromote.promote = false;
  return nonPromote;
}
