/**
 * G1 gate for a 1-bucket model and its exact 81-bucket HalfKP lift.
 *
 * The lifted model may proceed only when it is bit-exact on evaluation and
 * fixed-depth search, and its median and aggregate fixed-work search
 * throughput are both within the configured slowdown budget.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/halfkp-g1-gate.ts \
 *     --wasm-path wasm-spike/artifacts/shogi-halfkp81-dual-research.wasm \
 *     --live public/shogi-nnue-weights.bin --lift /path/to/halfkp-lift.bin \
 *     [--threshold-pct 5] [--json /path/to/g1.json]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { OU, getKomashu } from '../src/components/game/ShogiImproved/types';
import {
  NNUE_HALFKP_BUCKETS,
  NNUE_HALFKP_DUAL_FORMAT,
  bucketsForByteLength,
  mulberry32,
} from './nnue-ref';
import { loadShogiWasm, syncWasm, type ShogiSearchWasm } from './search-driver';

interface NnueWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  getNnueBuckets(): number;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numer: number, denom: number): void;
  setNnueEnabled(flag: number): void;
  setNnueForceFull(flag: number): void;
  nnueEvaluateCp(): number;
}

interface PositionCase {
  index: number;
  label: string;
  k: KyokumenImproved;
  tesu: number;
  followsKingMove: boolean;
}

interface SearchResult {
  key: number;
  score: number;
  nodes: number;
  leaves: number;
  elapsedMs: number;
}

interface TimingSample {
  searches: number;
  nodes: number;
  elapsedMs: number;
  nps: number;
  exact: boolean;
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function numberArg(flag: string, fallback: number, minimum: number): number {
  const raw = arg(flag);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${flag} must be a finite number >= ${minimum}`);
  }
  return value;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function loadModel(path: string, expectedBuckets: number, wasmPath: string): { wasm: NnueWasm; report: object } {
  const wasm = loadShogiWasm(wasmPath) as NnueWasm;
  const memoryBeforeBytes = wasm.memory.buffer.byteLength;
  const readStarted = performance.now();
  const bytes = readFileSync(path);
  const readMs = performance.now() - readStarted;
  const buckets = bucketsForByteLength(bytes.byteLength);
  if (buckets !== expectedBuckets) {
    throw new Error(`${path}: detected ${buckets} buckets; expected ${expectedBuckets}`);
  }

  const installStarted = performance.now();
  wasm.setNnueBuckets(buckets);
  if (wasm.getNnueBuckets() !== buckets || wasm.getNnueWeightsSize() !== bytes.byteLength) {
    throw new Error(
      `${path}: WASM layout mismatch (buckets=${wasm.getNnueBuckets()}, bytes=${wasm.getNnueWeightsSize()})`
    );
  }
  const memoryAfterBucketSelectBytes = wasm.memory.buffer.byteLength;
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), bytes.byteLength).set(bytes);
  wasm.setNnueScaleK(600);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
  const installMs = performance.now() - installStarted;

  return {
    wasm,
    report: {
      path: resolve(path),
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      buckets,
      readMs,
      installMs,
      totalLoadMs: readMs + installMs,
      memoryBeforeBytes,
      memoryAfterBucketSelectBytes,
      memoryAfterLoadBytes: wasm.memory.buffer.byteLength,
    },
  };
}

/** Deterministic legal play, periodically preferring a king move when one exists. */
function buildPositions(target: number): { positions: PositionCase[]; kingMoves: number } {
  const positions: PositionCase[] = [];
  let kingMoves = 0;
  for (let game = 0; positions.length < target; game++) {
    const rnd = mulberry32(0x917e51 + game * 104729);
    const k = new KyokumenImproved();
    k.initHirate();
    positions.push({
      index: positions.length,
      label: `game${game}-ply0`,
      k: k.clone(),
      tesu: 0,
      followsKingMove: false,
    });
    for (let ply = 0; ply < 120 && positions.length < target; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const kings = moves.filter((move) => move.from !== 0 && getKomashu(move.koma) === OU);
      const preferKing = ply >= 8 && ply % 11 === 8 && kings.length > 0;
      const pool = preferKing ? kings : moves;
      const move = pool[Math.floor(rnd() * pool.length)];
      move.capture = k.get(move.to);
      k.move(move);
      k.toggleTeban();
      const followsKingMove = getKomashu(move.koma) === OU;
      if (followsKingMove) kingMoves++;
      positions.push({
        index: positions.length,
        label: `game${game}-ply${ply + 1}`,
        k: k.clone(),
        tesu: ply + 1,
        followsKingMove,
      });
    }
  }
  return { positions: positions.slice(0, target), kingMoves };
}

function representativePositions(positions: PositionCase[], count: number): PositionCase[] {
  const selected = new Map<number, PositionCase>();
  for (const position of positions.filter((p) => p.followsKingMove).slice(0, 2)) {
    selected.set(position.index, position);
  }
  for (let i = 1; selected.size < count && i <= count * 2; i++) {
    const index = Math.min(positions.length - 1, Math.floor((i * positions.length) / (count + 1)));
    selected.set(index, positions[index]);
  }
  for (let i = 1; selected.size < count && i < positions.length; i++) selected.set(i, positions[i]);
  return [...selected.values()].slice(0, count).sort((a, b) => a.index - b.index);
}

function search(wasm: NnueWasm, position: PositionCase, depth: number): SearchResult {
  wasm.clearTT();
  syncWasm(wasm, position.k);
  wasm.setRootTesu(position.tesu);
  const started = performance.now();
  const key = wasm.searchBestMove(0, depth, 8);
  const elapsedMs = performance.now() - started;
  return {
    key,
    score: wasm.getSearchScore(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
    elapsedMs,
  };
}

function sameSearch(a: SearchResult, b: SearchResult): boolean {
  return a.key === b.key && a.score === b.score && a.nodes === b.nodes && a.leaves === b.leaves;
}

function timingSample(
  wasm: NnueWasm,
  position: PositionCase,
  depth: number,
  expected: SearchResult,
  minimumMs: number
): TimingSample {
  let searches = 0;
  let elapsedMs = 0;
  let exact = true;
  while (elapsedMs < minimumMs) {
    const result = search(wasm, position, depth);
    exact &&= sameSearch(result, expected);
    elapsedMs += result.elapsedMs;
    searches++;
  }
  const nodes = searches * expected.nodes;
  return { searches, nodes, elapsedMs, nps: (nodes * 1000) / elapsedMs, exact };
}

function writeJson(path: string | null, report: object): void {
  if (!path) return;
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`JSON report: ${absolute}`);
}

function main(): void {
  const livePath = arg('--live');
  const liftPath = arg('--lift');
  const wasmPath = arg('--wasm-path');
  if (!livePath || !liftPath || !wasmPath) {
    throw new Error(
      'usage: --wasm-path <HalfKP research WASM> --live <1-bucket weights.bin> --lift <81-bucket exact-lift.bin>'
    );
  }
  const positionCount = Math.floor(numberArg('--positions', 1000, 1000));
  const searchCases = Math.floor(numberArg('--search-cases', 6, 4));
  const depth = Math.floor(numberArg('--depth', 5, 1));
  const reps = Math.floor(numberArg('--reps', 3, 3));
  const minimumTimingMs = numberArg('--min-timing-ms', 250, 50);
  const thresholdPct = numberArg('--threshold-pct', 5, 0);
  const jsonPath = arg('--json');

  const wasmBytes = readFileSync(wasmPath);
  const runtime = {
    path: resolve(wasmPath),
    bytes: wasmBytes.byteLength,
    sha256: sha256(wasmBytes),
    scope: 'single-instance research gate; not the browser production runtime',
  };
  const liftFormat = bucketsForByteLength(readFileSync(liftPath).byteLength);
  if (liftFormat !== NNUE_HALFKP_BUCKETS && liftFormat !== NNUE_HALFKP_DUAL_FORMAT) {
    throw new Error(`${liftPath}: expected single or dual 81-bucket HalfKP exact lift`);
  }
  const live = loadModel(livePath, 1, wasmPath);
  const lift = loadModel(liftPath, liftFormat, wasmPath);
  console.log(
    `loaded research WASM ${runtime.bytes} bytes sha256=${runtime.sha256}; ` +
      `live (1 bucket) and exact lift (${liftFormat === NNUE_HALFKP_DUAL_FORMAT ? 'dual-81' : 'single-81'})`
  );

  const corpus = buildPositions(positionCount);
  if (corpus.kingMoves === 0) throw new Error('position coverage failure: no king move was exercised');
  let staticMismatches = 0;
  const staticMismatchExamples: object[] = [];
  for (const position of corpus.positions) {
    syncWasm(live.wasm, position.k);
    syncWasm(lift.wasm, position.k);
    const liveCp = live.wasm.nnueEvaluateCp() | 0;
    const liftCp = lift.wasm.nnueEvaluateCp() | 0;
    if (liveCp !== liftCp) {
      staticMismatches++;
      if (staticMismatchExamples.length < 10) {
        staticMismatchExamples.push({ index: position.index, label: position.label, liveCp, liftCp });
      }
    }
  }
  console.log(
    `static eval: ${positionCount - staticMismatches}/${positionCount} exact; ` +
      `${corpus.kingMoves} generating king moves`
  );

  const cases = representativePositions(corpus.positions, searchCases);
  const fixedResults: object[] = [];
  let fixedMismatches = 0;
  const timingRows: Array<{
    label: string;
    nodes: number;
    liveBest: TimingSample;
    liftBest: TimingSample;
    slowdownPct: number;
  }> = [];

  if (staticMismatches === 0) {
    for (const position of cases) {
      const liveExact = search(live.wasm, position, depth);
      const liftExact = search(lift.wasm, position, depth);
      const exact = sameSearch(liveExact, liftExact);
      if (!exact) fixedMismatches++;
      fixedResults.push({ label: position.label, followsKingMove: position.followsKingMove, live: liveExact, lift: liftExact, exact });

      const liveSamples: TimingSample[] = [];
      const liftSamples: TimingSample[] = [];
      for (let rep = 0; rep < reps; rep++) {
        const order: Array<['live' | 'lift', NnueWasm]> =
          rep % 2 === 0
            ? [
                ['live', live.wasm],
                ['lift', lift.wasm],
              ]
            : [
                ['lift', lift.wasm],
                ['live', live.wasm],
              ];
        for (const [name, wasm] of order) {
          const sample = timingSample(wasm, position, depth, liveExact, minimumTimingMs);
          if (!sample.exact) {
            fixedMismatches++;
            fixedResults.push({ label: `${position.label}-timing-rep${rep}-${name}`, exact: false });
          }
          (name === 'live' ? liveSamples : liftSamples).push(sample);
        }
      }
      const liveBest = liveSamples.reduce((best, sample) => (sample.nps > best.nps ? sample : best));
      const liftBest = liftSamples.reduce((best, sample) => (sample.nps > best.nps ? sample : best));
      timingRows.push({
        label: position.label,
        nodes: liveExact.nodes,
        liveBest,
        liftBest,
        slowdownPct: (1 - liftBest.nps / liveBest.nps) * 100,
      });
    }
  }

  const liveTotalNodes = timingRows.reduce((sum, row) => sum + row.liveBest.nodes, 0);
  const liftTotalNodes = timingRows.reduce((sum, row) => sum + row.liftBest.nodes, 0);
  const liveTotalMs = timingRows.reduce((sum, row) => sum + row.liveBest.elapsedMs, 0);
  const liftTotalMs = timingRows.reduce((sum, row) => sum + row.liftBest.elapsedMs, 0);
  const liveAggregateNps = liveTotalMs > 0 ? (liveTotalNodes * 1000) / liveTotalMs : 0;
  const liftAggregateNps = liftTotalMs > 0 ? (liftTotalNodes * 1000) / liftTotalMs : 0;
  const medianSlowdownPct = timingRows.length ? median(timingRows.map((row) => row.slowdownPct)) : null;
  const aggregateSlowdownPct = liveAggregateNps > 0 ? (1 - liftAggregateNps / liveAggregateNps) * 100 : null;
  const speedPass =
    medianSlowdownPct !== null &&
    aggregateSlowdownPct !== null &&
    medianSlowdownPct <= thresholdPct &&
    aggregateSlowdownPct <= thresholdPct;
  const passed = staticMismatches === 0 && fixedMismatches === 0 && speedPass;

  const report = {
    schemaVersion: 2,
    gate: liftFormat === NNUE_HALFKP_DUAL_FORMAT ? 'halfkp-dual-exact-lift-g1' : 'halfkp-exact-lift-g1',
    status: passed ? 'pass' : 'fail',
    runtime,
    config: {
      positionCount,
      searchCases,
      depth,
      qDepth: 8,
      reps,
      minimumTimingMs,
      thresholdPct,
      scaleK: 600,
      liftFormat,
      dualPerspective: liftFormat === NNUE_HALFKP_DUAL_FORMAT,
    },
    models: { live: live.report, lift: lift.report },
    corpus: { positions: corpus.positions.length, generatingKingMoves: corpus.kingMoves },
    staticEvaluation: { compared: positionCount, mismatches: staticMismatches, examples: staticMismatchExamples },
    fixedDepthSearch: { cases: cases.length, mismatches: fixedMismatches, results: fixedResults },
    throughput: {
      method: 'fixed-depth fixed-work search, best nodes/second of repeated minimum-duration samples',
      rows: timingRows,
      liveAggregateNps,
      liftAggregateNps,
      medianSlowdownPct,
      aggregateSlowdownPct,
      thresholdPct,
      pass: speedPass,
    },
  };
  writeJson(jsonPath, report);

  console.log(`fixed-depth search: ${fixedMismatches === 0 ? `${cases.length}/${cases.length} exact` : `${fixedMismatches} mismatches`}`);
  console.log(
    `throughput slowdown: median=${medianSlowdownPct?.toFixed(2) ?? 'n/a'}%, ` +
      `aggregate=${aggregateSlowdownPct?.toFixed(2) ?? 'n/a'}% (limit ${thresholdPct.toFixed(2)}%)`
  );
  console.log(`G1 ${passed ? 'PASS' : 'FAIL'}`);
  if (!passed) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
