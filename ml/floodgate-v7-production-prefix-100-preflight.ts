/**
 * Read-only, point-in-time preflight for the first production prefix-100 gate.
 *
 * The production entry is reachable only through the fixed outer-lock owner.
 * It observes private state while that owner retains the registry-anchored OS
 * lock, performs no write, and returns no path, identity, digest, or authority.
 */

import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS,
  verifyFloodgateV7ApprovedKeyCurrentBindingAgainstExpected,
  type FloodgateV7ApprovedKeyExpectedBinding,
} from "./floodgate-v7-approved-key-current-binding";
import {
  claimFloodgateV7ApprovedKeyEnrollment,
  loadFloodgateV7ApprovedKeyEnrollment,
} from "./floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
  inspectFloodgateV7DeploymentKeyReadiness,
} from "./floodgate-v7-deployment-key-readiness";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "./floodgate-production-teacher-asset-authority";
import {
  captureFloodgateV7ProductionApplicationSourceProvenance,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
  type FloodgateV7ProductionApplicationSourceBinding,
} from "./floodgate-v7-production-application-source-provenance";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  claimFloodgateV7ProductionConnectorRegistry,
  loadFloodgateV7ProductionConnectorRegistry,
} from "./floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
  assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding,
  verifyFloodgateV7ProductionConnectorVerifierReadiness,
} from "./floodgate-v7-production-connector-verifier-readiness";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_CONTRACT,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_STATUS,
  claimFloodgateV7ProductionPrefix100PreflightOuterLockCapability,
  claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests,
  runFloodgateV7ProductionPrefix100PreflightOuterLock,
  type FloodgateV7ProductionPrefix100PreflightOuterLockAnchor,
  type FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
} from "./floodgate-v7-production-outer-gate-lease";
import { FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME } from "./floodgate-v7-teacher-checkpoint";

export const FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-read-only-preflight-v3" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_STATUS =
  "fresh-zero-work-application-source-bound-prefix-100-read-only-preconditions-observed" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_CLAIM_BOUNDARY =
  "point-in-time-fixed-current-user-exact-clean-tracked-application-source-bound-read-only-observation-without-gate-authority-or-persistent-mutation-v3" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-application-source-bound-common-os-lock" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_TEST_EXECUTION_BOUNDARY =
  "test-only-injected-current-euid-home-read-only-observation" as const;
const INTERNAL_OUTCOME_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-read-only-preflight-under-lock-outcome-v3" as const;

export type FloodgateV7ProductionPrefix100PreflightPhase =
  | "capture"
  | "production-identity"
  | "outer-gate-lock"
  | "runs-namespace-open"
  | "initial-snapshot"
  | "outer-control"
  | "registry-load"
  | "registry-claim"
  | "registry-fixed-configuration"
  | "application-source"
  | "verifier-readiness"
  | "key-readiness"
  | "approved-record-load"
  | "approved-record-claim"
  | "approved-binding"
  | "current-binding"
  | "final-snapshot"
  | "cleanup"
  | "receipt";

export type FloodgateV7ProductionPrefix100PreflightRetryDisposition =
  | "wait-for-current-owner-then-fresh-preflight"
  | "fix-environment-then-fresh-preflight"
  | "operator-reconciliation-required-no-gate";

export interface FloodgateV7ProductionPrefix100PreflightReceipt {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_CLAIM_BOUNDARY;
  readonly execution_boundary:
    | typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_EXECUTION_BOUNDARY
    | typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_TEST_EXECUTION_BOUNDARY;
  readonly gate: "durable-prefix-100";
  readonly decision: Readonly<{
    readonly result: "GO";
    readonly scope: "read-only-core-preconditions-only";
    readonly gate_invocation_authorized: false;
  }>;
  readonly outer_control: "absent-pristine" | "present-exact-empty";
  readonly verification: Readonly<{
    readonly common_os_lock_acquired_nonblocking: true;
    readonly common_os_lock_held_through_all_checks: true;
    readonly registry_anchor_held_descriptor_and_bytes_revalidated: true;
    readonly private_registry_claimed_and_fixed_configuration_validated: true;
    readonly application_source_binding_matched_to_exact_clean_tracked_application_closure: true;
    readonly verifier_source_artifact_closure_rechecked: true;
    readonly deployment_key_metadata_ready: true;
    readonly approved_enrollment_loaded_and_registry_binding_matched: true;
    readonly fresh_current_key_binding_validated: true;
    readonly registry_root_and_runs_parent_held_descriptors_revalidated: true;
    readonly runs_parent_current_euid_exact_0700_and_empty_twice: true;
    readonly stage_destination_authorization_lease_and_work_absent_twice: true;
    readonly outer_control_absent_or_exact_empty_twice: true;
    readonly filesystem_namespace_or_file_content_mutation_performed: false;
    readonly common_os_lock_released_before_receipt: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly path_run_id_record_digest_key_instance_uid_or_inode_disclosed: false;
    readonly key_material_or_raw_error_disclosed: false;
    readonly registry_or_control_created_written_removed: false;
    readonly stage_checkpoint_or_authorization_lease_created_written_removed: false;
    readonly registry_or_approved_capability_returned: false;
    readonly application_source_revision_disclosed: false;
    readonly application_source_path_disclosed: false;
    readonly application_source_digest_disclosed: false;
    readonly ignored_untracked_dependency_bytes_verified: false;
    readonly same_uid_race_isolation: false;
    readonly atomic_source_snapshot: false;
    readonly reviewed_git_head_or_ci_status: false;
    readonly kill_reboot_drill_or_monitor_owner: false;
    readonly human_gate_approval: false;
    readonly gate_invoked: false;
    readonly checkpoint: false;
    readonly dataset_read: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export class FloodgateV7ProductionPrefix100PreflightError extends Error {
  readonly decision!: "NO-GO";
  readonly gate!: "durable-prefix-100";
  readonly phase!: FloodgateV7ProductionPrefix100PreflightPhase;
  readonly os_lock_acquired!: boolean;
  readonly os_lock_released!: boolean;
  readonly persistent_mutation_performed!: false;
  readonly gate_invoked!: false;
  readonly retry_disposition!: FloodgateV7ProductionPrefix100PreflightRetryDisposition;
  readonly sensitive_values_disclosed!: false;

  constructor(
    phase: FloodgateV7ProductionPrefix100PreflightPhase,
    osLockAcquired: boolean,
    osLockReleased: boolean,
    retryDisposition: FloodgateV7ProductionPrefix100PreflightRetryDisposition,
  ) {
    super("Floodgate v7 production prefix 100 preflight returned NO-GO");
    defineField(
      this,
      "name",
      "FloodgateV7ProductionPrefix100PreflightError",
      false,
    );
    defineField(
      this,
      "stack",
      "FloodgateV7ProductionPrefix100PreflightError: production prefix 100 preflight returned NO-GO",
      false,
    );
    defineField(this, "decision", "NO-GO", true);
    defineField(this, "gate", "durable-prefix-100", true);
    defineField(this, "phase", phase, true);
    defineField(this, "os_lock_acquired", osLockAcquired, true);
    defineField(this, "os_lock_released", osLockReleased, true);
    defineField(this, "persistent_mutation_performed", false, true);
    defineField(this, "gate_invoked", false, true);
    defineField(this, "retry_disposition", retryDisposition, true);
    defineField(this, "sensitive_values_disclosed", false, true);
    objectFreeze(this);
  }
}

export interface FloodgateV7ProductionPrefix100PreflightDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly loadRegistry: () => Promise<unknown>;
  readonly claimRegistry: (capability: unknown) => unknown;
  readonly captureApplicationSource: () => Promise<unknown>;
  readonly verifyVerifierReadiness: () => Promise<unknown>;
  readonly assertVerifierReadinessIdentityBinding: (
    receipt: unknown,
    expectedEffectiveUserId: number,
    expectedHomeDirectory: string,
  ) => void;
  readonly inspectKeyReadiness: () => Promise<unknown>;
  readonly loadApprovedEnrollment: () => Promise<unknown>;
  readonly claimApprovedEnrollment: (capability: unknown) => unknown;
  readonly verifyExpectedCurrentBinding: (
    expected: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
  ) => Promise<unknown>;
  readonly beforeFinalSnapshotForTests?: () => void | Promise<void>;
  readonly closeDirectoryDescriptorForTests?: (descriptor: number) => void;
}

interface CapturedDependencies {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly loadRegistry: () => Promise<unknown>;
  readonly claimRegistry: (capability: unknown) => unknown;
  readonly captureApplicationSource: () => Promise<unknown>;
  readonly verifyVerifierReadiness: () => Promise<unknown>;
  readonly assertVerifierReadinessIdentityBinding: (
    receipt: unknown,
    expectedEffectiveUserId: number,
    expectedHomeDirectory: string,
  ) => void;
  readonly inspectKeyReadiness: () => Promise<unknown>;
  readonly loadApprovedEnrollment: () => Promise<unknown>;
  readonly claimApprovedEnrollment: (capability: unknown) => unknown;
  readonly verifyExpectedCurrentBinding: (
    expected: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
  ) => Promise<unknown>;
  readonly beforeFinalSnapshot: (() => void | Promise<void>) | undefined;
  readonly closeDirectoryDescriptor: (descriptor: number) => void;
}

interface StatSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

interface HeldDirectory {
  readonly descriptor: number;
  readonly pathname: string;
  readonly initial: Readonly<StatSnapshot>;
}

interface HeldRegistryAnchor {
  readonly descriptor: number;
  readonly pathname: string;
  readonly initial: Readonly<StatSnapshot>;
  readonly bytes: number;
  readonly sha256: string;
}

interface NamespaceState {
  readonly registryRoot: HeldDirectory;
  readonly runs: HeldDirectory;
  readonly controlState: "absent-pristine" | "present-exact-empty";
  readonly control: HeldDirectory | null;
  readonly quarantine: HeldDirectory | null;
  readonly retired: HeldDirectory | null;
  readonly stagePath: string;
  readonly destinationPath: string;
  readonly leasePath: string;
  readonly workPath: string;
}

interface PrivateRegistryClaim {
  readonly approvedKeyBinding: Readonly<{
    readonly recordBytes: number;
    readonly recordSha256: string;
    readonly keyInstanceId: string;
  }>;
  readonly applicationSourceBinding: Readonly<FloodgateV7ProductionApplicationSourceBinding>;
  readonly outerControlStatePaths: Readonly<{
    readonly registryRoot: string;
    readonly runsParent: string;
    readonly stagePath: string;
    readonly destinationPath: string;
    readonly leasePath: string;
    readonly workPath: string;
  }>;
}

interface CoreObservation {
  readonly execution_boundary:
    | typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_EXECUTION_BOUNDARY
    | typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_TEST_EXECUTION_BOUNDARY;
  readonly outer_control: "absent-pristine" | "present-exact-empty";
}

interface SafeFailureProjection {
  readonly phase: FloodgateV7ProductionPrefix100PreflightPhase;
  readonly retry_disposition: FloodgateV7ProductionPrefix100PreflightRetryDisposition;
}

type UnderLockOutcome =
  | Readonly<{
      readonly contract: typeof INTERNAL_OUTCOME_CONTRACT;
      readonly status: "GO-observed-under-outer-lock";
      readonly observation: Readonly<CoreObservation>;
    }>
  | Readonly<{
      readonly contract: typeof INTERNAL_OUTCOME_CONTRACT;
      readonly status: "NO-GO-observed-under-outer-lock";
      readonly failure: Readonly<SafeFailureProjection>;
    }>;

const NativeError = Error;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const nodeIsProxy = nodeUtilTypes.isProxy;
const pathJoin = path.join.bind(path);
const pathResolve = path.resolve.bind(path);
const pathIsAbsolute = path.isAbsolute.bind(path);
const realpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const lstatSync = fs.lstatSync.bind(fs);
const fstatSync = fs.fstatSync.bind(fs);
const openSync = fs.openSync.bind(fs);
const closeSync = fs.closeSync.bind(fs);
const readdirSync = fs.readdirSync.bind(fs);
const readSync = fs.readSync.bind(fs);
const getUserInfo = os.userInfo.bind(os);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const bufferFrom = Buffer.from.bind(Buffer);
const bufferFill = Buffer.prototype.fill;
const nativeTimingSafeEqual = timingSafeEqual;
const HEX_64_RE = /^[0-9a-f]{64}$/u;
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);
const PRIVATE_DIRECTORY_MODE = BigInt(0o700);
const PRIVATE_FILE_MODE = BigInt(0o600);
const DIRECTORY_OPEN_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const FILE_OPEN_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const DEPENDENCY_KEYS = objectFreeze([
  "effectiveUserId",
  "homeDirectory",
  "loadRegistry",
  "claimRegistry",
  "captureApplicationSource",
  "verifyVerifierReadiness",
  "assertVerifierReadinessIdentityBinding",
  "inspectKeyReadiness",
  "loadApprovedEnrollment",
  "claimApprovedEnrollment",
  "verifyExpectedCurrentBinding",
  "beforeFinalSnapshotForTests",
  "closeDirectoryDescriptorForTests",
] as const);
const REQUIRED_DEPENDENCY_KEYS = objectFreeze(DEPENDENCY_KEYS.slice(0, 11));
const VERIFIER_READINESS_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "verification",
  "nonclaims",
] as const);
const VERIFIER_READINESS_VERIFICATION_KEYS = objectFreeze([
  "fixed_current_euid_home_repository_root",
  "fixed_verifier_revision",
  "pinned_receipt_git_closure_checked",
  "closure_receipt_validated",
  "sensitive_values_exported",
] as const);
const VERIFIER_READINESS_NONCLAIM_KEYS = objectFreeze([
  "external_role_bundle_files_read",
  "full_role_bundle_verifier_run",
  "gate_authority",
  "registry_authority",
  "connector_authority",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "playing_strength",
  "path_disclosed",
  "revision_disclosed",
  "digest_disclosed",
  "private_identity_disclosed",
] as const);
const CURRENT_BINDING_NONCLAIM_KEYS = objectFreeze([
  "expected_binding_returned",
  "approved_claim_returned",
  "approval_created",
  "record_created_or_written",
  "key_created_or_written",
  "run_authority",
  "stage_authority",
  "connector_authority",
  "checkpoint_key_capability",
  "checkpoint",
  "runtime",
  "dataset_read",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);
const READINESS_NONCLAIM_KEYS = objectFreeze([
  "key_bytes_read",
  "key_created_or_written",
  "key_instance_id",
  "key_authority",
  "checkpoint",
  "runtime",
  "dataset_read",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "playing_strength",
] as const);

function defineField(
  target: object,
  key: PropertyKey,
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

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("preflight record differs");
    }
    defineField(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function rejected<T = never>(error: unknown): Promise<T> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function publicFailure(
  phase: FloodgateV7ProductionPrefix100PreflightPhase,
  osLockAcquired = false,
  osLockReleased = false,
  retryDisposition: FloodgateV7ProductionPrefix100PreflightRetryDisposition = "operator-reconciliation-required-no-gate",
): FloodgateV7ProductionPrefix100PreflightError {
  return new FloodgateV7ProductionPrefix100PreflightError(
    phase,
    osLockAcquired,
    osLockReleased,
    retryDisposition,
  );
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError(`${label} differs`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) throw new NativeError(`${label} differs`);
  const output: Record<string, unknown> = objectCreate(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(`${label} differs`);
    }
    output[key] = descriptor.value;
  }
  return output;
}

function captureDependencies(
  value: FloodgateV7ProductionPrefix100PreflightDependenciesForTests,
): CapturedDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw publicFailure(
      "capture",
      false,
      false,
      "fix-environment-then-fresh-preflight",
    );
  }
  const dependencyDescriptors = objectGetOwnPropertyDescriptors(value);
  const record = exactRecord(
    value,
    DEPENDENCY_KEYS.filter(
      (key) =>
        dependencyDescriptors[key] !== undefined ||
        REQUIRED_DEPENDENCY_KEYS.includes(key),
    ),
    "preflight dependencies",
  );
  const effectiveUserId = record.effectiveUserId;
  const homeDirectory = record.homeDirectory;
  if (
    typeof effectiveUserId !== "number" ||
    !Number.isSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    homeDirectory.length === 0 ||
    homeDirectory.length > 4096 ||
    !pathIsAbsolute(homeDirectory) ||
    pathResolve(homeDirectory) !== homeDirectory ||
    homeDirectory.includes("\0")
  ) {
    throw publicFailure(
      "capture",
      false,
      false,
      "fix-environment-then-fresh-preflight",
    );
  }
  for (const key of [
    "loadRegistry",
    "claimRegistry",
    "captureApplicationSource",
    "verifyVerifierReadiness",
    "assertVerifierReadinessIdentityBinding",
    "inspectKeyReadiness",
    "loadApprovedEnrollment",
    "claimApprovedEnrollment",
    "verifyExpectedCurrentBinding",
  ] as const) {
    if (typeof record[key] !== "function") {
      throw publicFailure(
        "capture",
        false,
        false,
        "fix-environment-then-fresh-preflight",
      );
    }
  }
  const beforeFinalSnapshot = record.beforeFinalSnapshotForTests;
  const closeDirectoryDescriptor =
    record.closeDirectoryDescriptorForTests ?? closeSync;
  if (
    (beforeFinalSnapshot !== undefined &&
      typeof beforeFinalSnapshot !== "function") ||
    typeof closeDirectoryDescriptor !== "function"
  ) {
    throw publicFailure(
      "capture",
      false,
      false,
      "fix-environment-then-fresh-preflight",
    );
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    loadRegistry: record.loadRegistry as () => Promise<unknown>,
    claimRegistry: record.claimRegistry as (capability: unknown) => unknown,
    captureApplicationSource:
      record.captureApplicationSource as () => Promise<unknown>,
    verifyVerifierReadiness:
      record.verifyVerifierReadiness as () => Promise<unknown>,
    assertVerifierReadinessIdentityBinding:
      record.assertVerifierReadinessIdentityBinding as (
        receipt: unknown,
        expectedEffectiveUserId: number,
        expectedHomeDirectory: string,
      ) => void,
    inspectKeyReadiness: record.inspectKeyReadiness as () => Promise<unknown>,
    loadApprovedEnrollment:
      record.loadApprovedEnrollment as () => Promise<unknown>,
    claimApprovedEnrollment: record.claimApprovedEnrollment as (
      capability: unknown,
    ) => unknown,
    verifyExpectedCurrentBinding: record.verifyExpectedCurrentBinding as (
      expected: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
    ) => Promise<unknown>,
    beforeFinalSnapshot: beforeFinalSnapshot as
      (() => void | Promise<void>) | undefined,
    closeDirectoryDescriptor: closeDirectoryDescriptor as (
      descriptor: number,
    ) => void,
  });
}

function snapshot(stat: fs.BigIntStats): Readonly<StatSnapshot> {
  return frozenRecord({
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

function namedSnapshot(pathname: string): Readonly<StatSnapshot> {
  return snapshot(lstatSync(pathname, { bigint: true }));
}

function heldSnapshot(descriptor: number): Readonly<StatSnapshot> {
  return snapshot(fstatSync(descriptor, { bigint: true }));
}

function sameSnapshot(left: StatSnapshot, right: StatSnapshot): boolean {
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

function safePrivateDirectory(stat: StatSnapshot, uid: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    (stat.mode & MODE_MASK) === PRIVATE_DIRECTORY_MODE &&
    stat.uid === BigInt(uid)
  );
}

function safePrivateRegistryFile(stat: StatSnapshot, uid: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === REGULAR_TYPE &&
    (stat.mode & MODE_MASK) === PRIVATE_FILE_MODE &&
    stat.uid === BigInt(uid) &&
    stat.nlink === BigInt(1) &&
    stat.size >= BigInt(2) &&
    stat.size <= BigInt(FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES)
  );
}

function captureOuterLockAnchor(
  value: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>,
): Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor> {
  const anchor = exactRecord(
    value,
    ["effectiveUserId", "canonicalHome", "registry"],
    "preflight outer-lock anchor",
  );
  const registry = exactRecord(
    anchor.registry,
    ["bytes", "sha256", "dev", "ino"],
    "preflight outer-lock registry anchor",
  );
  if (
    typeof anchor.effectiveUserId !== "number" ||
    !Number.isSafeInteger(anchor.effectiveUserId) ||
    anchor.effectiveUserId < 0 ||
    typeof anchor.canonicalHome !== "string" ||
    !pathIsAbsolute(anchor.canonicalHome) ||
    pathResolve(anchor.canonicalHome) !== anchor.canonicalHome ||
    typeof registry.bytes !== "number" ||
    !Number.isSafeInteger(registry.bytes) ||
    registry.bytes < 2 ||
    registry.bytes > FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES ||
    typeof registry.sha256 !== "string" ||
    !HEX_64_RE.test(registry.sha256) ||
    typeof registry.dev !== "string" ||
    !DECIMAL_RE.test(registry.dev) ||
    typeof registry.ino !== "string" ||
    !DECIMAL_RE.test(registry.ino)
  ) {
    throw new NativeError("preflight outer-lock anchor differs");
  }
  return frozenRecord({
    effectiveUserId: anchor.effectiveUserId,
    canonicalHome: anchor.canonicalHome,
    registry: frozenRecord({
      bytes: registry.bytes,
      sha256: registry.sha256,
      dev: registry.dev,
      ino: registry.ino,
    }),
  });
}

function readHeldRegistryBytes(descriptor: number, length: number): Buffer {
  const bytes = Buffer.alloc(length);
  try {
    let offset = 0;
    while (offset < length) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        length - offset,
        offset,
      );
      if (count < 1) throw new NativeError("registry anchor read differs");
      offset += count;
    }
    const extra = Buffer.alloc(1);
    try {
      if (readSync(descriptor, extra, 0, 1, length) !== 0) {
        throw new NativeError("registry anchor grew during bounded read");
      }
    } finally {
      reflectApply(bufferFill, extra, [0]);
    }
    return bytes;
  } catch (error) {
    reflectApply(bufferFill, bytes, [0]);
    throw error;
  }
}

function openHeldRegistryAnchor(
  anchorValue: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>,
  dependencies: CapturedDependencies,
): HeldRegistryAnchor {
  const anchor = captureOuterLockAnchor(anchorValue);
  if (
    anchor.effectiveUserId !== dependencies.effectiveUserId ||
    anchor.canonicalHome !== dependencies.homeDirectory ||
    realpathSync(dependencies.homeDirectory) !== anchor.canonicalHome
  ) {
    throw new NativeError("preflight dependencies differ from outer anchor");
  }
  const pathname = pathJoin(
    anchor.canonicalHome,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
  if (realpathSync(pathname) !== pathname) {
    throw new NativeError("preflight registry anchor path differs");
  }
  const before = namedSnapshot(pathname);
  if (!safePrivateRegistryFile(before, dependencies.effectiveUserId)) {
    throw new NativeError("preflight registry anchor metadata differs");
  }
  const descriptor = openSync(pathname, FILE_OPEN_FLAGS);
  try {
    const held = heldSnapshot(descriptor);
    const named = namedSnapshot(pathname);
    if (
      !safePrivateRegistryFile(held, dependencies.effectiveUserId) ||
      !safePrivateRegistryFile(named, dependencies.effectiveUserId) ||
      !sameSnapshot(before, held) ||
      !sameSnapshot(before, named) ||
      Number(held.size) !== anchor.registry.bytes ||
      held.dev.toString(10) !== anchor.registry.dev ||
      held.ino.toString(10) !== anchor.registry.ino
    ) {
      throw new NativeError("preflight registry anchor identity differs");
    }
    const bytes = readHeldRegistryBytes(descriptor, anchor.registry.bytes);
    try {
      if (
        createHash("sha256").update(bytes).digest("hex") !==
        anchor.registry.sha256
      ) {
        throw new NativeError("preflight registry anchor digest differs");
      }
    } finally {
      reflectApply(bufferFill, bytes, [0]);
    }
    return frozenRecord({
      descriptor,
      pathname,
      initial: before,
      bytes: anchor.registry.bytes,
      sha256: anchor.registry.sha256,
    });
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function revalidateHeldRegistryAnchor(
  registry: HeldRegistryAnchor,
  dependencies: CapturedDependencies,
): void {
  const held = heldSnapshot(registry.descriptor);
  const named = namedSnapshot(registry.pathname);
  if (
    !safePrivateRegistryFile(held, dependencies.effectiveUserId) ||
    !safePrivateRegistryFile(named, dependencies.effectiveUserId) ||
    !sameSnapshot(registry.initial, held) ||
    !sameSnapshot(registry.initial, named) ||
    Number(held.size) !== registry.bytes ||
    realpathSync(registry.pathname) !== registry.pathname
  ) {
    throw new NativeError("preflight registry anchor changed");
  }
  const bytes = readHeldRegistryBytes(registry.descriptor, registry.bytes);
  try {
    if (createHash("sha256").update(bytes).digest("hex") !== registry.sha256) {
      throw new NativeError("preflight registry anchor bytes changed");
    }
  } finally {
    reflectApply(bufferFill, bytes, [0]);
  }
}

function openHeldDirectory(pathname: string, uid: number): HeldDirectory {
  if (realpathSync(pathname) !== pathname) {
    throw new NativeError("held directory path differs");
  }
  const before = namedSnapshot(pathname);
  if (!safePrivateDirectory(before, uid)) {
    throw new NativeError("held directory metadata differs");
  }
  const descriptor = openSync(pathname, DIRECTORY_OPEN_FLAGS);
  try {
    const held = heldSnapshot(descriptor);
    const named = namedSnapshot(pathname);
    if (
      !safePrivateDirectory(held, uid) ||
      !safePrivateDirectory(named, uid) ||
      !sameSnapshot(before, held) ||
      !sameSnapshot(before, named) ||
      realpathSync(pathname) !== pathname
    ) {
      throw new NativeError("held directory changed during open");
    }
    return frozenRecord({ descriptor, pathname, initial: before });
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function revalidateHeldDirectory(directory: HeldDirectory, uid: number): void {
  const held = heldSnapshot(directory.descriptor);
  const named = namedSnapshot(directory.pathname);
  if (
    !safePrivateDirectory(held, uid) ||
    !safePrivateDirectory(named, uid) ||
    !sameSnapshot(directory.initial, held) ||
    !sameSnapshot(directory.initial, named) ||
    realpathSync(directory.pathname) !== directory.pathname
  ) {
    throw new NativeError("held directory changed before final snapshot");
  }
}

function sortedEntries(pathname: string): readonly string[] {
  return objectFreeze([...readdirSync(pathname)].sort());
}

function exactEntries(pathname: string, expected: readonly string[]): void {
  const actual = sortedEntries(pathname);
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    throw new NativeError("private namespace entries differ");
  }
}

function assertAbsent(pathname: string): void {
  try {
    lstatSync(pathname);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new NativeError("fresh private path is not absent");
}

function equalPrivateHex(left: string, right: unknown): boolean {
  if (
    typeof right !== "string" ||
    !HEX_64_RE.test(left) ||
    !HEX_64_RE.test(right)
  ) {
    return false;
  }
  const leftBytes = bufferFrom(left, "ascii");
  const rightBytes = bufferFrom(right, "ascii");
  try {
    return nativeTimingSafeEqual(leftBytes, rightBytes);
  } finally {
    reflectApply(bufferFill, leftBytes, [0]);
    reflectApply(bufferFill, rightBytes, [0]);
  }
}

function equalPrivateRevision(left: string, right: unknown): boolean {
  if (
    typeof right !== "string" ||
    !REVISION_RE.test(left) ||
    !REVISION_RE.test(right)
  ) {
    return false;
  }
  const leftBytes = bufferFrom(left, "ascii");
  const rightBytes = bufferFrom(right, "ascii");
  try {
    return nativeTimingSafeEqual(leftBytes, rightBytes);
  } finally {
    reflectApply(bufferFill, leftBytes, [0]);
    reflectApply(bufferFill, rightBytes, [0]);
  }
}

function requiredString(value: unknown, expected: string): void {
  if (value !== expected)
    throw new NativeError("fixed registry configuration differs");
}

function captureApplicationSourceBinding(
  value: unknown,
): Readonly<FloodgateV7ProductionApplicationSourceBinding> {
  const binding = exactRecord(
    value,
    ["layout", "revision"],
    "application source binding",
  );
  if (
    binding.layout !== FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT ||
    typeof binding.revision !== "string" ||
    !REVISION_RE.test(binding.revision)
  ) {
    throw new NativeError("application source binding differs");
  }
  return frozenRecord({
    layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
    revision: binding.revision,
  });
}

function capturePrivateRegistryClaim(
  value: unknown,
  dependencies: CapturedDependencies,
): Readonly<PrivateRegistryClaim> {
  const claim = exactRecord(
    value,
    [
      "runId",
      "approvedKeyBinding",
      "applicationSourceBinding",
      "stageAuthorization",
      "consumer",
    ],
    "private registry claim",
  );
  if (typeof claim.runId !== "string" || !HEX_64_RE.test(claim.runId)) {
    throw new NativeError("private registry run id differs");
  }
  const binding = exactRecord(
    claim.approvedKeyBinding,
    ["recordBytes", "recordSha256", "keyInstanceId"],
    "private registry approved binding",
  );
  if (
    typeof binding.recordBytes !== "number" ||
    !Number.isSafeInteger(binding.recordBytes) ||
    binding.recordBytes < 2 ||
    binding.recordBytes >
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES ||
    typeof binding.recordSha256 !== "string" ||
    !HEX_64_RE.test(binding.recordSha256) ||
    typeof binding.keyInstanceId !== "string" ||
    !HEX_64_RE.test(binding.keyInstanceId)
  ) {
    throw new NativeError("private registry approved binding differs");
  }
  const applicationSourceBinding = captureApplicationSourceBinding(
    claim.applicationSourceBinding,
  );
  const stage = exactRecord(
    claim.stageAuthorization,
    [
      "repositoryRoot",
      "rawLockRoot",
      "roleLockRoot",
      "roleBundleRoot",
      "legacyProtectedPositionIdsPath",
      "publicationParent",
      "stageBasename",
      "destinationBasename",
      "engineBin",
      "engineReceipt",
      "engineArgs",
      "evalDir",
    ],
    "private registry stage configuration",
  );
  const consumer = exactRecord(
    claim.consumer,
    [
      "repositoryRoot",
      "verifierRevision",
      "rawLockRoot",
      "roleLockRoot",
      "legacyProtectedPositionIdsPath",
      "outputRoot",
    ],
    "private registry consumer configuration",
  );
  const home = dependencies.homeDirectory;
  const registryRoot = pathJoin(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  const runsParent = pathJoin(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
  const repositoryRoot = pathJoin(
    home,
    ".codex",
    "worktrees",
    "shogi-floodgate-role-bundle",
  );
  const rawLockRoot = pathJoin(
    home,
    ".codex",
    "shogi-data",
    "floodgate-q1-2026-raw-lock",
  );
  const roleLockRoot = pathJoin(
    home,
    ".codex",
    "shogi-data",
    "floodgate-q1-2026-role-lock-v1",
  );
  const roleBundleRoot = pathJoin(
    home,
    ".codex",
    "shogi-bundles",
    "floodgate-q1-2026-label-free-role-bundle-v2",
  );
  const protectedIds = pathJoin(
    repositoryRoot,
    "ml",
    "data",
    "wcsc36",
    "int16-aware-replay-excluded-position-ids.txt",
  );
  const assetRoot = pathJoin(
    home,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  const stageBasename = `floodgate-v7-${claim.runId}-stage`;
  const destinationBasename = `floodgate-v7-${claim.runId}-final`;
  for (const [actual, expected] of [
    [stage.repositoryRoot, repositoryRoot],
    [stage.rawLockRoot, rawLockRoot],
    [stage.roleLockRoot, roleLockRoot],
    [stage.roleBundleRoot, roleBundleRoot],
    [stage.legacyProtectedPositionIdsPath, protectedIds],
    [stage.publicationParent, runsParent],
    [stage.stageBasename, stageBasename],
    [stage.destinationBasename, destinationBasename],
    [stage.engineBin, pathJoin(assetRoot, "engine", "yaneuraou")],
    [
      stage.engineReceipt,
      pathJoin(assetRoot, "engine", "yaneuraou-receipt.json"),
    ],
    [stage.evalDir, pathJoin(assetRoot, "eval")],
    [consumer.repositoryRoot, repositoryRoot],
    [
      consumer.verifierRevision,
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
    ],
    [consumer.rawLockRoot, rawLockRoot],
    [consumer.roleLockRoot, roleLockRoot],
    [consumer.legacyProtectedPositionIdsPath, protectedIds],
    [consumer.outputRoot, roleBundleRoot],
  ] as const) {
    requiredString(actual, expected);
  }
  if (
    !Array.isArray(stage.engineArgs) ||
    nodeIsProxy(stage.engineArgs) ||
    reflectOwnKeys(stage.engineArgs).length !== 1 ||
    stage.engineArgs.length !== 0
  ) {
    throw new NativeError("fixed engine args differ");
  }
  const stagePath = pathJoin(runsParent, stageBasename);
  const destinationPath = pathJoin(runsParent, destinationBasename);
  return frozenRecord({
    approvedKeyBinding: frozenRecord({
      recordBytes: binding.recordBytes,
      recordSha256: binding.recordSha256,
      keyInstanceId: binding.keyInstanceId,
    }),
    applicationSourceBinding,
    outerControlStatePaths: frozenRecord({
      registryRoot,
      runsParent,
      stagePath,
      destinationPath,
      leasePath: pathJoin(runsParent, `.${stageBasename}.authorization-lease`),
      workPath: pathJoin(
        stagePath,
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      ),
    }),
  });
}

function validateVerifierReadinessReceipt(
  value: unknown,
  production: boolean,
): void {
  const receipt = exactRecord(
    value,
    VERIFIER_READINESS_RECEIPT_KEYS,
    "verifier readiness receipt",
  );
  const verification = exactRecord(
    receipt.verification,
    VERIFIER_READINESS_VERIFICATION_KEYS,
    "verifier readiness verification",
  );
  const nonclaims = exactRecord(
    receipt.nonclaims,
    VERIFIER_READINESS_NONCLAIM_KEYS,
    "verifier readiness nonclaims",
  );
  const expectedBoundary = production
    ? "production-fixed-current-euid-userinfo-home-role-bundle-receipt-git-closure"
    : "test-only-injected-current-euid-home-role-bundle-receipt-git-closure";
  if (
    receipt.contract !==
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT ||
    receipt.status !==
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== expectedBoundary ||
    verification.fixed_current_euid_home_repository_root !== true ||
    verification.fixed_verifier_revision !== true ||
    verification.pinned_receipt_git_closure_checked !== true ||
    verification.closure_receipt_validated !== true ||
    verification.sensitive_values_exported !== false
  ) {
    throw new NativeError("verifier readiness receipt differs");
  }
  for (const key of VERIFIER_READINESS_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new NativeError("verifier readiness nonclaim differs");
    }
  }
}

function validateReadinessReceipt(value: unknown, production: boolean): void {
  const receipt = exactRecord(
    value,
    [
      "contract",
      "status",
      "claim_boundary",
      "trust_boundary",
      "execution_boundary",
      "deployment",
      "nonclaims",
    ],
    "deployment key readiness receipt",
  );
  const deployment = exactRecord(
    receipt.deployment,
    ["layout", "parent", "key", "authoritative_reopen_required"],
    "deployment key readiness deployment",
  );
  const nonclaims = exactRecord(
    receipt.nonclaims,
    READINESS_NONCLAIM_KEYS,
    "deployment key readiness nonclaims",
  );
  if (
    receipt.contract !== FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT ||
    receipt.status !== "ready" ||
    receipt.claim_boundary !==
      FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY ||
    receipt.trust_boundary !==
      FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY ||
    receipt.execution_boundary !==
      (production
        ? "production-fixed-current-euid-userinfo-home-metadata"
        : "test-only-injected-current-euid-home-metadata") ||
    deployment.layout !== "fixed-current-euid-userinfo-home-v1" ||
    deployment.parent !== "present-current-euid-exact-0700-directory" ||
    deployment.key !==
      "present-current-euid-exact-0600-regular-nlink-1-32-bytes" ||
    deployment.authoritative_reopen_required !== true
  ) {
    throw new NativeError("deployment key is not exactly ready");
  }
  for (const key of READINESS_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false)
      throw new NativeError("readiness nonclaim differs");
  }
}

function captureApprovedBinding(
  value: unknown,
  production: boolean,
): Readonly<{
  recordBytes: number;
  recordSha256: string;
  keyInstanceId: string;
}> {
  const claim = exactRecord(
    value,
    [
      "execution_boundary",
      "record",
      "candidate_receipt",
      "approval",
      "key_id",
      "key_instance_id",
      "deployment_identity",
    ],
    "approved enrollment claim",
  );
  const record = exactRecord(
    claim.record,
    ["bytes", "sha256"],
    "approved enrollment record binding",
  );
  if (
    claim.execution_boundary !==
      (production
        ? "production-fixed-current-euid-userinfo-home-control-plane-record"
        : "test-only-injected-current-euid-home-control-plane-record") ||
    typeof record.bytes !== "number" ||
    !Number.isSafeInteger(record.bytes) ||
    record.bytes < 2 ||
    record.bytes > FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES ||
    typeof record.sha256 !== "string" ||
    !HEX_64_RE.test(record.sha256) ||
    typeof claim.key_instance_id !== "string" ||
    !HEX_64_RE.test(claim.key_instance_id)
  ) {
    throw new NativeError("approved enrollment binding differs");
  }
  return frozenRecord({
    recordBytes: record.bytes,
    recordSha256: record.sha256,
    keyInstanceId: claim.key_instance_id,
  });
}

function validateExpectedCurrentBindingReceipt(
  value: unknown,
  production: boolean,
): void {
  const receipt = exactRecord(
    value,
    [
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
      "algorithm",
      "verification",
      "nonclaims",
    ],
    "current binding receipt",
  );
  const verification = exactRecord(
    receipt.verification,
    [
      "approved_record_reloaded_and_validated",
      "current_key_freshly_inspected",
      "approved_to_current_exact_binding_match",
      "reloaded_approved_to_private_expected_exact_match",
      "held_descriptors_revalidated",
      "memory_only",
      "sensitive_values_exported",
    ],
    "current binding verification",
  );
  const nonclaims = exactRecord(
    receipt.nonclaims,
    CURRENT_BINDING_NONCLAIM_KEYS,
    "current binding nonclaims",
  );
  if (
    receipt.contract !==
      FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT ||
    receipt.status !==
      FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY ||
    receipt.execution_boundary !==
      (production
        ? "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding"
        : "test-only-injected-current-euid-home-approved-record-current-key-binding") ||
    receipt.algorithm !==
      FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM ||
    verification.approved_record_reloaded_and_validated !== true ||
    verification.current_key_freshly_inspected !== true ||
    verification.approved_to_current_exact_binding_match !== true ||
    verification.reloaded_approved_to_private_expected_exact_match !== true ||
    verification.held_descriptors_revalidated !== true ||
    verification.memory_only !== true ||
    verification.sensitive_values_exported !== false
  ) {
    throw new NativeError("fresh current key binding differs");
  }
  for (const key of CURRENT_BINDING_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false)
      throw new NativeError("current binding nonclaim differs");
  }
}

function initialNamespace(
  claim: Readonly<PrivateRegistryClaim>,
  dependencies: CapturedDependencies,
): NamespaceState {
  const paths = claim.outerControlStatePaths;
  const registryRoot = openHeldDirectory(
    paths.registryRoot,
    dependencies.effectiveUserId,
  );
  let runs: HeldDirectory | undefined;
  let control: HeldDirectory | null = null;
  let quarantine: HeldDirectory | null = null;
  let retired: HeldDirectory | null = null;
  let failurePhase: FloodgateV7ProductionPrefix100PreflightPhase =
    "runs-namespace-open";
  try {
    runs = openHeldDirectory(paths.runsParent, dependencies.effectiveUserId);
    failurePhase = "initial-snapshot";
    exactEntries(paths.runsParent, []);
    assertAbsent(paths.stagePath);
    assertAbsent(paths.destinationPath);
    assertAbsent(paths.leasePath);
    assertAbsent(paths.workPath);
    const controlPath = pathJoin(
      paths.registryRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
    );
    failurePhase = "outer-control";
    let state: NamespaceState["controlState"];
    try {
      lstatSync(controlPath);
      state = "present-exact-empty";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = "absent-pristine";
    }
    if (state === "absent-pristine") {
      exactEntries(
        paths.registryRoot,
        [
          FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
          FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
        ].sort(),
      );
    } else {
      control = openHeldDirectory(controlPath, dependencies.effectiveUserId);
      const quarantinePath = pathJoin(
        controlPath,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
      );
      const retiredPath = pathJoin(
        controlPath,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
      );
      quarantine = openHeldDirectory(
        quarantinePath,
        dependencies.effectiveUserId,
      );
      retired = openHeldDirectory(retiredPath, dependencies.effectiveUserId);
      exactEntries(
        paths.registryRoot,
        [
          FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
          FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
        ].sort(),
      );
      exactEntries(
        controlPath,
        [
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
        ].sort(),
      );
      exactEntries(quarantinePath, []);
      exactEntries(retiredPath, []);
      assertAbsent(
        pathJoin(
          controlPath,
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
        ),
      );
    }
    return frozenRecord({
      registryRoot,
      runs,
      controlState: state,
      control,
      quarantine,
      retired,
      stagePath: paths.stagePath,
      destinationPath: paths.destinationPath,
      leasePath: paths.leasePath,
      workPath: paths.workPath,
    });
  } catch (error) {
    let cleanupFailed = false;
    for (const directory of [
      retired,
      quarantine,
      control,
      runs,
      registryRoot,
    ]) {
      if (directory !== null && directory !== undefined) {
        try {
          dependencies.closeDirectoryDescriptor(directory.descriptor);
        } catch {
          cleanupFailed = true;
        }
      }
    }
    if (cleanupFailed) throw publicFailure("cleanup");
    if (error instanceof FloodgateV7ProductionPrefix100PreflightError) {
      throw error;
    }
    throw publicFailure(failurePhase);
  }
}

function finalNamespace(
  state: NamespaceState,
  dependencies: CapturedDependencies,
): void {
  for (const directory of [
    state.registryRoot,
    state.runs,
    state.control,
    state.quarantine,
    state.retired,
  ]) {
    if (directory !== null)
      revalidateHeldDirectory(directory, dependencies.effectiveUserId);
  }
  exactEntries(state.runs.pathname, []);
  assertAbsent(state.stagePath);
  assertAbsent(state.destinationPath);
  assertAbsent(state.leasePath);
  assertAbsent(state.workPath);
  const controlPath = pathJoin(
    state.registryRoot.pathname,
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  );
  if (state.controlState === "absent-pristine") {
    assertAbsent(controlPath);
    exactEntries(
      state.registryRoot.pathname,
      [
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
        FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
      ].sort(),
    );
  } else {
    exactEntries(
      state.registryRoot.pathname,
      [
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
        FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
      ].sort(),
    );
    exactEntries(
      controlPath,
      [
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
      ].sort(),
    );
    exactEntries(state.quarantine!.pathname, []);
    exactEntries(state.retired!.pathname, []);
    assertAbsent(
      pathJoin(controlPath, FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME),
    );
  }
}

function closeNamespace(
  state: NamespaceState,
  dependencies: CapturedDependencies,
): void {
  let failed = false;
  for (const directory of [
    state.retired,
    state.quarantine,
    state.control,
    state.runs,
    state.registryRoot,
  ]) {
    if (directory === null) continue;
    try {
      dependencies.closeDirectoryDescriptor(directory.descriptor);
    } catch {
      failed = true;
    }
  }
  if (failed) throw publicFailure("cleanup");
}

async function inspectCapturedWithBoundRegistry(
  dependencies: CapturedDependencies,
  production: boolean,
): Promise<Readonly<CoreObservation>> {
  let phase: FloodgateV7ProductionPrefix100PreflightPhase = "registry-load";
  let registryCapability: unknown;
  try {
    registryCapability = await dependencies.loadRegistry();
  } catch (error) {
    if (error instanceof FloodgateV7ProductionPrefix100PreflightError) {
      throw error;
    }
    throw publicFailure(phase);
  }
  let privateClaim: Readonly<PrivateRegistryClaim>;
  try {
    phase = "registry-claim";
    const rawClaim = dependencies.claimRegistry(registryCapability);
    phase = "registry-fixed-configuration";
    privateClaim = capturePrivateRegistryClaim(rawClaim, dependencies);
  } catch (error) {
    if (error instanceof FloodgateV7ProductionPrefix100PreflightError) {
      throw error;
    }
    throw publicFailure(phase);
  }

  try {
    phase = "application-source";
    const observedApplicationSource = captureApplicationSourceBinding(
      await dependencies.captureApplicationSource(),
    );
    if (
      observedApplicationSource.layout !==
        privateClaim.applicationSourceBinding.layout ||
      !equalPrivateRevision(
        privateClaim.applicationSourceBinding.revision,
        observedApplicationSource.revision,
      )
    ) {
      throw new NativeError("registry application source binding differs");
    }
  } catch (error) {
    if (error instanceof FloodgateV7ProductionPrefix100PreflightError) {
      throw error;
    }
    throw publicFailure(phase);
  }

  try {
    phase = "verifier-readiness";
    const readinessReceipt = await dependencies.verifyVerifierReadiness();
    validateVerifierReadinessReceipt(readinessReceipt, production);
    dependencies.assertVerifierReadinessIdentityBinding(
      readinessReceipt,
      dependencies.effectiveUserId,
      dependencies.homeDirectory,
    );
  } catch (error) {
    if (error instanceof FloodgateV7ProductionPrefix100PreflightError) {
      throw error;
    }
    throw publicFailure(phase);
  }

  let namespace: NamespaceState;
  try {
    phase = "runs-namespace-open";
    namespace = initialNamespace(privateClaim, dependencies);
  } catch (error) {
    if (error instanceof FloodgateV7ProductionPrefix100PreflightError) {
      throw error;
    }
    throw publicFailure(phase);
  }

  let primary: unknown;
  try {
    phase = "key-readiness";
    validateReadinessReceipt(
      await dependencies.inspectKeyReadiness(),
      production,
    );

    phase = "approved-record-load";
    const approvedCapability = await dependencies.loadApprovedEnrollment();
    phase = "approved-record-claim";
    const approved = captureApprovedBinding(
      dependencies.claimApprovedEnrollment(approvedCapability),
      production,
    );
    phase = "approved-binding";
    if (
      approved.recordBytes !== privateClaim.approvedKeyBinding.recordBytes ||
      !equalPrivateHex(
        privateClaim.approvedKeyBinding.recordSha256,
        approved.recordSha256,
      ) ||
      !equalPrivateHex(
        privateClaim.approvedKeyBinding.keyInstanceId,
        approved.keyInstanceId,
      )
    ) {
      throw new NativeError("registry and approved enrollment binding differ");
    }

    phase = "current-binding";
    validateExpectedCurrentBindingReceipt(
      await dependencies.verifyExpectedCurrentBinding(
        privateClaim.approvedKeyBinding,
      ),
      production,
    );

    await dependencies.beforeFinalSnapshot?.();
    phase = "final-snapshot";
    finalNamespace(namespace, dependencies);
  } catch (error) {
    primary =
      error instanceof FloodgateV7ProductionPrefix100PreflightError
        ? error
        : publicFailure(phase);
  }
  try {
    closeNamespace(namespace, dependencies);
  } catch {
    throw publicFailure("cleanup");
  }
  if (primary !== undefined) throw primary;
  return frozenRecord({
    execution_boundary: production
      ? FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_EXECUTION_BOUNDARY
      : FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_TEST_EXECUTION_BOUNDARY,
    outer_control: namespace.controlState,
  });
}

async function inspectCaptured(
  dependencies: CapturedDependencies,
  production: boolean,
  anchor: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>,
): Promise<Readonly<CoreObservation>> {
  let registry: HeldRegistryAnchor | undefined;
  let registryRoot: HeldDirectory | undefined;
  try {
    registry = openHeldRegistryAnchor(anchor, dependencies);
    registryRoot = openHeldDirectory(
      pathJoin(
        anchor.canonicalHome,
        ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
      ),
      dependencies.effectiveUserId,
    );
  } catch {
    let cleanupFailed = false;
    for (const descriptor of [registryRoot?.descriptor, registry?.descriptor]) {
      if (descriptor === undefined) continue;
      try {
        dependencies.closeDirectoryDescriptor(descriptor);
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) throw publicFailure("cleanup");
    throw publicFailure("registry-fixed-configuration");
  }
  if (registry === undefined || registryRoot === undefined) {
    throw publicFailure("registry-fixed-configuration");
  }
  let observation: Readonly<CoreObservation> | undefined;
  let primary: unknown;
  try {
    observation = await inspectCapturedWithBoundRegistry(
      dependencies,
      production,
    );
    revalidateHeldRegistryAnchor(registry, dependencies);
    revalidateHeldDirectory(registryRoot, dependencies.effectiveUserId);
  } catch (error) {
    primary = error;
  }
  let cleanupFailed = false;
  try {
    dependencies.closeDirectoryDescriptor(registry.descriptor);
  } catch {
    cleanupFailed = true;
  }
  try {
    dependencies.closeDirectoryDescriptor(registryRoot.descriptor);
  } catch {
    cleanupFailed = true;
  }
  if (cleanupFailed) throw publicFailure("cleanup");
  if (primary !== undefined) throw primary;
  if (observation === undefined) throw publicFailure("receipt");
  return observation;
}

function observeTestOuterLockAnchor(
  dependencies: CapturedDependencies,
): Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor> {
  if (realpathSync(dependencies.homeDirectory) !== dependencies.homeDirectory) {
    throw publicFailure("capture");
  }
  const pathname = pathJoin(
    dependencies.homeDirectory,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
  const descriptor = openSync(pathname, FILE_OPEN_FLAGS);
  try {
    const held = heldSnapshot(descriptor);
    const named = namedSnapshot(pathname);
    if (
      !safePrivateRegistryFile(held, dependencies.effectiveUserId) ||
      !sameSnapshot(held, named) ||
      realpathSync(pathname) !== pathname
    ) {
      throw new NativeError("test registry anchor differs");
    }
    const length = Number(held.size);
    const bytes = readHeldRegistryBytes(descriptor, length);
    try {
      return frozenRecord({
        effectiveUserId: dependencies.effectiveUserId,
        canonicalHome: dependencies.homeDirectory,
        registry: frozenRecord({
          bytes: length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          dev: held.dev.toString(10),
          ino: held.ino.toString(10),
        }),
      });
    } finally {
      reflectApply(bufferFill, bytes, [0]);
    }
  } catch {
    throw publicFailure("registry-fixed-configuration");
  } finally {
    try {
      dependencies.closeDirectoryDescriptor(descriptor);
    } catch {
      throw publicFailure("cleanup");
    }
  }
}

/** Test-only observation core. It issues only a test-boundary observation. */
export function inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(
  dependenciesValue: FloodgateV7ProductionPrefix100PreflightDependenciesForTests,
): Promise<Readonly<CoreObservation>> {
  if (arguments.length !== 1) {
    return rejected(
      publicFailure(
        "capture",
        false,
        false,
        "fix-environment-then-fresh-preflight",
      ),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(
      publicFailure(
        "capture",
        false,
        false,
        "fix-environment-then-fresh-preflight",
      ),
    );
  }
  let anchor: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>;
  try {
    anchor = observeTestOuterLockAnchor(dependencies);
  } catch (error) {
    return rejected(error);
  }
  return inspectCaptured(dependencies, false, anchor);
}

function safeOutcomeFailure(error: unknown): Readonly<SafeFailureProjection> {
  if (
    error instanceof FloodgateV7ProductionPrefix100PreflightError &&
    error.phase !== "outer-gate-lock"
  ) {
    return frozenRecord({
      phase: error.phase,
      retry_disposition: error.retry_disposition,
    });
  }
  return frozenRecord({
    phase: "receipt" as const,
    retry_disposition: "operator-reconciliation-required-no-gate" as const,
  });
}

function productionDependencies(): CapturedDependencies {
  if (getEffectiveUserId === null) {
    throw publicFailure(
      "production-identity",
      true,
      false,
      "fix-environment-then-fresh-preflight",
    );
  }
  const effectiveUserId = getEffectiveUserId();
  const user = getUserInfo();
  if (user.uid !== effectiveUserId) {
    throw publicFailure(
      "production-identity",
      true,
      false,
      "fix-environment-then-fresh-preflight",
    );
  }
  return captureDependencies({
    effectiveUserId,
    homeDirectory: pathResolve(user.homedir),
    loadRegistry: loadFloodgateV7ProductionConnectorRegistry,
    claimRegistry: (capability) =>
      claimFloodgateV7ProductionConnectorRegistry(
        capability as Parameters<
          typeof claimFloodgateV7ProductionConnectorRegistry
        >[0],
      ),
    captureApplicationSource:
      captureFloodgateV7ProductionApplicationSourceProvenance,
    verifyVerifierReadiness:
      verifyFloodgateV7ProductionConnectorVerifierReadiness,
    assertVerifierReadinessIdentityBinding:
      assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding,
    inspectKeyReadiness: inspectFloodgateV7DeploymentKeyReadiness,
    loadApprovedEnrollment: loadFloodgateV7ApprovedKeyEnrollment,
    claimApprovedEnrollment: (capability) =>
      claimFloodgateV7ApprovedKeyEnrollment(
        capability as Parameters<
          typeof claimFloodgateV7ApprovedKeyEnrollment
        >[0],
      ),
    verifyExpectedCurrentBinding:
      verifyFloodgateV7ApprovedKeyCurrentBindingAgainstExpected,
  });
}

/** Fixed capability-required operation loaded lazily by the outer owner. */
export async function inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock(
  capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
): Promise<Readonly<UnderLockOutcome>> {
  if (arguments.length !== 1) {
    return frozenRecord({
      contract: INTERNAL_OUTCOME_CONTRACT,
      status: "NO-GO-observed-under-outer-lock" as const,
      failure: frozenRecord({
        phase: "capture" as const,
        retry_disposition: "fix-environment-then-fresh-preflight" as const,
      }),
    });
  }
  try {
    const anchor =
      claimFloodgateV7ProductionPrefix100PreflightOuterLockCapability(
        capability,
      );
    const observation = await inspectCaptured(
      productionDependencies(),
      true,
      anchor,
    );
    return frozenRecord({
      contract: INTERNAL_OUTCOME_CONTRACT,
      status: "GO-observed-under-outer-lock" as const,
      observation,
    });
  } catch (error) {
    return frozenRecord({
      contract: INTERNAL_OUTCOME_CONTRACT,
      status: "NO-GO-observed-under-outer-lock" as const,
      failure: safeOutcomeFailure(error),
    });
  }
}

/** Test-only capability composition mirror with an injected private home. */
export async function inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests(
  capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
  dependenciesValue: FloodgateV7ProductionPrefix100PreflightDependenciesForTests,
): Promise<Readonly<UnderLockOutcome>> {
  if (arguments.length !== 2) {
    return frozenRecord({
      contract: INTERNAL_OUTCOME_CONTRACT,
      status: "NO-GO-observed-under-outer-lock" as const,
      failure: frozenRecord({
        phase: "capture" as const,
        retry_disposition: "fix-environment-then-fresh-preflight" as const,
      }),
    });
  }
  try {
    const anchor =
      claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
        capability,
      );
    const observation = await inspectCaptured(
      captureDependencies(dependenciesValue),
      false,
      anchor,
    );
    return frozenRecord({
      contract: INTERNAL_OUTCOME_CONTRACT,
      status: "GO-observed-under-outer-lock" as const,
      observation,
    });
  } catch (error) {
    return frozenRecord({
      contract: INTERNAL_OUTCOME_CONTRACT,
      status: "NO-GO-observed-under-outer-lock" as const,
      failure: safeOutcomeFailure(error),
    });
  }
}

function validateOuterLockReceipt(value: unknown): void {
  const receipt = exactRecord(
    value,
    ["contract", "status", "execution_boundary", "verification", "nonclaims"],
    "preflight outer lock receipt",
  );
  const verification = exactRecord(
    receipt.verification,
    [
      "common_os_lock_acquired_nonblocking",
      "common_os_lock_held_around_fixed_preflight",
      "registry_anchor_held_descriptor_and_bytes_revalidated",
      "common_os_lock_released_before_receipt",
      "persistent_namespace_or_file_content_mutation_performed",
    ],
    "preflight outer lock verification",
  );
  const nonclaims = exactRecord(
    receipt.nonclaims,
    [
      "registry_path_or_bytes_disclosed",
      "registry_digest_or_identity_disclosed",
      "key_material_disclosed",
      "active_lease_created_or_written",
      "control_namespace_created_or_written",
      "connector_capability_issued",
      "gate_invoked",
      "checkpoint",
      "teacher_label",
      "training",
      "weight",
      "live_evaluation_activation",
      "match",
      "playing_strength",
    ],
    "preflight outer lock nonclaims",
  );
  if (
    receipt.contract !==
      FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_CONTRACT ||
    receipt.status !==
      FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_STATUS ||
    receipt.execution_boundary !==
      "production-fixed-current-euid-home-native-descriptor-close" ||
    verification.common_os_lock_acquired_nonblocking !== true ||
    verification.common_os_lock_held_around_fixed_preflight !== true ||
    verification.registry_anchor_held_descriptor_and_bytes_revalidated !==
      true ||
    verification.common_os_lock_released_before_receipt !== true ||
    verification.persistent_namespace_or_file_content_mutation_performed !==
      false
  )
    throw new NativeError("preflight outer lock receipt differs");
  for (const key of objectKeys(nonclaims)) {
    if (nonclaims[key] !== false)
      throw new NativeError("preflight outer lock nonclaim differs");
  }
}

function captureOutcome(value: unknown): UnderLockOutcome {
  const record = exactRecord(
    value,
    [
      "contract",
      "status",
      value !== null &&
      typeof value === "object" &&
      "status" in value &&
      (value as { status?: unknown }).status === "GO-observed-under-outer-lock"
        ? "observation"
        : "failure",
    ],
    "preflight under-lock outcome",
  );
  if (record.contract !== INTERNAL_OUTCOME_CONTRACT)
    throw new NativeError("preflight outcome contract differs");
  if (record.status === "GO-observed-under-outer-lock") {
    const observation = exactRecord(
      record.observation,
      ["execution_boundary", "outer_control"],
      "preflight observation",
    );
    if (
      observation.execution_boundary !==
        FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_EXECUTION_BOUNDARY ||
      (observation.outer_control !== "absent-pristine" &&
        observation.outer_control !== "present-exact-empty")
    )
      throw new NativeError("preflight observation differs");
    return frozenRecord({
      contract: INTERNAL_OUTCOME_CONTRACT,
      status: "GO-observed-under-outer-lock" as const,
      observation: frozenRecord({
        execution_boundary:
          FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_EXECUTION_BOUNDARY,
        outer_control: observation.outer_control,
      }),
    });
  }
  if (record.status !== "NO-GO-observed-under-outer-lock")
    throw new NativeError("preflight outcome status differs");
  const failure = exactRecord(
    record.failure,
    ["phase", "retry_disposition"],
    "preflight failure projection",
  );
  if (!isPhase(failure.phase) || !isRetryDisposition(failure.retry_disposition))
    throw new NativeError("preflight failure projection differs");
  return frozenRecord({
    contract: INTERNAL_OUTCOME_CONTRACT,
    status: "NO-GO-observed-under-outer-lock" as const,
    failure: frozenRecord({
      phase: failure.phase,
      retry_disposition: failure.retry_disposition,
    }),
  });
}

/** Test-only strict projection of an under-lock outcome. */
export function captureFloodgateV7ProductionPrefix100PreflightOutcomeCoreForTests(
  value: unknown,
): Readonly<UnderLockOutcome> {
  return captureOutcome(value);
}

function isPhase(
  value: unknown,
): value is FloodgateV7ProductionPrefix100PreflightPhase {
  return [
    "capture",
    "production-identity",
    "outer-gate-lock",
    "runs-namespace-open",
    "initial-snapshot",
    "outer-control",
    "registry-load",
    "registry-claim",
    "registry-fixed-configuration",
    "application-source",
    "verifier-readiness",
    "key-readiness",
    "approved-record-load",
    "approved-record-claim",
    "approved-binding",
    "current-binding",
    "final-snapshot",
    "cleanup",
    "receipt",
  ].includes(value as FloodgateV7ProductionPrefix100PreflightPhase);
}

function isRetryDisposition(
  value: unknown,
): value is FloodgateV7ProductionPrefix100PreflightRetryDisposition {
  return (
    value === "wait-for-current-owner-then-fresh-preflight" ||
    value === "fix-environment-then-fresh-preflight" ||
    value === "operator-reconciliation-required-no-gate"
  );
}

function buildPublicReceipt(
  observation: Readonly<CoreObservation>,
): Readonly<FloodgateV7ProductionPrefix100PreflightReceipt> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_STATUS,
    claim_boundary: FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_CLAIM_BOUNDARY,
    execution_boundary:
      FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_EXECUTION_BOUNDARY,
    gate: "durable-prefix-100" as const,
    decision: frozenRecord({
      result: "GO" as const,
      scope: "read-only-core-preconditions-only" as const,
      gate_invocation_authorized: false as const,
    }),
    outer_control: observation.outer_control,
    verification: frozenRecord({
      common_os_lock_acquired_nonblocking: true as const,
      common_os_lock_held_through_all_checks: true as const,
      registry_anchor_held_descriptor_and_bytes_revalidated: true as const,
      private_registry_claimed_and_fixed_configuration_validated: true as const,
      application_source_binding_matched_to_exact_clean_tracked_application_closure:
        true as const,
      verifier_source_artifact_closure_rechecked: true as const,
      deployment_key_metadata_ready: true as const,
      approved_enrollment_loaded_and_registry_binding_matched: true as const,
      fresh_current_key_binding_validated: true as const,
      registry_root_and_runs_parent_held_descriptors_revalidated: true as const,
      runs_parent_current_euid_exact_0700_and_empty_twice: true as const,
      stage_destination_authorization_lease_and_work_absent_twice:
        true as const,
      outer_control_absent_or_exact_empty_twice: true as const,
      filesystem_namespace_or_file_content_mutation_performed: false as const,
      common_os_lock_released_before_receipt: true as const,
    }),
    nonclaims: frozenRecord({
      path_run_id_record_digest_key_instance_uid_or_inode_disclosed:
        false as const,
      key_material_or_raw_error_disclosed: false as const,
      registry_or_control_created_written_removed: false as const,
      stage_checkpoint_or_authorization_lease_created_written_removed:
        false as const,
      registry_or_approved_capability_returned: false as const,
      application_source_revision_disclosed: false as const,
      application_source_path_disclosed: false as const,
      application_source_digest_disclosed: false as const,
      ignored_untracked_dependency_bytes_verified: false as const,
      same_uid_race_isolation: false as const,
      atomic_source_snapshot: false as const,
      reviewed_git_head_or_ci_status: false as const,
      kill_reboot_drill_or_monitor_owner: false as const,
      human_gate_approval: false as const,
      gate_invoked: false as const,
      checkpoint: false as const,
      dataset_read: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

/** Zero-argument public production preflight. */
export function inspectFloodgateV7ProductionPrefix100Preflight(): Promise<
  Readonly<FloodgateV7ProductionPrefix100PreflightReceipt>
> {
  if (arguments.length !== 0) {
    return rejected(
      publicFailure(
        "capture",
        false,
        false,
        "fix-environment-then-fresh-preflight",
      ),
    );
  }
  return (async () => {
    let outer: unknown;
    try {
      outer = await runFloodgateV7ProductionPrefix100PreflightOuterLock();
    } catch (error) {
      let retry: FloodgateV7ProductionPrefix100PreflightRetryDisposition =
        "operator-reconciliation-required-no-gate";
      let lockAcquired = false;
      try {
        if (error === null || typeof error !== "object" || nodeIsProxy(error)) {
          throw new NativeError("outer lock failure differs");
        }
        const descriptors = objectGetOwnPropertyDescriptors(error);
        const disposition = descriptors.disposition;
        const acquired = descriptors.os_lock_acquired;
        const sensitive = descriptors.sensitive_values_disclosed;
        if (
          disposition === undefined ||
          !("value" in disposition) ||
          acquired === undefined ||
          !("value" in acquired) ||
          typeof acquired.value !== "boolean" ||
          sensitive === undefined ||
          !("value" in sensitive) ||
          sensitive.value !== false
        ) {
          throw new NativeError("outer lock failure differs");
        }
        lockAcquired = acquired.value;
        if (disposition.value === "another-gate-invocation-active")
          retry = "wait-for-current-owner-then-fresh-preflight";
      } catch {
        /* sanitized fallback */
      }
      throw publicFailure("outer-gate-lock", lockAcquired, false, retry);
    }
    try {
      const result = exactRecord(
        outer,
        ["value", "lock"],
        "outer preflight result",
      );
      validateOuterLockReceipt(result.lock);
      const outcome = captureOutcome(result.value);
      if (outcome.status === "NO-GO-observed-under-outer-lock") {
        throw publicFailure(
          outcome.failure.phase,
          true,
          true,
          outcome.failure.retry_disposition,
        );
      }
      return buildPublicReceipt(outcome.observation);
    } catch (error) {
      if (error instanceof FloodgateV7ProductionPrefix100PreflightError)
        throw error;
      throw publicFailure("receipt", true, true);
    }
  })();
}
