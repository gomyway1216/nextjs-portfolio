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
const researchPatch = join(scriptDir, 'assembly', 'halfkp81-research.patch');
const output = join(scriptDir, 'artifacts', 'shogi-halfkp81-research.wasm');

const EXPECTED = {
  productionSource: {
    bytes: 139_447,
    sha256: '0a522e5e167e9a6070d2d1f339ceaada48f623493a827038b744b2b49163115c',
  },
  patchedSource: {
    bytes: 140_565,
    sha256: '56c2d986adb3bd75d16ec8dfc64fa32571b1df8ca23af4c7984b51f11c3a1a63',
  },
  wasm: {
    bytes: 35_837,
    sha256: '1b95659d54fc897e2ff766583ccc2035a0932929fcb9520800c3a5ca2b1430db',
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

const tempRoot = mkdtempSync(join(tmpdir(), 'shogi-halfkp81-research-'));
try {
  const tempAssembly = join(tempRoot, 'wasm-spike', 'assembly');
  mkdirSync(tempAssembly, { recursive: true });
  copyFileSync(productionSource, join(tempAssembly, 'index.ts'));
  copyFileSync(tablesSource, join(tempAssembly, 'tables.ts'));

  run('patch', ['--silent', '-p0'], {
    cwd: tempAssembly,
    input: readFileSync(researchPatch),
  });
  requireIdentity(join(tempAssembly, 'index.ts'), EXPECTED.patchedSource, 'patched research source');

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
  requireIdentity(tempWasm, EXPECTED.wasm, 'research WASM');

  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(tempWasm, output);
  console.log(
    `[halfkp81] wrote ${statSync(output).size} bytes to ${output}\n` +
      `[halfkp81] sha256=${EXPECTED.wasm.sha256}\n` +
      `[halfkp81] production source and production WASM were not modified`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
