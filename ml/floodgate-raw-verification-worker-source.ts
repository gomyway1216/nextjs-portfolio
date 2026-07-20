/**
 * Held-inode source closure for the production raw-verification worker.
 *
 * The checked-in CJS bundle contains every application dependency and has
 * Node builtins as its only external imports. Production passes the verified
 * source bytes to `Worker(..., { eval: true })`; a worker never resolves this
 * pathname, TypeScript, tsx, or a package after spawn.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SCHEMA =
  "shogi-floodgate-raw-verification-worker-bundle-v1" as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_RELATIVE_PATH =
  "ml/floodgate-raw-verification-worker.cjs" as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_BYTES = 54_297 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SHA256 =
  "21e96f036d663d4ffea2f90abf49d638958e7798950f0e72dfce7286fb525f09" as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_REQUIRED_NODE_VERSION =
  "v22.13.0" as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_TRANSITIVE_SOURCES =
  Object.freeze([
    "ml/floodgate-raw-lock.ts",
    "ml/floodgate-raw-verification-worker-protocol.ts",
    "ml/floodgate-raw-verification-worker.ts",
    "ml/floodgate-source.ts",
  ] as const);
export const FLOODGATE_RAW_VERIFICATION_WORKER_RUNTIME_CLOSURE =
  "self-contained-cjs-eval-with-node-builtins-only-and-same-process-node-worker-runtime-v1" as const;

export interface FloodgateRawVerificationWorkerRuntimeIdentity {
  readonly node_version: string;
  readonly v8_version: string;
  readonly modules_abi: string;
  readonly executable_path: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
}

export interface FloodgateRawVerificationWorkerBundleIdentity {
  readonly schema: typeof FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SCHEMA;
  readonly relative_path: typeof FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_RELATIVE_PATH;
  readonly bytes: typeof FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_BYTES;
  readonly sha256: typeof FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SHA256;
  readonly transitive_sources: typeof FLOODGATE_RAW_VERIFICATION_WORKER_TRANSITIVE_SOURCES;
  readonly runtime_closure: typeof FLOODGATE_RAW_VERIFICATION_WORKER_RUNTIME_CLOSURE;
  readonly runtime: FloodgateRawVerificationWorkerRuntimeIdentity;
}

export interface FloodgateRawVerificationWorkerBundleLease {
  readonly source: string;
  readonly identity: Readonly<FloodgateRawVerificationWorkerBundleIdentity>;
  assertUnchangedAndClose(): void;
}

interface FileIdentity {
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
}

function fail(message: string): never {
  throw new Error(
    `invalid Floodgate raw-verification worker source closure: ${message}`,
  );
}

function identity(stat: fs.BigIntStats): FileIdentity {
  return Object.freeze({
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
  });
}

function sameIdentity(
  left: Readonly<FileIdentity>,
  right: Readonly<FileIdentity>,
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
    left.ctimeNs === right.ctimeNs
  );
}

function canonicalRoot(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !path.isAbsolute(value) ||
    path.normalize(value) !== value
  ) {
    fail("repository root must be a canonical absolute path");
  }
  const stat = fs.lstatSync(value, { bigint: true });
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync.native(value) !== value
  ) {
    fail("repository root must be a real canonical directory");
  }
  return value;
}

function exactRelativePath(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    path.isAbsolute(value) ||
    path.normalize(value) !== value ||
    value.split(path.sep).some((part) => part === "" || part === "..")
  ) {
    fail("bundle relative path is invalid");
  }
  return value;
}

function readExact(
  descriptor: number,
  expectedBytes: number,
  label: string,
): Buffer {
  const bytes = Buffer.alloc(expectedBytes);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = fs.readSync(
      descriptor,
      bytes,
      offset,
      bytes.byteLength - offset,
      offset,
    );
    if (count === 0) fail(`${label} shortened while reading`);
    offset += count;
  }
  const extra = Buffer.alloc(1);
  if (fs.readSync(descriptor, extra, 0, 1, offset) !== 0) {
    fail(`${label} grew while reading`);
  }
  return bytes;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertRegularOwnedSingleLink(
  stat: fs.BigIntStats,
  label: string,
): void {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1)) {
    fail(`${label} must be a single-link regular file`);
  }
  if (
    typeof process.geteuid === "function" &&
    stat.uid !== BigInt(process.geteuid())
  ) {
    fail(`${label} must be owned by the current effective user`);
  }
  if ((stat.mode & BigInt(0o022)) !== BigInt(0)) {
    fail(`${label} must not be group- or world-writable`);
  }
}

function openDirectoryNoFollow(directoryPath: string, label: string): number {
  const noFollow = fs.constants.O_NOFOLLOW;
  const directory = fs.constants.O_DIRECTORY;
  if (typeof noFollow !== "number" || typeof directory !== "number") {
    fail("O_NOFOLLOW and O_DIRECTORY are required");
  }
  const descriptor = fs.openSync(
    directoryPath,
    fs.constants.O_RDONLY | noFollow | directory,
  );
  const stat = fs.fstatSync(descriptor, { bigint: true });
  if (
    !stat.isDirectory() ||
    fs.realpathSync.native(directoryPath) !== directoryPath
  ) {
    fs.closeSync(descriptor);
    fail(`${label} must be a real canonical directory`);
  }
  return descriptor;
}

function runtimeIdentity(): FloodgateRawVerificationWorkerRuntimeIdentity {
  if (
    process.version !== FLOODGATE_RAW_VERIFICATION_WORKER_REQUIRED_NODE_VERSION
  ) {
    fail(
      `Node ${FLOODGATE_RAW_VERIFICATION_WORKER_REQUIRED_NODE_VERSION} is required, got ${process.version}`,
    );
  }
  const executablePath = process.execPath;
  if (
    !path.isAbsolute(executablePath) ||
    path.normalize(executablePath) !== executablePath ||
    fs.realpathSync.native(executablePath) !== executablePath
  ) {
    fail("Node executable path must be canonical and must not be a symlink");
  }
  const executable = fs.lstatSync(executablePath, { bigint: true });
  assertRegularOwnedSingleLink(executable, "Node executable");
  return Object.freeze({
    node_version: process.version,
    v8_version: process.versions.v8,
    modules_abi: process.versions.modules,
    executable_path: executablePath,
    platform: process.platform,
    architecture: process.arch,
  });
}

function closeDescriptors(descriptors: readonly number[]): void {
  let failure: unknown;
  for (const descriptor of [...descriptors].reverse()) {
    try {
      fs.closeSync(descriptor);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

function captureBundle(
  repositoryRootInput: string,
  relativePathInput: string,
  expectedBytes: number,
  expectedSha256: string,
  runtime: FloodgateRawVerificationWorkerRuntimeIdentity,
): FloodgateRawVerificationWorkerBundleLease {
  const repositoryRoot = canonicalRoot(repositoryRootInput);
  const relativePath = exactRelativePath(relativePathInput);
  if (
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    !/^[0-9a-f]{64}$/u.test(expectedSha256)
  ) {
    fail("expected bundle identity is invalid");
  }
  const bundlePath = path.join(repositoryRoot, ...relativePath.split("/"));
  const parentPath = path.dirname(bundlePath);
  if (
    path.relative(repositoryRoot, bundlePath).startsWith(`..${path.sep}`) ||
    fs.realpathSync.native(parentPath) !== parentPath
  ) {
    fail("bundle path escapes or traverses a symlink");
  }

  const rootDescriptor = openDirectoryNoFollow(
    repositoryRoot,
    "repository root",
  );
  const parentDescriptor = openDirectoryNoFollow(parentPath, "bundle parent");
  let bundleDescriptor: number | undefined;
  try {
    bundleDescriptor = fs.openSync(
      bundlePath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const rootBefore = identity(fs.fstatSync(rootDescriptor, { bigint: true }));
    const parentBefore = identity(
      fs.fstatSync(parentDescriptor, { bigint: true }),
    );
    const fileBeforeStat = fs.fstatSync(bundleDescriptor, { bigint: true });
    assertRegularOwnedSingleLink(fileBeforeStat, "worker bundle");
    const fileBefore = identity(fileBeforeStat);
    const pathBeforeStat = fs.lstatSync(bundlePath, { bigint: true });
    if (
      fs.realpathSync.native(bundlePath) !== bundlePath ||
      !sameIdentity(fileBefore, identity(pathBeforeStat)) ||
      fileBefore.size !== BigInt(expectedBytes)
    ) {
      fail("worker bundle pathname does not bind the held file");
    }
    const bytes = readExact(bundleDescriptor, expectedBytes, "worker bundle");
    const fileAfterRead = identity(
      fs.fstatSync(bundleDescriptor, { bigint: true }),
    );
    if (
      !sameIdentity(fileBefore, fileAfterRead) ||
      sha256(bytes) !== expectedSha256
    ) {
      fail("worker bundle bytes or identity do not match the pinned manifest");
    }
    const source = bytes.toString("utf8");
    if (
      source.includes("\0") ||
      !Buffer.from(source, "utf8").equals(bytes) ||
      !source.startsWith('"use strict";')
    ) {
      fail("worker bundle must be canonical standalone UTF-8 CJS");
    }

    let closed = false;
    const descriptors = [
      rootDescriptor,
      parentDescriptor,
      bundleDescriptor,
    ] as const;
    return Object.freeze({
      source,
      identity: Object.freeze({
        schema: FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SCHEMA,
        relative_path: FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_RELATIVE_PATH,
        bytes: FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_BYTES,
        sha256: FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SHA256,
        transitive_sources:
          FLOODGATE_RAW_VERIFICATION_WORKER_TRANSITIVE_SOURCES,
        runtime_closure: FLOODGATE_RAW_VERIFICATION_WORKER_RUNTIME_CLOSURE,
        runtime,
      }),
      assertUnchangedAndClose(): void {
        if (closed) fail("worker bundle lease was already closed");
        closed = true;
        let primary: unknown;
        try {
          const rootAfter = identity(
            fs.fstatSync(rootDescriptor, { bigint: true }),
          );
          const parentAfter = identity(
            fs.fstatSync(parentDescriptor, { bigint: true }),
          );
          const fileAfter = identity(
            fs.fstatSync(bundleDescriptor as number, { bigint: true }),
          );
          const pathAfter = identity(
            fs.lstatSync(bundlePath, { bigint: true }),
          );
          if (
            !sameIdentity(rootBefore, rootAfter) ||
            !sameIdentity(
              rootAfter,
              identity(fs.lstatSync(repositoryRoot, { bigint: true })),
            ) ||
            !sameIdentity(parentBefore, parentAfter) ||
            !sameIdentity(
              parentAfter,
              identity(fs.lstatSync(parentPath, { bigint: true })),
            ) ||
            !sameIdentity(fileBefore, fileAfter) ||
            !sameIdentity(fileAfter, pathAfter) ||
            fs.realpathSync.native(repositoryRoot) !== repositoryRoot ||
            fs.realpathSync.native(parentPath) !== parentPath ||
            fs.realpathSync.native(bundlePath) !== bundlePath
          ) {
            fail("worker bundle or its pathname changed while workers ran");
          }
          const finalBytes = readExact(
            bundleDescriptor as number,
            expectedBytes,
            "worker bundle postflight",
          );
          if (
            !finalBytes.equals(bytes) ||
            sha256(finalBytes) !== expectedSha256
          ) {
            fail("worker bundle bytes changed while workers ran");
          }
        } catch (error) {
          primary = error;
          throw error;
        } finally {
          try {
            closeDescriptors(descriptors);
          } catch (closeError) {
            if (primary === undefined) throw closeError;
          }
        }
      },
    });
  } catch (error) {
    closeDescriptors(
      bundleDescriptor === undefined
        ? [rootDescriptor, parentDescriptor]
        : [rootDescriptor, parentDescriptor, bundleDescriptor],
    );
    throw error;
  }
}

/** Open the one production-pinned worker source and hold its inode to drain. */
export function capturePinnedFloodgateRawVerificationWorkerBundle(
  repositoryRoot: string,
): FloodgateRawVerificationWorkerBundleLease {
  return captureBundle(
    repositoryRoot,
    FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_RELATIVE_PATH,
    FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_BYTES,
    FLOODGATE_RAW_VERIFICATION_WORKER_BUNDLE_SHA256,
    runtimeIdentity(),
  );
}

/** Filesystem-adversary seam; it does not authorize a production worker. */
export function captureFloodgateRawVerificationWorkerBundleCoreForTests(
  repositoryRoot: string,
  relativePath: string,
  expectedBytes: number,
  expectedSha256: string,
): FloodgateRawVerificationWorkerBundleLease {
  return captureBundle(
    repositoryRoot,
    relativePath,
    expectedBytes,
    expectedSha256,
    Object.freeze({
      node_version: process.version,
      v8_version: process.versions.v8,
      modules_abi: process.versions.modules,
      executable_path: process.execPath,
      platform: process.platform,
      architecture: process.arch,
    }),
  );
}
