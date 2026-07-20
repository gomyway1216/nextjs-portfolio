/**
 * Deterministic strong-game sibling-label generator.
 *
 * A MultiPV search proposes candidates and the played move is added if needed.
 * Every candidate is then searched independently after a full search-state reset with
 * MultiPV=1 and exactly one `searchmoves` move. Independent scores are ranked
 * by cp descending with a bytewise move tie-break.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  SIBLING_MANIFEST_SCHEMA,
  buildSiblingGroup,
  positionKeyFromSfen,
  splitSiblingDataset,
  validateParentGroups,
  type SiblingRecord,
} from './sibling-data';
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingInputBinding,
  type FloodgateTrainingParent,
} from './floodgate-training-row-consumer';
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from './floodgate-role-bundle';
import { floodgateIdentifierDigest } from './floodgate-roles';
import { childSfenAfterUsi, positionFromSfen, rulesCompleteLegalMoves } from './shogi-sfen';
import {
  verifyPipelineOutputPaths,
  verifyPipelineRevision,
  type PipelineProvenance,
} from './pipeline-revision';
import {
  USI_TEACHER_ENGINE_CONTRACT,
  UsiSearchTimeoutError,
  UsiTeacherEngine,
} from './usi-engine';
import {
  MAX_NON_MATE_CP,
  mateToCp,
  type UsiMultiPvResult,
  type UsiSearchLimit,
} from './usi-multipv';

export const SIBLING_TEACHER_MANIFEST_SCHEMA = 'shogi-sibling-teacher-manifest-v2' as const;
export const SIBLING_TEACHER_WORK_SCHEMA = 'shogi-sibling-teacher-work-v2' as const;
export const TEACHER_ENGINE_RECEIPT_SCHEMA = 'shogi-teacher-engine-receipt-v1' as const;
export const STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA =
  'shogi-strength-first-sibling-teacher-manifest-v1' as const;
export const STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA =
  'shogi-strength-first-sibling-teacher-result-v1' as const;
export const STRENGTH_FIRST_PARENT_COMPLETION_RECORD_SCHEMA =
  'shogi-floodgate-fresh-qat-parent-completion-v2' as const;
export const STRENGTH_FIRST_PARENT_COMPLETION_FORMAT =
  'shogi-floodgate-fresh-qat-parent-completion-jsonl-v2' as const;
export const STRENGTH_FIRST_TRAIN_FORMAT =
  'canonical-shogi-sibling-v1-jsonl-one-lf-per-row' as const;
export const STRENGTH_FIRST_PRODUCTION_PARENT_TARGETS = Object.freeze([100, 500, 24_000] as const);
export const STRENGTH_FIRST_PRODUCTION_ENGINES = 12 as const;
export const STRENGTH_FIRST_TIMEOUT_SKIP_DIVISOR = 1_000 as const;
export const STRENGTH_FIRST_TIMEOUT_SKIP_REASON = 'search-timeout-no-label' as const;
export const SIBLING_TEACHER_LABEL_POLICY =
  'initial-multipv-plus-played-independent-single-move-rescore-final-mate-v7-timeout-quarantine' as const;
export const INDEPENDENT_EXACT_RESCORE_MODE = 'independent-single-move' as const;
const PRIVATE_WORKER_CWD_ENVIRONMENT_TOKEN = '<private-worker-cwd>' as const;

export function strengthFirstTimeoutSkipLimit(targetParents: number): number {
  if (!Number.isSafeInteger(targetParents) || targetParents <= 0) {
    throw new Error('timeout-skip target must be a positive safe integer');
  }
  return Math.ceil(targetParents / STRENGTH_FIRST_TIMEOUT_SKIP_DIVISOR);
}

export const SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT = Object.freeze({
  inherited_environment: false,
  darwin_spawn_injected_variables: Object.freeze(['__CF_USER_TEXT_ENCODING'] as const),
  variables: Object.freeze({
    HOME: PRIVATE_WORKER_CWD_ENVIRONMENT_TOKEN,
    TMPDIR: PRIVATE_WORKER_CWD_ENVIRONMENT_TOKEN,
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    OMP_NUM_THREADS: '1',
    OMP_THREAD_LIMIT: '1',
    OPENBLAS_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
    VECLIB_MAXIMUM_THREADS: '1',
    NUMEXPR_NUM_THREADS: '1',
    BLIS_NUM_THREADS: '1',
  }),
} as const);
export const SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT = {
  engine_binary: true,
  engine_argument_files: 'snapshotted-and-substituted',
  eval_tree: 'snapshotted',
  eval_options_file: 'rejected',
  private_working_directory: true,
} as const;

type RawParentOccurrence = FloodgateTrainingParent;

export const SIBLING_TEACHER_STAGE_FILENAMES = Object.freeze({
  train: 'train.jsonl',
  val: 'val.jsonl',
  manifest: 'manifest.json',
  work: 'work.jsonl',
  parentCompletion: 'parent-completion.jsonl',
  stagedResult: 'staged-result.json',
} as const);

export interface SiblingTeacherStagePaths {
  readonly root: string;
  readonly train: string;
  readonly val: string;
  readonly manifest: string;
  readonly work: string;
  readonly parentCompletion: string;
  readonly stagedResult: string;
}

export function siblingTeacherStagePaths(stageRoot: string): Readonly<SiblingTeacherStagePaths> {
  const root = path.resolve(requiredText(stageRoot, 'stageRoot'));
  return Object.freeze({
    root,
    train: path.join(root, SIBLING_TEACHER_STAGE_FILENAMES.train),
    val: path.join(root, SIBLING_TEACHER_STAGE_FILENAMES.val),
    manifest: path.join(root, SIBLING_TEACHER_STAGE_FILENAMES.manifest),
    work: path.join(root, SIBLING_TEACHER_STAGE_FILENAMES.work),
    parentCompletion: path.join(root, SIBLING_TEACHER_STAGE_FILENAMES.parentCompletion),
    stagedResult: path.join(root, SIBLING_TEACHER_STAGE_FILENAMES.stagedResult),
  });
}

export interface StageSiblingTeacherCoreForTestsOptions {
  stageRoot: string;
  runnerRevision: string;
  engineBin: string;
  engineArgs?: readonly string[];
  engineReceipt: string;
  evalDir?: string;
  multipv?: number;
  nodes?: number;
  depth?: number;
  engines?: number;
  seed?: string | number;
  valRatio?: number;
  fvScale?: number;
  hashMb?: number;
  timeoutMs?: number;
  testOnlyEngineInitializationTimeoutMs?: number;
}

interface NormalizedOptions {
  stageRoot: string;
  engineBin: string;
  runnerRevision: string;
  engineArgs: readonly string[];
  engineReceipt: string;
  evalDir?: string;
  multipv: number;
  limit: UsiSearchLimit;
  engines: number;
  seed: string;
  valRatio: number;
  outTrain: string;
  outVal: string;
  manifest: string;
  work: string;
  parentCompletion: string;
  stagedResult: string;
  fvScale: number;
  hashMb: number;
  timeoutMs: number;
  testOnlyEngineInitializationTimeoutMs?: number;
}

interface FileDigest {
  path: string;
  bytes: number;
  sha256: string;
}

interface SearchScoreMetadata {
  move: string;
  cp: number;
  score_kind: 'cp' | 'mate';
  mate?: number;
  mate_sign?: 1 | -1;
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

interface IndependentExactSearchMetadata {
  mode: typeof INDEPENDENT_EXACT_RESCORE_MODE;
  candidate_count: number;
  synthesized_rank1_move: string;
  /** Ranked by cp descending, then UTF-8 bytes ascending. */
  moves: string[];
  scores: SearchScoreMetadata[];
  /** One MultiPV=1 search per candidate in canonical bytewise order. */
  searches: SearchMetadata[];
  total_observed_nodes: number;
}

interface WorkHeader {
  schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
  kind: 'header';
  run_fingerprint: string;
  source_raw_sha256: string;
  selected_parent_ids_sha256: string;
  label_policy: typeof SIBLING_TEACHER_LABEL_POLICY;
  pipeline: PipelineProvenance;
}

interface CompletedWorkEntry {
  schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
  kind: 'parent';
  run_fingerprint: string;
  payload_sha256: string;
  parent_id: string;
  candidate_set_sha256: string;
  candidate_moves: string[];
  initial_search: SearchMetadata;
  exact_search: IndependentExactSearchMetadata;
  records: SiblingRecord[];
}

interface ForcedLegalMoveSkippedWorkEntry {
  schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
  kind: 'skip';
  run_fingerprint: string;
  payload_sha256: string;
  parent_id: string;
  reason: 'fewer-than-two-legal-moves';
  legal_moves: number;
}

interface SearchTimeoutSkippedWorkEntry {
  schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
  kind: 'skip';
  run_fingerprint: string;
  payload_sha256: string;
  parent_id: string;
  reason: typeof STRENGTH_FIRST_TIMEOUT_SKIP_REASON;
  legal_moves: number;
  timeout: Readonly<{
    phase: 'proposal' | 'independent-rescore';
    requested_multipv: number;
    requested_limit: { nodes: number } | { depth: number };
    searchmoves: readonly [] | readonly [string];
    timeout_ms: number;
  }>;
}

type SkippedWorkEntry = ForcedLegalMoveSkippedWorkEntry | SearchTimeoutSkippedWorkEntry;
type WorkEntry = CompletedWorkEntry | SkippedWorkEntry;

export interface SiblingTeacherManifest {
  schema: typeof SIBLING_TEACHER_MANIFEST_SCHEMA;
  record_manifest_schema: typeof SIBLING_MANIFEST_SCHEMA;
  pipeline: PipelineProvenance;
  source: {
    raw_sha256: string;
    raw_records: number;
    selected_parents: number;
    selected_parent_ids_sha256: string;
  };
  teacher: {
    engine_bin_sha256: string;
    engine_bin_bytes: number;
    engine_args: string[];
    engine_arg_files: FileDigest[];
    engine_receipt: {
      file: FileDigest;
      content: Record<string, unknown>;
    };
    eval_sha256: string | null;
    eval_files: FileDigest[];
    runtime_snapshot: typeof SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT & {
      engine_argument_file_count: number;
      eval_tree_present: boolean;
    };
  };
  search: {
    multipv: number;
    limit: { nodes: number } | { depth: number };
    parallel_engines: number;
    fv_scale: number;
    hash_mb_per_engine: number;
    timeout_ms: number;
    exact_rescore_mode: typeof INDEPENDENT_EXACT_RESCORE_MODE;
    label_policy: typeof SIBLING_TEACHER_LABEL_POLICY;
    tt_reset_before_proposal: true;
    tt_reset_before_each_candidate: true;
    search_state_reset_before_proposal: 'isready';
    search_state_reset_before_each_candidate: 'isready';
    candidate_execution_order: 'utf8-bytewise-ascending';
    synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move';
    engine_options: typeof USI_TEACHER_ENGINE_CONTRACT;
  };
  candidate_sets: {
    sha256: string;
    parents: number;
    candidates: number;
    min_candidates: number;
    max_candidates: number;
    skipped_parents: number;
  };
  progress_checkpoint: {
    schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    run_fingerprint: string;
    entries: number;
    completed_parents: number;
    skipped_parents: number;
    sha256: string;
  };
  split: ReturnType<typeof splitSiblingDataset>['manifest'];
  outputs: {
    train_sha256: string;
    val_sha256: string;
    train_bytes: number;
    val_bytes: number;
  };
}

export type StrengthFirstProductionParentTarget =
  (typeof STRENGTH_FIRST_PRODUCTION_PARENT_TARGETS)[number];

interface StrengthFirstFileBinding {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface StrengthFirstForcedSkipReasonCounts {
  readonly fewer_than_two_legal_moves: number;
  readonly search_timeout_no_label: number;
}

function forcedSkipReasonCounts(
  entries: Iterable<WorkEntry>
): Readonly<StrengthFirstForcedSkipReasonCounts> {
  let fewerThanTwoLegalMoves = 0;
  let searchTimeoutNoLabel = 0;
  for (const entry of entries) {
    if (entry.kind !== 'skip') continue;
    if (entry.reason === 'fewer-than-two-legal-moves') {
      fewerThanTwoLegalMoves += 1;
    } else {
      searchTimeoutNoLabel += 1;
    }
  }
  return Object.freeze({
    fewer_than_two_legal_moves: fewerThanTwoLegalMoves,
    search_timeout_no_label: searchTimeoutNoLabel,
  });
}

export interface StrengthFirstParentCompletionBinding extends StrengthFirstFileBinding {
  readonly format: typeof STRENGTH_FIRST_PARENT_COMPLETION_FORMAT;
  readonly records: number;
  readonly forced_parents_skipped: number;
  readonly emitted_parent_groups: number;
  readonly parent_ids_sha256: string;
  readonly forced_parent_ids_sha256: string;
  readonly emitted_parent_ids_sha256: string;
}

export interface StrengthFirstTrainBinding extends StrengthFirstFileBinding {
  readonly format: typeof STRENGTH_FIRST_TRAIN_FORMAT;
  readonly records: number;
  readonly parents: number;
  readonly games: number;
  readonly game_ids_sha256: string;
  readonly parent_ids_sha256: string;
  readonly semantic_position_ids_count: number;
  readonly semantic_position_ids_sha256: string;
}

export interface StrengthFirstSiblingTeacherManifest {
  readonly schema: typeof STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA;
  readonly status: 'complete-training-only';
  readonly run_fingerprint: string;
  readonly pipeline: PipelineProvenance;
  readonly authenticated_input: Readonly<{
    readonly bundle_verifier_revision: string;
    readonly binding: Readonly<FloodgateTrainingInputBinding>;
  }>;
  readonly source: Readonly<{
    readonly raw_sha256: string;
    readonly raw_records: number;
    readonly selected_parents: number;
    readonly selected_parent_ids_sha256: string;
  }>;
  readonly teacher: SiblingTeacherManifest['teacher'] &
    Readonly<{
      readonly engine_environment: typeof SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT;
    }>;
  readonly search: SiblingTeacherManifest['search'];
  readonly candidate_sets: SiblingTeacherManifest['candidate_sets'];
  readonly progress_checkpoint: SiblingTeacherManifest['progress_checkpoint'] & {
    readonly entries: number;
  };
  readonly forced_skip_reasons: StrengthFirstForcedSkipReasonCounts;
  readonly parent_completion: StrengthFirstParentCompletionBinding;
  readonly outputs: Readonly<{
    readonly train: StrengthFirstTrainBinding;
  }>;
  readonly publication: Readonly<{
    readonly staged_inside_authenticated_callback: true;
    readonly consumer_postflight_bound: false;
  }>;
}

export interface StrengthFirstSiblingTeacherResult {
  readonly schema: typeof STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA;
  readonly status: 'complete-training-only';
  readonly run_fingerprint: string;
  readonly runner_revision: string;
  readonly bundle_verifier_revision: string;
  readonly input_parents: number;
  readonly completed_parents: number;
  readonly forced_parents_skipped: number;
  readonly forced_skip_reasons: StrengthFirstForcedSkipReasonCounts;
  readonly emitted_parent_groups: number;
  readonly work: StrengthFirstFileBinding & {
    readonly schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    readonly records: number;
  };
  readonly train: StrengthFirstTrainBinding;
  readonly parent_completion: StrengthFirstParentCompletionBinding;
  readonly manifest: StrengthFirstFileBinding & {
    readonly schema: typeof STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA;
  };
  readonly publication: Readonly<{
    readonly staged_inside_authenticated_callback: true;
    readonly consumer_postflight_bound: false;
  }>;
}

export interface StrengthFirstSiblingTeacherPrefixProgress {
  readonly status: 'local-work-prefix-complete-not-an-authentication-receipt';
  readonly authentication_receipt: false;
  readonly target_parents: 100 | 500;
  readonly completed_parents: 100 | 500;
  readonly run_fingerprint: string;
  readonly forced_parents_skipped: number;
  readonly forced_skip_reasons: StrengthFirstForcedSkipReasonCounts;
  readonly emitted_parent_groups: number;
  readonly work: StrengthFirstFileBinding & {
    readonly schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    readonly records: number;
    readonly binding_scope: 'canonical-target-prefix-projection';
  };
  readonly current_work: StrengthFirstFileBinding & {
    readonly schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    readonly records: number;
  };
}

export type StrengthFirstSiblingTeacherAdvance =
  | StrengthFirstSiblingTeacherPrefixProgress
  | Readonly<{
      readonly status: 'complete-training-only';
      readonly authentication_receipt: false;
      readonly target_parents: 24_000;
      readonly completed_parents: 24_000;
      readonly run_fingerprint: string;
      readonly manifest: StrengthFirstSiblingTeacherManifest;
      readonly staged_result: StrengthFirstSiblingTeacherResult;
    }>;

export interface StrengthFirstSiblingTeacherOptions extends Omit<
  StageSiblingTeacherCoreForTestsOptions,
  'engines' | 'seed' | 'testOnlyEngineInitializationTimeoutMs' | 'valRatio'
> {
  readonly targetParents: StrengthFirstProductionParentTarget;
}

export interface GenerateSiblingTeacherDependencies {
  verifyRevision?: (revision: string) => Promise<PipelineProvenance>;
  verifyOutputPaths?: (
    outputPaths: readonly string[],
    inputPaths: readonly string[]
  ) => Promise<void>;
}

function sha256(input: string | Uint8Array): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function sha256File(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    const data = chunk as Buffer;
    bytes += data.byteLength;
    hash.update(data);
  }
  return { bytes, sha256: hash.digest('hex') };
}

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

function siblingTeacherEngineEnvironment(workerCwd: string): NodeJS.ProcessEnv {
  const privateWorkerCwd = fs.realpathSync.native(workerCwd);
  const environment = Object.freeze(
    Object.fromEntries(
      Object.entries(SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT.variables).map(([name, value]) => [
        name,
        value === PRIVATE_WORKER_CWD_ENVIRONMENT_TOKEN ? privateWorkerCwd : value,
      ])
    )
  );
  // The web app augments ProcessEnv with required deployment keys. This
  // deliberately hermetic engine environment omits all of them.
  return environment as unknown as NodeJS.ProcessEnv;
}

function workEntryPayloadSha256(entry: WorkEntry): string {
  const payload = { ...entry } as Record<string, unknown>;
  delete payload.payload_sha256;
  return sha256(canonicalJson(payload));
}

function sealWorkEntry(value: Record<string, unknown>): WorkEntry {
  const entry = { ...value, payload_sha256: '' } as WorkEntry;
  entry.payload_sha256 = workEntryPayloadSha256(entry);
  return entry;
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${name} must not be empty`);
  return value.trim();
}

function validateEngineReceipt(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('engine receipt must contain a JSON object');
  }
  const receipt = value as Record<string, unknown>;
  const expectedKeys = [
    'binary_bytes',
    'binary_sha256',
    'build_command',
    'build_directory',
    'compiler',
    'compiler_target',
    'engine_id',
    'schema',
    'source_commit',
    'source_commit_date',
    'source_repository',
  ];
  const actualKeys = Object.keys(receipt).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key, index) => key !== actualKeys[index])
  ) {
    throw new Error('engine receipt must contain exactly the v1 keys');
  }
  if (receipt.schema !== TEACHER_ENGINE_RECEIPT_SCHEMA) {
    throw new Error(`engine receipt schema must be ${TEACHER_ENGINE_RECEIPT_SCHEMA}`);
  }
  for (const field of [
    'source_repository',
    'source_commit_date',
    'build_directory',
    'build_command',
    'compiler',
    'compiler_target',
    'engine_id',
  ]) {
    const canonical = requiredText(receipt[field], `engine receipt ${field}`);
    if (receipt[field] !== canonical) {
      throw new Error(`engine receipt ${field} must not have surrounding whitespace`);
    }
  }
  const repository = receipt.source_repository as string;
  try {
    const url = new URL(repository);
    if (url.protocol !== 'https:' || !url.hostname) throw new Error('not HTTPS');
  } catch {
    throw new Error('engine receipt source_repository must be an absolute HTTPS URL');
  }
  if (typeof receipt.source_commit !== 'string' || !/^[0-9a-f]{40}$/.test(receipt.source_commit)) {
    throw new Error('engine receipt source_commit must be a lowercase 40-digit Git commit');
  }
  if (
    typeof receipt.source_commit_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      receipt.source_commit_date
    ) ||
    !Number.isFinite(Date.parse(receipt.source_commit_date))
  ) {
    throw new Error(
      'engine receipt source_commit_date must be an ISO-8601 timestamp with timezone'
    );
  }
  if (!Number.isSafeInteger(receipt.binary_bytes) || (receipt.binary_bytes as number) <= 0) {
    throw new Error('engine receipt binary_bytes must be a positive safe integer');
  }
  if (typeof receipt.binary_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.binary_sha256)) {
    throw new Error('engine receipt binary_sha256 must be a lowercase SHA-256 digest');
  }
  return {
    schema: receipt.schema,
    source_repository: receipt.source_repository,
    source_commit: receipt.source_commit,
    source_commit_date: receipt.source_commit_date,
    build_directory: receipt.build_directory,
    build_command: receipt.build_command,
    compiler: receipt.compiler,
    compiler_target: receipt.compiler_target,
    engine_id: receipt.engine_id,
    binary_bytes: receipt.binary_bytes,
    binary_sha256: receipt.binary_sha256,
  };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer (got ${value})`);
  }
  return value;
}

function normalizeOptions(options: StageSiblingTeacherCoreForTestsOptions): NormalizedOptions {
  const hasNodes = options.nodes !== undefined;
  const hasDepth = options.depth !== undefined;
  if (hasNodes === hasDepth) throw new Error('exactly one of nodes or depth must be specified');
  const valRatio = options.valRatio ?? 0.1;
  if (!(valRatio > 0 && valRatio < 1)) {
    throw new Error(`valRatio must be between 0 and 1 (got ${valRatio})`);
  }
  const stage = siblingTeacherStagePaths(options.stageRoot);
  const normalized: NormalizedOptions = {
    stageRoot: stage.root,
    engineBin: path.resolve(requiredText(options.engineBin, 'engineBin')),
    runnerRevision: requiredText(options.runnerRevision, 'runnerRevision'),
    engineArgs: [...(options.engineArgs ?? [])],
    engineReceipt: path.resolve(requiredText(options.engineReceipt, 'engineReceipt')),
    multipv: positiveInteger(options.multipv ?? 12, 'multipv'),
    limit: hasNodes
      ? { nodes: positiveInteger(options.nodes as number, 'nodes') }
      : { depth: positiveInteger(options.depth as number, 'depth') },
    engines: positiveInteger(options.engines ?? 1, 'engines'),
    seed: String(options.seed ?? '42'),
    valRatio,
    outTrain: stage.train,
    outVal: stage.val,
    manifest: stage.manifest,
    work: stage.work,
    parentCompletion: stage.parentCompletion,
    stagedResult: stage.stagedResult,
    fvScale: positiveInteger(options.fvScale ?? 20, 'fvScale'),
    hashMb: positiveInteger(options.hashMb ?? 128, 'hashMb'),
    timeoutMs: positiveInteger(options.timeoutMs ?? 120_000, 'timeoutMs'),
  };
  if (options.evalDir) normalized.evalDir = path.resolve(options.evalDir);
  if (options.testOnlyEngineInitializationTimeoutMs !== undefined) {
    normalized.testOnlyEngineInitializationTimeoutMs = positiveInteger(
      options.testOnlyEngineInitializationTimeoutMs,
      'testOnlyEngineInitializationTimeoutMs'
    );
  }
  if (!/^[0-9a-f]{40}$/.test(normalized.runnerRevision)) {
    throw new Error('runnerRevision must be a lowercase 40-digit Git commit');
  }

  const outputPaths = [
    normalized.outTrain,
    normalized.outVal,
    normalized.manifest,
    normalized.work,
    normalized.parentCompletion,
    normalized.stagedResult,
  ];
  if (new Set(outputPaths).size !== outputPaths.length) {
    throw new Error(
      'train, val, manifest, work, parent-completion, and result output paths must all be different'
    );
  }
  const inputPaths = [normalized.engineBin, normalized.engineReceipt];
  if (outputPaths.some((output) => inputPaths.includes(output))) {
    throw new Error('stage outputs must not overwrite engineBin or engineReceipt inputs');
  }
  return normalized;
}

function validateRawParent(value: unknown, line: number): RawParentOccurrence {
  if (!value || typeof value !== 'object') throw new Error(`raw line ${line} must be an object`);
  const row = value as Partial<RawParentOccurrence>;
  if (row.schema_version !== 1) throw new Error(`raw line ${line} has unsupported schema_version`);
  const gameId = requiredText(row.game_id, `raw line ${line} game_id`);
  const parentId = requiredText(row.parent_id, `raw line ${line} parent_id`);
  const parentSfen = requiredText(row.parent_sfen, `raw line ${line} parent_sfen`)
    .split(/\s+/)
    .join(' ');
  const positionId = requiredText(row.position_id, `raw line ${line} position_id`);
  if (positionId !== positionKeyFromSfen(parentSfen)) {
    throw new Error(`raw line ${line} position_id does not match parent_sfen`);
  }
  if (!Number.isSafeInteger(row.ply) || (row.ply as number) < 0) {
    throw new Error(`raw line ${line} ply must be a non-negative safe integer`);
  }
  return {
    schema_version: 1,
    game_id: gameId,
    parent_id: parentId,
    position_id: positionId,
    parent_sfen: parentSfen,
    ply: row.ply as number,
    played_move: requiredText(row.played_move, `raw line ${line} played_move`),
  };
}

interface CapturedTeacherInput {
  readonly binding: Readonly<FloodgateTrainingInputBinding>;
  readonly parents: readonly RawParentOccurrence[];
}

function captureAuthenticatedTeacherInput(
  input: Readonly<AuthenticatedFloodgateTrainingRows>
): Readonly<CapturedTeacherInput> {
  if (!input || typeof input !== 'object') {
    throw new Error('authenticated training input must be an object');
  }
  if (input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA || input.role !== 'training') {
    throw new Error('authenticated training input schema or role is invalid');
  }
  const source = input.binding;
  if (!source || typeof source !== 'object') {
    throw new Error('authenticated training input binding must be an object');
  }
  const positiveBindingInteger = (value: unknown, name: string): number => {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new Error(`authenticated training binding ${name} must be a positive safe integer`);
    }
    return value as number;
  };
  const digest = (value: unknown, name: string): string => {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
      throw new Error(`authenticated training binding ${name} must be a lowercase SHA-256`);
    }
    return value;
  };
  const revision = (value: unknown, name: string): string => {
    if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
      throw new Error(`authenticated training binding ${name} must be a lowercase revision`);
    }
    return value;
  };
  if (source.raw_format !== FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT) {
    throw new Error('authenticated training binding raw_format is unsupported');
  }
  const binding: FloodgateTrainingInputBinding = Object.freeze({
    result_receipt_bytes: positiveBindingInteger(
      source.result_receipt_bytes,
      'result_receipt_bytes'
    ),
    result_receipt_sha256: digest(source.result_receipt_sha256, 'result_receipt_sha256'),
    bundle_manifest_bytes: positiveBindingInteger(
      source.bundle_manifest_bytes,
      'bundle_manifest_bytes'
    ),
    bundle_manifest_sha256: digest(source.bundle_manifest_sha256, 'bundle_manifest_sha256'),
    bundle_producer_revision: revision(source.bundle_producer_revision, 'bundle_producer_revision'),
    verifier_revision: revision(source.verifier_revision, 'verifier_revision'),
    raw_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    raw_bytes: positiveBindingInteger(source.raw_bytes, 'raw_bytes'),
    raw_sha256: digest(source.raw_sha256, 'raw_sha256'),
    records: positiveBindingInteger(source.records, 'records'),
    games: positiveBindingInteger(source.games, 'games'),
    game_ids_sha256: digest(source.game_ids_sha256, 'game_ids_sha256'),
    parent_ids_sha256: digest(source.parent_ids_sha256, 'parent_ids_sha256'),
    position_ids_count: positiveBindingInteger(source.position_ids_count, 'position_ids_count'),
    position_ids_sha256: digest(source.position_ids_sha256, 'position_ids_sha256'),
  });
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error('authenticated training rows must be a non-empty array');
  }
  const parents = input.rows.map((row, index) => validateRawParent(row, index + 1));
  const gameIds = new Set<string>();
  const parentIds = new Set<string>();
  const positionIds = new Set<string>();
  let previousParentId: string | undefined;
  for (const parent of parents) {
    if (
      previousParentId !== undefined &&
      compareBytewise(previousParentId, parent.parent_id) >= 0
    ) {
      throw new Error('authenticated training rows are not in strict parent_id byte order');
    }
    previousParentId = parent.parent_id;
    if (positionIds.has(parent.position_id)) {
      throw new Error(`duplicate authenticated position_id: ${parent.position_id}`);
    }
    gameIds.add(parent.game_id);
    parentIds.add(parent.parent_id);
    positionIds.add(parent.position_id);
  }
  if (
    parents.length !== binding.records ||
    gameIds.size !== binding.games ||
    parentIds.size !== binding.records ||
    positionIds.size !== binding.position_ids_count ||
    floodgateIdentifierDigest(gameIds) !== binding.game_ids_sha256 ||
    floodgateIdentifierDigest(parentIds) !== binding.parent_ids_sha256 ||
    floodgateIdentifierDigest(positionIds) !== binding.position_ids_sha256
  ) {
    throw new Error('authenticated training rows do not match their aggregate binding');
  }
  return Object.freeze({ binding, parents: Object.freeze(parents) });
}

async function collectDirectoryDigests(root: string): Promise<FileDigest[]> {
  const rootStat = await fs.promises.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`evalDir is not a directory: ${root}`);
  const files: FileDigest[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await fs.promises.readdir(directory, {
      withFileTypes: true,
    });
    entries.sort((a, b) => compareBytewise(a.name, b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`evalDir contains a symbolic link: ${relative}`);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile()) {
        const digest = await sha256File(absolute);
        files.push({ path: relative, ...digest });
      } else {
        throw new Error(`evalDir contains an unsupported entry: ${relative}`);
      }
    }
  };
  await visit(root, '');
  if (files.length === 0) throw new Error(`evalDir contains no files: ${root}`);
  return files;
}

async function collectArgumentFileDigests(args: readonly string[]): Promise<FileDigest[]> {
  const files: FileDigest[] = [];
  for (const argument of args) {
    const absolute = path.resolve(argument);
    try {
      const stat = await fs.promises.stat(absolute);
      if (!stat.isFile()) continue;
      const digest = await sha256File(absolute);
      files.push({ path: argument, ...digest });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return files;
}

interface RuntimeSnapshot {
  root: string;
  engineBin: string;
  engineArgs: string[];
  cwd: string;
  evalDir?: string;
}

async function copyVerifiedFile(
  source: string,
  destination: string,
  expected: { bytes: number; sha256: string }
): Promise<void> {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_FICLONE);
  const copied = await sha256File(destination);
  if (copied.bytes !== expected.bytes || copied.sha256 !== expected.sha256) {
    throw new Error(`runtime snapshot changed while copying ${source}`);
  }
  const sourceMode = (await fs.promises.stat(source)).mode & 0o777;
  await fs.promises.chmod(destination, sourceMode & 0o555 || 0o400);
}

async function createRuntimeSnapshot(
  options: NormalizedOptions,
  engineDigest: { bytes: number; sha256: string },
  engineArgFiles: readonly FileDigest[],
  evalFiles: readonly FileDigest[]
): Promise<RuntimeSnapshot> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shogi-teacher-runtime-'));
  try {
    const engineBin = path.join(root, 'engine', path.basename(options.engineBin));
    await copyVerifiedFile(options.engineBin, engineBin, engineDigest);
    const cwd = path.join(root, 'cwd');
    await fs.promises.mkdir(cwd, { mode: 0o700 });

    const argumentDigests = new Map(
      engineArgFiles.map((file) => [path.resolve(file.path), file] as const)
    );
    const engineArgs = [...options.engineArgs];
    for (let index = 0; index < engineArgs.length; index++) {
      const absolute = path.resolve(engineArgs[index]);
      const digest = argumentDigests.get(absolute);
      if (!digest) continue;
      const destination = path.join(root, 'args', `${index}-${path.basename(absolute)}`);
      await copyVerifiedFile(absolute, destination, digest);
      engineArgs[index] = destination;
    }

    let evalDir: string | undefined;
    if (options.evalDir) {
      evalDir = path.join(root, 'eval');
      for (const file of evalFiles) {
        await copyVerifiedFile(
          path.join(options.evalDir, file.path),
          path.join(evalDir, ...file.path.split('/')),
          file
        );
      }
    }
    return {
      root,
      engineBin,
      engineArgs,
      cwd,
      ...(evalDir ? { evalDir } : {}),
    };
  } catch (error) {
    await fs.promises.rm(root, { recursive: true, force: true });
    throw error;
  }
}

function serializeJsonl(records: readonly SiblingRecord[]): string {
  return records.length === 0
    ? ''
    : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function serializeCanonicalJsonl(records: readonly unknown[]): string {
  return records.length === 0 ? '' : `${records.map(canonicalJson).join('\n')}\n`;
}

async function fileBinding(filePath: string): Promise<StrengthFirstFileBinding> {
  const identity = await sha256File(filePath);
  return {
    path: path.basename(filePath),
    bytes: identity.bytes,
    sha256: identity.sha256,
  };
}

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.promises.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  let temporaryHandle: fs.promises.FileHandle | undefined;
  try {
    temporaryHandle = await fs.promises.open(temporary, 'wx', 0o600);
    await temporaryHandle.writeFile(contents, 'utf8');
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await fs.promises.rename(temporary, filePath);
    if (process.platform !== 'win32') {
      const directoryHandle = await fs.promises.open(directory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    }
  } finally {
    if (temporaryHandle) {
      await temporaryHandle.close().catch(() => undefined);
    }
    await fs.promises.rm(temporary, { force: true });
  }
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

function normalizedSearchLimit(limit: UsiSearchLimit): { nodes: number } | { depth: number } {
  return limit.nodes !== undefined ? { nodes: limit.nodes } : { depth: limit.depth as number };
}

function searchMetadata(result: UsiMultiPvResult, limit: UsiSearchLimit): SearchMetadata {
  return {
    requested_multipv: result.lines.length,
    requested_limit: normalizedSearchLimit(limit),
    depth: result.depth,
    observed_nodes: result.observedNodes,
    bestmove: result.bestmove,
    moves: result.lines.map((line) => line.move),
    scores: result.lines.map((line) => ({
      move: line.move,
      cp: line.cp,
      score_kind: line.scoreKind,
      ...(line.scoreKind === 'mate'
        ? { mate: line.mate as number, mate_sign: line.mateSign as 1 | -1 }
        : {}),
    })),
  };
}

function compareRankedScores(left: SearchScoreMetadata, right: SearchScoreMetadata): number {
  return right.cp - left.cp || compareBytewise(left.move, right.move);
}

function sumObservedNodes(searches: readonly SearchMetadata[], label: string): number {
  const total = searches.reduce((sum, search) => sum + search.observed_nodes, 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error(`${label} total_observed_nodes exceeds the safe integer range`);
  }
  return total;
}

function validateSearchScore(value: unknown, label: string): SearchScoreMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${label} score metadata is missing`);
  const row = value as Partial<SearchScoreMetadata>;
  const move = requiredText(row.move, `${label} score move`);
  if (!Number.isSafeInteger(row.cp)) throw new Error(`${label} score cp must be an integer`);
  if (row.score_kind === 'mate') {
    if (!Number.isSafeInteger(row.mate) || (row.mate_sign !== 1 && row.mate_sign !== -1)) {
      throw new Error(`${label} has incomplete mate metadata`);
    }
    if (
      ((row.mate as number) > 0 && row.mate_sign !== 1) ||
      ((row.mate as number) < 0 && row.mate_sign !== -1)
    ) {
      throw new Error(`${label} has contradictory mate sign`);
    }
    if (row.cp !== mateToCp(row.mate as number, row.mate_sign)) {
      throw new Error(`${label} mate metadata does not match mapped cp`);
    }
  } else if (row.score_kind === 'cp') {
    if (Math.abs(row.cp as number) > MAX_NON_MATE_CP) {
      throw new Error(`${label} cp score enters the reserved mate band`);
    }
    if (row.mate !== undefined || row.mate_sign !== undefined) {
      throw new Error(`${label} cp score has mate metadata`);
    }
  } else {
    throw new Error(`${label} has invalid score kind`);
  }
  return {
    move,
    cp: row.cp as number,
    score_kind: row.score_kind,
    ...(row.score_kind === 'mate'
      ? { mate: row.mate as number, mate_sign: row.mate_sign as 1 | -1 }
      : {}),
  };
}

function validateSearchMetadata(
  value: unknown,
  label: string,
  allowTerminalMateBeforeRequestedDepth = false
): SearchMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${label} metadata is missing`);
  const row = value as Partial<SearchMetadata>;
  if (
    !Number.isSafeInteger(row.requested_multipv) ||
    (row.requested_multipv as number) <= 0 ||
    !Number.isSafeInteger(row.depth) ||
    (row.depth as number) <= 0 ||
    !Number.isSafeInteger(row.observed_nodes) ||
    (row.observed_nodes as number) < 0 ||
    !Array.isArray(row.moves) ||
    !Array.isArray(row.scores)
  ) {
    throw new Error(`${label} metadata has invalid numeric fields`);
  }
  const moves = row.moves.map((move) => requiredText(move, `${label} move`));
  if (moves.length !== row.requested_multipv || new Set(moves).size !== moves.length) {
    throw new Error(`${label} metadata has inconsistent MultiPV moves`);
  }
  const bestmove = requiredText(row.bestmove, `${label} bestmove`);
  if (bestmove !== moves[0]) throw new Error(`${label} bestmove does not match PV1`);
  const scores = row.scores.map((score, index) =>
    validateSearchScore(score, `${label} rank ${index + 1}`)
  );
  if (
    scores.length !== moves.length ||
    scores.some((score, index) => score.move !== moves[index])
  ) {
    throw new Error(`${label} scores do not match MultiPV moves`);
  }
  if (!row.requested_limit || typeof row.requested_limit !== 'object') {
    throw new Error(`${label} requested_limit is missing`);
  }
  const requestedLimit = row.requested_limit as UsiSearchLimit;
  const hasNodes = requestedLimit.nodes !== undefined;
  const hasDepth = requestedLimit.depth !== undefined;
  if (hasNodes === hasDepth) throw new Error(`${label} requested_limit must have one mode`);
  const requestedValue = hasNodes ? requestedLimit.nodes : requestedLimit.depth;
  if (!Number.isSafeInteger(requestedValue) || (requestedValue as number) <= 0) {
    throw new Error(`${label} requested_limit must be a positive safe integer`);
  }
  if (hasDepth) {
    if ((row.depth as number) > (requestedLimit.depth as number)) {
      throw new Error(`${label} completed beyond its requested depth`);
    }
    if ((row.depth as number) < (requestedLimit.depth as number)) {
      if (
        !allowTerminalMateBeforeRequestedDepth ||
        row.requested_multipv !== 1 ||
        scores.some((score) => score.score_kind !== 'mate')
      ) {
        throw new Error(`${label} ended before requested depth without a terminal mate`);
      }
    }
  }
  return {
    requested_multipv: row.requested_multipv as number,
    requested_limit: normalizedSearchLimit(requestedLimit),
    depth: row.depth as number,
    observed_nodes: row.observed_nodes as number,
    bestmove,
    moves,
    scores,
  };
}

function validateIndependentExactSearch(
  value: unknown,
  candidates: readonly string[],
  expectedLimit: { nodes: number } | { depth: number },
  label: string
): IndependentExactSearchMetadata {
  if (!value || typeof value !== 'object') throw new Error(`${label} metadata is missing`);
  const row = value as Partial<IndependentExactSearchMetadata>;
  if (row.mode !== INDEPENDENT_EXACT_RESCORE_MODE) {
    throw new Error(`${label} mode must be ${INDEPENDENT_EXACT_RESCORE_MODE}`);
  }
  if (!Number.isSafeInteger(row.candidate_count) || row.candidate_count !== candidates.length) {
    throw new Error(`${label} candidate_count does not match candidate_moves`);
  }
  if (!Array.isArray(row.moves) || !Array.isArray(row.scores) || !Array.isArray(row.searches)) {
    throw new Error(`${label} is missing ranked moves, scores, or searches`);
  }
  const moves = row.moves.map((move, index) => requiredText(move, `${label} move ${index + 1}`));
  const scores = row.scores.map((score, index) =>
    validateSearchScore(score, `${label} ranked score ${index + 1}`)
  );
  if (
    moves.length !== candidates.length ||
    new Set(moves).size !== moves.length ||
    scores.length !== moves.length ||
    scores.some((score, index) => score.move !== moves[index]) ||
    canonicalSortedMoves(moves).some((move, index) => move !== candidates[index])
  ) {
    throw new Error(`${label} ranked moves or scores do not match candidate_moves`);
  }
  const expectedRanked = [...scores].sort(compareRankedScores);
  if (expectedRanked.some((score, index) => score.move !== moves[index])) {
    throw new Error(`${label} rank order is not cp-descending with bytewise move tie-break`);
  }
  const synthesizedRank1Move = requiredText(
    row.synthesized_rank1_move,
    `${label} synthesized_rank1_move`
  );
  if (synthesizedRank1Move !== moves[0]) {
    throw new Error(`${label} synthesized_rank1_move does not match synthesized rank 1`);
  }

  const searches = row.searches.map((search, index) =>
    validateSearchMetadata(search, `${label} single search ${index + 1}`, true)
  );
  if (searches.length !== candidates.length) {
    throw new Error(`${label} searches length does not match candidate_count`);
  }
  for (let index = 0; index < searches.length; index++) {
    const search = searches[index];
    const candidate = candidates[index];
    if (
      search.requested_multipv !== 1 ||
      search.moves.length !== 1 ||
      search.scores.length !== 1 ||
      search.bestmove !== candidate ||
      search.moves[0] !== candidate ||
      search.scores[0].move !== candidate
    ) {
      throw new Error(`${label} single searches are not in canonical candidate order`);
    }
    if (canonicalJson(search.requested_limit) !== canonicalJson(expectedLimit)) {
      throw new Error(`${label} single search requested_limit differs from the proposal/run limit`);
    }
  }
  const totalObservedNodes = sumObservedNodes(searches, label);
  if (row.total_observed_nodes !== totalObservedNodes) {
    throw new Error(`${label} total_observed_nodes does not equal the single-search sum`);
  }
  const scoresByMove = new Map(searches.map((search) => [search.scores[0].move, search.scores[0]]));
  for (const score of scores) {
    const single = scoresByMove.get(score.move);
    if (
      !single ||
      score.cp !== single.cp ||
      score.score_kind !== single.score_kind ||
      score.mate !== single.mate ||
      score.mate_sign !== single.mate_sign
    ) {
      throw new Error(`${label} ranked score ${score.move} disagrees with its single search`);
    }
  }
  return {
    mode: INDEPENDENT_EXACT_RESCORE_MODE,
    candidate_count: candidates.length,
    synthesized_rank1_move: synthesizedRank1Move,
    moves,
    scores,
    searches,
    total_observed_nodes: totalObservedNodes,
  };
}

function legalMovesForParent(parent: RawParentOccurrence): string[] {
  const { position } = positionFromSfen(parent.parent_sfen);
  const moves = rulesCompleteLegalMoves(position).map((entry) => entry.usi);
  if (new Set(moves).size !== moves.length) {
    throw new Error(`legal move generator returned duplicates for parent ${parent.parent_id}`);
  }
  if (!moves.includes(parent.played_move)) {
    throw new Error(`played_move ${parent.played_move} is illegal for parent ${parent.parent_id}`);
  }
  return moves;
}

class SiblingTeacherSearchTimeoutError extends Error {
  readonly phase: 'proposal' | 'independent-rescore';
  readonly requestedMultipv: number;
  readonly requestedLimit: { nodes: number } | { depth: number };
  readonly searchmoves: readonly string[];
  readonly timeoutMs: number;

  constructor(
    cause: UsiSearchTimeoutError,
    phase: 'proposal' | 'independent-rescore',
    requestedMultipv: number,
    requestedLimit: UsiSearchLimit,
    searchmoves: readonly string[]
  ) {
    super(cause.message, { cause });
    this.name = 'SiblingTeacherSearchTimeoutError';
    this.phase = phase;
    this.requestedMultipv = requestedMultipv;
    this.requestedLimit = normalizedSearchLimit(requestedLimit);
    this.searchmoves = Object.freeze([...searchmoves]);
    this.timeoutMs = cause.timeoutMs;
  }
}

async function searchWithTimeoutContext(
  engine: UsiTeacherEngine,
  parent: RawParentOccurrence,
  multipv: number,
  limit: UsiSearchLimit,
  searchmoves: readonly string[],
  phase: 'proposal' | 'independent-rescore'
): Promise<UsiMultiPvResult> {
  try {
    return await engine.search(parent.parent_sfen, multipv, limit, searchmoves);
  } catch (error) {
    if (error instanceof UsiSearchTimeoutError) {
      throw new SiblingTeacherSearchTimeoutError(
        error,
        phase,
        multipv,
        limit,
        searchmoves
      );
    }
    throw error;
  }
}

/** Label one parent with a proposal search and independent single-move re-searches. */
export async function labelSiblingParent(
  engine: UsiTeacherEngine,
  parent: RawParentOccurrence,
  multipv: number,
  limit: UsiSearchLimit,
  legalMoves = legalMovesForParent(parent)
): Promise<CompletedWorkEntry> {
  if (legalMoves.length < 2) {
    throw new Error(`parent ${parent.parent_id} has fewer than two legal moves`);
  }
  // Rebuild all pinned-engine search state before the proposal so results are
  // independent of worker assignment and resume history.
  await engine.resetForParent();
  const initialMultiPv = Math.min(multipv, legalMoves.length);
  const initial = await searchWithTimeoutContext(
    engine,
    parent,
    initialMultiPv,
    limit,
    [],
    'proposal'
  );
  const initialMoves = initial.lines.map((line) => line.move);
  const legalMoveSet = new Set(legalMoves);
  for (const move of initialMoves) {
    if (!legalMoveSet.has(move)) {
      throw new Error(
        `teacher returned illegal initial move ${move} for parent ${parent.parent_id}`
      );
    }
  }

  const candidateSet = new Set(initialMoves);
  candidateSet.add(parent.played_move);
  if (
    candidateSet.size !==
    initialMoves.length + (initialMoves.includes(parent.played_move) ? 0 : 1)
  ) {
    throw new Error(`candidate union contains duplicate moves for parent ${parent.parent_id}`);
  }
  const candidateMoves = canonicalSortedMoves(candidateSet);

  // Every candidate gets freshly rebuilt engine search state and a one-move
  // context. Canonical order makes output independent of proposal/PV ordering.
  const searches: SearchMetadata[] = [];
  for (const move of candidateMoves) {
    await engine.resetForParent();
    const result = await searchWithTimeoutContext(
      engine,
      parent,
      1,
      limit,
      [move],
      'independent-rescore'
    );
    if (
      result.lines.length !== 1 ||
      result.bestmove !== move ||
      result.lines[0].multipv !== 1 ||
      result.lines[0].move !== move
    ) {
      throw new Error(
        `single-move re-search did not return exactly ${move} for ${parent.parent_id}`
      );
    }
    searches.push(
      validateSearchMetadata(
        searchMetadata(result, limit),
        `parent ${parent.parent_id} single search ${move}`,
        true
      )
    );
  }

  const initialSet = new Set(initialMoves);
  const rankedScores = searches.map((search) => search.scores[0]).sort(compareRankedScores);
  const records = buildSiblingGroup(
    {
      game_id: parent.game_id,
      parent_id: parent.parent_id,
      position_id: parent.position_id,
      parent_sfen: parent.parent_sfen,
      parent_ply: parent.ply,
    },
    rankedScores.map((score, index) => ({
      move: score.move,
      child_sfen: childSfenAfterUsi(parent.parent_sfen, score.move),
      sources: [
        ...(score.move === parent.played_move ? ['played'] : []),
        ...(initialSet.has(score.move) ? ['teacher'] : []),
      ],
      teacher_parent_cp: score.cp,
      teacher_rank: index + 1,
      teacher_score_kind: score.score_kind,
      teacher_mate: score.mate,
      teacher_mate_sign: score.mate_sign,
    }))
  );

  const exactSearch: IndependentExactSearchMetadata = {
    mode: INDEPENDENT_EXACT_RESCORE_MODE,
    candidate_count: candidateMoves.length,
    synthesized_rank1_move: rankedScores[0].move,
    moves: rankedScores.map((score) => score.move),
    scores: rankedScores,
    searches,
    total_observed_nodes: sumObservedNodes(searches, `parent ${parent.parent_id} exact search`),
  };

  return {
    schema: SIBLING_TEACHER_WORK_SCHEMA,
    kind: 'parent',
    run_fingerprint: '',
    payload_sha256: '',
    parent_id: parent.parent_id,
    candidate_set_sha256: candidateSetSha256(candidateMoves),
    candidate_moves: candidateMoves,
    initial_search: searchMetadata(initial, limit),
    exact_search: exactSearch,
    records,
  };
}

function validateWorkEntry(
  value: unknown,
  fingerprint: string,
  parents: ReadonlyMap<string, RawParentOccurrence>,
  line: number,
  expectedMultipv: number,
  expectedLimit: UsiSearchLimit,
  expectedTimeoutMs: number
): WorkEntry {
  if (!value || typeof value !== 'object') throw new Error(`work line ${line} must be an object`);
  const row = value as Partial<WorkEntry>;
  if (row.schema !== SIBLING_TEACHER_WORK_SCHEMA || row.run_fingerprint !== fingerprint) {
    throw new Error(`work line ${line} belongs to a different generator run`);
  }
  const parentId = requiredText(row.parent_id, `work line ${line} parent_id`);
  const parent = parents.get(parentId);
  if (!parent) throw new Error(`work line ${line} references an unselected parent: ${parentId}`);

  if (row.kind === 'skip') {
    const actualLegalMoves = legalMovesForParent(parent).length;
    if (row.reason === 'fewer-than-two-legal-moves') {
      if (
        !Number.isSafeInteger(row.legal_moves) ||
        (row.legal_moves as number) < 0 ||
        (row.legal_moves as number) >= 2
      ) {
        throw new Error(`work line ${line} has invalid forced-move skip metadata`);
      }
      const entry = row as ForcedLegalMoveSkippedWorkEntry;
      if (entry.payload_sha256 !== workEntryPayloadSha256(entry)) {
        throw new Error(`work line ${line} payload checksum mismatch`);
      }
      if (entry.legal_moves !== actualLegalMoves) {
        throw new Error(`work line ${line} skip legal_moves does not match its raw parent`);
      }
      return entry;
    }
    if (row.reason !== STRENGTH_FIRST_TIMEOUT_SKIP_REASON) {
      throw new Error(`work line ${line} has unsupported skip reason`);
    }
    const entry = row as SearchTimeoutSkippedWorkEntry;
    const timeout = entry.timeout;
    if (
      Object.keys(entry).sort().join('\0') !==
        [
          'kind',
          'legal_moves',
          'parent_id',
          'payload_sha256',
          'reason',
          'run_fingerprint',
          'schema',
          'timeout',
        ]
          .sort()
          .join('\0') ||
      !Number.isSafeInteger(entry.legal_moves) ||
      entry.legal_moves < 2 ||
      entry.legal_moves !== actualLegalMoves ||
      !timeout ||
      typeof timeout !== 'object' ||
      (timeout.phase !== 'proposal' && timeout.phase !== 'independent-rescore') ||
      !Number.isSafeInteger(timeout.requested_multipv) ||
      timeout.requested_multipv <= 0 ||
      !Array.isArray(timeout.searchmoves) ||
      !Number.isSafeInteger(timeout.timeout_ms) ||
      timeout.timeout_ms !== expectedTimeoutMs ||
      canonicalJson(timeout.requested_limit) !==
        canonicalJson(normalizedSearchLimit(expectedLimit))
    ) {
      throw new Error(`work line ${line} has invalid search-timeout skip metadata`);
    }
    const expectedInitialMultipv = Math.min(expectedMultipv, actualLegalMoves);
    if (
      (timeout.phase === 'proposal' &&
        (timeout.requested_multipv !== expectedInitialMultipv ||
          timeout.searchmoves.length !== 0)) ||
      (timeout.phase === 'independent-rescore' &&
        (timeout.requested_multipv !== 1 ||
          timeout.searchmoves.length !== 1 ||
          !legalMovesForParent(parent).includes(timeout.searchmoves[0])))
    ) {
      throw new Error(`work line ${line} search-timeout context is inconsistent`);
    }
    if (
      Object.keys(timeout).sort().join('\0') !==
        ['phase', 'requested_limit', 'requested_multipv', 'searchmoves', 'timeout_ms']
          .sort()
          .join('\0')
    ) {
      throw new Error(`work line ${line} search-timeout metadata has extra fields`);
    }
    if (entry.payload_sha256 !== workEntryPayloadSha256(entry)) {
      throw new Error(`work line ${line} payload checksum mismatch`);
    }
    return entry;
  }
  if (row.kind !== 'parent' || !Array.isArray(row.records) || !Array.isArray(row.candidate_moves)) {
    throw new Error(`work line ${line} has an unsupported kind or missing records`);
  }
  const entry = row as CompletedWorkEntry;
  if (entry.payload_sha256 !== workEntryPayloadSha256(entry)) {
    throw new Error(`work line ${line} payload checksum mismatch`);
  }
  validateParentGroups(entry.records);
  if (entry.records.some((record) => record.parent_id !== parentId)) {
    throw new Error(`work line ${line} contains records for another parent`);
  }
  const first = entry.records[0];
  if (
    first.game_id !== parent.game_id ||
    first.parent_sfen !== parent.parent_sfen ||
    first.position_id !== parent.position_id ||
    first.parent_ply !== parent.ply
  ) {
    throw new Error(`work line ${line} does not match its raw parent`);
  }
  const moves = canonicalSortedMoves(entry.records.map((record) => record.move));
  const candidates = entry.candidate_moves.map((move) => requiredText(move, 'candidate move'));
  const initialSearch = validateSearchMetadata(
    entry.initial_search,
    `work line ${line} initial search`
  );
  const legalMoves = legalMovesForParent(parent);
  const expectedInitialMultipv = Math.min(expectedMultipv, legalMoves.length);
  const normalizedExpectedLimit = normalizedSearchLimit(expectedLimit);
  const expectedCandidates = canonicalSortedMoves(
    new Set([...initialSearch.moves, parent.played_move])
  );
  const canonicalCandidates = canonicalSortedMoves(candidates);
  if (
    initialSearch.requested_multipv !== expectedInitialMultipv ||
    canonicalJson(initialSearch.requested_limit) !== canonicalJson(normalizedExpectedLimit) ||
    new Set(candidates).size !== candidates.length ||
    candidates.some((move, index) => move !== canonicalCandidates[index]) ||
    moves.length !== candidates.length ||
    moves.some((move, index) => move !== candidates[index]) ||
    initialSearch.moves.some((move) => !legalMoves.includes(move)) ||
    expectedCandidates.length !== candidates.length ||
    expectedCandidates.some((move, index) => move !== candidates[index]) ||
    entry.candidate_set_sha256 !== candidateSetSha256(candidates)
  ) {
    throw new Error(`work line ${line} has inconsistent candidate metadata`);
  }
  const exactSearch = validateIndependentExactSearch(
    entry.exact_search,
    candidates,
    normalizedExpectedLimit,
    `work line ${line} exact search`
  );
  const rankedMoves = entry.records.map((record) => record.move);
  if (
    exactSearch.candidate_count !== rankedMoves.length ||
    exactSearch.moves.some((move, index) => move !== rankedMoves[index]) ||
    exactSearch.scores.length !== rankedMoves.length
  ) {
    throw new Error(`work line ${line} records do not match synthesized exact ranks`);
  }
  const playedRecords = entry.records.filter((record) => record.sources.includes('played'));
  if (playedRecords.length !== 1 || playedRecords[0].move !== parent.played_move) {
    throw new Error(`work line ${line} does not preserve exactly one played move`);
  }
  const initialMoves = new Set(initialSearch.moves);
  for (let index = 0; index < entry.records.length; index++) {
    const record = entry.records[index];
    const expectedChild = childSfenAfterUsi(parent.parent_sfen, record.move);
    if (record.child_sfen !== expectedChild || record.sfen !== expectedChild) {
      throw new Error(`work line ${line} move ${record.move} has a non-derived child SFEN`);
    }
    const expectedSources = [
      ...(record.move === parent.played_move ? ['played'] : []),
      ...(initialMoves.has(record.move) ? ['teacher'] : []),
    ];
    if (
      record.sources.length !== expectedSources.length ||
      record.sources.some((source, sourceIndex) => source !== expectedSources[sourceIndex])
    ) {
      throw new Error(`work line ${line} move ${record.move} has inconsistent sources`);
    }
    const score = exactSearch.scores[index];
    if (
      record.teacher_rank !== index + 1 ||
      record.teacher_parent_cp !== score.cp ||
      record.teacher_score_kind !== score.score_kind ||
      record.teacher_mate !== score.mate ||
      record.teacher_mate_sign !== score.mate_sign
    ) {
      throw new Error(`work line ${line} move ${record.move} disagrees with exact score metadata`);
    }
  }
  return entry;
}

function serializeWork(header: WorkHeader, entries: Iterable<WorkEntry>): string {
  const sorted = [...entries].sort((a, b) => compareBytewise(a.parent_id, b.parent_id));
  return `${[header, ...sorted].map((row) => JSON.stringify(row)).join('\n')}\n`;
}

async function loadWork(
  workPath: string,
  header: WorkHeader,
  parents: ReadonlyMap<string, RawParentOccurrence>,
  expectedMultipv: number,
  expectedLimit: UsiSearchLimit,
  expectedTimeoutMs: number
): Promise<Map<string, WorkEntry>> {
  let text = '';
  try {
    text = await fs.promises.readFile(workPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const entries = new Map<string, WorkEntry>();
  if (text.trim() !== '') {
    const hadTrailingNewline = text.endsWith('\n');
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    let parsedHeader = false;
    for (let index = 0; index < lines.length; index++) {
      let value: unknown;
      try {
        value = JSON.parse(lines[index]);
      } catch {
        if (!hadTrailingNewline && index === lines.length - 1) {
          process.stderr.write(
            `Discarding incomplete trailing work checkpoint line ${index + 1}.\n`
          );
          break;
        }
        throw new Error(`invalid work checkpoint JSON on line ${index + 1}`);
      }
      if (!parsedHeader) {
        const candidate = value as Partial<WorkHeader>;
        if (
          candidate.schema !== header.schema ||
          candidate.kind !== 'header' ||
          candidate.run_fingerprint !== header.run_fingerprint ||
          candidate.source_raw_sha256 !== header.source_raw_sha256 ||
          candidate.selected_parent_ids_sha256 !== header.selected_parent_ids_sha256 ||
          candidate.label_policy !== header.label_policy ||
          canonicalJson(candidate.pipeline) !== canonicalJson(header.pipeline)
        ) {
          throw new Error('work checkpoint header does not match this generator run');
        }
        parsedHeader = true;
        continue;
      }
      const entry = validateWorkEntry(
        value,
        header.run_fingerprint,
        parents,
        index + 1,
        expectedMultipv,
        expectedLimit,
        expectedTimeoutMs
      );
      if (entries.has(entry.parent_id)) {
        throw new Error(`duplicate parent in work checkpoint: ${entry.parent_id}`);
      }
      entries.set(entry.parent_id, entry);
    }
    if (!parsedHeader) throw new Error('work checkpoint has no valid header');
  }
  await atomicWrite(workPath, serializeWork(header, entries.values()));
  return entries;
}

async function appendWorkEntry(handle: fs.promises.FileHandle, entry: WorkEntry): Promise<void> {
  await handle.appendFile(`${JSON.stringify(entry)}\n`, 'utf8');
  await handle.datasync();
}

function firstError(error: unknown, parentId: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`teacher labeling failed for parent ${parentId}: ${message}`);
}

interface SiblingTeacherExecution {
  readonly targetParents: number;
  readonly finalization: 'legacy-split' | 'none' | 'strength-first-training-only';
}

interface StrengthFirstCorePrefixProgress {
  readonly status: 'local-work-prefix-complete-not-an-authentication-receipt';
  readonly authentication_receipt: false;
  readonly target_parents: number;
  readonly completed_parents: number;
  readonly run_fingerprint: string;
  readonly forced_parents_skipped: number;
  readonly forced_skip_reasons: StrengthFirstForcedSkipReasonCounts;
  readonly emitted_parent_groups: number;
  readonly work: StrengthFirstFileBinding & {
    readonly schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    readonly records: number;
    readonly binding_scope: 'canonical-target-prefix-projection';
  };
  readonly current_work: StrengthFirstFileBinding & {
    readonly schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    readonly records: number;
  };
}

interface StrengthFirstCoreFinal {
  readonly status: 'complete-training-only';
  readonly authentication_receipt: false;
  readonly target_parents: number;
  readonly completed_parents: number;
  readonly run_fingerprint: string;
  readonly manifest: StrengthFirstSiblingTeacherManifest;
  readonly staged_result: StrengthFirstSiblingTeacherResult;
}

/**
 * Non-production seam for tests and runner development.
 *
 * The input interface is structurally forgeable and the filesystem paths are not yet
 * authorized against sealed roots. Only the forthcoming consumer-owned runner may expose a
 * production entry point.
 */
async function runSiblingTeacherDatasetCore(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  rawOptions: StageSiblingTeacherCoreForTestsOptions,
  execution: Readonly<SiblingTeacherExecution>,
  dependencies: GenerateSiblingTeacherDependencies = {}
): Promise<SiblingTeacherManifest | StrengthFirstCorePrefixProgress | StrengthFirstCoreFinal> {
  const capturedInput = captureAuthenticatedTeacherInput(input);
  const options = normalizeOptions(rawOptions);
  const repositoryDirectory = path.resolve(__dirname, '..');
  const revisionVerifier =
    dependencies.verifyRevision ??
    ((revision: string) => verifyPipelineRevision(revision, { repositoryDirectory }));
  const outputVerifier =
    dependencies.verifyOutputPaths ??
    ((outputs: readonly string[], inputs: readonly string[]) =>
      verifyPipelineOutputPaths(outputs, {
        repositoryDirectory,
        inputPaths: inputs,
      }));
  const pipeline = await revisionVerifier(options.runnerRevision);
  const allParents = [...capturedInput.parents];
  if (
    !Number.isSafeInteger(execution.targetParents) ||
    execution.targetParents <= 0 ||
    execution.targetParents > allParents.length
  ) {
    throw new Error(
      `targetParents must be between 1 and the ${allParents.length} authenticated parents`
    );
  }
  if (
    execution.finalization === 'strength-first-training-only' &&
    execution.targetParents !== allParents.length
  ) {
    throw new Error('strength-first finalization requires every authenticated parent');
  }
  const selected = allParents.slice(0, execution.targetParents);
  const selectedParentIdsSha256 = sha256(allParents.map((parent) => parent.parent_id).join('\n'));
  const parentMap = new Map(allParents.map((parent) => [parent.parent_id, parent]));

  const engineStat = await fs.promises.stat(options.engineBin);
  if (!engineStat.isFile())
    throw new Error(`engineBin is not a regular file: ${options.engineBin}`);
  const engineDigest = await sha256File(options.engineBin);
  const receiptBytes = await fs.promises.readFile(options.engineReceipt);
  let receiptValue: unknown;
  try {
    receiptValue = JSON.parse(receiptBytes.toString('utf8'));
  } catch {
    throw new Error(`engine receipt is not valid JSON: ${options.engineReceipt}`);
  }
  const receipt = validateEngineReceipt(receiptValue);
  if (
    receipt.binary_sha256 !== engineDigest.sha256 ||
    receipt.binary_bytes !== engineDigest.bytes
  ) {
    throw new Error('engine receipt binary hash/size does not match --engine-bin');
  }
  const engineReceipt: SiblingTeacherManifest['teacher']['engine_receipt'] = {
    file: {
      path: path.basename(options.engineReceipt),
      bytes: receiptBytes.byteLength,
      sha256: sha256(receiptBytes),
    },
    content: receipt,
  };
  const engineArgFiles = await collectArgumentFileDigests(options.engineArgs);
  const evalFiles = options.evalDir ? await collectDirectoryDigests(options.evalDir) : [];
  if (evalFiles.some((file) => path.basename(file.path).toLowerCase() === 'eval_options.txt')) {
    throw new Error(
      'evalDir must not contain eval_options.txt because it can override fixed options'
    );
  }
  const evalSha256 = options.evalDir
    ? sha256(`eval-tree-v1\0${evalFiles.map((file) => canonicalJson(file)).join('\n')}`)
    : null;
  const sourceRawSha256 = capturedInput.binding.raw_sha256;
  const protectedInputPaths = [
    options.engineBin,
    options.engineReceipt,
    ...engineArgFiles.map((file) => path.resolve(file.path)),
    ...(options.evalDir
      ? evalFiles.map((file) => path.join(options.evalDir as string, file.path))
      : []),
  ];
  const outputPaths =
    execution.finalization === 'legacy-split'
      ? [options.outTrain, options.outVal, options.manifest, options.work]
      : execution.finalization === 'strength-first-training-only'
        ? [
            options.work,
            options.outTrain,
            options.parentCompletion,
            options.manifest,
            options.stagedResult,
          ]
        : [options.work];
  await outputVerifier(outputPaths, protectedInputPaths);
  const runFingerprint = sha256(
    canonicalJson({
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      authenticated_training_binding: capturedInput.binding,
      source_raw_sha256: sourceRawSha256,
      selected_parent_ids_sha256: selectedParentIdsSha256,
      label_policy: SIBLING_TEACHER_LABEL_POLICY,
      pipeline,
      engine_bin_sha256: engineDigest.sha256,
      engine_args: options.engineArgs,
      engine_arg_files: engineArgFiles,
      engine_receipt_sha256: engineReceipt.file.sha256,
      engine_receipt: engineReceipt.content,
      eval_sha256: evalSha256,
      multipv: options.multipv,
      limit: options.limit,
      exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
      candidate_execution_order: 'utf8-bytewise-ascending',
      synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move',
      search_state_reset: 'isready',
      runtime_snapshot: SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
      ...(execution.finalization === 'legacy-split'
        ? {}
        : {
            engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
          }),
      parallel_engines: options.engines,
      fv_scale: options.fvScale,
      hash_mb_per_engine: options.hashMb,
      timeout_ms: options.timeoutMs,
      ...(options.testOnlyEngineInitializationTimeoutMs === undefined
        ? {}
        : {
            test_only_engine_initialization_timeout_ms:
              options.testOnlyEngineInitializationTimeoutMs,
          }),
      engine_options: USI_TEACHER_ENGINE_CONTRACT,
    })
  );
  const header: WorkHeader = {
    schema: SIBLING_TEACHER_WORK_SCHEMA,
    kind: 'header',
    run_fingerprint: runFingerprint,
    source_raw_sha256: sourceRawSha256,
    selected_parent_ids_sha256: selectedParentIdsSha256,
    label_policy: SIBLING_TEACHER_LABEL_POLICY,
    pipeline,
  };
  const workEntries = await loadWork(
    options.work,
    header,
    parentMap,
    options.multipv,
    options.limit,
    options.timeoutMs
  );
  const timeoutSkipLimit =
    execution.finalization === 'legacy-split'
      ? 0
      : strengthFirstTimeoutSkipLimit(selected.length);
  const selectedParentIdSet = new Set(selected.map((parent) => parent.parent_id));
  let timeoutSkipCount = [...workEntries.values()].filter(
    (entry) =>
      selectedParentIdSet.has(entry.parent_id) &&
      entry.kind === 'skip' &&
      entry.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON
  ).length;
  if (timeoutSkipCount > timeoutSkipLimit) {
    throw new Error(
      `search-timeout skip count ${timeoutSkipCount} exceeds target ${selected.length} limit ${timeoutSkipLimit}`
    );
  }
  const runtimeSnapshot = await createRuntimeSnapshot(
    options,
    engineDigest,
    engineArgFiles,
    evalFiles
  );
  let workHandle: fs.promises.FileHandle;
  try {
    workHandle = await fs.promises.open(options.work, 'a');
  } catch (error) {
    await fs.promises.rm(runtimeSnapshot.root, {
      recursive: true,
      force: true,
    });
    throw error;
  }
  let appendTail: Promise<void> = Promise.resolve();
  let checkpointFailure: Error | null = null;
  const persist = async (entry: WorkEntry): Promise<void> => {
    const operation = appendTail.then(async () => {
      if (checkpointFailure) throw checkpointFailure;
      if (
        entry.kind === 'skip' &&
        entry.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON &&
        timeoutSkipCount >= timeoutSkipLimit
      ) {
        checkpointFailure = new Error(
          `search-timeout skip limit ${timeoutSkipLimit} exhausted for target ${selected.length}`
        );
        throw checkpointFailure;
      }
      try {
        await appendWorkEntry(workHandle, entry);
      } catch (error) {
        checkpointFailure = error instanceof Error ? error : new Error(String(error));
        throw checkpointFailure;
      }
      workEntries.set(entry.parent_id, entry);
      if (entry.kind === 'skip' && entry.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON) {
        timeoutSkipCount += 1;
      }
    });
    appendTail = operation.catch(() => undefined);
    await operation;
  };

  let failure: Error | null = null;
  const pending: Array<{ parent: RawParentOccurrence; legalMoves: string[] }> = [];
  try {
    for (const parent of selected) {
      if (workEntries.has(parent.parent_id)) continue;
      const legalMoves = legalMovesForParent(parent);
      if (legalMoves.length < 2) {
        await persist(
          sealWorkEntry({
            schema: SIBLING_TEACHER_WORK_SCHEMA,
            kind: 'skip',
            run_fingerprint: runFingerprint,
            parent_id: parent.parent_id,
            reason: 'fewer-than-two-legal-moves',
            legal_moves: legalMoves.length,
          })
        );
      } else {
        pending.push({ parent, legalMoves });
      }
    }

    let next = 0;
    const workerCount = Math.min(options.engines, pending.length);
    const workers = Array.from({ length: workerCount }, async (_, workerIndex) => {
      const workerCwd = path.join(runtimeSnapshot.cwd, `worker-${workerIndex}`);
      await fs.promises.mkdir(workerCwd, { mode: 0o700 });
      let engineGeneration = 0;
      const startEngine = async (): Promise<UsiTeacherEngine> => {
        const engineCwd = path.join(workerCwd, `engine-${engineGeneration}`);
        engineGeneration += 1;
        await fs.promises.mkdir(engineCwd, { mode: 0o700 });
        const started = new UsiTeacherEngine({
          engineBin: runtimeSnapshot.engineBin,
          engineArgs: runtimeSnapshot.engineArgs,
          evalDir: runtimeSnapshot.evalDir,
          cwd: engineCwd,
          ...(execution.finalization === 'legacy-split'
            ? {}
            : { env: siblingTeacherEngineEnvironment(engineCwd) }),
          fvScale: options.fvScale,
          hashMb: options.hashMb,
          timeoutMs: options.timeoutMs,
          ...(options.testOnlyEngineInitializationTimeoutMs === undefined
            ? {}
            : {
                testOnlyInitializationTimeoutMs:
                  options.testOnlyEngineInitializationTimeoutMs,
              }),
        });
        try {
          await started.init();
          return started;
        } catch (error) {
          await started.quit();
          throw error;
        }
      };
      let engine: UsiTeacherEngine | null = null;
      try {
        engine = await startEngine();
        while (!failure) {
          const index = next++;
          const job = pending[index];
          if (!job || !engine) break;
          try {
            const result = await labelSiblingParent(
              engine,
              job.parent,
              options.multipv,
              options.limit,
              job.legalMoves
            );
            result.run_fingerprint = runFingerprint;
            const sealed = sealWorkEntry(result as unknown as Record<string, unknown>);
            const validated = validateWorkEntry(
              sealed,
              runFingerprint,
              parentMap,
              0,
              options.multipv,
              options.limit,
              options.timeoutMs
            );
            await persist(validated);
          } catch (error) {
            if (
              execution.finalization !== 'legacy-split' &&
              error instanceof SiblingTeacherSearchTimeoutError
            ) {
              try {
                await engine.quit();
                engine = null;
                const searchmoves =
                  error.phase === 'proposal'
                    ? ([] as const)
                    : ([requiredText(error.searchmoves[0], 'timed-out searchmove')] as const);
                const sealed = sealWorkEntry({
                  schema: SIBLING_TEACHER_WORK_SCHEMA,
                  kind: 'skip',
                  run_fingerprint: runFingerprint,
                  parent_id: job.parent.parent_id,
                  reason: STRENGTH_FIRST_TIMEOUT_SKIP_REASON,
                  legal_moves: job.legalMoves.length,
                  timeout: {
                    phase: error.phase,
                    requested_multipv: error.requestedMultipv,
                    requested_limit: error.requestedLimit,
                    searchmoves,
                    timeout_ms: error.timeoutMs,
                  },
                });
                const validated = validateWorkEntry(
                  sealed,
                  runFingerprint,
                  parentMap,
                  0,
                  options.multipv,
                  options.limit,
                  options.timeoutMs
                );
                await persist(validated);
                if (!failure && next < pending.length) {
                  engine = await startEngine();
                }
              } catch (recoveryError) {
                failure ??= firstError(recoveryError, job.parent.parent_id);
              }
            } else {
              failure ??= firstError(error, job.parent.parent_id);
            }
          }
        }
      } catch (error) {
        failure ??= new Error(
          `USI worker initialization failed: ${error instanceof Error ? error.message : error}`
        );
      } finally {
        await engine?.quit();
      }
    });
    await Promise.all(workers);
    await appendTail;
  } finally {
    await appendTail.catch(() => undefined);
    try {
      await workHandle.close();
    } finally {
      await fs.promises.rm(runtimeSnapshot.root, {
        recursive: true,
        force: true,
      });
    }
  }
  if (failure) throw failure;

  const canonicalWork = serializeWork(header, workEntries.values());
  await atomicWrite(options.work, canonicalWork);
  const completed = [...workEntries.values()]
    .filter((entry): entry is CompletedWorkEntry => entry.kind === 'parent')
    .sort((a, b) => compareBytewise(a.parent_id, b.parent_id));
  const skipped = [...workEntries.values()].filter((entry) => entry.kind === 'skip');
  const missingTargetParent = selected.find((parent) => !workEntries.has(parent.parent_id));
  if (missingTargetParent !== undefined) {
    throw new Error(
      `work checkpoint is incomplete for target ${selected.length}: ${missingTargetParent.parent_id}`
    );
  }
  if (execution.finalization === 'none') {
    const finalPipeline = await revisionVerifier(options.runnerRevision);
    if (canonicalJson(finalPipeline) !== canonicalJson(pipeline)) {
      throw new Error('pipeline provenance changed during teacher generation');
    }
    await outputVerifier(outputPaths, protectedInputPaths);
    const targetEntries = selected.map((parent) => {
      const entry = workEntries.get(parent.parent_id);
      if (!entry) throw new Error(`missing target prefix entry for ${parent.parent_id}`);
      return entry;
    });
    const prefixForcedSkipReasons = forcedSkipReasonCounts(targetEntries);
    const prefixForcedParentsSkipped =
      prefixForcedSkipReasons.fewer_than_two_legal_moves +
      prefixForcedSkipReasons.search_timeout_no_label;
    const canonicalTargetWork = serializeWork(header, targetEntries);
    const currentWork = await fileBinding(options.work);
    return {
      status: 'local-work-prefix-complete-not-an-authentication-receipt',
      authentication_receipt: false,
      target_parents: selected.length,
      completed_parents: selected.length,
      run_fingerprint: runFingerprint,
      forced_parents_skipped: prefixForcedParentsSkipped,
      forced_skip_reasons: prefixForcedSkipReasons,
      emitted_parent_groups: selected.length - prefixForcedParentsSkipped,
      work: {
        path: path.basename(options.work),
        bytes: Buffer.byteLength(canonicalTargetWork),
        sha256: sha256(canonicalTargetWork),
        schema: SIBLING_TEACHER_WORK_SCHEMA,
        records: selected.length + 1,
        binding_scope: 'canonical-target-prefix-projection',
      },
      current_work: {
        ...currentWork,
        schema: SIBLING_TEACHER_WORK_SCHEMA,
        records: workEntries.size + 1,
      },
    };
  }
  const records = completed.flatMap((entry) => entry.records);
  validateParentGroups(records);
  if (execution.finalization === 'strength-first-training-only') {
    const entryByParent = new Map(
      [...workEntries.values()].map((entry) => [entry.parent_id, entry] as const)
    );
    const trainingGroups = new Map<string, readonly SiblingRecord[]>();
    const trainingRecords: SiblingRecord[] = [];
    for (const parent of selected) {
      const entry = entryByParent.get(parent.parent_id);
      if (!entry) {
        throw new Error(`missing completed work entry for ${parent.parent_id}`);
      }
      if (entry.kind === 'skip') continue;
      const group = entry.records.map((record) => ({
        ...record,
        split: 'train' as const,
      }));
      validateParentGroups(group);
      trainingGroups.set(parent.parent_id, group);
      trainingRecords.push(...group);
    }
    validateParentGroups(trainingRecords);
    const trainJsonl = serializeCanonicalJsonl(trainingRecords);
    const completionRows = selected.map((parent) => {
      const entry = entryByParent.get(parent.parent_id);
      if (!entry) {
        throw new Error(`missing completion evidence for ${parent.parent_id}`);
      }
      const group = trainingGroups.get(parent.parent_id);
      const groupJsonl = group ? serializeCanonicalJsonl(group) : '';
      return {
        schema: STRENGTH_FIRST_PARENT_COMPLETION_RECORD_SCHEMA,
        game_id: parent.game_id,
        parent_id: parent.parent_id,
        position_id: parent.position_id,
        completed_parent_sha256: entry.payload_sha256,
        forced_parent_skipped: entry.kind === 'skip',
        train_group_records: group?.length ?? 0,
        train_group_sha256: group ? sha256(groupJsonl) : null,
      };
    });
    const completionJsonl = serializeCanonicalJsonl(completionRows);
    const forcedParentIds = completionRows
      .filter((row) => row.forced_parent_skipped)
      .map((row) => row.parent_id);
    const emittedParentIds = completionRows
      .filter((row) => !row.forced_parent_skipped)
      .map((row) => row.parent_id);
    const forcedSkipReasons = forcedSkipReasonCounts(
      selected.map((parent) => {
        const entry = entryByParent.get(parent.parent_id);
        if (!entry) throw new Error(`missing skip accounting for ${parent.parent_id}`);
        return entry;
      })
    );
    if (
      forcedSkipReasons.fewer_than_two_legal_moves +
        forcedSkipReasons.search_timeout_no_label !==
        forcedParentIds.length ||
      forcedSkipReasons.search_timeout_no_label > timeoutSkipLimit
    ) {
      throw new Error('forced skip reason accounting is inconsistent');
    }
    const trainGameIds = new Set(trainingRecords.map((record) => record.game_id));
    const trainParentIds = new Set(trainingRecords.map((record) => record.parent_id));
    const trainPositionIds = new Set(
      trainingRecords.flatMap((record) => [record.position_id, record.child_position_id])
    );
    const train: StrengthFirstTrainBinding = {
      path: path.basename(options.outTrain),
      format: STRENGTH_FIRST_TRAIN_FORMAT,
      bytes: Buffer.byteLength(trainJsonl),
      sha256: sha256(trainJsonl),
      records: trainingRecords.length,
      parents: trainParentIds.size,
      games: trainGameIds.size,
      game_ids_sha256: floodgateIdentifierDigest(trainGameIds),
      parent_ids_sha256: floodgateIdentifierDigest(trainParentIds),
      semantic_position_ids_count: trainPositionIds.size,
      semantic_position_ids_sha256: floodgateIdentifierDigest(trainPositionIds),
    };
    const parentCompletion: StrengthFirstParentCompletionBinding = {
      path: path.basename(options.parentCompletion),
      format: STRENGTH_FIRST_PARENT_COMPLETION_FORMAT,
      bytes: Buffer.byteLength(completionJsonl),
      sha256: sha256(completionJsonl),
      records: completionRows.length,
      forced_parents_skipped: forcedParentIds.length,
      emitted_parent_groups: emittedParentIds.length,
      parent_ids_sha256: floodgateIdentifierDigest(selected.map((parent) => parent.parent_id)),
      forced_parent_ids_sha256: floodgateIdentifierDigest(forcedParentIds),
      emitted_parent_ids_sha256: floodgateIdentifierDigest(emittedParentIds),
    };
    const candidateCounts = completed.map((entry) => entry.candidate_moves.length);
    const candidateLock = completed
      .map(
        (entry) =>
          `${entry.parent_id}\0${entry.candidate_set_sha256}\0${entry.candidate_moves.length}`
      )
      .join('\n');
    const manifest: StrengthFirstSiblingTeacherManifest = {
      schema: STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
      status: 'complete-training-only',
      run_fingerprint: runFingerprint,
      pipeline,
      authenticated_input: {
        bundle_verifier_revision: capturedInput.binding.verifier_revision,
        binding: capturedInput.binding,
      },
      source: {
        raw_sha256: sourceRawSha256,
        raw_records: capturedInput.binding.records,
        selected_parents: selected.length,
        selected_parent_ids_sha256: selectedParentIdsSha256,
      },
      teacher: {
        engine_bin_sha256: engineDigest.sha256,
        engine_bin_bytes: engineDigest.bytes,
        engine_args: [...options.engineArgs],
        engine_arg_files: engineArgFiles,
        engine_receipt: engineReceipt,
        eval_sha256: evalSha256,
        eval_files: evalFiles,
        runtime_snapshot: {
          ...SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
          engine_argument_file_count: engineArgFiles.length,
          eval_tree_present: options.evalDir !== undefined,
        },
        engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
      },
      search: {
        multipv: options.multipv,
        limit:
          'nodes' in options.limit
            ? { nodes: options.limit.nodes as number }
            : { depth: options.limit.depth as number },
        parallel_engines: options.engines,
        fv_scale: options.fvScale,
        hash_mb_per_engine: options.hashMb,
        timeout_ms: options.timeoutMs,
        exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
        label_policy: SIBLING_TEACHER_LABEL_POLICY,
        tt_reset_before_proposal: true,
        tt_reset_before_each_candidate: true,
        search_state_reset_before_proposal: 'isready',
        search_state_reset_before_each_candidate: 'isready',
        candidate_execution_order: 'utf8-bytewise-ascending',
        synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move',
        engine_options: USI_TEACHER_ENGINE_CONTRACT,
      },
      candidate_sets: {
        sha256: sha256(`candidate-sets-v1\0${candidateLock}`),
        parents: completed.length,
        candidates: candidateCounts.reduce((sum, count) => sum + count, 0),
        min_candidates: candidateCounts.length === 0 ? 0 : Math.min(...candidateCounts),
        max_candidates: candidateCounts.length === 0 ? 0 : Math.max(...candidateCounts),
        skipped_parents: skipped.length,
      },
      progress_checkpoint: {
        schema: SIBLING_TEACHER_WORK_SCHEMA,
        run_fingerprint: runFingerprint,
        entries: workEntries.size,
        completed_parents: completed.length,
        skipped_parents: skipped.length,
        sha256: sha256(canonicalWork),
      },
      forced_skip_reasons: forcedSkipReasons,
      parent_completion: parentCompletion,
      outputs: { train },
      publication: {
        staged_inside_authenticated_callback: true,
        consumer_postflight_bound: false,
      },
    };
    const finalPipeline = await revisionVerifier(options.runnerRevision);
    if (canonicalJson(finalPipeline) !== canonicalJson(pipeline)) {
      throw new Error('pipeline provenance changed during teacher generation');
    }
    await outputVerifier(outputPaths, protectedInputPaths);
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
    const manifestBinding = {
      path: path.basename(options.manifest),
      bytes: Buffer.byteLength(manifestJson),
      sha256: sha256(manifestJson),
      schema: STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
    } as const;
    const result: StrengthFirstSiblingTeacherResult = {
      schema: STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
      status: 'complete-training-only',
      run_fingerprint: runFingerprint,
      runner_revision: options.runnerRevision,
      bundle_verifier_revision: capturedInput.binding.verifier_revision,
      input_parents: selected.length,
      completed_parents: workEntries.size,
      forced_parents_skipped: forcedParentIds.length,
      forced_skip_reasons: forcedSkipReasons,
      emitted_parent_groups: emittedParentIds.length,
      work: {
        path: path.basename(options.work),
        bytes: Buffer.byteLength(canonicalWork),
        sha256: sha256(canonicalWork),
        schema: SIBLING_TEACHER_WORK_SCHEMA,
        records: workEntries.size + 1,
      },
      train,
      parent_completion: parentCompletion,
      manifest: manifestBinding,
      publication: {
        staged_inside_authenticated_callback: true,
        consumer_postflight_bound: false,
      },
    };
    await atomicWrite(options.outTrain, trainJsonl);
    await atomicWrite(options.parentCompletion, completionJsonl);
    await atomicWrite(options.manifest, manifestJson);
    await atomicWrite(options.stagedResult, `${JSON.stringify(result, null, 2)}\n`);
    return {
      status: 'complete-training-only',
      authentication_receipt: false,
      target_parents: selected.length,
      completed_parents: workEntries.size,
      run_fingerprint: runFingerprint,
      manifest,
      staged_result: result,
    };
  }
  if (completed.length === 0) throw new Error('no parent produced a sibling group');
  const split = splitSiblingDataset(records, {
    seed: options.seed,
    valRatio: options.valRatio,
  });
  const trainJsonl = serializeJsonl(split.train);
  const valJsonl = serializeJsonl(split.val);
  const candidateCounts = completed.map((entry) => entry.candidate_moves.length);
  const candidateLock = completed
    .map(
      (entry) =>
        `${entry.parent_id}\0${entry.candidate_set_sha256}\0${entry.candidate_moves.length}`
    )
    .join('\n');

  const manifest: SiblingTeacherManifest = {
    schema: SIBLING_TEACHER_MANIFEST_SCHEMA,
    record_manifest_schema: SIBLING_MANIFEST_SCHEMA,
    pipeline,
    source: {
      raw_sha256: sourceRawSha256,
      raw_records: capturedInput.binding.records,
      selected_parents: selected.length,
      selected_parent_ids_sha256: selectedParentIdsSha256,
    },
    teacher: {
      engine_bin_sha256: engineDigest.sha256,
      engine_bin_bytes: engineDigest.bytes,
      engine_args: [...options.engineArgs],
      engine_arg_files: engineArgFiles,
      engine_receipt: engineReceipt,
      eval_sha256: evalSha256,
      eval_files: evalFiles,
      runtime_snapshot: {
        ...SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
        engine_argument_file_count: engineArgFiles.length,
        eval_tree_present: options.evalDir !== undefined,
      },
    },
    search: {
      multipv: options.multipv,
      limit:
        'nodes' in options.limit
          ? { nodes: options.limit.nodes as number }
          : { depth: options.limit.depth as number },
      parallel_engines: options.engines,
      fv_scale: options.fvScale,
      hash_mb_per_engine: options.hashMb,
      timeout_ms: options.timeoutMs,
      exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
      label_policy: SIBLING_TEACHER_LABEL_POLICY,
      tt_reset_before_proposal: true,
      tt_reset_before_each_candidate: true,
      search_state_reset_before_proposal: 'isready',
      search_state_reset_before_each_candidate: 'isready',
      candidate_execution_order: 'utf8-bytewise-ascending',
      synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move',
      engine_options: USI_TEACHER_ENGINE_CONTRACT,
    },
    candidate_sets: {
      sha256: sha256(`candidate-sets-v1\0${candidateLock}`),
      parents: completed.length,
      candidates: candidateCounts.reduce((sum, count) => sum + count, 0),
      min_candidates: Math.min(...candidateCounts),
      max_candidates: Math.max(...candidateCounts),
      skipped_parents: skipped.length,
    },
    progress_checkpoint: {
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      run_fingerprint: runFingerprint,
      entries: workEntries.size,
      completed_parents: completed.length,
      skipped_parents: skipped.length,
      sha256: sha256(canonicalWork),
    },
    split: split.manifest,
    outputs: {
      train_sha256: sha256(trainJsonl),
      val_sha256: sha256(valJsonl),
      train_bytes: Buffer.byteLength(trainJsonl),
      val_bytes: Buffer.byteLength(valJsonl),
    },
  };

  // Re-check immediately before committing the candidate staging generation.
  const finalPipeline = await revisionVerifier(options.runnerRevision);
  if (canonicalJson(finalPipeline) !== canonicalJson(pipeline)) {
    throw new Error('pipeline provenance changed during teacher generation');
  }
  await outputVerifier(outputPaths, protectedInputPaths);
  // These are candidate staging files only; a future postflight publisher must own final output.
  await atomicWrite(options.outTrain, trainJsonl);
  await atomicWrite(options.outVal, valJsonl);
  await atomicWrite(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function stageSiblingTeacherDatasetCoreForTests(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  rawOptions: StageSiblingTeacherCoreForTestsOptions,
  dependencies: GenerateSiblingTeacherDependencies = {}
): Promise<SiblingTeacherManifest> {
  const targetParents = Array.isArray(input.rows) ? input.rows.length : 0;
  return (await runSiblingTeacherDatasetCore(
    input,
    rawOptions,
    {
      targetParents,
      finalization: 'legacy-split',
    },
    dependencies
  )) as SiblingTeacherManifest;
}

export interface AdvanceStrengthFirstSiblingTeacherCoreForTestsOptions extends StageSiblingTeacherCoreForTestsOptions {
  readonly targetParents: number;
  readonly finalize: boolean;
}

/**
 * Structurally forgeable target/finalization seam for focused tests.
 *
 * Production callers must use advanceStrengthFirstSiblingTeacherDataset from
 * inside the pinned training-row consumer callback.
 */
export async function advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  rawOptions: AdvanceStrengthFirstSiblingTeacherCoreForTestsOptions,
  dependencies: GenerateSiblingTeacherDependencies = {}
): Promise<StrengthFirstCorePrefixProgress | StrengthFirstCoreFinal> {
  const { targetParents, finalize, ...options } = rawOptions;
  return (await runSiblingTeacherDatasetCore(
    input,
    options,
    {
      targetParents,
      finalization: finalize ? 'strength-first-training-only' : 'none',
    },
    dependencies
  )) as StrengthFirstCorePrefixProgress | StrengthFirstCoreFinal;
}

/**
 * Strength-first production seam for one already-authenticated 24,000-row
 * callback. Target 100 and 500 preserve only durable work. Target 24,000
 * emits the training-only dataset and its exact completion/manifest/result
 * bindings. The target is deliberately excluded from the run fingerprint.
 */
export async function advanceStrengthFirstSiblingTeacherDataset(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  rawOptions: StrengthFirstSiblingTeacherOptions,
  dependencies: GenerateSiblingTeacherDependencies = {}
): Promise<StrengthFirstSiblingTeacherAdvance> {
  const capturedInput = captureAuthenticatedTeacherInput(input);
  if (capturedInput.parents.length !== 24_000 || capturedInput.binding.records !== 24_000) {
    throw new Error('strength-first production generation requires exactly 24000 parents');
  }
  const { targetParents, ...options } = rawOptions;
  if (!STRENGTH_FIRST_PRODUCTION_PARENT_TARGETS.includes(targetParents)) {
    throw new Error('strength-first targetParents must be exactly 100, 500, or 24000');
  }
  const outcome = await runSiblingTeacherDatasetCore(
    input,
    {
      ...options,
      engines: STRENGTH_FIRST_PRODUCTION_ENGINES,
    },
    {
      targetParents,
      finalization: targetParents === 24_000 ? 'strength-first-training-only' : 'none',
    },
    dependencies
  );
  return outcome as StrengthFirstSiblingTeacherAdvance;
}

export const REMOVED_SIBLING_TEACHER_CLI_MESSAGE =
  'raw-path sibling teacher CLI removed; authenticated Floodgate runner is not yet available';

if (require.main === module) {
  process.stderr.write(`${REMOVED_SIBLING_TEACHER_CLI_MESSAGE}\n`);
  process.exitCode = 2;
}
