import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  SIBLING_TEACHER_COMPARISON_SCHEMA,
  compareSiblingTeacherWorkFiles,
  main,
} from '../../../ml/compare-sibling-teachers';
import { buildSiblingGroup, positionKeyFromSfen, type SiblingRecord } from '../../../ml/sibling-data';
import { childSfenAfterUsi } from '../../../ml/shogi-sfen';
import { mateToCp } from '../../../ml/usi-multipv';

const WORK_SCHEMA = 'shogi-sibling-teacher-work-v2';
const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const SOURCE_SHA = 'c'.repeat(64);
const SELECTED_SHA = 'd'.repeat(64);
const LABEL_POLICY =
  'initial-multipv-plus-played-independent-single-move-rescore-final-mate-v6';
const INDEPENDENT_EXACT_RESCORE_MODE = 'independent-single-move';
const BASELINE_REVISION = 'e'.repeat(40);
const CANDIDATE_REVISION = 'f'.repeat(40);

interface ScoreFixture {
  move: string;
  cp: number;
  scoreKind?: 'cp' | 'mate';
  mate?: number;
  mateSign?: 1 | -1;
}

interface ParentWorkRow {
  schema: typeof WORK_SCHEMA;
  kind: 'parent';
  run_fingerprint: string;
  payload_sha256: string;
  parent_id: string;
  candidate_set_sha256: string;
  candidate_moves: string[];
  initial_search: Record<string, unknown>;
  exact_search: Record<string, unknown>;
  records: SiblingRecord[];
}

function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('cannot canonicalize non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  throw new Error(`cannot canonicalize ${typeof value}`);
}

function sealWorkEntry<T extends object>(value: T): T & { payload_sha256: string } {
  const sealed = { ...value, payload_sha256: '' } as T & { payload_sha256: string };
  const payload = { ...sealed } as Record<string, unknown>;
  delete payload.payload_sha256;
  sealed.payload_sha256 = sha256(canonicalJson(payload));
  return sealed;
}

function resealParsedEntry(value: Record<string, unknown>): void {
  value.payload_sha256 = sealWorkEntry(value).payload_sha256;
}

function parentRow(
  fingerprint: string,
  parentId: string,
  playedMove: string,
  scoresInRankOrder: readonly ScoreFixture[],
  depth: number,
  proposalMovesInput?: readonly string[]
): ParentWorkRow {
  const rankedMoves = scoresInRankOrder.map((score) => score.move);
  const candidateMoves = [...rankedMoves].sort(compareBytewise);
  const proposalMoves = [...(proposalMovesInput ?? rankedMoves)];
  const proposalMoveSet = new Set(proposalMoves);
  const searchScores = scoresInRankOrder.map((score) => ({
    move: score.move,
    cp: score.cp,
    score_kind: score.scoreKind ?? 'cp',
    ...(score.scoreKind === 'mate'
      ? { mate: score.mate as number, mate_sign: score.mateSign as 1 | -1 }
      : {}),
  }));
  const scoreByMove = new Map(searchScores.map((score) => [score.move, score]));
  const records = buildSiblingGroup(
    {
      game_id: `game-${parentId}`,
      parent_id: parentId,
      position_id: positionKeyFromSfen(START),
      parent_sfen: START,
      parent_ply: 0,
    },
    scoresInRankOrder.map((score, index) => ({
      move: score.move,
      child_sfen: childSfenAfterUsi(START, score.move),
      sources: [
        ...(score.move === playedMove ? ['played'] : []),
        ...(proposalMoveSet.has(score.move) ? ['teacher'] : []),
      ],
      teacher_parent_cp: score.cp,
      teacher_rank: index + 1,
      teacher_score_kind: score.scoreKind,
      teacher_mate: score.mate,
      teacher_mate_sign: score.mateSign,
    }))
  );
  return {
    schema: WORK_SCHEMA,
    kind: 'parent',
    run_fingerprint: fingerprint,
    payload_sha256: '',
    parent_id: parentId,
    candidate_set_sha256: sha256(`candidate-set-v1\0${candidateMoves.join('\n')}`),
    candidate_moves: candidateMoves,
    initial_search: {
      requested_multipv: proposalMoves.length,
      requested_limit: { depth },
      depth,
      observed_nodes: 100,
      bestmove: proposalMoves[0],
      moves: proposalMoves,
      scores: proposalMoves.map((move) => scoreByMove.get(move)),
    },
    exact_search: {
      mode: INDEPENDENT_EXACT_RESCORE_MODE,
      candidate_count: candidateMoves.length,
      synthesized_rank1_move: rankedMoves[0],
      moves: rankedMoves,
      scores: searchScores,
      searches: candidateMoves.map((move) => {
        const score = scoreByMove.get(move) as typeof searchScores[number];
        return {
          requested_multipv: 1,
          requested_limit: { depth },
          depth,
          observed_nodes: 50,
          bestmove: move,
          moves: [move],
          scores: [score],
        };
      }),
      total_observed_nodes: candidateMoves.length * 50,
    },
    records,
  };
}

function skipRow(fingerprint: string, parentId: string): Record<string, unknown> {
  return {
    schema: WORK_SCHEMA,
    kind: 'skip',
    run_fingerprint: fingerprint,
    parent_id: parentId,
    reason: 'fewer-than-two-legal-moves',
    legal_moves: 1,
  };
}

function workText(
  fingerprint: string,
  entries: readonly object[],
  sourceSha = SOURCE_SHA,
  labelPolicy = LABEL_POLICY,
  pipelineRevision = BASELINE_REVISION
): string {
  const header = {
    schema: WORK_SCHEMA,
    kind: 'header',
    run_fingerprint: fingerprint,
    source_raw_sha256: sourceSha,
    selected_parent_ids_sha256: SELECTED_SHA,
    label_policy: labelPolicy,
    pipeline: {
      source_revision: pipelineRevision,
      tracked_tree_clean: true,
    },
  };
  return `${[header, ...entries.map((entry) => sealWorkEntry(entry))]
    .map((row) => JSON.stringify(row))
    .join('\n')}\n`;
}

async function writeFixturePair(): Promise<{
  root: string;
  baseline: string;
  candidate: string;
  baselineText: string;
  candidateText: string;
}> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teacher-compare-'));
  const baseline = path.join(root, 'baseline.jsonl');
  const candidate = path.join(root, 'candidate.jsonl');
  const baselineFingerprint = 'a'.repeat(64);
  const candidateFingerprint = 'b'.repeat(64);
  const baselineText = workText(baselineFingerprint, [
    parentRow(
      baselineFingerprint,
      'parent-candidate-change',
      '7g7f',
      [
        { move: '2g2f', cp: 100 },
        { move: '7g7f', cp: -20 },
        { move: '8g8f', cp: -20 },
      ],
      4,
      ['2g2f', '8g8f']
    ),
    parentRow(
      baselineFingerprint,
      'parent-tied-top',
      '4g4f',
      [
        { move: '3g3f', cp: 50 },
        { move: '4g4f', cp: 50 },
        { move: '5g5f', cp: 0 },
      ],
      4
    ),
    skipRow(baselineFingerprint, 'skip-shared'),
    skipRow(baselineFingerprint, 'skip-baseline-only'),
  ]);
  const candidateText = workText(candidateFingerprint, [
    parentRow(
      candidateFingerprint,
      'parent-candidate-change',
      '7g7f',
      [
        { move: '7g7f', cp: 81 },
        { move: '2g2f', cp: 80 },
        { move: '9g9f', cp: 10 },
      ],
      8
    ),
    // Equal-cp moves retain the mandatory UTF-8 bytewise tie order.
    parentRow(
      candidateFingerprint,
      'parent-tied-top',
      '4g4f',
      [
        { move: '3g3f', cp: 50 },
        { move: '4g4f', cp: 50 },
        { move: '5g5f', cp: 0 },
      ],
      8
    ),
    skipRow(candidateFingerprint, 'skip-shared'),
  ], SOURCE_SHA, LABEL_POLICY, CANDIDATE_REVISION);
  await Promise.all([
    fs.promises.writeFile(baseline, baselineText),
    fs.promises.writeFile(candidate, candidateText),
  ]);
  return { root, baseline, candidate, baselineText, candidateText };
}

describe('sibling teacher comparison', () => {
  it('reports candidate differences, ties, sign/rank changes, and pair-order stability', async () => {
    const fixture = await writeFixturePair();
    const report = await compareSiblingTeacherWorkFiles({
      baseline: fixture.baseline,
      candidate: fixture.candidate,
      minTeacherDeltaCp: 20,
    });

    expect(report.schema).toBe(SIBLING_TEACHER_COMPARISON_SCHEMA);
    expect(report.scope).toMatch(/does not measure playing strength/);
    expect(report.files.baseline.sha256).toBe(sha256(fixture.baselineText));
    expect(report.files.candidate.sha256).toBe(sha256(fixture.candidateText));
    expect(report.files.baseline.header.label_policy).toBe(LABEL_POLICY);
    expect(report.files.baseline.header.pipeline.source_revision).toBe(BASELINE_REVISION);
    expect(report.files.candidate.header.pipeline.source_revision).toBe(CANDIDATE_REVISION);
    expect(report.compatibility.label_policy_equal).toBe(true);
    expect(report.compatibility.pipeline_source_revision_equal).toBe(false);
    expect(report.files.baseline.counts).toMatchObject({
      entries: 4,
      completed_parents: 2,
      skipped_parents: 2,
      sibling_records: 6,
    });
    expect(report.files.baseline.score_metadata).toEqual({
      cp_records: 6,
      mate_records: 0,
      positive_mate_records: 0,
      negative_mate_records: 0,
    });
    expect(report.files.baseline.search).toEqual({
      proposal: {
        searches: 2,
        requested_depth_per_search: { count: 2, sum: 8, mean: 4, min: 4, max: 4 },
        requested_nodes_per_search: { count: 0, sum: 0, mean: null, min: null, max: null },
        actual_depth_per_search: { count: 2, sum: 8, mean: 4, min: 4, max: 4 },
        observed_nodes_per_parent: { count: 2, sum: 200, mean: 100, min: 100, max: 100 },
        distinct_requested_depths: [4],
        distinct_actual_depths: [4],
      },
      independent_single: {
        searches: 6,
        requested_depth_per_search: { count: 6, sum: 24, mean: 4, min: 4, max: 4 },
        requested_nodes_per_search: { count: 0, sum: 0, mean: null, min: null, max: null },
        actual_depth_per_search: { count: 6, sum: 24, mean: 4, min: 4, max: 4 },
        observed_nodes_per_search: { count: 6, sum: 300, mean: 50, min: 50, max: 50 },
        total_observed_nodes_per_parent: {
          count: 2,
          sum: 300,
          mean: 150,
          min: 150,
          max: 150,
        },
        distinct_requested_depths: [4],
        distinct_actual_depths: [4],
        early_final_mate: {
          searches: 0,
          requested_depth_per_search: { count: 0, sum: 0, mean: null, min: null, max: null },
          actual_depth_per_search: { count: 0, sum: 0, mean: null, min: null, max: null },
          depth_shortfall_per_search: { count: 0, sum: 0, mean: null, min: null, max: null },
          distinct_actual_depths: [],
        },
      },
      parent_total_observed_nodes: {
        count: 2,
        sum: 500,
        mean: 250,
        min: 250,
        max: 250,
      },
    });
    expect(report.parent_coverage).toMatchObject({
      entry_intersection: 3,
      entry_union: 4,
      baseline_only_entries: 1,
      candidate_only_entries: 0,
      completed_parent_intersection: 2,
      completed_parent_union: 2,
    });
    expect(report.skips).toEqual({
      baseline: 2,
      candidate: 1,
      shared: 1,
      baseline_skip_candidate_completed: 0,
      candidate_skip_baseline_completed: 0,
      baseline_skip_candidate_missing: 1,
      candidate_skip_baseline_missing: 0,
    });

    // Aggregate rank 1 is synthesized from independently searched scores.
    expect(report.exact_search.synthesized_rank1_move_agreement).toEqual({ count: 1, rate: 0.5 });
    expect(report.exact_search.top1_set_exact_agreement).toEqual({ count: 1, rate: 0.5 });
    expect(report.exact_search.top1_set_overlap).toEqual({ count: 1, rate: 0.5 });
    expect(report.exact_search.baseline_synthesized_rank1_move_in_candidate_top1.count).toBe(1);
    expect(report.exact_search.candidate_synthesized_rank1_move_in_baseline_top1.count).toBe(1);
    expect(report.exact_search.candidate_tied_top1_parents).toBe(1);
    expect(JSON.stringify(report.exact_search)).not.toContain('bestmove');

    expect(report.candidate_sets).toMatchObject({
      baseline_candidates: 6,
      candidate_candidates: 6,
      common_candidates: 5,
      union_candidates: 7,
      micro_jaccard: 5 / 7,
      parent_jaccard: { count: 2, sum: 1.5, mean: 0.75, min: 0.5, max: 1 },
    });
    expect(report.played_moves).toMatchObject({
      baseline_top1: 1,
      candidate_top1: 2,
      entered_top1: 1,
      left_top1: 0,
      remained_top1: 1,
      tie_aware_score_rank_delta: {
        count: 2,
        sum: -1,
        mean: -0.5,
        min: -1,
        max: 0,
        candidate_lower: 1,
        unchanged: 1,
      },
      synthesized_teacher_rank_delta: { sum: -1, candidate_lower: 1, unchanged: 1 },
      cp_delta: { sum: 101, mean: 50.5, min: 0, max: 101 },
      cp_sign_unchanged: 1,
      cp_sign_candidate_higher: 1,
    });
    expect(report.played_moves.cp_sign_transitions).toMatchObject({
      negative_to_positive: 1,
      positive_to_positive: 1,
    });
    expect(report.common_move_cp_deltas).toEqual({
      count: 5,
      sum: 81,
      mean: 16.2,
      min: -20,
      max: 101,
      mean_absolute: 24.2,
      unchanged: 3,
      candidate_lower: 1,
      candidate_higher: 1,
    });
    expect(report.common_move_both_cp_deltas).toEqual({
      count: 5,
      sum: 81,
      mean: 16.2,
      min: -20,
      max: 101,
      mean_absolute: 24.2,
      unchanged: 3,
      candidate_lower: 1,
      candidate_higher: 1,
      absolute_p50: 0,
      absolute_p90: 68.60000000000001,
      absolute_p95: 84.79999999999998,
      absolute_trimmed_mean_5pct: 24.2,
    });
    expect(report.common_move_score_metadata).toEqual({
      common_moves: 5,
      score_kind_agreement: { count: 5, rate: 1 },
      both_cp: 5,
      both_mate: 0,
      cp_to_mate: 0,
      mate_to_cp: 0,
      both_mate_same_sign: 0,
      both_mate_sign_changed: 0,
      exact_mate_metadata_agreement: { count: 0, rate: null },
    });
    expect(report.pair_order).toEqual({
      min_teacher_delta_cp: 20,
      parents_with_common_pairs: 2,
      common_move_pairs: 4,
      relation_agreement: { count: 3, rate: 0.75 },
      strict_agreement: 2,
      both_ties: 1,
      reversals: 0,
      baseline_decisive_candidate_tie: 1,
      baseline_tie_candidate_decisive: 0,
      both_decisive_pairs: 2,
      both_decisive_agreement: { count: 2, rate: 1 },
      both_decisive_reversal_rate: { count: 0, rate: 0 },
      all_pair_reversal_rate: { count: 0, rate: 0 },
      baseline_decisive_pairs: 3,
      baseline_decisive_retention: { count: 2, rate: 2 / 3 },
    });
  });

  it('reports consistent node-limited proposal and independent searches without depth conflation', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teacher-node-compare-'));
    const baseline = path.join(root, 'baseline.jsonl');
    const candidate = path.join(root, 'candidate.jsonl');
    const baselineFingerprint = '5'.repeat(64);
    const candidateFingerprint = '6'.repeat(64);
    const makeNodeRow = (fingerprint: string, nodes: number): ParentWorkRow => {
      const row = parentRow(
        fingerprint,
        'parent-nodes',
        '7g7f',
        [
          { move: '2g2f', cp: 100 },
          { move: '7g7f', cp: 20 },
        ],
        9
      );
      row.initial_search.requested_limit = { nodes };
      const exact = row.exact_search as { searches: Array<{ requested_limit: { nodes: number } }> };
      for (const search of exact.searches) search.requested_limit = { nodes };
      return row;
    };
    await Promise.all([
      fs.promises.writeFile(
        baseline,
        workText(baselineFingerprint, [makeNodeRow(baselineFingerprint, 1_000)])
      ),
      fs.promises.writeFile(
        candidate,
        workText(candidateFingerprint, [makeNodeRow(candidateFingerprint, 2_000)])
      ),
    ]);

    const report = await compareSiblingTeacherWorkFiles({ baseline, candidate });
    expect(report.files.baseline.search).toMatchObject({
      proposal: {
        requested_depth_per_search: { count: 0 },
        requested_nodes_per_search: { count: 1, sum: 1_000 },
        actual_depth_per_search: { count: 1, sum: 9 },
      },
      independent_single: {
        searches: 2,
        requested_depth_per_search: { count: 0 },
        requested_nodes_per_search: { count: 2, sum: 2_000 },
        actual_depth_per_search: { count: 2, sum: 18 },
        early_final_mate: { searches: 0 },
      },
    });
  });

  it('rejects corrupt duplicate moves instead of producing partial statistics', async () => {
    const fixture = await writeFixturePair();
    const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
    const row = lines[1] as ParentWorkRow;
    row.records[2] = { ...row.records[0], teacher_rank: 3 };
    resealParsedEntry(lines[1]);
    await fs.promises.writeFile(fixture.baseline, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/duplicate move/);
  });

  it('rejects resealed corrupt v4 independent-search metadata', async () => {
    type ExactFixture = {
      mode: string;
      candidate_count: number;
      moves: string[];
      scores: Array<Record<string, unknown>>;
      searches: Array<{
        bestmove: string;
        depth: number;
        requested_limit?: { depth: number } | { nodes: number };
        scores: Array<Record<string, unknown>>;
      }>;
      total_observed_nodes: number;
    };
    const cases: Array<{
      name: string;
      mutate: (row: ParentWorkRow, exact: ExactFixture) => void;
      error: RegExp;
    }> = [
      {
        name: 'mode',
        mutate: (_row, exact) => { exact.mode = 'joint-searchmoves'; },
        error: /mode must be independent-single-move/,
      },
      {
        name: 'missing proposal requested limit',
        mutate: (row) => { delete row.initial_search.requested_limit; },
        error: /requested_limit must be an object/,
      },
      {
        name: 'proposal before requested depth',
        mutate: (row) => { row.initial_search.depth = 3; },
        error: /ended before requested depth without a terminal mate/,
      },
      {
        name: 'proposal beyond requested depth',
        mutate: (row) => { row.initial_search.depth = 5; },
        error: /completed beyond its requested depth/,
      },
      {
        name: 'independent cp before requested depth',
        mutate: (_row, exact) => { exact.searches[0].depth = 3; },
        error: /ended before requested depth without a terminal mate/,
      },
      {
        name: 'independent beyond requested depth',
        mutate: (_row, exact) => { exact.searches[0].depth = 5; },
        error: /completed beyond its requested depth/,
      },
      {
        name: 'mixed requested limits',
        mutate: (_row, exact) => { exact.searches[0].requested_limit = { nodes: 1_000 }; },
        error: /requested_limit differs from the proposal\/run limit/,
      },
      {
        name: 'candidate count',
        mutate: (_row, exact) => { exact.candidate_count++; },
        error: /candidate_count does not match candidate_moves/,
      },
      {
        name: 'bytewise tie rank',
        mutate: (_row, exact) => {
          [exact.moves[1], exact.moves[2]] = [exact.moves[2], exact.moves[1]];
          [exact.scores[1], exact.scores[2]] = [exact.scores[2], exact.scores[1]];
        },
        error: /not ranked by cp then UTF-8 move bytes/,
      },
      {
        name: 'canonical execution order',
        mutate: (_row, exact) => {
          [exact.searches[0], exact.searches[1]] = [exact.searches[1], exact.searches[0]];
        },
        error: /canonical candidate order/,
      },
      {
        name: 'single-search bestmove',
        mutate: (_row, exact) => { exact.searches[0].bestmove = exact.moves[1]; },
        error: /bestmove does not match PV1|canonical candidate order/,
      },
      {
        name: 'single-search score',
        mutate: (_row, exact) => {
          exact.searches[0].scores[0].cp = (exact.searches[0].scores[0].cp as number) + 1;
        },
        error: /disagrees with its single search/,
      },
      {
        name: 'total nodes',
        mutate: (_row, exact) => { exact.total_observed_nodes++; },
        error: /total_observed_nodes does not equal the single-search sum/,
      },
      {
        name: 'candidate order',
        mutate: (row) => {
          [row.candidate_moves[0], row.candidate_moves[1]] = [
            row.candidate_moves[1],
            row.candidate_moves[0],
          ];
        },
        error: /candidate_moves are not in canonical UTF-8 bytewise order/,
      },
      {
        name: 'proposal plus played union',
        mutate: (row) => {
          const proposal = row.initial_search as {
            requested_multipv: number;
            moves: string[];
            scores: Array<Record<string, unknown>>;
          };
          proposal.requested_multipv--;
          proposal.moves.pop();
          proposal.scores.pop();
        },
        error: /candidate_moves are not proposal moves plus the played move/,
      },
    ];

    for (const testCase of cases) {
      const fixture = await writeFixturePair();
      const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
      const row = lines[1] as ParentWorkRow;
      testCase.mutate(row, row.exact_search as unknown as ExactFixture);
      resealParsedEntry(lines[1]);
      await fs.promises.writeFile(
        fixture.baseline,
        `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
      );
      await expect(
        compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate }),
        testCase.name
      ).rejects.toThrow(testCase.error);
    }
  });

  it('rejects legacy joint work-v1 files', async () => {
    const fixture = await writeFixturePair();
    await fs.promises.writeFile(
      fixture.baseline,
      fixture.baselineText.replaceAll(WORK_SCHEMA, 'shogi-sibling-teacher-work-v1')
    );

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/is not a shogi-sibling-teacher-work-v2 header/);
  });

  it('requires a clean, full pipeline revision while allowing revisions to differ', async () => {
    const mutations: Array<{
      mutate: (header: Record<string, unknown>) => void;
      error: RegExp;
    }> = [
      {
        mutate: (header) => { delete header.pipeline; },
        error: /pipeline must be an object/,
      },
      {
        mutate: (header) => {
          (header.pipeline as Record<string, unknown>).source_revision = 'ABC';
        },
        error: /pipeline\.source_revision/,
      },
      {
        mutate: (header) => {
          (header.pipeline as Record<string, unknown>).tracked_tree_clean = 1;
        },
        error: /pipeline\.tracked_tree_clean must be exactly true/,
      },
    ];
    for (const testCase of mutations) {
      const fixture = await writeFixturePair();
      const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
      testCase.mutate(lines[0]);
      await fs.promises.writeFile(
        fixture.baseline,
        `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
      );
      await expect(
        compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
      ).rejects.toThrow(testCase.error);
    }
  });

  it('detects valid-JSON CP and SFEN edits through the canonical payload checksum', async () => {
    const mutations: Array<(row: ParentWorkRow) => void> = [
      (row) => {
        row.records[0].teacher_parent_cp += 1;
      },
      (row) => {
        row.records[0].child_sfen = childSfenAfterUsi(START, '9g9f');
      },
    ];
    for (const mutate of mutations) {
      const fixture = await writeFixturePair();
      const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
      mutate(lines[1] as ParentWorkRow);
      // Deliberately retain the original seal: the comparator must notice the
      // valid JSON payload was altered before trusting any derived statistics.
      await fs.promises.writeFile(
        fixture.baseline,
        `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
      );
      await expect(
        compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
      ).rejects.toThrow(/payload checksum mismatch/);
    }
  });

  it('rejects resealed checkpoint strings with surrounding whitespace', async () => {
    const mutations: Array<(row: ParentWorkRow) => void> = [
      (row) => { row.parent_id = ` ${row.parent_id}`; },
      (row) => { row.candidate_moves[0] = `${row.candidate_moves[0]} `; },
    ];
    for (const mutate of mutations) {
      const fixture = await writeFixturePair();
      const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
      mutate(lines[1] as ParentWorkRow);
      resealParsedEntry(lines[1]);
      await fs.promises.writeFile(
        fixture.baseline,
        `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
      );

      await expect(
        compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
      ).rejects.toThrow(/must not have leading or trailing whitespace/);
    }
  });

  it('re-derives child SFEN after a correctly resealed but semantically corrupt edit', async () => {
    const fixture = await writeFixturePair();
    const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
    const row = lines[1] as ParentWorkRow;
    const record = row.records[0];
    const wrongButValidChild = childSfenAfterUsi(START, '9g9f');
    record.sfen = wrongButValidChild;
    record.child_sfen = wrongButValidChild;
    record.child_position_id = positionKeyFromSfen(wrongButValidChild);
    resealParsedEntry(lines[1]);
    await fs.promises.writeFile(
      fixture.baseline,
      `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
    );

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/child_sfen does not match parent_sfen \+ move/);
  });

  it('requires a canonical payload checksum on skip entries too', async () => {
    const fixture = await writeFixturePair();
    const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
    delete lines[3].payload_sha256;
    await fs.promises.writeFile(
      fixture.baseline,
      `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`
    );

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/payload_sha256 must not be empty/);
  });

  it('rejects work files produced from incompatible raw parent selections', async () => {
    const fixture = await writeFixturePair();
    const incompatible = fixture.candidateText.replace(SOURCE_SHA, 'e'.repeat(64));
    await fs.promises.writeFile(fixture.candidate, incompatible);

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/source_raw_sha256 differs/);
  });

  it('rejects work files produced with a different label policy', async () => {
    const fixture = await writeFixturePair();
    const incompatible = fixture.candidateText.replace(LABEL_POLICY, 'different-label-policy-v2');
    await fs.promises.writeFile(fixture.candidate, incompatible);

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/unsupported label_policy/);
  });

  it('rejects a synthesized rank-1 move that differs from the ranked scores', async () => {
    const fixture = await writeFixturePair();
    const lines = fixture.candidateText.trim().split('\n').map((line) => JSON.parse(line));
    const row = lines[1] as ParentWorkRow;
    row.exact_search.synthesized_rank1_move = '9g9f';
    resealParsedEntry(lines[1]);
    await fs.promises.writeFile(fixture.candidate, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/synthesized_rank1_move does not match ranked move 1/);
  });

  it('does not allow a terminal mate to shorten the proposal search', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teacher-proposal-mate-'));
    const baseline = path.join(root, 'baseline.jsonl');
    const candidate = path.join(root, 'candidate.jsonl');
    const baselineFingerprint = '3'.repeat(64);
    const candidateFingerprint = '4'.repeat(64);
    const baselineRow = parentRow(
      baselineFingerprint,
      'parent-proposal-mate',
      '4g4f',
      [
        { move: '3g3f', cp: mateToCp(3, 1), scoreKind: 'mate', mate: 3, mateSign: 1 },
        { move: '4g4f', cp: mateToCp(-5, -1), scoreKind: 'mate', mate: -5, mateSign: -1 },
      ],
      6
    );
    baselineRow.initial_search.depth = 2;
    await Promise.all([
      fs.promises.writeFile(baseline, workText(baselineFingerprint, [baselineRow])),
      fs.promises.writeFile(
        candidate,
        workText(candidateFingerprint, [
          parentRow(
            candidateFingerprint,
            'parent-proposal-mate',
            '4g4f',
            [
              { move: '3g3f', cp: mateToCp(3, 1), scoreKind: 'mate', mate: 3, mateSign: 1 },
              { move: '4g4f', cp: mateToCp(-5, -1), scoreKind: 'mate', mate: -5, mateSign: -1 },
            ],
            6
          ),
        ])
      ),
    ]);

    await expect(
      compareSiblingTeacherWorkFiles({ baseline, candidate })
    ).rejects.toThrow(/ended before requested depth without a terminal mate/);
  });

  it('validates mate-band metadata and compares equal mate scores as top-set ties', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teacher-mate-compare-'));
    const baseline = path.join(root, 'baseline.jsonl');
    const candidate = path.join(root, 'candidate.jsonl');
    const baselineFingerprint = '1'.repeat(64);
    const candidateFingerprint = '2'.repeat(64);
    const baselineMateRow = parentRow(
      baselineFingerprint,
      'parent-mates',
      '4g4f',
      [
        { move: '3g3f', cp: mateToCp(3, 1), scoreKind: 'mate', mate: 3, mateSign: 1 },
        { move: '4g4f', cp: mateToCp(3, 1), scoreKind: 'mate', mate: 3, mateSign: 1 },
        { move: '5g5f', cp: 900_000 },
        { move: '6g6f', cp: mateToCp(-5, -1), scoreKind: 'mate', mate: -5, mateSign: -1 },
      ],
      6
    );
    const candidateMateRow = parentRow(
      candidateFingerprint,
      'parent-mates',
      '4g4f',
      [
        { move: '3g3f', cp: mateToCp(1, 1), scoreKind: 'mate', mate: 1, mateSign: 1 },
        { move: '4g4f', cp: mateToCp(1, 1), scoreKind: 'mate', mate: 1, mateSign: 1 },
        { move: '5g5f', cp: 899_000 },
        { move: '6g6f', cp: mateToCp(-3, -1), scoreKind: 'mate', mate: -3, mateSign: -1 },
      ],
      10
    );
    (baselineMateRow.exact_search.searches as Array<{ depth: number }>)[0].depth = 2;
    (candidateMateRow.exact_search.searches as Array<{ depth: number }>)[0].depth = 7;
    await fs.promises.writeFile(
      baseline,
      workText(baselineFingerprint, [baselineMateRow])
    );
    await fs.promises.writeFile(
      candidate,
      workText(candidateFingerprint, [candidateMateRow])
    );

    const report = await compareSiblingTeacherWorkFiles({ baseline, candidate });
    expect(report.options.score_contract).toMatchObject({
      max_non_mate_cp: 900_000,
      mate_score_cp: 1_000_000,
    });
    expect(report.exact_search).toMatchObject({
      synthesized_rank1_move_agreement: { count: 1, rate: 1 },
      top1_set_exact_agreement: { count: 1, rate: 1 },
      top1_set_overlap: { count: 1, rate: 1 },
      baseline_tied_top1_parents: 1,
      candidate_tied_top1_parents: 1,
    });
    expect(report.files.baseline.score_metadata).toEqual({
      cp_records: 1,
      mate_records: 3,
      positive_mate_records: 2,
      negative_mate_records: 1,
    });
    expect(report.files.baseline.search.independent_single).toMatchObject({
      requested_depth_per_search: { count: 4, sum: 24, mean: 6, min: 6, max: 6 },
      actual_depth_per_search: { count: 4, sum: 20, mean: 5, min: 2, max: 6 },
      distinct_requested_depths: [6],
      distinct_actual_depths: [2, 6],
      early_final_mate: {
        searches: 1,
        requested_depth_per_search: { count: 1, sum: 6, mean: 6, min: 6, max: 6 },
        actual_depth_per_search: { count: 1, sum: 2, mean: 2, min: 2, max: 2 },
        depth_shortfall_per_search: { count: 1, sum: 4, mean: 4, min: 4, max: 4 },
        distinct_actual_depths: [2],
      },
    });
    expect(report.common_move_score_metadata).toEqual({
      common_moves: 4,
      score_kind_agreement: { count: 4, rate: 1 },
      both_cp: 1,
      both_mate: 3,
      cp_to_mate: 0,
      mate_to_cp: 0,
      both_mate_same_sign: 3,
      both_mate_sign_changed: 0,
      exact_mate_metadata_agreement: { count: 0, rate: 0 },
    });
  });

  it('rejects mate metadata whose mapped cp does not match the stored score', async () => {
    const fixture = await writeFixturePair();
    const lines = fixture.baselineText.trim().split('\n').map((line) => JSON.parse(line));
    const row = lines[1] as ParentWorkRow;
    row.records[0].teacher_score_kind = 'mate';
    row.records[0].teacher_mate = 3;
    row.records[0].teacher_mate_sign = 1;
    resealParsedEntry(lines[1]);
    await fs.promises.writeFile(fixture.baseline, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);

    await expect(
      compareSiblingTeacherWorkFiles({ baseline: fixture.baseline, candidate: fixture.candidate })
    ).rejects.toThrow(/inconsistent mate cp|mate metadata maps to 999997, not 100/);
  });

  it('writes the same deterministic JSON to stdout and an optional report file', async () => {
    const fixture = await writeFixturePair();
    const output = path.join(fixture.root, 'comparison.json');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await main([
        '--baseline',
        fixture.baseline,
        '--candidate',
        fixture.candidate,
        '--min-teacher-delta-cp',
        '20',
        '--json',
        output,
      ]);
      const written = await fs.promises.readFile(output, 'utf8');
      expect(stdout).toHaveBeenCalledOnce();
      expect(stdout.mock.calls[0][0]).toBe(written);
      expect(JSON.parse(written)).toMatchObject({
        schema: SIBLING_TEACHER_COMPARISON_SCHEMA,
        options: { min_teacher_delta_cp: 20 },
      });
    } finally {
      stdout.mockRestore();
    }
  });

  it('refuses --json aliases of either work input without changing the input', async () => {
    const cases: Array<{
      name: string;
      setup: (fixture: Awaited<ReturnType<typeof writeFixturePair>>) => Promise<{
        baselineArg: string;
        output: string;
      }>;
    }> = [
      {
        name: 'lexical path',
        setup: async (fixture) => ({ baselineArg: fixture.baseline, output: fixture.baseline }),
      },
      {
        name: 'candidate lexical path',
        setup: async (fixture) => ({ baselineArg: fixture.baseline, output: fixture.candidate }),
      },
      {
        name: 'realpath input alias',
        setup: async (fixture) => {
          const baselineAlias = path.join(fixture.root, 'baseline-input-link.jsonl');
          await fs.promises.symlink(fixture.baseline, baselineAlias, 'file');
          return { baselineArg: baselineAlias, output: fixture.baseline };
        },
      },
      {
        name: 'symlinked output parent',
        setup: async (fixture) => {
          const parentAlias = path.join(fixture.root, 'output-parent-link');
          await fs.promises.symlink(fixture.root, parentAlias, 'dir');
          return {
            baselineArg: fixture.baseline,
            output: path.join(parentAlias, path.basename(fixture.baseline)),
          };
        },
      },
      {
        name: 'same inode hard link',
        setup: async (fixture) => {
          const output = path.join(fixture.root, 'baseline-hard-link.jsonl');
          await fs.promises.link(fixture.baseline, output);
          return { baselineArg: fixture.baseline, output };
        },
      },
      {
        name: 'final symlink',
        setup: async (fixture) => {
          const output = path.join(fixture.root, 'baseline-final-link.jsonl');
          await fs.promises.symlink(fixture.baseline, output, 'file');
          return { baselineArg: fixture.baseline, output };
        },
      },
    ];

    for (const testCase of cases) {
      const fixture = await writeFixturePair();
      const { baselineArg, output } = await testCase.setup(fixture);
      await expect(
        main([
          '--baseline',
          baselineArg,
          '--candidate',
          fixture.candidate,
          '--json',
          output,
        ]),
        testCase.name
      ).rejects.toThrow(/--json must not overwrite a work input/);
      expect(await fs.promises.readFile(fixture.baseline, 'utf8')).toBe(fixture.baselineText);
      expect(await fs.promises.readFile(fixture.candidate, 'utf8')).toBe(fixture.candidateText);
    }
  });
});
