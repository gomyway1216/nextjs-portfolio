/**
 * Creates the fixed per-user Floodgate v7 deployment key exactly once.
 *
 * The key is first written to a private, fsynced staging inode and is then
 * published with link(2). The hard link is the no-clobber commit point: an
 * existing final name is never opened, adopted, removed, or replaced.
 */

import { randomFillSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-v7-deployment-key-authority";

export const FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CONTRACT =
  "shogi-floodgate-v7-deployment-key-provisioner-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_STATUS =
  "new-csprng-key-no-clobber-published-durable-and-revalidated" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CLAIM_BOUNDARY =
  "creates-one-new-fixed-current-euid-private-key-without-existing-key-adoption-overwrite-rotation-key-material-fingerprint-path-authority-checkpoint-runtime-training-live-or-strength-claims" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_TRUST_BOUNDARY =
  "trusted-current-euid-userinfo-home-local-posix-filesystem-node-crypto-and-current-js-realm-intrinsics-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_ALGORITHM =
  "node-crypto-random-bytes-32-staged-fsync-hard-link-no-clobber-directory-fsync-v1" as const;

export type FloodgateV7DeploymentKeyProvisionerExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-key-provisioning"
  | "test-only-injected-current-euid-home-key-provisioning";

export type FloodgateV7DeploymentKeyProvisionerFailpoint =
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

export type FloodgateV7DeploymentKeyProvisionerPhase =
  | "capture"
  | "production-identity"
  | "namespace"
  | "entropy"
  | "staging-create"
  | "staging-write"
  | "staging-file-sync"
  | "commit"
  | "commit-directory-sync"
  | "staging-removal"
  | "cleanup-directory-sync"
  | "revalidation"
  | "cleanup";

export type FloodgateV7DeploymentKeyProvisionerDurability =
  | "no-deployment-change-established"
  | "parent-chain-durable-key-absent"
  | "staging-may-exist"
  | "staging-file-synced-final-absent"
  | "final-link-may-exist"
  | "final-link-directory-synced"
  | "key-published-and-staging-removal-durable";

export type FloodgateV7DeploymentKeyProvisionerRetryDisposition =
  | "safe-to-retry-after-readiness-not-provisioned"
  | "do-not-retry-existing-key"
  | "manual-reconciliation-required";

export interface FloodgateV7DeploymentKeyProvisionerReceipt<
  TBoundary extends FloodgateV7DeploymentKeyProvisionerExecutionBoundary =
    FloodgateV7DeploymentKeyProvisionerExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_TRUST_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly algorithm: typeof FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_ALGORITHM;
  readonly key_deployment: Readonly<{
    readonly layout: "fixed-current-euid-userinfo-home-v1";
    readonly owner_uid: number;
    readonly parent_mode: "0700";
    readonly key_mode: "0600";
    readonly key_bytes: typeof FLOODGATE_V7_DEPLOYMENT_KEY_BYTES;
    readonly key_nlink: 1;
    readonly publication: "staged-file-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1";
    readonly durability: "key-published-and-staging-removal-durable";
    readonly parent_identity: Readonly<{
      readonly dev: string;
      readonly ino: string;
    }>;
    readonly key_identity: Readonly<{
      readonly dev: string;
      readonly ino: string;
    }>;
    readonly held_descriptors_revalidated: true;
  }>;
  readonly test_boundary: Readonly<{
    readonly production_home_origin: boolean;
    readonly production_effective_uid_origin: boolean;
    readonly entropy_may_be_test_injected: boolean;
    readonly test_hooks_may_observe_key_copy: boolean;
  }>;
  readonly nonclaims: Readonly<{
    readonly key_material_disclosed: false;
    readonly key_fingerprint_disclosed: false;
    readonly key_path_disclosed: false;
    readonly key_authority: false;
    readonly checkpoint: false;
    readonly runtime: false;
    readonly dataset_read: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7DeploymentKeyProvisionerDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly randomBytesForTests?: (bytes: number) => Uint8Array;
  readonly failpointForTests?: (
    phase: FloodgateV7DeploymentKeyProvisionerFailpoint,
  ) => void;
  readonly observeInternalKeyForTests?: (key: Uint8Array) => void;
  readonly observeFailureForTests?: (failure: unknown) => void;
}

export class FloodgateV7DeploymentKeyProvisionerError extends Error {
  readonly phase: FloodgateV7DeploymentKeyProvisionerPhase;
  readonly durability: FloodgateV7DeploymentKeyProvisionerDurability;
  readonly may_have_committed: boolean;
  readonly retry_disposition: FloodgateV7DeploymentKeyProvisionerRetryDisposition;

  constructor(
    phase: FloodgateV7DeploymentKeyProvisionerPhase,
    durability: FloodgateV7DeploymentKeyProvisionerDurability,
    mayHaveCommitted: boolean,
    retryDisposition: FloodgateV7DeploymentKeyProvisionerRetryDisposition,
  ) {
    super(
      "Floodgate v7 deployment-key provisioning failed; inspect readiness and reconciliation metadata",
    );
    this.name = "FloodgateV7DeploymentKeyProvisionerError";
    this.phase = phase;
    this.durability = durability;
    this.may_have_committed = mayHaveCommitted;
    this.retry_disposition = retryDisposition;
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7DeploymentKeyProvisionerError: provisioning failed; inspect reconciliation metadata",
    });
    objectFreeze(this);
  }
}

type CapturedDependencies = Readonly<{
  effectiveUserId: number;
  homeDirectory: string;
  randomBytesForTests?: (bytes: number) => Uint8Array;
  failpointForTests?: (
    phase: FloodgateV7DeploymentKeyProvisionerFailpoint,
  ) => void;
  observeInternalKeyForTests?: (key: Uint8Array) => void;
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

type ProvisionState = {
  phase: FloodgateV7DeploymentKeyProvisionerPhase;
  directoryReferences: DirectoryReference[];
  parentReference: DirectoryReference | null;
  stagingHandle: fs.promises.FileHandle | null;
  finalReopenHandle: fs.promises.FileHandle | null;
  stagingPath: string | null;
  finalPath: string | null;
  stagingDev: bigint | null;
  stagingIno: bigint | null;
  parentChainDurable: boolean;
  stagingCreated: boolean;
  stagingFileSynced: boolean;
  linkAttempted: boolean;
  linkSucceeded: boolean;
  linkReturnedExisting: boolean;
  firstDirectorySynced: boolean;
  stagingUnlinked: boolean;
  cleanupDirectorySynced: boolean;
  existingFinal: boolean;
  staleStaging: boolean;
};

type Reconciliation = Readonly<{
  durability: FloodgateV7DeploymentKeyProvisionerDurability;
  mayHaveCommitted: boolean;
  retryDisposition: FloodgateV7DeploymentKeyProvisionerRetryDisposition;
}>;

const STAGING_BASENAME = ".root-key.bin.provisioning-v1";
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);
const DIRECTORY_MODE = BigInt(0o700);
const HOME_FORBIDDEN_MODE = BigInt(0o7022);
const KEY_MODE = BigInt(0o600);

const NativeError = Error;
const NativePromise = Promise;
const NativeUint8Array = Uint8Array;
const nativeUint8ArrayFill = Uint8Array.prototype.fill;
const nativeUint8ArraySet = Uint8Array.prototype.set;
const arrayBufferIsView = ArrayBuffer.isView;
const numberIsSafeInteger = Number.isSafeInteger;
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
const pathResolve = path.resolve.bind(path);
const pathSeparator = path.sep;
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const capturedRandomFillSync = randomFillSync;
const capturedTimingSafeEqual = timingSafeEqual;
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
  "randomBytesForTests",
  "failpointForTests",
  "observeInternalKeyForTests",
  "observeFailureForTests",
] as const);

function rejected(error: unknown): Promise<never> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("provisioner records require data properties");
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

function appendDirectoryReference(
  state: ProvisionState,
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
    (modePolicy === "safe-home-anchor"
      ? (stat.mode & DIRECTORY_MODE) === DIRECTORY_MODE &&
        (stat.mode & HOME_FORBIDDEN_MODE) === BigInt(0)
      : (stat.mode & MODE_MASK) === DIRECTORY_MODE) &&
    stat.uid === BigInt(effectiveUserId)
  );
}

function statIsStagingFile(
  stat: fs.BigIntStats,
  effectiveUserId: number,
  expectedSize: bigint,
  expectedLinks: bigint,
): boolean {
  return (
    (stat.mode & TYPE_MASK) === REGULAR_TYPE &&
    (stat.mode & MODE_MASK) === KEY_MODE &&
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

function captureDependencies(
  value: FloodgateV7DeploymentKeyProvisionerDependenciesForTests,
): CapturedDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("invalid deployment-key provisioner dependencies");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      !DEPENDENCY_KEYS.includes(key as (typeof DEPENDENCY_KEYS)[number])
    ) {
      throw new NativeError("invalid deployment-key provisioner dependencies");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("invalid deployment-key provisioner dependencies");
    }
  }
  if (
    descriptors.effectiveUserId === undefined ||
    descriptors.homeDirectory === undefined
  ) {
    throw new NativeError("invalid deployment-key provisioner dependencies");
  }
  const effectiveUserId: unknown = descriptors.effectiveUserId.value;
  const homeDirectory: unknown = descriptors.homeDirectory.value;
  if (
    typeof effectiveUserId !== "number" ||
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    homeDirectory.length === 0 ||
    homeDirectory.includes("\0") ||
    pathResolve(homeDirectory) !== homeDirectory
  ) {
    throw new NativeError("invalid deployment-key provisioner dependencies");
  }
  const optionalFunctions = [
    "randomBytesForTests",
    "failpointForTests",
    "observeInternalKeyForTests",
    "observeFailureForTests",
  ] as const;
  for (const key of optionalFunctions) {
    const candidate = descriptors[key]?.value;
    if (
      candidate !== undefined &&
      (typeof candidate !== "function" || nodeIsProxy(candidate))
    ) {
      throw new NativeError("invalid deployment-key provisioner dependencies");
    }
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    randomBytesForTests: descriptors.randomBytesForTests?.value as
      ((bytes: number) => Uint8Array) | undefined,
    failpointForTests: descriptors.failpointForTests?.value as
      | ((phase: FloodgateV7DeploymentKeyProvisionerFailpoint) => void)
      | undefined,
    observeInternalKeyForTests: descriptors.observeInternalKeyForTests
      ?.value as ((key: Uint8Array) => void) | undefined,
    observeFailureForTests: descriptors.observeFailureForTests?.value as
      ((failure: unknown) => void) | undefined,
  });
}

function callSynchronousHook<TArgument>(
  hook: ((argument: TArgument) => void) | undefined,
  argument: TArgument,
): void {
  if (hook === undefined) return;
  const result = reflectApply(hook, undefined, [argument]);
  if (result !== undefined) {
    throw new NativeError("deployment-key test hooks must return undefined");
  }
}

function phaseForFailpoint(
  failpoint: FloodgateV7DeploymentKeyProvisionerFailpoint,
): FloodgateV7DeploymentKeyProvisionerPhase {
  switch (failpoint) {
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
  state: ProvisionState,
  dependencies: CapturedDependencies,
  failpoint: FloodgateV7DeploymentKeyProvisionerFailpoint,
): void {
  state.phase = phaseForFailpoint(failpoint);
  callSynchronousHook(dependencies.failpointForTests, failpoint);
}

function validateRandomView(value: unknown): asserts value is Uint8Array {
  if (
    typeof value !== "object" ||
    value === null ||
    nodeIsProxy(value) ||
    !arrayBufferIsView(value) ||
    objectGetPrototypeOf(value) !== NativeUint8Array.prototype ||
    (value as Uint8Array).byteLength !== FLOODGATE_V7_DEPLOYMENT_KEY_BYTES
  ) {
    throw new NativeError("deployment-key entropy must be an exact byte view");
  }
  const ownKeys = reflectOwnKeys(value);
  if (
    ownKeys.length !== FLOODGATE_V7_DEPLOYMENT_KEY_BYTES ||
    ownKeys.some((key, index) => key !== String(index))
  ) {
    throw new NativeError("deployment-key entropy byte view has extra state");
  }
}

function createSecret(dependencies: CapturedDependencies): Uint8Array {
  const secret = new NativeUint8Array(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES);
  try {
    if (dependencies.randomBytesForTests === undefined) {
      capturedRandomFillSync(secret);
    } else {
      const supplied = reflectApply(
        dependencies.randomBytesForTests,
        undefined,
        [FLOODGATE_V7_DEPLOYMENT_KEY_BYTES],
      );
      validateRandomView(supplied);
      reflectApply(nativeUint8ArraySet, secret, [supplied]);
    }
    callSynchronousHook(dependencies.observeInternalKeyForTests, secret);
    return secret;
  } catch (error) {
    // createSecret can fail before its result is assigned by the caller. Wipe
    // the allocation here so a retaining test observer never sees live bytes.
    zeroize(secret);
    throw error;
  }
}

function zeroize(view: Uint8Array | null): boolean {
  if (view === null) return true;
  try {
    reflectApply(nativeUint8ArrayFill, view, [0]);
    for (let index = 0; index < view.byteLength; index += 1) {
      if (view[index] !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function openAndValidateDirectory(
  filePath: string,
  effectiveUserId: number,
  modePolicy: DirectoryModePolicy,
): Promise<DirectoryReference> {
  const before = await capturedFs.lstat(filePath, { bigint: true });
  if (!statIsDirectory(before, effectiveUserId, modePolicy)) {
    throw new NativeError("unsafe deployment-key directory metadata");
  }
  if ((await capturedFs.realpath(filePath)) !== filePath) {
    throw new NativeError("non-canonical deployment-key directory");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  const directoryOnly = fs.constants.O_DIRECTORY;
  if (noFollow === undefined || directoryOnly === undefined) {
    throw new NativeError("deployment-key provisioning requires POSIX flags");
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
      after.mode !== held.mode ||
      held.dev !== before.dev ||
      held.ino !== before.ino ||
      after.dev !== held.dev ||
      after.ino !== held.ino ||
      (await capturedFs.realpath(filePath)) !== filePath
    ) {
      throw new NativeError("deployment-key directory identity changed");
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
      // The public boundary never exposes descriptor or path failures.
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
    throw new NativeError("deployment-key directory identity changed");
  }
}

async function inspectExistingChain(
  dependencies: CapturedDependencies,
  state: ProvisionState,
): Promise<number> {
  state.phase = "namespace";
  if (
    (await capturedFs.realpath(dependencies.homeDirectory)) !==
    dependencies.homeDirectory
  ) {
    throw new NativeError("deployment-key home is not canonical");
  }
  const home = await openAndValidateDirectory(
    dependencies.homeDirectory,
    dependencies.effectiveUserId,
    "safe-home-anchor",
  );
  appendDirectoryReference(state, home);
  let currentPath = dependencies.homeDirectory;
  for (
    let index = 0;
    index < FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
    index += 1
  ) {
    currentPath = appendFixedPathComponent(
      currentPath,
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS[index],
    );
    const named = await lstatMaybe(currentPath);
    if (named === null) return index;
    const reference = await openAndValidateDirectory(
      currentPath,
      dependencies.effectiveUserId,
      "managed-exact-0700",
    );
    appendDirectoryReference(state, reference);
  }
  state.parentReference =
    state.directoryReferences[state.directoryReferences.length - 1] ?? null;
  return FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
}

async function assertFinalNamespaceEmpty(
  state: ProvisionState,
  effectiveUserId: number,
): Promise<void> {
  if (
    state.parentReference === null ||
    state.finalPath === null ||
    state.stagingPath === null
  ) {
    throw new NativeError("deployment-key parent is unavailable");
  }
  await revalidateDirectory(state.parentReference, effectiveUserId);
  const final = await lstatMaybe(state.finalPath);
  if (final !== null) {
    state.existingFinal = true;
    throw new NativeError(
      "deployment key already exists; reconciliation required",
    );
  }
  const staging = await lstatMaybe(state.stagingPath);
  if (staging !== null) {
    state.staleStaging = true;
    throw new NativeError(
      "stale deployment-key staging requires manual reconciliation",
    );
  }
}

async function finishNamespace(
  dependencies: CapturedDependencies,
  state: ProvisionState,
  firstMissingIndex: number,
): Promise<void> {
  let currentPath =
    state.directoryReferences[state.directoryReferences.length - 1]?.filePath ??
    dependencies.homeDirectory;
  for (
    let index = firstMissingIndex;
    index < FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
    index += 1
  ) {
    const parent =
      state.directoryReferences[state.directoryReferences.length - 1];
    if (parent === undefined) {
      throw new NativeError("deployment-key parent descriptor is unavailable");
    }
    await revalidateDirectory(parent, dependencies.effectiveUserId);
    currentPath = appendFixedPathComponent(
      currentPath,
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS[index],
    );
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
    if (
      index ===
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length - 1
    ) {
      state.parentReference = child;
      state.finalPath = appendFixedPathComponent(
        child.filePath,
        FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
      );
      state.stagingPath = appendFixedPathComponent(
        child.filePath,
        STAGING_BASENAME,
      );
      await assertFinalNamespaceEmpty(state, dependencies.effectiveUserId);
      state.parentChainDurable = true;
      invokeFailpoint(state, dependencies, "after-parent-created");
    }
  }
  state.parentReference =
    state.directoryReferences[state.directoryReferences.length - 1] ?? null;
  if (state.parentReference === null) {
    throw new NativeError("deployment-key parent descriptor is unavailable");
  }
  state.finalPath = appendFixedPathComponent(
    state.parentReference.filePath,
    FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
  state.stagingPath = appendFixedPathComponent(
    state.parentReference.filePath,
    STAGING_BASENAME,
  );
  if (!state.parentChainDurable) {
    await assertFinalNamespaceEmpty(state, dependencies.effectiveUserId);
    state.parentChainDurable = true;
  }
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
      throw new NativeError("deployment-key staging write made no progress");
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
      throw new NativeError("deployment-key staging read made no progress");
    }
    offset += bytesRead;
  }
}

async function assertStagingIdentity(
  state: ProvisionState,
  effectiveUserId: number,
  expectedSize: bigint,
  expectedLinks: bigint,
): Promise<fs.BigIntStats> {
  if (
    state.stagingHandle === null ||
    state.stagingPath === null ||
    state.stagingDev === null ||
    state.stagingIno === null
  ) {
    throw new NativeError("deployment-key staging descriptor is unavailable");
  }
  const held = await state.stagingHandle.stat({ bigint: true });
  const named = await capturedFs.lstat(state.stagingPath, { bigint: true });
  if (
    !statIsStagingFile(held, effectiveUserId, expectedSize, expectedLinks) ||
    !statIsStagingFile(named, effectiveUserId, expectedSize, expectedLinks) ||
    !sameIdentity(held, state.stagingDev, state.stagingIno) ||
    !sameIdentity(named, state.stagingDev, state.stagingIno)
  ) {
    throw new NativeError("deployment-key staging identity changed");
  }
  return held;
}

async function assertFinalIdentity(
  state: ProvisionState,
  effectiveUserId: number,
  expectedLinks: bigint,
): Promise<fs.BigIntStats> {
  if (
    state.finalPath === null ||
    state.stagingDev === null ||
    state.stagingIno === null
  ) {
    throw new NativeError("deployment-key final identity is unavailable");
  }
  const named = await capturedFs.lstat(state.finalPath, { bigint: true });
  if (
    !statIsStagingFile(
      named,
      effectiveUserId,
      BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
      expectedLinks,
    ) ||
    !sameIdentity(named, state.stagingDev, state.stagingIno)
  ) {
    throw new NativeError("deployment-key final identity changed");
  }
  return named;
}

async function createAndPublishKey(
  dependencies: CapturedDependencies,
  state: ProvisionState,
  secret: Uint8Array,
  verification: Uint8Array,
): Promise<fs.BigIntStats> {
  if (
    state.parentReference === null ||
    state.stagingPath === null ||
    state.finalPath === null
  ) {
    throw new NativeError("deployment-key namespace is unavailable");
  }
  state.phase = "staging-create";
  const noFollow = fs.constants.O_NOFOLLOW;
  if (noFollow === undefined) {
    throw new NativeError("deployment-key provisioning requires O_NOFOLLOW");
  }
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
  state.stagingCreated = true;
  await state.stagingHandle.chmod(0o600);
  const empty = await state.stagingHandle.stat({ bigint: true });
  state.stagingDev = empty.dev;
  state.stagingIno = empty.ino;
  await assertStagingIdentity(
    state,
    dependencies.effectiveUserId,
    BigInt(0),
    BigInt(1),
  );
  invokeFailpoint(state, dependencies, "after-staging-create");

  state.phase = "staging-write";
  await writeAll(state.stagingHandle, secret);
  await readAll(state.stagingHandle, verification);
  if (!capturedTimingSafeEqual(secret, verification)) {
    throw new NativeError("deployment-key staging readback mismatch");
  }
  await assertStagingIdentity(
    state,
    dependencies.effectiveUserId,
    BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
    BigInt(1),
  );
  invokeFailpoint(state, dependencies, "after-write");

  state.phase = "staging-file-sync";
  await state.stagingHandle.sync();
  state.stagingFileSynced = true;
  invokeFailpoint(state, dependencies, "after-file-sync");

  state.phase = "commit";
  await revalidateDirectory(
    state.parentReference,
    dependencies.effectiveUserId,
  );
  await assertStagingIdentity(
    state,
    dependencies.effectiveUserId,
    BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
    BigInt(1),
  );
  if ((await lstatMaybe(state.finalPath)) !== null) {
    state.existingFinal = true;
    throw new NativeError(
      "deployment key already exists; reconciliation required",
    );
  }
  invokeFailpoint(state, dependencies, "before-final-link");
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
  invokeFailpoint(state, dependencies, "after-final-link");
  await revalidateDirectory(
    state.parentReference,
    dependencies.effectiveUserId,
  );
  await assertStagingIdentity(
    state,
    dependencies.effectiveUserId,
    BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
    BigInt(2),
  );
  await assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(2));

  state.phase = "commit-directory-sync";
  await state.parentReference.handle.sync();
  state.firstDirectorySynced = true;
  invokeFailpoint(state, dependencies, "after-final-directory-sync");

  state.phase = "staging-removal";
  await revalidateDirectory(
    state.parentReference,
    dependencies.effectiveUserId,
  );
  await assertStagingIdentity(
    state,
    dependencies.effectiveUserId,
    BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
    BigInt(2),
  );
  await capturedFs.unlink(state.stagingPath);
  state.stagingUnlinked = true;
  invokeFailpoint(state, dependencies, "after-staging-unlink");
  const heldAfterRemoval = await state.stagingHandle.stat({ bigint: true });
  if (
    !statIsStagingFile(
      heldAfterRemoval,
      dependencies.effectiveUserId,
      BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
      BigInt(1),
    ) ||
    !sameIdentity(heldAfterRemoval, state.stagingDev, state.stagingIno)
  ) {
    throw new NativeError("deployment-key held inode changed after unlink");
  }
  await assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(1));
  if ((await lstatMaybe(state.stagingPath)) !== null) {
    throw new NativeError("deployment-key staging name survived unlink");
  }

  state.phase = "cleanup-directory-sync";
  await state.parentReference.handle.sync();
  state.cleanupDirectorySynced = true;
  await revalidateDirectory(
    state.parentReference,
    dependencies.effectiveUserId,
  );
  invokeFailpoint(state, dependencies, "after-cleanup-directory-sync");

  state.phase = "revalidation";
  invokeFailpoint(state, dependencies, "before-final-revalidation");
  await revalidateDirectory(
    state.parentReference,
    dependencies.effectiveUserId,
  );
  await assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(1));
  if ((await lstatMaybe(state.stagingPath)) !== null) {
    throw new NativeError("deployment-key staging name survived cleanup");
  }
  const heldAfterUnlink = await state.stagingHandle.stat({ bigint: true });
  if (
    !statIsStagingFile(
      heldAfterUnlink,
      dependencies.effectiveUserId,
      BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
      BigInt(1),
    ) ||
    !sameIdentity(heldAfterUnlink, state.stagingDev, state.stagingIno)
  ) {
    throw new NativeError("deployment-key held inode changed after cleanup");
  }
  await state.stagingHandle.close();
  state.stagingHandle = null;

  state.finalReopenHandle = await capturedFs.open(
    state.finalPath,
    fs.constants.O_RDONLY | noFollow,
  );
  const reopened = await state.finalReopenHandle.stat({ bigint: true });
  if (
    !statIsStagingFile(
      reopened,
      dependencies.effectiveUserId,
      BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
      BigInt(1),
    ) ||
    !sameIdentity(reopened, state.stagingDev, state.stagingIno)
  ) {
    throw new NativeError("deployment-key final reopen changed identity");
  }
  if (!zeroize(verification)) {
    throw new NativeError("deployment-key verification buffer wipe failed");
  }
  await readAll(state.finalReopenHandle, verification);
  if (!capturedTimingSafeEqual(secret, verification)) {
    throw new NativeError("deployment-key final reopen readback mismatch");
  }
  // The final byte comparison is the last operation that needs secret bytes.
  // Wipe and synchronously verify both internal views before another await.
  if (!zeroize(secret) || !zeroize(verification)) {
    throw new NativeError("deployment-key internal byte wipe failed");
  }
  await revalidateDirectory(
    state.parentReference,
    dependencies.effectiveUserId,
  );
  for (const reference of state.directoryReferences) {
    await revalidateDirectory(reference, dependencies.effectiveUserId);
  }
  const reopenedLast = await state.finalReopenHandle.stat({ bigint: true });
  if (
    !statIsStagingFile(
      reopenedLast,
      dependencies.effectiveUserId,
      BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
      BigInt(1),
    ) ||
    !sameIdentity(reopenedLast, state.stagingDev, state.stagingIno) ||
    (await lstatMaybe(state.stagingPath)) !== null
  ) {
    throw new NativeError("deployment-key final descriptor changed at receipt");
  }
  return assertFinalIdentity(state, dependencies.effectiveUserId, BigInt(1));
}

async function safeClose(
  handle: fs.promises.FileHandle | null,
): Promise<boolean> {
  if (handle === null) return true;
  try {
    await handle.close();
    return true;
  } catch {
    return false;
  }
}

async function closeAll(state: ProvisionState): Promise<boolean> {
  let allClosed = await safeClose(state.finalReopenHandle);
  state.finalReopenHandle = null;
  if (!(await safeClose(state.stagingHandle))) allClosed = false;
  state.stagingHandle = null;
  for (
    let index = state.directoryReferences.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (!(await safeClose(state.directoryReferences[index]?.handle ?? null))) {
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
  state: ProvisionState,
): Promise<Reconciliation> {
  if (state.existingFinal && !state.linkSucceeded) {
    if (state.stagingHandle !== null && state.stagingPath !== null) {
      try {
        if (state.parentReference !== null) {
          await revalidateDirectory(
            state.parentReference,
            dependencies.effectiveUserId,
          );
        }
        const held = await state.stagingHandle.stat({ bigint: true });
        const staged = await namedState(state.stagingPath);
        if (
          staged !== null &&
          staged !== "unknown" &&
          sameIdentity(held, state.stagingDev, state.stagingIno) &&
          sameIdentity(staged, state.stagingDev, state.stagingIno) &&
          held.nlink === BigInt(1)
        ) {
          await capturedFs.unlink(state.stagingPath);
          state.stagingUnlinked = true;
          if (state.parentReference !== null) {
            await state.parentReference.handle.sync();
          }
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
      durability: "no-deployment-change-established" as const,
      mayHaveCommitted: false,
      retryDisposition: "do-not-retry-existing-key" as const,
    });
  }
  if (state.staleStaging) {
    return frozenRecord({
      durability: "staging-may-exist" as const,
      mayHaveCommitted: false,
      retryDisposition: "manual-reconciliation-required" as const,
    });
  }
  if (state.linkSucceeded && state.cleanupDirectorySynced) {
    return frozenRecord({
      durability: "key-published-and-staging-removal-durable" as const,
      mayHaveCommitted: true,
      retryDisposition: "manual-reconciliation-required" as const,
    });
  }
  if (
    state.stagingHandle === null ||
    state.stagingPath === null ||
    state.finalPath === null ||
    state.parentReference === null
  ) {
    return frozenRecord({
      durability: state.parentChainDurable
        ? ("parent-chain-durable-key-absent" as const)
        : ("no-deployment-change-established" as const),
      mayHaveCommitted: false,
      retryDisposition: state.parentChainDurable
        ? ("safe-to-retry-after-readiness-not-provisioned" as const)
        : ("manual-reconciliation-required" as const),
    });
  }
  try {
    await revalidateDirectory(
      state.parentReference,
      dependencies.effectiveUserId,
    );
    const held = await state.stagingHandle.stat({ bigint: true });
    const staged = await namedState(state.stagingPath);
    const final = await namedState(state.finalPath);
    const heldIsOurs = sameIdentity(held, state.stagingDev, state.stagingIno);
    const stagedIsOurs =
      staged !== null &&
      staged !== "unknown" &&
      sameIdentity(staged, state.stagingDev, state.stagingIno);
    const finalIsOurs =
      final !== null &&
      final !== "unknown" &&
      sameIdentity(final, state.stagingDev, state.stagingIno);
    if (!heldIsOurs || staged === "unknown" || final === "unknown") {
      throw new NativeError("deployment-key reconciliation is ambiguous");
    }
    if (finalIsOurs && (stagedIsOurs || staged === null)) {
      await state.parentReference.handle.sync();
      state.firstDirectorySynced = true;
      if (stagedIsOurs) {
        await capturedFs.unlink(state.stagingPath);
        state.stagingUnlinked = true;
      }
      await state.parentReference.handle.sync();
      state.cleanupDirectorySynced = true;
      const finalAfter = await assertFinalIdentity(
        state,
        dependencies.effectiveUserId,
        BigInt(1),
      );
      if (finalAfter.nlink !== BigInt(1)) {
        throw new NativeError(
          "deployment-key reconciliation link count is unsafe",
        );
      }
      return frozenRecord({
        durability: "key-published-and-staging-removal-durable" as const,
        mayHaveCommitted: true,
        retryDisposition: "manual-reconciliation-required" as const,
      });
    }
    if (final === null && stagedIsOurs && held.nlink === BigInt(1)) {
      await capturedFs.unlink(state.stagingPath);
      state.stagingUnlinked = true;
      await state.parentReference.handle.sync();
      return frozenRecord({
        durability: "parent-chain-durable-key-absent" as const,
        mayHaveCommitted: false,
        retryDisposition:
          "safe-to-retry-after-readiness-not-provisioned" as const,
      });
    }
  } catch {
    // Ambiguous namespace state is deliberately left untouched.
  }
  return frozenRecord({
    durability: state.cleanupDirectorySynced
      ? ("key-published-and-staging-removal-durable" as const)
      : state.firstDirectorySynced
        ? ("final-link-directory-synced" as const)
        : state.linkAttempted
          ? ("final-link-may-exist" as const)
          : state.stagingFileSynced
            ? ("staging-file-synced-final-absent" as const)
            : ("staging-may-exist" as const),
    mayHaveCommitted: state.linkAttempted,
    retryDisposition: "manual-reconciliation-required" as const,
  });
}

function buildReceipt<
  TBoundary extends FloodgateV7DeploymentKeyProvisionerExecutionBoundary,
>(
  boundary: TBoundary,
  dependencies: CapturedDependencies,
  parent: DirectoryReference,
  key: fs.BigIntStats,
): Readonly<FloodgateV7DeploymentKeyProvisionerReceipt<TBoundary>> {
  return frozenRecord({
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CONTRACT,
    status: FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_STATUS,
    claim_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_TRUST_BOUNDARY,
    execution_boundary: boundary,
    algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_ALGORITHM,
    key_deployment: frozenRecord({
      layout: "fixed-current-euid-userinfo-home-v1" as const,
      owner_uid: dependencies.effectiveUserId,
      parent_mode: "0700" as const,
      key_mode: "0600" as const,
      key_bytes: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
      key_nlink: 1 as const,
      publication:
        "staged-file-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1" as const,
      durability: "key-published-and-staging-removal-durable" as const,
      parent_identity: frozenRecord({
        dev: parent.dev.toString(10),
        ino: parent.ino.toString(10),
      }),
      key_identity: frozenRecord({
        dev: key.dev.toString(10),
        ino: key.ino.toString(10),
      }),
      held_descriptors_revalidated: true as const,
    }),
    test_boundary: frozenRecord({
      production_home_origin:
        boundary ===
        "production-fixed-current-euid-userinfo-home-key-provisioning",
      production_effective_uid_origin:
        boundary ===
        "production-fixed-current-euid-userinfo-home-key-provisioning",
      entropy_may_be_test_injected:
        boundary === "test-only-injected-current-euid-home-key-provisioning",
      test_hooks_may_observe_key_copy:
        boundary === "test-only-injected-current-euid-home-key-provisioning",
    }),
    nonclaims: frozenRecord({
      key_material_disclosed: false as const,
      key_fingerprint_disclosed: false as const,
      key_path_disclosed: false as const,
      key_authority: false as const,
      checkpoint: false as const,
      runtime: false as const,
      dataset_read: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      playing_strength: false as const,
    }),
  });
}

function initialState(): ProvisionState {
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
    parentChainDurable: false,
    stagingCreated: false,
    stagingFileSynced: false,
    linkAttempted: false,
    linkSucceeded: false,
    linkReturnedExisting: false,
    firstDirectorySynced: false,
    stagingUnlinked: false,
    cleanupDirectorySynced: false,
    existingFinal: false,
    staleStaging: false,
  };
}

async function assertTestBoundaryIsNotProductionHome(
  dependencies: CapturedDependencies,
): Promise<void> {
  if (getEffectiveUserId === null) {
    throw new NativeError("test deployment-key boundary requires a POSIX euid");
  }
  const currentEffectiveUserId = getEffectiveUserId();
  const userInfo = getUserInfo();
  const descriptors = objectGetOwnPropertyDescriptors(userInfo);
  if (
    dependencies.effectiveUserId !== currentEffectiveUserId ||
    descriptors.uid === undefined ||
    !("value" in descriptors.uid) ||
    descriptors.uid.value !== currentEffectiveUserId ||
    descriptors.homedir === undefined ||
    !("value" in descriptors.homedir) ||
    typeof descriptors.homedir.value !== "string"
  ) {
    throw new NativeError("test deployment-key identity is not current-euid");
  }
  const productionHome = descriptors.homedir.value;
  if (dependencies.homeDirectory === productionHome) {
    throw new NativeError("test deployment-key home is the production home");
  }
  const injectedRealpath = await capturedFs.realpath(
    dependencies.homeDirectory,
  );
  const productionRealpath = await capturedFs.realpath(productionHome);
  const injectedStat = await capturedFs.lstat(injectedRealpath, {
    bigint: true,
  });
  const productionStat = await capturedFs.lstat(productionRealpath, {
    bigint: true,
  });
  if (
    injectedRealpath === productionRealpath ||
    (injectedStat.dev === productionStat.dev &&
      injectedStat.ino === productionStat.ino)
  ) {
    throw new NativeError("test deployment-key home aliases production home");
  }
}

async function provisionInsideTestBoundary(
  dependencies: CapturedDependencies,
): Promise<
  Readonly<
    FloodgateV7DeploymentKeyProvisionerReceipt<"test-only-injected-current-euid-home-key-provisioning">
  >
> {
  try {
    await assertTestBoundaryIsNotProductionHome(dependencies);
  } catch (rawFailure) {
    try {
      callSynchronousHook(dependencies.observeFailureForTests, rawFailure);
    } catch {
      // The observer cannot widen the fixed public failure boundary.
    }
    throw new FloodgateV7DeploymentKeyProvisionerError(
      "capture",
      "no-deployment-change-established",
      false,
      "manual-reconciliation-required",
    );
  }
  return provision(
    dependencies,
    "test-only-injected-current-euid-home-key-provisioning",
  );
}

async function provision<
  TBoundary extends FloodgateV7DeploymentKeyProvisionerExecutionBoundary,
>(
  dependencies: CapturedDependencies,
  boundary: TBoundary,
): Promise<Readonly<FloodgateV7DeploymentKeyProvisionerReceipt<TBoundary>>> {
  const state = initialState();
  let secret: Uint8Array | null = null;
  let verification: Uint8Array | null = null;
  try {
    const firstMissing = await inspectExistingChain(dependencies, state);
    if (
      firstMissing ===
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length
    ) {
      const parent = state.parentReference;
      if (parent === null) {
        throw new NativeError(
          "deployment-key parent descriptor is unavailable",
        );
      }
      state.finalPath = appendFixedPathComponent(
        parent.filePath,
        FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
      );
      state.stagingPath = appendFixedPathComponent(
        parent.filePath,
        STAGING_BASENAME,
      );
      await assertFinalNamespaceEmpty(state, dependencies.effectiveUserId);
      state.parentChainDurable = true;
    }

    state.phase = "entropy";
    secret = createSecret(dependencies);
    verification = new NativeUint8Array(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES);

    if (
      firstMissing < FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length
    ) {
      await finishNamespace(dependencies, state, firstMissing);
    }
    const parent = state.parentReference;
    if (parent === null) {
      throw new NativeError("deployment-key parent descriptor is unavailable");
    }
    const key = await createAndPublishKey(
      dependencies,
      state,
      secret,
      verification,
    );

    // Wipe both internal byte views before any descriptor cleanup await.
    zeroize(secret);
    zeroize(verification);
    secret = null;
    verification = null;
    if (!(await closeAll(state))) {
      state.phase = "cleanup";
      throw new NativeError("deployment-key descriptor cleanup failed");
    }
    invokeFailpoint(state, dependencies, "after-descriptor-close");
    return buildReceipt(boundary, dependencies, parent, key);
  } catch (rawFailure) {
    // No cleanup or reconciliation await may run while an internal key copy is
    // still live. The caller-owned injected view is never modified.
    zeroize(secret);
    zeroize(verification);
    secret = null;
    verification = null;

    try {
      callSynchronousHook(dependencies.observeFailureForTests, rawFailure);
    } catch {
      // A test-only failure observer cannot replace or expose the primary error.
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
    if (!(await closeAll(state))) {
      reconciliation = frozenRecord({
        durability: reconciliation.durability,
        mayHaveCommitted: reconciliation.mayHaveCommitted,
        retryDisposition: "manual-reconciliation-required" as const,
      });
    }
    throw new FloodgateV7DeploymentKeyProvisionerError(
      state.phase,
      reconciliation.durability,
      reconciliation.mayHaveCommitted,
      reconciliation.retryDisposition,
    );
  }
}

/** Test-only injected-home provisioner. It never changes the production slot. */
export function provisionFloodgateV7DeploymentKeyCoreForTests(
  dependenciesValue: FloodgateV7DeploymentKeyProvisionerDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7DeploymentKeyProvisionerReceipt<"test-only-injected-current-euid-home-key-provisioning">
  >
> {
  if (arguments.length !== 1) {
    return rejected(
      new TypeError(
        "test deployment-key provisioner accepts exactly one argument",
      ),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(
      new FloodgateV7DeploymentKeyProvisionerError(
        "capture",
        "no-deployment-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  return provisionInsideTestBoundary(dependencies);
}

/** Fixed current-user provisioner. Calling it may create the real key. */
export function provisionFloodgateV7DeploymentKey(): Promise<
  Readonly<
    FloodgateV7DeploymentKeyProvisionerReceipt<"production-fixed-current-euid-userinfo-home-key-provisioning">
  >
> {
  if (arguments.length !== 0 || getEffectiveUserId === null) {
    return rejected(
      new FloodgateV7DeploymentKeyProvisionerError(
        "production-identity",
        "no-deployment-change-established",
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
      descriptors.homedir === undefined ||
      !("value" in descriptors.homedir) ||
      descriptors.uid.value !== effectiveUserId
    ) {
      throw new NativeError("production deployment-key identity mismatch");
    }
    dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: descriptors.homedir.value as string,
    });
  } catch {
    return rejected(
      new FloodgateV7DeploymentKeyProvisionerError(
        "production-identity",
        "no-deployment-change-established",
        false,
        "manual-reconciliation-required",
      ),
    );
  }
  return provision(
    dependencies,
    "production-fixed-current-euid-userinfo-home-key-provisioning",
  );
}
