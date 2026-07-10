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
import type {
  SerializedKyokumenImproved,
  SerializedTeImproved,
  ShogiAiWorkerSearchPath,
} from './shogi-ai.worker';
import type { HelperInitMessage, MainThreadsInitMessage } from './smpProtocol';

type WorkerRequest =
  | { type: 'bestMove'; id: number; position: SerializedKyokumenImproved; difficulty: Difficulty; tesu: number }
  | { type: 'clearTT' }
  | { type: 'ponderControl'; action: 'suspend' | 'resume' }
  | MainThreadsInitMessage;

type WorkerResponse =
  | {
      type: 'bestMoveResult';
      id: number;
      move: SerializedTeImproved | null;
      scoreCp?: number;
      depth?: number;
      /** Optional here so an older/corrupt worker response safely becomes `unknown`. */
      searchPath?: ShogiAiWorkerSearchPath;
    }
  | { type: 'error'; id: number; message: string };

export type { SerializedKyokumenImproved, SerializedTeImproved };

/** Worker route observed by the page; `unknown` is the backward-compatible fallback. */
export type ShogiAiSearchPath = ShogiAiWorkerSearchPath | 'unknown';

/**
 * Best-move answer with optional search diagnostics. `scoreCp` is the root
 * score in centipawns from SENTE's perspective (positive = Sente better);
 * absent for opening-book moves. `depth` is the completed search depth when
 * the producing route ran iterative deepening.
 */
export interface BestMoveInfo {
  move: SerializedTeImproved | null;
  scoreCp?: number;
  depth?: number;
  searchPath: ShogiAiSearchPath;
}

const WORKER_SEARCH_PATHS: ReadonlySet<ShogiAiWorkerSearchPath> = new Set<ShogiAiWorkerSearchPath>([
  'book',
  'mate',
  'wasm',
  'worker-js',
]);

function normalizeSearchPath(value: unknown): ShogiAiSearchPath {
  return typeof value === 'string' && WORKER_SEARCH_PATHS.has(value as ShogiAiWorkerSearchPath)
    ? (value as ShogiAiWorkerSearchPath)
    : 'unknown';
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
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;
  return Math.min(4, Math.max(1, hc - 2));
}

/**
 * Per-difficulty hard wall-clock deadline for one best-move request. If the
 * worker has not answered by then it is treated as wedged: we terminate it (and
 * any SMP helpers), respawn a fresh SINGLE-THREAD worker, and reject the request
 * so the caller falls back to the main-thread search for that move. This
 * guarantees the UI can never stick on "AI Thinking..." — independent of the
 * cause. Deadlines sit well above the real search budget (master ~5s) yet far
 * below a hang a human would notice, so they never fire on legitimate play.
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
 *   /games/shogi route sends COOP/COEP headers; anywhere else the constructor
 *   simply does not exist).
 * - At least 2 usable threads on this machine.
 *
 * The client owns all `new Worker(new URL(...))` calls (bundler-statically
 * analyzable, no nested workers); each helper gets one end of a dedicated
 * MessageChannel and the main worker gets the other, so after this handshake
 * the search coordination never touches the UI thread.
 */
function trySpawnSmpHelpers(worker: Worker): Worker[] {
  try {
    const threads = computeSearchThreadCount();
    if (threads < 2) return [];
    const sab = createSharedTTBuffer();
    if (!sab) return [];

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
    return helpers;
  } catch (e) {
    console.info('[shogiAiWorkerClient] multi-thread setup failed; staying single-thread', e);
    return [];
  }
}

export function createShogiAiWorkerClient(): ShogiAiWorkerClient {
  // The worker (and its SMP helpers) are mutable: the self-heal paths (hard
  // deadline, worker onerror) tear a wedged/broken set down and respawn a fresh
  // single-thread worker.
  let worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), { type: 'module' });
  let helpers = trySpawnSmpHelpers(worker);
  let disposed = false;

  // Error-storm guard: if the worker keeps failing to boot/run, cap how many
  // times we respawn within a short window. After the cap we stop respawning
  // and let requests reject so the caller falls back to the main-thread search
  // permanently, instead of thrashing worker instances forever.
  const RESPAWN_WINDOW_MS = 60_000;
  const MAX_RESPAWNS_PER_WINDOW = 4;
  let respawnTimestamps: number[] = [];
  let respawnDisabled = false;

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
        p.resolve({
          move: msg.move,
          scoreCp: msg.scoreCp,
          depth: msg.depth,
          searchPath: normalizeSearchPath(msg.searchPath),
        });
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
      // A worker load/runtime error (bundler wraps the real one — keep it
      // short). Left unhandled this would leave the broken instance cached and
      // permanently demote every future move to the weaker main-thread JS
      // engine; self-heal by tearing it down and respawning single-thread, the
      // same recovery the hard deadline uses.
      const message = (event as ErrorEvent).message || 'Worker error';
      recoverWithSingleThread(`worker error: ${message}`);
    };
  };
  attachWorkerHandlers(worker);

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

  /**
   * Self-heal a wedged or broken worker so the UI never sticks and never gets
   * permanently demoted to the main-thread JS engine. Terminates the current
   * worker + helpers, rejects every pending request (the caller falls back to
   * the main-thread search for that move), and respawns a FRESH single-thread
   * worker (no SMP — the safest possible mode) for future moves.
   *
   * Guarded against error storms: if the worker keeps failing more than
   * MAX_RESPAWNS_PER_WINDOW times inside RESPAWN_WINDOW_MS we stop respawning
   * and leave `worker` torn down, so requests reject fast and the caller stays
   * on the main-thread engine instead of thrashing worker instances.
   */
  function recoverWithSingleThread(reason: string): void {
    if (disposed || respawnDisabled) return;

    // Tear down the current (broken/wedged) worker + helpers first so a fresh
    // onerror from the dying instance cannot re-enter this path.
    try {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      for (const h of helpers) h.terminate();
    } catch {
      /* terminate is best-effort */
    }
    helpers = [];
    rejectAll(new Error('AI worker failed'));

    const now = Date.now();
    respawnTimestamps = respawnTimestamps.filter((t) => now - t < RESPAWN_WINDOW_MS);
    if (respawnTimestamps.length >= MAX_RESPAWNS_PER_WINDOW) {
      respawnDisabled = true;
      console.error(
        `[shogiAiWorkerClient] AI worker keeps failing (${reason}); ` +
          'giving up on the worker — moves will use the main-thread engine'
      );
      return;
    }
    respawnTimestamps.push(now);
    console.warn(`[shogiAiWorkerClient] AI worker recovered (${reason}); respawning single-thread`);

    try {
      worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), { type: 'module' });
      // After any failure, favor the rock-solid single-thread path (no SMP).
      attachWorkerHandlers(worker);
      syncVisibility();
    } catch (e) {
      // Worker construction can itself be the unavailable operation. Do not
      // let that throw escape an error/timeout callback and strand a Promise.
      respawnDisabled = true;
      console.error(
        `[shogiAiWorkerClient] single-thread respawn failed (${reason}); ` +
          'moves will use the main-thread engine',
        e,
      );
    }
  }

  const requestBestMoveWithInfo = (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number
  ): Promise<BestMoveInfo> => {
    const id = nextId++;
    return new Promise<BestMoveInfo>((resolve, reject) => {
      // If the worker was permanently given up on (error storm), fail fast so
      // the caller uses the main-thread engine — do not touch a torn-down worker.
      if (respawnDisabled) {
        reject(new Error('AI worker unavailable'));
        return;
      }
      // Hard wall-clock deadline: if the worker has not answered by then it is
      // treated as wedged — tear it down, respawn single-thread, and reject so
      // the caller falls back to the main-thread search. The UI never sticks on
      // "AI Thinking..." regardless of the failure cause.
      const timer = setTimeout(() => {
        if (pending.delete(id)) {
          // Settle the caller first. Recovery is best-effort and may itself be
          // impossible when Worker construction is what the browser blocks.
          reject(new Error('AI worker timed out'));
          recoverWithSingleThread(`no response for id=${id} within ${hardDeadlineMs(difficulty)}ms`);
        }
      }, hardDeadlineMs(difficulty));
      pending.set(id, {
        resolve: (info) => { clearTimeout(timer); resolve(info); },
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
