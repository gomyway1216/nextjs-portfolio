/**
 * Private namespace authorization for a future authenticated Floodgate teacher.
 *
 * This module deliberately does not import the training-row consumer, teacher
 * generator, or publisher. It authorizes and leases only a private stage
 * namespace. Artifact authentication, generation, fsync, and publication remain
 * separate later boundaries.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export const FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT =
  "floodgate-teacher-private-stage-authorization-v2" as const;
export const FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY =
  "trusted-current-euid-writer-private-0700-stage-v1" as const;
export const FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS =
  "authorized-private-stage-not-generated-not-published" as const;
export const FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES = Object.freeze([
  "manifest.json",
  "result.json",
  "train.jsonl",
  "val.jsonl",
  "work.jsonl",
] as const);
export const FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON =
  "/usr/bin/python3" as const;

const BIGINT_ZERO = BigInt(0);
const MODE_PERMISSION_AND_SPECIAL_BITS = BigInt(0o7777);
const MODE_GROUP_OR_OTHER_WRITABLE = BigInt(0o022);
const MODE_ANY_EXECUTABLE = BigInt(0o111);
const MODE_PRIVATE_DIRECTORY = BigInt(0o700);
const MODE_PRIVATE_FILE = BigInt(0o600);
const BIGINT_ONE = BigInt(1);
const MODE_TYPE_MASK = BigInt(fs.constants.S_IFMT);
const MODE_DIRECTORY = BigInt(fs.constants.S_IFDIR);
const MODE_REGULAR_FILE = BigInt(fs.constants.S_IFREG);
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;
const SAFE_BASENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_ENGINE_OPTION_RE = /^--?[A-Za-z0-9][A-Za-z0-9_-]*$/;
const CANONICAL_DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/;
const ENTRY_INSPECTOR_TIMEOUT_MILLISECONDS = 5_000;
const ENTRY_INSPECTOR_MAX_OUTPUT_BYTES = 4_096;
const ENTRY_INSPECTOR_MAX_SCRIPT_BYTES = 32_768;
const HELD_STAGE_ENTRY_INSPECTOR_SCRIPT = String.raw`import os
import stat
import sys

FD = 3
MAX_ENTRIES = 5

def fail(message, code=72):
    os.write(2, (message + "\n").encode("ascii", "strict"))
    raise SystemExit(code)

def expected(index, label):
    value = sys.argv[index]
    if not value.isascii() or not value.isdecimal() or str(int(value)) != value:
        fail("invalid-expected-" + label)
    return int(value)

if len(sys.argv) != 4:
    fail("invalid-arguments")
if (
    os.listdir not in os.supports_fd
    or os.stat not in os.supports_dir_fd
    or os.stat not in os.supports_follow_symlinks
):
    fail("required-fd-relative-operations-unavailable")

expected_dev = expected(1, "device")
expected_ino = expected(2, "inode")
expected_uid = expected(3, "uid")

def held_ok(value):
    return (
        stat.S_ISDIR(value.st_mode)
        and value.st_dev == expected_dev
        and value.st_ino == expected_ino
        and value.st_uid == expected_uid
        and stat.S_IMODE(value.st_mode) == 0o700
    )

def held_signature(value):
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_nlink,
        value.st_uid,
    )

def snapshot():
    names = [os.fsencode(name) for name in os.listdir(FD)]
    if len(names) > MAX_ENTRIES:
        fail("too-many-stage-entries")
    names.sort()
    rows = []
    for name in names:
        value = os.stat(name, dir_fd=FD, follow_symlinks=False)
        rows.append((
            name.hex(),
            str(value.st_dev),
            str(value.st_ino),
            str(value.st_mode),
            str(value.st_nlink),
            str(value.st_uid),
        ))
    return rows

try:
    held_before = os.fstat(FD)
    first = snapshot()
    second = snapshot()
    held_after = os.fstat(FD)
except OSError as error:
    fail("filesystem-error-" + str(error.errno), 74)

if not held_ok(held_before) or not held_ok(held_after):
    fail("held-stage-identity-or-mode-mismatch")
if held_signature(held_before) != held_signature(held_after) or first != second:
    fail("stage-mutated-during-inspection", 75)

root = (
    "ROOT",
    str(held_after.st_dev),
    str(held_after.st_ino),
    str(held_after.st_mode),
    str(held_after.st_nlink),
    str(held_after.st_uid),
    str(len(first)),
)
os.write(1, ("\t".join(root) + "\n").encode("ascii", "strict"))
for row in first:
    os.write(1, ("ENTRY\t" + "\t".join(row) + "\n").encode("ascii", "strict"))
os.write(1, b"END\n")
`;
const ALLOWED_ENTRY_SET = new Set<string>(
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
);
const ALLOWED_ENTRY_BY_HEX = new Map<string, string>([
  ["6d616e69666573742e6a736f6e", "manifest.json"],
  ["726573756c742e6a736f6e", "result.json"],
  ["747261696e2e6a736f6e6c", "train.jsonl"],
  ["76616c2e6a736f6e6c", "val.jsonl"],
  ["776f726b2e6a736f6e6c", "work.jsonl"],
]);
const REQUIRED_OPTION_KEYS = Object.freeze([
  "destinationBasename",
  "engineArgs",
  "engineBin",
  "engineReceipt",
  "legacyProtectedPositionIdsPath",
  "publicationParent",
  "rawLockRoot",
  "repositoryRoot",
  "roleBundleRoot",
  "roleLockRoot",
  "stageBasename",
] as const);
const ALLOWED_OPTION_KEY_SET = new Set<string>([
  ...REQUIRED_OPTION_KEYS,
  "evalDir",
]);
const REQUIRED_DEPENDENCY_KEYS = Object.freeze([
  "effectiveUserId",
  "inspectorPythonExecutable",
] as const);
const ALLOWED_DEPENDENCY_KEY_SET = new Set<string>([
  ...REQUIRED_DEPENDENCY_KEYS,
  "afterLeaseAcquiredForTests",
  "beforeHeldStageEntryInspectionForTests",
  "beforeLeaseRemovalForTests",
  "closeDirectoryForTests",
  "inspectorMaxOutputBytesForTests",
  "inspectorScriptForTests",
  "inspectorTimeoutMillisecondsForTests",
]);

const NativePromise = Promise;
const NativeBigInt = BigInt;
const NativeError = Error;
const NativeNumber = Number;
const NativeString = String;
const NativeWeakSet = WeakSet;
const nativeArrayPrototype = Array.prototype;
const nativeGetEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectCreate = Object.create;
const objectSetPrototypeOf = Object.setPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectHasOwn = Object.prototype.hasOwnProperty;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetDelete = WeakSet.prototype.delete;
const nativeSetHas = Set.prototype.has;
const nativeMapGet = Map.prototype.get;
const nativeRegExpExec = RegExp.prototype.exec;
const nativeBufferToString = Buffer.prototype.toString;
const bufferByteLength = Buffer.byteLength;
const bufferIsBuffer = Buffer.isBuffer;
const nativeStringSplit = String.prototype.split;
const nativeStringTrim = String.prototype.trim;
const nativeStringIncludes = String.prototype.includes;
const nativeStringStartsWith = String.prototype.startsWith;
const pathBasename = path.basename;
const pathIsAbsolute = path.isAbsolute;
const pathJoin = path.join;
const pathParse = path.parse;
const pathRelative = path.relative;
const pathResolve = path.resolve;
const pathSeparator = path.sep;
const spawnChildSync = spawnSync;
const realpathPath = fs.promises.realpath.bind(fs.promises);
const mkdirPath = fs.promises.mkdir.bind(fs.promises);
const chmodPath = fs.promises.chmod.bind(fs.promises);
const rmdirPath = fs.promises.rmdir.bind(fs.promises);
const lstatDescriptor = fs.lstat.bind(fs);
const openDescriptor = fs.open.bind(fs);
const closeDescriptor = fs.close.bind(fs);
const fstatDescriptor = fs.fstat.bind(fs);
const OPEN_READ_ONLY = fs.constants.O_RDONLY;
const OPEN_NO_FOLLOW = fs.constants.O_NOFOLLOW;
const OPEN_DIRECTORY = fs.constants.O_DIRECTORY;

export interface FloodgateTeacherStageAuthorizationOptions {
  readonly repositoryRoot: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly roleBundleRoot: string;
  readonly legacyProtectedPositionIdsPath: string;
  readonly publicationParent: string;
  readonly stageBasename: string;
  readonly destinationBasename: string;
  readonly engineBin: string;
  readonly engineReceipt: string;
  readonly engineArgs: readonly string[];
  readonly evalDir?: string;
}

export interface FloodgateTeacherStageIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface FloodgateTeacherStageAuthorizationReceipt {
  readonly contract: typeof FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT;
  readonly trust_boundary: typeof FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY;
  readonly status: typeof FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS;
  readonly parent_identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly stage_identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly lease_identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly stage_basename: string;
  readonly destination_basename: string;
  readonly allowed_entries: readonly string[];
}

export interface FloodgateTeacherStageLease {
  readonly receipt: Readonly<FloodgateTeacherStageAuthorizationReceipt>;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  close(): Promise<void>;
}

interface RuntimeClaimRegistry {
  readonly available: WeakSet<Readonly<FloodgateTeacherStageLease>>;
  readonly boundary: "production" | "test-only";
}

function createRuntimeClaimRegistry(
  boundary: RuntimeClaimRegistry["boundary"],
): Readonly<RuntimeClaimRegistry> {
  return objectFreeze({
    available: new NativeWeakSet<Readonly<FloodgateTeacherStageLease>>(),
    boundary,
  });
}

const PRODUCTION_RUNTIME_CLAIMS = createRuntimeClaimRegistry("production");
const TEST_RUNTIME_CLAIMS = createRuntimeClaimRegistry("test-only");

function runtimeClaimAdd(
  registrySet: WeakSet<Readonly<FloodgateTeacherStageLease>>,
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  reflectApply(nativeWeakSetAdd, registrySet, [lease]);
}

function runtimeClaimDelete(
  registrySet: WeakSet<Readonly<FloodgateTeacherStageLease>>,
  lease: Readonly<FloodgateTeacherStageLease>,
): boolean {
  return reflectApply(nativeWeakSetDelete, registrySet, [lease]) as boolean;
}

function activateRuntimeClaim(
  registry: Readonly<RuntimeClaimRegistry>,
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  runtimeClaimAdd(registry.available, lease);
}

function revokeRuntimeClaim(
  registry: Readonly<RuntimeClaimRegistry>,
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  runtimeClaimDelete(registry.available, lease);
}

function claimRuntimeLease(
  registry: Readonly<RuntimeClaimRegistry>,
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  if (!runtimeClaimDelete(registry.available, lease)) {
    authorizationFailure(
      `${registry.boundary} runtime claim requires the exact active unclaimed lease`,
    );
  }
}

/** Claim the exact active lease issued by the production authorizer once. */
export function claimActiveAuthorizedFloodgateTeacherStageLease(
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  claimRuntimeLease(PRODUCTION_RUNTIME_CLAIMS, lease);
}

/** Test-only lease claim registry, isolated from the production registry. */
export function claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  claimRuntimeLease(TEST_RUNTIME_CLAIMS, lease);
}

export interface FloodgateTeacherStageAuthorizationHookPaths {
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly leaseRoot: string;
}

export interface FloodgateTeacherStageAuthorizationDependencies {
  readonly effectiveUserId: number;
  readonly inspectorPythonExecutable: string;
  readonly inspectorScriptForTests?: string;
  readonly inspectorTimeoutMillisecondsForTests?: number;
  readonly inspectorMaxOutputBytesForTests?: number;
  readonly afterLeaseAcquiredForTests?: (
    paths: Readonly<FloodgateTeacherStageAuthorizationHookPaths>,
  ) => void | Promise<void>;
  readonly beforeHeldStageEntryInspectionForTests?: (
    paths: Readonly<FloodgateTeacherStageAuthorizationHookPaths>,
  ) => void | Promise<void>;
  readonly beforeLeaseRemovalForTests?: (
    paths: Readonly<FloodgateTeacherStageAuthorizationHookPaths>,
  ) => void | Promise<void>;
  readonly closeDirectoryForTests?: (
    kind: "lease" | "parent" | "stage",
    close: () => Promise<void>,
  ) => Promise<void>;
}

export class FloodgateTeacherStageAuthorizationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Floodgate teacher stage authorization failed: ${message}`, options);
    this.name = "FloodgateTeacherStageAuthorizationError";
  }
}

export class FloodgateTeacherStageLeaseUnavailableError extends FloodgateTeacherStageAuthorizationError {
  constructor(message: string, options?: ErrorOptions) {
    super(`exclusive lease unavailable: ${message}`, options);
    this.name = "FloodgateTeacherStageLeaseUnavailableError";
  }
}

export class FloodgateTeacherStageCloseError extends Error {
  readonly leaseMayRemain: boolean;

  constructor(
    message: string,
    leaseMayRemain: boolean,
    options?: ErrorOptions,
  ) {
    super(`Floodgate teacher stage close failed: ${message}`, options);
    this.name = "FloodgateTeacherStageCloseError";
    this.leaseMayRemain = leaseMayRemain;
  }
}

export class FloodgateTeacherStageAuthorizationCleanupError extends FloodgateTeacherStageAuthorizationError {
  readonly leaseMayRemain: boolean;
  readonly primary: unknown;
  readonly cleanupFailures: readonly unknown[];

  constructor(
    primary: unknown,
    cleanupFailures: readonly unknown[],
    leaseMayRemain: boolean,
  ) {
    const primaryDetail = failureDetail(primary);
    let cleanupDetail = "";
    for (let index = 0; index < cleanupFailures.length; index += 1) {
      const failure = cleanupFailures[index];
      if (index > 0) cleanupDetail += "; ";
      cleanupDetail += failureDetail(failure);
    }
    super(
      `primary failure (${primaryDetail}); exclusive lease cleanup is indeterminate (${cleanupDetail})`,
      { cause: primary },
    );
    this.name = "FloodgateTeacherStageAuthorizationCleanupError";
    this.leaseMayRemain = leaseMayRemain;
    this.primary = primary;
    this.cleanupFailures = frozenArrayCopy(cleanupFailures);
  }
}

function failureDetail(failure: unknown): string {
  if (typeof failure === "string") return failure;
  if (
    failure !== null &&
    (typeof failure === "object" || typeof failure === "function")
  ) {
    try {
      const descriptor = objectGetOwnPropertyDescriptor(failure, "message");
      if (
        descriptor !== undefined &&
        reflectApply(objectHasOwn, descriptor, ["value"]) &&
        typeof descriptor.value === "string"
      ) {
        return descriptor.value;
      }
    } catch {
      // A hostile proxy or descriptor cannot replace typed failure handling.
    }
  }
  return "unknown failure";
}

function frozenArrayCopy<T>(values: readonly T[]): readonly T[] {
  const copy = mutableNullPrototypeArray<T>();
  for (let index = 0; index < values.length; index += 1) {
    copy[copy.length] = values[index];
  }
  objectSetPrototypeOf(copy, nativeArrayPrototype);
  return objectFreeze(copy);
}

interface CapturedOptions {
  readonly repositoryRoot: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly roleBundleRoot: string;
  readonly legacyProtectedPositionIdsPath: string;
  readonly publicationParent: string;
  readonly stageBasename: string;
  readonly destinationBasename: string;
  readonly engineBin: string;
  readonly engineReceipt: string;
  readonly engineArgs: readonly string[];
  readonly evalDir?: string;
}

interface ProtectedPathSnapshot {
  readonly label: string;
  readonly path: string;
  readonly identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly kind: "directory" | "file";
}

interface FilesystemStatSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
}

interface OpenedDirectory {
  readonly identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly stat: () => Promise<Readonly<FilesystemStatSnapshot>>;
  readonly inspectEntries: (
    pythonExecutable: string,
    expectedUserId: bigint,
    script: string,
    timeoutMilliseconds: number,
    maxOutputBytes: number,
  ) => string;
  readonly close: () => Promise<void>;
}

interface EntryInspectorConfiguration {
  readonly pythonExecutable: string;
  readonly script: string;
  readonly timeoutMilliseconds: number;
  readonly maxOutputBytes: number;
}

type CapturedDependencies = FloodgateTeacherStageAuthorizationDependencies;

interface LeaseCleanupOutcome {
  readonly removed: boolean;
  readonly failures: readonly unknown[];
}

function freezeNonThenable<T extends object>(value: T): Readonly<T> {
  objectSetPrototypeOf(value, null);
  return objectFreeze(value);
}

function mutableNullPrototypeArray<T>(): T[] {
  const values: T[] = [];
  objectSetPrototypeOf(values, null);
  return values;
}

function statSnapshot(stat: fs.BigIntStats): Readonly<FilesystemStatSnapshot> {
  return freezeNonThenable({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
  });
}

function lstatSnapshot(
  target: string,
): Promise<Readonly<FilesystemStatSnapshot>> {
  return new NativePromise((resolve, reject) => {
    lstatDescriptor(target, { bigint: true }, (error, stat) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(statSnapshot(stat));
    });
  });
}

async function entryInspectorConfiguration(
  dependencies: FloodgateTeacherStageAuthorizationDependencies,
): Promise<Readonly<EntryInspectorConfiguration>> {
  const requestedPython = canonicalAbsolutePath(
    dependencies.inspectorPythonExecutable,
    "stage entry inspector Python executable",
  );
  let pythonExecutable: string;
  try {
    pythonExecutable = await realpathPath(requestedPython);
  } catch (cause) {
    authorizationFailure(
      "stage entry inspector Python executable cannot be resolved",
      cause,
    );
  }
  canonicalAbsolutePath(
    pythonExecutable,
    "resolved stage entry inspector Python executable",
  );
  let pythonStat: Readonly<FilesystemStatSnapshot>;
  try {
    pythonStat = await lstatSnapshot(pythonExecutable);
  } catch (cause) {
    authorizationFailure(
      "stage entry inspector Python executable cannot be inspected",
      cause,
    );
  }
  if (
    !hasFileType(pythonStat, MODE_REGULAR_FILE) ||
    pythonStat.uid !== BIGINT_ZERO ||
    (pythonStat.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== BIGINT_ZERO ||
    (pythonStat.mode & MODE_ANY_EXECUTABLE) === BIGINT_ZERO
  ) {
    authorizationFailure(
      "stage entry inspector Python launcher must resolve to a root-owned non-writable executable",
    );
  }

  const script =
    dependencies.inspectorScriptForTests ?? HELD_STAGE_ENTRY_INSPECTOR_SCRIPT;
  if (
    typeof script !== "string" ||
    script.length === 0 ||
    reflectApply(nativeStringIncludes, script, ["\u0000"]) ||
    bufferByteLength(script, "utf8") > ENTRY_INSPECTOR_MAX_SCRIPT_BYTES
  ) {
    authorizationFailure("stage entry inspector script is invalid");
  }
  const timeoutMilliseconds =
    dependencies.inspectorTimeoutMillisecondsForTests ??
    ENTRY_INSPECTOR_TIMEOUT_MILLISECONDS;
  if (
    !numberIsSafeInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 1 ||
    timeoutMilliseconds > 60_000
  ) {
    authorizationFailure("stage entry inspector timeout is invalid");
  }
  const maxOutputBytes =
    dependencies.inspectorMaxOutputBytesForTests ??
    ENTRY_INSPECTOR_MAX_OUTPUT_BYTES;
  if (
    !numberIsSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 64 ||
    maxOutputBytes > 65_536
  ) {
    authorizationFailure("stage entry inspector output bound is invalid");
  }
  return freezeNonThenable({
    pythonExecutable,
    script,
    timeoutMilliseconds,
    maxOutputBytes,
  });
}

function runHeldStageEntryInspector(
  descriptor: number,
  expectedIdentity: Readonly<FloodgateTeacherStageIdentity>,
  expectedUserId: bigint,
  pythonExecutable: string,
  script: string,
  timeoutMilliseconds: number,
  maxOutputBytes: number,
): string {
  const environment = objectCreate(null) as NodeJS.ProcessEnv;
  objectFreeze(environment);
  const result = spawnChildSync(
    pythonExecutable,
    [
      "-I",
      "-S",
      "-E",
      "-c",
      script,
      expectedIdentity.dev.toString(10),
      expectedIdentity.ino.toString(10),
      expectedUserId.toString(10),
    ],
    {
      cwd: pathParse(pythonExecutable).root,
      encoding: null,
      env: environment,
      killSignal: "SIGKILL",
      maxBuffer: maxOutputBytes,
      shell: false,
      stdio: ["ignore", "pipe", "pipe", descriptor],
      timeout: timeoutMilliseconds,
      windowsHide: true,
    },
  );
  if (result.error !== undefined) {
    authorizationFailure(
      `held stage entry inspector failed to execute (${failureDetail(result.error)})`,
      result.error,
    );
  }
  if (
    result.status !== 0 ||
    result.signal !== null ||
    !bufferIsBuffer(result.stdout) ||
    !bufferIsBuffer(result.stderr)
  ) {
    authorizationFailure(
      `held stage entry inspector failed closed (status=${NativeString(result.status)}, signal=${NativeString(result.signal)})`,
    );
  }
  if (
    result.stdout.byteLength > maxOutputBytes ||
    result.stderr.byteLength > 0
  ) {
    authorizationFailure(
      "held stage entry inspector emitted invalid or excessive output",
    );
  }
  for (let index = 0; index < result.stdout.byteLength; index += 1) {
    if (result.stdout[index] > 0x7f) {
      authorizationFailure(
        "held stage entry inspector output must be strict ASCII",
      );
    }
  }
  return reflectApply(nativeBufferToString, result.stdout, ["ascii"]);
}

function authorizationFailure(message: string, cause?: unknown): never {
  throw new FloodgateTeacherStageAuthorizationError(
    message,
    cause === undefined ? undefined : { cause },
  );
}

function regexMatches(expression: RegExp, value: string): boolean {
  return reflectApply(nativeRegExpExec, expression, [value]) !== null;
}

function canonicalAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    reflectApply(nativeStringTrim, value, []) !== value ||
    regexMatches(CONTROL_CHARACTER_RE, value) ||
    pathResolve(value) !== value ||
    pathParse(value).root === value
  ) {
    authorizationFailure(
      `${label} must be a canonical non-root absolute path without control characters`,
    );
  }
  return value;
}

function strictBasename(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !regexMatches(SAFE_BASENAME_RE, value) ||
    value === "." ||
    value === ".." ||
    reflectApply(nativeStringIncludes, value, ["/"]) ||
    reflectApply(nativeStringIncludes, value, ["\\"]) ||
    pathBasename(value) !== value
  ) {
    authorizationFailure(`${label} must be a strict direct-child basename`);
  }
  return value;
}

function capturedStringArray(value: unknown, label: string): readonly string[] {
  if (!arrayIsArray(value)) {
    authorizationFailure(`${label} must be an array`);
  }
  const lengthDescriptor = objectGetOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !reflectApply(objectHasOwn, lengthDescriptor, ["value"]) ||
    typeof lengthDescriptor.value !== "number"
  ) {
    authorizationFailure(`${label}.length must be a data property`);
  }
  const length = lengthDescriptor.value;
  const captured = mutableNullPrototypeArray<string>();
  for (let index = 0; index < length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !reflectApply(objectHasOwn, descriptor, ["value"]) ||
      descriptor.enumerable !== true
    ) {
      authorizationFailure(
        `${label}[${index}] must be an enumerable own data property without holes or accessors`,
      );
    }
    const entry = descriptor.value;
    if (
      typeof entry !== "string" ||
      entry.length === 0 ||
      reflectApply(nativeStringTrim, entry, []) !== entry ||
      regexMatches(CONTROL_CHARACTER_RE, entry)
    ) {
      authorizationFailure(`${label}[${index}] must be nonempty safe text`);
    }
    captured[captured.length] = entry;
  }
  return objectFreeze(captured);
}

function capturedOptionValues(
  input: FloodgateTeacherStageAuthorizationOptions,
): Readonly<Record<string, unknown>> {
  const descriptors = objectGetOwnPropertyDescriptors(input);
  const captured = objectCreate(null) as Record<string, unknown>;
  const descriptorKeys = reflectOwnKeys(descriptors);
  for (let index = 0; index < descriptorKeys.length; index += 1) {
    const key = descriptorKeys[index];
    if (
      typeof key !== "string" ||
      !reflectApply(nativeSetHas, ALLOWED_OPTION_KEY_SET, [key])
    ) {
      authorizationFailure("options contain an unexpected field");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !reflectApply(objectHasOwn, descriptor, ["value"]) ||
      descriptor.enumerable !== true
    ) {
      authorizationFailure(
        `options.${key} must be an enumerable data property`,
      );
    }
    captured[key] = descriptor.value;
  }
  for (let index = 0; index < REQUIRED_OPTION_KEYS.length; index += 1) {
    const key = REQUIRED_OPTION_KEYS[index];
    if (!reflectApply(objectHasOwn, captured, [key])) {
      authorizationFailure(`options.${key} is required`);
    }
  }
  return objectFreeze(captured);
}

function captureDependencies(
  input: FloodgateTeacherStageAuthorizationDependencies,
): Readonly<CapturedDependencies> {
  if (input === null || typeof input !== "object" || arrayIsArray(input)) {
    authorizationFailure("dependencies must be an object");
  }
  const descriptors = objectGetOwnPropertyDescriptors(input);
  const captured = objectCreate(null) as Record<string, unknown>;
  const descriptorKeys = reflectOwnKeys(descriptors);
  for (let index = 0; index < descriptorKeys.length; index += 1) {
    const key = descriptorKeys[index];
    if (
      typeof key !== "string" ||
      !reflectApply(nativeSetHas, ALLOWED_DEPENDENCY_KEY_SET, [key])
    ) {
      authorizationFailure("dependencies contain an unexpected field");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !reflectApply(objectHasOwn, descriptor, ["value"]) ||
      descriptor.enumerable !== true
    ) {
      authorizationFailure(
        `dependencies.${key} must be an enumerable data property`,
      );
    }
    captured[key] = descriptor.value;
  }
  for (let index = 0; index < REQUIRED_DEPENDENCY_KEYS.length; index += 1) {
    const key = REQUIRED_DEPENDENCY_KEYS[index];
    if (!reflectApply(objectHasOwn, captured, [key])) {
      authorizationFailure(`dependencies.${key} is required`);
    }
  }
  const functionKeys = [
    "afterLeaseAcquiredForTests",
    "beforeHeldStageEntryInspectionForTests",
    "beforeLeaseRemovalForTests",
    "closeDirectoryForTests",
  ] as const;
  for (let index = 0; index < functionKeys.length; index += 1) {
    const key = functionKeys[index];
    if (captured[key] !== undefined && typeof captured[key] !== "function") {
      authorizationFailure(`dependencies.${key} must be a function`);
    }
  }
  return objectFreeze(captured) as Readonly<CapturedDependencies>;
}

function captureOptions(
  input: FloodgateTeacherStageAuthorizationOptions,
): Readonly<CapturedOptions> {
  if (input === null || typeof input !== "object" || arrayIsArray(input)) {
    authorizationFailure("options must be an object");
  }
  const values = capturedOptionValues(input);
  const captured: CapturedOptions = {
    repositoryRoot: canonicalAbsolutePath(
      values.repositoryRoot,
      "repositoryRoot",
    ),
    rawLockRoot: canonicalAbsolutePath(values.rawLockRoot, "rawLockRoot"),
    roleLockRoot: canonicalAbsolutePath(values.roleLockRoot, "roleLockRoot"),
    roleBundleRoot: canonicalAbsolutePath(
      values.roleBundleRoot,
      "roleBundleRoot",
    ),
    legacyProtectedPositionIdsPath: canonicalAbsolutePath(
      values.legacyProtectedPositionIdsPath,
      "legacyProtectedPositionIdsPath",
    ),
    publicationParent: canonicalAbsolutePath(
      values.publicationParent,
      "publicationParent",
    ),
    stageBasename: strictBasename(values.stageBasename, "stageBasename"),
    destinationBasename: strictBasename(
      values.destinationBasename,
      "destinationBasename",
    ),
    engineBin: canonicalAbsolutePath(values.engineBin, "engineBin"),
    engineReceipt: canonicalAbsolutePath(values.engineReceipt, "engineReceipt"),
    engineArgs: capturedStringArray(values.engineArgs, "engineArgs"),
    ...(values.evalDir === undefined
      ? {}
      : { evalDir: canonicalAbsolutePath(values.evalDir, "evalDir") }),
  };
  if (captured.stageBasename === captured.destinationBasename) {
    authorizationFailure("stage and destination basenames must be distinct");
  }
  return objectFreeze(captured);
}

function effectiveUserId(
  dependencies: FloodgateTeacherStageAuthorizationDependencies,
): bigint {
  if (
    !numberIsSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0
  ) {
    authorizationFailure("effective user id must be a non-negative integer");
  }
  return NativeBigInt(dependencies.effectiveUserId);
}

function directoryIdentity(
  stat: Readonly<FilesystemStatSnapshot>,
): Readonly<FloodgateTeacherStageIdentity> {
  return freezeNonThenable({ dev: stat.dev, ino: stat.ino });
}

function sameIdentity(
  left: Readonly<FloodgateTeacherStageIdentity>,
  right: Readonly<FloodgateTeacherStageIdentity>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFilesystemStat(
  left: Readonly<FilesystemStatSnapshot>,
  right: Readonly<FilesystemStatSnapshot>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid
  );
}

function hasFileType(
  stat: Readonly<FilesystemStatSnapshot>,
  expected: bigint,
): boolean {
  return (stat.mode & MODE_TYPE_MASK) === expected;
}

function assertPrivateDirectory(
  stat: Readonly<FilesystemStatSnapshot>,
  expectedUserId: bigint,
  label: string,
): void {
  if (
    !hasFileType(stat, MODE_DIRECTORY) ||
    stat.uid !== expectedUserId ||
    (stat.mode & MODE_PERMISSION_AND_SPECIAL_BITS) !== MODE_PRIVATE_DIRECTORY
  ) {
    authorizationFailure(
      `${label} must be a current-euid-owned exact 0700 private directory`,
    );
  }
}

function assertPrivateStageFile(
  stat: Readonly<FilesystemStatSnapshot>,
  expectedUserId: bigint,
  label: string,
): void {
  if (
    !hasFileType(stat, MODE_REGULAR_FILE) ||
    stat.uid !== expectedUserId ||
    (stat.mode & MODE_PERMISSION_AND_SPECIAL_BITS) !== MODE_PRIVATE_FILE
  ) {
    authorizationFailure(
      `${label} must be a current-euid-owned exact 0600 regular stage entry`,
    );
  }
  if (stat.nlink !== BIGINT_ONE) {
    authorizationFailure(`${label} must not be a hard-linked inode alias`);
  }
}

async function assertCanonicalRealPath(
  target: string,
  label: string,
): Promise<void> {
  let actual: string;
  try {
    actual = await realpathPath(target);
  } catch (cause) {
    authorizationFailure(`${label} cannot be resolved`, cause);
  }
  if (actual !== target) {
    authorizationFailure(
      `${label} must be its canonical real path without symlink aliases`,
    );
  }
}

async function statProtectedPath(
  target: string,
  label: string,
  expectedKind: "directory" | "file",
): Promise<Readonly<ProtectedPathSnapshot>> {
  await assertCanonicalRealPath(target, label);
  let stat: Readonly<FilesystemStatSnapshot>;
  try {
    stat = await lstatSnapshot(target);
  } catch (cause) {
    authorizationFailure(`${label} cannot be inspected`, cause);
  }
  if (
    expectedKind === "directory"
      ? !hasFileType(stat, MODE_DIRECTORY)
      : !hasFileType(stat, MODE_REGULAR_FILE)
  ) {
    authorizationFailure(`${label} must be a real ${expectedKind}`);
  }
  return freezeNonThenable({
    label,
    path: target,
    identity: directoryIdentity(stat),
    kind: expectedKind,
  });
}

function sameOrAncestor(ancestor: string, candidate: string): boolean {
  const relative = pathRelative(ancestor, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !reflectApply(nativeStringStartsWith, relative, [`..${pathSeparator}`]) &&
      !pathIsAbsolute(relative))
  );
}

function assertNamespaceDisjoint(
  protectedPath: Readonly<ProtectedPathSnapshot>,
  publicationParent: string,
  parentIdentity: Readonly<FloodgateTeacherStageIdentity>,
  stageRoot: string,
): void {
  if (
    sameIdentity(protectedPath.identity, parentIdentity) ||
    sameOrAncestor(protectedPath.path, publicationParent) ||
    sameOrAncestor(publicationParent, protectedPath.path) ||
    sameOrAncestor(protectedPath.path, stageRoot) ||
    sameOrAncestor(stageRoot, protectedPath.path)
  ) {
    authorizationFailure(
      `protected ${protectedPath.label} must be inode- and ancestry-disjoint from the publication parent and stage`,
    );
  }
}

async function collectProtectedPaths(
  options: Readonly<CapturedOptions>,
  inspectorPythonExecutable: string,
): Promise<readonly Readonly<ProtectedPathSnapshot>[]> {
  const snapshots =
    mutableNullPrototypeArray<Readonly<ProtectedPathSnapshot>>();
  snapshots[snapshots.length] = await statProtectedPath(
    options.repositoryRoot,
    "repositoryRoot",
    "directory",
  );
  snapshots[snapshots.length] = await statProtectedPath(
    options.rawLockRoot,
    "rawLockRoot",
    "directory",
  );
  snapshots[snapshots.length] = await statProtectedPath(
    options.roleLockRoot,
    "roleLockRoot",
    "directory",
  );
  snapshots[snapshots.length] = await statProtectedPath(
    options.roleBundleRoot,
    "roleBundleRoot",
    "directory",
  );
  snapshots[snapshots.length] = await statProtectedPath(
    options.legacyProtectedPositionIdsPath,
    "legacyProtectedPositionIdsPath",
    "file",
  );
  snapshots[snapshots.length] = await statProtectedPath(
    options.engineBin,
    "engineBin",
    "file",
  );
  snapshots[snapshots.length] = await statProtectedPath(
    options.engineReceipt,
    "engineReceipt",
    "file",
  );
  snapshots[snapshots.length] = await statProtectedPath(
    inspectorPythonExecutable,
    "stageEntryInspectorPython",
    "file",
  );
  if (options.evalDir !== undefined) {
    snapshots[snapshots.length] = await statProtectedPath(
      options.evalDir,
      "evalDir",
      "directory",
    );
  }

  for (let index = 0; index < options.engineArgs.length; index += 1) {
    const argument = options.engineArgs[index];
    if (regexMatches(SAFE_ENGINE_OPTION_RE, argument)) {
      continue;
    }
    if (!pathIsAbsolute(argument)) {
      authorizationFailure(
        `engineArgs[${index}] must be a simple option token or a canonical absolute existing file`,
      );
    }
    snapshots[snapshots.length] = await statProtectedPath(
      canonicalAbsolutePath(argument, `engineArgs[${index}]`),
      `engineArgs[${index}]`,
      "file",
    );
  }
  return freezeNonThenable(snapshots);
}

function fstatOpenedDirectory(
  fd: number,
): Promise<Readonly<FilesystemStatSnapshot>> {
  return new NativePromise((resolve, reject) => {
    fstatDescriptor(fd, { bigint: true }, (error, stat) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(statSnapshot(stat));
    });
  });
}

async function revalidateProtectedPaths(
  snapshots: readonly Readonly<ProtectedPathSnapshot>[],
): Promise<void> {
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const current = await statProtectedPath(
      snapshot.path,
      snapshot.label,
      snapshot.kind,
    );
    if (!sameIdentity(current.identity, snapshot.identity)) {
      authorizationFailure(
        `protected ${snapshot.label} identity changed after lease acquisition`,
      );
    }
  }
}

function requiredDirectoryFlags(): number {
  if (
    typeof OPEN_NO_FOLLOW !== "number" ||
    typeof OPEN_DIRECTORY !== "number"
  ) {
    authorizationFailure("O_NOFOLLOW and O_DIRECTORY are required");
  }
  return OPEN_READ_ONLY | OPEN_NO_FOLLOW | OPEN_DIRECTORY;
}

function openDirectoryDescriptor(
  target: string,
  flags: number,
): Promise<number> {
  return new NativePromise<number>((resolve, reject) => {
    openDescriptor(target, flags, (error, descriptor) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(descriptor);
    });
  });
}

function closeDirectoryDescriptor(descriptor: number): Promise<void> {
  return new NativePromise<void>((resolve, reject) => {
    closeDescriptor(descriptor, (error) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function openPrivateDirectory(
  target: string,
  expectedUserId: bigint,
  label: string,
): Promise<Readonly<OpenedDirectory>> {
  await assertCanonicalRealPath(target, label);
  const pathBefore = await lstatSnapshot(target);
  assertPrivateDirectory(pathBefore, expectedUserId, label);
  let descriptor: number;
  try {
    descriptor = await openDirectoryDescriptor(
      target,
      requiredDirectoryFlags(),
    );
  } catch (cause) {
    authorizationFailure(
      `${label} could not be opened without following links`,
      cause,
    );
  }
  try {
    const statHeld = () => fstatOpenedDirectory(descriptor);
    const closeHeld = () => closeDirectoryDescriptor(descriptor);
    const held = await statHeld();
    const pathAfter = await lstatSnapshot(target);
    assertPrivateDirectory(held, expectedUserId, `held ${label}`);
    assertPrivateDirectory(pathAfter, expectedUserId, label);
    const heldIdentity = directoryIdentity(held);
    if (
      !sameIdentity(heldIdentity, directoryIdentity(pathBefore)) ||
      !sameIdentity(heldIdentity, directoryIdentity(pathAfter))
    ) {
      authorizationFailure(`${label} identity changed while it was opened`);
    }
    const inspectEntriesHeld = (
      pythonExecutable: string,
      inspectorUserId: bigint,
      script: string,
      timeoutMilliseconds: number,
      maxOutputBytes: number,
    ) =>
      runHeldStageEntryInspector(
        descriptor,
        heldIdentity,
        inspectorUserId,
        pythonExecutable,
        script,
        timeoutMilliseconds,
        maxOutputBytes,
      );
    return freezeNonThenable({
      identity: heldIdentity,
      stat: statHeld,
      inspectEntries: inspectEntriesHeld,
      close: closeHeld,
    });
  } catch (error) {
    try {
      await closeDirectoryDescriptor(descriptor);
    } catch (closeFailure) {
      throw new FloodgateTeacherStageAuthorizationCleanupError(
        error,
        [closeFailure],
        false,
      );
    }
    throw error;
  }
}

async function assertOpenedDirectoryUnchanged(
  opened: Readonly<OpenedDirectory>,
  target: string,
  expectedUserId: bigint,
  label: string,
): Promise<void> {
  await assertCanonicalRealPath(target, label);
  const held = await opened.stat();
  const currentPath = await lstatSnapshot(target);
  assertPrivateDirectory(held, expectedUserId, `held ${label}`);
  assertPrivateDirectory(currentPath, expectedUserId, label);
  if (
    !sameIdentity(opened.identity, directoryIdentity(held)) ||
    !sameIdentity(opened.identity, directoryIdentity(currentPath))
  ) {
    authorizationFailure(`${label} identity changed or was swapped`);
  }
}

async function assertAbsent(target: string, label: string): Promise<void> {
  try {
    await lstatSnapshot(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    authorizationFailure(`${label} absence could not be checked`, error);
  }
  authorizationFailure(`${label} already exists`);
}

async function inspectStageEntries(
  stage: Readonly<OpenedDirectory>,
  stageRoot: string,
  expectedUserId: bigint,
  protectedPaths: readonly Readonly<ProtectedPathSnapshot>[],
  inspector: Readonly<EntryInspectorConfiguration>,
  dependencies: FloodgateTeacherStageAuthorizationDependencies,
  paths: Readonly<FloodgateTeacherStageAuthorizationHookPaths>,
): Promise<void> {
  await assertOpenedDirectoryUnchanged(
    stage,
    stageRoot,
    expectedUserId,
    "teacher stage before fd-relative entry inspection",
  );
  await dependencies.beforeHeldStageEntryInspectionForTests?.(paths);
  const heldBefore = await stage.stat();
  assertPrivateDirectory(
    heldBefore,
    expectedUserId,
    "held stage immediately before fd-relative entry inspection",
  );
  if (!sameIdentity(stage.identity, directoryIdentity(heldBefore))) {
    authorizationFailure(
      "held stage identity changed before fd-relative entry inspection",
    );
  }
  const output = stage.inspectEntries(
    inspector.pythonExecutable,
    expectedUserId,
    inspector.script,
    inspector.timeoutMilliseconds,
    inspector.maxOutputBytes,
  );
  if (
    output.length === 0 ||
    output[output.length - 1] !== "\n" ||
    reflectApply(nativeStringIncludes, output, ["\r"]) ||
    reflectApply(nativeStringIncludes, output, ["\u0000"])
  ) {
    authorizationFailure(
      "held stage entry inspector returned a noncanonical protocol",
    );
  }
  const lines = reflectApply(nativeStringSplit, output, ["\n"]);
  const rootFields = reflectApply(nativeStringSplit, lines[0], ["\t"]);
  if (rootFields.length !== 7 || rootFields[0] !== "ROOT") {
    authorizationFailure("held stage entry inspector root record is invalid");
  }
  const parseDecimal = (value: string, label: string): bigint => {
    if (!regexMatches(CANONICAL_DECIMAL_RE, value)) {
      authorizationFailure(
        `held stage entry inspector ${label} is not canonical decimal`,
      );
    }
    return NativeBigInt(value);
  };
  const rootStat = freezeNonThenable({
    dev: parseDecimal(rootFields[1], "root device"),
    ino: parseDecimal(rootFields[2], "root inode"),
    mode: parseDecimal(rootFields[3], "root mode"),
    nlink: parseDecimal(rootFields[4], "root link count"),
    uid: parseDecimal(rootFields[5], "root uid"),
  });
  assertPrivateDirectory(
    rootStat,
    expectedUserId,
    "held stage entry inspector root",
  );
  if (!sameIdentity(stage.identity, directoryIdentity(rootStat))) {
    authorizationFailure(
      "held stage entry inspector root identity differs from the held stage",
    );
  }
  if (!sameFilesystemStat(rootStat, heldBefore)) {
    authorizationFailure(
      "held stage entry inspector root metadata differs from the held descriptor",
    );
  }
  const entryCountBigInt = parseDecimal(rootFields[6], "entry count");
  if (
    entryCountBigInt >
    NativeBigInt(FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES.length)
  ) {
    authorizationFailure(
      "held stage entry inspector returned too many entries",
    );
  }
  const entryCount = NativeNumber(entryCountBigInt);
  if (
    !numberIsSafeInteger(entryCount) ||
    lines.length !== entryCount + 3 ||
    lines[entryCount + 1] !== "END" ||
    lines[entryCount + 2] !== ""
  ) {
    authorizationFailure(
      "held stage entry inspector record count or terminator is invalid",
    );
  }

  const seenNames = objectCreate(null) as Record<string, boolean>;
  let previousNameHex: string | undefined;
  for (let index = 0; index < entryCount; index += 1) {
    const fields = reflectApply(nativeStringSplit, lines[index + 1], ["\t"]);
    if (fields.length !== 7 || fields[0] !== "ENTRY") {
      authorizationFailure(
        "held stage entry inspector entry record is invalid",
      );
    }
    const nameHex = fields[1];
    const entryName = reflectApply(nativeMapGet, ALLOWED_ENTRY_BY_HEX, [
      nameHex,
    ]);
    if (
      typeof entryName !== "string" ||
      (previousNameHex !== undefined && previousNameHex >= nameHex) ||
      reflectApply(objectHasOwn, seenNames, [entryName])
    ) {
      authorizationFailure(
        "held stage entry inspector returned an unknown, duplicate, or unsorted name",
      );
    }
    previousNameHex = nameHex;
    seenNames[entryName] = true;
    if (!reflectApply(nativeSetHas, ALLOWED_ENTRY_SET, [entryName])) {
      authorizationFailure(
        `stage entry ${entryName} is outside the fixed allowlist`,
      );
    }
    const stat = freezeNonThenable({
      dev: parseDecimal(fields[2], `${entryName} device`),
      ino: parseDecimal(fields[3], `${entryName} inode`),
      mode: parseDecimal(fields[4], `${entryName} mode`),
      nlink: parseDecimal(fields[5], `${entryName} link count`),
      uid: parseDecimal(fields[6], `${entryName} uid`),
    });
    assertPrivateStageFile(stat, expectedUserId, `stage entry ${entryName}`);
    const entryIdentity = directoryIdentity(stat);
    for (
      let protectedIndex = 0;
      protectedIndex < protectedPaths.length;
      protectedIndex += 1
    ) {
      const protectedPath = protectedPaths[protectedIndex];
      if (sameIdentity(entryIdentity, protectedPath.identity)) {
        authorizationFailure(
          `stage entry ${entryName} is a hard-link or inode alias of protected ${protectedPath.label}`,
        );
      }
    }
  }
  const heldAfter = await stage.stat();
  assertPrivateDirectory(
    heldAfter,
    expectedUserId,
    "held stage immediately after fd-relative entry inspection",
  );
  if (!sameFilesystemStat(rootStat, heldAfter)) {
    authorizationFailure(
      "held stage metadata changed after fd-relative entry inspection",
    );
  }
  await assertOpenedDirectoryUnchanged(
    stage,
    stageRoot,
    expectedUserId,
    "teacher stage after fd-relative entry inspection",
  );
}

function hookPaths(
  publicationParent: string,
  stageRoot: string,
  destinationRoot: string,
  leaseRoot: string,
): Readonly<FloodgateTeacherStageAuthorizationHookPaths> {
  return freezeNonThenable({
    publicationParent,
    stageRoot,
    destinationRoot,
    leaseRoot,
  });
}

function closeOpenedDirectory(
  kind: "lease" | "parent" | "stage",
  opened: Readonly<OpenedDirectory>,
  dependencies: FloodgateTeacherStageAuthorizationDependencies,
): Promise<void> {
  return dependencies.closeDirectoryForTests === undefined
    ? opened.close()
    : dependencies.closeDirectoryForTests(kind, opened.close);
}

async function removeLeaseAfterFailure(
  lease: Readonly<OpenedDirectory> | undefined,
  leaseRoot: string,
  expectedUserId: bigint,
  dependencies: FloodgateTeacherStageAuthorizationDependencies,
): Promise<Readonly<LeaseCleanupOutcome>> {
  const failures = mutableNullPrototypeArray<unknown>();
  if (lease === undefined) {
    failures[failures.length] = new NativeError(
      "created lease could not be opened and bound to an identity",
    );
    return freezeNonThenable({
      removed: false,
      failures: objectFreeze(failures),
    });
  }
  try {
    await closeOpenedDirectory("lease", lease, dependencies);
  } catch (error) {
    failures[failures.length] = error;
  }
  if (failures.length > 0) {
    return freezeNonThenable({
      removed: false,
      failures: objectFreeze(failures),
    });
  }
  try {
    const current = await lstatSnapshot(leaseRoot);
    assertPrivateDirectory(
      current,
      expectedUserId,
      "stage authorization lease cleanup target",
    );
    if (!sameIdentity(lease.identity, directoryIdentity(current))) {
      authorizationFailure(
        "stage authorization lease cleanup target is a replacement inode",
      );
    }
    await rmdirPath(leaseRoot);
    return freezeNonThenable({
      removed: true,
      failures: objectFreeze(failures),
    });
  } catch (error) {
    failures[failures.length] = error;
    return freezeNonThenable({
      removed: false,
      failures: objectFreeze(failures),
    });
  }
}

async function authorizeInternal(
  optionsInput: FloodgateTeacherStageAuthorizationOptions,
  dependenciesInput: FloodgateTeacherStageAuthorizationDependencies,
  runtimeClaims: Readonly<RuntimeClaimRegistry>,
): Promise<Readonly<FloodgateTeacherStageLease>> {
  const options = captureOptions(optionsInput);
  const dependencies = captureDependencies(dependenciesInput);
  const expectedUserId = effectiveUserId(dependencies);
  const stageRoot = pathJoin(options.publicationParent, options.stageBasename);
  const destinationRoot = pathJoin(
    options.publicationParent,
    options.destinationBasename,
  );
  const leaseRoot = pathJoin(
    options.publicationParent,
    `.${options.stageBasename}.authorization-lease`,
  );
  const paths = hookPaths(
    options.publicationParent,
    stageRoot,
    destinationRoot,
    leaseRoot,
  );
  const inspector = await entryInspectorConfiguration(dependencies);

  const parent = await openPrivateDirectory(
    options.publicationParent,
    expectedUserId,
    "publication parent",
  );
  let stage: Readonly<OpenedDirectory> | undefined;
  let lease: Readonly<OpenedDirectory> | undefined;
  let leaseCreated = false;
  try {
    const protectedPaths = await collectProtectedPaths(
      options,
      inspector.pythonExecutable,
    );
    for (let index = 0; index < protectedPaths.length; index += 1) {
      const protectedPath = protectedPaths[index];
      assertNamespaceDisjoint(
        protectedPath,
        options.publicationParent,
        parent.identity,
        stageRoot,
      );
    }
    await assertAbsent(destinationRoot, "destination");

    try {
      await mkdirPath(leaseRoot, { mode: 0o700 });
      leaseCreated = true;
      await chmodPath(leaseRoot, 0o700);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new FloodgateTeacherStageLeaseUnavailableError(
          "an existing live or stale lease was preserved",
          { cause: error },
        );
      }
      throw error;
    }
    lease = await openPrivateDirectory(
      leaseRoot,
      expectedUserId,
      "stage authorization lease",
    );

    try {
      await lstatSnapshot(stageRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdirPath(stageRoot, { mode: 0o700 });
      await chmodPath(stageRoot, 0o700);
    }
    try {
      stage = await openPrivateDirectory(
        stageRoot,
        expectedUserId,
        "teacher stage",
      );
      if (stage.identity.dev !== parent.identity.dev) {
        authorizationFailure(
          "publication parent and teacher stage must be on the same filesystem",
        );
      }
      for (let index = 0; index < protectedPaths.length; index += 1) {
        const protectedPath = protectedPaths[index];
        if (sameIdentity(stage.identity, protectedPath.identity)) {
          authorizationFailure(
            `teacher stage is an inode alias of protected ${protectedPath.label}`,
          );
        }
      }
      await inspectStageEntries(
        stage,
        stageRoot,
        expectedUserId,
        protectedPaths,
        inspector,
        dependencies,
        paths,
      );
    } catch (error) {
      // Preserve the path after any open or inspection failure. Pathname-only
      // cleanup could delete a same-UID replacement; a later authenticated
      // reconciliation boundary must decide its disposition.
      throw error;
    }

    await dependencies.afterLeaseAcquiredForTests?.(paths);

    await assertOpenedDirectoryUnchanged(
      parent,
      options.publicationParent,
      expectedUserId,
      "publication parent",
    );
    await assertOpenedDirectoryUnchanged(
      stage,
      stageRoot,
      expectedUserId,
      "teacher stage",
    );
    await assertOpenedDirectoryUnchanged(
      lease,
      leaseRoot,
      expectedUserId,
      "stage authorization lease",
    );
    await assertAbsent(destinationRoot, "destination");
    await revalidateProtectedPaths(protectedPaths);
    await inspectStageEntries(
      stage,
      stageRoot,
      expectedUserId,
      protectedPaths,
      inspector,
      dependencies,
      paths,
    );

    const receipt: Readonly<FloodgateTeacherStageAuthorizationReceipt> =
      freezeNonThenable({
        contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
        trust_boundary: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
        status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
        parent_identity: parent.identity,
        stage_identity: stage.identity,
        lease_identity: lease.identity,
        stage_basename: options.stageBasename,
        destination_basename: options.destinationBasename,
        allowed_entries: FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
      });

    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      if (closePromise !== undefined) return closePromise;
      // Calling close synchronously ends the exact-object claim lifetime, even
      // while asynchronous metadata reconciliation remains in progress.
      revokeRuntimeClaim(runtimeClaims, authorizedLease);
      closePromise = (async () => {
        let leaseMayRemain = true;
        const failures = mutableNullPrototypeArray<unknown>();
        let removalAuthorized = false;
        try {
          await assertOpenedDirectoryUnchanged(
            parent,
            options.publicationParent,
            expectedUserId,
            "publication parent",
          );
          await assertOpenedDirectoryUnchanged(
            stage as Readonly<OpenedDirectory>,
            stageRoot,
            expectedUserId,
            "teacher stage",
          );
          await assertOpenedDirectoryUnchanged(
            lease as Readonly<OpenedDirectory>,
            leaseRoot,
            expectedUserId,
            "stage authorization lease",
          );
          await assertAbsent(destinationRoot, "destination");
          await inspectStageEntries(
            stage as Readonly<OpenedDirectory>,
            stageRoot,
            expectedUserId,
            protectedPaths,
            inspector,
            dependencies,
            paths,
          );
          await revalidateProtectedPaths(protectedPaths);
          await dependencies.beforeLeaseRemovalForTests?.(paths);
          await assertOpenedDirectoryUnchanged(
            parent,
            options.publicationParent,
            expectedUserId,
            "publication parent",
          );
          await assertOpenedDirectoryUnchanged(
            lease as Readonly<OpenedDirectory>,
            leaseRoot,
            expectedUserId,
            "stage authorization lease",
          );
          await assertOpenedDirectoryUnchanged(
            stage as Readonly<OpenedDirectory>,
            stageRoot,
            expectedUserId,
            "teacher stage",
          );
          await assertAbsent(destinationRoot, "destination");
          await inspectStageEntries(
            stage as Readonly<OpenedDirectory>,
            stageRoot,
            expectedUserId,
            protectedPaths,
            inspector,
            dependencies,
            paths,
          );
          await revalidateProtectedPaths(protectedPaths);
          removalAuthorized = true;
        } catch (error) {
          failures[failures.length] = error;
        }
        let leaseClosed = false;
        try {
          await closeOpenedDirectory(
            "lease",
            lease as Readonly<OpenedDirectory>,
            dependencies,
          );
          leaseClosed = true;
        } catch (error) {
          failures[failures.length] = error;
        }
        if (removalAuthorized && leaseClosed) {
          try {
            const currentLease = await lstatSnapshot(leaseRoot);
            assertPrivateDirectory(
              currentLease,
              expectedUserId,
              "stage authorization lease removal target",
            );
            if (
              !sameIdentity(
                (lease as Readonly<OpenedDirectory>).identity,
                directoryIdentity(currentLease),
              )
            ) {
              authorizationFailure(
                "stage authorization lease identity changed before removal",
              );
            }
            await rmdirPath(leaseRoot);
            leaseMayRemain = false;
          } catch (error) {
            failures[failures.length] = error;
          }
        }
        try {
          await closeOpenedDirectory(
            "stage",
            stage as Readonly<OpenedDirectory>,
            dependencies,
          );
        } catch (error) {
          failures[failures.length] = error;
        }
        try {
          await closeOpenedDirectory("parent", parent, dependencies);
        } catch (error) {
          failures[failures.length] = error;
        }
        if (failures.length > 0) {
          const first = failures[0];
          const detail = failureDetail(first);
          throw new FloodgateTeacherStageCloseError(detail, leaseMayRemain, {
            cause: first,
          });
        }
      })();
      return closePromise;
    };

    const authorizedLease = freezeNonThenable({
      receipt,
      stageRoot,
      destinationRoot,
      close,
    });
    activateRuntimeClaim(runtimeClaims, authorizedLease);
    return authorizedLease;
  } catch (error) {
    const cleanupFailures = mutableNullPrototypeArray<unknown>();
    let leaseMayRemain = false;
    if (leaseCreated) {
      const cleanup = await removeLeaseAfterFailure(
        lease,
        leaseRoot,
        expectedUserId,
        dependencies,
      );
      for (let index = 0; index < cleanup.failures.length; index += 1) {
        cleanupFailures[cleanupFailures.length] = cleanup.failures[index];
      }
      leaseMayRemain = !cleanup.removed;
    } else {
      try {
        if (lease !== undefined) {
          await closeOpenedDirectory("lease", lease, dependencies);
        }
      } catch (cleanupError) {
        cleanupFailures[cleanupFailures.length] = cleanupError;
      }
    }
    try {
      if (stage !== undefined) {
        await closeOpenedDirectory("stage", stage, dependencies);
      }
    } catch (cleanupError) {
      cleanupFailures[cleanupFailures.length] = cleanupError;
    }
    try {
      await closeOpenedDirectory("parent", parent, dependencies);
    } catch (cleanupError) {
      cleanupFailures[cleanupFailures.length] = cleanupError;
    }
    if (cleanupFailures.length > 0) {
      throw new FloodgateTeacherStageAuthorizationCleanupError(
        error,
        cleanupFailures,
        leaseMayRemain,
      );
    }
    throw error;
  }
}

/**
 * Test seam with injectable effective UID and lifecycle hooks. It authorizes
 * namespace metadata only and never reads protected or staged file contents.
 */
export function authorizeFloodgateTeacherStageCoreForTests(
  options: FloodgateTeacherStageAuthorizationOptions,
  dependencies: FloodgateTeacherStageAuthorizationDependencies,
): Promise<Readonly<FloodgateTeacherStageLease>> {
  return authorizeInternal(options, dependencies, TEST_RUNTIME_CLAIMS);
}

/** Authorize and exclusively lease a private stage namespace. */
export function authorizeFloodgateTeacherStage(
  options: FloodgateTeacherStageAuthorizationOptions,
): Promise<Readonly<FloodgateTeacherStageLease>> {
  if (nativeGetEffectiveUserId === null) {
    return new NativePromise((_resolve, reject) => {
      reject(
        new FloodgateTeacherStageAuthorizationError(
          "POSIX effective-user identity is required",
        ),
      );
    });
  }
  return authorizeInternal(
    options,
    {
      effectiveUserId: nativeGetEffectiveUserId(),
      inspectorPythonExecutable:
        FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    },
    PRODUCTION_RUNTIME_CLAIMS,
  );
}
