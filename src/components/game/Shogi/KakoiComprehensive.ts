/**
 * Comprehensive Kakoi (Castle) Evaluation
 * Includes major defensive formations (囲い)
 */

import { Kyokumen } from './Kyokumen';
import {
GGI,
GKI,
GOU,
Position,
PROMOTE,
SENTE,
SGI,
SKI,
SOU
} from './types';

// Helper function to find king position
function findKingPosition(kyokumen: Kyokumen, teban: number): Position | null {
  const targetKing = teban === SENTE ? SOU : GOU;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      if (kyokumen.ban[suji][dan] === targetKing) {
        return new Position(suji, dan);
      }
    }
  }
  return null;
}

// Helper to check if piece exists at position
function checkPiece(kyokumen: Kyokumen, suji: number, dan: number, expectedPiece: number): boolean {
  if (suji < 1 || suji > 9 || dan < 1 || dan > 9) return false;
  const piece = kyokumen.ban[suji][dan];
  return piece === expectedPiece || piece === (expectedPiece | PROMOTE);
}

// ============================================================================
// 居飛車 (IBISHA) CASTLES
// ============================================================================

// 矢倉系 (Yagura Family)
// ============================================================================

// 矢倉囲い (Classic Yagura)
function evaluateYagura(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const _king = teban === SENTE ? SOU : GOU;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    // Sente Yagura: King at 7h/8h, Golds at 6h/7i, Silver at 6g/7g
    if ((kingPos.suji === 7 || kingPos.suji === 8) && kingPos.dan === 8) {
      score += 40;

      if (checkPiece(kyokumen, 6, 8, gold)) score += 25;
      if (checkPiece(kyokumen, 7, 9, gold)) score += 25;
      if (checkPiece(kyokumen, 6, 7, silver)) score += 20;
      if (checkPiece(kyokumen, 7, 7, silver)) score += 20;
    }
  } else {
    // Gote Yagura (mirrored)
    if ((kingPos.suji === 2 || kingPos.suji === 3) && kingPos.dan === 2) {
      score += 40;

      if (checkPiece(kyokumen, 4, 2, gold)) score += 25;
      if (checkPiece(kyokumen, 3, 1, gold)) score += 25;
      if (checkPiece(kyokumen, 4, 3, silver)) score += 20;
      if (checkPiece(kyokumen, 3, 3, silver)) score += 20;
    }
  }

  return score;
}

// 銀矢倉 (Silver Yagura)
function evaluateGinYagura(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    if (kingPos.suji === 7 && kingPos.dan === 8) {
      score += 35;
      // More silver pieces in defensive formation
      if (checkPiece(kyokumen, 6, 8, silver)) score += 20;
      if (checkPiece(kyokumen, 7, 7, silver)) score += 20;
      if (checkPiece(kyokumen, 8, 7, silver)) score += 15;
    }
  } else {
    if (kingPos.suji === 3 && kingPos.dan === 2) {
      score += 35;
      if (checkPiece(kyokumen, 4, 2, silver)) score += 20;
      if (checkPiece(kyokumen, 3, 3, silver)) score += 20;
      if (checkPiece(kyokumen, 2, 3, silver)) score += 15;
    }
  }

  return score;
}

// 矢倉穴熊 (Yagura Anaguma) - Hybrid castle
function evaluateYaguraAnaguma(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;

  if (teban === SENTE) {
    // King in corner like Anaguma but with Yagura-style golds
    if (kingPos.suji === 9 && kingPos.dan === 9) {
      score += 55;
      if (checkPiece(kyokumen, 8, 9, teban === SENTE ? SKI : GKI)) score += 25;
      if (checkPiece(kyokumen, 9, 8, teban === SENTE ? SKI : GKI)) score += 25;
    }
  } else {
    if (kingPos.suji === 1 && kingPos.dan === 1) {
      score += 55;
      if (checkPiece(kyokumen, 2, 1, teban === SENTE ? SKI : GKI)) score += 25;
      if (checkPiece(kyokumen, 1, 2, teban === SENTE ? SKI : GKI)) score += 25;
    }
  }

  return score;
}

// 総矢倉 (Complete Yagura)
function evaluateSouYagura(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = evaluateYagura(kyokumen, teban);

  // Bonus if all pieces are in perfect Yagura formation
  if (score > 100) {
    score += 20; // Perfect formation bonus
  }

  return score;
}

// 居飛車穴熊 (Ibisha Anaguma)
// ============================================================================

function evaluateIbishaAnaguma(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    if (kingPos.suji === 9 && kingPos.dan === 9) {
      score += 55;
      if (checkPiece(kyokumen, 8, 9, gold)) score += 28;
      if (checkPiece(kyokumen, 9, 8, gold)) score += 28;
      if (checkPiece(kyokumen, 8, 8, silver)) score += 25;
      if (checkPiece(kyokumen, 7, 9, silver)) score += 20;
    }
  } else {
    if (kingPos.suji === 1 && kingPos.dan === 1) {
      score += 55;
      if (checkPiece(kyokumen, 2, 1, gold)) score += 28;
      if (checkPiece(kyokumen, 1, 2, gold)) score += 28;
      if (checkPiece(kyokumen, 2, 2, silver)) score += 25;
      if (checkPiece(kyokumen, 3, 1, silver)) score += 20;
    }
  }

  return score;
}

// 左美濃系 (Hidari-Mino Family)
// ============================================================================

function evaluateHidariMino(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    // Left-side Mino for static rook
    if (kingPos.suji === 7 && kingPos.dan === 8) {
      score += 35;
      if (checkPiece(kyokumen, 6, 9, gold)) score += 20;
      if (checkPiece(kyokumen, 7, 9, gold)) score += 20;
      if (checkPiece(kyokumen, 7, 7, silver)) score += 18;
    }
  } else {
    if (kingPos.suji === 3 && kingPos.dan === 2) {
      score += 35;
      if (checkPiece(kyokumen, 4, 1, gold)) score += 20;
      if (checkPiece(kyokumen, 3, 1, gold)) score += 20;
      if (checkPiece(kyokumen, 3, 3, silver)) score += 18;
    }
  }

  return score;
}

// 舟囲い (Boat Castle) - Quick defensive formation
function evaluateFuna(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    if ((kingPos.suji === 7 || kingPos.suji === 8) && kingPos.dan === 8) {
      score += 25; // Quick but less solid
      if (checkPiece(kyokumen, 7, 9, gold)) score += 15;
      if (checkPiece(kyokumen, 6, 8, gold)) score += 15;
      if (checkPiece(kyokumen, 7, 8, silver)) score += 12;
    }
  } else {
    if ((kingPos.suji === 2 || kingPos.suji === 3) && kingPos.dan === 2) {
      score += 25;
      if (checkPiece(kyokumen, 3, 1, gold)) score += 15;
      if (checkPiece(kyokumen, 4, 2, gold)) score += 15;
      if (checkPiece(kyokumen, 3, 2, silver)) score += 12;
    }
  }

  return score;
}

// 雁木囲い (Gangi Castle)
function evaluateGangi(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    if (kingPos.suji === 6 && kingPos.dan === 8) {
      score += 38;
      // Gangi has characteristic diagonal formation
      if (checkPiece(kyokumen, 5, 8, gold)) score += 20;
      if (checkPiece(kyokumen, 6, 7, silver)) score += 18;
      if (checkPiece(kyokumen, 7, 7, silver)) score += 18;
    }
  } else {
    if (kingPos.suji === 4 && kingPos.dan === 2) {
      score += 38;
      if (checkPiece(kyokumen, 5, 2, gold)) score += 20;
      if (checkPiece(kyokumen, 4, 3, silver)) score += 18;
      if (checkPiece(kyokumen, 3, 3, silver)) score += 18;
    }
  }

  return score;
}

// ミレニアム囲い (Millennium Castle) - Modern solid formation
function evaluateMillennium(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;

  if (teban === SENTE) {
    if (kingPos.suji === 8 && kingPos.dan === 9) {
      score += 42;
      if (checkPiece(kyokumen, 7, 9, gold)) score += 22;
      if (checkPiece(kyokumen, 8, 8, gold)) score += 22;
      if (checkPiece(kyokumen, 9, 8, teban === SENTE ? SGI : GGI)) score += 18;
    }
  } else {
    if (kingPos.suji === 2 && kingPos.dan === 1) {
      score += 42;
      if (checkPiece(kyokumen, 3, 1, gold)) score += 22;
      if (checkPiece(kyokumen, 2, 2, gold)) score += 22;
      if (checkPiece(kyokumen, 1, 2, teban === SENTE ? SGI : GGI)) score += 18;
    }
  }

  return score;
}

// ============================================================================
// 振り飛車 (FURIBISHA) CASTLES
// ============================================================================

// 美濃系 (Mino Family) - Most common for ranging rook
// ============================================================================

function evaluateMino(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    if ((kingPos.suji >= 7 && kingPos.suji <= 9) && kingPos.dan === 8) {
      score += 35;
      if (checkPiece(kyokumen, 6, 9, gold)) score += 22;
      if (checkPiece(kyokumen, 7, 9, gold)) score += 22;
      if (checkPiece(kyokumen, 7, 8, silver)) score += 18;
    }
  } else {
    if ((kingPos.suji >= 1 && kingPos.suji <= 3) && kingPos.dan === 2) {
      score += 35;
      if (checkPiece(kyokumen, 4, 1, gold)) score += 22;
      if (checkPiece(kyokumen, 3, 1, gold)) score += 22;
      if (checkPiece(kyokumen, 3, 2, silver)) score += 18;
    }
  }

  return score;
}

// 高美濃 (Takamino - High Mino)
function evaluateTakamino(kyokumen: Kyokumen, teban: number): number {
  const minoScore = evaluateMino(kyokumen, teban);
  if (minoScore === 0) return 0;

  let score = minoScore + 10; // Better than basic Mino
  const gold = teban === SENTE ? SKI : GKI;

  if (teban === SENTE) {
    // Higher gold placement
    if (checkPiece(kyokumen, 6, 8, gold)) score += 15;
  } else {
    if (checkPiece(kyokumen, 4, 2, gold)) score += 15;
  }

  return score;
}

// 銀冠 (Ginkanmuri - Silver Crown)
function evaluateGinkanmuri(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    if (kingPos.suji === 8 && kingPos.dan === 8) {
      score += 45; // Very solid
      if (checkPiece(kyokumen, 7, 9, gold)) score += 23;
      if (checkPiece(kyokumen, 8, 9, gold)) score += 23;
      if (checkPiece(kyokumen, 9, 8, silver)) score += 20;
      if (checkPiece(kyokumen, 7, 8, silver)) score += 20;
    }
  } else {
    if (kingPos.suji === 2 && kingPos.dan === 2) {
      score += 45;
      if (checkPiece(kyokumen, 3, 1, gold)) score += 23;
      if (checkPiece(kyokumen, 2, 1, gold)) score += 23;
      if (checkPiece(kyokumen, 1, 2, silver)) score += 20;
      if (checkPiece(kyokumen, 3, 2, silver)) score += 20;
    }
  }

  return score;
}

// 銀美濃 (Gin-Mino - Silver Mino)
function evaluateGinMino(kyokumen: Kyokumen, teban: number): number {
  const minoScore = evaluateMino(kyokumen, teban);
  if (minoScore === 0) return 0;

  let score = minoScore + 8;
  const silver = teban === SENTE ? SGI : GGI;

  // Additional silver for defense
  if (teban === SENTE) {
    if (checkPiece(kyokumen, 6, 8, silver)) score += 15;
  } else {
    if (checkPiece(kyokumen, 4, 2, silver)) score += 15;
  }

  return score;
}

// ダイヤモンド美濃 (Diamond Mino)
function evaluateDiamondMino(kyokumen: Kyokumen, teban: number): number {
  const minoScore = evaluateMino(kyokumen, teban);
  if (minoScore < 30) return 0;

  let score = minoScore + 15; // Enhanced Mino
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    // Diamond shape with pieces
    if (checkPiece(kyokumen, 6, 8, gold) && checkPiece(kyokumen, 8, 8, silver)) {
      score += 20;
    }
  } else {
    if (checkPiece(kyokumen, 4, 2, gold) && checkPiece(kyokumen, 2, 2, silver)) {
      score += 20;
    }
  }

  return score;
}

// 振り飛車穴熊 (Furibisha Anaguma)
function evaluateFuribishaAnaguma(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;
  const silver = teban === SENTE ? SGI : GGI;

  if (teban === SENTE) {
    // Opposite corner from Ibisha Anaguma
    if (kingPos.suji === 1 && kingPos.dan === 9) {
      score += 58; // Very strong
      if (checkPiece(kyokumen, 2, 9, gold)) score += 28;
      if (checkPiece(kyokumen, 1, 8, gold)) score += 28;
      if (checkPiece(kyokumen, 2, 8, silver)) score += 25;
    }
  } else {
    if (kingPos.suji === 9 && kingPos.dan === 1) {
      score += 58;
      if (checkPiece(kyokumen, 8, 1, gold)) score += 28;
      if (checkPiece(kyokumen, 9, 2, gold)) score += 28;
      if (checkPiece(kyokumen, 8, 2, silver)) score += 25;
    }
  }

  return score;
}

// 銀冠穴熊 (Ginkanmuri Anaguma)
function evaluateGinkanmuriAnaguma(kyokumen: Kyokumen, teban: number): number {
  const anagumaScore = evaluateFuribishaAnaguma(kyokumen, teban);
  const ginkanmuriScore = evaluateGinkanmuri(kyokumen, teban);

  if (anagumaScore > 50 && ginkanmuriScore > 30) {
    return anagumaScore + ginkanmuriScore + 10; // Super solid
  }

  return 0;
}

// 金無双 (Kin-Musou - Gold Fortress)
function evaluateKinMusou(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;
  const gold = teban === SENTE ? SKI : GKI;

  if (teban === SENTE) {
    if ((kingPos.suji >= 7 && kingPos.suji <= 8) && kingPos.dan === 8) {
      score += 32;
      // Two golds side by side
      if (checkPiece(kyokumen, 7, 8, gold) && checkPiece(kyokumen, 8, 8, gold)) {
        score += 25;
      }
    }
  } else {
    if ((kingPos.suji >= 2 && kingPos.suji <= 3) && kingPos.dan === 2) {
      score += 32;
      if (checkPiece(kyokumen, 2, 2, gold) && checkPiece(kyokumen, 3, 2, gold)) {
        score += 25;
      }
    }
  }

  return score;
}

// 中住まい (Nakazumai - Central King)
function evaluateNakazumai(kyokumen: Kyokumen, teban: number): number {
  const kingPos = findKingPosition(kyokumen, teban);
  if (!kingPos) return 0;

  let score = 0;

  // King stays in center - flexible but risky
  if (teban === SENTE) {
    if (kingPos.suji === 5 && kingPos.dan === 8) {
      score += 20; // Less solid but flexible
    }
  } else {
    if (kingPos.suji === 5 && kingPos.dan === 2) {
      score += 20;
    }
  }

  return score;
}

// ============================================================================
// COMPREHENSIVE EVALUATION FUNCTION
// ============================================================================

export function evaluateAllKakoi(kyokumen: Kyokumen, teban: number): number {
  let maxScore = 0;

  // Try all castle patterns and take the best match
  const patterns = [
    // Ibisha patterns
    evaluateYagura(kyokumen, teban),
    evaluateGinYagura(kyokumen, teban),
    evaluateYaguraAnaguma(kyokumen, teban),
    evaluateSouYagura(kyokumen, teban),
    evaluateIbishaAnaguma(kyokumen, teban),
    evaluateHidariMino(kyokumen, teban),
    evaluateFuna(kyokumen, teban),
    evaluateGangi(kyokumen, teban),
    evaluateMillennium(kyokumen, teban),

    // Furibisha patterns
    evaluateMino(kyokumen, teban),
    evaluateTakamino(kyokumen, teban),
    evaluateGinkanmuri(kyokumen, teban),
    evaluateGinMino(kyokumen, teban),
    evaluateDiamondMino(kyokumen, teban),
    evaluateFuribishaAnaguma(kyokumen, teban),
    evaluateGinkanmuriAnaguma(kyokumen, teban),
    evaluateKinMusou(kyokumen, teban),
    evaluateNakazumai(kyokumen, teban),
  ];

  // Return the highest scoring castle pattern
  maxScore = Math.max(...patterns);

  return maxScore;
}

/**
 * Detect which castle formation is being used
 */
export function detectKakoi(kyokumen: Kyokumen, teban: number): string | null {
  const scores: Array<{ name: string; score: number }> = [
    { name: '矢倉囲い', score: evaluateYagura(kyokumen, teban) },
    { name: '居飛車穴熊', score: evaluateIbishaAnaguma(kyokumen, teban) },
    { name: '美濃囲い', score: evaluateMino(kyokumen, teban) },
    { name: '高美濃', score: evaluateTakamino(kyokumen, teban) },
    { name: '銀冠', score: evaluateGinkanmuri(kyokumen, teban) },
    { name: '振り飛車穴熊', score: evaluateFuribishaAnaguma(kyokumen, teban) },
    { name: '舟囲い', score: evaluateFuna(kyokumen, teban) },
    { name: '雁木囲い', score: evaluateGangi(kyokumen, teban) },
    { name: 'ミレニアム囲い', score: evaluateMillennium(kyokumen, teban) },
    { name: '金無双', score: evaluateKinMusou(kyokumen, teban) },
  ];

  // Sort by score and return the best match
  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score > 30) {
    return scores[0].name;
  }

  return null;
}
