import { describe, expect, it } from 'vitest';

import {
  OUTPUT_PARENT_SCHEMA,
  SELECTION_HEADER_SCHEMA,
  SELECTION_ROW_SCHEMA,
  assignedShardIndices,
  buildExactParentLabel,
  parseSelectionShard,
  type SelectionRow,
} from '../../../ml/generate_kingpair_aoba_teacher_shards';
import { positionKeyFromSfen } from '../../../ml/sibling-data';

const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

function row(): SelectionRow {
  return {
    schema: SELECTION_ROW_SCHEMA,
    global_index: 7,
    domain: 'fixture',
    split: 'train',
    game_id: 'fixture-game',
    ply: 0,
    parent_sfen: START,
    position_id: positionKeyFromSfen(START),
    legal_moves: 30,
    priority_sha256: '1'.repeat(64),
  };
}

describe('KingPair Aoba compact teacher shards', () => {
  it('partitions every shard exactly once', () => {
    const assignments = Array.from({ length: 8 }, (_, worker) => assignedShardIndices(257, worker, 8)).flat();
    expect([...assignments].sort((a, b) => a - b)).toEqual(Array.from({ length: 257 }, (_, index) => index));
    expect(new Set(assignments).size).toBe(257);
  });

  it('validates selection identity and uniqueness', () => {
    const value = row();
    const text = [
      JSON.stringify({
        schema: SELECTION_HEADER_SCHEMA,
        shard_index: 0,
        shard_count: 1,
        rows: 1,
        selection_contract_sha256: '0'.repeat(64),
      }),
      JSON.stringify(value),
    ].join('\n') + '\n';
    expect(parseSelectionShard(text)).toEqual({ header: expect.objectContaining({ rows: 1 }), rows: [value] });
    expect(() => parseSelectionShard(text.replace(value.position_id, `sha256:${'f'.repeat(64)}`))).toThrow(
      'position identity mismatch',
    );
  });

  it('exports child-side CP with the required sign inversion', () => {
    const selection = row();
    const label = buildExactParentLabel(selection, ['7g7f', '2g2f'], {
      depth: 12,
      bestmove: '7g7f',
      observedNodes: 1234,
      lines: [
        { move: '7g7f', cp: 80, multipv: 1, scoreKind: 'cp', depth: 12, pv: ['7g7f'], nodes: 700 },
        { move: '2g2f', cp: 20, multipv: 2, scoreKind: 'cp', depth: 12, pv: ['2g2f'], nodes: 534 },
      ],
    });
    expect(label.schema).toBe(OUTPUT_PARENT_SCHEMA);
    const moves = label.moves as Array<Record<string, unknown>>;
    expect(moves[0]).toMatchObject({ teacher_parent_cp: 80, teacher_child_cp: -80, teacher_rank: 1 });
    expect(moves[1]).toMatchObject({ teacher_parent_cp: 20, teacher_child_cp: -20, teacher_rank: 2 });
    expect(moves[0].child_position_id).toBe(positionKeyFromSfen(moves[0].child_sfen as string));
  });

  it('rejects incomplete or non-cp snapshots', () => {
    const selection = row();
    expect(() => buildExactParentLabel(selection, ['7g7f'], {
      depth: 11,
      bestmove: '7g7f',
      observedNodes: 10,
      lines: [{ move: '7g7f', cp: 1, multipv: 1, scoreKind: 'cp', depth: 11, pv: [], nodes: 10 }],
    })).toThrow('incomplete fixed-depth');
    expect(() => buildExactParentLabel(selection, ['7g7f'], {
      depth: 12,
      bestmove: '7g7f',
      observedNodes: 10,
      lines: [{ move: '7g7f', cp: 1, multipv: 1, scoreKind: 'mate', depth: 12, pv: [], nodes: 10 }],
    })).toThrow('teacher line contract');
  });
});
