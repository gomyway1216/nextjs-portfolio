/**
 * mtPlayer.ts — node-side Lazy SMP player used by the match/sanity harnesses.
 *
 * Mirrors the production browser topology (shogiAiWorkerClient +
 * shogi-ai.worker + shogi-ai-helper.worker) with node worker_threads:
 * - one in-process WASM instance for the "main" search,
 * - N-1 worker_threads helpers (mt-node-helper.ts), each with a private
 *   instance,
 * - a single SharedArrayBuffer transposition table + generation stop cell
 *   (src/components/game/ShogiImproved/sharedTT.ts) shared by everyone.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { KyokumenImproved } from '../../src/components/game/ShogiImproved/KyokumenImproved';
import { SharedTT, createSharedTTBuffer } from '../../src/components/game/ShogiImproved/sharedTT';
import { GHI, SFU, Te } from '../../src/components/game/ShogiImproved/types';
import { teFromWasmKey } from '../search-driver';
import type { HelperGoMessage, HelperStatsMessage } from './mt-node-helper';

export interface MtSearchWasm {
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
  getSharedTtScratchPtr(): number;
  setSharedTtEnabled(flag: number): void;
  setSearchStartDepth(d: number): void;
}

const WASM_PATH = join(__dirname, '..', '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm');
export const NNUE_WEIGHTS_PATH = join(__dirname, '..', '..', 'public', 'shogi-nnue-weights.bin');

/**
 * Instantiate the engine. With `tt` (+ getGen) the instance runs in shared-TT
 * mode — its private TT is bypassed and all probes/stores hit the shared
 * table; with tt=null it is a plain single-thread instance (the stubs are
 * never called because setSharedTtEnabled stays 0).
 */
export function loadShogiWasmMt(tt: SharedTT | null, getGen: () => number): MtSearchWasm {
  const wasmBytes = readFileSync(WASM_PATH);
  const wasmModule = new WebAssembly.Module(wasmBytes);
  let scratch: Int32Array | null = null;
  const holder: { wasm: MtSearchWasm | null } = { wasm: null };
  const instance = new WebAssembly.Instance(wasmModule, {
    env: {
      abort(_msg: number, _file: number, line: number, col: number) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      now: () => performance.now(),
      sharedTtProbe: (hash: number): number => {
        const wasm = holder.wasm;
        if (!tt || !wasm) return 0;
        if (!scratch) scratch = new Int32Array(wasm.memory.buffer, wasm.getSharedTtScratchPtr(), 4);
        return tt.probe(hash, scratch);
      },
      sharedTtStore: (hash: number, value: number, flagDepth: number, best: number): void => {
        if (tt) tt.store(hash, value, flagDepth, best);
      },
      sharedShouldStop: (): number => (tt && tt.readGeneration() !== getGen() ? 1 : 0),
    },
  });
  const wasm = instance.exports as unknown as MtSearchWasm;
  holder.wasm = wasm;
  if (tt) wasm.setSharedTtEnabled(1);
  return wasm;
}

export function loadNnueIntoWasm(wasm: MtSearchWasm): void {
  const weights = readFileSync(NNUE_WEIGHTS_PATH);
  wasm.setNnueBuckets(81);
  if (weights.byteLength !== wasm.getNnueWeightsSize()) {
    throw new Error(`NNUE weights size mismatch: ${weights.byteLength} != ${wasm.getNnueWeightsSize()}`);
  }
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
  wasm.setNnueScaleK(600);
  wasm.setNnueEnabled(1);
}

/** Copy the full JS position into a WASM engine (same as search-driver's syncWasm). */
export function syncWasmMt(wasm: MtSearchWasm, k: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      wasm.setSquare(pos, k.ban[pos]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++) {
    wasm.setHand(koma, k.hand[koma] | 0);
  }
  wasm.setSideToMove(k.teban);
  wasm.finalizePosition();
}

function serializeBoard(k: KyokumenImproved): { board: number[]; hand: number[] } {
  const board: number[] = new Array(81);
  let idx = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      board[idx++] = k.ban[(suji << 4) + dan] | 0;
    }
  }
  return { board, hand: Array.from(k.hand, (v) => v | 0) };
}

export interface MtSearchStats {
  /** Interior + leaf nodes visited by the main thread's search. */
  mainVisited: number;
  /** Sum over helper threads (only those whose stats already arrived). */
  helperVisited: number;
  depth: number;
  score: number;
}

/**
 * Lazy SMP player: `threads` total (1 main in-process + threads-1 helper
 * worker_threads). Call close() when done or node will not exit.
 */
export class MtWasmPlayer {
  readonly name: string;
  private readonly tt: SharedTT;
  private readonly wasm: MtSearchWasm;
  private readonly workers: Worker[] = [];
  private gen = 0;
  private helperVisitedByGen = new Map<number, { visited: number; reports: number }>();
  private readonly nnue: boolean;

  constructor(name: string, threads: number, nnue: boolean) {
    this.name = name;
    this.nnue = nnue;
    const sab = createSharedTTBuffer();
    if (!sab) throw new Error('SharedArrayBuffer unavailable');
    this.tt = new SharedTT(sab);
    this.wasm = loadShogiWasmMt(this.tt, () => this.gen);
    if (nnue) loadNnueIntoWasm(this.wasm);

    for (let helperId = 0; helperId < threads - 1; helperId++) {
      const worker = new Worker(join(__dirname, 'mt-node-helper-boot.cjs'), {
        workerData: { sab, helperId, weightsPath: nnue ? NNUE_WEIGHTS_PATH : null },
      });
      worker.on('message', (msg: HelperStatsMessage | { type: 'ready' }) => {
        if (!msg || typeof msg !== 'object' || msg.type !== 'stats') return;
        const slot = this.helperVisitedByGen.get(msg.gen) ?? { visited: 0, reports: 0 };
        slot.visited += msg.visited;
        slot.reports += 1;
        this.helperVisitedByGen.set(msg.gen, slot);
        if (this.helperVisitedByGen.size > 8) {
          const oldest = this.helperVisitedByGen.keys().next().value;
          if (oldest !== undefined) this.helperVisitedByGen.delete(oldest);
        }
      });
      worker.unref();
      this.workers.push(worker);
    }
  }

  get helperCount(): number {
    return this.workers.length;
  }

  newGame(): void {
    this.wasm.clearTT(); // private eval cache etc.
    this.tt.clear();
    for (const worker of this.workers) worker.postMessage({ type: 'clearTT' });
  }

  /**
   * Multi-thread search: publish a generation, wake the helpers on the same
   * root, run the main search, publish 0 (stops the helpers within ~2048
   * nodes). Returns the packed move key (0 = no legal move).
   */
  searchKey(k: KyokumenImproved, tesu: number, maxTimeMs: number, quiescenceDepthMax: number): number {
    this.gen = this.gen + 1 === 0 ? 1 : this.gen + 1;
    this.tt.publishGeneration(this.gen);
    const { board, hand } = serializeBoard(k);
    const go: HelperGoMessage = {
      type: 'go',
      gen: this.gen,
      board,
      hand,
      teban: k.teban,
      tesu,
      maxTimeMs,
      quiescenceDepthMax,
      nnue: this.nnue,
    };
    for (const worker of this.workers) worker.postMessage(go);
    syncWasmMt(this.wasm, k);
    this.wasm.setRootTesu(tesu | 0);
    let key = 0;
    try {
      key = this.wasm.searchBestMove(maxTimeMs, 32, quiescenceDepthMax);
    } finally {
      this.tt.publishGeneration(0);
    }
    return key;
  }

  getNextTe(k: KyokumenImproved, tesu: number, maxTimeMs: number, quiescenceDepthMax: number): Te | null {
    const key = this.searchKey(k, tesu, maxTimeMs, quiescenceDepthMax);
    if (key === 0) return null;
    return teFromWasmKey(key, k);
  }

  /**
   * Await the helpers' stats for the last search (they arrive asynchronously
   * after the generation flip) and return the combined node counts.
   */
  async collectStats(timeoutMs = 3000): Promise<MtSearchStats> {
    const gen = this.gen;
    const wanted = this.workers.length;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const slot = this.helperVisitedByGen.get(gen);
      if (slot && slot.reports >= wanted) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const slot = this.helperVisitedByGen.get(gen);
    return {
      mainVisited: this.wasm.getSearchNodes() + this.wasm.getSearchLeaves(),
      helperVisited: slot ? slot.visited : 0,
      depth: this.wasm.getSearchDepth(),
      score: this.wasm.getSearchScore(),
    };
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
