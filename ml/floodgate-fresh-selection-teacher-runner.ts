/**
 * Fixed local runner for the 4,800-parent fresh-selection sibling teacher.
 *
 * Three candidate checkpoints must strict-load before the source is opened.
 * The same checkpoint, source, search-policy, and engine-asset evidence is
 * revalidated after generation. result.json is committed last. This module
 * has no network, cloud, candidate-selection, or live-weight write path.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  type FloodgateRoleBundleRawIdentity,
} from "./floodgate-role-bundle";
import {
  parseAuthenticatedFloodgateFreshSelectionRows,
  type FloodgateFreshSelectionRawIdentity,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-validation";
import {
  FRESH_SELECTION_TEACHER_INPUT_SCHEMA,
  SIBLING_TEACHER_WORK_SCHEMA,
  generateFreshSelectionSiblingTeacherDataset,
  siblingTeacherStagePaths,
  strengthFirstTimeoutSkipLimit,
} from "./generate-sibling-teacher";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-production-teacher-asset-authority";
import {
  verifyPinnedFloodgateStrengthFirstV8TeacherAuthority,
  type FloodgateStrengthFirstV8TeacherAuthorityReceipt,
} from "./floodgate-strength-first-v8-teacher-authority";
import {
  acquireFloodgateStrengthFirstTeacherRunLockCoreForTests,
  floodgateStrengthFirstTeacherPaths,
} from "./floodgate-strength-first-teacher-runner";
import { resolveFloodgateStrengthFirstTrainingPython } from "./floodgate-strength-first-training-python";
import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";

export const FRESH_SELECTION_TEACHER_AUTHORITY_SCHEMA =
  "shogi-floodgate-strength-first-selection-teacher-authority-v2" as const;
export const FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA =
  "shogi-floodgate-strength-first-selection-teacher-manifest-v2" as const;
export const FRESH_SELECTION_TEACHER_RESULT_SCHEMA =
  "shogi-floodgate-strength-first-selection-teacher-result-v2" as const;
export const FRESH_SELECTION_TEACHER_DATASET_SCHEMA =
  "canonical-shogi-sibling-v1-jsonl-one-lf-per-row" as const;
export const FRESH_SELECTION_TEACHER_STATUS =
  "complete-fresh-selection-only-postflight-bound" as const;
export const FRESH_SELECTION_TEACHER_RUNNER_SCHEMA =
  "shogi-floodgate-strength-first-selection-teacher-runner-v2" as const;
export const FRESH_SELECTION_TEACHER_PREFLIGHT_SCHEMA =
  "shogi-floodgate-strength-first-selection-teacher-preflight-v1" as const;
export const FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA =
  "shogi-floodgate-fresh-role-teacher-search-policy-v2" as const;
export const FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH =
  "ml/protocols/floodgate-q1-2026-strength-first-fresh-role-teacher-search-policy-v2.json" as const;
export const FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT =
  ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v2" as const;
export const FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH =
  ".codex/shogi-bundles/floodgate-q1-2026-label-free-role-bundle-v2/fresh-selection.raw.jsonl" as const;
export const FRESH_SELECTION_TEACHER_PARENT_COUNT = 4_800 as const;
export const FRESH_SELECTION_TEACHER_GAME_COUNT = 200 as const;
export const FRESH_SELECTION_TEACHER_PARALLEL_ENGINES = 12 as const;
export const FRESH_SELECTION_TEACHER_HASH_MB_PER_ENGINE = 512 as const;
export const FRESH_SELECTION_FORMAL_V9_OUTPUT_DIRECTORY =
  "floodgate-q1-2026-strength-first-v9" as const;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;

export const FRESH_SELECTION_TEACHER_SOURCE = Object.freeze({
  path: FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH,
  format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  bytes: 3_073_306,
  sha256: "76e43969374704a77745fd329e5d22059d036fb8235626af91421fbeba16a4d9",
  records: FRESH_SELECTION_TEACHER_PARENT_COUNT,
  games: FRESH_SELECTION_TEACHER_GAME_COUNT,
  game_ids_sha256:
    "417e2e1053d9f222e82478840f9021c68d88948fec6c9db927538ebadd77e0cb",
  parent_ids_sha256:
    "db24301a7168e84de2474939e8d2b865b670b448aa6ccba2999a4e19df111a3f",
  position_ids_count: FRESH_SELECTION_TEACHER_PARENT_COUNT,
  position_ids_sha256:
    "3e0c7c049bc4e0799854a4371266278c61ce53184ae14f6be82c40ab73ef02c0",
} as const);

export const FRESH_SELECTION_TEACHER_BOUNDARY = Object.freeze({
  role: "fresh_selection",
  checkpoint_preflight_required_before_label_generation: true,
  training_rows_read: false,
  final_holdout_read: false,
  network: false,
  candidate_selection_decision_made: false,
  live_weight_write_authorized: false,
} as const);

export interface FreshSelectionTeacherArtifactIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
}

export interface FreshSelectionTeacherCheckpointPreflight {
  readonly schema: typeof FRESH_SELECTION_TEACHER_PREFLIGHT_SCHEMA;
  readonly status: "three-candidate-checkpoints-strict-loaded";
  readonly training_plan: FreshSelectionTeacherArtifactIdentity;
  readonly selection_preflight_registry: FreshSelectionTeacherArtifactIdentity;
  readonly checkpoint_preflight_sha256: string;
  readonly strict_loaded_seeds: readonly [42, 43, 44];
  readonly strict_loaded_checkpoints: 3;
  readonly selection_source_opened: false;
  readonly network_requests: 0;
  readonly live_weight_writes: 0;
}

export interface FreshSelectionTeacherSearchPolicy {
  readonly schema: typeof FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA;
  readonly status: "ready-for-post-checkpoint-local-teacher";
  readonly role: "fresh_selection_and_fresh_final";
  readonly teacher: Readonly<{
    readonly engine: "YaneuraOu";
    readonly threads_per_engine: 1;
    readonly proposal: Readonly<{ readonly multipv: number; readonly depth: number }>;
    readonly typed_incomplete_proposal_fallback: Readonly<{
      readonly allowed_only_when_legal_moves_at_most: number;
      readonly search: "every-legal-move-separately";
      readonly multipv: 1;
      readonly depth: number;
      readonly mixed_partial_and_fallback_ranks_accepted: false;
    }>;
    readonly candidate_union: readonly [
      "complete-proposal-or-complete-all-legal-fallback",
      "strong-game-played-move",
    ];
    readonly independent_rescore: Readonly<{
      readonly multipv: 1;
      readonly searchmoves: "exactly-one-candidate";
      readonly depth: number;
      readonly isready_before_each_candidate: true;
      readonly tt_reset_before_each_candidate: true;
      readonly candidate_execution_order: "utf8-bytewise-ascending";
    }>;
  }>;
  readonly runtime: Readonly<{
    readonly parallel_engines: number;
    readonly threads_per_engine: 1;
    readonly hash_mb_per_engine: number;
    readonly timeout_ms_per_search: number;
    readonly network: false;
  }>;
  readonly completion: Readonly<{
    readonly input_parents: 4_800;
    readonly input_games: 200;
    readonly search_timeout_no_label: Readonly<{
      readonly disposition: "forced-parent-skip-no-label";
      readonly skip_limit_divisor: 1_000;
      readonly maximum_skips: 5;
      readonly partial_parent_labels_accepted: false;
    }>;
    readonly proposal_fallback_timeout: "fatal-no-publication";
    readonly proposal_incomplete_without_exact_fallback: "fatal-no-publication";
    readonly allowed_forced_skip_reasons: readonly [
      "fewer_than_two_legal_moves",
      "search-timeout-no-label",
    ];
    readonly partial_publication: false;
  }>;
}

export interface FreshSelectionTeacherGeneratorRequest {
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly source: typeof FRESH_SELECTION_TEACHER_SOURCE;
  readonly outputRoot: string;
  readonly datasetPath: string;
  readonly workPath: string;
  readonly runnerRevision: string;
  readonly engineBin: string;
  readonly engineReceipt: string;
  readonly evalDir: string;
  readonly searchPolicy: Readonly<FreshSelectionTeacherSearchPolicy>;
  readonly searchPolicyIdentity: FreshSelectionTeacherArtifactIdentity;
  readonly checkpointPreflightSha256: string;
}

export interface FreshSelectionTeacherGeneratorOutcome {
  readonly status: "complete-fresh-selection-only";
  readonly generation_run_fingerprint: string;
  readonly completed_parents: 4_800;
  readonly forced_parents_skipped: number;
  readonly forced_skip_reasons: Readonly<{
    readonly fewer_than_two_legal_moves: number;
    readonly search_timeout_no_label: number;
  }>;
  readonly work: Readonly<{
    readonly path: "work.jsonl";
    readonly bytes: number;
    readonly sha256: string;
    readonly schema: typeof SIBLING_TEACHER_WORK_SCHEMA;
    readonly records: 4_801;
  }>;
  readonly parent_accounting: Readonly<{
    readonly parent_ids_sha256: string;
    readonly forced_parent_ids_sha256: string;
    readonly emitted_parent_ids_sha256: string;
    readonly fewer_than_two_legal_move_parent_ids_sha256: string;
    readonly search_timeout_parent_ids_sha256: string;
  }>;
  readonly emitted_parent_groups: number;
  readonly dataset_records: number;
}

export interface FreshSelectionTeacherPaths {
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

type AssetReceipt = Readonly<
  FloodgateStrengthFirstV8TeacherAuthorityReceipt<
    "production-fixed-registry-and-deployment-root"
  >
>;

interface SearchPolicySnapshot {
  readonly value: Readonly<FreshSelectionTeacherSearchPolicy>;
  readonly identity: FreshSelectionTeacherArtifactIdentity;
}

export interface FreshSelectionTeacherSourceSnapshot {
  readonly bytes: Uint8Array;
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly identity: typeof FRESH_SELECTION_TEACHER_SOURCE;
}

export interface FreshSelectionTeacherRunnerDependencies {
  readonly homeDirectory: () => string;
  readonly repositoryRoot: string;
  readonly effectiveUserId: number;
  readonly availableParallelism: number;
  readonly acquireFormalTeacherExclusion: () => Promise<() => Promise<void>>;
  readonly captureExactCleanRevision: (repositoryRoot: string) => Promise<string>;
  readonly checkpointPreflight: (
    repositoryRoot: string,
  ) => Promise<Readonly<FreshSelectionTeacherCheckpointPreflight>>;
  readonly verifyAssets: () => Promise<AssetReceipt>;
  readonly readSearchPolicy: (
    file: string,
    repositoryRoot: string,
    revision: string,
  ) => Promise<Readonly<SearchPolicySnapshot>>;
  readonly readSource: (
    file: string,
  ) => Promise<Readonly<FreshSelectionTeacherSourceSnapshot>>;
  readonly generate: (
    request: Readonly<FreshSelectionTeacherGeneratorRequest>,
  ) => Promise<Readonly<FreshSelectionTeacherGeneratorOutcome>>;
  readonly reportProgress: (phase: string) => void;
}

export interface FreshSelectionTeacherRunReceipt {
  readonly schema: typeof FRESH_SELECTION_TEACHER_RUNNER_SCHEMA;
  readonly status: typeof FRESH_SELECTION_TEACHER_STATUS;
  readonly idempotent_existing_result: boolean;
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
      throw new Error("fresh-selection canonical JSON rejects this number");
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
  throw new Error(`fresh-selection canonical JSON rejects ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function freshSelectionTeacherPaths(
  homeInput: string,
  repositoryInput: string,
): Readonly<FreshSelectionTeacherPaths> {
  const home = path.resolve(homeInput);
  const repositoryRoot = path.resolve(repositoryInput);
  const outputRoot = path.join(
    home,
    ...FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT.split("/"),
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
      ...FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH.split("/"),
    ),
    searchPolicy: path.join(repositoryRoot, FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH),
    authority: path.join(outputRoot, "authority.json"),
    manifest: path.join(outputRoot, "manifest.json"),
    result: path.join(outputRoot, "result.json"),
    dataset: path.join(outputRoot, "selection.jsonl"),
    work: path.join(outputRoot, "work.jsonl"),
    engineBin: path.join(assetRoot, "engine", "yaneuraou"),
    engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
    evalDir: path.join(assetRoot, "eval"),
  });
}

export function freshSelectionFormalTeacherOutputRoots(
  homeInput: string,
  repositoryInput: string,
): readonly [string, string] {
  const home = path.resolve(homeInput);
  const v8Root = floodgateStrengthFirstTeacherPaths(
    home,
    path.resolve(repositoryInput),
  ).outputRoot;
  const v9Root = path.join(
    home,
    ".codex",
    "shogi-runs",
    FRESH_SELECTION_FORMAL_V9_OUTPUT_DIRECTORY,
  );
  return Object.freeze([v8Root, v9Root]);
}

function validatePreflight(
  value: Readonly<FreshSelectionTeacherCheckpointPreflight>,
): Readonly<FreshSelectionTeacherCheckpointPreflight> {
  if (
    value.schema !== FRESH_SELECTION_TEACHER_PREFLIGHT_SCHEMA ||
    value.status !== "three-candidate-checkpoints-strict-loaded" ||
    !sameJson(value.strict_loaded_seeds, [42, 43, 44]) ||
    value.strict_loaded_checkpoints !== 3 ||
    value.selection_source_opened !== false ||
    value.network_requests !== 0 ||
    value.live_weight_writes !== 0 ||
    !SHA256_RE.test(value.checkpoint_preflight_sha256)
  ) {
    throw new Error("fresh-selection checkpoint preflight is incomplete");
  }
  return value;
}

export function validateFreshSelectionTeacherSearchPolicy(
  value: Readonly<FreshSelectionTeacherSearchPolicy>,
  availableParallelism: number,
): Readonly<FreshSelectionTeacherSearchPolicy> {
  const teacher = value.teacher;
  const runtime = value.runtime;
  const fallback = teacher?.typed_incomplete_proposal_fallback;
  const proposal = teacher?.proposal;
  const rescore = teacher?.independent_rescore;
  if (
    value.schema !== FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA ||
    value.status !== "ready-for-post-checkpoint-local-teacher" ||
    value.role !== "fresh_selection_and_fresh_final" ||
    teacher?.engine !== "YaneuraOu" ||
    teacher.threads_per_engine !== 1 ||
    !Number.isSafeInteger(proposal?.multipv) ||
    proposal.multipv < 2 ||
    proposal.multipv > 64 ||
    !Number.isSafeInteger(proposal.depth) ||
    proposal.depth < 1 ||
    fallback?.allowed_only_when_legal_moves_at_most !== proposal.multipv ||
    fallback.search !== "every-legal-move-separately" ||
    fallback.multipv !== 1 ||
    fallback.depth !== proposal.depth ||
    fallback.mixed_partial_and_fallback_ranks_accepted !== false ||
    !sameJson(teacher.candidate_union, [
      "complete-proposal-or-complete-all-legal-fallback",
      "strong-game-played-move",
    ]) ||
    rescore?.multipv !== 1 ||
    rescore.searchmoves !== "exactly-one-candidate" ||
    !Number.isSafeInteger(rescore.depth) ||
    rescore.depth < proposal.depth ||
    rescore.isready_before_each_candidate !== true ||
    rescore.tt_reset_before_each_candidate !== true ||
    rescore.candidate_execution_order !== "utf8-bytewise-ascending" ||
    runtime?.threads_per_engine !== 1 ||
    !Number.isSafeInteger(runtime.parallel_engines) ||
    runtime.parallel_engines !== FRESH_SELECTION_TEACHER_PARALLEL_ENGINES ||
    runtime.parallel_engines > Math.min(32, availableParallelism) ||
    runtime.hash_mb_per_engine !==
      FRESH_SELECTION_TEACHER_HASH_MB_PER_ENGINE ||
    !Number.isSafeInteger(runtime.timeout_ms_per_search) ||
    runtime.timeout_ms_per_search < 1_000 ||
    runtime.network !== false ||
    value.completion?.input_parents !== FRESH_SELECTION_TEACHER_PARENT_COUNT ||
    value.completion.input_games !== FRESH_SELECTION_TEACHER_GAME_COUNT ||
    value.completion.search_timeout_no_label?.disposition !==
      "forced-parent-skip-no-label" ||
    value.completion.search_timeout_no_label.skip_limit_divisor !== 1_000 ||
    value.completion.search_timeout_no_label.maximum_skips !==
      strengthFirstTimeoutSkipLimit(FRESH_SELECTION_TEACHER_PARENT_COUNT) ||
    value.completion.search_timeout_no_label.partial_parent_labels_accepted !==
      false ||
    value.completion.proposal_fallback_timeout !== "fatal-no-publication" ||
    value.completion.proposal_incomplete_without_exact_fallback !==
      "fatal-no-publication" ||
    !sameJson(value.completion.allowed_forced_skip_reasons, [
      "fewer_than_two_legal_moves",
      "search-timeout-no-label",
    ]) ||
    value.completion.partial_publication !== false
  ) {
    throw new Error("fresh-selection search policy is invalid or exceeds this Mac");
  }
  return value;
}

async function ensurePrivateDirectory(
  directory: string,
  effectiveUserId: number,
): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  await fs.promises.chmod(directory, DIRECTORY_MODE);
  const stat = await fs.promises.lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.uid !== effectiveUserId ||
    (stat.mode & 0o7777) !== DIRECTORY_MODE
  ) {
    throw new Error("fresh-selection output root must be private 0700");
  }
}

async function digestPrivateFile(
  file: string,
  root: string,
  effectiveUserId: number,
  schema: string,
): Promise<FreshSelectionTeacherArtifactIdentity> {
  const stat = await fs.promises.lstat(file);
  if (
    !stat.isFile() ||
    stat.uid !== effectiveUserId ||
    (stat.mode & 0o7777) !== FILE_MODE
  ) {
    throw new Error(`fresh-selection artifact is not private 0600: ${path.basename(file)}`);
  }
  const bytes = await fs.promises.readFile(file);
  const relative = path.relative(root, file).split(path.sep).join("/");
  return Object.freeze({
    path: `${FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT}/${relative}`,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    schema,
  });
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

function identityForBytes(
  file: string,
  bytes: Uint8Array,
  schema: string,
): FreshSelectionTeacherArtifactIdentity {
  return {
    path: `${FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT}/${path.basename(file)}`,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    schema,
  };
}

function completionFromOutcome(
  outcome: Readonly<FreshSelectionTeacherGeneratorOutcome>,
): Readonly<Record<string, unknown>> {
  const forced = outcome.forced_parents_skipped;
  const forcedMove = outcome.forced_skip_reasons.fewer_than_two_legal_moves;
  const timeout = outcome.forced_skip_reasons.search_timeout_no_label;
  const accounting = outcome.parent_accounting;
  if (
    outcome.status !== "complete-fresh-selection-only" ||
    outcome.completed_parents !== FRESH_SELECTION_TEACHER_PARENT_COUNT ||
    !Number.isSafeInteger(forced) ||
    forced < 0 ||
    !Number.isSafeInteger(forcedMove) ||
    forcedMove < 0 ||
    !Number.isSafeInteger(timeout) ||
    timeout < 0 ||
    timeout > strengthFirstTimeoutSkipLimit(FRESH_SELECTION_TEACHER_PARENT_COUNT) ||
    forcedMove + timeout !== forced ||
    outcome.work.path !== "work.jsonl" ||
    outcome.work.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    outcome.work.records !== FRESH_SELECTION_TEACHER_PARENT_COUNT + 1 ||
    !Number.isSafeInteger(outcome.work.bytes) ||
    outcome.work.bytes < 1 ||
    !SHA256_RE.test(outcome.work.sha256) ||
    accounting.parent_ids_sha256 !== FRESH_SELECTION_TEACHER_SOURCE.parent_ids_sha256 ||
    !SHA256_RE.test(accounting.forced_parent_ids_sha256) ||
    !SHA256_RE.test(accounting.emitted_parent_ids_sha256) ||
    !SHA256_RE.test(accounting.fewer_than_two_legal_move_parent_ids_sha256) ||
    !SHA256_RE.test(accounting.search_timeout_parent_ids_sha256) ||
    !Number.isSafeInteger(outcome.emitted_parent_groups) ||
    outcome.emitted_parent_groups < 1 ||
    outcome.emitted_parent_groups + forced !== FRESH_SELECTION_TEACHER_PARENT_COUNT ||
    !Number.isSafeInteger(outcome.dataset_records) ||
    outcome.dataset_records < 2 * outcome.emitted_parent_groups ||
    !SHA256_RE.test(outcome.generation_run_fingerprint)
  ) {
    throw new Error("fresh-selection generator completion is incomplete");
  }
  return Object.freeze({
    input_games: FRESH_SELECTION_TEACHER_GAME_COUNT,
    input_parents: FRESH_SELECTION_TEACHER_PARENT_COUNT,
    completed_parents: FRESH_SELECTION_TEACHER_PARENT_COUNT,
    forced_parents_skipped: forced,
    forced_skip_reasons: Object.freeze({
      fewer_than_two_legal_moves: forcedMove,
      search_timeout_no_label: timeout,
    }),
    parent_accounting: Object.freeze({ ...accounting }),
    emitted_parent_groups: outcome.emitted_parent_groups,
    dataset_records: outcome.dataset_records,
    sealed: true,
  });
}

function buildRunFingerprint(
  revision: string,
  preflight: Readonly<FreshSelectionTeacherCheckpointPreflight>,
  policy: Readonly<SearchPolicySnapshot>,
  outcome: Readonly<FreshSelectionTeacherGeneratorOutcome>,
  assetReceipt: AssetReceipt,
): string {
  return sha256(
    canonicalJson({
      schema: "shogi-floodgate-strength-first-selection-teacher-run-fingerprint-v1",
      runner_revision: revision,
      source: FRESH_SELECTION_TEACHER_SOURCE,
      checkpoint_preflight_sha256: preflight.checkpoint_preflight_sha256,
      search_policy: policy.identity,
      generation_run_fingerprint: outcome.generation_run_fingerprint,
      engine_asset_receipt: assetReceipt,
    }),
  );
}

async function verifyExistingResult(
  paths: Readonly<FreshSelectionTeacherPaths>,
  effectiveUserId: number,
): Promise<FreshSelectionTeacherRunReceipt | null> {
  try {
    const raw = await fs.promises.readFile(paths.result);
    const result = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
    const completion = result.completion as Record<string, unknown>;
    if (
      result.schema !== FRESH_SELECTION_TEACHER_RESULT_SCHEMA ||
      result.status !== FRESH_SELECTION_TEACHER_STATUS ||
      result.role !== "fresh_selection" ||
      result.postflight_complete !== true ||
      completion.completed_parents !== FRESH_SELECTION_TEACHER_PARENT_COUNT
    ) {
      throw new Error("existing fresh-selection result is not complete");
    }
    await Promise.all([
      digestPrivateFile(
        paths.authority,
        paths.outputRoot,
        effectiveUserId,
        FRESH_SELECTION_TEACHER_AUTHORITY_SCHEMA,
      ),
      digestPrivateFile(
        paths.manifest,
        paths.outputRoot,
        effectiveUserId,
        FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
      ),
      digestPrivateFile(
        paths.result,
        paths.outputRoot,
        effectiveUserId,
        FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
      ),
      digestPrivateFile(
        paths.dataset,
        paths.outputRoot,
        effectiveUserId,
        FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
      ),
      digestPrivateFile(
        paths.work,
        paths.outputRoot,
        effectiveUserId,
        SIBLING_TEACHER_WORK_SCHEMA,
      ),
    ]);
    return {
      schema: FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      idempotent_existing_result: true,
      completed_parents: FRESH_SELECTION_TEACHER_PARENT_COUNT,
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

export async function runFreshSelectionTeacherCore(
  dependencies: Readonly<FreshSelectionTeacherRunnerDependencies>,
): Promise<Readonly<FreshSelectionTeacherRunReceipt>> {
  if (
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0 ||
    !Number.isSafeInteger(dependencies.availableParallelism) ||
    dependencies.availableParallelism < 1
  ) {
    throw new Error("fresh-selection runner requires a local POSIX runtime");
  }
  const paths = freshSelectionTeacherPaths(
    dependencies.homeDirectory(),
    dependencies.repositoryRoot,
  );
  await ensurePrivateDirectory(paths.outputRoot, dependencies.effectiveUserId);
  const releaseFormalTeacherExclusion =
    await dependencies.acquireFormalTeacherExclusion();
  try {
    const revision = await dependencies.captureExactCleanRevision(paths.repositoryRoot);
    if (!REVISION_RE.test(revision)) {
      throw new Error("fresh-selection runner revision is invalid");
    }

    // This is deliberately the first operation that can touch candidate models.
    const beforePreflight = validatePreflight(
      await dependencies.checkpointPreflight(paths.repositoryRoot),
    );
    dependencies.reportProgress("checkpoint-preflight-before-complete");

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
      beforeSource.rows.length !== FRESH_SELECTION_TEACHER_PARENT_COUNT ||
      !sameJson(beforeSource.identity, FRESH_SELECTION_TEACHER_SOURCE)
    ) {
      throw new Error("fresh-selection source identity is invalid");
    }
    dependencies.reportProgress("source-assets-policy-before-complete");

    const existing = await verifyExistingResult(
      paths,
      dependencies.effectiveUserId,
    );
    if (existing) {
      const [afterPreflight, afterAssets, afterPolicy, afterSource] =
        await Promise.all([
          dependencies.checkpointPreflight(paths.repositoryRoot),
          dependencies.verifyAssets(),
          dependencies.readSearchPolicy(
            paths.searchPolicy,
            paths.repositoryRoot,
            revision,
          ),
          dependencies.readSource(paths.source),
        ]);
      if (
        !sameJson(beforePreflight, validatePreflight(afterPreflight)) ||
        !sameJson(beforeAssets, afterAssets) ||
        !sameJson(beforePolicy, afterPolicy) ||
        !sameJson(beforeSource.identity, afterSource.identity)
      ) {
        throw new Error("fresh-selection existing-result postflight drifted");
      }
      return Object.freeze({
        ...existing,
        parallel_engines: searchPolicy.runtime.parallel_engines,
      });
    }

    const outcome = await dependencies.generate({
      rows: beforeSource.rows,
      source: FRESH_SELECTION_TEACHER_SOURCE,
      outputRoot: paths.outputRoot,
      datasetPath: paths.dataset,
      workPath: paths.work,
      runnerRevision: revision,
      engineBin: paths.engineBin,
      engineReceipt: paths.engineReceipt,
      evalDir: paths.evalDir,
      searchPolicy,
      searchPolicyIdentity: beforePolicy.identity,
      checkpointPreflightSha256: beforePreflight.checkpoint_preflight_sha256,
    });
    const completion = completionFromOutcome(outcome);
    dependencies.reportProgress("teacher-generation-complete");

    const [afterPreflight, afterAssets, afterPolicy, afterSource] =
      await Promise.all([
        dependencies.checkpointPreflight(paths.repositoryRoot),
        dependencies.verifyAssets(),
        dependencies.readSearchPolicy(paths.searchPolicy, paths.repositoryRoot, revision),
        dependencies.readSource(paths.source),
      ]);
    if (
      !sameJson(beforePreflight, validatePreflight(afterPreflight)) ||
      !sameJson(beforeAssets, afterAssets) ||
      !sameJson(beforePolicy, afterPolicy) ||
      !sameJson(beforeSource.identity, afterSource.identity)
    ) {
      throw new Error("fresh-selection postflight evidence drifted");
    }
    const dataset = await digestPrivateFile(
      paths.dataset,
      paths.outputRoot,
      dependencies.effectiveUserId,
      FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
    );
    const work = await digestPrivateFile(
      paths.work,
      paths.outputRoot,
      dependencies.effectiveUserId,
      SIBLING_TEACHER_WORK_SCHEMA,
    );
    if (
      work.bytes !== outcome.work.bytes ||
      work.sha256 !== outcome.work.sha256 ||
      outcome.work.records !== FRESH_SELECTION_TEACHER_PARENT_COUNT + 1
    ) {
      throw new Error("fresh-selection work identity drifted after generation");
    }
    const runFingerprint = buildRunFingerprint(
      revision,
      beforePreflight,
      beforePolicy,
      outcome,
      beforeAssets,
    );
    const manifest = {
      schema: FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      role: "fresh_selection",
      source: FRESH_SELECTION_TEACHER_SOURCE,
      dataset,
      work,
      completion,
      run_fingerprint: runFingerprint,
      boundary: FRESH_SELECTION_TEACHER_BOUNDARY,
    };
    const manifestBytes = jsonBytes(manifest);
    const manifestIdentity = identityForBytes(
      paths.manifest,
      manifestBytes,
      FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
    );
    const result = {
      schema: FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      role: "fresh_selection",
      manifest: manifestIdentity,
      dataset,
      work,
      completion,
      run_fingerprint: runFingerprint,
      postflight_complete: true,
      boundary: FRESH_SELECTION_TEACHER_BOUNDARY,
    };
    const resultBytes = jsonBytes(result);
    const resultIdentity = identityForBytes(
      paths.result,
      resultBytes,
      FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
    );
    const authority = {
      schema: FRESH_SELECTION_TEACHER_AUTHORITY_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      role: "fresh_selection",
      source: FRESH_SELECTION_TEACHER_SOURCE,
      training_plan: beforePreflight.training_plan,
      selection_preflight_registry:
        beforePreflight.selection_preflight_registry,
      checkpoint_preflight_sha256:
        beforePreflight.checkpoint_preflight_sha256,
      artifacts: {
        manifest: manifestIdentity,
        result: resultIdentity,
        dataset,
        work,
      },
      completion,
      run_fingerprint: runFingerprint,
      boundary: FRESH_SELECTION_TEACHER_BOUNDARY,
    };
    await commitPrivateBytes(paths.manifest, manifestBytes);
    await commitPrivateBytes(paths.authority, jsonBytes(authority));
    // result.json is the sole completion marker and is always committed last.
    await commitPrivateBytes(paths.result, resultBytes);
    dependencies.reportProgress("result-committed-last");
    return Object.freeze({
      schema: FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
      status: FRESH_SELECTION_TEACHER_STATUS,
      idempotent_existing_result: false,
      completed_parents: FRESH_SELECTION_TEACHER_PARENT_COUNT,
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
): Promise<Readonly<FreshSelectionTeacherSourceSnapshot>> {
  const bytes = await fs.promises.readFile(file);
  const identity: FloodgateRoleBundleRawIdentity = {
    ...FRESH_SELECTION_TEACHER_SOURCE,
    path: "fresh-selection.raw.jsonl",
  };
  const rows = parseAuthenticatedFloodgateFreshSelectionRows(bytes, identity);
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    rows,
    identity: FRESH_SELECTION_TEACHER_SOURCE,
  });
}

async function readSearchPolicy(
  file: string,
  repositoryRoot: string,
  revision: string,
): Promise<Readonly<SearchPolicySnapshot>> {
  const verified = await captureFloodgateGitExactCleanRevision(repositoryRoot);
  if (verified !== revision) {
    throw new Error("fresh-selection search-policy revision changed");
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
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `checkpoint preflight failed: ${Buffer.concat(stderr).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")) as unknown);
      } catch {
        reject(new Error("checkpoint preflight returned invalid JSON"));
      }
    });
  });
}

async function checkpointPreflight(
  repositoryRoot: string,
): Promise<Readonly<FreshSelectionTeacherCheckpointPreflight>> {
  const executable = await resolveFloodgateStrengthFirstTrainingPython(
    os.homedir(),
  );
  return (await subprocessJson(
    executable,
    [path.join(repositoryRoot, "ml", "run_strength_first_selection_teacher_preflight.py")],
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
  )) as Readonly<FreshSelectionTeacherCheckpointPreflight>;
}

async function generateFreshSelectionTeacher(
  request: Readonly<FreshSelectionTeacherGeneratorRequest>,
): Promise<Readonly<FreshSelectionTeacherGeneratorOutcome>> {
  assertFreshSelectionTeacherGeneratorOutputPathsCoreForTests(
    request.outputRoot,
    request.datasetPath,
    request.workPath,
  );
  const source: FloodgateFreshSelectionRawIdentity = Object.freeze({
    ...request.source,
    path: "fresh-selection.raw.jsonl",
  });
  return generateFreshSelectionSiblingTeacherDataset(
    Object.freeze({
      schema: FRESH_SELECTION_TEACHER_INPUT_SCHEMA,
      role: "fresh_selection",
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

export function assertFreshSelectionTeacherGeneratorOutputPathsCoreForTests(
  outputRoot: string,
  datasetPath: string,
  workPath: string,
): void {
  const generatedPaths = siblingTeacherStagePaths(outputRoot);
  if (
    generatedPaths.selection !== path.resolve(datasetPath) ||
    generatedPaths.work !== path.resolve(workPath)
  ) {
    throw new Error("fresh-selection generator output paths drifted");
  }
}

async function releaseFormalTeacherLocks(
  releases: readonly (() => Promise<void>)[],
): Promise<void> {
  const failures: Error[] = [];
  for (const release of [...releases].reverse()) {
    try {
      await release();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "formal teacher lock releases failed");
  }
}

export interface FreshSelectionFormalTeacherLockDependencies {
  readonly prepareDirectory: (
    outputRoot: string,
    effectiveUserId: number,
  ) => Promise<void>;
  readonly acquireLock: (
    outputRoot: string,
    effectiveUserId: number,
  ) => Promise<() => Promise<void>>;
}

export async function acquireFreshSelectionFormalTeacherExclusionCoreForTests(
  home: string,
  repositoryRoot: string,
  uid: number,
  dependencies: Readonly<FreshSelectionFormalTeacherLockDependencies>,
): Promise<() => Promise<void>> {
  const releases: (() => Promise<void>)[] = [];
  try {
    for (const outputRoot of freshSelectionFormalTeacherOutputRoots(
      home,
      repositoryRoot,
    )) {
      await dependencies.prepareDirectory(outputRoot, uid);
      releases.push(
        await dependencies.acquireLock(outputRoot, uid),
      );
    }
  } catch (error) {
    try {
      await releaseFormalTeacherLocks(releases);
    } catch (releaseError) {
      throw new AggregateError(
        [
          error instanceof Error ? error : new Error(String(error)),
          releaseError,
        ],
        "formal teacher exclusion acquisition and cleanup failed",
      );
    }
    throw error;
  }
  let released = false;
  return async () => {
    if (released) {
      throw new Error("formal teacher exclusion was already released");
    }
    released = true;
    await releaseFormalTeacherLocks(releases);
  };
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
    throw new Error("fresh-selection teacher requires process.geteuid()");
  }
  return process.geteuid();
}

const PRODUCTION_DEPENDENCIES: FreshSelectionTeacherRunnerDependencies =
  Object.freeze({
    homeDirectory: () => os.homedir(),
    repositoryRoot: path.resolve(__dirname, ".."),
    effectiveUserId: effectiveUserId(),
    availableParallelism: os.availableParallelism(),
    acquireFormalTeacherExclusion,
    captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
    checkpointPreflight,
    verifyAssets: verifyPinnedFloodgateStrengthFirstV8TeacherAuthority,
    readSearchPolicy,
    readSource,
    generate: generateFreshSelectionTeacher,
    reportProgress: (phase: string) => {
      process.stderr.write(
        `${JSON.stringify({
          schema: "shogi-floodgate-strength-first-selection-teacher-progress-v1",
          phase,
        })}\n`,
      );
    },
  });

/** Execute the fixed, argumentless current-user local runner. */
export function runFreshSelectionTeacher(): Promise<
  Readonly<FreshSelectionTeacherRunReceipt>
> {
  return runFreshSelectionTeacherCore(PRODUCTION_DEPENDENCIES);
}
