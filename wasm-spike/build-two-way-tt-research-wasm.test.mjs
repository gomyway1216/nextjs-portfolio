import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { applyTwoWayTtTransform } from './build-two-way-tt-research-wasm.mjs';

const source = readFileSync(new URL('./assembly/index.ts', import.meta.url), 'utf8');

test('changes only the private TT to a depth-preferred two-way set', () => {
  const transformed = applyTwoWayTtTransform(source);
  assert.match(transformed, /const TT_SET_MASK: i32 = 0x07ffff;/);
  assert.match(transformed, /const TT_WAYS: i32 = 2;/);
  assert.match(transformed, /for \(let way = 0; way < TT_WAYS; way\+\+\)/);
  assert.match(transformed, /if \(remainDepth < shallowestDepth\) return;/);
  assert.match(transformed, /hostSharedTtProbe\(hashVal, hashB\)/);
  assert.match(transformed, /hostSharedTtStore\(hashVal, getSecondaryHashVal\(\), value,/);
});

test('refuses a second transform', () => {
  assert.throws(() => applyTwoWayTtTransform(applyTwoWayTtTransform(source)), /anchor must occur exactly once/);
});
