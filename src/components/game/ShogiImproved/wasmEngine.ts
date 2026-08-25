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
import type { RootPolicyMoveRank } from './rootPolicyRank';
import { SharedTT } from './sharedTT';
import { GHI, SFU, Te } from './types';
import {
  SHOGI_WASM_BASE64,
  SHOGI_WASM_IDENTITY,
} from './wasm/shogiHalfkp81ProductionWasmBase64';

interface ShogiSearchWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  // Already-played positions (see positionHistory.ts). Optional so an older
  // pinned runtime still links and simply keeps the previous behavior.
  clearGameHistory?(): void;
  pushGameHistoryHash?(hashA: number, hashB: number): void;
  getGameHistorySize?(): number;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  // NNUE leaf evaluation for the HalfKP81 production evaluator.
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  getNnueBuckets(): number;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numer: number, denom: number): void;
  setNnueEnabled(flag: number): void;
  nnueEvaluateCp(): number;
  // Lazy SMP shared-TT hooks (see sharedTT.ts).
  getSharedTtScratchPtr(): number;
  getSecondaryHashVal(): number;
  setSharedTtEnabled(flag: number): void;
  setSearchStartDepth(d: number): void;
  // Root-policy rank hooks. Only integer move-key ranks cross this boundary;
  // no student score is visible to the search or TT.
  getHashVal(): number;
  beginRootPolicyRank(
    sequence: number,
    positionHashA: number,
    positionHashB: number,
    moveCount: number,
  ): number;
  setRootPolicyRankEntry(index: number, moveKey: number, rank: number): number;
  commitRootPolicyRank(sequence: number): number;
  setRootPolicySearchSequence(sequence: number): void;
  clearRootPolicyRank(): void;
  getLastRootPolicyRankAccepted(): number;
  getLastRootPolicyRankApplyCount(): number;
  getLastRootPolicyRankNonRootApplyCount(): number;
  getLastRootPolicyRankFault(): number;
}

let instance: ShogiSearchWasm | null = null;
let initFailed = false;

// ---------------------------------------------------------------------------
// Lazy SMP shared transposition table state (per worker; see sharedTT.ts).
//
// The WASM binary imports sharedTtProbe/sharedTtStore/sharedShouldStop
// unconditionally, but only calls them while its sharedTtEnabled flag is set,
// so in single-thread mode the closures below never run and the private
// in-WASM TT keeps the exact pre-SMP behavior.
// ---------------------------------------------------------------------------

let sharedTT: SharedTT | null = null;
/** 'main' clears the shared TT on eval switches; helpers never do. */
let sharedTTRole: 'main' | 'helper' = 'main';
/** Generation this worker's current search belongs to (see SharedTT docs). */
let searchGeneration = 0;
/** Cached Int32Array over the wasm-side probe scratch (stable after init). */
let sharedTtScratchView: Int32Array | null = null;

function getSharedTtScratchView(wasm: ShogiSearchWasm): Int32Array {
  // The engine allocates everything at instantiation and never grows memory
  // afterwards, but re-check the buffer identity anyway so a hypothetical
  // grow can never leave us writing into a detached buffer.
  if (sharedTtScratchView === null || sharedTtScratchView.buffer !== wasm.memory.buffer) {
    sharedTtScratchView = new Int32Array(wasm.memory.buffer, wasm.getSharedTtScratchPtr(), 4);
  }
  return sharedTtScratchView;
}

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
    if (bytes.byteLength !== SHOGI_WASM_IDENTITY.bytes) {
      initFailed = true;
      console.error(
        `[wasmEngine] embedded binary size=${bytes.byteLength}, expected ${SHOGI_WASM_IDENTITY.bytes}; the JS engine will be used instead`,
      );
      return null;
    }
    // The binary uses SIMD128; on an engine without SIMD support validate()
    // returns false (new WebAssembly.Module would throw a CompileError anyway,
    // this just makes the fallback reason explicit in the log). The typeof
    // guards keep environments without WebAssembly (or without validate) on
    // the ordinary Module-constructor failure path below.
    if (
      typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.validate === 'function' &&
      !WebAssembly.validate(bytes)
    ) {
      initFailed = true;
      console.error(
        '[wasmEngine] binary failed WebAssembly.validate (most likely missing SIMD128 support); the JS engine will be used instead'
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
        // Lazy SMP shared-TT hooks. Only called while the engine's
        // sharedTtEnabled flag is on (i.e. after enableSharedTT()).
        sharedTtProbe: (hashA: number, hashB: number): number => {
          const tt = sharedTT;
          if (!tt || !instance) return 0;
          return tt.probe(hashA, hashB, getSharedTtScratchView(instance));
        },
        sharedTtStore: (
          hashA: number,
          hashB: number,
          value: number,
          flagDepth: number,
          best: number,
        ): void => {
          if (sharedTT) sharedTT.store(hashA, hashB, value, flagDepth, best);
        },
        sharedShouldStop: (): number => {
          const tt = sharedTT;
          return tt && tt.readGeneration() !== searchGeneration ? 1 : 0;
        },
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

/**
 * Copy the full JS position into the WASM engine (board / hands / side to
 * move). finalizePosition() recomputes both position hashes after every input
 * component is present; keep it last.
 */
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

/**
 * Replace the engine's game history with `history` (flat [primary, secondary]
 * hash pairs from positionHistory.ts). Always called before a search — passing
 * nothing clears it — so one search can never inherit another's history.
 * A runtime without the exports keeps its previous, history-blind behavior.
 */
function applyGameHistory(
  wasm: ShogiSearchWasm,
  history: readonly number[] | null | undefined
): void {
  if (typeof wasm.clearGameHistory !== 'function') return;
  if (typeof wasm.pushGameHistoryHash !== 'function') return;
  wasm.clearGameHistory();
  if (!history) return;
  const pairs = history.length - (history.length % 2);
  for (let i = 0; i < pairs; i += 2) {
    wasm.pushGameHistoryHash(history[i] | 0, history[i + 1] | 0);
  }
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

/** Build-time SHA-256 identity of the exact base64-embedded WASM bytes. */
export interface EmbeddedWasmIdentity {
  readonly bytes: number;
  readonly sha256: string;
}

let embeddedWasmRuntimeIdentity: Promise<EmbeddedWasmIdentity> | null = null;

/**
 * Opt-in SHA-256 of the actual base64-decoded bytes used by getInstance().
 * Ordinary engine startup never pays this hashing cost.
 */
export function measureEmbeddedWasmRuntimeIdentity(): Promise<EmbeddedWasmIdentity> {
  embeddedWasmRuntimeIdentity ??= (async () => {
    const bytes = decodeBase64(SHOGI_WASM_BASE64);
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable');
    const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
    return {
      bytes: bytes.byteLength,
      sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
  })();
  return embeddedWasmRuntimeIdentity;
}

/** Diagnostics for the most recent wasmSearchBestMove() call. */
export interface WasmSearchStats {
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
}

export interface WasmRootPolicyRankReceipt {
  readonly schema: 'shogi-root-policy-rank-receipt-v1';
  /** Positive i32 generated by the main worker once per enabled root. */
  readonly sequence: number;
  /** The engine's deterministic dual position keys, including side to move. */
  readonly positionHashA: number;
  readonly positionHashB: number;
  readonly moveCount: number;
  readonly ranks: readonly RootPolicyMoveRank[];
}

export interface WasmRootPolicyRankDiagnostics {
  readonly accepted: boolean;
  /** Initial root sort plus every ply-zero iterative-deepening sort. */
  readonly applyCount: number;
  readonly nonRootApplyCount: number;
  /** Engine-side fail-closed code; zero means no rank plumbing fault. */
  readonly fault: number;
}

function rootPolicyExportsAvailable(wasm: ShogiSearchWasm): boolean {
  return (
    typeof wasm.getHashVal === 'function' &&
    typeof wasm.getSecondaryHashVal === 'function' &&
    typeof wasm.beginRootPolicyRank === 'function' &&
    typeof wasm.setRootPolicyRankEntry === 'function' &&
    typeof wasm.commitRootPolicyRank === 'function' &&
    typeof wasm.setRootPolicySearchSequence === 'function' &&
    typeof wasm.clearRootPolicyRank === 'function'
  );
}

function isI32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff
  );
}

function validRootPolicyRanks(ranks: unknown): ranks is readonly RootPolicyMoveRank[] {
  if (!Array.isArray(ranks)) return false;
  if (ranks.length === 0 || ranks.length > 640) return false;
  const keys = new Set<number>();
  const seenRanks = new Set<number>();
  for (const item of ranks) {
    if (
      !item ||
      typeof item !== 'object' ||
      !isI32(item.moveKey) ||
      item.moveKey <= 0 ||
      keys.has(item.moveKey) ||
      !isI32(item.rank) ||
      item.rank < 0 ||
      item.rank >= ranks.length ||
      seenRanks.has(item.rank)
    ) {
      return false;
    }
    keys.add(item.moveKey);
    seenRanks.add(item.rank);
  }
  return true;
}

/**
 * Bind one provider result to the exact dual-hashed WASM root. This performs
 * no search and does not install the rank yet, so the same immutable receipt
 * can be sent to every Lazy-SMP helper.
 */
export function createWasmRootPolicyRankReceipt(
  k: KyokumenImproved,
  sequence: number,
  ranks: readonly RootPolicyMoveRank[],
): WasmRootPolicyRankReceipt | null {
  const wasm = getInstance();
  if (
    !wasm ||
    !rootPolicyExportsAvailable(wasm) ||
    !Number.isInteger(sequence) ||
    sequence <= 0 ||
    sequence > 0x7fffffff ||
    !validRootPolicyRanks(ranks)
  ) {
    return null;
  }
  try {
    syncPosition(wasm, k);
    return Object.freeze({
      schema: 'shogi-root-policy-rank-receipt-v1' as const,
      sequence: sequence | 0,
      positionHashA: wasm.getHashVal() | 0,
      positionHashB: wasm.getSecondaryHashVal() | 0,
      moveCount: ranks.length,
      ranks: Object.freeze(
        ranks.map((item) => Object.freeze({ moveKey: item.moveKey | 0, rank: item.rank | 0 })),
      ),
    });
  } catch (e) {
    console.error('[wasmEngine] root-policy receipt creation failed; using stable ordering', e);
    return null;
  }
}

function installRootPolicyRank(
  wasm: ShogiSearchWasm,
  receipt: WasmRootPolicyRankReceipt,
): boolean {
  try {
    wasm.clearRootPolicyRank();
    if (
      receipt.schema !== 'shogi-root-policy-rank-receipt-v1' ||
      !isI32(receipt.sequence) ||
      receipt.sequence <= 0 ||
      !isI32(receipt.positionHashA) ||
      !isI32(receipt.positionHashB) ||
      !isI32(receipt.moveCount) ||
      !validRootPolicyRanks(receipt.ranks) ||
      receipt.moveCount !== receipt.ranks.length
    ) {
      return false;
    }
    if (
      wasm.beginRootPolicyRank(
        receipt.sequence | 0,
        receipt.positionHashA | 0,
        receipt.positionHashB | 0,
        receipt.moveCount | 0,
      ) !== 1
    ) {
      return false;
    }
    for (let index = 0; index < receipt.ranks.length; index++) {
      const item = receipt.ranks[index];
      if (wasm.setRootPolicyRankEntry(index, item.moveKey | 0, item.rank | 0) !== 1) {
        wasm.clearRootPolicyRank();
        return false;
      }
    }
    if (wasm.commitRootPolicyRank(receipt.sequence | 0) !== 1) {
      wasm.clearRootPolicyRank();
      return false;
    }
    wasm.setRootPolicySearchSequence(receipt.sequence | 0);
    return true;
  } catch (e) {
    console.error('[wasmEngine] root-policy rank install failed; using stable ordering', e);
    try {
      wasm.clearRootPolicyRank();
    } catch {
      /* a trapped engine will be rejected by the enclosing search */
    }
    return false;
  }
}

/** Clear any pending rank before clearTT, fallback, or pondering. */
export function clearWasmRootPolicyRank(): void {
  const wasm = getInstance();
  if (!wasm || !rootPolicyExportsAvailable(wasm)) return;
  try {
    wasm.clearRootPolicyRank();
  } catch (e) {
    console.error('[wasmEngine] root-policy rank clear failed', e);
  }
}

/** Diagnostics for the most recent search; intended for admission tests. */
export function getLastWasmRootPolicyRankDiagnostics(): WasmRootPolicyRankDiagnostics | null {
  const wasm = getInstance();
  if (
    !wasm ||
    typeof wasm.getLastRootPolicyRankAccepted !== 'function' ||
    typeof wasm.getLastRootPolicyRankApplyCount !== 'function' ||
    typeof wasm.getLastRootPolicyRankFault !== 'function'
  ) {
    return null;
  }
  try {
    return {
      accepted: wasm.getLastRootPolicyRankAccepted() === 1,
      applyCount: wasm.getLastRootPolicyRankApplyCount() | 0,
      nonRootApplyCount:
        typeof wasm.getLastRootPolicyRankNonRootApplyCount === 'function'
          ? wasm.getLastRootPolicyRankNonRootApplyCount() | 0
          : 0,
      fault: wasm.getLastRootPolicyRankFault() | 0,
    };
  } catch {
    return null;
  }
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
 *
 * In multi-thread mode the 'main' worker also clears the shared TT; helper
 * workers only clear their private caches (the main clears the shared one).
 */
export function clearWasmTT(): void {
  const wasm = getInstance();
  if (!wasm) return;
  try {
    if (rootPolicyExportsAvailable(wasm)) wasm.clearRootPolicyRank();
    wasm.clearTT();
    // A new game has no already-played positions. Every search re-primes this
    // anyway; clearing here keeps the engine consistent even if one does not.
    wasm.clearGameHistory?.();
    if (sharedTT && sharedTTRole === 'main') sharedTT.clear();
  } catch (e) {
    console.error('[wasmEngine] clearTT failed', e);
  }
}

// ---------------------------------------------------------------------------
// Lazy SMP (multi-thread) controls — see sharedTT.ts and shogi-ai.worker.ts
// ---------------------------------------------------------------------------

/**
 * Attach a shared transposition table and switch the engine to shared-TT
 * mode. Returns false (leaving the engine in single-thread mode) when the
 * engine is unavailable or the binary predates the SMP exports.
 */
export function enableSharedTT(sab: SharedArrayBuffer, role: 'main' | 'helper'): boolean {
  const wasm = getInstance();
  if (!wasm) return false;
  try {
    if (
      typeof wasm.getSharedTtScratchPtr !== 'function' ||
      typeof wasm.getSecondaryHashVal !== 'function' ||
      typeof wasm.setSharedTtEnabled !== 'function' ||
      typeof wasm.setSearchStartDepth !== 'function'
    ) {
      return false;
    }
    const tt = new SharedTT(sab);
    // Prime the scratch view before flipping the engine flag so the very
    // first probe cannot race instance/view setup.
    getSharedTtScratchView(wasm);
    sharedTT = tt;
    sharedTTRole = role;
    wasm.setSharedTtEnabled(1);
    return true;
  } catch (e) {
    console.error('[wasmEngine] enableSharedTT failed; staying single-thread', e);
    sharedTT = null;
    try {
      wasm.setSharedTtEnabled(0);
    } catch {
      /* engine unusable; searches will fail over to the JS engine */
    }
    return false;
  }
}

/** True once enableSharedTT() succeeded (diagnostics/tests). */
export function isSharedTTEnabled(): boolean {
  return sharedTT !== null;
}

/**
 * Set the generation the NEXT search on this worker belongs to. The search
 * stops (checked every ~2048 nodes) as soon as the published generation in
 * the shared TT differs — that is how the main thread stops the helpers.
 */
export function setSearchGeneration(gen: number): void {
  searchGeneration = gen | 0;
}

/** Publish the active generation to all workers (main thread only; 0 = idle). */
export function publishSearchGeneration(gen: number): void {
  if (sharedTT) sharedTT.publishGeneration(gen);
}

/**
 * First iterative-deepening depth for the next searches (helpers use
 * 1 + (helperId & 1) to desynchronize from the main thread's ply schedule).
 */
export function setWasmSearchStartDepth(depth: number): void {
  const wasm = getInstance();
  if (!wasm || typeof wasm.setSearchStartDepth !== 'function') return;
  try {
    wasm.setSearchStartDepth(depth | 0);
  } catch (e) {
    console.error('[wasmEngine] setSearchStartDepth failed', e);
  }
}

// ---------------------------------------------------------------------------
// NNUE evaluation (HalfKP81 production weights)
// ---------------------------------------------------------------------------

/**
 * Exact size and runtime configuration of the HalfKP81 evaluator. The shipped
 * weights are the 2026-08-24 book-leaf distillation round (R3 arm A): a
 * warm-start retrain that adds Aoba depth-12 labels for positions right after
 * the opening book runs out. Against the previous weights it scored 66.2%
 * (53W-27L over 80 book-exit games at 1000ms/move, Wilson 95% CI lower bound
 * 55.4%) and 65.0% (51W-2D-27L over 80 curated-opening games). The 81-bucket
 * layout grows WASM memory lazily, so callers must select the bucket count
 * before resolving the weight pointer.
 */
export const NNUE_WEIGHTS_BYTES = 94_656_708;
export const NNUE_SCALE_K = 600;
export const NNUE_BUCKETS = 81;

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
 * K (cp = out_q * K / 8128). The HalfKP81 production evaluator uses K=600
 * and output scale 1/1.
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
      typeof wasm.setNnueBuckets !== 'function' ||
      typeof wasm.getNnueBuckets !== 'function' ||
      typeof wasm.setNnueScaleK !== 'function' ||
      typeof wasm.setNnueOutputScale !== 'function' ||
      typeof wasm.setNnueEnabled !== 'function'
    ) {
      return false;
    }
    if (bytes.byteLength !== NNUE_WEIGHTS_BYTES) {
      console.error(
        `[wasmEngine] NNUE weights rejected: size=${bytes.byteLength}, expected ${NNUE_WEIGHTS_BYTES}`
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
    // Selecting the HalfKP81 layout can grow memory. Do it before reading the
    // payload pointer or memory.buffer so no detached pre-grow buffer is used.
    wasm.setNnueBuckets(NNUE_BUCKETS);
    if (wasm.getNnueBuckets() !== NNUE_BUCKETS) {
      console.error('[wasmEngine] NNUE layout rejected: bucket mode is not 81');
      return false;
    }
    if (wasm.getNnueWeightsSize() !== NNUE_WEIGHTS_BYTES) {
      console.error(
        `[wasmEngine] NNUE layout rejected: engine bytes=${wasm.getNnueWeightsSize()}`
      );
      return false;
    }
    const weightsPtr = wasm.getNnueWeightsPtr();
    if (weightsPtr <= 0) return false;
    new Uint8Array(wasm.memory.buffer, weightsPtr, NNUE_WEIGHTS_BYTES).set(bytes);
    wasm.setNnueScaleK(k);
    wasm.setNnueOutputScale(1, 1);
    // If NNUE is somehow already live (re-load), rebuild the accumulators from
    // the fresh weights so stale activations can never be searched.
    if (nnueEnabledState) wasm.setNnueEnabled(1);
    else wasm.setNnueEnabled(0);
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
    // In multi-thread mode the shared TT holds the same scores, so the 'main'
    // worker drops it too (helpers toggle in lockstep via the go message and
    // must not race a concurrent clear).
    wasm.clearTT();
    if (sharedTT && sharedTTRole === 'main') sharedTT.clear();
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
 * Evaluate one already authenticated position through the loaded production
 * NNUE. This is intentionally narrow: callers receive null unless the exact
 * NNUE path is loaded and enabled, so a static gate cannot silently use V3.
 */
export function wasmEvaluateNnueCp(k: KyokumenImproved): number | null {
  const wasm = getInstance();
  if (
    !wasm ||
    !nnueWeightsLoaded ||
    !nnueEnabledState ||
    typeof wasm.nnueEvaluateCp !== 'function'
  ) {
    return null;
  }
  try {
    syncPosition(wasm, k);
    const value = wasm.nnueEvaluateCp() | 0;
    return Number.isFinite(value) ? value : null;
  } catch (e) {
    console.error(
      '[wasmEngine] NNUE static evaluation failed; rejecting the diagnostic',
      e,
    );
    return null;
  }
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
  quiescenceDepthMax: number = 10,
  rootPolicyRank?: WasmRootPolicyRankReceipt | null,
  gameHistory?: readonly number[] | null,
): Te | null {
  const wasm = getInstance();
  if (!wasm) return null;

  try {
    syncPosition(wasm, k);
    applyGameHistory(wasm, gameHistory);
    if (rootPolicyExportsAvailable(wasm)) {
      // A rank is one-search state. Always begin from clear so a stale receipt
      // left by an interrupted caller can never affect this root.
      wasm.clearRootPolicyRank();
      if (rootPolicyRank) installRootPolicyRank(wasm, rootPolicyRank);
    }
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
  } finally {
    // Covers normal completion, no-move roots, illegal-result fallback and
    // JavaScript-visible WASM traps. Ponder searches therefore cannot inherit
    // a real-move rank either.
    if (rootPolicyExportsAvailable(wasm)) {
      try {
        wasm.clearRootPolicyRank();
      } catch {
        /* the trapped engine is already falling back */
      }
    }
  }
}
