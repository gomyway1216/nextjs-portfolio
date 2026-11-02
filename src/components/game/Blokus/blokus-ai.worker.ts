/**
 * The Blokus AI's worker: the top levels think for over a second, which must
 * not happen on the page's thread. `handleRequest` is also what the client calls
 * when no worker is available, so the answer is the same either way.
 */

import type { Difficulty } from '../common/types';
import { chooseMove, seededRandom, type View } from './ai';
import { legalMoves, type GameState } from './engine';

export interface BlokusAiRequest {
  requestId: number;
  state: GameState;
  level: Difficulty;
  seed: number;
  view?: View;
  views?: readonly View[];
}

export interface BlokusAiResponse {
  requestId: number;
  move?: number;
  error?: string;
}

export function handleRequest(request: BlokusAiRequest): BlokusAiResponse {
  const { requestId, state, level, seed, view, views } = request;
  try {
    const moves = legalMoves(state);
    if (moves.length === 0) return { requestId, error: 'no legal move' };
    return { requestId, move: chooseMove(state, moves, level, { random: seededRandom(seed), view, views }) };
  } catch (error) {
    return { requestId, error: error instanceof Error ? error.message : String(error) };
  }
}

type WorkerScope = {
  postMessage: (message: BlokusAiResponse) => void;
  onmessage: ((event: MessageEvent<BlokusAiRequest>) => void) | null;
};

// The client imports this module on the page's thread for `handleRequest`, where `self` is the window: only a real
// worker, which has no `document`, may take over onmessage.
const inWorkerScope =
  typeof self !== 'undefined' &&
  typeof (globalThis as { document?: unknown }).document === 'undefined' &&
  typeof (self as unknown as WorkerScope).postMessage === 'function';

if (inWorkerScope) {
  const scope = self as unknown as WorkerScope;
  scope.onmessage = (event: MessageEvent<BlokusAiRequest>) => {
    scope.postMessage(handleRequest(event.data));
  };
}
