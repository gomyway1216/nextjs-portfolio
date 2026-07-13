/**
 * Authorizes one Floodgate v7 teacher run with the fixed per-user deployment
 * key. This module reads no dataset or checkpoint and starts no runtime.
 */

import { Buffer } from "node:buffer";
import { createHmac, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  type FloodgateTeacherStageAuthorizationReceipt,
} from "./floodgate-teacher-stage-authorization";

export const FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CONTRACT =
  "shogi-floodgate-v7-deployment-teacher-run-authorization-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_STATUS =
  "mac-issued-for-strictly-captured-caller-supplied-run-and-stage-metadata-not-checkpointed" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CLAIM_BOUNDARY =
  "fixed-current-euid-private-key-macs-strictly-captured-caller-supplied-v2-run-binding-and-durable-stage-metadata-not-coordinator-origin-active-stage-authority-key-export-generic-signing-dataset-checkpoint-runtime-label-training-weight-live-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_TRUST_BOUNDARY =
  "trusted-current-euid-private-0700-key-deployment-and-current-js-realm-intrinsics-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_ALGORITHM =
  "hkdf-sha256-then-domain-separated-canonical-hmac-sha256-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_HKDF_INFO =
  "shogi-floodgate-v7-deployment-run-authorization-key-v1\0" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_HMAC_DOMAIN =
  "shogi-floodgate-v7-deployment-run-authorization-v1\0" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT =
  "shogi-floodgate-v7-deployment-key-instance-salt-v1\0" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO =
  "shogi-floodgate-v7-deployment-key-instance-key-v1\0" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN =
  "shogi-floodgate-v7-deployment-key-instance-id-v1\0" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_ID =
  "floodgate-v7-teacher-checkpoint-root-v1" as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_BYTES = 32 as const;
export const FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS =
  Object.freeze([
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-floodgate-v7-deployment-key-v1",
  ] as const);
export const FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME = "root-key.bin" as const;

const RUN_BINDING_SCHEMA = "shogi-floodgate-v7-teacher-run-binding-v2" as const;
const PRODUCER_CONTROL_SCHEMA =
  "shogi-floodgate-v7-teacher-producer-control-v2" as const;
const PLAN_BYTES = 10_890 as const;
const PLAN_SHA256 =
  "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af" as const;
const PARENT_DEADLINE_MS = 1_800_000 as const;
const ABORT_DRAIN_MS = 30_000 as const;
const MAX_IN_FLIGHT = 12 as const;
const CANCEL_POLICY =
  "first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2" as const;
const LATE_SETTLEMENT_POLICY =
  "observe-from-start-consume-after-terminal-without-validation-or-append-v2" as const;

const REQUEST_KEYS = Object.freeze([
  "keyId",
  "runBinding",
  "runId",
  "stageAuthorizationReceipt",
] as const);
const RUN_BINDING_KEYS = Object.freeze([
  "plan",
  "producer_control",
  "schema",
  "stable_runtime_receipt_sha256",
  "teacher_usi_runtime_receipt_sha256",
] as const);
const PLAN_KEYS = Object.freeze(["bytes", "sha256"] as const);
const CONTROL_KEYS = Object.freeze([
  "abort_drain_ms",
  "cancel_policy",
  "late_settlement_policy",
  "max_in_flight",
  "parent_deadline_ms",
  "schema",
] as const);
const STAGE_RECEIPT_KEYS = Object.freeze([
  "allowed_entries",
  "contract",
  "destination_basename",
  "lease_identity",
  "parent_identity",
  "stage_basename",
  "stage_identity",
  "status",
  "trust_boundary",
] as const);
const IDENTITY_KEYS = Object.freeze(["dev", "ino"] as const);
const DEPENDENCY_KEYS = Object.freeze([
  "beforeFinalRevalidationForTests",
  "effectiveUserId",
  "homeDirectory",
  "observeInternalKeyForTests",
] as const);
const REQUIRED_DEPENDENCY_KEYS = Object.freeze([
  "effectiveUserId",
  "homeDirectory",
] as const);
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SAFE_BASENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);

const NativeError = Error;
const NativeAggregateError = AggregateError;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const nodeIsProxy = nodeUtilTypes.isProxy;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const bufferFrom = Buffer.from.bind(Buffer);
const bufferAlloc = Buffer.alloc.bind(Buffer);
const bufferFill = Buffer.prototype.fill;
const jsonStringify = JSON.stringify;
const pathIsAbsolute = path.isAbsolute;
const pathJoin = path.join;
const pathResolve = path.resolve;
const realpath = fs.promises.realpath.bind(fs.promises);
const lstat = fs.promises.lstat.bind(fs.promises);
const open = fs.promises.open.bind(fs.promises);
const getUserInfo = os.userInfo.bind(os);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;

export interface FloodgateV7DeploymentTeacherRunBinding {
  readonly schema: typeof RUN_BINDING_SCHEMA;
  readonly plan: Readonly<{
    readonly bytes: typeof PLAN_BYTES;
    readonly sha256: typeof PLAN_SHA256;
  }>;
  readonly producer_control: Readonly<{
    readonly schema: typeof PRODUCER_CONTROL_SCHEMA;
    readonly parent_deadline_ms: typeof PARENT_DEADLINE_MS;
    readonly abort_drain_ms: typeof ABORT_DRAIN_MS;
    readonly max_in_flight: typeof MAX_IN_FLIGHT;
    readonly cancel_policy: typeof CANCEL_POLICY;
    readonly late_settlement_policy: typeof LATE_SETTLEMENT_POLICY;
  }>;
  readonly stable_runtime_receipt_sha256: string;
  readonly teacher_usi_runtime_receipt_sha256: string;
}

export interface FloodgateV7DeploymentTeacherRunAuthorizationRequest {
  readonly runId: string;
  readonly keyId: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly runBinding: Readonly<FloodgateV7DeploymentTeacherRunBinding>;
  readonly stageAuthorizationReceipt: Readonly<FloodgateTeacherStageAuthorizationReceipt>;
}

export interface FloodgateV7DeploymentKeyAuthorityDependencies {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly observeInternalKeyForTests?: (key: Uint8Array) => void;
  readonly beforeFinalRevalidationForTests?: () => void | Promise<void>;
}

export type FloodgateV7DeploymentKeyAuthorityExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-key-deployment"
  | "test-only-injected-current-euid-home-key-deployment";

export interface FloodgateV7DeploymentTeacherRunAuthorizationReceipt<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary =
    FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CONTRACT;
  readonly status: typeof FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_TRUST_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly algorithm: typeof FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_ALGORITHM;
  readonly run_id: string;
  readonly key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly run_binding: Readonly<FloodgateV7DeploymentTeacherRunBinding>;
  readonly stage_binding: Readonly<{
    readonly authorization_contract: typeof FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT;
    readonly authorization_trust_boundary: typeof FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY;
    readonly authorization_status: typeof FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS;
    readonly allowed_entries: readonly string[];
    readonly parent_dev: string;
    readonly parent_ino: string;
    readonly stage_dev: string;
    readonly stage_ino: string;
    readonly stage_basename: string;
    readonly destination_basename: string;
    readonly lease_inode_included: false;
  }>;
  readonly key_deployment: Readonly<{
    readonly layout: "fixed-current-euid-userinfo-home-v1";
    readonly relative_path: "Library/Application Support/nextjs-portfolio/shogi-floodgate-v7-deployment-key-v1/root-key.bin";
    readonly owner_uid: number;
    readonly parent_mode: "0700";
    readonly key_mode: "0600";
    readonly key_bytes: 32;
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
    readonly key_instance_algorithm: "hkdf-sha256-domain-separated-hmac-sha256-v1";
    readonly held_descriptors_revalidated: true;
  }>;
  readonly authorization_mac: string;
  readonly test_boundary: Readonly<{
    readonly production_home_origin: false;
    readonly production_effective_uid_origin: false;
    readonly test_hook_may_observe_key_copy: true;
  }> | null;
  readonly nonclaims: Readonly<{
    readonly key_export: false;
    readonly key_hash_disclosure: false;
    readonly generic_signing: false;
    readonly coordinator_origin: false;
    readonly runtime_origin: false;
    readonly active_stage_lease: false;
    readonly stage_lease_origin: false;
    readonly stage_receipt_origin: false;
    readonly input_authentication: false;
    readonly cross_invocation_key_rotation_detection: false;
    readonly checkpoint_connector: false;
    readonly dataset_read: false;
    readonly checkpoint: false;
    readonly runtime: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly selection_or_holdout_access: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export type FloodgateV7DeploymentKeyAuthorityPhase =
  | "capture"
  | "production-identity"
  | "namespace"
  | "key-read"
  | "authorization"
  | "revalidation"
  | "cleanup";

export class FloodgateV7DeploymentKeyAuthorityError extends NativeError {
  readonly phase: FloodgateV7DeploymentKeyAuthorityPhase;
  readonly primary: unknown;

  constructor(
    phase: FloodgateV7DeploymentKeyAuthorityPhase,
    message: string,
    primary?: unknown,
  ) {
    super(`Floodgate v7 deployment key authority failed: ${message}`, {
      cause: primary,
    });
    this.name = "FloodgateV7DeploymentKeyAuthorityError";
    this.phase = phase;
    this.primary = primary;
    objectFreeze(this);
  }
}

type PlainRecord = Readonly<Record<string, unknown>>;

interface CapturedRequest {
  readonly runId: string;
  readonly runBinding: Readonly<FloodgateV7DeploymentTeacherRunBinding>;
  readonly stageBinding: FloodgateV7DeploymentTeacherRunAuthorizationReceipt["stage_binding"];
}

interface CapturedDependencies {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly observeInternalKey?: (key: Uint8Array) => void;
  readonly beforeFinalRevalidation?: () => void | Promise<void>;
}

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

function fail(
  phase: FloodgateV7DeploymentKeyAuthorityPhase,
  message: string,
  primary?: unknown,
): never {
  throw new FloodgateV7DeploymentKeyAuthorityError(phase, message, primary);
}

function frozenRecord<T extends Record<string, unknown>>(
  values: T,
): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(values);
  const keys = reflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") fail("capture", "internal symbol key");
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      fail("capture", "internal accessor property");
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function strictRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): PlainRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== Object.prototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    fail("capture", `${label} must be an ordinary non-Proxy record`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor | undefined
  >;
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expected.length)
    fail("capture", `${label} keys are not exact`);
  const output = objectCreate(null) as Record<string, unknown>;
  for (
    let expectedIndex = 0;
    expectedIndex < expected.length;
    expectedIndex += 1
  ) {
    const key = expected[expectedIndex];
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(
        "capture",
        `${label}.${key} must be an enumerable own data property`,
      );
    }
    output[key] = descriptor.value;
  }
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    if (typeof keys[keyIndex] !== "string")
      fail("capture", `${label} has a symbol key`);
  }
  return objectFreeze(output);
}

function strictRecordWithOptionalKeys(
  value: unknown,
  required: readonly string[],
  allowed: readonly string[],
  label: string,
): PlainRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== Object.prototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    fail("capture", `${label} must be an ordinary non-Proxy record`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor | undefined
  >;
  const keys = reflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string" || !allowed.includes(key)) {
      fail("capture", `${label} contains an unsupported key`);
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(
        "capture",
        `${label}.${key} must be an enumerable own data property`,
      );
    }
  }
  const output = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < allowed.length; index += 1) {
    const key = allowed[index];
    const descriptor = descriptors[key];
    if (descriptor !== undefined && "value" in descriptor) {
      output[key] = descriptor.value;
    }
  }
  for (let index = 0; index < required.length; index += 1) {
    if (descriptors[required[index]] === undefined) {
      fail("capture", `${label}.${required[index]} is required`);
    }
  }
  return objectFreeze(output);
}

function strictArray(value: unknown, label: string): readonly unknown[] {
  if (
    !arrayIsArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== Array.prototype
  ) {
    fail("capture", `${label} must be an ordinary non-Proxy array`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor | undefined
  >;
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    reflectOwnKeys(descriptors).length !== lengthDescriptor.value + 1
  ) {
    fail("capture", `${label} must be dense and exact`);
  }
  const output: unknown[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(
        "capture",
        `${label}[${index}] must be an enumerable own data property`,
      );
    }
    objectDefineProperty(output, index, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail("capture", `${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function captureRunBinding(
  value: unknown,
): Readonly<FloodgateV7DeploymentTeacherRunBinding> {
  const binding = strictRecord(value, RUN_BINDING_KEYS, "request.runBinding");
  const plan = strictRecord(binding.plan, PLAN_KEYS, "request.runBinding.plan");
  const control = strictRecord(
    binding.producer_control,
    CONTROL_KEYS,
    "request.runBinding.producer_control",
  );
  if (
    binding.schema !== RUN_BINDING_SCHEMA ||
    plan.bytes !== PLAN_BYTES ||
    plan.sha256 !== PLAN_SHA256 ||
    control.schema !== PRODUCER_CONTROL_SCHEMA ||
    control.parent_deadline_ms !== PARENT_DEADLINE_MS ||
    control.abort_drain_ms !== ABORT_DRAIN_MS ||
    control.max_in_flight !== MAX_IN_FLIGHT ||
    control.cancel_policy !== CANCEL_POLICY ||
    control.late_settlement_policy !== LATE_SETTLEMENT_POLICY
  ) {
    fail("capture", "request.runBinding is not the exact pinned v2 policy");
  }
  return frozenRecord({
    schema: RUN_BINDING_SCHEMA,
    plan: frozenRecord({ bytes: PLAN_BYTES, sha256: PLAN_SHA256 }),
    producer_control: frozenRecord({
      schema: PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms: PARENT_DEADLINE_MS,
      abort_drain_ms: ABORT_DRAIN_MS,
      max_in_flight: MAX_IN_FLIGHT,
      cancel_policy: CANCEL_POLICY,
      late_settlement_policy: LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256: digest(
      binding.stable_runtime_receipt_sha256,
      "request.runBinding.stable_runtime_receipt_sha256",
    ),
    teacher_usi_runtime_receipt_sha256: digest(
      binding.teacher_usi_runtime_receipt_sha256,
      "request.runBinding.teacher_usi_runtime_receipt_sha256",
    ),
  });
}

function captureIdentity(
  value: unknown,
  label: string,
): Readonly<{ dev: bigint; ino: bigint }> {
  const identity = strictRecord(value, IDENTITY_KEYS, label);
  if (
    typeof identity.dev !== "bigint" ||
    identity.dev < BigInt(0) ||
    typeof identity.ino !== "bigint" ||
    identity.ino <= BigInt(0)
  ) {
    fail("capture", `${label} is invalid`);
  }
  return frozenRecord({ dev: identity.dev, ino: identity.ino });
}

function captureStageBinding(
  value: unknown,
): FloodgateV7DeploymentTeacherRunAuthorizationReceipt["stage_binding"] {
  const receipt = strictRecord(
    value,
    STAGE_RECEIPT_KEYS,
    "request.stageAuthorizationReceipt",
  );
  if (
    receipt.contract !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    receipt.trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    receipt.status !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS
  ) {
    fail("capture", "stage authorization receipt boundary is unsupported");
  }
  const entries = strictArray(
    receipt.allowed_entries,
    "stage authorization allowed_entries",
  );
  if (entries.length !== FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES.length) {
    fail("capture", "stage authorization allowed_entries are not exact");
  }
  const entryCopy: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index] !== FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES[index]) {
      fail("capture", "stage authorization allowed_entries are not exact");
    }
    objectDefineProperty(entryCopy, index, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: entries[index],
    });
  }
  const parent = captureIdentity(
    receipt.parent_identity,
    "stage parent identity",
  );
  const stage = captureIdentity(receipt.stage_identity, "stage identity");
  captureIdentity(receipt.lease_identity, "stage lease identity");
  for (const key of ["stage_basename", "destination_basename"] as const) {
    if (
      typeof receipt[key] !== "string" ||
      !SAFE_BASENAME_RE.test(receipt[key])
    ) {
      fail("capture", `stage authorization ${key} is invalid`);
    }
  }
  return frozenRecord({
    authorization_contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
    authorization_trust_boundary:
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
    authorization_status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
    allowed_entries: objectFreeze(entryCopy),
    parent_dev: parent.dev.toString(10),
    parent_ino: parent.ino.toString(10),
    stage_dev: stage.dev.toString(10),
    stage_ino: stage.ino.toString(10),
    stage_basename: receipt.stage_basename as string,
    destination_basename: receipt.destination_basename as string,
    lease_inode_included: false as const,
  });
}

function captureRequest(
  value: FloodgateV7DeploymentTeacherRunAuthorizationRequest,
): CapturedRequest {
  const request = strictRecord(value, REQUEST_KEYS, "request");
  if (typeof request.runId !== "string" || !RUN_ID_RE.test(request.runId)) {
    fail("capture", "request.runId must be 32 bytes of lowercase hex");
  }
  if (request.keyId !== FLOODGATE_V7_DEPLOYMENT_KEY_ID) {
    fail("capture", "request.keyId is not the fixed deployment key id");
  }
  return frozenRecord({
    runId: request.runId,
    runBinding: captureRunBinding(request.runBinding),
    stageBinding: captureStageBinding(request.stageAuthorizationReceipt),
  });
}

function captureDependencies(
  value: FloodgateV7DeploymentKeyAuthorityDependencies,
): CapturedDependencies {
  const dependencies = strictRecordWithOptionalKeys(
    value,
    REQUIRED_DEPENDENCY_KEYS,
    DEPENDENCY_KEYS,
    "dependencies",
  );
  if (
    !numberIsSafeInteger(dependencies.effectiveUserId) ||
    (dependencies.effectiveUserId as number) < 0
  ) {
    fail("capture", "dependencies.effectiveUserId is invalid");
  }
  if (
    typeof dependencies.homeDirectory !== "string" ||
    !pathIsAbsolute(dependencies.homeDirectory) ||
    pathResolve(dependencies.homeDirectory) !== dependencies.homeDirectory ||
    dependencies.homeDirectory.includes("\0")
  ) {
    fail(
      "capture",
      "dependencies.homeDirectory must be a normalized absolute path",
    );
  }
  for (const key of [
    "observeInternalKeyForTests",
    "beforeFinalRevalidationForTests",
  ] as const) {
    const hook = dependencies[key];
    if (
      hook !== undefined &&
      (typeof hook !== "function" || nodeIsProxy(hook))
    ) {
      fail("capture", `dependencies.${key} must be a non-Proxy function`);
    }
  }
  return frozenRecord({
    effectiveUserId: dependencies.effectiveUserId as number,
    homeDirectory: dependencies.homeDirectory,
    observeInternalKey: dependencies.observeInternalKeyForTests as
      ((key: Uint8Array) => void) | undefined,
    beforeFinalRevalidation: dependencies.beforeFinalRevalidationForTests as
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

function assertParent(stat: Readonly<StatSnapshot>, uid: number): void {
  if (
    (stat.mode & TYPE_MASK) !== DIRECTORY_TYPE ||
    (stat.mode & MODE_MASK) !== BigInt(0o700) ||
    stat.uid !== BigInt(uid)
  ) {
    fail(
      "namespace",
      "key deployment parent must be current-EUID-owned exact 0700 directory",
    );
  }
}

function assertKey(stat: Readonly<StatSnapshot>, uid: number): void {
  if (
    (stat.mode & TYPE_MASK) !== REGULAR_TYPE ||
    (stat.mode & MODE_MASK) !== BigInt(0o600) ||
    stat.uid !== BigInt(uid) ||
    stat.nlink !== BigInt(1) ||
    stat.size !== BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES)
  ) {
    fail(
      "namespace",
      "deployment key must be current-EUID-owned 0600 regular nlink-1 exact 32-byte file",
    );
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return jsonStringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail("authorization", "canonical JSON number is invalid");
    return jsonStringify(value);
  }
  if (arrayIsArray(value)) {
    const entries = strictArray(value, "canonical JSON array");
    let output = "[";
    for (let index = 0; index < entries.length; index += 1) {
      if (index > 0) output += ",";
      output += canonicalJson(entries[index]);
    }
    return `${output}]`;
  }
  if (value !== null && typeof value === "object") {
    const descriptors = objectGetOwnPropertyDescriptors(value);
    const rawKeys = reflectOwnKeys(descriptors);
    const keys: string[] = [];
    for (let index = 0; index < rawKeys.length; index += 1) {
      if (typeof rawKeys[index] !== "string")
        fail("authorization", "canonical JSON symbol key");
      objectDefineProperty(keys, index, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: rawKeys[index],
      });
    }
    keys.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    let output = "{";
    for (let index = 0; index < keys.length; index += 1) {
      const descriptor = descriptors[keys[index]];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        fail(
          "authorization",
          "canonical JSON requires enumerable data properties",
        );
      }
      if (index > 0) output += ",";
      output += `${jsonStringify(keys[index])}:${canonicalJson(descriptor.value)}`;
    }
    return `${output}}`;
  }
  return fail("authorization", `canonical JSON rejects ${typeof value}`);
}

function zeroize(bytes: Buffer): unknown | undefined {
  try {
    reflectApply(bufferFill, bytes, [0]);
    for (let index = 0; index < bytes.byteLength; index += 1) {
      if (bytes[index] !== 0)
        return new NativeError("key buffer was not zero-filled");
    }
    return undefined;
  } catch (error) {
    return error;
  }
}

async function authorizeInternal<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
>(
  request: Readonly<CapturedRequest>,
  dependencies: Readonly<CapturedDependencies>,
  executionBoundary: TBoundary,
): Promise<
  Readonly<FloodgateV7DeploymentTeacherRunAuthorizationReceipt<TBoundary>>
> {
  const parentPath = pathJoin(
    dependencies.homeDirectory,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
  const keyPath = pathJoin(parentPath, FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME);
  let parentHandle: fs.promises.FileHandle | undefined;
  let keyHandle: fs.promises.FileHandle | undefined;
  const rootKey = bufferAlloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES);
  const extra = bufferAlloc(1);
  let derivedKey = bufferAlloc(0);
  let instanceKey = bufferAlloc(0);
  let primary: unknown;
  let result:
    | Readonly<FloodgateV7DeploymentTeacherRunAuthorizationReceipt<TBoundary>>
    | undefined;
  try {
    if (
      (await realpath(dependencies.homeDirectory)) !==
        dependencies.homeDirectory ||
      (await realpath(parentPath)) !== parentPath ||
      (await realpath(keyPath)) !== keyPath
    ) {
      fail(
        "namespace",
        "deployment paths must be canonical and contain no symlink traversal",
      );
    }
    const parentBefore = snapshot(await lstat(parentPath, { bigint: true }));
    const keyBefore = snapshot(await lstat(keyPath, { bigint: true }));
    assertParent(parentBefore, dependencies.effectiveUserId);
    assertKey(keyBefore, dependencies.effectiveUserId);
    const noFollow = fs.constants.O_NOFOLLOW;
    const directory = fs.constants.O_DIRECTORY;
    if (typeof noFollow !== "number" || typeof directory !== "number") {
      fail("namespace", "O_NOFOLLOW and O_DIRECTORY are required");
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
      fail("namespace", "deployment identity changed before held read");
    }
    const read = await keyHandle.read(rootKey, 0, rootKey.byteLength, 0);
    if (
      read.bytesRead !== rootKey.byteLength ||
      (await keyHandle.read(extra, 0, 1, rootKey.byteLength)).bytesRead !== 0
    ) {
      fail(
        "key-read",
        "deployment key produced a short or oversized held read",
      );
    }
    dependencies.observeInternalKey?.(rootKey);
    derivedKey = bufferFrom(
      hkdfSync(
        "sha256",
        rootKey,
        bufferFrom(request.runId, "hex"),
        bufferFrom(FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_HKDF_INFO),
        32,
      ),
    );
    instanceKey = bufferFrom(
      hkdfSync(
        "sha256",
        rootKey,
        bufferFrom(FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT),
        bufferFrom(FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO),
        32,
      ),
    );
    const keyInstanceId = createHmac("sha256", instanceKey)
      .update(FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN, "utf8")
      .digest("hex");
    const keyDeployment = frozenRecord({
      layout: "fixed-current-euid-userinfo-home-v1" as const,
      relative_path:
        "Library/Application Support/nextjs-portfolio/shogi-floodgate-v7-deployment-key-v1/root-key.bin" as const,
      owner_uid: dependencies.effectiveUserId,
      parent_mode: "0700" as const,
      key_mode: "0600" as const,
      key_bytes: 32 as const,
      key_nlink: 1 as const,
      parent_identity: frozenRecord({
        dev: parentHeldBefore.dev.toString(10),
        ino: parentHeldBefore.ino.toString(10),
      }),
      key_identity: frozenRecord({
        dev: keyHeldBefore.dev.toString(10),
        ino: keyHeldBefore.ino.toString(10),
      }),
      key_instance_id: keyInstanceId,
      key_instance_algorithm:
        "hkdf-sha256-domain-separated-hmac-sha256-v1" as const,
      held_descriptors_revalidated: true as const,
    });
    const testBoundary =
      executionBoundary ===
      "production-fixed-current-euid-userinfo-home-key-deployment"
        ? null
        : frozenRecord({
            production_home_origin: false as const,
            production_effective_uid_origin: false as const,
            test_hook_may_observe_key_copy: true as const,
          });
    const nonclaims = frozenRecord({
      key_export: false as const,
      key_hash_disclosure: false as const,
      generic_signing: false as const,
      coordinator_origin: false as const,
      runtime_origin: false as const,
      active_stage_lease: false as const,
      stage_lease_origin: false as const,
      stage_receipt_origin: false as const,
      input_authentication: false as const,
      cross_invocation_key_rotation_detection: false as const,
      checkpoint_connector: false as const,
      dataset_read: false as const,
      checkpoint: false as const,
      runtime: false as const,
      teacher_label: false as const,
      training: false as const,
      selection_or_holdout_access: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    });
    const unsigned = frozenRecord({
      contract: FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CONTRACT,
      status: FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_STATUS,
      claim_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CLAIM_BOUNDARY,
      trust_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_TRUST_BOUNDARY,
      execution_boundary: executionBoundary,
      algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_ALGORITHM,
      run_id: request.runId,
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      run_binding: request.runBinding,
      stage_binding: request.stageBinding,
      key_deployment: keyDeployment,
      test_boundary: testBoundary,
      nonclaims,
    });
    const authorizationMac = createHmac("sha256", derivedKey)
      .update(FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_HMAC_DOMAIN, "utf8")
      .update(canonicalJson(unsigned), "utf8")
      .digest("hex");
    // Neither final metadata revalidation nor descriptor cleanup needs secret
    // bytes. Zero every owned copy before the next await so a stalled hook or
    // filesystem operation cannot extend the key lifetime.
    const preRevalidationZeroizeFailures: unknown[] = [];
    for (const bytes of [derivedKey, instanceKey, rootKey, extra]) {
      const zeroizeFailure = zeroize(bytes);
      if (zeroizeFailure !== undefined) {
        preRevalidationZeroizeFailures[preRevalidationZeroizeFailures.length] =
          zeroizeFailure;
      }
    }
    if (preRevalidationZeroizeFailures.length > 0) {
      fail(
        "cleanup",
        "secret zeroization failed before metadata revalidation",
        new NativeAggregateError(preRevalidationZeroizeFailures),
      );
    }
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
      fail(
        "revalidation",
        "deployment identity or metadata changed during authorization",
      );
    }
    result = frozenRecord({ ...unsigned, authorization_mac: authorizationMac });
  } catch (error) {
    primary = error;
  } finally {
    const cleanup: unknown[] = [];
    // Secret lifetime must not depend on descriptor-close progress. FileHandle
    // close can stall on a faulty filesystem, so zero every owned byte copy
    // synchronously before the first cleanup await.
    const derivedZeroize = zeroize(derivedKey);
    if (derivedZeroize !== undefined) cleanup[cleanup.length] = derivedZeroize;
    const instanceZeroize = zeroize(instanceKey);
    if (instanceZeroize !== undefined)
      cleanup[cleanup.length] = instanceZeroize;
    const rootZeroize = zeroize(rootKey);
    if (rootZeroize !== undefined) cleanup[cleanup.length] = rootZeroize;
    const extraZeroize = zeroize(extra);
    if (extraZeroize !== undefined) cleanup[cleanup.length] = extraZeroize;
    try {
      await keyHandle?.close();
    } catch (error) {
      cleanup[cleanup.length] = error;
    }
    try {
      await parentHandle?.close();
    } catch (error) {
      cleanup[cleanup.length] = error;
    }
    if (cleanup.length > 0) {
      const cleanupError = new NativeAggregateError(
        cleanup,
        "deployment key authority cleanup failed",
      );
      primary =
        primary === undefined
          ? new FloodgateV7DeploymentKeyAuthorityError(
              "cleanup",
              "cleanup failed",
              cleanupError,
            )
          : new NativeAggregateError(
              [primary, cleanupError],
              "authorization and cleanup both failed",
            );
    }
  }
  if (primary !== undefined) throw primary;
  if (result === undefined)
    fail("authorization", "authorization completed without a receipt");
  return result;
}

/** Test-only filesystem seam. The optional observer sees only the owned copy. */
export function authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
  requestValue: FloodgateV7DeploymentTeacherRunAuthorizationRequest,
  dependenciesValue: FloodgateV7DeploymentKeyAuthorityDependencies,
): Promise<
  Readonly<
    FloodgateV7DeploymentTeacherRunAuthorizationReceipt<"test-only-injected-current-euid-home-key-deployment">
  >
> {
  const request = captureRequest(requestValue);
  const dependencies = captureDependencies(dependenciesValue);
  return authorizeInternal(
    request,
    dependencies,
    "test-only-injected-current-euid-home-key-deployment",
  );
}

/** Authorize exact metadata with the fixed current-EUID deployment key. */
export function authorizeFloodgateV7DeploymentTeacherRun(
  requestValue: FloodgateV7DeploymentTeacherRunAuthorizationRequest,
): Promise<
  Readonly<
    FloodgateV7DeploymentTeacherRunAuthorizationReceipt<"production-fixed-current-euid-userinfo-home-key-deployment">
  >
> {
  let request: Readonly<CapturedRequest>;
  try {
    request = captureRequest(requestValue);
  } catch (error) {
    return new NativePromise((_resolve, reject) => reject(error));
  }
  if (getEffectiveUserId === null) {
    return new NativePromise((_resolve, reject) =>
      reject(
        new FloodgateV7DeploymentKeyAuthorityError(
          "production-identity",
          "POSIX effective-user identity is required",
        ),
      ),
    );
  }
  let userInfo: ReturnType<typeof os.userInfo>;
  let effectiveUserId: number;
  try {
    effectiveUserId = getEffectiveUserId();
    userInfo = getUserInfo();
    if (userInfo.uid !== effectiveUserId) {
      fail(
        "production-identity",
        "os.userInfo uid differs from the current effective uid",
      );
    }
  } catch (error) {
    return new NativePromise((_resolve, reject) => reject(error));
  }
  const dependencies = captureDependencies({
    effectiveUserId,
    homeDirectory: userInfo.homedir as string,
    observeInternalKeyForTests: undefined,
    beforeFinalRevalidationForTests: undefined,
  });
  return authorizeInternal(
    request,
    dependencies,
    "production-fixed-current-euid-userinfo-home-key-deployment",
  );
}
