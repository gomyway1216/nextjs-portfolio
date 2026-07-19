/**
 * Local strength-first Floodgate teacher runner.
 *
 * The same authenticated 24,000-parent input and private stage advance through
 * 100, 500, and 24,000 parents. Stable assets are verified but never executed.
 * result.json is the only public completion marker and is committed only after
 * the exact consumer postflight receipt is claimed.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
  advanceStrengthFirstSiblingTeacherDataset,
  siblingTeacherStagePaths,
  type StrengthFirstSiblingTeacherAdvance,
  type StrengthFirstSiblingTeacherOptions,
} from "./generate-sibling-teacher";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
  verifyPinnedFloodgateProductionTeacherAssets,
  type FloodgateProductionTeacherAssetAuthorityReceipt,
} from "./floodgate-production-teacher-asset-authority";
import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";
import {
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  claimActiveVerifiedPinnedFloodgateTrainingRows,
  claimVerifiedFloodgateTrainingConsumerPostflight,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingRowConsumerOptions,
} from "./floodgate-training-row-consumer";

export const FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA =
  "shogi-floodgate-strength-first-teacher-runner-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA =
  "shogi-floodgate-strength-first-teacher-milestone-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA =
  "shogi-floodgate-strength-first-teacher-postflight-result-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA =
  "shogi-floodgate-strength-first-teacher-public-receipt-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION =
  "v22.13.0" as const;
export const FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION =
  "e8a9197608cb48b1160b6707d97b0c4f78f90a1d" as const;
export const FLOODGATE_STRENGTH_FIRST_TEACHER_OUTPUT_DIRECTORY =
  "floodgate-q1-2026-strength-first-v6" as const;
export const FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME =
  ".strength-first-teacher.lock" as const;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_RESULT_JSON_BYTES = 16 * 1024 * 1024;

type AssetReceipt = Readonly<
  FloodgateProductionTeacherAssetAuthorityReceipt<"production-fixed-registry-and-deployment-root">
>;
type FinalOutcome = Extract<
  StrengthFirstSiblingTeacherAdvance,
  { readonly target_parents: 24_000 }
>;
type PrefixOutcome = Extract<
  StrengthFirstSiblingTeacherAdvance,
  { readonly target_parents: 100 | 500 }
>;
type RunLockRelease = () => Promise<void>;

export interface FloodgateStrengthFirstTeacherPaths {
  readonly home: string;
  readonly runnerRepositoryRoot: string;
  readonly verifierRepositoryRoot: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly roleBundleRoot: string;
  readonly legacyProtectedPositionIdsPath: string;
  readonly assetRoot: string;
  readonly engineBin: string;
  readonly engineReceipt: string;
  readonly evalDir: string;
  readonly runsRoot: string;
  readonly outputRoot: string;
  readonly stageRoot: string;
  readonly milestone100: string;
  readonly milestone500: string;
  readonly result: string;
}

export interface FloodgateStrengthFirstTeacherFileBinding {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateStrengthFirstTeacherResultMarker {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA;
  readonly status: "complete-training-only-postflight-bound";
  readonly claim_boundary: "postflight-input-and-staged-output-integrity-not-playing-strength-evidence";
  readonly runner: Readonly<{
    readonly schema: typeof FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA;
    readonly revision: string;
    readonly node: typeof FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION;
    readonly platform: "darwin";
    readonly architecture: "arm64";
    readonly local_only: true;
    readonly network_requests: 0;
    readonly cloud_services: readonly [];
    readonly live_weight_changes: 0;
  }>;
  readonly production_asset_preflight: AssetReceipt;
  readonly authenticated_input: Readonly<
    FloodgateTrainingConsumerPostflightReceipt["input"]
  >;
  readonly consumer_postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>;
  readonly teacher: Readonly<{
    readonly engine: "YaneuraOu";
    readonly parallel_engines: 12;
    readonly threads_per_engine: 1;
    readonly proposal: Readonly<{ readonly multipv: 12; readonly depth: 16 }>;
    readonly independent_rescore: Readonly<{
      readonly multipv: 1;
      readonly searchmoves: "exactly-one-candidate";
      readonly depth: 16;
    }>;
    readonly hash_mb_per_engine: 64;
    readonly timeout_ms_per_search: 600_000;
    readonly engine_environment: typeof SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT;
    readonly stable_assets_verified: true;
    readonly stable_engine_or_policy_executions: 0;
  }>;
  readonly milestones: Readonly<{
    readonly targets: readonly [100, 500, 24_000];
    readonly prefix_100: FloodgateStrengthFirstTeacherFileBinding;
    readonly prefix_500: FloodgateStrengthFirstTeacherFileBinding;
  }>;
  readonly completion: Readonly<{
    readonly input_parents: 24_000;
    readonly completed_parents: 24_000;
    readonly forced_parents_skipped: number;
    readonly emitted_parent_groups: number;
    readonly run_fingerprint: string;
  }>;
  readonly staged_outputs: Readonly<{
    readonly work: FloodgateStrengthFirstTeacherFileBinding;
    readonly train: FloodgateStrengthFirstTeacherFileBinding;
    readonly parent_completion: FloodgateStrengthFirstTeacherFileBinding;
    readonly manifest: FloodgateStrengthFirstTeacherFileBinding;
    readonly staged_result: FloodgateStrengthFirstTeacherFileBinding;
  }>;
  readonly publication: Readonly<{
    readonly stage_root_private_0700: true;
    readonly stage_files_private_0600: true;
    readonly staged_inside_single_authenticated_callback: true;
    readonly postflight_exact_receipt_claimed_before_result_commit: true;
    readonly result_file_sync_before_rename: true;
    readonly result_same_directory_rename: true;
    readonly result_directory_sync_after_rename: true;
  }>;
}

export interface FloodgateStrengthFirstTeacherPublicReceipt {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA;
  readonly status: "complete-training-only-postflight-bound";
  readonly idempotent_existing_result: boolean;
  readonly result_path: string;
  readonly result_file: FloodgateStrengthFirstTeacherFileBinding;
  readonly result: Readonly<FloodgateStrengthFirstTeacherResultMarker>;
}

export type FloodgateStrengthFirstTeacherProgressEvent =
  | Readonly<{ readonly phase: "asset-preflight-complete" }>
  | Readonly<{
      readonly phase: "runner-revision-verified";
      readonly revision: string;
    }>
  | Readonly<{ readonly phase: "existing-result-verified" }>
  | Readonly<{ readonly phase: "input-authentication-started" }>
  | Readonly<{
      readonly phase: "milestone-complete";
      readonly target_parents: 100 | 500;
    }>
  | Readonly<{
      readonly phase: "teacher-stage-complete";
      readonly target_parents: 24_000;
    }>
  | Readonly<{ readonly phase: "consumer-postflight-claimed" }>
  | Readonly<{ readonly phase: "result-committed" }>;

interface ReadPrivateJsonResult {
  readonly value: unknown;
  readonly binding: FloodgateStrengthFirstTeacherFileBinding;
}

type ConsumeTrainingRows = (
  options: FloodgateTrainingRowConsumerOptions,
  consume: (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
  ) => Promise<void>,
) => Promise<Readonly<FloodgateTrainingConsumerPostflightReceipt>>;

export interface FloodgateStrengthFirstTeacherRunnerDependencies {
  readonly homeDirectory: () => string;
  readonly runnerRepositoryRoot: string;
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly effectiveUserId: number;
  readonly setUmask: (mode: number) => number;
  readonly ensurePrivateDirectory: (
    directory: string,
    effectiveUserId: number,
  ) => Promise<void>;
  readonly acquireRunLock: (
    outputRoot: string,
    effectiveUserId: number,
  ) => Promise<RunLockRelease>;
  readonly verifyProductionAssets: () => Promise<AssetReceipt>;
  readonly captureExactCleanRevision: (
    repositoryRoot: string,
  ) => Promise<string>;
  readonly consumeTrainingRows: ConsumeTrainingRows;
  readonly claimTrainingInput: (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
  ) => void;
  readonly claimPostflight: (
    receipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  ) => void;
  readonly advanceTeacher: (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
    options: StrengthFirstSiblingTeacherOptions,
  ) => Promise<StrengthFirstSiblingTeacherAdvance>;
  readonly readPrivateJson: (
    filePath: string,
    root: string,
    effectiveUserId: number,
  ) => Promise<ReadPrivateJsonResult | null>;
  readonly digestPrivateFile: (
    filePath: string,
    root: string,
    effectiveUserId: number,
  ) => Promise<FloodgateStrengthFirstTeacherFileBinding>;
  readonly commitPrivateJson: (
    filePath: string,
    root: string,
    effectiveUserId: number,
    value: unknown,
  ) => Promise<FloodgateStrengthFirstTeacherFileBinding>;
  readonly reportProgress: (
    event: FloodgateStrengthFirstTeacherProgressEvent,
  ) => void;
}

function absolute(value: string, name: string): string {
  if (!value || value.includes("\0") || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return path.resolve(value);
}

export function floodgateStrengthFirstTeacherPaths(
  homeInput: string,
  repositoryInput: string,
): Readonly<FloodgateStrengthFirstTeacherPaths> {
  const home = absolute(homeInput, "home");
  const runnerRepositoryRoot = absolute(repositoryInput, "repository");
  const verifierRepositoryRoot = path.join(
    home,
    ".codex",
    "worktrees",
    "shogi-floodgate-role-bundle",
  );
  const assetRoot = path.join(
    home,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  const runsRoot = path.join(home, ".codex", "shogi-runs");
  const outputRoot = path.join(
    runsRoot,
    FLOODGATE_STRENGTH_FIRST_TEACHER_OUTPUT_DIRECTORY,
  );
  const stageRoot = outputRoot;
  return Object.freeze({
    home,
    runnerRepositoryRoot,
    verifierRepositoryRoot,
    rawLockRoot: path.join(
      home,
      ".codex",
      "shogi-data",
      "floodgate-q1-2026-raw-lock",
    ),
    roleLockRoot: path.join(
      home,
      ".codex",
      "shogi-data",
      "floodgate-q1-2026-role-lock-v1",
    ),
    roleBundleRoot: path.join(
      home,
      ".codex",
      "shogi-bundles",
      "floodgate-q1-2026-label-free-role-bundle-v2",
    ),
    legacyProtectedPositionIdsPath: path.join(
      verifierRepositoryRoot,
      "ml",
      "data",
      "wcsc36",
      "int16-aware-replay-excluded-position-ids.txt",
    ),
    assetRoot,
    engineBin: path.join(assetRoot, "engine", "yaneuraou"),
    engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
    evalDir: path.join(assetRoot, "eval"),
    runsRoot,
    outputRoot,
    stageRoot,
    milestone100: path.join(stageRoot, "milestone-100.json"),
    milestone500: path.join(stageRoot, "milestone-500.json"),
    result: path.join(outputRoot, "result.json"),
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertRuntime(
  dependencies: FloodgateStrengthFirstTeacherRunnerDependencies,
): void {
  if (
    dependencies.nodeVersion !== FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION
  ) {
    throw new Error(
      `strength-first teacher requires exact Node ${FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION}`,
    );
  }
  if (
    dependencies.platform !== "darwin" ||
    dependencies.architecture !== "arm64"
  ) {
    throw new Error("strength-first teacher requires darwin arm64");
  }
  if (
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0
  ) {
    throw new Error("strength-first teacher requires a POSIX user ID");
  }
}

function assertAssets(receipt: AssetReceipt): void {
  if (
    receipt.contract !==
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT ||
    receipt.status !== FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS ||
    receipt.execution_boundary !==
      "production-fixed-registry-and-deployment-root" ||
    !sameJson(receipt.runtime, FLOODGATE_PRODUCTION_TEACHER_RUNTIME)
  ) {
    throw new Error("invalid production asset preflight receipt");
  }
}

function assertPostflight(
  receipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
): void {
  if (
    receipt.schema !== FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA ||
    receipt.status !== FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== "production-fixed-pinned-bundle-verifier" ||
    receipt.runtime_claim !==
      FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM ||
    receipt.input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    receipt.input.role !== "training" ||
    receipt.input.binding.verifier_revision !==
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION ||
    receipt.input.binding.records !== 24_000 ||
    receipt.postflight.callback_settled_without_value !== true ||
    receipt.postflight.filesystem_snapshot_revalidated_after_callback !==
      true ||
    receipt.postflight.input_descriptors_closed !== true
  ) {
    throw new Error("invalid training input postflight receipt");
  }
}

function consumerOptions(
  paths: Readonly<FloodgateStrengthFirstTeacherPaths>,
): Readonly<FloodgateTrainingRowConsumerOptions> {
  return Object.freeze({
    repositoryRoot: paths.verifierRepositoryRoot,
    verifierRevision: FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
    rawLockRoot: paths.rawLockRoot,
    roleLockRoot: paths.roleLockRoot,
    legacyProtectedPositionIdsPath: paths.legacyProtectedPositionIdsPath,
    outputRoot: paths.roleBundleRoot,
  });
}

function teacherOptions(
  paths: Readonly<FloodgateStrengthFirstTeacherPaths>,
  runnerRevision: string,
  targetParents: 100 | 500 | 24_000,
): Readonly<StrengthFirstSiblingTeacherOptions> {
  return Object.freeze({
    stageRoot: paths.stageRoot,
    runnerRevision,
    engineBin: paths.engineBin,
    engineArgs: Object.freeze([]),
    engineReceipt: paths.engineReceipt,
    evalDir: paths.evalDir,
    multipv: 12,
    depth: 16,
    fvScale: 20,
    hashMb: 64,
    timeoutMs: 600_000,
    targetParents,
  });
}

function assertPrefix(
  outcome: StrengthFirstSiblingTeacherAdvance,
  target: 100 | 500,
  fingerprint?: string,
): asserts outcome is PrefixOutcome {
  if (
    outcome.status !==
      "local-work-prefix-complete-not-an-authentication-receipt" ||
    outcome.authentication_receipt !== false ||
    outcome.target_parents !== target ||
    outcome.completed_parents !== target ||
    !/^[0-9a-f]{64}$/.test(outcome.run_fingerprint) ||
    (fingerprint !== undefined && outcome.run_fingerprint !== fingerprint) ||
    !isBinding(outcome.work) ||
    outcome.work.path !== "work.jsonl" ||
    outcome.work.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    outcome.work.records !== target + 1 ||
    outcome.work.binding_scope !== "canonical-target-prefix-projection" ||
    !isBinding(outcome.current_work) ||
    outcome.current_work.path !== "work.jsonl" ||
    outcome.current_work.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    !Number.isSafeInteger(outcome.current_work.records) ||
    outcome.current_work.records < target + 1 ||
    outcome.current_work.records > 24_001
  ) {
    throw new Error(`invalid teacher milestone ${target}`);
  }
}

function assertTeacherAssetBindings(
  teacherValue: unknown,
  assets: AssetReceipt,
): void {
  if (!teacherValue || typeof teacherValue !== "object") {
    throw new Error(
      "teacher manifest does not match the production asset preflight",
    );
  }
  const teacher = teacherValue as FinalOutcome["manifest"]["teacher"];
  const receiptFile = teacher.engine_receipt?.file;
  if (!Array.isArray(teacher.eval_files)) {
    throw new Error(
      "teacher manifest does not match the production asset preflight",
    );
  }
  const evalNn = teacher.eval_files.find((file) => file.path === "nn.bin");
  if (
    teacher.engine_bin_bytes !== assets.assets.engine.yaneuraou.bytes ||
    teacher.engine_bin_sha256 !== assets.assets.engine.yaneuraou.sha256 ||
    receiptFile?.bytes !== assets.assets.engine.receipt.bytes ||
    receiptFile.sha256 !== assets.assets.engine.receipt.sha256 ||
    teacher.eval_files.length !== 1 ||
    !evalNn ||
    evalNn.bytes !== assets.assets.eval.nn.bytes ||
    evalNn.sha256 !== assets.assets.eval.nn.sha256 ||
    teacher.eval_sha256 !== assets.assets.eval.tree_sha256
  ) {
    throw new Error(
      "teacher manifest does not match the production asset preflight",
    );
  }
}

function assertFinalArtifactSemantics(
  manifestValue: unknown,
  resultValue: unknown,
  revision: string,
  assets: AssetReceipt,
  inputBinding: Readonly<
    FloodgateTrainingConsumerPostflightReceipt["input"]["binding"]
  >,
  fingerprint: string,
): asserts manifestValue is FinalOutcome["manifest"] {
  if (
    !manifestValue ||
    typeof manifestValue !== "object" ||
    !resultValue ||
    typeof resultValue !== "object"
  ) {
    throw new Error("final teacher artifacts must be JSON objects");
  }
  const manifest = manifestValue as FinalOutcome["manifest"];
  const result = resultValue as FinalOutcome["staged_result"];
  assertTeacherAssetBindings(manifest.teacher, assets);
  if (
    !isBinding(result.work) ||
    !isBinding(result.train) ||
    !isBinding(result.parent_completion) ||
    !isBinding(result.manifest) ||
    manifest.schema !== STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA ||
    manifest.status !== "complete-training-only" ||
    manifest.run_fingerprint !== fingerprint ||
    !/^[0-9a-f]{64}$/.test(fingerprint) ||
    result.runner_revision !== revision ||
    result.schema !== STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA ||
    result.status !== "complete-training-only" ||
    result.run_fingerprint !== fingerprint ||
    result.bundle_verifier_revision !==
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION ||
    result.input_parents !== 24_000 ||
    result.completed_parents !== 24_000 ||
    result.work.path !== "work.jsonl" ||
    result.work.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    result.work.records !== 24_001 ||
    result.train.path !== "train.jsonl" ||
    result.parent_completion.path !== "parent-completion.jsonl" ||
    result.manifest.path !== "manifest.json" ||
    result.manifest.schema !==
      STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA ||
    result.parent_completion.records !== 24_000 ||
    !Number.isSafeInteger(result.forced_parents_skipped) ||
    result.forced_parents_skipped < 0 ||
    !Number.isSafeInteger(result.emitted_parent_groups) ||
    result.emitted_parent_groups < 0 ||
    result.forced_parents_skipped !==
      result.parent_completion.forced_parents_skipped ||
    result.emitted_parent_groups !==
      result.parent_completion.emitted_parent_groups ||
    result.parent_completion.forced_parents_skipped +
      result.parent_completion.emitted_parent_groups !==
      24_000 ||
    result.publication?.consumer_postflight_bound !== false ||
    manifest.pipeline?.source_revision !== revision ||
    manifest.pipeline.tracked_tree_clean !== true ||
    manifest.source?.selected_parents !== 24_000 ||
    manifest.source.raw_sha256 !== inputBinding.raw_sha256 ||
    manifest.source.raw_records !== inputBinding.records ||
    manifest.source.selected_parent_ids_sha256 !==
      inputBinding.parent_ids_sha256 ||
    manifest.authenticated_input?.bundle_verifier_revision !==
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION ||
    !sameJson(manifest.authenticated_input.binding, inputBinding) ||
    !sameJson(
      manifest.teacher.engine_environment,
      SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
    ) ||
    manifest.search?.multipv !== 12 ||
    !sameJson(manifest.search.limit, { depth: 16 }) ||
    manifest.search.parallel_engines !== 12 ||
    manifest.search.hash_mb_per_engine !== 64 ||
    manifest.search.timeout_ms !== 600_000 ||
    result.parent_completion.parent_ids_sha256 !==
      inputBinding.parent_ids_sha256 ||
    !sameJson(manifest.parent_completion, result.parent_completion) ||
    !sameJson(manifest.outputs?.train, result.train) ||
    manifest.publication?.consumer_postflight_bound !== false
  ) {
    throw new Error("invalid final teacher artifact bindings");
  }
}

function assertFinal(
  outcome: StrengthFirstSiblingTeacherAdvance,
  revision: string,
  assets: AssetReceipt,
  postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  fingerprint: string,
): asserts outcome is FinalOutcome {
  if (
    outcome.status !== "complete-training-only" ||
    outcome.target_parents !== 24_000 ||
    outcome.completed_parents !== 24_000 ||
    outcome.run_fingerprint !== fingerprint
  ) {
    throw new Error("invalid final teacher milestone");
  }
  assertFinalArtifactSemantics(
    outcome.manifest,
    outcome.staged_result,
    revision,
    assets,
    postflight.input.binding,
    fingerprint,
  );
}

function milestone(
  target: 100 | 500,
  revision: string,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  progress: PrefixOutcome,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
    status:
      "local-work-prefix-complete-not-an-authentication-or-playing-strength-receipt",
    authentication_receipt: false,
    playing_strength_evidence: false,
    target_parents: target,
    completed_parents: target,
    runner_revision: revision,
    authenticated_input: Object.freeze({
      schema: input.schema,
      role: input.role,
      binding: input.binding,
    }),
    stage: Object.freeze({
      root: ".",
      same_stage_for_all_targets: true,
      automatically_continue_to_next_target: true,
    }),
    progress: Object.freeze({
      status: progress.status,
      authentication_receipt: progress.authentication_receipt,
      target_parents: progress.target_parents,
      completed_parents: progress.completed_parents,
      run_fingerprint: progress.run_fingerprint,
      work: progress.work,
    }),
  });
}

function assertBinding(
  actual: Readonly<FloodgateStrengthFirstTeacherFileBinding>,
  expected: Readonly<{ readonly bytes: number; readonly sha256: string }>,
  name: string,
): void {
  if (
    actual.bytes !== expected.bytes ||
    actual.sha256 !== expected.sha256 ||
    !/^[0-9a-f]{64}$/.test(actual.sha256)
  ) {
    throw new Error(`${name} identity mismatch`);
  }
}

async function collectOutputs(
  dependencies: FloodgateStrengthFirstTeacherRunnerDependencies,
  paths: Readonly<FloodgateStrengthFirstTeacherPaths>,
  outcome: FinalOutcome,
): Promise<FloodgateStrengthFirstTeacherResultMarker["staged_outputs"]> {
  const stage = siblingTeacherStagePaths(paths.stageRoot);
  const [work, train, completion, manifest, stagedResult] = await Promise.all(
    [
      stage.work,
      stage.train,
      stage.parentCompletion,
      stage.manifest,
      stage.stagedResult,
    ].map((file) =>
      dependencies.digestPrivateFile(
        file,
        paths.outputRoot,
        dependencies.effectiveUserId,
      ),
    ),
  );
  assertBinding(work, outcome.staged_result.work, "work");
  assertBinding(train, outcome.staged_result.train, "train");
  assertBinding(
    completion,
    outcome.staged_result.parent_completion,
    "completion",
  );
  assertBinding(manifest, outcome.staged_result.manifest, "manifest");
  const stagedBytes = Buffer.from(
    `${JSON.stringify(outcome.staged_result, null, 2)}\n`,
  );
  assertBinding(
    stagedResult,
    {
      bytes: stagedBytes.byteLength,
      sha256: createHash("sha256").update(stagedBytes).digest("hex"),
    },
    "staged result",
  );
  return Object.freeze({
    work,
    train,
    parent_completion: completion,
    manifest,
    staged_result: stagedResult,
  });
}

function buildResult(
  revision: string,
  assets: AssetReceipt,
  postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  outcome: FinalOutcome,
  prefix100: FloodgateStrengthFirstTeacherFileBinding,
  prefix500: FloodgateStrengthFirstTeacherFileBinding,
  outputs: FloodgateStrengthFirstTeacherResultMarker["staged_outputs"],
): Readonly<FloodgateStrengthFirstTeacherResultMarker> {
  return Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
    status: "complete-training-only-postflight-bound",
    claim_boundary:
      "postflight-input-and-staged-output-integrity-not-playing-strength-evidence",
    runner: Object.freeze({
      schema: FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA,
      revision,
      node: FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION,
      platform: "darwin",
      architecture: "arm64",
      local_only: true,
      network_requests: 0,
      cloud_services: Object.freeze([]) as readonly [],
      live_weight_changes: 0,
    }),
    production_asset_preflight: assets,
    authenticated_input: postflight.input,
    consumer_postflight: postflight,
    teacher: Object.freeze({
      engine: "YaneuraOu",
      parallel_engines: 12,
      threads_per_engine: 1,
      proposal: Object.freeze({ multipv: 12, depth: 16 }),
      independent_rescore: Object.freeze({
        multipv: 1,
        searchmoves: "exactly-one-candidate",
        depth: 16,
      }),
      hash_mb_per_engine: 64,
      timeout_ms_per_search: 600_000,
      engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
      stable_assets_verified: true,
      stable_engine_or_policy_executions: 0,
    }),
    milestones: Object.freeze({
      targets: Object.freeze([100, 500, 24_000] as const),
      prefix_100: prefix100,
      prefix_500: prefix500,
    }),
    completion: Object.freeze({
      input_parents: 24_000,
      completed_parents: 24_000,
      forced_parents_skipped: outcome.staged_result.forced_parents_skipped,
      emitted_parent_groups: outcome.staged_result.emitted_parent_groups,
      run_fingerprint: outcome.run_fingerprint,
    }),
    staged_outputs: outputs,
    publication: Object.freeze({
      stage_root_private_0700: true,
      stage_files_private_0600: true,
      staged_inside_single_authenticated_callback: true,
      postflight_exact_receipt_claimed_before_result_commit: true,
      result_file_sync_before_rename: true,
      result_same_directory_rename: true,
      result_directory_sync_after_rename: true,
    }),
  });
}

function isBinding(
  value: unknown,
): value is FloodgateStrengthFirstTeacherFileBinding {
  const binding = value as Partial<FloodgateStrengthFirstTeacherFileBinding>;
  return (
    !!binding &&
    typeof binding.path === "string" &&
    Number.isSafeInteger(binding.bytes) &&
    (binding.bytes as number) >= 0 &&
    typeof binding.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(binding.sha256)
  );
}

function assertExistingArtifactContents(
  marker: Readonly<FloodgateStrengthFirstTeacherResultMarker>,
  manifestValue: unknown,
  stagedResultValue: unknown,
  revision: string,
  assets: AssetReceipt,
): void {
  try {
    assertFinalArtifactSemantics(
      manifestValue,
      stagedResultValue,
      revision,
      assets,
      marker.authenticated_input.binding,
      marker.completion.run_fingerprint,
    );
  } catch (error) {
    throw new Error(
      `bound manifest or staged result failed semantic validation: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const manifest = manifestValue as FinalOutcome["manifest"];
  const staged = stagedResultValue as FinalOutcome["staged_result"];
  if (
    manifest.parent_completion.forced_parents_skipped !==
      marker.completion.forced_parents_skipped ||
    manifest.parent_completion.emitted_parent_groups !==
      marker.completion.emitted_parent_groups ||
    staged.forced_parents_skipped !==
      marker.completion.forced_parents_skipped ||
    staged.emitted_parent_groups !== marker.completion.emitted_parent_groups
  ) {
    throw new Error(
      "bound manifest or staged result does not match the completion marker",
    );
  }
  assertBinding(marker.staged_outputs.work, staged.work, "staged work");
  assertBinding(marker.staged_outputs.train, staged.train, "staged train");
  assertBinding(
    marker.staged_outputs.parent_completion,
    staged.parent_completion,
    "staged completion",
  );
  assertBinding(
    marker.staged_outputs.manifest,
    staged.manifest,
    "staged manifest",
  );
  assertBinding(
    marker.staged_outputs.train,
    manifest.outputs.train,
    "manifest train",
  );
  assertBinding(
    marker.staged_outputs.parent_completion,
    manifest.parent_completion,
    "manifest completion",
  );
}

async function validateExistingResult(
  dependencies: FloodgateStrengthFirstTeacherRunnerDependencies,
  paths: Readonly<FloodgateStrengthFirstTeacherPaths>,
  revision: string,
  assets: AssetReceipt,
  stored: ReadPrivateJsonResult,
): Promise<Readonly<FloodgateStrengthFirstTeacherResultMarker>> {
  const marker =
    stored.value as Partial<FloodgateStrengthFirstTeacherResultMarker>;
  const runner = marker.runner;
  const teacher = marker.teacher;
  const milestones = marker.milestones;
  const completion = marker.completion;
  const outputs = marker.staged_outputs;
  const publication = marker.publication;
  if (!marker.consumer_postflight) {
    throw new Error("existing result has no postflight receipt");
  }
  assertPostflight(marker.consumer_postflight);
  if (
    marker.schema !== FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA ||
    marker.status !== "complete-training-only-postflight-bound" ||
    marker.claim_boundary !==
      "postflight-input-and-staged-output-integrity-not-playing-strength-evidence" ||
    runner?.schema !== FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA ||
    runner?.revision !== revision ||
    runner.node !== FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION ||
    runner.platform !== "darwin" ||
    runner.architecture !== "arm64" ||
    runner.local_only !== true ||
    runner.network_requests !== 0 ||
    !sameJson(runner.cloud_services, []) ||
    runner.live_weight_changes !== 0 ||
    !sameJson(marker.production_asset_preflight, assets) ||
    !sameJson(marker.authenticated_input, marker.consumer_postflight.input) ||
    teacher?.engine !== "YaneuraOu" ||
    teacher?.parallel_engines !== 12 ||
    teacher.threads_per_engine !== 1 ||
    !sameJson(teacher.proposal, { multipv: 12, depth: 16 }) ||
    !sameJson(teacher.independent_rescore, {
      multipv: 1,
      searchmoves: "exactly-one-candidate",
      depth: 16,
    }) ||
    teacher.hash_mb_per_engine !== 64 ||
    teacher.timeout_ms_per_search !== 600_000 ||
    !sameJson(
      teacher.engine_environment,
      SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
    ) ||
    teacher.stable_assets_verified !== true ||
    teacher.stable_engine_or_policy_executions !== 0 ||
    !sameJson(milestones?.targets, [100, 500, 24_000]) ||
    completion?.input_parents !== 24_000 ||
    completion.completed_parents !== 24_000 ||
    !Number.isSafeInteger(completion.forced_parents_skipped) ||
    !Number.isSafeInteger(completion.emitted_parent_groups) ||
    completion.forced_parents_skipped < 0 ||
    completion.emitted_parent_groups < 0 ||
    completion.forced_parents_skipped + completion.emitted_parent_groups !==
      24_000 ||
    !/^[0-9a-f]{64}$/.test(completion.run_fingerprint) ||
    publication?.stage_root_private_0700 !== true ||
    publication.stage_files_private_0600 !== true ||
    publication.staged_inside_single_authenticated_callback !== true ||
    publication?.postflight_exact_receipt_claimed_before_result_commit !==
      true ||
    publication.result_file_sync_before_rename !== true ||
    publication.result_same_directory_rename !== true ||
    publication.result_directory_sync_after_rename !== true ||
    !milestones ||
    !outputs ||
    !isBinding(milestones.prefix_100) ||
    !isBinding(milestones.prefix_500) ||
    !isBinding(outputs.work) ||
    !isBinding(outputs.train) ||
    !isBinding(outputs.parent_completion) ||
    !isBinding(outputs.manifest) ||
    !isBinding(outputs.staged_result)
  ) {
    throw new Error("existing result marker does not match the fixed run");
  }
  const stage = siblingTeacherStagePaths(paths.stageRoot);
  const expected = [
    [paths.milestone100, milestones.prefix_100],
    [paths.milestone500, milestones.prefix_500],
    [stage.work, outputs.work],
    [stage.train, outputs.train],
    [stage.parentCompletion, outputs.parent_completion],
  ] as const;
  const [actual, storedManifest, storedStagedResult] = await Promise.all([
    Promise.all(
      expected.map(([file]) =>
        dependencies.digestPrivateFile(
          file,
          paths.outputRoot,
          dependencies.effectiveUserId,
        ),
      ),
    ),
    dependencies.readPrivateJson(
      stage.manifest,
      paths.outputRoot,
      dependencies.effectiveUserId,
    ),
    dependencies.readPrivateJson(
      stage.stagedResult,
      paths.outputRoot,
      dependencies.effectiveUserId,
    ),
  ]);
  if (!storedManifest || !storedStagedResult) {
    throw new Error("existing result is missing bound JSON artifacts");
  }
  const jsonExpected = [
    [stage.manifest, outputs.manifest, storedManifest.binding],
    [stage.stagedResult, outputs.staged_result, storedStagedResult.binding],
  ] as const;
  expected.forEach(([file, binding], index) => {
    const relative = path
      .relative(paths.outputRoot, file)
      .split(path.sep)
      .join("/");
    if (binding.path !== relative) {
      throw new Error("existing result contains an unexpected artifact path");
    }
    assertBinding(actual[index], binding, relative);
  });
  jsonExpected.forEach(([file, binding, actualBinding]) => {
    const relative = path
      .relative(paths.outputRoot, file)
      .split(path.sep)
      .join("/");
    if (binding.path !== relative) {
      throw new Error("existing result contains an unexpected JSON path");
    }
    assertBinding(actualBinding, binding, relative);
  });
  assertExistingArtifactContents(
    marker as Readonly<FloodgateStrengthFirstTeacherResultMarker>,
    storedManifest.value,
    storedStagedResult.value,
    revision,
    assets,
  );
  return stored.value as Readonly<FloodgateStrengthFirstTeacherResultMarker>;
}

export async function runFloodgateStrengthFirstTeacherCore(
  dependencies: FloodgateStrengthFirstTeacherRunnerDependencies,
): Promise<Readonly<FloodgateStrengthFirstTeacherPublicReceipt>> {
  assertRuntime(dependencies);
  const previousUmask = dependencies.setUmask(0o077);
  let releaseRunLock: RunLockRelease | undefined;
  try {
    const paths = floodgateStrengthFirstTeacherPaths(
      dependencies.homeDirectory(),
      dependencies.runnerRepositoryRoot,
    );
    for (const directory of [paths.runsRoot, paths.outputRoot]) {
      await dependencies.ensurePrivateDirectory(
        directory,
        dependencies.effectiveUserId,
      );
    }
    releaseRunLock = await dependencies.acquireRunLock(
      paths.outputRoot,
      dependencies.effectiveUserId,
    );

    const assets = await dependencies.verifyProductionAssets();
    assertAssets(assets);
    dependencies.reportProgress({ phase: "asset-preflight-complete" });
    const revision = await dependencies.captureExactCleanRevision(
      paths.runnerRepositoryRoot,
    );
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      throw new Error("runner revision is not a full Git object ID");
    }
    dependencies.reportProgress({
      phase: "runner-revision-verified",
      revision,
    });

    const existing = await dependencies.readPrivateJson(
      paths.result,
      paths.outputRoot,
      dependencies.effectiveUserId,
    );
    if (existing) {
      const result = await validateExistingResult(
        dependencies,
        paths,
        revision,
        assets,
        existing,
      );
      dependencies.reportProgress({ phase: "existing-result-verified" });
      return Object.freeze({
        schema: FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA,
        status: "complete-training-only-postflight-bound",
        idempotent_existing_result: true,
        result_path: paths.result,
        result_file: existing.binding,
        result,
      });
    }

    let callbacks = 0;
    let prefix100: FloodgateStrengthFirstTeacherFileBinding | undefined;
    let prefix500: FloodgateStrengthFirstTeacherFileBinding | undefined;
    let complete: FinalOutcome | undefined;
    let fingerprint: string | undefined;
    dependencies.reportProgress({ phase: "input-authentication-started" });
    const postflight = await dependencies.consumeTrainingRows(
      consumerOptions(paths),
      (input) => {
        callbacks += 1;
        if (callbacks !== 1) {
          throw new Error("training consumer invoked the callback twice");
        }
        dependencies.claimTrainingInput(input);
        return (async (): Promise<void> => {
          const first = await dependencies.advanceTeacher(
            input,
            teacherOptions(paths, revision, 100),
          );
          assertPrefix(first, 100);
          fingerprint = first.run_fingerprint;
          prefix100 = await dependencies.commitPrivateJson(
            paths.milestone100,
            paths.outputRoot,
            dependencies.effectiveUserId,
            milestone(100, revision, input, first),
          );
          dependencies.reportProgress({
            phase: "milestone-complete",
            target_parents: 100,
          });

          const second = await dependencies.advanceTeacher(
            input,
            teacherOptions(paths, revision, 500),
          );
          assertPrefix(second, 500, fingerprint);
          prefix500 = await dependencies.commitPrivateJson(
            paths.milestone500,
            paths.outputRoot,
            dependencies.effectiveUserId,
            milestone(500, revision, input, second),
          );
          dependencies.reportProgress({
            phase: "milestone-complete",
            target_parents: 500,
          });

          const final = await dependencies.advanceTeacher(
            input,
            teacherOptions(paths, revision, 24_000),
          );
          if (
            final.status !== "complete-training-only" ||
            final.target_parents !== 24_000
          ) {
            throw new Error("teacher target 24000 did not finalize");
          }
          complete = final;
          dependencies.reportProgress({
            phase: "teacher-stage-complete",
            target_parents: 24_000,
          });
        })();
      },
    );
    if (
      callbacks !== 1 ||
      !prefix100 ||
      !prefix500 ||
      !complete ||
      !fingerprint
    ) {
      throw new Error("not every strength-first milestone completed");
    }
    assertPostflight(postflight);
    assertFinal(complete, revision, assets, postflight, fingerprint);
    dependencies.claimPostflight(postflight);
    dependencies.reportProgress({ phase: "consumer-postflight-claimed" });

    const outputs = await collectOutputs(dependencies, paths, complete);
    const result = buildResult(
      revision,
      assets,
      postflight,
      complete,
      prefix100,
      prefix500,
      outputs,
    );
    const resultFile = await dependencies.commitPrivateJson(
      paths.result,
      paths.outputRoot,
      dependencies.effectiveUserId,
      result,
    );
    dependencies.reportProgress({ phase: "result-committed" });
    return Object.freeze({
      schema: FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA,
      status: "complete-training-only-postflight-bound",
      idempotent_existing_result: false,
      result_path: paths.result,
      result_file: resultFile,
      result,
    });
  } finally {
    try {
      await releaseRunLock?.();
    } finally {
      dependencies.setUmask(previousUmask);
    }
  }
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
    throw new Error(`run directory is not private 0700: ${directory}`);
  }
}

function relativePath(root: string, file: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("run file must be inside the fixed output root");
  }
  return relative.split(path.sep).join("/");
}

async function assertPrivateFile(
  file: string,
  effectiveUserId: number,
): Promise<fs.Stats> {
  const stat = await fs.promises.lstat(file);
  if (
    !stat.isFile() ||
    stat.uid !== effectiveUserId ||
    (stat.mode & 0o7777) !== FILE_MODE
  ) {
    throw new Error(`run file is not private regular 0600: ${file}`);
  }
  return stat;
}

async function digestPrivateFile(
  file: string,
  root: string,
  effectiveUserId: number,
): Promise<FloodgateStrengthFirstTeacherFileBinding> {
  const before = await assertPrivateFile(file, effectiveUserId);
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) {
    const data = chunk as Buffer;
    bytes += data.byteLength;
    hash.update(data);
  }
  const after = await assertPrivateFile(file, effectiveUserId);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    bytes !== before.size
  ) {
    throw new Error(`run file changed while hashing: ${file}`);
  }
  return Object.freeze({
    path: relativePath(root, file),
    bytes,
    sha256: hash.digest("hex"),
  });
}

async function readPrivateJson(
  file: string,
  root: string,
  effectiveUserId: number,
): Promise<ReadPrivateJsonResult | null> {
  try {
    const stat = await assertPrivateFile(file, effectiveUserId);
    if (stat.size > MAX_RESULT_JSON_BYTES) {
      throw new Error(`private JSON is too large: ${file}`);
    }
    const bytes = await fs.promises.readFile(file);
    const binding = await digestPrivateFile(file, root, effectiveUserId);
    return Object.freeze({
      value: JSON.parse(bytes.toString("utf8")) as unknown,
      binding,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
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

export interface FloodgateStrengthFirstTeacherRunLockDependencies {
  readonly lockfExecutable: string;
  readonly acquisitionTimeoutMs: number;
}

async function openRetainedRunLock(
  lockPath: string,
  effectiveUserId: number,
): Promise<fs.promises.FileHandle> {
  const handle = await fs.promises.open(
    lockPath,
    fs.constants.O_RDWR |
      fs.constants.O_CREAT |
      fs.constants.O_NOFOLLOW |
      fs.constants.O_NONBLOCK,
    FILE_MODE,
  );
  try {
    const initial = await handle.stat();
    if (!initial.isFile() || initial.uid !== effectiveUserId) {
      throw new Error("strength-first run lock must be an owned regular file");
    }
    await handle.chmod(FILE_MODE);
    await handle.sync();
    const handleStat = await handle.stat();
    const pathStat = await fs.promises.lstat(lockPath);
    if (
      !pathStat.isFile() ||
      pathStat.uid !== effectiveUserId ||
      (pathStat.mode & 0o7777) !== FILE_MODE ||
      handleStat.dev !== pathStat.dev ||
      handleStat.ino !== pathStat.ino
    ) {
      throw new Error("strength-first retained run lock inode changed");
    }
    return handle;
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function assertRetainedRunLock(
  lockPath: string,
  effectiveUserId: number,
  handle: fs.promises.FileHandle,
): Promise<void> {
  const pathStat = await fs.promises.lstat(lockPath);
  const handleStat = await handle.stat();
  if (
    !pathStat.isFile() ||
    pathStat.uid !== effectiveUserId ||
    (pathStat.mode & 0o7777) !== FILE_MODE ||
    handleStat.dev !== pathStat.dev ||
    handleStat.ino !== pathStat.ino
  ) {
    throw new Error("strength-first retained run lock inode changed");
  }
}

function waitForRunLockHelper(
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let spawnError: Error | undefined;
    let timedOut = false;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error: Error) => {
      spawnError = error;
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      if (timedOut) {
        finish(new Error("strength-first run lock acquisition timed out"));
      } else if (spawnError) {
        finish(spawnError);
      } else if (code === 0) {
        finish();
      } else if (code === 75) {
        finish(new Error("strength-first teacher is already active"));
      } else {
        finish(
          new Error(
            `strength-first lockf helper failed (${code ?? signal ?? "unknown"})`,
          ),
        );
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    timer.unref();
    child.once("error", onError);
    child.once("close", onClose);
  });
}

async function acquireFloodgateStrengthFirstTeacherRunLock(
  outputRoot: string,
  effectiveUserId: number,
  dependencies: FloodgateStrengthFirstTeacherRunLockDependencies,
): Promise<RunLockRelease> {
  if (
    dependencies.lockfExecutable !== "/usr/bin/lockf" ||
    !Number.isSafeInteger(dependencies.acquisitionTimeoutMs) ||
    dependencies.acquisitionTimeoutMs <= 0
  ) {
    throw new Error("strength-first run lock dependencies are invalid");
  }
  const lockPath = path.join(
    outputRoot,
    FLOODGATE_STRENGTH_FIRST_TEACHER_RUN_LOCK_FILENAME,
  );
  const handle = await openRetainedRunLock(lockPath, effectiveUserId);
  try {
    await syncDirectory(outputRoot);
    const child = spawn(dependencies.lockfExecutable, ["-s", "-t", "0", "3"], {
      cwd: outputRoot,
      env: Object.freeze({
        HOME: outputRoot,
        LANG: "C",
        LC_ALL: "C",
        NODE_ENV: "production",
        PATH: "/usr/bin:/bin",
      }),
      stdio: ["ignore", "ignore", "ignore", handle.fd],
    });
    await waitForRunLockHelper(child, dependencies.acquisitionTimeoutMs);
    await assertRetainedRunLock(lockPath, effectiveUserId, handle);
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
  let releasePromise: Promise<void> | undefined;
  return async () => {
    if (!releasePromise) {
      releasePromise = (async () => {
        try {
          await assertRetainedRunLock(lockPath, effectiveUserId, handle);
        } finally {
          await handle.close();
        }
      })();
    }
    return releasePromise;
  };
}

export function acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
  outputRoot: string,
  effectiveUserId: number,
  dependencies: FloodgateStrengthFirstTeacherRunLockDependencies,
): Promise<RunLockRelease> {
  return acquireFloodgateStrengthFirstTeacherRunLock(
    outputRoot,
    effectiveUserId,
    dependencies,
  );
}

async function commitPrivateJson(
  file: string,
  root: string,
  effectiveUserId: number,
  value: unknown,
): Promise<FloodgateStrengthFirstTeacherFileBinding> {
  relativePath(root, file);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const expected = {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const existing = await readPrivateJson(file, root, effectiveUserId);
  if (existing) {
    assertBinding(existing.binding, expected, "existing JSON");
    if (!sameJson(existing.value, value)) {
      throw new Error("existing milestone/result JSON differs from retry");
    }
    return existing.binding;
  }
  const directory = path.dirname(file);
  const temporary = path.join(
    directory,
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
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  const committed = await digestPrivateFile(file, root, effectiveUserId);
  assertBinding(committed, expected, "committed JSON");
  return committed;
}

function productionEffectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("strength-first teacher requires process.geteuid()");
  }
  return process.geteuid();
}

const PRODUCTION_DEPENDENCIES: FloodgateStrengthFirstTeacherRunnerDependencies =
  Object.freeze({
    homeDirectory: () => os.userInfo().homedir,
    runnerRepositoryRoot: path.resolve(__dirname, ".."),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    effectiveUserId: productionEffectiveUserId(),
    setUmask: (mode: number) => process.umask(mode),
    ensurePrivateDirectory,
    acquireRunLock: (outputRoot: string, effectiveUserId: number) =>
      acquireFloodgateStrengthFirstTeacherRunLock(outputRoot, effectiveUserId, {
        lockfExecutable: "/usr/bin/lockf",
        acquisitionTimeoutMs: 10_000,
      }),
    verifyProductionAssets: verifyPinnedFloodgateProductionTeacherAssets,
    captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
    consumeTrainingRows: withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
    claimTrainingInput: claimActiveVerifiedPinnedFloodgateTrainingRows,
    claimPostflight: claimVerifiedFloodgateTrainingConsumerPostflight,
    advanceTeacher: advanceStrengthFirstSiblingTeacherDataset,
    readPrivateJson,
    digestPrivateFile,
    commitPrivateJson,
    reportProgress: (event: FloodgateStrengthFirstTeacherProgressEvent) => {
      process.stderr.write(
        `${JSON.stringify({
          schema: "shogi-floodgate-strength-first-teacher-progress-v1",
          ...event,
        })}\n`,
      );
    },
  });

/** Execute the fixed, argumentless, current-user local production runner. */
export function runFloodgateStrengthFirstTeacher(): Promise<
  Readonly<FloodgateStrengthFirstTeacherPublicReceipt>
> {
  return runFloodgateStrengthFirstTeacherCore(PRODUCTION_DEPENDENCIES);
}
