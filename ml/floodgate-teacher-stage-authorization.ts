/**
 * Private namespace authorization for a future authenticated Floodgate teacher.
 *
 * This module deliberately does not import the training-row consumer or teacher
 * generator. It authorizes and leases a private stage namespace and offers a
 * held-descriptor namespace publication transaction.
 * Artifact authentication and teacher generation remain separate boundaries.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT =
  "floodgate-teacher-private-stage-authorization-v3" as const;
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
export const FLOODGATE_TEACHER_STAGE_PUBLICATION_CONTRACT =
  "floodgate-teacher-stage-publication-transaction-v1" as const;
export const FLOODGATE_TEACHER_STAGE_PUBLICATION_TRUST_BOUNDARY =
  "trusted-current-euid-held-private-stage-publication-v1" as const;
export const FLOODGATE_TEACHER_STAGE_PUBLICATION_STATUS =
  "verified-durable-exclusive-publication" as const;
export const FLOODGATE_TEACHER_STAGE_PUBLICATION_CLAIM_BOUNDARY =
  "namespace-publication-only-not-content-authentication-consumer-postflight-training-teacher-label-or-playing-strength-evidence" as const;

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
const MODE_SYMBOLIC_LINK = BigInt(fs.constants.S_IFLNK);
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;
const SAFE_BASENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_ENGINE_OPTION_RE = /^--?[A-Za-z0-9][A-Za-z0-9_-]*$/;
const CANONICAL_DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/;
const ENTRY_INSPECTOR_TIMEOUT_MILLISECONDS = 5_000;
const ENTRY_INSPECTOR_MAX_OUTPUT_BYTES = 4_096;
const ENTRY_INSPECTOR_MAX_SCRIPT_BYTES = 32_768;
const TEST_PATH_MAX_SYMBOLIC_LINKS = 64;
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
  "syncLeaseDirectoryForTests",
  "syncParentDirectoryForTests",
]);

const NativePromise = Promise;
const NativeBigInt = BigInt;
const NativeError = Error;
const NativeNumber = Number;
const NativeString = String;
const NativeWeakSet = WeakSet;
const NativeWeakMap = WeakMap;
const nativeArrayPrototype = Array.prototype;
const nativeGetEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectCreate = Object.create;
const nativeObjectPrototype = Object.prototype;
const objectDefineProperty = Object.defineProperty;
const objectSetPrototypeOf = Object.setPrototypeOf;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectHasOwn = Object.prototype.hasOwnProperty;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetDelete = WeakSet.prototype.delete;
const nativeWeakSetHas = WeakSet.prototype.has;
const nativeWeakMapGet = WeakMap.prototype.get;
const nativeWeakMapSet = WeakMap.prototype.set;
const nativeWeakMapDelete = WeakMap.prototype.delete;
const nativeSetHas = Set.prototype.has;
const nativeMapGet = Map.prototype.get;
const nativeMapSet = Map.prototype.set;
const nativeMapDelete = Map.prototype.delete;
const nativeRegExpExec = RegExp.prototype.exec;
const nativeBufferToString = Buffer.prototype.toString;
const bufferByteLength = Buffer.byteLength;
const bufferIsBuffer = Buffer.isBuffer;
const nativeStringSplit = String.prototype.split;
const nativeStringTrim = String.prototype.trim;
const nativeStringIncludes = String.prototype.includes;
const nativeStringStartsWith = String.prototype.startsWith;
const nodeIsProxy = nodeUtilTypes.isProxy;
const getUserInfo = os.userInfo.bind(os);
const nativeRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const nativeStatSync = fs.statSync.bind(fs);
const nativeLstatSync = fs.lstatSync.bind(fs);
const nativeReadlinkSync = fs.readlinkSync.bind(fs);
const pathBasename = path.basename;
const pathDirname = path.dirname;
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
const openFileHandle = fs.promises.open.bind(fs.promises);
const lstatDescriptor = fs.lstat.bind(fs);
const openDescriptor = fs.open.bind(fs);
const closeDescriptor = fs.close.bind(fs);
const fstatDescriptor = fs.fstat.bind(fs);
const fsyncDescriptor = fs.fsync.bind(fs);
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

export type FloodgateTeacherStagePublicationExecutionBoundary =
  "production-fixed-exclusive-rename" | "test-only-injected-exclusive-rename";

export type FloodgateTeacherStagePublicationPhase =
  | "ready"
  | "commit-started"
  | "abort-started"
  | "committed"
  | "aborted"
  | "indeterminate";

export type FloodgateTeacherStagePublicationDurability =
  | "not-established"
  | "renamed-parent-synced"
  | "published-and-lease-removal-durable";

export type FloodgateTeacherStagePublicationFailurePhase =
  | "preflight"
  | "rename"
  | "reconcile"
  | "destination-reopen"
  | "parent-sync-before-lease-removal"
  | "lease-removal"
  | "parent-sync-after-lease-removal"
  | "cleanup";

export interface FloodgateTeacherStagePublicationReceipt {
  readonly contract: typeof FLOODGATE_TEACHER_STAGE_PUBLICATION_CONTRACT;
  readonly trust_boundary: typeof FLOODGATE_TEACHER_STAGE_PUBLICATION_TRUST_BOUNDARY;
  readonly status: typeof FLOODGATE_TEACHER_STAGE_PUBLICATION_STATUS;
  readonly claim_boundary: typeof FLOODGATE_TEACHER_STAGE_PUBLICATION_CLAIM_BOUNDARY;
  readonly execution_boundary: FloodgateTeacherStagePublicationExecutionBoundary;
  readonly publication_durability: "published-and-lease-removal-durable";
  readonly parent_identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly destination_identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly lease_identity: Readonly<FloodgateTeacherStageIdentity>;
  readonly stage_basename: string;
  readonly destination_basename: string;
}

export interface FloodgateTeacherStagePublicationTransaction {
  readonly phase: FloodgateTeacherStagePublicationPhase;
  readonly authorizationReceipt: Readonly<FloodgateTeacherStageAuthorizationReceipt>;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  commit(): Promise<Readonly<FloodgateTeacherStagePublicationReceipt>>;
  abort(): Promise<void>;
}

export interface FloodgateTeacherStagePublicationDependencies {
  readonly exclusiveRename: (
    source: string,
    destination: string,
    sourceHandle: FloodgateTeacherStagePublicationSourceHandle,
  ) => Promise<unknown>;
  readonly beforeReconcileForTests?: () => void | Promise<void>;
  readonly beforeDestinationReopenForTests?: () => void | Promise<void>;
  readonly syncDirectoryForTests?: (
    kind: "parent-before-lease-removal" | "parent-after-lease-removal",
    sync: () => Promise<void>,
  ) => Promise<void>;
  readonly removeLeaseDirectoryForTests?: (
    leaseRoot: string,
    remove: () => Promise<void>,
  ) => Promise<void>;
  readonly closePublicationDirectoryForTests?: (
    kind: "rename-source" | "destination" | "lease" | "stage" | "parent",
    close: () => Promise<void>,
  ) => Promise<void>;
}

export type FloodgateTeacherStagePublicationSourceHandle =
  import("./floodgate-exclusive-directory-rename").FloodgateExclusiveDirectorySourceHandle;

interface RuntimeClaimRegistry {
  readonly available: WeakSet<Readonly<FloodgateTeacherStageLease>>;
  readonly publicationControllers: WeakMap<
    Readonly<FloodgateTeacherStageLease>,
    Readonly<RuntimePublicationController>
  >;
  readonly boundary: "production" | "test-only";
}

interface RuntimePublicationController {
  readonly begin: (
    dependencies: Readonly<CapturedPublicationDependencies>,
  ) => Readonly<FloodgateTeacherStagePublicationTransaction>;
}

interface SyntheticTestLeasePathBinding {
  readonly stageRoot: string;
  readonly destinationRoot: string;
}

function createRuntimeClaimRegistry(
  boundary: RuntimeClaimRegistry["boundary"],
): Readonly<RuntimeClaimRegistry> {
  return objectFreeze({
    available: new NativeWeakSet<Readonly<FloodgateTeacherStageLease>>(),
    publicationControllers: new NativeWeakMap<
      Readonly<FloodgateTeacherStageLease>,
      Readonly<RuntimePublicationController>
    >(),
    boundary,
  });
}

const PRODUCTION_RUNTIME_CLAIMS = createRuntimeClaimRegistry("production");
const TEST_RUNTIME_CLAIMS = createRuntimeClaimRegistry("test-only");
const PRODUCTION_ORIGIN_LEASES = new NativeWeakSet<
  Readonly<FloodgateTeacherStageLease>
>();
const TEST_REALM_LEASES = new NativeWeakSet<
  Readonly<FloodgateTeacherStageLease>
>();
const SYNTHETIC_TEST_LEASE_PATH_BINDINGS = new NativeWeakMap<
  Readonly<FloodgateTeacherStageLease>,
  Readonly<SyntheticTestLeasePathBinding>
>();

interface LeaseNamespaceGuard {
  readonly leaseRoot: string;
  state: "active" | "indeterminate" | "released";
}

const LEASE_NAMESPACE_GUARDS = new Map<string, LeaseNamespaceGuard>();

function acquireLeaseNamespaceGuard(leaseRoot: string): LeaseNamespaceGuard {
  if (
    reflectApply(nativeMapGet, LEASE_NAMESPACE_GUARDS, [leaseRoot]) !==
    undefined
  ) {
    throw new FloodgateTeacherStageLeaseUnavailableError(
      "an active or durability-indeterminate lease namespace is already held in this process",
    );
  }
  const guard = objectCreate(null) as LeaseNamespaceGuard;
  objectDefineProperty(guard, "leaseRoot", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: leaseRoot,
  });
  guard.state = "active";
  reflectApply(nativeMapSet, LEASE_NAMESPACE_GUARDS, [leaseRoot, guard]);
  return guard;
}

function assertLeaseNamespaceGuardActive(guard: LeaseNamespaceGuard): void {
  if (
    guard.state !== "active" ||
    reflectApply(nativeMapGet, LEASE_NAMESPACE_GUARDS, [guard.leaseRoot]) !==
      guard
  ) {
    authorizationFailure("lease namespace guard is not exact and active");
  }
}

function markLeaseNamespaceGuardIndeterminate(
  guard: LeaseNamespaceGuard,
): void {
  const current = reflectApply(nativeMapGet, LEASE_NAMESPACE_GUARDS, [
    guard.leaseRoot,
  ]);
  if (current !== guard || guard.state === "released") {
    authorizationFailure("lease namespace guard cannot become indeterminate");
  }
  guard.state = "indeterminate";
}

function releaseLeaseNamespaceGuard(guard: LeaseNamespaceGuard): void {
  assertLeaseNamespaceGuardActive(guard);
  if (
    reflectApply(nativeMapDelete, LEASE_NAMESPACE_GUARDS, [guard.leaseRoot]) !==
    true
  ) {
    authorizationFailure("lease namespace guard could not be released");
  }
  guard.state = "released";
}

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

function runtimeClaimHas(
  registrySet: WeakSet<Readonly<FloodgateTeacherStageLease>>,
  lease: Readonly<FloodgateTeacherStageLease>,
): boolean {
  return reflectApply(nativeWeakSetHas, registrySet, [lease]) as boolean;
}

function runtimePublicationSet(
  registryMap: WeakMap<
    Readonly<FloodgateTeacherStageLease>,
    Readonly<RuntimePublicationController>
  >,
  lease: Readonly<FloodgateTeacherStageLease>,
  controller: Readonly<RuntimePublicationController>,
): void {
  reflectApply(nativeWeakMapSet, registryMap, [lease, controller]);
}

function runtimePublicationGet(
  registryMap: WeakMap<
    Readonly<FloodgateTeacherStageLease>,
    Readonly<RuntimePublicationController>
  >,
  lease: Readonly<FloodgateTeacherStageLease>,
): Readonly<RuntimePublicationController> | undefined {
  return reflectApply(nativeWeakMapGet, registryMap, [lease]) as
    Readonly<RuntimePublicationController> | undefined;
}

function runtimePublicationDelete(
  registryMap: WeakMap<
    Readonly<FloodgateTeacherStageLease>,
    Readonly<RuntimePublicationController>
  >,
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  reflectApply(nativeWeakMapDelete, registryMap, [lease]);
}

function activateRuntimeClaim(
  registry: Readonly<RuntimeClaimRegistry>,
  lease: Readonly<FloodgateTeacherStageLease>,
  publicationController: Readonly<RuntimePublicationController>,
): void {
  runtimeClaimAdd(registry.available, lease);
  runtimePublicationSet(
    registry.publicationControllers,
    lease,
    publicationController,
  );
  if (registry === TEST_RUNTIME_CLAIMS) {
    runtimeClaimAdd(TEST_REALM_LEASES, lease);
  } else if (registry === PRODUCTION_RUNTIME_CLAIMS) {
    runtimeClaimAdd(PRODUCTION_ORIGIN_LEASES, lease);
  }
}

function revokeRuntimeClaim(
  registry: Readonly<RuntimeClaimRegistry>,
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  runtimeClaimDelete(registry.available, lease);
  runtimePublicationDelete(registry.publicationControllers, lease);
  if (registry === TEST_RUNTIME_CLAIMS) {
    runtimeClaimDelete(TEST_REALM_LEASES, lease);
  }
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
  runtimePublicationDelete(registry.publicationControllers, lease);
  if (registry === TEST_RUNTIME_CLAIMS) {
    runtimeClaimDelete(TEST_REALM_LEASES, lease);
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

/**
 * Assert, without consuming it, that a lease is the exact active object issued
 * by this module's test realm or explicitly registered as a safe synthetic
 * test lease.
 */
export function assertFloodgateTeacherStageLeaseTestRealmCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
): void {
  if (
    lease === null ||
    typeof lease !== "object" ||
    nodeIsProxy(lease) ||
    !runtimeClaimHas(TEST_REALM_LEASES, lease)
  ) {
    authorizationFailure(
      "test realm assertion requires the exact active test lease",
    );
  }
  const syntheticPathBinding = reflectApply(
    nativeWeakMapGet,
    SYNTHETIC_TEST_LEASE_PATH_BINDINGS,
    [lease],
  ) as Readonly<SyntheticTestLeasePathBinding> | undefined;
  if (syntheticPathBinding !== undefined) {
    assertSyntheticTestLeasePathBinding(lease, syntheticPathBinding);
  }
}

const PUBLICATION_DEPENDENCY_KEYS = new Set<string>([
  "exclusiveRename",
  "beforeReconcileForTests",
  "beforeDestinationReopenForTests",
  "syncDirectoryForTests",
  "removeLeaseDirectoryForTests",
  "closePublicationDirectoryForTests",
]);

function lookupRuntimePublication(
  registry: Readonly<RuntimeClaimRegistry>,
  lease: Readonly<FloodgateTeacherStageLease>,
): Readonly<RuntimePublicationController> {
  if (!runtimeClaimHas(registry.available, lease)) {
    throw new FloodgateTeacherStagePublicationOwnershipTransferredError(
      `${registry.boundary} begin requires the exact active unclaimed lease`,
    );
  }
  const controller = runtimePublicationGet(
    registry.publicationControllers,
    lease,
  );
  if (controller === undefined) {
    throw new FloodgateTeacherStagePublicationOwnershipTransferredError(
      `${registry.boundary} active lease has no publication authority`,
    );
  }
  return controller;
}

function capturePublicationDependencies(
  input: FloodgateTeacherStagePublicationDependencies,
): Readonly<CapturedPublicationDependencies> {
  if (input === null || typeof input !== "object" || arrayIsArray(input)) {
    authorizationFailure("publication dependencies must be an object");
  }
  const descriptors = objectGetOwnPropertyDescriptors(input);
  const keys = reflectOwnKeys(descriptors);
  const captured = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (
      typeof key !== "string" ||
      !reflectApply(nativeSetHas, PUBLICATION_DEPENDENCY_KEYS, [key])
    ) {
      authorizationFailure(
        "publication dependencies contain an unexpected field",
      );
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !reflectApply(objectHasOwn, descriptor, ["value"]) ||
      descriptor.enumerable !== true
    ) {
      authorizationFailure(
        `publication dependencies.${key} must be an enumerable data property`,
      );
    }
    captured[key] = descriptor.value;
  }
  if (typeof captured.exclusiveRename !== "function") {
    authorizationFailure(
      "publication dependencies.exclusiveRename must be a function",
    );
  }
  const optionalFunctions = [
    "beforeReconcileForTests",
    "beforeDestinationReopenForTests",
    "syncDirectoryForTests",
    "removeLeaseDirectoryForTests",
    "closePublicationDirectoryForTests",
  ] as const;
  for (let index = 0; index < optionalFunctions.length; index += 1) {
    const key = optionalFunctions[index];
    if (captured[key] !== undefined && typeof captured[key] !== "function") {
      authorizationFailure(
        `publication dependencies.${key} must be a function`,
      );
    }
  }
  return freezeNonThenable({
    executionBoundary: "test-only-injected-exclusive-rename" as const,
    exclusiveRename:
      captured.exclusiveRename as FloodgateTeacherStagePublicationDependencies["exclusiveRename"],
    beforeReconcileForTests: captured.beforeReconcileForTests as
      CapturedPublicationDependencies["beforeReconcileForTests"] | undefined,
    beforeDestinationReopenForTests:
      captured.beforeDestinationReopenForTests as
        | CapturedPublicationDependencies["beforeDestinationReopenForTests"]
        | undefined,
    syncDirectoryForTests: captured.syncDirectoryForTests as
      CapturedPublicationDependencies["syncDirectoryForTests"] | undefined,
    removeLeaseDirectoryForTests: captured.removeLeaseDirectoryForTests as
      | CapturedPublicationDependencies["removeLeaseDirectoryForTests"]
      | undefined,
    closePublicationDirectoryForTests:
      captured.closePublicationDirectoryForTests as
        | CapturedPublicationDependencies["closePublicationDirectoryForTests"]
        | undefined,
  });
}

const fixedProductionExclusiveRename: FloodgateTeacherStagePublicationDependencies["exclusiveRename"] =
  async (source, destination, sourceHandle) => {
    const renameModule = await import("./floodgate-exclusive-directory-rename");
    return renameModule.exclusiveRenameFloodgateDirectory(
      source,
      destination,
      sourceHandle,
    );
  };

const PRODUCTION_PUBLICATION_DEPENDENCIES = freezeNonThenable({
  executionBoundary: "production-fixed-exclusive-rename" as const,
  exclusiveRename: fixedProductionExclusiveRename,
});

function beginPublicationFromRegistry(
  registry: Readonly<RuntimeClaimRegistry>,
  lease: Readonly<FloodgateTeacherStageLease>,
  dependencies: Readonly<CapturedPublicationDependencies>,
): Readonly<FloodgateTeacherStagePublicationTransaction> {
  const controller = lookupRuntimePublication(registry, lease);
  if (!runtimeClaimDelete(registry.available, lease)) {
    throw new FloodgateTeacherStagePublicationOwnershipTransferredError(
      `${registry.boundary} publication authority was already consumed`,
    );
  }
  runtimePublicationDelete(registry.publicationControllers, lease);
  if (registry === TEST_RUNTIME_CLAIMS) {
    runtimeClaimDelete(TEST_REALM_LEASES, lease);
  }
  return controller.begin(dependencies);
}

/** Begin a transaction using the fixed production exclusive-rename primitive. */
export function beginFloodgateTeacherStagePublication(
  lease: Readonly<FloodgateTeacherStageLease>,
): Readonly<FloodgateTeacherStagePublicationTransaction> {
  return beginPublicationFromRegistry(
    PRODUCTION_RUNTIME_CLAIMS,
    lease,
    PRODUCTION_PUBLICATION_DEPENDENCIES,
  );
}

/** Test-only publication transaction with strictly captured failure seams. */
export function beginFloodgateTeacherStagePublicationCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  dependenciesInput: FloodgateTeacherStagePublicationDependencies,
): Readonly<FloodgateTeacherStagePublicationTransaction> {
  // Exact-object lookup deliberately precedes all dependency inspection.
  lookupRuntimePublication(TEST_RUNTIME_CLAIMS, lease);
  const dependencies = capturePublicationDependencies(dependenciesInput);
  return beginPublicationFromRegistry(TEST_RUNTIME_CLAIMS, lease, dependencies);
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
  readonly syncLeaseDirectoryForTests?: (
    sync: () => Promise<void>,
  ) => Promise<void>;
  readonly syncParentDirectoryForTests?: (
    kind: "lease-created" | "lease-removed",
    sync: () => Promise<void>,
  ) => Promise<void>;
}

export class FloodgateTeacherStageAuthorizationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Floodgate teacher stage authorization failed: ${message}`, options);
    this.name = "FloodgateTeacherStageAuthorizationError";
  }
}

export class FloodgateTeacherStageAuthorizationDurabilityIndeterminateError extends FloodgateTeacherStageAuthorizationError {
  declare readonly leaseMayRemain: true;
  declare readonly phase: "lease-creation-sync";

  constructor() {
    super("exclusive lease creation durability is indeterminate");
    const name =
      "FloodgateTeacherStageAuthorizationDurabilityIndeterminateError";
    objectDefineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: name,
    });
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: `${name}: ${this.message}`,
    });
    objectDefineProperty(this, "leaseMayRemain", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: true,
    });
    objectDefineProperty(this, "phase", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: "lease-creation-sync",
    });
    objectFreeze(this);
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

interface FloodgateTeacherStagePublicationErrorFacets {
  readonly mayHavePublished: boolean;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly cleanupFailures?: readonly unknown[];
  readonly phase: FloodgateTeacherStagePublicationFailurePhase;
  readonly primary: unknown;
  readonly cause?: unknown;
}

abstract class FloodgateTeacherStagePublicationError extends Error {
  abstract readonly mayHavePublished: boolean;
  abstract readonly mayHaveCommitted: boolean;
  readonly publicationDurability: FloodgateTeacherStagePublicationDurability;
  readonly destinationReopened: boolean;
  readonly leaseMayRemain: boolean;
  readonly cleanupFailures: readonly unknown[];
  readonly phase: FloodgateTeacherStagePublicationFailurePhase;
  readonly primary: unknown;

  protected constructor(
    prefix: string,
    message: string,
    facets: Readonly<FloodgateTeacherStagePublicationErrorFacets>,
  ) {
    super(
      `${prefix}: ${message}`,
      facets.cause === undefined ? undefined : { cause: facets.cause },
    );
    this.publicationDurability = facets.publicationDurability;
    this.destinationReopened = facets.destinationReopened;
    this.leaseMayRemain = facets.leaseMayRemain;
    this.cleanupFailures = frozenArrayCopy(facets.cleanupFailures ?? []);
    this.phase = facets.phase;
    this.primary = facets.primary;
  }
}

export class FloodgateTeacherStagePublicationNotCommittedError extends FloodgateTeacherStagePublicationError {
  readonly mayHavePublished = false as const;
  readonly mayHaveCommitted = false as const;

  constructor(
    message: string,
    facets: Omit<
      FloodgateTeacherStagePublicationErrorFacets,
      "mayHavePublished"
    >,
  ) {
    super("Floodgate teacher stage publication did not commit", message, {
      ...facets,
      mayHavePublished: false,
    });
    this.name = "FloodgateTeacherStagePublicationNotCommittedError";
  }
}

export class FloodgateTeacherStagePublicationIndeterminateError extends FloodgateTeacherStagePublicationError {
  readonly mayHavePublished = true as const;
  readonly mayHaveCommitted = true as const;

  constructor(
    message: string,
    facets: Omit<
      FloodgateTeacherStagePublicationErrorFacets,
      "mayHavePublished"
    >,
  ) {
    super("Floodgate teacher stage publication is indeterminate", message, {
      ...facets,
      mayHavePublished: true,
    });
    this.name = "FloodgateTeacherStagePublicationIndeterminateError";
  }
}

export class FloodgateTeacherStagePublicationOwnershipTransferredError extends Error {
  readonly transactionState =
    "ownership-transferred-or-authority-unavailable" as const;

  constructor(message: string) {
    super(`Floodgate teacher stage ownership transferred: ${message}`);
    this.name = "FloodgateTeacherStagePublicationOwnershipTransferredError";
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
  readonly sync: () => Promise<void>;
  readonly close: () => Promise<void>;
}

interface EntryInspectorConfiguration {
  readonly pythonExecutable: string;
  readonly script: string;
  readonly timeoutMilliseconds: number;
  readonly maxOutputBytes: number;
}

type CapturedDependencies = FloodgateTeacherStageAuthorizationDependencies;

interface CapturedPublicationDependencies {
  readonly executionBoundary: FloodgateTeacherStagePublicationExecutionBoundary;
  readonly exclusiveRename: FloodgateTeacherStagePublicationDependencies["exclusiveRename"];
  readonly beforeReconcileForTests?: () => void | Promise<void>;
  readonly beforeDestinationReopenForTests?: () => void | Promise<void>;
  readonly syncDirectoryForTests?: FloodgateTeacherStagePublicationDependencies["syncDirectoryForTests"];
  readonly removeLeaseDirectoryForTests?: FloodgateTeacherStagePublicationDependencies["removeLeaseDirectoryForTests"];
  readonly closePublicationDirectoryForTests?: FloodgateTeacherStagePublicationDependencies["closePublicationDirectoryForTests"];
}

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

function pathFailureCode(value: unknown): string | undefined {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(value, "code");
  if (
    descriptor === undefined ||
    !reflectApply(objectHasOwn, descriptor, ["value"]) ||
    typeof descriptor.value !== "string"
  ) {
    return undefined;
  }
  return descriptor.value;
}

interface ResolvedTestBoundaryPath {
  readonly resolved: string;
  readonly existingAncestor: string;
}

interface ProductionHomeTestBoundary {
  readonly path: string;
  readonly dev: bigint;
  readonly ino: bigint;
}

function resolveThroughExistingAncestorForTestBoundary(
  value: string,
): Readonly<ResolvedTestBoundaryPath> {
  let cursor = value;
  let unresolvedSuffix = "";
  let symbolicLinksResolved = 0;
  for (;;) {
    try {
      const existingAncestor = nativeRealpathSync(cursor);
      const resolved =
        unresolvedSuffix.length === 0
          ? existingAncestor
          : pathJoin(existingAncestor, unresolvedSuffix);
      return freezeNonThenable({
        resolved: canonicalAbsolutePath(resolved, "resolved test path"),
        existingAncestor,
      });
    } catch (cause) {
      if (pathFailureCode(cause) !== "ENOENT") {
        authorizationFailure(
          "test path parent or directory cannot be resolved safely",
          cause,
        );
      }
      let danglingLinkStat: fs.BigIntStats | undefined;
      try {
        danglingLinkStat = nativeLstatSync(cursor, { bigint: true });
      } catch (lstatCause) {
        if (pathFailureCode(lstatCause) !== "ENOENT") {
          authorizationFailure(
            "test path ancestor cannot be inspected safely",
            lstatCause,
          );
        }
      }
      if (
        danglingLinkStat !== undefined &&
        (danglingLinkStat.mode & MODE_TYPE_MASK) === MODE_SYMBOLIC_LINK
      ) {
        symbolicLinksResolved += 1;
        if (symbolicLinksResolved > TEST_PATH_MAX_SYMBOLIC_LINKS) {
          authorizationFailure("test path has too many symbolic links");
        }
        let target: string;
        try {
          target = nativeReadlinkSync(cursor, "utf8");
        } catch (readlinkCause) {
          authorizationFailure(
            "test path symbolic link cannot be read safely",
            readlinkCause,
          );
        }
        const resolvedTarget = pathIsAbsolute(target)
          ? pathResolve(target)
          : pathResolve(pathDirname(cursor), target);
        cursor =
          unresolvedSuffix.length === 0
            ? resolvedTarget
            : pathJoin(resolvedTarget, unresolvedSuffix);
        unresolvedSuffix = "";
        continue;
      }
      if (danglingLinkStat !== undefined) {
        authorizationFailure(
          "test path resolution changed during boundary inspection",
        );
      }
      const parent = pathDirname(cursor);
      if (parent === cursor) {
        authorizationFailure("test path has no resolvable ancestor", cause);
      }
      const basename = pathBasename(cursor);
      unresolvedSuffix =
        unresolvedSuffix.length === 0
          ? basename
          : pathJoin(basename, unresolvedSuffix);
      cursor = parent;
    }
  }
}

function currentEffectiveUserProductionHomeForTestBoundary(): Readonly<ProductionHomeTestBoundary> {
  if (nativeGetEffectiveUserId === null) {
    authorizationFailure(
      "POSIX effective-user identity is required for the test path boundary",
    );
  }
  let user: ReturnType<typeof os.userInfo>;
  try {
    user = getUserInfo();
  } catch (cause) {
    authorizationFailure("current-EUID production home cannot be read", cause);
  }
  if (user.uid !== nativeGetEffectiveUserId()) {
    authorizationFailure("current-EUID production home identity differs");
  }
  const requestedHome = canonicalAbsolutePath(
    user.homedir,
    "current-EUID production home",
  );
  let canonicalHome: string;
  try {
    canonicalHome = nativeRealpathSync(requestedHome);
  } catch (cause) {
    authorizationFailure(
      "current-EUID production home cannot be resolved",
      cause,
    );
  }
  const productionHome = canonicalAbsolutePath(
    canonicalHome,
    "canonical current-EUID production home",
  );
  let identity: fs.BigIntStats;
  try {
    identity = nativeStatSync(productionHome, { bigint: true });
  } catch (cause) {
    authorizationFailure(
      "canonical current-EUID production home identity cannot be read",
      cause,
    );
  }
  return freezeNonThenable({
    path: productionHome,
    dev: identity.dev,
    ino: identity.ino,
  });
}

function assertExistingAncestorOutsideProductionHomeIdentity(
  existingAncestor: string,
  productionHome: Readonly<ProductionHomeTestBoundary>,
): void {
  let cursor = existingAncestor;
  for (;;) {
    let identity: fs.BigIntStats;
    try {
      identity = nativeStatSync(cursor, { bigint: true });
    } catch (cause) {
      authorizationFailure("test path ancestor identity cannot be read", cause);
    }
    if (
      identity.dev === productionHome.dev &&
      identity.ino === productionHome.ino
    ) {
      authorizationFailure(
        "test home aliases production home through a guarded path identity",
      );
    }
    const parent = pathDirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

/**
 * Test-only shared path guard. Every entry must be a dense, plain-array data
 * property and must resolve outside the canonical current-EUID home, including
 * through a symlink at any existing ancestor.
 */
export function assertFloodgateTestPathsOutsideProductionHomeCoreForTests(
  paths: readonly string[],
): void {
  if (
    !arrayIsArray(paths) ||
    nodeIsProxy(paths) ||
    objectGetPrototypeOf(paths) !== nativeArrayPrototype
  ) {
    authorizationFailure("test paths must be a plain non-Proxy array");
  }
  const descriptors = objectGetOwnPropertyDescriptors(paths);
  const ownKeys = reflectOwnKeys(descriptors);
  const lengthDescriptor = objectGetOwnPropertyDescriptor(paths, "length");
  if (
    lengthDescriptor === undefined ||
    !reflectApply(objectHasOwn, lengthDescriptor, ["value"]) ||
    typeof lengthDescriptor.value !== "number" ||
    !numberIsSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 1 ||
    ownKeys.length !== lengthDescriptor.value + 1
  ) {
    authorizationFailure("test paths must be a nonempty dense plain array");
  }
  const length = lengthDescriptor.value;
  const captured = mutableNullPrototypeArray<string>();
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[index];
    if (
      descriptor === undefined ||
      !reflectApply(objectHasOwn, descriptor, ["value"]) ||
      descriptor.enumerable !== true
    ) {
      authorizationFailure(
        `test paths[${index}] must be an enumerable own data property`,
      );
    }
    captured[captured.length] = canonicalAbsolutePath(
      descriptor.value,
      `test paths[${index}]`,
    );
  }

  const productionHome = currentEffectiveUserProductionHomeForTestBoundary();
  for (let index = 0; index < captured.length; index += 1) {
    const resolved = resolveThroughExistingAncestorForTestBoundary(
      captured[index],
    );
    if (sameOrAncestor(productionHome.path, resolved.resolved)) {
      authorizationFailure(
        "test home aliases production home through a guarded path",
      );
    }
    assertExistingAncestorOutsideProductionHomeIdentity(
      resolved.existingAncestor,
      productionHome,
    );
  }
}

function assertSyntheticTestLeasePathBinding(
  lease: Readonly<FloodgateTeacherStageLease>,
  binding: Readonly<SyntheticTestLeasePathBinding>,
): void {
  const stageDescriptor = objectGetOwnPropertyDescriptor(lease, "stageRoot");
  const destinationDescriptor = objectGetOwnPropertyDescriptor(
    lease,
    "destinationRoot",
  );
  if (
    stageDescriptor === undefined ||
    !reflectApply(objectHasOwn, stageDescriptor, ["value"]) ||
    stageDescriptor.enumerable !== true ||
    stageDescriptor.value !== binding.stageRoot ||
    destinationDescriptor === undefined ||
    !reflectApply(objectHasOwn, destinationDescriptor, ["value"]) ||
    destinationDescriptor.enumerable !== true ||
    destinationDescriptor.value !== binding.destinationRoot
  ) {
    authorizationFailure("synthetic test lease path binding differs");
  }
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests([
    binding.stageRoot,
    binding.destinationRoot,
  ]);
}

/**
 * Register a structurally minimal synthetic lease for composition tests. This
 * cannot rebrand a production lease, and its exposed paths must remain wholly
 * outside the current-EUID production home.
 */
export function registerSyntheticFloodgateTeacherStageLeaseTestRealmCoreForTests(
  lease: unknown,
): void {
  if (
    lease === null ||
    typeof lease !== "object" ||
    arrayIsArray(lease) ||
    nodeIsProxy(lease) ||
    (objectGetPrototypeOf(lease) !== nativeObjectPrototype &&
      objectGetPrototypeOf(lease) !== null)
  ) {
    authorizationFailure(
      "synthetic test lease must be a plain non-Proxy object",
    );
  }
  const descriptors = objectGetOwnPropertyDescriptors(lease);
  const ownKeys = reflectOwnKeys(descriptors);
  const requiredKeys = [
    "receipt",
    "stageRoot",
    "destinationRoot",
    "close",
  ] as const;
  if (ownKeys.length !== requiredKeys.length) {
    authorizationFailure("synthetic test lease fields differ");
  }
  const captured = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < requiredKeys.length; index += 1) {
    const key = requiredKeys[index];
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !reflectApply(objectHasOwn, descriptor, ["value"]) ||
      descriptor.enumerable !== true
    ) {
      authorizationFailure(
        `synthetic test lease.${key} must be an enumerable own data property`,
      );
    }
    captured[key] = descriptor.value;
  }
  if (
    captured.receipt === null ||
    typeof captured.receipt !== "object" ||
    nodeIsProxy(captured.receipt) ||
    typeof captured.close !== "function" ||
    nodeIsProxy(captured.close)
  ) {
    authorizationFailure("synthetic test lease fields differ");
  }
  const paths = [captured.stageRoot, captured.destinationRoot];
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests(
    paths as readonly string[],
  );
  const capturedLease = lease as Readonly<FloodgateTeacherStageLease>;
  if (
    runtimeClaimHas(PRODUCTION_ORIGIN_LEASES, capturedLease) ||
    runtimeClaimHas(TEST_REALM_LEASES, capturedLease)
  ) {
    authorizationFailure("synthetic test lease origin differs");
  }
  const pathBinding = freezeNonThenable({
    stageRoot: captured.stageRoot as string,
    destinationRoot: captured.destinationRoot as string,
  });
  reflectApply(nativeWeakMapSet, SYNTHETIC_TEST_LEASE_PATH_BINDINGS, [
    capturedLease,
    pathBinding,
  ]);
  runtimeClaimAdd(TEST_REALM_LEASES, capturedLease);
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
    "syncLeaseDirectoryForTests",
    "syncParentDirectoryForTests",
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

function assertTestAuthorizationOptionsOutsideProductionHome(
  options: Readonly<CapturedOptions>,
): void {
  const paths: string[] = [];
  paths[paths.length] = options.repositoryRoot;
  paths[paths.length] = options.rawLockRoot;
  paths[paths.length] = options.roleLockRoot;
  paths[paths.length] = options.roleBundleRoot;
  paths[paths.length] = options.legacyProtectedPositionIdsPath;
  paths[paths.length] = options.publicationParent;
  paths[paths.length] = pathJoin(
    options.publicationParent,
    options.stageBasename,
  );
  paths[paths.length] = pathJoin(
    options.publicationParent,
    options.destinationBasename,
  );
  paths[paths.length] = pathJoin(
    options.publicationParent,
    `.${options.stageBasename}.authorization-lease`,
  );
  paths[paths.length] = options.engineBin;
  paths[paths.length] = options.engineReceipt;
  if (options.evalDir !== undefined) {
    paths[paths.length] = options.evalDir;
  }
  for (let index = 0; index < options.engineArgs.length; index += 1) {
    const argument = options.engineArgs[index];
    if (pathIsAbsolute(argument)) {
      paths[paths.length] = argument;
    }
  }
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests(paths);
}

function assertTestAuthorizationDependenciesOutsideProductionHome(
  dependencies: Readonly<CapturedDependencies>,
): void {
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests([
    canonicalAbsolutePath(
      dependencies.inspectorPythonExecutable,
      "stage entry inspector Python executable",
    ),
  ]);
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

function syncDirectoryDescriptor(descriptor: number): Promise<void> {
  return new NativePromise<void>((resolve, reject) => {
    fsyncDescriptor(descriptor, (error) => {
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
    const syncHeld = () => syncDirectoryDescriptor(descriptor);
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
      sync: syncHeld,
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

async function syncHeldDirectory(
  opened: Readonly<OpenedDirectory>,
  target: string,
  expectedUserId: bigint,
  label: string,
  sync: () => Promise<void>,
): Promise<void> {
  await assertOpenedDirectoryUnchanged(
    opened,
    target,
    expectedUserId,
    `${label} before sync`,
  );
  await sync();
  await assertOpenedDirectoryUnchanged(
    opened,
    target,
    expectedUserId,
    `${label} after sync`,
  );
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

function closePublicationDirectory(
  kind: "rename-source" | "destination" | "lease" | "stage" | "parent",
  close: () => Promise<void>,
  dependencies: Readonly<CapturedPublicationDependencies>,
): Promise<void> {
  return dependencies.closePublicationDirectoryForTests === undefined
    ? close()
    : dependencies.closePublicationDirectoryForTests(kind, close);
}

function syncAuthorizationParent(
  kind: "lease-created" | "lease-removed",
  parent: Readonly<OpenedDirectory>,
  publicationParent: string,
  expectedUserId: bigint,
  dependencies: Readonly<CapturedDependencies>,
): Promise<void> {
  const sync = () =>
    dependencies.syncParentDirectoryForTests === undefined
      ? parent.sync()
      : dependencies.syncParentDirectoryForTests(kind, parent.sync);
  return syncHeldDirectory(
    parent,
    publicationParent,
    expectedUserId,
    `publication parent for ${kind}`,
    sync,
  );
}

function syncAuthorizationLease(
  lease: Readonly<OpenedDirectory>,
  leaseRoot: string,
  expectedUserId: bigint,
  dependencies: Readonly<CapturedDependencies>,
): Promise<void> {
  const sync = () =>
    dependencies.syncLeaseDirectoryForTests === undefined
      ? lease.sync()
      : dependencies.syncLeaseDirectoryForTests(lease.sync);
  return syncHeldDirectory(
    lease,
    leaseRoot,
    expectedUserId,
    "stage authorization lease creation",
    sync,
  );
}

function syncPublicationParent(
  kind: "parent-before-lease-removal" | "parent-after-lease-removal",
  parent: Readonly<OpenedDirectory>,
  publicationParent: string,
  expectedUserId: bigint,
  dependencies: Readonly<CapturedPublicationDependencies>,
): Promise<void> {
  const sync = () =>
    dependencies.syncDirectoryForTests === undefined
      ? parent.sync()
      : dependencies.syncDirectoryForTests(kind, parent.sync);
  return syncHeldDirectory(
    parent,
    publicationParent,
    expectedUserId,
    `publication parent for ${kind}`,
    sync,
  );
}

function removePublicationLease(
  leaseRoot: string,
  dependencies: Readonly<CapturedPublicationDependencies>,
): Promise<void> {
  return dependencies.removeLeaseDirectoryForTests === undefined
    ? rmdirPath(leaseRoot)
    : dependencies.removeLeaseDirectoryForTests(leaseRoot, () =>
        rmdirPath(leaseRoot),
      );
}

async function lstatIfPresent(
  target: string,
): Promise<Readonly<FilesystemStatSnapshot> | undefined> {
  try {
    return await lstatSnapshot(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function isExactPrivateDirectoryIdentity(
  stat: Readonly<FilesystemStatSnapshot> | undefined,
  expectedIdentity: Readonly<FloodgateTeacherStageIdentity>,
  expectedUserId: bigint,
): boolean {
  return (
    stat !== undefined &&
    hasFileType(stat, MODE_DIRECTORY) &&
    stat.uid === expectedUserId &&
    (stat.mode & MODE_PERMISSION_AND_SPECIAL_BITS) === MODE_PRIVATE_DIRECTORY &&
    sameIdentity(directoryIdentity(stat), expectedIdentity)
  );
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || arrayIsArray(value)) {
    authorizationFailure(`${label} must be an object`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expectedKeys.length) {
    authorizationFailure(`${label} has an unexpected field set`);
  }
  const captured = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !reflectApply(objectHasOwn, descriptor, ["value"]) ||
      descriptor.enumerable !== true
    ) {
      authorizationFailure(`${label}.${key} must be an enumerable data field`);
    }
    captured[key] = descriptor.value;
  }
  return objectFreeze(captured);
}

function exactRenameIdentity(
  value: unknown,
  expected: Readonly<FloodgateTeacherStageIdentity>,
  label: string,
): void {
  const captured = exactDataRecord(value, ["dev", "ino"], label);
  if (captured.dev !== expected.dev || captured.ino !== expected.ino) {
    authorizationFailure(`${label} differs from the held identity`);
  }
}

function validateExclusiveRenameReceipt(
  value: unknown,
  expectedContract: string,
  expectedTrustBoundary: string,
  expectedParent: Readonly<FloodgateTeacherStageIdentity>,
  expectedDestination: Readonly<FloodgateTeacherStageIdentity>,
): void {
  const captured = exactDataRecord(
    value,
    [
      "contract",
      "trust_boundary",
      "status",
      "parent_identity",
      "destination_identity",
    ],
    "exclusive rename receipt",
  );
  if (
    captured.contract !== expectedContract ||
    captured.trust_boundary !== expectedTrustBoundary ||
    captured.status !== "verified-committed"
  ) {
    authorizationFailure("exclusive rename receipt contract is invalid");
  }
  exactRenameIdentity(
    captured.parent_identity,
    expectedParent,
    "exclusive rename parent identity",
  );
  exactRenameIdentity(
    captured.destination_identity,
    expectedDestination,
    "exclusive rename destination identity",
  );
}

async function removeLeaseAfterFailure(
  namespaceGuard: LeaseNamespaceGuard,
  parent: Readonly<OpenedDirectory>,
  publicationParent: string,
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
  let removedFromPath = false;
  try {
    await assertOpenedDirectoryUnchanged(
      parent,
      publicationParent,
      expectedUserId,
      "publication parent before failed-authorization lease removal",
    );
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
    assertLeaseNamespaceGuardActive(namespaceGuard);
    await rmdirPath(leaseRoot);
    removedFromPath = true;
    await syncAuthorizationParent(
      "lease-removed",
      parent,
      publicationParent,
      expectedUserId,
      dependencies,
    );
    return freezeNonThenable({
      removed: true,
      failures: objectFreeze(failures),
    });
  } catch (error) {
    if (removedFromPath) {
      markLeaseNamespaceGuardIndeterminate(namespaceGuard);
    }
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
  if (runtimeClaims === TEST_RUNTIME_CLAIMS) {
    assertTestAuthorizationOptionsOutsideProductionHome(options);
  }
  const dependencies = captureDependencies(dependenciesInput);
  if (runtimeClaims === TEST_RUNTIME_CLAIMS) {
    assertTestAuthorizationDependenciesOutsideProductionHome(dependencies);
  }
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
  const namespaceGuard = acquireLeaseNamespaceGuard(leaseRoot);
  let inspector: Readonly<EntryInspectorConfiguration>;
  try {
    inspector = await entryInspectorConfiguration(dependencies);
  } catch (error) {
    releaseLeaseNamespaceGuard(namespaceGuard);
    throw error;
  }
  let parent: Readonly<OpenedDirectory>;
  try {
    parent = await openPrivateDirectory(
      options.publicationParent,
      expectedUserId,
      "publication parent",
    );
  } catch (error) {
    releaseLeaseNamespaceGuard(namespaceGuard);
    throw error;
  }
  let stage: Readonly<OpenedDirectory> | undefined;
  let lease: Readonly<OpenedDirectory> | undefined;
  let leaseCreated = false;
  let leaseCreationDurabilityFailure:
    FloodgateTeacherStageAuthorizationDurabilityIndeterminateError | undefined;
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
      assertLeaseNamespaceGuardActive(namespaceGuard);
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
      await syncAuthorizationLease(
        lease,
        leaseRoot,
        expectedUserId,
        dependencies,
      );
      await syncAuthorizationParent(
        "lease-created",
        parent,
        options.publicationParent,
        expectedUserId,
        dependencies,
      );
      await assertOpenedDirectoryUnchanged(
        lease,
        leaseRoot,
        expectedUserId,
        "stage authorization lease after creation durability sync",
      );
    } catch {
      leaseCreationDurabilityFailure =
        new FloodgateTeacherStageAuthorizationDurabilityIndeterminateError();
      markLeaseNamespaceGuardIndeterminate(namespaceGuard);
      throw leaseCreationDurabilityFailure;
    }

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

    const performLeaseClose = async (): Promise<void> => {
      assertLeaseNamespaceGuardActive(namespaceGuard);
      let leaseMayRemain = true;
      let removalDurable = false;
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
        let removedFromPath = false;
        try {
          await assertOpenedDirectoryUnchanged(
            parent,
            options.publicationParent,
            expectedUserId,
            "publication parent immediately before lease removal",
          );
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
          assertLeaseNamespaceGuardActive(namespaceGuard);
          await rmdirPath(leaseRoot);
          removedFromPath = true;
          await syncAuthorizationParent(
            "lease-removed",
            parent,
            options.publicationParent,
            expectedUserId,
            dependencies,
          );
          leaseMayRemain = false;
          removalDurable = true;
        } catch (error) {
          if (removedFromPath) {
            markLeaseNamespaceGuardIndeterminate(namespaceGuard);
          }
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
      if (removalDurable) {
        releaseLeaseNamespaceGuard(namespaceGuard);
      } else {
        markLeaseNamespaceGuardIndeterminate(namespaceGuard);
      }
      if (failures.length > 0) {
        const first = failures[0];
        const detail = failureDetail(first);
        throw new FloodgateTeacherStageCloseError(detail, leaseMayRemain, {
          cause: first,
        });
      }
    };

    let ownership: "lease" | "publication" | "closed" = "lease";
    let closePromise: Promise<void> | undefined;
    let transferredClosePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      if (closePromise !== undefined) return closePromise;
      if (ownership !== "lease") {
        transferredClosePromise ??= NativePromise.reject(
          new FloodgateTeacherStagePublicationOwnershipTransferredError(
            "lease.close cannot reclaim descriptors owned by a publication transaction",
          ),
        );
        return transferredClosePromise;
      }
      ownership = "closed";
      // Calling close synchronously ends the exact-object claim lifetime, even
      // while asynchronous metadata reconciliation remains in progress.
      revokeRuntimeClaim(runtimeClaims, authorizedLease);
      closePromise = performLeaseClose();
      return closePromise;
    };

    const authorizedLease = freezeNonThenable({
      receipt,
      stageRoot,
      destinationRoot,
      close,
    });
    const publicationController: Readonly<RuntimePublicationController> =
      freezeNonThenable({
        begin: (
          publicationDependencies: Readonly<CapturedPublicationDependencies>,
        ): Readonly<FloodgateTeacherStagePublicationTransaction> => {
          if (ownership !== "lease") {
            throw new FloodgateTeacherStagePublicationOwnershipTransferredError(
              "publication begin requires lease-owned descriptors",
            );
          }
          ownership = "publication";

          let phase: FloodgateTeacherStagePublicationPhase = "ready";
          let selected: "none" | "commit" | "abort" = "none";
          let commitPromise:
            | Promise<Readonly<FloodgateTeacherStagePublicationReceipt>>
            | undefined;
          let abortPromise: Promise<void> | undefined;

          const performPublicationCommit = async (): Promise<
            Readonly<FloodgateTeacherStagePublicationReceipt>
          > => {
            assertLeaseNamespaceGuardActive(namespaceGuard);
            let sourceHandle: fs.promises.FileHandle | undefined;
            let destination: Readonly<OpenedDirectory> | undefined;
            let sourceClosed = false;
            let destinationClosed = false;
            let leaseClosed = false;
            let stageClosed = false;
            let parentClosed = false;
            let destinationReopened = false;
            let leaseMayRemain = true;
            let publicationDurability: FloodgateTeacherStagePublicationDurability =
              "not-established";

            const closePublicationHandles = async (): Promise<
              readonly unknown[]
            > => {
              const failures = mutableNullPrototypeArray<unknown>();
              if (sourceHandle !== undefined && !sourceClosed) {
                try {
                  await closePublicationDirectory(
                    "rename-source",
                    () => (sourceHandle as fs.promises.FileHandle).close(),
                    publicationDependencies,
                  );
                  sourceClosed = true;
                } catch (error) {
                  failures[failures.length] = error;
                }
              }
              if (destination !== undefined && !destinationClosed) {
                try {
                  await closePublicationDirectory(
                    "destination",
                    destination.close,
                    publicationDependencies,
                  );
                  destinationClosed = true;
                } catch (error) {
                  failures[failures.length] = error;
                }
              }
              if (!leaseClosed) {
                try {
                  await closePublicationDirectory(
                    "lease",
                    (lease as Readonly<OpenedDirectory>).close,
                    publicationDependencies,
                  );
                  leaseClosed = true;
                } catch (error) {
                  failures[failures.length] = error;
                }
              }
              if (!stageClosed) {
                try {
                  await closePublicationDirectory(
                    "stage",
                    (stage as Readonly<OpenedDirectory>).close,
                    publicationDependencies,
                  );
                  stageClosed = true;
                } catch (error) {
                  failures[failures.length] = error;
                }
              }
              if (!parentClosed) {
                try {
                  await closePublicationDirectory(
                    "parent",
                    parent.close,
                    publicationDependencies,
                  );
                  parentClosed = true;
                } catch (error) {
                  failures[failures.length] = error;
                }
              }
              return objectFreeze(failures);
            };

            const failIndeterminate = async (
              failurePhase: FloodgateTeacherStagePublicationFailurePhase,
              primary: unknown,
              existingCleanupFailures?: readonly unknown[],
            ): Promise<never> => {
              const cleanupFailures =
                existingCleanupFailures ?? (await closePublicationHandles());
              if (
                publicationDurability ===
                  "published-and-lease-removal-durable" &&
                !leaseMayRemain
              ) {
                releaseLeaseNamespaceGuard(namespaceGuard);
              } else {
                markLeaseNamespaceGuardIndeterminate(namespaceGuard);
              }
              phase = "indeterminate";
              ownership = "closed";
              throw new FloodgateTeacherStagePublicationIndeterminateError(
                failureDetail(primary),
                {
                  publicationDurability,
                  destinationReopened,
                  leaseMayRemain,
                  cleanupFailures,
                  phase: failurePhase,
                  primary,
                  cause: primary,
                },
              );
            };

            const failNotCommitted = async (
              failurePhase: "preflight" | "reconcile",
              primary: unknown,
              additionalCleanupFailures: readonly unknown[] = [],
            ): Promise<never> => {
              const cleanupFailures = mutableNullPrototypeArray<unknown>();
              for (
                let index = 0;
                index < additionalCleanupFailures.length;
                index += 1
              ) {
                cleanupFailures[cleanupFailures.length] =
                  additionalCleanupFailures[index];
              }
              try {
                await performLeaseClose();
                leaseMayRemain = false;
                leaseClosed = true;
                stageClosed = true;
                parentClosed = true;
              } catch (error) {
                cleanupFailures[cleanupFailures.length] = error;
                leaseMayRemain =
                  error instanceof FloodgateTeacherStageCloseError
                    ? error.leaseMayRemain
                    : true;
              }
              phase = "aborted";
              ownership = "closed";
              throw new FloodgateTeacherStagePublicationNotCommittedError(
                failureDetail(primary),
                {
                  publicationDurability: "not-established",
                  destinationReopened: false,
                  leaseMayRemain,
                  cleanupFailures,
                  phase: failurePhase,
                  primary,
                  cause: primary,
                },
              );
            };

            try {
              await assertOpenedDirectoryUnchanged(
                parent,
                options.publicationParent,
                expectedUserId,
                "publication parent before publication",
              );
              await assertOpenedDirectoryUnchanged(
                stage as Readonly<OpenedDirectory>,
                stageRoot,
                expectedUserId,
                "teacher stage before publication",
              );
              await assertOpenedDirectoryUnchanged(
                lease as Readonly<OpenedDirectory>,
                leaseRoot,
                expectedUserId,
                "stage authorization lease before publication",
              );
              await assertAbsent(destinationRoot, "publication destination");
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
              sourceHandle = await openFileHandle(
                stageRoot,
                requiredDirectoryFlags(),
              );
              const sourceStat = statSnapshot(
                await sourceHandle.stat({ bigint: true }),
              );
              assertPrivateDirectory(
                sourceStat,
                expectedUserId,
                "fresh publication source handle",
              );
              if (
                !sameIdentity(
                  directoryIdentity(sourceStat),
                  (stage as Readonly<OpenedDirectory>).identity,
                )
              ) {
                authorizationFailure(
                  "fresh publication source handle differs from authorized stage",
                );
              }
            } catch (primary) {
              const cleanupFailures = mutableNullPrototypeArray<unknown>();
              if (sourceHandle !== undefined) {
                try {
                  await closePublicationDirectory(
                    "rename-source",
                    sourceHandle.close.bind(sourceHandle),
                    publicationDependencies,
                  );
                  sourceClosed = true;
                } catch (error) {
                  cleanupFailures[cleanupFailures.length] = error;
                }
              }
              return failNotCommitted("preflight", primary, cleanupFailures);
            }

            let renameFailure: unknown;
            let renameReceiptFailure: unknown;
            let reconcileHookFailure: unknown;
            try {
              const renameReceipt =
                await publicationDependencies.exclusiveRename(
                  stageRoot,
                  destinationRoot,
                  sourceHandle,
                );
              try {
                const renameModule =
                  await import("./floodgate-exclusive-directory-rename");
                validateExclusiveRenameReceipt(
                  renameReceipt,
                  renameModule.FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
                  renameModule.FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
                  parent.identity,
                  (stage as Readonly<OpenedDirectory>).identity,
                );
              } catch (error) {
                renameReceiptFailure = error;
              }
            } catch (error) {
              renameFailure = error;
            }
            try {
              await publicationDependencies.beforeReconcileForTests?.();
            } catch (error) {
              reconcileHookFailure = error;
            }

            let sourcePath: Readonly<FilesystemStatSnapshot> | undefined;
            let destinationPath: Readonly<FilesystemStatSnapshot> | undefined;
            let sourcePathRepeated:
              Readonly<FilesystemStatSnapshot> | undefined;
            let destinationPathRepeated:
              Readonly<FilesystemStatSnapshot> | undefined;
            try {
              sourcePath = await lstatIfPresent(stageRoot);
              destinationPath = await lstatIfPresent(destinationRoot);
              sourcePathRepeated = await lstatIfPresent(stageRoot);
              destinationPathRepeated = await lstatIfPresent(destinationRoot);
            } catch (primary) {
              return failIndeterminate("reconcile", primary);
            }
            const sourceIsOriginal =
              isExactPrivateDirectoryIdentity(
                sourcePath,
                (stage as Readonly<OpenedDirectory>).identity,
                expectedUserId,
              ) &&
              isExactPrivateDirectoryIdentity(
                sourcePathRepeated,
                (stage as Readonly<OpenedDirectory>).identity,
                expectedUserId,
              );
            const destinationIsOriginal =
              isExactPrivateDirectoryIdentity(
                destinationPath,
                (stage as Readonly<OpenedDirectory>).identity,
                expectedUserId,
              ) &&
              isExactPrivateDirectoryIdentity(
                destinationPathRepeated,
                (stage as Readonly<OpenedDirectory>).identity,
                expectedUserId,
              );
            if (
              sourceIsOriginal &&
              destinationPath === undefined &&
              destinationPathRepeated === undefined
            ) {
              const cleanupFailures = mutableNullPrototypeArray<unknown>();
              try {
                await closePublicationDirectory(
                  "rename-source",
                  sourceHandle.close.bind(sourceHandle),
                  publicationDependencies,
                );
                sourceClosed = true;
              } catch (error) {
                cleanupFailures[cleanupFailures.length] = error;
              }
              return failNotCommitted(
                "reconcile",
                renameFailure ??
                  renameReceiptFailure ??
                  new NativeError("exclusive rename left the source in place"),
                cleanupFailures,
              );
            }
            if (!(
              sourcePath === undefined &&
              sourcePathRepeated === undefined &&
              destinationIsOriginal
            )) {
              return failIndeterminate(
                "reconcile",
                renameFailure ??
                  new NativeError(
                    "authorized stage was not found exclusively at source or destination",
                  ),
              );
            }
            if (renameReceiptFailure !== undefined) {
              return failIndeterminate("rename", renameReceiptFailure);
            }
            if (reconcileHookFailure !== undefined) {
              return failIndeterminate("reconcile", reconcileHookFailure);
            }

            try {
              await publicationDependencies.beforeDestinationReopenForTests?.();
              destination = await openPrivateDirectory(
                destinationRoot,
                expectedUserId,
                "published destination",
              );
              if (
                !sameIdentity(
                  destination.identity,
                  (stage as Readonly<OpenedDirectory>).identity,
                )
              ) {
                authorizationFailure(
                  "reopened destination differs from the authorized stage",
                );
              }
              destinationReopened = true;
              await assertOpenedDirectoryUnchanged(
                parent,
                options.publicationParent,
                expectedUserId,
                "publication parent after rename",
              );
              await assertOpenedDirectoryUnchanged(
                destination,
                destinationRoot,
                expectedUserId,
                "published destination after reopen",
              );
              await assertOpenedDirectoryUnchanged(
                lease as Readonly<OpenedDirectory>,
                leaseRoot,
                expectedUserId,
                "stage authorization lease after rename",
              );
              await inspectStageEntries(
                destination,
                destinationRoot,
                expectedUserId,
                protectedPaths,
                inspector,
                dependencies,
                hookPaths(
                  options.publicationParent,
                  destinationRoot,
                  stageRoot,
                  leaseRoot,
                ),
              );
              await revalidateProtectedPaths(protectedPaths);
            } catch (primary) {
              return failIndeterminate("destination-reopen", primary);
            }

            try {
              await syncPublicationParent(
                "parent-before-lease-removal",
                parent,
                options.publicationParent,
                expectedUserId,
                publicationDependencies,
              );
              publicationDurability = "renamed-parent-synced";
            } catch (primary) {
              return failIndeterminate(
                "parent-sync-before-lease-removal",
                primary,
              );
            }

            try {
              await dependencies.beforeLeaseRemovalForTests?.(
                hookPaths(
                  options.publicationParent,
                  destinationRoot,
                  stageRoot,
                  leaseRoot,
                ),
              );
              await assertOpenedDirectoryUnchanged(
                parent,
                options.publicationParent,
                expectedUserId,
                "publication parent before lease removal",
              );
              await assertOpenedDirectoryUnchanged(
                destination,
                destinationRoot,
                expectedUserId,
                "published destination before lease removal",
              );
              await assertOpenedDirectoryUnchanged(
                lease as Readonly<OpenedDirectory>,
                leaseRoot,
                expectedUserId,
                "stage authorization lease before publication removal",
              );
              await inspectStageEntries(
                destination,
                destinationRoot,
                expectedUserId,
                protectedPaths,
                inspector,
                dependencies,
                hookPaths(
                  options.publicationParent,
                  destinationRoot,
                  stageRoot,
                  leaseRoot,
                ),
              );
              await revalidateProtectedPaths(protectedPaths);
              await closePublicationDirectory(
                "lease",
                (lease as Readonly<OpenedDirectory>).close,
                publicationDependencies,
              );
              leaseClosed = true;
              await assertOpenedDirectoryUnchanged(
                parent,
                options.publicationParent,
                expectedUserId,
                "publication parent immediately before publication lease removal",
              );
              const currentLease = await lstatSnapshot(leaseRoot);
              assertPrivateDirectory(
                currentLease,
                expectedUserId,
                "publication lease removal target",
              );
              if (
                !sameIdentity(
                  directoryIdentity(currentLease),
                  (lease as Readonly<OpenedDirectory>).identity,
                )
              ) {
                authorizationFailure(
                  "publication lease removal target is a replacement inode",
                );
              }
              assertLeaseNamespaceGuardActive(namespaceGuard);
              await removePublicationLease(leaseRoot, publicationDependencies);
            } catch (primary) {
              markLeaseNamespaceGuardIndeterminate(namespaceGuard);
              return failIndeterminate("lease-removal", primary);
            }

            try {
              await syncPublicationParent(
                "parent-after-lease-removal",
                parent,
                options.publicationParent,
                expectedUserId,
                publicationDependencies,
              );
              publicationDurability = "published-and-lease-removal-durable";
              leaseMayRemain = false;
            } catch (primary) {
              markLeaseNamespaceGuardIndeterminate(namespaceGuard);
              return failIndeterminate(
                "parent-sync-after-lease-removal",
                primary,
              );
            }

            try {
              await assertOpenedDirectoryUnchanged(
                parent,
                options.publicationParent,
                expectedUserId,
                "publication parent after durable lease removal",
              );
              await assertOpenedDirectoryUnchanged(
                destination,
                destinationRoot,
                expectedUserId,
                "published destination after durable lease removal",
              );
              const sourceAfterPublication = await lstatIfPresent(stageRoot);
              const leaseAfterPublication = await lstatIfPresent(leaseRoot);
              if (sourceAfterPublication !== undefined) {
                authorizationFailure(
                  "source pathname reappeared after durable publication",
                );
              }
              if (leaseAfterPublication !== undefined) {
                leaseMayRemain = true;
                authorizationFailure(
                  "lease marker reappeared after durable publication",
                );
              }
            } catch (primary) {
              return failIndeterminate("reconcile", primary);
            }

            const publicationReceipt: Readonly<FloodgateTeacherStagePublicationReceipt> =
              freezeNonThenable({
                contract: FLOODGATE_TEACHER_STAGE_PUBLICATION_CONTRACT,
                trust_boundary:
                  FLOODGATE_TEACHER_STAGE_PUBLICATION_TRUST_BOUNDARY,
                status: FLOODGATE_TEACHER_STAGE_PUBLICATION_STATUS,
                claim_boundary:
                  FLOODGATE_TEACHER_STAGE_PUBLICATION_CLAIM_BOUNDARY,
                execution_boundary: publicationDependencies.executionBoundary,
                publication_durability:
                  "published-and-lease-removal-durable" as const,
                parent_identity: parent.identity,
                destination_identity: destination.identity,
                lease_identity: (lease as Readonly<OpenedDirectory>).identity,
                stage_basename: options.stageBasename,
                destination_basename: options.destinationBasename,
              });
            const cleanupFailures = await closePublicationHandles();
            if (cleanupFailures.length > 0) {
              return failIndeterminate(
                "cleanup",
                cleanupFailures[0],
                cleanupFailures,
              );
            }
            releaseLeaseNamespaceGuard(namespaceGuard);
            phase = "committed";
            ownership = "closed";
            return publicationReceipt;
          };

          const commit = (): Promise<
            Readonly<FloodgateTeacherStagePublicationReceipt>
          > => {
            if (selected === "commit") {
              return commitPromise as Promise<
                Readonly<FloodgateTeacherStagePublicationReceipt>
              >;
            }
            if (selected === "abort") {
              return NativePromise.reject(
                new FloodgateTeacherStagePublicationOwnershipTransferredError(
                  "abort already owns this transaction",
                ),
              );
            }
            selected = "commit";
            phase = "commit-started";
            commitPromise = performPublicationCommit();
            return commitPromise;
          };

          const abort = (): Promise<void> => {
            if (selected === "abort") return abortPromise as Promise<void>;
            if (selected === "commit") {
              return NativePromise.reject(
                new FloodgateTeacherStagePublicationOwnershipTransferredError(
                  "commit already owns this transaction",
                ),
              );
            }
            selected = "abort";
            phase = "abort-started";
            abortPromise = performLeaseClose().then(
              () => {
                ownership = "closed";
                phase = "aborted";
              },
              (error: unknown) => {
                ownership = "closed";
                phase = "indeterminate";
                throw error;
              },
            );
            return abortPromise;
          };

          const transaction = objectCreate(null) as {
            readonly phase: FloodgateTeacherStagePublicationPhase;
            readonly authorizationReceipt: Readonly<FloodgateTeacherStageAuthorizationReceipt>;
            readonly stageRoot: string;
            readonly destinationRoot: string;
            commit: typeof commit;
            abort: typeof abort;
          };
          Object.defineProperty(transaction, "phase", {
            configurable: false,
            enumerable: true,
            get: () => phase,
          });
          Object.defineProperty(transaction, "authorizationReceipt", {
            configurable: false,
            enumerable: true,
            value: receipt,
            writable: false,
          });
          Object.defineProperty(transaction, "stageRoot", {
            configurable: false,
            enumerable: true,
            value: stageRoot,
            writable: false,
          });
          Object.defineProperty(transaction, "destinationRoot", {
            configurable: false,
            enumerable: true,
            value: destinationRoot,
            writable: false,
          });
          Object.defineProperty(transaction, "commit", {
            configurable: false,
            enumerable: true,
            value: commit,
            writable: false,
          });
          Object.defineProperty(transaction, "abort", {
            configurable: false,
            enumerable: true,
            value: abort,
            writable: false,
          });
          return objectFreeze(transaction);
        },
      });
    activateRuntimeClaim(runtimeClaims, authorizedLease, publicationController);
    return authorizedLease;
  } catch (error) {
    const cleanupFailures = mutableNullPrototypeArray<unknown>();
    let leaseMayRemain = false;
    if (leaseCreationDurabilityFailure !== undefined) {
      leaseMayRemain = true;
      try {
        if (lease !== undefined) {
          await closeOpenedDirectory("lease", lease, dependencies);
        }
      } catch (cleanupError) {
        cleanupFailures[cleanupFailures.length] = cleanupError;
      }
    } else if (leaseCreated) {
      const cleanup = await removeLeaseAfterFailure(
        namespaceGuard,
        parent,
        options.publicationParent,
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
    if (leaseMayRemain) {
      markLeaseNamespaceGuardIndeterminate(namespaceGuard);
    } else {
      releaseLeaseNamespaceGuard(namespaceGuard);
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
      inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    },
    PRODUCTION_RUNTIME_CLAIMS,
  );
}
