#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const productionSource = join(scriptDir, 'assembly', 'index.ts');
const tablesSource = join(scriptDir, 'assembly', 'tables.ts');
const singlePatch = join(scriptDir, 'assembly', 'halfkp81-research.patch');
const dualPatch = join(scriptDir, 'assembly', 'halfkp81-dual-research.patch');
const fastPatch = join(scriptDir, 'assembly', 'halfkp81-dual-fast-research.patch');
const output = join(scriptDir, 'artifacts', 'shogi-halfkp81-dual-research.wasm');

const EXPECTED = {
  productionSource: {
    bytes: 139_447,
    sha256: '0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c',
  },
  singlePatchedSource: {
    bytes: 140_565,
    sha256: '56c2d986adb3bd75d16ec8dfc64fa32571b1df8ca23af4c7984b51f11c3a1a63',
  },
  dualPatchedSource: {
    bytes: 143_824,
    sha256: '9af13b649b56b8151c1147c55e1e02db829e0d1ba5224c4471d213c53016af92',
  },
  optimizedSource: {
    bytes: 147_463,
    sha256: '2f8b62860e3384fad2c0f0d8f5b9980f386370f1096f6008a5654deba1c1caec',
  },
  wasm: {
    bytes: 37_733,
    sha256: 'b5ee2227963ba2f1221cdd41e8cc487a49b534cee8b01cf3933e3b50db9deb62',
  },
};

function identity(path) {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function requireIdentity(path, expected, label) {
  const actual = identity(path);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(
      `${label} identity mismatch: expected ${expected.bytes}/${expected.sha256}, ` +
        `got ${actual.bytes}/${actual.sha256}`,
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} failed with exit ${result.status}${details ? `\n${details}` : ''}`);
  }
}

requireIdentity(productionSource, EXPECTED.productionSource, 'production Assembly source');

const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-halfkp81-dual-research-'));
try {
  const tempAssembly = join(tempRoot, 'wasm-spike', 'assembly');
  const tempIndex = join(tempAssembly, 'index.ts');
  mkdirSync(tempAssembly, { recursive: true });
  copyFileSync(productionSource, tempIndex);
  copyFileSync(tablesSource, join(tempAssembly, 'tables.ts'));

  run('patch', ['--silent', '-p0'], {
    cwd: tempAssembly,
    input: readFileSync(singlePatch),
  });
  requireIdentity(tempIndex, EXPECTED.singlePatchedSource, 'single HalfKP patched source');
  run('patch', ['--silent', '-p0'], {
    cwd: tempAssembly,
    input: readFileSync(dualPatch),
  });
  requireIdentity(tempIndex, EXPECTED.dualPatchedSource, 'dual HalfKP patched source');
  run('patch', ['--silent', '-p0'], {
    cwd: tempAssembly,
    input: readFileSync(fastPatch),
  });
  requireIdentity(tempIndex, EXPECTED.optimizedSource, 'optimized dual HalfKP source');

  const tempWasm = join(tempRoot, 'research.wasm');
  run(
    'npx',
    [
      '-y',
      '-p',
      'assemblyscript@0.28.19',
      'asc',
      'wasm-spike/assembly/index.ts',
      '--outFile',
      'research.wasm',
      '-O3',
      '--runtime',
      'stub',
      '--noAssert',
      '--enable',
      'simd',
    ],
    { cwd: tempRoot },
  );
  requireIdentity(tempWasm, EXPECTED.wasm, 'dual research WASM');

  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(tempWasm, output);
  console.log(
    `[halfkp81-dual] wrote ${statSync(output).size} bytes to ${output}\n` +
      `[halfkp81-dual] sha256=${EXPECTED.wasm.sha256}\n` +
      `[halfkp81-dual] production source and production WASM were not modified`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
