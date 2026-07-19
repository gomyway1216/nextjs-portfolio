/**
 * Explicit, local-only operational owner for one clean-room Floodgate v7
 * teacher run.
 *
 * Importing this module does nothing. The sole fixed entry point is
 * argumentless and is reached only by the dedicated package command. It
 * prepares the fixed home-external clean room, checks capacity both before
 * preparation and before checkpointing, advances one authenticated work
 * stream through 100 -> 500 -> 24,000, and writes a private handoff only
 * after the sealed chain validates.
 *
 * There is no AWS, Cloud Functions, Firebase, Vercel, production-worktree,
 * production-connector, cloud credential, network, live-weight, optimizer,
 * match, or activation dependency in this module. The checkpoint stream uses
 * the existing fixed per-user deployment-key authority on this Mac; the
 * separate random local integrity key authenticates only private orchestration
 * receipts and the finalizer handoff.
 */

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
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
import { createFloodgateStableWasmReusableProposalPool } from "./floodgate-stable-wasm-proposer";
import {
  authorizeFloodgateTeacherStage,
  type FloodgateTeacherStageAuthorizationOptions,
} from "./floodgate-teacher-stage-authorization";
import {
  withVerifiedPinnedFloodgateTrainingRows,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingRowConsumerOptions,
} from "./floodgate-training-row-consumer";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  prepareFloodgateV7DeploymentTeacherCheckpointV3Key,
  type FloodgateV7DeploymentTeacherRunBinding,
} from "./floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES,
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB,
  FloodgateV7CleanRoomRunGateError,
  claimFloodgateV7CleanRoomRunGateCoreForTests,
  statfsFloodgateV7CleanRoomRunGateCoreForTests,
  type FloodgateV7CleanRoomLocalRunGateDependencies,
  type FloodgateV7CleanRoomRunGateCapabilityForTests,
  type FloodgateV7CleanRoomRunGatesReceipt,
} from "./floodgate-v7-clean-room-run-gates";
import {
  FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
  FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
  FLOODGATE_V7_PREPARATION_FAILURE_KINDS,
  FloodgateV7CleanRoomTeacherPreparationError,
  captureFloodgateV7CleanRoomEngineSpawnCoreForTests,
  prepareFloodgateV7CleanRoomTeacherRun,
  runFloodgateV7CleanRoomTeacherGates,
  type FloodgateV7CleanRoomTeacherPreparationFailureKind,
  type FloodgateV7CleanRoomTeacherPreparationReceipt,
  type FloodgateV7CleanRoomTeacherPreparedCapability,
} from "./floodgate-v7-clean-room-teacher-runner";
import type { FloodgateV7ProductionRuntimeOwnerCoreDependencies } from "./floodgate-v7-production-runtime-owner";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  checkpointFloodgateV7TeacherParentsV3,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TeacherCheckpointV3Receipt,
} from "./floodgate-v7-teacher-checkpoint";
import { SHOGI_WASM_BASE64 } from "../src/components/game/ShogiImproved/wasm/shogiWasmBase64";

export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-runner-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_STATUS =
  "explicit-local-clean-room-three-gate-stream-sealed-finalizer-handoff-ready" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CLAIM_BOUNDARY =
  "explicit-argumentless-package-command-fixed-local-input-copy-and-verification-fresh-20-gib-preflight-fixed-current-user-local-deployment-checkpoint-key-one-separate-local-integrity-key-one-stage-stream-exact-100-500-24000-gates-private-run-binding-bound-completion-receipts-and-sealed-finalizer-handoff-not-label-finalization-training-weight-match-live-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-test-runner-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_STATUS =
  "test-only-injected-orchestration-complete-not-operational-evidence" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CLAIM_BOUNDARY =
  "test-only-injected-opaque-operations-and-synthetic-receipts-not-private-copy-teacher-checkpoint-finalizer-or-operational-evidence" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_COMPLETION_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-operational-completion-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID =
  "shogi-floodgate-v7-local-clean-room-integrity-v1" as const;
/** Backward-compatible name for the private handoff-integrity key, not the checkpoint key. */
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_KEY_ID =
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_PACKAGE_SCRIPT =
  "shogi:floodgate-v7-local-clean-room-teacher" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME =
  "floodgate-v7-local-clean-room-stage-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME =
  "floodgate-v7-local-clean-room-training-labels-v1" as const;

const LOCAL_STATE_BASENAME = "local-run-v1";
const LOCAL_INTEGRITY_KEY_FILENAME = "local-integrity-key.bin";
const LOCAL_CONTROL_FILENAME = "run-control.json";
const LOCAL_HANDOFF_FILENAME = "finalizer-handoff.json";
const LOCAL_KEY_BYTES = 32;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MODE_MASK = BigInt(0o7777);
const PRIVATE_RECEIPT_HMAC_DOMAIN =
  "shogi-floodgate-v7-local-clean-room-private-receipt-v1\0";
const FINALIZER_HANDOFF_HMAC_DOMAIN =
  "shogi-floodgate-v7-local-clean-room-finalizer-handoff-v1\0";
const RECEIPT_FILENAMES = Object.freeze({
  [FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100]:
    "completion-prefix-100.json",
  [FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500]:
    "completion-prefix-500.json",
  [FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000]:
    "completion-final-24000.json",
} as const);
const GATE_ORDER = Object.freeze([
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
] as const);
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const operationalCompletionReceipts = new WeakMap<
  object,
  Readonly<FloodgateV7LocalCleanRoomTeacherRunnerReceipt>
>();

export type FloodgateV7LocalCleanRoomTeacherRunnerPhase =
  | "capture"
  | "capacity"
  | "preparation"
  | "gate-session"
  | "durable-prefix-100"
  | "durable-prefix-500"
  | "sealed-final-24000"
  | "finalizer-handoff"
  | "receipt";

function safePreparationFailureKind(
  value: unknown,
): FloodgateV7CleanRoomTeacherPreparationFailureKind {
  return (
    FLOODGATE_V7_PREPARATION_FAILURE_KINDS as readonly unknown[]
  ).includes(value)
    ? (value as FloodgateV7CleanRoomTeacherPreparationFailureKind)
    : "phase-level";
}

export class FloodgateV7LocalCleanRoomTeacherRunnerError extends Error {
  readonly phase: FloodgateV7LocalCleanRoomTeacherRunnerPhase;
  readonly failure_kind: FloodgateV7CleanRoomTeacherPreparationFailureKind;
  readonly clean_room_may_exist: boolean;
  readonly checkpoint_may_exist: boolean;
  readonly retry_disposition:
    | "fresh-absent-clean-room-required"
    | "manual-clean-room-reconciliation-required";
  readonly sensitive_values_disclosed = false as const;

  constructor(
    phase: FloodgateV7LocalCleanRoomTeacherRunnerPhase,
    cleanRoomMayExist: boolean,
    checkpointMayExist: boolean,
    failureKindValue: unknown = "phase-level",
  ) {
    super("Floodgate v7 local clean-room teacher runner failed");
    this.name = "FloodgateV7LocalCleanRoomTeacherRunnerError";
    this.phase = phase;
    this.failure_kind = safePreparationFailureKind(failureKindValue);
    this.clean_room_may_exist = cleanRoomMayExist;
    this.checkpoint_may_exist = checkpointMayExist;
    this.retry_disposition =
      cleanRoomMayExist || checkpointMayExist
        ? "manual-clean-room-reconciliation-required"
        : "fresh-absent-clean-room-required";
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: `${this.name}: ${this.message}`,
    });
    Object.freeze(this);
  }
}

export interface FloodgateV7LocalCleanRoomPrivateFileEvidence {
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateV7LocalCleanRoomFinalizerHandoffEvidence extends FloodgateV7LocalCleanRoomPrivateFileEvidence {
  readonly created_after_validated_sealed_chain: true;
  readonly finalizer_invoked: false;
  readonly finalizer_labels_published: false;
}

export interface FloodgateV7LocalCleanRoomTeacherRunnerReceipt {
  readonly contract: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CLAIM_BOUNDARY;
  readonly execution_boundary: "explicit-local-only-argumentless-package-command";
  readonly stack_boundary: Readonly<{
    readonly web_deployment: "Vercel-not-used-by-this-runner";
    readonly application_backend: "Firebase-GCP-not-used-by-this-runner";
    readonly teacher_training_and_ab: "local-machine";
    readonly aws_required: false;
    readonly aws_used: false;
    readonly network_used: false;
    readonly cloud_credentials_used: false;
    readonly local_deployment_key_authority_used: true;
    readonly production_worktree_used: false;
  }>;
  readonly preparation: Readonly<{
    readonly fixed_clean_room: true;
    readonly pinned_verifier_revision: typeof FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION;
    readonly copy_by_value_revalidated: true;
    readonly role_bundle_verified: true;
    readonly teacher_assets_verified: true;
  }>;
  readonly capacity: Readonly<{
    readonly minimum_free_gib: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB;
    readonly checked_before_private_copy: true;
    readonly checked_again_before_teacher_process: true;
    readonly exact_available_bytes_published: false;
  }>;
  readonly gates: FloodgateV7CleanRoomRunGatesReceipt["gates"];
  readonly completion_receipts: Readonly<{
    readonly count: 3;
    readonly private: true;
    readonly exact_run_key_and_stage_continuity_verified: true;
  }>;
  readonly finalizer_handoff: Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence>;
  readonly nonclaims: Readonly<{
    readonly label_finalized: false;
    readonly optimizer_training: false;
    readonly candidate_selected: false;
    readonly formal_ab: false;
    readonly external_calibration: false;
    readonly live_weight_read_or_write: false;
    readonly live_evaluation_activation: false;
    readonly playing_strength: false;
    readonly stable_high_dan: false;
  }>;
}

export interface FloodgateV7LocalCleanRoomTeacherTestRunnerReceipt {
  readonly contract: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CLAIM_BOUNDARY;
  readonly execution_boundary: "test-only-injected-opaque-operations";
  readonly operational_evidence: false;
  readonly gates: FloodgateV7CleanRoomRunGatesReceipt["gates"];
  readonly finalizer_handoff_observed: true;
  readonly nonclaims: Readonly<{
    readonly private_source_read: false;
    readonly teacher_process: false;
    readonly operational_checkpoint: false;
    readonly finalizer_published: false;
    readonly optimizer_training: false;
    readonly live_weight_read_or_write: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7LocalCleanRoomTeacherOperationalCompletion {
  readonly contract: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_COMPLETION_CONTRACT;
  readonly execution_boundary: "one-shot-internal-real-local-run-completion";
}

interface FixedTargets {
  readonly verifierRepository: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly roleBundleRoot: string;
  readonly legacyProtectedPositionIdsPath: string;
  readonly assetRoot: string;
  readonly snapshotParent: string;
  readonly publicationParent: string;
  readonly stateRoot: string;
  readonly localStateRoot: string;
}

interface LocalGateSession {
  readonly dependencies: Readonly<FloodgateV7CleanRoomLocalRunGateDependencies>;
  readonly finalizerHandoffEvidence: () =>
    Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence> | undefined;
  readonly close: () => void;
}

interface FloodgateV7LocalCleanRoomTeacherCompletedComposition {
  readonly preparation: Readonly<FloodgateV7CleanRoomTeacherPreparationReceipt>;
  readonly gates: Readonly<FloodgateV7CleanRoomRunGatesReceipt>;
  readonly handoff: Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence>;
}

export interface FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests {
  readonly preflightCapacity: () => Promise<void>;
  readonly prepare: () => Promise<
    Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>
  >;
  readonly runGates: (
    capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
  ) => Promise<
    Readonly<{
      readonly receipt: Readonly<FloodgateV7CleanRoomRunGatesReceipt>;
      readonly handoff: Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence>;
    }>
  >;
}

function targets(): Readonly<FixedTargets> {
  const verifierRepository = path.join(
    FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
    "verifier",
    "accepted-e8a9197",
  );
  const stateRoot = path.join(FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT, "state");
  return Object.freeze({
    verifierRepository,
    rawLockRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "inputs",
      "raw-lock",
    ),
    roleLockRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "inputs",
      "role-lock",
    ),
    roleBundleRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "inputs",
      "role-bundle",
    ),
    legacyProtectedPositionIdsPath: path.join(
      verifierRepository,
      "ml",
      "data",
      "wcsc36",
      "int16-aware-replay-excluded-position-ids.txt",
    ),
    assetRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "assets",
      "teacher",
    ),
    snapshotParent: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "runtime",
      "snapshots",
    ),
    publicationParent: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "publication",
    ),
    stateRoot,
    localStateRoot: path.join(stateRoot, LOCAL_STATE_BASENAME),
  });
}

function canonicalJson(value: unknown): string {
  const active = new WeakSet<object>();
  const encode = (candidate: unknown): string => {
    if (candidate === null) return "null";
    if (typeof candidate === "string" || typeof candidate === "boolean") {
      return JSON.stringify(candidate);
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        throw new Error("canonical JSON number differs");
      }
      return JSON.stringify(candidate);
    }
    if (typeof candidate !== "object" || nodeUtilTypes.isProxy(candidate)) {
      throw new Error("canonical JSON value differs");
    }
    if (active.has(candidate)) {
      throw new Error("canonical JSON cycle differs");
    }
    active.add(candidate);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (Array.isArray(candidate)) {
        if (
          Object.getPrototypeOf(candidate) !== Array.prototype ||
          Reflect.ownKeys(descriptors).length !== candidate.length + 1 ||
          !Object.hasOwn(descriptors, "length")
        ) {
          throw new Error("canonical JSON array differs");
        }
        const encoded: string[] = [];
        for (let index = 0; index < candidate.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            !descriptor.enumerable
          ) {
            throw new Error("canonical JSON array entry differs");
          }
          encoded.push(encode(descriptor.value));
        }
        return `[${encoded.join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(candidate);
      const keys = Reflect.ownKeys(descriptors);
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        keys.some((key) => typeof key !== "string")
      ) {
        throw new Error("canonical JSON object differs");
      }
      return `{${(keys as string[])
        .sort((left, right) =>
          Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
        )
        .map((key) => {
          const descriptor = descriptors[key];
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            !descriptor.enumerable
          ) {
            throw new Error("canonical JSON object field differs");
          }
          return `${JSON.stringify(key)}:${encode(descriptor.value)}`;
        })
        .join(",")}}`;
    } finally {
      active.delete(candidate);
    }
  };
  return encode(value);
}

/** Exercise the fail-closed canonical JSON boundary without file or HMAC I/O. */
export function canonicalizeFloodgateV7LocalCleanRoomJsonCoreForTests(
  value: unknown,
): string {
  if (arguments.length !== 1) {
    throw new Error("canonical JSON test seam differs");
  }
  return canonicalJson(value);
}

function deepFreezeCanonicalJson<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeCanonicalJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(
  key: Uint8Array,
  domain: string,
  value: Readonly<Record<string, unknown>>,
): string {
  return createHmac("sha256", key)
    .update(domain, "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

async function assertPrivateDirectory(directory: string): Promise<void> {
  const stat = await fs.promises.lstat(directory, { bigint: true });
  if (
    (await fs.promises.realpath(directory)) !== directory ||
    !stat.isDirectory() ||
    typeof process.geteuid !== "function" ||
    stat.uid !== BigInt(process.geteuid()) ||
    (stat.mode & MODE_MASK) !== BigInt(PRIVATE_DIRECTORY_MODE)
  ) {
    throw new Error("private directory differs");
  }
}

async function syncPrivateDirectory(directory: string): Promise<void> {
  if (typeof process.geteuid !== "function") {
    throw new Error("private directory owner is unavailable");
  }
  const effectiveUserId = process.geteuid();
  const handle = await fs.promises.open(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    const before = await handle.stat({ bigint: true });
    assertHeldParentStat(before, effectiveUserId);
    await assertParentPathIdentity(directory, before, effectiveUserId);
    await handle.sync();
    const after = await handle.stat({ bigint: true });
    await assertParentPathIdentity(directory, after, effectiveUserId);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.uid !== after.uid ||
      before.mode !== after.mode
    ) {
      throw new Error("private directory changed during sync");
    }
  } finally {
    await handle.close();
  }
}

function sameFileStat(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.uid === right.uid &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs
  );
}

function assertHeldParentStat(
  stat: fs.BigIntStats,
  effectiveUserId: number,
): void {
  if (
    !stat.isDirectory() ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_MASK) !== BigInt(PRIVATE_DIRECTORY_MODE)
  ) {
    throw new Error("private parent directory differs");
  }
}

function assertHeldFileStat(
  stat: fs.BigIntStats,
  effectiveUserId: number,
  bytes: number,
): void {
  if (
    !stat.isFile() ||
    stat.uid !== BigInt(effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    (stat.mode & MODE_MASK) !== BigInt(PRIVATE_FILE_MODE) ||
    stat.size !== BigInt(bytes)
  ) {
    throw new Error("private file descriptor differs");
  }
}

async function assertParentPathIdentity(
  directory: string,
  held: fs.BigIntStats,
  effectiveUserId: number,
): Promise<void> {
  const pathStat = await fs.promises.lstat(directory, { bigint: true });
  if (
    (await fs.promises.realpath(directory)) !== directory ||
    pathStat.dev !== held.dev ||
    pathStat.ino !== held.ino ||
    pathStat.uid !== held.uid ||
    pathStat.mode !== held.mode ||
    !pathStat.isDirectory()
  ) {
    throw new Error("private parent path identity differs");
  }
  assertHeldParentStat(pathStat, effectiveUserId);
}

async function assertFilePathIdentity(
  filename: string,
  held: fs.BigIntStats,
  effectiveUserId: number,
  bytes: number,
): Promise<fs.BigIntStats> {
  const pathStat = await fs.promises.lstat(filename, { bigint: true });
  if (
    (await fs.promises.realpath(filename)) !== filename ||
    pathStat.dev !== held.dev ||
    pathStat.ino !== held.ino
  ) {
    throw new Error("private file path identity differs");
  }
  assertHeldFileStat(pathStat, effectiveUserId, bytes);
  return pathStat;
}

async function readHeldFile(
  handle: fs.promises.FileHandle,
  bytes: number,
): Promise<Buffer> {
  const output = Buffer.alloc(bytes);
  let offset = 0;
  while (offset < output.byteLength) {
    const { bytesRead } = await handle.read(
      output,
      offset,
      output.byteLength - offset,
      offset,
    );
    if (bytesRead === 0) {
      output.fill(0);
      throw new Error("private file shortened while reading");
    }
    offset += bytesRead;
  }
  const extra = Buffer.alloc(1);
  const { bytesRead: extraBytes } = await handle.read(extra, 0, 1, offset);
  extra.fill(0);
  if (extraBytes !== 0) {
    output.fill(0);
    throw new Error("private file grew while reading");
  }
  return output;
}

export type FloodgateV7LocalCleanRoomPrivateWriterRaceHookForTests =
  () => void | Promise<void>;

async function writePrivateFile(
  filename: string,
  bytes: Uint8Array,
  afterInitialIdentityForTests?: FloodgateV7LocalCleanRoomPrivateWriterRaceHookForTests,
): Promise<Readonly<FloodgateV7LocalCleanRoomPrivateFileEvidence>> {
  const effectiveUserId =
    typeof process.geteuid === "function" ? process.geteuid() : undefined;
  if (
    effectiveUserId === undefined ||
    !path.isAbsolute(filename) ||
    path.resolve(filename) !== filename ||
    bytes.byteLength === 0 ||
    nodeUtilTypes.isProxy(bytes) ||
    (afterInitialIdentityForTests !== undefined &&
      (typeof afterInitialIdentityForTests !== "function" ||
        nodeUtilTypes.isProxy(afterInitialIdentityForTests) ||
        afterInitialIdentityForTests.length !== 0))
  ) {
    throw new Error("private writer input differs");
  }
  const parent = path.dirname(filename);
  const parentHandle = await fs.promises.open(
    parent,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  let handle: fs.promises.FileHandle | undefined;
  let heldBytes: Buffer | undefined;
  let finalBytes: Buffer | undefined;
  try {
    const parentBefore = await parentHandle.stat({ bigint: true });
    assertHeldParentStat(parentBefore, effectiveUserId);
    await assertParentPathIdentity(parent, parentBefore, effectiveUserId);
    try {
      await fs.promises.lstat(filename);
      throw new Error("private file already exists");
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
    handle = await fs.promises.open(
      filename,
      fs.constants.O_RDWR |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      PRIVATE_FILE_MODE,
    );
    await handle.chmod(PRIVATE_FILE_MODE);
    await handle.writeFile(bytes);
    await handle.sync();
    const heldBefore = await handle.stat({ bigint: true });
    assertHeldFileStat(heldBefore, effectiveUserId, bytes.byteLength);
    heldBytes = await readHeldFile(handle, bytes.byteLength);
    if (sha256(heldBytes) !== sha256(bytes)) {
      throw new Error("private held file bytes differ");
    }
    const pathBefore = await assertFilePathIdentity(
      filename,
      heldBefore,
      effectiveUserId,
      bytes.byteLength,
    );
    if (!sameFileStat(heldBefore, pathBefore)) {
      throw new Error("private file path stat differs");
    }
    await afterInitialIdentityForTests?.();
    const heldAfter = await handle.stat({ bigint: true });
    finalBytes = await readHeldFile(handle, bytes.byteLength);
    const pathAfter = await assertFilePathIdentity(
      filename,
      heldAfter,
      effectiveUserId,
      bytes.byteLength,
    );
    const parentAfter = await parentHandle.stat({ bigint: true });
    assertHeldParentStat(parentAfter, effectiveUserId);
    await assertParentPathIdentity(parent, parentAfter, effectiveUserId);
    await parentHandle.sync();
    const heldFinal = await handle.stat({ bigint: true });
    const parentFinal = await parentHandle.stat({ bigint: true });
    const pathFinal = await assertFilePathIdentity(
      filename,
      heldFinal,
      effectiveUserId,
      bytes.byteLength,
    );
    await assertParentPathIdentity(parent, parentFinal, effectiveUserId);
    if (
      !sameFileStat(heldBefore, heldAfter) ||
      !sameFileStat(heldAfter, pathAfter) ||
      !sameFileStat(heldAfter, heldFinal) ||
      !sameFileStat(heldFinal, pathFinal) ||
      parentBefore.dev !== parentAfter.dev ||
      parentBefore.ino !== parentAfter.ino ||
      parentAfter.dev !== parentFinal.dev ||
      parentAfter.ino !== parentFinal.ino ||
      sha256(finalBytes) !== sha256(bytes)
    ) {
      throw new Error("private file or parent changed during publication");
    }
    return Object.freeze({
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  } finally {
    heldBytes?.fill(0);
    finalBytes?.fill(0);
    const closes = await Promise.allSettled([
      handle?.close() ?? Promise.resolve(),
      parentHandle.close(),
    ]);
    const failures = closes.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length !== 0) {
      throw new AggregateError(failures, "private writer close failed");
    }
  }
}

/** Exercise the held-descriptor private writer without any teacher process. */
export function writeFloodgateV7LocalCleanRoomPrivateFileCoreForTests(
  filename: string,
  bytes: Uint8Array,
  afterInitialIdentityForTests?: FloodgateV7LocalCleanRoomPrivateWriterRaceHookForTests,
): Promise<Readonly<FloodgateV7LocalCleanRoomPrivateFileEvidence>> {
  if (arguments.length !== 2 && arguments.length !== 3) {
    return Promise.reject(new Error("private writer test seam differs"));
  }
  return writePrivateFile(filename, bytes, afterInitialIdentityForTests);
}

async function writePrivateCanonicalJson(
  filename: string,
  value: Readonly<Record<string, unknown>>,
): Promise<Readonly<FloodgateV7LocalCleanRoomPrivateFileEvidence>> {
  const bytes = Buffer.from(`${canonicalJson(value)}\n`, "utf8");
  try {
    return await writePrivateFile(filename, bytes);
  } finally {
    bytes.fill(0);
  }
}

async function preflightFreshCapacity(): Promise<void> {
  try {
    await fs.promises.lstat(FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT);
    throw new FloodgateV7LocalCleanRoomTeacherRunnerError(
      "capacity",
      true,
      true,
    );
  } catch (error) {
    if (
      error instanceof FloodgateV7LocalCleanRoomTeacherRunnerError ||
      error === null ||
      typeof error !== "object" ||
      !("code" in error) ||
      Reflect.get(error, "code") !== "ENOENT"
    ) {
      throw error;
    }
  }
  const probe = await statfsFloodgateV7CleanRoomRunGateCoreForTests(
    path.dirname(FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT),
  );
  if (
    probe.bsize <= BigInt(0) ||
    probe.bavail < BigInt(0) ||
    probe.bsize * probe.bavail <
      FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES
  ) {
    throw new FloodgateV7LocalCleanRoomTeacherRunnerError(
      "capacity",
      false,
      false,
    );
  }
}

function runtimeOwnerDependencies(
  fixed: Readonly<FixedTargets>,
): Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies> {
  const stableAssetProvider = <TResult>(
    callback: FloodgateProductionStableRuntimeAssetsCallback<
      TResult,
      "test-only-injected-expected-registry-and-root"
    >,
  ): Promise<TResult> =>
    withVerifiedPinnedFloodgateProductionStableRuntimeAssetsCoreForTests(
      FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
      fixed.assetRoot,
      {
        effectiveUserId: process.geteuid!(),
        embeddedWasmBase64: SHOGI_WASM_BASE64,
      },
      callback,
    );
  return Object.freeze({
    createStableRuntime: () =>
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: stableAssetProvider,
        poolFactory: createFloodgateStableWasmReusableProposalPool,
      }),
    createTeacherRuntime: () =>
      createFloodgateProductionTeacherUsiRuntimeCoreForTests({
        assetRoot: fixed.assetRoot,
        snapshotParent: fixed.snapshotParent,
        effectiveUserId: process.geteuid!(),
        verifyAssets: () =>
          verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
            FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
            fixed.assetRoot,
            {
              effectiveUserId: process.geteuid!(),
              embeddedWasmBase64: SHOGI_WASM_BASE64,
            },
          ),
        spawnEngine: (file, args, options) => {
          const contract = captureFloodgateV7CleanRoomEngineSpawnCoreForTests(
            file,
            args,
            options,
            fixed.snapshotParent,
          );
          return spawn(contract.file, [...contract.arguments], {
            ...contract.options,
            env: { ...contract.options.env } as unknown as NodeJS.ProcessEnv,
          });
        },
        engineCount: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
        depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
      }),
    getStableRuntimeReceiptDigest: (
      runtime: Parameters<
        FloodgateV7ProductionRuntimeOwnerCoreDependencies["getStableRuntimeReceiptDigest"]
      >[0],
    ) =>
      getFloodgateProductionStableWasmRuntimeReceiptDigestCoreForTests(
        runtime as Parameters<
          typeof getFloodgateProductionStableWasmRuntimeReceiptDigestCoreForTests
        >[0],
      ),
    getTeacherRuntimeReceiptDigest: (
      runtime: Parameters<
        FloodgateV7ProductionRuntimeOwnerCoreDependencies["getTeacherRuntimeReceiptDigest"]
      >[0],
    ) =>
      getFloodgateProductionTeacherUsiRuntimeReceiptDigestCoreForTests(
        runtime as Parameters<
          typeof getFloodgateProductionTeacherUsiRuntimeReceiptDigestCoreForTests
        >[0],
      ),
  });
}

function stageAuthorization(
  fixed: Readonly<FixedTargets>,
): Readonly<FloodgateTeacherStageAuthorizationOptions> {
  return Object.freeze({
    repositoryRoot: fixed.verifierRepository,
    rawLockRoot: fixed.rawLockRoot,
    roleLockRoot: fixed.roleLockRoot,
    roleBundleRoot: fixed.roleBundleRoot,
    legacyProtectedPositionIdsPath: fixed.legacyProtectedPositionIdsPath,
    publicationParent: fixed.publicationParent,
    stageBasename: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
    destinationBasename:
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
    engineBin: path.join(fixed.assetRoot, "engine", "yaneuraou"),
    engineReceipt: path.join(
      fixed.assetRoot,
      "engine",
      "yaneuraou-receipt.json",
    ),
    engineArgs: Object.freeze([]),
    evalDir: path.join(fixed.assetRoot, "eval"),
  });
}

function consumerOptions(
  fixed: Readonly<FixedTargets>,
): Readonly<FloodgateTrainingRowConsumerOptions> {
  return Object.freeze({
    repositoryRoot: fixed.verifierRepository,
    verifierRevision: FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
    rawLockRoot: fixed.rawLockRoot,
    roleLockRoot: fixed.roleLockRoot,
    legacyProtectedPositionIdsPath: fixed.legacyProtectedPositionIdsPath,
    outputRoot: fixed.roleBundleRoot,
  });
}

function completionPayload(
  receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
  order: number,
  runBinding: Readonly<FloodgateV7DeploymentTeacherRunBinding>,
  runBindingSha256: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: "shogi-floodgate-v7-local-clean-room-gate-completion-v1",
    status: "authenticated-local-clean-room-gate-complete",
    execution_boundary: "local-machine-only",
    order,
    gate: receipt.gate,
    run_id: receipt.run_id,
    key_id: receipt.key_id,
    integrity_key_id: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
    run_binding: runBinding,
    run_binding_sha256: runBindingSha256,
    stage: Object.freeze({
      basename: receipt.stage.basename,
      parent_dev: receipt.stage.parent_dev,
      parent_ino: receipt.stage.parent_ino,
      dev: receipt.stage.dev,
      ino: receipt.stage.ino,
    }),
    work: Object.freeze({
      filename: receipt.work.filename,
      bytes: receipt.work.bytes,
      sha256: receipt.work.sha256,
      target_parents: receipt.work.target_parents,
      completed_parents: receipt.work.completed_parents,
      resumed_parents: receipt.work.resumed_parents,
      records: receipt.work.records,
      sealed: receipt.sealed,
      milestone_100_mac: receipt.work.milestone_100_mac,
      milestone_500_mac: receipt.work.milestone_500_mac,
    }),
    external_services: Object.freeze({
      network: false,
      aws: false,
      firebase_gcp: false,
      vercel: false,
    }),
  });
}

async function withLocalCheckpointLeaseOwnership<T>(
  closeUntransferredLease: () => Promise<void>,
  operation: (transferOwnershipToCheckpoint: () => void) => Promise<T>,
): Promise<T> {
  let checkpointOwnsLease = false;
  const transferOwnershipToCheckpoint = (): void => {
    if (checkpointOwnsLease) {
      throw new Error("local checkpoint lease ownership transferred twice");
    }
    checkpointOwnsLease = true;
  };
  try {
    return await operation(transferOwnershipToCheckpoint);
  } catch (error) {
    if (!checkpointOwnsLease) {
      try {
        await closeUntransferredLease();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          "local checkpoint preparation and stage cleanup failed",
        );
      }
    }
    throw error;
  }
}

/**
 * Dynamic test seam for the exact lease-transfer helper used by the real
 * local runner. It exposes no stage, row, key, checkpoint, or path authority.
 */
export function runFloodgateV7LocalCheckpointLeaseOwnershipCoreForTests(
  closeUntransferredLease: () => Promise<void>,
  prepareCheckpointKey: () => Promise<void>,
  invokeCheckpoint: () => Promise<void>,
): Promise<void> {
  if (
    arguments.length !== 3 ||
    typeof closeUntransferredLease !== "function" ||
    typeof prepareCheckpointKey !== "function" ||
    typeof invokeCheckpoint !== "function" ||
    nodeUtilTypes.isProxy(closeUntransferredLease) ||
    nodeUtilTypes.isProxy(prepareCheckpointKey) ||
    nodeUtilTypes.isProxy(invokeCheckpoint) ||
    closeUntransferredLease.length !== 0 ||
    prepareCheckpointKey.length !== 0 ||
    invokeCheckpoint.length !== 0
  ) {
    return Promise.reject(
      new Error("local checkpoint lease test operations differ"),
    );
  }
  return withLocalCheckpointLeaseOwnership(
    closeUntransferredLease,
    async (transferOwnershipToCheckpoint): Promise<void> => {
      await prepareCheckpointKey();
      transferOwnershipToCheckpoint();
      await invokeCheckpoint();
    },
  );
}

function createLocalGateSession(): Readonly<LocalGateSession> {
  if (typeof process.geteuid !== "function") {
    throw new FloodgateV7LocalCleanRoomTeacherRunnerError(
      "gate-session",
      true,
      false,
    );
  }
  const fixed = targets();
  const checkpointReceiptClaims = new WeakSet<object>();
  let integrityKey: Buffer | undefined;
  let runId: string | undefined;
  let runBinding: Readonly<FloodgateV7DeploymentTeacherRunBinding> | undefined;
  let runBindingCanonical: string | undefined;
  let runBindingSha256: string | undefined;
  let handoff:
    Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence> | undefined;
  const receipts: Readonly<FloodgateV7TeacherCheckpointV3Receipt>[] = [];
  const receiptFiles: Readonly<FloodgateV7LocalCleanRoomPrivateFileEvidence>[] =
    [];

  function bindExactRunBinding(
    candidate: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
  ): void {
    const canonical = canonicalJson(candidate);
    const digest = sha256(canonical);
    if (runBindingCanonical !== undefined) {
      if (runBindingCanonical !== canonical || runBindingSha256 !== digest) {
        throw new Error("local run binding changed between gates");
      }
      return;
    }
    const captured = JSON.parse(
      canonical,
    ) as FloodgateV7DeploymentTeacherRunBinding;
    runBinding = deepFreezeCanonicalJson(captured);
    runBindingCanonical = canonical;
    runBindingSha256 = digest;
  }

  async function initializePrivateState(expectedRunId: string): Promise<void> {
    if (integrityKey !== undefined) {
      if (runId !== expectedRunId) throw new Error("local run id changed");
      return;
    }
    if (
      runBinding === undefined ||
      runBindingCanonical === undefined ||
      runBindingSha256 === undefined
    ) {
      throw new Error("local run binding is unavailable");
    }
    await assertPrivateDirectory(fixed.stateRoot);
    await fs.promises.mkdir(fixed.localStateRoot, {
      mode: PRIVATE_DIRECTORY_MODE,
    });
    await fs.promises.chmod(fixed.localStateRoot, PRIVATE_DIRECTORY_MODE);
    await assertPrivateDirectory(fixed.localStateRoot);
    await syncPrivateDirectory(fixed.stateRoot);
    const candidate = randomBytes(LOCAL_KEY_BYTES);
    try {
      await writePrivateFile(
        path.join(fixed.localStateRoot, LOCAL_INTEGRITY_KEY_FILENAME),
        candidate,
      );
      const controlPayload = Object.freeze({
        schema: "shogi-floodgate-v7-local-clean-room-run-control-v1",
        status: "active-one-process-three-gate-run",
        run_id: expectedRunId,
        key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
        integrity_key_id:
          FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
        run_binding: runBinding,
        run_binding_sha256: runBindingSha256,
        gate_sequence: GATE_ORDER,
        same_stream_resume: true,
        automatic_cross_process_retry: false,
        local_checkpoint_key_authority: true,
        cloud_credential: false,
        network: false,
        aws: false,
      });
      const control = Object.freeze({
        ...controlPayload,
        control_mac: hmac(
          candidate,
          PRIVATE_RECEIPT_HMAC_DOMAIN,
          controlPayload,
        ),
      });
      await writePrivateCanonicalJson(
        path.join(fixed.localStateRoot, LOCAL_CONTROL_FILENAME),
        control,
      );
      integrityKey = Buffer.from(candidate);
      runId = expectedRunId;
    } finally {
      candidate.fill(0);
    }
  }

  async function executeAuthenticatedCheckpointGate(
    capability: Readonly<FloodgateV7CleanRoomRunGateCapabilityForTests>,
  ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
    const claim = claimFloodgateV7CleanRoomRunGateCoreForTests(capability);
    const expectedGate = GATE_ORDER[receipts.length];
    if (
      claim.gate !== expectedGate ||
      claim.plan.cleanRoomRoot !== FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT
    ) {
      throw new Error("local gate order or root differs");
    }
    bindExactRunBinding(claim.runBinding);
    await initializePrivateState(claim.runId);
    const key = integrityKey;
    if (key === undefined) throw new Error("local integrity key unavailable");
    const exactRunBinding = runBinding;
    const exactRunBindingSha256 = runBindingSha256;
    if (exactRunBinding === undefined || exactRunBindingSha256 === undefined) {
      throw new Error("local run binding is unavailable");
    }
    const lease = await authorizeFloodgateTeacherStage(
      stageAuthorization(fixed),
    );
    let receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt> | undefined;
    await withLocalCheckpointLeaseOwnership(
      () => lease.close(),
      async (transferOwnershipToCheckpoint): Promise<void> => {
        await withVerifiedPinnedFloodgateTrainingRows(
          consumerOptions(fixed),
          async (
            input: Readonly<AuthenticatedFloodgateTrainingRows>,
          ): Promise<void> => {
            const checkpointOptions = Object.freeze({
              gate: claim.gate,
              runId: claim.runId,
              keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
            });
            const authorization =
              await prepareFloodgateV7DeploymentTeacherCheckpointV3Key(
                Object.freeze({
                  ...checkpointOptions,
                  runBinding: exactRunBinding,
                  stageAuthorizationReceipt: lease.receipt,
                }),
              );
            transferOwnershipToCheckpoint();
            receipt = await checkpointFloodgateV7TeacherParentsV3(
              lease,
              input,
              exactRunBinding,
              claim.producerController,
              checkpointOptions,
              authorization,
            );
          },
        );
      },
    );
    if (receipt === undefined) {
      throw new Error("local checkpoint completed without a receipt");
    }
    const payload = completionPayload(
      receipt,
      receipts.length + 1,
      exactRunBinding,
      exactRunBindingSha256,
    );
    const privateReceipt = Object.freeze({
      ...payload,
      receipt_mac: hmac(key, PRIVATE_RECEIPT_HMAC_DOMAIN, payload),
    });
    const evidence = await writePrivateCanonicalJson(
      path.join(fixed.localStateRoot, RECEIPT_FILENAMES[claim.gate]),
      privateReceipt,
    );
    receipts.push(receipt);
    receiptFiles.push(evidence);
    checkpointReceiptClaims.add(receipt);
    return receipt;
  }

  function claimAuthenticatedCheckpointReceipt(
    receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
  ): Readonly<FloodgateV7TeacherCheckpointV3Receipt> {
    if (
      receipt === null ||
      typeof receipt !== "object" ||
      !checkpointReceiptClaims.delete(receipt)
    ) {
      throw new Error("local checkpoint receipt is not exact or is replayed");
    }
    return receipt;
  }

  async function finalizeSealedChainHandoff(): Promise<void> {
    const key = integrityKey;
    const final = receipts[2];
    if (
      key === undefined ||
      runId === undefined ||
      runBinding === undefined ||
      runBindingCanonical === undefined ||
      runBindingSha256 === undefined ||
      receipts.length !== 3 ||
      receiptFiles.length !== 3 ||
      receipts.some((receipt, index) => receipt.gate !== GATE_ORDER[index]) ||
      final?.gate !==
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000 ||
      final.sealed !== true ||
      final.work.completed_parents !== 24_000 ||
      final.work.resumed_parents !== 500
    ) {
      throw new Error("validated sealed chain is unavailable for handoff");
    }
    const payload = Object.freeze({
      schema: "shogi-floodgate-v7-local-clean-room-finalizer-handoff-v1",
      status: "sealed-final-ready-for-separate-local-finalizer",
      claim_boundary:
        "validated-three-gate-local-stream-fixed-current-user-deployment-checkpoint-key-private-handoff-integrity-key-exact-run-binding-and-sealed-work-binding-not-finalized-label-training-weight-match-live-or-strength-evidence",
      run_id: runId,
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      integrity_key_id: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
      local_integrity_key_filename: LOCAL_INTEGRITY_KEY_FILENAME,
      local_integrity_key_is_external_credential: false,
      run_binding: runBinding,
      run_binding_sha256: runBindingSha256,
      stage: Object.freeze({
        basename: final.stage.basename,
        parent_dev: final.stage.parent_dev,
        parent_ino: final.stage.parent_ino,
        dev: final.stage.dev,
        ino: final.stage.ino,
      }),
      work: Object.freeze({
        filename: final.work.filename,
        bytes: final.work.bytes,
        sha256: final.work.sha256,
        parents: final.work.completed_parents,
        records: final.work.records,
        resumed_parents: final.work.resumed_parents,
        sealed: final.sealed,
      }),
      input: Object.freeze({
        verifier_revision: FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
        role: "training",
        parents: 24_000,
      }),
      completion_receipts: Object.freeze(
        GATE_ORDER.map((gate, index) =>
          Object.freeze({
            gate,
            filename: RECEIPT_FILENAMES[gate],
            bytes: receiptFiles[index]?.bytes,
            sha256: receiptFiles[index]?.sha256,
          }),
        ),
      ),
      requirements: Object.freeze({
        separate_explicit_finalizer_command_required: true,
        same_sealed_work_and_key_binding_required: true,
        prefix_100_or_500_finalization_forbidden: true,
      }),
      external_services: Object.freeze({
        network: false,
        aws: false,
        firebase_gcp: false,
        vercel: false,
      }),
      nonclaims: Object.freeze({
        labels_finalized: false,
        optimizer_training: false,
        weight: false,
        live_evaluation_activation: false,
        match: false,
        playing_strength: false,
      }),
    });
    const privateHandoff = Object.freeze({
      ...payload,
      handoff_mac: hmac(key, FINALIZER_HANDOFF_HMAC_DOMAIN, payload),
    });
    const evidence = await writePrivateCanonicalJson(
      path.join(fixed.localStateRoot, LOCAL_HANDOFF_FILENAME),
      privateHandoff,
    );
    handoff = Object.freeze({
      ...evidence,
      created_after_validated_sealed_chain: true as const,
      finalizer_invoked: false as const,
      finalizer_labels_published: false as const,
    });
  }

  const dependencies = Object.freeze({
    statfs: statfsFloodgateV7CleanRoomRunGateCoreForTests,
    runtimeOwnerDependencies: runtimeOwnerDependencies(fixed),
    executeAuthenticatedCheckpointGate,
    observeFailureForTests: undefined,
    expectedCheckpointKeyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    claimAuthenticatedCheckpointReceipt,
    finalizeSealedChainHandoff,
  });
  return Object.freeze({
    dependencies,
    finalizerHandoffEvidence: () => handoff,
    close: () => {
      integrityKey?.fill(0);
      integrityKey = undefined;
    },
  });
}

function captureOperations(
  value: FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests,
): Readonly<FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null) ||
    !Object.isFrozen(value)
  ) {
    throw new Error("local runner operations differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const expected = Object.freeze({
    preflightCapacity: 0,
    prepare: 0,
    runGates: 1,
  } as const);
  if (
    keys.length !== 3 ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !(key in expected) ||
        descriptors[key] === undefined ||
        !("value" in descriptors[key]) ||
        descriptors[key].writable ||
        descriptors[key].configurable ||
        typeof descriptors[key].value !== "function" ||
        nodeUtilTypes.isProxy(descriptors[key].value) ||
        descriptors[key].value.length !==
          expected[key as keyof typeof expected],
    )
  ) {
    throw new Error("local runner operation descriptors differ");
  }
  return value;
}

function buildPublicReceipt(
  preparation: Readonly<FloodgateV7CleanRoomTeacherPreparationReceipt>,
  gates: Readonly<FloodgateV7CleanRoomRunGatesReceipt>,
  handoff: Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence>,
): Readonly<FloodgateV7LocalCleanRoomTeacherRunnerReceipt> {
  if (
    preparation.execution_boundary !==
      "fixed-non-production-home-external-real-test-core-route" ||
    preparation.preparation.copy_by_value_revalidated !== true ||
    gates.gates.length !== 3 ||
    gates.gates.some(
      (gate, index) =>
        gate.gate !== GATE_ORDER[index] ||
        gate.completed_parents !==
          (index === 0 ? 100 : index === 1 ? 500 : 24_000) ||
        gate.resumed_parents !== (index === 0 ? 0 : index === 1 ? 100 : 500),
    ) ||
    handoff.created_after_validated_sealed_chain !== true ||
    handoff.finalizer_invoked !== false
  ) {
    throw new Error("local runner receipt composition differs");
  }
  return Object.freeze({
    contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
    status: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_STATUS,
    claim_boundary: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CLAIM_BOUNDARY,
    execution_boundary:
      "explicit-local-only-argumentless-package-command" as const,
    stack_boundary: Object.freeze({
      web_deployment: "Vercel-not-used-by-this-runner" as const,
      application_backend: "Firebase-GCP-not-used-by-this-runner" as const,
      teacher_training_and_ab: "local-machine" as const,
      aws_required: false as const,
      aws_used: false as const,
      network_used: false as const,
      cloud_credentials_used: false as const,
      local_deployment_key_authority_used: true as const,
      production_worktree_used: false as const,
    }),
    preparation: Object.freeze({
      fixed_clean_room: true as const,
      pinned_verifier_revision:
        FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
      copy_by_value_revalidated: true as const,
      role_bundle_verified: true as const,
      teacher_assets_verified: true as const,
    }),
    capacity: Object.freeze({
      minimum_free_gib: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB,
      checked_before_private_copy: true as const,
      checked_again_before_teacher_process: true as const,
      exact_available_bytes_published: false as const,
    }),
    gates: gates.gates,
    completion_receipts: Object.freeze({
      count: 3 as const,
      private: true as const,
      exact_run_key_and_stage_continuity_verified: true as const,
    }),
    finalizer_handoff: handoff,
    nonclaims: Object.freeze({
      label_finalized: false as const,
      optimizer_training: false as const,
      candidate_selected: false as const,
      formal_ab: false as const,
      external_calibration: false as const,
      live_weight_read_or_write: false as const,
      live_evaluation_activation: false as const,
      playing_strength: false as const,
      stable_high_dan: false as const,
    }),
  });
}

function buildTestReceipt(
  composition: Readonly<FloodgateV7LocalCleanRoomTeacherCompletedComposition>,
): Readonly<FloodgateV7LocalCleanRoomTeacherTestRunnerReceipt> {
  buildPublicReceipt(
    composition.preparation,
    composition.gates,
    composition.handoff,
  );
  return Object.freeze({
    contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT,
    status: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_STATUS,
    claim_boundary:
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CLAIM_BOUNDARY,
    execution_boundary: "test-only-injected-opaque-operations" as const,
    operational_evidence: false as const,
    gates: composition.gates.gates,
    finalizer_handoff_observed: true as const,
    nonclaims: Object.freeze({
      private_source_read: false as const,
      teacher_process: false as const,
      operational_checkpoint: false as const,
      finalizer_published: false as const,
      optimizer_training: false as const,
      live_weight_read_or_write: false as const,
      playing_strength: false as const,
    }),
  });
}

function mintOperationalCompletion(
  receipt: Readonly<FloodgateV7LocalCleanRoomTeacherRunnerReceipt>,
): Readonly<FloodgateV7LocalCleanRoomTeacherOperationalCompletion> {
  const completion = Object.freeze({
    contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_COMPLETION_CONTRACT,
    execution_boundary: "one-shot-internal-real-local-run-completion" as const,
  });
  operationalCompletionReceipts.set(completion, receipt);
  return completion;
}

export function claimFloodgateV7LocalCleanRoomTeacherOperationalCompletion(
  completion: Readonly<FloodgateV7LocalCleanRoomTeacherOperationalCompletion>,
): Readonly<FloodgateV7LocalCleanRoomTeacherRunnerReceipt> {
  if (
    arguments.length !== 1 ||
    completion === null ||
    typeof completion !== "object" ||
    nodeUtilTypes.isProxy(completion) ||
    !Object.isFrozen(completion) ||
    completion.contract !==
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_COMPLETION_CONTRACT ||
    completion.execution_boundary !==
      "one-shot-internal-real-local-run-completion"
  ) {
    throw new FloodgateV7LocalCleanRoomTeacherRunnerError(
      "receipt",
      true,
      true,
    );
  }
  const receipt = operationalCompletionReceipts.get(completion);
  if (
    receipt === undefined ||
    !operationalCompletionReceipts.delete(completion)
  ) {
    throw new FloodgateV7LocalCleanRoomTeacherRunnerError(
      "receipt",
      true,
      true,
    );
  }
  return receipt;
}

async function executeWithOperations(
  operationsValue: FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests,
): Promise<Readonly<FloodgateV7LocalCleanRoomTeacherCompletedComposition>> {
  let phase: FloodgateV7LocalCleanRoomTeacherRunnerPhase = "capture";
  let failureKind: FloodgateV7CleanRoomTeacherPreparationFailureKind =
    "phase-level";
  let cleanRoomMayExist = false;
  let checkpointMayExist = false;
  try {
    const operations = captureOperations(operationsValue);
    phase = "capacity";
    await operations.preflightCapacity();
    phase = "preparation";
    const capability = await operations.prepare();
    cleanRoomMayExist = true;
    phase = "gate-session";
    const result = await operations.runGates(capability);
    checkpointMayExist = true;
    phase = "receipt";
    const composition = Object.freeze({
      preparation: capability.receipt,
      gates: result.receipt,
      handoff: result.handoff,
    });
    buildPublicReceipt(
      composition.preparation,
      composition.gates,
      composition.handoff,
    );
    return composition;
  } catch (error) {
    if (error instanceof FloodgateV7LocalCleanRoomTeacherRunnerError) {
      throw error;
    }
    if (error instanceof FloodgateV7CleanRoomTeacherPreparationError) {
      cleanRoomMayExist = cleanRoomMayExist || error.clean_room_may_exist;
      failureKind = error.failure_kind;
    }
    if (error instanceof FloodgateV7CleanRoomRunGateError) {
      checkpointMayExist = checkpointMayExist || error.work_state_may_exist;
      if (
        error.phase === "durable-prefix-100" ||
        error.phase === "durable-prefix-500" ||
        error.phase === "sealed-final-24000" ||
        error.phase === "finalizer-handoff"
      ) {
        phase = error.phase;
      }
    }
    throw new FloodgateV7LocalCleanRoomTeacherRunnerError(
      phase,
      cleanRoomMayExist,
      checkpointMayExist,
      failureKind,
    );
  }
}

const FIXED_OPERATIONS: Readonly<FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests> =
  Object.freeze({
    preflightCapacity: preflightFreshCapacity,
    prepare: prepareFloodgateV7CleanRoomTeacherRun,
    runGates: async (
      capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
    ) => {
      const session = createLocalGateSession();
      try {
        const receipt = await runFloodgateV7CleanRoomTeacherGates(
          capability,
          session.dependencies,
        );
        const handoff = session.finalizerHandoffEvidence();
        if (handoff === undefined) {
          throw new Error("local finalizer handoff evidence is absent");
        }
        return Object.freeze({ receipt, handoff });
      } finally {
        session.close();
      }
    },
  });

/**
 * Test-only injected orchestration. It never receives paths, keys, rows, or a
 * teacher producer; those remain behind the supplied opaque operations.
 */
export function runFloodgateV7LocalCleanRoomTeacherCoreForTests(
  operationsValue: FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests,
): Promise<Readonly<FloodgateV7LocalCleanRoomTeacherTestRunnerReceipt>> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new FloodgateV7LocalCleanRoomTeacherRunnerError("capture", false, false),
    );
  }
  return executeWithOperations(operationsValue).then(buildTestReceipt);
}

/**
 * The only real entry point. Merely importing or merging this module cannot
 * copy inputs or start a teacher.
 */
export function runFloodgateV7LocalCleanRoomTeacher(): Promise<
  Readonly<FloodgateV7LocalCleanRoomTeacherOperationalCompletion>
> {
  if (arguments.length !== 0) {
    return Promise.reject(
      new FloodgateV7LocalCleanRoomTeacherRunnerError("capture", false, false),
    );
  }
  return executeWithOperations(FIXED_OPERATIONS).then((composition) =>
    mintOperationalCompletion(
      buildPublicReceipt(
        composition.preparation,
        composition.gates,
        composition.handoff,
      ),
    ),
  );
}
