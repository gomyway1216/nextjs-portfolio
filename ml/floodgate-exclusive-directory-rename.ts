import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { TextDecoder } from "node:util";

export const FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT =
  "darwin-renameatx-np-excl-nofollow-any-held-parent-source-v2" as const;
export const FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY =
  "trusted-current-euid-writer-private-0700-parent-v1" as const;
export const FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_PYTHON =
  "/usr/bin/python3" as const;
export const FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER = path.resolve(
  __dirname,
  "helpers/floodgate-exclusive-directory-rename.py",
);
export const FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER_SHA256 =
  "a10078ae3eda0e71ac8a8a4365d294ea00e8e607aba6eae81c3a52cf0aea066b" as const;

const DEFAULT_HELPER_TIMEOUT_MILLISECONDS = 5_000;
const DEFAULT_HELPER_MAX_OUTPUT_BYTES = 4_096;
const MAX_HELPER_SOURCE_BYTES = 65_536;
const SHA256_RE = /^[0-9a-f]{64}$/;
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const MODE_ALL_PERMISSION_AND_SPECIAL_BITS = BigInt(0o7777);
const MODE_GROUP_OR_OTHER_WRITABLE = BigInt(0o022);
const MODE_ANY_EXECUTABLE = BigInt(0o111);
const MODE_OWNER_ONLY_DIRECTORY = BigInt(0o700);
const MODE_READ_ONLY_HELPER = BigInt(0o644);

export interface FloodgateExclusiveDirectoryIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface FloodgateExclusiveDirectoryRenameReceipt {
  readonly contract: typeof FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT;
  readonly trust_boundary: typeof FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY;
  readonly status: "verified-committed";
  readonly parent_identity: Readonly<FloodgateExclusiveDirectoryIdentity>;
  readonly destination_identity: Readonly<FloodgateExclusiveDirectoryIdentity>;
}

export interface ExclusiveDirectoryRenameDependencies {
  readonly platform: NodeJS.Platform;
  readonly pythonExecutable: string;
  readonly helperPath: string;
  readonly helperSha256: string;
  readonly helperTimeoutMilliseconds: number;
  readonly helperMaxOutputBytes: number;
  readonly afterDestinationAbsenceCheckForTests?: () => void | Promise<void>;
}

export class FloodgateExclusiveRenameNotCommittedError extends Error {
  readonly mayHaveCommitted = false as const;

  constructor(message: string) {
    super(`Floodgate exclusive directory rename did not commit: ${message}`);
    this.name = "FloodgateExclusiveRenameNotCommittedError";
  }
}

export class FloodgateExclusiveRenameIndeterminateError extends Error {
  readonly mayHaveCommitted = true as const;

  constructor(message: string) {
    super(`Floodgate exclusive directory rename is indeterminate: ${message}`);
    this.name = "FloodgateExclusiveRenameIndeterminateError";
  }
}

const PRODUCTION_DEPENDENCIES = Object.freeze({
  platform: process.platform,
  pythonExecutable: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_PYTHON,
  helperPath: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER,
  helperSha256: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER_SHA256,
  helperTimeoutMilliseconds: DEFAULT_HELPER_TIMEOUT_MILLISECONDS,
  helperMaxOutputBytes: DEFAULT_HELPER_MAX_OUTPUT_BYTES,
});

interface HelperChildResult {
  readonly spawned: boolean;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly forcedReason?: string;
  readonly spawnError?: string;
}

type ReconciledLocation = "destination" | "other" | "source";

function failNotCommitted(message: string): never {
  throw new FloodgateExclusiveRenameNotCommittedError(message);
}

function failIndeterminate(message: string): never {
  throw new FloodgateExclusiveRenameIndeterminateError(message);
}

function canonicalAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    path.resolve(value) !== value ||
    path.parse(value).root === value
  ) {
    failNotCommitted(`${label} must be a canonical non-root absolute path`);
  }
  return value;
}

function identity(
  stat: fs.BigIntStats,
): Readonly<FloodgateExclusiveDirectoryIdentity> {
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

function sameIdentity(
  left: Readonly<FloodgateExclusiveDirectoryIdentity>,
  right: Readonly<FloodgateExclusiveDirectoryIdentity>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFileStat(
  left: fs.BigIntStats,
  right: fs.BigIntStats,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.nlink === right.nlink &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function currentEffectiveUserId(): bigint {
  if (typeof process.geteuid !== "function") {
    failNotCommitted("POSIX effective-user identity is required");
  }
  return BigInt(process.geteuid());
}

function assertOwnerOnlyDirectory(
  stat: fs.BigIntStats,
  effectiveUserId: bigint,
  label: string,
  mayHaveCommitted = false,
): void {
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== effectiveUserId ||
    (stat.mode & MODE_ALL_PERMISSION_AND_SPECIAL_BITS) !==
      MODE_OWNER_ONLY_DIRECTORY
  ) {
    const message = `${label} must be a current-euid-owned 0700 directory`;
    if (mayHaveCommitted) failIndeterminate(message);
    failNotCommitted(message);
  }
}

async function mustNotExist(target: string): Promise<void> {
  try {
    await fs.promises.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  failNotCommitted("destination already exists");
}

async function validateSystemPython(pythonExecutable: string): Promise<void> {
  if ((await fs.promises.realpath(pythonExecutable)) !== pythonExecutable) {
    failNotCommitted("Python executable must not traverse symbolic links");
  }
  const stat = await fs.promises.lstat(pythonExecutable, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== BIGINT_ZERO ||
    (stat.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== BIGINT_ZERO ||
    (stat.mode & MODE_ANY_EXECUTABLE) === BIGINT_ZERO
  ) {
    failNotCommitted(
      "Python executable must be a real root-owned non-writable executable",
    );
  }
}

async function readPinnedHelperSource(
  helperPath: string,
  expectedSha256: string,
  effectiveUserId: bigint,
): Promise<string> {
  if ((await fs.promises.realpath(helperPath)) !== helperPath) {
    failNotCommitted("helper path must not traverse symbolic links");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") {
    failNotCommitted("O_NOFOLLOW is required for the helper source");
  }
  const handle = await fs.promises.open(
    helperPath,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const before = await handle.stat({ bigint: true });
    const pathBefore = await fs.promises.lstat(helperPath, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.uid !== effectiveUserId ||
      before.nlink !== BIGINT_ONE ||
      (before.mode & MODE_ALL_PERMISSION_AND_SPECIAL_BITS) !==
        MODE_READ_ONLY_HELPER ||
      !sameStableFileStat(before, pathBefore) ||
      before.size <= BIGINT_ZERO ||
      before.size > BigInt(MAX_HELPER_SOURCE_BYTES)
    ) {
      failNotCommitted(
        "helper must be one current-euid-owned 0644 regular inode",
      );
    }
    const bytes = await handle.readFile();
    const [after, pathAfter] = await Promise.all([
      handle.stat({ bigint: true }),
      fs.promises.lstat(helperPath, { bigint: true }),
    ]);
    if (
      !sameStableFileStat(before, after) ||
      !sameStableFileStat(after, pathAfter) ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      failNotCommitted("helper inode changed while it was read");
    }
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== expectedSha256) {
      failNotCommitted("helper SHA-256 differs from the pinned source");
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return failNotCommitted("helper source is not strict UTF-8");
    }
  } finally {
    await handle.close();
  }
}

function helperDiagnostic(result: Readonly<HelperChildResult>): string {
  const details = [
    result.forcedReason,
    result.spawnError,
    result.stderr.trim(),
    result.stdout.trim(),
  ].filter((value): value is string => Boolean(value));
  return (
    details.join("; ") ||
    `code=${String(result.code)}, signal=${String(result.signal)}`
  );
}

async function runPinnedHelperChild(
  mode: "inspect" | "rename",
  parentFd: number,
  sourceFd: number,
  sourceBasename: string,
  destinationBasename: string,
  expectedSource: Readonly<FloodgateExclusiveDirectoryIdentity>,
  helperSource: string,
  dependencies: Readonly<ExclusiveDirectoryRenameDependencies>,
): Promise<Readonly<HelperChildResult>> {
  return new Promise((resolve) => {
    const helperEnvironment: NodeJS.ProcessEnv = Object.freeze({
      NODE_ENV: "production",
      LANG: "C",
      LC_ALL: "C",
      PYTHONHASHSEED: "0",
    });
    const spawnOptions: SpawnOptions = {
      cwd: "/",
      env: helperEnvironment,
      stdio: ["ignore", "pipe", "pipe", parentFd, sourceFd],
    };
    const child: ChildProcess = spawn(
      dependencies.pythonExecutable,
      [
        "-I",
        "-S",
        "-c",
        helperSource,
        mode,
        sourceBasename,
        destinationBasename,
        expectedSource.dev.toString(10),
        expectedSource.ino.toString(10),
      ],
      spawnOptions,
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    let spawned = false;
    let spawnError: string | undefined;
    let forcedReason: string | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const forceStop = (reason: string): void => {
      if (forcedReason !== undefined) return;
      forcedReason = reason;
      child.kill("SIGKILL");
    };
    const capture = (chunks: Buffer[], chunkInput: Buffer): void => {
      if (forcedReason !== undefined) return;
      const chunk = Buffer.isBuffer(chunkInput)
        ? chunkInput
        : Buffer.from(chunkInput);
      capturedBytes += chunk.byteLength;
      if (capturedBytes > dependencies.helperMaxOutputBytes) {
        forceStop("helper output exceeded the fixed byte limit");
        return;
      }
      chunks.push(chunk);
    };

    if (child.stdout === null || child.stderr === null) {
      forceStop("helper pipes are unavailable");
    } else {
      child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
    }
    child.once("spawn", () => {
      spawned = true;
      if (forcedReason !== undefined) {
        child.kill("SIGKILL");
        return;
      }
      timeout = setTimeout(() => {
        forceStop(
          `helper exceeded ${dependencies.helperTimeoutMilliseconds} milliseconds`,
        );
      }, dependencies.helperTimeoutMilliseconds);
    });
    child.once("error", (error) => {
      spawnError = error instanceof Error ? error.message : String(error);
    });
    child.once("close", (code, signal) => {
      if (timeout !== undefined) clearTimeout(timeout);
      resolve(
        Object.freeze({
          spawned,
          code,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          ...(forcedReason === undefined ? {} : { forcedReason }),
          ...(spawnError === undefined ? {} : { spawnError }),
        }),
      );
    });
  });
}

function parseInspectionResult(
  result: Readonly<HelperChildResult>,
): ReconciledLocation | undefined {
  if (
    !result.spawned ||
    result.code !== 0 ||
    result.signal !== null ||
    result.forcedReason !== undefined ||
    result.spawnError !== undefined ||
    result.stderr !== ""
  ) {
    return undefined;
  }
  if (
    result.stdout === "source\n" ||
    result.stdout === "destination\n" ||
    result.stdout === "other\n"
  ) {
    return result.stdout.slice(0, -1) as ReconciledLocation;
  }
  return undefined;
}

/**
 * Move one caller-held 0700 source directory to an absent sibling without replacement.
 *
 * The caller owns `sourceDirectoryHandle` and must keep it open and unmodified until this
 * promise settles. A success receipt is an observed namespace fact, not crash durability or
 * content-integrity evidence. The caller must gate consumption on that receipt and later fsync.
 */
export async function exclusiveRenameFloodgateDirectory(
  sourceInput: string,
  destinationInput: string,
  sourceDirectoryHandle: fs.promises.FileHandle,
): Promise<Readonly<FloodgateExclusiveDirectoryRenameReceipt>> {
  return exclusiveRenameFloodgateDirectoryCoreForTests(
    sourceInput,
    destinationInput,
    sourceDirectoryHandle,
    PRODUCTION_DEPENDENCIES,
  );
}

/** Explicit dependency seam for failure, race, and unsupported-platform tests. */
export async function exclusiveRenameFloodgateDirectoryCoreForTests(
  sourceInput: string,
  destinationInput: string,
  sourceDirectoryHandle: fs.promises.FileHandle,
  dependenciesInput: Readonly<ExclusiveDirectoryRenameDependencies>,
): Promise<Readonly<FloodgateExclusiveDirectoryRenameReceipt>> {
  let parentHandle: fs.promises.FileHandle | undefined;
  let helperSpawned = false;
  let testHookEffectsUnreconciled = false;
  let receipt: Readonly<FloodgateExclusiveDirectoryRenameReceipt> | undefined;
  let failure: unknown;

  try {
    const source = canonicalAbsolutePath(sourceInput, "source");
    const destination = canonicalAbsolutePath(destinationInput, "destination");
    if (
      !sourceDirectoryHandle ||
      typeof sourceDirectoryHandle !== "object" ||
      !Number.isSafeInteger(sourceDirectoryHandle.fd) ||
      sourceDirectoryHandle.fd < 0 ||
      typeof sourceDirectoryHandle.stat !== "function"
    ) {
      failNotCommitted("caller-held source directory handle is invalid");
    }
    if (
      !dependenciesInput ||
      typeof dependenciesInput !== "object" ||
      typeof dependenciesInput.platform !== "string" ||
      typeof dependenciesInput.pythonExecutable !== "string" ||
      typeof dependenciesInput.helperPath !== "string" ||
      typeof dependenciesInput.helperSha256 !== "string" ||
      !SHA256_RE.test(dependenciesInput.helperSha256) ||
      !Number.isSafeInteger(dependenciesInput.helperTimeoutMilliseconds) ||
      dependenciesInput.helperTimeoutMilliseconds < 1 ||
      dependenciesInput.helperTimeoutMilliseconds > 60_000 ||
      !Number.isSafeInteger(dependenciesInput.helperMaxOutputBytes) ||
      dependenciesInput.helperMaxOutputBytes < 64 ||
      dependenciesInput.helperMaxOutputBytes > 65_536 ||
      (dependenciesInput.afterDestinationAbsenceCheckForTests !== undefined &&
        typeof dependenciesInput.afterDestinationAbsenceCheckForTests !==
          "function")
    ) {
      failNotCommitted("dependencies are invalid");
    }
    const dependencies = Object.freeze({
      platform: dependenciesInput.platform,
      pythonExecutable: canonicalAbsolutePath(
        dependenciesInput.pythonExecutable,
        "Python executable",
      ),
      helperPath: canonicalAbsolutePath(
        dependenciesInput.helperPath,
        "helper path",
      ),
      helperSha256: dependenciesInput.helperSha256,
      helperTimeoutMilliseconds: dependenciesInput.helperTimeoutMilliseconds,
      helperMaxOutputBytes: dependenciesInput.helperMaxOutputBytes,
      afterDestinationAbsenceCheckForTests:
        dependenciesInput.afterDestinationAbsenceCheckForTests,
    });
    if (dependencies.platform !== "darwin") {
      failNotCommitted(
        "platform does not provide the pinned Darwin no-replace primitive",
      );
    }

    const sourceParent = path.dirname(source);
    const destinationParent = path.dirname(destination);
    if (sourceParent !== destinationParent || source === destination) {
      failNotCommitted("source and destination must be distinct siblings");
    }
    const effectiveUserId = currentEffectiveUserId();
    await validateSystemPython(dependencies.pythonExecutable);
    const helperSource = await readPinnedHelperSource(
      dependencies.helperPath,
      dependencies.helperSha256,
      effectiveUserId,
    );

    const parentRealpath = await fs.promises.realpath(sourceParent);
    if (parentRealpath !== sourceParent) {
      failNotCommitted("parent directory must not traverse symbolic links");
    }
    const noFollow = fs.constants.O_NOFOLLOW;
    const directoryFlag = fs.constants.O_DIRECTORY;
    if (typeof noFollow !== "number" || typeof directoryFlag !== "number") {
      failNotCommitted("O_NOFOLLOW and O_DIRECTORY are required");
    }
    parentHandle = await fs.promises.open(
      sourceParent,
      fs.constants.O_RDONLY | noFollow | directoryFlag,
    );
    const parentBefore = await parentHandle.stat({ bigint: true });
    const sourceHeldBefore = await sourceDirectoryHandle.stat({ bigint: true });
    assertOwnerOnlyDirectory(parentBefore, effectiveUserId, "held parent");
    assertOwnerOnlyDirectory(
      sourceHeldBefore,
      effectiveUserId,
      "caller-held source",
    );
    const parentIdentity = identity(parentBefore);
    const sourceIdentity = identity(sourceHeldBefore);

    const [parentPathBefore, sourcePathBefore] = await Promise.all([
      fs.promises.lstat(sourceParent, { bigint: true }),
      fs.promises.lstat(source, { bigint: true }),
    ]);
    assertOwnerOnlyDirectory(
      parentPathBefore,
      effectiveUserId,
      "parent pathname",
    );
    assertOwnerOnlyDirectory(
      sourcePathBefore,
      effectiveUserId,
      "source pathname",
    );
    if (
      !sameIdentity(parentIdentity, identity(parentPathBefore)) ||
      !sameIdentity(sourceIdentity, identity(sourcePathBefore)) ||
      (await fs.promises.realpath(source)) !== source
    ) {
      failNotCommitted(
        "held descriptors do not match their requested pathnames",
      );
    }

    await mustNotExist(destination);
    if (dependencies.afterDestinationAbsenceCheckForTests !== undefined) {
      testHookEffectsUnreconciled = true;
      await dependencies.afterDestinationAbsenceCheckForTests();
    }
    const renameResult = await runPinnedHelperChild(
      "rename",
      parentHandle.fd,
      sourceDirectoryHandle.fd,
      path.basename(source),
      path.basename(destination),
      sourceIdentity,
      helperSource,
      dependencies,
    );
    helperSpawned = renameResult.spawned;
    if (!renameResult.spawned) {
      failNotCommitted(
        `helper did not start: ${helperDiagnostic(renameResult)}`,
      );
    }

    const inspectResult = await runPinnedHelperChild(
      "inspect",
      parentHandle.fd,
      sourceDirectoryHandle.fd,
      path.basename(source),
      path.basename(destination),
      sourceIdentity,
      helperSource,
      dependencies,
    );
    const reconciledLocation = parseInspectionResult(inspectResult);
    if (reconciledLocation === undefined) {
      failIndeterminate(
        `state reconciliation failed after ${helperDiagnostic(renameResult)}; ` +
          helperDiagnostic(inspectResult),
      );
    }
    if (reconciledLocation === "source") {
      testHookEffectsUnreconciled = false;
      failNotCommitted(
        `held source remained at source: ${helperDiagnostic(renameResult)}`,
      );
    }
    if (reconciledLocation !== "destination") {
      failIndeterminate(
        `held source was not at one exclusive name: ${helperDiagnostic(renameResult)}`,
      );
    }
    testHookEffectsUnreconciled = false;

    const [parentAfter, parentPathAfter, sourceHeldAfter, destinationAfter] =
      await Promise.all([
        parentHandle.stat({ bigint: true }),
        fs.promises.lstat(sourceParent, { bigint: true }),
        sourceDirectoryHandle.stat({ bigint: true }),
        fs.promises.lstat(destination, { bigint: true }),
      ]);
    if (
      !sameIdentity(parentIdentity, identity(parentAfter)) ||
      !sameIdentity(parentIdentity, identity(parentPathAfter)) ||
      !sameIdentity(sourceIdentity, identity(sourceHeldAfter)) ||
      !sameIdentity(sourceIdentity, identity(destinationAfter))
    ) {
      failIndeterminate("filesystem identity changed after reconciliation");
    }
    assertOwnerOnlyDirectory(
      parentAfter,
      effectiveUserId,
      "held parent after rename",
      true,
    );
    assertOwnerOnlyDirectory(
      parentPathAfter,
      effectiveUserId,
      "parent pathname after rename",
      true,
    );
    assertOwnerOnlyDirectory(
      sourceHeldAfter,
      effectiveUserId,
      "held source after rename",
      true,
    );
    assertOwnerOnlyDirectory(
      destinationAfter,
      effectiveUserId,
      "destination after rename",
      true,
    );
    try {
      await fs.promises.lstat(source);
      failIndeterminate("source pathname exists after verified rename");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    receipt = Object.freeze({
      contract: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
      trust_boundary: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
      status: "verified-committed",
      parent_identity: parentIdentity,
      destination_identity: sourceIdentity,
    });
  } catch (error) {
    failure = error;
  }

  if (parentHandle !== undefined) {
    try {
      await parentHandle.close();
    } catch (error) {
      if (failure === undefined) failure = error;
    }
  }
  if (failure !== undefined) {
    if (failure instanceof FloodgateExclusiveRenameIndeterminateError) {
      throw failure;
    }
    const message =
      failure instanceof Error ? failure.message : String(failure);
    if (testHookEffectsUnreconciled) {
      failIndeterminate(`test hook effects were not reconciled: ${message}`);
    }
    if (failure instanceof FloodgateExclusiveRenameNotCommittedError) {
      throw failure;
    }
    if (helperSpawned) failIndeterminate(message);
    failNotCommitted(message);
  }
  if (receipt === undefined) {
    return failIndeterminate("verified receipt was not constructed");
  }
  return receipt;
}
