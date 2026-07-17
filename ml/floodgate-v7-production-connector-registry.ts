/**
 * Read-only loader for one fixed, private Floodgate v7 production connector
 * registry. The loader derives every execution path from the current user's
 * fixed namespace and issues only an opaque, in-process, single-use capability.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TextDecoder, types as nodeUtilTypes } from "node:util";

import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
  type FloodgateV7ProductionApplicationSourceBinding,
} from "./floodgate-v7-production-application-source-provenance";
import {
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests,
  type FloodgateTeacherStageAuthorizationOptions,
} from "./floodgate-teacher-stage-authorization";
import type { FloodgateTrainingRowConsumerOptions } from "./floodgate-training-row-consumer";

export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT =
  "shogi-floodgate-v7-production-connector-registry-record-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT =
  "shogi-floodgate-v7-production-connector-registry-record-v2" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_STATUS =
  "fixed-private-production-connector-run-registry" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME =
  "registry.json" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME = "runs" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES = 64 * 1024;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS =
  Object.freeze([
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-floodgate-v7-production-connector-v1",
  ] as const);

export type FloodgateV7ProductionConnectorRegistryExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-production-connector-registry"
  | "test-only-injected-current-euid-home-production-connector-registry";

export interface FloodgateV7ProductionConnectorRegistryRecord {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_STATUS;
  readonly layout: "fixed-current-euid-userinfo-home-v1";
  readonly run_id: string;
  readonly approved_key_binding: Readonly<{
    readonly record_bytes: number;
    readonly record_sha256: string;
    readonly key_instance_id: string;
  }>;
  readonly verifier_revision: string;
  readonly application_source_binding: Readonly<FloodgateV7ProductionApplicationSourceBinding>;
  readonly repository_root: string;
  readonly raw_lock_root: string;
  readonly role_lock_root: string;
  readonly role_bundle_root: string;
  readonly legacy_protected_position_ids_path: string;
  readonly engine_args: readonly string[];
}

interface FloodgateV7ProductionConnectorRegistryLegacyRecord {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_STATUS;
  readonly layout: "fixed-current-euid-userinfo-home-v1";
  readonly run_id: string;
  readonly approved_key_binding: Readonly<{
    readonly record_bytes: number;
    readonly record_sha256: string;
    readonly key_instance_id: string;
  }>;
  readonly verifier_revision: string;
  readonly repository_root: string;
  readonly raw_lock_root: string;
  readonly role_lock_root: string;
  readonly role_bundle_root: string;
  readonly legacy_protected_position_ids_path: string;
  readonly engine_args: readonly string[];
}

type FloodgateV7ProductionConnectorRegistryParsedRecord =
  | FloodgateV7ProductionConnectorRegistryRecord
  | FloodgateV7ProductionConnectorRegistryLegacyRecord;

/** Operator-reviewed data accepted by the pure canonical installer serializer. */
export interface FloodgateV7ProductionConnectorRegistryInstallationInput {
  readonly run_id: string;
  readonly approved_key_binding: Readonly<{
    readonly record_bytes: number;
    readonly record_sha256: string;
    readonly key_instance_id: string;
  }>;
  readonly verifier_revision: string;
  readonly application_source_binding: Readonly<FloodgateV7ProductionApplicationSourceBinding>;
  readonly repository_root: string;
  readonly raw_lock_root: string;
  readonly role_lock_root: string;
  readonly role_bundle_root: string;
  readonly legacy_protected_position_ids_path: string;
  readonly engine_args: readonly string[];
}

export interface FloodgateV7ProductionConnectorRegistryCapability {
  readonly contract: "shogi-floodgate-v7-production-connector-registry-capability-v1";
  readonly status: "opaque-single-use-private-registry-not-claimed";
  readonly execution_boundary: FloodgateV7ProductionConnectorRegistryExecutionBoundary;
}

export interface FloodgateV7ProductionConnectorRegistryPrivateClaim {
  readonly runId: string;
  readonly approvedKeyBinding: Readonly<{
    readonly recordBytes: number;
    readonly recordSha256: string;
    readonly keyInstanceId: string;
  }>;
  readonly applicationSourceBinding: Readonly<FloodgateV7ProductionApplicationSourceBinding>;
  readonly stageAuthorization: Readonly<FloodgateTeacherStageAuthorizationOptions>;
  readonly consumer: Readonly<FloodgateTrainingRowConsumerOptions>;
}

export interface FloodgateV7ProductionConnectorRegistryDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly beforeFinalRevalidationForTests?: () => void | Promise<void>;
  readonly closeFileForTests?: (descriptor: number) => void;
}

export type FloodgateV7ProductionConnectorRegistryPhase =
  | "capture"
  | "production-identity"
  | "test-boundary"
  | "namespace"
  | "record-open"
  | "record-read"
  | "record-validation"
  | "revalidation"
  | "cleanup"
  | "claim";

export class FloodgateV7ProductionConnectorRegistryError extends Error {
  readonly phase!: FloodgateV7ProductionConnectorRegistryPhase;
  readonly capability_issued!: false;

  constructor(phase: FloodgateV7ProductionConnectorRegistryPhase) {
    super(
      "Floodgate v7 production connector registry failed without issuing authority",
    );
    objectDefineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: "FloodgateV7ProductionConnectorRegistryError",
    });
    objectDefineProperty(this, "phase", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: phase,
    });
    objectDefineProperty(this, "capability_issued", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: false,
    });
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ProductionConnectorRegistryError: production connector registry failed",
    });
    objectFreeze(this);
  }
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

type CapturedDependencies = Readonly<{
  effectiveUserId: number;
  homeDirectory: string;
  beforeFinalRevalidation: (() => void | Promise<void>) | undefined;
  closeFile: (descriptor: number) => void;
}>;

type StoredCapability = Readonly<{
  boundary: FloodgateV7ProductionConnectorRegistryExecutionBoundary;
  claim: Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim>;
}>;

const NativeError = Error;
const NativeBigInt = BigInt;
const NativeNumber = Number;
const NativePromise = Promise;
const NativeTextDecoder = TextDecoder;
const NativeWeakMap = WeakMap;
const productionCapabilityClaims = new NativeWeakMap<
  object,
  StoredCapability
>();
const testCapabilityClaims = new NativeWeakMap<object, StoredCapability>();
const nativeWeakMapGet = WeakMap.prototype.get;
const nativeWeakMapSet = WeakMap.prototype.set;
const nativeWeakMapDelete = WeakMap.prototype.delete;
const reflectApply = Reflect.apply;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const nodeIsProxy = nodeUtilTypes.isProxy.bind(nodeUtilTypes);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const bufferAlloc = Buffer.alloc.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const bufferIsBuffer = Buffer.isBuffer.bind(Buffer);
const bufferFill = Buffer.prototype.fill;
const createSha256 = createHash;
const openSync = fs.openSync.bind(fs);
const closeSync = fs.closeSync.bind(fs);
const fstatSync = fs.fstatSync.bind(fs);
const lstatSync = fs.lstatSync.bind(fs);
const readSync = fs.readSync.bind(fs);
const realpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const getUserInfo = os.userInfo.bind(os);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathParse = path.parse.bind(path);
const pathResolve = path.resolve.bind(path);
const pathJoin = path.join.bind(path);

const MODE_MASK = NativeBigInt(0o7777);
const TYPE_MASK = NativeBigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = NativeBigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = NativeBigInt(fs.constants.S_IFREG);
const HOME_REQUIRED_OWNER_MODE = NativeBigInt(0o700);
const HOME_FORBIDDEN_MODE = NativeBigInt(0o7022);
const PRIVATE_DIRECTORY_MODE = NativeBigInt(0o700);
const PRIVATE_FILE_MODE = NativeBigInt(0o600);
const DIRECTORY_OPEN_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const RECORD_OPEN_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;
const SAFE_ENGINE_OPTION_RE = /^--?[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MAX_PATH_CODE_UNITS = 4096;
const MAX_ENGINE_ARGUMENTS = 64;
const MAX_ENGINE_ARGUMENT_CODE_UNITS = 4096;
const RECORD_KEYS = Object.freeze([
  "contract",
  "status",
  "layout",
  "run_id",
  "approved_key_binding",
  "verifier_revision",
  "application_source_binding",
  "repository_root",
  "raw_lock_root",
  "role_lock_root",
  "role_bundle_root",
  "legacy_protected_position_ids_path",
  "engine_args",
] as const);
const LEGACY_RECORD_KEYS = Object.freeze([
  "contract",
  "status",
  "layout",
  "run_id",
  "approved_key_binding",
  "verifier_revision",
  "repository_root",
  "raw_lock_root",
  "role_lock_root",
  "role_bundle_root",
  "legacy_protected_position_ids_path",
  "engine_args",
] as const);
const APPROVED_KEY_BINDING_KEYS = Object.freeze([
  "record_bytes",
  "record_sha256",
  "key_instance_id",
] as const);
const APPLICATION_SOURCE_BINDING_KEYS = Object.freeze([
  "layout",
  "revision",
] as const);
const INSTALLATION_INPUT_KEYS = Object.freeze([
  "run_id",
  "approved_key_binding",
  "verifier_revision",
  "application_source_binding",
  "repository_root",
  "raw_lock_root",
  "role_lock_root",
  "role_bundle_root",
  "legacy_protected_position_ids_path",
  "engine_args",
] as const);
const DEPENDENCY_KEYS = Object.freeze([
  "effectiveUserId",
  "homeDirectory",
  "beforeFinalRevalidationForTests",
  "closeFileForTests",
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
      throw new NativeError("registry values require data properties");
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

function sameStringKeys(
  actual: readonly string[],
  expected: readonly string[],
) {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    arrayIsArray(value) ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError(`${label} must be an exact plain record`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    !sameStringKeys(
      ownKeys.filter((key): key is string => typeof key === "string"),
      keys,
    )
  ) {
    throw new NativeError(`${label} keys are not canonical`);
  }
  const captured = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(
        `${label}.${key} must be an enumerable data property`,
      );
    }
    captured[key] = descriptor.value;
  }
  return captured;
}

function captureDependencies(
  value: FloodgateV7ProductionConnectorRegistryDependenciesForTests,
): CapturedDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    arrayIsArray(value) ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError(
      "registry dependencies must be an exact plain record",
    );
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (
      typeof key !== "string" ||
      !DEPENDENCY_KEYS.includes(key as (typeof DEPENDENCY_KEYS)[number])
    ) {
      throw new NativeError("registry dependencies contain an unknown key");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("registry dependencies require data properties");
    }
  }
  if (
    descriptors.effectiveUserId === undefined ||
    descriptors.homeDirectory === undefined
  ) {
    throw new NativeError("registry dependencies are incomplete");
  }
  const effectiveUserId: unknown = descriptors.effectiveUserId.value;
  const homeDirectory: unknown = descriptors.homeDirectory.value;
  const hook: unknown = descriptors.beforeFinalRevalidationForTests?.value;
  const closeFileHook: unknown = descriptors.closeFileForTests?.value;
  if (
    typeof effectiveUserId !== "number" ||
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    typeof homeDirectory !== "string" ||
    !canonicalNonRootAbsolutePath(homeDirectory)
  ) {
    throw new NativeError("registry dependencies are not canonical");
  }
  if (hook !== undefined && (typeof hook !== "function" || nodeIsProxy(hook))) {
    throw new NativeError("registry revalidation hook is invalid");
  }
  if (
    closeFileHook !== undefined &&
    (typeof closeFileHook !== "function" || nodeIsProxy(closeFileHook))
  ) {
    throw new NativeError("registry close hook is invalid");
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    beforeFinalRevalidation: hook as (() => void | Promise<void>) | undefined,
    closeFile: (closeFileHook ?? closeSync) as (descriptor: number) => void,
  });
}

function canonicalNonRootAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PATH_CODE_UNITS &&
    value.trim() === value &&
    !CONTROL_CHARACTER_RE.test(value) &&
    pathIsAbsolute(value) &&
    pathResolve(value) === value &&
    pathParse(value).root !== value
  );
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

function sameSnapshot(left: StatSnapshot, right: StatSnapshot): boolean {
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

function safeHome(stat: StatSnapshot, effectiveUserId: number): boolean {
  const mode = stat.mode & MODE_MASK;
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    stat.uid === NativeBigInt(effectiveUserId) &&
    (mode & HOME_REQUIRED_OWNER_MODE) === HOME_REQUIRED_OWNER_MODE &&
    (mode & HOME_FORBIDDEN_MODE) === NativeBigInt(0)
  );
}

function safePrivateDirectory(
  stat: StatSnapshot,
  effectiveUserId: number,
): boolean {
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    (stat.mode & MODE_MASK) === PRIVATE_DIRECTORY_MODE &&
    stat.uid === NativeBigInt(effectiveUserId)
  );
}

function safeRegistryFile(
  stat: StatSnapshot,
  effectiveUserId: number,
): boolean {
  return (
    (stat.mode & TYPE_MASK) === REGULAR_TYPE &&
    (stat.mode & MODE_MASK) === PRIVATE_FILE_MODE &&
    stat.uid === NativeBigInt(effectiveUserId) &&
    stat.nlink === NativeBigInt(1) &&
    stat.size >= NativeBigInt(2) &&
    stat.size <=
      NativeBigInt(FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES)
  );
}

function namedSnapshot(filePath: string): Readonly<StatSnapshot> {
  return snapshot(lstatSync(filePath, { bigint: true }));
}

function heldSnapshot(descriptor: number): Readonly<StatSnapshot> {
  return snapshot(fstatSync(descriptor, { bigint: true }));
}

function assertTestHomeIsSeparate(dependencies: CapturedDependencies): void {
  if (
    getEffectiveUserId === null ||
    getEffectiveUserId() !== dependencies.effectiveUserId
  ) {
    throw new NativeError("test registry requires the current effective UID");
  }
  const userInfo = getUserInfo();
  if (
    userInfo.uid !== dependencies.effectiveUserId ||
    !canonicalNonRootAbsolutePath(userInfo.homedir)
  ) {
    throw new NativeError("production identity is unavailable");
  }
  const productionHome = pathResolve(userInfo.homedir);
  assertFloodgateTestPathsOutsideProductionHomeCoreForTests([
    dependencies.homeDirectory,
  ]);
  const productionReal = realpathSync(productionHome);
  const testReal = realpathSync(dependencies.homeDirectory);
  const productionStat = namedSnapshot(productionHome);
  const testStat = namedSnapshot(dependencies.homeDirectory);
  if (
    dependencies.homeDirectory === productionHome ||
    testReal === productionReal ||
    (testStat.dev === productionStat.dev && testStat.ino === productionStat.ino)
  ) {
    throw new NativeError("test registry home aliases the production home");
  }
}

function requiredLiteral<T extends string>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new NativeError(`${label} is invalid`);
  return expected;
}

function requiredDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new NativeError(`${label} must be lowercase SHA-256`);
  }
  return value;
}

function requiredRevision(value: unknown, label: string): string {
  if (typeof value !== "string" || !REVISION_RE.test(value)) {
    throw new NativeError(`${label} must be a lowercase commit id`);
  }
  return value;
}

function captureApplicationSourceBinding(
  value: unknown,
  label: string,
): Readonly<FloodgateV7ProductionApplicationSourceBinding> {
  const binding = exactRecord(value, APPLICATION_SOURCE_BINDING_KEYS, label);
  return frozenRecord({
    layout: requiredLiteral(
      binding.layout,
      FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
      `${label}.layout`,
    ),
    revision: requiredRevision(binding.revision, `${label}.revision`),
  });
}

function requiredPath(value: unknown, label: string): string {
  if (!canonicalNonRootAbsolutePath(value)) {
    throw new NativeError(
      `${label} must be a canonical non-root absolute path`,
    );
  }
  return value;
}

function captureEngineArgs(value: unknown): readonly string[] {
  if (
    !arrayIsArray(value) ||
    nodeIsProxy(value) ||
    value.length > MAX_ENGINE_ARGUMENTS
  ) {
    throw new NativeError("engine_args must be a bounded dense array");
  }
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== value.length + 1) {
    throw new NativeError("engine_args contains non-index properties");
  }
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("engine_args must not contain holes or accessors");
    }
    const argument: unknown = descriptor.value;
    if (
      typeof argument !== "string" ||
      argument.length === 0 ||
      argument.length > MAX_ENGINE_ARGUMENT_CODE_UNITS ||
      argument.trim() !== argument ||
      CONTROL_CHARACTER_RE.test(argument) ||
      (!SAFE_ENGINE_OPTION_RE.test(argument) &&
        !canonicalNonRootAbsolutePath(argument))
    ) {
      throw new NativeError("engine_args contains an unsafe argument");
    }
    output.push(argument);
  }
  return objectFreeze(output);
}

function parseCanonicalRecord(
  bytes: Buffer,
): Readonly<FloodgateV7ProductionConnectorRegistryParsedRecord> {
  if (
    bytes.length < 2 ||
    bytes.length > FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES ||
    (bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf)
  ) {
    throw new NativeError("registry byte framing is invalid");
  }
  const text = new NativeTextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  if (
    !text.endsWith("\n") ||
    text.indexOf("\n") !== text.length - 1 ||
    text.includes("\r") ||
    text.charCodeAt(0) === 0xfeff
  ) {
    throw new NativeError("registry must be exactly one LF-terminated line");
  }
  const parsed: unknown = jsonParse(text.slice(0, -1));
  if (`${jsonStringify(parsed)}\n` !== text) {
    throw new NativeError("registry JSON is not canonical");
  }
  const parsedDescriptors =
    parsed !== null && typeof parsed === "object"
      ? objectGetOwnPropertyDescriptors(parsed)
      : undefined;
  const parsedContract = parsedDescriptors?.contract;
  const legacy =
    parsedContract !== undefined &&
    "value" in parsedContract &&
    parsedContract.value ===
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT;
  const record = exactRecord(
    parsed,
    legacy ? LEGACY_RECORD_KEYS : RECORD_KEYS,
    "registry record",
  );
  const binding = exactRecord(
    record.approved_key_binding,
    APPROVED_KEY_BINDING_KEYS,
    "approved_key_binding",
  );
  const recordBytes = binding.record_bytes;
  if (
    typeof recordBytes !== "number" ||
    !numberIsSafeInteger(recordBytes) ||
    recordBytes < 2 ||
    recordBytes > FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES
  ) {
    throw new NativeError("approved_key_binding.record_bytes is invalid");
  }
  const approvedKeyBinding = frozenRecord({
    record_bytes: recordBytes,
    record_sha256: requiredDigest(
      binding.record_sha256,
      "approved_key_binding.record_sha256",
    ),
    key_instance_id: requiredDigest(
      binding.key_instance_id,
      "approved_key_binding.key_instance_id",
    ),
  });
  if (legacy) {
    requiredLiteral(
      record.contract,
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT,
      "contract",
    );
  } else {
    requiredLiteral(
      record.contract,
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT,
      "contract",
    );
  }
  const shared = {
    status: requiredLiteral(
      record.status,
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_STATUS,
      "status",
    ),
    layout: requiredLiteral(
      record.layout,
      "fixed-current-euid-userinfo-home-v1",
      "layout",
    ),
    run_id: requiredDigest(record.run_id, "run_id"),
    approved_key_binding: approvedKeyBinding,
    verifier_revision: requiredRevision(
      record.verifier_revision,
      "verifier_revision",
    ),
    repository_root: requiredPath(record.repository_root, "repository_root"),
    raw_lock_root: requiredPath(record.raw_lock_root, "raw_lock_root"),
    role_lock_root: requiredPath(record.role_lock_root, "role_lock_root"),
    role_bundle_root: requiredPath(record.role_bundle_root, "role_bundle_root"),
    legacy_protected_position_ids_path: requiredPath(
      record.legacy_protected_position_ids_path,
      "legacy_protected_position_ids_path",
    ),
    engine_args: captureEngineArgs(record.engine_args),
  };
  if (legacy) {
    return frozenRecord({
      contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT,
      ...shared,
    });
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT,
    status: shared.status,
    layout: shared.layout,
    run_id: shared.run_id,
    approved_key_binding: shared.approved_key_binding,
    verifier_revision: shared.verifier_revision,
    application_source_binding: captureApplicationSourceBinding(
      record.application_source_binding,
      "application_source_binding",
    ),
    repository_root: shared.repository_root,
    raw_lock_root: shared.raw_lock_root,
    role_lock_root: shared.role_lock_root,
    role_bundle_root: shared.role_bundle_root,
    legacy_protected_position_ids_path:
      shared.legacy_protected_position_ids_path,
    engine_args: shared.engine_args,
  });
}

/**
 * Strictly inspects canonical locked registry bytes and returns only the V2
 * application-source binding needed by an enclosing production gate. Legacy
 * V1 records remain inspectable by the loader but cannot pass this boundary.
 */
export function readFloodgateV7ProductionConnectorRegistryV2ApplicationSourceBindingCore(
  bytes: Buffer,
): Readonly<FloodgateV7ProductionApplicationSourceBinding> {
  if (arguments.length !== 1 || !bufferIsBuffer(bytes) || nodeIsProxy(bytes)) {
    throw new NativeError("registry V2 source-binding inspection differs");
  }
  const record = parseCanonicalRecord(bytes);
  if (record.contract !== FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT) {
    throw new NativeError("legacy registry cannot authorize production");
  }
  return frozenRecord({
    layout: record.application_source_binding.layout,
    revision: record.application_source_binding.revision,
  });
}

/**
 * Pure serializer shared by the create-only installer. It performs the same
 * exact grammar validation as the loader, but neither touches the filesystem
 * nor issues a capability.
 */
export function serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
  inputValue: FloodgateV7ProductionConnectorRegistryInstallationInput,
  expectedUidValue: number,
  boundaryValue: FloodgateV7ProductionConnectorRegistryExecutionBoundary,
): string {
  if (arguments.length !== 3) {
    throw new NativeError(
      "registry installation serialization needs three inputs",
    );
  }
  if (
    typeof expectedUidValue !== "number" ||
    !numberIsSafeInteger(expectedUidValue) ||
    expectedUidValue < 0
  ) {
    throw new NativeError("registry installation UID is invalid");
  }
  if (
    boundaryValue !==
      "production-fixed-current-euid-userinfo-home-production-connector-registry" &&
    boundaryValue !==
      "test-only-injected-current-euid-home-production-connector-registry"
  ) {
    throw new NativeError("registry installation boundary is invalid");
  }
  const input = exactRecord(
    inputValue,
    INSTALLATION_INPUT_KEYS,
    "registry installation input",
  );
  const binding = exactRecord(
    input.approved_key_binding,
    APPROVED_KEY_BINDING_KEYS,
    "registry installation approved_key_binding",
  );
  const recordBytes = binding.record_bytes;
  if (
    typeof recordBytes !== "number" ||
    !numberIsSafeInteger(recordBytes) ||
    recordBytes < 2 ||
    recordBytes > FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_MAX_BYTES
  ) {
    throw new NativeError("approved_key_binding.record_bytes is invalid");
  }
  // Capture and validate every primitive before serialization. In particular,
  // never give JSON.stringify an operator-supplied object, Proxy, accessor, or
  // toJSON hook that could execute or coerce an invalid registry value.
  const runId = requiredDigest(input.run_id, "run_id");
  const approvedRecordSha256 = requiredDigest(
    binding.record_sha256,
    "approved_key_binding.record_sha256",
  );
  const keyInstanceId = requiredDigest(
    binding.key_instance_id,
    "approved_key_binding.key_instance_id",
  );
  const verifierRevision = requiredRevision(
    input.verifier_revision,
    "verifier_revision",
  );
  const applicationSourceBinding = captureApplicationSourceBinding(
    input.application_source_binding,
    "registry installation application_source_binding",
  );
  const repositoryRoot = requiredPath(input.repository_root, "repository_root");
  const rawLockRoot = requiredPath(input.raw_lock_root, "raw_lock_root");
  const roleLockRoot = requiredPath(input.role_lock_root, "role_lock_root");
  const roleBundleRoot = requiredPath(
    input.role_bundle_root,
    "role_bundle_root",
  );
  const legacyProtectedPositionIdsPath = requiredPath(
    input.legacy_protected_position_ids_path,
    "legacy_protected_position_ids_path",
  );
  const engineArgs = captureEngineArgs(input.engine_args);
  const candidate = {
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_STATUS,
    layout: "fixed-current-euid-userinfo-home-v1" as const,
    run_id: runId,
    approved_key_binding: {
      record_bytes: recordBytes,
      record_sha256: approvedRecordSha256,
      key_instance_id: keyInstanceId,
    },
    verifier_revision: verifierRevision,
    application_source_binding: applicationSourceBinding,
    repository_root: repositoryRoot,
    raw_lock_root: rawLockRoot,
    role_lock_root: roleLockRoot,
    role_bundle_root: roleBundleRoot,
    legacy_protected_position_ids_path: legacyProtectedPositionIdsPath,
    engine_args: engineArgs,
  };
  const canonical = `${jsonStringify(candidate)}\n`;
  const bytes = bufferFrom(canonical, "utf8");
  try {
    parseCanonicalRecord(bytes);
  } finally {
    reflectApply(bufferFill, bytes, [0]);
  }
  return canonical;
}

function buildPrivateClaim(
  record: Readonly<FloodgateV7ProductionConnectorRegistryRecord>,
  homeDirectory: string,
): Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim> {
  const registryRoot = pathJoin(
    homeDirectory,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  const publicationParent = pathJoin(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
  const assetRoot = pathJoin(
    homeDirectory,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  const runBasename = `floodgate-v7-${record.run_id}`;
  const engineArgs = objectFreeze([...record.engine_args]);
  const approvedKeyBinding = frozenRecord({
    recordBytes: record.approved_key_binding.record_bytes,
    recordSha256: record.approved_key_binding.record_sha256,
    keyInstanceId: record.approved_key_binding.key_instance_id,
  });
  const applicationSourceBinding = frozenRecord({
    layout: record.application_source_binding.layout,
    revision: record.application_source_binding.revision,
  });
  const stageAuthorization = frozenRecord({
    repositoryRoot: record.repository_root,
    rawLockRoot: record.raw_lock_root,
    roleLockRoot: record.role_lock_root,
    roleBundleRoot: record.role_bundle_root,
    legacyProtectedPositionIdsPath: record.legacy_protected_position_ids_path,
    publicationParent,
    stageBasename: `${runBasename}-stage`,
    destinationBasename: `${runBasename}-final`,
    engineBin: pathJoin(assetRoot, "engine", "yaneuraou"),
    engineReceipt: pathJoin(assetRoot, "engine", "yaneuraou-receipt.json"),
    engineArgs,
    evalDir: pathJoin(assetRoot, "eval"),
  }) as Readonly<FloodgateTeacherStageAuthorizationOptions>;
  const consumer = frozenRecord({
    repositoryRoot: record.repository_root,
    verifierRevision: record.verifier_revision,
    rawLockRoot: record.raw_lock_root,
    roleLockRoot: record.role_lock_root,
    legacyProtectedPositionIdsPath: record.legacy_protected_position_ids_path,
    outputRoot: record.role_bundle_root,
  }) as Readonly<FloodgateTrainingRowConsumerOptions>;
  return frozenRecord({
    runId: record.run_id,
    approvedKeyBinding,
    applicationSourceBinding,
    stageAuthorization,
    consumer,
  });
}

function issueCapability(
  boundary: FloodgateV7ProductionConnectorRegistryExecutionBoundary,
  claim: Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim>,
): Readonly<FloodgateV7ProductionConnectorRegistryCapability> {
  const capability = frozenRecord({
    contract:
      "shogi-floodgate-v7-production-connector-registry-capability-v1" as const,
    status: "opaque-single-use-private-registry-not-claimed" as const,
    execution_boundary: boundary,
  });
  const stored = frozenRecord({ boundary, claim });
  const registry =
    boundary ===
    "production-fixed-current-euid-userinfo-home-production-connector-registry"
      ? productionCapabilityClaims
      : testCapabilityClaims;
  reflectApply(nativeWeakMapSet, registry, [capability, stored]);
  return capability;
}

async function readFixedRegistry(
  dependencies: CapturedDependencies,
  boundary: FloodgateV7ProductionConnectorRegistryExecutionBoundary,
): Promise<Readonly<FloodgateV7ProductionConnectorRegistryCapability>> {
  const registryRoot = pathJoin(
    dependencies.homeDirectory,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  const directoryPaths = [
    dependencies.homeDirectory,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS.map(
      (_component, index) =>
        pathJoin(
          dependencies.homeDirectory,
          ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS.slice(
            0,
            index + 1,
          ),
        ),
    ),
    pathJoin(registryRoot, FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME),
  ];
  const recordPath = pathJoin(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
  const descriptors: number[] = [];
  const directorySnapshots: Readonly<StatSnapshot>[] = [];
  let recordDescriptor: number | undefined;
  let recordSnapshot: Readonly<StatSnapshot> | undefined;
  let recordBytes: Buffer | undefined;
  let claim:
    Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim> | undefined;
  let failed = false;
  let phase: FloodgateV7ProductionConnectorRegistryPhase = "namespace";
  try {
    for (let index = 0; index < directoryPaths.length; index += 1) {
      const directoryPath = directoryPaths[index];
      if (realpathSync(directoryPath) !== directoryPath) {
        throw new NativeError("registry directory path is not canonical");
      }
      const named = namedSnapshot(directoryPath);
      const safe =
        index === 0
          ? safeHome(named, dependencies.effectiveUserId)
          : safePrivateDirectory(named, dependencies.effectiveUserId);
      if (!safe) throw new NativeError("registry directory metadata is unsafe");
      const descriptor = openSync(directoryPath, DIRECTORY_OPEN_FLAGS);
      descriptors.push(descriptor);
      const held = heldSnapshot(descriptor);
      const namedAfterOpen = namedSnapshot(directoryPath);
      const stillSafe =
        index === 0
          ? safeHome(held, dependencies.effectiveUserId) &&
            safeHome(namedAfterOpen, dependencies.effectiveUserId)
          : safePrivateDirectory(held, dependencies.effectiveUserId) &&
            safePrivateDirectory(namedAfterOpen, dependencies.effectiveUserId);
      if (
        !stillSafe ||
        !sameSnapshot(named, held) ||
        !sameSnapshot(named, namedAfterOpen) ||
        realpathSync(directoryPath) !== directoryPath
      ) {
        throw new NativeError(
          "registry directory identity changed while opening",
        );
      }
      directorySnapshots.push(named);
    }

    phase = "record-open";
    if (realpathSync(recordPath) !== recordPath) {
      throw new NativeError("registry record path is not canonical");
    }
    recordSnapshot = namedSnapshot(recordPath);
    if (!safeRegistryFile(recordSnapshot, dependencies.effectiveUserId)) {
      throw new NativeError("registry record metadata is unsafe");
    }
    recordDescriptor = openSync(recordPath, RECORD_OPEN_FLAGS);
    const heldRecord = heldSnapshot(recordDescriptor);
    const namedRecordAfterOpen = namedSnapshot(recordPath);
    if (
      !safeRegistryFile(heldRecord, dependencies.effectiveUserId) ||
      !safeRegistryFile(namedRecordAfterOpen, dependencies.effectiveUserId) ||
      !sameSnapshot(recordSnapshot, heldRecord) ||
      !sameSnapshot(recordSnapshot, namedRecordAfterOpen) ||
      realpathSync(recordPath) !== recordPath
    ) {
      throw new NativeError("registry record identity changed while opening");
    }

    phase = "record-read";
    const length = NativeNumber(recordSnapshot.size);
    recordBytes = bufferAlloc(length);
    let offset = 0;
    while (offset < length) {
      const read = readSync(
        recordDescriptor,
        recordBytes,
        offset,
        length - offset,
        offset,
      );
      if (read <= 0)
        throw new NativeError("registry record read was incomplete");
      offset += read;
    }
    const extra = bufferAlloc(1);
    try {
      if (readSync(recordDescriptor, extra, 0, 1, length) !== 0) {
        throw new NativeError("registry record grew during its bounded read");
      }
    } finally {
      reflectApply(bufferFill, extra, [0]);
    }

    phase = "record-validation";
    const record = parseCanonicalRecord(recordBytes);
    createSha256("sha256").update(recordBytes).digest("hex");
    if (
      record.contract ===
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT
    ) {
      throw new NativeError(
        "legacy registry is inspectable but cannot issue a capability",
      );
    }
    claim = buildPrivateClaim(record, dependencies.homeDirectory);

    phase = "revalidation";
    if (dependencies.beforeFinalRevalidation !== undefined) {
      await dependencies.beforeFinalRevalidation();
    }
    for (let index = 0; index < directoryPaths.length; index += 1) {
      const directoryPath = directoryPaths[index];
      const descriptor = descriptors[index];
      const before = directorySnapshots[index];
      if (descriptor === undefined || before === undefined) {
        throw new NativeError("registry directory reference is unavailable");
      }
      const namedAfter = namedSnapshot(directoryPath);
      const heldAfter = heldSnapshot(descriptor);
      const stillSafe =
        index === 0
          ? safeHome(namedAfter, dependencies.effectiveUserId) &&
            safeHome(heldAfter, dependencies.effectiveUserId)
          : safePrivateDirectory(namedAfter, dependencies.effectiveUserId) &&
            safePrivateDirectory(heldAfter, dependencies.effectiveUserId);
      if (
        !stillSafe ||
        !sameSnapshot(before, namedAfter) ||
        !sameSnapshot(before, heldAfter) ||
        realpathSync(directoryPath) !== directoryPath
      ) {
        throw new NativeError("registry directory changed before issuance");
      }
    }
    if (recordDescriptor === undefined || recordSnapshot === undefined) {
      throw new NativeError("registry record reference is unavailable");
    }
    const namedRecordAfter = namedSnapshot(recordPath);
    const heldRecordAfter = heldSnapshot(recordDescriptor);
    if (
      !safeRegistryFile(namedRecordAfter, dependencies.effectiveUserId) ||
      !safeRegistryFile(heldRecordAfter, dependencies.effectiveUserId) ||
      !sameSnapshot(recordSnapshot, namedRecordAfter) ||
      !sameSnapshot(recordSnapshot, heldRecordAfter) ||
      realpathSync(recordPath) !== recordPath
    ) {
      throw new NativeError("registry record changed before issuance");
    }
  } catch {
    failed = true;
  } finally {
    if (recordBytes !== undefined) {
      reflectApply(bufferFill, recordBytes, [0]);
    }
    if (recordDescriptor !== undefined) {
      try {
        dependencies.closeFile(recordDescriptor);
      } catch {
        if (!failed) phase = "cleanup";
        failed = true;
      }
    }
    for (let index = descriptors.length - 1; index >= 0; index -= 1) {
      try {
        const descriptor = descriptors[index];
        if (descriptor !== undefined) dependencies.closeFile(descriptor);
      } catch {
        if (!failed) phase = "cleanup";
        failed = true;
      }
    }
  }
  if (failed || claim === undefined) {
    throw new FloodgateV7ProductionConnectorRegistryError(phase);
  }
  return issueCapability(boundary, claim);
}

export function loadFloodgateV7ProductionConnectorRegistryCoreForTests(
  dependenciesValue: FloodgateV7ProductionConnectorRegistryDependenciesForTests,
): Promise<Readonly<FloodgateV7ProductionConnectorRegistryCapability>> {
  if (arguments.length !== 1) {
    return rejected(new FloodgateV7ProductionConnectorRegistryError("capture"));
  }
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(new FloodgateV7ProductionConnectorRegistryError("capture"));
  }
  try {
    assertTestHomeIsSeparate(dependencies);
  } catch {
    return rejected(
      new FloodgateV7ProductionConnectorRegistryError("test-boundary"),
    );
  }
  return readFixedRegistry(
    dependencies,
    "test-only-injected-current-euid-home-production-connector-registry",
  );
}

/** Zero-argument production loader for the fixed current-user registry. */
export function loadFloodgateV7ProductionConnectorRegistry(): Promise<
  Readonly<FloodgateV7ProductionConnectorRegistryCapability>
> {
  if (arguments.length !== 0 || getEffectiveUserId === null) {
    return rejected(new FloodgateV7ProductionConnectorRegistryError("capture"));
  }
  let dependencies: CapturedDependencies;
  try {
    const effectiveUserId = getEffectiveUserId();
    const userInfo = getUserInfo();
    if (
      userInfo.uid !== effectiveUserId ||
      !canonicalNonRootAbsolutePath(userInfo.homedir)
    ) {
      throw new NativeError("production current-user identity differs");
    }
    dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: userInfo.homedir,
    });
  } catch {
    return rejected(
      new FloodgateV7ProductionConnectorRegistryError("production-identity"),
    );
  }
  return readFixedRegistry(
    dependencies,
    "production-fixed-current-euid-userinfo-home-production-connector-registry",
  );
}

function claimCapability(
  capability: FloodgateV7ProductionConnectorRegistryCapability,
  expectedBoundary: FloodgateV7ProductionConnectorRegistryExecutionBoundary,
  registry: WeakMap<object, StoredCapability>,
): Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim> {
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeIsProxy(capability)
  ) {
    throw new FloodgateV7ProductionConnectorRegistryError("claim");
  }
  const stored = reflectApply(nativeWeakMapGet, registry, [capability]) as
    StoredCapability | undefined;
  if (stored === undefined || stored.boundary !== expectedBoundary) {
    throw new FloodgateV7ProductionConnectorRegistryError("claim");
  }
  reflectApply(nativeWeakMapDelete, registry, [capability]);
  return stored.claim;
}

export function claimFloodgateV7ProductionConnectorRegistry(
  capability: FloodgateV7ProductionConnectorRegistryCapability,
): Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim> {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionConnectorRegistryError("claim");
  }
  return claimCapability(
    capability,
    "production-fixed-current-euid-userinfo-home-production-connector-registry",
    productionCapabilityClaims,
  );
}

export function claimFloodgateV7ProductionConnectorRegistryCoreForTests(
  capability: FloodgateV7ProductionConnectorRegistryCapability,
): Readonly<FloodgateV7ProductionConnectorRegistryPrivateClaim> {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionConnectorRegistryError("claim");
  }
  return claimCapability(
    capability,
    "test-only-injected-current-euid-home-production-connector-registry",
    testCapabilityClaims,
  );
}
