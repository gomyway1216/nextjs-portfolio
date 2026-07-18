/**
 * Non-production clean-room preparation and runtime binding for the Floodgate
 * v7 teacher.
 *
 * This first boundary deliberately exposes no package command and invokes no
 * checkpoint gate. The follow-up runner may consume the prepared capability,
 * but only after this source, its tests, and its evidence are reviewed.
 */

import { spawn, execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify, types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
  type FloodgateProductionStableRuntimeAssetsCallback,
  verifyPinnedFloodgateProductionTeacherAssetsCoreForTests,
  withVerifiedPinnedFloodgateProductionStableRuntimeAssetsCoreForTests,
} from "./floodgate-production-teacher-asset-authority";
import {
  createFloodgateProductionStableWasmRuntimeCoreForTests,
  getFloodgateProductionStableWasmRuntimeReceiptDigestCoreForTests,
} from "./floodgate-production-stable-wasm-runtime";
import {
  createFloodgateProductionTeacherUsiRuntimeCoreForTests,
  getFloodgateProductionTeacherUsiRuntimeReceiptDigestCoreForTests,
} from "./floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_GIT_COMMAND_PREFIX,
  FLOODGATE_GIT_EXECUTABLE,
  assertFloodgateGitExactCleanRevision,
  floodgateGitEnvironment,
} from "./floodgate-git";
import { verifyPinnedFloodgateRoleBundleReceipt } from "./floodgate-role-bundle-result";
import { createFloodgateStableWasmReusableProposalPool } from "./floodgate-stable-wasm-proposer";
import { assertFloodgateTestPathsOutsideProductionHomeCoreForTests } from "./floodgate-teacher-stage-authorization";
import type { FloodgateTrainingRowConsumerOptions } from "./floodgate-training-row-consumer";
import {
  createFloodgateV7ProductionParentCoordinatorCoreForTests,
  type FloodgateV7ProductionParentCoordinator,
} from "./floodgate-v7-production-parent-coordinator";
import {
  FloodgateV7CleanRoomRunGateError,
  assertFloodgateV7CleanRoomRunGateDependenciesCoreForTests,
  runFloodgateV7CleanRoomRunGatesFromPreparedGrantCoreForTests,
  type FloodgateV7CleanRoomRunGateDependenciesForTests,
  type FloodgateV7CleanRoomRunGatesReceipt,
} from "./floodgate-v7-clean-room-run-gates";
import {
  copyFloodgateV7CleanRoomFileByValueCoreForTests,
  copyFloodgateV7CleanRoomTreeByValueCoreForTests,
  FLOODGATE_V7_CLEAN_ROOM_COPY_CONCURRENCY,
  type FloodgateV7CleanRoomCopyReceipt,
} from "./floodgate-v7-clean-room-copy";
import { SHOGI_WASM_BASE64 } from "../src/components/game/ShogiImproved/wasm/shogiWasmBase64";

const execFile = promisify(execFileCallback);

export const FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT =
  "shogi-floodgate-v7-clean-room-teacher-runner-v1" as const;
export const FLOODGATE_V7_CLEAN_ROOM_TEACHER_PREPARATION_STATUS =
  "prepared-verified-non-production-inputs-and-runtime-binding" as const;
export const FLOODGATE_V7_CLEAN_ROOM_TEACHER_TEST_PREPARATION_STATUS =
  "prepared-injected-test-inputs-not-operational-evidence" as const;
export const FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY =
  "home-external-copy-by-value-pinned-verifier-and-test-core-runtime-binding-not-checkpoint-teacher-label-training-weight-live-activation-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION =
  "e8a9197608cb48b1160b6707d97b0c4f78f90a1d" as const;
export const FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT =
  "/private/tmp/shogi-floodgate-v7-clean-room-teacher-v1" as const;
export const FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE = Object.freeze([
  "durable-prefix-100",
  "durable-prefix-500",
  "sealed-final-24000",
] as const);

const FIXED_VERIFIER_SOURCE_COMPONENTS = Object.freeze([
  ".codex",
  "worktrees",
  "shogi-floodgate-role-bundle",
] as const);
const RAW_LOCK_SOURCE_COMPONENTS = Object.freeze([
  ".codex",
  "shogi-data",
  "floodgate-q1-2026-raw-lock",
] as const);
const ROLE_LOCK_SOURCE_COMPONENTS = Object.freeze([
  ".codex",
  "shogi-data",
  "floodgate-q1-2026-role-lock-v1",
] as const);
const ROLE_BUNDLE_SOURCE_COMPONENTS = Object.freeze([
  ".codex",
  "shogi-bundles",
  "floodgate-q1-2026-label-free-role-bundle-v2",
] as const);
const LEGACY_EXCLUSION_RELATIVE_COMPONENTS = Object.freeze([
  "ml",
  "data",
  "wcsc36",
  "int16-aware-replay-excluded-position-ids.txt",
] as const);
const CLONE_TIMEOUT_MS = 10 * 60 * 1000;
const GIT_OUTPUT_CAP_BYTES = 1024 * 1024;
const MODE_MASK = BigInt(0o7777);
const PRIVATE_DIRECTORY_MODE = BigInt(0o700);
const objectPrototype = Object.prototype;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;

type PreparationPhase =
  | "capture"
  | "namespace"
  | "materialization"
  | "copy"
  | "verification"
  | "capability";

export class FloodgateV7CleanRoomTeacherPreparationError extends Error {
  readonly phase: PreparationPhase;
  readonly clean_room_may_exist: boolean;
  readonly retry_disposition:
    | "fresh-absent-clean-room-required"
    | "manual-clean-room-reconciliation-required";
  readonly sensitive_values_disclosed = false;

  constructor(phase: PreparationPhase, cleanRoomMayExist: boolean) {
    super("Floodgate v7 clean-room teacher preparation failed");
    this.name = "FloodgateV7CleanRoomTeacherPreparationError";
    this.phase = phase;
    this.clean_room_may_exist = cleanRoomMayExist;
    this.retry_disposition = cleanRoomMayExist
      ? "manual-clean-room-reconciliation-required"
      : "fresh-absent-clean-room-required";
    Object.freeze(this);
  }
}

export interface FloodgateV7CleanRoomTeacherPlanForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly cleanRoomRoot: string;
  readonly sources: Readonly<{
    readonly verifierRepository: string;
    readonly rawLockRoot: string;
    readonly roleLockRoot: string;
    readonly roleBundleRoot: string;
    readonly legacyProtectedPositionIdsPath: string;
    readonly assetRoot: string;
  }>;
  readonly targets: Readonly<{
    readonly verifierRepository: string;
    readonly rawLockRoot: string;
    readonly roleLockRoot: string;
    readonly roleBundleRoot: string;
    readonly legacyProtectedPositionIdsPath: string;
    readonly assetRoot: string;
    readonly snapshotParent: string;
    readonly publicationParent: string;
    readonly stateRoot: string;
  }>;
  readonly verifierRevision: typeof FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION;
  readonly gateSequence: typeof FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE;
}

export interface FloodgateV7CleanRoomTeacherContractReceipt {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT;
  readonly status: "fixed-source-only-contract-no-operator-command";
  readonly claim_boundary: typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY;
  readonly execution_boundary: "non-production-home-external-test-core-route";
  readonly contract_binding: Readonly<{
    readonly argumentless_fixed_plan: true;
    readonly clean_room_outside_current_euid_home: true;
    readonly clean_room_root_mode: "0700";
    readonly copy_by_value: true;
    readonly symlink_hardlink_and_inode_aliases_forbidden: true;
    readonly accepted_verifier_revision_fixed: true;
    readonly runtime_boundary: "real-stable-and-yaneuraou-test-core-factories";
    readonly gate_sequence: typeof FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE;
    readonly gate_execution_implemented_by_this_change: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly private_source_read: false;
    readonly clean_room_created: false;
    readonly verifier_executed: false;
    readonly teacher_process: false;
    readonly teacher_label: false;
    readonly checkpoint: false;
    readonly optimizer_training: false;
    readonly weight_changed: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7CleanRoomTeacherPreparationReceipt {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT;
  readonly status:
    | typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_PREPARATION_STATUS
    | typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_TEST_PREPARATION_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY;
  readonly execution_boundary:
    | "fixed-non-production-home-external-real-test-core-route"
    | "test-only-injected-home-external-preparation-route";
  readonly preparation: Readonly<{
    readonly fixed_clean_room: true;
    readonly private_mode: "0700";
    readonly copied_trees: 4;
    readonly copied_standalone_files: 1;
    readonly copied_files: number;
    readonly copied_bytes: number;
    readonly copy_by_value_revalidated: true;
    readonly parallel_tree_materializations: 4;
    readonly file_copy_concurrency_per_tree: typeof FLOODGATE_V7_CLEAN_ROOM_COPY_CONCURRENCY;
    readonly maximum_parallel_copy_core_file_workers: 32;
    readonly git_clone_internal_io_bounded_by_copy_worker_counter: false;
    readonly first_failure_stops_new_file_scheduling_within_failing_tree: true;
    readonly first_failure_globally_cancels_other_trees_or_clone: false;
    readonly started_parallel_operations_drained_before_return: true;
    readonly per_file_fsync_used: false;
    readonly accepted_verifier_materialized_without_local_hardlinks: true;
    readonly full_role_bundle_verifier_passed: true;
    readonly teacher_asset_authority_passed: true;
  }>;
  readonly runtime_binding: Readonly<{
    readonly stable_factory: "real-stable-wasm-test-core";
    readonly teacher_factory: "real-yaneuraou-usi-test-core";
    readonly engines: 12;
    readonly threads_per_engine: 1;
    readonly proposal_depth: 16;
    readonly gate_sequence: typeof FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE;
    readonly gate_execution_implemented_by_this_change: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly path_or_digest_disclosed: false;
    readonly crash_durable_copy: false;
    readonly selection_or_final_holdout_opened: false;
    readonly teacher_process: false;
    readonly teacher_label: false;
    readonly checkpoint: false;
    readonly optimizer_training: false;
    readonly weight_changed: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7CleanRoomTeacherPreparedCapability {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT;
  readonly execution_boundary: FloodgateV7CleanRoomTeacherPreparationReceipt["execution_boundary"];
  readonly receipt: Readonly<FloodgateV7CleanRoomTeacherPreparationReceipt>;
}

export interface FloodgateV7CleanRoomPreparedRunGrantForTests {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT;
  readonly execution_boundary: "test-only-pr1-owned-prepared-run-grant";
}

export interface FloodgateV7CleanRoomTeacherPreparationDependencies {
  readonly materializeVerifierRepository: (
    sourceRepository: string,
    destinationRepository: string,
    revision: string,
    effectiveUserId: number,
  ) => Promise<void>;
  readonly copyTree: (
    sourceRoot: string,
    destinationRoot: string,
    effectiveUserId: number,
  ) => Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>>;
  readonly copyFile: (
    sourceFile: string,
    destinationFile: string,
    effectiveUserId: number,
  ) => Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>>;
  readonly verifyBundle: (
    options: Readonly<FloodgateTrainingRowConsumerOptions>,
  ) => Promise<unknown>;
  readonly verifyAssets: (
    assetRoot: string,
    effectiveUserId: number,
  ) => Promise<unknown>;
}

export interface FloodgateV7CleanRoomTeacherRuntimeDependenciesForTests {
  readonly createCoordinator: (
    plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
  ) => Promise<FloodgateV7ProductionParentCoordinator>;
}

type CapturedPlanRegistry = WeakSet<object>;
type PreparedPlanRegistry = WeakMap<
  object,
  Readonly<FloodgateV7CleanRoomTeacherPlanForTests>
>;

const testPreparedPlans: PreparedPlanRegistry = new WeakMap<
  object,
  Readonly<FloodgateV7CleanRoomTeacherPlanForTests>
>();
const fixedPreparedPlans: PreparedPlanRegistry = new WeakMap<
  object,
  Readonly<FloodgateV7CleanRoomTeacherPlanForTests>
>();
const testCapturedPlans: CapturedPlanRegistry = new WeakSet<object>();
const fixedCapturedPlans: CapturedPlanRegistry = new WeakSet<object>();
const testPreparedRunGrantPlans = new WeakMap<
  object,
  Readonly<FloodgateV7CleanRoomTeacherPlanForTests>
>();

function canonicalAbsolutePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\n") ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value
  ) {
    throw new Error("path differs");
  }
  return value;
}

function sameOrDescendant(ancestor: string, candidate: string): boolean {
  const relative = path.relative(ancestor, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function assertEffectiveUserId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("effective user differs");
  }
  return value;
}

function frozenPlan(
  effectiveUserId: number,
  homeDirectory: string,
  cleanRoomRoot: string,
): Readonly<FloodgateV7CleanRoomTeacherPlanForTests> {
  const sources = Object.freeze({
    verifierRepository: path.join(
      homeDirectory,
      ...FIXED_VERIFIER_SOURCE_COMPONENTS,
    ),
    rawLockRoot: path.join(homeDirectory, ...RAW_LOCK_SOURCE_COMPONENTS),
    roleLockRoot: path.join(homeDirectory, ...ROLE_LOCK_SOURCE_COMPONENTS),
    roleBundleRoot: path.join(homeDirectory, ...ROLE_BUNDLE_SOURCE_COMPONENTS),
    legacyProtectedPositionIdsPath: path.join(
      homeDirectory,
      ...FIXED_VERIFIER_SOURCE_COMPONENTS,
      ...LEGACY_EXCLUSION_RELATIVE_COMPONENTS,
    ),
    assetRoot: path.join(
      homeDirectory,
      ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
    ),
  });
  const verifierRepository = path.join(
    cleanRoomRoot,
    "verifier",
    "accepted-e8a9197",
  );
  const targets = Object.freeze({
    verifierRepository,
    rawLockRoot: path.join(cleanRoomRoot, "inputs", "raw-lock"),
    roleLockRoot: path.join(cleanRoomRoot, "inputs", "role-lock"),
    roleBundleRoot: path.join(cleanRoomRoot, "inputs", "role-bundle"),
    legacyProtectedPositionIdsPath: path.join(
      verifierRepository,
      ...LEGACY_EXCLUSION_RELATIVE_COMPONENTS,
    ),
    assetRoot: path.join(cleanRoomRoot, "assets", "teacher"),
    snapshotParent: path.join(cleanRoomRoot, "runtime", "snapshots"),
    publicationParent: path.join(cleanRoomRoot, "publication"),
    stateRoot: path.join(cleanRoomRoot, "state"),
  });
  return Object.freeze({
    effectiveUserId,
    homeDirectory,
    cleanRoomRoot,
    sources,
    targets,
    verifierRevision: FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
    gateSequence: FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE,
  });
}

function capturePlan(
  homeDirectoryValue: string,
  effectiveUserIdValue: number,
  cleanRoomRootValue: string,
  registry: CapturedPlanRegistry,
): Readonly<FloodgateV7CleanRoomTeacherPlanForTests> {
  const homeDirectory = canonicalAbsolutePath(homeDirectoryValue);
  const cleanRoomRoot = canonicalAbsolutePath(cleanRoomRootValue);
  const effectiveUserId = assertEffectiveUserId(effectiveUserIdValue);
  if (
    sameOrDescendant(homeDirectory, cleanRoomRoot) ||
    sameOrDescendant(cleanRoomRoot, homeDirectory)
  ) {
    throw new Error("clean-room aliases current-EUID home");
  }
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests([cleanRoomRoot]);
  const plan = frozenPlan(effectiveUserId, homeDirectory, cleanRoomRoot);
  registry.add(plan);
  return plan;
}

/** Test-only capture seam. The real plan accepts no path or revision input. */
export function captureFloodgateV7CleanRoomTeacherPlanCoreForTests(
  homeDirectoryValue: string,
  effectiveUserIdValue: number,
  cleanRoomRootValue: string,
): Readonly<FloodgateV7CleanRoomTeacherPlanForTests> {
  if (arguments.length !== 3) throw new Error("plan arguments differ");
  return capturePlan(
    homeDirectoryValue,
    effectiveUserIdValue,
    cleanRoomRootValue,
    testCapturedPlans,
  );
}

function fixedPlan(): Readonly<FloodgateV7CleanRoomTeacherPlanForTests> {
  if (typeof process.geteuid !== "function") {
    throw new Error("POSIX effective user is required");
  }
  const effectiveUserId = assertEffectiveUserId(process.geteuid());
  const user = os.userInfo();
  if (user.uid !== effectiveUserId) throw new Error("user identity differs");
  const homeDirectory = canonicalAbsolutePath(
    fs.realpathSync.native(user.homedir),
  );
  return capturePlan(
    homeDirectory,
    effectiveUserId,
    FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
    fixedCapturedPlans,
  );
}

/**
 * Argumentless, read-only public contract inspection. It reads no private
 * source and creates no clean-room entry.
 */
export function inspectFloodgateV7CleanRoomTeacherRunnerContract(): Readonly<FloodgateV7CleanRoomTeacherContractReceipt> {
  if (arguments.length !== 0) {
    throw new FloodgateV7CleanRoomTeacherPreparationError("capture", false);
  }
  try {
    fixedPlan();
    return Object.freeze({
      contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
      status: "fixed-source-only-contract-no-operator-command" as const,
      claim_boundary: FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY,
      execution_boundary:
        "non-production-home-external-test-core-route" as const,
      contract_binding: Object.freeze({
        argumentless_fixed_plan: true as const,
        clean_room_outside_current_euid_home: true as const,
        clean_room_root_mode: "0700" as const,
        copy_by_value: true as const,
        symlink_hardlink_and_inode_aliases_forbidden: true as const,
        accepted_verifier_revision_fixed: true as const,
        runtime_boundary:
          "real-stable-and-yaneuraou-test-core-factories" as const,
        gate_sequence: FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE,
        gate_execution_implemented_by_this_change: false as const,
      }),
      nonclaims: Object.freeze({
        private_source_read: false as const,
        clean_room_created: false as const,
        verifier_executed: false as const,
        teacher_process: false as const,
        teacher_label: false as const,
        checkpoint: false as const,
        optimizer_training: false as const,
        weight_changed: false as const,
        live_evaluation_activation: false as const,
        match: false as const,
        playing_strength: false as const,
      }),
    });
  } catch {
    throw new FloodgateV7CleanRoomTeacherPreparationError("capture", false);
  }
}

async function assertPrivateDirectory(
  directory: string,
  effectiveUserId: number,
): Promise<void> {
  const stat = await fs.promises.lstat(directory, { bigint: true });
  if (
    (await fs.promises.realpath(directory)) !== directory ||
    !stat.isDirectory() ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_MASK) !== PRIVATE_DIRECTORY_MODE
  ) {
    throw new Error("private directory differs");
  }
}

async function createPrivateDirectory(
  directory: string,
  effectiveUserId: number,
): Promise<void> {
  await fs.promises.mkdir(directory, { mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
  await assertPrivateDirectory(directory, effectiveUserId);
}

async function finishPreparationNamespace(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
): Promise<void> {
  await fs.promises.chmod(plan.cleanRoomRoot, 0o700);
  await assertPrivateDirectory(plan.cleanRoomRoot, plan.effectiveUserId);
  const directories = [
    path.join(plan.cleanRoomRoot, "verifier"),
    path.join(plan.cleanRoomRoot, "inputs"),
    path.join(plan.cleanRoomRoot, "assets"),
    path.join(plan.cleanRoomRoot, "runtime"),
    plan.targets.snapshotParent,
    plan.targets.publicationParent,
    plan.targets.stateRoot,
  ];
  for (const directory of directories) {
    await createPrivateDirectory(directory, plan.effectiveUserId);
  }
}

async function cleanRoomEntryMayExistConservatively(
  cleanRoomRoot: string,
): Promise<boolean> {
  try {
    await fs.promises.lstat(cleanRoomRoot);
    return true;
  } catch (error) {
    // Only a definite missing entry proves that reconciliation is unnecessary.
    // Permission and I/O failures preserve the safer "may exist" disposition.
    return !(
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  }
}

async function fixedGit(
  arguments_: readonly string[],
  cwd: string,
): Promise<string> {
  const { stdout } = await execFile(
    FLOODGATE_GIT_EXECUTABLE,
    [...FLOODGATE_GIT_COMMAND_PREFIX, ...arguments_],
    {
      cwd,
      encoding: "utf8",
      env: floodgateGitEnvironment(),
      timeout: CLONE_TIMEOUT_MS,
      maxBuffer: GIT_OUTPUT_CAP_BYTES,
    },
  );
  return stdout;
}

function parseDenseNulList(value: string): readonly string[] {
  if (value.length === 0) return Object.freeze([]);
  if (!value.endsWith("\0")) throw new Error("Git list differs");
  const entries = value.slice(0, -1).split("\0");
  if (entries.some((entry) => entry.length === 0)) {
    throw new Error("Git list differs");
  }
  return Object.freeze(entries);
}

async function assertIndependentTrackedFiles(
  sourceRepository: string,
  destinationRepository: string,
): Promise<void> {
  const tracked = parseDenseNulList(
    await fixedGit(["-C", destinationRepository, "ls-files", "-z"], "/"),
  );
  if (tracked.length !== 1_431) throw new Error("tracked entry count differs");
  for (const relative of tracked) {
    if (
      relative.includes("\0") ||
      relative.includes("\n") ||
      path.isAbsolute(relative) ||
      relative.split("/").includes("..")
    ) {
      throw new Error("tracked path differs");
    }
    const source = await fs.promises.lstat(
      path.join(sourceRepository, relative),
      { bigint: true },
    );
    const destination = await fs.promises.lstat(
      path.join(destinationRepository, relative),
      { bigint: true },
    );
    if (
      !source.isFile() ||
      !destination.isFile() ||
      source.nlink !== BigInt(1) ||
      destination.nlink !== BigInt(1) ||
      (source.dev === destination.dev && source.ino === destination.ino)
    ) {
      throw new Error("tracked file aliases source");
    }
  }
}

/** Materialize a full independent local clone of the accepted verifier. */
export async function materializeFloodgateV7CleanRoomVerifierCoreForTests(
  sourceRepositoryValue: string,
  destinationRepositoryValue: string,
  revisionValue: string,
  effectiveUserIdValue: number,
): Promise<void> {
  if (arguments.length !== 4) throw new Error("materialization differs");
  const sourceRepository = canonicalAbsolutePath(sourceRepositoryValue);
  const destinationRepository = canonicalAbsolutePath(
    destinationRepositoryValue,
  );
  const revision = revisionValue;
  const effectiveUserId = assertEffectiveUserId(effectiveUserIdValue);
  if (
    revision !== FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION ||
    sameOrDescendant(sourceRepository, destinationRepository) ||
    sameOrDescendant(destinationRepository, sourceRepository)
  ) {
    throw new Error("materialization binding differs");
  }
  await assertPrivateDirectory(
    path.dirname(destinationRepository),
    effectiveUserId,
  );
  await assertFloodgateGitExactCleanRevision(sourceRepository, revision);
  await fixedGit(
    [
      "clone",
      "--quiet",
      "--no-local",
      "--no-checkout",
      "--no-tags",
      "--",
      sourceRepository,
      destinationRepository,
    ],
    "/",
  );
  await fs.promises.chmod(destinationRepository, 0o700);
  await fixedGit(
    ["-C", destinationRepository, "checkout", "--quiet", "--detach", revision],
    "/",
  );
  const alternates = path.join(
    destinationRepository,
    ".git",
    "objects",
    "info",
    "alternates",
  );
  try {
    await fs.promises.lstat(alternates);
    throw new Error("Git object alternate exists");
  } catch (error) {
    if (
      error === null ||
      typeof error !== "object" ||
      !("code" in error) ||
      Reflect.get(error, "code") !== "ENOENT"
    ) {
      throw error;
    }
  }
  await assertFloodgateGitExactCleanRevision(destinationRepository, revision);
  await assertIndependentTrackedFiles(sourceRepository, destinationRepository);
  await assertFloodgateGitExactCleanRevision(sourceRepository, revision);
}

const FIXED_PREPARATION_DEPENDENCIES: Readonly<FloodgateV7CleanRoomTeacherPreparationDependencies> =
  Object.freeze({
    materializeVerifierRepository:
      materializeFloodgateV7CleanRoomVerifierCoreForTests,
    copyTree: (
      sourceRoot: string,
      destinationRoot: string,
      effectiveUserId: number,
    ) =>
      copyFloodgateV7CleanRoomTreeByValueCoreForTests(
        sourceRoot,
        destinationRoot,
        {
          effectiveUserId,
        },
      ),
    copyFile: (
      sourceFile: string,
      destinationFile: string,
      effectiveUserId: number,
    ) =>
      copyFloodgateV7CleanRoomFileByValueCoreForTests(
        sourceFile,
        destinationFile,
        {
          effectiveUserId,
        },
      ),
    verifyBundle: verifyPinnedFloodgateRoleBundleReceipt,
    verifyAssets: (assetRoot: string, effectiveUserId: number) =>
      verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
        FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
        assetRoot,
        {
          effectiveUserId,
          embeddedWasmBase64: SHOGI_WASM_BASE64,
        },
      ),
  });

function capturePreparationDependencies(
  value: FloodgateV7CleanRoomTeacherPreparationDependencies,
): Readonly<FloodgateV7CleanRoomTeacherPreparationDependencies> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error("preparation dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const expected = Object.freeze({
    materializeVerifierRepository: 4,
    copyTree: 3,
    copyFile: 3,
    verifyBundle: 1,
    verifyAssets: 2,
  } as const);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length !== Object.keys(expected).length ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !(key in expected) ||
        !("value" in descriptors[key]),
    )
  ) {
    throw new Error("preparation dependency keys differ");
  }
  const captured = {} as Record<
    keyof FloodgateV7CleanRoomTeacherPreparationDependencies,
    (...arguments_: never[]) => unknown
  >;
  for (const key of Object.keys(
    expected,
  ) as readonly (keyof typeof expected)[]) {
    const descriptor = descriptors[key];
    const dependency =
      descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
    if (
      typeof dependency !== "function" ||
      nodeUtilTypes.isProxy(dependency) ||
      dependency.length !== expected[key]
    ) {
      throw new Error("preparation dependency differs");
    }
    captured[key] = dependency as (...arguments_: never[]) => unknown;
  }
  return Object.freeze(
    captured,
  ) as unknown as Readonly<FloodgateV7CleanRoomTeacherPreparationDependencies>;
}

async function ensureLegacyDestinationParent(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
): Promise<void> {
  const parent = path.dirname(plan.targets.legacyProtectedPositionIdsPath);
  await fs.promises.mkdir(parent, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(
    path.join(plan.targets.verifierRepository, "ml"),
    0o700,
  );
  await fs.promises.chmod(
    path.join(plan.targets.verifierRepository, "ml", "data"),
    0o700,
  );
  await fs.promises.chmod(parent, 0o700);
  await assertPrivateDirectory(parent, plan.effectiveUserId);
}

function preparationReceipt(
  copies: readonly Readonly<FloodgateV7CleanRoomCopyReceipt>[],
  executionBoundary: FloodgateV7CleanRoomTeacherPreparationReceipt["execution_boundary"],
): Readonly<FloodgateV7CleanRoomTeacherPreparationReceipt> {
  if (
    copies.length !== 5 ||
    copies
      .slice(0, 4)
      .some(
        (receipt) =>
          receipt.copied.file_copy_concurrency_limit !==
            FLOODGATE_V7_CLEAN_ROOM_COPY_CONCURRENCY ||
          receipt.copied.per_file_fsync_used !== false ||
          receipt.nonclaims.crash_durable_copy !== false,
      ) ||
    copies[4]?.copied.file_copy_concurrency_limit !== 1 ||
    copies[4]?.copied.per_file_fsync_used !== false ||
    copies[4]?.nonclaims.crash_durable_copy !== false
  ) {
    throw new Error("copy receipt composition differs");
  }
  const copiedFiles = copies.reduce(
    (total, receipt) => total + receipt.copied.files,
    0,
  );
  const copiedBytes = copies.reduce(
    (total, receipt) => total + receipt.copied.bytes,
    0,
  );
  return Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
    status:
      executionBoundary ===
      "fixed-non-production-home-external-real-test-core-route"
        ? FLOODGATE_V7_CLEAN_ROOM_TEACHER_PREPARATION_STATUS
        : FLOODGATE_V7_CLEAN_ROOM_TEACHER_TEST_PREPARATION_STATUS,
    claim_boundary: FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY,
    execution_boundary: executionBoundary,
    preparation: Object.freeze({
      fixed_clean_room: true as const,
      private_mode: "0700" as const,
      copied_trees: 4 as const,
      copied_standalone_files: 1 as const,
      copied_files: copiedFiles,
      copied_bytes: copiedBytes,
      copy_by_value_revalidated: true as const,
      parallel_tree_materializations: 4 as const,
      file_copy_concurrency_per_tree: FLOODGATE_V7_CLEAN_ROOM_COPY_CONCURRENCY,
      maximum_parallel_copy_core_file_workers: 32 as const,
      git_clone_internal_io_bounded_by_copy_worker_counter: false as const,
      first_failure_stops_new_file_scheduling_within_failing_tree:
        true as const,
      first_failure_globally_cancels_other_trees_or_clone: false as const,
      started_parallel_operations_drained_before_return: true as const,
      per_file_fsync_used: false as const,
      accepted_verifier_materialized_without_local_hardlinks: true as const,
      full_role_bundle_verifier_passed: true as const,
      teacher_asset_authority_passed: true as const,
    }),
    runtime_binding: Object.freeze({
      stable_factory: "real-stable-wasm-test-core" as const,
      teacher_factory: "real-yaneuraou-usi-test-core" as const,
      engines: 12 as const,
      threads_per_engine: 1 as const,
      proposal_depth: 16 as const,
      gate_sequence: FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE,
      gate_execution_implemented_by_this_change: false as const,
    }),
    nonclaims: Object.freeze({
      path_or_digest_disclosed: false as const,
      crash_durable_copy: false as const,
      selection_or_final_holdout_opened: false as const,
      teacher_process: false as const,
      teacher_label: false as const,
      checkpoint: false as const,
      optimizer_training: false as const,
      weight_changed: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function deferredOperation<TResult>(
  operation: () => TResult | PromiseLike<TResult>,
): Promise<TResult> {
  return Promise.resolve().then(operation);
}

async function prepareFloodgateV7CleanRoomTeacherRunInternal(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
  dependenciesValue: FloodgateV7CleanRoomTeacherPreparationDependencies,
  capturedPlanRegistry: CapturedPlanRegistry,
  preparedPlanRegistry: PreparedPlanRegistry,
  executionBoundary: FloodgateV7CleanRoomTeacherPreparationReceipt["execution_boundary"],
): Promise<Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>> {
  let phase: PreparationPhase = "capture";
  let cleanRoomMayExist = false;
  try {
    const dependencies = capturePreparationDependencies(dependenciesValue);
    if (
      plan === null ||
      typeof plan !== "object" ||
      !capturedPlanRegistry.has(plan as object)
    ) {
      throw new Error("plan provenance differs");
    }
    capturedPlanRegistry.delete(plan as object);
    if (
      plan.verifierRevision !==
        FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION ||
      plan.gateSequence !== FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE
    ) {
      throw new Error("plan differs");
    }
    assertFloodgateTestPathsOutsideProductionHomeCoreForTests([
      plan.cleanRoomRoot,
      plan.targets.verifierRepository,
      plan.targets.rawLockRoot,
      plan.targets.roleLockRoot,
      plan.targets.roleBundleRoot,
      plan.targets.legacyProtectedPositionIdsPath,
      plan.targets.assetRoot,
      plan.targets.snapshotParent,
      plan.targets.publicationParent,
      plan.targets.stateRoot,
    ]);
    phase = "namespace";
    await fs.promises.mkdir(plan.cleanRoomRoot, { mode: 0o700 });
    cleanRoomMayExist = true;
    await finishPreparationNamespace(plan);
    phase = "materialization";
    const operations = await Promise.allSettled([
      deferredOperation(() =>
        dependencies.copyTree(
          plan.sources.rawLockRoot,
          plan.targets.rawLockRoot,
          plan.effectiveUserId,
        ),
      ),
      deferredOperation(() =>
        dependencies.copyTree(
          plan.sources.roleLockRoot,
          plan.targets.roleLockRoot,
          plan.effectiveUserId,
        ),
      ),
      deferredOperation(() =>
        dependencies.copyTree(
          plan.sources.roleBundleRoot,
          plan.targets.roleBundleRoot,
          plan.effectiveUserId,
        ),
      ),
      deferredOperation(() =>
        dependencies.copyTree(
          plan.sources.assetRoot,
          plan.targets.assetRoot,
          plan.effectiveUserId,
        ),
      ),
      deferredOperation(() =>
        dependencies.materializeVerifierRepository(
          plan.sources.verifierRepository,
          plan.targets.verifierRepository,
          plan.verifierRevision,
          plan.effectiveUserId,
        ),
      ),
    ] as const);
    const [
      rawCopyResult,
      roleCopyResult,
      bundleCopyResult,
      assetCopyResult,
      materializationResult,
    ] = operations;
    if (
      rawCopyResult.status !== "fulfilled" ||
      roleCopyResult.status !== "fulfilled" ||
      bundleCopyResult.status !== "fulfilled" ||
      assetCopyResult.status !== "fulfilled" ||
      materializationResult.status !== "fulfilled"
    ) {
      throw new Error("materialization operation failed");
    }
    const rawCopy = rawCopyResult.value;
    const roleCopy = roleCopyResult.value;
    const bundleCopy = bundleCopyResult.value;
    const assetCopy = assetCopyResult.value;
    await ensureLegacyDestinationParent(plan);
    phase = "copy";
    const legacyCopy = await dependencies.copyFile(
      plan.sources.legacyProtectedPositionIdsPath,
      plan.targets.legacyProtectedPositionIdsPath,
      plan.effectiveUserId,
    );
    phase = "verification";
    const verifications = await Promise.allSettled([
      deferredOperation(() =>
        dependencies.verifyBundle({
          repositoryRoot: plan.targets.verifierRepository,
          verifierRevision: plan.verifierRevision,
          rawLockRoot: plan.targets.rawLockRoot,
          roleLockRoot: plan.targets.roleLockRoot,
          legacyProtectedPositionIdsPath:
            plan.targets.legacyProtectedPositionIdsPath,
          outputRoot: plan.targets.roleBundleRoot,
        }),
      ),
      deferredOperation(() =>
        dependencies.verifyAssets(plan.targets.assetRoot, plan.effectiveUserId),
      ),
    ]);
    if (verifications.some((result) => result.status !== "fulfilled")) {
      throw new Error("verification failed");
    }
    phase = "capability";
    const receipt = preparationReceipt(
      [rawCopy, roleCopy, bundleCopy, assetCopy, legacyCopy],
      executionBoundary,
    );
    const capability = Object.freeze({
      contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
      execution_boundary: executionBoundary,
      receipt,
    });
    preparedPlanRegistry.set(capability, plan);
    return capability;
  } catch {
    if (phase === "namespace" && !cleanRoomMayExist) {
      cleanRoomMayExist = await cleanRoomEntryMayExistConservatively(
        plan.cleanRoomRoot,
      );
    }
    throw new FloodgateV7CleanRoomTeacherPreparationError(
      phase,
      cleanRoomMayExist,
    );
  }
}

/** Execute only preparation against an explicitly injected non-production plan. */
export function prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
  dependenciesValue: FloodgateV7CleanRoomTeacherPreparationDependencies,
): Promise<Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new FloodgateV7CleanRoomTeacherPreparationError("capture", false),
    );
  }
  return prepareFloodgateV7CleanRoomTeacherRunInternal(
    plan,
    dependenciesValue,
    testCapturedPlans,
    testPreparedPlans,
    "test-only-injected-home-external-preparation-route",
  );
}

/**
 * Fixed argumentless preparation owner. It is intentionally not exposed by a
 * package script in this change, so merge alone cannot start private copying.
 */
export function prepareFloodgateV7CleanRoomTeacherRun(): Promise<
  Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>
> {
  if (arguments.length !== 0) {
    return Promise.reject(
      new FloodgateV7CleanRoomTeacherPreparationError("capture", false),
    );
  }
  let plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  try {
    plan = fixedPlan();
  } catch {
    return Promise.reject(
      new FloodgateV7CleanRoomTeacherPreparationError("capture", false),
    );
  }
  return prepareFloodgateV7CleanRoomTeacherRunInternal(
    plan,
    FIXED_PREPARATION_DEPENDENCIES,
    fixedCapturedPlans,
    fixedPreparedPlans,
    "fixed-non-production-home-external-real-test-core-route",
  );
}

function lookupPreparedPlan(
  capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
  registry: PreparedPlanRegistry,
): Readonly<FloodgateV7CleanRoomTeacherPlanForTests> {
  if (capability === null || typeof capability !== "object") {
    throw new Error("prepared capability differs");
  }
  const plan = registry.get(capability);
  if (plan === undefined) throw new Error("prepared capability differs");
  return plan;
}

function consumePreparedPlan(
  capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
  registry: PreparedPlanRegistry,
): void {
  if (!registry.delete(capability)) {
    throw new Error("prepared capability differs");
  }
}

function mintPreparedRunGrantForTests(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
): Readonly<FloodgateV7CleanRoomPreparedRunGrantForTests> {
  const grant = Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
    execution_boundary: "test-only-pr1-owned-prepared-run-grant" as const,
  });
  testPreparedRunGrantPlans.set(grant, plan);
  return grant;
}

/**
 * Consume the exact private grant minted while this module consumed one PR1
 * test preparation capability. A structurally identical object carries no
 * plan authority.
 */
export function claimFloodgateV7CleanRoomPreparedRunGrantCoreForTests(
  grant: Readonly<FloodgateV7CleanRoomPreparedRunGrantForTests>,
): Readonly<FloodgateV7CleanRoomTeacherPlanForTests> {
  if (arguments.length !== 1 || grant === null || typeof grant !== "object") {
    throw new FloodgateV7CleanRoomTeacherPreparationError("capability", true);
  }
  const plan = testPreparedRunGrantPlans.get(grant);
  if (plan === undefined || !testPreparedRunGrantPlans.delete(grant)) {
    throw new FloodgateV7CleanRoomTeacherPreparationError("capability", true);
  }
  return plan;
}

async function createRealTestCoreCoordinator(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
): Promise<FloodgateV7ProductionParentCoordinator> {
  const stableAssetProvider = <TResult>(
    callback: FloodgateProductionStableRuntimeAssetsCallback<
      TResult,
      "test-only-injected-expected-registry-and-root"
    >,
  ): Promise<TResult> =>
    withVerifiedPinnedFloodgateProductionStableRuntimeAssetsCoreForTests(
      FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
      plan.targets.assetRoot,
      {
        effectiveUserId: plan.effectiveUserId,
        embeddedWasmBase64: SHOGI_WASM_BASE64,
      },
      callback,
    );
  return createFloodgateV7ProductionParentCoordinatorCoreForTests({
    createStableRuntime: () =>
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: stableAssetProvider,
        poolFactory: createFloodgateStableWasmReusableProposalPool,
      }),
    createTeacherRuntime: () =>
      createFloodgateProductionTeacherUsiRuntimeCoreForTests({
        assetRoot: plan.targets.assetRoot,
        snapshotParent: plan.targets.snapshotParent,
        effectiveUserId: plan.effectiveUserId,
        verifyAssets: () =>
          verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
            FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
            plan.targets.assetRoot,
            {
              effectiveUserId: plan.effectiveUserId,
              embeddedWasmBase64: SHOGI_WASM_BASE64,
            },
          ),
        spawnEngine: (file, args, options) => {
          if (args.length !== 0) {
            throw new Error("clean-room teacher accepts no engine arguments");
          }
          return spawn(file, {
            cwd: options.cwd,
            env: { ...options.env } as unknown as NodeJS.ProcessEnv,
            stdio: ["pipe", "pipe", "pipe"],
            shell: false,
            windowsHide: true,
            detached: true,
          });
        },
        engineCount: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
        depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
      }),
    getStableRuntimeReceiptDigest: (runtime) =>
      getFloodgateProductionStableWasmRuntimeReceiptDigestCoreForTests(
        runtime as Parameters<
          typeof getFloodgateProductionStableWasmRuntimeReceiptDigestCoreForTests
        >[0],
      ),
    getTeacherRuntimeReceiptDigest: (runtime) =>
      getFloodgateProductionTeacherUsiRuntimeReceiptDigestCoreForTests(
        runtime as Parameters<
          typeof getFloodgateProductionTeacherUsiRuntimeReceiptDigestCoreForTests
        >[0],
      ),
  });
}

const FIXED_RUNTIME_DEPENDENCIES: Readonly<FloodgateV7CleanRoomTeacherRuntimeDependenciesForTests> =
  Object.freeze({
    createCoordinator: createRealTestCoreCoordinator,
  });

function captureRuntimeCoordinatorFactory(
  dependenciesValue: FloodgateV7CleanRoomTeacherRuntimeDependenciesForTests,
): FloodgateV7CleanRoomTeacherRuntimeDependenciesForTests["createCoordinator"] {
  if (
    dependenciesValue === null ||
    typeof dependenciesValue !== "object" ||
    Array.isArray(dependenciesValue) ||
    nodeUtilTypes.isProxy(dependenciesValue) ||
    (objectGetPrototypeOf(dependenciesValue) !== objectPrototype &&
      objectGetPrototypeOf(dependenciesValue) !== null)
  ) {
    throw new Error("runtime dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(dependenciesValue);
  const keys = reflectOwnKeys(descriptors);
  const descriptor = descriptors.createCoordinator;
  if (
    keys.length !== 1 ||
    keys[0] !== "createCoordinator" ||
    descriptor === undefined ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "function" ||
    nodeUtilTypes.isProxy(descriptor.value) ||
    descriptor.value.length !== 1
  ) {
    throw new Error("runtime dependency differs");
  }
  return descriptor.value as FloodgateV7CleanRoomTeacherRuntimeDependenciesForTests["createCoordinator"];
}

async function createParentCoordinatorFromPreparedCapability(
  capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
  dependenciesValue: FloodgateV7CleanRoomTeacherRuntimeDependenciesForTests,
  registry: PreparedPlanRegistry,
): Promise<FloodgateV7ProductionParentCoordinator> {
  try {
    const plan = lookupPreparedPlan(capability, registry);
    const createCoordinator =
      captureRuntimeCoordinatorFactory(dependenciesValue);
    consumePreparedPlan(capability, registry);
    return await createCoordinator(plan);
  } catch {
    throw new FloodgateV7CleanRoomTeacherPreparationError("capability", true);
  }
}

/**
 * Test seam for proving single-use handoff without starting a real engine.
 * The fixed wrapper below injects only the real test-core factories.
 */
export function createFloodgateV7CleanRoomParentCoordinatorCoreForTests(
  capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
  dependenciesValue: FloodgateV7CleanRoomTeacherRuntimeDependenciesForTests,
): Promise<FloodgateV7ProductionParentCoordinator> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new FloodgateV7CleanRoomTeacherPreparationError("capability", true),
    );
  }
  return createParentCoordinatorFromPreparedCapability(
    capability,
    dependenciesValue,
    testPreparedPlans,
  );
}

/** Create the real stable + YaneuraOu test-core coordinator after preparation. */
export function createFloodgateV7CleanRoomParentCoordinator(
  capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
): Promise<FloodgateV7ProductionParentCoordinator> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new FloodgateV7CleanRoomTeacherPreparationError("capability", true),
    );
  }
  return createParentCoordinatorFromPreparedCapability(
    capability,
    FIXED_RUNTIME_DEPENDENCIES,
    fixedPreparedPlans,
  );
}

/**
 * Consume one test-prepared capability and execute only the source/test gate
 * owner. There is deliberately no fixed-capability or package-command wrapper:
 * merge alone cannot read private inputs, start a teacher, or write a
 * checkpoint.
 */
export function runFloodgateV7CleanRoomTeacherGatesCoreForTests(
  capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
  dependenciesValue: FloodgateV7CleanRoomRunGateDependenciesForTests,
): Promise<Readonly<FloodgateV7CleanRoomRunGatesReceipt>> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new FloodgateV7CleanRoomRunGateError("capture", false),
    );
  }
  let plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  try {
    // Validate immutable callbacks before consuming the one-shot capability.
    assertFloodgateV7CleanRoomRunGateDependenciesCoreForTests(
      dependenciesValue,
    );
    plan = lookupPreparedPlan(capability, testPreparedPlans);
    consumePreparedPlan(capability, testPreparedPlans);
  } catch {
    return Promise.reject(
      new FloodgateV7CleanRoomRunGateError("capture", false),
    );
  }
  const grant = mintPreparedRunGrantForTests(plan);
  return runFloodgateV7CleanRoomRunGatesFromPreparedGrantCoreForTests(
    grant,
    dependenciesValue,
  );
}
