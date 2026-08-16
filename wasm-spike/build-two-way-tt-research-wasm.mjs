#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');
const expected = {
  source: [150_322, 'd80d2e7a7fe605912965f43e89946960c92a587481c365cbe200006b47a32e23'],
  tables: [3_926, 'ec140608ce91c7892cc7b2bdbbb0892ffc8003ec2b6cca0f81633dfd5f483dd2'],
  productionWasm: [38_288, '1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6'],
  weights: [94_656_708, '25fc77addcd5e147906bb197313f2e5c6d4e4c3acc93fddbdb876c695818bd40'],
};
const inputs = {
  source: join(scriptDir, 'assembly', 'index.ts'),
  tables: join(scriptDir, 'assembly', 'tables.ts'),
  productionWasm: join(root, 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm'),
  weights: join(root, 'public', 'shogi-nnue-weights.bin'),
};

function identity(path) {
  const bytes = readFileSync(path);
  return [bytes.byteLength, createHash('sha256').update(bytes).digest('hex')];
}

function requireIdentity(label) {
  const actual = identity(inputs[label]);
  if (actual[0] !== expected[label][0] || actual[1] !== expected[label][1]) {
    throw new Error(`${label} identity mismatch: expected ${expected[label].join('/')}, got ${actual.join('/')}`);
  }
}

function replaceExactlyOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`${label} anchor must occur exactly once`);
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

function replaceFunction(source, signature, replacement) {
  const start = source.indexOf(signature);
  if (start < 0 || source.indexOf(signature, start + signature.length) >= 0) {
    throw new Error(`${signature} must occur exactly once`);
  }
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(0, start) + replacement + source.slice(index + 1);
    }
  }
  throw new Error(`${signature} has no balanced body`);
}

export function applyTwoWayTtTransform(input) {
  let source = replaceExactlyOnce(
    input,
    `const TT_SIZE: i32 = 0x100000;\nconst TT_MASK: i32 = 0x0fffff;`,
    `const TT_SIZE: i32 = 0x100000;\nconst TT_SET_MASK: i32 = 0x07ffff;\nconst TT_WAYS: i32 = 2;`,
    'TT geometry',
  );

  source = replaceFunction(
    source,
    'function ttLookup(hashVal: i32): bool',
    `function ttLookup(hashVal: i32): bool {\n` +
      `  const hashB = getSecondaryHashVal();\n` +
      `  if (sharedTtEnabled) {\n` +
      `    if (hostSharedTtProbe(hashVal, hashB) == 0) return false;\n` +
      `    ttHitValue = unchecked(sharedTtScratch[0]);\n` +
      `    const fd = unchecked(sharedTtScratch[1]);\n` +
      `    ttHitFlag = fd & 3;\n` +
      `    ttHitDepth = (fd >> 2) & 0xff;\n` +
      `    ttHitBest = unchecked(sharedTtScratch[2]);\n` +
      `    ttHitSecond = unchecked(sharedTtScratch[3]);\n` +
      `    return true;\n` +
      `  }\n` +
      `  const base = (hashVal & TT_SET_MASK) * TT_WAYS;\n` +
      `  for (let way = 0; way < TT_WAYS; way++) {\n` +
      `    const index = base + way;\n` +
      `    if (unchecked(ttUsedA[index]) == 0) continue;\n` +
      `    if (unchecked(ttHashA[index]) != hashVal) continue;\n` +
      `    if (unchecked(ttHashB[index]) != hashB) continue;\n` +
      `    ttHitValue = unchecked(ttValueA[index]);\n` +
      `    ttHitFlag = <i32>unchecked(ttFlagA[index]);\n` +
      `    ttHitDepth = <i32>unchecked(ttDepthA[index]);\n` +
      `    ttHitBest = unchecked(ttBestA[index]);\n` +
      `    ttHitSecond = unchecked(ttSecondA[index]);\n` +
      `    return true;\n` +
      `  }\n` +
      `  return false;\n` +
      `}`,
  );

  source = replaceFunction(
    source,
    'function ttAdd(hashVal: i32, value: i32, alpha: i32, beta: i32, bestKey: i32, remainDepth: i32): void',
    `function ttAdd(hashVal: i32, value: i32, alpha: i32, beta: i32, bestKey: i32, remainDepth: i32): void {\n` +
      `  let flag = TT_EXACT;\n` +
      `  if (value <= alpha) flag = TT_UPPER;\n` +
      `  else if (value >= beta) flag = TT_LOWER;\n\n` +
      `  if (sharedTtEnabled) {\n` +
      `    hostSharedTtStore(hashVal, getSecondaryHashVal(), value,\n` +
      `      flag | ((remainDepth & 0xff) << 2) | SHARED_TT_USED_BIT, bestKey);\n` +
      `    return;\n` +
      `  }\n\n` +
      `  const hashB = getSecondaryHashVal();\n` +
      `  const base = (hashVal & TT_SET_MASK) * TT_WAYS;\n` +
      `  let matching = -1;\n` +
      `  let empty = -1;\n` +
      `  let shallowest = base;\n` +
      `  let shallowestDepth = 256;\n` +
      `  for (let way = 0; way < TT_WAYS; way++) {\n` +
      `    const probe = base + way;\n` +
      `    if (unchecked(ttUsedA[probe]) == 0) {\n` +
      `      if (empty < 0) empty = probe;\n` +
      `      continue;\n` +
      `    }\n` +
      `    if (unchecked(ttHashA[probe]) == hashVal && unchecked(ttHashB[probe]) == hashB) {\n` +
      `      matching = probe;\n` +
      `      break;\n` +
      `    }\n` +
      `    const probeDepth = <i32>unchecked(ttDepthA[probe]);\n` +
      `    if (probeDepth < shallowestDepth) {\n` +
      `      shallowestDepth = probeDepth;\n` +
      `      shallowest = probe;\n` +
      `    }\n` +
      `  }\n\n` +
      `  let index = matching;\n` +
      `  if (index >= 0) {\n` +
      `    if (remainDepth < <i32>unchecked(ttDepthA[index])) return;\n` +
      `    unchecked(ttSecondA[index] = ttBestA[index]);\n` +
      `  } else {\n` +
      `    if (empty >= 0) index = empty;\n` +
      `    else {\n` +
      `      if (remainDepth < shallowestDepth) return;\n` +
      `      index = shallowest;\n` +
      `    }\n` +
      `    unchecked(ttUsedA[index] = 1);\n` +
      `    unchecked(ttHashA[index] = hashVal);\n` +
      `    unchecked(ttHashB[index] = hashB);\n` +
      `    unchecked(ttSecondA[index] = 0);\n` +
      `  }\n` +
      `  unchecked(ttBestA[index] = bestKey);\n` +
      `  unchecked(ttValueA[index] = value);\n` +
      `  unchecked(ttFlagA[index] = <u8>flag);\n` +
      `  unchecked(ttDepthA[index] = <u8>(remainDepth & 0xff));\n` +
      `}`,
  );
  return source;
}

export function buildTwoWayTtCandidate(out) {
  for (const label of Object.keys(inputs)) requireIdentity(label);
  if (!isAbsolute(out)) throw new Error('--out must be absolute');
  if (existsSync(out)) throw new Error(`refusing to overwrite ${out}`);
  const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-two-way-tt-'));
  try {
    const assemblyDir = join(tempRoot, 'wasm-spike', 'assembly');
    mkdirSync(assemblyDir, { recursive: true });
    writeFileSync(join(assemblyDir, 'index.ts'), applyTwoWayTtTransform(readFileSync(inputs.source, 'utf8')));
    copyFileSync(inputs.tables, join(assemblyDir, 'tables.ts'));
    const result = spawnSync(
      'npx',
      ['-y', '-p', 'assemblyscript@0.28.19', 'asc', 'wasm-spike/assembly/index.ts', '--outFile', 'candidate.wasm', '-O3', '--runtime', 'stub', '--noAssert', '--enable', 'simd'],
      { cwd: tempRoot, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    mkdirSync(dirname(out), { recursive: true });
    const tempOut = `${out}.tmp`;
    copyFileSync(join(tempRoot, 'candidate.wasm'), tempOut);
    renameSync(tempOut, out);
    return { path: out, ...Object.fromEntries([['bytes', statSync(out).size], ['sha256', identity(out)[1]]]) };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--out');
  if (index < 0 || !process.argv[index + 1] || process.argv.length !== 4) throw new Error('usage: --out /absolute/path');
  console.log(JSON.stringify(buildTwoWayTtCandidate(process.argv[index + 1])));
}
