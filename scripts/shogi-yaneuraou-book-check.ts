/**
 * Validate OpeningBookImproved lines against a local YaneuraOu (NNUE) engine.
 *
 * For every position that occurs inside a book line we ask YaneuraOu (MultiPV 2, fixed depth)
 * for its top moves. A book move is flagged when it is NOT in the engine top-2; in that case we
 * additionally evaluate the book move itself (`go ... searchmoves <move>`) and report the cp gap
 * vs the engine best move. Gaps >= 200cp are hard failures (exit code 1).
 *
 * The engine binary/eval are NOT part of this repo. Point the script at them via env vars:
 *   YANE_BIN=/path/to/yaneuraou YANE_EVAL_DIR=/path/to/eval \
 *     node -r tsx/cjs scripts/shogi-yaneuraou-book-check.ts [depth] [threads]
 *
 * Optional: pass `--extend` to also print, for the END position of every line, the engine's
 * top-2 moves (candidates for extending the line).
 */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import { OPENING_LINES, BookMove } from '../src/components/game/ShogiImproved/OpeningBookImproved';
import { FU, KY, KE, GI, KI, KA, HI } from '../src/components/game/ShogiImproved/types';

const argv = process.argv.slice(2).filter((a) => a !== '--extend');
const EXTEND = process.argv.includes('--extend');
const DEPTH = Number(argv[0] ?? 18);
const THREADS = Number(argv[1] ?? 4);
const HARD_FAIL_CP = 200;

const YANE_BIN =
  process.env.YANE_BIN ??
  path.resolve(__dirname, '../ml/bin/yaneuraou');
const YANE_EVAL_DIR = process.env.YANE_EVAL_DIR ?? path.join(path.dirname(YANE_BIN), '../eval/eval');

// --- USI helpers -----------------------------------------------------------

const DROP_LETTER: Record<number, string> = {
  [FU]: 'P',
  [KY]: 'L',
  [KE]: 'N',
  [GI]: 'S',
  [KI]: 'G',
  [KA]: 'B',
  [HI]: 'R',
};

function sq(suji: number, dan: number): string {
  return `${suji}${String.fromCharCode('a'.charCodeAt(0) + dan - 1)}`;
}

function toUsi(m: BookMove): string {
  if (m.from.suji === 0 && m.from.dan === 0) {
    const letter = DROP_LETTER[m.drop ?? 0];
    if (!letter) throw new Error(`bad drop piece: ${m.drop}`);
    return `${letter}*${sq(m.to.suji, m.to.dan)}`;
  }
  return `${sq(m.from.suji, m.from.dan)}${sq(m.to.suji, m.to.dan)}${m.promote ? '+' : ''}`;
}

// --- Minimal USI engine driver ----------------------------------------------

interface PvInfo {
  multipv: number;
  cp: number; // mate mapped to +/-(30000 - n)
  move: string;
  depth: number;
}

class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private stderrTail = '';
  private handler: ((line: string) => void) | null = null;

  constructor() {
    this.proc = spawn(YANE_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    // Fail fast (and legibly) when YANE_BIN is missing / not executable.
    this.proc.on('error', (e) => {
      console.error(`failed to launch engine "${YANE_BIN}": ${e.message}`);
      console.error('set YANE_BIN / YANE_EVAL_DIR to a local YaneuraOu binary + NNUE eval dir.');
      process.exit(1);
    });
    // Drain stderr so the child never blocks on a full pipe buffer; keep a short tail for errors.
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
        console.error(`engine exited with code ${code}`);
        if (this.stderrTail) console.error(`engine stderr (tail):\n${this.stderrTail}`);
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
    this.send('setoption name USI_Hash value 512');
    this.send('setoption name USI_OwnBook value false');
    this.send('setoption name BookFile value no_book');
    this.send('setoption name NetworkDelay value 0');
    this.send('setoption name NetworkDelay2 value 0');
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 120000);
    this.send('usinewgame');
  }

  /** Search a position; returns final-depth PV lines (multipv order). */
  search(movesUsi: string[], depth: number, searchmoves?: string[]): Promise<PvInfo[]> {
    return new Promise((resolve, reject) => {
      const pvs = new Map<number, PvInfo>();
      const timer = setTimeout(() => {
        this.handler = null;
        reject(new Error('search timeout'));
      }, 600000);
      this.handler = (line) => {
        if (line.startsWith('info ') && line.includes(' pv ')) {
          const dm = line.match(/\bdepth (\d+)/);
          const mm = line.match(/multipv (\d+)/);
          const sm = line.match(/score (cp|mate) (-?\d+)/);
          const pm = line.match(/ pv (\S+)/);
          if (dm && sm && pm) {
            const mpv = mm ? parseInt(mm[1], 10) : 1;
            let cp: number;
            if (sm[1] === 'mate') {
              const n = parseInt(sm[2], 10);
              cp = (n > 0 ? 1 : -1) * (30000 - Math.min(Math.abs(n), 1000));
            } else {
              cp = parseInt(sm[2], 10);
            }
            pvs.set(mpv, { multipv: mpv, cp, move: pm[1], depth: parseInt(dm[1], 10) });
          }
        } else if (line.startsWith('bestmove')) {
          clearTimeout(timer);
          this.handler = null;
          resolve([...pvs.values()].sort((a, b) => a.multipv - b.multipv));
        }
      };
      const pos = movesUsi.length === 0 ? 'position startpos' : `position startpos moves ${movesUsi.join(' ')}`;
      this.send(pos);
      this.send(`go depth ${depth}${searchmoves && searchmoves.length ? ` searchmoves ${searchmoves.join(' ')}` : ''}`);
    });
  }

  quit(): void {
    // Called from a `finally` — never let cleanup mask the original error.
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

// --- Main --------------------------------------------------------------------

interface CheckPoint {
  movesUsi: string[]; // moves leading to the position
  bookMoves: Map<string, string[]>; // usi move -> line names that play it here
}

async function main(): Promise<void> {
  // Collect unique positions (keyed by the exact move sequence; transpositions are
  // re-analyzed but that only costs a little compute thanks to the shared hash table).
  const points = new Map<string, CheckPoint>();
  for (const line of OPENING_LINES) {
    const prefix: string[] = [];
    for (const mv of line.moves) {
      const usi = toUsi(mv);
      const key = prefix.join(' ');
      let cp = points.get(key);
      if (!cp) {
        cp = { movesUsi: [...prefix], bookMoves: new Map() };
        points.set(key, cp);
      }
      const names = cp.bookMoves.get(usi) ?? [];
      names.push(line.name);
      cp.bookMoves.set(usi, names);
      prefix.push(usi);
    }
  }

  const engine = new Engine();

  let flagged = 0;
  let hardFailures = 0;
  let checked = 0;
  const t0 = Date.now();

  // Ensure the engine process is told to quit even if a search times out / throws mid-run.
  try {
    await engine.init(2);

    const sorted = [...points.values()].sort((a, b) => a.movesUsi.length - b.movesUsi.length);
    for (const pt of sorted) {
      const top = await engine.search(pt.movesUsi, DEPTH);
      if (top.length === 0) continue;
      const best = top[0];
      const ply = pt.movesUsi.length + 1;
      for (const [bookMove, names] of pt.bookMoves) {
        checked++;
        const hit = top.find((p) => p.move === bookMove);
        if (hit) {
          const diff = best.cp - hit.cp;
          console.log(
            `OK   ply${String(ply).padStart(2)} ${bookMove.padEnd(6)} rank=${hit.multipv} diff=${diff} [${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}]`
          );
          continue;
        }
        // Not in top-2: evaluate the book move itself.
        const own = await engine.search(pt.movesUsi, DEPTH, [bookMove]);
        const ownCp = own.length > 0 ? own[0].cp : -99999;
        const diff = best.cp - ownCp;
        const sev = diff >= HARD_FAIL_CP ? 'BAD ' : 'WARN';
        if (diff >= HARD_FAIL_CP) hardFailures++;
        flagged++;
        console.log(
          `${sev} ply${String(ply).padStart(2)} ${bookMove.padEnd(6)} not in top2 (best=${best.move} ${best.cp}cp, book=${ownCp}cp, diff=${diff}) pos="${pt.movesUsi.join(' ')}" [${names.join(', ')}]`
        );
      }
    }

    if (EXTEND) {
      console.log('\n--- line-end extension candidates (engine top-2) ---');
      const seen = new Set<string>();
      for (const line of OPENING_LINES) {
        const movesUsi = line.moves.map(toUsi);
        const key = movesUsi.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        const top = await engine.search(movesUsi, DEPTH);
        const desc = top.map((p) => `${p.move} (${p.cp}cp)`).join('  ');
        console.log(`${line.name} [${movesUsi.length} plies]: ${desc}`);
      }
    }
  } finally {
    engine.quit();
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\nchecked ${checked} book moves across ${points.size} positions in ${dt}s`);
  console.log(`${flagged} flagged, ${hardFailures} with diff >= ${HARD_FAIL_CP}cp`);
  if (hardFailures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
