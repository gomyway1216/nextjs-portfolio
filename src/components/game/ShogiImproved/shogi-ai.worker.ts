/**
 * Dedicated Web Worker for Shogi AI search (Improved engine).
 *
 * Why a worker:
 * - Searches are synchronous and use up to multi-second time budgets; running
 *   them on the main thread would freeze the UI. All difficulties route
 *   through this worker (even easy's ~250ms search is worth keeping off the
 *   main thread).
 *
 * Move pipeline (hybrid, per move):
 * 1. JS opening book (getOpeningMoveImproved)
 * 2. JS mate solver probe (same gate + budget policy as ShogiAIImprovedV20)
 * 3. WASM full search (wasmEngine.ts — V20 port, ~15x faster / depth +3..+4)
 * 4. JS V20 search — fallback if the WASM engine is unavailable or fails
 *
 * Protocol:
 * - `bestMove`: compute the best move for a serialized position + difficulty.
 * - `clearTT`: clears the transposition tables (call when starting a new game;
 *   the TT is intentionally kept across moves of one game).
 * - `ponderControl`: suspend/resume pondering (sent by the client on
 *   `visibilitychange` so a hidden tab does not burn CPU).
 * - `smpThreads`: enable Lazy SMP multi-thread search. The client (which owns
 *   worker spawning) passes the SharedArrayBuffer transposition table and one
 *   MessagePort per helper worker; from then on this worker coordinates the
 *   helpers directly (see smpProtocol.ts / sharedTT.ts). Only sent on
 *   cross-origin-isolated pages with >= 2 usable threads; otherwise this
 *   worker behaves exactly like the previous single-thread build.
 *
 * Pondering ("permanent brain"):
 * - Right after answering a `bestMove`, the worker keeps searching from the
 *   *resulting* position (the human's turn) in short synchronous slices while
 *   staying responsive to messages (see ponderController.ts). This warms the
 *   module-scope WASM transposition table, so when the human finally moves,
 *   the next real search starts from hot TT entries and reaches a deeper ply
 *   within the same time budget. No API change is needed: pondering starts
 *   automatically and any subsequent message stops it.
 * - Disabled for `easy` (that level is intentionally weak) and when the WASM
 *   engine is unavailable. Capped at PONDER_MAX_TOTAL_MS per turn.
 *
 * Notes:
 * - The WASM instance and the fallback `ShogiAIImprovedV20` live at module
 *   scope so their TTs persist across moves.
 * - The caller should still ignore stale responses if the user moved/reset
 *   while the worker was thinking.
 */

import { KyokumenImproved } from './KyokumenImproved';
import { MateSolverImproved } from './MateSolverImproved';
import { getOpeningMoveImproved } from './OpeningBookImproved';
import { PonderController } from './ponderController';
import { buildPosition, type SerializedKyokumenImproved, type SerializedTeImproved } from './serializedPosition';
import { ShogiAIImprovedV20 } from './ShogiAIImprovedV20';
import type { HelperRequest, HelperResponse, MainThreadsInitMessage } from './smpProtocol';
import { EMPTY, FU, getKomashu, HI, isSelf, OU, SENTE, Te } from './types';
import {
  clearWasmTT,
  enableSharedTT,
  isWasmEngineReady,
  loadNnueWeights,
  publishSearchGeneration,
  setSearchGeneration,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from './wasmEngine';
import { Difficulty } from '../common/types';

export type { SerializedKyokumenImproved, SerializedTeImproved };

type WorkerRequest =
  | { type: 'bestMove'; id: number; position: SerializedKyokumenImproved; difficulty: Difficulty; tesu: number }
  | { type: 'clearTT' }
  | { type: 'ponderControl'; action: 'suspend' | 'resume' }
  | MainThreadsInitMessage;

type WorkerResponse =
  | { type: 'bestMoveResult'; id: number; move: SerializedTeImproved | null }
  | { type: 'error'; id: number; message: string };

const ai = new ShogiAIImprovedV20();
const mateSolver = new MateSolverImproved();

/** One synchronous ponder search slice; short enough to keep the worker responsive. */
const PONDER_SLICE_MS = 200;
/** Hard cap on pondering per turn so an idle tab does not burn CPU/battery. */
const PONDER_MAX_TOTAL_MS = 30_000;

/** Dev-only tracing; in production a ponder log line per move is just noise. */
const PONDER_TRACE = process.env.NODE_ENV === 'development';

const ponder = new PonderController({
  sliceMs: PONDER_SLICE_MS,
  maxTotalMs: PONDER_MAX_TOTAL_MS,
  onSessionEnd: (reason, spentMs) => {
    // `stopped` (a real request arrived) is the common, interesting case —
    // it means the TT was warmed for exactly `spentMs`.
    if (PONDER_TRACE) {
      console.info(`[shogi-ai.worker] ponder end (${reason}, ${Math.round(spentMs)}ms)`);
    }
  },
});

/**
 * NNUE leaf evaluation (run1m-base weights, 77.1% vs V3 at 1000ms/move).
 *
 * The weights ship as a static asset (public/shogi-nnue-weights.bin) and are
 * fetched asynchronously at worker startup — NOT bundled (base64 embedding
 * would add ~1.6MB to the worker bundle). Until the fetch resolves, searches
 * run on the hand-crafted V3 evaluation exactly as before (the first move
 * comes from the opening book anyway); once loaded, NNUE kicks in from the
 * next NNUE-gated search. Any failure (network, size mismatch, missing WASM)
 * silently keeps the V3 path.
 */
const NNUE_WEIGHTS_PATH = '/shogi-nnue-weights.bin';
/** k_sigmoid from ml/runs/run1m-base/weights.meta.json (cp = out_q * K / 8128). */
const NNUE_SCALE_K = 600;

/**
 * Absolute weights URL. Workers loaded via a blob: URL (some bundler worker
 * loaders) would resolve a root-relative fetch against the blob URL and fail;
 * `self.location.origin` is the creator's origin even in blob workers, so
 * anchor the path there when available ('null' = opaque origin, fall back).
 */
function nnueWeightsUrl(): string {
  const origin = typeof self !== 'undefined' ? self.location?.origin : undefined;
  if (origin && origin !== 'null') return new URL(NNUE_WEIGHTS_PATH, origin).toString();
  return NNUE_WEIGHTS_PATH;
}

/**
 * Difficulties that use the NNUE evaluation. `easy` (250ms) intentionally stays
 * on V3: at ~200ms budgets V3 measured stronger (NNUE 40.9%), and easy is meant
 * to be weak anyway.
 *
 * 2026-07-06: RE-ENABLED for hard/expert/master. The medium-only hotfix
 * (below) was lifted after the cycle-3 weights (run5m-base, 5.24M positions,
 * balance-rate 0.5) fixed the saturation that caused the 2-dan loss:
 *   - The infamous 72nd move: move-value spread 20cp (all moves equal =
 *     saturated, picked a −35281cp blunder) → 532cp (26x), now picks the TRUE
 *     best move; game blunders (>300cp) halved 8→4.
 *   - Direct A/B vs the shipped run1m-base NNUE: 92.2% (29.5/32).
 *   - vs V3 at 2000ms (the hard budget that was never verified before): 87.5%.
 * So NNUE is now a strict improvement at every budget >= 1000ms, hard included.
 *
 * Prior hotfix rationale (2026-07-05, superseded): reduced to medium only after
 * a 2-dan game exposed NNUE saturation at decided positions; the 77.1% A/B was
 * 1000ms-only and hard (2000ms) was an unverified extrapolation.
 */
const NNUE_DIFFICULTIES: ReadonlySet<Difficulty> = new Set(['medium', 'hard', 'expert', 'master']);

function difficultyUsesNnue(difficulty: Difficulty): boolean {
  return NNUE_DIFFICULTIES.has(difficulty);
}

/**
 * Weights bytes kept for the Lazy SMP helpers: each helper runs its own WASM
 * instance and needs its own copy. Whichever comes last — the fetch resolving
 * or a helper connecting — triggers the forward (see sendNnueWeightsToHelpers).
 */
let nnueWeightsBytes: ArrayBuffer | null = null;

async function fetchNnueWeights(): Promise<void> {
  try {
    const res = await fetch(nnueWeightsUrl());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const ok = loadNnueWeights(new Uint8Array(buf), NNUE_SCALE_K);
    if (ok) {
      nnueWeightsBytes = buf;
      sendNnueWeightsToHelpers();
    }
    if (process.env.NODE_ENV === 'development') {
      console.info(
        ok
          ? `[shogi-ai.worker] NNUE weights loaded (${buf.byteLength} bytes, K=${NNUE_SCALE_K})`
          : '[shogi-ai.worker] NNUE weights rejected; using V3 evaluation'
      );
    }
  } catch (e) {
    // Expected offline / in node tests; the V3 path is the normal fallback.
    if (process.env.NODE_ENV === 'development') {
      console.info('[shogi-ai.worker] NNUE weights unavailable; using V3 evaluation', e);
    }
  }
}
void fetchNnueWeights();

// ---------------------------------------------------------------------------
// Lazy SMP coordination (multi-thread search over a shared TT).
//
// The client spawns the helper workers and hands us one MessagePort per
// helper plus the SharedArrayBuffer TT ('smpThreads' message). From then on
// this worker coordinates every multi-thread search: publish a generation,
// broadcast `go`, run the normal WASM search, publish 0 to stop the helpers.
// Anything failing here leaves smpPorts empty == plain single-thread mode.
// ---------------------------------------------------------------------------

let smpPorts: MessagePort[] = [];
let smpGenCounter = 0;

function nextSmpGeneration(): number {
  // Skip 0 (idle marker) on wrap-around.
  smpGenCounter = (smpGenCounter + 1) | 0;
  if (smpGenCounter === 0) smpGenCounter = 1;
  return smpGenCounter;
}

function sendNnueWeightsToHelpers(): void {
  if (!nnueWeightsBytes) return;
  for (const port of smpPorts) {
    const req: HelperRequest = { type: 'nnueWeights', bytes: nnueWeightsBytes, scaleK: NNUE_SCALE_K };
    port.postMessage(req);
  }
}

function initSmpThreads(msg: MainThreadsInitMessage): void {
  if (smpPorts.length > 0) return; // already initialized
  if (!enableSharedTT(msg.sab, 'main')) {
    if (PONDER_TRACE) console.info('[shogi-ai.worker] shared TT unavailable; staying single-thread');
    return;
  }
  smpPorts = msg.ports;
  for (const port of smpPorts) {
    port.onmessage = (event: MessageEvent<HelperResponse>) => {
      const res = event.data;
      if (!res || typeof res !== 'object' || !('type' in res)) return;
      // Helper node counts are diagnostics only (used to eyeball the thread
      // scaling in dev); the moves themselves never leave the helpers.
      if (res.type === 'stats' && PONDER_TRACE) {
        console.info(`[shogi-ai.worker] helper stats: gen=${res.gen} nodes=${res.nodes} depth=${res.depth}`);
      }
    };
  }
  sendNnueWeightsToHelpers();
  if (PONDER_TRACE) {
    console.info(`[shogi-ai.worker] Lazy SMP enabled: 1 main + ${smpPorts.length} helper thread(s)`);
  }
}

/**
 * Time/quiescence budgets per difficulty — MUST stay in sync with the
 * defaults in ShogiAIImprovedV20.getNextTe() so WASM and the JS fallback
 * play at the same strength ladder.
 */
const DIFFICULTY_BUDGETS: Record<Difficulty, { maxTimeMs: number; quiescenceDepthMax: number }> = {
  easy: { maxTimeMs: 250, quiescenceDepthMax: 6 },
  medium: { maxTimeMs: 1000, quiescenceDepthMax: 8 },
  hard: { maxTimeMs: 2000, quiescenceDepthMax: 10 },
  expert: { maxTimeMs: 4000, quiescenceDepthMax: 12 },
  master: { maxTimeMs: 5000, quiescenceDepthMax: 12 },
};

const ctx: {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
} = self as unknown as {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

/**
 * Mate-solver gate — port of ShogiAIImprovedV20.shouldTryMateSolve().
 * Only probe when a mate is plausible: at least one own non-king piece within
 * Chebyshev distance 3 of the enemy king, and (near pieces + hand pieces) >= 2.
 */
function shouldTryMateSolve(k: KyokumenImproved): boolean {
  const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;
  if (enemyKing <= 0) return false;

  const kingSuji = enemyKing >> 4;
  const kingDan = enemyKing & 0x0f;

  let near = 0;
  for (let ds = -3; ds <= 3; ds++) {
    const suji = kingSuji + ds;
    if (suji < 1 || suji > 9) continue;
    for (let dd = -3; dd <= 3; dd++) {
      const dan = kingDan + dd;
      if (dan < 1 || dan > 9) continue;
      const p = k.get((suji << 4) + dan);
      if (p === EMPTY) continue;
      if (isSelf(k.teban, p) && getKomashu(p) !== OU) near++;
    }
  }
  if (near === 0) return false;

  let handCount = 0;
  for (let type = FU; type <= HI; type++) handCount += k.hand[k.teban | type] | 0;

  return near + handCount >= 2;
}

/**
 * Hybrid best-move: book → mate solver → WASM search → JS V20 fallback.
 * Same gate/budget policy as ShogiAIImprovedV20.tryMateSolve(): ~20% of the
 * move budget (30..200ms) for the mate probe, remainder to the main search.
 *
 * `raw` is the serialized position `k` was built from; in multi-thread mode
 * it is forwarded verbatim to the helper workers so all threads search the
 * exact same root.
 */
function computeBestMove(
  k: KyokumenImproved,
  raw: SerializedKyokumenImproved,
  difficulty: Difficulty,
  tesu: number
): Te | null {
  // 1) Opening book.
  const book = getOpeningMoveImproved(k, difficulty);
  if (book) return book;

  const budget = DIFFICULTY_BUDGETS[difficulty] ?? DIFFICULTY_BUDGETS.medium;

  // 2) Mate-solver probe.
  let searchBudgetMs = budget.maxTimeMs;
  if (shouldTryMateSolve(k)) {
    const mateStart = performance.now();
    const budgetMs = Math.max(30, Math.min(200, Math.floor(budget.maxTimeMs * 0.2)));
    const mate = mateSolver.solve(k, { maxPlies: 9, maxNodes: 150_000, maxTimeMs: budgetMs });
    if (mate) return mate;
    const spent = performance.now() - mateStart;
    searchBudgetMs = Math.max(Math.floor(budget.maxTimeMs / 2), budget.maxTimeMs - Math.ceil(spent));
  }

  // 3) WASM full search. NNUE per the difficulty gate — a no-op request that
  // stays on V3 while the weights are not (yet) loaded. Toggle the eval
  // BEFORE waking the helpers: a real switch clears the shared TT, and the
  // helpers must not be writing entries on the old eval scale meanwhile.
  const nnue = difficultyUsesNnue(difficulty);
  setWasmNnueEnabled(nnue);

  // Lazy SMP: wake the helper threads on the same root position. Easy stays
  // single-thread — it is intentionally weak. Helpers stop via the published
  // generation the moment our own search returns (see finally).
  const useSmp = smpPorts.length > 0 && difficulty !== 'easy';
  let gen = 0;
  if (useSmp) {
    gen = nextSmpGeneration();
    setSearchGeneration(gen);
    publishSearchGeneration(gen);
    const go: HelperRequest = {
      type: 'go',
      gen,
      position: raw,
      tesu,
      maxTimeMs: searchBudgetMs,
      quiescenceDepthMax: budget.quiescenceDepthMax,
      nnue,
      difficulty,
    };
    for (const port of smpPorts) port.postMessage(go);
  }

  let wasmMove: Te | null = null;
  try {
    wasmMove = wasmSearchBestMove(k, tesu, searchBudgetMs, 32, budget.quiescenceDepthMax);
  } finally {
    // Stop the helpers even if the search trapped, and sync our OWN local
    // generation back to the idle value. Without the setSearchGeneration(0)
    // the main worker's local generation would stay at `gen` while the TT
    // generation returns to 0, so a later non-SMP search on the same isolated
    // page (easy, or the ponder loop) would see sharedShouldStop() report a
    // mismatch and bail out after the first ~2048-node check — crippling easy
    // and silently disabling pondering.
    if (useSmp) {
      publishSearchGeneration(0);
      setSearchGeneration(0);
    }
  }
  if (wasmMove) return wasmMove;

  // 4) JS V20 fallback (also the "no legal move" confirmation path: for a
  // genuinely mated position it returns null just like the WASM engine).
  return ai.getNextTe(k, tesu, { difficulty });
}

/**
 * Start pondering ("permanent brain") after answering a bestMove request.
 *
 * `k` is the position the AI just searched and `best` the move it answered
 * with; applying it yields the position the human is now thinking about. We
 * keep searching that position in PONDER_SLICE_MS slices — the search results
 * themselves are discarded, but the WASM TT (kept across moves) fills with
 * exactly the subtree the next real search will probe.
 *
 * `k` is owned by this message (buildPosition creates a fresh copy), so
 * mutating it here is safe.
 */
function startPonder(k: KyokumenImproved, best: Te, difficulty: Difficulty, tesu: number): void {
  // Easy is intentionally weak — do not sharpen it. And without the WASM
  // engine there is no shared TT worth warming (the JS fallback path is rare
  // and its search is not slice-friendly at these budgets).
  if (difficulty === 'easy') return;
  if (!isWasmEngineReady()) return;

  k.move(best);
  k.toggleTeban();
  const budget = DIFFICULTY_BUDGETS[difficulty] ?? DIFFICULTY_BUDGETS.medium;
  const ponderTesu = (tesu | 0) + 1;

  if (PONDER_TRACE) {
    console.info(`[shogi-ai.worker] ponder start (difficulty=${difficulty}, cap=${PONDER_MAX_TOTAL_MS}ms)`);
  }
  // Keep the ponder search on the same evaluation as the real search for this
  // difficulty (module-scope WASM state; normally already set by
  // computeBestMove, and a same-state request is a no-op — but the book path
  // returns before the gate, and TT entries must not mix eval functions).
  setWasmNnueEnabled(difficultyUsesNnue(difficulty));
  // Pondering stays single-thread (the helpers stay idle — better on battery,
  // and the warmed entries land in the shared TT anyway because this worker
  // keeps writing through it). Publish a fresh generation so our own slices
  // are not stopped by the 0 published when the last real search finished.
  if (smpPorts.length > 0) {
    const gen = nextSmpGeneration();
    setSearchGeneration(gen);
    publishSearchGeneration(gen);
  }
  ponder.start((sliceMs) => {
    // Returns null when the human is already mated/stalemated (or the engine
    // tripped) — stop the session instead of spinning on empty slices.
    return wasmSearchBestMove(k, ponderTesu, sliceMs, 32, budget.quiescenceDepthMax) !== null;
  });
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

  if (msg.type === 'smpThreads') {
    initSmpThreads(msg);
    return;
  }

  if (msg.type === 'ponderControl') {
    if (msg.action === 'suspend') ponder.suspend();
    else ponder.resume();
    return;
  }

  // Any real request supersedes the current ponder session. Because slices are
  // short, this handler runs within ~PONDER_SLICE_MS of the message arriving.
  ponder.stop();

  if (msg.type === 'clearTT') {
    ai.clearTT();
    clearWasmTT(); // 'main' role: also clears the shared TT
    const req: HelperRequest = { type: 'clearTT' };
    for (const port of smpPorts) port.postMessage(req);
    return;
  }

  if (msg.type !== 'bestMove') return;

  try {
    const k = buildPosition(msg.position);
    const best = computeBestMove(k, msg.position, msg.difficulty, msg.tesu | 0);
    const move: SerializedTeImproved | null = best
      ? { koma: best.koma, from: best.from, to: best.to, promote: best.promote }
      : null;

    ctx.postMessage({ type: 'bestMoveResult', id: msg.id, move });

    // Answer first, then start thinking on the opponent's time.
    if (best) startPonder(k, best, msg.difficulty, msg.tesu | 0);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.postMessage({ type: 'error', id: msg.id, message });
  }
};

/** Test-only handle: lets unit tests observe ponder state through the message protocol. */
export { ponder as __ponderControllerForTests };

export {};
