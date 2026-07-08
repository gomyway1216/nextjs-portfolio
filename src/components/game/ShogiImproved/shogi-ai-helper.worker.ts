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

/** Dev-only [SMP][helper<id>] tracing. Production stays quiet. */
const SMP_TRACE = process.env.NODE_ENV === 'development';

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<HelperInitMessage>) => void) | null;
};

function runHelper(init: HelperInitMessage): void {
  const { port, sab, helperId } = init;
  const tag = `[SMP][helper${helperId}]`;
  const log = (...a: unknown[]): void => {
    if (SMP_TRACE) console.info(tag, ...a);
  };
  const ok = enableSharedTT(sab, 'helper');
  log(`init: enableSharedTT ok=${ok}, sab=${sab.byteLength} bytes`);
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
      log(`nnueWeights loaded (${msg.bytes.byteLength} bytes, K=${msg.scaleK})`);
      return;
    }

    if (msg.type !== 'go' || !ok) return;
    const t0 = performance.now();
    log(`go RECEIVED gen=${msg.gen} tesu=${msg.tesu} budget=${msg.maxTimeMs}ms nnue=${msg.nnue}`);
    try {
      // Same eval as the main thread this move: shared TT entries carry eval
      // scores, so V3-scaled and NNUE-scaled values must never mix.
      setWasmNnueEnabled(msg.nnue);
      setSearchGeneration(msg.gen);
      const k = buildPosition(msg.position);
      // Blocking search; really stopped by the generation flip (polled every
      // ~2048 nodes) — the +margin is only a backstop.
      wasmSearchBestMove(k, msg.tesu, msg.maxTimeMs + HELPER_TIME_MARGIN_MS, 32, msg.quiescenceDepthMax);
      const stats = getLastWasmSearchStats();
      const elapsed = performance.now() - t0;
      log(
        `go DONE gen=${msg.gen} elapsed=${elapsed.toFixed(0)}ms depth=${stats?.depth ?? '?'} ` +
          `nodes=${stats?.nodes ?? '?'} (stopped by generation flip)`
      );
      const response: HelperResponse = {
        type: 'stats',
        gen: msg.gen,
        nodes: stats ? stats.nodes : 0,
        depth: stats ? stats.depth : 0,
      };
      port.postMessage(response);
    } catch (e) {
      console.error(`${tag} go THREW gen=${msg.gen}`, e);
      // Never let a helper failure surface anywhere; the main search is
      // complete without us.
    }
  };

  const ready: HelperResponse = { type: 'ready', ok };
  port.postMessage(ready);
  log('ready posted');
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
