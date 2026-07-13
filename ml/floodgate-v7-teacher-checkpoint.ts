/**
 * Test-only authenticated incremental checkpoint for v7 teacher parents.
 *
 * This boundary accepts an already-authenticated training-row capability and
 * an authorized private stage lease. It authenticates a durable prefix before
 * asking the caller to repeat any search, persists only compact completed
 * parent evidence, and seals the stream only after every parent is present.
 * The producer, every test hook, and the current JavaScript realm/intrinsics
 * are trusted. Returned parent evidence remains adversarial and is reverified.
 * The HMAC detects persisted-byte tampering by a non-key-holder; it does not
 * defend against hostile same-process mutation or key access.
 * It is not a production coordinator, publication boundary, teacher-label
 * claim, holdout reader, or playing-strength claim.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import { types as nodeUtilTypes } from "node:util";

import {
  buildFloodgateV7CompletedParentCoreForTests,
  verifyFloodgateV7CompletedParentEvidenceCoreForTests,
  type FloodgateV7CompletedParentEvidence,
  type FloodgateV7CompletedParentInput,
} from "./floodgate-v7-completed-parent";
import {
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  type FloodgateTeacherStageLease,
} from "./floodgate-teacher-stage-authorization";
import {
  claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingInputBinding,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-consumer";
import { FLOODGATE_PRODUCTION_TEACHER_RUNTIME } from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
  FLOODGATE_STABLE_MAX_ROWS,
} from "./floodgate-stable-wasm-proposer";
import { toSfen } from "./generate-teacher";
import { positionFromSfen, rulesCompleteLegalMoves } from "./shogi-sfen";
import { positionKeyFromSfen } from "./sibling-data";
import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

export const FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA =
  "shogi-floodgate-v7-teacher-work-v1" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM =
  "hmac-sha256-hkdf-sha256-v7-parent-chain-v1" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_PREFIX_STATUS =
  "authenticated-durable-private-v7-parent-prefix-not-complete-not-published" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS =
  "complete-authenticated-private-v7-teacher-parent-checkpoint-not-published" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY =
  "accepted-parent-exactly-once-search-at-least-once-trusted-producer-test-hooks-and-current-js-realm-intrinsics-returned-evidence-adversarial-reverified-hmac-persisted-byte-tamper-evidence-for-non-key-holders-only-not-hostile-same-process-mutation-production-origin-label-holdout-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME =
  "work.jsonl" as const;
export const FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA =
  "shogi-floodgate-v7-teacher-run-binding-v1" as const;

const HEADER_DOMAIN = "shogi-floodgate-v7-teacher-work-header-v1\0";
const ENTRY_DOMAIN = "shogi-floodgate-v7-teacher-work-parent-v1\0";
const SEAL_DOMAIN = "shogi-floodgate-v7-teacher-work-seal-v1\0";
const KEY_INFO = "shogi-floodgate-v7-teacher-checkpoint-key-v1\0";
const PARENT_STREAM_DOMAIN = "shogi-floodgate-v7-training-parents-v1\0";
const EVIDENCE_DOMAIN = "shogi-floodgate-v7-completed-evidence-v1\0";
const FORMAT = "canonical-jsonl-utf8-single-final-lf-v1" as const;
const DURABILITY =
  "append-parent-line-fsync-seal-directory-sync-final-reopen-v1" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES = 24 * 1024;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES =
  FLOODGATE_STABLE_MAX_ROWS *
    (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1) +
  2 * (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1);
export const FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT =
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines;
const MAX_TOTAL_BYTES = FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES;
const MAX_LINE_BYTES = FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES;
const MODE_MASK = 0o7777;
const MODE_TYPE_MASK = fs.constants.S_IFMT;
const MODE_DIRECTORY = fs.constants.S_IFDIR;
const MODE_REGULAR = fs.constants.S_IFREG;
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get;
const nativeTypedArraySet = typedArrayPrototype.set as (
  source: ArrayLike<number>,
  offset?: number,
) => void;
const nativeTypedArrayFill = typedArrayPrototype.fill as (
  value: number,
  start?: number,
  end?: number,
) => Uint8Array;
const NativePromise = Promise;
const nativePromisePrototype = Promise.prototype;
const nativePromiseThen = Promise.prototype.then;
const nativePromiseReject = Promise.reject.bind(Promise);
const nativePromiseAllSettled = Promise.allSettled.bind(Promise);
const objectDefineProperty = Object.defineProperty;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const nodeIsPromise = nodeUtilTypes.isPromise;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nodeIsUint8Array = nodeUtilTypes.isUint8Array;
const nodeIsSharedArrayBuffer = nodeUtilTypes.isSharedArrayBuffer;

const INPUT_KEYS = Object.freeze([
  "binding",
  "role",
  "rows",
  "schema",
] as const);
const BINDING_KEYS = Object.freeze([
  "bundle_manifest_bytes",
  "bundle_manifest_sha256",
  "bundle_producer_revision",
  "game_ids_sha256",
  "games",
  "parent_ids_sha256",
  "position_ids_count",
  "position_ids_sha256",
  "raw_bytes",
  "raw_format",
  "raw_sha256",
  "records",
  "result_receipt_bytes",
  "result_receipt_sha256",
  "verifier_revision",
] as const);
const PARENT_KEYS = Object.freeze([
  "game_id",
  "parent_id",
  "parent_sfen",
  "played_move",
  "ply",
  "position_id",
  "schema_version",
] as const);
const RUN_BINDING_KEYS = Object.freeze([
  "plan",
  "schema",
  "stable_runtime_receipt_sha256",
  "teacher_usi_runtime_receipt_sha256",
] as const);
const IDENTITY_KEYS = Object.freeze(["bytes", "sha256"] as const);
const HEADER_KEYS = Object.freeze([
  "algorithm",
  "claim_boundary",
  "header_mac",
  "key_id",
  "kind",
  "run_binding",
  "run_id",
  "schema",
  "stage_binding",
  "status",
  "training",
] as const);
const ENTRY_KEYS = Object.freeze([
  "completed_evidence",
  "completed_evidence_sha256",
  "entry_mac",
  "input_index",
  "kind",
  "parent",
  "parent_id",
  "previous_mac",
  "schema",
  "sequence",
] as const);
const SEAL_KEYS = Object.freeze([
  "entries",
  "final_entry_mac",
  "kind",
  "parent_ids_sha256",
  "seal_mac",
  "schema",
  "status",
  "training_parents_sha256",
] as const);
export interface FloodgateV7TeacherCheckpointRunBinding {
  readonly schema: typeof FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA;
  readonly plan: Readonly<{
    readonly bytes: typeof FLOODGATE_FRESH_SIBLING_PLAN_BYTES;
    readonly sha256: typeof FLOODGATE_FRESH_SIBLING_PLAN_SHA256;
  }>;
  readonly stable_runtime_receipt_sha256: string;
  readonly teacher_usi_runtime_receipt_sha256: string;
}

export interface FloodgateV7TeacherCheckpointOptions {
  readonly runId: string;
  readonly keyId: string;
}

export type FloodgateV7TeacherCheckpointFailpointPhase =
  | "after-header-durable"
  | "after-parent-produced-before-entry"
  | "after-entry-durable"
  | "after-seal-durable"
  | "before-final-reopen";

export interface FloodgateV7TeacherCheckpointFailpointEvent {
  readonly phase: FloodgateV7TeacherCheckpointFailpointPhase;
  readonly sequence?: number;
}

export interface FloodgateV7TeacherCheckpointDependencies {
  readonly rootKey: Uint8Array;
  readonly effectiveUserId: number;
  readonly failpointForTests?: (
    event: Readonly<FloodgateV7TeacherCheckpointFailpointEvent>,
  ) => void | Promise<void>;
  readonly writeForTests?: (
    request: Readonly<{
      readonly label: string;
      readonly bytes: Uint8Array;
      readonly offset: number;
      readonly length: number;
    }>,
    write: (maximumBytes?: number) => Promise<number>,
  ) => Promise<number>;
  readonly closeForTests?: (
    kind: "work" | "stage",
    close: () => Promise<void>,
  ) => Promise<void>;
}

export interface FloodgateV7TeacherMissingParentRequest {
  readonly input_index: number;
  readonly parent: Readonly<FloodgateTrainingParent>;
}

export type FloodgateV7TeacherMissingParentProducer = (
  request: Readonly<FloodgateV7TeacherMissingParentRequest>,
) => Promise<Readonly<FloodgateV7CompletedParentInput>>;

export interface FloodgateV7TeacherCheckpointReceipt {
  readonly contract: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA;
  readonly status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY;
  readonly algorithm: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM;
  readonly run_id: string;
  readonly key_id: string;
  readonly stage: Readonly<{
    readonly basename: string;
    readonly parent_dev: string;
    readonly parent_ino: string;
    readonly dev: string;
    readonly ino: string;
  }>;
  readonly work: Readonly<{
    readonly filename: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME;
    readonly format: typeof FORMAT;
    readonly records: number;
    readonly bytes: number;
    readonly sha256: string;
    readonly completed_parents: number;
    readonly resumed_parents: number;
    readonly durability: typeof DURABILITY;
  }>;
}

export class FloodgateV7TeacherCheckpointError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Floodgate v7 teacher checkpoint failed: ${message}`, options);
    this.name = "FloodgateV7TeacherCheckpointError";
  }
}

export class FloodgateV7TeacherCheckpointPersistenceIndeterminateError extends FloodgateV7TeacherCheckpointError {
  readonly mayHavePersisted = true as const;

  constructor(message: string, options?: ErrorOptions) {
    super(`persistence is indeterminate: ${message}`, options);
    this.name = "FloodgateV7TeacherCheckpointPersistenceIndeterminateError";
  }
}

interface CapturedTraining {
  readonly binding: Readonly<FloodgateTrainingInputBinding>;
  readonly parents: readonly Readonly<FloodgateTrainingParent>[];
  readonly canonicalParentsSha256: string;
  readonly parentIdsSha256: string;
}

interface CapturedInvocation {
  readonly lease: Readonly<FloodgateTeacherStageLease>;
  readonly training: CapturedTraining;
  readonly runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
  readonly producer: FloodgateV7TeacherMissingParentProducer;
  readonly runId: string;
  readonly keyId: string;
  readonly rootKey: Buffer;
  readonly effectiveUserId: number;
  readonly failpoint?: FloodgateV7TeacherCheckpointDependencies["failpointForTests"];
  readonly writeForTests?: FloodgateV7TeacherCheckpointDependencies["writeForTests"];
  readonly closeForTests?: FloodgateV7TeacherCheckpointDependencies["closeForTests"];
  readonly persistenceState: { mayHaveStarted: boolean };
}

interface ScanResult {
  readonly completedParents: number;
  readonly previousMac: string;
  readonly sealed: boolean;
  readonly authenticatedBytes: number;
  readonly tornTail: boolean;
}

function failure(message: string, cause?: unknown): never {
  throw new FloodgateV7TeacherCheckpointError(
    message,
    cause === undefined ? undefined : { cause },
  );
}

function zeroBytes(value: Uint8Array): void {
  reflectApply(nativeTypedArrayFill, value, [0]);
}

function persistenceFailure(message: string, cause: unknown): never {
  throw new FloodgateV7TeacherCheckpointPersistenceIndeterminateError(message, {
    cause,
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeIsProxy(value)
  ) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value))
    failure(`${label} must be a plain non-Proxy object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    failure(`${label} must not contain symbol keys`);
  }
  const actual = (keys as string[]).sort(compareUtf8);
  const expected = [...expectedKeys].sort(compareUtf8);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    failure(`${label} keys are not exact`);
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      failure(`${label}.${key} must be an enumerable own data property`);
    }
    captured[key] = descriptor.value;
  }
  return Object.freeze(captured);
}

function strictArray(value: unknown, label: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== Array.prototype
  ) {
    failure(`${label} must be an ordinary non-Proxy array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = value.length;
  if (reflectOwnKeys(descriptors).length !== length + 1) {
    failure(`${label} must be dense and contain no extra properties`);
  }
  const captured: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      failure(`${label}[${index}] must be an enumerable own data property`);
    }
    captured.push(descriptor.value);
  }
  return Object.freeze(captured);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      failure("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${strictArray(value, "canonical JSON array")
      .map((entry) => canonicalJson(entry))
      .join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = reflectOwnKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      failure("canonical JSON rejects symbol keys");
    }
    return `{${(keys as string[])
      .sort(compareUtf8)
      .map((key) => {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          failure(`canonical JSON property ${key} is not enumerable data`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(descriptor.value)}`;
      })
      .join(",")}}`;
  }
  return failure(`canonical JSON rejects ${typeof value}`);
}

function deepCapture(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      failure("captured JSON rejects nonfinite numbers and negative zero");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      strictArray(value, "captured JSON array").map((entry) =>
        deepCapture(entry),
      ),
    );
  }
  if (isPlainRecord(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = reflectOwnKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      failure("captured JSON rejects symbol keys");
    }
    const captured = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        failure(`captured JSON property ${key} is not enumerable data`);
      }
      captured[key] = deepCapture(descriptor.value);
    }
    return Object.freeze(captured);
  }
  return failure(`captured JSON rejects ${typeof value}`);
}

function frozen<T extends object>(value: T): Readonly<T> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    output[key] = (value as Record<string, unknown>)[key];
  }
  return Object.freeze(output) as Readonly<T>;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function identifierDigest(values: readonly string[]): string {
  return sha256Hex([...new Set(values)].sort(compareUtf8).join("\n"));
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256Hex(`${domain}${canonicalJson(value)}`);
}

function requiredSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    failure(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requiredSemanticId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SEMANTIC_ID_RE.test(value)) {
    failure(`${label} must be a canonical semantic identifier`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    failure(`${label} must be a safe integer at least ${minimum}`);
  }
  return value as number;
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256Hex(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function captureParent(
  value: unknown,
  index: number,
): Readonly<FloodgateTrainingParent> {
  const row = strictRecord(value, PARENT_KEYS, `training.rows[${index}]`);
  if (row.schema_version !== 1) {
    failure(`training.rows[${index}].schema_version must be 1`);
  }
  const gameId = requiredSemanticId(
    row.game_id,
    `training.rows[${index}].game_id`,
  );
  const parentId = requiredSemanticId(
    row.parent_id,
    `training.rows[${index}].parent_id`,
  );
  const positionId = requiredSemanticId(
    row.position_id,
    `training.rows[${index}].position_id`,
  );
  const ply = requiredInteger(row.ply, `training.rows[${index}].ply`);
  if (ply > 2_147_483_647 || parentId !== parentOccurrenceId(gameId, ply)) {
    failure(`training.rows[${index}] parent occurrence identity is invalid`);
  }
  if (
    typeof row.parent_sfen !== "string" ||
    row.parent_sfen.length === 0 ||
    row.parent_sfen.trim() !== row.parent_sfen ||
    row.parent_sfen.includes("\0") ||
    typeof row.played_move !== "string" ||
    row.played_move.length === 0 ||
    row.played_move.trim() !== row.played_move ||
    row.played_move.includes("\0")
  ) {
    failure(`training.rows[${index}] SFEN or played move is invalid`);
  }
  let parsed: ReturnType<typeof positionFromSfen>;
  try {
    parsed = positionFromSfen(row.parent_sfen);
  } catch (cause) {
    return failure(`training.rows[${index}] SFEN cannot be parsed`, cause);
  }
  if (
    toSfen(parsed.position, parsed.moveNumber) !== row.parent_sfen ||
    parsed.moveNumber !== ply + 1 ||
    positionKeyFromSfen(row.parent_sfen) !== positionId
  ) {
    failure(`training.rows[${index}] SFEN binding is inconsistent`);
  }
  const legal = rulesCompleteLegalMoves(parsed.position);
  if (
    legal.length === 0 ||
    legal.some((move) => getKomashu(move.move.capture) === OU) ||
    !legal.some((move) => move.usi === row.played_move)
  ) {
    failure(`training.rows[${index}] played move is not rules-complete legal`);
  }
  return frozen({
    schema_version: 1 as const,
    game_id: gameId,
    parent_id: parentId,
    position_id: positionId,
    parent_sfen: row.parent_sfen,
    ply,
    played_move: row.played_move,
  });
}

function captureBinding(
  value: unknown,
): Readonly<FloodgateTrainingInputBinding> {
  const binding = strictRecord(value, BINDING_KEYS, "training.binding");
  for (const key of [
    "bundle_manifest_sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
    "raw_sha256",
    "result_receipt_sha256",
  ] as const) {
    requiredSha256(binding[key], `training.binding.${key}`);
  }
  for (const key of [
    "bundle_producer_revision",
    "verifier_revision",
  ] as const) {
    if (typeof binding[key] !== "string" || !REVISION_RE.test(binding[key])) {
      failure(`training.binding.${key} must be a lowercase revision`);
    }
  }
  for (const key of [
    "bundle_manifest_bytes",
    "games",
    "position_ids_count",
    "raw_bytes",
    "records",
    "result_receipt_bytes",
  ] as const) {
    requiredInteger(binding[key], `training.binding.${key}`, 1);
  }
  if (
    (binding.records as number) > FLOODGATE_STABLE_MAX_ROWS ||
    (binding.games as number) > FLOODGATE_STABLE_MAX_ROWS ||
    (binding.position_ids_count as number) > FLOODGATE_STABLE_MAX_ROWS ||
    typeof binding.raw_format !== "string" ||
    binding.raw_format.length === 0 ||
    binding.raw_format.trim() !== binding.raw_format
  ) {
    failure("training.binding aggregate bound or raw format is invalid");
  }
  return Object.freeze(
    deepCapture(binding),
  ) as Readonly<FloodgateTrainingInputBinding>;
}

function captureTraining(
  value: AuthenticatedFloodgateTrainingRows,
): CapturedTraining {
  const input = strictRecord(value, INPUT_KEYS, "authenticated training rows");
  if (
    input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    input.role !== "training"
  ) {
    failure("authenticated training row schema or role is unsupported");
  }
  const binding = captureBinding(input.binding);
  const rowValues = strictArray(input.rows, "training.rows");
  if (
    rowValues.length === 0 ||
    rowValues.length > FLOODGATE_STABLE_MAX_ROWS ||
    rowValues.length !== binding.records
  ) {
    failure("training row count is outside its exact authenticated bound");
  }
  const parents = rowValues.map((row, index) => captureParent(row, index));
  const gameIds = new Set<string>();
  const parentIds = new Set<string>();
  const positionIds = new Set<string>();
  let previousParentId: string | undefined;
  for (const parent of parents) {
    if (
      previousParentId !== undefined &&
      compareUtf8(previousParentId, parent.parent_id) >= 0
    ) {
      failure("training rows are not in strict parent_id byte order");
    }
    previousParentId = parent.parent_id;
    if (
      parentIds.has(parent.parent_id) ||
      positionIds.has(parent.position_id)
    ) {
      failure("training rows duplicate a parent or semantic position");
    }
    gameIds.add(parent.game_id);
    parentIds.add(parent.parent_id);
    positionIds.add(parent.position_id);
  }
  if (
    gameIds.size !== binding.games ||
    parentIds.size !== binding.records ||
    positionIds.size !== binding.position_ids_count ||
    identifierDigest([...gameIds]) !== binding.game_ids_sha256 ||
    identifierDigest([...parentIds]) !== binding.parent_ids_sha256 ||
    identifierDigest([...positionIds]) !== binding.position_ids_sha256
  ) {
    failure("training aggregate identities do not match their binding");
  }
  const parentStream = `${parents.map((parent) => canonicalJson(parent)).join("\n")}\n`;
  return Object.freeze({
    binding,
    parents: Object.freeze(parents),
    canonicalParentsSha256: sha256Hex(`${PARENT_STREAM_DOMAIN}${parentStream}`),
    parentIdsSha256: identifierDigest([...parentIds]),
  });
}

function captureRunBinding(
  value: FloodgateV7TeacherCheckpointRunBinding,
): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  const binding = strictRecord(value, RUN_BINDING_KEYS, "run binding");
  if (binding.schema !== FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA) {
    failure("run binding schema is unsupported");
  }
  const plan = strictRecord(binding.plan, IDENTITY_KEYS, "run binding.plan");
  if (
    plan.bytes !== FLOODGATE_FRESH_SIBLING_PLAN_BYTES ||
    plan.sha256 !== FLOODGATE_FRESH_SIBLING_PLAN_SHA256
  ) {
    failure("run binding does not bind the pinned v7 plan");
  }
  return frozen({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: frozen({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    }),
    stable_runtime_receipt_sha256: requiredSha256(
      binding.stable_runtime_receipt_sha256,
      "run binding.stable_runtime_receipt_sha256",
    ),
    teacher_usi_runtime_receipt_sha256: requiredSha256(
      binding.teacher_usi_runtime_receipt_sha256,
      "run binding.teacher_usi_runtime_receipt_sha256",
    ),
  });
}

function captureInvocation(
  lease: Readonly<FloodgateTeacherStageLease>,
  trainingValue: AuthenticatedFloodgateTrainingRows,
  runBindingValue: FloodgateV7TeacherCheckpointRunBinding,
  producerValue: FloodgateV7TeacherMissingParentProducer,
  optionsValue: FloodgateV7TeacherCheckpointOptions,
  dependenciesValue: FloodgateV7TeacherCheckpointDependencies,
): CapturedInvocation {
  const stageReceipt = lease.receipt;
  if (
    stageReceipt.contract !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    stageReceipt.trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    stageReceipt.status !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS ||
    canonicalJson(stageReceipt.allowed_entries) !==
      canonicalJson(FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES)
  ) {
    failure("authorized stage lease receipt boundary is unsupported");
  }
  const options = strictRecord(optionsValue, ["keyId", "runId"], "options");
  if (typeof options.runId !== "string" || !RUN_ID_RE.test(options.runId)) {
    failure("options.runId must be 32 bytes of lowercase hex");
  }
  if (typeof options.keyId !== "string" || !KEY_ID_RE.test(options.keyId)) {
    failure("options.keyId is invalid");
  }
  if (typeof producerValue !== "function" || nodeIsProxy(producerValue)) {
    failure("produceMissingParent must be a non-Proxy function");
  }
  if (!isPlainRecord(dependenciesValue)) {
    failure("dependencies must be a plain non-Proxy object");
  }
  const optionalKeys = ["closeForTests", "failpointForTests", "writeForTests"];
  const expectedDependencyKeys = ["effectiveUserId", "rootKey"];
  for (const key of optionalKeys) {
    if (Object.prototype.hasOwnProperty.call(dependenciesValue, key)) {
      expectedDependencyKeys.push(key);
    }
  }
  const dependencies = strictRecord(
    dependenciesValue,
    expectedDependencyKeys,
    "dependencies",
  );
  const effectiveUserId = requiredInteger(
    dependencies.effectiveUserId,
    "dependencies.effectiveUserId",
  );
  const rootKeyValue = dependencies.rootKey;
  if (
    !nodeIsUint8Array(rootKeyValue) ||
    nodeIsProxy(rootKeyValue) ||
    objectGetPrototypeOf(rootKeyValue) !== Uint8Array.prototype ||
    typedArrayBufferGetter === undefined ||
    typedArrayByteLengthGetter === undefined ||
    typedArrayByteOffsetGetter === undefined
  ) {
    failure("dependencies.rootKey must be a non-shared 32-byte Uint8Array");
  }
  let rootBuffer: ArrayBufferLike;
  let rootByteLength: number;
  let rootByteOffset: number;
  try {
    rootBuffer = reflectApply(
      typedArrayBufferGetter,
      rootKeyValue,
      [],
    ) as ArrayBufferLike;
    rootByteLength = reflectApply(
      typedArrayByteLengthGetter,
      rootKeyValue,
      [],
    ) as number;
    rootByteOffset = reflectApply(
      typedArrayByteOffsetGetter,
      rootKeyValue,
      [],
    ) as number;
  } catch (cause) {
    return failure(
      "dependencies.rootKey typed-array state is inaccessible",
      cause,
    );
  }
  if (
    nodeIsSharedArrayBuffer(rootBuffer) ||
    rootByteLength !== 32 ||
    rootByteOffset !== 0 ||
    rootBuffer.byteLength !== 32
  ) {
    failure(
      "dependencies.rootKey must own exactly one non-shared 32-byte buffer",
    );
  }
  const rootKey = Buffer.alloc(32);
  reflectApply(nativeTypedArraySet, rootKey, [rootKeyValue, 0]);
  const failpoint = dependencies.failpointForTests as
    | FloodgateV7TeacherCheckpointDependencies["failpointForTests"]
    | undefined;
  const writeForTests = dependencies.writeForTests as
    | FloodgateV7TeacherCheckpointDependencies["writeForTests"]
    | undefined;
  const closeForTests = dependencies.closeForTests as
    | FloodgateV7TeacherCheckpointDependencies["closeForTests"]
    | undefined;
  if (
    failpoint !== undefined &&
    (typeof failpoint !== "function" || nodeIsProxy(failpoint))
  ) {
    zeroBytes(rootKey);
    failure("dependencies.failpointForTests must be a function");
  }
  if (
    writeForTests !== undefined &&
    (typeof writeForTests !== "function" || nodeIsProxy(writeForTests))
  ) {
    zeroBytes(rootKey);
    failure("dependencies.writeForTests must be a function");
  }
  if (
    closeForTests !== undefined &&
    (typeof closeForTests !== "function" || nodeIsProxy(closeForTests))
  ) {
    zeroBytes(rootKey);
    failure("dependencies.closeForTests must be a function");
  }
  try {
    return Object.freeze({
      lease,
      training: captureTraining(trainingValue),
      runBinding: captureRunBinding(runBindingValue),
      producer: producerValue,
      runId: options.runId,
      keyId: options.keyId,
      rootKey,
      effectiveUserId,
      failpoint,
      writeForTests,
      closeForTests,
      persistenceState: { mayHaveStarted: false },
    });
  } catch (cause) {
    zeroBytes(rootKey);
    throw cause;
  }
}

function hmacHex(
  key: Uint8Array,
  domain: string,
  payload: Readonly<Record<string, unknown>>,
): string {
  return createHmac("sha256", key)
    .update(domain, "utf8")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
}

function withoutKey(
  record: Readonly<Record<string, unknown>>,
  removed: string,
): Readonly<Record<string, unknown>> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== removed) output[key] = record[key];
  }
  return Object.freeze(output);
}

function macEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string" || !SHA256_RE.test(actual)) return false;
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  return left.byteLength === 32 && timingSafeEqual(left, right);
}

function stageBinding(
  invocation: CapturedInvocation,
): Readonly<Record<string, unknown>> {
  const receipt = invocation.lease.receipt;
  return frozen({
    authorization_contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
    authorization_trust_boundary:
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
    stage_basename: receipt.stage_basename,
    parent_dev: receipt.parent_identity.dev.toString(10),
    parent_ino: receipt.parent_identity.ino.toString(10),
    stage_dev: receipt.stage_identity.dev.toString(10),
    stage_ino: receipt.stage_identity.ino.toString(10),
  });
}

function headerPayload(
  invocation: CapturedInvocation,
): Readonly<Record<string, unknown>> {
  return frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
    kind: "header",
    run_id: invocation.runId,
    key_id: invocation.keyId,
    algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_PREFIX_STATUS,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
    stage_binding: stageBinding(invocation),
    training: frozen({
      schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
      role: "training",
      binding: invocation.training.binding,
      records: invocation.training.parents.length,
      parent_ids_sha256: invocation.training.parentIdsSha256,
      canonical_parents_sha256: invocation.training.canonicalParentsSha256,
    }),
    run_binding: invocation.runBinding,
  });
}

function buildHeader(
  invocation: CapturedInvocation,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const payload = headerPayload(invocation);
  return frozen({
    ...payload,
    header_mac: hmacHex(key, HEADER_DOMAIN, payload),
  });
}

function sealPayload(
  invocation: CapturedInvocation,
  previousMac: string,
): Readonly<Record<string, unknown>> {
  return frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
    kind: "seal",
    entries: invocation.training.parents.length,
    final_entry_mac: previousMac,
    parent_ids_sha256: invocation.training.parentIdsSha256,
    training_parents_sha256: invocation.training.canonicalParentsSha256,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
  });
}

function buildSeal(
  invocation: CapturedInvocation,
  previousMac: string,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const payload = sealPayload(invocation, previousMac);
  return frozen({ ...payload, seal_mac: hmacHex(key, SEAL_DOMAIN, payload) });
}

function exactJson(left: unknown, right: unknown, label: string): void {
  if (canonicalJson(left) !== canonicalJson(right)) {
    failure(`${label} is not the exact expected projection`);
  }
}

function captureCompletedEvidence(
  value: FloodgateV7CompletedParentEvidence,
  expectedParent: Readonly<FloodgateTrainingParent>,
  inputIndex: number,
  runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
): Readonly<Record<string, unknown>> {
  let verified: Readonly<FloodgateV7CompletedParentEvidence>;
  try {
    verified = verifyFloodgateV7CompletedParentEvidenceCoreForTests(value);
  } catch (cause) {
    return failure(
      `completed evidence ${inputIndex} failed compact semantic verification`,
      cause,
    );
  }
  if (
    verified.parent.game_id !== expectedParent.game_id ||
    verified.parent.parent_id !== expectedParent.parent_id ||
    verified.parent.position_id !== expectedParent.position_id ||
    verified.parent.parent_sfen !== expectedParent.parent_sfen ||
    verified.parent.ply !== expectedParent.ply ||
    verified.strong_game_played_move !== expectedParent.played_move ||
    verified.stable_runtime_binding.runtime_receipt_sha256 !==
      runBinding.stable_runtime_receipt_sha256 ||
    (verified.teacher_proposal_runtime_binding !== null &&
      verified.teacher_proposal_runtime_binding.runtime_receipt_sha256 !==
        runBinding.teacher_usi_runtime_receipt_sha256)
  ) {
    failure(
      `completed evidence ${inputIndex} changed its authenticated parent or runtime binding`,
    );
  }
  return verified as unknown as Readonly<Record<string, unknown>>;
}
function buildEntry(
  invocation: CapturedInvocation,
  evidence: Readonly<Record<string, unknown>>,
  sequence: number,
  previousMac: string,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const parent = invocation.training.parents[sequence];
  const payload = frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
    kind: "completed-parent",
    sequence,
    input_index: sequence,
    parent_id: parent.parent_id,
    parent,
    previous_mac: previousMac,
    completed_evidence_sha256: digestCanonical(EVIDENCE_DOMAIN, evidence),
    completed_evidence: evidence,
  });
  return frozen({ ...payload, entry_mac: hmacHex(key, ENTRY_DOMAIN, payload) });
}

function parseCanonicalLine(
  line: string,
  label: string,
): Readonly<Record<string, unknown>> {
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
    failure(`${label} exceeds the line bound`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (cause) {
    return failure(`${label} is not JSON`, cause);
  }
  if (!isPlainRecord(parsed) || canonicalJson(parsed) !== line) {
    failure(`${label} is not a canonical JSON object`);
  }
  return parsed;
}

function exactLine(
  actual: string,
  expected: Readonly<Record<string, unknown>>,
  label: string,
): void {
  const expectedLine = canonicalJson(expected);
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expectedLine, "utf8");
  if (left.byteLength !== right.byteLength || !timingSafeEqual(left, right)) {
    failure(`${label} is not the exact authenticated expected line`);
  }
}

function scanWork(
  bytes: Buffer,
  invocation: CapturedInvocation,
  key: Uint8Array,
): ScanResult {
  if (bytes.byteLength === 0) {
    return Object.freeze({
      completedParents: 0,
      previousMac: "",
      sealed: false,
      authenticatedBytes: 0,
      tornTail: false,
    });
  }
  if (bytes.byteLength > MAX_TOTAL_BYTES)
    failure("work.jsonl exceeds its byte bound");
  const completeSlices: Array<{
    readonly start: number;
    readonly end: number;
  }> = [];
  const maximumCompleteRecords = invocation.training.parents.length + 2;
  let start = 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] !== 0x0a) {
      if (index - start + 1 > MAX_LINE_BYTES) {
        failure("work.jsonl line exceeds its exact bound");
      }
      continue;
    }
    if (completeSlices.length >= maximumCompleteRecords) {
      failure("work.jsonl contains too many complete records");
    }
    if (index === start) failure("work.jsonl contains an empty line");
    completeSlices.push(Object.freeze({ start, end: index }));
    start = index + 1;
  }
  const tornTail = start < bytes.byteLength;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const lines: string[] = [];
  try {
    for (const slice of completeSlices) {
      lines.push(decoder.decode(bytes.subarray(slice.start, slice.end)));
    }
  } catch (cause) {
    return failure("work.jsonl contains invalid UTF-8", cause);
  }
  if (lines.length === 0) {
    return Object.freeze({
      completedParents: 0,
      previousMac: "",
      sealed: false,
      authenticatedBytes: 0,
      tornTail: true,
    });
  }

  const expectedHeader = buildHeader(invocation, key);
  const header = strictRecord(
    parseCanonicalLine(lines[0], "work header"),
    HEADER_KEYS,
    "work header",
  );
  const headerPayloadValue = withoutKey(header, "header_mac");
  const expectedHeaderMac = hmacHex(key, HEADER_DOMAIN, headerPayloadValue);
  if (!macEqual(header.header_mac, expectedHeaderMac)) {
    failure("work header MAC is invalid");
  }
  exactLine(lines[0], expectedHeader, "work header");
  let previousMac = expectedHeader.header_mac as string;
  let completedParents = 0;
  let sealed = false;
  let authenticatedBytes = completeSlices[0].end + 1;

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    if (sealed) failure("work.jsonl contains a complete line after its seal");
    const parsed = parseCanonicalLine(
      lines[lineIndex],
      `work line ${lineIndex}`,
    );
    if (parsed.kind === "seal") {
      if (completedParents !== invocation.training.parents.length) {
        failure("work seal appears before every parent entry");
      }
      const seal = strictRecord(parsed, SEAL_KEYS, "work seal");
      const expectedSealMac = hmacHex(
        key,
        SEAL_DOMAIN,
        withoutKey(seal, "seal_mac"),
      );
      if (!macEqual(seal.seal_mac, expectedSealMac))
        failure("work seal MAC is invalid");
      exactLine(
        lines[lineIndex],
        buildSeal(invocation, previousMac, key),
        "work seal",
      );
      sealed = true;
      authenticatedBytes = completeSlices[lineIndex].end + 1;
      continue;
    }
    if (completedParents >= invocation.training.parents.length) {
      failure("work.jsonl contains an entry beyond the training input");
    }
    const entry = strictRecord(
      parsed,
      ENTRY_KEYS,
      `work entry ${completedParents}`,
    );
    const entryPayload = withoutKey(entry, "entry_mac");
    const expectedMac = hmacHex(key, ENTRY_DOMAIN, entryPayload);
    if (!macEqual(entry.entry_mac, expectedMac)) {
      failure(`work entry ${completedParents} MAC is invalid`);
    }
    const expectedParent = invocation.training.parents[completedParents];
    if (
      entry.schema !== FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA ||
      entry.kind !== "completed-parent" ||
      entry.sequence !== completedParents ||
      entry.input_index !== completedParents ||
      entry.parent_id !== expectedParent.parent_id ||
      entry.previous_mac !== previousMac
    ) {
      failure(
        `work entry ${completedParents} chain or parent identity is invalid`,
      );
    }
    exactJson(
      entry.parent,
      expectedParent,
      `work entry ${completedParents}.parent`,
    );
    const evidence = captureCompletedEvidence(
      entry.completed_evidence as FloodgateV7CompletedParentEvidence,
      expectedParent,
      completedParents,
      invocation.runBinding,
    );
    if (
      entry.completed_evidence_sha256 !==
      digestCanonical(EVIDENCE_DOMAIN, evidence)
    ) {
      failure(
        `work entry ${completedParents} completed evidence digest is invalid`,
      );
    }
    exactLine(
      lines[lineIndex],
      buildEntry(invocation, evidence, completedParents, previousMac, key),
      `work entry ${completedParents}`,
    );
    previousMac = entry.entry_mac as string;
    completedParents += 1;
    authenticatedBytes = completeSlices[lineIndex].end + 1;
  }
  if (sealed && tornTail) {
    failure("work.jsonl contains an incomplete fragment after its valid seal");
  }
  return Object.freeze({
    completedParents,
    previousMac,
    sealed,
    authenticatedBytes,
    tornTail,
  });
}

function verifyStageStat(
  stat: fs.BigIntStats,
  invocation: CapturedInvocation,
): void {
  const expected = invocation.lease.receipt.stage_identity;
  if (
    (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_DIRECTORY ||
    (Number(stat.mode) & MODE_MASK) !== 0o700 ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    stat.dev !== expected.dev ||
    stat.ino !== expected.ino
  ) {
    failure("held stage identity, owner, type, or mode changed");
  }
}

function verifyWorkStat(
  stat: fs.BigIntStats,
  invocation: CapturedInvocation,
): void {
  if (
    (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_REGULAR ||
    (Number(stat.mode) & MODE_MASK) !== 0o600 ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    stat.size < BigInt(0) ||
    stat.size > BigInt(MAX_TOTAL_BYTES)
  ) {
    failure("work.jsonl owner, type, mode, link count, or size is invalid");
  }
}

async function verifyStagePath(invocation: CapturedInvocation): Promise<void> {
  let stat: fs.BigIntStats;
  try {
    stat = await fs.promises.lstat(invocation.lease.stageRoot, {
      bigint: true,
    });
  } catch (cause) {
    return failure("authorized stage path cannot be reinspected", cause);
  }
  verifyStageStat(stat, invocation);
}

async function readWholeFile(handle: fs.promises.FileHandle): Promise<Buffer> {
  const before = await handle.stat({ bigint: true });
  if (before.size < BigInt(0) || before.size > BigInt(MAX_TOTAL_BYTES)) {
    failure("work.jsonl size is outside its bound");
  }
  const bytes = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.read(
      bytes,
      offset,
      bytes.byteLength - offset,
      offset,
    );
    if (result.bytesRead === 0) failure("work.jsonl changed during read");
    offset += result.bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  if (
    after.dev !== before.dev ||
    after.ino !== before.ino ||
    after.size !== before.size ||
    after.mtimeNs !== before.mtimeNs ||
    after.ctimeNs !== before.ctimeNs
  ) {
    failure("work.jsonl mutated during read");
  }
  return bytes;
}

async function appendLine(
  invocation: CapturedInvocation,
  handle: fs.promises.FileHandle,
  line: string,
  label: string,
): Promise<void> {
  const bytes = Buffer.from(`${line}\n`, "utf8");
  if (bytes.byteLength > MAX_LINE_BYTES + 1)
    failure(`${label} exceeds line bound`);
  let offset = 0;
  try {
    while (offset < bytes.byteLength) {
      const remaining = bytes.byteLength - offset;
      const write = async (maximumBytes = remaining): Promise<number> => {
        if (
          !Number.isSafeInteger(maximumBytes) ||
          maximumBytes < 1 ||
          maximumBytes > remaining
        ) {
          failure(`${label} test write bound is invalid`);
        }
        const result = await handle.write(bytes, offset, maximumBytes, null);
        return result.bytesWritten;
      };
      const written =
        invocation.writeForTests === undefined
          ? await write()
          : await invocation.writeForTests(
              Object.freeze({
                label,
                bytes: new Uint8Array(bytes),
                offset,
                length: remaining,
              }),
              write,
            );
      if (
        !Number.isSafeInteger(written) ||
        written <= 0 ||
        written > remaining
      ) {
        persistenceFailure(
          `${label} append made no progress`,
          new Error("invalid write"),
        );
      }
      offset += written;
    }
    await handle.sync();
  } catch (cause) {
    if (
      cause instanceof FloodgateV7TeacherCheckpointPersistenceIndeterminateError
    ) {
      throw cause;
    }
    persistenceFailure(`${label} append or sync may have persisted`, cause);
  }
}

async function callFailpoint(
  invocation: CapturedInvocation,
  phase: FloodgateV7TeacherCheckpointFailpointPhase,
  sequence?: number,
): Promise<void> {
  if (invocation.failpoint === undefined) return;
  try {
    await invocation.failpoint(
      Object.freeze(sequence === undefined ? { phase } : { phase, sequence }),
    );
  } catch (cause) {
    persistenceFailure(
      `test failpoint ${phase} interrupted checkpointing`,
      cause,
    );
  }
}

async function closeHandle(
  invocation: CapturedInvocation,
  kind: "work" | "stage",
  handle: fs.promises.FileHandle,
): Promise<void> {
  const close = handle.close.bind(handle);
  if (invocation.closeForTests === undefined) await close();
  else await invocation.closeForTests(kind, close);
}

async function syncStageDirectory(
  handle: fs.promises.FileHandle,
  label: string,
): Promise<void> {
  try {
    await handle.sync();
  } catch (cause) {
    persistenceFailure(`${label} directory sync may have persisted`, cause);
  }
}

function pinNativePromise<T>(value: Promise<T>): Promise<T> {
  objectDefineProperty(value, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: NativePromise,
  });
  return value;
}

function rejectedNativePromise<T>(reason: unknown): Promise<T> {
  return pinNativePromise(nativePromiseReject(reason) as Promise<T>);
}

function startMissingParentProduction(
  invocation: CapturedInvocation,
  sequence: number,
): Promise<Readonly<Record<string, unknown>>> {
  const request = frozen({
    input_index: sequence,
    parent: invocation.training.parents[sequence],
  });
  let produced: unknown;
  try {
    produced = reflectApply(invocation.producer, undefined, [request]);
  } catch (cause) {
    return rejectedNativePromise(
      new FloodgateV7TeacherCheckpointError(
        `produceMissingParent threw synchronously for input ${sequence}`,
        { cause },
      ),
    );
  }
  if (
    !nodeIsPromise(produced) ||
    nodeIsProxy(produced) ||
    objectGetPrototypeOf(produced) !== nativePromisePrototype ||
    reflectOwnKeys(produced).length !== 0
  ) {
    return rejectedNativePromise(
      new FloodgateV7TeacherCheckpointError(
        `produceMissingParent must return an exact native Promise for input ${sequence}`,
      ),
    );
  }
  return pinNativePromise(
    new NativePromise((resolve, reject) => {
      try {
        reflectApply(nativePromiseThen, produced, [
          (raw: unknown) => {
            try {
              let completed: Readonly<FloodgateV7CompletedParentEvidence>;
              try {
                completed = buildFloodgateV7CompletedParentCoreForTests(
                  raw as FloodgateV7CompletedParentInput,
                );
              } catch (cause) {
                return failure(
                  `completed-parent core rejected produced input ${sequence}`,
                  cause,
                );
              }
              resolve(
                captureCompletedEvidence(
                  completed,
                  invocation.training.parents[sequence],
                  sequence,
                  invocation.runBinding,
                ),
              );
            } catch (cause) {
              reject(cause);
            }
          },
          (cause: unknown) => reject(cause),
        ]);
      } catch (cause) {
        reject(cause);
      }
    }),
  );
}

async function appendMissingParentsInOrder(
  invocation: CapturedInvocation,
  workHandle: fs.promises.FileHandle,
  key: Uint8Array,
  startSequence: number,
  initialPreviousMac: string,
): Promise<string> {
  const total = invocation.training.parents.length;
  const active = new Map<number, Promise<Readonly<Record<string, unknown>>>>();
  let nextToSchedule = startSequence;
  let previousMac = initialPreviousMac;
  let observedFailure:
    | Readonly<{ sequence: number; cause: unknown }>
    | undefined;

  const observeFailure = async (
    task: Promise<Readonly<Record<string, unknown>>>,
    sequence: number,
  ): Promise<void> => {
    try {
      await task;
    } catch (cause) {
      if (observedFailure === undefined) {
        observedFailure = { sequence, cause };
      }
    }
  };

  const schedule = (): void => {
    while (
      observedFailure === undefined &&
      active.size < FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT &&
      nextToSchedule < total
    ) {
      const sequence = nextToSchedule;
      nextToSchedule += 1;
      const task = startMissingParentProduction(invocation, sequence);
      active.set(sequence, task);
      void observeFailure(task, sequence);
    }
  };

  const settleActive = async (): Promise<void> => {
    await nativePromiseAllSettled([...active.values()]);
  };

  schedule();
  try {
    for (let sequence = startSequence; sequence < total; sequence += 1) {
      const task = active.get(sequence);
      if (task === undefined) {
        const failureValue = observedFailure;
        if (failureValue !== undefined) throw failureValue.cause;
        failure(`missing-parent scheduler omitted input ${sequence}`);
      }
      let evidence: Readonly<Record<string, unknown>>;
      try {
        evidence = await task;
      } catch (cause) {
        throw cause;
      } finally {
        active.delete(sequence);
      }
      await callFailpoint(
        invocation,
        "after-parent-produced-before-entry",
        sequence,
      );
      const entry = buildEntry(
        invocation,
        evidence,
        sequence,
        previousMac,
        key,
      );
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(entry),
        `checkpoint entry ${sequence}`,
      );
      previousMac = entry.entry_mac as string;
      await callFailpoint(invocation, "after-entry-durable", sequence);
      schedule();
    }
  } catch (cause) {
    await settleActive();
    throw cause;
  }
  await settleActive();
  return previousMac;
}

async function executeCheckpoint(
  invocation: CapturedInvocation,
): Promise<Readonly<FloodgateV7TeacherCheckpointReceipt>> {
  let stageHandle: fs.promises.FileHandle | undefined;
  let workHandle: fs.promises.FileHandle | undefined;
  let primaryFailure: unknown;
  const salt = Buffer.from(invocation.runId, "hex");
  let derived = Buffer.alloc(0);
  try {
    derived = Buffer.from(
      hkdfSync("sha256", invocation.rootKey, salt, Buffer.from(KEY_INFO), 32),
    );
    try {
      stageHandle = await fs.promises.open(
        invocation.lease.stageRoot,
        fs.constants.O_RDONLY |
          fs.constants.O_DIRECTORY |
          fs.constants.O_NOFOLLOW,
      );
    } catch (cause) {
      return failure(
        "authorized stage cannot be held without following links",
        cause,
      );
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(invocation.lease.stageRoot);
    } catch (cause) {
      return failure("held stage entries cannot be listed", cause);
    }
    if (
      entries.length > 1 ||
      (entries.length === 1 &&
        entries[0] !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME)
    ) {
      failure("v7 teacher stage must contain only work.jsonl");
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);

    const workPath = `${invocation.lease.stageRoot}/${FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME}`;
    const fresh = entries.length === 0;
    if (fresh) invocation.persistenceState.mayHaveStarted = true;
    try {
      workHandle = await fs.promises.open(
        workPath,
        (fresh ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0) |
          fs.constants.O_RDWR |
          fs.constants.O_APPEND |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
    } catch (cause) {
      return failure(
        "work.jsonl cannot be opened with exclusive no-follow policy",
        cause,
      );
    }
    if (fresh) {
      try {
        await workHandle.chmod(0o600);
      } catch (cause) {
        persistenceFailure(
          "fresh work.jsonl exact-mode establishment may have persisted",
          cause,
        );
      }
    }
    let workStat = await workHandle.stat({ bigint: true });
    verifyWorkStat(workStat, invocation);
    const workIdentity = Object.freeze({
      dev: workStat.dev,
      ino: workStat.ino,
    });

    let prefix: ScanResult;
    let resumedParents = 0;
    if (fresh) {
      prefix = Object.freeze({
        completedParents: 0,
        previousMac: "",
        sealed: false,
        authenticatedBytes: 0,
        tornTail: false,
      });
    } else {
      const existing = await readWholeFile(workHandle);
      prefix = scanWork(existing, invocation, derived);
      resumedParents = prefix.completedParents;
      if (prefix.tornTail) {
        invocation.persistenceState.mayHaveStarted = true;
        try {
          await workHandle.truncate(prefix.authenticatedBytes);
        } catch (cause) {
          persistenceFailure("torn-tail truncation may have persisted", cause);
        }
      }
      try {
        await workHandle.sync();
      } catch (cause) {
        persistenceFailure(
          "existing authenticated work sync may have persisted",
          cause,
        );
      }
      await syncStageDirectory(
        stageHandle,
        "stage before existing-prefix resume",
      );
    }

    let previousMac = prefix.previousMac;
    if (prefix.authenticatedBytes === 0) {
      const header = buildHeader(invocation, derived);
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(header),
        "checkpoint header",
      );
      previousMac = header.header_mac as string;
      await syncStageDirectory(stageHandle, "stage after checkpoint header");
      await callFailpoint(invocation, "after-header-durable");
    }

    if (!prefix.sealed) {
      previousMac = await appendMissingParentsInOrder(
        invocation,
        workHandle,
        derived,
        prefix.completedParents,
        previousMac,
      );
      const seal = buildSeal(invocation, previousMac, derived);
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(seal),
        "checkpoint seal",
      );
      await syncStageDirectory(stageHandle, "stage after checkpoint seal");
      await callFailpoint(invocation, "after-seal-durable");
    }

    await callFailpoint(invocation, "before-final-reopen");
    await verifyStagePath(invocation);
    try {
      await closeHandle(invocation, "work", workHandle);
    } catch (cause) {
      let cleanupCause: unknown;
      try {
        await workHandle.close();
      } catch (cleanupFailure) {
        cleanupCause = cleanupFailure;
      }
      workHandle = undefined;
      persistenceFailure(
        "work.jsonl close before final reopen may have persisted",
        { cause, cleanupCause },
      );
    }
    workHandle = undefined;
    try {
      workHandle = await fs.promises.open(
        workPath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
    } catch (cause) {
      return failure(
        "work.jsonl cannot be reopened without following links",
        cause,
      );
    }
    await verifyStagePath(invocation);
    workStat = await workHandle.stat({ bigint: true });
    verifyWorkStat(workStat, invocation);
    if (
      workStat.dev !== workIdentity.dev ||
      workStat.ino !== workIdentity.ino
    ) {
      failure("work.jsonl identity changed before final verification");
    }
    const finalBytes = await readWholeFile(workHandle);
    const finalPrefix = scanWork(finalBytes, invocation, derived);
    if (
      finalPrefix.tornTail ||
      !finalPrefix.sealed ||
      finalPrefix.completedParents !== invocation.training.parents.length ||
      finalPrefix.authenticatedBytes !== finalBytes.byteLength
    ) {
      failure("final work.jsonl is not the exact authenticated sealed stream");
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    const finalEntries = await fs.promises.readdir(invocation.lease.stageRoot);
    if (
      finalEntries.length !== 1 ||
      finalEntries[0] !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME
    ) {
      failure("stage entry set changed before success");
    }
    await verifyStagePath(invocation);
    return Object.freeze({
      contract: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
      claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
      algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
      run_id: invocation.runId,
      key_id: invocation.keyId,
      stage: Object.freeze({
        basename: invocation.lease.receipt.stage_basename,
        parent_dev: invocation.lease.receipt.parent_identity.dev.toString(10),
        parent_ino: invocation.lease.receipt.parent_identity.ino.toString(10),
        dev: invocation.lease.receipt.stage_identity.dev.toString(10),
        ino: invocation.lease.receipt.stage_identity.ino.toString(10),
      }),
      work: Object.freeze({
        filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        format: FORMAT,
        records: invocation.training.parents.length,
        bytes: finalBytes.byteLength,
        sha256: sha256Hex(finalBytes),
        completed_parents: invocation.training.parents.length,
        resumed_parents: resumedParents,
        durability: DURABILITY,
      }),
    });
  } catch (cause) {
    const classified =
      invocation.persistenceState.mayHaveStarted &&
      !(
        cause instanceof
        FloodgateV7TeacherCheckpointPersistenceIndeterminateError
      )
        ? new FloodgateV7TeacherCheckpointPersistenceIndeterminateError(
            "failure occurred after checkpoint persistence may have started",
            { cause },
          )
        : cause;
    primaryFailure = classified;
    throw classified;
  } finally {
    zeroBytes(derived);
    zeroBytes(salt);
    zeroBytes(invocation.rootKey);
    const closeFailures: Array<{
      readonly kind: "work" | "stage";
      readonly cause: unknown;
    }> = [];
    if (workHandle !== undefined) {
      try {
        await closeHandle(invocation, "work", workHandle);
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await workHandle.close();
        } catch (cleanupFailure) {
          cleanupCause = cleanupFailure;
        }
        closeFailures.push({ kind: "work", cause: { cause, cleanupCause } });
      }
    }
    if (stageHandle !== undefined) {
      try {
        await closeHandle(invocation, "stage", stageHandle);
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await stageHandle.close();
        } catch (cleanupFailure) {
          cleanupCause = cleanupFailure;
        }
        closeFailures.push({ kind: "stage", cause: { cause, cleanupCause } });
      }
    }
    if (closeFailures.length > 0) {
      if (
        invocation.persistenceState.mayHaveStarted ||
        closeFailures.some((entry) => entry.kind === "work")
      ) {
        persistenceFailure(
          "filesystem handle close failed after work.jsonl may have persisted",
          { primaryFailure, closeFailures },
        );
      }
      failure("held stage directory handle could not be closed", {
        primaryFailure,
        closeFailures,
      });
    }
  }
}

async function executeAndClose(
  invocation: CapturedInvocation,
): Promise<Readonly<FloodgateV7TeacherCheckpointReceipt>> {
  let result: Readonly<FloodgateV7TeacherCheckpointReceipt> | undefined;
  let primary: unknown;
  try {
    result = await executeCheckpoint(invocation);
  } catch (cause) {
    primary = cause;
  }
  try {
    await invocation.lease.close();
  } catch (closeCause) {
    if (
      invocation.persistenceState.mayHaveStarted ||
      primary instanceof
        FloodgateV7TeacherCheckpointPersistenceIndeterminateError
    ) {
      persistenceFailure(
        "checkpoint persistence or authorized stage lease close is indeterminate",
        { primary, closeCause },
      );
    }
    if (primary === undefined) {
      failure("authorized stage lease could not be closed", closeCause);
    }
    failure("checkpoint failed and authorized stage lease close also failed", {
      primary,
      closeCause,
    });
  }
  if (primary !== undefined) throw primary;
  if (result === undefined) failure("checkpoint produced no result");
  return result;
}

async function closeAfterCaptureFailure(
  lease: Readonly<FloodgateTeacherStageLease>,
  primary: unknown,
): Promise<never> {
  try {
    await lease.close();
  } catch (closeCause) {
    failure(
      "argument capture failed and authorized stage lease close also failed",
      { primary, closeCause },
    );
  }
  throw primary;
}

/**
 * Claim authenticated training rows and a private authorized test stage, then
 * resume or create the HMAC-chained compact v7 completed-parent checkpoint.
 */
export function checkpointFloodgateV7TeacherParentsCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  authenticatedTrainingRows: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  produceMissingParent: FloodgateV7TeacherMissingParentProducer,
  options: FloodgateV7TeacherCheckpointOptions,
  dependencies: FloodgateV7TeacherCheckpointDependencies,
): Promise<Readonly<FloodgateV7TeacherCheckpointReceipt>> {
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests(lease);
  let invocation: CapturedInvocation;
  try {
    claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      authenticatedTrainingRows,
    );
    invocation = captureInvocation(
      lease,
      authenticatedTrainingRows,
      runBinding,
      produceMissingParent,
      options,
      dependencies,
    );
  } catch (cause) {
    return closeAfterCaptureFailure(lease, cause);
  }
  return executeAndClose(invocation);
}
