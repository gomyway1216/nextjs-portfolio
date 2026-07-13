/**
 * Test-only coordinator for resuming finalization over an existing complete
 * authenticated stable-proposal work stream.
 *
 * This boundary never invokes the proposer or checkpoint writer. It composes
 * one exact consumer claim, one fresh stage lease, one postflight capability,
 * and the fixed finalizer. It does not establish labels or playing strength.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

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
  type FloodgateTeacherStagePublicationDurability,
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

export const FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CONTRACT =
  "shogi-floodgate-stable-proposal-finalization-resume-coordinator-v1" as const;
export const FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_STATUS =
  "synthetic-consumer-postflight-authenticated-work-finalization-resume-publication-complete" as const;
export const FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CLAIM_BOUNDARY =
  "test-only-synthetic-finalization-resume-composition-evidence-not-proposal-generation-engine-teacher-label-training-or-playing-strength-evidence" as const;

const RUN_ID_RE = /^[0-9a-f]{64}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;
const SAFE_BASENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PUBLICATION_DURABILITIES = new Set<string>([
  "not-established",
  "renamed-parent-synced",
  "published-and-lease-removal-durable",
]);
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

export type FloodgateStableProposalFinalizationResumePhase =
  | "capture"
  | "consumer-claim"
  | "finalization-authorization"
  | "consumer-postflight"
  | "finalization-publication"
  | "cleanup";

export type FloodgateStableProposalFinalizationResumeEvent =
  | "input-claimed"
  | "fresh-finalizer-lease-acquired"
  | "postflight-complete"
  | "before-finalization";

export type FloodgateStableProposalFinalizationResumeRetryDisposition =
  | "rerun-finalization-resume-with-fresh-authority"
  | "complete-authenticated-work-verification-required"
  | "manual-content-reconciliation-required"
  | "manual-lease-reconciliation-required"
  | "manual-publication-reconciliation-required"
  | "manual-publication-and-lease-reconciliation-required";

export interface FloodgateStableProposalFinalizationResumeOptions {
  readonly stageAuthorization: FloodgateTeacherStageAuthorizationOptions;
  readonly consumer: FloodgateTrainingRowConsumerOptions;
  readonly finalization: Readonly<{
    readonly runId: string;
    readonly keyId: string;
  }>;
}

export type FloodgateStableProposalFinalizationResumeFinalizerDependencies =
  Omit<FloodgateStableProposalFinalizerDependencies, "effectiveUserId">;

export interface FloodgateStableProposalFinalizationResumeDependencies {
  readonly rootKey: Uint8Array;
  readonly effectiveUserId: number;
  readonly stageAuthorization: FloodgateTeacherStageAuthorizationDependencies;
  readonly consumer: FloodgateTrainingRowConsumerDependencies;
  readonly finalizer?: FloodgateStableProposalFinalizationResumeFinalizerDependencies;
  readonly publication: FloodgateTeacherStagePublicationDependencies;
  readonly phaseHookForTests?: (
    event: FloodgateStableProposalFinalizationResumeEvent,
  ) => void | Promise<void>;
}

export interface FloodgateStableProposalFinalizationResumeReceipt {
  readonly contract: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CONTRACT;
  readonly status: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_STATUS;
  readonly claim_boundary: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CLAIM_BOUNDARY;
  readonly execution_boundary: "test-only-fixed-boundary-composition";
  readonly execution_path: "resume-finalization-only";
  readonly run_id: string;
  readonly key_id: string;
  readonly handoff: Readonly<{
    readonly proposer_skipped: true;
    readonly checkpoint_skipped: true;
    readonly exact_input_claimed_synchronously: true;
    readonly exact_postflight_minted: true;
    readonly fresh_finalizer_lease_acquired: true;
    readonly finalizer_contract: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT;
  }>;
  readonly finalization: Readonly<FloodgateStableProposalFinalizationReceipt>;
}

export type FloodgateStableProposalFinalizationResumePostflightClaimState =
  boolean | "unknown";

interface ResumeErrorFacets {
  readonly phase: FloodgateStableProposalFinalizationResumePhase;
  readonly inputClaimed: boolean;
  readonly leaseAcquired: boolean;
  readonly postflightMinted: boolean;
  readonly finalizerStarted: boolean;
  readonly observedState: string;
  readonly workVerified: boolean;
  readonly postflightClaimConsumed: FloodgateStableProposalFinalizationResumePostflightClaimState;
  readonly mayHavePersisted: boolean;
  readonly mayHavePublished: boolean;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition: FloodgateStableProposalFinalizationResumeRetryDisposition;
  readonly primary: unknown;
  readonly cleanupFailures?: readonly unknown[];
}

export class FloodgateStableProposalFinalizationResumeError extends Error {
  readonly phase: FloodgateStableProposalFinalizationResumePhase;
  readonly inputClaimed: boolean;
  readonly leaseAcquired: boolean;
  readonly postflightMinted: boolean;
  readonly finalizerStarted: boolean;
  readonly observedState: string;
  readonly workVerified: boolean;
  readonly postflightClaimConsumed: FloodgateStableProposalFinalizationResumePostflightClaimState;
  readonly mayHavePersisted: boolean;
  readonly mayHavePublished: boolean;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition: FloodgateStableProposalFinalizationResumeRetryDisposition;
  readonly primary: unknown;
  readonly cleanupFailures: readonly unknown[];

  constructor(message: string, facets: Readonly<ResumeErrorFacets>) {
    super(`Floodgate stable proposal finalization resume failed: ${message}`, {
      cause: facets.primary,
    });
    this.name = "FloodgateStableProposalFinalizationResumeError";
    this.phase = facets.phase;
    this.inputClaimed = facets.inputClaimed;
    this.leaseAcquired = facets.leaseAcquired;
    this.postflightMinted = facets.postflightMinted;
    this.finalizerStarted = facets.finalizerStarted;
    this.observedState = facets.observedState;
    this.workVerified = facets.workVerified;
    this.postflightClaimConsumed = facets.postflightClaimConsumed;
    this.mayHavePersisted = facets.mayHavePersisted;
    this.mayHavePublished = facets.mayHavePublished;
    this.publicationDurability = facets.publicationDurability;
    this.destinationReopened = facets.destinationReopened;
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
    readonly finalization: Readonly<{
      readonly runId: string;
      readonly keyId: string;
    }>;
  }>;
  readonly dependencies: Readonly<{
    readonly rootKey: Buffer;
    readonly effectiveUserId: number;
    readonly stageAuthorization: FloodgateTeacherStageAuthorizationDependencies;
    readonly consumer: FloodgateTrainingRowConsumerDependencies;
    readonly finalizer: FloodgateStableProposalFinalizationResumeFinalizerDependencies;
    readonly publication: FloodgateTeacherStagePublicationDependencies;
    readonly phaseHook?: FloodgateStableProposalFinalizationResumeDependencies["phaseHookForTests"];
  }>;
}

interface MutableProgress {
  phase: FloodgateStableProposalFinalizationResumePhase;
  inputClaimed: boolean;
  leaseAcquired: boolean;
  postflightMinted: boolean;
  finalizerStarted: boolean;
}

interface FinalizerFacets {
  readonly isFinalizerError: boolean;
  readonly phase?: string;
  readonly observedState: string;
  readonly workVerified: boolean;
  readonly postflightClaimConsumed: boolean;
  readonly mayHavePersisted: boolean;
  readonly mayHavePublished: boolean;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition?: string;
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
  exactLength: number,
): Readonly<{ readonly byteLength: number; readonly value: Uint8Array }> {
  if (
    !nodeUtilTypes.isUint8Array(value) ||
    nodeUtilTypes.isProxy(value) ||
    nativeTypedArrayBuffer === undefined ||
    nativeTypedArrayByteLength === undefined
  ) {
    fail(`${label} must be a non-shared ${exactLength}-byte Uint8Array`);
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
    return fail(`${label} must be a non-shared ${exactLength}-byte Uint8Array`);
  }
  if (
    nodeUtilTypes.isSharedArrayBuffer(backing) ||
    byteLength !== exactLength
  ) {
    fail(`${label} must be a non-shared ${exactLength}-byte Uint8Array`);
  }
  return frozenRecord({ byteLength, value });
}

function copyBytes(value: unknown, label: string, exactLength: number): Buffer {
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

function markerPublicationParent(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (
    result.trim() !== result ||
    CONTROL_CHARACTER_RE.test(result) ||
    path.resolve(result) !== result ||
    path.parse(result).root === result
  ) {
    fail(`${label} must be a canonical non-root absolute path`);
  }
  return result;
}

function markerStageBasename(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (
    !SAFE_BASENAME_RE.test(result) ||
    result === "." ||
    result === ".." ||
    result.includes("/") ||
    result.includes("\\") ||
    path.basename(result) !== result
  ) {
    fail(`${label} must be a strict direct-child basename`);
  }
  return result;
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
    "resume stage authorization options",
  );
  if (
    !Array.isArray(source.engineArgs) ||
    nodeUtilTypes.isProxy(source.engineArgs) ||
    Object.getPrototypeOf(source.engineArgs) !== Array.prototype
  ) {
    fail("resume stage authorization engineArgs must be an ordinary array");
  }
  const descriptors = Object.getOwnPropertyDescriptors(source.engineArgs);
  if (Reflect.ownKeys(descriptors).length !== source.engineArgs.length + 1) {
    fail("resume stage authorization engineArgs must be dense");
  }
  const engineArgs = Object.freeze(
    Array.from({ length: source.engineArgs.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        fail(
          `resume stage authorization engineArgs[${index}] must be an enumerable data property`,
        );
      }
      return stringValue(
        descriptor.value,
        `resume stage authorization engineArgs[${index}]`,
      );
    }),
  );
  const captured: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(source)) {
    captured[key] =
      key === "engineArgs"
        ? engineArgs
        : key === "publicationParent"
          ? markerPublicationParent(
              source[key],
              "resume stage authorization publicationParent",
            )
          : key === "stageBasename"
            ? markerStageBasename(
                source[key],
                "resume stage authorization stageBasename",
              )
            : stringValue(source[key], `resume stage authorization ${key}`);
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
    "resume consumer options",
  );
  return frozenRecord({
    repositoryRoot: stringValue(
      source.repositoryRoot,
      "resume consumer repositoryRoot",
    ),
    verifierRevision: stringValue(
      source.verifierRevision,
      "resume consumer verifierRevision",
    ),
    rawLockRoot: stringValue(source.rawLockRoot, "resume consumer rawLockRoot"),
    roleLockRoot: stringValue(
      source.roleLockRoot,
      "resume consumer roleLockRoot",
    ),
    legacyProtectedPositionIdsPath: stringValue(
      source.legacyProtectedPositionIdsPath,
      "resume consumer legacyProtectedPositionIdsPath",
    ),
    outputRoot: stringValue(source.outputRoot, "resume consumer outputRoot"),
  });
}

function captureInvocation(
  optionsValue: FloodgateStableProposalFinalizationResumeOptions,
  dependenciesValue: FloodgateStableProposalFinalizationResumeDependencies,
): CapturedInvocation {
  const options = exactRecord(
    optionsValue,
    ["consumer", "finalization", "stageAuthorization"],
    [],
    "finalization resume options",
  );
  const dependencies = exactRecord(
    dependenciesValue,
    [
      "consumer",
      "effectiveUserId",
      "publication",
      "rootKey",
      "stageAuthorization",
    ],
    ["finalizer", "phaseHookForTests"],
    "finalization resume dependencies",
  );
  const finalization = exactRecord(
    options.finalization,
    ["keyId", "runId"],
    [],
    "finalization resume identity",
  );
  if (
    typeof finalization.runId !== "string" ||
    !RUN_ID_RE.test(finalization.runId)
  ) {
    fail("finalization resume runId must be 32 bytes of lowercase hex");
  }
  if (
    typeof finalization.keyId !== "string" ||
    !KEY_ID_RE.test(finalization.keyId)
  ) {
    fail("finalization resume keyId is invalid");
  }
  const rootKeySource = dependencies.rootKey;
  byteViewFacts(rootKeySource, "finalization resume rootKey", 32);
  const effectiveUserId = integerValue(
    dependencies.effectiveUserId,
    "finalization resume effectiveUserId",
  );

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
    "finalization resume stage authorization dependencies",
  );
  if (authorizationSource.effectiveUserId !== effectiveUserId) {
    fail("finalization resume stage authorization effectiveUserId differs");
  }
  const authorizationDependencies: Record<string, unknown> =
    Object.create(null);
  authorizationDependencies.effectiveUserId = effectiveUserId;
  authorizationDependencies.inspectorPythonExecutable = stringValue(
    authorizationSource.inspectorPythonExecutable,
    "resume authorization inspector executable",
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
              "resume authorization inspector script",
            )
          : positiveIntegerValue(
              authorizationSource[key],
              `resume authorization ${key}`,
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
      "resume authorization dependencies",
    ),
  );

  const consumerSource = exactRecord(
    dependencies.consumer,
    ["expectedManifestIdentity", "verifyBundle"],
    [],
    "finalization resume consumer dependencies",
  );
  const manifestIdentity = exactRecord(
    consumerSource.expectedManifestIdentity,
    ["bytes", "path", "sha256"],
    [],
    "finalization resume expected manifest identity",
  );
  if (
    typeof manifestIdentity.sha256 !== "string" ||
    !SHA256_RE.test(manifestIdentity.sha256)
  ) {
    fail("finalization resume expected manifest SHA-256 is invalid");
  }
  const consumerDependencies = frozenRecord({
    verifyBundle: functionValue(
      consumerSource.verifyBundle,
      "finalization resume bundle verifier",
    ) as FloodgateTrainingRowConsumerDependencies["verifyBundle"],
    expectedManifestIdentity: frozenRecord({
      path: stringValue(manifestIdentity.path, "resume manifest identity path"),
      bytes: positiveIntegerValue(
        manifestIdentity.bytes,
        "resume manifest identity bytes",
      ),
      sha256: manifestIdentity.sha256,
    }),
  });

  const finalizerSource = exactRecord(
    dependencies.finalizer ?? {},
    [],
    ["failpointForTests"],
    "finalization resume finalizer dependencies",
  );
  const finalizerDependencies = frozenRecord(
    optionalFunctionFields(
      finalizerSource,
      ["failpointForTests"],
      "finalization resume finalizer dependencies",
    ),
  ) as FloodgateStableProposalFinalizationResumeFinalizerDependencies;

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
    "finalization resume publication dependencies",
  );
  const publicationDependencies = frozenRecord({
    exclusiveRename: functionValue(
      publicationSource.exclusiveRename,
      "finalization resume exclusive rename",
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
      "finalization resume publication dependencies",
    ),
  }) as FloodgateTeacherStagePublicationDependencies;

  const phaseHook = dependencies.phaseHookForTests;
  if (
    phaseHook !== undefined &&
    (typeof phaseHook !== "function" || nodeUtilTypes.isProxy(phaseHook))
  ) {
    fail("finalization resume phase hook must be a non-Proxy function");
  }
  const stageAuthorizationOptions = captureStageOptions(
    options.stageAuthorization as FloodgateTeacherStageAuthorizationOptions,
  );
  const consumerOptions = captureConsumerOptions(
    options.consumer as FloodgateTrainingRowConsumerOptions,
  );
  const rootKey = copyBytes(rootKeySource, "finalization resume rootKey", 32);

  return frozenRecord({
    options: frozenRecord({
      stageAuthorization: stageAuthorizationOptions,
      consumer: consumerOptions,
      finalization: frozenRecord({
        runId: finalization.runId,
        keyId: finalization.keyId,
      }),
    }),
    dependencies: frozenRecord({
      rootKey,
      effectiveUserId,
      stageAuthorization: Object.freeze(
        authorizationDependencies,
      ) as unknown as FloodgateTeacherStageAuthorizationDependencies,
      consumer: consumerDependencies,
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

function finalizerFacets(value: unknown): Readonly<FinalizerFacets> {
  const unknownFacets = (): Readonly<FinalizerFacets> =>
    frozenRecord({
      isFinalizerError: false,
      observedState: "uninspected",
      workVerified: false,
      postflightClaimConsumed: false,
      mayHavePersisted: true,
      mayHavePublished: true,
      publicationDurability: "not-established" as const,
      destinationReopened: true,
      leaseMayRemain: true,
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
  if (!isFinalizerError) return unknownFacets();
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value as object);
    const data = (key: string): unknown => {
      const descriptor = descriptors[key];
      return descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
    };
    const phase = data("phase");
    const observedState = data("observedState");
    const workVerified = data("workVerified");
    const postflightClaimConsumed = data("postflightClaimConsumed");
    const mayHavePersisted = data("mayHavePersisted");
    const mayHavePublished = data("mayHavePublished");
    const publicationDurability = data("publicationDurability");
    const destinationReopened = data("destinationReopened");
    const leaseMayRemain = data("leaseMayRemain");
    const retryDisposition = data("retryDisposition");
    if (
      typeof phase !== "string" ||
      typeof observedState !== "string" ||
      typeof workVerified !== "boolean" ||
      typeof postflightClaimConsumed !== "boolean" ||
      typeof mayHavePersisted !== "boolean" ||
      typeof mayHavePublished !== "boolean" ||
      typeof publicationDurability !== "string" ||
      !PUBLICATION_DURABILITIES.has(publicationDurability) ||
      typeof destinationReopened !== "boolean" ||
      typeof leaseMayRemain !== "boolean" ||
      typeof retryDisposition !== "string"
    ) {
      return unknownFacets();
    }
    return frozenRecord({
      isFinalizerError: true,
      phase,
      observedState,
      workVerified,
      postflightClaimConsumed,
      mayHavePersisted,
      mayHavePublished,
      publicationDurability:
        publicationDurability as FloodgateTeacherStagePublicationDurability,
      destinationReopened,
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
  event: FloodgateStableProposalFinalizationResumeEvent,
): Promise<void> {
  await invocation.dependencies.phaseHook?.(event);
}

/**
 * Resume only deterministic finalization and publication over an already
 * complete authenticated work stream. No proposer or checkpoint surface is
 * accepted by this API.
 */
export async function resumeAndPublishFloodgateStableProposalFinalizationCoreForTests(
  options: FloodgateStableProposalFinalizationResumeOptions,
  dependencies: FloodgateStableProposalFinalizationResumeDependencies,
): Promise<Readonly<FloodgateStableProposalFinalizationResumeReceipt>> {
  let invocation: CapturedInvocation;
  try {
    invocation = captureInvocation(options, dependencies);
  } catch (primary) {
    throw new FloodgateStableProposalFinalizationResumeError(
      failureDetail(primary),
      {
        phase: "capture",
        inputClaimed: false,
        leaseAcquired: false,
        postflightMinted: false,
        finalizerStarted: false,
        observedState: "uninspected",
        workVerified: false,
        postflightClaimConsumed: false,
        mayHavePersisted: false,
        mayHavePublished: false,
        publicationDurability: "not-established",
        destinationReopened: false,
        leaseMayRemain: false,
        retryDisposition: "rerun-finalization-resume-with-fresh-authority",
        primary,
      },
    );
  }

  const progress: MutableProgress = {
    phase: "consumer-claim",
    inputClaimed: false,
    leaseAcquired: false,
    postflightMinted: false,
    finalizerStarted: false,
  };
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
          progress.phase = "finalization-authorization";
          try {
            freshLease = await authorizeFloodgateTeacherStageCoreForTests(
              invocation.options.stageAuthorization,
              invocation.dependencies.stageAuthorization,
            );
          } catch (error) {
            authorizationFailedWithoutLease = true;
            throw error;
          }
          progress.leaseAcquired = true;
          progress.phase = "consumer-postflight";
          await fire(invocation, "fresh-finalizer-lease-acquired");
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
      runId: invocation.options.finalization.runId,
      keyId: invocation.options.finalization.keyId,
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
      contract: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CONTRACT,
      status: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_STATUS,
      claim_boundary:
        FLOODGATE_STABLE_PROPOSAL_FINALIZATION_RESUME_CLAIM_BOUNDARY,
      execution_boundary: "test-only-fixed-boundary-composition" as const,
      execution_path: "resume-finalization-only" as const,
      run_id: invocation.options.finalization.runId,
      key_id: invocation.options.finalization.keyId,
      handoff: frozenRecord({
        proposer_skipped: true as const,
        checkpoint_skipped: true as const,
        exact_input_claimed_synchronously: true as const,
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

  const typedFinalizer =
    progress.finalizerStarted && finalizer.isFinalizerError;
  const mayHavePersisted =
    progress.finalizerStarted && finalizer.mayHavePersisted;
  const mayHavePublished =
    progress.finalizerStarted && finalizer.mayHavePublished;
  const workVerified = typedFinalizer && finalizer.workVerified;
  const manualContentReconciliation =
    typedFinalizer &&
    finalizer.retryDisposition === "manual-content-reconciliation-required";
  const workVerificationRequired =
    typedFinalizer &&
    finalizer.phase === "work-verification" &&
    !finalizer.workVerified;
  const retryDisposition: FloodgateStableProposalFinalizationResumeRetryDisposition =
    mayHavePublished && leaseMayRemain
      ? "manual-publication-and-lease-reconciliation-required"
      : mayHavePublished
        ? "manual-publication-reconciliation-required"
        : leaseMayRemain
          ? "manual-lease-reconciliation-required"
          : manualContentReconciliation
            ? "manual-content-reconciliation-required"
            : workVerificationRequired
              ? "complete-authenticated-work-verification-required"
              : "rerun-finalization-resume-with-fresh-authority";
  const postflightClaimConsumed: FloodgateStableProposalFinalizationResumePostflightClaimState =
    !progress.finalizerStarted
      ? false
      : finalizer.isFinalizerError
        ? finalizer.postflightClaimConsumed
        : "unknown";
  throw new FloodgateStableProposalFinalizationResumeError(
    failureDetail(primary),
    {
      phase: progress.phase,
      inputClaimed: progress.inputClaimed,
      leaseAcquired: progress.leaseAcquired,
      postflightMinted: progress.postflightMinted,
      finalizerStarted: progress.finalizerStarted,
      observedState:
        typedFinalizer && finalizer.observedState !== ""
          ? finalizer.observedState
          : "uninspected",
      workVerified,
      postflightClaimConsumed,
      mayHavePersisted,
      mayHavePublished,
      publicationDurability:
        progress.finalizerStarted && finalizer.isFinalizerError
          ? finalizer.publicationDurability
          : "not-established",
      destinationReopened:
        progress.finalizerStarted && finalizer.destinationReopened,
      leaseMayRemain,
      retryDisposition,
      primary,
      cleanupFailures,
    },
  );
}
