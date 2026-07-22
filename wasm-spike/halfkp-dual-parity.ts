/**
 * Synthetic parity and epoch-0 exact-lift gate for the isolated dual HalfKP
 * research runtime. This intentionally runs no long match.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/halfkp-dual-parity.ts \
 *     --wasm-path wasm-spike/artifacts/shogi-halfkp81-dual-research.wasm
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GHI, GOTE, GOU, SFU, SENTE, SOU, type Te } from '../src/components/game/ShogiImproved/types';
import {
  NNUE_HALFKP_DUAL_FORMAT,
  NNUE_HALFKP_DUAL_LAYOUT,
  dualWeightsFromBuffer,
  extractDualFeatures,
  extractFeatures,
  intForward,
  intForwardDual,
  liftLegacyWeightsToDualHalfkp,
  makeDummyWeights,
  mulberry32,
  weightsFromBuffer,
} from './nnue-ref';

interface DualWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  applyMove(koma: number, from: number, to: number, promote: number): void;
  countLegalMoves(): number;
  getHashVal(): number;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchScore(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(format: number): void;
  getNnueBuckets(): number;
  setNnueEnabled(flag: number): void;
  setNnueForceFull(flag: number): void;
  nnueEvaluate(): number;
  nnueEvaluateFast(): number;
  nnueEvaluateCp(): number;
  nnueAccMismatch(): number;
  nnueRefreshAccumulators(): void;
  benchNnueEvaluateFast(iters: number): number;
}

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function instantiate(path: string): DualWasm {
  const bytes = readFileSync(path);
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: {
      abort(_msg: number, _file: number, line: number, col: number) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports as unknown as DualWasm;
}

function sync(wasm: DualWasm, position: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      wasm.setSquare(pos, position.ban[pos]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++) wasm.setHand(koma, position.hand[koma] | 0);
  wasm.setSideToMove(position.teban);
  wasm.finalizePosition();
}

function install(wasm: DualWasm, format: number, bytes: Uint8Array): { before: number; after: number; ms: number } {
  const before = wasm.memory.buffer.byteLength;
  const started = performance.now();
  wasm.setNnueBuckets(format);
  if (wasm.getNnueBuckets() !== format || wasm.getNnueWeightsSize() !== bytes.byteLength) {
    throw new Error(
      `runtime layout mismatch: format=${wasm.getNnueBuckets()} bytes=${wasm.getNnueWeightsSize()}`,
    );
  }
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), bytes.byteLength).set(bytes);
  wasm.setNnueEnabled(1);
  return { before, after: wasm.memory.buffer.byteLength, ms: performance.now() - started };
}

function chooseMove(
  moves: Te[],
  side: number,
  ply: number,
  random: () => number,
): Te {
  if (ply >= 8 && ply % 7 === 1) {
    const king = side === SENTE ? SOU : GOU;
    const kings = moves.filter((move) => move.from !== 0 && move.koma === king);
    if (kings.length > 0) return kings[Math.floor(random() * kings.length)];
  }
  return moves[Math.floor(random() * moves.length)];
}

function searchSnapshot(wasm: DualWasm, position: KyokumenImproved, tesu: number) {
  sync(wasm, position);
  wasm.clearTT();
  wasm.setRootTesu(tesu);
  const key = wasm.searchBestMove(0, 4, 8);
  return {
    key,
    score: wasm.getSearchScore(),
    nodes: wasm.getSearchNodes(),
    leaves: wasm.getSearchLeaves(),
  };
}

function main(): void {
  const wasmPath = arg('--wasm-path');
  if (!wasmPath) throw new Error('usage: --wasm-path <dual HalfKP research WASM>');

  const sourceBytes = makeDummyWeights(0x51de, 1);
  const sourceWeights = weightsFromBuffer(sourceBytes.buffer, sourceBytes.byteOffset, 1);
  const dualBytes = liftLegacyWeightsToDualHalfkp(sourceBytes);
  const dualWeights = dualWeightsFromBuffer(dualBytes.buffer, dualBytes.byteOffset);
  const legacyWasm = instantiate(resolve(wasmPath));
  const dualWasm = instantiate(resolve(wasmPath));
  install(legacyWasm, 1, sourceBytes);
  const load = install(dualWasm, NNUE_HALFKP_DUAL_FORMAT, dualBytes);

  const positions: Array<{ position: KyokumenImproved; tesu: number }> = [];
  for (let game = 0; positions.length < 160; game++) {
    const random = mulberry32(0xd001 + game * 104729);
    const position = new KyokumenImproved();
    position.initHirate();
    positions.push({ position: position.clone(), tesu: 0 });
    for (let ply = 0; ply < 80 && positions.length < 160; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(position);
      if (moves.length === 0) break;
      const move = chooseMove(moves, position.teban, ply, random);
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
      positions.push({ position: position.clone(), tesu: ply + 1 });
    }
  }

  for (const [index, sample] of positions.entries()) {
    const legacy = intForward(sourceWeights, extractFeatures(sample.position, 1)) | 0;
    const dual = intForwardDual(dualWeights, extractDualFeatures(sample.position)) | 0;
    if (legacy !== dual) throw new Error(`epoch-0 TS mismatch at position ${index}: ${legacy} != ${dual}`);
    sync(legacyWasm, sample.position);
    sync(dualWasm, sample.position);
    const legacyRuntime = legacyWasm.nnueEvaluate() | 0;
    const dualRuntime = dualWasm.nnueEvaluate() | 0;
    if (legacyRuntime !== legacy || dualRuntime !== dual || legacyRuntime !== dualRuntime) {
      throw new Error(
        `epoch-0 runtime mismatch at position ${index}: legacy=${legacyRuntime}/${legacy} dual=${dualRuntime}/${dual}`,
      );
    }
  }

  for (const sample of [positions[39], positions[103]]) {
    const legacy = searchSnapshot(legacyWasm, sample.position, sample.tesu);
    const dual = searchSnapshot(dualWasm, sample.position, sample.tesu);
    if (JSON.stringify(legacy) !== JSON.stringify(dual)) {
      throw new Error(`epoch-0 fixed-depth search mismatch: ${JSON.stringify({ legacy, dual })}`);
    }
  }

  // Make the opponent half and added hidden layer non-vacuous, then verify the
  // runtime against the independent TS reference through incremental play.
  // W1 gets a deterministic per-bucket fingerprint as well: a wrong king
  // bucket or missed crossing refresh can no longer hide behind repeated
  // exact-lift rows.
  const randomTail = mulberry32(0x82d00d);
  for (let bucket = 0; bucket < 81; bucket++) {
    const fingerprint = bucket - 40;
    for (let feature = 0; feature < 28 * 81; feature++) {
      const index = (bucket * 28 * 81 + feature) * 256;
      dualWeights.w1Board[index] += fingerprint;
    }
    for (let feature = 0; feature < 14; feature++) {
      const index = (bucket * 14 + feature) * 256;
      dualWeights.w1Hand[index] += fingerprint;
    }
  }
  for (let row = 0; row < 32; row++) {
    const base = row * 512;
    for (let j = 256; j < 512; j++) dualWeights.w2[base + j] = Math.floor(randomTail() * 17) - 8;
  }
  dualWeights.w3.fill(0);
  for (let row = 0; row < 32; row++) {
    dualWeights.w3[row * 32 + row] = 64;
    dualWeights.w3[row * 32 + ((row + 7) % 32)] = Math.floor(randomTail() * 9) - 4;
    dualWeights.b3[row] = Math.floor(randomTail() * 257) - 128;
  }
  const firstLayer = dualBytes.subarray(0, NNUE_HALFKP_DUAL_LAYOUT.b1Off);
  new Uint8Array(dualWasm.memory.buffer, dualWasm.getNnueWeightsPtr(), firstLayer.byteLength).set(
    firstLayer,
  );
  const tail = dualBytes.subarray(NNUE_HALFKP_DUAL_LAYOUT.w2Off);
  new Uint8Array(
    dualWasm.memory.buffer,
    dualWasm.getNnueWeightsPtr() + NNUE_HALFKP_DUAL_LAYOUT.w2Off,
    tail.byteLength,
  ).set(tail);
  dualWasm.nnueRefreshAccumulators();

  let compared = 0;
  let legalMovesChecked = 0;
  let senteKingMoves = 0;
  let goteKingMoves = 0;
  let withHands = 0;
  const usBuckets = new Set<number>();
  const themBuckets = new Set<number>();
  outer: for (let game = 0; compared < 320; game++) {
    const random = mulberry32(0xacc82 + game * 65537);
    const position = new KyokumenImproved();
    position.initHirate();
    sync(dualWasm, position);
    for (let ply = 0; ply < 120; ply++) {
      const legal = GenerateMovesImproved.generateLegalMoves(position);
      if (dualWasm.countLegalMoves() !== legal.length) {
        throw new Error(`legal move count mismatch at game ${game} ply ${ply}`);
      }
      legalMovesChecked += legal.length;
      const features = extractDualFeatures(position);
      usBuckets.add(features.us.bucket);
      themBuckets.add(features.them.bucket);
      if (features.us.hands.some((count) => count > 0)) withHands++;
      const full = dualWasm.nnueEvaluate() | 0;
      const fast = dualWasm.nnueEvaluateFast() | 0;
      const reference = intForwardDual(dualWeights, features) | 0;
      const mismatch = dualWasm.nnueAccMismatch();
      if (full !== reference || fast !== reference || mismatch !== 0) {
        throw new Error(
          `dual parity mismatch game ${game} ply ${ply}: full=${full} fast=${fast} TS=${reference} acc=${mismatch}`,
        );
      }
      compared++;
      if (compared >= 320 || legal.length === 0) break;
      const move = chooseMove(legal, position.teban, ply, random);
      if (move.koma === SOU) senteKingMoves++;
      if (move.koma === GOU) goteKingMoves++;
      move.capture = position.get(move.to);
      dualWasm.applyMove(move.koma, move.from, move.to, move.promote ? 1 : 0);
      position.move(move);
      position.toggleTeban();
      if (dualWasm.getHashVal() !== (position.HashVal | 0)) {
        throw new Error(`incremental hash mismatch at game ${game} ply ${ply}`);
      }
      if (compared >= 320) break outer;
    }
  }
  if (
    senteKingMoves === 0 ||
    goteKingMoves === 0 ||
    withHands === 0 ||
    usBuckets.size < 4 ||
    themBuckets.size < 4
  ) {
    throw new Error(`king-bucket refresh coverage missing: S=${senteKingMoves} G=${goteKingMoves}`);
  }

  sync(dualWasm, positions[80].position);
  dualWasm.nnueEvaluateFast();
  const benchStarted = performance.now();
  dualWasm.benchNnueEvaluateFast(100);
  const benchMs = performance.now() - benchStarted;
  console.log(
    JSON.stringify(
      {
        status: 'pass',
        format: NNUE_HALFKP_DUAL_FORMAT,
        weightBytes: dualBytes.byteLength,
        epoch0: { staticPositions: positions.length, fixedDepthSearchCases: 2, bitExact: true },
        synthetic: {
          positions: compared,
          legalMovesChecked,
          allMovesLegal: true,
          senteKingMoves,
          goteKingMoves,
          positionsWithHands: withHands,
          usBucketsSeen: usBuckets.size,
          themBucketsSeen: themBuckets.size,
          bucketFingerprints: true,
          fullFastReferenceExact: true,
        },
        runtime: {
          memoryBeforeBytes: load.before,
          memoryAfterBytes: load.after,
          installMs: load.ms,
          fastEval100Ms: benchMs,
        },
      },
      null,
      2,
    ),
  );
}

main();
