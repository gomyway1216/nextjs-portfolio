/**
 * Read-only control-plane boundary for one separately approved Floodgate v7
 * deployment-key instance record. The loader never reads key bytes and the
 * resulting opaque capability is single-use.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TextDecoder, types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
} from "./floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
} from "./floodgate-v7-deployment-key-instance-enrollment";

export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT =
  "shogi-floodgate-v7-approved-key-enrollment-control-plane-record-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS =
  "separately-reviewed-candidate-approved-and-pinned" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY =
  "canonical-candidate-bytes-digest-fixed-deployment-identity-and-public-instance-pinned-in-private-current-euid-record-no-key-material-signature-run-gate-checkpoint-runtime-training-live-or-strength-authority" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY =
  "trusted-separate-review-fixed-current-euid-private-0700-control-plane-parent-0600-record-and-current-js-realm-intrinsics-without-cryptographic-approval-signature-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD =
  "separate-human-review-and-fixed-private-record-persistence-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME =
  "approved-key-instance.json" as const;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES = 64 * 1024;
export const FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS =
  Object.freeze([
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-floodgate-v7-control-plane-v1",
  ] as const);

export type FloodgateV7ApprovedKeyEnrollmentExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-control-plane-record"
  | "test-only-injected-current-euid-home-control-plane-record";

interface DeploymentIdentity {
  readonly layout: "fixed-current-euid-userinfo-home-v1";
  readonly key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly owner_uid: number;
  readonly parent_identity: Readonly<{
    readonly dev: string;
    readonly ino: string;
  }>;
  readonly key_identity: Readonly<{
    readonly dev: string;
    readonly ino: string;
  }>;
  readonly key_instance_id: string;
  readonly key_instance_algorithm: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM;
}

export interface FloodgateV7ApprovedKeyEnrollmentRecord {
  readonly contract: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT;
  readonly status: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY;
  readonly approval: Readonly<{
    readonly method: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD;
    readonly approval_id: string;
    readonly approved_at_utc: string;
    readonly candidate_receipt: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
      readonly canonical_json: string;
    }>;
  }>;
  readonly key_deployment: Readonly<DeploymentIdentity>;
  readonly nonclaims: Readonly<{
    readonly key_material: false;
    readonly key_path: false;
    readonly root_key_hash: false;
    readonly approval_signature_or_mac: false;
    readonly run_authorization: false;
    readonly gate_authorization: false;
    readonly checkpoint: false;
    readonly runtime: false;
    readonly dataset_read: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

/**
 * Digest-bound operator input consumed by the create-only record installer.
 * This shape carries no authority by itself; the enrollment loader remains the
 * only boundary that can issue an opaque enrollment capability.
 */
export interface FloodgateV7ApprovedKeyEnrollmentInstallationInput {
  readonly approval_id: string;
  readonly approved_at_utc: string;
  readonly approved_candidate_sha256: string;
  readonly candidate_canonical_json: string;
}

export interface FloodgateV7ApprovedKeyEnrollmentCapability {
  readonly contract: "shogi-floodgate-v7-approved-key-enrollment-capability-v1";
  readonly status: "opaque-single-use-approved-key-enrollment-not-claimed";
  readonly claim_boundary: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY;
  readonly execution_boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary;
}

export interface FloodgateV7ApprovedKeyEnrollmentClaim {
  readonly execution_boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary;
  readonly record: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>;
  readonly candidate_receipt: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>;
  readonly approval: Readonly<{
    readonly method: typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD;
    readonly approval_id: string;
    readonly approved_at_utc: string;
  }>;
  readonly key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly key_instance_id: string;
  readonly deployment_identity: Readonly<{
    readonly layout: "fixed-current-euid-userinfo-home-v1";
    readonly owner_uid: number;
    readonly parent_dev: string;
    readonly parent_ino: string;
    readonly key_dev: string;
    readonly key_ino: string;
  }>;
}

export interface FloodgateV7ApprovedKeyEnrollmentDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly beforeFinalRevalidationForTests?: () => void | Promise<void>;
}

export class FloodgateV7ApprovedKeyEnrollmentError extends Error {
  readonly phase!:
    "capture" | "test-boundary" | "record-read" | "record-validation" | "claim";
  readonly capability_issued!: false;

  constructor(phase: FloodgateV7ApprovedKeyEnrollmentError["phase"]) {
    super(
      "Floodgate v7 approved key enrollment failed without issuing authority",
    );
    objectDefineProperty(this, "name", {
      value: "FloodgateV7ApprovedKeyEnrollmentError",
    });
    objectDefineProperty(this, "phase", { enumerable: true, value: phase });
    objectDefineProperty(this, "capability_issued", {
      enumerable: true,
      value: false,
    });
    objectDefineProperty(this, "stack", {
      value:
        "FloodgateV7ApprovedKeyEnrollmentError: approved key enrollment failed",
    });
    objectFreeze(this);
  }
}

type RecordValue = Readonly<FloodgateV7ApprovedKeyEnrollmentRecord>;
type CapturedDependencies = Readonly<{
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly beforeFinalRevalidationForTests:
    (() => void | Promise<void>) | undefined;
}>;
type StoredCapability = Readonly<{
  readonly boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary;
  readonly claim: Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
}>;

const NativeError = Error;
const NativeDate = Date;
const NativeBigInt = BigInt;
const NativeNumber = Number;
const NativePromise = Promise;
const NativeWeakMap = WeakMap;
const NativeWeakSet = WeakSet;
const capabilityClaims = new NativeWeakMap<object, StoredCapability>();
const pinnedEnrollmentPromises = new NativeWeakSet<object>();
const nativeWeakMapGet = WeakMap.prototype.get;
const nativeWeakMapSet = WeakMap.prototype.set;
const nativeWeakMapDelete = WeakMap.prototype.delete;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetHas = WeakSet.prototype.has;
const nativeReflectApply = Reflect.apply;
const nativeArrayIncludes = Array.prototype.includes;
const nativeArrayIsArray = Array.isArray;
const nativeDateParse = Date.parse;
const nativeDateToISOString = Date.prototype.toISOString;
const nativeCreateHash = createHash;
const nativeHashDigest = nativeCreateHash("sha256").digest;
const nativeHashUpdate = nativeCreateHash("sha256").update;
const nativePromiseThen = Promise.prototype.then;
const nativeRegExpExec = RegExp.prototype.exec;
const nativeStringEndsWith = String.prototype.endsWith;
const nativeStringIncludes = String.prototype.includes;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const typedArrayPrototype = objectGetPrototypeOf(Uint8Array.prototype);
const nativeTypedArrayBufferGetter = objectGetOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const nativeTypedArrayByteLengthGetter = objectGetOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const nativeTypedArrayByteOffsetGetter = objectGetOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get;
const nativeTypedArrayLengthGetter = objectGetOwnPropertyDescriptor(
  typedArrayPrototype,
  "length",
)?.get;
const nodeIsProxy = nodeUtilTypes.isProxy;
const numberIsNaN = Number.isNaN;
const numberIsSafeInteger = Number.isSafeInteger;
const promiseSpeciesSymbol = Symbol.species;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const bufferAlloc = Buffer.alloc.bind(Buffer);
const fatalUtf8Decoder = new TextDecoder("utf-8", {
  fatal: true,
  ignoreBOM: true,
});
const nativeTextDecode = TextDecoder.prototype.decode;
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathResolve = path.resolve.bind(path);
const pathSeparator = path.sep;
const realpathSync = fs.realpathSync.bind(fs);
const lstatSync = fs.lstatSync.bind(fs);
const openSync = fs.openSync.bind(fs);
const fstatSync = fs.fstatSync.bind(fs);
const readvSync = fs.readvSync.bind(fs);
const closeSync = fs.closeSync.bind(fs);
const getUserInfo = os.userInfo.bind(os);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const pinnedPromiseConstructorHolder = objectCreate(null) as object;
objectDefineProperty(pinnedPromiseConstructorHolder, promiseSpeciesSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: NativePromise,
});
objectFreeze(pinnedPromiseConstructorHolder);
const SHA256_RE = /^[0-9a-f]{64}$/;
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TYPE_MASK = NativeBigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = NativeBigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = NativeBigInt(fs.constants.S_IFREG);
const MODE_MASK = NativeBigInt(0o7777);
const HOME_OWNER_MODE = NativeBigInt(0o700);
const HOME_FORBIDDEN_MODE = NativeBigInt(0o7022);
const PARENT_OPEN_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const RECORD_OPEN_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;

function descriptorAt(
  descriptors: Record<string, PropertyDescriptor>,
  key: string,
): PropertyDescriptor | undefined {
  if (!objectHasOwn(descriptors, key)) return undefined;
  const mapEntry = objectGetOwnPropertyDescriptor(descriptors, key);
  if (mapEntry === undefined || !objectHasOwn(mapEntry, "value")) {
    throw new NativeError("descriptor map entry is not an own data property");
  }
  return mapEntry.value as PropertyDescriptor;
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const descriptorKeys = objectKeys(descriptors);
  for (let index = 0; index < descriptorKeys.length; index += 1) {
    const key = descriptorKeys[index];
    const descriptor = descriptorAt(descriptors, key);
    if (descriptor === undefined || !objectHasOwn(descriptor, "value")) {
      throw new NativeError(
        "approved enrollment records require data properties",
      );
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

function pinEnrollmentPromise<T>(promise: Promise<T>): Promise<T> {
  if (
    nativeReflectApply(nativeWeakSetHas, pinnedEnrollmentPromises, [promise])
  ) {
    return promise;
  }
  const constructorDescriptor = objectGetOwnPropertyDescriptor(
    promise,
    "constructor",
  );
  if (
    constructorDescriptor !== undefined &&
    constructorDescriptor.configurable !== true
  ) {
    throw new NativeError("enrollment Promise constructor cannot be pinned");
  }
  objectDefineProperty(promise, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: pinnedPromiseConstructorHolder,
  });
  const thenDescriptor = objectGetOwnPropertyDescriptor(promise, "then");
  if (thenDescriptor !== undefined && thenDescriptor.configurable !== true) {
    throw new NativeError("enrollment Promise then cannot be pinned");
  }
  const pinnedThen = objectFreeze(function (
    onFulfilled?: (settled: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    const derived = nativeReflectApply(nativePromiseThen, promise, [
      onFulfilled,
      onRejected,
    ]) as Promise<unknown>;
    return pinEnrollmentPromise(derived);
  });
  objectDefineProperty(promise, "then", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: pinnedThen,
  });
  nativeReflectApply(nativeWeakSetAdd, pinnedEnrollmentPromises, [promise]);
  return promise;
}

function rejected<T>(error: unknown): Promise<T> {
  return pinEnrollmentPromise(
    new NativePromise((_resolve, reject) => reject(error)),
  );
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    nativeArrayIsArray(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError(`${label} must be an exact plain record`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new NativeError(`${label} has an unexpected key count`);
  }
  const output: Record<string, unknown> = objectCreate(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptorAt(descriptors, key);
    if (
      descriptor === undefined ||
      !objectHasOwn(descriptor, "value") ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(
        `${label}.${key} must be an enumerable data property`,
      );
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value,
    });
  }
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (
      typeof key !== "string" ||
      !nativeReflectApply(nativeArrayIncludes, keys, [key])
    ) {
      throw new NativeError(`${label} has an unknown key`);
    }
  }
  return objectFreeze(output);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new NativeError(`${label} differs`);
}

function requiredString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 65_536
  ) {
    throw new NativeError(`${label} must be a bounded string`);
  }
  return value;
}

function hex64(value: unknown, label: string): string {
  const output = requiredString(value, label);
  if (nativeReflectApply(nativeRegExpExec, SHA256_RE, [output]) === null)
    throw new NativeError(
      `${label} must be 64 lowercase hexadecimal characters`,
    );
  return output;
}

function decimal(value: unknown, label: string): string {
  const output = requiredString(value, label);
  if (nativeReflectApply(nativeRegExpExec, DECIMAL_RE, [output]) === null)
    throw new NativeError(`${label} must be canonical decimal`);
  return output;
}

function requiredUid(value: unknown, label: string): number {
  if (!numberIsSafeInteger(value) || (value as number) < 0) {
    throw new NativeError(`${label} must be a nonnegative safe UID`);
  }
  return value as number;
}

function sha256(bytes: Uint8Array): string {
  const hash = nativeCreateHash("sha256");
  nativeReflectApply(nativeHashUpdate, hash, [bytes]);
  return nativeReflectApply(nativeHashDigest, hash, ["hex"]) as string;
}

function sha256Utf8(value: string): string {
  const hash = nativeCreateHash("sha256");
  nativeReflectApply(nativeHashUpdate, hash, [value, "utf8"]);
  return nativeReflectApply(nativeHashDigest, hash, ["hex"]) as string;
}

function typedArrayMetadata(bytes: Uint8Array): Readonly<{
  buffer: ArrayBufferLike;
  byteLength: number;
  byteOffset: number;
  length: number;
}> {
  if (
    nativeTypedArrayBufferGetter === undefined ||
    nativeTypedArrayByteLengthGetter === undefined ||
    nativeTypedArrayByteOffsetGetter === undefined ||
    nativeTypedArrayLengthGetter === undefined
  ) {
    throw new NativeError("native typed-array metadata is unavailable");
  }
  return {
    buffer: nativeReflectApply(
      nativeTypedArrayBufferGetter,
      bytes,
      [],
    ) as ArrayBufferLike,
    byteLength: nativeReflectApply(
      nativeTypedArrayByteLengthGetter,
      bytes,
      [],
    ) as number,
    byteOffset: nativeReflectApply(
      nativeTypedArrayByteOffsetGetter,
      bytes,
      [],
    ) as number,
    length: nativeReflectApply(
      nativeTypedArrayLengthGetter,
      bytes,
      [],
    ) as number,
  };
}

const IDENTITY_KEYS = ["dev", "ino"] as const;
const DEPLOYMENT_KEYS = [
  "key_id",
  "key_identity",
  "key_instance_algorithm",
  "key_instance_id",
  "layout",
  "owner_uid",
  "parent_identity",
] as const;
const CANDIDATE_DEPLOYMENT_KEYS = [
  "held_descriptors_revalidated",
  "key_bytes",
  "key_id",
  "key_identity",
  "key_instance_algorithm",
  "key_instance_id",
  "key_mode",
  "key_nlink",
  "layout",
  "owner_uid",
  "parent_identity",
  "parent_mode",
] as const;
const CANDIDATE_NONCLAIM_KEYS = [
  "authorization_mac",
  "checkpoint",
  "checkpoint_key_capability",
  "connector_execution",
  "control_plane_approval",
  "dataset_read",
  "key_created_or_written",
  "key_material_disclosed",
  "key_path_disclosed",
  "live_evaluation_activation",
  "playing_strength",
  "record_persisted",
  "root_key_hash_disclosed",
  "run_authorization",
  "runtime",
  "stage_authorization",
  "teacher_label",
  "training",
  "weight",
] as const;
const RECORD_NONCLAIM_KEYS = [
  "approval_signature_or_mac",
  "checkpoint",
  "dataset_read",
  "gate_authorization",
  "key_material",
  "key_path",
  "live_evaluation_activation",
  "match",
  "playing_strength",
  "root_key_hash",
  "run_authorization",
  "runtime",
  "teacher_label",
  "training",
  "weight",
] as const;

function capturedRecordNonclaims(): Readonly<
  FloodgateV7ApprovedKeyEnrollmentRecord["nonclaims"]
> {
  const output = objectCreate(
    null,
  ) as FloodgateV7ApprovedKeyEnrollmentRecord["nonclaims"];
  for (let index = 0; index < RECORD_NONCLAIM_KEYS.length; index += 1) {
    const key = RECORD_NONCLAIM_KEYS[index];
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: false,
    });
  }
  return objectFreeze(output);
}

function identity(
  value: unknown,
  label: string,
): Readonly<{ dev: string; ino: string }> {
  const candidate = exactRecord(value, IDENTITY_KEYS, label);
  return frozenRecord({
    dev: decimal(candidate.dev, `${label}.dev`),
    ino: decimal(candidate.ino, `${label}.ino`),
  });
}

function candidateReceipt(
  textValue: unknown,
  boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
  expectedUid: number,
): Readonly<DeploymentIdentity> {
  const text = requiredString(textValue, "candidate receipt canonical_json");
  if (
    !nativeReflectApply(nativeStringEndsWith, text, ["\n"]) ||
    nativeReflectApply(nativeStringIncludes, text, ["\r"])
  ) {
    throw new NativeError("candidate receipt must be one canonical LF record");
  }
  let parsed: unknown;
  try {
    parsed = jsonParse(text);
  } catch {
    throw new NativeError("candidate receipt is not JSON");
  }
  const candidate = exactRecord(
    parsed,
    [
      "algorithm",
      "claim_boundary",
      "contract",
      "execution_boundary",
      "key_deployment",
      "nonclaims",
      "status",
      "test_boundary",
      "trust_boundary",
    ],
    "candidate receipt",
  );
  exact(
    candidate.contract,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    "candidate contract",
  );
  exact(
    candidate.status,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    "candidate status",
  );
  exact(
    candidate.claim_boundary,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    "candidate claim boundary",
  );
  exact(
    candidate.trust_boundary,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    "candidate trust boundary",
  );
  exact(
    candidate.algorithm,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    "candidate algorithm",
  );
  const production =
    boundary ===
    "production-fixed-current-euid-userinfo-home-control-plane-record";
  const candidateExecutionBoundary = production
    ? ("production-fixed-current-euid-userinfo-home-key-instance-inspection" as const)
    : ("test-only-injected-current-euid-home-key-instance-inspection" as const);
  exact(
    candidate.execution_boundary,
    candidateExecutionBoundary,
    "candidate execution boundary",
  );
  let capturedTestBoundary: Readonly<Record<string, boolean>> | null = null;
  if (production) {
    exact(candidate.test_boundary, null, "candidate test boundary");
  } else {
    const testBoundary = exactRecord(
      candidate.test_boundary,
      [
        "current_effective_uid_required",
        "production_home_alias_rejected",
        "production_home_origin",
        "test_hook_may_observe_key_copy",
      ],
      "candidate test boundary",
    );
    exact(
      testBoundary.production_home_origin,
      false,
      "candidate production home origin",
    );
    exact(
      testBoundary.production_home_alias_rejected,
      true,
      "candidate alias guard",
    );
    exact(
      testBoundary.current_effective_uid_required,
      true,
      "candidate UID guard",
    );
    exact(
      testBoundary.test_hook_may_observe_key_copy,
      true,
      "candidate test hook",
    );
    capturedTestBoundary = frozenRecord({
      production_home_origin: false,
      production_home_alias_rejected: true,
      current_effective_uid_required: true,
      test_hook_may_observe_key_copy: true,
    });
  }
  const candidateNonclaims = exactRecord(
    candidate.nonclaims,
    CANDIDATE_NONCLAIM_KEYS,
    "candidate nonclaims",
  );
  for (let index = 0; index < CANDIDATE_NONCLAIM_KEYS.length; index += 1) {
    const key = CANDIDATE_NONCLAIM_KEYS[index];
    exact(candidateNonclaims[key], false, `candidate nonclaims.${key}`);
  }
  const deployment = exactRecord(
    candidate.key_deployment,
    CANDIDATE_DEPLOYMENT_KEYS,
    "candidate key deployment",
  );
  exact(
    deployment.layout,
    "fixed-current-euid-userinfo-home-v1",
    "candidate layout",
  );
  exact(deployment.key_id, FLOODGATE_V7_DEPLOYMENT_KEY_ID, "candidate key id");
  const ownerUid = requiredUid(deployment.owner_uid, "candidate owner UID");
  exact(ownerUid, expectedUid, "candidate owner UID");
  exact(deployment.parent_mode, "0700", "candidate parent mode");
  exact(deployment.key_mode, "0600", "candidate key mode");
  exact(
    deployment.key_bytes,
    FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
    "candidate key bytes",
  );
  exact(deployment.key_nlink, 1, "candidate key nlink");
  exact(
    deployment.held_descriptors_revalidated,
    true,
    "candidate revalidation",
  );
  exact(
    deployment.key_instance_algorithm,
    FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
    "candidate instance algorithm",
  );
  const output = frozenRecord({
    layout: "fixed-current-euid-userinfo-home-v1" as const,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    owner_uid: ownerUid,
    parent_identity: identity(
      deployment.parent_identity,
      "candidate parent identity",
    ),
    key_identity: identity(deployment.key_identity, "candidate key identity"),
    key_instance_id: hex64(
      deployment.key_instance_id,
      "candidate key instance id",
    ),
    key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
  });
  const canonicalCandidate = frozenRecord({
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    claim_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    execution_boundary: candidateExecutionBoundary,
    algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    key_deployment: frozenRecord({
      layout: output.layout,
      key_id: output.key_id,
      owner_uid: output.owner_uid,
      parent_mode: "0700" as const,
      key_mode: "0600" as const,
      key_bytes: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
      key_nlink: 1 as const,
      parent_identity: output.parent_identity,
      key_identity: output.key_identity,
      key_instance_id: output.key_instance_id,
      key_instance_algorithm: output.key_instance_algorithm,
      held_descriptors_revalidated: true as const,
    }),
    test_boundary: capturedTestBoundary,
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
  if (`${jsonStringify(canonicalCandidate)}\n` !== text) {
    throw new NativeError("candidate receipt bytes are not canonical");
  }
  return output;
}

function captureRecord(
  value: unknown,
  boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
  expectedUid: number,
): RecordValue {
  const record = exactRecord(
    value,
    [
      "approval",
      "claim_boundary",
      "contract",
      "key_deployment",
      "nonclaims",
      "status",
      "trust_boundary",
    ],
    "approved enrollment record",
  );
  exact(
    record.contract,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    "record contract",
  );
  exact(
    record.status,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    "record status",
  );
  exact(
    record.claim_boundary,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    "record claim boundary",
  );
  exact(
    record.trust_boundary,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    "record trust boundary",
  );
  const approval = exactRecord(
    record.approval,
    ["approval_id", "approved_at_utc", "candidate_receipt", "method"],
    "record approval",
  );
  exact(
    approval.method,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
    "approval method",
  );
  const approvalId = hex64(approval.approval_id, "approval id");
  const approvedAtUtc = requiredString(
    approval.approved_at_utc,
    "approval timestamp",
  );
  if (
    nativeReflectApply(nativeRegExpExec, UTC_RE, [approvedAtUtc]) === null ||
    numberIsNaN(
      nativeReflectApply(nativeDateParse, NativeDate, [approvedAtUtc]),
    ) ||
    nativeReflectApply(
      nativeDateToISOString,
      new NativeDate(approvedAtUtc),
      [],
    ) !== approvedAtUtc
  ) {
    throw new NativeError(
      "approval timestamp must be exact RFC3339 UTC milliseconds",
    );
  }
  const candidateEnvelope = exactRecord(
    approval.candidate_receipt,
    ["bytes", "canonical_json", "sha256"],
    "candidate receipt envelope",
  );
  const canonicalJson = requiredString(
    candidateEnvelope.canonical_json,
    "candidate receipt canonical_json",
  );
  const candidateBytes = bufferByteLength(canonicalJson, "utf8");
  if (
    !numberIsSafeInteger(candidateEnvelope.bytes) ||
    candidateEnvelope.bytes !== candidateBytes
  ) {
    throw new NativeError("candidate receipt byte count differs");
  }
  const candidateSha256 = hex64(
    candidateEnvelope.sha256,
    "candidate receipt sha256",
  );
  if (sha256Utf8(canonicalJson) !== candidateSha256) {
    throw new NativeError("candidate receipt digest differs");
  }
  const candidateDeployment = candidateReceipt(
    canonicalJson,
    boundary,
    expectedUid,
  );
  const deployment = exactRecord(
    record.key_deployment,
    DEPLOYMENT_KEYS,
    "record key deployment",
  );
  const capturedDeployment = frozenRecord({
    layout: "fixed-current-euid-userinfo-home-v1" as const,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    owner_uid: requiredUid(deployment.owner_uid, "record owner UID"),
    parent_identity: identity(
      deployment.parent_identity,
      "record parent identity",
    ),
    key_identity: identity(deployment.key_identity, "record key identity"),
    key_instance_id: hex64(
      deployment.key_instance_id,
      "record key instance id",
    ),
    key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
  });
  exact(deployment.layout, capturedDeployment.layout, "record layout");
  exact(deployment.key_id, capturedDeployment.key_id, "record key id");
  exact(
    deployment.key_instance_algorithm,
    capturedDeployment.key_instance_algorithm,
    "record instance algorithm",
  );
  if (
    jsonStringify(capturedDeployment) !== jsonStringify(candidateDeployment)
  ) {
    throw new NativeError("approved deployment differs from candidate");
  }
  const nonclaims = exactRecord(
    record.nonclaims,
    RECORD_NONCLAIM_KEYS,
    "record nonclaims",
  );
  for (let index = 0; index < RECORD_NONCLAIM_KEYS.length; index += 1) {
    const key = RECORD_NONCLAIM_KEYS[index];
    exact(nonclaims[key], false, `record nonclaims.${key}`);
  }
  return frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    approval: frozenRecord({
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: approvalId,
      approved_at_utc: approvedAtUtc,
      candidate_receipt: frozenRecord({
        bytes: candidateBytes,
        sha256: candidateSha256,
        canonical_json: canonicalJson,
      }),
    }),
    key_deployment: capturedDeployment,
    nonclaims: capturedRecordNonclaims(),
  });
}

/**
 * Pure canonical serializer shared with the create-only installer. It validates
 * the same candidate and record grammar as the loader but neither touches the
 * filesystem nor issues an enrollment capability.
 */
export function serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore(
  inputValue: FloodgateV7ApprovedKeyEnrollmentInstallationInput,
  expectedUidValue: number,
  boundaryValue: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
): string {
  if (arguments.length !== 3) {
    throw new NativeError("installation serialization requires three inputs");
  }
  const input = exactRecord(
    inputValue,
    [
      "approval_id",
      "approved_at_utc",
      "approved_candidate_sha256",
      "candidate_canonical_json",
    ],
    "approved enrollment installation input",
  );
  const expectedUid = requiredUid(expectedUidValue, "installation UID");
  if (
    boundaryValue !==
      "production-fixed-current-euid-userinfo-home-control-plane-record" &&
    boundaryValue !==
      "test-only-injected-current-euid-home-control-plane-record"
  ) {
    throw new NativeError("installation record boundary differs");
  }
  const approvalId = hex64(input.approval_id, "approval id");
  const approvedAtUtc = requiredString(
    input.approved_at_utc,
    "approval timestamp",
  );
  if (
    nativeReflectApply(nativeRegExpExec, UTC_RE, [approvedAtUtc]) === null ||
    numberIsNaN(
      nativeReflectApply(nativeDateParse, NativeDate, [approvedAtUtc]),
    ) ||
    nativeReflectApply(
      nativeDateToISOString,
      new NativeDate(approvedAtUtc),
      [],
    ) !== approvedAtUtc
  ) {
    throw new NativeError(
      "approval timestamp must be exact RFC3339 UTC milliseconds",
    );
  }
  const canonicalJson = requiredString(
    input.candidate_canonical_json,
    "candidate receipt canonical_json",
  );
  const candidateBytes = bufferByteLength(canonicalJson, "utf8");
  const approvedCandidateSha256 = hex64(
    input.approved_candidate_sha256,
    "approved candidate sha256",
  );
  if (sha256Utf8(canonicalJson) !== approvedCandidateSha256) {
    throw new NativeError("approved candidate digest differs");
  }
  const deployment = candidateReceipt(
    canonicalJson,
    boundaryValue,
    expectedUid,
  );
  const candidateRecord = frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    approval: frozenRecord({
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: approvalId,
      approved_at_utc: approvedAtUtc,
      candidate_receipt: frozenRecord({
        bytes: candidateBytes,
        sha256: approvedCandidateSha256,
        canonical_json: canonicalJson,
      }),
    }),
    key_deployment: deployment,
    nonclaims: capturedRecordNonclaims(),
  });
  const record = captureRecord(candidateRecord, boundaryValue, expectedUid);
  const canonicalRecord = `${jsonStringify(record)}\n`;
  if (
    bufferByteLength(canonicalRecord, "utf8") >
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES
  ) {
    throw new NativeError("approved enrollment record exceeds size bound");
  }
  return canonicalRecord;
}

function capabilityFromRecord(
  record: RecordValue,
  boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
  recordBytes: number,
  recordSha256: string,
): Readonly<FloodgateV7ApprovedKeyEnrollmentCapability> {
  const capability = frozenRecord({
    contract:
      "shogi-floodgate-v7-approved-key-enrollment-capability-v1" as const,
    status: "opaque-single-use-approved-key-enrollment-not-claimed" as const,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    execution_boundary: boundary,
  });
  const deployment = record.key_deployment;
  const claim = frozenRecord({
    execution_boundary: boundary,
    record: frozenRecord({ bytes: recordBytes, sha256: recordSha256 }),
    candidate_receipt: frozenRecord({
      bytes: record.approval.candidate_receipt.bytes,
      sha256: record.approval.candidate_receipt.sha256,
    }),
    approval: frozenRecord({
      method: record.approval.method,
      approval_id: record.approval.approval_id,
      approved_at_utc: record.approval.approved_at_utc,
    }),
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    key_instance_id: deployment.key_instance_id,
    deployment_identity: frozenRecord({
      layout: deployment.layout,
      owner_uid: deployment.owner_uid,
      parent_dev: deployment.parent_identity.dev,
      parent_ino: deployment.parent_identity.ino,
      key_dev: deployment.key_identity.dev,
      key_ino: deployment.key_identity.ino,
    }),
  });
  nativeReflectApply(nativeWeakMapSet, capabilityClaims, [
    capability,
    frozenRecord({ boundary, claim }),
  ]);
  return capability;
}

function parseRecordBytes(
  bytes: Uint8Array,
  boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
  expectedUid: number,
): Readonly<FloodgateV7ApprovedKeyEnrollmentCapability> {
  const metadata = typedArrayMetadata(bytes);
  const recordBytes = metadata.byteLength;
  if (
    metadata.length !== recordBytes ||
    recordBytes < 2 ||
    recordBytes > FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES
  ) {
    throw new NativeError("approved enrollment record size is outside bounds");
  }
  objectDefineProperty(bytes, "buffer", {
    configurable: false,
    enumerable: false,
    value: metadata.buffer,
    writable: false,
  });
  objectDefineProperty(bytes, "byteLength", {
    configurable: false,
    enumerable: false,
    value: recordBytes,
    writable: false,
  });
  objectDefineProperty(bytes, "byteOffset", {
    configurable: false,
    enumerable: false,
    value: metadata.byteOffset,
    writable: false,
  });
  objectDefineProperty(bytes, "length", {
    configurable: false,
    enumerable: false,
    value: metadata.length,
    writable: false,
  });
  let text: string;
  try {
    text = nativeReflectApply(nativeTextDecode, fatalUtf8Decoder, [bytes]);
  } catch {
    throw new NativeError("approved enrollment record is not valid UTF-8");
  }
  if (
    !nativeReflectApply(nativeStringEndsWith, text, ["\n"]) ||
    nativeReflectApply(nativeStringIncludes, text, ["\r"])
  ) {
    throw new NativeError(
      "approved enrollment record is not canonical UTF-8 JSONL",
    );
  }
  let parsed: unknown;
  try {
    parsed = jsonParse(text);
  } catch {
    throw new NativeError("approved enrollment record is not JSON");
  }
  const record = captureRecord(parsed, boundary, expectedUid);
  const canonical = `${jsonStringify(record)}\n`;
  if (canonical !== text)
    throw new NativeError("approved enrollment record bytes are not canonical");
  return capabilityFromRecord(record, boundary, recordBytes, sha256(bytes));
}

function sameIdentity(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameSnapshot(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    sameIdentity(left, right) &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function safeParent(stat: fs.BigIntStats, effectiveUserId: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    (stat.mode & MODE_MASK) === NativeBigInt(0o700) &&
    stat.uid === NativeBigInt(effectiveUserId)
  );
}

function safeHome(stat: fs.BigIntStats, effectiveUserId: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    (stat.mode & HOME_OWNER_MODE) === HOME_OWNER_MODE &&
    (stat.mode & HOME_FORBIDDEN_MODE) === NativeBigInt(0) &&
    stat.uid === NativeBigInt(effectiveUserId)
  );
}

function appendFixedPathComponent(parent: string, component: string): string {
  return parent === pathSeparator
    ? `${parent}${component}`
    : `${parent}${pathSeparator}${component}`;
}

function safeRecord(stat: fs.BigIntStats, effectiveUserId: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === REGULAR_TYPE &&
    (stat.mode & MODE_MASK) === NativeBigInt(0o600) &&
    stat.uid === NativeBigInt(effectiveUserId) &&
    stat.nlink === NativeBigInt(1) &&
    stat.size > NativeBigInt(1) &&
    stat.size <=
      NativeBigInt(FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_MAX_RECORD_BYTES)
  );
}

function captureDependencies(
  value: FloodgateV7ApprovedKeyEnrollmentDependenciesForTests,
): CapturedDependencies {
  if (value === null || typeof value !== "object" || nodeIsProxy(value)) {
    throw new NativeError("approved enrollment dependencies must be plain");
  }
  const dependencyDescriptors = objectGetOwnPropertyDescriptors(value);
  const hasHook =
    descriptorAt(dependencyDescriptors, "beforeFinalRevalidationForTests") !==
    undefined;
  const candidate = exactRecord(
    value,
    hasHook
      ? ["beforeFinalRevalidationForTests", "effectiveUserId", "homeDirectory"]
      : ["effectiveUserId", "homeDirectory"],
    "approved enrollment dependencies",
  );
  const effectiveUserId = requiredUid(
    candidate.effectiveUserId,
    "effective UID",
  );
  const homeDirectory = requiredString(
    candidate.homeDirectory,
    "home directory",
  );
  if (
    !pathIsAbsolute(homeDirectory) ||
    pathResolve(homeDirectory) !== homeDirectory
  ) {
    throw new NativeError("home directory must be canonical absolute");
  }
  const beforeFinalRevalidationForTests = hasHook
    ? candidate.beforeFinalRevalidationForTests
    : undefined;
  if (
    beforeFinalRevalidationForTests !== undefined &&
    (typeof beforeFinalRevalidationForTests !== "function" ||
      nodeIsProxy(beforeFinalRevalidationForTests))
  ) {
    throw new NativeError("final revalidation hook must be a function");
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    beforeFinalRevalidationForTests: beforeFinalRevalidationForTests as
      (() => void | Promise<void>) | undefined,
  });
}

function assertTestHomeIsSeparate(dependencies: CapturedDependencies): void {
  if (
    getEffectiveUserId === null ||
    getEffectiveUserId() !== dependencies.effectiveUserId
  ) {
    throw new NativeError("test enrollment requires current effective UID");
  }
  const userInfo = getUserInfo();
  if (userInfo.uid !== dependencies.effectiveUserId) {
    throw new NativeError("production user-info UID differs");
  }
  const productionHome = pathResolve(userInfo.homedir);
  if (
    dependencies.homeDirectory === productionHome ||
    realpathSync(dependencies.homeDirectory) === realpathSync(productionHome)
  ) {
    throw new NativeError("test enrollment home aliases production home");
  }
  const testStat = lstatSync(dependencies.homeDirectory, { bigint: true });
  const productionStat = lstatSync(productionHome, { bigint: true });
  if (sameIdentity(testStat, productionStat)) {
    throw new NativeError("test enrollment home has production identity");
  }
}

async function readFixedRecord(
  dependencies: CapturedDependencies,
  boundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
): Promise<Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>> {
  const managedDirectoryPaths: string[] = [];
  const managedDirectoryDescriptors: number[] = [];
  const managedDirectorySnapshots: fs.BigIntStats[] = [];
  let parentPath = dependencies.homeDirectory;
  for (
    let index = 0;
    index <
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length;
    index += 1
  ) {
    parentPath = appendFixedPathComponent(
      parentPath,
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS[index],
    );
    objectDefineProperty(managedDirectoryPaths, index, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: parentPath,
    });
  }
  const recordPath = appendFixedPathComponent(
    parentPath,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  );
  let homeDescriptor: number | undefined;
  let recordDescriptor: number | undefined;
  let result: Readonly<FloodgateV7ApprovedKeyEnrollmentCapability> | undefined;
  let failed = false;
  let failurePhase: FloodgateV7ApprovedKeyEnrollmentError["phase"] =
    "record-read";
  try {
    const homeReal = realpathSync(dependencies.homeDirectory);
    const homeNamed = lstatSync(dependencies.homeDirectory, { bigint: true });
    if (
      homeReal !== dependencies.homeDirectory ||
      !safeHome(homeNamed, dependencies.effectiveUserId)
    ) {
      throw new NativeError("home directory is not canonical");
    }
    homeDescriptor = openSync(dependencies.homeDirectory, PARENT_OPEN_FLAGS);
    const homeHeld = fstatSync(homeDescriptor, { bigint: true });
    const homeNamedAfterOpen = lstatSync(dependencies.homeDirectory, {
      bigint: true,
    });
    if (
      !sameSnapshot(homeHeld, homeNamed) ||
      !sameSnapshot(homeNamedAfterOpen, homeNamed) ||
      !safeHome(homeHeld, dependencies.effectiveUserId) ||
      !safeHome(homeNamedAfterOpen, dependencies.effectiveUserId) ||
      realpathSync(dependencies.homeDirectory) !== dependencies.homeDirectory
    ) {
      throw new NativeError("home directory identity changed");
    }

    for (let index = 0; index < managedDirectoryPaths.length; index += 1) {
      const managedPath = managedDirectoryPaths[index];
      if (managedPath === undefined) {
        throw new NativeError("managed directory path is unavailable");
      }
      const managedNamed = lstatSync(managedPath, { bigint: true });
      if (
        !safeParent(managedNamed, dependencies.effectiveUserId) ||
        realpathSync(managedPath) !== managedPath
      ) {
        throw new NativeError("approved enrollment namespace is unsafe");
      }
      const managedDescriptor = openSync(managedPath, PARENT_OPEN_FLAGS);
      objectDefineProperty(managedDirectoryDescriptors, index, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: managedDescriptor,
      });
      const managedHeld = fstatSync(managedDescriptor, { bigint: true });
      const managedNamedAfterOpen = lstatSync(managedPath, { bigint: true });
      if (
        !sameSnapshot(managedHeld, managedNamed) ||
        !sameSnapshot(managedNamedAfterOpen, managedNamed) ||
        !safeParent(managedHeld, dependencies.effectiveUserId) ||
        !safeParent(managedNamedAfterOpen, dependencies.effectiveUserId) ||
        realpathSync(managedPath) !== managedPath
      ) {
        throw new NativeError("approved enrollment held identity differs");
      }
      objectDefineProperty(managedDirectorySnapshots, index, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: managedNamed,
      });
    }

    const parentNamed =
      managedDirectorySnapshots[managedDirectorySnapshots.length - 1];
    if (parentNamed === undefined) {
      throw new NativeError("approved enrollment parent is unavailable");
    }
    const recordNamed = lstatSync(recordPath, { bigint: true });
    if (
      !safeRecord(recordNamed, dependencies.effectiveUserId) ||
      realpathSync(recordPath) !== recordPath
    ) {
      throw new NativeError("approved enrollment namespace is unsafe");
    }
    recordDescriptor = openSync(recordPath, RECORD_OPEN_FLAGS);
    const recordHeld = fstatSync(recordDescriptor, { bigint: true });
    if (
      !sameSnapshot(recordHeld, recordNamed) ||
      !safeRecord(recordHeld, dependencies.effectiveUserId)
    ) {
      throw new NativeError("approved enrollment held identity differs");
    }
    const length = NativeNumber(recordHeld.size);
    const bytes = bufferAlloc(length);
    if (readvSync(recordDescriptor, [bytes], 0) !== length) {
      throw new NativeError("approved enrollment bounded read was incomplete");
    }
    const extra = bufferAlloc(1);
    if (readvSync(recordDescriptor, [extra], length) !== 0) {
      throw new NativeError("approved enrollment record grew during read");
    }
    if (dependencies.beforeFinalRevalidationForTests !== undefined) {
      const revalidation = dependencies.beforeFinalRevalidationForTests();
      if (revalidation !== undefined) {
        await pinEnrollmentPromise(revalidation);
      }
    }
    const homeRealAfter = realpathSync(dependencies.homeDirectory);
    const recordRealAfter = realpathSync(recordPath);
    const homeNamedAfter = lstatSync(dependencies.homeDirectory, {
      bigint: true,
    });
    const homeHeldAfter = fstatSync(homeDescriptor, { bigint: true });
    const recordNamedAfter = lstatSync(recordPath, { bigint: true });
    const recordHeldAfter = fstatSync(recordDescriptor, { bigint: true });
    if (
      homeRealAfter !== dependencies.homeDirectory ||
      recordRealAfter !== recordPath ||
      !sameSnapshot(homeNamedAfter, homeNamed) ||
      !sameSnapshot(homeHeldAfter, homeNamed) ||
      !sameSnapshot(recordNamedAfter, recordNamed) ||
      !sameSnapshot(recordHeldAfter, recordNamed) ||
      !safeHome(homeNamedAfter, dependencies.effectiveUserId) ||
      !safeHome(homeHeldAfter, dependencies.effectiveUserId) ||
      !safeRecord(recordNamedAfter, dependencies.effectiveUserId)
    ) {
      throw new NativeError("approved enrollment identity changed during read");
    }
    for (let index = 0; index < managedDirectoryPaths.length; index += 1) {
      const managedPath = managedDirectoryPaths[index];
      const managedDescriptor = managedDirectoryDescriptors[index];
      const managedBefore = managedDirectorySnapshots[index];
      if (
        managedPath === undefined ||
        managedDescriptor === undefined ||
        managedBefore === undefined
      ) {
        throw new NativeError("managed directory reference is unavailable");
      }
      const managedNamedAfter = lstatSync(managedPath, { bigint: true });
      const managedHeldAfter = fstatSync(managedDescriptor, { bigint: true });
      if (
        !sameSnapshot(managedNamedAfter, managedBefore) ||
        !sameSnapshot(managedHeldAfter, managedBefore) ||
        !safeParent(managedNamedAfter, dependencies.effectiveUserId) ||
        !safeParent(managedHeldAfter, dependencies.effectiveUserId) ||
        realpathSync(managedPath) !== managedPath
      ) {
        throw new NativeError(
          "approved enrollment managed identity changed during read",
        );
      }
    }
    failurePhase = "record-validation";
    result = parseRecordBytes(bytes, boundary, dependencies.effectiveUserId);
  } catch {
    failed = true;
  } finally {
    try {
      if (recordDescriptor !== undefined) {
        closeSync(recordDescriptor);
      }
    } catch {
      failed = true;
      failurePhase = "record-read";
    }
    for (
      let index = managedDirectoryDescriptors.length - 1;
      index >= 0;
      index -= 1
    ) {
      try {
        const descriptor = managedDirectoryDescriptors[index];
        if (descriptor !== undefined) closeSync(descriptor);
      } catch {
        failed = true;
        failurePhase = "record-read";
      }
    }
    try {
      if (homeDescriptor !== undefined) closeSync(homeDescriptor);
    } catch {
      failed = true;
      failurePhase = "record-read";
    }
  }
  if (failed || result === undefined) {
    throw new FloodgateV7ApprovedKeyEnrollmentError(failurePhase);
  }
  return result;
}

/** Test-only validator/factory. It accepts only a test-boundary candidate. */
export function createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
  recordValue: FloodgateV7ApprovedKeyEnrollmentRecord,
): Readonly<FloodgateV7ApprovedKeyEnrollmentCapability> {
  if (arguments.length !== 1) {
    throw new FloodgateV7ApprovedKeyEnrollmentError("capture");
  }
  try {
    const outer = exactRecord(
      recordValue,
      [
        "approval",
        "claim_boundary",
        "contract",
        "key_deployment",
        "nonclaims",
        "status",
        "trust_boundary",
      ],
      "approved enrollment record",
    );
    const deployment = exactRecord(
      outer.key_deployment,
      DEPLOYMENT_KEYS,
      "record key deployment",
    );
    const record = captureRecord(
      recordValue,
      "test-only-injected-current-euid-home-control-plane-record",
      requiredUid(deployment.owner_uid, "record owner UID"),
    );
    const bytes = bufferFrom(`${jsonStringify(record)}\n`, "utf8");
    return parseRecordBytes(
      bytes,
      "test-only-injected-current-euid-home-control-plane-record",
      requiredUid(deployment.owner_uid, "record owner UID"),
    );
  } catch {
    throw new FloodgateV7ApprovedKeyEnrollmentError("record-validation");
  }
}

/** Temporary-home filesystem loader. It rejects the actual user-info home. */
async function loadTestRecord(
  dependencies: CapturedDependencies,
): Promise<Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>> {
  try {
    assertTestHomeIsSeparate(dependencies);
  } catch {
    throw new FloodgateV7ApprovedKeyEnrollmentError("test-boundary");
  }
  return await pinEnrollmentPromise(
    readFixedRecord(
      dependencies,
      "test-only-injected-current-euid-home-control-plane-record",
    ),
  );
}

export function loadFloodgateV7ApprovedKeyEnrollmentCoreForTests(
  dependenciesValue: FloodgateV7ApprovedKeyEnrollmentDependenciesForTests,
): Promise<Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>> {
  if (arguments.length !== 1) {
    return rejected(new FloodgateV7ApprovedKeyEnrollmentError("capture"));
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(new FloodgateV7ApprovedKeyEnrollmentError("capture"));
  }
  return pinEnrollmentPromise(loadTestRecord(dependencies));
}

/** Zero-argument production loader for the fixed current-user record. */
export function loadFloodgateV7ApprovedKeyEnrollment(): Promise<
  Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>
> {
  if (arguments.length !== 0 || getEffectiveUserId === null) {
    return rejected(new FloodgateV7ApprovedKeyEnrollmentError("capture"));
  }
  try {
    const effectiveUserId = getEffectiveUserId();
    const userInfo = getUserInfo();
    if (userInfo.uid !== effectiveUserId) {
      throw new NativeError("production identity differs");
    }
    const dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: userInfo.homedir,
    });
    return pinEnrollmentPromise(
      readFixedRecord(
        dependencies,
        "production-fixed-current-euid-userinfo-home-control-plane-record",
      ),
    );
  } catch {
    return rejected(new FloodgateV7ApprovedKeyEnrollmentError("capture"));
  }
}

function claimCapability(
  capability: FloodgateV7ApprovedKeyEnrollmentCapability,
  expectedBoundary: FloodgateV7ApprovedKeyEnrollmentExecutionBoundary,
): Readonly<FloodgateV7ApprovedKeyEnrollmentClaim> {
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeIsProxy(capability)
  ) {
    throw new FloodgateV7ApprovedKeyEnrollmentError("claim");
  }
  const stored = nativeReflectApply(nativeWeakMapGet, capabilityClaims, [
    capability,
  ]) as StoredCapability | undefined;
  if (stored === undefined || stored.boundary !== expectedBoundary) {
    throw new FloodgateV7ApprovedKeyEnrollmentError("claim");
  }
  nativeReflectApply(nativeWeakMapDelete, capabilityClaims, [capability]);
  return stored.claim;
}

export function claimFloodgateV7ApprovedKeyEnrollment(
  capability: FloodgateV7ApprovedKeyEnrollmentCapability,
): Readonly<FloodgateV7ApprovedKeyEnrollmentClaim> {
  if (arguments.length !== 1)
    throw new FloodgateV7ApprovedKeyEnrollmentError("claim");
  return claimCapability(
    capability,
    "production-fixed-current-euid-userinfo-home-control-plane-record",
  );
}

export function claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(
  capability: FloodgateV7ApprovedKeyEnrollmentCapability,
): Readonly<FloodgateV7ApprovedKeyEnrollmentClaim> {
  if (arguments.length !== 1)
    throw new FloodgateV7ApprovedKeyEnrollmentError("claim");
  return claimCapability(
    capability,
    "test-only-injected-current-euid-home-control-plane-record",
  );
}
