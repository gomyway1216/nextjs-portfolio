/**
 * KifuNotationImproved
 *
 * Shared logic for producing (and, for import, disambiguating) standard Japanese
 * shogi move notation (棋譜), specifically the relative-position modifiers
 * (相対表記) the JSA (日本将棋連盟) standard uses when more than one of the
 * mover's pieces of the same type could legally reach the same destination
 * square. Algorithm (see module-level tests for the canonical examples):
 *
 * 1. Gather every *other* legal move by a piece of the identical komashu, to the
 *    identical destination, of the identical "shape" (board move vs. drop) —
 *    the candidate's "siblings". If there are none, no modifier is used at all.
 * 2. 直 (choku): scoped ONLY to gold-type pieces (金/銀/と/成銀/成桂/成香) moving
 *    exactly one square straight ahead (toward the opponent) on the same suji as
 *    the destination, when at least one sibling approaches from a *different*
 *    suji. 直 is terminal — never combined with 右/左/上/引/寄, and never used
 *    for sliding pieces (飛/香/角/竜/馬), matching real JSA usage.
 * 3. Otherwise, group this candidate + all siblings by origin suji. The
 *    right-most and left-most distinct suji among the group get 右/左
 *    respectively (right/left are relative to the *mover's own* facing
 *    direction, which mirrors between Sente and Gote). If 2+ candidates share
 *    the extreme (right-most or left-most) suji, 右/左 alone doesn't fully
 *    distinguish them, so 上/引/寄 is appended on top, comparing origin vs.
 *    destination dan: forward = 上, backward = 引, same dan (pure sideways) = 寄.
 * 4. If every candidate (including this one) shares a single suji, 右/左 doesn't
 *    apply at all; only 上/引/寄 is used, standalone.
 * 5. 打 — orthogonal to 1-4: a drop is marked 打 iff a board move (not a drop) by
 *    the same piece type could also reach the same destination square.
 * 6. 不成 — orthogonal: appended when promotion was legal (per the standard
 *    "enters/moves-within/exits the promotion zone" rule) but declined.
 *
 * This module is shared by:
 * - `moveToKifu` (ShogiImproved.tsx) — producing the on-screen/copyable kifu text.
 * - `KifuImportImproved` — parsing pasted kifu text back into legal moves.
 *
 * Sharing the exact same disambiguation logic on both sides is what makes the
 * round trip (board -> kifu text -> re-imported board) exact.
 */

import { GenerateMovesImproved } from './GenerateMovesImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { GI, KI, NG, NK, NY, SENTE, TO, Te, getDan, getKomashu, getSuji, canPromote } from './types';

export interface DisambiguationFlags {
  /** 右 — mover's piece approached from its own right. Mutually exclusive with left. */
  right: boolean;
  /** 左 — mover's piece approached from its own left. */
  left: boolean;
  /** 直 — straight-ahead approach along the same suji, disambiguated from a diagonal approach. Terminal: never combined with the others. */
  chokushin: boolean;
  /** 上 — approached moving forward (toward the opponent). */
  up: boolean;
  /** 引 — approached moving backward (toward the mover's own side). */
  pull: boolean;
  /** 寄 — approached sideways (same dan as destination). */
  sideways: boolean;
  /** 打 — this is a drop, and a board move to the same square with the same piece type also exists. */
  drop: boolean;
  /** 不成 — promotion was legal here but declined. */
  noPromote: boolean;
}

/** Piece types that move like a gold (金) — the only types 直 ever applies to. */
const GOLD_LIKE_KOMASHU: ReadonlySet<number> = new Set([KI, GI, TO, NG, NK, NY]);

/**
 * Every *other* legal move (same mover, same piece komashu, same destination,
 * same promote/drop-vs-board "shape") that the notation must be distinguished
 * from. Used to decide whether any disambiguation is needed at all.
 *
 * Deliberately does NOT filter on `m.promote === move.promote`: JSA disambiguation
 * groups candidates by piece identity/origin, not by whether each candidate also
 * promotes, so a promoting and non-promoting move from two different origins are
 * still "siblings" for 右/左/上/引/寄 purposes (成/不成 is an orthogonal marker).
 */
function findSiblingCandidates(k: KyokumenImproved, move: Te): Te[] {
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  const seenFrom = new Set<number>();
  const siblings: Te[] = [];
  for (const m of legal) {
    if (m.to !== move.to) continue;
    if (getKomashu(m.koma) !== getKomashu(move.koma)) continue;
    // A board move and a drop are distinguished by 打, not by right/left/up/pull —
    // so only compare within the same "shape" (both drops, or both board moves).
    if ((m.from === 0) !== (move.from === 0)) continue;
    if (m.from === move.from) continue; // same origin as `move` itself (e.g. its promote/non-promote twin) is not a distinct candidate
    if (seenFrom.has(m.from)) continue; // collapse promote/non-promote duplicates from the same origin
    seenFrom.add(m.from);
    siblings.push(m);
  }
  return siblings;
}

/**
 * Compute the full disambiguation flag set for `move` in position `k` (the
 * position *before* the move is applied, with `k.teban` equal to the mover).
 */
export function computeDisambiguation(k: KyokumenImproved, move: Te): DisambiguationFlags {
  const flags: DisambiguationFlags = {
    right: false, left: false, chokushin: false, up: false, pull: false,
    sideways: false, drop: false, noPromote: false,
  };

  // --- 不成: promotion was legal but declined ---
  if (!move.promote && move.from !== 0 && canPromote[move.koma]) {
    const fromDan = getDan(move.from);
    const toDan = getDan(move.to);
    const inZone = k.teban === SENTE
      ? (fromDan <= 3 || toDan <= 3)
      : (fromDan >= 7 || toDan >= 7);
    if (inZone) flags.noPromote = true;
  }

  // --- 打 vs board-move ambiguity ---
  if (move.from === 0) {
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    const boardMoveExists = legal.some(
      (m) => m.from !== 0 && m.to === move.to && getKomashu(m.koma) === getKomashu(move.koma)
    );
    if (boardMoveExists) flags.drop = true;
    return flags; // right/left/up/pull/chokushin never apply to drops
  }

  // --- right/left/up/pull/sideways/chokushin: only relevant for board moves ---
  const siblings = findSiblingCandidates(k, move);
  if (siblings.length === 0) return flags;

  const mySuji = getSuji(move.from);
  const myDan = getDan(move.from);
  const toSuji = getSuji(move.to);
  const toDan = getDan(move.to);

  // "Forward" for Sente is decreasing dan; for Gote is increasing dan.
  const rankDir = (fromDan: number, destDan: number): 'up' | 'pull' | 'sideways' => {
    if (fromDan === destDan) return 'sideways';
    const forward = k.teban === SENTE ? destDan < fromDan : destDan > fromDan;
    return forward ? 'up' : 'pull';
  };

  // --- 直: gold-type piece, same suji as destination, exactly one square straight
  // ahead, with at least one sibling approaching from a *different* suji (so
  // disambiguation is actually needed). Terminal: no further modifier is added.
  if (
    GOLD_LIKE_KOMASHU.has(getKomashu(move.koma)) &&
    mySuji === toSuji &&
    Math.abs(myDan - toDan) === 1 &&
    rankDir(myDan, toDan) === 'up' &&
    siblings.some((s) => getSuji(s.from) !== toSuji)
  ) {
    flags.chokushin = true;
    return flags;
  }

  // "Right" for Sente is lower suji (筋1 is Sente's right); for Gote the board is
  // mirrored, so Gote's right is higher suji.
  const isRightOf = (a: number, b: number): boolean => (k.teban === SENTE ? a < b : a > b);

  const allSuji = [mySuji, ...siblings.map((s) => getSuji(s.from))];
  const distinctSuji = Array.from(new Set(allSuji));

  if (distinctSuji.length === 1) {
    // Every candidate (including this one) shares one suji: right/left doesn't
    // apply; only forward/backward/sideways does.
    const dir = rankDir(myDan, toDan);
    if (dir === 'up') flags.up = true;
    else if (dir === 'pull') flags.pull = true;
    else flags.sideways = true;
    return flags;
  }

  // rightmost: keep replacing with `s` whenever `s` is further right than the
  // current holder. leftmost: keep the current holder unless `s` is further
  // left (i.e. NOT more-right than the holder).
  const rightmostSuji = distinctSuji.reduce((r, s) => (isRightOf(s, r) ? s : r));
  const leftmostSuji = distinctSuji.reduce((l, s) => (isRightOf(s, l) ? l : s));

  const candidatesOnMySuji = 1 + siblings.filter((s) => getSuji(s.from) === mySuji).length;

  if (mySuji === rightmostSuji) {
    flags.right = true;
  } else if (mySuji === leftmostSuji) {
    flags.left = true;
  } else {
    // A middle suji among 3+ distinct files: JSA has no dedicated "middle" kanji,
    // so identify it purely by rank direction relative to the destination (no
    // right/left prefix — matching standard usage for this rare configuration).
    const dir = rankDir(myDan, toDan);
    if (dir === 'up') flags.up = true;
    else if (dir === 'pull') flags.pull = true;
    else flags.sideways = true;
    return flags;
  }

  // 2+ candidates share this extreme (rightmost or leftmost) suji: 右/左 alone
  // doesn't fully distinguish them, so layer on 上/引/寄.
  if (candidatesOnMySuji > 1) {
    const dir = rankDir(myDan, toDan);
    if (dir === 'up') flags.up = true;
    else if (dir === 'pull') flags.pull = true;
    else flags.sideways = true;
  }

  return flags;
}

/** Render disambiguation flags as the notation suffix/infix the JSA uses, e.g. "右", "直", "右上". */
export function disambiguationToText(flags: DisambiguationFlags): string {
  let s = '';
  if (flags.right) s += '右';
  if (flags.left) s += '左';
  if (flags.chokushin) s += '直';
  if (flags.up) s += '上';
  if (flags.pull) s += '引';
  if (flags.sideways) s += '寄';
  return s;
}
