/**
 * Read-only diagnostic boundary that verifies the separately approved
 * deployment-key record still names the freshly inspected current key.
 * Sensitive record and key identities remain in memory and are never returned.
 */

import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES,
  claimFloodgateV7ApprovedKeyEnrollment,
  claimFloodgateV7ApprovedKeyEnrollmentCoreForTests,
  loadFloodgateV7ApprovedKeyEnrollment,
  loadFloodgateV7ApprovedKeyEnrollmentCoreForTests,
  type FloodgateV7ApprovedKeyEnrollmentCapability,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
} from "./floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
} from "./floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
  inspectFloodgateV7DeploymentKeyInstance,
  inspectFloodgateV7DeploymentKeyInstanceCoreForTests,
  type FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt,
  type FloodgateV7DeploymentKeyInstanceEnrollmentDependenciesForTests,
} from "./floodgate-v7-deployment-key-instance-enrollment";

export const FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT =
  "shogi-floodgate-v7-approved-key-current-binding-preflight-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS =
  "approved-record-exactly-matches-fresh-current-key" as const;
export const FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY =
  "read-only-memory-only-approved-record-to-fresh-current-key-binding-diagnostic-without-exported-sensitive-values-or-authority-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM =
  "approved-record-to-fresh-current-key-eight-field-strict-equality-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT =
  "shogi-floodgate-v7-approved-key-expected-current-binding-preflight-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS =
  "reloaded-approved-record-current-key-and-private-expected-binding-exactly-match" as const;
export const FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY =
  "read-only-memory-only-reloaded-approved-record-to-fresh-current-key-and-caller-held-private-expected-binding-diagnostic-without-exported-sensitive-values-or-authority-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM =
  "approved-record-to-fresh-current-key-eight-field-plus-private-expected-record-three-field-strict-equality-v1" as const;

export type FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding"
  | "test-only-injected-current-euid-home-approved-record-current-key-binding";

export interface FloodgateV7ApprovedKeyCurrentBindingReceipt<
  TBoundary extends FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary =
    FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT;
  readonly status: typeof FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly algorithm: typeof FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM;
  readonly verification: Readonly<{
    readonly approved_record_validated: true;
    readonly current_key_freshly_inspected: true;
    readonly exact_binding_match: true;
    readonly held_descriptors_revalidated: true;
    readonly memory_only: true;
    readonly sensitive_values_exported: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly single_use_capability_returned: false;
    readonly approved_claim_returned: false;
    readonly approval_created: false;
    readonly record_created_or_written: false;
    readonly key_created_or_written: false;
    readonly run_authority: false;
    readonly stage_authority: false;
    readonly connector_authority: false;
    readonly checkpoint_key_capability: false;
    readonly checkpoint: false;
    readonly runtime: false;
    readonly dataset_read: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7ApprovedKeyExpectedBinding {
  readonly recordBytes: number;
  readonly recordSha256: string;
  readonly keyInstanceId: string;
}

export interface FloodgateV7ApprovedKeyExpectedCurrentBindingReceipt<
  TBoundary extends FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary =
    FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT;
  readonly status: typeof FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly algorithm: typeof FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM;
  readonly verification: Readonly<{
    readonly approved_record_reloaded_and_validated: true;
    readonly current_key_freshly_inspected: true;
    readonly approved_to_current_exact_binding_match: true;
    readonly reloaded_approved_to_private_expected_exact_match: true;
    readonly held_descriptors_revalidated: true;
    readonly memory_only: true;
    readonly sensitive_values_exported: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly expected_binding_returned: false;
    readonly approved_claim_returned: false;
    readonly approval_created: false;
    readonly record_created_or_written: false;
    readonly key_created_or_written: false;
    readonly run_authority: false;
    readonly stage_authority: false;
    readonly connector_authority: false;
    readonly checkpoint_key_capability: false;
    readonly checkpoint: false;
    readonly runtime: false;
    readonly dataset_read: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

type TestCurrentKeyInspector = (
  dependencies: FloodgateV7DeploymentKeyInstanceEnrollmentDependenciesForTests,
) => Promise<
  Readonly<
    FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<"test-only-injected-current-euid-home-key-instance-inspection">
  >
>;

export interface FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly inspectCurrentKeyForTests?: TestCurrentKeyInspector;
}

export type FloodgateV7ApprovedKeyCurrentBindingPhase =
  | "capture"
  | "approved-record-load"
  | "current-key-inspection"
  | "approved-record-claim"
  | "expected-binding"
  | "comparison"
  | "receipt";

export class FloodgateV7ApprovedKeyCurrentBindingError extends Error {
  readonly phase!: FloodgateV7ApprovedKeyCurrentBindingPhase;
  readonly receipt_issued!: false;
  readonly authority_issued!: false;

  constructor(phase: FloodgateV7ApprovedKeyCurrentBindingPhase) {
    super(
      "Floodgate v7 approved key current-binding verification failed without issuing a receipt or authority",
    );
    objectDefineProperty(this, "name", {
      value: "FloodgateV7ApprovedKeyCurrentBindingError",
    });
    objectDefineProperty(this, "phase", { enumerable: true, value: phase });
    objectDefineProperty(this, "receipt_issued", {
      enumerable: true,
      value: false,
    });
    objectDefineProperty(this, "authority_issued", {
      enumerable: true,
      value: false,
    });
    objectDefineProperty(this, "stack", {
      value:
        "FloodgateV7ApprovedKeyCurrentBindingError: current binding verification failed",
    });
    objectFreeze(this);
  }
}

type CapturedDependencies = Readonly<{
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly inspectCurrentKey: TestCurrentKeyInspector;
}>;

type BindingIdentity = Readonly<{
  readonly layout: "fixed-current-euid-userinfo-home-v1";
  readonly keyId: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly ownerUid: number;
  readonly parentDev: string;
  readonly parentIno: string;
  readonly keyDev: string;
  readonly keyIno: string;
  readonly keyInstanceId: string;
}>;

type ApprovedExpectedSnapshot = Readonly<{
  readonly identity: Readonly<BindingIdentity>;
  readonly expected: Readonly<FloodgateV7ApprovedKeyExpectedBinding>;
}>;

const NativeError = Error;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIsFrozen = Object.isFrozen;
const objectPrototype = Object.prototype;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const numberIsSafeInteger = Number.isSafeInteger;
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathParse = path.parse.bind(path);
const pathResolve = path.resolve.bind(path);
const KEY_INSTANCE_RE = /^[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/;

const CURRENT_RECEIPT_KEYS = objectFreeze([
  "algorithm",
  "claim_boundary",
  "contract",
  "execution_boundary",
  "key_deployment",
  "nonclaims",
  "status",
  "test_boundary",
  "trust_boundary",
] as const);
const CURRENT_DEPLOYMENT_KEYS = objectFreeze([
  "held_descriptors_revalidated",
  "key_bytes",
  "key_id",
  "key_identity",
  "key_instance_algorithm",
  "key_instance_id",
  "key_mode",
  "key_nlink",
  "layout",
  "owner_uid",
  "parent_identity",
  "parent_mode",
] as const);
const IDENTITY_KEYS = objectFreeze(["dev", "ino"] as const);
const APPROVED_CLAIM_KEYS = objectFreeze([
  "approval",
  "candidate_receipt",
  "deployment_identity",
  "execution_boundary",
  "key_id",
  "key_instance_id",
  "record",
] as const);
const APPROVED_DEPLOYMENT_KEYS = objectFreeze([
  "key_dev",
  "key_ino",
  "layout",
  "owner_uid",
  "parent_dev",
  "parent_ino",
] as const);
const TEST_BOUNDARY_KEYS = objectFreeze([
  "current_effective_uid_required",
  "production_home_alias_rejected",
  "production_home_origin",
  "test_hook_may_observe_key_copy",
] as const);
const CURRENT_NONCLAIM_KEYS = objectFreeze([
  "authorization_mac",
  "checkpoint",
  "checkpoint_key_capability",
  "connector_execution",
  "control_plane_approval",
  "dataset_read",
  "key_created_or_written",
  "key_material_disclosed",
  "key_path_disclosed",
  "live_evaluation_activation",
  "playing_strength",
  "record_persisted",
  "root_key_hash_disclosed",
  "run_authorization",
  "runtime",
  "stage_authorization",
  "teacher_label",
  "training",
  "weight",
] as const);

function rejected(error: unknown): Promise<never> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new NativeError("binding receipts require string properties");
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("binding receipts require data properties");
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

function exactFrozenRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    !objectIsFrozen(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError(`${label} is not a frozen plain record`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expectedKeys.length) {
    throw new NativeError(`${label} has unexpected fields`);
  }
  const output: Record<string, unknown> = objectCreate(null);
  for (const key of expectedKeys) {
    if (!objectHasOwn(descriptors, key)) {
      throw new NativeError(`${label} is missing a field`);
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      descriptor.configurable !== false ||
      descriptor.writable !== false
    ) {
      throw new NativeError(`${label} fields are not immutable data`);
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new NativeError(`${label} differs`);
}

function uid(value: unknown, label: string): number {
  if (typeof value !== "number" || !numberIsSafeInteger(value) || value < 0) {
    throw new NativeError(`${label} is invalid`);
  }
  return value;
}

function decimal(value: unknown, label: string): string {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    throw new NativeError(`${label} is invalid`);
  }
  return value;
}

function keyInstanceId(value: unknown, label: string): string {
  if (typeof value !== "string" || !KEY_INSTANCE_RE.test(value)) {
    throw new NativeError(`${label} is invalid`);
  }
  return value;
}

function recordBytes(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !numberIsSafeInteger(value) ||
    value < 2 ||
    value > FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES
  ) {
    throw new NativeError(`${label} is invalid`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new NativeError(`${label} is invalid`);
  }
  return value;
}

function captureExpectedBinding(
  value: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
): Readonly<FloodgateV7ApprovedKeyExpectedBinding> {
  const expected = exactFrozenRecord(
    value,
    ["keyInstanceId", "recordBytes", "recordSha256"],
    "private expected binding",
  );
  return frozenRecord({
    recordBytes: recordBytes(expected.recordBytes, "expected record bytes"),
    recordSha256: sha256(expected.recordSha256, "expected record digest"),
    keyInstanceId: keyInstanceId(
      expected.keyInstanceId,
      "expected key instance",
    ),
  });
}

function captureDependencies(
  value: FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests,
): CapturedDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("binding dependencies are not plain");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const hasInspector = objectHasOwn(descriptors, "inspectCurrentKeyForTests");
  const expectedKeys = hasInspector
    ? ["effectiveUserId", "homeDirectory", "inspectCurrentKeyForTests"]
    : ["effectiveUserId", "homeDirectory"];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    throw new NativeError("binding dependencies have unexpected fields");
  }
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("binding dependencies require data properties");
    }
  }
  const effectiveUserId = uid(
    descriptors.effectiveUserId?.value,
    "binding effective UID",
  );
  const homeDirectory = descriptors.homeDirectory?.value;
  if (
    typeof homeDirectory !== "string" ||
    homeDirectory.length === 0 ||
    homeDirectory.includes("\0") ||
    !pathIsAbsolute(homeDirectory) ||
    pathParse(homeDirectory).root === homeDirectory ||
    pathResolve(homeDirectory) !== homeDirectory
  ) {
    throw new NativeError("binding home is not canonical");
  }
  const inspectorValue = descriptors.inspectCurrentKeyForTests?.value;
  if (
    inspectorValue !== undefined &&
    (typeof inspectorValue !== "function" || nodeIsProxy(inspectorValue))
  ) {
    throw new NativeError("binding inspector seam is invalid");
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    inspectCurrentKey:
      (inspectorValue as TestCurrentKeyInspector | undefined) ??
      inspectFloodgateV7DeploymentKeyInstanceCoreForTests,
  });
}

function captureApprovedIdentity(
  claimValue: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>,
  expectedBoundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record"
    | "test-only-injected-current-euid-home-control-plane-record",
): Readonly<BindingIdentity> {
  const claim = exactFrozenRecord(
    claimValue,
    APPROVED_CLAIM_KEYS,
    "approved claim",
  );
  exact(claim.execution_boundary, expectedBoundary, "approved boundary");
  exact(claim.key_id, FLOODGATE_V7_DEPLOYMENT_KEY_ID, "approved key kind");
  const deployment = exactFrozenRecord(
    claim.deployment_identity,
    APPROVED_DEPLOYMENT_KEYS,
    "approved deployment",
  );
  exact(
    deployment.layout,
    "fixed-current-euid-userinfo-home-v1",
    "approved layout",
  );
  const approval = exactFrozenRecord(
    claim.approval,
    ["approval_id", "approved_at_utc", "method"],
    "approved metadata",
  );
  exact(
    approval.method,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
    "approval method",
  );
  exactFrozenRecord(claim.record, ["bytes", "sha256"], "approved record");
  exactFrozenRecord(
    claim.candidate_receipt,
    ["bytes", "sha256"],
    "approved candidate receipt",
  );
  return frozenRecord({
    layout: "fixed-current-euid-userinfo-home-v1" as const,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    ownerUid: uid(deployment.owner_uid, "approved owner"),
    parentDev: decimal(deployment.parent_dev, "approved parent device"),
    parentIno: decimal(deployment.parent_ino, "approved parent inode"),
    keyDev: decimal(deployment.key_dev, "approved key device"),
    keyIno: decimal(deployment.key_ino, "approved key inode"),
    keyInstanceId: keyInstanceId(
      claim.key_instance_id,
      "approved key instance",
    ),
  });
}

function captureApprovedExpectedSnapshot(
  claimValue: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>,
  expectedBoundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record"
    | "test-only-injected-current-euid-home-control-plane-record",
): Readonly<ApprovedExpectedSnapshot> {
  const identity = captureApprovedIdentity(claimValue, expectedBoundary);
  const claim = exactFrozenRecord(
    claimValue,
    APPROVED_CLAIM_KEYS,
    "approved claim",
  );
  const record = exactFrozenRecord(
    claim.record,
    ["bytes", "sha256"],
    "approved record",
  );
  return frozenRecord({
    identity,
    expected: frozenRecord({
      recordBytes: recordBytes(record.bytes, "approved record bytes"),
      recordSha256: sha256(record.sha256, "approved record digest"),
      keyInstanceId: identity.keyInstanceId,
    }),
  });
}

function captureCurrentIdentity(
  receiptValue: Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>,
  expectedBoundary:
    | "production-fixed-current-euid-userinfo-home-key-instance-inspection"
    | "test-only-injected-current-euid-home-key-instance-inspection",
): Readonly<BindingIdentity> {
  const receipt = exactFrozenRecord(
    receiptValue,
    CURRENT_RECEIPT_KEYS,
    "current key receipt",
  );
  exact(
    receipt.contract,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    "current receipt contract",
  );
  exact(
    receipt.status,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    "current receipt status",
  );
  exact(
    receipt.claim_boundary,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    "current receipt boundary",
  );
  exact(
    receipt.trust_boundary,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    "current receipt trust boundary",
  );
  exact(receipt.execution_boundary, expectedBoundary, "current execution");
  exact(
    receipt.algorithm,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    "current receipt algorithm",
  );
  const deployment = exactFrozenRecord(
    receipt.key_deployment,
    CURRENT_DEPLOYMENT_KEYS,
    "current deployment",
  );
  exact(
    deployment.layout,
    "fixed-current-euid-userinfo-home-v1",
    "current layout",
  );
  exact(deployment.key_id, FLOODGATE_V7_DEPLOYMENT_KEY_ID, "current key kind");
  exact(deployment.parent_mode, "0700", "current parent mode");
  exact(deployment.key_mode, "0600", "current key mode");
  exact(deployment.key_bytes, 32, "current key bytes");
  exact(deployment.key_nlink, 1, "current key link count");
  exact(
    deployment.key_instance_algorithm,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
    "current key algorithm",
  );
  exact(
    deployment.held_descriptors_revalidated,
    true,
    "current held revalidation",
  );
  const parent = exactFrozenRecord(
    deployment.parent_identity,
    IDENTITY_KEYS,
    "current parent",
  );
  const key = exactFrozenRecord(
    deployment.key_identity,
    IDENTITY_KEYS,
    "current key",
  );
  const nonclaims = exactFrozenRecord(
    receipt.nonclaims,
    CURRENT_NONCLAIM_KEYS,
    "current nonclaims",
  );
  for (const name of CURRENT_NONCLAIM_KEYS) {
    exact(nonclaims[name], false, `current nonclaim ${name}`);
  }
  if (
    expectedBoundary ===
    "production-fixed-current-euid-userinfo-home-key-instance-inspection"
  ) {
    exact(receipt.test_boundary, null, "production test boundary");
  } else {
    const testBoundary = exactFrozenRecord(
      receipt.test_boundary,
      TEST_BOUNDARY_KEYS,
      "current test boundary",
    );
    exact(testBoundary.production_home_origin, false, "test home origin");
    exact(
      testBoundary.production_home_alias_rejected,
      true,
      "test home alias guard",
    );
    exact(testBoundary.current_effective_uid_required, true, "test UID guard");
    exact(
      testBoundary.test_hook_may_observe_key_copy,
      true,
      "test observer boundary",
    );
  }
  return frozenRecord({
    layout: "fixed-current-euid-userinfo-home-v1" as const,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    ownerUid: uid(deployment.owner_uid, "current owner"),
    parentDev: decimal(parent.dev, "current parent device"),
    parentIno: decimal(parent.ino, "current parent inode"),
    keyDev: decimal(key.dev, "current key device"),
    keyIno: decimal(key.ino, "current key inode"),
    keyInstanceId: keyInstanceId(
      deployment.key_instance_id,
      "current key instance",
    ),
  });
}

function sameBinding(
  approved: Readonly<BindingIdentity>,
  current: Readonly<BindingIdentity>,
): boolean {
  return (
    approved.layout === current.layout &&
    approved.keyId === current.keyId &&
    approved.ownerUid === current.ownerUid &&
    approved.parentDev === current.parentDev &&
    approved.parentIno === current.parentIno &&
    approved.keyDev === current.keyDev &&
    approved.keyIno === current.keyIno &&
    approved.keyInstanceId === current.keyInstanceId
  );
}

function sameExpectedBinding(
  expected: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
  actual: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
): boolean {
  return (
    expected.recordBytes === actual.recordBytes &&
    expected.recordSha256 === actual.recordSha256 &&
    expected.keyInstanceId === actual.keyInstanceId
  );
}

function buildReceipt<
  TBoundary extends FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary,
>(
  boundary: TBoundary,
): Readonly<FloodgateV7ApprovedKeyCurrentBindingReceipt<TBoundary>> {
  return frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
    execution_boundary: boundary,
    algorithm: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
    verification: frozenRecord({
      approved_record_validated: true as const,
      current_key_freshly_inspected: true as const,
      exact_binding_match: true as const,
      held_descriptors_revalidated: true as const,
      memory_only: true as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: frozenRecord({
      single_use_capability_returned: false as const,
      approved_claim_returned: false as const,
      approval_created: false as const,
      record_created_or_written: false as const,
      key_created_or_written: false as const,
      run_authority: false as const,
      stage_authority: false as const,
      connector_authority: false as const,
      checkpoint_key_capability: false as const,
      checkpoint: false as const,
      runtime: false as const,
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

function buildExpectedReceipt<
  TBoundary extends FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary,
>(
  boundary: TBoundary,
): Readonly<FloodgateV7ApprovedKeyExpectedCurrentBindingReceipt<TBoundary>> {
  return frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS,
    claim_boundary:
      FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY,
    execution_boundary: boundary,
    algorithm: FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM,
    verification: frozenRecord({
      approved_record_reloaded_and_validated: true as const,
      current_key_freshly_inspected: true as const,
      approved_to_current_exact_binding_match: true as const,
      reloaded_approved_to_private_expected_exact_match: true as const,
      held_descriptors_revalidated: true as const,
      memory_only: true as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: frozenRecord({
      expected_binding_returned: false as const,
      approved_claim_returned: false as const,
      approval_created: false as const,
      record_created_or_written: false as const,
      key_created_or_written: false as const,
      run_authority: false as const,
      stage_authority: false as const,
      connector_authority: false as const,
      checkpoint_key_capability: false as const,
      checkpoint: false as const,
      runtime: false as const,
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

async function verifyInternal<
  TBoundary extends FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary,
>(
  boundary: TBoundary,
  approvedBoundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record"
    | "test-only-injected-current-euid-home-control-plane-record",
  currentBoundary:
    | "production-fixed-current-euid-userinfo-home-key-instance-inspection"
    | "test-only-injected-current-euid-home-key-instance-inspection",
  loadApproved: () => Promise<
    Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>
  >,
  claimApproved: (
    capability: FloodgateV7ApprovedKeyEnrollmentCapability,
  ) => Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>,
  inspectCurrent: () => Promise<
    Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>
  >,
): Promise<Readonly<FloodgateV7ApprovedKeyCurrentBindingReceipt<TBoundary>>> {
  let capability: Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>;
  try {
    capability = await loadApproved();
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError("approved-record-load");
  }

  let currentReceipt: Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>;
  try {
    currentReceipt = await inspectCurrent();
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError(
      "current-key-inspection",
    );
  }

  // This diagnostic consumes only the capability it loaded itself. Neither
  // that capability nor its sensitive claim is returned to a later stage.
  let approvedClaim: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
  try {
    approvedClaim = claimApproved(capability);
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError(
      "approved-record-claim",
    );
  }

  try {
    const approved = captureApprovedIdentity(approvedClaim, approvedBoundary);
    const current = captureCurrentIdentity(currentReceipt, currentBoundary);
    if (!sameBinding(approved, current)) {
      throw new NativeError("approved and current binding differ");
    }
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError("comparison");
  }

  try {
    return buildReceipt(boundary);
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError("receipt");
  }
}

async function verifyExpectedInternal<
  TBoundary extends FloodgateV7ApprovedKeyCurrentBindingExecutionBoundary,
>(
  expectedValue: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
  boundary: TBoundary,
  approvedBoundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record"
    | "test-only-injected-current-euid-home-control-plane-record",
  currentBoundary:
    | "production-fixed-current-euid-userinfo-home-key-instance-inspection"
    | "test-only-injected-current-euid-home-key-instance-inspection",
  loadApproved: () => Promise<
    Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>
  >,
  claimApproved: (
    capability: FloodgateV7ApprovedKeyEnrollmentCapability,
  ) => Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>,
  inspectCurrent: () => Promise<
    Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>
  >,
): Promise<
  Readonly<FloodgateV7ApprovedKeyExpectedCurrentBindingReceipt<TBoundary>>
> {
  let expected: Readonly<FloodgateV7ApprovedKeyExpectedBinding>;
  try {
    expected = captureExpectedBinding(expectedValue);
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError("expected-binding");
  }

  let capability: Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>;
  try {
    capability = await loadApproved();
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError("approved-record-load");
  }

  let currentReceipt: Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>;
  try {
    currentReceipt = await inspectCurrent();
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError(
      "current-key-inspection",
    );
  }

  let approvedClaim: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
  try {
    approvedClaim = claimApproved(capability);
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError(
      "approved-record-claim",
    );
  }

  try {
    const approved = captureApprovedExpectedSnapshot(
      approvedClaim,
      approvedBoundary,
    );
    const current = captureCurrentIdentity(currentReceipt, currentBoundary);
    if (!sameBinding(approved.identity, current)) {
      throw new NativeError("reloaded approved and current binding differ");
    }
    if (!sameExpectedBinding(expected, approved.expected)) {
      throw new NativeError("reloaded approved and private expected differ");
    }
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError("expected-binding");
  }

  try {
    return buildExpectedReceipt(boundary);
  } catch {
    throw new FloodgateV7ApprovedKeyCurrentBindingError("receipt");
  }
}

/** Test-only injected-home verifier with an optional test inspector seam. */
export function verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests(
  dependenciesValue: FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7ApprovedKeyCurrentBindingReceipt<"test-only-injected-current-euid-home-approved-record-current-key-binding">
  >
> {
  if (arguments.length !== 1) {
    return rejected(new FloodgateV7ApprovedKeyCurrentBindingError("capture"));
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(new FloodgateV7ApprovedKeyCurrentBindingError("capture"));
  }
  const sharedDependencies = frozenRecord({
    effectiveUserId: dependencies.effectiveUserId,
    homeDirectory: dependencies.homeDirectory,
  });
  return verifyInternal(
    "test-only-injected-current-euid-home-approved-record-current-key-binding",
    "test-only-injected-current-euid-home-control-plane-record",
    "test-only-injected-current-euid-home-key-instance-inspection",
    () => loadFloodgateV7ApprovedKeyEnrollmentCoreForTests(sharedDependencies),
    claimFloodgateV7ApprovedKeyEnrollmentCoreForTests,
    () =>
      reflectApply(dependencies.inspectCurrentKey, undefined, [
        sharedDependencies,
      ]),
  );
}

/** Zero-argument production verifier for the fixed current-user namespaces. */
export function verifyFloodgateV7ApprovedKeyCurrentBinding(): Promise<
  Readonly<
    FloodgateV7ApprovedKeyCurrentBindingReceipt<"production-fixed-current-euid-userinfo-home-approved-record-current-key-binding">
  >
> {
  if (arguments.length !== 0) {
    return rejected(new FloodgateV7ApprovedKeyCurrentBindingError("capture"));
  }
  return verifyInternal(
    "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding",
    "production-fixed-current-euid-userinfo-home-control-plane-record",
    "production-fixed-current-euid-userinfo-home-key-instance-inspection",
    loadFloodgateV7ApprovedKeyEnrollment,
    claimFloodgateV7ApprovedKeyEnrollment,
    inspectFloodgateV7DeploymentKeyInstance,
  );
}

/** Test-only expected-binding verifier for preflight composition. */
export function verifyFloodgateV7ApprovedKeyCurrentBindingAgainstExpectedCoreForTests(
  expectedValue: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
  dependenciesValue: FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7ApprovedKeyExpectedCurrentBindingReceipt<"test-only-injected-current-euid-home-approved-record-current-key-binding">
  >
> {
  if (arguments.length !== 2) {
    return rejected(new FloodgateV7ApprovedKeyCurrentBindingError("capture"));
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(new FloodgateV7ApprovedKeyCurrentBindingError("capture"));
  }
  const sharedDependencies = frozenRecord({
    effectiveUserId: dependencies.effectiveUserId,
    homeDirectory: dependencies.homeDirectory,
  });
  return verifyExpectedInternal(
    expectedValue,
    "test-only-injected-current-euid-home-approved-record-current-key-binding",
    "test-only-injected-current-euid-home-control-plane-record",
    "test-only-injected-current-euid-home-key-instance-inspection",
    () => loadFloodgateV7ApprovedKeyEnrollmentCoreForTests(sharedDependencies),
    claimFloodgateV7ApprovedKeyEnrollmentCoreForTests,
    () =>
      reflectApply(dependencies.inspectCurrentKey, undefined, [
        sharedDependencies,
      ]),
  );
}

/**
 * Production preflight verifier. The private expected binding is compared to
 * a fresh approved-record reload and is never included in the receipt.
 */
export function verifyFloodgateV7ApprovedKeyCurrentBindingAgainstExpected(
  expectedValue: Readonly<FloodgateV7ApprovedKeyExpectedBinding>,
): Promise<
  Readonly<
    FloodgateV7ApprovedKeyExpectedCurrentBindingReceipt<"production-fixed-current-euid-userinfo-home-approved-record-current-key-binding">
  >
> {
  if (arguments.length !== 1) {
    return rejected(new FloodgateV7ApprovedKeyCurrentBindingError("capture"));
  }
  return verifyExpectedInternal(
    expectedValue,
    "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding",
    "production-fixed-current-euid-userinfo-home-control-plane-record",
    "production-fixed-current-euid-userinfo-home-key-instance-inspection",
    loadFloodgateV7ApprovedKeyEnrollment,
    claimFloodgateV7ApprovedKeyEnrollment,
    inspectFloodgateV7DeploymentKeyInstance,
  );
}
