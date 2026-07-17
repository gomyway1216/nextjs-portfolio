/**
 * One-shot child proof for the Darwin-native Floodgate v7 production recovery
 * operator launcher.
 *
 * Its contract, environment keys, helper, source root, purpose map, and replay
 * state are all distinct from the production application launcher.
 */

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT =
  "shogi-floodgate-v7-production-recovery-operator-native-launcher-attestation-v1" as const;

export type FloodgateV7ProductionRecoveryOperatorNativeLauncherPurpose =
  "inspect-stale-prefix-100";

export class FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError extends Error {
  readonly attested = false as const;
  readonly persistent_mutation_performed = false as const;
  readonly sensitive_values_disclosed = false as const;

  constructor() {
    super(
      "Floodgate v7 production recovery operator native launcher attestation failed",
    );
    this.name =
      "FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError";
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError: attestation failed",
    });
    objectFreeze(this);
  }
}

export interface FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationContextForTests {
  readonly platform: string;
  readonly version: string;
  readonly homeDirectory: string;
  readonly repositoryRoot: string;
  readonly cwd: string;
  readonly execPath: string;
  readonly argv: readonly string[];
  readonly execArgv: readonly string[];
  readonly mainFilename: string | null;
  readonly purpose: string;
  readonly entrypoint: string;
  readonly helperPath: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly frame: string;
  readonly processParentPid: number;
  readonly frameParentPid: number;
  readonly parentCommand: string;
}

const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const OSASCRIPT = "/usr/bin/osascript" as const;
const LSOF = "/usr/sbin/lsof" as const;
const PS = "/bin/ps" as const;
const HELPER_RELATIVE = path.join(
  "ml",
  "helpers",
  "floodgate-v7-production-recovery-operator-native-launcher.jxa",
);
const RECOVERY_ROOT_RELATIVE = path.join(
  ".codex",
  "worktrees",
  "shogi-floodgate-v7-production-recovery-operator",
);
const PRODUCTION_NODE_RELATIVE = path.join(
  ".nvm",
  "versions",
  "node",
  "v22.13.0",
  "bin",
  "node",
);
const SELF_TEST_PURPOSE = "recovery-launcher-self-test" as const;
const SELF_TEST_ENTRY = path.join(
  "tests",
  "fixtures",
  "ml",
  "floodgate-v7-production-recovery-operator-native-launcher-child.ts",
);
const SELF_TEST_HELPER = path.join(
  "tests",
  "fixtures",
  "ml",
  "floodgate-v7-production-recovery-operator-native-launcher-test.jxa",
);
const PURPOSE_BY_ENTRYPOINT = Object.freeze({
  [path.join(
    "ml",
    "inspect-floodgate-v7-production-stale-prefix-100-recovery.ts",
  )]: "inspect-stale-prefix-100",
} as const);
const ATTESTATION_ENVIRONMENT_KEYS = Object.freeze([
  "FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_CONTRACT",
  "FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PURPOSE",
  "FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PARENT_PID",
  "FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_NONCE",
  "FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_HELPER",
] as const);
const TEST_CONTEXT_KEYS = Object.freeze([
  "platform",
  "version",
  "homeDirectory",
  "repositoryRoot",
  "cwd",
  "execPath",
  "argv",
  "execArgv",
  "mainFilename",
  "purpose",
  "entrypoint",
  "helperPath",
  "environment",
  "frame",
  "processParentPid",
  "frameParentPid",
  "parentCommand",
] as const);
const MAX_FRAME_BYTES = 1_024;
const MODE_GROUP_OR_OTHER_WRITABLE = 0o022;
const NONCE_RE = /^[A-Za-z0-9+/]{43}=$/u;
const PID_RE = /^[1-9][0-9]*$/u;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const arrayIsArray = Array.isArray;
const arrayPrototype = Array.prototype;
const arrayIncludes = Array.prototype.includes;
const reflectOwnKeys = Reflect.ownKeys;
const stringIncludes = String.prototype.includes;
const stringSplit = String.prototype.split;
const reflectApply = Reflect.apply;
const nodeIsProxy = nodeUtilTypes.isProxy;
const capturedSpawnSync = spawnSync;
const capturedFstatSync = fs.fstatSync.bind(fs);
const capturedLstatSync = fs.lstatSync.bind(fs);
const capturedReadSync = fs.readSync.bind(fs);
const capturedRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const capturedGetEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const capturedUserInfo = os.userInfo.bind(os);
const capturedCwd = process.cwd.bind(process);
const testClaims = new WeakSet<object>();
let claimed = false;

function fail(): never {
  throw new FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError();
}

function assertFixedTool(executable: string): void {
  const metadata = capturedLstatSync(executable);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.uid !== 0 ||
    (metadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0 ||
    capturedRealpathSync(executable) !== executable
  ) {
    fail();
  }
}

function canonicalAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !reflectApply(stringIncludes, value, ["\0"]) &&
    !reflectApply(stringIncludes, value, ["\n"]) &&
    !reflectApply(stringIncludes, value, ["\r"]) &&
    path.isAbsolute(value) &&
    path.resolve(value) === value
  );
}

function assertExactStringArray(
  value: unknown,
  expected: readonly string[],
): void {
  if (
    !arrayIsArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== arrayPrototype
  ) {
    fail();
  }
  const descriptors = objectGetOwnPropertyDescriptors(
    value,
  ) as unknown as PropertyDescriptorMap;
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expected.length + 1) fail();
  const length = descriptors.length;
  if (
    length === undefined ||
    !("value" in length) ||
    length.value !== expected.length ||
    length.enumerable !== false ||
    length.configurable !== false
  ) {
    fail();
  }
  for (let index = 0; index < expected.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.value !== expected[index] ||
      descriptor.enumerable !== true
    ) {
      fail();
    }
  }
}

function assertExactChildExecutionTuple(
  repositoryRoot: string,
  expectedEntrypoint: string,
  expectedNodePath: string,
): void {
  const entrypoint = path.join(repositoryRoot, expectedEntrypoint);
  if (
    !canonicalAbsolutePath(repositoryRoot) ||
    capturedCwd() !== repositoryRoot ||
    !canonicalAbsolutePath(entrypoint) ||
    !canonicalAbsolutePath(expectedNodePath) ||
    capturedRealpathSync(entrypoint) !== entrypoint ||
    capturedRealpathSync(expectedNodePath) !== expectedNodePath ||
    process.execPath !== expectedNodePath ||
    (require.main?.filename ?? null) !== entrypoint
  ) {
    fail();
  }
  const entryMetadata = capturedLstatSync(entrypoint);
  const nodeMetadata = capturedLstatSync(expectedNodePath);
  const effectiveUserId = capturedGetEffectiveUserId?.();
  if (
    effectiveUserId === undefined ||
    !entryMetadata.isFile() ||
    entryMetadata.isSymbolicLink() ||
    entryMetadata.nlink !== 1 ||
    !nodeMetadata.isFile() ||
    nodeMetadata.isSymbolicLink() ||
    nodeMetadata.nlink !== 1 ||
    (nodeMetadata.uid !== 0 && nodeMetadata.uid !== effectiveUserId) ||
    (nodeMetadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0
  ) {
    fail();
  }
  assertExactStringArray(process.argv, [expectedNodePath, entrypoint]);
  assertExactStringArray(process.execArgv, ["-r", "tsx/cjs"]);
}

function expectedBaseEnvironment(
  homeDirectory: string,
  nodePath: string,
): Readonly<Record<string, string>> {
  return objectFreeze({
    HOME: homeDirectory,
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: `${path.dirname(nodePath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  });
}

function assertExactLaunchEnvironment(
  expectedNodePath: string,
  effectiveUserId: number,
  allowSelfTestKey: boolean,
): void {
  const expectedValues = expectedBaseEnvironment(
    capturedUserInfo().homedir,
    expectedNodePath,
  );
  const required = new Set<string>([
    ...objectKeys(expectedValues),
    ...ATTESTATION_ENVIRONMENT_KEYS,
  ]);
  if (allowSelfTestKey) {
    required.add("FLOODGATE_V7_RECOVERY_LAUNCHER_TEST_CHILD_MODE");
  }
  for (const key of objectKeys(process.env)) {
    if (key === "__CF_USER_TEXT_ENCODING") {
      if (
        process.env[key] !==
        `0x${effectiveUserId.toString(16).toUpperCase()}:0x0:0x0`
      ) {
        fail();
      }
      continue;
    }
    if (!required.delete(key)) fail();
  }
  if (required.size !== 0) fail();
  for (const key of objectKeys(expectedValues)) {
    if (
      process.env[key] !== expectedValues[key as keyof typeof expectedValues]
    ) {
      fail();
    }
  }
}

function readAttestationFrame(): string {
  const before = capturedFstatSync(0, { bigint: true });
  if (!before.isFIFO() || before.isSymbolicLink()) fail();
  const bytes = Buffer.alloc(MAX_FRAME_BYTES + 1);
  let offset = 0;
  while (offset <= MAX_FRAME_BYTES) {
    const read = capturedReadSync(
      0,
      bytes,
      offset,
      bytes.length - offset,
      null,
    );
    if (read === 0) break;
    offset += read;
  }
  const after = capturedFstatSync(0, { bigint: true });
  if (
    offset === 0 ||
    offset > MAX_FRAME_BYTES ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mode !== after.mode ||
    before.uid !== after.uid ||
    before.gid !== after.gid
  ) {
    fail();
  }
  try {
    return bytes.subarray(0, offset).toString("utf8");
  } finally {
    bytes.fill(0);
  }
}

function exactToolOutput(
  executable: string,
  arguments_: readonly string[],
): string {
  const result = capturedSpawnSync(executable, [...arguments_], {
    cwd: "/",
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "production",
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
    windowsHide: true,
  });
  if (
    result.error !== undefined ||
    result.status !== 0 ||
    result.signal !== null ||
    result.stderr !== "" ||
    typeof result.stdout !== "string" ||
    result.stdout.length === 0 ||
    result.stdout.length > 16_384
  ) {
    fail();
  }
  return result.stdout;
}

function assertLiveOsascriptParent(
  parentPid: number,
  expectedCommand: string,
): void {
  assertFixedTool(LSOF);
  assertFixedTool(PS);
  assertFixedTool(OSASCRIPT);
  const lsofArguments = [
    "-a",
    "-p",
    String(parentPid),
    "-d",
    "txt",
    "-Fn",
  ] as const;
  const firstLsof = exactToolOutput(LSOF, lsofArguments);
  const expectedImageLine = `n${OSASCRIPT}`;
  const firstLines = reflectApply(stringSplit, firstLsof, ["\n"]);
  if (
    firstLines[0] !== `p${parentPid}` ||
    !firstLines.includes(expectedImageLine)
  ) {
    fail();
  }
  const command = exactToolOutput(PS, [
    "-ww",
    "-p",
    String(parentPid),
    "-o",
    "command=",
  ]);
  if (command !== `${expectedCommand}\n`) fail();
  const secondLsof = exactToolOutput(LSOF, lsofArguments);
  const secondLines = reflectApply(stringSplit, secondLsof, ["\n"]);
  if (
    secondLines[0] !== `p${parentPid}` ||
    !secondLines.includes(expectedImageLine)
  ) {
    fail();
  }
}

function claim(
  expectedPurpose:
    | FloodgateV7ProductionRecoveryOperatorNativeLauncherPurpose
    | typeof SELF_TEST_PURPOSE,
  expectedHelper: string,
  expectedParentCommand: string,
  expectedNodePath: string,
  allowSelfTestKey: boolean,
): void {
  if (
    claimed ||
    process.platform !== "darwin" ||
    process.version !== REQUIRED_NODE_VERSION ||
    capturedGetEffectiveUserId === null ||
    process.pid <= 1 ||
    process.ppid <= 1
  ) {
    fail();
  }
  const effectiveUserId = capturedGetEffectiveUserId();
  const user = capturedUserInfo();
  if (user.uid !== effectiveUserId) fail();
  assertExactLaunchEnvironment(
    expectedNodePath,
    effectiveUserId,
    allowSelfTestKey,
  );
  const frame = readAttestationFrame();
  const fields = reflectApply(stringSplit, frame, ["\n"]);
  if (fields.length !== 6 || fields[5] !== "") fail();
  const [contract, purpose, parentPidText, nonce, helperPath] = fields;
  if (
    contract !==
      FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT ||
    purpose !== expectedPurpose ||
    !PID_RE.test(parentPidText) ||
    Number(parentPidText) !== process.ppid ||
    !NONCE_RE.test(nonce) ||
    helperPath !== expectedHelper ||
    !canonicalAbsolutePath(helperPath) ||
    capturedRealpathSync(helperPath) !== helperPath
  ) {
    fail();
  }
  const helperMetadata = capturedLstatSync(helperPath);
  if (
    !helperMetadata.isFile() ||
    helperMetadata.isSymbolicLink() ||
    helperMetadata.nlink !== 1 ||
    helperMetadata.uid !== effectiveUserId ||
    (helperMetadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0
  ) {
    fail();
  }
  if (
    process.env.FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_CONTRACT !==
      contract ||
    process.env.FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PURPOSE !==
      purpose ||
    process.env.FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PARENT_PID !==
      parentPidText ||
    process.env.FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_NONCE !==
      nonce ||
    process.env.FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_HELPER !==
      helperPath ||
    process.env.NODE_OPTIONS !== undefined
  ) {
    fail();
  }
  assertLiveOsascriptParent(process.ppid, expectedParentCommand);
  for (const key of ATTESTATION_ENVIRONMENT_KEYS) {
    delete process.env[key];
    if (process.env[key] !== undefined) fail();
  }
  claimed = true;
}

/**
 * Production one-shot claim. The sole tracked entrypoint selects the sole
 * read-only recovery purpose.
 */
export function claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestation(
  expectedPurposeEntrypoint: string,
): void {
  if (arguments.length !== 1) fail();
  const purpose = (
    PURPOSE_BY_ENTRYPOINT as Readonly<
      Record<string, FloodgateV7ProductionRecoveryOperatorNativeLauncherPurpose>
    >
  )[expectedPurposeEntrypoint];
  if (purpose === undefined) fail();
  const homeDirectory = capturedUserInfo().homedir;
  const repositoryRoot = path.join(homeDirectory, RECOVERY_ROOT_RELATIVE);
  if (capturedCwd() !== repositoryRoot) fail();
  const nodePath = path.join(homeDirectory, PRODUCTION_NODE_RELATIVE);
  assertExactChildExecutionTuple(
    repositoryRoot,
    expectedPurposeEntrypoint,
    nodePath,
  );
  const helper = path.join(repositoryRoot, HELPER_RELATIVE);
  claim(
    purpose,
    helper,
    `${OSASCRIPT} -l JavaScript ${helper} ${purpose}`,
    nodePath,
    false,
  );
}

/** Darwin-only integration seam for the harmless recovery launcher fixture. */
export function claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForDarwinIntegrationTests(): void {
  if (arguments.length !== 0) fail();
  const repositoryRoot = capturedCwd();
  const fixture = path.join(repositoryRoot, SELF_TEST_ENTRY);
  const fixtureMetadata = capturedLstatSync(fixture);
  if (!fixtureMetadata.isFile() || fixtureMetadata.isSymbolicLink()) fail();
  assertExactChildExecutionTuple(
    repositoryRoot,
    SELF_TEST_ENTRY,
    process.execPath,
  );
  const helper = path.join(repositoryRoot, SELF_TEST_HELPER);
  claim(
    SELF_TEST_PURPOSE,
    helper,
    `${OSASCRIPT} -l JavaScript ${helper} ${SELF_TEST_PURPOSE} ${process.execPath}`,
    process.execPath,
    true,
  );
}

function testDataValue(
  descriptors: PropertyDescriptorMap,
  key: string,
): unknown {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    fail();
  }
  return descriptor.value;
}

function captureTestContext(
  value: FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationContextForTests,
): FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationContextForTests {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    fail();
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length !== TEST_CONTEXT_KEYS.length ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !reflectApply(arrayIncludes, TEST_CONTEXT_KEYS, [key]),
    )
  ) {
    fail();
  }
  return {
    platform: testDataValue(descriptors, "platform") as string,
    version: testDataValue(descriptors, "version") as string,
    homeDirectory: testDataValue(descriptors, "homeDirectory") as string,
    repositoryRoot: testDataValue(descriptors, "repositoryRoot") as string,
    cwd: testDataValue(descriptors, "cwd") as string,
    execPath: testDataValue(descriptors, "execPath") as string,
    argv: testDataValue(descriptors, "argv") as readonly string[],
    execArgv: testDataValue(descriptors, "execArgv") as readonly string[],
    mainFilename: testDataValue(descriptors, "mainFilename") as string | null,
    purpose: testDataValue(descriptors, "purpose") as string,
    entrypoint: testDataValue(descriptors, "entrypoint") as string,
    helperPath: testDataValue(descriptors, "helperPath") as string,
    environment: testDataValue(descriptors, "environment") as Readonly<
      Record<string, string>
    >,
    frame: testDataValue(descriptors, "frame") as string,
    processParentPid: testDataValue(descriptors, "processParentPid") as number,
    frameParentPid: testDataValue(descriptors, "frameParentPid") as number,
    parentCommand: testDataValue(descriptors, "parentCommand") as string,
  };
}

/**
 * Test-only semantic seam for root/argv/runtime/environment/replay rejection.
 * It performs no filesystem or process inspection.
 */
export function claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForTests(
  contextValue: FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationContextForTests,
): void {
  if (
    arguments.length !== 1 ||
    contextValue === null ||
    typeof contextValue !== "object" ||
    testClaims.has(contextValue)
  ) {
    fail();
  }
  const context = captureTestContext(contextValue);
  const expectedRoot = path.join(context.homeDirectory, RECOVERY_ROOT_RELATIVE);
  const expectedNode = path.join(
    context.homeDirectory,
    PRODUCTION_NODE_RELATIVE,
  );
  const expectedEntrypointRelative = path.join(
    "ml",
    "inspect-floodgate-v7-production-stale-prefix-100-recovery.ts",
  );
  const expectedEntrypoint = path.join(
    expectedRoot,
    expectedEntrypointRelative,
  );
  const expectedHelper = path.join(expectedRoot, HELPER_RELATIVE);
  const expectedPurpose = "inspect-stale-prefix-100";
  const expectedParentCommand = `${OSASCRIPT} -l JavaScript ${expectedHelper} ${expectedPurpose}`;
  if (
    context.platform !== "darwin" ||
    context.version !== REQUIRED_NODE_VERSION ||
    !canonicalAbsolutePath(context.homeDirectory) ||
    context.repositoryRoot !== expectedRoot ||
    context.cwd !== expectedRoot ||
    context.execPath !== expectedNode ||
    context.mainFilename !== expectedEntrypoint ||
    context.purpose !== expectedPurpose ||
    context.entrypoint !== expectedEntrypointRelative ||
    context.helperPath !== expectedHelper ||
    !Number.isSafeInteger(context.processParentPid) ||
    context.processParentPid <= 1 ||
    context.frameParentPid !== context.processParentPid ||
    context.parentCommand !== expectedParentCommand
  ) {
    fail();
  }
  assertExactStringArray(context.argv, [expectedNode, expectedEntrypoint]);
  assertExactStringArray(context.execArgv, ["-r", "tsx/cjs"]);
  if (
    context.environment === null ||
    typeof context.environment !== "object" ||
    nodeIsProxy(context.environment) ||
    objectGetPrototypeOf(context.environment) !== objectPrototype
  ) {
    fail();
  }
  const nonce =
    context.environment.FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_NONCE;
  const expectedEnvironment = {
    ...expectedBaseEnvironment(context.homeDirectory, expectedNode),
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_CONTRACT:
      FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT,
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PURPOSE: expectedPurpose,
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PARENT_PID: String(
      context.processParentPid,
    ),
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_NONCE: nonce,
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_HELPER: expectedHelper,
  };
  if (
    typeof nonce !== "string" ||
    !NONCE_RE.test(nonce) ||
    objectKeys(context.environment).length !==
      objectKeys(expectedEnvironment).length
  ) {
    fail();
  }
  for (const key of objectKeys(expectedEnvironment)) {
    if (
      context.environment[key] !==
      expectedEnvironment[key as keyof typeof expectedEnvironment]
    ) {
      fail();
    }
  }
  const expectedFrame = `${FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT}\n${expectedPurpose}\n${context.processParentPid}\n${nonce}\n${expectedHelper}\n`;
  if (context.frame !== expectedFrame) fail();
  testClaims.add(contextValue);
}
