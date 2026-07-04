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
  teban?: number; // SENTE or GOTE (optional - can be derived from move index)
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
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
    ],
  },
  // 対原始棒銀（▲２六歩スタート）— △３三角型の受け
  // 「▲２五歩には△３三角」「棒銀の銀を五段目(１五)に出させない△１四歩」が骨子。
  // 参考: 遠山雄亮プロの棒銀対策解説・各定跡サイトの原始棒銀対策。
  {
    name: '対原始棒銀（３三角型）',
    category: '対棒銀',
    priority: 96,
    moves: [
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 }, promote: false, teban: GOTE },  // ☖３三角 (２四の交換を防ぐ)
      { from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 }, promote: false, teban: SENTE }, // ☗３八銀
      { from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 }, promote: false, teban: GOTE },  // ☖２二銀 (２三を補強)
      { from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 7 }, promote: false, teban: SENTE }, // ☗２七銀
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六銀
      { from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 }, promote: false, teban: GOTE },  // ☖１四歩 (▲１五銀を防ぐ)
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 }, promote: false, teban: GOTE },  // ☖４二玉
    ],
  },
  // 対原始棒銀（▲７六歩を先に突く順）
  {
    name: '対原始棒銀（７六歩先行型）',
    category: '対棒銀',
    priority: 94,
    moves: [
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 }, promote: false, teban: GOTE },  // ☖３三角
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 }, promote: false, teban: GOTE },  // ☖２二銀 (▲３三角成に備える)
      { from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 }, promote: false, teban: SENTE }, // ☗３八銀
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金
      { from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 7 }, promote: false, teban: SENTE }, // ☗２七銀
      { from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 }, promote: false, teban: GOTE },  // ☖１四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六銀
      { from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 }, promote: false, teban: GOTE },  // ☖４二玉
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
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八金
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金 (２三を守る)
    ],
  },
  // 横歩取り模様 (quiet part only — the actual 横歩 capture branches too much for a static book)
  {
    name: '横歩取り模様',
    category: '相居飛車',
    priority: 70,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八金
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金
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
  // 対早繰り銀 (Defense against Early 8th File Attack)
  {
    name: '対８筋早攻め',
    category: '対居飛車',
    priority: 95,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false }, // ☗７六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false }, // ☖８四歩
      { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false }, // ☗６八王
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false }, // ☖８五歩
      { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 }, promote: false }, // ☗７七角 (KEY DEFENSIVE MOVE)
      { from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 }, promote: false }, // ☖８六歩
      { from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 }, promote: false }, // ☗同歩
      { from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 }, promote: false }, // ☖同飛
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
  // 角交換振り飛車 (Bishop Exchange Ranging Rook) — quiet setup only
  {
    name: '角交換振り飛車',
    category: '振り飛車',
    priority: 80,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false, teban: SENTE }, // ☗６六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八銀
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
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
  // 風車模様 (Windmill-ish quiet setup)
  {
    name: '風車模様',
    category: '振り飛車',
    priority: 60,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 }, promote: false, teban: SENTE }, // ☗５六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false, teban: SENTE }, // ☗５八金右
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
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

    // Opening-book matching must be strict.
    //
    // A previous "±1 square tolerance" was too permissive and could incorrectly keep an opening "alive"
    // even after the game diverged (e.g., confusing P-7f with P-7e / P-7d sequences).
    // That caused the AI to "forget" the real line and suggest unrelated book moves.
    const fromMatches =
      historyMove.from.suji === bookMove.from.suji &&
      historyMove.from.dan === bookMove.from.dan;

    const toMatches =
      historyMove.to.suji === bookMove.to.suji &&
      historyMove.to.dan === bookMove.to.dan;

    const promoteMatches = historyMove.promote === bookMove.promote;

    // If moves don't match reasonably, sequence is broken
    if (!fromMatches || !toMatches || !promoteMatches) {
      return false;
    }
  }

  return true;
}

export interface OpeningMoveCandidate {
  name: string;
  category: string;
  priority: number;
  move: Te;
}

function candidateKey(move: Te): string {
  return `${move.koma}:${move.from.suji},${move.from.dan}->${move.to.suji},${move.to.dan}:${move.promote ? 1 : 0}`;
}

/**
 * Get all viable opening-book moves for the current position.
 *
 * This is useful when callers want to apply additional validation (e.g., quick static evaluation / safety checks)
 * before committing to a book move.
 */
export function getOpeningMoveCandidatesComprehensive(
  kyokumen: Kyokumen,
  moveNumber: number,
  teban: number,
  moveHistory: Te[] = []
): OpeningMoveCandidate[] {
  // Only use opening book for first 12 moves AND only in quiet positions
  if (moveNumber > 12) {
    return [];
  }

  // Don't use opening book if the position is already clearly decided (big material swing).
  //
  // NOTE: this gate used to be ±200, which is *smaller* than normal opening eval noise
  // (e.g. ▲2五歩 alone can swing the static eval by several hundred points). That silently
  // disabled the book for the defending side exactly when it needed its defensive joseki
  // (対棒銀の△3三角型 etc.). Per-candidate safety is enforced downstream by
  // `getOpeningMoveValidated()` (1-ply static check vs the best legal move), so this gate
  // only needs to catch positions where the game has already left "opening" territory.
  const positionEval = kyokumen.evaluate();
  const evalForThisSide = teban === SENTE ? positionEval : -positionEval;
  if (Math.abs(evalForThisSide) > 900) {
    return [];
  }

  // Try to find matching opening sequence
  const legalMoves = generateLegalMoves(kyokumen);
  if (legalMoves.length === 0) return [];

  // moveNumber starts at 1, so we need to get the right index
  const moveIndex = moveNumber - 1;

  // Filter openings that match the game so far and have moves for this move number
  const viableOpenings = ALL_OPENINGS.filter(opening => {
    if (moveIndex >= opening.moves.length) return false;

    // Check teban - if not specified in the move, derive from move index
    // Odd moves (1,3,5,7...) are SENTE, even moves (2,4,6,8...) are GOTE
    const expectedTeban = opening.moves[moveIndex].teban ??
                         ((moveIndex % 2 === 0) ? SENTE : GOTE);
    if (expectedTeban !== teban) return false;

    // IMPORTANT: Check if the game has been following this opening
    return matchesOpeningSequence(kyokumen, opening, moveHistory, moveNumber);
  });

  if (viableOpenings.length === 0) {
    return [];
  }

  // Sort by priority and return candidates (deduped by exact move).
  viableOpenings.sort((a, b) => b.priority - a.priority);

  const seen = new Set<string>();
  const candidates: OpeningMoveCandidate[] = [];

  for (const opening of viableOpenings) {
    const bookMove = opening.moves[moveIndex];

    // Verify the move is legal
    const from = new Position(bookMove.from.suji, bookMove.from.dan);
    const to = new Position(bookMove.to.suji, bookMove.to.dan);
    const koma = kyokumen.get(from);

    if (koma === 0) {
      continue;
    }

    // Find matching legal move
    const matchingMove = legalMoves.find(
      move =>
        move.from.suji === from.suji &&
        move.from.dan === from.dan &&
        move.to.suji === to.suji &&
        move.to.dan === to.dan &&
        move.promote === bookMove.promote
    );

    if (!matchingMove) continue;

    const key = candidateKey(matchingMove);
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      name: opening.name,
      category: opening.category,
      priority: opening.priority,
      move: matchingMove,
    });
  }

  return candidates;
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
  const candidates = getOpeningMoveCandidatesComprehensive(kyokumen, moveNumber, teban, moveHistory);
  if (candidates.length === 0) {
    console.log(`No matching opening sequences found for move ${moveNumber}`);
    return null;
  }

  const best = candidates[0];
  console.log(`Opening book: ${best.name} (move ${moveNumber})`);
  console.log(`Using book move: ${best.move.from.suji}${best.move.from.dan} -> ${best.move.to.suji}${best.move.to.dan}`);
  return best.move;
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
