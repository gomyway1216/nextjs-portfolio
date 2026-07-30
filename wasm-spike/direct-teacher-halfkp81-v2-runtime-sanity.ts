/**
 * Fixed runtime/parity sanity gate for direct-teacher HalfKP81 v2.
 *
 * Both models are the same 81-bucket research format.  Evaluation equality
 * between initializer and candidate is neither required nor expected.  The
 * candidate must instead reproduce its Python int16 reference exactly and
 * stay within the preregistered five-percent fixed-depth search slowdown.
 */

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { getKomashu, OU } from '../src/components/game/ShogiImproved/types';
import {
  NNUE_HALFKP_BUCKETS,
  bucketsForByteLength,
  extractFeatures,
  intForward,
  outQToCp,
  parseSfen,
  weightsFromBuffer,
} from './nnue-ref';
import { loadShogiWasm, syncWasm, type ShogiSearchWasm } from './search-driver';

const SCHEMA = 'shogi-direct-teacher-halfkp81-v2-runtime-sanity-v1';
const REFERENCE_SCHEMA = 'shogi-direct-teacher-halfkp81-v2-int16-reference-v1';
const POSITION_COUNT = 1000;
const SEARCH_CASES = 6;
const DEPTH = 5;
const Q_DEPTH = 8;
const REPETITIONS = 3;
const MINIMUM_TIMING_MS = 250;
const SLOWDOWN_PERCENT_MAXIMUM = 5;
const K = 600;

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
  nnueEvaluate(): number;
  nnueEvaluateFast(): number;
  nnueAccMismatch(): number;
  nnueEvaluateCp(): number;
}

interface ReferencePosition {
  child_position_id: string;
  sfen: string;
  float_logit: number;
  cp_float: number;
  out_q: number;
  cp_int: number;
}

interface Reference {
  schema: string;
  candidate_weights: FileIdentity & { buckets: number };
  features: string;
  k_sigmoid: number;
  k_int: number;
  positions: ReferencePosition[];
  n: number;
}

interface FileIdentity {
  path: string;
  bytes: number;
  sha256: string;
}

interface PositionCase {
  index: number;
  label: string;
  position: KyokumenImproved;
  tesu: number;
  followsKingMove: boolean;
}

interface SearchResult {
  key: number;
  score: number;
  nodes: number;
  leaves: number;
  elapsedMs: number;
  legal: boolean;
}

interface TimingSample {
  searches: number;
  nodes: number;
  elapsedMs: number;
  nps: number;
  deterministic: boolean;
  legal: boolean;
}

function requiredArg(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index < 0 ? null : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function identity(path: string): FileIdentity {
  const absolute = resolve(path);
  const value = readFileSync(absolute);
  return { path: absolute, bytes: value.byteLength, sha256: sha256(value) };
}

function exactIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.path === right.path &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256
  );
}

function loadModel(path: string, wasmPath: string): {
  wasm: NnueWasm;
  bytes: Buffer;
  identity: FileIdentity & { buckets: number };
} {
  const absolute = resolve(path);
  const bytes = readFileSync(absolute);
  const buckets = bucketsForByteLength(bytes.byteLength);
  if (buckets !== NNUE_HALFKP_BUCKETS) {
    throw new Error(`${absolute}: expected the exact 81-bucket HalfKP format`);
  }
  const wasm = loadShogiWasm(wasmPath) as NnueWasm;
  wasm.setNnueBuckets(buckets);
  if (
    wasm.getNnueBuckets() !== buckets ||
    wasm.getNnueWeightsSize() !== bytes.byteLength
  ) {
    throw new Error(`${absolute}: WASM weight layout mismatch`);
  }
  new Uint8Array(
    wasm.memory.buffer,
    wasm.getNnueWeightsPtr(),
    bytes.byteLength,
  ).set(bytes);
  wasm.setNnueScaleK(K);
  wasm.setNnueOutputScale(1, 1);
  wasm.setNnueForceFull(0);
  wasm.setNnueEnabled(1);
  return {
    wasm,
    bytes,
    identity: {
      path: absolute,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      buckets,
    },
  };
}

function setSfen(wasm: NnueWasm, sfen: string): ReturnType<typeof parseSfen> {
  const position = parseSfen(sfen);
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const square = (suji << 4) + dan;
      if (position.ban[square] !== 0) wasm.setSquare(square, position.ban[square]);
    }
  }
  for (let piece = 0; piece < 64; piece++) {
    if (position.hand[piece] > 0) wasm.setHand(piece, position.hand[piece]);
  }
  wasm.setSideToMove(position.teban);
  wasm.finalizePosition();
  return position;
}

function verifyParity(
  model: ReturnType<typeof loadModel>,
  reference: Reference,
): { tested: number; mismatches: number; examples: object[] } {
  const weights = weightsFromBuffer(
    model.bytes.buffer,
    model.bytes.byteOffset,
    NNUE_HALFKP_BUCKETS,
  );
  let mismatches = 0;
  const examples: object[] = [];
  for (const item of reference.positions) {
    const position = setSfen(model.wasm, item.sfen);
    const wasmOutQ = model.wasm.nnueEvaluate() | 0;
    const wasmFastOutQ = model.wasm.nnueEvaluateFast() | 0;
    const accumulatorMismatches = model.wasm.nnueAccMismatch() | 0;
    const wasmCp = model.wasm.nnueEvaluateCp() | 0;
    const tsOutQ =
      intForward(
        weights,
        extractFeatures(position, NNUE_HALFKP_BUCKETS),
      ) | 0;
    const tsCp = outQToCp(tsOutQ, K) | 0;
    const matched =
      wasmOutQ === item.out_q &&
      wasmFastOutQ === item.out_q &&
      accumulatorMismatches === 0 &&
      wasmCp === item.cp_int &&
      tsOutQ === item.out_q &&
      tsCp === item.cp_int;
    if (!matched) {
      mismatches++;
      if (examples.length < 8) {
        examples.push({
          child_position_id: item.child_position_id,
          expected_out_q: item.out_q,
          wasm_out_q: wasmOutQ,
          wasm_fast_out_q: wasmFastOutQ,
          ts_out_q: tsOutQ,
          expected_cp: item.cp_int,
          wasm_cp: wasmCp,
          ts_cp: tsCp,
          accumulator_mismatches: accumulatorMismatches,
        });
      }
    }
  }
  return { tested: reference.positions.length, mismatches, examples };
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPositions(): { positions: PositionCase[]; generatingKingMoves: number } {
  const positions: PositionCase[] = [];
  let generatingKingMoves = 0;
  for (let game = 0; positions.length < POSITION_COUNT; game++) {
    const random = mulberry32(0x917e51 + game * 104729);
    const position = new KyokumenImproved();
    position.initHirate();
    positions.push({
      index: positions.length,
      label: `game${game}-ply0`,
      position: position.clone(),
      tesu: 0,
      followsKingMove: false,
    });
    for (let ply = 0; ply < 120 && positions.length < POSITION_COUNT; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(position);
      if (moves.length === 0) break;
      const kingMoves = moves.filter(
        (move) => move.from !== 0 && getKomashu(move.koma) === OU,
      );
      const pool =
        ply >= 8 && ply % 11 === 8 && kingMoves.length > 0 ? kingMoves : moves;
      const move = pool[Math.floor(random() * pool.length)];
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
      const followsKingMove = getKomashu(move.koma) === OU;
      if (followsKingMove) generatingKingMoves++;
      positions.push({
        index: positions.length,
        label: `game${game}-ply${ply + 1}`,
        position: position.clone(),
        tesu: ply + 1,
        followsKingMove,
      });
    }
  }
  return {
    positions: positions.slice(0, POSITION_COUNT),
    generatingKingMoves,
  };
}

function representativePositions(positions: PositionCase[]): PositionCase[] {
  const selected = new Map<number, PositionCase>();
  for (const item of positions.filter((row) => row.followsKingMove).slice(0, 2)) {
    selected.set(item.index, item);
  }
  for (let offset = 1; selected.size < SEARCH_CASES; offset++) {
    const index = Math.min(
      positions.length - 1,
      Math.floor((offset * positions.length) / (SEARCH_CASES + 1)),
    );
    selected.set(index, positions[index]);
  }
  return [...selected.values()].slice(0, SEARCH_CASES).sort((a, b) => a.index - b.index);
}

function decodedMoveIsLegal(key: number, position: KyokumenImproved): boolean {
  if (key === 0) return false;
  const piece = key & 0x3f;
  const from = (key >> 6) & 0xff;
  const to = (key >> 14) & 0xff;
  const promote = ((key >> 22) & 1) === 1;
  return GenerateMovesImproved.generateLegalMoves(position).some(
    (move) =>
      move.koma === piece &&
      move.from === from &&
      move.to === to &&
      move.promote === promote,
  );
}

function search(wasm: NnueWasm, item: PositionCase): SearchResult {
  wasm.clearTT();
  syncWasm(wasm, item.position);
  wasm.setRootTesu(item.tesu);
  const started = performance.now();
  const key = wasm.searchBestMove(0, DEPTH, Q_DEPTH);
  const elapsedMs = performance.now() - started;
  return {
    key,
    score: wasm.getSearchScore(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
    elapsedMs,
    legal: decodedMoveIsLegal(key, item.position),
  };
}

function sameSearch(left: SearchResult, right: SearchResult): boolean {
  return (
    left.key === right.key &&
    left.score === right.score &&
    left.nodes === right.nodes &&
    left.leaves === right.leaves
  );
}

function timingSample(
  wasm: NnueWasm,
  item: PositionCase,
  expected: SearchResult,
): TimingSample {
  let searches = 0;
  let elapsedMs = 0;
  let deterministic = true;
  let legal = true;
  while (elapsedMs < MINIMUM_TIMING_MS) {
    const result = search(wasm, item);
    deterministic &&= sameSearch(result, expected);
    legal &&= result.legal;
    elapsedMs += result.elapsedMs;
    searches++;
  }
  const nodes = searches * expected.nodes;
  return {
    searches,
    nodes,
    elapsedMs,
    nps: elapsedMs > 0 ? (nodes * 1000) / elapsedMs : 0,
    deterministic,
    legal,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function createOnlyJson(path: string, value: object): void {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  const descriptor = openSync(absolute, 'wx', 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

function main(): number {
  const wasmPath = resolve(requiredArg('--wasm'));
  const initializerPath = resolve(requiredArg('--initializer'));
  const candidatePath = resolve(requiredArg('--candidate'));
  const referencePath = resolve(requiredArg('--reference'));
  const outPath = resolve(requiredArg('--out'));

  const runtime = identity(wasmPath);
  const initializer = loadModel(initializerPath, wasmPath);
  const candidate = loadModel(candidatePath, wasmPath);
  const referenceIdentity = identity(referencePath);
  const reference = JSON.parse(readFileSync(referencePath, 'utf8')) as Reference;
  if (
    reference.schema !== REFERENCE_SCHEMA ||
    reference.n !== reference.positions.length ||
    reference.n < 1 ||
    reference.features !== 'halfkp-factor' ||
    reference.k_sigmoid !== K ||
    reference.k_int !== K ||
    !exactIdentity(reference.candidate_weights, candidate.identity) ||
    reference.candidate_weights.buckets !== NNUE_HALFKP_BUCKETS
  ) {
    throw new Error('candidate reference contract or weight binding differs');
  }

  const parity = verifyParity(candidate, reference);
  const corpus = buildPositions();
  const cases = representativePositions(corpus.positions);
  let technicalFaults = corpus.generatingKingMoves > 0 ? 0 : 1;
  const fixedRows: object[] = [];
  const timingRows: Array<{
    label: string;
    initializer: TimingSample;
    candidate: TimingSample;
    slowdown_percent: number;
  }> = [];

  for (const item of cases) {
    const initializerExpected = search(initializer.wasm, item);
    const candidateExpected = search(candidate.wasm, item);
    if (
      !initializerExpected.legal ||
      !candidateExpected.legal ||
      initializerExpected.nodes <= 0 ||
      candidateExpected.nodes <= 0
    ) {
      technicalFaults++;
    }
    fixedRows.push({
      label: item.label,
      follows_king_move: item.followsKingMove,
      initializer: initializerExpected,
      candidate: candidateExpected,
    });

    const initializerSamples: TimingSample[] = [];
    const candidateSamples: TimingSample[] = [];
    for (let repetition = 0; repetition < REPETITIONS; repetition++) {
      const order =
        repetition % 2 === 0
          ? ([
              ['initializer', initializer.wasm, initializerExpected],
              ['candidate', candidate.wasm, candidateExpected],
            ] as const)
          : ([
              ['candidate', candidate.wasm, candidateExpected],
              ['initializer', initializer.wasm, initializerExpected],
            ] as const);
      for (const [name, wasm, expected] of order) {
        const sample = timingSample(wasm, item, expected);
        if (!sample.deterministic || !sample.legal || sample.nps <= 0) {
          technicalFaults++;
        }
        (name === 'initializer' ? initializerSamples : candidateSamples).push(sample);
      }
    }
    const initializerBest = initializerSamples.reduce((best, sample) =>
      sample.nps > best.nps ? sample : best,
    );
    const candidateBest = candidateSamples.reduce((best, sample) =>
      sample.nps > best.nps ? sample : best,
    );
    timingRows.push({
      label: item.label,
      initializer: initializerBest,
      candidate: candidateBest,
      slowdown_percent:
        initializerBest.nps > 0
          ? (1 - candidateBest.nps / initializerBest.nps) * 100
          : Number.MAX_VALUE,
    });
  }

  const initializerNodes = timingRows.reduce(
    (sum, row) => sum + row.initializer.nodes,
    0,
  );
  const candidateNodes = timingRows.reduce(
    (sum, row) => sum + row.candidate.nodes,
    0,
  );
  const initializerMs = timingRows.reduce(
    (sum, row) => sum + row.initializer.elapsedMs,
    0,
  );
  const candidateMs = timingRows.reduce(
    (sum, row) => sum + row.candidate.elapsedMs,
    0,
  );
  const initializerAggregateNps = (initializerNodes * 1000) / initializerMs;
  const candidateAggregateNps = (candidateNodes * 1000) / candidateMs;
  const medianSlowdownPercent = median(
    timingRows.map((row) => row.slowdown_percent),
  );
  const aggregateSlowdownPercent =
    initializerAggregateNps > 0
      ? (1 - candidateAggregateNps / initializerAggregateNps) * 100
      : Number.MAX_VALUE;
  const throughputPass =
    Number.isFinite(medianSlowdownPercent) &&
    Number.isFinite(aggregateSlowdownPercent) &&
    medianSlowdownPercent <= SLOWDOWN_PERCENT_MAXIMUM &&
    aggregateSlowdownPercent <= SLOWDOWN_PERCENT_MAXIMUM;
  const passed =
    parity.mismatches === 0 && technicalFaults === 0 && throughputPass;

  const report = {
    schema: SCHEMA,
    status: passed ? 'complete-pass' : 'complete-fail',
    runtime,
    config: {
      position_count: POSITION_COUNT,
      search_cases: SEARCH_CASES,
      depth: DEPTH,
      q_depth: Q_DEPTH,
      repetitions: REPETITIONS,
      minimum_timing_ms: MINIMUM_TIMING_MS,
      slowdown_percent_maximum: SLOWDOWN_PERCENT_MAXIMUM,
      k: K,
      buckets: NNUE_HALFKP_BUCKETS,
    },
    models: {
      initializer: initializer.identity,
      candidate: candidate.identity,
    },
    reference: {
      ...referenceIdentity,
      schema: REFERENCE_SCHEMA,
      positions: reference.n,
    },
    parity,
    fixed_depth_search: {
      cases: cases.length,
      corpus_positions: corpus.positions.length,
      generating_king_moves: corpus.generatingKingMoves,
      rows: fixedRows,
    },
    throughput: {
      method:
        'fixed-depth fixed-work search, best nodes/second of repeated minimum-duration samples',
      rows: timingRows,
      initializer_aggregate_nps: initializerAggregateNps,
      candidate_aggregate_nps: candidateAggregateNps,
      median_slowdown_percent: medianSlowdownPercent,
      aggregate_slowdown_percent: aggregateSlowdownPercent,
      slowdown_percent_maximum: SLOWDOWN_PERCENT_MAXIMUM,
      passed: throughputPass,
    },
    technical_faults: technicalFaults,
  };
  createOnlyJson(outPath, report);
  return passed ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
