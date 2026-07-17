/**
 * One-shot child proof for the Darwin-native Floodgate v7 production launcher.
 *
 * The tracked JXA launcher is evaluated by root-owned /usr/bin/osascript before
 * the attested production child Node exists. It starts that child through
 * NSTask with a minimal environment and a private stdin pipe carrying a
 * 32-byte CSPRNG nonce. This module consumes that pipe, checks the live parent
 * with two independent root-owned Darwin tools, and then removes the transient
 * attestation keys before source authorization continues.
 */

import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const FLOODGATE_V7_PRODUCTION_NATIVE_LAUNCHER_ATTESTATION_CONTRACT =
  "shogi-floodgate-v7-production-native-launcher-attestation-v1" as const;

export type FloodgateV7ProductionNativeLauncherPurpose =
  | "application-source-readiness"
  | "prefix-100-read-only-preflight"
  | "prefix-100-disposable-kill-drill"
  | "durable-prefix-100"
  | "durable-prefix-500"
  | "sealed-final-24000"
  | "training-label-finalization-24000"
  | "production-registry-provision";

export class FloodgateV7ProductionNativeLauncherAttestationError extends Error {
  readonly attested = false as const;
  readonly persistent_mutation_performed = false as const;
  readonly sensitive_values_disclosed = false as const;

  constructor() {
    super("Floodgate v7 production native launcher attestation failed");
    this.name = "FloodgateV7ProductionNativeLauncherAttestationError";
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ProductionNativeLauncherAttestationError: attestation failed",
    });
    objectFreeze(this);
  }
}

const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const OSASCRIPT = "/usr/bin/osascript" as const;
const LSOF = "/usr/sbin/lsof" as const;
const PS = "/bin/ps" as const;
const HELPER_RELATIVE = path.join(
  "ml",
  "helpers",
  "floodgate-v7-production-native-launcher.jxa",
);
const PRODUCTION_ROOT_RELATIVE = path.join(
  ".codex",
  "worktrees",
  "shogi-floodgate-v7-production-application",
);
const PRODUCTION_NODE_RELATIVE = path.join(
  ".nvm",
  "versions",
  "node",
  "v22.13.0",
  "bin",
  "node",
);
const SELF_TEST_PURPOSE = "launcher-self-test" as const;
const SELF_TEST_ENTRY = path.join(
  "tests",
  "fixtures",
  "ml",
  "floodgate-v7-production-native-launcher-child.ts",
);
const SELF_TEST_HELPER = path.join(
  "tests",
  "fixtures",
  "ml",
  "floodgate-v7-production-native-launcher-test.jxa",
);
const PURPOSE_BY_ENTRYPOINT = Object.freeze({
  [path.join("ml", "inspect-floodgate-v7-production-application-source.ts")]:
    "application-source-readiness",
  [path.join("ml", "inspect-floodgate-v7-production-prefix-100-preflight.ts")]:
    "prefix-100-read-only-preflight",
  [path.join("ml", "run-floodgate-v7-production-prefix-100-kill-drill.ts")]:
    "prefix-100-disposable-kill-drill",
  [path.join("ml", "run-floodgate-v7-production-connector-prefix-100.ts")]:
    "durable-prefix-100",
  [path.join("ml", "run-floodgate-v7-production-connector-prefix-500.ts")]:
    "durable-prefix-500",
  [path.join("ml", "run-floodgate-v7-production-connector-final-24000.ts")]:
    "sealed-final-24000",
  [path.join("ml", "run-floodgate-v7-training-label-production.ts")]:
    "training-label-finalization-24000",
  [path.join("ml", "provision-floodgate-v7-production-connector-registry.ts")]:
    "production-registry-provision",
} as const);
const ATTESTATION_ENVIRONMENT_KEYS = Object.freeze([
  "FLOODGATE_V7_NATIVE_LAUNCHER_CONTRACT",
  "FLOODGATE_V7_NATIVE_LAUNCHER_PURPOSE",
  "FLOODGATE_V7_NATIVE_LAUNCHER_PARENT_PID",
  "FLOODGATE_V7_NATIVE_LAUNCHER_NONCE",
  "FLOODGATE_V7_NATIVE_LAUNCHER_HELPER",
] as const);
const MAX_FRAME_BYTES = 1_024;
const MODE_GROUP_OR_OTHER_WRITABLE = 0o022;
const NONCE_RE = /^[A-Za-z0-9+/]{43}=$/u;
const PID_RE = /^[1-9][0-9]*$/u;
const NativeError = Error;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const arrayIsArray = Array.isArray;
const arrayPrototype = Array.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const stringIncludes = String.prototype.includes;
const stringSplit = String.prototype.split;
const reflectApply = Reflect.apply;
const capturedSpawnSync = spawnSync;
const capturedFstatSync = fs.fstatSync.bind(fs);
const capturedLstatSync = fs.lstatSync.bind(fs);
const capturedReadSync = fs.readSync.bind(fs);
const capturedRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const capturedGetEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const capturedUserInfo = os.userInfo.bind(os);
const capturedCwd = process.cwd.bind(process);
let claimed = false;

function fail(): never {
  throw new FloodgateV7ProductionNativeLauncherAttestationError();
}

function assertFixedTool(executable: string): void {
  const metadata = capturedLstatSync(executable);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
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
  if (!arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    fail();
  }
  const descriptors = objectGetOwnPropertyDescriptors(
    value,
  ) as unknown as PropertyDescriptorMap;
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expected.length + 1) fail();
  const length = descriptors["length"];
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
    !nodeMetadata.isFile() ||
    nodeMetadata.isSymbolicLink() ||
    (nodeMetadata.uid !== 0 && nodeMetadata.uid !== effectiveUserId) ||
    (nodeMetadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0
  ) {
    fail();
  }
  assertExactStringArray(process.argv, [expectedNodePath, entrypoint]);
  assertExactStringArray(process.execArgv, ["-r", "tsx/cjs"]);
}

function assertExactLaunchEnvironment(
  expectedNodePath: string,
  effectiveUserId: number,
  allowSelfTestKey: boolean,
): void {
  const expectedValues = objectFreeze({
    HOME: capturedUserInfo().homedir,
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: `${path.dirname(expectedNodePath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  });
  const required = new Set<string>([
    ...objectKeys(expectedValues),
    ...ATTESTATION_ENVIRONMENT_KEYS,
  ]);
  if (allowSelfTestKey) {
    required.add("FLOODGATE_V7_LAUNCHER_TEST_CHILD_MODE");
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
  if (command !== `${expectedCommand}\n`) {
    fail();
  }
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
    FloodgateV7ProductionNativeLauncherPurpose | typeof SELF_TEST_PURPOSE,
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
    contract !== FLOODGATE_V7_PRODUCTION_NATIVE_LAUNCHER_ATTESTATION_CONTRACT ||
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
    helperMetadata.uid !== effectiveUserId ||
    (helperMetadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0
  ) {
    fail();
  }
  if (
    process.env.FLOODGATE_V7_NATIVE_LAUNCHER_CONTRACT !== contract ||
    process.env.FLOODGATE_V7_NATIVE_LAUNCHER_PURPOSE !== purpose ||
    process.env.FLOODGATE_V7_NATIVE_LAUNCHER_PARENT_PID !== parentPidText ||
    process.env.FLOODGATE_V7_NATIVE_LAUNCHER_NONCE !== nonce ||
    process.env.FLOODGATE_V7_NATIVE_LAUNCHER_HELPER !== helperPath ||
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
 * Production one-shot claim. The expected entrypoint selects one fixed
 * evidence purpose; no caller-selected path or purpose is accepted.
 */
export function claimFloodgateV7ProductionNativeLauncherAttestation(
  expectedPurposeEntrypoint: string,
): void {
  if (arguments.length !== 1) fail();
  const purpose = (
    PURPOSE_BY_ENTRYPOINT as Readonly<
      Record<string, FloodgateV7ProductionNativeLauncherPurpose>
    >
  )[expectedPurposeEntrypoint];
  if (purpose === undefined) fail();
  const repositoryRoot = path.join(
    capturedUserInfo().homedir,
    PRODUCTION_ROOT_RELATIVE,
  );
  if (capturedCwd() !== repositoryRoot) fail();
  const nodePath = path.join(
    capturedUserInfo().homedir,
    PRODUCTION_NODE_RELATIVE,
  );
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

/** Darwin-only integration seam for the harmless tracked launcher fixture. */
export function claimFloodgateV7ProductionNativeLauncherAttestationCoreForTests(): void {
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

// Keep a real runtime use of NativeError so static rewriting cannot silently
// erase the captured built-in while leaving this module apparently valid.
if (NativeError.name !== "Error") fail();
