/**
 * Memory-only production boundary for separately reviewing one exact
 * deployment-key candidate in a private native UI and installing its approved
 * record create-only. Public receipts and errors never contain stable IDs,
 * digests, filesystem identities, paths, or approval metadata.
 */

import { Buffer } from "node:buffer";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  claimFloodgateV7ApprovedKeyEnrollment,
  loadFloodgateV7ApprovedKeyEnrollment,
  serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
  type FloodgateV7ApprovedKeyEnrollmentInstallationInput,
} from "./floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_STATUS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_TRUST_BOUNDARY,
  FloodgateV7ApprovedKeyEnrollmentInstallerError,
  installFloodgateV7ApprovedKeyEnrollment,
  type FloodgateV7ApprovedKeyEnrollmentInstallerDurability,
  type FloodgateV7ApprovedKeyEnrollmentInstallerPhase,
  type FloodgateV7ApprovedKeyEnrollmentInstallerReceipt,
  type FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition,
} from "./floodgate-v7-approved-key-enrollment-installer";
import {
  inspectFloodgateV7DeploymentKeyInstance,
  type FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt,
} from "./floodgate-v7-deployment-key-instance-enrollment";
import {
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT,
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
  reviewFloodgateV7PrivateHumanKeyCandidate,
  type FloodgateV7PrivateHumanKeyReviewRequest,
  type FloodgateV7PrivateHumanKeyReviewResponse,
} from "./floodgate-v7-private-human-key-review-ui";
import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
  verifyFloodgateV7ApprovedKeyCurrentBinding,
  type FloodgateV7ApprovedKeyCurrentBindingReceipt,
} from "./floodgate-v7-approved-key-current-binding";

export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CONTRACT =
  "shogi-floodgate-v7-private-human-key-enrollment-orchestrator-v1" as const;
export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_STATUS =
  "private-human-reviewed-candidate-create-only-installed-postflight-and-current-binding-validated" as const;
export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CLAIM_BOUNDARY =
  "one-private-native-human-review-exact-candidate-digest-typeback-fresh-reinspection-create-only-installation-record-postflight-and-current-key-binding-with-postflight-fail-closed-but-without-atomic-key-record-commit-run-stage-checkpoint-training-live-or-strength-authority" as const;
export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_TRUST_BOUNDARY =
  "trusted-current-euid-fixed-production-key-and-control-plane-namespaces-supported-key-writers-create-only-no-clobber-no-concurrent-out-of-band-key-rotation-private-native-human-ui-node-crypto-existing-inspector-installer-loader-binding-preflight-and-current-js-realm-intrinsics-v1" as const;

export type FloodgateV7PrivateHumanKeyEnrollmentOrchestratorExecutionBoundary =
  | "production-fixed-current-euid-private-human-key-enrollment-orchestration"
  | "test-only-injected-private-human-key-enrollment-orchestration";

export type FloodgateV7PrivateHumanKeyEnrollmentOrchestratorPhase =
  | "capture"
  | "existing-record-check"
  | "candidate-inspection"
  | "private-human-review"
  | "approval-generation"
  | "candidate-reinspection"
  | "installation"
  | "record-postflight"
  | "current-binding-postflight";

export type FloodgateV7PrivateHumanKeyEnrollmentOrchestratorRetryDisposition =
  | "safe-to-restart-with-a-fresh-private-review"
  | "do-not-retry-existing-record"
  | "do-not-retry-installation-may-have-committed"
  | "manual-reconciliation-required";

export type FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDurability =
  | "no-approved-record-change-established"
  | FloodgateV7ApprovedKeyEnrollmentInstallerDurability;

export interface FloodgateV7PrivateHumanKeyEnrollmentOrchestratorReceipt<
  TBoundary extends
    FloodgateV7PrivateHumanKeyEnrollmentOrchestratorExecutionBoundary = FloodgateV7PrivateHumanKeyEnrollmentOrchestratorExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_TRUST_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly review: Readonly<{
    readonly private_native_ui: boolean;
    readonly exact_candidate_json_and_terminal_lf_reviewed: true;
    readonly full_candidate_sha256_typed_back: true;
    readonly candidate_reinspected_after_review: true;
  }>;
  readonly record: Readonly<{
    readonly create_only_installer_succeeded: true;
    readonly expected_record_postflight_validated: true;
    readonly fresh_current_key_binding_validated: true;
    readonly atomic_key_and_record_commit: false;
    readonly supported_key_writers_create_only_no_clobber: true;
    readonly concurrent_out_of_band_key_rotation_excluded: true;
    readonly postflight_mismatch_requires_manual_reconciliation: true;
  }>;
  readonly test_boundary: Readonly<{
    readonly production_dependencies: boolean;
    readonly private_ui_may_be_test_injected: boolean;
    readonly entropy_and_clock_may_be_test_injected: boolean;
  }>;
  readonly nonclaims: Readonly<{
    readonly candidate_json_disclosed: false;
    readonly candidate_digest_disclosed: false;
    readonly key_instance_id_disclosed: false;
    readonly approval_id_disclosed: false;
    readonly approval_timestamp_disclosed: false;
    readonly owner_uid_disclosed: false;
    readonly filesystem_identity_disclosed: false;
    readonly path_disclosed: false;
    readonly key_material_disclosed: false;
    readonly run_authorization: false;
    readonly stage_authorization: false;
    readonly checkpoint: false;
    readonly connector_execution: false;
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

export interface FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDependenciesForTests {
  readonly hasValidExistingApprovedRecord: () => Promise<boolean>;
  readonly inspectCandidate: () => Promise<
    Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>
  >;
  readonly reviewCandidate: (
    request: Readonly<FloodgateV7PrivateHumanKeyReviewRequest>,
  ) => Promise<Readonly<FloodgateV7PrivateHumanKeyReviewResponse>>;
  readonly nowIsoUtc: () => string;
  readonly randomApprovalBytes: () => Uint8Array;
  readonly installApprovedRecord: (
    input: Readonly<FloodgateV7ApprovedKeyEnrollmentInstallationInput>,
  ) => Promise<Readonly<FloodgateV7ApprovedKeyEnrollmentInstallerReceipt>>;
  readonly loadAndClaimApprovedRecord: () => Promise<
    Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>
  >;
  readonly verifyCurrentBinding: () => Promise<
    Readonly<FloodgateV7ApprovedKeyCurrentBindingReceipt>
  >;
}

export interface FloodgateV7ApprovedKeyVerifiedAbsenceDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly beforeMissingPathRevalidationForTests?: () => void;
}

export class FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError extends Error {
  readonly phase!: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorPhase;
  readonly durability!: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDurability;
  readonly approved_record_may_have_been_created!: boolean;
  readonly retry_disposition!: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorRetryDisposition;
  readonly installer_phase!: FloodgateV7ApprovedKeyEnrollmentInstallerPhase | null;
  readonly installer_retry_disposition!: FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition | null;

  constructor(
    phase: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorPhase,
    durability: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDurability,
    mayHaveCreated: boolean,
    retryDisposition: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorRetryDisposition,
    installerPhase: FloodgateV7ApprovedKeyEnrollmentInstallerPhase | null = null,
    installerRetryDisposition: FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition | null = null,
  ) {
    super(
      "Floodgate v7 private human key enrollment orchestration failed; inspect sanitized reconciliation metadata",
    );
    objectDefineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: "FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError",
    });
    objectDefineProperty(this, "phase", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: phase,
    });
    objectDefineProperty(this, "durability", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: durability,
    });
    objectDefineProperty(this, "approved_record_may_have_been_created", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: mayHaveCreated,
    });
    objectDefineProperty(this, "retry_disposition", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: retryDisposition,
    });
    objectDefineProperty(this, "installer_phase", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: installerPhase,
    });
    objectDefineProperty(this, "installer_retry_disposition", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: installerRetryDisposition,
    });
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError: private human enrollment orchestration failed",
    });
    objectFreeze(this);
  }
}

type CapturedDependencies =
  Readonly<FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDependenciesForTests>;
type CandidateCapture = Readonly<{
  canonicalJson: string;
  sha256: string;
  bytes: number;
  ownerUid: number;
  deployment: Readonly<{
    layout: "fixed-current-euid-userinfo-home-v1";
    keyId: string;
    keyInstanceId: string;
    parentDev: string;
    parentIno: string;
    keyDev: string;
    keyIno: string;
  }>;
}>;
type VerifiedAbsenceDependencies = Readonly<{
  effectiveUserId: number;
  homeDirectory: string;
  beforeMissingPathRevalidation: (() => void) | undefined;
}>;
type HeldAbsenceDirectory = Readonly<{
  filePath: string;
  descriptor: number;
  snapshot: fs.BigIntStats;
  managed: boolean;
}>;

const MAX_CANDIDATE_BYTES = 65_536;
const DUMMY_APPROVAL_ID = "00".repeat(32);
const DUMMY_APPROVED_AT_UTC = "1970-01-01T00:00:00.000Z";
const HEX_64_RE = /^[0-9a-f]{64}$/u;
const UTC_MILLISECONDS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const NativeDate = Date;
const NativeError = Error;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIsFrozen = Object.isFrozen;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const jsonStringify = JSON.stringify.bind(JSON);
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const dateParse = Date.parse.bind(Date);
const dateToISOString = Date.prototype.toISOString;
const bufferFrom = Buffer.from.bind(Buffer);
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const uint8ArrayFill = Uint8Array.prototype.fill;
const arrayIncludes = Array.prototype.includes;
const capturedCreateHash = createHash;
const capturedTimingSafeEqual = timingSafeEqual;
const capturedRandomBytes = randomBytes;
const capturedLstatSync = fs.lstatSync;
const capturedFstatSync = fs.fstatSync;
const capturedOpenSync = fs.openSync;
const capturedCloseSync = fs.closeSync;
const capturedRealpathSync = fs.realpathSync;
const capturedUserInfo = os.userInfo;
const capturedGetEffectiveUserId = process.geteuid?.bind(process) ?? null;
const pathJoin = path.join.bind(path);
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathParse = path.parse.bind(path);
const pathResolve = path.resolve.bind(path);
const NativeBigInt = BigInt;
const TYPE_MASK = NativeBigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = NativeBigInt(fs.constants.S_IFDIR);
const MODE_MASK = NativeBigInt(0o7777);
const HOME_OWNER_MODE = NativeBigInt(0o700);
const HOME_FORBIDDEN_MODE = NativeBigInt(0o7022);
const MANAGED_DIRECTORY_MODE = NativeBigInt(0o700);
const DIRECTORY_OPEN_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const DEPENDENCY_KEYS = objectFreeze([
  "hasValidExistingApprovedRecord",
  "inspectCandidate",
  "reviewCandidate",
  "nowIsoUtc",
  "randomApprovalBytes",
  "installApprovedRecord",
  "loadAndClaimApprovedRecord",
  "verifyCurrentBinding",
] as const);
const INSTALLER_PHASES = objectFreeze([
  "capture",
  "production-identity",
  "record-validation",
  "namespace",
  "staging-create",
  "staging-write",
  "staging-file-sync",
  "commit",
  "commit-directory-sync",
  "staging-removal",
  "cleanup-directory-sync",
  "revalidation",
  "cleanup",
] as const satisfies readonly FloodgateV7ApprovedKeyEnrollmentInstallerPhase[]);
const INSTALLER_DURABILITIES = objectFreeze([
  "no-installation-change-established",
  "managed-prefix-may-exist-record-absent",
  "managed-prefix-may-exist-existing-record-not-adopted",
  "parent-chain-durable-record-absent",
  "staging-may-exist",
  "staging-file-synced-final-absent",
  "final-link-may-exist",
  "final-link-directory-synced",
  "record-published-and-staging-removal-durable",
] as const satisfies readonly FloodgateV7ApprovedKeyEnrollmentInstallerDurability[]);
const INSTALLER_RETRY_DISPOSITIONS = objectFreeze([
  "safe-to-retry-after-not-installed",
  "do-not-retry-existing-record",
  "manual-reconciliation-required",
] as const satisfies readonly FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition[]);

function rejected<T>(error: unknown): Promise<T> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("orchestrator records require data properties");
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

function zeroize(value: Uint8Array): void {
  reflectApply(uint8ArrayFill, value, [0]);
}

function safeDataRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError(`${label} is not a plain record`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(value)) {
    if (typeof key !== "string") {
      throw new NativeError(`${label} has a symbol key`);
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(`${label} is not plain data`);
    }
  }
  return value as Record<string, unknown>;
}

function assertPlainDataGraph(
  value: unknown,
  seen: Set<object>,
  depth: number,
): void {
  if (depth > 12) throw new NativeError("candidate data is too deep");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!numberIsFinite(value))
      throw new NativeError("candidate number differs");
    return;
  }
  const record = safeDataRecord(value, "candidate data");
  if (seen.has(record)) throw new NativeError("candidate data is cyclic");
  seen.add(record);
  const descriptors = objectGetOwnPropertyDescriptors(record);
  for (const key of objectKeys(descriptors)) {
    assertPlainDataGraph(descriptors[key]?.value, seen, depth + 1);
  }
  seen.delete(record);
}

function exactCanonicalData(value: unknown, expected: object): void {
  assertPlainDataGraph(value, new Set<object>(), 0);
  if (jsonStringify(value) !== jsonStringify(expected)) {
    throw new NativeError("postflight receipt differs");
  }
}

function validateInstallationReceipt(
  value: Readonly<FloodgateV7ApprovedKeyEnrollmentInstallerReceipt>,
  boundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record-installation"
    | "test-only-injected-current-euid-home-control-plane-record-installation",
): void {
  const production =
    boundary ===
    "production-fixed-current-euid-userinfo-home-control-plane-record-installation";
  exactCanonicalData(value, {
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_STATUS,
    claim_boundary:
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_TRUST_BOUNDARY,
    execution_boundary: boundary,
    algorithm: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_ALGORITHM,
    record: {
      record_mode: "0600",
      record_nlink: 1,
      publication:
        "staged-record-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1",
      durability: "record-published-and-staging-removal-durable",
      held_descriptors_revalidated: true,
    },
    approval_binding: {
      candidate_canonical_json_validated: true,
      candidate_sha256_exactly_matched: true,
      candidate_bytes_recomputed: true,
    },
    test_boundary: {
      production_home_origin: production,
      production_effective_uid_origin: production,
      failure_hooks_may_be_test_injected: !production,
    },
    nonclaims: {
      approval_generated: false,
      approval_id_disclosed: false,
      candidate_digest_disclosed: false,
      candidate_json_disclosed: false,
      key_instance_id_disclosed: false,
      owner_uid_disclosed: false,
      filesystem_identity_disclosed: false,
      record_path_disclosed: false,
      capability_issued: false,
      run_authorization: false,
      gate_authorization: false,
      checkpoint: false,
      runtime: false,
      training: false,
      live_evaluation_activation: false,
      playing_strength: false,
    },
  });
}

function validateBindingReceipt(
  value: Readonly<FloodgateV7ApprovedKeyCurrentBindingReceipt>,
  boundary:
    | "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding"
    | "test-only-injected-current-euid-home-approved-record-current-key-binding",
): void {
  exactCanonicalData(value, {
    contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
    execution_boundary: boundary,
    algorithm: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
    verification: {
      approved_record_validated: true,
      current_key_freshly_inspected: true,
      exact_binding_match: true,
      held_descriptors_revalidated: true,
      memory_only: true,
      sensitive_values_exported: false,
    },
    nonclaims: {
      single_use_capability_returned: false,
      approved_claim_returned: false,
      approval_created: false,
      record_created_or_written: false,
      key_created_or_written: false,
      run_authority: false,
      stage_authority: false,
      connector_authority: false,
      checkpoint_key_capability: false,
      checkpoint: false,
      runtime: false,
      dataset_read: false,
      teacher_label: false,
      training: false,
      weight: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
    },
  });
}

type CapturedInstallerFailure = Readonly<{
  phase: FloodgateV7ApprovedKeyEnrollmentInstallerPhase;
  durability: FloodgateV7ApprovedKeyEnrollmentInstallerDurability;
  mayHaveCommitted: boolean;
  retryDisposition: FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition;
}>;

function allowedString<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return (
    typeof value === "string" &&
    (reflectApply(arrayIncludes, allowed, [value]) as boolean)
  );
}

function captureInstallerFailure(
  value: unknown,
): CapturedInstallerFailure | null {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !==
      FloodgateV7ApprovedKeyEnrollmentInstallerError.prototype ||
    !objectIsFrozen(value)
  ) {
    return null;
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const phase = descriptors.phase?.value;
  const durability = descriptors.durability?.value;
  const mayHaveCommitted = descriptors.may_have_committed?.value;
  const retryDisposition = descriptors.retry_disposition?.value;
  if (
    descriptors.phase === undefined ||
    !("value" in descriptors.phase) ||
    descriptors.durability === undefined ||
    !("value" in descriptors.durability) ||
    descriptors.may_have_committed === undefined ||
    !("value" in descriptors.may_have_committed) ||
    descriptors.retry_disposition === undefined ||
    !("value" in descriptors.retry_disposition) ||
    !allowedString(phase, INSTALLER_PHASES) ||
    !allowedString(durability, INSTALLER_DURABILITIES) ||
    typeof mayHaveCommitted !== "boolean" ||
    !allowedString(retryDisposition, INSTALLER_RETRY_DISPOSITIONS)
  ) {
    return null;
  }
  return frozenRecord({
    phase,
    durability,
    mayHaveCommitted,
    retryDisposition,
  });
}

function sha256Utf8(value: string): string {
  return capturedCreateHash("sha256").update(value, "utf8").digest("hex");
}

function exactOwnerUid(
  receipt: Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>,
): number {
  const outer = safeDataRecord(receipt, "candidate receipt");
  const deployment = safeDataRecord(
    objectGetOwnPropertyDescriptors(outer).key_deployment?.value,
    "candidate deployment",
  );
  const uid = objectGetOwnPropertyDescriptors(deployment).owner_uid?.value;
  if (typeof uid !== "number" || !numberIsSafeInteger(uid) || uid < 0) {
    throw new NativeError("candidate owner UID differs");
  }
  return uid;
}

function captureCandidate(
  receipt: Readonly<FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt>,
  recordBoundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record"
    | "test-only-injected-current-euid-home-control-plane-record",
): CandidateCapture {
  assertPlainDataGraph(receipt, new Set<object>(), 0);
  const canonicalJson = `${jsonStringify(receipt)}\n`;
  const bytes = bufferByteLength(canonicalJson, "utf8");
  if (
    bytes < 2 ||
    bytes > MAX_CANDIDATE_BYTES ||
    canonicalJson.includes("\r")
  ) {
    throw new NativeError("candidate canonical bytes differ");
  }
  const sha256 = sha256Utf8(canonicalJson);
  const ownerUid = exactOwnerUid(receipt);

  // Reuse the loader grammar before showing anything to the human. This pure
  // serializer performs no filesystem write and issues no capability.
  serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore(
    {
      approval_id: DUMMY_APPROVAL_ID,
      approved_at_utc: DUMMY_APPROVED_AT_UTC,
      approved_candidate_sha256: sha256,
      candidate_canonical_json: canonicalJson,
    },
    ownerUid,
    recordBoundary,
  );
  const deployment = receipt.key_deployment;
  return frozenRecord({
    canonicalJson,
    sha256,
    bytes,
    ownerUid,
    deployment: frozenRecord({
      layout: deployment.layout,
      keyId: deployment.key_id,
      keyInstanceId: deployment.key_instance_id,
      parentDev: deployment.parent_identity.dev,
      parentIno: deployment.parent_identity.ino,
      keyDev: deployment.key_identity.dev,
      keyIno: deployment.key_identity.ino,
    }),
  });
}

function exactBytesEqual(left: string, right: string): boolean {
  const leftBytes = bufferFrom(left, "utf8");
  const rightBytes = bufferFrom(right, "utf8");
  try {
    return (
      leftBytes.byteLength === rightBytes.byteLength &&
      capturedTimingSafeEqual(leftBytes, rightBytes)
    );
  } finally {
    zeroize(leftBytes);
    zeroize(rightBytes);
  }
}

function validateReviewResponse(
  value: Readonly<FloodgateV7PrivateHumanKeyReviewResponse>,
  expectedSha256: string,
): void {
  const response = safeDataRecord(value, "private review response");
  const keys = objectKeys(objectGetOwnPropertyDescriptors(response));
  if (
    keys.length !== 3 ||
    keys[0] !== "contract" ||
    keys[1] !== "decision" ||
    keys[2] !== "typed_candidate_sha256" ||
    response.contract !==
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT
  ) {
    throw new NativeError("private review response differs");
  }
  if (response.decision === "cancel") {
    if (response.typed_candidate_sha256 !== null) {
      throw new NativeError("cancel response differs");
    }
    throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
      "private-human-review",
      "no-approved-record-change-established",
      false,
      "safe-to-restart-with-a-fresh-private-review",
    );
  }
  if (
    response.decision !== "approve" ||
    typeof response.typed_candidate_sha256 !== "string" ||
    !HEX_64_RE.test(response.typed_candidate_sha256)
  ) {
    throw new NativeError("approval response differs");
  }
  const typedBytes = bufferFrom(response.typed_candidate_sha256, "ascii");
  const expectedBytes = bufferFrom(expectedSha256, "ascii");
  try {
    if (!capturedTimingSafeEqual(typedBytes, expectedBytes)) {
      throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
        "private-human-review",
        "no-approved-record-change-established",
        false,
        "safe-to-restart-with-a-fresh-private-review",
      );
    }
  } finally {
    zeroize(typedBytes);
    zeroize(expectedBytes);
  }
}

function validateApprovalTimestamp(value: string): string {
  if (
    typeof value !== "string" ||
    !UTC_MILLISECONDS_RE.test(value) ||
    Number.isNaN(dateParse(value)) ||
    reflectApply(dateToISOString, new NativeDate(value), []) !== value
  ) {
    throw new NativeError("approval timestamp differs");
  }
  return value;
}

function approvalIdFromEntropy(value: Uint8Array): string {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    !(value instanceof Uint8Array) ||
    value.byteLength !== 32
  ) {
    throw new NativeError("approval entropy differs");
  }
  let copy: Buffer | null = null;
  try {
    copy = bufferFrom(value);
    return copy.toString("hex");
  } finally {
    if (copy !== null) zeroize(copy);
    zeroize(value);
  }
}

function compareExpectedClaim(
  claim: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>,
  candidate: CandidateCapture,
  approvalId: string,
  approvedAtUtc: string,
  recordBoundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record"
    | "test-only-injected-current-euid-home-control-plane-record",
): void {
  assertPlainDataGraph(claim, new Set<object>(), 0);
  const deployment = candidate.deployment;
  if (
    claim.execution_boundary !== recordBoundary ||
    claim.approval.method !==
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD ||
    claim.approval.approval_id !== approvalId ||
    claim.approval.approved_at_utc !== approvedAtUtc ||
    claim.candidate_receipt.bytes !== candidate.bytes ||
    claim.candidate_receipt.sha256 !== candidate.sha256 ||
    claim.key_id !== deployment.keyId ||
    claim.key_instance_id !== deployment.keyInstanceId ||
    claim.deployment_identity.layout !== deployment.layout ||
    claim.deployment_identity.owner_uid !== candidate.ownerUid ||
    claim.deployment_identity.parent_dev !== deployment.parentDev ||
    claim.deployment_identity.parent_ino !== deployment.parentIno ||
    claim.deployment_identity.key_dev !== deployment.keyDev ||
    claim.deployment_identity.key_ino !== deployment.keyIno
  ) {
    throw new NativeError("installed record differs from approved candidate");
  }
}

function captureDependencies(
  value: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDependenciesForTests,
): CapturedDependencies {
  const record = safeDataRecord(value, "orchestrator dependencies");
  const descriptors = objectGetOwnPropertyDescriptors(record);
  const keys = reflectOwnKeys(record);
  if (keys.length !== DEPENDENCY_KEYS.length) {
    throw new NativeError("orchestrator dependency count differs");
  }
  for (const key of DEPENDENCY_KEYS) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      typeof descriptor.value !== "function" ||
      nodeIsProxy(descriptor.value)
    ) {
      throw new NativeError("orchestrator dependency differs");
    }
  }
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      !DEPENDENCY_KEYS.includes(key as (typeof DEPENDENCY_KEYS)[number])
    ) {
      throw new NativeError("unknown orchestrator dependency");
    }
  }
  return frozenRecord({
    hasValidExistingApprovedRecord: descriptors.hasValidExistingApprovedRecord
      ?.value as () => Promise<boolean>,
    inspectCandidate: descriptors.inspectCandidate
      ?.value as CapturedDependencies["inspectCandidate"],
    reviewCandidate: descriptors.reviewCandidate
      ?.value as CapturedDependencies["reviewCandidate"],
    nowIsoUtc: descriptors.nowIsoUtc?.value as () => string,
    randomApprovalBytes: descriptors.randomApprovalBytes
      ?.value as () => Uint8Array,
    installApprovedRecord: descriptors.installApprovedRecord
      ?.value as CapturedDependencies["installApprovedRecord"],
    loadAndClaimApprovedRecord: descriptors.loadAndClaimApprovedRecord
      ?.value as CapturedDependencies["loadAndClaimApprovedRecord"],
    verifyCurrentBinding: descriptors.verifyCurrentBinding
      ?.value as CapturedDependencies["verifyCurrentBinding"],
  });
}

function buildReceipt<
  TBoundary extends
    FloodgateV7PrivateHumanKeyEnrollmentOrchestratorExecutionBoundary,
>(
  boundary: TBoundary,
): Readonly<
  FloodgateV7PrivateHumanKeyEnrollmentOrchestratorReceipt<TBoundary>
> {
  const production =
    boundary ===
    "production-fixed-current-euid-private-human-key-enrollment-orchestration";
  return frozenRecord({
    contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CONTRACT,
    status: FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_STATUS,
    claim_boundary:
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_TRUST_BOUNDARY,
    execution_boundary: boundary,
    review: frozenRecord({
      private_native_ui: production,
      exact_candidate_json_and_terminal_lf_reviewed: true as const,
      full_candidate_sha256_typed_back: true as const,
      candidate_reinspected_after_review: true as const,
    }),
    record: frozenRecord({
      create_only_installer_succeeded: true as const,
      expected_record_postflight_validated: true as const,
      fresh_current_key_binding_validated: true as const,
      atomic_key_and_record_commit: false as const,
      supported_key_writers_create_only_no_clobber: true as const,
      concurrent_out_of_band_key_rotation_excluded: true as const,
      postflight_mismatch_requires_manual_reconciliation: true as const,
    }),
    test_boundary: frozenRecord({
      production_dependencies: production,
      private_ui_may_be_test_injected: !production,
      entropy_and_clock_may_be_test_injected: !production,
    }),
    nonclaims: frozenRecord({
      candidate_json_disclosed: false as const,
      candidate_digest_disclosed: false as const,
      key_instance_id_disclosed: false as const,
      approval_id_disclosed: false as const,
      approval_timestamp_disclosed: false as const,
      owner_uid_disclosed: false as const,
      filesystem_identity_disclosed: false as const,
      path_disclosed: false as const,
      key_material_disclosed: false as const,
      run_authorization: false as const,
      stage_authorization: false as const,
      checkpoint: false as const,
      connector_execution: false as const,
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

function wrapPreinstallationFailure(
  phase: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorPhase,
  rawFailure: unknown,
): FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError {
  if (
    rawFailure instanceof FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError
  ) {
    return rawFailure;
  }
  return new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
    phase,
    "no-approved-record-change-established",
    false,
    "safe-to-restart-with-a-fresh-private-review",
  );
}

async function run<
  TBoundary extends
    FloodgateV7PrivateHumanKeyEnrollmentOrchestratorExecutionBoundary,
>(
  dependencies: CapturedDependencies,
  boundary: TBoundary,
  recordBoundary:
    | "production-fixed-current-euid-userinfo-home-control-plane-record"
    | "test-only-injected-current-euid-home-control-plane-record",
): Promise<
  Readonly<FloodgateV7PrivateHumanKeyEnrollmentOrchestratorReceipt<TBoundary>>
> {
  const production =
    boundary ===
    "production-fixed-current-euid-private-human-key-enrollment-orchestration";
  const installerBoundary = production
    ? ("production-fixed-current-euid-userinfo-home-control-plane-record-installation" as const)
    : ("test-only-injected-current-euid-home-control-plane-record-installation" as const);
  const bindingBoundary = production
    ? ("production-fixed-current-euid-userinfo-home-approved-record-current-key-binding" as const)
    : ("test-only-injected-current-euid-home-approved-record-current-key-binding" as const);
  try {
    const existing = await dependencies.hasValidExistingApprovedRecord();
    if (existing !== false && existing !== true) {
      throw new NativeError("existing record result differs");
    }
    if (existing) {
      throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
        "existing-record-check",
        "no-approved-record-change-established",
        false,
        "do-not-retry-existing-record",
      );
    }
  } catch (rawFailure) {
    if (
      rawFailure instanceof
      FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError
    ) {
      throw rawFailure;
    }
    throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
      "existing-record-check",
      "no-approved-record-change-established",
      false,
      "manual-reconciliation-required",
    );
  }

  let approved: CandidateCapture;
  try {
    approved = captureCandidate(
      await dependencies.inspectCandidate(),
      recordBoundary,
    );
  } catch (rawFailure) {
    throw wrapPreinstallationFailure("candidate-inspection", rawFailure);
  }

  try {
    const request: Readonly<FloodgateV7PrivateHumanKeyReviewRequest> =
      frozenRecord({
        contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT,
        candidate_canonical_json: approved.canonicalJson,
        candidate_sha256: approved.sha256,
        candidate_bytes: approved.bytes,
      });
    validateReviewResponse(
      await dependencies.reviewCandidate(request),
      approved.sha256,
    );
  } catch (rawFailure) {
    throw wrapPreinstallationFailure("private-human-review", rawFailure);
  }

  let approvedAtUtc: string;
  try {
    approvedAtUtc = validateApprovalTimestamp(dependencies.nowIsoUtc());
  } catch (rawFailure) {
    throw wrapPreinstallationFailure("approval-generation", rawFailure);
  }

  try {
    const fresh = captureCandidate(
      await dependencies.inspectCandidate(),
      recordBoundary,
    );
    if (!exactBytesEqual(approved.canonicalJson, fresh.canonicalJson)) {
      throw new NativeError("candidate changed after private review");
    }
  } catch (rawFailure) {
    throw wrapPreinstallationFailure("candidate-reinspection", rawFailure);
  }

  let approvalId: string;
  try {
    approvalId = approvalIdFromEntropy(dependencies.randomApprovalBytes());
    if (!HEX_64_RE.test(approvalId)) {
      throw new NativeError("approval identifier differs");
    }
  } catch (rawFailure) {
    throw wrapPreinstallationFailure("approval-generation", rawFailure);
  }

  const installationInput = frozenRecord({
    approval_id: approvalId,
    approved_at_utc: approvedAtUtc,
    approved_candidate_sha256: approved.sha256,
    candidate_canonical_json: approved.canonicalJson,
  });
  try {
    const installation =
      await dependencies.installApprovedRecord(installationInput);
    validateInstallationReceipt(installation, installerBoundary);
  } catch (rawFailure) {
    const installerFailure = captureInstallerFailure(rawFailure);
    if (installerFailure !== null) {
      throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
        "installation",
        installerFailure.durability,
        installerFailure.mayHaveCommitted,
        installerFailure.mayHaveCommitted
          ? "do-not-retry-installation-may-have-committed"
          : installerFailure.retryDisposition === "do-not-retry-existing-record"
            ? "do-not-retry-existing-record"
            : installerFailure.retryDisposition ===
                "safe-to-retry-after-not-installed"
              ? "safe-to-restart-with-a-fresh-private-review"
              : "manual-reconciliation-required",
        installerFailure.phase,
        installerFailure.retryDisposition,
      );
    }
    throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
      "installation",
      "final-link-may-exist",
      true,
      "do-not-retry-installation-may-have-committed",
    );
  }

  try {
    compareExpectedClaim(
      await dependencies.loadAndClaimApprovedRecord(),
      approved,
      approvalId,
      approvedAtUtc,
      recordBoundary,
    );
  } catch {
    throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
      "record-postflight",
      "record-published-and-staging-removal-durable",
      true,
      "manual-reconciliation-required",
    );
  }

  try {
    validateBindingReceipt(
      await dependencies.verifyCurrentBinding(),
      bindingBoundary,
    );
  } catch {
    throw new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
      "current-binding-postflight",
      "record-published-and-staging-removal-durable",
      true,
      "manual-reconciliation-required",
    );
  }

  return buildReceipt(boundary);
}

export function runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
  dependenciesValue: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7PrivateHumanKeyEnrollmentOrchestratorReceipt<"test-only-injected-private-human-key-enrollment-orchestration">
  >
> {
  if (arguments.length !== 1) {
    return rejected(
      new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
        "capture",
        "no-approved-record-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(
      new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
        "capture",
        "no-approved-record-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  return run(
    dependencies,
    "test-only-injected-private-human-key-enrollment-orchestration",
    "test-only-injected-current-euid-home-control-plane-record",
  );
}

function systemErrorCode(value: unknown): unknown {
  if (value === null || typeof value !== "object" || nodeIsProxy(value)) {
    return null;
  }
  const descriptor = objectGetOwnPropertyDescriptors(value).code;
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : null;
}

function captureAbsenceDependencies(
  value: FloodgateV7ApprovedKeyVerifiedAbsenceDependenciesForTests,
): VerifiedAbsenceDependencies {
  const record = safeDataRecord(value, "approved record absence dependencies");
  const descriptors = objectGetOwnPropertyDescriptors(record);
  const keys = reflectOwnKeys(record);
  const hasHook = objectHasOwn(
    descriptors,
    "beforeMissingPathRevalidationForTests",
  );
  const expectedKeys = hasHook
    ? [
        "effectiveUserId",
        "homeDirectory",
        "beforeMissingPathRevalidationForTests",
      ]
    : ["effectiveUserId", "homeDirectory"];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    throw new NativeError("approved record absence dependencies differ");
  }
  for (const key of keys) {
    const descriptor = typeof key === "string" ? descriptors[key] : undefined;
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("approved record absence dependencies differ");
    }
  }
  const effectiveUserId = descriptors.effectiveUserId?.value;
  const homeDirectory = descriptors.homeDirectory?.value;
  const beforeMissingPathRevalidation =
    descriptors.beforeMissingPathRevalidationForTests?.value;
  if (
    typeof effectiveUserId !== "number" ||
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    capturedGetEffectiveUserId === null ||
    capturedGetEffectiveUserId() !== effectiveUserId ||
    typeof homeDirectory !== "string" ||
    homeDirectory.length === 0 ||
    homeDirectory.includes("\0") ||
    !pathIsAbsolute(homeDirectory) ||
    pathParse(homeDirectory).root === homeDirectory ||
    pathResolve(homeDirectory) !== homeDirectory
  ) {
    throw new NativeError("approved record absence identity differs");
  }
  if (
    beforeMissingPathRevalidation !== undefined &&
    (typeof beforeMissingPathRevalidation !== "function" ||
      nodeIsProxy(beforeMissingPathRevalidation))
  ) {
    throw new NativeError("approved record absence hook differs");
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    beforeMissingPathRevalidation: beforeMissingPathRevalidation as
      | (() => void)
      | undefined,
  });
}

function sameAbsenceSnapshot(
  left: fs.BigIntStats,
  right: fs.BigIntStats,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function safeAbsenceDirectory(
  stat: fs.BigIntStats,
  effectiveUserId: number,
  managed: boolean,
): boolean {
  if (
    (stat.mode & TYPE_MASK) !== DIRECTORY_TYPE ||
    stat.uid !== NativeBigInt(effectiveUserId)
  ) {
    return false;
  }
  return managed
    ? (stat.mode & MODE_MASK) === MANAGED_DIRECTORY_MODE
    : (stat.mode & HOME_OWNER_MODE) === HOME_OWNER_MODE &&
        (stat.mode & HOME_FORBIDDEN_MODE) === NativeBigInt(0);
}

function holdAbsenceDirectory(
  filePath: string,
  effectiveUserId: number,
  managed: boolean,
): HeldAbsenceDirectory {
  let descriptor: number | null = null;
  try {
    const named = capturedLstatSync(filePath, { bigint: true });
    if (
      capturedRealpathSync(filePath) !== filePath ||
      !safeAbsenceDirectory(named, effectiveUserId, managed)
    ) {
      throw new NativeError("approved record absence namespace is unsafe");
    }
    descriptor = capturedOpenSync(filePath, DIRECTORY_OPEN_FLAGS);
    const held = capturedFstatSync(descriptor, { bigint: true });
    const namedAfterOpen = capturedLstatSync(filePath, { bigint: true });
    if (
      !sameAbsenceSnapshot(held, named) ||
      !sameAbsenceSnapshot(namedAfterOpen, named) ||
      !safeAbsenceDirectory(held, effectiveUserId, managed) ||
      !safeAbsenceDirectory(namedAfterOpen, effectiveUserId, managed) ||
      capturedRealpathSync(filePath) !== filePath
    ) {
      throw new NativeError("approved record absence namespace changed");
    }
    return frozenRecord({
      filePath,
      descriptor,
      snapshot: named,
      managed,
    });
  } catch {
    if (descriptor !== null) {
      try {
        capturedCloseSync(descriptor);
      } catch {
        // The fixed sanitized failure below remains authoritative.
      }
    }
    throw new NativeError("approved record absence directory failed");
  }
}

function revalidateAbsenceDirectory(
  reference: HeldAbsenceDirectory,
  effectiveUserId: number,
): void {
  const named = capturedLstatSync(reference.filePath, { bigint: true });
  const held = capturedFstatSync(reference.descriptor, { bigint: true });
  if (
    !sameAbsenceSnapshot(named, reference.snapshot) ||
    !sameAbsenceSnapshot(held, reference.snapshot) ||
    !safeAbsenceDirectory(named, effectiveUserId, reference.managed) ||
    !safeAbsenceDirectory(held, effectiveUserId, reference.managed) ||
    capturedRealpathSync(reference.filePath) !== reference.filePath
  ) {
    throw new NativeError("approved record absence namespace changed");
  }
}

function assertAbsenceTestHomeIsSeparate(
  dependencies: VerifiedAbsenceDependencies,
): void {
  const userInfo = capturedUserInfo();
  const descriptors = objectGetOwnPropertyDescriptors(userInfo);
  const uid = descriptors.uid;
  const home = descriptors.homedir;
  if (
    uid === undefined ||
    !("value" in uid) ||
    uid.value !== dependencies.effectiveUserId ||
    home === undefined ||
    !("value" in home) ||
    typeof home.value !== "string"
  ) {
    throw new NativeError("production identity differs");
  }
  const productionReal = capturedRealpathSync(home.value);
  const testReal = capturedRealpathSync(dependencies.homeDirectory);
  const productionStat = capturedLstatSync(productionReal, { bigint: true });
  const testStat = capturedLstatSync(testReal, { bigint: true });
  if (
    productionReal === testReal ||
    (productionStat.dev === testStat.dev && productionStat.ino === testStat.ino)
  ) {
    throw new NativeError("test absence home aliases production");
  }
}

function verifyApprovedRecordAbsent(
  dependencies: VerifiedAbsenceDependencies,
  testBoundary: boolean,
): true {
  const references: HeldAbsenceDirectory[] = [];
  let absenceEstablished = false;
  let missingPath: string | null = null;
  let failed = false;
  try {
    if (testBoundary) assertAbsenceTestHomeIsSeparate(dependencies);
    references.push(
      holdAbsenceDirectory(
        dependencies.homeDirectory,
        dependencies.effectiveUserId,
        false,
      ),
    );
    let currentPath = dependencies.homeDirectory;
    for (const component of FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS) {
      currentPath = pathJoin(currentPath, component);
      try {
        capturedLstatSync(currentPath, { bigint: true });
      } catch (probeFailure) {
        if (systemErrorCode(probeFailure) === "ENOENT") {
          absenceEstablished = true;
          missingPath = currentPath;
          break;
        }
        throw probeFailure;
      }
      references.push(
        holdAbsenceDirectory(currentPath, dependencies.effectiveUserId, true),
      );
    }
    if (!absenceEstablished) {
      const recordPath = pathJoin(
        currentPath,
        FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
      );
      try {
        capturedLstatSync(recordPath, { bigint: true });
      } catch (probeFailure) {
        if (systemErrorCode(probeFailure) === "ENOENT") {
          absenceEstablished = true;
          missingPath = recordPath;
        } else {
          throw probeFailure;
        }
      }
      if (!absenceEstablished) {
        throw new NativeError("an approved record name already exists");
      }
    }
    for (const reference of references) {
      revalidateAbsenceDirectory(reference, dependencies.effectiveUserId);
    }
    if (missingPath === null) {
      throw new NativeError("approved record missing path is unavailable");
    }
    if (dependencies.beforeMissingPathRevalidation !== undefined) {
      dependencies.beforeMissingPathRevalidation();
    }
    let absenceRevalidated = false;
    try {
      capturedLstatSync(missingPath, { bigint: true });
    } catch (probeFailure) {
      if (systemErrorCode(probeFailure) === "ENOENT") {
        absenceRevalidated = true;
      } else {
        throw probeFailure;
      }
    }
    if (!absenceRevalidated) {
      throw new NativeError("approved record absence changed");
    }
  } catch {
    failed = true;
  } finally {
    for (let index = references.length - 1; index >= 0; index -= 1) {
      try {
        const reference = references[index];
        if (reference !== undefined) capturedCloseSync(reference.descriptor);
      } catch {
        failed = true;
      }
    }
  }
  if (failed || !absenceEstablished) {
    throw new NativeError("approved record verified-absence probe failed");
  }
  return true;
}

/** Test-only direct probe. It rejects the actual production home and aliases. */
export function verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests(
  dependenciesValue: FloodgateV7ApprovedKeyVerifiedAbsenceDependenciesForTests,
): true {
  if (arguments.length !== 1) {
    throw new NativeError("approved record absence probe requires one input");
  }
  return verifyApprovedRecordAbsent(
    captureAbsenceDependencies(dependenciesValue),
    true,
  );
}

function productionAbsenceDependencies(): VerifiedAbsenceDependencies {
  if (capturedGetEffectiveUserId === null) {
    throw new NativeError("production effective UID is unavailable");
  }
  const effectiveUserId = capturedGetEffectiveUserId();
  const userInfo = capturedUserInfo();
  const descriptors = objectGetOwnPropertyDescriptors(userInfo);
  const uid = descriptors.uid;
  const home = descriptors.homedir;
  if (
    uid === undefined ||
    !("value" in uid) ||
    uid.value !== effectiveUserId ||
    home === undefined ||
    !("value" in home) ||
    typeof home.value !== "string"
  ) {
    throw new NativeError("production identity differs");
  }
  return captureAbsenceDependencies({
    effectiveUserId,
    homeDirectory: home.value,
  });
}

async function hasValidProductionRecord(): Promise<boolean> {
  try {
    claimFloodgateV7ApprovedKeyEnrollment(
      await loadFloodgateV7ApprovedKeyEnrollment(),
    );
    return true;
  } catch {
    // The loader intentionally collapses absence, corruption, unsafe
    // namespaces, I/O failures, and close failures. Continue only when a
    // separate fixed-path probe establishes ENOENT. Any existing or
    // indeterminate record is a manual-reconciliation condition and must not
    // open a fresh approval UI.
    verifyApprovedRecordAbsent(productionAbsenceDependencies(), false);
    return false;
  }
}

/**
 * Zero-argument production orchestrator. Calling it opens the private native
 * human-review UI and may install the real approved record exactly once.
 */
export function runFloodgateV7PrivateHumanKeyEnrollmentOrchestrator(): Promise<
  Readonly<
    FloodgateV7PrivateHumanKeyEnrollmentOrchestratorReceipt<"production-fixed-current-euid-private-human-key-enrollment-orchestration">
  >
> {
  if (arguments.length !== 0) {
    return rejected(
      new FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError(
        "capture",
        "no-approved-record-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  const dependencies: CapturedDependencies = frozenRecord({
    hasValidExistingApprovedRecord: hasValidProductionRecord,
    inspectCandidate: inspectFloodgateV7DeploymentKeyInstance,
    reviewCandidate: reviewFloodgateV7PrivateHumanKeyCandidate,
    nowIsoUtc: () =>
      reflectApply(dateToISOString, new NativeDate(), []) as string,
    randomApprovalBytes: () => capturedRandomBytes(32),
    installApprovedRecord: installFloodgateV7ApprovedKeyEnrollment,
    loadAndClaimApprovedRecord: async () =>
      claimFloodgateV7ApprovedKeyEnrollment(
        await loadFloodgateV7ApprovedKeyEnrollment(),
      ),
    verifyCurrentBinding: verifyFloodgateV7ApprovedKeyCurrentBinding,
  });
  return run(
    dependencies,
    "production-fixed-current-euid-private-human-key-enrollment-orchestration",
    "production-fixed-current-euid-userinfo-home-control-plane-record",
  );
}
