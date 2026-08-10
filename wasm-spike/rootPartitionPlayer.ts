import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { Te } from '../src/components/game/ShogiImproved/types';
import { teFromWasmKey } from './search-driver';
import type { RootPartitionSearchRequest, RootPartitionSearchResult } from './root-partition-worker';

type Remainder = 0 | 1;

type WorkerMessage =
  | RootPartitionSearchResult
  | { type: 'ready'; remainder: Remainder }
  | { type: 'error'; id: number; remainder: Remainder; error: string };

interface PendingRequest {
  resolve(result: RootPartitionSearchResult): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ProductionWasm {
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
}

export interface RootPartitionDecision {
  key: number;
  move: Te;
  score: number;
  depth: number;
  wallMs: number;
  winner: Remainder | 'fallback';
  fallback: boolean;
  results: Array<RootPartitionSearchResult | null>;
  errors: string[];
}

export interface RootPartitionSearchOptions {
  maxDepth?: number;
  quiescenceDepthMax?: number;
  ignoreRemainders?: readonly Remainder[];
}

function serialize(position: KyokumenImproved): { board: number[]; hand: number[] } {
  const board: number[] = [];
  for (let suji = 1; suji <= 9; suji += 1) {
    for (let dan = 1; dan <= 9; dan += 1) board.push(position.ban[(suji << 4) + dan] | 0);
  }
  return { board, hand: Array.from(position.hand, (value) => value | 0) };
}

function isSameMove(a: Te, b: Te): boolean {
  return a.koma === b.koma && a.from === b.from && a.to === b.to && a.promote === b.promote;
}

export function loadProductionWasm(weightsPath: string): ProductionWasm {
  const wasmPath = join(__dirname, '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm');
  const module = new WebAssembly.Module(readFileSync(wasmPath));
  const instance = new WebAssembly.Instance(module, {
    env: {
      abort(_msg: number, _file: number, line: number, col: number) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      now: () => performance.now(),
      sharedTtProbe: (_hashA: number, _hashB: number, _lock: number) => 0,
      sharedTtStore: (_hashA: number, _hashB: number, _value: number, _flagDepth: number, _best: number) => {},
      sharedShouldStop: () => 0,
    },
  });
  const wasm = instance.exports as unknown as ProductionWasm;
  const weights = readFileSync(weightsPath);
  wasm.setNnueBuckets(81);
  if (weights.byteLength !== wasm.getNnueWeightsSize()) {
    throw new Error(`NNUE weights size mismatch: ${weights.byteLength} != ${wasm.getNnueWeightsSize()}`);
  }
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
  wasm.setNnueScaleK(600);
  wasm.setNnueEnabled(1);
  return wasm;
}

export function syncProductionWasm(wasm: ProductionWasm, position: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji += 1) {
    for (let dan = 1; dan <= 9; dan += 1) {
      const square = (suji << 4) + dan;
      wasm.setSquare(square, position.ban[square]);
    }
  }
  for (let koma = 0; koma < position.hand.length && koma < 64; koma += 1) {
    wasm.setHand(koma, position.hand[koma] | 0);
  }
  wasm.setSideToMove(position.teban);
  wasm.finalizePosition();
}

export class RootPartitionPlayer {
  private readonly workers: [Worker, Worker];
  private readonly pending: [Map<number, PendingRequest>, Map<number, PendingRequest>] = [new Map(), new Map()];
  private readonly readyPromises: [Promise<void>, Promise<void>];
  private readonly weightsPath: string;
  private fallbackWasm: ProductionWasm | null = null;
  private nextId = 1;
  private closed = false;

  constructor(candidatePath: string, weightsPath: string) {
    this.weightsPath = weightsPath;
    const readyResolvers: Array<() => void> = [];
    const readyRejectors: Array<(error: Error) => void> = [];
    this.readyPromises = [0, 1].map(
      (remainder) =>
        new Promise<void>((resolve, reject) => {
          readyResolvers[remainder] = resolve;
          readyRejectors[remainder] = reject;
        }),
    ) as [Promise<void>, Promise<void>];

    this.workers = [0, 1].map((remainder) => {
      const worker = new Worker(join(__dirname, 'root-partition-worker-boot.cjs'), {
        workerData: { candidatePath, weightsPath, remainder },
      });
      worker.on('message', (message: WorkerMessage) => {
        if (message.type === 'ready') {
          readyResolvers[remainder]?.();
          return;
        }
        const pending = this.pending[remainder].get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending[remainder].delete(message.id);
        if (message.type === 'result') pending.resolve(message);
        else pending.reject(new Error(message.error));
      });
      worker.on('error', (error) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        readyRejectors[remainder]?.(normalized);
        this.rejectWorkerPending(remainder as Remainder, normalized);
      });
      worker.on('exit', (code) => {
        if (!this.closed && code !== 0) {
          const error = new Error(`root partition worker ${remainder} exited with code ${code}`);
          readyRejectors[remainder]?.(error);
          this.rejectWorkerPending(remainder as Remainder, error);
        }
      });
      return worker;
    }) as [Worker, Worker];
  }

  async ready(): Promise<void> {
    await Promise.all(this.readyPromises);
  }

  newGame(): void {
    for (const worker of this.workers) worker.postMessage({ type: 'clearTT' });
    this.fallbackWasm?.clearTT();
  }

  private rejectWorkerPending(remainder: Remainder, error: Error): void {
    for (const request of this.pending[remainder].values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending[remainder].clear();
  }

  private requestWorker(remainder: Remainder, request: RootPartitionSearchRequest): Promise<RootPartitionSearchResult> {
    const timeoutMs = Math.max(1_000, request.maxTimeMs + 500);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending[remainder].delete(request.id);
        reject(new Error(`root partition worker ${remainder} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending[remainder].set(request.id, { resolve, reject, timer });
      this.workers[remainder].postMessage(request);
    });
  }

  private validResult(
    result: RootPartitionSearchResult | null,
    remainder: Remainder,
    legalMoves: readonly Te[],
    position: KyokumenImproved,
  ): result is RootPartitionSearchResult {
    if (
      !result ||
      result.remainder !== remainder ||
      result.key === 0 ||
      result.subsetCount <= 0 ||
      result.contains !== 1 ||
      !Number.isFinite(result.score) ||
      !Number.isFinite(result.elapsedMs)
    ) {
      return false;
    }
    const move = teFromWasmKey(result.key, position);
    return legalMoves.some((entry) => isSameMove(entry, move));
  }

  private emptyResult(result: RootPartitionSearchResult | null, remainder: Remainder): result is RootPartitionSearchResult {
    return (
      result !== null &&
      result.remainder === remainder &&
      result.subsetCount === 0 &&
      result.key === 0 &&
      result.contains === 0 &&
      Number.isFinite(result.elapsedMs)
    );
  }

  private runFallback(
    position: KyokumenImproved,
    tesu: number,
    maxTimeMs: number,
    maxDepth: number,
    quiescenceDepthMax: number,
  ): RootPartitionDecision {
    if (!this.fallbackWasm) {
      this.fallbackWasm = loadProductionWasm(this.weightsPath);
    }
    syncProductionWasm(this.fallbackWasm, position);
    this.fallbackWasm.setRootTesu(tesu);
    const started = performance.now();
    const key = this.fallbackWasm.searchBestMove(maxTimeMs, maxDepth, quiescenceDepthMax);
    const wallMs = performance.now() - started;
    if (key === 0) throw new Error('production fallback returned no move');
    const move = teFromWasmKey(key, position);
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    if (!legal.some((entry) => isSameMove(entry, move))) throw new Error('production fallback returned illegal move');
    return {
      key,
      move,
      score: this.fallbackWasm.getSearchScore(),
      depth: this.fallbackWasm.getSearchDepth(),
      wallMs,
      winner: 'fallback',
      fallback: true,
      results: [null, null],
      errors: [],
    };
  }

  async search(
    position: KyokumenImproved,
    tesu: number,
    maxTimeMs: number,
    options: RootPartitionSearchOptions = {},
  ): Promise<RootPartitionDecision> {
    await this.ready();
    if (this.closed) throw new Error('root partition player is closed');
    const maxDepth = options.maxDepth ?? 32;
    const quiescenceDepthMax = options.quiescenceDepthMax ?? 10;
    const ignored = new Set(options.ignoreRemainders ?? []);
    const { board, hand } = serialize(position);
    const id = this.nextId++;
    const baseRequest = {
      type: 'search' as const,
      id,
      board,
      hand,
      teban: position.teban,
      tesu,
      maxTimeMs,
      maxDepth,
      quiescenceDepthMax,
    };
    const started = performance.now();
    const settled = await Promise.allSettled([
      this.requestWorker(0, baseRequest),
      this.requestWorker(1, baseRequest),
    ]);
    const wallMs = performance.now() - started;
    const legalMoves = GenerateMovesImproved.generateLegalMoves(position);
    const results: Array<RootPartitionSearchResult | null> = [null, null];
    const errors: string[] = [];
    for (const remainder of [0, 1] as const) {
      const outcome = settled[remainder];
      if (outcome.status === 'rejected') {
        errors.push(`partition${remainder}: ${String(outcome.reason)}`);
      } else if (ignored.has(remainder)) {
        errors.push(`partition${remainder}: injected fault`);
      } else if (this.emptyResult(outcome.value, remainder)) {
        results[remainder] = outcome.value;
      } else if (this.validResult(outcome.value, remainder, legalMoves, position)) {
        results[remainder] = outcome.value;
      } else {
        errors.push(`partition${remainder}: malformed or illegal result ${JSON.stringify(outcome.value)}`);
      }
    }

    const valid = results.filter(
      (result): result is RootPartitionSearchResult => result !== null && result.key !== 0 && result.subsetCount > 0,
    );
    if (valid.length === 0) {
      const fallback = this.runFallback(position, tesu, maxTimeMs, maxDepth, quiescenceDepthMax);
      fallback.errors = errors;
      fallback.wallMs += wallMs;
      return fallback;
    }
    const winner =
      valid.length === 1
        ? valid[0]
        : valid[1].score > valid[0].score
          ? valid[1]
          : valid[0];
    const move = teFromWasmKey(winner.key, position);
    return {
      key: winner.key,
      move,
      score: winner.score,
      depth: winner.depth,
      wallMs,
      winner: winner.remainder,
      fallback: false,
      results,
      errors,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
