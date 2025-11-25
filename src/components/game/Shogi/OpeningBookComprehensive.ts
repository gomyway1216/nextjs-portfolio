/**
 * Comprehensive Opening Book for Shogi
 * Includes major opening patterns (戦法)
 */

import { Te, Position, SENTE, GOTE } from './types';
import { Kyokumen } from './Kyokumen';
import { generateLegalMoves } from './GenerateMoves';

interface OpeningMove {
  from: { suji: number; dan: number };
  to: { suji: number; dan: number };
  promote: boolean;
  teban: number; // SENTE or GOTE
}

interface OpeningSequence {
  name: string;
  category: string;
  moves: OpeningMove[];
  priority: number; // Higher priority openings are preferred
}

// 居飛車 (Static Rook) Openings
const IBISHA_OPENINGS: OpeningSequence[] = [
  // 矢倉 (Yagura) - Classic defensive opening
  {
    name: '矢倉',
    category: '相居飛車',
    priority: 90,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗６八銀
      { from: { suji: 4, dan: 3 }, to: { suji: 4, dan: 4 }, promote: false, teban: GOTE },  // ☖４四歩
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false, teban: SENTE }, // ☗６六歩
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二銀
      { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false, teban: SENTE }, // ☗５八金右
      { from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 }, promote: false, teban: GOTE },  // ☖６二銀
    ],
  },
  // 棒銀 (Climbing Silver) - Aggressive opening
  {
    name: '棒銀',
    category: '居飛車',
    priority: 85,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗６八銀
      { from: { suji: 8, dan: 2 }, to: { suji: 3, dan: 7 }, promote: false, teban: GOTE },  // ☖８五歩
    ],
  },
  // 角換わり (Bishop Exchange)
  {
    name: '角換わり',
    category: '相居飛車',
    priority: 80,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
    ],
  },
  // 相掛かり (Double Wing Attack)
  {
    name: '相掛かり',
    category: '相居飛車',
    priority: 75,
    moves: [
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false }, // P-2f
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false }, // P-2e
      { from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 3 }, promote: false }, // Bx7g+
      { from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 8 }, promote: false }, // R-2h
    ],
  },
  // 横歩取り (Side Pawn Capture)
  {
    name: '横歩取り',
    category: '相居飛車',
    priority: 70,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false }, // P-2f
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false }, // P-2e
      { from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 8 }, promote: false }, // R-2h
    ],
  },
  // 右四間飛車 (Right Fourth File Rook)
  {
    name: '右四間飛車',
    category: '対振り飛車',
    priority: 75,
    moves: [
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false }, // P-6f
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false }, // S-7h
      { from: { suji: 8, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false }, // R-6h
      { from: { suji: 7, dan: 8 }, to: { suji: 6, dan: 7 }, promote: false }, // S-6g
    ],
  },
  // 居飛車穴熊 (Ibisha Anaguma)
  {
    name: '居飛車穴熊',
    category: '対振り飛車',
    priority: 85,
    moves: [
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false }, // P-6f
      { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false }, // K-6h
      { from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 9 }, promote: false }, // K-7i
      { from: { suji: 7, dan: 9 }, to: { suji: 8, dan: 9 }, promote: false }, // K-8i
      { from: { suji: 8, dan: 9 }, to: { suji: 9, dan: 9 }, promote: false }, // K-9i
    ],
  },
  // 腰掛け銀 (Leaning Silver)
  {
    name: '腰掛け銀',
    category: '相居飛車',
    priority: 70,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false }, // S-7h
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false }, // P-6f
      { from: { suji: 7, dan: 8 }, to: { suji: 6, dan: 7 }, promote: false }, // S-6g
    ],
  },
];

// 振り飛車 (Ranging Rook) Openings
const FURIBISHA_OPENINGS: OpeningSequence[] = [
  // 四間飛車 (Fourth File Rook) - Most popular ranging rook
  {
    name: '四間飛車',
    category: '振り飛車',
    priority: 90,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false, teban: SENTE }, // ☗６六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 8, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false, teban: SENTE }, // ☗６八飛
      { from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 }, promote: false, teban: GOTE },  // ☖６二銀
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false, teban: SENTE }, // ☗４八玉
      { from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 }, promote: false, teban: GOTE },  // ☖４二玉
    ],
  },
  // 三間飛車 (Third File Rook)
  {
    name: '三間飛車',
    category: '振り飛車',
    priority: 80,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 8 }, promote: false }, // R-7h
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false }, // S-5h
      { from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false }, // K-4h
    ],
  },
  // 石田流 (Ishida Style) - Aggressive third file rook
  {
    name: '石田流',
    category: '振り飛車',
    priority: 85,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 7, dan: 6 }, to: { suji: 7, dan: 5 }, promote: false }, // P-7e
      { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 8 }, promote: false }, // R-7h
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false }, // S-7h
    ],
  },
  // 中飛車 (Central Rook)
  {
    name: '中飛車',
    category: '振り飛車',
    priority: 85,
    moves: [
      { from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 }, promote: false }, // P-5f
      { from: { suji: 8, dan: 8 }, to: { suji: 5, dan: 8 }, promote: false }, // R-5h
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false }, // S-5h
      { from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false }, // K-4h
    ],
  },
  // ゴキゲン中飛車 (Gokigen Central Rook)
  {
    name: 'ゴキゲン中飛車',
    category: '振り飛車',
    priority: 88,
    moves: [
      { from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 }, promote: false }, // P-5f
      { from: { suji: 5, dan: 6 }, to: { suji: 5, dan: 5 }, promote: false }, // P-5e
      { from: { suji: 8, dan: 8 }, to: { suji: 5, dan: 8 }, promote: false }, // R-5h
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false }, // S-7h
    ],
  },
  // 向かい飛車 (Opposite Side Rook)
  {
    name: '向かい飛車',
    category: '振り飛車',
    priority: 75,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 8 }, promote: false }, // R-2h
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false }, // S-5h
      { from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false }, // K-4h
    ],
  },
  // 振り飛車穴熊 (Ranging Rook Anaguma)
  {
    name: '振り飛車穴熊',
    category: '振り飛車',
    priority: 85,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 8, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false }, // R-6h
      { from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false }, // K-4h
      { from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 9 }, promote: false }, // K-3i
      { from: { suji: 3, dan: 9 }, to: { suji: 2, dan: 9 }, promote: false }, // K-2i
      { from: { suji: 2, dan: 9 }, to: { suji: 1, dan: 9 }, promote: false }, // K-1i
    ],
  },
  // 角交換振り飛車 (Bishop Exchange Ranging Rook)
  {
    name: '角交換振り飛車',
    category: '振り飛車',
    priority: 80,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 2, dan: 8 }, to: { suji: 3, dan: 7 }, promote: false }, // B-3g
      { from: { suji: 3, dan: 7 }, to: { suji: 8, dan: 2 }, promote: false }, // Bx8b+
      { from: { suji: 8, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false }, // R-6h
    ],
  },
];

// Special/Modern Openings
const SPECIAL_OPENINGS: OpeningSequence[] = [
  // ひねり飛車 (Twisting Rook)
  {
    name: 'ひねり飛車',
    category: '相居飛車',
    priority: 65,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 8 }, promote: false }, // R-7h
      { from: { suji: 7, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false }, // R-6h
      { from: { suji: 6, dan: 8 }, to: { suji: 6, dan: 6 }, promote: false }, // R-6f
    ],
  },
  // 地下鉄飛車 (Underground Rook)
  {
    name: '地下鉄飛車',
    category: '対振り飛車',
    priority: 60,
    moves: [
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false }, // P-6f
      { from: { suji: 8, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false }, // R-6h
      { from: { suji: 6, dan: 8 }, to: { suji: 1, dan: 8 }, promote: false }, // R-1h
    ],
  },
  // 風車 (Windmill)
  {
    name: '風車',
    category: '振り飛車',
    priority: 60,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // P-7f
      { from: { suji: 2, dan: 8 }, to: { suji: 3, dan: 7 }, promote: false }, // B-3g
      { from: { suji: 8, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false }, // R-6h
      { from: { suji: 3, dan: 7 }, to: { suji: 6, dan: 4 }, promote: false }, // B-6d
    ],
  },
];

// Combine all openings
const ALL_OPENINGS = [...IBISHA_OPENINGS, ...FURIBISHA_OPENINGS, ...SPECIAL_OPENINGS];

/**
 * Check if the game has followed the opening sequence correctly so far
 */
function matchesOpeningSequence(
  kyokumen: Kyokumen,
  opening: OpeningSequence,
  moveHistory: Te[],
  moveNumber: number
): boolean {
  // Check if all previous moves match the opening book
  const movesToCheck = Math.min(moveNumber - 1, opening.moves.length);

  for (let i = 0; i < movesToCheck; i++) {
    if (i >= moveHistory.length) break;

    const historyMove = moveHistory[i];
    const bookMove = opening.moves[i];

    // Check if move matches (within 1 square tolerance for flexibility)
    const fromMatches =
      Math.abs(historyMove.from.suji - bookMove.from.suji) <= 1 &&
      Math.abs(historyMove.from.dan - bookMove.from.dan) <= 1;

    const toMatches =
      Math.abs(historyMove.to.suji - bookMove.to.suji) <= 1 &&
      Math.abs(historyMove.to.dan - bookMove.to.dan) <= 1;

    // If moves don't match reasonably, sequence is broken
    if (!fromMatches || !toMatches) {
      return false;
    }
  }

  return true;
}

/**
 * Get best opening move based on current position
 */
export function getOpeningMoveComprehensive(
  kyokumen: Kyokumen,
  moveNumber: number,
  teban: number,
  moveHistory: Te[] = []
): Te | null {
  // Only use opening book for first 12 moves AND only in quiet positions
  if (moveNumber > 12) {
    return null;
  }

  // Don't use opening book if we're under attack or have tactical opportunities
  const positionEval = kyokumen.evaluate();
  const evalForThisSide = teban === SENTE ? positionEval : -positionEval;

  // If position is very unbalanced (> 300 points), don't use book moves
  if (Math.abs(evalForThisSide) > 300) {
    console.log(`Position too tactical (eval: ${evalForThisSide}), skipping opening book`);
    return null;
  }

  // Try to find matching opening sequence
  const legalMoves = generateLegalMoves(kyokumen);
  if (legalMoves.length === 0) return null;

  // moveNumber starts at 1, so we need to get the right index
  const moveIndex = moveNumber - 1;

  // Filter openings that match the game so far and have moves for this move number
  const viableOpenings = ALL_OPENINGS.filter(opening => {
    if (moveIndex >= opening.moves.length) return false;
    if (opening.moves[moveIndex].teban !== teban) return false;

    // IMPORTANT: Check if the game has been following this opening
    return matchesOpeningSequence(kyokumen, opening, moveHistory, moveNumber);
  });

  if (viableOpenings.length === 0) {
    console.log(`No matching opening sequences found for move ${moveNumber}`);
    return null;
  }

  // Sort by priority and pick one of the top openings
  viableOpenings.sort((a, b) => b.priority - a.priority);

  const selectedOpening = viableOpenings[0]; // Take the best match

  const bookMove = selectedOpening.moves[moveIndex];

  console.log(`Opening book: ${selectedOpening.name} (move ${moveNumber})`);

  // Verify the move is legal
  const from = new Position(bookMove.from.suji, bookMove.from.dan);
  const to = new Position(bookMove.to.suji, bookMove.to.dan);
  const koma = kyokumen.get(from);

  if (koma === 0) {
    console.log(`No piece at ${from.suji}-${from.dan}, abandoning opening book`);
    return null;
  }

  // Find matching legal move
  const matchingMove = legalMoves.find(
    move =>
      move.from.suji === from.suji &&
      move.from.dan === from.dan &&
      move.to.suji === to.suji &&
      move.to.dan === to.dan
  );

  if (matchingMove) {
    console.log(`Using book move: ${from.suji}${from.dan} -> ${to.suji}${to.dan}`);
  } else {
    console.log(`Book move not legal, abandoning opening book`);
  }

  return matchingMove || null;
}

/**
 * Get opening name if we're following a known pattern
 */
export function detectOpening(moveHistory: Te[]): string | null {
  if (moveHistory.length < 2) return null;

  // Try to match move history to opening sequences
  for (const opening of ALL_OPENINGS) {
    let matches = true;
    const checkLength = Math.min(moveHistory.length, opening.moves.length);

    for (let i = 0; i < checkLength; i++) {
      const move = moveHistory[i];
      const bookMove = opening.moves[i];

      if (
        move.from.suji !== bookMove.from.suji ||
        move.from.dan !== bookMove.from.dan ||
        move.to.suji !== bookMove.to.suji ||
        move.to.dan !== bookMove.to.dan
      ) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return opening.name;
    }
  }

  return null;
}
