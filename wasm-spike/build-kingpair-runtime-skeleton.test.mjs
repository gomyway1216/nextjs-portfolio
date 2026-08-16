import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { applyKingPairRuntimeTransform } from './build-kingpair-runtime-skeleton.mjs';

const source = readFileSync(new URL('./assembly/index.ts', import.meta.url), 'utf8');

test('adds an isolated KingPair runtime without changing production NNUE selectors', () => {
  const transformed = applyKingPairRuntimeTransform(source);
  assert.match(transformed, /const KINGPAIR_TOTAL_BYTES: i32 = 47_401_444;/);
  assert.match(transformed, /export function getKingPairWeightsPtr\(\): usize/);
  assert.match(transformed, /export function setKingPairRuntimeEnabled\(flag: i32\): i32/);
  assert.match(transformed, /if \(kingPairRuntimeEnabled\) return kingPairEvaluateFast\(\);/);
  assert.match(transformed, /if \(!nnueApplyPendingS\(\) \|\| !nnueApplyPendingG\(\)\)/);
  assert.match(transformed, /const product = \(us \* them \+ 63\) \/ 127;/);
  assert.match(transformed, /if \(!kingPairRuntimeEnabled\) nnueBuildW2T\(\);/);

  const selector = transformed.slice(
    transformed.indexOf('export function setNnueBuckets'),
    transformed.indexOf('export function getNnueBuckets'),
  );
  assert.match(
    selector,
    /buckets != 1 &&\s+buckets != NNUE_KP_BUCKETS &&\s+buckets != NNUE_HALFKP_BUCKETS/,
  );
  assert.doesNotMatch(selector, /KINGPAIR/);
});

test('refuses to apply the KingPair runtime transform twice', () => {
  assert.throws(
    () => applyKingPairRuntimeTransform(applyKingPairRuntimeTransform(source)),
    /anchor must occur exactly once/,
  );
});
