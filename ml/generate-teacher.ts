/**
 * generate-teacher.ts — 蒸留学習用の教師データ生成スクリプト
 *
 * 自作エンジン(ShogiAIImprovedV20)の低budget自己対戦 + ランダム分岐で多様な局面を生成し、
 * やねうら王(NNUE, Háo評価関数)に USI 経由で評価させ、JSONL として保存する。
 *
 * 実行例:
 *   node -r tsx/cjs ml/generate-teacher.ts --target 10000
 *   node -r tsx/cjs ml/generate-teacher.ts --target 100000 --engines 8
 *
 * 再開可能: 出力ファイル(JSONL)は追記式。既存行の SFEN をロードして重複を排除し、
 * 目標局面数(--target)に達するまで続きから生成する。
 *
 * 出力レコード (1行1局面):
 *   { sfen, cp, ply, bestmove, depth }
 *   - cp: 手番側から見た評価値(centipawn)。詰みは ±(30000 - 詰み手数) に写像。
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import {
  SENTE,
  GOTE,
  EMPTY,
  getKomashu,
  isSente,
  PROMOTE,
  SFU,
  SHI,
  GFU,
  GHI,
  Te,
} from '../src/components/game/ShogiImproved/types';

// ---------------------------------------------------------------------------
// CLI 引数
// ---------------------------------------------------------------------------

interface Args {
  target: number; // 目標局面数(ファイル内の総行数)
  out: string; // 出力 JSONL
  depth: number; // やねうら王の探索深さ
  engines: number; // 並列エンジンプロセス数
  moveTimeMs: number; // 自己対戦の1手あたり思考時間(ms)
  epsilon: number; // ランダム分岐確率
  minPly: number;
  maxPly: number;
  chunk: number; // 生成→ラベリングのチャンクサイズ
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (name: string, def: string): string => {
    const i = a.indexOf(`--${name}`);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : def;
  };
  return {
    target: parseInt(get('target', '10000'), 10),
    out: get('out', path.join(__dirname, 'data', 'teacher.jsonl')),
    depth: parseInt(get('depth', '8'), 10),
    engines: parseInt(get('engines', '8'), 10),
    moveTimeMs: parseInt(get('movetime', '25'), 10),
    epsilon: parseFloat(get('epsilon', '0.2')),
    minPly: parseInt(get('min-ply', '6'), 10),
    maxPly: parseInt(get('max-ply', '120'), 10),
    chunk: parseInt(get('chunk', '2000'), 10),
  };
}

// ---------------------------------------------------------------------------
// SFEN 変換 (KyokumenImproved → SFEN)
// ---------------------------------------------------------------------------

// 駒種(1..7,8)→SFEN文字。TO..RY は "+基本駒"。
const SFEN_LETTER: { [k: number]: string } = {
  1: 'P', // FU
  2: 'L', // KY
  3: 'N', // KE
  4: 'S', // GI
  5: 'G', // KI
  6: 'B', // KA
  7: 'R', // HI
  8: 'K', // OU
};

function pieceToSfen(koma: number): string {
  const kind = getKomashu(koma);
  const base = kind & 0x07; // 成りフラグを除いた基本駒種
  const promoted = (kind & PROMOTE) !== 0 && base !== 0;
  // OU(8)は kind & 0x07 === 0 になるので特別扱い
  const letter = kind === 8 ? 'K' : SFEN_LETTER[base];
  if (!letter) throw new Error(`unknown koma: ${koma}`);
  const s = (promoted ? '+' : '') + letter;
  return isSente(koma) ? s : s.toLowerCase();
}

/** KyokumenImproved を SFEN 文字列に変換する。moveCount は手数(1始まり)。 */
export function toSfen(k: KyokumenImproved, moveCount: number): string {
  // 盤面: 一段目(dan=1)から九段目、各段は 9筋→1筋 の順。
  const rows: string[] = [];
  for (let dan = 1; dan <= 9; dan++) {
    let row = '';
    let emptyRun = 0;
    for (let suji = 9; suji >= 1; suji--) {
      const koma = k.ban[(suji << 4) + dan];
      if (koma === EMPTY) {
        emptyRun++;
      } else {
        if (emptyRun > 0) {
          row += emptyRun;
          emptyRun = 0;
        }
        row += pieceToSfen(koma);
      }
    }
    if (emptyRun > 0) row += emptyRun;
    rows.push(row);
  }
  const board = rows.join('/');
  const teban = k.teban === SENTE ? 'b' : 'w';

  // 持ち駒: 慣例に従い 飛角金銀桂香歩 (R,B,G,S,N,L,P) の順。先手(大文字)→後手(小文字)。
  const HAND_ORDER = [7, 6, 5, 4, 3, 2, 1]; // HI,KA,KI,GI,KE,KY,FU
  let hand = '';
  for (const kind of HAND_ORDER) {
    const n = k.hand[SENTE + kind] || 0;
    if (n > 0) hand += (n > 1 ? String(n) : '') + SFEN_LETTER[kind];
  }
  for (const kind of HAND_ORDER) {
    const n = k.hand[GOTE + kind] || 0;
    if (n > 0) hand += (n > 1 ? String(n) : '') + SFEN_LETTER[kind].toLowerCase();
  }
  if (hand === '') hand = '-';

  return `${board} ${teban} ${hand} ${moveCount}`;
}

/** 重複排除キー: 手数を除いた SFEN */
function sfenKey(sfen: string): string {
  return sfen.split(' ').slice(0, 3).join(' ');
}

// ---------------------------------------------------------------------------
// 乱数 (シード付き mulberry32)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 自己対戦による局面生成
// ---------------------------------------------------------------------------

interface RawPosition {
  sfen: string;
  ply: number;
}

/**
 * 1ゲームを対局し、[minPly, maxPly] の手数範囲で「手番側が王手されていない」局面を収集する。
 * 確率 epsilon でランダムな合法手を指す(分岐の多様化)。
 */
function playOneGame(
  ai: ShogiAIImprovedV20,
  rng: () => number,
  args: Args,
  sink: (p: RawPosition) => void
): void {
  const k = InitialPositionImproved.createInitialPosition();
  let teban = SENTE;
  k.setTeban(teban);

  for (let ply = 0; ply <= args.maxPly + 2; ply++) {
    k.setTeban(teban);
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    if (legal.length === 0) return; // 詰み(投了)

    // 収集: 手数条件 + 王手中でない
    if (ply >= args.minPly && ply <= args.maxPly) {
      if (!GenerateMovesImproved.isKingInCheck(k, teban)) {
        sink({ sfen: toSfen(k, ply + 1), ply });
      }
    }

    let te: Te | null = null;
    if (rng() < args.epsilon) {
      te = legal[Math.floor(rng() * legal.length)];
    } else {
      te = ai.getNextTe(k, ply, {
        difficulty: 'medium',
        maxDepth: 4,
        maxTimeMs: args.moveTimeMs,
      });
    }
    if (!te) te = legal[Math.floor(rng() * legal.length)];

    k.setTeban(teban); // getNextTe 内で変更される可能性に備える
    k.move(te);
    teban = teban === SENTE ? GOTE : SENTE;
  }
}

// ---------------------------------------------------------------------------
// USI エンジンラッパ (やねうら王)
// ---------------------------------------------------------------------------

const ML_DIR = __dirname;
const ENGINE_BIN = path.join(ML_DIR, 'bin', 'yaneuraou');
const EVAL_DIR = path.join(ML_DIR, 'eval', 'eval');

interface EvalResult {
  cp: number;
  bestmove: string;
  mate?: number;
}

class UsiEngine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = '';
  private lineHandler: ((line: string) => void) | null = null;

  constructor() {
    this.proc = spawn(ENGINE_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.on('data', (d: Buffer) => {
      this.buf += d.toString();
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).replace(/\r$/, '');
        this.buf = this.buf.slice(idx + 1);
        if (this.lineHandler) this.lineHandler(line);
      }
    });
  }

  private send(cmd: string): void {
    this.proc.stdin.write(cmd + '\n');
  }

  private waitFor(pred: (line: string) => boolean, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandler = null;
        reject(new Error(`USI timeout waiting (${timeoutMs}ms)`));
      }, timeoutMs);
      this.lineHandler = (line) => {
        if (pred(line)) {
          clearTimeout(timer);
          this.lineHandler = null;
          resolve();
        }
      };
    });
  }

  async init(): Promise<void> {
    this.send('usi');
    await this.waitFor((l) => l === 'usiok', 15000);
    this.send(`setoption name EvalDir value ${EVAL_DIR}`);
    this.send('setoption name FV_SCALE value 20'); // Háo 推奨値
    this.send('setoption name Threads value 1');
    this.send('setoption name USI_Hash value 128');
    this.send('setoption name USI_OwnBook value false');
    this.send('setoption name BookFile value no_book');
    this.send('setoption name NetworkDelay value 0');
    this.send('setoption name NetworkDelay2 value 0');
    this.send('isready');
    await this.waitFor((l) => l === 'readyok', 120000);
    this.send('usinewgame');
  }

  /** 局面を depth 固定で評価し、手番側視点の cp を返す。 */
  evaluate(sfen: string, depth: number): Promise<EvalResult | null> {
    return new Promise((resolve, reject) => {
      let lastCp: number | null = null;
      let lastMate: number | null = null;
      const timer = setTimeout(() => {
        this.lineHandler = null;
        reject(new Error('USI eval timeout'));
      }, 60000);
      this.lineHandler = (line) => {
        if (line.startsWith('info ')) {
          const m = line.match(/score (cp|mate) (-?\d+)/);
          if (m) {
            if (m[1] === 'cp') {
              lastCp = parseInt(m[2], 10);
              lastMate = null;
            } else {
              lastMate = parseInt(m[2], 10);
            }
          }
        } else if (line.startsWith('bestmove')) {
          clearTimeout(timer);
          this.lineHandler = null;
          const bestmove = line.split(/\s+/)[1] ?? '';
          if (lastMate !== null) {
            // 詰みスコアを大きな cp に写像 (±30000 - 手数)
            const sign = lastMate > 0 || (lastMate === 0 && bestmove !== 'resign') ? 1 : -1;
            const n = Math.abs(lastMate);
            resolve({ cp: sign * (30000 - Math.min(n, 1000)), mate: lastMate, bestmove });
          } else if (lastCp !== null) {
            resolve({ cp: lastCp, bestmove });
          } else {
            resolve(null); // スコアが取れなかった(宣言勝ち等) → スキップ
          }
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
      /* noop */
    }
    setTimeout(() => this.proc.kill(), 500).unref();
  }
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();
  fs.mkdirSync(path.dirname(args.out), { recursive: true });

  if (!fs.existsSync(ENGINE_BIN)) {
    console.error(`engine not found: ${ENGINE_BIN}\nml/README.md のビルド手順を先に実行してください。`);
    process.exit(1);
  }

  // --- 再開: 既存 JSONL から SFEN キーをロード ---
  const seen = new Set<string>();
  let existing = 0;
  if (fs.existsSync(args.out)) {
    const lines = fs.readFileSync(args.out, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        seen.add(sfenKey(rec.sfen));
        existing++;
      } catch {
        /* 壊れた行(書き込み中断)は無視 — 追記なので末尾のみ起こり得る */
      }
    }
  }
  console.log(
    `[gen] target=${args.target} existing=${existing} depth=${args.depth} engines=${args.engines} out=${args.out}`
  );
  if (existing >= args.target) {
    console.log('[gen] already reached target. nothing to do.');
    return;
  }

  // --- エンジンプール起動 ---
  const engines: UsiEngine[] = [];
  for (let i = 0; i < args.engines; i++) engines.push(new UsiEngine());
  await Promise.all(engines.map((e) => e.init()));
  console.log(`[gen] ${engines.length} engine workers ready`);

  const ai = new ShogiAIImprovedV20();
  const rng = mulberry32((Date.now() ^ (process.pid << 8)) >>> 0);
  const outFd = fs.openSync(args.out, 'a');

  let total = existing;
  const t0 = Date.now();
  let labeledSinceStart = 0;

  while (total < args.target) {
    // --- フェーズ1: 自己対戦でチャンク分の新規局面を生成 ---
    const chunkTarget = Math.min(args.chunk, args.target - total);
    const pending: RawPosition[] = [];
    const tGen = Date.now();
    while (pending.length < chunkTarget) {
      playOneGame(ai, rng, args, (p) => {
        const key = sfenKey(p.sfen);
        if (seen.has(key)) return;
        seen.add(key);
        if (pending.length < chunkTarget) pending.push(p);
      });
    }
    const genSec = (Date.now() - tGen) / 1000;

    // --- フェーズ2: エンジンプールでラベリング(並列) ---
    const tLab = Date.now();
    let cursor = 0;
    let done = 0;
    const lines: string[] = [];
    await Promise.all(
      engines.map(async (engine) => {
        for (;;) {
          const i = cursor++;
          if (i >= pending.length) return;
          const pos = pending[i];
          let res: EvalResult | null = null;
          try {
            res = await engine.evaluate(pos.sfen, args.depth);
          } catch (e) {
            console.error(`[gen] eval error (skip): ${(e as Error).message}`);
            continue;
          }
          if (!res || res.bestmove === 'resign' || res.bestmove === 'win') {
            if (!res) continue;
          }
          const rec: Record<string, unknown> = {
            sfen: pos.sfen,
            cp: res.cp,
            ply: pos.ply,
            bestmove: res.bestmove,
            depth: args.depth,
          };
          if (res.mate !== undefined) rec.mate = res.mate;
          lines.push(JSON.stringify(rec));
          done++;
          labeledSinceStart++;
          if (done % 500 === 0) {
            const rate = labeledSinceStart / ((Date.now() - t0) / 1000);
            console.log(
              `[gen] labeled ${total + done}/${args.target} (${rate.toFixed(1)} pos/s overall)`
            );
          }
        }
      })
    );
    const labSec = (Date.now() - tLab) / 1000;

    fs.writeSync(outFd, lines.join('\n') + '\n');
    fs.fsyncSync(outFd);
    total += lines.length;
    const rate = pending.length / labSec;
    console.log(
      `[gen] chunk done: +${lines.length} (gen ${genSec.toFixed(1)}s, label ${labSec.toFixed(
        1
      )}s = ${rate.toFixed(1)} pos/s) total=${total}/${args.target}`
    );
  }

  fs.closeSync(outFd);
  engines.forEach((e) => e.quit());
  console.log(`[gen] finished. total=${total} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
