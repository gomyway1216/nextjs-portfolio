/**
 * Trusted composition boundary for one production Floodgate v7 checkpoint gate.
 *
 * The public production entry point accepts metadata and paths only. It owns
 * the exact coordinator handoff, active stage lease, opaque deployment-key
 * capability, authenticated training callback, V3 sink, postflight claim, and
 * all terminal cleanup. It never exposes rows, capabilities, key bytes, or
 * executable callbacks in its result or public error.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  discardFloodgateV7DeploymentTeacherCheckpointV3Key,
  prepareFloodgateV7DeploymentTeacherCheckpointV3Key,
  type FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization,
  type FloodgateV7DeploymentTeacherCheckpointV3KeyRequest,
  type FloodgateV7DeploymentTeacherRunBinding,
} from "./floodgate-v7-deployment-key-authority";
import {
  inspectFloodgateV7DeploymentKeyReadiness,
  type FloodgateV7DeploymentKeyReadinessReceipt,
  type FloodgateV7DeploymentKeyReadinessStatus,
} from "./floodgate-v7-deployment-key-readiness";
import {
  authorizeFloodgateTeacherStage,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStageLease,
} from "./floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  claimVerifiedFloodgateTrainingConsumerPostflight,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingInputBinding,
  type FloodgateTrainingRowConsumerOptions,
} from "./floodgate-training-row-consumer";
import {
  claimFloodgateV7ProductionParentCoordinatorForCheckpoint,
  createFloodgateV7ProductionParentCoordinator,
  type FloodgateV7ProductionParentCoordinator,
  type FloodgateV7ProductionParentCoordinatorCheckpointHandoff,
} from "./floodgate-v7-production-parent-coordinator";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  checkpointFloodgateV7TeacherParentsV3,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TeacherCheckpointV3Gate,
  type FloodgateV7TeacherCheckpointV3Options,
  type FloodgateV7TeacherCheckpointV3Receipt,
  type FloodgateV7TeacherProducerController,
} from "./floodgate-v7-teacher-checkpoint";

export const FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT =
  "shogi-floodgate-v7-production-checkpoint-connector-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS =
  "checkpoint-gate-and-training-postflight-complete-all-capabilities-closed" as const;
export const FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY =
  "exact-production-coordinator-stage-key-training-callback-v3-checkpoint-postflight-and-all-settled-cleanup-no-key-row-path-function-label-training-weight-live-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY =
  "trusted-current-process-js-realm-and-imported-production-capability-owners-v1" as const;

export type FloodgateV7ProductionCheckpointConnectorExecutionBoundary =
  | "production-fixed-capability-composition"
  | "test-only-injected-capability-composition";

export type FloodgateV7ProductionCheckpointConnectorPhase =
  | "capture"
  | "readiness"
  | "coordinator-stage"
  | "handoff"
  | "key-prepare"
  | "key-instance"
  | "consumer"
  | "checkpoint"
  | "postflight"
  | "cleanup"
  | "receipt";

export type FloodgateV7ProductionCheckpointConnectorRetryDisposition =
  | "provision-required"
  | "operator-reconciliation-required"
  | "checkpoint-reconciliation-required"
  | "fresh-invocation-required";

export interface FloodgateV7ProductionCheckpointConnectorOptions {
  readonly runId: string;
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
  readonly expectedKeyInstanceId: string;
  readonly stageAuthorization: FloodgateTeacherStageAuthorizationOptions;
  readonly consumer: FloodgateTrainingRowConsumerOptions;
}

export interface FloodgateV7ProductionCheckpointConnectorReceipt<
  TBoundary extends FloodgateV7ProductionCheckpointConnectorExecutionBoundary =
    FloodgateV7ProductionCheckpointConnectorExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly test_boundary: Readonly<{
    readonly production_coordinator_origin: false;
    readonly production_stage_origin: false;
    readonly production_key_origin: false;
    readonly production_input_origin: false;
    readonly production_checkpoint_origin: false;
  }> | null;
  readonly run_id: string;
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
  readonly key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly key_instance_id: string;
  readonly run_binding: Readonly<{
    readonly schema: string;
    readonly plan: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly producer_control: Readonly<{
      readonly schema: string;
      readonly parent_deadline_ms: number;
      readonly abort_drain_ms: number;
      readonly max_in_flight: number;
      readonly cancel_policy: string;
      readonly late_settlement_policy: string;
    }>;
    readonly stable_runtime_receipt_sha256: string;
    readonly teacher_usi_runtime_receipt_sha256: string;
  }>;
  readonly input_binding: Readonly<{
    readonly result_receipt_bytes: number;
    readonly result_receipt_sha256: string;
    readonly bundle_manifest_bytes: number;
    readonly bundle_manifest_sha256: string;
    readonly bundle_producer_revision: string;
    readonly verifier_revision: string;
    readonly raw_format: string;
    readonly raw_bytes: number;
    readonly raw_sha256: string;
    readonly records: number;
    readonly games: number;
    readonly game_ids_sha256: string;
    readonly parent_ids_sha256: string;
    readonly position_ids_count: number;
    readonly position_ids_sha256: string;
  }>;
  readonly checkpoint: Readonly<{
    readonly contract: string;
    readonly status: string;
    readonly claim_boundary: string;
    readonly algorithm: string;
    readonly gate_contract: Readonly<{
      readonly schema: string;
      readonly durable_prefix_100_parents: 100;
      readonly durable_prefix_500_parents: 500;
      readonly sealed_final_parents: 24_000;
    }>;
    readonly sealed: boolean;
    readonly work: Readonly<{
      readonly format: string;
      readonly training_parents: 24_000;
      readonly records: number;
      readonly bytes: number;
      readonly sha256: string;
      readonly target_parents: number;
      readonly completed_parents: number;
      readonly resumed_parents: number;
      readonly durability: string;
    }>;
  }>;
  readonly lifecycle: Readonly<{
    readonly readiness_metadata_passed: true;
    readonly authoritative_key_reopen_and_revalidation_succeeded: true;
    readonly exact_input_claimed_synchronously: true;
    readonly checkpoint_settled_before_postflight: true;
    readonly postflight_claimed_once: true;
    readonly key_cleanup_settled: true;
    readonly lease_close_joined: true;
    readonly coordinator_closed: true;
  }>;
  readonly holdout_boundary: Readonly<{
    readonly callback_role: "training";
    readonly callback_parents: 24_000;
    readonly labeled_selection_read: false;
    readonly labeled_final_holdout_read: false;
    readonly label_free_selection_and_final_role_artifacts_may_be_verified: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly key_bytes_or_key_hash: false;
    readonly authorization_mac: false;
    readonly absolute_or_caller_path: false;
    readonly row_or_position_content: false;
    readonly executable_capability: false;
    readonly teacher_label: false;
    readonly optimizer_training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export class FloodgateV7ProductionCheckpointConnectorError extends Error {
  readonly phase!: FloodgateV7ProductionCheckpointConnectorPhase;
  readonly readiness_status!: FloodgateV7DeploymentKeyReadinessStatus | null;
  readonly checkpoint_may_have_persisted!: boolean;
  readonly cleanup_failure_count!: number;
  readonly retry_disposition!: FloodgateV7ProductionCheckpointConnectorRetryDisposition;

  constructor(
    phase: FloodgateV7ProductionCheckpointConnectorPhase,
    readinessStatus: FloodgateV7DeploymentKeyReadinessStatus | null,
    checkpointMayHavePersisted: boolean,
    cleanupFailureCount: number,
  ) {
    super(
      `Floodgate v7 production checkpoint connector failed during ${phase}`,
    );
    const name = "FloodgateV7ProductionCheckpointConnectorError";
    const retryDisposition = checkpointMayHavePersisted
      ? "checkpoint-reconciliation-required"
      : readinessStatus === "not-provisioned"
        ? "provision-required"
        : readinessStatus === "unsafe" ||
            cleanupFailureCount > 0 ||
            phase === "coordinator-stage" ||
            phase === "key-prepare" ||
            phase === "key-instance"
          ? "operator-reconciliation-required"
          : "fresh-invocation-required";
    defineErrorField(this, "name", name, false);
    defineErrorField(this, "stack", `${name}: ${this.message}`, false);
    defineErrorField(this, "phase", phase, true);
    defineErrorField(this, "readiness_status", readinessStatus, true);
    defineErrorField(
      this,
      "checkpoint_may_have_persisted",
      checkpointMayHavePersisted,
      true,
    );
    defineErrorField(this, "cleanup_failure_count", cleanupFailureCount, true);
    defineErrorField(this, "retry_disposition", retryDisposition, true);
    objectFreeze(this);
  }
}

type AnyKeyAuthorization =
  Readonly<FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization>;

export interface FloodgateV7ProductionCheckpointConnectorFailureEvidence {
  readonly phase: FloodgateV7ProductionCheckpointConnectorPhase;
  readonly primary: unknown;
  readonly cleanupFailures: readonly unknown[];
  readonly checkpointMayHavePersisted: boolean;
}

export interface FloodgateV7ProductionCheckpointConnectorCoreDependencies<
  TAuthorization extends AnyKeyAuthorization = AnyKeyAuthorization,
> {
  readonly inspectKeyReadiness: () => Promise<
    Readonly<FloodgateV7DeploymentKeyReadinessReceipt>
  >;
  readonly createCoordinator: () => Promise<FloodgateV7ProductionParentCoordinator>;
  readonly claimCoordinatorHandoff: (
    coordinator: FloodgateV7ProductionParentCoordinator,
  ) => Readonly<FloodgateV7ProductionParentCoordinatorCheckpointHandoff>;
  readonly authorizeStage: (
    options: FloodgateTeacherStageAuthorizationOptions,
  ) => Promise<Readonly<FloodgateTeacherStageLease>>;
  readonly prepareKey: (
    request: FloodgateV7DeploymentTeacherCheckpointV3KeyRequest,
  ) => Promise<TAuthorization>;
  readonly discardKey: (authorization: TAuthorization) => void;
  readonly consumeRowsAndPostflight: (
    options: FloodgateTrainingRowConsumerOptions,
    consume: (
      input: Readonly<AuthenticatedFloodgateTrainingRows>,
    ) => Promise<void>,
  ) => Promise<Readonly<FloodgateTrainingConsumerPostflightReceipt>>;
  readonly claimPostflight: (
    receipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  ) => void;
  readonly checkpoint: (
    lease: Readonly<FloodgateTeacherStageLease>,
    rows: Readonly<AuthenticatedFloodgateTrainingRows>,
    runBinding: FloodgateV7TeacherCheckpointRunBinding,
    controller: FloodgateV7TeacherProducerController,
    options: FloodgateV7TeacherCheckpointV3Options,
    authorization: TAuthorization,
  ) => Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>>;
  readonly observeFailureForTests:
    | ((
        evidence: Readonly<FloodgateV7ProductionCheckpointConnectorFailureEvidence>,
      ) => void)
    | undefined;
}

const NativePromise = Promise;
const NativeError = Error;
const NativeWeakSet = WeakSet;
const nativePromisePrototype = Promise.prototype;
const nativePromiseThen = Promise.prototype.then;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetHas = WeakSet.prototype.has;
const nativeRegExpExec = RegExp.prototype.exec;
const nativeStringIncludes = String.prototype.includes;
const nativeReflectApply = Reflect.apply;
const nativeArrayIsArray = Array.isArray;
const arrayPrototype = Array.prototype;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIsFrozen = Object.isFrozen;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nodeIsPromise = nodeUtilTypes.isPromise.bind(nodeUtilTypes);
const numberIsSafeInteger = Number.isSafeInteger;
const promiseSpeciesSymbol = Symbol.species;
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const KEY_INSTANCE_RE = /^[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const ABSOLUTE_PATH_RE = /^\/(?:[^/]+(?:\/[^/]+)*)?$/;
const DOT_PATH_SEGMENT_RE = /(?:^|\/)\.{1,2}(?:\/|$)/;
const MAX_STRING_CODE_UNITS = 4_096;
const FIXED_PLAN_BYTES: FloodgateV7TeacherCheckpointRunBinding["plan"]["bytes"] = 10_890;
const FIXED_PLAN_SHA256: FloodgateV7TeacherCheckpointRunBinding["plan"]["sha256"] =
  "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af";
const FIXED_RAW_PARENT_FORMAT: FloodgateTrainingInputBinding["raw_format"] =
  "shogi-floodgate-label-free-raw-parent-jsonl-v1";
const OPTION_KEYS = objectFreeze([
  "consumer",
  "expectedKeyInstanceId",
  "gate",
  "runId",
  "stageAuthorization",
] as const);
const CONSUMER_KEYS = objectFreeze([
  "legacyProtectedPositionIdsPath",
  "outputRoot",
  "rawLockRoot",
  "repositoryRoot",
  "roleLockRoot",
  "verifierRevision",
] as const);
const STAGE_REQUIRED_KEYS = objectFreeze([
  "destinationBasename",
  "engineArgs",
  "engineBin",
  "engineReceipt",
  "legacyProtectedPositionIdsPath",
  "publicationParent",
  "rawLockRoot",
  "repositoryRoot",
  "roleBundleRoot",
  "roleLockRoot",
  "stageBasename",
] as const);
const STAGE_KEYS_WITH_EVAL = objectFreeze([
  ...STAGE_REQUIRED_KEYS,
  "evalDir",
] as const);
const DEPENDENCY_KEYS = objectFreeze([
  "authorizeStage",
  "checkpoint",
  "claimCoordinatorHandoff",
  "claimPostflight",
  "consumeRowsAndPostflight",
  "createCoordinator",
  "discardKey",
  "inspectKeyReadiness",
  "observeFailureForTests",
  "prepareKey",
] as const);
const pinnedPromiseConstructorHolder = objectCreate(null) as object;
objectDefineProperty(pinnedPromiseConstructorHolder, promiseSpeciesSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: NativePromise,
});
objectFreeze(pinnedPromiseConstructorHolder);
const connectorPinnedPromises = new NativeWeakSet<object>();

function descriptorAt(
  descriptors: Record<string, PropertyDescriptor>,
  key: string,
): PropertyDescriptor | undefined {
  if (!objectHasOwn(descriptors, key)) return undefined;
  const mapEntry = objectGetOwnPropertyDescriptor(descriptors, key);
  if (mapEntry === undefined || !objectHasOwn(mapEntry, "value")) {
    throw new NativeError("descriptor map entry is not an own data property");
  }
  return mapEntry.value as PropertyDescriptor;
}

function isEnumerableDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { readonly value: unknown } {
  return (
    descriptor !== undefined &&
    objectHasOwn(descriptor, "value") &&
    objectHasOwn(descriptor, "enumerable") &&
    descriptor.enumerable === true
  );
}

function defineErrorField(
  error: Error,
  key: string,
  value: unknown,
  enumerable: boolean,
): void {
  objectDefineProperty(error, key, {
    configurable: false,
    enumerable,
    writable: false,
    value,
  });
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = objectKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptorAt(descriptors, key);
    if (descriptor === undefined || !objectHasOwn(descriptor, "value")) {
      throw new NativeError("connector record requires data properties");
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

function publicFailure(
  phase: FloodgateV7ProductionCheckpointConnectorPhase,
  readinessStatus: FloodgateV7DeploymentKeyReadinessStatus | null = null,
  checkpointMayHavePersisted = false,
  cleanupFailureCount = 0,
): FloodgateV7ProductionCheckpointConnectorError {
  return new FloodgateV7ProductionCheckpointConnectorError(
    phase,
    readinessStatus,
    checkpointMayHavePersisted,
    cleanupFailureCount,
  );
}

function rejected<T>(error: unknown): Promise<T> {
  return pinPromiseForObservation(
    new NativePromise<T>((_resolve, reject) => reject(error)),
  );
}

function matches(expression: RegExp, value: string): boolean {
  return nativeReflectApply(nativeRegExpExec, expression, [value]) !== null;
}

function append(values: unknown[], value: unknown): void {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function frozenCopy(values: readonly unknown[]): readonly unknown[] {
  const output: unknown[] = [];
  for (let index = 0; index < values.length; index += 1) {
    append(output, values[index]);
  }
  return objectFreeze(output);
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || nodeIsProxy(value)) {
    throw new NativeError(`${label} must be an exact non-Proxy plain object`);
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== objectPrototype && prototype !== null) {
    throw new NativeError(`${label} must be an exact non-Proxy plain object`);
  }
  return value as Record<string, unknown>;
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = plainRecord(value, label);
  const descriptors = objectGetOwnPropertyDescriptors(record);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expectedKeys.length) {
    throw new NativeError(`${label} has unexpected keys`);
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") {
      throw new NativeError(`${label} rejects symbol keys`);
    }
    const descriptor = descriptorAt(descriptors, key);
    if (!isEnumerableDataDescriptor(descriptor)) {
      throw new NativeError(`${label} requires enumerable data properties`);
    }
  }
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (descriptorAt(descriptors, key) === undefined) {
      throw new NativeError(`${label} is missing ${key}`);
    }
  }
  return record;
}

function requiredString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_STRING_CODE_UNITS ||
    nativeReflectApply(nativeStringIncludes, value, ["\0"])
  ) {
    throw new NativeError(`${label} must be a bounded nonempty string`);
  }
  return value;
}

function requiredAbsolutePath(value: unknown, label: string): string {
  const captured = requiredString(value, label);
  if (
    !matches(ABSOLUTE_PATH_RE, captured) ||
    matches(DOT_PATH_SEGMENT_RE, captured)
  ) {
    throw new NativeError(`${label} must be a canonical absolute path`);
  }
  return captured;
}

function safeDataDescriptors(
  value: unknown,
  label: string,
): Record<string, PropertyDescriptor> {
  const record = plainRecord(value, label);
  const descriptors = objectGetOwnPropertyDescriptors(record);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length > 128) {
    throw new NativeError(`${label} has too many properties`);
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") {
      throw new NativeError(`${label} rejects symbol keys`);
    }
  }
  return descriptors;
}

function ownDataValue(
  descriptors: Record<string, PropertyDescriptor>,
  key: string,
  label: string,
): unknown {
  const descriptor = descriptorAt(descriptors, key);
  if (!isEnumerableDataDescriptor(descriptor)) {
    throw new NativeError(`${label} is missing ${key}`);
  }
  return descriptor.value;
}

function requiredHex(
  value: unknown,
  expression: RegExp,
  label: string,
): string {
  const captured = requiredString(value, label);
  if (!matches(expression, captured)) {
    throw new NativeError(`${label} is not canonical lowercase hex`);
  }
  return captured;
}

function requiredSafeInteger(
  value: unknown,
  label: string,
  minimum = 0,
): number {
  if (
    typeof value !== "number" ||
    !numberIsSafeInteger(value) ||
    value < minimum
  ) {
    throw new NativeError(`${label} must be a bounded safe integer`);
  }
  return value;
}

function requiredFunction<TFunction extends (...args: never[]) => unknown>(
  value: unknown,
  label: string,
): TFunction {
  if (typeof value !== "function" || nodeIsProxy(value)) {
    throw new NativeError(`${label} must be a non-Proxy function`);
  }
  return value as TFunction;
}

function captureStringArray(value: unknown, label: string): readonly string[] {
  if (
    !nativeArrayIsArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== arrayPrototype
  ) {
    throw new NativeError(`${label} must be an exact non-Proxy array`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length !== value.length + 1 ||
    descriptorAt(descriptors, "length") === undefined
  ) {
    throw new NativeError(`${label} must be a dense array`);
  }
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptorAt(descriptors, String(index));
    if (!isEnumerableDataDescriptor(descriptor)) {
      throw new NativeError(`${label} must contain enumerable data entries`);
    }
    objectDefineProperty(output, index, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: requiredString(descriptor.value, `${label}[${index}]`),
    });
  }
  return objectFreeze(output);
}

function captureOptions(
  value: FloodgateV7ProductionCheckpointConnectorOptions,
): Readonly<FloodgateV7ProductionCheckpointConnectorOptions> {
  const candidate = exactDataRecord(value, OPTION_KEYS, "connector options");
  const runId = requiredString(candidate.runId, "options.runId");
  if (!matches(RUN_ID_RE, runId)) {
    throw new NativeError("options.runId must be lowercase 32-byte hex");
  }
  const expectedKeyInstanceId = requiredString(
    candidate.expectedKeyInstanceId,
    "options.expectedKeyInstanceId",
  );
  if (!matches(KEY_INSTANCE_RE, expectedKeyInstanceId)) {
    throw new NativeError(
      "options.expectedKeyInstanceId must be lowercase 32-byte hex",
    );
  }
  const gate = candidate.gate;
  if (
    gate !== "durable-prefix-100" &&
    gate !== "durable-prefix-500" &&
    gate !== "sealed-final-24000"
  ) {
    throw new NativeError("options.gate is not a fixed V3 gate");
  }
  const consumerCandidate = exactDataRecord(
    candidate.consumer,
    CONSUMER_KEYS,
    "options.consumer",
  );
  const consumer = frozenRecord({
    repositoryRoot: requiredAbsolutePath(
      consumerCandidate.repositoryRoot,
      "consumer.repositoryRoot",
    ),
    verifierRevision: requiredString(
      consumerCandidate.verifierRevision,
      "consumer.verifierRevision",
    ),
    rawLockRoot: requiredAbsolutePath(
      consumerCandidate.rawLockRoot,
      "consumer.rawLockRoot",
    ),
    roleLockRoot: requiredAbsolutePath(
      consumerCandidate.roleLockRoot,
      "consumer.roleLockRoot",
    ),
    legacyProtectedPositionIdsPath: requiredAbsolutePath(
      consumerCandidate.legacyProtectedPositionIdsPath,
      "consumer.legacyProtectedPositionIdsPath",
    ),
    outputRoot: requiredAbsolutePath(
      consumerCandidate.outputRoot,
      "consumer.outputRoot",
    ),
  });
  if (!matches(REVISION_RE, consumer.verifierRevision)) {
    throw new NativeError(
      "consumer.verifierRevision must be lowercase Git hex",
    );
  }
  const stageValue = plainRecord(
    candidate.stageAuthorization,
    "options.stageAuthorization",
  );
  const stageHasEval =
    descriptorAt(objectGetOwnPropertyDescriptors(stageValue), "evalDir") !==
    undefined;
  const stageCandidate = exactDataRecord(
    stageValue,
    stageHasEval ? STAGE_KEYS_WITH_EVAL : STAGE_REQUIRED_KEYS,
    "options.stageAuthorization",
  );
  const capturedStageBase = {
    repositoryRoot: requiredAbsolutePath(
      stageCandidate.repositoryRoot,
      "stageAuthorization.repositoryRoot",
    ),
    rawLockRoot: requiredAbsolutePath(
      stageCandidate.rawLockRoot,
      "stageAuthorization.rawLockRoot",
    ),
    roleLockRoot: requiredAbsolutePath(
      stageCandidate.roleLockRoot,
      "stageAuthorization.roleLockRoot",
    ),
    roleBundleRoot: requiredAbsolutePath(
      stageCandidate.roleBundleRoot,
      "stageAuthorization.roleBundleRoot",
    ),
    legacyProtectedPositionIdsPath: requiredAbsolutePath(
      stageCandidate.legacyProtectedPositionIdsPath,
      "stageAuthorization.legacyProtectedPositionIdsPath",
    ),
    publicationParent: requiredAbsolutePath(
      stageCandidate.publicationParent,
      "stageAuthorization.publicationParent",
    ),
    stageBasename: requiredString(
      stageCandidate.stageBasename,
      "stageAuthorization.stageBasename",
    ),
    destinationBasename: requiredString(
      stageCandidate.destinationBasename,
      "stageAuthorization.destinationBasename",
    ),
    engineBin: requiredAbsolutePath(
      stageCandidate.engineBin,
      "stageAuthorization.engineBin",
    ),
    engineReceipt: requiredAbsolutePath(
      stageCandidate.engineReceipt,
      "stageAuthorization.engineReceipt",
    ),
    engineArgs: captureStringArray(
      stageCandidate.engineArgs,
      "stageAuthorization.engineArgs",
    ),
  };
  const stageAuthorization: Readonly<FloodgateTeacherStageAuthorizationOptions> =
    stageHasEval
      ? frozenRecord({
          ...capturedStageBase,
          evalDir: requiredAbsolutePath(
            stageCandidate.evalDir,
            "stageAuthorization.evalDir",
          ),
        })
      : frozenRecord(capturedStageBase);
  const sharedPathKeys = [
    "repositoryRoot",
    "rawLockRoot",
    "roleLockRoot",
    "legacyProtectedPositionIdsPath",
  ] as const;
  for (let index = 0; index < sharedPathKeys.length; index += 1) {
    const key = sharedPathKeys[index];
    if (stageAuthorization[key] !== consumer[key]) {
      throw new NativeError(`stage and consumer ${key} differ`);
    }
  }
  if (stageAuthorization.roleBundleRoot !== consumer.outputRoot) {
    throw new NativeError(
      "stage roleBundleRoot differs from consumer outputRoot",
    );
  }
  if (
    stageAuthorization.stageBasename !== `floodgate-v7-${runId}-stage` ||
    stageAuthorization.destinationBasename !== `floodgate-v7-${runId}-final`
  ) {
    throw new NativeError("stage basenames differ from the fixed run binding");
  }
  return frozenRecord({
    runId,
    gate,
    expectedKeyInstanceId,
    stageAuthorization,
    consumer,
  });
}

function captureDependencies<TAuthorization extends AnyKeyAuthorization>(
  value: FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>,
): Readonly<
  FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>
> {
  const candidate = exactDataRecord(
    value,
    DEPENDENCY_KEYS,
    "connector dependencies",
  );
  for (let index = 0; index < DEPENDENCY_KEYS.length; index += 1) {
    const key = DEPENDENCY_KEYS[index];
    if (key === "observeFailureForTests") continue;
    if (typeof candidate[key] !== "function" || nodeIsProxy(candidate[key])) {
      throw new NativeError(`dependencies.${key} must be a non-Proxy function`);
    }
  }
  if (
    candidate.observeFailureForTests !== undefined &&
    (typeof candidate.observeFailureForTests !== "function" ||
      nodeIsProxy(candidate.observeFailureForTests))
  ) {
    throw new NativeError(
      "dependencies.observeFailureForTests must be undefined or a non-Proxy function",
    );
  }
  return frozenRecord({
    inspectKeyReadiness: candidate.inspectKeyReadiness as () => Promise<
      Readonly<FloodgateV7DeploymentKeyReadinessReceipt>
    >,
    createCoordinator:
      candidate.createCoordinator as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["createCoordinator"],
    claimCoordinatorHandoff:
      candidate.claimCoordinatorHandoff as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["claimCoordinatorHandoff"],
    authorizeStage:
      candidate.authorizeStage as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["authorizeStage"],
    prepareKey:
      candidate.prepareKey as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["prepareKey"],
    discardKey:
      candidate.discardKey as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["discardKey"],
    consumeRowsAndPostflight:
      candidate.consumeRowsAndPostflight as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["consumeRowsAndPostflight"],
    claimPostflight:
      candidate.claimPostflight as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["claimPostflight"],
    checkpoint:
      candidate.checkpoint as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["checkpoint"],
    observeFailureForTests:
      candidate.observeFailureForTests as FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>["observeFailureForTests"],
  });
}

function requiredExact<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    throw new NativeError(`${label} differs from the fixed contract`);
  }
  return expected;
}

function captureReadinessStatus(
  value: unknown,
): FloodgateV7DeploymentKeyReadinessStatus {
  const descriptors = safeDataDescriptors(value, "readiness receipt");
  const status = ownDataValue(descriptors, "status", "readiness receipt");
  if (
    status !== "ready" &&
    status !== "not-provisioned" &&
    status !== "unsafe"
  ) {
    throw new NativeError("readiness receipt status is invalid");
  }
  return status;
}

function captureRunBinding(
  value: unknown,
): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  const descriptors = safeDataDescriptors(value, "coordinator run binding");
  requiredExact(
    ownDataValue(descriptors, "schema", "coordinator run binding"),
    FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    "coordinator run binding schema",
  );
  const planDescriptors = safeDataDescriptors(
    ownDataValue(descriptors, "plan", "coordinator run binding"),
    "coordinator run binding plan",
  );
  const planBytes = requiredExact(
    ownDataValue(planDescriptors, "bytes", "coordinator run binding plan"),
    FIXED_PLAN_BYTES,
    "coordinator run binding plan bytes",
  );
  const planSha256 = requiredExact(
    ownDataValue(planDescriptors, "sha256", "coordinator run binding plan"),
    FIXED_PLAN_SHA256,
    "coordinator run binding plan sha256",
  );
  const controlDescriptors = safeDataDescriptors(
    ownDataValue(descriptors, "producer_control", "coordinator run binding"),
    "coordinator producer control",
  );
  requiredExact(
    ownDataValue(controlDescriptors, "schema", "coordinator producer control"),
    FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
    "coordinator producer control schema",
  );
  const parentDeadlineMs = requiredSafeInteger(
    ownDataValue(
      controlDescriptors,
      "parent_deadline_ms",
      "coordinator producer control",
    ),
    "coordinator parent deadline",
    1,
  );
  const abortDrainMs = requiredSafeInteger(
    ownDataValue(
      controlDescriptors,
      "abort_drain_ms",
      "coordinator producer control",
    ),
    "coordinator abort drain",
    1,
  );
  requiredExact(
    ownDataValue(
      controlDescriptors,
      "max_in_flight",
      "coordinator producer control",
    ),
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
    "coordinator max in flight",
  );
  requiredExact(
    ownDataValue(
      controlDescriptors,
      "cancel_policy",
      "coordinator producer control",
    ),
    FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
    "coordinator cancel policy",
  );
  requiredExact(
    ownDataValue(
      controlDescriptors,
      "late_settlement_policy",
      "coordinator producer control",
    ),
    FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    "coordinator late settlement policy",
  );
  return frozenRecord({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: frozenRecord({
      bytes: planBytes,
      sha256: planSha256,
    }),
    producer_control: frozenRecord({
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms: parentDeadlineMs,
      abort_drain_ms: abortDrainMs,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256: requiredHex(
      ownDataValue(
        descriptors,
        "stable_runtime_receipt_sha256",
        "coordinator run binding",
      ),
      RUN_ID_RE,
      "stable runtime receipt sha256",
    ),
    teacher_usi_runtime_receipt_sha256: requiredHex(
      ownDataValue(
        descriptors,
        "teacher_usi_runtime_receipt_sha256",
        "coordinator run binding",
      ),
      RUN_ID_RE,
      "teacher USI runtime receipt sha256",
    ),
  });
}

type CoordinatorLifecycle = Readonly<{
  readonly close: () => Promise<void>;
  readonly abortAndDrain: () => Promise<void>;
}>;

function captureCoordinatorLifecycle(value: unknown): CoordinatorLifecycle {
  const descriptors = objectGetOwnPropertyDescriptors(
    plainRecord(value, "coordinator facade"),
  );
  return frozenRecord({
    close: requiredFunction<() => Promise<void>>(
      ownDataValue(descriptors, "close", "coordinator facade"),
      "coordinator close",
    ),
    abortAndDrain: requiredFunction<() => Promise<void>>(
      ownDataValue(descriptors, "abortAndDrain", "coordinator facade"),
      "coordinator abort and drain",
    ),
  });
}

function captureHandoff(
  value: unknown,
): Readonly<FloodgateV7ProductionParentCoordinatorCheckpointHandoff> {
  const descriptors = safeDataDescriptors(value, "coordinator handoff");
  return frozenRecord({
    produce: requiredFunction<
      FloodgateV7ProductionParentCoordinatorCheckpointHandoff["produce"]
    >(
      ownDataValue(descriptors, "produce", "coordinator handoff"),
      "coordinator handoff produce",
    ),
    abortAndDrain: requiredFunction<() => Promise<void>>(
      ownDataValue(descriptors, "abortAndDrain", "coordinator handoff"),
      "coordinator handoff abort and drain",
    ),
    close: requiredFunction<() => Promise<void>>(
      ownDataValue(descriptors, "close", "coordinator handoff"),
      "coordinator handoff close",
    ),
    runBinding: captureRunBinding(
      ownDataValue(descriptors, "runBinding", "coordinator handoff"),
    ),
  });
}

type StageLeaseCleanup = Readonly<{
  readonly value: Readonly<FloodgateTeacherStageLease>;
  readonly close: () => Promise<void>;
}>;

type CapturedStageLease = Readonly<
  StageLeaseCleanup & {
    readonly receipt: Readonly<FloodgateTeacherStageLease>["receipt"];
  }
>;

function captureStageLeaseCleanup(value: unknown): StageLeaseCleanup {
  const descriptors = objectGetOwnPropertyDescriptors(
    plainRecord(value, "stage lease"),
  );
  return frozenRecord({
    value: value as Readonly<FloodgateTeacherStageLease>,
    close: requiredFunction<() => Promise<void>>(
      ownDataValue(descriptors, "close", "stage lease"),
      "stage lease close",
    ),
  });
}

function captureStageLease(
  value: unknown,
  cleanup: StageLeaseCleanup,
): CapturedStageLease {
  const descriptors = safeDataDescriptors(value, "stage lease");
  const receipt = ownDataValue(descriptors, "receipt", "stage lease");
  safeDataDescriptors(receipt, "stage lease receipt");
  return frozenRecord({
    value: cleanup.value,
    receipt: receipt as Readonly<FloodgateTeacherStageLease>["receipt"],
    close: cleanup.close,
  });
}

function captureKeyInstanceId(value: unknown): string {
  const authorizationDescriptors = safeDataDescriptors(
    value,
    "deployment key authorization",
  );
  const receiptDescriptors = safeDataDescriptors(
    ownDataValue(
      authorizationDescriptors,
      "authorization",
      "deployment key authorization",
    ),
    "deployment key authorization receipt",
  );
  const deploymentDescriptors = safeDataDescriptors(
    ownDataValue(
      receiptDescriptors,
      "key_deployment",
      "deployment key authorization receipt",
    ),
    "deployment key metadata",
  );
  return requiredHex(
    ownDataValue(
      deploymentDescriptors,
      "key_instance_id",
      "deployment key metadata",
    ),
    KEY_INSTANCE_RE,
    "deployment key instance id",
  );
}

function captureInputBinding(
  value: unknown,
  verifierRevision: string,
): Readonly<FloodgateTrainingInputBinding> {
  const descriptors = safeDataDescriptors(value, "postflight input binding");
  const capturedVerifierRevision = requiredHex(
    ownDataValue(descriptors, "verifier_revision", "postflight input binding"),
    REVISION_RE,
    "postflight verifier revision",
  );
  if (capturedVerifierRevision !== verifierRevision) {
    throw new NativeError("postflight verifier revision changed");
  }
  return frozenRecord({
    result_receipt_bytes: requiredSafeInteger(
      ownDataValue(
        descriptors,
        "result_receipt_bytes",
        "postflight input binding",
      ),
      "postflight result receipt bytes",
    ),
    result_receipt_sha256: requiredHex(
      ownDataValue(
        descriptors,
        "result_receipt_sha256",
        "postflight input binding",
      ),
      RUN_ID_RE,
      "postflight result receipt sha256",
    ),
    bundle_manifest_bytes: requiredSafeInteger(
      ownDataValue(
        descriptors,
        "bundle_manifest_bytes",
        "postflight input binding",
      ),
      "postflight bundle manifest bytes",
    ),
    bundle_manifest_sha256: requiredHex(
      ownDataValue(
        descriptors,
        "bundle_manifest_sha256",
        "postflight input binding",
      ),
      RUN_ID_RE,
      "postflight bundle manifest sha256",
    ),
    bundle_producer_revision: requiredHex(
      ownDataValue(
        descriptors,
        "bundle_producer_revision",
        "postflight input binding",
      ),
      REVISION_RE,
      "postflight bundle producer revision",
    ),
    verifier_revision: capturedVerifierRevision,
    raw_format: requiredExact(
      ownDataValue(descriptors, "raw_format", "postflight input binding"),
      FIXED_RAW_PARENT_FORMAT,
      "postflight raw format",
    ),
    raw_bytes: requiredSafeInteger(
      ownDataValue(descriptors, "raw_bytes", "postflight input binding"),
      "postflight raw bytes",
    ),
    raw_sha256: requiredHex(
      ownDataValue(descriptors, "raw_sha256", "postflight input binding"),
      RUN_ID_RE,
      "postflight raw sha256",
    ),
    records: requiredSafeInteger(
      ownDataValue(descriptors, "records", "postflight input binding"),
      "postflight records",
      1,
    ),
    games: requiredSafeInteger(
      ownDataValue(descriptors, "games", "postflight input binding"),
      "postflight games",
      1,
    ),
    game_ids_sha256: requiredHex(
      ownDataValue(descriptors, "game_ids_sha256", "postflight input binding"),
      RUN_ID_RE,
      "postflight game ids sha256",
    ),
    parent_ids_sha256: requiredHex(
      ownDataValue(
        descriptors,
        "parent_ids_sha256",
        "postflight input binding",
      ),
      RUN_ID_RE,
      "postflight parent ids sha256",
    ),
    position_ids_count: requiredSafeInteger(
      ownDataValue(
        descriptors,
        "position_ids_count",
        "postflight input binding",
      ),
      "postflight position id count",
      1,
    ),
    position_ids_sha256: requiredHex(
      ownDataValue(
        descriptors,
        "position_ids_sha256",
        "postflight input binding",
      ),
      RUN_ID_RE,
      "postflight position ids sha256",
    ),
  });
}

function capturePostflightBinding(
  value: unknown,
  boundary: FloodgateV7ProductionCheckpointConnectorExecutionBoundary,
  verifierRevision: string,
): Readonly<FloodgateTrainingInputBinding> {
  const descriptors = safeDataDescriptors(value, "consumer postflight receipt");
  requiredExact(
    ownDataValue(descriptors, "schema", "consumer postflight receipt"),
    FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
    "consumer postflight schema",
  );
  requiredExact(
    ownDataValue(descriptors, "status", "consumer postflight receipt"),
    FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
    "consumer postflight status",
  );
  requiredExact(
    ownDataValue(descriptors, "claim_boundary", "consumer postflight receipt"),
    FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
    "consumer postflight claim boundary",
  );
  requiredExact(
    ownDataValue(
      descriptors,
      "execution_boundary",
      "consumer postflight receipt",
    ),
    boundary === "production-fixed-capability-composition"
      ? "production-fixed-pinned-bundle-verifier"
      : "test-only-injected-bundle-verifier",
    "consumer postflight execution boundary",
  );
  requiredExact(
    ownDataValue(descriptors, "runtime_claim", "consumer postflight receipt"),
    FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
    "consumer postflight runtime claim",
  );
  const inputDescriptors = safeDataDescriptors(
    ownDataValue(descriptors, "input", "consumer postflight receipt"),
    "consumer postflight input",
  );
  requiredExact(
    ownDataValue(inputDescriptors, "schema", "consumer postflight input"),
    FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    "consumer postflight input schema",
  );
  requiredExact(
    ownDataValue(inputDescriptors, "role", "consumer postflight input"),
    "training",
    "consumer postflight role",
  );
  const postflightDescriptors = safeDataDescriptors(
    ownDataValue(descriptors, "postflight", "consumer postflight receipt"),
    "consumer postflight lifecycle",
  );
  requiredExact(
    ownDataValue(
      postflightDescriptors,
      "callback_settled_without_value",
      "consumer postflight lifecycle",
    ),
    true,
    "consumer callback settlement",
  );
  requiredExact(
    ownDataValue(
      postflightDescriptors,
      "filesystem_snapshot_revalidated_after_callback",
      "consumer postflight lifecycle",
    ),
    true,
    "consumer filesystem revalidation",
  );
  requiredExact(
    ownDataValue(
      postflightDescriptors,
      "input_descriptors_closed",
      "consumer postflight lifecycle",
    ),
    true,
    "consumer descriptor closure",
  );
  return captureInputBinding(
    ownDataValue(inputDescriptors, "binding", "consumer postflight input"),
    verifierRevision,
  );
}

type CapturedCheckpointReceipt = Readonly<
  FloodgateV7ProductionCheckpointConnectorReceipt["checkpoint"]
>;

function captureCheckpointReceipt(
  value: unknown,
  options: Readonly<FloodgateV7ProductionCheckpointConnectorOptions>,
): CapturedCheckpointReceipt {
  const descriptors = safeDataDescriptors(value, "checkpoint receipt");
  requiredExact(
    ownDataValue(descriptors, "contract", "checkpoint receipt"),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    "checkpoint contract",
  );
  requiredExact(
    ownDataValue(descriptors, "claim_boundary", "checkpoint receipt"),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
    "checkpoint claim boundary",
  );
  requiredExact(
    ownDataValue(descriptors, "algorithm", "checkpoint receipt"),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
    "checkpoint algorithm",
  );
  requiredExact(
    ownDataValue(descriptors, "run_id", "checkpoint receipt"),
    options.runId,
    "checkpoint run id",
  );
  requiredExact(
    ownDataValue(descriptors, "key_id", "checkpoint receipt"),
    FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    "checkpoint key id",
  );
  requiredExact(
    ownDataValue(descriptors, "gate", "checkpoint receipt"),
    options.gate,
    "checkpoint gate",
  );
  const gateContractDescriptors = safeDataDescriptors(
    ownDataValue(descriptors, "gate_contract", "checkpoint receipt"),
    "checkpoint gate contract",
  );
  requiredExact(
    ownDataValue(gateContractDescriptors, "schema", "checkpoint gate contract"),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema,
    "checkpoint gate contract schema",
  );
  requiredExact(
    ownDataValue(
      gateContractDescriptors,
      "durable_prefix_100_parents",
      "checkpoint gate contract",
    ),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.durable_prefix_100_parents,
    "checkpoint 100-parent gate",
  );
  requiredExact(
    ownDataValue(
      gateContractDescriptors,
      "durable_prefix_500_parents",
      "checkpoint gate contract",
    ),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.durable_prefix_500_parents,
    "checkpoint 500-parent gate",
  );
  requiredExact(
    ownDataValue(
      gateContractDescriptors,
      "sealed_final_parents",
      "checkpoint gate contract",
    ),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.sealed_final_parents,
    "checkpoint final gate",
  );
  const finalGate = options.gate === "sealed-final-24000";
  const targetParents =
    options.gate === "durable-prefix-100"
      ? 100
      : options.gate === "durable-prefix-500"
        ? 500
        : FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  const status = requiredExact(
    ownDataValue(descriptors, "status", "checkpoint receipt"),
    finalGate
      ? FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS
      : FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
    "checkpoint status",
  );
  const sealed = requiredExact(
    ownDataValue(descriptors, "sealed", "checkpoint receipt"),
    finalGate,
    "checkpoint seal state",
  );
  const workDescriptors = safeDataDescriptors(
    ownDataValue(descriptors, "work", "checkpoint receipt"),
    "checkpoint work receipt",
  );
  requiredExact(
    ownDataValue(workDescriptors, "format", "checkpoint work receipt"),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
    "checkpoint work format",
  );
  requiredExact(
    ownDataValue(
      workDescriptors,
      "training_parents",
      "checkpoint work receipt",
    ),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
    "checkpoint training parent count",
  );
  requiredExact(
    ownDataValue(workDescriptors, "target_parents", "checkpoint work receipt"),
    targetParents,
    "checkpoint target parent count",
  );
  requiredExact(
    ownDataValue(
      workDescriptors,
      "completed_parents",
      "checkpoint work receipt",
    ),
    targetParents,
    "checkpoint completed parent count",
  );
  requiredExact(
    ownDataValue(workDescriptors, "durability", "checkpoint work receipt"),
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
    "checkpoint durability",
  );
  return frozenRecord({
    contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    status,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
    algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
    gate_contract: frozenRecord({
      schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema,
      durable_prefix_100_parents: 100 as const,
      durable_prefix_500_parents: 500 as const,
      sealed_final_parents: 24_000 as const,
    }),
    sealed,
    work: frozenRecord({
      format: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
      training_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      records: requiredSafeInteger(
        ownDataValue(workDescriptors, "records", "checkpoint work receipt"),
        "checkpoint records",
        1,
      ),
      bytes: requiredSafeInteger(
        ownDataValue(workDescriptors, "bytes", "checkpoint work receipt"),
        "checkpoint bytes",
        1,
      ),
      sha256: requiredHex(
        ownDataValue(workDescriptors, "sha256", "checkpoint work receipt"),
        RUN_ID_RE,
        "checkpoint sha256",
      ),
      target_parents: targetParents,
      completed_parents: targetParents,
      resumed_parents: requiredSafeInteger(
        ownDataValue(
          workDescriptors,
          "resumed_parents",
          "checkpoint work receipt",
        ),
        "checkpoint resumed parent count",
      ),
      durability: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
    }),
  });
}

function isSafePromiseConstructorHolder(value: unknown): boolean {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== null ||
    !objectIsFrozen(value)
  ) {
    return false;
  }
  const keys = reflectOwnKeys(value);
  if (keys.length !== 1 || keys[0] !== promiseSpeciesSymbol) return false;
  const speciesDescriptor = objectGetOwnPropertyDescriptor(
    value,
    promiseSpeciesSymbol,
  );
  return (
    speciesDescriptor !== undefined &&
    objectHasOwn(speciesDescriptor, "value") &&
    speciesDescriptor.value === NativePromise &&
    speciesDescriptor.configurable === false &&
    speciesDescriptor.enumerable === false &&
    speciesDescriptor.writable === false
  );
}

function pinPromiseForObservation<T>(value: Promise<T>): Promise<T> {
  if (nativeReflectApply(nativeWeakSetHas, connectorPinnedPromises, [value])) {
    return value;
  }
  const descriptor = objectGetOwnPropertyDescriptor(value, "constructor");
  if (descriptor === undefined || descriptor.configurable === true) {
    objectDefineProperty(value, "constructor", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: pinnedPromiseConstructorHolder,
    });
  } else {
    if (
      !objectHasOwn(descriptor, "value") ||
      !isSafePromiseConstructorHolder(descriptor.value)
    ) {
      throw new NativeError(
        "native Promise constructor cannot be safely pinned",
      );
    }
    if (descriptor.writable === true) {
      objectDefineProperty(value, "constructor", {
        configurable: false,
        enumerable: descriptor.enumerable,
        writable: false,
        value: descriptor.value,
      });
    }
  }
  const thenDescriptor = objectGetOwnPropertyDescriptor(value, "then");
  if (thenDescriptor !== undefined && thenDescriptor.configurable !== true) {
    if (
      !objectHasOwn(thenDescriptor, "value") ||
      typeof thenDescriptor.value !== "function" ||
      nodeIsProxy(thenDescriptor.value) ||
      !objectIsFrozen(thenDescriptor.value) ||
      thenDescriptor.enumerable !== false ||
      thenDescriptor.writable !== false
    ) {
      // Captured Promise.prototype.then ignores an own `then`. With the
      // constructor already pinned, settlement can be observed for cleanup
      // while the caller-visible Promise shape still fails closed.
      return value;
    }
    nativeReflectApply(nativeWeakSetAdd, connectorPinnedPromises, [value]);
    return value;
  }
  const pinnedThen = objectFreeze(function (
    onFulfilled?: (settled: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    const derived = nativeReflectApply(nativePromiseThen, value, [
      onFulfilled,
      onRejected,
    ]) as Promise<unknown>;
    return pinPromiseForObservation(derived);
  });
  try {
    objectDefineProperty(value, "then", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: pinnedThen,
    });
  } catch {
    // A non-extensible external Promise with an already-safe constructor can
    // still be observed through captured Promise.prototype.then. Connector-
    // owned Promises are extensible and always receive the pinned own `then`.
    return value;
  }
  nativeReflectApply(nativeWeakSetAdd, connectorPinnedPromises, [value]);
  return value;
}

function isAcceptedPromiseShape(value: Promise<unknown>): boolean {
  const keys = reflectOwnKeys(value);
  if (keys.length === 0) return true;
  if (keys.length !== 1 && keys.length !== 2) return false;
  let hasConstructor = false;
  let hasThen = false;
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === "constructor") hasConstructor = true;
    else if (keys[index] === "then") hasThen = true;
    else return false;
  }
  if (!hasConstructor || (keys.length === 2 && !hasThen)) return false;
  const constructorDescriptor = objectGetOwnPropertyDescriptor(
    value,
    "constructor",
  );
  if (
    constructorDescriptor === undefined ||
    !objectHasOwn(constructorDescriptor, "value") ||
    !isSafePromiseConstructorHolder(constructorDescriptor.value) ||
    constructorDescriptor.enumerable !== false ||
    constructorDescriptor.configurable !== false ||
    constructorDescriptor.writable !== false
  ) {
    return false;
  }
  if (!hasThen) return true;
  const thenDescriptor = objectGetOwnPropertyDescriptor(value, "then");
  return (
    thenDescriptor !== undefined &&
    objectHasOwn(thenDescriptor, "value") &&
    typeof thenDescriptor.value === "function" &&
    !nodeIsProxy(thenDescriptor.value) &&
    objectIsFrozen(thenDescriptor.value) &&
    thenDescriptor.configurable === false &&
    thenDescriptor.enumerable === false &&
    thenDescriptor.writable === false
  );
}

function isAcceptedNativePromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !nodeIsProxy(value) &&
    nodeIsPromise(value) &&
    objectGetPrototypeOf(value) === nativePromisePrototype &&
    isAcceptedPromiseShape(value as Promise<unknown>)
  );
}

function adoptNativePromise<T>(
  value: unknown,
  label: string,
  observeInvalidFulfillment?: (value: T) => void,
): Promise<T> {
  if (value === null || typeof value !== "object" || nodeIsProxy(value)) {
    throw new NativeError(
      `${label} must return an accepted undecorated or pinned native Promise`,
    );
  }
  if (!nodeIsPromise(value)) {
    throw new NativeError(
      `${label} must return an accepted undecorated or pinned native Promise`,
    );
  }
  const acceptedShape =
    objectGetPrototypeOf(value) === nativePromisePrototype &&
    isAcceptedPromiseShape(value as Promise<unknown>);
  try {
    pinPromiseForObservation(value as Promise<unknown>);
  } catch {
    throw new NativeError(
      `${label} must return an accepted safely pinnable native Promise`,
    );
  }
  if (!acceptedShape) {
    const shapeError = new NativeError(
      `${label} must return an accepted undecorated or pinned native Promise`,
    );
    return pinPromiseForObservation(
      new NativePromise<T>((_resolve, reject) => {
        try {
          nativeReflectApply(nativePromiseThen, value, [
            (settled: T) => {
              if (observeInvalidFulfillment !== undefined) {
                try {
                  observeInvalidFulfillment(settled);
                } catch {
                  // The invalid shape remains the authoritative failure. The
                  // observer is best-effort capture for terminal cleanup only.
                }
              }
              reject(shapeError);
            },
            () => reject(shapeError),
          ]);
        } catch {
          reject(shapeError);
        }
      }),
    );
  }
  return pinPromiseForObservation(
    new NativePromise<T>((resolve, reject) => {
      try {
        nativeReflectApply(nativePromiseThen, value, [resolve, reject]);
      } catch {
        reject(new NativeError(`${label} native Promise could not be adopted`));
      }
    }),
  );
}

function startAttempt<T>(
  label: string,
  operation: () => unknown,
  observeInvalidFulfillment?: (value: T) => void,
): Promise<T> {
  try {
    return adoptNativePromise<T>(operation(), label, observeInvalidFulfillment);
  } catch (error) {
    return rejected(error);
  }
}

type AttemptOutcome<T> =
  | Readonly<{ readonly status: "fulfilled"; readonly value: T }>
  | Readonly<{ readonly status: "rejected"; readonly reason: unknown }>;

function settlePair<TLeft, TRight>(
  left: Promise<TLeft>,
  right: Promise<TRight>,
): Promise<readonly [AttemptOutcome<TLeft>, AttemptOutcome<TRight>]> {
  return pinPromiseForObservation(
    new NativePromise((resolve, reject) => {
      const outcomes: unknown[] = [];
      let completed = 0;
      const record = (
        index: number,
        outcome: AttemptOutcome<unknown>,
      ): void => {
        objectDefineProperty(outcomes, index, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: outcome,
        });
        completed += 1;
        if (completed === 2) {
          resolve(
            objectFreeze(outcomes) as unknown as readonly [
              AttemptOutcome<TLeft>,
              AttemptOutcome<TRight>,
            ],
          );
        }
      };
      try {
        nativeReflectApply(nativePromiseThen, left, [
          (value: TLeft) =>
            record(0, frozenRecord({ status: "fulfilled" as const, value })),
          (reason: unknown) =>
            record(0, frozenRecord({ status: "rejected" as const, reason })),
        ]);
        nativeReflectApply(nativePromiseThen, right, [
          (value: TRight) =>
            record(1, frozenRecord({ status: "fulfilled" as const, value })),
          (reason: unknown) =>
            record(1, frozenRecord({ status: "rejected" as const, reason })),
        ]);
      } catch {
        reject(
          new NativeError("coordinator/stage settlement could not be joined"),
        );
      }
    }),
  );
}

function combinedInternalFailure(
  first: unknown,
  second: unknown,
  label: string,
): Error {
  const error = new NativeError(label);
  objectDefineProperty(error, "failures", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: frozenCopy([first, second]),
  });
  return error;
}

function mayHavePersisted(error: unknown): boolean {
  if (error === null || typeof error !== "object" || nodeIsProxy(error)) {
    return false;
  }
  const descriptor = descriptorAt(
    objectGetOwnPropertyDescriptors(error),
    "mayHavePersisted",
  );
  return (
    descriptor !== undefined &&
    objectHasOwn(descriptor, "value") &&
    descriptor.value === true
  );
}

function checkpointOptions(
  options: Readonly<FloodgateV7ProductionCheckpointConnectorOptions>,
): Readonly<FloodgateV7TeacherCheckpointV3Options> {
  return frozenRecord({
    gate: options.gate,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runId: options.runId,
  });
}

function keyRequest(
  options: Readonly<FloodgateV7ProductionCheckpointConnectorOptions>,
  runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
  stageAuthorizationReceipt: Readonly<FloodgateTeacherStageLease>["receipt"],
): Readonly<FloodgateV7DeploymentTeacherCheckpointV3KeyRequest> {
  return frozenRecord({
    gate: options.gate,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding: runBinding as Readonly<FloodgateV7DeploymentTeacherRunBinding>,
    runId: options.runId,
    stageAuthorizationReceipt,
  });
}

function controller(
  handoff: Readonly<FloodgateV7ProductionParentCoordinatorCheckpointHandoff>,
): Readonly<FloodgateV7TeacherProducerController> {
  return frozenRecord({
    produce: handoff.produce,
    abortAndDrain: handoff.abortAndDrain,
  });
}

function buildReceipt<
  TBoundary extends FloodgateV7ProductionCheckpointConnectorExecutionBoundary,
>(
  boundary: TBoundary,
  options: Readonly<FloodgateV7ProductionCheckpointConnectorOptions>,
  keyInstanceId: string,
  runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
  inputBinding: Readonly<FloodgateTrainingInputBinding>,
  checkpoint: CapturedCheckpointReceipt,
): Readonly<FloodgateV7ProductionCheckpointConnectorReceipt<TBoundary>> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
    claim_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
    execution_boundary: boundary,
    test_boundary:
      boundary === "production-fixed-capability-composition"
        ? null
        : frozenRecord({
            production_coordinator_origin: false as const,
            production_stage_origin: false as const,
            production_key_origin: false as const,
            production_input_origin: false as const,
            production_checkpoint_origin: false as const,
          }),
    run_id: options.runId,
    gate: options.gate,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    key_instance_id: keyInstanceId,
    run_binding: runBinding,
    input_binding: inputBinding,
    checkpoint,
    lifecycle: frozenRecord({
      readiness_metadata_passed: true as const,
      authoritative_key_reopen_and_revalidation_succeeded: true as const,
      exact_input_claimed_synchronously: true as const,
      checkpoint_settled_before_postflight: true as const,
      postflight_claimed_once: true as const,
      key_cleanup_settled: true as const,
      lease_close_joined: true as const,
      coordinator_closed: true as const,
    }),
    holdout_boundary: frozenRecord({
      callback_role: "training" as const,
      callback_parents: 24_000 as const,
      labeled_selection_read: false as const,
      labeled_final_holdout_read: false as const,
      label_free_selection_and_final_role_artifacts_may_be_verified:
        true as const,
    }),
    nonclaims: frozenRecord({
      key_bytes_or_key_hash: false as const,
      authorization_mac: false as const,
      absolute_or_caller_path: false as const,
      row_or_position_content: false as const,
      executable_capability: false as const,
      teacher_label: false as const,
      optimizer_training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

async function runCaptured<
  TAuthorization extends AnyKeyAuthorization,
  TBoundary extends FloodgateV7ProductionCheckpointConnectorExecutionBoundary,
>(
  options: Readonly<FloodgateV7ProductionCheckpointConnectorOptions>,
  dependencies: Readonly<
    FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>
  >,
  boundary: TBoundary,
): Promise<
  Readonly<FloodgateV7ProductionCheckpointConnectorReceipt<TBoundary>>
> {
  let activePhase: FloodgateV7ProductionCheckpointConnectorPhase = "readiness";
  let readinessStatus: FloodgateV7DeploymentKeyReadinessStatus | null = null;
  let primary: unknown;
  const cleanupFailures: unknown[] = [];
  let checkpointMayHavePersisted = false;
  let coordinator: FloodgateV7ProductionParentCoordinator | undefined;
  let coordinatorLifecycle: CoordinatorLifecycle | undefined;
  let handoff:
    | Readonly<FloodgateV7ProductionParentCoordinatorCheckpointHandoff>
    | undefined;
  let lease: Readonly<FloodgateTeacherStageLease> | undefined;
  let stageLeaseCleanup: StageLeaseCleanup | undefined;
  let capturedLease: CapturedStageLease | undefined;
  let authorization: TAuthorization | undefined;
  let keyInstanceId: string | undefined;
  let checkpointReceipt: CapturedCheckpointReceipt | undefined;
  let postflightReceipt:
    Readonly<FloodgateTrainingConsumerPostflightReceipt> | undefined;
  let postflightBinding: Readonly<FloodgateTrainingInputBinding> | undefined;
  let sinkPromise:
    Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> | undefined;
  let callbackPromise: Promise<void> | undefined;
  let sinkFailure: unknown;
  let callbackWindowOpen = false;
  let callbackInvocationCount = 0;

  try {
    const readiness = await startAttempt<
      Readonly<FloodgateV7DeploymentKeyReadinessReceipt>
    >("deployment-key readiness", dependencies.inspectKeyReadiness);
    readinessStatus = captureReadinessStatus(readiness);
    if (readinessStatus !== "ready") {
      throw new NativeError("fixed deployment key is not ready");
    }

    activePhase = "coordinator-stage";
    const coordinatorAttempt =
      startAttempt<FloodgateV7ProductionParentCoordinator>(
        "coordinator factory",
        dependencies.createCoordinator,
        (value) => {
          coordinator = value;
        },
      );
    const stageAttempt = startAttempt<Readonly<FloodgateTeacherStageLease>>(
      "stage authorization",
      () => dependencies.authorizeStage(options.stageAuthorization),
      (value) => {
        lease = value;
      },
    );
    const settled = await settlePair(coordinatorAttempt, stageAttempt);
    const startupFailures: unknown[] = [];
    const coordinatorResult = settled[0];
    const stageResult = settled[1];
    if (coordinatorResult.status === "fulfilled") {
      coordinator = coordinatorResult.value;
    } else {
      append(startupFailures, coordinatorResult.reason);
    }
    if (coordinator !== undefined) {
      try {
        coordinatorLifecycle = captureCoordinatorLifecycle(coordinator);
      } catch (error) {
        append(startupFailures, error);
      }
    }
    if (stageResult.status === "fulfilled") {
      lease = stageResult.value;
    } else {
      append(startupFailures, stageResult.reason);
    }
    if (lease !== undefined) {
      try {
        stageLeaseCleanup = captureStageLeaseCleanup(lease);
        if (stageResult.status === "fulfilled") {
          capturedLease = captureStageLease(lease, stageLeaseCleanup);
        }
      } catch (error) {
        append(startupFailures, error);
      }
    }
    if (startupFailures.length > 0) {
      let startupFailure = startupFailures[0];
      for (let index = 1; index < startupFailures.length; index += 1) {
        startupFailure = combinedInternalFailure(
          startupFailure,
          startupFailures[index],
          "coordinator or stage initialization failed",
        );
      }
      throw startupFailure;
    }
    if (
      coordinator === undefined ||
      coordinatorLifecycle === undefined ||
      lease === undefined ||
      capturedLease === undefined
    ) {
      throw new NativeError(
        "coordinator or stage initialization returned no value",
      );
    }

    activePhase = "handoff";
    handoff = captureHandoff(dependencies.claimCoordinatorHandoff(coordinator));
    const producerController = controller(handoff);

    activePhase = "key-prepare";
    authorization = await startAttempt<TAuthorization>(
      "deployment-key prepare",
      () =>
        dependencies.prepareKey(
          keyRequest(options, handoff!.runBinding, capturedLease!.receipt),
        ),
      (value) => {
        authorization = value;
      },
    );
    keyInstanceId = captureKeyInstanceId(authorization);
    activePhase = "key-instance";
    if (keyInstanceId !== options.expectedKeyInstanceId) {
      throw new NativeError("deployment key instance differs from expectation");
    }

    activePhase = "consumer";
    const consume = (
      input: Readonly<AuthenticatedFloodgateTrainingRows>,
    ): Promise<void> => {
      callbackInvocationCount += 1;
      if (!callbackWindowOpen || callbackInvocationCount !== 1) {
        return rejected(
          new NativeError(
            "consumer sink must be invoked exactly once before consumer settlement",
          ),
        );
      }
      activePhase = "checkpoint";
      try {
        const sinkResult = dependencies.checkpoint(
          lease!,
          input,
          handoff!.runBinding,
          producerController,
          checkpointOptions(options),
          authorization!,
        );
        if (!isAcceptedNativePromise(sinkResult)) {
          checkpointMayHavePersisted = true;
        }
        sinkPromise = adoptNativePromise<
          Readonly<FloodgateV7TeacherCheckpointV3Receipt>
        >(sinkResult, "checkpoint sink");
      } catch (error) {
        sinkFailure = error;
        checkpointMayHavePersisted = true;
        callbackPromise = rejected(error);
        return callbackPromise;
      }
      callbackPromise = pinPromiseForObservation(
        new NativePromise<void>((resolve, reject) => {
          try {
            nativeReflectApply(nativePromiseThen, sinkPromise!, [
              (settled: Readonly<FloodgateV7TeacherCheckpointV3Receipt>) => {
                checkpointMayHavePersisted = true;
                activePhase = "receipt";
                try {
                  checkpointReceipt = captureCheckpointReceipt(
                    settled,
                    options,
                  );
                  activePhase = "consumer";
                  resolve();
                } catch (error) {
                  sinkFailure = error;
                  reject(error);
                }
              },
              (error: unknown) => {
                sinkFailure = error;
                if (mayHavePersisted(error)) checkpointMayHavePersisted = true;
                reject(error);
              },
            ]);
          } catch (error) {
            sinkFailure = error;
            reject(error);
          }
        }),
      );
      return callbackPromise;
    };
    callbackWindowOpen = true;
    try {
      postflightReceipt = await startAttempt<
        Readonly<FloodgateTrainingConsumerPostflightReceipt>
      >("training consumer", () =>
        dependencies.consumeRowsAndPostflight(options.consumer, consume),
      );
    } finally {
      callbackWindowOpen = false;
    }
    if (callbackPromise === undefined || callbackInvocationCount !== 1) {
      throw new NativeError("consumer completed without invoking the sink");
    }
    await callbackPromise;
    if (checkpointReceipt === undefined) {
      throw new NativeError("consumer completed without a checkpoint receipt");
    }
    activePhase = "receipt";
    postflightBinding = capturePostflightBinding(
      postflightReceipt,
      boundary,
      options.consumer.verifierRevision,
    );
    activePhase = "postflight";
    dependencies.claimPostflight(postflightReceipt);
  } catch (error) {
    primary = error;
    if (activePhase === "readiness" && readinessStatus === null) {
      readinessStatus = "unsafe";
    }
    if (mayHavePersisted(error)) {
      checkpointMayHavePersisted = true;
    }
  }

  if (callbackPromise !== undefined) {
    try {
      await callbackPromise;
    } catch (error) {
      if (mayHavePersisted(error)) checkpointMayHavePersisted = true;
      if (primary === undefined) {
        primary = error;
      } else if (error !== primary && error !== sinkFailure) {
        primary = combinedInternalFailure(
          primary,
          error,
          "consumer and checkpoint settlement both failed",
        );
      }
    }
  } else if (sinkPromise !== undefined) {
    try {
      checkpointReceipt = await sinkPromise;
      checkpointMayHavePersisted = true;
    } catch (error) {
      if (mayHavePersisted(error)) checkpointMayHavePersisted = true;
      if (primary === undefined) primary = error;
    }
  }

  if (authorization !== undefined) {
    try {
      dependencies.discardKey(authorization);
    } catch (error) {
      append(cleanupFailures, error);
    }
  }
  const leaseCleanupAttempt =
    stageLeaseCleanup === undefined
      ? undefined
      : startAttempt<void>("stage lease close", () =>
          nativeReflectApply(
            stageLeaseCleanup!.close,
            stageLeaseCleanup!.value,
            [],
          ),
        );
  let coordinatorCleanupAttempt: Promise<void> | undefined;
  if (coordinatorLifecycle !== undefined) {
    const lifecycle = handoff ?? coordinatorLifecycle;
    const lifecycleReceiver = handoff ?? coordinator;
    const closeSuccessfully =
      primary === undefined && cleanupFailures.length === 0;
    coordinatorCleanupAttempt = startAttempt<void>(
      closeSuccessfully ? "coordinator close" : "coordinator abort",
      () =>
        nativeReflectApply(
          closeSuccessfully ? lifecycle.close : lifecycle.abortAndDrain,
          lifecycleReceiver,
          [],
        ),
    );
  }
  if (
    leaseCleanupAttempt !== undefined &&
    coordinatorCleanupAttempt !== undefined
  ) {
    try {
      const cleanupOutcomes = await settlePair(
        leaseCleanupAttempt,
        coordinatorCleanupAttempt,
      );
      const leaseOutcome = cleanupOutcomes[0];
      const coordinatorOutcome = cleanupOutcomes[1];
      if (leaseOutcome.status === "rejected") {
        append(cleanupFailures, leaseOutcome.reason);
      }
      if (coordinatorOutcome.status === "rejected") {
        append(cleanupFailures, coordinatorOutcome.reason);
      }
    } catch (error) {
      append(cleanupFailures, error);
    }
  } else if (leaseCleanupAttempt !== undefined) {
    try {
      await leaseCleanupAttempt;
    } catch (error) {
      append(cleanupFailures, error);
    }
  } else if (coordinatorCleanupAttempt !== undefined) {
    try {
      await coordinatorCleanupAttempt;
    } catch (error) {
      append(cleanupFailures, error);
    }
  }

  if (primary !== undefined || cleanupFailures.length > 0) {
    const phase: FloodgateV7ProductionCheckpointConnectorPhase =
      primary === undefined ? "cleanup" : activePhase;
    const evidence = frozenRecord({
      phase,
      primary,
      cleanupFailures: frozenCopy(cleanupFailures),
      checkpointMayHavePersisted,
    });
    if (dependencies.observeFailureForTests !== undefined) {
      try {
        dependencies.observeFailureForTests(evidence);
      } catch {
        append(
          cleanupFailures,
          new NativeError("test failure observer failed"),
        );
      }
    }
    throw publicFailure(
      phase,
      activePhase === "readiness" ? readinessStatus : null,
      checkpointMayHavePersisted,
      cleanupFailures.length,
    );
  }
  if (
    handoff === undefined ||
    lease === undefined ||
    authorization === undefined ||
    keyInstanceId === undefined ||
    checkpointReceipt === undefined ||
    postflightReceipt === undefined ||
    postflightBinding === undefined
  ) {
    throw publicFailure("receipt", null, checkpointMayHavePersisted, 0);
  }
  try {
    return buildReceipt(
      boundary,
      options,
      keyInstanceId,
      handoff.runBinding,
      postflightBinding,
      checkpointReceipt,
    );
  } catch {
    throw publicFailure("receipt", null, checkpointMayHavePersisted, 0);
  }
}

const PRODUCTION_DEPENDENCIES = frozenRecord({
  inspectKeyReadiness: inspectFloodgateV7DeploymentKeyReadiness,
  createCoordinator: createFloodgateV7ProductionParentCoordinator,
  claimCoordinatorHandoff:
    claimFloodgateV7ProductionParentCoordinatorForCheckpoint,
  authorizeStage: authorizeFloodgateTeacherStage,
  prepareKey: prepareFloodgateV7DeploymentTeacherCheckpointV3Key,
  discardKey: discardFloodgateV7DeploymentTeacherCheckpointV3Key,
  consumeRowsAndPostflight:
    withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
  claimPostflight: claimVerifiedFloodgateTrainingConsumerPostflight,
  checkpoint: checkpointFloodgateV7TeacherParentsV3,
  observeFailureForTests: undefined,
});

/** Dependency-injected composition seam. Its receipt is never production evidence. */
export function runFloodgateV7ProductionCheckpointConnectorCoreForTests<
  TAuthorization extends AnyKeyAuthorization,
>(
  optionsValue: FloodgateV7ProductionCheckpointConnectorOptions,
  dependenciesValue: FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>,
): Promise<
  Readonly<
    FloodgateV7ProductionCheckpointConnectorReceipt<"test-only-injected-capability-composition">
  >
> {
  if (arguments.length !== 2) {
    return rejected(publicFailure("capture"));
  }
  let options: Readonly<FloodgateV7ProductionCheckpointConnectorOptions>;
  let dependencies: Readonly<
    FloodgateV7ProductionCheckpointConnectorCoreDependencies<TAuthorization>
  >;
  try {
    options = captureOptions(optionsValue);
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(publicFailure("capture"));
  }
  return pinPromiseForObservation(
    runCaptured(
      options,
      dependencies,
      "test-only-injected-capability-composition",
    ),
  );
}

/** Execute one exact V3 gate through only fixed production capability owners. */
export function runFloodgateV7ProductionCheckpointConnector(
  optionsValue: FloodgateV7ProductionCheckpointConnectorOptions,
): Promise<
  Readonly<
    FloodgateV7ProductionCheckpointConnectorReceipt<"production-fixed-capability-composition">
  >
> {
  if (arguments.length !== 1) {
    return rejected(publicFailure("capture"));
  }
  let options: Readonly<FloodgateV7ProductionCheckpointConnectorOptions>;
  try {
    options = captureOptions(optionsValue);
  } catch {
    return rejected(publicFailure("capture"));
  }
  return pinPromiseForObservation(
    runCaptured(
      options,
      PRODUCTION_DEPENDENCIES,
      "production-fixed-capability-composition",
    ),
  );
}
