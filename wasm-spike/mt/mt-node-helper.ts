/**
 * mt-node-helper.ts — node worker_threads port of the browser Lazy SMP
 * helper (src/components/game/ShogiImproved/shogi-ai-helper.worker.ts).
 *
 * Runs a private WASM engine instance whose TT probes/stores go to the
 * SharedArrayBuffer table passed via workerData, searches every `go` position
 * until the published generation moves on, and reports node counts back for
 * the scaling measurements. Used by mtPlayer.ts (match/sanity harnesses).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import { SharedTT } from '../../src/components/game/ShogiImproved/sharedTT';

export interface HelperGoMessage {
  type: 'go';
  gen: number;
  /** 81 squares, (suji-1)*9 + (dan-1) — same layout as the browser workers. */
  board: number[];
  hand: number[];
  teban: number;
  tesu: number;
  maxTimeMs: number;
  quiescenceDepthMax: number;
  nnue: boolean;
}

export type HelperMessage = HelperGoMessage | { type: 'clearTT' };

export interface HelperStatsMessage {
  type: 'stats';
  gen: number;
  /** nodes + leaves of the finished helper search. */
  visited: number;
  depth: number;
}

interface MtWorkerData {
  sab: SharedArrayBuffer;
  helperId: number;
  weightsPath: string | null;
}

interface HelperWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  getSearchDepth(): number;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
  getSharedTtScratchPtr(): number;
  setSharedTtEnabled(flag: number): void;
  setSearchStartDepth(d: number): void;
}

const HELPER_TIME_MARGIN_MS = 1000;

const { sab, helperId, weightsPath } = workerData as MtWorkerData;
const port = parentPort;
if (!port) throw new Error('mt-node-helper must run as a worker thread');

const tt = new SharedTT(sab);
let myGen = 0;
let scratch: Int32Array | null = null;

const wasmBytes = readFileSync(
  join(__dirname, '..', '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm')
);
const wasmModule = new WebAssembly.Module(wasmBytes);
const instance = new WebAssembly.Instance(wasmModule, {
  env: {
    abort(_msg: number, _file: number, line: number, col: number) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
    now: () => performance.now(),
    sharedTtProbe: (hash: number): number => {
      if (!scratch) scratch = new Int32Array(wasm.memory.buffer, wasm.getSharedTtScratchPtr(), 4);
      return tt.probe(hash, scratch);
    },
    sharedTtStore: (hash: number, value: number, flagDepth: number, best: number): void => {
      tt.store(hash, value, flagDepth, best);
    },
    sharedShouldStop: (): number => (tt.readGeneration() !== myGen ? 1 : 0),
  },
});
const wasm = instance.exports as unknown as HelperWasm;

wasm.setSharedTtEnabled(1);
// Standard Lazy SMP desynchronization: odd helpers start one ply deeper.
wasm.setSearchStartDepth(1 + (helperId & 1));

let nnueLoaded = false;
if (weightsPath) {
  const weights = readFileSync(weightsPath);
  if (weights.byteLength === wasm.getNnueWeightsSize()) {
    new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
    wasm.setNnueScaleK(600);
    nnueLoaded = true;
  }
}
let nnueState = false;

function syncPosition(msg: HelperGoMessage): void {
  wasm.clearBoard();
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      wasm.setSquare((suji << 4) + dan, msg.board[idx++] | 0);
    }
  }
  for (let koma = 0; koma < msg.hand.length && koma < 64; koma++) {
    wasm.setHand(koma, msg.hand[koma] | 0);
  }
  wasm.setSideToMove(msg.teban);
  wasm.finalizePosition();
}

port.on('message', (msg: HelperMessage) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'clearTT') {
    wasm.clearTT(); // private caches; the coordinator owns the shared clear
    return;
  }
  if (msg.type !== 'go') return;

  const wantNnue = msg.nnue && nnueLoaded;
  if (wantNnue !== nnueState) {
    wasm.setNnueEnabled(wantNnue ? 1 : 0);
    wasm.clearTT();
    nnueState = wantNnue;
  }
  myGen = msg.gen;
  syncPosition(msg);
  wasm.setRootTesu(msg.tesu | 0);
  wasm.searchBestMove(msg.maxTimeMs + HELPER_TIME_MARGIN_MS, 32, msg.quiescenceDepthMax);
  const stats: HelperStatsMessage = {
    type: 'stats',
    gen: msg.gen,
    visited: wasm.getSearchNodes() + wasm.getSearchLeaves(),
    depth: wasm.getSearchDepth(),
  };
  port.postMessage(stats);
});

port.postMessage({ type: 'ready', helperId });
