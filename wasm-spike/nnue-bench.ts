/**
 * nnue-bench.ts — NNUE evaluation speed benchmark.
 *
 * 1. Eval micro-bench: nnueEvaluate() vs evaluateV3Full(), 100k calls each on
 *    a few midgame/endgame positions (module-internal loops, best-of-3).
 * 2. 3s search bench: searchBestMove(3000, 32, 10) with NNUE leaf eval on vs
 *    off, comparing completed depth / nodes / leaves.
 *
 * Weights are the same seeded dummy weights as nnue-parity.ts (speed does not
 * depend on the weight values).
 *
 * Usage: node -r tsx/cjs wasm-spike/nnue-bench.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GHI, SFU } from '../src/components/game/ShogiImproved/types';

import { NNUE_LAYOUT, makeDummyWeights, mulberry32 } from './nnue-ref';

interface ShogiNnueBenchWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  getSearchScore(): number;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueEnabled(flag: number): void;
  setNnueScaleK(k: number): void;
  benchNnueEvaluate(iters: number): number;
  benchEvaluateV3Full(iters: number): number;
}

const wasmBytes = readFileSync(
  join(__dirname, '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm')
);
const instance = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {
  env: {
    abort(_msg: number, _file: number, line: number, col: number) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
    now: () => performance.now(),
  },
});
const wasm = instance.exports as unknown as ShogiNnueBenchWasm;

function syncWasm(k: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      wasm.setSquare(pos, k.ban[pos]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++) {
    wasm.setHand(koma, k.hand[koma] | 0);
  }
  wasm.setSideToMove(k.teban);
  wasm.finalizePosition();
}

// Load dummy weights (same seed as nnue-parity.ts).
new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), NNUE_LAYOUT.totalBytes).set(
  makeDummyWeights(0x5eed1234)
);
wasm.setNnueScaleK(600);

/** Deterministic self-play snapshots (same PRNG family as the other harnesses). */
function buildPositions(): Array<{ label: string; k: KyokumenImproved; tesu: number }> {
  const positions: Array<{ label: string; k: KyokumenImproved; tesu: number }> = [];
  const snapshots = [24, 33, 42, 60];
  const rnd = mulberry32(0xbeef01);
  const k = new KyokumenImproved();
  k.initHirate();
  for (let ply = 0; ply < snapshots[snapshots.length - 1]; ply++) {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) break;
    const te = moves[Math.floor(rnd() * moves.length)];
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
    const tesu = ply + 1;
    if (snapshots.includes(tesu) && GenerateMovesImproved.generateLegalMoves(k).length > 0) {
      positions.push({ label: `ply${tesu}`, k: k.clone(), tesu });
    }
  }
  return positions;
}

const positions = buildPositions();

// ---------------------------------------------------------------------------
// 1) Eval micro-bench: 100k calls, best-of-3
// ---------------------------------------------------------------------------

const ITERS = 100_000;
console.log(`=== eval micro-bench: ${ITERS} module-internal calls, best-of-3 ===`);
console.log('position | evaluateV3Full | nnueEvaluate | nnue/v3full');

let totalV3 = Infinity;
let totalNnue = Infinity;
let checksum = 0;
for (const p of positions) {
  syncWasm(p.k);
  let bestV3 = Infinity;
  let bestNnue = Infinity;
  for (let rep = 0; rep < 3; rep++) {
    let t0 = performance.now();
    checksum ^= wasm.benchEvaluateV3Full(ITERS);
    bestV3 = Math.min(bestV3, performance.now() - t0);
    t0 = performance.now();
    checksum ^= wasm.benchNnueEvaluate(ITERS);
    bestNnue = Math.min(bestNnue, performance.now() - t0);
  }
  console.log(
    `${p.label.padEnd(8)} | ${bestV3.toFixed(1).padStart(9)} ms | ${bestNnue
      .toFixed(1)
      .padStart(9)} ms | x${(bestNnue / bestV3).toFixed(2)}`
  );
  totalV3 = totalV3 === Infinity ? bestV3 : totalV3 + bestV3;
  totalNnue = totalNnue === Infinity ? bestNnue : totalNnue + bestNnue;
}
console.log(
  `total    | ${totalV3.toFixed(1).padStart(9)} ms | ${totalNnue.toFixed(1).padStart(9)} ms | x${(
    totalNnue / totalV3
  ).toFixed(2)}   (checksum=${checksum})`
);
console.log(
  `per call | ${((totalV3 / (positions.length * ITERS)) * 1e6).toFixed(0).padStart(6)} ns | ${(
    (totalNnue / (positions.length * ITERS)) *
    1e6
  )
    .toFixed(0)
    .padStart(6)} ns |`
);

// ---------------------------------------------------------------------------
// 2) 3s search bench: NNUE off vs on
// ---------------------------------------------------------------------------

const TIME_MS = 3000;
console.log(`\n=== 3s search bench (maxTimeMs=${TIME_MS}, maxDepth=32, qMax=10) ===`);
for (const p of positions) {
  wasm.setNnueEnabled(0);
  wasm.clearTT();
  syncWasm(p.k);
  wasm.setRootTesu(p.tesu);
  wasm.searchBestMove(TIME_MS, 32, 10);
  const offDepth = wasm.getSearchDepth();
  const offNodes = wasm.getSearchNodes();
  const offLeaves = wasm.getSearchLeaves();

  wasm.setNnueEnabled(1);
  wasm.clearTT();
  syncWasm(p.k);
  wasm.setRootTesu(p.tesu);
  wasm.searchBestMove(TIME_MS, 32, 10);
  const onDepth = wasm.getSearchDepth();
  const onNodes = wasm.getSearchNodes();
  const onLeaves = wasm.getSearchLeaves();
  wasm.setNnueEnabled(0);

  console.log(`  ${p.label}:`);
  console.log(`    v3full depth=${offDepth} nodes=${offNodes} leaves=${offLeaves}`);
  console.log(`    nnue   depth=${onDepth} nodes=${onNodes} leaves=${onLeaves}`);
}
