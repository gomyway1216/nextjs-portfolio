/**
 * One-shot child proof for the dedicated preload-free deadline diagnostic
 * launcher. The fixed JXA parent creates the exact Node child with no loader
 * or preload and sends a CSPRNG nonce through a private stdin pipe. This
 * module consumes that frame, validates the live root-owned osascript parent,
 * checks the fixed child tuple and minimal environment, then removes the
 * transient attestation keys before any diagnostic source or data access.
 */

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_ATTESTATION_CONTRACT =
  "shogi-floodgate-stable-wasm-deadline-diagnostic-launcher-attestation-v1" as const;

export class FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError extends Error {
  readonly attested = false as const;
  readonly live_mutation_performed = false as const;
  readonly sensitive_values_disclosed = false as const;

  constructor() {
    super(
      "Floodgate stable-WASM deadline diagnostic launcher attestation failed",
    );
    this.name = "FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError";
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError: attestation failed",
    });
    objectFreeze(this);
  }
}

const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const OSASCRIPT = "/usr/bin/osascript" as const;
const LSOF = "/usr/sbin/lsof" as const;
const PS = "/bin/ps" as const;
const ROOT_RELATIVE = path.join(
  ".codex",
  "worktrees",
  "shogi-floodgate-stable-deadline-diagnostic-application",
);
const NODE_RELATIVE = path.join(
  ".nvm",
  "versions",
  "node",
  "v22.13.0",
  "bin",
  "node",
);
const HELPER_RELATIVE = path.join(
  "ml",
  "helpers",
  "floodgate-stable-wasm-deadline-diagnostic-launcher.jxa",
);
const ENTRY_RELATIVE = path.join(
  "ml",
  "run-floodgate-stable-wasm-deadline-diagnostic.cjs",
);
const ATTESTATION_ENVIRONMENT_KEYS = Object.freeze([
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_CONTRACT",
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_PARENT_PID",
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_NONCE",
  "FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_HELPER",
] as const);
const MAX_FRAME_BYTES = 1_024;
const MODE_GROUP_OR_OTHER_WRITABLE = 0o022;
const NONCE_RE = /^[A-Za-z0-9+/]{43}=$/u;
const PID_RE = /^[1-9][0-9]*$/u;
const PRELOAD_ENVIRONMENT_KEY = ["NODE", "OPTIONS"].join("_");
const NativeError = Error;
const NativeNumber = Number;
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
  throw new FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError();
}

function canonicalAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    !reflectApply(stringIncludes, value, ["\0"]) &&
    !reflectApply(stringIncludes, value, ["\n"]) &&
    !reflectApply(stringIncludes, value, ["\r"]) &&
    path.isAbsolute(value) &&
    path.resolve(value) === value
  );
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

function assertExactStringArray(
  value: unknown,
  expected: readonly string[],
): void {
  if (
    !arrayIsArray(value) ||
    nodeUtilTypes.isProxy(value) ||
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

function assertOwnedFixedPath(
  value: string,
  expected: "directory" | "file",
  effectiveUserId: number,
): void {
  if (!canonicalAbsolutePath(value) || capturedRealpathSync(value) !== value) {
    fail();
  }
  const metadata = capturedLstatSync(value);
  const correctType =
    expected === "directory" ? metadata.isDirectory() : metadata.isFile();
  if (
    !correctType ||
    metadata.isSymbolicLink() ||
    metadata.uid !== effectiveUserId ||
    (metadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0 ||
    (expected === "file" && metadata.nlink !== 1)
  ) {
    fail();
  }
}

function assertExactChildExecutionTuple(
  repositoryRoot: string,
  entrypoint: string,
  nodePath: string,
  effectiveUserId: number,
): void {
  assertOwnedFixedPath(repositoryRoot, "directory", effectiveUserId);
  assertOwnedFixedPath(entrypoint, "file", effectiveUserId);
  if (
    !canonicalAbsolutePath(nodePath) ||
    capturedRealpathSync(nodePath) !== nodePath ||
    capturedCwd() !== repositoryRoot ||
    process.execPath !== nodePath ||
    (require.main?.filename ?? null) !== entrypoint
  ) {
    fail();
  }
  const nodeMetadata = capturedLstatSync(nodePath);
  if (
    !nodeMetadata.isFile() ||
    nodeMetadata.isSymbolicLink() ||
    nodeMetadata.nlink !== 1 ||
    (nodeMetadata.uid !== 0 && nodeMetadata.uid !== effectiveUserId) ||
    (nodeMetadata.mode & MODE_GROUP_OR_OTHER_WRITABLE) !== 0
  ) {
    fail();
  }
  assertExactStringArray(process.argv, [nodePath, entrypoint]);
  assertExactStringArray(process.execArgv, []);
}

function assertExactLaunchEnvironment(
  nodePath: string,
  effectiveUserId: number,
): void {
  const expectedValues = objectFreeze({
    HOME: capturedUserInfo().homedir,
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: `${path.dirname(nodePath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  });
  const required = new Set<string>([
    ...objectKeys(expectedValues),
    ...ATTESTATION_ENVIRONMENT_KEYS,
  ]);
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
  if (process.env[PRELOAD_ENVIRONMENT_KEY] !== undefined) fail();
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

/**
 * Claim the one fixed diagnostic launcher exactly once. This is execution
 * provenance only; it grants no source, data, training, live-weight, or
 * playing-strength authority.
 */
export function claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation(): void {
  try {
    if (
      arguments.length !== 0 ||
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
    if (user.uid !== effectiveUserId || !canonicalAbsolutePath(user.homedir)) {
      fail();
    }
    const repositoryRoot = path.join(user.homedir, ROOT_RELATIVE);
    const nodePath = path.join(user.homedir, NODE_RELATIVE);
    const helperPath = path.join(repositoryRoot, HELPER_RELATIVE);
    const entrypoint = path.join(repositoryRoot, ENTRY_RELATIVE);
    assertExactChildExecutionTuple(
      repositoryRoot,
      entrypoint,
      nodePath,
      effectiveUserId,
    );
    assertOwnedFixedPath(helperPath, "file", effectiveUserId);
    assertExactLaunchEnvironment(nodePath, effectiveUserId);

    const frame = readAttestationFrame();
    const fields = reflectApply(stringSplit, frame, ["\n"]);
    if (fields.length !== 5 || fields[4] !== "") fail();
    const [contract, parentPidText, nonce, frameHelperPath] = fields;
    if (
      contract !==
        FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_ATTESTATION_CONTRACT ||
      !PID_RE.test(parentPidText) ||
      NativeNumber(parentPidText) !== process.ppid ||
      !NONCE_RE.test(nonce) ||
      frameHelperPath !== helperPath
    ) {
      fail();
    }
    if (
      process.env
        .FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_CONTRACT !==
        contract ||
      process.env
        .FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_PARENT_PID !==
        parentPidText ||
      process.env.FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_NONCE !==
        nonce ||
      process.env.FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_HELPER !==
        helperPath
    ) {
      fail();
    }
    assertLiveOsascriptParent(
      process.ppid,
      `${OSASCRIPT} -l JavaScript ${helperPath}`,
    );
    for (const key of ATTESTATION_ENVIRONMENT_KEYS) {
      delete process.env[key];
      if (process.env[key] !== undefined) fail();
    }
    claimed = true;
  } catch {
    fail();
  }
}

// Preserve a real use of the captured native constructor in the emitted graph.
if (NativeError.name !== "Error") fail();
