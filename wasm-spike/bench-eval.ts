/**
 * bench-eval.ts — evaluateV3 micro-benchmark, JS vs WASM (phase 2).
 *
 * Plays seeded random self-play from hirate to several midgame depths, then
 * calls the full evaluation 100,000 times on each position:
 *   - JS:   KyokumenImproved.evaluateV3()  (and +hangingThreat re-impl for the
 *           "full" row, matching what the V20 engine computes per leaf)
 *   - WASM: benchEvaluateV3(n) / benchEvaluateV3Full(n) — the loop runs inside
 *           the module so the FFI boundary is crossed once, like a real search
 *           would (the search itself lives in WASM in phase 3).
 *
 * Each measurement is best-of-5. Checksums are compared so the two sides are
 * provably doing the same work.
 *
 * Usage: node -r tsx/cjs wasm-spike/bench-eval.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import {
  EMPTY,
  GHI,
  GOTE,
  OU,
  SENTE,
  SFU,
  getKomashu,
  isSelf,
  komaValue,
} from '../src/components/game/ShogiImproved/types';

interface ShogiWasm {
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  evaluateV3(): number;
  hangingThreat(): number;
  evaluateV3Full(): number;
  benchEvaluateV3(iters: number): number;
  benchEvaluateV3Full(iters: number): number;
}

const wasmBytes = readFileSync(join(__dirname, 'build', 'shogi.wasm'));
const wasmModule = new WebAssembly.Module(wasmBytes);
const instance = new WebAssembly.Instance(wasmModule, {
  env: {
    abort(_msg: number, _file: number, line: number, col: number) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
  },
});
const wasm = instance.exports as unknown as ShogiWasm;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same reference hangingThreat re-implementation as parity.ts (V20 term). */
function jsHangingThreatSente(k: KyokumenImproved): number {
  let worstSente = 0;
  let worstGote = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const p = k.get(pos);
      if (p === EMPTY) continue;
      if (getKomashu(p) === OU) continue;
      const value = Math.abs(komaValue[p]) | 0;
      if (value < 1000) continue;

      const side = isSelf(SENTE, p) ? SENTE : GOTE;
      const attacker = GenerateMovesImproved.getLeastAttackerValue(k, pos, side);
      if (!Number.isFinite(attacker)) continue;
      const defender = GenerateMovesImproved.getLeastAttackerValue(k, pos, side === SENTE ? GOTE : SENTE);
      if (Number.isFinite(defender)) continue;
      const loss = Math.min(value, 700);
      if (side === SENTE) {
        if (loss > worstSente) worstSente = loss;
      } else if (loss > worstGote) {
        worstGote = loss;
      }
    }
  }
  return ((worstGote - worstSente) / 3) | 0;
}

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

/** Play `plies` seeded random legal moves from hirate. */
function midgamePosition(plies: number, seed: number): KyokumenImproved {
  const rnd = mulberry32(seed);
  const k = new KyokumenImproved();
  k.initHirate();
  for (let ply = 0; ply < plies; ply++) {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) break;
    const te = moves[Math.floor(rnd() * moves.length)];
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }
  return k;
}

const ITERS = 100_000;
const RUNS = 5;

function bestOf(runs: number, fn: () => number): { ms: number; checksum: number } {
  let best = Infinity;
  let checksum = 0;
  for (let r = 0; r < runs; r++) {
    const t0 = process.hrtime.bigint();
    checksum = fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms < best) best = ms;
  }
  return { ms: best, checksum };
}

console.log(`=== evaluateV3 benchmark: ${ITERS.toLocaleString()} calls per position, best of ${RUNS} ===\n`);

const cases = [
  { name: 'midgame A (ply 30)', plies: 30, seed: 0xbeef01 },
  { name: 'midgame B (ply 40)', plies: 40, seed: 0xbeef02 },
  { name: 'midgame C (ply 50)', plies: 50, seed: 0xbeef03 },
  { name: 'endgame-ish (ply 70)', plies: 70, seed: 0xbeef04 },
];

let sumJsV3 = 0;
let sumWasmV3 = 0;
let sumJsFull = 0;
let sumWasmFull = 0;

for (const c of cases) {
  const k = midgamePosition(c.plies, c.seed);
  syncWasm(k);

  // Sanity: identical evaluation before timing.
  const jsV3 = k.evaluateV3() | 0;
  const wasmV3 = wasm.evaluateV3() | 0;
  const jsFull = (jsV3 + jsHangingThreatSente(k)) | 0;
  const wasmFull = wasm.evaluateV3Full() | 0;
  if (jsV3 !== wasmV3 || jsFull !== wasmFull) {
    console.error(`EVAL MISMATCH on ${c.name}: JS v3=${jsV3}/full=${jsFull} WASM v3=${wasmV3}/full=${wasmFull}`);
    process.exit(1);
  }

  const js = bestOf(RUNS, () => {
    let acc = 0;
    for (let i = 0; i < ITERS; i++) acc = (acc + k.evaluateV3()) | 0;
    return acc;
  });
  const wa = bestOf(RUNS, () => wasm.benchEvaluateV3(ITERS));
  if (js.checksum !== wa.checksum) {
    console.error(`CHECKSUM MISMATCH (v3) on ${c.name}: JS=${js.checksum} WASM=${wa.checksum}`);
    process.exit(1);
  }

  const jsF = bestOf(RUNS, () => {
    let acc = 0;
    for (let i = 0; i < ITERS; i++) acc = (acc + k.evaluateV3() + jsHangingThreatSente(k)) | 0;
    return acc;
  });
  const waF = bestOf(RUNS, () => wasm.benchEvaluateV3Full(ITERS));
  if (jsF.checksum !== waF.checksum) {
    console.error(`CHECKSUM MISMATCH (v3full) on ${c.name}: JS=${jsF.checksum} WASM=${waF.checksum}`);
    process.exit(1);
  }

  sumJsV3 += js.ms;
  sumWasmV3 += wa.ms;
  sumJsFull += jsF.ms;
  sumWasmFull += waF.ms;

  console.log(`${c.name}  (v3=${jsV3}, hang=${jsFull - jsV3})`);
  console.log(`  evaluateV3     JS ${js.ms.toFixed(1).padStart(7)} ms   WASM ${wa.ms.toFixed(1).padStart(6)} ms   x${(js.ms / wa.ms).toFixed(1)}`);
  console.log(`  evaluateV3Full JS ${jsF.ms.toFixed(1).padStart(7)} ms   WASM ${waF.ms.toFixed(1).padStart(6)} ms   x${(jsF.ms / waF.ms).toFixed(1)}`);
}

console.log('\n=== totals (sum of best-of-5 over all positions) ===');
console.log(`evaluateV3     JS ${sumJsV3.toFixed(1)} ms  WASM ${sumWasmV3.toFixed(1)} ms  → x${(sumJsV3 / sumWasmV3).toFixed(1)}`);
console.log(`evaluateV3Full JS ${sumJsFull.toFixed(1)} ms  WASM ${sumWasmFull.toFixed(1)} ms  → x${(sumJsFull / sumWasmFull).toFixed(1)}`);
