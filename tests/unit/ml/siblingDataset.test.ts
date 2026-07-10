import { describe, expect, it } from 'vitest';

import {
  SIBLING_MANIFEST_SCHEMA,
  SIBLING_SCHEMA,
  SIBLING_SCHEMA_VERSION,
  assertSplitIsolation,
  assignGameSplit,
  buildSiblingGroup,
  canonicalPositionSfen,
  parentCpToChildCp,
  positionKeyFromSfen,
  splitSiblingDataset,
  validateParentGroups,
  type SiblingRecord,
} from '../../../ml/sibling-data';

const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const START_LATER = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 99';
const UNIQUE = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b P 12';
const CHILD_A = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2';
const CHILD_B = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2';
const CHILD_C = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w P 13';
const CHILD_D = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w P 13';

function group(
  gameId: string,
  parentId: string,
  parentSfen: string,
  cps: readonly [number, number] = [200, 50],
  children: readonly [string, string] = parentSfen === UNIQUE ? [CHILD_C, CHILD_D] : [CHILD_A, CHILD_B]
): SiblingRecord[] {
  return buildSiblingGroup(
    { game_id: gameId, parent_id: parentId, parent_sfen: parentSfen, parent_ply: 12 },
    [
      {
        move: '7g7f',
        child_sfen: children[0],
        sources: ['teacher'],
        teacher_parent_cp: cps[0],
        teacher_rank: 1,
      },
      {
        move: '2g2f',
        child_sfen: children[1],
        sources: ['teacher'],
        teacher_parent_cp: cps[1],
        teacher_rank: 2,
      },
    ]
  );
}

describe('sibling schema and candidate merging', () => {
  it('merges played + teacher provenance and converts parent cp to child cp once', () => {
    const records = buildSiblingGroup(
      {
        game_id: 'game-a',
        parent_id: 'game-a:12',
        parent_sfen: START,
        parent_ply: 12,
      },
      [
        { move: '7g7f', child_sfen: CHILD_A, sources: ['played'] },
        {
          move: '7g7f',
          child_sfen: CHILD_A,
          sources: ['teacher'],
          teacher_parent_cp: 220,
          teacher_rank: 1,
        },
        {
          move: '2g2f',
          child_sfen: CHILD_B,
          sources: ['teacher'],
          teacher_parent_cp: -70,
          teacher_rank: 2,
        },
      ]
    );

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      schema: SIBLING_SCHEMA,
      schema_version: SIBLING_SCHEMA_VERSION,
      game_id: 'game-a',
      parent_id: 'game-a:12',
      position_id: positionKeyFromSfen(START),
      parent_sfen: START,
      parent_ply: 12,
      ply: 13,
      move: '7g7f',
      sources: ['played', 'teacher'],
      sfen: CHILD_A,
      child_position_id: positionKeyFromSfen(CHILD_A),
      cp: -220,
      child_sfen: CHILD_A,
      teacher_child_cp: -220,
      teacher_parent_cp: 220,
      teacher_rank: 1,
      teacher_score_kind: 'cp',
    });
    expect(records[1]).toMatchObject({
      move: '2g2f',
      sfen: CHILD_B,
      cp: 70,
      child_sfen: CHILD_B,
      teacher_parent_cp: -70,
      teacher_child_cp: 70,
    });
    expect(parentCpToChildCp(0)).toBe(0);
    expect(() => parentCpToChildCp(Number.NaN)).toThrow(/finite/);
  });

  it('uses board/turn/hand as position identity while retaining the full SFEN', () => {
    expect(canonicalPositionSfen(START)).toBe(canonicalPositionSfen(START_LATER));
    expect(positionKeyFromSfen(START)).toBe(positionKeyFromSfen(START_LATER));
    expect(positionKeyFromSfen(START)).toBe(
      'sha256:8b7a6db5e99a9d4cbcbdd8c3d0ea78e0ba5ff73cf561276d5e1d133a86c412a8'
    );
    expect(positionKeyFromSfen(START)).not.toBe(positionKeyFromSfen(UNIQUE));
    expect(group('game-a', 'parent-a', START_LATER)[0].parent_sfen).toBe(START_LATER);
  });

  it('rejects conflicting or incomplete candidate groups', () => {
    expect(() =>
      buildSiblingGroup(
        {
          game_id: 'game-a',
          parent_id: 'parent-a',
          parent_sfen: START,
          parent_ply: 1,
        },
        [
          {
            move: '7g7f',
            child_sfen: CHILD_A,
            sources: ['played'],
            teacher_parent_cp: 10,
            teacher_rank: 1,
          },
          {
            move: '7g7f',
            child_sfen: CHILD_B,
            sources: ['teacher'],
            teacher_parent_cp: 10,
            teacher_rank: 1,
          },
        ]
      )
    ).toThrow(/conflicting child_sfen/);

    expect(() =>
      buildSiblingGroup(
        {
          game_id: 'game-a',
          parent_id: 'parent-a',
          parent_sfen: START,
          parent_ply: 1,
        },
        [
          {
            move: '7g7f',
            child_sfen: CHILD_A,
            sources: ['teacher'],
            teacher_parent_cp: 10,
            teacher_rank: 1,
          },
        ]
      )
    ).toThrow(/fewer than two siblings/);
  });

  it('validates contiguous ranks, group metadata, and child score orientation', () => {
    const records = group('game-a', 'parent-a', START);
    expect(validateParentGroups(records)).toEqual([
      {
        parent_id: 'parent-a',
        game_id: 'game-a',
        position_id: positionKeyFromSfen(START),
        records: 2,
        split: undefined,
      },
    ]);

    expect(() =>
      validateParentGroups([
        records[0],
        { ...records[1], teacher_rank: 3 },
      ])
    ).toThrow(/contiguous/);
    expect(() =>
      validateParentGroups([
        records[0],
        { ...records[1], teacher_child_cp: -999 },
      ])
    ).toThrow(/inconsistent child cp/);
    expect(() =>
      validateParentGroups([
        records[0],
        { ...records[1], game_id: 'other-game' },
      ])
    ).toThrow(/inconsistent group metadata/);
  });

  it('keeps mate scores outside cp and rejects rank/score contradictions', () => {
    const records = buildSiblingGroup(
      { game_id: 'game-a', parent_id: 'mate-parent', parent_sfen: START, parent_ply: 12 },
      [
        {
          move: '7g7f',
          child_sfen: CHILD_A,
          sources: ['teacher'],
          teacher_parent_cp: -35_281,
          teacher_rank: 1,
          teacher_score_kind: 'cp',
        },
        {
          move: '2g2f',
          child_sfen: CHILD_B,
          sources: ['teacher'],
          teacher_parent_cp: -999_996,
          teacher_rank: 2,
          teacher_score_kind: 'mate',
          teacher_mate: -4,
          teacher_mate_sign: -1,
        },
      ]
    );
    expect(records[1]).toMatchObject({
      teacher_score_kind: 'mate',
      teacher_mate: -4,
      teacher_mate_sign: -1,
      teacher_parent_cp: -999_996,
    });
    expect(() =>
      validateParentGroups([
        records[0],
        { ...records[1], teacher_parent_cp: -10 },
      ])
    ).toThrow(/inconsistent mate cp/);
    expect(() =>
      validateParentGroups([
        { ...records[0], teacher_parent_cp: -900_001 },
        records[1],
      ])
    ).toThrow(/reserved mate band/);
  });

  it('rejects broken canonical aliases, score signs, plies, and position hashes', () => {
    const records = group('game-a', 'parent-a', START);

    expect(() =>
      validateParentGroups([records[0], { ...records[1], sfen: CHILD_A }])
    ).toThrow(/child SFEN aliases/);
    expect(() =>
      validateParentGroups([records[0], { ...records[1], cp: -999 }])
    ).toThrow(/inconsistent child cp/);
    expect(() =>
      validateParentGroups([records[0], { ...records[1], teacher_parent_cp: 999 }])
    ).toThrow(/inconsistent child cp/);
    expect(() =>
      validateParentGroups(records.map((record) => ({ ...record, ply: record.ply + 1 })))
    ).toThrow(/parent\/child ply/);
    expect(() =>
      validateParentGroups(records.map((record) => ({ ...record, position_id: 'not-the-hash' })))
    ).toThrow(/position key does not match parent_sfen/);
    expect(() =>
      validateParentGroups(records.map((record) => ({ ...record, child_position_id: 'not-the-hash' })))
    ).toThrow(/invalid child position key/);
  });
});

describe('stable game-group split', () => {
  it('pins stable append-safe assignments', () => {
    const options = { seed: 'seed-7', valRatio: 0.25 };
    expect(assignGameSplit('game-a', options)).toBe('train');
    expect(assignGameSplit('game-b', options)).toBe('val');
    expect(assignGameSplit('game-c', options)).toBe('train');
    // Assignment depends on game_id only, so appending other games cannot move it.
    expect(assignGameSplit('game-a', options)).toBe('train');
  });

  it('keeps whole games disjoint and lets validation win position duplicates', () => {
    const records = [
      ...group('game-a', 'game-a:12', START),
      // Same semantic parent position, different move number and a val game.
      ...group('game-b', 'game-b:20', START_LATER),
      ...group('game-c', 'game-c:30', UNIQUE),
    ];
    const result = splitSiblingDataset(records, { seed: 'seed-7', valRatio: 0.25 });

    expect(new Set(result.train.map((record) => record.game_id))).toEqual(new Set(['game-c']));
    expect(new Set(result.val.map((record) => record.game_id))).toEqual(new Set(['game-b']));
    expect(result.train.map((record) => record.parent_id)).not.toContain('game-a:12');
    expect(result.manifest.stats).toEqual({
      input_records: 6,
      output_records: 4,
      input_parents: 3,
      output_parents: 2,
      input_games: 3,
      train_records: 2,
      val_records: 2,
      train_parents: 1,
      val_parents: 1,
      train_games: 1,
      val_games: 1,
      val_position_priority_dropped_records: 2,
      val_position_priority_dropped_parents: 1,
      val_child_position_priority_dropped_records: 0,
      val_child_position_priority_dropped_parents: 0,
      game_overlap: 0,
      position_overlap: 0,
      child_position_overlap: 0,
    });
    expect(result.manifest).toMatchObject({
      schema: SIBLING_MANIFEST_SCHEMA,
      record_schema: SIBLING_SCHEMA,
      schema_version: SIBLING_SCHEMA_VERSION,
      split_seed: 'seed-7',
      val_ratio: 0.25,
    });
    expect(result.manifest.train_game_ids_sha256).toBe(
      '1af73cce2262ed2fdd22d6e5ff200ad37c1bae78b2ef9e1a161be82df6bd01ef'
    );
    expect(result.manifest.val_game_ids_sha256).toBe(
      'd9037344d616add3749765e4209e7352783b9d3f8db4e9cdd24935947d4b9616'
    );
    expect(() => assertSplitIsolation(result.train, result.val)).not.toThrow();

    // Input ordering must not affect rows or manifest.
    const reversed = splitSiblingDataset([...records].reverse(), {
      seed: 'seed-7',
      valRatio: 0.25,
    });
    expect(reversed).toEqual(result);
  });

  it('drops a whole train parent when one model-input child leaks into validation', () => {
    const records = [
      ...group('game-b', 'val-parent', START),
      ...group('game-c', 'train-parent', UNIQUE, [200, 50], [CHILD_A, CHILD_B]),
    ];
    const result = splitSiblingDataset(records, { seed: 'seed-7', valRatio: 0.25 });

    expect(result.train).toEqual([]);
    expect(new Set(result.val.map((record) => record.game_id))).toEqual(new Set(['game-b']));
    expect(result.manifest.stats.val_child_position_priority_dropped_parents).toBe(1);
    expect(result.manifest.stats.val_child_position_priority_dropped_records).toBe(2);
    expect(result.manifest.stats.child_position_overlap).toBe(0);
  });

  it('detects explicit game and position leakage', () => {
    const train = group('game-a', 'train-parent', START).map((record) => ({
      ...record,
      split: 'train' as const,
    }));
    const leakedGame = group('game-a', 'val-parent', UNIQUE).map((record) => ({
      ...record,
      split: 'val' as const,
    }));
    expect(() => assertSplitIsolation(train, leakedGame)).toThrow(/game leakage/);

    const leakedPosition = group('game-b', 'val-parent', START_LATER).map((record) => ({
      ...record,
      split: 'val' as const,
    }));
    expect(() => assertSplitIsolation(train, leakedPosition)).toThrow(/position leakage/);

    const leakedChildPosition = group(
      'game-b',
      'child-val-parent',
      UNIQUE,
      [200, 50],
      [CHILD_A, CHILD_B]
    ).map((record) => ({
      ...record,
      split: 'val' as const,
    }));
    expect(() => assertSplitIsolation(train, leakedChildPosition)).toThrow(/child position leakage/);
  });

  it('rejects invalid split settings instead of falling back to row randomness', () => {
    expect(() => assignGameSplit('', { valRatio: 0.2 })).toThrow(/game_id/);
    expect(() => assignGameSplit('game-a', { valRatio: 0 })).toThrow(/between 0 and 1/);
    expect(() => assignGameSplit('game-a', { valRatio: 1 })).toThrow(/between 0 and 1/);
  });
});
