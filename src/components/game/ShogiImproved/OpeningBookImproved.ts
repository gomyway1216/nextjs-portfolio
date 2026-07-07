import { Difficulty } from '../common/types';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { InitialPositionImproved } from './InitialPositionImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { MoveListImproved } from './MoveListImproved';
import { EMPTY, FU, GI, GOTE, HI, KA, KE, KI, KY, OU, SENTE, Te, getKomashu, komaValue } from './types';

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

export type BookMove = {
  teban: number; // SENTE or GOTE
  from: { suji: number; dan: number }; // use {0,0} for drops (with `drop` set to the piece type)
  to: { suji: number; dan: number };
  promote?: boolean;
  drop?: number; // piece type (FU/KY/KE/GI/KI/KA/HI) for drop moves; teban is OR'ed in automatically
};

export type OpeningLine = {
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

function staticEvalAfterMove(root: KyokumenImproved, move: Te, evalBeforeMove: number): number {
  // IMPORTANT:
  // - `move` is expected to be legal for `root` and to have a correct `capture` field.
  // - `evalBeforeMove` is `evalForSideToMove(root)` for the *unmoved* root (computed once per
  //   position by the caller — it is identical for every move from the same root).
  // - This function must be allocation-free (called many times during book safety validation).
  root.move(move);
  // `KyokumenImproved.move()` does NOT flip `teban`, so `root.teban` is still the mover here.
  // We want to compare candidate moves from the mover's perspective (not the opponent's),
  // so we intentionally evaluate *without* toggling.
  let score = evalForSideToMove(root);

  // Hanging-piece correction (SEE-lite):
  // A pure 1-ply static eval loves moves like a bishop grabbing a defended pawn deep in enemy camp —
  // the promotion/positional bonuses show up but the immediate recapture does not. That inflates the
  // "best move" baseline and can reject every (correct) quiet book move. Approximate the recapture here.
  //
  // Beyond subtracting the material value of the doomed piece, we also clamp the score to a
  // material-only estimate based on the pre-move eval. Without the clamp, moves like ▲２二角成
  // (an even bishop trade) still scored ~+2400 because the promotion/positional bonuses of the
  // about-to-be-recaptured horse stayed in the eval — which nuked the baseline and silently
  // disabled the book in every position where the bishop diagonal was open.
  const moved = root.get(move.to);
  const movedValue = Math.abs(komaValue[moved]) | 0;
  if (movedValue > 0) {
    const enemyLeastAttacker = GenerateMovesImproved.getLeastAttackerValue(root, move.to, root.teban);
    if (Number.isFinite(enemyLeastAttacker)) {
      const selfLeastDefender = GenerateMovesImproved.getLeastAttackerValue(
        root,
        move.to,
        root.teban === SENTE ? GOTE : SENTE
      );
      const capturedValue = Math.abs(komaValue[move.capture]) | 0;
      // For the material clamp, value the doomed piece by its PRE-promotion identity: when a
      // bishop promotes and is immediately recaptured (▲２二角成△同銀 / △７七角成▲同銀), the
      // promotion never "cashes in" — it is a plain bishop-for-bishop trade, not a horse loss.
      const movedTradeValue = Math.abs(komaValue[move.koma]) | 0;
      if (!Number.isFinite(selfLeastDefender)) {
        // Undefended and attacked: assume it simply gets taken.
        // Net outcome ≈ what we captured minus what we lose, on top of the pre-move eval.
        score = Math.min(score - movedValue, evalBeforeMove + capturedValue - movedTradeValue);
      } else if ((enemyLeastAttacker | 0) + 150 < movedValue) {
        // Defended, but a clearly cheaper piece can start the exchange: assume a losing trade
        // (we lose the moved piece, they lose their cheapest attacker).
        score = Math.min(
          score - (movedValue - (enemyLeastAttacker | 0)),
          evalBeforeMove + capturedValue - movedTradeValue + (enemyLeastAttacker | 0)
        );
      }
    }
  }

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

// A small curated set of lines. These are intentionally short and "shape oriented".
// The safety validation step prevents obvious blunders when the opponent deviates.
// Exported for validation tooling (scripts/shogi-yaneuraou-book-check.ts etc.) — the runtime
// entry point is `getOpeningMoveImproved` below, which reads the prebuilt hash map instead.
export const OPENING_LINES: OpeningLine[] = [
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

      // IMPORTANT move order (YaneuraOu-verified): ☗６六歩で角道を止めてから☗７八銀。
      // 旧手順（☗７八銀→☗６六歩）は７八銀の瞬間に☖８八角成で角をタダ取りされる大悪手だった
      // （７九銀が８八の唯一の受けで、それが７八に上がると８八が浮く）。
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七銀 (矢倉の骨格)
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } },  // ☖６四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲６八金を７八へ寄せ、△７四歩から▲２四歩の飛先交換まで。
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八金 (右金を寄せて囲いを整える)
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },  // ☖７四歩
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
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
      // ☗６六歩→☗７八銀の順 (矢倉basicと同じ理由: 先に７八銀は☖８八角成でタダ取りされる)。
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八銀 (雁木へ)
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二銀
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角
      // YaneuraOu depth18 最善手による延長 (2026-07): △８五歩〜▲４六歩、△３三銀〜▲６七銀の雁木の骨格。
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 4, dan: 7 }, to: { suji: 4, dan: 6 } }, // ☗４六歩 (雁木の形)
      { teban: GOTE, from: { suji: 3, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三銀 (雁木を組む)
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 6, dan: 7 } }, // ☗６七銀 (雁木の骨格)
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
      // YaneuraOu depth18 最善手による延長 (2026-07): 飛先交換。
      // (居飛車 (…84 early)/(…34 early) も同一局面に合流するため、この延長は共有される。)
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金（６九の右金）で飛車を安定させ、△８六歩▲同歩△同飛のお返し交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金 (右金を上がって飛車を安定)
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩 (お返しの飛先交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } }, // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },  // ☖同飛
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
    // 対原始棒銀: ▲２五歩には△３三角、銀の進軍には△２二銀/△３二金、▲１五銀は△１四歩で防ぐ。
    name: '対原始棒銀 (３三角型)',
    category: '対棒銀',
    priority: 88,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三角
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } },  // ☖２二銀
      { teban: SENTE, from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 7 } }, // ☗２七銀
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      // 旧９手目▲２六銀 (原始棒銀の継続) は depth18/22 で最善と 200cp 超離れるため、
      // エンジン最善の▲３六銀 (銀を中央寄りに使う) ルートへ差し替え (2026-07)。
      // △３三角/△２二銀/△３二金という対棒銀の受けの骨格はそのまま残る。
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 3, dan: 6 } }, // ☗３六銀
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 3, dan: 6 }, to: { suji: 4, dan: 5 } }, // ☗４五銀 (３四を狙う)
      { teban: GOTE, from: { suji: 3, dan: 4 }, to: { suji: 3, dan: 5 } },  // ☖３五歩 (かわす)
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金で整えてから▲３四銀と進出、△４四角と展開。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 4, dan: 5 }, to: { suji: 3, dan: 4 } }, // ☗３四銀 (３四へ進出。３五歩とにらみ合い)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 4, dan: 4 } },  // ☖４四角 (角を展開し攻めに利かす)
    ],
  },
  {
    // (旧「相掛かり (2-6 start)」は本ラインと完全同一手順の重複だったため削除。)
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
      // YaneuraOu depth18 最善手による延長 (2026-07): 飛先交換まで。
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金 (横歩と２三を受ける)
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金で飛車を安定させ、△８六歩▲同歩△同飛のお返し交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩 (お返しの飛先交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } }, // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },  // ☖同飛
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
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角 (飛先を受ける)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } }, // ☗１六歩
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },  // ☖１四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八銀で美濃の骨格を整え、双方の駒組み。
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },  // ☖７四歩
      { teban: SENTE, from: { suji: 3, dan: 7 }, to: { suji: 3, dan: 6 } }, // ☗３六歩
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },  // ☖５二金右
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
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } }, // ☗１六歩
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },  // ☖１四歩
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀 (美濃へ)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７七角で飛先を受け、△３二玉〜▲７八銀で相互に囲う。
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角 (飛先を受ける)
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二玉 (舟囲い)
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀 (美濃を厚くする)
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },  // ☖７四歩
    ],
  },
  {
    // ▲２六歩△３四歩▲７六歩の出だしから飛先交換へ（YaneuraOu検証済み: 全手が depth18 の最善手）。
    // 旧「四間飛車/三間飛車 (2-6 start)」は▲２六歩＋角道オープンのまま飛車を振る形で、
    // ▲６八飛/▲７八飛がエンジン最善と200cp以上離れる悪手だったため本ラインに置き換えた。
    name: '横歩取り模様 (basic)',
    category: '相居飛車',
    priority: 74,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩 (お返しの交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } }, // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },  // ☖同飛 (横歩取り基本図の直前)
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲３四飛の横歩取り、△３三角▲５八玉△５二玉。
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 3, dan: 4 } }, // ☗３四飛 (横歩を取る)
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三角 (飛車取り)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 5, dan: 8 } }, // ☗５八玉 (中住まいへ)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 5, dan: 2 } },  // ☖５二玉
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７五歩〜▲７六飛の石田流志向。
      { teban: SENTE, from: { suji: 7, dan: 6 }, to: { suji: 7, dan: 5 } }, // ☗７五歩 (石田流)
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 7, dan: 6 } }, // ☗７六飛 (浮き飛車)
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },  // ☖１四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲１六歩〜▲３八銀の美濃づくり、△３二玉〜△６四歩。
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } }, // ☗１六歩
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二玉
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀 (美濃へ)
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } },  // ☖６四歩
    ],
  },
  {
    // 相振り飛車の基本: 先手三間 vs 後手三間。両者とも美濃へ。
    name: '相振り飛車 (相三間)',
    category: '相振り',
    priority: 74,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩 (角道を止めて振り飛車宣言)
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二飛 (後手三間飛車)
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八飛 (先手三間飛車)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二玉
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      // 旧８手目△７二玉は△３五歩 (石田流の伸び) に depth18 で 200cp 超劣るため、
      // ほぼ互角次善 (差1cp) の△７二銀→△７一玉ルートに変更 (YaneuraOu検証, 2026-07)。
      // ▲２八玉/△８二玉まで進める旧形は３筋の歩交換を軽視しすぎで検証を通らず、11手で打ち切る。
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },  // ☖７二銀
      { teban: SENTE, from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 8 } }, // ☗３八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 1 } },  // ☖７一玉
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八銀
      // YaneuraOu depth18 最善手による延長 (2026-07): 後手が△３五歩〜△３六歩と３筋の位を取り、▲同歩と応じる。
      { teban: GOTE, from: { suji: 3, dan: 4 }, to: { suji: 3, dan: 5 } },  // ☖３五歩 (石田流の位取り)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 2, dan: 8 } }, // ☗２八銀 (３九の右銀を美濃の壁に。玉は既に３八)
      { teban: GOTE, from: { suji: 3, dan: 5 }, to: { suji: 3, dan: 6 } },  // ☖３六歩 (位を伸ばす)
      { teban: SENTE, from: { suji: 3, dan: 7 }, to: { suji: 3, dan: 6 } }, // ☗同歩
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲５五歩△同歩の交換から▲７六歩で角道を開き、▲５五角と歩を回収。
      { teban: SENTE, from: { suji: 5, dan: 6 }, to: { suji: 5, dan: 5 } }, // ☗５五歩 (５筋交換)
      { teban: GOTE, from: { suji: 5, dan: 4 }, to: { suji: 5, dan: 5 } },  // ☖同歩
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩 (角道を開ける)
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },  // ☖５二金右
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 5, dan: 5 } }, // ☗５五角 (角で５五の歩を回収)
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二玉
    ],
  },
  {
    // 旧「中飛車 (mino-ish)」を改修 (2026-07): 旧８手目△３二金は△８五歩 (エンジン最善+240cp) を
    // 逃す手だったため、△８五歩以降を YaneuraOu depth18 最善手で差し替え。▲９六歩〜▲９七角で
    // ８六を受け、５筋の位を交換するのが中飛車らしい本筋。
    name: '中飛車 (５筋交換)',
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
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩 (飛先を伸ばすのが最善)
      { teban: SENTE, from: { suji: 9, dan: 7 }, to: { suji: 9, dan: 6 } }, // ☗９六歩 (▲９七角の受けを用意)
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二玉
      { teban: SENTE, from: { suji: 5, dan: 6 }, to: { suji: 5, dan: 5 } }, // ☗５五歩 (５筋交換)
      { teban: GOTE, from: { suji: 5, dan: 4 }, to: { suji: 5, dan: 5 } },  // ☖同歩
      { teban: SENTE, from: { suji: 5, dan: 8 }, to: { suji: 5, dan: 5 } }, // ☗同飛
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜▲２四歩の飛先交換、△８六歩のお返し。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩 (お返しの交換)
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金、△８六歩▲同歩△同飛のお返し交換から▲２四歩の交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } }, // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },  // ☖同飛
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
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
      // 旧８手目△４四歩は▲同角/▲同歩で -2100cp 級の大悪手 (YaneuraOu検証)。△３二金が最善。
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 4, dan: 5 }, to: { suji: 4, dan: 4 } }, // ☗４四歩 (位を確保)
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },  // ☖５二金
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲４三歩成△同金の突破から角交換 ▲２二角成△同銀。
      { teban: SENTE, from: { suji: 4, dan: 4 }, to: { suji: 4, dan: 3 }, promote: true }, // ☗４三歩成 (と金で拠点)
      { teban: GOTE, from: { suji: 5, dan: 2 }, to: { suji: 4, dan: 3 } },  // ☖同金
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 2 }, promote: true }, // ☗２二角成 (角交換)
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } },  // ☖同銀
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜▲２四歩の飛先交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜▲２四歩の飛先交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
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
      // ☗６六歩→☗７八銀の順 (矢倉basicと同じ理由)。ここから先は矢倉basicと同一局面に合流する。
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２五歩△８五歩▲７七角の飛先受け、△４四角の展開。
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角 (飛先を受ける)
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 4, dan: 4 } },  // ☖４四角 (角を展開)
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２五歩△８五歩から▲２四歩の飛先交換。
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２五歩△８五歩▲７八金の駒組み。
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金 (飛先を安定)
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
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
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲７八金〜△８六歩▲同歩△同飛のお返し交換。
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩 (お返しの飛先交換)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } }, // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },  // ☖同飛
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
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲２四歩の交換には△同歩▲同飛△３二金。
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      // YaneuraOu depth18 最善手による延長 (2026-07): ▲９六歩〜▲６八玉の駒組み、後手は△６二銀〜△１四歩。
      { teban: SENTE, from: { suji: 9, dan: 7 }, to: { suji: 9, dan: 6 } }, // ☗９六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八玉
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },  // ☖１四歩
    ],
  },
  {
    // 後手四間飛車の正調は△４二飛（旧「△６二飛」は右四間で誤り）。持久戦模様の駒組み。
    name: '後手四間飛車 (basic)',
    category: '振り飛車',
    priority: 72,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 4, dan: 3 }, to: { suji: 4, dan: 4 } },  // ☖４四歩 (角道を止める)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八銀
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 4, dan: 2 } },  // ☖４二飛 (四間飛車)
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } }, // ☗５六歩
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二銀
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },  // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } }, // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },  // ☖８二玉 (美濃)
    ],
  },
  {
    // 後手三間飛車の正調は△３二飛（旧「△７二飛」は誤り）。▲２五歩には△３三角が必須の一手。
    name: '後手三間飛車 (basic)',
    category: '振り飛車',
    priority: 70,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二飛 (三間飛車)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三角 (飛車先を受ける)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八銀
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二玉
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },  // ☖７二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八玉
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },  // ☖８二玉 (美濃)
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } }, // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },  // ☖７二銀
    ],
  },
  // ============================================================================
  // 検証済み定跡ライン追加分 (2026-07)
  // - 相掛かり飛車先交換（△２三歩と正しく受け、△８六歩の交換をお返しする完全手順）
  // - 角換わり基本（▲７八金△３二金型の▲２四歩交換対応 / ▲７七角→▲８八銀の本手順）
  // - 四間飛車 vs 居飛車急戦（△６二玉→７二玉→８二玉の美濃完成まで）
  // - ゴキゲン中飛車 / 三間飛車の主要形
  // ============================================================================
  {
    // 相掛かり・飛車先交換型（引き飛車）。▲２四歩△同歩▲同飛には△２三歩が正しい受け。
    // ▲７八金／△３二金を先に入れるのが本定跡（8八/2二への角打ち・▲７七角の両取り筋を消す）。
    name: '相掛かり (飛先交換・引き飛車)',
    category: '相居飛車',
    priority: 86,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛車先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU }, // ☖２三歩 (正しい受け)
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 8 } }, // ☗２八飛 (引き飛車)
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩 (交換をお返し)
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } }, // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },  // ☖同飛
      { teban: SENTE, from: { suji: 0, dan: 0 }, to: { suji: 8, dan: 7 }, drop: FU }, // ☗８七歩
      { teban: GOTE, from: { suji: 8, dan: 6 }, to: { suji: 8, dan: 4 } },  // ☖８四飛 (浮き飛車: ４段目の横利きで２四をケア)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩 (３四は８四飛の横利きが守る)
    ],
  },
  {
    // 相掛かり・飛車先交換型（浮き飛車）。相浮き飛車の基本形。
    name: '相掛かり (飛先交換・浮き飛車)',
    category: '相居飛車',
    priority: 82,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU }, // ☖２三歩
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 6 } }, // ☗２六飛 (浮き飛車)
      // 旧手順の△８六歩▲同歩△同飛は、▲２六飛の横利きで△同飛が丸ごと取られる大悪手だった
      // (▲7六歩が入っていないので6段目が素通し)。YaneuraOu depth18 最善手で差し替え (2026-07)。
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },  // ☖７二銀
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 3, dan: 6 } }, // ☗３六飛 (横歩を狙う)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
      { teban: SENTE, from: { suji: 3, dan: 6 }, to: { suji: 3, dan: 4 } }, // ☗３四飛 (横歩取り)
    ],
  },
  {
    // 角換わりの本手順: ▲７七角→▲８八銀と組み替えてから△７七角成▲同銀。
    name: '角換わり (本組・７七角型)',
    category: '相居飛車',
    priority: 84,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角 (８六の交換を受ける)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 8, dan: 8 } }, // ☗８八銀
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 7, dan: 7 }, promote: true }, // ☖７七角成
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗同銀
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金 (角打ちに備える)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } },  // ☖２二銀
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三銀 (基本形)
      // YaneuraOu depth18 最善手による延長 (2026-07)。
      { teban: SENTE, from: { suji: 4, dan: 7 }, to: { suji: 4, dan: 6 } }, // ☗４六歩 (腰掛け銀準備)
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },  // ☖７四歩
      { teban: SENTE, from: { suji: 9, dan: 7 }, to: { suji: 9, dan: 6 } }, // ☗９六歩 (端の突き合い)
      { teban: GOTE, from: { suji: 1, dan: 3 }, to: { suji: 1, dan: 4 } },  // ☖１四歩
    ],
  },
  {
    // 角換わり模様（▲７八金△３二金型）で▲２四歩と来た場合の交換対応。
    // △同歩▲同飛△２三歩と受け、△８六歩の交換をお返しして互角の分かれ。
    name: '角換わり (７八金型・２四歩交換対応)',
    category: '相居飛車',
    priority: 79,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金 (８八を受ける)
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金 (２二を受ける)
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU }, // ☖２三歩
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 8 } }, // ☗２八飛
      { teban: GOTE, from: { suji: 8, dan: 5 }, to: { suji: 8, dan: 6 } },  // ☖８六歩
      { teban: SENTE, from: { suji: 8, dan: 7 }, to: { suji: 8, dan: 6 } }, // ☗同歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 8, dan: 6 } },  // ☖同飛
      { teban: SENTE, from: { suji: 0, dan: 0 }, to: { suji: 8, dan: 7 }, drop: FU }, // ☗８七歩
      { teban: GOTE, from: { suji: 8, dan: 6 }, to: { suji: 8, dan: 2 } },  // ☖８二飛
    ],
  },
  {
    // 後手四間飛車 vs 居飛車急戦の基本形。▲２五歩には△３三角、玉は△６二玉→７二玉→８二玉で美濃完成。
    name: '後手四間飛車 (vs急戦・美濃完成)',
    category: '振り飛車',
    priority: 84,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 4, dan: 3 }, to: { suji: 4, dan: 4 } },  // ☖４四歩 (角道を止める)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三角 (飛車先を受ける)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八銀
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 4, dan: 2 } },  // ☖４二飛 (四間飛車)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八玉 (舟囲いへ)
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },  // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } }, // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },  // ☖８二玉 (美濃完成)
      { teban: SENTE, from: { suji: 5, dan: 7 }, to: { suji: 5, dan: 6 } }, // ☗５六歩
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },  // ☖７二銀
    ],
  },
  {
    // 先手四間飛車 vs 後手居飛車急戦。△８五歩には▲７七角。玉は▲４八→３八→２八で美濃完成。
    name: '四間飛車 (先手・美濃完成)',
    category: '振り飛車',
    priority: 83,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩 (角道を止める)
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 6, dan: 8 } }, // ☗６八飛 (四間飛車)
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角 (飛車先を受ける)
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二玉 (舟囲い)
      { teban: SENTE, from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 8 } }, // ☗３八玉
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },  // ☖５二金右
      { teban: SENTE, from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 8 } }, // ☗２八玉 (美濃)
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀 (急戦準備)
    ],
  },
  {
    // 後手ゴキゲン中飛車の本手順: △３四歩→△５四歩→△５二飛→△５五歩位取り→美濃。
    name: 'ゴキゲン中飛車 (後手・本形)',
    category: '振り飛車',
    priority: 82,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 5, dan: 2 } },  // ☖５二飛 (ゴキゲン中飛車)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八銀
      { teban: GOTE, from: { suji: 5, dan: 4 }, to: { suji: 5, dan: 5 } },  // ☖５五歩 (位取り)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },  // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } }, // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },  // ☖８二玉 (美濃)
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },  // ☖７二銀
    ],
  },
  {
    // ゴキゲン中飛車 vs 丸山ワクチン（▲２二角成△同銀）。△３三銀と上がって美濃へ。
    name: 'ゴキゲン中飛車 (vs丸山ワクチン)',
    category: '振り飛車',
    priority: 76,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 2 }, to: { suji: 5, dan: 2 } },  // ☖５二飛
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 2, dan: 2 }, promote: true }, // ☗２二角成 (丸山ワクチン)
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 2, dan: 2 } },  // ☖同銀
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八銀
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三銀 (基本形)
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 6, dan: 8 } }, // ☗６八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二玉
      { teban: SENTE, from: { suji: 6, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八玉
      { teban: GOTE, from: { suji: 6, dan: 2 }, to: { suji: 7, dan: 2 } },  // ☖７二玉
      { teban: SENTE, from: { suji: 4, dan: 9 }, to: { suji: 5, dan: 8 } }, // ☗５八金右
      { teban: GOTE, from: { suji: 7, dan: 2 }, to: { suji: 8, dan: 2 } },  // ☖８二玉 (美濃)
    ],
  },
  {
    // 先手三間飛車の美濃完成形。△８五歩には▲７七角。
    name: '三間飛車 (先手・美濃完成)',
    category: '振り飛車',
    priority: 79,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 7, dan: 8 } }, // ☗７八飛 (三間飛車)
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩 (角道を止める)
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 5, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八玉
      { teban: GOTE, from: { suji: 5, dan: 1 }, to: { suji: 4, dan: 2 } },  // ☖４二玉
      { teban: SENTE, from: { suji: 4, dan: 8 }, to: { suji: 3, dan: 8 } }, // ☗３八玉
      { teban: GOTE, from: { suji: 4, dan: 2 }, to: { suji: 3, dan: 2 } },  // ☖３二玉
      { teban: SENTE, from: { suji: 3, dan: 8 }, to: { suji: 2, dan: 8 } }, // ☗２八玉 (美濃)
      { teban: GOTE, from: { suji: 6, dan: 1 }, to: { suji: 5, dan: 2 } },  // ☖５二金右
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角 (飛車先を受ける)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
    ],
  },
  {
    // 角道相掛かり（▲７七角△３四歩▲６六歩型）。この▲６六歩局面は従来定跡外で、
    // NNUEが△８四飛（浮き飛車, YaneuraOu depth20で約−126cp・最善−23cpから100cp以上劣る弱手）
    // を指していた。本手順は△３三角と収める本筋。YaneuraOu depth20 の最善手で各手を検証 (2026-07)。
    name: '角道相掛かり (▲６六歩・△３三角型)',
    category: '相居飛車',
    priority: 85,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角 (８六交換を受ける)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩 (角道を止める)
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三角 (最善: △８四飛の浮き飛車は弱手)
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 4, dan: 8 } }, // ☗４八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 7, dan: 3 }, to: { suji: 7, dan: 4 } },  // ☖７四歩
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 5, dan: 3 }, to: { suji: 5, dan: 4 } },  // ☖５四歩
      { teban: SENTE, from: { suji: 7, dan: 8 }, to: { suji: 6, dan: 7 } }, // ☗６七銀
    ],
  },
  {
    // 角道相掛かり（▲６六歩型）で後手が△３二銀と上がる変化。▲６六歩局面で△８四飛を避ける
    // もう一つの本筋。上記△３三角型と同じ▲６六歩局面(後手番)を別候補として供給する。
    // YaneuraOu depth20 の最善手で各手を検証 (2026-07)。
    name: '角道相掛かり (▲６六歩・△３二銀型)',
    category: '相居飛車',
    priority: 80,
    moves: [
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 8, dan: 8 }, to: { suji: 7, dan: 7 } }, // ☗７七角
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩
      { teban: SENTE, from: { suji: 6, dan: 7 }, to: { suji: 6, dan: 6 } }, // ☗６六歩
      { teban: GOTE, from: { suji: 3, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二銀 (△８四飛を避けるもう一つの本筋)
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 2, dan: 2 }, to: { suji: 3, dan: 3 } },  // ☖３三角
      { teban: SENTE, from: { suji: 7, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八銀
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 6, dan: 2 } },  // ☖６二銀
    ],
  },
  {
    // 相掛かり・飛車先交換（▲２六飛の浮き飛車）から▲３八銀と上がった局面。▲７六歩を保留した
    // 相掛かりで、この▲３八銀局面(後手番)は従来定跡外でNNUEが弱手を指していた。△３四歩と伸ばして
    // 局面を落ち着かせる本筋。YaneuraOu depth20 の最善手で各手を検証 (2026-07)。
    name: '相掛かり (▲２六飛・▲３八銀型)',
    category: '相居飛車',
    priority: 81,
    moves: [
      { teban: SENTE, from: { suji: 2, dan: 7 }, to: { suji: 2, dan: 6 } }, // ☗２六歩
      { teban: GOTE, from: { suji: 8, dan: 3 }, to: { suji: 8, dan: 4 } },  // ☖８四歩
      { teban: SENTE, from: { suji: 2, dan: 6 }, to: { suji: 2, dan: 5 } }, // ☗２五歩
      { teban: GOTE, from: { suji: 8, dan: 4 }, to: { suji: 8, dan: 5 } },  // ☖８五歩
      { teban: SENTE, from: { suji: 6, dan: 9 }, to: { suji: 7, dan: 8 } }, // ☗７八金 (８八を受ける)
      { teban: GOTE, from: { suji: 4, dan: 1 }, to: { suji: 3, dan: 2 } },  // ☖３二金 (２二を受ける)
      { teban: SENTE, from: { suji: 2, dan: 5 }, to: { suji: 2, dan: 4 } }, // ☗２四歩 (飛車先交換)
      { teban: GOTE, from: { suji: 2, dan: 3 }, to: { suji: 2, dan: 4 } },  // ☖同歩
      { teban: SENTE, from: { suji: 2, dan: 8 }, to: { suji: 2, dan: 4 } }, // ☗同飛
      { teban: GOTE, from: { suji: 0, dan: 0 }, to: { suji: 2, dan: 3 }, drop: FU }, // ☖２三歩 (正しい受け)
      { teban: SENTE, from: { suji: 2, dan: 4 }, to: { suji: 2, dan: 6 } }, // ☗２六飛 (浮き飛車)
      { teban: GOTE, from: { suji: 7, dan: 1 }, to: { suji: 7, dan: 2 } },  // ☖７二銀
      { teban: SENTE, from: { suji: 3, dan: 9 }, to: { suji: 3, dan: 8 } }, // ☗３八銀 (この局面が従来定跡外だった)
      { teban: GOTE, from: { suji: 3, dan: 3 }, to: { suji: 3, dan: 4 } },  // ☖３四歩 (最善: 局面を落ち着かせる)
      { teban: SENTE, from: { suji: 7, dan: 7 }, to: { suji: 7, dan: 6 } }, // ☗７六歩
      { teban: GOTE, from: { suji: 6, dan: 3 }, to: { suji: 6, dan: 4 } },  // ☖６四歩
      { teban: SENTE, from: { suji: 1, dan: 7 }, to: { suji: 1, dan: 6 } }, // ☗１六歩
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

      if (from === 0 && !mv.drop) {
        throw new Error(`[OpeningBookImproved] line=${line.name} drop move without \`drop\` piece type`);
      }
      // For drops, `Te.koma` is the dropped piece OR'ed with the side to move.
      const koma = from === 0 ? (mv.drop! | mv.teban) : k.get(from);
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
  //
  // NOTE: the limit must accommodate real joseki exchanges. During the 相掛かり/角換わり
  // rook-file exchange (▲2四歩△同歩▲同飛△2三歩 … △8六歩▲同歩△同飛▲8七歩) the combined
  // hand count transiently reaches 3, and a bishop trade adds 2 more. Anything still in book
  // range is by definition "opening"; positions outside the book return null right after anyway.
  if (k.kingS <= 0 || k.kingG <= 0) return false;
  let hand = 0;
  for (let i = 0; i < k.hand.length; i++) hand += k.hand[i] | 0;
  return hand <= 4;
}

/**
 * Book usage counters for offline tooling (e.g. scripts/shogi-ai-match.ts hit-rate reporting).
 * `probes` counts opening-phase lookups (past the cheap phase/check gates); `hits` counts
 * returned book moves. Production code never reads these.
 */
export const openingBookStats = { probes: 0, hits: 0 };

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
  openingBookStats.probes++;

  // Out of book? Bail out before doing any eval work (this is the common case).
  const candidates = getBook().get(k.HashVal);
  if (!candidates || candidates.length === 0) return null;

  // Validate candidates against current legal moves (the opponent may have deviated).
  const legal = GenerateMovesImproved.generateLegalMovesPooled(k, runtimeMoves);
  if (legal.length === 0) return null;
  const legalByKey = new Map<string, Te>();
  for (const m of legal) legalByKey.set(moveKey(m), m);

  // Compute best static eval among *all* legal moves (for safety threshold).
  // Cache per-position because the same early hashes reoccur across games.
  const root = k.clone();
  const evalBeforeMove = evalForSideToMove(root);
  let bestInfo = bestScoreCache.get(k.HashVal);
  if (!bestInfo) {
    let bestScore = -Infinity;
    let secondBestScore = -Infinity;
    let bestIsQuiet = false;
    for (const m of legal) {
      const score = staticEvalAfterMove(root, m, evalBeforeMove);
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
  // Baseline selection:
  // - If the best 1-ply move is a capture/promotion, it represents real tactics — use it.
  // - If the best 1-ply move is *quiet*, a large lead over the second-best move is almost always
  //   an evaluation artifact (e.g. ▲6六角 style "active-looking" moves scoring +500 while every
  //   real joseki move scores ~+150). In-book positions are exact-hash joseki positions, so we
  //   use the second-best score as the baseline. When best and second-best are close this changes
  //   nothing; when they diverge it stops the artifact from silently disabling the whole book.
  // - Additionally, a book move that does not make the *standing* eval notably worse is always
  //   acceptable: joseki often deliberately ignores a static "threat" the eval already priced in
  //   (e.g. ゴキゲン中飛車's △5二飛 while the eval screams about the open 2筋 — the joseki answer
  //   to ▲2四歩 is the 5筋 counter, which a 1-ply filter can never see). A genuine blunder still
  //   scores a full piece *below* the standing eval and stays rejected.
  const quietAwareBaseline =
    bestInfo.bestIsQuiet && Number.isFinite(bestInfo.secondBestScore)
      ? bestInfo.secondBestScore
      : bestInfo.bestScore;
  const baselineScore = Math.min(quietAwareBaseline, evalBeforeMove);

  const filtered: BookCandidate[] = [];
  for (const c of candidates) {
    const m = legalByKey.get(moveKey(c.move));
    if (!m) continue;
    // Keep the `Te` reference from `legal` (allocation-free); we clone only for the return value.
    filtered.push({ ...c, move: m });
  }

  // Evaluate book candidates and keep the ones close enough to the best move.
  const scored: Array<BookCandidate & { score: number }> = [];
  for (const c of filtered) {
    const score = staticEvalAfterMove(root, c.move, evalBeforeMove);
    if (score < baselineScore - threshold) continue;
    scored.push({ ...c, score });
  }

  // Out of book (or all candidates unsafe): let the engine SEARCH.
  //
  // There used to be a "resync" fallback here that picked a plausible quiet developing move with only
  // a 1-ply static check. That was a crutch for the old slow engine and it was actively dangerous:
  // - it fired in tactical positions (e.g. right after a rook-file exchange) as long as few pieces
  //   had been traded, replying in ~1ms with moves like 4二飛 / 9四歩 while the opponent was
  //   threatening to win a bishop;
  // - it could never choose drops, so correct defenses like △2三歩 were structurally excluded;
  // - self-play never caught it because both engines shared the same fallback.
  // The V20 engine is fast enough that searching out-of-book positions is strictly better.
  if (scored.length === 0) return null;

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

  openingBookStats.hits++;
  return picked.move.clone();
}
