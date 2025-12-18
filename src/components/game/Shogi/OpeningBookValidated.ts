import { Difficulty } from '../common/types';
import { GenerateMovesImproved } from '../ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../ShogiImproved/KyokumenImproved';
import { Te as TeImproved } from '../ShogiImproved/types';
import { SENTE } from './types';
import type { Kyokumen } from './Kyokumen';
import type { Te } from './types';
import { getOpeningMoveCandidatesComprehensive } from './OpeningBookComprehensive';

function toImprovedTeKey(te: TeImproved): string {
  return `${te.koma}:${te.from}->${te.to}:${te.promote ? 1 : 0}`;
}

function toImprovedTeFromMainTe(te: Te): TeImproved {
  const from = te.from.suji === 0 ? 0 : (te.from.suji << 4) + te.from.dan;
  const to = (te.to.suji << 4) + te.to.dan;
  return new TeImproved(te.koma, from, to, te.promote, 0);
}

function evalForSide(teban: number, k: KyokumenImproved): number {
  const evalSente = k.evaluate();
  return teban === SENTE ? evalSente : -evalSente;
}

function staticScoreAfterMove(root: KyokumenImproved, teban: number, move: TeImproved): number {
  // Ensure capture is set so `back()` restores the correct piece.
  const capture = move.capture || root.ban[move.to];
  const te = new TeImproved(move.koma, move.from, move.to, move.promote, capture);
  root.move(te);
  root.toggleTeban();
  const score = evalForSide(teban, root);
  root.toggleTeban();
  root.back(te);
  return score;
}

function openingThresholdByDifficulty(difficulty: Difficulty): number {
  // Max acceptable drop vs the best 1-ply static-eval move (from the same position).
  // Lower levels allow more "book variety", higher levels are stricter.
  switch (difficulty) {
    case 'easy':
      return 260;
    case 'medium':
      return 180;
    case 'hard':
      return 140;
    case 'expert':
      return 110;
    case 'master':
      return 90;
  }
}

function convertToImprovedKyokumen(k: Kyokumen): KyokumenImproved {
  const ki = new KyokumenImproved();

  // Board (same encoding between engines)
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      ki.ban[(suji << 4) + dan] = k.ban[suji][dan];
    }
  }

  // Hands (main engine stores arrays; improved engine stores counts)
  for (let i = 0; i < ki.hand.length; i++) {
    ki.hand[i] = 0;
  }
  for (const koma of k.hand[0]) {
    ki.hand[koma]++;
  }
  for (const koma of k.hand[1]) {
    ki.hand[koma]++;
  }

  ki.teban = k.teban;
  ki.initAll();
  return ki;
}

/**
 * Opening-book move selector with safety validation.
 *
 * Goals:
 * - Keep the opening book’s human-like structure (戦法) and variety.
 * - Avoid "book blunders" when the position is already tactical or the king is in check.
 * - Prevent the AI from continuing book/castling lines while it must defend immediately.
 *
 * Implementation:
 * - Get all viable book candidates for the current move number.
 * - If the side to move is in check, skip the book.
 * - Compute a fast 1-ply static-eval score for all legal moves (improved eval).
 * - Accept the first book move that is within a threshold of the best move.
 */
export function getOpeningMoveValidated(
  kyokumen: Kyokumen,
  moveNumber: number,
  teban: number,
  moveHistory: Te[] = [],
  options: { difficulty?: Difficulty } = {}
): Te | null {
  const difficulty = options.difficulty ?? 'medium';
  const candidates = getOpeningMoveCandidatesComprehensive(kyokumen, moveNumber, teban, moveHistory);
  if (candidates.length === 0) return null;

  // Convert once for validation work.
  const kImproved = convertToImprovedKyokumen(kyokumen);
  kImproved.setTeban(teban);

  // If we're in check, book moves are often too slow — defend first.
  if (GenerateMovesImproved.isKingInCheck(kImproved, teban)) return null;

  const legalImproved = GenerateMovesImproved.generateLegalMoves(kImproved);
  if (legalImproved.length === 0) return null;

  let bestScore = -Infinity;
  const scoreByMoveKey = new Map<string, number>();
  for (const move of legalImproved) {
    const score = staticScoreAfterMove(kImproved, teban, move);
    scoreByMoveKey.set(toImprovedTeKey(move), score);
    if (score > bestScore) bestScore = score;
  }

  const threshold = openingThresholdByDifficulty(difficulty);
  for (const candidate of candidates) {
    const improvedMove = toImprovedTeFromMainTe(candidate.move);
    const score =
      scoreByMoveKey.get(toImprovedTeKey(improvedMove)) ??
      staticScoreAfterMove(kImproved, teban, improvedMove);

    if (score >= bestScore - threshold) {
      return candidate.move;
    }
  }

  return null;
}
