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
  transformedSource: [165_478, 'a1e92663b1c6a9f48329437c5eba7c67058acf9a0b99c681dbcffb0cbf326fb2'],
  candidateWasm: [45_805, '63cf89850e4fbbdfc5cb9c3042ee36c28f1bb2aac6d731398a46ad6c1c84de64'],
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
    throw new Error(
      `${label} identity mismatch: expected ${EXPECTED[label].join('/')}, got ${actual.join('/')}`,
    );
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

const KINGPAIR_RUNTIME = String.raw`
// ---------------------------------------------------------------------------
// Candidate-only KingPair interaction NNUE runtime skeleton.
//
// This is intentionally exposed through a separate API and separate lazily
// allocated weight region.  Production NNUE formats, pointers, and assets are
// untouched.  The first milestone accepts only an all-zero, non-deployable
// payload so its purpose is runtime cost and integer-parity measurement.
// ---------------------------------------------------------------------------

const KINGPAIR_H1: i32 = 128;
const KINGPAIR_EMBED: i32 = 16;
const KINGPAIR_MIXED: i32 = 528;
const KINGPAIR_MIX1: i32 = 64;
const KINGPAIR_MIX2: i32 = 32;
const KINGPAIR_REL_BUCKETS: i32 = 289;
const KINGPAIR_ROW_BYTES: i32 = KINGPAIR_H1 * 2;

const KINGPAIR_W1B_OFF: i32 = 0;
const KINGPAIR_W1H_OFF: i32 = 47_029_248;
const KINGPAIR_B1_OFF: i32 = 47_319_552;
const KINGPAIR_REL_OFF: i32 = 47_320_064;
const KINGPAIR_MIX1_W_OFF: i32 = 47_329_312;
const KINGPAIR_MIX1_B_OFF: i32 = 47_396_896;
const KINGPAIR_MIX2_W_OFF: i32 = 47_397_152;
const KINGPAIR_MIX2_B_OFF: i32 = 47_401_248;
const KINGPAIR_OUT_W_OFF: i32 = 47_401_376;
const KINGPAIR_OUT_B_OFF: i32 = 47_401_440;
const KINGPAIR_TOTAL_BYTES: i32 = 47_401_444;

let kingPairWeights: usize = 0;
let kingPairRuntimeEnabled: bool = false;
const KINGPAIR_MIXED_I16: usize = memory.data(KINGPAIR_MIXED * 2, 16);
const KINGPAIR_HIDDEN1_I16: usize = memory.data(KINGPAIR_MIX1 * 2, 16);
const KINGPAIR_HIDDEN2_I16: usize = memory.data(KINGPAIR_MIX2 * 2, 16);

function kingPairEnsureWeights(): bool {
  if (kingPairWeights != 0) return true;
  const pages = (KINGPAIR_TOTAL_BYTES + 65535) >> 16;
  const oldPages = memory.grow(pages);
  if (oldPages < 0) return false;
  kingPairWeights = <usize>oldPages << 16;
  return true;
}

export function getKingPairWeightsPtr(): usize {
  if (!kingPairEnsureWeights()) return 0;
  return kingPairWeights;
}

export function getKingPairWeightsSize(): i32 {
  return KINGPAIR_TOTAL_BYTES;
}

export function getKingPairRuntimeEnabled(): i32 {
  return kingPairRuntimeEnabled ? 1 : 0;
}

export function setKingPairRuntimeEnabled(flag: i32): i32 {
  if (flag == 0) {
    kingPairRuntimeEnabled = false;
    nnueEnabled = false;
    initEvalCache();
    return 1;
  }
  if (!kingPairEnsureWeights()) return 0;
  kingPairRuntimeEnabled = true;
  nnueEnabled = true;
  nnueForceFull = false;
  nnueRefreshAccumulators();
  initEvalCache();
  return 1;
}

function kingPairBucketS(): i32 {
  return kingS > 0 ? ((kingS >> 4) - 1) * 9 + ((kingS & 0x0f) - 1) : 0;
}

function kingPairBucketG(): i32 {
  return kingG > 0 ? (9 - (kingG >> 4)) * 9 + (9 - (kingG & 0x0f)) : 0;
}

function kingPairMoveCrossesS(m: i32): bool {
  return ((m >> 16) & 0x7f) == SOU && ((m >> 8) & 0xff) != 0;
}

function kingPairMoveCrossesG(m: i32): bool {
  return ((m >> 16) & 0x7f) == GOU && ((m >> 8) & 0xff) != 0;
}

function kingPairBoardRowS(koma: i32, pos: i32): usize {
  const kind = unchecked(NNUE_KIND[koma & 0x0f]);
  const plane = (koma & SENTE) != 0 ? kind : kind + 14;
  const feat = plane * 81 + ((pos >> 4) - 1) * 9 + ((pos & 0x0f) - 1);
  const row = kingPairBucketS() * NNUE_BOARD_FEATS + feat;
  return kingPairWeights + <usize>(KINGPAIR_W1B_OFF + row * KINGPAIR_ROW_BYTES);
}

function kingPairBoardRowG(koma: i32, pos: i32): usize {
  const kind = unchecked(NNUE_KIND[koma & 0x0f]);
  const plane = (koma & GOTE) != 0 ? kind : kind + 14;
  const feat = plane * 81 + (9 - (pos >> 4)) * 9 + (9 - (pos & 0x0f));
  const row = kingPairBucketG() * NNUE_BOARD_FEATS + feat;
  return kingPairWeights + <usize>(KINGPAIR_W1B_OFF + row * KINGPAIR_ROW_BYTES);
}

function kingPairHandRowS(handKoma: i32): usize {
  const type = handKoma & 0x0f;
  const idx = (handKoma & SENTE) != 0 ? type - 1 : type + 6;
  const row = kingPairBucketS() * NNUE_HAND_FEATS + idx;
  return kingPairWeights + <usize>(KINGPAIR_W1H_OFF + row * KINGPAIR_ROW_BYTES);
}

function kingPairHandRowG(handKoma: i32): usize {
  const type = handKoma & 0x0f;
  const idx = (handKoma & GOTE) != 0 ? type - 1 : type + 6;
  const row = kingPairBucketG() * NNUE_HAND_FEATS + idx;
  return kingPairWeights + <usize>(KINGPAIR_W1H_OFF + row * KINGPAIR_ROW_BYTES);
}

function kingPairRowSubAdd(acc: StaticArray<i32>, subBase: usize, addBase: usize): void {
  const accBase = changetype<usize>(acc);
  for (let j = 0; j < KINGPAIR_H1; j += 8) {
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

function kingPairRowAddScaled(acc: StaticArray<i32>, base: usize, coefficient: i32): void {
  const accBase = changetype<usize>(acc);
  const coefficient8 = i16x8.splat(<i16>coefficient);
  for (let j = 0; j < KINGPAIR_H1; j += 8) {
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

function kingPairAccApplyMakeS(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    kingPairRowSubAdd(nnueAccS, kingPairHandRowS(koma), kingPairBoardRowS(koma, to));
    return;
  }
  kingPairRowSubAdd(nnueAccS, kingPairBoardRowS(koma, from), kingPairBoardRowS(placed, to));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      kingPairRowSubAdd(nnueAccS, kingPairBoardRowS(capture, to), kingPairHandRowS(handKoma));
    } else kingPairRowAddScaled(nnueAccS, kingPairBoardRowS(capture, to), -1);
  }
}

function kingPairAccApplyMakeG(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    kingPairRowSubAdd(nnueAccG, kingPairHandRowG(koma), kingPairBoardRowG(koma, to));
    return;
  }
  kingPairRowSubAdd(nnueAccG, kingPairBoardRowG(koma, from), kingPairBoardRowG(placed, to));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      kingPairRowSubAdd(nnueAccG, kingPairBoardRowG(capture, to), kingPairHandRowG(handKoma));
    } else kingPairRowAddScaled(nnueAccG, kingPairBoardRowG(capture, to), -1);
  }
}

function kingPairAccApplyUnmakeS(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    kingPairRowSubAdd(nnueAccS, kingPairBoardRowS(koma, to), kingPairHandRowS(koma));
    return;
  }
  kingPairRowSubAdd(nnueAccS, kingPairBoardRowS(placed, to), kingPairBoardRowS(koma, from));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      kingPairRowSubAdd(nnueAccS, kingPairHandRowS(handKoma), kingPairBoardRowS(capture, to));
    } else kingPairRowAddScaled(nnueAccS, kingPairBoardRowS(capture, to), 1);
  }
}

function kingPairAccApplyUnmakeG(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;
  if (from == 0) {
    kingPairRowSubAdd(nnueAccG, kingPairBoardRowG(koma, to), kingPairHandRowG(koma));
    return;
  }
  kingPairRowSubAdd(nnueAccG, kingPairBoardRowG(placed, to), kingPairBoardRowG(koma, from));
  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      kingPairRowSubAdd(nnueAccG, kingPairHandRowG(handKoma), kingPairBoardRowG(capture, to));
    } else kingPairRowAddScaled(nnueAccG, kingPairBoardRowG(capture, to), 1);
  }
}

function kingPairBuildAccS(accumulator: StaticArray<i32>): void {
  for (let j = 0; j < KINGPAIR_H1; j++) {
    unchecked(accumulator[j] = load<i32>(kingPairWeights + <usize>(KINGPAIR_B1_OFF + (j << 2))));
  }
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma != EMPTY) kingPairRowAddScaled(accumulator, kingPairBoardRowS(koma, pos), 1);
    }
  }
  for (let type = FU; type <= HI; type++) {
    const countS = unchecked(hand[SENTE | type]);
    if (countS > 0) kingPairRowAddScaled(accumulator, kingPairHandRowS(SENTE | type), countS);
    const countG = unchecked(hand[GOTE | type]);
    if (countG > 0) kingPairRowAddScaled(accumulator, kingPairHandRowS(GOTE | type), countG);
  }
}

function kingPairBuildAccG(accumulator: StaticArray<i32>): void {
  for (let j = 0; j < KINGPAIR_H1; j++) {
    unchecked(accumulator[j] = load<i32>(kingPairWeights + <usize>(KINGPAIR_B1_OFF + (j << 2))));
  }
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma != EMPTY) kingPairRowAddScaled(accumulator, kingPairBoardRowG(koma, pos), 1);
    }
  }
  for (let type = FU; type <= HI; type++) {
    const countS = unchecked(hand[SENTE | type]);
    if (countS > 0) kingPairRowAddScaled(accumulator, kingPairHandRowG(SENTE | type), countS);
    const countG = unchecked(hand[GOTE | type]);
    if (countG > 0) kingPairRowAddScaled(accumulator, kingPairHandRowG(GOTE | type), countG);
  }
}

function kingPairDenseClipped(
  inputBase: usize,
  width: i32,
  weightBase: usize,
  biasBase: usize,
  outputBase: usize,
  rows: i32
): void {
  for (let row = 0; row < rows; row++) {
    const rowBase = weightBase + <usize>(row * width * 2);
    let sum4 = i32x4.splat(0);
    for (let column = 0; column < width; column += 8) {
      const offset = <usize>(column << 1);
      sum4 = i32x4.add(
        sum4,
        i32x4.dot_i16x8_s(v128.load(rowBase + offset), v128.load(inputBase + offset))
      );
    }
    const accumulator =
      load<i32>(biasBase + <usize>(row << 2)) +
      i32x4.extract_lane(sum4, 0) +
      i32x4.extract_lane(sum4, 1) +
      i32x4.extract_lane(sum4, 2) +
      i32x4.extract_lane(sum4, 3);
    let activation = accumulator >> 6;
    if (activation < 0) activation = 0;
    else if (activation > 127) activation = 127;
    store<i16>(outputBase + <usize>(row << 1), <i16>activation);
  }
}

function kingPairRelativeBucket(): i32 {
  const own = teban == SENTE ? kingPairBucketS() : kingPairBucketG();
  const opponentView = teban == SENTE ? kingPairBucketG() : kingPairBucketS();
  const opponent = 80 - opponentView;
  const ownFile = own / 9;
  const ownRank = own % 9;
  const opponentFile = opponent / 9;
  const opponentRank = opponent % 9;
  return (opponentFile - ownFile + 8) * 17 + opponentRank - ownRank + 8;
}

function kingPairEvaluateFrom(
  usAccumulator: StaticArray<i32>, themAccumulator: StaticArray<i32>
): i32 {
  const usBase = changetype<usize>(usAccumulator);
  const themBase = changetype<usize>(themAccumulator);
  for (let j = 0; j < KINGPAIR_H1; j++) {
    let us = load<i32>(usBase + <usize>(j << 2));
    let them = load<i32>(themBase + <usize>(j << 2));
    if (us < 0) us = 0;
    else if (us > 127) us = 127;
    if (them < 0) them = 0;
    else if (them > 127) them = 127;
    store<i16>(KINGPAIR_MIXED_I16 + <usize>(j << 1), <i16>us);
    store<i16>(KINGPAIR_MIXED_I16 + <usize>((KINGPAIR_H1 + j) << 1), <i16>them);
    store<i16>(KINGPAIR_MIXED_I16 + <usize>((KINGPAIR_H1 * 2 + j) << 1), <i16>(us - them));
    const product = (us * them + 63) / 127;
    store<i16>(KINGPAIR_MIXED_I16 + <usize>((KINGPAIR_H1 * 3 + j) << 1), <i16>product);
  }
  const relativeBase =
    kingPairWeights + <usize>(KINGPAIR_REL_OFF + kingPairRelativeBucket() * KINGPAIR_EMBED * 2);
  for (let j = 0; j < KINGPAIR_EMBED; j += 8) {
    v128.store(
      KINGPAIR_MIXED_I16 + <usize>((KINGPAIR_H1 * 4 + j) << 1),
      v128.load(relativeBase + <usize>(j << 1))
    );
  }

  kingPairDenseClipped(
    KINGPAIR_MIXED_I16,
    KINGPAIR_MIXED,
    kingPairWeights + <usize>KINGPAIR_MIX1_W_OFF,
    kingPairWeights + <usize>KINGPAIR_MIX1_B_OFF,
    KINGPAIR_HIDDEN1_I16,
    KINGPAIR_MIX1
  );
  kingPairDenseClipped(
    KINGPAIR_HIDDEN1_I16,
    KINGPAIR_MIX1,
    kingPairWeights + <usize>KINGPAIR_MIX2_W_OFF,
    kingPairWeights + <usize>KINGPAIR_MIX2_B_OFF,
    KINGPAIR_HIDDEN2_I16,
    KINGPAIR_MIX2
  );

  let sum4 = i32x4.splat(0);
  const outputWeights = kingPairWeights + <usize>KINGPAIR_OUT_W_OFF;
  for (let j = 0; j < KINGPAIR_MIX2; j += 8) {
    const offset = <usize>(j << 1);
    sum4 = i32x4.add(
      sum4,
      i32x4.dot_i16x8_s(v128.load(outputWeights + offset), v128.load(KINGPAIR_HIDDEN2_I16 + offset))
    );
  }
  return (
    load<i32>(kingPairWeights + <usize>KINGPAIR_OUT_B_OFF) +
    i32x4.extract_lane(sum4, 0) +
    i32x4.extract_lane(sum4, 1) +
    i32x4.extract_lane(sum4, 2) +
    i32x4.extract_lane(sum4, 3)
  );
}

function kingPairEvaluateFull(): i32 {
  kingPairBuildAccS(nnueChkS);
  kingPairBuildAccG(nnueChkG);
  nnueEvalCount++;
  return teban == SENTE
    ? kingPairEvaluateFrom(nnueChkS, nnueChkG)
    : kingPairEvaluateFrom(nnueChkG, nnueChkS);
}

function kingPairEvaluateFast(): i32 {
  if (!nnueApplyPendingS() || !nnueApplyPendingG()) return kingPairEvaluateFull();
  nnueEvalCount++;
  return teban == SENTE
    ? kingPairEvaluateFrom(nnueAccS, nnueAccG)
    : kingPairEvaluateFrom(nnueAccG, nnueAccS);
}
`;

export function applyKingPairRuntimeTransform(input) {
  let source = replaceExactlyOnce(
    input,
    '// --- w1 row addressing (row = 256 int16 weights = 512 bytes) -----------------',
    `${KINGPAIR_RUNTIME}\n// --- w1 row addressing (row = 256 int16 weights = 512 bytes) -----------------`,
    'KingPair runtime insertion',
  );

  source = insertAtFunctionStart(
    source,
    'function nnueMoveCrossesS(m: i32): bool',
    '\n  if (kingPairRuntimeEnabled) return kingPairMoveCrossesS(m);',
  );
  source = insertAtFunctionStart(
    source,
    'function nnueMoveCrossesG(m: i32): bool',
    '\n  if (kingPairRuntimeEnabled) return kingPairMoveCrossesG(m);',
  );
  for (const [signature, delegate] of [
    ['function nnueAccApplyMakeS(m: i32): void', 'kingPairAccApplyMakeS(m);'],
    ['function nnueAccApplyMakeG(m: i32): void', 'kingPairAccApplyMakeG(m);'],
    ['function nnueAccApplyUnmakeS(m: i32): void', 'kingPairAccApplyUnmakeS(m);'],
    ['function nnueAccApplyUnmakeG(m: i32): void', 'kingPairAccApplyUnmakeG(m);'],
  ]) {
    source = insertAtFunctionStart(
      source,
      signature,
      `\n  if (kingPairRuntimeEnabled) { ${delegate} return; }`,
    );
  }
  source = insertAtFunctionStart(
    source,
    'function nnueBuildAccS(accS: StaticArray<i32>): void',
    '\n  if (kingPairRuntimeEnabled) { kingPairBuildAccS(accS); return; }',
  );
  source = insertAtFunctionStart(
    source,
    'function nnueBuildAccG(accG: StaticArray<i32>): void',
    '\n  if (kingPairRuntimeEnabled) { kingPairBuildAccG(accG); return; }',
  );
  source = insertAtFunctionStart(
    source,
    'export function nnueEvaluate(): i32',
    '\n  if (kingPairRuntimeEnabled) return kingPairEvaluateFull();',
  );
  source = insertAtFunctionStart(
    source,
    'export function nnueEvaluateFast(): i32',
    '\n  if (kingPairRuntimeEnabled) return kingPairEvaluateFast();',
  );
  source = replaceExactlyOnce(
    source,
    '  for (let j = 0; j < NNUE_H1; j++) {\n    if (unchecked(nnueChkS[j]) != unchecked(nnueAccS[j])) bad++;',
    '  const mismatchLanes = kingPairRuntimeEnabled ? KINGPAIR_H1 : NNUE_H1;\n  for (let j = 0; j < mismatchLanes; j++) {\n    if (unchecked(nnueChkS[j]) != unchecked(nnueAccS[j])) bad++;',
    'accumulator mismatch lane count',
  );
  source = replaceExactlyOnce(
    source,
    '  nnueBuildAccS(nnueAccS);\n  nnueBuildAccG(nnueAccG);\n  nnueBuildW2T();',
    '  nnueBuildAccS(nnueAccS);\n  nnueBuildAccG(nnueAccG);\n  if (!kingPairRuntimeEnabled) nnueBuildW2T();',
    'candidate refresh branch',
  );
  return source;
}

function runAsc(cwd, outFile) {
  const result = spawnSync(
    'npx',
    [
      '-y',
      '-p',
      'assemblyscript@0.28.19',
      'asc',
      'wasm-spike/assembly/index.ts',
      '--outFile',
      outFile,
      '-O3',
      '--runtime',
      'stub',
      '--noAssert',
      '--enable',
      'simd',
    ],
    { cwd, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

export function buildKingPairRuntimeSkeleton(out) {
  for (const label of Object.keys(INPUTS)) requireIdentity(label);
  if (!isAbsolute(out)) throw new Error('--out must be absolute');
  if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);

  const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-kingpair-runtime-'));
  try {
    const assemblyDir = join(tempRoot, 'wasm-spike', 'assembly');
    mkdirSync(assemblyDir, { recursive: true });
    copyFileSync(INPUTS.source, join(assemblyDir, 'index.ts'));
    copyFileSync(INPUTS.tables, join(assemblyDir, 'tables.ts'));
    copyFileSync(INPUTS.ambient, join(assemblyDir, 'as-ambient.d.ts'));

    runAsc(tempRoot, 'baseline.wasm');
    const baselineIdentity = identity(join(tempRoot, 'baseline.wasm'));
    if (
      baselineIdentity[0] !== EXPECTED.productionWasm[0] ||
      baselineIdentity[1] !== EXPECTED.productionWasm[1]
    ) {
      throw new Error(
        `no-patch rebuild mismatch: expected ${EXPECTED.productionWasm.join('/')}, ` +
          `got ${baselineIdentity.join('/')}`,
      );
    }

    const transformed = applyKingPairRuntimeTransform(readFileSync(INPUTS.source, 'utf8'));
    const transformedIdentity = [
      Buffer.byteLength(transformed),
      createHash('sha256').update(transformed).digest('hex'),
    ];
    if (
      transformedIdentity[0] !== EXPECTED.transformedSource[0] ||
      transformedIdentity[1] !== EXPECTED.transformedSource[1]
    ) {
      throw new Error(
        `transformed source mismatch: expected ${EXPECTED.transformedSource.join('/')}, ` +
          `got ${transformedIdentity.join('/')}`,
      );
    }
    writeFileSync(join(assemblyDir, 'index.ts'), transformed);
    runAsc(tempRoot, 'candidate.wasm');
    const builtCandidateIdentity = identity(join(tempRoot, 'candidate.wasm'));
    if (
      builtCandidateIdentity[0] !== EXPECTED.candidateWasm[0] ||
      builtCandidateIdentity[1] !== EXPECTED.candidateWasm[1]
    ) {
      throw new Error(
        `candidate WASM mismatch: expected ${EXPECTED.candidateWasm.join('/')}, ` +
          `got ${builtCandidateIdentity.join('/')}`,
      );
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
  if (index < 0 || !process.argv[index + 1] || process.argv.length !== 4) {
    throw new Error('usage: --out /absolute/path');
  }
  console.log(JSON.stringify(buildKingPairRuntimeSkeleton(process.argv[index + 1]), null, 2));
}
