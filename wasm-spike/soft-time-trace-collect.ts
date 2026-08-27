/**
 * Calibration driver (research only). Plays self-play games with the telemetry
 * build of the production engine at the production time control and dumps one
 * JSON line per search: the elapsed time, best move, score and aspiration
 * re-search count of every COMPLETED iterative-deepening iteration, plus
 * whether the final (discarded) iteration was aborted by the hard limit.
 *
 * Offline replay of these traces is how the soft-limit thresholds get chosen
 * without running games per candidate setting.
 *
 * usage: node -r tsx/cjs wasm-spike/soft-time-trace-collect.ts <wasm> <weights> <out.jsonl> [--games N] [--ms M] [--seed S]
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { SENTE } from "../src/components/game/ShogiImproved/types";
import { bucketsForByteLength } from "./nnue-ref";
import { buildNnueFixedTimeOpening } from "./nnue-fixed-time-opening";
import {
  loadShogiWasm,
  syncWasm,
  teFromWasmKey,
  type ShogiSearchWasm,
} from "./search-driver";

interface TelemetryWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(b: number): void;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(n: number, d: number): void;
  setNnueEnabled(f: number): void;
  clearGameHistory?(): void;
  pushGameHistoryHash?(a: number, b: number): void;
  getTraceCount(): number;
  getTraceDepth(i: number): number;
  getTraceScore(i: number): number;
  getTraceMove(i: number): number;
  getTraceEndMs(i: number): number;
  getTraceTotalMs(): number;
  getTraceRootN(): number;
}

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  // Reject a missing or non-numeric value loudly. `parseInt(undefined)` is NaN,
  // and NaN reaching the WASM boundary is coerced to 0 — which would silently
  // run every search on a 0ms budget and produce a full trace file of garbage
  // that looks exactly like a valid one.
  const raw = process.argv[i + 1];
  const value = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} requires a numeric value (got ${raw === undefined ? "nothing" : `"${raw}"`})`);
  }
  return Math.trunc(value);
}

const [wasmPath, weightsPath, outPath] = process.argv.slice(2);
const GAMES = argNum("--games", 4);
const MS = argNum("--ms", 1000);
const SEED = argNum("--seed", 1);
const MAX_PLIES = 256;

const wasm = loadShogiWasm(wasmPath) as TelemetryWasm;
const weights = readFileSync(weightsPath);
wasm.setNnueBuckets(bucketsForByteLength(weights.byteLength));
if (weights.byteLength !== wasm.getNnueWeightsSize()) {
  throw new Error(`weights size mismatch ${weights.byteLength} vs ${wasm.getNnueWeightsSize()}`);
}
new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
wasm.setNnueScaleK(600);
wasm.setNnueOutputScale(1, 1);
wasm.setNnueEnabled(1);

writeFileSync(outPath, "");

for (let game = 0; game < GAMES; game++) {
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);
  wasm.clearTT();
  wasm.clearGameHistory?.();

  const played: number[] = [];
  const opening = buildNnueFixedTimeOpening(SEED, game);
  for (const om of opening.moves) {
    played.push(k.HashVal, k.SecondaryHashVal);
    const te = om.clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }

  const rep = new Map<number, number>();
  for (let ply = opening.moves.length; ply < MAX_PLIES; ply++) {
    rep.set(k.HashVal, (rep.get(k.HashVal) ?? 0) + 1);
    if ((rep.get(k.HashVal) ?? 0) >= 4) break;

    wasm.clearGameHistory?.();
    for (let i = 0; i + 1 < played.length; i += 2) wasm.pushGameHistoryHash?.(played[i], played[i + 1]);
    syncWasm(wasm, k);
    wasm.setRootTesu(ply);
    const rootN = GenerateMovesImproved.generateLegalMoves(k).length;
    const wall0 = performance.now();
    const key = wasm.searchBestMove(MS, 32, 10);
    const wall = performance.now() - wall0;
    if (key === 0) break;

    const n = wasm.getTraceCount();
    const iters: { d: number; s: number; m: number; t0: number; t1: number }[] = [];
    for (let i = 0; i < n; i++) {
      // Iterations are contiguous, so the previous one's end is this one's
      // start; the engine records only the end to keep the transform minimal.
      const t1 = +wasm.getTraceEndMs(i).toFixed(2);
      iters.push({
        d: wasm.getTraceDepth(i),
        s: wasm.getTraceScore(i),
        m: wasm.getTraceMove(i),
        t0: i === 0 ? 0 : iters[i - 1].t1,
        t1,
      });
    }
    const total = +wasm.getTraceTotalMs().toFixed(2);
    const lastEnd = iters.length ? iters[iters.length - 1].t1 : 0;
    // The engine started one more iteration and the hard limit cut it: the
    // partial result was discarded, so this is time the move did not get.
    const aborted = total - lastEnd > 1 ? 1 : 0;
    appendFileSync(
      outPath,
      JSON.stringify({
        game,
        ply,
        rootN,
        wall: +wall.toFixed(2),
        total,
        aborted,
        abortStart: lastEnd,
        iters,
      }) + "\n",
    );

    const te = teFromWasmKey(key, k);
    played.push(k.HashVal, k.SecondaryHashVal);
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }
  console.log(`game ${game + 1}/${GAMES} done`);
}
