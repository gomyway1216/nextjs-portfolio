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
const patches = [
  'halfkp81-research.patch',
  'halfkp81-dual-research.patch',
  'halfkp81-dual-fast-research.patch',
  'bonapiece-halfkp-research.patch',
].map((name) => join(scriptDir, 'assembly', name));
const output = join(scriptDir, 'artifacts', 'shogi-bonapiece-halfkp-research.wasm');

const EXPECTED = {
  productionSource: {
    bytes: 139_447,
    sha256: '0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c',
  },
  patchedSource: {
    bytes: 155_468,
    sha256: '71e4cc2babc5fb5b0b318f21b7f3f618925472bf055c7b545cf31d49ec7c9cd3',
  },
  wasm: {
    bytes: 39_516,
    sha256: 'da093d0e6f6c2f046072784ba757de30aa2f41bae11270b7b90c5209c22fafdb',
  },
};

function identity(path) {
  const bytes = readFileSync(path);
  return { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
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

const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-bonapiece-halfkp-research-'));
try {
  const tempAssembly = join(tempRoot, 'wasm-spike', 'assembly');
  const tempIndex = join(tempAssembly, 'index.ts');
  mkdirSync(tempAssembly, { recursive: true });
  copyFileSync(productionSource, tempIndex);
  copyFileSync(tablesSource, join(tempAssembly, 'tables.ts'));
  for (const patch of patches) {
    run('patch', ['--silent', '-p0'], { cwd: tempAssembly, input: readFileSync(patch) });
  }
  requireIdentity(tempIndex, EXPECTED.patchedSource, 'BonaPiece research source');

  const tempWasm = join(tempRoot, 'research.wasm');
  run(
    'npx',
    [
      '-y', '-p', 'assemblyscript@0.28.19', 'asc', 'wasm-spike/assembly/index.ts',
      '--outFile', 'research.wasm', '-O3', '--runtime', 'stub', '--noAssert', '--enable', 'simd',
    ],
    { cwd: tempRoot },
  );
  requireIdentity(tempWasm, EXPECTED.wasm, 'BonaPiece research WASM');
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(tempWasm, output);
  console.log(
    `[bonapiece-halfkp-format84] wrote ${statSync(output).size} bytes to ${output}\n` +
      `[bonapiece-halfkp] sha256=${EXPECTED.wasm.sha256}\n` +
      `[bonapiece-halfkp] production source and production WASM were not modified`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
