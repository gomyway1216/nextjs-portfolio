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
  ShogiAiEngineDiagnostics,
  ShogiAiWorkerEvaluationPath,
  ShogiAiWorkerSearchPath,
} from './shogi-ai.worker';
import type { HelperInitMessage, MainThreadsInitMessage } from './smpProtocol';

type WorkerRequest =
  | {
      type: 'bestMove';
      id: number;
      position: SerializedKyokumenImproved;
      difficulty: Difficulty;
      tesu: number;
      /** Same-build role switch. The live client stays disabled until admission. */
      student_enabled: boolean;
      /**
       * Flat [primary, secondary, …] Zobrist pairs of every position played
       * before `position` (positionHistory.ts). Additive and optional: omitted
       * for callers that have no move list, and ignored by an older worker.
       */
      positionHistory?: number[];
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
      scoreCp?: number;
      depth?: number;
      /** Optional here so an older/corrupt worker response safely becomes `unknown`. */
      searchPath?: ShogiAiWorkerSearchPath;
    }
  | { type: 'engineDiagnosticsResult'; id: number; diagnostics?: unknown }
  // Unsolicited (no request id): the worker's terminal NNUE weights outcome.
  | ({ type: 'nnueWeightsStatus' } & Partial<ShogiAiNnueWeightsStatus>)
  | { type: 'error'; id: number; message: string };

/**
 * Terminal outcome of the worker's NNUE weights fetch.
 *
 * Reported so the page can record delivery failures. A 503 on the 94.7MB
 * weights asset silently demoted production to the hand-crafted V3 evaluation
 * on 2026-08-25 and nothing noticed; `status: 'unavailable'` is that event.
 */
export interface ShogiAiNnueWeightsStatus {
  status: 'pending' | 'loaded' | 'rejected' | 'unavailable';
  /** Whether the accepted bytes came from Cache Storage or the network. */
  source?: 'cache' | 'network';
  attempts: number;
  elapsedMs: number;
  bytes?: number;
  httpStatus?: number;
  errorMessage?: string;
}

export interface ShogiAiWorkerClientOptions {
  /**
   * Called once per worker instance when weights delivery reaches a terminal
   * state. Invoked again after a respawn (a fresh worker re-fetches).
   */
  onNnueWeightsStatus?: (status: ShogiAiNnueWeightsStatus) => void;
  /**
   * Called once, when the error-storm guard permanently gives up on the worker
   * and every later request will reject. That is the terminal state behind a
   * session stuck in 低速互換モード, and until now it was only a console.error.
   *
   * `difficulty` is the level of the most recent best-move request, i.e. the
   * search that was failing. It is reported from here rather than read by the
   * caller because one client serves a whole session across many games: a page
   * that captured its own `difficulty` when the client was built would log the
   * level of the first game, not the one that actually broke. Undefined only if
   * the client never received a best-move request (a worker that died on load).
   */
  onWorkerGaveUp?: (reason: string, difficulty?: Difficulty) => void;
}

export type { SerializedKyokumenImproved, SerializedTeImproved, ShogiAiEngineDiagnostics };

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

const WORKER_EVALUATION_PATHS: ReadonlySet<ShogiAiWorkerEvaluationPath> = new Set([
  'nnue-wasm',
  'v3-wasm',
  'worker-js',
  'not-applicable',
]);

function normalizeEvaluationPath(value: unknown): ShogiAiWorkerEvaluationPath | 'unknown' {
  return typeof value === 'string' && WORKER_EVALUATION_PATHS.has(value as ShogiAiWorkerEvaluationPath)
    ? (value as ShogiAiWorkerEvaluationPath)
    : 'unknown';
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const NNUE_FETCH_STATUSES = new Set(['pending', 'loaded', 'rejected', 'unavailable']);

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid AI engine diagnostics');
  }
  return value as Record<string, unknown>;
}

function sha256Identity(value: unknown): { bytes: number; sha256: string } {
  const identity = record(value);
  if (
    !Number.isSafeInteger(identity.bytes) ||
    (identity.bytes as number) <= 0 ||
    typeof identity.sha256 !== 'string' ||
    !SHA256_HEX.test(identity.sha256)
  ) {
    throw new Error('Invalid AI engine diagnostics identity');
  }
  return { bytes: identity.bytes as number, sha256: identity.sha256 };
}

function normalizeEngineDiagnostics(value: unknown): ShogiAiEngineDiagnostics {
  const diagnostics = record(value);
  const nnue = record(diagnostics.nnue);
  const wasm = record(diagnostics.wasm);
  if (
    diagnostics.schema !== 'shogi-ai-engine-diagnostics-v1' ||
    typeof nnue.fetchStatus !== 'string' ||
    !NNUE_FETCH_STATUSES.has(nnue.fetchStatus) ||
    typeof nnue.loaded !== 'boolean' ||
    typeof nnue.enabled !== 'boolean' ||
    typeof wasm.ready !== 'boolean'
  ) {
    throw new Error('Invalid AI engine diagnostics');
  }
  const fetchedWeights = nnue.fetchedWeights === null ? null : sha256Identity(nnue.fetchedWeights);
  const fetchLoaded = nnue.fetchStatus === 'loaded';
  if ((fetchedWeights !== null) !== fetchLoaded || nnue.loaded !== fetchLoaded || (nnue.enabled && !nnue.loaded)) {
    throw new Error('Invalid AI engine diagnostics NNUE state');
  }
  const lastSearchRecord = diagnostics.lastSearch === null ? null : record(diagnostics.lastSearch);
  const lastSearchPath = lastSearchRecord ? normalizeSearchPath(lastSearchRecord.searchPath) : null;
  const lastEvaluationPath = lastSearchRecord ? normalizeEvaluationPath(lastSearchRecord.evaluationPath) : null;
  if (
    lastSearchRecord &&
    (!Number.isSafeInteger(lastSearchRecord.requestId) ||
      (lastSearchRecord.requestId as number) <= 0 ||
      lastSearchPath === 'unknown' ||
      lastEvaluationPath === 'unknown')
  ) {
    throw new Error('Invalid AI engine diagnostics last search');
  }
  return {
    schema: 'shogi-ai-engine-diagnostics-v1',
    nnue: {
      fetchStatus: nnue.fetchStatus as ShogiAiEngineDiagnostics['nnue']['fetchStatus'],
      fetchedWeights,
      loaded: nnue.loaded,
      enabled: nnue.enabled,
    },
    wasm: {
      ready: wasm.ready,
      embedded: sha256Identity(wasm.embedded),
    },
    lastSearch: lastSearchRecord
      ? {
          requestId: lastSearchRecord.requestId as number,
          searchPath: lastSearchPath as ShogiAiWorkerSearchPath,
          evaluationPath: lastEvaluationPath as ShogiAiWorkerEvaluationPath,
        }
      : null,
  };
}

export interface ShogiAiWorkerClient {
  requestBestMove: (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number,
    positionHistory?: readonly number[]
  ) => Promise<SerializedTeImproved | null>;
  /** Like requestBestMove, but also surfaces the worker's score/depth diagnostics. */
  requestBestMoveWithInfo: (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number,
    positionHistory?: readonly number[]
  ) => Promise<BestMoveInfo>;
  /** Read-only identity/load-state evidence for explicit parity diagnostics. */
  requestEngineDiagnostics: () => Promise<ShogiAiEngineDiagnostics>;
  clearTT: () => void;
  terminate: () => void;
}

/**
 * Total search threads (1 main + N helpers) for Lazy SMP: keep 2 cores free
 * for the UI/OS, cap at 4 (diminishing returns beyond that for this engine).
 * 1 means multi-threading is not worth it on this machine.
 */
function computeSearchThreadCount(): number {
  // The 81-bucket payload uses about 151MB of private WASM memory per
  // instance and a 94.7MB source buffer. Keep the single-instance topology
  // instead of cloning it to helpers.
  return 1;
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
const ENGINE_DIAGNOSTICS_DEADLINE_MS = 15_000;

/**
 * Extra allowance for the FIRST request answered by a given worker instance.
 *
 * A fresh Worker has to download and evaluate its module bundle and instantiate
 * the WASM engine before it can start searching, and that cost lands entirely on
 * whichever request happens to be first. Measured against production on
 * 2026-08-25: a warm-chunk worker answered a master request in 5.03-5.06s, but
 * the same request on a cold page load took 7.61s — 2.5s of pure startup
 * charged against a 14s deadline whose search alone is budgeted 5s. On a slower
 * link or a loaded machine that margin runs out and a perfectly healthy worker
 * is torn down as "wedged", which permanently demotes the move to the
 * main-thread engine.
 *
 * Startup is not thinking time, so it gets its own allowance. Once the instance
 * has produced any message at all it is proven warm and only the search deadline
 * applies.
 */
const WORKER_STARTUP_GRACE_MS = 10_000;

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
        const init: HelperInitMessage = {
          type: 'smpInit',
          port: channel.port1,
          sab,
          helperId,
        };
        helper.postMessage(init, [channel.port1]);
        mainPorts.push(channel.port2);
      }
    } catch (e) {
      // e.g. Worker construction rejected — tear down anything half-built.
      for (const helper of helpers) helper.terminate();
      console.info('[shogiAiWorkerClient] helper spawn failed; staying single-thread', e);
      return [];
    }

    const init: MainThreadsInitMessage = {
      type: 'smpThreads',
      sab,
      ports: mainPorts,
    };
    worker.postMessage(init, mainPorts);
    return helpers;
  } catch (e) {
    console.info('[shogiAiWorkerClient] multi-thread setup failed; staying single-thread', e);
    return [];
  }
}

export function createShogiAiWorkerClient(
  options: ShogiAiWorkerClientOptions = {}
): ShogiAiWorkerClient {
  // The worker (and its SMP helpers) are mutable: the self-heal paths (hard
  // deadline, worker onerror) tear a wedged/broken set down and respawn a fresh
  // single-thread worker.
  let worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), {
    type: 'module',
  });
  let helpers = trySpawnSmpHelpers(worker);
  let disposed = false;
  // False until the current worker instance has said anything at all, i.e.
  // until its module has loaded and it is executing. Cleared on every respawn,
  // because a fresh instance pays the startup cost all over again.
  let workerProven = false;
  // The level of the most recent best-move request, so a terminal failure is
  // attributed to the search that was actually failing.
  let lastRequestedDifficulty: Difficulty | undefined;

  // Error-storm guard: if the worker keeps failing to boot/run, cap how many
  // times we respawn within a short window. After the cap we stop respawning
  // and let requests reject so the caller falls back to the main-thread search
  // permanently, instead of thrashing worker instances forever.
  const RESPAWN_WINDOW_MS = 60_000;
  const MAX_RESPAWNS_PER_WINDOW = 4;
  let respawnTimestamps: number[] = [];
  let respawnDisabled = false;

  let nextId = 1;
  const pending = new Map<number, { resolve: (info: BestMoveInfo) => void; reject: (err: Error) => void }>();
  const pendingDiagnostics = new Map<
    number,
    {
      resolve: (diagnostics: ShogiAiEngineDiagnostics) => void;
      reject: (err: Error) => void;
    }
  >();

  const rejectAll = (err: Error) => {
    const entries = [...pending.values()];
    const diagnosticEntries = [...pendingDiagnostics.values()];
    pending.clear();
    pendingDiagnostics.clear();
    for (const p of entries) p.reject(err);
    for (const p of diagnosticEntries) p.reject(err);
  };

  // Wire the message/error handlers onto whatever worker is current, so a
  // respawned worker is handled identically.
  const attachWorkerHandlers = (w: Worker): void => {
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
      // Anything at all from this instance proves it booted and is running.
      workerProven = true;

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

      if (msg.type === 'nnueWeightsStatus') {
        // Observability only — never allowed to disturb play.
        try {
          if (typeof msg.status === 'string' && NNUE_FETCH_STATUSES.has(msg.status)) {
            options.onNnueWeightsStatus?.({
              status: msg.status,
              source: msg.source === 'cache' || msg.source === 'network' ? msg.source : undefined,
              attempts: typeof msg.attempts === 'number' ? msg.attempts : 0,
              elapsedMs: typeof msg.elapsedMs === 'number' ? msg.elapsedMs : 0,
              bytes: typeof msg.bytes === 'number' ? msg.bytes : undefined,
              httpStatus: typeof msg.httpStatus === 'number' ? msg.httpStatus : undefined,
              errorMessage:
                typeof msg.errorMessage === 'string' ? msg.errorMessage : undefined,
            });
          }
        } catch {
          /* a broken listener must not break the engine */
        }
        return;
      }

      if (msg.type === 'engineDiagnosticsResult') {
        const p = pendingDiagnostics.get(msg.id);
        if (!p) return;
        pendingDiagnostics.delete(msg.id);
        try {
          p.resolve(normalizeEngineDiagnostics(msg.diagnostics));
        } catch (error) {
          p.reject(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }

      if (msg.type === 'error') {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          p.reject(new Error(msg.message));
          return;
        }
        const diagnostic = pendingDiagnostics.get(msg.id);
        if (diagnostic) {
          pendingDiagnostics.delete(msg.id);
          diagnostic.reject(new Error(msg.message));
        }
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
  // MUST stay in the same synchronous block as `new Worker(...)` above.
  // `nnueWeightsStatus` is unsolicited, so a handler attached after any `await`
  // could miss it and lose the delivery-failure log this client exists to
  // emit. This function is deliberately NOT async: control cannot reach the
  // event loop between construction and here, and message events are only
  // dispatched as event-loop tasks. Pinned by "attaches the message handler
  // before returning" in shogiAiWorkerClient.test.ts.
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
   * Announce the terminal give-up exactly once. A listener that throws must not
   * turn an already-degraded engine into a broken one.
   */
  let gaveUpReported = false;
  function reportGaveUp(reason: string): void {
    if (gaveUpReported) return;
    gaveUpReported = true;
    try {
      options.onWorkerGaveUp?.(reason, lastRequestedDifficulty);
    } catch {
      /* a broken listener must not break the fallback path */
    }
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
    rejectAll(new Error(`AI worker failed: ${reason}`));

    const now = Date.now();
    respawnTimestamps = respawnTimestamps.filter((t) => now - t < RESPAWN_WINDOW_MS);
    if (respawnTimestamps.length >= MAX_RESPAWNS_PER_WINDOW) {
      respawnDisabled = true;
      console.error(
        `[shogiAiWorkerClient] AI worker keeps failing (${reason}); ` +
          'giving up on the worker — moves will use the main-thread engine'
      );
      reportGaveUp(`respawn cap reached (${reason})`);
      return;
    }
    respawnTimestamps.push(now);
    console.warn(`[shogiAiWorkerClient] AI worker recovered (${reason}); respawning single-thread`);

    try {
      worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), {
        type: 'module',
      });
      // The replacement instance has to boot from scratch, so its first request
      // gets the startup allowance again.
      workerProven = false;
      // After any failure, favor the rock-solid single-thread path (no SMP).
      attachWorkerHandlers(worker);
      syncVisibility();
    } catch (e) {
      // Worker construction can itself be the unavailable operation. Do not
      // let that throw escape an error/timeout callback and strand a Promise.
      respawnDisabled = true;
      console.error(
        `[shogiAiWorkerClient] single-thread respawn failed (${reason}); ` + 'moves will use the main-thread engine',
        e
      );
      reportGaveUp(`respawn threw (${reason}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const requestBestMoveWithInfo = (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number,
    positionHistory?: readonly number[]
  ): Promise<BestMoveInfo> => {
    const id = nextId++;
    return new Promise<BestMoveInfo>((resolve, reject) => {
      // If the worker was permanently given up on (error storm), fail fast so
      // the caller uses the main-thread engine — do not touch a torn-down worker.
      if (respawnDisabled) {
        reject(new Error('AI worker unavailable (worker permanently disabled)'));
        return;
      }
      // Remember what this search was playing at, so a later terminal give-up
      // names the level that was actually failing rather than whatever the page
      // happened to be showing when this long-lived client was built.
      lastRequestedDifficulty = difficulty;
      // Hard wall-clock deadline: if the worker has not answered by then it is
      // treated as wedged — tear it down, respawn single-thread, and reject so
      // the caller falls back to the main-thread search. The UI never sticks on
      // "AI Thinking..." regardless of the failure cause.
      //
      // An unproven instance is still booting, and boot time is not think time
      // (see WORKER_STARTUP_GRACE_MS), so it gets the startup allowance on top.
      const cold = !workerProven;
      const deadlineMs = hardDeadlineMs(difficulty) + (cold ? WORKER_STARTUP_GRACE_MS : 0);
      const timer = setTimeout(() => {
        if (pending.delete(id)) {
          // Settle the caller first. Recovery is best-effort and may itself be
          // impossible when Worker construction is what the browser blocks.
          // The message names the exact deadline that fired and whether the
          // worker had ever spoken, so the page's log can tell a wedged search
          // apart from a worker that never booted.
          reject(
            new Error(
              `AI worker timed out after ${deadlineMs}ms ` +
                `(${cold ? 'never responded since spawn' : 'warm instance'}, difficulty=${difficulty})`
            )
          );
          recoverWithSingleThread(`no response for id=${id} within ${deadlineMs}ms`);
        }
      }, deadlineMs);
      pending.set(id, {
        resolve: (info) => {
          clearTimeout(timer);
          resolve(info);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      try {
        const req: WorkerRequest = {
          type: 'bestMove',
          id,
          position,
          difficulty,
          tesu: tesu | 0,
          student_enabled: false,
          ...(positionHistory && positionHistory.length > 0
            ? { positionHistory: [...positionHistory] }
            : {}),
        };
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

  const requestEngineDiagnostics = (): Promise<ShogiAiEngineDiagnostics> => {
    const id = nextId++;
    return new Promise<ShogiAiEngineDiagnostics>((resolve, reject) => {
      if (respawnDisabled) {
        reject(new Error('AI worker unavailable (worker permanently disabled)'));
        return;
      }
      const timer = setTimeout(() => {
        if (pendingDiagnostics.delete(id)) {
          // A slow asset fetch should fail this explicit diagnostic without
          // disrupting an otherwise playable worker or its ponder session.
          reject(new Error('AI worker diagnostics timed out'));
        }
      }, ENGINE_DIAGNOSTICS_DEADLINE_MS);
      pendingDiagnostics.set(id, {
        resolve: (diagnostics) => {
          clearTimeout(timer);
          resolve(diagnostics);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        worker.postMessage({ type: 'engineDiagnostics', id } as WorkerRequest);
      } catch (error) {
        clearTimeout(timer);
        pendingDiagnostics.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  return {
    requestBestMove(
      position: SerializedKyokumenImproved,
      difficulty: Difficulty,
      tesu: number,
      positionHistory?: readonly number[]
    ) {
      return requestBestMoveWithInfo(position, difficulty, tesu, positionHistory).then(
        (info) => info.move
      );
    },
    requestBestMoveWithInfo,
    requestEngineDiagnostics,
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
      rejectAll(new Error('AI worker terminated'));
      worker.terminate();
      for (const helper of helpers) helper.terminate();
    },
  };
}
