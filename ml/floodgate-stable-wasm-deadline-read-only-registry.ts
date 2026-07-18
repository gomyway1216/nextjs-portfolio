/**
 * Purpose-limited read-only loader for the fixed Floodgate v7 registry.
 *
 * Unlike the general production connector module, this boundary exposes only
 * the application-source binding and training-consumer paths needed by the
 * stable-WASM deadline diagnostic. It contains no stage, writer, engine, or
 * publication authority.
 */

import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT =
  "fixed-current-euid-userinfo-home-production-application-v1" as const;

export interface FloodgateStableWasmDeadlineReadOnlyConsumerOptions {
  readonly legacyProtectedPositionIdsPath: string;
  readonly outputRoot: string;
  readonly rawLockRoot: string;
  readonly repositoryRoot: string;
  readonly roleLockRoot: string;
  readonly verifierRevision: string;
}

export interface FloodgateStableWasmDeadlineReadOnlyRegistryClaim {
  readonly applicationSourceBinding: Readonly<{
    readonly layout: typeof FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT;
    readonly revision: string;
  }>;
  readonly consumer: Readonly<FloodgateStableWasmDeadlineReadOnlyConsumerOptions>;
}

export interface FloodgateStableWasmDeadlineReadOnlyRegistryCapability {
  readonly contract: "shogi-floodgate-stable-wasm-deadline-read-only-registry-capability-v1";
  readonly status: "opaque-single-use-private-registry-not-claimed";
}

export interface FloodgateStableWasmDeadlineReadOnlyRegistryDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly beforeFinalRevalidationForTests?: () => void | Promise<void>;
}

const REGISTRY_CONTRACT =
  "shogi-floodgate-v7-production-connector-registry-record-v2";
const REGISTRY_STATUS = "fixed-private-production-connector-run-registry";
const REGISTRY_LAYOUT = "fixed-current-euid-userinfo-home-v1";
export const FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS =
  Object.freeze([
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-floodgate-v7-production-connector-v1",
  ] as const);
export const FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME =
  "registry.json" as const;
const RUNS_BASENAME = "runs";
const MAX_RECORD_BYTES = 64 * 1024;
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
const APPROVED_BINDING_KEYS = Object.freeze([
  "record_bytes",
  "record_sha256",
  "key_instance_id",
] as const);
const SOURCE_BINDING_KEYS = Object.freeze(["layout", "revision"] as const);
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const SAFE_OPTION_RE = /^--?[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);
const DIRECTORY_MODE = BigInt(0o700);
const FILE_MODE = BigInt(0o600);
const HOME_OWNER_MODE = BigInt(0o700);
const HOME_FORBIDDEN_MODE = BigInt(0o7022);
const DIRECTORY_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const FILE_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const productionClaims = new WeakMap<
  object,
  Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim>
>();
const testClaims = new WeakMap<
  object,
  Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim>
>();

interface Snapshot {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly mtimeNs: bigint;
  readonly nlink: bigint;
  readonly size: bigint;
  readonly uid: bigint;
}

function fail(): never {
  throw new Error("stable-WASM deadline read-only registry rejected");
}

function canonicalNonRootPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    value.length <= 4096 &&
    value.trim() === value &&
    !CONTROL_RE.test(value) &&
    path.isAbsolute(value) &&
    path.resolve(value) === value &&
    path.parse(value).root !== value
  );
}

function snapshot(value: fs.BigIntStats): Readonly<Snapshot> {
  return Object.freeze({
    ctimeNs: value.ctimeNs,
    dev: value.dev,
    ino: value.ino,
    mode: value.mode,
    mtimeNs: value.mtimeNs,
    nlink: value.nlink,
    size: value.size,
    uid: value.uid,
  });
}

function sameSnapshot(
  left: Readonly<Snapshot>,
  right: Readonly<Snapshot>,
): boolean {
  return (
    left.ctimeNs === right.ctimeNs &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.mtimeNs === right.mtimeNs &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.uid === right.uid
  );
}

function safeDirectory(
  value: Readonly<Snapshot>,
  effectiveUserId: number,
  isHome: boolean,
): boolean {
  const permissions = value.mode & MODE_MASK;
  return (
    (value.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    value.uid === BigInt(effectiveUserId) &&
    (isHome
      ? (permissions & HOME_OWNER_MODE) === HOME_OWNER_MODE &&
        (permissions & HOME_FORBIDDEN_MODE) === BigInt(0)
      : permissions === DIRECTORY_MODE)
  );
}

function safeRecord(
  value: Readonly<Snapshot>,
  effectiveUserId: number,
): boolean {
  return (
    (value.mode & TYPE_MASK) === REGULAR_TYPE &&
    (value.mode & MODE_MASK) === FILE_MODE &&
    value.uid === BigInt(effectiveUserId) &&
    value.nlink === BigInt(1) &&
    value.size >= BigInt(2) &&
    value.size <= BigInt(MAX_RECORD_BYTES)
  );
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key, index) => typeof key !== "string" || key !== keys[index])
  ) {
    fail();
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail();
    }
    Object.defineProperty(captured, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: descriptor.value,
    });
  }
  return Object.freeze(captured);
}

function requiredDigest(value: unknown): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) fail();
  return value;
}

function requiredRevision(value: unknown): string {
  if (typeof value !== "string" || !REVISION_RE.test(value)) fail();
  return value;
}

function validateEngineArguments(value: unknown): void {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 64
  ) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    const argument =
      descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : null;
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      typeof argument !== "string" ||
      argument.length < 1 ||
      argument.length > 4096 ||
      argument.trim() !== argument ||
      CONTROL_RE.test(argument) ||
      (!SAFE_OPTION_RE.test(argument) && !canonicalNonRootPath(argument))
    ) {
      fail();
    }
  }
}

function parseRecord(
  bytes: Buffer,
): Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim> {
  if (
    bytes.byteLength < 2 ||
    bytes.byteLength > MAX_RECORD_BYTES ||
    (bytes.byteLength >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf)
  ) {
    fail();
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
  } catch {
    return fail();
  }
  if (
    !text.endsWith("\n") ||
    text.indexOf("\n") !== text.length - 1 ||
    text.includes("\r") ||
    text.charCodeAt(0) === 0xfeff
  ) {
    fail();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1)) as unknown;
  } catch {
    return fail();
  }
  if (`${JSON.stringify(parsed)}\n` !== text) fail();
  const record = exactDataRecord(parsed, RECORD_KEYS);
  if (
    record.contract !== REGISTRY_CONTRACT ||
    record.status !== REGISTRY_STATUS ||
    record.layout !== REGISTRY_LAYOUT
  ) {
    fail();
  }
  requiredDigest(record.run_id);
  const approved = exactDataRecord(
    record.approved_key_binding,
    APPROVED_BINDING_KEYS,
  );
  if (
    !Number.isSafeInteger(approved.record_bytes) ||
    (approved.record_bytes as number) < 2 ||
    (approved.record_bytes as number) > MAX_RECORD_BYTES
  ) {
    fail();
  }
  requiredDigest(approved.record_sha256);
  requiredDigest(approved.key_instance_id);
  const verifierRevision = requiredRevision(record.verifier_revision);
  const source = exactDataRecord(
    record.application_source_binding,
    SOURCE_BINDING_KEYS,
  );
  if (
    source.layout !== FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT
  ) {
    fail();
  }
  const applicationRevision = requiredRevision(source.revision);
  for (const key of [
    "repository_root",
    "raw_lock_root",
    "role_lock_root",
    "role_bundle_root",
    "legacy_protected_position_ids_path",
  ] as const) {
    if (!canonicalNonRootPath(record[key])) fail();
  }
  validateEngineArguments(record.engine_args);
  return Object.freeze({
    applicationSourceBinding: Object.freeze({
      layout: FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
      revision: applicationRevision,
    }),
    consumer: Object.freeze({
      legacyProtectedPositionIdsPath:
        record.legacy_protected_position_ids_path as string,
      outputRoot: record.role_bundle_root as string,
      rawLockRoot: record.raw_lock_root as string,
      repositoryRoot: record.repository_root as string,
      roleLockRoot: record.role_lock_root as string,
      verifierRevision,
    }),
  });
}

function captureDependencies(
  value: FloodgateStableWasmDeadlineReadOnlyRegistryDependenciesForTests,
): Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryDependenciesForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" ||
        ![
          "beforeFinalRevalidationForTests",
          "effectiveUserId",
          "homeDirectory",
        ].includes(key),
    ) ||
    descriptors.effectiveUserId === undefined ||
    descriptors.homeDirectory === undefined
  ) {
    fail();
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.enumerable !== true) fail();
  }
  const effectiveUserId = descriptors.effectiveUserId.value;
  const homeDirectory = descriptors.homeDirectory.value;
  const hook = descriptors.beforeFinalRevalidationForTests?.value;
  if (
    !Number.isSafeInteger(effectiveUserId) ||
    (effectiveUserId as number) <= 0 ||
    !canonicalNonRootPath(homeDirectory) ||
    (hook !== undefined &&
      (typeof hook !== "function" || nodeUtilTypes.isProxy(hook)))
  ) {
    fail();
  }
  return Object.freeze({
    effectiveUserId: effectiveUserId as number,
    homeDirectory,
    ...(hook === undefined
      ? {}
      : { beforeFinalRevalidationForTests: hook as () => void }),
  });
}

function issueCapability(
  registry: WeakMap<
    object,
    Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim>
  >,
  claim: Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim>,
): Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryCapability> {
  const capability = Object.freeze({
    contract:
      "shogi-floodgate-stable-wasm-deadline-read-only-registry-capability-v1" as const,
    status: "opaque-single-use-private-registry-not-claimed" as const,
  });
  registry.set(capability, claim);
  return capability;
}

async function load(
  dependenciesInput: FloodgateStableWasmDeadlineReadOnlyRegistryDependenciesForTests,
  claims: WeakMap<
    object,
    Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim>
  >,
): Promise<Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryCapability>> {
  const dependencies = captureDependencies(dependenciesInput);
  const registryRoot = path.join(
    dependencies.homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS,
  );
  const directories = [
    dependencies.homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS.map(
      (_component, index) =>
        path.join(
          dependencies.homeDirectory,
          ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS.slice(
            0,
            index + 1,
          ),
        ),
    ),
    path.join(registryRoot, RUNS_BASENAME),
  ];
  const recordPath = path.join(
    registryRoot,
    FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME,
  );
  const directoryHandles: fs.promises.FileHandle[] = [];
  const directorySnapshots: Readonly<Snapshot>[] = [];
  let recordHandle: fs.promises.FileHandle | undefined;
  let recordBefore: Readonly<Snapshot> | undefined;
  let bytes: Buffer | undefined;
  let primary: unknown;
  try {
    for (let index = 0; index < directories.length; index += 1) {
      const directoryPath = directories[index];
      if (fs.realpathSync.native(directoryPath) !== directoryPath) {
        fail();
      }
      const before = snapshot(
        await fs.promises.lstat(directoryPath, { bigint: true }),
      );
      if (!safeDirectory(before, dependencies.effectiveUserId, index === 0)) {
        fail();
      }
      const handle = await fs.promises.open(directoryPath, DIRECTORY_FLAGS);
      directoryHandles.push(handle);
      const held = snapshot(await handle.stat({ bigint: true }));
      const after = snapshot(
        await fs.promises.lstat(directoryPath, { bigint: true }),
      );
      if (
        !safeDirectory(held, dependencies.effectiveUserId, index === 0) ||
        !sameSnapshot(before, held) ||
        !sameSnapshot(held, after)
      ) {
        fail();
      }
      directorySnapshots.push(before);
    }

    if (fs.realpathSync.native(recordPath) !== recordPath) fail();
    recordBefore = snapshot(
      await fs.promises.lstat(recordPath, { bigint: true }),
    );
    if (!safeRecord(recordBefore, dependencies.effectiveUserId)) fail();
    recordHandle = await fs.promises.open(recordPath, FILE_FLAGS);
    const held = snapshot(await recordHandle.stat({ bigint: true }));
    if (!sameSnapshot(recordBefore, held)) fail();
    bytes = await recordHandle.readFile();
    if (BigInt(bytes.byteLength) !== held.size) fail();
    const claim = parseRecord(bytes);

    await dependencies.beforeFinalRevalidationForTests?.();
    for (let index = 0; index < directories.length; index += 1) {
      const heldAfter = snapshot(
        await directoryHandles[index].stat({ bigint: true }),
      );
      const namedAfter = snapshot(
        await fs.promises.lstat(directories[index], { bigint: true }),
      );
      if (
        !sameSnapshot(directorySnapshots[index], heldAfter) ||
        !sameSnapshot(heldAfter, namedAfter) ||
        fs.realpathSync.native(directories[index]) !== directories[index]
      ) {
        fail();
      }
    }
    const recordHeldAfter = snapshot(await recordHandle.stat({ bigint: true }));
    const recordNamedAfter = snapshot(
      await fs.promises.lstat(recordPath, { bigint: true }),
    );
    if (
      !sameSnapshot(recordBefore, recordHeldAfter) ||
      !sameSnapshot(recordHeldAfter, recordNamedAfter) ||
      fs.realpathSync.native(recordPath) !== recordPath
    ) {
      fail();
    }
    return issueCapability(claims, claim);
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    bytes?.fill(0);
    const closeErrors: unknown[] = [];
    if (recordHandle !== undefined) {
      try {
        await recordHandle.close();
      } catch (error) {
        closeErrors.push(error);
      }
    }
    for (let index = directoryHandles.length - 1; index >= 0; index -= 1) {
      try {
        await directoryHandles[index].close();
      } catch (error) {
        closeErrors.push(error);
      }
    }
    if (closeErrors.length > 0 && primary === undefined) fail();
  }
}

function claim(
  capability: FloodgateStableWasmDeadlineReadOnlyRegistryCapability,
  claims: WeakMap<
    object,
    Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim>
  >,
): Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim> {
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeUtilTypes.isProxy(capability)
  ) {
    fail();
  }
  const stored = claims.get(capability);
  if (stored === undefined) fail();
  claims.delete(capability);
  return stored;
}

export function loadFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests(
  dependencies: FloodgateStableWasmDeadlineReadOnlyRegistryDependenciesForTests,
): Promise<Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryCapability>> {
  if (arguments.length !== 1) {
    return Promise.reject(new Error("read-only registry invocation rejected"));
  }
  return load(dependencies, testClaims);
}

export function claimFloodgateStableWasmDeadlineReadOnlyRegistryCoreForTests(
  capability: FloodgateStableWasmDeadlineReadOnlyRegistryCapability,
): Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim> {
  if (arguments.length !== 1) fail();
  return claim(capability, testClaims);
}

export function loadFloodgateStableWasmDeadlineReadOnlyRegistry(): Promise<
  Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryCapability>
> {
  if (
    arguments.length !== 0 ||
    process.platform !== "darwin" ||
    process.arch !== "arm64" ||
    typeof process.geteuid !== "function"
  ) {
    return Promise.reject(new Error("read-only registry platform rejected"));
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os.userInfo();
    if (
      user.uid !== effectiveUserId ||
      effectiveUserId <= 0 ||
      !canonicalNonRootPath(user.homedir)
    ) {
      fail();
    }
    return load(
      {
        effectiveUserId,
        homeDirectory: user.homedir,
      },
      productionClaims,
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

export function claimFloodgateStableWasmDeadlineReadOnlyRegistry(
  capability: FloodgateStableWasmDeadlineReadOnlyRegistryCapability,
): Readonly<FloodgateStableWasmDeadlineReadOnlyRegistryClaim> {
  if (arguments.length !== 1) fail();
  return claim(capability, productionClaims);
}
