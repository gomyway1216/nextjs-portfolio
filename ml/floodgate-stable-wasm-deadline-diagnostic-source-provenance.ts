/**
 * Exact-clean source closure for the one fixed read-only deadline diagnostic
 * checkout. It accepts no production path or revision from the CLI.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";

export const FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT =
  "fixed-current-euid-userinfo-home-stable-deadline-diagnostic-application-v1" as const;

export interface FloodgateStableWasmDeadlineDiagnosticSourceBinding {
  readonly layout: typeof FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT;
  readonly revision: string;
}

export interface FloodgateStableWasmDeadlineDiagnosticSourceDependenciesForTests {
  readonly captureExactCleanRevision: (
    repositoryRoot: string,
  ) => Promise<string>;
  readonly homeDirectory: string;
}

export interface FloodgateStableWasmDeadlineDiagnosticEntrypointContextForTests {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly execArgv: readonly string[];
  readonly homeDirectory: string;
  readonly mainFilename: string | null;
}

export class FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError extends Error {
  constructor() {
    super("Floodgate stable-WASM deadline diagnostic source closure failed");
    this.name = "FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError";
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError: source closure failed",
    });
    Object.freeze(this);
  }
}

const DIAGNOSTIC_ROOT_COMPONENTS = Object.freeze([
  ".codex",
  "worktrees",
  "shogi-floodgate-stable-deadline-diagnostic-application",
] as const);
const REQUIRED_EXEC_ARGV = Object.freeze([] as const);
const FULL_GIT_REVISION = /^[0-9a-f]{40}$/u;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const nativePromise = Promise;
const captureExactCleanRevision = captureFloodgateGitExactCleanRevision;
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const getCurrentWorkingDirectory = process.cwd.bind(process);
const realpathSync = fs.realpathSync.native.bind(fs.realpathSync);

function fail(): never {
  throw new FloodgateStableWasmDeadlineDiagnosticSourceProvenanceError();
}

function rejected(): Promise<never> {
  return new nativePromise((_resolve, reject) => reject(fail()));
}

function canonicalAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    path.isAbsolute(value) &&
    path.resolve(value) === value
  );
}

function sameStat(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function assertStableDirectory(value: string): void {
  const before = fs.lstatSync(value, { bigint: true });
  if (
    !before.isDirectory() ||
    before.isSymbolicLink() ||
    realpathSync(value) !== value
  ) {
    fail();
  }
  const after = fs.lstatSync(value, { bigint: true });
  if (!sameStat(before, after)) fail();
}

function sourceRoot(homeDirectory: unknown): string {
  if (!canonicalAbsolutePath(homeDirectory)) fail();
  const root = path.join(homeDirectory, ...DIAGNOSTIC_ROOT_COMPONENTS);
  if (!canonicalAbsolutePath(root) || root === homeDirectory) fail();
  assertStableDirectory(root);
  return root;
}

function productionHome(): string {
  if (getEffectiveUserId === null) fail();
  const effectiveUserId = getEffectiveUserId();
  const user = getUserInfo();
  if (
    !Number.isSafeInteger(effectiveUserId) ||
    effectiveUserId <= 0 ||
    user.uid !== effectiveUserId ||
    !canonicalAbsolutePath(user.homedir)
  ) {
    fail();
  }
  return user.homedir;
}

function exactPlainRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== objectPrototype
  ) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as PropertyDescriptorMap;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    fail();
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
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

function exactStringArray(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== arrayPrototype
  ) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as PropertyDescriptorMap;
  const lengthDescriptor = descriptors.length;
  const length =
    lengthDescriptor !== undefined && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : null;
  if (
    !Number.isSafeInteger(length) ||
    (length as number) < 0 ||
    Reflect.ownKeys(descriptors).length !== (length as number) + 1
  ) {
    fail();
  }
  const output: string[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      typeof descriptor.value !== "string"
    ) {
      fail();
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

function captureDependencies(
  value: FloodgateStableWasmDeadlineDiagnosticSourceDependenciesForTests,
): Readonly<FloodgateStableWasmDeadlineDiagnosticSourceDependenciesForTests> {
  const record = exactPlainRecord(value, [
    "captureExactCleanRevision",
    "homeDirectory",
  ]);
  const capture = record.captureExactCleanRevision;
  const homeDirectory = record.homeDirectory;
  if (
    typeof capture !== "function" ||
    nodeUtilTypes.isProxy(capture) ||
    !canonicalAbsolutePath(homeDirectory)
  ) {
    fail();
  }
  return Object.freeze({
    captureExactCleanRevision:
      capture as FloodgateStableWasmDeadlineDiagnosticSourceDependenciesForTests["captureExactCleanRevision"],
    homeDirectory,
  });
}

async function captureSource(
  dependencies: Readonly<FloodgateStableWasmDeadlineDiagnosticSourceDependenciesForTests>,
): Promise<Readonly<FloodgateStableWasmDeadlineDiagnosticSourceBinding>> {
  try {
    const repositoryRoot = sourceRoot(dependencies.homeDirectory);
    const revision: unknown =
      await dependencies.captureExactCleanRevision(repositoryRoot);
    if (
      typeof revision !== "string" ||
      FULL_GIT_REVISION.exec(revision) === null
    ) {
      fail();
    }
    return Object.freeze({
      layout: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
      revision,
    });
  } catch {
    fail();
  }
}

function captureContext(
  value: FloodgateStableWasmDeadlineDiagnosticEntrypointContextForTests,
): Readonly<FloodgateStableWasmDeadlineDiagnosticEntrypointContextForTests> {
  const record = exactPlainRecord(value, [
    "argv",
    "cwd",
    "execArgv",
    "homeDirectory",
    "mainFilename",
  ]);
  const argv = exactStringArray(record.argv);
  const execArgv = exactStringArray(record.execArgv);
  const cwd = record.cwd;
  const homeDirectory = record.homeDirectory;
  const mainFilename = record.mainFilename;
  if (
    !canonicalAbsolutePath(cwd) ||
    !canonicalAbsolutePath(homeDirectory) ||
    (mainFilename !== null && !canonicalAbsolutePath(mainFilename))
  ) {
    fail();
  }
  return Object.freeze({
    argv,
    cwd,
    execArgv,
    homeDirectory,
    mainFilename,
  });
}

function expectedEntrypoint(
  repositoryRoot: string,
  relativeEntrypoint: unknown,
): string {
  if (
    typeof relativeEntrypoint !== "string" ||
    relativeEntrypoint.length === 0 ||
    path.isAbsolute(relativeEntrypoint) ||
    path.normalize(relativeEntrypoint) !== relativeEntrypoint ||
    !relativeEntrypoint.startsWith(`ml${path.sep}`) ||
    !relativeEntrypoint.endsWith(".cjs") ||
    relativeEntrypoint
      .split(path.sep)
      .some((component) => ["", ".", ".."].includes(component))
  ) {
    fail();
  }
  const entrypoint = path.join(repositoryRoot, relativeEntrypoint);
  if (!canonicalAbsolutePath(entrypoint)) fail();
  const before = fs.lstatSync(entrypoint, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    realpathSync(entrypoint) !== entrypoint
  ) {
    fail();
  }
  const after = fs.lstatSync(entrypoint, { bigint: true });
  if (!sameStat(before, after)) fail();
  return entrypoint;
}

function assertContext(
  relativeEntrypoint: string,
  context: Readonly<FloodgateStableWasmDeadlineDiagnosticEntrypointContextForTests>,
): void {
  const repositoryRoot = sourceRoot(context.homeDirectory);
  const entrypoint = expectedEntrypoint(repositoryRoot, relativeEntrypoint);
  if (
    context.cwd !== repositoryRoot ||
    context.argv.length !== 2 ||
    context.argv[1] !== entrypoint ||
    context.mainFilename !== entrypoint ||
    context.execArgv.length !== REQUIRED_EXEC_ARGV.length ||
    context.execArgv.some(
      (argument, index) => argument !== REQUIRED_EXEC_ARGV[index],
    )
  ) {
    fail();
  }
}

export function resolveFloodgateStableWasmDeadlineDiagnosticSourceRoot(): string {
  if (arguments.length !== 0) fail();
  try {
    return sourceRoot(productionHome());
  } catch {
    fail();
  }
}

export function resolveFloodgateStableWasmDeadlineDiagnosticSourceRootCoreForTests(
  homeDirectory: string,
): string {
  if (arguments.length !== 1) fail();
  try {
    return sourceRoot(homeDirectory);
  } catch {
    fail();
  }
}

export function captureFloodgateStableWasmDeadlineDiagnosticSourceProvenanceCoreForTests(
  dependencies: FloodgateStableWasmDeadlineDiagnosticSourceDependenciesForTests,
): Promise<Readonly<FloodgateStableWasmDeadlineDiagnosticSourceBinding>> {
  if (arguments.length !== 1) return rejected();
  try {
    return captureSource(captureDependencies(dependencies));
  } catch {
    return rejected();
  }
}

export function captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance(): Promise<
  Readonly<FloodgateStableWasmDeadlineDiagnosticSourceBinding>
> {
  if (arguments.length !== 0) return rejected();
  try {
    return captureSource(
      captureDependencies({
        captureExactCleanRevision,
        homeDirectory: productionHome(),
      }),
    );
  } catch {
    return rejected();
  }
}

export function assertFloodgateStableWasmDeadlineDiagnosticEntrypointContextCoreForTests(
  relativeEntrypoint: string,
  context: FloodgateStableWasmDeadlineDiagnosticEntrypointContextForTests,
): void {
  if (arguments.length !== 2) fail();
  try {
    assertContext(relativeEntrypoint, captureContext(context));
  } catch {
    fail();
  }
}

export function assertFloodgateStableWasmDeadlineDiagnosticEntrypointContext(
  relativeEntrypoint: string,
): void {
  if (arguments.length !== 1) fail();
  try {
    assertContext(
      relativeEntrypoint,
      captureContext({
        argv: process.argv,
        cwd: getCurrentWorkingDirectory(),
        execArgv: process.execArgv,
        homeDirectory: productionHome(),
        mainFilename: require.main?.filename ?? null,
      }),
    );
  } catch {
    fail();
  }
}
