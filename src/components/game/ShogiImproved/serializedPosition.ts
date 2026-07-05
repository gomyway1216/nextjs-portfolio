/**
 * serializedPosition.ts — the structured-clone-friendly position format the
 * UI thread sends to the AI workers, plus its decoder. Shared between the
 * main AI worker (shogi-ai.worker.ts) and the Lazy SMP helper workers
 * (shogi-ai-helper.worker.ts), which receive the exact same payload.
 */

import { KyokumenImproved } from './KyokumenImproved';

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

export function buildPosition(pos: SerializedKyokumenImproved): KyokumenImproved {
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
