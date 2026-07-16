/**
 * Process-lifetime exclusion and authenticated crash evidence for all three
 * fixed Floodgate v7 production connector gates.
 *
 * The immutable private registry descriptor is the lock anchor. The absolute
 * macOS lockf utility applies a nonblocking BSD flock to that inherited open
 * file description; the parent then retains the descriptor for the complete
 * operation, so descriptor close or process death releases the kernel lock.
 * A crash can leave the authenticated lease record behind, but never makes it
 * reusable. Ordinary runners only inspect and stop. A separate explicit
 * confirmation capability must freshly re-inspect the exact source before a
 * no-clobber quarantine move, and any quarantine entry blocks every gate.
 */

import { Buffer } from "node:buffer";
import {
  createHmac,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-v7-deployment-key-authority";
import { FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS } from "./floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES,
} from "./floodgate-v7-production-connector-registry";

export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT =
  "shogi-floodgate-v7-production-outer-gate-lease-v1" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS =
  "all-fixed-gates-serialized-by-os-lifetime-lock-and-authenticated-durable-lease" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM =
  "macos-lockf-inherited-registry-open-file-description-hkdf-sha256-canonical-hmac-sha256-v1" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-home-native-descriptor-close" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_TEST_EXECUTION_BOUNDARY =
  "test-only-injected-home-key-lock-helper-and-descriptor-close" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_SALT =
  "shogi-floodgate-v7-production-outer-gate-lease-salt-v1\0" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_INFO =
  "shogi-floodgate-v7-production-outer-gate-lease-key-v1\0" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HMAC_DOMAIN =
  "shogi-floodgate-v7-production-outer-gate-lease-record-v1\0" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME =
  "outer-gate-control-v1" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME =
  "active-lease.json" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME =
  "quarantine" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME =
  "retired" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_MANUAL_CONFIRMATION =
  "QUARANTINE AUTHENTICATED STALE FLOODGATE V7 OUTER GATE LEASE" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_INSPECTION_CONTRACT =
  "shogi-floodgate-v7-production-outer-gate-stale-inspection-v1" as const;
export const FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_CONTRACT =
  "shogi-floodgate-v7-production-outer-gate-explicit-quarantine-v1" as const;

export type FloodgateV7ProductionOuterGate =
  "durable-prefix-100" | "durable-prefix-500" | "sealed-final-24000";

export type FloodgateV7ProductionOuterGateLeasePhase =
  | "capture"
  | "production-identity"
  | "key-read"
  | "namespace"
  | "os-lock"
  | "prefix-100-preflight"
  | "stale-inspection"
  | "quarantine"
  | "lease-publish"
  | "operation"
  | "cleanup";

export type FloodgateV7ProductionOuterGateLeaseDisposition =
  | "fresh-invocation-allowed"
  | "another-gate-invocation-active"
  | "manual-reconciliation-required";

export type FloodgateV7ProductionOuterGateLeasePublishFailpointForTests =
  | "after-staging-create"
  | "after-active-link-before-control-sync"
  | "after-durable-active-publish-before-staging-cleanup"
  | "after-staging-unlink-before-quarantine-sync";

export interface FloodgateV7ProductionOuterGateLeaseReceipt {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS;
  readonly algorithm: typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM;
  readonly execution_boundary:
    | typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY
    | typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_TEST_EXECUTION_BOUNDARY;
  readonly verification: Readonly<{
    readonly one_os_lifetime_lock_shared_by_all_three_gates: true;
    readonly os_lifetime_lock_held_before_operation: true;
    readonly authenticated_lease_metadata_durable_before_operation: true;
    readonly signal_and_exit_preserve_stale_evidence: true;
    readonly authenticated_lease_removed_durably_after_operation: true;
    readonly authenticated_retired_evidence_durable_after_operation: true;
    readonly os_lifetime_lock_released_after_operation: true;
    readonly quarantine_empty_after_operation: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly lock_or_lease_path_disclosed: false;
    readonly lease_metadata_disclosed: false;
    readonly key_material_disclosed: false;
    readonly key_instance_id_disclosed: false;
    readonly lease_mac_disclosed: false;
    readonly connector_receipt_disclosed: false;
    readonly graceful_signal_cleanup: false;
    readonly checkpoint: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7ProductionOuterGateLeaseOperationResult<T> {
  readonly value: T;
  readonly lease: Readonly<FloodgateV7ProductionOuterGateLeaseReceipt>;
}

export interface FloodgateV7ProductionOuterGateConnectorCapability {
  readonly contract: "shogi-floodgate-v7-production-outer-gate-connector-capability-v1";
  readonly status: "opaque-single-use-valid-only-while-common-os-lock-is-held";
}

export const FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-read-only-outer-lock-v1" as const;
export const FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_STATUS =
  "common-os-lock-held-around-read-only-prefix-100-preflight-and-released" as const;

export interface FloodgateV7ProductionPrefix100PreflightOuterLockCapability {
  readonly contract: "shogi-floodgate-v7-production-prefix-100-read-only-outer-lock-capability-v1";
  readonly status: "opaque-single-use-valid-only-while-common-os-lock-is-held-without-lease-publication";
}

/** Private in-process binding returned only for an exact single-use claim. */
export interface FloodgateV7ProductionPrefix100PreflightOuterLockAnchor {
  readonly effectiveUserId: number;
  readonly canonicalHome: string;
  readonly registry: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
    readonly dev: string;
    readonly ino: string;
  }>;
}

export interface FloodgateV7ProductionPrefix100PreflightOuterLockReceipt {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_STATUS;
  readonly execution_boundary:
    | "production-fixed-current-euid-home-native-descriptor-close"
    | "test-only-injected-home-lock-helper-and-descriptor-close";
  readonly verification: Readonly<{
    readonly common_os_lock_acquired_nonblocking: true;
    readonly common_os_lock_held_around_fixed_preflight: true;
    readonly registry_anchor_held_descriptor_and_bytes_revalidated: true;
    readonly common_os_lock_released_before_receipt: true;
    readonly persistent_namespace_or_file_content_mutation_performed: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly registry_path_or_bytes_disclosed: false;
    readonly registry_digest_or_identity_disclosed: false;
    readonly key_material_disclosed: false;
    readonly active_lease_created_or_written: false;
    readonly control_namespace_created_or_written: false;
    readonly connector_capability_issued: false;
    readonly gate_invoked: false;
    readonly checkpoint: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7ProductionPrefix100PreflightOuterLockResult<T> {
  readonly value: T;
  readonly lock: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockReceipt>;
}

export interface FloodgateV7ProductionPrefix100PreflightOuterLockDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly lockfPath?: string;
  readonly closeLockDescriptorForTests?: (descriptor: number) => void;
}

export interface FloodgateV7ProductionOuterGateStaleInspectionCapability {
  readonly contract: "shogi-floodgate-v7-production-outer-gate-stale-inspection-capability-v1";
  readonly status: "opaque-single-use-confirm-or-cancel";
}

export interface FloodgateV7ProductionOuterGateStaleInspectionResult {
  readonly capability: Readonly<FloodgateV7ProductionOuterGateStaleInspectionCapability>;
  readonly receipt: Readonly<{
    readonly contract: typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_INSPECTION_CONTRACT;
    readonly status: "authenticated-stale-source-held-for-explicit-confirmation";
    readonly verification: Readonly<{
      readonly os_lifetime_lock_held: true;
      readonly exact_stale_source_descriptor_inspected: true;
      readonly lease_hmac_authenticated: true;
      readonly registry_binding_matched: true;
      readonly quarantine_empty: true;
      readonly source_mutated: false;
    }>;
    readonly nonclaims: Readonly<{
      readonly quarantine_performed: false;
      readonly stale_source_removed: false;
      readonly quarantine_acknowledged_or_deleted: false;
      readonly path_or_metadata_disclosed: false;
      readonly key_material_or_mac_disclosed: false;
    }>;
  }>;
}

export interface FloodgateV7ProductionOuterGateQuarantineReceipt {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_CONTRACT;
  readonly status: "explicitly-confirmed-exact-stale-source-quarantined-and-all-gates-blocked";
  readonly verification: Readonly<{
    readonly explicit_confirmation_matched: true;
    readonly os_lifetime_lock_remained_held: true;
    readonly exact_source_freshly_reinspected: true;
    readonly lease_hmac_reauthenticated: true;
    readonly registry_binding_rematched: true;
    readonly create_only_quarantine_published_durably: true;
    readonly stale_source_removal_durable: true;
    readonly quarantine_blocks_all_three_gates: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly quarantine_acknowledged_or_deleted: false;
    readonly next_gate_authorized: false;
    readonly path_or_metadata_disclosed: false;
    readonly key_material_or_mac_disclosed: false;
  }>;
}

export class FloodgateV7ProductionOuterGateLeaseError extends Error {
  readonly phase!: FloodgateV7ProductionOuterGateLeasePhase;
  readonly disposition!: FloodgateV7ProductionOuterGateLeaseDisposition;
  readonly os_lock_acquired!: boolean;
  readonly authenticated_lease_published!: boolean;
  readonly stale_lease_quarantined!: boolean;
  readonly stale_lease_authenticated!: boolean | null;
  readonly quarantine_blocks_all_gates!: boolean;
  readonly sensitive_values_disclosed!: false;

  constructor(
    phase: FloodgateV7ProductionOuterGateLeasePhase,
    disposition: FloodgateV7ProductionOuterGateLeaseDisposition,
    osLockAcquired: boolean,
    leasePublished: boolean,
    staleLeaseQuarantined: boolean,
    quarantineBlocksAllGates: boolean,
    staleLeaseAuthenticated: boolean | null = null,
  ) {
    super("Floodgate v7 production outer gate lease failed");
    defineField(
      this,
      "name",
      "FloodgateV7ProductionOuterGateLeaseError",
      false,
    );
    defineField(
      this,
      "stack",
      "FloodgateV7ProductionOuterGateLeaseError: production outer gate lease failed",
      false,
    );
    defineField(this, "phase", phase, true);
    defineField(this, "disposition", disposition, true);
    defineField(this, "os_lock_acquired", osLockAcquired, true);
    defineField(this, "authenticated_lease_published", leasePublished, true);
    defineField(this, "stale_lease_quarantined", staleLeaseQuarantined, true);
    defineField(
      this,
      "stale_lease_authenticated",
      staleLeaseAuthenticated,
      true,
    );
    defineField(
      this,
      "quarantine_blocks_all_gates",
      quarantineBlocksAllGates,
      true,
    );
    defineField(this, "sensitive_values_disclosed", false, true);
    objectFreeze(this);
  }
}

export interface FloodgateV7ProductionOuterGateLeaseDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly rootKey: Uint8Array;
  readonly hostname?: string;
  readonly pid?: number;
  readonly now?: () => Date;
  readonly nonce?: () => Uint8Array;
  readonly lockfPath?: string;
  readonly installProcessLifecycleHandlers?: boolean;
  readonly afterLeasePublishBeforeValidationForTests?: () => void;
  readonly leasePublishFailpointForTests?: (
    event: FloodgateV7ProductionOuterGateLeasePublishFailpointForTests,
  ) => void;
  readonly afterActiveUnlinkBeforeDirectorySyncForTests?: () => void;
  readonly closeLockDescriptorForTests?: (descriptor: number) => void;
  /** Test-only mirror of the fixed production key reread after preflight. */
  readonly rereadRootKeyAfterPrefix100PreflightForTests?: () => Uint8Array;
}

interface CapturedDependencies {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly rootKey: Buffer;
  readonly hostname: string;
  readonly pid: number;
  readonly now: () => Date;
  readonly nonce: () => Uint8Array;
  readonly lockfPath: string;
  readonly installProcessLifecycleHandlers: boolean;
  readonly afterLeasePublishBeforeValidation: (() => void) | undefined;
  readonly leasePublishFailpoint:
    | ((
        event: FloodgateV7ProductionOuterGateLeasePublishFailpointForTests,
      ) => void)
    | undefined;
  readonly afterActiveUnlinkBeforeDirectorySync: (() => void) | undefined;
  readonly closeLockDescriptor: (descriptor: number) => void;
  readonly rereadRootKeyAfterPrefix100Preflight: (() => Uint8Array) | undefined;
}

interface CapturedPrefix100PreflightOuterLockDependencies {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly lockfPath: string;
  readonly closeLockDescriptor: (descriptor: number) => void;
}

interface LeaseRecordWithoutMac {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT;
  readonly status: "active-authenticated-production-gate-lease";
  readonly algorithm: "hkdf-sha256-canonical-hmac-sha256-v1";
  readonly gate: FloodgateV7ProductionOuterGate;
  readonly owner: Readonly<{
    readonly uid: number;
    readonly pid: number;
    readonly hostname: string;
    readonly started_at_utc: string;
    readonly nonce: string;
  }>;
  readonly key_instance_id: string;
  readonly registry_binding: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
    readonly dev: string;
    readonly ino: string;
  }>;
}

interface LeaseRecord extends LeaseRecordWithoutMac {
  readonly mac: string;
}

interface LeasePaths {
  readonly registryRoot: string;
  readonly registryPath: string;
  readonly controlRoot: string;
  readonly activePath: string;
  readonly quarantineRoot: string;
  readonly retiredRoot: string;
}

interface LockHelper {
  readonly descriptor: number;
  readonly registry: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
    readonly dev: bigint;
    readonly ino: bigint;
  }>;
  readonly close: () => Promise<void>;
  readonly closeSync: () => void;
}

interface ActiveLease {
  readonly bytes: Buffer;
  readonly dev: bigint;
  readonly ino: bigint;
}

interface ManualInspectionState {
  readonly helper: LockHelper;
  readonly paths: LeasePaths;
  readonly active: ActiveLease;
  readonly leaseKey: Buffer;
  readonly keyInstanceId: string;
  readonly effectiveUserId: number;
  readonly nonce: () => Uint8Array;
  readonly removeLifecycleHandlers: (() => void) | null;
}

const NativeError = Error;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectIsFrozen = Object.isFrozen;
const objectPrototype = Object.prototype;
const nodeIsProxy = nodeUtilTypes.isProxy;
const bufferFrom = Buffer.from.bind(Buffer);
const bufferAlloc = Buffer.alloc.bind(Buffer);
const nativeBufferFill = Buffer.prototype.fill;
const nativeTimingSafeEqual = timingSafeEqual;
const nativeReflectApply = Reflect.apply;
const nativeReflectOwnKeys = Reflect.ownKeys;
const nativeArrayIncludes = Array.prototype.includes;
const jsonParse = JSON.parse.bind(JSON);
const jsonStringify = JSON.stringify.bind(JSON);
const pathJoin = path.join.bind(path);
const pathResolve = path.resolve.bind(path);
const pathIsAbsolute = path.isAbsolute.bind(path);
const nativeRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const getHostname = os.hostname.bind(os);
const processKill = process.kill.bind(process);
const processOn = process.on.bind(process);
const processRemoveListener = process.removeListener.bind(process);
const processRemoveAllListeners = process.removeAllListeners.bind(process);
const nativeCloseSync = fs.closeSync.bind(fs);
// Captured once and used lazily only after the outer lock is held. Mutation
// owners additionally publish their authenticated active lease first.
const capturedRequire = require;
const modeMask = 0o7777;
const privateDirectoryMode = 0o700;
const privateFileMode = 0o600;
const MAX_LEASE_BYTES = 16 * 1024;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const HOSTNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SIGNALS = objectFreeze(["SIGHUP", "SIGINT", "SIGTERM"] as const);
const LOCKF_PATH = "/usr/bin/lockf" as const;
const OUTER_GATE_DEPENDENCY_KEYS = objectFreeze([
  "effectiveUserId",
  "homeDirectory",
  "rootKey",
  "hostname",
  "pid",
  "now",
  "nonce",
  "lockfPath",
  "installProcessLifecycleHandlers",
  "afterLeasePublishBeforeValidationForTests",
  "leasePublishFailpointForTests",
  "afterActiveUnlinkBeforeDirectorySyncForTests",
  "closeLockDescriptorForTests",
  "rereadRootKeyAfterPrefix100PreflightForTests",
] as const);
const LEASE_RECORD_KEYS = objectFreeze([
  "contract",
  "status",
  "algorithm",
  "gate",
  "owner",
  "key_instance_id",
  "registry_binding",
  "mac",
] as const);
const LEASE_OWNER_KEYS = objectFreeze([
  "uid",
  "pid",
  "hostname",
  "started_at_utc",
  "nonce",
] as const);
const LEASE_REGISTRY_BINDING_KEYS = objectFreeze([
  "bytes",
  "sha256",
  "dev",
  "ino",
] as const);
const productionManualInspections = new WeakMap<
  object,
  ManualInspectionState
>();
const testManualInspections = new WeakMap<object, ManualInspectionState>();
const productionConnectorCapabilities = new WeakMap<
  object,
  FloodgateV7ProductionOuterGate
>();
const testConnectorCapabilities = new WeakMap<
  object,
  FloodgateV7ProductionOuterGate
>();
const productionPrefix100PreflightCapabilities = new WeakMap<
  object,
  Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>
>();
const testPrefix100PreflightCapabilities = new WeakMap<
  object,
  Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>
>();

type ConnectorCapabilityBoundary =
  "production" | "test-fixed-owner" | "test-generic";

type LeaseExecutionPolicy =
  | Readonly<{ readonly kind: "ordinary-fixed-gate" }>
  | Readonly<{
      readonly kind: "prefix-100-same-lock-one-shot";
      readonly preflightBoundary: Prefix100PreflightCapabilityBoundary;
      readonly loadPreflightModule: Prefix100PreflightModuleLoader;
    }>;

type FixedRunnerExportName =
  | "runFloodgateV7ProductionConnectorPrefix100UnderOuterGate"
  | "runFloodgateV7ProductionConnectorPrefix500UnderOuterGate"
  | "runFloodgateV7ProductionConnectorFinal24000UnderOuterGate";

type FixedRunnerModuleLoader = () => unknown;

type Prefix100PreflightCapabilityBoundary = "production" | "test-only";
type Prefix100PreflightModuleLoader = () => unknown;

const PREFIX_100_UNDER_LOCK_OUTCOME_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-read-only-preflight-under-lock-outcome-v1" as const;
const PREFIX_100_PRODUCTION_PREFLIGHT_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-common-os-lock" as const;
const PREFIX_100_TEST_PREFLIGHT_EXECUTION_BOUNDARY =
  "test-only-injected-current-euid-home-read-only-observation" as const;
const PREFIX_100_RUNNER_CONTRACT =
  "shogi-floodgate-v7-production-connector-runner-v1" as const;
const PREFIX_100_RUNNER_STATUS =
  "registry-approved-current-bound-production-connector-gate-complete" as const;
const PREFIX_100_RUNNER_CLAIM_BOUNDARY =
  "one-fixed-production-gate-after-private-registry-approved-record-and-current-key-binding-without-public-run-binding-options-or-raw-connector-receipt-v1" as const;
const PREFIX_100_RUNNER_EXECUTION_BOUNDARY =
  "production-fixed-gate-private-registry-and-capability-owners" as const;

function claimConnectorCapabilityFromRegistry(
  capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
  registry: WeakMap<object, FloodgateV7ProductionOuterGate>,
): FloodgateV7ProductionOuterGate {
  if (capability === null || typeof capability !== "object") {
    throw new NativeError("outer gate connector capability differs");
  }
  const gate = registry.get(capability);
  if (gate === undefined) {
    throw new NativeError("outer gate connector capability differs");
  }
  registry.delete(capability);
  return gate;
}

/**
 * Consume one exact production capability synchronously. Only the connector
 * calls this, before any production capability composition starts.
 */
export function claimFloodgateV7ProductionOuterGateConnectorCapability(
  capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
): FloodgateV7ProductionOuterGate {
  if (arguments.length !== 1) {
    throw new NativeError("outer gate connector capability differs");
  }
  return claimConnectorCapabilityFromRegistry(
    capability,
    productionConnectorCapabilities,
  );
}

/** Test-only mirror of the production single-use capability claim. */
export function claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
  capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
): FloodgateV7ProductionOuterGate {
  if (arguments.length !== 1) {
    throw new NativeError("outer gate connector capability differs");
  }
  return claimConnectorCapabilityFromRegistry(
    capability,
    testConnectorCapabilities,
  );
}

function claimPrefix100PreflightCapabilityFromRegistry(
  capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
  registry: WeakMap<
    object,
    Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>
  >,
): Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor> {
  const anchor =
    capability !== null && typeof capability === "object"
      ? registry.get(capability)
      : undefined;
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeIsProxy(capability) ||
    anchor === undefined
  ) {
    throw new NativeError("prefix 100 preflight outer-lock capability differs");
  }
  registry.delete(capability);
  return anchor;
}

function prefix100PreflightCapabilityRegistry(
  boundary: Prefix100PreflightCapabilityBoundary,
): WeakMap<
  object,
  Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor>
> {
  return boundary === "production"
    ? productionPrefix100PreflightCapabilities
    : testPrefix100PreflightCapabilities;
}

function mintPrefix100PreflightCapabilityUnderHeldLock(
  helper: LockHelper,
  effectiveUserId: number,
  homeDirectory: string,
  boundary: Prefix100PreflightCapabilityBoundary,
): Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability> {
  const canonicalHome = nativeRealpathSync(homeDirectory);
  if (canonicalHome !== homeDirectory) {
    throw new NativeError("prefix 100 preflight home is not canonical");
  }
  const capability = frozenRecord({
    contract:
      "shogi-floodgate-v7-production-prefix-100-read-only-outer-lock-capability-v1" as const,
    status:
      "opaque-single-use-valid-only-while-common-os-lock-is-held-without-lease-publication" as const,
  });
  prefix100PreflightCapabilityRegistry(boundary).set(
    capability,
    frozenRecord({
      effectiveUserId,
      canonicalHome,
      registry: frozenRecord({
        bytes: helper.registry.bytes,
        sha256: helper.registry.sha256,
        dev: helper.registry.dev.toString(10),
        ino: helper.registry.ino.toString(10),
      }),
    }),
  );
  return capability;
}

function discardPrefix100PreflightCapability(
  capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
): void {
  productionPrefix100PreflightCapabilities.delete(capability);
  testPrefix100PreflightCapabilities.delete(capability);
}

/** Consumed only by the fixed production read-only preflight module. */
export function claimFloodgateV7ProductionPrefix100PreflightOuterLockCapability(
  capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
): Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor> {
  if (arguments.length !== 1) {
    throw new NativeError("prefix 100 preflight outer-lock capability differs");
  }
  return claimPrefix100PreflightCapabilityFromRegistry(
    capability,
    productionPrefix100PreflightCapabilities,
  );
}

/** Test-only mirror isolated from the production capability registry. */
export function claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
  capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
): Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockAnchor> {
  if (arguments.length !== 1) {
    throw new NativeError("prefix 100 preflight outer-lock capability differs");
  }
  return claimPrefix100PreflightCapabilityFromRegistry(
    capability,
    testPrefix100PreflightCapabilities,
  );
}

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
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!("value" in descriptor)) throw new NativeError("record differs");
    defineField(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function fail(
  phase: FloodgateV7ProductionOuterGateLeasePhase,
  disposition: FloodgateV7ProductionOuterGateLeaseDisposition,
  osLockAcquired = false,
  leasePublished = false,
  staleLeaseQuarantined = false,
  quarantineBlocksAllGates = false,
  staleLeaseAuthenticated: boolean | null = null,
): never {
  throw new FloodgateV7ProductionOuterGateLeaseError(
    phase,
    disposition,
    osLockAcquired,
    leasePublished,
    staleLeaseQuarantined,
    quarantineBlocksAllGates,
    staleLeaseAuthenticated,
  );
}

function sanitizedLeaseFailure(
  error: unknown,
  phase: FloodgateV7ProductionOuterGateLeasePhase,
  osLockAcquired = false,
  leasePublished = false,
  staleLeaseQuarantined = false,
  quarantineBlocksAllGates = false,
): FloodgateV7ProductionOuterGateLeaseError {
  try {
    if (
      error !== null &&
      typeof error === "object" &&
      !nodeIsProxy(error) &&
      objectGetPrototypeOf(error) ===
        FloodgateV7ProductionOuterGateLeaseError.prototype
    ) {
      const descriptors = objectGetOwnPropertyDescriptors(error);
      const data = (key: string): unknown => {
        const descriptor = descriptors[key];
        return descriptor !== undefined && "value" in descriptor
          ? descriptor.value
          : undefined;
      };
      const typedPhase = data("phase");
      const disposition = data("disposition");
      const typedOsLockAcquired = data("os_lock_acquired");
      const typedLeasePublished = data("authenticated_lease_published");
      const typedStaleLeaseQuarantined = data("stale_lease_quarantined");
      const typedStaleLeaseAuthenticated = data("stale_lease_authenticated");
      const typedQuarantineBlocksAllGates = data("quarantine_blocks_all_gates");
      if (
        isLeasePhase(typedPhase) &&
        isLeaseDisposition(disposition) &&
        typeof typedOsLockAcquired === "boolean" &&
        typeof typedLeasePublished === "boolean" &&
        typeof typedStaleLeaseQuarantined === "boolean" &&
        (typedStaleLeaseAuthenticated === null ||
          typeof typedStaleLeaseAuthenticated === "boolean") &&
        typeof typedQuarantineBlocksAllGates === "boolean" &&
        data("sensitive_values_disclosed") === false
      ) {
        // Reconstruct instead of returning the caught object. Besides keeping
        // unknown properties and raw stacks out of the public boundary, the
        // known execution state is a lower bound: a later typed helper error
        // must never downgrade a lease that was already durably published or
        // an operation boundary that was already crossed.
        return new FloodgateV7ProductionOuterGateLeaseError(
          typedPhase,
          disposition,
          osLockAcquired || typedOsLockAcquired,
          leasePublished || typedLeasePublished,
          staleLeaseQuarantined || typedStaleLeaseQuarantined,
          quarantineBlocksAllGates || typedQuarantineBlocksAllGates,
          typedStaleLeaseAuthenticated,
        );
      }
    }
  } catch {
    // Proxies, hostile prototypes, and malformed descriptors are unknown
    // failures. Only the already captured monotonic state is published.
  }
  return new FloodgateV7ProductionOuterGateLeaseError(
    phase,
    "manual-reconciliation-required",
    osLockAcquired,
    leasePublished,
    staleLeaseQuarantined,
    quarantineBlocksAllGates,
  );
}

function isLeasePhase(
  value: unknown,
): value is FloodgateV7ProductionOuterGateLeasePhase {
  return (
    value === "capture" ||
    value === "production-identity" ||
    value === "key-read" ||
    value === "namespace" ||
    value === "os-lock" ||
    value === "prefix-100-preflight" ||
    value === "stale-inspection" ||
    value === "quarantine" ||
    value === "lease-publish" ||
    value === "operation" ||
    value === "cleanup"
  );
}

function isLeaseDisposition(
  value: unknown,
): value is FloodgateV7ProductionOuterGateLeaseDisposition {
  return (
    value === "fresh-invocation-allowed" ||
    value === "another-gate-invocation-active" ||
    value === "manual-reconciliation-required"
  );
}

function captureGate(value: unknown): FloodgateV7ProductionOuterGate {
  if (
    value !== "durable-prefix-100" &&
    value !== "durable-prefix-500" &&
    value !== "sealed-final-24000"
  ) {
    fail("capture", "fresh-invocation-allowed");
  }
  return value;
}

function zero(value: Buffer): void {
  nativeReflectApply(nativeBufferFill, value, [0]);
}

function canonicalAbsolute(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    !pathIsAbsolute(value) ||
    pathResolve(value) !== value ||
    value.includes("\0")
  ) {
    throw new NativeError(`${label} differs`);
  }
  return value;
}

function captureDependencies(
  value: FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
): CapturedDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    fail("capture", "fresh-invocation-allowed");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of nativeReflectOwnKeys(descriptors)) {
    const descriptor = descriptors[key as keyof typeof descriptors];
    if (
      typeof key !== "string" ||
      !nativeReflectApply(nativeArrayIncludes, OUTER_GATE_DEPENDENCY_KEYS, [
        key,
      ]) ||
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail("capture", "fresh-invocation-allowed");
    }
  }
  const effectiveUserId = value.effectiveUserId;
  const pid = value.pid ?? process.pid;
  const hostname = value.hostname ?? getHostname();
  const now = value.now ?? (() => new Date());
  const nonce = value.nonce ?? (() => randomBytes(32));
  const lockfPath = value.lockfPath ?? LOCKF_PATH;
  if (
    !Number.isSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    !Number.isSafeInteger(pid) ||
    pid < 1 ||
    typeof hostname !== "string" ||
    !HOSTNAME_RE.test(hostname) ||
    typeof now !== "function" ||
    typeof nonce !== "function" ||
    (value.afterActiveUnlinkBeforeDirectorySyncForTests !== undefined &&
      typeof value.afterActiveUnlinkBeforeDirectorySyncForTests !==
        "function") ||
    (value.afterLeasePublishBeforeValidationForTests !== undefined &&
      typeof value.afterLeasePublishBeforeValidationForTests !== "function") ||
    (value.leasePublishFailpointForTests !== undefined &&
      typeof value.leasePublishFailpointForTests !== "function") ||
    (value.closeLockDescriptorForTests !== undefined &&
      typeof value.closeLockDescriptorForTests !== "function") ||
    (value.rereadRootKeyAfterPrefix100PreflightForTests !== undefined &&
      (typeof value.rereadRootKeyAfterPrefix100PreflightForTests !==
        "function" ||
        nodeIsProxy(value.rereadRootKeyAfterPrefix100PreflightForTests))) ||
    !(value.rootKey instanceof Uint8Array) ||
    value.rootKey.byteLength !== FLOODGATE_V7_DEPLOYMENT_KEY_BYTES
  ) {
    fail("capture", "fresh-invocation-allowed");
  }
  const rootKey = bufferFrom(value.rootKey);
  return frozenRecord({
    effectiveUserId,
    homeDirectory: canonicalAbsolute(value.homeDirectory, "home"),
    rootKey,
    hostname,
    pid,
    now,
    nonce,
    lockfPath: canonicalAbsolute(lockfPath, "lockf path"),
    installProcessLifecycleHandlers:
      value.installProcessLifecycleHandlers === true,
    afterLeasePublishBeforeValidation:
      value.afterLeasePublishBeforeValidationForTests,
    leasePublishFailpoint: value.leasePublishFailpointForTests,
    afterActiveUnlinkBeforeDirectorySync:
      value.afterActiveUnlinkBeforeDirectorySyncForTests,
    closeLockDescriptor: value.closeLockDescriptorForTests ?? nativeCloseSync,
    rereadRootKeyAfterPrefix100Preflight:
      value.rereadRootKeyAfterPrefix100PreflightForTests,
  });
}

function capturePrefix100PreflightOuterLockDependencies(
  value: FloodgateV7ProductionPrefix100PreflightOuterLockDependenciesForTests,
): CapturedPrefix100PreflightOuterLockDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    fail("capture", "fresh-invocation-allowed");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = nativeReflectOwnKeys(value);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        (key !== "effectiveUserId" &&
          key !== "homeDirectory" &&
          key !== "lockfPath" &&
          key !== "closeLockDescriptorForTests"),
    )
  ) {
    fail("capture", "fresh-invocation-allowed");
  }
  const data = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail("capture", "fresh-invocation-allowed");
    }
    return descriptor.value;
  };
  const optionalData = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (descriptor === undefined) return undefined;
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      fail("capture", "fresh-invocation-allowed");
    }
    return descriptor.value;
  };
  const effectiveUserId = data("effectiveUserId");
  const homeDirectory = data("homeDirectory");
  const lockfPath = optionalData("lockfPath") ?? LOCKF_PATH;
  const closeLockDescriptor =
    optionalData("closeLockDescriptorForTests") ?? nativeCloseSync;
  if (
    typeof effectiveUserId !== "number" ||
    !Number.isSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    typeof lockfPath !== "string" ||
    typeof closeLockDescriptor !== "function"
  ) {
    fail("capture", "fresh-invocation-allowed");
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory: canonicalAbsolute(homeDirectory, "home"),
    lockfPath: canonicalAbsolute(lockfPath, "lockf path"),
    closeLockDescriptor: closeLockDescriptor as (descriptor: number) => void,
  });
}

function statIsPrivateDirectory(stat: fs.Stats, uid: number): boolean {
  return (
    stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    stat.uid === uid &&
    (stat.mode & modeMask) === privateDirectoryMode
  );
}

function statIsPrivateFile(
  stat: fs.Stats | fs.BigIntStats,
  uid: number,
  requireOneLink = true,
): boolean {
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    Number(stat.uid) === uid &&
    (Number(stat.mode) & modeMask) === privateFileMode &&
    (!requireOneLink || Number(stat.nlink) === 1)
  );
}

function syncDirectory(directory: string): void {
  const descriptor = fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function ensurePrivateDirectory(
  directory: string,
  parent: string,
  uid: number,
): void {
  try {
    fs.mkdirSync(directory, { mode: privateDirectoryMode });
    syncDirectory(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = fs.lstatSync(directory);
  if (!statIsPrivateDirectory(stat, uid)) {
    throw new NativeError("private directory differs");
  }
}

function leasePaths(home: string): LeasePaths {
  const registryRoot = pathJoin(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  const controlRoot = pathJoin(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  );
  return frozenRecord({
    registryRoot,
    registryPath: pathJoin(
      registryRoot,
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
    ),
    controlRoot,
    activePath: pathJoin(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
    ),
    quarantineRoot: pathJoin(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
    ),
    retiredRoot: pathJoin(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
    ),
  });
}

function prepareNamespaceAfterLock(home: string, uid: number): LeasePaths {
  const paths = leasePaths(home);
  const registryStat = fs.lstatSync(paths.registryRoot);
  if (!statIsPrivateDirectory(registryStat, uid)) {
    throw new NativeError("registry root differs");
  }
  ensurePrivateDirectory(paths.controlRoot, paths.registryRoot, uid);
  ensurePrivateDirectory(paths.quarantineRoot, paths.controlRoot, uid);
  ensurePrivateDirectory(paths.retiredRoot, paths.controlRoot, uid);
  const entries = fs.readdirSync(paths.controlRoot);
  for (const entry of entries) {
    if (
      entry !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME &&
      entry !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME &&
      entry !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME
    ) {
      fail(
        "namespace",
        "manual-reconciliation-required",
        false,
        false,
        false,
        true,
      );
    }
  }
  return paths;
}

function verifyRootOwnedHelper(pathname: string): void {
  const stat = fs.lstatSync(pathname);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0 ||
    (stat.mode & 0o022) !== 0
  ) {
    throw new NativeError("absolute lockf helper differs");
  }
}

function acquireOsLock(
  registryPath: string,
  uid: number,
  lockfPath: string,
  closeDescriptor: (descriptor: number) => void,
): LockHelper {
  verifyRootOwnedHelper(lockfPath);
  const descriptor = fs.openSync(
    registryPath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  let closed = false;
  const closeHeldDescriptor = (): void => {
    if (closed) return;
    closed = true;
    closeDescriptor(descriptor);
  };
  try {
    const held = fs.fstatSync(descriptor, { bigint: true });
    const named = fs.lstatSync(registryPath, { bigint: true });
    if (
      !statIsPrivateFile(held, uid) ||
      held.dev !== named.dev ||
      held.ino !== named.ino ||
      held.size < BigInt(2) ||
      held.size > BigInt(FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES)
    ) {
      throw new NativeError("registry lock anchor differs");
    }
    const registryBytes = fs.readFileSync(descriptor);
    if (BigInt(registryBytes.length) !== held.size) {
      zero(registryBytes);
      throw new NativeError("registry lock anchor read differs");
    }
    const digest = createHash("sha256").update(registryBytes).digest("hex");
    zero(registryBytes);
    const result = spawnSync(lockfPath, ["-s", "-t", "0", "3"], {
      cwd: "/",
      env: { NODE_ENV: process.env.NODE_ENV ?? "production" },
      stdio: ["ignore", "ignore", "ignore", descriptor],
    });
    if (result.error !== undefined || result.signal !== null) {
      throw new NativeError("lockf helper failed");
    }
    if (result.status !== 0) {
      closeHeldDescriptor();
      if (result.status !== 75) {
        throw new NativeError("lockf helper status differs");
      }
      fail("os-lock", "another-gate-invocation-active");
    }
    return frozenRecord({
      descriptor,
      registry: frozenRecord({
        bytes: Number(held.size),
        sha256: digest,
        dev: held.dev,
        ino: held.ino,
      }),
      async close() {
        closeHeldDescriptor();
      },
      closeSync() {
        closeHeldDescriptor();
      },
    });
  } catch (error) {
    if (!closed) closeHeldDescriptor();
    throw error;
  }
}

function deriveLeaseKey(rootKey: Buffer): Buffer {
  return bufferFrom(
    hkdfSync(
      "sha256",
      rootKey,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_SALT,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_INFO,
      32,
    ),
  );
}

function deriveKeyInstanceId(rootKey: Buffer): string {
  const instanceKey = bufferFrom(
    hkdfSync(
      "sha256",
      rootKey,
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT,
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO,
      32,
    ),
  );
  try {
    return createHmac("sha256", instanceKey)
      .update(FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN, "utf8")
      .digest("hex");
  } finally {
    zero(instanceKey);
  }
}

function unsignedBytes(record: LeaseRecordWithoutMac): Buffer {
  return bufferFrom(`${jsonStringify(record)}\n`, "utf8");
}

function signedBytes(record: LeaseRecordWithoutMac, leaseKey: Buffer): Buffer {
  const unsigned = unsignedBytes(record);
  const mac = createHmac("sha256", leaseKey)
    .update(FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HMAC_DOMAIN, "utf8")
    .update(unsigned)
    .digest("hex");
  return bufferFrom(`${jsonStringify({ ...record, mac })}\n`, "utf8");
}

function hasExactOrderedKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  for (let index = 0; index < keys.length; index += 1) {
    if (actual[index] !== keys[index]) return false;
  }
  return true;
}

function hasExactLeaseShape(value: unknown): value is LeaseRecord {
  if (!hasExactOrderedKeys(value, LEASE_RECORD_KEYS)) return false;
  return (
    hasExactOrderedKeys(value.owner, LEASE_OWNER_KEYS) &&
    hasExactOrderedKeys(value.registry_binding, LEASE_REGISTRY_BINDING_KEYS)
  );
}

function createRecord(
  gate: FloodgateV7ProductionOuterGate,
  dependencies: CapturedDependencies,
  keyInstanceId: string,
  registry: LockHelper["registry"],
): LeaseRecordWithoutMac {
  const date = dependencies.now();
  const startedAt = date instanceof Date ? date.toISOString() : "";
  const nonceBytes = dependencies.nonce();
  if (
    !ISO_RE.test(startedAt) ||
    !(nonceBytes instanceof Uint8Array) ||
    nonceBytes.byteLength !== 32
  ) {
    throw new NativeError("lease owner generator differs");
  }
  const nonceCopy = bufferFrom(nonceBytes);
  try {
    return frozenRecord({
      contract: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
      status: "active-authenticated-production-gate-lease" as const,
      algorithm: "hkdf-sha256-canonical-hmac-sha256-v1" as const,
      gate,
      owner: frozenRecord({
        uid: dependencies.effectiveUserId,
        pid: dependencies.pid,
        hostname: dependencies.hostname,
        started_at_utc: startedAt,
        nonce: nonceCopy.toString("hex"),
      }),
      key_instance_id: keyInstanceId,
      registry_binding: frozenRecord({
        bytes: registry.bytes,
        sha256: registry.sha256,
        dev: registry.dev.toString(10),
        ino: registry.ino.toString(10),
      }),
    });
  } finally {
    zero(nonceCopy);
  }
}

function readActive(
  pathname: string,
  uid: number,
  allowEmpty = false,
): ActiveLease {
  const descriptor = fs.openSync(
    pathname,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    if (
      !statIsPrivateFile(stat, uid) ||
      (!allowEmpty && stat.size < BigInt(1)) ||
      stat.size > BigInt(MAX_LEASE_BYTES)
    ) {
      throw new NativeError("active lease file differs");
    }
    const bytes = fs.readFileSync(descriptor);
    if (BigInt(bytes.length) !== stat.size) {
      zero(bytes);
      throw new NativeError("active lease read differs");
    }
    return frozenRecord({ bytes, dev: stat.dev, ino: stat.ino });
  } finally {
    fs.closeSync(descriptor);
  }
}

function authenticateLease(bytes: Buffer, leaseKey: Buffer): boolean {
  try {
    const text = bytes.toString("utf8");
    const parsed: unknown = jsonParse(text);
    if (!hasExactLeaseShape(parsed) || !HEX_64_RE.test(parsed.mac)) {
      return false;
    }
    const { mac, ...unsigned } = parsed;
    if (typeof mac !== "string") return false;
    const canonicalUnsigned = unsignedBytes(unsigned as LeaseRecordWithoutMac);
    const expected = createHmac("sha256", leaseKey)
      .update(FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HMAC_DOMAIN, "utf8")
      .update(canonicalUnsigned)
      .digest();
    const actual = bufferFrom(mac, "hex");
    const canonicalSigned = bufferFrom(`${jsonStringify(parsed)}\n`, "utf8");
    try {
      return (
        canonicalSigned.equals(bytes) &&
        actual.length === expected.length &&
        nativeTimingSafeEqual(actual, expected)
      );
    } finally {
      zero(canonicalUnsigned);
      zero(canonicalSigned);
      zero(expected);
      zero(actual);
    }
  } catch {
    return false;
  }
}

function authenticatedLeaseBindsCurrentRegistry(
  bytes: Buffer,
  leaseKey: Buffer,
  keyInstanceId: string,
  registry: LockHelper["registry"],
): boolean {
  if (!authenticateLease(bytes, leaseKey)) return false;
  try {
    const parsed = jsonParse(bytes.toString("utf8")) as LeaseRecord;
    const owner = parsed.owner;
    const binding = parsed.registry_binding;
    return (
      parsed.contract === FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT &&
      parsed.status === "active-authenticated-production-gate-lease" &&
      parsed.algorithm === "hkdf-sha256-canonical-hmac-sha256-v1" &&
      (parsed.gate === "durable-prefix-100" ||
        parsed.gate === "durable-prefix-500" ||
        parsed.gate === "sealed-final-24000") &&
      typeof owner === "object" &&
      owner !== null &&
      Number.isSafeInteger(owner.uid) &&
      owner.uid >= 0 &&
      Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      HOSTNAME_RE.test(owner.hostname) &&
      ISO_RE.test(owner.started_at_utc) &&
      HEX_64_RE.test(owner.nonce) &&
      parsed.key_instance_id === keyInstanceId &&
      typeof binding === "object" &&
      binding !== null &&
      binding.bytes === registry.bytes &&
      binding.sha256 === registry.sha256 &&
      binding.dev === registry.dev.toString(10) &&
      binding.ino === registry.ino.toString(10)
    );
  } catch {
    return false;
  }
}

function revalidateRegistryAnchor(
  helper: LockHelper,
  registryPath: string,
  uid: number,
): boolean {
  let bytes: Buffer | null = null;
  try {
    const held = fs.fstatSync(helper.descriptor, { bigint: true });
    const named = fs.lstatSync(registryPath, { bigint: true });
    if (
      !statIsPrivateFile(held, uid) ||
      held.dev !== helper.registry.dev ||
      held.ino !== helper.registry.ino ||
      held.size !== BigInt(helper.registry.bytes) ||
      held.dev !== named.dev ||
      held.ino !== named.ino
    ) {
      return false;
    }
    bytes = bufferAlloc(helper.registry.bytes);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(
        helper.descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count < 1) return false;
      offset += count;
    }
    return (
      createHash("sha256").update(bytes).digest("hex") ===
      helper.registry.sha256
    );
  } catch {
    return false;
  } finally {
    if (bytes !== null) zero(bytes);
  }
}

function quarantineIsEmpty(paths: LeasePaths): boolean {
  return fs.readdirSync(paths.quarantineRoot).length === 0;
}

function assertRetiredEvidenceAllowsRun(
  paths: LeasePaths,
  uid: number,
  leaseKey: Buffer,
  keyInstanceId: string,
  helper: LockHelper,
): void {
  const entries = fs.readdirSync(paths.retiredRoot);
  if (entries.length > 64) {
    fail("cleanup", "manual-reconciliation-required", true, false, false, true);
  }
  for (const entry of entries) {
    if (!/^closed-[0-9a-f]{64}\.json$/u.test(entry)) {
      fail(
        "cleanup",
        "manual-reconciliation-required",
        true,
        false,
        false,
        true,
      );
    }
    const retired = readActive(pathJoin(paths.retiredRoot, entry), uid);
    try {
      if (
        !authenticatedLeaseBindsCurrentRegistry(
          retired.bytes,
          leaseKey,
          keyInstanceId,
          helper.registry,
        )
      ) {
        fail(
          "cleanup",
          "manual-reconciliation-required",
          true,
          false,
          false,
          true,
        );
      }
    } finally {
      zero(retired.bytes);
    }
    if (!revalidateRegistryAnchor(helper, paths.registryPath, uid)) {
      fail(
        "cleanup",
        "manual-reconciliation-required",
        true,
        false,
        false,
        true,
      );
    }
  }
}

function quarantineActive(
  paths: LeasePaths,
  active: ActiveLease,
  nonce: () => Uint8Array,
  uid: number,
): void {
  const token = bufferFrom(nonce());
  if (token.length !== 32) {
    zero(token);
    throw new NativeError("quarantine token differs");
  }
  const destination = pathJoin(
    paths.quarantineRoot,
    `stale-lease-${token.toString("hex")}.json`,
  );
  zero(token);
  const current = fs.lstatSync(paths.activePath, { bigint: true });
  if (
    !statIsPrivateFile(current, uid) ||
    current.dev !== active.dev ||
    current.ino !== active.ino
  ) {
    throw new NativeError("active lease identity changed before quarantine");
  }
  fs.linkSync(paths.activePath, destination);
  syncDirectory(paths.quarantineRoot);
  fs.unlinkSync(paths.activePath);
  syncDirectory(paths.controlRoot);
  const quarantined = fs.lstatSync(destination);
  if (!statIsPrivateFile(quarantined, uid)) {
    throw new NativeError("quarantined lease differs");
  }
}

function publishLease(
  paths: LeasePaths,
  bytes: Buffer,
  uid: number,
  nonce: () => Uint8Array,
  recordProgress: (
    progress:
      | "staging-created"
      | "authenticated-active-linked"
      | "staging-removal-durable",
  ) => void,
  failpoint:
    | ((
        event: FloodgateV7ProductionOuterGateLeasePublishFailpointForTests,
      ) => void)
    | undefined,
): ActiveLease {
  const token = bufferFrom(nonce());
  if (token.length !== 32) {
    zero(token);
    throw new NativeError("staging token differs");
  }
  const stagingPath = pathJoin(
    paths.quarantineRoot,
    `.installing-${token.toString("hex")}`,
  );
  zero(token);
  let descriptor = -1;
  try {
    descriptor = fs.openSync(
      stagingPath,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_WRONLY |
        fs.constants.O_NOFOLLOW,
      privateFileMode,
    );
    recordProgress("staging-created");
    failpoint?.("after-staging-create");
    let offset = 0;
    while (offset < bytes.length) {
      offset += fs.writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fs.fsyncSync(descriptor);
    fs.linkSync(stagingPath, paths.activePath);
    recordProgress("authenticated-active-linked");
    failpoint?.("after-active-link-before-control-sync");
    syncDirectory(paths.controlRoot);
    failpoint?.("after-durable-active-publish-before-staging-cleanup");
    fs.unlinkSync(stagingPath);
    failpoint?.("after-staging-unlink-before-quarantine-sync");
    syncDirectory(paths.quarantineRoot);
    recordProgress("staging-removal-durable");
  } finally {
    if (descriptor >= 0) fs.closeSync(descriptor);
  }
  const active = readActive(paths.activePath, uid);
  if (!active.bytes.equals(bytes)) {
    zero(active.bytes);
    throw new NativeError("published lease differs");
  }
  return active;
}

function removeActive(
  paths: LeasePaths,
  active: ActiveLease,
  uid: number,
  nonce: () => Uint8Array,
  afterActiveUnlinkBeforeDirectorySync: (() => void) | undefined,
): void {
  const current = readActive(paths.activePath, uid);
  try {
    if (
      current.dev !== active.dev ||
      current.ino !== active.ino ||
      !current.bytes.equals(active.bytes)
    ) {
      throw new NativeError("active lease identity changed before cleanup");
    }
  } finally {
    zero(current.bytes);
  }
  const token = bufferFrom(nonce());
  if (token.length !== 32) {
    zero(token);
    throw new NativeError("retired evidence token differs");
  }
  const suffix = token.toString("hex");
  zero(token);
  const pending = pathJoin(paths.retiredRoot, `.pending-${suffix}.json`);
  const closed = pathJoin(paths.retiredRoot, `closed-${suffix}.json`);
  fs.linkSync(paths.activePath, pending);
  syncDirectory(paths.retiredRoot);
  fs.unlinkSync(paths.activePath);
  afterActiveUnlinkBeforeDirectorySync?.();
  syncDirectory(paths.controlRoot);
  try {
    fs.lstatSync(paths.activePath);
    throw new NativeError("active lease survived cleanup");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  fs.renameSync(pending, closed);
  syncDirectory(paths.retiredRoot);
  const retired = fs.lstatSync(closed);
  if (!statIsPrivateFile(retired, uid)) {
    throw new NativeError("retired evidence differs");
  }
}

function assertFinalNamespaceUnderLock(
  paths: LeasePaths,
  uid: number,
  leaseKey: Buffer,
  keyInstanceId: string,
  helper: LockHelper,
): void {
  for (const directory of [
    paths.controlRoot,
    paths.quarantineRoot,
    paths.retiredRoot,
  ]) {
    if (!statIsPrivateDirectory(fs.lstatSync(directory), uid)) {
      throw new NativeError("final outer gate namespace differs");
    }
  }
  const entries = fs.readdirSync(paths.controlRoot);
  if (
    entries.length !== 2 ||
    !nativeReflectApply(nativeArrayIncludes, entries, [
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
    ]) ||
    !nativeReflectApply(nativeArrayIncludes, entries, [
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
    ])
  ) {
    throw new NativeError("final outer gate namespace differs");
  }
  try {
    fs.lstatSync(paths.activePath);
    throw new NativeError("active lease survived final validation");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!quarantineIsEmpty(paths)) {
    throw new NativeError("final outer gate quarantine differs");
  }
  assertRetiredEvidenceAllowsRun(paths, uid, leaseKey, keyInstanceId, helper);
}

function buildReceipt(
  boundary: ConnectorCapabilityBoundary,
): Readonly<FloodgateV7ProductionOuterGateLeaseReceipt> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
    algorithm: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
    execution_boundary:
      boundary === "production"
        ? FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY
        : FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_TEST_EXECUTION_BOUNDARY,
    verification: frozenRecord({
      one_os_lifetime_lock_shared_by_all_three_gates: true as const,
      os_lifetime_lock_held_before_operation: true as const,
      authenticated_lease_metadata_durable_before_operation: true as const,
      signal_and_exit_preserve_stale_evidence: true as const,
      authenticated_lease_removed_durably_after_operation: true as const,
      authenticated_retired_evidence_durable_after_operation: true as const,
      os_lifetime_lock_released_after_operation: true as const,
      quarantine_empty_after_operation: true as const,
    }),
    nonclaims: frozenRecord({
      lock_or_lease_path_disclosed: false as const,
      lease_metadata_disclosed: false as const,
      key_material_disclosed: false as const,
      key_instance_id_disclosed: false as const,
      lease_mac_disclosed: false as const,
      connector_receipt_disclosed: false as const,
      graceful_signal_cleanup: false as const,
      checkpoint: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function installLifecycleEvidencePreservation(): () => void {
  let active = true;
  let handlingSignal = false;
  const exitHandler = (): void => {
    // Deliberately do not remove metadata. Descriptor/process death releases
    // the OS lock, while the authenticated lease remains crash evidence.
  };
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of SIGNALS) {
    const handler = (): void => {
      if (!active || handlingSignal) return;
      handlingSignal = true;
      for (const [name, installed] of handlers) {
        if (name !== signal) processRemoveListener(name, installed);
      }
      // Restore the native default for the delivered signal even when the
      // embedding process installed a persistent listener before this owner.
      processRemoveAllListeners(signal);
      processRemoveListener("exit", exitHandler);
      active = false;
      processKill(process.pid, signal);
    };
    handlers.set(signal, handler);
    processOn(signal, handler);
  }
  processOn("exit", exitHandler);
  return () => {
    if (!active) return;
    active = false;
    for (const [signal, handler] of handlers) {
      processRemoveListener(signal, handler);
    }
    processRemoveListener("exit", exitHandler);
  };
}

async function acquireAndRun<T>(
  gate: FloodgateV7ProductionOuterGate,
  dependencies: CapturedDependencies,
  operation: (
    capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
  ) => Promise<T>,
  boundary: ConnectorCapabilityBoundary,
  policy: LeaseExecutionPolicy,
): Promise<Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<T>>> {
  let helper: LockHelper | null = null;
  let active: ActiveLease | null = null;
  let removeLifecycleHandlers: (() => void) | null = null;
  let metadataRemoved = false;
  let lockReleased = false;
  let osLockEverAcquired = false;
  let authenticatedLeaseEverPublished = false;
  let quarantineMayBlock = false;
  let operationBoundaryCrossed = false;
  let currentPhase: FloodgateV7ProductionOuterGateLeasePhase = "key-read";
  let leaseKeyForCleanup: Buffer | null = null;
  let preflightCapability:
    | Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>
    | undefined;
  try {
    if (
      (policy.kind === "prefix-100-same-lock-one-shot" &&
        (gate !== "durable-prefix-100" ||
          boundary === "test-generic" ||
          policy.preflightBoundary !==
            (boundary === "production" ? "production" : "test-only"))) ||
      (boundary === "production" &&
        gate === "durable-prefix-100" &&
        policy.kind !== "prefix-100-same-lock-one-shot")
    ) {
      fail("capture", "manual-reconciliation-required");
    }
    currentPhase = "namespace";
    let paths = leasePaths(dependencies.homeDirectory);
    currentPhase = "key-read";
    const leaseKey = deriveLeaseKey(dependencies.rootKey);
    leaseKeyForCleanup = leaseKey;
    const keyInstanceId = deriveKeyInstanceId(dependencies.rootKey);

    currentPhase = "os-lock";
    try {
      helper = acquireOsLock(
        paths.registryPath,
        dependencies.effectiveUserId,
        dependencies.lockfPath,
        dependencies.closeLockDescriptor,
      );
    } catch (error) {
      if (error instanceof FloodgateV7ProductionOuterGateLeaseError)
        throw error;
      fail("os-lock", "manual-reconciliation-required");
    }
    osLockEverAcquired = true;

    if (policy.kind === "prefix-100-same-lock-one-shot") {
      currentPhase = "prefix-100-preflight";
      try {
        const preflightRegistry = prefix100PreflightCapabilityRegistry(
          policy.preflightBoundary,
        );
        preflightCapability = mintPrefix100PreflightCapabilityUnderHeldLock(
          helper,
          dependencies.effectiveUserId,
          dependencies.homeDirectory,
          policy.preflightBoundary,
        );
        const outcome = await invokeFixedPrefix100PreflightUnderOuterLock(
          preflightCapability,
          policy.loadPreflightModule,
        );
        if (preflightRegistry.has(preflightCapability)) {
          throw new NativeError(
            "prefix 100 preflight capability was not claimed",
          );
        }
        requireExactPrefix100PreflightGoOutcome(
          outcome,
          policy.preflightBoundary,
        );
        if (
          !revalidateRegistryAnchor(
            helper,
            paths.registryPath,
            dependencies.effectiveUserId,
          )
        ) {
          throw new NativeError("prefix 100 preflight registry anchor changed");
        }
        const freshlyReadRootKey = rereadRootKeyAfterPrefix100Preflight(
          dependencies,
          policy.preflightBoundary,
        );
        if (freshlyReadRootKey !== null) {
          try {
            if (
              freshlyReadRootKey.length !== dependencies.rootKey.length ||
              !nativeTimingSafeEqual(freshlyReadRootKey, dependencies.rootKey)
            ) {
              throw new NativeError(
                "prefix 100 preflight deployment key changed",
              );
            }
          } finally {
            zero(freshlyReadRootKey);
          }
        }
      } catch {
        if (preflightCapability !== undefined) {
          discardPrefix100PreflightCapability(preflightCapability);
        }
        fail(
          "prefix-100-preflight",
          "manual-reconciliation-required",
          true,
          false,
          false,
          false,
        );
      }
    }

    currentPhase = "namespace";
    try {
      paths = prepareNamespaceAfterLock(
        dependencies.homeDirectory,
        dependencies.effectiveUserId,
      );
    } catch (error) {
      if (error instanceof FloodgateV7ProductionOuterGateLeaseError)
        throw error;
      fail("namespace", "manual-reconciliation-required", true);
    }

    currentPhase = "quarantine";
    if (!quarantineIsEmpty(paths)) {
      fail(
        "quarantine",
        "manual-reconciliation-required",
        true,
        false,
        false,
        true,
      );
    }
    assertRetiredEvidenceAllowsRun(
      paths,
      dependencies.effectiveUserId,
      leaseKey,
      keyInstanceId,
      helper,
    );

    currentPhase = "stale-inspection";
    try {
      fs.lstatSync(paths.activePath);
      const stale = readActive(
        paths.activePath,
        dependencies.effectiveUserId,
        true,
      );
      const authenticated = authenticatedLeaseBindsCurrentRegistry(
        stale.bytes,
        leaseKey,
        keyInstanceId,
        helper.registry,
      );
      zero(stale.bytes);
      fail(
        "stale-inspection",
        "manual-reconciliation-required",
        true,
        false,
        false,
        false,
        authenticated,
      );
    } catch (error) {
      if (error instanceof FloodgateV7ProductionOuterGateLeaseError)
        throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        fail(
          "stale-inspection",
          "manual-reconciliation-required",
          true,
          false,
          false,
          false,
          false,
        );
      }
    }

    currentPhase = "lease-publish";
    const record = createRecord(
      gate,
      dependencies,
      keyInstanceId,
      helper.registry,
    );
    const bytes = signedBytes(record, leaseKey);
    try {
      active = publishLease(
        paths,
        bytes,
        dependencies.effectiveUserId,
        dependencies.nonce,
        (progress) => {
          if (progress === "staging-created") {
            quarantineMayBlock = true;
          } else if (progress === "authenticated-active-linked") {
            authenticatedLeaseEverPublished = true;
          } else {
            quarantineMayBlock = false;
          }
        },
        dependencies.leasePublishFailpoint,
      );
      dependencies.afterLeasePublishBeforeValidation?.();
      if (
        !authenticateLease(active.bytes, leaseKey) ||
        !quarantineIsEmpty(paths)
      ) {
        fail(
          "lease-publish",
          "manual-reconciliation-required",
          true,
          true,
          false,
          true,
        );
      }
    } finally {
      zero(bytes);
    }

    const heldHelper = helper;
    const cleanupMetadataSync = (): void => {
      if (metadataRemoved || active === null) return;
      removeActive(
        paths,
        active,
        dependencies.effectiveUserId,
        dependencies.nonce,
        dependencies.afterActiveUnlinkBeforeDirectorySync,
      );
      assertRetiredEvidenceAllowsRun(
        paths,
        dependencies.effectiveUserId,
        leaseKey,
        keyInstanceId,
        heldHelper,
      );
      metadataRemoved = true;
    };
    if (dependencies.installProcessLifecycleHandlers) {
      removeLifecycleHandlers = installLifecycleEvidencePreservation();
    }

    const connectorCapability = frozenRecord({
      contract:
        "shogi-floodgate-v7-production-outer-gate-connector-capability-v1" as const,
      status:
        "opaque-single-use-valid-only-while-common-os-lock-is-held" as const,
    });
    const connectorRegistry =
      boundary === "production"
        ? productionConnectorCapabilities
        : testConnectorCapabilities;
    connectorRegistry.set(connectorCapability, gate);
    let value: T;
    currentPhase = "operation";
    operationBoundaryCrossed = true;
    try {
      value = await operation(connectorCapability);
      if (
        boundary !== "test-generic" &&
        connectorRegistry.has(connectorCapability)
      ) {
        throw new NativeError("outer connector capability was not claimed");
      }
      if (policy.kind === "prefix-100-same-lock-one-shot") {
        requireExactPrefix100RunnerContinuityReceipt(value);
      }
    } catch {
      connectorRegistry.delete(connectorCapability);
      try {
        removeLifecycleHandlers?.();
        await helper.close();
        lockReleased = true;
      } catch {
        fail(
          "cleanup",
          "manual-reconciliation-required",
          true,
          true,
          false,
          true,
        );
      }
      fail(
        "operation",
        "manual-reconciliation-required",
        true,
        true,
        false,
        false,
      );
    }
    connectorRegistry.delete(connectorCapability);

    currentPhase = "cleanup";
    try {
      cleanupMetadataSync();
      assertFinalNamespaceUnderLock(
        paths,
        dependencies.effectiveUserId,
        leaseKey,
        keyInstanceId,
        helper,
      );
      removeLifecycleHandlers?.();
      await helper.close();
      lockReleased = true;
    } catch (error) {
      if (error instanceof FloodgateV7ProductionOuterGateLeaseError)
        throw error;
      fail(
        "cleanup",
        "manual-reconciliation-required",
        true,
        true,
        false,
        true,
      );
    }
    return frozenRecord({ value, lease: buildReceipt(boundary) });
  } catch (error) {
    throw sanitizedLeaseFailure(
      error,
      currentPhase,
      osLockEverAcquired,
      authenticatedLeaseEverPublished || operationBoundaryCrossed,
      false,
      quarantineMayBlock,
    );
  } finally {
    if (preflightCapability !== undefined) {
      discardPrefix100PreflightCapability(preflightCapability);
    }
    if (leaseKeyForCleanup !== null) zero(leaseKeyForCleanup);
    zero(dependencies.rootKey);
    if (active !== null) zero(active.bytes);
    try {
      removeLifecycleHandlers?.();
    } catch {
      // The earlier typed outcome remains authoritative; no raw lifecycle
      // failure crosses the public boundary from final evidence cleanup.
    }
    if (helper !== null && !lockReleased) {
      try {
        await helper.close();
        lockReleased = true;
      } catch {
        // Best effort only: the typed outcome remains authoritative and the
        // process-lifetime descriptor is still released on process death.
      }
    }
  }
}

function readProductionRootKey(home: string, uid: number): Buffer {
  const parent = pathJoin(
    home,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
  const keyPath = pathJoin(parent, FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME);
  const parentStat = fs.lstatSync(parent);
  if (!statIsPrivateDirectory(parentStat, uid)) {
    throw new NativeError("deployment key parent differs");
  }
  const descriptor = fs.openSync(
    keyPath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = fs.fstatSync(descriptor);
    if (
      !statIsPrivateFile(stat, uid) ||
      stat.size !== FLOODGATE_V7_DEPLOYMENT_KEY_BYTES
    ) {
      throw new NativeError("deployment key differs");
    }
    const key = bufferAlloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES);
    const read = fs.readSync(
      descriptor,
      key,
      0,
      FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
      0,
    );
    if (read !== FLOODGATE_V7_DEPLOYMENT_KEY_BYTES) {
      zero(key);
      throw new NativeError("deployment key read differs");
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathname = fs.lstatSync(keyPath, { bigint: true });
    if (
      after.dev !== pathname.dev ||
      after.ino !== pathname.ino ||
      !statIsPrivateFile(after, uid)
    ) {
      zero(key);
      throw new NativeError("deployment key revalidation differs");
    }
    return key;
  } finally {
    fs.closeSync(descriptor);
  }
}

function rereadRootKeyAfterPrefix100Preflight(
  dependencies: CapturedDependencies,
  boundary: Prefix100PreflightCapabilityBoundary,
): Buffer | null {
  if (boundary === "production") {
    return readProductionRootKey(
      dependencies.homeDirectory,
      dependencies.effectiveUserId,
    );
  }
  const reread = dependencies.rereadRootKeyAfterPrefix100Preflight;
  if (reread === undefined) return null;
  const value = reread();
  if (
    !(value instanceof Uint8Array) ||
    nodeIsProxy(value) ||
    value.byteLength !== FLOODGATE_V7_DEPLOYMENT_KEY_BYTES
  ) {
    throw new NativeError("test deployment key reread differs");
  }
  // Never retain or zero caller-owned test memory. The owned copy follows the
  // same compare-and-zero lifetime as the fixed production reread.
  return bufferFrom(value);
}

function productionDependencies(): CapturedDependencies {
  if (process.platform !== "darwin" || getEffectiveUserId === null) {
    fail("production-identity", "manual-reconciliation-required");
  }
  const user = getUserInfo();
  const uid = getEffectiveUserId();
  const home = canonicalAbsolute(user.homedir, "production home");
  const rootKey = readProductionRootKey(home, uid);
  try {
    return captureDependencies({
      effectiveUserId: uid,
      homeDirectory: home,
      rootKey,
      hostname: getHostname(),
      pid: process.pid,
      lockfPath: LOCKF_PATH,
      installProcessLifecycleHandlers: true,
    });
  } finally {
    zero(rootKey);
  }
}

function inspectionReceipt(): Readonly<
  FloodgateV7ProductionOuterGateStaleInspectionResult["receipt"]
> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_OUTER_GATE_INSPECTION_CONTRACT,
    status:
      "authenticated-stale-source-held-for-explicit-confirmation" as const,
    verification: frozenRecord({
      os_lifetime_lock_held: true as const,
      exact_stale_source_descriptor_inspected: true as const,
      lease_hmac_authenticated: true as const,
      registry_binding_matched: true as const,
      quarantine_empty: true as const,
      source_mutated: false as const,
    }),
    nonclaims: frozenRecord({
      quarantine_performed: false as const,
      stale_source_removed: false as const,
      quarantine_acknowledged_or_deleted: false as const,
      path_or_metadata_disclosed: false as const,
      key_material_or_mac_disclosed: false as const,
    }),
  });
}

async function inspectStaleForManualReconciliation(
  dependencies: CapturedDependencies,
  registry: WeakMap<object, ManualInspectionState>,
): Promise<Readonly<FloodgateV7ProductionOuterGateStaleInspectionResult>> {
  const paths = leasePaths(dependencies.homeDirectory);
  const leaseKey = deriveLeaseKey(dependencies.rootKey);
  const keyInstanceId = deriveKeyInstanceId(dependencies.rootKey);
  zero(dependencies.rootKey);
  let helper: LockHelper | null = null;
  let active: ActiveLease | null = null;
  let removeLifecycleHandlers: (() => void) | null = null;
  let transferred = false;
  try {
    helper = acquireOsLock(
      paths.registryPath,
      dependencies.effectiveUserId,
      dependencies.lockfPath,
      dependencies.closeLockDescriptor,
    );
    prepareNamespaceAfterLock(
      dependencies.homeDirectory,
      dependencies.effectiveUserId,
    );
    if (!quarantineIsEmpty(paths)) {
      fail(
        "quarantine",
        "manual-reconciliation-required",
        true,
        false,
        false,
        true,
      );
    }
    assertRetiredEvidenceAllowsRun(
      paths,
      dependencies.effectiveUserId,
      leaseKey,
      keyInstanceId,
      helper,
    );
    active = readActive(paths.activePath, dependencies.effectiveUserId, true);
    if (
      active.bytes.length === 0 ||
      !authenticatedLeaseBindsCurrentRegistry(
        active.bytes,
        leaseKey,
        keyInstanceId,
        helper.registry,
      ) ||
      !revalidateRegistryAnchor(
        helper,
        paths.registryPath,
        dependencies.effectiveUserId,
      )
    ) {
      fail(
        "stale-inspection",
        "manual-reconciliation-required",
        true,
        false,
        false,
        false,
        false,
      );
    }
    const capability = frozenRecord({
      contract:
        "shogi-floodgate-v7-production-outer-gate-stale-inspection-capability-v1" as const,
      status: "opaque-single-use-confirm-or-cancel" as const,
    });
    if (dependencies.installProcessLifecycleHandlers) {
      removeLifecycleHandlers = installLifecycleEvidencePreservation();
    }
    registry.set(
      capability,
      frozenRecord({
        helper,
        paths,
        active,
        leaseKey,
        keyInstanceId,
        effectiveUserId: dependencies.effectiveUserId,
        nonce: dependencies.nonce,
        removeLifecycleHandlers,
      }),
    );
    transferred = true;
    helper = null;
    active = null;
    removeLifecycleHandlers = null;
    return frozenRecord({ capability, receipt: inspectionReceipt() });
  } catch (error) {
    if (error instanceof FloodgateV7ProductionOuterGateLeaseError) throw error;
    return fail(
      "stale-inspection",
      "manual-reconciliation-required",
      helper !== null,
    );
  } finally {
    if (active !== null) zero(active.bytes);
    try {
      removeLifecycleHandlers?.();
    } catch {
      // A typed inspection failure remains authoritative and no raw lifecycle
      // failure crosses the manual public boundary.
    }
    if (helper !== null) await helper.close().catch(() => undefined);
    if (!transferred) zero(leaseKey);
  }
}

function quarantineReceipt(): Readonly<FloodgateV7ProductionOuterGateQuarantineReceipt> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_CONTRACT,
    status:
      "explicitly-confirmed-exact-stale-source-quarantined-and-all-gates-blocked" as const,
    verification: frozenRecord({
      explicit_confirmation_matched: true as const,
      os_lifetime_lock_remained_held: true as const,
      exact_source_freshly_reinspected: true as const,
      lease_hmac_reauthenticated: true as const,
      registry_binding_rematched: true as const,
      create_only_quarantine_published_durably: true as const,
      stale_source_removal_durable: true as const,
      quarantine_blocks_all_three_gates: true as const,
    }),
    nonclaims: frozenRecord({
      quarantine_acknowledged_or_deleted: false as const,
      next_gate_authorized: false as const,
      path_or_metadata_disclosed: false as const,
      key_material_or_mac_disclosed: false as const,
    }),
  });
}

async function confirmManualQuarantine(
  capability: Readonly<FloodgateV7ProductionOuterGateStaleInspectionCapability>,
  confirmation: string,
  registry: WeakMap<object, ManualInspectionState>,
): Promise<Readonly<FloodgateV7ProductionOuterGateQuarantineReceipt>> {
  if (confirmation !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_MANUAL_CONFIRMATION) {
    fail("capture", "manual-reconciliation-required");
  }
  const state = registry.get(capability);
  if (state === undefined) {
    fail("capture", "manual-reconciliation-required");
  }
  registry.delete(capability);
  let fresh: ActiveLease | null = null;
  let quarantined = false;
  let receipt: Readonly<FloodgateV7ProductionOuterGateQuarantineReceipt> | null =
    null;
  let failure: FloodgateV7ProductionOuterGateLeaseError | null = null;
  try {
    if (!quarantineIsEmpty(state.paths)) {
      fail(
        "quarantine",
        "manual-reconciliation-required",
        true,
        false,
        false,
        true,
      );
    }
    assertRetiredEvidenceAllowsRun(
      state.paths,
      state.effectiveUserId,
      state.leaseKey,
      state.keyInstanceId,
      state.helper,
    );
    fresh = readActive(state.paths.activePath, state.effectiveUserId, true);
    if (
      fresh.bytes.length === 0 ||
      fresh.dev !== state.active.dev ||
      fresh.ino !== state.active.ino ||
      !fresh.bytes.equals(state.active.bytes) ||
      !authenticatedLeaseBindsCurrentRegistry(
        fresh.bytes,
        state.leaseKey,
        state.keyInstanceId,
        state.helper.registry,
      ) ||
      !revalidateRegistryAnchor(
        state.helper,
        state.paths.registryPath,
        state.effectiveUserId,
      )
    ) {
      fail("stale-inspection", "manual-reconciliation-required", true);
    }
    quarantineActive(state.paths, fresh, state.nonce, state.effectiveUserId);
    quarantined = true;
    if (quarantineIsEmpty(state.paths)) {
      fail(
        "quarantine",
        "manual-reconciliation-required",
        true,
        false,
        true,
        false,
      );
    }
    receipt = quarantineReceipt();
  } catch (error) {
    failure = sanitizedLeaseFailure(error, "quarantine", true);
  } finally {
    if (fresh !== null) zero(fresh.bytes);
    zero(state.active.bytes);
    zero(state.leaseKey);
    try {
      state.removeLifecycleHandlers?.();
    } catch (error) {
      failure ??= sanitizedLeaseFailure(
        error,
        "cleanup",
        true,
        false,
        quarantined,
        quarantined,
      );
    }
    try {
      await state.helper.close();
    } catch (error) {
      failure ??= sanitizedLeaseFailure(
        error,
        "cleanup",
        true,
        false,
        quarantined,
        quarantined,
      );
    }
  }
  if (failure !== null) throw failure;
  if (receipt === null) {
    return fail("quarantine", "manual-reconciliation-required", true);
  }
  return receipt;
}

async function cancelManualInspection(
  capability: Readonly<FloodgateV7ProductionOuterGateStaleInspectionCapability>,
  registry: WeakMap<object, ManualInspectionState>,
): Promise<void> {
  const state = registry.get(capability);
  if (state === undefined) {
    fail("capture", "manual-reconciliation-required");
  }
  registry.delete(capability);
  zero(state.active.bytes);
  zero(state.leaseKey);
  let failure: FloodgateV7ProductionOuterGateLeaseError | null = null;
  try {
    state.removeLifecycleHandlers?.();
  } catch (error) {
    failure = sanitizedLeaseFailure(error, "cleanup", true);
  }
  try {
    await state.helper.close();
  } catch (error) {
    failure ??= sanitizedLeaseFailure(error, "cleanup", true);
  }
  if (failure !== null) throw failure;
}

/** Inspect-only test facade. Invalid or empty legacy metadata is never moved. */
export function inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests(
  dependenciesValue: FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
): Promise<Readonly<FloodgateV7ProductionOuterGateStaleInspectionResult>> {
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies({
      ...dependenciesValue,
      installProcessLifecycleHandlers:
        dependenciesValue.installProcessLifecycleHandlers ?? false,
    });
  } catch {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "manual-reconciliation-required",
        false,
        false,
        false,
        false,
      ),
    );
  }
  return inspectStaleForManualReconciliation(
    dependencies,
    testManualInspections,
  );
}

export function confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantineCoreForTests(
  capability: Readonly<FloodgateV7ProductionOuterGateStaleInspectionCapability>,
  confirmation: string,
): Promise<Readonly<FloodgateV7ProductionOuterGateQuarantineReceipt>> {
  return confirmManualQuarantine(
    capability,
    confirmation,
    testManualInspections,
  );
}

export function cancelFloodgateV7ProductionOuterGateStaleLeaseInspectionCoreForTests(
  capability: Readonly<FloodgateV7ProductionOuterGateStaleInspectionCapability>,
): Promise<void> {
  return cancelManualInspection(capability, testManualInspections);
}

/** Production inspect phase; holds the common OS lock until confirm or cancel. */
export function inspectFloodgateV7ProductionOuterGateStaleLease(): Promise<
  Readonly<FloodgateV7ProductionOuterGateStaleInspectionResult>
> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "manual-reconciliation-required",
        false,
        false,
        false,
        false,
      ),
    );
  }
  try {
    return inspectStaleForManualReconciliation(
      productionDependencies(),
      productionManualInspections,
    );
  } catch (error) {
    return NativePromise.reject(sanitizedLeaseFailure(error, "key-read"));
  }
}

/** Explicit second phase. It moves only the freshly re-inspected exact source. */
export function confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantine(
  capability: Readonly<FloodgateV7ProductionOuterGateStaleInspectionCapability>,
  confirmation: string,
): Promise<Readonly<FloodgateV7ProductionOuterGateQuarantineReceipt>> {
  if (arguments.length !== 2) {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "manual-reconciliation-required",
        false,
        false,
        false,
        false,
      ),
    );
  }
  return (async () => {
    try {
      return await confirmManualQuarantine(
        capability,
        confirmation,
        productionManualInspections,
      );
    } catch (error) {
      throw sanitizedLeaseFailure(error, "quarantine");
    }
  })();
}

export function cancelFloodgateV7ProductionOuterGateStaleLeaseInspection(
  capability: Readonly<FloodgateV7ProductionOuterGateStaleInspectionCapability>,
): Promise<void> {
  if (arguments.length !== 1) {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "manual-reconciliation-required",
        false,
        false,
        false,
        false,
      ),
    );
  }
  return (async () => {
    try {
      await cancelManualInspection(capability, productionManualInspections);
    } catch (error) {
      throw sanitizedLeaseFailure(error, "cleanup");
    }
  })();
}

function buildPrefix100PreflightOuterLockReceipt(
  boundary: Prefix100PreflightCapabilityBoundary,
): Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockReceipt> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_STATUS,
    execution_boundary:
      boundary === "production"
        ? ("production-fixed-current-euid-home-native-descriptor-close" as const)
        : ("test-only-injected-home-lock-helper-and-descriptor-close" as const),
    verification: frozenRecord({
      common_os_lock_acquired_nonblocking: true as const,
      common_os_lock_held_around_fixed_preflight: true as const,
      registry_anchor_held_descriptor_and_bytes_revalidated: true as const,
      common_os_lock_released_before_receipt: true as const,
      persistent_namespace_or_file_content_mutation_performed: false as const,
    }),
    nonclaims: frozenRecord({
      registry_path_or_bytes_disclosed: false as const,
      registry_digest_or_identity_disclosed: false as const,
      key_material_disclosed: false as const,
      active_lease_created_or_written: false as const,
      control_namespace_created_or_written: false as const,
      connector_capability_issued: false as const,
      gate_invoked: false as const,
      checkpoint: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function loadFixedProductionPrefix100PreflightModule(): unknown {
  return capturedRequire("./floodgate-v7-production-prefix-100-preflight");
}

async function invokeFixedPrefix100PreflightUnderOuterLock(
  capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
  loadPreflightModule: Prefix100PreflightModuleLoader,
): Promise<unknown> {
  let loaded: unknown;
  try {
    loaded = loadPreflightModule();
  } catch {
    throw new NativeError("fixed prefix 100 preflight module load failed");
  }
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    nodeIsProxy(loaded) ||
    (objectGetPrototypeOf(loaded) !== objectPrototype &&
      objectGetPrototypeOf(loaded) !== null)
  ) {
    throw new NativeError("fixed prefix 100 preflight module differs");
  }
  let operation: unknown;
  try {
    const descriptor = objectGetOwnPropertyDescriptor(
      loaded,
      "inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock",
    );
    if (descriptor === undefined || descriptor.enumerable !== true) {
      throw new NativeError("fixed prefix 100 preflight export differs");
    }
    if ("value" in descriptor) {
      operation = descriptor.value;
    } else {
      if (
        descriptor.configurable !== false ||
        descriptor.set !== undefined ||
        typeof descriptor.get !== "function"
      ) {
        throw new NativeError("fixed prefix 100 preflight export differs");
      }
      operation = nativeReflectApply(descriptor.get, loaded, []);
    }
  } catch {
    throw new NativeError("fixed prefix 100 preflight export differs");
  }
  if (typeof operation !== "function") {
    throw new NativeError("fixed prefix 100 preflight export differs");
  }
  try {
    return await nativeReflectApply(operation, undefined, [capability]);
  } catch {
    throw new NativeError("fixed prefix 100 preflight operation failed");
  }
}

function exactFrozenNullDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== null ||
    !objectIsFrozen(value)
  ) {
    throw new NativeError("prefix 100 preflight outcome differs");
  }
  const keys = nativeReflectOwnKeys(value);
  if (keys.length !== expectedKeys.length) {
    throw new NativeError("prefix 100 preflight outcome differs");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const output = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (keys[index] !== key) {
      throw new NativeError("prefix 100 preflight outcome differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      descriptor.configurable !== false ||
      descriptor.writable !== false
    ) {
      throw new NativeError("prefix 100 preflight outcome differs");
    }
    output[key] = descriptor.value;
  }
  return objectFreeze(output);
}

function requireExactPrefix100PreflightGoOutcome(
  value: unknown,
  boundary: Prefix100PreflightCapabilityBoundary,
): void {
  const outcome = exactFrozenNullDataRecord(value, [
    "contract",
    "status",
    "observation",
  ]);
  const observation = exactFrozenNullDataRecord(outcome.observation, [
    "execution_boundary",
    "outer_control",
  ]);
  if (
    outcome.contract !== PREFIX_100_UNDER_LOCK_OUTCOME_CONTRACT ||
    outcome.status !== "GO-observed-under-outer-lock" ||
    observation.execution_boundary !==
      (boundary === "production"
        ? PREFIX_100_PRODUCTION_PREFLIGHT_EXECUTION_BOUNDARY
        : PREFIX_100_TEST_PREFLIGHT_EXECUTION_BOUNDARY) ||
    (observation.outer_control !== "absent-pristine" &&
      observation.outer_control !== "present-exact-empty")
  ) {
    throw new NativeError("prefix 100 preflight outcome differs");
  }
}

function requireExactPrefix100RunnerContinuityReceipt(value: unknown): void {
  const receipt = exactFrozenNullDataRecord(value, [
    "contract",
    "status",
    "claim_boundary",
    "execution_boundary",
    "gate",
    "checkpoint",
    "verification",
    "nonclaims",
  ]);
  const checkpoint = exactFrozenNullDataRecord(receipt.checkpoint, [
    "target_parents",
    "sealed",
    "checkpoint_may_have_persisted",
  ]);
  const verification = exactFrozenNullDataRecord(receipt.verification, [
    "private_registry_claimed",
    "approved_record_binding_matched",
    "fresh_current_key_binding_validated",
    "connector_completed",
    "exact_prefix_100_read_only_continuity_postflight_completed",
  ]);
  const nonclaims = exactFrozenNullDataRecord(receipt.nonclaims, [
    "run_id_disclosed",
    "approved_key_binding_disclosed",
    "connector_options_disclosed",
    "raw_connector_receipt_disclosed",
    "key_material_disclosed",
    "row_or_position_content_disclosed",
    "teacher_label",
    "optimizer_training",
    "weight",
    "live_evaluation_activation",
    "match",
    "playing_strength",
  ]);
  if (
    receipt.contract !== PREFIX_100_RUNNER_CONTRACT ||
    receipt.status !== PREFIX_100_RUNNER_STATUS ||
    receipt.claim_boundary !== PREFIX_100_RUNNER_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== PREFIX_100_RUNNER_EXECUTION_BOUNDARY ||
    receipt.gate !== "durable-prefix-100" ||
    checkpoint.target_parents !== 100 ||
    checkpoint.sealed !== false ||
    checkpoint.checkpoint_may_have_persisted !== true ||
    verification.private_registry_claimed !== true ||
    verification.approved_record_binding_matched !== true ||
    verification.fresh_current_key_binding_validated !== true ||
    verification.connector_completed !== true ||
    verification.exact_prefix_100_read_only_continuity_postflight_completed !==
      true
  ) {
    throw new NativeError("prefix 100 runner continuity receipt differs");
  }
  for (const key of nativeReflectOwnKeys(nonclaims)) {
    if (typeof key !== "string" || nonclaims[key] !== false) {
      throw new NativeError("prefix 100 runner continuity receipt differs");
    }
  }
}

async function acquireAndRunPrefix100ReadOnlyPreflight(
  dependencies: CapturedPrefix100PreflightOuterLockDependencies,
  loadPreflightModule: Prefix100PreflightModuleLoader,
  boundary: Prefix100PreflightCapabilityBoundary,
): Promise<
  Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockResult<unknown>>
> {
  let helper: LockHelper | null = null;
  let capability:
    | Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>
    | undefined;
  let lockReleased = false;
  let phase: FloodgateV7ProductionOuterGateLeasePhase = "os-lock";
  try {
    phase = "namespace";
    const paths = leasePaths(dependencies.homeDirectory);
    phase = "os-lock";
    helper = acquireOsLock(
      paths.registryPath,
      dependencies.effectiveUserId,
      dependencies.lockfPath,
      dependencies.closeLockDescriptor,
    );
    const registry = prefix100PreflightCapabilityRegistry(boundary);
    capability = mintPrefix100PreflightCapabilityUnderHeldLock(
      helper,
      dependencies.effectiveUserId,
      dependencies.homeDirectory,
      boundary,
    );
    phase = "operation";
    const value = await invokeFixedPrefix100PreflightUnderOuterLock(
      capability,
      loadPreflightModule,
    );
    if (registry.has(capability)) {
      registry.delete(capability);
      throw new NativeError("prefix 100 preflight capability was not claimed");
    }
    phase = "cleanup";
    if (
      !revalidateRegistryAnchor(
        helper,
        paths.registryPath,
        dependencies.effectiveUserId,
      )
    ) {
      throw new NativeError("prefix 100 preflight registry anchor changed");
    }
    await helper.close();
    lockReleased = true;
    return frozenRecord({
      value,
      lock: buildPrefix100PreflightOuterLockReceipt(boundary),
    });
  } catch (error) {
    if (capability !== undefined) {
      discardPrefix100PreflightCapability(capability);
    }
    throw sanitizedLeaseFailure(
      error,
      phase,
      helper !== null,
      false,
      false,
      false,
    );
  } finally {
    if (helper !== null && !lockReleased) {
      try {
        await helper.close();
      } catch {
        // The public failure already conservatively reports an uncertain
        // cleanup. Process death remains the final descriptor release.
      }
    }
  }
}

function productionPrefix100PreflightOuterLockDependencies(): CapturedPrefix100PreflightOuterLockDependencies {
  if (process.platform !== "darwin" || getEffectiveUserId === null) {
    fail("production-identity", "manual-reconciliation-required");
  }
  const user = getUserInfo();
  const effectiveUserId = getEffectiveUserId();
  if (user.uid !== effectiveUserId) {
    fail("production-identity", "manual-reconciliation-required");
  }
  return capturePrefix100PreflightOuterLockDependencies({
    effectiveUserId,
    homeDirectory: canonicalAbsolute(user.homedir, "production home"),
    lockfPath: LOCKF_PATH,
  });
}

/**
 * Test-only fixed owner. The injected loader cannot select an arbitrary
 * callback at the production boundary and receives only the exact capability.
 */
export function runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
  dependenciesValue: FloodgateV7ProductionPrefix100PreflightOuterLockDependenciesForTests,
  loadPreflightModuleValue: () => unknown,
): Promise<
  Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockResult<unknown>>
> {
  let dependencies: CapturedPrefix100PreflightOuterLockDependencies;
  try {
    if (
      arguments.length !== 2 ||
      typeof loadPreflightModuleValue !== "function"
    ) {
      fail("capture", "fresh-invocation-allowed");
    }
    dependencies =
      capturePrefix100PreflightOuterLockDependencies(dependenciesValue);
  } catch (error) {
    return NativePromise.reject(sanitizedLeaseFailure(error, "capture"));
  }
  return acquireAndRunPrefix100ReadOnlyPreflight(
    dependencies,
    loadPreflightModuleValue,
    "test-only",
  );
}

/** Fixed zero-argument production owner; it creates no lease or directory. */
export function runFloodgateV7ProductionPrefix100PreflightOuterLock(): Promise<
  Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockResult<unknown>>
> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "fresh-invocation-allowed",
        false,
        false,
        false,
        false,
      ),
    );
  }
  let dependencies: CapturedPrefix100PreflightOuterLockDependencies;
  try {
    dependencies = productionPrefix100PreflightOuterLockDependencies();
  } catch (error) {
    return NativePromise.reject(
      sanitizedLeaseFailure(error, "production-identity"),
    );
  }
  return acquireAndRunPrefix100ReadOnlyPreflight(
    dependencies,
    loadFixedProductionPrefix100PreflightModule,
    "production",
  );
}

function fixedRunnerExportName(
  gate: FloodgateV7ProductionOuterGate,
): FixedRunnerExportName {
  switch (gate) {
    case "durable-prefix-100":
      return "runFloodgateV7ProductionConnectorPrefix100UnderOuterGate";
    case "durable-prefix-500":
      return "runFloodgateV7ProductionConnectorPrefix500UnderOuterGate";
    case "sealed-final-24000":
      return "runFloodgateV7ProductionConnectorFinal24000UnderOuterGate";
  }
}

function loadFixedProductionRunnerModule(): unknown {
  return capturedRequire("./floodgate-v7-production-connector-runner");
}

async function invokeFixedRunnerUnderOuterGate(
  gate: FloodgateV7ProductionOuterGate,
  capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
  loadRunnerModule: FixedRunnerModuleLoader,
): Promise<unknown> {
  let loaded: unknown;
  try {
    loaded = loadRunnerModule();
  } catch {
    throw new NativeError("fixed production runner load failed");
  }
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    nodeIsProxy(loaded) ||
    (objectGetPrototypeOf(loaded) !== objectPrototype &&
      objectGetPrototypeOf(loaded) !== null)
  ) {
    throw new NativeError("fixed production runner module differs");
  }
  let operation: unknown;
  try {
    const descriptor = objectGetOwnPropertyDescriptor(
      loaded,
      fixedRunnerExportName(gate),
    );
    if (descriptor === undefined || descriptor.enumerable !== true) {
      throw new NativeError("fixed production runner export differs");
    }
    if ("value" in descriptor) {
      operation = descriptor.value;
    } else {
      if (
        descriptor.configurable !== false ||
        descriptor.set !== undefined ||
        typeof descriptor.get !== "function"
      ) {
        throw new NativeError("fixed production runner export differs");
      }
      operation = nativeReflectApply(descriptor.get, loaded, []);
    }
  } catch {
    throw new NativeError("fixed production runner export differs");
  }
  if (typeof operation !== "function") {
    throw new NativeError("fixed production runner export differs");
  }
  try {
    return await nativeReflectApply(operation, undefined, [capability]);
  } catch {
    throw new NativeError("fixed production runner operation failed");
  }
}

function runFixedOuterGateOwner(
  gate: FloodgateV7ProductionOuterGate,
  dependencies: CapturedDependencies,
  loadRunnerModule: FixedRunnerModuleLoader,
  boundary: "production" | "test-fixed-owner",
): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  return acquireAndRun(
    gate,
    dependencies,
    (capability) =>
      invokeFixedRunnerUnderOuterGate(gate, capability, loadRunnerModule),
    boundary,
    frozenRecord({ kind: "ordinary-fixed-gate" as const }),
  );
}

function runFixedPrefix100SameLockOneShotOwner(
  dependencies: CapturedDependencies,
  loadPreflightModule: Prefix100PreflightModuleLoader,
  loadRunnerModule: FixedRunnerModuleLoader,
  boundary: "production" | "test-fixed-owner",
): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  return acquireAndRun(
    "durable-prefix-100",
    dependencies,
    (capability) =>
      invokeFixedRunnerUnderOuterGate(
        "durable-prefix-100",
        capability,
        loadRunnerModule,
      ),
    boundary,
    frozenRecord({
      kind: "prefix-100-same-lock-one-shot" as const,
      preflightBoundary:
        boundary === "production"
          ? ("production" as const)
          : ("test-only" as const),
      loadPreflightModule,
    }),
  );
}

function runFixedProductionOuterGateOwner(
  gate: FloodgateV7ProductionOuterGate,
): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  let dependencies: CapturedDependencies;
  try {
    dependencies = productionDependencies();
  } catch (error) {
    return NativePromise.reject(sanitizedLeaseFailure(error, "key-read"));
  }
  return runFixedOuterGateOwner(
    gate,
    dependencies,
    loadFixedProductionRunnerModule,
    "production",
  );
}

/** Test-only fixed-owner seam for lazy-load and capability-consumption tests. */
export function runFloodgateV7ProductionOuterGateOwnerCoreForTests(
  gateValue: FloodgateV7ProductionOuterGate,
  dependenciesValue: FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
  loadRunnerModuleValue: () => unknown,
): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  let gate: FloodgateV7ProductionOuterGate;
  let dependencies: CapturedDependencies;
  try {
    gate = captureGate(gateValue);
    if (arguments.length !== 3 || typeof loadRunnerModuleValue !== "function") {
      fail("capture", "fresh-invocation-allowed");
    }
    dependencies = captureDependencies({
      ...dependenciesValue,
      installProcessLifecycleHandlers:
        dependenciesValue.installProcessLifecycleHandlers ?? true,
    });
  } catch (error) {
    return NativePromise.reject(sanitizedLeaseFailure(error, "capture"));
  }
  return runFixedOuterGateOwner(
    gate,
    dependencies,
    loadRunnerModuleValue,
    "test-fixed-owner",
  );
}

/**
 * Test-only mirror of the prefix-100 production one-shot composition. Both
 * lazy module loaders are mandatory and neither crosses the production API.
 */
export function runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
  dependenciesValue: FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
  loadPreflightModuleValue: () => unknown,
  loadRunnerModuleValue: () => unknown,
): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  let dependencies: CapturedDependencies;
  try {
    if (
      arguments.length !== 3 ||
      typeof loadPreflightModuleValue !== "function" ||
      typeof loadRunnerModuleValue !== "function"
    ) {
      fail("capture", "manual-reconciliation-required");
    }
    dependencies = captureDependencies({
      ...dependenciesValue,
      installProcessLifecycleHandlers:
        dependenciesValue.installProcessLifecycleHandlers ?? true,
    });
  } catch (error) {
    return NativePromise.reject(sanitizedLeaseFailure(error, "capture"));
  }
  return runFixedPrefix100SameLockOneShotOwner(
    dependencies,
    loadPreflightModuleValue,
    loadRunnerModuleValue,
    "test-fixed-owner",
  );
}

/** Test-only fixed owner that exercises the captured tsx/cjs lazy require. */
export function runFloodgateV7ProductionOuterGateLazyOwnerCoreForTests(
  gateValue: FloodgateV7ProductionOuterGate,
  dependenciesValue: FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  let gate: FloodgateV7ProductionOuterGate;
  let dependencies: CapturedDependencies;
  try {
    gate = captureGate(gateValue);
    if (arguments.length !== 2) {
      fail("capture", "fresh-invocation-allowed");
    }
    dependencies = captureDependencies({
      ...dependenciesValue,
      installProcessLifecycleHandlers:
        dependenciesValue.installProcessLifecycleHandlers ?? true,
    });
  } catch (error) {
    return NativePromise.reject(sanitizedLeaseFailure(error, "capture"));
  }
  return runFixedOuterGateOwner(
    gate,
    dependencies,
    loadFixedProductionRunnerModule,
    "test-fixed-owner",
  );
}

/** Test-only boundary using an injected private home and a copied 32-byte key. */
export function runWithFloodgateV7ProductionOuterGateLeaseCoreForTests<T>(
  gateValue: FloodgateV7ProductionOuterGate,
  dependenciesValue: FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
  operationValue: (
    capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
  ) => Promise<T>,
): Promise<Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<T>>> {
  let gate: FloodgateV7ProductionOuterGate;
  let dependencies: CapturedDependencies;
  try {
    gate = captureGate(gateValue);
    if (typeof operationValue !== "function") {
      fail("capture", "fresh-invocation-allowed");
    }
    dependencies = captureDependencies({
      ...dependenciesValue,
      installProcessLifecycleHandlers:
        dependenciesValue.installProcessLifecycleHandlers ?? true,
    });
  } catch (error) {
    return NativePromise.reject(
      error instanceof FloodgateV7ProductionOuterGateLeaseError
        ? error
        : new FloodgateV7ProductionOuterGateLeaseError(
            "capture",
            "fresh-invocation-allowed",
            false,
            false,
            false,
            false,
          ),
    );
  }
  return acquireAndRun(
    gate,
    dependencies,
    operationValue,
    "test-generic",
    frozenRecord({ kind: "ordinary-fixed-gate" as const }),
  );
}

/** Fixed production owner for only the durable-prefix-100 gate. */
export function runFloodgateV7ProductionOuterGatePrefix100(): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "fresh-invocation-allowed",
        false,
        false,
        false,
        false,
      ),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = productionDependencies();
  } catch (error) {
    return NativePromise.reject(sanitizedLeaseFailure(error, "key-read"));
  }
  return runFixedPrefix100SameLockOneShotOwner(
    dependencies,
    loadFixedProductionPrefix100PreflightModule,
    loadFixedProductionRunnerModule,
    "production",
  );
}

/** Fixed production owner for only the durable-prefix-500 gate. */
export function runFloodgateV7ProductionOuterGatePrefix500(): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "fresh-invocation-allowed",
        false,
        false,
        false,
        false,
      ),
    );
  }
  return runFixedProductionOuterGateOwner("durable-prefix-500");
}

/** Fixed production owner for only the sealed-final-24000 gate. */
export function runFloodgateV7ProductionOuterGateFinal24000(): Promise<
  Readonly<FloodgateV7ProductionOuterGateLeaseOperationResult<unknown>>
> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new FloodgateV7ProductionOuterGateLeaseError(
        "capture",
        "fresh-invocation-allowed",
        false,
        false,
        false,
        false,
      ),
    );
  }
  return runFixedProductionOuterGateOwner("sealed-final-24000");
}
