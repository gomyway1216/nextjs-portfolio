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
  claimVerifiedFloodgateTrainingConsumerPostflight,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingRowConsumerOptions,
} from "./floodgate-training-row-consumer";
import {
  claimFloodgateV7ProductionParentCoordinatorForCheckpoint,
  createFloodgateV7ProductionParentCoordinator,
  type FloodgateV7ProductionParentCoordinator,
  type FloodgateV7ProductionParentCoordinatorCheckpointHandoff,
} from "./floodgate-v7-production-parent-coordinator";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
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
  readonly phase: FloodgateV7ProductionCheckpointConnectorPhase;
  readonly readiness_status: FloodgateV7DeploymentKeyReadinessStatus | null;
  readonly checkpoint_may_have_persisted: boolean;
  readonly cleanup_failure_count: number;
  readonly retry_disposition: FloodgateV7ProductionCheckpointConnectorRetryDisposition;

  constructor(
    phase: FloodgateV7ProductionCheckpointConnectorPhase,
    readinessStatus: FloodgateV7DeploymentKeyReadinessStatus | null,
    checkpointMayHavePersisted: boolean,
    cleanupFailureCount: number,
  ) {
    super(
      `Floodgate v7 production checkpoint connector failed during ${phase}`,
    );
    this.name = "FloodgateV7ProductionCheckpointConnectorError";
    this.stack = `${this.name}: ${this.message}`;
    this.phase = phase;
    this.readiness_status = readinessStatus;
    this.checkpoint_may_have_persisted = checkpointMayHavePersisted;
    this.cleanup_failure_count = cleanupFailureCount;
    this.retry_disposition =
      readinessStatus === "not-provisioned"
        ? "provision-required"
        : readinessStatus === "unsafe"
          ? "operator-reconciliation-required"
          : checkpointMayHavePersisted
            ? "checkpoint-reconciliation-required"
            : "fresh-invocation-required";
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
const NativeAggregateError = AggregateError;
const nativePromisePrototype = Promise.prototype;
const nativePromiseAllSettled = Promise.allSettled.bind(Promise);
const nativeRegExpExec = RegExp.prototype.exec;
const nativeStringIncludes = String.prototype.includes;
const nativeReflectApply = Reflect.apply;
const nativeArrayIsArray = Array.isArray;
const arrayPrototype = Array.prototype;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const KEY_INSTANCE_RE = /^[0-9a-f]{64}$/;
const MAX_STRING_CODE_UNITS = 4_096;
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
const STAGE_KEYS = objectFreeze([
  "destinationBasename",
  "engineArgs",
  "engineBin",
  "engineReceipt",
  "evalDir",
  "legacyProtectedPositionIdsPath",
  "publicationParent",
  "rawLockRoot",
  "repositoryRoot",
  "roleBundleRoot",
  "roleLockRoot",
  "stageBasename",
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

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
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
  return new NativePromise((_resolve, reject) => reject(error));
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
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
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
  for (const key of keys) {
    if (typeof key !== "string") {
      throw new NativeError(`${label} rejects symbol keys`);
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(`${label} requires enumerable data properties`);
    }
  }
  for (const key of expectedKeys) {
    if (descriptors[key] === undefined) {
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
  if (keys.length !== value.length + 1 || descriptors.length === undefined) {
    throw new NativeError(`${label} must be a dense array`);
  }
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
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
    repositoryRoot: requiredString(
      consumerCandidate.repositoryRoot,
      "consumer.repositoryRoot",
    ),
    verifierRevision: requiredString(
      consumerCandidate.verifierRevision,
      "consumer.verifierRevision",
    ),
    rawLockRoot: requiredString(
      consumerCandidate.rawLockRoot,
      "consumer.rawLockRoot",
    ),
    roleLockRoot: requiredString(
      consumerCandidate.roleLockRoot,
      "consumer.roleLockRoot",
    ),
    legacyProtectedPositionIdsPath: requiredString(
      consumerCandidate.legacyProtectedPositionIdsPath,
      "consumer.legacyProtectedPositionIdsPath",
    ),
    outputRoot: requiredString(
      consumerCandidate.outputRoot,
      "consumer.outputRoot",
    ),
  });
  const stageCandidate = exactDataRecord(
    candidate.stageAuthorization,
    STAGE_KEYS,
    "options.stageAuthorization",
  );
  const stageAuthorization = frozenRecord({
    repositoryRoot: requiredString(
      stageCandidate.repositoryRoot,
      "stageAuthorization.repositoryRoot",
    ),
    rawLockRoot: requiredString(
      stageCandidate.rawLockRoot,
      "stageAuthorization.rawLockRoot",
    ),
    roleLockRoot: requiredString(
      stageCandidate.roleLockRoot,
      "stageAuthorization.roleLockRoot",
    ),
    roleBundleRoot: requiredString(
      stageCandidate.roleBundleRoot,
      "stageAuthorization.roleBundleRoot",
    ),
    legacyProtectedPositionIdsPath: requiredString(
      stageCandidate.legacyProtectedPositionIdsPath,
      "stageAuthorization.legacyProtectedPositionIdsPath",
    ),
    publicationParent: requiredString(
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
    engineBin: requiredString(
      stageCandidate.engineBin,
      "stageAuthorization.engineBin",
    ),
    engineReceipt: requiredString(
      stageCandidate.engineReceipt,
      "stageAuthorization.engineReceipt",
    ),
    engineArgs: captureStringArray(
      stageCandidate.engineArgs,
      "stageAuthorization.engineArgs",
    ),
    evalDir: requiredString(
      stageCandidate.evalDir,
      "stageAuthorization.evalDir",
    ),
  });
  for (const key of [
    "repositoryRoot",
    "rawLockRoot",
    "roleLockRoot",
    "legacyProtectedPositionIdsPath",
  ] as const) {
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
  for (const key of DEPENDENCY_KEYS) {
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

function exactNativePromise<T>(value: unknown, label: string): Promise<T> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== nativePromisePrototype ||
    reflectOwnKeys(value).length !== 0
  ) {
    throw new NativeError(`${label} must return an undecorated native Promise`);
  }
  return value as Promise<T>;
}

function startAttempt<T>(label: string, operation: () => unknown): Promise<T> {
  try {
    return exactNativePromise<T>(operation(), label);
  } catch (error) {
    return rejected(error);
  }
}

function mayHavePersisted(error: unknown): boolean {
  if (error === null || typeof error !== "object" || nodeIsProxy(error)) {
    return false;
  }
  const descriptor = objectGetOwnPropertyDescriptors(error).mayHavePersisted;
  return (
    descriptor !== undefined &&
    "value" in descriptor &&
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
  lease: Readonly<FloodgateTeacherStageLease>,
): Readonly<FloodgateV7DeploymentTeacherCheckpointV3KeyRequest> {
  return frozenRecord({
    gate: options.gate,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding: runBinding as Readonly<FloodgateV7DeploymentTeacherRunBinding>,
    runId: options.runId,
    stageAuthorizationReceipt: lease.receipt,
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
  postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  checkpoint: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
): Readonly<FloodgateV7ProductionCheckpointConnectorReceipt<TBoundary>> {
  const binding = postflight.input.binding;
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
    claim_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
    execution_boundary: boundary,
    run_id: options.runId,
    gate: options.gate,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    key_instance_id: keyInstanceId,
    run_binding: frozenRecord({
      schema: runBinding.schema,
      plan: frozenRecord({
        bytes: runBinding.plan.bytes,
        sha256: runBinding.plan.sha256,
      }),
      producer_control: frozenRecord({
        schema: runBinding.producer_control.schema,
        parent_deadline_ms: runBinding.producer_control.parent_deadline_ms,
        abort_drain_ms: runBinding.producer_control.abort_drain_ms,
        max_in_flight: runBinding.producer_control.max_in_flight,
        cancel_policy: runBinding.producer_control.cancel_policy,
        late_settlement_policy:
          runBinding.producer_control.late_settlement_policy,
      }),
      stable_runtime_receipt_sha256: runBinding.stable_runtime_receipt_sha256,
      teacher_usi_runtime_receipt_sha256:
        runBinding.teacher_usi_runtime_receipt_sha256,
    }),
    input_binding: frozenRecord({
      result_receipt_bytes: binding.result_receipt_bytes,
      result_receipt_sha256: binding.result_receipt_sha256,
      bundle_manifest_bytes: binding.bundle_manifest_bytes,
      bundle_manifest_sha256: binding.bundle_manifest_sha256,
      bundle_producer_revision: binding.bundle_producer_revision,
      verifier_revision: binding.verifier_revision,
      raw_format: binding.raw_format,
      raw_bytes: binding.raw_bytes,
      raw_sha256: binding.raw_sha256,
      records: binding.records,
      games: binding.games,
      game_ids_sha256: binding.game_ids_sha256,
      parent_ids_sha256: binding.parent_ids_sha256,
      position_ids_count: binding.position_ids_count,
      position_ids_sha256: binding.position_ids_sha256,
    }),
    checkpoint: frozenRecord({
      contract: checkpoint.contract,
      status: checkpoint.status,
      claim_boundary: checkpoint.claim_boundary,
      algorithm: checkpoint.algorithm,
      gate_contract: frozenRecord({
        schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema,
        durable_prefix_100_parents: 100 as const,
        durable_prefix_500_parents: 500 as const,
        sealed_final_parents: 24_000 as const,
      }),
      sealed: checkpoint.sealed,
      work: frozenRecord({
        format: checkpoint.work.format,
        training_parents: checkpoint.work.training_parents,
        records: checkpoint.work.records,
        bytes: checkpoint.work.bytes,
        sha256: checkpoint.work.sha256,
        target_parents: checkpoint.work.target_parents,
        completed_parents: checkpoint.work.completed_parents,
        resumed_parents: checkpoint.work.resumed_parents,
        durability: checkpoint.work.durability,
      }),
    }),
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
  let handoff:
    | Readonly<FloodgateV7ProductionParentCoordinatorCheckpointHandoff>
    | undefined;
  let lease: Readonly<FloodgateTeacherStageLease> | undefined;
  let authorization: TAuthorization | undefined;
  let keyInstanceId: string | undefined;
  let checkpointReceipt:
    Readonly<FloodgateV7TeacherCheckpointV3Receipt> | undefined;
  let postflightReceipt:
    Readonly<FloodgateTrainingConsumerPostflightReceipt> | undefined;

  try {
    const readiness = await startAttempt<
      Readonly<FloodgateV7DeploymentKeyReadinessReceipt>
    >("deployment-key readiness", dependencies.inspectKeyReadiness);
    readinessStatus =
      readiness.status === "ready" ||
      readiness.status === "not-provisioned" ||
      readiness.status === "unsafe"
        ? readiness.status
        : "unsafe";
    if (readinessStatus !== "ready") {
      throw new NativeError("fixed deployment key is not ready");
    }

    activePhase = "coordinator-stage";
    const coordinatorAttempt =
      startAttempt<FloodgateV7ProductionParentCoordinator>(
        "coordinator factory",
        dependencies.createCoordinator,
      );
    const stageAttempt = startAttempt<Readonly<FloodgateTeacherStageLease>>(
      "stage authorization",
      () => dependencies.authorizeStage(options.stageAuthorization),
    );
    const settled = await nativePromiseAllSettled([
      coordinatorAttempt,
      stageAttempt,
    ]);
    const startupFailures: unknown[] = [];
    const coordinatorResult = settled[0];
    const stageResult = settled[1];
    if (coordinatorResult.status === "fulfilled") {
      coordinator = coordinatorResult.value;
    } else {
      append(startupFailures, coordinatorResult.reason);
    }
    if (stageResult.status === "fulfilled") {
      lease = stageResult.value;
    } else {
      append(startupFailures, stageResult.reason);
    }
    if (startupFailures.length > 0) {
      throw new NativeAggregateError(
        startupFailures,
        "coordinator or stage initialization failed",
      );
    }
    if (coordinator === undefined || lease === undefined) {
      throw new NativeError(
        "coordinator or stage initialization returned no value",
      );
    }

    activePhase = "handoff";
    handoff = dependencies.claimCoordinatorHandoff(coordinator);
    const producerController = controller(handoff);

    activePhase = "key-prepare";
    authorization = await startAttempt<TAuthorization>(
      "deployment-key prepare",
      () =>
        dependencies.prepareKey(
          keyRequest(options, handoff!.runBinding, lease!),
        ),
    );
    const actualKeyInstanceId =
      authorization.authorization.key_deployment.key_instance_id;
    if (
      typeof actualKeyInstanceId !== "string" ||
      !matches(KEY_INSTANCE_RE, actualKeyInstanceId)
    ) {
      throw new NativeError("deployment key instance id is invalid");
    }
    keyInstanceId = actualKeyInstanceId;
    activePhase = "key-instance";
    if (keyInstanceId !== options.expectedKeyInstanceId) {
      throw new NativeError("deployment key instance differs from expectation");
    }

    activePhase = "consumer";
    postflightReceipt = await startAttempt<
      Readonly<FloodgateTrainingConsumerPostflightReceipt>
    >("training consumer", () =>
      dependencies.consumeRowsAndPostflight(
        options.consumer,
        async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
          activePhase = "checkpoint";
          const checkpointPromise = exactNativePromise<
            Readonly<FloodgateV7TeacherCheckpointV3Receipt>
          >(
            dependencies.checkpoint(
              lease!,
              input,
              handoff!.runBinding,
              producerController,
              checkpointOptions(options),
              authorization!,
            ),
            "checkpoint sink",
          );
          checkpointReceipt = await checkpointPromise;
          checkpointMayHavePersisted = true;
          activePhase = "consumer";
        },
      ),
    );
    if (checkpointReceipt === undefined) {
      throw new NativeError("consumer completed without a checkpoint receipt");
    }
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

  if (authorization !== undefined) {
    try {
      dependencies.discardKey(authorization);
    } catch (error) {
      append(cleanupFailures, error);
    }
  }
  if (lease !== undefined) {
    try {
      await exactNativePromise<void>(lease.close(), "stage lease close");
    } catch (error) {
      append(cleanupFailures, error);
    }
  }
  if (coordinator !== undefined) {
    const lifecycle = handoff ?? coordinator;
    const closeSuccessfully =
      primary === undefined && cleanupFailures.length === 0;
    try {
      await exactNativePromise<void>(
        closeSuccessfully ? lifecycle.close() : lifecycle.abortAndDrain(),
        closeSuccessfully ? "coordinator close" : "coordinator abort",
      );
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
    postflightReceipt === undefined
  ) {
    throw publicFailure("receipt", null, checkpointMayHavePersisted, 0);
  }
  try {
    return buildReceipt(
      boundary,
      options,
      keyInstanceId,
      handoff.runBinding,
      postflightReceipt,
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
  return runCaptured(
    options,
    dependencies,
    "test-only-injected-capability-composition",
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
  return runCaptured(
    options,
    PRODUCTION_DEPENDENCIES,
    "production-fixed-capability-composition",
  );
}
