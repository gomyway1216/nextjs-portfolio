/**
 * Private source provenance for the one fixed Floodgate v7 production
 * application checkout.
 *
 * The production capture accepts no caller path or revision. It derives the
 * repository from the current EUID's user-info home and returns only the
 * fixed layout name and the exact clean, directly byte-verified HEAD object
 * ID. The binding is intended for authenticated private registry records; it
 * is not a public receipt and deliberately carries no path or digest.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";

export const FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT =
  "fixed-current-euid-userinfo-home-production-application-v1" as const;

export interface FloodgateV7ProductionApplicationSourceBinding {
  readonly layout: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT;
  readonly revision: string;
}

type CaptureExactCleanRevision = (repositoryRoot: string) => Promise<string>;

export interface FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests {
  readonly homeDirectory: string;
  readonly captureExactCleanRevision: CaptureExactCleanRevision;
}

export interface FloodgateV7ProductionApplicationEntrypointContextForTests {
  readonly homeDirectory: string;
  readonly cwd: string;
  readonly argv: readonly string[];
  readonly mainFilename: string | null;
  readonly execArgv: readonly string[];
}

export class FloodgateV7ProductionApplicationSourceProvenanceError extends Error {
  constructor() {
    super("Floodgate v7 production application source provenance failed");
    this.name = "FloodgateV7ProductionApplicationSourceProvenanceError";
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ProductionApplicationSourceProvenanceError: source verification failed",
    });
    objectFreeze(this);
  }
}

const NativePromise = Promise;
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const getCurrentWorkingDirectory = process.cwd.bind(process);
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
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
const pathJoin = path.join.bind(path);
const pathNormalize = path.normalize.bind(path);
const pathResolve = path.resolve.bind(path);
const lstatSync = fs.lstatSync.bind(fs);
const realpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const captureExactCleanRevision = captureFloodgateGitExactCleanRevision;
const FULL_SHA1_OBJECT_ID = /^[0-9a-f]{40}$/u;
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
const APPLICATION_REPOSITORY_SUFFIX = objectFreeze([
  ".codex",
  "worktrees",
  "shogi-floodgate-v7-production-application",
] as const);
const REQUIRED_EXEC_ARGV = objectFreeze(["-r", "tsx/cjs"] as const);

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

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new FloodgateV7ProductionApplicationSourceProvenanceError();
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
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
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
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  const after = lstatSync(value, { bigint: true });
  if (!sameStat(before, after)) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
}

function resolveApplicationRoot(homeDirectory: unknown): string {
  if (!canonicalAbsolutePath(homeDirectory)) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  const repositoryRoot = pathJoin(
    homeDirectory,
    ...APPLICATION_REPOSITORY_SUFFIX,
  );
  if (
    !canonicalAbsolutePath(repositoryRoot) ||
    repositoryRoot === homeDirectory
  ) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  assertExistingCanonicalDirectory(repositoryRoot);
  return repositoryRoot;
}

function productionHomeDirectory(): string {
  if (getEffectiveUserId === null) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  const effectiveUserId = getEffectiveUserId();
  const userInfo = getUserInfo();
  if (
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    userInfo.uid !== effectiveUserId ||
    !canonicalAbsolutePath(userInfo.homedir)
  ) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  return userInfo.homedir;
}

function captureProvenanceDependencies(
  value: FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests,
): Readonly<FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (!sameExactKeys(descriptors, PROVENANCE_DEPENDENCY_KEYS)) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
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
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  return frozenRecord({
    homeDirectory,
    captureExactCleanRevision: captureRevision as CaptureExactCleanRevision,
  });
}

async function captureApplicationSourceProvenance(
  dependencies: Readonly<FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests>,
): Promise<Readonly<FloodgateV7ProductionApplicationSourceBinding>> {
  try {
    const repositoryRoot = resolveApplicationRoot(dependencies.homeDirectory);
    const revision: unknown = await reflectApply(
      dependencies.captureExactCleanRevision,
      undefined,
      [repositoryRoot],
    );
    if (
      typeof revision !== "string" ||
      reflectApply(regexpExec, FULL_SHA1_OBJECT_ID, [revision]) === null
    ) {
      throw new FloodgateV7ProductionApplicationSourceProvenanceError();
    }
    return frozenRecord({
      layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
      revision,
    });
  } catch {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
}

function captureStringArray(value: unknown): readonly string[] {
  if (
    !arrayIsArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== arrayPrototype
  ) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
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
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
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
      throw new FloodgateV7ProductionApplicationSourceProvenanceError();
    }
    reflectApply(arrayPush, output, [descriptor.value]);
  }
  return objectFreeze(output);
}

function captureEntrypointContext(
  value: FloodgateV7ProductionApplicationEntrypointContextForTests,
): Readonly<FloodgateV7ProductionApplicationEntrypointContextForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (!sameExactKeys(descriptors, ENTRYPOINT_CONTEXT_KEYS)) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
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
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
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
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  const entrypoint = pathJoin(repositoryRoot, expectedPurposeEntrypoint);
  if (!canonicalAbsolutePath(entrypoint)) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  const metadata = lstatSync(entrypoint, { bigint: true });
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    realpathSync(entrypoint) !== entrypoint
  ) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  return entrypoint;
}

function assertEntrypointContext(
  expectedPurposeEntrypoint: string,
  context: Readonly<FloodgateV7ProductionApplicationEntrypointContextForTests>,
): void {
  const repositoryRoot = resolveApplicationRoot(context.homeDirectory);
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
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
}

/** Resolve the fixed production source root without accepting caller input. */
export function resolveFloodgateV7ProductionApplicationSourceRoot(): string {
  if (arguments.length !== 0) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  try {
    return resolveApplicationRoot(productionHomeDirectory());
  } catch {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
}

/** Test-only fixed-suffix root derivation against a disposable home fixture. */
export function resolveFloodgateV7ProductionApplicationSourceRootCoreForTests(
  homeDirectory: string,
): string {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  try {
    return resolveApplicationRoot(homeDirectory);
  } catch {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
}

/** Test-only source closure with a disposable home and injected Git capture. */
export function captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
  dependenciesValue: FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests,
): Promise<Readonly<FloodgateV7ProductionApplicationSourceBinding>> {
  if (arguments.length !== 1) {
    return rejected(
      new FloodgateV7ProductionApplicationSourceProvenanceError(),
    );
  }
  let dependencies: Readonly<FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests>;
  try {
    dependencies = captureProvenanceDependencies(dependenciesValue);
  } catch {
    return rejected(
      new FloodgateV7ProductionApplicationSourceProvenanceError(),
    );
  }
  return captureApplicationSourceProvenance(dependencies);
}

/** Fixed, zero-argument production source-provenance closure. */
export function captureFloodgateV7ProductionApplicationSourceProvenance(): Promise<
  Readonly<FloodgateV7ProductionApplicationSourceBinding>
> {
  if (arguments.length !== 0) {
    return rejected(
      new FloodgateV7ProductionApplicationSourceProvenanceError(),
    );
  }
  try {
    const dependencies = captureProvenanceDependencies({
      homeDirectory: productionHomeDirectory(),
      captureExactCleanRevision,
    });
    return captureApplicationSourceProvenance(dependencies);
  } catch {
    return rejected(
      new FloodgateV7ProductionApplicationSourceProvenanceError(),
    );
  }
}

/**
 * Test-only CLI execution-origin guard using a disposable source fixture.
 */
export function assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests(
  expectedPurposeEntrypoint: string,
  contextValue: FloodgateV7ProductionApplicationEntrypointContextForTests,
): void {
  if (arguments.length !== 2) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  try {
    assertEntrypointContext(
      expectedPurposeEntrypoint,
      captureEntrypointContext(contextValue),
    );
  } catch {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
}

/**
 * Require the fixed source root, cwd, main module, argv[1], empty user
 * arguments, and exact checked package-script loader for one purpose entry.
 */
export function assertFloodgateV7ProductionApplicationEntrypointContext(
  expectedPurposeEntrypoint: string,
): void {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
  try {
    const homeDirectory = productionHomeDirectory();
    const mainFilename = require.main?.filename ?? null;
    assertEntrypointContext(
      expectedPurposeEntrypoint,
      captureEntrypointContext({
        homeDirectory,
        cwd: getCurrentWorkingDirectory(),
        argv: process.argv,
        mainFilename,
        execArgv: process.execArgv,
      }),
    );
  } catch {
    throw new FloodgateV7ProductionApplicationSourceProvenanceError();
  }
}
