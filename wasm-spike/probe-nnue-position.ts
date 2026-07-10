/**
 * probe-nnue-position.ts — NNUE 序盤バイアスの spot check ツール
 *
 * 指定手順 (USI) で初期局面から進めた局面について、重みファイル毎に:
 *   1. WASM 探索 (NNUE leaf eval, 定跡なし・詰みルーチンなし) の最善手
 *   2. 全合法手の NNUE 静的評価ランキング (指した後の局面を手番側視点で符号反転)
 * を表示する。序盤の劣手 (例: 早い浮き飛車 △8四飛) を NNUE がどの順位に
 * 置いているかをモデル間で比較するのに使う。
 *
 * 使い方:
 *   node -r tsx/cjs wasm-spike/probe-nnue-position.ts \
 *     --weights ml/runs/run5m-base/weights.bin --weights ml/runs/runOp1/weights.bin \
 *     [--moves "7g7f 8c8d 2g2f 8d8e 8h7g 3c3d 6g6f"] [--ms 2000] [--depth 32]
 *     [--k 600] [--top 10]
 *
 * `--ms 0 --depth N` runs a deterministic fixed-depth probe. This is useful
 * for regression tests because it removes machine-speed variance from the
 * result while keeping the production NNUE/WASM search path.
 */

import { readFileSync } from 'node:fs';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { EMPTY, FU, KY, KE, GI, KI, KA, HI, SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';
import { bucketsForByteLength } from './nnue-ref';
import { loadShogiWasm, syncWasm, teFromWasmKey, type ShogiSearchWasm } from './search-driver';

interface ShogiNnueSearchWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numer: number, denom: number): void;
  setNnueEnabled(flag: number): void;
  nnueEvaluateCp(): number;
}

// --- CLI ---------------------------------------------------------------------

function argAll(flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}
function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  const n = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(n)) throw new Error(`${flag} requires a number`);
  return n;
}
function argStr(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const WEIGHTS = argAll('--weights');
if (WEIGHTS.length === 0) {
  console.error(
    'usage: node -r tsx/cjs wasm-spike/probe-nnue-position.ts --weights w.bin [--weights w2.bin] [--moves "..."] [--ms 2000] [--depth 32] [--k 600] [--top 10]',
  );
  process.exit(2);
}
// 既定: ▲7六歩△8四歩▲2六歩△8五歩▲7七角△3四歩▲6六歩 (作者報告の浮き飛車バイアス局面, 後手番)
const MOVES = argStr('--moves', '7g7f 8c8d 2g2f 8d8e 8h7g 3c3d 6g6f').trim().split(/\s+/);
const MOVE_MS = argNum('--ms', 2000);
const MAX_DEPTH = argNum('--depth', 32);
const SCALE_K = argNum('--k', 600);
const TOP_N = argNum('--top', 10);

if (MAX_DEPTH < 1 || MAX_DEPTH > 32) {
  throw new Error('--depth must be between 1 and 32');
}

// --- USI move <-> Te ----------------------------------------------------------

const DROP_LETTER: Record<string, number> = { P: FU, L: KY, N: KE, S: GI, G: KI, B: KA, R: HI };

function usiToTe(k: KyokumenImproved, usi: string): Te {
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  let want: { from: number; to: number; promote: boolean; drop: number };
  if (usi[1] === '*') {
    const drop = DROP_LETTER[usi[0]];
    const to = ((usi.charCodeAt(2) - 48) << 4) + (usi.charCodeAt(3) - 96);
    want = { from: 0, to, promote: false, drop };
  } else {
    const from = ((usi.charCodeAt(0) - 48) << 4) + (usi.charCodeAt(1) - 96);
    const to = ((usi.charCodeAt(2) - 48) << 4) + (usi.charCodeAt(3) - 96);
    want = { from, to, promote: usi.endsWith('+'), drop: 0 };
  }
  for (const m of legal) {
    if (m.to !== want.to || m.from !== want.from) continue;
    if (want.from === 0) {
      if (getKomashu(m.koma) !== want.drop) continue;
    } else if (m.promote !== want.promote) {
      continue;
    }
    return m;
  }
  throw new Error(`move not legal here: ${usi}`);
}

const DROP_CHAR: Record<number, string> = { [FU]: 'P', [KY]: 'L', [KE]: 'N', [GI]: 'S', [KI]: 'G', [KA]: 'B', [HI]: 'R' };

function teToUsi(te: Te): string {
  const sq = (p: number): string => String.fromCharCode(48 + (p >> 4)) + String.fromCharCode(96 + (p & 0x0f));
  if (te.from === 0) return `${DROP_CHAR[getKomashu(te.koma) & 0x07]}*${sq(te.to)}`;
  return `${sq(te.from)}${sq(te.to)}${te.promote ? '+' : ''}`;
}

// --- main ---------------------------------------------------------------------

function setupNnue(path: string): ShogiNnueSearchWasm {
  const wasm = loadShogiWasm() as ShogiNnueSearchWasm;
  const bin = readFileSync(path);
  const buckets = bucketsForByteLength(bin.byteLength);
  wasm.setNnueBuckets(buckets);
  if (bin.byteLength !== wasm.getNnueWeightsSize()) throw new Error(`${path}: size mismatch`);
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), bin.byteLength).set(bin);
  wasm.setNnueScaleK(SCALE_K);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueEnabled(1);
  return wasm;
}

function main(): void {
  // 手順を再生
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);
  for (const usi of MOVES) {
    const te = usiToTe(k, usi);
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }
  const tesu = MOVES.length;
  console.log(`position after: ${MOVES.join(' ')} (ply ${tesu}, ${k.teban === SENTE ? 'SENTE' : 'GOTE'} to move)\n`);

  const legal = GenerateMovesImproved.generateLegalMoves(k);

  for (const wpath of WEIGHTS) {
    const wasm = setupNnue(wpath);
    console.log(`=== ${wpath} ===`);

    // 1. 探索の最善手
    syncWasm(wasm, k);
    wasm.setRootTesu(tesu);
    const key = wasm.searchBestMove(MOVE_MS, MAX_DEPTH, 10);
    const best = key !== 0 ? teToUsi(teFromWasmKey(key, k)) : '(none)';
    const searchLabel = MOVE_MS > 0 ? `${MOVE_MS}ms, maxDepth ${MAX_DEPTH}` : `fixed depth ${MAX_DEPTH}`;
    console.log(`search bestmove (${searchLabel}): ${best}`);

    // 2. 全合法手の NNUE 静的評価 (手を指した後の局面は相手番 → 符号反転して現手番視点に)
    const scored: Array<{ usi: string; cp: number }> = [];
    for (const m of legal) {
      m.capture = k.get(m.to);
      k.move(m);
      k.toggleTeban();
      syncWasm(wasm, k);
      scored.push({ usi: teToUsi(m), cp: -(wasm.nnueEvaluateCp() | 0) });
      k.toggleTeban();
      k.back(m);
    }
    scored.sort((a, b) => b.cp - a.cp);
    const spread = scored[0].cp - scored[scored.length - 1].cp;
    console.log(`static NNUE ranking (top ${TOP_N} of ${scored.length}, spread ${spread}cp):`);
    scored.slice(0, TOP_N).forEach((s, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${s.usi.padEnd(6)} ${s.cp}cp`);
    });
    console.log('');
  }
}

main();
