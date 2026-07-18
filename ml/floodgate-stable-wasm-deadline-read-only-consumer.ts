/**
 * Purpose-limited authenticated input boundary for the stable-WASM deadline
 * diagnostic. It holds the nine fixed, manifest-authenticated paths read-only
 * across the callback and exposes no pathname, descriptor, raw byte, or writer
 * authority. Unrelated directory entries are deliberately not enumerated and
 * remain outside this diagnostic's claim and scope.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import { assertFloodgateGitExactCleanRevision } from "./floodgate-git";
import type { FloodgateStableWasmDeadlineReadOnlyConsumerOptions } from "./floodgate-stable-wasm-deadline-read-only-registry";
import {
  FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
  captureFloodgateTrainingRawIdentity,
  parseAuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
  type FloodgateTrainingRawIdentity,
} from "./floodgate-training-row-validation";

export const FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES =
  Object.freeze([
    "fresh-final-holdout.protected-position-ids.txt",
    "fresh-final-holdout.raw.jsonl",
    "fresh-selection.protected-position-ids.txt",
    "fresh-selection.raw.jsonl",
    "manifest.json",
    "replay-excluded-position-ids.txt",
    "replay-exclusion-receipt.json",
    "training.protected-position-ids.txt",
    "training.raw.jsonl",
  ] as const);
export const FLOODGATE_STABLE_WASM_DEADLINE_PINNED_MANIFEST_IDENTITY =
  Object.freeze({
    bytes: 7_202,
    path: "manifest.json" as const,
    sha256: "2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9",
  });
export const FLOODGATE_STABLE_WASM_DEADLINE_PINNED_RECEIPT_IDENTITY =
  Object.freeze({
    bytes: 14_735,
    path: "ml/protocols/floodgate-q1-2026-role-bundle-result.json" as const,
    sha256: "56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf",
  });

export interface FloodgateStableWasmDeadlineAuthenticatedRows {
  readonly binding: Readonly<{
    readonly bundle_manifest_bytes: number;
    readonly bundle_manifest_sha256: string;
    readonly bundle_producer_revision: string;
    readonly result_receipt_bytes: number;
    readonly result_receipt_sha256: string;
    readonly verifier_revision: string;
    readonly raw_format: typeof FLOODGATE_TRAINING_RAW_PARENT_FORMAT;
    readonly raw_bytes: number;
    readonly raw_sha256: string;
    readonly records: number;
    readonly games: number;
    readonly game_ids_sha256: string;
    readonly parent_ids_sha256: string;
    readonly position_ids_count: number;
    readonly position_ids_sha256: string;
  }>;
  readonly role: "training";
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly schema: "shogi-floodgate-stable-wasm-deadline-authenticated-rows-v1";
}

export interface FloodgateStableWasmDeadlineConsumerPostflightCapability {
  readonly contract: "shogi-floodgate-stable-wasm-deadline-consumer-postflight-capability-v1";
  readonly status: "opaque-single-use-postflight-not-claimed";
}

export interface FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests {
  readonly assertExactCleanRevision: (
    repositoryRoot: string,
    revision: string,
  ) => Promise<void>;
  readonly effectiveUserId: number;
  readonly expectedManifestIdentity: Readonly<{
    readonly bytes: number;
    readonly path: "manifest.json";
    readonly sha256: string;
  }>;
  readonly expectedReceiptIdentity: Readonly<{
    readonly bytes: number;
    readonly path: "ml/protocols/floodgate-q1-2026-role-bundle-result.json";
    readonly sha256: string;
  }>;
}

interface FileSpecification {
  readonly filename: (typeof FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES)[number];
  readonly maximumBytes: number;
  readonly retainBytes: boolean;
}

interface Snapshot {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly gid: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly mtimeNs: bigint;
  readonly nlink: bigint;
  readonly size: bigint;
  readonly uid: bigint;
}

interface OpenedRoleFile {
  readonly bytes: Buffer | null;
  readonly handle: fs.promises.FileHandle;
  readonly identity: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>;
  readonly path: string;
  readonly snapshot: Readonly<Snapshot>;
}

interface ManifestFileIdentity {
  readonly bytes: number;
  readonly path: string;
  readonly sha256: string;
}

const ROLE_FILE_SPECIFICATIONS = Object.freeze(
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.map((filename) =>
    Object.freeze({
      filename,
      maximumBytes:
        filename === "manifest.json" ||
        filename === "replay-exclusion-receipt.json"
          ? 64 * 1024
          : filename === "training.raw.jsonl"
            ? 64 * 1024 * 1024
            : 512 * 1024 * 1024,
      retainBytes:
        filename === "manifest.json" || filename === "training.raw.jsonl",
    }),
  ),
) as readonly Readonly<FileSpecification>[];
const MANIFEST_KEYS = Object.freeze([
  "contract",
  "isolation",
  "pipeline",
  "provenance",
  "replay_exclusion",
  "roles",
  "schema",
  "sources",
  "status",
] as const);
const RESULT_KEYS = Object.freeze([
  "claim_boundary",
  "execution",
  "manifest",
  "post_run_audit",
  "schema",
  "status",
] as const);
const OPTION_KEYS = Object.freeze([
  "legacyProtectedPositionIdsPath",
  "outputRoot",
  "rawLockRoot",
  "repositoryRoot",
  "roleLockRoot",
  "verifierRevision",
] as const);
const REVISION_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const PROTECTED_FORMAT = "sorted-unique-sha256-position-id-utf8-lf-v1" as const;
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);
const DIRECTORY_MODE = BigInt(0o700);
const FILE_MODE = BigInt(0o600);
const DIRECTORY_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const FILE_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const READ_CHUNK_BYTES = 1024 * 1024;
const productionInputClaims = new WeakSet<object>();
const testInputClaims = new WeakSet<object>();
const productionPostflightClaims = new WeakSet<object>();
const testPostflightClaims = new WeakSet<object>();

function fail(): never {
  throw new Error("stable-WASM deadline read-only consumer rejected");
}

function canonicalPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    value.length <= 4096 &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    path.isAbsolute(value) &&
    path.resolve(value) === value &&
    path.parse(value).root !== value
  );
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    fail();
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail();
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value,
    });
  }
  return Object.freeze(captured);
}

function captureOptions(
  value: FloodgateStableWasmDeadlineReadOnlyConsumerOptions,
): Readonly<FloodgateStableWasmDeadlineReadOnlyConsumerOptions> {
  const record = exactDataRecord(value, OPTION_KEYS);
  for (const key of [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot",
  ] as const) {
    if (!canonicalPath(record[key])) fail();
  }
  if (
    typeof record.verifierRevision !== "string" ||
    !REVISION_RE.test(record.verifierRevision)
  ) {
    fail();
  }
  return Object.freeze({
    legacyProtectedPositionIdsPath:
      record.legacyProtectedPositionIdsPath as string,
    outputRoot: record.outputRoot as string,
    rawLockRoot: record.rawLockRoot as string,
    repositoryRoot: record.repositoryRoot as string,
    roleLockRoot: record.roleLockRoot as string,
    verifierRevision: record.verifierRevision,
  });
}

function captureExpectedIdentity<TPath extends string>(
  value: unknown,
  expectedPath: TPath,
): Readonly<{
  readonly bytes: number;
  readonly path: TPath;
  readonly sha256: string;
}> {
  const record = exactDataRecord(value, ["bytes", "path", "sha256"]);
  if (
    !Number.isSafeInteger(record.bytes) ||
    (record.bytes as number) <= 0 ||
    record.path !== expectedPath ||
    typeof record.sha256 !== "string" ||
    !SHA256_RE.test(record.sha256)
  ) {
    fail();
  }
  return Object.freeze({
    bytes: record.bytes as number,
    path: expectedPath,
    sha256: record.sha256,
  });
}

function snapshot(value: fs.BigIntStats): Readonly<Snapshot> {
  return Object.freeze({
    ctimeNs: value.ctimeNs,
    dev: value.dev,
    gid: value.gid,
    ino: value.ino,
    mode: value.mode,
    mtimeNs: value.mtimeNs,
    nlink: value.nlink,
    size: value.size,
    uid: value.uid,
  });
}

function sameSnapshot(
  left: Readonly<Snapshot>,
  right: Readonly<Snapshot>,
): boolean {
  return (
    left.ctimeNs === right.ctimeNs &&
    left.dev === right.dev &&
    left.gid === right.gid &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.mtimeNs === right.mtimeNs &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.uid === right.uid
  );
}

async function readHeldFile(
  handle: fs.promises.FileHandle,
  size: number,
  retainBytes: boolean,
): Promise<
  Readonly<{
    readonly bytes: Buffer | null;
    readonly sha256: string;
  }>
> {
  const digest = createHash("sha256");
  const retained = retainBytes ? Buffer.alloc(size) : null;
  const chunk = Buffer.alloc(Math.min(READ_CHUNK_BYTES, Math.max(1, size)));
  let offset = 0;
  try {
    while (offset < size) {
      const requested = Math.min(chunk.byteLength, size - offset);
      const { bytesRead } = await handle.read(chunk, 0, requested, offset);
      if (bytesRead !== requested) fail();
      digest.update(chunk.subarray(0, bytesRead));
      if (retained !== null) {
        chunk.copy(retained, offset, 0, bytesRead);
      }
      offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    try {
      const { bytesRead } = await handle.read(extra, 0, 1, size);
      if (bytesRead !== 0) fail();
    } finally {
      extra.fill(0);
    }
    return Object.freeze({
      bytes: retained,
      sha256: digest.digest("hex"),
    });
  } catch (error) {
    retained?.fill(0);
    throw error;
  } finally {
    chunk.fill(0);
  }
}

async function openRoleRoot(
  outputRoot: string,
  effectiveUserId: number,
): Promise<
  Readonly<{
    readonly handle: fs.promises.FileHandle;
    readonly snapshot: Readonly<Snapshot>;
  }>
> {
  if (fs.realpathSync.native(outputRoot) !== outputRoot) fail();
  const before = snapshot(
    await fs.promises.lstat(outputRoot, { bigint: true }),
  );
  if (
    (before.mode & TYPE_MASK) !== DIRECTORY_TYPE ||
    (before.mode & MODE_MASK) !== DIRECTORY_MODE ||
    before.uid !== BigInt(effectiveUserId)
  ) {
    fail();
  }
  const handle = await fs.promises.open(outputRoot, DIRECTORY_FLAGS);
  try {
    const held = snapshot(await handle.stat({ bigint: true }));
    const named = snapshot(
      await fs.promises.lstat(outputRoot, { bigint: true }),
    );
    if (!sameSnapshot(before, held) || !sameSnapshot(held, named)) fail();
    return Object.freeze({ handle, snapshot: held });
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function openRoleFile(
  outputRoot: string,
  effectiveUserId: number,
  specification: Readonly<FileSpecification>,
): Promise<Readonly<OpenedRoleFile>> {
  const filePath = path.join(outputRoot, specification.filename);
  if (fs.realpathSync.native(filePath) !== filePath) fail();
  const before = snapshot(await fs.promises.lstat(filePath, { bigint: true }));
  if (
    (before.mode & TYPE_MASK) !== REGULAR_TYPE ||
    (before.mode & MODE_MASK) !== FILE_MODE ||
    before.uid !== BigInt(effectiveUserId) ||
    before.nlink !== BigInt(1) ||
    before.size <= BigInt(0) ||
    before.size > BigInt(specification.maximumBytes)
  ) {
    fail();
  }
  const handle = await fs.promises.open(filePath, FILE_FLAGS);
  try {
    const held = snapshot(await handle.stat({ bigint: true }));
    if (!sameSnapshot(before, held)) fail();
    const size = Number(held.size);
    const content = await readHeldFile(handle, size, specification.retainBytes);
    const heldAfter = snapshot(await handle.stat({ bigint: true }));
    if (!sameSnapshot(held, heldAfter)) {
      content.bytes?.fill(0);
      fail();
    }
    return Object.freeze({
      bytes: content.bytes,
      handle,
      identity: Object.freeze({
        bytes: size,
        sha256: content.sha256,
      }),
      path: filePath,
      snapshot: held,
    });
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function openTrackedReceipt(
  repositoryRoot: string,
  effectiveUserId: number,
  expectedIdentity: FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests["expectedReceiptIdentity"],
): Promise<Readonly<OpenedRoleFile>> {
  const receiptPath = path.join(
    repositoryRoot,
    ...expectedIdentity.path.split("/"),
  );
  if (fs.realpathSync.native(receiptPath) !== receiptPath) fail();
  const before = snapshot(
    await fs.promises.lstat(receiptPath, { bigint: true }),
  );
  if (
    (before.mode & TYPE_MASK) !== REGULAR_TYPE ||
    before.uid !== BigInt(effectiveUserId) ||
    before.nlink !== BigInt(1) ||
    before.size !== BigInt(expectedIdentity.bytes)
  ) {
    fail();
  }
  const handle = await fs.promises.open(receiptPath, FILE_FLAGS);
  try {
    const held = snapshot(await handle.stat({ bigint: true }));
    if (!sameSnapshot(before, held)) fail();
    const content = await readHeldFile(handle, expectedIdentity.bytes, true);
    if (content.bytes === null || content.sha256 !== expectedIdentity.sha256) {
      content.bytes?.fill(0);
      fail();
    }
    return Object.freeze({
      bytes: content.bytes,
      handle,
      identity: Object.freeze({
        bytes: content.bytes.byteLength,
        sha256: content.sha256,
      }),
      path: receiptPath,
      snapshot: held,
    });
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    );
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return fail();
}

function parseCanonicalJson(bytes: Buffer): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail();
  }
  if (
    text.startsWith("\uFEFF") ||
    text.includes("\0") ||
    text.includes("\r") ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n")
  ) {
    fail();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1)) as unknown;
  } catch {
    return fail();
  }
  if (`${canonicalJson(parsed)}\n` !== text) fail();
  return parsed;
}

function requiredPositiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail();
  return value as number;
}

function requiredSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) fail();
  return value;
}

function captureBaseFileIdentity(
  value: Readonly<Record<string, unknown>>,
  expectedPath: string,
): Readonly<ManifestFileIdentity> {
  if (value.path !== expectedPath) fail();
  return Object.freeze({
    bytes: requiredPositiveInteger(value.bytes),
    path: expectedPath,
    sha256: requiredSha256(value.sha256),
  });
}

function captureProtectedIdentity(
  value: unknown,
  expectedPath: string,
): Readonly<ManifestFileIdentity> {
  const record = exactDataRecord(value, [
    "bytes",
    "count",
    "format",
    "identifiers_sha256",
    "path",
    "sha256",
  ]);
  if (
    record.format !== PROTECTED_FORMAT ||
    requiredPositiveInteger(record.count) < 1
  ) {
    fail();
  }
  requiredSha256(record.identifiers_sha256);
  return captureBaseFileIdentity(record, expectedPath);
}

function captureRawIdentity(
  value: unknown,
  expectedPath: string,
): Readonly<ManifestFileIdentity> {
  const record = exactDataRecord(value, [
    "bytes",
    "format",
    "game_ids_sha256",
    "games",
    "parent_ids_sha256",
    "path",
    "position_ids_count",
    "position_ids_sha256",
    "records",
    "sha256",
  ]);
  if (record.format !== FLOODGATE_TRAINING_RAW_PARENT_FORMAT) fail();
  for (const key of ["games", "position_ids_count", "records"] as const) {
    requiredPositiveInteger(record[key]);
  }
  for (const key of [
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
  ] as const) {
    requiredSha256(record[key]);
  }
  return captureBaseFileIdentity(record, expectedPath);
}

function captureSimpleIdentity(
  value: unknown,
  expectedPath: string,
): Readonly<ManifestFileIdentity> {
  return captureBaseFileIdentity(
    exactDataRecord(value, ["bytes", "path", "sha256"]),
    expectedPath,
  );
}

function captureManifest(
  manifestBytes: Buffer,
  expectedIdentity: FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests["expectedManifestIdentity"],
): Readonly<{
  readonly fileIdentities: ReadonlyMap<string, Readonly<ManifestFileIdentity>>;
  readonly manifest: unknown;
  readonly producerRevision: string;
  readonly rawIdentity: Readonly<FloodgateTrainingRawIdentity>;
}> {
  if (
    manifestBytes.byteLength !== expectedIdentity.bytes ||
    createHash("sha256").update(manifestBytes).digest("hex") !==
      expectedIdentity.sha256
  ) {
    fail();
  }
  const manifest = parseCanonicalJson(manifestBytes);
  const record = exactDataRecord(manifest, MANIFEST_KEYS);
  if (
    record.schema !== "shogi-floodgate-label-free-role-bundle-v2" ||
    record.status !== "complete-label-free-role-bundle"
  ) {
    fail();
  }
  const pipeline = exactDataRecord(record.pipeline, [
    "source_revision",
    "tracked_tree_clean",
  ]);
  if (
    typeof pipeline.source_revision !== "string" ||
    !REVISION_RE.test(pipeline.source_revision) ||
    pipeline.tracked_tree_clean !== true
  ) {
    fail();
  }
  const roles = exactDataRecord(record.roles, [
    "fresh_final_holdout",
    "fresh_selection",
    "training",
  ]);
  const training = exactDataRecord(roles.training, [
    "protected_position_ids",
    "raw_parents",
  ]);
  const freshFinal = exactDataRecord(roles.fresh_final_holdout, [
    "protected_position_ids",
    "raw_parents",
  ]);
  const freshSelection = exactDataRecord(roles.fresh_selection, [
    "protected_position_ids",
    "raw_parents",
  ]);
  const replay = exactDataRecord(record.replay_exclusion, [
    "identifiers",
    "receipt",
    "summary",
  ]);
  const trainingRawIdentity = captureFloodgateTrainingRawIdentity(
    training.raw_parents,
  );
  const identities = [
    captureProtectedIdentity(
      freshFinal.protected_position_ids,
      "fresh-final-holdout.protected-position-ids.txt",
    ),
    captureRawIdentity(freshFinal.raw_parents, "fresh-final-holdout.raw.jsonl"),
    captureProtectedIdentity(
      freshSelection.protected_position_ids,
      "fresh-selection.protected-position-ids.txt",
    ),
    captureRawIdentity(freshSelection.raw_parents, "fresh-selection.raw.jsonl"),
    Object.freeze({
      bytes: expectedIdentity.bytes,
      path: expectedIdentity.path,
      sha256: expectedIdentity.sha256,
    }),
    captureProtectedIdentity(
      replay.identifiers,
      "replay-excluded-position-ids.txt",
    ),
    captureSimpleIdentity(replay.receipt, "replay-exclusion-receipt.json"),
    captureProtectedIdentity(
      training.protected_position_ids,
      "training.protected-position-ids.txt",
    ),
    captureRawIdentity(training.raw_parents, "training.raw.jsonl"),
  ];
  const fileIdentities = new Map(
    identities.map((identity) => [identity.path, identity]),
  );
  if (
    identities.length !==
      FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.length ||
    fileIdentities.size !== identities.length ||
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.some(
      (filename) => !fileIdentities.has(filename),
    )
  ) {
    fail();
  }
  return Object.freeze({
    fileIdentities,
    manifest,
    producerRevision: pipeline.source_revision,
    rawIdentity: trainingRawIdentity,
  });
}

function assertReceipt(
  receiptBytes: Buffer,
  manifest: unknown,
  expectedManifestIdentity: FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests["expectedManifestIdentity"],
): void {
  const receipt = exactDataRecord(
    parseCanonicalJson(receiptBytes),
    RESULT_KEYS,
  );
  if (
    receipt.schema !== "shogi-floodgate-role-bundle-result-v1" ||
    receipt.status !== "complete-label-free-role-bundle" ||
    receipt.claim_boundary !== "integrity-only-not-playing-strength-evidence"
  ) {
    fail();
  }
  const receiptManifest = exactDataRecord(receipt.manifest, [
    "identity",
    "value",
  ]);
  const identity = exactDataRecord(receiptManifest.identity, [
    "bytes",
    "path",
    "sha256",
  ]);
  if (
    identity.bytes !== expectedManifestIdentity.bytes ||
    identity.path !== expectedManifestIdentity.path ||
    identity.sha256 !== expectedManifestIdentity.sha256 ||
    canonicalJson(receiptManifest.value) !== canonicalJson(manifest)
  ) {
    fail();
  }
}

async function revalidateRoleFile(
  opened: Readonly<OpenedRoleFile>,
): Promise<void> {
  const held = snapshot(await opened.handle.stat({ bigint: true }));
  const named = snapshot(
    await fs.promises.lstat(opened.path, { bigint: true }),
  );
  if (
    !sameSnapshot(opened.snapshot, held) ||
    !sameSnapshot(held, named) ||
    fs.realpathSync.native(opened.path) !== opened.path
  ) {
    fail();
  }
}

function buildInput(
  rows: readonly Readonly<FloodgateTrainingParent>[],
  rawIdentity: Readonly<FloodgateTrainingRawIdentity>,
  producerRevision: string,
  verifierRevision: string,
  expectedManifestIdentity: FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests["expectedManifestIdentity"],
  expectedReceiptIdentity: FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests["expectedReceiptIdentity"],
): Readonly<FloodgateStableWasmDeadlineAuthenticatedRows> {
  return Object.freeze({
    binding: Object.freeze({
      bundle_manifest_bytes: expectedManifestIdentity.bytes,
      bundle_manifest_sha256: expectedManifestIdentity.sha256,
      bundle_producer_revision: producerRevision,
      game_ids_sha256: rawIdentity.game_ids_sha256,
      games: rawIdentity.games,
      parent_ids_sha256: rawIdentity.parent_ids_sha256,
      position_ids_count: rawIdentity.position_ids_count,
      position_ids_sha256: rawIdentity.position_ids_sha256,
      raw_bytes: rawIdentity.bytes,
      raw_format: FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
      raw_sha256: rawIdentity.sha256,
      records: rawIdentity.records,
      result_receipt_bytes: expectedReceiptIdentity.bytes,
      result_receipt_sha256: expectedReceiptIdentity.sha256,
      verifier_revision: verifierRevision,
    }),
    role: "training" as const,
    rows,
    schema:
      "shogi-floodgate-stable-wasm-deadline-authenticated-rows-v1" as const,
  });
}

function claimInput(
  registry: WeakSet<object>,
  input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
): void {
  if (
    input === null ||
    typeof input !== "object" ||
    nodeUtilTypes.isProxy(input) ||
    !registry.delete(input)
  ) {
    fail();
  }
}

function claimPostflight(
  registry: WeakSet<object>,
  capability: FloodgateStableWasmDeadlineConsumerPostflightCapability,
): void {
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeUtilTypes.isProxy(capability) ||
    !registry.delete(capability)
  ) {
    fail();
  }
}

async function consume(
  optionsInput: FloodgateStableWasmDeadlineReadOnlyConsumerOptions,
  callback: (
    input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
  ) => Promise<void>,
  dependencies: Readonly<FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests>,
  inputClaims: WeakSet<object>,
  postflightClaims: WeakSet<object>,
): Promise<Readonly<FloodgateStableWasmDeadlineConsumerPostflightCapability>> {
  const options = captureOptions(optionsInput);
  if (
    typeof callback !== "function" ||
    nodeUtilTypes.isProxy(callback) ||
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId <= 0 ||
    typeof dependencies.assertExactCleanRevision !== "function" ||
    nodeUtilTypes.isProxy(dependencies.assertExactCleanRevision)
  ) {
    fail();
  }
  const expectedManifestIdentity = captureExpectedIdentity(
    dependencies.expectedManifestIdentity,
    "manifest.json",
  );
  const expectedReceiptIdentity = captureExpectedIdentity(
    dependencies.expectedReceiptIdentity,
    "ml/protocols/floodgate-q1-2026-role-bundle-result.json",
  );
  await dependencies.assertExactCleanRevision(
    options.repositoryRoot,
    options.verifierRevision,
  );
  const roleRoot = await openRoleRoot(
    options.outputRoot,
    dependencies.effectiveUserId,
  );
  const opened: OpenedRoleFile[] = [];
  let receipt: Readonly<OpenedRoleFile> | undefined;
  let primary: unknown;
  try {
    for (const specification of ROLE_FILE_SPECIFICATIONS) {
      opened.push(
        await openRoleFile(
          options.outputRoot,
          dependencies.effectiveUserId,
          specification,
        ),
      );
    }
    receipt = await openTrackedReceipt(
      options.repositoryRoot,
      dependencies.effectiveUserId,
      expectedReceiptIdentity,
    );
    const manifestFile = opened.find((entry) =>
      entry.path.endsWith(`${path.sep}manifest.json`),
    );
    const trainingFile = opened.find((entry) =>
      entry.path.endsWith(`${path.sep}training.raw.jsonl`),
    );
    if (
      manifestFile?.bytes === null ||
      manifestFile?.bytes === undefined ||
      trainingFile?.bytes === null ||
      trainingFile?.bytes === undefined ||
      receipt.bytes === null
    ) {
      fail();
    }
    const capturedManifest = captureManifest(
      manifestFile.bytes,
      expectedManifestIdentity,
    );
    assertReceipt(
      receipt.bytes,
      capturedManifest.manifest,
      expectedManifestIdentity,
    );
    if (
      opened.length !==
      FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ROLE_FILES.length
    ) {
      fail();
    }
    for (const roleFile of opened) {
      const filename = path.basename(roleFile.path);
      const expected = capturedManifest.fileIdentities.get(filename);
      if (
        expected === undefined ||
        expected.bytes !== roleFile.identity.bytes ||
        expected.sha256 !== roleFile.identity.sha256
      ) {
        fail();
      }
    }
    if (
      trainingFile.identity.bytes !== capturedManifest.rawIdentity.bytes ||
      trainingFile.identity.sha256 !== capturedManifest.rawIdentity.sha256
    ) {
      fail();
    }
    const rows = parseAuthenticatedFloodgateTrainingRows(
      trainingFile.bytes,
      capturedManifest.rawIdentity,
    );
    const input = buildInput(
      rows,
      capturedManifest.rawIdentity,
      capturedManifest.producerRevision,
      options.verifierRevision,
      expectedManifestIdentity,
      expectedReceiptIdentity,
    );
    inputClaims.add(input);
    let callbackPromise: Promise<void> | undefined;
    let claimed = false;
    try {
      callbackPromise = callback(input);
    } finally {
      claimed = !inputClaims.delete(input);
    }
    if (
      !claimed ||
      callbackPromise === undefined ||
      !(callbackPromise instanceof Promise) ||
      nodeUtilTypes.isProxy(callbackPromise)
    ) {
      callbackPromise?.catch(() => undefined);
      fail();
    }
    const callbackValue = await callbackPromise;
    if (callbackValue !== undefined) fail();

    await revalidateRoleFile(receipt);
    for (const roleFile of opened) await revalidateRoleFile(roleFile);
    const heldRoot = snapshot(await roleRoot.handle.stat({ bigint: true }));
    const namedRoot = snapshot(
      await fs.promises.lstat(options.outputRoot, { bigint: true }),
    );
    if (
      !sameSnapshot(roleRoot.snapshot, heldRoot) ||
      !sameSnapshot(heldRoot, namedRoot) ||
      fs.realpathSync.native(options.outputRoot) !== options.outputRoot
    ) {
      fail();
    }
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    for (const roleFile of opened) roleFile.bytes?.fill(0);
    receipt?.bytes?.fill(0);
    const closeResults = await Promise.allSettled([
      ...opened.map((roleFile) => roleFile.handle.close()),
      ...(receipt === undefined ? [] : [receipt.handle.close()]),
      roleRoot.handle.close(),
    ]);
    if (
      primary === undefined &&
      closeResults.some((result) => result.status === "rejected")
    ) {
      fail();
    }
  }
  await dependencies.assertExactCleanRevision(
    options.repositoryRoot,
    options.verifierRevision,
  );
  const postflight = Object.freeze({
    contract:
      "shogi-floodgate-stable-wasm-deadline-consumer-postflight-capability-v1" as const,
    status: "opaque-single-use-postflight-not-claimed" as const,
  });
  postflightClaims.add(postflight);
  return postflight;
}

export function withFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
  options: FloodgateStableWasmDeadlineReadOnlyConsumerOptions,
  callback: (
    input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
  ) => Promise<void>,
  dependencies: Readonly<FloodgateStableWasmDeadlineReadOnlyConsumerDependenciesForTests>,
): Promise<Readonly<FloodgateStableWasmDeadlineConsumerPostflightCapability>> {
  if (arguments.length !== 3) {
    return Promise.reject(new Error("read-only consumer invocation rejected"));
  }
  return consume(
    options,
    callback,
    dependencies,
    testInputClaims,
    testPostflightClaims,
  );
}

export function claimFloodgateStableWasmDeadlineReadOnlyRowsCoreForTests(
  input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
): void {
  if (arguments.length !== 1) fail();
  claimInput(testInputClaims, input);
}

export function claimFloodgateStableWasmDeadlineConsumerPostflightCoreForTests(
  capability: FloodgateStableWasmDeadlineConsumerPostflightCapability,
): void {
  if (arguments.length !== 1) fail();
  claimPostflight(testPostflightClaims, capability);
}

export function withFloodgateStableWasmDeadlineReadOnlyRows(
  options: FloodgateStableWasmDeadlineReadOnlyConsumerOptions,
  callback: (
    input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
  ) => Promise<void>,
  effectiveUserId: number,
): Promise<Readonly<FloodgateStableWasmDeadlineConsumerPostflightCapability>> {
  if (arguments.length !== 3) {
    return Promise.reject(new Error("read-only consumer invocation rejected"));
  }
  return consume(
    options,
    callback,
    {
      assertExactCleanRevision: assertFloodgateGitExactCleanRevision,
      effectiveUserId,
      expectedManifestIdentity:
        FLOODGATE_STABLE_WASM_DEADLINE_PINNED_MANIFEST_IDENTITY,
      expectedReceiptIdentity:
        FLOODGATE_STABLE_WASM_DEADLINE_PINNED_RECEIPT_IDENTITY,
    },
    productionInputClaims,
    productionPostflightClaims,
  );
}

export function claimFloodgateStableWasmDeadlineReadOnlyRows(
  input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
): void {
  if (arguments.length !== 1) fail();
  claimInput(productionInputClaims, input);
}

export function claimFloodgateStableWasmDeadlineConsumerPostflight(
  capability: FloodgateStableWasmDeadlineConsumerPostflightCapability,
): void {
  if (arguments.length !== 1) fail();
  claimPostflight(productionPostflightClaims, capability);
}
