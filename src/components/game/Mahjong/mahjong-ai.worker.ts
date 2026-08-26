/**
 * Dedicated Web Worker for the mahjong AI.
 *
 * Unlike the shogi worker there is no search here: one mahjong decision is a
 * few hundred shanten evaluations and finishes in well under a millisecond, so
 * this file has no time budget, no pondering, no SMP and no WASM. The worker
 * exists purely so a slow frame on the main thread can never be caused by the
 * AI, and so the UI has exactly one asynchronous shape to code against.
 *
 * Protocol — a plain request/response RPC, one message each way:
 *
 *     { requestId, state, seat, difficulty, seed }  ->
 *     { requestId, action } | { requestId, error }
 *
 * `state` is a {@link RoundState}, which is structured-cloneable as it stands
 * (plain arrays, numbers and objects — no `Uint8Array` in the round, no class
 * instances, no functions). The worker never sends the state back, only the
 * chosen {@link Action}.
 *
 * The worker is stateless: every request builds its own RNG from `seed`, so
 * the same request always produces the same answer no matter what ran before
 * it, and the in-process fallback in `mahjongAiWorkerClient.ts` produces the
 * identical action.
 */

import type { Difficulty } from '../common/types';
import { chooseAction } from './ai/heuristicAI';
import { createRng } from './engine/random';
import type { Action, RoundState, Seat } from './engine/types';

export interface MahjongAiRequest {
  requestId: number;
  state: RoundState;
  seat: Seat;
  difficulty: Difficulty;
  /** Seeds the decision RNG. Equal seeds replay identical play. */
  seed: number | string;
}

export interface MahjongAiResponse {
  requestId: number;
  action?: Action;
  error?: string;
}

/**
 * Answer one request. Exported so the client's synchronous fallback and the
 * unit tests run the exact same code path the worker does.
 */
export function handleRequest(request: MahjongAiRequest): MahjongAiResponse {
  try {
    const rng = createRng(request.seed);
    const action = chooseAction(request.state, request.seat, request.difficulty, rng);
    return { requestId: request.requestId, action };
  } catch (error) {
    return {
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The worker global, narrowed to the two members this file uses.
 *
 * `self` is typed as a `Window` under the app's `dom` lib and is missing
 * entirely under Node, so it is cast rather than redeclared — the same shape
 * `shogi-ai.worker.ts` uses.
 */
type WorkerScope = {
  postMessage: (message: MahjongAiResponse) => void;
  onmessage: ((event: MessageEvent<MahjongAiRequest>) => void) | null;
};

/**
 * True only inside a real dedicated worker.
 *
 * The check matters because `mahjongAiWorkerClient.ts` imports this module on
 * the **main thread** to reach {@link handleRequest} for its synchronous
 * fallback. There `self` is the window and `self.postMessage` exists, so a
 * naive "`self` is defined" test would install a handler on the page's own
 * message channel. A worker global has no `document`; a window always does,
 * and Node has neither. `WorkerGlobalScope` is not used because the app's
 * `tsconfig` loads `lib.dom`, not `lib.webworker`, so the name has no type.
 */
const inWorkerScope =
  typeof self !== 'undefined' &&
  typeof (globalThis as { document?: unknown }).document === 'undefined' &&
  typeof (self as unknown as WorkerScope).postMessage === 'function';

if (inWorkerScope) {
  const scope = self as unknown as WorkerScope;
  scope.onmessage = (event: MessageEvent<MahjongAiRequest>) => {
    const request = event.data;
    if (request === null || typeof request !== 'object') return;
    scope.postMessage(handleRequest(request));
  };
}
