/**
 * Lexical owner for one production training-label finalization operation.
 *
 * The production entry point accepts only the purpose-specific capability
 * issued while the common outer-gate lock and durable lease are held.  All
 * paths, bindings, rows, header data, leases, plans, and nested finalizer
 * receipts remain inside this module; the public receipt is a strict
 * non-sensitive projection.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { TextDecoder, types as nodeUtilTypes } from "node:util";

import {
  claimFloodgateV7ApprovedKeyEnrollment,
  loadFloodgateV7ApprovedKeyEnrollment,
  type FloodgateV7ApprovedKeyEnrollmentCapability,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
} from "./floodgate-v7-approved-key-enrollment";
import {
  verifyFloodgateV7ApprovedKeyCurrentBindingAgainstExpected,
  type FloodgateV7ApprovedKeyExpectedBinding,
} from "./floodgate-v7-approved-key-current-binding";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "./floodgate-v7-deployment-key-authority";
import {
  assertFloodgateTeacherStageLeaseTestRealmCoreForTests,
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests,
  authorizeFloodgateTeacherStage,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  type FloodgateTeacherStageLease,
} from "./floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
} from "./floodgate-training-row-consumer";
import {
  claimFloodgateV7ProductionConnectorRegistry,
  loadFloodgateV7ProductionConnectorRegistry,
  type FloodgateV7ProductionConnectorRegistryCapability,
  type FloodgateV7ProductionConnectorRegistryPrivateClaim,
} from "./floodgate-v7-production-connector-registry";
import { assertFloodgateV7ProductionApplicationEntrypointContext } from "./floodgate-v7-production-application-source-provenance";
import {
  claimFloodgateV7ProductionOuterGateTrainingLabelFinalizationCapability,
  type FloodgateV7ProductionOuterGateTrainingLabelFinalizationCapability,
} from "./floodgate-v7-production-outer-gate-lease";
import {
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
} from "./floodgate-v7-production-parent-coordinator";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
} from "./floodgate-stable-wasm-proposer";
import {
  createFloodgateV7TrainingLabelFinalizationPlan,
  discardFloodgateV7TrainingLabelFinalizationPlan,
  finalizeAndPublishFloodgateV7TrainingLabels,
  FloodgateV7TrainingLabelProductionError,
  type FloodgateV7TrainingLabelFinalizationPlan,
  type FloodgateV7TrainingLabelFinalizationReceipt,
} from "./floodgate-v7-training-label-finalizer-core";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_IN_PROGRESS_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TrainingLabelSealedScannerOptions,
} from "./floodgate-v7-teacher-checkpoint";

export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CONTRACT =
  "shogi-floodgate-v7-training-label-production-owner-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_STATUS =
  "outer-gate-owned-sealed-work-training-label-finalization-complete" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CLAIM_BOUNDARY =
  "purpose-specific-common-outer-gate-capability-private-registry-approved-current-key-held-stage-unkeyed-header-preflight-fresh-training-callback-scanner-backed-plan-and-terminal-finalizer-without-public-path-binding-row-key-mac-training-weight-live-or-strength-authority-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_CONTRACT =
  "shogi-floodgate-v7-training-label-test-owner-receipt-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_STATUS =
  "isolated-non-production-home-test-owner-finalization-complete" as const;
export const FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_CLAIM_BOUNDARY =
  "non-production-home-test-owner-capability-injected-dependencies-exact-test-realm-stage-and-real-held-file-preflight-without-outer-gate-capability-os-lock-or-production-authority-v1" as const;

export type FloodgateV7TrainingLabelProductionOwnerExecutionBoundary =
  | "production-fixed-outer-gate-registry-key-stage-training-composer-and-finalizer"
  | "test-only-injected-owner-dependencies-and-real-held-file-preflight";

export type FloodgateV7TrainingLabelProductionStagePrefixState =
  | "work-only"
  | "work-train"
  | "work-train-result"
  | "work-train-result-manifest";

export type FloodgateV7TrainingLabelProductionOwnerPhase =
  | "capture"
  | "outer-capability"
  | "registry-load"
  | "registry-claim"
  | "approved-enrollment-load"
  | "approved-enrollment-claim"
  | "approved-binding"
  | "current-binding"
  | "stage-authorization"
  | "stage-preflight"
  | "training-consumer"
  | "plan-composition"
  | "plan-discard"
  | "finalization"
  | "cleanup";

export type FloodgateV7TrainingLabelProductionOwnerRetryDisposition =
  | "fresh-invocation-required"
  | "operator-reconciliation-required"
  | "publication-reconciliation-required"
  | "publication-and-lease-reconciliation-required";

export interface FloodgateV7TrainingLabelProductionOwnerReceipt {
  readonly contract:
    | typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CONTRACT
    | typeof FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_CONTRACT;
  readonly status:
    | typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_STATUS
    | typeof FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_STATUS;
  readonly claim_boundary:
    | typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CLAIM_BOUNDARY
    | typeof FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_CLAIM_BOUNDARY;
  readonly execution_boundary: FloodgateV7TrainingLabelProductionOwnerExecutionBoundary;
  readonly verification: Readonly<{
    readonly outer_gate_capability_claimed_synchronously: boolean;
    readonly registry_and_approved_enrollment_claimed_once: true;
    readonly registry_to_approved_binding_exact_match: true;
    readonly approved_binding_freshly_current: true;
    readonly stage_authorized_under_outer_gate: boolean;
    readonly held_stage_and_work_unkeyed_preflight: true;
    readonly canonical_v3_header_shape_verified: true;
    readonly composer_invoked_inside_fresh_training_callback: true;
    readonly scanner_backed_plan_minted: true;
    readonly consumer_postflight_completed: true;
    readonly finalizer_completed_and_destination_reverified: true;
  }>;
  readonly lifecycle: Readonly<{
    readonly initial_stage_prefix: FloodgateV7TrainingLabelProductionStagePrefixState;
    readonly lease_before_composer: "owner-closes-on-failure";
    readonly lease_after_composer_invocation: "composer-or-plan-owns";
    readonly plan_after_consumer_failure: "owner-discards-before-return";
    readonly plan_after_finalizer_invocation: "finalizer-owns-no-double-cleanup";
  }>;
  readonly output: Readonly<{
    readonly work: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly train: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly result: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly manifest: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly parents: number;
    readonly training_records: number;
    readonly consumer_postflight_sha256: string;
  }>;
  readonly nonclaims: Readonly<{
    readonly absolute_or_caller_path: false;
    readonly run_id: false;
    readonly key_id_or_instance: false;
    readonly key_material_or_hash: false;
    readonly authorization_or_content_mac: false;
    readonly run_binding_or_header_candidate: false;
    readonly row_or_position_content: false;
    readonly optimizer_training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export class FloodgateV7TrainingLabelProductionOwnerError extends Error {
  readonly phase!: FloodgateV7TrainingLabelProductionOwnerPhase;
  readonly publication_may_have_occurred!: boolean;
  readonly lease_may_remain!: boolean;
  readonly cleanup_failure_count!: number;
  readonly retry_disposition!: FloodgateV7TrainingLabelProductionOwnerRetryDisposition;
  readonly sensitive_values_disclosed!: false;

  constructor(
    phase: FloodgateV7TrainingLabelProductionOwnerPhase,
    publicationMayHaveOccurred: boolean,
    leaseMayRemain: boolean,
    cleanupFailureCount: number,
  ) {
    super("Floodgate v7 production training-label owner failed");
    const retryDisposition = publicationMayHaveOccurred
      ? leaseMayRemain
        ? "publication-and-lease-reconciliation-required"
        : "publication-reconciliation-required"
      : leaseMayRemain
        ? "operator-reconciliation-required"
        : "fresh-invocation-required";
    defineErrorField(
      this,
      "name",
      "FloodgateV7TrainingLabelProductionOwnerError",
      false,
    );
    defineErrorField(
      this,
      "stack",
      "FloodgateV7TrainingLabelProductionOwnerError: Floodgate v7 production training-label owner failed",
      false,
    );
    defineErrorField(this, "phase", phase, true);
    defineErrorField(
      this,
      "publication_may_have_occurred",
      publicationMayHaveOccurred,
      true,
    );
    defineErrorField(this, "lease_may_remain", leaseMayRemain, true);
    defineErrorField(this, "cleanup_failure_count", cleanupFailureCount, true);
    defineErrorField(this, "retry_disposition", retryDisposition, true);
    defineErrorField(this, "sensitive_values_disclosed", false, true);
    objectFreeze(this);
  }
}

export interface FloodgateV7TrainingLabelProductionStagePreflightResult {
  readonly stagePrefix: FloodgateV7TrainingLabelProductionStagePrefixState;
  readonly work: Readonly<{ readonly bytes: number; readonly sha256: string }>;
  readonly runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
}

export type FloodgateV7TrainingLabelProductionStagePreflightHookPhase =
  | "after-held-open"
  | "after-full-read"
  | "after-header-validation"
  | "before-final-revalidation";

export interface FloodgateV7TrainingLabelProductionStagePreflightDependenciesForTests {
  readonly beforeRevalidationForTests?: (
    phase: FloodgateV7TrainingLabelProductionStagePreflightHookPhase,
  ) => void | Promise<void>;
}

export interface FloodgateV7TrainingLabelProductionOwnerCoreDependencies<
  TPlan = unknown,
> {
  readonly executionBoundary: FloodgateV7TrainingLabelProductionOwnerExecutionBoundary;
  readonly effectiveUserId: number;
  readonly loadRegistry: () => Promise<
    Readonly<FloodgateV7ProductionConnectorRegistryCapability>
  >;
  readonly claimRegistry: (
    capability: Readonly<FloodgateV7ProductionConnectorRegistryCapability>,
  ) => Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim>;
  readonly loadApprovedEnrollment: () => Promise<
    Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>
  >;
  readonly claimApprovedEnrollment: (
    capability: Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>,
  ) => Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
  readonly verifyCurrentBinding: (
    expected: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
  ) => Promise<unknown>;
  readonly authorizeStage: (
    options: FloodgateV7ProductionConnectorRegistryPrivateClaim["stageAuthorization"],
  ) => Promise<Readonly<FloodgateTeacherStageLease>>;
  readonly preflightStage: (
    lease: Readonly<FloodgateTeacherStageLease>,
    effectiveUserId: number,
    expectedRunId: string,
  ) => Promise<
    Readonly<FloodgateV7TrainingLabelProductionStagePreflightResult>
  >;
  readonly consumeRowsAndPostflight: (
    options: FloodgateV7ProductionConnectorRegistryPrivateClaim["consumer"],
    consume: (
      input: Readonly<AuthenticatedFloodgateTrainingRows>,
    ) => Promise<void>,
  ) => Promise<Readonly<FloodgateTrainingConsumerPostflightReceipt>>;
  readonly createPlan: (
    lease: Readonly<FloodgateTeacherStageLease>,
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
    runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
    options: Readonly<FloodgateV7TrainingLabelSealedScannerOptions>,
  ) => Promise<TPlan>;
  readonly discardPlan: (plan: TPlan) => Promise<void>;
  readonly finalize: (
    plan: TPlan,
    postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  ) => Promise<Readonly<FloodgateV7TrainingLabelFinalizationReceipt>>;
}

export interface FloodgateV7TrainingLabelProductionOwnerTestCapability {
  readonly contract: "shogi-floodgate-v7-training-label-production-owner-test-capability-v1";
  readonly status: "opaque-single-use-non-production-home-test-owner-capability";
}

const NativeError = Error;
const NativePromise = Promise;
const NativeTextDecoder = TextDecoder;
const nativeArrayIsArray = Array.isArray;
const nativeNumberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const reflectOwnKeys = Reflect.ownKeys;
const nativeReflectApply = Reflect.apply;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nativeRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const nativeLstatSync = fs.lstatSync.bind(fs);
const pathDirname = path.dirname.bind(path);
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathRelative = path.relative.bind(path);
const pathSeparator = path.sep;
const nativeStringStartsWith = String.prototype.startsWith;
const MODE_MASK = 0o7777;
const MODE_TYPE_MASK = fs.constants.S_IFMT;
const MODE_DIRECTORY = fs.constants.S_IFDIR;
const MODE_REGULAR = fs.constants.S_IFREG;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const CANONICAL_DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/;
const READ_CHUNK_BYTES = 1024 * 1024;
const testOwnerCapabilities = new WeakMap<object, string>();

const HEADER_KEYS = objectFreeze([
  "algorithm",
  "claim_boundary",
  "gate_contract",
  "header_mac",
  "key_id",
  "kind",
  "run_binding",
  "run_id",
  "schema",
  "stage_binding",
  "status",
  "training",
] as const);
const STAGE_BINDING_KEYS = objectFreeze([
  "authorization_contract",
  "authorization_trust_boundary",
  "parent_dev",
  "parent_ino",
  "stage_basename",
  "stage_dev",
  "stage_ino",
] as const);
const TRAINING_KEYS = objectFreeze([
  "binding",
  "canonical_parents_sha256",
  "parent_ids_sha256",
  "records",
  "role",
  "schema",
] as const);
const TRAINING_BINDING_KEYS = objectFreeze([
  "bundle_manifest_bytes",
  "bundle_manifest_sha256",
  "bundle_producer_revision",
  "game_ids_sha256",
  "games",
  "parent_ids_sha256",
  "position_ids_count",
  "position_ids_sha256",
  "raw_bytes",
  "raw_format",
  "raw_sha256",
  "records",
  "result_receipt_bytes",
  "result_receipt_sha256",
  "verifier_revision",
] as const);
const RUN_BINDING_KEYS = objectFreeze([
  "plan",
  "producer_control",
  "schema",
  "stable_runtime_receipt_sha256",
  "teacher_usi_runtime_receipt_sha256",
] as const);
const PLAN_KEYS = objectFreeze(["bytes", "sha256"] as const);
const PRODUCER_CONTROL_KEYS = objectFreeze([
  "abort_drain_ms",
  "cancel_policy",
  "late_settlement_policy",
  "max_in_flight",
  "parent_deadline_ms",
  "schema",
] as const);
const GATE_CONTRACT_KEYS = objectFreeze([
  "durable_prefix_100_parents",
  "durable_prefix_500_parents",
  "schema",
  "sealed_final_parents",
] as const);
const PREFIX_ENTRY_STATES = objectFreeze([
  objectFreeze([FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME]),
  objectFreeze(["train.jsonl", FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME]),
  objectFreeze([
    "result.json",
    "train.jsonl",
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  ]),
  objectFreeze([
    "manifest.json",
    "result.json",
    "train.jsonl",
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  ]),
] as const);
const PREFIX_STATE_NAMES = objectFreeze([
  "work-only",
  "work-train",
  "work-train-result",
  "work-train-result-manifest",
] as const);
const OWNER_DEPENDENCY_KEYS = objectFreeze([
  "executionBoundary",
  "effectiveUserId",
  "loadRegistry",
  "claimRegistry",
  "loadApprovedEnrollment",
  "claimApprovedEnrollment",
  "verifyCurrentBinding",
  "authorizeStage",
  "preflightStage",
  "consumeRowsAndPostflight",
  "createPlan",
  "discardPlan",
  "finalize",
] as const);

interface FileSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

function defineErrorField(
  target: object,
  key: string,
  value: unknown,
  enumerable: boolean,
): void {
  objectDefineProperty(target, key, {
    configurable: false,
    enumerable,
    writable: false,
    value,
  });
}

function nullRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  for (const key of objectKeys(value) as Array<keyof T>) {
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: value[key],
    });
  }
  return objectFreeze(output);
}

function rejected<T>(error: unknown): Promise<T> {
  return new NativePromise<T>((_resolve, reject) => reject(error));
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nativeArrayIsArray(value) ||
    nodeIsProxy(value)
  ) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function captureNonProductionTestHome(value: unknown): string {
  if (typeof value !== "string") {
    throw new NativeError("test home differs");
  }
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests([value]);
  const home = nativeRealpathSync(value);
  if (home !== value) {
    throw new NativeError("test home is not canonical");
  }
  return home;
}

/** Mint one isolated test-owner capability bound to a canonical non-production home. */
export function authorizeFloodgateV7TrainingLabelProductionOwnerCoreForTests(
  homeDirectory: string,
): Readonly<FloodgateV7TrainingLabelProductionOwnerTestCapability> {
  if (arguments.length !== 1) {
    throw new NativeError("test owner authorization differs");
  }
  const home = captureNonProductionTestHome(homeDirectory);
  const capability = nullRecord({
    contract:
      "shogi-floodgate-v7-training-label-production-owner-test-capability-v1" as const,
    status:
      "opaque-single-use-non-production-home-test-owner-capability" as const,
  });
  testOwnerCapabilities.set(capability, home);
  return capability;
}

function claimTestOwnerCapability(
  capability: Readonly<FloodgateV7TrainingLabelProductionOwnerTestCapability>,
): string {
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeIsProxy(capability)
  ) {
    throw new NativeError("test owner capability differs");
  }
  const home = testOwnerCapabilities.get(capability);
  if (home === undefined) {
    throw new NativeError("test owner capability differs");
  }
  testOwnerCapabilities.delete(capability);
  return home;
}

function sameOrDescendant(home: string, candidate: string): boolean {
  const relative = pathRelative(home, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !nativeReflectApply(nativeStringStartsWith, relative, [
        `..${pathSeparator}`,
      ]) &&
      !pathIsAbsolute(relative))
  );
}

function resolveExistingAncestorForTestHome(candidate: string): string {
  let cursor = candidate;
  for (;;) {
    try {
      nativeLstatSync(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new NativeError("test path ancestor cannot be inspected");
      }
      const parent = pathDirname(cursor);
      if (parent === cursor) {
        throw new NativeError("test path has no existing ancestor");
      }
      cursor = parent;
      continue;
    }
    try {
      return nativeRealpathSync(cursor);
    } catch {
      throw new NativeError("test path ancestor cannot be resolved");
    }
  }
}

function assertTestPathsWithinExactHome(
  home: string,
  paths: readonly string[],
): void {
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests(paths);
  for (let index = 0; index < paths.length; index += 1) {
    const candidate = paths[index];
    if (
      !sameOrDescendant(home, candidate) ||
      !sameOrDescendant(home, resolveExistingAncestorForTestHome(candidate))
    ) {
      throw new NativeError("test path differs from authorized test home");
    }
  }
}

function captureOwnerDependenciesForTests<TPlan>(
  value: Readonly<
    FloodgateV7TrainingLabelProductionOwnerCoreDependencies<TPlan>
  >,
): Readonly<FloodgateV7TrainingLabelProductionOwnerCoreDependencies<TPlan>> {
  if (!isPlainRecord(value)) {
    throw new NativeError("test owner dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length !== OWNER_DEPENDENCY_KEYS.length ||
    keys.some(
      (key, index) =>
        typeof key !== "string" ||
        key !== OWNER_DEPENDENCY_KEYS[index] ||
        descriptors[key] === undefined ||
        !("value" in descriptors[key]) ||
        descriptors[key].enumerable !== true,
    )
  ) {
    throw new NativeError("test owner dependencies differ");
  }
  const candidate = Object.create(null) as Record<string, unknown>;
  for (let index = 0; index < OWNER_DEPENDENCY_KEYS.length; index += 1) {
    const key = OWNER_DEPENDENCY_KEYS[index];
    candidate[key] = descriptors[key]?.value;
  }
  if (
    candidate.executionBoundary !==
      "test-only-injected-owner-dependencies-and-real-held-file-preflight" ||
    typeof candidate.effectiveUserId !== "number" ||
    !nativeNumberIsSafeInteger(candidate.effectiveUserId) ||
    candidate.effectiveUserId < 1
  ) {
    throw new NativeError("test owner boundary differs");
  }
  for (let index = 0; index < OWNER_DEPENDENCY_KEYS.length; index += 1) {
    const key = OWNER_DEPENDENCY_KEYS[index];
    if (key === "executionBoundary" || key === "effectiveUserId") continue;
    if (typeof candidate[key] !== "function" || nodeIsProxy(candidate[key])) {
      throw new NativeError("test owner dependency differs");
    }
  }
  const productionOwners = [
    loadFloodgateV7ProductionConnectorRegistry,
    claimFloodgateV7ProductionConnectorRegistry,
    loadFloodgateV7ApprovedKeyEnrollment,
    claimFloodgateV7ApprovedKeyEnrollment,
    verifyFloodgateV7ApprovedKeyCurrentBindingAgainstExpected,
    authorizeFloodgateTeacherStage,
    withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
    createFloodgateV7TrainingLabelFinalizationPlan,
    discardFloodgateV7TrainingLabelFinalizationPlan,
    finalizeAndPublishFloodgateV7TrainingLabels,
  ];
  for (let index = 0; index < OWNER_DEPENDENCY_KEYS.length; index += 1) {
    const key = OWNER_DEPENDENCY_KEYS[index];
    if (productionOwners.includes(candidate[key] as never)) {
      throw new NativeError("test owner dependency aliases production owner");
    }
  }
  return objectFreeze({ ...value });
}

function assertTestRegistryWithinExactHome(
  registry: Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim>,
  testHome: string,
): void {
  const stage = registry.stageAuthorization as Record<string, unknown>;
  const consumer = registry.consumer as Record<string, unknown>;
  const candidates = [
    stage.repositoryRoot,
    stage.rawLockRoot,
    stage.roleLockRoot,
    stage.roleBundleRoot,
    stage.legacyProtectedPositionIdsPath,
    stage.publicationParent,
    stage.engineBin,
    stage.engineReceipt,
    stage.evalDir,
    consumer.repositoryRoot,
    consumer.rawLockRoot,
    consumer.roleLockRoot,
    consumer.legacyProtectedPositionIdsPath,
    consumer.outputRoot,
  ];
  const engineArgs = stage.engineArgs;
  if (engineArgs !== undefined) {
    if (!nativeArrayIsArray(engineArgs) || nodeIsProxy(engineArgs)) {
      throw new NativeError("test registry engine arguments differ");
    }
    for (let index = 0; index < engineArgs.length; index += 1) {
      const argument = engineArgs[index];
      if (typeof argument !== "string") {
        throw new NativeError("test registry engine argument differs");
      }
      if (pathIsAbsolute(argument)) {
        candidates[candidates.length] = argument;
      }
    }
  }
  const paths: string[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) continue;
    if (typeof candidate !== "string") {
      throw new NativeError("test registry path differs");
    }
    paths[paths.length] = candidate;
  }
  if (paths.length > 0) {
    assertTestPathsWithinExactHome(testHome, paths);
  }
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) throw new NativeError(`${label} is not a record`);
  const actual = objectKeys(value).sort(compareUtf8);
  const expected = [...expectedKeys].sort(compareUtf8);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new NativeError(`${label} shape differs`);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (nativeArrayIsArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${objectKeys(value)
      .sort(compareUtf8)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new NativeError("value is not canonical JSON data");
}

function requiredDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new NativeError(`${label} is not a digest`);
  }
  return value;
}

function requiredRevision(value: unknown, label: string): string {
  if (typeof value !== "string" || !REVISION_RE.test(value)) {
    throw new NativeError(`${label} is not a revision`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  if (
    typeof value !== "number" ||
    !nativeNumberIsSafeInteger(value) ||
    value < minimum
  ) {
    throw new NativeError(`${label} is not a supported integer`);
  }
  return value;
}

function requiredCanonicalDecimal(value: unknown, label: string): string {
  if (typeof value !== "string" || !CANONICAL_DECIMAL_RE.test(value)) {
    throw new NativeError(`${label} is not a canonical decimal`);
  }
  return value;
}

function captureSnapshot(stat: fs.BigIntStats): Readonly<FileSnapshot> {
  return objectFreeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function sameSnapshot(
  left: Readonly<FileSnapshot>,
  right: fs.BigIntStats,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function verifyStageStat(
  stat: fs.BigIntStats,
  lease: Readonly<FloodgateTeacherStageLease>,
  effectiveUserId: number,
): void {
  if (
    (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_DIRECTORY ||
    (Number(stat.mode) & MODE_MASK) !== 0o700 ||
    stat.uid !== BigInt(effectiveUserId) ||
    stat.dev !== lease.receipt.stage_identity.dev ||
    stat.ino !== lease.receipt.stage_identity.ino
  ) {
    throw new NativeError("held stage identity or private metadata differs");
  }
}

function verifyWorkStat(stat: fs.BigIntStats, effectiveUserId: number): void {
  if (
    (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_REGULAR ||
    (Number(stat.mode) & MODE_MASK) !== 0o600 ||
    stat.uid !== BigInt(effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    stat.size <= BigInt(0) ||
    stat.size > BigInt(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES)
  ) {
    throw new NativeError("held work private metadata differs");
  }
}

function stagePrefix(
  entriesValue: readonly string[],
): FloodgateV7TrainingLabelProductionStagePrefixState {
  const entries = [...entriesValue].sort(compareUtf8);
  for (let index = 0; index < PREFIX_ENTRY_STATES.length; index += 1) {
    const expected = PREFIX_ENTRY_STATES[index];
    if (
      entries.length === expected.length &&
      entries.every((entry, entryIndex) => entry === expected[entryIndex])
    ) {
      const state = PREFIX_STATE_NAMES[index];
      if (state !== undefined) return state;
    }
  }
  throw new NativeError("stage is not an exact W, WT, WTR, or WTRM prefix");
}

function captureRunBinding(
  value: unknown,
): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  const binding = exactRecord(value, RUN_BINDING_KEYS, "run binding");
  const plan = exactRecord(binding.plan, PLAN_KEYS, "run binding plan");
  const control = exactRecord(
    binding.producer_control,
    PRODUCER_CONTROL_KEYS,
    "producer control",
  );
  if (
    binding.schema !== FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA ||
    plan.bytes !== FLOODGATE_FRESH_SIBLING_PLAN_BYTES ||
    plan.sha256 !== FLOODGATE_FRESH_SIBLING_PLAN_SHA256 ||
    control.schema !== FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA ||
    control.parent_deadline_ms !==
      FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS ||
    control.abort_drain_ms !==
      FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS ||
    control.max_in_flight !== FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT ||
    control.cancel_policy !== FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY ||
    control.late_settlement_policy !==
      FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY
  ) {
    throw new NativeError("run binding fixed policy differs");
  }
  return nullRecord({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: nullRecord({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    }),
    producer_control: nullRecord({
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms:
        FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
      abort_drain_ms: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256: requiredDigest(
      binding.stable_runtime_receipt_sha256,
      "stable runtime receipt",
    ),
    teacher_usi_runtime_receipt_sha256: requiredDigest(
      binding.teacher_usi_runtime_receipt_sha256,
      "teacher runtime receipt",
    ),
  });
}

function captureHeaderRunBinding(
  headerValue: unknown,
  lease: Readonly<FloodgateTeacherStageLease>,
  expectedRunId: string,
): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  const header = exactRecord(headerValue, HEADER_KEYS, "v3 header");
  const gate = exactRecord(
    header.gate_contract,
    GATE_CONTRACT_KEYS,
    "v3 gate contract",
  );
  const stage = exactRecord(
    header.stage_binding,
    STAGE_BINDING_KEYS,
    "v3 stage binding",
  );
  const training = exactRecord(header.training, TRAINING_KEYS, "v3 training");
  const trainingBinding = exactRecord(
    training.binding,
    TRAINING_BINDING_KEYS,
    "v3 training binding",
  );
  if (
    header.schema !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA ||
    header.kind !== "header" ||
    header.run_id !== expectedRunId ||
    header.key_id !== FLOODGATE_V7_DEPLOYMENT_KEY_ID ||
    header.algorithm !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM ||
    header.status !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_IN_PROGRESS_STATUS ||
    header.claim_boundary !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY ||
    !requiredDigest(header.header_mac, "v3 header MAC") ||
    gate.schema !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema ||
    gate.durable_prefix_100_parents !== 100 ||
    gate.durable_prefix_500_parents !== 500 ||
    gate.sealed_final_parents !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    stage.authorization_contract !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    stage.authorization_trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    stage.stage_basename !== lease.receipt.stage_basename ||
    requiredCanonicalDecimal(stage.parent_dev, "stage parent dev") !==
      lease.receipt.parent_identity.dev.toString(10) ||
    requiredCanonicalDecimal(stage.parent_ino, "stage parent ino") !==
      lease.receipt.parent_identity.ino.toString(10) ||
    requiredCanonicalDecimal(stage.stage_dev, "stage dev") !==
      lease.receipt.stage_identity.dev.toString(10) ||
    requiredCanonicalDecimal(stage.stage_ino, "stage ino") !==
      lease.receipt.stage_identity.ino.toString(10) ||
    training.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    training.role !== "training" ||
    training.records !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    trainingBinding.records !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    training.parent_ids_sha256 !== trainingBinding.parent_ids_sha256 ||
    requiredDigest(training.canonical_parents_sha256, "canonical parents") ===
      ""
  ) {
    throw new NativeError("v3 header fixed shape or binding differs");
  }
  for (const key of [
    "bundle_manifest_sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
    "raw_sha256",
    "result_receipt_sha256",
  ] as const) {
    requiredDigest(trainingBinding[key], `training binding ${key}`);
  }
  for (const key of [
    "bundle_producer_revision",
    "verifier_revision",
  ] as const) {
    requiredRevision(trainingBinding[key], `training binding ${key}`);
  }
  for (const key of [
    "bundle_manifest_bytes",
    "games",
    "position_ids_count",
    "raw_bytes",
    "records",
    "result_receipt_bytes",
  ] as const) {
    requiredInteger(trainingBinding[key], `training binding ${key}`, 1);
  }
  if (
    typeof trainingBinding.raw_format !== "string" ||
    trainingBinding.raw_format.length === 0 ||
    trainingBinding.raw_format.trim() !== trainingBinding.raw_format
  ) {
    throw new NativeError("training binding raw format differs");
  }
  return captureRunBinding(header.run_binding);
}

async function callPreflightHook(
  dependencies:
    | Readonly<FloodgateV7TrainingLabelProductionStagePreflightDependenciesForTests>
    | undefined,
  phase: FloodgateV7TrainingLabelProductionStagePreflightHookPhase,
): Promise<void> {
  await dependencies?.beforeRevalidationForTests?.(phase);
}

/**
 * Test-visible read-only preflight. It reads the complete held work file only
 * for bytes/SHA-256 and a bounded first header line; no HMAC is authenticated
 * and no capability is prepared or claimed here.
 */
async function inspectFloodgateV7TrainingLabelProductionStageInternal(
  lease: Readonly<FloodgateTeacherStageLease>,
  effectiveUserId: number,
  expectedRunId: string,
  dependencies:
    | Readonly<FloodgateV7TrainingLabelProductionStagePreflightDependenciesForTests>
    | undefined,
): Promise<Readonly<FloodgateV7TrainingLabelProductionStagePreflightResult>> {
  let stageHandle: fs.promises.FileHandle | undefined;
  let workHandle: fs.promises.FileHandle | undefined;
  let primary: unknown;
  try {
    stageHandle = await fs.promises.open(
      lease.stageRoot,
      fs.constants.O_RDONLY |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    const stageBeforeStat = await stageHandle.stat({ bigint: true });
    verifyStageStat(stageBeforeStat, lease, effectiveUserId);
    const stageBefore = captureSnapshot(stageBeforeStat);
    const namedStageBefore = await fs.promises.lstat(lease.stageRoot, {
      bigint: true,
    });
    if (!sameSnapshot(stageBefore, namedStageBefore)) {
      throw new NativeError("named stage differs from held stage");
    }
    const entriesBefore = await fs.promises.readdir(lease.stageRoot);
    const prefix = stagePrefix(entriesBefore);
    const workPath = `${lease.stageRoot}/${FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME}`;
    workHandle = await fs.promises.open(
      workPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const workBeforeStat = await workHandle.stat({ bigint: true });
    verifyWorkStat(workBeforeStat, effectiveUserId);
    const workBefore = captureSnapshot(workBeforeStat);
    const namedWorkBefore = await fs.promises.lstat(workPath, { bigint: true });
    if (!sameSnapshot(workBefore, namedWorkBefore)) {
      throw new NativeError("named work differs from held work");
    }
    await callPreflightHook(dependencies, "after-held-open");

    const digest = createHash("sha256");
    const chunk = Buffer.alloc(READ_CHUNK_BYTES);
    const firstLineChunks: Buffer[] = [];
    let firstLineBytes = 0;
    let firstLineComplete = false;
    let position = 0;
    while (true) {
      const read = await workHandle.read(chunk, 0, chunk.byteLength, position);
      if (read.bytesRead === 0) break;
      position += read.bytesRead;
      if (position > FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES) {
        throw new NativeError("work exceeds the v3 byte bound");
      }
      const bytes = chunk.subarray(0, read.bytesRead);
      digest.update(bytes);
      if (!firstLineComplete) {
        const newline = bytes.indexOf(0x0a);
        const headerPart = newline < 0 ? bytes : bytes.subarray(0, newline);
        firstLineBytes += headerPart.byteLength;
        if (firstLineBytes > FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES) {
          throw new NativeError("v3 header exceeds its line bound");
        }
        firstLineChunks.push(Buffer.from(headerPart));
        if (newline >= 0) firstLineComplete = true;
      }
    }
    if (!firstLineComplete || position !== Number(workBefore.size)) {
      throw new NativeError("work read or v3 header line is incomplete");
    }
    await callPreflightHook(dependencies, "after-full-read");
    const decoder = new NativeTextDecoder("utf-8", { fatal: true });
    const headerText = decoder.decode(Buffer.concat(firstLineChunks));
    const headerValue = JSON.parse(headerText) as unknown;
    if (canonicalJson(headerValue) !== headerText) {
      throw new NativeError("v3 header is not canonical JSON");
    }
    const runBinding = captureHeaderRunBinding(
      headerValue,
      lease,
      expectedRunId,
    );
    await callPreflightHook(dependencies, "after-header-validation");
    await callPreflightHook(dependencies, "before-final-revalidation");

    const heldWorkAfter = await workHandle.stat({ bigint: true });
    const namedWorkAfter = await fs.promises.lstat(workPath, { bigint: true });
    const heldStageAfter = await stageHandle.stat({ bigint: true });
    const namedStageAfter = await fs.promises.lstat(lease.stageRoot, {
      bigint: true,
    });
    const entriesAfter = await fs.promises.readdir(lease.stageRoot);
    if (
      !sameSnapshot(workBefore, heldWorkAfter) ||
      !sameSnapshot(workBefore, namedWorkAfter) ||
      !sameSnapshot(stageBefore, heldStageAfter) ||
      !sameSnapshot(stageBefore, namedStageAfter) ||
      stagePrefix(entriesAfter) !== prefix
    ) {
      throw new NativeError(
        "held or named stage/work changed during preflight",
      );
    }
    return nullRecord({
      stagePrefix: prefix,
      work: nullRecord({ bytes: position, sha256: digest.digest("hex") }),
      runBinding,
    });
  } catch (error) {
    primary = error;
  } finally {
    const closeFailures: unknown[] = [];
    if (workHandle !== undefined) {
      try {
        await workHandle.close();
      } catch (error) {
        closeFailures.push(error);
      }
    }
    if (stageHandle !== undefined) {
      try {
        await stageHandle.close();
      } catch (error) {
        closeFailures.push(error);
      }
    }
    if (closeFailures.length > 0) {
      throw new AggregateError(
        primary === undefined ? closeFailures : [primary, ...closeFailures],
        "training-label stage preflight cleanup failed",
      );
    }
  }
  throw primary;
}

export function inspectFloodgateV7TrainingLabelProductionStageCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  effectiveUserId: number,
  expectedRunId: string,
  dependencies: Readonly<FloodgateV7TrainingLabelProductionStagePreflightDependenciesForTests> = objectFreeze(
    {},
  ),
): Promise<Readonly<FloodgateV7TrainingLabelProductionStagePreflightResult>> {
  if (
    (arguments.length !== 3 && arguments.length !== 4) ||
    !nativeNumberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 1 ||
    typeof expectedRunId !== "string" ||
    !RUN_ID_RE.test(expectedRunId) ||
    !isPlainRecord(dependencies) ||
    objectKeys(dependencies).some(
      (key) => key !== "beforeRevalidationForTests",
    ) ||
    (dependencies.beforeRevalidationForTests !== undefined &&
      (typeof dependencies.beforeRevalidationForTests !== "function" ||
        nodeIsProxy(dependencies.beforeRevalidationForTests)))
  ) {
    return rejected(
      new NativeError("training-label stage preflight capture failed"),
    );
  }
  return inspectFloodgateV7TrainingLabelProductionStageInternal(
    lease,
    effectiveUserId,
    expectedRunId,
    dependencies,
  );
}

function approvedBindingMatches(
  registry: Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim>,
  approved: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>,
): boolean {
  return (
    registry.approvedKeyBinding.recordBytes === approved.record.bytes &&
    registry.approvedKeyBinding.recordSha256 === approved.record.sha256 &&
    registry.approvedKeyBinding.keyInstanceId === approved.key_instance_id
  );
}

function projectedFile(
  value: FloodgateV7TrainingLabelFinalizationReceipt["content"]["work"],
): Readonly<{ readonly bytes: number; readonly sha256: string }> {
  return nullRecord({
    bytes: requiredInteger(value.bytes, "published file bytes", 1),
    sha256: requiredDigest(value.sha256, "published file digest"),
  });
}

function buildOwnerReceipt(
  boundary: FloodgateV7TrainingLabelProductionOwnerExecutionBoundary,
  prefix: FloodgateV7TrainingLabelProductionStagePrefixState,
  finalization: Readonly<FloodgateV7TrainingLabelFinalizationReceipt>,
): Readonly<FloodgateV7TrainingLabelProductionOwnerReceipt> {
  if (
    finalization.postpublication.destination_reopened !== true ||
    finalization.postpublication.content_reverified !== true
  ) {
    throw new NativeError("finalization terminal verification differs");
  }
  const productionBoundary =
    boundary ===
    "production-fixed-outer-gate-registry-key-stage-training-composer-and-finalizer";
  return nullRecord({
    contract: productionBoundary
      ? FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CONTRACT
      : FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_CONTRACT,
    status: productionBoundary
      ? FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_STATUS
      : FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_STATUS,
    claim_boundary: productionBoundary
      ? FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_OWNER_CLAIM_BOUNDARY
      : FLOODGATE_V7_TRAINING_LABEL_TEST_OWNER_RECEIPT_CLAIM_BOUNDARY,
    execution_boundary: boundary,
    verification: nullRecord({
      outer_gate_capability_claimed_synchronously: productionBoundary,
      registry_and_approved_enrollment_claimed_once: true as const,
      registry_to_approved_binding_exact_match: true as const,
      approved_binding_freshly_current: true as const,
      stage_authorized_under_outer_gate: productionBoundary,
      held_stage_and_work_unkeyed_preflight: true as const,
      canonical_v3_header_shape_verified: true as const,
      composer_invoked_inside_fresh_training_callback: true as const,
      scanner_backed_plan_minted: true as const,
      consumer_postflight_completed: true as const,
      finalizer_completed_and_destination_reverified: true as const,
    }),
    lifecycle: nullRecord({
      initial_stage_prefix: prefix,
      lease_before_composer: "owner-closes-on-failure" as const,
      lease_after_composer_invocation: "composer-or-plan-owns" as const,
      plan_after_consumer_failure: "owner-discards-before-return" as const,
      plan_after_finalizer_invocation:
        "finalizer-owns-no-double-cleanup" as const,
    }),
    output: nullRecord({
      work: projectedFile(finalization.content.work),
      train: projectedFile(finalization.content.train),
      result: projectedFile(finalization.content.result),
      manifest: projectedFile(finalization.content.manifest),
      parents: requiredInteger(finalization.content.parents, "parents", 1),
      training_records: requiredInteger(
        finalization.content.training_records,
        "training records",
      ),
      consumer_postflight_sha256: requiredDigest(
        finalization.content.consumer_postflight_sha256,
        "consumer postflight",
      ),
    }),
    nonclaims: nullRecord({
      absolute_or_caller_path: false as const,
      run_id: false as const,
      key_id_or_instance: false as const,
      key_material_or_hash: false as const,
      authorization_or_content_mac: false as const,
      run_binding_or_header_candidate: false as const,
      row_or_position_content: false as const,
      optimizer_training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function sanitizeOwnerFailure(
  phase: FloodgateV7TrainingLabelProductionOwnerPhase,
  primary: unknown,
  finalizerInvoked: boolean,
  cleanupFailures: readonly unknown[],
  cleanupEstablishedNoLease: boolean,
): FloodgateV7TrainingLabelProductionOwnerError {
  if (primary instanceof FloodgateV7TrainingLabelProductionError) {
    return new FloodgateV7TrainingLabelProductionOwnerError(
      phase,
      primary.mayHavePublished,
      primary.leaseMayRemain || cleanupFailures.length > 0,
      primary.cleanupFailureCount + cleanupFailures.length,
    );
  }
  return new FloodgateV7TrainingLabelProductionOwnerError(
    phase,
    finalizerInvoked,
    !cleanupEstablishedNoLease || cleanupFailures.length > 0,
    cleanupFailures.length,
  );
}

async function executeOwnerAfterClaim<TPlan>(
  dependencies: Readonly<
    FloodgateV7TrainingLabelProductionOwnerCoreDependencies<TPlan>
  >,
  testHome: string | null,
): Promise<Readonly<FloodgateV7TrainingLabelProductionOwnerReceipt>> {
  let phase: FloodgateV7TrainingLabelProductionOwnerPhase = "registry-load";
  let lease: Readonly<FloodgateTeacherStageLease> | undefined;
  let preflight:
    | Readonly<FloodgateV7TrainingLabelProductionStagePreflightResult>
    | undefined;
  let composerInvoked = false;
  let plan: TPlan | undefined;
  let finalizerInvoked = false;
  let primary: unknown;
  try {
    const registryCapability = await dependencies.loadRegistry();
    phase = "registry-claim";
    const registry = dependencies.claimRegistry(registryCapability);
    if (testHome !== null) {
      assertTestRegistryWithinExactHome(registry, testHome);
    }
    phase = "approved-enrollment-load";
    const approvedCapability = await dependencies.loadApprovedEnrollment();
    phase = "approved-enrollment-claim";
    const approved = dependencies.claimApprovedEnrollment(approvedCapability);
    phase = "approved-binding";
    if (!approvedBindingMatches(registry, approved)) {
      throw new NativeError("registry and approved enrollment differ");
    }
    const expected = nullRecord({
      recordBytes: registry.approvedKeyBinding.recordBytes,
      recordSha256: registry.approvedKeyBinding.recordSha256,
      keyInstanceId: registry.approvedKeyBinding.keyInstanceId,
    });
    phase = "current-binding";
    await dependencies.verifyCurrentBinding(expected);
    phase = "stage-authorization";
    const stageLeaseCandidate = await dependencies.authorizeStage(
      registry.stageAuthorization,
    );
    if (testHome !== null) {
      assertFloodgateTeacherStageLeaseTestRealmCoreForTests(
        stageLeaseCandidate,
      );
      assertTestPathsWithinExactHome(testHome, [
        stageLeaseCandidate.stageRoot,
        stageLeaseCandidate.destinationRoot,
      ]);
    }
    lease = stageLeaseCandidate;
    phase = "stage-preflight";
    preflight = await dependencies.preflightStage(
      lease,
      dependencies.effectiveUserId,
      registry.runId,
    );
    phase = "training-consumer";
    const postflight = await dependencies.consumeRowsAndPostflight(
      registry.consumer,
      async (input): Promise<void> => {
        phase = "plan-composition";
        composerInvoked = true;
        const pending = dependencies.createPlan(
          lease as Readonly<FloodgateTeacherStageLease>,
          input,
          preflight?.runBinding as Readonly<FloodgateV7TeacherCheckpointRunBinding>,
          nullRecord({
            runId: registry.runId,
            keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
            work: nullRecord({
              bytes: preflight?.work.bytes as number,
              sha256: preflight?.work.sha256 as string,
            }),
          }),
        );
        plan = await pending;
        phase = "training-consumer";
      },
    );
    if (plan === undefined) {
      throw new NativeError("training consumer returned without a plan");
    }
    phase = "finalization";
    finalizerInvoked = true;
    const finalization = await dependencies.finalize(plan, postflight);
    return buildOwnerReceipt(
      dependencies.executionBoundary,
      preflight.stagePrefix,
      finalization,
    );
  } catch (error) {
    primary = error;
  }

  const failurePhase = phase;
  const cleanupFailures: unknown[] = [];
  let cleanupFailurePhase:
    FloodgateV7TrainingLabelProductionOwnerPhase | undefined;
  let cleanupEstablishedNoLease = lease === undefined;
  if (!finalizerInvoked) {
    if (plan !== undefined) {
      try {
        await dependencies.discardPlan(plan);
        cleanupEstablishedNoLease = true;
      } catch (error) {
        cleanupFailurePhase = "plan-discard";
        cleanupFailures.push(error);
      }
    } else if (!composerInvoked && lease !== undefined) {
      try {
        await lease.close();
        cleanupEstablishedNoLease = true;
      } catch (error) {
        cleanupFailurePhase = "cleanup";
        cleanupFailures.push(error);
      }
    } else if (
      composerInvoked &&
      primary instanceof FloodgateV7TrainingLabelProductionError
    ) {
      cleanupEstablishedNoLease = !primary.leaseMayRemain;
    }
  }
  throw sanitizeOwnerFailure(
    cleanupFailurePhase ?? failurePhase,
    primary,
    finalizerInvoked,
    cleanupFailures,
    cleanupEstablishedNoLease,
  );
}

/** Test-only owner with a purpose-separated outer capability registry. */
export function runFloodgateV7TrainingLabelProductionOwnerUnderOuterGateCoreForTests<
  TPlan,
>(
  capability: Readonly<FloodgateV7TrainingLabelProductionOwnerTestCapability>,
  dependencies: Readonly<
    FloodgateV7TrainingLabelProductionOwnerCoreDependencies<TPlan>
  >,
): Promise<Readonly<FloodgateV7TrainingLabelProductionOwnerReceipt>> {
  if (arguments.length !== 2) {
    return rejected(
      new FloodgateV7TrainingLabelProductionOwnerError(
        "capture",
        false,
        false,
        0,
      ),
    );
  }
  let testHome: string;
  let capturedDependencies: Readonly<
    FloodgateV7TrainingLabelProductionOwnerCoreDependencies<TPlan>
  >;
  try {
    testHome = claimTestOwnerCapability(capability);
    capturedDependencies = captureOwnerDependenciesForTests(dependencies);
  } catch {
    return rejected(
      new FloodgateV7TrainingLabelProductionOwnerError(
        "outer-capability",
        false,
        false,
        0,
      ),
    );
  }
  return executeOwnerAfterClaim(capturedDependencies, testHome);
}

function productionEffectiveUserId(): number {
  const getEffectiveUserId = process.geteuid;
  if (typeof getEffectiveUserId !== "function") {
    throw new NativeError("POSIX effective-user identity is required");
  }
  const effectiveUserId = getEffectiveUserId.call(process);
  if (!nativeNumberIsSafeInteger(effectiveUserId) || effectiveUserId < 1) {
    throw new NativeError("effective-user identity is unsupported");
  }
  return effectiveUserId;
}

function productionDependencies(
  effectiveUserId: number,
): Readonly<
  FloodgateV7TrainingLabelProductionOwnerCoreDependencies<
    Readonly<FloodgateV7TrainingLabelFinalizationPlan>
  >
> {
  return objectFreeze({
    executionBoundary:
      "production-fixed-outer-gate-registry-key-stage-training-composer-and-finalizer" as const,
    effectiveUserId,
    loadRegistry: loadFloodgateV7ProductionConnectorRegistry,
    claimRegistry: claimFloodgateV7ProductionConnectorRegistry,
    loadApprovedEnrollment: loadFloodgateV7ApprovedKeyEnrollment,
    claimApprovedEnrollment: claimFloodgateV7ApprovedKeyEnrollment,
    verifyCurrentBinding:
      verifyFloodgateV7ApprovedKeyCurrentBindingAgainstExpected,
    authorizeStage: authorizeFloodgateTeacherStage,
    preflightStage: (
      lease: Readonly<FloodgateTeacherStageLease>,
      uid: number,
      runId: string,
    ) =>
      inspectFloodgateV7TrainingLabelProductionStageInternal(
        lease,
        uid,
        runId,
        undefined,
      ),
    consumeRowsAndPostflight:
      withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
    createPlan: createFloodgateV7TrainingLabelFinalizationPlan,
    discardPlan: discardFloodgateV7TrainingLabelFinalizationPlan,
    finalize: finalizeAndPublishFloodgateV7TrainingLabels,
  });
}

/**
 * Consume one exact purpose-specific outer-gate capability synchronously, then
 * keep the complete production composition inside the common lock lifetime.
 */
export function runFloodgateV7TrainingLabelProductionOwnerUnderOuterGate(
  capability: Readonly<FloodgateV7ProductionOuterGateTrainingLabelFinalizationCapability>,
): Promise<Readonly<FloodgateV7TrainingLabelProductionOwnerReceipt>> {
  try {
    assertFloodgateV7ProductionApplicationEntrypointContext(
      "ml/run-floodgate-v7-training-label-production.ts",
    );
  } catch {
    return rejected(
      new FloodgateV7TrainingLabelProductionOwnerError(
        "capture",
        false,
        false,
        0,
      ),
    );
  }
  if (arguments.length !== 1) {
    return rejected(
      new FloodgateV7TrainingLabelProductionOwnerError(
        "capture",
        false,
        false,
        0,
      ),
    );
  }
  let dependencies: ReturnType<typeof productionDependencies>;
  try {
    // The capability claim deliberately precedes every await and every private
    // registry/key/stage operation.
    claimFloodgateV7ProductionOuterGateTrainingLabelFinalizationCapability(
      capability,
    );
    dependencies = productionDependencies(productionEffectiveUserId());
  } catch {
    return rejected(
      new FloodgateV7TrainingLabelProductionOwnerError(
        "outer-capability",
        false,
        false,
        0,
      ),
    );
  }
  return executeOwnerAfterClaim(dependencies, null);
}
