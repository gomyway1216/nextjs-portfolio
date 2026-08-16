import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { applyDpaHalfkp96RuntimeTransform } from './build-dpa-halfkp96-runtime-skeleton.mjs';

const source = readFileSync(new URL('./assembly/index.ts', import.meta.url), 'utf8');

test('adds a separate 96x2 antisymmetric evaluator body', () => {
  const transformed = applyDpaHalfkp96RuntimeTransform(source);
  assert.match(transformed, /const DPA_H1: i32 = 96;/);
  assert.match(transformed, /const DPA_TOTAL_BYTES: i32 = 35_490_240;/);
  assert.match(transformed, /export function setDpaHalfkp96RuntimeEnabled/);
  assert.match(transformed, /i32x4\.sub\(usLo, themLo\)/);
  assert.match(transformed, /if \(!nnueApplyPendingS\(\) \|\| !nnueApplyPendingG\(\)\)/);
  assert.doesNotMatch(transformed, /DPA_MIX|DPA_HEAD|DPA_POLICY/);
  const selector = transformed.slice(
    transformed.indexOf('export function setNnueBuckets'),
    transformed.indexOf('export function getNnueBuckets'),
  );
  assert.doesNotMatch(selector, /DPA/);
});

test('refuses a second DPA-HalfKP96 transform', () => {
  assert.throws(
    () => applyDpaHalfkp96RuntimeTransform(applyDpaHalfkp96RuntimeTransform(source)),
    /anchor must occur exactly once/,
  );
});
