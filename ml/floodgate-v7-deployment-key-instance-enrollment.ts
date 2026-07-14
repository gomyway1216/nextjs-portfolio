/**
 * Reads the fixed Floodgate v7 deployment key only long enough to derive a
 * pseudonymous key-instance enrollment candidate. This module never creates,
 * writes, replaces, or approves a deployment key or control-plane record.
 */

import { Buffer } from "node:buffer";
import { createHmac, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-v7-deployment-key-authority";

export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT =
  "shogi-floodgate-v7-deployment-key-instance-enrollment-candidate-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS =
  "fixed-key-instance-candidate-observed-and-held-revalidated-not-approved-or-persisted" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY =
  "read-only-fixed-current-euid-private-key-instance-candidate-without-key-material-root-hash-path-run-authorization-control-plane-approval-persistence-checkpoint-runtime-training-live-or-strength-claims" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY =
  "trusted-current-euid-private-0700-key-deployment-local-posix-filesystem-node-crypto-and-current-js-realm-intrinsics-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM =
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM;

export type FloodgateV7DeploymentKeyInstanceEnrollmentExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-key-instance-inspection"
  | "test-only-injected-current-euid-home-key-instance-inspection";

export type FloodgateV7DeploymentKeyInstanceEnrollmentPhase =
  | "capture"
  | "production-identity"
  | "test-boundary"
  | "namespace"
  | "key-read"
  | "derivation"
  | "revalidation"
  | "cleanup"
  | "receipt";

export interface FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<
  TBoundary extends
    FloodgateV7DeploymentKeyInstanceEnrollmentExecutionBoundary =
    FloodgateV7DeploymentKeyInstanceEnrollmentExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT;
  readonly status: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly algorithm: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM;
  readonly key_deployment: Readonly<{
    readonly layout: "fixed-current-euid-userinfo-home-v1";
    readonly key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
    readonly owner_uid: number;
    readonly parent_mode: "0700";
    readonly key_mode: "0600";
    readonly key_bytes: typeof FLOODGATE_V7_DEPLOYMENT_KEY_BYTES;
    readonly key_nlink: 1;
    readonly parent_identity: Readonly<{
      readonly dev: string;
      readonly ino: string;
    }>;
    readonly key_identity: Readonly<{
      readonly dev: string;
      readonly ino: string;
    }>;
    readonly key_instance_id: string;
    readonly key_instance_algorithm: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM;
    readonly held_descriptors_revalidated: true;
  }>;
  readonly test_boundary: Readonly<{
    readonly production_home_origin: false;
    readonly production_home_alias_rejected: true;
    readonly current_effective_uid_required: true;
    readonly test_hook_may_observe_key_copy: true;
  }> | null;
  readonly nonclaims: Readonly<{
    readonly key_created_or_written: false;
    readonly key_material_disclosed: false;
    readonly root_key_hash_disclosed: false;
    readonly key_path_disclosed: false;
    readonly authorization_mac: false;
    readonly run_authorization: false;
    readonly stage_authorization: false;
    readonly checkpoint_key_capability: false;
    readonly control_plane_approval: false;
    readonly record_persisted: false;
    readonly connector_execution: false;
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

export interface FloodgateV7DeploymentKeyInstanceEnrollmentDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly observeInternalKeyForTests?: (key: Uint8Array) => void;
  readonly beforeFinalRevalidationForTests?: () => void | Promise<void>;
}

export class FloodgateV7DeploymentKeyInstanceEnrollmentError extends Error {
  readonly phase!: FloodgateV7DeploymentKeyInstanceEnrollmentPhase;
  readonly candidate_receipt_issued!: false;
  readonly retry_disposition!: "operator-reconciliation-required";

  constructor(phase: FloodgateV7DeploymentKeyInstanceEnrollmentPhase) {
    super(
      "Floodgate v7 deployment-key instance inspection failed without issuing an enrollment candidate receipt",
    );
    objectDefineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: "FloodgateV7DeploymentKeyInstanceEnrollmentError",
    });
    objectDefineProperty(this, "phase", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: phase,
    });
    objectDefineProperty(this, "candidate_receipt_issued", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: false,
    });
    objectDefineProperty(this, "retry_disposition", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: "operator-reconciliation-required",
    });
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7DeploymentKeyInstanceEnrollmentError: deployment-key instance inspection failed",
    });
    objectFreeze(this);
  }
}

type CapturedDependencies = Readonly<{
  effectiveUserId: number;
  homeDirectory: string;
  observeInternalKey?: (key: Uint8Array) => void;
  beforeFinalRevalidation?: () => void | Promise<void>;
}>;

interface StatSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

const KEY_INSTANCE_RE = /^[0-9a-f]{64}$/;
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);

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
const bufferAlloc = Buffer.alloc.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const bufferFill = Buffer.prototype.fill;
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathJoin = path.join.bind(path);
const pathParse = path.parse.bind(path);
const pathResolve = path.resolve.bind(path);
const realpath = fs.promises.realpath.bind(fs.promises);
const lstat = fs.promises.lstat.bind(fs.promises);
const open = fs.promises.open.bind(fs.promises);
const getUserInfo = os.userInfo.bind(os);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const DEPENDENCY_KEYS = objectFreeze([
  "beforeFinalRevalidationForTests",
  "effectiveUserId",
  "homeDirectory",
  "observeInternalKeyForTests",
] as const);
const REQUIRED_DEPENDENCY_KEYS = objectFreeze([
  "effectiveUserId",
  "homeDirectory",
] as const);

function rejected(error: unknown): Promise<never> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = objectKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("enrollment records require data properties");
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

function isAllowedDependencyKey(key: string): boolean {
  for (let index = 0; index < DEPENDENCY_KEYS.length; index += 1) {
    if (DEPENDENCY_KEYS[index] === key) return true;
  }
  return false;
}

function captureDependencies(
  value: FloodgateV7DeploymentKeyInstanceEnrollmentDependenciesForTests,
): CapturedDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError(
      "enrollment dependencies must be an exact non-Proxy plain object",
    );
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string" || !isAllowedDependencyKey(key)) {
      throw new NativeError("enrollment dependencies contain an unknown key");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(
        "enrollment dependencies require enumerable data properties",
      );
    }
  }
  for (let index = 0; index < REQUIRED_DEPENDENCY_KEYS.length; index += 1) {
    if (descriptors[REQUIRED_DEPENDENCY_KEYS[index]] === undefined) {
      throw new NativeError("enrollment dependencies are incomplete");
    }
  }

  const effectiveUserId: unknown = descriptors.effectiveUserId?.value;
  const homeDirectory: unknown = descriptors.homeDirectory?.value;
  const observeInternalKey: unknown =
    descriptors.observeInternalKeyForTests?.value;
  const beforeFinalRevalidation: unknown =
    descriptors.beforeFinalRevalidationForTests?.value;
  if (
    typeof effectiveUserId !== "number" ||
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    homeDirectory.length === 0 ||
    homeDirectory.includes("\0") ||
    !pathIsAbsolute(homeDirectory) ||
    pathParse(homeDirectory).root === homeDirectory ||
    pathResolve(homeDirectory) !== homeDirectory
  ) {
    throw new NativeError("enrollment dependencies are not canonical");
  }
  if (
    observeInternalKey !== undefined &&
    (typeof observeInternalKey !== "function" ||
      nodeIsProxy(observeInternalKey))
  ) {
    throw new NativeError("enrollment key observer is invalid");
  }
  if (
    beforeFinalRevalidation !== undefined &&
    (typeof beforeFinalRevalidation !== "function" ||
      nodeIsProxy(beforeFinalRevalidation))
  ) {
    throw new NativeError("enrollment revalidation hook is invalid");
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    observeInternalKey: observeInternalKey as
      ((key: Uint8Array) => void) | undefined,
    beforeFinalRevalidation: beforeFinalRevalidation as
      (() => void | Promise<void>) | undefined,
  });
}

function snapshot(stat: fs.BigIntStats): Readonly<StatSnapshot> {
  return frozenRecord({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function assertParent(stat: Readonly<StatSnapshot>, effectiveUserId: number) {
  if (
    (stat.mode & TYPE_MASK) !== DIRECTORY_TYPE ||
    (stat.mode & MODE_MASK) !== BigInt(0o700) ||
    stat.uid !== BigInt(effectiveUserId)
  ) {
    throw new NativeError("unsafe deployment-key parent metadata");
  }
}

function assertKey(stat: Readonly<StatSnapshot>, effectiveUserId: number) {
  if (
    (stat.mode & TYPE_MASK) !== REGULAR_TYPE ||
    (stat.mode & MODE_MASK) !== BigInt(0o600) ||
    stat.uid !== BigInt(effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    stat.size !== BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES)
  ) {
    throw new NativeError("unsafe deployment-key metadata");
  }
}

function sameStat(
  left: Readonly<StatSnapshot>,
  right: Readonly<StatSnapshot>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function zeroize(bytes: Buffer | undefined): boolean {
  if (bytes === undefined) return true;
  try {
    reflectApply(bufferFill, bytes, [0]);
    for (let index = 0; index < bytes.byteLength; index += 1) {
      if (bytes[index] !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function zeroizeSecrets(
  rootKey: Buffer | undefined,
  instanceKey: Buffer | undefined,
  extra: Buffer | undefined,
): boolean {
  const instanceZeroized = zeroize(instanceKey);
  const rootZeroized = zeroize(rootKey);
  const extraZeroized = zeroize(extra);
  return instanceZeroized && rootZeroized && extraZeroized;
}

async function assertTestBoundaryIsNotProductionHome(
  dependencies: CapturedDependencies,
): Promise<void> {
  if (getEffectiveUserId === null) {
    throw new NativeError("test enrollment boundary requires a POSIX euid");
  }
  const currentEffectiveUserId = getEffectiveUserId();
  const userInfo = getUserInfo();
  const descriptors = objectGetOwnPropertyDescriptors(userInfo);
  const uidDescriptor = descriptors.uid;
  const homeDescriptor = descriptors.homedir;
  if (
    dependencies.effectiveUserId !== currentEffectiveUserId ||
    uidDescriptor === undefined ||
    !("value" in uidDescriptor) ||
    uidDescriptor.value !== currentEffectiveUserId ||
    homeDescriptor === undefined ||
    !("value" in homeDescriptor) ||
    typeof homeDescriptor.value !== "string"
  ) {
    throw new NativeError("test enrollment identity is not current-euid");
  }
  const productionHome = homeDescriptor.value;
  if (dependencies.homeDirectory === productionHome) {
    throw new NativeError("test enrollment home is the production home");
  }
  const injectedRealpath = await realpath(dependencies.homeDirectory);
  const productionRealpath = await realpath(productionHome);
  const injectedStat = await lstat(injectedRealpath, { bigint: true });
  const productionStat = await lstat(productionRealpath, { bigint: true });
  if (
    injectedRealpath === productionRealpath ||
    (injectedStat.dev === productionStat.dev &&
      injectedStat.ino === productionStat.ino)
  ) {
    throw new NativeError("test enrollment home aliases production home");
  }
}

function buildReceipt<
  TBoundary extends FloodgateV7DeploymentKeyInstanceEnrollmentExecutionBoundary,
>(
  boundary: TBoundary,
  dependencies: CapturedDependencies,
  parent: Readonly<StatSnapshot>,
  key: Readonly<StatSnapshot>,
  keyInstanceId: string,
): Readonly<
  FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<TBoundary>
> {
  const testBoundary =
    boundary ===
    "production-fixed-current-euid-userinfo-home-key-instance-inspection"
      ? null
      : frozenRecord({
          production_home_origin: false as const,
          production_home_alias_rejected: true as const,
          current_effective_uid_required: true as const,
          test_hook_may_observe_key_copy: true as const,
        });
  return frozenRecord({
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    claim_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    execution_boundary: boundary,
    algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    key_deployment: frozenRecord({
      layout: "fixed-current-euid-userinfo-home-v1" as const,
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      owner_uid: dependencies.effectiveUserId,
      parent_mode: "0700" as const,
      key_mode: "0600" as const,
      key_bytes: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
      key_nlink: 1 as const,
      parent_identity: frozenRecord({
        dev: parent.dev.toString(10),
        ino: parent.ino.toString(10),
      }),
      key_identity: frozenRecord({
        dev: key.dev.toString(10),
        ino: key.ino.toString(10),
      }),
      key_instance_id: keyInstanceId,
      key_instance_algorithm:
        FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
      held_descriptors_revalidated: true as const,
    }),
    test_boundary: testBoundary,
    nonclaims: frozenRecord({
      key_created_or_written: false as const,
      key_material_disclosed: false as const,
      root_key_hash_disclosed: false as const,
      key_path_disclosed: false as const,
      authorization_mac: false as const,
      run_authorization: false as const,
      stage_authorization: false as const,
      checkpoint_key_capability: false as const,
      control_plane_approval: false as const,
      record_persisted: false as const,
      connector_execution: false as const,
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

async function inspectInternal<
  TBoundary extends FloodgateV7DeploymentKeyInstanceEnrollmentExecutionBoundary,
>(
  dependencies: CapturedDependencies,
  boundary: TBoundary,
): Promise<
  Readonly<
    FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<TBoundary>
  >
> {
  let activePhase: FloodgateV7DeploymentKeyInstanceEnrollmentPhase =
    "namespace";
  let failurePhase: FloodgateV7DeploymentKeyInstanceEnrollmentPhase | undefined;
  let parentHandle: fs.promises.FileHandle | undefined;
  let keyHandle: fs.promises.FileHandle | undefined;
  let rootKey: Buffer | undefined;
  let instanceKey: Buffer | undefined;
  let extra: Buffer | undefined;
  let result:
    | Readonly<
        FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<TBoundary>
      >
    | undefined;

  try {
    rootKey = bufferAlloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES);
    extra = bufferAlloc(1);
    const parentPath = pathJoin(
      dependencies.homeDirectory,
      ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
    );
    const keyPath = pathJoin(parentPath, FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME);
    if (
      (await realpath(dependencies.homeDirectory)) !==
        dependencies.homeDirectory ||
      (await realpath(parentPath)) !== parentPath ||
      (await realpath(keyPath)) !== keyPath
    ) {
      throw new NativeError("deployment-key paths are not canonical");
    }

    const parentBefore = snapshot(await lstat(parentPath, { bigint: true }));
    const keyBefore = snapshot(await lstat(keyPath, { bigint: true }));
    assertParent(parentBefore, dependencies.effectiveUserId);
    assertKey(keyBefore, dependencies.effectiveUserId);
    const noFollow = fs.constants.O_NOFOLLOW;
    const directory = fs.constants.O_DIRECTORY;
    if (typeof noFollow !== "number" || typeof directory !== "number") {
      throw new NativeError("read-only POSIX open flags are unavailable");
    }
    parentHandle = await open(
      parentPath,
      fs.constants.O_RDONLY | directory | noFollow,
    );
    keyHandle = await open(keyPath, fs.constants.O_RDONLY | noFollow);
    const parentHeldBefore = snapshot(
      await parentHandle.stat({ bigint: true }),
    );
    const keyHeldBefore = snapshot(await keyHandle.stat({ bigint: true }));
    assertParent(parentHeldBefore, dependencies.effectiveUserId);
    assertKey(keyHeldBefore, dependencies.effectiveUserId);
    if (
      !sameStat(parentBefore, parentHeldBefore) ||
      !sameStat(keyBefore, keyHeldBefore)
    ) {
      throw new NativeError("deployment-key identity changed before held read");
    }

    activePhase = "key-read";
    const keyRead = await keyHandle.read(rootKey, 0, rootKey.byteLength, 0);
    const extraRead = await keyHandle.read(
      extra,
      0,
      extra.byteLength,
      rootKey.byteLength,
    );
    if (keyRead.bytesRead !== rootKey.byteLength || extraRead.bytesRead !== 0) {
      throw new NativeError("deployment-key held read is not exact");
    }

    activePhase = "derivation";
    instanceKey = bufferFrom(
      hkdfSync(
        "sha256",
        rootKey,
        bufferFrom(FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT),
        bufferFrom(FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO),
        FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
      ),
    );
    const keyInstanceId = createHmac("sha256", instanceKey)
      .update(FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN, "utf8")
      .digest("hex");
    if (!KEY_INSTANCE_RE.test(keyInstanceId)) {
      throw new NativeError("deployment-key instance derivation failed");
    }
    if (dependencies.observeInternalKey !== undefined) {
      const observerResult: unknown = dependencies.observeInternalKey(rootKey);
      if (observerResult !== undefined) {
        throw new NativeError("test key observer must return undefined");
      }
    }

    // No later operation needs key bytes. Wipe all owned secret copies before
    // the final test hook, metadata revalidation, or descriptor-close awaits.
    activePhase = "cleanup";
    if (!zeroizeSecrets(rootKey, instanceKey, extra)) {
      throw new NativeError("deployment-key secret zeroization failed");
    }

    activePhase = "revalidation";
    await dependencies.beforeFinalRevalidation?.();
    const parentHeldAfter = snapshot(await parentHandle.stat({ bigint: true }));
    const keyHeldAfter = snapshot(await keyHandle.stat({ bigint: true }));
    const parentAfter = snapshot(await lstat(parentPath, { bigint: true }));
    const keyAfter = snapshot(await lstat(keyPath, { bigint: true }));
    assertParent(parentHeldAfter, dependencies.effectiveUserId);
    assertKey(keyHeldAfter, dependencies.effectiveUserId);
    if (
      !sameStat(parentBefore, parentHeldAfter) ||
      !sameStat(parentBefore, parentAfter) ||
      !sameStat(keyBefore, keyHeldAfter) ||
      !sameStat(keyBefore, keyAfter)
    ) {
      throw new NativeError(
        "deployment-key identity changed during inspection",
      );
    }

    activePhase = "receipt";
    result = buildReceipt(
      boundary,
      dependencies,
      parentHeldAfter,
      keyHeldAfter,
      keyInstanceId,
    );
  } catch {
    failurePhase = activePhase;
  } finally {
    // Repeat the synchronous wipe before the first cleanup await so failure
    // paths cannot extend secret lifetime while descriptor close is pending.
    if (!zeroizeSecrets(rootKey, instanceKey, extra)) {
      failurePhase = "cleanup";
      result = undefined;
    }
    try {
      await keyHandle?.close();
    } catch {
      failurePhase = "cleanup";
      result = undefined;
    }
    try {
      await parentHandle?.close();
    } catch {
      failurePhase = "cleanup";
      result = undefined;
    }
  }

  if (failurePhase !== undefined || result === undefined) {
    throw new FloodgateV7DeploymentKeyInstanceEnrollmentError(
      failurePhase ?? "receipt",
    );
  }
  return result;
}

async function inspectInsideTestBoundary(
  dependencies: CapturedDependencies,
): Promise<
  Readonly<
    FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<"test-only-injected-current-euid-home-key-instance-inspection">
  >
> {
  try {
    await assertTestBoundaryIsNotProductionHome(dependencies);
  } catch {
    throw new FloodgateV7DeploymentKeyInstanceEnrollmentError("test-boundary");
  }
  return inspectInternal(
    dependencies,
    "test-only-injected-current-euid-home-key-instance-inspection",
  );
}

/**
 * Test-only injected-home inspector. The injected home must be owned by the
 * current EUID and must not equal or alias the production user-info home.
 */
export function inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
  dependenciesValue: FloodgateV7DeploymentKeyInstanceEnrollmentDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<"test-only-injected-current-euid-home-key-instance-inspection">
  >
> {
  if (arguments.length !== 1) {
    return rejected(
      new FloodgateV7DeploymentKeyInstanceEnrollmentError("capture"),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(
      new FloodgateV7DeploymentKeyInstanceEnrollmentError("capture"),
    );
  }
  return inspectInsideTestBoundary(dependencies);
}

/**
 * Read-only fixed-current-user inspector. Calling it reads the real key when
 * the fixed deployment is present, but never writes or approves any record.
 */
export function inspectFloodgateV7DeploymentKeyInstance(): Promise<
  Readonly<
    FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<"production-fixed-current-euid-userinfo-home-key-instance-inspection">
  >
> {
  if (arguments.length !== 0 || getEffectiveUserId === null) {
    return rejected(
      new FloodgateV7DeploymentKeyInstanceEnrollmentError(
        "production-identity",
      ),
    );
  }
  let dependencies: CapturedDependencies;
  try {
    const effectiveUserId = getEffectiveUserId();
    const userInfo = getUserInfo();
    const descriptors = objectGetOwnPropertyDescriptors(userInfo);
    const uidDescriptor = descriptors.uid;
    const homeDescriptor = descriptors.homedir;
    if (
      uidDescriptor === undefined ||
      !("value" in uidDescriptor) ||
      uidDescriptor.value !== effectiveUserId ||
      homeDescriptor === undefined ||
      !("value" in homeDescriptor) ||
      typeof homeDescriptor.value !== "string"
    ) {
      throw new NativeError("production enrollment identity mismatch");
    }
    dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: homeDescriptor.value,
    });
  } catch {
    return rejected(
      new FloodgateV7DeploymentKeyInstanceEnrollmentError(
        "production-identity",
      ),
    );
  }
  return inspectInternal(
    dependencies,
    "production-fixed-current-euid-userinfo-home-key-instance-inspection",
  );
}
