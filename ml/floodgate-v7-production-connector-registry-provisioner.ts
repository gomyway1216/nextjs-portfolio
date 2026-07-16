/**
 * One-shot provisioning boundary for the immutable private production
 * connector registry. It derives every operational path from the current
 * user home, binds the registry to the already-approved deployment key, and
 * never returns the run ID, key identity, paths, or digests.
 */

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  claimFloodgateV7ApprovedKeyEnrollment,
  loadFloodgateV7ApprovedKeyEnrollment,
  type FloodgateV7ApprovedKeyEnrollmentCapability,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
} from "./floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
  verifyFloodgateV7ApprovedKeyCurrentBinding,
  type FloodgateV7ApprovedKeyCurrentBindingReceipt,
} from "./floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_STATUS,
  FloodgateV7ProductionConnectorRegistryInstallerError,
  installFloodgateV7ProductionConnectorRegistry,
  type FloodgateV7ProductionConnectorRegistryInstallerReceipt,
  type FloodgateV7ProductionConnectorRegistryInstallerRetryDisposition,
} from "./floodgate-v7-production-connector-registry-installer";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES,
  claimFloodgateV7ProductionConnectorRegistry,
  loadFloodgateV7ProductionConnectorRegistry,
  type FloodgateV7ProductionConnectorRegistryCapability,
  type FloodgateV7ProductionConnectorRegistryInstallationInput,
  type FloodgateV7ProductionConnectorRegistryPrivateClaim,
} from "./floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
  assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding,
  verifyFloodgateV7ProductionConnectorVerifierReadiness,
} from "./floodgate-v7-production-connector-verifier-readiness";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "./floodgate-production-teacher-asset-authority";

export { FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION } from "./floodgate-v7-production-connector-verifier-readiness";

export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_CONTRACT =
  "shogi-floodgate-v7-production-connector-registry-provisioner-v2" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_STATUS =
  "immutable-private-run-registry-created-bound-and-postflight-validated" as const;
export type FloodgateV7ProductionConnectorRegistryProvisionerPhase =
  | "capture"
  | "verifier-readiness"
  | "approved-current-binding"
  | "approved-enrollment"
  | "configuration"
  | "entropy"
  | "installation"
  | "postflight";

export type FloodgateV7ProductionConnectorRegistryProvisionerDurability =
  | "no-registry-change-established"
  | "registry-may-have-been-created"
  | "registry-created-and-postflight-validated";

export type FloodgateV7ProductionConnectorRegistryProvisionerRetryDisposition =
  | FloodgateV7ProductionConnectorRegistryInstallerRetryDisposition
  | "fresh-invocation-required"
  | "registry-reconciliation-required";

export type FloodgateV7ProductionConnectorRegistryProvisionerExecutionBoundary =
  | "production-fixed-current-euid-private-registry-provisioning"
  | "test-only-injected-private-registry-provisioning";

export interface FloodgateV7ProductionConnectorRegistryProvisionerReceipt<
  TBoundary extends
    FloodgateV7ProductionConnectorRegistryProvisionerExecutionBoundary =
    FloodgateV7ProductionConnectorRegistryProvisionerExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_STATUS;
  readonly execution_boundary: TBoundary;
  readonly verification: Readonly<{
    readonly verifier_source_artifact_closure_checked_before_install: true;
    readonly approved_record_current_key_binding_checked: true;
    readonly approved_record_bound_into_registry: true;
    readonly run_id_generated_from_32_byte_csprng: true;
    readonly fixed_configuration_only: true;
    readonly create_only_install_succeeded: true;
    readonly registry_loader_postflight_succeeded: true;
    readonly exact_private_claim_postflight_succeeded: true;
    readonly sensitive_values_exported: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly run_id_disclosed: false;
    readonly approved_record_digest_disclosed: false;
    readonly key_instance_id_disclosed: false;
    readonly owner_uid_disclosed: false;
    readonly path_disclosed: false;
    readonly filesystem_identity_disclosed: false;
    readonly key_material_disclosed: false;
    readonly gate_executed: false;
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

export class FloodgateV7ProductionConnectorRegistryProvisionerError extends Error {
  readonly phase: FloodgateV7ProductionConnectorRegistryProvisionerPhase;
  readonly durability: FloodgateV7ProductionConnectorRegistryProvisionerDurability;
  readonly registry_may_have_been_created: boolean;
  readonly retry_disposition: FloodgateV7ProductionConnectorRegistryProvisionerRetryDisposition;

  constructor(
    phase: FloodgateV7ProductionConnectorRegistryProvisionerPhase,
    durability: FloodgateV7ProductionConnectorRegistryProvisionerDurability,
    registryMayHaveBeenCreated: boolean,
    retryDisposition: FloodgateV7ProductionConnectorRegistryProvisionerRetryDisposition,
  ) {
    super(
      "Floodgate v7 production connector registry provisioning failed; inspect sanitized reconciliation metadata",
    );
    this.name = "FloodgateV7ProductionConnectorRegistryProvisionerError";
    this.phase = phase;
    this.durability = durability;
    this.registry_may_have_been_created = registryMayHaveBeenCreated;
    this.retry_disposition = retryDisposition;
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ProductionConnectorRegistryProvisionerError: provisioning failed",
    });
    Object.freeze(this);
  }
}

interface ProvisionerDependencies {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly verifyVerifierReadiness: () => Promise<unknown>;
  readonly assertVerifierReadinessIdentityBinding: (
    receipt: unknown,
    expectedEffectiveUserId: number,
    expectedHomeDirectory: string,
  ) => void;
  readonly verifyCurrentBinding: () => Promise<
    Readonly<FloodgateV7ApprovedKeyCurrentBindingReceipt>
  >;
  readonly loadApprovedEnrollment: () => Promise<
    Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>
  >;
  readonly claimApprovedEnrollment: (
    capability: FloodgateV7ApprovedKeyEnrollmentCapability,
  ) => Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
  readonly installRegistry: (
    input: FloodgateV7ProductionConnectorRegistryInstallationInput,
  ) => Promise<
    Readonly<FloodgateV7ProductionConnectorRegistryInstallerReceipt>
  >;
  readonly loadRegistry: () => Promise<
    Readonly<FloodgateV7ProductionConnectorRegistryCapability>
  >;
  readonly claimRegistry: (
    capability: FloodgateV7ProductionConnectorRegistryCapability,
  ) => Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim>;
  readonly randomBytes: (size: number) => Buffer;
}

export type FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests =
  ProvisionerDependencies;

const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const arrayIsArray = Array.isArray;
const bufferIsBuffer = Buffer.isBuffer.bind(Buffer);
const bufferToString = Buffer.prototype.toString;
const uint8Fill = Uint8Array.prototype.fill;
const reflectApply = Reflect.apply;
const pathResolve = path.resolve.bind(path);
const pathJoin = path.join.bind(path);
const pathIsAbsolute = path.isAbsolute.bind(path);
const getUserInfo = os.userInfo.bind(os);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const realpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const capturedRandomBytes = randomBytes;
const HEX_64_RE = /^[0-9a-f]{64}$/u;
const SAFE_INTEGER = Number.isSafeInteger;
const DEPENDENCY_KEYS = objectFreeze([
  "effectiveUserId",
  "homeDirectory",
  "verifyVerifierReadiness",
  "assertVerifierReadinessIdentityBinding",
  "verifyCurrentBinding",
  "loadApprovedEnrollment",
  "claimApprovedEnrollment",
  "installRegistry",
  "loadRegistry",
  "claimRegistry",
  "randomBytes",
] as const);
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
const CURRENT_BINDING_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "algorithm",
  "verification",
  "nonclaims",
] as const);
const CURRENT_BINDING_VERIFICATION_KEYS = objectFreeze([
  "approved_record_validated",
  "current_key_freshly_inspected",
  "exact_binding_match",
  "held_descriptors_revalidated",
  "memory_only",
  "sensitive_values_exported",
] as const);
const CURRENT_BINDING_NONCLAIM_KEYS = objectFreeze([
  "single_use_capability_returned",
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

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("provisioner record requires data properties");
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: descriptor.enumerable,
      writable: false,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function exactPlainRecord(value: unknown, keys: readonly string[]) {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error("provisioner value is not a plain record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new Error("provisioner record key count differs");
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = ownKeys[index];
    const descriptor = typeof key === "string" ? descriptors[key] : undefined;
    if (
      key !== keys[index] ||
      typeof key !== "string" ||
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new Error("provisioner record shape differs");
    }
  }
  return value as Record<string, unknown>;
}

function captureDependencies(
  value: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests,
): Readonly<ProvisionerDependencies> {
  const record = exactPlainRecord(value, DEPENDENCY_KEYS);
  const effectiveUserId = record.effectiveUserId;
  const homeDirectory = record.homeDirectory;
  if (
    typeof effectiveUserId !== "number" ||
    !SAFE_INTEGER(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    !pathIsAbsolute(homeDirectory)
  ) {
    throw new Error("provisioner identity differs");
  }
  for (let index = 2; index < DEPENDENCY_KEYS.length; index += 1) {
    const key = DEPENDENCY_KEYS[index];
    if (typeof record[key] !== "function" || nodeIsProxy(record[key])) {
      throw new Error("provisioner dependency differs");
    }
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory: pathResolve(homeDirectory),
    verifyVerifierReadiness:
      record.verifyVerifierReadiness as ProvisionerDependencies["verifyVerifierReadiness"],
    assertVerifierReadinessIdentityBinding:
      record.assertVerifierReadinessIdentityBinding as ProvisionerDependencies["assertVerifierReadinessIdentityBinding"],
    verifyCurrentBinding:
      record.verifyCurrentBinding as ProvisionerDependencies["verifyCurrentBinding"],
    loadApprovedEnrollment:
      record.loadApprovedEnrollment as ProvisionerDependencies["loadApprovedEnrollment"],
    claimApprovedEnrollment:
      record.claimApprovedEnrollment as ProvisionerDependencies["claimApprovedEnrollment"],
    installRegistry:
      record.installRegistry as ProvisionerDependencies["installRegistry"],
    loadRegistry:
      record.loadRegistry as ProvisionerDependencies["loadRegistry"],
    claimRegistry:
      record.claimRegistry as ProvisionerDependencies["claimRegistry"],
    randomBytes: record.randomBytes as ProvisionerDependencies["randomBytes"],
  });
}

function validateVerifierReadinessReceipt(
  value: unknown,
  boundary: FloodgateV7ProductionConnectorRegistryProvisionerExecutionBoundary,
): void {
  const receipt = exactPlainRecord(value, VERIFIER_READINESS_RECEIPT_KEYS);
  const verification = exactPlainRecord(
    receipt.verification,
    VERIFIER_READINESS_VERIFICATION_KEYS,
  );
  const nonclaims = exactPlainRecord(
    receipt.nonclaims,
    VERIFIER_READINESS_NONCLAIM_KEYS,
  );
  const expectedBoundary =
    boundary === "production-fixed-current-euid-private-registry-provisioning"
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
    throw new Error("verifier readiness receipt differs");
  }
  for (const key of VERIFIER_READINESS_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new Error("verifier readiness nonclaim differs");
    }
  }
}

function zeroize(bytes: Uint8Array): void {
  reflectApply(uint8Fill, bytes, [0]);
}

interface ApprovedBinding {
  readonly recordBytes: number;
  readonly recordSha256: string;
  readonly keyInstanceId: string;
}

function ownDataProperty(value: unknown, key: string, label: string): unknown {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error(`${label} differs`);
  }
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    throw new Error(`${label}.${key} differs`);
  }
  return descriptor.value;
}

function captureApprovedBinding(value: unknown): Readonly<ApprovedBinding> {
  const record = ownDataProperty(value, "record", "approved claim");
  const keyInstanceId = ownDataProperty(
    value,
    "key_instance_id",
    "approved claim",
  );
  const recordBytes = ownDataProperty(record, "bytes", "approved record");
  const recordSha256 = ownDataProperty(record, "sha256", "approved record");
  if (
    typeof recordBytes !== "number" ||
    !SAFE_INTEGER(recordBytes) ||
    recordBytes < 2 ||
    recordBytes > FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES ||
    typeof recordSha256 !== "string" ||
    !HEX_64_RE.test(recordSha256) ||
    typeof keyInstanceId !== "string" ||
    !HEX_64_RE.test(keyInstanceId)
  ) {
    throw new Error("approved binding differs");
  }
  return frozenRecord({ recordBytes, recordSha256, keyInstanceId });
}

function privateConfiguration(
  home: string,
  approved: Readonly<ApprovedBinding>,
  runId: string,
): Readonly<FloodgateV7ProductionConnectorRegistryInstallationInput> {
  const repositoryRoot = pathJoin(
    home,
    ".codex",
    "worktrees",
    "shogi-floodgate-role-bundle",
  );
  return frozenRecord({
    run_id: runId,
    approved_key_binding: frozenRecord({
      record_bytes: approved.recordBytes,
      record_sha256: approved.recordSha256,
      key_instance_id: approved.keyInstanceId,
    }),
    verifier_revision: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
    repository_root: repositoryRoot,
    raw_lock_root: pathJoin(
      home,
      ".codex",
      "shogi-data",
      "floodgate-q1-2026-raw-lock",
    ),
    role_lock_root: pathJoin(
      home,
      ".codex",
      "shogi-data",
      "floodgate-q1-2026-role-lock-v1",
    ),
    role_bundle_root: pathJoin(
      home,
      ".codex",
      "shogi-bundles",
      "floodgate-q1-2026-label-free-role-bundle-v2",
    ),
    legacy_protected_position_ids_path: pathJoin(
      repositoryRoot,
      "ml",
      "data",
      "wcsc36",
      "int16-aware-replay-excluded-position-ids.txt",
    ),
    engine_args: objectFreeze([] as string[]),
  });
}

function expectedPrivateClaim(
  home: string,
  input: Readonly<FloodgateV7ProductionConnectorRegistryInstallationInput>,
) {
  const registryRoot = pathJoin(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  const publicationParent = pathJoin(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
  const assetRoot = pathJoin(
    home,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  return frozenRecord({
    runId: input.run_id,
    approvedKeyBinding: frozenRecord({
      recordBytes: input.approved_key_binding.record_bytes,
      recordSha256: input.approved_key_binding.record_sha256,
      keyInstanceId: input.approved_key_binding.key_instance_id,
    }),
    stageAuthorization: frozenRecord({
      repositoryRoot: input.repository_root,
      rawLockRoot: input.raw_lock_root,
      roleLockRoot: input.role_lock_root,
      roleBundleRoot: input.role_bundle_root,
      legacyProtectedPositionIdsPath: input.legacy_protected_position_ids_path,
      publicationParent,
      stageBasename: `floodgate-v7-${input.run_id}-stage`,
      destinationBasename: `floodgate-v7-${input.run_id}-final`,
      engineBin: pathJoin(assetRoot, "engine", "yaneuraou"),
      engineReceipt: pathJoin(assetRoot, "engine", "yaneuraou-receipt.json"),
      engineArgs: input.engine_args,
      evalDir: pathJoin(assetRoot, "eval"),
    }),
    consumer: frozenRecord({
      repositoryRoot: input.repository_root,
      verifierRevision: input.verifier_revision,
      rawLockRoot: input.raw_lock_root,
      roleLockRoot: input.role_lock_root,
      legacyProtectedPositionIdsPath: input.legacy_protected_position_ids_path,
      outputRoot: input.role_bundle_root,
    }),
  });
}

function exactPrivateClaim(
  actual: Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim>,
  expected: ReturnType<typeof expectedPrivateClaim>,
): boolean {
  try {
    const claim = exactPlainRecord(actual, [
      "runId",
      "approvedKeyBinding",
      "stageAuthorization",
      "consumer",
    ]);
    const approvedKeyBinding = exactPlainRecord(claim.approvedKeyBinding, [
      "recordBytes",
      "recordSha256",
      "keyInstanceId",
    ]);
    const stageAuthorization = exactPlainRecord(claim.stageAuthorization, [
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
    ]);
    const consumer = exactPlainRecord(claim.consumer, [
      "repositoryRoot",
      "verifierRevision",
      "rawLockRoot",
      "roleLockRoot",
      "legacyProtectedPositionIdsPath",
      "outputRoot",
    ]);
    const engineArgs = stageAuthorization.engineArgs;
    if (
      !arrayIsArray(engineArgs) ||
      nodeIsProxy(engineArgs) ||
      engineArgs.length !== expected.stageAuthorization.engineArgs.length
    ) {
      return false;
    }
    const engineArgumentDescriptors =
      objectGetOwnPropertyDescriptors(engineArgs);
    const engineArgumentKeys = reflectOwnKeys(engineArgs);
    if (engineArgumentKeys.length !== engineArgs.length + 1) return false;
    for (let index = 0; index < engineArgs.length; index += 1) {
      const descriptor = engineArgumentDescriptors[String(index)];
      if (
        engineArgumentKeys[index] !== String(index) ||
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true ||
        descriptor.value !== expected.stageAuthorization.engineArgs[index]
      ) {
        return false;
      }
    }
    const lengthDescriptor = objectGetOwnPropertyDescriptor(
      engineArgs,
      "length",
    );
    if (
      engineArgumentKeys[engineArgs.length] !== "length" ||
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      lengthDescriptor.value !== engineArgs.length
    ) {
      return false;
    }
    return (
      claim.runId === expected.runId &&
      approvedKeyBinding.recordBytes ===
        expected.approvedKeyBinding.recordBytes &&
      approvedKeyBinding.recordSha256 ===
        expected.approvedKeyBinding.recordSha256 &&
      approvedKeyBinding.keyInstanceId ===
        expected.approvedKeyBinding.keyInstanceId &&
      stageAuthorization.repositoryRoot ===
        expected.stageAuthorization.repositoryRoot &&
      stageAuthorization.rawLockRoot ===
        expected.stageAuthorization.rawLockRoot &&
      stageAuthorization.roleLockRoot ===
        expected.stageAuthorization.roleLockRoot &&
      stageAuthorization.roleBundleRoot ===
        expected.stageAuthorization.roleBundleRoot &&
      stageAuthorization.legacyProtectedPositionIdsPath ===
        expected.stageAuthorization.legacyProtectedPositionIdsPath &&
      stageAuthorization.publicationParent ===
        expected.stageAuthorization.publicationParent &&
      stageAuthorization.stageBasename ===
        expected.stageAuthorization.stageBasename &&
      stageAuthorization.destinationBasename ===
        expected.stageAuthorization.destinationBasename &&
      stageAuthorization.engineBin === expected.stageAuthorization.engineBin &&
      stageAuthorization.engineReceipt ===
        expected.stageAuthorization.engineReceipt &&
      stageAuthorization.evalDir === expected.stageAuthorization.evalDir &&
      consumer.repositoryRoot === expected.consumer.repositoryRoot &&
      consumer.verifierRevision === expected.consumer.verifierRevision &&
      consumer.rawLockRoot === expected.consumer.rawLockRoot &&
      consumer.roleLockRoot === expected.consumer.roleLockRoot &&
      consumer.legacyProtectedPositionIdsPath ===
        expected.consumer.legacyProtectedPositionIdsPath &&
      consumer.outputRoot === expected.consumer.outputRoot
    );
  } catch {
    return false;
  }
}

function validateCurrentBindingReceipt(
  value: unknown,
  boundary: FloodgateV7ProductionConnectorRegistryProvisionerExecutionBoundary,
): void {
  const receipt = exactPlainRecord(value, CURRENT_BINDING_RECEIPT_KEYS);
  const verification = exactPlainRecord(
    receipt.verification,
    CURRENT_BINDING_VERIFICATION_KEYS,
  );
  const nonclaims = exactPlainRecord(
    receipt.nonclaims,
    CURRENT_BINDING_NONCLAIM_KEYS,
  );
  const expectedExecutionBoundary =
    boundary === "production-fixed-current-euid-private-registry-provisioning"
      ? "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding"
      : "test-only-injected-current-euid-home-approved-record-current-key-binding";
  if (
    receipt.contract !== FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT ||
    receipt.status !== FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== expectedExecutionBoundary ||
    receipt.algorithm !== FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM ||
    verification.approved_record_validated !== true ||
    verification.current_key_freshly_inspected !== true ||
    verification.exact_binding_match !== true ||
    verification.held_descriptors_revalidated !== true ||
    verification.memory_only !== true ||
    verification.sensitive_values_exported !== false
  ) {
    throw new Error("current binding receipt differs");
  }
  for (const key of CURRENT_BINDING_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new Error("current binding nonclaim differs");
    }
  }
}

function isInstallerPhase(value: unknown): boolean {
  switch (value) {
    case "capture":
    case "production-identity":
    case "registry-validation":
    case "namespace":
    case "staging-create":
    case "staging-write":
    case "staging-file-sync":
    case "commit":
    case "commit-directory-sync":
    case "staging-removal":
    case "cleanup-directory-sync":
    case "revalidation":
    case "cleanup":
      return true;
    default:
      return false;
  }
}

function isInstallerDurability(value: unknown): boolean {
  switch (value) {
    case "no-installation-change-established":
    case "managed-prefix-may-exist-registry-absent":
    case "managed-prefix-may-exist-existing-registry-not-adopted":
    case "parent-chain-durable-registry-absent":
    case "staging-may-exist":
    case "staging-file-synced-final-absent":
    case "final-link-may-exist":
    case "final-link-directory-synced":
    case "registry-published-and-staging-removal-durable":
      return true;
    default:
      return false;
  }
}

function captureTypedInstallerFailure(value: unknown): Readonly<{
  registryMayHaveBeenCreated: boolean;
  retryDisposition: FloodgateV7ProductionConnectorRegistryInstallerRetryDisposition;
}> | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      nodeIsProxy(value) ||
      !(value instanceof FloodgateV7ProductionConnectorRegistryInstallerError)
    ) {
      return null;
    }
    const descriptors = objectGetOwnPropertyDescriptors(value);
    const phase = descriptors.phase;
    const durability = descriptors.durability;
    const mayHaveCreated = descriptors.registry_may_have_been_created;
    const retryDisposition = descriptors.retry_disposition;
    if (
      phase === undefined ||
      !("value" in phase) ||
      !isInstallerPhase(phase.value) ||
      durability === undefined ||
      !("value" in durability) ||
      !isInstallerDurability(durability.value) ||
      mayHaveCreated === undefined ||
      !("value" in mayHaveCreated) ||
      typeof mayHaveCreated.value !== "boolean" ||
      retryDisposition === undefined ||
      !("value" in retryDisposition) ||
      (retryDisposition.value !== "safe-to-retry-after-not-installed" &&
        retryDisposition.value !== "do-not-retry-existing-registry" &&
        retryDisposition.value !== "manual-reconciliation-required") ||
      (mayHaveCreated.value === true &&
        retryDisposition.value === "safe-to-retry-after-not-installed") ||
      (retryDisposition.value === "safe-to-retry-after-not-installed" &&
        durability.value !== "parent-chain-durable-registry-absent")
    ) {
      return null;
    }
    const durabilityImpliesPossibleCreation =
      durability.value === "final-link-may-exist" ||
      durability.value === "final-link-directory-synced" ||
      durability.value === "registry-published-and-staging-removal-durable";
    if (mayHaveCreated.value !== durabilityImpliesPossibleCreation) {
      return null;
    }
    return frozenRecord({
      registryMayHaveBeenCreated: mayHaveCreated.value,
      retryDisposition: retryDisposition.value,
    });
  } catch {
    return null;
  }
}

function buildReceipt<
  TBoundary extends
    FloodgateV7ProductionConnectorRegistryProvisionerExecutionBoundary,
>(
  boundary: TBoundary,
): Readonly<
  FloodgateV7ProductionConnectorRegistryProvisionerReceipt<TBoundary>
> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_STATUS,
    execution_boundary: boundary,
    verification: frozenRecord({
      verifier_source_artifact_closure_checked_before_install: true as const,
      approved_record_current_key_binding_checked: true as const,
      approved_record_bound_into_registry: true as const,
      run_id_generated_from_32_byte_csprng: true as const,
      fixed_configuration_only: true as const,
      create_only_install_succeeded: true as const,
      registry_loader_postflight_succeeded: true as const,
      exact_private_claim_postflight_succeeded: true as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: frozenRecord({
      run_id_disclosed: false as const,
      approved_record_digest_disclosed: false as const,
      key_instance_id_disclosed: false as const,
      owner_uid_disclosed: false as const,
      path_disclosed: false as const,
      filesystem_identity_disclosed: false as const,
      key_material_disclosed: false as const,
      gate_executed: false as const,
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

async function provision<
  TBoundary extends
    FloodgateV7ProductionConnectorRegistryProvisionerExecutionBoundary,
>(
  dependencies: Readonly<ProvisionerDependencies>,
  boundary: TBoundary,
): Promise<
  Readonly<FloodgateV7ProductionConnectorRegistryProvisionerReceipt<TBoundary>>
> {
  try {
    const readinessReceipt = await dependencies.verifyVerifierReadiness();
    validateVerifierReadinessReceipt(readinessReceipt, boundary);
    dependencies.assertVerifierReadinessIdentityBinding(
      readinessReceipt,
      dependencies.effectiveUserId,
      dependencies.homeDirectory,
    );
  } catch {
    throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
      "verifier-readiness",
      "no-registry-change-established",
      false,
      "fresh-invocation-required",
    );
  }

  try {
    validateCurrentBindingReceipt(
      await dependencies.verifyCurrentBinding(),
      boundary,
    );
  } catch {
    throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
      "approved-current-binding",
      "no-registry-change-established",
      false,
      "fresh-invocation-required",
    );
  }

  let approved: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
  try {
    const capability = await dependencies.loadApprovedEnrollment();
    approved = dependencies.claimApprovedEnrollment(capability);
  } catch {
    throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
      "approved-enrollment",
      "no-registry-change-established",
      false,
      "fresh-invocation-required",
    );
  }

  let entropy: Buffer | undefined;
  let runId: string;
  try {
    entropy = dependencies.randomBytes(32);
    if (!bufferIsBuffer(entropy) || entropy.byteLength !== 32) {
      throw new Error("provisioner entropy differs");
    }
    runId = reflectApply(bufferToString, entropy, ["hex"]) as string;
    if (!HEX_64_RE.test(runId)) throw new Error("run ID differs");
  } catch {
    throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
      "entropy",
      "no-registry-change-established",
      false,
      "fresh-invocation-required",
    );
  } finally {
    if (entropy !== undefined) zeroize(entropy);
  }

  let input: Readonly<FloodgateV7ProductionConnectorRegistryInstallationInput>;
  try {
    input = privateConfiguration(
      dependencies.homeDirectory,
      captureApprovedBinding(approved),
      runId,
    );
  } catch {
    throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
      "configuration",
      "no-registry-change-established",
      false,
      "fresh-invocation-required",
    );
  }

  try {
    const receipt = await dependencies.installRegistry(input);
    if (
      receipt.contract !==
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_CONTRACT ||
      receipt.status !==
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_STATUS
    ) {
      throw new Error("installer receipt differs");
    }
  } catch (error) {
    const typedFailure = captureTypedInstallerFailure(error);
    if (typedFailure !== null) {
      throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
        "installation",
        typedFailure.registryMayHaveBeenCreated
          ? "registry-may-have-been-created"
          : "no-registry-change-established",
        typedFailure.registryMayHaveBeenCreated,
        typedFailure.retryDisposition,
      );
    }
    throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
      "installation",
      "registry-may-have-been-created",
      true,
      "registry-reconciliation-required",
    );
  }

  try {
    const capability = await dependencies.loadRegistry();
    const claim = dependencies.claimRegistry(capability);
    if (
      !exactPrivateClaim(
        claim,
        expectedPrivateClaim(dependencies.homeDirectory, input),
      )
    ) {
      throw new Error("registry postflight differs");
    }
  } catch {
    throw new FloodgateV7ProductionConnectorRegistryProvisionerError(
      "postflight",
      "registry-may-have-been-created",
      true,
      "registry-reconciliation-required",
    );
  }

  return buildReceipt(boundary);
}

function rejected<T>(error: unknown): Promise<T> {
  return new NativePromise((_resolve, reject) => reject(error));
}

export function provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
  dependenciesValue: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7ProductionConnectorRegistryProvisionerReceipt<"test-only-injected-private-registry-provisioning">
  >
> {
  if (arguments.length !== 1) {
    return rejected(
      new FloodgateV7ProductionConnectorRegistryProvisionerError(
        "capture",
        "no-registry-change-established",
        false,
        "fresh-invocation-required",
      ),
    );
  }
  let dependencies: Readonly<ProvisionerDependencies>;
  try {
    dependencies = captureDependencies(dependenciesValue);
    const productionHome = pathResolve(getUserInfo().homedir);
    let candidateHome = dependencies.homeDirectory;
    try {
      candidateHome = realpathSync(candidateHome);
    } catch {
      // The injected installer owns the authoritative test namespace check.
    }
    if (candidateHome === productionHome) {
      throw new Error("test home aliases production home");
    }
  } catch {
    return rejected(
      new FloodgateV7ProductionConnectorRegistryProvisionerError(
        "capture",
        "no-registry-change-established",
        false,
        "fresh-invocation-required",
      ),
    );
  }
  return provision(
    dependencies,
    "test-only-injected-private-registry-provisioning",
  );
}

export function provisionFloodgateV7ProductionConnectorRegistry(): Promise<
  Readonly<
    FloodgateV7ProductionConnectorRegistryProvisionerReceipt<"production-fixed-current-euid-private-registry-provisioning">
  >
> {
  if (arguments.length !== 0 || getEffectiveUserId === null) {
    return rejected(
      new FloodgateV7ProductionConnectorRegistryProvisionerError(
        "capture",
        "no-registry-change-established",
        false,
        "fresh-invocation-required",
      ),
    );
  }
  try {
    const effectiveUserId = getEffectiveUserId();
    const userInfo = getUserInfo();
    if (userInfo.uid !== effectiveUserId) {
      throw new Error("production identity differs");
    }
    const dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: userInfo.homedir,
      verifyVerifierReadiness:
        verifyFloodgateV7ProductionConnectorVerifierReadiness as ProvisionerDependencies["verifyVerifierReadiness"],
      assertVerifierReadinessIdentityBinding:
        assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding as ProvisionerDependencies["assertVerifierReadinessIdentityBinding"],
      verifyCurrentBinding:
        verifyFloodgateV7ApprovedKeyCurrentBinding as ProvisionerDependencies["verifyCurrentBinding"],
      loadApprovedEnrollment:
        loadFloodgateV7ApprovedKeyEnrollment as ProvisionerDependencies["loadApprovedEnrollment"],
      claimApprovedEnrollment:
        claimFloodgateV7ApprovedKeyEnrollment as ProvisionerDependencies["claimApprovedEnrollment"],
      installRegistry:
        installFloodgateV7ProductionConnectorRegistry as ProvisionerDependencies["installRegistry"],
      loadRegistry:
        loadFloodgateV7ProductionConnectorRegistry as ProvisionerDependencies["loadRegistry"],
      claimRegistry:
        claimFloodgateV7ProductionConnectorRegistry as ProvisionerDependencies["claimRegistry"],
      randomBytes: capturedRandomBytes,
    });
    return provision(
      dependencies,
      "production-fixed-current-euid-private-registry-provisioning",
    );
  } catch {
    return rejected(
      new FloodgateV7ProductionConnectorRegistryProvisionerError(
        "capture",
        "no-registry-change-established",
        false,
        "fresh-invocation-required",
      ),
    );
  }
}
