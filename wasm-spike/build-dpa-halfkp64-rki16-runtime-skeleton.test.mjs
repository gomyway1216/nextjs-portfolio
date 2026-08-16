import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyDpaHalfkp64Rki16RuntimeTransform } from './build-dpa-halfkp64-rki16-runtime-skeleton.mjs';

const input = readFileSync(new URL('./assembly/index.ts', import.meta.url), 'utf8');

test('integrates a 64-lane antisymmetric body and 16-lane relative-king factor', () => {
  const transformed = applyDpaHalfkp64Rki16RuntimeTransform(input);
  assert.match(transformed, /const RKI_H1: i32 = 64;/);
  assert.match(transformed, /const RKI_REL_H: i32 = 16;/);
  assert.match(transformed, /const RKI_TOTAL_BYTES: i32 = 23_665_376;/);
  assert.match(transformed, /function rkiEvaluateRelative\(senteViewFirst: bool\): i32/);
  assert.match(transformed, /rkiEvaluateFrom\(nnueAccS, nnueAccG\) \+ rkiEvaluateRelative\(true\)/);
  assert.match(transformed, /getDpaHalfkp64Rki16WeightsPtr/);
  assert.doesNotMatch(transformed, /DPA_MIX|DPA_HEAD|RKI_POLICY/);
});

test('refuses a second HalfKP64 RKI16 transform', () => {
  const transformed = applyDpaHalfkp64Rki16RuntimeTransform(input);
  assert.throws(() => applyDpaHalfkp64Rki16RuntimeTransform(transformed));
});
