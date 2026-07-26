/**
 * Import a YaneuraOu "petashock" opening book (.db, YANEURAOU-DB2016 text format)
 * into the compact binary book consumed by OpeningBookImproved at runtime
 * (public/shogi-opening-book-v2.bin).
 *
 * Data source (MIT License, redistribution permitted):
 *   新ペタショック定跡 233万局面 — https://github.com/yaneurao/YaneuraOu/releases/tag/new_petabook233
 *   (WCSC35 でやねうら王チームが使用。1局面あたり 1T=2億ノード探索の minimax 値付き)
 *
 * Pipeline:
 * 1. Index the .db by SFEN (board+turn+hand, ply stripped). All entries in this book are
 *    black-to-move (FlippedBook normalized), so white-to-move positions are looked up via the
 *    180°-rotated/color-swapped SFEN and the moves are un-flipped.
 * 2. BFS from the initial position, replaying book moves with the TS engine
 *    (KyokumenImproved), which guarantees legality AND gives us the runtime Zobrist hash
 *    (KyokumenImproved.HashVal) for each stored position.
 *    - stored moves  : within STORE_WINDOW cp of the entry best, |value| <= STORE_ABS_MAX
 *    - expanded moves: within EXPAND_WINDOW cp of the entry best (so we stay in book when the
 *      opponent plays a slightly inferior but still book move)
 * 3. Emit:
 *    - a CANDIDATE binary book (sorted by hash; format below, decoder in OpeningBookImproved.ts)
 *    - a meta JSONL (sfen + stored moves + values + packed encoding)
 *
 * NOTE: the candidate book is NOT the shipped book. The petashock minimax values disagree
 * with single depth-18 searches for ~1.5% of moves (style/eval differences), so every stored
 * move is then depth-18-checked and pruned by scripts/shogi-petashock-book-fullcheck.ts,
 * which rewrites public/shogi-opening-book-v2.bin with only engine-approved moves.
 *
 * Binary format (little-endian), decoder: loadExternalOpeningBook():
 *   uint32 magic "SBK2" (0x324b4253)
 *   uint32 count
 *   count * entry:
 *     uint32 hashA  — KyokumenImproved.HashVal (side-to-move included)
 *     uint32 hashB  — KyokumenImproved.SecondaryHashVal (independent full-width lock)
 *     uint8  nMoves
 *     nMoves * { uint8 from, uint8 to, uint8 flags }
 *       from/to: (suji<<4)|dan, from=0 for drops
 *       flags: bit0 = promote, bits1-3 = dropped piece type (FU..HI = 1..7, 0 = not a drop)
 *
 * Usage:
 *   node -r tsx/cjs scripts/shogi-import-petashock-book.ts <path/to/user_book1.db> \
 *     [--out public/shogi-opening-book-v2.bin] [--meta <path>] [--max-ply 24] [--max-positions 40000]
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import {
  EMPTY, FU, KY, KE, GI, KI, KA, HI, OU, PROMOTE,
  SENTE, GOTE, Te, getKomashu, isSelf,
} from '../src/components/game/ShogiImproved/types';

// --- CLI ---------------------------------------------------------------------

function argValue(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const DB_PATH = process.argv[2];
if (!DB_PATH || DB_PATH.startsWith('--')) {
  console.error('usage: node -r tsx/cjs scripts/shogi-import-petashock-book.ts <user_book1.db> [--out ...] [--meta ...]');
  process.exit(2);
}
const OUT_PATH = argValue('--out', path.resolve(__dirname, '../public/shogi-opening-book-v2.bin'));
const META_PATH = argValue('--meta', path.join(os.tmpdir(), 'shogi-opening-book-meta.jsonl'));
const MAX_PLY = Number(argValue('--max-ply', '24'));
const MAX_POSITIONS = Number(argValue('--max-positions', '40000'));
/**
 * Deep-ply pruning (v2, 30-ply book): from DEEP_FROM onward the frontier of each ply is
 * capped to DEEP_FRONTIER * DEEP_DECAY^(ply - DEEP_FROM) nodes, keeping the lowest-pathGap
 * (most mainline-ish) nodes. The petashock "num" (採択回数) field is 0 for every move in this
 * book, so cumulative distance from the mainline is our "most played" proxy; it is what the
 * BFS already used for its stop-order. 0 = disabled.
 */
const DEEP_FROM = Number(argValue('--deep-from', '0'));
const DEEP_FRONTIER = Number(argValue('--deep-frontier', '9000'));
const DEEP_DECAY = Number(argValue('--deep-decay', '0.9'));

/** Stored (playable) moves: at most this far below the entry's best move. */
const STORE_WINDOW = 50;
/** Stored moves must be near-balanced overall (openings should not be decided). */
const STORE_ABS_MAX = 300;
/** Expansion follows slightly inferior book moves too (opponent coverage). */
const EXPAND_WINDOW = 120;
const EXPAND_ABS_MAX = 400;
const MAX_STORED_MOVES_PER_POS = 4;
const MAX_EXPAND_MOVES_PER_POS = 5;
/**
 * Humans pick from a WIDE set of reasonable moves in the first few plies (▲7六歩に対する
 * △3四歩 is petashock's 6th move at gap 31cp — a plain cap of 5 dropped it and with it the
 * whole 振り飛車/角換わり-via-3四歩 subtree). Allow more expansion branches near the root;
 * the tree is tiny there, so the position-count cost is small.
 */
const SHALLOW_EXPAND_MOVES_PER_POS = Number(argValue('--shallow-expand', '8'));
const SHALLOW_EXPAND_MAX_PLY = Number(argValue('--shallow-expand-max-ply', '6'));

// --- SFEN helpers (KyokumenImproved -> YaneuraOu book key) ---------------------

const SFEN_LETTER: Record<number, string> = {
  [FU]: 'P', [KY]: 'L', [KE]: 'N', [GI]: 'S', [KI]: 'G', [KA]: 'B', [HI]: 'R', [OU]: 'K',
};
/** Hand order used by YaneuraOu SFEN: R B G S N L P. */
const HAND_ORDER = [HI, KA, KI, GI, KE, KY, FU];

function pieceToSfen(p: number): string {
  const type = getKomashu(p);
  // FU..HI = 1..7, OU = 8, TO..RY = 9..15 (note: OU & ~PROMOTE would be 0, so compare > OU).
  const promoted = type > OU;
  const base = SFEN_LETTER[promoted ? type - PROMOTE : type] ?? '?';
  const s = (promoted ? '+' : '') + base;
  return isSelf(SENTE, p) ? s : s.toLowerCase();
}

/**
 * Book key: `<board> <turn> <hand>` (ply stripped).
 * `flip=true` produces the key of the 180°-rotated, color-swapped position with the turn
 * flipped — i.e. the black-to-move image of a white-to-move position (FlippedBook).
 */
function sfenKeyOf(k: KyokumenImproved, flip: boolean): string {
  let board = '';
  for (let dan = 1; dan <= 9; dan++) {
    if (dan > 1) board += '/';
    let empties = 0;
    for (let suji = 9; suji >= 1; suji--) {
      const p = flip ? swapSide(k.ban[((10 - suji) << 4) + (10 - dan)]) : k.ban[(suji << 4) + dan];
      if (p === EMPTY) {
        empties++;
        continue;
      }
      if (empties > 0) {
        board += String(empties);
        empties = 0;
      }
      board += pieceToSfen(p);
    }
    if (empties > 0) board += String(empties);
  }

  const tebanSente = flip ? k.teban !== SENTE : k.teban === SENTE;
  const turn = tebanSente ? 'b' : 'w';

  let hand = '';
  for (const side of [SENTE, GOTE]) {
    const src = flip ? (side === SENTE ? GOTE : SENTE) : side;
    for (const type of HAND_ORDER) {
      const n = k.hand[src | type] | 0;
      if (n === 0) continue;
      if (n > 1) hand += String(n);
      hand += side === SENTE ? SFEN_LETTER[type] : SFEN_LETTER[type].toLowerCase();
    }
  }
  if (hand === '') hand = '-';

  return `${board} ${turn} ${hand}`;
}

function swapSide(p: number): number {
  if (p === EMPTY) return EMPTY;
  const type = getKomashu(p);
  return isSelf(SENTE, p) ? (GOTE | type) : (SENTE | type);
}

// --- USI move helpers ----------------------------------------------------------

const DROP_TYPE: Record<string, number> = { P: FU, L: KY, N: KE, S: GI, G: KI, B: KA, R: HI };

interface UsiMove {
  drop: number; // 0 = board move
  fromSuji: number;
  fromDan: number;
  toSuji: number;
  toDan: number;
  promote: boolean;
}

function parseUsi(usi: string): UsiMove | null {
  if (usi.length < 4) return null;
  const toSuji = usi.charCodeAt(2) - 0x30;
  const toDan = usi.charCodeAt(3) - 0x60; // 'a' -> 1
  if (toSuji < 1 || toSuji > 9 || toDan < 1 || toDan > 9) return null;
  if (usi[1] === '*') {
    const drop = DROP_TYPE[usi[0]];
    if (!drop) return null;
    return { drop, fromSuji: 0, fromDan: 0, toSuji, toDan, promote: false };
  }
  const fromSuji = usi.charCodeAt(0) - 0x30;
  const fromDan = usi.charCodeAt(1) - 0x60;
  if (fromSuji < 1 || fromSuji > 9 || fromDan < 1 || fromDan > 9) return null;
  return { drop: 0, fromSuji, fromDan, toSuji, toDan, promote: usi.endsWith('+') };
}

/** Un-flip a move parsed from a flipped-orientation book entry. */
function flipUsiMove(m: UsiMove): UsiMove {
  return {
    drop: m.drop,
    fromSuji: m.drop ? 0 : 10 - m.fromSuji,
    fromDan: m.drop ? 0 : 10 - m.fromDan,
    toSuji: 10 - m.toSuji,
    toDan: 10 - m.toDan,
    promote: m.promote,
  };
}

function usiOf(m: UsiMove): string {
  const danChar = (d: number): string => String.fromCharCode(0x60 + d);
  if (m.drop) {
    const letter = Object.entries(DROP_TYPE).find(([, v]) => v === m.drop)![0];
    return `${letter}*${m.toSuji}${danChar(m.toDan)}`;
  }
  return `${m.fromSuji}${danChar(m.fromDan)}${m.toSuji}${danChar(m.toDan)}${m.promote ? '+' : ''}`;
}

function findLegal(legal: Te[], m: UsiMove, teban: number): Te | null {
  const from = m.drop ? 0 : (m.fromSuji << 4) + m.fromDan;
  const to = (m.toSuji << 4) + m.toDan;
  for (const t of legal) {
    if (t.to !== to || t.from !== from) continue;
    if (m.drop) {
      if (t.koma === (m.drop | teban)) return t;
      continue;
    }
    if (t.promote === m.promote) return t;
  }
  return null;
}

// --- .db indexing ----------------------------------------------------------------

interface BookMoveRow {
  usi: string;
  value: number;
}

/**
 * Index: sfen key -> byte offset of the first move line. Move lines are parsed lazily —
 * BFS touches a tiny fraction of the 2.25M entries.
 */
function buildIndex(buf: Buffer): Map<string, number> {
  const index = new Map<string, number>();
  const len = buf.length;
  let pos = 0;
  const SFEN = Buffer.from('sfen ');
  while (pos < len) {
    let eol = buf.indexOf(0x0a, pos);
    if (eol < 0) eol = len;
    if (eol - pos > 5 && buf.compare(SFEN, 0, 5, pos, pos + 5) === 0) {
      let end = eol;
      if (buf[end - 1] === 0x0d) end--;
      const line = buf.toString('latin1', pos + 5, end);
      // Strip the trailing ply token (IgnoreBookPly semantics).
      const lastSpace = line.lastIndexOf(' ');
      const key = lastSpace > 0 ? line.slice(0, lastSpace) : line;
      index.set(key, eol + 1);
    }
    pos = eol + 1;
  }
  return index;
}

function parseMovesAt(buf: Buffer, offset: number): BookMoveRow[] {
  const rows: BookMoveRow[] = [];
  let pos = offset;
  const len = buf.length;
  while (pos < len) {
    let eol = buf.indexOf(0x0a, pos);
    if (eol < 0) eol = len;
    let end = eol;
    if (end > pos && buf[end - 1] === 0x0d) end--;
    const line = buf.toString('latin1', pos, end);
    pos = eol + 1;
    if (line.startsWith('sfen ') || line.startsWith('#')) break;
    if (line.trim() === '') continue;
    const parts = line.split(' ');
    // <move> <ponder> <value> <depth> <num>
    if (parts.length < 3) continue;
    const value = Number(parts[2]);
    if (!Number.isFinite(value)) continue;
    rows.push({ usi: parts[0], value });
  }
  return rows;
}

// --- BFS ---------------------------------------------------------------------------

interface StoredMove {
  te: Te;
  usi: string; // in OUR orientation (matches the meta sfen)
  value: number;
}

interface StoredEntry {
  hashA: number;
  hashB: number;
  ply: number;
  sfen: string; // full sfen of the position in OUR orientation (with ply 1 appended for USI use)
  moves: StoredMove[];
  bestValue: number;
}

interface Node {
  k: KyokumenImproved;
  ply: number;
  pathGap: number;
}

function main(): void {
  console.log(`reading ${DB_PATH} ...`);
  const t0 = Date.now();
  const buf = fs.readFileSync(DB_PATH);
  console.log(`  ${(buf.length / 1e6).toFixed(1)} MB`);
  const index = buildIndex(buf);
  console.log(`  indexed ${index.size} positions in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const visited = new Set<string>();
  const storedByIdentity = new Map<string, StoredEntry>();
  let hashCollisions = 0;
  let lookupMisses = 0;
  let unmatchedMoves = 0;
  const perPlyStored: number[] = new Array(MAX_PLY + 1).fill(0);

  const root = InitialPositionImproved.createInitialPosition();
  root.setTeban(SENTE);
  let frontier: Node[] = [{ k: root, ply: 0, pathGap: 0 }];
  visited.add(sfenKeyOf(root, false));

  let stop = false;
  for (let ply = 0; ply <= MAX_PLY && frontier.length > 0 && !stop; ply++) {
    // Mainline-ish nodes first so the position budget is spent on plausible lines.
    frontier.sort((a, b) => a.pathGap - b.pathGap);
    if (DEEP_FROM > 0 && ply >= DEEP_FROM) {
      const budget = Math.max(1, Math.round(DEEP_FRONTIER * Math.pow(DEEP_DECAY, ply - DEEP_FROM)));
      if (frontier.length > budget) frontier.length = budget;
    }
    const next: Node[] = [];

    for (const node of frontier) {
      const { k } = node;
      const flip = k.teban !== SENTE; // every entry in this book is black-to-move
      const key = sfenKeyOf(k, flip);
      const off = index.get(key);
      if (off === undefined) {
        lookupMisses++;
        continue;
      }
      const rows = parseMovesAt(buf, off);
      if (rows.length === 0) continue;

      const best = Math.max(...rows.map((r) => r.value));
      const legal = GenerateMovesImproved.generateLegalMoves(k);

      const stored: StoredMove[] = [];
      const expand: Array<{ te: Te; gap: number }> = [];
      const expandCap = node.ply <= SHALLOW_EXPAND_MAX_PLY ? SHALLOW_EXPAND_MOVES_PER_POS : MAX_EXPAND_MOVES_PER_POS;
      const sortedRows = [...rows].sort((a, b) => b.value - a.value);
      for (const row of sortedRows) {
        const parsed = parseUsi(row.usi.replace(/\+$/, '+')); // no-op; keep explicit
        if (!parsed) continue;
        const ours = flip ? flipUsiMove(parsed) : parsed;
        const te = findLegal(legal, ours, k.teban);
        if (!te) {
          unmatchedMoves++;
          // In practice these are 不成 moves (this engine force-promotes bishop/rook), which
          // the engine cannot play anyway — set BOOK_DEBUG_UNMATCHED=1 to inspect.
          if (process.env.BOOK_DEBUG_UNMATCHED) {
            console.log(`  unmatched: ${row.usi} (ours=${usiOf(ours)}) at "${sfenKeyOf(k, false)}"`);
          }
          continue;
        }
        const gap = best - row.value;
        if (gap <= STORE_WINDOW && Math.abs(row.value) <= STORE_ABS_MAX && stored.length < MAX_STORED_MOVES_PER_POS) {
          stored.push({ te, usi: usiOf(ours), value: row.value });
        }
        if (gap <= EXPAND_WINDOW && Math.abs(row.value) <= EXPAND_ABS_MAX && expand.length < expandCap) {
          expand.push({ te, gap });
        }
      }

      if (stored.length > 0 && storedByIdentity.size < MAX_POSITIONS) {
        const hashA = k.HashVal >>> 0;
        const hashB = k.SecondaryHashVal >>> 0;
        const identity = `${hashA}:${hashB}`;
        if (storedByIdentity.has(identity)) {
          // Same full identity reached by another line: keep the shallower entry
          // (already stored — BFS is level-ordered), drop this duplicate.
          hashCollisions++;
        } else {
          storedByIdentity.set(identity, {
            hashA,
            hashB,
            ply: node.ply,
            sfen: `${sfenKeyOf(k, false)} 1`,
            moves: stored,
            bestValue: best,
          });
          perPlyStored[node.ply]++;
        }
      }
      if (storedByIdentity.size >= MAX_POSITIONS) {
        stop = true;
        break;
      }

      if (node.ply < MAX_PLY) {
        for (const { te, gap } of expand) {
          const child = k.clone();
          child.move(te);
          child.toggleTeban();
          const childKey = sfenKeyOf(child, false);
          if (visited.has(childKey)) continue;
          visited.add(childKey);
          next.push({ k: child, ply: node.ply + 1, pathGap: node.pathGap + gap });
        }
      }
    }

    console.log(
      `ply ${String(ply).padStart(2)}: stored total=${storedByIdentity.size}, frontier next=${next.length}`
    );
    frontier = next;
  }

  // --- emit ------------------------------------------------------------------

  const entries = [...storedByIdentity.values()].sort(
    (a, b) => a.hashA - b.hashA || a.hashB - b.hashB,
  );
  let bytes = 8;
  for (const e of entries) bytes += 9 + e.moves.length * 3;
  const out = Buffer.alloc(bytes);
  out.writeUInt32LE(0x324b4253, 0); // "SBK2"
  out.writeUInt32LE(entries.length, 4);
  let o = 8;
  for (const e of entries) {
    out.writeUInt32LE(e.hashA, o); o += 4;
    out.writeUInt32LE(e.hashB, o); o += 4;
    out.writeUInt8(e.moves.length, o); o += 1;
    for (const m of e.moves) {
      const flags = (m.te.promote ? 1 : 0) | (m.te.from === 0 ? (getKomashu(m.te.koma) & 7) << 1 : 0);
      out.writeUInt8(m.te.from & 0xff, o); o += 1;
      out.writeUInt8(m.te.to & 0xff, o); o += 1;
      out.writeUInt8(flags, o); o += 1;
    }
  }
  fs.writeFileSync(OUT_PATH, out);

  const meta = entries
    .map((e) =>
      JSON.stringify({
        sfen: e.sfen,
        ply: e.ply,
        hashA: e.hashA,
        hashB: e.hashB,
        best: e.bestValue,
        moves: e.moves.map((m) => ({
          usi: m.usi,
          value: m.value,
          // Packed runtime encoding (from, to, flags) so downstream tools (fullcheck) can
          // rebuild the binary book without replaying positions.
          pack: [
            m.te.from & 0xff,
            m.te.to & 0xff,
            (m.te.promote ? 1 : 0) | (m.te.from === 0 ? (getKomashu(m.te.koma) & 7) << 1 : 0),
          ],
        })),
      })
    )
    .join('\n');
  fs.writeFileSync(META_PATH, meta + '\n');

  const totalMoves = entries.reduce((s, e) => s + e.moves.length, 0);
  console.log(`\nwrote ${OUT_PATH}: ${entries.length} positions, ${totalMoves} moves, ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`wrote ${META_PATH} (verification metadata)`);
  console.log(`per-ply stored: ${perPlyStored.map((n, i) => `${i}:${n}`).filter((s) => !s.endsWith(':0')).join(' ')}`);
  console.log(`hash collisions dropped: ${hashCollisions}, lookup misses: ${lookupMisses}, unmatched usi moves: ${unmatchedMoves}`);
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
