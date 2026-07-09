/**
 * KifuImportImproved
 *
 * Parses pasted Japanese shogi notation (棋譜) into a sequence of legal `Te` moves,
 * replaying them one at a time against `GenerateMovesImproved.generateLegalMoves()`
 * so every parsed move is verified against the actual rules engine (checks, nifu,
 * uchifuzume, promotion legality, etc. all fall out of that for free).
 *
 * Supported input shape (real-world user kifu), e.g.:
 *   1. ▲７六歩 2. △８四歩 3. ▲７七角 ... 38. △同角 40. △８五歩打 42. △７七角成 ...
 *
 * Tolerated variations:
 * - Move numbers (`1.`, `2.`) may be present or absent, half-width or full-width digits.
 * - Side markers ▲ (sente) / △ (gote) may be present or absent. When absent, side is
 *   inferred by alternating turns starting from whichever side is to move in the
 *   supplied starting position.
 * - Destination square: full-width or half-width suji digit (１-９ / 1-9) + kanji dan
 *   (一-九), OR `同` (same square as the immediately preceding move).
 * - Piece name: 歩香桂銀金角飛玉王 (base) or と馬龍/竜全圭杏 (promoted).
 * - Relative-position modifiers (相対表記), in any JSA-standard combination:
 *   右/左 (approached from the mover's right/left), 直 (straight one square ahead,
 *   gold-type pieces only), 上/引/寄 (forward/backward/sideways), needed when 2+ of
 *   the mover's same-type pieces could reach the same square — see
 *   `KifuNotationImproved.ts` for the full algorithm (shared with kifu *generation*
 *   so a round trip board -> text -> re-imported board is exact).
 * - `成` suffix marks "promote on this move"; `不成` marks a declined promotion.
 * - `打` suffix marks "drop from hand" (also inferred automatically when no board
 *   move matches, since real kifu sometimes omits 打 for drops).
 *
 * Error handling: parsing stops at the first move it cannot confidently resolve to
 * a unique legal move. Everything up to that point is returned as successfully
 * parsed steps (each with the resulting position), plus a description of where and
 * why it failed, so the caller can show "parsed 37 of 52 moves, failed at move 38".
 */

import { GenerateMovesImproved } from './GenerateMovesImproved';
import { KyokumenImproved } from './KyokumenImproved';
import {
  FU, KY, KE, GI, KI, KA, HI, OU,
  TO, NY, NK, NG, UM, RY,
  GOTE, SENTE,
  Te,
  getKomashu,
} from './types';
import { computeDisambiguation, disambiguationToText, type DisambiguationFlags } from './KifuNotationImproved';

/**
 * Map every kifu piece-kanji directly to the exact `getKomashu()` value it names
 * (i.e. koma-type-without-player-flag, promote bit included where applicable).
 *
 * NOTE: `OU` (king, value 8) numerically collides with the `PROMOTE` bit (8), so
 * naive "base ^ promote-bit" bit math is unsafe here — this table sidesteps that
 * by recording the exact target komashu per kanji instead of trying to derive it.
 */
const KANJI_TO_KOMASHU: Record<string, number> = {
  '歩': FU, '香': KY, '桂': KE, '銀': GI, '金': KI, '角': KA, '飛': HI, '玉': OU, '王': OU,
  'と': TO, '馬': UM, '龍': RY, '竜': RY, '全': NG, '圭': NK, '杏': NY,
};

/** Kanji that name an already-promoted piece (と/馬/龍/竜/全/圭/杏), mapped to the promoted komashu. */
const PROMOTED_KANJI: ReadonlySet<string> = new Set(['と', '馬', '龍', '竜', '全', '圭', '杏']);

/** One successfully parsed step: the move applied and the resulting position. */
export interface KifuImportStep {
  moveNumber: number;
  move: Te;
  /** Position *after* this move is applied. */
  kyokumen: KyokumenImproved;
  /** Human-readable notation as parsed (side + square + piece + suffixes), for display/debugging. */
  notation: string;
}

export interface KifuImportResult {
  /** Every move successfully parsed and applied, in order. */
  steps: KifuImportStep[];
  /** Set when parsing stopped early; undefined if the whole kifu parsed cleanly. */
  error?: {
    /** 1-based move number in the input token stream that failed. */
    moveNumber: number;
    /** The raw token text that failed to resolve. */
    token: string;
    reason: string;
  };
}

// --- Character maps -------------------------------------------------------

const ZEN_DIGITS = '０１２３４５６７８９';
const HAN_DIGITS = '0123456789';
const SUJI_ZEN = '１２３４５６７８９'; // index 0 unused; suji = index
const DAN_KANJI = '一二三四五六七八九';

function normalizeDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const zi = ZEN_DIGITS.indexOf(ch);
    out += zi >= 0 ? HAN_DIGITS[zi] : ch;
  }
  return out;
}

// --- Tokenization ----------------------------------------------------------

interface RawToken {
  /** 1-based sequence number as it appeared (move number in the text, if present, else running count). */
  moveNumber: number;
  /** Side marker if present in the text. */
  side: 'sente' | 'gote' | null;
  /** The move notation itself, e.g. "７六歩", "同角成", "８五歩打". */
  body: string;
}

/**
 * Split raw pasted kifu text into per-move tokens.
 *
 * Strategy: strip move-number prefixes (`\d+\.`) and split on whitespace, since
 * every real sample keeps one move per whitespace-delimited chunk once move
 * numbers are removed. This also tolerates newlines between moves.
 */
function tokenize(text: string): RawToken[] {
  // Normalize full-width dot/period sometimes used after move numbers.
  const normalized = text.replace(/[。．]/g, '.').replace(/\r\n?/g, '\n');

  // Split on any whitespace (space, tab, newline, full-width space).
  const rawChunks = normalized.split(/[\s　]+/).filter((c) => c.length > 0);

  const tokens: RawToken[] = [];
  let running = 0;
  for (const chunk of rawChunks) {
    let rest = chunk;

    // Strip a leading move number like "12." or "１２．".
    const numMatch = rest.match(/^([0-9０-９]+)\.\s*([\s\S]*)$/);
    if (numMatch) {
      rest = numMatch[2];
    }
    if (rest.length === 0) continue;

    // Extract side marker (▲ = sente, △ = gote), if present, from the front.
    let side: 'sente' | 'gote' | null = null;
    if (rest.startsWith('▲')) {
      side = 'sente';
      rest = rest.slice(1);
    } else if (rest.startsWith('△')) {
      side = 'gote';
      rest = rest.slice(1);
    }

    if (rest.length === 0) continue;

    running++;
    tokens.push({ moveNumber: running, side, body: rest });
  }
  return tokens;
}

// --- Per-move parsing --------------------------------------------------------

interface ParsedMoveSpec {
  /** true when the move text used "同" (same square as previous destination). */
  sameSquare: boolean;
  toSuji: number | null; // 1-9, null when sameSquare
  toDan: number | null; // 1-9, null when sameSquare
  /** The komashu (koma-type-without-player-flag) the moving piece must have. */
  pieceKomashu: number;
  promote: boolean; // "成" suffix: promote on this move
  noPromote: boolean; // "不成" suffix: promotion was declined
  drop: boolean; // "打" suffix: must be a drop from hand
  // Relative-position modifiers (相対表記), parsed if present; undefined/false when absent.
  right: boolean;
  left: boolean;
  chokushin: boolean;
  up: boolean;
  pull: boolean;
  sideways: boolean;
}

class KifuParseError extends Error {}

/** Strip a known relative-position modifier substring from the end of `s`, if present. */
function stripSuffix(s: string, suffixes: string[]): { rest: string; matched: string | null } {
  for (const suf of suffixes) {
    if (s.endsWith(suf)) return { rest: s.slice(0, -suf.length), matched: suf };
  }
  return { rest: s, matched: null };
}

function parseMoveBody(body: string): ParsedMoveSpec {
  let rest = body;
  let drop = false;
  let promote = false;
  let noPromote = false;
  let right = false, left = false, chokushin = false, up = false, pull = false, sideways = false;

  // Trailing 打 (drop) — always a suffix, comes last.
  if (rest.endsWith('打')) {
    drop = true;
    rest = rest.slice(0, -1);
  }
  // Trailing 成/不成 (promote / declined promotion) — comes right before 打.
  if (rest.endsWith('不成')) {
    noPromote = true;
    rest = rest.slice(0, -2);
  } else if (rest.endsWith('成') && !PROMOTED_KANJI.has(rest.slice(-1))) {
    // Guard against stripping the "成" that is itself part of a promoted-piece
    // kanji... none of PROMOTED_KANJI end in "成" as a substring match issue in
    // practice (と/馬/龍/竜/全/圭/杏 are single characters, none equal "成"), but
    // keep the check for robustness/clarity.
    promote = true;
    rest = rest.slice(0, -1);
  }

  // Relative-position modifiers (相対表記), longest-first so "右上" isn't
  // mis-split as "右" leaving a stray "上" that then fails to attach.
  const modifierSuffixes = ['右上', '右引', '右寄', '左上', '左引', '左寄', '右', '左', '直', '上', '引', '寄'];
  const { rest: afterMod, matched } = stripSuffix(rest, modifierSuffixes);
  if (matched) {
    rest = afterMod;
    right = matched.startsWith('右');
    left = matched.startsWith('左');
    chokushin = matched === '直';
    if (matched.endsWith('上')) up = true;
    else if (matched.endsWith('引')) pull = true;
    else if (matched.endsWith('寄')) sideways = true;
  }

  if (rest.length === 0) {
    throw new KifuParseError('空の指し手です');
  }

  let sameSquare = false;
  let toSuji: number | null = null;
  let toDan: number | null = null;
  let pieceStr: string;

  if (rest.startsWith('同')) {
    sameSquare = true;
    pieceStr = rest.slice(1);
  } else {
    const normalized = normalizeDigits(rest);
    const sujiCh = normalized[0];
    const danCh = rest[1]; // dan is always kanji, never affected by digit normalization
    const suji = HAN_DIGITS.indexOf(sujiCh);
    const dan = DAN_KANJI.indexOf(danCh);
    if (suji < 1 || suji > 9 || dan < 0) {
      throw new KifuParseError(`マス目を読み取れません: "${body}"`);
    }
    toSuji = suji;
    toDan = dan + 1;
    pieceStr = rest.slice(2);
  }

  if (pieceStr.length === 0) {
    throw new KifuParseError(`駒名を読み取れません: "${body}"`);
  }

  // Piece names are a single character (歩香桂銀金角飛玉王と馬龍竜全圭杏).
  const pieceKanji = pieceStr[0];
  const pieceKomashu = KANJI_TO_KOMASHU[pieceKanji];
  if (pieceKomashu === undefined) {
    throw new KifuParseError(`不明な駒名です: "${pieceKanji}" (手: "${body}")`);
  }
  if (pieceStr.length > 1) {
    throw new KifuParseError(`指し手を読み取れません: "${body}"`);
  }
  if (promote && PROMOTED_KANJI.has(pieceKanji)) {
    // "成" combined with an already-promoted piece name (e.g. "同と成") is not
    // meaningful notation — an already-promoted piece cannot promote again.
    throw new KifuParseError(`既に成っている駒に「成」は指定できません: "${body}"`);
  }

  return {
    sameSquare, toSuji, toDan, pieceKomashu, promote, noPromote, drop,
    right, left, chokushin, up, pull, sideways,
  };
}

/** True when `spec` specifies at least one relative-position modifier. */
function hasPositionModifier(spec: ParsedMoveSpec): boolean {
  return spec.right || spec.left || spec.chokushin || spec.up || spec.pull || spec.sideways;
}

/** True when the computed disambiguation for a candidate move matches everything the notation specified. */
function matchesModifiers(flags: DisambiguationFlags, spec: ParsedMoveSpec): boolean {
  return (
    flags.right === spec.right &&
    flags.left === spec.left &&
    flags.chokushin === spec.chokushin &&
    flags.up === spec.up &&
    flags.pull === spec.pull &&
    flags.sideways === spec.sideways
  );
}

// --- Move resolution against the legal-move list ----------------------------

function pos(suji: number, dan: number): number {
  return (suji << 4) + dan;
}

/**
 * Resolve a parsed move spec to a unique legal `Te` in the given position.
 * Tries both drop and board-move candidates (unless the notation forces one via 打).
 */
function resolveMove(
  k: KyokumenImproved,
  spec: ParsedMoveSpec,
  prevTo: number | null
): { move: Te | null; reason?: string } {
  const to = spec.sameSquare ? prevTo : pos(spec.toSuji as number, spec.toDan as number);
  if (to === null) {
    return { move: null, reason: '「同」の直前の指し手がありません' };
  }

  const legal = GenerateMovesImproved.generateLegalMoves(k);
  const sameTypeAndSquare = (m: Te): boolean =>
    m.to === to && m.promote === spec.promote && getKomashu(m.koma) === spec.pieceKomashu;

  let candidates = legal.filter((m) => sameTypeAndSquare(m) && (spec.drop ? m.from === 0 : m.from !== 0));

  // Real-world kifu sometimes omits 打 even for a drop (it's only strictly
  // required when ambiguous with a board move). If the notation didn't say 打
  // and no board move matched, fall back to trying a drop of the same piece
  // type before giving up.
  if (candidates.length === 0 && !spec.drop) {
    candidates = legal.filter((m) => sameTypeAndSquare(m) && m.from === 0);
  }

  if (candidates.length === 0) {
    return { move: null, reason: '合法手の中に一致する手がありません（不正な手、または非合法手の可能性）' };
  }

  if (candidates.length > 1) {
    if (spec.drop) {
      // Two drops of the identical piece type to the identical square can't both
      // be legal simultaneously (there's only one way to drop a given piece type
      // on a square) — this branch is unreachable in practice, but guard anyway.
      return { move: null, reason: '複数の合法手（打）に一致し、一意に決定できません' };
    }
    const disambiguated = candidates.filter((m) => matchesModifiers(computeDisambiguation(k, m), spec));
    if (disambiguated.length === 1) {
      candidates = disambiguated;
    } else if (disambiguated.length === 0) {
      const hint = hasPositionModifier(spec)
        ? '（右/左/上/引/寄/直の指定と一致する手がありません）'
        : '（右/左/上/引/寄/直などの相対表記が必要です）';
        return { move: null, reason: `複数の合法手に一致し、一意に決定できません${hint}` };
    } else {
      return { move: null, reason: '相対表記を考慮しても複数の合法手に一致し、一意に決定できません' };
    }
  }

  // --- 不成 sanity check: if the notation said 不成 but this move couldn't have
  // promoted anyway (not eligible), that's not an error per se (some kifu authors
  // write 不成 loosely) — but if it said neither 成 nor 不成 while promotion was
  // mandatory, `candidates` would already be empty (mandatory-promote moves only
  // exist with promote=true in generateLegalMoves), so no separate check is needed.

  return { move: candidates[0] };
}

// --- Public entry point -------------------------------------------------------

/**
 * Parse and replay a pasted kifu against `startingPosition`.
 *
 * `startingPosition` is never mutated; each step clones before moving so callers
 * can freely step back and forth over `steps[i].kyokumen`.
 */
export function parseKifuText(text: string, startingPosition: KyokumenImproved): KifuImportResult {
  const tokens = tokenize(text);
  const steps: KifuImportStep[] = [];

  let current = startingPosition.clone();
  let prevTo: number | null = null;

  for (const token of tokens) {
    let spec: ParsedMoveSpec;
    try {
      spec = parseMoveBody(token.body);
    } catch (e) {
      return {
        steps,
        error: {
          moveNumber: token.moveNumber,
          token: token.body,
          reason: e instanceof KifuParseError ? e.message : String(e),
        },
      };
    }

    // Sanity-check the side marker against whose turn it actually is, when present.
    if (token.side) {
      const expectedTeban = token.side === 'sente' ? SENTE : GOTE;
      if (current.teban !== expectedTeban) {
        return {
          steps,
          error: {
            moveNumber: token.moveNumber,
            token: token.body,
            reason: `手番が一致しません（${token.side === 'sente' ? '▲' : '△'}とありますが、実際は${current.teban === SENTE ? '先手' : '後手'}番です）`,
          },
        };
      }
    }

    const { move, reason } = resolveMove(current, spec, prevTo);
    if (!move) {
      return {
        steps,
        error: { moveNumber: token.moveNumber, token: token.body, reason: reason ?? '不明なエラー' },
      };
    }

    // Disambiguation is computed against `current` (pre-move), matching how the
    // live game's `moveToKifu` records it, so the round trip is exact.
    const disambiguation = computeDisambiguation(current, move);

    const next = current.clone();
    const applied = move.clone();
    next.move(applied);
    next.setTeban(current.teban === SENTE ? GOTE : SENTE);

    const side = current.teban === SENTE ? '▲' : '△';
    const squareStr = spec.sameSquare
      ? '同'
      : `${SUJI_ZEN[(spec.toSuji as number) - 1]}${DAN_KANJI[(spec.toDan as number) - 1]}`;
    const notation = `${side}${squareStr}${pieceLabel(applied, disambiguation)}`;

    steps.push({ moveNumber: token.moveNumber, move: applied, kyokumen: next, notation });

    prevTo = move.to;
    current = next;
  }

  return { steps };
}

function pieceLabel(move: Te, disambiguation: DisambiguationFlags): string {
  // Reuses the same table as types.ts's toString(), duplicated narrowly here to
  // avoid importing render-only helpers into a parsing module.
  const komaString = [
    '  ', '歩', '香', '桂', '銀', '金', '角', '飛',
    '玉', 'と', '杏', '圭', '全', '', '馬', '竜',
  ];
  const disambigText = disambiguationToText(disambiguation);
  // 打 is always written for drops (matching real-world kifu, incl. the user's
  // sample), not only when ambiguous with a board move.
  const dropText = move.from === 0 ? '打' : '';
  const promoteText = move.promote ? '成' : disambiguation.noPromote ? '不成' : '';
  return `${komaString[getKomashu(move.koma)]}${disambigText}${promoteText}${dropText}`;
}
