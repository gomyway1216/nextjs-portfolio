import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildSelection,
  buildRows,
  cutoffBucketForCounts,
  loadSemanticExclusionUnion,
  MANIFEST_SCHEMA,
  type Candidate,
} from '../../../ml/build_kingpair_runop1_selection_shards';
import { positionKeyFromSfen } from '../../../ml/sibling-data';

const CHECKMATED = '4k4/4+R4/5G3/9/9/9/9/9/4K4 w - 1';
const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const SIMPLE_A = '4k4/9/9/9/9/9/9/4P4/4K4 b - 1';
const SIMPLE_B = '4k4/9/9/9/9/9/9/3P5/4K4 b - 1';
const SIMPLE_C = '4k4/4p4/9/9/9/9/9/9/4K4 b - 1';
const SIMPLE_D = '4k4/9/9/9/9/9/9/9/4K4 b P 1';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kingpair-runop1-selection-'));
  temporaryRoots.push(root);
  return root;
}

function exclusionText(sfens: readonly string[]): string {
  return `${sfens.map(positionKeyFromSfen).sort().join('\n')}\n`;
}

function sourceRow(sfen: string, ply: number): string {
  return JSON.stringify({ sfen, ply, cp: 0, depth: 12, bestmove: '5i5h' });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

  it('can use all available candidates when an explicit target cannot retain the safety margin', () => {
    const counts = Array.from({ length: 4096 }, () => 0);
    counts[4095] = 100;
    expect(cutoffBucketForCounts(counts, 100, true)).toBe(4095);
    counts[4095] = 99;
    expect(() => cutoffBucketForCounts(counts, 100, true)).toThrow(
      'fewer than 100 eligible candidate rows',
    );
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

  it('strictly unions semantic exclusions before selection and records zero selected overlap', async () => {
    const root = temporaryRoot();
    const source = join(root, 'source.jsonl');
    const protocol = join(root, 'protocol.json');
    const legacy2m = join(root, 'legacy2m-position-ids.txt');
    const sealedHoldout = join(root, 'sealed-holdout-position-ids.txt');
    const outputRoot = join(root, 'selection');
    writeFileSync(source, `${[
      sourceRow(SIMPLE_A, 0),
      sourceRow(SIMPLE_B, 1),
      sourceRow(SIMPLE_C, 2),
      sourceRow(SIMPLE_D, 3),
    ].join('\n')}\n`);
    writeFileSync(protocol, '{"fixture":true}\n');
    writeFileSync(legacy2m, exclusionText([SIMPLE_A, SIMPLE_B]));
    writeFileSync(sealedHoldout, exclusionText([SIMPLE_B, SIMPLE_C]));

    const union = loadSemanticExclusionUnion(legacy2m, sealedHoldout);
    expect(union.identifiers).toHaveLength(3);
    expect(union.componentOverlap).toBe(1);

    const options = {
      source,
      protocol,
      outputRoot,
      target: 1,
      shardRows: 1,
      allowUnpinnedFixture: true,
      legacy2mExclusionPositionIds: legacy2m,
      sealedHoldoutExclusionPositionIds: sealedHoldout,
    };
    await buildSelection(options);
    const manifest = JSON.parse(readFileSync(join(outputRoot, 'manifest.json'), 'utf8'));
    const shard = readFileSync(join(outputRoot, 'selection-00000-of-00001.jsonl'), 'utf8')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(manifest).toMatchObject({
      schema: MANIFEST_SCHEMA,
      selected_unique_parents: 1,
      eligible_source_rows_after_semantic_exclusion: 1,
      priority_candidate_margin_satisfied: false,
      semantic_exclusions: {
        union: {
          unique_position_ids: 3,
          component_overlap_unique_position_ids: 1,
        },
        source_overlap: {
          excluded_rows: 3,
          excluded_unique_position_ids: 3,
          legacy2m_rows: 2,
          sealed_holdout_rows: 2,
        },
        selected_overlap: { legacy2m: 0, sealed_holdout: 0, union: 0 },
      },
    });
    expect(shard[1].position_id).toBe(positionKeyFromSfen(SIMPLE_D));
    await expect(buildSelection(options)).rejects.toThrow('output root already exists');
  });

  it('rejects noncanonical or duplicate semantic exclusion identifiers', () => {
    const root = temporaryRoot();
    const legacy2m = join(root, 'legacy2m-position-ids.txt');
    const sealedHoldout = join(root, 'sealed-holdout-position-ids.txt');
    writeFileSync(legacy2m, `${positionKeyFromSfen(SIMPLE_A)}\n${positionKeyFromSfen(SIMPLE_A)}\n`);
    writeFileSync(sealedHoldout, exclusionText([SIMPLE_B]));
    expect(() => loadSemanticExclusionUnion(legacy2m, sealedHoldout)).toThrow(
      'must be UTF-8-bytewise sorted and unique',
    );
  });
});
