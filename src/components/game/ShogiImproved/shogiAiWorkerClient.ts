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
  | { type: 'bestMoveResult'; id: number; move: SerializedTeImproved | null }
  | { type: 'error'; id: number; message: string };

export type { SerializedKyokumenImproved, SerializedTeImproved };

export interface ShogiAiWorkerClient {
  requestBestMove: (
    position: SerializedKyokumenImproved,
    difficulty: Difficulty,
    tesu: number
  ) => Promise<SerializedTeImproved | null>;
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
  const worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), { type: 'module' });
  const helpers = trySpawnSmpHelpers(worker);

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (move: SerializedTeImproved | null) => void; reject: (err: Error) => void }
  >();

  const rejectAll = (err: Error) => {
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  };

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

    if (msg.type === 'bestMoveResult') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      p.resolve(msg.move);
      return;
    }

    if (msg.type === 'error') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  };

  worker.onerror = (event) => {
    // Webpack/Turbopack wraps the real error; keep the message short.
    rejectAll(new Error((event as ErrorEvent).message || 'Worker error'));
  };

  // Pause pondering while the tab is hidden (battery/CPU): the worker cannot
  // see page visibility, so relay it. Requests keep working while suspended —
  // only the opponent-time search is paused.
  const onVisibilityChange = () => {
    const req: WorkerRequest = {
      type: 'ponderControl',
      action: document.visibilityState === 'hidden' ? 'suspend' : 'resume',
    };
    worker.postMessage(req);
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Sync the initial state: if the page is already hidden when the client is
    // created (e.g. a background tab), no event fires until the next toggle.
    onVisibilityChange();
  }

  return {
    requestBestMove(position: SerializedKyokumenImproved, difficulty: Difficulty, tesu: number) {
      const id = nextId++;
      return new Promise<SerializedTeImproved | null>((resolve, reject) => {
        // Watchdog: if the worker never answers (an internal search hang), reject
        // after a generous timeout so the UI never sticks on "AI Thinking..."
        // forever — the caller then falls back to the main-thread search. 20s is
        // far above any real search budget (master ~5s), so it only fires on a
        // genuine hang, never on legitimate play.
        const timer = setTimeout(() => {
          if (pending.delete(id)) {
            reject(new Error('AI worker timed out'));
          }
        }, 20000);
        pending.set(id, {
          resolve: (move) => { clearTimeout(timer); resolve(move); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        });
        try {
          const req: WorkerRequest = { type: 'bestMove', id, position, difficulty, tesu: tesu | 0 };
          worker.postMessage(req);
        } catch (err) {
          // postMessage can throw (worker already terminated, DataCloneError,
          // …). Clean up so the request doesn't linger in `pending` with a live
          // watchdog timer; the caller then falls back to the main-thread search.
          clearTimeout(timer);
          pending.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    clearTT() {
      const req: WorkerRequest = { type: 'clearTT' };
      worker.postMessage(req);
    },
    terminate() {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      rejectAll(new Error('Worker terminated'));
      worker.terminate();
      for (const helper of helpers) helper.terminate();
    },
  };
}
