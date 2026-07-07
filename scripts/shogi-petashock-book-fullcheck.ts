/**
 * Full depth-18 verification + pruning for the external opening book.
 *
 * Reads the candidate meta JSONL from shogi-import-petashock-book.ts and checks EVERY stored
 * move of EVERY position against a local YaneuraOu:
 *   - one `go depth D` (MultiPV=4, Threads=1) per position → moves in the top-4 get their cp
 *   - stored moves outside the top-4 get their own `searchmoves` search
 *   - a move is KEPT only if bestCp - moveCp <= PRUNE_GAP (default 90cp, inside the 100cp
 *     quality bound)
 *
 * MEASUREMENT PROTOCOL (deterministic): the transposition table is cleared before EVERY
 * search (main and searchmoves) by re-allocating USI_Hash + isready. With Threads=1 and a
 * fixed depth this makes each measurement a pure function of (position, move): re-running
 * any subset in any order reproduces the exact same cp values and node counts. Without the
 * clears, TT carry-over between unrelated positions was observed to swing depth-18 scores
 * by up to ~150cp on ~1% of moves, which would make the <=100cp guarantee unverifiable.
 *
 * Progress is appended to the results JSONL after every position, so the run is RESUMABLE:
 * re-running skips positions already present in the results file.
 *
 * When every position has been checked, it rewrites the binary book (--out) with only the
 * kept moves (positions whose moves were all pruned are dropped) and writes a verified meta
 * JSONL (--verified-meta) for independent re-sampling by shogi-petashock-book-verify.ts.
 *
 * Usage:
 *   YANE_BIN=... YANE_EVAL_DIR=... node -r tsx/cjs scripts/shogi-petashock-book-fullcheck.ts \
 *     <meta.jsonl> --results <results.jsonl> [--out public/shogi-opening-book.bin] \
 *     [--verified-meta <path>] [--procs 12] [--depth 18] [--prune-gap 90]
 */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function argValue(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const META_PATH = process.argv[2];
if (!META_PATH || META_PATH.startsWith('--')) {
  console.error('usage: node -r tsx/cjs scripts/shogi-petashock-book-fullcheck.ts <meta.jsonl> --results <results.jsonl> [...]');
  process.exit(2);
}
const RESULTS_PATH = argValue('--results', META_PATH.replace(/\.jsonl$/, '') + '-fullcheck.jsonl');
const OUT_PATH = argValue('--out', path.resolve(__dirname, '../public/shogi-opening-book.bin'));
const VERIFIED_META_PATH = argValue('--verified-meta', META_PATH.replace(/\.jsonl$/, '') + '-verified.jsonl');
const PROCS = Number(argValue('--procs', '12'));
const DEPTH = Number(argValue('--depth', '18'));
const PRUNE_GAP = Number(argValue('--prune-gap', '90'));

const YANE_BIN = process.env.YANE_BIN ?? path.resolve(__dirname, '../ml/bin/yaneuraou');
const YANE_EVAL_DIR = process.env.YANE_EVAL_DIR ?? path.join(path.dirname(YANE_BIN), '../eval/eval');

interface MetaMove {
  usi: string;
  value: number;
  pack: [number, number, number];
}

interface MetaEntry {
  sfen: string;
  ply: number;
  hash: number;
  check: number;
  best: number;
  moves: MetaMove[];
}

interface ResultMove {
  usi: string;
  pack: [number, number, number];
  gap: number;
  keep: boolean;
}

interface ResultEntry {
  sfen: string;
  ply: number;
  hash: number;
  check: number;
  bestCp: number;
  moves: ResultMove[];
}

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
    this.send('setoption name MultiPV value 4');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 120000);
    this.send('usinewgame');
  }

  setMultiPv(n: number): void {
    this.send(`setoption name MultiPV value ${n}`);
  }

  /**
   * Clear the transposition table by re-allocating it (usinewgame does NOT fully reset the
   * engine state; toggling USI_Hash + isready was verified to restore exact determinism —
   * identical cp AND node counts across runs).
   */
  async clearHash(): Promise<void> {
    // Two-step realloc: 1MB then back to 64MB. Every measurement must run with the SAME
    // hash size (the size itself changes search behavior slightly), so a plain size toggle
    // would break determinism — this always ends on a freshly zeroed 64MB table.
    this.send('setoption name USI_Hash value 1');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 30000);
    this.send('setoption name USI_Hash value 64');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 30000);
  }

  search(sfen: string, depth: number, searchmoves?: string[]): Promise<PvInfo[]> {
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
      this.send(`go depth ${depth}${searchmoves && searchmoves.length ? ` searchmoves ${searchmoves.join(' ')}` : ''}`);
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

async function runWorker(
  entries: MetaEntry[],
  writeResult: (r: ResultEntry) => void,
  progress: () => void
): Promise<void> {
  const engine = new Engine();
  try {
    await engine.init();
    for (const e of entries) {
      await engine.clearHash();
      const top = await engine.search(e.sfen, DEPTH);
      if (top.length === 0) {
        // No PV (should not happen for book positions) — keep nothing, flag via gap=99999.
        writeResult({
          sfen: e.sfen, ply: e.ply, hash: e.hash, check: e.check, bestCp: 0,
          moves: e.moves.map((m) => ({ usi: m.usi, pack: m.pack, gap: 99999, keep: false })),
        });
        progress();
        continue;
      }
      const bestCp = top[0].cp;
      const moves: ResultMove[] = [];
      for (const m of e.moves) {
        const hit = top.find((p) => p.move === m.usi);
        let ownCp: number;
        if (hit) {
          ownCp = hit.cp;
        } else {
          // Standalone deterministic measurement: cleared TT + single-PV searchmoves.
          await engine.clearHash();
          engine.setMultiPv(1);
          const own = await engine.search(e.sfen, DEPTH, [m.usi]);
          engine.setMultiPv(4);
          ownCp = own.length > 0 ? own[0].cp : -99999;
        }
        const gap = bestCp - ownCp;
        moves.push({ usi: m.usi, pack: m.pack, gap, keep: gap <= PRUNE_GAP });
      }
      writeResult({ sfen: e.sfen, ply: e.ply, hash: e.hash, check: e.check, bestCp, moves });
      progress();
    }
  } finally {
    engine.quit();
  }
}

function emitBook(results: ResultEntry[]): void {
  interface OutEntry {
    hash: number;
    check: number;
    moves: Array<[number, number, number]>;
  }
  const out: OutEntry[] = [];
  let prunedMoves = 0;
  let keptMoves = 0;
  for (const r of results) {
    // Keep the engine's preferred order (gap ascending) so runtime tie-break priority
    // (EXTERNAL_BASE_PRIORITY - index) favors the engine-best move.
    const kept = r.moves.filter((m) => m.keep).sort((a, b) => a.gap - b.gap);
    prunedMoves += r.moves.length - kept.length;
    keptMoves += kept.length;
    if (kept.length === 0) continue;
    out.push({ hash: r.hash, check: r.check, moves: kept.map((m) => m.pack) });
  }
  out.sort((a, b) => a.hash - b.hash);

  let bytes = 8;
  for (const e of out) bytes += 7 + e.moves.length * 3;
  const buf = Buffer.alloc(bytes);
  buf.writeUInt32LE(0x314b4253, 0); // "SBK1"
  buf.writeUInt32LE(out.length, 4);
  let o = 8;
  for (const e of out) {
    buf.writeUInt32LE(e.hash >>> 0, o); o += 4;
    buf.writeUInt16LE(e.check, o); o += 2;
    buf.writeUInt8(e.moves.length, o); o += 1;
    for (const [from, to, flags] of e.moves) {
      buf.writeUInt8(from, o); o += 1;
      buf.writeUInt8(to, o); o += 1;
      buf.writeUInt8(flags, o); o += 1;
    }
  }
  fs.writeFileSync(OUT_PATH, buf);

  const verified = results
    .filter((r) => r.moves.some((m) => m.keep))
    .map((r) =>
      JSON.stringify({
        sfen: r.sfen,
        ply: r.ply,
        best: r.bestCp,
        moves: r.moves.filter((m) => m.keep).map((m) => ({ usi: m.usi, value: r.bestCp - m.gap })),
      })
    )
    .join('\n');
  fs.writeFileSync(VERIFIED_META_PATH, verified + '\n');

  console.log(`\nwrote ${OUT_PATH}: ${out.length} positions, ${keptMoves} moves, ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`wrote ${VERIFIED_META_PATH}`);
  console.log(`pruned ${prunedMoves} moves (gap > ${PRUNE_GAP}cp at depth ${DEPTH}); dropped ${results.length - out.length} now-empty positions`);
}

async function main(): Promise<void> {
  const lines = fs.readFileSync(META_PATH, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const all: MetaEntry[] = lines.map((l) => JSON.parse(l));

  // Resume: skip positions already checked.
  const done = new Map<string, ResultEntry>();
  if (fs.existsSync(RESULTS_PATH)) {
    for (const l of fs.readFileSync(RESULTS_PATH, 'utf8').split('\n')) {
      if (l.trim() === '') continue;
      try {
        const r: ResultEntry = JSON.parse(l);
        done.set(r.sfen, r);
      } catch {
        /* partial trailing line from an interrupted run — it will be re-checked */
      }
    }
  }
  const todo = all.filter((e) => !done.has(e.sfen));
  // Shallow plies first: if the run is cut short, the most-visited positions are covered.
  todo.sort((a, b) => a.ply - b.ply);
  console.log(`${all.length} positions, ${done.size} already checked, ${todo.length} to go (depth ${DEPTH}, ${PROCS} procs)`);

  const stream = fs.createWriteStream(RESULTS_PATH, { flags: 'a' });
  const writeResult = (r: ResultEntry): void => {
    stream.write(JSON.stringify(r) + '\n');
    done.set(r.sfen, r);
  };

  let processed = 0;
  const t0 = Date.now();
  const progress = (): void => {
    processed++;
    if (processed % 200 === 0) {
      const dt = (Date.now() - t0) / 1000;
      const rate = processed / dt;
      console.log(
        `progress: ${processed}/${todo.length} (${(rate * 60).toFixed(0)} pos/min, eta ${Math.round((todo.length - processed) / rate / 60)}min)`
      );
    }
  };

  if (todo.length > 0) {
    const buckets: MetaEntry[][] = Array.from({ length: PROCS }, () => []);
    todo.forEach((e, i) => buckets[i % PROCS].push(e));
    await Promise.all(buckets.filter((b) => b.length > 0).map((b) => runWorker(b, writeResult, progress)));
  }
  await new Promise<void>((resolve) => stream.end(resolve));

  // Emit from the union of previous + new results, in the original meta order.
  const results = all.map((e) => done.get(e.sfen)).filter((r): r is ResultEntry => !!r);
  if (results.length !== all.length) {
    console.error(`only ${results.length}/${all.length} positions checked — book NOT emitted; re-run to resume`);
    process.exit(1);
  }
  emitBook(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
