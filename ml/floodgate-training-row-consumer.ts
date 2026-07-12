/**
 * Descriptor-held access to the pinned Floodgate training rows.
 *
 * This boundary authenticates and strictly parses only training.raw.jsonl.
 * The callback never receives a pathname, file descriptor, mutable raw bytes,
 * raw JSONL text, role selector, or selection/final artifact identity.
 * During the synchronous callback invocation, the production callback's exact
 * input identity also carries one ephemeral, single-use runtime claim. The
 * dependency-injected test core uses a separate registry and cannot mint
 * production provenance.
 *
 * This is an input-integrity capability, not teacher-data or playing-strength
 * evidence. Callers must stage work inside the callback and publish a final
 * manifest only after this function resolves and its postflight checks pass.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
  verifyPinnedFloodgateRoleBundleReceipt,
  type VerifiedPinnedFloodgateRoleBundle,
} from "./floodgate-role-bundle-result";
import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  type FloodgateRoleBundleFileIdentity,
  type FloodgateRoleBundleRawIdentity,
  type VerifyExistingFloodgateRoleBundleOptions,
} from "./floodgate-role-bundle";
import { floodgateCanonicalUrlGameId } from "./floodgate-raw-lock";
import { floodgateIdentifierDigest } from "./floodgate-roles";
import { toSfen } from "./generate-teacher";
import { positionKeyFromSfen } from "./sibling-data";
import { positionFromSfen, rulesCompleteLegalMoves } from "./shogi-sfen";

export const FLOODGATE_TRAINING_RAW_FILENAME = "training.raw.jsonl" as const;
export const FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA =
  "shogi-authenticated-floodgate-training-rows-v1" as const;
export const FLOODGATE_TRAINING_RAW_MAX_BYTES = 64 * 1024 * 1024;

const NativeError = Error;
const NativeBigInt = BigInt;
const NativeNumber = Number;
const NativePromise = Promise;
const NativeTextDecoder = TextDecoder;
const NativeURL = URL;
const NativeWeakSet = WeakSet;
const nativePromiseThen = Promise.prototype.then;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetDelete = WeakSet.prototype.delete;
const isNativePromise = nodeUtilTypes.isPromise.bind(nodeUtilTypes);
const reflectApply = Reflect.apply;
const objectDefineProperty = Object.defineProperty;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectPrototype = Object.prototype;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const openFile = fs.promises.open.bind(fs.promises);
const lstatFile = fs.promises.lstat.bind(fs.promises);
const realpathFile = fs.promises.realpath.bind(fs.promises);
const fstatCallback = fs.fstat.bind(fs);
const lstatCallback = fs.lstat.bind(fs);
const pathJoin = path.join;
const pathResolve = path.resolve;
const currentUid =
  typeof process.getuid === "function" ? process.getuid() : null;

const REVISION_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const RAW_PARENT_KEYS = Object.freeze([
  "game_id",
  "game_sha256",
  "parent_id",
  "parent_sfen",
  "played_move",
  "ply",
  "position_id",
  "schema_version",
  "source",
  "source_url",
] as const);
const OPTION_KEYS = Object.freeze([
  "legacyProtectedPositionIdsPath",
  "outputRoot",
  "rawLockRoot",
  "repositoryRoot",
  "roleLockRoot",
  "verifierRevision",
] as const);
const RAW_IDENTITY_KEYS = Object.freeze([
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
] as const);
const VERIFIED_BUNDLE_KEYS = Object.freeze([
  "manifest",
  "manifestText",
  "producerRevision",
  "result",
  "roleLock",
  "verifierRevision",
] as const);
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

export type FloodgateTrainingRowConsumerOptions =
  VerifyExistingFloodgateRoleBundleOptions;

export interface FloodgateTrainingParent {
  readonly schema_version: 1;
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly ply: number;
  readonly played_move: string;
}

export interface FloodgateTrainingInputBinding {
  readonly result_receipt_bytes: number;
  readonly result_receipt_sha256: string;
  readonly bundle_manifest_bytes: number;
  readonly bundle_manifest_sha256: string;
  readonly bundle_producer_revision: string;
  readonly verifier_revision: string;
  readonly raw_format: typeof FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT;
  readonly raw_bytes: number;
  readonly raw_sha256: string;
  readonly records: number;
  readonly games: number;
  readonly game_ids_sha256: string;
  readonly parent_ids_sha256: string;
  readonly position_ids_count: number;
  readonly position_ids_sha256: string;
}

export interface AuthenticatedFloodgateTrainingRows {
  readonly schema: typeof FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA;
  readonly role: "training";
  readonly binding: Readonly<FloodgateTrainingInputBinding>;
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
}

export interface FloodgateTrainingRowConsumerDependencies {
  readonly verifyBundle: (
    options: Readonly<FloodgateTrainingRowConsumerOptions>,
  ) => Promise<Readonly<VerifiedPinnedFloodgateRoleBundle>>;
  readonly expectedManifestIdentity: Readonly<FloodgateRoleBundleFileIdentity>;
}

interface FilesystemIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly gid: bigint;
  readonly rdev: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly birthtimeNs: bigint;
}

interface OpenedTrainingSnapshot {
  readonly rootHandle: fs.promises.FileHandle;
  readonly rawHandle: fs.promises.FileHandle;
  readonly rootFd: number;
  readonly rawFd: number;
  readonly closeRoot: () => Promise<void>;
  readonly closeRaw: () => Promise<void>;
  readonly rootIdentity: Readonly<FilesystemIdentity>;
  readonly rawIdentity: Readonly<FilesystemIdentity>;
  readonly rawBytes: Uint8Array;
}

interface CapturedVerifiedTrainingBundle {
  readonly manifestIdentity: Readonly<FloodgateRoleBundleFileIdentity>;
  readonly producerRevision: string;
  readonly verifierRevision: string;
  readonly rawIdentity: Readonly<FloodgateRoleBundleRawIdentity>;
}

interface NativePromiseBox<T> {
  readonly value: T;
}

interface DescriptorCloseOutcome {
  readonly errors: readonly unknown[];
}

interface RuntimeClaimRegistry {
  readonly available: WeakSet<Readonly<AuthenticatedFloodgateTrainingRows>>;
  readonly boundary: "production" | "test-only";
}

function fail(message: string): never {
  throw new NativeError(`invalid Floodgate training-row consumer: ${message}`);
}

function createRuntimeClaimRegistry(
  boundary: RuntimeClaimRegistry["boundary"],
): Readonly<RuntimeClaimRegistry> {
  return objectFreeze({
    available: new NativeWeakSet<
      Readonly<AuthenticatedFloodgateTrainingRows>
    >(),
    boundary,
  });
}

const PRODUCTION_RUNTIME_CLAIMS = createRuntimeClaimRegistry("production");
const TEST_RUNTIME_CLAIMS = createRuntimeClaimRegistry("test-only");

function runtimeClaimAdd(
  registrySet: WeakSet<Readonly<AuthenticatedFloodgateTrainingRows>>,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): void {
  reflectApply(nativeWeakSetAdd, registrySet, [input]);
}

function runtimeClaimDelete(
  registrySet: WeakSet<Readonly<AuthenticatedFloodgateTrainingRows>>,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): boolean {
  return reflectApply(nativeWeakSetDelete, registrySet, [input]) as boolean;
}

function activateRuntimeClaim(
  registry: Readonly<RuntimeClaimRegistry>,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): void {
  runtimeClaimAdd(registry.available, input);
}

function revokeRuntimeClaim(
  registry: Readonly<RuntimeClaimRegistry>,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): void {
  runtimeClaimDelete(registry.available, input);
}

function claimRuntimeInput(
  registry: Readonly<RuntimeClaimRegistry>,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): void {
  if (!runtimeClaimDelete(registry.available, input)) {
    fail(
      `${registry.boundary} runtime claim requires the exact active unclaimed input`,
    );
  }
}

/**
 * Claim the exact input issued by the production consumer during synchronous
 * callback invocation. This proves object provenance, synchronous-entry lifetime,
 * and single use only; possession of the callback input remains the authority to
 * claim it.
 */
export function claimActiveVerifiedPinnedFloodgateTrainingRows(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): void {
  claimRuntimeInput(PRODUCTION_RUNTIME_CLAIMS, input);
}

/** Test-only claim registry, intentionally isolated from the production registry. */
export function claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): void {
  claimRuntimeInput(TEST_RUNTIME_CLAIMS, input);
}

function combinedFailure(
  message: string,
  primary: unknown,
  secondary: readonly unknown[],
): Error {
  const error = new NativeError(message);
  objectDefineProperty(error, "cause", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: primary,
  });
  objectDefineProperty(error, "secondary", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: objectFreeze(secondary),
  });
  return error;
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sha256Hex(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return jsonStringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return jsonStringify(value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        fail("canonical JSON rejects sparse arrays");
      }
    }
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareBytewise);
    return `{${keys
      .map((key) => `${jsonStringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return fail(`canonical JSON rejects ${typeof value}`);
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256Hex(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function strictDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    fail(`${label} must be a non-Proxy plain object`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail(`${label} must not contain symbol keys`);
  }
  const actual = (keys as string[]).sort(compareBytewise);
  const expected = [...expectedKeys].sort(compareBytewise);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
  const captured: Record<string, unknown> = Object.create(null);
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable data property`);
    }
    captured[key] = descriptor.value;
  }
  return objectFreeze(captured);
}

function captureOptions(
  value: FloodgateTrainingRowConsumerOptions,
): Readonly<FloodgateTrainingRowConsumerOptions> {
  const input = strictDataObject(value, OPTION_KEYS, "options");
  for (const key of OPTION_KEYS) {
    if (
      typeof input[key] !== "string" ||
      input[key] === "" ||
      (input[key] as string).trim() !== input[key] ||
      (input[key] as string).includes("\0")
    ) {
      fail(`options.${key} must be a canonical non-empty string`);
    }
  }
  for (const key of [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot",
  ] as const) {
    if (pathResolve(input[key] as string) !== input[key]) {
      fail(`options.${key} must be an absolute normalized path`);
    }
  }
  if (!REVISION_RE.test(input.verifierRevision as string)) {
    fail("options.verifierRevision must be a lowercase 40-digit revision");
  }
  return objectFreeze({
    repositoryRoot: input.repositoryRoot as string,
    verifierRevision: input.verifierRevision as string,
    rawLockRoot: input.rawLockRoot as string,
    roleLockRoot: input.roleLockRoot as string,
    legacyProtectedPositionIdsPath:
      input.legacyProtectedPositionIdsPath as string,
    outputRoot: input.outputRoot as string,
  });
}

function captureDependencies(
  value: FloodgateTrainingRowConsumerDependencies,
): Readonly<FloodgateTrainingRowConsumerDependencies> {
  const input = strictDataObject(
    value,
    ["expectedManifestIdentity", "verifyBundle"],
    "dependencies",
  );
  if (
    typeof input.verifyBundle !== "function" ||
    nodeUtilTypes.isProxy(input.verifyBundle)
  ) {
    fail("dependencies.verifyBundle must be a non-Proxy function");
  }
  return objectFreeze({
    verifyBundle:
      input.verifyBundle as FloodgateTrainingRowConsumerDependencies["verifyBundle"],
    expectedManifestIdentity: validateManifestIdentity(
      input.expectedManifestIdentity,
    ),
  });
}

function captureConsumer<T>(
  value: (input: Readonly<AuthenticatedFloodgateTrainingRows>) => Promise<T>,
): (input: Readonly<AuthenticatedFloodgateTrainingRows>) => Promise<T> {
  if (typeof value !== "function" || nodeUtilTypes.isProxy(value)) {
    fail("consumer must be a non-Proxy function");
  }
  return value;
}

function filesystemIdentity(
  stat: fs.BigIntStats,
): Readonly<FilesystemIdentity> {
  return objectFreeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    gid: stat.gid,
    rdev: stat.rdev,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
    birthtimeNs: stat.birthtimeNs,
  });
}

function sameFilesystemIdentity(
  left: Readonly<FilesystemIdentity>,
  right: Readonly<FilesystemIdentity>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.rdev === right.rdev &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.birthtimeNs === right.birthtimeNs
  );
}

function assertRootStat(stat: fs.BigIntStats): void {
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("bundle root is not a regular directory");
  }
  if (NativeNumber(stat.mode & NativeBigInt(0o7777)) !== 0o700) {
    fail("bundle root mode must be exactly 0700");
  }
  if (currentUid !== null && stat.uid !== NativeBigInt(currentUid)) {
    fail("bundle root is not owned by the current user");
  }
}

function assertRawStat(stat: fs.BigIntStats): void {
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail("training raw input is not a regular file");
  }
  if (stat.nlink !== NativeBigInt(1))
    fail("training raw input must have one hard link");
  if (NativeNumber(stat.mode & NativeBigInt(0o7777)) !== 0o600) {
    fail("training raw input mode must be exactly 0600");
  }
  if (currentUid !== null && stat.uid !== NativeBigInt(currentUid)) {
    fail("training raw input is not owned by the current user");
  }
  if (
    stat.size <= NativeBigInt(0) ||
    stat.size > NativeBigInt(FLOODGATE_TRAINING_RAW_MAX_BYTES)
  ) {
    fail("training raw input size is outside the safety bound");
  }
}

async function openTrainingSnapshot(
  outputRoot: string,
): Promise<OpenedTrainingSnapshot> {
  const noFollow = fs.constants.O_NOFOLLOW;
  const directory = fs.constants.O_DIRECTORY;
  if (typeof noFollow !== "number" || typeof directory !== "number") {
    fail("production requires O_NOFOLLOW and O_DIRECTORY");
  }
  const rawPath = pathJoin(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME);
  if (
    pathResolve(rawPath) !== rawPath ||
    (await realpathFile(outputRoot)) !== outputRoot ||
    (await realpathFile(rawPath)) !== rawPath
  ) {
    fail("bundle root or training input traverses a symbolic link");
  }

  let rootHandle: fs.promises.FileHandle | undefined;
  let rawHandle: fs.promises.FileHandle | undefined;
  try {
    rootHandle = await openFile(
      outputRoot,
      fs.constants.O_RDONLY | directory | noFollow,
    );
    rawHandle = await openFile(rawPath, fs.constants.O_RDONLY | noFollow);
    const rootStatMethod = rootHandle.stat.bind(rootHandle) as (
      options: Readonly<{ bigint: true }>,
    ) => Promise<fs.BigIntStats>;
    const rawStatMethod = rawHandle.stat.bind(rawHandle) as (
      options: Readonly<{ bigint: true }>,
    ) => Promise<fs.BigIntStats>;
    const rootStat = () => rootStatMethod({ bigint: true });
    const rawStat = () => rawStatMethod({ bigint: true });
    const closeRoot = rootHandle.close.bind(rootHandle);
    const closeRaw = rawHandle.close.bind(rawHandle);
    const rootBefore = await rootStat();
    const rootPathBefore = await lstatFile(outputRoot, { bigint: true });
    const rawBefore = await rawStat();
    const rawPathBefore = await lstatFile(rawPath, { bigint: true });
    assertRootStat(rootBefore);
    assertRootStat(rootPathBefore);
    assertRawStat(rawBefore);
    assertRawStat(rawPathBefore);
    const rootIdentity = filesystemIdentity(rootBefore);
    const rawIdentity = filesystemIdentity(rawBefore);
    if (
      !sameFilesystemIdentity(
        rootIdentity,
        filesystemIdentity(rootPathBefore),
      ) ||
      !sameFilesystemIdentity(rawIdentity, filesystemIdentity(rawPathBefore))
    ) {
      fail("opened descriptor does not match its pathname");
    }
    const rawBytes = await rawHandle.readFile();
    const rootAfterRead = await rootStat();
    const rawAfterRead = await rawStat();
    if (
      !sameFilesystemIdentity(
        rootIdentity,
        filesystemIdentity(rootAfterRead),
      ) ||
      !sameFilesystemIdentity(rawIdentity, filesystemIdentity(rawAfterRead)) ||
      NativeBigInt(rawBytes.byteLength) !== rawIdentity.size
    ) {
      fail("bundle root or training input changed while snapshotted");
    }
    return {
      rootHandle,
      rawHandle,
      rootFd: rootHandle.fd,
      rawFd: rawHandle.fd,
      closeRoot,
      closeRaw,
      rootIdentity,
      rawIdentity,
      rawBytes,
    };
  } catch (error) {
    const closeErrors: unknown[] = [];
    if (rawHandle !== undefined) {
      try {
        await rawHandle.close();
      } catch (closeError) {
        closeErrors.push(closeError);
      }
    }
    if (rootHandle !== undefined) {
      try {
        await rootHandle.close();
      } catch (closeError) {
        closeErrors.push(closeError);
      }
    }
    if (closeErrors.length > 0) {
      throw combinedFailure(
        "failed to open and close Floodgate training descriptors",
        error,
        closeErrors,
      );
    }
    throw error;
  }
}

async function assertSnapshotUnchanged(
  opened: OpenedTrainingSnapshot,
  outputRoot: string,
): Promise<void> {
  const rawPath = pathJoin(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME);
  const rootDescriptor = (await callbackFstatIdentity(opened.rootFd)).value;
  const rootPath = (await callbackLstatIdentity(outputRoot)).value;
  const rawDescriptor = (await callbackFstatIdentity(opened.rawFd)).value;
  const rawPathStat = (await callbackLstatIdentity(rawPath)).value;
  if (
    !sameFilesystemIdentity(opened.rootIdentity, rootDescriptor) ||
    !sameFilesystemIdentity(opened.rootIdentity, rootPath) ||
    !sameFilesystemIdentity(opened.rawIdentity, rawDescriptor) ||
    !sameFilesystemIdentity(opened.rawIdentity, rawPathStat)
  ) {
    fail("bundle root or training input changed across the callback boundary");
  }
}

function validateRawIdentity(
  value: Readonly<FloodgateRoleBundleRawIdentity>,
): Readonly<FloodgateRoleBundleRawIdentity> {
  const identity = strictDataObject(
    value,
    RAW_IDENTITY_KEYS,
    "training raw identity",
  );
  if (
    identity.path !== FLOODGATE_TRAINING_RAW_FILENAME ||
    identity.format !== FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT
  ) {
    fail("training raw identity path or format is not fixed");
  }
  for (const key of [
    "bytes",
    "records",
    "games",
    "position_ids_count",
  ] as const) {
    if (
      !Number.isSafeInteger(identity[key]) ||
      (identity[key] as number) <= 0
    ) {
      fail(`training raw identity ${key} must be a positive safe integer`);
    }
  }
  for (const key of [
    "sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
  ] as const) {
    if (typeof identity[key] !== "string" || !SHA256_RE.test(identity[key])) {
      fail(`training raw identity ${key} is not a SHA-256 digest`);
    }
  }
  return identity as unknown as Readonly<FloodgateRoleBundleRawIdentity>;
}

function validateManifestIdentity(
  value: unknown,
): Readonly<FloodgateRoleBundleFileIdentity> {
  const identity = strictDataObject(
    value,
    ["bytes", "path", "sha256"],
    "expected bundle manifest identity",
  );
  if (
    identity.path !== FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.path ||
    !Number.isSafeInteger(identity.bytes) ||
    (identity.bytes as number) <= 0 ||
    typeof identity.sha256 !== "string" ||
    !SHA256_RE.test(identity.sha256)
  ) {
    fail("expected bundle manifest identity is invalid");
  }
  return identity as unknown as Readonly<FloodgateRoleBundleFileIdentity>;
}

function captureManifestTrainingIdentity(
  value: unknown,
  label: string,
): Readonly<{
  readonly producerRevision: string;
  readonly rawIdentity: Readonly<FloodgateRoleBundleRawIdentity>;
}> {
  const manifest = strictDataObject(value, MANIFEST_KEYS, label);
  if (
    manifest.schema !== FLOODGATE_ROLE_BUNDLE_SCHEMA ||
    manifest.status !== "complete-label-free-role-bundle"
  ) {
    fail(`${label} schema or status is unsupported`);
  }
  const pipeline = strictDataObject(
    manifest.pipeline,
    ["source_revision", "tracked_tree_clean"],
    `${label}.pipeline`,
  );
  if (
    typeof pipeline.source_revision !== "string" ||
    !REVISION_RE.test(pipeline.source_revision) ||
    pipeline.tracked_tree_clean !== true
  ) {
    fail(`${label} pipeline is not a clean pinned revision`);
  }
  const roles = strictDataObject(
    manifest.roles,
    ["fresh_final_holdout", "fresh_selection", "training"],
    `${label}.roles`,
  );
  const training = strictDataObject(
    roles.training,
    ["protected_position_ids", "raw_parents"],
    `${label}.roles.training`,
  );
  return objectFreeze({
    producerRevision: pipeline.source_revision,
    rawIdentity: validateRawIdentity(
      training.raw_parents as Readonly<FloodgateRoleBundleRawIdentity>,
    ),
  });
}

function sameRawIdentity(
  left: Readonly<FloodgateRoleBundleRawIdentity>,
  right: Readonly<FloodgateRoleBundleRawIdentity>,
): boolean {
  for (const key of RAW_IDENTITY_KEYS) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

function captureVerifiedTrainingBundle(
  value: unknown,
  requestedVerifierRevision: string,
  expectedManifestIdentityInput: Readonly<FloodgateRoleBundleFileIdentity>,
): Readonly<CapturedVerifiedTrainingBundle> {
  const expectedManifestIdentity = validateManifestIdentity(
    expectedManifestIdentityInput,
  );
  const verified = strictDataObject(
    value,
    VERIFIED_BUNDLE_KEYS,
    "verified pinned role bundle",
  );
  if (typeof verified.manifestText !== "string") {
    fail("verified pinned role bundle manifestText must be a string");
  }
  const manifestText = verified.manifestText;
  if (
    typeof verified.producerRevision !== "string" ||
    !REVISION_RE.test(verified.producerRevision) ||
    typeof verified.verifierRevision !== "string" ||
    !REVISION_RE.test(verified.verifierRevision) ||
    verified.verifierRevision !== requestedVerifierRevision
  ) {
    fail("verified bundle revisions do not bind the requested verifier");
  }
  const currentManifest = captureManifestTrainingIdentity(
    verified.manifest,
    "verified role-bundle manifest",
  );
  const currentManifestText = `${canonicalJson(verified.manifest)}\n`;
  const result = strictDataObject(
    verified.result,
    RESULT_KEYS,
    "verified role-bundle result",
  );
  if (
    result.schema !== FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA ||
    result.status !== "complete-label-free-role-bundle" ||
    result.claim_boundary !== "integrity-only-not-playing-strength-evidence"
  ) {
    fail("verified role-bundle result boundary is unsupported");
  }
  const resultManifest = strictDataObject(
    result.manifest,
    ["identity", "value"],
    "verified role-bundle result manifest",
  );
  const manifestIdentity = strictDataObject(
    resultManifest.identity,
    ["bytes", "path", "sha256"],
    "verified bundle manifest identity",
  );
  if (
    manifestIdentity.path !== expectedManifestIdentity.path ||
    manifestIdentity.bytes !== expectedManifestIdentity.bytes ||
    manifestIdentity.sha256 !== expectedManifestIdentity.sha256
  ) {
    fail("verified bundle manifest identity is not the pinned manifest");
  }
  const receiptManifest = captureManifestTrainingIdentity(
    resultManifest.value,
    "result-receipt role-bundle manifest",
  );
  const receiptManifestText = `${canonicalJson(resultManifest.value)}\n`;
  if (
    manifestText !== currentManifestText ||
    manifestText !== receiptManifestText ||
    bufferByteLength(manifestText, "utf8") !== expectedManifestIdentity.bytes ||
    sha256Hex(manifestText) !== expectedManifestIdentity.sha256 ||
    verified.producerRevision !== currentManifest.producerRevision ||
    verified.producerRevision !== receiptManifest.producerRevision ||
    !sameRawIdentity(currentManifest.rawIdentity, receiptManifest.rawIdentity)
  ) {
    fail("verified bundle and result receipt training bindings differ");
  }
  return objectFreeze({
    manifestIdentity: expectedManifestIdentity,
    producerRevision: verified.producerRevision,
    verifierRevision: verified.verifierRevision,
    rawIdentity: currentManifest.rawIdentity,
  });
}

function requiredString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    fail(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function parseRawParent(
  value: unknown,
  line: string,
  lineNumber: number,
): Readonly<{
  sourceUrl: string;
  gameSha256: string;
  parent: Readonly<FloodgateTrainingParent>;
}> {
  const raw = strictDataObject(
    value,
    RAW_PARENT_KEYS,
    `training raw line ${lineNumber}`,
  );
  if (canonicalJson(value) !== line) {
    fail(`training raw line ${lineNumber} is not canonical JSON`);
  }
  if (raw.schema_version !== 1 || raw.source !== "floodgate") {
    fail(`training raw line ${lineNumber} has an unsupported source schema`);
  }
  const sourceUrl = requiredString(
    raw.source_url,
    `training raw line ${lineNumber} source_url`,
  );
  let gameIdFromUrl: string;
  try {
    const parsedUrl = new NativeURL(sourceUrl);
    if (parsedUrl.protocol !== "https:") throw new NativeError("not HTTPS");
    gameIdFromUrl = floodgateCanonicalUrlGameId(sourceUrl);
  } catch {
    fail(`training raw line ${lineNumber} source_url is not canonical`);
  }
  const gameSha256 = requiredString(
    raw.game_sha256,
    `training raw line ${lineNumber} game_sha256`,
  );
  if (!SHA256_RE.test(gameSha256)) {
    fail(`training raw line ${lineNumber} game_sha256 is invalid`);
  }
  const gameId = requiredString(
    raw.game_id,
    `training raw line ${lineNumber} game_id`,
  );
  const parentId = requiredString(
    raw.parent_id,
    `training raw line ${lineNumber} parent_id`,
  );
  const positionId = requiredString(
    raw.position_id,
    `training raw line ${lineNumber} position_id`,
  );
  if (
    !POSITION_ID_RE.test(gameId) ||
    !POSITION_ID_RE.test(parentId) ||
    !POSITION_ID_RE.test(positionId) ||
    gameId !== gameIdFromUrl
  ) {
    fail(`training raw line ${lineNumber} contains an invalid semantic ID`);
  }
  const parentSfen = requiredString(
    raw.parent_sfen,
    `training raw line ${lineNumber} parent_sfen`,
  );
  if (parentSfen.split(/\s+/).join(" ") !== parentSfen) {
    fail(`training raw line ${lineNumber} parent_sfen is not normalized`);
  }
  if (!Number.isSafeInteger(raw.ply) || (raw.ply as number) < 0) {
    fail(`training raw line ${lineNumber} ply is invalid`);
  }
  const ply = raw.ply as number;
  if (parentId !== parentOccurrenceId(gameId, ply)) {
    fail(
      `training raw line ${lineNumber} parent_id does not match game and ply`,
    );
  }
  const playedMove = requiredString(
    raw.played_move,
    `training raw line ${lineNumber} played_move`,
  );
  let moveNumber: number;
  let legalMoves: readonly Readonly<{ readonly usi: string }>[];
  try {
    const parsed = positionFromSfen(parentSfen);
    moveNumber = parsed.moveNumber;
    if (toSfen(parsed.position, parsed.moveNumber) !== parentSfen) {
      fail(`training raw line ${lineNumber} parent_sfen is not canonical`);
    }
    legalMoves = rulesCompleteLegalMoves(parsed.position);
  } catch (error) {
    const message =
      error instanceof NativeError ? error.message : String(error);
    fail(`training raw line ${lineNumber} has invalid SFEN: ${message}`);
  }
  if (moveNumber !== ply + 1) {
    fail(`training raw line ${lineNumber} SFEN move number does not match ply`);
  }
  if (!legalMoves.some((move) => move.usi === playedMove)) {
    fail(`training raw line ${lineNumber} played_move is illegal`);
  }
  if (positionKeyFromSfen(parentSfen) !== positionId) {
    fail(`training raw line ${lineNumber} position_id does not match SFEN`);
  }
  return objectFreeze({
    sourceUrl,
    gameSha256,
    parent: objectFreeze({
      schema_version: 1 as const,
      game_id: gameId,
      parent_id: parentId,
      position_id: positionId,
      parent_sfen: parentSfen,
      ply,
      played_move: playedMove,
    }),
  });
}

/** Strict production parser exported so unit tests can exercise malformed snapshots. */
export function parseAuthenticatedFloodgateTrainingRowsCoreForTests(
  bytes: Uint8Array,
  expectedIdentityInput: Readonly<FloodgateRoleBundleRawIdentity>,
): readonly Readonly<FloodgateTrainingParent>[] {
  if (!(bytes instanceof Uint8Array) || nodeUtilTypes.isProxy(bytes)) {
    fail("training raw snapshot must be a non-Proxy Uint8Array");
  }
  const expectedIdentity = validateRawIdentity(expectedIdentityInput);
  if (
    bytes.byteLength !== expectedIdentity.bytes ||
    sha256Hex(bytes) !== expectedIdentity.sha256
  ) {
    fail("training raw snapshot identity does not match the verified manifest");
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    fail("training raw snapshot must not contain a UTF-8 BOM");
  }
  let text: string;
  try {
    text = new NativeTextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("training raw snapshot is not fatal-valid UTF-8");
  }
  if (
    text.startsWith("\uFEFF") ||
    text.includes("\0") ||
    text.includes("\r") ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n")
  ) {
    fail("training raw snapshot framing is not canonical UTF-8 JSONL");
  }
  const lines = text.slice(0, -1).split("\n");
  if (
    lines.length !== expectedIdentity.records ||
    lines.some((line) => line === "")
  ) {
    fail("training raw snapshot record count or blank-line framing differs");
  }

  const rows: Readonly<FloodgateTrainingParent>[] = [];
  const gameIds = new Set<string>();
  const parentIds = new Set<string>();
  const positionIds = new Set<string>();
  const gameSources = new Map<string, string>();
  let previousParentId: string | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = jsonParse(lines[index]);
    } catch {
      fail(`training raw line ${index + 1} is not valid JSON`);
    }
    const parsedRow = parseRawParent(parsed, lines[index], index + 1);
    const row = parsedRow.parent;
    if (
      previousParentId !== undefined &&
      compareBytewise(previousParentId, row.parent_id) >= 0
    ) {
      fail("training raw parent_id order is not strict UTF-8 byte order");
    }
    previousParentId = row.parent_id;
    if (parentIds.has(row.parent_id))
      fail("training raw parent_id is duplicated");
    if (positionIds.has(row.position_id)) {
      fail("training raw semantic position is duplicated");
    }
    const sourceIdentity = `${parsedRow.sourceUrl}\0${parsedRow.gameSha256}`;
    const existingSource = gameSources.get(row.game_id);
    if (existingSource !== undefined && existingSource !== sourceIdentity) {
      fail("training raw game source identity is inconsistent");
    }
    gameSources.set(row.game_id, sourceIdentity);
    gameIds.add(row.game_id);
    parentIds.add(row.parent_id);
    positionIds.add(row.position_id);
    rows.push(row);
  }
  if (
    gameIds.size !== expectedIdentity.games ||
    parentIds.size !== expectedIdentity.records ||
    positionIds.size !== expectedIdentity.position_ids_count ||
    floodgateIdentifierDigest(gameIds) !== expectedIdentity.game_ids_sha256 ||
    floodgateIdentifierDigest(parentIds) !==
      expectedIdentity.parent_ids_sha256 ||
    floodgateIdentifierDigest(positionIds) !==
      expectedIdentity.position_ids_sha256
  ) {
    fail(
      "training raw aggregate identity does not match the verified manifest",
    );
  }
  return objectFreeze(rows);
}

function buildAuthenticatedInput(
  verified: Readonly<CapturedVerifiedTrainingBundle>,
  rows: readonly Readonly<FloodgateTrainingParent>[],
): Readonly<AuthenticatedFloodgateTrainingRows> {
  const manifestIdentity = verified.manifestIdentity;
  const rawIdentity = verified.rawIdentity;
  const binding = objectFreeze({
    result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
    result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
    bundle_manifest_bytes: manifestIdentity.bytes,
    bundle_manifest_sha256: manifestIdentity.sha256,
    bundle_producer_revision: verified.producerRevision,
    verifier_revision: verified.verifierRevision,
    raw_format: rawIdentity.format,
    raw_bytes: rawIdentity.bytes,
    raw_sha256: rawIdentity.sha256,
    records: rawIdentity.records,
    games: rawIdentity.games,
    game_ids_sha256: rawIdentity.game_ids_sha256,
    parent_ids_sha256: rawIdentity.parent_ids_sha256,
    position_ids_count: rawIdentity.position_ids_count,
    position_ids_sha256: rawIdentity.position_ids_sha256,
  });
  return objectFreeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training" as const,
    binding,
    rows,
  });
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

function nativePromiseBox<T>(value: T): Readonly<NativePromiseBox<T>> {
  const box = objectCreate(null) as { value?: T };
  objectDefineProperty(box, "value", {
    configurable: false,
    enumerable: true,
    writable: false,
    value,
  });
  return objectFreeze(box as { value: T });
}

function guardNativePromiseBox<T>(
  value: unknown,
  label: string,
): Promise<Readonly<NativePromiseBox<T>>> {
  const guarded = new NativePromise<Readonly<NativePromiseBox<T>>>(
    (resolve, reject) => {
      try {
        if (!isNativePromise(value)) {
          throw new NativeError(`${label} returned a non-native Promise`);
        }
        reflectApply(nativePromiseThen, value, [
          (settled: T) => resolve(nativePromiseBox(settled)),
          reject,
        ]);
      } catch {
        reject(
          new NativeError(
            `invalid Floodgate training-row consumer: ${label} must return a native Promise`,
          ),
        );
      }
    },
  );
  return pinNativePromise(guarded);
}

function guardNativeVoidPromise(value: unknown, label: string): Promise<void> {
  const boxed = guardNativePromiseBox<unknown>(value, label);
  const completion = new NativePromise<void>((resolve, reject) => {
    try {
      reflectApply(nativePromiseThen, boxed, [() => resolve(), reject]);
    } catch {
      reject(new NativeError(`failed to guard ${label}`));
    }
  });
  return pinNativePromise(completion);
}

/** Exposes the native-Promise guard only for isolated adversarial tests. */
export function guardFloodgateTrainingNativePromiseCoreForTests<T>(
  value: unknown,
  label = "test operation",
): Promise<Readonly<NativePromiseBox<T>>> {
  return guardNativePromiseBox<T>(value, label);
}

function callbackFstatIdentity(
  fd: number,
): Promise<Readonly<NativePromiseBox<Readonly<FilesystemIdentity>>>> {
  const completion = new NativePromise<
    Readonly<NativePromiseBox<Readonly<FilesystemIdentity>>>
  >((resolve, reject) => {
    fstatCallback(fd, { bigint: true }, (error, stat) => {
      if (error !== null) {
        reject(error);
        return;
      }
      try {
        resolve(nativePromiseBox(filesystemIdentity(stat)));
      } catch (cause) {
        reject(cause);
      }
    });
  });
  return pinNativePromise(completion);
}

function callbackLstatIdentity(
  artifactPath: string,
): Promise<Readonly<NativePromiseBox<Readonly<FilesystemIdentity>>>> {
  const completion = new NativePromise<
    Readonly<NativePromiseBox<Readonly<FilesystemIdentity>>>
  >((resolve, reject) => {
    lstatCallback(artifactPath, { bigint: true }, (error, stat) => {
      if (error !== null) {
        reject(error);
        return;
      }
      try {
        resolve(nativePromiseBox(filesystemIdentity(stat)));
      } catch (cause) {
        reject(cause);
      }
    });
  });
  return pinNativePromise(completion);
}

async function closeOpenedSnapshot(
  opened: OpenedTrainingSnapshot,
): Promise<Readonly<DescriptorCloseOutcome>> {
  const errors: unknown[] = [];
  try {
    await guardNativePromiseBox<void>(
      opened.closeRaw(),
      "training descriptor close",
    );
  } catch (error) {
    errors[errors.length] = error;
  }
  try {
    await guardNativePromiseBox<void>(
      opened.closeRoot(),
      "root descriptor close",
    );
  } catch (error) {
    errors[errors.length] = error;
  }
  const outcome = objectCreate(null) as { errors?: readonly unknown[] };
  objectDefineProperty(outcome, "errors", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: objectFreeze(errors),
  });
  return objectFreeze(outcome as { errors: readonly unknown[] });
}

async function runVerifiedPinnedFloodgateTrainingRows(
  optionsInput: FloodgateTrainingRowConsumerOptions,
  consumeInput: (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
  ) => Promise<void>,
  dependenciesInput: FloodgateTrainingRowConsumerDependencies,
  runtimeClaims: Readonly<RuntimeClaimRegistry>,
): Promise<void> {
  const options = captureOptions(optionsInput);
  const consume = captureConsumer(consumeInput);
  const dependencies = captureDependencies(dependenciesInput);
  const opened = await openTrainingSnapshot(options.outputRoot);

  let failed = false;
  let failure: unknown;
  try {
    const verifiedPromise = reflectApply(dependencies.verifyBundle, undefined, [
      options,
    ]);
    const verified = (
      await guardNativePromiseBox<Readonly<VerifiedPinnedFloodgateRoleBundle>>(
        verifiedPromise,
        "bundle verifier",
      )
    ).value;
    await guardNativePromiseBox<void>(
      assertSnapshotUnchanged(opened, options.outputRoot),
      "post-verification filesystem check",
    );
    const capturedVerified = captureVerifiedTrainingBundle(
      verified,
      options.verifierRevision,
      dependencies.expectedManifestIdentity,
    );
    const rows = parseAuthenticatedFloodgateTrainingRowsCoreForTests(
      opened.rawBytes,
      capturedVerified.rawIdentity,
    );
    const input = buildAuthenticatedInput(capturedVerified, rows);
    activateRuntimeClaim(runtimeClaims, input);
    let callbackPromise: Promise<void>;
    try {
      callbackPromise = reflectApply(consume, undefined, [input]);
    } finally {
      // The claim window ends when the synchronous callback invocation returns.
      // Waiting for Promise settlement would let callback-scheduled microtasks race
      // this revocation after the Promise was already settled.
      revokeRuntimeClaim(runtimeClaims, input);
    }
    const callbackResult = (
      await guardNativePromiseBox<void>(callbackPromise, "consumer")
    ).value;
    if (callbackResult !== undefined) {
      fail("consumer must resolve without a return value");
    }
    await guardNativePromiseBox<void>(
      assertSnapshotUnchanged(opened, options.outputRoot),
      "post-callback filesystem check",
    );
  } catch (error) {
    failed = true;
    failure = error;
  }

  const closeErrors = (
    await guardNativePromiseBox<Readonly<DescriptorCloseOutcome>>(
      closeOpenedSnapshot(opened),
      "descriptor closure",
    )
  ).value.errors;
  if (failed) {
    if (closeErrors.length > 0) {
      throw combinedFailure(
        "Floodgate training consumption and descriptor close both failed",
        failure,
        closeErrors,
      );
    }
    throw failure;
  }
  if (closeErrors.length > 0) {
    throw combinedFailure(
      "failed to close Floodgate training descriptors",
      undefined,
      closeErrors,
    );
  }
}

/** Dependency-injected production core used by adversarial unit tests. */
export function withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
  optionsInput: FloodgateTrainingRowConsumerOptions,
  consumeInput: (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
  ) => Promise<void>,
  dependenciesInput: FloodgateTrainingRowConsumerDependencies,
): Promise<void> {
  return guardNativeVoidPromise(
    runVerifiedPinnedFloodgateTrainingRows(
      optionsInput,
      consumeInput,
      dependenciesInput,
      TEST_RUNTIME_CLAIMS,
    ),
    "training-consumer execution",
  );
}

const PRODUCTION_DEPENDENCIES = objectFreeze({
  verifyBundle: verifyPinnedFloodgateRoleBundleReceipt,
  expectedManifestIdentity: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
});

/**
 * Authenticate and expose exactly the pinned training parents to one callback.
 * The complete role-bundle verifier runs while the input descriptor is held.
 */
export function withVerifiedPinnedFloodgateTrainingRows(
  options: FloodgateTrainingRowConsumerOptions,
  consume: (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
  ) => Promise<void>,
): Promise<void> {
  return guardNativeVoidPromise(
    runVerifiedPinnedFloodgateTrainingRows(
      options,
      consume,
      PRODUCTION_DEPENDENCIES,
      PRODUCTION_RUNTIME_CLAIMS,
    ),
    "training-consumer execution",
  );
}
