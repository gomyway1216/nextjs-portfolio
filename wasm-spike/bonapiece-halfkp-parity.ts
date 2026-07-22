/**
 * Bit-exact synthetic parity audit for the isolated single-perspective
 * BonaPiece HalfKP format84 runtime. It exercises quiet deltas, promotions,
 * king refreshes, capture/drop hand slots, both sides, and many king buckets.
 * No match or training is run here.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/bonapiece-halfkp-parity.ts \
 *     --wasm-path wasm-spike/artifacts/shogi-bonapiece-halfkp-research.wasm
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GHI, GOU, SFU, SENTE, SOU, type Te } from '../src/components/game/ShogiImproved/types';
import {
  NNUE_BONAPIECE_FE_END,
  NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT,
  NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT,
  NNUE_H1,
  NNUE_H2,
  bonaPieceHalfkpSingleWeightsFromBuffer,
  extractBonaPieceHalfkpFeatures,
  intForwardBonaPieceHalfkpSingle,
  mulberry32,
} from './nnue-ref';

interface ResearchWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  applyMove(koma: number, from: number, to: number, promote: number): void;
  countLegalMoves(): number;
  getHashVal(): number;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(format: number): void;
  getNnueBuckets(): number;
  setNnueEnabled(flag: number): void;
  nnueEvaluate(): number;
  nnueEvaluateFast(): number;
  nnueAccMismatch(): number;
  benchNnueEvaluateFast(iters: number): number;
}

function argument(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function instantiate(path: string): ResearchWasm {
  const bytes = readFileSync(path);
  return new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: {
      abort(_msg: number, _file: number, line: number, col: number) {
        throw new Error(`WASM abort at ${line}:${col}`);
      },
      now: () => performance.now(),
      sharedTtProbe: () => 0,
      sharedTtStore: () => {},
      sharedShouldStop: () => 0,
    },
  }).exports as unknown as ResearchWasm;
}

function sync(wasm: ResearchWasm, position: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const square = (suji << 4) + dan;
      wasm.setSquare(square, position.ban[square]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++) wasm.setHand(koma, position.hand[koma] | 0);
  wasm.setSideToMove(position.teban);
  wasm.finalizePosition();
}

function makeFingerprintWeights(): Uint8Array {
  const bytes = new Uint8Array(NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT.totalBytes);
  const weights = bonaPieceHalfkpSingleWeightsFromBuffer(bytes.buffer);
  weights.b1.fill(19);
  for (let feature = 0; feature < 81 * NNUE_BONAPIECE_FE_END; feature++) {
    const base = feature * NNUE_H1;
    for (let lane = 0; lane < 24; lane++) {
      weights.w1Board[base + lane] = ((feature * 13 + lane * 23) % 41) - 20;
    }
  }
  for (let row = 0; row < NNUE_H2; row++) {
    for (let column = 0; column < NNUE_H1; column++) {
      weights.w2[row * NNUE_H1 + column] = ((row * 31 + column * 11) % 15) - 7;
    }
    weights.b2[row] = (row % 7) * 64 - 192;
    weights.w3[row] = row * 3 - 47;
  }
  weights.b3[0] = 54321;
  return bytes;
}

function chooseMove(moves: Te[], ply: number, random: () => number): Te {
  const pick = (choices: Te[]) => choices[Math.floor(random() * choices.length)];
  if (ply > 8 && ply % 9 === 1) {
    const captures = moves.filter((move) => move.from !== 0 && move.capture !== 0);
    if (captures.length > 0) return pick(captures);
  }
  if (ply > 16 && ply % 11 === 2) {
    const drops = moves.filter((move) => move.from === 0);
    if (drops.length > 0) return pick(drops);
  }
  if (ply > 6 && ply % 7 === 3) {
    const kings = moves.filter((move) => move.koma === SOU || move.koma === GOU);
    if (kings.length > 0) return pick(kings);
  }
  const promotions = moves.filter((move) => move.promote);
  if (promotions.length > 0 && ply % 13 === 4) return pick(promotions);
  return pick(moves);
}

function main(): void {
  const wasmPath = argument('--wasm-path');
  if (!wasmPath) throw new Error('usage: --wasm-path <BonaPiece HalfKP research WASM>');
  const bytes = makeFingerprintWeights();
  const weights = bonaPieceHalfkpSingleWeightsFromBuffer(bytes.buffer);
  const wasm = instantiate(resolve(wasmPath));
  const memoryBefore = wasm.memory.buffer.byteLength;
  const loadStarted = performance.now();
  wasm.setNnueBuckets(NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT);
  if (
    wasm.getNnueBuckets() !== NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT ||
    wasm.getNnueWeightsSize() !== bytes.byteLength
  ) {
    throw new Error('research runtime rejected BonaPiece layout');
  }
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), bytes.byteLength).set(bytes);
  wasm.setNnueEnabled(1);
  const installMs = performance.now() - loadStarted;

  let compared = 0;
  let legalMovesChecked = 0;
  let captures = 0;
  let drops = 0;
  let kingMoves = 0;
  let promotions = 0;
  let senteToMove = 0;
  let goteToMove = 0;
  const stmBuckets = new Set<number>();
  outer: for (let game = 0; compared < 360; game++) {
    const random = mulberry32(0xb0a000 + game * 65537);
    const position = new KyokumenImproved();
    const history: Array<Record<string, number | boolean>> = [];
    position.initHirate();
    sync(wasm, position);
    for (let ply = 0; ply < 140; ply++) {
      const legal = GenerateMovesImproved.generateLegalMoves(position);
      if (legal.length === 0) break;
      for (const move of legal) move.capture = position.get(move.to);
      if (wasm.countLegalMoves() !== legal.length) {
        throw new Error(`legal move count mismatch at game=${game} ply=${ply}`);
      }
      legalMovesChecked += legal.length;
      const features = extractBonaPieceHalfkpFeatures(position);
      if (position.teban === SENTE) senteToMove++;
      else goteToMove++;
      stmBuckets.add(Math.floor(features.us[0] / NNUE_BONAPIECE_FE_END));
      const reference = intForwardBonaPieceHalfkpSingle(weights, features) | 0;
      const full = wasm.nnueEvaluate() | 0;
      const fast = wasm.nnueEvaluateFast() | 0;
      const mismatch = wasm.nnueAccMismatch();
      if (reference !== full || reference !== fast || mismatch !== 0) {
        throw new Error(
          `parity mismatch game=${game} ply=${ply}: TS=${reference} full=${full} fast=${fast} acc=${mismatch} ` +
            `history=${JSON.stringify(history.slice(-8))}`,
        );
      }
      compared++;
      if (compared >= 360) break outer;
      const move = chooseMove(legal, ply, random);
      if (move.capture !== 0) captures++;
      if (move.from === 0) drops++;
      if (move.koma === SOU || move.koma === GOU) kingMoves++;
      if (move.promote) promotions++;
      history.push({
        koma: move.koma,
        from: move.from,
        to: move.to,
        capture: move.capture,
        promote: move.promote,
      });
      wasm.applyMove(move.koma, move.from, move.to, move.promote ? 1 : 0);
      position.move(move);
      position.toggleTeban();
      if (wasm.getHashVal() !== (position.HashVal | 0)) {
        throw new Error(`hash mismatch at game=${game} ply=${ply}`);
      }
    }
  }
  if (
    captures === 0 || drops === 0 || kingMoves === 0 || promotions === 0 ||
    senteToMove === 0 || goteToMove === 0
  ) {
    throw new Error(
      `coverage incomplete: captures=${captures} drops=${drops} kings=${kingMoves} ` +
      `promos=${promotions} sente=${senteToMove} gote=${goteToMove}`,
    );
  }

  const benchStarted = performance.now();
  wasm.benchNnueEvaluateFast(500);
  const fastEval500Ms = performance.now() - benchStarted;
  console.log(JSON.stringify({
    status: 'pass',
    format: NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT,
    weightBytes: bytes.byteLength,
    parity: {
      positions: compared,
      legalMovesChecked,
      captures,
      drops,
      kingMoves,
      promotions,
      senteToMove,
      goteToMove,
      stmBuckets: stmBuckets.size,
      fullFastTsBitExact: true,
      accumulatorExact: true,
    },
    runtime: {
      memoryBeforeBytes: memoryBefore,
      memoryAfterBytes: wasm.memory.buffer.byteLength,
      installMs,
      fastEval500Ms,
    },
  }, null, 2));
}

main();
