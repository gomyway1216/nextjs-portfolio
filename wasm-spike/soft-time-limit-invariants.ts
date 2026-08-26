/**
 * soft-time-limit-invariants.ts — the three things the soft/hard time limit
 * must NOT change, checked against the shipped production WASM.
 *
 * 1. Untimed searches are bit-identical. Every fixed-depth caller in the repo
 *    (parity harnesses, deterministic tests, the self-play generators) calls
 *    searchBestMove(0, depth, q); all of the time management is gated on
 *    maxTimeMs > 0, so those must return the same move, score, depth, node and
 *    leaf counts as before.
 * 2. The root move buffer stays at the byte offset ml/ pins. The bridge in
 *    ml/child-board-root-move-universe-bridge.ts reads moveBuf out of WASM
 *    memory at a fixed address; new code must not shift the data layout.
 * 3. The soft limit can be switched off, and with it off a TIMED search spends
 *    the whole budget again. Lazy SMP helpers depend on this: their unfinished
 *    iterations land in the shared transposition table rather than being
 *    discarded, so they must keep the pre-soft-limit behaviour.
 *
 * usage:
 *   node -r tsx/cjs wasm-spike/soft-time-limit-invariants.ts \
 *     <candidate.wasm> <production.wasm> <weights.bin>
 */
import { readFileSync } from "node:fs";

import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { SENTE } from "../src/components/game/ShogiImproved/types";
import { PINNED_ROOT_MOVE_BUFFER_OFFSET } from "../ml/child-board-root-move-universe-bridge";
import { bucketsForByteLength } from "./nnue-ref";
import { buildNnueFixedTimeOpening } from "./nnue-fixed-time-opening";
import { loadShogiWasm, syncWasm, teFromWasmKey } from "./search-driver";

const [candPath, prodPath, weightsPath] = process.argv.slice(2);
if (!candPath || !prodPath || !weightsPath) {
  console.error(
    "usage: node -r tsx/cjs wasm-spike/soft-time-limit-invariants.ts <candidate.wasm> <production.wasm> <weights.bin>",
  );
  process.exit(2);
}

const weights = readFileSync(weightsPath);

interface NnueWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(b: number): void;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(n: number, d: number): void;
  setNnueEnabled(f: number): void;
  setRootTesu(t: number): void;
  searchBestMove(ms: number, depth: number, q: number): number;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  clearTT(): void;
  fillRootMoveBuffer(): number;
  setSoftTimeLimit?(flag: number): void;
  getSoftTimeLimit?(): number;
}

function load(path: string): NnueWasm {
  const w = loadShogiWasm(path) as unknown as NnueWasm;
  w.setNnueBuckets(bucketsForByteLength(weights.byteLength));
  if (weights.byteLength !== w.getNnueWeightsSize()) {
    throw new Error(`weights size mismatch: file=${weights.byteLength} wasm=${w.getNnueWeightsSize()}`);
  }
  new Uint8Array(w.memory.buffer, w.getNnueWeightsPtr(), weights.byteLength).set(weights);
  w.setNnueScaleK(600);
  w.setNnueOutputScale(1, 1);
  w.setNnueEnabled(1);
  return w;
}

function openingPosition(pairIndex: number): KyokumenImproved {
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);
  for (const move of buildNnueFixedTimeOpening(7, pairIndex).moves) {
    const te = move.clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }
  return k;
}

let failures = 0;
const fail = (msg: string): void => {
  failures++;
  console.log(`FAIL ${msg}`);
};

// --- 1. untimed searches are bit-identical ---------------------------------
{
  const cand = load(candPath);
  const prod = load(prodPath);
  let compared = 0;
  let mismatched = 0;

  for (let game = 0; game < 6; game++) {
    const k = openingPosition(game);
    cand.clearTT();
    prod.clearTT();
    for (let ply = 6; ply < 26; ply++) {
      for (const depth of [4, 6, 8]) {
        const stats = [cand, prod].map((w) => {
          syncWasm(w as never, k);
          w.setRootTesu(ply);
          const key = w.searchBestMove(0, depth, 10);
          return [key, w.getSearchScore(), w.getSearchDepth(), w.getSearchNodes(), w.getSearchLeaves()].join(",");
        });
        compared++;
        if (stats[0] !== stats[1]) {
          mismatched++;
          if (mismatched <= 3) {
            console.log(`  game=${game} ply=${ply} depth=${depth}\n    candidate  ${stats[0]}\n    production ${stats[1]}`);
          }
        }
      }
      // Advance on BOTH engines so their transposition tables stay in lockstep;
      // a search only one side ran would desync the TT and fake a mismatch.
      let key = 0;
      for (const w of [cand, prod]) {
        syncWasm(w as never, k);
        w.setRootTesu(ply);
        key = w.searchBestMove(0, 6, 10);
      }
      if (key === 0) break;
      const te = teFromWasmKey(key, k);
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
    }
  }
  console.log(`untimed parity: ${compared} searches compared, ${mismatched} mismatched`);
  if (mismatched > 0) fail("untimed searches are not bit-identical");
}

// --- 2. pinned moveBuf offset ----------------------------------------------
{
  const k = openingPosition(0);
  const dumps = [candPath, prodPath].map((p) => {
    const w = load(p);
    syncWasm(w as never, k);
    const n = w.fillRootMoveBuffer();
    return [...new Int32Array(w.memory.buffer, PINNED_ROOT_MOVE_BUFFER_OFFSET, n)].join(",");
  });
  const ok = dumps[0] === dumps[1] && dumps[0].length > 0;
  console.log(`moveBuf @ ${PINNED_ROOT_MOVE_BUFFER_OFFSET}: ${ok ? "identical" : "DIFFERENT"}`);
  if (!ok) fail("the pinned root move buffer offset moved");
}

// --- 3. the opt-out restores full-budget behaviour --------------------------
{
  const cand = load(candPath);
  const prod = load(prodPath);
  if (typeof cand.getSoftTimeLimit !== "function" || typeof cand.setSoftTimeLimit !== "function") {
    fail("candidate does not export setSoftTimeLimit/getSoftTimeLimit");
  } else {
    if (cand.getSoftTimeLimit() !== 1) fail("the soft limit must default to ON");
    cand.setSoftTimeLimit(0);
    if (cand.getSoftTimeLimit() !== 0) fail("setSoftTimeLimit(0) did not take effect");

    const BUDGET_MS = 1000;
    const k = openingPosition(3);
    const candMs: number[] = [];
    const prodMs: number[] = [];
    for (let ply = 6; ply < 18; ply++) {
      for (const [w, into] of [[cand, candMs], [prod, prodMs]] as const) {
        syncWasm(w as never, k);
        w.setRootTesu(ply);
        const t0 = performance.now();
        w.searchBestMove(BUDGET_MS, 32, 10);
        into.push(performance.now() - t0);
      }
      syncWasm(prod as never, k);
      prod.setRootTesu(ply);
      const key = prod.searchBestMove(BUDGET_MS, 32, 10);
      if (key === 0) break;
      const te = teFromWasmKey(key, k);
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(
      `soft limit OFF: candidate mean ${mean(candMs).toFixed(0)}ms vs production ${mean(prodMs).toFixed(0)}ms ` +
        `over ${candMs.length} timed searches (budget ${BUDGET_MS}ms)`,
    );
    // Without the soft limit the search must run to the hard limit like
    // production does; anything materially short means it leaked through.
    if (mean(candMs) < 0.95 * BUDGET_MS) fail("the soft limit still fired with the flag off");
  }
}

console.log(failures === 0 ? "\nall invariants hold" : `\n${failures} invariant(s) violated`);
process.exit(failures === 0 ? 0 : 1);
