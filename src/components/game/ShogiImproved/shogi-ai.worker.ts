/**
 * Dedicated Web Worker for Shogi AI search (Improved engine).
 *
 * Why a worker:
 * - Level 4/5 searches use multi-second time budgets.
 * - Running them on the main thread would freeze the UI.
 *
 * Protocol:
 * - `bestMove`: compute the best move for a serialized position + difficulty.
 * - `clearTT`: clears the engine's transposition table (useful when starting a new game).
 *
 * Notes:
 * - We keep a single `ShogiAIImproved` instance alive inside the worker so the TT can persist across moves.
 * - The caller should still ignore stale responses if the user moved/reset while the worker was thinking.
 */

	import { KyokumenImproved } from './KyokumenImproved';
	import { getOpeningMoveImproved } from './OpeningBookImproved';
		import { ShogiAIImprovedV20 } from './ShogiAIImprovedV20';
	import { Difficulty } from '../common/types';

export type SerializedKyokumenImproved = {
  /**
   * 81 squares (suji 1..9, dan 1..9), in (suji-major, then dan) order:
   * index = (suji-1)*9 + (dan-1)
   */
  board: number[];
  /**
   * Hand piece counts indexed by piece code.
   * This can be longer than the engine's internal `hand[]`; only overlapping indices are copied.
   */
  hand: number[];
  /** Side to move (SENTE or GOTE). */
  teban: number;
};

export type SerializedTeImproved = {
  koma: number;
  from: number;
  to: number;
  promote: boolean;
};

type WorkerRequest =
  | { type: 'bestMove'; id: number; position: SerializedKyokumenImproved; difficulty: Difficulty; tesu: number }
  | { type: 'clearTT' };

type WorkerResponse =
  | { type: 'bestMoveResult'; id: number; move: SerializedTeImproved | null }
  | { type: 'error'; id: number; message: string };

		const ai = new ShogiAIImprovedV20();

const ctx: {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
} = self as unknown as {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

function buildPosition(pos: SerializedKyokumenImproved): KyokumenImproved {
  const k = new KyokumenImproved();

  // Board (only the playable 9x9; constructor already set WALLs elsewhere)
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      k.ban[(suji << 4) + dan] = pos.board[idx++] ?? 0;
    }
  }

  // Hands (count-based)
  const limit = Math.min(k.hand.length, pos.hand.length);
  for (let i = 0; i < limit; i++) {
    k.hand[i] = pos.hand[i] | 0;
  }

  // Side to move and incremental state (eval / king positions / hash)
  k.teban = pos.teban;
  k.initAll();
  return k;
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'clearTT') {
    ai.clearTT();
    return;
  }

  if (msg.type !== 'bestMove') return;

	  try {
	    const k = buildPosition(msg.position);
	    const book = getOpeningMoveImproved(k, msg.difficulty);
		    const best = book ?? ai.getNextTe(k, msg.tesu | 0, { difficulty: msg.difficulty });
		    const move: SerializedTeImproved | null = best
		      ? { koma: best.koma, from: best.from, to: best.to, promote: best.promote }
		      : null;

    ctx.postMessage({ type: 'bestMoveResult', id: msg.id, move });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.postMessage({ type: 'error', id: msg.id, message });
  }
};

export {};
