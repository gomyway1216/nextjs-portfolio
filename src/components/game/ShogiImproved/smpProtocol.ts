/**
 * smpProtocol.ts — message types for the Lazy SMP worker topology.
 *
 * Topology (all spawned by the page's shogiAiWorkerClient, so no nested
 * workers — Turbopack/webpack both statically bundle `new Worker(new URL())`
 * only from window-context modules):
 *
 *   page (client) ── spawns ──> main AI worker (shogi-ai.worker.ts)
 *        │                            ▲ MessagePort per helper
 *        └───────── spawns ──> helper workers (shogi-ai-helper.worker.ts)
 *
 * The client creates one MessageChannel per helper and hands the ports to
 * both sides; after that the main worker drives the helpers directly
 * (go/stop/clearTT/NNUE weights) and the client is out of the loop. All
 * threads share a single SharedArrayBuffer transposition table
 * (see sharedTT.ts).
 */

import type { Difficulty } from '../common/types';
import type { SerializedKyokumenImproved } from './serializedPosition';
import type { WasmRootPolicyRankReceipt } from './wasmEngine';

/** Client -> helper worker, once, right after spawning it. */
export type HelperInitMessage = {
  type: 'smpInit';
  /** Port whose other end went to the main AI worker. */
  port: MessagePort;
  /** Shared transposition table (layout of sharedTT.ts). */
  sab: SharedArrayBuffer;
  /** 0-based helper index; helpers with an odd index start one ply deeper. */
  helperId: number;
};

/** Client -> main AI worker, once. Enables multi-thread search. */
export type MainThreadsInitMessage = {
  type: 'smpThreads';
  sab: SharedArrayBuffer;
  /** One port per spawned helper. */
  ports: MessagePort[];
};

/** Main worker -> helper (via port). */
export type HelperRequest =
  | {
      type: 'go';
      /** Generation published in the shared TT for this search. */
      gen: number;
      position: SerializedKyokumenImproved;
      tesu: number;
      /** Backstop time budget; the generation flip is the primary stop. */
      maxTimeMs: number;
      quiescenceDepthMax: number;
      /** Whether this search must run on the NNUE eval (same as the main). */
      nnue: boolean;
      /** Same-build role switch; helpers never infer independently. */
      student_enabled: boolean;
      /** Exact immutable receipt computed once by the main worker. */
      rootPolicyRank: WasmRootPolicyRankReceipt | null;
      difficulty: Difficulty;
    }
  | { type: 'clearTT' }
  | { type: 'nnueWeights'; bytes: ArrayBuffer; scaleK: number };

/** Helper -> main worker (via port). */
export type HelperResponse =
  | { type: 'ready'; ok: boolean }
  | { type: 'stats'; gen: number; nodes: number; depth: number };
