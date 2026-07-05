/**
 * nnue-bench.ts — NNUE evaluation speed benchmark.
 *
 * 1. Eval micro-bench: nnueEvaluate() (full recompute) vs nnueEvaluateFast()
 *    (differential accumulators) vs evaluateV3Full(), 100k calls each on a
 *    few midgame/endgame positions (module-internal loops, best-of-3).
 * 2. make/unmake accumulator overhead: perft(4) from hirate with NNUE off vs
 *    on (perft never evaluates, so the delta is pure lazy-stack maintenance).
 * 3. In-search effective eval cost: fixed-depth searches with identical trees,
 *    full recompute vs differential — the time delta / forward passes is the
 *    per-eval saving inside a real search.
 * 4. 3s search bench (dummy weights): v3full vs nnue(full) vs nnue(fast).
 *    NOTE: dummy weights = random eval surface = ruined ordering/pruning, so
 *    only the nnue(full) vs nnue(fast) comparison is meaningful here.
 * 5. 3s search bench (MATERIAL weights): thermometer-coded weights that make
 *    the net compute a pure material eval — a sane surface whose depth numbers
 *    project to a trained net.
 *
 * Usage: node -r tsx/cjs wasm-spike/nnue-bench.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GHI, SFU } from '../src/components/game/ShogiImproved/types';

import {
  MATERIAL_SCALE_K,
  NNUE_LAYOUT,
  makeDummyWeights,
  makeMaterialWeights,
  materialCpReference,
  mulberry32,
} from './nnue-ref';

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
  setNnueForceFull(flag: number): void;
  nnueEvaluateCp(): number;
  nnueRefreshAccumulators(): void;
  benchNnueEvaluate(iters: number): number;
  benchNnueEvaluateFast(iters: number): number;
  benchEvaluateV3Full(iters: number): number;
  getNnueEvalCount(): number;
  resetNnueEvalCount(): void;
  initHirate(): void;
  perft(depth: number): number;
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
    // Single-thread stubs for the Lazy SMP shared-TT hooks (never called while
    // setSharedTtEnabled stays 0, but the imports must link).
    sharedTtProbe: () => 0,
    sharedTtStore: () => {},
    sharedShouldStop: () => 0,
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
console.log('position | evaluateV3Full | nnueEvaluate(full) | nnueEvaluateFast(diff) | fast/v3full');

let totalV3 = 0;
let totalNnue = 0;
let totalFast = 0;
let checksum = 0;
for (const p of positions) {
  syncWasm(p.k);
  wasm.nnueRefreshAccumulators(); // fast path input (NNUE stays disabled here)
  let bestV3 = Infinity;
  let bestNnue = Infinity;
  let bestFast = Infinity;
  let fastChk = 0;
  let fullChk = 0;
  for (let rep = 0; rep < 3; rep++) {
    let t0 = performance.now();
    checksum ^= wasm.benchEvaluateV3Full(ITERS);
    bestV3 = Math.min(bestV3, performance.now() - t0);
    t0 = performance.now();
    fullChk = wasm.benchNnueEvaluate(ITERS);
    bestNnue = Math.min(bestNnue, performance.now() - t0);
    t0 = performance.now();
    fastChk = wasm.benchNnueEvaluateFast(ITERS);
    bestFast = Math.min(bestFast, performance.now() - t0);
  }
  if (fastChk !== fullChk) {
    console.error(`CHECKSUM MISMATCH at ${p.label}: fast=${fastChk} full=${fullChk}`);
    process.exit(1);
  }
  checksum ^= fullChk ^ fastChk;
  console.log(
    `${p.label.padEnd(8)} | ${bestV3.toFixed(1).padStart(11)} ms | ${bestNnue
      .toFixed(1)
      .padStart(15)} ms | ${bestFast.toFixed(1).padStart(19)} ms | x${(bestFast / bestV3).toFixed(2)}`
  );
  totalV3 += bestV3;
  totalNnue += bestNnue;
  totalFast += bestFast;
}
const perCall = (totalMs: number): string =>
  ((totalMs / (positions.length * ITERS)) * 1e6).toFixed(0).padStart(6);
console.log(
  `total    | ${totalV3.toFixed(1).padStart(11)} ms | ${totalNnue.toFixed(1).padStart(15)} ms | ${totalFast
    .toFixed(1)
    .padStart(19)} ms | x${(totalFast / totalV3).toFixed(2)}   (checksum=${checksum})`
);
console.log(
  `per call | ${perCall(totalV3)} ns      | ${perCall(totalNnue)} ns          | ${perCall(totalFast)} ns              |`
);

// ---------------------------------------------------------------------------
// 2) make/unmake accumulator overhead: perft(4), NNUE off vs on
// ---------------------------------------------------------------------------

console.log('\n=== make/unmake accumulator overhead: perft(4) from hirate, best-of-3 ===');
{
  const PERFT_DEPTH = 4;
  let bestOff = Infinity;
  let bestOn = Infinity;
  let leavesOff = 0;
  let leavesOn = 0;
  for (let rep = 0; rep < 3; rep++) {
    wasm.setNnueEnabled(0);
    wasm.initHirate();
    let t0 = performance.now();
    leavesOff = wasm.perft(PERFT_DEPTH);
    bestOff = Math.min(bestOff, performance.now() - t0);

    wasm.setNnueEnabled(1);
    wasm.initHirate();
    t0 = performance.now();
    leavesOn = wasm.perft(PERFT_DEPTH);
    bestOn = Math.min(bestOn, performance.now() - t0);
    wasm.setNnueEnabled(0);
  }
  if (leavesOff !== leavesOn) {
    console.error(`PERFT MISMATCH: off=${leavesOff} on=${leavesOn}`);
    process.exit(1);
  }
  // makeMove calls ~= nodes at depths 1..4 (30 + 900 + 25,440 + 718,565).
  const approxMakes = 30 + 900 + 25_440 + 718_565;
  console.log(
    `perft(${PERFT_DEPTH}) = ${leavesOff} leaves: off ${bestOff.toFixed(1)} ms, on ${bestOn.toFixed(1)} ms ` +
      `(+${(((bestOn - bestOff) / bestOff) * 100).toFixed(0)}%, ` +
      `~${(((bestOn - bestOff) / approxMakes) * 1e6).toFixed(0)} ns per make+unmake pair)`
  );
}

// ---------------------------------------------------------------------------
// 3) In-search effective eval cost: fixed-depth, same tree, full vs fast
// ---------------------------------------------------------------------------
//
// With NNUE enabled, setNnueForceFull toggles ONLY the leaf eval
// implementation (full recompute vs differential) — the search tree is
// bit-identical, so the time delta divided by the forward-pass count is the
// per-eval saving inside a real search.

console.log('\n=== in-search eval cost: fixed depth, identical trees, best-of-3 ===');
for (const p of positions) {
  const DEPTH = 6;
  let tFull = Infinity;
  let tFast = Infinity;
  let passesFull = 0;
  let passesFast = 0;
  let nodesFull = 0;
  let nodesFast = 0;
  wasm.setNnueEnabled(1);
  for (let rep = 0; rep < 3; rep++) {
    wasm.setNnueForceFull(1);
    wasm.clearTT();
    syncWasm(p.k);
    wasm.setRootTesu(p.tesu);
    wasm.resetNnueEvalCount();
    let t0 = performance.now();
    wasm.searchBestMove(0, DEPTH, 8);
    tFull = Math.min(tFull, performance.now() - t0);
    passesFull = wasm.getNnueEvalCount();
    nodesFull = wasm.getSearchNodes();

    wasm.setNnueForceFull(0);
    wasm.clearTT();
    syncWasm(p.k);
    wasm.setRootTesu(p.tesu);
    wasm.resetNnueEvalCount();
    t0 = performance.now();
    wasm.searchBestMove(0, DEPTH, 8);
    tFast = Math.min(tFast, performance.now() - t0);
    passesFast = wasm.getNnueEvalCount();
    nodesFast = wasm.getSearchNodes();
  }
  wasm.setNnueEnabled(0);
  if (nodesFull !== nodesFast || passesFull !== passesFast) {
    console.error(
      `TREE MISMATCH at ${p.label}: nodes ${nodesFull}/${nodesFast} passes ${passesFull}/${passesFast}`
    );
    process.exit(1);
  }
  const perPassNs = ((tFull - tFast) / passesFast) * 1e6;
  console.log(
    `  ${p.label} d${DEPTH}: full ${tFull.toFixed(1)} ms -> fast ${tFast.toFixed(1)} ms ` +
      `(${passesFast} passes, saving ~${perPassNs.toFixed(0)} ns/eval, ` +
      `fast in-search avg ~${((tFast / passesFast) * 1e6).toFixed(0)} ns/eval incl. search work)`
  );
}

// ---------------------------------------------------------------------------
// 4) 3s search bench: v3full vs NNUE full-recompute vs NNUE differential
// ---------------------------------------------------------------------------
//
// NOTE: the dummy weights produce a RANDOM eval surface, which ruins move
// ordering / aspiration / pruning, so the nnue depths here are a lower bound
// on tree quality — the fair speed comparison is nnue(full) vs nnue(fast).

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
  wasm.setNnueForceFull(1);
  wasm.clearTT();
  syncWasm(p.k);
  wasm.setRootTesu(p.tesu);
  wasm.resetNnueEvalCount();
  wasm.searchBestMove(TIME_MS, 32, 10);
  const fullDepth = wasm.getSearchDepth();
  const fullNodes = wasm.getSearchNodes();
  const fullLeaves = wasm.getSearchLeaves();
  const fullEvals = wasm.getNnueEvalCount();

  wasm.setNnueForceFull(0);
  wasm.clearTT();
  syncWasm(p.k);
  wasm.setRootTesu(p.tesu);
  wasm.resetNnueEvalCount();
  wasm.searchBestMove(TIME_MS, 32, 10);
  const onDepth = wasm.getSearchDepth();
  const onNodes = wasm.getSearchNodes();
  const onLeaves = wasm.getSearchLeaves();
  const onEvals = wasm.getNnueEvalCount();
  wasm.setNnueEnabled(0);

  console.log(`  ${p.label}:`);
  console.log(`    v3full     depth=${offDepth} nodes=${offNodes} leaves=${offLeaves}`);
  console.log(
    `    nnue(full) depth=${fullDepth} nodes=${fullNodes} leaves=${fullLeaves} passes=${fullEvals} ` +
      `(${(((fullEvals / TIME_MS) * 1000) / 1e6).toFixed(2)}M evals/s)`
  );
  console.log(
    `    nnue(fast) depth=${onDepth} nodes=${onNodes} leaves=${onLeaves} passes=${onEvals} ` +
      `(${(((onEvals / TIME_MS) * 1000) / 1e6).toFixed(2)}M evals/s)`
  );
}

// ---------------------------------------------------------------------------
// 5) 3s search with MATERIAL weights (sane eval surface -> meaningful depth)
// ---------------------------------------------------------------------------
//
// The net computes a pure material eval (thermometer-coded, see nnue-ref.ts),
// so move ordering / aspiration / pruning behave like a real engine while the
// inference cost profile is identical to a trained net. This is the depth
// number that projects to real weights.

console.log(`\n=== 3s search bench, MATERIAL weights (sane surface, differential path) ===`);
new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), NNUE_LAYOUT.totalBytes).set(
  makeMaterialWeights()
);
wasm.setNnueScaleK(MATERIAL_SCALE_K);

// Self-check: the WASM net must reproduce the exact expected material cp.
for (const p of positions) {
  syncWasm(p.k);
  const wasmCp = wasm.nnueEvaluateCp() | 0; // NNUE disabled -> full recompute
  const refCp = materialCpReference(p.k) | 0;
  if (wasmCp !== refCp) {
    console.error(`MATERIAL NET SELF-CHECK FAILED at ${p.label}: wasm=${wasmCp} ref=${refCp}`);
    process.exit(1);
  }
}
console.log(`material net self-check: nnueEvaluateCp == thermometer reference on all positions ✓`);

for (const p of positions) {
  wasm.setNnueEnabled(1);
  wasm.clearTT();
  syncWasm(p.k);
  wasm.setRootTesu(p.tesu);
  wasm.resetNnueEvalCount();
  wasm.searchBestMove(TIME_MS, 32, 10);
  const d = wasm.getSearchDepth();
  const n = wasm.getSearchNodes();
  const l = wasm.getSearchLeaves();
  const e = wasm.getNnueEvalCount();
  wasm.setNnueEnabled(0);
  console.log(
    `  ${p.label}: depth=${d} nodes=${n} leaves=${l} passes=${e} ` +
      `(${(((e / TIME_MS) * 1000) / 1e6).toFixed(2)}M evals/s)`
  );
}
