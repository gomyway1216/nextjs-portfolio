import { Difficulty } from '../common/types';
import { GenerateMovesImproved } from './GenerateMovesImproved';
import { InitialPositionImproved } from './InitialPositionImproved';
import { KyokumenImproved } from './KyokumenImproved';
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

function posOf(suji: number, dan: number): number {
  if (suji === 0 && dan === 0) return 0;
  return (suji << 4) + dan;
}

function moveKey(te: Te): string {
  return `${te.koma}:${te.from}->${te.to}:${te.promote ? 1 : 0}`;
}

function evalForSideToMove(k: KyokumenImproved): number {
  const evalSente = k.evaluateV3();
  return k.teban === SENTE ? evalSente : -evalSente;
}

function staticEvalAfterMove(root: KyokumenImproved, move: Te): number {
  const te = move.clone();
  te.capture = root.get(te.to);
  root.move(te);
  root.toggleTeban();
  const score = evalForSideToMove(root);
  root.toggleTeban();
  root.back(te);
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
];

let bookCache: Map<number, BookCandidate[]> | null = null;

function buildBook(): Map<number, BookCandidate[]> {
  const map = new Map<number, BookCandidate[]>();

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
      const legal = GenerateMovesImproved.generateLegalMoves(k);
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
      const arr = map.get(hash);
      if (!arr) map.set(hash, [cand]);
      else arr.push(cand);

      k.move(found);
      k.toggleTeban();
    }
  }

  return map;
}

function getBook(): Map<number, BookCandidate[]> {
  if (!bookCache) bookCache = buildBook();
  return bookCache;
}

function pickDeterministic(candidates: BookCandidate[], seed: number): BookCandidate {
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

  const candidates = getBook().get(k.HashVal);
  if (!candidates || candidates.length === 0) return null;

  // Validate candidates against current legal moves (the opponent may have deviated).
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  if (legal.length === 0) return null;
  const legalByKey = new Map<string, Te>();
  for (const m of legal) legalByKey.set(moveKey(m), m);

  const filtered: BookCandidate[] = [];
  for (const c of candidates) {
    const m = legalByKey.get(moveKey(c.move));
    if (!m) continue;
    filtered.push({ ...c, move: m.clone() });
  }
  if (filtered.length === 0) return null;

  // Compute best static eval among *all* legal moves (for safety threshold).
  const root = k.clone();
  let bestScore = -Infinity;
  for (const m of legal) {
    const score = staticEvalAfterMove(root, m);
    if (score > bestScore) bestScore = score;
  }

  const threshold = openingThresholdByDifficulty(difficulty);

  // Evaluate candidates and keep the ones close enough to the best move.
  const scored: Array<BookCandidate & { score: number }> = [];
  for (const c of filtered) {
    const score = staticEvalAfterMove(root, c.move);
    if (score < bestScore - threshold) continue;
    scored.push({ ...c, score });
  }
  if (scored.length === 0) return null;

  // Selection strategy:
  // - Master/Expert: pick the best score (tie-break by priority)
  // - Others: pick a deterministic "random" candidate among the top few (variety)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.lineName.localeCompare(b.lineName);
  });

  const picked =
    difficulty === 'expert' || difficulty === 'master'
      ? scored[0]!
      : pickDeterministic(scored.slice(0, Math.min(3, scored.length)), k.HashVal);

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
      `[OpeningBookImproved] ${picked.lineName} picked=${picked.move.toString()} piece=${pieceName} score=${picked.score}`
    );
  }

  // Ensure capture is set (helps correctness if callers use move/back).
  picked.move.capture = k.get(picked.move.to);
  return picked.move.clone();
}
