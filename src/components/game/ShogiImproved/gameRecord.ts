/**
 * Building the saved record of one shogi game.
 *
 * The game's move list only ever lived in React state, so a move that looked
 * wrong could be noticed but never reproduced. This turns that state into a
 * payload for POST /api/game/shogi/records.
 *
 * Two notations are stored, on purpose:
 *   - `kifu`, the Japanese notation the game already shows and copies. It is
 *     produced by the same formatter, so a saved record pastes straight back
 *     into the game's own 棋譜を読み込む importer with no conversion step.
 *   - `moves_usi`, for anything that speaks to a real engine (analysis, the
 *     opening-book tooling, future training data), where 同 and 右/左 would
 *     have to be resolved against a replayed board first.
 *
 * Everything here is pure: the component owns the state, this owns the shape.
 */

import type { ShogiAiEngineDiagnostics } from './shogiAiWorkerClient';
import type { DisambiguationFlags } from './KifuNotationImproved';
import { disambiguationToText } from './KifuNotationImproved';
import { getKomashu, isSente, toString, FU, KY, KE, GI, KI, KA, HI } from './types';
import type { Difficulty } from '../common/types';

export const SHOGI_GAME_RECORD_SCHEMA = 'shogi-game-record-v1';

/**
 * Below this, an abandoned game is not worth a document. Ten plies is roughly
 * where a game stops being "someone clicked around on the board" and starts
 * being an opening worth looking at — and it is comfortably past the point
 * where the AI is still answering out of the book, which is the thing these
 * records exist to measure. Finished games are always saved regardless.
 */
export const MIN_ABANDON_MOVES = 10;

/** Mirrors the server ceiling; the client refuses first so nothing is wasted. */
export const MAX_RECORDED_MOVES = 600;

export type ShogiHandicap = 'none' | 'lance' | 'bishop' | 'rook' | 'two-piece';
export type ShogiOutcome = 'player_win' | 'ai_win' | 'draw' | 'abandoned';
export type ShogiEndReason =
  | 'checkmate'
  | 'engine_error'
  | 'draw'
  | 'left_page'
  | 'new_game'
  | 'unmount'
  | 'unknown';

/**
 * One applied move, as the board records it.
 *
 * `disambiguation` is computed at record time against the position the move
 * was played from (see ShogiImproved's recordMove) — it cannot be recovered
 * from the move list alone without replaying the whole game.
 */
export interface RecordedMove {
  koma: number;
  from: number;
  to: number;
  promote: boolean;
  disambiguation: DisambiguationFlags;
  /**
   * For AI moves, the engine route that produced this move ('book', 'wasm',
   * 'mate', …); absent for the human's moves and for imported kifu.
   *
   * It rides on the move rather than in a parallel array so that 待った and
   * kifu import, which already trim and rebuild the move list, cannot leave
   * the two out of step — a book-exit ply computed against a stale array
   * would point at the wrong move.
   */
  searchPath?: string | null;
}

export interface ShogiEngineArtifact {
  sha256: string;
  bytes: number;
}

export interface ShogiEngineIdentity {
  nnue_status: string;
  nnue?: ShogiEngineArtifact;
  wasm?: ShogiEngineArtifact;
}

export interface ShogiGameRecordPayload {
  schema: typeof SHOGI_GAME_RECORD_SCHEMA;
  game_id: string;
  session_id?: string;
  difficulty: Difficulty;
  handicap: ShogiHandicap;
  outcome: ShogiOutcome;
  end_reason: ShogiEndReason;
  move_count: number;
  moves_usi: string[];
  kifu: string;
  book_exit_ply: number | null;
  engine: ShogiEngineIdentity | null;
  app_version?: string;
  app_build_sha?: string;
  started_at: string;
  ended_at: string;
}

// --- Identity -------------------------------------------------------------

/**
 * A fresh id for one game. UUID v4 specifically: the server validates the
 * shape and uses it as the Firestore document id, which is what makes a
 * resent record replace itself instead of piling up copies.
 */
export function newGameId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older browsers (and jsdom without a crypto polyfill) still have to produce
  // a v4-shaped id, or every game they play would be rejected on arrival.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// --- Japanese notation ----------------------------------------------------

/** Files (筋) and ranks (段) as kifu writes them. Shared with the board's own
 *  coordinate labels so the notation and the board never disagree. */
export const KIFU_SUJI = '１２３４５６７８９';
export const KIFU_DAN = '一二三四五六七八九';

/**
 * Japanese move notation, e.g. "▲２六歩", "△同飛成", "▲５五角打", "▲５八金右".
 *
 * `打` is always written for drops, matching real-world kifu convention (which
 * writes it unconditionally rather than only when a board move would be
 * ambiguous). `m.disambiguation.drop` still carries the JSA-strict "is this
 * actually ambiguous" fact for callers that want it.
 */
export function moveToKifu(m: RecordedMove, prev: RecordedMove | undefined): string {
  const side = isSente(m.koma) ? '▲' : '△';
  const square = prev && prev.to === m.to ? '同' : `${KIFU_SUJI[(m.to >> 4) - 1]}${KIFU_DAN[(m.to & 15) - 1]}`;
  const disambigText = disambiguationToText(m.disambiguation);
  const dropText = m.from === 0 ? '打' : '';
  const promoteText = m.promote ? '成' : m.disambiguation.noPromote ? '不成' : '';
  return `${side}${square}${toString(m.koma)}${disambigText}${promoteText}${dropText}`;
}

/**
 * The whole game as numbered Japanese notation — the exact text the 棋譜を
 * コピー button puts on the clipboard, and the exact text the importer reads
 * back. Sharing one formatter is what keeps that round trip honest.
 */
export function formatKifuText(moves: readonly RecordedMove[]): string {
  return moves.map((m, i) => `${i + 1}. ${moveToKifu(m, moves[i - 1])}`).join('\n');
}

// --- USI ------------------------------------------------------------------

/** Hand pieces only — the king is never in hand, promoted pieces revert. */
const USI_DROP_LETTER: Record<number, string> = {
  [FU]: 'P', [KY]: 'L', [KE]: 'N', [GI]: 'S', [KI]: 'G', [KA]: 'B', [HI]: 'R',
};

/** (suji << 4) + dan → USI square, e.g. 0x76 → "7f". */
function toUsiSquare(pos: number): string | null {
  const suji = pos >> 4;
  const dan = pos & 15;
  if (suji < 1 || suji > 9 || dan < 1 || dan > 9) return null;
  return `${suji}${String.fromCharCode(96 + dan)}`;
}

/**
 * One move in USI, or null if it is not a move any engine could replay.
 *
 * Returning null rather than a best-effort string matters: a record with one
 * malformed move replays into the wrong position, which is worse than no
 * record at all. The builder below discards the whole game on a null.
 */
export function toUsiMove(m: RecordedMove): string | null {
  const to = toUsiSquare(m.to);
  if (!to) return null;

  if (m.from === 0) {
    const letter = USI_DROP_LETTER[getKomashu(m.koma)];
    return letter ? `${letter}*${to}` : null;
  }

  const from = toUsiSquare(m.from);
  if (!from) return null;
  return `${from}${to}${m.promote ? '+' : ''}`;
}

// --- Book exit ------------------------------------------------------------

/**
 * The 1-based ply at which the AI stopped answering out of the opening book.
 *
 * This is the number the whole feature is for: it says where the book ran out
 * in a real game, which is exactly where the book is worth extending. Plies
 * the human played are `null` in the input and are skipped; the count is over
 * all plies so it lines up with the move list and the kifu numbering.
 */
export function findBookExitPly(searchPaths: readonly (string | null)[]): number | null {
  for (let i = 0; i < searchPaths.length; i++) {
    const path = searchPaths[i];
    if (path === null || path === undefined) continue;
    if (path !== 'book') return i + 1;
  }
  return null;
}

// --- Outcome --------------------------------------------------------------

/**
 * Translate the board's `winner` into the record's outcome, from the human
 * player's point of view. The player is always Sente, including in handicap
 * games where the AI (上手) moves first.
 *
 * A finished game with no winner means neither king was mated, which the
 * board only reaches as a draw.
 */
export function outcomeForWinner(winner: number | null, sente: number, gote: number): ShogiOutcome {
  if (winner === sente) return 'player_win';
  if (winner === gote) return 'ai_win';
  return 'draw';
}

// --- Engine identity ------------------------------------------------------

/**
 * Reduce the worker's diagnostics to the parts that identify which build
 * played: the weights and the WASM binary, by content hash. That is what
 * turns "the AI played something odd last month" into a reproducible case.
 */
export function toEngineIdentity(
  diagnostics: ShogiAiEngineDiagnostics | null | undefined,
): ShogiEngineIdentity | null {
  if (!diagnostics) return null;
  const engine: ShogiEngineIdentity = { nnue_status: diagnostics.nnue.fetchStatus };
  const weights = diagnostics.nnue.fetchedWeights;
  if (weights) {
    engine.nnue = { sha256: weights.sha256, bytes: weights.bytes };
  }
  if (diagnostics.wasm.embedded) {
    engine.wasm = { sha256: diagnostics.wasm.embedded.sha256, bytes: diagnostics.wasm.embedded.bytes };
  }
  return engine;
}

// --- Payload --------------------------------------------------------------

export interface BuildGameRecordInput {
  gameId: string;
  sessionId?: string | null;
  moves: readonly RecordedMove[];
  difficulty: Difficulty;
  handicap: ShogiHandicap;
  outcome: ShogiOutcome;
  endReason: ShogiEndReason;
  engine: ShogiEngineIdentity | null;
  appVersion?: string;
  appBuildSha?: string;
  startedAt: Date;
  endedAt: Date;
}

/**
 * Assemble the record, or return null when there is nothing worth storing.
 *
 * Null means "say nothing", not "retry": an empty game, an over-long one, or
 * one whose moves will not convert cleanly are all cases where a document
 * would be noise or, worse, misleading.
 */
export function buildGameRecord(input: BuildGameRecordInput): ShogiGameRecordPayload | null {
  const moves = input.moves;
  if (moves.length === 0 || moves.length > MAX_RECORDED_MOVES) return null;

  const movesUsi: string[] = [];
  for (const move of moves) {
    const usi = toUsiMove(move);
    if (!usi) return null;
    movesUsi.push(usi);
  }

  const payload: ShogiGameRecordPayload = {
    schema: SHOGI_GAME_RECORD_SCHEMA,
    game_id: input.gameId,
    difficulty: input.difficulty,
    handicap: input.handicap,
    outcome: input.outcome,
    end_reason: input.endReason,
    move_count: movesUsi.length,
    moves_usi: movesUsi,
    kifu: formatKifuText(moves),
    book_exit_ply: findBookExitPly(moves.map((m) => m.searchPath ?? null)),
    engine: input.engine,
    started_at: input.startedAt.toISOString(),
    ended_at: input.endedAt.toISOString(),
  };

  if (input.sessionId) payload.session_id = input.sessionId;
  if (input.appVersion) payload.app_version = input.appVersion;
  if (input.appBuildSha) payload.app_build_sha = input.appBuildSha;

  return payload;
}
