/**
 * Read-only filesystem scan for a caller-supplied prefix-100 work anchor.
 *
 * This low-level module neither receives nor proves a production connector or
 * outer-lock capability. It does not possess the HMAC key and cannot promote a
 * caller-supplied digest into authenticated-continuity evidence. The fixed
 * runner owns that composition and may promote a successful scan only after it
 * has validated the genuine connector receipt under the outer owner.
 */

import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
} from "./floodgate-v7-teacher-checkpoint";

export const FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_CONTRACT =
  "shogi-floodgate-v7-prefix-100-caller-anchor-read-only-filesystem-scan-v1" as const;
export const FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_STATUS =
  "caller-anchor-byte-and-namespace-scan-complete-not-production-origin" as const;
export const FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY =
  "caller-supplied-anchor-native-read-only-scan-without-lock-connector-hmac-or-gate-origin" as const;

export interface FloodgateV7Prefix100WorkScanAnchor {
  readonly publicationParent: string;
  readonly stageBasename: string;
  readonly destinationBasename: string;
  readonly workBasename: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME;
  readonly workBytes: number;
  readonly workSha256: string;
  readonly workRecords: 102;
  readonly completedParents: 100;
}

export interface FloodgateV7Prefix100CallerAnchorScanReceipt {
  readonly contract: typeof FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_STATUS;
  readonly execution_boundary: typeof FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY;
  readonly verification: Readonly<{
    readonly namespace_exact: true;
    readonly held_vs_named_identity_matched: true;
    readonly anchor_bytes_digest_and_record_count_matched: true;
    readonly descriptors_closed: true;
    readonly namespace_or_file_content_mutated: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly outer_lock_origin: false;
    readonly connector_receipt_origin: false;
    readonly independent_hmac_authentication: false;
    readonly authenticated_continuity: false;
    readonly production_gate_authority: false;
    readonly atime_invariance: false;
  }>;
}

export interface FloodgateV7Prefix100CallerAnchorScanDependenciesForTests {
  readonly effectiveUserId: number;
  readonly afterReadForTests?: () => void | Promise<void>;
  readonly closeDescriptorForTests?: (
    kind: "work" | "stage" | "runs",
    descriptor: number,
  ) => void;
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

interface HeldPath {
  readonly descriptor: number;
  readonly pathname: string;
  readonly initial: Readonly<StatSnapshot>;
}

const NativeError = Error;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const pathJoin = path.join.bind(path);
const pathResolve = path.resolve.bind(path);
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathBasename = path.basename.bind(path);
const realpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const lstatSync = fs.lstatSync.bind(fs);
const fstatSync = fs.fstatSync.bind(fs);
const openSync = fs.openSync.bind(fs);
const closeSync = fs.closeSync.bind(fs);
const readdirSync = fs.readdirSync.bind(fs);
const readSync = fs.readSync.bind(fs);
const nativeTimingSafeEqual = timingSafeEqual;
const bufferFrom = Buffer.from.bind(Buffer);
const bufferFill = Buffer.prototype.fill;
const HEX_64_RE = /^[0-9a-f]{64}$/u;
const MODE_MASK = BigInt(0o7777);
const TYPE_MASK = BigInt(fs.constants.S_IFMT);
const DIRECTORY_TYPE = BigInt(fs.constants.S_IFDIR);
const REGULAR_TYPE = BigInt(fs.constants.S_IFREG);
const PRIVATE_DIRECTORY_MODE = BigInt(0o700);
const PRIVATE_FILE_MODE = BigInt(0o600);
const DIRECTORY_OPEN_FLAGS =
  fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const FILE_OPEN_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const READ_CHUNK_BYTES = 64 * 1024;
const ANCHOR_KEYS = objectFreeze([
  "publicationParent",
  "stageBasename",
  "destinationBasename",
  "workBasename",
  "workBytes",
  "workSha256",
  "workRecords",
  "completedParents",
] as const);
const DEPENDENCY_KEYS = objectFreeze([
  "effectiveUserId",
  "afterReadForTests",
  "closeDescriptorForTests",
] as const);

function defineField(
  target: object,
  key: PropertyKey,
  value: unknown,
  enumerable: boolean,
): void {
  objectDefineProperty(target, key, {
    configurable: false,
    enumerable,
    writable: false,
    value,
  });
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("postflight record differs");
    }
    defineField(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("postflight input differs");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new NativeError("postflight input differs");
  }
  const output = objectCreate(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("postflight input differs");
    }
    output[key] = descriptor.value;
  }
  return output;
}

function strictBasename(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255 ||
    value.includes("\0") ||
    value === "." ||
    value === ".." ||
    pathBasename(value) !== value
  ) {
    throw new NativeError("postflight basename differs");
  }
  return value;
}

function captureAnchor(
  value: Readonly<FloodgateV7Prefix100WorkScanAnchor>,
): Readonly<FloodgateV7Prefix100WorkScanAnchor> {
  const anchor = exactRecord(value, ANCHOR_KEYS);
  const publicationParent = anchor.publicationParent;
  if (
    typeof publicationParent !== "string" ||
    publicationParent.length < 1 ||
    publicationParent.length > 4096 ||
    publicationParent.includes("\0") ||
    !pathIsAbsolute(publicationParent) ||
    pathResolve(publicationParent) !== publicationParent
  ) {
    throw new NativeError("postflight publication parent differs");
  }
  const stageBasename = strictBasename(anchor.stageBasename);
  const destinationBasename = strictBasename(anchor.destinationBasename);
  if (
    stageBasename === destinationBasename ||
    anchor.workBasename !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME ||
    typeof anchor.workBytes !== "number" ||
    !Number.isSafeInteger(anchor.workBytes) ||
    anchor.workBytes < 1 ||
    anchor.workBytes > FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES ||
    typeof anchor.workSha256 !== "string" ||
    !HEX_64_RE.test(anchor.workSha256) ||
    anchor.workRecords !== 102 ||
    anchor.completedParents !== 100
  ) {
    throw new NativeError("postflight work anchor differs");
  }
  return frozenRecord({
    publicationParent,
    stageBasename,
    destinationBasename,
    workBasename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    workBytes: anchor.workBytes,
    workSha256: anchor.workSha256,
    workRecords: 102 as const,
    completedParents: 100 as const,
  });
}

function captureDependencies(
  value: FloodgateV7Prefix100CallerAnchorScanDependenciesForTests,
): Readonly<{
  effectiveUserId: number;
  afterRead: (() => void | Promise<void>) | undefined;
  closeDescriptor: (
    kind: "work" | "stage" | "runs",
    descriptor: number,
  ) => void;
}> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw new NativeError("postflight dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = DEPENDENCY_KEYS.filter(
    (key) => key === "effectiveUserId" || descriptors[key] !== undefined,
  );
  const dependencies = exactRecord(value, keys);
  if (
    typeof dependencies.effectiveUserId !== "number" ||
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0 ||
    (dependencies.afterReadForTests !== undefined &&
      typeof dependencies.afterReadForTests !== "function") ||
    (dependencies.closeDescriptorForTests !== undefined &&
      typeof dependencies.closeDescriptorForTests !== "function")
  ) {
    throw new NativeError("postflight dependencies differ");
  }
  const injectedClose = dependencies.closeDescriptorForTests as
    | FloodgateV7Prefix100CallerAnchorScanDependenciesForTests["closeDescriptorForTests"]
    | undefined;
  return frozenRecord({
    effectiveUserId: dependencies.effectiveUserId,
    afterRead: dependencies.afterReadForTests as
      (() => void | Promise<void>) | undefined,
    closeDescriptor:
      injectedClose ?? ((_kind, descriptor) => closeSync(descriptor)),
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

function namedSnapshot(pathname: string): Readonly<StatSnapshot> {
  return snapshot(lstatSync(pathname, { bigint: true }));
}

function heldSnapshot(descriptor: number): Readonly<StatSnapshot> {
  return snapshot(fstatSync(descriptor, { bigint: true }));
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

function safeDirectory(stat: StatSnapshot, uid: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === DIRECTORY_TYPE &&
    (stat.mode & MODE_MASK) === PRIVATE_DIRECTORY_MODE &&
    stat.uid === BigInt(uid)
  );
}

function safeWork(stat: StatSnapshot, uid: number, bytes: number): boolean {
  return (
    (stat.mode & TYPE_MASK) === REGULAR_TYPE &&
    (stat.mode & MODE_MASK) === PRIVATE_FILE_MODE &&
    stat.uid === BigInt(uid) &&
    stat.nlink === BigInt(1) &&
    stat.size === BigInt(bytes)
  );
}

function openHeld(
  pathname: string,
  flags: number,
  safe: (stat: StatSnapshot) => boolean,
): HeldPath {
  if (realpathSync(pathname) !== pathname) {
    throw new NativeError("postflight canonical path differs");
  }
  const before = namedSnapshot(pathname);
  if (!safe(before)) throw new NativeError("postflight metadata differs");
  const descriptor = openSync(pathname, flags);
  try {
    const held = heldSnapshot(descriptor);
    const named = namedSnapshot(pathname);
    if (
      !safe(held) ||
      !safe(named) ||
      !sameSnapshot(before, held) ||
      !sameSnapshot(before, named) ||
      realpathSync(pathname) !== pathname
    ) {
      throw new NativeError("postflight held identity differs");
    }
    return frozenRecord({ descriptor, pathname, initial: before });
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function revalidateHeld(
  heldPath: HeldPath,
  safe: (stat: StatSnapshot) => boolean,
): void {
  const held = heldSnapshot(heldPath.descriptor);
  const named = namedSnapshot(heldPath.pathname);
  if (
    !safe(held) ||
    !safe(named) ||
    !sameSnapshot(heldPath.initial, held) ||
    !sameSnapshot(heldPath.initial, named) ||
    realpathSync(heldPath.pathname) !== heldPath.pathname
  ) {
    throw new NativeError("postflight path changed");
  }
}

function exactEntries(pathname: string, expected: readonly string[]): void {
  const entries = [...readdirSync(pathname)].sort();
  if (
    entries.length !== expected.length ||
    entries.some((entry, index) => entry !== expected[index])
  ) {
    throw new NativeError("postflight namespace differs");
  }
}

function assertAbsent(pathname: string): void {
  try {
    lstatSync(pathname);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new NativeError("postflight path unexpectedly exists");
}

function privateHexMatches(expected: string, actual: string): boolean {
  const expectedBytes = bufferFrom(expected, "ascii");
  const actualBytes = bufferFrom(actual, "ascii");
  try {
    return nativeTimingSafeEqual(expectedBytes, actualBytes);
  } finally {
    Reflect.apply(bufferFill, expectedBytes, [0]);
    Reflect.apply(bufferFill, actualBytes, [0]);
  }
}

function scanWork(
  descriptor: number,
  expectedBytes: number,
): Readonly<{ sha256: string; records: number }> {
  const hash = createHash("sha256");
  const chunk = Buffer.alloc(Math.min(READ_CHUNK_BYTES, expectedBytes));
  let offset = 0;
  let records = 0;
  let finalByte = -1;
  try {
    while (offset < expectedBytes) {
      const requested = Math.min(chunk.length, expectedBytes - offset);
      const bytesRead = readSync(descriptor, chunk, 0, requested, offset);
      if (bytesRead < 1) throw new NativeError("postflight work was truncated");
      hash.update(chunk.subarray(0, bytesRead));
      for (let index = 0; index < bytesRead; index += 1) {
        if (chunk[index] === 0x0a) records += 1;
      }
      finalByte = chunk[bytesRead - 1] ?? -1;
      offset += bytesRead;
    }
    if (readSync(descriptor, chunk, 0, 1, expectedBytes) !== 0) {
      throw new NativeError("postflight work has an unauthenticated tail");
    }
    if (finalByte !== 0x0a) {
      throw new NativeError("postflight work has a torn final record");
    }
    return frozenRecord({ sha256: hash.digest("hex"), records });
  } finally {
    Reflect.apply(bufferFill, chunk, [0]);
  }
}

async function verifyCaptured(
  anchor: Readonly<FloodgateV7Prefix100WorkScanAnchor>,
  dependencies: ReturnType<typeof captureDependencies>,
): Promise<Readonly<FloodgateV7Prefix100CallerAnchorScanReceipt>> {
  const stagePath = pathJoin(anchor.publicationParent, anchor.stageBasename);
  const destinationPath = pathJoin(
    anchor.publicationParent,
    anchor.destinationBasename,
  );
  const leasePath = pathJoin(
    anchor.publicationParent,
    `.${anchor.stageBasename}.authorization-lease`,
  );
  const workPath = pathJoin(stagePath, anchor.workBasename);
  if (
    pathResolve(stagePath) !== stagePath ||
    pathResolve(destinationPath) !== destinationPath ||
    pathResolve(leasePath) !== leasePath ||
    pathResolve(workPath) !== workPath
  ) {
    throw new NativeError("postflight path containment differs");
  }

  let runs: HeldPath | undefined;
  let stage: HeldPath | undefined;
  let work: HeldPath | undefined;
  let primaryFailed = false;
  try {
    runs = openHeld(anchor.publicationParent, DIRECTORY_OPEN_FLAGS, (stat) =>
      safeDirectory(stat, dependencies.effectiveUserId),
    );
    exactEntries(anchor.publicationParent, [anchor.stageBasename]);
    assertAbsent(destinationPath);
    assertAbsent(leasePath);

    stage = openHeld(stagePath, DIRECTORY_OPEN_FLAGS, (stat) =>
      safeDirectory(stat, dependencies.effectiveUserId),
    );
    exactEntries(stagePath, [anchor.workBasename]);
    work = openHeld(workPath, FILE_OPEN_FLAGS, (stat) =>
      safeWork(stat, dependencies.effectiveUserId, anchor.workBytes),
    );
    const scan = scanWork(work.descriptor, anchor.workBytes);
    if (
      scan.records !== anchor.workRecords ||
      !privateHexMatches(anchor.workSha256, scan.sha256)
    ) {
      throw new NativeError("postflight work continuity differs");
    }
    await dependencies.afterRead?.();

    revalidateHeld(work, (stat) =>
      safeWork(stat, dependencies.effectiveUserId, anchor.workBytes),
    );
    exactEntries(stagePath, [anchor.workBasename]);
    revalidateHeld(stage, (stat) =>
      safeDirectory(stat, dependencies.effectiveUserId),
    );
    exactEntries(anchor.publicationParent, [anchor.stageBasename]);
    assertAbsent(destinationPath);
    assertAbsent(leasePath);
    revalidateHeld(runs, (stat) =>
      safeDirectory(stat, dependencies.effectiveUserId),
    );
  } catch {
    primaryFailed = true;
  }

  const closeFailures: unknown[] = [];
  for (const [kind, heldPath] of [
    ["work", work],
    ["stage", stage],
    ["runs", runs],
  ] as const) {
    if (heldPath === undefined) continue;
    try {
      dependencies.closeDescriptor(kind, heldPath.descriptor);
    } catch (error) {
      closeFailures.push(error);
    }
  }
  if (primaryFailed || closeFailures.length !== 0) {
    throw new NativeError("prefix 100 continuity postflight failed");
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_CONTRACT,
    status: FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_STATUS,
    execution_boundary:
      FLOODGATE_V7_PREFIX_100_CALLER_ANCHOR_SCAN_EXECUTION_BOUNDARY,
    verification: frozenRecord({
      namespace_exact: true as const,
      held_vs_named_identity_matched: true as const,
      anchor_bytes_digest_and_record_count_matched: true as const,
      descriptors_closed: true as const,
      namespace_or_file_content_mutated: false as const,
    }),
    nonclaims: frozenRecord({
      outer_lock_origin: false as const,
      connector_receipt_origin: false as const,
      independent_hmac_authentication: false as const,
      authenticated_continuity: false as const,
      production_gate_authority: false as const,
      atime_invariance: false as const,
    }),
  });
}

/** Test-only dependency-injected form of the non-authorizing scanner. */
export function scanFloodgateV7Prefix100CallerAnchorCoreForTests(
  anchorValue: Readonly<FloodgateV7Prefix100WorkScanAnchor>,
  dependenciesValue: FloodgateV7Prefix100CallerAnchorScanDependenciesForTests,
): Promise<Readonly<FloodgateV7Prefix100CallerAnchorScanReceipt>> {
  try {
    if (arguments.length !== 2)
      throw new NativeError("postflight arity differs");
    return verifyCaptured(
      captureAnchor(anchorValue),
      captureDependencies(dependenciesValue),
    );
  } catch (error) {
    return new NativePromise((_resolve, reject) => reject(error));
  }
}

/**
 * Native read-only scanner for an explicitly caller-supplied anchor. This is
 * not a production owner, outer-lock claim, connector-origin receipt, HMAC
 * verifier, authenticated-continuity receipt, or gate capability.
 */
export function scanFloodgateV7Prefix100CallerAnchor(
  anchorValue: Readonly<FloodgateV7Prefix100WorkScanAnchor>,
): Promise<Readonly<FloodgateV7Prefix100CallerAnchorScanReceipt>> {
  try {
    if (arguments.length !== 1 || typeof process.geteuid !== "function") {
      throw new NativeError("postflight production identity differs");
    }
    return verifyCaptured(
      captureAnchor(anchorValue),
      captureDependencies({ effectiveUserId: process.geteuid() }),
    );
  } catch (error) {
    return new NativePromise((_resolve, reject) => reject(error));
  }
}
