/**
 * Gate-specific production owner for one Floodgate v7 checkpoint connector
 * invocation. Private registry data and the connector's raw receipt never
 * cross this module's public receipt or error boundary.
 */

import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  claimFloodgateV7ApprovedKeyEnrollment,
  loadFloodgateV7ApprovedKeyEnrollment,
  type FloodgateV7ApprovedKeyEnrollmentCapability,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
} from "./floodgate-v7-approved-key-enrollment";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "./floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
  verifyFloodgateV7ApprovedKeyCurrentBinding,
} from "./floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
  FloodgateV7ProductionCheckpointConnectorError,
  runFloodgateV7ProductionCheckpointConnector,
  type FloodgateV7ProductionCheckpointConnectorOptions,
  type FloodgateV7ProductionCheckpointConnectorRetryDisposition,
} from "./floodgate-v7-production-checkpoint-connector";
import {
  claimFloodgateV7ProductionConnectorRegistry,
  loadFloodgateV7ProductionConnectorRegistry,
} from "./floodgate-v7-production-connector-registry";
import type { FloodgateTeacherStageAuthorizationOptions } from "./floodgate-teacher-stage-authorization";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
} from "./floodgate-v7-teacher-checkpoint";
import type { FloodgateTrainingRowConsumerOptions } from "./floodgate-training-row-consumer";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
  FloodgateV7ProductionOuterGateLeaseError,
  runFloodgateV7ProductionOuterGateFinal24000,
  runFloodgateV7ProductionOuterGatePrefix100,
  runFloodgateV7ProductionOuterGatePrefix500,
  type FloodgateV7ProductionOuterGateConnectorCapability,
} from "./floodgate-v7-production-outer-gate-lease";
import {
  FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_CONTRACT,
  FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_STATUS,
  scanFloodgateV7Prefix100CallerAnchor,
  type FloodgateV7Prefix100WorkScanAnchor,
} from "./floodgate-v7-production-prefix-100-postflight";

export const FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CONTRACT =
  "shogi-floodgate-v7-production-connector-runner-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_STATUS =
  "registry-approved-current-bound-production-connector-gate-complete" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CLAIM_BOUNDARY =
  "one-fixed-production-gate-after-private-registry-approved-record-and-current-key-binding-without-public-run-binding-options-or-raw-connector-receipt-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_EXECUTION_BOUNDARY =
  "production-fixed-gate-private-registry-and-capability-owners" as const;

export type FloodgateV7ProductionConnectorRunnerGate =
  FloodgateV7ProductionCheckpointConnectorOptions["gate"];

export type FloodgateV7ProductionConnectorRunnerPhase =
  | "capture"
  | "outer-gate-lock"
  | "registry-load"
  | "registry-claim"
  | "approved-record-load"
  | "approved-record-claim"
  | "approved-binding"
  | "current-binding"
  | "connector-enrollment-load"
  | "connector"
  | "receipt"
  | "exact-prefix-100-postflight";

export type FloodgateV7ProductionConnectorRunnerRetryDisposition =
  | "fresh-invocation-required"
  | "operator-reconciliation-required"
  | "checkpoint-reconciliation-required";

export interface FloodgateV7ProductionConnectorRunnerReceipt<
  TGate extends FloodgateV7ProductionConnectorRunnerGate =
    FloodgateV7ProductionConnectorRunnerGate,
> {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CLAIM_BOUNDARY;
  readonly execution_boundary: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_EXECUTION_BOUNDARY;
  readonly gate: TGate;
  readonly checkpoint: Readonly<{
    readonly target_parents: 100 | 500 | 24_000;
    readonly sealed: boolean;
    readonly checkpoint_may_have_persisted: true;
  }>;
  readonly verification: Readonly<
    {
      readonly private_registry_claimed: true;
      readonly approved_record_binding_matched: true;
      readonly fresh_current_key_binding_validated: true;
      readonly connector_completed: true;
    } & (TGate extends "durable-prefix-100"
      ? {
          readonly exact_prefix_100_read_only_continuity_postflight_completed: true;
        }
      : Record<never, never>)
  >;
  readonly nonclaims: Readonly<{
    readonly run_id_disclosed: false;
    readonly approved_key_binding_disclosed: false;
    readonly connector_options_disclosed: false;
    readonly raw_connector_receipt_disclosed: false;
    readonly key_material_disclosed: false;
    readonly row_or_position_content_disclosed: false;
    readonly teacher_label: false;
    readonly optimizer_training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export class FloodgateV7ProductionConnectorRunnerError extends Error {
  readonly phase!: FloodgateV7ProductionConnectorRunnerPhase;
  readonly gate!: FloodgateV7ProductionConnectorRunnerGate;
  readonly connector_invoked!: boolean;
  readonly checkpoint_may_have_persisted!: boolean;
  readonly retry_disposition!: FloodgateV7ProductionConnectorRunnerRetryDisposition;
  readonly connector_phase!: string | null;
  readonly connector_retry_disposition!: FloodgateV7ProductionCheckpointConnectorRetryDisposition | null;
  readonly raw_connector_receipt_disclosed!: false;

  constructor(
    phase: FloodgateV7ProductionConnectorRunnerPhase,
    gate: FloodgateV7ProductionConnectorRunnerGate,
    connectorInvoked: boolean,
    checkpointMayHavePersisted: boolean,
    connectorPhase: string | null = null,
    connectorRetryDisposition: FloodgateV7ProductionCheckpointConnectorRetryDisposition | null = null,
  ) {
    super("Floodgate v7 production connector runner failed");
    const retryDisposition = checkpointMayHavePersisted
      ? "checkpoint-reconciliation-required"
      : phase === "capture"
        ? "fresh-invocation-required"
        : "operator-reconciliation-required";
    defineField(
      this,
      "name",
      "FloodgateV7ProductionConnectorRunnerError",
      false,
    );
    defineField(
      this,
      "stack",
      "FloodgateV7ProductionConnectorRunnerError: production connector runner failed",
      false,
    );
    defineField(this, "phase", phase, true);
    defineField(this, "gate", gate, true);
    defineField(this, "connector_invoked", connectorInvoked, true);
    defineField(
      this,
      "checkpoint_may_have_persisted",
      checkpointMayHavePersisted,
      true,
    );
    defineField(this, "retry_disposition", retryDisposition, true);
    defineField(this, "connector_phase", connectorPhase, true);
    defineField(
      this,
      "connector_retry_disposition",
      connectorRetryDisposition,
      true,
    );
    defineField(this, "raw_connector_receipt_disclosed", false, true);
    objectFreeze(this);
  }
}

interface PrivateRegistryClaim {
  readonly runId: string;
  readonly approvedKeyBinding: Readonly<{
    readonly recordBytes: number;
    readonly recordSha256: string;
    readonly keyInstanceId: string;
  }>;
  readonly stageAuthorization: FloodgateTeacherStageAuthorizationOptions;
  readonly consumer: FloodgateTrainingRowConsumerOptions;
}

export interface FloodgateV7ProductionConnectorRunnerDependenciesForTests {
  readonly loadRegistry: () => Promise<unknown>;
  readonly claimRegistry: (capability: unknown) => unknown;
  readonly loadApprovedEnrollment: () => Promise<
    Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>
  >;
  readonly claimApprovedEnrollment: (
    capability: FloodgateV7ApprovedKeyEnrollmentCapability,
  ) => Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
  readonly verifyCurrentBinding: () => Promise<unknown>;
  readonly runConnector: (
    options: FloodgateV7ProductionCheckpointConnectorOptions,
    outerGateCapability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability> | null,
  ) => Promise<unknown>;
  readonly scanPrefix100CallerAnchor: (
    anchor: Readonly<FloodgateV7Prefix100WorkScanAnchor>,
  ) => Promise<unknown>;
}

type CapturedDependencies =
  Readonly<FloodgateV7ProductionConnectorRunnerDependenciesForTests>;

const NativeError = Error;
const NativePromise = Promise;
const nativeTimingSafeEqual = timingSafeEqual;
const nativeUint8ArrayFill = Uint8Array.prototype.fill;
const nativeReflectApply = Reflect.apply;
const nodeIsProxy = nodeUtilTypes.isProxy;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const numberIsSafeInteger = Number.isSafeInteger;
const bufferFrom = Buffer.from.bind(Buffer);
const nativeArrayIncludes = Array.prototype.includes;
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathResolve = path.resolve.bind(path);
const nativeRegExpExec = RegExp.prototype.exec;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const DEPENDENCY_KEYS = objectFreeze([
  "loadRegistry",
  "claimRegistry",
  "loadApprovedEnrollment",
  "claimApprovedEnrollment",
  "verifyCurrentBinding",
  "runConnector",
  "scanPrefix100CallerAnchor",
] as const);
const PRIVATE_CLAIM_KEYS = objectFreeze([
  "runId",
  "approvedKeyBinding",
  "stageAuthorization",
  "consumer",
] as const);
const PRIVATE_BINDING_KEYS = objectFreeze([
  "recordBytes",
  "recordSha256",
  "keyInstanceId",
] as const);
const APPROVED_CLAIM_KEYS = objectFreeze([
  "execution_boundary",
  "record",
  "candidate_receipt",
  "approval",
  "key_id",
  "key_instance_id",
  "deployment_identity",
] as const);
const APPROVED_RECORD_KEYS = objectFreeze(["bytes", "sha256"] as const);
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
const CURRENT_BINDING_PRODUCTION_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding" as const;
const CONNECTOR_PRODUCTION_EXECUTION_BOUNDARY =
  "production-fixed-capability-composition" as const;
const APPROVED_ENROLLMENT_PRODUCTION_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-control-plane-record" as const;
const CONNECTOR_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "trust_boundary",
  "execution_boundary",
  "test_boundary",
  "run_id",
  "gate",
  "key_id",
  "key_instance_id",
  "approved_key_enrollment",
  "run_binding",
  "input_binding",
  "checkpoint",
  "lifecycle",
  "holdout_boundary",
  "nonclaims",
] as const);
const CONNECTOR_APPROVED_ENROLLMENT_KEYS = objectFreeze([
  "claim_boundary",
  "execution_boundary",
  "record",
  "candidate_receipt",
  "approval",
  "deployment_identity",
] as const);
const CONNECTOR_CHECKPOINT_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "algorithm",
  "gate_contract",
  "sealed",
  "work",
] as const);
const CONNECTOR_CHECKPOINT_GATE_KEYS = objectFreeze([
  "schema",
  "durable_prefix_100_parents",
  "durable_prefix_500_parents",
  "sealed_final_parents",
] as const);
const CONNECTOR_CHECKPOINT_WORK_KEYS = objectFreeze([
  "format",
  "training_parents",
  "records",
  "bytes",
  "sha256",
  "target_parents",
  "completed_parents",
  "resumed_parents",
  "durability",
] as const);
const CONNECTOR_LIFECYCLE_KEYS = objectFreeze([
  "readiness_metadata_passed",
  "authoritative_key_reopen_and_revalidation_succeeded",
  "exact_input_claimed_synchronously",
  "checkpoint_settled_before_postflight",
  "postflight_claimed_once",
  "key_cleanup_settled",
  "lease_close_joined",
  "coordinator_closed",
] as const);
const CONNECTOR_HOLDOUT_KEYS = objectFreeze([
  "callback_role",
  "callback_parents",
  "labeled_selection_read",
  "labeled_final_holdout_read",
  "label_free_selection_and_final_role_artifacts_may_be_verified",
] as const);
const CONNECTOR_NONCLAIM_KEYS = objectFreeze([
  "key_bytes_or_key_hash",
  "authorization_mac",
  "absolute_or_caller_path",
  "row_or_position_content",
  "executable_capability",
  "teacher_label",
  "optimizer_training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);
const OUTER_RESULT_KEYS = objectFreeze(["value", "lease"] as const);
const OUTER_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "algorithm",
  "execution_boundary",
  "verification",
  "nonclaims",
] as const);
const OUTER_VERIFICATION_KEYS = objectFreeze([
  "one_os_lifetime_lock_shared_by_all_three_gates",
  "os_lifetime_lock_held_before_operation",
  "authenticated_lease_metadata_durable_before_operation",
  "signal_and_exit_preserve_stale_evidence",
  "authenticated_lease_removed_durably_after_operation",
  "authenticated_retired_evidence_durable_after_operation",
  "os_lifetime_lock_released_after_operation",
  "quarantine_empty_after_operation",
] as const);
const OUTER_NONCLAIM_KEYS = objectFreeze([
  "lock_or_lease_path_disclosed",
  "lease_metadata_disclosed",
  "key_material_disclosed",
  "key_instance_id_disclosed",
  "lease_mac_disclosed",
  "connector_receipt_disclosed",
  "graceful_signal_cleanup",
  "checkpoint",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);
const PREFIX_100_POSTFLIGHT_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "execution_boundary",
  "verification",
  "nonclaims",
] as const);
const PREFIX_100_POSTFLIGHT_VERIFICATION_KEYS = objectFreeze([
  "namespace_exact",
  "held_vs_named_identity_matched",
  "anchor_bytes_digest_and_record_count_matched",
  "descriptors_closed",
  "namespace_or_file_content_mutated",
] as const);
const PREFIX_100_POSTFLIGHT_NONCLAIM_KEYS = objectFreeze([
  "outer_lock_origin",
  "connector_receipt_origin",
  "independent_hmac_authentication",
  "authenticated_continuity",
  "production_gate_authority",
  "atime_invariance",
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
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("runner record differs");
    }
    defineField(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function dataRecord(
  value: unknown,
  keys?: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("runner value is not a data record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (keys !== undefined && ownKeys.length !== keys.length) {
    throw new NativeError("runner record key count differs");
  }
  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      (keys !== undefined &&
        !nativeReflectApply(nativeArrayIncludes, keys, [key]))
    ) {
      throw new NativeError("runner record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("runner record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function rejected<T>(failure: unknown): Promise<T> {
  return new NativePromise((_resolve, reject) => reject(failure));
}

function captureGate(value: unknown): FloodgateV7ProductionConnectorRunnerGate {
  if (
    value !== "durable-prefix-100" &&
    value !== "durable-prefix-500" &&
    value !== "sealed-final-24000"
  ) {
    throw new NativeError("runner gate differs");
  }
  return value;
}

function isHex64(value: unknown): value is string {
  return (
    typeof value === "string" &&
    nativeReflectApply(nativeRegExpExec, HEX_64_RE, [value]) !== null
  );
}

function captureDependencies(
  value: FloodgateV7ProductionConnectorRunnerDependenciesForTests,
): CapturedDependencies {
  const record = dataRecord(value, DEPENDENCY_KEYS);
  const captured = objectCreate(null) as Record<string, unknown>;
  for (const key of DEPENDENCY_KEYS) {
    if (typeof record[key] !== "function" || nodeIsProxy(record[key])) {
      throw new NativeError("runner dependency differs");
    }
    captured[key] = record[key];
  }
  return frozenRecord(
    captured as unknown as FloodgateV7ProductionConnectorRunnerDependenciesForTests,
  );
}

function capturePrivateClaim(value: unknown): Readonly<PrivateRegistryClaim> {
  const claim = dataRecord(value, PRIVATE_CLAIM_KEYS);
  const binding = dataRecord(claim.approvedKeyBinding, PRIVATE_BINDING_KEYS);
  if (
    !isHex64(claim.runId) ||
    typeof binding.recordBytes !== "number" ||
    !numberIsSafeInteger(binding.recordBytes) ||
    binding.recordBytes < 2 ||
    !isHex64(binding.recordSha256) ||
    !isHex64(binding.keyInstanceId)
  ) {
    throw new NativeError("runner registry claim differs");
  }
  dataRecord(claim.stageAuthorization);
  dataRecord(claim.consumer);
  return frozenRecord({
    runId: claim.runId,
    approvedKeyBinding: frozenRecord({
      recordBytes: binding.recordBytes,
      recordSha256: binding.recordSha256,
      keyInstanceId: binding.keyInstanceId,
    }),
    stageAuthorization:
      claim.stageAuthorization as FloodgateTeacherStageAuthorizationOptions,
    consumer: claim.consumer as FloodgateTrainingRowConsumerOptions,
  });
}

function equalPrivateHex(left: string, right: unknown): boolean {
  if (!isHex64(right)) return false;
  const leftBytes = bufferFrom(left, "ascii");
  const rightBytes = bufferFrom(right, "ascii");
  try {
    return nativeTimingSafeEqual(leftBytes, rightBytes);
  } finally {
    nativeReflectApply(nativeUint8ArrayFill, leftBytes, [0]);
    nativeReflectApply(nativeUint8ArrayFill, rightBytes, [0]);
  }
}

function approvedBindingMatches(
  registry: Readonly<PrivateRegistryClaim["approvedKeyBinding"]>,
  approved: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>,
): boolean {
  const claim = dataRecord(approved, APPROVED_CLAIM_KEYS);
  const record = dataRecord(claim.record, APPROVED_RECORD_KEYS);
  return (
    record.bytes === registry.recordBytes &&
    equalPrivateHex(registry.recordSha256, record.sha256) &&
    equalPrivateHex(registry.keyInstanceId, claim.key_instance_id)
  );
}

function validateCurrentBindingReceipt(value: unknown): void {
  const receipt = dataRecord(value, CURRENT_BINDING_RECEIPT_KEYS);
  const verification = dataRecord(
    receipt.verification,
    CURRENT_BINDING_VERIFICATION_KEYS,
  );
  const nonclaims = dataRecord(
    receipt.nonclaims,
    CURRENT_BINDING_NONCLAIM_KEYS,
  );
  if (
    receipt.contract !== FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT ||
    receipt.status !== FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY ||
    receipt.execution_boundary !==
      CURRENT_BINDING_PRODUCTION_EXECUTION_BOUNDARY ||
    receipt.algorithm !== FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM ||
    verification.approved_record_validated !== true ||
    verification.current_key_freshly_inspected !== true ||
    verification.exact_binding_match !== true ||
    verification.held_descriptors_revalidated !== true ||
    verification.memory_only !== true ||
    verification.sensitive_values_exported !== false
  ) {
    throw new NativeError("runner current binding receipt differs");
  }
  for (const key of CURRENT_BINDING_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new NativeError("runner current binding nonclaim differs");
    }
  }
}

function gateTarget(
  gate: FloodgateV7ProductionConnectorRunnerGate,
): 100 | 500 | 24_000 {
  return gate === "durable-prefix-100"
    ? 100
    : gate === "durable-prefix-500"
      ? 500
      : 24_000;
}

function gateExpectedRecords(
  gate: FloodgateV7ProductionConnectorRunnerGate,
): 102 | 503 | 24_004 {
  return gate === "durable-prefix-100"
    ? 102
    : gate === "durable-prefix-500"
      ? 503
      : 24_004;
}

function gatePredecessorParents(
  gate: FloodgateV7ProductionConnectorRunnerGate,
): 0 | 100 | 500 {
  return gate === "durable-prefix-100"
    ? 0
    : gate === "durable-prefix-500"
      ? 100
      : 500;
}

function buildPrefix100WorkAnchor(
  claim: Readonly<PrivateRegistryClaim>,
  work: Readonly<Record<string, unknown>>,
): Readonly<FloodgateV7Prefix100WorkScanAnchor> {
  const publicationParent = claim.stageAuthorization.publicationParent;
  const stageBasename = claim.stageAuthorization.stageBasename;
  const destinationBasename = claim.stageAuthorization.destinationBasename;
  const workBytes = work.bytes;
  const workSha256 = work.sha256;
  if (
    typeof publicationParent !== "string" ||
    publicationParent.length < 1 ||
    publicationParent.length > 4096 ||
    publicationParent.includes("\0") ||
    !pathIsAbsolute(publicationParent) ||
    pathResolve(publicationParent) !== publicationParent ||
    stageBasename !== `floodgate-v7-${claim.runId}-stage` ||
    destinationBasename !== `floodgate-v7-${claim.runId}-final` ||
    work.records !== 102 ||
    work.completed_parents !== 100 ||
    typeof workBytes !== "number" ||
    typeof workSha256 !== "string"
  ) {
    throw new NativeError("runner prefix 100 work anchor differs");
  }
  return frozenRecord({
    publicationParent,
    stageBasename,
    destinationBasename,
    workBasename: "work.jsonl" as const,
    workBytes,
    workSha256,
    workRecords: 102 as const,
    completedParents: 100 as const,
  });
}

function validatePrefix100PostflightReceipt(value: unknown): void {
  const receipt = dataRecord(value, PREFIX_100_POSTFLIGHT_RECEIPT_KEYS);
  const verification = dataRecord(
    receipt.verification,
    PREFIX_100_POSTFLIGHT_VERIFICATION_KEYS,
  );
  const nonclaims = dataRecord(
    receipt.nonclaims,
    PREFIX_100_POSTFLIGHT_NONCLAIM_KEYS,
  );
  if (
    receipt.contract !== FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_CONTRACT ||
    receipt.status !== FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_STATUS ||
    receipt.execution_boundary !==
      FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY ||
    verification.namespace_exact !== true ||
    verification.held_vs_named_identity_matched !== true ||
    verification.anchor_bytes_digest_and_record_count_matched !== true ||
    verification.descriptors_closed !== true ||
    verification.namespace_or_file_content_mutated !== false ||
    nonclaims.outer_lock_origin !== false ||
    nonclaims.connector_receipt_origin !== false ||
    nonclaims.independent_hmac_authentication !== false ||
    nonclaims.authenticated_continuity !== false ||
    nonclaims.production_gate_authority !== false ||
    nonclaims.atime_invariance !== false
  ) {
    throw new NativeError("runner prefix 100 postflight receipt differs");
  }
}

function validateConnectorReceipt(
  value: unknown,
  gate: FloodgateV7ProductionConnectorRunnerGate,
  claim: Readonly<PrivateRegistryClaim>,
): Readonly<FloodgateV7Prefix100WorkScanAnchor> | null {
  const receipt = dataRecord(value, CONNECTOR_RECEIPT_KEYS);
  const approved = dataRecord(
    receipt.approved_key_enrollment,
    CONNECTOR_APPROVED_ENROLLMENT_KEYS,
  );
  const record = dataRecord(approved.record, APPROVED_RECORD_KEYS);
  dataRecord(approved.candidate_receipt);
  dataRecord(approved.approval);
  dataRecord(approved.deployment_identity);
  dataRecord(receipt.run_binding);
  dataRecord(receipt.input_binding);
  const checkpoint = dataRecord(receipt.checkpoint, CONNECTOR_CHECKPOINT_KEYS);
  const gateContract = dataRecord(
    checkpoint.gate_contract,
    CONNECTOR_CHECKPOINT_GATE_KEYS,
  );
  const work = dataRecord(checkpoint.work, CONNECTOR_CHECKPOINT_WORK_KEYS);
  const lifecycle = dataRecord(receipt.lifecycle, CONNECTOR_LIFECYCLE_KEYS);
  const holdout = dataRecord(receipt.holdout_boundary, CONNECTOR_HOLDOUT_KEYS);
  const nonclaims = dataRecord(receipt.nonclaims, CONNECTOR_NONCLAIM_KEYS);
  const expectedTarget = gateTarget(gate);
  const expectedRecords = gateExpectedRecords(gate);
  const predecessorParents = gatePredecessorParents(gate);
  const expectedStatus =
    gate === "sealed-final-24000"
      ? FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS
      : FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS;
  if (
    receipt.contract !==
      FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT ||
    receipt.status !== FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY ||
    receipt.trust_boundary !==
      FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY ||
    receipt.execution_boundary !== CONNECTOR_PRODUCTION_EXECUTION_BOUNDARY ||
    receipt.test_boundary !== null ||
    receipt.gate !== gate ||
    receipt.key_id !== FLOODGATE_V7_DEPLOYMENT_KEY_ID ||
    !equalPrivateHex(claim.runId, receipt.run_id) ||
    !equalPrivateHex(
      claim.approvedKeyBinding.keyInstanceId,
      receipt.key_instance_id,
    ) ||
    record.bytes !== claim.approvedKeyBinding.recordBytes ||
    !equalPrivateHex(claim.approvedKeyBinding.recordSha256, record.sha256) ||
    approved.claim_boundary !==
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY ||
    approved.execution_boundary !==
      APPROVED_ENROLLMENT_PRODUCTION_EXECUTION_BOUNDARY ||
    checkpoint.contract !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA ||
    checkpoint.status !== expectedStatus ||
    checkpoint.claim_boundary !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY ||
    checkpoint.algorithm !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM ||
    gateContract.schema !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema ||
    gateContract.durable_prefix_100_parents !== 100 ||
    gateContract.durable_prefix_500_parents !== 500 ||
    gateContract.sealed_final_parents !== 24_000 ||
    work.format !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT ||
    work.training_parents !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    typeof work.records !== "number" ||
    !numberIsSafeInteger(work.records) ||
    work.records !== expectedRecords ||
    typeof work.bytes !== "number" ||
    !numberIsSafeInteger(work.bytes) ||
    work.bytes < 1 ||
    work.bytes > FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES ||
    !isHex64(work.sha256) ||
    work.target_parents !== expectedTarget ||
    work.completed_parents !== expectedTarget ||
    typeof work.resumed_parents !== "number" ||
    !numberIsSafeInteger(work.resumed_parents) ||
    work.resumed_parents < predecessorParents ||
    work.resumed_parents > expectedTarget ||
    work.durability !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY ||
    checkpoint.sealed !== (gate === "sealed-final-24000") ||
    lifecycle.readiness_metadata_passed !== true ||
    lifecycle.authoritative_key_reopen_and_revalidation_succeeded !== true ||
    lifecycle.exact_input_claimed_synchronously !== true ||
    lifecycle.checkpoint_settled_before_postflight !== true ||
    lifecycle.postflight_claimed_once !== true ||
    lifecycle.key_cleanup_settled !== true ||
    lifecycle.lease_close_joined !== true ||
    lifecycle.coordinator_closed !== true ||
    holdout.callback_role !== "training" ||
    holdout.callback_parents !== 24_000 ||
    holdout.labeled_selection_read !== false ||
    holdout.labeled_final_holdout_read !== false ||
    holdout.label_free_selection_and_final_role_artifacts_may_be_verified !==
      true
  ) {
    throw new NativeError("runner connector receipt differs");
  }
  for (const key of CONNECTOR_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new NativeError("runner connector nonclaim differs");
    }
  }
  return gate === "durable-prefix-100"
    ? buildPrefix100WorkAnchor(claim, work)
    : null;
}

function publicFailure(
  phase: FloodgateV7ProductionConnectorRunnerPhase,
  gate: FloodgateV7ProductionConnectorRunnerGate,
  connectorInvoked = false,
  checkpointMayHavePersisted = false,
  connectorPhase: string | null = null,
  connectorRetryDisposition: FloodgateV7ProductionCheckpointConnectorRetryDisposition | null = null,
): FloodgateV7ProductionConnectorRunnerError {
  return new FloodgateV7ProductionConnectorRunnerError(
    phase,
    gate,
    connectorInvoked,
    checkpointMayHavePersisted,
    connectorPhase,
    connectorRetryDisposition,
  );
}

function isConnectorPhase(value: unknown): value is string {
  switch (value) {
    case "capture":
    case "enrollment":
    case "readiness":
    case "coordinator-stage":
    case "handoff":
    case "key-prepare":
    case "key-instance":
    case "consumer":
    case "checkpoint":
    case "postflight":
    case "cleanup":
    case "receipt":
      return true;
    default:
      return false;
  }
}

function captureTypedConnectorFailure(value: unknown): Readonly<{
  checkpointMayHavePersisted: boolean;
  phase: string;
  retryDisposition: FloodgateV7ProductionCheckpointConnectorRetryDisposition;
}> | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      nodeIsProxy(value) ||
      !(value instanceof FloodgateV7ProductionCheckpointConnectorError)
    ) {
      return null;
    }
    const descriptors = objectGetOwnPropertyDescriptors(value);
    const phaseDescriptor = descriptors.phase;
    const persistedDescriptor = descriptors.checkpoint_may_have_persisted;
    const retryDescriptor = descriptors.retry_disposition;
    if (
      phaseDescriptor === undefined ||
      !("value" in phaseDescriptor) ||
      persistedDescriptor === undefined ||
      !("value" in persistedDescriptor) ||
      retryDescriptor === undefined ||
      !("value" in retryDescriptor) ||
      !isConnectorPhase(phaseDescriptor.value) ||
      typeof persistedDescriptor.value !== "boolean" ||
      (retryDescriptor.value !== "provision-required" &&
        retryDescriptor.value !== "operator-reconciliation-required" &&
        retryDescriptor.value !== "checkpoint-reconciliation-required" &&
        retryDescriptor.value !== "fresh-invocation-required") ||
      (persistedDescriptor.value === true) !==
        (retryDescriptor.value === "checkpoint-reconciliation-required")
    ) {
      return null;
    }
    return frozenRecord({
      checkpointMayHavePersisted: persistedDescriptor.value,
      phase: phaseDescriptor.value,
      retryDisposition: retryDescriptor.value,
    });
  } catch {
    return null;
  }
}

function buildReceipt<TGate extends FloodgateV7ProductionConnectorRunnerGate>(
  gate: TGate,
): Readonly<FloodgateV7ProductionConnectorRunnerReceipt<TGate>> {
  const verification =
    gate === "durable-prefix-100"
      ? frozenRecord({
          private_registry_claimed: true as const,
          approved_record_binding_matched: true as const,
          fresh_current_key_binding_validated: true as const,
          connector_completed: true as const,
          exact_prefix_100_read_only_continuity_postflight_completed:
            true as const,
        })
      : frozenRecord({
          private_registry_claimed: true as const,
          approved_record_binding_matched: true as const,
          fresh_current_key_binding_validated: true as const,
          connector_completed: true as const,
        });
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_STATUS,
    claim_boundary: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CLAIM_BOUNDARY,
    execution_boundary:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_EXECUTION_BOUNDARY,
    gate,
    checkpoint: frozenRecord({
      target_parents: gateTarget(gate),
      sealed: gate === "sealed-final-24000",
      checkpoint_may_have_persisted: true as const,
    }),
    verification,
    nonclaims: frozenRecord({
      run_id_disclosed: false as const,
      approved_key_binding_disclosed: false as const,
      connector_options_disclosed: false as const,
      raw_connector_receipt_disclosed: false as const,
      key_material_disclosed: false as const,
      row_or_position_content_disclosed: false as const,
      teacher_label: false as const,
      optimizer_training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  }) as Readonly<FloodgateV7ProductionConnectorRunnerReceipt<TGate>>;
}

function validateOuterSuccess<T>(value: unknown): T {
  const result = dataRecord(value, OUTER_RESULT_KEYS);
  const lease = dataRecord(result.lease, OUTER_RECEIPT_KEYS);
  const verification = dataRecord(lease.verification, OUTER_VERIFICATION_KEYS);
  const nonclaims = dataRecord(lease.nonclaims, OUTER_NONCLAIM_KEYS);
  if (
    lease.contract !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT ||
    lease.status !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS ||
    lease.algorithm !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM ||
    lease.execution_boundary !==
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY
  ) {
    throw new NativeError("runner outer gate receipt differs");
  }
  for (const key of OUTER_VERIFICATION_KEYS) {
    if (verification[key] !== true) {
      throw new NativeError("runner outer gate verification differs");
    }
  }
  for (const key of OUTER_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new NativeError("runner outer gate nonclaim differs");
    }
  }
  return result.value as T;
}

/** Test-only strict parser for the production outer-owner success boundary. */
export function validateFloodgateV7ProductionOuterGateSuccessCoreForTests<T>(
  value: unknown,
): T {
  if (arguments.length !== 1) {
    throw new NativeError("runner outer gate receipt differs");
  }
  return validateOuterSuccess<T>(value);
}

function outerOperationMayHaveRun(value: unknown): boolean {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      nodeIsProxy(value) ||
      !(value instanceof FloodgateV7ProductionOuterGateLeaseError)
    ) {
      return true;
    }
    const descriptor =
      objectGetOwnPropertyDescriptors(value).authenticated_lease_published;
    return descriptor === undefined ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "boolean"
      ? true
      : descriptor.value;
  } catch {
    return true;
  }
}

async function runCaptured<
  TGate extends FloodgateV7ProductionConnectorRunnerGate,
>(
  gate: TGate,
  dependencies: CapturedDependencies,
  outerGateCapability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability> | null = null,
): Promise<Readonly<FloodgateV7ProductionConnectorRunnerReceipt<TGate>>> {
  let registryCapability: unknown;
  try {
    registryCapability = await dependencies.loadRegistry();
  } catch {
    throw publicFailure("registry-load", gate);
  }

  let privateClaim: Readonly<PrivateRegistryClaim>;
  try {
    privateClaim = capturePrivateClaim(
      dependencies.claimRegistry(registryCapability),
    );
  } catch {
    throw publicFailure("registry-claim", gate);
  }

  let approvedCapability: Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>;
  try {
    approvedCapability = await dependencies.loadApprovedEnrollment();
  } catch {
    throw publicFailure("approved-record-load", gate);
  }

  let approvedClaim: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
  try {
    approvedClaim = dependencies.claimApprovedEnrollment(approvedCapability);
  } catch {
    throw publicFailure("approved-record-claim", gate);
  }
  try {
    if (
      !approvedBindingMatches(privateClaim.approvedKeyBinding, approvedClaim)
    ) {
      throw new NativeError("approved binding differs");
    }
  } catch {
    throw publicFailure("approved-binding", gate);
  }

  try {
    validateCurrentBindingReceipt(await dependencies.verifyCurrentBinding());
  } catch {
    throw publicFailure("current-binding", gate);
  }

  let connectorEnrollment: Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>;
  try {
    connectorEnrollment = await dependencies.loadApprovedEnrollment();
  } catch {
    throw publicFailure("connector-enrollment-load", gate);
  }

  let rawConnectorReceipt: unknown;
  try {
    rawConnectorReceipt = await dependencies.runConnector(
      {
        runId: privateClaim.runId,
        gate,
        keyEnrollment: connectorEnrollment,
        stageAuthorization: privateClaim.stageAuthorization,
        consumer: privateClaim.consumer,
      },
      outerGateCapability,
    );
  } catch (failure) {
    const typedFailure = captureTypedConnectorFailure(failure);
    if (typedFailure !== null) {
      throw publicFailure(
        "connector",
        gate,
        true,
        typedFailure.checkpointMayHavePersisted,
        typedFailure.phase,
        typedFailure.retryDisposition,
      );
    }
    // The invocation boundary was crossed. Unknown synchronous or asynchronous
    // failure cannot prove that no durable checkpoint mutation occurred.
    throw publicFailure("connector", gate, true, true);
  }

  let prefix100Anchor: Readonly<FloodgateV7Prefix100WorkScanAnchor> | null;
  try {
    prefix100Anchor = validateConnectorReceipt(
      rawConnectorReceipt,
      gate,
      privateClaim,
    );
  } catch {
    throw publicFailure("receipt", gate, true, true);
  }
  if (prefix100Anchor !== null) {
    try {
      validatePrefix100PostflightReceipt(
        await dependencies.scanPrefix100CallerAnchor(prefix100Anchor),
      );
    } catch {
      throw publicFailure("exact-prefix-100-postflight", gate, true, true);
    }
  }
  return buildReceipt(gate);
}

/** Dependency-injected seam. It never relaxes the gate-specific production exports. */
export function runFloodgateV7ProductionConnectorCoreForTests<
  TGate extends FloodgateV7ProductionConnectorRunnerGate,
>(
  gateValue: TGate,
  dependenciesValue: FloodgateV7ProductionConnectorRunnerDependenciesForTests,
): Promise<Readonly<FloodgateV7ProductionConnectorRunnerReceipt<TGate>>> {
  let gate: FloodgateV7ProductionConnectorRunnerGate;
  let dependencies: CapturedDependencies;
  try {
    gate = captureGate(gateValue);
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    const safeGate =
      gateValue === "durable-prefix-500" || gateValue === "sealed-final-24000"
        ? gateValue
        : "durable-prefix-100";
    return rejected(publicFailure("capture", safeGate));
  }
  return runCaptured(gate, dependencies) as Promise<
    Readonly<FloodgateV7ProductionConnectorRunnerReceipt<TGate>>
  >;
}

const PRODUCTION_DEPENDENCIES: CapturedDependencies = frozenRecord({
  loadRegistry: loadFloodgateV7ProductionConnectorRegistry,
  claimRegistry: (capability: unknown) =>
    claimFloodgateV7ProductionConnectorRegistry(
      capability as Parameters<
        typeof claimFloodgateV7ProductionConnectorRegistry
      >[0],
    ),
  loadApprovedEnrollment: loadFloodgateV7ApprovedKeyEnrollment,
  claimApprovedEnrollment: claimFloodgateV7ApprovedKeyEnrollment,
  verifyCurrentBinding: verifyFloodgateV7ApprovedKeyCurrentBinding,
  runConnector: (options, outerGateCapability) => {
    if (outerGateCapability === null) {
      throw new NativeError("outer gate connector capability missing");
    }
    return runFloodgateV7ProductionCheckpointConnector(
      options,
      outerGateCapability,
    );
  },
  scanPrefix100CallerAnchor: scanFloodgateV7Prefix100CallerAnchor,
});

async function runProductionGate<
  TGate extends FloodgateV7ProductionConnectorRunnerGate,
>(
  gate: TGate,
  outerOwner: () => Promise<unknown>,
): Promise<Readonly<FloodgateV7ProductionConnectorRunnerReceipt<TGate>>> {
  try {
    return validateOuterSuccess<
      Readonly<FloodgateV7ProductionConnectorRunnerReceipt<TGate>>
    >(await outerOwner());
  } catch (error) {
    if (error instanceof FloodgateV7ProductionConnectorRunnerError) {
      throw error;
    }
    const operationMayHaveRun = outerOperationMayHaveRun(error);
    throw publicFailure(
      "outer-gate-lock",
      gate,
      operationMayHaveRun,
      operationMayHaveRun,
    );
  }
}

/** Fixed capability-required operation loaded lazily by the outer owner. */
export function runFloodgateV7ProductionConnectorPrefix100UnderOuterGate(
  outerGateCapability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
): Promise<
  Readonly<FloodgateV7ProductionConnectorRunnerReceipt<"durable-prefix-100">>
> {
  if (arguments.length !== 1) {
    return rejected(publicFailure("capture", "durable-prefix-100"));
  }
  return runCaptured(
    "durable-prefix-100",
    PRODUCTION_DEPENDENCIES,
    outerGateCapability,
  );
}

/** Fixed capability-required operation loaded lazily by the outer owner. */
export function runFloodgateV7ProductionConnectorPrefix500UnderOuterGate(
  outerGateCapability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
): Promise<
  Readonly<FloodgateV7ProductionConnectorRunnerReceipt<"durable-prefix-500">>
> {
  if (arguments.length !== 1) {
    return rejected(publicFailure("capture", "durable-prefix-500"));
  }
  return runCaptured(
    "durable-prefix-500",
    PRODUCTION_DEPENDENCIES,
    outerGateCapability,
  );
}

/** Fixed capability-required operation loaded lazily by the outer owner. */
export function runFloodgateV7ProductionConnectorFinal24000UnderOuterGate(
  outerGateCapability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
): Promise<
  Readonly<FloodgateV7ProductionConnectorRunnerReceipt<"sealed-final-24000">>
> {
  if (arguments.length !== 1) {
    return rejected(publicFailure("capture", "sealed-final-24000"));
  }
  return runCaptured(
    "sealed-final-24000",
    PRODUCTION_DEPENDENCIES,
    outerGateCapability,
  );
}

/** Run only the fixed durable-prefix-100 production gate. */
export function runFloodgateV7ProductionConnectorPrefix100(): Promise<
  Readonly<FloodgateV7ProductionConnectorRunnerReceipt<"durable-prefix-100">>
> {
  if (arguments.length !== 0) {
    return rejected(publicFailure("capture", "durable-prefix-100"));
  }
  return runProductionGate(
    "durable-prefix-100",
    runFloodgateV7ProductionOuterGatePrefix100,
  );
}

/** Run only the fixed durable-prefix-500 production gate. */
export function runFloodgateV7ProductionConnectorPrefix500(): Promise<
  Readonly<FloodgateV7ProductionConnectorRunnerReceipt<"durable-prefix-500">>
> {
  if (arguments.length !== 0) {
    return rejected(publicFailure("capture", "durable-prefix-500"));
  }
  return runProductionGate(
    "durable-prefix-500",
    runFloodgateV7ProductionOuterGatePrefix500,
  );
}

/** Run only the fixed sealed-final-24000 production gate. */
export function runFloodgateV7ProductionConnectorFinal24000(): Promise<
  Readonly<FloodgateV7ProductionConnectorRunnerReceipt<"sealed-final-24000">>
> {
  if (arguments.length !== 0) {
    return rejected(publicFailure("capture", "sealed-final-24000"));
  }
  return runProductionGate(
    "sealed-final-24000",
    runFloodgateV7ProductionOuterGateFinal24000,
  );
}
