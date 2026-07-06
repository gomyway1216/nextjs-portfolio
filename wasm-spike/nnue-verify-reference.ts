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
 *   node -r tsx/cjs wasm-spike/nnue-verify-reference.ts <weights.bin> <reference.json>
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  bucketsForByteLength,
  extractFeatures,
  intForward,
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
  nnueEvaluate(): number;
  nnueEvaluateCp(): number;
}

const [, , weightsPath, referencePath] = process.argv;
if (!weightsPath || !referencePath) {
  console.error('usage: node -r tsx/cjs wasm-spike/nnue-verify-reference.ts <weights.bin> <reference.json>');
  process.exit(2);
}

const wasmBytes = readFileSync(
  join(__dirname, '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm')
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
// The format (1 = original board one-hot, 6 = reduced KP) is inferred from the
// exact file size; bucketsForByteLength throws on anything unrecognized.
const buckets = bucketsForByteLength(weightsBin.byteLength);
wasm.setNnueBuckets(buckets);
const layout = layoutFor(buckets);
if (wasm.getNnueBuckets() !== buckets || wasm.getNnueWeightsSize() !== layout.totalBytes) {
  console.error(
    `weights.bin size mismatch: file=${weightsBin.byteLength} (buckets=${buckets}) wasm=${wasm.getNnueWeightsSize()}`
  );
  process.exit(1);
}
new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), layout.totalBytes).set(weightsBin);
const refWeights = weightsFromBuffer(
  weightsBin.buffer,
  weightsBin.byteOffset, // no ArrayBuffer copy needed
  buckets
);
console.log(`weights format: buckets=${buckets} (${layout.totalBytes} bytes)`);

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
  const asCp = wasm.nnueEvaluateCp() | 0;
  const tsOutQ = intForward(refWeights, extractFeatures(pos, buckets)) | 0;
  const tsCp = outQToCp(tsOutQ, kInt) | 0;

  const errors: string[] = [];
  if (asOutQ !== p.out_q) errors.push(`out_q: WASM=${asOutQ} torch=${p.out_q}`);
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
