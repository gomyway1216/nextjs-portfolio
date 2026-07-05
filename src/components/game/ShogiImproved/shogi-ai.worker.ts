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
import { ShogiAIImprovedV20 } from './ShogiAIImprovedV20';
import { EMPTY, FU, getKomashu, HI, isSelf, OU, SENTE, Te } from './types';
import { clearWasmTT, isWasmEngineReady, loadNnueWeights, setWasmNnueEnabled, wasmSearchBestMove } from './wasmEngine';
import { Difficulty } from '../common/types';

export type SerializedKyokumenImproved = {
  /**
   * 81 squares (suji 1..9, dan 1..9), in (suji-major, then dan) order:
   * index = (suji-1)*9 + (dan-1)
   */
  board: number[];
  /**
   * Hand piece counts indexed by piece code.
   * This can be longer than the engine's internal `hand[]`; only overlapping indices are copied.
   */
  hand: number[];
  /** Side to move (SENTE or GOTE). */
  teban: number;
};

export type SerializedTeImproved = {
  koma: number;
  from: number;
  to: number;
  promote: boolean;
};

type WorkerRequest =
  | { type: 'bestMove'; id: number; position: SerializedKyokumenImproved; difficulty: Difficulty; tesu: number }
  | { type: 'clearTT' }
  | { type: 'ponderControl'; action: 'suspend' | 'resume' };

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
const NNUE_WEIGHTS_URL = '/shogi-nnue-weights.bin';
/** k_sigmoid from ml/runs/run1m-base/weights.meta.json (cp = out_q * K / 8128). */
const NNUE_SCALE_K = 600;

/**
 * Difficulties that use the NNUE evaluation (>= 1000ms/move, where it measured
 * 77.1% vs V3). `easy` (250ms) intentionally stays on V3: at ~200ms budgets
 * V3 measured stronger (NNUE 40.9%), and easy is meant to be weak anyway.
 */
const NNUE_DIFFICULTIES: ReadonlySet<Difficulty> = new Set(['medium', 'hard', 'expert', 'master']);

function difficultyUsesNnue(difficulty: Difficulty): boolean {
  return NNUE_DIFFICULTIES.has(difficulty);
}

async function fetchNnueWeights(): Promise<void> {
  try {
    const res = await fetch(NNUE_WEIGHTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const ok = loadNnueWeights(new Uint8Array(buf), NNUE_SCALE_K);
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

function buildPosition(pos: SerializedKyokumenImproved): KyokumenImproved {
  const k = new KyokumenImproved();

  // Board (only the playable 9x9; constructor already set WALLs elsewhere)
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      k.ban[(suji << 4) + dan] = pos.board[idx++] ?? 0;
    }
  }

  // Hands (count-based)
  const limit = Math.min(k.hand.length, pos.hand.length);
  for (let i = 0; i < limit; i++) {
    k.hand[i] = pos.hand[i] | 0;
  }

  // Side to move and incremental state (eval / king positions / hash)
  k.teban = pos.teban;
  k.initAll();
  return k;
}

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
 */
function computeBestMove(k: KyokumenImproved, difficulty: Difficulty, tesu: number): Te | null {
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
  // stays on V3 while the weights are not (yet) loaded.
  setWasmNnueEnabled(difficultyUsesNnue(difficulty));
  const wasmMove = wasmSearchBestMove(k, tesu, searchBudgetMs, 32, budget.quiescenceDepthMax);
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
  ponder.start((sliceMs) => {
    // Returns null when the human is already mated/stalemated (or the engine
    // tripped) — stop the session instead of spinning on empty slices.
    return wasmSearchBestMove(k, ponderTesu, sliceMs, 32, budget.quiescenceDepthMax) !== null;
  });
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

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
    clearWasmTT();
    return;
  }

  if (msg.type !== 'bestMove') return;

  try {
    const k = buildPosition(msg.position);
    const best = computeBestMove(k, msg.difficulty, msg.tesu | 0);
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
