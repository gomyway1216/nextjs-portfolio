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
const reflectOwnKeys = Reflect.ownKeys;

type CopyPhase =
  | "capture"
  | "source-inventory"
  | "namespace"
  | "copy"
  | "revalidation"
  | "callback";

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

interface CapturedDependencies {
  readonly effectiveUserId: number;
  readonly maxEntries: number;
  readonly maxTotalBytes: number;
  readonly maxConcurrency: number;
  readonly afterSourceInventory?: () => void | Promise<void>;
  readonly afterFileCopied?: (
    relativePath: string,
  ) => void | Promise<void>;
  readonly beforeFinalRevalidation?: () => void | Promise<void>;
  readonly closeCopiedFileHandle?: (
    handle: fs.promises.FileHandle,
    kind: "source" | "destination",
  ) => void | Promise<void>;
}

function canonicalAbsolutePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\n") ||
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

function captureDependencies(
  value: FloodgateV7CleanRoomCopyDependencies,
): Readonly<CapturedDependencies> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error("dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const allowedKeys = new Set([
    "effectiveUserId",
    "maxEntries",
    "maxTotalBytes",
    "maxConcurrencyForTests",
    "afterSourceInventoryForTests",
    "afterFileCopiedForTests",
    "beforeFinalRevalidationForTests",
    "closeCopiedFileHandleForTests",
  ]);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length < 1 ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !allowedKeys.has(key) ||
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
  const beforeFinalRevalidation = valueOf(
    "beforeFinalRevalidationForTests",
  );
  const closeCopiedFileHandle = valueOf(
    "closeCopiedFileHandleForTests",
  );
  for (const [callback, arity] of [
    [afterSourceInventory, 0],
    [afterFileCopied, 1],
    [beforeFinalRevalidation, 0],
    [closeCopiedFileHandle, 2],
  ] as const) {
    if (
      callback !== undefined &&
      (typeof callback !== "function" ||
        nodeUtilTypes.isProxy(callback) ||
        callback.length !== arity)
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
          closeCopiedFileHandle:
            closeCopiedFileHandle as (
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

function sourceFileMode(
  stat: fs.BigIntStats,
): 0o400 | 0o500 | 0o600 | 0o700 {
  const mode = Number(stat.mode & MODE_MASK);
  if (mode !== 0o400 && mode !== 0o500 && mode !== 0o600 && mode !== 0o700) {
    throw new Error("source file mode differs");
  }
  return mode;
}

async function hashHeldRegularFile(
  file: string,
  expectedUserId: number,
): Promise<Readonly<{ identity: Readonly<StatIdentity>; sha256: string }>> {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new Error("O_NOFOLLOW unavailable");
  const handle = await fs.promises.open(
    file,
    fs.constants.O_RDONLY | noFollow,
  );
  const chunk = Buffer.alloc(READ_CHUNK_BYTES);
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
      const wanted = Math.min(
        chunk.byteLength,
        Number(before.size) - offset,
      );
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
    chunk.fill(0);
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
    entries.sort((left, right) => compareUtf8(left.name, right.name));
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
        directoryIdentities.push(
          await assertPrivateRealDirectory(
            childAbsolute,
            dependencies.effectiveUserId,
          ),
        );
        directories.push(childRelative);
        await walk(childAbsolute, childRelative, depth + 1);
        continue;
      }
      if (!entry.isFile()) throw new Error("unsupported tree entry");
      const hashed = await hashHeldRegularFile(
        childAbsolute,
        dependencies.effectiveUserId,
      );
      const mode = sourceFileMode(
        await fs.promises.lstat(childAbsolute, { bigint: true }),
      );
      const destinationMode =
        (mode & 0o100) === 0
          ? PRIVATE_FILE_MODE
          : PRIVATE_EXECUTABLE_MODE;
      bytes += Number(hashed.identity.size);
      if (bytes > dependencies.maxTotalBytes) {
        throw new Error("byte limit exceeded");
      }
      files.push(
        Object.freeze({
          relativePath: childRelative,
          bytes: Number(hashed.identity.size),
          sha256: hashed.sha256,
          sourceMode: expectedDestinationModes
            ? destinationMode
            : mode,
          destinationMode,
          identity: hashed.identity,
        }),
      );
    }
  };

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
): Promise<void> {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new Error("O_NOFOLLOW unavailable");
  const chunk = Buffer.alloc(Math.min(READ_CHUNK_BYTES, Math.max(1, file.bytes)));
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
  let zeroizationFailed = false;
  try {
    chunk.fill(0);
  } catch {
    zeroizationFailed = true;
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
  if (
    zeroizationFailed ||
    closeResults.some((result) => result.status === "rejected")
  ) {
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
    while (!failureObserved) {
      const index = nextIndex;
      if (index >= files.length) return;
      nextIndex += 1;
      const file = files[index];
      try {
        await copyInventoryFile(
          path.join(sourceRoot, ...file.relativePath.split("/")),
          path.join(destinationRoot, ...file.relativePath.split("/")),
          file,
          dependencies,
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
  };
  const workerCount = Math.min(dependencies.maxConcurrency, files.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.allSettled(workers);
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
    before.directories.every(
      (directory, index) =>
        directory === after.directories[index] &&
        sameIdentity(
          before.directoryIdentities[index],
          after.directoryIdentities[index],
        ),
    ) &&
    before.files.every(
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
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative));
  return contained(leftToRight) || contained(rightToLeft);
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
  let phase: CopyPhase = "capture";
  let destinationCreated = false;
  try {
    if (arguments.length !== 3) throw new Error("argument count differs");
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
        ...relativeDirectory.split("/"),
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
    for (const relativeDirectory of [...before.directories].reverse()) {
      await syncDirectory(
        path.join(destinationRoot, ...relativeDirectory.split("/")),
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
      before.destinationTreeSha256 !==
        destinationAfter.destinationTreeSha256
    ) {
      throw new Error("final tree identity differs");
    }
    return Object.freeze({
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
  } catch {
    throw new FloodgateV7CleanRoomCopyError(phase, destinationCreated);
  }
}

/**
 * Single-file companion used for the separately stored legacy exclusion input.
 * The destination parent must already be an exact private directory.
 */
export async function copyFloodgateV7CleanRoomFileByValueCoreForTests(
  sourceFileValue: string,
  destinationFileValue: string,
  dependenciesValue: FloodgateV7CleanRoomCopyDependencies,
): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
  let phase: CopyPhase = "capture";
  let destinationCreated = false;
  try {
    if (arguments.length !== 3) throw new Error("argument count differs");
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
    phase = "source-inventory";
    const before = await hashHeldRegularFile(
      sourceFile,
      dependencies.effectiveUserId,
    );
    const sourceStat = await fs.promises.lstat(sourceFile, { bigint: true });
    const sourceMode = sourceFileMode(sourceStat);
    const destinationMode =
      (sourceMode & 0o100) === 0
        ? PRIVATE_FILE_MODE
        : PRIVATE_EXECUTABLE_MODE;
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
    );
    phase = "callback";
    await dependencies.afterFileCopied?.(file.relativePath);
    await dependencies.beforeFinalRevalidation?.();
    phase = "revalidation";
    const sourceAfter = await hashHeldRegularFile(
      sourceFile,
      dependencies.effectiveUserId,
    );
    const destinationAfter = await hashHeldRegularFile(
      destinationFile,
      dependencies.effectiveUserId,
    );
    if (
      !sameIdentity(before.identity, sourceAfter.identity) ||
      before.sha256 !== sourceAfter.sha256 ||
      before.sha256 !== destinationAfter.sha256 ||
      destinationAfter.identity.nlink !== BigInt(1) ||
      (destinationAfter.identity.mode & MODE_MASK) !== BigInt(destinationMode) ||
      (before.identity.dev === destinationAfter.identity.dev &&
        before.identity.ino === destinationAfter.identity.ino)
    ) {
      throw new Error("final file identity differs");
    }
    await syncDirectory(destinationParent);
    return Object.freeze({
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
  } catch {
    throw new FloodgateV7CleanRoomCopyError(phase, destinationCreated);
  }
}
