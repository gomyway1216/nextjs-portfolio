/**
 * Test-only authenticated, durable checkpointing for stable-WASM proposals.
 *
 * This is deliberately not a production runner or a publication boundary. It
 * accepts an already-complete in-memory proposer artifact and persists only a
 * private, resumable `work.jsonl` chain in an exactly authorized stage. The
 * namespace contract inherits the authorizer's trusted-current-EUID boundary:
 * descriptor/path identity rechecks detect accidental replacement, but Node's
 * path APIs are not an `openat` sandbox against a malicious same-EUID writer.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import { types as nodeUtilTypes } from "node:util";

import {
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  type FloodgateTeacherStageLease,
} from "./floodgate-teacher-stage-authorization";
import {
  FLOODGATE_STABLE_MAX_ROWS,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_PROPOSER_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_PROPOSER_RECEIPT_SCHEMA,
  FLOODGATE_STABLE_WASM_PROPOSER_STATUS,
  type FloodgateStableWasmProposalArtifact,
} from "./floodgate-stable-wasm-proposer";

export const FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA =
  "shogi-floodgate-stable-proposal-work-v1" as const;
export const FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM =
  "hmac-sha256-hkdf-sha256-v1" as const;
export const FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_PREFIX_STATUS =
  "authenticated-durable-private-checkpoint-prefix-not-complete-not-postflight-not-published" as const;
export const FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS =
  "complete-authenticated-private-proposal-checkpoint-not-consumer-postflight-not-published" as const;
export const FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_CLAIM_BOUNDARY =
  "key-holder-authenticated-checkpoint-integrity-only-not-engine-authentication-teacher-label-or-playing-strength-evidence" as const;
export const FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME =
  "work.jsonl" as const;

const HEADER_DOMAIN = "shogi-floodgate-stable-proposal-work-header-v1\0";
const ENTRY_DOMAIN = "shogi-floodgate-stable-proposal-work-entry-v1\0";
const SEAL_DOMAIN = "shogi-floodgate-stable-proposal-work-seal-v1\0";
const HKDF_INFO = "shogi-floodgate-stable-proposal-checkpoint-key-v1\0";
const FORMAT = "canonical-jsonl-utf8-single-final-lf-v1" as const;
const DURABILITY =
  "append-line-file-sync-header-and-seal-directory-sync-final-reopen-v1" as const;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_LINE_BYTES = 64 * 1024;
const MODE_MASK = 0o7777;
const MODE_TYPE_MASK = fs.constants.S_IFMT;
const MODE_DIRECTORY = fs.constants.S_IFDIR;
const MODE_REGULAR = fs.constants.S_IFREG;
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const HEADER_KEYS = Object.freeze([
  "algorithm",
  "claim_boundary",
  "header_mac",
  "input",
  "key_id",
  "kind",
  "producer",
  "run_id",
  "schema",
  "stage_binding",
  "status",
] as const);
const ENTRY_KEYS = Object.freeze([
  "entry_mac",
  "kind",
  "parent_id",
  "previous_mac",
  "proposal",
  "schema",
  "sequence",
] as const);
const SEAL_KEYS = Object.freeze([
  "entries",
  "final_entry_mac",
  "kind",
  "proposal_output",
  "schema",
  "seal_mac",
  "status",
] as const);
const RECEIPT_KEYS = Object.freeze([
  "claim_boundary",
  "execution_boundary",
  "input",
  "operational",
  "output",
  "preregistered_plan",
  "required_search_contract",
  "schema",
  "semantic_run_fingerprint_sha256",
  "status",
  "supplied_engine_assets",
] as const);
const RECEIPT_INPUT_KEYS = Object.freeze([
  "authenticated_training_binding",
  "input_rows_sha256",
  "records",
] as const);
const RECEIPT_OUTPUT_KEYS = Object.freeze([
  "bytes",
  "child_position_ids_sha256",
  "format",
  "parent_ids_sha256",
  "records",
  "sha256",
] as const);
const ROW_KEYS = Object.freeze([
  "child_position_id",
  "child_sfen",
  "game_id",
  "parent_id",
  "parent_payload_sha256",
  "position_id",
  "schema",
  "search",
  "stable_move",
] as const);
const SEARCH_KEYS = Object.freeze([
  "completed_depth",
  "leaves",
  "nodes",
  "raw_search_score",
  "requested_depth",
  "root_tesu",
  "score_encoding",
  "termination",
] as const);

export interface FloodgateStableProposalCheckpointOptions {
  readonly runId: string;
  readonly keyId: string;
}

export type FloodgateStableProposalCheckpointFailpointPhase =
  | "after-header-durable"
  | "after-entry-durable"
  | "after-seal-durable"
  | "before-final-reopen";

export interface FloodgateStableProposalCheckpointFailpointEvent {
  readonly phase: FloodgateStableProposalCheckpointFailpointPhase;
  readonly sequence?: number;
}

export interface FloodgateStableProposalCheckpointDependencies {
  readonly rootKey: Uint8Array;
  readonly effectiveUserId: number;
  readonly failpointForTests?: (
    event: Readonly<FloodgateStableProposalCheckpointFailpointEvent>,
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

export interface FloodgateStableProposalCheckpointReceipt {
  readonly contract: typeof FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA;
  readonly status: typeof FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_CLAIM_BOUNDARY;
  readonly algorithm: typeof FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM;
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
    readonly filename: typeof FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME;
    readonly format: typeof FORMAT;
    readonly records: number;
    readonly bytes: number;
    readonly sha256: string;
    readonly completed_entries: number;
    readonly resumed_entries: number;
    readonly durability: typeof DURABILITY;
  }>;
}

export class FloodgateStableProposalCheckpointError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Floodgate stable proposal checkpoint failed: ${message}`, options);
    this.name = "FloodgateStableProposalCheckpointError";
  }
}

export class FloodgateStableProposalCheckpointPersistenceIndeterminateError extends FloodgateStableProposalCheckpointError {
  readonly mayHavePersisted = true as const;

  constructor(message: string, options?: ErrorOptions) {
    super(`persistence is indeterminate: ${message}`, options);
    this.name =
      "FloodgateStableProposalCheckpointPersistenceIndeterminateError";
  }
}

interface CapturedArtifact {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptInput: Readonly<Record<string, unknown>>;
  readonly receiptOutput: Readonly<Record<string, unknown>>;
  readonly receiptSha256: string;
  readonly semanticRunFingerprint: string;
}

interface CapturedInvocation {
  readonly lease: Readonly<FloodgateTeacherStageLease>;
  readonly runId: string;
  readonly keyId: string;
  readonly rootKey: Buffer;
  readonly effectiveUserId: number;
  readonly failpoint?: FloodgateStableProposalCheckpointDependencies["failpointForTests"];
  readonly writeForTests?: FloodgateStableProposalCheckpointDependencies["writeForTests"];
  readonly closeForTests?: FloodgateStableProposalCheckpointDependencies["closeForTests"];
  readonly artifact: CapturedArtifact;
  readonly persistenceState: { mayHaveStarted: boolean };
}

interface IntendedWork {
  readonly lines: readonly string[];
  readonly macs: readonly string[];
  readonly bytes: Buffer;
}

function failure(message: string, cause?: unknown): never {
  throw new FloodgateStableProposalCheckpointError(
    message,
    cause === undefined ? undefined : { cause },
  );
}

function persistenceFailure(message: string, cause: unknown): never {
  throw new FloodgateStableProposalCheckpointPersistenceIndeterminateError(
    message,
    { cause },
  );
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
  const prototype = Object.getPrototypeOf(value);
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
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    failure(`${label} must not have symbol keys`);
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

function strictDenseArray(value: unknown, label: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    failure(`${label} must be an ordinary non-Proxy array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = value.length;
  if (Reflect.ownKeys(descriptors).length !== length + 1) {
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
    return `[${strictDenseArray(value, "canonical JSON array")
      .map((entry) => canonicalJson(entry))
      .join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
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
      failure("captured JSON rejects nonfinite numbers and negative zero");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      strictDenseArray(value, "captured JSON array").map((entry) =>
        deepCaptureJson(entry),
      ),
    );
  }
  if (isPlainRecord(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
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
      captured[key] = deepCaptureJson(descriptor.value);
    }
    return Object.freeze(captured);
  }
  return failure(`captured JSON rejects ${typeof value}`);
}

function canonicalParsedJson(
  line: string,
  label: string,
): Record<string, unknown> {
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

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function identifierDigest(values: readonly string[]): string {
  return sha256Hex([...new Set(values)].sort(compareUtf8).join("\n"));
}

function safeString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_LINE_BYTES ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    failure(`${label} is not a bounded control-free string`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    failure(`${label} is not a safe integer at least ${minimum}`);
  }
  return value as number;
}

function sha256String(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    failure(`${label} is not a lowercase SHA-256 digest`);
  }
  return value;
}

function semanticId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SEMANTIC_ID_RE.test(value)) {
    failure(`${label} is not a canonical semantic identifier`);
  }
  return value;
}

function captureArtifact(
  value: FloodgateStableWasmProposalArtifact,
): CapturedArtifact {
  const artifact = strictRecord(
    value,
    ["jsonl", "receipt", "receipt_json", "rows"],
    "proposal artifact",
  );
  const rowsValue = strictDenseArray(artifact.rows, "proposal artifact.rows");
  if (rowsValue.length === 0 || rowsValue.length > FLOODGATE_STABLE_MAX_ROWS) {
    failure("proposal artifact row count is outside the proposer safety bound");
  }
  const rows: Readonly<Record<string, unknown>>[] = [];
  const parentIds: string[] = [];
  const childIds: string[] = [];
  const seenParents = new Set<string>();
  for (let index = 0; index < rowsValue.length; index += 1) {
    const row = strictRecord(
      deepCaptureJson(rowsValue[index]),
      ROW_KEYS,
      `proposal row ${index}`,
    );
    if (row.schema !== FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA) {
      failure(`proposal row ${index} schema is unsupported`);
    }
    const parentId = semanticId(
      row.parent_id,
      `proposal row ${index}.parent_id`,
    );
    const childId = semanticId(
      row.child_position_id,
      `proposal row ${index}.child_position_id`,
    );
    semanticId(row.position_id, `proposal row ${index}.position_id`);
    sha256String(
      row.parent_payload_sha256,
      `proposal row ${index}.parent_payload_sha256`,
    );
    safeString(row.game_id, `proposal row ${index}.game_id`);
    safeString(row.stable_move, `proposal row ${index}.stable_move`);
    safeString(row.child_sfen, `proposal row ${index}.child_sfen`);
    if (seenParents.has(parentId)) failure("proposal rows duplicate parent_id");
    seenParents.add(parentId);
    parentIds.push(parentId);
    childIds.push(childId);
    const search = strictRecord(
      row.search,
      SEARCH_KEYS,
      `proposal row ${index}.search`,
    );
    safeInteger(
      search.requested_depth,
      `proposal row ${index}.requested_depth`,
      1,
    );
    safeInteger(
      search.completed_depth,
      `proposal row ${index}.completed_depth`,
      1,
    );
    safeInteger(search.nodes, `proposal row ${index}.nodes`);
    safeInteger(search.leaves, `proposal row ${index}.leaves`);
    safeInteger(search.root_tesu, `proposal row ${index}.root_tesu`);
    if (!Number.isSafeInteger(search.raw_search_score)) {
      failure(`proposal row ${index}.raw_search_score is invalid`);
    }
    safeString(search.score_encoding, `proposal row ${index}.score_encoding`);
    safeString(search.termination, `proposal row ${index}.termination`);
    rows.push(Object.freeze(row));
  }
  const expectedJsonl = `${rows.map((row) => canonicalJson(row)).join("\n")}\n`;
  if (typeof artifact.jsonl !== "string" || artifact.jsonl !== expectedJsonl) {
    failure("proposal artifact.jsonl is not the exact canonical row stream");
  }
  if (Buffer.byteLength(expectedJsonl, "utf8") > MAX_TOTAL_BYTES) {
    failure("proposal artifact exceeds the checkpoint bound");
  }

  const receipt = strictRecord(
    deepCaptureJson(artifact.receipt),
    RECEIPT_KEYS,
    "proposal receipt",
  );
  if (
    receipt.schema !== FLOODGATE_STABLE_WASM_PROPOSER_RECEIPT_SCHEMA ||
    receipt.status !== FLOODGATE_STABLE_WASM_PROPOSER_STATUS ||
    receipt.claim_boundary !== FLOODGATE_STABLE_WASM_PROPOSER_CLAIM_BOUNDARY
  ) {
    failure("proposal receipt boundary is unsupported");
  }
  const receiptCanonical = canonicalJson(receipt);
  if (
    typeof artifact.receipt_json !== "string" ||
    artifact.receipt_json !== `${receiptCanonical}\n`
  ) {
    failure("proposal receipt_json is not exact canonical JSON with one LF");
  }
  const receiptInput = strictRecord(
    receipt.input,
    RECEIPT_INPUT_KEYS,
    "proposal receipt.input",
  );
  const records = safeInteger(receiptInput.records, "proposal input.records");
  if (records !== rows.length) failure("proposal input record count mismatch");
  sha256String(receiptInput.input_rows_sha256, "proposal input rows digest");
  canonicalJson(receiptInput.authenticated_training_binding);
  const receiptOutput = strictRecord(
    receipt.output,
    RECEIPT_OUTPUT_KEYS,
    "proposal receipt.output",
  );
  if (
    receiptOutput.format !== FORMAT ||
    safeInteger(receiptOutput.records, "proposal output.records") !==
      rows.length ||
    safeInteger(receiptOutput.bytes, "proposal output.bytes") !==
      Buffer.byteLength(expectedJsonl, "utf8") ||
    sha256String(receiptOutput.sha256, "proposal output.sha256") !==
      sha256Hex(expectedJsonl) ||
    sha256String(
      receiptOutput.parent_ids_sha256,
      "proposal output.parent_ids_sha256",
    ) !== identifierDigest(parentIds) ||
    sha256String(
      receiptOutput.child_position_ids_sha256,
      "proposal output.child_position_ids_sha256",
    ) !== identifierDigest(childIds)
  ) {
    failure("proposal output identity does not match rows");
  }
  const semanticRunFingerprint = sha256String(
    receipt.semantic_run_fingerprint_sha256,
    "proposal semantic run fingerprint",
  );
  const fingerprintPayload = Object.freeze({
    authenticated_training_binding: receiptInput.authenticated_training_binding,
    input_rows_sha256: receiptInput.input_rows_sha256,
    plan: receipt.preregistered_plan,
    supplied_engine_assets: receipt.supplied_engine_assets,
    required_search_contract: receipt.required_search_contract,
  });
  const recomputedFingerprint = sha256Hex(
    `shogi-floodgate-stable-proposer-run-v1\0${canonicalJson(fingerprintPayload)}`,
  );
  if (semanticRunFingerprint !== recomputedFingerprint) {
    failure("proposal semantic run fingerprint does not rederive");
  }
  canonicalJson(receipt.operational);
  safeString(receipt.execution_boundary, "proposal execution boundary");
  return Object.freeze({
    rows: Object.freeze(rows),
    receipt: Object.freeze(receipt),
    receiptInput: Object.freeze(receiptInput),
    receiptOutput: Object.freeze(receiptOutput),
    receiptSha256: sha256Hex(`${receiptCanonical}\n`),
    semanticRunFingerprint,
  });
}

function captureInvocation(
  lease: Readonly<FloodgateTeacherStageLease>,
  artifact: FloodgateStableWasmProposalArtifact,
  optionsValue: FloodgateStableProposalCheckpointOptions,
  dependenciesValue: FloodgateStableProposalCheckpointDependencies,
): CapturedInvocation {
  const options = strictRecord(optionsValue, ["keyId", "runId"], "options");
  if (!isPlainRecord(dependenciesValue)) {
    failure("dependencies must be a plain non-Proxy object");
  }
  const dependencies = strictRecord(
    dependenciesValue,
    [
      "closeForTests",
      "effectiveUserId",
      "failpointForTests",
      "rootKey",
      "writeForTests",
    ].filter((key) =>
      key === "failpointForTests" ||
      key === "writeForTests" ||
      key === "closeForTests"
        ? Object.prototype.hasOwnProperty.call(dependenciesValue, key)
        : true,
    ),
    "dependencies",
  );
  if (typeof options.runId !== "string" || !RUN_ID_RE.test(options.runId)) {
    failure("options.runId must be 32 bytes of lowercase hex");
  }
  if (typeof options.keyId !== "string" || !KEY_ID_RE.test(options.keyId)) {
    failure("options.keyId is invalid");
  }
  const effectiveUserId = safeInteger(
    dependencies.effectiveUserId,
    "dependencies.effectiveUserId",
  );
  const rootKeyValue = dependencies.rootKey;
  if (
    !nodeUtilTypes.isUint8Array(rootKeyValue) ||
    nodeUtilTypes.isProxy(rootKeyValue) ||
    nodeUtilTypes.isSharedArrayBuffer(rootKeyValue.buffer) ||
    rootKeyValue.byteLength !== 32
  ) {
    failure("dependencies.rootKey must be a non-shared 32-byte Uint8Array");
  }
  const rootKey = Buffer.alloc(32);
  rootKey.set(rootKeyValue);
  const failpoint = dependencies.failpointForTests as
    | FloodgateStableProposalCheckpointDependencies["failpointForTests"]
    | undefined;
  if (failpoint !== undefined && typeof failpoint !== "function") {
    rootKey.fill(0);
    failure("dependencies.failpointForTests must be a function");
  }
  const writeForTests = dependencies.writeForTests as
    FloodgateStableProposalCheckpointDependencies["writeForTests"] | undefined;
  const closeForTests = dependencies.closeForTests as
    FloodgateStableProposalCheckpointDependencies["closeForTests"] | undefined;
  if (writeForTests !== undefined && typeof writeForTests !== "function") {
    rootKey.fill(0);
    failure("dependencies.writeForTests must be a function");
  }
  if (closeForTests !== undefined && typeof closeForTests !== "function") {
    rootKey.fill(0);
    failure("dependencies.closeForTests must be a function");
  }
  try {
    return Object.freeze({
      lease,
      runId: options.runId,
      keyId: options.keyId,
      rootKey,
      effectiveUserId,
      failpoint,
      writeForTests,
      closeForTests,
      artifact: captureArtifact(artifact),
      persistenceState: { mayHaveStarted: false },
    });
  } catch (cause) {
    rootKey.fill(0);
    throw cause;
  }
}

function withoutKey(
  record: Readonly<Record<string, unknown>>,
  removedKey: string,
): Readonly<Record<string, unknown>> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== removedKey) output[key] = record[key];
  }
  return Object.freeze(output);
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

function constantTimeMacEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string" || !SHA256_RE.test(actual)) return false;
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  return left.byteLength === 32 && timingSafeEqual(left, right);
}

function buildIntendedWork(
  invocation: CapturedInvocation,
  key: Uint8Array,
): IntendedWork {
  const { receipt, receiptInput, receiptOutput } = invocation.artifact;
  const stageReceipt = invocation.lease.receipt;
  const headerPayload = Object.freeze({
    schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
    kind: "header",
    run_id: invocation.runId,
    key_id: invocation.keyId,
    algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
    status: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_PREFIX_STATUS,
    claim_boundary: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_CLAIM_BOUNDARY,
    stage_binding: Object.freeze({
      authorization_contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      authorization_trust_boundary:
        FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      stage_basename: stageReceipt.stage_basename,
      parent_dev: stageReceipt.parent_identity.dev.toString(10),
      parent_ino: stageReceipt.parent_identity.ino.toString(10),
      stage_dev: stageReceipt.stage_identity.dev.toString(10),
      stage_ino: stageReceipt.stage_identity.ino.toString(10),
    }),
    input: receiptInput,
    producer: Object.freeze({
      proposal_schema: receipt.schema,
      proposal_status: receipt.status,
      proposal_claim_boundary: receipt.claim_boundary,
      semantic_run_fingerprint_sha256:
        invocation.artifact.semanticRunFingerprint,
      preregistered_plan: receipt.preregistered_plan,
      supplied_engine_assets: receipt.supplied_engine_assets,
      required_search_contract: receipt.required_search_contract,
      execution_boundary: receipt.execution_boundary,
      operational: receipt.operational,
      proposal_receipt_sha256: invocation.artifact.receiptSha256,
    }),
  });
  const headerMac = hmacHex(key, HEADER_DOMAIN, headerPayload);
  const header = Object.freeze({ ...headerPayload, header_mac: headerMac });
  const lines: string[] = [canonicalJson(header)];
  const macs: string[] = [headerMac];
  let previousMac = headerMac;
  for (let index = 0; index < invocation.artifact.rows.length; index += 1) {
    const proposal = invocation.artifact.rows[index];
    const entryPayload = Object.freeze({
      schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
      kind: "proposal",
      sequence: index,
      parent_id: proposal.parent_id,
      previous_mac: previousMac,
      proposal,
    });
    const entryMac = hmacHex(key, ENTRY_DOMAIN, entryPayload);
    lines.push(
      canonicalJson(Object.freeze({ ...entryPayload, entry_mac: entryMac })),
    );
    macs.push(entryMac);
    previousMac = entryMac;
  }
  const sealPayload = Object.freeze({
    schema: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
    kind: "seal",
    entries: invocation.artifact.rows.length,
    final_entry_mac: previousMac,
    proposal_output: receiptOutput,
    status: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
  });
  const sealMac = hmacHex(key, SEAL_DOMAIN, sealPayload);
  lines.push(
    canonicalJson(Object.freeze({ ...sealPayload, seal_mac: sealMac })),
  );
  macs.push(sealMac);
  const bytes = Buffer.from(`${lines.join("\n")}\n`, "utf8");
  if (
    bytes.byteLength > MAX_TOTAL_BYTES ||
    lines.some((line) => Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES)
  ) {
    failure("authenticated work stream exceeds safety bounds");
  }
  return Object.freeze({
    lines: Object.freeze(lines),
    macs: Object.freeze(macs),
    bytes,
  });
}

function verifyAuthenticatedLine(
  line: string,
  expectedLine: string,
  expectedMac: string,
  index: number,
  key: Uint8Array,
): void {
  const parsed = canonicalParsedJson(line, `work line ${index}`);
  const isHeader = index === 0;
  const isSeal = index > 0 && parsed.kind === "seal";
  const macKey = isHeader ? "header_mac" : isSeal ? "seal_mac" : "entry_mac";
  strictRecord(
    parsed,
    isHeader ? HEADER_KEYS : isSeal ? SEAL_KEYS : ENTRY_KEYS,
    `work line ${index}`,
  );
  const domain = isHeader ? HEADER_DOMAIN : isSeal ? SEAL_DOMAIN : ENTRY_DOMAIN;
  const recomputed = hmacHex(key, domain, withoutKey(parsed, macKey));
  if (
    !constantTimeMacEqual(parsed[macKey], recomputed) ||
    !constantTimeMacEqual(parsed[macKey], expectedMac) ||
    line !== expectedLine
  ) {
    failure(`work line ${index} authentication or semantic binding failed`);
  }
}

interface ExistingPrefix {
  readonly completeLines: number;
  readonly authenticatedBytes: number;
  readonly tornTail: boolean;
}

function scanExistingWork(
  bytes: Buffer,
  intended: IntendedWork,
  key: Buffer,
): ExistingPrefix {
  if (bytes.byteLength === 0) {
    return Object.freeze({
      completeLines: 0,
      authenticatedBytes: 0,
      tornTail: false,
    });
  }
  if (bytes.byteLength > MAX_TOTAL_BYTES)
    failure("existing work.jsonl is oversized");
  const lineBuffers: Buffer[] = [];
  let start = 0;
  for (let offset = 0; offset < bytes.byteLength; offset += 1) {
    const byte = bytes[offset];
    if (byte === 0 || byte === 13)
      failure("work.jsonl contains forbidden framing bytes");
    if (byte === 10) {
      const line = bytes.subarray(start, offset);
      if (line.byteLength === 0 || line.byteLength > MAX_LINE_BYTES) {
        failure("work.jsonl contains an empty or oversized line");
      }
      lineBuffers.push(line);
      start = offset + 1;
    }
  }
  if (lineBuffers.length > intended.lines.length) {
    failure("work.jsonl has data after the authenticated seal");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  for (let index = 0; index < lineBuffers.length; index += 1) {
    if (
      lineBuffers[index].byteLength >= 3 &&
      lineBuffers[index][0] === 0xef &&
      lineBuffers[index][1] === 0xbb &&
      lineBuffers[index][2] === 0xbf
    ) {
      failure(`work line ${index} must not start with a UTF-8 BOM`);
    }
    let line: string;
    try {
      line = decoder.decode(lineBuffers[index]);
    } catch (cause) {
      failure(`work line ${index} is not strict UTF-8`, cause);
    }
    if (index === 0 && line.charCodeAt(0) === 0xfeff) {
      failure("work.jsonl must not start with a BOM");
    }
    verifyAuthenticatedLine(
      line,
      intended.lines[index],
      intended.macs[index],
      index,
      key,
    );
  }
  const tail = bytes.subarray(start);
  if (tail.byteLength > MAX_LINE_BYTES)
    failure("work.jsonl torn tail is oversized");
  if (tail.byteLength > 0) {
    if (lineBuffers.length >= intended.lines.length) {
      failure("work.jsonl has an incomplete fragment after its seal");
    }
    const expected = Buffer.from(intended.lines[lineBuffers.length], "utf8");
    if (
      tail.byteLength > expected.byteLength ||
      !timingSafeEqual(tail, expected.subarray(0, tail.byteLength))
    ) {
      failure(
        "work.jsonl final fragment is not the exact expected next-line prefix",
      );
    }
  }
  return Object.freeze({
    completeLines: lineBuffers.length,
    authenticatedBytes: start,
    tornTail: tail.byteLength > 0,
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
    stat.nlink !== BigInt(1)
  ) {
    failure("work.jsonl owner, type, mode, or link count is invalid");
  }
  if (stat.size < BigInt(0) || stat.size > BigInt(MAX_TOTAL_BYTES)) {
    failure("work.jsonl size is outside its exact bound");
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

async function callFailpoint(
  invocation: CapturedInvocation,
  phase: FloodgateStableProposalCheckpointFailpointPhase,
  sequence?: number,
): Promise<void> {
  if (invocation.failpoint === undefined) return;
  const event = Object.freeze(
    sequence === undefined ? { phase } : { phase, sequence },
  );
  try {
    await invocation.failpoint(event);
  } catch (cause) {
    persistenceFailure(
      `test failpoint ${phase} interrupted a durable prefix`,
      cause,
    );
  }
}

async function syncFile(
  handle: fs.promises.FileHandle,
  label: string,
): Promise<void> {
  try {
    await handle.sync();
  } catch (cause) {
    persistenceFailure(`${label} sync may have persisted`, cause);
  }
}

async function closeHandle(
  invocation: CapturedInvocation,
  kind: "work" | "stage",
  handle: fs.promises.FileHandle,
): Promise<void> {
  const close = handle.close.bind(handle);
  if (invocation.closeForTests === undefined) {
    await close();
    return;
  }
  await invocation.closeForTests(kind, close);
}

async function appendLine(
  handle: fs.promises.FileHandle,
  line: string,
  label: string,
  writeForTests?: FloodgateStableProposalCheckpointDependencies["writeForTests"],
): Promise<void> {
  const bytes = Buffer.from(`${line}\n`, "utf8");
  try {
    let offset = 0;
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
      const bytesWritten =
        writeForTests === undefined
          ? await write()
          : await writeForTests(
              Object.freeze({
                label,
                bytes: new Uint8Array(bytes),
                offset,
                length: remaining,
              }),
              write,
            );
      if (
        !Number.isSafeInteger(bytesWritten) ||
        bytesWritten <= 0 ||
        bytesWritten > remaining
      ) {
        persistenceFailure(
          `${label} append made no progress`,
          new Error("zero-byte write"),
        );
      }
      offset += bytesWritten;
    }
  } catch (cause) {
    if (
      cause instanceof
      FloodgateStableProposalCheckpointPersistenceIndeterminateError
    ) {
      throw cause;
    }
    persistenceFailure(`${label} append may have persisted`, cause);
  }
  await syncFile(handle, label);
}

async function readWholeFile(handle: fs.promises.FileHandle): Promise<Buffer> {
  let stat: fs.BigIntStats;
  try {
    stat = await handle.stat({ bigint: true });
  } catch (cause) {
    return failure("work.jsonl cannot be inspected", cause);
  }
  if (stat.size > BigInt(MAX_TOTAL_BYTES)) failure("work.jsonl is oversized");
  const length = Number(stat.size);
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    let result: Awaited<ReturnType<typeof handle.read>>;
    try {
      result = await handle.read(bytes, offset, length - offset, offset);
    } catch (cause) {
      return failure("work.jsonl cannot be read", cause);
    }
    if (result.bytesRead === 0) failure("work.jsonl changed during read");
    offset += result.bytesRead;
  }
  let after: fs.BigIntStats;
  try {
    after = await handle.stat({ bigint: true });
  } catch (cause) {
    return failure("work.jsonl cannot be reinspected", cause);
  }
  if (
    after.dev !== stat.dev ||
    after.ino !== stat.ino ||
    after.size !== stat.size ||
    after.mtimeNs !== stat.mtimeNs ||
    after.ctimeNs !== stat.ctimeNs
  ) {
    failure("work.jsonl mutated during read");
  }
  return bytes;
}

async function executeCheckpoint(
  invocation: CapturedInvocation,
): Promise<Readonly<FloodgateStableProposalCheckpointReceipt>> {
  let stageHandle: fs.promises.FileHandle | undefined;
  let workHandle: fs.promises.FileHandle | undefined;
  let primaryFailure: unknown;
  const salt = Buffer.from(invocation.runId, "hex");
  let derived = Buffer.alloc(0);
  try {
    derived = Buffer.from(
      hkdfSync("sha256", invocation.rootKey, salt, Buffer.from(HKDF_INFO), 32),
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
        entries[0] !== FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME)
    ) {
      failure("stable proposal stage must contain only work.jsonl");
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);

    const intended = buildIntendedWork(invocation, derived);
    const workPath = `${invocation.lease.stageRoot}/${FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME}`;
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
    let completeLines = 0;
    let resumedEntries = 0;
    if (fresh) {
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        workHandle,
        intended.lines[0],
        "checkpoint header",
        invocation.writeForTests,
      );
      try {
        await stageHandle.sync();
      } catch (cause) {
        persistenceFailure(
          "stage directory sync after header may have persisted",
          cause,
        );
      }
      completeLines = 1;
      await callFailpoint(invocation, "after-header-durable");
    } else {
      const existing = await readWholeFile(workHandle);
      const prefix = scanExistingWork(existing, intended, derived);
      completeLines = prefix.completeLines;
      resumedEntries = Math.min(
        invocation.artifact.rows.length,
        Math.max(0, completeLines - 1),
      );
      if (prefix.tornTail) {
        invocation.persistenceState.mayHaveStarted = true;
        try {
          await workHandle.truncate(prefix.authenticatedBytes);
        } catch (cause) {
          persistenceFailure("torn-tail truncation may have persisted", cause);
        }
        await syncFile(workHandle, "torn-tail truncation");
      }
      invocation.persistenceState.mayHaveStarted = true;
      try {
        await stageHandle.sync();
      } catch (cause) {
        persistenceFailure(
          "stage directory sync before existing-prefix resume may have persisted",
          cause,
        );
      }
    }

    if (completeLines === 0) {
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        workHandle,
        intended.lines[0],
        "checkpoint header",
        invocation.writeForTests,
      );
      try {
        await stageHandle.sync();
      } catch (cause) {
        persistenceFailure(
          "stage directory sync after resumed header may have persisted",
          cause,
        );
      }
      completeLines = 1;
      await callFailpoint(invocation, "after-header-durable");
    }

    const sealLineIndex = intended.lines.length - 1;
    for (
      let lineIndex = completeLines;
      lineIndex < sealLineIndex;
      lineIndex += 1
    ) {
      const sequence = lineIndex - 1;
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        workHandle,
        intended.lines[lineIndex],
        `checkpoint entry ${sequence}`,
        invocation.writeForTests,
      );
      completeLines = lineIndex + 1;
      await callFailpoint(invocation, "after-entry-durable", sequence);
    }
    if (completeLines === sealLineIndex) {
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        workHandle,
        intended.lines[sealLineIndex],
        "checkpoint seal",
        invocation.writeForTests,
      );
      try {
        await stageHandle.sync();
      } catch (cause) {
        persistenceFailure(
          "stage directory sync after seal may have persisted",
          cause,
        );
      }
      completeLines += 1;
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
    workHandle = await fs.promises.open(
      workPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
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
    const finalPrefix = scanExistingWork(finalBytes, intended, derived);
    if (
      finalPrefix.tornTail ||
      finalPrefix.completeLines !== intended.lines.length ||
      finalBytes.byteLength !== intended.bytes.byteLength ||
      !timingSafeEqual(finalBytes, intended.bytes)
    ) {
      failure("final work.jsonl is not the exact authenticated sealed stream");
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    const finalEntries = await fs.promises.readdir(invocation.lease.stageRoot);
    if (
      finalEntries.length !== 1 ||
      finalEntries[0] !== FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME
    ) {
      failure("stage entry set changed before success");
    }
    await verifyStagePath(invocation);
    return Object.freeze({
      contract: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_SCHEMA,
      status: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_STATUS,
      claim_boundary: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_CLAIM_BOUNDARY,
      algorithm: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_ALGORITHM,
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
        filename: FLOODGATE_STABLE_PROPOSAL_CHECKPOINT_WORK_FILENAME,
        format: FORMAT,
        records: invocation.artifact.rows.length,
        bytes: finalBytes.byteLength,
        sha256: sha256Hex(finalBytes),
        completed_entries: invocation.artifact.rows.length,
        resumed_entries: resumedEntries,
        durability: DURABILITY,
      }),
    });
  } catch (cause) {
    const classified =
      invocation.persistenceState.mayHaveStarted &&
      !(
        cause instanceof
        FloodgateStableProposalCheckpointPersistenceIndeterminateError
      )
        ? new FloodgateStableProposalCheckpointPersistenceIndeterminateError(
            "failure occurred after checkpoint persistence may have started",
            { cause },
          )
        : cause;
    primaryFailure = classified;
    throw classified;
  } finally {
    derived.fill(0);
    salt.fill(0);
    invocation.rootKey.fill(0);
    const closeFailures: {
      readonly kind: "work" | "stage";
      readonly cause: unknown;
    }[] = [];
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
): Promise<Readonly<FloodgateStableProposalCheckpointReceipt>> {
  let result: Readonly<FloodgateStableProposalCheckpointReceipt> | undefined;
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
        FloodgateStableProposalCheckpointPersistenceIndeterminateError
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
      {
        primary,
        closeCause,
      },
    );
  }
  throw primary;
}

/**
 * Claim one exact test-authorized stage lease and durably persist or resume its
 * private authenticated proposal checkpoint. This API intentionally has no
 * production counterpart.
 */
export function checkpointFloodgateStableProposalsCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  artifact: FloodgateStableWasmProposalArtifact,
  options: FloodgateStableProposalCheckpointOptions,
  dependencies: FloodgateStableProposalCheckpointDependencies,
): Promise<Readonly<FloodgateStableProposalCheckpointReceipt>> {
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests(lease);
  let invocation: CapturedInvocation;
  try {
    invocation = captureInvocation(lease, artifact, options, dependencies);
  } catch (cause) {
    return closeAfterCaptureFailure(lease, cause);
  }
  return executeAndClose(invocation);
}
