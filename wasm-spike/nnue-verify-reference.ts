/**
 * nnue-verify-reference.ts — verify the WASM NNUE inference against real
 * trained weights, using the reference values dumped by ml/dump-reference.py
 * (which requires PyTorch and is run on the training side).
 *
 * For every reference position (sfen):
 *   - WASM nnueEvaluate()  must equal out_q      (int16 pipeline, bit-exact)
 *   - TS   intForward()    must equal out_q      (sanity: 3-way agreement)
 *   - WASM nnueEvaluateCp() must equal cp_int    (cp conversion, bit-exact)
 * and reports |cp_float - cp_int| stats (quantization error, informational).
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/nnue-verify-reference.ts <weights.bin> <reference.json> \
 *     [--wasm-path wasm-spike/artifacts/shogi-halfkp81-dual-research.wasm]
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  NNUE_BONAPIECE_HALFKP_FORMAT,
  NNUE_BONAPIECE_HALFKP_LAYOUT,
  NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT,
  NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT,
  NNUE_HALFKP_DUAL_FORMAT,
  NNUE_HALFKP_DUAL_LAYOUT,
  bonaPieceHalfkpWeightsFromBuffer,
  bonaPieceHalfkpSingleWeightsFromBuffer,
  bucketsForByteLength,
  dualWeightsFromBuffer,
  extractBonaPieceHalfkpFeatures,
  extractDualFeatures,
  extractFeatures,
  intForward,
  intForwardBonaPieceHalfkp,
  intForwardBonaPieceHalfkpSingle,
  intForwardDual,
  layoutFor,
  outQToCp,
  parseSfen,
  weightsFromBuffer,
} from './nnue-ref';

interface ReferencePosition {
  sfen: string;
  float_logit: number;
  cp_float: number;
  out_q: number;
  cp_int: number;
}

interface ReferenceFile {
  format: string;
  k_sigmoid: number;
  k_int: number;
  n: number;
  positions: ReferencePosition[];
}

interface ShogiNnueWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  getNnueBuckets(): number;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
  nnueEvaluate(): number;
  nnueEvaluateFast(): number;
  nnueAccMismatch(): number;
  nnueEvaluateCp(): number;
}

const [, , weightsPath, referencePath] = process.argv;
if (!weightsPath || !referencePath) {
  console.error(
    'usage: node -r tsx/cjs wasm-spike/nnue-verify-reference.ts <weights.bin> <reference.json> [--wasm-path research.wasm]',
  );
  process.exit(2);
}

const wasmPathIndex = process.argv.indexOf('--wasm-path');
const explicitWasmPath = wasmPathIndex < 0 ? null : process.argv[wasmPathIndex + 1];
if (wasmPathIndex >= 0 && (!explicitWasmPath || explicitWasmPath.startsWith('--'))) {
  throw new Error('--wasm-path requires a value');
}

const wasmBytes = readFileSync(
  explicitWasmPath
    ? resolve(explicitWasmPath)
    : join(__dirname, '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm'),
);
const instance = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {
  env: {
    abort(_msg: number, _file: number, line: number, col: number) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
    now: () => performance.now(),
    // Single-thread stubs for the Lazy SMP shared-TT hooks (never called while
    // setSharedTtEnabled stays 0, but the imports must link).
    sharedTtProbe: () => 0,
    sharedTtStore: () => {},
    sharedShouldStop: () => 0,
  },
});
const wasm = instance.exports as unknown as ShogiNnueWasm;

const weightsBin = readFileSync(weightsPath);
// The format selector is inferred from exact file size. 82 is custom dual
// HalfKP, 83/84 are the research-only dual/single BonaPiece exports; 1/6/81
// retain their historical layouts.
const format = bucketsForByteLength(weightsBin.byteLength);
if (
  (
    format === NNUE_HALFKP_DUAL_FORMAT ||
    format === NNUE_BONAPIECE_HALFKP_FORMAT ||
    format === NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT
  ) &&
  !explicitWasmPath
) {
  throw new Error('research HalfKP verification requires --wasm-path with an isolated runtime');
}
wasm.setNnueBuckets(format);
const totalBytes =
  format === NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT
    ? NNUE_BONAPIECE_HALFKP_SINGLE_LAYOUT.totalBytes
    : format === NNUE_BONAPIECE_HALFKP_FORMAT
    ? NNUE_BONAPIECE_HALFKP_LAYOUT.totalBytes
    : format === NNUE_HALFKP_DUAL_FORMAT
    ? NNUE_HALFKP_DUAL_LAYOUT.totalBytes
    : layoutFor(format).totalBytes;
if (wasm.getNnueBuckets() !== format || wasm.getNnueWeightsSize() !== totalBytes) {
  console.error(
    `weights.bin size mismatch: file=${weightsBin.byteLength} (format=${format}) wasm=${wasm.getNnueWeightsSize()}`,
  );
  process.exit(1);
}
new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), totalBytes).set(weightsBin);
wasm.setNnueEnabled(1);
const refWeights =
  format === NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT
    ? bonaPieceHalfkpSingleWeightsFromBuffer(weightsBin.buffer, weightsBin.byteOffset)
    : format === NNUE_BONAPIECE_HALFKP_FORMAT
    ? bonaPieceHalfkpWeightsFromBuffer(weightsBin.buffer, weightsBin.byteOffset)
    : format === NNUE_HALFKP_DUAL_FORMAT
    ? dualWeightsFromBuffer(weightsBin.buffer, weightsBin.byteOffset)
    : weightsFromBuffer(
        weightsBin.buffer,
        weightsBin.byteOffset, // no ArrayBuffer copy needed
        format,
      );
console.log(`weights format: selector=${format} (${totalBytes} bytes)`);

const reference = JSON.parse(readFileSync(referencePath, 'utf8')) as ReferenceFile;
const kInt = reference.k_int ?? Math.round(reference.k_sigmoid);
wasm.setNnueScaleK(kInt);
console.log(
  `verifying ${reference.positions.length} reference positions (K=${reference.k_sigmoid}, K_int=${kInt})`
);

let ok = 0;
let maxQuantErr = 0;
let sumQuantErr = 0;
for (const p of reference.positions) {
  const pos = parseSfen(p.sfen);

  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const sq = (suji << 4) + dan;
      if (pos.ban[sq] !== 0) wasm.setSquare(sq, pos.ban[sq]);
    }
  }
  for (let koma = 0; koma < 64; koma++) {
    if (pos.hand[koma] > 0) wasm.setHand(koma, pos.hand[koma]);
  }
  wasm.setSideToMove(pos.teban);
  wasm.finalizePosition();

  const asOutQ = wasm.nnueEvaluate() | 0;
  const asFastOutQ = wasm.nnueEvaluateFast() | 0;
  const accumulatorMismatch = wasm.nnueAccMismatch() | 0;
  const asCp = wasm.nnueEvaluateCp() | 0;
  const tsOutQ =
    format === NNUE_BONAPIECE_HALFKP_SINGLE_FORMAT
      ? intForwardBonaPieceHalfkpSingle(
          refWeights as ReturnType<typeof bonaPieceHalfkpSingleWeightsFromBuffer>,
          extractBonaPieceHalfkpFeatures(pos),
        ) | 0
      : format === NNUE_BONAPIECE_HALFKP_FORMAT
      ? intForwardBonaPieceHalfkp(
          refWeights as ReturnType<typeof bonaPieceHalfkpWeightsFromBuffer>,
          extractBonaPieceHalfkpFeatures(pos),
        ) | 0
      : format === NNUE_HALFKP_DUAL_FORMAT
      ? intForwardDual(refWeights, extractDualFeatures(pos)) | 0
      : intForward(refWeights, extractFeatures(pos, format)) | 0;
  const tsCp = outQToCp(tsOutQ, kInt) | 0;

  const errors: string[] = [];
  if (asOutQ !== p.out_q) errors.push(`out_q: WASM=${asOutQ} torch=${p.out_q}`);
  if (asFastOutQ !== p.out_q) errors.push(`out_q: WASM-fast=${asFastOutQ} torch=${p.out_q}`);
  if (accumulatorMismatch !== 0) errors.push(`incremental accumulator mismatches=${accumulatorMismatch}`);
  if (tsOutQ !== p.out_q) errors.push(`out_q: TS=${tsOutQ} torch=${p.out_q}`);
  if (asCp !== p.cp_int) errors.push(`cp_int: WASM=${asCp} torch=${p.cp_int}`);
  if (tsCp !== p.cp_int) errors.push(`cp_int: TS=${tsCp} torch=${p.cp_int}`);
  if (errors.length > 0) {
    console.error(`\nREFERENCE MISMATCH at sfen: ${p.sfen}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const quantErr = Math.abs(p.cp_float - p.cp_int);
  maxQuantErr = Math.max(maxQuantErr, quantErr);
  sumQuantErr += quantErr;
  ok++;
}

console.log(`\nALL ${ok} POSITIONS MATCH — WASM == TS == torch int16 simulation (out_q + cp, bit-exact)`);
console.log(
  `quantization error |cp_float - cp_int|: mean=${(sumQuantErr / ok).toFixed(2)}cp max=${maxQuantErr.toFixed(2)}cp (float vs int16, informational)`
);
