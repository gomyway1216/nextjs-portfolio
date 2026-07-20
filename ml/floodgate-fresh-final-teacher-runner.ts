/**
 * Fixed local runner for the 4,800-parent fresh-final sibling teacher.
 *
 * A reviewed candidate-selection receipt must be recomputed before this
 * module opens the fresh-final source. The same receipt, source, shared search
 * policy, and engine assets are revalidated after generation. result.json is
 * committed last. There is no network, cloud, A/B, or live-weight write path.
 */

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TextDecoder } from "node:util";

import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  type FloodgateRoleBundleRawIdentity,
} from "./floodgate-role-bundle";
import {
  parseAuthenticatedFloodgateFreshFinalRows,
  type FloodgateFreshFinalRawIdentity,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-validation";
import {
  FRESH_FINAL_TEACHER_INPUT_SCHEMA,
  freshFinalSiblingTeacherRunFingerprintFromEvidence,
  generateFreshFinalSiblingTeacherDataset,
  siblingTeacherStagePaths,
} from "./generate-sibling-teacher";
import {
  validateParentGroups,
  type SiblingRecord,
} from "./sibling-data";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-production-teacher-asset-authority";
import {
  verifyPinnedFloodgateStrengthFirstV8TeacherAuthority,
  type FloodgateStrengthFirstV8TeacherAuthorityReceipt,
} from "./floodgate-strength-first-v8-teacher-authority";
import {
  acquireFreshSelectionFormalTeacherExclusionCoreForTests,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
  validateFreshSelectionTeacherSearchPolicy,
  type FreshSelectionTeacherArtifactIdentity,
  type FreshSelectionTeacherSearchPolicy,
} from "./floodgate-fresh-selection-teacher-runner";
import { acquireFloodgateStrengthFirstTeacherRunLockCoreForTests } from "./floodgate-strength-first-teacher-runner";
import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";

export const FRESH_FINAL_TEACHER_AUTHORITY_SCHEMA =
  "shogi-floodgate-strength-first-fresh-final-teacher-authority-v1" as const;
export const FRESH_FINAL_TEACHER_MANIFEST_SCHEMA =
  "shogi-floodgate-strength-first-fresh-final-teacher-manifest-v1" as const;
export const FRESH_FINAL_TEACHER_RESULT_SCHEMA =
  "shogi-floodgate-strength-first-fresh-final-teacher-result-v1" as const;
export const FRESH_FINAL_TEACHER_RUNNER_SCHEMA =
  "shogi-floodgate-strength-first-fresh-final-teacher-runner-v1" as const;
export const FRESH_FINAL_TEACHER_SELECTION_PREFLIGHT_SCHEMA =
  "shogi-floodgate-strength-first-fresh-final-teacher-selection-preflight-v1" as const;
export const FRESH_FINAL_TEACHER_PREFLIGHT_CLI_SCHEMA =
  "shogi-floodgate-strength-first-fresh-final-teacher-preflight-cli-v1" as const;
export const FRESH_FINAL_TEACHER_STATUS =
  "complete-fresh-final-only-postflight-bound" as const;
export const FRESH_FINAL_TEACHER_DATASET_SCHEMA =
  "canonical-shogi-sibling-v1-jsonl-one-lf-per-row" as const;
export const FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT =
  ".codex/shogi-runs/floodgate-q1-2026-strength-first-fresh-final-teacher-v1" as const;
export const FRESH_FINAL_TEACHER_SOURCE_RELATIVE_PATH =
  ".codex/shogi-bundles/floodgate-q1-2026-label-free-role-bundle-v2/fresh-final-holdout.raw.jsonl" as const;
export const FRESH_FINAL_TEACHER_SELECTION_RECEIPT_RELATIVE_PATH =
  ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1/selection-receipt.json" as const;
export const FRESH_FINAL_TEACHER_SELECTION_EVALUATION_REPORT_RELATIVE_PATH =
  ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1/selection-evaluation-report.json" as const;
export const FRESH_FINAL_TEACHER_SELECTION_PUBLICATION_RESULT_RELATIVE_PATH =
  ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1/selection-publication-result.json" as const;
export const FRESH_FINAL_TEACHER_SELECTION_REGISTRY_PATH =
  "ml/protocols/floodgate-q1-2026-strength-first-qat-selection-evaluator-registry.json" as const;
export const FRESH_FINAL_TEACHER_PARENT_COUNT = 4_800 as const;
export const FRESH_FINAL_TEACHER_GAME_COUNT = 200 as const;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const SELECTED_SEEDS = Object.freeze([42, 43, 44] as const);
const SELECTED_CHECKPOINT_SCHEMA =
  "shogi-floodgate-strength-first-qat-final-checkpoint-v2" as const;

export const FRESH_FINAL_TEACHER_SOURCE = Object.freeze({
  path: FRESH_FINAL_TEACHER_SOURCE_RELATIVE_PATH,
  format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  bytes: 3_073_360,
  sha256: "387d1dc630aa453c8c5fe0b105ebfad6a37cdd1dd8f9a10ef463991cae6bcdc7",
  records: FRESH_FINAL_TEACHER_PARENT_COUNT,
  games: FRESH_FINAL_TEACHER_GAME_COUNT,
  game_ids_sha256:
    "29704e5c7b066f33209aa4a94bcc627391af5bc07e1db4c703f39264d11cc502",
  parent_ids_sha256:
    "bd7e6ab2b8147b8fe3e9df0b45310a107b819686d924d839ec632ad610ee8d65",
  position_ids_count: FRESH_FINAL_TEACHER_PARENT_COUNT,
  position_ids_sha256:
    "f09d19ac6d634fda8b4b46a40c017f14e895bad1866d56373c459bed782944cd",
} as const);

export const FRESH_FINAL_TEACHER_BOUNDARY = Object.freeze({
  role: "fresh_final_holdout",
  selected_receipt_recomputed_before_label_generation: true,
  candidate_selection_decision_made_by_this_runner: false,
  training_rows_read: false,
  fresh_selection_rows_read: false,
  network: false,
  cloud: false,
  aws: false,
  gcp: false,
  vercel: false,
  formal_ab_authorized: false,
  live_weight_write_authorized: false,
} as const);

export interface FreshFinalTeacherSelectionPreflight {
  readonly schema: typeof FRESH_FINAL_TEACHER_SELECTION_PREFLIGHT_SCHEMA;
  readonly status: "selected-candidate-receipt-recomputed";
  readonly selection_evaluator_registry: FreshSelectionTeacherArtifactIdentity;
  readonly selection_evaluation_report: FreshSelectionTeacherArtifactIdentity;
  readonly selection_receipt: FreshSelectionTeacherArtifactIdentity;
  readonly selection_publication_result: FreshSelectionTeacherArtifactIdentity;
  readonly selected_seed: 42 | 43 | 44;
  readonly selected_checkpoint: FreshSelectionTeacherArtifactIdentity;
  readonly selection_evaluation_report_reads: 1;
  readonly selection_receipt_reads: 1;
  readonly selection_publication_result_reads: 1;
  readonly selection_dataset_reads: 1;
  readonly selection_checkpoint_evaluations: 4;
  readonly fresh_final_source_opened: false;
  readonly fresh_final_label_reads: 0;
  readonly teacher_engines_started: 0;
  readonly network_requests: 0;
  readonly cloud_requests: 0;
  readonly live_weight_writes: 0;
}

export interface FreshFinalTeacherBlockedReceipt {
  readonly schema: typeof FRESH_FINAL_TEACHER_PREFLIGHT_CLI_SCHEMA;
  readonly status: "STOP";
  readonly reason:
    | "selected-candidate-receipt-not-ready"
    | "arguments-forbidden";
  readonly selection_evaluator_registry_reads: number;
  readonly selection_receipt_reads: 0;
  readonly selection_dataset_reads: 0;
  readonly fresh_final_source_reads: 0;
  readonly fresh_final_label_reads: 0;
  readonly teacher_engines_started: 0;
  readonly network_requests: 0;
  readonly cloud_requests: 0;
  readonly live_weight_writes: 0;
}

export class FreshFinalTeacherBlocked extends Error {
  readonly receipt: Readonly<FreshFinalTeacherBlockedReceipt>;

  constructor(receipt: Readonly<FreshFinalTeacherBlockedReceipt>) {
    super(`fresh-final teacher stopped: ${receipt.reason}`);
    this.name = "FreshFinalTeacherBlocked";
    this.receipt = receipt;
  }
}

export interface FreshFinalTeacherPaths {
  readonly home: string;
  readonly repositoryRoot: string;
  readonly outputRoot: string;
  readonly source: string;
  readonly searchPolicy: string;
  readonly authority: string;
  readonly manifest: string;
  readonly result: string;
  readonly dataset: string;
  readonly work: string;
  readonly engineBin: string;
  readonly engineReceipt: string;
  readonly evalDir: string;
}

interface SearchPolicySnapshot {
  readonly value: Readonly<FreshSelectionTeacherSearchPolicy>;
  readonly identity: FreshSelectionTeacherArtifactIdentity;
}

export interface FreshFinalTeacherSourceSnapshot {
  readonly bytes: Uint8Array;
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly identity: typeof FRESH_FINAL_TEACHER_SOURCE;
}

export interface FreshFinalTeacherGeneratorRequest {
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly source: typeof FRESH_FINAL_TEACHER_SOURCE;
  readonly outputRoot: string;
  readonly datasetPath: string;
  readonly workPath: string;
  readonly runnerRevision: string;
  readonly engineBin: string;
  readonly engineReceipt: string;
  readonly evalDir: string;
  readonly searchPolicy: Readonly<FreshSelectionTeacherSearchPolicy>;
  readonly searchPolicyIdentity: FreshSelectionTeacherArtifactIdentity;
  readonly selectionPreflight: Readonly<FreshFinalTeacherSelectionPreflight>;
}

export interface FreshFinalTeacherGeneratorOutcome {
  readonly status: "complete-fresh-final-only";
  readonly generation_run_fingerprint: string;
  readonly completed_parents: 4_800;
  readonly forced_parents_skipped: number;
  readonly forced_skip_reasons: Readonly<{
    readonly fewer_than_two_legal_moves: number;
  }>;
  readonly emitted_parent_groups: number;
  readonly dataset_records: number;
}

type AssetReceipt = Readonly<
  FloodgateStrengthFirstV8TeacherAuthorityReceipt<
    "production-fixed-registry-and-deployment-root"
  >
>;

export interface FreshFinalTeacherRunnerDependencies {
  readonly homeDirectory: () => string;
  readonly repositoryRoot: string;
  readonly effectiveUserId: number;
  readonly availableParallelism: number;
  readonly captureExactCleanRevision: (repositoryRoot: string) => Promise<string>;
  readonly selectionPreflight: (
    repositoryRoot: string,
  ) => Promise<Readonly<FreshFinalTeacherSelectionPreflight>>;
  readonly acquireFormalTeacherExclusion: () => Promise<() => Promise<void>>;
  readonly verifyAssets: () => Promise<AssetReceipt>;
  readonly readSearchPolicy: (
    file: string,
    repositoryRoot: string,
    revision: string,
  ) => Promise<Readonly<SearchPolicySnapshot>>;
  readonly readSource: (
    file: string,
  ) => Promise<Readonly<FreshFinalTeacherSourceSnapshot>>;
  readonly generate: (
    request: Readonly<FreshFinalTeacherGeneratorRequest>,
  ) => Promise<Readonly<FreshFinalTeacherGeneratorOutcome>>;
  readonly computeGenerationFingerprint: (
    request: Readonly<{
      paths: FreshFinalTeacherPaths;
      revision: string;
      source: FreshFinalTeacherSourceSnapshot;
      policy: SearchPolicySnapshot;
      assets: AssetReceipt;
    }>,
  ) => Promise<string>;
  readonly reportProgress: (phase: string) => void;
}

export interface FreshFinalTeacherRunReceipt {
  readonly schema: typeof FRESH_FINAL_TEACHER_RUNNER_SCHEMA;
  readonly status: typeof FRESH_FINAL_TEACHER_STATUS;
  readonly idempotent_existing_result: boolean;
  readonly selected_seed: 42 | 43 | 44;
  readonly completed_parents: 4_800;
  readonly emitted_parent_groups: number;
  readonly dataset_records: number;
  readonly parallel_engines: number;
  readonly live_weight_changes: 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("fresh-final canonical JSON rejects this number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  throw new Error(`fresh-final canonical JSON rejects ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function validArtifactIdentity(
  value: Readonly<FreshSelectionTeacherArtifactIdentity>,
  expectedPath: string,
  expectedSchema: string,
): boolean {
  return (
    value?.path === expectedPath &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    SHA256_RE.test(value.sha256) &&
    value.schema === expectedSchema
  );
}

export function validateFreshFinalTeacherSelectionPreflight(
  value: Readonly<FreshFinalTeacherSelectionPreflight>,
): Readonly<FreshFinalTeacherSelectionPreflight> {
  if (
    value.schema !== FRESH_FINAL_TEACHER_SELECTION_PREFLIGHT_SCHEMA ||
    value.status !== "selected-candidate-receipt-recomputed" ||
    !validArtifactIdentity(
      value.selection_evaluator_registry,
      FRESH_FINAL_TEACHER_SELECTION_REGISTRY_PATH,
      "shogi-floodgate-strength-first-selection-evaluator-registry-v1",
    ) ||
    !validArtifactIdentity(
      value.selection_evaluation_report,
      FRESH_FINAL_TEACHER_SELECTION_EVALUATION_REPORT_RELATIVE_PATH,
      "shogi-floodgate-strength-first-selection-evaluation-report-v1",
    ) ||
    !validArtifactIdentity(
      value.selection_receipt,
      FRESH_FINAL_TEACHER_SELECTION_RECEIPT_RELATIVE_PATH,
      "shogi-floodgate-strength-first-three-seed-candidate-selection-receipt-v1",
    ) ||
    !validArtifactIdentity(
      value.selection_publication_result,
      FRESH_FINAL_TEACHER_SELECTION_PUBLICATION_RESULT_RELATIVE_PATH,
      "shogi-floodgate-strength-first-selection-publication-result-v1",
    ) ||
    !SELECTED_SEEDS.includes(value.selected_seed) ||
    !validArtifactIdentity(
      value.selected_checkpoint,
      `ml/runs/floodgate-q1-2026-strength-first-int16-aware/seed-${value.selected_seed}/final.pt`,
      SELECTED_CHECKPOINT_SCHEMA,
    ) ||
    value.selection_evaluation_report_reads !== 1 ||
    value.selection_receipt_reads !== 1 ||
    value.selection_publication_result_reads !== 1 ||
    value.selection_dataset_reads !== 1 ||
    value.selection_checkpoint_evaluations !== 4 ||
    value.fresh_final_source_opened !== false ||
    value.fresh_final_label_reads !== 0 ||
    value.teacher_engines_started !== 0 ||
    value.network_requests !== 0 ||
    value.cloud_requests !== 0 ||
    value.live_weight_writes !== 0
  ) {
    throw new Error("fresh-final selection preflight is incomplete");
  }
  return value;
}

export function freshFinalTeacherPaths(
  homeInput: string,
  repositoryInput: string,
): Readonly<FreshFinalTeacherPaths> {
  const home = path.resolve(homeInput);
  const repositoryRoot = path.resolve(repositoryInput);
  const outputRoot = path.join(
    home,
    ...FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT.split("/"),
  );
  const assetRoot = path.join(
    home,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  return Object.freeze({
    home,
    repositoryRoot,
    outputRoot,
    source: path.join(
      home,
      ...FRESH_FINAL_TEACHER_SOURCE_RELATIVE_PATH.split("/"),
    ),
    searchPolicy: path.join(repositoryRoot, FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH),
    authority: path.join(outputRoot, "authority.json"),
    manifest: path.join(outputRoot, "manifest.json"),
    result: path.join(outputRoot, "result.json"),
    dataset: path.join(outputRoot, "final.jsonl"),
    work: path.join(outputRoot, "work.jsonl"),
    engineBin: path.join(assetRoot, "engine", "yaneuraou"),
    engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
    evalDir: path.join(assetRoot, "eval"),
  });
}

async function ensurePrivateDirectory(
  directory: string,
  effectiveUserId: number,
): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  await fs.promises.chmod(directory, DIRECTORY_MODE);
  const value = await fs.promises.lstat(directory);
  if (
    !value.isDirectory() ||
    value.uid !== effectiveUserId ||
    (value.mode & 0o7777) !== DIRECTORY_MODE
  ) {
    throw new Error("fresh-final output root must be private 0700");
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function commitPrivateBytes(
  file: string,
  bytes: Uint8Array,
): Promise<void> {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(temporary, "wx", FILE_MODE);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.promises.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

interface PrivateArtifactSnapshot {
  readonly bytes: Uint8Array;
  readonly identity: FreshSelectionTeacherArtifactIdentity;
}

export function freshFinalPrivateArtifactRelativePathCoreForTests(
  file: string,
  root: string,
): string {
  const absolute = path.resolve(file);
  const relative = path.relative(root, absolute);
  if (
    absolute !== file ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`fresh-final artifact is outside its root: ${path.basename(file)}`);
  }
  return relative;
}

async function readPrivateArtifact(
  file: string,
  root: string,
  effectiveUserId: number,
  schema: string,
): Promise<Readonly<PrivateArtifactSnapshot>> {
  const absolute = path.resolve(file);
  const relative = freshFinalPrivateArtifactRelativePathCoreForTests(
    file,
    root,
  );
  const canonicalFromRoot = path.join(
    await fs.promises.realpath(root),
    relative,
  );
  if (
    (await fs.promises.realpath(file)) !== canonicalFromRoot
  ) {
    throw new Error(`fresh-final artifact path is not canonical: ${path.basename(file)}`);
  }
  const before = await fs.promises.lstat(file);
  if (
    !before.isFile() ||
    before.uid !== effectiveUserId ||
    (before.mode & 0o7777) !== FILE_MODE ||
    before.nlink !== 1
  ) {
    throw new Error(
      `fresh-final artifact is not private single-link 0600: ${path.basename(file)}`,
    );
  }
  const noFollow = "O_NOFOLLOW" in fs.constants ? fs.constants.O_NOFOLLOW : 0;
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
  let bytes: Buffer;
  let openedBefore: fs.Stats;
  let openedAfter: fs.Stats;
  try {
    openedBefore = await handle.stat();
    bytes = await handle.readFile();
    openedAfter = await handle.stat();
  } finally {
    await handle.close();
  }
  const after = await fs.promises.lstat(file);
  const statIdentity = (value: fs.Stats) => [
    value.dev,
    value.ino,
    value.mode,
    value.size,
    value.mtimeMs,
    value.ctimeMs,
    value.nlink,
  ];
  if (
    !sameJson(statIdentity(before), statIdentity(openedBefore)) ||
    !sameJson(statIdentity(before), statIdentity(openedAfter)) ||
    !sameJson(statIdentity(before), statIdentity(after)) ||
    bytes.byteLength !== before.size
  ) {
    throw new Error(`fresh-final artifact changed while read: ${path.basename(file)}`);
  }
  const portableRelative = relative.split(path.sep).join("/");
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    identity: Object.freeze({
      path: `${FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT}/${portableRelative}`,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      schema,
    }),
  });
}

function identityForBytes(
  file: string,
  bytes: Uint8Array,
  schema: string,
): FreshSelectionTeacherArtifactIdentity {
  return {
    path: `${FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT}/${path.basename(file)}`,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    schema,
  };
}

function completionFromOutcome(
  outcome: Readonly<FreshFinalTeacherGeneratorOutcome>,
): Readonly<Record<string, unknown>> {
  const forced = outcome.forced_parents_skipped;
  if (
    outcome.status !== "complete-fresh-final-only" ||
    outcome.completed_parents !== FRESH_FINAL_TEACHER_PARENT_COUNT ||
    !Number.isSafeInteger(forced) ||
    forced < 0 ||
    outcome.forced_skip_reasons.fewer_than_two_legal_moves !== forced ||
    !Number.isSafeInteger(outcome.emitted_parent_groups) ||
    outcome.emitted_parent_groups < 1 ||
    outcome.emitted_parent_groups + forced !== FRESH_FINAL_TEACHER_PARENT_COUNT ||
    !Number.isSafeInteger(outcome.dataset_records) ||
    outcome.dataset_records < 2 * outcome.emitted_parent_groups ||
    !SHA256_RE.test(outcome.generation_run_fingerprint)
  ) {
    throw new Error("fresh-final generator completion is incomplete");
  }
  return Object.freeze({
    input_games: FRESH_FINAL_TEACHER_GAME_COUNT,
    input_parents: FRESH_FINAL_TEACHER_PARENT_COUNT,
    completed_parents: FRESH_FINAL_TEACHER_PARENT_COUNT,
    forced_parents_skipped: forced,
    forced_skip_reasons: Object.freeze({
      fewer_than_two_legal_moves: forced,
    }),
    emitted_parent_groups: outcome.emitted_parent_groups,
    dataset_records: outcome.dataset_records,
    sealed: true,
  });
}

function exactObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !sameJson(Object.keys(value as Record<string, unknown>).sort(), [...fields].sort())
  ) {
    throw new Error(`${label} fields are not exact`);
  }
  return value as Record<string, unknown>;
}

function validateStoredCompletion(value: unknown): Readonly<Record<string, unknown>> {
  const completion = exactObject(
    value,
    [
      "input_games",
      "input_parents",
      "completed_parents",
      "forced_parents_skipped",
      "forced_skip_reasons",
      "emitted_parent_groups",
      "dataset_records",
      "sealed",
    ],
    "fresh-final stored completion",
  );
  const reasons = exactObject(
    completion.forced_skip_reasons,
    ["fewer_than_two_legal_moves"],
    "fresh-final stored skip reasons",
  );
  const forced = completion.forced_parents_skipped;
  const emitted = completion.emitted_parent_groups;
  const records = completion.dataset_records;
  if (
    completion.input_games !== FRESH_FINAL_TEACHER_GAME_COUNT ||
    completion.input_parents !== FRESH_FINAL_TEACHER_PARENT_COUNT ||
    completion.completed_parents !== FRESH_FINAL_TEACHER_PARENT_COUNT ||
    !Number.isSafeInteger(forced) ||
    (forced as number) < 0 ||
    reasons.fewer_than_two_legal_moves !== forced ||
    !Number.isSafeInteger(emitted) ||
    (emitted as number) < 1 ||
    (emitted as number) + (forced as number) !== FRESH_FINAL_TEACHER_PARENT_COUNT ||
    !Number.isSafeInteger(records) ||
    (records as number) < 2 * (emitted as number) ||
    completion.sealed !== true
  ) {
    throw new Error("fresh-final stored completion is invalid");
  }
  return completion;
}

const FRESH_FINAL_SIBLING_RECORD_FIELDS = Object.freeze([
  "schema",
  "schema_version",
  "game_id",
  "parent_id",
  "position_id",
  "parent_sfen",
  "parent_ply",
  "ply",
  "move",
  "sources",
  "sfen",
  "child_position_id",
  "cp",
  "child_sfen",
  "teacher_child_cp",
  "teacher_parent_cp",
  "teacher_rank",
  "teacher_score_kind",
] as const);

export function validateFreshFinalDatasetBytesCoreForTests(
  bytes: Uint8Array,
  sourceRows: readonly Readonly<FloodgateTrainingParent>[],
  completionValue: unknown,
): readonly Readonly<SiblingRecord>[] {
  const completion = validateStoredCompletion(completionValue);
  if (sourceRows.length !== FRESH_FINAL_TEACHER_PARENT_COUNT) {
    throw new Error("fresh-final dataset source cardinality is invalid");
  }
  const sourceByParent = new Map<string, Readonly<FloodgateTrainingParent>>();
  for (const row of sourceRows) {
    if (
      typeof row.parent_id !== "string" ||
      row.parent_id.length === 0 ||
      sourceByParent.has(row.parent_id)
    ) {
      throw new Error("fresh-final dataset source parent IDs are not unique");
    }
    sourceByParent.set(row.parent_id, row);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("fresh-final dataset is not exact UTF-8");
  }
  if (
    Buffer.byteLength(text, "utf8") !== bytes.byteLength ||
    text.length === 0 ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n") ||
    text.includes("\r")
  ) {
    throw new Error("fresh-final dataset is not exact LF-terminated UTF-8 JSONL");
  }
  const records: SiblingRecord[] = [];
  for (const [index, line] of text.slice(0, -1).split("\n").entries()) {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`fresh-final dataset line ${index + 1} is not JSON`);
    }
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      canonicalJson(value) !== line
    ) {
      throw new Error(
        `fresh-final dataset line ${index + 1} is not canonical JSON`,
      );
    }
    const row = value as Record<string, unknown>;
    const expectedFields =
      row.teacher_score_kind === "mate"
        ? [...FRESH_FINAL_SIBLING_RECORD_FIELDS, "teacher_mate", "teacher_mate_sign"]
        : [...FRESH_FINAL_SIBLING_RECORD_FIELDS];
    if (!sameJson(Object.keys(row).sort(), expectedFields.sort())) {
      throw new Error(`fresh-final dataset line ${index + 1} fields are not exact`);
    }
    for (const field of [
      "game_id",
      "parent_id",
      "position_id",
      "parent_sfen",
      "move",
      "sfen",
      "child_position_id",
      "child_sfen",
      "teacher_score_kind",
    ] as const) {
      if (typeof row[field] !== "string" || row[field].length === 0) {
        throw new Error(
          `fresh-final dataset line ${index + 1} ${field} is invalid`,
        );
      }
    }
    for (const field of [
      "schema_version",
      "parent_ply",
      "ply",
      "cp",
      "teacher_child_cp",
      "teacher_parent_cp",
      "teacher_rank",
    ] as const) {
      if (!Number.isSafeInteger(row[field])) {
        throw new Error(
          `fresh-final dataset line ${index + 1} ${field} is not an integer`,
        );
      }
    }
    if (
      !Array.isArray(row.sources) ||
      row.sources.length === 0 ||
      row.sources.some(
        (source) => source !== "played" && source !== "teacher",
      ) ||
      !sameJson(
        row.sources,
        row.sources.includes("played")
          ? row.sources.includes("teacher")
            ? ["played", "teacher"]
            : ["played"]
          : ["teacher"],
      )
    ) {
      throw new Error(`fresh-final dataset line ${index + 1} sources are invalid`);
    }
    records.push(row as unknown as SiblingRecord);
  }
  if (records.length !== completion.dataset_records) {
    throw new Error("fresh-final dataset record count does not match completion");
  }
  const summaries = validateParentGroups(records);
  if (summaries.length !== completion.emitted_parent_groups) {
    throw new Error("fresh-final dataset parent count does not match completion");
  }
  const observedParentOrder: string[] = [];
  const closedParents = new Set<string>();
  const firstByParent = new Map<string, SiblingRecord>();
  const recordsByParent = new Map<string, SiblingRecord[]>();
  const expectedChildByParentAndMove = new Map<string, string>();
  for (const record of records) {
    if (
      observedParentOrder.at(-1) !== record.parent_id &&
      closedParents.has(record.parent_id)
    ) {
      throw new Error("fresh-final dataset parent groups are not contiguous");
    }
    if (observedParentOrder.at(-1) !== record.parent_id) {
      const previous = observedParentOrder.at(-1);
      if (previous !== undefined) closedParents.add(previous);
      observedParentOrder.push(record.parent_id);
      firstByParent.set(record.parent_id, record);
    }
    const group = recordsByParent.get(record.parent_id) ?? [];
    group.push(record);
    recordsByParent.set(record.parent_id, group);
  }
  const emitted = new Set<string>();
  for (const summary of summaries) {
    const source = sourceByParent.get(summary.parent_id);
    if (!source || emitted.has(summary.parent_id)) {
      throw new Error("fresh-final dataset has duplicate or unknown parent coverage");
    }
    emitted.add(summary.parent_id);
    const first = firstByParent.get(summary.parent_id);
    const group = recordsByParent.get(summary.parent_id) ?? [];
    const played = group.filter((record) => record.sources.includes("played"));
    if (
      first === undefined ||
      first.game_id !== source.game_id ||
      first.position_id !== source.position_id ||
      first.parent_sfen !== source.parent_sfen ||
      first.parent_ply !== source.ply ||
      played.length !== 1 ||
      played[0].move !== source.played_move
    ) {
      throw new Error("fresh-final dataset parent metadata does not match source");
    }
    for (const record of group) {
      const childKey = `${source.parent_sfen}\0${record.move}`;
      let expectedChild = expectedChildByParentAndMove.get(childKey);
      if (expectedChild === undefined) {
        expectedChild = childSfenAfterUsi(source.parent_sfen, record.move);
        expectedChildByParentAndMove.set(childKey, expectedChild);
      }
      if (
        record.child_sfen !== expectedChild
      ) {
        throw new Error(
          "fresh-final dataset child position does not match its legal move",
        );
      }
    }
  }
  const expectedEmittedOrder = sourceRows
    .filter((row) => emitted.has(row.parent_id))
    .map((row) => row.parent_id);
  if (!sameJson(observedParentOrder, expectedEmittedOrder)) {
    throw new Error("fresh-final dataset parent order does not match source");
  }
  const missing = sourceRows.filter((row) => !emitted.has(row.parent_id));
  if (missing.length !== completion.forced_parents_skipped) {
    throw new Error("fresh-final dataset source accounting is incomplete");
  }
  for (const row of missing) {
    const legalMoves = rulesCompleteLegalMoves(
      positionFromSfen(row.parent_sfen).position,
    );
    if (legalMoves.length >= 2) {
      throw new Error(
        "fresh-final dataset omitted a parent that is not a forced-move skip",
      );
    }
  }
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

function validateStoredIdentity(
  value: unknown,
  expected: Readonly<FreshSelectionTeacherArtifactIdentity>,
  label: string,
): void {
  const identity = exactObject(
    value,
    ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (!sameJson(identity, expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function parseCanonicalPrivateJson(
  snapshot: Readonly<PrivateArtifactSnapshot>,
  label: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(snapshot.bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Buffer.from(jsonBytes(value)).equals(Buffer.from(snapshot.bytes))
  ) {
    throw new Error(`${label} is not the exact canonical document`);
  }
  return value as Record<string, unknown>;
}

function buildRunFingerprint(
  revision: string,
  preflight: Readonly<FreshFinalTeacherSelectionPreflight>,
  policy: Readonly<SearchPolicySnapshot>,
  generationRunFingerprint: string,
  assets: AssetReceipt,
): string {
  return sha256(
    canonicalJson({
      schema: "shogi-floodgate-strength-first-fresh-final-teacher-run-fingerprint-v1",
      runner_revision: revision,
      source: FRESH_FINAL_TEACHER_SOURCE,
      selection_evaluator_registry: preflight.selection_evaluator_registry,
      selection_evaluation_report: preflight.selection_evaluation_report,
      selection_receipt: preflight.selection_receipt,
      selection_publication_result: preflight.selection_publication_result,
      selected_seed: preflight.selected_seed,
      selected_checkpoint: preflight.selected_checkpoint,
      shared_fresh_selection_search_policy: policy.identity,
      generation_run_fingerprint: generationRunFingerprint,
      engine_asset_receipt: assets,
    }),
  );
}

async function verifyExistingResult(
  paths: Readonly<FreshFinalTeacherPaths>,
  effectiveUserId: number,
  revision: string,
  preflight: Readonly<FreshFinalTeacherSelectionPreflight>,
  policy: Readonly<SearchPolicySnapshot>,
  assets: AssetReceipt,
  source: Readonly<FreshFinalTeacherSourceSnapshot>,
  expectedGenerationRunFingerprint: string,
): Promise<FreshFinalTeacherRunReceipt | null> {
  try {
    const expectedRunFingerprint = buildRunFingerprint(
      revision,
      preflight,
      policy,
      expectedGenerationRunFingerprint,
      assets,
    );
    const [authoritySnapshot, manifestSnapshot, resultSnapshot, datasetSnapshot] =
      await Promise.all([
        readPrivateArtifact(
          paths.authority,
          paths.outputRoot,
          effectiveUserId,
          FRESH_FINAL_TEACHER_AUTHORITY_SCHEMA,
        ),
        readPrivateArtifact(
          paths.manifest,
          paths.outputRoot,
          effectiveUserId,
          FRESH_FINAL_TEACHER_MANIFEST_SCHEMA,
        ),
        readPrivateArtifact(
          paths.result,
          paths.outputRoot,
          effectiveUserId,
          FRESH_FINAL_TEACHER_RESULT_SCHEMA,
        ),
        readPrivateArtifact(
          paths.dataset,
          paths.outputRoot,
          effectiveUserId,
          FRESH_FINAL_TEACHER_DATASET_SCHEMA,
        ),
      ]);
    const result = exactObject(
      parseCanonicalPrivateJson(resultSnapshot, "fresh-final result"),
      [
        "schema",
        "status",
        "role",
        "selected_seed",
        "selected_checkpoint",
        "selection_receipt",
        "manifest",
        "dataset",
        "completion",
        "runner_revision",
        "generation_run_fingerprint",
        "run_fingerprint",
        "postflight_complete",
        "boundary",
      ],
      "fresh-final result",
    );
    const completion = validateStoredCompletion(result.completion);
    if (
      result.schema !== FRESH_FINAL_TEACHER_RESULT_SCHEMA ||
      result.status !== FRESH_FINAL_TEACHER_STATUS ||
      result.role !== "fresh_final_holdout" ||
      result.postflight_complete !== true ||
      result.selected_seed !== preflight.selected_seed ||
      !sameJson(result.selected_checkpoint, preflight.selected_checkpoint) ||
      !sameJson(result.selection_receipt, preflight.selection_receipt) ||
      !sameJson(result.boundary, FRESH_FINAL_TEACHER_BOUNDARY) ||
      result.runner_revision !== revision ||
      result.generation_run_fingerprint !== expectedGenerationRunFingerprint ||
      result.run_fingerprint !== expectedRunFingerprint
    ) {
      throw new Error("existing fresh-final result is not complete");
    }
    validateFreshFinalDatasetBytesCoreForTests(
      datasetSnapshot.bytes,
      source.rows,
      completion,
    );
    validateStoredIdentity(
      result.manifest,
      manifestSnapshot.identity,
      "fresh-final result manifest identity",
    );
    validateStoredIdentity(
      result.dataset,
      datasetSnapshot.identity,
      "fresh-final result dataset identity",
    );

    const manifest = exactObject(
      parseCanonicalPrivateJson(manifestSnapshot, "fresh-final manifest"),
      [
        "schema",
        "status",
        "role",
        "source",
        "selected_seed",
        "selected_checkpoint",
        "selection_receipt",
        "dataset",
        "completion",
        "runner_revision",
        "generation_run_fingerprint",
        "run_fingerprint",
        "boundary",
      ],
      "fresh-final manifest",
    );
    if (
      manifest.schema !== FRESH_FINAL_TEACHER_MANIFEST_SCHEMA ||
      manifest.status !== FRESH_FINAL_TEACHER_STATUS ||
      manifest.role !== "fresh_final_holdout" ||
      manifest.selected_seed !== preflight.selected_seed ||
      !sameJson(manifest.source, FRESH_FINAL_TEACHER_SOURCE) ||
      !sameJson(manifest.selected_checkpoint, preflight.selected_checkpoint) ||
      !sameJson(manifest.selection_receipt, preflight.selection_receipt) ||
      !sameJson(manifest.completion, completion) ||
      manifest.runner_revision !== revision ||
      manifest.generation_run_fingerprint !==
        expectedGenerationRunFingerprint ||
      manifest.run_fingerprint !== result.run_fingerprint ||
      !sameJson(manifest.boundary, FRESH_FINAL_TEACHER_BOUNDARY)
    ) {
      throw new Error("existing fresh-final manifest is not fully bound");
    }
    validateStoredIdentity(
      manifest.dataset,
      datasetSnapshot.identity,
      "fresh-final manifest dataset identity",
    );

    const authority = exactObject(
      parseCanonicalPrivateJson(authoritySnapshot, "fresh-final authority"),
      [
        "schema",
        "status",
        "role",
        "source",
        "selection_evaluator_registry",
        "selection_evaluation_report",
        "selection_receipt",
        "selection_publication_result",
        "selected_seed",
        "selected_checkpoint",
        "shared_fresh_selection_search_policy",
        "engine_asset_receipt",
        "artifacts",
        "completion",
        "runner_revision",
        "generation_run_fingerprint",
        "run_fingerprint",
        "boundary",
      ],
      "fresh-final authority",
    );
    const artifacts = exactObject(
      authority.artifacts,
      ["manifest", "result", "dataset"],
      "fresh-final authority artifacts",
    );
    if (
      authority.schema !== FRESH_FINAL_TEACHER_AUTHORITY_SCHEMA ||
      authority.status !== FRESH_FINAL_TEACHER_STATUS ||
      authority.role !== "fresh_final_holdout" ||
      authority.selected_seed !== preflight.selected_seed ||
      !sameJson(authority.source, FRESH_FINAL_TEACHER_SOURCE) ||
      !sameJson(
        authority.selection_evaluator_registry,
        preflight.selection_evaluator_registry,
      ) ||
      !sameJson(
        authority.selection_evaluation_report,
        preflight.selection_evaluation_report,
      ) ||
      !sameJson(authority.selection_receipt, preflight.selection_receipt) ||
      !sameJson(
        authority.selection_publication_result,
        preflight.selection_publication_result,
      ) ||
      !sameJson(authority.selected_checkpoint, preflight.selected_checkpoint) ||
      !sameJson(
        authority.shared_fresh_selection_search_policy,
        policy.identity,
      ) ||
      !sameJson(authority.engine_asset_receipt, assets) ||
      !sameJson(authority.completion, completion) ||
      authority.runner_revision !== revision ||
      authority.generation_run_fingerprint !==
        expectedGenerationRunFingerprint ||
      authority.run_fingerprint !== result.run_fingerprint ||
      !sameJson(authority.boundary, FRESH_FINAL_TEACHER_BOUNDARY)
    ) {
      throw new Error("existing fresh-final authority is not fully bound");
    }
    validateStoredIdentity(
      artifacts.manifest,
      manifestSnapshot.identity,
      "fresh-final authority manifest identity",
    );
    validateStoredIdentity(
      artifacts.result,
      resultSnapshot.identity,
      "fresh-final authority result identity",
    );
    validateStoredIdentity(
      artifacts.dataset,
      datasetSnapshot.identity,
      "fresh-final authority dataset identity",
    );
    return {
      schema: FRESH_FINAL_TEACHER_RUNNER_SCHEMA,
      status: FRESH_FINAL_TEACHER_STATUS,
      idempotent_existing_result: true,
      selected_seed: preflight.selected_seed,
      completed_parents: FRESH_FINAL_TEACHER_PARENT_COUNT,
      emitted_parent_groups: completion.emitted_parent_groups as number,
      dataset_records: completion.dataset_records as number,
      parallel_engines: 0,
      live_weight_changes: 0,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function runFreshFinalTeacherCore(
  dependencies: Readonly<FreshFinalTeacherRunnerDependencies>,
): Promise<Readonly<FreshFinalTeacherRunReceipt>> {
  if (
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0 ||
    !Number.isSafeInteger(dependencies.availableParallelism) ||
    dependencies.availableParallelism < 1
  ) {
    throw new Error("fresh-final runner requires a local POSIX runtime");
  }
  const paths = freshFinalTeacherPaths(
    dependencies.homeDirectory(),
    dependencies.repositoryRoot,
  );
  const revision = await dependencies.captureExactCleanRevision(paths.repositoryRoot);
  if (!REVISION_RE.test(revision)) {
    throw new Error("fresh-final runner revision is invalid");
  }

  // This must complete before output creation, locks, assets, source, or engines.
  const beforePreflight = validateFreshFinalTeacherSelectionPreflight(
    await dependencies.selectionPreflight(paths.repositoryRoot),
  );
  dependencies.reportProgress("selected-receipt-preflight-before-complete");

  await ensurePrivateDirectory(paths.outputRoot, dependencies.effectiveUserId);
  const releaseFormalTeacherExclusion =
    await dependencies.acquireFormalTeacherExclusion();
  try {
    const [beforeAssets, beforePolicy, beforeSource] = await Promise.all([
      dependencies.verifyAssets(),
      dependencies.readSearchPolicy(paths.searchPolicy, paths.repositoryRoot, revision),
      dependencies.readSource(paths.source),
    ]);
    const searchPolicy = validateFreshSelectionTeacherSearchPolicy(
      beforePolicy.value,
      dependencies.availableParallelism,
    );
    if (
      beforeSource.rows.length !== FRESH_FINAL_TEACHER_PARENT_COUNT ||
      !sameJson(beforeSource.identity, FRESH_FINAL_TEACHER_SOURCE)
    ) {
      throw new Error("fresh-final source identity is invalid");
    }
    dependencies.reportProgress("source-assets-policy-before-complete");
    const expectedGenerationRunFingerprint =
      await dependencies.computeGenerationFingerprint({
        paths,
        revision,
        source: beforeSource,
        policy: beforePolicy,
        assets: beforeAssets,
      });
    if (!SHA256_RE.test(expectedGenerationRunFingerprint)) {
      throw new Error("fresh-final expected generation fingerprint is invalid");
    }

    const existing = await verifyExistingResult(
      paths,
      dependencies.effectiveUserId,
      revision,
      beforePreflight,
      beforePolicy,
      beforeAssets,
      beforeSource,
      expectedGenerationRunFingerprint,
    );
    if (existing) {
      const [afterPreflight, afterAssets, afterPolicy, afterSource] =
        await Promise.all([
          dependencies.selectionPreflight(paths.repositoryRoot),
          dependencies.verifyAssets(),
          dependencies.readSearchPolicy(
            paths.searchPolicy,
            paths.repositoryRoot,
            revision,
          ),
          dependencies.readSource(paths.source),
        ]);
      if (
        !sameJson(
          beforePreflight,
          validateFreshFinalTeacherSelectionPreflight(afterPreflight),
        ) ||
        !sameJson(beforeAssets, afterAssets) ||
        !sameJson(beforePolicy, afterPolicy) ||
        !sameJson(beforeSource.identity, afterSource.identity)
      ) {
        throw new Error("fresh-final existing-result postflight drifted");
      }
      const afterGenerationRunFingerprint =
        await dependencies.computeGenerationFingerprint({
          paths,
          revision,
          source: afterSource,
          policy: afterPolicy,
          assets: afterAssets,
        });
      if (afterGenerationRunFingerprint !== expectedGenerationRunFingerprint) {
        throw new Error(
          "fresh-final existing-result generation evidence drifted",
        );
      }
      return Object.freeze({
        ...existing,
        parallel_engines: searchPolicy.runtime.parallel_engines,
      });
    }

    const outcome = await dependencies.generate({
      rows: beforeSource.rows,
      source: FRESH_FINAL_TEACHER_SOURCE,
      outputRoot: paths.outputRoot,
      datasetPath: paths.dataset,
      workPath: paths.work,
      runnerRevision: revision,
      engineBin: paths.engineBin,
      engineReceipt: paths.engineReceipt,
      evalDir: paths.evalDir,
      searchPolicy,
      searchPolicyIdentity: beforePolicy.identity,
      selectionPreflight: beforePreflight,
    });
    if (
      outcome.generation_run_fingerprint !== expectedGenerationRunFingerprint
    ) {
      throw new Error(
        "fresh-final generator fingerprint does not match current evidence",
      );
    }
    const completion = completionFromOutcome(outcome);
    dependencies.reportProgress("teacher-generation-complete");

    const [afterPreflight, afterAssets, afterPolicy, afterSource] =
      await Promise.all([
        dependencies.selectionPreflight(paths.repositoryRoot),
        dependencies.verifyAssets(),
        dependencies.readSearchPolicy(paths.searchPolicy, paths.repositoryRoot, revision),
        dependencies.readSource(paths.source),
      ]);
    if (
      !sameJson(
        beforePreflight,
        validateFreshFinalTeacherSelectionPreflight(afterPreflight),
      ) ||
      !sameJson(beforeAssets, afterAssets) ||
      !sameJson(beforePolicy, afterPolicy) ||
      !sameJson(beforeSource.identity, afterSource.identity)
    ) {
      throw new Error("fresh-final postflight evidence drifted");
    }
    const afterGenerationRunFingerprint =
      await dependencies.computeGenerationFingerprint({
        paths,
        revision,
        source: afterSource,
        policy: afterPolicy,
        assets: afterAssets,
      });
    if (afterGenerationRunFingerprint !== expectedGenerationRunFingerprint) {
      throw new Error("fresh-final generation fingerprint changed postflight");
    }
    const datasetSnapshot = await readPrivateArtifact(
      paths.dataset,
      paths.outputRoot,
      dependencies.effectiveUserId,
      FRESH_FINAL_TEACHER_DATASET_SCHEMA,
    );
    validateFreshFinalDatasetBytesCoreForTests(
      datasetSnapshot.bytes,
      beforeSource.rows,
      completion,
    );
    const dataset = datasetSnapshot.identity;
    const runFingerprint = buildRunFingerprint(
      revision,
      beforePreflight,
      beforePolicy,
      expectedGenerationRunFingerprint,
      beforeAssets,
    );
    const manifest = {
      schema: FRESH_FINAL_TEACHER_MANIFEST_SCHEMA,
      status: FRESH_FINAL_TEACHER_STATUS,
      role: "fresh_final_holdout",
      source: FRESH_FINAL_TEACHER_SOURCE,
      selected_seed: beforePreflight.selected_seed,
      selected_checkpoint: beforePreflight.selected_checkpoint,
      selection_receipt: beforePreflight.selection_receipt,
      dataset,
      completion,
      runner_revision: revision,
      generation_run_fingerprint: expectedGenerationRunFingerprint,
      run_fingerprint: runFingerprint,
      boundary: FRESH_FINAL_TEACHER_BOUNDARY,
    };
    const manifestBytes = jsonBytes(manifest);
    const manifestIdentity = identityForBytes(
      paths.manifest,
      manifestBytes,
      FRESH_FINAL_TEACHER_MANIFEST_SCHEMA,
    );
    const result = {
      schema: FRESH_FINAL_TEACHER_RESULT_SCHEMA,
      status: FRESH_FINAL_TEACHER_STATUS,
      role: "fresh_final_holdout",
      selected_seed: beforePreflight.selected_seed,
      selected_checkpoint: beforePreflight.selected_checkpoint,
      selection_receipt: beforePreflight.selection_receipt,
      manifest: manifestIdentity,
      dataset,
      completion,
      runner_revision: revision,
      generation_run_fingerprint: expectedGenerationRunFingerprint,
      run_fingerprint: runFingerprint,
      postflight_complete: true,
      boundary: FRESH_FINAL_TEACHER_BOUNDARY,
    };
    const resultBytes = jsonBytes(result);
    const resultIdentity = identityForBytes(
      paths.result,
      resultBytes,
      FRESH_FINAL_TEACHER_RESULT_SCHEMA,
    );
    const authority = {
      schema: FRESH_FINAL_TEACHER_AUTHORITY_SCHEMA,
      status: FRESH_FINAL_TEACHER_STATUS,
      role: "fresh_final_holdout",
      source: FRESH_FINAL_TEACHER_SOURCE,
      selection_evaluator_registry:
        beforePreflight.selection_evaluator_registry,
      selection_evaluation_report:
        beforePreflight.selection_evaluation_report,
      selection_receipt: beforePreflight.selection_receipt,
      selection_publication_result:
        beforePreflight.selection_publication_result,
      selected_seed: beforePreflight.selected_seed,
      selected_checkpoint: beforePreflight.selected_checkpoint,
      shared_fresh_selection_search_policy: beforePolicy.identity,
      engine_asset_receipt: beforeAssets,
      artifacts: {
        manifest: manifestIdentity,
        result: resultIdentity,
        dataset,
      },
      completion,
      runner_revision: revision,
      generation_run_fingerprint: expectedGenerationRunFingerprint,
      run_fingerprint: runFingerprint,
      boundary: FRESH_FINAL_TEACHER_BOUNDARY,
    };
    await commitPrivateBytes(paths.manifest, manifestBytes);
    await commitPrivateBytes(paths.authority, jsonBytes(authority));
    // result.json is the sole completion marker and is always committed last.
    await commitPrivateBytes(paths.result, resultBytes);
    dependencies.reportProgress("result-committed-last");
    return Object.freeze({
      schema: FRESH_FINAL_TEACHER_RUNNER_SCHEMA,
      status: FRESH_FINAL_TEACHER_STATUS,
      idempotent_existing_result: false,
      selected_seed: beforePreflight.selected_seed,
      completed_parents: FRESH_FINAL_TEACHER_PARENT_COUNT,
      emitted_parent_groups: outcome.emitted_parent_groups,
      dataset_records: outcome.dataset_records,
      parallel_engines: searchPolicy.runtime.parallel_engines,
      live_weight_changes: 0,
    });
  } finally {
    await releaseFormalTeacherExclusion();
  }
}

async function readSource(
  file: string,
): Promise<Readonly<FreshFinalTeacherSourceSnapshot>> {
  const bytes = await fs.promises.readFile(file);
  const identity: FloodgateRoleBundleRawIdentity = {
    ...FRESH_FINAL_TEACHER_SOURCE,
    path: "fresh-final-holdout.raw.jsonl",
  };
  const rows = parseAuthenticatedFloodgateFreshFinalRows(bytes, identity);
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    rows,
    identity: FRESH_FINAL_TEACHER_SOURCE,
  });
}

async function computeGenerationFingerprint(
  request: Readonly<{
    paths: FreshFinalTeacherPaths;
    revision: string;
    source: FreshFinalTeacherSourceSnapshot;
    policy: SearchPolicySnapshot;
    assets: AssetReceipt;
  }>,
): Promise<string> {
  const receiptBytes = await fs.promises.readFile(request.paths.engineReceipt);
  const receiptIdentity = request.assets.assets.engine.receipt;
  if (
    receiptBytes.byteLength !== receiptIdentity.bytes ||
    sha256(receiptBytes) !== receiptIdentity.sha256
  ) {
    throw new Error("fresh-final generation engine receipt changed");
  }
  const engineIdentity = request.assets.assets.engine.yaneuraou;
  return freshFinalSiblingTeacherRunFingerprintFromEvidence({
    source: Object.freeze({
      ...FRESH_FINAL_TEACHER_SOURCE,
      path: "fresh-final-holdout.raw.jsonl",
    }),
    sourceRows: request.source.rows,
    pipeline: {
      source_revision: request.revision,
      tracked_tree_clean: true,
    },
    engineBinSha256: engineIdentity.sha256,
    engineBinBytes: engineIdentity.bytes,
    engineReceiptBytes: receiptBytes,
    evalSha256: request.assets.assets.eval.tree_sha256,
    multipv: request.policy.value.teacher.proposal.multipv,
    proposalDepth: request.policy.value.teacher.proposal.depth,
    depth: request.policy.value.teacher.independent_rescore.depth,
    parallelEngines: request.policy.value.runtime.parallel_engines,
    hashMbPerEngine: request.policy.value.runtime.hash_mb_per_engine,
    timeoutMs: request.policy.value.runtime.timeout_ms_per_search,
    proposalIncompleteAllLegalFallbackMaxMoves:
      request.policy.value.teacher.typed_incomplete_proposal_fallback
        .allowed_only_when_legal_moves_at_most,
  });
}

async function readSearchPolicy(
  file: string,
  repositoryRoot: string,
  revision: string,
): Promise<Readonly<SearchPolicySnapshot>> {
  const verified = await captureFloodgateGitExactCleanRevision(repositoryRoot);
  if (verified !== revision) {
    throw new Error("fresh-final shared search-policy revision changed");
  }
  const bytes = await fs.promises.readFile(file);
  const value = JSON.parse(bytes.toString("utf8")) as FreshSelectionTeacherSearchPolicy;
  return Object.freeze({
    value: Object.freeze(value),
    identity: Object.freeze({
      path: FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      schema: FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
    }),
  });
}

function subprocessJson(
  executable: string,
  arguments_: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
  spawnProcess: typeof spawn = spawn,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value: unknown): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const child = spawnProcess(executable, [...arguments_], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", safeReject);
    child.once("close", (code) => {
      if (settled) return;
      const stdoutBytes = Buffer.concat(stdout);
      if (code === 2) {
        try {
          const value = JSON.parse(
            stdoutBytes.toString("utf8"),
          ) as FreshFinalTeacherBlockedReceipt;
          if (
            value.schema !== FRESH_FINAL_TEACHER_PREFLIGHT_CLI_SCHEMA ||
            value.status !== "STOP" ||
            value.reason !== "selected-candidate-receipt-not-ready" ||
            value.selection_evaluator_registry_reads !== 1 ||
            value.selection_receipt_reads !== 0 ||
            value.selection_dataset_reads !== 0 ||
            value.fresh_final_source_reads !== 0 ||
            value.fresh_final_label_reads !== 0 ||
            value.teacher_engines_started !== 0 ||
            value.network_requests !== 0 ||
            value.cloud_requests !== 0 ||
            value.live_weight_writes !== 0
          ) {
            throw new Error("fresh-final preflight STOP receipt is invalid");
          }
          safeReject(new FreshFinalTeacherBlocked(Object.freeze(value)));
        } catch (error) {
          safeReject(error);
        }
        return;
      }
      if (code !== 0) {
        safeReject(
          new Error(
            `fresh-final selection preflight failed: ${Buffer.concat(stderr)
              .toString("utf8")
              .trim()}`,
          ),
        );
        return;
      }
      try {
        safeResolve(JSON.parse(stdoutBytes.toString("utf8")) as unknown);
      } catch {
        safeReject(
          new Error("fresh-final selection preflight returned invalid JSON"),
        );
      }
    });
  });
}

export function subprocessJsonCoreForTests(
  executable: string,
  arguments_: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
  spawnProcess: typeof spawn,
): Promise<unknown> {
  return subprocessJson(executable, arguments_, options, spawnProcess);
}

async function selectionPreflight(
  repositoryRoot: string,
): Promise<Readonly<FreshFinalTeacherSelectionPreflight>> {
  const localPython = path.join(repositoryRoot, ".venv", "bin", "python3");
  const executable = fs.existsSync(localPython) ? localPython : "python3";
  return (await subprocessJson(
    executable,
    [
      path.join(
        repositoryRoot,
        "ml",
        "run_strength_first_fresh_final_teacher_preflight.py",
      ),
    ],
    {
      cwd: repositoryRoot,
      env: {
        HOME: os.homedir(),
        LANG: "C",
        LC_ALL: "C",
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        PYTHONPATH: path.join(repositoryRoot, "ml"),
        TZ: "UTC",
      },
    },
  )) as Readonly<FreshFinalTeacherSelectionPreflight>;
}

export function assertFreshFinalTeacherGeneratorOutputPathsCoreForTests(
  outputRoot: string,
  datasetPath: string,
  workPath: string,
): void {
  const generatedPaths = siblingTeacherStagePaths(outputRoot);
  if (
    generatedPaths.final !== path.resolve(datasetPath) ||
    generatedPaths.work !== path.resolve(workPath)
  ) {
    throw new Error("fresh-final generator output paths drifted");
  }
}

async function generateFreshFinalTeacher(
  request: Readonly<FreshFinalTeacherGeneratorRequest>,
): Promise<Readonly<FreshFinalTeacherGeneratorOutcome>> {
  assertFreshFinalTeacherGeneratorOutputPathsCoreForTests(
    request.outputRoot,
    request.datasetPath,
    request.workPath,
  );
  const source: FloodgateFreshFinalRawIdentity = Object.freeze({
    ...request.source,
    path: "fresh-final-holdout.raw.jsonl",
  });
  return generateFreshFinalSiblingTeacherDataset(
    Object.freeze({
      schema: FRESH_FINAL_TEACHER_INPUT_SCHEMA,
      role: "fresh_final_holdout",
      source,
      rows: request.rows,
    }),
    Object.freeze({
      stageRoot: request.outputRoot,
      runnerRevision: request.runnerRevision,
      engineBin: request.engineBin,
      engineArgs: Object.freeze([]),
      engineReceipt: request.engineReceipt,
      evalDir: request.evalDir,
      multipv: request.searchPolicy.teacher.proposal.multipv,
      proposalDepth: request.searchPolicy.teacher.proposal.depth,
      depth: request.searchPolicy.teacher.independent_rescore.depth,
      engines: request.searchPolicy.runtime.parallel_engines,
      hashMb: request.searchPolicy.runtime.hash_mb_per_engine,
      timeoutMs: request.searchPolicy.runtime.timeout_ms_per_search,
      proposalIncompleteAllLegalFallbackMaxMoves:
        request.searchPolicy.teacher.typed_incomplete_proposal_fallback
          .allowed_only_when_legal_moves_at_most,
    }),
  );
}

async function acquireFormalTeacherExclusion(): Promise<() => Promise<void>> {
  return acquireFreshSelectionFormalTeacherExclusionCoreForTests(
    os.homedir(),
    path.resolve(__dirname, ".."),
    effectiveUserId(),
    {
      prepareDirectory: ensurePrivateDirectory,
      acquireLock: (outputRoot, uid) =>
        acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
          outputRoot,
          uid,
          {
            lockfExecutable: "/usr/bin/lockf",
            acquisitionTimeoutMs: 10_000,
          },
        ),
    },
  );
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("fresh-final teacher requires process.geteuid()");
  }
  return process.geteuid();
}

const PRODUCTION_DEPENDENCIES: FreshFinalTeacherRunnerDependencies =
  Object.freeze({
    homeDirectory: () => os.homedir(),
    repositoryRoot: path.resolve(__dirname, ".."),
    effectiveUserId: effectiveUserId(),
    availableParallelism: os.availableParallelism(),
    captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
    selectionPreflight,
    acquireFormalTeacherExclusion,
    verifyAssets: verifyPinnedFloodgateStrengthFirstV8TeacherAuthority,
    readSearchPolicy,
    readSource,
    generate: generateFreshFinalTeacher,
    computeGenerationFingerprint,
    reportProgress: (phase: string) => {
      process.stderr.write(
        `${JSON.stringify({
          schema: "shogi-floodgate-strength-first-fresh-final-teacher-progress-v1",
          phase,
        })}\n`,
      );
    },
  });

/** Execute the fixed, argumentless current-user local runner. */
export function runFreshFinalTeacher(): Promise<
  Readonly<FreshFinalTeacherRunReceipt>
> {
  return runFreshFinalTeacherCore(PRODUCTION_DEPENDENCIES);
}
