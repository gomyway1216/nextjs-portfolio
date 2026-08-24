/**
 * Human-deviation coverage probe for the external opening book (engine-free + optional engine).
 *
 * Answers "how long does the AI stay in book against a HUMAN who plays a natural system
 * opening instead of engine best play?" for one or more book binaries, so book versions can
 * be compared (v2 vs v3) with the real runtime getter (getOpeningMoveImproved: curated book
 * priority, phase/check gates, static-eval safety threshold all included).
 *
 * Mode 1 (always): scripted human SYSTEM LINES. Each line is the move order a club player
 * uses to build a well-known setup (四間飛車, 矢倉, 棒銀, 居飛車穴熊, ...). The human plays the
 * next listed move that is legal (skipping ones blocked/already played), the AI answers with
 * its deterministic book move for each difficulty under test (configurable via --difficulties
 * / DIFFICULTIES, default: all five); the walk ends at the first AI turn with no book move.
 * Every line is probed with the human as sente AND as gote (mirrored coordinates). Reported
 * per line: the ply of the first AI out-of-book turn, and the number of AI book replies.
 *
 * Mode 2 (--sample N, needs YANE_BIN/YANE_EVAL_DIR): reach-weighted random in-book positions
 * (N per ply, 1..--max-ply) are searched once (MultiPV 12, --depth, default 14) and the
 * fraction of NATURAL moves (within --window cp of best) whose successor is in the book is
 * reported per ply for every book — an empirical P(human natural move stays in book).
 * Sampling is by the same reach weight as scripts/shogi-book-deviation-cover.ts (the positions
 * a human walking the book graph at random actually visits), with a fixed PRNG seed.
 *
 * Usage:
 *   node -r tsx/cjs scripts/shogi-book-natural-probe.ts --book public/shogi-opening-book-v2.bin \
 *     [--book public/shogi-opening-book-v3.bin ...] [--sample 0] [--max-ply 20] [--depth 14] \
 *     [--window 300] [--procs 4] [--seed 42]
 */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import {
  clearExternalOpeningBookForTests,
  getOpeningMoveImproved,
  loadExternalOpeningBook,
} from '../src/components/game/ShogiImproved/OpeningBookImproved';
import type { Difficulty } from '../src/components/game/common/types';
import { EMPTY, FU, KY, KE, GI, KI, KA, HI, OU, PROMOTE, SENTE, GOTE, Te, getKomashu, isSelf } from '../src/components/game/ShogiImproved/types';

// --- CLI ---------------------------------------------------------------------

function argValues(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) out.push(process.argv[i + 1]);
  }
  return out;
}
function argValue(name: string, def: string): string {
  const v = argValues(name);
  return v.length > 0 ? v[v.length - 1] : def;
}

const BOOKS = argValues('--book').map((p) => path.resolve(p));
if (BOOKS.length === 0) BOOKS.push(path.resolve(__dirname, '../public/shogi-opening-book-v2.bin'));
const SAMPLE = Number(argValue('--sample', '0'));
const MAX_PLY = Number(argValue('--max-ply', '20'));
const DEPTH = Number(argValue('--depth', '14'));
const WINDOW = Number(argValue('--window', '300'));
const PROCS = Number(argValue('--procs', '4'));
const SEED = Number(argValue('--seed', '42'));
const DIFFICULTIES = (argValue('--difficulties', 'master,expert,medium').split(',') as Difficulty[]);
const YANE_BIN = process.env.YANE_BIN ?? path.resolve(__dirname, '../ml/bin/yaneuraou');
const YANE_EVAL_DIR = process.env.YANE_EVAL_DIR ?? path.join(path.dirname(YANE_BIN), '../eval/eval');

// --- Board helpers -------------------------------------------------------------

function startPosition(): KyokumenImproved {
  const k = InitialPositionImproved.createInitialPosition();
  k.setTeban(SENTE);
  return k;
}

function bookBuffer(p: string): ArrayBuffer {
  const raw = fs.readFileSync(p);
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

function installBook(p: string): number {
  clearExternalOpeningBookForTests();
  const n = loadExternalOpeningBook(bookBuffer(p));
  if (n === 0) throw new Error(`${p}: loader rejected the book`);
  return n;
}

/** Human move spec in SENTE coordinates: [fromSuji, fromDan, toSuji, toDan]. */
type Spec = [number, number, number, number];

function specToMove(legal: Te[], spec: Spec, asGote: boolean): Te | null {
  const [fs0, fd0, ts0, td0] = spec;
  const from = asGote ? ((10 - fs0) << 4) + (10 - fd0) : (fs0 << 4) + fd0;
  const to = asGote ? ((10 - ts0) << 4) + (10 - td0) : (ts0 << 4) + td0;
  return legal.find((m) => m.from === from && m.to === to && !m.promote) ?? null;
}

// --- Human system lines (sente coordinates; mirrored for gote) ---------------------

interface Line {
  name: string;
  moves: Spec[];
}

const LINES: Line[] = [
  { name: '四間飛車（美濃）', moves: [[7, 7, 7, 6], [6, 7, 6, 6], [2, 8, 6, 8], [5, 9, 4, 8], [4, 8, 3, 8], [3, 8, 2, 8], [3, 9, 3, 8], [6, 9, 5, 8], [1, 7, 1, 6], [7, 9, 7, 8], [7, 8, 6, 7], [9, 7, 9, 6]] },
  { name: '三間飛車', moves: [[7, 7, 7, 6], [6, 7, 6, 6], [2, 8, 7, 8], [5, 9, 4, 8], [4, 8, 3, 8], [3, 8, 2, 8], [3, 9, 3, 8], [6, 9, 5, 8], [1, 7, 1, 6], [7, 9, 6, 8], [6, 8, 6, 7], [9, 7, 9, 6]] },
  { name: '中飛車', moves: [[7, 7, 7, 6], [5, 7, 5, 6], [2, 8, 5, 8], [5, 9, 4, 8], [4, 8, 3, 8], [3, 8, 2, 8], [3, 9, 3, 8], [7, 9, 6, 8], [6, 8, 5, 7], [1, 7, 1, 6], [6, 9, 5, 8]] },
  { name: '向かい飛車', moves: [[7, 7, 7, 6], [6, 7, 6, 6], [7, 9, 6, 8], [6, 8, 6, 7], [2, 8, 8, 8], [5, 9, 4, 8], [4, 8, 3, 8], [3, 8, 2, 8], [3, 9, 3, 8], [6, 9, 5, 8], [1, 7, 1, 6]] },
  { name: '矢倉', moves: [[7, 7, 7, 6], [7, 9, 6, 8], [6, 7, 6, 6], [5, 7, 5, 6], [3, 9, 4, 8], [6, 9, 7, 8], [6, 8, 7, 7], [8, 8, 7, 9], [5, 9, 6, 9], [4, 9, 5, 8], [6, 9, 7, 9], [3, 7, 3, 6], [7, 9, 8, 8]] },
  { name: '棒銀', moves: [[7, 7, 7, 6], [2, 7, 2, 6], [2, 6, 2, 5], [3, 9, 3, 8], [3, 8, 2, 7], [2, 7, 2, 6], [2, 6, 1, 5], [6, 9, 7, 8], [5, 9, 6, 8], [1, 7, 1, 6]] },
  { name: '原始棒銀（角道不突き）', moves: [[2, 7, 2, 6], [2, 6, 2, 5], [3, 9, 3, 8], [3, 8, 2, 7], [2, 7, 2, 6], [2, 6, 1, 5], [7, 7, 7, 6], [6, 9, 7, 8], [5, 9, 6, 8]] },
  { name: '早繰り銀', moves: [[7, 7, 7, 6], [2, 7, 2, 6], [3, 9, 4, 8], [4, 8, 4, 7], [3, 7, 3, 6], [4, 7, 5, 6], [2, 6, 2, 5], [6, 9, 7, 8], [5, 9, 6, 8], [5, 6, 4, 5]] },
  { name: '右四間飛車', moves: [[7, 7, 7, 6], [3, 9, 4, 8], [5, 7, 5, 6], [4, 8, 5, 7], [4, 7, 4, 6], [5, 7, 4, 7], [2, 8, 4, 8], [6, 9, 5, 8], [5, 9, 6, 9], [7, 9, 6, 8], [4, 6, 4, 5]] },
  { name: '居飛車穴熊', moves: [[7, 7, 7, 6], [2, 7, 2, 6], [3, 9, 4, 8], [5, 9, 6, 8], [6, 8, 7, 8], [7, 8, 8, 8], [9, 9, 9, 8], [8, 8, 9, 9], [7, 9, 8, 8], [6, 9, 7, 9], [4, 9, 5, 8], [7, 9, 7, 8]] },
  { name: '雁木', moves: [[7, 7, 7, 6], [2, 7, 2, 6], [7, 9, 6, 8], [6, 8, 6, 7], [5, 7, 5, 6], [3, 9, 4, 8], [4, 8, 4, 7], [6, 9, 7, 8], [4, 9, 5, 8], [5, 9, 6, 9], [6, 9, 7, 9]] },
  { name: '相掛かり', moves: [[2, 7, 2, 6], [2, 6, 2, 5], [6, 9, 7, 8], [3, 9, 3, 8], [9, 7, 9, 6], [1, 7, 1, 6], [5, 9, 6, 8], [7, 7, 7, 6], [3, 8, 4, 7]] },
  { name: '左美濃（対振り）', moves: [[7, 7, 7, 6], [2, 7, 2, 6], [3, 9, 4, 8], [5, 9, 6, 8], [6, 8, 7, 8], [7, 8, 8, 8], [7, 9, 7, 8], [4, 9, 5, 8], [9, 7, 9, 6], [1, 7, 1, 6], [3, 7, 3, 6]] },
  { name: '早い玉移動（級位者）', moves: [[7, 7, 7, 6], [5, 9, 6, 8], [6, 8, 7, 8], [2, 7, 2, 6], [4, 9, 5, 8], [3, 9, 4, 8], [6, 9, 6, 8], [1, 7, 1, 6], [9, 7, 9, 6]] },
  { name: '端歩先行（級位者）', moves: [[1, 7, 1, 6], [7, 7, 7, 6], [9, 7, 9, 6], [4, 9, 5, 8], [3, 9, 4, 8], [2, 7, 2, 6], [5, 9, 6, 8], [6, 9, 7, 8]] },
  { name: '角交換四間飛車', moves: [[7, 7, 7, 6], [1, 7, 1, 6], [2, 8, 6, 8], [8, 8, 2, 2], [5, 9, 4, 8], [4, 8, 3, 8], [3, 8, 2, 8], [3, 9, 3, 8], [7, 9, 7, 8], [6, 9, 5, 8], [9, 7, 9, 6]] },
];

interface LineResult {
  name: string;
  humanSente: boolean;
  outOfBookPly: number; // first AI turn (1-based ply index) with no book move; -1 = line exhausted in book
  aiBookMoves: number;
}

function probeLine(line: Line, humanSente: boolean, difficulty: Difficulty): LineResult {
  const k = startPosition();
  let idx = 0;
  let aiBookMoves = 0;
  for (let ply = 0; ply < 60; ply++) {
    const humanToMove = (k.teban === SENTE) === humanSente;
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    let te: Te | null = null;
    if (humanToMove) {
      while (idx < line.moves.length && !(te = specToMove(legal, line.moves[idx], !humanSente))) idx++;
      if (!te) return { name: line.name, humanSente, outOfBookPly: -1, aiBookMoves };
      idx++;
    } else {
      te = getOpeningMoveImproved(k, difficulty);
      if (!te) return { name: line.name, humanSente, outOfBookPly: ply + 1, aiBookMoves };
      aiBookMoves++;
    }
    k.move(te);
    k.toggleTeban();
  }
  return { name: line.name, humanSente, outOfBookPly: -1, aiBookMoves };
}

// --- Mode 2: reach-weighted sampling + engine (optional) -------------------------------

const SFEN_LETTER: Record<number, string> = { [FU]: 'P', [KY]: 'L', [KE]: 'N', [GI]: 'S', [KI]: 'G', [KA]: 'B', [HI]: 'R', [OU]: 'K' };
const HAND_ORDER = [HI, KA, KI, GI, KE, KY, FU];
const DROP_TYPE: Record<string, number> = { P: FU, L: KY, N: KE, S: GI, G: KI, B: KA, R: HI };

function sfenOf(k: KyokumenImproved): string {
  let board = '';
  for (let dan = 1; dan <= 9; dan++) {
    if (dan > 1) board += '/';
    let empties = 0;
    for (let suji = 9; suji >= 1; suji--) {
      const p = k.ban[(suji << 4) + dan];
      if (p === EMPTY) { empties++; continue; }
      if (empties > 0) { board += String(empties); empties = 0; }
      const type = getKomashu(p);
      const promoted = type > OU;
      const base = SFEN_LETTER[promoted ? type - PROMOTE : type] ?? '?';
      const s = (promoted ? '+' : '') + base;
      board += isSelf(SENTE, p) ? s : s.toLowerCase();
    }
    if (empties > 0) board += String(empties);
  }
  let hand = '';
  for (const side of [SENTE, GOTE]) {
    for (const type of HAND_ORDER) {
      const n = k.hand[side | type] | 0;
      if (n === 0) continue;
      if (n > 1) hand += String(n);
      hand += side === SENTE ? SFEN_LETTER[type] : SFEN_LETTER[type].toLowerCase();
    }
  }
  return `${board} ${k.teban === SENTE ? 'b' : 'w'} ${hand || '-'} 1`;
}

function findLegalUsi(legal: Te[], usi: string, teban: number): Te | null {
  if (usi.length < 4) return null;
  const to = ((usi.charCodeAt(2) - 0x30) << 4) + (usi.charCodeAt(3) - 0x60);
  if (usi[1] === '*') {
    const drop = DROP_TYPE[usi[0]];
    return drop ? legal.find((t) => t.from === 0 && t.to === to && t.koma === (drop | teban)) ?? null : null;
  }
  const from = ((usi.charCodeAt(0) - 0x30) << 4) + (usi.charCodeAt(1) - 0x60);
  const promote = usi.endsWith('+');
  return legal.find((t) => t.from === from && t.to === to && t.promote === promote) ?? null;
}

interface RawBook {
  has(hashA: number, hashB: number): boolean;
}

function readRawBook(p: string): RawBook {
  const buf = fs.readFileSync(p);
  if (buf.readUInt32LE(0) !== 0x324b4253) throw new Error(`${p}: bad magic`);
  const count = buf.readUInt32LE(4);
  const set = new Set<string>();
  let o = 8;
  for (let i = 0; i < count; i++) {
    const a = buf.readUInt32LE(o);
    const b = buf.readUInt32LE(o + 4);
    const n = buf.readUInt8(o + 8);
    o += 9 + n * 3;
    set.add(`${a >>> 0}:${b >>> 0}`);
  }
  return { has: (a, b) => set.has(`${a >>> 0}:${b >>> 0}`) };
}

interface Node { k: KyokumenImproved; ply: number; weight: number }

/** Reach-weighted BFS over the FIRST book (the sampling frame is shared by all books). */
function sampleByReachWeight(book: RawBook, perPly: number, maxPly: number): Node[] {
  let rnd = SEED >>> 0 || 1;
  const rand = (): number => {
    rnd ^= rnd << 13; rnd >>>= 0; rnd ^= rnd >>> 17; rnd ^= rnd << 5; rnd >>>= 0;
    return rnd / 4294967296;
  };
  const root = startPosition();
  let level = new Map<string, Node>([[sfenOf(root), { k: root, ply: 0, weight: 1 }]]);
  const picked: Node[] = [];
  for (let ply = 1; ply <= maxPly; ply++) {
    const next = new Map<string, Node>();
    for (const node of level.values()) {
      const legal = GenerateMovesImproved.generateLegalMoves(node.k);
      const children: KyokumenImproved[] = [];
      for (const te of legal) {
        const c = node.k.clone();
        c.move(te);
        c.toggleTeban();
        if (book.has(c.HashVal, c.SecondaryHashVal)) children.push(c);
      }
      if (children.length === 0) continue;
      const share = node.weight / children.length;
      for (const c of children) {
        const key = sfenOf(c);
        const ex = next.get(key);
        if (ex) ex.weight += share;
        else next.set(key, { k: c, ply, weight: share });
      }
    }
    level = next;
    // Weighted sampling without replacement (efficient reservoir: key = u^(1/w)).
    const keyed = [...level.values()].map((n) => ({ n, key: Math.pow(rand(), 1 / n.weight) }));
    keyed.sort((a, b) => b.key - a.key);
    for (const { n } of keyed.slice(0, perPly)) picked.push(n);
  }
  return picked;
}

interface PvInfo { multipv: number; cp: number; move: string }

class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private handler: ((line: string) => void) | null = null;
  constructor() {
    this.proc = spawn(YANE_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.on('error', (e) => { console.error(`failed to launch engine "${YANE_BIN}": ${e.message}`); process.exit(1); });
    this.proc.stdout.on('data', (d: Buffer) => {
      this.buf += d.toString();
      let i: number;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).replace(/\r$/, '');
        this.buf = this.buf.slice(i + 1);
        if (this.handler) this.handler(line);
      }
    });
  }
  private send(cmd: string): void { this.proc.stdin.write(cmd + '\n'); }
  private waitFor(pred: (line: string) => boolean, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.handler = null; reject(new Error(`USI timeout (${timeoutMs}ms)`)); }, timeoutMs);
      this.handler = (line) => { if (pred(line)) { clearTimeout(timer); this.handler = null; resolve(); } };
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
    this.send('setoption name MultiPV value 12');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 120000);
    this.send('usinewgame');
  }
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
      const timer = setTimeout(() => { this.handler = null; reject(new Error('search timeout')); }, 600000);
      this.handler = (line) => {
        if (line.startsWith('info ') && line.includes(' pv ')) {
          const mm = line.match(/multipv (\d+)/);
          const sm = line.match(/score (cp|mate) (-?\d+)/);
          const pm = line.match(/ pv (\S+)/);
          if (sm && pm) {
            const mpv = mm ? parseInt(mm[1], 10) : 1;
            const n = parseInt(sm[2], 10);
            const cp = sm[1] === 'mate' ? (n > 0 ? 1 : -1) * (30000 - Math.min(Math.abs(n), 1000)) : n;
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
  quit(): void { try { this.send('quit'); } catch { this.proc.kill('SIGKILL'); } }
}

interface SampleRow { ply: number; natural: number; inBook: number[] } // inBook per book index

async function sampleWorker(nodes: Node[], books: RawBook[], rows: SampleRow[]): Promise<void> {
  const engine = new Engine();
  try {
    await engine.init();
    for (const node of nodes) {
      await engine.clearHash();
      const pvs = await engine.search(sfenOf(node.k), DEPTH);
      if (pvs.length === 0) continue;
      const legal = GenerateMovesImproved.generateLegalMoves(node.k);
      const row: SampleRow = { ply: node.ply, natural: 0, inBook: books.map(() => 0) };
      for (const pv of pvs) {
        if (pvs[0].cp - pv.cp > WINDOW) continue;
        const te = findLegalUsi(legal, pv.move, node.k.teban);
        if (!te) continue;
        row.natural++;
        const c = node.k.clone();
        c.move(te);
        c.toggleTeban();
        books.forEach((b, i) => { if (b.has(c.HashVal, c.SecondaryHashVal)) row.inBook[i]++; });
      }
      rows.push(row);
    }
  } finally {
    engine.quit();
  }
}

// --- main --------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const names = BOOKS.map((p) => path.basename(p));

  // Mode 1: system lines through the real runtime getter, per difficulty.
  for (const difficulty of DIFFICULTIES) {
    const perBook: LineResult[][] = [];
    for (const p of BOOKS) {
      const n = installBook(p);
      const res: LineResult[] = [];
      for (const line of LINES) {
        res.push(probeLine(line, true, difficulty));
        res.push(probeLine(line, false, difficulty));
      }
      perBook.push(res);
      if (difficulty === DIFFICULTIES[0]) console.log(`${path.basename(p)}: ${n} positions`);
    }
    clearExternalOpeningBookForTests();
    reportLines(perBook, names, difficulty);
  }

  if (SAMPLE <= 0) return;
  await sampleMode(names);
}

function reportLines(perBook: LineResult[][], names: string[], difficulty: Difficulty): void {
  console.log(`\n== Human system lines (difficulty=${difficulty}): first AI out-of-book ply (AI book replies) ==`);
  const header = ['line'.padEnd(22), 'human', ...names.map((n) => n.padStart(28))].join('  ');
  console.log(header);
  const sums = BOOKS.map(() => ({ oob: 0, replies: 0, n: 0, gained: 0 }));
  for (let i = 0; i < perBook[0].length; i++) {
    const cells = perBook.map((res, b) => {
      const r = res[i];
      sums[b].n++;
      sums[b].replies += r.aiBookMoves;
      sums[b].oob += r.outOfBookPly < 0 ? 60 : r.outOfBookPly;
      if (b > 0 && r.aiBookMoves > perBook[0][i].aiBookMoves) sums[b].gained++;
      return `${r.outOfBookPly < 0 ? 'in-book' : 'ply ' + String(r.outOfBookPly).padStart(2)} (${r.aiBookMoves} replies)`.padStart(28);
    });
    console.log([perBook[0][i].name.padEnd(22), perBook[0][i].humanSente ? '▲    ' : '△    ', ...cells].join('  '));
  }
  console.log(
    ['mean'.padEnd(22), '     ', ...sums.map((s) => `ply ${(s.oob / s.n).toFixed(1)} (${(s.replies / s.n).toFixed(2)} replies)`.padStart(28))].join('  ')
  );
  if (BOOKS.length > 1) {
    console.log(`lines where a later book stays in book longer than ${names[0]}: ${sums.slice(1).map((s, i) => `${names[i + 1]}=${s.gained}/${s.n}`).join(', ')}`);
  }

}

async function sampleMode(names: string[]): Promise<void> {
  // Mode 2: empirical natural-move coverage per ply.
  const raws = BOOKS.map(readRawBook);
  const nodes = sampleByReachWeight(raws[0], SAMPLE, MAX_PLY);
  console.log(`\n== Natural-move coverage: ${nodes.length} reach-weighted positions (${SAMPLE}/ply, 1..${MAX_PLY}), MultiPV 12 depth ${DEPTH}, window ${WINDOW}cp, ${PROCS} procs ==`);
  const rows: SampleRow[] = [];
  const buckets: Node[][] = Array.from({ length: PROCS }, () => []);
  nodes.forEach((n, i) => buckets[i % PROCS].push(n));
  const t0 = Date.now();
  await Promise.all(buckets.filter((b) => b.length > 0).map((b) => sampleWorker(b, raws, rows)));
  console.log(`searched ${rows.length} positions in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(['ply', 'natural', ...names.map((n) => n.padStart(28))].join('  '));
  const tot = { natural: 0, inBook: BOOKS.map(() => 0) };
  for (let ply = 1; ply <= MAX_PLY; ply++) {
    const rs = rows.filter((r) => r.ply === ply);
    if (rs.length === 0) continue;
    const natural = rs.reduce((s, r) => s + r.natural, 0);
    const inBook = BOOKS.map((_, i) => rs.reduce((s, r) => s + r.inBook[i], 0));
    tot.natural += natural;
    inBook.forEach((v, i) => { tot.inBook[i] += v; });
    console.log([String(ply).padStart(3), String(natural).padStart(7), ...inBook.map((v) => `${v}/${natural} (${((100 * v) / natural).toFixed(1)}%)`.padStart(28))].join('  '));
  }
  console.log(['all', String(tot.natural).padStart(7), ...tot.inBook.map((v) => `${v}/${tot.natural} (${((100 * v) / tot.natural).toFixed(1)}%)`.padStart(28))].join('  '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
