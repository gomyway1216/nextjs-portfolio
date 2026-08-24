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
 * - `engineDiagnostics`: explicit, read-only identity/load-state evidence for
 *   parity tooling; ordinary game clients never send it.
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
import { ensureExternalOpeningBookLoaded, getOpeningMoveImproved } from './OpeningBookImproved';
import { PonderController } from './ponderController';
import { computeRootPolicyRanks } from './rootPolicyRank';
import { ensureFrozenRootPolicyStudentLoaded } from './rootPolicyStudentRuntime';
import { buildPosition, type SerializedKyokumenImproved, type SerializedTeImproved } from './serializedPosition';
import { ShogiAIImprovedV20 } from './ShogiAIImprovedV20';
import type { HelperRequest, HelperResponse, MainThreadsInitMessage } from './smpProtocol';
import { EMPTY, FU, getKomashu, HI, isSelf, OU, SENTE, Te } from './types';
import {
  clearWasmTT,
  clearWasmRootPolicyRank,
  createWasmRootPolicyRankReceipt,
  enableSharedTT,
  getLastWasmSearchStats,
  isNnueEnabled,
  isNnueWeightsLoaded,
  isWasmEngineReady,
  loadNnueWeights,
  measureEmbeddedWasmRuntimeIdentity,
  NNUE_SCALE_K,
  publishSearchGeneration,
  setSearchGeneration,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from './wasmEngine';
import { Difficulty } from '../common/types';

export type { SerializedKyokumenImproved, SerializedTeImproved };

/** The engine route that produced a best-move response. */
export type ShogiAiWorkerSearchPath = 'book' | 'mate' | 'wasm' | 'worker-js';

/** The exact evaluator that produced a best-move response. */
export type ShogiAiWorkerEvaluationPath = 'nnue-wasm' | 'v3-wasm' | 'worker-js' | 'not-applicable';

export type ShogiAiNnueFetchStatus = 'pending' | 'loaded' | 'rejected' | 'unavailable';

export interface ShogiAiSha256Identity {
  readonly bytes: number;
  readonly sha256: string;
}

/**
 * Read-only browser/Worker evidence used by the post-selection parity gate.
 * Fields stay deliberately separate: a rejected fetch has no retained byte
 * identity, while successfully loaded weights can still be disabled for an
 * easy/V3 search.
 */
export interface ShogiAiEngineDiagnostics {
  readonly schema: 'shogi-ai-engine-diagnostics-v1';
  readonly nnue: {
    readonly fetchStatus: ShogiAiNnueFetchStatus;
    readonly fetchedWeights: ShogiAiSha256Identity | null;
    readonly loaded: boolean;
    readonly enabled: boolean;
  };
  readonly wasm: {
    readonly ready: boolean;
    readonly embedded: ShogiAiSha256Identity;
  };
  readonly lastSearch: {
    readonly requestId: number;
    readonly searchPath: ShogiAiWorkerSearchPath;
    readonly evaluationPath: ShogiAiWorkerEvaluationPath;
  } | null;
}

type WorkerRequest =
  | {
      type: 'bestMove';
      id: number;
      position: SerializedKyokumenImproved;
      difficulty: Difficulty;
      tesu: number;
      /** Exact same-build candidate/stable role switch. */
      student_enabled: boolean;
    }
  | { type: 'engineDiagnostics'; id: number }
  | { type: 'clearTT' }
  | { type: 'ponderControl'; action: 'suspend' | 'resume' }
  | MainThreadsInitMessage;

type WorkerResponse =
  | {
      type: 'bestMoveResult';
      id: number;
      move: SerializedTeImproved | null;
      /**
       * Optional search diagnostics (backward compatible — additive fields only;
       * old clients simply ignore them). `scoreCp` is the root score in
       * centipawns from SENTE's perspective (positive = Sente is better);
       * present only when the move came from a real search (or the mate
       * solver), never for opening-book moves. `depth` is the completed
       * iterative-deepening depth of that search.
       */
      scoreCp?: number;
      depth?: number;
      searchPath: ShogiAiWorkerSearchPath;
    }
  | {
      type: 'engineDiagnosticsResult';
      id: number;
      diagnostics: ShogiAiEngineDiagnostics;
    }
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
 * NNUE leaf evaluation (HalfKP81 production weights).
 *
 * The weights ship as a static asset
 * (public/shogi-halfkp81-production-weights.bin) and are
 * fetched asynchronously at worker startup — NOT bundled (base64 embedding
 * would add ~126MB to the worker bundle). Until the fetch resolves, searches
 * run on the hand-crafted V3 evaluation exactly as before (the first move
 * comes from the opening book anyway); once loaded, NNUE kicks in from the
 * next NNUE-gated search. Any failure (network, size mismatch, missing WASM)
 * silently keeps the V3 path.
 */
const NNUE_WEIGHTS_PATH = '/shogi-halfkp81-production-weights.bin';

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
 *   - Direct A/B vs the shipped run1m-base NNUE: 92.2% (29.5/32) at 1000ms.
 *   - vs V3 at 2000ms (the hard budget that was never verified before): 87.5%.
 * Verified directly at 1000ms and 2000ms. expert (4000ms) and master (5000ms)
 * are enabled by extrapolation: throughout cycles 2-3 NNUE's edge only widened
 * with more thinking time (deeper search rewards its move ordering), so a
 * budget >= 2000ms is expected to be at least as favorable — the author's own
 * play is the final check for those.
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
 * Retained for diagnostics and for the existing helper protocol. The
 * forwarding path keeps helper instances on the same authenticated HalfKP81
 * payload as the main worker.
 */
let nnueWeightsBytes: ArrayBuffer | null = null;
let nnueFetchStatus: ShogiAiNnueFetchStatus = 'pending';
let nnueFetchedWeightsIdentity: ShogiAiSha256Identity | null = null;
let nnueFetchedWeightsIdentityPromise: Promise<ShogiAiSha256Identity> | null = null;
let lastSearch: ShogiAiEngineDiagnostics['lastSearch'] = null;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
    nnueFetchStatus = ok ? 'loaded' : 'rejected';
    if (process.env.NODE_ENV === 'development') {
      console.info(
        ok
          ? `[shogi-ai.worker] NNUE weights loaded (${buf.byteLength} bytes, K=${NNUE_SCALE_K})`
          : '[shogi-ai.worker] NNUE weights rejected; using V3 evaluation'
      );
    }
  } catch (e) {
    nnueFetchStatus = 'unavailable';
    // Expected offline / in node tests; the V3 path is the normal fallback.
    if (process.env.NODE_ENV === 'development') {
      console.info('[shogi-ai.worker] NNUE weights unavailable; using V3 evaluation', e);
    }
  }
}
const nnueStartup = fetchNnueWeights();

async function engineDiagnostics(): Promise<ShogiAiEngineDiagnostics> {
  // Hashing the 94.7MB asset is opt-in: ordinary game startup/load behavior and cost are
  // unchanged. Successful loads already retain this exact buffer for helpers.
  if (!nnueFetchedWeightsIdentity && nnueWeightsBytes) {
    const acceptedWeights = nnueWeightsBytes;
    const identityPromise =
      nnueFetchedWeightsIdentityPromise ??
      (nnueFetchedWeightsIdentityPromise = sha256Hex(acceptedWeights).then((sha256) => ({
        bytes: acceptedWeights.byteLength,
        sha256,
      })));
    try {
      nnueFetchedWeightsIdentity = await identityPromise;
    } catch (identityError) {
      if (nnueFetchedWeightsIdentityPromise === identityPromise) {
        nnueFetchedWeightsIdentityPromise = null;
      }
      // Identity collection must never demote a playable engine. The explicit
      // null makes this request's parity gate fail closed while ordinary play
      // continues; clearing only this rejected promise lets a later explicit
      // diagnostic retry after a transient Web Crypto failure.
      if (process.env.NODE_ENV === 'development') {
        console.info('[shogi-ai.worker] NNUE SHA-256 unavailable for diagnostics', identityError);
      }
    }
  }
  return {
    schema: 'shogi-ai-engine-diagnostics-v1',
    nnue: {
      fetchStatus: nnueFetchStatus,
      fetchedWeights: nnueFetchedWeightsIdentity,
      loaded: isNnueWeightsLoaded(),
      enabled: isNnueEnabled(),
    },
    wasm: {
      ready: isWasmEngineReady(),
      embedded: await measureEmbeddedWasmRuntimeIdentity(),
    },
    lastSearch,
  };
}

/**
 * Large-scale opening book (public/shogi-opening-book-v3.bin), fetched with the same
 * static-asset pattern as the NNUE weights. Until it resolves, the compiled-in curated
 * book covers the first moves; on any failure the curated book keeps working alone.
 */
void ensureExternalOpeningBookLoaded();

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
let rootPolicySequenceCounter = 0;

function nextSmpGeneration(): number {
  // Skip 0 (idle marker) on wrap-around.
  smpGenCounter = (smpGenCounter + 1) | 0;
  if (smpGenCounter === 0) smpGenCounter = 1;
  return smpGenCounter;
}

function nextRootPolicySequence(): number {
  rootPolicySequenceCounter = (rootPolicySequenceCounter + 1) | 0;
  if (rootPolicySequenceCounter <= 0) rootPolicySequenceCounter = 1;
  return rootPolicySequenceCounter;
}

function sendNnueWeightsToHelpers(): void {
  if (!nnueWeightsBytes) return;
  for (const port of smpPorts) {
    const req: HelperRequest = {
      type: 'nnueWeights',
      bytes: nnueWeightsBytes,
      scaleK: NNUE_SCALE_K,
    };
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

/** computeBestMove result: the move plus optional search diagnostics (see WorkerResponse). */
interface BestMoveComputation {
  move: Te | null;
  /** Root score in centipawns from SENTE's perspective; absent for book moves. */
  scoreCp?: number;
  /** Completed search depth; absent when the producing route did not search. */
  depth?: number;
  /** The route that produced this result (including a null/no-legal-move result). */
  searchPath: ShogiAiWorkerSearchPath;
  /** Exact evaluator that produced the result; distinguishes NNUE from silent V3 fallback. */
  evaluationPath: ShogiAiWorkerEvaluationPath;
}

/** Sente-perspective mate score used when the dedicated mate solver finds a forced mate. */
const MATE_SCORE_CP = 30000;

/** Convert a score from `teban`'s perspective (negamax root) to SENTE's perspective. */
function toSenteCp(scoreForTeban: number, teban: number): number {
  return teban === SENTE ? scoreForTeban : -scoreForTeban;
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
  tesu: number,
  studentEnabled: boolean,
): BestMoveComputation {
  // 1) Opening book.
  const book = getOpeningMoveImproved(k, difficulty);
  if (book) return { move: book, searchPath: 'book', evaluationPath: 'not-applicable' };

  const budget = DIFFICULTY_BUDGETS[difficulty] ?? DIFFICULTY_BUDGETS.medium;

  // 2) Mate-solver probe.
  let searchBudgetMs = budget.maxTimeMs;
  if (shouldTryMateSolve(k)) {
    const mateStart = performance.now();
    const budgetMs = Math.max(30, Math.min(200, Math.floor(budget.maxTimeMs * 0.2)));
    const mate = mateSolver.solve(k, {
      maxPlies: 9,
      maxNodes: 150_000,
      maxTimeMs: budgetMs,
    });
    if (mate) {
      return {
        move: mate,
        scoreCp: toSenteCp(MATE_SCORE_CP, k.teban),
        searchPath: 'mate',
        evaluationPath: 'not-applicable',
      };
    }
    const spent = performance.now() - mateStart;
    searchBudgetMs = Math.max(Math.floor(budget.maxTimeMs / 2), budget.maxTimeMs - Math.ceil(spent));
  }

  // 3) WASM full search. NNUE per the difficulty gate — a no-op request that
  // stays on V3 while the weights are not (yet) loaded. Toggle the eval
  // BEFORE waking the helpers: a real switch clears the shared TT, and the
  // helpers must not be writing entries on the old eval scale meanwhile.
  const nnue = difficultyUsesNnue(difficulty);
  const nnueActuallyEnabled = setWasmNnueEnabled(nnue);
  // Student features are defined against the exact live NNUE child CP. A
  // requested candidate role without that evaluator is not a degraded model:
  // it is a typed fail-closed stable-order search with zero provider calls.
  const effectiveStudentEnabled = studentEnabled && nnueActuallyEnabled;

  // One inference boundary per enabled root, in the MAIN worker only. The
  // The lazily loaded frozen provider returns only integer ranks. Its receipt
  // is bound to both WASM position hashes and reused verbatim by all Lazy-SMP
  // helpers.
  const rankSequence = effectiveStudentEnabled ? nextRootPolicySequence() : 0;
  const computedRanks = effectiveStudentEnabled
    ? computeRootPolicyRanks(k, rankSequence, true, tesu)
    : null;
  const rootPolicyRank = computedRanks
    ? createWasmRootPolicyRankReceipt(k, rankSequence, computedRanks)
    : null;

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
      student_enabled: effectiveStudentEnabled,
      rootPolicyRank,
      difficulty,
    };
    for (const port of smpPorts) port.postMessage(go);
  }

  let wasmMove: Te | null = null;
  try {
    wasmMove = wasmSearchBestMove(
      k,
      tesu,
      searchBudgetMs,
      32,
      budget.quiescenceDepthMax,
      rootPolicyRank,
    );
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
  if (wasmMove) {
    // Attach root score/depth for the UI's eval bar / status display. Purely
    // diagnostic: any failure to read stats must never lose the move itself.
    const stats = getLastWasmSearchStats();
    if (stats) {
      return {
        move: wasmMove,
        scoreCp: toSenteCp(stats.score, k.teban),
        depth: stats.depth,
        searchPath: 'wasm',
        evaluationPath: nnueActuallyEnabled ? 'nnue-wasm' : 'v3-wasm',
      };
    }
    return {
      move: wasmMove,
      searchPath: 'wasm',
      evaluationPath: nnueActuallyEnabled ? 'nnue-wasm' : 'v3-wasm',
    };
  }

  // 4) JS V20 fallback (also the "no legal move" confirmation path: for a
  // genuinely mated position it returns null just like the WASM engine).
  const fallback = ai.getNextTeWithInfo(k, tesu, { difficulty });
  return {
    move: fallback.move,
    scoreCp: fallback.scoreCp === undefined ? undefined : toSenteCp(fallback.scoreCp, k.teban),
    depth: fallback.depth,
    searchPath: 'worker-js',
    evaluationPath: 'worker-js',
  };
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
  // A real-move rank is scoped to exactly one search. Pondering must always
  // use the unchanged stable root ordering.
  clearWasmRootPolicyRank();

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

  if (msg.type === 'engineDiagnostics') {
    // Wait until the startup fetch, byte hash, and load decision have settled.
    // This request is read-only and deliberately does not stop pondering.
    void nnueStartup.then(async () => {
      try {
        ctx.postMessage({
          type: 'engineDiagnosticsResult',
          id: msg.id,
          diagnostics: await engineDiagnostics(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.postMessage({ type: 'error', id: msg.id, message });
      }
    });
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

  const handleBestMove = async (): Promise<void> => {
    try {
      const requestedStudent = msg.student_enabled === true;
      const studentReady =
        requestedStudent && difficultyUsesNnue(msg.difficulty)
          ? await nnueStartup.then(() =>
              isNnueWeightsLoaded()
                ? ensureFrozenRootPolicyStudentLoaded()
                : false,
            )
          : false;
      const k = buildPosition(msg.position);
      const result = computeBestMove(
        k,
        msg.position,
        msg.difficulty,
        msg.tesu | 0,
        requestedStudent && studentReady,
      );
      const best = result.move;
      const move: SerializedTeImproved | null = best
        ? { koma: best.koma, from: best.from, to: best.to, promote: best.promote }
        : null;

      lastSearch = {
        requestId: msg.id,
        searchPath: result.searchPath,
        evaluationPath: result.evaluationPath,
      };
      ctx.postMessage({
        type: 'bestMoveResult',
        id: msg.id,
        move,
        scoreCp: result.scoreCp,
        depth: result.depth,
        searchPath: result.searchPath,
      });

      // Answer first, then start thinking on the opponent's time.
      if (best) startPonder(k, best, msg.difficulty, msg.tesu | 0);
    } catch (e) {
      clearWasmRootPolicyRank();
      const message = e instanceof Error ? e.message : String(e);
      ctx.postMessage({ type: 'error', id: msg.id, message });
    }
  };
  void handleBestMove();
};

/** Test-only handle: lets unit tests observe ponder state through the message protocol. */
export { ponder as __ponderControllerForTests };

export {};
