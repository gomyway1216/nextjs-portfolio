/**
 * Compare two deterministic sibling-teacher work checkpoints.
 *
 * This is a label-stability report, not a playing-strength benchmark.  Every
 * comparison is parent-local and uses only parents completed by both runs.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  SIBLING_SCHEMA,
  SIBLING_SCHEMA_VERSION,
  positionKeyFromSfen,
  validateParentGroups,
  type SiblingRecord,
} from './sibling-data';
import { childSfenAfterUsi } from './shogi-sfen';
import { MAX_NON_MATE_CP, MATE_SCORE_CP, mateToCp } from './usi-multipv';

const WORK_SCHEMA = 'shogi-sibling-teacher-work-v2' as const;
const LABEL_POLICY =
  'initial-multipv-plus-played-independent-single-move-rescore-final-mate-v6' as const;
const INDEPENDENT_EXACT_RESCORE_MODE = 'independent-single-move' as const;
export const SIBLING_TEACHER_COMPARISON_SCHEMA =
  'shogi-sibling-teacher-comparison-v2' as const;

interface WorkHeader {
  schema: typeof WORK_SCHEMA;
  kind: 'header';
  run_fingerprint: string;
  source_raw_sha256: string;
  selected_parent_ids_sha256: string;
  label_policy: typeof LABEL_POLICY;
  pipeline: {
    source_revision: string;
    tracked_tree_clean: true;
  };
}

interface SearchMetadata {
  requested_multipv: number;
  requested_limit: { nodes: number } | { depth: number };
  depth: number;
  observed_nodes: number;
  bestmove: string;
  moves: string[];
  scores: SearchScoreMetadata[];
}

interface SearchScoreMetadata {
  move: string;
  cp: number;
  score_kind: 'cp' | 'mate';
  mate?: number;
  mate_sign?: 1 | -1;
}

interface IndependentExactSearchMetadata {
  mode: typeof INDEPENDENT_EXACT_RESCORE_MODE;
  candidate_count: number;
  synthesized_rank1_move: string;
  /** Ranked by cp descending, then UTF-8 bytes ascending. */
  moves: string[];
  scores: SearchScoreMetadata[];
  /** MultiPV=1 searches in canonical UTF-8 bytewise candidate order. */
  searches: SearchMetadata[];
  total_observed_nodes: number;
}

interface CompletedEntry {
  kind: 'parent';
  payload_sha256: string;
  parent_id: string;
  candidate_set_sha256: string;
  candidate_moves: string[];
  initial_search: SearchMetadata;
  exact_search: IndependentExactSearchMetadata;
  records: SiblingRecord[];
  byMove: Map<string, SiblingRecord>;
  played: SiblingRecord;
  topMoves: string[];
}

interface SkippedEntry {
  kind: 'skip';
  payload_sha256: string;
  parent_id: string;
  reason: 'fewer-than-two-legal-moves';
  legal_moves: number;
}

type WorkEntry = CompletedEntry | SkippedEntry;

interface LoadedWork {
  path: string;
  bytes: number;
  sha256: string;
  header: WorkHeader;
  entries: Map<string, WorkEntry>;
  completed: Map<string, CompletedEntry>;
  skipped: Map<string, SkippedEntry>;
  siblingRecords: number;
  lines: number;
}

export interface CompareSiblingTeachersOptions {
  baseline: string;
  candidate: string;
  /** Differences smaller than this are treated as pair-order ties. */
  minTeacherDeltaCp?: number;
}

interface CountRate {
  count: number;
  rate: number | null;
}

interface NumberSummary {
  count: number;
  sum: number;
  mean: number | null;
  min: number | null;
  max: number | null;
}

interface DeltaSummary extends NumberSummary {
  mean_absolute: number | null;
  unchanged: number;
  candidate_lower: number;
  candidate_higher: number;
}

interface AbsoluteDeltaDistribution extends DeltaSummary {
  absolute_p50: number | null;
  absolute_p90: number | null;
  absolute_p95: number | null;
  absolute_trimmed_mean_5pct: number | null;
}

interface FileSummary {
  path: string;
  bytes: number;
  sha256: string;
  header: WorkHeader;
  counts: {
    lines: number;
    entries: number;
    completed_parents: number;
    skipped_parents: number;
    sibling_records: number;
  };
  search: {
    proposal: {
      searches: number;
      requested_depth_per_search: NumberSummary;
      requested_nodes_per_search: NumberSummary;
      actual_depth_per_search: NumberSummary;
      observed_nodes_per_parent: NumberSummary;
      distinct_requested_depths: number[];
      distinct_actual_depths: number[];
    };
    independent_single: {
      searches: number;
      requested_depth_per_search: NumberSummary;
      requested_nodes_per_search: NumberSummary;
      actual_depth_per_search: NumberSummary;
      observed_nodes_per_search: NumberSummary;
      total_observed_nodes_per_parent: NumberSummary;
      distinct_requested_depths: number[];
      distinct_actual_depths: number[];
      early_final_mate: {
        searches: number;
        requested_depth_per_search: NumberSummary;
        actual_depth_per_search: NumberSummary;
        depth_shortfall_per_search: NumberSummary;
        distinct_actual_depths: number[];
      };
    };
    /** Proposal nodes plus all independent candidate-search nodes. */
    parent_total_observed_nodes: NumberSummary;
  };
  score_metadata: {
    cp_records: number;
    mate_records: number;
    positive_mate_records: number;
    negative_mate_records: number;
  };
}

export interface SiblingTeacherComparisonReport {
  schema: typeof SIBLING_TEACHER_COMPARISON_SCHEMA;
  scope: 'teacher-label stability only; this report does not measure playing strength';
  options: {
    min_teacher_delta_cp: number;
    pair_decisive_definition: 'nonzero abs(cp_a - cp_b) >= min_teacher_delta_cp';
    score_contract: {
      max_non_mate_cp: number;
      mate_score_cp: number;
      mapping: 'teacher_mate_sign * (mate_score_cp - clamped_abs_teacher_mate)';
    };
  };
  files: {
    baseline: FileSummary;
    candidate: FileSummary;
  };
  compatibility: {
    source_raw_sha256_equal: true;
    selected_parent_ids_sha256_equal: true;
    label_policy_equal: true;
    /** Cross-revision comparisons are allowed, but the distinction is explicit. */
    pipeline_source_revision_equal: boolean;
  };
  parent_coverage: {
    baseline_entries: number;
    candidate_entries: number;
    entry_intersection: number;
    entry_union: number;
    baseline_only_entries: number;
    candidate_only_entries: number;
    completed_parent_intersection: number;
    completed_parent_union: number;
    baseline_completed_not_candidate_completed: number;
    candidate_completed_not_baseline_completed: number;
  };
  skips: {
    baseline: number;
    candidate: number;
    shared: number;
    baseline_skip_candidate_completed: number;
    candidate_skip_baseline_completed: number;
    baseline_skip_candidate_missing: number;
    candidate_skip_baseline_missing: number;
  };
  exact_search: {
    compared_parents: number;
    synthesized_rank1_move_agreement: CountRate;
    top1_set_exact_agreement: CountRate;
    top1_set_overlap: CountRate;
    baseline_synthesized_rank1_move_in_candidate_top1: CountRate;
    candidate_synthesized_rank1_move_in_baseline_top1: CountRate;
    baseline_tied_top1_parents: number;
    candidate_tied_top1_parents: number;
  };
  candidate_sets: {
    compared_parents: number;
    baseline_candidates: number;
    candidate_candidates: number;
    common_candidates: number;
    union_candidates: number;
    exact_set_agreement: CountRate;
    micro_jaccard: number | null;
    parent_jaccard: NumberSummary;
  };
  played_moves: {
    compared_parents: number;
    baseline_top1: number;
    candidate_top1: number;
    entered_top1: number;
    left_top1: number;
    remained_top1: number;
    remained_outside_top1: number;
    /** Score rank is 1 + the count of siblings with a strictly greater cp. */
    tie_aware_score_rank_delta: DeltaSummary;
    /** Stored rank synthesized by cp descending, then UTF-8 move bytes. */
    synthesized_teacher_rank_delta: DeltaSummary;
    cp_delta: DeltaSummary;
    cp_sign_transitions: Record<string, number>;
    cp_sign_unchanged: number;
    cp_sign_candidate_lower: number;
    cp_sign_candidate_higher: number;
  };
  common_move_score_metadata: {
    common_moves: number;
    score_kind_agreement: CountRate;
    both_cp: number;
    both_mate: number;
    cp_to_mate: number;
    mate_to_cp: number;
    both_mate_same_sign: number;
    both_mate_sign_changed: number;
    exact_mate_metadata_agreement: CountRate;
  };
  common_move_cp_deltas: DeltaSummary;
  /** Excludes mate-band mappings and CP↔mate transitions. */
  common_move_both_cp_deltas: AbsoluteDeltaDistribution;
  pair_order: {
    min_teacher_delta_cp: number;
    parents_with_common_pairs: number;
    common_move_pairs: number;
    relation_agreement: CountRate;
    strict_agreement: number;
    both_ties: number;
    reversals: number;
    baseline_decisive_candidate_tie: number;
    baseline_tie_candidate_decisive: number;
    both_decisive_pairs: number;
    both_decisive_agreement: CountRate;
    both_decisive_reversal_rate: CountRate;
    all_pair_reversal_rate: CountRate;
    baseline_decisive_pairs: number;
    baseline_decisive_retention: CountRate;
  };
}

function sha256(input: string | Uint8Array): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Byte-for-byte equivalent to the generator's canonical payload encoding. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('cannot canonicalize a non-finite number');
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

function workEntryPayloadSha256(entry: Record<string, unknown>): string {
  const payload = { ...entry };
  delete payload.payload_sha256;
  return sha256(canonicalJson(payload));
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must not be empty`);
  if (value !== value.trim()) {
    throw new Error(`${name} must not have leading or trailing whitespace`);
  }
  return value;
}

function requiredSha256(value: unknown, name: string): string {
  const digest = requiredText(value, name);
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error(`${name} must be a lowercase SHA-256`);
  return digest;
}

function nonNegativeSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value as number;
}

function positiveSafeInteger(value: unknown, name: string): number {
  const number = nonNegativeSafeInteger(value, name);
  if (number === 0) throw new Error(`${name} must be positive`);
  return number;
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function canonicalSortedMoves(moves: Iterable<string>): string[] {
  return [...moves].sort(compareBytewise);
}

function candidateSetSha256(moves: readonly string[]): string {
  return sha256(`candidate-set-v1\0${canonicalSortedMoves(moves).join('\n')}`);
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count++;
  return count;
}

function sortedIntersection(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((value) => right.has(value)).sort(compareBytewise);
}

function compareRankedScores(left: SearchScoreMetadata, right: SearchScoreMetadata): number {
  return right.cp - left.cp || compareBytewise(left.move, right.move);
}

function sameSearchScore(left: SearchScoreMetadata, right: SearchScoreMetadata): boolean {
  return left.move === right.move &&
    left.cp === right.cp &&
    left.score_kind === right.score_kind &&
    left.mate === right.mate &&
    left.mate_sign === right.mate_sign;
}

function validateMappedScore(
  cp: unknown,
  scoreKind: unknown,
  mate: unknown,
  mateSign: unknown,
  label: string
): asserts cp is number {
  if (!Number.isSafeInteger(cp)) throw new Error(`${label} cp must be a safe integer`);
  if (scoreKind === 'cp') {
    if (mate !== undefined || mateSign !== undefined) {
      throw new Error(`${label} has mate metadata for a cp score`);
    }
    if (Math.abs(cp as number) > MAX_NON_MATE_CP) {
      throw new Error(`${label} cp score exceeds the non-mate band ${MAX_NON_MATE_CP}`);
    }
    return;
  }
  if (scoreKind !== 'mate') throw new Error(`${label} has an invalid score kind`);
  if (!Number.isSafeInteger(mate)) throw new Error(`${label} has an invalid mate distance`);
  if (mateSign !== 1 && mateSign !== -1) throw new Error(`${label} has an invalid mate sign`);
  if (((mate as number) > 0 && mateSign !== 1) || ((mate as number) < 0 && mateSign !== -1)) {
    throw new Error(`${label} has contradictory mate sign metadata`);
  }
  const mapped = mateToCp(mate as number, mateSign);
  if (cp !== mapped) throw new Error(`${label} mate metadata maps to ${mapped}, not ${String(cp)}`);
  const magnitude = Math.abs(cp as number);
  if (magnitude <= MAX_NON_MATE_CP || magnitude > MATE_SCORE_CP) {
    throw new Error(`${label} mapped mate score is outside the mate band`);
  }
}

function parseSearchScore(value: unknown, name: string): SearchScoreMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${name} must be an object`);
  const row = value as Partial<SearchScoreMetadata>;
  const move = requiredText(row.move, `${name}.move`);
  validateMappedScore(row.cp, row.score_kind, row.mate, row.mate_sign, name);
  return {
    move,
    cp: row.cp,
    score_kind: row.score_kind as 'cp' | 'mate',
    ...(row.score_kind === 'mate'
      ? { mate: row.mate as number, mate_sign: row.mate_sign as 1 | -1 }
      : {}),
  };
}

function parseRequestedLimit(
  value: unknown,
  name: string
): { nodes: number } | { depth: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const row = value as { nodes?: unknown; depth?: unknown };
  const hasNodes = row.nodes !== undefined;
  const hasDepth = row.depth !== undefined;
  if (hasNodes === hasDepth) throw new Error(`${name} must have exactly one mode`);
  return hasNodes
    ? { nodes: positiveSafeInteger(row.nodes, `${name}.nodes`) }
    : { depth: positiveSafeInteger(row.depth, `${name}.depth`) };
}

function parseSearchMetadata(
  value: unknown,
  name: string,
  allowTerminalMateBeforeRequestedDepth = false
): SearchMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${name} must be an object`);
  const row = value as Partial<SearchMetadata>;
  if (!Array.isArray(row.moves)) throw new Error(`${name}.moves must be an array`);
  const moves = row.moves.map((move, index) => requiredText(move, `${name}.moves[${index}]`));
  if (new Set(moves).size !== moves.length) throw new Error(`${name} has duplicate moves`);
  const requestedMultiPv = positiveSafeInteger(row.requested_multipv, `${name}.requested_multipv`);
  if (requestedMultiPv !== moves.length) {
    throw new Error(`${name}.requested_multipv does not match its move count`);
  }
  const bestmove = requiredText(row.bestmove, `${name}.bestmove`);
  if (moves[0] !== bestmove) throw new Error(`${name}.bestmove does not match PV1`);
  if (!Array.isArray(row.scores)) throw new Error(`${name}.scores must be an array`);
  const scores = row.scores.map((score, index) =>
    parseSearchScore(score, `${name}.scores[${index}]`)
  );
  if (
    scores.length !== moves.length ||
    scores.some((score, index) => score.move !== moves[index])
  ) {
    throw new Error(`${name}.scores do not match MultiPV moves`);
  }
  const requestedLimit = parseRequestedLimit(row.requested_limit, `${name}.requested_limit`);
  const actualDepth = positiveSafeInteger(row.depth, `${name}.depth`);
  if ('depth' in requestedLimit) {
    if (actualDepth > requestedLimit.depth) {
      throw new Error(`${name} completed beyond its requested depth`);
    }
    if (
      actualDepth < requestedLimit.depth &&
      (!allowTerminalMateBeforeRequestedDepth ||
        requestedMultiPv !== 1 ||
        scores.some((score) => score.score_kind !== 'mate'))
    ) {
      throw new Error(`${name} ended before requested depth without a terminal mate`);
    }
  }
  return {
    requested_multipv: requestedMultiPv,
    requested_limit: requestedLimit,
    depth: actualDepth,
    observed_nodes: nonNegativeSafeInteger(row.observed_nodes, `${name}.observed_nodes`),
    bestmove,
    moves,
    scores,
  };
}

function parseIndependentExactSearch(
  value: unknown,
  candidateMoves: readonly string[],
  expectedLimit: SearchMetadata['requested_limit'],
  name: string
): IndependentExactSearchMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${name} must be an object`);
  const row = value as Partial<IndependentExactSearchMetadata>;
  if (row.mode !== INDEPENDENT_EXACT_RESCORE_MODE) {
    throw new Error(`${name}.mode must be ${INDEPENDENT_EXACT_RESCORE_MODE}`);
  }
  const candidateCount = positiveSafeInteger(row.candidate_count, `${name}.candidate_count`);
  if (candidateCount !== candidateMoves.length) {
    throw new Error(`${name}.candidate_count does not match candidate_moves`);
  }
  if (!Array.isArray(row.moves)) throw new Error(`${name}.moves must be an array`);
  const moves = row.moves.map((move, index) => requiredText(move, `${name}.moves[${index}]`));
  if (
    moves.length !== candidateCount ||
    new Set(moves).size !== moves.length ||
    !sameSet(new Set(moves), new Set(candidateMoves))
  ) {
    throw new Error(`${name}.moves do not match candidate_moves`);
  }
  if (!Array.isArray(row.scores)) throw new Error(`${name}.scores must be an array`);
  const scores = row.scores.map((score, index) =>
    parseSearchScore(score, `${name}.scores[${index}]`)
  );
  if (
    scores.length !== moves.length ||
    scores.some((score, index) => score.move !== moves[index])
  ) {
    throw new Error(`${name}.scores do not match ranked moves`);
  }
  const expectedRanking = [...scores].sort(compareRankedScores);
  if (expectedRanking.some((score, index) => score.move !== moves[index])) {
    throw new Error(`${name} is not ranked by cp then UTF-8 move bytes`);
  }
  const synthesizedRank1Move = requiredText(
    row.synthesized_rank1_move,
    `${name}.synthesized_rank1_move`
  );
  if (synthesizedRank1Move !== moves[0]) {
    throw new Error(`${name}.synthesized_rank1_move does not match ranked move 1`);
  }

  if (!Array.isArray(row.searches)) throw new Error(`${name}.searches must be an array`);
  const searches = row.searches.map((search, index) =>
    parseSearchMetadata(search, `${name}.searches[${index}]`, true)
  );
  if (searches.length !== candidateCount) {
    throw new Error(`${name}.searches does not match candidate_count`);
  }
  for (let index = 0; index < searches.length; index++) {
    const search = searches[index];
    const candidate = candidateMoves[index];
    if (
      search.requested_multipv !== 1 ||
      search.moves.length !== 1 ||
      search.scores.length !== 1 ||
      search.bestmove !== candidate ||
      search.moves[0] !== candidate ||
      search.scores[0].move !== candidate
    ) {
      throw new Error(`${name}.searches are not independent searches in canonical candidate order`);
    }
    const sameLimit =
      ('depth' in expectedLimit &&
        'depth' in search.requested_limit &&
        expectedLimit.depth === search.requested_limit.depth) ||
      ('nodes' in expectedLimit &&
        'nodes' in search.requested_limit &&
        expectedLimit.nodes === search.requested_limit.nodes);
    if (!sameLimit) {
      throw new Error(`${name}.searches requested_limit differs from the proposal/run limit`);
    }
  }
  const totalObservedNodes = searches.reduce(
    (total, search) => total + search.observed_nodes,
    0
  );
  if (!Number.isSafeInteger(totalObservedNodes)) {
    throw new Error(`${name}.total_observed_nodes exceeds the safe integer range`);
  }
  if (
    nonNegativeSafeInteger(row.total_observed_nodes, `${name}.total_observed_nodes`) !==
    totalObservedNodes
  ) {
    throw new Error(`${name}.total_observed_nodes does not equal the single-search sum`);
  }
  const singleScores = new Map(
    searches.map((search) => [search.scores[0].move, search.scores[0]])
  );
  for (const score of scores) {
    const singleScore = singleScores.get(score.move);
    if (!singleScore || !sameSearchScore(score, singleScore)) {
      throw new Error(`${name} ranked score ${score.move} disagrees with its single search`);
    }
  }

  return {
    mode: INDEPENDENT_EXACT_RESCORE_MODE,
    candidate_count: candidateCount,
    synthesized_rank1_move: synthesizedRank1Move,
    moves,
    scores,
    searches,
    total_observed_nodes: totalObservedNodes,
  };
}

function parseHeader(value: unknown, fileLabel: string): WorkHeader {
  if (!value || typeof value !== 'object') throw new Error(`${fileLabel} line 1 must be an object`);
  const row = value as Partial<WorkHeader>;
  if (row.schema !== WORK_SCHEMA || row.kind !== 'header') {
    throw new Error(`${fileLabel} line 1 is not a ${WORK_SCHEMA} header`);
  }
  if (row.label_policy !== LABEL_POLICY) {
    throw new Error(`${fileLabel} header has unsupported label_policy ${JSON.stringify(row.label_policy)}`);
  }
  const pipelineValue = row.pipeline;
  if (!pipelineValue || typeof pipelineValue !== 'object' || Array.isArray(pipelineValue)) {
    throw new Error(`${fileLabel} header pipeline must be an object`);
  }
  const pipeline = pipelineValue as Record<string, unknown>;
  if (
    typeof pipeline.source_revision !== 'string' ||
    !/^[0-9a-f]{40}$/.test(pipeline.source_revision)
  ) {
    throw new Error(`${fileLabel} header pipeline.source_revision must be a lowercase 40-digit Git commit`);
  }
  if (pipeline.tracked_tree_clean !== true) {
    throw new Error(`${fileLabel} header pipeline.tracked_tree_clean must be exactly true`);
  }
  return {
    schema: WORK_SCHEMA,
    kind: 'header',
    run_fingerprint: requiredSha256(row.run_fingerprint, `${fileLabel} header run_fingerprint`),
    source_raw_sha256: requiredSha256(row.source_raw_sha256, `${fileLabel} header source_raw_sha256`),
    selected_parent_ids_sha256: requiredSha256(
      row.selected_parent_ids_sha256,
      `${fileLabel} header selected_parent_ids_sha256`
    ),
    label_policy: LABEL_POLICY,
    pipeline: {
      source_revision: pipeline.source_revision,
      tracked_tree_clean: true,
    },
  };
}

function validateScoreMetadata(record: SiblingRecord, prefix: string): void {
  validateMappedScore(
    record.teacher_parent_cp,
    record.teacher_score_kind,
    record.teacher_mate,
    record.teacher_mate_sign,
    `${prefix} move ${record.move}`
  );
}

function parseCompletedEntry(
  row: Record<string, unknown>,
  parentId: string,
  fileLabel: string,
  line: number
): CompletedEntry {
  const prefix = `${fileLabel} line ${line} parent ${parentId}`;
  if (!Array.isArray(row.candidate_moves)) throw new Error(`${prefix} is missing candidate_moves`);
  const candidateMoves = row.candidate_moves.map((move, index) =>
    requiredText(move, `${prefix} candidate_moves[${index}]`)
  );
  if (new Set(candidateMoves).size !== candidateMoves.length) {
    throw new Error(`${prefix} has duplicate candidate moves`);
  }
  const canonicalCandidates = canonicalSortedMoves(candidateMoves);
  if (candidateMoves.some((move, index) => move !== canonicalCandidates[index])) {
    throw new Error(`${prefix} candidate_moves are not in canonical UTF-8 bytewise order`);
  }
  const candidateSet = new Set(candidateMoves);
  const candidateDigest = requiredSha256(row.candidate_set_sha256, `${prefix} candidate_set_sha256`);
  if (candidateDigest !== candidateSetSha256(candidateMoves)) {
    throw new Error(`${prefix} has an invalid candidate_set_sha256`);
  }

  const initialSearch = parseSearchMetadata(row.initial_search, `${prefix} initial_search`);
  if (initialSearch.moves.some((move) => !candidateSet.has(move))) {
    throw new Error(`${prefix} initial_search contains a move outside candidate_moves`);
  }
  const exactSearch = parseIndependentExactSearch(
    row.exact_search,
    candidateMoves,
    initialSearch.requested_limit,
    `${prefix} exact_search`
  );

  if (!Array.isArray(row.records)) throw new Error(`${prefix} is missing records`);
  const records = row.records as SiblingRecord[];
  try {
    validateParentGroups(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${prefix} has invalid sibling records: ${message}`);
  }
  if (records.some((record) => record.parent_id !== parentId)) {
    throw new Error(`${prefix} contains records for another parent`);
  }
  if (records.some(
    (record) => record.schema !== SIBLING_SCHEMA || record.schema_version !== SIBLING_SCHEMA_VERSION
  )) {
    throw new Error(`${prefix} contains an unsupported sibling schema`);
  }
  for (const record of records) validateScoreMetadata(record, prefix);
  for (const record of records) {
    let derivedChildSfen: string;
    try {
      derivedChildSfen = childSfenAfterUsi(record.parent_sfen, record.move);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${prefix} move ${record.move} cannot be re-derived: ${message}`);
    }
    if (record.child_sfen !== derivedChildSfen || record.sfen !== derivedChildSfen) {
      throw new Error(`${prefix} move ${record.move} child_sfen does not match parent_sfen + move`);
    }
    if (record.child_position_id !== positionKeyFromSfen(derivedChildSfen)) {
      throw new Error(`${prefix} move ${record.move} child_position_id does not match derived child`);
    }
  }
  const byMove = new Map(records.map((record) => [record.move, record]));
  if (!sameSet(new Set(byMove.keys()), candidateSet)) {
    throw new Error(`${prefix} record moves do not match candidate_moves`);
  }
  const played = records.filter((record) => record.sources.includes('played'));
  if (played.length !== 1) throw new Error(`${prefix} must contain exactly one played move`);
  const expectedCandidates = canonicalSortedMoves(
    new Set([...initialSearch.moves, played[0].move])
  );
  if (
    expectedCandidates.length !== candidateMoves.length ||
    expectedCandidates.some((move, index) => move !== candidateMoves[index])
  ) {
    throw new Error(`${prefix} candidate_moves are not proposal moves plus the played move`);
  }
  const proposalMoves = new Set(initialSearch.moves);
  for (let index = 0; index < exactSearch.moves.length; index++) {
    const move = exactSearch.moves[index];
    const record = records[index];
    if (record?.move !== move || record.teacher_rank !== index + 1) {
      throw new Error(`${prefix} exact_search order does not match teacher_rank`);
    }
    const score = exactSearch.scores[index];
    if (
      score.cp !== record.teacher_parent_cp ||
      score.score_kind !== record.teacher_score_kind ||
      score.mate !== record.teacher_mate ||
      score.mate_sign !== record.teacher_mate_sign
    ) {
      throw new Error(`${prefix} exact_search score metadata does not match record ${move}`);
    }
    const expectedSources = [
      ...(move === played[0].move ? ['played'] : []),
      ...(proposalMoves.has(move) ? ['teacher'] : []),
    ];
    if (
      record.sources.length !== expectedSources.length ||
      record.sources.some((source, sourceIndex) => source !== expectedSources[sourceIndex])
    ) {
      throw new Error(`${prefix} record ${move} sources do not match proposal/played derivation`);
    }
  }

  const maximumCp = Math.max(...records.map((record) => record.teacher_parent_cp));
  const topMoves = records
    .filter((record) => record.teacher_parent_cp === maximumCp)
    .map((record) => record.move)
    .sort(compareBytewise);
  return {
    kind: 'parent',
    payload_sha256: row.payload_sha256 as string,
    parent_id: parentId,
    candidate_set_sha256: candidateDigest,
    candidate_moves: candidateMoves,
    initial_search: initialSearch,
    exact_search: exactSearch,
    records,
    byMove,
    played: played[0],
    topMoves,
  };
}

function parseEntry(
  value: unknown,
  header: WorkHeader,
  fileLabel: string,
  line: number
): WorkEntry {
  if (!value || typeof value !== 'object') throw new Error(`${fileLabel} line ${line} must be an object`);
  const row = value as Record<string, unknown>;
  if (row.schema !== WORK_SCHEMA) throw new Error(`${fileLabel} line ${line} has an unsupported schema`);
  if (row.run_fingerprint !== header.run_fingerprint) {
    throw new Error(`${fileLabel} line ${line} has a mismatched run_fingerprint`);
  }
  const payloadSha256 = requiredSha256(
    row.payload_sha256,
    `${fileLabel} line ${line} payload_sha256`
  );
  if (
    row.payload_sha256 !== payloadSha256 ||
    payloadSha256 !== workEntryPayloadSha256(row)
  ) {
    throw new Error(`${fileLabel} line ${line} payload checksum mismatch`);
  }
  const parentId = requiredText(row.parent_id, `${fileLabel} line ${line} parent_id`);
  if (row.kind === 'parent') return parseCompletedEntry(row, parentId, fileLabel, line);
  if (row.kind !== 'skip') throw new Error(`${fileLabel} line ${line} has an unsupported kind`);
  if (row.reason !== 'fewer-than-two-legal-moves') {
    throw new Error(`${fileLabel} line ${line} has an unsupported skip reason`);
  }
  const legalMoves = nonNegativeSafeInteger(row.legal_moves, `${fileLabel} line ${line} legal_moves`);
  if (legalMoves >= 2) throw new Error(`${fileLabel} line ${line} has invalid skip metadata`);
  return {
    kind: 'skip',
    payload_sha256: payloadSha256,
    parent_id: parentId,
    reason: 'fewer-than-two-legal-moves',
    legal_moves: legalMoves,
  };
}

async function loadWork(filePath: string, label: 'baseline' | 'candidate'): Promise<LoadedWork> {
  const resolved = path.resolve(filePath);
  const bytes = await fs.promises.readFile(resolved);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} work file is not valid UTF-8: ${resolved}`);
  }
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) throw new Error(`${label} work file is empty: ${resolved}`);
  if (lines.some((line) => line.trim() === '')) {
    throw new Error(`${label} work file contains a blank JSONL row: ${resolved}`);
  }

  const parseLine = (index: number): unknown => {
    try {
      return JSON.parse(lines[index]);
    } catch {
      throw new Error(`invalid JSON in ${label} work file on line ${index + 1}`);
    }
  };
  const header = parseHeader(parseLine(0), label);
  const entries = new Map<string, WorkEntry>();
  const completed = new Map<string, CompletedEntry>();
  const skipped = new Map<string, SkippedEntry>();
  let siblingRecords = 0;
  for (let index = 1; index < lines.length; index++) {
    const entry = parseEntry(parseLine(index), header, label, index + 1);
    if (entries.has(entry.parent_id)) {
      throw new Error(`${label} work file has duplicate parent_id ${entry.parent_id}`);
    }
    entries.set(entry.parent_id, entry);
    if (entry.kind === 'parent') {
      completed.set(entry.parent_id, entry);
      siblingRecords += entry.records.length;
    } else {
      skipped.set(entry.parent_id, entry);
    }
  }
  return {
    path: resolved,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    header,
    entries,
    completed,
    skipped,
    siblingRecords,
    lines: lines.length,
  };
}

function ratio(count: number, total: number): CountRate {
  return { count, rate: total === 0 ? null : count / total };
}

function summarize(values: readonly number[]): NumberSummary {
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    sum,
    mean: values.length === 0 ? null : sum / values.length,
    min: values.length === 0 ? null : Math.min(...values),
    max: values.length === 0 ? null : Math.max(...values),
  };
}

function summarizeDeltas(values: readonly number[]): DeltaSummary {
  const summary = summarize(values);
  return {
    ...summary,
    mean_absolute:
      values.length === 0
        ? null
        : values.reduce((total, value) => total + Math.abs(value), 0) / values.length,
    unchanged: values.filter((value) => value === 0).length,
    candidate_lower: values.filter((value) => value < 0).length,
    candidate_higher: values.filter((value) => value > 0).length,
  };
}

function interpolatedQuantile(sorted: readonly number[], quantile: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarizeAbsoluteDeltas(values: readonly number[]): AbsoluteDeltaDistribution {
  const summary = summarizeDeltas(values);
  const absolute = values.map(Math.abs).sort((left, right) => left - right);
  const trim = Math.floor(absolute.length * 0.05);
  const trimmed = absolute.slice(trim, absolute.length - trim);
  return {
    ...summary,
    absolute_p50: interpolatedQuantile(absolute, 0.5),
    absolute_p90: interpolatedQuantile(absolute, 0.9),
    absolute_p95: interpolatedQuantile(absolute, 0.95),
    absolute_trimmed_mean_5pct:
      trimmed.length === 0
        ? null
        : trimmed.reduce((total, value) => total + value, 0) / trimmed.length,
  };
}

function fileSummary(work: LoadedWork): FileSummary {
  const completed = [...work.completed.values()];
  const records = completed.flatMap((entry) => entry.records);
  const mates = records.filter((record) => record.teacher_score_kind === 'mate');
  const proposalSearches = completed.map((entry) => entry.initial_search);
  const independentSearches = completed.flatMap((entry) => entry.exact_search.searches);
  const requestedDepths = (searches: readonly SearchMetadata[]): number[] =>
    searches.flatMap((search) =>
      'depth' in search.requested_limit ? [search.requested_limit.depth] : []
    );
  const requestedNodes = (searches: readonly SearchMetadata[]): number[] =>
    searches.flatMap((search) =>
      'nodes' in search.requested_limit ? [search.requested_limit.nodes] : []
    );
  const earlyFinalMateSearches = independentSearches.filter(
    (search) =>
      'depth' in search.requested_limit && search.depth < search.requested_limit.depth
  );
  const proposalRequestedDepths = requestedDepths(proposalSearches);
  const independentRequestedDepths = requestedDepths(independentSearches);
  return {
    path: work.path,
    bytes: work.bytes,
    sha256: work.sha256,
    header: work.header,
    counts: {
      lines: work.lines,
      entries: work.entries.size,
      completed_parents: work.completed.size,
      skipped_parents: work.skipped.size,
      sibling_records: work.siblingRecords,
    },
    search: {
      proposal: {
        searches: proposalSearches.length,
        requested_depth_per_search: summarize(proposalRequestedDepths),
        requested_nodes_per_search: summarize(requestedNodes(proposalSearches)),
        actual_depth_per_search: summarize(proposalSearches.map((search) => search.depth)),
        observed_nodes_per_parent: summarize(
          proposalSearches.map((search) => search.observed_nodes)
        ),
        distinct_requested_depths: [...new Set(proposalRequestedDepths)].sort(
          (left, right) => left - right
        ),
        distinct_actual_depths: [
          ...new Set(proposalSearches.map((search) => search.depth)),
        ].sort((left, right) => left - right),
      },
      independent_single: {
        searches: independentSearches.length,
        requested_depth_per_search: summarize(independentRequestedDepths),
        requested_nodes_per_search: summarize(requestedNodes(independentSearches)),
        actual_depth_per_search: summarize(independentSearches.map((search) => search.depth)),
        observed_nodes_per_search: summarize(
          independentSearches.map((search) => search.observed_nodes)
        ),
        total_observed_nodes_per_parent: summarize(
          completed.map((entry) => entry.exact_search.total_observed_nodes)
        ),
        distinct_requested_depths: [...new Set(independentRequestedDepths)].sort(
          (left, right) => left - right
        ),
        distinct_actual_depths: [...new Set(independentSearches.map((search) => search.depth))].sort(
          (left, right) => left - right
        ),
        early_final_mate: {
          searches: earlyFinalMateSearches.length,
          requested_depth_per_search: summarize(
            earlyFinalMateSearches.map(
              (search) => (search.requested_limit as { depth: number }).depth
            )
          ),
          actual_depth_per_search: summarize(
            earlyFinalMateSearches.map((search) => search.depth)
          ),
          depth_shortfall_per_search: summarize(
            earlyFinalMateSearches.map(
              (search) =>
                (search.requested_limit as { depth: number }).depth - search.depth
            )
          ),
          distinct_actual_depths: [
            ...new Set(earlyFinalMateSearches.map((search) => search.depth)),
          ].sort((left, right) => left - right),
        },
      },
      parent_total_observed_nodes: summarize(
        completed.map(
          (entry) =>
            entry.initial_search.observed_nodes + entry.exact_search.total_observed_nodes
        )
      ),
    },
    score_metadata: {
      cp_records: records.length - mates.length,
      mate_records: mates.length,
      positive_mate_records: mates.filter((record) => record.teacher_mate_sign === 1).length,
      negative_mate_records: mates.filter((record) => record.teacher_mate_sign === -1).length,
    },
  };
}

function assertCompatibleHeaders(baseline: LoadedWork, candidate: LoadedWork): void {
  if (baseline.header.source_raw_sha256 !== candidate.header.source_raw_sha256) {
    throw new Error('incompatible work files: source_raw_sha256 differs');
  }
  if (
    baseline.header.selected_parent_ids_sha256 !== candidate.header.selected_parent_ids_sha256
  ) {
    throw new Error('incompatible work files: selected_parent_ids_sha256 differs');
  }
  if (baseline.header.label_policy !== candidate.header.label_policy) {
    throw new Error(
      'incompatible work files: label_policy differs ' +
      `(baseline=${JSON.stringify(baseline.header.label_policy)}, ` +
      `candidate=${JSON.stringify(candidate.header.label_policy)})`
    );
  }
}

function assertCompatibleParent(baseline: CompletedEntry, candidate: CompletedEntry): void {
  const left = baseline.records[0];
  const right = candidate.records[0];
  if (
    left.game_id !== right.game_id ||
    left.position_id !== right.position_id ||
    left.parent_sfen !== right.parent_sfen ||
    left.parent_ply !== right.parent_ply ||
    baseline.played.move !== candidate.played.move
  ) {
    throw new Error(`incompatible completed parent metadata: ${baseline.parent_id}`);
  }
}

function scoreRank(entry: CompletedEntry, move: string): number {
  const cp = (entry.byMove.get(move) as SiblingRecord).teacher_parent_cp;
  return 1 + entry.records.filter((record) => record.teacher_parent_cp > cp).length;
}

type CpSign = 'negative' | 'zero' | 'positive';

function cpSign(cp: number): CpSign {
  return cp < 0 ? 'negative' : cp > 0 ? 'positive' : 'zero';
}

function pairRelation(leftCp: number, rightCp: number, minimumDelta: number): -1 | 0 | 1 {
  const delta = leftCp - rightCp;
  if (delta === 0 || Math.abs(delta) < minimumDelta) return 0;
  return delta < 0 ? -1 : 1;
}

/** Load, validate, and compare two sibling-teacher progress checkpoints. */
export async function compareSiblingTeacherWorkFiles(
  options: CompareSiblingTeachersOptions
): Promise<SiblingTeacherComparisonReport> {
  const minimumDelta = options.minTeacherDeltaCp ?? 20;
  if (!Number.isSafeInteger(minimumDelta) || minimumDelta < 0) {
    throw new Error('minTeacherDeltaCp must be a non-negative safe integer');
  }
  const [baseline, candidate] = await Promise.all([
    loadWork(options.baseline, 'baseline'),
    loadWork(options.candidate, 'candidate'),
  ]);
  assertCompatibleHeaders(baseline, candidate);

  const baselineEntryIds = new Set(baseline.entries.keys());
  const candidateEntryIds = new Set(candidate.entries.keys());
  const baselineCompletedIds = new Set(baseline.completed.keys());
  const candidateCompletedIds = new Set(candidate.completed.keys());
  const comparedParentIds = sortedIntersection(baselineCompletedIds, candidateCompletedIds);

  let sharedSkips = 0;
  let baselineSkipCandidateCompleted = 0;
  let candidateSkipBaselineCompleted = 0;
  let baselineSkipCandidateMissing = 0;
  let candidateSkipBaselineMissing = 0;
  for (const [parentId, skip] of baseline.skipped) {
    const other = candidate.entries.get(parentId);
    if (!other) baselineSkipCandidateMissing++;
    else if (other.kind === 'parent') baselineSkipCandidateCompleted++;
    else {
      sharedSkips++;
      if (skip.reason !== other.reason || skip.legal_moves !== other.legal_moves) {
        throw new Error(`incompatible shared skip metadata: ${parentId}`);
      }
    }
  }
  for (const parentId of candidate.skipped.keys()) {
    const other = baseline.entries.get(parentId);
    if (!other) candidateSkipBaselineMissing++;
    else if (other.kind === 'parent') candidateSkipBaselineCompleted++;
  }

  let synthesizedRank1MoveAgreements = 0;
  let exactTopSetAgreements = 0;
  let topSetOverlaps = 0;
  let baselineSynthesizedRank1MoveInCandidateTop = 0;
  let candidateSynthesizedRank1MoveInBaselineTop = 0;
  let baselineTiedTop = 0;
  let candidateTiedTop = 0;
  let baselineCandidateCount = 0;
  let candidateCandidateCount = 0;
  let commonCandidateCount = 0;
  let unionCandidateCount = 0;
  let exactCandidateSetAgreements = 0;
  const parentJaccards: number[] = [];
  let baselinePlayedTop = 0;
  let candidatePlayedTop = 0;
  let enteredTop = 0;
  let leftTopCount = 0;
  let remainedTop = 0;
  let remainedOutsideTop = 0;
  const playedScoreRankDeltas: number[] = [];
  const playedSynthesizedRankDeltas: number[] = [];
  const playedCpDeltas: number[] = [];
  const signNames: readonly CpSign[] = ['negative', 'zero', 'positive'];
  const signTransitions: Record<string, number> = {};
  for (const from of signNames) for (const to of signNames) signTransitions[`${from}_to_${to}`] = 0;
  let signUnchanged = 0;
  let signCandidateLower = 0;
  let signCandidateHigher = 0;
  const commonMoveCpDeltas: number[] = [];
  const commonMoveBothCpDeltas: number[] = [];
  let scoreKindAgreements = 0;
  let bothCp = 0;
  let bothMate = 0;
  let cpToMate = 0;
  let mateToCpCount = 0;
  let bothMateSameSign = 0;
  let bothMateSignChanged = 0;
  let exactMateMetadataAgreements = 0;
  let parentsWithPairs = 0;
  let commonPairs = 0;
  let pairAgreements = 0;
  let strictPairAgreements = 0;
  let bothPairTies = 0;
  let pairReversals = 0;
  let baselineDecisiveCandidateTie = 0;
  let baselineTieCandidateDecisive = 0;

  for (const parentId of comparedParentIds) {
    const left = baseline.completed.get(parentId) as CompletedEntry;
    const right = candidate.completed.get(parentId) as CompletedEntry;
    assertCompatibleParent(left, right);
    const leftTop = new Set(left.topMoves);
    const rightTop = new Set(right.topMoves);
    if (
      left.exact_search.synthesized_rank1_move ===
      right.exact_search.synthesized_rank1_move
    ) {
      synthesizedRank1MoveAgreements++;
    }
    if (sameSet(leftTop, rightTop)) exactTopSetAgreements++;
    if (intersectionSize(leftTop, rightTop) > 0) topSetOverlaps++;
    if (rightTop.has(left.exact_search.synthesized_rank1_move)) {
      baselineSynthesizedRank1MoveInCandidateTop++;
    }
    if (leftTop.has(right.exact_search.synthesized_rank1_move)) {
      candidateSynthesizedRank1MoveInBaselineTop++;
    }
    if (leftTop.size > 1) baselineTiedTop++;
    if (rightTop.size > 1) candidateTiedTop++;

    const leftMoves = new Set(left.candidate_moves);
    const rightMoves = new Set(right.candidate_moves);
    const commonMoves = sortedIntersection(leftMoves, rightMoves);
    const common = commonMoves.length;
    const union = leftMoves.size + rightMoves.size - common;
    baselineCandidateCount += leftMoves.size;
    candidateCandidateCount += rightMoves.size;
    commonCandidateCount += common;
    unionCandidateCount += union;
    if (sameSet(leftMoves, rightMoves)) exactCandidateSetAgreements++;
    parentJaccards.push(common / union);

    const leftPlayedTop = leftTop.has(left.played.move);
    const rightPlayedTop = rightTop.has(right.played.move);
    if (leftPlayedTop) baselinePlayedTop++;
    if (rightPlayedTop) candidatePlayedTop++;
    if (!leftPlayedTop && rightPlayedTop) enteredTop++;
    else if (leftPlayedTop && !rightPlayedTop) leftTopCount++;
    else if (leftPlayedTop) remainedTop++;
    else remainedOutsideTop++;
    playedScoreRankDeltas.push(
      scoreRank(right, right.played.move) - scoreRank(left, left.played.move)
    );
    playedSynthesizedRankDeltas.push(right.played.teacher_rank - left.played.teacher_rank);
    playedCpDeltas.push(right.played.teacher_parent_cp - left.played.teacher_parent_cp);
    const leftSign = cpSign(left.played.teacher_parent_cp);
    const rightSign = cpSign(right.played.teacher_parent_cp);
    signTransitions[`${leftSign}_to_${rightSign}`]++;
    const signDelta = signNames.indexOf(rightSign) - signNames.indexOf(leftSign);
    if (signDelta === 0) signUnchanged++;
    else if (signDelta < 0) signCandidateLower++;
    else signCandidateHigher++;

    for (const move of commonMoves) {
      const leftRecord = left.byMove.get(move) as SiblingRecord;
      const rightRecord = right.byMove.get(move) as SiblingRecord;
      if (
        leftRecord.child_sfen !== rightRecord.child_sfen ||
        leftRecord.child_position_id !== rightRecord.child_position_id
      ) {
        throw new Error(`incompatible child metadata for parent ${parentId} move ${move}`);
      }
      if (leftRecord.teacher_score_kind === rightRecord.teacher_score_kind) {
        scoreKindAgreements++;
        if (leftRecord.teacher_score_kind === 'cp') {
          bothCp++;
          commonMoveBothCpDeltas.push(
            rightRecord.teacher_parent_cp - leftRecord.teacher_parent_cp
          );
        } else {
          bothMate++;
          if (leftRecord.teacher_mate_sign === rightRecord.teacher_mate_sign) {
            bothMateSameSign++;
          } else {
            bothMateSignChanged++;
          }
          if (
            leftRecord.teacher_mate === rightRecord.teacher_mate &&
            leftRecord.teacher_mate_sign === rightRecord.teacher_mate_sign
          ) {
            exactMateMetadataAgreements++;
          }
        }
      } else if (leftRecord.teacher_score_kind === 'cp') {
        cpToMate++;
      } else {
        mateToCpCount++;
      }
      commonMoveCpDeltas.push(
        rightRecord.teacher_parent_cp - leftRecord.teacher_parent_cp
      );
    }
    if (commonMoves.length >= 2) parentsWithPairs++;
    for (let first = 0; first < commonMoves.length; first++) {
      for (let second = first + 1; second < commonMoves.length; second++) {
        const firstMove = commonMoves[first];
        const secondMove = commonMoves[second];
        const leftRelation = pairRelation(
          (left.byMove.get(firstMove) as SiblingRecord).teacher_parent_cp,
          (left.byMove.get(secondMove) as SiblingRecord).teacher_parent_cp,
          minimumDelta
        );
        const rightRelation = pairRelation(
          (right.byMove.get(firstMove) as SiblingRecord).teacher_parent_cp,
          (right.byMove.get(secondMove) as SiblingRecord).teacher_parent_cp,
          minimumDelta
        );
        commonPairs++;
        if (leftRelation === rightRelation) {
          pairAgreements++;
          if (leftRelation === 0) bothPairTies++;
          else strictPairAgreements++;
        } else if (leftRelation !== 0 && rightRelation !== 0) pairReversals++;
        else if (leftRelation !== 0) baselineDecisiveCandidateTie++;
        else baselineTieCandidateDecisive++;
      }
    }
  }

  const entryIntersection = intersectionSize(baselineEntryIds, candidateEntryIds);
  const completedIntersection = comparedParentIds.length;
  return {
    schema: SIBLING_TEACHER_COMPARISON_SCHEMA,
    scope: 'teacher-label stability only; this report does not measure playing strength',
    options: {
      min_teacher_delta_cp: minimumDelta,
      pair_decisive_definition: 'nonzero abs(cp_a - cp_b) >= min_teacher_delta_cp',
      score_contract: {
        max_non_mate_cp: MAX_NON_MATE_CP,
        mate_score_cp: MATE_SCORE_CP,
        mapping: 'teacher_mate_sign * (mate_score_cp - clamped_abs_teacher_mate)',
      },
    },
    files: {
      baseline: fileSummary(baseline),
      candidate: fileSummary(candidate),
    },
    compatibility: {
      source_raw_sha256_equal: true,
      selected_parent_ids_sha256_equal: true,
      label_policy_equal: true,
      pipeline_source_revision_equal:
        baseline.header.pipeline.source_revision === candidate.header.pipeline.source_revision,
    },
    parent_coverage: {
      baseline_entries: baseline.entries.size,
      candidate_entries: candidate.entries.size,
      entry_intersection: entryIntersection,
      entry_union: baseline.entries.size + candidate.entries.size - entryIntersection,
      baseline_only_entries: baseline.entries.size - entryIntersection,
      candidate_only_entries: candidate.entries.size - entryIntersection,
      completed_parent_intersection: completedIntersection,
      completed_parent_union:
        baseline.completed.size + candidate.completed.size - completedIntersection,
      baseline_completed_not_candidate_completed: baseline.completed.size - completedIntersection,
      candidate_completed_not_baseline_completed: candidate.completed.size - completedIntersection,
    },
    skips: {
      baseline: baseline.skipped.size,
      candidate: candidate.skipped.size,
      shared: sharedSkips,
      baseline_skip_candidate_completed: baselineSkipCandidateCompleted,
      candidate_skip_baseline_completed: candidateSkipBaselineCompleted,
      baseline_skip_candidate_missing: baselineSkipCandidateMissing,
      candidate_skip_baseline_missing: candidateSkipBaselineMissing,
    },
    exact_search: {
      compared_parents: completedIntersection,
      synthesized_rank1_move_agreement: ratio(
        synthesizedRank1MoveAgreements,
        completedIntersection
      ),
      top1_set_exact_agreement: ratio(exactTopSetAgreements, completedIntersection),
      top1_set_overlap: ratio(topSetOverlaps, completedIntersection),
      baseline_synthesized_rank1_move_in_candidate_top1: ratio(
        baselineSynthesizedRank1MoveInCandidateTop,
        completedIntersection
      ),
      candidate_synthesized_rank1_move_in_baseline_top1: ratio(
        candidateSynthesizedRank1MoveInBaselineTop,
        completedIntersection
      ),
      baseline_tied_top1_parents: baselineTiedTop,
      candidate_tied_top1_parents: candidateTiedTop,
    },
    candidate_sets: {
      compared_parents: completedIntersection,
      baseline_candidates: baselineCandidateCount,
      candidate_candidates: candidateCandidateCount,
      common_candidates: commonCandidateCount,
      union_candidates: unionCandidateCount,
      exact_set_agreement: ratio(exactCandidateSetAgreements, completedIntersection),
      micro_jaccard:
        unionCandidateCount === 0 ? null : commonCandidateCount / unionCandidateCount,
      parent_jaccard: summarize(parentJaccards),
    },
    played_moves: {
      compared_parents: completedIntersection,
      baseline_top1: baselinePlayedTop,
      candidate_top1: candidatePlayedTop,
      entered_top1: enteredTop,
      left_top1: leftTopCount,
      remained_top1: remainedTop,
      remained_outside_top1: remainedOutsideTop,
      tie_aware_score_rank_delta: summarizeDeltas(playedScoreRankDeltas),
      synthesized_teacher_rank_delta: summarizeDeltas(playedSynthesizedRankDeltas),
      cp_delta: summarizeDeltas(playedCpDeltas),
      cp_sign_transitions: signTransitions,
      cp_sign_unchanged: signUnchanged,
      cp_sign_candidate_lower: signCandidateLower,
      cp_sign_candidate_higher: signCandidateHigher,
    },
    common_move_score_metadata: {
      common_moves: commonCandidateCount,
      score_kind_agreement: ratio(scoreKindAgreements, commonCandidateCount),
      both_cp: bothCp,
      both_mate: bothMate,
      cp_to_mate: cpToMate,
      mate_to_cp: mateToCpCount,
      both_mate_same_sign: bothMateSameSign,
      both_mate_sign_changed: bothMateSignChanged,
      exact_mate_metadata_agreement: ratio(exactMateMetadataAgreements, bothMate),
    },
    common_move_cp_deltas: summarizeDeltas(commonMoveCpDeltas),
    common_move_both_cp_deltas: summarizeAbsoluteDeltas(commonMoveBothCpDeltas),
    pair_order: {
      min_teacher_delta_cp: minimumDelta,
      parents_with_common_pairs: parentsWithPairs,
      common_move_pairs: commonPairs,
      relation_agreement: ratio(pairAgreements, commonPairs),
      strict_agreement: strictPairAgreements,
      both_ties: bothPairTies,
      reversals: pairReversals,
      baseline_decisive_candidate_tie: baselineDecisiveCandidateTie,
      baseline_tie_candidate_decisive: baselineTieCandidateDecisive,
      both_decisive_pairs: strictPairAgreements + pairReversals,
      both_decisive_agreement: ratio(
        strictPairAgreements,
        strictPairAgreements + pairReversals
      ),
      both_decisive_reversal_rate: ratio(
        pairReversals,
        strictPairAgreements + pairReversals
      ),
      all_pair_reversal_rate: ratio(pairReversals, commonPairs),
      baseline_decisive_pairs:
        strictPairAgreements + pairReversals + baselineDecisiveCandidateTie,
      baseline_decisive_retention: ratio(
        strictPairAgreements + pairReversals,
        strictPairAgreements + pairReversals + baselineDecisiveCandidateTie
      ),
    },
  };
}

interface CliOptions extends CompareSiblingTeachersOptions {
  help: boolean;
  json?: string;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true, baseline: '', candidate: '' };
  }
  const allowed = new Set(['baseline', 'candidate', 'min-teacher-delta-cp', 'json']);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!allowed.has(name)) throw new Error(`unknown option: --${name}`);
    if (values.has(name)) throw new Error(`duplicate option: --${name}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    values.set(name, value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };
  const threshold = values.get('min-teacher-delta-cp');
  return {
    help: false,
    baseline: required('baseline'),
    candidate: required('candidate'),
    minTeacherDeltaCp: threshold === undefined ? undefined : Number(threshold),
    json: values.get('json'),
  };
}

const USAGE = `Usage:
  node -r tsx/cjs ml/compare-sibling-teachers.ts \\
    --baseline <shallower-work.jsonl> --candidate <deeper-work.jsonl> \\
    [--min-teacher-delta-cp 20] [--json <report.json>]

The deterministic JSON report is written to stdout.  --json writes the same
report to a file.  It compares teacher-label stability, not playing strength.
`;

interface FileIdentity {
  realpath: string;
  device: number;
  inode: number;
}

async function fileIdentity(filePath: string): Promise<FileIdentity> {
  const realpath = await fs.promises.realpath(path.resolve(filePath));
  const stat = await fs.promises.stat(realpath);
  return { realpath, device: stat.dev, inode: stat.ino };
}

async function writeJsonOutput(filePath: string, contents: string, inputs: readonly string[]): Promise<void> {
  const requested = path.resolve(filePath);
  await fs.promises.mkdir(path.dirname(requested), { recursive: true });
  // Resolve the parent, not the final component: rename(2) replaces a final
  // symlink itself, while a symlinked parent changes the directory entry that
  // would be replaced. Pinning the real parent preserves those semantics.
  const realParent = await fs.promises.realpath(path.dirname(requested));
  const target = path.join(realParent, path.basename(requested));
  const inputIdentities = await Promise.all(inputs.map(fileIdentity));
  if (inputIdentities.some((input) => input.realpath === target)) {
    throw new Error('--json must not overwrite a work input');
  }
  try {
    const targetIdentity = await fileIdentity(target);
    if (
      inputIdentities.some(
        (input) =>
          input.realpath === targetIdentity.realpath ||
          (input.device === targetIdentity.device && input.inode === targetIdentity.inode)
      )
    ) {
      throw new Error('--json must not overwrite a work input');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = path.join(
    realParent,
    `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  try {
    await fs.promises.writeFile(temporary, contents, { flag: 'wx' });
    await fs.promises.rename(temporary, target);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  const report = await compareSiblingTeacherWorkFiles(args);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.json) await writeJsonOutput(args.json, json, [args.baseline, args.candidate]);
  process.stdout.write(json);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
