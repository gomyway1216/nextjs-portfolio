/**
 * Copy a private Floodgate input tree into the non-production clean-room
 * namespace without symlinks, hard links, filesystem clones, or path aliases.
 *
 * This is a preparation primitive only. It does not open a holdout, execute a
 * teacher, create a label, train a model, or change a live weight.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT =
  "shogi-floodgate-v7-clean-room-copy-by-value-v1" as const;
export const FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS =
  "complete-private-tree-copy-by-value" as const;
export const FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY =
  "source-and-destination-byte-identity-private-metadata-and-no-symlink-hardlink-or-inode-alias-not-source-semantic-validity-teacher-label-training-weight-live-activation-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PORTABLE_COPY_WITNESS_CONTRACT =
  "shogi-floodgate-v7-portable-copy-filesystem-witness-v1" as const;
export const FLOODGATE_V7_PORTABLE_COPY_WITNESS_CLAIM_BOUNDARY =
  "filesystem-only-source-preseal-post-verification-seal-copy-by-value-witness-composite-destination-closure-and-borrow-pre-post-revalidation-not-callback-time-namespace-exclusivity-or-semantic-input-authenticity-source-semantic-verification-teacher-label-training-weight-live-activation-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_CONTRACT =
  "shogi-floodgate-v7-portable-copy-held-role-bundle-v1" as const;
export const FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_CLAIM_BOUNDARY =
  "private-inventory-bound-held-root-and-exact-nine-fixed-file-no-follow-open-fstat-read-sha256-explicit-eof-synchronous-single-use-path-fd-stat-identity-free-snapshot-claim-callback-settlement-post-fstat-buffer-zeroization-all-handle-close-and-composite-postflight-not-callback-time-namespace-exclusivity-source-semantic-authenticity-source-verifier-binding-teacher-label-training-gate-weight-live-activation-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES = Object.freeze([
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
export const FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_MANIFEST_MAX_BYTES =
  64 * 1024;
export const FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_TRAINING_RAW_MAX_BYTES =
  64 * 1024 * 1024;

const DIRECTORY_MODE = BigInt(0o700);
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_EXECUTABLE_MODE = 0o700;
const MODE_MASK = BigInt(0o7777);
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 250_000;
const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_DIRECTORY_DEPTH = 32;
export const FLOODGATE_V7_CLEAN_ROOM_COPY_CONCURRENCY = 8 as const;
const SAFE_BASENAME_RE = /^[A-Za-z0-9._-]+$/u;
const objectPrototype = Object.prototype;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const arrayIsArray = Array.isArray;
const arrayEvery = Array.prototype.every;
const arrayMap = Array.prototype.map;
const arrayPush = Array.prototype.push;
const arrayReverse = Array.prototype.reverse;
const arraySome = Array.prototype.some;
const arraySort = Array.prototype.sort;
const stringIncludes = String.prototype.includes;
const stringSplit = String.prototype.split;
const stringStartsWith = String.prototype.startsWith;
const weakMapDelete = WeakMap.prototype.delete;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakSetAdd = WeakSet.prototype.add;
const weakSetHas = WeakSet.prototype.has;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const uint8ArrayFill = Uint8Array.prototype.fill;
const uint8ArraySet = Uint8Array.prototype.set;
const NativeSharedArrayBuffer = SharedArrayBuffer;

function isArray(value: unknown): value is unknown[] {
  return reflectApply(arrayIsArray, undefined, [value]) as boolean;
}

function everyArrayItem<Value>(
  values: readonly Value[],
  predicate: (value: Value, index: number) => boolean,
): boolean {
  return reflectApply(arrayEvery, values, [predicate]) as boolean;
}

function mapArrayItems<Value, Result>(
  values: readonly Value[],
  callback: (value: Value, index: number) => Result,
): Result[] {
  return reflectApply(arrayMap, values, [callback]) as Result[];
}

function pushArrayItem<Value>(values: Value[], value: Value): number {
  return reflectApply(arrayPush, values, [value]) as number;
}

function reverseArrayItems<Value>(values: Value[]): Value[] {
  return reflectApply(arrayReverse, values, []) as Value[];
}

function someArrayItem<Value>(
  values: readonly Value[],
  predicate: (value: Value, index: number) => boolean,
): boolean {
  return reflectApply(arraySome, values, [predicate]) as boolean;
}

function sortArrayItems<Value>(
  values: Value[],
  compare: (left: Value, right: Value) => number,
): Value[] {
  return reflectApply(arraySort, values, [compare]) as Value[];
}

function stringContains(value: string, search: string): boolean {
  return reflectApply(stringIncludes, value, [search]) as boolean;
}

function splitString(value: string, separator: string): string[] {
  return reflectApply(stringSplit, value, [separator]) as string[];
}

function stringBeginsWith(value: string, search: string): boolean {
  return reflectApply(stringStartsWith, value, [search]) as boolean;
}

function getWeakMapValue<Key extends object, Value>(
  map: WeakMap<Key, Value>,
  key: Key,
): Value | undefined {
  return reflectApply(weakMapGet, map, [key]) as Value | undefined;
}

function setWeakMapValue<Key extends object, Value>(
  map: WeakMap<Key, Value>,
  key: Key,
  value: Value,
): void {
  reflectApply(weakMapSet, map, [key, value]);
}

function deleteWeakMapValue<Key extends object, Value>(
  map: WeakMap<Key, Value>,
  key: Key,
): boolean {
  return reflectApply(weakMapDelete, map, [key]) as boolean;
}

function weakSetContains<Value extends object>(
  set: WeakSet<Value>,
  value: Value,
): boolean {
  return reflectApply(weakSetHas, set, [value]) as boolean;
}

function addWeakSetValue<Value extends object>(
  set: WeakSet<Value>,
  value: Value,
): void {
  reflectApply(weakSetAdd, set, [value]);
}

type CopyPhase =
  | "capture"
  | "source-inventory"
  | "namespace"
  | "copy"
  | "revalidation"
  | "callback";

export type FloodgateV7PortableCopyKind =
  "raw-lock-tree" | "role-lock-tree" | "role-bundle-tree" | "legacy-file";

declare const portableSourcePresealBrand: unique symbol;
declare const portableSourceSealBrand: unique symbol;
declare const portableCopyWitnessBrand: unique symbol;
declare const portableCompositeSealBrand: unique symbol;
declare const portableHeldRoleBundleClaimBrand: unique symbol;

export interface FloodgateV7PortableCopySourcePreseal {
  readonly [portableSourcePresealBrand]: true;
}

export interface FloodgateV7PortableCopySourceFilesystemSeal {
  readonly [portableSourceSealBrand]: true;
}

export interface FloodgateV7PortableCopyWitness {
  readonly [portableCopyWitnessBrand]: true;
}

export interface FloodgateV7PortableCopyCompositeDestinationSeal {
  readonly [portableCompositeSealBrand]: true;
}

export interface FloodgateV7PortableCopyHeldRoleBundleClaim {
  readonly [portableHeldRoleBundleClaimBrand]: true;
}

export type FloodgateV7PortableCopyHeldRoleBundleFilename =
  (typeof FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES)[number];

export interface FloodgateV7PortableCopyHeldRoleBundleFileIdentity {
  readonly filename: FloodgateV7PortableCopyHeldRoleBundleFilename;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateV7PortableCopyHeldRoleBundleSnapshot {
  readonly files: readonly Readonly<FloodgateV7PortableCopyHeldRoleBundleFileIdentity>[];
  readonly manifestBytes: Uint8Array;
  readonly trainingRawBytes: Uint8Array;
}

export interface FloodgateV7PortableCopyHeldRoleBundleHooksForTests {
  readonly afterCompositePrecheck?: () => void | Promise<void>;
  readonly afterRootOpen?: () => void | Promise<void>;
  readonly afterFileOpen?: (
    filename: FloodgateV7PortableCopyHeldRoleBundleFilename,
    openedFiles: number,
  ) => void | Promise<void>;
  readonly beforeHandleClose?: (
    kind: "file" | "root",
    filename: FloodgateV7PortableCopyHeldRoleBundleFilename | null,
  ) => void | Promise<void>;
}

export interface FloodgateV7PortableCopyWitnessResult {
  readonly receipt: Readonly<FloodgateV7CleanRoomCopyReceipt>;
  readonly witness: FloodgateV7PortableCopyWitness;
}

type PortableCopyOperation =
  "preseal" | "seal" | "copy" | "composite" | "borrow" | "revoke";

export class FloodgateV7PortableCopyWitnessError extends Error {
  readonly contract = FLOODGATE_V7_PORTABLE_COPY_WITNESS_CONTRACT;
  readonly operation: PortableCopyOperation;
  readonly sensitive_values_disclosed = false;

  constructor(operation: PortableCopyOperation) {
    super("Floodgate v7 portable copy filesystem witness failed");
    this.name = "FloodgateV7PortableCopyWitnessError";
    this.operation = operation;
    Object.freeze(this);
  }
}

export class FloodgateV7CleanRoomCopyError extends Error {
  readonly phase: CopyPhase;
  readonly partial_destination_preserved: boolean;
  readonly retry_disposition:
    | "fresh-absent-destination-required"
    | "manual-clean-room-reconciliation-required";
  readonly sensitive_values_disclosed = false;

  constructor(phase: CopyPhase, partialDestinationPreserved: boolean) {
    super("Floodgate v7 clean-room copy failed");
    this.name = "FloodgateV7CleanRoomCopyError";
    this.phase = phase;
    this.partial_destination_preserved = partialDestinationPreserved;
    this.retry_disposition = partialDestinationPreserved
      ? "manual-clean-room-reconciliation-required"
      : "fresh-absent-destination-required";
    Object.freeze(this);
  }
}

export interface FloodgateV7CleanRoomCopyReceipt {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT;
  readonly status: typeof FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY;
  readonly execution_boundary: "non-production-copy-by-value-preparation";
  readonly copied: Readonly<{
    readonly directories: number;
    readonly files: number;
    readonly bytes: number;
    readonly source_revalidated_after_copy: true;
    readonly destination_revalidated_after_copy: true;
    readonly destination_files_single_link: true;
    readonly source_destination_inode_aliases: 0;
    readonly filesystem_clone_api_used: false;
    readonly file_copy_concurrency_limit: number;
    readonly per_file_fsync_used: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly source_path: false;
    readonly destination_path: false;
    readonly source_or_tree_digest: false;
    readonly crash_durable_copy: false;
    readonly dataset_semantics: false;
    readonly holdout_opened: false;
    readonly teacher_process: false;
    readonly teacher_label: false;
    readonly optimizer_training: false;
    readonly weight_changed: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7CleanRoomCopyDependencies {
  readonly effectiveUserId: number;
  readonly maxEntries?: number;
  readonly maxTotalBytes?: number;
  readonly maxConcurrencyForTests?: number;
  readonly afterSourceInventoryForTests?: () => void | Promise<void>;
  readonly afterFileCopiedForTests?: (
    relativePath: string,
  ) => void | Promise<void>;
  readonly beforeFinalRevalidationForTests?: () => void | Promise<void>;
  readonly closeCopiedFileHandleForTests?: (
    handle: fs.promises.FileHandle,
    kind: "source" | "destination",
  ) => void | Promise<void>;
}

interface StatIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly birthtimeNs: bigint;
}

interface InventoryFile {
  readonly relativePath: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly sourceMode: 0o400 | 0o500 | 0o600 | 0o700;
  readonly destinationMode: 0o600 | 0o700;
  readonly identity: Readonly<StatIdentity>;
}

interface TreeInventory {
  readonly rootIdentity: Readonly<StatIdentity>;
  readonly directories: readonly string[];
  readonly directoryIdentities: readonly Readonly<StatIdentity>[];
  readonly files: readonly Readonly<InventoryFile>[];
  readonly bytes: number;
  readonly sourceTreeSha256: string;
  readonly destinationTreeSha256: string;
}

interface FileInventory {
  readonly identity: Readonly<StatIdentity>;
  readonly sha256: string;
  readonly sourceMode: 0o400 | 0o500 | 0o600 | 0o700;
  readonly destinationMode: 0o600 | 0o700;
  readonly bytes: number;
}

type PortableInventory =
  | Readonly<{ readonly type: "tree"; readonly value: Readonly<TreeInventory> }>
  | Readonly<{
      readonly type: "file";
      readonly value: Readonly<FileInventory>;
    }>;

interface TreeCopyInternalResult {
  readonly receipt: Readonly<FloodgateV7CleanRoomCopyReceipt>;
  readonly sourceBefore: Readonly<TreeInventory>;
  readonly destinationAfter: Readonly<TreeInventory>;
}

interface FileCopyInternalResult {
  readonly receipt: Readonly<FloodgateV7CleanRoomCopyReceipt>;
  readonly sourceBefore: Readonly<FileInventory>;
  readonly destinationAfter: Readonly<FileInventory>;
}

interface ParentEntrySnapshot {
  readonly name: string;
  readonly type: "directory" | "file";
  readonly identity: Readonly<StatIdentity>;
}

interface ParentDirectorySnapshot {
  readonly path: string;
  readonly identity: Readonly<StatIdentity>;
  readonly entries: readonly Readonly<ParentEntrySnapshot>[];
}

interface CapturedDependencies {
  readonly effectiveUserId: number;
  readonly maxEntries: number;
  readonly maxTotalBytes: number;
  readonly maxConcurrency: number;
  readonly afterSourceInventory?: () => void | Promise<void>;
  readonly afterFileCopied?: (relativePath: string) => void | Promise<void>;
  readonly beforeFinalRevalidation?: () => void | Promise<void>;
  readonly closeCopiedFileHandle?: (
    handle: fs.promises.FileHandle,
    kind: "source" | "destination",
  ) => void | Promise<void>;
}

interface PortableSourcePresealState {
  readonly kind: FloodgateV7PortableCopyKind;
  readonly source: string;
  readonly destination: string;
  readonly dependencies: Readonly<CapturedDependencies>;
  readonly inventory: PortableInventory;
}

type PortableSourceSealState = PortableSourcePresealState;

interface PortableCopyWitnessState {
  readonly kind: FloodgateV7PortableCopyKind;
  readonly destination: string;
  readonly dependencies: Readonly<CapturedDependencies>;
  readonly destinationInventory: PortableInventory;
}

interface PortableCompositeSealState {
  readonly witnesses: readonly Readonly<PortableCopyWitnessState>[];
  readonly parents: readonly Readonly<ParentDirectorySnapshot>[];
  activeHeldRoleBundleClaim?: object;
  inUse: boolean;
  invalidated: boolean;
}

interface CapturedHeldRoleBundleHooks {
  readonly afterCompositePrecheck?: () => void | Promise<void>;
  readonly afterRootOpen?: () => void | Promise<void>;
  readonly afterFileOpen?: (
    filename: FloodgateV7PortableCopyHeldRoleBundleFilename,
    openedFiles: number,
  ) => void | Promise<void>;
  readonly beforeHandleClose?: (
    kind: "file" | "root",
    filename: FloodgateV7PortableCopyHeldRoleBundleFilename | null,
  ) => void | Promise<void>;
}

interface OpenedHeldRoleBundleFile {
  readonly close: () => Promise<void>;
  readonly filename: FloodgateV7PortableCopyHeldRoleBundleFilename;
  readonly identity: Readonly<InventoryFile>;
  readonly read: (
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ) => Promise<Readonly<{ bytesRead: number; buffer: Uint8Array }>>;
  readonly stat: () => Promise<fs.BigIntStats>;
  closeHookRun?: boolean;
  closed?: boolean;
  retainedBytes?: Buffer;
}

interface OpenedHeldRoleBundle {
  readonly files: OpenedHeldRoleBundleFile[];
  rootClose?: () => Promise<void>;
  rootCloseHookRun?: boolean;
  rootClosed?: boolean;
  rootIdentity?: Readonly<StatIdentity>;
  rootStat?: () => Promise<fs.BigIntStats>;
}

interface ActiveHeldRoleBundleClaimState {
  readonly composite: PortableCompositeSealState;
  readonly snapshot: Readonly<FloodgateV7PortableCopyHeldRoleBundleSnapshot>;
}

interface PortableRegistry {
  readonly presealedSources: WeakMap<object, PortableSourcePresealState>;
  readonly sealedSources: WeakMap<object, PortableSourceSealState>;
  readonly witnesses: WeakMap<object, PortableCopyWitnessState>;
  readonly compositeSeals: WeakMap<object, PortableCompositeSealState>;
  readonly activeHeldRoleBundleClaims: WeakMap<
    object,
    Readonly<ActiveHeldRoleBundleClaimState>
  >;
  readonly issuedHeldRoleBundleClaims: WeakMap<
    object,
    PortableCompositeSealState
  >;
  readonly issuedCompositeSeals: WeakSet<object>;
  readonly revokedCompositeSeals: WeakSet<object>;
}

function canonicalAbsolutePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    stringContains(value, "\0") ||
    stringContains(value, "\n") ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value
  ) {
    throw new Error("path differs");
  }
  return value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error("integer differs");
  }
  return value;
}

function allowedDependencyKey(value: string): boolean {
  return (
    value === "effectiveUserId" ||
    value === "maxEntries" ||
    value === "maxTotalBytes" ||
    value === "maxConcurrencyForTests" ||
    value === "afterSourceInventoryForTests" ||
    value === "afterFileCopiedForTests" ||
    value === "beforeFinalRevalidationForTests" ||
    value === "closeCopiedFileHandleForTests"
  );
}

function captureDependencies(
  value: FloodgateV7CleanRoomCopyDependencies,
): Readonly<CapturedDependencies> {
  if (
    value === null ||
    typeof value !== "object" ||
    isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error("dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length < 1 ||
    someArrayItem(
      keys,
      (key) =>
        typeof key !== "string" ||
        !allowedDependencyKey(key) ||
        !("value" in descriptors[key]),
    ) ||
    !("effectiveUserId" in descriptors) ||
    !("value" in descriptors.effectiveUserId)
  ) {
    throw new Error("dependency keys differ");
  }
  const valueOf = (key: string): unknown => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  };
  const effectiveUserId = boundedInteger(
    valueOf("effectiveUserId"),
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const maxEntriesValue = valueOf("maxEntries");
  const maxEntries =
    maxEntriesValue === undefined
      ? DEFAULT_MAX_ENTRIES
      : boundedInteger(maxEntriesValue, 1, DEFAULT_MAX_ENTRIES);
  const maxTotalBytesValue = valueOf("maxTotalBytes");
  const maxTotalBytes =
    maxTotalBytesValue === undefined
      ? DEFAULT_MAX_TOTAL_BYTES
      : boundedInteger(maxTotalBytesValue, 1, DEFAULT_MAX_TOTAL_BYTES);
  const maxConcurrencyValue = valueOf("maxConcurrencyForTests");
  const maxConcurrency =
    maxConcurrencyValue === undefined
      ? FLOODGATE_V7_CLEAN_ROOM_COPY_CONCURRENCY
      : boundedInteger(
          maxConcurrencyValue,
          1,
          FLOODGATE_V7_CLEAN_ROOM_COPY_CONCURRENCY,
        );
  const afterSourceInventory = valueOf("afterSourceInventoryForTests");
  const afterFileCopied = valueOf("afterFileCopiedForTests");
  const beforeFinalRevalidation = valueOf("beforeFinalRevalidationForTests");
  const closeCopiedFileHandle = valueOf("closeCopiedFileHandleForTests");
  for (const [callback, arity] of [
    [afterSourceInventory, 0],
    [afterFileCopied, 1],
    [beforeFinalRevalidation, 0],
    [closeCopiedFileHandle, 2],
  ] as const) {
    const callbackDescriptors =
      typeof callback === "function" && !nodeUtilTypes.isProxy(callback)
        ? objectGetOwnPropertyDescriptors(callback)
        : undefined;
    const lengthDescriptor = callbackDescriptors?.length;
    if (
      callback !== undefined &&
      (typeof callback !== "function" ||
        nodeUtilTypes.isProxy(callback) ||
        lengthDescriptor === undefined ||
        !("value" in lengthDescriptor) ||
        lengthDescriptor.value !== arity)
    ) {
      throw new Error("callback differs");
    }
  }
  return Object.freeze({
    effectiveUserId,
    maxEntries,
    maxTotalBytes,
    maxConcurrency,
    ...(afterSourceInventory === undefined
      ? {}
      : {
          afterSourceInventory:
            afterSourceInventory as () => void | Promise<void>,
        }),
    ...(afterFileCopied === undefined
      ? {}
      : {
          afterFileCopied: afterFileCopied as (
            relativePath: string,
          ) => void | Promise<void>,
        }),
    ...(beforeFinalRevalidation === undefined
      ? {}
      : {
          beforeFinalRevalidation:
            beforeFinalRevalidation as () => void | Promise<void>,
        }),
    ...(closeCopiedFileHandle === undefined
      ? {}
      : {
          closeCopiedFileHandle: closeCopiedFileHandle as (
            handle: fs.promises.FileHandle,
            kind: "source" | "destination",
          ) => void | Promise<void>,
        }),
  });
}

function snapshot(stat: fs.BigIntStats): Readonly<StatIdentity> {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
    birthtimeNs: stat.birthtimeNs,
  });
}

function sameStat(
  expected: Readonly<StatIdentity>,
  actual: fs.BigIntStats,
): boolean {
  return (
    expected.dev === actual.dev &&
    expected.ino === actual.ino &&
    expected.mode === actual.mode &&
    expected.nlink === actual.nlink &&
    expected.uid === actual.uid &&
    expected.size === actual.size &&
    expected.mtimeNs === actual.mtimeNs &&
    expected.ctimeNs === actual.ctimeNs &&
    expected.birthtimeNs === actual.birthtimeNs
  );
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function validateBasename(value: string): void {
  if (
    value === "." ||
    value === ".." ||
    !SAFE_BASENAME_RE.test(value) ||
    Buffer.byteLength(value, "utf8") > 255
  ) {
    throw new Error("entry name differs");
  }
}

async function assertPrivateRealDirectory(
  directory: string,
  effectiveUserId: number,
): Promise<Readonly<StatIdentity>> {
  const real = await fs.promises.realpath(directory);
  const stat = await fs.promises.lstat(directory, { bigint: true });
  if (
    real !== directory ||
    !stat.isDirectory() ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_MASK) !== DIRECTORY_MODE
  ) {
    throw new Error("private directory differs");
  }
  return snapshot(stat);
}

function sourceFileMode(stat: fs.BigIntStats): 0o400 | 0o500 | 0o600 | 0o700 {
  const mode = Number(stat.mode & MODE_MASK);
  if (mode !== 0o400 && mode !== 0o500 && mode !== 0o600 && mode !== 0o700) {
    throw new Error("source file mode differs");
  }
  return mode;
}

async function hashHeldRegularFile(
  file: string,
  expectedUserId: number,
  chunk: Buffer,
): Promise<Readonly<{ identity: Readonly<StatIdentity>; sha256: string }>> {
  if (chunk.byteLength !== READ_CHUNK_BYTES) {
    throw new Error("hash chunk size differs");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new Error("O_NOFOLLOW unavailable");
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.uid !== BigInt(expectedUserId) ||
      before.nlink !== BigInt(1) ||
      before.size < BigInt(0) ||
      before.size >= BigInt(MAX_FILE_BYTES)
    ) {
      throw new Error("source file metadata differs");
    }
    sourceFileMode(before);
    const digest = createHash("sha256");
    let offset = 0;
    while (offset < Number(before.size)) {
      const wanted = Math.min(chunk.byteLength, Number(before.size) - offset);
      const { bytesRead } = await handle.read(chunk, 0, wanted, offset);
      if (bytesRead !== wanted) throw new Error("source read shortened");
      digest.update(chunk.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const named = await fs.promises.lstat(file, { bigint: true });
    const identity = snapshot(before);
    if (
      !sameStat(identity, after) ||
      !sameStat(identity, named) ||
      (await fs.promises.realpath(file)) !== file
    ) {
      throw new Error("source file changed");
    }
    return Object.freeze({ identity, sha256: digest.digest("hex") });
  } finally {
    await handle.close();
  }
}

function digestInventory(
  directories: readonly string[],
  files: readonly Readonly<InventoryFile>[],
  destinationModes: boolean,
): string {
  const digest = createHash("sha256");
  digest.update(
    destinationModes
      ? "shogi-floodgate-v7-clean-room-destination-tree-v1\0"
      : "shogi-floodgate-v7-clean-room-source-tree-v1\0",
    "utf8",
  );
  for (const directory of directories) {
    digest.update(`d\0${directory}\0${DIRECTORY_MODE.toString(8)}\0`, "utf8");
  }
  for (const file of files) {
    const mode = destinationModes ? file.destinationMode : file.sourceMode;
    digest.update(
      `f\0${file.relativePath}\0${mode.toString(8)}\0${file.bytes.toString(10)}\0${file.sha256}\0`,
      "utf8",
    );
  }
  return digest.digest("hex");
}

async function inventoryTree(
  root: string,
  dependencies: Readonly<CapturedDependencies>,
  expectedDestinationModes: boolean,
): Promise<Readonly<TreeInventory>> {
  const rootIdentity = await assertPrivateRealDirectory(
    root,
    dependencies.effectiveUserId,
  );
  const directories: string[] = [];
  const directoryIdentities: StatIdentity[] = [];
  const files: InventoryFile[] = [];
  let bytes = 0;
  const hashChunk = Buffer.alloc(READ_CHUNK_BYTES);

  const walk = async (
    absolute: string,
    relative: string,
    depth: number,
  ): Promise<void> => {
    if (depth > MAX_DIRECTORY_DEPTH) {
      throw new Error("directory depth limit exceeded");
    }
    const entries = await fs.promises.readdir(absolute, {
      withFileTypes: true,
    });
    sortArrayItems(entries, (left, right) =>
      compareUtf8(left.name, right.name),
    );
    for (const entry of entries) {
      validateBasename(entry.name);
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative =
        relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      if (directories.length + files.length >= dependencies.maxEntries) {
        throw new Error("entry limit exceeded");
      }
      if (entry.isDirectory()) {
        if ((await fs.promises.realpath(childAbsolute)) !== childAbsolute) {
          throw new Error("directory alias differs");
        }
        pushArrayItem(
          directoryIdentities,
          await assertPrivateRealDirectory(
            childAbsolute,
            dependencies.effectiveUserId,
          ),
        );
        pushArrayItem(directories, childRelative);
        await walk(childAbsolute, childRelative, depth + 1);
        continue;
      }
      if (!entry.isFile()) throw new Error("unsupported tree entry");
      const hashed = await hashHeldRegularFile(
        childAbsolute,
        dependencies.effectiveUserId,
        hashChunk,
      );
      const mode = sourceFileMode(
        await fs.promises.lstat(childAbsolute, { bigint: true }),
      );
      const destinationMode =
        (mode & 0o100) === 0 ? PRIVATE_FILE_MODE : PRIVATE_EXECUTABLE_MODE;
      bytes += Number(hashed.identity.size);
      if (bytes > dependencies.maxTotalBytes) {
        throw new Error("byte limit exceeded");
      }
      pushArrayItem(
        files,
        Object.freeze({
          relativePath: childRelative,
          bytes: Number(hashed.identity.size),
          sha256: hashed.sha256,
          sourceMode: expectedDestinationModes ? destinationMode : mode,
          destinationMode,
          identity: hashed.identity,
        }),
      );
    }
  };

  try {
    await walk(root, "", 0);
    return Object.freeze({
      rootIdentity,
      directories: Object.freeze(directories),
      directoryIdentities: Object.freeze(directoryIdentities),
      files: Object.freeze(files),
      bytes,
      sourceTreeSha256: digestInventory(directories, files, false),
      destinationTreeSha256: digestInventory(directories, files, true),
    });
  } finally {
    hashChunk.fill(0);
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const noFollow = fs.constants.O_NOFOLLOW;
  const directoryFlag = fs.constants.O_DIRECTORY;
  if (typeof noFollow !== "number" || typeof directoryFlag !== "number") {
    throw new Error("directory synchronization unsupported");
  }
  const handle = await fs.promises.open(
    directory,
    fs.constants.O_RDONLY | directoryFlag | noFollow,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function copyInventoryFile(
  source: string,
  destination: string,
  file: Readonly<InventoryFile>,
  dependencies: Readonly<CapturedDependencies>,
  chunk: Buffer,
): Promise<void> {
  if (chunk.byteLength !== READ_CHUNK_BYTES) {
    throw new Error("copy chunk size differs");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new Error("O_NOFOLLOW unavailable");
  const sourceHandle = await fs.promises.open(
    source,
    fs.constants.O_RDONLY | noFollow,
  );
  let destinationHandle: fs.promises.FileHandle | undefined;
  let primaryFailed = false;
  let primary: unknown;
  try {
    const sourceBefore = await sourceHandle.stat({ bigint: true });
    if (!sameStat(file.identity, sourceBefore)) {
      throw new Error("source changed before copy");
    }
    destinationHandle = await fs.promises.open(
      destination,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        noFollow,
      file.destinationMode,
    );
    await destinationHandle.chmod(file.destinationMode);
    const digest = createHash("sha256");
    let offset = 0;
    while (offset < file.bytes) {
      const wanted = Math.min(chunk.byteLength, file.bytes - offset);
      const { bytesRead } = await sourceHandle.read(chunk, 0, wanted, offset);
      if (bytesRead !== wanted) throw new Error("copy read shortened");
      digest.update(chunk.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        const result = await destinationHandle.write(
          chunk,
          written,
          bytesRead - written,
          offset + written,
        );
        if (result.bytesWritten <= 0) throw new Error("copy write shortened");
        written += result.bytesWritten;
      }
      offset += bytesRead;
    }
    if (digest.digest("hex") !== file.sha256) {
      throw new Error("copied source digest differs");
    }
    const sourceAfter = await sourceHandle.stat({ bigint: true });
    const destinationAfter = await destinationHandle.stat({ bigint: true });
    if (
      !sameStat(file.identity, sourceAfter) ||
      !destinationAfter.isFile() ||
      destinationAfter.uid !== BigInt(dependencies.effectiveUserId) ||
      destinationAfter.nlink !== BigInt(1) ||
      (destinationAfter.mode & MODE_MASK) !== BigInt(file.destinationMode) ||
      destinationAfter.size !== BigInt(file.bytes) ||
      (sourceAfter.dev === destinationAfter.dev &&
        sourceAfter.ino === destinationAfter.ino)
    ) {
      throw new Error("copy identity differs");
    }
  } catch (error) {
    primaryFailed = true;
    primary = error;
  }
  const closeHandle = async (
    handle: fs.promises.FileHandle,
    kind: "source" | "destination",
  ): Promise<void> => {
    if (dependencies.closeCopiedFileHandle !== undefined) {
      await dependencies.closeCopiedFileHandle(handle, kind);
      return;
    }
    await handle.close();
  };
  const closeResults = await Promise.allSettled([
    closeHandle(sourceHandle, "source"),
    ...(destinationHandle === undefined
      ? []
      : [closeHandle(destinationHandle, "destination")]),
  ]);
  if (primaryFailed) {
    throw primary;
  }
  if (someArrayItem(closeResults, (result) => result.status === "rejected")) {
    throw new Error("copy descriptor cleanup failed");
  }
}

class BoundedCopyFailure extends Error {
  readonly copyPhase: "copy" | "callback";

  constructor(copyPhase: "copy" | "callback") {
    super("bounded clean-room copy operation failed");
    this.name = "BoundedCopyFailure";
    this.copyPhase = copyPhase;
    Object.freeze(this);
  }
}

async function copyInventoryFilesBounded(
  sourceRoot: string,
  destinationRoot: string,
  files: readonly Readonly<InventoryFile>[],
  dependencies: Readonly<CapturedDependencies>,
): Promise<void> {
  let nextIndex = 0;
  let failureObserved = false;
  let firstFailure: BoundedCopyFailure | undefined;
  const worker = async (): Promise<void> => {
    const workerChunk = Buffer.alloc(READ_CHUNK_BYTES);
    try {
      while (!failureObserved) {
        const index = nextIndex;
        if (index >= files.length) return;
        nextIndex += 1;
        const file = files[index];
        try {
          await copyInventoryFile(
            path.join(sourceRoot, ...splitString(file.relativePath, "/")),
            path.join(destinationRoot, ...splitString(file.relativePath, "/")),
            file,
            dependencies,
            workerChunk,
          );
        } catch {
          if (!failureObserved) {
            failureObserved = true;
            firstFailure = new BoundedCopyFailure("copy");
          }
          return;
        }
        try {
          await dependencies.afterFileCopied?.(file.relativePath);
        } catch {
          if (!failureObserved) {
            failureObserved = true;
            firstFailure = new BoundedCopyFailure("callback");
          }
          return;
        }
      }
    } finally {
      workerChunk.fill(0);
    }
  };
  const workerCount = Math.min(dependencies.maxConcurrency, files.length);
  const workers: Promise<void>[] = [];
  for (let index = 0; index < workerCount; index += 1) {
    pushArrayItem(workers, worker());
  }
  const workerResults = await Promise.allSettled(workers);
  if (
    !failureObserved &&
    someArrayItem(workerResults, (result) => result.status === "rejected")
  ) {
    failureObserved = true;
    firstFailure = new BoundedCopyFailure("copy");
  }
  if (failureObserved) {
    throw firstFailure ?? new BoundedCopyFailure("copy");
  }
}

function sameInventory(
  before: Readonly<TreeInventory>,
  after: Readonly<TreeInventory>,
): boolean {
  return (
    sameIdentity(before.rootIdentity, after.rootIdentity) &&
    before.directories.length === after.directories.length &&
    before.directoryIdentities.length === after.directoryIdentities.length &&
    before.files.length === after.files.length &&
    before.bytes === after.bytes &&
    before.sourceTreeSha256 === after.sourceTreeSha256 &&
    everyArrayItem(
      before.directories,
      (directory, index) =>
        directory === after.directories[index] &&
        sameIdentity(
          before.directoryIdentities[index],
          after.directoryIdentities[index],
        ),
    ) &&
    everyArrayItem(
      before.files,
      (file, index) =>
        file.relativePath === after.files[index]?.relativePath &&
        sameIdentity(file.identity, after.files[index]?.identity),
    )
  );
}

function sameIdentity(
  left: Readonly<StatIdentity> | undefined,
  right: Readonly<StatIdentity> | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.birthtimeNs === right.birthtimeNs
  );
}

function pathsOverlap(left: string, right: string): boolean {
  const leftToRight = path.relative(left, right);
  const rightToLeft = path.relative(right, left);
  const contained = (relative: string): boolean =>
    relative === "" ||
    (relative !== ".." &&
      !stringBeginsWith(relative, `..${path.sep}`) &&
      !path.isAbsolute(relative));
  return contained(leftToRight) || contained(rightToLeft);
}

async function copyFloodgateV7CleanRoomTreeByValueInternal(
  argumentCount: number,
  sourceRootValue: string,
  destinationRootValue: string,
  dependenciesValue: FloodgateV7CleanRoomCopyDependencies,
): Promise<Readonly<TreeCopyInternalResult>> {
  let phase: CopyPhase = "capture";
  let destinationCreated = false;
  try {
    if (argumentCount !== 3) throw new Error("argument count differs");
    const sourceRoot = canonicalAbsolutePath(sourceRootValue);
    const destinationRoot = canonicalAbsolutePath(destinationRootValue);
    const dependencies = captureDependencies(dependenciesValue);
    const destinationParent = path.dirname(destinationRoot);
    if (
      destinationParent === destinationRoot ||
      pathsOverlap(sourceRoot, destinationRoot)
    ) {
      throw new Error("copy namespaces overlap");
    }
    await assertPrivateRealDirectory(
      destinationParent,
      dependencies.effectiveUserId,
    );
    phase = "source-inventory";
    const before = await inventoryTree(sourceRoot, dependencies, false);
    phase = "callback";
    await dependencies.afterSourceInventory?.();
    phase = "namespace";
    // An EEXIST failure still means evidence is present at this location and
    // must be reconciled manually rather than treated as an absent target.
    destinationCreated = true;
    await fs.promises.mkdir(destinationRoot, {
      mode: PRIVATE_EXECUTABLE_MODE,
    });
    await fs.promises.chmod(destinationRoot, PRIVATE_EXECUTABLE_MODE);
    await assertPrivateRealDirectory(
      destinationRoot,
      dependencies.effectiveUserId,
    );
    for (const relativeDirectory of before.directories) {
      const directory = path.join(
        destinationRoot,
        ...splitString(relativeDirectory, "/"),
      );
      await fs.promises.mkdir(directory, { mode: PRIVATE_EXECUTABLE_MODE });
      await fs.promises.chmod(directory, PRIVATE_EXECUTABLE_MODE);
    }
    phase = "copy";
    try {
      await copyInventoryFilesBounded(
        sourceRoot,
        destinationRoot,
        before.files,
        dependencies,
      );
    } catch (error) {
      if (error instanceof BoundedCopyFailure) {
        phase = error.copyPhase;
      }
      throw error;
    }
    for (const relativeDirectory of reverseArrayItems([
      ...before.directories,
    ])) {
      await syncDirectory(
        path.join(destinationRoot, ...splitString(relativeDirectory, "/")),
      );
    }
    await syncDirectory(destinationRoot);
    await syncDirectory(destinationParent);
    phase = "callback";
    await dependencies.beforeFinalRevalidation?.();
    phase = "revalidation";
    const sourceAfter = await inventoryTree(sourceRoot, dependencies, false);
    const destinationAfter = await inventoryTree(
      destinationRoot,
      dependencies,
      true,
    );
    if (
      !sameInventory(before, sourceAfter) ||
      before.directories.length !== destinationAfter.directories.length ||
      before.files.length !== destinationAfter.files.length ||
      before.bytes !== destinationAfter.bytes ||
      before.destinationTreeSha256 !== destinationAfter.destinationTreeSha256
    ) {
      throw new Error("final tree identity differs");
    }
    const receipt = Object.freeze({
      contract: FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
      status: FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS,
      claim_boundary: FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY,
      execution_boundary: "non-production-copy-by-value-preparation" as const,
      copied: Object.freeze({
        directories: before.directories.length,
        files: before.files.length,
        bytes: before.bytes,
        source_revalidated_after_copy: true as const,
        destination_revalidated_after_copy: true as const,
        destination_files_single_link: true as const,
        source_destination_inode_aliases: 0 as const,
        filesystem_clone_api_used: false as const,
        file_copy_concurrency_limit: dependencies.maxConcurrency,
        per_file_fsync_used: false as const,
      }),
      nonclaims: Object.freeze({
        source_path: false as const,
        destination_path: false as const,
        source_or_tree_digest: false as const,
        crash_durable_copy: false as const,
        dataset_semantics: false as const,
        holdout_opened: false as const,
        teacher_process: false as const,
        teacher_label: false as const,
        optimizer_training: false as const,
        weight_changed: false as const,
        live_evaluation_activation: false as const,
        match: false as const,
        playing_strength: false as const,
      }),
    });
    return Object.freeze({
      receipt,
      sourceBefore: before,
      destinationAfter,
    });
  } catch {
    throw new FloodgateV7CleanRoomCopyError(phase, destinationCreated);
  }
}

/**
 * Testable generic core. The eventual operator entry point supplies only fixed
 * paths and bounds; no operator-controlled path reaches this function.
 */
export async function copyFloodgateV7CleanRoomTreeByValueCoreForTests(
  sourceRootValue: string,
  destinationRootValue: string,
  dependenciesValue: FloodgateV7CleanRoomCopyDependencies,
): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
  return (
    await copyFloodgateV7CleanRoomTreeByValueInternal(
      arguments.length,
      sourceRootValue,
      destinationRootValue,
      dependenciesValue,
    )
  ).receipt;
}

/**
 * Single-file companion used for the separately stored legacy exclusion input.
 * The destination parent must already be an exact private directory.
 */
async function copyFloodgateV7CleanRoomFileByValueInternal(
  argumentCount: number,
  sourceFileValue: string,
  destinationFileValue: string,
  dependenciesValue: FloodgateV7CleanRoomCopyDependencies,
): Promise<Readonly<FileCopyInternalResult>> {
  let phase: CopyPhase = "capture";
  let destinationCreated = false;
  let operationChunk: Buffer | undefined;
  try {
    if (argumentCount !== 3) throw new Error("argument count differs");
    const sourceFile = canonicalAbsolutePath(sourceFileValue);
    const destinationFile = canonicalAbsolutePath(destinationFileValue);
    const dependencies = captureDependencies(dependenciesValue);
    const sourceParent = path.dirname(sourceFile);
    const destinationParent = path.dirname(destinationFile);
    if (
      sourceFile === destinationFile ||
      path.basename(sourceFile) !== path.basename(destinationFile)
    ) {
      throw new Error("file copy binding differs");
    }
    validateBasename(path.basename(sourceFile));
    await assertPrivateRealDirectory(
      destinationParent,
      dependencies.effectiveUserId,
    );
    operationChunk = Buffer.alloc(READ_CHUNK_BYTES);
    phase = "source-inventory";
    const before = await hashHeldRegularFile(
      sourceFile,
      dependencies.effectiveUserId,
      operationChunk,
    );
    const sourceStat = await fs.promises.lstat(sourceFile, { bigint: true });
    const sourceMode = sourceFileMode(sourceStat);
    const destinationMode =
      (sourceMode & 0o100) === 0 ? PRIVATE_FILE_MODE : PRIVATE_EXECUTABLE_MODE;
    const file = Object.freeze({
      relativePath: path.basename(sourceFile),
      bytes: Number(before.identity.size),
      sha256: before.sha256,
      sourceMode,
      destinationMode,
      identity: before.identity,
    });
    if (file.bytes > dependencies.maxTotalBytes) {
      throw new Error("byte limit exceeded");
    }
    phase = "callback";
    await dependencies.afterSourceInventory?.();
    phase = "copy";
    destinationCreated = true;
    await copyInventoryFile(
      path.join(sourceParent, file.relativePath),
      path.join(destinationParent, file.relativePath),
      file,
      dependencies,
      operationChunk,
    );
    phase = "callback";
    await dependencies.afterFileCopied?.(file.relativePath);
    await dependencies.beforeFinalRevalidation?.();
    phase = "revalidation";
    const sourceAfter = await hashHeldRegularFile(
      sourceFile,
      dependencies.effectiveUserId,
      operationChunk,
    );
    const destinationAfter = await hashHeldRegularFile(
      destinationFile,
      dependencies.effectiveUserId,
      operationChunk,
    );
    if (
      !sameIdentity(before.identity, sourceAfter.identity) ||
      before.sha256 !== sourceAfter.sha256 ||
      before.sha256 !== destinationAfter.sha256 ||
      destinationAfter.identity.nlink !== BigInt(1) ||
      (destinationAfter.identity.mode & MODE_MASK) !==
        BigInt(destinationMode) ||
      (before.identity.dev === destinationAfter.identity.dev &&
        before.identity.ino === destinationAfter.identity.ino)
    ) {
      throw new Error("final file identity differs");
    }
    await syncDirectory(destinationParent);
    const receipt = Object.freeze({
      contract: FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
      status: FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS,
      claim_boundary: FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY,
      execution_boundary: "non-production-copy-by-value-preparation" as const,
      copied: Object.freeze({
        directories: 0,
        files: 1,
        bytes: file.bytes,
        source_revalidated_after_copy: true as const,
        destination_revalidated_after_copy: true as const,
        destination_files_single_link: true as const,
        source_destination_inode_aliases: 0 as const,
        filesystem_clone_api_used: false as const,
        file_copy_concurrency_limit: 1,
        per_file_fsync_used: false as const,
      }),
      nonclaims: Object.freeze({
        source_path: false as const,
        destination_path: false as const,
        source_or_tree_digest: false as const,
        crash_durable_copy: false as const,
        dataset_semantics: false as const,
        holdout_opened: false as const,
        teacher_process: false as const,
        teacher_label: false as const,
        optimizer_training: false as const,
        weight_changed: false as const,
        live_evaluation_activation: false as const,
        match: false as const,
        playing_strength: false as const,
      }),
    });
    return Object.freeze({
      receipt,
      sourceBefore: Object.freeze({
        identity: before.identity,
        sha256: before.sha256,
        sourceMode,
        destinationMode,
        bytes: file.bytes,
      }),
      destinationAfter: Object.freeze({
        identity: destinationAfter.identity,
        sha256: destinationAfter.sha256,
        sourceMode: destinationMode,
        destinationMode,
        bytes: file.bytes,
      }),
    });
  } catch {
    throw new FloodgateV7CleanRoomCopyError(phase, destinationCreated);
  } finally {
    operationChunk?.fill(0);
  }
}

export async function copyFloodgateV7CleanRoomFileByValueCoreForTests(
  sourceFileValue: string,
  destinationFileValue: string,
  dependenciesValue: FloodgateV7CleanRoomCopyDependencies,
): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
  return (
    await copyFloodgateV7CleanRoomFileByValueInternal(
      arguments.length,
      sourceFileValue,
      destinationFileValue,
      dependenciesValue,
    )
  ).receipt;
}

function portableKind(value: unknown): FloodgateV7PortableCopyKind {
  if (
    value !== "raw-lock-tree" &&
    value !== "role-lock-tree" &&
    value !== "role-bundle-tree" &&
    value !== "legacy-file"
  ) {
    throw new Error("portable copy kind differs");
  }
  return value;
}

function kindInventoryType(
  kind: FloodgateV7PortableCopyKind,
): PortableInventory["type"] {
  return kind === "legacy-file" ? "file" : "tree";
}

function filesystemOnlyDependencies(
  dependencies: Readonly<CapturedDependencies>,
): Readonly<CapturedDependencies> {
  return Object.freeze({
    effectiveUserId: dependencies.effectiveUserId,
    maxEntries: dependencies.maxEntries,
    maxTotalBytes: dependencies.maxTotalBytes,
    maxConcurrency: dependencies.maxConcurrency,
  });
}

function publicCopyDependencies(
  dependencies: Readonly<CapturedDependencies>,
): Readonly<FloodgateV7CleanRoomCopyDependencies> {
  return Object.freeze({
    effectiveUserId: dependencies.effectiveUserId,
    maxEntries: dependencies.maxEntries,
    maxTotalBytes: dependencies.maxTotalBytes,
    maxConcurrencyForTests: dependencies.maxConcurrency,
    ...(dependencies.afterSourceInventory === undefined
      ? {}
      : {
          afterSourceInventoryForTests: dependencies.afterSourceInventory,
        }),
    ...(dependencies.afterFileCopied === undefined
      ? {}
      : {
          afterFileCopiedForTests: dependencies.afterFileCopied,
        }),
    ...(dependencies.beforeFinalRevalidation === undefined
      ? {}
      : {
          beforeFinalRevalidationForTests: dependencies.beforeFinalRevalidation,
        }),
    ...(dependencies.closeCopiedFileHandle === undefined
      ? {}
      : {
          closeCopiedFileHandleForTests: dependencies.closeCopiedFileHandle,
        }),
  });
}

function sameFileInventory(
  before: Readonly<FileInventory> | undefined,
  after: Readonly<FileInventory> | undefined,
): boolean {
  return (
    before !== undefined &&
    after !== undefined &&
    sameIdentity(before.identity, after.identity) &&
    before.sha256 === after.sha256 &&
    before.sourceMode === after.sourceMode &&
    before.destinationMode === after.destinationMode &&
    before.bytes === after.bytes
  );
}

function samePortableInventory(
  before: PortableInventory,
  after: PortableInventory,
): boolean {
  if (before.type !== after.type) return false;
  return before.type === "tree" && after.type === "tree"
    ? sameInventory(before.value, after.value)
    : before.type === "file" && after.type === "file"
      ? sameFileInventory(before.value, after.value)
      : false;
}

async function inventoryStandaloneFile(
  file: string,
  dependencies: Readonly<CapturedDependencies>,
  expectedDestinationMode: boolean,
): Promise<Readonly<FileInventory>> {
  const chunk = Buffer.alloc(READ_CHUNK_BYTES);
  try {
    const hashed = await hashHeldRegularFile(
      file,
      dependencies.effectiveUserId,
      chunk,
    );
    const named = await fs.promises.lstat(file, { bigint: true });
    if (!sameStat(hashed.identity, named)) {
      throw new Error("standalone file identity differs");
    }
    const capturedSourceMode = sourceFileMode(named);
    const destinationMode =
      (capturedSourceMode & 0o100) === 0
        ? PRIVATE_FILE_MODE
        : PRIVATE_EXECUTABLE_MODE;
    const sourceMode = expectedDestinationMode
      ? destinationMode
      : capturedSourceMode;
    const bytes = Number(hashed.identity.size);
    if (bytes > dependencies.maxTotalBytes) {
      throw new Error("byte limit exceeded");
    }
    return Object.freeze({
      identity: hashed.identity,
      sha256: hashed.sha256,
      sourceMode,
      destinationMode,
      bytes,
    });
  } finally {
    chunk.fill(0);
  }
}

async function capturePortableInventory(
  kind: FloodgateV7PortableCopyKind,
  location: string,
  dependencies: Readonly<CapturedDependencies>,
  expectedDestinationModes: boolean,
): Promise<PortableInventory> {
  return kindInventoryType(kind) === "tree"
    ? Object.freeze({
        type: "tree" as const,
        value: await inventoryTree(
          location,
          filesystemOnlyDependencies(dependencies),
          expectedDestinationModes,
        ),
      })
    : Object.freeze({
        type: "file" as const,
        value: await inventoryStandaloneFile(
          location,
          filesystemOnlyDependencies(dependencies),
          expectedDestinationModes,
        ),
      });
}

function opaqueCapability<T>(): T {
  return Object.freeze(Object.create(null)) as T;
}

function sameParentSnapshot(
  before: Readonly<ParentDirectorySnapshot>,
  after: Readonly<ParentDirectorySnapshot>,
): boolean {
  return (
    before.path === after.path &&
    sameIdentity(before.identity, after.identity) &&
    before.entries.length === after.entries.length &&
    everyArrayItem(
      before.entries,
      (entry, index) =>
        entry.name === after.entries[index]?.name &&
        entry.type === after.entries[index]?.type &&
        sameIdentity(entry.identity, after.entries[index]?.identity),
    )
  );
}

async function captureParentDirectory(
  parent: string,
  effectiveUserId: number,
  maxEntries: number,
): Promise<Readonly<ParentDirectorySnapshot>> {
  const identity = await assertPrivateRealDirectory(parent, effectiveUserId);
  const directory = await fs.promises.opendir(parent);
  const dirents: fs.Dirent[] = [];
  try {
    for (;;) {
      const dirent = await directory.read();
      if (dirent === null) break;
      if (dirents.length >= maxEntries) {
        throw new Error("parent entry limit exceeded");
      }
      pushArrayItem(dirents, dirent);
    }
  } finally {
    await directory.close();
  }
  sortArrayItems(dirents, (left, right) => compareUtf8(left.name, right.name));
  const entries: ParentEntrySnapshot[] = [];
  for (const dirent of dirents) {
    validateBasename(dirent.name);
    if (!dirent.isDirectory() && !dirent.isFile()) {
      throw new Error("parent entry type differs");
    }
    const entryPath = path.join(parent, dirent.name);
    const stat = await fs.promises.lstat(entryPath, { bigint: true });
    if (
      stat.uid !== BigInt(effectiveUserId) ||
      (dirent.isFile() && stat.nlink !== BigInt(1)) ||
      (await fs.promises.realpath(entryPath)) !== entryPath ||
      (dirent.isDirectory() ? !stat.isDirectory() : !stat.isFile())
    ) {
      throw new Error("parent entry identity differs");
    }
    pushArrayItem(
      entries,
      Object.freeze({
        name: dirent.name,
        type: dirent.isDirectory() ? ("directory" as const) : ("file" as const),
        identity: snapshot(stat),
      }),
    );
  }
  const after = await fs.promises.lstat(parent, { bigint: true });
  if (
    !sameStat(identity, after) ||
    (await fs.promises.realpath(parent)) !== parent
  ) {
    throw new Error("parent directory changed");
  }
  return Object.freeze({
    path: parent,
    identity,
    entries: Object.freeze(entries),
  });
}

async function captureParents(
  witnesses: readonly Readonly<PortableCopyWitnessState>[],
): Promise<readonly Readonly<ParentDirectorySnapshot>[]> {
  const parentBounds: Array<
    Readonly<{
      parent: string;
      effectiveUserId: number;
      maxEntries: number;
    }>
  > = [];
  for (const witness of witnesses) {
    const parent = path.dirname(witness.destination);
    let priorIndex = -1;
    for (let index = 0; index < parentBounds.length; index += 1) {
      if (parentBounds[index]?.parent === parent) {
        priorIndex = index;
        break;
      }
    }
    const prior =
      priorIndex === -1
        ? undefined
        : (parentBounds[priorIndex] as
            | Readonly<{
                parent: string;
                effectiveUserId: number;
                maxEntries: number;
              }>
            | undefined);
    if (
      prior !== undefined &&
      prior.effectiveUserId !== witness.dependencies.effectiveUserId
    ) {
      throw new Error("shared parent owner differs");
    }
    const captured = Object.freeze({
      parent,
      effectiveUserId: witness.dependencies.effectiveUserId,
      maxEntries:
        prior === undefined
          ? witness.dependencies.maxEntries
          : Math.min(prior.maxEntries, witness.dependencies.maxEntries),
    });
    if (priorIndex === -1) {
      pushArrayItem(parentBounds, captured);
    } else {
      parentBounds[priorIndex] = captured;
    }
  }
  sortArrayItems(parentBounds, (left, right) =>
    compareUtf8(left.parent, right.parent),
  );
  return Object.freeze(
    await Promise.all(
      mapArrayItems(parentBounds, (bounds) =>
        captureParentDirectory(
          bounds.parent,
          bounds.effectiveUserId,
          bounds.maxEntries,
        ),
      ),
    ),
  );
}

async function captureWitnessDestinations(
  witnesses: readonly Readonly<PortableCopyWitnessState>[],
): Promise<readonly PortableInventory[]> {
  return Object.freeze(
    await Promise.all(
      mapArrayItems(witnesses, (witness) =>
        capturePortableInventory(
          witness.kind,
          witness.destination,
          witness.dependencies,
          true,
        ),
      ),
    ),
  );
}

function sameWitnessDestinations(
  witnesses: readonly Readonly<PortableCopyWitnessState>[],
  inventories: readonly PortableInventory[],
): boolean {
  return (
    witnesses.length === inventories.length &&
    everyArrayItem(witnesses, (witness, index) =>
      samePortableInventory(
        witness.destinationInventory,
        inventories[index] as PortableInventory,
      ),
    )
  );
}

function sameParents(
  before: readonly Readonly<ParentDirectorySnapshot>[],
  after: readonly Readonly<ParentDirectorySnapshot>[],
): boolean {
  return (
    before.length === after.length &&
    everyArrayItem(
      before,
      (parent, index) =>
        after[index] !== undefined &&
        sameParentSnapshot(parent, after[index] as ParentDirectorySnapshot),
    )
  );
}

async function revalidateCompositeDestinationState(
  state: Readonly<PortableCompositeSealState>,
): Promise<void> {
  const parentsBefore = await captureParents(state.witnesses);
  if (!sameParents(state.parents, parentsBefore)) {
    throw new Error("portable parent closure differs");
  }
  const destinations = await captureWitnessDestinations(state.witnesses);
  if (!sameWitnessDestinations(state.witnesses, destinations)) {
    throw new Error("portable destination closure differs");
  }
  const parentsAfter = await captureParents(state.witnesses);
  if (!sameParents(state.parents, parentsAfter)) {
    throw new Error("portable parent closure changed");
  }
}

function captureWitnessList(
  value: readonly FloodgateV7PortableCopyWitness[],
): readonly object[] {
  if (!isArray(value) || nodeUtilTypes.isProxy(value) || value.length !== 4) {
    throw new Error("portable witness list differs");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const descriptorRecord = descriptors as unknown as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  const keys = reflectOwnKeys(descriptors);
  const lengthDescriptor = descriptorRecord.length;
  if (
    keys.length !== 5 ||
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== 4
  ) {
    throw new Error("portable witness list shape differs");
  }
  const objects: object[] = [];
  for (let index = 0; index < 4; index += 1) {
    const descriptor = descriptorRecord[`${index}`];
    const item =
      descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
    if (
      (typeof item !== "object" && typeof item !== "function") ||
      item === null
    ) {
      throw new Error("portable witness differs");
    }
    objects[index] = item;
  }
  return Object.freeze(objects);
}

function zeroBytes(bytes: Uint8Array): void {
  reflectApply(uint8ArrayFill, bytes, [0]);
}

function captureHeldRoleBundleHooks(
  value: FloodgateV7PortableCopyHeldRoleBundleHooksForTests,
): Readonly<CapturedHeldRoleBundleHooks> {
  if (
    value === null ||
    typeof value !== "object" ||
    isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error("held role-bundle hooks differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const allowed = [
    "afterCompositePrecheck",
    "afterRootOpen",
    "afterFileOpen",
    "beforeHandleClose",
  ] as const;
  if (
    someArrayItem(
      keys,
      (key) =>
        typeof key !== "string" ||
        !someArrayItem(allowed, (candidate) => candidate === key) ||
        !("value" in descriptors[key]),
    )
  ) {
    throw new Error("held role-bundle hook keys differ");
  }
  const valueOf = (key: (typeof allowed)[number]): unknown => {
    const descriptor = descriptors[key];
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  };
  const afterCompositePrecheck = valueOf("afterCompositePrecheck");
  const afterRootOpen = valueOf("afterRootOpen");
  const afterFileOpen = valueOf("afterFileOpen");
  const beforeHandleClose = valueOf("beforeHandleClose");
  for (const [callback, arity] of [
    [afterCompositePrecheck, 0],
    [afterRootOpen, 0],
    [afterFileOpen, 2],
    [beforeHandleClose, 2],
  ] as const) {
    const callbackDescriptors =
      typeof callback === "function" && !nodeUtilTypes.isProxy(callback)
        ? objectGetOwnPropertyDescriptors(callback)
        : undefined;
    const lengthDescriptor = callbackDescriptors?.length;
    if (
      callback !== undefined &&
      (typeof callback !== "function" ||
        nodeUtilTypes.isProxy(callback) ||
        lengthDescriptor === undefined ||
        !("value" in lengthDescriptor) ||
        lengthDescriptor.value !== arity)
    ) {
      throw new Error("held role-bundle hook differs");
    }
  }
  return Object.freeze({
    ...(afterCompositePrecheck === undefined
      ? {}
      : {
          afterCompositePrecheck:
            afterCompositePrecheck as () => void | Promise<void>,
        }),
    ...(afterRootOpen === undefined
      ? {}
      : {
          afterRootOpen: afterRootOpen as () => void | Promise<void>,
        }),
    ...(afterFileOpen === undefined
      ? {}
      : {
          afterFileOpen: afterFileOpen as (
            filename: FloodgateV7PortableCopyHeldRoleBundleFilename,
            openedFiles: number,
          ) => void | Promise<void>,
        }),
    ...(beforeHandleClose === undefined
      ? {}
      : {
          beforeHandleClose: beforeHandleClose as (
            kind: "file" | "root",
            filename: FloodgateV7PortableCopyHeldRoleBundleFilename | null,
          ) => void | Promise<void>,
        }),
  });
}

function roleBundleWitness(
  state: Readonly<PortableCompositeSealState>,
): Readonly<PortableCopyWitnessState> {
  let roleBundle: Readonly<PortableCopyWitnessState> | undefined;
  for (const witness of state.witnesses) {
    if (witness.kind === "role-bundle-tree") {
      if (roleBundle !== undefined) {
        throw new Error("held role-bundle witness differs");
      }
      roleBundle = witness;
    }
  }
  if (
    roleBundle === undefined ||
    roleBundle.destinationInventory.type !== "tree"
  ) {
    throw new Error("held role-bundle witness absent");
  }
  const inventory = roleBundle.destinationInventory.value;
  if (
    inventory.directories.length !== 0 ||
    inventory.directoryIdentities.length !== 0 ||
    inventory.files.length !==
      FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.length
  ) {
    throw new Error("held role-bundle inventory shape differs");
  }
  for (
    let index = 0;
    index < FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.length;
    index += 1
  ) {
    const filename = FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES[index];
    const file = inventory.files[index];
    if (
      filename === undefined ||
      file === undefined ||
      file.relativePath !== filename ||
      file.bytes < 0 ||
      file.bytes !== Number(file.identity.size) ||
      file.sha256.length !== 64 ||
      file.sourceMode !== PRIVATE_FILE_MODE ||
      file.destinationMode !== PRIVATE_FILE_MODE
    ) {
      throw new Error("held role-bundle inventory file differs");
    }
    if (
      (filename === "manifest.json" &&
        file.bytes >
          FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_MANIFEST_MAX_BYTES) ||
      (filename === "training.raw.jsonl" &&
        file.bytes >
          FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_TRAINING_RAW_MAX_BYTES)
    ) {
      throw new Error("held role-bundle retained file exceeds bound");
    }
  }
  return roleBundle;
}

async function openHeldRoleBundle(
  witness: Readonly<PortableCopyWitnessState>,
  hooks: Readonly<CapturedHeldRoleBundleHooks>,
  opened: OpenedHeldRoleBundle,
): Promise<void> {
  if (witness.destinationInventory.type !== "tree") {
    throw new Error("held role-bundle inventory differs");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  const directory = fs.constants.O_DIRECTORY;
  if (typeof noFollow !== "number" || typeof directory !== "number") {
    throw new Error("held role-bundle open flags unavailable");
  }
  const rootHandle = await fs.promises.open(
    witness.destination,
    fs.constants.O_RDONLY | directory | noFollow,
  );
  opened.rootClose = rootHandle.close.bind(rootHandle);
  const rootStatMethod = rootHandle.stat.bind(rootHandle);
  opened.rootStat = async () => rootStatMethod({ bigint: true });
  opened.rootIdentity = witness.destinationInventory.value.rootIdentity;
  const rootHeld = await opened.rootStat();
  if (!sameStat(opened.rootIdentity, rootHeld)) {
    throw new Error("held role-bundle root descriptor differs");
  }
  await hooks.afterRootOpen?.();
  const rootNamed = await fs.promises.lstat(witness.destination, {
    bigint: true,
  });
  if (
    !sameStat(opened.rootIdentity, rootNamed) ||
    (await fs.promises.realpath(witness.destination)) !== witness.destination
  ) {
    throw new Error("held role-bundle root name differs");
  }

  for (
    let index = 0;
    index < FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.length;
    index += 1
  ) {
    const filename = FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES[index];
    const identity = witness.destinationInventory.value.files[index];
    if (filename === undefined || identity === undefined) {
      throw new Error("held role-bundle file binding differs");
    }
    const filePath = path.join(witness.destination, filename);
    const handle = await fs.promises.open(
      filePath,
      fs.constants.O_RDONLY | noFollow,
    );
    const close = handle.close.bind(handle);
    const readMethod = handle.read.bind(handle);
    const statMethod = handle.stat.bind(handle);
    const stat = async (): Promise<fs.BigIntStats> =>
      statMethod({ bigint: true });
    const read = async (
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number,
    ): Promise<Readonly<{ bytesRead: number; buffer: Uint8Array }>> => {
      const result = await readMethod(buffer, offset, length, position);
      return Object.freeze({
        bytesRead: result.bytesRead,
        buffer: result.buffer,
      });
    };
    const captured: OpenedHeldRoleBundleFile = {
      close,
      filename,
      identity,
      read,
      stat,
    };
    pushArrayItem(opened.files, captured);
    const held = await stat();
    if (!sameStat(identity.identity, held)) {
      throw new Error("held role-bundle file descriptor differs");
    }
    await hooks.afterFileOpen?.(filename, opened.files.length);
    const named = await fs.promises.lstat(filePath, { bigint: true });
    if (
      !sameStat(identity.identity, named) ||
      (await fs.promises.realpath(filePath)) !== filePath
    ) {
      throw new Error("held role-bundle file name differs");
    }
  }
}

async function readHeldRoleBundleFile(
  opened: OpenedHeldRoleBundleFile,
): Promise<void> {
  const retain =
    opened.filename === "manifest.json" ||
    opened.filename === "training.raw.jsonl";
  const retained = retain
    ? Buffer.from(new NativeSharedArrayBuffer(opened.identity.bytes))
    : undefined;
  if (retained !== undefined) opened.retainedBytes = retained;
  const chunk = Buffer.alloc(
    Math.min(READ_CHUNK_BYTES, Math.max(1, opened.identity.bytes)),
  );
  const extra = Buffer.alloc(1);
  const digest = createHash("sha256");
  let offset = 0;
  try {
    while (offset < opened.identity.bytes) {
      const wanted = Math.min(chunk.byteLength, opened.identity.bytes - offset);
      let readOffset = 0;
      while (readOffset < wanted) {
        const remaining = wanted - readOffset;
        const { bytesRead } = await opened.read(
          chunk,
          readOffset,
          remaining,
          offset + readOffset,
        );
        if (bytesRead <= 0 || bytesRead > remaining) {
          throw new Error("held role-bundle read shortened");
        }
        readOffset += bytesRead;
      }
      digest.update(chunk.subarray(0, wanted));
      if (retained !== undefined) {
        reflectApply(uint8ArraySet, retained, [
          chunk.subarray(0, wanted),
          offset,
        ]);
      }
      offset += wanted;
    }
    const { bytesRead: extraBytes } = await opened.read(
      extra,
      0,
      1,
      opened.identity.bytes,
    );
    if (extraBytes !== 0 || digest.digest("hex") !== opened.identity.sha256) {
      throw new Error("held role-bundle bytes differ");
    }
    if (!sameStat(opened.identity.identity, await opened.stat())) {
      throw new Error("held role-bundle file changed while reading");
    }
  } catch (error) {
    if (retained !== undefined) zeroBytes(retained);
    throw error;
  } finally {
    zeroBytes(chunk);
    zeroBytes(extra);
  }
}

async function readHeldRoleBundle(opened: OpenedHeldRoleBundle): Promise<void> {
  for (const file of opened.files) {
    await readHeldRoleBundleFile(file);
  }
}

function heldRoleBundleSnapshot(
  opened: Readonly<OpenedHeldRoleBundle>,
): Readonly<FloodgateV7PortableCopyHeldRoleBundleSnapshot> {
  const files = Object.freeze(
    mapArrayItems(opened.files, (file) =>
      Object.freeze({
        filename: file.filename,
        bytes: file.identity.bytes,
        sha256: file.identity.sha256,
      }),
    ),
  );
  let manifestBytes: Uint8Array | undefined;
  let trainingRawBytes: Uint8Array | undefined;
  for (const file of opened.files) {
    if (file.filename === "manifest.json") {
      manifestBytes = file.retainedBytes;
    } else if (file.filename === "training.raw.jsonl") {
      trainingRawBytes = file.retainedBytes;
    }
  }
  if (
    files.length !== FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.length ||
    manifestBytes === undefined ||
    trainingRawBytes === undefined
  ) {
    throw new Error("held role-bundle snapshot differs");
  }
  return Object.freeze({ files, manifestBytes, trainingRawBytes });
}

async function revalidateHeldRoleBundleDescriptors(
  opened: Readonly<OpenedHeldRoleBundle>,
): Promise<void> {
  if (
    opened.rootIdentity === undefined ||
    opened.rootStat === undefined ||
    !sameStat(opened.rootIdentity, await opened.rootStat()) ||
    opened.files.length !==
      FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.length
  ) {
    throw new Error("held role-bundle root changed");
  }
  for (const file of opened.files) {
    if (!sameStat(file.identity.identity, await file.stat())) {
      throw new Error("held role-bundle file changed");
    }
  }
}

function zeroHeldRoleBundle(opened: Readonly<OpenedHeldRoleBundle>): boolean {
  let failed = false;
  for (let index = 0; index < opened.files.length; index += 1) {
    const retainedBytes = opened.files[index]?.retainedBytes;
    if (retainedBytes !== undefined) {
      try {
        zeroBytes(retainedBytes);
      } catch {
        failed = true;
      }
    }
  }
  return failed;
}

async function closeHeldRoleBundle(
  opened: OpenedHeldRoleBundle,
  hooks: Readonly<CapturedHeldRoleBundleHooks>,
): Promise<boolean> {
  let failed = false;
  for (let index = opened.files.length - 1; index >= 0; index -= 1) {
    const file = opened.files[index];
    if (file === undefined || file.closed === true) continue;
    if (file.closeHookRun !== true) {
      file.closeHookRun = true;
      try {
        await hooks.beforeHandleClose?.("file", file.filename);
      } catch {
        failed = true;
      }
    }
    try {
      await file.close();
      file.closed = true;
    } catch {
      failed = true;
    }
  }
  if (opened.rootClose !== undefined && opened.rootClosed !== true) {
    if (opened.rootCloseHookRun !== true) {
      opened.rootCloseHookRun = true;
      try {
        await hooks.beforeHandleClose?.("root", null);
      } catch {
        failed = true;
      }
    }
    try {
      await opened.rootClose();
      opened.rootClosed = true;
    } catch {
      failed = true;
    }
  }
  if (
    everyArrayItem(opened.files, (file) => file.closed === true) &&
    (opened.rootClose === undefined || opened.rootClosed === true)
  ) {
    opened.files.length = 0;
    delete opened.rootClose;
    delete opened.rootCloseHookRun;
    delete opened.rootClosed;
    delete opened.rootIdentity;
    delete opened.rootStat;
  }
  return failed;
}

function createPortableRegistry(): PortableRegistry {
  return Object.freeze({
    presealedSources: new WeakMap<object, PortableSourcePresealState>(),
    sealedSources: new WeakMap<object, PortableSourceSealState>(),
    witnesses: new WeakMap<object, PortableCopyWitnessState>(),
    compositeSeals: new WeakMap<object, PortableCompositeSealState>(),
    activeHeldRoleBundleClaims: new WeakMap<
      object,
      Readonly<ActiveHeldRoleBundleClaimState>
    >(),
    issuedHeldRoleBundleClaims: new WeakMap<
      object,
      PortableCompositeSealState
    >(),
    issuedCompositeSeals: new WeakSet<object>(),
    revokedCompositeSeals: new WeakSet<object>(),
  });
}

function createPortableCopyWitnessApi(registry: PortableRegistry) {
  const preseal = async (
    argumentCount: number,
    kindValue: FloodgateV7PortableCopyKind,
    sourceValue: string,
    destinationValue: string,
    dependenciesValue: FloodgateV7CleanRoomCopyDependencies,
  ): Promise<FloodgateV7PortableCopySourcePreseal> => {
    try {
      if (argumentCount !== 4) throw new Error("argument count differs");
      const kind = portableKind(kindValue);
      const source = canonicalAbsolutePath(sourceValue);
      const destination = canonicalAbsolutePath(destinationValue);
      const dependencies = captureDependencies(dependenciesValue);
      if (pathsOverlap(source, destination)) {
        throw new Error("portable namespaces overlap");
      }
      if (
        kind === "legacy-file" &&
        path.basename(source) !== path.basename(destination)
      ) {
        throw new Error("portable file binding differs");
      }
      const inventory = await capturePortableInventory(
        kind,
        source,
        dependencies,
        false,
      );
      const capability =
        opaqueCapability<FloodgateV7PortableCopySourcePreseal>();
      setWeakMapValue(registry.presealedSources, capability as object, {
        kind,
        source,
        destination,
        dependencies,
        inventory,
      });
      return capability;
    } catch {
      throw new FloodgateV7PortableCopyWitnessError("preseal");
    }
  };

  const seal = async (
    argumentCount: number,
    kindValue: FloodgateV7PortableCopyKind,
    presealValue: FloodgateV7PortableCopySourcePreseal,
  ): Promise<FloodgateV7PortableCopySourceFilesystemSeal> => {
    try {
      if (argumentCount !== 2) throw new Error("argument count differs");
      const kind = portableKind(kindValue);
      if (
        (typeof presealValue !== "object" &&
          typeof presealValue !== "function") ||
        presealValue === null
      ) {
        throw new Error("portable preseal differs");
      }
      const state = getWeakMapValue(
        registry.presealedSources,
        presealValue as object,
      );
      if (state === undefined) throw new Error("portable preseal absent");
      deleteWeakMapValue(registry.presealedSources, presealValue as object);
      if (state.kind !== kind) throw new Error("portable preseal kind differs");
      const after = await capturePortableInventory(
        state.kind,
        state.source,
        state.dependencies,
        false,
      );
      if (!samePortableInventory(state.inventory, after)) {
        throw new Error("portable source changed after verification");
      }
      const capability =
        opaqueCapability<FloodgateV7PortableCopySourceFilesystemSeal>();
      setWeakMapValue(registry.sealedSources, capability as object, state);
      return capability;
    } catch {
      throw new FloodgateV7PortableCopyWitnessError("seal");
    }
  };

  const copy = async (
    argumentCount: number,
    kindValue: FloodgateV7PortableCopyKind,
    sealValue: FloodgateV7PortableCopySourceFilesystemSeal,
    destinationValue: string,
  ): Promise<Readonly<FloodgateV7PortableCopyWitnessResult>> => {
    try {
      if (argumentCount !== 3) throw new Error("argument count differs");
      const kind = portableKind(kindValue);
      const destination = canonicalAbsolutePath(destinationValue);
      if (
        (typeof sealValue !== "object" && typeof sealValue !== "function") ||
        sealValue === null
      ) {
        throw new Error("portable seal differs");
      }
      const state = getWeakMapValue(
        registry.sealedSources,
        sealValue as object,
      );
      if (state === undefined) throw new Error("portable seal absent");
      deleteWeakMapValue(registry.sealedSources, sealValue as object);
      if (state.kind !== kind || state.destination !== destination) {
        throw new Error("portable copy binding differs");
      }
      const dependencies = publicCopyDependencies(state.dependencies);
      let internal: TreeCopyInternalResult | FileCopyInternalResult;
      if (kindInventoryType(kind) === "tree") {
        internal = await copyFloodgateV7CleanRoomTreeByValueInternal(
          3,
          state.source,
          destination,
          dependencies,
        );
      } else {
        internal = await copyFloodgateV7CleanRoomFileByValueInternal(
          3,
          state.source,
          destination,
          dependencies,
        );
      }
      const sourceBefore: PortableInventory =
        kindInventoryType(kind) === "tree"
          ? Object.freeze({
              type: "tree" as const,
              value: (internal as TreeCopyInternalResult).sourceBefore,
            })
          : Object.freeze({
              type: "file" as const,
              value: (internal as FileCopyInternalResult).sourceBefore,
            });
      if (!samePortableInventory(state.inventory, sourceBefore)) {
        throw new Error("portable copy source seal differs");
      }
      const destinationInventory: PortableInventory =
        kindInventoryType(kind) === "tree"
          ? Object.freeze({
              type: "tree" as const,
              value: (internal as TreeCopyInternalResult).destinationAfter,
            })
          : Object.freeze({
              type: "file" as const,
              value: (internal as FileCopyInternalResult).destinationAfter,
            });
      const witness = opaqueCapability<FloodgateV7PortableCopyWitness>();
      setWeakMapValue(registry.witnesses, witness as object, {
        kind,
        destination,
        dependencies: filesystemOnlyDependencies(state.dependencies),
        destinationInventory,
      });
      return Object.freeze({
        receipt: internal.receipt,
        witness,
      });
    } catch {
      throw new FloodgateV7PortableCopyWitnessError("copy");
    }
  };

  const composite = async (
    argumentCount: number,
    witnessValues: readonly FloodgateV7PortableCopyWitness[],
  ): Promise<FloodgateV7PortableCopyCompositeDestinationSeal> => {
    try {
      if (argumentCount !== 1) throw new Error("argument count differs");
      const objects = captureWitnessList(witnessValues);
      for (let left = 0; left < objects.length; left += 1) {
        for (let right = left + 1; right < objects.length; right += 1) {
          if (objects[left] === objects[right]) {
            throw new Error("portable witness replay differs");
          }
        }
      }
      const typedStates: PortableCopyWitnessState[] = [];
      for (const item of objects) {
        const state = getWeakMapValue(registry.witnesses, item);
        if (state === undefined) {
          throw new Error("portable witness absent");
        }
        pushArrayItem(typedStates, state);
      }
      let rawSeen = false;
      let roleSeen = false;
      let bundleSeen = false;
      let legacySeen = false;
      for (const state of typedStates) {
        if (kindInventoryType(state.kind) !== state.destinationInventory.type) {
          throw new Error("portable witness kind composition differs");
        }
        switch (state.kind) {
          case "raw-lock-tree":
            if (rawSeen) {
              throw new Error("portable witness kind composition differs");
            }
            rawSeen = true;
            break;
          case "role-lock-tree":
            if (roleSeen) {
              throw new Error("portable witness kind composition differs");
            }
            roleSeen = true;
            break;
          case "role-bundle-tree":
            if (bundleSeen) {
              throw new Error("portable witness kind composition differs");
            }
            bundleSeen = true;
            break;
          case "legacy-file":
            if (legacySeen) {
              throw new Error("portable witness kind composition differs");
            }
            legacySeen = true;
            break;
        }
      }
      if (!rawSeen || !roleSeen || !bundleSeen || !legacySeen) {
        throw new Error("portable witness kind composition differs");
      }
      for (let left = 0; left < typedStates.length; left += 1) {
        for (let right = left + 1; right < typedStates.length; right += 1) {
          const leftDestination = typedStates[left]?.destination;
          const rightDestination = typedStates[right]?.destination;
          if (
            leftDestination === undefined ||
            rightDestination === undefined ||
            pathsOverlap(leftDestination, rightDestination)
          ) {
            throw new Error("portable witness destinations overlap");
          }
        }
      }
      for (const item of objects) {
        deleteWeakMapValue(registry.witnesses, item);
      }
      sortArrayItems(typedStates, (left, right) =>
        compareUtf8(left.kind, right.kind),
      );
      const destinationsBefore = await captureWitnessDestinations(typedStates);
      if (!sameWitnessDestinations(typedStates, destinationsBefore)) {
        throw new Error("portable destination differs");
      }
      const parents = await captureParents(typedStates);
      const destinationsAfter = await captureWitnessDestinations(typedStates);
      if (!sameWitnessDestinations(typedStates, destinationsAfter)) {
        throw new Error("portable destination changed");
      }
      const parentsAfter = await captureParents(typedStates);
      if (!sameParents(parents, parentsAfter)) {
        throw new Error("portable parents changed");
      }
      const capability =
        opaqueCapability<FloodgateV7PortableCopyCompositeDestinationSeal>();
      setWeakMapValue(registry.compositeSeals, capability as object, {
        witnesses: Object.freeze(typedStates),
        parents: parentsAfter,
        inUse: false,
        invalidated: false,
      });
      addWeakSetValue(registry.issuedCompositeSeals, capability as object);
      return capability;
    } catch {
      throw new FloodgateV7PortableCopyWitnessError("composite");
    }
  };

  const withRevalidation = async <Result>(
    argumentCount: number,
    compositeValue: FloodgateV7PortableCopyCompositeDestinationSeal,
    operationValue: () => Result | Promise<Result>,
  ): Promise<Result> => {
    let state: PortableCompositeSealState | undefined;
    let compositeObject: object | undefined;
    try {
      const operationDescriptors =
        typeof operationValue === "function" &&
        !nodeUtilTypes.isProxy(operationValue)
          ? objectGetOwnPropertyDescriptors(operationValue)
          : undefined;
      const operationLength = operationDescriptors?.length;
      if (
        argumentCount !== 2 ||
        (typeof compositeValue !== "object" &&
          typeof compositeValue !== "function") ||
        compositeValue === null ||
        typeof operationValue !== "function" ||
        nodeUtilTypes.isProxy(operationValue) ||
        operationLength === undefined ||
        !("value" in operationLength) ||
        operationLength.value !== 0
      ) {
        throw new Error("portable borrow differs");
      }
      compositeObject = compositeValue as object;
      state = getWeakMapValue(registry.compositeSeals, compositeObject);
      if (state === undefined || state.invalidated || state.inUse) {
        throw new Error("portable borrow unavailable");
      }
      state.inUse = true;
      await revalidateCompositeDestinationState(state);
      if (state.invalidated) {
        throw new Error("portable borrow revoked before operation");
      }
      const result = await operationValue();
      if (state.invalidated) {
        throw new Error("portable borrow revoked during operation");
      }
      await revalidateCompositeDestinationState(state);
      if (state.invalidated) {
        throw new Error("portable borrow revoked after operation");
      }
      state.inUse = false;
      return result;
    } catch {
      if (state !== undefined) {
        if (state.activeHeldRoleBundleClaim !== undefined) {
          deleteWeakMapValue(
            registry.activeHeldRoleBundleClaims,
            state.activeHeldRoleBundleClaim,
          );
          state.activeHeldRoleBundleClaim = undefined;
        }
        state.invalidated = true;
        state.inUse = false;
      }
      if (compositeObject !== undefined) {
        deleteWeakMapValue(registry.compositeSeals, compositeObject);
        if (weakSetContains(registry.issuedCompositeSeals, compositeObject)) {
          addWeakSetValue(registry.revokedCompositeSeals, compositeObject);
        }
      }
      throw new FloodgateV7PortableCopyWitnessError("borrow");
    }
  };

  const claimHeldRoleBundle = (
    argumentCount: number,
    claimValue: FloodgateV7PortableCopyHeldRoleBundleClaim,
  ): Readonly<FloodgateV7PortableCopyHeldRoleBundleSnapshot> => {
    try {
      if (
        argumentCount !== 1 ||
        (typeof claimValue !== "object" && typeof claimValue !== "function") ||
        claimValue === null ||
        nodeUtilTypes.isProxy(claimValue)
      ) {
        throw new Error("held role-bundle claim differs");
      }
      const claim = claimValue as object;
      const issuedState = getWeakMapValue(
        registry.issuedHeldRoleBundleClaims,
        claim,
      );
      const active = getWeakMapValue(
        registry.activeHeldRoleBundleClaims,
        claim,
      );
      if (active === undefined) {
        if (issuedState !== undefined) {
          issuedState.invalidated = true;
        }
        throw new Error("held role-bundle claim unavailable");
      }
      deleteWeakMapValue(registry.activeHeldRoleBundleClaims, claim);
      return active.snapshot;
    } catch {
      throw new FloodgateV7PortableCopyWitnessError("borrow");
    }
  };

  const withHeldRoleBundle = async <Result>(
    argumentCount: number,
    compositeValue: FloodgateV7PortableCopyCompositeDestinationSeal,
    operationValue: (
      claim: FloodgateV7PortableCopyHeldRoleBundleClaim,
    ) => Result | Promise<Result>,
    hooksValue: FloodgateV7PortableCopyHeldRoleBundleHooksForTests,
  ): Promise<Result> => {
    let state: PortableCompositeSealState | undefined;
    let compositeObject: object | undefined;
    let claimObject: object | undefined;
    const opened: OpenedHeldRoleBundle = { files: [] };
    let hooks: Readonly<CapturedHeldRoleBundleHooks> = Object.freeze({});
    try {
      const operationDescriptors =
        typeof operationValue === "function" &&
        !nodeUtilTypes.isProxy(operationValue)
          ? objectGetOwnPropertyDescriptors(operationValue)
          : undefined;
      const operationLength = operationDescriptors?.length;
      if (
        argumentCount !== 3 ||
        (typeof compositeValue !== "object" &&
          typeof compositeValue !== "function") ||
        compositeValue === null ||
        typeof operationValue !== "function" ||
        nodeUtilTypes.isProxy(operationValue) ||
        operationLength === undefined ||
        !("value" in operationLength) ||
        operationLength.value !== 1
      ) {
        throw new Error("held role-bundle borrow differs");
      }
      hooks = captureHeldRoleBundleHooks(hooksValue);
      compositeObject = compositeValue as object;
      state = getWeakMapValue(registry.compositeSeals, compositeObject);
      if (state === undefined || state.invalidated || state.inUse) {
        throw new Error("held role-bundle borrow unavailable");
      }
      state.inUse = true;

      let primaryFailure: unknown;
      let result: Result | undefined;
      let resultAvailable = false;
      try {
        const roleBundle = roleBundleWitness(state);
        await revalidateCompositeDestinationState(state);
        if (state.invalidated) {
          throw new Error("held role-bundle revoked before open");
        }
        await hooks.afterCompositePrecheck?.();
        if (state.invalidated) {
          throw new Error("held role-bundle revoked before descriptor open");
        }
        await openHeldRoleBundle(roleBundle, hooks, opened);
        await readHeldRoleBundle(opened);
        if (state.invalidated) {
          throw new Error("held role-bundle revoked before callback");
        }

        const snapshot = heldRoleBundleSnapshot(opened);
        const claim =
          opaqueCapability<FloodgateV7PortableCopyHeldRoleBundleClaim>();
        claimObject = claim as object;
        state.activeHeldRoleBundleClaim = claimObject;
        setWeakMapValue(
          registry.activeHeldRoleBundleClaims,
          claimObject,
          Object.freeze({ composite: state, snapshot }),
        );
        setWeakMapValue(
          registry.issuedHeldRoleBundleClaims,
          claimObject,
          state,
        );
        let claimed = false;
        let callbackResult: Result | Promise<Result>;
        try {
          callbackResult = operationValue(claim);
        } finally {
          claimed = !deleteWeakMapValue(
            registry.activeHeldRoleBundleClaims,
            claimObject,
          );
          state.activeHeldRoleBundleClaim = undefined;
        }
        result = await callbackResult;
        resultAvailable = true;
        if (!claimed) {
          throw new Error("held role-bundle claim not consumed synchronously");
        }
        if (state.invalidated) {
          throw new Error("held role-bundle revoked during callback");
        }
        await revalidateHeldRoleBundleDescriptors(opened);
        if (state.invalidated) {
          throw new Error("held role-bundle revoked after callback");
        }
      } catch (error) {
        primaryFailure = error;
      }

      if (claimObject !== undefined) {
        deleteWeakMapValue(registry.activeHeldRoleBundleClaims, claimObject);
        claimObject = undefined;
      }
      state.activeHeldRoleBundleClaim = undefined;
      const zeroFailed = zeroHeldRoleBundle(opened);
      const closeFailed = await closeHeldRoleBundle(opened, hooks);
      if (
        primaryFailure !== undefined ||
        zeroFailed ||
        closeFailed ||
        !resultAvailable
      ) {
        throw new Error("held role-bundle borrow lifecycle failed");
      }

      if (state.invalidated) {
        throw new Error("held role-bundle revoked before composite postflight");
      }
      await revalidateCompositeDestinationState(state);
      if (state.invalidated) {
        throw new Error("held role-bundle revoked after composite postflight");
      }
      state.inUse = false;
      return result as Result;
    } catch {
      if (claimObject !== undefined) {
        deleteWeakMapValue(registry.activeHeldRoleBundleClaims, claimObject);
      }
      zeroHeldRoleBundle(opened);
      await closeHeldRoleBundle(opened, hooks).catch(() => false);
      if (state !== undefined) {
        if (state.activeHeldRoleBundleClaim !== undefined) {
          deleteWeakMapValue(
            registry.activeHeldRoleBundleClaims,
            state.activeHeldRoleBundleClaim,
          );
          state.activeHeldRoleBundleClaim = undefined;
        }
        state.invalidated = true;
        state.inUse = false;
      }
      if (compositeObject !== undefined) {
        deleteWeakMapValue(registry.compositeSeals, compositeObject);
        if (weakSetContains(registry.issuedCompositeSeals, compositeObject)) {
          addWeakSetValue(registry.revokedCompositeSeals, compositeObject);
        }
      }
      throw new FloodgateV7PortableCopyWitnessError("borrow");
    }
  };

  const revoke = (
    argumentCount: number,
    compositeValue: FloodgateV7PortableCopyCompositeDestinationSeal,
  ): void => {
    try {
      if (
        argumentCount !== 1 ||
        (typeof compositeValue !== "object" &&
          typeof compositeValue !== "function") ||
        compositeValue === null
      ) {
        throw new Error("portable revocation differs");
      }
      const compositeObject = compositeValue as object;
      if (weakSetContains(registry.revokedCompositeSeals, compositeObject)) {
        return;
      }
      if (!weakSetContains(registry.issuedCompositeSeals, compositeObject)) {
        throw new Error("portable revocation provenance differs");
      }
      const state = getWeakMapValue(registry.compositeSeals, compositeObject);
      if (state !== undefined) {
        if (state.activeHeldRoleBundleClaim !== undefined) {
          deleteWeakMapValue(
            registry.activeHeldRoleBundleClaims,
            state.activeHeldRoleBundleClaim,
          );
          state.activeHeldRoleBundleClaim = undefined;
        }
        state.invalidated = true;
        deleteWeakMapValue(registry.compositeSeals, compositeObject);
      }
      addWeakSetValue(registry.revokedCompositeSeals, compositeObject);
    } catch {
      throw new FloodgateV7PortableCopyWitnessError("revoke");
    }
  };

  return Object.freeze({
    preseal,
    seal,
    copy,
    composite,
    withRevalidation,
    withHeldRoleBundle,
    claimHeldRoleBundle,
    revoke,
  });
}

const productionPortableCopyWitnessApi = createPortableCopyWitnessApi(
  createPortableRegistry(),
);
const testPortableCopyWitnessApi = createPortableCopyWitnessApi(
  createPortableRegistry(),
);

export async function presealFloodgateV7PortableCopySource(
  kind: FloodgateV7PortableCopyKind,
  source: string,
  destination: string,
  dependencies: FloodgateV7CleanRoomCopyDependencies,
): Promise<FloodgateV7PortableCopySourcePreseal> {
  return productionPortableCopyWitnessApi.preseal(
    arguments.length,
    kind,
    source,
    destination,
    dependencies,
  );
}

export async function sealFloodgateV7PortableCopySourceFilesystem(
  kind: FloodgateV7PortableCopyKind,
  preseal: FloodgateV7PortableCopySourcePreseal,
): Promise<FloodgateV7PortableCopySourceFilesystemSeal> {
  return productionPortableCopyWitnessApi.seal(arguments.length, kind, preseal);
}

export async function copyFloodgateV7PortableSourceByValue(
  kind: FloodgateV7PortableCopyKind,
  seal: FloodgateV7PortableCopySourceFilesystemSeal,
  destination: string,
): Promise<Readonly<FloodgateV7PortableCopyWitnessResult>> {
  return productionPortableCopyWitnessApi.copy(
    arguments.length,
    kind,
    seal,
    destination,
  );
}

export async function sealFloodgateV7PortableCopyCompositeDestination(
  witnesses: readonly FloodgateV7PortableCopyWitness[],
): Promise<FloodgateV7PortableCopyCompositeDestinationSeal> {
  return productionPortableCopyWitnessApi.composite(
    arguments.length,
    witnesses,
  );
}

export async function withFloodgateV7PortableCopyCompositeDestinationRevalidation<
  Result,
>(
  composite: FloodgateV7PortableCopyCompositeDestinationSeal,
  operation: () => Result | Promise<Result>,
): Promise<Result> {
  return productionPortableCopyWitnessApi.withRevalidation(
    arguments.length,
    composite,
    operation,
  );
}

export function withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundle<
  Result,
>(
  composite: FloodgateV7PortableCopyCompositeDestinationSeal,
  operation: (
    claim: FloodgateV7PortableCopyHeldRoleBundleClaim,
  ) => Result | Promise<Result>,
): Promise<Result> {
  if (arguments.length !== 2) {
    return Promise.reject(new FloodgateV7PortableCopyWitnessError("borrow"));
  }
  return productionPortableCopyWitnessApi.withHeldRoleBundle(
    3,
    composite,
    operation,
    Object.freeze({}),
  );
}

export function claimFloodgateV7PortableCopyHeldRoleBundleSnapshot(
  claim: FloodgateV7PortableCopyHeldRoleBundleClaim,
): Readonly<FloodgateV7PortableCopyHeldRoleBundleSnapshot> {
  return productionPortableCopyWitnessApi.claimHeldRoleBundle(
    arguments.length,
    claim,
  );
}

export function revokeFloodgateV7PortableCopyCompositeDestinationSeal(
  composite: FloodgateV7PortableCopyCompositeDestinationSeal,
): void {
  productionPortableCopyWitnessApi.revoke(arguments.length, composite);
}

export async function presealFloodgateV7PortableCopySourceCoreForTests(
  kind: FloodgateV7PortableCopyKind,
  source: string,
  destination: string,
  dependencies: FloodgateV7CleanRoomCopyDependencies,
): Promise<FloodgateV7PortableCopySourcePreseal> {
  return testPortableCopyWitnessApi.preseal(
    arguments.length,
    kind,
    source,
    destination,
    dependencies,
  );
}

export async function sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
  kind: FloodgateV7PortableCopyKind,
  preseal: FloodgateV7PortableCopySourcePreseal,
): Promise<FloodgateV7PortableCopySourceFilesystemSeal> {
  return testPortableCopyWitnessApi.seal(arguments.length, kind, preseal);
}

export async function copyFloodgateV7PortableSourceByValueCoreForTests(
  kind: FloodgateV7PortableCopyKind,
  seal: FloodgateV7PortableCopySourceFilesystemSeal,
  destination: string,
): Promise<Readonly<FloodgateV7PortableCopyWitnessResult>> {
  return testPortableCopyWitnessApi.copy(
    arguments.length,
    kind,
    seal,
    destination,
  );
}

export async function sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
  witnesses: readonly FloodgateV7PortableCopyWitness[],
): Promise<FloodgateV7PortableCopyCompositeDestinationSeal> {
  return testPortableCopyWitnessApi.composite(arguments.length, witnesses);
}

export async function withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests<
  Result,
>(
  composite: FloodgateV7PortableCopyCompositeDestinationSeal,
  operation: () => Result | Promise<Result>,
): Promise<Result> {
  return testPortableCopyWitnessApi.withRevalidation(
    arguments.length,
    composite,
    operation,
  );
}

export function withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests<
  Result,
>(
  composite: FloodgateV7PortableCopyCompositeDestinationSeal,
  operation: (
    claim: FloodgateV7PortableCopyHeldRoleBundleClaim,
  ) => Result | Promise<Result>,
  hooks: FloodgateV7PortableCopyHeldRoleBundleHooksForTests = Object.freeze({}),
): Promise<Result> {
  if (arguments.length !== 2 && arguments.length !== 3) {
    return Promise.reject(new FloodgateV7PortableCopyWitnessError("borrow"));
  }
  return testPortableCopyWitnessApi.withHeldRoleBundle(
    3,
    composite,
    operation,
    hooks,
  );
}

export function claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
  claim: FloodgateV7PortableCopyHeldRoleBundleClaim,
): Readonly<FloodgateV7PortableCopyHeldRoleBundleSnapshot> {
  return testPortableCopyWitnessApi.claimHeldRoleBundle(
    arguments.length,
    claim,
  );
}

export function revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
  composite: FloodgateV7PortableCopyCompositeDestinationSeal,
): void {
  testPortableCopyWitnessApi.revoke(arguments.length, composite);
}
