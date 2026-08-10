#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const EXPECTED = {
  source: [150_322, 'd80d2e7a7fe605912965f43e89946960c92a587481c365cbe200006b47a32e23'],
  tables: [3_926, 'ec140608ce91c7892cc7b2bdbbb0892ffc8003ec2b6cca0f81633dfd5f483dd2'],
  ambient: [2_751, '7a5e32a319fabf9533cda9725e2d2f6ca8a412aba0dc346155b567c704a7f63a'],
  productionWasm: [38_288, '1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6'],
  productionWeights: [94_656_708, '25fc77addcd5e147906bb197313f2e5c6d4e4c3acc93fddbdb876c695818bd40'],
  transformedSource: [161_530, '79e3f4f6de70679b6ba52ac3c2b3091332cd8571b5d3d583113497c98ab4eb22'],
  candidateWasm: [45_391, 'e3e14d0836ed11d4432ff11478c98b1c808a504ff5ee99da714aa0bde4c8c606'],
};
const INPUTS = {
  source: join(scriptDir, 'assembly', 'index.ts'),
  tables: join(scriptDir, 'assembly', 'tables.ts'),
  ambient: join(scriptDir, 'assembly', 'as-ambient.d.ts'),
  productionWasm: join(root, 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm'),
  productionWeights: join(root, 'public', 'shogi-nnue-weights.bin'),
};

function identity(path) {
  const bytes = readFileSync(path);
  return [bytes.byteLength, createHash('sha256').update(bytes).digest('hex')];
}

function requireIdentity(label) {
  const actual = identity(INPUTS[label]);
  if (actual[0] !== EXPECTED[label][0] || actual[1] !== EXPECTED[label][1]) {
    throw new Error(`${label} identity mismatch: expected ${EXPECTED[label].join('/')}, got ${actual.join('/')}`);
  }
}

function replaceExactlyOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`${label} anchor must occur exactly once`);
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

function insertAtFunctionStart(source, signature, insertion) {
  const first = source.indexOf(signature);
  if (first < 0 || source.indexOf(signature, first + signature.length) >= 0) {
    throw new Error(`${signature} must occur exactly once`);
  }
  const open = source.indexOf('{', first + signature.length);
  if (open < 0) throw new Error(`${signature} has no body`);
  return source.slice(0, open + 1) + insertion + source.slice(open + 1);
}

const DPA_RUNTIME = String.raw`
// ---------------------------------------------------------------------------
// Candidate-only Dual-Perspective Antisymmetric HalfKP96 evaluator body.
// Separate API and lazy weight region; production NNUE formats are untouched.
// ---------------------------------------------------------------------------
const DPA_H1: i32 = 96;
const DPA_ROW_BYTES: i32 = DPA_H1 * 2;
const DPA_W1B_OFF: i32 = 0;
const DPA_W1H_OFF: i32 = 35_271_936;
const DPA_B1_OFF: i32 = 35_489_664;
const DPA_OUT_W_OFF: i32 = 35_490_048;
const DPA_TOTAL_BYTES: i32 = 35_490_240;

let dpaWeights: usize = 0;
let dpaRuntimeEnabled: bool = false;

function dpaEnsureWeights(): bool {
  if (dpaWeights != 0) return true;
  const pages = (DPA_TOTAL_BYTES + 65535) >> 16;
  const oldPages = memory.grow(pages);
  if (oldPages < 0) return false;
  dpaWeights = <usize>oldPages << 16;
  return true;
}

export function getDpaHalfkp96WeightsPtr(): usize {
  if (!dpaEnsureWeights()) return 0;
  return dpaWeights;
}

export function getDpaHalfkp96WeightsSize(): i32 {
  return DPA_TOTAL_BYTES;
}

export function getDpaHalfkp96RuntimeEnabled(): i32 {
  return dpaRuntimeEnabled ? 1 : 0;
}

export function setDpaHalfkp96RuntimeEnabled(flag: i32): i32 {
  if (flag == 0) {
    dpaRuntimeEnabled = false;
    nnueEnabled = false;
    initEvalCache();
    return 1;
  }
  if (!dpaEnsureWeights()) return 0;
  dpaRuntimeEnabled = true;
  nnueEnabled = true;
  nnueForceFull = false;
  nnueRefreshAccumulators();
  initEvalCache();
  return 1;
}

function dpaBucketS(): i32 {
  return kingS > 0 ? ((kingS >> 4) - 1) * 9 + ((kingS & 0x0f) - 1) : 0;
}

function dpaBucketG(): i32 {
  return kingG > 0 ? (9 - (kingG >> 4)) * 9 + (9 - (kingG & 0x0f)) : 0;
}

function dpaMoveCrossesS(m: i32): bool {
  return ((m >> 16) & 0x7f) == SOU && ((m >> 8) & 0xff) != 0;
}

function dpaMoveCrossesG(m: i32): bool {
  return ((m >> 16) & 0x7f) == GOU && ((m >> 8) & 0xff) != 0;
}

function dpaBoardRowS(koma: i32, pos: i32): usize {
  const kind = unchecked(NNUE_KIND[koma & 0x0f]);
  const plane = (koma & SENTE) != 0 ? kind : kind + 14;
  const feat = plane * 81 + ((pos >> 4) - 1) * 9 + ((pos & 0x0f) - 1);
  const row = dpaBucketS() * NNUE_BOARD_FEATS + feat;
  return dpaWeights + <usize>(DPA_W1B_OFF + row * DPA_ROW_BYTES);
}

function dpaBoardRowG(koma: i32, pos: i32): usize {
  const kind = unchecked(NNUE_KIND[koma & 0x0f]);
  const plane = (koma & GOTE) != 0 ? kind : kind + 14;
  const feat = plane * 81 + (9 - (pos >> 4)) * 9 + (9 - (pos & 0x0f));
  const row = dpaBucketG() * NNUE_BOARD_FEATS + feat;
  return dpaWeights + <usize>(DPA_W1B_OFF + row * DPA_ROW_BYTES);
}

function dpaHandRowS(handKoma: i32): usize {
  const type = handKoma & 0x0f;
  const idx = (handKoma & SENTE) != 0 ? type - 1 : type + 6;
  const row = dpaBucketS() * NNUE_HAND_FEATS + idx;
  return dpaWeights + <usize>(DPA_W1H_OFF + row * DPA_ROW_BYTES);
}

function dpaHandRowG(handKoma: i32): usize {
  const type = handKoma & 0x0f;
  const idx = (handKoma & GOTE) != 0 ? type - 1 : type + 6;
  const row = dpaBucketG() * NNUE_HAND_FEATS + idx;
  return dpaWeights + <usize>(DPA_W1H_OFF + row * DPA_ROW_BYTES);
}

function dpaRowSubAdd(acc: StaticArray<i32>, subBase: usize, addBase: usize): void {
  const accBase = changetype<usize>(acc);
  for (let j = 0; j < DPA_H1; j += 8) {
    const off = <usize>(j << 1);
    const add8 = v128.load(addBase + off);
    const sub8 = v128.load(subBase + off);
    const aoff = <usize>(j << 2);
    v128.store(
      accBase + aoff,
      i32x4.add(
        v128.load(accBase + aoff),
        i32x4.sub(i32x4.extend_low_i16x8_s(add8), i32x4.extend_low_i16x8_s(sub8))
      )
    );
    v128.store(
      accBase + aoff,
      i32x4.add(
        v128.load(accBase + aoff, 16),
        i32x4.sub(i32x4.extend_high_i16x8_s(add8), i32x4.extend_high_i16x8_s(sub8))
      ),
      16
    );
  }
}

function dpaRowAddScaled(acc: StaticArray<i32>, base: usize, coefficient: i32): void {
  const accBase = changetype<usize>(acc);
  const coefficient8 = i16x8.splat(<i16>coefficient);
  for (let j = 0; j < DPA_H1; j += 8) {
    const weights8 = v128.load(base + <usize>(j << 1));
    const aoff = <usize>(j << 2);
    v128.store(
      accBase + aoff,
      i32x4.add(v128.load(accBase + aoff), i32x4.extmul_low_i16x8_s(weights8, coefficient8))
    );
    v128.store(
      accBase + aoff,
      i32x4.add(
        v128.load(accBase + aoff, 16),
        i32x4.extmul_high_i16x8_s(weights8, coefficient8)
      ),
      16
    );
  }
}

function dpaAccApplyMakeS(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    dpaRowSubAdd(nnueAccS, dpaHandRowS(koma), dpaBoardRowS(koma, to));
    return;
  }
  dpaRowSubAdd(nnueAccS, dpaBoardRowS(koma, from), dpaBoardRowS(placed, to));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      dpaRowSubAdd(nnueAccS, dpaBoardRowS(capture, to), dpaHandRowS(handKoma));
    } else dpaRowAddScaled(nnueAccS, dpaBoardRowS(capture, to), -1);
  }
}

function dpaAccApplyMakeG(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    dpaRowSubAdd(nnueAccG, dpaHandRowG(koma), dpaBoardRowG(koma, to));
    return;
  }
  dpaRowSubAdd(nnueAccG, dpaBoardRowG(koma, from), dpaBoardRowG(placed, to));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      dpaRowSubAdd(nnueAccG, dpaBoardRowG(capture, to), dpaHandRowG(handKoma));
    } else dpaRowAddScaled(nnueAccG, dpaBoardRowG(capture, to), -1);
  }
}

function dpaAccApplyUnmakeS(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    dpaRowSubAdd(nnueAccS, dpaBoardRowS(koma, to), dpaHandRowS(koma));
    return;
  }
  dpaRowSubAdd(nnueAccS, dpaBoardRowS(placed, to), dpaBoardRowS(koma, from));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      dpaRowSubAdd(nnueAccS, dpaHandRowS(handKoma), dpaBoardRowS(capture, to));
    } else dpaRowAddScaled(nnueAccS, dpaBoardRowS(capture, to), 1);
  }
}

function dpaAccApplyUnmakeG(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    dpaRowSubAdd(nnueAccG, dpaBoardRowG(koma, to), dpaHandRowG(koma));
    return;
  }
  dpaRowSubAdd(nnueAccG, dpaBoardRowG(placed, to), dpaBoardRowG(koma, from));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      dpaRowSubAdd(nnueAccG, dpaHandRowG(handKoma), dpaBoardRowG(capture, to));
    } else dpaRowAddScaled(nnueAccG, dpaBoardRowG(capture, to), 1);
  }
}

function dpaBuildAccS(accumulator: StaticArray<i32>): void {
  for (let j = 0; j < DPA_H1; j++) {
    unchecked(accumulator[j] = load<i32>(dpaWeights + <usize>(DPA_B1_OFF + (j << 2))));
  }
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma != EMPTY) dpaRowAddScaled(accumulator, dpaBoardRowS(koma, pos), 1);
    }
  }
  for (let type = FU; type <= HI; type++) {
    const countS = unchecked(hand[SENTE | type]);
    if (countS > 0) dpaRowAddScaled(accumulator, dpaHandRowS(SENTE | type), countS);
    const countG = unchecked(hand[GOTE | type]);
    if (countG > 0) dpaRowAddScaled(accumulator, dpaHandRowS(GOTE | type), countG);
  }
}

function dpaBuildAccG(accumulator: StaticArray<i32>): void {
  for (let j = 0; j < DPA_H1; j++) {
    unchecked(accumulator[j] = load<i32>(dpaWeights + <usize>(DPA_B1_OFF + (j << 2))));
  }
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma != EMPTY) dpaRowAddScaled(accumulator, dpaBoardRowG(koma, pos), 1);
    }
  }
  for (let type = FU; type <= HI; type++) {
    const countS = unchecked(hand[SENTE | type]);
    if (countS > 0) dpaRowAddScaled(accumulator, dpaHandRowG(SENTE | type), countS);
    const countG = unchecked(hand[GOTE | type]);
    if (countG > 0) dpaRowAddScaled(accumulator, dpaHandRowG(GOTE | type), countG);
  }
}

function dpaEvaluateFrom(
  usAccumulator: StaticArray<i32>, themAccumulator: StaticArray<i32>
): i32 {
  const usBase = changetype<usize>(usAccumulator);
  const themBase = changetype<usize>(themAccumulator);
  const zero = i32x4.splat(0);
  const cap = i32x4.splat(127);
  let sum4 = i32x4.splat(0);
  const outputWeights = dpaWeights + <usize>DPA_OUT_W_OFF;
  for (let j = 0; j < DPA_H1; j += 8) {
    const aoff = <usize>(j << 2);
    const usLo = i32x4.min_s(i32x4.max_s(v128.load(usBase + aoff), zero), cap);
    const usHi = i32x4.min_s(i32x4.max_s(v128.load(usBase + aoff, 16), zero), cap);
    const themLo = i32x4.min_s(i32x4.max_s(v128.load(themBase + aoff), zero), cap);
    const themHi = i32x4.min_s(i32x4.max_s(v128.load(themBase + aoff, 16), zero), cap);
    const difference = i16x8.narrow_i32x4_s(
      i32x4.sub(usLo, themLo), i32x4.sub(usHi, themHi)
    );
    sum4 = i32x4.add(
      sum4,
      i32x4.dot_i16x8_s(v128.load(outputWeights + <usize>(j << 1)), difference)
    );
  }
  return (
    i32x4.extract_lane(sum4, 0) +
    i32x4.extract_lane(sum4, 1) +
    i32x4.extract_lane(sum4, 2) +
    i32x4.extract_lane(sum4, 3)
  );
}

function dpaEvaluateFull(): i32 {
  dpaBuildAccS(nnueChkS);
  dpaBuildAccG(nnueChkG);
  nnueEvalCount++;
  return teban == SENTE
    ? dpaEvaluateFrom(nnueChkS, nnueChkG)
    : dpaEvaluateFrom(nnueChkG, nnueChkS);
}

function dpaEvaluateFast(): i32 {
  if (!nnueApplyPendingS() || !nnueApplyPendingG()) return dpaEvaluateFull();
  nnueEvalCount++;
  return teban == SENTE
    ? dpaEvaluateFrom(nnueAccS, nnueAccG)
    : dpaEvaluateFrom(nnueAccG, nnueAccS);
}
`;

export function applyDpaHalfkp96RuntimeTransform(input) {
  let source = replaceExactlyOnce(
    input,
    '// --- w1 row addressing (row = 256 int16 weights = 512 bytes) -----------------',
    `${DPA_RUNTIME}\n// --- w1 row addressing (row = 256 int16 weights = 512 bytes) -----------------`,
    'DPA-HalfKP96 runtime insertion',
  );
  source = insertAtFunctionStart(source, 'function nnueMoveCrossesS(m: i32): bool', '\n  if (dpaRuntimeEnabled) return dpaMoveCrossesS(m);');
  source = insertAtFunctionStart(source, 'function nnueMoveCrossesG(m: i32): bool', '\n  if (dpaRuntimeEnabled) return dpaMoveCrossesG(m);');
  for (const [signature, delegate] of [
    ['function nnueAccApplyMakeS(m: i32): void', 'dpaAccApplyMakeS(m);'],
    ['function nnueAccApplyMakeG(m: i32): void', 'dpaAccApplyMakeG(m);'],
    ['function nnueAccApplyUnmakeS(m: i32): void', 'dpaAccApplyUnmakeS(m);'],
    ['function nnueAccApplyUnmakeG(m: i32): void', 'dpaAccApplyUnmakeG(m);'],
  ]) {
    source = insertAtFunctionStart(source, signature, `\n  if (dpaRuntimeEnabled) { ${delegate} return; }`);
  }
  source = insertAtFunctionStart(source, 'function nnueBuildAccS(accS: StaticArray<i32>): void', '\n  if (dpaRuntimeEnabled) { dpaBuildAccS(accS); return; }');
  source = insertAtFunctionStart(source, 'function nnueBuildAccG(accG: StaticArray<i32>): void', '\n  if (dpaRuntimeEnabled) { dpaBuildAccG(accG); return; }');
  source = insertAtFunctionStart(source, 'export function nnueEvaluate(): i32', '\n  if (dpaRuntimeEnabled) return dpaEvaluateFull();');
  source = insertAtFunctionStart(source, 'export function nnueEvaluateFast(): i32', '\n  if (dpaRuntimeEnabled) return dpaEvaluateFast();');
  source = replaceExactlyOnce(
    source,
    '  for (let j = 0; j < NNUE_H1; j++) {\n    if (unchecked(nnueChkS[j]) != unchecked(nnueAccS[j])) bad++;',
    '  const mismatchLanes = dpaRuntimeEnabled ? DPA_H1 : NNUE_H1;\n  for (let j = 0; j < mismatchLanes; j++) {\n    if (unchecked(nnueChkS[j]) != unchecked(nnueAccS[j])) bad++;',
    'accumulator mismatch lane count',
  );
  source = replaceExactlyOnce(
    source,
    '  nnueBuildAccS(nnueAccS);\n  nnueBuildAccG(nnueAccG);\n  nnueBuildW2T();',
    '  nnueBuildAccS(nnueAccS);\n  nnueBuildAccG(nnueAccG);\n  if (!dpaRuntimeEnabled) nnueBuildW2T();',
    'candidate refresh branch',
  );
  return source;
}

function runAsc(cwd, outFile) {
  const result = spawnSync(
    'npx',
    ['-y', '-p', 'assemblyscript@0.28.19', 'asc', 'wasm-spike/assembly/index.ts', '--outFile', outFile, '-O3', '--runtime', 'stub', '--noAssert', '--enable', 'simd'],
    { cwd, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

export function buildDpaHalfkp96RuntimeSkeleton(out) {
  for (const label of Object.keys(INPUTS)) requireIdentity(label);
  if (!isAbsolute(out)) throw new Error('--out must be absolute');
  if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
  const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-dpa-halfkp96-runtime-'));
  try {
    const assemblyDir = join(tempRoot, 'wasm-spike', 'assembly');
    mkdirSync(assemblyDir, { recursive: true });
    copyFileSync(INPUTS.source, join(assemblyDir, 'index.ts'));
    copyFileSync(INPUTS.tables, join(assemblyDir, 'tables.ts'));
    copyFileSync(INPUTS.ambient, join(assemblyDir, 'as-ambient.d.ts'));
    runAsc(tempRoot, 'baseline.wasm');
    const baselineIdentity = identity(join(tempRoot, 'baseline.wasm'));
    if (baselineIdentity[0] !== EXPECTED.productionWasm[0] || baselineIdentity[1] !== EXPECTED.productionWasm[1]) {
      throw new Error(`no-patch rebuild mismatch: expected ${EXPECTED.productionWasm.join('/')}, got ${baselineIdentity.join('/')}`);
    }
    const transformed = applyDpaHalfkp96RuntimeTransform(readFileSync(INPUTS.source, 'utf8'));
    const transformedIdentity = [
      Buffer.byteLength(transformed),
      createHash('sha256').update(transformed).digest('hex'),
    ];
    if (transformedIdentity[0] !== EXPECTED.transformedSource[0] || transformedIdentity[1] !== EXPECTED.transformedSource[1]) {
      throw new Error(`transformed source mismatch: expected ${EXPECTED.transformedSource.join('/')}, got ${transformedIdentity.join('/')}`);
    }
    writeFileSync(join(assemblyDir, 'index.ts'), transformed);
    runAsc(tempRoot, 'candidate.wasm');
    const builtCandidateIdentity = identity(join(tempRoot, 'candidate.wasm'));
    if (builtCandidateIdentity[0] !== EXPECTED.candidateWasm[0] || builtCandidateIdentity[1] !== EXPECTED.candidateWasm[1]) {
      throw new Error(`candidate WASM mismatch: expected ${EXPECTED.candidateWasm.join('/')}, got ${builtCandidateIdentity.join('/')}`);
    }
    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(join(tempRoot, 'candidate.wasm'), out, constants.COPYFILE_EXCL);
    const candidateIdentity = identity(out);
    return {
      path: out,
      bytes: statSync(out).size,
      sha256: candidateIdentity[1],
      transformedSourceBytes: transformedIdentity[0],
      transformedSourceSha256: transformedIdentity[1],
      noPatchRebuildBytes: baselineIdentity[0],
      noPatchRebuildSha256: baselineIdentity[1],
      productionAssetsModified: false,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--out');
  if (index < 0 || !process.argv[index + 1] || process.argv.length !== 4) throw new Error('usage: --out /absolute/path');
  console.log(JSON.stringify(buildDpaHalfkp96RuntimeSkeleton(process.argv[index + 1]), null, 2));
}
