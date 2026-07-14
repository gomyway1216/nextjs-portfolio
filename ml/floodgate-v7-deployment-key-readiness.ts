/**
 * Metadata-only readiness probe for the fixed Floodgate v7 deployment key.
 *
 * This probe is deliberately advisory. It reads no key bytes, creates no
 * directories or files, and cannot replace the deployment-key authority's
 * held-descriptor read and final revalidation at execution time.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "./floodgate-v7-deployment-key-authority";

export const FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT =
  "shogi-floodgate-v7-deployment-key-readiness-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY =
  "metadata-only-advisory-fixed-current-user-key-slot-readiness-no-key-byte-read-create-write-provision-authority-or-checkpoint-evidence" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY =
  "trusted-current-process-current-euid-userinfo-home-and-filesystem-metadata-v1" as const;

export type FloodgateV7DeploymentKeyReadinessStatus =
  "ready" | "not-provisioned" | "unsafe";

export type FloodgateV7DeploymentKeyReadinessExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-metadata"
  | "test-only-injected-current-euid-home-metadata";

export interface FloodgateV7DeploymentKeyReadinessReceipt<
  TBoundary extends FloodgateV7DeploymentKeyReadinessExecutionBoundary =
    FloodgateV7DeploymentKeyReadinessExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT;
  readonly status: FloodgateV7DeploymentKeyReadinessStatus;
  readonly claim_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly deployment: Readonly<{
    readonly layout: "fixed-current-euid-userinfo-home-v1";
    readonly parent:
      "absent" | "present-current-euid-exact-0700-directory" | "unsafe";
    readonly key:
      | "absent"
      | "present-current-euid-exact-0600-regular-nlink-1-32-bytes"
      | "unsafe";
    readonly authoritative_reopen_required: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly key_bytes_read: false;
    readonly key_created_or_written: false;
    readonly key_instance_id: false;
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

export interface FloodgateV7DeploymentKeyReadinessDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
}

const NativePromise = Promise;
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const lstat = fs.promises.lstat.bind(fs.promises);
const realpath = fs.promises.realpath.bind(fs.promises);
const pathJoin = path.join.bind(path);
const pathResolve = path.resolve.bind(path);
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const numberIsSafeInteger = Number.isSafeInteger;

const TYPE_MASK = BigInt(0o170000);
const DIRECTORY_TYPE = BigInt(0o040000);
const REGULAR_TYPE = BigInt(0o100000);
const MODE_MASK = BigInt(0o7777);

type ParentState =
  FloodgateV7DeploymentKeyReadinessReceipt["deployment"]["parent"];
type KeyState = FloodgateV7DeploymentKeyReadinessReceipt["deployment"]["key"];

function resolved<T>(value: T): Promise<T> {
  return new NativePromise((resolve) => resolve(value));
}

function rejected(error: unknown): Promise<never> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError("readiness records require data properties");
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

function receipt<
  TBoundary extends FloodgateV7DeploymentKeyReadinessExecutionBoundary,
>(
  boundary: TBoundary,
  status: FloodgateV7DeploymentKeyReadinessStatus,
  parent: ParentState,
  key: KeyState,
): Readonly<FloodgateV7DeploymentKeyReadinessReceipt<TBoundary>> {
  return frozenRecord({
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
    status,
    claim_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
    execution_boundary: boundary,
    deployment: frozenRecord({
      layout: "fixed-current-euid-userinfo-home-v1" as const,
      parent,
      key,
      authoritative_reopen_required: true as const,
    }),
    nonclaims: frozenRecord({
      key_bytes_read: false as const,
      key_created_or_written: false as const,
      key_instance_id: false as const,
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

function isMissing(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const descriptor = objectGetOwnPropertyDescriptors(error).code;
  return (
    descriptor !== undefined &&
    "value" in descriptor &&
    descriptor.value === "ENOENT"
  );
}

function captureDependencies(
  value: FloodgateV7DeploymentKeyReadinessDependenciesForTests,
): Readonly<FloodgateV7DeploymentKeyReadinessDependenciesForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw new TypeError(
      "readiness dependencies must be an exact non-Proxy plain object",
    );
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length !== 2 ||
    descriptors.effectiveUserId === undefined ||
    descriptors.homeDirectory === undefined
  ) {
    throw new TypeError("readiness dependencies require exact keys");
  }
  for (const key of keys) {
    if (typeof key !== "string") {
      throw new TypeError("readiness dependencies reject symbol keys");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new TypeError(
        "readiness dependencies require enumerable data properties",
      );
    }
  }
  const effectiveUserId: unknown = descriptors.effectiveUserId.value;
  const homeDirectory: unknown = descriptors.homeDirectory.value;
  if (
    typeof effectiveUserId !== "number" ||
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    homeDirectory.length === 0 ||
    pathResolve(homeDirectory) !== homeDirectory
  ) {
    throw new TypeError("readiness dependencies are not canonical");
  }
  return frozenRecord({ effectiveUserId, homeDirectory });
}

function parentIsSafe(stat: fs.BigIntStats, effectiveUserId: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    (stat.mode & MODE_MASK) === BigInt(0o700) &&
    stat.uid === BigInt(effectiveUserId)
  );
}

function keyIsSafe(stat: fs.BigIntStats, effectiveUserId: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === REGULAR_TYPE &&
    (stat.mode & MODE_MASK) === BigInt(0o600) &&
    stat.uid === BigInt(effectiveUserId) &&
    stat.nlink === BigInt(1) &&
    stat.size === BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES)
  );
}

async function probe<
  TBoundary extends FloodgateV7DeploymentKeyReadinessExecutionBoundary,
>(
  dependencies: Readonly<FloodgateV7DeploymentKeyReadinessDependenciesForTests>,
  boundary: TBoundary,
): Promise<Readonly<FloodgateV7DeploymentKeyReadinessReceipt<TBoundary>>> {
  const parentPath = pathJoin(
    dependencies.homeDirectory,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
  const keyPath = pathJoin(parentPath, FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME);
  try {
    if (
      (await realpath(dependencies.homeDirectory)) !==
      dependencies.homeDirectory
    ) {
      return receipt(boundary, "unsafe", "unsafe", "unsafe");
    }
  } catch {
    return receipt(boundary, "unsafe", "unsafe", "unsafe");
  }

  let parentStat: fs.BigIntStats;
  try {
    parentStat = await lstat(parentPath, { bigint: true });
  } catch (error) {
    return isMissing(error)
      ? receipt(boundary, "not-provisioned", "absent", "absent")
      : receipt(boundary, "unsafe", "unsafe", "unsafe");
  }
  if (!parentIsSafe(parentStat, dependencies.effectiveUserId)) {
    return receipt(boundary, "unsafe", "unsafe", "unsafe");
  }
  try {
    if ((await realpath(parentPath)) !== parentPath) {
      return receipt(boundary, "unsafe", "unsafe", "unsafe");
    }
  } catch {
    return receipt(boundary, "unsafe", "unsafe", "unsafe");
  }

  let keyStat: fs.BigIntStats;
  try {
    keyStat = await lstat(keyPath, { bigint: true });
  } catch (error) {
    return isMissing(error)
      ? receipt(
          boundary,
          "not-provisioned",
          "present-current-euid-exact-0700-directory",
          "absent",
        )
      : receipt(boundary, "unsafe", "unsafe", "unsafe");
  }
  if (!keyIsSafe(keyStat, dependencies.effectiveUserId)) {
    return receipt(
      boundary,
      "unsafe",
      "present-current-euid-exact-0700-directory",
      "unsafe",
    );
  }
  try {
    if ((await realpath(keyPath)) !== keyPath) {
      return receipt(
        boundary,
        "unsafe",
        "present-current-euid-exact-0700-directory",
        "unsafe",
      );
    }
  } catch {
    return receipt(
      boundary,
      "unsafe",
      "present-current-euid-exact-0700-directory",
      "unsafe",
    );
  }
  return receipt(
    boundary,
    "ready",
    "present-current-euid-exact-0700-directory",
    "present-current-euid-exact-0600-regular-nlink-1-32-bytes",
  );
}

/** Test-only injected-home metadata probe. It still reads no key bytes. */
export function inspectFloodgateV7DeploymentKeyReadinessCoreForTests(
  dependenciesValue: FloodgateV7DeploymentKeyReadinessDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7DeploymentKeyReadinessReceipt<"test-only-injected-current-euid-home-metadata">
  >
> {
  if (arguments.length !== 1) {
    return rejected(
      new TypeError("test readiness probe accepts exactly one argument"),
    );
  }
  let dependencies: Readonly<FloodgateV7DeploymentKeyReadinessDependenciesForTests>;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return resolved(
      receipt(
        "test-only-injected-current-euid-home-metadata",
        "unsafe",
        "unsafe",
        "unsafe",
      ),
    );
  }
  return probe(dependencies, "test-only-injected-current-euid-home-metadata");
}

/** Fixed current-user metadata probe. It performs no key read or write. */
export function inspectFloodgateV7DeploymentKeyReadiness(): Promise<
  Readonly<
    FloodgateV7DeploymentKeyReadinessReceipt<"production-fixed-current-euid-userinfo-home-metadata">
  >
> {
  if (arguments.length !== 0 || getEffectiveUserId === null) {
    return resolved(
      receipt(
        "production-fixed-current-euid-userinfo-home-metadata",
        "unsafe",
        "unsafe",
        "unsafe",
      ),
    );
  }
  let dependencies: Readonly<FloodgateV7DeploymentKeyReadinessDependenciesForTests>;
  try {
    const effectiveUserId = getEffectiveUserId();
    const userInfo = getUserInfo();
    if (userInfo.uid !== effectiveUserId) {
      return resolved(
        receipt(
          "production-fixed-current-euid-userinfo-home-metadata",
          "unsafe",
          "unsafe",
          "unsafe",
        ),
      );
    }
    dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: userInfo.homedir,
    });
  } catch {
    return resolved(
      receipt(
        "production-fixed-current-euid-userinfo-home-metadata",
        "unsafe",
        "unsafe",
        "unsafe",
      ),
    );
  }
  return probe(
    dependencies,
    "production-fixed-current-euid-userinfo-home-metadata",
  );
}
