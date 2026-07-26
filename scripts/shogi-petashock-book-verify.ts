/**
 * Sample-verify the generated external opening book (public/shogi-opening-book-v2.bin) against a
 * real YaneuraOu at fixed depth: no stored move may be worse than the engine best by more than
 * HARD_FAIL_CP (100cp). Runs N engine processes in parallel (Threads=2 each).
 *
 * Reads the meta JSONL produced by shogi-import-petashock-book.ts (or the verified meta from
 * shogi-petashock-book-fullcheck.ts). For each sampled position:
 *   1. `go depth D` with MultiPV=4 — stored moves found in the top-4 get their cp directly.
 *   2. stored moves NOT in the top-4 are re-searched with `searchmoves <move>` to get their cp.
 *   3. gap = bestCp - moveCp; gap > HARD_FAIL_CP is a hard failure (exit 1).
 *
 * Uses the same deterministic measurement protocol as the fullcheck script: the TT is cleared
 * (USI_Hash re-allocation + isready) before every search, so with Threads=1 the values exactly
 * reproduce the fullcheck measurements regardless of sampling order.
 *
 * Usage:
 *   YANE_BIN=... YANE_EVAL_DIR=... node -r tsx/cjs scripts/shogi-petashock-book-verify.ts \
 *     <meta.jsonl> [--sample 1000] [--procs 5] [--depth 18] [--seed 42] [--threads 2]
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
  console.error('usage: node -r tsx/cjs scripts/shogi-petashock-book-verify.ts <meta.jsonl> [--sample N] [--procs P] [--depth D]');
  process.exit(2);
}
const SAMPLE = Number(argValue('--sample', '1000'));
const PROCS = Number(argValue('--procs', '5'));
const DEPTH = Number(argValue('--depth', '18'));
const SEED = Number(argValue('--seed', '42'));
// Threads=1 keeps the fixed-depth measurements deterministic (see protocol note above).
const THREADS = Number(argValue('--threads', '1'));
const HARD_FAIL_CP = 100;

const YANE_BIN = process.env.YANE_BIN ?? path.resolve(__dirname, '../ml/bin/yaneuraou');
const YANE_EVAL_DIR = process.env.YANE_EVAL_DIR ?? path.join(path.dirname(YANE_BIN), '../eval/eval');

interface MetaEntry {
  sfen: string;
  ply: number;
  best: number;
  moves: Array<{ usi: string; value: number }>;
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

  async init(multipv: number): Promise<void> {
    this.send('usi');
    await this.waitFor((l) => l === 'usiok', 15000);
    this.send(`setoption name EvalDir value ${YANE_EVAL_DIR}`);
    this.send('setoption name FV_SCALE value 20');
    this.send(`setoption name Threads value ${THREADS}`);
    this.send('setoption name USI_Hash value 64');
    this.send('setoption name USI_OwnBook value false');
    this.send('setoption name BookFile value no_book');
    this.send('setoption name NetworkDelay value 0');
    this.send('setoption name NetworkDelay2 value 0');
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 120000);
    this.send('usinewgame');
  }

  setMultiPv(n: number): void {
    this.send(`setoption name MultiPV value ${n}`);
  }

  /** Clear the TT by re-allocating it (see shogi-petashock-book-fullcheck.ts for rationale). */
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

// Deterministic PRNG for reproducible sampling.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Failure {
  sfen: string;
  usi: string;
  gap: number;
  bestMove: string;
  bestCp: number;
  ownCp: number;
}

async function runWorker(
  id: number,
  entries: MetaEntry[],
  results: { checkedMoves: number; warns: number; failures: Failure[] },
  progress: () => void
): Promise<void> {
  const engine = new Engine();
  try {
    await engine.init(4);
    for (const e of entries) {
      await engine.clearHash();
      const top = await engine.search(e.sfen, DEPTH);
      progress();
      if (top.length === 0) continue;
      const bestCp = top[0].cp;
      for (const m of e.moves) {
        results.checkedMoves++;
        const hit = top.find((p) => p.move === m.usi);
        let ownCp: number;
        if (hit) {
          ownCp = hit.cp;
        } else {
          await engine.clearHash();
          engine.setMultiPv(1);
          const own = await engine.search(e.sfen, DEPTH, [m.usi]);
          engine.setMultiPv(4);
          ownCp = own.length > 0 ? own[0].cp : -99999;
        }
        const gap = bestCp - ownCp;
        if (gap > HARD_FAIL_CP) {
          results.failures.push({ sfen: e.sfen, usi: m.usi, gap, bestMove: top[0].move, bestCp, ownCp });
          console.log(`BAD  [w${id}] ${m.usi} gap=${gap} (best=${top[0].move} ${bestCp}cp, book=${ownCp}cp) sfen="${e.sfen}"`);
        } else if (gap > 50) {
          results.warns++;
          console.log(`WARN [w${id}] ${m.usi} gap=${gap} (best=${top[0].move} ${bestCp}cp) sfen="${e.sfen}"`);
        }
      }
    }
  } finally {
    engine.quit();
  }
}

async function main(): Promise<void> {
  const lines = fs.readFileSync(META_PATH, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const all: MetaEntry[] = lines.map((l) => JSON.parse(l));
  console.log(`${all.length} book positions in ${META_PATH}`);

  // Sample: every position at ply <= 3 (highest traffic) + SAMPLE uniformly random others.
  const rand = mulberry32(SEED);
  const early = all.filter((e) => e.ply <= 3);
  const rest = all.filter((e) => e.ply > 3);
  const picked = new Set<number>();
  const sampled: MetaEntry[] = [...early];
  const n = Math.min(SAMPLE, rest.length);
  while (picked.size < n) {
    const i = Math.floor(rand() * rest.length);
    if (picked.has(i)) continue;
    picked.add(i);
    sampled.push(rest[i]);
  }
  const totalMoves = sampled.reduce((s, e) => s + e.moves.length, 0);
  console.log(`verifying ${sampled.length} positions (${early.length} early + ${n} sampled), ${totalMoves} moves, depth ${DEPTH}, ${PROCS} procs x ${THREADS} threads`);

  const results = { checkedMoves: 0, warns: 0, failures: [] as Failure[] };
  let done = 0;
  const t0 = Date.now();
  const progress = (): void => {
    done++;
    if (done % 25 === 0) {
      const dt = (Date.now() - t0) / 1000;
      console.log(`  progress: ${done}/${sampled.length} positions, ${Math.round(dt)}s elapsed, eta ${Math.round((dt / done) * (sampled.length - done))}s`);
    }
  };

  // Round-robin split so each worker gets a similar ply mix.
  const buckets: MetaEntry[][] = Array.from({ length: PROCS }, () => []);
  sampled.forEach((e, i) => buckets[i % PROCS].push(e));

  await Promise.all(buckets.map((b, i) => runWorker(i, b, results, progress)));

  const dt = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\nchecked ${results.checkedMoves} moves across ${sampled.length} positions in ${dt}s`);
  console.log(`${results.warns} warnings (50 < gap <= ${HARD_FAIL_CP}cp), ${results.failures.length} hard failures (gap > ${HARD_FAIL_CP}cp)`);
  if (results.failures.length > 0) {
    console.log('\nfailures:');
    for (const f of results.failures) {
      console.log(`  ${f.usi} gap=${f.gap} sfen="${f.sfen}"`);
    }
    process.exit(1);
  }
  console.log('OK: no stored book move is worse than the engine best by more than 100cp (sampled)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
