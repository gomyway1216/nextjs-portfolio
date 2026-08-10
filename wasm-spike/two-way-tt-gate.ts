import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { buildNnueFixedTimeOpening } from './nnue-fixed-time-opening';
import { loadShogiWasm, syncWasm, teFromWasmKey, type ShogiSearchWasm } from './search-driver';

interface NnueWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
}

function arg(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${flag} is required`);
  return value;
}

function identity(path: string): { bytes: number; sha256: string } {
  const bytes = readFileSync(path);
  return { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function loadWeights(wasm: NnueWasm, path: string): void {
  const weights = readFileSync(path);
  wasm.setNnueBuckets(81);
  if (wasm.getNnueWeightsSize() !== weights.byteLength) throw new Error('NNUE weight size mismatch');
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), weights.byteLength).set(weights);
  wasm.setNnueScaleK(600);
  wasm.setNnueEnabled(1);
}

function positions(): Array<{ position: KyokumenImproved; tesu: number }> {
  const result: Array<{ position: KyokumenImproved; tesu: number }> = [];
  for (let caseIndex = 0; caseIndex < 8; caseIndex += 1) {
    const position = new KyokumenImproved();
    position.initHirate();
    for (const source of buildNnueFixedTimeOpening(26_460_001 + caseIndex, 0).moves) {
      const move = source.clone();
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }
    for (let ply = 0; ply < caseIndex * 3; ply += 1) {
      const legal = GenerateMovesImproved.generateLegalMoves(position);
      if (legal.length === 0) break;
      const move = legal[(caseIndex * 19 + ply * 11) % legal.length].clone();
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
    }
    result.push({ position, tesu: 6 + caseIndex * 3 });
  }
  return result;
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
  const candidatePath = arg('--candidate');
  const weightsPath = arg('--weights');
  const candidateBytes = readFileSync(candidatePath);
  if (!WebAssembly.validate(candidateBytes)) throw new Error('candidate WebAssembly.validate failed');
  const production = loadShogiWasm() as NnueWasm;
  const candidate = loadShogiWasm(candidatePath) as NnueWasm;
  loadWeights(production, weightsPath);
  loadWeights(candidate, weightsPath);

  let cases = 0;
  let baselineWork = 0;
  let candidateWork = 0;
  let worstRatio = 0;
  let moveDifferences = 0;
  let scoreDifferences = 0;
  for (const testCase of positions()) {
    const legal = GenerateMovesImproved.generateLegalMoves(testCase.position);
    for (const depth of [4, 5, 6]) {
      const baseline = search(production, testCase.position, testCase.tesu, depth);
      const first = search(candidate, testCase.position, testCase.tesu, depth);
      const second = search(candidate, testCase.position, testCase.tesu, depth);
      if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('candidate is not deterministic');
      if (!Number.isFinite(first.score) || first.key === 0 || first.depth !== depth) {
        throw new Error(`invalid candidate result ${JSON.stringify(first)}`);
      }
      const move = teFromWasmKey(first.key, testCase.position);
      if (!legal.some((entry) => entry.koma === move.koma && entry.from === move.from && entry.to === move.to && entry.promote === move.promote)) {
        throw new Error('candidate returned an illegal move');
      }
      const baselineCaseWork = baseline.nodes + baseline.leaves;
      const candidateCaseWork = first.nodes + first.leaves;
      const ratio = candidateCaseWork / Math.max(1, baselineCaseWork);
      if (ratio > 1.25) throw new Error(`unbounded work ratio ${ratio}`);
      baselineWork += baselineCaseWork;
      candidateWork += candidateCaseWork;
      worstRatio = Math.max(worstRatio, ratio);
      if (first.key !== baseline.key) moveDifferences += 1;
      if (first.score !== baseline.score) scoreDifferences += 1;
      cases += 1;
    }
  }
  process.stdout.write(`${JSON.stringify({
    schema: 'shogi-two-way-depth-preferred-tt-gate-v1',
    candidate: identity(candidatePath),
    weights: identity(weightsPath),
    cases,
    deterministic: true,
    legal: true,
    baselineWork,
    candidateWork,
    aggregateWorkRatio: candidateWork / baselineWork,
    worstWorkRatio: worstRatio,
    moveDifferences,
    scoreDifferences,
    faults: 0,
  }, null, 2)}\n`);
}

main();
