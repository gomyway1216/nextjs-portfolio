/**
 * wasmEngine.ts — client for the AssemblyScript full-search shogi engine.
 *
 * The engine (wasm-spike/assembly/index.ts) is a statement-for-statement port
 * of ShogiAIImprovedV20's search + evaluateV3, verified bit-exact at fixed
 * depth and ~15x faster in timed play (depth +3..+4 at equal budget).
 *
 * Design notes:
 * - The .wasm binary is embedded as base64 (see wasm/gen-wasm-base64.mjs), so
 *   the same loading path works under webpack, Turbopack, vitest and node.
 * - The instance lives at module scope and is reused across moves: it holds
 *   ~35MB (transposition table + continuation history), and keeping the TT
 *   across moves of one game makes it stronger. Call clearWasmTT() when a NEW
 *   game starts.
 * - searchBestMove() is synchronous and blocks for up to maxTimeMs; only call
 *   this off the main thread (it is used from shogi-ai.worker.ts) or in node.
 * - Every failure mode (instantiation, runtime trap, illegal result) returns
 *   null so the caller can fall back to the JS V20 engine.
 * - The binary requires WASM SIMD128 (the NNUE inference is vectorized). All
 *   major browsers ship SIMD since 2021-2023 (Chrome 91+, Firefox 89+,
 *   Safari 16.4+, Node 16.4+); on anything older WebAssembly.validate()
 *   rejects the binary and the JS V20 engine takes over — same fallback as
 *   any other instantiation failure, just with a clearer log line.
 */

import { GenerateMovesImproved } from './GenerateMovesImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { GHI, SFU, Te } from './types';
import { SHOGI_WASM_BASE64 } from './wasm/shogiWasmBase64';

interface ShogiSearchWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  // NNUE leaf evaluation (see wasm-spike/assembly/index.ts). setNnueOutputScale
  // exists too but is intentionally NOT wired up here: the 1/1 default measured
  // strongest in A/B and calibration attempts made it worse.
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
}

let instance: ShogiSearchWasm | null = null;
let initFailed = false;

// NOTE: the explicit `Uint8Array<ArrayBuffer>` generic is required by this repo's TypeScript
// version: a bare `Uint8Array` infers `Uint8Array<ArrayBufferLike>`, which is not assignable to
// `BufferSource` for `WebAssembly.Module`. Both branches below construct plain-ArrayBuffer-backed
// arrays, so the annotation is sound.
function decodeBase64(b64: string): Uint8Array<ArrayBuffer> {
  // atob exists in browsers, workers and node >= 16.
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // Defensive fallback for exotic node builds without the atob global.
  // Copy into a fresh Uint8Array so the backing buffer is a plain ArrayBuffer
  // (Buffer views can be backed by pooled/shared buffers, which upsets BufferSource typing).
  const buf = Buffer.from(b64, 'base64');
  const bytes = new Uint8Array(buf.length);
  bytes.set(buf);
  return bytes;
}

/**
 * Lazily instantiate the engine (once). Returns null if instantiation failed;
 * the failure is remembered so we do not retry (and re-log) on every move.
 */
function getInstance(): ShogiSearchWasm | null {
  if (instance) return instance;
  if (initFailed) return null;
  try {
    const bytes = decodeBase64(SHOGI_WASM_BASE64);
    // The binary uses SIMD128; on an engine without SIMD support validate()
    // returns false (new WebAssembly.Module would throw a CompileError anyway,
    // this just makes the fallback reason explicit in the log).
    if (typeof WebAssembly.validate === 'function' && !WebAssembly.validate(bytes)) {
      initFailed = true;
      console.error(
        '[wasmEngine] binary rejected — this environment lacks WASM SIMD128 support; the JS engine will be used instead'
      );
      return null;
    }
    const wasmModule = new WebAssembly.Module(bytes);
    const wasmInstance = new WebAssembly.Instance(wasmModule, {
      env: {
        abort(_msg: number, _file: number, line: number, col: number): void {
          throw new Error(`wasm abort at ${line}:${col}`);
        },
        // The engine samples env.now() for its time management.
        now: performance.now.bind(performance),
      },
    });
    instance = wasmInstance.exports as unknown as ShogiSearchWasm;
    return instance;
  } catch (e) {
    initFailed = true;
    console.error('[wasmEngine] instantiation failed; the JS engine will be used instead', e);
    return null;
  }
}

/** Copy the full JS position into the WASM engine (board / hands / side to move). */
function syncPosition(wasm: ShogiSearchWasm, k: KyokumenImproved): void {
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

/** Decode the packed move key ((koma&0x3f) | from<<6 | to<<14 | promote<<22) into a Te. */
function teFromWasmKey(key: number, k: KyokumenImproved): Te {
  const koma = key & 0x3f;
  const from = (key >> 6) & 0xff;
  const to = (key >> 14) & 0xff;
  const promote = ((key >> 22) & 1) === 1;
  const capture = k.get(to);
  return new Te(koma, from, to, promote, capture);
}

/** True once the engine instantiated successfully (mostly for tests/diagnostics). */
export function isWasmEngineReady(): boolean {
  return getInstance() !== null;
}

/** Diagnostics for the most recent wasmSearchBestMove() call. */
export interface WasmSearchStats {
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
}

/**
 * Stats of the last completed search (score/depth/nodes/leaves), or null if
 * the engine is unavailable. Used by benchmarks (e.g. the ponder A/B script)
 * to compare reached depth at equal time budgets.
 */
export function getLastWasmSearchStats(): WasmSearchStats | null {
  const wasm = getInstance();
  if (!wasm) return null;
  try {
    return {
      score: wasm.getSearchScore(),
      depth: wasm.getSearchDepth(),
      nodes: wasm.getSearchNodes(),
      leaves: wasm.getSearchLeaves(),
    };
  } catch (e) {
    console.error('[wasmEngine] getLastWasmSearchStats failed', e);
    return null;
  }
}

/**
 * Clear the WASM transposition table. Call when a NEW game starts; do NOT call
 * between moves of the same game (the TT carry-over is a strength feature).
 */
export function clearWasmTT(): void {
  const wasm = getInstance();
  if (!wasm) return;
  try {
    wasm.clearTT();
  } catch (e) {
    console.error('[wasmEngine] clearTT failed', e);
  }
}

// ---------------------------------------------------------------------------
// NNUE evaluation (run1m-base weights)
// ---------------------------------------------------------------------------

/**
 * Exact size of the quantized run1m-base weight file (shogi-distill-v1 layout,
 * 2282->256->32->1). Must equal the WASM engine's getNnueWeightsSize(); any
 * mismatch means a corrupt/truncated download and the weights are rejected.
 */
export const NNUE_WEIGHTS_BYTES = 1_185_988;

let nnueWeightsLoaded = false;
// Mirrors the engine-side `nnueEnabled` flag so we only cross into WASM on a
// real state change (setNnueEnabled clears the eval cache and rebuilds the
// accumulators, which we do not want on every move).
let nnueEnabledState = false;

/** True once valid NNUE weights were copied into the engine. */
export function isNnueWeightsLoaded(): boolean {
  return nnueWeightsLoaded;
}

/** Current NNUE-enabled state of the engine (for tests/diagnostics). */
export function isNnueEnabled(): boolean {
  return nnueEnabledState;
}

/**
 * Copy quantized NNUE weights into the WASM engine and set the sigmoid scale
 * K (k_sigmoid from weights.meta.json; cp = out_q * K / 8128).
 *
 * Returns false — leaving the engine on the hand-crafted V3 evaluation — when
 * the engine is unavailable, the build lacks the NNUE exports, or the byte
 * size is not exactly NNUE_WEIGHTS_BYTES. Loading does NOT enable NNUE by
 * itself; callers opt in per search via setWasmNnueEnabled().
 */
export function loadNnueWeights(bytes: Uint8Array, scaleK: number): boolean {
  const wasm = getInstance();
  if (!wasm) return false;
  try {
    if (
      !wasm.memory ||
      typeof wasm.getNnueWeightsPtr !== 'function' ||
      typeof wasm.getNnueWeightsSize !== 'function' ||
      typeof wasm.setNnueScaleK !== 'function' ||
      typeof wasm.setNnueEnabled !== 'function'
    ) {
      return false;
    }
    if (bytes.byteLength !== NNUE_WEIGHTS_BYTES || bytes.byteLength !== wasm.getNnueWeightsSize()) {
      console.error(
        `[wasmEngine] NNUE weights rejected: size=${bytes.byteLength}, expected ${NNUE_WEIGHTS_BYTES} (build) / ${wasm.getNnueWeightsSize()} (engine)`
      );
      return false;
    }
    // Math.trunc + range check: rejects fractions in (0, 1) that would
    // truncate to 0, and huge values that `| 0` would wrap to a bogus
    // (possibly negative) i32. 1e6 is far above any sane sigmoid K (~600) and
    // matches the engine-side NNUE_MAX_SCALE_PRODUCT headroom.
    const k = Math.trunc(scaleK);
    if (!Number.isFinite(scaleK) || k <= 0 || k > 1_000_000) {
      console.error(`[wasmEngine] NNUE weights rejected: invalid scale K=${scaleK}`);
      return false;
    }
    new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), NNUE_WEIGHTS_BYTES).set(bytes);
    wasm.setNnueScaleK(k);
    // If NNUE is somehow already live (re-load), rebuild the accumulators from
    // the fresh weights so stale activations can never be searched.
    if (nnueEnabledState) wasm.setNnueEnabled(1);
    nnueWeightsLoaded = true;
    return true;
  } catch (e) {
    console.error('[wasmEngine] loadNnueWeights failed; the V3 evaluation will be used instead', e);
    return false;
  }
}

/**
 * Switch the engine's leaf evaluation between NNUE and the hand-crafted V3.
 *
 * Call before each search with the difficulty's preference; enabling is a
 * no-op (stays on V3) until loadNnueWeights() succeeded, so callers can
 * request NNUE unconditionally and get a silent V3 fallback. Returns the
 * actual resulting state. Only a real state change crosses into WASM (the
 * engine-side toggle clears the eval cache).
 */
export function setWasmNnueEnabled(enabled: boolean): boolean {
  const wasm = getInstance();
  if (!wasm) return false;
  const desired = enabled && nnueWeightsLoaded;
  if (desired === nnueEnabledState) return nnueEnabledState;
  try {
    wasm.setNnueEnabled(desired ? 1 : 0);
    // The TT persists across moves and its scores come from the leaf eval; V3
    // (~3.7x cp) and NNUE (true cp) scales must never mix in one search. A
    // real eval switch is rare (weights arriving mid-session, or a difficulty
    // change across the easy boundary), so dropping the TT here is cheap.
    wasm.clearTT();
    nnueEnabledState = desired;
  } catch (e) {
    console.error('[wasmEngine] setNnueEnabled failed; the V3 evaluation will be used instead', e);
    nnueEnabledState = false;
    try {
      wasm.setNnueEnabled(0);
    } catch {
      /* engine unusable; searchBestMove will fail and fall back to JS */
    }
  }
  return nnueEnabledState;
}

/**
 * Full-strength WASM search for the side to move of `k`.
 *
 * Returns the best move, or null when either the position has no legal move
 * (mate/stalemate — the WASM engine returns key 0) or anything went wrong
 * (init failure, runtime trap, illegal result). Callers must treat null as
 * "fall back to the JS engine", which reaches the same no-move conclusion for
 * genuinely mated positions.
 */
export function wasmSearchBestMove(
  k: KyokumenImproved,
  tesu: number,
  maxTimeMs: number,
  maxDepth: number = 32,
  quiescenceDepthMax: number = 10
): Te | null {
  const wasm = getInstance();
  if (!wasm) return null;

  try {
    syncPosition(wasm, k);
    wasm.setRootTesu(tesu | 0);
    const key = wasm.searchBestMove(maxTimeMs, maxDepth, quiescenceDepthMax);
    if (key === 0) return null; // no legal move (checkmate/stalemate)

    const te = teFromWasmKey(key, k);

    // Belt-and-braces legality check (cheap next to the search itself): the
    // engine is match-validated to only emit legal moves, but if anything ever
    // desyncs we fall back to the JS engine instead of corrupting the game.
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    const isLegal = legal.some(
      (m) => m.koma === te.koma && m.from === te.from && m.to === te.to && m.promote === te.promote
    );
    if (!isLegal) {
      console.error(`[wasmEngine] illegal move from search: ${te.toString()} — falling back to JS`);
      return null;
    }
    return te;
  } catch (e) {
    console.error('[wasmEngine] search failed; falling back to JS engine', e);
    return null;
  }
}
