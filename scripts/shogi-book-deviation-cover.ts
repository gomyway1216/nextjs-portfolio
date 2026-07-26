/**
 * Human-deviation coverage generator for the external opening book (v2, ②).
 *
 * PROBLEM: the petashock book is engine-vs-engine best play, so a human who plays a natural
 * but non-book move drops the AI out of book early (measured: ply 13 on a common human line).
 *
 * FIX: for the most-reachable book positions in the first N plies (seeds), enumerate the moves
 * a human would plausibly play there — MultiPV top moves within DEVIATION_WINDOW cp of the
 * engine best at depth D — and for every such move whose successor is NOT already in the book,
 * store exactly one reply: the engine's depth-D best move in the successor position. Whatever
 * the human plays, the AI's next move is book-quality; after that it is out of book and
 * searches normally.
 *
 * Seeds are ranked by reach weight: BFS from the initial position following every legal move
 * that lands in the book (stored moves AND transpositions), splitting each position's weight
 * uniformly across its in-book successors. This favors shallow, well-connected (mainline)
 * positions without needing the petashock "num" field (which is 0 for every move).
 *
 * MEASUREMENT PROTOCOL (deterministic, same as shogi-petashock-book-fullcheck.ts): the TT is
 * re-allocated before EVERY search, Threads=1, fixed depth — each measurement is a pure
 * function of (position, MultiPV setting). The stored reply IS the depth-D best move by
 * construction (gap 0); independent re-verification via shogi-petashock-book-verify.ts on the
 * emitted meta re-measures replies against a fresh MultiPV-4 search.
 *
 * Progress is appended per seed to --results (resumable). When all seeds are done it emits:
 *   --out       merged binary book  = input book + deviation entries (same SBK2 format)
 *   --meta      deviation meta JSONL {sfen, ply, best, moves:[{usi, value}]} — the same shape
 *               shogi-petashock-book-verify.ts consumes, so replies can be independently
 *               re-verified: node -r tsx/cjs scripts/shogi-petashock-book-verify.ts <meta>
 *
 * Usage:
 *   YANE_BIN=... YANE_EVAL_DIR=... node -r tsx/cjs scripts/shogi-book-deviation-cover.ts \
 *     --book public/shogi-opening-book-v2.bin --results <results.jsonl> \
 *     --out <merged.bin> --meta <deviations.jsonl> \
 *     [--max-seed-ply 12] [--max-seeds 900] [--multipv 12] [--window 300] [--depth 18] [--procs 4]
 */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
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
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  // 次トークンが別オプション（'-' 始まり）なら値の指定漏れとみなし def を返す
  // （例: `--results --out x` で `--out` を値と誤認しない）。
  return next && !next.startsWith('-') ? next : def;
}

const BOOK_PATH = argValue('--book', path.resolve(__dirname, '../public/shogi-opening-book-v2.bin'));
const RESULTS_PATH = argValue('--results', '');
const OUT_PATH = argValue('--out', '');
const META_PATH = argValue('--meta', '');
const MAX_SEED_PLY = Number(argValue('--max-seed-ply', '12'));
const MAX_SEEDS = Number(argValue('--max-seeds', '900'));
const MULTIPV = Number(argValue('--multipv', '12'));
const DEVIATION_WINDOW = Number(argValue('--window', '300'));
const DEPTH = Number(argValue('--depth', '18'));
const PROCS = Number(argValue('--procs', '4'));
/** Dry-run: print seed selection stats and exit without launching engines. */
const SEEDS_ONLY = process.argv.includes('--seeds-only');

// --seeds-only はシード選択の統計だけ出して終了するドライラン。出力系
// (--results/--out/--meta) は不要なので、それらの必須チェックは通常実行時のみ。
if (!SEEDS_ONLY && (!RESULTS_PATH || !OUT_PATH || !META_PATH)) {
  console.error('usage: node -r tsx/cjs scripts/shogi-book-deviation-cover.ts --book <bin> --results <jsonl> --out <bin> --meta <jsonl> [--seeds-only] [...]');
  process.exit(2);
}

const YANE_BIN = process.env.YANE_BIN ?? path.resolve(__dirname, '../ml/bin/yaneuraou');
const YANE_EVAL_DIR = process.env.YANE_EVAL_DIR ?? path.join(path.dirname(YANE_BIN), '../eval/eval');

// --- SFEN / USI helpers (same conventions as scripts/shogi-import-petashock-book.ts) ---------

const SFEN_LETTER: Record<number, string> = {
  [FU]: 'P', [KY]: 'L', [KE]: 'N', [GI]: 'S', [KI]: 'G', [KA]: 'B', [HI]: 'R', [OU]: 'K',
};
const HAND_ORDER = [HI, KA, KI, GI, KE, KY, FU];
const DROP_TYPE: Record<string, number> = { P: FU, L: KY, N: KE, S: GI, G: KI, B: KA, R: HI };

function pieceToSfen(p: number): string {
  const type = getKomashu(p);
  const promoted = type > OU;
  const base = SFEN_LETTER[promoted ? type - PROMOTE : type] ?? '?';
  const s = (promoted ? '+' : '') + base;
  return isSelf(SENTE, p) ? s : s.toLowerCase();
}

/** Full sfen (our orientation, ply fixed to 1) for USI `position sfen ...`. */
function sfenOf(k: KyokumenImproved): string {
  let board = '';
  for (let dan = 1; dan <= 9; dan++) {
    if (dan > 1) board += '/';
    let empties = 0;
    for (let suji = 9; suji >= 1; suji--) {
      const p = k.ban[(suji << 4) + dan];
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
  const turn = k.teban === SENTE ? 'b' : 'w';
  let hand = '';
  for (const side of [SENTE, GOTE]) {
    for (const type of HAND_ORDER) {
      const n = k.hand[side | type] | 0;
      if (n === 0) continue;
      if (n > 1) hand += String(n);
      hand += side === SENTE ? SFEN_LETTER[type] : SFEN_LETTER[type].toLowerCase();
    }
  }
  if (hand === '') hand = '-';
  return `${board} ${turn} ${hand} 1`;
}

/** Match a USI move string against the current legal moves (no flip — engine speaks our orientation). */
function findLegalUsi(legal: Te[], usi: string, teban: number): Te | null {
  if (usi.length < 4) return null;
  const toSuji = usi.charCodeAt(2) - 0x30;
  const toDan = usi.charCodeAt(3) - 0x60;
  if (toSuji < 1 || toSuji > 9 || toDan < 1 || toDan > 9) return null;
  const to = (toSuji << 4) + toDan;
  if (usi[1] === '*') {
    const drop = DROP_TYPE[usi[0]];
    if (!drop) return null;
    for (const t of legal) {
      if (t.from === 0 && t.to === to && t.koma === (drop | teban)) return t;
    }
    return null;
  }
  const fromSuji = usi.charCodeAt(0) - 0x30;
  const fromDan = usi.charCodeAt(1) - 0x60;
  if (fromSuji < 1 || fromSuji > 9 || fromDan < 1 || fromDan > 9) return null;
  const from = (fromSuji << 4) + fromDan;
  const promote = usi.endsWith('+');
  for (const t of legal) {
    if (t.from === from && t.to === to && t.promote === promote) return t;
  }
  return null;
}

function packOf(te: Te): [number, number, number] {
  return [
    te.from & 0xff,
    te.to & 0xff,
    (te.promote ? 1 : 0) | (te.from === 0 ? (getKomashu(te.koma) & 7) << 1 : 0),
  ];
}

// --- Binary book I/O (SBK2; format doc in scripts/shogi-import-petashock-book.ts) ------------

interface BookEntry {
  hashA: number;
  hashB: number;
  moves: Array<[number, number, number]>;
}

function identityKey(hashA: number, hashB: number): string {
  return `${hashA >>> 0}:${hashB >>> 0}`;
}

function positionIdentityKey(k: KyokumenImproved): string {
  return identityKey(k.HashVal, k.SecondaryHashVal);
}

function readBook(p: string): Map<string, BookEntry> {
  const buf = fs.readFileSync(p);
  if (buf.readUInt32LE(0) !== 0x324b4253) throw new Error(`${p}: bad magic`);
  const count = buf.readUInt32LE(4);
  const map = new Map<string, BookEntry>();
  let o = 8;
  for (let i = 0; i < count; i++) {
    const hashA = buf.readUInt32LE(o); o += 4;
    const hashB = buf.readUInt32LE(o); o += 4;
    const n = buf.readUInt8(o); o += 1;
    const moves: Array<[number, number, number]> = [];
    for (let j = 0; j < n; j++) {
      moves.push([buf.readUInt8(o), buf.readUInt8(o + 1), buf.readUInt8(o + 2)]);
      o += 3;
    }
    map.set(identityKey(hashA, hashB), { hashA, hashB, moves });
  }
  if (o !== buf.length) throw new Error(`${p}: trailing bytes`);
  return map;
}

function writeBook(p: string, entries: BookEntry[]): number {
  const sorted = [...entries].sort((a, b) => a.hashA - b.hashA || a.hashB - b.hashB);
  let bytes = 8;
  for (const e of sorted) bytes += 9 + e.moves.length * 3;
  const buf = Buffer.alloc(bytes);
  buf.writeUInt32LE(0x324b4253, 0);
  buf.writeUInt32LE(sorted.length, 4);
  let o = 8;
  for (const e of sorted) {
    buf.writeUInt32LE(e.hashA >>> 0, o); o += 4;
    buf.writeUInt32LE(e.hashB >>> 0, o); o += 4;
    buf.writeUInt8(e.moves.length, o); o += 1;
    for (const [from, to, flags] of e.moves) {
      buf.writeUInt8(from, o); o += 1;
      buf.writeUInt8(to, o); o += 1;
      buf.writeUInt8(flags, o); o += 1;
    }
  }
  fs.writeFileSync(p, buf);
  return bytes;
}

// --- Seed selection: reach-weighted BFS over the book itself ---------------------------------

interface Seed {
  sfen: string;
  ply: number;
  weight: number;
  k: KyokumenImproved;
}

function collectSeeds(book: Map<string, BookEntry>): Seed[] {
  interface Node {
    k: KyokumenImproved;
    ply: number;
    weight: number;
  }
  const root = InitialPositionImproved.createInitialPosition();
  root.setTeban(SENTE);
  const seeds = new Map<string, Seed>();
  let level = new Map<string, Node>();
  level.set(sfenOf(root), { k: root, ply: 0, weight: 1 });

  for (let ply = 0; ply <= MAX_SEED_PLY; ply++) {
    const next = new Map<string, Node>();
    for (const [sfen, node] of level) {
      const entry = book.get(positionIdentityKey(node.k));
      const inBook = !!entry;
      if (!inBook && ply > 0) continue; // dead end (should not happen: children are pre-filtered)
      if (inBook) {
        const prev = seeds.get(sfen);
        if (prev) prev.weight += node.weight;
        else seeds.set(sfen, { sfen, ply, weight: node.weight, k: node.k });
      }
      if (ply === MAX_SEED_PLY) continue;
      // Successors: every legal move that lands in the book (stored moves and transpositions).
      const legal = GenerateMovesImproved.generateLegalMoves(node.k);
      const children: Array<{ sfen: string; k: KyokumenImproved }> = [];
      for (const te of legal) {
        const child = node.k.clone();
        child.move(te);
        child.toggleTeban();
        const ce = book.get(positionIdentityKey(child));
        if (!ce) continue;
        children.push({ sfen: sfenOf(child), k: child });
      }
      if (children.length === 0) continue;
      const share = node.weight / children.length;
      for (const c of children) {
        const ex = next.get(c.sfen);
        if (ex) {
          ex.weight += share;
        } else {
          next.set(c.sfen, { k: c.k, ply: ply + 1, weight: share });
        }
      }
    }
    level = next;
  }
  const out = [...seeds.values()].sort((a, b) => b.weight - a.weight || a.ply - b.ply);
  return out.slice(0, MAX_SEEDS);
}

// --- Engine (identical deterministic protocol to shogi-petashock-book-fullcheck.ts) ----------

interface PvInfo {
  multipv: number;
  cp: number;
  move: string;
}

class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private stderrTail = '';
  private handler: ((line: string) => void) | null = null;

  constructor() {
    this.proc = spawn(YANE_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.on('error', (e) => {
      console.error(`failed to launch engine "${YANE_BIN}": ${e.message}`);
      process.exit(1);
    });
    this.proc.stderr.on('data', (d: Buffer) => {
      this.stderrTail = (this.stderrTail + d.toString()).slice(-2000);
    });
    this.proc.stdout.on('data', (d: Buffer) => {
      this.buf += d.toString();
      let i: number;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).replace(/\r$/, '');
        this.buf = this.buf.slice(i + 1);
        if (this.handler) this.handler(line);
      }
    });
    this.proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`engine exited with code ${code}\n${this.stderrTail}`);
        process.exit(1);
      }
    });
  }

  private send(cmd: string): void {
    this.proc.stdin.write(cmd + '\n');
  }

  private waitFor(pred: (line: string) => boolean, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handler = null;
        reject(new Error(`USI timeout (${timeoutMs}ms)`));
      }, timeoutMs);
      this.handler = (line) => {
        if (pred(line)) {
          clearTimeout(timer);
          this.handler = null;
          resolve();
        }
      };
    });
  }

  async init(): Promise<void> {
    this.send('usi');
    await this.waitFor((l) => l === 'usiok', 15000);
    this.send(`setoption name EvalDir value ${YANE_EVAL_DIR}`);
    this.send('setoption name FV_SCALE value 20');
    this.send('setoption name Threads value 1');
    this.send('setoption name USI_Hash value 64');
    this.send('setoption name USI_OwnBook value false');
    this.send('setoption name BookFile value no_book');
    this.send('setoption name NetworkDelay value 0');
    this.send('setoption name NetworkDelay2 value 0');
    this.send(`setoption name MultiPV value ${MULTIPV}`);
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 120000);
    this.send('usinewgame');
  }

  setMultiPv(n: number): void {
    this.send(`setoption name MultiPV value ${n}`);
  }

  /** Clear the TT by re-allocating it (see shogi-petashock-book-fullcheck.ts for rationale). */
  async clearHash(): Promise<void> {
    this.send('setoption name USI_Hash value 1');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 30000);
    this.send('setoption name USI_Hash value 64');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 30000);
  }

  search(sfen: string, depth: number): Promise<PvInfo[]> {
    return new Promise((resolve, reject) => {
      const pvs = new Map<number, PvInfo>();
      const timer = setTimeout(() => {
        this.handler = null;
        reject(new Error('search timeout'));
      }, 600000);
      this.handler = (line) => {
        if (line.startsWith('info ') && line.includes(' pv ')) {
          const mm = line.match(/multipv (\d+)/);
          const sm = line.match(/score (cp|mate) (-?\d+)/);
          const pm = line.match(/ pv (\S+)/);
          if (sm && pm) {
            const mpv = mm ? parseInt(mm[1], 10) : 1;
            let cp: number;
            if (sm[1] === 'mate') {
              const n = parseInt(sm[2], 10);
              cp = (n > 0 ? 1 : -1) * (30000 - Math.min(Math.abs(n), 1000));
            } else {
              cp = parseInt(sm[2], 10);
            }
            pvs.set(mpv, { multipv: mpv, cp, move: pm[1] });
          }
        } else if (line.startsWith('bestmove')) {
          clearTimeout(timer);
          this.handler = null;
          resolve([...pvs.values()].sort((a, b) => a.multipv - b.multipv));
        }
      };
      this.send(`position sfen ${sfen}`);
      this.send(`go depth ${depth}`);
    });
  }

  quit(): void {
    try {
      this.send('quit');
    } catch {
      try {
        this.proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
}

// --- Deviation generation --------------------------------------------------------------------

interface DeviationRow {
  usi: string; // human deviation move (at the seed)
  cp: number; // its cp at the seed (side-to-move = human)
  childSfen: string;
  childPly: number;
  childHashA: number;
  childHashB: number;
  response: string; // engine depth-D best reply (usi)
  responseCp: number; // from the child side-to-move (= AI) perspective
  pack: [number, number, number];
}

interface SeedResult {
  sfen: string;
  ply: number;
  bestCp: number;
  candidates: number; // natural moves considered (within window)
  inBook: number; // ... of which already covered by the book
  deviations: DeviationRow[];
  skipped: string[]; // usi of candidates dropped (unmatched reply move etc.)
}

async function runWorker(
  seeds: Seed[],
  book: Map<string, BookEntry>,
  writeResult: (r: SeedResult) => void,
  progress: () => void
): Promise<void> {
  const engine = new Engine();
  try {
    await engine.init();
    for (const seed of seeds) {
      await engine.clearHash();
      engine.setMultiPv(MULTIPV);
      const pvs = await engine.search(seed.sfen, DEPTH);
      if (pvs.length === 0) {
        writeResult({ sfen: seed.sfen, ply: seed.ply, bestCp: 0, candidates: 0, inBook: 0, deviations: [], skipped: [] });
        progress();
        continue;
      }
      const bestCp = pvs[0].cp;
      const legal = GenerateMovesImproved.generateLegalMoves(seed.k);
      const rows: DeviationRow[] = [];
      const skipped: string[] = [];
      let candidates = 0;
      let inBook = 0;
      for (const pv of pvs) {
        if (bestCp - pv.cp > DEVIATION_WINDOW) continue;
        const te = findLegalUsi(legal, pv.move, seed.k.teban);
        if (!te) {
          // e.g. 不成 the TS engine cannot represent — a human playing it leaves book anyway.
          skipped.push(pv.move);
          continue;
        }
        candidates++;
        const child = seed.k.clone();
        child.move(te);
        child.toggleTeban();
        const childHashA = child.HashVal >>> 0;
        const childHashB = child.SecondaryHashVal >>> 0;
        const existing = book.get(identityKey(childHashA, childHashB));
        if (existing) {
          inBook++;
          continue;
        }
        const childSfen = sfenOf(child);
        await engine.clearHash();
        // MultiPV=4, NOT 1: fullcheck/verify measure best-vs-move gaps under a MultiPV-4
        // search, and depth-18 scores shift slightly between MultiPV contexts (a MultiPV-1
        // best was observed to re-measure up to ~140cp below the MultiPV-4 best for ~0.5%
        // of positions). Taking PV1 of a MultiPV-4 search makes the stored reply exactly
        // reproducible under the verification protocol.
        engine.setMultiPv(4);
        const reply = await engine.search(childSfen, DEPTH);
        engine.setMultiPv(MULTIPV);
        if (reply.length === 0) {
          skipped.push(pv.move);
          continue;
        }
        const childLegal = GenerateMovesImproved.generateLegalMoves(child);
        const rte = findLegalUsi(childLegal, reply[0].move, child.teban);
        if (!rte) {
          skipped.push(pv.move);
          continue;
        }
        rows.push({
          usi: pv.move,
          cp: pv.cp,
          childSfen,
          childPly: seed.ply + 1,
          childHashA,
          childHashB,
          response: reply[0].move,
          responseCp: reply[0].cp,
          pack: packOf(rte),
        });
      }
      writeResult({ sfen: seed.sfen, ply: seed.ply, bestCp, candidates, inBook, deviations: rows, skipped });
      progress();
    }
  } finally {
    engine.quit();
  }
}

// --- main --------------------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`reading book ${BOOK_PATH} ...`);
  const book = readBook(BOOK_PATH);
  console.log(`  ${book.size} positions`);

  const t0 = Date.now();
  const seeds = collectSeeds(book);
  console.log(`selected ${seeds.length} seed positions (ply <= ${MAX_SEED_PLY}, reach-weighted) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const plyHist = new Map<number, number>();
  for (const s of seeds) plyHist.set(s.ply, (plyHist.get(s.ply) ?? 0) + 1);
  console.log(`  seed ply histogram: ${[...plyHist.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}:${n}`).join(' ')}`);
  if (SEEDS_ONLY) {
    for (const s of seeds.slice(0, 10)) console.log(`  w=${s.weight.toFixed(4)} ply=${s.ply} ${s.sfen}`);
    return;
  }

  // Resume support.
  const done = new Map<string, SeedResult>();
  if (fs.existsSync(RESULTS_PATH)) {
    for (const l of fs.readFileSync(RESULTS_PATH, 'utf8').split('\n')) {
      if (l.trim() === '') continue;
      try {
        const r: SeedResult = JSON.parse(l);
        done.set(r.sfen, r);
      } catch {
        /* partial trailing line — re-run that seed */
      }
    }
  }
  const todo = seeds.filter((s) => !done.has(s.sfen));
  console.log(`${seeds.length} seeds, ${done.size} already done, ${todo.length} to go (depth ${DEPTH}, MultiPV ${MULTIPV}, window ${DEVIATION_WINDOW}cp, ${PROCS} procs)`);

  const stream = fs.createWriteStream(RESULTS_PATH, { flags: 'a' });
  const writeResult = (r: SeedResult): void => {
    stream.write(JSON.stringify(r) + '\n');
    done.set(r.sfen, r);
  };
  let processed = 0;
  const t1 = Date.now();
  const progress = (): void => {
    processed++;
    if (processed % 20 === 0) {
      const dt = (Date.now() - t1) / 1000;
      const rate = processed / dt;
      console.log(`progress: ${processed}/${todo.length} seeds (${(rate * 60).toFixed(1)}/min, eta ${Math.round((todo.length - processed) / rate / 60)}min)`);
    }
  };

  if (todo.length > 0) {
    const buckets: Seed[][] = Array.from({ length: PROCS }, () => []);
    todo.forEach((s, i) => buckets[i % PROCS].push(s));
    await Promise.all(buckets.filter((b) => b.length > 0).map((b) => runWorker(b, book, writeResult, progress)));
  }
  await new Promise<void>((resolve) => stream.end(resolve));

  // --- merge -------------------------------------------------------------------------------
  const results = seeds.map((s) => done.get(s.sfen)).filter((r): r is SeedResult => !!r);
  if (results.length !== seeds.length) {
    console.error(`only ${results.length}/${seeds.length} seeds done — book NOT emitted; re-run to resume`);
    process.exit(1);
  }

  const deviationByHash = new Map<string, { row: DeviationRow; seedSfen: string }>();
  let dupes = 0;
  const stats = { candidates: 0, inBook: 0, added: 0, skipped: 0 };
  for (const r of results) {
    stats.candidates += r.candidates;
    stats.inBook += r.inBook;
    stats.skipped += r.skipped.length;
    for (const d of r.deviations) {
      const childKey = identityKey(d.childHashA, d.childHashB);
      if (book.has(childKey)) {
        // The book grew since this result was produced — drop the now-covered pair.
        dupes++;
        continue;
      }
      if (deviationByHash.has(childKey)) {
        dupes++; // same successor reached from two seeds (transposition) — keep the first
        continue;
      }
      deviationByHash.set(childKey, { row: d, seedSfen: r.sfen });
      stats.added++;
    }
  }

  const merged: BookEntry[] = [...book.values()];
  for (const { row } of deviationByHash.values()) {
    merged.push({ hashA: row.childHashA, hashB: row.childHashB, moves: [row.pack] });
  }
  const bytes = writeBook(OUT_PATH, merged);

  const metaLines = [...deviationByHash.values()].map(({ row }) =>
    JSON.stringify({
      sfen: row.childSfen,
      ply: row.childPly,
      best: row.responseCp,
      moves: [{ usi: row.response, value: row.responseCp }],
    })
  );
  fs.writeFileSync(META_PATH, metaLines.join('\n') + '\n');

  console.log(`\nseeds: ${results.length}; natural moves considered: ${stats.candidates}; already in book: ${stats.inBook}; skipped: ${stats.skipped}`);
  console.log(`deviation entries added: ${stats.added} (dropped ${dupes} transposition/covered dupes)`);
  console.log(`wrote ${OUT_PATH}: ${merged.length} positions, ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`wrote ${META_PATH} (verify with scripts/shogi-petashock-book-verify.ts)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
