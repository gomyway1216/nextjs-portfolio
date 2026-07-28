/**
 * shogi-ai-helper.worker.ts — one Lazy SMP helper thread.
 *
 * Runs its own private WASM engine instance and, on every `go` from the main
 * AI worker, searches the same root position the main thread is searching.
 * The helper's best move is deliberately discarded: its entire contribution
 * flows through the shared transposition table (sharedTT.ts), whose entries
 * make the main thread's search deeper within the same time budget — that is
 * all Lazy SMP is.
 *
 * Stop discipline: the search runs with a generous backstop time budget and
 * is really stopped by the generation cell in the shared TT (the main worker
 * publishes 0 / the next generation when it finishes; the engine polls every
 * ~2048 nodes). While a search runs this worker is blocked, so incoming
 * messages queue up; a queued stale `go` starts, notices its generation is
 * already outdated at the first poll, and returns within a couple of ms.
 *
 * Everything here is best-effort: any failure just means this helper stops
 * contributing TT entries. The main worker never waits on helpers.
 */

import { buildPosition } from './serializedPosition';
import type { HelperInitMessage, HelperRequest, HelperResponse } from './smpProtocol';
import {
  clearWasmRootPolicyRank,
  clearWasmTT,
  enableSharedTT,
  loadNnueWeights,
  setSearchGeneration,
  setWasmNnueEnabled,
  setWasmSearchStartDepth,
  wasmSearchBestMove,
  getLastWasmSearchStats,
} from './wasmEngine';

/**
 * Extra time on top of the main thread's budget. Purely a backstop for the
 * pathological case where the generation flip is never observed (e.g. the
 * main worker died mid-search); normally the flip stops the helper within
 * milliseconds of the main search finishing.
 */
const HELPER_TIME_MARGIN_MS = 1000;

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<HelperInitMessage>) => void) | null;
};

function runHelper(init: HelperInitMessage): void {
  const { port, sab, helperId } = init;
  const ok = enableSharedTT(sab, 'helper');
  // Odd helpers start iterative deepening one ply deeper — the standard Lazy
  // SMP desynchronization so the threads do not explore in lockstep.
  if (ok) setWasmSearchStartDepth(1 + (helperId & 1));

  port.onmessage = (event: MessageEvent<HelperRequest>) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

    if (msg.type === 'clearTT') {
      // Private caches only — the main worker owns the shared TT clear.
      clearWasmTT();
      return;
    }

    if (msg.type === 'nnueWeights') {
      loadNnueWeights(new Uint8Array(msg.bytes), msg.scaleK);
      return;
    }

    if (msg.type !== 'go' || !ok) return;
    try {
      // Same eval as the main thread this move: shared TT entries carry eval
      // scores, so V3-scaled and NNUE-scaled values must never mix.
      const nnueActuallyEnabled = setWasmNnueEnabled(msg.nnue);
      setSearchGeneration(msg.gen);
      const k = buildPosition(msg.position);
      // The main worker is the only inference boundary. Every helper consumes
      // the identical dual-hash/sequence-bound rank receipt, or null on a
      // disabled/faulted root.
      wasmSearchBestMove(
        k,
        msg.tesu,
        msg.maxTimeMs + HELPER_TIME_MARGIN_MS,
        32,
        msg.quiescenceDepthMax,
        msg.student_enabled === true && nnueActuallyEnabled
          ? msg.rootPolicyRank
          : null,
      );
      const stats = getLastWasmSearchStats();
      const response: HelperResponse = {
        type: 'stats',
        gen: msg.gen,
        nodes: stats ? stats.nodes : 0,
        depth: stats ? stats.depth : 0,
      };
      port.postMessage(response);
    } catch {
      // Never let a helper failure surface anywhere; the main search is
      // complete without us.
    } finally {
      clearWasmRootPolicyRank();
    }
  };

  const ready: HelperResponse = { type: 'ready', ok };
  port.postMessage(ready);
}

ctx.onmessage = (event: MessageEvent<HelperInitMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || msg.type !== 'smpInit') return;
  try {
    runHelper(msg);
  } catch {
    // Missing SAB support etc. — the main worker simply never hears from us.
  }
};

export {};
