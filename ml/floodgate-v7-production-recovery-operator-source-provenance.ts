/**
 * Private source provenance for the fixed Floodgate v7 production recovery
 * operator checkout.
 *
 * This trust root is intentionally distinct from the production application
 * checkout. Production capture accepts neither a caller-selected path nor a
 * caller-selected revision and exports only a layout tag plus the exact clean
 * tracked Git revision.
 */

import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify, types as nodeUtilTypes } from "node:util";

import {
  captureFloodgateGitExactCleanRevision,
  floodgateGitEnvironment,
  FLOODGATE_GIT_COMMAND_PREFIX,
  FLOODGATE_GIT_EXECUTABLE,
} from "./floodgate-git";

export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT =
  "fixed-current-euid-userinfo-home-production-recovery-operator-v1" as const;
export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_TRACKED_PATHS =
  Object.freeze([
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "ml/helpers/floodgate-v7-production-recovery-operator-native-launcher.jxa",
    "ml/inspect-floodgate-v7-production-stale-prefix-100-recovery.ts",
    "ml/floodgate-v7-production-recovery-operator-native-launcher-attestation.ts",
    "ml/floodgate-v7-production-recovery-operator-source-authorization.ts",
    "ml/floodgate-v7-production-recovery-operator-source-provenance.ts",
    "ml/floodgate-git.ts",
  ] as const);

export interface FloodgateV7ProductionRecoveryOperatorSourceBinding {
  readonly layout: typeof FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT;
  readonly revision: string;
}

type CaptureExactCleanRevision = (repositoryRoot: string) => Promise<string>;

export interface FloodgateV7ProductionRecoveryOperatorSourceProvenanceDependenciesForTests {
  readonly homeDirectory: string;
  readonly captureExactCleanRevision: CaptureExactCleanRevision;
}

export interface FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests {
  readonly homeDirectory: string;
  readonly cwd: string;
  readonly argv: readonly string[];
  readonly mainFilename: string | null;
  readonly execArgv: readonly string[];
}

export class FloodgateV7ProductionRecoveryOperatorSourceProvenanceError extends Error {
  constructor() {
    super("Floodgate v7 production recovery operator source provenance failed");
    this.name = "FloodgateV7ProductionRecoveryOperatorSourceProvenanceError";
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ProductionRecoveryOperatorSourceProvenanceError: source verification failed",
    });
    objectFreeze(this);
  }
}

const NativePromise = Promise;
const execFile = promisify(execFileCallback);
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const getCurrentWorkingDirectory = process.cwd.bind(process);
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const arrayIsArray = Array.isArray;
const arrayIncludes = Array.prototype.includes;
const arrayPush = Array.prototype.push;
const arraySome = Array.prototype.some;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const numberIsSafeInteger = Number.isSafeInteger;
const regexpExec = RegExp.prototype.exec;
const stringEndsWith = String.prototype.endsWith;
const stringIncludes = String.prototype.includes;
const stringSplit = String.prototype.split;
const stringStartsWith = String.prototype.startsWith;
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathDirname = path.dirname.bind(path);
const pathJoin = path.join.bind(path);
const pathNormalize = path.normalize.bind(path);
const pathResolve = path.resolve.bind(path);
const lstatSync = fs.lstatSync.bind(fs);
const realpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const captureExactCleanRevision = captureFloodgateGitExactCleanRevision;
const FULL_SHA1_OBJECT_ID = /^[0-9a-f]{40}$/u;
const FULL_GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ORDINARY_BLOB_MODE = /^(?:100644|100755)$/u;
const PROVENANCE_DEPENDENCY_KEYS = objectFreeze([
  "homeDirectory",
  "captureExactCleanRevision",
] as const);
const ENTRYPOINT_CONTEXT_KEYS = objectFreeze([
  "homeDirectory",
  "cwd",
  "argv",
  "mainFilename",
  "execArgv",
] as const);
const RECOVERY_OPERATOR_REPOSITORY_SUFFIX = objectFreeze([
  ".codex",
  "worktrees",
  "shogi-floodgate-v7-production-recovery-operator",
] as const);
const REQUIRED_EXEC_ARGV = objectFreeze(["-r", "tsx/cjs"] as const);
const REQUIRED_TRACKED_PATHS =
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_TRACKED_PATHS;

function rejected(error: unknown): Promise<never> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function sameStat(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs &&
    left.nlink === right.nlink
  );
}

function nulRecords(output: string): readonly string[] {
  if (output === "") return [];
  if (!output.endsWith("\0")) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  return output.slice(0, -1).split("\0");
}

async function fixedRecoveryGitOutput(
  repositoryRoot: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFile(
    FLOODGATE_GIT_EXECUTABLE,
    [...FLOODGATE_GIT_COMMAND_PREFIX, "--literal-pathspecs", ...arguments_],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: floodgateGitEnvironment(),
      maxBuffer: 1024 * 1024,
    },
  );
  return stdout;
}

function exactGitPath(output: string): string {
  if (
    output.length <= 1 ||
    !reflectApply(stringEndsWith, output, ["\n"]) ||
    reflectApply(stringIncludes, output.slice(0, -1), ["\n"]) ||
    reflectApply(stringIncludes, output, ["\r"]) ||
    reflectApply(stringIncludes, output, ["\0"])
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const value = output.slice(0, -1);
  if (!canonicalAbsolutePath(value)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  return value;
}

function assertAbsentCanonicalGitControlFile(filePath: string): void {
  const parent = pathDirname(filePath);
  if (!canonicalAbsolutePath(parent)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const before = lstatSync(parent, { bigint: true });
  if (
    !before.isDirectory() ||
    before.isSymbolicLink() ||
    realpathSync(parent) !== parent
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const candidate = lstatSync(filePath, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (candidate !== undefined) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const after = lstatSync(parent, { bigint: true });
  if (!sameStat(before, after)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}

async function assertNoGitObjectAlternates(
  repositoryRoot: string,
): Promise<void> {
  const arguments_ = [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "objects/info/alternates",
  ] as const;
  const first = exactGitPath(
    await fixedRecoveryGitOutput(repositoryRoot, arguments_),
  );
  assertAbsentCanonicalGitControlFile(first);
  const final = exactGitPath(
    await fixedRecoveryGitOutput(repositoryRoot, arguments_),
  );
  if (final !== first) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  assertAbsentCanonicalGitControlFile(final);
}

function parseRequiredHeadEntries(output: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const record of nulRecords(output)) {
    const tab = record.indexOf("\t");
    const header = tab < 0 ? [] : record.slice(0, tab).split(" ");
    const entryPath = tab < 0 ? "" : record.slice(tab + 1);
    if (
      header.length !== 3 ||
      !ORDINARY_BLOB_MODE.test(header[0] ?? "") ||
      header[1] !== "blob" ||
      !FULL_GIT_OBJECT_ID.test(header[2] ?? "") ||
      !reflectApply(arrayIncludes, REQUIRED_TRACKED_PATHS, [entryPath]) ||
      entries.has(entryPath)
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    entries.set(entryPath, `${header[0]} ${header[2]}`);
  }
  return entries;
}

function parseRequiredIndexEntries(
  output: string,
): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const record of nulRecords(output)) {
    const tab = record.indexOf("\t");
    const header = tab < 0 ? [] : record.slice(0, tab).split(" ");
    const entryPath = tab < 0 ? "" : record.slice(tab + 1);
    if (
      header.length !== 3 ||
      !ORDINARY_BLOB_MODE.test(header[0] ?? "") ||
      !FULL_GIT_OBJECT_ID.test(header[1] ?? "") ||
      header[2] !== "0" ||
      !reflectApply(arrayIncludes, REQUIRED_TRACKED_PATHS, [entryPath]) ||
      entries.has(entryPath)
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    entries.set(entryPath, `${header[0]} ${header[1]}`);
  }
  return entries;
}

function assertRequiredTrackedOutputs(
  repositoryRoot: string,
  headOutput: string,
  indexOutput: string,
  flagsOutput: string,
): void {
  const head = parseRequiredHeadEntries(headOutput);
  const index = parseRequiredIndexEntries(indexOutput);
  const flags = new Set<string>();
  for (const record of nulRecords(flagsOutput)) {
    if (
      !record.startsWith("H ") ||
      !reflectApply(arrayIncludes, REQUIRED_TRACKED_PATHS, [record.slice(2)]) ||
      flags.has(record.slice(2))
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    flags.add(record.slice(2));
  }
  if (
    head.size !== REQUIRED_TRACKED_PATHS.length ||
    index.size !== REQUIRED_TRACKED_PATHS.length ||
    flags.size !== REQUIRED_TRACKED_PATHS.length
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  for (const entryPath of REQUIRED_TRACKED_PATHS) {
    const headIdentity = head.get(entryPath);
    if (
      headIdentity === undefined ||
      index.get(entryPath) !== headIdentity ||
      !flags.has(entryPath)
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    const filePath = pathJoin(repositoryRoot, entryPath);
    const before = lstatSync(filePath, { bigint: true });
    const expectedExecutable = headIdentity.startsWith("100755 ");
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== BigInt(1) ||
      realpathSync(filePath) !== filePath ||
      ((before.mode & BigInt(0o111)) !== BigInt(0)) !== expectedExecutable
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    const after = lstatSync(filePath, { bigint: true });
    if (!sameStat(before, after)) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
  }
}

async function assertRequiredTrackedClosure(
  repositoryRoot: string,
): Promise<void> {
  await assertNoGitObjectAlternates(repositoryRoot);
  const argumentsByObservation = [
    [
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      "HEAD",
      "--",
      ...REQUIRED_TRACKED_PATHS,
    ],
    ["ls-files", "-s", "-z", "--", ...REQUIRED_TRACKED_PATHS],
    ["ls-files", "-v", "-z", "--", ...REQUIRED_TRACKED_PATHS],
  ] as const;
  const first = await Promise.all(
    argumentsByObservation.map((arguments_) =>
      fixedRecoveryGitOutput(repositoryRoot, arguments_),
    ),
  );
  assertRequiredTrackedOutputs(repositoryRoot, first[0], first[1], first[2]);
  const final = await Promise.all(
    argumentsByObservation.map((arguments_) =>
      fixedRecoveryGitOutput(repositoryRoot, arguments_),
    ),
  );
  if (final[0] !== first[0] || final[1] !== first[1] || final[2] !== first[2]) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  await assertNoGitObjectAlternates(repositoryRoot);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: descriptor.enumerable ?? false,
      writable: false,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function sameExactKeys(
  descriptors: PropertyDescriptorMap,
  expected: readonly string[],
): boolean {
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expected.length) return false;
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      !reflectApply(arrayIncludes, expected, [key])
    ) {
      return false;
    }
  }
  return true;
}

function enumerableDataValue(
  descriptors: PropertyDescriptorMap,
  key: string,
): unknown {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  return descriptor.value;
}

function canonicalAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !reflectApply(stringIncludes, value, ["\0"]) &&
    !reflectApply(stringIncludes, value, ["\n"]) &&
    !reflectApply(stringIncludes, value, ["\r"]) &&
    pathIsAbsolute(value) &&
    pathResolve(value) === value
  );
}

function assertExistingCanonicalDirectory(value: string): void {
  const before = lstatSync(value, { bigint: true });
  if (
    !before.isDirectory() ||
    before.isSymbolicLink() ||
    realpathSync(value) !== value
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const after = lstatSync(value, { bigint: true });
  if (!sameStat(before, after)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}

function resolveRecoveryOperatorRoot(homeDirectory: unknown): string {
  if (!canonicalAbsolutePath(homeDirectory)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const repositoryRoot = pathJoin(
    homeDirectory,
    ...RECOVERY_OPERATOR_REPOSITORY_SUFFIX,
  );
  if (
    !canonicalAbsolutePath(repositoryRoot) ||
    repositoryRoot === homeDirectory
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  assertExistingCanonicalDirectory(repositoryRoot);
  return repositoryRoot;
}

function productionHomeDirectory(): string {
  if (getEffectiveUserId === null) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const effectiveUserId = getEffectiveUserId();
  const userInfo = getUserInfo();
  if (
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    userInfo.uid !== effectiveUserId ||
    !canonicalAbsolutePath(userInfo.homedir)
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  return userInfo.homedir;
}

function captureDependencies(
  value: FloodgateV7ProductionRecoveryOperatorSourceProvenanceDependenciesForTests,
): Readonly<FloodgateV7ProductionRecoveryOperatorSourceProvenanceDependenciesForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (!sameExactKeys(descriptors, PROVENANCE_DEPENDENCY_KEYS)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const homeDirectory = enumerableDataValue(descriptors, "homeDirectory");
  const captureRevision = enumerableDataValue(
    descriptors,
    "captureExactCleanRevision",
  );
  if (
    !canonicalAbsolutePath(homeDirectory) ||
    typeof captureRevision !== "function" ||
    nodeIsProxy(captureRevision)
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  return frozenRecord({
    homeDirectory,
    captureExactCleanRevision: captureRevision as CaptureExactCleanRevision,
  });
}

async function captureSource(
  dependencies: Readonly<FloodgateV7ProductionRecoveryOperatorSourceProvenanceDependenciesForTests>,
): Promise<Readonly<FloodgateV7ProductionRecoveryOperatorSourceBinding>> {
  try {
    const repositoryRoot = resolveRecoveryOperatorRoot(
      dependencies.homeDirectory,
    );
    await assertNoGitObjectAlternates(repositoryRoot);
    const initialRevision: unknown = await reflectApply(
      dependencies.captureExactCleanRevision,
      undefined,
      [repositoryRoot],
    );
    if (
      typeof initialRevision !== "string" ||
      reflectApply(regexpExec, FULL_SHA1_OBJECT_ID, [initialRevision]) === null
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    await assertNoGitObjectAlternates(repositoryRoot);
    await assertRequiredTrackedClosure(repositoryRoot);
    const finalRevision: unknown = await reflectApply(
      dependencies.captureExactCleanRevision,
      undefined,
      [repositoryRoot],
    );
    if (finalRevision !== initialRevision) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    await assertNoGitObjectAlternates(repositoryRoot);
    return frozenRecord({
      layout: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
      revision: initialRevision,
    });
  } catch {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}

function captureStringArray(value: unknown): readonly string[] {
  if (
    !arrayIsArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== arrayPrototype
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const descriptors = objectGetOwnPropertyDescriptors(
    value,
  ) as unknown as PropertyDescriptorMap;
  const lengthDescriptor = descriptors.length;
  const length =
    lengthDescriptor !== undefined && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : undefined;
  if (
    typeof length !== "number" ||
    !numberIsSafeInteger(length) ||
    length < 0 ||
    reflectOwnKeys(descriptors).length !== length + 1
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const output: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      typeof descriptor.value !== "string"
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
    }
    reflectApply(arrayPush, output, [descriptor.value]);
  }
  return objectFreeze(output);
}

function captureEntrypointContext(
  value: FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests,
): Readonly<FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (!sameExactKeys(descriptors, ENTRYPOINT_CONTEXT_KEYS)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const homeDirectory = enumerableDataValue(descriptors, "homeDirectory");
  const cwd = enumerableDataValue(descriptors, "cwd");
  const argv = enumerableDataValue(descriptors, "argv");
  const mainFilename = enumerableDataValue(descriptors, "mainFilename");
  const execArgv = enumerableDataValue(descriptors, "execArgv");
  if (
    !canonicalAbsolutePath(homeDirectory) ||
    !canonicalAbsolutePath(cwd) ||
    (mainFilename !== null && !canonicalAbsolutePath(mainFilename))
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  return frozenRecord({
    homeDirectory,
    cwd,
    argv: captureStringArray(argv),
    mainFilename,
    execArgv: captureStringArray(execArgv),
  });
}

function purposeEntrypointPath(
  repositoryRoot: string,
  expectedPurposeEntrypoint: unknown,
): string {
  if (
    typeof expectedPurposeEntrypoint !== "string" ||
    expectedPurposeEntrypoint.length === 0 ||
    reflectApply(stringIncludes, expectedPurposeEntrypoint, ["\0"]) ||
    reflectApply(stringIncludes, expectedPurposeEntrypoint, ["\n"]) ||
    reflectApply(stringIncludes, expectedPurposeEntrypoint, ["\r"]) ||
    pathIsAbsolute(expectedPurposeEntrypoint) ||
    pathNormalize(expectedPurposeEntrypoint) !== expectedPurposeEntrypoint ||
    !reflectApply(stringStartsWith, expectedPurposeEntrypoint, [
      `ml${path.sep}`,
    ]) ||
    !reflectApply(stringEndsWith, expectedPurposeEntrypoint, [".ts"]) ||
    reflectApply(
      arraySome,
      reflectApply(stringSplit, expectedPurposeEntrypoint, [path.sep]),
      [(part: string) => part === "" || part === "." || part === ".."],
    )
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const entrypoint = pathJoin(repositoryRoot, expectedPurposeEntrypoint);
  if (!canonicalAbsolutePath(entrypoint)) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  const metadata = lstatSync(entrypoint, { bigint: true });
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    realpathSync(entrypoint) !== entrypoint
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  return entrypoint;
}

function assertEntrypointContext(
  expectedPurposeEntrypoint: string,
  context: Readonly<FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests>,
): void {
  const repositoryRoot = resolveRecoveryOperatorRoot(context.homeDirectory);
  const entrypoint = purposeEntrypointPath(
    repositoryRoot,
    expectedPurposeEntrypoint,
  );
  if (
    context.cwd !== repositoryRoot ||
    context.argv.length !== 2 ||
    context.argv[1] !== entrypoint ||
    context.mainFilename !== entrypoint ||
    context.execArgv.length !== REQUIRED_EXEC_ARGV.length ||
    reflectApply(arraySome, context.execArgv, [
      (argument: string, index: number) =>
        argument !== REQUIRED_EXEC_ARGV[index],
    ])
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}

/** Resolve only the dedicated recovery-operator source root. */
export function resolveFloodgateV7ProductionRecoveryOperatorSourceRoot(): string {
  if (arguments.length !== 0) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  try {
    return resolveRecoveryOperatorRoot(productionHomeDirectory());
  } catch {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}

/** Test-only fixed-suffix derivation against a disposable home fixture. */
export function resolveFloodgateV7ProductionRecoveryOperatorSourceRootCoreForTests(
  homeDirectory: string,
): string {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  try {
    return resolveRecoveryOperatorRoot(homeDirectory);
  } catch {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}

/** Test-only direct assertion for the fixed required tracked closure. */
export function assertFloodgateV7ProductionRecoveryOperatorRequiredTrackedClosureCoreForTests(
  repositoryRoot: string,
): Promise<void> {
  if (arguments.length !== 1 || !canonicalAbsolutePath(repositoryRoot)) {
    return rejected(
      new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError(),
    );
  }
  return assertRequiredTrackedClosure(repositoryRoot).catch(() => {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  });
}

/** Test-only source closure with a disposable home and injected Git capture. */
export function captureFloodgateV7ProductionRecoveryOperatorSourceProvenanceCoreForTests(
  dependenciesValue: FloodgateV7ProductionRecoveryOperatorSourceProvenanceDependenciesForTests,
): Promise<Readonly<FloodgateV7ProductionRecoveryOperatorSourceBinding>> {
  if (arguments.length !== 1) {
    return rejected(
      new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError(),
    );
  }
  try {
    return captureSource(captureDependencies(dependenciesValue));
  } catch {
    return rejected(
      new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError(),
    );
  }
}

/** Fixed zero-argument recovery-operator tracked-source closure. */
export function captureFloodgateV7ProductionRecoveryOperatorSourceProvenance(): Promise<
  Readonly<FloodgateV7ProductionRecoveryOperatorSourceBinding>
> {
  if (arguments.length !== 0) {
    return rejected(
      new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError(),
    );
  }
  try {
    return captureSource(
      captureDependencies({
        homeDirectory: productionHomeDirectory(),
        captureExactCleanRevision,
      }),
    );
  } catch {
    return rejected(
      new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError(),
    );
  }
}

/** Test-only execution-origin guard using a disposable recovery checkout. */
export function assertFloodgateV7ProductionRecoveryOperatorEntrypointContextCoreForTests(
  expectedPurposeEntrypoint: string,
  contextValue: FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests,
): void {
  if (arguments.length !== 2) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  try {
    assertEntrypointContext(
      expectedPurposeEntrypoint,
      captureEntrypointContext(contextValue),
    );
  } catch {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}

/** Require the dedicated root, exact entrypoint, argv, main, cwd, and loader. */
export function assertFloodgateV7ProductionRecoveryOperatorEntrypointContext(
  expectedPurposeEntrypoint: string,
): void {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
  try {
    assertEntrypointContext(
      expectedPurposeEntrypoint,
      captureEntrypointContext({
        homeDirectory: productionHomeDirectory(),
        cwd: getCurrentWorkingDirectory(),
        argv: process.argv,
        mainFilename: require.main?.filename ?? null,
        execArgv: process.execArgv,
      }),
    );
  } catch {
    throw new FloodgateV7ProductionRecoveryOperatorSourceProvenanceError();
  }
}
