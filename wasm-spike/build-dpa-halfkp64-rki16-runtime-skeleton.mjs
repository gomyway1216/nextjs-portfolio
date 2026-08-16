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

import { applyDpaHalfkp96RuntimeTransform } from './build-dpa-halfkp96-runtime-skeleton.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const EXPECTED = {
  source: [150_322, 'd80d2e7a7fe605912965f43e89946960c92a587481c365cbe200006b47a32e23'],
  tables: [3_926, 'ec140608ce91c7892cc7b2bdbbb0892ffc8003ec2b6cca0f81633dfd5f483dd2'],
  ambient: [2_751, '7a5e32a319fabf9533cda9725e2d2f6ca8a412aba0dc346155b567c704a7f63a'],
  baselineWasm: [38_288, '1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6'],
  transformedSource: [163_575, '5a761ab1563d47c6ae24e59d2d900c152c7b380bf012dc8378f1bdbe2951c587'],
  candidateWasm: [45_751, '0c07a50793470b354bd57072565476a9a87dc9189271aa43c9ef15a0105bc7e3'],
};
const INPUTS = {
  source: join(scriptDir, 'assembly', 'index-halfkp64-rki16.ts'),
  tables: join(scriptDir, 'assembly', 'tables.ts'),
  ambient: join(scriptDir, 'assembly', 'as-ambient.d.ts'),
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

const RELATIVE_EVALUATOR = String.raw`
function rkiKingIndexS(pos: i32): i32 {
  return ((pos >> 4) - 1) * 9 + ((pos & 0x0f) - 1);
}

function rkiKingIndexG(pos: i32): i32 {
  return (9 - (pos >> 4)) * 9 + (9 - (pos & 0x0f));
}

function rkiEvaluateRelative(senteViewFirst: bool): i32 {
  const rowBytes: usize = <usize>(RKI_REL_H * 2);
  const sSelf = rkiWeights + <usize>RKI_REL_SELF_OFF + <usize>rkiBucketS() * rowBytes;
  const sOther = rkiWeights + <usize>RKI_REL_OTHER_OFF + <usize>rkiKingIndexS(kingG) * rowBytes;
  const gSelf = rkiWeights + <usize>RKI_REL_SELF_OFF + <usize>rkiBucketG() * rowBytes;
  const gOther = rkiWeights + <usize>RKI_REL_OTHER_OFF + <usize>rkiKingIndexG(kingS) * rowBytes;
  const outputWeights = rkiWeights + <usize>RKI_REL_OUT_OFF;
  let sum4 = i32x4.splat(0);
  for (let j = 0; j < RKI_REL_H; j += 8) {
    const off = <usize>(j << 1);
    const sLeft = v128.load(sSelf + off);
    const sRight = v128.load(sOther + off);
    const gLeft = v128.load(gSelf + off);
    const gRight = v128.load(gOther + off);
    const sLo = i32x4.shr_s(i32x4.extmul_low_i16x8_s(sLeft, sRight), 7);
    const sHi = i32x4.shr_s(i32x4.extmul_high_i16x8_s(sLeft, sRight), 7);
    const gLo = i32x4.shr_s(i32x4.extmul_low_i16x8_s(gLeft, gRight), 7);
    const gHi = i32x4.shr_s(i32x4.extmul_high_i16x8_s(gLeft, gRight), 7);
    const diff = senteViewFirst
      ? i16x8.narrow_i32x4_s(i32x4.sub(sLo, gLo), i32x4.sub(sHi, gHi))
      : i16x8.narrow_i32x4_s(i32x4.sub(gLo, sLo), i32x4.sub(gHi, sHi));
    sum4 = i32x4.add(
      sum4,
      i32x4.dot_i16x8_s(v128.load(outputWeights + off), diff)
    );
  }
  return (
    i32x4.extract_lane(sum4, 0) +
    i32x4.extract_lane(sum4, 1) +
    i32x4.extract_lane(sum4, 2) +
    i32x4.extract_lane(sum4, 3)
  );
}
`;

export function applyDpaHalfkp64Rki16RuntimeTransform(input) {
  let source = applyDpaHalfkp96RuntimeTransform(input)
    .replaceAll('DpaHalfkp96', 'DpaHalfkp64Rki16')
    .replaceAll('DPA_', 'RKI_')
    .replaceAll('dpa', 'rki')
    .replace('Dual-Perspective Antisymmetric HalfKP96 evaluator body', 'Dual-Perspective HalfKP64 with integrated factorized relative-king interaction');
  source = replaceExactlyOnce(source, 'const RKI_H1: i32 = 96;', 'const RKI_H1: i32 = 64;\nconst RKI_REL_H: i32 = 16;', 'main and interaction lane counts');
  source = replaceExactlyOnce(source, 'const RKI_W1H_OFF: i32 = 35_271_936;', 'const RKI_W1H_OFF: i32 = 23_514_624;', 'hand offset');
  source = replaceExactlyOnce(source, 'const RKI_B1_OFF: i32 = 35_489_664;', 'const RKI_B1_OFF: i32 = 23_659_776;', 'bias offset');
  source = replaceExactlyOnce(source, 'const RKI_OUT_W_OFF: i32 = 35_490_048;', [
    'const RKI_OUT_W_OFF: i32 = 23_660_032;',
    'const RKI_REL_SELF_OFF: i32 = 23_660_160;',
    'const RKI_REL_OTHER_OFF: i32 = 23_662_752;',
    'const RKI_REL_OUT_OFF: i32 = 23_665_344;',
  ].join('\n'), 'main output and interaction offsets');
  source = replaceExactlyOnce(source, 'const RKI_TOTAL_BYTES: i32 = 35_490_240;', 'const RKI_TOTAL_BYTES: i32 = 23_665_376;', 'payload size');
  source = replaceExactlyOnce(
    source,
    'function rkiEvaluateFull(): i32 {',
    `${RELATIVE_EVALUATOR}\nfunction rkiEvaluateFull(): i32 {`,
    'relative evaluator insertion',
  );
  source = replaceExactlyOnce(
    source,
    `  return teban == SENTE
    ? rkiEvaluateFrom(nnueChkS, nnueChkG)
    : rkiEvaluateFrom(nnueChkG, nnueChkS);`,
    `  return teban == SENTE
    ? rkiEvaluateFrom(nnueChkS, nnueChkG) + rkiEvaluateRelative(true)
    : rkiEvaluateFrom(nnueChkG, nnueChkS) + rkiEvaluateRelative(false);`,
    'full relative-king integration',
  );
  source = replaceExactlyOnce(
    source,
    `  return teban == SENTE
    ? rkiEvaluateFrom(nnueAccS, nnueAccG)
    : rkiEvaluateFrom(nnueAccG, nnueAccS);`,
    `  return teban == SENTE
    ? rkiEvaluateFrom(nnueAccS, nnueAccG) + rkiEvaluateRelative(true)
    : rkiEvaluateFrom(nnueAccG, nnueAccS) + rkiEvaluateRelative(false);`,
    'fast relative-king integration',
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

export function buildDpaHalfkp64Rki16RuntimeSkeleton(out) {
  for (const label of Object.keys(INPUTS)) requireIdentity(label);
  if (!isAbsolute(out)) throw new Error('--out must be absolute');
  if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
  const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-dpa-halfkp64-rki16-runtime-'));
  try {
    const assemblyDir = join(tempRoot, 'wasm-spike', 'assembly');
    mkdirSync(assemblyDir, { recursive: true });
    copyFileSync(INPUTS.source, join(assemblyDir, 'index.ts'));
    copyFileSync(INPUTS.tables, join(assemblyDir, 'tables.ts'));
    copyFileSync(INPUTS.ambient, join(assemblyDir, 'as-ambient.d.ts'));
    runAsc(tempRoot, 'baseline.wasm');
    const baselineIdentity = identity(join(tempRoot, 'baseline.wasm'));
    if (baselineIdentity[0] !== EXPECTED.baselineWasm[0] || baselineIdentity[1] !== EXPECTED.baselineWasm[1]) {
      throw new Error(`no-patch rebuild mismatch: expected ${EXPECTED.baselineWasm.join('/')}, got ${baselineIdentity.join('/')}`);
    }
    const transformed = applyDpaHalfkp64Rki16RuntimeTransform(readFileSync(INPUTS.source, 'utf8'));
    const transformedIdentity = [
      Buffer.byteLength(transformed),
      createHash('sha256').update(transformed).digest('hex'),
    ];
    if (EXPECTED.transformedSource && (transformedIdentity[0] !== EXPECTED.transformedSource[0] || transformedIdentity[1] !== EXPECTED.transformedSource[1])) {
      throw new Error(`transformed source mismatch: expected ${EXPECTED.transformedSource.join('/')}, got ${transformedIdentity.join('/')}`);
    }
    writeFileSync(join(assemblyDir, 'index.ts'), transformed);
    runAsc(tempRoot, 'candidate.wasm');
    const builtCandidateIdentity = identity(join(tempRoot, 'candidate.wasm'));
    if (EXPECTED.candidateWasm && (builtCandidateIdentity[0] !== EXPECTED.candidateWasm[0] || builtCandidateIdentity[1] !== EXPECTED.candidateWasm[1])) {
      throw new Error(`candidate WASM mismatch: expected ${EXPECTED.candidateWasm.join('/')}, got ${builtCandidateIdentity.join('/')}`);
    }
    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(join(tempRoot, 'candidate.wasm'), out, constants.COPYFILE_EXCL);
    return {
      path: out,
      bytes: statSync(out).size,
      sha256: identity(out)[1],
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
  console.log(JSON.stringify(buildDpaHalfkp64Rki16RuntimeSkeleton(process.argv[index + 1]), null, 2));
}
