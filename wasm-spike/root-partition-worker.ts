import { readFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

interface WorkerInit {
  candidatePath: string;
  weightsPath: string;
  remainder: 0 | 1;
}

export interface RootPartitionSearchRequest {
  type: 'search';
  id: number;
  board: number[];
  hand: number[];
  teban: number;
  tesu: number;
  maxTimeMs: number;
  maxDepth: number;
  quiescenceDepthMax: number;
}

export type RootPartitionWorkerRequest = RootPartitionSearchRequest | { type: 'clearTT' };

export interface RootPartitionSearchResult {
  type: 'result';
  id: number;
  remainder: 0 | 1;
  key: number;
  score: number;
  depth: number;
  nodes: number;
  leaves: number;
  elapsedMs: number;
  subsetCount: number;
  contains: number;
}

interface RootPartitionWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
  setRootMovePartition(modulus: number, remainder: number): void;
  getRootPartitionLegalMoveCount(): number;
  rootPartitionContainsMoveKey(key: number): number;
}

const init = workerData as WorkerInit;
const port = parentPort;
if (!port) throw new Error('root-partition-worker must run in worker_threads');
if (init.remainder !== 0 && init.remainder !== 1) throw new Error('invalid root partition remainder');

const wasmBytes = readFileSync(init.candidatePath);
const module = new WebAssembly.Module(wasmBytes);
const instance = new WebAssembly.Instance(module, {
  env: {
    abort(_msg: number, _file: number, line: number, col: number) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
    now: () => performance.now(),
    sharedTtProbe: () => 0,
    sharedTtStore: () => {},
    sharedShouldStop: () => 0,
  },
});
const wasm = instance.exports as unknown as RootPartitionWasm;
const weights = readFileSync(init.weightsPath);
wasm.setNnueBuckets(81);
if (weights.byteLength !== wasm.getNnueWeightsSize()) {
  throw new Error(`NNUE weights size mismatch: ${weights.byteLength} != ${wasm.getNnueWeightsSize()}`);
}
new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
wasm.setNnueScaleK(600);
wasm.setNnueEnabled(1);
wasm.setRootMovePartition(2, init.remainder);

function syncPosition(request: RootPartitionSearchRequest): void {
  wasm.clearBoard();
  let index = 0;
  for (let suji = 1; suji <= 9; suji += 1) {
    for (let dan = 1; dan <= 9; dan += 1) {
      wasm.setSquare((suji << 4) + dan, request.board[index++] | 0);
    }
  }
  for (let koma = 0; koma < request.hand.length && koma < 64; koma += 1) {
    wasm.setHand(koma, request.hand[koma] | 0);
  }
  wasm.setSideToMove(request.teban | 0);
  wasm.finalizePosition();
}

port.on('message', (request: RootPartitionWorkerRequest) => {
  if (!request || typeof request !== 'object') return;
  if (request.type === 'clearTT') {
    wasm.clearTT();
    return;
  }
  if (request.type !== 'search') return;
  try {
    syncPosition(request);
    wasm.setRootTesu(request.tesu | 0);
    const subsetCount = wasm.getRootPartitionLegalMoveCount();
    const started = performance.now();
    const key = wasm.searchBestMove(request.maxTimeMs, request.maxDepth, request.quiescenceDepthMax);
    const result: RootPartitionSearchResult = {
      type: 'result',
      id: request.id,
      remainder: init.remainder,
      key,
      score: wasm.getSearchScore(),
      depth: wasm.getSearchDepth(),
      nodes: wasm.getSearchNodes(),
      leaves: wasm.getSearchLeaves(),
      elapsedMs: performance.now() - started,
      subsetCount,
      contains: key === 0 ? 0 : wasm.rootPartitionContainsMoveKey(key),
    };
    port.postMessage(result);
  } catch (error) {
    port.postMessage({
      type: 'error',
      id: request.id,
      remainder: init.remainder,
      error: String(error instanceof Error ? error.stack ?? error.message : error),
    });
  }
});

port.postMessage({ type: 'ready', remainder: init.remainder });
