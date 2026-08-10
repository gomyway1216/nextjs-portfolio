import { describe, expect, it } from 'vitest';

import {
  buildRows,
  cutoffBucketForCounts,
  type Candidate,
} from '../../../ml/build_kingpair_runop1_selection_shards';
import { positionKeyFromSfen } from '../../../ml/sibling-data';

const CHECKMATED = '4k4/4+R4/5G3/9/9/9/9/9/4K4 w - 1';
const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

function candidate(sfen: string, priority: string): Candidate {
  return {
    priority,
    positionId: positionKeyFromSfen(sfen),
    sfen,
    ply: 0,
  };
}

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

  it('replaces terminal rows with the next deterministic candidate', () => {
    const selected = buildRows([
      candidate(CHECKMATED, '0'.repeat(64)),
      candidate(START, '1'.repeat(64)),
    ], 1);
    expect(selected.rejectedLegal).toBe(1);
    expect(selected.rows).toHaveLength(1);
    expect(selected.rows[0].parent_sfen).toBe(START);
    expect(selected.rows[0].global_index).toBe(0);
  });
});
