/**
 * Client wrapper for `mahjong-ai.worker.ts`.
 *
 * Same house rule as `ShogiImproved/shogiAiWorkerClient.ts`: **every**
 * `new Worker(new URL('./mahjong-ai.worker.ts', import.meta.url))` call in the
 * repository lives in this file, so the bundler can statically see the worker
 * entry and emit its chunk. Components import `createMahjongAiClient`, never
 * the worker module.
 *
 * What this client does *not* need, and the shogi one does: SharedArrayBuffer,
 * COOP/COEP headers, helper workers, pondering, visibility suspension, or an
 * error-storm budget with backoff. A mahjong decision is sub-millisecond and
 * stateless, so the failure story is simply "terminate, rebuild up to
 * {@link MAX_WORKER_RESTARTS} times, and once that budget is spent answer
 * in-process for the rest of the session".
 *
 * ## The in-process fallback
 *
 * `Worker` does not exist during SSR, in vitest's node environment, or in the
 * Node harness, and a worker that fails to construct must not take the game
 * with it. In all of those cases {@link requestAction} answers synchronously
 * from {@link handleRequest} — the same function the worker runs, so the
 * action is identical either way. {@link chooseActionSync} exposes that path
 * directly for tests and for `scripts/mahjong-ai-baseline.ts`.
 */

import type { Difficulty } from '../common/types';
import type { Action, RoundState, Seat } from './engine/types';
import {
  handleRequest,
  type MahjongAiRequest,
  type MahjongAiResponse,
} from './mahjong-ai.worker';

export type { MahjongAiRequest, MahjongAiResponse };

/** One decision request, without the transport-level `requestId`. */
export interface ActionRequest {
  state: RoundState;
  seat: Seat;
  difficulty: Difficulty;
  /**
   * Seeds the decision RNG. Only `easy` consults it, but passing a stable
   * value (turn counter, hand index, …) keeps a replay reproducible.
   */
  seed: number | string;
}

/**
 * Decide in-process, with no worker involved.
 *
 * This is the path the unit tests and the Node harness use, and the path the
 * client falls back to when no `Worker` is available.
 */
export function chooseActionSync(request: ActionRequest): Action {
  const response = handleRequest({ requestId: 0, ...request });
  if (response.action === undefined) {
    throw new Error(response.error ?? 'mahjong AI returned no action');
  }
  return response.action;
}

export interface MahjongAiClient {
  /** Resolve with the AI's choice for the given position. */
  requestAction(request: ActionRequest): Promise<Action>;
  /** True while a real `Worker` is serving requests. */
  usingWorker(): boolean;
  /** Terminate the worker. The client keeps working through the fallback. */
  terminate(): void;
}

/**
 * How many times a dead worker is rebuilt before the client settles on the
 * in-process path for the rest of the session. A rebuild covers the common
 * transient failure (a chunk that momentarily failed to load); anything that
 * keeps failing is not transient, and answering in-process is both correct and
 * fast enough to be invisible here.
 *
 * This counts *rebuilds*, not worker constructions: the first worker is not a
 * restart, so the budget really does allow this many recoveries from a
 * failure.
 */
export const MAX_WORKER_RESTARTS = 2;

/** Longest a single decision may sit in the worker before the client gives up. */
export const WORKER_TIMEOUT_MS = 2_000;

interface Pending {
  resolve: (action: Action) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  request: ActionRequest;
}

function workerAvailable(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Create a client. Safe to call during SSR: no worker is constructed until the
 * first request, and if `Worker` is missing the client silently becomes a
 * synchronous wrapper around {@link chooseActionSync}.
 */
export function createMahjongAiClient(): MahjongAiClient {
  let worker: Worker | null = null;
  /** Rebuilds spent so far. The initial construction does not count. */
  let restarts = 0;
  let disabled = !workerAvailable();
  let disposed = false;
  let nextRequestId = 1;
  const pending = new Map<number, Pending>();

  /** Settle every in-flight request from the fallback; used when a worker dies. */
  const drainToFallback = (): void => {
    const inFlight = [...pending.values()];
    pending.clear();
    for (const entry of inFlight) {
      clearTimeout(entry.timer);
      try {
        entry.resolve(chooseActionSync(entry.request));
      } catch (error) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  const teardown = (): void => {
    if (worker !== null) {
      worker.terminate();
      worker = null;
    }
  };

  /** A worker that errored is never reused: it is replaced or given up on. */
  const handleFailure = (): void => {
    teardown();
    // `restarts` has already been incremented for the failure being handled,
    // so the budget is spent only once it has been exceeded.
    if (restarts > MAX_WORKER_RESTARTS) disabled = true;
    drainToFallback();
  };

  const ensureWorker = (): Worker | null => {
    if (disposed || disabled) return null;
    if (worker !== null) return worker;
    try {
      const created = new Worker(new URL('./mahjong-ai.worker.ts', import.meta.url), {
        type: 'module',
      });
      created.onmessage = (event: MessageEvent<MahjongAiResponse>) => {
        const response = event.data;
        const entry = pending.get(response?.requestId);
        if (entry === undefined) return;
        pending.delete(response.requestId);
        clearTimeout(entry.timer);
        if (response.action === undefined) {
          entry.reject(new Error(response.error ?? 'mahjong AI returned no action'));
          return;
        }
        entry.resolve(response.action);
      };
      created.onerror = () => {
        restarts += 1;
        handleFailure();
      };
      worker = created;
      return worker;
    } catch {
      // Construction itself can be the unavailable operation (a blocked or
      // missing chunk). Fall back rather than throw into the caller.
      disabled = true;
      return null;
    }
  };

  return {
    requestAction(request: ActionRequest): Promise<Action> {
      if (disposed) return Promise.reject(new Error('mahjong AI client was terminated'));
      const active = ensureWorker();
      if (active === null) {
        try {
          return Promise.resolve(chooseActionSync(request));
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }

      const requestId = nextRequestId;
      nextRequestId += 1;
      return new Promise<Action>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          // A worker that missed its deadline is presumed broken: replace it
          // and answer this move in-process so the table never stalls.
          restarts += 1;
          handleFailure();
          try {
            resolve(chooseActionSync(request));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }, WORKER_TIMEOUT_MS);
        pending.set(requestId, { resolve, reject, timer, request });

        const message: MahjongAiRequest = { requestId, ...request };
        try {
          active.postMessage(message);
        } catch (error) {
          pending.delete(requestId);
          clearTimeout(timer);
          restarts += 1;
          handleFailure();
          try {
            resolve(chooseActionSync(request));
          } catch {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });
    },

    usingWorker(): boolean {
      return worker !== null;
    },

    terminate(): void {
      disposed = true;
      teardown();
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('mahjong AI client was terminated'));
      }
      pending.clear();
    },
  };
}
