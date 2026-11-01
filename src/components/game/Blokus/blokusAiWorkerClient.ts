/**
 * Client for `blokus-ai.worker.ts`. The one place that constructs the worker,
 * as the bundler needs to see `new Worker(new URL(…))` to emit its chunk.
 *
 * With no `Worker` (a test, or a chunk that would not load) a move is answered
 * in-process by the same `handleRequest`, so the table never stalls. A worker
 * that errors or misses its deadline is given up on for the rest of the game:
 * the fallback is only slower to paint, never a different rule.
 */

import type { Difficulty } from '../common/types';
import { handleRequest, type BlokusAiResponse } from './blokus-ai.worker';
import type { GameState } from './engine';

/** Longer than the slowest level's time limit, with room for a busy phone. */
export const WORKER_TIMEOUT_MS = 6_000;

export interface MoveRequest {
  state: GameState;
  level: Difficulty;
  seed: number;
}

export interface BlokusAiClient {
  requestMove(request: MoveRequest): Promise<number>;
  terminate(): void;
}

const answerInProcess = (request: MoveRequest): number => {
  const response = handleRequest({ requestId: 0, ...request });
  if (response.move === undefined) throw new Error(response.error ?? 'Blokus AI returned no move');
  return response.move;
};

interface Pending {
  request: MoveRequest;
  resolve: (move: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createBlokusAiClient(): BlokusAiClient {
  let worker: Worker | null = null;
  let givenUp = typeof Worker === 'undefined';
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const settleInProcess = (entry: Pending) => {
    clearTimeout(entry.timer);
    try {
      entry.resolve(answerInProcess(entry.request));
    } catch (error) {
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const giveUp = () => {
    givenUp = true;
    worker?.terminate();
    worker = null;
    const waiting = [...pending.values()];
    pending.clear();
    waiting.forEach(settleInProcess);
  };

  const ensureWorker = (): Worker | null => {
    if (givenUp) return null;
    if (worker) return worker;
    try {
      const created = new Worker(new URL('./blokus-ai.worker.ts', import.meta.url), { type: 'module' });
      created.onmessage = (event: MessageEvent<BlokusAiResponse>) => {
        const { requestId, move, error } = event.data;
        const entry = pending.get(requestId);
        if (!entry) return;
        pending.delete(requestId);
        clearTimeout(entry.timer);
        if (move === undefined) entry.reject(new Error(error ?? 'Blokus AI returned no move'));
        else entry.resolve(move);
      };
      created.onerror = giveUp;
      worker = created;
      return created;
    } catch {
      givenUp = true;
      return null;
    }
  };

  return {
    requestMove(request) {
      const active = ensureWorker();
      if (!active) {
        return new Promise((resolve, reject) => {
          try {
            resolve(answerInProcess(request));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      }
      const requestId = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(giveUp, WORKER_TIMEOUT_MS);
        pending.set(requestId, { request, resolve, reject, timer });
        active.postMessage({ requestId, ...request });
      });
    },
    terminate() {
      givenUp = true;
      worker?.terminate();
      worker = null;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Blokus AI client was terminated'));
      }
      pending.clear();
    },
  };
}
