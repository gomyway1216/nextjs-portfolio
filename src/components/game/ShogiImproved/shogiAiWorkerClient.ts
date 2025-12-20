/**
 * Client wrapper for `shogi-ai.worker.ts`.
 *
 * This keeps Worker usage contained in a small module so components can:
 * - request a best move with a Promise API
 * - reuse a single worker instance across moves (fast, TT persists)
 * - terminate cleanly on unmount
 */

import { Difficulty } from '../common/types';
import type { SerializedKyokumenImproved, SerializedTeImproved } from './shogi-ai.worker';

type WorkerRequest =
  | { type: 'bestMove'; id: number; position: SerializedKyokumenImproved; difficulty: Difficulty; tesu: number }
  | { type: 'clearTT' };

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

export function createShogiAiWorkerClient(): ShogiAiWorkerClient {
  const worker = new Worker(new URL('./shogi-ai.worker.ts', import.meta.url), { type: 'module' });

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

  return {
    requestBestMove(position: SerializedKyokumenImproved, difficulty: Difficulty, tesu: number) {
      const id = nextId++;
      return new Promise<SerializedTeImproved | null>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const req: WorkerRequest = { type: 'bestMove', id, position, difficulty, tesu: tesu | 0 };
        worker.postMessage(req);
      });
    },
    clearTT() {
      const req: WorkerRequest = { type: 'clearTT' };
      worker.postMessage(req);
    },
    terminate() {
      rejectAll(new Error('Worker terminated'));
      worker.terminate();
    },
  };
}
