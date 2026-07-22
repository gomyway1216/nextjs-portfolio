/**
 * Search-path-identical runtime G1 for format84 versus live format1. Both
 * receive zero w1 and a constant-output dense tail,
 * so every evaluated position has the same score and the fixed-depth search
 * must visit the same nodes. This measures representation/runtime overhead,
 * not candidate playing strength.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GHI, SFU, type Te } from '../src/components/game/ShogiImproved/types';
import {
  NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT,
  NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT,
  NNUE_HALFKP_DUAL_FORMAT,
  NNUE_HALFKP_DUAL_LAYOUT,
  NNUE_H1,
  NNUE_LAYOUT,
  bucketsForByteLength,
  mulberry32,
} from './nnue-ref';

interface Runtime {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(format: number): void;
  setNnueEnabled(flag: number): void;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchScore(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  benchNnueEvaluateFast(iters: number): number;
}

function instantiate(path: string): Runtime {
  const bytes = readFileSync(path);
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: {
      abort: () => { throw new Error('WASM abort'); },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports as unknown as Runtime;
}

function installConstantNetwork(runtime: Runtime, format: number): void {
  const layout = format === NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT
    ? NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT
    : format === NNUE_HALFKP_DUAL_FORMAT
      ? NNUE_HALFKP_DUAL_LAYOUT
      : NNUE_LAYOUT;
  runtime.setNnueBuckets(format);
  if (runtime.getNnueWeightsSize() !== layout.totalBytes) throw new Error('layout mismatch');
  const pointer = runtime.getNnueWeightsPtr();
  new Int32Array(runtime.memory.buffer, pointer + layout.b1Off, NNUE_H1).fill(19);
  if (format === NNUE_HALFKP_DUAL_FORMAT) {
    new Int32Array(
      runtime.memory.buffer,
      pointer + NNUE_HALFKP_DUAL_LAYOUT.b4Off,
      1,
    )[0] = 12345;
  } else {
    new Int32Array(runtime.memory.buffer, pointer + layout.b3Off, 1)[0] = 12345;
  }
  runtime.setNnueEnabled(1);
}

function installWeights(runtime: Runtime, path: string): void {
  const bytes = readFileSync(path);
  const format = bucketsForByteLength(bytes.byteLength);
  runtime.setNnueBuckets(format);
  if (runtime.getNnueWeightsSize() !== bytes.byteLength) throw new Error(`${path}: layout mismatch`);
  new Uint8Array(runtime.memory.buffer, runtime.getNnueWeightsPtr(), bytes.byteLength).set(bytes);
  runtime.setNnueEnabled(1);
}

function sync(runtime: Runtime, position: KyokumenImproved): void {
  runtime.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const square = (suji << 4) + dan;
      runtime.setSquare(square, position.ban[square]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++) runtime.setHand(koma, position.hand[koma] | 0);
  runtime.setSideToMove(position.teban);
  runtime.finalizePosition();
}

function samples(): Array<{ position: KyokumenImproved; tesu: number }> {
  const result: Array<{ position: KyokumenImproved; tesu: number }> = [];
  for (const target of [0, 18, 37, 55]) {
    const random = mulberry32(0x830000 + target);
    const position = new KyokumenImproved();
    position.initHirate();
    for (let ply = 0; ply < target; ply++) {
      const legal = GenerateMovesImproved.generateLegalMoves(position);
      if (legal.length === 0) break;
      const captures = legal.filter((move) => position.get(move.to) !== 0);
      const choices = captures.length > 0 && ply % 5 === 2 ? captures : legal;
      const move: Te = choices[Math.floor(random() * choices.length)];
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }
    result.push({ position, tesu: target });
  }
  return result;
}

function one(runtime: Runtime, sample: { position: KyokumenImproved; tesu: number }) {
  sync(runtime, sample.position);
  runtime.clearTT();
  runtime.setRootTesu(sample.tesu);
  const started = performance.now();
  const key = runtime.searchBestMove(0, 5, 8);
  return {
    ms: performance.now() - started,
    key,
    score: runtime.getSearchScore(),
    nodes: runtime.getSearchNodes(),
    leaves: runtime.getSearchLeaves(),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function main(): void {
  const maxSearchSlowdownPct = 8;
  const maxRawEvalSlowdownPct = 5;
  const flag = process.argv.indexOf('--wasm-path');
  const path = flag >= 0 ? process.argv[flag + 1] : null;
  if (!path) throw new Error('usage: --wasm-path <BonaPiece research WASM>');
  const liveWeightsFlag = process.argv.indexOf('--live-weights');
  const candidateWeightsFlag = process.argv.indexOf('--candidate-weights');
  const liveWeightsPath = liveWeightsFlag >= 0 ? process.argv[liveWeightsFlag + 1] : null;
  const candidateWeightsPath = candidateWeightsFlag >= 0 ? process.argv[candidateWeightsFlag + 1] : null;
  if ((liveWeightsPath === null) !== (candidateWeightsPath === null)) {
    throw new Error('--live-weights and --candidate-weights must be supplied together');
  }
  const live = instantiate(resolve(path));
  const customDual = instantiate(resolve(path));
  const bona = instantiate(resolve(path));
  installConstantNetwork(live, 1);
  installConstantNetwork(customDual, NNUE_HALFKP_DUAL_FORMAT);
  installConstantNetwork(bona, NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT);
  const positions = samples();

  // Warm both paths, then alternate order to reduce thermal/order bias.
  one(live, positions[1]);
  one(bona, positions[1]);
  const liveTimes: number[] = [];
  const bonaTimes: number[] = [];
  const cases: Array<Record<string, number>> = [];
  for (let repeat = 0; repeat < 5; repeat++) {
    for (const [index, sample] of positions.entries()) {
      const firstBona = (repeat + index) % 2 === 0;
      const first = one(firstBona ? bona : live, sample);
      const second = one(firstBona ? live : bona, sample);
      const b = firstBona ? second : first;
      const c = firstBona ? first : second;
      if (b.key !== c.key || b.score !== c.score || b.nodes !== c.nodes || b.leaves !== c.leaves) {
        throw new Error(`non-identical search at repeat=${repeat} sample=${index}`);
      }
      liveTimes.push(b.ms);
      bonaTimes.push(c.ms);
      cases.push({ repeat, sample: index, nodes: b.nodes, liveMs: b.ms, bonaMs: c.ms });
    }
  }
  const liveMedian = median(liveTimes);
  const bonaMedian = median(bonaTimes);
  const slowdownPct = (bonaMedian / liveMedian - 1) * 100;

  const benchPosition = positions[2].position;
  for (const runtime of [live, customDual, bona]) sync(runtime, benchPosition);
  const evalIters = 100_000;
  const raw: Record<string, number[]> = { live1: [], custom82: [], bona84: [] };
  for (let repeat = 0; repeat < 9; repeat++) {
    for (const [name, runtime] of [
      ['live1', live],
      ['custom82', customDual],
      ['bona84', bona],
    ] as const) {
      const started = performance.now();
      runtime.benchNnueEvaluateFast(evalIters);
      raw[name].push(performance.now() - started);
    }
  }
  const rawMedian = Object.fromEntries(
    Object.entries(raw).map(([name, values]) => [name, median(values)]),
  ) as Record<string, number>;
  let rawEvalRealWeights: Record<string, unknown> | null = null;
  let realWeightSlowdownPct: number | null = null;
  if (liveWeightsPath && candidateWeightsPath) {
    const realLive = instantiate(resolve(path));
    const realCandidate = instantiate(resolve(path));
    installWeights(realLive, liveWeightsPath);
    installWeights(realCandidate, candidateWeightsPath);
    sync(realLive, benchPosition);
    sync(realCandidate, benchPosition);
    const values: Record<string, number[]> = { live1: [], bona84: [] };
    for (let repeat = 0; repeat < 9; repeat++) {
      for (const [name, runtime] of [
        ['live1', realLive], ['bona84', realCandidate],
      ] as const) {
        const started = performance.now();
        runtime.benchNnueEvaluateFast(evalIters);
        values[name].push(performance.now() - started);
      }
    }
    const liveMs = median(values.live1);
    const bonaMs = median(values.bona84);
    realWeightSlowdownPct = (bonaMs / liveMs - 1) * 100;
    rawEvalRealWeights = {
      position: 2,
      iterations: evalIters,
      repeats: 9,
      liveMedianMs: liveMs,
      bonaMedianMs: bonaMs,
      slowdownVsLivePct: realWeightSlowdownPct,
      searchPathComparable: false,
    };
  }
  const rawEvalSlowdownPct = (rawMedian.bona84 / rawMedian.live1 - 1) * 100;
  const passed =
    slowdownPct <= maxSearchSlowdownPct &&
    rawEvalSlowdownPct <= maxRawEvalSlowdownPct &&
    (realWeightSlowdownPct === null || realWeightSlowdownPct <= maxRawEvalSlowdownPct);
  console.log(JSON.stringify({
    schema: 'shogi-bonapiece-halfkp-single-runtime-g1-v1',
    status: passed ? 'pass' : 'fail',
    comparable: 'search-path-identical synthetic constant network vs live format1',
    strengthEvidence: false,
    exactCandidatePathVsLivePossible: false,
    threshold: {
      maxSearchMedianSlowdownPct: maxSearchSlowdownPct,
      maxRawEvalMedianSlowdownPct: maxRawEvalSlowdownPct,
    },
    summary: { cases: cases.length, liveMedianMs: liveMedian, bonaMedianMs: bonaMedian, slowdownPct },
    rawEval: {
      iterations: evalIters,
      repeats: 9,
      medianMs: rawMedian,
      slowdownVsLivePct: {
        custom82: (rawMedian.custom82 / rawMedian.live1 - 1) * 100,
        bona84: rawEvalSlowdownPct,
      },
    },
    rawEvalRealWeights,
    cases,
  }, null, 2));
}

main();
