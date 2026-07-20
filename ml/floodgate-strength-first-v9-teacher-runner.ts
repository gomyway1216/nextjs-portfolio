/**
 * Local strength-first v9 teacher runner.
 *
 * The pinned training manifest and 24,000 training rows are verified through
 * the fast held-descriptor boundary before and after teacher work. The final
 * result is committed only after both input identities compare equal.
 */

import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

import {
  PROPOSAL_INCOMPLETE_QUARANTINE_POLICY,
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
  advanceStrengthFirstSiblingTeacherDataset,
  siblingTeacherStagePaths,
  strengthFirstTimeoutSkipLimit,
  type StrengthFirstForcedSkipReasonCounts,
  type StrengthFirstSiblingTeacherAdvance,
  type StrengthFirstSiblingTeacherOptions,
} from "./generate-sibling-teacher";
import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY,
  loadFloodgateStrengthFirstFastTrainingInput,
  type FloodgateStrengthFirstFastTrainingInput,
} from "./floodgate-strength-first-fast-training-input";
import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
} from "./floodgate-role-bundle-result";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
  captureFloodgateStrengthFirstV9TeacherAuthorityReceipt,
  verifyPinnedFloodgateStrengthFirstV9TeacherAuthority,
  type FloodgateStrengthFirstV9TeacherAuthorityReceipt,
} from "./floodgate-strength-first-v9-teacher-authority";
import {
  acquireFloodgateStrengthFirstTeacherRunLock,
  commitFloodgateStrengthFirstTeacherPrivateJson,
  digestFloodgateStrengthFirstTeacherPrivateFile,
  ensureFloodgateStrengthFirstTeacherPrivateDirectory,
  readFloodgateStrengthFirstTeacherPrivateJson,
  type FloodgateStrengthFirstTeacherFileBinding,
} from "./floodgate-strength-first-teacher-runner";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingInputBinding,
} from "./floodgate-training-row-consumer";

export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA =
  "shogi-floodgate-strength-first-v9-teacher-runner-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_MILESTONE_SCHEMA =
  "shogi-floodgate-strength-first-v9-teacher-milestone-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA =
  "shogi-floodgate-strength-first-v9-teacher-result-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_PUBLIC_RECEIPT_SCHEMA =
  "shogi-floodgate-strength-first-v9-teacher-public-receipt-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION =
  "v22.13.0" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_OUTPUT_DIRECTORY =
  "floodgate-q1-2026-strength-first-v9" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_HISTORIC_BUNDLE_VERIFIER_REVISION =
  "e8a9197608cb48b1160b6707d97b0c4f78f90a1d" as const;

type AssetReceipt = Readonly<
  FloodgateStrengthFirstV9TeacherAuthorityReceipt<"production-fixed-registry-and-deployment-root">
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

export interface FloodgateStrengthFirstV9TeacherPaths {
  readonly home: string;
  readonly runnerRepositoryRoot: string;
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

export interface FloodgateStrengthFirstV9FastInputBinding {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA;
  readonly role: "training";
  readonly policy: typeof FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY;
  readonly manifest: Readonly<{
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }>;
  readonly source: Readonly<typeof FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY>;
}

export interface FloodgateStrengthFirstV9FastInputPostflight {
  readonly preflight: Readonly<FloodgateStrengthFirstV9FastInputBinding>;
  readonly postflight: Readonly<FloodgateStrengthFirstV9FastInputBinding>;
  readonly equal: true;
}

export interface FloodgateStrengthFirstV9TeacherResultMarker {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA;
  readonly status: "complete-training-only-fast-input-postflight-bound";
  readonly claim_boundary: "fast-input-and-staged-output-integrity-not-playing-strength-evidence";
  readonly runner: Readonly<{
    readonly schema: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA;
    readonly revision: string;
    readonly node: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION;
    readonly platform: "darwin";
    readonly architecture: "arm64";
    readonly local_only: true;
    readonly network_requests: 0;
    readonly cloud_services: readonly [];
    readonly live_weight_changes: 0;
  }>;
  readonly production_asset_preflight: AssetReceipt;
  readonly authenticated_input: Readonly<{
    readonly runtime: Readonly<FloodgateStrengthFirstV9FastInputPostflight>;
    readonly generator_projection: Readonly<{
      readonly schema: typeof FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA;
      readonly role: "training";
      readonly binding: Readonly<FloodgateTrainingInputBinding>;
      readonly historic_provenance_not_reverified_by_fast_path: true;
    }>;
  }>;
  readonly teacher: Readonly<{
    readonly engine: "YaneuraOu";
    readonly runtime: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME;
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
    readonly forced_skip_reasons: StrengthFirstForcedSkipReasonCounts;
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
    readonly fast_input_reauthenticated_after_teacher: true;
    readonly postflight_equal_before_result_commit: true;
    readonly result_committed_last: true;
  }>;
}

export interface FloodgateStrengthFirstV9TeacherPublicReceipt {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_PUBLIC_RECEIPT_SCHEMA;
  readonly status: "complete-training-only-fast-input-postflight-bound";
  readonly idempotent_existing_result: boolean;
  readonly result_path: string;
  readonly result_file: FloodgateStrengthFirstTeacherFileBinding;
  readonly result: Readonly<FloodgateStrengthFirstV9TeacherResultMarker>;
}

export type FloodgateStrengthFirstV9TeacherProgressEvent =
  | Readonly<{ readonly phase: "asset-preflight-complete" }>
  | Readonly<{ readonly phase: "runner-revision-verified"; readonly revision: string }>
  | Readonly<{ readonly phase: "fast-input-preflight-complete" }>
  | Readonly<{ readonly phase: "milestone-complete"; readonly target_parents: 100 | 500 }>
  | Readonly<{ readonly phase: "teacher-stage-complete"; readonly target_parents: 24_000 }>
  | Readonly<{ readonly phase: "fast-input-postflight-equal" }>
  | Readonly<{ readonly phase: "existing-result-verified" }>
  | Readonly<{ readonly phase: "result-committed" }>;

interface ReadPrivateJsonResult {
  readonly value: unknown;
  readonly binding: FloodgateStrengthFirstTeacherFileBinding;
}

export interface FloodgateStrengthFirstV9TeacherRunnerDependencies {
  readonly homeDirectory: () => string;
  readonly runnerRepositoryRoot: string;
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly effectiveUserId: number;
  readonly setUmask: (mode: number) => number;
  readonly ensurePrivateDirectory: (directory: string, effectiveUserId: number) => Promise<void>;
  readonly acquireRunLock: (outputRoot: string, effectiveUserId: number) => Promise<RunLockRelease>;
  readonly verifyProductionAssets: () => Promise<AssetReceipt>;
  readonly captureExactCleanRevision: (repositoryRoot: string) => Promise<string>;
  readonly loadFastTrainingInput: (
    home: string,
  ) => Promise<Readonly<FloodgateStrengthFirstFastTrainingInput>>;
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
    event: FloodgateStrengthFirstV9TeacherProgressEvent,
  ) => void;
}

function absolute(value: string, label: string): string {
  if (!value || value.includes("\0") || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
  return path.resolve(value);
}

export function floodgateStrengthFirstV9TeacherPaths(
  homeInput: string,
  repositoryInput: string,
): Readonly<FloodgateStrengthFirstV9TeacherPaths> {
  const home = absolute(homeInput, "home");
  const runnerRepositoryRoot = absolute(repositoryInput, "repository");
  const assetRoot = path.join(
    home,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  const runsRoot = path.join(home, ".codex", "shogi-runs");
  const outputRoot = path.join(
    runsRoot,
    FLOODGATE_STRENGTH_FIRST_V9_TEACHER_OUTPUT_DIRECTORY,
  );
  return Object.freeze({
    home,
    runnerRepositoryRoot,
    assetRoot,
    engineBin: path.join(assetRoot, "engine", "yaneuraou"),
    engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
    evalDir: path.join(assetRoot, "eval"),
    runsRoot,
    outputRoot,
    stageRoot: outputRoot,
    milestone100: path.join(outputRoot, "milestone-100.json"),
    milestone500: path.join(outputRoot, "milestone-500.json"),
    result: path.join(outputRoot, "result.json"),
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertRuntime(
  dependencies: FloodgateStrengthFirstV9TeacherRunnerDependencies,
): void {
  if (
    dependencies.nodeVersion !==
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION ||
    dependencies.platform !== "darwin" ||
    dependencies.architecture !== "arm64" ||
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0
  ) {
    throw new Error(
      `strength-first v9 teacher requires exact Node ${FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION} on darwin arm64 with a POSIX user ID`,
    );
  }
}

function captureAssets(
  value: AssetReceipt,
  effectiveUserId: number,
): AssetReceipt {
  try {
    return captureFloodgateStrengthFirstV9TeacherAuthorityReceipt(
      value,
      "production-fixed-registry-and-deployment-root",
      effectiveUserId,
    ) as AssetReceipt;
  } catch {
    throw new Error("invalid strength-first v9 production asset preflight");
  }
}

function captureFastInputBinding(
  value: Readonly<FloodgateStrengthFirstFastTrainingInput>,
): Readonly<FloodgateStrengthFirstV9FastInputBinding> {
  if (
    value.schema !== FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA ||
    value.role !== "training" ||
    value.policy !== FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY ||
    !sameJson(value.manifest, FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY) ||
    !sameJson(value.source, FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY) ||
    !Array.isArray(value.rows) ||
    value.rows.length !== 24_000 ||
    !Object.isFrozen(value.rows)
  ) {
    throw new Error("invalid strength-first v9 fast training input");
  }
  return Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
    role: "training",
    policy: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
    manifest: Object.freeze({
      path: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.path,
      bytes: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.bytes,
      sha256: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.sha256,
    }),
    source: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY,
  });
}

const HISTORIC_GENERATOR_BINDING: Readonly<FloodgateTrainingInputBinding> =
  Object.freeze({
    result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
    result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
    bundle_manifest_bytes: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.bytes,
    bundle_manifest_sha256: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.sha256,
    bundle_producer_revision:
      FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
    verifier_revision:
      FLOODGATE_STRENGTH_FIRST_V9_HISTORIC_BUNDLE_VERIFIER_REVISION,
    raw_format: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.format,
    raw_bytes: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.bytes,
    raw_sha256: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.sha256,
    records: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.records,
    games: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.games,
    game_ids_sha256:
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.game_ids_sha256,
    parent_ids_sha256:
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.parent_ids_sha256,
    position_ids_count:
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.position_ids_count,
    position_ids_sha256:
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.position_ids_sha256,
  });

function projectFastInputForGenerator(
  value: Readonly<FloodgateStrengthFirstFastTrainingInput>,
): Readonly<AuthenticatedFloodgateTrainingRows> {
  captureFastInputBinding(value);
  return Object.freeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training",
    binding: HISTORIC_GENERATOR_BINDING,
    rows: value.rows,
  });
}

function teacherOptions(
  paths: Readonly<FloodgateStrengthFirstV9TeacherPaths>,
  runnerRevision: string,
  targetParents: 100 | 500 | 24_000,
): Readonly<StrengthFirstSiblingTeacherOptions> {
  return Object.freeze({
    stageRoot: paths.stageRoot,
    runnerRevision,
    engineBin: paths.engineBin,
    engineArgs: Object.freeze([]),
    engineReceipt: paths.engineReceipt,
    authenticatedInputPolicy:
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
    evalDir: paths.evalDir,
    multipv: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.proposal.multipv,
    proposalDepth:
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.proposal.depth,
    depth:
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.independent_rescore.depth,
    fvScale: 20,
    hashMb:
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.hash_mb_per_engine,
    timeoutMs:
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.timeout_ms_per_search,
    targetParents,
  });
}

function validForcedSkipCounts(
  value: unknown,
  targetParents: number,
  forcedParentsSkipped: number,
): value is StrengthFirstForcedSkipReasonCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const counts = value as Partial<StrengthFirstForcedSkipReasonCounts>;
  const keys = Object.keys(value).sort();
  const allowed =
    keys.join("\0") ===
      ["fewer_than_two_legal_moves", "search_timeout_no_label"].join("\0") ||
    keys.join("\0") ===
      [
        "fewer_than_two_legal_moves",
        "proposal_incomplete_no_label",
        "search_timeout_no_label",
      ].join("\0");
  const legal = counts.fewer_than_two_legal_moves;
  const timeout = counts.search_timeout_no_label;
  const incomplete = counts.proposal_incomplete_no_label ?? 0;
  return (
    allowed &&
    Number.isSafeInteger(legal) &&
    (legal as number) >= 0 &&
    Number.isSafeInteger(timeout) &&
    (timeout as number) >= 0 &&
    Number.isSafeInteger(incomplete) &&
    incomplete >= 0 &&
    (legal as number) + (timeout as number) + incomplete ===
      forcedParentsSkipped &&
    (timeout as number) + incomplete <=
      strengthFirstTimeoutSkipLimit(targetParents)
  );
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
    /^[0-9a-f]{64}$/u.test(binding.sha256)
  );
}

function assertPrefix(
  value: StrengthFirstSiblingTeacherAdvance,
  target: 100 | 500,
  fingerprint?: string,
): asserts value is PrefixOutcome {
  if (
    value.status !==
      "local-work-prefix-complete-not-an-authentication-receipt" ||
    value.authentication_receipt !== false ||
    value.target_parents !== target ||
    value.completed_parents !== target ||
    !/^[0-9a-f]{64}$/u.test(value.run_fingerprint) ||
    (fingerprint !== undefined && value.run_fingerprint !== fingerprint) ||
    !Number.isSafeInteger(value.forced_parents_skipped) ||
    value.forced_parents_skipped < 0 ||
    !Number.isSafeInteger(value.emitted_parent_groups) ||
    value.emitted_parent_groups < 0 ||
    value.forced_parents_skipped + value.emitted_parent_groups !== target ||
    !validForcedSkipCounts(
      value.forced_skip_reasons,
      target,
      value.forced_parents_skipped,
    ) ||
    !isBinding(value.work) ||
    value.work.path !== "work.jsonl" ||
    value.work.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    value.work.records !== target + 1
  ) {
    throw new Error(`invalid strength-first v9 milestone ${target}`);
  }
}

function assertTeacherAssets(manifest: FinalOutcome["manifest"], assets: AssetReceipt): void {
  const receipt = manifest.teacher.engine_receipt?.file;
  const evalNn = manifest.teacher.eval_files.find((file) => file.path === "nn.bin");
  if (
    manifest.teacher.engine_bin_bytes !== assets.assets.engine.yaneuraou.bytes ||
    manifest.teacher.engine_bin_sha256 !==
      assets.assets.engine.yaneuraou.sha256 ||
    receipt?.bytes !== assets.assets.engine.receipt.bytes ||
    receipt.sha256 !== assets.assets.engine.receipt.sha256 ||
    manifest.teacher.eval_files.length !== 1 ||
    !evalNn ||
    evalNn.bytes !== assets.assets.eval.nn.bytes ||
    evalNn.sha256 !== assets.assets.eval.nn.sha256 ||
    manifest.teacher.eval_sha256 !== assets.assets.eval.tree_sha256
  ) {
    throw new Error("v9 teacher manifest asset binding mismatch");
  }
}

function assertFinal(
  value: StrengthFirstSiblingTeacherAdvance,
  revision: string,
  assets: AssetReceipt,
  fingerprint: string,
): asserts value is FinalOutcome {
  if (
    value.status !== "complete-training-only" ||
    value.target_parents !== 24_000 ||
    value.completed_parents !== 24_000 ||
    value.run_fingerprint !== fingerprint
  ) {
    throw new Error("invalid strength-first v9 final milestone");
  }
  const manifest = value.manifest;
  const staged = value.staged_result;
  assertTeacherAssets(manifest, assets);
  if (
    manifest.schema !== STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA ||
    manifest.status !== "complete-training-only" ||
    manifest.run_fingerprint !== fingerprint ||
    manifest.pipeline.source_revision !== revision ||
    manifest.pipeline.tracked_tree_clean !== true ||
    manifest.authenticated_input.runtime_policy !==
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY ||
    !sameJson(manifest.authenticated_input.binding, HISTORIC_GENERATOR_BINDING) ||
    manifest.source.raw_sha256 !==
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.sha256 ||
    manifest.source.raw_records !== 24_000 ||
    manifest.source.selected_parents !== 24_000 ||
    manifest.search.multipv !== 12 ||
    !sameJson(manifest.search.proposal_limit, { depth: 14 }) ||
    !sameJson(manifest.search.limit, { depth: 16 }) ||
    manifest.search.proposal_incomplete_quarantine_policy !==
      PROPOSAL_INCOMPLETE_QUARANTINE_POLICY ||
    manifest.search.parallel_engines !== 12 ||
    manifest.search.hash_mb_per_engine !== 512 ||
    manifest.search.timeout_ms !== 600_000 ||
    staged.schema !== STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA ||
    staged.status !== "complete-training-only" ||
    staged.runner_revision !== revision ||
    staged.completed_parents !== 24_000 ||
    staged.input_parents !== 24_000 ||
    staged.run_fingerprint !== fingerprint ||
    !validForcedSkipCounts(
      staged.forced_skip_reasons,
      24_000,
      staged.forced_parents_skipped,
    ) ||
    staged.forced_parents_skipped + staged.emitted_parent_groups !== 24_000
  ) {
    throw new Error("invalid strength-first v9 final artifact semantics");
  }
}

function milestone(
  target: 100 | 500,
  revision: string,
  fast: Readonly<FloodgateStrengthFirstV9FastInputBinding>,
  value: PrefixOutcome,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_MILESTONE_SCHEMA,
    status:
      "local-work-prefix-complete-not-an-authentication-or-playing-strength-receipt",
    authentication_receipt: false,
    playing_strength_evidence: false,
    target_parents: target,
    completed_parents: target,
    runner_revision: revision,
    fast_input_preflight: fast,
    progress: Object.freeze({
      status: value.status,
      authentication_receipt: value.authentication_receipt,
      run_fingerprint: value.run_fingerprint,
      forced_parents_skipped: value.forced_parents_skipped,
      forced_skip_reasons: value.forced_skip_reasons,
      emitted_parent_groups: value.emitted_parent_groups,
      work: value.work,
    }),
  });
}

function assertBinding(
  actual: Readonly<FloodgateStrengthFirstTeacherFileBinding>,
  expected: Readonly<FloodgateStrengthFirstTeacherFileBinding>,
  label: string,
): void {
  if (
    actual.path !== expected.path ||
    actual.bytes !== expected.bytes ||
    actual.sha256 !== expected.sha256
  ) {
    throw new Error(`${label} identity mismatch`);
  }
}

async function collectOutputs(
  dependencies: FloodgateStrengthFirstV9TeacherRunnerDependencies,
  paths: Readonly<FloodgateStrengthFirstV9TeacherPaths>,
  outcome: FinalOutcome,
): Promise<FloodgateStrengthFirstV9TeacherResultMarker["staged_outputs"]> {
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
    "parent completion",
  );
  assertBinding(manifest, outcome.staged_result.manifest, "manifest");
  const stagedBytes = Buffer.from(
    `${JSON.stringify(outcome.staged_result, null, 2)}\n`,
  );
  const stagedExpected = Object.freeze({
    path: "staged-result.json",
    bytes: stagedBytes.byteLength,
    sha256: createHash("sha256").update(stagedBytes).digest("hex"),
  });
  assertBinding(stagedResult, stagedExpected, "staged result");
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
  fastPostflight: Readonly<FloodgateStrengthFirstV9FastInputPostflight>,
  outcome: FinalOutcome,
  prefix100: FloodgateStrengthFirstTeacherFileBinding,
  prefix500: FloodgateStrengthFirstTeacherFileBinding,
  outputs: FloodgateStrengthFirstV9TeacherResultMarker["staged_outputs"],
): Readonly<FloodgateStrengthFirstV9TeacherResultMarker> {
  return Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA,
    status: "complete-training-only-fast-input-postflight-bound",
    claim_boundary:
      "fast-input-and-staged-output-integrity-not-playing-strength-evidence",
    runner: Object.freeze({
      schema: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA,
      revision,
      node: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION,
      platform: "darwin",
      architecture: "arm64",
      local_only: true,
      network_requests: 0,
      cloud_services: Object.freeze([]) as readonly [],
      live_weight_changes: 0,
    }),
    production_asset_preflight: assets,
    authenticated_input: Object.freeze({
      runtime: fastPostflight,
      generator_projection: Object.freeze({
        schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
        role: "training",
        binding: HISTORIC_GENERATOR_BINDING,
        historic_provenance_not_reverified_by_fast_path: true,
      }),
    }),
    teacher: Object.freeze({
      engine: "YaneuraOu",
      runtime: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
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
      forced_skip_reasons: outcome.staged_result.forced_skip_reasons,
      emitted_parent_groups: outcome.staged_result.emitted_parent_groups,
      run_fingerprint: outcome.run_fingerprint,
    }),
    staged_outputs: outputs,
    publication: Object.freeze({
      stage_root_private_0700: true,
      stage_files_private_0600: true,
      fast_input_reauthenticated_after_teacher: true,
      postflight_equal_before_result_commit: true,
      result_committed_last: true,
    }),
  });
}

async function validateExistingResult(
  dependencies: FloodgateStrengthFirstV9TeacherRunnerDependencies,
  paths: Readonly<FloodgateStrengthFirstV9TeacherPaths>,
  revision: string,
  assets: AssetReceipt,
  currentFast: Readonly<FloodgateStrengthFirstV9FastInputBinding>,
  stored: ReadPrivateJsonResult,
): Promise<Readonly<FloodgateStrengthFirstV9TeacherResultMarker>> {
  const marker =
    stored.value as Partial<FloodgateStrengthFirstV9TeacherResultMarker>;
  const runtime = marker.authenticated_input?.runtime;
  if (
    marker.schema !== FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA ||
    marker.status !== "complete-training-only-fast-input-postflight-bound" ||
    marker.runner?.revision !== revision ||
    marker.runner.schema !== FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA ||
    !sameJson(marker.production_asset_preflight, assets) ||
    runtime?.equal !== true ||
    !sameJson(runtime.preflight, currentFast) ||
    !sameJson(runtime.postflight, currentFast) ||
    !sameJson(
      marker.authenticated_input?.generator_projection?.binding,
      HISTORIC_GENERATOR_BINDING,
    ) ||
    !sameJson(marker.teacher?.runtime, FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME) ||
    marker.completion?.input_parents !== 24_000 ||
    marker.completion.completed_parents !== 24_000 ||
    !/^[0-9a-f]{64}$/u.test(marker.completion.run_fingerprint) ||
    !validForcedSkipCounts(
      marker.completion.forced_skip_reasons,
      24_000,
      marker.completion.forced_parents_skipped,
    ) ||
    !marker.milestones ||
    !marker.staged_outputs
  ) {
    throw new Error("existing strength-first v9 result does not match this run");
  }
  const stage = siblingTeacherStagePaths(paths.stageRoot);
  const expected = [
    [paths.milestone100, marker.milestones.prefix_100],
    [paths.milestone500, marker.milestones.prefix_500],
    [stage.work, marker.staged_outputs.work],
    [stage.train, marker.staged_outputs.train],
    [stage.parentCompletion, marker.staged_outputs.parent_completion],
    [stage.manifest, marker.staged_outputs.manifest],
    [stage.stagedResult, marker.staged_outputs.staged_result],
  ] as const;
  const actual = await Promise.all(
    expected.map(([file]) =>
      dependencies.digestPrivateFile(
        file,
        paths.outputRoot,
        dependencies.effectiveUserId,
      ),
    ),
  );
  expected.forEach(([, expectedBinding], index) => {
    assertBinding(actual[index], expectedBinding, "existing v9 output");
  });
  return marker as Readonly<FloodgateStrengthFirstV9TeacherResultMarker>;
}

export async function runFloodgateStrengthFirstV9TeacherCore(
  dependencies: FloodgateStrengthFirstV9TeacherRunnerDependencies,
): Promise<Readonly<FloodgateStrengthFirstV9TeacherPublicReceipt>> {
  assertRuntime(dependencies);
  const previousUmask = dependencies.setUmask(0o077);
  let releaseRunLock: RunLockRelease | undefined;
  try {
    const paths = floodgateStrengthFirstV9TeacherPaths(
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
    const assets = captureAssets(
      await dependencies.verifyProductionAssets(),
      dependencies.effectiveUserId,
    );
    dependencies.reportProgress({ phase: "asset-preflight-complete" });
    const revision = await dependencies.captureExactCleanRevision(
      paths.runnerRepositoryRoot,
    );
    if (!/^[0-9a-f]{40}$/u.test(revision)) {
      throw new Error("v9 runner revision is not a full Git object ID");
    }
    dependencies.reportProgress({
      phase: "runner-revision-verified",
      revision,
    });

    const preflightInput = await dependencies.loadFastTrainingInput(paths.home);
    const preflight = captureFastInputBinding(preflightInput);
    dependencies.reportProgress({ phase: "fast-input-preflight-complete" });
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
        preflight,
        existing,
      );
      dependencies.reportProgress({ phase: "existing-result-verified" });
      return Object.freeze({
        schema: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_PUBLIC_RECEIPT_SCHEMA,
        status: "complete-training-only-fast-input-postflight-bound",
        idempotent_existing_result: true,
        result_path: paths.result,
        result_file: existing.binding,
        result,
      });
    }

    const input = projectFastInputForGenerator(preflightInput);
    const first = await dependencies.advanceTeacher(
      input,
      teacherOptions(paths, revision, 100),
    );
    assertPrefix(first, 100);
    const fingerprint = first.run_fingerprint;
    const prefix100 = await dependencies.commitPrivateJson(
      paths.milestone100,
      paths.outputRoot,
      dependencies.effectiveUserId,
      milestone(100, revision, preflight, first),
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
    const prefix500 = await dependencies.commitPrivateJson(
      paths.milestone500,
      paths.outputRoot,
      dependencies.effectiveUserId,
      milestone(500, revision, preflight, second),
    );
    dependencies.reportProgress({
      phase: "milestone-complete",
      target_parents: 500,
    });

    const final = await dependencies.advanceTeacher(
      input,
      teacherOptions(paths, revision, 24_000),
    );
    assertFinal(final, revision, assets, fingerprint);
    dependencies.reportProgress({
      phase: "teacher-stage-complete",
      target_parents: 24_000,
    });

    const postflightInput = await dependencies.loadFastTrainingInput(paths.home);
    const postflight = captureFastInputBinding(postflightInput);
    if (!sameJson(preflight, postflight)) {
      throw new Error("fast training input changed during v9 teacher work");
    }
    const fastPostflight = Object.freeze({
      preflight,
      postflight,
      equal: true as const,
    });
    dependencies.reportProgress({ phase: "fast-input-postflight-equal" });

    const outputs = await collectOutputs(dependencies, paths, final);
    const result = buildResult(
      revision,
      assets,
      fastPostflight,
      final,
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
      schema: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_PUBLIC_RECEIPT_SCHEMA,
      status: "complete-training-only-fast-input-postflight-bound",
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

function productionEffectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("strength-first v9 teacher requires process.geteuid()");
  }
  return process.geteuid();
}

const PRODUCTION_DEPENDENCIES: FloodgateStrengthFirstV9TeacherRunnerDependencies =
  Object.freeze({
    homeDirectory: () => os.userInfo().homedir,
    runnerRepositoryRoot: path.resolve(__dirname, ".."),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    effectiveUserId: productionEffectiveUserId(),
    setUmask: (mode: number) => process.umask(mode),
    ensurePrivateDirectory:
      ensureFloodgateStrengthFirstTeacherPrivateDirectory,
    acquireRunLock: (outputRoot: string, effectiveUserId: number) =>
      acquireFloodgateStrengthFirstTeacherRunLock(outputRoot, effectiveUserId, {
        lockfExecutable: "/usr/bin/lockf",
        acquisitionTimeoutMs: 10_000,
      }),
    verifyProductionAssets:
      verifyPinnedFloodgateStrengthFirstV9TeacherAuthority,
    captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
    loadFastTrainingInput: loadFloodgateStrengthFirstFastTrainingInput,
    advanceTeacher: advanceStrengthFirstSiblingTeacherDataset,
    readPrivateJson: readFloodgateStrengthFirstTeacherPrivateJson,
    digestPrivateFile: digestFloodgateStrengthFirstTeacherPrivateFile,
    commitPrivateJson: commitFloodgateStrengthFirstTeacherPrivateJson,
    reportProgress: (
      event: FloodgateStrengthFirstV9TeacherProgressEvent,
    ) => {
      process.stderr.write(
        `${JSON.stringify({
          schema: "shogi-floodgate-strength-first-v9-teacher-progress-v1",
          ...event,
        })}\n`,
      );
    },
  });

/** Execute the fixed, argumentless, current-user local production runner. */
export function runFloodgateStrengthFirstV9Teacher(): Promise<
  Readonly<FloodgateStrengthFirstV9TeacherPublicReceipt>
> {
  return runFloodgateStrengthFirstV9TeacherCore(PRODUCTION_DEPENDENCIES);
}
