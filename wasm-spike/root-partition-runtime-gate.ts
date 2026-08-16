import { resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GOTE, SENTE, Te } from '../src/components/game/ShogiImproved/types';
import { buildNnueFixedTimeOpening } from './nnue-fixed-time-opening';
import { teFromWasmKey } from './search-driver';
import {
  loadProductionWasm,
  RootPartitionPlayer,
  syncProductionWasm,
  type ProductionWasm,
} from './rootPartitionPlayer';

function requiredArg(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${flag} is required`);
  return resolve(value);
}

function isSameMove(a: Te, b: Te): boolean {
  return a.koma === b.koma && a.from === b.from && a.to === b.to && a.promote === b.promote;
}

function applyMove(position: KyokumenImproved, source: Te): void {
  const move = source.clone();
  move.capture = position.get(move.to);
  position.move(move);
  position.toggleTeban();
}

function buildPositions(): Array<{ label: string; position: KyokumenImproved; tesu: number }> {
  const positions: Array<{ label: string; position: KyokumenImproved; tesu: number }> = [];
  for (let caseIndex = 0; caseIndex < 8; caseIndex += 1) {
    const position = new KyokumenImproved();
    position.initHirate();
    const opening = buildNnueFixedTimeOpening(26_460_001 + caseIndex, 0);
    for (const move of opening.moves) applyMove(position, move);
    for (let ply = 0; ply < caseIndex * 2; ply += 1) {
      const legal = GenerateMovesImproved.generateLegalMoves(position);
      if (legal.length === 0) break;
      applyMove(position, legal[(caseIndex * 17 + ply * 13) % legal.length]);
    }
    positions.push({ label: `case${caseIndex}`, position, tesu: 6 + caseIndex * 2 });
  }
  return positions;
}

function runBaseline(
  wasm: ProductionWasm,
  position: KyokumenImproved,
  tesu: number,
  maxTimeMs: number,
): { key: number; move: Te; wallMs: number } {
  syncProductionWasm(wasm, position);
  wasm.setRootTesu(tesu);
  const started = performance.now();
  const key = wasm.searchBestMove(maxTimeMs, 32, 10);
  const wallMs = performance.now() - started;
  if (key === 0) throw new Error('baseline returned no move');
  const move = teFromWasmKey(key, position);
  const legal = GenerateMovesImproved.generateLegalMoves(position);
  if (!legal.some((entry) => isSameMove(entry, move))) throw new Error('baseline returned illegal move');
  return { key, move, wallMs };
}

async function playSmokeGame(
  candidate: RootPartitionPlayer,
  baseline: ProductionWasm,
  candidateIsSente: boolean,
): Promise<{ plies: number; candidateMoves: number; baselineMoves: number }> {
  const position = new KyokumenImproved();
  position.initHirate();
  for (const move of buildNnueFixedTimeOpening(26_460_001, 0).moves) applyMove(position, move);
  candidate.newGame();
  baseline.clearTT();
  const repetitions = new Map<number, number>();
  let candidateMoves = 0;
  let baselineMoves = 0;
  for (let ply = 6; ply < 128; ply += 1) {
    repetitions.set(position.HashVal, (repetitions.get(position.HashVal) ?? 0) + 1);
    if ((repetitions.get(position.HashVal) ?? 0) >= 4) {
      return { plies: ply, candidateMoves, baselineMoves };
    }
    const legal = GenerateMovesImproved.generateLegalMoves(position);
    if (legal.length === 0) return { plies: ply, candidateMoves, baselineMoves };
    const candidateToMove = candidateIsSente ? position.teban === SENTE : position.teban === GOTE;
    let move: Te;
    if (candidateToMove) {
      const decision = await candidate.search(position, ply, 100);
      if (decision.fallback || decision.errors.length > 0) {
        throw new Error(`candidate smoke used fallback: ${decision.errors.join('; ')}`);
      }
      move = decision.move;
      candidateMoves += 1;
    } else {
      move = runBaseline(baseline, position, ply, 100).move;
      baselineMoves += 1;
    }
    if (!legal.some((entry) => isSameMove(entry, move))) throw new Error(`illegal smoke move at ply ${ply}`);
    applyMove(position, move);
  }
  return { plies: 128, candidateMoves, baselineMoves };
}

async function main(): Promise<void> {
  const candidatePath = requiredArg('--candidate');
  const weightsPath = requiredArg('--weights');
  const candidate = new RootPartitionPlayer(candidatePath, weightsPath);
  const baseline = loadProductionWasm(weightsPath);
  try {
    await candidate.ready();
    const rssAfterReady = process.memoryUsage().rss;
    const positions = buildPositions();

    candidate.newGame();
    await candidate.search(positions[0].position, positions[0].tesu, 50);

    let baselineWallTotal = 0;
    let candidateWallTotal = 0;
    let partition0Calls = 0;
    let partition1Calls = 0;
    for (const testCase of positions) {
      baseline.clearTT();
      const baselineResult = runBaseline(baseline, testCase.position, testCase.tesu, 500);
      candidate.newGame();
      const decision = await candidate.search(testCase.position, testCase.tesu, 500);
      if (decision.fallback || decision.errors.length > 0 || !decision.results[0] || !decision.results[1]) {
        throw new Error(`${testCase.label}: incomplete parallel decision ${JSON.stringify(decision.errors)}`);
      }
      if (decision.results[0].subsetCount <= 0 || decision.results[1].subsetCount <= 0) {
        throw new Error(`${testCase.label}: vacuous partition`);
      }
      baselineWallTotal += baselineResult.wallMs;
      candidateWallTotal += decision.wallMs;
      partition0Calls += 1;
      partition1Calls += 1;
    }
    const wallRatio = candidateWallTotal / baselineWallTotal;
    if (wallRatio > 1.05) {
      throw new Error(`parallel wall ratio ${wallRatio.toFixed(6)} exceeds 1.05`);
    }

    candidate.newGame();
    const oneFault = await candidate.search(positions[0].position, positions[0].tesu, 100, {
      ignoreRemainders: [0],
    });
    if (oneFault.fallback || oneFault.winner !== 1 || oneFault.errors.length !== 1) {
      throw new Error(`single-partition fault did not use valid peer: ${JSON.stringify(oneFault)}`);
    }

    candidate.newGame();
    const twoFaults = await candidate.search(positions[0].position, positions[0].tesu, 100, {
      ignoreRemainders: [0, 1],
    });
    if (!twoFaults.fallback || twoFaults.winner !== 'fallback' || twoFaults.errors.length !== 2) {
      throw new Error(`dual fault did not fail closed: ${JSON.stringify(twoFaults)}`);
    }

    const smoke = [
      await playSmokeGame(candidate, baseline, true),
      await playSmokeGame(candidate, baseline, false),
    ];

    process.stdout.write(
      `${JSON.stringify(
        {
          schema: 'shogi-root-partition-runtime-gate-v1',
          candidate: candidatePath,
          positions: positions.length,
          partition0Calls,
          partition1Calls,
          baselineWallMs: baselineWallTotal,
          candidateWallMs: candidateWallTotal,
          wallRatio,
          rssAfterReady,
          oneFaultFallback: oneFault.fallback,
          dualFaultFallback: twoFaults.fallback,
          smoke,
          faults: 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await candidate.close();
  }
}

void main();
