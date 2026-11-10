/**
 * Client for `blokus-ai.worker.ts`. The one place that constructs the worker,
 * as the bundler needs to see `new Worker(new URL(…))` to emit its chunk.
 *
 * With no `Worker` (a test, or a chunk that would not load) a move is answered
 * in-process by the same `handleRequest`, so the table never stalls. A worker
 * that errors or misses its deadline is given up on for the rest of the game:
 * the fallback is only slower to paint, never a different rule.
 */

import type { MoveReview } from './ai';
import { handleRequest, type BlokusAiRequestBody, type BlokusAiResponse, type BlokusMoveRequest, type BlokusReviewRequest } from './blokus-ai.worker';

/** Longer than the slowest level's time limit, with room for a busy phone. */
export const WORKER_TIMEOUT_MS = 6_000;

export type MoveRequest = Omit<BlokusMoveRequest, 'kind'>;
export type ReviewRequest = Omit<BlokusReviewRequest, 'kind'>;

export interface BlokusAiClient {
  requestMove(request: MoveRequest): Promise<number>;
  requestReview(request: ReviewRequest): Promise<MoveReview>;
  terminate(): void;
}

const answerInProcess = (request: BlokusAiRequestBody): BlokusAiResponse => handleRequest({ requestId: 0, ...request });

interface Pending {
  request: BlokusAiRequestBody;
  resolve: (response: BlokusAiResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** The answer a request wanted, or the error that came instead. */
const take = <T>(response: BlokusAiResponse, value: T | undefined): T => {
  if (value === undefined) throw new Error(response.error ?? 'Blokus AI returned no answer');
  return value;
};

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
        const entry = pending.get(event.data.requestId);
        if (!entry) return;
        pending.delete(event.data.requestId);
        clearTimeout(entry.timer);
        entry.resolve(event.data);
      };
      created.onerror = giveUp;
      worker = created;
      return created;
    } catch {
      givenUp = true;
      return null;
    }
  };

  const ask = (request: BlokusAiRequestBody): Promise<BlokusAiResponse> => {
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
  };

  return {
    requestMove: (request) => ask(request).then((response) => take(response, response.move)),
    requestReview: (request) => ask({ kind: 'review', ...request }).then((response) => take(response, response.review)),
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
