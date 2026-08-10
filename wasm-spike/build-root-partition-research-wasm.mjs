#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const root = join(scriptDir, '..');

const protectedInputs = {
  source: {
    path: join(scriptDir, 'assembly', 'index.ts'),
    bytes: 150_322,
    sha256: 'd80d2e7a7fe605912965f43e89946960c92a587481c365cbe200006b47a32e23',
  },
  tables: {
    path: join(scriptDir, 'assembly', 'tables.ts'),
    bytes: 3_926,
    sha256: 'ec140608ce91c7892cc7b2bdbbb0892ffc8003ec2b6cca0f81633dfd5f483dd2',
  },
  productionWasm: {
    path: join(root, 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm'),
    bytes: 38_288,
    sha256: '1a9cb6fed8df7b0f02dc440e3fc8764f490738cec664168b0bfe47e081a07cd6',
  },
  weights: {
    path: join(root, 'public', 'shogi-nnue-weights.bin'),
    bytes: 94_656_708,
    sha256: '25fc77addcd5e147906bb197313f2e5c6d4e4c3acc93fddbdb876c695818bd40',
  },
};

function identity(path) {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function requireIdentity(input, label) {
  const actual = identity(input.path);
  if (actual.bytes !== input.bytes || actual.sha256 !== input.sha256) {
    throw new Error(
      `${label} identity mismatch: expected ${input.bytes}/${input.sha256}, ` +
        `got ${actual.bytes}/${actual.sha256}`,
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

export function applyRootPartitionTransform(input) {
  let source = input;

  source = replaceExactlyOnce(
    source,
    `let rootBestKey: i32 = 0;\nlet orderDepthLeft: i32 = 99;`,
    `let rootBestKey: i32 = 0;\n` +
      `let rootPartitionModG: i32 = 1;\n` +
      `let rootPartitionRemG: i32 = 0;\n` +
      `let orderDepthLeft: i32 = 99;\n\n` +
      `@inline\n` +
      `function rootPartitionAcceptAS(originalIndex: i32): bool {\n` +
      `  return rootPartitionModG <= 1 || originalIndex % rootPartitionModG == rootPartitionRemG;\n` +
      `}`,
    'root state',
  );

  source = replaceExactlyOnce(
    source,
    `  const base = ply * MAX_MOVES;\n\n  orderDepthLeft = depthLeft;`,
    `  const base = ply * MAX_MOVES;\n\n` +
      `  if (ply == 0 && rootPartitionModG > 1) {\n` +
      `    let kept = 0;\n` +
      `    for (let originalIndex = 0; originalIndex < n; originalIndex++) {\n` +
      `      if (!rootPartitionAcceptAS(originalIndex)) continue;\n` +
      `      unchecked(moveBuf[base + kept] = moveBuf[base + originalIndex]);\n` +
      `      kept++;\n` +
      `    }\n` +
      `    n = kept;\n` +
      `  }\n\n` +
      `  orderDepthLeft = depthLeft;`,
    'root search partition',
  );

  source = replaceExactlyOnce(
    source,
    `  for (let i = 0; i < pseudoN; i++) {\n    const m = unchecked(moveBuf[i]);`,
    `  for (let i = 0; i < pseudoN; i++) {\n` +
      `    if (!rootPartitionAcceptAS(i)) continue;\n` +
      `    const m = unchecked(moveBuf[i]);`,
    'root fallback partition',
  );

  source = replaceExactlyOnce(
    source,
    `export function setRootTesu(tesu: i32): void {\n  rootTesuG = tesu;\n}`,
    `export function setRootTesu(tesu: i32): void {\n` +
      `  rootTesuG = tesu;\n` +
      `}\n\n` +
      `export function setRootMovePartition(modulus: i32, remainder: i32): void {\n` +
      `  if (modulus == 2 && remainder >= 0 && remainder < modulus) {\n` +
      `    rootPartitionModG = modulus;\n` +
      `    rootPartitionRemG = remainder;\n` +
      `  } else {\n` +
      `    rootPartitionModG = 1;\n` +
      `    rootPartitionRemG = 0;\n` +
      `  }\n` +
      `  clearTT();\n` +
      `}\n\n` +
      `export function getRootMovePartitionModulus(): i32 {\n` +
      `  return rootPartitionModG;\n` +
      `}\n\n` +
      `export function getRootMovePartitionRemainder(): i32 {\n` +
      `  return rootPartitionRemG;\n` +
      `}\n\n` +
      `export function getRootPartitionLegalMoveCount(): i32 {\n` +
      `  const mover = teban;\n` +
      `  const inCheck = isKingInCheck(mover);\n` +
      `  const n = inCheck ? generateEvasionMoves(0) : generateMoves(0);\n` +
      `  let count = 0;\n` +
      `  for (let i = 0; i < n; i++) {\n` +
      `    if (!rootPartitionAcceptAS(i)) continue;\n` +
      `    const m = unchecked(moveBuf[i]);\n` +
      `    makeMove(m);\n` +
      `    const illegal = isKingInCheck(mover);\n` +
      `    unmakeMove(m);\n` +
      `    if (!illegal) count++;\n` +
      `  }\n` +
      `  return count;\n` +
      `}\n\n` +
      `export function rootPartitionContainsMoveKey(key: i32): i32 {\n` +
      `  const mover = teban;\n` +
      `  const inCheck = isKingInCheck(mover);\n` +
      `  const n = inCheck ? generateEvasionMoves(0) : generateMoves(0);\n` +
      `  for (let i = 0; i < n; i++) {\n` +
      `    if (!rootPartitionAcceptAS(i)) continue;\n` +
      `    const m = unchecked(moveBuf[i]);\n` +
      `    if (jsMoveKeyOf(m) != key) continue;\n` +
      `    makeMove(m);\n` +
      `    const illegal = isKingInCheck(mover);\n` +
      `    unmakeMove(m);\n` +
      `    return illegal ? 0 : 1;\n` +
      `  }\n` +
      `  return 0;\n` +
      `}`,
    'root partition API',
  );

  return source;
}

function parseArgs(argv) {
  const outIndex = argv.indexOf('--out');
  if (outIndex < 0 || !argv[outIndex + 1]) throw new Error('--out is required');
  if (argv.length !== 2) throw new Error('usage: --out /absolute/path/candidate.wasm');
  const out = argv[outIndex + 1];
  if (!isAbsolute(out)) throw new Error('--out must be an absolute path');
  if (existsSync(out)) throw new Error(`refusing to overwrite existing output: ${out}`);
  return { out };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
}

export function buildRootPartitionCandidate(out) {
  for (const [label, input] of Object.entries(protectedInputs)) requireIdentity(input, label);

  const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-root-partition-'));
  try {
    const tempAssembly = join(tempRoot, 'wasm-spike', 'assembly');
    mkdirSync(tempAssembly, { recursive: true });
    const transformed = applyRootPartitionTransform(readFileSync(protectedInputs.source.path, 'utf8'));
    writeFileSync(join(tempAssembly, 'index.ts'), transformed);
    copyFileSync(protectedInputs.tables.path, join(tempAssembly, 'tables.ts'));

    const tempWasm = join(tempRoot, 'candidate.wasm');
    run(
      'npx',
      [
        '-y',
        '-p',
        'assemblyscript@0.28.19',
        'asc',
        'wasm-spike/assembly/index.ts',
        '--outFile',
        'candidate.wasm',
        '-O3',
        '--runtime',
        'stub',
        '--noAssert',
        '--enable',
        'simd',
      ],
      { cwd: tempRoot },
    );
    const wasmBytes = readFileSync(tempWasm);
    if (!WebAssembly.validate(wasmBytes)) throw new Error('compiled candidate failed WebAssembly.validate');

    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(tempWasm, out);

    for (const [label, input] of Object.entries(protectedInputs)) requireIdentity(input, `${label} after build`);
    return { output: resolve(out), ...identity(out), source: identity(protectedInputs.source.path) };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(scriptPath)) {
  try {
    const { out } = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(buildRootPartitionCandidate(out), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
