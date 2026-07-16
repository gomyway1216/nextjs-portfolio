import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const FLOODGATE_GIT_EXECUTABLE = "/usr/bin/git" as const;

/** Fixed environment for Git commands that form Floodgate provenance claims. */
export const FLOODGATE_GIT_FIXED_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_GRAFT_FILE: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C",
  LANG: "C",
} as const);

/** Global options for every Git command that contributes provenance evidence. */
export const FLOODGATE_GIT_COMMAND_PREFIX = Object.freeze([
  "--no-replace-objects",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
  "-c",
  "core.preloadIndex=false",
  "-c",
  "core.ignoreStat=false",
  "-c",
  "core.trustctime=true",
  "-c",
  "core.checkStat=default",
] as const);

/**
 * Remove inherited Git/locale controls before checking repository identity or
 * ancestry. In particular, `--no-replace-objects` does not disable grafts.
 */
export function floodgateGitEnvironment(
  inherited: Readonly<Record<string, string | undefined>> = process.env,
): NodeJS.ProcessEnv {
  const nodeEnvironment = inherited.NODE_ENV;
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV:
      nodeEnvironment === "development" ||
      nodeEnvironment === "test" ||
      nodeEnvironment === "production"
        ? nodeEnvironment
        : "production",
  };
  for (const [key, value] of Object.entries(inherited)) {
    const upper = key.toUpperCase();
    if (
      value !== undefined &&
      !upper.startsWith("GIT_") &&
      !upper.startsWith("DYLD_") &&
      !upper.startsWith("LD_") &&
      upper !== "NODE_ENV" &&
      upper !== "LC_ALL" &&
      upper !== "LANG" &&
      upper !== "LANGUAGE"
    ) {
      environment[key] = value;
    }
  }
  return Object.assign(environment, FLOODGATE_GIT_FIXED_ENVIRONMENT);
}

/** Reject assume-unchanged, skip-worktree, unmerged, or other special flags. */
export function floodgateGitTrackedEntriesAreOrdinary(output: string): boolean {
  if (typeof output !== "string") return false;
  if (output === "") return true;
  if (!output.endsWith("\0")) return false;
  return output
    .slice(0, -1)
    .split("\0")
    .every((entry) => entry.length > 2 && entry.startsWith("H "));
}

interface FloodgateGitTreeEntry {
  readonly mode: "100644" | "100755" | "120000";
  readonly object: string;
  readonly bytes: number;
  readonly path: string;
}

function nulRecords(output: string, label: string): readonly string[] {
  if (output === "") return [];
  if (!output.endsWith("\0")) {
    throw new Error(`invalid Floodgate Git ${label}: missing NUL framing`);
  }
  return output.slice(0, -1).split("\0");
}

function parseHeadTree(output: string): readonly FloodgateGitTreeEntry[] {
  return nulRecords(output, "HEAD tree").map((record) => {
    const tab = record.indexOf("\t");
    const header = tab < 0 ? [] : record.slice(0, tab).split(/ +/u);
    const entryPath = tab < 0 ? "" : record.slice(tab + 1);
    const bytes = header.length === 4 ? Number(header[3]) : Number.NaN;
    if (
      header.length !== 4 ||
      header[1] !== "blob" ||
      (header[0] !== "100644" &&
        header[0] !== "100755" &&
        header[0] !== "120000") ||
      !/^[0-9a-f]+$/.test(header[2]) ||
      !/^(?:0|[1-9][0-9]*)$/u.test(header[3] ?? "") ||
      !Number.isSafeInteger(bytes) ||
      entryPath.length === 0 ||
      path.isAbsolute(entryPath) ||
      path.normalize(entryPath) !== entryPath ||
      entryPath.split("/").some((part) => part === "" || part === "..")
    ) {
      throw new Error("invalid Floodgate Git HEAD tree entry");
    }
    return Object.freeze({
      mode: header[0],
      object: header[2],
      bytes,
      path: entryPath,
    }) as FloodgateGitTreeEntry;
  });
}

function parseIndex(output: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const record of nulRecords(output, "index")) {
    const tab = record.indexOf("\t");
    const header = tab < 0 ? [] : record.slice(0, tab).split(" ");
    const entryPath = tab < 0 ? "" : record.slice(tab + 1);
    if (
      header.length !== 3 ||
      header[2] !== "0" ||
      !/^(?:100644|100755|120000)$/.test(header[0]) ||
      !/^[0-9a-f]+$/.test(header[1]) ||
      entryPath.length === 0 ||
      entries.has(entryPath)
    ) {
      throw new Error("invalid Floodgate Git index entry");
    }
    entries.set(entryPath, `${header[0]} ${header[1]}`);
  }
  return entries;
}

function gitBlobId(bytes: Uint8Array, algorithm: "sha1" | "sha256"): string {
  return createHash(algorithm)
    .update(`blob ${bytes.byteLength}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

function sameStat(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs &&
    left.nlink === right.nlink
  );
}

function readExactTrackedBytes(
  descriptor: number,
  expectedBytes: number,
  entryPath: string,
): Uint8Array {
  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = fs.readSync(
      descriptor,
      bytes,
      offset,
      bytes.byteLength - offset,
      null,
    );
    if (count === 0) {
      throw new Error(`tracked file shortened while reading: ${entryPath}`);
    }
    offset += count;
  }
  const extra = new Uint8Array(1);
  if (fs.readSync(descriptor, extra, 0, 1, null) !== 0) {
    throw new Error(`tracked file grew while reading: ${entryPath}`);
  }
  return bytes;
}

function readTrackedBlob(
  repositoryRoot: string,
  entry: Readonly<FloodgateGitTreeEntry>,
): Uint8Array {
  const filePath = path.join(repositoryRoot, entry.path);
  if (entry.mode === "120000") {
    const parent = path.dirname(filePath);
    if (fs.realpathSync.native(parent) !== parent) {
      throw new Error(`tracked symlink parent is not canonical: ${entry.path}`);
    }
    const before = fs.lstatSync(filePath, { bigint: true });
    if (!before.isSymbolicLink()) {
      throw new Error(
        `tracked path is not the recorded symlink: ${entry.path}`,
      );
    }
    const bytes = fs.readlinkSync(filePath, { encoding: "buffer" });
    const after = fs.lstatSync(filePath, { bigint: true });
    if (
      before.size !== BigInt(entry.bytes) ||
      !sameStat(before, after) ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      throw new Error(`tracked symlink changed while hashing: ${entry.path}`);
    }
    return new Uint8Array(bytes);
  }
  if (fs.realpathSync.native(filePath) !== filePath) {
    throw new Error(`tracked file traverses a symbolic link: ${entry.path}`);
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  const nonblock = fs.constants.O_NONBLOCK;
  if (typeof noFollow !== "number" || typeof nonblock !== "number") {
    throw new Error(
      "Floodgate Git verification requires O_NOFOLLOW/O_NONBLOCK",
    );
  }
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow | nonblock);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile()) {
      throw new Error(`tracked path is not a regular file: ${entry.path}`);
    }
    const executable = (before.mode & BigInt(0o111)) !== BigInt(0);
    if ((entry.mode === "100755") !== executable) {
      throw new Error(`tracked executable mode changed: ${entry.path}`);
    }
    if (before.size !== BigInt(entry.bytes)) {
      throw new Error(`tracked file size differs from HEAD: ${entry.path}`);
    }
    const bytes = readExactTrackedBytes(fd, entry.bytes, entry.path);
    const after = fs.fstatSync(fd, { bigint: true });
    const pathAfter = fs.lstatSync(filePath, { bigint: true });
    if (
      !sameStat(before, after) ||
      !sameStat(after, pathAfter) ||
      BigInt(bytes.byteLength) !== after.size ||
      fs.realpathSync.native(filePath) !== filePath
    ) {
      throw new Error(`tracked file changed while hashing: ${entry.path}`);
    }
    return new Uint8Array(bytes);
  } finally {
    fs.closeSync(fd);
  }
}

async function fixedGitOutput(
  repositoryRoot: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFile(
    FLOODGATE_GIT_EXECUTABLE,
    [...FLOODGATE_GIT_COMMAND_PREFIX, ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: floodgateGitEnvironment(),
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return stdout;
}

const FLOODGATE_FULL_GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

interface FloodgateGitCleanRevisionContext {
  readonly repositoryStat: fs.BigIntStats;
  readonly topLevel: string;
  readonly head: string;
  readonly status: string;
  readonly trackedFlags: string;
}

function assertFloodgateCanonicalRepositoryRoot(
  repositoryRoot: string,
): fs.BigIntStats {
  if (
    typeof repositoryRoot !== "string" ||
    repositoryRoot.length === 0 ||
    repositoryRoot.includes("\0") ||
    repositoryRoot.includes("\n") ||
    repositoryRoot.includes("\r") ||
    !path.isAbsolute(repositoryRoot) ||
    path.normalize(repositoryRoot) !== repositoryRoot
  ) {
    throw new Error(
      "Floodgate Git repository root must be a canonical absolute path",
    );
  }
  const before = fs.lstatSync(repositoryRoot, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new Error("Floodgate Git repository root must be a real directory");
  }
  if (fs.realpathSync.native(repositoryRoot) !== repositoryRoot) {
    throw new Error(
      "Floodgate Git repository root must not traverse symbolic links",
    );
  }
  const after = fs.lstatSync(repositoryRoot, { bigint: true });
  if (!sameStat(before, after)) {
    throw new Error(
      "Floodgate Git repository root changed during canonicalization",
    );
  }
  return after;
}

function parseFloodgateGitLine(output: string, label: string): string {
  if (
    typeof output !== "string" ||
    !output.endsWith("\n") ||
    output.length <= 1 ||
    output.slice(0, -1).includes("\n") ||
    output.includes("\r") ||
    output.includes("\0")
  ) {
    throw new Error(`invalid Floodgate Git ${label} output`);
  }
  return output.slice(0, -1);
}

async function captureFloodgateGitCleanRevisionContext(
  repositoryRoot: string,
  expectedRevision: string,
): Promise<Readonly<FloodgateGitCleanRevisionContext>> {
  const before = assertFloodgateCanonicalRepositoryRoot(repositoryRoot);
  const [topLevelOutput, headOutput, status, trackedFlags] = await Promise.all([
    fixedGitOutput(repositoryRoot, ["rev-parse", "--show-toplevel"]),
    fixedGitOutput(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]),
    fixedGitOutput(repositoryRoot, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]),
    fixedGitOutput(repositoryRoot, ["ls-files", "-v", "-z"]),
  ]);
  const after = assertFloodgateCanonicalRepositoryRoot(repositoryRoot);
  if (!sameStat(before, after)) {
    throw new Error(
      "Floodgate Git repository root changed during context verification",
    );
  }
  const topLevel = parseFloodgateGitLine(topLevelOutput, "top-level");
  if (topLevel !== repositoryRoot) {
    throw new Error(
      "Floodgate Git repository root must be the exact worktree top-level",
    );
  }
  const head = parseFloodgateGitLine(headOutput, "HEAD revision");
  if (!FLOODGATE_FULL_GIT_OBJECT_ID.test(head)) {
    throw new Error("invalid Floodgate Git HEAD revision");
  }
  if (head !== expectedRevision) {
    throw new Error("Floodgate Git HEAD is not the expected exact revision");
  }
  if (status !== "") {
    throw new Error(
      "Floodgate Git worktree and index must be clean, including non-ignored untracked files",
    );
  }
  if (!floodgateGitTrackedEntriesAreOrdinary(trackedFlags)) {
    throw new Error("Floodgate Git index contains special tracked flags");
  }
  return Object.freeze({
    repositoryStat: after,
    topLevel,
    head,
    status,
    trackedFlags,
  });
}

/** Compare every tracked worktree byte and mode directly with the HEAD tree. */
export async function assertFloodgateGitTrackedTreeMatchesHead(
  repositoryRoot: string,
): Promise<void> {
  const [objectFormatText, headTree, index] = await Promise.all([
    fixedGitOutput(repositoryRoot, ["rev-parse", "--show-object-format"]),
    fixedGitOutput(repositoryRoot, [
      "ls-tree",
      "-r",
      "-l",
      "-z",
      "--full-tree",
      "HEAD",
    ]),
    fixedGitOutput(repositoryRoot, ["ls-files", "-s", "-z"]),
  ]);
  const objectFormat = objectFormatText.trim();
  if (objectFormat !== "sha1" && objectFormat !== "sha256") {
    throw new Error("invalid Floodgate Git object format");
  }
  const treeEntries = parseHeadTree(headTree);
  const indexEntries = parseIndex(index);
  if (treeEntries.length !== indexEntries.size) {
    throw new Error("Floodgate Git index does not match the HEAD tree");
  }
  for (const entry of treeEntries) {
    if (indexEntries.get(entry.path) !== `${entry.mode} ${entry.object}`) {
      throw new Error(`Floodgate Git index differs from HEAD: ${entry.path}`);
    }
    const bytes = readTrackedBlob(repositoryRoot, entry);
    if (gitBlobId(bytes, objectFormat) !== entry.object) {
      throw new Error(
        `Floodgate tracked bytes differ from HEAD: ${entry.path}`,
      );
    }
  }
  const [finalHeadTree, finalIndex] = await Promise.all([
    fixedGitOutput(repositoryRoot, [
      "ls-tree",
      "-r",
      "-l",
      "-z",
      "--full-tree",
      "HEAD",
    ]),
    fixedGitOutput(repositoryRoot, ["ls-files", "-s", "-z"]),
  ]);
  if (finalHeadTree !== headTree || finalIndex !== index) {
    throw new Error(
      "Floodgate Git HEAD/index changed during byte verification",
    );
  }
}

/**
 * Require one canonical worktree at an exact Git-clean revision under standard
 * ignore rules, including direct tracked-byte verification. The surrounding
 * context is repeated afterward so a concurrent HEAD, index, worktree,
 * non-ignored untracked-file, or root change fails closed instead of
 * authorizing a stale observation.
 */
export async function assertFloodgateGitExactCleanRevision(
  repositoryRoot: string,
  expectedRevision: string,
): Promise<void> {
  if (
    typeof expectedRevision !== "string" ||
    !FLOODGATE_FULL_GIT_OBJECT_ID.test(expectedRevision)
  ) {
    throw new Error(
      "Floodgate Git expected revision must be a full lowercase object ID",
    );
  }
  const initial = await captureFloodgateGitCleanRevisionContext(
    repositoryRoot,
    expectedRevision,
  );
  await assertFloodgateGitTrackedTreeMatchesHead(repositoryRoot);
  const final = await captureFloodgateGitCleanRevisionContext(
    repositoryRoot,
    expectedRevision,
  );
  if (
    !sameStat(initial.repositoryStat, final.repositoryStat) ||
    initial.topLevel !== final.topLevel ||
    initial.head !== final.head ||
    initial.status !== final.status ||
    initial.trackedFlags !== final.trackedFlags
  ) {
    throw new Error(
      "Floodgate Git repository context changed during exact revision verification",
    );
  }
}
