/**
 * Comprehensive Opening Book for Shogi
 * Includes major opening patterns (戦法)
 */

import { Te, Position, SENTE, GOTE, FU, getKomashu } from './types';
import { Kyokumen } from './Kyokumen';
import { generateLegalMoves } from './GenerateMoves';

interface OpeningMove {
  from: { suji: number; dan: number }; // {0,0} for drops (set `drop` to the piece type)
  to: { suji: number; dan: number };
  promote: boolean;
  teban?: number; // SENTE or GOTE (optional - can be derived from move index)
  drop?: number; // piece type (FU/KY/KE/GI/KI/KA/HI) for drop moves
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
  // 角換わりの本手順: ▲７七角→▲８八銀と組み替えてから△７七角成▲同銀。
  {
    name: '角換わり（本組・７七角型）',
    category: '相居飛車',
    priority: 86,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
      { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 }, promote: false, teban: SENTE }, // ☗７七角 (８六の交換を受ける)
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 7, dan: 9 }, to: { suji: 8, dan: 8 }, promote: false, teban: SENTE }, // ☗８八銀
      { from: { suji: 2, dan: 2 }, to: { suji: 7, dan: 7 }, promote: true, teban: GOTE },   // ☖７七角成
      { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 }, promote: false, teban: SENTE }, // ☗同銀
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金 (角打ちに備える)
      { from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 }, promote: false, teban: SENTE }, // ☗３八銀
      { from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 }, promote: false, teban: GOTE },  // ☖２二銀
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八金
      { from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 }, promote: false, teban: GOTE },  // ☖３三銀 (基本形)
    ],
  },
  // 角換わり模様（▲７八金△３二金型）で▲２四歩と来た場合の交換対応。
  {
    name: '角換わり（７八金型・２四歩交換対応）',
    category: '相居飛車',
    priority: 82,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八金 (８八を受ける)
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金 (２二を受ける)
      { from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 }, promote: false, teban: SENTE }, // ☗２四歩
      { from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 }, promote: false, teban: GOTE },  // ☖同歩
      { from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 }, promote: false, teban: SENTE }, // ☗同飛
      { from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, promote: false, teban: GOTE, drop: FU }, // ☖２三歩
      { from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 8 }, promote: false, teban: SENTE }, // ☗２八飛
      { from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 }, promote: false, teban: GOTE },  // ☖８六歩
      { from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 }, promote: false, teban: SENTE }, // ☗同歩
      { from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 }, promote: false, teban: GOTE },  // ☖同飛
      { from: { suji: 0, dan: 0 }, to: { suji: 8, dan: 7 }, promote: false, teban: SENTE, drop: FU }, // ☗８七歩
      { from: { suji: 8, dan: 6 }, to: { suji: 8, dan: 2 }, promote: false, teban: GOTE },  // ☖８二飛
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
  // 相掛かり・飛車先交換の完全手順（引き飛車）。
  // ▲２四歩△同歩▲同飛には△２三歩が正しい受け。▲７八金／△３二金を先に入れるのが本定跡
  // （交換後の△８八角成→△３三角の両取り筋・▲７七角の反撃筋を互いに消している）。
  {
    name: '相掛かり（飛先交換・引き飛車）',
    category: '相居飛車',
    priority: 92,
    moves: [
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八金
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金
      { from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 }, promote: false, teban: SENTE }, // ☗２四歩 (飛車先交換)
      { from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 }, promote: false, teban: GOTE },  // ☖同歩
      { from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 }, promote: false, teban: SENTE }, // ☗同飛
      { from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, promote: false, teban: GOTE, drop: FU }, // ☖２三歩 (正しい受け)
      { from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 8 }, promote: false, teban: SENTE }, // ☗２八飛 (引き飛車)
      { from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 }, promote: false, teban: GOTE },  // ☖８六歩 (交換をお返し)
      { from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 }, promote: false, teban: SENTE }, // ☗同歩
      { from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 }, promote: false, teban: GOTE },  // ☖同飛
      { from: { suji: 0, dan: 0 }, to: { suji: 8, dan: 7 }, promote: false, teban: SENTE, drop: FU }, // ☗８七歩
      { from: { suji: 8, dan: 6 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四飛 (浮き飛車: 横利きで２四をケア)
      { from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 }, promote: false, teban: SENTE }, // ☗３八銀
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩 (３四は８四飛の横利きが守る)
    ],
  },
  // 相掛かり・飛車先交換（▲２六飛の浮き飛車型）
  {
    name: '相掛かり（飛先交換・浮き飛車）',
    category: '相居飛車',
    priority: 88,
    moves: [
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
      { from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八金
      { from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二金
      { from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 }, promote: false, teban: SENTE }, // ☗２四歩
      { from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 }, promote: false, teban: GOTE },  // ☖同歩
      { from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 }, promote: false, teban: SENTE }, // ☗同飛
      { from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, promote: false, teban: GOTE, drop: FU }, // ☖２三歩
      { from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六飛 (浮き飛車)
      { from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 }, promote: false, teban: GOTE },  // ☖８六歩
      { from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 }, promote: false, teban: SENTE }, // ☗同歩
      { from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 }, promote: false, teban: GOTE },  // ☖同飛
      { from: { suji: 0, dan: 0 }, to: { suji: 8, dan: 7 }, promote: false, teban: SENTE, drop: FU }, // ☗８七歩
      { from: { suji: 8, dan: 6 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四飛 (相浮き飛車)
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
  // NOTE: 飛車は２八から動く（旧データは８八=角の枡からの「▲６八飛」で、５手目以降が死んでいた）。
  {
    name: '四間飛車',
    category: '振り飛車',
    priority: 90,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 }, promote: false, teban: SENTE }, // ☗６六歩
      { from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 }, promote: false, teban: GOTE },  // ☖８四歩
      { from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 }, promote: false, teban: SENTE }, // ☗６八飛
      { from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 }, promote: false, teban: GOTE },  // ☖８五歩
      { from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 }, promote: false, teban: SENTE }, // ☗７七角 (飛車先を受ける)
      { from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 }, promote: false, teban: GOTE },  // ☖４二玉
      { from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false, teban: SENTE }, // ☗４八玉
      { from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二玉 (舟囲い)
      { from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 8 }, promote: false, teban: SENTE }, // ☗３八玉
      { from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 }, promote: false, teban: GOTE },  // ☖５二金右
      { from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 8 }, promote: false, teban: SENTE }, // ☗２八玉 (美濃)
      { from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 }, promote: false, teban: GOTE },  // ☖５四歩
      { from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 }, promote: false, teban: SENTE }, // ☗３八銀
      { from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 }, promote: false, teban: GOTE },  // ☖６二銀 (急戦準備)
    ],
  },
  // 後手四間飛車 vs 居飛車急戦の基本形。▲２五歩には△３三角、玉は△６二→７二→８二で美濃完成。
  {
    name: '後手四間飛車（vs急戦・美濃完成）',
    category: '振り飛車',
    priority: 88,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 4, dan: 3 }, to: { suji: 4, dan: 4 }, promote: false, teban: GOTE },  // ☖４四歩 (角道を止める)
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 }, promote: false, teban: GOTE },  // ☖３三角 (飛車先を受ける)
      { from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false, teban: SENTE }, // ☗４八銀
      { from: { suji: 8, dan: 2 }, to: { suji: 4, dan: 2 }, promote: false, teban: GOTE },  // ☖４二飛 (四間飛車)
      { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false, teban: SENTE }, // ☗６八玉
      { from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 }, promote: false, teban: GOTE },  // ☖６二玉
      { from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八玉 (舟囲いへ)
      { from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 }, promote: false, teban: GOTE },  // ☖７二玉
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false, teban: SENTE }, // ☗５八金右
      { from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 }, promote: false, teban: GOTE },  // ☖８二玉 (美濃完成)
      { from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 }, promote: false, teban: SENTE }, // ☗５六歩
      { from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 }, promote: false, teban: GOTE },  // ☖７二銀
    ],
  },
  // 後手三間飛車の正調（△３二飛）。▲２五歩には△３三角。
  {
    name: '後手三間飛車（美濃完成）',
    category: '振り飛車',
    priority: 78,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 8, dan: 2 }, to: { suji: 3, dan: 2 }, promote: false, teban: GOTE },  // ☖３二飛 (三間飛車)
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 }, promote: false, teban: GOTE },  // ☖３三角 (飛車先を受ける)
      { from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false, teban: SENTE }, // ☗４八銀
      { from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 }, promote: false, teban: GOTE },  // ☖６二玉
      { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false, teban: SENTE }, // ☗６八玉
      { from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 }, promote: false, teban: GOTE },  // ☖７二玉
      { from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八玉
      { from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 }, promote: false, teban: GOTE },  // ☖８二玉 (美濃)
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false, teban: SENTE }, // ☗５八金右
      { from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 }, promote: false, teban: GOTE },  // ☖７二銀
    ],
  },
  // 後手ゴキゲン中飛車の本手順: △３四歩→△５四歩→△５二飛→△５五歩位取り→美濃。
  {
    name: 'ゴキゲン中飛車（後手・本形）',
    category: '振り飛車',
    priority: 86,
    moves: [
      { from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 }, promote: false, teban: SENTE }, // ☗７六歩
      { from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 }, promote: false, teban: GOTE },  // ☖３四歩
      { from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 }, promote: false, teban: SENTE }, // ☗２六歩
      { from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 }, promote: false, teban: GOTE },  // ☖５四歩
      { from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 }, promote: false, teban: SENTE }, // ☗２五歩
      { from: { suji: 8, dan: 2 }, to: { suji: 5, dan: 2 }, promote: false, teban: GOTE },  // ☖５二飛 (ゴキゲン中飛車)
      { from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 }, promote: false, teban: SENTE }, // ☗４八銀
      { from: { suji: 5, dan: 4 }, to: { suji: 5, dan: 5 }, promote: false, teban: GOTE },  // ☖５五歩 (位取り)
      { from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 }, promote: false, teban: SENTE }, // ☗６八玉
      { from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 }, promote: false, teban: GOTE },  // ☖６二玉
      { from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 }, promote: false, teban: SENTE }, // ☗７八玉
      { from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 }, promote: false, teban: GOTE },  // ☖７二玉
      { from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 }, promote: false, teban: SENTE }, // ☗５八金右
      { from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 }, promote: false, teban: GOTE },  // ☖８二玉 (美濃)
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

// Exposed for offline validation scripts/tests (replaying every line for legality).
// Not intended for app code — use the getter functions below instead.
export const ALL_OPENING_SEQUENCES = ALL_OPENINGS;

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

    // For drops (from = 0,0), also require the dropped piece type to match.
    const dropMatches =
      bookMove.drop === undefined ||
      (historyMove.from.suji === 0 && getKomashu(historyMove.koma) === bookMove.drop);

    // If moves don't match reasonably, sequence is broken
    if (!fromMatches || !toMatches || !promoteMatches || !dropMatches) {
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
  // Only use opening book in the opening AND only in quiet positions.
  // 18 plies covers the longest curated lines (e.g. 相掛かり飛車先交換の完全手順).
  if (moveNumber > 18) {
    return [];
  }

  // NOTE: there used to be a static-eval gate here ("skip the book when |eval| is large").
  // It was removed on purpose:
  // - Book matching is a strict full-prefix match on `moveHistory` from the initial position,
  //   so any in-book position is by construction a known joseki position — never "already decided".
  // - Joseki exchanges have large *transient* swings while a recapture is pending
  //   (▲2四同飛 direct exchange: ~1300, △7七角成 waiting for ▲同銀: ~2900). The old ±900 gate
  //   silently killed the book at exactly the plies where it must answer (同銀 / △2三歩 / ▲8七歩).
  // - Per-candidate safety is enforced downstream by `getOpeningMoveValidated()`
  //   (1-ply static check vs the best legal move), which naturally accepts forced recaptures
  //   and rejects quiet book moves in genuinely bad positions.

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

    const isDrop = bookMove.from.suji === 0 && bookMove.from.dan === 0;
    const from = new Position(bookMove.from.suji, bookMove.from.dan);
    const to = new Position(bookMove.to.suji, bookMove.to.dan);

    if (isDrop) {
      if (bookMove.drop === undefined) continue; // malformed book entry
    } else {
      // Verify a piece actually sits on the from-square
      const koma = kyokumen.get(from);
      if (koma === 0) {
        continue;
      }
    }

    // Find matching legal move
    const matchingMove = legalMoves.find(
      move =>
        move.from.suji === from.suji &&
        move.from.dan === from.dan &&
        move.to.suji === to.suji &&
        move.to.dan === to.dan &&
        move.promote === bookMove.promote &&
        (!isDrop || getKomashu(move.koma) === bookMove.drop)
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
