/**
 * Test-only composition of stable-proposal content finalization and private
 * namespace publication.
 *
 * The public surface deliberately accepts exact runtime capabilities rather
 * than caller-constructed verification or publication objects. It is still a
 * trusted-current-EUID boundary, not an openat sandbox, a teacher-label
 * verifier, or playing-strength evidence.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
  verifyAuthenticatedFloodgateStableProposalWork,
  type FloodgateStableProposalWorkVerification,
} from "./floodgate-stable-proposal-checkpoint";
import {
  beginFloodgateTeacherStagePublicationCoreForTests,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
  type FloodgateTeacherStagePublicationDurability,
  type FloodgateTeacherStagePublicationReceipt,
  type FloodgateTeacherStagePublicationTransaction,
} from "./floodgate-teacher-stage-authorization";
import {
  claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type FloodgateTrainingConsumerPostflightReceipt,
} from "./floodgate-training-row-consumer";

export const FLOODGATE_STABLE_PROPOSAL_RESULT_SCHEMA =
  "shogi-floodgate-stable-proposal-result-v1" as const;
export const FLOODGATE_STABLE_PROPOSAL_MANIFEST_SCHEMA =
  "shogi-floodgate-stable-proposal-manifest-v1" as const;
export const FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT =
  "shogi-floodgate-stable-proposal-finalization-publication-v1" as const;
export const FLOODGATE_STABLE_PROPOSAL_FINALIZATION_STATUS =
  "verified-consumer-postflight-authenticated-work-durable-manifest-and-exclusive-publication" as const;
export const FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CLAIM_BOUNDARY =
  "test-only-synthetic-consumer-work-content-and-private-namespace-publication-evidence-not-teacher-label-training-or-playing-strength-evidence" as const;
export const FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME = "result.json" as const;
export const FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME =
  "manifest.json" as const;

const RESULT_STATUS =
  "verified-consumer-postflight-and-authenticated-proposal-work" as const;
const MANIFEST_STATUS =
  "durable-private-finalization-manifest-ready-for-exclusive-publication" as const;
const RESULT_DOMAIN = "shogi-floodgate-stable-proposal-result-v1\0";
const MANIFEST_DOMAIN = "shogi-floodgate-stable-proposal-manifest-v1\0";
const HKDF_INFO = "shogi-floodgate-stable-proposal-finalizer-key-v1\0";
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MODE_MASK = 0o7777;
const MAX_WORK_BYTES = 64 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const FINAL_ENTRIES = Object.freeze([
  FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME,
  FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
  FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
] as const);

const objectFreeze = Object.freeze;
const objectCreate = Object.create;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;

export type FloodgateStableProposalFinalizerEvent =
  | "work-file-synced"
  | "work-directory-synced"
  | "result-created"
  | "result-written"
  | "result-file-synced"
  | "result-directory-synced"
  | "manifest-created"
  | "manifest-written"
  | "manifest-file-synced"
  | "manifest-directory-synced"
  | "source-content-reverified"
  | "before-publication-commit"
  | "before-destination-reopen"
  | "before-destination-content-reverification";

export type FloodgateStableProposalFinalizerFailurePhase =
  | "authority-transfer"
  | "postflight-claim"
  | "work-verification"
  | "result-persistence"
  | "manifest-persistence"
  | "source-reverification"
  | "publication"
  | "destination-reverification"
  | "cleanup";

export type FloodgateStableProposalFinalizerDurability =
  | "work-not-synced"
  | "work-file-synced"
  | "work-directory-synced"
  | "result-file-synced"
  | "result-directory-synced"
  | "manifest-file-synced"
  | "complete-set-directory-synced";

export type FloodgateStableProposalFinalizerRetryDisposition =
  | "caller-must-reconcile-existing-lease-authority"
  | "fresh-authority-may-resume-exact-prefix"
  | "manual-content-reconciliation-required"
  | "manual-lease-reconciliation-required"
  | "manual-publication-and-lease-reconciliation-required"
  | "manual-publication-reconciliation-required"
  | "complete";

export interface FloodgateStableProposalFinalizerOptions {
  readonly rootKey: Uint8Array;
  readonly runId: string;
  readonly keyId: string;
}

export interface FloodgateStableProposalFinalizerDependencies {
  readonly effectiveUserId: number;
  readonly failpointForTests?: (
    event: FloodgateStableProposalFinalizerEvent,
  ) => void | Promise<void>;
}

export interface FloodgateStableProposalFinalizationReceipt {
  readonly contract: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT;
  readonly status: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_STATUS;
  readonly claim_boundary: typeof FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CLAIM_BOUNDARY;
  readonly execution_boundary: "test-only-injected-finalizer-and-exclusive-rename";
  readonly content: Readonly<{
    readonly algorithm: typeof FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM;
    readonly work: Readonly<FloodgateStableProposalPublishedFileEvidence>;
    readonly result: Readonly<FloodgateStableProposalPublishedFileEvidence>;
    readonly manifest: Readonly<FloodgateStableProposalPublishedFileEvidence>;
    readonly consumer_postflight_sha256: string;
    readonly proposal_receipt_sha256: string;
    readonly semantic_binding_sha256: string;
  }>;
  readonly publication: Readonly<FloodgateTeacherStagePublicationReceipt>;
  readonly postpublication: Readonly<{
    readonly destination_reopened: true;
    readonly exact_entries: typeof FINAL_ENTRIES;
    readonly content_reverified: true;
  }>;
}

export interface FloodgateStableProposalPublishedFileEvidence {
  readonly filename:
    | typeof FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME
    | typeof FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
    | typeof FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME;
  readonly dev: string;
  readonly ino: string;
  readonly mode: "0600";
  readonly bytes: number;
  readonly sha256: string;
}

interface FinalizerErrorFacets {
  readonly phase: FloodgateStableProposalFinalizerFailurePhase;
  readonly observedState: string;
  readonly workVerified: boolean;
  readonly postflightClaimConsumed: boolean;
  readonly durability: FloodgateStableProposalFinalizerDurability;
  readonly mayHavePersisted: boolean;
  readonly mayHavePublished: boolean;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition: FloodgateStableProposalFinalizerRetryDisposition;
  readonly primary: unknown;
  readonly cleanupFailures?: readonly unknown[];
}

export class FloodgateStableProposalFinalizerError extends Error {
  readonly phase: FloodgateStableProposalFinalizerFailurePhase;
  readonly observedState: string;
  readonly workVerified: boolean;
  readonly postflightClaimConsumed: boolean;
  readonly durability: FloodgateStableProposalFinalizerDurability;
  readonly mayHavePersisted: boolean;
  readonly mayHavePublished: boolean;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly retryDisposition: FloodgateStableProposalFinalizerRetryDisposition;
  readonly primary: unknown;
  readonly cleanupFailures: readonly unknown[];

  constructor(message: string, facets: Readonly<FinalizerErrorFacets>) {
    super(`Floodgate stable proposal finalizer failed: ${message}`, {
      cause: facets.primary,
    });
    this.name = "FloodgateStableProposalFinalizerError";
    this.phase = facets.phase;
    this.observedState = facets.observedState;
    this.workVerified = facets.workVerified;
    this.postflightClaimConsumed = facets.postflightClaimConsumed;
    this.durability = facets.durability;
    this.mayHavePersisted = facets.mayHavePersisted;
    this.mayHavePublished = facets.mayHavePublished;
    this.publicationDurability = facets.publicationDurability;
    this.destinationReopened = facets.destinationReopened;
    this.leaseMayRemain = facets.leaseMayRemain;
    this.retryDisposition = facets.retryDisposition;
    this.primary = facets.primary;
    this.cleanupFailures = objectFreeze([...(facets.cleanupFailures ?? [])]);
  }
}

interface CapturedInvocation {
  readonly rootKey: Buffer;
  readonly runId: string;
  readonly keyId: string;
  readonly effectiveUserId: number;
  readonly failpoint?: FloodgateStableProposalFinalizerDependencies["failpointForTests"];
}

interface MutableProgress {
  phase: FloodgateStableProposalFinalizerFailurePhase;
  observedState: string;
  workVerified: boolean;
  postflightClaimConsumed: boolean;
  durability: FloodgateStableProposalFinalizerDurability;
  mayHavePersisted: boolean;
  commitStarted: boolean;
  publicationReceipt?: Readonly<FloodgateTeacherStagePublicationReceipt>;
  destinationReopened: boolean;
}

interface HeldFile {
  readonly handle: fs.promises.FileHandle;
  readonly evidence: Readonly<FloodgateStableProposalPublishedFileEvidence>;
  readonly expected: Buffer;
}

const MANUAL_CONTENT_FAILURES = new WeakSet<object>();

function fail(message: string): never {
  throw new Error(message);
}

function manualContentFail(message: string, cause?: unknown): never {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  MANUAL_CONTENT_FAILURES.add(error);
  throw error;
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
    const descriptor = Object.getOwnPropertyDescriptor(value, "message");
    if (descriptor !== undefined && "value" in descriptor) {
      return typeof descriptor.value === "string"
        ? descriptor.value
        : "non-string failure message";
    }
  } catch {
    return "uninspectable failure object";
  }
  return "non-message failure object";
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
  const captured = objectCreate(null) as Record<string, unknown>;
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") fail(`${label} must not contain symbol keys`);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable own data property`);
    }
    captured[key] = descriptor.value;
  }
  return objectFreeze(captured);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const captured = record(value, label);
  const actual = Object.keys(captured).sort(compareUtf8);
  const expected = [...expectedKeys].sort(compareUtf8);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
  return captured;
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
    fail(`${label} must be dense and contain no extra properties`);
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
      .map((entry) => canonicalJson(entry))
      .join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const captured = record(value, "canonical JSON object");
    return `{${Object.keys(captured)
      .sort(compareUtf8)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(captured[key])}`)
      .join(",")}}`;
  }
  return fail(`canonical JSON rejects ${typeof value}`);
}

function deepCaptureJson(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("captured JSON rejects nonfinite numbers and negative zero");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return objectFreeze(
      denseArray(value, "captured JSON array").map((entry) =>
        deepCaptureJson(entry),
      ),
    );
  }
  if (isPlainRecord(value)) {
    const source = record(value, "captured JSON object");
    const output = objectCreate(null) as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      output[key] = deepCaptureJson(source[key]);
    }
    return objectFreeze(output);
  }
  return fail(`captured JSON rejects ${typeof value}`);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    output[key] = (value as Record<string, unknown>)[key];
  }
  return objectFreeze(output) as Readonly<T>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a nonempty string`);
  }
  return value;
}

function digestValue(value: unknown, label: string): string {
  const result = stringValue(value, label);
  if (!SHA256_RE.test(result)) fail(`${label} must be a lowercase SHA-256`);
  return result;
}

function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function captureInvocation(
  optionsValue: FloodgateStableProposalFinalizerOptions,
  dependenciesValue: FloodgateStableProposalFinalizerDependencies,
): CapturedInvocation {
  const options = exactRecord(
    optionsValue,
    ["keyId", "rootKey", "runId"],
    "finalizer options",
  );
  const dependencyKeys = ["effectiveUserId"];
  if (
    isPlainRecord(dependenciesValue) &&
    Object.prototype.hasOwnProperty.call(dependenciesValue, "failpointForTests")
  ) {
    dependencyKeys.push("failpointForTests");
  }
  const dependencies = exactRecord(
    dependenciesValue,
    dependencyKeys,
    "finalizer dependencies",
  );
  if (typeof options.runId !== "string" || !RUN_ID_RE.test(options.runId)) {
    fail("finalizer options.runId must be 32 bytes of lowercase hex");
  }
  if (typeof options.keyId !== "string" || !KEY_ID_RE.test(options.keyId)) {
    fail("finalizer options.keyId is invalid");
  }
  const rootKeyValue = options.rootKey;
  if (
    !nodeUtilTypes.isUint8Array(rootKeyValue) ||
    nodeUtilTypes.isProxy(rootKeyValue) ||
    nodeUtilTypes.isSharedArrayBuffer(rootKeyValue.buffer) ||
    rootKeyValue.byteLength !== 32
  ) {
    fail("finalizer options.rootKey must be a non-shared 32-byte Uint8Array");
  }
  const effectiveUserId = integerValue(
    dependencies.effectiveUserId,
    "finalizer dependencies.effectiveUserId",
  );
  const failpoint = dependencies.failpointForTests;
  if (failpoint !== undefined && typeof failpoint !== "function") {
    fail("finalizer dependencies.failpointForTests must be a function");
  }
  const rootKey = Buffer.alloc(32);
  rootKey.set(rootKeyValue);
  return frozenRecord({
    rootKey,
    runId: options.runId,
    keyId: options.keyId,
    effectiveUserId,
    failpoint: failpoint as CapturedInvocation["failpoint"],
  });
}

function validatePostflight(
  value: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
): Readonly<Record<string, unknown>> {
  const receipt = exactRecord(
    value,
    [
      "claim_boundary",
      "execution_boundary",
      "input",
      "postflight",
      "runtime_claim",
      "schema",
      "status",
    ],
    "consumer postflight receipt",
  );
  if (
    receipt.schema !== FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA ||
    receipt.status !== FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY ||
    receipt.runtime_claim !==
      FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM ||
    receipt.execution_boundary !== "test-only-injected-bundle-verifier"
  ) {
    fail("consumer postflight receipt boundary is unsupported");
  }
  const input = exactRecord(
    receipt.input,
    ["binding", "role", "schema"],
    "consumer postflight input",
  );
  if (
    input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    input.role !== "training"
  ) {
    fail("consumer postflight input boundary is unsupported");
  }
  canonicalJson(input.binding);
  const postflight = exactRecord(
    receipt.postflight,
    [
      "callback_settled_without_value",
      "filesystem_snapshot_revalidated_after_callback",
      "input_descriptors_closed",
    ],
    "consumer postflight lifecycle",
  );
  if (
    postflight.callback_settled_without_value !== true ||
    postflight.filesystem_snapshot_revalidated_after_callback !== true ||
    postflight.input_descriptors_closed !== true
  ) {
    fail("consumer postflight lifecycle is incomplete");
  }
  return deepCaptureJson(receipt) as Readonly<Record<string, unknown>>;
}

function stageIdentity(
  receipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
): Readonly<Record<string, unknown>> {
  if (
    receipt.contract !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    receipt.trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    receipt.status !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS
  ) {
    fail("stage authorization boundary is unsupported");
  }
  return frozenRecord({
    authorization_contract: receipt.contract,
    authorization_trust_boundary: receipt.trust_boundary,
    parent_dev: receipt.parent_identity.dev.toString(),
    parent_ino: receipt.parent_identity.ino.toString(),
    stage_basename: receipt.stage_basename,
    destination_basename: receipt.destination_basename,
    stage_dev: receipt.stage_identity.dev.toString(),
    stage_ino: receipt.stage_identity.ino.toString(),
  });
}

function assertPrivateDirectory(
  stat: fs.BigIntStats,
  effectiveUserId: number,
  receipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  label: string,
): void {
  if (
    !stat.isDirectory() ||
    stat.dev !== receipt.stage_identity.dev ||
    stat.ino !== receipt.stage_identity.ino ||
    stat.uid !== BigInt(effectiveUserId) ||
    Number(stat.mode & BigInt(MODE_MASK)) !== 0o700
  ) {
    fail(`${label} is not the exact authorized private stage directory`);
  }
}

function assertPrivateFile(
  stat: fs.BigIntStats,
  effectiveUserId: number,
  maximumBytes: number,
  label: string,
): void {
  if (
    !stat.isFile() ||
    stat.uid !== BigInt(effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    Number(stat.mode & BigInt(MODE_MASK)) !== 0o600 ||
    stat.size < BigInt(0) ||
    stat.size > BigInt(maximumBytes)
  ) {
    fail(`${label} must be a bounded owner-only regular single-link file`);
  }
}

async function stableRead(
  handle: fs.promises.FileHandle,
  effectiveUserId: number,
  maximumBytes: number,
  label: string,
): Promise<{ readonly bytes: Buffer; readonly stat: fs.BigIntStats }> {
  const before = await handle.stat({ bigint: true });
  assertPrivateFile(before, effectiveUserId, maximumBytes, label);
  const length = Number(before.size);
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(bytes, offset, length - offset, offset);
    if (result.bytesRead <= 0) fail(`${label} changed during read`);
    offset += result.bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  assertPrivateFile(after, effectiveUserId, maximumBytes, label);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  ) {
    fail(`${label} mutated during read`);
  }
  return frozenRecord({ bytes, stat: after });
}

function fileEvidence(
  filename: FloodgateStableProposalPublishedFileEvidence["filename"],
  stat: fs.BigIntStats,
  bytes: Uint8Array,
): Readonly<FloodgateStableProposalPublishedFileEvidence> {
  return frozenRecord({
    filename,
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    mode: "0600" as const,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  });
}

async function exactEntries(root: string): Promise<readonly string[]> {
  const entries = await fs.promises.readdir(root);
  return objectFreeze([...entries].sort(compareUtf8));
}

function observedState(entries: readonly string[]): string {
  return `{${entries.join(",")}}`;
}

function assertInitialEntryState(entries: readonly string[]): void {
  const allowed = new Set<string>(FINAL_ENTRIES);
  if (
    !entries.includes(FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME) ||
    entries.some((entry) => !allowed.has(entry)) ||
    (entries.includes(FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME) &&
      !entries.includes(FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME))
  ) {
    manualContentFail("stage entries require manual content reconciliation");
  }
}

function assertFinalEntries(entries: readonly string[]): void {
  if (
    entries.length !== FINAL_ENTRIES.length ||
    entries.some((entry, index) => entry !== FINAL_ENTRIES[index])
  ) {
    manualContentFail("stage does not contain the exact final entry set");
  }
}

async function fire(
  invocation: CapturedInvocation,
  event: FloodgateStableProposalFinalizerEvent,
): Promise<void> {
  await invocation.failpoint?.(event);
}

async function openHeldDirectory(
  root: string,
  invocation: CapturedInvocation,
  receipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  registerHandle: (handle: fs.promises.FileHandle) => void,
): Promise<fs.promises.FileHandle> {
  const handle = await fs.promises.open(
    root,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  registerHandle(handle);
  assertPrivateDirectory(
    await handle.stat({ bigint: true }),
    invocation.effectiveUserId,
    receipt,
    "opened finalizer stage",
  );
  return handle;
}

async function assertHeldDirectoryPath(
  root: string,
  handle: fs.promises.FileHandle,
  invocation: CapturedInvocation,
  receipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  label: string,
): Promise<void> {
  const held = await handle.stat({ bigint: true });
  const pathname = await fs.promises.lstat(root, { bigint: true });
  assertPrivateDirectory(held, invocation.effectiveUserId, receipt, label);
  assertPrivateDirectory(
    pathname,
    invocation.effectiveUserId,
    receipt,
    `${label} pathname`,
  );
  if (held.dev !== pathname.dev || held.ino !== pathname.ino) {
    fail(`${label} pathname differs from the held authorized directory`);
  }
}

async function openExistingFile(
  root: string,
  filename: FloodgateStableProposalPublishedFileEvidence["filename"],
  readWrite: boolean,
): Promise<fs.promises.FileHandle> {
  return fs.promises.open(
    path.join(root, filename),
    (readWrite ? fs.constants.O_RDWR : fs.constants.O_RDONLY) |
      fs.constants.O_NOFOLLOW,
  );
}

async function createOrOpenMetadata(
  stageRoot: string,
  stageHandle: fs.promises.FileHandle,
  filename:
    | typeof FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
    | typeof FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME,
  expected: Buffer,
  invocation: CapturedInvocation,
  progress: MutableProgress,
  authorizationReceipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  registerHandle: (handle: fs.promises.FileHandle) => void,
): Promise<HeldFile> {
  await assertHeldDirectoryPath(
    stageRoot,
    stageHandle,
    invocation,
    authorizationReceipt,
    `${filename} stage before persistence`,
  );
  let handle: fs.promises.FileHandle;
  let created = false;
  try {
    handle = await fs.promises.open(
      path.join(stageRoot, filename),
      fs.constants.O_RDWR |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    created = true;
    progress.mayHavePersisted = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    handle = await openExistingFile(stageRoot, filename, true);
  }
  registerHandle(handle);
  try {
    if (created) {
      await handle.chmod(0o600);
      await fire(
        invocation,
        filename === FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
          ? "result-created"
          : "manifest-created",
      );
    }
    let existing: Awaited<ReturnType<typeof stableRead>>;
    try {
      existing = await stableRead(
        handle,
        invocation.effectiveUserId,
        MAX_METADATA_BYTES,
        filename,
      );
    } catch (error) {
      if (!created) {
        manualContentFail(
          `${filename} existing metadata is unsafe for automatic resume`,
          error,
        );
      }
      throw error;
    }
    if (existing.bytes.byteLength > expected.byteLength) {
      manualContentFail(`${filename} is longer than the deterministic payload`);
    }
    const prefix = expected.subarray(0, existing.bytes.byteLength);
    if (
      existing.bytes.byteLength !== prefix.byteLength ||
      (prefix.byteLength > 0 && !timingSafeEqual(existing.bytes, prefix))
    ) {
      manualContentFail(`${filename} is not an exact deterministic prefix`);
    }
    let offset = existing.bytes.byteLength;
    while (offset < expected.byteLength) {
      progress.mayHavePersisted = true;
      const result = await handle.write(
        expected,
        offset,
        expected.byteLength - offset,
        offset,
      );
      if (result.bytesWritten <= 0) fail(`${filename} write made no progress`);
      offset += result.bytesWritten;
    }
    progress.mayHavePersisted = true;
    await fire(
      invocation,
      filename === FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
        ? "result-written"
        : "manifest-written",
    );
    await handle.sync();
    progress.durability =
      filename === FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
        ? "result-file-synced"
        : "manifest-file-synced";
    await fire(
      invocation,
      filename === FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
        ? "result-file-synced"
        : "manifest-file-synced",
    );
    const completed = await stableRead(
      handle,
      invocation.effectiveUserId,
      MAX_METADATA_BYTES,
      filename,
    );
    if (
      completed.bytes.byteLength !== expected.byteLength ||
      !timingSafeEqual(completed.bytes, expected)
    ) {
      fail(`${filename} does not equal the deterministic payload after sync`);
    }
    await stageHandle.sync();
    progress.durability =
      filename === FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
        ? "result-directory-synced"
        : "complete-set-directory-synced";
    await fire(
      invocation,
      filename === FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME
        ? "result-directory-synced"
        : "manifest-directory-synced",
    );
    await assertHeldDirectoryPath(
      stageRoot,
      stageHandle,
      invocation,
      authorizationReceipt,
      `${filename} stage after persistence`,
    );
    return frozenRecord({
      handle,
      expected,
      evidence: fileEvidence(filename, completed.stat, completed.bytes),
    });
  } catch (error) {
    throw error;
  }
}

function exactBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    (left.byteLength === 0 || timingSafeEqual(left, right))
  );
}

async function verifyHeldFile(
  root: string,
  held: HeldFile,
  invocation: CapturedInvocation,
): Promise<void> {
  let current: Awaited<ReturnType<typeof stableRead>>;
  try {
    current = await stableRead(
      held.handle,
      invocation.effectiveUserId,
      held.evidence.filename ===
        FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME
        ? MAX_WORK_BYTES
        : MAX_METADATA_BYTES,
      held.evidence.filename,
    );
  } catch (error) {
    manualContentFail(
      `${held.evidence.filename} held content is unsafe for automatic resume`,
      error,
    );
  }
  if (
    current.stat.dev.toString() !== held.evidence.dev ||
    current.stat.ino.toString() !== held.evidence.ino ||
    !exactBytes(current.bytes, held.expected)
  ) {
    manualContentFail(
      `${held.evidence.filename} held identity or bytes changed`,
    );
  }
  let pathname: fs.BigIntStats;
  try {
    pathname = await fs.promises.lstat(
      path.join(root, held.evidence.filename),
      { bigint: true },
    );
    assertPrivateFile(
      pathname,
      invocation.effectiveUserId,
      held.evidence.filename ===
        FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME
        ? MAX_WORK_BYTES
        : MAX_METADATA_BYTES,
      `${held.evidence.filename} pathname`,
    );
  } catch (error) {
    manualContentFail(
      `${held.evidence.filename} pathname is unsafe for automatic resume`,
      error,
    );
  }
  if (
    pathname.dev.toString() !== held.evidence.dev ||
    pathname.ino.toString() !== held.evidence.ino
  ) {
    manualContentFail(`${held.evidence.filename} pathname was replaced`);
  }
}

function buildResultPayload(
  verification: Readonly<FloodgateStableProposalWorkVerification>,
  postflight: Readonly<Record<string, unknown>>,
  finalizerKey: Buffer,
): {
  readonly bytes: Buffer;
  readonly consumerSha256: string;
  readonly proposalReceiptSha256: string;
} {
  const header = record(verification.evidence.header, "verified work header");
  const producer = record(header.producer, "verified work producer");
  const seal = record(verification.evidence.seal, "verified work seal");
  const proposalReceiptSha256 = digestValue(
    producer.proposal_receipt_sha256,
    "verified work proposal receipt digest",
  );
  const consumerCanonical = `${canonicalJson(postflight)}\n`;
  const consumerSha256 = sha256(consumerCanonical);
  const unsigned = frozenRecord({
    schema: FLOODGATE_STABLE_PROPOSAL_RESULT_SCHEMA,
    kind: "result" as const,
    status: RESULT_STATUS,
    claim_boundary: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CLAIM_BOUNDARY,
    algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
    run_id: verification.evidence.run_id,
    key_id: verification.evidence.key_id,
    consumer_postflight: postflight,
    work_verification: frozenRecord({
      contract: verification.contract,
      status: verification.status,
      claim_boundary: verification.claim_boundary,
      work: verification.evidence.work,
      stage: verification.evidence.stage,
      checkpoint: frozenRecord({
        algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
        schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
        header_status: header.status,
        status: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
        seal_status: seal.status,
      }),
      proposal: frozenRecord({
        schema: producer.proposal_schema,
        status: producer.proposal_status,
        claim_boundary: producer.proposal_claim_boundary,
        receipt_sha256: proposalReceiptSha256,
        semantic_run_fingerprint_sha256:
          producer.semantic_run_fingerprint_sha256,
      }),
      semantic_binding: frozenRecord({
        domain: verification.semantic_binding.domain,
        sha256: verification.semantic_binding.sha256,
      }),
    }),
  });
  const mac = createHmac("sha256", finalizerKey)
    .update(RESULT_DOMAIN)
    .update(canonicalJson(unsigned))
    .digest("hex");
  const payload = frozenRecord({ ...unsigned, result_mac: mac });
  return frozenRecord({
    bytes: Buffer.from(`${canonicalJson(payload)}\n`, "utf8"),
    consumerSha256,
    proposalReceiptSha256,
  });
}

function buildManifestBytes(
  verification: Readonly<FloodgateStableProposalWorkVerification>,
  postflightSha256: string,
  proposalReceiptSha256: string,
  work: Readonly<FloodgateStableProposalPublishedFileEvidence>,
  result: Readonly<FloodgateStableProposalPublishedFileEvidence>,
  authorizationReceipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  finalizerKey: Buffer,
): Buffer {
  const unsigned = frozenRecord({
    schema: FLOODGATE_STABLE_PROPOSAL_MANIFEST_SCHEMA,
    kind: "manifest" as const,
    status: MANIFEST_STATUS,
    claim_boundary: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CLAIM_BOUNDARY,
    algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
    run_id: verification.evidence.run_id,
    key_id: verification.evidence.key_id,
    stage: stageIdentity(authorizationReceipt),
    entries: FINAL_ENTRIES,
    files: frozenRecord({ work, result }),
    bindings: frozenRecord({
      consumer_postflight_sha256: postflightSha256,
      proposal_receipt_sha256: proposalReceiptSha256,
      semantic_binding_sha256: verification.semantic_binding.sha256,
    }),
  });
  const mac = createHmac("sha256", finalizerKey)
    .update(MANIFEST_DOMAIN)
    .update(canonicalJson(unsigned))
    .digest("hex");
  return Buffer.from(
    `${canonicalJson(frozenRecord({ ...unsigned, manifest_mac: mac }))}\n`,
    "utf8",
  );
}

function crossBind(
  verification: Readonly<FloodgateStableProposalWorkVerification>,
  postflight: Readonly<Record<string, unknown>>,
): void {
  const projection = record(
    verification.semantic_binding.projection,
    "semantic binding projection",
  );
  const workInput = exactRecord(
    projection.input,
    ["authenticated_training_binding", "input_rows_sha256", "records"],
    "verified work input",
  );
  const consumerInput = exactRecord(
    postflight.input,
    ["binding", "role", "schema"],
    "consumer postflight input",
  );
  const consumerBinding = record(
    consumerInput.binding,
    "consumer postflight binding",
  );
  if (
    canonicalJson(workInput.authenticated_training_binding) !==
      canonicalJson(consumerBinding) ||
    integerValue(workInput.records, "verified work input.records") !==
      integerValue(consumerBinding.records, "consumer binding.records")
  ) {
    fail("authenticated work input does not match consumer postflight binding");
  }
  const seal = record(verification.evidence.seal, "verified work seal");
  const output = record(seal.proposal_output, "verified work proposal output");
  if (
    integerValue(output.records, "verified work output.records") !==
    integerValue(workInput.records, "verified work input.records")
  ) {
    fail("authenticated work input and proposal output record counts differ");
  }
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

async function destinationAudit(
  transaction: Readonly<FloodgateTeacherStagePublicationTransaction>,
  publication: Readonly<FloodgateTeacherStagePublicationReceipt>,
  invocation: CapturedInvocation,
  work: HeldFile,
  result: HeldFile,
  manifest: HeldFile,
  postflight: Readonly<Record<string, unknown>>,
  opened: fs.promises.FileHandle[],
  markReopened: () => void,
): Promise<void> {
  await fire(invocation, "before-destination-reopen");
  const directory = await fs.promises.open(
    transaction.destinationRoot,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  opened.push(directory);
  const stat = await directory.stat({ bigint: true });
  if (
    !stat.isDirectory() ||
    stat.dev !== publication.destination_identity.dev ||
    stat.ino !== publication.destination_identity.ino ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    Number(stat.mode & BigInt(MODE_MASK)) !== 0o700
  ) {
    fail("published destination is not the exact private directory");
  }
  markReopened();
  await fire(invocation, "before-destination-content-reverification");
  await assertHeldDirectoryPath(
    transaction.destinationRoot,
    directory,
    invocation,
    transaction.authorizationReceipt,
    "published destination before content revalidation",
  );
  assertFinalEntries(await exactEntries(transaction.destinationRoot));
  for (const held of [work, result, manifest]) {
    const reopened = await openExistingFile(
      transaction.destinationRoot,
      held.evidence.filename,
      false,
    );
    opened.push(reopened);
    const current = await stableRead(
      reopened,
      invocation.effectiveUserId,
      held.evidence.filename ===
        FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME
        ? MAX_WORK_BYTES
        : MAX_METADATA_BYTES,
      `published ${held.evidence.filename}`,
    );
    if (
      current.stat.dev.toString() !== held.evidence.dev ||
      current.stat.ino.toString() !== held.evidence.ino ||
      !exactBytes(current.bytes, held.expected)
    ) {
      fail(
        `published ${held.evidence.filename} differs from finalized content`,
      );
    }
  }
  const publishedWork = await stableRead(
    opened[1] as fs.promises.FileHandle,
    invocation.effectiveUserId,
    MAX_WORK_BYTES,
    "published work.jsonl",
  );
  const publishedVerification = verifyAuthenticatedFloodgateStableProposalWork(
    publishedWork.bytes,
    {
      rootKey: invocation.rootKey,
      runId: invocation.runId,
      keyId: invocation.keyId,
      stageAuthorizationReceipt: transaction.authorizationReceipt,
    },
  );
  crossBind(publishedVerification, postflight);
  await assertHeldDirectoryPath(
    transaction.destinationRoot,
    directory,
    invocation,
    transaction.authorizationReceipt,
    "published destination after content revalidation",
  );
}

/**
 * Consume one exact test lease and one exact test postflight receipt, finalize
 * deterministic result/manifest files, publish, and reverify the destination.
 */
export async function finalizeAndPublishFloodgateStableProposalsCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  postflightReceipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  options: FloodgateStableProposalFinalizerOptions,
  dependencies: FloodgateStableProposalFinalizerDependencies,
  publicationDependencies: FloodgateTeacherStagePublicationDependencies,
): Promise<Readonly<FloodgateStableProposalFinalizationReceipt>> {
  let transaction: Readonly<FloodgateTeacherStagePublicationTransaction>;
  try {
    transaction = beginFloodgateTeacherStagePublicationCoreForTests(
      lease,
      publicationDependencies,
    );
  } catch (primary) {
    throw new FloodgateStableProposalFinalizerError(
      "publication authority could not be transferred",
      {
        phase: "authority-transfer",
        observedState: "uninspected",
        workVerified: false,
        postflightClaimConsumed: false,
        durability: "work-not-synced",
        mayHavePersisted: false,
        mayHavePublished: false,
        publicationDurability: "not-established",
        destinationReopened: false,
        leaseMayRemain: true,
        retryDisposition: "caller-must-reconcile-existing-lease-authority",
        primary,
      },
    );
  }

  const progress: MutableProgress = {
    phase: "postflight-claim",
    observedState: "uninspected",
    workVerified: false,
    postflightClaimConsumed: false,
    durability: "work-not-synced",
    mayHavePersisted: false,
    commitStarted: false,
    destinationReopened: false,
  };
  let invocation: CapturedInvocation | undefined;
  let finalizerKey = Buffer.alloc(0);
  let stageHandle: fs.promises.FileHandle | undefined;
  let pendingStageHandle: fs.promises.FileHandle | undefined;
  let pendingWorkHandle: fs.promises.FileHandle | undefined;
  let pendingMetadataHandle: fs.promises.FileHandle | undefined;
  let pendingPrecheckHandle: fs.promises.FileHandle | undefined;
  let work: HeldFile | undefined;
  let result: HeldFile | undefined;
  let manifest: HeldFile | undefined;
  let destinationHandles: readonly fs.promises.FileHandle[] = [];
  let success: Readonly<FloodgateStableProposalFinalizationReceipt> | undefined;
  let primary: unknown;

  try {
    claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
      postflightReceipt,
    );
    progress.postflightClaimConsumed = true;
    const postflight = validatePostflight(postflightReceipt);
    invocation = captureInvocation(options, dependencies);
    finalizerKey = Buffer.from(
      hkdfSync(
        "sha256",
        invocation.rootKey,
        Buffer.from(invocation.runId, "hex"),
        Buffer.from(HKDF_INFO),
        32,
      ),
    );

    progress.phase = "work-verification";
    stageHandle = await openHeldDirectory(
      transaction.stageRoot,
      invocation,
      transaction.authorizationReceipt,
      (handle) => {
        pendingStageHandle = handle;
      },
    );
    pendingStageHandle = undefined;
    await assertHeldDirectoryPath(
      transaction.stageRoot,
      stageHandle,
      invocation,
      transaction.authorizationReceipt,
      "initial finalizer stage",
    );
    const initialEntries = await exactEntries(transaction.stageRoot);
    progress.observedState = observedState(initialEntries);
    assertInitialEntryState(initialEntries);
    const workHandle = await openExistingFile(
      transaction.stageRoot,
      FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
      false,
    );
    pendingWorkHandle = workHandle;
    const workRead = await stableRead(
      workHandle,
      invocation.effectiveUserId,
      MAX_WORK_BYTES,
      FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
    );
    const verification = verifyAuthenticatedFloodgateStableProposalWork(
      workRead.bytes,
      {
        rootKey: invocation.rootKey,
        runId: invocation.runId,
        keyId: invocation.keyId,
        stageAuthorizationReceipt: transaction.authorizationReceipt,
      },
    );
    crossBind(verification, postflight);
    progress.workVerified = true;
    await workHandle.sync();
    progress.durability = "work-file-synced";
    await fire(invocation, "work-file-synced");
    await stageHandle.sync();
    progress.durability = "work-directory-synced";
    await fire(invocation, "work-directory-synced");
    work = frozenRecord({
      handle: workHandle,
      expected: workRead.bytes,
      evidence: fileEvidence(
        FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
        workRead.stat,
        workRead.bytes,
      ),
    });
    pendingWorkHandle = undefined;

    const resultPayload = buildResultPayload(
      verification,
      postflight,
      finalizerKey,
    );
    if (initialEntries.includes(FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME)) {
      const existingResult = await openExistingFile(
        transaction.stageRoot,
        FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
        false,
      );
      pendingPrecheckHandle = existingResult;
      const existing = await stableRead(
        existingResult,
        invocation.effectiveUserId,
        MAX_METADATA_BYTES,
        FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
      );
      if (!exactBytes(existing.bytes, resultPayload.bytes)) {
        manualContentFail(
          "manifest exists while result is not already complete",
        );
      }
      await existingResult.close();
      pendingPrecheckHandle = undefined;
    }

    progress.phase = "result-persistence";
    result = await createOrOpenMetadata(
      transaction.stageRoot,
      stageHandle,
      FLOODGATE_STABLE_PROPOSAL_RESULT_FILENAME,
      resultPayload.bytes,
      invocation,
      progress,
      transaction.authorizationReceipt,
      (handle) => {
        pendingMetadataHandle = handle;
      },
    );
    pendingMetadataHandle = undefined;
    const manifestBytes = buildManifestBytes(
      verification,
      resultPayload.consumerSha256,
      resultPayload.proposalReceiptSha256,
      work.evidence,
      result.evidence,
      transaction.authorizationReceipt,
      finalizerKey,
    );
    progress.phase = "manifest-persistence";
    manifest = await createOrOpenMetadata(
      transaction.stageRoot,
      stageHandle,
      FLOODGATE_STABLE_PROPOSAL_MANIFEST_FILENAME,
      manifestBytes,
      invocation,
      progress,
      transaction.authorizationReceipt,
      (handle) => {
        pendingMetadataHandle = handle;
      },
    );
    pendingMetadataHandle = undefined;

    progress.phase = "source-reverification";
    await assertHeldDirectoryPath(
      transaction.stageRoot,
      stageHandle,
      invocation,
      transaction.authorizationReceipt,
      "finalized source stage",
    );
    assertFinalEntries(await exactEntries(transaction.stageRoot));
    assertPrivateDirectory(
      await stageHandle.stat({ bigint: true }),
      invocation.effectiveUserId,
      transaction.authorizationReceipt,
      "finalized source stage",
    );
    await verifyHeldFile(transaction.stageRoot, work, invocation);
    await verifyHeldFile(transaction.stageRoot, result, invocation);
    await verifyHeldFile(transaction.stageRoot, manifest, invocation);
    await fire(invocation, "source-content-reverified");

    progress.phase = "publication";
    await fire(invocation, "before-publication-commit");
    progress.commitStarted = true;
    const publication = await transaction.commit();
    progress.publicationReceipt = publication;

    progress.phase = "destination-reverification";
    const openedDestinationHandles: fs.promises.FileHandle[] = [];
    destinationHandles = openedDestinationHandles;
    await destinationAudit(
      transaction,
      publication,
      invocation,
      work,
      result,
      manifest,
      postflight,
      openedDestinationHandles,
      () => {
        progress.destinationReopened = true;
      },
    );
    success = frozenRecord({
      contract: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CONTRACT,
      status: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_STATUS,
      claim_boundary: FLOODGATE_STABLE_PROPOSAL_FINALIZATION_CLAIM_BOUNDARY,
      execution_boundary:
        "test-only-injected-finalizer-and-exclusive-rename" as const,
      content: frozenRecord({
        algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
        work: work.evidence,
        result: result.evidence,
        manifest: manifest.evidence,
        consumer_postflight_sha256: resultPayload.consumerSha256,
        proposal_receipt_sha256: resultPayload.proposalReceiptSha256,
        semantic_binding_sha256: verification.semantic_binding.sha256,
      }),
      publication,
      postpublication: frozenRecord({
        destination_reopened: true as const,
        exact_entries: FINAL_ENTRIES,
        content_reverified: true as const,
      }),
    });
  } catch (error) {
    primary = error;
  }

  const cleanupFailures = await closeHandles([
    ...destinationHandles,
    manifest?.handle,
    result?.handle,
    work?.handle,
    pendingWorkHandle,
    pendingMetadataHandle,
    pendingPrecheckHandle,
    pendingStageHandle,
    stageHandle,
  ]);
  invocation?.rootKey.fill(0);
  finalizerKey.fill(0);

  if (primary === undefined && cleanupFailures.length > 0) {
    primary = cleanupFailures[0];
    progress.phase = "cleanup";
  }
  if (primary !== undefined) {
    let abortFailure: unknown;
    if (!progress.commitStarted) {
      try {
        await transaction.abort();
      } catch (error) {
        abortFailure = error;
      }
    }
    const publication = publicationFacets(primary);
    const allCleanup = [
      ...cleanupFailures,
      ...(abortFailure === undefined ? [] : [abortFailure]),
    ];
    const mayHavePublished =
      progress.publicationReceipt !== undefined ||
      (progress.commitStarted && publication.mayHavePublished);
    const manualContent =
      primary !== null &&
      (typeof primary === "object" || typeof primary === "function") &&
      MANUAL_CONTENT_FAILURES.has(primary);
    const leaseMayRemain =
      progress.publicationReceipt === undefined
        ? abortFailure !== undefined ||
          (progress.commitStarted && publication.leaseMayRemain)
        : false;
    throw new FloodgateStableProposalFinalizerError(failureDetail(primary), {
      phase: progress.phase,
      observedState: progress.observedState,
      workVerified: progress.workVerified,
      postflightClaimConsumed: progress.postflightClaimConsumed,
      durability: progress.durability,
      mayHavePersisted: progress.mayHavePersisted,
      mayHavePublished,
      publicationDurability:
        progress.publicationReceipt === undefined
          ? publication.durability
          : progress.publicationReceipt.publication_durability,
      destinationReopened:
        progress.destinationReopened || publication.destinationReopened,
      leaseMayRemain,
      retryDisposition:
        mayHavePublished && leaseMayRemain
          ? "manual-publication-and-lease-reconciliation-required"
          : mayHavePublished
            ? "manual-publication-reconciliation-required"
            : leaseMayRemain
              ? "manual-lease-reconciliation-required"
              : manualContent
                ? "manual-content-reconciliation-required"
                : "fresh-authority-may-resume-exact-prefix",
      primary,
      cleanupFailures: allCleanup,
    });
  }
  if (success === undefined) fail("finalizer completed without a receipt");
  return success;
}
