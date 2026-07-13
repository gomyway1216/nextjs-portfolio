/**
 * Test-only coordinator for the synthetic stable-proposal publication path.
 *
 * This composes existing exact runtime capabilities. It does not add a
 * production entry point, authenticate an engine process, create teacher
 * labels, or establish playing strength.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  checkpointFloodgateStableProposalsCoreForTests,
  type FloodgateStableProposalCheckpointDependencies,
  type FloodgateStableProposalCheckpointOptions,
  type FloodgateStableProposalCheckpointReceipt,
} from "./floodgate-stable-proposal-checkpoint";
import {
  FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT,
  FloodgateStableProposalFinalizerError,
  finalizeAndPublishFloodgateStableProposalsCoreForTests,
  type FloodgateStableProposalFinalizationReceipt,
  type FloodgateStableProposalFinalizerDependencies,
  type FloodgateStableProposalFinalizerOptions,
} from "./floodgate-stable-proposal-finalizer";
import {
  authorizeFloodgateTeacherStageCoreForTests,
  type FloodgateTeacherStageAuthorizationDependencies,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
} from "./floodgate-teacher-stage-authorization";
import {
  claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "./floodgate-training-row-consumer";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_STABLE_WASM_BYTES,
  FLOODGATE_STABLE_WEIGHTS_BYTES,
  FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
  generateFloodgateStableWasmProposalsCoreForTests,
  type FloodgateStableWasmProposerAssets,
  type FloodgateStableWasmProposerDependencies,
  type FloodgateStableWasmProposerOptions,
} from "./floodgate-stable-wasm-proposer";

export const FLOODGATE_STABLE_PROPOSAL_COORDINATOR_CONTRACT =
  "shogi-floodgate-stable-proposal-coordinator-v1" as const;
export const FLOODGATE_STABLE_PROPOSAL_COORDINATOR_STATUS =
  "synthetic-consumer-proposal-checkpoint-postflight-finalization-publication-complete" as const;
export const FLOODGATE_STABLE_PROPOSAL_COORDINATOR_CLAIM_BOUNDARY =
  "test-only-synthetic-runtime-composition-evidence-not-production-engine-teacher-label-training-or-playing-strength-evidence" as const;

const RUN_ID_RE = /^[0-9a-f]{64}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeTypedArrayBuffer = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const nativeTypedArrayByteLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const nativeTypedArraySet = typedArrayPrototype.set as (
  source: ArrayLike<number>,
  offset?: number,
) => void;

export type FloodgateStableProposalCoordinatorPhase =
  | "capture"
  | "consumer-claim-proposer"
  | "checkpoint-authorization"
  | "checkpoint"
  | "consumer-postflight"
  | "finalization-publication"
  | "cleanup";

export type FloodgateStableProposalCoordinatorEvent =
  | "initial-lease-acquired"
  | "input-claimed"
  | "proposal-complete"
  | "checkpoint-complete"
  | "postflight-complete"
  | "fresh-lease-acquired"
  | "before-finalization";

export type FloodgateStableProposalCoordinatorRetryDisposition =
  | "rerun-synthetic-coordinator-with-fresh-authority"
  | "resume-finalization-over-complete-authenticated-work"
  | "manual-content-reconciliation-required"
  | "manual-lease-reconciliation-required"
  | "manual-publication-reconciliation-required"
  | "manual-publication-and-lease-reconciliation-required";

export interface FloodgateStableProposalCoordinatorOptions {
  readonly stageAuthorization: FloodgateTeacherStageAuthorizationOptions;
  readonly consumer: FloodgateTrainingRowConsumerOptions;
  readonly proposerAssets: FloodgateStableWasmProposerAssets;
  readonly proposerOptions: FloodgateStableWasmProposerOptions;
  readonly checkpoint: FloodgateStableProposalCheckpointOptions;
}

export type FloodgateStableProposalCoordinatorCheckpointDependencies = Omit<
  FloodgateStableProposalCheckpointDependencies,
  "effectiveUserId" | "rootKey"
>;

export type FloodgateStableProposalCoordinatorFinalizerDependencies = Omit<
  FloodgateStableProposalFinalizerDependencies,
  "effectiveUserId"
>;

export interface FloodgateStableProposalCoordinatorDependencies {
  readonly rootKey: Uint8Array;
  readonly effectiveUserId: number;
  readonly stageAuthorization: FloodgateTeacherStageAuthorizationDependencies;
  readonly consumer: FloodgateTrainingRowConsumerDependencies;
  readonly proposer: FloodgateStableWasmProposerDependencies;
  readonly checkpoint?: FloodgateStableProposalCoordinatorCheckpointDependencies;
  readonly finalizer?: FloodgateStableProposalCoordinatorFinalizerDependencies;
  readonly publication: FloodgateTeacherStagePublicationDependencies;
  readonly phaseHookForTests?: (
    event: FloodgateStableProposalCoordinatorEvent,
  ) => void | Promise<void>;
}

export interface FloodgateStableProposalCoordinatorReceipt {
  readonly contract: typeof FLOODGATE_STABLE_PROPOSAL_COORDINATOR_CONTRACT;
  readonly status: typeof FLOODGATE_STABLE_PROPOSAL_COORDINATOR_STATUS;
  readonly claim_boundary: typeof FLOODGATE_STABLE_PROPOSAL_COORDINATOR_CLAIM_BOUNDARY;
  readonly execution_boundary: "test-only-fixed-boundary-composition";
  readonly execution_path: "generate-and-checkpoint";
  readonly run_id: string;
  readonly key_id: string;
  readonly handoff: Readonly<{
    readonly exact_input_claimed_synchronously: true;
    readonly initial_checkpoint_lease_closed_before_postflight: true;
    readonly exact_postflight_minted: true;
    readonly fresh_finalizer_lease_acquired: true;
    readonly finalizer_contract: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT;
  }>;
  readonly finalization: Readonly<FloodgateStableProposalFinalizationReceipt>;
}

interface CoordinatorErrorFacets {
  readonly phase: FloodgateStableProposalCoordinatorPhase;
  readonly inputClaimed: boolean;
  readonly proposalComplete: boolean;
  readonly checkpointStarted: boolean;
  readonly checkpointComplete: boolean;
  readonly postflightMinted: boolean;
  readonly freshLeaseAcquired: boolean;
  readonly finalizerStarted: boolean;
  readonly mayHavePublished: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition: FloodgateStableProposalCoordinatorRetryDisposition;
  readonly primary: unknown;
  readonly cleanupFailures?: readonly unknown[];
}

export class FloodgateStableProposalCoordinatorError extends Error {
  readonly phase: FloodgateStableProposalCoordinatorPhase;
  readonly inputClaimed: boolean;
  readonly proposalComplete: boolean;
  readonly checkpointStarted: boolean;
  readonly checkpointComplete: boolean;
  readonly postflightMinted: boolean;
  readonly freshLeaseAcquired: boolean;
  readonly finalizerStarted: boolean;
  readonly mayHavePublished: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition: FloodgateStableProposalCoordinatorRetryDisposition;
  readonly primary: unknown;
  readonly cleanupFailures: readonly unknown[];

  constructor(message: string, facets: Readonly<CoordinatorErrorFacets>) {
    super(`Floodgate stable proposal coordinator failed: ${message}`, {
      cause: facets.primary,
    });
    this.name = "FloodgateStableProposalCoordinatorError";
    this.phase = facets.phase;
    this.inputClaimed = facets.inputClaimed;
    this.proposalComplete = facets.proposalComplete;
    this.checkpointStarted = facets.checkpointStarted;
    this.checkpointComplete = facets.checkpointComplete;
    this.postflightMinted = facets.postflightMinted;
    this.freshLeaseAcquired = facets.freshLeaseAcquired;
    this.finalizerStarted = facets.finalizerStarted;
    this.mayHavePublished = facets.mayHavePublished;
    this.leaseMayRemain = facets.leaseMayRemain;
    this.retryDisposition = facets.retryDisposition;
    this.primary = facets.primary;
    this.cleanupFailures = Object.freeze([...(facets.cleanupFailures ?? [])]);
  }
}

interface CapturedInvocation {
  readonly options: Readonly<{
    readonly stageAuthorization: FloodgateTeacherStageAuthorizationOptions;
    readonly consumer: FloodgateTrainingRowConsumerOptions;
    readonly proposerAssets: FloodgateStableWasmProposerAssets;
    readonly proposerOptions: FloodgateStableWasmProposerOptions;
    readonly checkpoint: FloodgateStableProposalCheckpointOptions;
  }>;
  readonly dependencies: Readonly<{
    readonly rootKey: Buffer;
    readonly effectiveUserId: number;
    readonly stageAuthorization: FloodgateTeacherStageAuthorizationDependencies;
    readonly consumer: FloodgateTrainingRowConsumerDependencies;
    readonly proposer: FloodgateStableWasmProposerDependencies;
    readonly checkpoint: FloodgateStableProposalCoordinatorCheckpointDependencies;
    readonly finalizer: FloodgateStableProposalCoordinatorFinalizerDependencies;
    readonly publication: FloodgateTeacherStagePublicationDependencies;
    readonly phaseHook?: FloodgateStableProposalCoordinatorDependencies["phaseHookForTests"];
  }>;
}

interface MutableProgress {
  phase: FloodgateStableProposalCoordinatorPhase;
  inputClaimed: boolean;
  proposalComplete: boolean;
  checkpointStarted: boolean;
  checkpointComplete: boolean;
  postflightMinted: boolean;
  freshLeaseAcquired: boolean;
  finalizerStarted: boolean;
}

function fail(message: string): never {
  throw new Error(message);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) fail(`${label} must be a plain non-Proxy object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail(`${label} must not contain symbol keys`);
  }
  const allowed = new Set([...required, ...optional]);
  const actual = keys as string[];
  if (
    required.some((key) => !actual.includes(key)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    fail(`${label} keys are not exact`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable own data property`);
    }
    output[key] = descriptor.value;
  }
  return Object.freeze(output);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    output[key] = (value as Record<string, unknown>)[key];
  }
  return Object.freeze(output) as Readonly<T>;
}

function byteViewFacts(
  value: unknown,
  label: string,
  exactLength?: number,
): Readonly<{ readonly byteLength: number; readonly value: Uint8Array }> {
  if (
    !nodeUtilTypes.isUint8Array(value) ||
    nodeUtilTypes.isProxy(value) ||
    nativeTypedArrayBuffer === undefined ||
    nativeTypedArrayByteLength === undefined
  ) {
    fail(`${label} must be a nonempty non-shared Uint8Array`);
  }
  let byteLength: number;
  let backing: ArrayBufferLike;
  try {
    byteLength = Reflect.apply(nativeTypedArrayByteLength, value, []) as number;
    backing = Reflect.apply(
      nativeTypedArrayBuffer,
      value,
      [],
    ) as ArrayBufferLike;
  } catch {
    return fail(`${label} must be a nonempty non-shared Uint8Array`);
  }
  if (
    nodeUtilTypes.isSharedArrayBuffer(backing) ||
    byteLength === 0 ||
    (exactLength !== undefined && byteLength !== exactLength)
  ) {
    fail(`${label} must be a nonempty non-shared Uint8Array`);
  }
  return { byteLength, value };
}

function copyBytes(
  value: unknown,
  label: string,
  exactLength?: number,
): Buffer {
  const facts = byteViewFacts(value, label, exactLength);
  const output = Buffer.alloc(facts.byteLength);
  Reflect.apply(nativeTypedArraySet, output, [facts.value, 0]);
  return output;
}

function functionValue(
  value: unknown,
  label: string,
): (...args: never[]) => unknown {
  if (typeof value !== "function" || nodeUtilTypes.isProxy(value)) {
    fail(`${label} must be a non-Proxy function`);
  }
  return value as (...args: never[]) => unknown;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`${label} must be a nonempty NUL-free string`);
  }
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function positiveIntegerValue(value: unknown, label: string): number {
  const result = integerValue(value, label);
  if (result === 0) fail(`${label} must be positive`);
  return result;
}

function optionalFunctionFields(
  source: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      output[key] = functionValue(source[key], `${label}.${key}`);
    }
  }
  return output;
}

function captureStageOptions(
  value: FloodgateTeacherStageAuthorizationOptions,
): FloodgateTeacherStageAuthorizationOptions {
  const source = exactRecord(
    value,
    [
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
    ],
    ["evalDir"],
    "coordinator stage authorization options",
  );
  if (
    !Array.isArray(source.engineArgs) ||
    nodeUtilTypes.isProxy(source.engineArgs) ||
    Object.getPrototypeOf(source.engineArgs) !== Array.prototype
  ) {
    fail(
      "coordinator stage authorization engineArgs must be an ordinary array",
    );
  }
  const engineArgumentDescriptors = Object.getOwnPropertyDescriptors(
    source.engineArgs,
  );
  if (
    Reflect.ownKeys(engineArgumentDescriptors).length !==
    source.engineArgs.length + 1
  ) {
    fail("coordinator stage authorization engineArgs must be dense");
  }
  const engineArgs = Object.freeze(
    Array.from({ length: source.engineArgs.length }, (_, index) => {
      const descriptor = engineArgumentDescriptors[String(index)];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        fail(
          `coordinator stage authorization engineArgs[${index}] must be an enumerable data property`,
        );
      }
      return stringValue(
        descriptor.value,
        `coordinator stage authorization engineArgs[${index}]`,
      );
    }),
  );
  const captured: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(source)) {
    captured[key] =
      key === "engineArgs"
        ? engineArgs
        : stringValue(source[key], `coordinator stage authorization ${key}`);
  }
  return Object.freeze(
    captured,
  ) as unknown as FloodgateTeacherStageAuthorizationOptions;
}

function captureConsumerOptions(
  value: FloodgateTrainingRowConsumerOptions,
): FloodgateTrainingRowConsumerOptions {
  const source = exactRecord(
    value,
    [
      "legacyProtectedPositionIdsPath",
      "outputRoot",
      "rawLockRoot",
      "repositoryRoot",
      "roleLockRoot",
      "verifierRevision",
    ],
    [],
    "coordinator consumer options",
  );
  return frozenRecord({
    repositoryRoot: stringValue(
      source.repositoryRoot,
      "consumer repositoryRoot",
    ),
    verifierRevision: stringValue(
      source.verifierRevision,
      "consumer verifierRevision",
    ),
    rawLockRoot: stringValue(source.rawLockRoot, "consumer rawLockRoot"),
    roleLockRoot: stringValue(source.roleLockRoot, "consumer roleLockRoot"),
    legacyProtectedPositionIdsPath: stringValue(
      source.legacyProtectedPositionIdsPath,
      "consumer legacyProtectedPositionIdsPath",
    ),
    outputRoot: stringValue(source.outputRoot, "consumer outputRoot"),
  });
}

function captureInvocation(
  optionsValue: FloodgateStableProposalCoordinatorOptions,
  dependenciesValue: FloodgateStableProposalCoordinatorDependencies,
): CapturedInvocation {
  const options = exactRecord(
    optionsValue,
    [
      "checkpoint",
      "consumer",
      "proposerAssets",
      "proposerOptions",
      "stageAuthorization",
    ],
    [],
    "coordinator options",
  );
  const dependencies = exactRecord(
    dependenciesValue,
    [
      "consumer",
      "effectiveUserId",
      "proposer",
      "publication",
      "rootKey",
      "stageAuthorization",
    ],
    ["checkpoint", "finalizer", "phaseHookForTests"],
    "coordinator dependencies",
  );
  const checkpoint = exactRecord(
    options.checkpoint,
    ["keyId", "runId"],
    [],
    "coordinator checkpoint options",
  );
  if (
    typeof checkpoint.runId !== "string" ||
    !RUN_ID_RE.test(checkpoint.runId)
  ) {
    fail("coordinator runId must be 32 bytes of lowercase hex");
  }
  if (
    typeof checkpoint.keyId !== "string" ||
    !KEY_ID_RE.test(checkpoint.keyId)
  ) {
    fail("coordinator keyId is invalid");
  }
  const rootKeySource = dependencies.rootKey;
  // Validate through intrinsic typed-array accessors without retaining a key
  // copy while the remaining non-secret invocation fields are captured.
  byteViewFacts(rootKeySource, "coordinator rootKey", 32);
  const effectiveUserId = integerValue(
    dependencies.effectiveUserId,
    "coordinator effectiveUserId",
  );

  const assetSource = exactRecord(
    options.proposerAssets,
    [
      "embeddedWasmBytes",
      "planBytes",
      "wasmBytes",
      "weightsBytes",
      "workerSourceBytes",
    ],
    [],
    "coordinator proposer assets",
  );
  const proposerAssets = frozenRecord({
    planBytes: copyBytes(
      assetSource.planBytes,
      "coordinator plan bytes",
      FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
    ),
    wasmBytes: copyBytes(
      assetSource.wasmBytes,
      "coordinator WASM bytes",
      FLOODGATE_STABLE_WASM_BYTES,
    ),
    embeddedWasmBytes: copyBytes(
      assetSource.embeddedWasmBytes,
      "coordinator embedded WASM bytes",
      FLOODGATE_STABLE_WASM_BYTES,
    ),
    weightsBytes: copyBytes(
      assetSource.weightsBytes,
      "coordinator weights bytes",
      FLOODGATE_STABLE_WEIGHTS_BYTES,
    ),
    workerSourceBytes: copyBytes(
      assetSource.workerSourceBytes,
      "coordinator worker source bytes",
      FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
    ),
  });
  const proposerOptionSource = exactRecord(
    options.proposerOptions,
    ["searchTimeoutMilliseconds", "startupTimeoutMilliseconds", "workers"],
    [],
    "coordinator proposer options",
  );
  const proposerOptions = frozenRecord({
    workers: positiveIntegerValue(
      proposerOptionSource.workers,
      "proposer workers",
    ),
    startupTimeoutMilliseconds: positiveIntegerValue(
      proposerOptionSource.startupTimeoutMilliseconds,
      "proposer startup timeout",
    ),
    searchTimeoutMilliseconds: positiveIntegerValue(
      proposerOptionSource.searchTimeoutMilliseconds,
      "proposer search timeout",
    ),
  });

  const authorizationSource = exactRecord(
    dependencies.stageAuthorization,
    ["effectiveUserId", "inspectorPythonExecutable"],
    [
      "afterLeaseAcquiredForTests",
      "beforeHeldStageEntryInspectionForTests",
      "beforeLeaseRemovalForTests",
      "closeDirectoryForTests",
      "inspectorMaxOutputBytesForTests",
      "inspectorScriptForTests",
      "inspectorTimeoutMillisecondsForTests",
    ],
    "coordinator stage authorization dependencies",
  );
  if (authorizationSource.effectiveUserId !== effectiveUserId) {
    fail("coordinator stage authorization effectiveUserId differs");
  }
  const authorizationDependencies: Record<string, unknown> =
    Object.create(null);
  authorizationDependencies.effectiveUserId = effectiveUserId;
  authorizationDependencies.inspectorPythonExecutable = stringValue(
    authorizationSource.inspectorPythonExecutable,
    "authorization inspector executable",
  );
  for (const key of [
    "inspectorScriptForTests",
    "inspectorTimeoutMillisecondsForTests",
    "inspectorMaxOutputBytesForTests",
  ]) {
    if (Object.prototype.hasOwnProperty.call(authorizationSource, key)) {
      authorizationDependencies[key] =
        key === "inspectorScriptForTests"
          ? stringValue(
              authorizationSource[key],
              "authorization inspector script",
            )
          : positiveIntegerValue(
              authorizationSource[key],
              `authorization ${key}`,
            );
    }
  }
  Object.assign(
    authorizationDependencies,
    optionalFunctionFields(
      authorizationSource,
      [
        "afterLeaseAcquiredForTests",
        "beforeHeldStageEntryInspectionForTests",
        "beforeLeaseRemovalForTests",
        "closeDirectoryForTests",
      ],
      "authorization dependencies",
    ),
  );

  const consumerSource = exactRecord(
    dependencies.consumer,
    ["expectedManifestIdentity", "verifyBundle"],
    [],
    "coordinator consumer dependencies",
  );
  const manifestIdentity = exactRecord(
    consumerSource.expectedManifestIdentity,
    ["bytes", "path", "sha256"],
    [],
    "coordinator expected manifest identity",
  );
  if (
    typeof manifestIdentity.sha256 !== "string" ||
    !SHA256_RE.test(manifestIdentity.sha256)
  ) {
    fail("coordinator expected manifest SHA-256 is invalid");
  }
  const consumerDependencies = frozenRecord({
    verifyBundle: functionValue(
      consumerSource.verifyBundle,
      "coordinator bundle verifier",
    ) as FloodgateTrainingRowConsumerDependencies["verifyBundle"],
    expectedManifestIdentity: frozenRecord({
      path: stringValue(manifestIdentity.path, "manifest identity path"),
      bytes: positiveIntegerValue(
        manifestIdentity.bytes,
        "manifest identity bytes",
      ),
      sha256: manifestIdentity.sha256,
    }),
  });

  const proposerSource = exactRecord(
    dependencies.proposer,
    ["search"],
    [],
    "coordinator proposer dependencies",
  );
  const proposerDependencies = frozenRecord({
    search: functionValue(
      proposerSource.search,
      "coordinator proposer search",
    ) as FloodgateStableWasmProposerDependencies["search"],
  });

  const checkpointSource = exactRecord(
    dependencies.checkpoint ?? {},
    [],
    ["closeForTests", "failpointForTests", "writeForTests"],
    "coordinator checkpoint dependencies",
  );
  const checkpointDependencies = frozenRecord(
    optionalFunctionFields(
      checkpointSource,
      ["closeForTests", "failpointForTests", "writeForTests"],
      "checkpoint dependencies",
    ),
  ) as FloodgateStableProposalCoordinatorCheckpointDependencies;

  const finalizerSource = exactRecord(
    dependencies.finalizer ?? {},
    [],
    ["failpointForTests"],
    "coordinator finalizer dependencies",
  );
  const finalizerDependencies = frozenRecord(
    optionalFunctionFields(
      finalizerSource,
      ["failpointForTests"],
      "finalizer dependencies",
    ),
  ) as FloodgateStableProposalCoordinatorFinalizerDependencies;

  const publicationSource = exactRecord(
    dependencies.publication,
    ["exclusiveRename"],
    [
      "beforeDestinationReopenForTests",
      "beforeReconcileForTests",
      "closePublicationDirectoryForTests",
      "removeLeaseDirectoryForTests",
      "syncDirectoryForTests",
    ],
    "coordinator publication dependencies",
  );
  const publicationDependencies = frozenRecord({
    exclusiveRename: functionValue(
      publicationSource.exclusiveRename,
      "coordinator exclusive rename",
    ) as FloodgateTeacherStagePublicationDependencies["exclusiveRename"],
    ...optionalFunctionFields(
      publicationSource,
      [
        "beforeDestinationReopenForTests",
        "beforeReconcileForTests",
        "closePublicationDirectoryForTests",
        "removeLeaseDirectoryForTests",
        "syncDirectoryForTests",
      ],
      "publication dependencies",
    ),
  }) as FloodgateTeacherStagePublicationDependencies;
  const phaseHook = dependencies.phaseHookForTests;
  if (
    phaseHook !== undefined &&
    (typeof phaseHook !== "function" || nodeUtilTypes.isProxy(phaseHook))
  ) {
    fail("coordinator phase hook must be a non-Proxy function");
  }
  const stageAuthorizationOptions = captureStageOptions(
    options.stageAuthorization as FloodgateTeacherStageAuthorizationOptions,
  );
  const consumerOptions = captureConsumerOptions(
    options.consumer as FloodgateTrainingRowConsumerOptions,
  );
  const rootKey = copyBytes(rootKeySource, "coordinator rootKey", 32);

  return frozenRecord({
    options: frozenRecord({
      stageAuthorization: stageAuthorizationOptions,
      consumer: consumerOptions,
      proposerAssets,
      proposerOptions,
      checkpoint: frozenRecord({
        runId: checkpoint.runId,
        keyId: checkpoint.keyId,
      }) as FloodgateStableProposalCheckpointOptions,
    }),
    dependencies: frozenRecord({
      rootKey,
      effectiveUserId,
      stageAuthorization: Object.freeze(
        authorizationDependencies,
      ) as unknown as FloodgateTeacherStageAuthorizationDependencies,
      consumer: consumerDependencies,
      proposer: proposerDependencies,
      checkpoint: checkpointDependencies,
      finalizer: finalizerDependencies,
      publication: publicationDependencies,
      phaseHook: phaseHook as CapturedInvocation["dependencies"]["phaseHook"],
    }),
  });
}

function failureDetail(value: unknown): string {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    try {
      return String(value);
    } catch {
      return "unprintable primitive failure";
    }
  }
  if (nodeUtilTypes.isProxy(value)) return "uninspectable Proxy failure";
  try {
    if ("message" in value) {
      const message = Reflect.get(value, "message", value) as unknown;
      if (typeof message === "string") return message;
    }
  } catch {
    return "uninspectable failure object";
  }
  return "non-message failure object";
}

async function closeLease(
  lease: Readonly<FloodgateTeacherStageLease>,
  cleanupFailures: unknown[],
): Promise<boolean> {
  try {
    await lease.close();
    return false;
  } catch (error) {
    cleanupFailures.push(error);
    return true;
  }
}

function finalizerFacets(value: unknown): Readonly<{
  readonly isFinalizerError: boolean;
  readonly phase?: string;
  readonly postflightClaimConsumed: boolean;
  readonly mayHavePublished: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition?: string;
}> {
  const unknownFacets = (): Readonly<{
    readonly isFinalizerError: false;
    readonly postflightClaimConsumed: false;
    readonly mayHavePublished: true;
    readonly leaseMayRemain: true;
  }> =>
    frozenRecord({
      isFinalizerError: false as const,
      postflightClaimConsumed: false as const,
      mayHavePublished: true as const,
      leaseMayRemain: true as const,
    });
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    nodeUtilTypes.isProxy(value)
  ) {
    return unknownFacets();
  }
  let isFinalizerError = false;
  try {
    isFinalizerError = value instanceof FloodgateStableProposalFinalizerError;
  } catch {
    return unknownFacets();
  }
  if (!isFinalizerError) {
    return unknownFacets();
  }
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value as object);
    const data = (key: string): unknown => {
      const descriptor = descriptors[key];
      return descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
    };
    const phase = data("phase");
    const postflightClaimConsumed = data("postflightClaimConsumed");
    const mayHavePublished = data("mayHavePublished");
    const leaseMayRemain = data("leaseMayRemain");
    const retryDisposition = data("retryDisposition");
    if (
      typeof phase !== "string" ||
      typeof postflightClaimConsumed !== "boolean" ||
      typeof mayHavePublished !== "boolean" ||
      typeof leaseMayRemain !== "boolean" ||
      typeof retryDisposition !== "string"
    ) {
      return unknownFacets();
    }
    return frozenRecord({
      isFinalizerError: true,
      phase,
      postflightClaimConsumed,
      mayHavePublished,
      leaseMayRemain,
      retryDisposition,
    });
  } catch {
    return unknownFacets();
  }
}

async function authorizationMarkerMayRemain(
  options: Readonly<FloodgateTeacherStageAuthorizationOptions>,
): Promise<boolean> {
  const marker = path.join(
    options.publicationParent,
    `.${options.stageBasename}.authorization-lease`,
  );
  try {
    await fs.promises.lstat(marker);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function fire(
  invocation: CapturedInvocation,
  event: FloodgateStableProposalCoordinatorEvent,
): Promise<void> {
  await invocation.dependencies.phaseHook?.(event);
}

/**
 * Run the synthetic consumer-to-private-publication path with exact runtime
 * capabilities and fixed existing boundary implementations.
 */
export async function runFloodgateStableProposalCoordinatorCoreForTests(
  options: FloodgateStableProposalCoordinatorOptions,
  dependencies: FloodgateStableProposalCoordinatorDependencies,
): Promise<Readonly<FloodgateStableProposalCoordinatorReceipt>> {
  let invocation: CapturedInvocation;
  try {
    invocation = captureInvocation(options, dependencies);
  } catch (primary) {
    throw new FloodgateStableProposalCoordinatorError(failureDetail(primary), {
      phase: "capture",
      inputClaimed: false,
      proposalComplete: false,
      checkpointStarted: false,
      checkpointComplete: false,
      postflightMinted: false,
      freshLeaseAcquired: false,
      finalizerStarted: false,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "rerun-synthetic-coordinator-with-fresh-authority",
      primary,
    });
  }

  const progress: MutableProgress = {
    phase: "consumer-claim-proposer",
    inputClaimed: false,
    proposalComplete: false,
    checkpointStarted: false,
    checkpointComplete: false,
    postflightMinted: false,
    freshLeaseAcquired: false,
    finalizerStarted: false,
  };
  let initialLease: Readonly<FloodgateTeacherStageLease> | undefined;
  let freshLease: Readonly<FloodgateTeacherStageLease> | undefined;
  let postflight:
    Readonly<FloodgateTrainingConsumerPostflightReceipt> | undefined;
  let finalization:
    Readonly<FloodgateStableProposalFinalizationReceipt> | undefined;
  let authorizationFailedWithoutLease = false;
  let primary: unknown;

  try {
    postflight =
      await withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
        invocation.options.consumer,
        async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
          claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(input);
          progress.inputClaimed = true;
          await fire(invocation, "input-claimed");
          const artifact =
            await generateFloodgateStableWasmProposalsCoreForTests(
              input,
              invocation.options.proposerAssets,
              invocation.options.proposerOptions,
              invocation.dependencies.proposer,
            );
          progress.proposalComplete = true;
          await fire(invocation, "proposal-complete");
          progress.phase = "checkpoint-authorization";
          try {
            initialLease = await authorizeFloodgateTeacherStageCoreForTests(
              invocation.options.stageAuthorization,
              invocation.dependencies.stageAuthorization,
            );
          } catch (error) {
            authorizationFailedWithoutLease = true;
            throw error;
          }
          await fire(invocation, "initial-lease-acquired");
          progress.phase = "checkpoint";
          const checkpointRootKey = Buffer.from(
            invocation.dependencies.rootKey,
          );
          let checkpointPromise: Promise<
            Readonly<FloodgateStableProposalCheckpointReceipt>
          >;
          try {
            checkpointPromise = checkpointFloodgateStableProposalsCoreForTests(
              initialLease,
              artifact,
              invocation.options.checkpoint,
              {
                rootKey: checkpointRootKey,
                effectiveUserId: invocation.dependencies.effectiveUserId,
                ...invocation.dependencies.checkpoint,
              },
            );
            progress.checkpointStarted = true;
          } finally {
            checkpointRootKey.fill(0);
          }
          await checkpointPromise;
          initialLease = undefined;
          progress.checkpointComplete = true;
          await fire(invocation, "checkpoint-complete");
          progress.phase = "checkpoint-authorization";
          try {
            freshLease = await authorizeFloodgateTeacherStageCoreForTests(
              invocation.options.stageAuthorization,
              invocation.dependencies.stageAuthorization,
            );
          } catch (error) {
            authorizationFailedWithoutLease = true;
            throw error;
          }
          progress.freshLeaseAcquired = true;
          progress.phase = "consumer-postflight";
          await fire(invocation, "fresh-lease-acquired");
        },
        invocation.dependencies.consumer,
      );
    progress.postflightMinted = true;
    progress.phase = "consumer-postflight";
    await fire(invocation, "postflight-complete");
    await fire(invocation, "before-finalization");
    if (freshLease === undefined) {
      fail("consumer callback completed without a fresh finalizer lease");
    }

    progress.phase = "finalization-publication";
    const finalizerRootKey = Buffer.from(invocation.dependencies.rootKey);
    const finalizerOptions: FloodgateStableProposalFinalizerOptions = {
      rootKey: finalizerRootKey,
      runId: invocation.options.checkpoint.runId,
      keyId: invocation.options.checkpoint.keyId,
    };
    let finalizerPromise: Promise<
      Readonly<FloodgateStableProposalFinalizationReceipt>
    >;
    try {
      finalizerPromise = finalizeAndPublishFloodgateStableProposalsCoreForTests(
        freshLease,
        postflight,
        finalizerOptions,
        {
          effectiveUserId: invocation.dependencies.effectiveUserId,
          ...invocation.dependencies.finalizer,
        },
        invocation.dependencies.publication,
      );
      progress.finalizerStarted = true;
    } finally {
      finalizerRootKey.fill(0);
    }
    finalization = await finalizerPromise;
  } catch (error) {
    primary = error;
  }

  invocation.dependencies.rootKey.fill(0);

  if (primary === undefined && finalization !== undefined) {
    return frozenRecord({
      contract: FLOODGATE_STABLE_PROPOSAL_COORDINATOR_CONTRACT,
      status: FLOODGATE_STABLE_PROPOSAL_COORDINATOR_STATUS,
      claim_boundary: FLOODGATE_STABLE_PROPOSAL_COORDINATOR_CLAIM_BOUNDARY,
      execution_boundary: "test-only-fixed-boundary-composition" as const,
      execution_path: "generate-and-checkpoint" as const,
      run_id: invocation.options.checkpoint.runId,
      key_id: invocation.options.checkpoint.keyId,
      handoff: frozenRecord({
        exact_input_claimed_synchronously: true as const,
        initial_checkpoint_lease_closed_before_postflight: true as const,
        exact_postflight_minted: true as const,
        fresh_finalizer_lease_acquired: true as const,
        finalizer_contract: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT,
      }),
      finalization,
    });
  }

  const cleanupFailures: unknown[] = [];
  let leaseMayRemain = false;
  const finalizer = finalizerFacets(primary);
  if (initialLease !== undefined && !progress.checkpointStarted) {
    leaseMayRemain =
      (await closeLease(initialLease, cleanupFailures)) || leaseMayRemain;
  } else if (progress.checkpointStarted && !progress.checkpointComplete) {
    leaseMayRemain =
      (await authorizationMarkerMayRemain(
        invocation.options.stageAuthorization,
      )) || leaseMayRemain;
  }
  if (authorizationFailedWithoutLease) {
    leaseMayRemain =
      (await authorizationMarkerMayRemain(
        invocation.options.stageAuthorization,
      )) || leaseMayRemain;
  }
  if (freshLease !== undefined) {
    if (!progress.finalizerStarted) {
      leaseMayRemain =
        (await closeLease(freshLease, cleanupFailures)) || leaseMayRemain;
    } else if (
      finalizer.isFinalizerError &&
      finalizer.phase === "authority-transfer"
    ) {
      leaseMayRemain =
        (await closeLease(freshLease, cleanupFailures)) || leaseMayRemain;
    } else {
      leaseMayRemain = finalizer.leaseMayRemain || leaseMayRemain;
    }
  }
  if (
    postflight !== undefined &&
    !(
      progress.finalizerStarted &&
      finalizer.isFinalizerError &&
      finalizer.postflightClaimConsumed === true
    )
  ) {
    try {
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(postflight);
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  const mayHavePublished =
    progress.finalizerStarted && finalizer.mayHavePublished;
  const manualContentReconciliation =
    finalizer.isFinalizerError &&
    finalizer.retryDisposition === "manual-content-reconciliation-required";
  const retryDisposition: FloodgateStableProposalCoordinatorRetryDisposition =
    mayHavePublished && leaseMayRemain
      ? "manual-publication-and-lease-reconciliation-required"
      : mayHavePublished
        ? "manual-publication-reconciliation-required"
        : leaseMayRemain
          ? "manual-lease-reconciliation-required"
          : manualContentReconciliation
            ? "manual-content-reconciliation-required"
            : progress.checkpointComplete
              ? "resume-finalization-over-complete-authenticated-work"
              : "rerun-synthetic-coordinator-with-fresh-authority";
  throw new FloodgateStableProposalCoordinatorError(failureDetail(primary), {
    phase: progress.phase,
    inputClaimed: progress.inputClaimed,
    proposalComplete: progress.proposalComplete,
    checkpointStarted: progress.checkpointStarted,
    checkpointComplete: progress.checkpointComplete,
    postflightMinted: progress.postflightMinted,
    freshLeaseAcquired: progress.freshLeaseAcquired,
    finalizerStarted: progress.finalizerStarted,
    mayHavePublished,
    leaseMayRemain,
    retryDisposition,
    primary,
    cleanupFailures,
  });
}
