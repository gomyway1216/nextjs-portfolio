/**
 * Deterministic CSA game importer for evaluation-function recovery datasets.
 *
 * The primary path is a pinned, already-extracted archive (currently WCSC36):
 *
 *   node -r tsx/cjs ml/import-csa-games.ts \
 *     --csa-dir ml/data/wcsc36/csa \
 *     --source wcsc \
 *     --source-url https://www2.computer-shogi.org/wcsc36/ \
 *     --archive-sha256 <sha256-of-downloaded-zip> \
 *     --out ml/data/wcsc36/parents.raw.jsonl \
 *     --report ml/data/wcsc36/import-report.json
 *
 * Output rows are parent-position occurrences. They intentionally contain no
 * `cp`; a separate, versioned teacher step must label them before training.
 *
 * Floodgate URL discovery and content-addressed cache helpers remain exported
 * for an optional local-only second stage. The CLI does not crawl Floodgate.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { types as nodeUtilTypes } from 'node:util';

import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import {
  FU,
  GI,
  GOTE,
  HI,
  KA,
  KE,
  KI,
  KY,
  NG,
  NK,
  NY,
  OU,
  PROMOTE,
  RY,
  SENTE,
  Te,
  TO,
  UM,
  getDan,
  getKomashu,
  getSuji,
} from '../src/components/game/ShogiImproved/types';
import { toSfen } from './generate-teacher';
import { rulesCompleteLegalMoves } from './shogi-sfen';

export type CsaSource = 'wcsc' | 'floodgate';
export type DatasetSplit = 'train' | 'val';
export type CsaEncoding = 'shift_jis' | 'utf-8';

const MOVE_RE = /^([+-])([0-9])([0-9])([0-9])([0-9])(FU|KY|KE|GI|KI|KA|HI|OU|TO|NY|NK|NG|UM|RY)$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  'buffer'
)?.get;

const CSA_KIND: Readonly<Record<string, number>> = {
  FU,
  KY,
  KE,
  GI,
  KI,
  KA,
  HI,
  OU,
  TO,
  NY,
  NK,
  NG,
  UM,
  RY,
};

const USI_DROP_LETTER: Readonly<Record<number, string>> = {
  [FU]: 'P',
  [KY]: 'L',
  [KE]: 'N',
  [GI]: 'S',
  [KI]: 'G',
  [KA]: 'B',
  [HI]: 'R',
};

// CSA board rows are ordered file 9 -> file 1.
const HIRATE_CSA_ROWS: readonly (readonly string[])[] = [
  ['-KY', '-KE', '-GI', '-KI', '-OU', '-KI', '-GI', '-KE', '-KY'],
  ['*', '-HI', '*', '*', '*', '*', '*', '-KA', '*'],
  ['-FU', '-FU', '-FU', '-FU', '-FU', '-FU', '-FU', '-FU', '-FU'],
  ['*', '*', '*', '*', '*', '*', '*', '*', '*'],
  ['*', '*', '*', '*', '*', '*', '*', '*', '*'],
  ['*', '*', '*', '*', '*', '*', '*', '*', '*'],
  ['+FU', '+FU', '+FU', '+FU', '+FU', '+FU', '+FU', '+FU', '+FU'],
  ['*', '+KA', '*', '*', '*', '*', '*', '+HI', '*'],
  ['+KY', '+KE', '+GI', '+KI', '+OU', '+KI', '+GI', '+KE', '+KY'],
];

export interface ParseCsaOptions {
  source: CsaSource;
  sourceUrl?: string | null;
  recordPath?: string | null;
  archiveSha256?: string | null;
  encoding?: CsaEncoding;
  requireTerminal?: boolean;
}

export interface ParsedCsaMove {
  ply: number;
  sideToMove: 'b' | 'w';
  token: string;
  usi: string;
  parentSfen: string;
  childSfen: string;
}

export interface ParsedCsaGame {
  schemaVersion: 1;
  source: CsaSource;
  sourceUrl: string | null;
  recordPath: string | null;
  archiveSha256: string | null;
  gameId: string;
  gameSha256: string;
  event: string | null;
  site: string | null;
  startTime: string | null;
  endTime: string | null;
  timeControl: string | null;
  players: {
    sente: string | null;
    gote: string | null;
  };
  ratings: {
    sente: number | null;
    gote: number | null;
  };
  terminal: string;
  moves: ParsedCsaMove[];
}

/** Raw parent occurrence. Deliberately has no `cp` field. */
export interface RawParentOccurrence {
  schema_version: 1;
  source: CsaSource;
  event: string | null;
  site: string | null;
  start_time: string | null;
  end_time: string | null;
  time_control: string | null;
  game_id: string;
  game_sha256: string;
  parent_id: string;
  position_id: string;
  parent_sfen: string;
  ply: number;
  side_to_move: 'b' | 'w';
  played_move: string;
  played_move_csa: string;
  players: {
    sente: string | null;
    gote: string | null;
  };
  ratings: {
    sente: number | null;
    gote: number | null;
  };
  terminal: string;
  source_url: string | null;
  record_path: string | null;
  archive_sha256: string | null;
}

/** SHA-256 over the exact supplied bytes (or UTF-8 bytes for a string). */
export function sha256(input: string | Uint8Array): string {
  return crypto
    .createHash('sha256')
    .update(typeof input === 'string' ? Buffer.from(input, 'utf8') : input)
    .digest('hex');
}

function assertSha256(value: string, label: string): string {
  if (!SHA256_RE.test(value)) {
    throw new Error(`${label} must be a full 64-character lowercase SHA-256 digest`);
  }
  return value;
}

function decodeCsa(input: string | Uint8Array, encoding: CsaEncoding): string {
  // Already-decoded strings remain for generic callers and tests only. The
  // production Floodgate path must retain and pass the exact response bytes.
  if (typeof input === 'string') return input;
  // WCSC records are distributed as SHIFT_JIS. TextDecoder keeps the parser
  // dependency-free while all protocol tokens remain byte-exact ASCII.
  try {
    return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(input);
  } catch {
    throw new Error(`CSA bytes are not fatal-valid ${encoding}`);
  }
}

function rawBytes(input: string | Uint8Array): Uint8Array {
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  if (nodeUtilTypes.isProxy(input)) throw new Error('CSA bytes must not be a Proxy');
  if (!(input instanceof Uint8Array)) throw new Error('CSA input must be a string or Uint8Array');
  if (!TYPED_ARRAY_BUFFER_GETTER) throw new Error('TypedArray buffer getter is unavailable');
  const backingBuffer = Reflect.apply(TYPED_ARRAY_BUFFER_GETTER, input, []) as ArrayBufferLike;
  if (nodeUtilTypes.isSharedArrayBuffer(backingBuffer)) {
    throw new Error('CSA bytes must not use SharedArrayBuffer storage');
  }
  // TypedArray construction ignores an overridden iterator and Symbol.species,
  // yielding an independent plain snapshot for both Uint8Array and Buffer.
  return new Uint8Array(input);
}

function resultKind(te: Te): number {
  const kind = getKomashu(te.koma);
  return te.promote ? kind | PROMOTE : kind;
}

/**
 * Resolve one CSA move against the engine's legal move generator.
 * The position is not mutated.
 */
export function resolveCsaMove(position: KyokumenImproved, token: string): Te {
  const match = MOVE_RE.exec(token);
  if (!match) {
    throw new Error(`invalid CSA move token: ${token}`);
  }

  const [, side, fromFileRaw, fromRankRaw, toFileRaw, toRankRaw, pieceCode] = match;
  const expectedSide = side === '+' ? SENTE : GOTE;
  if (position.teban !== expectedSide) {
    throw new Error(`CSA side-to-move mismatch for ${token}`);
  }

  const fromFile = Number(fromFileRaw);
  const fromRank = Number(fromRankRaw);
  const toFile = Number(toFileRaw);
  const toRank = Number(toRankRaw);
  const isDrop = fromFile === 0 && fromRank === 0;
  if ((!isDrop && (fromFile === 0 || fromRank === 0)) || toFile === 0 || toRank === 0) {
    throw new Error(`invalid CSA coordinates: ${token}`);
  }

  const from = isDrop ? 0 : (fromFile << 4) + fromRank;
  const to = (toFile << 4) + toRank;
  const expectedKind = CSA_KIND[pieceCode];
  const matches: Te[] = [];
  let seenPromoted = false;
  let seenUnpromoted = false;
  const addExpected = (move: Te): void => {
    if (resultKind(move) !== expectedKind) return;
    if (move.promote ? seenPromoted : seenUnpromoted) return;
    if (move.promote) seenPromoted = true;
    else seenUnpromoted = true;
    matches.push(move);
  };
  for (const { move } of rulesCompleteLegalMoves(position)) {
    if (move.from !== from || move.to !== to) continue;
    addExpected(move);
  }

  if (matches.length === 0) {
    throw new Error(`illegal or piece-mismatched CSA move: ${token}`);
  }
  if (matches.length !== 1) {
    throw new Error(`ambiguous CSA move after legal-move matching: ${token}`);
  }
  return matches[0];
}

/** Convert an already-resolved legal move to USI notation. */
export function teToUsi(te: Te): string {
  const toFile = getSuji(te.to);
  const toRank = getDan(te.to);
  if (toFile < 1 || toFile > 9 || toRank < 1 || toRank > 9) {
    throw new Error(`invalid destination in move: ${te.to}`);
  }
  const to = `${toFile}${String.fromCharCode(96 + toRank)}`;
  if (te.from === 0) {
    const letter = USI_DROP_LETTER[getKomashu(te.koma)];
    if (!letter || te.promote) throw new Error('invalid drop move');
    return `${letter}*${to}`;
  }

  const fromFile = getSuji(te.from);
  const fromRank = getDan(te.from);
  if (fromFile < 1 || fromFile > 9 || fromRank < 1 || fromRank > 9) {
    throw new Error(`invalid source in move: ${te.from}`);
  }
  return `${fromFile}${String.fromCharCode(96 + fromRank)}${to}${te.promote ? '+' : ''}`;
}

function parseExplicitBoardRow(rawLine: string, row: number): string[] {
  const prefix = `P${row}`;
  if (!rawLine.startsWith(prefix)) throw new Error(`invalid explicit CSA board row P${row}`);
  const body = rawLine.slice(prefix.length);
  if (body.length !== 27) {
    throw new Error(`explicit CSA board row P${row} must contain exactly nine 3-byte cells`);
  }
  const cells: string[] = [];
  for (let i = 0; i < 9; i++) {
    const cell = body.slice(i * 3, i * 3 + 3);
    if (cell.trim() === '*') {
      cells.push('*');
    } else if (/^[+-](FU|KY|KE|GI|KI|KA|HI|OU|TO|NY|NK|NG|UM|RY)$/.test(cell)) {
      cells.push(cell);
    } else {
      throw new Error(`invalid explicit CSA board cell in P${row}: ${JSON.stringify(cell)}`);
    }
  }
  return cells;
}

function assertHirate(
  sawPi: boolean,
  explicitRows: ReadonlyMap<number, readonly string[]>,
  initialSide: number | null,
  handsWereDeclared: boolean
): void {
  if (initialSide !== SENTE) {
    throw new Error('only a hirate game starting with Sente (+) is supported');
  }
  if (handsWereDeclared) {
    throw new Error('non-empty or explicitly modified hands are unsupported; only hirate is accepted');
  }
  if (sawPi) {
    if (explicitRows.size !== 0) throw new Error('CSA mixes PI with explicit board rows');
    return;
  }
  if (explicitRows.size !== 9) {
    throw new Error('unsupported initial position: expected PI or all nine hirate board rows');
  }
  for (let row = 1; row <= 9; row++) {
    const actual = explicitRows.get(row);
    const expected = HIRATE_CSA_ROWS[row - 1];
    if (!actual || actual.some((cell, index) => cell !== expected[index])) {
      throw new Error(`unsupported non-hirate initial position in P${row}`);
    }
  }
}

function parseRating(value: string): number | null {
  // Floodgate uses `<player-name>+<hash>:<rating>`. Names may begin with
  // digits, so the final colon-delimited field is authoritative.
  const trimmed = value.trim();
  const candidate = trimmed.slice(trimmed.lastIndexOf(':') + 1).trim();
  const match = candidate.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function metadataKey(key: string): string {
  return key.trim().replace(/^\$/, '').replace(/[\s-]+/g, '_').toUpperCase();
}

/**
 * Parse one completed CSA record. The first terminal marker ends parsing;
 * comments and any move-looking text after it cannot affect the game.
 */
export function parseCsaGame(input: string | Uint8Array, options: ParseCsaOptions): ParsedCsaGame {
  const encoding = options.encoding ?? (options.source === 'wcsc' ? 'shift_jis' : 'utf-8');
  const bytes = rawBytes(input);
  // Floodgate provenance is byte-oriented even for compatibility callers that
  // pass a string: parse the same UTF-8 snapshot that is hashed below.
  const decoded = decodeCsa(
    options.source === 'floodgate' ? bytes : typeof input === 'string' ? input : bytes,
    encoding
  );
  let text: string;
  if (options.source === 'floodgate') {
    if (decoded.startsWith('\uFEFF')) throw new Error('Floodgate CSA must not contain a UTF-8 BOM');
    if (decoded.includes('\0')) throw new Error('Floodgate CSA must not contain NUL');
    text = decoded.replace(/\r\n/g, '\n');
    if (text.includes('\r')) throw new Error('Floodgate CSA must not contain a bare CR');
  } else {
    text = decoded.replace(/\r\n?/g, '\n');
  }
  const lines = text.split('\n');

  let event: string | null = null;
  let site: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  let timeControl: string | null = null;
  let senteName: string | null = null;
  let goteName: string | null = null;
  let senteRating: number | null = null;
  let goteRating: number | null = null;
  let terminal: string | null = null;
  let sawPi = false;
  let initialSide: number | null = null;
  let handsWereDeclared = false;
  let positionValidated = false;
  const explicitRows = new Map<number, string[]>();
  const moves: ParsedCsaMove[] = [];
  const position = InitialPositionImproved.createInitialPosition();
  position.setTeban(SENTE);

  const applyMetadata = (rawKey: string, rawValue: string): void => {
    const key = metadataKey(rawKey);
    const value = rawValue.trim();
    if (key === 'EVENT') event = value || null;
    else if (key === 'SITE') site = value || null;
    else if (key === 'START_TIME') startTime = value || null;
    else if (key === 'END_TIME') endTime = value || null;
    else if (key === 'TIME') timeControl = value || null;
    else if (key === 'SENTE' || key === 'BLACK' || key === 'BLACK_NAME') senteName = value || null;
    else if (key === 'GOTE' || key === 'WHITE' || key === 'WHITE_NAME') goteName = value || null;
    else if (['SENTE_RATE', 'SENTE_RATING', 'BLACK_RATE', 'BLACK_RATING'].includes(key)) {
      senteRating = parseRating(value);
    } else if (['GOTE_RATE', 'GOTE_RATING', 'WHITE_RATE', 'WHITE_RATING'].includes(key)) {
      goteRating = parseRating(value);
    }
  };

  lineLoop: for (let index = 0; index < lines.length; index++) {
    const rawLine = index === 0 ? lines[index].replace(/^\uFEFF/, '') : lines[index];
    const wholeLine = rawLine.trim();
    if (wholeLine === '') continue;

    // A CSA comment occupies the entire physical line. Never split it on
    // commas or inspect move-looking analysis such as `'** 0 -9394FU`.
    if (wholeLine.startsWith("'")) {
      // Floodgate commonly stores ratings as comments such as 'black_rate:2991.
      const comment = wholeLine.slice(1).trim();
      const separator = comment.search(/[:=]/);
      if (separator >= 0) applyMetadata(comment.slice(0, separator), comment.slice(separator + 1));
      continue;
    }

    // CSA V3 permits comma-separated statements on one physical line, and
    // WCSC36 uses `<move>,T<seconds>` for every move.
    const statements = rawLine.split(',');
    for (const rawStatement of statements) {
      const line = rawStatement.trim();
      if (line === '') continue;

      // The first result statement is authoritative. Ignore all later
      // statements and physical lines, including move-looking text.
      if (line.startsWith('%')) {
        terminal = line.slice(1).trim();
        if (!terminal) throw new Error('empty CSA terminal marker');
        break lineLoop;
      }

      if (line.startsWith('$')) {
        const separator = line.search(/[:=]/);
        if (separator >= 0) applyMetadata(line.slice(0, separator), line.slice(separator + 1));
        continue;
      }
      if (line.startsWith('N+')) {
        senteName = line.slice(2).trim() || null;
        continue;
      }
      if (line.startsWith('N-')) {
        goteName = line.slice(2).trim() || null;
        continue;
      }
      if (/^V\d+(?:\.\d+)*$/.test(line) || /^T\d+$/.test(line)) continue;

      const moveMatch = MOVE_RE.exec(line);
      if (moveMatch) {
        if (!positionValidated) {
          assertHirate(sawPi, explicitRows, initialSide, handsWereDeclared);
          positionValidated = true;
        }
        const ply = moves.length;
        const parentSfen = toSfen(position, ply + 1);
        const move = resolveCsaMove(position, line);
        const usi = teToUsi(move);
        const sideToMove: 'b' | 'w' = position.teban === SENTE ? 'b' : 'w';
        position.move(move);
        position.toggleTeban();
        moves.push({
          ply,
          sideToMove,
          token: line,
          usi,
          parentSfen,
          childSfen: toSfen(position, ply + 2),
        });
        continue;
      }

      if (line === '+' || line === '-') {
        if (moves.length > 0 || initialSide !== null) throw new Error('duplicate or misplaced CSA initial side');
        initialSide = line === '+' ? SENTE : GOTE;
        continue;
      }
      if (line.startsWith('PI')) {
        if (moves.length > 0 || sawPi || explicitRows.size > 0) throw new Error('duplicate or misplaced PI line');
        if (line !== 'PI') throw new Error(`unsupported PI modification/handicap: ${line}`);
        sawPi = true;
        continue;
      }
      const boardMatch = /^P([1-9])/.exec(rawStatement);
      if (boardMatch) {
        if (moves.length > 0 || sawPi) throw new Error('duplicate or misplaced explicit board row');
        const row = Number(boardMatch[1]);
        if (explicitRows.has(row)) throw new Error(`duplicate explicit board row P${row}`);
        explicitRows.set(row, parseExplicitBoardRow(rawStatement, row));
        continue;
      }
      if (/^P[+-]/.test(line)) {
        if (moves.length > 0 || positionValidated) {
          throw new Error('duplicate or misplaced CSA hand declaration');
        }
        // Even an empty explicit P+/P- hand declaration is unnecessary for PI;
        // reject it so a future parser change cannot accidentally admit handicaps.
        handsWereDeclared = true;
        continue;
      }
      if (line.startsWith('+') || line.startsWith('-')) {
        throw new Error(`invalid CSA move token: ${line}`);
      }
      if (line.startsWith('P')) throw new Error(`unsupported CSA position line: ${line}`);
      throw new Error(`unsupported CSA statement: ${line}`);
    }
  }

  if (!positionValidated) assertHirate(sawPi, explicitRows, initialSide, handsWereDeclared);
  if (moves.length === 0) throw new Error('CSA record contains no legal moves');
  if ((options.requireTerminal ?? true) && terminal === null) {
    throw new Error('CSA record has no terminal marker');
  }
  if (terminal === null) terminal = 'UNKNOWN';

  const gameSha256 = sha256(bytes);
  const gameId = `sha256:${sha256(`${options.source}-game-v1\0${gameSha256}`)}`;
  const archiveSha256 = options.archiveSha256
    ? assertSha256(options.archiveSha256, 'archiveSha256')
    : null;

  return {
    schemaVersion: 1,
    source: options.source,
    sourceUrl: options.sourceUrl ?? null,
    recordPath: options.recordPath ?? null,
    archiveSha256,
    gameId,
    gameSha256,
    event,
    site,
    startTime,
    endTime,
    timeControl,
    players: { sente: senteName, gote: goteName },
    ratings: { sente: senteRating, gote: goteRating },
    terminal,
    moves,
  };
}

/** Compatibility wrapper for the optional Floodgate stage. */
export function parseFloodgateCsa(
  input: string | Uint8Array,
  sourceUrl: string | null = null
): ParsedCsaGame {
  return parseCsaGame(input, { source: 'floodgate', sourceUrl, encoding: 'utf-8' });
}

/** Build one provenance-preserving parent row per played move. */
export function buildParentOccurrences(game: ParsedCsaGame): RawParentOccurrence[] {
  return game.moves.map((move) => {
    const positionKey = move.parentSfen.split(/\s+/).slice(0, 3).join(' ');
    return {
      schema_version: 1,
      source: game.source,
      event: game.event,
      site: game.site,
      start_time: game.startTime,
      end_time: game.endTime,
      time_control: game.timeControl,
      game_id: game.gameId,
      game_sha256: game.gameSha256,
      parent_id: `sha256:${sha256(`parent-occurrence-v1\0${game.gameId}\0${move.ply}`)}`,
      position_id: `sha256:${sha256(`sfen-v1\0${positionKey}`)}`,
      parent_sfen: move.parentSfen,
      ply: move.ply,
      side_to_move: move.sideToMove,
      played_move: move.usi,
      played_move_csa: move.token,
      players: { ...game.players },
      ratings: { ...game.ratings },
      terminal: game.terminal,
      source_url: game.sourceUrl,
      record_path: game.recordPath,
      archive_sha256: game.archiveSha256,
    };
  });
}

/** Stable, append-only game-group split. All positions in a game share the result. */
export function stableGameSplit(
  gameId: string,
  options: { seed?: string; valRatio?: number } = {}
): DatasetSplit {
  const seed = options.seed ?? '0';
  const valRatio = options.valRatio ?? 0.1;
  if (!Number.isFinite(valRatio) || valRatio < 0 || valRatio > 1) {
    throw new Error('valRatio must be within [0, 1]');
  }
  if (valRatio === 0) return 'train';
  if (valRatio === 1) return 'val';
  const digest = sha256(`csa-game-split-v1\0${seed}\0${gameId}`);
  // 48 bits are exactly representable in a JavaScript number.
  const unit = Number.parseInt(digest.slice(0, 12), 16) / 0x1_0000_0000_0000;
  return unit < valRatio ? 'val' : 'train';
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)));
}

/** Extract, resolve, de-duplicate, and bytewise-sort CSA links from a directory listing. */
export function discoverCsaUrls(html: string, listingUrl: string): string[] {
  const urls = new Set<string>();
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (let match = hrefRe.exec(html); match; match = hrefRe.exec(html)) {
    const href = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? '');
    try {
      const url = new URL(href, listingUrl);
      if (!['http:', 'https:'].includes(url.protocol) || !/\.csa$/i.test(url.pathname)) continue;
      url.hash = '';
      urls.add(url.href);
    } catch {
      // Malformed hrefs in an index cannot become download targets.
    }
  }
  return [...urls].sort();
}

export interface CacheManifestEntry {
  schema: 1;
  source: CsaSource;
  url: string;
  sha256: string;
  bytes: number;
  object: string;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (url: string) => Promise<FetchLikeResponse>;

function objectPathForDigest(digest: string): string {
  return `objects/sha256/${digest.slice(0, 2)}/${digest}.csa`;
}

function validateManifestEntry(value: unknown): CacheManifestEntry {
  if (!value || typeof value !== 'object') throw new Error('cache manifest row must be an object');
  const row = value as Partial<CacheManifestEntry>;
  if (row.schema !== 1) throw new Error('unsupported cache manifest schema');
  if (row.source !== 'wcsc' && row.source !== 'floodgate') throw new Error('invalid cache manifest source');
  if (typeof row.url !== 'string') throw new Error('cache manifest URL is missing');
  const parsedUrl = new URL(row.url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error(`unsupported cache URL: ${row.url}`);
  if (typeof row.sha256 !== 'string') throw new Error('cache manifest digest is missing');
  const digest = assertSha256(row.sha256, 'cache manifest sha256');
  if (!Number.isSafeInteger(row.bytes) || (row.bytes as number) < 0) {
    throw new Error('cache manifest byte count must be a non-negative safe integer');
  }
  const expectedObject = objectPathForDigest(digest);
  if (row.object !== expectedObject) {
    throw new Error(`cache object path must be content-addressed: ${expectedObject}`);
  }
  return {
    schema: 1,
    source: row.source,
    url: parsedUrl.href,
    sha256: digest,
    bytes: row.bytes as number,
    object: expectedObject,
  };
}

/** Parse a URL-unique JSONL lock manifest. */
export function parseCacheManifest(text: string): Map<string, CacheManifestEntry> {
  const result = new Map<string, CacheManifestEntry>();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`invalid cache manifest JSON on line ${index + 1}`);
    }
    const entry = validateManifestEntry(parsed);
    if (result.has(entry.url)) throw new Error(`duplicate cache manifest URL: ${entry.url}`);
    result.set(entry.url, entry);
  }
  return result;
}

/** Serialize with fixed key order, URL order, LF endings, and no timestamps. */
export function serializeCacheManifest(entries: Iterable<CacheManifestEntry>): string {
  const byUrl = new Map<string, CacheManifestEntry>();
  for (const value of entries) {
    const entry = validateManifestEntry(value);
    if (byUrl.has(entry.url)) throw new Error(`duplicate cache manifest URL: ${entry.url}`);
    byUrl.set(entry.url, entry);
  }
  const rows = [...byUrl.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  if (rows.length === 0) return '';
  return `${rows
    .map((entry) =>
      JSON.stringify({
        schema: 1,
        source: entry.source,
        url: entry.url,
        sha256: entry.sha256,
        bytes: entry.bytes,
        object: entry.object,
      })
    )
    .join('\n')}\n`;
}

/** Atomic file replacement used for manifests, reports, and datasets. */
export async function atomicWriteFile(filePath: string, data: string | Uint8Array): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.promises.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  try {
    await fs.promises.writeFile(temporary, data, { flag: 'wx' });
    await fs.promises.rename(temporary, filePath);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

/** Read and verify a cached object before returning any bytes. */
export async function verifyCachedObject(
  cacheDir: string,
  entryValue: CacheManifestEntry
): Promise<Uint8Array> {
  const entry = validateManifestEntry(entryValue);
  const objectPath = path.join(cacheDir, ...entry.object.split('/'));
  let bytes: Buffer;
  try {
    bytes = await fs.promises.readFile(objectPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new Error(`locked cache object is missing for ${entry.url}`);
    throw error;
  }
  if (bytes.byteLength !== entry.bytes) {
    throw new Error(`cache byte-count mismatch for ${entry.url}`);
  }
  const actual = sha256(bytes);
  if (actual !== entry.sha256) {
    throw new Error(`cache checksum mismatch for ${entry.url}: expected ${entry.sha256}, got ${actual}`);
  }
  return bytes;
}

export async function verifyManifestCache(
  cacheDir: string,
  entries: Iterable<CacheManifestEntry>
): Promise<void> {
  const sorted = [...entries]
    .map(validateManifestEntry)
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  for (const entry of sorted) await verifyCachedObject(cacheDir, entry);
}

async function writeCacheObject(cacheDir: string, digest: string, bytes: Uint8Array): Promise<string> {
  const object = objectPathForDigest(digest);
  const objectPath = path.join(cacheDir, ...object.split('/'));
  try {
    const existing = await fs.promises.readFile(objectPath);
    if (sha256(existing) !== digest || existing.byteLength !== bytes.byteLength) {
      throw new Error(`content-addressed cache object is corrupt: ${object}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await atomicWriteFile(objectPath, bytes);
  }
  return object;
}

export interface LoadOrFetchObjectOptions {
  cacheDir: string;
  manifest: Map<string, CacheManifestEntry>;
  source?: CsaSource;
  offline?: boolean;
  refresh?: boolean;
  updateLock?: boolean;
  fetchImpl?: FetchLike;
}

/**
 * Load a checksum-locked object, or fetch raw bytes through an injectable fetch.
 * A changed remote body is rejected unless `updateLock` is explicit.
 */
export async function loadOrFetchObject(
  rawUrl: string,
  options: LoadOrFetchObjectOptions
): Promise<{ bytes: Uint8Array; entry: CacheManifestEntry }> {
  const url = new URL(rawUrl).href;
  const existing = options.manifest.get(url);
  if (existing) {
    // Never repair or replace a locally tampered cache silently, even online.
    const lockedBytes = await verifyCachedObject(options.cacheDir, existing);
    if (options.offline || !options.refresh) return { bytes: lockedBytes, entry: existing };
  } else if (options.offline) {
    throw new Error(`offline cache miss for ${url}`);
  }

  const fetchImpl: FetchLike =
    options.fetchImpl ??
    (async (target) => {
      const response = await fetch(target);
      return response;
    });
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`fetch failed for ${url}: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (existing && digest !== existing.sha256 && !options.updateLock) {
    throw new Error(
      `remote checksum changed for ${url}: locked ${existing.sha256}, received ${digest}; use updateLock explicitly`
    );
  }
  const object = await writeCacheObject(options.cacheDir, digest, bytes);
  const entry: CacheManifestEntry = {
    schema: 1,
    source: options.source ?? existing?.source ?? 'floodgate',
    url,
    sha256: digest,
    bytes: bytes.byteLength,
    object,
  };
  options.manifest.set(url, entry);
  return { bytes, entry };
}

async function listCsaFiles(root: string): Promise<string[]> {
  const rootAbsolute = path.resolve(root);
  const stat = await fs.promises.stat(rootAbsolute);
  if (!stat.isDirectory()) throw new Error(`--csa-dir is not a directory: ${root}`);
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && /\.csa$/i.test(entry.name)) result.push(absolute);
      else if (entry.isSymbolicLink() && /\.csa$/i.test(entry.name)) {
        throw new Error(`symbolic-link CSA input is unsupported: ${absolute}`);
      }
    }
  };
  await visit(rootAbsolute);
  return result;
}

function deterministicJsonl(rows: readonly RawParentOccurrence[]): string {
  return rows.length === 0 ? '' : `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
}

export interface ImportCsaDirectoryOptions {
  csaDir: string;
  source: CsaSource;
  sourceUrl: string;
  archiveSha256: string;
  archiveFile?: string | null;
  out: string;
  report?: string | null;
  encoding?: CsaEncoding;
  minPly?: number;
  maxPly?: number;
  allowRejected?: boolean;
}

export interface ImportCsaReport {
  schema_version: 1;
  source: CsaSource;
  source_url: string;
  archive_sha256: string;
  archive_sha256_verified: boolean;
  record_set_sha256: string;
  csa_files: number;
  accepted_games: number;
  rejected_games: number;
  parent_occurrences: number;
  min_ply: number;
  max_ply: number;
  dataset_sha256: string;
  output_written: boolean;
  records: Array<{
    path: string;
    sha256: string;
    game_id: string | null;
    moves: number;
    parents: number;
    error: string | null;
  }>;
}

interface PathIdentity {
  entryPath: string;
  targetPath?: string;
  device?: number;
  inode?: number;
}

async function potentialOutputEntryPath(filePath: string): Promise<string> {
  const absolute = path.resolve(filePath);
  let current = path.dirname(absolute);
  const missing: string[] = [];
  while (true) {
    try {
      const resolved = await fs.promises.realpath(current);
      return path.join(resolved, ...missing, path.basename(absolute));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function outputPathIdentity(filePath: string): Promise<PathIdentity> {
  const entryPath = await potentialOutputEntryPath(filePath);
  try {
    const targetPath = await fs.promises.realpath(entryPath);
    const stat = await fs.promises.stat(targetPath);
    return { entryPath, targetPath, device: stat.dev, inode: stat.ino };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { entryPath };
  }
}

async function inputPathIdentity(filePath: string): Promise<PathIdentity> {
  const targetPath = await fs.promises.realpath(path.resolve(filePath));
  const stat = await fs.promises.stat(targetPath);
  return { entryPath: targetPath, targetPath, device: stat.dev, inode: stat.ino };
}

function samePathIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.entryPath === right.entryPath ||
    (left.targetPath !== undefined && left.targetPath === right.targetPath) ||
    (
      left.device !== undefined &&
      right.device !== undefined &&
      left.device === right.device &&
      left.inode === right.inode
    );
}

/** Import a pinned, extracted CSA archive without any network access. */
export async function importCsaDirectory(options: ImportCsaDirectoryOptions): Promise<ImportCsaReport> {
  const archiveSha256 = assertSha256(options.archiveSha256, '--archive-sha256');
  const sourceUrl = new URL(options.sourceUrl).href;
  const minPly = options.minPly ?? 0;
  const maxPly = options.maxPly ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(minPly) || !Number.isSafeInteger(maxPly) || minPly < 0 || maxPly < minPly) {
    throw new Error('invalid --min-ply/--max-ply range');
  }

  let archiveSha256Verified = false;
  if (options.archiveFile) {
    const archiveBytes = await fs.promises.readFile(options.archiveFile);
    const actual = sha256(archiveBytes);
    if (actual !== archiveSha256) {
      throw new Error(`archive checksum mismatch: expected ${archiveSha256}, got ${actual}`);
    }
    archiveSha256Verified = true;
  }

  const root = path.resolve(options.csaDir);
  const files = await listCsaFiles(root);
  if (files.length === 0) throw new Error(`no .csa files found under ${root}`);
  const outputIdentities = await Promise.all([
    outputPathIdentity(options.out),
    ...(options.report ? [outputPathIdentity(options.report)] : []),
  ]);
  if (outputIdentities.length === 2 && samePathIdentity(outputIdentities[0], outputIdentities[1])) {
    throw new Error('--out and --report must refer to different files');
  }
  const protectedInputs = await Promise.all([
    ...files.map(inputPathIdentity),
    ...(options.archiveFile ? [inputPathIdentity(options.archiveFile)] : []),
  ]);
  if (outputIdentities.some((output) => protectedInputs.some((input) => samePathIdentity(output, input)))) {
    throw new Error('dataset/report output must not alias a CSA or archive input');
  }

  const records: ImportCsaReport['records'] = [];
  const parents: RawParentOccurrence[] = [];
  const seenGameIds = new Map<string, string>();

  for (const file of files) {
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    const bytes = await fs.promises.readFile(file);
    const recordSha = sha256(bytes);
    try {
      const game = parseCsaGame(bytes, {
        source: options.source,
        sourceUrl,
        recordPath: relativePath,
        archiveSha256,
        encoding: options.encoding,
      });
      const duplicate = seenGameIds.get(game.gameId);
      if (duplicate) throw new Error(`duplicate game content also found in ${duplicate}`);
      seenGameIds.set(game.gameId, relativePath);
      const gameParents = buildParentOccurrences(game).filter((row) => row.ply >= minPly && row.ply <= maxPly);
      parents.push(...gameParents);
      records.push({
        path: relativePath,
        sha256: recordSha,
        game_id: game.gameId,
        moves: game.moves.length,
        parents: gameParents.length,
        error: null,
      });
    } catch (error) {
      records.push({
        path: relativePath,
        sha256: recordSha,
        game_id: null,
        moves: 0,
        parents: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  parents.sort((a, b) => {
    if (a.game_id !== b.game_id) return a.game_id < b.game_id ? -1 : 1;
    return a.ply - b.ply;
  });
  const dataset = deterministicJsonl(parents);
  const rejectedGames = records.filter((record) => record.error !== null).length;
  const recordSetLock = records.map((record) => `${record.path}\0${record.sha256}`).join('\n');
  const report: ImportCsaReport = {
    schema_version: 1,
    source: options.source,
    source_url: sourceUrl,
    archive_sha256: archiveSha256,
    archive_sha256_verified: archiveSha256Verified,
    record_set_sha256: sha256(recordSetLock),
    csa_files: records.length,
    accepted_games: records.length - rejectedGames,
    rejected_games: rejectedGames,
    parent_occurrences: parents.length,
    min_ply: minPly,
    max_ply: maxPly,
    dataset_sha256: sha256(dataset),
    output_written: false,
    records,
  };

  // Publish a conservative report first. If dataset publication fails, the
  // report remains truthful (`output_written=false`) instead of blessing a
  // stale or partially replaced output from an earlier run.
  if (options.report) await atomicWriteFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  if (rejectedGames > 0 && !options.allowRejected) {
    throw new Error(
      `${rejectedGames} CSA file(s) were rejected; no dataset was written. Inspect ${options.report ?? 'the returned report'}`
    );
  }
  await atomicWriteFile(options.out, dataset);
  report.output_written = true;
  if (options.report) await atomicWriteFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

interface CliArgs extends ImportCsaDirectoryOptions {
  help: boolean;
}

function parseCliArgs(argv: readonly string[]): CliArgs {
  const help = argv.includes('--help') || argv.includes('-h');
  if (help) {
    return {
      help,
      csaDir: '',
      source: 'wcsc',
      sourceUrl: 'https://example.invalid/',
      archiveSha256: '0'.repeat(64),
      out: '',
    };
  }
  const valueOptions = new Set([
    'csa-dir',
    'source',
    'source-url',
    'archive-sha256',
    'archive-file',
    'out',
    'report',
    'encoding',
    'min-ply',
    'max-ply',
  ]);
  const values = new Map<string, string>();
  let allowRejected = false;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === 'allow-rejected') {
      if (allowRejected) throw new Error('duplicate option: --allow-rejected');
      allowRejected = true;
      continue;
    }
    if (!valueOptions.has(name)) throw new Error(`unknown option: --${name}`);
    if (values.has(name)) throw new Error(`duplicate option: --${name}`);
    const optionValue = argv[++index];
    if (!optionValue || optionValue.startsWith('--')) throw new Error(`--${name} requires a value`);
    values.set(name, optionValue);
  }
  const csaDir = values.get('csa-dir');
  const sourceRaw = values.get('source');
  const sourceUrl = values.get('source-url');
  const archiveSha256 = values.get('archive-sha256');
  if (!csaDir || !sourceRaw || !sourceUrl || !archiveSha256) {
    throw new Error('--csa-dir, --source, --source-url, and --archive-sha256 are required');
  }
  if (sourceRaw !== 'wcsc' && sourceRaw !== 'floodgate') {
    throw new Error('--source must be wcsc or floodgate');
  }
  const defaultRoot = path.join(__dirname, 'data', sourceRaw);
  const minPlyRaw = values.get('min-ply') ?? null;
  const maxPlyRaw = values.get('max-ply') ?? null;
  const encodingRaw = values.get('encoding') ?? null;
  if (encodingRaw && encodingRaw !== 'shift_jis' && encodingRaw !== 'utf-8') {
    throw new Error('--encoding must be shift_jis or utf-8');
  }
  return {
    help,
    csaDir,
    source: sourceRaw,
    sourceUrl,
    archiveSha256,
    archiveFile: values.get('archive-file') ?? null,
    out: values.get('out') ?? path.join(defaultRoot, 'parents.raw.jsonl'),
    report: values.get('report') ?? path.join(defaultRoot, 'import-report.json'),
    encoding: (encodingRaw as CsaEncoding | null) ?? undefined,
    minPly: minPlyRaw === null ? 0 : Number(minPlyRaw),
    maxPly: maxPlyRaw === null ? Number.MAX_SAFE_INTEGER : Number(maxPlyRaw),
    allowRejected,
  };
}

const USAGE = `Usage:
  node -r tsx/cjs ml/import-csa-games.ts \\
    --csa-dir <extracted-directory> \\
    --source <wcsc|floodgate> \\
    --source-url <provenance-url> \\
    --archive-sha256 <64-hex> [options]

Options:
  --archive-file <zip>  Verify the supplied archive SHA against the original ZIP.
  --out <jsonl>         Raw parent occurrences (contains no cp labels).
  --report <json>       Deterministic import/checksum report.
  --encoding <name>     shift_jis or utf-8 (default: source-specific).
  --min-ply <n>         Keep parent occurrences from this zero-based ply.
  --max-ply <n>         Keep parent occurrences through this zero-based ply.
  --allow-rejected      Write accepted games despite rejected CSA files.
`;

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  const report = await importCsaDirectory(args);
  process.stdout.write(
    `Imported ${report.accepted_games} game(s), ${report.parent_occurrences} parent occurrence(s); dataset sha256=${report.dataset_sha256}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
