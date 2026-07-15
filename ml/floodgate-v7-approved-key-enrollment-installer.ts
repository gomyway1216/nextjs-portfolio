/**
 * Create-only persistence boundary for one separately reviewed Floodgate v7
 * approved-key enrollment record. The final name is committed with link(2),
 * never opened for adoption, overwritten, removed, or rotated.
 */

import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore,
  type FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
  type FloodgateV7ApprovedKeyEnrollmentInstallationInput,
} from "./floodgate-v7-approved-key-enrollment";

export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CONTRACT =
  "shogi-floodgate-v7-approved-key-enrollment-installer-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_STATUS =
  "new-approved-record-no-clobber-published-durable-and-revalidated" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CLAIM_BOUNDARY =
  "persists-one-exact-digest-bound-approved-record-without-generating-approval-adopting-overwriting-rotating-or-disclosing-path-identities-candidate-authority-runtime-training-live-or-strength-claims" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_TRUST_BOUNDARY =
  "trusted-current-euid-userinfo-home-local-posix-filesystem-approved-record-serializer-and-current-js-realm-intrinsics-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_ALGORITHM =
  "canonical-record-staged-fsync-hard-link-no-clobber-directory-fsync-reopen-revalidation-v1" as const;

export type FloodgateV7ApprovedKeyEnrollmentInstallerExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-control-plane-record-installation"
  | "test-only-injected-current-euid-home-control-plane-record-installation";

export type FloodgateV7ApprovedKeyEnrollmentInstallerFailpoint =
  | "after-managed-directory-created"
  | "after-parent-created"
  | "after-staging-create"
  | "after-write"
  | "after-file-sync"
  | "before-final-link"
  | "after-final-link"
  | "after-final-directory-sync"
  | "after-staging-unlink"
  | "after-cleanup-directory-sync"
  | "before-final-revalidation"
  | "after-descriptor-close";

export type FloodgateV7ApprovedKeyEnrollmentInstallerPhase =
  | "capture"
  | "production-identity"
  | "record-validation"
  | "namespace"
  | "staging-create"
  | "staging-write"
  | "staging-file-sync"
  | "commit"
  | "commit-directory-sync"
  | "staging-removal"
  | "cleanup-directory-sync"
  | "revalidation"
  | "cleanup";

export type FloodgateV7ApprovedKeyEnrollmentInstallerDurability =
  | "no-installation-change-established"
  | "managed-prefix-may-exist-record-absent"
  | "managed-prefix-may-exist-existing-record-not-adopted"
  | "parent-chain-durable-record-absent"
  | "staging-may-exist"
  | "staging-file-synced-final-absent"
  | "final-link-may-exist"
  | "final-link-directory-synced"
  | "record-published-and-staging-removal-durable";

export type FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition =
  | "safe-to-retry-after-not-installed"
  | "do-not-retry-existing-record"
  | "manual-reconciliation-required";

export interface FloodgateV7ApprovedKeyEnrollmentInstallerReceipt<
  TBoundary extends
    FloodgateV7ApprovedKeyEnrollmentInstallerExecutionBoundary = FloodgateV7ApprovedKeyEnrollmentInstallerExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_TRUST_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly algorithm: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_ALGORITHM;
  readonly record: Readonly<{
    readonly record_mode: "0600";
    readonly record_nlink: 1;
    readonly publication: "staged-record-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1";
    readonly durability: "record-published-and-staging-removal-durable";
    readonly held_descriptors_revalidated: true;
  }>;
  readonly approval_binding: Readonly<{
    readonly candidate_canonical_json_validated: true;
    readonly candidate_sha256_exactly_matched: true;
    readonly candidate_bytes_recomputed: true;
  }>;
  readonly test_boundary: Readonly<{
    readonly production_home_origin: boolean;
    readonly production_effective_uid_origin: boolean;
    readonly failure_hooks_may_be_test_injected: boolean;
  }>;
  readonly nonclaims: Readonly<{
    readonly approval_generated: false;
    readonly approval_id_disclosed: false;
    readonly candidate_digest_disclosed: false;
    readonly candidate_json_disclosed: false;
    readonly key_instance_id_disclosed: false;
    readonly owner_uid_disclosed: false;
    readonly filesystem_identity_disclosed: false;
    readonly record_path_disclosed: false;
    readonly capability_issued: false;
    readonly run_authorization: false;
    readonly gate_authorization: false;
    readonly checkpoint: false;
    readonly runtime: false;
    readonly training: false;
    readonly live_evaluation_activation: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7ApprovedKeyEnrollmentInstallerDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly closeFileHandleForTests?: (
    handle: fs.promises.FileHandle,
  ) => Promise<void>;
  readonly failpointForTests?: (
    phase: FloodgateV7ApprovedKeyEnrollmentInstallerFailpoint,
  ) => void;
  readonly observeFailureForTests?: (failure: unknown) => void;
}

export class FloodgateV7ApprovedKeyEnrollmentInstallerError extends Error {
  readonly phase: FloodgateV7ApprovedKeyEnrollmentInstallerPhase;
  readonly durability: FloodgateV7ApprovedKeyEnrollmentInstallerDurability;
  readonly may_have_committed: boolean;
  readonly retry_disposition: FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition;

  constructor(
    phase: FloodgateV7ApprovedKeyEnrollmentInstallerPhase,
    durability: FloodgateV7ApprovedKeyEnrollmentInstallerDurability,
    mayHaveCommitted: boolean,
    retryDisposition: FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition,
  ) {
    super(
      "Floodgate v7 approved key enrollment installation failed; inspect reconciliation metadata",
    );
    this.name = "FloodgateV7ApprovedKeyEnrollmentInstallerError";
    this.phase = phase;
    this.durability = durability;
    this.may_have_committed = mayHaveCommitted;
    this.retry_disposition = retryDisposition;
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ApprovedKeyEnrollmentInstallerError: installation failed; inspect reconciliation metadata",
    });
    objectFreeze(this);
  }
}

type CapturedDependencies = Readonly<{
  effectiveUserId: number;
  homeDirectory: string;
  closeFileHandleForTests?: (handle: fs.promises.FileHandle) => Promise<void>;
  failpointForTests?: (
    phase: FloodgateV7ApprovedKeyEnrollmentInstallerFailpoint,
  ) => void;
  observeFailureForTests?: (failure: unknown) => void;
}>;
type DirectoryModePolicy = "safe-home-anchor" | "managed-exact-0700";
type DirectoryReference = {
  readonly filePath: string;
  readonly handle: fs.promises.FileHandle;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly initialMode: bigint;
  readonly modePolicy: DirectoryModePolicy;
};
type InstallState = {
  phase: FloodgateV7ApprovedKeyEnrollmentInstallerPhase;
  directoryReferences: DirectoryReference[];
  parentReference: DirectoryReference | null;
  stagingHandle: fs.promises.FileHandle | null;
  finalReopenHandle: fs.promises.FileHandle | null;
  stagingPath: string | null;
  finalPath: string | null;
  stagingDev: bigint | null;
  stagingIno: bigint | null;
  expectedSize: bigint;
  directoryCreationAttempted: boolean;
  parentChainDurable: boolean;
  stagingFileSynced: boolean;
  linkAttempted: boolean;
  linkSucceeded: boolean;
  linkReturnedExisting: boolean;
  firstDirectorySynced: boolean;
  stagingUnlinked: boolean;
  cleanupDirectorySynced: boolean;
  finalRevalidationCompleted: boolean;
  descriptorCloseFailedAfterFinalRevalidation: boolean;
  existingFinal: boolean;
  staleStaging: boolean;
};
type Reconciliation = Readonly<{
  durability: FloodgateV7ApprovedKeyEnrollmentInstallerDurability;
  mayHaveCommitted: boolean;
  retryDisposition: FloodgateV7ApprovedKeyEnrollmentInstallerRetryDisposition;
}>;

const STAGING_BASENAME = ".approved-key-instance.json.installing-v1";
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);
const DIRECTORY_MODE = BigInt(0o700);
const HOME_FORBIDDEN_MODE = BigInt(0o7022);
const RECORD_MODE = BigInt(0o600);
const NativeError = Error;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const numberIsSafeInteger = Number.isSafeInteger;
const pathResolve = path.resolve.bind(path);
const pathSeparator = path.sep;
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const capturedTimingSafeEqual = timingSafeEqual;
const capturedBufferFrom = Buffer.from.bind(Buffer);
const capturedBufferAlloc = Buffer.alloc.bind(Buffer);
const nativeUint8ArrayFill = Uint8Array.prototype.fill;
const capturedFs = objectFreeze({
  lstat: fs.promises.lstat.bind(fs.promises),
  realpath: fs.promises.realpath.bind(fs.promises),
  mkdir: fs.promises.mkdir.bind(fs.promises),
  open: fs.promises.open.bind(fs.promises),
  link: fs.promises.link.bind(fs.promises),
  unlink: fs.promises.unlink.bind(fs.promises),
});
const DEPENDENCY_KEYS = objectFreeze([
  "effectiveUserId",
  "homeDirectory",
  "closeFileHandleForTests",
  "failpointForTests",
  "observeFailureForTests",
] as const);

function rejected<T>(error: unknown): Promise<T> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("installer records require data properties");
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: descriptor.enumerable,
      writable: false,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function isErrno(error: unknown, code: string): boolean {
  if (error === null || typeof error !== "object") return false;
  const descriptor = objectGetOwnPropertyDescriptors(error).code;
  return (
    descriptor !== undefined &&
    "value" in descriptor &&
    descriptor.value === code
  );
}

function appendFixedPathComponent(parent: string, component: string): string {
  return parent === pathSeparator
    ? `${parent}${component}`
    : `${parent}${pathSeparator}${component}`;
}

function zeroize(bytes: Uint8Array): void {
  reflectApply(nativeUint8ArrayFill, bytes, [0]);
}

function captureDependencies(
  value: FloodgateV7ApprovedKeyEnrollmentInstallerDependenciesForTests,
): CapturedDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("invalid installer dependencies");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(value)) {
    if (
      typeof key !== "string" ||
      !DEPENDENCY_KEYS.includes(key as (typeof DEPENDENCY_KEYS)[number])
    ) {
      throw new NativeError("invalid installer dependencies");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("invalid installer dependencies");
    }
  }
  const effectiveUserId = descriptors.effectiveUserId?.value;
  const homeDirectory = descriptors.homeDirectory?.value;
  if (
    typeof effectiveUserId !== "number" ||
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    homeDirectory.length === 0 ||
    homeDirectory.includes("\0") ||
    pathResolve(homeDirectory) !== homeDirectory
  ) {
    throw new NativeError("invalid installer dependencies");
  }
  for (const key of [
    "closeFileHandleForTests",
    "failpointForTests",
    "observeFailureForTests",
  ] as const) {
    const candidate = descriptors[key]?.value;
    if (
      candidate !== undefined &&
      (typeof candidate !== "function" || nodeIsProxy(candidate))
    ) {
      throw new NativeError("invalid installer dependencies");
    }
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    closeFileHandleForTests: descriptors.closeFileHandleForTests?.value as
      | ((handle: fs.promises.FileHandle) => Promise<void>)
      | undefined,
    failpointForTests: descriptors.failpointForTests?.value as
      | ((phase: FloodgateV7ApprovedKeyEnrollmentInstallerFailpoint) => void)
      | undefined,
    observeFailureForTests: descriptors.observeFailureForTests?.value as
      | ((failure: unknown) => void)
      | undefined,
  });
}

function callSynchronousHook<T>(
  hook: ((argument: T) => void) | undefined,
  argument: T,
): void {
  if (hook === undefined) return;
  const result = reflectApply(hook, undefined, [argument]);
  if (result !== undefined) {
    throw new NativeError("installer test hooks must return undefined");
  }
}

function phaseForFailpoint(
  failpoint: FloodgateV7ApprovedKeyEnrollmentInstallerFailpoint,
): FloodgateV7ApprovedKeyEnrollmentInstallerPhase {
  switch (failpoint) {
    case "after-managed-directory-created":
    case "after-parent-created":
      return "namespace";
    case "after-staging-create":
      return "staging-create";
    case "after-write":
      return "staging-write";
    case "after-file-sync":
      return "staging-file-sync";
    case "before-final-link":
    case "after-final-link":
      return "commit";
    case "after-final-directory-sync":
      return "commit-directory-sync";
    case "after-staging-unlink":
      return "staging-removal";
    case "after-cleanup-directory-sync":
      return "cleanup-directory-sync";
    case "before-final-revalidation":
      return "revalidation";
    case "after-descriptor-close":
      return "cleanup";
  }
}

function invokeFailpoint(
  state: InstallState,
  dependencies: CapturedDependencies,
  failpoint: FloodgateV7ApprovedKeyEnrollmentInstallerFailpoint,
): void {
  state.phase = phaseForFailpoint(failpoint);
  callSynchronousHook(dependencies.failpointForTests, failpoint);
}

function appendDirectoryReference(
  state: InstallState,
  reference: DirectoryReference,
): void {
  objectDefineProperty(
    state.directoryReferences,
    state.directoryReferences.length,
    {
      configurable: true,
      enumerable: true,
      writable: true,
      value: reference,
    },
  );
}

function statIsDirectory(
  stat: fs.BigIntStats,
  effectiveUserId: number,
  modePolicy: DirectoryModePolicy,
): boolean {
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    stat.uid === BigInt(effectiveUserId) &&
    (modePolicy === "safe-home-anchor"
      ? (stat.mode & DIRECTORY_MODE) === DIRECTORY_MODE &&
        (stat.mode & HOME_FORBIDDEN_MODE) === BigInt(0)
      : (stat.mode & MODE_MASK) === DIRECTORY_MODE)
  );
}

function statIsRecord(
  stat: fs.BigIntStats,
  effectiveUserId: number,
  expectedSize: bigint,
  expectedLinks: bigint,
): boolean {
  return (
    (stat.mode & TYPE_MASK) === REGULAR_TYPE &&
    (stat.mode & MODE_MASK) === RECORD_MODE &&
    stat.uid === BigInt(effectiveUserId) &&
    stat.size === expectedSize &&
    stat.nlink === expectedLinks
  );
}

function sameIdentity(
  stat: fs.BigIntStats,
  dev: bigint | null,
  ino: bigint | null,
): boolean {
  return dev !== null && ino !== null && stat.dev === dev && stat.ino === ino;
}

async function lstatMaybe(filePath: string): Promise<fs.BigIntStats | null> {
  try {
    return await capturedFs.lstat(filePath, { bigint: true });
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

async function openAndValidateDirectory(
  filePath: string,
  effectiveUserId: number,
  modePolicy: DirectoryModePolicy,
): Promise<DirectoryReference> {
  const before = await capturedFs.lstat(filePath, { bigint: true });
  if (!statIsDirectory(before, effectiveUserId, modePolicy)) {
    throw new NativeError("unsafe installer directory metadata");
  }
  if ((await capturedFs.realpath(filePath)) !== filePath) {
    throw new NativeError("non-canonical installer directory");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  const directoryOnly = fs.constants.O_DIRECTORY;
  if (noFollow === undefined || directoryOnly === undefined) {
    throw new NativeError("installer requires POSIX no-follow flags");
  }
  const handle = await capturedFs.open(
    filePath,
    fs.constants.O_RDONLY | noFollow | directoryOnly,
  );
  try {
    const held = await handle.stat({ bigint: true });
    const after = await capturedFs.lstat(filePath, { bigint: true });
    if (
      !statIsDirectory(held, effectiveUserId, modePolicy) ||
      !statIsDirectory(after, effectiveUserId, modePolicy) ||
      held.mode !== before.mode ||
      after.mode !== before.mode ||
      held.dev !== before.dev ||
      held.ino !== before.ino ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      (await capturedFs.realpath(filePath)) !== filePath
    ) {
      throw new NativeError("installer directory identity changed");
    }
    return {
      filePath,
      handle,
      dev: held.dev,
      ino: held.ino,
      initialMode: held.mode,
      modePolicy,
    };
  } catch (error) {
    try {
      await handle.close();
    } catch {
      // Public errors never expose descriptor details.
    }
    throw error;
  }
}

async function revalidateDirectory(
  reference: DirectoryReference,
  effectiveUserId: number,
): Promise<void> {
  const held = await reference.handle.stat({ bigint: true });
  const named = await capturedFs.lstat(reference.filePath, { bigint: true });
  if (
    !statIsDirectory(held, effectiveUserId, reference.modePolicy) ||
    !statIsDirectory(named, effectiveUserId, reference.modePolicy) ||
    held.mode !== reference.initialMode ||
    named.mode !== reference.initialMode ||
    held.dev !== reference.dev ||
    held.ino !== reference.ino ||
    named.dev !== reference.dev ||
    named.ino !== reference.ino ||
    (await capturedFs.realpath(reference.filePath)) !== reference.filePath
  ) {
    throw new NativeError("installer directory identity changed");
  }
}

async function revalidateAllDirectories(
  state: InstallState,
  effectiveUserId: number,
): Promise<void> {
  for (let index = 0; index < state.directoryReferences.length; index += 1) {
    const reference = state.directoryReferences[index];
    if (reference === undefined) {
      throw new NativeError("installer directory reference is unavailable");
    }
    await revalidateDirectory(reference, effectiveUserId);
  }
}

async function assertTestBoundaryIsNotProductionHome(
  dependencies: CapturedDependencies,
): Promise<void> {
  if (getEffectiveUserId === null) {
    throw new NativeError("test installer requires a POSIX euid");
  }
  const currentEffectiveUserId = getEffectiveUserId();
  const userInfo = getUserInfo();
  const descriptors = objectGetOwnPropertyDescriptors(userInfo);
  const productionHome = descriptors.homedir?.value;
  if (
    dependencies.effectiveUserId !== currentEffectiveUserId ||
    descriptors.uid === undefined ||
    !("value" in descriptors.uid) ||
    descriptors.uid.value !== currentEffectiveUserId ||
    typeof productionHome !== "string" ||
    dependencies.homeDirectory === productionHome
  ) {
    throw new NativeError("test installer identity is not isolated");
  }
  const injectedRealpath = await capturedFs.realpath(
    dependencies.homeDirectory,
  );
  const productionRealpath = await capturedFs.realpath(productionHome);
  const injected = await capturedFs.lstat(injectedRealpath, { bigint: true });
  const production = await capturedFs.lstat(productionRealpath, {
    bigint: true,
  });
  if (
    injectedRealpath === productionRealpath ||
    (injected.dev === production.dev && injected.ino === production.ino)
  ) {
    throw new NativeError("test installer home aliases production home");
  }
}

function initialState(expectedSize: bigint): InstallState {
  return {
    phase: "namespace",
    directoryReferences: [],
    parentReference: null,
    stagingHandle: null,
    finalReopenHandle: null,
    stagingPath: null,
    finalPath: null,
    stagingDev: null,
    stagingIno: null,
    expectedSize,
    directoryCreationAttempted: false,
    parentChainDurable: false,
    stagingFileSynced: false,
    linkAttempted: false,
    linkSucceeded: false,
    linkReturnedExisting: false,
    firstDirectorySynced: false,
    stagingUnlinked: false,
    cleanupDirectorySynced: false,
    finalRevalidationCompleted: false,
    descriptorCloseFailedAfterFinalRevalidation: false,
    existingFinal: false,
    staleStaging: false,
  };
}

async function inspectExistingChain(
  dependencies: CapturedDependencies,
  state: InstallState,
): Promise<number> {
  state.phase = "namespace";
  if (
    (await capturedFs.realpath(dependencies.homeDirectory)) !==
    dependencies.homeDirectory
  ) {
    throw new NativeError("installer home is not canonical");
  }
  appendDirectoryReference(
    state,
    await openAndValidateDirectory(
      dependencies.homeDirectory,
      dependencies.effectiveUserId,
      "safe-home-anchor",
    ),
  );
  let currentPath = dependencies.homeDirectory;
  for (
    let index = 0;
    index <
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length;
    index += 1
  ) {
    currentPath = appendFixedPathComponent(
      currentPath,
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS[index],
    );
    if ((await lstatMaybe(currentPath)) === null) return index;
    appendDirectoryReference(
      state,
      await openAndValidateDirectory(
        currentPath,
        dependencies.effectiveUserId,
        "managed-exact-0700",
      ),
    );
  }
  state.parentReference =
    state.directoryReferences[state.directoryReferences.length - 1] ?? null;
  return FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length;
}

async function createMissingDirectories(
  dependencies: CapturedDependencies,
  state: InstallState,
  firstMissingIndex: number,
): Promise<void> {
  let currentPath =
    state.directoryReferences[state.directoryReferences.length - 1]?.filePath ??
    dependencies.homeDirectory;
  for (
    let index = firstMissingIndex;
    index <
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length;
    index += 1
  ) {
    const parent =
      state.directoryReferences[state.directoryReferences.length - 1];
    if (parent === undefined) {
      throw new NativeError("installer parent descriptor is unavailable");
    }
    await revalidateDirectory(parent, dependencies.effectiveUserId);
    currentPath = appendFixedPathComponent(
      currentPath,
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS[index],
    );
    state.directoryCreationAttempted = true;
    try {
      await capturedFs.mkdir(currentPath, { mode: 0o700 });
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
    }
    const child = await openAndValidateDirectory(
      currentPath,
      dependencies.effectiveUserId,
      "managed-exact-0700",
    );
    appendDirectoryReference(state, child);
    await revalidateDirectory(parent, dependencies.effectiveUserId);
    await child.handle.sync();
    await parent.handle.sync();
    invokeFailpoint(state, dependencies, "after-managed-directory-created");
  }
  state.parentReference =
    state.directoryReferences[state.directoryReferences.length - 1] ?? null;
  if (state.parentReference === null) {
    throw new NativeError("installer parent descriptor is unavailable");
  }
}

async function prepareNamespace(
  dependencies: CapturedDependencies,
  state: InstallState,
): Promise<void> {
  const firstMissing = await inspectExistingChain(dependencies, state);
  if (
    firstMissing <
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length
  ) {
    await createMissingDirectories(dependencies, state, firstMissing);
  }
  state.parentReference ??=
    state.directoryReferences[state.directoryReferences.length - 1] ?? null;
  if (state.parentReference === null) {
    throw new NativeError("installer parent descriptor is unavailable");
  }
  state.finalPath = appendFixedPathComponent(
    state.parentReference.filePath,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  );
  state.stagingPath = appendFixedPathComponent(
    state.parentReference.filePath,
    STAGING_BASENAME,
  );
  await revalidateAllDirectories(state, dependencies.effectiveUserId);
  const final = await lstatMaybe(state.finalPath);
  if (final !== null) {
    state.existingFinal = true;
    throw new NativeError("approved enrollment record already exists");
  }
  const staging = await lstatMaybe(state.stagingPath);
  if (staging !== null) {
    state.staleStaging = true;
    throw new NativeError("approved enrollment staging already exists");
  }
  await state.parentReference.handle.sync();
  state.parentChainDurable = true;
  invokeFailpoint(state, dependencies, "after-parent-created");
}

async function writeAll(
  handle: fs.promises.FileHandle,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.byteLength - offset,
      offset,
    );
    if (bytesWritten <= 0) {
      throw new NativeError("installer staging write made no progress");
    }
    offset += bytesWritten;
  }
}

async function readAll(
  handle: fs.promises.FileHandle,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesRead } = await handle.read(
      bytes,
      offset,
      bytes.byteLength - offset,
      offset,
    );
    if (bytesRead <= 0) {
      throw new NativeError("installer record read made no progress");
    }
    offset += bytesRead;
  }
}

async function assertStagingIdentity(
  state: InstallState,
  effectiveUserId: number,
  expectedLinks: bigint,
): Promise<fs.BigIntStats> {
  if (
    state.stagingHandle === null ||
    state.stagingPath === null ||
    state.stagingDev === null ||
    state.stagingIno === null
  ) {
    throw new NativeError("installer staging descriptor is unavailable");
  }
  const held = await state.stagingHandle.stat({ bigint: true });
  const named = await capturedFs.lstat(state.stagingPath, { bigint: true });
  if (
    !statIsRecord(held, effectiveUserId, state.expectedSize, expectedLinks) ||
    !statIsRecord(named, effectiveUserId, state.expectedSize, expectedLinks) ||
    !sameIdentity(held, state.stagingDev, state.stagingIno) ||
    !sameIdentity(named, state.stagingDev, state.stagingIno) ||
    (await capturedFs.realpath(state.stagingPath)) !== state.stagingPath
  ) {
    throw new NativeError("installer staging identity changed");
  }
  return held;
}

async function assertFinalIdentity(
  state: InstallState,
  effectiveUserId: number,
  expectedLinks: bigint,
): Promise<fs.BigIntStats> {
  if (
    state.finalPath === null ||
    state.stagingDev === null ||
    state.stagingIno === null
  ) {
    throw new NativeError("installer final identity is unavailable");
  }
  const named = await capturedFs.lstat(state.finalPath, { bigint: true });
  if (
    !statIsRecord(named, effectiveUserId, state.expectedSize, expectedLinks) ||
    !sameIdentity(named, state.stagingDev, state.stagingIno) ||
    (await capturedFs.realpath(state.finalPath)) !== state.finalPath
  ) {
    throw new NativeError("installer final identity changed");
  }
  return named;
}

async function createAndPublishRecord(
  dependencies: CapturedDependencies,
  state: InstallState,
  recordBytes: Uint8Array,
): Promise<fs.BigIntStats> {
  if (
    state.parentReference === null ||
    state.stagingPath === null ||
    state.finalPath === null
  ) {
    throw new NativeError("installer namespace is unavailable");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  if (noFollow === undefined) {
    throw new NativeError("installer requires O_NOFOLLOW");
  }
  await revalidateAllDirectories(state, dependencies.effectiveUserId);
  state.phase = "staging-create";
  try {
    state.stagingHandle = await capturedFs.open(
      state.stagingPath,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_RDWR |
        noFollow,
      0o600,
    );
  } catch (error) {
    if (isErrno(error, "EEXIST")) state.staleStaging = true;
    throw error;
  }
  await state.stagingHandle.chmod(0o600);
  const created = await state.stagingHandle.stat({ bigint: true });
  state.stagingDev = created.dev;
  state.stagingIno = created.ino;
  if (
    !statIsRecord(created, dependencies.effectiveUserId, BigInt(0), BigInt(1))
  ) {
    throw new NativeError("installer staging metadata is unsafe");
  }
  const namedCreated = await capturedFs.lstat(state.stagingPath, {
    bigint: true,
  });
  if (
    !statIsRecord(
      namedCreated,
      dependencies.effectiveUserId,
      BigInt(0),
      BigInt(1),
    ) ||
    !sameIdentity(namedCreated, state.stagingDev, state.stagingIno) ||
    (await capturedFs.realpath(state.stagingPath)) !== state.stagingPath
  ) {
    throw new NativeError("installer staging name changed");
  }
  invokeFailpoint(state, dependencies, "after-staging-create");

  state.phase = "staging-write";
  await writeAll(state.stagingHandle, recordBytes);
  await assertStagingIdentity(state, dependencies.effectiveUserId, BigInt(1));
  invokeFailpoint(state, dependencies, "after-write");

  state.phase = "staging-file-sync";
  await state.stagingHandle.sync();
  state.stagingFileSynced = true;
  await assertStagingIdentity(state, dependencies.effectiveUserId, BigInt(1));
  const verification = capturedBufferAlloc(recordBytes.byteLength);
  try {
    await readAll(state.stagingHandle, verification);
    if (!capturedTimingSafeEqual(recordBytes, verification)) {
      throw new NativeError("installer staging readback mismatch");
    }
  } finally {
    zeroize(verification);
  }
  invokeFailpoint(state, dependencies, "after-file-sync");

  state.phase = "commit";
  await revalidateAllDirectories(state, dependencies.effectiveUserId);
  if ((await lstatMaybe(state.finalPath)) !== null) {
    state.existingFinal = true;
    throw new NativeError("approved enrollment record appeared");
  }
  invokeFailpoint(state, dependencies, "before-final-link");
  await revalidateAllDirectories(state, dependencies.effectiveUserId);
  await assertStagingIdentity(state, dependencies.effectiveUserId, BigInt(1));
  if ((await lstatMaybe(state.finalPath)) !== null) {
    state.existingFinal = true;
    throw new NativeError("approved enrollment record appeared");
  }
  state.linkAttempted = true;
  try {
    await capturedFs.link(state.stagingPath, state.finalPath);
    state.linkSucceeded = true;
  } catch (error) {
    if (isErrno(error, "EEXIST")) {
      state.linkReturnedExisting = true;
      state.existingFinal = true;
    }
    throw error;
  }
  await assertStagingIdentity(state, dependencies.effectiveUserId, BigInt(2));
  await assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(2));
  invokeFailpoint(state, dependencies, "after-final-link");

  state.phase = "commit-directory-sync";
  await state.parentReference.handle.sync();
  state.firstDirectorySynced = true;
  await revalidateDirectory(
    state.parentReference,
    dependencies.effectiveUserId,
  );
  invokeFailpoint(state, dependencies, "after-final-directory-sync");

  state.phase = "staging-removal";
  await revalidateAllDirectories(state, dependencies.effectiveUserId);
  await assertStagingIdentity(state, dependencies.effectiveUserId, BigInt(2));
  await assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(2));
  await capturedFs.unlink(state.stagingPath);
  state.stagingUnlinked = true;
  invokeFailpoint(state, dependencies, "after-staging-unlink");
  const heldAfterUnlink = await state.stagingHandle.stat({ bigint: true });
  if (
    !statIsRecord(
      heldAfterUnlink,
      dependencies.effectiveUserId,
      state.expectedSize,
      BigInt(1),
    ) ||
    !sameIdentity(heldAfterUnlink, state.stagingDev, state.stagingIno) ||
    (await lstatMaybe(state.stagingPath)) !== null
  ) {
    throw new NativeError("installer staging removal changed identity");
  }
  await assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(1));

  state.phase = "cleanup-directory-sync";
  await state.parentReference.handle.sync();
  state.cleanupDirectorySynced = true;
  invokeFailpoint(state, dependencies, "after-cleanup-directory-sync");

  state.phase = "revalidation";
  invokeFailpoint(state, dependencies, "before-final-revalidation");
  await revalidateAllDirectories(state, dependencies.effectiveUserId);
  await assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(1));
  if ((await lstatMaybe(state.stagingPath)) !== null) {
    throw new NativeError("installer staging name survived cleanup");
  }
  await state.stagingHandle.close();
  state.stagingHandle = null;
  state.finalReopenHandle = await capturedFs.open(
    state.finalPath,
    fs.constants.O_RDONLY | noFollow,
  );
  const reopened = await state.finalReopenHandle.stat({ bigint: true });
  if (
    !statIsRecord(
      reopened,
      dependencies.effectiveUserId,
      state.expectedSize,
      BigInt(1),
    ) ||
    !sameIdentity(reopened, state.stagingDev, state.stagingIno)
  ) {
    throw new NativeError("installer final reopen changed identity");
  }
  const reopenedBytes = capturedBufferAlloc(recordBytes.byteLength);
  try {
    await readAll(state.finalReopenHandle, reopenedBytes);
    if (!capturedTimingSafeEqual(recordBytes, reopenedBytes)) {
      throw new NativeError("installer final reopen readback mismatch");
    }
  } finally {
    zeroize(reopenedBytes);
  }
  await revalidateAllDirectories(state, dependencies.effectiveUserId);
  const final = await assertFinalIdentity(
    state,
    dependencies.effectiveUserId,
    BigInt(1),
  );
  const reopenedLast = await state.finalReopenHandle.stat({ bigint: true });
  if (
    !sameIdentity(reopenedLast, state.stagingDev, state.stagingIno) ||
    !statIsRecord(
      reopenedLast,
      dependencies.effectiveUserId,
      state.expectedSize,
      BigInt(1),
    )
  ) {
    throw new NativeError("installer final descriptor changed at receipt");
  }
  state.finalRevalidationCompleted = true;
  return final;
}

async function safeClose(
  handle: fs.promises.FileHandle | null,
  dependencies: CapturedDependencies,
): Promise<boolean> {
  if (handle === null) return true;
  try {
    if (dependencies.closeFileHandleForTests === undefined) {
      await handle.close();
    } else {
      await reflectApply(dependencies.closeFileHandleForTests, undefined, [
        handle,
      ]);
    }
    return true;
  } catch {
    return false;
  }
}

async function closeAll(
  state: InstallState,
  dependencies: CapturedDependencies,
): Promise<boolean> {
  let allClosed = await safeClose(state.finalReopenHandle, dependencies);
  state.finalReopenHandle = null;
  if (!(await safeClose(state.stagingHandle, dependencies))) allClosed = false;
  state.stagingHandle = null;
  for (
    let index = state.directoryReferences.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (
      !(await safeClose(
        state.directoryReferences[index]?.handle ?? null,
        dependencies,
      ))
    ) {
      allClosed = false;
    }
  }
  state.directoryReferences.length = 0;
  state.parentReference = null;
  return allClosed;
}

async function namedState(
  filePath: string | null,
): Promise<fs.BigIntStats | null | "unknown"> {
  if (filePath === null) return null;
  try {
    return await lstatMaybe(filePath);
  } catch {
    return "unknown";
  }
}

async function reconcileFailure(
  dependencies: CapturedDependencies,
  state: InstallState,
): Promise<Reconciliation> {
  // cleanupDirectorySynced can be true before final authoritative
  // revalidation. Preserve the strong classification only for a close error
  // observed after that revalidation completed successfully.
  if (state.descriptorCloseFailedAfterFinalRevalidation) {
    return frozenRecord({
      durability: "record-published-and-staging-removal-durable" as const,
      mayHaveCommitted: true,
      retryDisposition: "do-not-retry-existing-record" as const,
    });
  }
  if (state.existingFinal && !state.linkSucceeded) {
    if (
      state.stagingHandle !== null &&
      state.stagingPath !== null &&
      state.parentReference !== null
    ) {
      try {
        await revalidateDirectory(
          state.parentReference,
          dependencies.effectiveUserId,
        );
        const held = await state.stagingHandle.stat({ bigint: true });
        const named = await namedState(state.stagingPath);
        if (
          named !== null &&
          named !== "unknown" &&
          sameIdentity(held, state.stagingDev, state.stagingIno) &&
          sameIdentity(named, state.stagingDev, state.stagingIno) &&
          statIsRecord(
            held,
            dependencies.effectiveUserId,
            held.size,
            BigInt(1),
          ) &&
          statIsRecord(
            named,
            dependencies.effectiveUserId,
            held.size,
            BigInt(1),
          )
        ) {
          await capturedFs.unlink(state.stagingPath);
          state.stagingUnlinked = true;
          await state.parentReference.handle.sync();
        } else {
          throw new NativeError(
            "installer existing-record staging reconciliation is ambiguous",
          );
        }
      } catch {
        return frozenRecord({
          durability: "staging-may-exist" as const,
          mayHaveCommitted: false,
          retryDisposition: "manual-reconciliation-required" as const,
        });
      }
    }
    return frozenRecord({
      durability: state.directoryCreationAttempted
        ? ("managed-prefix-may-exist-existing-record-not-adopted" as const)
        : ("no-installation-change-established" as const),
      mayHaveCommitted: false,
      retryDisposition: "do-not-retry-existing-record" as const,
    });
  }
  if (state.staleStaging) {
    return frozenRecord({
      durability: "staging-may-exist" as const,
      mayHaveCommitted: false,
      retryDisposition: "manual-reconciliation-required" as const,
    });
  }
  if (
    state.linkSucceeded ||
    (state.linkAttempted && !state.linkReturnedExisting)
  ) {
    try {
      if (
        state.parentReference !== null &&
        state.finalPath !== null &&
        state.stagingPath !== null
      ) {
        await revalidateDirectory(
          state.parentReference,
          dependencies.effectiveUserId,
        );
        const final = await namedState(state.finalPath);
        const staged = await namedState(state.stagingPath);
        const expectedLinks = staged === null ? BigInt(1) : BigInt(2);
        const stagedIsOurs =
          staged !== null &&
          staged !== "unknown" &&
          sameIdentity(staged, state.stagingDev, state.stagingIno) &&
          statIsRecord(
            staged,
            dependencies.effectiveUserId,
            state.expectedSize,
            expectedLinks,
          );
        const finalIsOurs =
          final !== null &&
          final !== "unknown" &&
          sameIdentity(final, state.stagingDev, state.stagingIno) &&
          statIsRecord(
            final,
            dependencies.effectiveUserId,
            state.expectedSize,
            expectedLinks,
          );
        const held =
          state.stagingHandle === null
            ? null
            : await state.stagingHandle.stat({ bigint: true });
        const heldIsOurs =
          held === null ||
          (sameIdentity(held, state.stagingDev, state.stagingIno) &&
            statIsRecord(
              held,
              dependencies.effectiveUserId,
              state.expectedSize,
              expectedLinks,
            ));
        if (
          finalIsOurs &&
          staged !== "unknown" &&
          (staged === null || stagedIsOurs) &&
          heldIsOurs
        ) {
          await state.parentReference.handle.sync();
          state.firstDirectorySynced = true;
          if (stagedIsOurs) {
            await capturedFs.unlink(state.stagingPath);
            state.stagingUnlinked = true;
          }
          await state.parentReference.handle.sync();
          state.cleanupDirectorySynced = true;
          if ((await lstatMaybe(state.stagingPath)) !== null) {
            throw new NativeError(
              "installer reconciliation staging name survived",
            );
          }
          await assertFinalIdentity(
            state,
            dependencies.effectiveUserId,
            BigInt(1),
          );
          return frozenRecord({
            durability: "record-published-and-staging-removal-durable" as const,
            mayHaveCommitted: true,
            retryDisposition: "manual-reconciliation-required" as const,
          });
        }
      }
    } catch {
      // Ambiguous post-commit state is never modified further.
    }
    return frozenRecord({
      durability: state.firstDirectorySynced
        ? ("final-link-directory-synced" as const)
        : ("final-link-may-exist" as const),
      mayHaveCommitted: true,
      retryDisposition: "manual-reconciliation-required" as const,
    });
  }
  if (
    state.stagingHandle !== null &&
    state.stagingPath !== null &&
    state.parentReference !== null
  ) {
    try {
      await revalidateDirectory(
        state.parentReference,
        dependencies.effectiveUserId,
      );
      const held = await state.stagingHandle.stat({ bigint: true });
      const staged = await namedState(state.stagingPath);
      const final = await namedState(state.finalPath);
      if (
        final === null &&
        staged !== null &&
        staged !== "unknown" &&
        sameIdentity(held, state.stagingDev, state.stagingIno) &&
        sameIdentity(staged, state.stagingDev, state.stagingIno) &&
        statIsRecord(
          held,
          dependencies.effectiveUserId,
          held.size,
          BigInt(1),
        ) &&
        statIsRecord(staged, dependencies.effectiveUserId, held.size, BigInt(1))
      ) {
        await capturedFs.unlink(state.stagingPath);
        state.stagingUnlinked = true;
        await state.parentReference.handle.sync();
        return frozenRecord({
          durability: "parent-chain-durable-record-absent" as const,
          mayHaveCommitted: false,
          retryDisposition: "safe-to-retry-after-not-installed" as const,
        });
      }
    } catch {
      // Leave an identity-ambiguous staging name untouched.
    }
    return frozenRecord({
      durability: state.stagingFileSynced
        ? ("staging-file-synced-final-absent" as const)
        : ("staging-may-exist" as const),
      mayHaveCommitted: false,
      retryDisposition: "manual-reconciliation-required" as const,
    });
  }
  return frozenRecord({
    durability: state.parentChainDurable
      ? ("parent-chain-durable-record-absent" as const)
      : state.directoryCreationAttempted
        ? ("managed-prefix-may-exist-record-absent" as const)
        : ("no-installation-change-established" as const),
    mayHaveCommitted: false,
    retryDisposition: state.parentChainDurable
      ? ("safe-to-retry-after-not-installed" as const)
      : ("manual-reconciliation-required" as const),
  });
}

function buildReceipt<
  TBoundary extends FloodgateV7ApprovedKeyEnrollmentInstallerExecutionBoundary,
>(
  boundary: TBoundary,
): Readonly<FloodgateV7ApprovedKeyEnrollmentInstallerReceipt<TBoundary>> {
  const production =
    boundary ===
    "production-fixed-current-euid-userinfo-home-control-plane-record-installation";
  return frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_STATUS,
    claim_boundary:
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_TRUST_BOUNDARY,
    execution_boundary: boundary,
    algorithm: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_ALGORITHM,
    record: frozenRecord({
      record_mode: "0600" as const,
      record_nlink: 1 as const,
      publication:
        "staged-record-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1" as const,
      durability: "record-published-and-staging-removal-durable" as const,
      held_descriptors_revalidated: true as const,
    }),
    approval_binding: frozenRecord({
      candidate_canonical_json_validated: true as const,
      candidate_sha256_exactly_matched: true as const,
      candidate_bytes_recomputed: true as const,
    }),
    test_boundary: frozenRecord({
      production_home_origin: production,
      production_effective_uid_origin: production,
      failure_hooks_may_be_test_injected: !production,
    }),
    nonclaims: frozenRecord({
      approval_generated: false as const,
      approval_id_disclosed: false as const,
      candidate_digest_disclosed: false as const,
      candidate_json_disclosed: false as const,
      key_instance_id_disclosed: false as const,
      owner_uid_disclosed: false as const,
      filesystem_identity_disclosed: false as const,
      record_path_disclosed: false as const,
      capability_issued: false as const,
      run_authorization: false as const,
      gate_authorization: false as const,
      checkpoint: false as const,
      runtime: false as const,
      training: false as const,
      live_evaluation_activation: false as const,
      playing_strength: false as const,
    }),
  });
}

async function install<
  TBoundary extends FloodgateV7ApprovedKeyEnrollmentInstallerExecutionBoundary,
>(
  input: FloodgateV7ApprovedKeyEnrollmentInstallationInput,
  dependencies: CapturedDependencies,
  boundary: TBoundary,
  recordBoundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
  requireTestIsolation: boolean,
): Promise<
  Readonly<FloodgateV7ApprovedKeyEnrollmentInstallerReceipt<TBoundary>>
> {
  let recordText: string;
  try {
    recordText =
      serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore(
        input,
        dependencies.effectiveUserId,
        recordBoundary,
      );
  } catch (rawFailure) {
    try {
      callSynchronousHook(dependencies.observeFailureForTests, rawFailure);
    } catch {
      // The observer cannot widen the public error boundary.
    }
    throw new FloodgateV7ApprovedKeyEnrollmentInstallerError(
      "record-validation",
      "no-installation-change-established",
      false,
      "manual-reconciliation-required",
    );
  }
  if (requireTestIsolation) {
    try {
      await assertTestBoundaryIsNotProductionHome(dependencies);
    } catch (rawFailure) {
      try {
        callSynchronousHook(dependencies.observeFailureForTests, rawFailure);
      } catch {
        // The observer cannot widen the public error boundary.
      }
      throw new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "production-identity",
        "no-installation-change-established",
        false,
        "manual-reconciliation-required",
      );
    }
  }
  const recordBytes = capturedBufferFrom(recordText, "utf8");
  const state = initialState(BigInt(recordBytes.byteLength));
  try {
    await prepareNamespace(dependencies, state);
    await createAndPublishRecord(dependencies, state, recordBytes);
    zeroize(recordBytes);
    if (!(await closeAll(state, dependencies))) {
      state.descriptorCloseFailedAfterFinalRevalidation =
        state.finalRevalidationCompleted;
      state.phase = "cleanup";
      throw new NativeError("installer descriptor cleanup failed");
    }
    invokeFailpoint(state, dependencies, "after-descriptor-close");
    return buildReceipt(boundary);
  } catch (rawFailure) {
    zeroize(recordBytes);
    try {
      callSynchronousHook(dependencies.observeFailureForTests, rawFailure);
    } catch {
      // The observer cannot widen the public error boundary.
    }
    let reconciliation: Reconciliation;
    try {
      reconciliation = await reconcileFailure(dependencies, state);
    } catch {
      reconciliation = frozenRecord({
        durability: "final-link-may-exist" as const,
        mayHaveCommitted: state.linkAttempted,
        retryDisposition: "manual-reconciliation-required" as const,
      });
    }
    if (!(await closeAll(state, dependencies))) {
      reconciliation = frozenRecord({
        durability: reconciliation.durability,
        mayHaveCommitted: reconciliation.mayHaveCommitted,
        retryDisposition: "manual-reconciliation-required" as const,
      });
    }
    throw new FloodgateV7ApprovedKeyEnrollmentInstallerError(
      state.phase,
      reconciliation.durability,
      reconciliation.mayHaveCommitted,
      reconciliation.retryDisposition,
    );
  }
}

/** Test-only injected-home installer. It cannot target the production home. */
export function installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
  input: FloodgateV7ApprovedKeyEnrollmentInstallationInput,
  dependenciesValue: FloodgateV7ApprovedKeyEnrollmentInstallerDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7ApprovedKeyEnrollmentInstallerReceipt<"test-only-injected-current-euid-home-control-plane-record-installation">
  >
> {
  if (arguments.length !== 2) {
    return rejected(
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "capture",
        "no-installation-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "capture",
        "no-installation-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  return install(
    input,
    dependencies,
    "test-only-injected-current-euid-home-control-plane-record-installation",
    "test-only-injected-current-euid-home-control-plane-record",
    true,
  );
}

/** Fixed production installer. Calling it may create the real approved record. */
export function installFloodgateV7ApprovedKeyEnrollment(
  input: FloodgateV7ApprovedKeyEnrollmentInstallationInput,
): Promise<
  Readonly<
    FloodgateV7ApprovedKeyEnrollmentInstallerReceipt<"production-fixed-current-euid-userinfo-home-control-plane-record-installation">
  >
> {
  if (arguments.length !== 1 || getEffectiveUserId === null) {
    return rejected(
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "capture",
        "no-installation-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    const effectiveUserId = getEffectiveUserId();
    const userInfo = getUserInfo();
    const descriptors = objectGetOwnPropertyDescriptors(userInfo);
    if (
      descriptors.uid === undefined ||
      !("value" in descriptors.uid) ||
      descriptors.uid.value !== effectiveUserId ||
      descriptors.homedir === undefined ||
      !("value" in descriptors.homedir) ||
      typeof descriptors.homedir.value !== "string"
    ) {
      throw new NativeError("production installer identity differs");
    }
    dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: descriptors.homedir.value,
    });
  } catch {
    return rejected(
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "production-identity",
        "no-installation-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  return install(
    input,
    dependencies,
    "production-fixed-current-euid-userinfo-home-control-plane-record-installation",
    "production-fixed-current-euid-userinfo-home-control-plane-record",
    false,
  );
}
