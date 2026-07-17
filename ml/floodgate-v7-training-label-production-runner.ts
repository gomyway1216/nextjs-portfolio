/**
 * Public production boundary for one purpose-bound training-label
 * finalization. The outer lease and private owner receipts are strictly
 * checked, then rebuilt without paths, identities, bindings, MACs, row data,
 * consumer-postflight digests, or raw nested receipts.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  claimFloodgateV7ProductionApplicationExecution,
  type FloodgateV7ProductionApplicationExecutionCapability,
} from "./floodgate-v7-production-application-source-authorization";
import { assertFloodgateV7ProductionApplicationEntrypointContext } from "./floodgate-v7-production-application-source-provenance";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
  runFloodgateV7ProductionOuterGateTrainingLabelFinalization,
} from "./floodgate-v7-production-outer-gate-lease";

export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CONTRACT =
  "shogi-floodgate-v7-training-label-production-runner-v2" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_STATUS =
  "application-source-bound-authenticated-training-label-artifacts-finalized-published-and-reverified-under-common-production-outer-gate" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CLAIM_BOUNDARY =
  "one-fixed-purpose-and-application-source-bound-production-training-label-finalization-without-path-run-key-identity-row-or-raw-receipt-disclosure-v2" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_EXECUTION_BOUNDARY =
  "production-fixed-purpose-and-application-source-bound-outer-gate-owner-and-sanitized-artifact-evidence" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_MUTATION_PURPOSE =
  "training-label-finalization-24000" as const;

export type FloodgateV7TrainingLabelProductionRunnerPhase =
  "capture" | "outer-gate" | "receipt";

export type FloodgateV7TrainingLabelProductionRunnerRetryDisposition =
  | "fresh-invocation-required"
  | "manual-publication-and-lease-reconciliation-required";

export interface FloodgateV7TrainingLabelProductionRunnerFileEvidence {
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateV7TrainingLabelProductionRunnerReceipt {
  readonly contract: typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CLAIM_BOUNDARY;
  readonly execution_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_EXECUTION_BOUNDARY;
  readonly mutation_purpose: typeof FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_MUTATION_PURPOSE;
  readonly output: Readonly<{
    readonly parents: 24_000;
    readonly training_records: number;
    readonly work: Readonly<FloodgateV7TrainingLabelProductionRunnerFileEvidence>;
    readonly train: Readonly<FloodgateV7TrainingLabelProductionRunnerFileEvidence>;
    readonly result: Readonly<FloodgateV7TrainingLabelProductionRunnerFileEvidence>;
    readonly manifest: Readonly<FloodgateV7TrainingLabelProductionRunnerFileEvidence>;
  }>;
  readonly verification: Readonly<{
    readonly owner_completed: true;
    readonly destination_content_reverified: true;
    readonly purpose_bound_outer_lease_removed_durably: true;
    readonly common_os_lock_released: true;
    readonly exact_clean_tracked_application_source_closure_validated_under_outer_gate: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly path_disclosed: false;
    readonly run_id_disclosed: false;
    readonly key_id_disclosed: false;
    readonly identity_disclosed: false;
    readonly mac_disclosed: false;
    readonly consumer_postflight_digest_disclosed: false;
    readonly raw_outer_receipt_disclosed: false;
    readonly raw_owner_receipt_disclosed: false;
    readonly raw_finalizer_receipt_disclosed: false;
    readonly row_or_position_content_disclosed: false;
    readonly application_source_revision_disclosed: false;
    readonly application_source_path_disclosed: false;
    readonly application_source_digest_disclosed: false;
    readonly ignored_untracked_dependency_bytes_verified: false;
    readonly same_uid_race_isolation: false;
    readonly atomic_source_snapshot: false;
    readonly teacher_truth: false;
    readonly optimizer_training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export class FloodgateV7TrainingLabelProductionRunnerError extends Error {
  readonly phase!: FloodgateV7TrainingLabelProductionRunnerPhase;
  readonly publication_may_have_occurred!: boolean;
  readonly lease_may_remain!: boolean;
  readonly cleanup_failure_count!: number | null;
  readonly retry_disposition!: FloodgateV7TrainingLabelProductionRunnerRetryDisposition;
  readonly raw_outer_receipt_disclosed!: false;
  readonly raw_owner_receipt_disclosed!: false;
  readonly raw_finalizer_receipt_disclosed!: false;

  constructor(
    phase: FloodgateV7TrainingLabelProductionRunnerPhase,
    publicationMayHaveOccurred: boolean,
    leaseMayRemain: boolean,
    cleanupFailureCount: number | null,
  ) {
    super("Floodgate v7 production training-label runner failed");
    const retryDisposition =
      publicationMayHaveOccurred || leaseMayRemain
        ? "manual-publication-and-lease-reconciliation-required"
        : "fresh-invocation-required";
    defineField(
      this,
      "name",
      "FloodgateV7TrainingLabelProductionRunnerError",
      false,
    );
    defineField(
      this,
      "stack",
      "FloodgateV7TrainingLabelProductionRunnerError: production training-label runner failed",
      false,
    );
    defineField(this, "phase", phase, true);
    defineField(
      this,
      "publication_may_have_occurred",
      publicationMayHaveOccurred,
      true,
    );
    defineField(this, "lease_may_remain", leaseMayRemain, true);
    defineField(this, "cleanup_failure_count", cleanupFailureCount, true);
    defineField(this, "retry_disposition", retryDisposition, true);
    defineField(this, "raw_outer_receipt_disclosed", false, true);
    defineField(this, "raw_owner_receipt_disclosed", false, true);
    defineField(this, "raw_finalizer_receipt_disclosed", false, true);
    objectFreeze(this);
  }
}

type OuterOperation = () => Promise<unknown>;

const NativeError = Error;
const NativePromise = Promise;
const nativeReflectApply = Reflect.apply;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nativeArrayIncludes = Array.prototype.includes;
const nativeRegExpExec = RegExp.prototype.exec;
const numberIsSafeInteger = Number.isSafeInteger;
const SHA256_RE = /^[0-9a-f]{64}$/;
const OUTER_RESULT_KEYS = objectFreeze(["value", "lease"] as const);
const OUTER_LEASE_KEYS = objectFreeze([
  "contract",
  "status",
  "algorithm",
  "execution_boundary",
  "mutation_purpose",
  "verification",
  "nonclaims",
] as const);
const OUTER_VERIFICATION_KEYS = objectFreeze([
  "application_source_binding_read_from_locked_registry",
  "exact_clean_tracked_application_source_closure_verified_before_persistent_mutation",
  "registry_anchor_revalidated_after_source_verification_before_persistent_mutation",
  "one_os_lifetime_lock_shared_by_all_four_mutation_purposes",
  "os_lifetime_lock_held_before_operation",
  "authenticated_purpose_bound_lease_metadata_durable_before_operation",
  "signal_and_exit_preserve_stale_evidence",
  "authenticated_lease_removed_durably_after_operation",
  "authenticated_purpose_bound_retired_evidence_durable_after_operation",
  "os_lifetime_lock_released_after_operation",
  "quarantine_empty_after_operation",
] as const);
const OUTER_NONCLAIM_KEYS = objectFreeze([
  "application_source_revision_disclosed",
  "application_source_path_disclosed",
  "application_source_digest_disclosed",
  "ignored_untracked_dependency_bytes_verified",
  "same_uid_race_isolation",
  "atomic_source_snapshot",
  "lock_or_lease_path_disclosed",
  "private_lease_metadata_disclosed",
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
const OWNER_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "verification",
  "lifecycle",
  "output",
  "nonclaims",
] as const);
const OWNER_VERIFICATION_KEYS = objectFreeze([
  "outer_gate_capability_claimed_synchronously",
  "registry_and_approved_enrollment_claimed_once",
  "registry_to_approved_binding_exact_match",
  "approved_binding_freshly_current",
  "stage_authorized_under_outer_gate",
  "held_stage_and_work_unkeyed_preflight",
  "canonical_v3_header_shape_verified",
  "composer_invoked_inside_fresh_training_callback",
  "scanner_backed_plan_minted",
  "consumer_postflight_completed",
  "finalizer_completed_and_destination_reverified",
] as const);
const OWNER_LIFECYCLE_KEYS = objectFreeze([
  "initial_stage_prefix",
  "lease_before_composer",
  "lease_after_composer_invocation",
  "plan_after_consumer_failure",
  "plan_after_finalizer_invocation",
] as const);
const OWNER_OUTPUT_KEYS = objectFreeze([
  "work",
  "train",
  "result",
  "manifest",
  "parents",
  "training_records",
  "consumer_postflight_sha256",
] as const);
const OWNER_FILE_EVIDENCE_KEYS = objectFreeze(["bytes", "sha256"] as const);
const OWNER_NONCLAIM_KEYS = objectFreeze([
  "absolute_or_caller_path",
  "run_id",
  "key_id_or_instance",
  "key_material_or_hash",
  "authorization_or_content_mac",
  "run_binding_or_header_candidate",
  "row_or_position_content",
  "optimizer_training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);
const OWNER_EXECUTION_BOUNDARY =
  "production-fixed-outer-gate-registry-key-stage-training-composer-and-finalizer" as const;
// Keep these literals local: importing the owner merely for constants would
// eagerly load its private production dependency graph before the outer gate
// has acquired its OS lock and published the purpose-bound lease.
const OWNER_CONTRACT =
  "shogi-floodgate-v7-training-label-production-owner-v1" as const;
const OWNER_STATUS =
  "outer-gate-owned-sealed-work-training-label-finalization-complete" as const;
const OWNER_CLAIM_BOUNDARY =
  "purpose-specific-common-outer-gate-capability-private-registry-approved-current-key-held-stage-unkeyed-header-preflight-fresh-training-callback-scanner-backed-plan-and-terminal-finalizer-without-public-path-binding-row-key-mac-training-weight-live-or-strength-authority-v1" as const;

function defineField(
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

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("training-label runner record differs");
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

function dataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("training-label runner value is not a record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new NativeError("training-label runner record key count differs");
  }
  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      !nativeReflectApply(nativeArrayIncludes, keys, [key])
    ) {
      throw new NativeError("training-label runner record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("training-label runner record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function requireBooleanRecord(
  value: unknown,
  keys: readonly string[],
  expected: boolean,
): Record<string, unknown> {
  const record = dataRecord(value, keys);
  for (const key of keys) {
    if (record[key] !== expected) {
      throw new NativeError("training-label runner boolean record differs");
    }
  }
  return record;
}

function validSha256(value: unknown): value is string {
  return (
    typeof value === "string" &&
    nativeReflectApply(nativeRegExpExec, SHA256_RE, [value]) !== null
  );
}

function captureNonnegativeInteger(value: unknown): number {
  if (!numberIsSafeInteger(value) || (value as number) < 0) {
    throw new NativeError("training-label runner count differs");
  }
  return value as number;
}

function captureFileEvidence(
  value: unknown,
): Readonly<FloodgateV7TrainingLabelProductionRunnerFileEvidence> {
  const evidence = dataRecord(value, OWNER_FILE_EVIDENCE_KEYS);
  const bytes = captureNonnegativeInteger(evidence.bytes);
  if (bytes < 1 || !validSha256(evidence.sha256)) {
    throw new NativeError("training-label runner digest differs");
  }
  return frozenRecord({ bytes, sha256: evidence.sha256 });
}

function requireOuterLease(value: unknown): void {
  const lease = dataRecord(value, OUTER_LEASE_KEYS);
  if (
    lease.contract !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT ||
    lease.status !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS ||
    lease.algorithm !== FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM ||
    lease.execution_boundary !==
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY ||
    lease.mutation_purpose !==
      FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_MUTATION_PURPOSE
  ) {
    throw new NativeError("training-label runner outer lease differs");
  }
  requireBooleanRecord(lease.verification, OUTER_VERIFICATION_KEYS, true);
  requireBooleanRecord(lease.nonclaims, OUTER_NONCLAIM_KEYS, false);
}

function captureOwnerOutput(
  value: unknown,
): FloodgateV7TrainingLabelProductionRunnerReceipt["output"] {
  const output = dataRecord(value, OWNER_OUTPUT_KEYS);
  const parents = captureNonnegativeInteger(output.parents);
  const trainingRecords = captureNonnegativeInteger(output.training_records);
  if (parents !== 24_000 || !validSha256(output.consumer_postflight_sha256)) {
    throw new NativeError("training-label runner owner output differs");
  }
  return frozenRecord({
    parents: 24_000 as const,
    training_records: trainingRecords,
    work: captureFileEvidence(output.work),
    train: captureFileEvidence(output.train),
    result: captureFileEvidence(output.result),
    manifest: captureFileEvidence(output.manifest),
  });
}

function captureOwnerReceipt(
  value: unknown,
): FloodgateV7TrainingLabelProductionRunnerReceipt["output"] {
  const owner = dataRecord(value, OWNER_RECEIPT_KEYS);
  if (
    owner.contract !== OWNER_CONTRACT ||
    owner.status !== OWNER_STATUS ||
    owner.claim_boundary !== OWNER_CLAIM_BOUNDARY ||
    owner.execution_boundary !== OWNER_EXECUTION_BOUNDARY
  ) {
    throw new NativeError("training-label runner owner receipt differs");
  }
  requireBooleanRecord(owner.verification, OWNER_VERIFICATION_KEYS, true);
  const lifecycle = dataRecord(owner.lifecycle, OWNER_LIFECYCLE_KEYS);
  if (
    (lifecycle.initial_stage_prefix !== "work-only" &&
      lifecycle.initial_stage_prefix !== "work-train" &&
      lifecycle.initial_stage_prefix !== "work-train-result" &&
      lifecycle.initial_stage_prefix !== "work-train-result-manifest") ||
    lifecycle.lease_before_composer !== "owner-closes-on-failure" ||
    lifecycle.lease_after_composer_invocation !== "composer-or-plan-owns" ||
    lifecycle.plan_after_consumer_failure !== "owner-discards-before-return" ||
    lifecycle.plan_after_finalizer_invocation !==
      "finalizer-owns-no-double-cleanup"
  ) {
    throw new NativeError("training-label runner owner lifecycle differs");
  }
  requireBooleanRecord(owner.nonclaims, OWNER_NONCLAIM_KEYS, false);
  return captureOwnerOutput(owner.output);
}

function sanitizedSuccess(
  value: unknown,
): Readonly<FloodgateV7TrainingLabelProductionRunnerReceipt> {
  const result = dataRecord(value, OUTER_RESULT_KEYS);
  requireOuterLease(result.lease);
  const output = captureOwnerReceipt(result.value);
  return frozenRecord({
    contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_STATUS,
    claim_boundary:
      FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CLAIM_BOUNDARY,
    execution_boundary:
      FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_EXECUTION_BOUNDARY,
    mutation_purpose:
      FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_MUTATION_PURPOSE,
    output,
    verification: frozenRecord({
      owner_completed: true as const,
      destination_content_reverified: true as const,
      purpose_bound_outer_lease_removed_durably: true as const,
      common_os_lock_released: true as const,
      exact_clean_tracked_application_source_closure_validated_under_outer_gate:
        true as const,
    }),
    nonclaims: frozenRecord({
      path_disclosed: false as const,
      run_id_disclosed: false as const,
      key_id_disclosed: false as const,
      identity_disclosed: false as const,
      mac_disclosed: false as const,
      consumer_postflight_digest_disclosed: false as const,
      raw_outer_receipt_disclosed: false as const,
      raw_owner_receipt_disclosed: false as const,
      raw_finalizer_receipt_disclosed: false as const,
      row_or_position_content_disclosed: false as const,
      application_source_revision_disclosed: false as const,
      application_source_path_disclosed: false as const,
      application_source_digest_disclosed: false as const,
      ignored_untracked_dependency_bytes_verified: false as const,
      same_uid_race_isolation: false as const,
      atomic_source_snapshot: false as const,
      teacher_truth: false as const,
      optimizer_training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function captureOuterOperation(value: unknown): OuterOperation {
  if (typeof value !== "function" || nodeIsProxy(value)) {
    throw new NativeError("training-label runner outer operation differs");
  }
  return value as OuterOperation;
}

async function runCapturedOuterOperation(
  operation: OuterOperation,
): Promise<Readonly<FloodgateV7TrainingLabelProductionRunnerReceipt>> {
  let rawOuterResult: unknown;
  try {
    rawOuterResult = await nativeReflectApply(operation, undefined, []);
  } catch {
    // Once the outer operation was invoked, its private owner may have crossed
    // publication and its cleanup may also be indeterminate. Never project an
    // unknown failure as safe to retry.
    throw new FloodgateV7TrainingLabelProductionRunnerError(
      "outer-gate",
      true,
      true,
      null,
    );
  }
  try {
    return sanitizedSuccess(rawOuterResult);
  } catch {
    // A malformed success arrives only after the same mutation boundary. It
    // therefore receives the same conservative publication and lease facets.
    throw new FloodgateV7TrainingLabelProductionRunnerError(
      "receipt",
      true,
      true,
      null,
    );
  }
}

/** Test-only zero-argument outer-operation seam. */
export function runFloodgateV7TrainingLabelProductionRunnerCoreForTests(
  outerOperationValue: () => Promise<unknown>,
): Promise<Readonly<FloodgateV7TrainingLabelProductionRunnerReceipt>> {
  let operation: OuterOperation;
  try {
    if (arguments.length !== 1) {
      throw new NativeError(
        "test production training-label runner accepts one argument",
      );
    }
    operation = captureOuterOperation(outerOperationValue);
  } catch {
    return NativePromise.reject(
      new FloodgateV7TrainingLabelProductionRunnerError(
        "capture",
        false,
        false,
        0,
      ),
    );
  }
  return runCapturedOuterOperation(operation);
}

/** Fixed production runner. Its sole input is the verified source capability. */
export function runFloodgateV7TrainingLabelProduction(
  applicationExecutionCapability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
): Promise<Readonly<FloodgateV7TrainingLabelProductionRunnerReceipt>> {
  try {
    assertFloodgateV7ProductionApplicationEntrypointContext(
      "ml/run-floodgate-v7-training-label-production.ts",
    );
  } catch {
    return NativePromise.reject(
      new FloodgateV7TrainingLabelProductionRunnerError(
        "capture",
        false,
        false,
        0,
      ),
    );
  }
  if (arguments.length !== 1) {
    return NativePromise.reject(
      new FloodgateV7TrainingLabelProductionRunnerError(
        "capture",
        false,
        false,
        0,
      ),
    );
  }
  try {
    claimFloodgateV7ProductionApplicationExecution(
      applicationExecutionCapability,
      "training-label-finalization-24000",
      "runner-entry",
    );
  } catch {
    return NativePromise.reject(
      new FloodgateV7TrainingLabelProductionRunnerError(
        "capture",
        false,
        false,
        0,
      ),
    );
  }
  return runCapturedOuterOperation(() =>
    runFloodgateV7ProductionOuterGateTrainingLabelFinalization(
      applicationExecutionCapability,
    ),
  );
}
