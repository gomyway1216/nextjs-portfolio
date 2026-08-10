import { describe, expect, it } from 'vitest';

import { cutoffBucketForCounts } from '../../../ml/build_kingpair_runop1_selection_shards';

describe('KingPair runOp1 selection shards', () => {
  it('chooses the first priority bucket reaching the fixed safety margin', () => {
    const counts = Array.from({ length: 4096 }, () => 0);
    counts[3] = 50;
    counts[7] = 60;
    expect(cutoffBucketForCounts(counts, 100)).toBe(7);
  });

  it('rejects a source too small for the deterministic safety margin', () => {
    const counts = Array.from({ length: 4096 }, () => 0);
    counts[0] = 109;
    expect(() => cutoffBucketForCounts(counts, 100)).toThrow('fewer than 110 valid candidate rows');
  });
});
