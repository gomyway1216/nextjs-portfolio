import { Difficulty } from '../common/types';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { InitialPositionImproved } from './InitialPositionImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { MoveListImproved } from './MoveListImproved';
import { EMPTY, FU, GI, GOTE, HI, KA, KE, KI, KY, OU, SENTE, Te, getKomashu } from './types';

/**
 * OpeningBookImproved (戦法 / 定跡 for the fast make/unmake engine)
 *
 * Goals:
 * - Make early play look "human" and coherent (戦法の形になる).
 * - Be faster: if a good book move exists, we can skip search.
 * - Keep safety: do not force book moves when the position is already tactical (e.g. in check).
 *
 * Design:
 * - We encode a small set of curated opening lines (not exhaustive).
 * - At module load, we "replay" those lines from the initial position and build a hash -> candidates map.
 * - At runtime, we look up by `KyokumenImproved.HashVal` (includes side-to-move) and then validate by:
 *   - legal move existence
 *   - simple static-eval threshold vs the best legal move (difficulty dependent)
 *
 * Notes:
 * - This file intentionally stays dependency-free (no external joseki.bin).
 * - If you want a larger book later, extend `OPENING_LINES` or generate it from a dataset.
 */

type BookMove = {
  teban: number; // SENTE or GOTE
  from: { suji: number; dan: number }; // use {0,0} for drops (not used in current lines)
  to: { suji: number; dan: number };
  promote?: boolean;
};

type OpeningLine = {
  name: string;
  category: string;
  priority: number;
  moves: BookMove[];
};

type BookCandidate = {
  move: Te;
  priority: number;
  lineName: string;
};

type BestScoreInfo = {
  bestScore: number;
  secondBestScore: number;
  bestIsQuiet: boolean;
};

function posOf(suji: number, dan: number): number {
  if (suji === 0 && dan === 0) return 0;
  return (suji << 4) + dan;
}

function moveKey(te: Te): string {
  return `${te.koma}:${te.from}->${te.to}:${te.promote ? 1 : 0}`;
}

function evalForSideToMove(k: KyokumenImproved): number {
  const evalSente = k.evaluateForOpeningBook();
  return k.teban === SENTE ? evalSente : -evalSente;
}

function staticEvalAfterMove(root: KyokumenImproved, move: Te): number {
  // IMPORTANT:
  // - `move` is expected to be legal for `root` and to have a correct `capture` field.
  // - This function must be allocation-free (called many times during book safety validation).
  root.move(move);
  // `KyokumenImproved.move()` does NOT flip `teban`, so `root.teban` is still the mover here.
  // We want to compare candidate moves from the mover's perspective (not the opponent's),
  // so we intentionally evaluate *without* toggling.
  const score = evalForSideToMove(root);
  root.back(move);
  return score;
}

function openingThresholdByDifficulty(difficulty: Difficulty): number {
  // Max acceptable drop vs the best 1-ply static-eval move from the same position.
  // Lower levels allow more variety; higher levels are stricter.
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

function openingOutlierGapByDifficulty(difficulty: Difficulty): number {
  // If the best 1-ply move is far above the second-best and is *quiet*,
  // it is often an evaluation artifact (e.g. a heuristic overreacting in the opening).
  //
  // In that case we use the second-best score as the baseline so the book doesn't get rejected.
  switch (difficulty) {
    case 'easy':
      return 700;
    case 'medium':
      return 600;
    case 'hard':
      return 550;
    case 'expert':
      return 520;
    case 'master':
      return 500;
  }
}

function varietyMarginByDifficulty(difficulty: Difficulty): number {
  // For variety we pick among candidates that are close to the best-scoring book move.
  // This avoids choosing clearly-inferior opening moves just for randomness.
  switch (difficulty) {
    case 'easy':
      return 140;
    case 'medium':
      return 80;
    case 'hard':
      return 40;
    case 'expert':
    case 'master':
      return 0;
  }
}

function varietyPoolSizeByDifficulty(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'easy':
      return 4;
    case 'medium':
      return 3;
    case 'hard':
      return 2;
    case 'expert':
    case 'master':
      return 1;
  }
}

function isQuiet(te: Te): boolean {
  return te.from !== 0 && te.capture === EMPTY && !te.promote;
}

function scoreResyncMove(k: KyokumenImproved, te: Te): number {
  // A cheap "opening-like" scorer used when:
  // - the exact position is not in the curated book, or
  // - the opponent deviated and all book candidates became unsafe.
  //
  // This is intentionally light and deterministic; the safety filter still applies.
  if (!isQuiet(te)) return -1_000_000_000;

  let score = 0;
  const pieceType = getKomashu(te.koma);
  const fromSuji = te.from >> 4;
  const fromDan = te.from & 0x0f;
  const toSuji = te.to >> 4;
  const toDan = te.to & 0x0f;

  // Pawn one-step push from the starting rank.
  const pawnStartDan = k.teban === SENTE ? 7 : 3;
  const pawnNextDan = k.teban === SENTE ? 6 : 4;
  if (pieceType === FU && fromDan === pawnStartDan && toDan === pawnNextDan) {
    score += 1400;
    // Prefer central pawn pushes slightly.
    score += Math.max(0, 3 - Math.abs(fromSuji - 5)) * 140;
  }

  // Basic development.
  if (pieceType === GI || pieceType === KI) {
    score += 900;
    // Prefer moving off the back rank (tie-break only).
    if (k.teban === SENTE && toDan <= fromDan) score += 100;
    if (k.teban === GOTE && toDan >= fromDan) score += 100;
  }

  // Unblocking long-range pieces.
  if (pieceType === KA || pieceType === HI) score += 650;

  // Rook shift for 振り飛車 directions (very common resync move).
  // SENTE rook starts on 2八, GOTE rook starts on 8二.
  if (pieceType === HI) {
    if (k.teban === SENTE && fromSuji === 2 && fromDan === 8 && toDan === 8) {
      if (toSuji === 6 || toSuji === 5 || toSuji === 4) score += 900;
    }
    if (k.teban === GOTE && fromSuji === 8 && fromDan === 2 && toDan === 2) {
      if (toSuji === 4 || toSuji === 5 || toSuji === 6) score += 900;
    }
  }

  // Prefer not moving the king extremely early in resync (let search handle tactical king moves).
  if (pieceType === OU) score -= 800;

  return score;
}

function pickResyncMove(
  root: KyokumenImproved,
  legal: Te[],
  difficulty: Difficulty,
  baselineScore: number
): Te | null {
  const threshold = openingThresholdByDifficulty(difficulty);

  const candidates = legal
    .map((m) => ({ move: m, heuristic: scoreResyncMove(root, m) }))
    .filter((c) => c.heuristic > -1_000_000_000)
    .sort((a, b) => b.heuristic - a.heuristic)
    .slice(0, 10); // keep it small: this runs before search

  if (candidates.length === 0) return null;

  const scored: Array<{ move: Te; score: number; heuristic: number }> = [];
  for (const c of candidates) {
    const score = staticEvalAfterMove(root, c.move);
    if (score < baselineScore - threshold) continue;
    scored.push({ move: c.move, score, heuristic: c.heuristic });
  }
  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.heuristic !== a.heuristic) return b.heuristic - a.heuristic;
    return moveKey(a.move).localeCompare(moveKey(b.move));
  });

  const topScore = scored[0]!.score;
  const margin = varietyMarginByDifficulty(difficulty);
  const poolSize = varietyPoolSizeByDifficulty(difficulty);
  const pool =
    margin <= 0
      ? scored.slice(0, 1)
      : scored.filter((c) => topScore - c.score <= margin).slice(0, Math.min(poolSize, scored.length));

  return pickDeterministic(pool.length > 0 ? pool : scored.slice(0, 1), root.HashVal).move;
}

// A small curated set of lines. These are intentionally short and "shape oriented".
// The safety validation step prevents obvious blunders when the opponent deviates.
const OPENING_LINES: OpeningLine[] = [
  {
    name: '矢倉 (basic)',
    category: '相居飛車',
    priority: 90,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金 (囲い方向)

      // A few extra "shape" moves so the opening doesn't immediately collapse into random play.
      // We keep these quiet and non-forcing; safety validation will reject them if tactics demand otherwise.
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
    ],
  },
  {
    name: '雁木 (basic)',
    category: '相居飛車',
    priority: 82,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二金
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
    ],
  },
  {
    name: '角換わり (basic)',
    category: '相居飛車',
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
    ],
  },
  {
    // Classic bishop exchange trigger: ☗８八角→☗２二角成
    // This is intentionally short: bishop exchanges often branch quickly into tactics.
    name: '角換わり (Bx22+)',
    category: '相居飛車',
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      // Bishop/rook promotion is forced in this engine when legal.
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 2 }, promote: true }, // ☗２二角成
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } }, // ☖同銀
    ],
  },
  {
    name: '相掛かり (basic)',
    category: '相居飛車',
    priority: 72,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
    ],
  },
  {
    name: '相掛かり (2-6 start)',
    category: '相居飛車',
    priority: 70,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
    ],
  },
  {
    name: '四間飛車 (basic)',
    category: '振り飛車',
    priority: 85,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } }, // ☗６八飛
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩

      // Quick Mino-ish development (美濃の方向性). Stop early; branching is huge after this.
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } }, // ☗５八金左
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
    ],
  },
  {
    name: '四間飛車 (…84 first)',
    category: '振り飛車',
    priority: 76,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } }, // ☗６八飛
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '四間飛車 (2-6 start)',
    category: '振り飛車',
    priority: 74,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } }, // ☗６八飛
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '三間飛車 (basic)',
    category: '振り飛車',
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八飛
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '三間飛車 (2-6 start)',
    category: '振り飛車',
    priority: 72,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八飛
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '相振り飛車 (basic)',
    category: '相振り',
    priority: 74,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 6, dan: 2 } },  // ☖６二飛 (後手四間方向)
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } },  // ☖６四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } }, // ☗６八飛 (先手四間方向)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '中飛車 (basic)',
    category: '振り飛車',
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } }, // ☗５六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 5, dan: 8 } }, // ☗５八飛
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩

      // A small amount of king-side safety so "rook shift and nothing" doesn't look random.
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '中飛車 (mino-ish)',
    category: '振り飛車',
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } }, // ☗５六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 5, dan: 8 } }, // ☗５八飛
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
    ],
  },
  {
    // Another common first move for humans: ☗７六歩 with an early …☖８四歩 response.
    // Adding this increases variety in the AI's replies without forcing risky tactics.
    name: '居飛車 (…84 early)',
    category: '相居飛車',
    priority: 70,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
    ],
  },
  {
    name: '居飛車 (…34 early)',
    category: '相居飛車',
    priority: 68,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
    ],
  },
  {
    name: '右四間飛車 (basic)',
    category: '相居飛車',
    priority: 66,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 4, dan: 7 }, to: { suji: 4, dan: 6 } }, // ☗４六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 4, dan: 6 }, to: { suji: 4, dan: 5 } }, // ☗４五歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 4, dan: 8 } }, // ☗４八飛
      { teban: GOTE, from: { suji: 4, dan: 3 }, to: { suji: 4, dan: 4 } },  // ☖４四歩
    ],
  },
  {
    name: '居飛車 (…54 early)',
    category: '相居飛車',
    priority: 66,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
    ],
  },
  {
    name: '居飛車 (2-6→…54)',
    category: '相居飛車',
    priority: 64,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
    ],
  },
  {
    name: '矢倉 (…84 first)',
    category: '相居飛車',
    priority: 78,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
    ],
  },
  {
    name: '中央歩 (…34)',
    category: '基礎',
    priority: 58,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } }, // ☗５六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
    ],
  },
  {
    name: '３六歩 (basic)',
    category: '基礎',
    priority: 55,
    moves: [
      { teban: SENTE, from: { suji: 3, dan: 7 }, to: { suji: 3, dan: 6 } }, // ☗３六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
    ],
  },
  {
    // A very common beginner-friendly start: central pawn + bishop-side pawn.
    name: '中央歩 (basic)',
    category: '基礎',
    priority: 60,
    moves: [
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } }, // ☗５六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
    ],
  },
  {
    name: '後手ゴキゲン中飛車 (basic)',
    category: '振り飛車',
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 5, dan: 2 } },  // ☖５二飛
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '後手四間飛車 (basic)',
    category: '振り飛車',
    priority: 72,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 6, dan: 2 } },  // ☖６二飛
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } },  // ☖６四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
  {
    name: '後手三間飛車 (basic)',
    category: '振り飛車',
    priority: 70,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 7, dan: 2 } },  // ☖７二飛
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },  // ☖７四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
    ],
  },
];

let bookCache: Map<number, BookCandidate[]> | null = null;
const bestScoreCache = new Map<number, BestScoreInfo>();
const buildMoves = new MoveListImproved();
const runtimeMoves = new MoveListImproved();

function buildBook(): Map<number, BookCandidate[]> {
  // Dedupe candidates per hash by move key (keep the highest priority).
  const map = new Map<number, Map<string, BookCandidate>>();

  for (const line of OPENING_LINES) {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    for (const mv of line.moves) {
      if (k.teban !== mv.teban) {
        throw new Error(`[OpeningBookImproved] line=${line.name} expected teban=${mv.teban} but was ${k.teban}`);
      }

      const from = posOf(mv.from.suji, mv.from.dan);
      const to = posOf(mv.to.suji, mv.to.dan);
      const promote = mv.promote ?? false;

      const koma = from === 0 ? 0 : k.get(from);
      if (from !== 0 && koma === EMPTY) {
        throw new Error(`[OpeningBookImproved] line=${line.name} empty from square: ${mv.from.suji}${mv.from.dan}`);
      }

      // Find the exact legal move object (so capture/promote legality matches engine rules).
      const legal = GenerateMovesImproved.generateLegalMovesPooled(k, buildMoves);
      const found =
        legal.find((t) => t.from === from && t.to === to && t.promote === promote && t.koma === koma) ??
        null;

      if (!found) {
        throw new Error(
          `[OpeningBookImproved] illegal book move in line=${line.name}: from=${from} to=${to} promote=${promote}`
        );
      }

      const hash = k.HashVal;
      const cand: BookCandidate = { move: found.clone(), priority: line.priority, lineName: line.name };
      const key = moveKey(cand.move);
      const bucket = map.get(hash) ?? new Map<string, BookCandidate>();
      const prev = bucket.get(key);
      if (!prev || cand.priority > prev.priority) bucket.set(key, cand);
      map.set(hash, bucket);

      k.move(found);
      k.toggleTeban();
    }
  }

  const out = new Map<number, BookCandidate[]>();
  for (const [hash, bucket] of map.entries()) {
    out.set(hash, [...bucket.values()]);
  }
  return out;
}

function getBook(): Map<number, BookCandidate[]> {
  if (!bookCache) bookCache = buildBook();
  return bookCache;
}

function pickDeterministic<T>(candidates: T[], seed: number): T {
  // Deterministic "random" pick without maintaining global RNG state.
  const s = (seed >>> 0) ^ ((seed >>> 16) | 0);
  const idx = candidates.length <= 1 ? 0 : s % candidates.length;
  return candidates[idx]!;
}

function looksLikeOpening(k: KyokumenImproved): boolean {
  // Cheap phase proxy: few traded pieces (low hand counts) and kings not captured.
  if (k.kingS <= 0 || k.kingG <= 0) return false;
  let hand = 0;
  for (let i = 0; i < k.hand.length; i++) hand += k.hand[i] | 0;
  return hand <= 2;
}

/**
 * Returns a safe opening-book move for the current position, or `null` if:
 * - position is not in the book
 * - it's not the opening (by a simple phase proxy)
 * - the side to move is in check
 * - all book candidates fail safety validation
 */
export function getOpeningMoveImproved(
  k: KyokumenImproved,
  difficulty: Difficulty,
  options: { debug?: boolean } = {}
): Te | null {
  if (!looksLikeOpening(k)) return null;
  if (GenerateMovesImproved.isKingInCheck(k, k.teban)) return null;

  // Validate candidates against current legal moves (the opponent may have deviated).
  const legal = GenerateMovesImproved.generateLegalMovesPooled(k, runtimeMoves);
  if (legal.length === 0) return null;
  const legalByKey = new Map<string, Te>();
  for (const m of legal) legalByKey.set(moveKey(m), m);

  // Compute best static eval among *all* legal moves (for safety threshold).
  // Cache per-position because the same early hashes reoccur across games.
  const root = k.clone();
  let bestInfo = bestScoreCache.get(k.HashVal);
  if (!bestInfo) {
    let bestScore = -Infinity;
    let secondBestScore = -Infinity;
    let bestIsQuiet = false;
    for (const m of legal) {
      const score = staticEvalAfterMove(root, m);
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestIsQuiet = m.from !== 0 && m.capture === EMPTY && !m.promote;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
    bestInfo = { bestScore, secondBestScore, bestIsQuiet };
    bestScoreCache.set(k.HashVal, bestInfo);
  }

  const threshold = openingThresholdByDifficulty(difficulty);
  const outlierGap = openingOutlierGapByDifficulty(difficulty);
  const baselineScore =
    bestInfo.bestIsQuiet &&
    Number.isFinite(bestInfo.secondBestScore) &&
    bestInfo.bestScore - bestInfo.secondBestScore >= outlierGap
      ? bestInfo.secondBestScore
      : bestInfo.bestScore;

  const candidates = getBook().get(k.HashVal);
  const filtered: BookCandidate[] = [];
  if (candidates && candidates.length > 0) {
    for (const c of candidates) {
      const m = legalByKey.get(moveKey(c.move));
      if (!m) continue;
      // Keep the `Te` reference from `legal` (allocation-free); we clone only for the return value.
      filtered.push({ ...c, move: m });
    }
  }

  // Evaluate book candidates and keep the ones close enough to the best move.
  const scored: Array<BookCandidate & { score: number }> = [];
  for (const c of filtered) {
    const score = staticEvalAfterMove(root, c.move);
    if (score < baselineScore - threshold) continue;
    scored.push({ ...c, score });
  }

  // If the current hash isn't in the book (or all candidates became unsafe), try a "resync" move.
  // This keeps openings coherent even after small opponent deviations.
  if (scored.length === 0) {
    const resync = pickResyncMove(root, legal, difficulty, baselineScore);
    if (!resync) return null;
    if (options.debug) {
      console.log(
        `[OpeningBookImproved] resync picked=${resync.toString()} baseline=${baselineScore} best=${bestInfo.bestScore}`
      );
    }
    return resync.clone();
  }

  // Selection strategy:
  // - Master/Expert: pick the best score (tie-break by priority)
  // - Others: pick a deterministic "random" candidate among the near-best moves (variety without throwing strength)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.lineName.localeCompare(b.lineName);
  });

  const topScore = scored[0]!.score;
  const margin = varietyMarginByDifficulty(difficulty);
  const poolSize = varietyPoolSizeByDifficulty(difficulty);
  const pool =
    margin <= 0
      ? scored.slice(0, 1)
      : scored.filter((c) => topScore - c.score <= margin).slice(0, Math.min(poolSize, scored.length));
  const picked = pickDeterministic(pool.length > 0 ? pool : scored.slice(0, 1), k.HashVal);

  if (options.debug) {
    const pieceType = getKomashu(picked.move.koma);
    const pieceName =
      pieceType === FU ? 'FU'
        : pieceType === KY ? 'KY'
          : pieceType === KE ? 'KE'
            : pieceType === GI ? 'GI'
              : pieceType === KI ? 'KI'
                : pieceType === KA ? 'KA'
                  : pieceType === HI ? 'HI'
                    : pieceType === OU ? 'OU'
                      : String(pieceType);
    console.log(
      `[OpeningBookImproved] ${picked.lineName} picked=${picked.move.toString()} piece=${pieceName} score=${picked.score} baseline=${baselineScore} best=${bestInfo.bestScore}`
    );
  }

  return picked.move.clone();
}
