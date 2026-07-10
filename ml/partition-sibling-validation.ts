/**
 * Deterministically seal part of the sibling model-selection validation split.
 *
 * Games are ranked by SHA-256 over an explicitly framed byte string. The first
 * three games become the final holdout. The holdout then wins every validation
 * conflict, and the surviving evaluation union wins every conflict with the
 * training split. Conflicting model-selection or training parents are removed
 * as indivisible sibling groups. Output JSONL consists of the original source
 * line bytes, not re-serialized records.
 */

import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  SIBLING_MANIFEST_SCHEMA,
  SIBLING_SCHEMA,
  assertSplitIsolation,
  compareBytewise,
  validateParentGroups,
  type SiblingRecord,
} from './sibling-data';
import {
  INDEPENDENT_EXACT_RESCORE_MODE,
  SIBLING_TEACHER_LABEL_POLICY,
  SIBLING_TEACHER_MANIFEST_SCHEMA,
  SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
} from './generate-sibling-teacher';
import {
  verifyPipelineOutputPaths,
  verifyPipelineRevision,
  type PipelineProvenance,
} from './pipeline-revision';

export const SIBLING_EVAL_PARTITION_MANIFEST_SCHEMA =
  'shogi-sibling-eval-partition-manifest-v1' as const;
export const SIBLING_EVAL_PARTITION_ALGORITHM =
  'sha256-fixed-game-quota-final-holdout-v1' as const;
export const SIBLING_EVAL_PARTITION_DOMAIN =
  'shogi-sibling-eval-partition-v1' as const;
export const SIBLING_EVAL_PARTITION_SEED = 'wcsc36-d16-v6-eval-v1' as const;
export const SIBLING_EVAL_EXPECTED_SOURCE_GAMES = 7 as const;
export const SIBLING_EVAL_FINAL_HOLDOUT_GAMES = 3 as const;
export const SIBLING_EVAL_MODEL_SELECTION_GAMES = 4 as const;
export const SIBLING_MODEL_TRAINING_GAMES = 21 as const;
export const SIBLING_EVAL_JSONL_FORMAT = 'jsonl-original-lines-v1' as const;
export const SIBLING_PROTECTED_POSITION_IDS_FORMAT =
  'sorted-unique-sha256-position-id-utf8-lf-v1' as const;
export const SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT =
  'sorted-unique-sha256-parent-id-utf8-lf-v1' as const;
export const SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT =
  'sorted-unique-sha256-position-id-utf8-lf-v1' as const;
export const SIBLING_POLICY_EXPOSURE_RECEIPT_SCHEMA =
  'shogi-policy-exposure-receipt-v1' as const;

export interface SiblingFullTeacherContract {
  pipelineRevision: string;
  rawSha256: string;
  rawRecords: number;
  selectedParents: number;
  sourceGames: number;
  selectedParentIdsSha256: string;
  engineBinSha256: string;
  engineBinBytes: number;
  engineReceiptBytes: number;
  engineReceiptSha256: string;
  engineSourceCommit: string;
  evalSha256: string;
  depth: number;
  multipv: number;
  parallelEngines: number;
  fvScale: number;
  hashMbPerEngine: number;
  timeoutMs: number;
  splitSeed: string;
  valRatio: number;
  trainGameIdsSha256: string;
  valGameIdsSha256: string;
}

export const SIBLING_FULL_TEACHER_CONTRACT: Readonly<SiblingFullTeacherContract> =
  Object.freeze({
    pipelineRevision: '8e376e887fac19fb31c07f147e17e84b1d5fc4b2',
    rawSha256: '827e912032feac9fd539af58a0e35c1131a1228abedcb1bca9c5f51f214bdfaa',
    rawRecords: 3_112,
    selectedParents: 3_112,
    sourceGames: 28,
    selectedParentIdsSha256: '44cb6d61a97b0ad092c96d76631683cba19f468adb054152ed94d20033ac950c',
    engineBinSha256: '1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1',
    engineBinBytes: 700_048,
    engineReceiptBytes: 654,
    engineReceiptSha256: 'a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e',
    engineSourceCommit: '9133c527791c8b2f5f378a32df29a5e3752bd41b',
    evalSha256: '639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568',
    depth: 16,
    multipv: 12,
    parallelEngines: 12,
    fvScale: 20,
    hashMbPerEngine: 64,
    timeoutMs: 600_000,
    splitSeed: '42',
    valRatio: 0.2,
    trainGameIdsSha256: 'a1f633e0937ed870b0d73cdf2496f124fb060239150e5c8567e6e20dd2cf6ff6',
    valGameIdsSha256: '778d7ffcd536367dcefbd1a93785c9a8c62b00504b9461a95fd1653b4fdd3b55',
  });

export interface PolicyExposureRoleAccounting {
  trainingParents: number;
  trainingRecords: number;
  selectionParents: number;
  selectionRecords: number;
  holdoutParents: number;
  holdoutRecords: number;
  unmatchedParentIds: number;
}

export interface SiblingPolicyExposureContract {
  receiptBytes: number;
  receiptSha256: string;
  parentIdsFormat: typeof SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT;
  parentIdsBytes: number;
  parentIdsSha256: string;
  parentIdsCount: number;
  parentIdentifiersSha256: string;
  semanticIdsFormat: typeof SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT;
  semanticIdsBytes: number;
  semanticIdsSha256: string;
  semanticIdsCount: number;
  semanticIdentifiersSha256: string;
  roleAccounting: Readonly<PolicyExposureRoleAccounting> | null;
}

export const SIBLING_POLICY_EXPOSURE_CONTRACT: Readonly<SiblingPolicyExposureContract> =
  Object.freeze({
    receiptBytes: 3_907,
    receiptSha256: '000811b307284998d7de311954b15a618179a4d9318e1600031bd15991fe3e4b',
    parentIdsFormat: SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT,
    parentIdsBytes: 7_344,
    parentIdsSha256: '2e634e5968516f243998de98c5f80d2abb674e8b9841655a3b4735df892e2d10',
    parentIdsCount: 102,
    parentIdentifiersSha256: '77ea294f0237ca089f5fd4df64242ab9cf9f62f5a134196ac98fc9114ceebdd3',
    semanticIdsFormat: SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
    semanticIdsBytes: 100_224,
    semanticIdsSha256: '8c696e8d1d426d9efdffb112004f37a37359f22a903bc34d2c4e7621e02a6bdd',
    semanticIdsCount: 1_392,
    semanticIdentifiersSha256: '31d2b9f60421f540880037efed9571bd034a986163cd79d2e51f2336544cba70',
    // Filled only after the full depth-16 manifest has been partitioned and
    // independently audited. Null deliberately makes publication fail closed.
    roleAccounting: null,
  });

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/;

interface DatasetDigest {
  format: typeof SIBLING_EVAL_JSONL_FORMAT;
  bytes: number;
  sha256: string;
  records: number;
  parents: number;
  games: number;
  game_ids_sha256: string;
  semantic_position_ids_count: number;
  semantic_position_ids_sha256: string;
}

export interface SiblingEvalPartitionManifest {
  schema: typeof SIBLING_EVAL_PARTITION_MANIFEST_SCHEMA;
  record_schema: typeof SIBLING_SCHEMA;
  pipeline: PipelineProvenance;
  policy: {
    algorithm: typeof SIBLING_EVAL_PARTITION_ALGORITHM;
    domain: typeof SIBLING_EVAL_PARTITION_DOMAIN;
    seed: typeof SIBLING_EVAL_PARTITION_SEED;
    source_role: 'val';
    expected_source_games: typeof SIBLING_EVAL_EXPECTED_SOURCE_GAMES;
    final_holdout_games: typeof SIBLING_EVAL_FINAL_HOLDOUT_GAMES;
    rank_order: 'sha256-bytes-ascending-then-game-id-utf8-bytewise';
    priority: 'final-holdout-then-evaluation-wins';
    drop_unit: 'parent-group';
    conflict_resolution: 'drop-conflicting-selection-and-training-parent-groups-with-holdout-then-evaluation-priority';
    semantic_position_set: 'position_id-union-child_position_id';
    policy_exposure_policy: 'drop-parent-groups-touching-policy-parent-or-semantic-position-exposure-before-role-isolation';
  };
  source: {
    teacher_manifest: {
      schema: typeof SIBLING_TEACHER_MANIFEST_SCHEMA;
      bytes: number;
      sha256: string;
    };
    full_training: {
      bytes: number;
      sha256: string;
      records: number;
      parents: number;
      games: number;
      game_ids_sha256: string;
    };
    full_validation: {
      bytes: number;
      sha256: string;
      records: number;
      parents: number;
      games: number;
      game_ids_sha256: string;
    };
    policy_exposure_receipt: {
      schema: typeof SIBLING_POLICY_EXPOSURE_RECEIPT_SCHEMA;
      bytes: number;
      sha256: string;
    };
    policy_exposed_parent_ids: {
      format: typeof SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT;
      bytes: number;
      sha256: string;
      count: number;
      identifiers_sha256: string;
    };
    policy_exposed_semantic_position_ids: {
      format: typeof SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT;
      bytes: number;
      sha256: string;
      count: number;
      identifiers_sha256: string;
    };
  };
  outputs: {
    model_training: DatasetDigest;
    model_selection: DatasetDigest;
    final_holdout: DatasetDigest;
    protected_position_ids: {
      format: typeof SIBLING_PROTECTED_POSITION_IDS_FORMAT;
      bytes: number;
      sha256: string;
      count: number;
    };
  };
  drops: {
    training_policy_exposed_records: number;
    training_policy_exposed_parents: number;
    training_semantic_conflict_records: number;
    training_semantic_conflict_parents: number;
    selection_policy_exposed_records: number;
    selection_policy_exposed_parents: number;
    holdout_policy_exposed_records: number;
    holdout_policy_exposed_parents: number;
    selection_conflict_records: number;
    selection_conflict_parents: number;
    parent_id_overlap_parents: number;
    semantic_position_overlap_parents: number;
    policy_exposed_unmatched_parent_ids: number;
  };
  isolation: {
    game_overlap: 0;
    parent_overlap: 0;
    position_overlap: 0;
    child_position_overlap: 0;
    selection_position_to_holdout_child_overlap: 0;
    selection_child_to_holdout_position_overlap: 0;
    semantic_position_union_overlap: 0;
    training_to_selection_semantic_position_union_overlap: 0;
    training_to_holdout_semantic_position_union_overlap: 0;
    training_to_evaluation_semantic_position_union_overlap: 0;
  };
}

export interface PartitionSiblingValidationOptions {
  sourceTrain: string;
  sourceVal: string;
  baseManifest: string;
  policyExposureReceipt: string;
  policyExposedParentIds: string;
  policyExposedSemanticPositionIds: string;
  pipelineRevision: string;
  outTrain: string;
  outModelSelection: string;
  outFinalHoldout: string;
  outProtectedPositionIds: string;
  manifest: string;
  /** Validate every input and output path, but publish nothing. */
  preflight?: boolean;
  /** Compute observed exposure accounting while the receipt is still unpinned. */
  auditPolicyExposure?: boolean;
}

export interface PartitionSiblingValidationDependencies {
  verifyRevision?: (revision: string) => Promise<PipelineProvenance>;
  verifyOutputPaths?: (
    outputs: readonly string[],
    inputs: readonly string[]
  ) => Promise<void>;
  atomicWrite?: (filePath: string, contents: Uint8Array) => Promise<void>;
  fullTeacherContract?: Readonly<SiblingFullTeacherContract>;
  policyExposureContract?: Readonly<SiblingPolicyExposureContract>;
}

interface NormalizedOptions {
  sourceTrain: string;
  sourceVal: string;
  baseManifest: string;
  policyExposureReceipt: string;
  policyExposedParentIds: string;
  policyExposedSemanticPositionIds: string;
  pipelineRevision: string;
  outTrain: string;
  outModelSelection: string;
  outFinalHoldout: string;
  outProtectedPositionIds: string;
  manifest: string;
  preflight: boolean;
  auditPolicyExposure: boolean;
}

export class PolicyExposureAuditRequiredError extends Error {
  constructor(public readonly observed: Readonly<PolicyExposureRoleAccounting>) {
    super('policy-exposure role accounting requires receipt pinning');
    this.name = 'PolicyExposureAuditRequiredError';
  }
}

interface OriginalJsonlLine {
  bytes: Buffer;
  record: SiblingRecord;
}

interface BaseManifestBinding {
  schema: typeof SIBLING_TEACHER_MANIFEST_SCHEMA;
  trainBytes: number;
  trainSha256: string;
  trainRecords: number;
  trainParents: number;
  trainGames: number;
  trainGameIdsSha256: string;
  valBytes: number;
  valSha256: string;
  valRecords: number;
  valParents: number;
  valGames: number;
  valGameIdsSha256: string;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new Error(`${name} must be a non-empty string without surrounding whitespace`);
  }
  return value;
}

function nonNegativeSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value as number;
}

function positiveSafeInteger(value: unknown, name: string): number {
  const parsed = nonNegativeSafeInteger(value, name);
  if (parsed === 0) throw new Error(`${name} must be a positive safe integer`);
  return parsed;
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  name: string
): void {
  const actual = Object.keys(value).sort(compareBytewise);
  const wanted = [...expected].sort(compareBytewise);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${name} must contain exactly ${wanted.join('/')}`);
  }
}

function lowerSha256(value: unknown, name: string): string {
  const digest = requiredText(value, name);
  if (!SHA256_PATTERN.test(digest)) throw new Error(`${name} must be a lowercase SHA-256`);
  return digest;
}

function exactFiniteNumber(value: unknown, expected: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value !== expected) {
    throw new Error(`${name} must be the finite number ${expected}`);
  }
  return value;
}

function exactValue<T>(value: unknown, expected: T, name: string): T {
  if (value !== expected || typeof value !== typeof expected) {
    throw new Error(`${name} must be ${JSON.stringify(expected)}`);
  }
  return expected;
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

function validateFileDigest(value: unknown, name: string): Record<string, unknown> {
  const digest = objectValue(value, name);
  exactKeys(digest, ['path', 'bytes', 'sha256'], name);
  requiredText(digest.path, `${name}.path`);
  nonNegativeSafeInteger(digest.bytes, `${name}.bytes`);
  lowerSha256(digest.sha256, `${name}.sha256`);
  return digest;
}

/**
 * Reject duplicate object keys before JSON.parse silently overwrites them.
 * This small recursive scanner accepts exactly JSON's grammar and is used for
 * both the base manifest and each source line.
 */
function assertNoDuplicateJsonKeys(text: string, label: string): void {
  let offset = 0;
  const whitespace = (): void => {
    while (offset < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[offset])) offset++;
  };
  const string = (): string => {
    const start = offset;
    if (text[offset++] !== '"') throw new Error(`${label} contains invalid JSON`);
    while (offset < text.length) {
      const character = text[offset++];
      if (character === '"') {
        try {
          return JSON.parse(text.slice(start, offset)) as string;
        } catch {
          throw new Error(`${label} contains invalid JSON string`);
        }
      }
      if (character === '\\') {
        const escape = text[offset++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(offset, offset + 4))) {
            throw new Error(`${label} contains invalid JSON Unicode escape`);
          }
          offset += 4;
        } else if (!'"\\/bfnrt'.includes(escape ?? '')) {
          throw new Error(`${label} contains invalid JSON escape`);
        }
      } else if (character.charCodeAt(0) < 0x20) {
        throw new Error(`${label} contains an unescaped control character`);
      }
    }
    throw new Error(`${label} contains an unterminated JSON string`);
  };
  const value = (): void => {
    whitespace();
    const character = text[offset];
    if (character === '{') {
      offset++;
      whitespace();
      const keys = new Set<string>();
      if (text[offset] === '}') {
        offset++;
        return;
      }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new Error(`${label} contains duplicate key ${JSON.stringify(key)}`);
        keys.add(key);
        whitespace();
        if (text[offset++] !== ':') throw new Error(`${label} contains invalid JSON object`);
        value();
        whitespace();
        const delimiter = text[offset++];
        if (delimiter === '}') return;
        if (delimiter !== ',') throw new Error(`${label} contains invalid JSON object`);
      }
    }
    if (character === '[') {
      offset++;
      whitespace();
      if (text[offset] === ']') {
        offset++;
        return;
      }
      while (true) {
        value();
        whitespace();
        const delimiter = text[offset++];
        if (delimiter === ']') return;
        if (delimiter !== ',') throw new Error(`${label} contains invalid JSON array`);
      }
    }
    if (character === '"') {
      string();
      return;
    }
    const remainder = text.slice(offset);
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(remainder)?.[0];
    if (!token) throw new Error(`${label} contains invalid JSON value`);
    offset += token.length;
  };
  value();
  whitespace();
  if (offset !== text.length) throw new Error(`${label} contains trailing non-JSON data`);
}

function parseJsonObject(bytes: Buffer, label: string): Record<string, unknown> {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`${label} is not valid UTF-8`);
  assertNoDuplicateJsonKeys(text, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  return objectValue(parsed, label);
}

function parseOriginalJsonl(source: Buffer, label: string): OriginalJsonlLine[] {
  if (source.length === 0) throw new Error(`${label} JSONL must not be empty`);
  if (source[source.length - 1] !== 0x0a) {
    throw new Error(`${label} JSONL must end with LF`);
  }
  const lines: OriginalJsonlLine[] = [];
  let start = 0;
  let lineNumber = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== 0x0a) continue;
    lineNumber++;
    const bytes = source.subarray(start, index + 1);
    const jsonBytes = source.subarray(start, index);
    start = index + 1;
    if (jsonBytes.toString('utf8').trim() === '') {
      throw new Error(`${label} line ${lineNumber} is blank`);
    }
    const value = parseJsonObject(jsonBytes, `${label} line ${lineNumber}`);
    lines.push({ bytes, record: value as unknown as SiblingRecord });
  }
  return lines;
}

function validateFullBaseManifestContract(
  root: Record<string, unknown>,
  contract: Readonly<SiblingFullTeacherContract>
): void {
  exactKeys(
    root,
    [
      'schema',
      'record_manifest_schema',
      'pipeline',
      'source',
      'teacher',
      'search',
      'candidate_sets',
      'progress_checkpoint',
      'split',
      'outputs',
    ],
    'base teacher manifest'
  );

  const pipeline = objectValue(root.pipeline, 'base manifest pipeline');
  exactKeys(pipeline, ['source_revision', 'tracked_tree_clean'], 'base manifest pipeline');
  exactValue(
    pipeline.source_revision,
    contract.pipelineRevision,
    'base manifest pipeline.source_revision'
  );
  exactValue(pipeline.tracked_tree_clean, true, 'base manifest pipeline.tracked_tree_clean');

  const source = objectValue(root.source, 'base manifest source');
  exactKeys(
    source,
    ['raw_sha256', 'raw_records', 'selected_parents', 'selected_parent_ids_sha256'],
    'base manifest source'
  );
  exactValue(source.raw_sha256, contract.rawSha256, 'base manifest source.raw_sha256');
  exactValue(source.raw_records, contract.rawRecords, 'base manifest source.raw_records');
  exactValue(
    source.selected_parents,
    contract.selectedParents,
    'base manifest source.selected_parents'
  );
  exactValue(
    source.selected_parent_ids_sha256,
    contract.selectedParentIdsSha256,
    'base manifest source.selected_parent_ids_sha256'
  );

  const teacher = objectValue(root.teacher, 'base manifest teacher');
  exactKeys(
    teacher,
    [
      'engine_bin_sha256',
      'engine_bin_bytes',
      'engine_args',
      'engine_arg_files',
      'engine_receipt',
      'eval_sha256',
      'eval_files',
      'runtime_snapshot',
    ],
    'base manifest teacher'
  );
  exactValue(
    teacher.engine_bin_sha256,
    contract.engineBinSha256,
    'base manifest teacher.engine_bin_sha256'
  );
  const engineBinBytes = positiveSafeInteger(
    teacher.engine_bin_bytes,
    'base manifest teacher.engine_bin_bytes'
  );
  exactValue(
    engineBinBytes,
    contract.engineBinBytes,
    'base manifest teacher.engine_bin_bytes'
  );
  if (!Array.isArray(teacher.engine_args) || teacher.engine_args.length !== 0) {
    throw new Error('base manifest teacher.engine_args must be exactly an empty array');
  }
  if (!Array.isArray(teacher.engine_arg_files) || teacher.engine_arg_files.length !== 0) {
    throw new Error('base manifest teacher.engine_arg_files must be exactly an empty array');
  }

  const receipt = objectValue(teacher.engine_receipt, 'base manifest teacher.engine_receipt');
  exactKeys(receipt, ['file', 'content'], 'base manifest teacher.engine_receipt');
  const receiptFile = validateFileDigest(
    receipt.file,
    'base manifest teacher.engine_receipt.file'
  );
  exactValue(
    receiptFile.bytes,
    contract.engineReceiptBytes,
    'base manifest teacher.engine_receipt.file.bytes'
  );
  exactValue(
    receiptFile.sha256,
    contract.engineReceiptSha256,
    'base manifest teacher.engine_receipt.file.sha256'
  );
  const receiptContent = objectValue(
    receipt.content,
    'base manifest teacher.engine_receipt.content'
  );
  exactKeys(
    receiptContent,
    [
      'schema',
      'source_repository',
      'source_commit',
      'source_commit_date',
      'build_directory',
      'build_command',
      'compiler',
      'compiler_target',
      'engine_id',
      'binary_bytes',
      'binary_sha256',
    ],
    'base manifest teacher.engine_receipt.content'
  );
  exactValue(
    receiptContent.schema,
    'shogi-teacher-engine-receipt-v1',
    'base manifest teacher.engine_receipt.content.schema'
  );
  exactValue(
    receiptContent.source_commit,
    contract.engineSourceCommit,
    'base manifest teacher.engine_receipt.content.source_commit'
  );
  for (const field of [
    'source_repository',
    'source_commit',
    'source_commit_date',
    'build_directory',
    'build_command',
    'compiler',
    'compiler_target',
    'engine_id',
  ]) {
    requiredText(
      receiptContent[field],
      `base manifest teacher.engine_receipt.content.${field}`
    );
  }
  exactValue(
    receiptContent.binary_bytes,
    engineBinBytes,
    'base manifest teacher.engine_receipt.content.binary_bytes'
  );
  exactValue(
    receiptContent.binary_sha256,
    contract.engineBinSha256,
    'base manifest teacher.engine_receipt.content.binary_sha256'
  );

  exactValue(teacher.eval_sha256, contract.evalSha256, 'base manifest teacher.eval_sha256');
  if (!Array.isArray(teacher.eval_files) || teacher.eval_files.length !== 1) {
    throw new Error('base manifest teacher.eval_files must contain exactly one snapshotted file');
  }
  const evalFiles = teacher.eval_files.map((value, index) =>
    validateFileDigest(value, `base manifest teacher.eval_files[${index}]`)
  );
  const expectedEvalSha256 = sha256(
    `eval-tree-v1\0${evalFiles.map((file) => canonicalJson(file)).join('\n')}`
  );
  if (expectedEvalSha256 !== contract.evalSha256) {
    throw new Error('base manifest teacher.eval_files do not match the pinned eval tree');
  }

  const runtime = objectValue(teacher.runtime_snapshot, 'base manifest teacher.runtime_snapshot');
  exactKeys(
    runtime,
    [
      ...Object.keys(SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT),
      'engine_argument_file_count',
      'eval_tree_present',
    ],
    'base manifest teacher.runtime_snapshot'
  );
  for (const [field, expected] of Object.entries(SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT)) {
    exactValue(runtime[field], expected, `base manifest teacher.runtime_snapshot.${field}`);
  }
  exactValue(
    runtime.engine_argument_file_count,
    0,
    'base manifest teacher.runtime_snapshot.engine_argument_file_count'
  );
  exactValue(
    runtime.eval_tree_present,
    true,
    'base manifest teacher.runtime_snapshot.eval_tree_present'
  );

  const search = objectValue(root.search, 'base manifest search');
  exactKeys(
    search,
    [
      'multipv',
      'limit',
      'parallel_engines',
      'fv_scale',
      'hash_mb_per_engine',
      'timeout_ms',
      'exact_rescore_mode',
      'label_policy',
      'tt_reset_before_proposal',
      'tt_reset_before_each_candidate',
      'search_state_reset_before_proposal',
      'search_state_reset_before_each_candidate',
      'candidate_execution_order',
      'synthesized_rank_order',
      'engine_options',
    ],
    'base manifest search'
  );
  exactValue(search.multipv, contract.multipv, 'base manifest search.multipv');
  const limit = objectValue(search.limit, 'base manifest search.limit');
  exactKeys(limit, ['depth'], 'base manifest search.limit');
  exactValue(limit.depth, contract.depth, 'base manifest search.limit.depth');
  exactValue(
    search.parallel_engines,
    contract.parallelEngines,
    'base manifest search.parallel_engines'
  );
  exactValue(search.fv_scale, contract.fvScale, 'base manifest search.fv_scale');
  exactValue(
    search.hash_mb_per_engine,
    contract.hashMbPerEngine,
    'base manifest search.hash_mb_per_engine'
  );
  exactValue(search.timeout_ms, contract.timeoutMs, 'base manifest search.timeout_ms');
  exactValue(
    search.exact_rescore_mode,
    INDEPENDENT_EXACT_RESCORE_MODE,
    'base manifest search.exact_rescore_mode'
  );
  exactValue(
    search.label_policy,
    SIBLING_TEACHER_LABEL_POLICY,
    'base manifest search.label_policy'
  );
  exactValue(search.tt_reset_before_proposal, true, 'base manifest search.tt_reset_before_proposal');
  exactValue(
    search.tt_reset_before_each_candidate,
    true,
    'base manifest search.tt_reset_before_each_candidate'
  );
  exactValue(
    search.search_state_reset_before_proposal,
    'isready',
    'base manifest search.search_state_reset_before_proposal'
  );
  exactValue(
    search.search_state_reset_before_each_candidate,
    'isready',
    'base manifest search.search_state_reset_before_each_candidate'
  );
  exactValue(
    search.candidate_execution_order,
    'utf8-bytewise-ascending',
    'base manifest search.candidate_execution_order'
  );
  exactValue(
    search.synthesized_rank_order,
    'cp-descending-then-utf8-bytewise-move',
    'base manifest search.synthesized_rank_order'
  );
  const engineOptions = objectValue(search.engine_options, 'base manifest search.engine_options');
  exactKeys(
    engineOptions,
    [
      'threads',
      'usi_own_book',
      'book_file',
      'network_delay_ms',
      'network_delay2_ms',
      'search_state_reset_trigger',
    ],
    'base manifest search.engine_options'
  );
  for (const [field, expected] of Object.entries({
    threads: 1,
    usi_own_book: false,
    book_file: 'no_book',
    network_delay_ms: 0,
    network_delay2_ms: 0,
    search_state_reset_trigger: 'isready',
  })) {
    exactValue(engineOptions[field], expected, `base manifest search.engine_options.${field}`);
  }

  const candidateSets = objectValue(root.candidate_sets, 'base manifest candidate_sets');
  exactKeys(
    candidateSets,
    ['sha256', 'parents', 'candidates', 'min_candidates', 'max_candidates', 'skipped_parents'],
    'base manifest candidate_sets'
  );
  lowerSha256(candidateSets.sha256, 'base manifest candidate_sets.sha256');
  const candidateParents = positiveSafeInteger(
    candidateSets.parents,
    'base manifest candidate_sets.parents'
  );
  const candidateCount = positiveSafeInteger(
    candidateSets.candidates,
    'base manifest candidate_sets.candidates'
  );
  const minCandidates = positiveSafeInteger(
    candidateSets.min_candidates,
    'base manifest candidate_sets.min_candidates'
  );
  const maxCandidates = positiveSafeInteger(
    candidateSets.max_candidates,
    'base manifest candidate_sets.max_candidates'
  );
  const skippedParents = nonNegativeSafeInteger(
    candidateSets.skipped_parents,
    'base manifest candidate_sets.skipped_parents'
  );
  if (
    minCandidates < 2 ||
    maxCandidates < minCandidates ||
    candidateCount < candidateParents * minCandidates ||
    candidateCount > candidateParents * maxCandidates ||
    candidateParents + skippedParents !== contract.selectedParents
  ) {
    throw new Error('base manifest candidate-set accounting is inconsistent');
  }

  const progress = objectValue(root.progress_checkpoint, 'base manifest progress_checkpoint');
  exactKeys(
    progress,
    ['schema', 'run_fingerprint', 'entries', 'completed_parents', 'skipped_parents', 'sha256'],
    'base manifest progress_checkpoint'
  );
  exactValue(
    progress.schema,
    'shogi-sibling-teacher-work-v2',
    'base manifest progress_checkpoint.schema'
  );
  lowerSha256(progress.run_fingerprint, 'base manifest progress_checkpoint.run_fingerprint');
  const progressEntries = positiveSafeInteger(
    progress.entries,
    'base manifest progress_checkpoint.entries'
  );
  const completedParents = positiveSafeInteger(
    progress.completed_parents,
    'base manifest progress_checkpoint.completed_parents'
  );
  const progressSkipped = nonNegativeSafeInteger(
    progress.skipped_parents,
    'base manifest progress_checkpoint.skipped_parents'
  );
  lowerSha256(progress.sha256, 'base manifest progress_checkpoint.sha256');
  if (
    progressEntries !== contract.selectedParents ||
    completedParents !== candidateParents ||
    progressSkipped !== skippedParents ||
    completedParents + progressSkipped !== progressEntries
  ) {
    throw new Error('base manifest progress checkpoint is incomplete or inconsistent');
  }

  const split = objectValue(root.split, 'base manifest split');
  exactKeys(
    split,
    [
      'schema',
      'record_schema',
      'schema_version',
      'split_seed',
      'val_ratio',
      'train_game_ids_sha256',
      'val_game_ids_sha256',
      'stats',
    ],
    'base manifest split'
  );
  exactValue(split.schema, SIBLING_MANIFEST_SCHEMA, 'base manifest split.schema');
  exactValue(split.record_schema, SIBLING_SCHEMA, 'base manifest split.record_schema');
  exactValue(split.schema_version, 1, 'base manifest split.schema_version');
  exactValue(split.split_seed, contract.splitSeed, 'base manifest split.split_seed');
  exactFiniteNumber(split.val_ratio, contract.valRatio, 'base manifest split.val_ratio');
  exactValue(
    split.train_game_ids_sha256,
    contract.trainGameIdsSha256,
    'base manifest split.train_game_ids_sha256'
  );
  exactValue(
    split.val_game_ids_sha256,
    contract.valGameIdsSha256,
    'base manifest split.val_game_ids_sha256'
  );

  const stats = objectValue(split.stats, 'base manifest split.stats');
  const statsFields = [
    'input_records',
    'output_records',
    'input_parents',
    'output_parents',
    'input_games',
    'train_records',
    'val_records',
    'train_parents',
    'val_parents',
    'train_games',
    'val_games',
    'val_position_priority_dropped_records',
    'val_position_priority_dropped_parents',
    'val_child_position_priority_dropped_records',
    'val_child_position_priority_dropped_parents',
    'game_overlap',
    'position_overlap',
    'child_position_overlap',
  ] as const;
  exactKeys(stats, statsFields, 'base manifest split.stats');
  const parsedStats = Object.fromEntries(
    statsFields.map((field) => [
      field,
      nonNegativeSafeInteger(stats[field], `base manifest split.stats.${field}`),
    ])
  ) as Record<(typeof statsFields)[number], number>;
  if (
    parsedStats.input_records !== candidateCount ||
    parsedStats.input_parents !== candidateParents ||
    parsedStats.input_games !== contract.sourceGames ||
    parsedStats.output_records !== parsedStats.train_records + parsedStats.val_records ||
    parsedStats.output_parents !== parsedStats.train_parents + parsedStats.val_parents ||
    parsedStats.train_games !== SIBLING_MODEL_TRAINING_GAMES ||
    parsedStats.val_games !== SIBLING_EVAL_EXPECTED_SOURCE_GAMES ||
    parsedStats.input_records - parsedStats.output_records !==
      parsedStats.val_position_priority_dropped_records +
        parsedStats.val_child_position_priority_dropped_records ||
    parsedStats.input_parents - parsedStats.output_parents !==
      parsedStats.val_position_priority_dropped_parents +
        parsedStats.val_child_position_priority_dropped_parents ||
    parsedStats.game_overlap !== 0 ||
    parsedStats.position_overlap !== 0 ||
    parsedStats.child_position_overlap !== 0
  ) {
    throw new Error('base manifest split accounting is inconsistent');
  }

  const outputs = objectValue(root.outputs, 'base manifest outputs');
  exactKeys(outputs, ['train_sha256', 'val_sha256', 'train_bytes', 'val_bytes'], 'base manifest outputs');
  lowerSha256(outputs.train_sha256, 'base manifest outputs.train_sha256');
  lowerSha256(outputs.val_sha256, 'base manifest outputs.val_sha256');
  positiveSafeInteger(outputs.train_bytes, 'base manifest outputs.train_bytes');
  positiveSafeInteger(outputs.val_bytes, 'base manifest outputs.val_bytes');
}

function parseBaseManifest(
  bytes: Buffer,
  contract: Readonly<SiblingFullTeacherContract>
): BaseManifestBinding {
  const root = parseJsonObject(bytes, 'base teacher manifest');
  validateFullBaseManifestContract(root, contract);
  exactValue(root.schema, SIBLING_TEACHER_MANIFEST_SCHEMA, 'base manifest schema');
  exactValue(
    root.record_manifest_schema,
    SIBLING_MANIFEST_SCHEMA,
    'base manifest record_manifest_schema'
  );

  const pipeline = objectValue(root.pipeline, 'base manifest pipeline');
  const sourceRevision = requiredText(
    pipeline.source_revision,
    'base manifest pipeline.source_revision'
  );
  if (!GIT_REVISION_PATTERN.test(sourceRevision)) {
    throw new Error('base manifest pipeline.source_revision must be a lowercase 40-digit commit');
  }
  exactValue(
    pipeline.tracked_tree_clean,
    true,
    'base manifest pipeline.tracked_tree_clean'
  );

  const search = objectValue(root.search, 'base manifest search');
  exactValue(search.label_policy, SIBLING_TEACHER_LABEL_POLICY, 'base manifest search.label_policy');
  exactValue(
    search.exact_rescore_mode,
    INDEPENDENT_EXACT_RESCORE_MODE,
    'base manifest search.exact_rescore_mode'
  );
  exactValue(
    search.search_state_reset_before_proposal,
    'isready',
    'base manifest search.search_state_reset_before_proposal'
  );
  exactValue(
    search.search_state_reset_before_each_candidate,
    'isready',
    'base manifest search.search_state_reset_before_each_candidate'
  );
  exactValue(search.tt_reset_before_proposal, true, 'base manifest search.tt_reset_before_proposal');
  exactValue(
    search.tt_reset_before_each_candidate,
    true,
    'base manifest search.tt_reset_before_each_candidate'
  );
  exactValue(
    search.candidate_execution_order,
    'utf8-bytewise-ascending',
    'base manifest search.candidate_execution_order'
  );
  exactValue(
    search.synthesized_rank_order,
    'cp-descending-then-utf8-bytewise-move',
    'base manifest search.synthesized_rank_order'
  );

  const teacher = objectValue(root.teacher, 'base manifest teacher');
  const engineBinSha256 = requiredText(
    teacher.engine_bin_sha256,
    'base manifest teacher.engine_bin_sha256'
  );
  if (!SHA256_PATTERN.test(engineBinSha256)) {
    throw new Error('base manifest teacher.engine_bin_sha256 must be a lowercase SHA-256');
  }
  const engineBinBytes = nonNegativeSafeInteger(
    teacher.engine_bin_bytes,
    'base manifest teacher.engine_bin_bytes'
  );
  if (engineBinBytes === 0) throw new Error('base manifest teacher.engine_bin_bytes must be positive');
  if (!Array.isArray(teacher.engine_args) || teacher.engine_args.some((value) => typeof value !== 'string')) {
    throw new Error('base manifest teacher.engine_args must be a string array');
  }
  if (!Array.isArray(teacher.engine_arg_files)) {
    throw new Error('base manifest teacher.engine_arg_files must be an array');
  }
  teacher.engine_arg_files.forEach((value, index) =>
    validateFileDigest(value, `base manifest teacher.engine_arg_files[${index}]`)
  );
  if (!Array.isArray(teacher.eval_files)) {
    throw new Error('base manifest teacher.eval_files must be an array');
  }
  const evalFiles = teacher.eval_files.map((value, index) =>
    validateFileDigest(value, `base manifest teacher.eval_files[${index}]`)
  );
  const runtime = objectValue(teacher.runtime_snapshot, 'base manifest teacher.runtime_snapshot');
  for (const [field, expected] of Object.entries(SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT)) {
    exactValue(runtime[field], expected, `base manifest teacher.runtime_snapshot.${field}`);
  }
  const argumentFileCount = nonNegativeSafeInteger(
    runtime.engine_argument_file_count,
    'base manifest teacher.runtime_snapshot.engine_argument_file_count'
  );
  if (argumentFileCount !== teacher.engine_arg_files.length) {
    throw new Error('base manifest runtime engine argument file count is inconsistent');
  }
  if (typeof runtime.eval_tree_present !== 'boolean') {
    throw new Error('base manifest teacher.runtime_snapshot.eval_tree_present must be boolean');
  }
  if (runtime.eval_tree_present) {
    if (evalFiles.length === 0) throw new Error('base manifest present eval tree has no files');
    const expectedEvalSha256 = sha256(
      `eval-tree-v1\0${evalFiles.map((file) => canonicalJson(file)).join('\n')}`
    );
    exactValue(teacher.eval_sha256, expectedEvalSha256, 'base manifest teacher.eval_sha256');
  } else {
    exactValue(teacher.eval_sha256, null, 'base manifest teacher.eval_sha256');
    if (evalFiles.length !== 0) throw new Error('base manifest absent eval tree lists eval files');
  }

  const outputs = objectValue(root.outputs, 'base manifest outputs');
  const trainBytes = nonNegativeSafeInteger(
    outputs.train_bytes,
    'base manifest outputs.train_bytes'
  );
  const trainSha256 = requiredText(outputs.train_sha256, 'base manifest outputs.train_sha256');
  if (!SHA256_PATTERN.test(trainSha256)) {
    throw new Error('base manifest outputs.train_sha256 must be a lowercase SHA-256 digest');
  }
  const valBytes = nonNegativeSafeInteger(outputs.val_bytes, 'base manifest outputs.val_bytes');
  const valSha256 = requiredText(outputs.val_sha256, 'base manifest outputs.val_sha256');
  if (!SHA256_PATTERN.test(valSha256)) {
    throw new Error('base manifest outputs.val_sha256 must be a lowercase SHA-256 digest');
  }

  const split = objectValue(root.split, 'base manifest split');
  exactValue(split.schema, SIBLING_MANIFEST_SCHEMA, 'base manifest split.schema');
  exactValue(split.record_schema, SIBLING_SCHEMA, 'base manifest split.record_schema');
  exactValue(split.schema_version, 1, 'base manifest split.schema_version');
  const stats = objectValue(split.stats, 'base manifest split.stats');
  const trainRecords = nonNegativeSafeInteger(
    stats.train_records,
    'base manifest split.stats.train_records'
  );
  const trainParents = nonNegativeSafeInteger(
    stats.train_parents,
    'base manifest split.stats.train_parents'
  );
  const trainGames = nonNegativeSafeInteger(
    stats.train_games,
    'base manifest split.stats.train_games'
  );
  const valRecords = nonNegativeSafeInteger(stats.val_records, 'base manifest split.stats.val_records');
  const valParents = nonNegativeSafeInteger(stats.val_parents, 'base manifest split.stats.val_parents');
  const valGames = nonNegativeSafeInteger(stats.val_games, 'base manifest split.stats.val_games');
  exactValue(stats.game_overlap, 0, 'base manifest split.stats.game_overlap');
  exactValue(stats.position_overlap, 0, 'base manifest split.stats.position_overlap');
  exactValue(
    stats.child_position_overlap,
    0,
    'base manifest split.stats.child_position_overlap'
  );
  const trainGameIdsSha256 = requiredText(
    split.train_game_ids_sha256,
    'base manifest split.train_game_ids_sha256'
  );
  if (!SHA256_PATTERN.test(trainGameIdsSha256)) {
    throw new Error('base manifest split.train_game_ids_sha256 must be a lowercase SHA-256 digest');
  }
  const valGameIdsSha256 = requiredText(
    split.val_game_ids_sha256,
    'base manifest split.val_game_ids_sha256'
  );
  if (!SHA256_PATTERN.test(valGameIdsSha256)) {
    throw new Error('base manifest split.val_game_ids_sha256 must be a lowercase SHA-256 digest');
  }
  return {
    schema: SIBLING_TEACHER_MANIFEST_SCHEMA,
    trainBytes,
    trainSha256,
    trainRecords,
    trainParents,
    trainGames,
    trainGameIdsSha256,
    valBytes,
    valSha256,
    valRecords,
    valParents,
    valGames,
    valGameIdsSha256,
  };
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareBytewise);
}

function idSetSha256(values: Iterable<string>): string {
  return sha256(sortedUnique(values).join('\n'));
}

function loadSortedIdentifierFile(
  bytes: Buffer,
  expected: { bytes: number; sha256: string; count: number; identifiersSha256: string },
  label: string
): string[] {
  if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`${label} bytes do not match the pinned policy-exposure receipt`);
  }
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a || bytes.includes(0x0d)) {
    throw new Error(`${label} must be non-empty, LF-terminated, and contain no CR`);
  }
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new Error(`${label} are not valid UTF-8`);
  }
  const lines = text.slice(0, -1).split('\n');
  if (lines.some((line) => !/^sha256:[0-9a-f]{64}$/.test(line))) {
    throw new Error(`${label} contain an invalid identifier`);
  }
  if (
    lines.length !== expected.count ||
    new Set(lines).size !== lines.length ||
    lines.some((line, index) => index > 0 && compareBytewise(lines[index - 1], line) >= 0)
  ) {
    throw new Error(`${label} must be the exact sorted unique pinned identifier set`);
  }
  if (idSetSha256(lines) !== expected.identifiersSha256) {
    throw new Error(`${label} set digest does not match the policy-exposure receipt`);
  }
  return lines;
}

function loadPolicyExposure(
  receiptBytes: Buffer,
  parentIdsBytes: Buffer,
  semanticIdsBytes: Buffer,
  contract: Readonly<SiblingPolicyExposureContract>,
  allowUnpinnedRoleAccounting: boolean
): {
  parentIds: Set<string>;
  semanticIds: Set<string>;
  receipt: SiblingEvalPartitionManifest['source']['policy_exposure_receipt'];
  parents: SiblingEvalPartitionManifest['source']['policy_exposed_parent_ids'];
  semantic: SiblingEvalPartitionManifest['source']['policy_exposed_semantic_position_ids'];
} {
  if (
    receiptBytes.byteLength !== contract.receiptBytes ||
    sha256(receiptBytes) !== contract.receiptSha256
  ) {
    throw new Error('policy-exposure receipt bytes do not match the pinned Lane A union');
  }
  const receipt = parseJsonObject(receiptBytes, 'policy-exposure receipt');
  exactKeys(
    receipt,
    [
      'schema',
      'policy_decision',
      'derivation',
      'parent_ids',
      'semantic_position_ids',
      'source_artifacts',
      'role_accounting',
    ],
    'policy-exposure receipt'
  );
  exactValue(
    receipt.schema,
    SIBLING_POLICY_EXPOSURE_RECEIPT_SCHEMA,
    'policy-exposure receipt.schema'
  );
  exactValue(
    receipt.policy_decision,
    'wcsc36-depth16-lane-a-v1',
    'policy-exposure receipt.policy_decision'
  );
  exactValue(
    receipt.derivation,
    'union-of-position-id-and-child-position-id-from-all-committed-parent-records',
    'policy-exposure receipt.derivation'
  );
  if (!Array.isArray(receipt.source_artifacts) || receipt.source_artifacts.length === 0) {
    throw new Error('policy-exposure receipt.source_artifacts must be a non-empty array');
  }
  receipt.source_artifacts.forEach((value, index) =>
    validateFileDigest(value, `policy-exposure receipt.source_artifacts[${index}]`)
  );

  const parentReceipt = objectValue(receipt.parent_ids, 'policy-exposure receipt.parent_ids');
  exactKeys(
    parentReceipt,
    ['path', 'format', 'bytes', 'sha256', 'count', 'identifiers_sha256'],
    'policy-exposure receipt.parent_ids'
  );
  const semanticReceipt = objectValue(
    receipt.semantic_position_ids,
    'policy-exposure receipt.semantic_position_ids'
  );
  exactKeys(
    semanticReceipt,
    ['path', 'format', 'bytes', 'sha256', 'count', 'identifiers_sha256'],
    'policy-exposure receipt.semantic_position_ids'
  );
  for (const [object, expected, label] of [
    [
      parentReceipt,
      {
        format: contract.parentIdsFormat,
        bytes: contract.parentIdsBytes,
        sha256: contract.parentIdsSha256,
        count: contract.parentIdsCount,
        identifiers_sha256: contract.parentIdentifiersSha256,
      },
      'parent_ids',
    ],
    [
      semanticReceipt,
      {
        format: contract.semanticIdsFormat,
        bytes: contract.semanticIdsBytes,
        sha256: contract.semanticIdsSha256,
        count: contract.semanticIdsCount,
        identifiers_sha256: contract.semanticIdentifiersSha256,
      },
      'semantic_position_ids',
    ],
  ] as const) {
    requiredText(object.path, `policy-exposure receipt.${label}.path`);
    for (const [field, value] of Object.entries(expected)) {
      exactValue(object[field], value, `policy-exposure receipt.${label}.${field}`);
    }
  }

  const parentLines = loadSortedIdentifierFile(
    parentIdsBytes,
    {
      bytes: contract.parentIdsBytes,
      sha256: contract.parentIdsSha256,
      count: contract.parentIdsCount,
      identifiersSha256: contract.parentIdentifiersSha256,
    },
    'policy-exposed parent IDs'
  );
  const semanticLines = loadSortedIdentifierFile(
    semanticIdsBytes,
    {
      bytes: contract.semanticIdsBytes,
      sha256: contract.semanticIdsSha256,
      count: contract.semanticIdsCount,
      identifiersSha256: contract.semanticIdentifiersSha256,
    },
    'policy-exposed semantic position IDs'
  );

  if (contract.roleAccounting === null || receipt.role_accounting === null) {
    if (
      !allowUnpinnedRoleAccounting ||
      contract.roleAccounting !== null ||
      receipt.role_accounting !== null
    ) {
      throw new Error(
        'policy-exposure role accounting is not pinned; run --audit-policy-exposure first'
      );
    }
  } else {
  const role = objectValue(receipt.role_accounting, 'policy-exposure receipt.role_accounting');
  exactKeys(
    role,
    [
      'training_parents',
      'training_records',
      'selection_parents',
      'selection_records',
      'holdout_parents',
      'holdout_records',
      'unmatched_parent_ids',
    ],
    'policy-exposure receipt.role_accounting'
  );
  for (const [field, expected] of Object.entries({
    training_parents: contract.roleAccounting.trainingParents,
    training_records: contract.roleAccounting.trainingRecords,
    selection_parents: contract.roleAccounting.selectionParents,
    selection_records: contract.roleAccounting.selectionRecords,
    holdout_parents: contract.roleAccounting.holdoutParents,
    holdout_records: contract.roleAccounting.holdoutRecords,
    unmatched_parent_ids: contract.roleAccounting.unmatchedParentIds,
  })) {
    exactValue(role[field], expected, `policy-exposure receipt.role_accounting.${field}`);
  }
  }

  return {
    parentIds: new Set(parentLines),
    semanticIds: new Set(semanticLines),
    receipt: {
      schema: SIBLING_POLICY_EXPOSURE_RECEIPT_SCHEMA,
      bytes: receiptBytes.byteLength,
      sha256: sha256(receiptBytes),
    },
    parents: {
      format: contract.parentIdsFormat,
      bytes: parentIdsBytes.byteLength,
      sha256: sha256(parentIdsBytes),
      count: parentLines.length,
      identifiers_sha256: contract.parentIdentifiersSha256,
    },
    semantic: {
      format: contract.semanticIdsFormat,
      bytes: semanticIdsBytes.byteLength,
      sha256: sha256(semanticIdsBytes),
      count: semanticLines.length,
      identifiers_sha256: contract.semanticIdentifiersSha256,
    },
  };
}

/** SHA-256(UTF8(domain) || NUL || UTF8(seed) || NUL || UTF8(game_id)). */
export function siblingEvalGameRankDigest(gameId: string): Buffer {
  const id = requiredText(gameId, 'game_id');
  return createHash('sha256')
    .update(SIBLING_EVAL_PARTITION_DOMAIN, 'utf8')
    .update(Buffer.from([0]))
    .update(SIBLING_EVAL_PARTITION_SEED, 'utf8')
    .update(Buffer.from([0]))
    .update(id, 'utf8')
    .digest();
}

export function rankSiblingEvalGames(gameIds: Iterable<string>): string[] {
  const ranked = sortedUnique([...gameIds].map((gameId) => requiredText(gameId, 'game_id')))
    .map((gameId) => ({ gameId, digest: siblingEvalGameRankDigest(gameId) }));
  ranked.sort((left, right) =>
    Buffer.compare(left.digest, right.digest) || compareBytewise(left.gameId, right.gameId)
  );
  return ranked.map(({ gameId }) => gameId);
}

function setIntersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count++;
  return count;
}

function positionSets(records: readonly SiblingRecord[]): {
  parents: Set<string>;
  children: Set<string>;
  union: Set<string>;
} {
  const parents = new Set(records.map((record) => record.position_id));
  const children = new Set(records.map((record) => record.child_position_id));
  return { parents, children, union: new Set([...parents, ...children]) };
}

function datasetDigest(bytes: Buffer, records: readonly SiblingRecord[]): DatasetDigest {
  const semanticPositionIds = positionSets(records).union;
  return {
    format: SIBLING_EVAL_JSONL_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records: records.length,
    parents: new Set(records.map((record) => record.parent_id)).size,
    games: new Set(records.map((record) => record.game_id)).size,
    game_ids_sha256: idSetSha256(records.map((record) => record.game_id)),
    semantic_position_ids_count: semanticPositionIds.size,
    semantic_position_ids_sha256: idSetSha256(semanticPositionIds),
  };
}

function normalizeOptions(options: PartitionSiblingValidationOptions): NormalizedOptions {
  const normalized: NormalizedOptions = {
    sourceTrain: path.resolve(requiredText(options.sourceTrain, 'sourceTrain')),
    sourceVal: path.resolve(requiredText(options.sourceVal, 'sourceVal')),
    baseManifest: path.resolve(requiredText(options.baseManifest, 'baseManifest')),
    policyExposureReceipt: path.resolve(
      requiredText(options.policyExposureReceipt, 'policyExposureReceipt')
    ),
    policyExposedParentIds: path.resolve(
      requiredText(options.policyExposedParentIds, 'policyExposedParentIds')
    ),
    policyExposedSemanticPositionIds: path.resolve(
      requiredText(
        options.policyExposedSemanticPositionIds,
        'policyExposedSemanticPositionIds'
      )
    ),
    pipelineRevision: requiredText(options.pipelineRevision, 'pipelineRevision'),
    outTrain: path.resolve(requiredText(options.outTrain, 'outTrain')),
    outModelSelection: path.resolve(requiredText(options.outModelSelection, 'outModelSelection')),
    outFinalHoldout: path.resolve(requiredText(options.outFinalHoldout, 'outFinalHoldout')),
    outProtectedPositionIds: path.resolve(
      requiredText(options.outProtectedPositionIds, 'outProtectedPositionIds')
    ),
    manifest: path.resolve(requiredText(options.manifest, 'manifest')),
    preflight: options.preflight === true || options.auditPolicyExposure === true,
    auditPolicyExposure: options.auditPolicyExposure === true,
  };
  if (!GIT_REVISION_PATTERN.test(normalized.pipelineRevision)) {
    throw new Error('pipelineRevision must be a lowercase 40-digit Git commit');
  }
  const outputs = [
    normalized.outTrain,
    normalized.outModelSelection,
    normalized.outFinalHoldout,
    normalized.outProtectedPositionIds,
    normalized.manifest,
  ];
  if (new Set(outputs).size !== outputs.length) {
    throw new Error('partition output paths must all be different');
  }
  if (
    outputs.includes(normalized.sourceTrain) ||
    outputs.includes(normalized.sourceVal) ||
    outputs.includes(normalized.baseManifest) ||
    outputs.includes(normalized.policyExposureReceipt) ||
    outputs.includes(normalized.policyExposedParentIds) ||
    outputs.includes(normalized.policyExposedSemanticPositionIds)
  ) {
    throw new Error('partition output path must not overwrite an input');
  }
  return normalized;
}

async function durableAtomicWrite(filePath: string, contents: Uint8Array): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.promises.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  );
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(temporary, 'wx', 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.promises.rename(temporary, filePath);
    const directoryHandle = await fs.promises.open(directory, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.promises.rm(temporary, { force: true });
  }
}

function assertInputBindings(
  sourceTrainBytes: Buffer,
  sourceValBytes: Buffer,
  manifestBytes: Buffer,
  base: BaseManifestBinding,
  trainRecords: readonly SiblingRecord[],
  valRecords: readonly SiblingRecord[]
): void {
  if (
    sourceTrainBytes.byteLength !== base.trainBytes ||
    sha256(sourceTrainBytes) !== base.trainSha256
  ) {
    throw new Error('source training bytes do not match base teacher manifest outputs.train');
  }
  if (sourceValBytes.byteLength !== base.valBytes || sha256(sourceValBytes) !== base.valSha256) {
    throw new Error('source validation bytes do not match base teacher manifest outputs.val');
  }
  const trainSummaries = validateParentGroups(trainRecords);
  const valSummaries = validateParentGroups(valRecords);
  if (trainRecords.some((record) => record.split !== 'train')) {
    throw new Error('source training contains a record without split=train');
  }
  if (valRecords.some((record) => record.split !== 'val')) {
    throw new Error('source validation contains a record without split=val');
  }
  const trainGames = new Set(trainRecords.map((record) => record.game_id));
  const valGames = new Set(valRecords.map((record) => record.game_id));
  if (
    trainRecords.length !== base.trainRecords ||
    trainSummaries.length !== base.trainParents ||
    trainGames.size !== base.trainGames
  ) {
    throw new Error('source training counts do not match base teacher manifest split stats');
  }
  if (
    valRecords.length !== base.valRecords ||
    valSummaries.length !== base.valParents ||
    valGames.size !== base.valGames
  ) {
    throw new Error('source validation counts do not match base teacher manifest split stats');
  }
  if (idSetSha256(trainGames) !== base.trainGameIdsSha256) {
    throw new Error('source training game IDs do not match base teacher manifest split digest');
  }
  if (idSetSha256(valGames) !== base.valGameIdsSha256) {
    throw new Error('source validation game IDs do not match base teacher manifest split digest');
  }
  if (trainGames.size !== SIBLING_MODEL_TRAINING_GAMES) {
    throw new Error(
      `source training must contain exactly ${SIBLING_MODEL_TRAINING_GAMES} games ` +
      `(got ${trainGames.size})`
    );
  }
  if (valGames.size !== SIBLING_EVAL_EXPECTED_SOURCE_GAMES) {
    throw new Error(
      `source validation must contain exactly ${SIBLING_EVAL_EXPECTED_SOURCE_GAMES} games ` +
      `(got ${valGames.size})`
    );
  }
  if (setIntersectionSize(trainGames, valGames) !== 0) {
    throw new Error('source training and validation game IDs overlap');
  }
  if (manifestBytes.length === 0) throw new Error('base teacher manifest must not be empty');
}

/** Validate, partition, and (unless preflight) durably publish all five artifacts. */
export async function partitionSiblingValidation(
  rawOptions: PartitionSiblingValidationOptions,
  dependencies: PartitionSiblingValidationDependencies = {}
): Promise<SiblingEvalPartitionManifest> {
  const options = normalizeOptions(rawOptions);
  const fullTeacherContract =
    dependencies.fullTeacherContract ?? SIBLING_FULL_TEACHER_CONTRACT;
  const policyExposureContract =
    dependencies.policyExposureContract ?? SIBLING_POLICY_EXPOSURE_CONTRACT;
  const repositoryDirectory = path.resolve(__dirname, '..');
  const revisionVerifier = dependencies.verifyRevision ?? ((revision: string) =>
    verifyPipelineRevision(revision, { repositoryDirectory }));
  const outputVerifier = dependencies.verifyOutputPaths ?? (
    (outputs: readonly string[], inputs: readonly string[]) =>
      verifyPipelineOutputPaths(outputs, { repositoryDirectory, inputPaths: inputs })
  );
  const atomicWrite = dependencies.atomicWrite ?? durableAtomicWrite;
  const outputPaths = [
    options.outTrain,
    options.outModelSelection,
    options.outFinalHoldout,
    options.outProtectedPositionIds,
    options.manifest,
  ];
  const inputPaths = [
    options.sourceTrain,
    options.sourceVal,
    options.baseManifest,
    options.policyExposureReceipt,
    options.policyExposedParentIds,
    options.policyExposedSemanticPositionIds,
  ];

  const pipeline = await revisionVerifier(options.pipelineRevision);
  await outputVerifier(outputPaths, inputPaths);
  const [
    sourceTrainBytes,
    sourceValBytes,
    manifestBytes,
    policyExposureReceiptBytes,
    policyExposedParentIdsBytes,
    policyExposedSemanticPositionIdsBytes,
  ] =
    await Promise.all([
      fs.promises.readFile(options.sourceTrain),
      fs.promises.readFile(options.sourceVal),
      fs.promises.readFile(options.baseManifest),
      fs.promises.readFile(options.policyExposureReceipt),
      fs.promises.readFile(options.policyExposedParentIds),
      fs.promises.readFile(options.policyExposedSemanticPositionIds),
    ]);
  const base = parseBaseManifest(manifestBytes, fullTeacherContract);
  const policyExposure = loadPolicyExposure(
    policyExposureReceiptBytes,
    policyExposedParentIdsBytes,
    policyExposedSemanticPositionIdsBytes,
    policyExposureContract,
    options.auditPolicyExposure
  );
  const trainLines = parseOriginalJsonl(sourceTrainBytes, 'source training');
  const valLines = parseOriginalJsonl(sourceValBytes, 'source validation');
  const trainRecords = trainLines.map((line) => line.record);
  const valRecords = valLines.map((line) => line.record);
  assertInputBindings(
    sourceTrainBytes,
    sourceValBytes,
    manifestBytes,
    base,
    trainRecords,
    valRecords
  );

  const sourceTrainGameIds = new Set(trainRecords.map((record) => record.game_id));
  const sourceValGameIds = new Set(valRecords.map((record) => record.game_id));
  const rankedGames = rankSiblingEvalGames(sourceValGameIds);
  const holdoutGameIds = new Set(rankedGames.slice(0, SIBLING_EVAL_FINAL_HOLDOUT_GAMES));
  if (holdoutGameIds.size !== SIBLING_EVAL_FINAL_HOLDOUT_GAMES) {
    throw new Error('could not satisfy the exact final holdout game quota');
  }

  const valGroups = new Map<string, SiblingRecord[]>();
  for (const record of valRecords) {
    const group = valGroups.get(record.parent_id) ?? [];
    group.push(record);
    valGroups.set(record.parent_id, group);
  }
  const groupTouchesPolicyExposure = (
    parentId: string,
    group: readonly SiblingRecord[]
  ): boolean =>
    policyExposure.parentIds.has(parentId) ||
    group.some(
      (record) =>
        policyExposure.semanticIds.has(record.position_id) ||
        policyExposure.semanticIds.has(record.child_position_id)
    );
  let selectionPolicyExposedRecords = 0;
  let selectionPolicyExposedParents = 0;
  let holdoutPolicyExposedRecords = 0;
  let holdoutPolicyExposedParents = 0;
  for (const [parentId, group] of valGroups) {
    if (!groupTouchesPolicyExposure(parentId, group)) continue;
    if (holdoutGameIds.has(group[0].game_id)) {
      holdoutPolicyExposedParents++;
      holdoutPolicyExposedRecords += group.length;
    } else {
      selectionPolicyExposedParents++;
      selectionPolicyExposedRecords += group.length;
    }
  }
  if (
    policyExposureContract.roleAccounting !== null &&
    (
    selectionPolicyExposedParents !== policyExposureContract.roleAccounting!.selectionParents ||
    selectionPolicyExposedRecords !== policyExposureContract.roleAccounting!.selectionRecords ||
    holdoutPolicyExposedParents !== policyExposureContract.roleAccounting!.holdoutParents ||
    holdoutPolicyExposedRecords !== policyExposureContract.roleAccounting!.holdoutRecords
    )
  ) {
    throw new Error(
      'policy exposure audit does not match the pinned selection and holdout role accounting'
    );
  }
  const holdoutEligibleParentIds = new Set(
    [...valGroups]
      .filter(
        ([parentId, group]) =>
          holdoutGameIds.has(group[0].game_id) &&
          !groupTouchesPolicyExposure(parentId, group)
      )
      .map(([parentId]) => parentId)
  );
  const holdoutRecords = valRecords.filter((record) =>
    holdoutEligibleParentIds.has(record.parent_id)
  );
  const holdoutParentIds = new Set(holdoutRecords.map((record) => record.parent_id));
  const holdoutPositions = positionSets(holdoutRecords);
  const selectionParentIds = new Set<string>();
  let selectionConflictRecords = 0;
  let selectionConflictParents = 0;
  let parentIdOverlapParents = 0;
  let semanticPositionOverlapParents = 0;

  for (const [parentId, group] of valGroups) {
    if (groupTouchesPolicyExposure(parentId, group)) continue;
    if (holdoutGameIds.has(group[0].game_id)) continue;
    const parentIdOverlap = holdoutParentIds.has(parentId);
    const semanticOverlap = group.some((record) =>
      holdoutPositions.union.has(record.position_id) ||
      holdoutPositions.union.has(record.child_position_id)
    );
    if (parentIdOverlap) parentIdOverlapParents++;
    if (semanticOverlap) semanticPositionOverlapParents++;
    if (parentIdOverlap || semanticOverlap) {
      selectionConflictParents++;
      selectionConflictRecords += group.length;
      continue;
    }
    selectionParentIds.add(parentId);
  }

  const selectionRecords = valRecords.filter((record) => selectionParentIds.has(record.parent_id));
  if (selectionRecords.length === 0) {
    throw new Error('semantic isolation removed every model-selection parent');
  }
  validateParentGroups(selectionRecords);
  validateParentGroups(holdoutRecords);
  const selectionBytes = Buffer.concat(
    valLines
      .filter((line) => selectionParentIds.has(line.record.parent_id))
      .map((line) => line.bytes)
  );
  const holdoutBytes = Buffer.concat(
    valLines.filter((line) => holdoutParentIds.has(line.record.parent_id)).map((line) => line.bytes)
  );
  const protectedIds = sortedUnique(holdoutPositions.union);
  const protectedBytes = Buffer.from(
    protectedIds.length === 0 ? '' : `${protectedIds.join('\n')}\n`,
    'utf8'
  );

  const selectionGames = new Set(selectionRecords.map((record) => record.game_id));
  const finalHoldoutGames = new Set(holdoutRecords.map((record) => record.game_id));
  const selectionParents = new Set(selectionRecords.map((record) => record.parent_id));
  const finalHoldoutParents = new Set(holdoutRecords.map((record) => record.parent_id));
  const selectionPositions = positionSets(selectionRecords);
  if (selectionGames.size !== SIBLING_EVAL_MODEL_SELECTION_GAMES) {
    throw new Error(
      `model-selection output must retain exactly ${SIBLING_EVAL_MODEL_SELECTION_GAMES} games ` +
      `(got ${selectionGames.size})`
    );
  }
  if (finalHoldoutGames.size !== SIBLING_EVAL_FINAL_HOLDOUT_GAMES) {
    throw new Error(
      `final-holdout output must contain exactly ${SIBLING_EVAL_FINAL_HOLDOUT_GAMES} games ` +
      `(got ${finalHoldoutGames.size})`
    );
  }

  const evaluationSemanticPositions = new Set([
    ...selectionPositions.union,
    ...holdoutPositions.union,
  ]);
  const trainGroups = new Map<string, SiblingRecord[]>();
  for (const record of trainRecords) {
    const group = trainGroups.get(record.parent_id) ?? [];
    group.push(record);
    trainGroups.set(record.parent_id, group);
  }
  const modelTrainingParentIds = new Set<string>();
  let trainingPolicyExposedRecords = 0;
  let trainingPolicyExposedParents = 0;
  let trainingSemanticConflictRecords = 0;
  let trainingSemanticConflictParents = 0;
  for (const [parentId, group] of trainGroups) {
    if (groupTouchesPolicyExposure(parentId, group)) {
      trainingPolicyExposedParents++;
      trainingPolicyExposedRecords += group.length;
      continue;
    }
    const semanticOverlap = group.some((record) =>
      evaluationSemanticPositions.has(record.position_id) ||
      evaluationSemanticPositions.has(record.child_position_id)
    );
    if (semanticOverlap) {
      trainingSemanticConflictParents++;
      trainingSemanticConflictRecords += group.length;
      continue;
    }
    modelTrainingParentIds.add(parentId);
  }
  const modelTrainingRecords = trainRecords.filter((record) =>
    modelTrainingParentIds.has(record.parent_id)
  );
  if (modelTrainingRecords.length === 0) {
    throw new Error('semantic isolation removed every model-training parent');
  }
  validateParentGroups(modelTrainingRecords);
  const modelTrainingBytes = Buffer.concat(
    trainLines
      .filter((line) => modelTrainingParentIds.has(line.record.parent_id))
      .map((line) => line.bytes)
  );
  const modelTrainingGames = new Set(modelTrainingRecords.map((record) => record.game_id));
  if (modelTrainingGames.size !== SIBLING_MODEL_TRAINING_GAMES) {
    throw new Error(
      `model-training output must retain exactly ${SIBLING_MODEL_TRAINING_GAMES} games ` +
      `(got ${modelTrainingGames.size})`
    );
  }
  const sourceParentIds = new Set([...trainGroups.keys(), ...valGroups.keys()]);
  const policyExposedMatchedParentIds = [...policyExposure.parentIds].filter((parentId) =>
    sourceParentIds.has(parentId)
  ).length;
  const policyExposedUnmatchedParentIds =
    policyExposure.parentIds.size - policyExposedMatchedParentIds;
  if (
    policyExposureContract.roleAccounting !== null &&
    (
    trainingPolicyExposedParents !== policyExposureContract.roleAccounting!.trainingParents ||
    trainingPolicyExposedRecords !== policyExposureContract.roleAccounting!.trainingRecords ||
    policyExposedUnmatchedParentIds !==
      policyExposureContract.roleAccounting!.unmatchedParentIds
    )
  ) {
    throw new Error(
      'policy exposure audit does not match the pinned training and unmatched counts'
    );
  }
  const observedPolicyExposureRoleAccounting: PolicyExposureRoleAccounting = {
    trainingParents: trainingPolicyExposedParents,
    trainingRecords: trainingPolicyExposedRecords,
    selectionParents: selectionPolicyExposedParents,
    selectionRecords: selectionPolicyExposedRecords,
    holdoutParents: holdoutPolicyExposedParents,
    holdoutRecords: holdoutPolicyExposedRecords,
    unmatchedParentIds: policyExposedUnmatchedParentIds,
  };
  const modelTrainingPositions = positionSets(modelTrainingRecords);
  assertSplitIsolation(modelTrainingRecords, [...selectionRecords, ...holdoutRecords]);
  const isolation = {
    game_overlap: setIntersectionSize(selectionGames, finalHoldoutGames),
    parent_overlap: setIntersectionSize(selectionParents, finalHoldoutParents),
    position_overlap: setIntersectionSize(selectionPositions.parents, holdoutPositions.parents),
    child_position_overlap: setIntersectionSize(selectionPositions.children, holdoutPositions.children),
    selection_position_to_holdout_child_overlap: setIntersectionSize(
      selectionPositions.parents,
      holdoutPositions.children
    ),
    selection_child_to_holdout_position_overlap: setIntersectionSize(
      selectionPositions.children,
      holdoutPositions.parents
    ),
    semantic_position_union_overlap: setIntersectionSize(
      selectionPositions.union,
      holdoutPositions.union
    ),
    training_to_selection_semantic_position_union_overlap: setIntersectionSize(
      modelTrainingPositions.union,
      selectionPositions.union
    ),
    training_to_holdout_semantic_position_union_overlap: setIntersectionSize(
      modelTrainingPositions.union,
      holdoutPositions.union
    ),
    training_to_evaluation_semantic_position_union_overlap: setIntersectionSize(
      modelTrainingPositions.union,
      evaluationSemanticPositions
    ),
  };
  if (Object.values(isolation).some((count) => count !== 0)) {
    throw new Error(`partition isolation failed: ${JSON.stringify(isolation)}`);
  }
  if (
    [...modelTrainingParentIds].some((parentId) =>
      groupTouchesPolicyExposure(parentId, trainGroups.get(parentId)!)
    ) ||
    [...selectionParentIds].some((parentId) =>
      groupTouchesPolicyExposure(parentId, valGroups.get(parentId)!)
    ) ||
    [...holdoutParentIds].some((parentId) =>
      groupTouchesPolicyExposure(parentId, valGroups.get(parentId)!)
    )
  ) {
    throw new Error('policy-exposed parent or semantic position survived into a model role');
  }
  if (
    modelTrainingRecords.length +
      trainingPolicyExposedRecords +
      trainingSemanticConflictRecords !==
      trainRecords.length ||
    modelTrainingParentIds.size +
      trainingPolicyExposedParents +
      trainingSemanticConflictParents !==
      trainGroups.size ||
    selectionRecords.length +
      holdoutRecords.length +
      selectionPolicyExposedRecords +
      holdoutPolicyExposedRecords +
      selectionConflictRecords !==
      valRecords.length ||
    selectionParentIds.size +
      holdoutParentIds.size +
      selectionPolicyExposedParents +
      holdoutPolicyExposedParents +
      selectionConflictParents !==
      valGroups.size
  ) {
    throw new Error('partition role/drop accounting does not balance');
  }

  const manifest: SiblingEvalPartitionManifest = {
    schema: SIBLING_EVAL_PARTITION_MANIFEST_SCHEMA,
    record_schema: SIBLING_SCHEMA,
    pipeline,
    policy: {
      algorithm: SIBLING_EVAL_PARTITION_ALGORITHM,
      domain: SIBLING_EVAL_PARTITION_DOMAIN,
      seed: SIBLING_EVAL_PARTITION_SEED,
      source_role: 'val',
      expected_source_games: SIBLING_EVAL_EXPECTED_SOURCE_GAMES,
      final_holdout_games: SIBLING_EVAL_FINAL_HOLDOUT_GAMES,
      rank_order: 'sha256-bytes-ascending-then-game-id-utf8-bytewise',
      priority: 'final-holdout-then-evaluation-wins',
      drop_unit: 'parent-group',
      conflict_resolution:
        'drop-conflicting-selection-and-training-parent-groups-with-holdout-then-evaluation-priority',
      semantic_position_set: 'position_id-union-child_position_id',
      policy_exposure_policy:
        'drop-parent-groups-touching-policy-parent-or-semantic-position-exposure-before-role-isolation',
    },
    source: {
      teacher_manifest: {
        schema: base.schema,
        bytes: manifestBytes.byteLength,
        sha256: sha256(manifestBytes),
      },
      full_training: {
        bytes: sourceTrainBytes.byteLength,
        sha256: sha256(sourceTrainBytes),
        records: trainRecords.length,
        parents: trainGroups.size,
        games: sourceTrainGameIds.size,
        game_ids_sha256: idSetSha256(sourceTrainGameIds),
      },
      full_validation: {
        bytes: sourceValBytes.byteLength,
        sha256: sha256(sourceValBytes),
        records: valRecords.length,
        parents: valGroups.size,
        games: sourceValGameIds.size,
        game_ids_sha256: idSetSha256(sourceValGameIds),
      },
      policy_exposure_receipt: policyExposure.receipt,
      policy_exposed_parent_ids: policyExposure.parents,
      policy_exposed_semantic_position_ids: policyExposure.semantic,
    },
    outputs: {
      model_training: datasetDigest(modelTrainingBytes, modelTrainingRecords),
      model_selection: datasetDigest(selectionBytes, selectionRecords),
      final_holdout: datasetDigest(holdoutBytes, holdoutRecords),
      protected_position_ids: {
        format: SIBLING_PROTECTED_POSITION_IDS_FORMAT,
        bytes: protectedBytes.byteLength,
        sha256: sha256(protectedBytes),
        count: protectedIds.length,
      },
    },
    drops: {
      training_policy_exposed_records: trainingPolicyExposedRecords,
      training_policy_exposed_parents: trainingPolicyExposedParents,
      training_semantic_conflict_records: trainingSemanticConflictRecords,
      training_semantic_conflict_parents: trainingSemanticConflictParents,
      selection_policy_exposed_records: selectionPolicyExposedRecords,
      selection_policy_exposed_parents: selectionPolicyExposedParents,
      holdout_policy_exposed_records: holdoutPolicyExposedRecords,
      holdout_policy_exposed_parents: holdoutPolicyExposedParents,
      selection_conflict_records: selectionConflictRecords,
      selection_conflict_parents: selectionConflictParents,
      parent_id_overlap_parents: parentIdOverlapParents,
      semantic_position_overlap_parents: semanticPositionOverlapParents,
      policy_exposed_unmatched_parent_ids: policyExposedUnmatchedParentIds,
    },
    isolation: isolation as SiblingEvalPartitionManifest['isolation'],
  };

  // Re-read immutable inputs and re-check the clean revision immediately before
  // the publication boundary. The manifest is always the final atomic write.
  const finalPipeline = await revisionVerifier(options.pipelineRevision);
  await outputVerifier(outputPaths, inputPaths);
  const [
    finalSourceTrainBytes,
    finalSourceValBytes,
    finalManifestBytes,
    finalPolicyExposureReceiptBytes,
    finalPolicyExposedParentIdsBytes,
    finalPolicyExposedSemanticPositionIdsBytes,
  ] = await Promise.all([
    fs.promises.readFile(options.sourceTrain),
    fs.promises.readFile(options.sourceVal),
    fs.promises.readFile(options.baseManifest),
    fs.promises.readFile(options.policyExposureReceipt),
    fs.promises.readFile(options.policyExposedParentIds),
    fs.promises.readFile(options.policyExposedSemanticPositionIds),
  ]);
  if (JSON.stringify(finalPipeline) !== JSON.stringify(pipeline)) {
    throw new Error('pipeline provenance changed during validation partitioning');
  }
  if (
    !finalSourceTrainBytes.equals(sourceTrainBytes) ||
    !finalSourceValBytes.equals(sourceValBytes) ||
    !finalManifestBytes.equals(manifestBytes) ||
    !finalPolicyExposureReceiptBytes.equals(policyExposureReceiptBytes) ||
    !finalPolicyExposedParentIdsBytes.equals(policyExposedParentIdsBytes) ||
    !finalPolicyExposedSemanticPositionIdsBytes.equals(
      policyExposedSemanticPositionIdsBytes
    )
  ) {
    throw new Error('partition input changed during validation partitioning');
  }
  if (policyExposureContract.roleAccounting === null) {
    throw new PolicyExposureAuditRequiredError(
      Object.freeze(observedPolicyExposureRoleAccounting)
    );
  }
  if (options.preflight) return manifest;

  await atomicWrite(options.outTrain, modelTrainingBytes);
  await atomicWrite(options.outModelSelection, selectionBytes);
  await atomicWrite(options.outFinalHoldout, holdoutBytes);
  await atomicWrite(options.outProtectedPositionIds, protectedBytes);
  await atomicWrite(options.manifest, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
  return manifest;
}

interface CliArgs extends PartitionSiblingValidationOptions {
  help: boolean;
}

function parseCliArgs(argv: readonly string[]): CliArgs {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      help: true,
      sourceTrain: '',
      sourceVal: '',
      baseManifest: '',
      policyExposureReceipt: '',
      policyExposedParentIds: '',
      policyExposedSemanticPositionIds: '',
      pipelineRevision: '',
      outTrain: '',
      outModelSelection: '',
      outFinalHoldout: '',
      outProtectedPositionIds: '',
      manifest: '',
    };
  }
  const booleanFlags = new Set(['preflight', 'audit-policy-exposure']);
  const valueFlags = new Set([
    'source-train',
    'source-val',
    'base-manifest',
    'policy-exposure-receipt',
    'policy-exposed-parent-ids',
    'policy-exposed-semantic-position-ids',
    'pipeline-revision',
    'out-train',
    'out-model-selection',
    'out-final-holdout',
    'out-protected-position-ids',
    'manifest',
  ]);
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (booleanFlags.has(name)) {
      if (booleans.has(name)) throw new Error(`duplicate option: --${name}`);
      booleans.add(name);
      continue;
    }
    if (!valueFlags.has(name)) throw new Error(`unknown option: --${name}`);
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
  return {
    help: false,
    sourceTrain: required('source-train'),
    sourceVal: required('source-val'),
    baseManifest: required('base-manifest'),
    policyExposureReceipt: required('policy-exposure-receipt'),
    policyExposedParentIds: required('policy-exposed-parent-ids'),
    policyExposedSemanticPositionIds: required(
      'policy-exposed-semantic-position-ids'
    ),
    pipelineRevision: required('pipeline-revision'),
    outTrain: required('out-train'),
    outModelSelection: required('out-model-selection'),
    outFinalHoldout: required('out-final-holdout'),
    outProtectedPositionIds: required('out-protected-position-ids'),
    manifest: required('manifest'),
    preflight: booleans.has('preflight'),
    auditPolicyExposure: booleans.has('audit-policy-exposure'),
  };
}

const USAGE = `Usage:
  node -r tsx/cjs ml/partition-sibling-validation.ts \\
    --source-train <siblings.train.jsonl> \\
    --source-val <siblings.val.jsonl> \\
    --base-manifest <sibling-manifest.json> \\
    --policy-exposure-receipt <wcsc36-policy-exposure-receipt.json> \\
    --policy-exposed-parent-ids <wcsc36-policy-exposed-parent-ids.txt> \\
    --policy-exposed-semantic-position-ids <wcsc36-policy-exposed-semantic-position-ids.txt> \\
    --pipeline-revision <git-commit> \\
    --out-train <model-training.jsonl> \\
    --out-model-selection <model-selection.val.jsonl> \\
    --out-final-holdout <final-holdout.val.jsonl> \\
    --out-protected-position-ids <final-holdout.position-ids.txt> \\
    --manifest <eval-partition-manifest.json> [--preflight | --audit-policy-exposure]

The protocol first removes every group touching the exact Lane A parent or
semantic-position exposure union, keeps 21 training games after isolation, and
splits seven source validation games into four model-selection games and a
SHA-256-ranked quota of three final-holdout games with seed ${SIBLING_EVAL_PARTITION_SEED}.
--preflight performs every input, provenance, partition, and output-path check
without writing any artifact.
--audit-policy-exposure always publishes nothing. With null role accounting it
prints observed role_accounting JSON and exits 2; once pinned it verifies the
same accounting, explicitly reports audit-only mode, and exits 0.
`;

export function siblingPartitionCompletionLabel(
  options: Pick<PartitionSiblingValidationOptions, 'preflight' | 'auditPolicyExposure'>
): 'Audited (no publish)' | 'Preflighted' | 'Published' {
  if (options.auditPolicyExposure === true) return 'Audited (no publish)';
  if (options.preflight === true) return 'Preflighted';
  return 'Published';
}

export function siblingPartitionErrorExitCode(error: unknown): 1 | 2 {
  return error instanceof PolicyExposureAuditRequiredError ? 2 : 1;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  const manifest = await partitionSiblingValidation(args);
  process.stdout.write(
    `${siblingPartitionCompletionLabel(args)} sibling evaluation partition: ` +
    `train=${manifest.outputs.model_training.records} records, ` +
    `selection=${manifest.outputs.model_selection.records} records, ` +
    `holdout=${manifest.outputs.final_holdout.records} records, ` +
    `protected=${manifest.outputs.protected_position_ids.count} positions\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof PolicyExposureAuditRequiredError) {
      process.stdout.write(
        `${JSON.stringify({ role_accounting: {
          training_parents: error.observed.trainingParents,
          training_records: error.observed.trainingRecords,
          selection_parents: error.observed.selectionParents,
          selection_records: error.observed.selectionRecords,
          holdout_parents: error.observed.holdoutParents,
          holdout_records: error.observed.holdoutRecords,
          unmatched_parent_ids: error.observed.unmatchedParentIds,
        } }, null, 2)}\n`
      );
      process.exitCode = siblingPartitionErrorExitCode(error);
      return;
    }
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = siblingPartitionErrorExitCode(error);
  });
}
