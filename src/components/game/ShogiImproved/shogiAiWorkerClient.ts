/**
 * Client wrapper for `shogi-ai.worker.ts`.
 *
 * This keeps Worker usage contained in a small module so components can:
 * - request a best move with a Promise API
 * - reuse a single worker instance across moves (fast, TT persists)
 * - terminate cleanly on unmount
 *
 * Pondering: after each bestMove response the worker keeps searching on the
 * human's time to warm its transposition table (see shogi-ai.worker.ts). That
 * needs no calls from components — the only client-side responsibility is to
 * suspend it while the page is hidden (workers cannot observe
 * `visibilitychange` themselves), which this wrapper does automatically.
 */

import { Difficulty } from '../common/types';
import { createSharedTTBuffer } from './sharedTT';
import type { SerializedKyokumenImproved, SerializedTeImproved } from './shogi-ai.worker';
import type { HelperInitMessage, MainThreadsInitMessage } from './smpProtocol';

type WorkerRequest =
  | { type: 'bestMove'; id: number; position: SerializedKyokumenImproved; difficulty: Difficulty; tesu: number }
  | { type: 'clearTT' }
  | { type: 'ponderControl'; action: 'suspend' | 'resume' }
  | MainThreadsInitMessage;

type WorkerResponse =
  | { type: 'bestMoveResult'; id: number; move: SerializedTeImproved | null; scoreCp?: number; depth?: number }
  | { type: 'error'; id: number; message: string };

export type { SerializedKyokumenImproved, SerializedTeImproved };

/**
 * Best-move answer with optional search diagnostics. `scoreCp` is the root
 * score in centipawns from SENTE's perspective (positive = Sente better);
 * absent for opening-book moves and the JS fallback path. `depth` is the
 * completed search depth when a WASM search ran.
 */
export interface BestMoveInfo {
  move: SerializedTeImproved | null;
  scoreCp?: number;
  depth?: number;
}

export interface ShogiAiWorkerClient {
  requestBestMove: (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number
  ) => Promise<SerializedTeImproved | null>;
  /** Like requestBestMove, but also surfaces the worker's score/depth diagnostics. */
  requestBestMoveWithInfo: (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number
  ) => Promise<BestMoveInfo>;
  clearTT: () => void;
  terminate: () => void;
}

/**
 * Total search threads (1 main + N helpers) for Lazy SMP: keep 2 cores free
 * for the UI/OS, cap at 4 (diminishing returns beyond that for this engine).
 * 1 means multi-threading is not worth it on this machine.
 */
function computeSearchThreadCount(): number {
  // TEMP (freeze-repro): allow forcing the thread count via ?smpthreads=N so a
  // Playwright driver can bisect the freeze (1 = single-thread-but-isolated,
  // 2 = main + 1 helper, ...). Inert without the query param. Removed with the
  // freeze-proofing follow-up.
  if (typeof window !== 'undefined') {
    const forced = new URLSearchParams(window.location.search).get('smpthreads');
    if (forced !== null) {
      const n = parseInt(forced, 10);
      if (Number.isFinite(n) && n >= 1) return Math.min(8, n);
    }
  }
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;
  return Math.min(4, Math.max(1, hc - 2));
}

/** Dev-only [SMP] tracing; production stays quiet (a per-move log line is noise). */
const SMP_TRACE = process.env.NODE_ENV === 'development';
function smpClientLog(...args: unknown[]): void {
  if (SMP_TRACE) console.info('[SMP][client]', ...args);
}

/**
 * Per-difficulty hard wall-clock deadline for one best-move request (gate: the
 * UI must never stick on "AI Thinking..."). Well above the real search budget
 * (master ~5s) yet far below the old 20s watchdog, so a genuinely wedged worker
 * is torn down and replaced within a few seconds instead of freezing the game.
 * When it fires we terminate the (possibly-wedged) worker + helpers, respawn a
 * fresh SINGLE-THREAD worker, and reject the request so the caller falls back
 * to the main-thread search for that move. This is defense-in-depth: the actual
 * historical freeze (COEP-blocked worker chunks) is fixed at the header level,
 * but this guarantees no future non-response can ever hang the UI.
 */
const HARD_DEADLINE_MS: Record<Difficulty, number> = {
  easy: 4_000,
  medium: 6_000,
  hard: 9_000,
  expert: 12_000,
  master: 14_000,
};
function hardDeadlineMs(difficulty: Difficulty): number {
  return HARD_DEADLINE_MS[difficulty] ?? HARD_DEADLINE_MS.hard;
}

/**
 * Spawn the Lazy SMP helper workers and wire them to the main AI worker.
 *
 * Requirements (any missing → return [] and the game runs exactly as the
 * previous single-thread build):
 * - SharedArrayBuffer available == the page is cross-origin isolated (the
 *   /games/shogi-improved route sends COOP/COEP headers; anywhere else the
 *   constructor simply does not exist).
 * - At least 2 usable threads on this machine.
 *
 * The client owns all `new Worker(new URL(...))` calls (bundler-statically
 * analyzable, no nested workers); each helper gets one end of a dedicated
 * MessageChannel and the main worker gets the other, so after this handshake
 * the search coordination never touches the UI thread.
 */
function trySpawnSmpHelpers(worker: Worker): Worker[] {
  try {
    const isolated =
      typeof globalThis !== 'undefined' && 'crossOriginIsolated' in globalThis
        ? (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
        : undefined;
    const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
    const threads = computeSearchThreadCount();
    smpClientLog(
      `spawn check: crossOriginIsolated=${isolated} hardwareConcurrency=${hc} ` +
        `-> searchThreads=${threads} SAB=${typeof SharedArrayBuffer !== 'undefined'}`
    );
    if (threads < 2) {
      smpClientLog('staying single-thread (threads < 2)');
      return [];
    }
    const sab = createSharedTTBuffer();
    if (!sab) {
      smpClientLog('staying single-thread (SharedArrayBuffer unavailable — not cross-origin isolated?)');
      return [];
    }

    const helpers: Worker[] = [];
    const mainPorts: MessagePort[] = [];
    try {
      for (let helperId = 0; helperId < threads - 1; helperId++) {
        const helper = new Worker(new URL('./shogi-ai-helper.worker.ts', import.meta.url), {
          type: 'module',
        });
        helpers.push(helper);
        const channel = new MessageChannel();
        const init: HelperInitMessage = { type: 'smpInit', port: channel.port1, sab, helperId };
        helper.postMessage(init, [channel.port1]);
        mainPorts.push(channel.port2);
      }
    } catch (e) {
      // e.g. Worker construction rejected — tear down anything half-built.
      for (const helper of helpers) helper.terminate();
      console.info('[shogiAiWorkerClient] helper spawn failed; staying single-thread', e);
      return [];
    }

    const init: MainThreadsInitMessage = { type: 'smpThreads', sab, ports: mainPorts };
    worker.postMessage(init, mainPorts);
    smpClientLog(`Lazy SMP spawned: ${helpers.length} helper worker(s) + main; SMP is ON`);
    return helpers;
  } catch (e) {
    console.error('[SMP][client] multi-thread setup failed; staying single-thread', e);
    return [];
  }
}

export function createShogiAiWorkerClient(): ShogiAiWorkerClient {
  // The worker (and its SMP helpers) are mutable: the hard-deadline fallback
  // tears a wedged set down and respawns a fresh single-thread worker.
  let worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), { type: 'module' });
  let helpers = trySpawnSmpHelpers(worker);
  let disposed = false;

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (info: BestMoveInfo) => void; reject: (err: Error) => void }
  >();

  const rejectAll = (err: Error) => {
    const entries = [...pending.values()];
    pending.clear();
    for (const p of entries) p.reject(err);
  };

  // Wire the message/error handlers onto whatever worker is current, so a
  // respawned worker is handled identically.
  const attachWorkerHandlers = (w: Worker): void => {
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

      if (msg.type === 'bestMoveResult') {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        p.resolve({ move: msg.move, scoreCp: msg.scoreCp, depth: msg.depth });
        return;
      }

      if (msg.type === 'error') {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    };
    w.onerror = (event) => {
      // Webpack/Turbopack wraps the real error; keep the message short.
      rejectAll(new Error((event as ErrorEvent).message || 'Worker error'));
    };
  };
  attachWorkerHandlers(worker);

  /**
   * Gate: guarantee the UI never sticks. Terminate the current worker + helpers
   * (they may be wedged and unresponsive), reject every pending request so the
   * caller falls back to the main-thread search, and respawn a FRESH
   * single-thread worker (no SMP — the safest possible mode) for future moves.
   */
  const respawnSingleThread = (reason: string): void => {
    if (disposed) return;
    console.warn(`[shogiAiWorkerClient] AI worker unresponsive (${reason}); terminating and respawning single-thread`);
    try {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      for (const h of helpers) h.terminate();
    } catch {
      /* terminate is best-effort */
    }
    rejectAll(new Error('AI worker timed out'));
    // Fresh worker, deliberately WITHOUT SMP helpers: after a stall we favor the
    // rock-solid single-thread path over re-arming the parallel machinery.
    worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), { type: 'module' });
    helpers = [];
    attachWorkerHandlers(worker);
    // Re-sync ponder suspend state for the current visibility.
    syncVisibility();
  };

  // Pause pondering while the tab is hidden (battery/CPU): the worker cannot
  // see page visibility, so relay it. Requests keep working while suspended —
  // only the opponent-time search is paused.
  const syncVisibility = () => {
    if (typeof document === 'undefined') return;
    const req: WorkerRequest = {
      type: 'ponderControl',
      action: document.visibilityState === 'hidden' ? 'suspend' : 'resume',
    };
    try {
      worker.postMessage(req);
    } catch {
      /* worker may be mid-respawn */
    }
  };
  const onVisibilityChange = () => syncVisibility();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Sync the initial state: if the page is already hidden when the client is
    // created (e.g. a background tab), no event fires until the next toggle.
    onVisibilityChange();
  }

  const requestBestMoveWithInfo = (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number
  ): Promise<BestMoveInfo> => {
    const id = nextId++;
    return new Promise<BestMoveInfo>((resolve, reject) => {
      const t0 = performance.now();
      smpClientLog(`request START id=${id} difficulty=${difficulty} tesu=${tesu}`);

      // Hard wall-clock deadline: if the worker has not answered by then it is
      // treated as wedged — tear it down, respawn single-thread, and reject so
      // the caller falls back to the main-thread search. Shorter than any freeze
      // the user would perceive as a hang.
      const deadline = hardDeadlineMs(difficulty);
      const timer = setTimeout(() => {
        if (pending.delete(id)) {
          respawnSingleThread(`no response for id=${id} within ${deadline}ms`);
          reject(new Error('AI worker timed out'));
        }
      }, deadline);
      pending.set(id, {
        resolve: (info) => {
          clearTimeout(timer);
          smpClientLog(`request END id=${id} elapsed=${(performance.now() - t0).toFixed(0)}ms depth=${info.depth ?? '?'}`);
          resolve(info);
        },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      try {
        const req: WorkerRequest = { type: 'bestMove', id, position, difficulty, tesu: tesu | 0 };
        worker.postMessage(req);
      } catch (err) {
        // postMessage can throw (worker already terminated, DataCloneError,
        // …). Clean up so the request doesn't linger in `pending` with a live
        // deadline timer; the caller then falls back to the main-thread search.
        clearTimeout(timer);
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  };

  return {
    requestBestMove(position: SerializedKyokumenImproved, difficulty: Difficulty, tesu: number) {
      return requestBestMoveWithInfo(position, difficulty, tesu).then((info) => info.move);
    },
    requestBestMoveWithInfo,
    clearTT() {
      try {
        worker.postMessage({ type: 'clearTT' } as WorkerRequest);
      } catch {
        /* worker may be mid-respawn */
      }
    },
    terminate() {
      disposed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      rejectAll(new Error('Worker terminated'));
      worker.terminate();
      for (const helper of helpers) helper.terminate();
    },
  };
}
