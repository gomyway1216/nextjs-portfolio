import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { buildNnueFixedTimeOpening } from './nnue-fixed-time-opening';
import { jsMoveKey, loadShogiWasm, syncWasm, teFromWasmKey, type ShogiSearchWasm } from './search-driver';

interface RootPartitionWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
  setRootMovePartition(modulus: number, remainder: number): void;
  getRootMovePartitionModulus(): number;
  getRootMovePartitionRemainder(): number;
  getRootPartitionLegalMoveCount(): number;
  rootPartitionContainsMoveKey(key: number): number;
}

interface NnueWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
}

function requiredArg(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${flag} is required`);
  return resolve(value);
}

function loadWeights(wasm: NnueWasm, weightsPath: string): void {
  const weights = readFileSync(weightsPath);
  wasm.setNnueBuckets(81);
  const expected = wasm.getNnueWeightsSize();
  if (weights.byteLength !== expected) {
    throw new Error(`NNUE weights size mismatch: ${weights.byteLength} != ${expected}`);
  }
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
  wasm.setNnueScaleK(600);
  wasm.setNnueEnabled(1);
}

function buildPositions(): Array<{ label: string; position: KyokumenImproved; tesu: number }> {
  const positions: Array<{ label: string; position: KyokumenImproved; tesu: number }> = [];
  for (let caseIndex = 0; caseIndex < 8; caseIndex += 1) {
    const position = new KyokumenImproved();
    position.initHirate();
    const opening = buildNnueFixedTimeOpening(26_460_001 + caseIndex, 0);
    for (const source of opening.moves) {
      const move = source.clone();
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }
    for (let ply = 0; ply < caseIndex * 2; ply += 1) {
      const legal = GenerateMovesImproved.generateLegalMoves(position);
      if (legal.length === 0) break;
      const move = legal[(caseIndex * 17 + ply * 13) % legal.length].clone();
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }
    positions.push({ label: `case${caseIndex}`, position, tesu: 6 + caseIndex * 2 });
  }
  return positions;
}

function search(wasm: ShogiSearchWasm, position: KyokumenImproved, tesu: number, depth: number) {
  wasm.clearTT();
  syncWasm(wasm, position);
  wasm.setRootTesu(tesu);
  const key = wasm.searchBestMove(0, depth, 8);
  return {
    key,
    score: wasm.getSearchScore(),
    depth: wasm.getSearchDepth(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
  };
}

function main(): void {
  const candidatePath = requiredArg('--candidate');
  const weightsPath = requiredArg('--weights');
  const production = loadShogiWasm() as NnueWasm;
  const candidate = loadShogiWasm(candidatePath) as RootPartitionWasm;
  loadWeights(production, weightsPath);
  loadWeights(candidate, weightsPath);

  const positions = buildPositions();
  let exact = 0;
  let partitionCases = 0;
  for (const testCase of positions) {
    for (const depth of [4, 5, 6]) {
      candidate.setRootMovePartition(1, 0);
      if (candidate.getRootMovePartitionModulus() !== 1 || candidate.getRootMovePartitionRemainder() !== 0) {
        throw new Error(`${testCase.label}: default partition state mismatch`);
      }
      const baseline = search(production, testCase.position, testCase.tesu, depth);
      const disabled = search(candidate, testCase.position, testCase.tesu, depth);
      if (JSON.stringify(disabled) !== JSON.stringify(baseline)) {
        throw new Error(
          `${testCase.label} d${depth}: disabled partition mismatch\n` +
            `production=${JSON.stringify(baseline)}\ncandidate=${JSON.stringify(disabled)}`,
        );
      }
      exact += 1;
    }

    candidate.setRootMovePartition(3, 2);
    if (candidate.getRootMovePartitionModulus() !== 1 || candidate.getRootMovePartitionRemainder() !== 0) {
      throw new Error(`${testCase.label}: malformed partition did not fail closed`);
    }

    syncWasm(candidate, testCase.position);
    const legal = GenerateMovesImproved.generateLegalMoves(testCase.position);
    const membership = new Map<number, [number, number]>();
    const counts: number[] = [];
    for (let remainder = 0; remainder < 2; remainder += 1) {
      candidate.setRootMovePartition(2, remainder);
      counts.push(candidate.getRootPartitionLegalMoveCount());
      for (const move of legal) {
        const key = jsMoveKey(move);
        const pair = membership.get(key) ?? [0, 0];
        pair[remainder] = candidate.rootPartitionContainsMoveKey(key);
        membership.set(key, pair);
      }
    }
    if (counts[0] <= 0 || counts[1] <= 0 || counts[0] + counts[1] !== legal.length) {
      throw new Error(`${testCase.label}: bad partition counts ${counts.join('+')} != ${legal.length}`);
    }
    for (const [key, pair] of membership) {
      if (pair[0] + pair[1] !== 1) {
        throw new Error(`${testCase.label}: move ${key} membership is ${pair.join('/')}`);
      }
    }

    for (let remainder = 0; remainder < 2; remainder += 1) {
      candidate.setRootMovePartition(2, remainder);
      const result = search(candidate, testCase.position, testCase.tesu, 4);
      if (!Number.isFinite(result.score) || result.key === 0) {
        throw new Error(`${testCase.label}: partition ${remainder} returned invalid result ${JSON.stringify(result)}`);
      }
      if (candidate.rootPartitionContainsMoveKey(result.key) !== 1) {
        throw new Error(`${testCase.label}: partition ${remainder} returned a move outside its subset`);
      }
      const move = teFromWasmKey(result.key, testCase.position);
      const isLegal = legal.some(
        (entry) =>
          entry.koma === move.koma &&
          entry.from === move.from &&
          entry.to === move.to &&
          entry.promote === move.promote,
      );
      if (!isLegal) throw new Error(`${testCase.label}: partition ${remainder} returned an illegal move`);
    }
    partitionCases += 1;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schema: 'shogi-root-partition-technical-gate-v1',
        candidate: candidatePath,
        positions: positions.length,
        disabledExact: exact,
        partitionUnionDisjoint: partitionCases,
        faults: 0,
      },
      null,
      2,
    )}\n`,
  );
}

main();
