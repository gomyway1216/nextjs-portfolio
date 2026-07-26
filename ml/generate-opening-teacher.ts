/**
 * generate-opening-teacher.ts — 序盤特化の教師データ生成スクリプト (追い焚き用)
 *
 * 供給源: ペタショック定跡 (public/shogi-opening-book-v2.bin, 約10万局面・〜30手目) を
 * BFS 展開した「定跡内の全局面 + 定跡を1手出た直後の局面」。さらに各局面から
 * 自作エンジン(WASM) + ランダム分岐のロールアウトで数手進め、「定跡を出た直後」
 * の局面 (NNUE の序盤バイアスが出る領域そのもの) を収集する。
 *
 * ラベリングは generate-teacher.ts と同一 (やねうら王 depth12, 手番側視点 cp,
 * 詰みは ±(30000-手数))。出力フォーマットも同一 JSONL {sfen, cp, ply, bestmove, depth}。
 *
 * 実行例 (6シャード並列):
 *   for i in 0 1 2 3 4 5; do
 *     node -r tsx/cjs ml/generate-opening-teacher.ts \
 *       --out ml/data/opening-$i.jsonl --shard $i/6 --engines 2 --depth 12 &
 *   done
 *
 * シャード分割は BFS 訪問順の round-robin (i % n)。各シャードは自分のノードの
 * 「局面そのもの + ロールアウト局面」のみを出力するため、シャード間の重複は
 * ロールアウトの合流分のみ (最終 mix 時に sfen キーで全体重複排除する前提)。
 *
 * 再開可能: generate-teacher.ts と同じ追記式。--resume-skip-nodes で既処理
 * ノードを飛ばすのではなく、既存行の SFEN を seen にロードして重複出力を防ぐ。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { wasmSearchBestMove } from '../src/components/game/ShogiImproved/wasmEngine';
import { SENTE, GOTE, Te } from '../src/components/game/ShogiImproved/types';
import { toSfen, UsiEngine, EvalResult } from './generate-teacher';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  out: string;
  book: string;
  depth: number;
  engines: number;
  moveTimeMs: number;
  epsilon: number;
  rollouts: number; // 各ノードからのロールアウト本数
  extend: number; // ロールアウトで進める手数
  minPly: number; // 収集する最小手数 (ply)
  maxPly: number; // 収集する最大手数 (ply)
  chunk: number;
  shard: { index: number; total: number };
  seed: number;
  target: number; // 出力ファイルの行数上限 (0 = ノード枯渇まで)
  balance: boolean;
  balanceCp: number;
  balanceRate: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (name: string, def: string): string => {
    const i = a.indexOf(`--${name}`);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : def;
  };
  const shardStr = get('shard', '0/1');
  const m = shardStr.match(/^(\d+)\/(\d+)$/);
  if (!m) throw new Error(`--shard must be i/n, got: ${shardStr}`);
  const shard = { index: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  if (shard.index < 0 || shard.total < 1 || shard.index >= shard.total) {
    throw new Error(`invalid shard: ${shardStr}`);
  }
  return {
    out: get('out', path.join(__dirname, 'data', 'opening-teacher.jsonl')),
    book: get('book', path.join(__dirname, '..', 'public', 'shogi-opening-book-v2.bin')),
    depth: parseInt(get('depth', '12'), 10),
    engines: parseInt(get('engines', '2'), 10),
    moveTimeMs: parseInt(get('movetime', '25'), 10),
    epsilon: parseFloat(get('epsilon', '0.2')),
    rollouts: parseInt(get('rollouts', '1'), 10),
    extend: parseInt(get('extend', '6'), 10),
    minPly: parseInt(get('min-ply', '2'), 10),
    maxPly: parseInt(get('max-ply', '32'), 10),
    chunk: parseInt(get('chunk', '2000'), 10),
    shard,
    seed: parseInt(get('seed', '1'), 10),
    target: parseInt(get('target', '0'), 10),
    balance: a.includes('--balance'),
    balanceCp: parseInt(get('balance-cp', '1200'), 10),
    balanceRate: parseFloat(get('balance-rate', '0.5')),
  };
}

// ---------------------------------------------------------------------------
// 乱数 (mulberry32, generate-teacher.ts と同一)
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

function sfenKey(sfen: string): string {
  return sfen.split(' ').slice(0, 3).join(' ');
}

// ---------------------------------------------------------------------------
// 定跡バイナリ (SBK2) のロード — フォーマットは
// scripts/shogi-import-petashock-book.ts / OpeningBookImproved.loadExternalOpeningBook 参照
// ---------------------------------------------------------------------------

interface BookEntry {
  moves: Uint8Array; // (from, to, flags) x n — best-first
}

function bookKey(hashA: number, hashB: number): string {
  return `${hashA >>> 0}:${hashB >>> 0}`;
}

function loadBook(file: string): Map<string, BookEntry> {
  const buf = fs.readFileSync(file);
  if (buf.byteLength < 8) throw new Error('book is truncated');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x324b4253) throw new Error('bad book magic');
  const count = dv.getUint32(4, true);
  const map = new Map<string, BookEntry>();
  let off = 8;
  for (let i = 0; i < count; i++) {
    if (off + 9 > buf.byteLength) throw new Error(`book entry ${i} is truncated`);
    const hashA = dv.getUint32(off, true);
    const hashB = dv.getUint32(off + 4, true);
    const n = dv.getUint8(off + 8);
    off += 9;
    if (n === 0 || off + n * 3 > buf.byteLength) throw new Error(`book entry ${i} has invalid moves`);
    const key = bookKey(hashA, hashB);
    if (map.has(key)) throw new Error(`book entry ${i} duplicates ${key}`);
    map.set(key, {
      moves: new Uint8Array(buf.buffer, buf.byteOffset + off, n * 3),
    });
    off += n * 3;
  }
  if (off !== buf.byteLength) throw new Error('book length mismatch');
  return map;
}

/** packed book moves を現局面の合法手と突き合わせて Te 配列にする (不一致は捨てる)。 */
function matchBookMoves(entry: BookEntry, k: KyokumenImproved, legal: Te[]): Te[] {
  const out: Te[] = [];
  const mv = entry.moves;
  const n = (mv.length / 3) | 0;
  for (let i = 0; i < n; i++) {
    const from = mv[i * 3];
    const to = mv[i * 3 + 1];
    const flags = mv[i * 3 + 2];
    const promote = (flags & 1) !== 0;
    const dropType = (flags >> 1) & 7;
    for (const m of legal) {
      if (m.to !== to || m.from !== from) continue;
      if (from === 0) {
        if (m.koma !== (dropType | k.teban)) continue;
      } else if (m.promote !== promote) {
        continue;
      }
      out.push(m);
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// BFS: 定跡内全局面 + 定跡を1手出た子局面 を列挙
// ---------------------------------------------------------------------------

interface BookNode {
  path: Te[]; // 初期局面からの手順
  ply: number; // path.length
  inBook: boolean; // この局面自体が定跡エントリを持つか
}

function replay(path: Te[]): KyokumenImproved {
  const k = InitialPositionImproved.createInitialPosition();
  let teban = SENTE;
  k.setTeban(teban);
  for (const te of path) {
    k.setTeban(teban);
    k.move(te);
    teban = teban === SENTE ? GOTE : SENTE;
  }
  k.setTeban(path.length % 2 === 0 ? SENTE : GOTE);
  return k;
}

function enumerateBookNodes(book: Map<string, BookEntry>): BookNode[] {
  const visited = new Set<string>();
  const nodes: BookNode[] = [];
  const queue: Te[][] = [[]];
  // O(n) デキュー: queue.shift() は要素の再インデックスで BFS 全体が O(n²) に
  // なるため（~86k ノードで顕著）、読み出しヘッドを進めるだけにする。
  let head = 0;
  while (head < queue.length) {
    const path = queue[head++];
    const k = replay(path);
    const key = sfenKey(toSfen(k, path.length + 1));
    if (visited.has(key)) continue;
    visited.add(key);
    const entry = book.get(bookKey(k.HashVal, k.SecondaryHashVal));
    const inBook = entry !== undefined;
    nodes.push({ path, ply: path.length, inBook });
    if (!inBook) continue; // 定跡を出た局面: 収集はするが展開しない
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    for (const te of matchBookMoves(entry!, k, legal)) {
      queue.push([...path, te]);
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// ロールアウト: ノード局面から extend 手進めて局面を収集
// ---------------------------------------------------------------------------

interface RawPosition {
  sfen: string;
  ply: number;
}

function rolloutFrom(
  node: BookNode,
  args: Args,
  rng: () => number,
  sink: (p: RawPosition) => void
): void {
  const k = replay(node.path);
  let teban = node.ply % 2 === 0 ? SENTE : GOTE;
  for (let step = 0; step < args.extend; step++) {
    const ply = node.ply + step;
    k.setTeban(teban);
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    if (legal.length === 0) return;
    let te: Te | null = null;
    if (rng() < args.epsilon) {
      te = legal[Math.floor(rng() * legal.length)];
    } else {
      // 定跡は引かず素のエンジン探索 (「定跡を出た後」の分布を作るのが目的)
      te = wasmSearchBestMove(k, ply, args.moveTimeMs, 4, 8);
    }
    if (!te) te = legal[Math.floor(rng() * legal.length)];
    k.setTeban(teban);
    k.move(te);
    teban = teban === SENTE ? GOTE : SENTE;
    const newPly = ply + 1;
    if (newPly >= args.minPly && newPly <= args.maxPly) {
      k.setTeban(teban);
      if (!GenerateMovesImproved.isKingInCheck(k, teban)) {
        sink({ sfen: toSfen(k, newPly + 1), ply: newPly });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();
  fs.mkdirSync(path.dirname(args.out), { recursive: true });

  console.log(`[open-gen] loading book: ${args.book}`);
  const book = loadBook(args.book);
  console.log(`[open-gen] book entries: ${book.size}`);
  const t0 = Date.now();
  const nodes = enumerateBookNodes(book);
  const inBookCount = nodes.filter((n) => n.inBook).length;
  console.log(
    `[open-gen] BFS done: ${nodes.length} nodes (${inBookCount} in-book, ` +
      `${nodes.length - inBookCount} just-out-of-book) in ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );

  // シャード割当 (BFS訪問順 round-robin)
  const myNodes = nodes.filter((_, i) => i % args.shard.total === args.shard.index);
  console.log(
    `[open-gen] shard ${args.shard.index}/${args.shard.total}: ${myNodes.length} nodes, ` +
      `rollouts=${args.rollouts} extend=${args.extend} epsilon=${args.epsilon} depth=${args.depth}`
  );

  // 再開: 既存出力の SFEN キーをロード
  const seen = new Set<string>();
  let existing = 0;
  if (fs.existsSync(args.out)) {
    const rl = readline.createInterface({
      input: fs.createReadStream(args.out, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        seen.add(sfenKey(rec.sfen));
        existing++;
      } catch {
        /* 末尾の壊れた行は無視 */
      }
    }
  }
  console.log(`[open-gen] existing=${existing} out=${args.out}`);

  // エンジンプール
  let engines: UsiEngine[] = [];
  for (let i = 0; i < args.engines; i++) engines.push(new UsiEngine());
  await Promise.all(engines.map((e) => e.init()));
  console.log(`[open-gen] ${engines.length} engine workers ready`);

  const outFd = fs.openSync(args.out, 'a');
  let total = existing;
  let nodeCursor = 0;
  let thinned = 0;
  const tStart = Date.now();

  const labelChunk = async (pending: RawPosition[]): Promise<number> => {
    let cursor = 0;
    const lines: string[] = [];
    const deadEngines = new Set<UsiEngine>();
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
            console.error(`[open-gen] eval error (skip): ${(e as Error).message}`);
            try {
              await engine.restart();
            } catch (re) {
              console.error(`[open-gen] engine restart failed: ${(re as Error).message}`);
              deadEngines.add(engine);
              return;
            }
            continue;
          }
          if (!res || res.bestmove === 'resign' || res.bestmove === 'win') continue;
          // 間引きの乱数はワーカーの完了順に依存させない: 位置インデックス i から
          // 決定的に導く（共有 rngB() を呼び順で消費すると、どの局面が間引かれるかが
          // エンジンのタイミングで変わり再現性が失われる）。
          if (args.balance && Math.abs(res.cp) > args.balanceCp) {
            const keep = mulberry32(((args.seed * 7919 + total) ^ (i * 2654435761)) >>> 0)();
            if (keep >= args.balanceRate) {
              thinned++;
              continue;
            }
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
        }
      })
    );
    if (deadEngines.size > 0) {
      for (const e of deadEngines) e.quit();
      engines = engines.filter((e) => !deadEngines.has(e));
      if (engines.length === 0) {
        throw new Error(`[open-gen] all engines died (progress saved: ${total})`);
      }
    }
    if (lines.length > 0) {
      fs.writeSync(outFd, lines.join('\n') + '\n');
      fs.fsyncSync(outFd);
    }
    return lines.length;
  };

  while (nodeCursor < myNodes.length && (args.target === 0 || total < args.target)) {
    // --- フェーズ1: ノード局面 + ロールアウトで chunk 分の新規局面を集める ---
    const pending: RawPosition[] = [];
    const tGen = Date.now();
    while (pending.length < args.chunk && nodeCursor < myNodes.length) {
      const node = myNodes[nodeCursor++];
      // ノード局面そのもの
      if (node.ply >= args.minPly && node.ply <= args.maxPly) {
        const k = replay(node.path);
        if (!GenerateMovesImproved.isKingInCheck(k, k.teban)) {
          const sfen = toSfen(k, node.ply + 1);
          const key = sfenKey(sfen);
          if (!seen.has(key)) {
            seen.add(key);
            pending.push({ sfen, ply: node.ply });
          }
        }
      }
      // ロールアウト
      for (let r = 0; r < args.rollouts; r++) {
        const rng = mulberry32((args.seed * 1000003 + nodeCursor * 31 + r) >>> 0);
        rolloutFrom(node, args, rng, (p) => {
          const key = sfenKey(p.sfen);
          if (seen.has(key)) return;
          seen.add(key);
          pending.push(p);
        });
      }
    }
    const genSec = (Date.now() - tGen) / 1000;
    if (pending.length === 0) break;

    // --- フェーズ2: ラベリング ---
    const tLab = Date.now();
    const added = await labelChunk(pending);
    const labSec = (Date.now() - tLab) / 1000;
    total += added;
    const rate = (total - existing) / ((Date.now() - tStart) / 1000);
    console.log(
      `[open-gen] chunk: +${added}/${pending.length} raw (gen ${genSec.toFixed(1)}s, ` +
        `label ${labSec.toFixed(1)}s) nodes ${nodeCursor}/${myNodes.length} total=${total} ` +
        `(${rate.toFixed(1)} pos/s)` +
        (args.balance ? ` thinned=${thinned}` : '')
    );
  }

  fs.closeSync(outFd);
  engines.forEach((e) => e.quit());
  console.log(
    `[open-gen] finished. total=${total} nodes=${nodeCursor}/${myNodes.length} ` +
      `elapsed=${((Date.now() - tStart) / 1000).toFixed(0)}s`
  );
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
