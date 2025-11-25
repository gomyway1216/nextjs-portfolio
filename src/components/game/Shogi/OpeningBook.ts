/**
 * Opening Book for Shogi - Common Joseki Patterns
 * Contains opening moves for the first 10 moves
 */

import { Te, Position } from './types';
import { Kyokumen } from './Kyokumen';

interface OpeningMove {
  from: { suji: number; dan: number };
  to: { suji: number; dan: number };
  promote: boolean;
}

// Common opening sequences
const OPENING_SEQUENCES: OpeningMove[][] = [
  // Static Rook (Ibisha) opening
  [
    { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
    { from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 3 }, promote: false }, // Bx7g+
    { from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 8 }, promote: false }, // R-2h
    { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false }, // S-7h
    { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false }, // K-6h
  ],

  // Ranging Rook (Furibisha) opening
  [
    { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
    { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 8 }, promote: false }, // R-7h
    { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false }, // S-5h
    { from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false }, // K-4h
    { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false }, // S-7h
  ],

  // Center Pawn opening
  [
    { from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 }, promote: false }, // P-5f
    { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
    { from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 3 }, promote: false }, // Bx7g+
    { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false }, // S-7h
    { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false }, // K-6h
  ],
];

/**
 * Get opening book move if available
 * Returns null if no book move found
 */
export function getOpeningMove(
  kyokumen: Kyokumen,
  moveNumber: number,
  teban: number
): Te | null {
  // Only use opening book for first 10 moves
  if (moveNumber > 10) {
    return null;
  }

  // For now, randomly select an opening sequence (in real implementation, could be based on opponent moves)
  const sequenceIndex = Math.floor(Math.random() * OPENING_SEQUENCES.length);
  const sequence = OPENING_SEQUENCES[sequenceIndex];

  // Get the move for this move number (0-indexed)
  const moveIndex = Math.floor((moveNumber - 1) / 2);

  if (moveIndex >= sequence.length) {
    return null;
  }

  const bookMove = sequence[moveIndex];

  // Convert to Te format
  const from = new Position(bookMove.from.suji, bookMove.from.dan);
  const to = new Position(bookMove.to.suji, bookMove.to.dan);
  const koma = kyokumen.get(from);

  if (koma === 0) {
    return null; // Piece not there
  }

  return new Te(koma, from, to, bookMove.promote);
}

/**
 * Check if position matches any known opening pattern
 */
export function isInOpeningBook(moveNumber: number): boolean {
  return moveNumber <= 10;
}
