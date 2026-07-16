/**
 * Test-only interruption-resumable Floodgate v7 label finalization core.
 *
 * The opaque plan used here is synthetic. A later production connector must
 * mint the corresponding capability while it owns the successful sealed-final
 * scan. Nothing in this module is a production registry or playing-strength
 * claim.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  beginFloodgateTeacherStagePublicationCoreForTests,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
  type FloodgateTeacherStagePublicationDurability,
  type FloodgateTeacherStagePublicationReceipt,
  type FloodgateTeacherStagePublicationTransaction,
} from "./floodgate-teacher-stage-authorization";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
} from "./floodgate-v7-teacher-checkpoint";
import {
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN,
} from "./floodgate-v7-training-label-finalizer-key-contract";
import {
  FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY,
  FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS,
  type FloodgateV7TrainingLabelProjection,
  type FloodgateV7TrainingLabelRow,
} from "./floodgate-v7-training-label-projection";
import {
  claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingInputBinding,
} from "./floodgate-training-row-consumer";
import { floodgateIdentifierDigest } from "./floodgate-roles";
import { validateParentGroups } from "./sibling-data";

export {
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN,
} from "./floodgate-v7-training-label-finalizer-key-contract";

export const FLOODGATE_V7_TRAINING_LABEL_PLAN_CONTRACT =
  "shogi-floodgate-v7-training-label-finalization-plan-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PLAN_STATUS =
  "test-only-opaque-one-shot-synthetic-plan" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PLAN_CLAIM_BOUNDARY =
  "weakmap-backed-test-only-synthetic-plan-not-sealed-work-verification-production-authority-publication-training-weight-match-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PLAN_EXECUTION_BOUNDARY =
  "test-only-deep-captured-synthetic-projection-plan" as const;
export const FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA =
  "shogi-floodgate-v7-training-label-result-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA =
  "shogi-floodgate-v7-training-label-manifest-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_FINALIZER_ALGORITHM =
  "hmac-sha256-hkdf-sha256-domain-separated-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT =
  "shogi-floodgate-v7-training-label-finalization-publication-core-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_STATUS =
  "test-only-opaque-plan-exact-prefix-content-finalized-exclusively-published-and-destination-reverified" as const;
export const FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CLAIM_BOUNDARY =
  "test-only-synthetic-opaque-plan-exact-prefix-persistence-domain-separated-result-and-manifest-authentication-and-private-publication-evidence-not-v3-work-origin-authentication-production-authority-teacher-truth-training-weight-or-playing-strength-evidence" as const;

export const FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME =
  "train.jsonl" as const;
export const FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME =
  "result.json" as const;
export const FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME =
  "manifest.json" as const;
export const FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES = Object.freeze([
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
] as const);

const RESULT_STATUS =
  "synthetic-opaque-plan-work-byte-continuity-bound-deterministic-training-label-result-not-trained" as const;
const MANIFEST_STATUS =
  "durable-complete-training-label-artifact-set-ready-for-exclusive-publication" as const;
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const CANONICAL_DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/;
const SAFE_BASENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MODE_MASK = 0o7777;
const READ_CHUNK_BYTES = 1024 * 1024;
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

const objectFreeze = Object.freeze;
const objectCreate = Object.create;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;
const nativePromiseThen = Promise.prototype.then;

export interface FloodgateV7TrainingLabelSyntheticPlanInputForTests {
  readonly runId: string;
  readonly keyId: string;
  readonly teacherRunBindingSha256: string;
  readonly trainingBinding: Readonly<FloodgateTrainingInputBinding>;
  readonly stage: Readonly<{
    readonly parentDev: string;
    readonly parentIno: string;
    readonly stageDev: string;
    readonly stageIno: string;
    readonly stageBasename: string;
    readonly destinationBasename: string;
  }>;
  readonly projections: readonly Readonly<FloodgateV7TrainingLabelProjection>[];
  readonly work: Readonly<{
    readonly filename: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME;
    readonly bytes: number;
    readonly sha256: string;
    readonly snapshot: Readonly<{
      readonly dev: string;
      readonly ino: string;
      readonly mode: string;
      readonly nlink: string;
      readonly uid: string;
      readonly size: string;
      readonly mtimeNs: string;
      readonly ctimeNs: string;
    }>;
  }>;
}

/** Deliberately contains no rows, bytes, paths, callbacks, or key material. */
export interface FloodgateV7TrainingLabelFinalizationPlanForTests {
  readonly contract: typeof FLOODGATE_V7_TRAINING_LABEL_PLAN_CONTRACT;
  readonly status: typeof FLOODGATE_V7_TRAINING_LABEL_PLAN_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_PLAN_CLAIM_BOUNDARY;
  readonly execution_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_PLAN_EXECUTION_BOUNDARY;
}

export interface FloodgateV7TrainingLabelFinalizerOptions {
  readonly rootKey: Uint8Array;
  readonly runId: string;
  readonly keyId: string;
}

export type FloodgateV7TrainingLabelFinalizerEvent =
  | "train-created"
  | "train-written"
  | "train-datasynced"
  | "train-directory-synced"
  | "result-created"
  | "result-written"
  | "result-datasynced"
  | "result-directory-synced"
  | "manifest-created"
  | "manifest-written"
  | "manifest-datasynced"
  | "manifest-directory-synced"
  | "source-reopened"
  | "source-reverified"
  | "before-publication"
  | "before-destination-reopen"
  | "before-destination-reverify"
  | "destination-reverified";

export type FloodgateV7TrainingLabelFinalizerKeyKind =
  "root" | "result" | "manifest";

export interface FloodgateV7TrainingLabelFinalizerDependencies {
  readonly effectiveUserId: number;
  readonly failpointForTests?: (
    event: FloodgateV7TrainingLabelFinalizerEvent,
  ) => void | Promise<void>;
  readonly observeKeyForTests?: (
    kind: FloodgateV7TrainingLabelFinalizerKeyKind,
    key: Uint8Array,
  ) => undefined;
  readonly writeForTests?: (
    request: Readonly<{
      readonly filename:
        | typeof FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME
        | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
        | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME;
      readonly offset: number;
      readonly length: number;
    }>,
    write: (maximumBytes?: number) => Promise<number>,
  ) => Promise<number>;
}

export interface FloodgateV7TrainingLabelPublishedFileEvidence {
  readonly filename:
    | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME;
  readonly dev: string;
  readonly ino: string;
  readonly mode: "0600";
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateV7TrainingLabelFinalizationReceipt {
  readonly contract: typeof FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT;
  readonly status: typeof FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CLAIM_BOUNDARY;
  readonly execution_boundary: "test-only-injected-opaque-plan-finalizer-and-exclusive-private-directory-publication";
  readonly content: Readonly<{
    readonly work: Readonly<FloodgateV7TrainingLabelPublishedFileEvidence>;
    readonly train: Readonly<FloodgateV7TrainingLabelPublishedFileEvidence>;
    readonly result: Readonly<FloodgateV7TrainingLabelPublishedFileEvidence>;
    readonly manifest: Readonly<FloodgateV7TrainingLabelPublishedFileEvidence>;
    readonly parents: number;
    readonly training_records: number;
    readonly consumer_postflight_sha256: string;
  }>;
  readonly publication: Readonly<FloodgateTeacherStagePublicationReceipt>;
  readonly postpublication: Readonly<{
    readonly destination_reopened: true;
    readonly exact_entries: typeof FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES;
    readonly content_reverified: true;
  }>;
}

export type FloodgateV7TrainingLabelFinalizerFailurePhase =
  | "plan-claim"
  | "input-capture"
  | "authority-transfer"
  | "postflight-claim"
  | "cross-binding"
  | "source-work-audit"
  | "train-persistence"
  | "result-persistence"
  | "manifest-persistence"
  | "source-reverification"
  | "publication"
  | "destination-reverification"
  | "cleanup";

export type FloodgateV7TrainingLabelFinalizerDurability =
  | "not-established"
  | "train-directory-synced"
  | "result-directory-synced"
  | "manifest-directory-synced";

export type FloodgateV7TrainingLabelFinalizerRetryDisposition =
  | "caller-must-reconcile-existing-lease-authority"
  | "fresh-authority-may-resume-exact-prefix"
  | "manual-content-reconciliation-required"
  | "manual-content-and-lease-reconciliation-required"
  | "manual-lease-reconciliation-required"
  | "manual-publication-reconciliation-required"
  | "manual-publication-and-lease-reconciliation-required";

export class FloodgateV7TrainingLabelFinalizerError extends Error {
  readonly phase: FloodgateV7TrainingLabelFinalizerFailurePhase;
  readonly observedState: string;
  readonly planConsumed: boolean;
  readonly postflightConsumed: boolean;
  readonly mayHavePersisted: boolean;
  readonly mayHavePublished: boolean;
  readonly durability: FloodgateV7TrainingLabelFinalizerDurability;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition: FloodgateV7TrainingLabelFinalizerRetryDisposition;
  readonly primary: unknown;
  readonly cleanupFailures: readonly unknown[];

  constructor(
    message: string,
    facets: Readonly<{
      phase: FloodgateV7TrainingLabelFinalizerFailurePhase;
      observedState: string;
      planConsumed: boolean;
      postflightConsumed: boolean;
      mayHavePersisted: boolean;
      mayHavePublished: boolean;
      durability: FloodgateV7TrainingLabelFinalizerDurability;
      publicationDurability: FloodgateTeacherStagePublicationDurability;
      destinationReopened: boolean;
      leaseMayRemain: boolean;
      retryDisposition: FloodgateV7TrainingLabelFinalizerRetryDisposition;
      primary: unknown;
      cleanupFailures?: readonly unknown[];
    }>,
  ) {
    super(`Floodgate v7 training-label finalizer failed: ${message}`, {
      cause: facets.primary,
    });
    this.name = "FloodgateV7TrainingLabelFinalizerError";
    this.phase = facets.phase;
    this.observedState = facets.observedState;
    this.planConsumed = facets.planConsumed;
    this.postflightConsumed = facets.postflightConsumed;
    this.mayHavePersisted = facets.mayHavePersisted;
    this.mayHavePublished = facets.mayHavePublished;
    this.durability = facets.durability;
    this.publicationDurability = facets.publicationDurability;
    this.destinationReopened = facets.destinationReopened;
    this.leaseMayRemain = facets.leaseMayRemain;
    this.retryDisposition = facets.retryDisposition;
    this.primary = facets.primary;
    this.cleanupFailures = objectFreeze([...(facets.cleanupFailures ?? [])]);
  }
}

interface CapturedProjection {
  readonly parentId: string;
  readonly forced: boolean;
  readonly rows: readonly Readonly<FloodgateV7TrainingLabelRow>[];
}

interface HiddenPlan {
  readonly runId: string;
  readonly keyId: string;
  readonly teacherRunBindingSha256: string;
  readonly trainingBinding: Readonly<FloodgateTrainingInputBinding>;
  readonly trainingBindingCanonical: string;
  readonly stage: Readonly<{
    readonly parent_dev: string;
    readonly parent_ino: string;
    readonly stage_dev: string;
    readonly stage_ino: string;
    readonly stage_basename: string;
    readonly destination_basename: string;
  }>;
  readonly stageCanonical: string;
  readonly replay: RestartableTrainingReplay;
  readonly expectedTrain: Readonly<TrainSummary>;
  readonly work: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
    readonly snapshot: Readonly<FileSnapshot>;
  }>;
}

interface CapturedInvocation {
  readonly rootKey: Buffer;
  readonly runId: string;
  readonly keyId: string;
  readonly effectiveUserId: number;
  readonly failpoint?: FloodgateV7TrainingLabelFinalizerDependencies["failpointForTests"];
  readonly observeKey?: FloodgateV7TrainingLabelFinalizerDependencies["observeKeyForTests"];
  readonly write?: FloodgateV7TrainingLabelFinalizerDependencies["writeForTests"];
}

interface MutableProgress {
  phase: FloodgateV7TrainingLabelFinalizerFailurePhase;
  observedState: string;
  planConsumed: boolean;
  postflightConsumed: boolean;
  mayHavePersisted: boolean;
  commitStarted: boolean;
  published: boolean;
  durability: FloodgateV7TrainingLabelFinalizerDurability;
  publicationReceipt?: Readonly<FloodgateTeacherStagePublicationReceipt>;
  destinationReopened: boolean;
}

interface FileSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

interface HeldArtifact {
  readonly handle: fs.promises.FileHandle;
  readonly evidence: Readonly<FloodgateV7TrainingLabelPublishedFileEvidence>;
  readonly snapshot: Readonly<FileSnapshot>;
  readonly expectedBytes?: Buffer;
}

interface TrainSummary {
  readonly inputParents: number;
  readonly forcedParentsSkipped: number;
  readonly emittedParentGroups: number;
  readonly parentIdsSha256: string;
  readonly records: number;
  readonly bytes: number;
  readonly sha256: string;
}

interface TrainingReplayParentBatch {
  readonly inputIndex: number;
  readonly parentId: string;
  readonly forced: boolean;
  readonly canonicalLinesWithLf: readonly Uint8Array[];
}

type TrainingReplayParentBatchSink = (
  batch: Readonly<TrainingReplayParentBatch>,
) => Promise<void>;

type RestartableTrainingReplay = (
  sink: TrainingReplayParentBatchSink,
) => Promise<void>;

const TEST_PLAN_REGISTRY = new WeakMap<
  Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests>,
  Readonly<HiddenPlan>
>();
const MANUAL_CONTENT_FAILURES = new WeakSet<object>();

function fail(message: string): never {
  throw new Error(message);
}

function manualFail(message: string, cause?: unknown): never {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  MANUAL_CONTENT_FAILURES.add(error);
  throw error;
}

async function manualContentValidation<T>(
  label: string,
  validate: () => Promise<T>,
): Promise<T> {
  try {
    return await validate();
  } catch (error) {
    return manualFail(label, error);
  }
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
    const message = Reflect.get(value, "message", value) as unknown;
    return typeof message === "string" ? message : "non-string failure";
  } catch {
    return "uninspectable failure";
  }
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    output[key] = (value as Record<string, unknown>)[key];
  }
  return objectFreeze(output) as Readonly<T>;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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
  const prototype = objectGetPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) fail(`${label} must be a plain non-Proxy object`);
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const output = objectCreate(null) as Record<string, unknown>;
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") fail(`${label} must not have symbol keys`);
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
  return objectFreeze(output);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const output = record(value, label);
  const actual = Object.keys(output).sort(compareUtf8);
  const expected = [...expectedKeys].sort(compareUtf8);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
  return output;
}

function denseArray(value: unknown, label: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    objectGetPrototypeOf(value) !== Array.prototype
  ) {
    fail(`${label} must be an ordinary non-Proxy array`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (reflectOwnKeys(descriptors).length !== value.length + 1) {
    fail(`${label} must be dense and have no extra properties`);
  }
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}[${index}] must be an enumerable own data property`);
    }
    output.push(descriptor.value);
  }
  return objectFreeze(output);
}

function deepCaptureJson(value: unknown, label = "JSON value"): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(`${label} rejects nonfinite numbers and negative zero`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return objectFreeze(
      denseArray(value, label).map((entry, index) =>
        deepCaptureJson(entry, `${label}[${index}]`),
      ),
    );
  }
  if (isPlainRecord(value)) {
    const source = record(value, label);
    const output = objectCreate(null) as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      output[key] = deepCaptureJson(source[key], `${label}.${key}`);
    }
    return objectFreeze(output);
  }
  return fail(`${label} rejects ${typeof value}`);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${denseArray(value, "canonical JSON array")
      .map(canonicalJson)
      .join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const source = record(value, "canonical JSON object");
    return `{${Object.keys(source)
      .sort(compareUtf8)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`)
      .join(",")}}`;
  }
  return fail(`canonical JSON rejects ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    (left.byteLength === 0 || timingSafeEqual(left, right))
  );
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function digestString(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

function canonicalBigint(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !CANONICAL_DECIMAL_RE.test(value)) {
    fail(`${label} must be a canonical nonnegative decimal string`);
  }
  return BigInt(value);
}

function canonicalDecimalString(value: unknown, label: string): string {
  canonicalBigint(value, label);
  return value as string;
}

function safeBasename(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_BASENAME_RE.test(value)) {
    fail(`${label} must be a safe canonical basename`);
  }
  return value;
}

function captureProjection(
  value: Readonly<FloodgateV7TrainingLabelProjection>,
  index: number,
): Readonly<CapturedProjection> {
  const captured = deepCaptureJson(
    value,
    `projection ${index}`,
  ) as Readonly<FloodgateV7TrainingLabelProjection>;
  if (
    captured.contract !== FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT ||
    captured.status !== FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS ||
    captured.claim_boundary !==
      FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY ||
    !Array.isArray(captured.rows)
  ) {
    fail(`projection ${index} boundary is unsupported`);
  }
  const parentId = captured.parent?.parent_id;
  if (typeof parentId !== "string" || parentId.length === 0) {
    fail(`projection ${index} parent_id is invalid`);
  }
  const rows = captured.rows;
  if (
    captured.labels?.records !== rows.length ||
    captured.labels?.teacher_labels_emitted !== rows.length ||
    typeof captured.parent?.forced_parent_skipped !== "boolean"
  ) {
    fail(`projection ${index} summary does not match its rows`);
  }
  if (captured.parent.forced_parent_skipped && rows.length !== 0) {
    fail(`projection ${index} forced parent retained rows`);
  }
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (
      row.parent_id !== parentId ||
      row.split !== "train" ||
      row.schema !== "shogi-sibling-v1" ||
      row.schema_version !== 1
    ) {
      fail(`projection ${index} row ${rowIndex} is not its exact train row`);
    }
    canonicalJson(row);
  }
  if (!captured.parent.forced_parent_skipped) {
    const groups = validateParentGroups(rows);
    if (groups.length !== 1 || groups[0].parent_id !== parentId) {
      fail(`projection ${index} does not contain one exact parent group`);
    }
  }
  return frozenRecord({
    parentId,
    forced: captured.parent.forced_parent_skipped,
    rows,
  });
}

async function replayCapturedProjections(
  projections: readonly Readonly<CapturedProjection>[],
  sink: TrainingReplayParentBatchSink,
): Promise<void> {
  for (let inputIndex = 0; inputIndex < projections.length; inputIndex += 1) {
    const projection = projections[inputIndex];
    await sink(
      frozenRecord({
        inputIndex,
        parentId: projection.parentId,
        forced: projection.forced,
        canonicalLinesWithLf: objectFreeze(
          projection.rows.map((row) =>
            Buffer.from(`${canonicalJson(row)}\n`, "utf8"),
          ),
        ),
      }),
    );
  }
}

function capturedProjectionReplay(
  projections: readonly Readonly<CapturedProjection>[],
): RestartableTrainingReplay {
  return objectFreeze(async function (
    sink: TrainingReplayParentBatchSink,
  ): Promise<void> {
    await replayCapturedProjections(projections, sink);
  });
}

/**
 * Deep-capture a small synthetic projection set and issue a one-shot opaque
 * capability. The returned facade intentionally carries no replay material.
 */
export function createFloodgateV7TrainingLabelFinalizationPlanCoreForTests(
  inputValue: FloodgateV7TrainingLabelSyntheticPlanInputForTests,
): Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests> {
  if (arguments.length !== 1)
    fail("synthetic plan factory accepts one argument");
  const input = exactRecord(
    inputValue,
    [
      "keyId",
      "projections",
      "runId",
      "stage",
      "teacherRunBindingSha256",
      "trainingBinding",
      "work",
    ],
    "plan input",
  );
  if (typeof input.runId !== "string" || !RUN_ID_RE.test(input.runId)) {
    fail("plan runId must be 32 bytes of lowercase hex");
  }
  if (typeof input.keyId !== "string" || !KEY_ID_RE.test(input.keyId)) {
    fail("plan keyId is invalid");
  }
  const teacherRunBindingSha256 = digestString(
    input.teacherRunBindingSha256,
    "plan teacher run binding sha256",
  );
  const trainingBinding = deepCaptureJson(
    input.trainingBinding,
    "plan training binding",
  ) as Readonly<FloodgateTrainingInputBinding>;
  const trainingBindingCanonical = canonicalJson(trainingBinding);
  const stageInput = exactRecord(
    input.stage,
    [
      "destinationBasename",
      "parentDev",
      "parentIno",
      "stageBasename",
      "stageDev",
      "stageIno",
    ],
    "plan stage binding",
  );
  const stage = frozenRecord({
    parent_dev: canonicalDecimalString(
      stageInput.parentDev,
      "plan stage binding.parentDev",
    ),
    parent_ino: canonicalDecimalString(
      stageInput.parentIno,
      "plan stage binding.parentIno",
    ),
    stage_dev: canonicalDecimalString(
      stageInput.stageDev,
      "plan stage binding.stageDev",
    ),
    stage_ino: canonicalDecimalString(
      stageInput.stageIno,
      "plan stage binding.stageIno",
    ),
    stage_basename: safeBasename(
      stageInput.stageBasename,
      "plan stage binding.stageBasename",
    ),
    destination_basename: safeBasename(
      stageInput.destinationBasename,
      "plan stage binding.destinationBasename",
    ),
  });
  const stageCanonical = canonicalJson(stage);
  const work = exactRecord(
    input.work,
    ["bytes", "filename", "sha256", "snapshot"],
    "plan work binding",
  );
  if (work.filename !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME) {
    fail("plan work filename is unsupported");
  }
  const workBytes = nonnegativeInteger(work.bytes, "plan work bytes");
  if (workBytes > FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES) {
    fail("plan work bytes exceed the v3 checkpoint bound");
  }
  const workSha256 = digestString(work.sha256, "plan work sha256");
  const workSnapshotInput = exactRecord(
    work.snapshot,
    ["ctimeNs", "dev", "ino", "mode", "mtimeNs", "nlink", "size", "uid"],
    "plan work snapshot",
  );
  const workSnapshot = frozenRecord({
    dev: canonicalBigint(workSnapshotInput.dev, "plan work snapshot.dev"),
    ino: canonicalBigint(workSnapshotInput.ino, "plan work snapshot.ino"),
    mode: canonicalBigint(workSnapshotInput.mode, "plan work snapshot.mode"),
    nlink: canonicalBigint(workSnapshotInput.nlink, "plan work snapshot.nlink"),
    uid: canonicalBigint(workSnapshotInput.uid, "plan work snapshot.uid"),
    size: canonicalBigint(workSnapshotInput.size, "plan work snapshot.size"),
    mtimeNs: canonicalBigint(
      workSnapshotInput.mtimeNs,
      "plan work snapshot.mtimeNs",
    ),
    ctimeNs: canonicalBigint(
      workSnapshotInput.ctimeNs,
      "plan work snapshot.ctimeNs",
    ),
  });
  if (workSnapshot.size !== BigInt(workBytes)) {
    fail("plan work snapshot size differs from work bytes");
  }
  const projectionValues = denseArray(input.projections, "plan projections");
  const projections = objectFreeze(
    projectionValues.map((projection, index) =>
      captureProjection(
        projection as Readonly<FloodgateV7TrainingLabelProjection>,
        index,
      ),
    ),
  );
  const parentIds = new Set<string>();
  for (const projection of projections) {
    if (parentIds.has(projection.parentId)) {
      fail(`duplicate synthetic projection parent ${projection.parentId}`);
    }
    parentIds.add(projection.parentId);
  }
  const parentIdsSha256 = floodgateIdentifierDigest(parentIds);
  if (
    !Number.isSafeInteger(trainingBinding.records) ||
    trainingBinding.records < 0 ||
    projections.length !== trainingBinding.records
  ) {
    fail("synthetic projections do not exactly cover the training binding");
  }
  if (parentIdsSha256 !== trainingBinding.parent_ids_sha256) {
    fail("synthetic projection parent IDs do not match the training binding");
  }
  const trainDigest = createHash("sha256");
  let trainRecords = 0;
  let trainBytes = 0;
  for (const projection of projections) {
    for (const row of projection.rows) {
      const line = Buffer.from(`${canonicalJson(row)}\n`, "utf8");
      trainDigest.update(line);
      trainRecords += 1;
      trainBytes += line.byteLength;
      if (!Number.isSafeInteger(trainBytes))
        fail("synthetic train is too large");
    }
  }
  const expectedTrain = frozenRecord({
    inputParents: projections.length,
    forcedParentsSkipped: projections.filter((projection) => projection.forced)
      .length,
    emittedParentGroups: projections.filter(
      (projection) => projection.rows.length > 0,
    ).length,
    parentIdsSha256,
    records: trainRecords,
    bytes: trainBytes,
    sha256: trainDigest.digest("hex"),
  });
  const facade = frozenRecord({
    contract: FLOODGATE_V7_TRAINING_LABEL_PLAN_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_PLAN_STATUS,
    claim_boundary: FLOODGATE_V7_TRAINING_LABEL_PLAN_CLAIM_BOUNDARY,
    execution_boundary: FLOODGATE_V7_TRAINING_LABEL_PLAN_EXECUTION_BOUNDARY,
  });
  TEST_PLAN_REGISTRY.set(
    facade,
    frozenRecord({
      runId: input.runId,
      keyId: input.keyId,
      teacherRunBindingSha256,
      trainingBinding,
      trainingBindingCanonical,
      stage,
      stageCanonical,
      replay: capturedProjectionReplay(projections),
      expectedTrain,
      work: frozenRecord({
        bytes: workBytes,
        sha256: workSha256,
        snapshot: workSnapshot,
      }),
    }),
  );
  return facade;
}

function takeTestPlan(
  value: Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests>,
): Readonly<HiddenPlan> {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    nodeUtilTypes.isProxy(value)
  ) {
    fail("finalization requires the exact opaque synthetic plan");
  }
  const plan = TEST_PLAN_REGISTRY.get(value);
  if (plan === undefined || !TEST_PLAN_REGISTRY.delete(value)) {
    fail("synthetic finalization plan is cloned, foreign, or already consumed");
  }
  return plan;
}

function captureInvocation(
  optionsValue: FloodgateV7TrainingLabelFinalizerOptions,
  dependenciesValue: FloodgateV7TrainingLabelFinalizerDependencies,
): Readonly<CapturedInvocation> {
  const options = exactRecord(
    optionsValue,
    ["keyId", "rootKey", "runId"],
    "finalizer options",
  );
  const dependencyKeys = ["effectiveUserId"];
  if (isPlainRecord(dependenciesValue)) {
    for (const optional of [
      "failpointForTests",
      "observeKeyForTests",
      "writeForTests",
    ]) {
      if (Object.prototype.hasOwnProperty.call(dependenciesValue, optional)) {
        dependencyKeys.push(optional);
      }
    }
  }
  const dependencies = exactRecord(
    dependenciesValue,
    dependencyKeys,
    "finalizer dependencies",
  );
  if (typeof options.runId !== "string" || !RUN_ID_RE.test(options.runId)) {
    fail("finalizer runId must be 32 bytes of lowercase hex");
  }
  if (typeof options.keyId !== "string" || !KEY_ID_RE.test(options.keyId)) {
    fail("finalizer keyId is invalid");
  }
  const rootKeyValue = options.rootKey;
  if (
    !nodeUtilTypes.isUint8Array(rootKeyValue) ||
    nodeUtilTypes.isProxy(rootKeyValue) ||
    nativeTypedArrayBuffer === undefined ||
    nativeTypedArrayByteLength === undefined
  ) {
    fail("finalizer rootKey must be a non-shared 32-byte Uint8Array");
  }
  let rootKeyByteLength: number;
  let rootKeyBacking: ArrayBufferLike;
  try {
    rootKeyByteLength = Reflect.apply(
      nativeTypedArrayByteLength,
      rootKeyValue,
      [],
    ) as number;
    rootKeyBacking = Reflect.apply(
      nativeTypedArrayBuffer,
      rootKeyValue,
      [],
    ) as ArrayBufferLike;
  } catch {
    return fail("finalizer rootKey must be a non-shared 32-byte Uint8Array");
  }
  if (
    rootKeyByteLength !== 32 ||
    nodeUtilTypes.isSharedArrayBuffer(rootKeyBacking)
  ) {
    fail("finalizer rootKey must be a non-shared 32-byte Uint8Array");
  }
  const effectiveUserId = nonnegativeInteger(
    dependencies.effectiveUserId,
    "effectiveUserId",
  );
  for (const name of [
    "failpointForTests",
    "observeKeyForTests",
    "writeForTests",
  ] as const) {
    const callback = dependencies[name];
    if (
      callback !== undefined &&
      (typeof callback !== "function" || nodeUtilTypes.isProxy(callback))
    ) {
      fail(`${name} must be a non-Proxy function`);
    }
  }
  const rootKey = Buffer.alloc(32);
  Reflect.apply(nativeTypedArraySet, rootKey, [rootKeyValue, 0]);
  return frozenRecord({
    rootKey,
    runId: options.runId,
    keyId: options.keyId,
    effectiveUserId,
    failpoint:
      dependencies.failpointForTests as CapturedInvocation["failpoint"],
    observeKey:
      dependencies.observeKeyForTests as CapturedInvocation["observeKey"],
    write: dependencies.writeForTests as CapturedInvocation["write"],
  });
}

function observeKey(
  invocation: Readonly<CapturedInvocation>,
  kind: FloodgateV7TrainingLabelFinalizerKeyKind,
  key: Uint8Array,
): void {
  const result: unknown = invocation.observeKey?.(kind, key);
  if (result !== undefined) {
    if (nodeUtilTypes.isPromise(result)) {
      try {
        Reflect.apply(nativePromiseThen, result, [undefined, () => undefined]);
      } catch {
        // The non-undefined return is rejected below regardless.
      }
    }
    fail("key observer must return exactly undefined");
  }
}

async function fire(
  invocation: Readonly<CapturedInvocation>,
  event: FloodgateV7TrainingLabelFinalizerEvent,
): Promise<void> {
  await invocation.failpoint?.(event);
}

function stageIdentity(
  receipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
): Readonly<Record<string, unknown>> {
  return frozenRecord({
    parent_dev: receipt.parent_identity.dev.toString(),
    parent_ino: receipt.parent_identity.ino.toString(),
    stage_basename: receipt.stage_basename,
    stage_dev: receipt.stage_identity.dev.toString(),
    stage_ino: receipt.stage_identity.ino.toString(),
    destination_basename: receipt.destination_basename,
  });
}

function assertPrivateDirectory(
  stat: fs.BigIntStats,
  invocation: Readonly<CapturedInvocation>,
  receipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  label: string,
): void {
  if (
    !stat.isDirectory() ||
    stat.dev !== receipt.stage_identity.dev ||
    stat.ino !== receipt.stage_identity.ino ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    Number(stat.mode & BigInt(MODE_MASK)) !== 0o700
  ) {
    fail(`${label} is not the exact private authorized stage directory`);
  }
}

function assertPrivateFile(
  stat: fs.BigIntStats,
  invocation: Readonly<CapturedInvocation>,
  label: string,
): void {
  if (
    !stat.isFile() ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    Number(stat.mode & BigInt(MODE_MASK)) !== 0o600 ||
    stat.size < BigInt(0) ||
    stat.size > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    fail(`${label} must be an owner-only regular single-link safe-sized file`);
  }
}

function snapshot(stat: fs.BigIntStats): Readonly<FileSnapshot> {
  return frozenRecord({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function assertDirectoryPath(
  root: string,
  handle: fs.promises.FileHandle,
  invocation: Readonly<CapturedInvocation>,
  receipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  label: string,
): Promise<void> {
  const held = await handle.stat({ bigint: true });
  const pathname = await fs.promises.lstat(root, { bigint: true });
  assertPrivateDirectory(held, invocation, receipt, label);
  assertPrivateDirectory(pathname, invocation, receipt, `${label} pathname`);
  if (held.dev !== pathname.dev || held.ino !== pathname.ino) {
    fail(`${label} pathname differs from its held directory`);
  }
}

async function exactEntries(root: string): Promise<readonly string[]> {
  return objectFreeze((await fs.promises.readdir(root)).sort(compareUtf8));
}

function stateString(entries: readonly string[]): string {
  return `{${entries.join(",")}}`;
}

function exactStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function assertAllowedState(entries: readonly string[]): void {
  const states: readonly (readonly string[])[] = [
    [FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME],
    [
      FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    ],
    [
      FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    ],
    FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
  ];
  if (!states.some((state) => exactStringArray(entries, state))) {
    manualFail("stage entries are not one of the four exact resumable states");
  }
}

async function openExisting(
  root: string,
  filename: FloodgateV7TrainingLabelPublishedFileEvidence["filename"],
  invocation: Readonly<CapturedInvocation>,
  writable = false,
): Promise<fs.promises.FileHandle> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(
      path.join(root, filename),
      (writable ? fs.constants.O_RDWR : fs.constants.O_RDONLY) |
        fs.constants.O_NOFOLLOW,
    );
  } catch (cause) {
    return manualFail(
      `${filename} could not be opened without following links`,
      cause,
    );
  }
  let failed = false;
  let primary: unknown;
  try {
    assertPrivateFile(
      await handle.stat({ bigint: true }),
      invocation,
      filename,
    );
  } catch (error) {
    failed = true;
    primary = error;
  }
  if (failed) {
    try {
      await handle.close();
    } catch {
      // Preserve the primary validation failure.
    }
    return manualFail(`${filename} is not a safe existing artifact`, primary);
  }
  return handle;
}

async function createFile(
  root: string,
  filename:
    | typeof FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  invocation: Readonly<CapturedInvocation>,
): Promise<fs.promises.FileHandle> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(
      path.join(root, filename),
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_RDWR |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
  } catch (cause) {
    return manualFail(`${filename} create-only open failed`, cause);
  }
  let validationFailed = false;
  let primary: unknown;
  try {
    await handle.chmod(0o600);
    assertPrivateFile(
      await handle.stat({ bigint: true }),
      invocation,
      `created ${filename}`,
    );
  } catch (error) {
    validationFailed = true;
    primary = error;
  }
  if (validationFailed) {
    try {
      await handle.close();
    } catch {
      // Preserve the primary validation failure and the file for reconciliation.
    }
    return manualFail(
      `created ${filename} failed direct held-file validation`,
      primary,
    );
  }
  return handle;
}

async function digestHeld(
  handle: fs.promises.FileHandle,
  invocation: Readonly<CapturedInvocation>,
  label: string,
): Promise<Readonly<{ bytes: number; sha256: string; stat: fs.BigIntStats }>> {
  const before = await handle.stat({ bigint: true });
  assertPrivateFile(before, invocation, label);
  const length = Number(before.size);
  const buffer = Buffer.alloc(Math.min(READ_CHUNK_BYTES, Math.max(1, length)));
  const digest = createHash("sha256");
  let offset = 0;
  while (offset < length) {
    const requested = Math.min(buffer.byteLength, length - offset);
    const result = await handle.read(buffer, 0, requested, offset);
    if (result.bytesRead <= 0) fail(`${label} changed during streaming read`);
    digest.update(buffer.subarray(0, result.bytesRead));
    offset += result.bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  assertPrivateFile(after, invocation, label);
  if (!sameSnapshot(snapshot(before), snapshot(after))) {
    fail(`${label} mutated during streaming read`);
  }
  return frozenRecord({
    bytes: length,
    sha256: digest.digest("hex"),
    stat: after,
  });
}

async function verifyDatasyncedArtifact(
  handle: fs.promises.FileHandle,
  invocation: Readonly<CapturedInvocation>,
  filename:
    | typeof FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  expectedBytes: number,
  expectedSha256: string,
  exactExpected?: Buffer,
): Promise<fs.BigIntStats> {
  let failed = false;
  let primary: unknown;
  let finalStat: fs.BigIntStats | undefined;
  try {
    const verified = await digestHeld(
      handle,
      invocation,
      `datasynced ${filename}`,
    );
    if (
      verified.bytes !== expectedBytes ||
      verified.sha256 !== expectedSha256
    ) {
      fail(`datasynced ${filename} differs from its deterministic content`);
    }
    finalStat = verified.stat;
    if (exactExpected !== undefined) {
      const reread = await readExactAt(
        handle,
        exactExpected.byteLength,
        0,
        filename,
      );
      if (!exactBytes(reread, exactExpected)) {
        fail(`datasynced ${filename} is not byte-exact`);
      }
      const rereadStat = await handle.stat({ bigint: true });
      assertPrivateFile(rereadStat, invocation, filename);
      if (!sameSnapshot(snapshot(rereadStat), snapshot(verified.stat))) {
        fail(`datasynced ${filename} mutated during exact reread`);
      }
      finalStat = rereadStat;
    }
  } catch (error) {
    failed = true;
    primary = error;
  }
  if (failed || finalStat === undefined) {
    return manualFail(
      `datasynced ${filename} failed direct held-file validation`,
      primary,
    );
  }
  return finalStat;
}

async function verifyPostDirectorySyncArtifact(
  handle: fs.promises.FileHandle,
  invocation: Readonly<CapturedInvocation>,
  filename:
    | typeof FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  original: Readonly<FileSnapshot>,
  contentVerified: Readonly<FileSnapshot>,
  expectedBytes: number,
): Promise<fs.BigIntStats> {
  return manualContentValidation(
    `directory-synced ${filename} failed final held-file validation`,
    async () => {
      const after = await handle.stat({ bigint: true });
      assertPrivateFile(after, invocation, filename);
      if (
        after.dev !== original.dev ||
        after.ino !== original.ino ||
        Number(after.size) !== expectedBytes ||
        !sameSnapshot(snapshot(after), contentVerified)
      ) {
        fail(`${filename} identity, snapshot, or final size changed`);
      }
      return after;
    },
  );
}

function evidence(
  filename: FloodgateV7TrainingLabelPublishedFileEvidence["filename"],
  stat: fs.BigIntStats,
  bytes: number,
  digest: string,
): Readonly<FloodgateV7TrainingLabelPublishedFileEvidence> {
  return frozenRecord({
    filename,
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    mode: "0600" as const,
    bytes,
    sha256: digest,
  });
}

type ValidatedTrainingReplayParent = Readonly<{
  parentIndex: number;
  parentId: string;
  forced: boolean;
  lines: readonly Buffer[];
}>;

async function replayTrainingParents(
  plan: Readonly<HiddenPlan>,
  sink: (parent: ValidatedTrainingReplayParent) => Promise<void>,
): Promise<void> {
  let parentIndex = 0;
  await plan.replay(async (batchValue) => {
    const batch = exactRecord(
      batchValue,
      ["canonicalLinesWithLf", "forced", "inputIndex", "parentId"],
      `training replay parent ${parentIndex}`,
    );
    if (batch.inputIndex !== parentIndex) {
      fail("training replay parent sequence is not exact");
    }
    if (typeof batch.parentId !== "string" || batch.parentId.length === 0) {
      fail(`training replay parent ${parentIndex} ID is invalid`);
    }
    if (typeof batch.forced !== "boolean") {
      fail(`training replay parent ${parentIndex} forced flag is invalid`);
    }
    const lineValues = denseArray(
      batch.canonicalLinesWithLf,
      `training replay parent ${parentIndex} lines`,
    );
    if (
      (batch.forced && lineValues.length !== 0) ||
      (!batch.forced && lineValues.length === 0)
    ) {
      fail(`training replay parent ${parentIndex} row state is invalid`);
    }
    const lines = objectFreeze(
      lineValues.map((lineValue, lineIndex) => {
        if (
          !nodeUtilTypes.isUint8Array(lineValue) ||
          nodeUtilTypes.isProxy(lineValue) ||
          nativeTypedArrayBuffer === undefined ||
          nativeTypedArrayByteLength === undefined
        ) {
          return fail(
            `training replay parent ${parentIndex} line ${lineIndex} is invalid`,
          );
        }
        let byteLength: number;
        let backing: ArrayBufferLike;
        try {
          byteLength = Reflect.apply(
            nativeTypedArrayByteLength,
            lineValue,
            [],
          ) as number;
          backing = Reflect.apply(nativeTypedArrayBuffer, lineValue, []) as
            ArrayBuffer | SharedArrayBuffer;
        } catch {
          return fail(
            `training replay parent ${parentIndex} line ${lineIndex} is invalid`,
          );
        }
        if (
          byteLength < 2 ||
          byteLength > READ_CHUNK_BYTES ||
          nodeUtilTypes.isSharedArrayBuffer(backing)
        ) {
          return fail(
            `training replay parent ${parentIndex} line ${lineIndex} is invalid`,
          );
        }
        const copied = Buffer.alloc(byteLength);
        Reflect.apply(nativeTypedArraySet, copied, [lineValue, 0]);
        if (
          copied[copied.byteLength - 1] !== 0x0a ||
          copied.subarray(0, copied.byteLength - 1).includes(0x0a)
        ) {
          return fail(
            `training replay parent ${parentIndex} line ${lineIndex} framing is invalid`,
          );
        }
        return copied;
      }),
    );
    await sink(
      frozenRecord({
        parentIndex,
        parentId: batch.parentId,
        forced: batch.forced,
        lines,
      }),
    );
    parentIndex += 1;
  });
}

async function readExactAt(
  handle: fs.promises.FileHandle,
  length: number,
  position: number,
  label: string,
): Promise<Buffer> {
  const output = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(
      output,
      offset,
      length - offset,
      position + offset,
    );
    if (result.bytesRead <= 0) fail(`${label} changed during prefix read`);
    offset += result.bytesRead;
  }
  return output;
}

async function verifyCompleteTrainReadOnly(
  root: string,
  plan: Readonly<HiddenPlan>,
  invocation: Readonly<CapturedInvocation>,
): Promise<void> {
  const handle = await openExisting(
    root,
    FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
    invocation,
  );
  let operationFailed = false;
  let primary: unknown;
  try {
    const before = await manualContentValidation(
      "train.jsonl failed initial successor metadata validation",
      async () => {
        const current = await handle.stat({ bigint: true });
        assertPrivateFile(
          current,
          invocation,
          FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        );
        if (Number(current.size) !== plan.expectedTrain.bytes) {
          fail("result successor exists while train.jsonl is incomplete");
        }
        return current;
      },
    );
    let offset = 0;
    const parentIds: string[] = [];
    await replayTrainingParents(plan, async (parent) => {
      parentIds.push(parent.parentId);
      for (const line of parent.lines) {
        await manualContentValidation(
          "train.jsonl failed successor byte validation",
          async () => {
            const actual = await readExactAt(
              handle,
              line.byteLength,
              offset,
              FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
            );
            if (!exactBytes(actual, line)) {
              fail("result successor exists while train.jsonl is not exact");
            }
          },
        );
        offset += line.byteLength;
      }
    });
    if (
      parentIds.length !== plan.expectedTrain.inputParents ||
      floodgateIdentifierDigest(parentIds) !==
        plan.expectedTrain.parentIdsSha256
    ) {
      fail("training replay parent commitment differs from the opaque plan");
    }
    await manualContentValidation(
      "train.jsonl failed final successor metadata validation",
      async () => {
        const after = await handle.stat({ bigint: true });
        assertPrivateFile(
          after,
          invocation,
          FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        );
        if (!sameSnapshot(snapshot(before), snapshot(after))) {
          fail("train.jsonl mutated during successor precheck");
        }
      },
    );
  } catch (error) {
    operationFailed = true;
    primary = error;
  }
  let closeFailed = false;
  let closeFailure: unknown;
  try {
    await handle.close();
  } catch (error) {
    closeFailed = true;
    closeFailure = error;
  }
  if (operationFailed) throw primary;
  if (closeFailed) throw closeFailure;
}

async function verifyCompleteMetadataReadOnly(
  root: string,
  filename:
    | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  expected: Buffer,
  invocation: Readonly<CapturedInvocation>,
  successor: string,
): Promise<void> {
  const handle = await openExisting(root, filename, invocation);
  let validationFailed = false;
  let primary: unknown;
  try {
    const before = await handle.stat({ bigint: true });
    assertPrivateFile(before, invocation, filename);
    if (Number(before.size) !== expected.byteLength) {
      manualFail(`${successor} exists while ${filename} is incomplete`);
    }
    const actual = await readExactAt(handle, expected.byteLength, 0, filename);
    if (!exactBytes(actual, expected)) {
      manualFail(`${successor} exists while ${filename} is not exact`);
    }
    const after = await handle.stat({ bigint: true });
    assertPrivateFile(after, invocation, filename);
    if (!sameSnapshot(snapshot(before), snapshot(after))) {
      manualFail(`${filename} mutated during successor precheck`);
    }
  } catch (error) {
    validationFailed = true;
    primary = error;
  }
  let closeFailed = false;
  let closeFailure: unknown;
  try {
    await handle.close();
  } catch (error) {
    closeFailed = true;
    closeFailure = error;
  }
  if (validationFailed) {
    return manualFail(
      `${filename} failed successor integrity precheck`,
      primary,
    );
  }
  if (closeFailed) throw closeFailure;
}

async function writeAll(
  handle: fs.promises.FileHandle,
  filename:
    | typeof FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  bytes: Buffer,
  position: number,
  invocation: Readonly<CapturedInvocation>,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const remaining = bytes.byteLength - offset;
    let writeCalled = false;
    let nativeBytesWritten: number | undefined;
    const write = async (maximumBytes = remaining): Promise<number> => {
      if (
        writeCalled ||
        !Number.isSafeInteger(maximumBytes) ||
        maximumBytes < 1 ||
        maximumBytes > remaining
      ) {
        fail(`${filename} write seam request is invalid`);
      }
      writeCalled = true;
      const result = await handle.write(
        bytes,
        offset,
        maximumBytes,
        position + offset,
      );
      nativeBytesWritten = result.bytesWritten;
      return result.bytesWritten;
    };
    const request = frozenRecord({
      filename,
      offset: position + offset,
      length: remaining,
    });
    const reported = invocation.write
      ? await invocation.write(request, write)
      : await write();
    if (
      !writeCalled ||
      reported !== nativeBytesWritten ||
      !Number.isSafeInteger(reported) ||
      reported < 1 ||
      reported > remaining
    ) {
      fail(`${filename} write seam did not report the exact native write`);
    }
    offset += reported;
  }
}

async function persistTrain(
  root: string,
  stageHandle: fs.promises.FileHandle,
  exists: boolean,
  plan: Readonly<HiddenPlan>,
  invocation: Readonly<CapturedInvocation>,
  registerHandle: (handle: fs.promises.FileHandle) => void,
  markDirectorySynced: () => void,
): Promise<Readonly<{ held: HeldArtifact; summary: TrainSummary }>> {
  const handle = exists
    ? await openExisting(
        root,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        invocation,
        true,
      )
    : await createFile(
        root,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        invocation,
      );
  registerHandle(handle);
  if (!exists) await fire(invocation, "train-created");
  const before = await manualContentValidation(
    "train.jsonl failed initial persistence metadata validation",
    async () => {
      const current = await handle.stat({ bigint: true });
      assertPrivateFile(
        current,
        invocation,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      );
      return current;
    },
  );
  const existingSize = Number(before.size);
  const digest = createHash("sha256");
  let offset = 0;
  let records = 0;
  let inputParents = 0;
  let forcedParentsSkipped = 0;
  let emittedParentGroups = 0;
  const parentIds: string[] = [];
  await replayTrainingParents(plan, async (parent) => {
    inputParents += 1;
    parentIds.push(parent.parentId);
    if (parent.forced) forcedParentsSkipped += 1;
    if (parent.lines.length > 0) emittedParentGroups += 1;
    for (const line of parent.lines) {
      digest.update(line);
      const prefixLength = Math.min(
        line.byteLength,
        Math.max(0, existingSize - offset),
      );
      if (prefixLength > 0) {
        await manualContentValidation(
          "train.jsonl failed deterministic prefix validation",
          async () => {
            const actual = await readExactAt(
              handle,
              prefixLength,
              offset,
              FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
            );
            if (!exactBytes(actual, line.subarray(0, prefixLength))) {
              fail("train.jsonl is not an exact deterministic prefix");
            }
          },
        );
      }
      if (prefixLength < line.byteLength) {
        await writeAll(
          handle,
          FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
          line.subarray(prefixLength),
          offset + prefixLength,
          invocation,
        );
      }
      offset += line.byteLength;
      records += 1;
    }
  });
  if (existingSize > offset) {
    manualFail("train.jsonl is longer than the deterministic replay");
  }
  const trainSha256 = digest.digest("hex");
  await fire(invocation, "train-written");
  await handle.datasync();
  await fire(invocation, "train-datasynced");
  const verifiedStat = await verifyDatasyncedArtifact(
    handle,
    invocation,
    FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
    offset,
    trainSha256,
  );
  await stageHandle.sync();
  markDirectorySynced();
  await fire(invocation, "train-directory-synced");
  const after = await verifyPostDirectorySyncArtifact(
    handle,
    invocation,
    FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
    snapshot(before),
    snapshot(verifiedStat),
    offset,
  );
  return frozenRecord({
    held: frozenRecord({
      handle,
      snapshot: snapshot(after),
      evidence: evidence(
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        after,
        offset,
        trainSha256,
      ),
    }),
    summary: frozenRecord({
      inputParents,
      forcedParentsSkipped,
      emittedParentGroups,
      parentIdsSha256: floodgateIdentifierDigest(parentIds),
      records,
      bytes: offset,
      sha256: trainSha256,
    }),
  });
}

async function persistMetadata(
  root: string,
  stageHandle: fs.promises.FileHandle,
  filename:
    | typeof FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
    | typeof FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  bytes: Buffer,
  exists: boolean,
  invocation: Readonly<CapturedInvocation>,
  registerHandle: (handle: fs.promises.FileHandle) => void,
  markDirectorySynced: () => void,
): Promise<Readonly<HeldArtifact>> {
  const prefix =
    filename === FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME
      ? "result"
      : "manifest";
  const handle = exists
    ? await openExisting(root, filename, invocation, true)
    : await createFile(root, filename, invocation);
  registerHandle(handle);
  if (!exists) {
    await fire(
      invocation,
      `${prefix}-created` as FloodgateV7TrainingLabelFinalizerEvent,
    );
  }
  const before = await manualContentValidation(
    `${filename} failed initial persistence metadata validation`,
    async () => {
      const current = await handle.stat({ bigint: true });
      assertPrivateFile(current, invocation, filename);
      return current;
    },
  );
  const existingSize = Number(before.size);
  if (existingSize > bytes.byteLength) {
    manualFail(`${filename} is longer than the deterministic artifact`);
  }
  if (existingSize > 0) {
    await manualContentValidation(
      `${filename} failed deterministic prefix validation`,
      async () => {
        const actual = await readExactAt(handle, existingSize, 0, filename);
        if (!exactBytes(actual, bytes.subarray(0, existingSize))) {
          fail(`${filename} is not an exact deterministic prefix`);
        }
      },
    );
  }
  if (existingSize < bytes.byteLength) {
    await writeAll(
      handle,
      filename,
      bytes.subarray(existingSize),
      existingSize,
      invocation,
    );
  }
  await fire(
    invocation,
    `${prefix}-written` as FloodgateV7TrainingLabelFinalizerEvent,
  );
  await handle.datasync();
  await fire(
    invocation,
    `${prefix}-datasynced` as FloodgateV7TrainingLabelFinalizerEvent,
  );
  const expectedSha256 = sha256(bytes);
  const rereadStat = await verifyDatasyncedArtifact(
    handle,
    invocation,
    filename,
    bytes.byteLength,
    expectedSha256,
    bytes,
  );
  await stageHandle.sync();
  markDirectorySynced();
  await fire(
    invocation,
    `${prefix}-directory-synced` as FloodgateV7TrainingLabelFinalizerEvent,
  );
  const after = await verifyPostDirectorySyncArtifact(
    handle,
    invocation,
    filename,
    snapshot(before),
    snapshot(rereadStat),
    bytes.byteLength,
  );
  return frozenRecord({
    handle,
    snapshot: snapshot(after),
    expectedBytes: bytes,
    evidence: evidence(filename, after, bytes.byteLength, expectedSha256),
  });
}

function authenticatedBytes(
  domain: string,
  payload: Readonly<Record<string, unknown>>,
  key: Uint8Array,
  macName: "result_mac" | "manifest_mac",
): Buffer {
  const mac = createHmac("sha256", key)
    .update(domain, "utf8")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
  return Buffer.from(
    `${canonicalJson(frozenRecord({ ...payload, [macName]: mac }))}\n`,
    "utf8",
  );
}

async function auditArtifact(
  root: string,
  held: Readonly<HeldArtifact>,
  invocation: Readonly<CapturedInvocation>,
  requireSameIdentity: boolean,
): Promise<void> {
  const reopened = await openExisting(root, held.evidence.filename, invocation);
  let validationFailed = false;
  let primary: unknown;
  try {
    const current = await digestHeld(
      reopened,
      invocation,
      `reopened ${held.evidence.filename}`,
    );
    if (
      current.bytes !== held.evidence.bytes ||
      current.sha256 !== held.evidence.sha256 ||
      !sameSnapshot(snapshot(current.stat), held.snapshot) ||
      (requireSameIdentity &&
        (current.stat.dev.toString() !== held.evidence.dev ||
          current.stat.ino.toString() !== held.evidence.ino))
    ) {
      manualFail(
        `reopened ${held.evidence.filename} differs from finalized content`,
      );
    }
    if (held.expectedBytes !== undefined) {
      const actual = await readExactAt(
        reopened,
        held.expectedBytes.byteLength,
        0,
        `reopened ${held.evidence.filename}`,
      );
      if (!exactBytes(actual, held.expectedBytes)) {
        manualFail(`reopened ${held.evidence.filename} bytes are not exact`);
      }
    }
  } catch (error) {
    validationFailed = true;
    primary = error;
  }
  let closeFailed = false;
  let closeFailure: unknown;
  try {
    await reopened.close();
  } catch (error) {
    closeFailed = true;
    closeFailure = error;
  }
  if (validationFailed) {
    return manualFail(
      `reopened ${held.evidence.filename} failed content validation`,
      primary,
    );
  }
  if (closeFailed) throw closeFailure;
}

async function closeHandles(
  handles: readonly (fs.promises.FileHandle | undefined)[],
): Promise<readonly unknown[]> {
  const failures: unknown[] = [];
  const seen = new Set<fs.promises.FileHandle>();
  for (const handle of handles) {
    if (handle === undefined || seen.has(handle)) continue;
    seen.add(handle);
    try {
      await handle.close();
    } catch (error) {
      failures.push(error);
    }
  }
  return objectFreeze(failures);
}

function publicationFacets(primary: unknown): Readonly<{
  readonly durability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly mayHavePublished: boolean;
}> {
  if (
    primary !== null &&
    typeof primary === "object" &&
    !nodeUtilTypes.isProxy(primary)
  ) {
    let descriptors: PropertyDescriptorMap;
    try {
      descriptors = objectGetOwnPropertyDescriptors(primary);
    } catch {
      descriptors = objectCreate(null) as PropertyDescriptorMap;
    }
    const data = (key: string): unknown => {
      const descriptor = descriptors[key];
      return descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
    };
    const durability = data("publicationDurability");
    const mayHavePublished = data("mayHavePublished");
    return frozenRecord({
      durability:
        durability === "renamed-parent-synced" ||
        durability === "published-and-lease-removal-durable"
          ? durability
          : "not-established",
      destinationReopened: data("destinationReopened") === true,
      leaseMayRemain: data("leaseMayRemain") !== false,
      mayHavePublished:
        typeof mayHavePublished === "boolean" ? mayHavePublished : true,
    });
  }
  return frozenRecord({
    durability: "not-established" as const,
    destinationReopened: false,
    leaseMayRemain: true,
    mayHavePublished: true,
  });
}

/**
 * Consume a synthetic plan, a test postflight capability, and a test lease;
 * resume only exact deterministic prefixes, commit the manifest last, publish,
 * and reopen every destination artifact.
 *
 * This test adapter deliberately remains the single lexical owner of every
 * key, held file handle, publication transaction, and failure facet. The #478
 * boundary extracts a shared private runner only when separate test and
 * production registries can call it without crossing authority domains.
 */
export async function finalizeAndPublishFloodgateV7TrainingLabelsCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  postflightReceipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  planValue: Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests>,
  optionsValue: FloodgateV7TrainingLabelFinalizerOptions,
  dependenciesValue: FloodgateV7TrainingLabelFinalizerDependencies,
  publicationDependencies: FloodgateTeacherStagePublicationDependencies,
): Promise<Readonly<FloodgateV7TrainingLabelFinalizationReceipt>> {
  const progress: MutableProgress = {
    phase: "plan-claim",
    observedState: "uninspected",
    planConsumed: false,
    postflightConsumed: false,
    mayHavePersisted: false,
    commitStarted: false,
    published: false,
    durability: "not-established",
    destinationReopened: false,
  };
  let plan: Readonly<HiddenPlan> | undefined;
  let invocation: Readonly<CapturedInvocation> | undefined;
  let resultKey = Buffer.alloc(0);
  let manifestKey = Buffer.alloc(0);
  let salt = Buffer.alloc(0);
  let transaction:
    Readonly<FloodgateTeacherStagePublicationTransaction> | undefined;
  let stageHandle: fs.promises.FileHandle | undefined;
  let destinationHandle: fs.promises.FileHandle | undefined;
  let pendingArtifactHandle: fs.promises.FileHandle | undefined;
  let work: Readonly<HeldArtifact> | undefined;
  let train: Readonly<HeldArtifact> | undefined;
  let result: Readonly<HeldArtifact> | undefined;
  let manifest: Readonly<HeldArtifact> | undefined;
  let success:
    Readonly<FloodgateV7TrainingLabelFinalizationReceipt> | undefined;
  let failed = false;
  let primary: unknown;

  try {
    if (arguments.length !== 6) fail("finalizer accepts exactly six arguments");
    plan = takeTestPlan(planValue);
    progress.planConsumed = true;
    progress.phase = "input-capture";
    invocation = captureInvocation(optionsValue, dependenciesValue);
    progress.phase = "cross-binding";
    if (invocation.runId !== plan.runId || invocation.keyId !== plan.keyId) {
      fail("finalizer options do not match the opaque plan run/key binding");
    }
    observeKey(invocation, "root", invocation.rootKey);
    salt = Buffer.from(invocation.runId, "hex");
    resultKey = Buffer.from(
      hkdfSync(
        "sha256",
        invocation.rootKey,
        salt,
        Buffer.from(FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO),
        32,
      ),
    );
    manifestKey = Buffer.from(
      hkdfSync(
        "sha256",
        invocation.rootKey,
        salt,
        Buffer.from(FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO),
        32,
      ),
    );
    observeKey(invocation, "result", resultKey);
    observeKey(invocation, "manifest", manifestKey);
    invocation.rootKey.fill(0);
    salt.fill(0);

    progress.phase = "authority-transfer";
    transaction = beginFloodgateTeacherStagePublicationCoreForTests(
      lease,
      publicationDependencies,
    );
    progress.phase = "cross-binding";
    if (
      canonicalJson(stageIdentity(transaction.authorizationReceipt)) !==
      plan.stageCanonical
    ) {
      fail(
        "publication transaction does not match the opaque plan stage binding",
      );
    }
    progress.phase = "postflight-claim";
    claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
      postflightReceipt,
    );
    progress.postflightConsumed = true;
    const capturedPostflight = deepCaptureJson(
      postflightReceipt,
      "consumer postflight",
    ) as Readonly<FloodgateTrainingConsumerPostflightReceipt>;
    progress.phase = "cross-binding";
    if (
      canonicalJson(capturedPostflight.input.binding) !==
      plan.trainingBindingCanonical
    ) {
      fail(
        "consumer postflight does not match the opaque plan training binding",
      );
    }
    const consumerPostflightSha256 = sha256(canonicalJson(capturedPostflight));
    const trainingBindingSha256 = sha256(plan.trainingBindingCanonical);
    const stageBindingSha256 = sha256(plan.stageCanonical);
    const activeTransaction = transaction;
    const activeInvocation = invocation;
    const claimedPlan = plan;

    progress.phase = "source-work-audit";
    stageHandle = await manualContentValidation(
      "initial source stage could not be opened safely",
      () =>
        fs.promises.open(
          activeTransaction.stageRoot,
          fs.constants.O_RDONLY |
            fs.constants.O_DIRECTORY |
            fs.constants.O_NOFOLLOW,
        ),
    );
    const initialStageHandle = stageHandle;
    const authorizationReceipt = activeTransaction.authorizationReceipt;
    const initialEntries = await manualContentValidation(
      "initial source stage failed directory and entry validation",
      async () => {
        await assertDirectoryPath(
          activeTransaction.stageRoot,
          initialStageHandle,
          activeInvocation,
          authorizationReceipt,
          "initial source stage",
        );
        const entries = await exactEntries(activeTransaction.stageRoot);
        progress.observedState = stateString(entries);
        assertAllowedState(entries);
        return entries;
      },
    );

    const workHandle = await openExisting(
      activeTransaction.stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      invocation,
    );
    pendingArtifactHandle = workHandle;
    const workDigest = await manualContentValidation(
      "work.jsonl failed initial snapshot and content validation",
      async () => {
        const workInitialStat = await workHandle.stat({ bigint: true });
        assertPrivateFile(workInitialStat, activeInvocation, "work.jsonl");
        if (
          workInitialStat.size >
            BigInt(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES) ||
          !sameSnapshot(snapshot(workInitialStat), claimedPlan.work.snapshot)
        ) {
          fail("work.jsonl snapshot differs from the opaque plan binding");
        }
        const verified = await digestHeld(
          workHandle,
          activeInvocation,
          "work.jsonl",
        );
        if (
          verified.bytes !== claimedPlan.work.bytes ||
          verified.sha256 !== claimedPlan.work.sha256 ||
          !sameSnapshot(snapshot(verified.stat), claimedPlan.work.snapshot)
        ) {
          fail("work.jsonl differs from the synthetic sealed-work binding");
        }
        return verified;
      },
    );
    await workHandle.datasync();
    await stageHandle.sync();
    work = frozenRecord({
      handle: workHandle,
      snapshot: snapshot(workDigest.stat),
      evidence: evidence(
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        workDigest.stat,
        workDigest.bytes,
        workDigest.sha256,
      ),
    });
    pendingArtifactHandle = undefined;

    const expectedTrainingSummary = frozenRecord({
      filename: FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      input_parents: plan.expectedTrain.inputParents,
      forced_parents_skipped: plan.expectedTrain.forcedParentsSkipped,
      emitted_parent_groups: plan.expectedTrain.emittedParentGroups,
      parent_ids_sha256: plan.expectedTrain.parentIdsSha256,
      records: plan.expectedTrain.records,
      bytes: plan.expectedTrain.bytes,
      sha256: plan.expectedTrain.sha256,
    });
    const resultPayload = frozenRecord({
      schema: FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA,
      status: RESULT_STATUS,
      algorithm: FLOODGATE_V7_TRAINING_LABEL_FINALIZER_ALGORITHM,
      run_id: invocation.runId,
      key_id: invocation.keyId,
      entries: FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
      work: frozenRecord({
        filename: work.evidence.filename,
        bytes: work.evidence.bytes,
        sha256: work.evidence.sha256,
      }),
      training: expectedTrainingSummary,
      teacher_run_binding_sha256: plan.teacherRunBindingSha256,
      training_binding_sha256: trainingBindingSha256,
      stage_binding_sha256: stageBindingSha256,
      consumer_postflight_sha256: consumerPostflightSha256,
    });
    const resultBytes = authenticatedBytes(
      FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN,
      resultPayload,
      resultKey,
      "result_mac",
    );
    resultKey.fill(0);
    if (initialEntries.includes(FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME)) {
      await verifyCompleteTrainReadOnly(
        transaction.stageRoot,
        plan,
        invocation,
      );
    }
    if (
      initialEntries.includes(FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME)
    ) {
      await verifyCompleteMetadataReadOnly(
        transaction.stageRoot,
        FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        resultBytes,
        invocation,
        FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
      );
    }

    progress.phase = "train-persistence";
    progress.mayHavePersisted = true;
    const trainPersistence = await persistTrain(
      transaction.stageRoot,
      stageHandle,
      initialEntries.includes(FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME),
      plan,
      invocation,
      (handle) => {
        pendingArtifactHandle = handle;
      },
      () => {
        progress.durability = "train-directory-synced";
      },
    );
    train = trainPersistence.held;
    pendingArtifactHandle = undefined;
    if (
      canonicalJson(trainPersistence.summary) !==
      canonicalJson(plan.expectedTrain)
    ) {
      manualFail(
        "directory-synced train replay summary differs from the opaque plan",
      );
    }
    progress.phase = "result-persistence";
    result = await persistMetadata(
      transaction.stageRoot,
      stageHandle,
      FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      resultBytes,
      initialEntries.includes(FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME),
      invocation,
      (handle) => {
        pendingArtifactHandle = handle;
      },
      () => {
        progress.durability = "result-directory-synced";
      },
    );
    pendingArtifactHandle = undefined;

    const manifestPayload = frozenRecord({
      schema: FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA,
      status: MANIFEST_STATUS,
      finalization_contract: FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT,
      run_id: invocation.runId,
      key_id: invocation.keyId,
      entries: FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
      stage: plan.stage,
      stage_binding_sha256: stageBindingSha256,
      files: frozenRecord({
        work: frozenRecord({
          filename: work.evidence.filename,
          bytes: work.evidence.bytes,
          sha256: work.evidence.sha256,
        }),
        train: frozenRecord({
          filename: train.evidence.filename,
          bytes: train.evidence.bytes,
          sha256: train.evidence.sha256,
        }),
        result: frozenRecord({
          filename: result.evidence.filename,
          bytes: result.evidence.bytes,
          sha256: result.evidence.sha256,
        }),
      }),
      training: expectedTrainingSummary,
      teacher_run_binding_sha256: plan.teacherRunBindingSha256,
      training_binding_sha256: trainingBindingSha256,
      consumer_postflight_sha256: consumerPostflightSha256,
    });
    const manifestBytes = authenticatedBytes(
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN,
      manifestPayload,
      manifestKey,
      "manifest_mac",
    );
    manifestKey.fill(0);
    progress.phase = "manifest-persistence";
    manifest = await persistMetadata(
      transaction.stageRoot,
      stageHandle,
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
      manifestBytes,
      initialEntries.includes(FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME),
      invocation,
      (handle) => {
        pendingArtifactHandle = handle;
      },
      () => {
        progress.durability = "manifest-directory-synced";
      },
    );
    pendingArtifactHandle = undefined;

    progress.phase = "source-reverification";
    await manualContentValidation(
      "finalized source stage failed directory and entry validation",
      async () => {
        await assertDirectoryPath(
          activeTransaction.stageRoot,
          stageHandle as fs.promises.FileHandle,
          activeInvocation,
          activeTransaction.authorizationReceipt,
          "finalized source stage",
        );
        const sourceEntries = await exactEntries(activeTransaction.stageRoot);
        if (
          !exactStringArray(
            sourceEntries,
            FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
          )
        ) {
          fail(
            "source stage does not contain the exact committed artifact set",
          );
        }
      },
    );
    await fire(invocation, "source-reopened");
    for (const artifact of [work, train, result, manifest]) {
      await auditArtifact(transaction.stageRoot, artifact, invocation, true);
    }
    await manualContentValidation(
      "source stage failed post-content-audit directory validation",
      () =>
        assertDirectoryPath(
          activeTransaction.stageRoot,
          stageHandle as fs.promises.FileHandle,
          activeInvocation,
          activeTransaction.authorizationReceipt,
          "source stage after content audit",
        ),
    );
    await fire(invocation, "source-reverified");

    progress.phase = "publication";
    await fire(invocation, "before-publication");
    progress.commitStarted = true;
    const publication = await transaction.commit();
    progress.published = true;
    progress.publicationReceipt = publication;

    progress.phase = "destination-reverification";
    await fire(invocation, "before-destination-reopen");
    destinationHandle = await fs.promises.open(
      transaction.destinationRoot,
      fs.constants.O_RDONLY |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    progress.destinationReopened = true;
    await assertDirectoryPath(
      transaction.destinationRoot,
      destinationHandle,
      invocation,
      transaction.authorizationReceipt,
      "published destination",
    );
    const destinationEntries = await exactEntries(transaction.destinationRoot);
    if (
      !exactStringArray(
        destinationEntries,
        FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
      )
    ) {
      fail("published destination entry set is not exact");
    }
    await fire(invocation, "before-destination-reverify");
    for (const artifact of [work, train, result, manifest]) {
      await auditArtifact(
        transaction.destinationRoot,
        artifact,
        invocation,
        true,
      );
    }
    await assertDirectoryPath(
      transaction.destinationRoot,
      destinationHandle,
      invocation,
      transaction.authorizationReceipt,
      "published destination after content audit",
    );
    await fire(invocation, "destination-reverified");

    success = frozenRecord({
      contract: FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_STATUS,
      claim_boundary: FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CLAIM_BOUNDARY,
      execution_boundary:
        "test-only-injected-opaque-plan-finalizer-and-exclusive-private-directory-publication" as const,
      content: frozenRecord({
        work: work.evidence,
        train: train.evidence,
        result: result.evidence,
        manifest: manifest.evidence,
        parents: trainPersistence.summary.inputParents,
        training_records: trainPersistence.summary.records,
        consumer_postflight_sha256: consumerPostflightSha256,
      }),
      publication,
      postpublication: frozenRecord({
        destination_reopened: true as const,
        exact_entries: FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
        content_reverified: true as const,
      }),
    });
  } catch (error) {
    failed = true;
    primary = error;
  }

  const cleanupFailures = await closeHandles([
    destinationHandle,
    pendingArtifactHandle,
    manifest?.handle,
    result?.handle,
    train?.handle,
    work?.handle,
    stageHandle,
  ]);
  invocation?.rootKey.fill(0);
  resultKey.fill(0);
  manifestKey.fill(0);
  salt.fill(0);

  if (!failed && cleanupFailures.length > 0) {
    failed = true;
    primary = cleanupFailures[0];
    progress.phase = "cleanup";
  }
  let abortFailed = false;
  let abortFailure: unknown;
  if (failed && transaction !== undefined && !progress.commitStarted) {
    try {
      await transaction.abort();
    } catch (error) {
      abortFailed = true;
      abortFailure = error;
    }
  }
  if (failed) {
    const publication = progress.commitStarted
      ? publicationFacets(primary)
      : frozenRecord({
          durability: "not-established" as const,
          destinationReopened: false,
          leaseMayRemain: false,
          mayHavePublished: false,
        });
    const mayHavePublished =
      progress.publicationReceipt !== undefined ||
      progress.published ||
      (progress.commitStarted && publication.mayHavePublished);
    const publicationDurability =
      progress.publicationReceipt?.publication_durability ??
      publication.durability;
    const destinationReopened =
      progress.destinationReopened || publication.destinationReopened;
    const leaseMayRemain =
      progress.publicationReceipt !== undefined
        ? false
        : transaction === undefined
          ? true
          : abortFailed ||
            (progress.commitStarted && publication.leaseMayRemain);
    const manualContent =
      primary !== null &&
      (typeof primary === "object" || typeof primary === "function") &&
      !nodeUtilTypes.isProxy(primary) &&
      MANUAL_CONTENT_FAILURES.has(primary);
    const retryDisposition: FloodgateV7TrainingLabelFinalizerRetryDisposition =
      mayHavePublished && leaseMayRemain
        ? "manual-publication-and-lease-reconciliation-required"
        : mayHavePublished
          ? "manual-publication-reconciliation-required"
          : manualContent && leaseMayRemain
            ? "manual-content-and-lease-reconciliation-required"
            : leaseMayRemain
              ? transaction === undefined
                ? "caller-must-reconcile-existing-lease-authority"
                : "manual-lease-reconciliation-required"
              : manualContent
                ? "manual-content-reconciliation-required"
                : "fresh-authority-may-resume-exact-prefix";
    throw new FloodgateV7TrainingLabelFinalizerError(failureDetail(primary), {
      phase: progress.phase,
      observedState: progress.observedState,
      planConsumed: progress.planConsumed,
      postflightConsumed: progress.postflightConsumed,
      mayHavePersisted: progress.mayHavePersisted,
      mayHavePublished,
      durability: progress.durability,
      publicationDurability,
      destinationReopened,
      leaseMayRemain,
      retryDisposition,
      primary,
      cleanupFailures: [
        ...cleanupFailures,
        ...(abortFailed ? [abortFailure] : []),
      ],
    });
  }
  if (success === undefined) fail("finalizer completed without a receipt");
  return success;
}
