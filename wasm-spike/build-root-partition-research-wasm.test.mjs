import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { applyRootPartitionTransform } from './build-root-partition-research-wasm.mjs';

const source = readFileSync(new URL('./assembly/index.ts', import.meta.url), 'utf8');

test('injects a fail-closed root partition without changing the default mode', () => {
  const transformed = applyRootPartitionTransform(source);

  assert.match(transformed, /let rootPartitionModG: i32 = 1;/);
  assert.match(transformed, /let rootPartitionRemG: i32 = 0;/);
  assert.match(transformed, /if \(modulus == 2 && remainder >= 0 && remainder < modulus\)/);
  assert.match(transformed, /if \(!rootPartitionAcceptAS\(i\)\) continue;/);
  assert.match(transformed, /if \(ply == 0 && rootPartitionModG > 1\)/);
  assert.match(transformed, /export function getRootPartitionLegalMoveCount\(\): i32/);
  assert.match(transformed, /export function rootPartitionContainsMoveKey\(key: i32\): i32/);
  assert.match(transformed, /clearTT\(\);/);
});

test('refuses to transform an already transformed source', () => {
  const transformed = applyRootPartitionTransform(source);
  assert.throws(() => applyRootPartitionTransform(transformed), /anchor must occur exactly once/);
});
