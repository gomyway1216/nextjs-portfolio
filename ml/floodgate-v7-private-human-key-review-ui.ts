/**
 * Private macOS UI boundary for reviewing one exact deployment-key candidate.
 * Candidate bytes and their digest travel only through a pipe to the fixed
 * native helper; public streams, arguments, environment, TTYs, clipboards, and
 * temporary files are outside this boundary.
 */

import { Buffer } from "node:buffer";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import * as path from "node:path";
import { TextDecoder, types as nodeUtilTypes } from "node:util";

export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT =
  "shogi-floodgate-v7-private-human-key-review-request-v1" as const;
export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT =
  "shogi-floodgate-v7-private-human-key-review-response-v1" as const;
export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_OSASCRIPT =
  "/usr/bin/osascript" as const;
export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_HELPER = path.resolve(
  __dirname,
  "helpers/floodgate-v7-private-human-key-review.jxa",
);

export interface FloodgateV7PrivateHumanKeyReviewRequest {
  readonly contract: typeof FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT;
  readonly candidate_canonical_json: string;
  readonly candidate_sha256: string;
  readonly candidate_bytes: number;
}

export type FloodgateV7PrivateHumanKeyReviewResponse =
  | Readonly<{
      contract: typeof FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT;
      decision: "approve";
      typed_candidate_sha256: string;
    }>
  | Readonly<{
      contract: typeof FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT;
      decision: "cancel";
      typed_candidate_sha256: null;
    }>;

export type FloodgateV7PrivateHumanKeyReviewUiPhase =
  | "capture"
  | "platform"
  | "request"
  | "helper"
  | "response";

export class FloodgateV7PrivateHumanKeyReviewUiError extends Error {
  readonly phase!: FloodgateV7PrivateHumanKeyReviewUiPhase;
  readonly approval_returned!: false;
  readonly public_sensitive_values_disclosed!: false;

  constructor(phase: FloodgateV7PrivateHumanKeyReviewUiPhase) {
    super("Floodgate v7 private human key review failed without approval");
    objectDefineProperty(this, "name", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: "FloodgateV7PrivateHumanKeyReviewUiError",
    });
    objectDefineProperty(this, "phase", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: phase,
    });
    objectDefineProperty(this, "approval_returned", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: false,
    });
    objectDefineProperty(this, "public_sensitive_values_disclosed", {
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
        "FloodgateV7PrivateHumanKeyReviewUiError: private human review failed",
    });
    objectFreeze(this);
  }
}

export interface FloodgateV7PrivateHumanKeyReviewSpawnOptionsForTests {
  readonly cwd: "/";
  readonly detached: false;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly shell: false;
  readonly stdio: readonly ["pipe", "pipe", "pipe"];
  readonly windowsHide: true;
}

export type FloodgateV7PrivateHumanKeyReviewSpawnForTests = (
  executable: string,
  arguments_: readonly string[],
  options: Readonly<FloodgateV7PrivateHumanKeyReviewSpawnOptionsForTests>,
) => ChildProcessWithoutNullStreams;

export interface FloodgateV7PrivateHumanKeyReviewUiDependenciesForTests {
  readonly spawnChild: FloodgateV7PrivateHumanKeyReviewSpawnForTests;
}

type CapturedDependencies =
  Readonly<FloodgateV7PrivateHumanKeyReviewUiDependenciesForTests>;

const MAX_CANDIDATE_BYTES = 65_536;
const MAX_PRIVATE_REQUEST_BYTES = 196_608;
const MAX_HELPER_STDOUT_BYTES = 1_024;
const MAX_HELPER_STDERR_BYTES = 1_024;
const HEX_64_RE = /^[0-9a-f]{64}$/u;
const NativeError = Error;
const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const jsonParse = JSON.parse.bind(JSON);
const jsonStringify = JSON.stringify.bind(JSON);
const numberIsSafeInteger = Number.isSafeInteger;
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const bufferConcat = Buffer.concat.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const bufferIsBuffer = Buffer.isBuffer.bind(Buffer);
const uint8ArrayFill = Uint8Array.prototype.fill;
const reflectApply = Reflect.apply;
const capturedCreateHash = createHash;
const capturedTimingSafeEqual = timingSafeEqual;
const capturedSpawn = spawn;
const fatalUtf8Decoder = new TextDecoder("utf-8", {
  fatal: true,
  ignoreBOM: true,
});
const HELPER_ARGUMENTS = objectFreeze([
  "-l",
  "JavaScript",
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_HELPER,
] as const);
const HELPER_ENVIRONMENT = objectFreeze({
  LANG: "en_US.UTF-8",
  LC_ALL: "en_US.UTF-8",
  NODE_ENV: "production",
  PATH: "/usr/bin:/bin",
});
const DEPENDENCY_KEYS = objectFreeze(["spawnChild"] as const);

function rejected<T>(
  phase: FloodgateV7PrivateHumanKeyReviewUiPhase,
): Promise<T> {
  return new NativePromise((_resolve, reject) =>
    reject(new FloodgateV7PrivateHumanKeyReviewUiError(phase)),
  );
}

function zeroize(bytes: Uint8Array): void {
  reflectApply(uint8ArrayFill, bytes, [0]);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("private review records require data properties");
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

function exactPlainRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("private review value is not a plain record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new NativeError("private review record key count differs");
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = ownKeys[index];
    if (key !== keys[index] || typeof key !== "string") {
      throw new NativeError("private review record key order differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("private review record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function sha256Utf8(value: string): string {
  return capturedCreateHash("sha256").update(value, "utf8").digest("hex");
}

function captureRequest(
  value: FloodgateV7PrivateHumanKeyReviewRequest,
): Readonly<FloodgateV7PrivateHumanKeyReviewRequest> {
  const request = exactPlainRecord(value, [
    "contract",
    "candidate_canonical_json",
    "candidate_sha256",
    "candidate_bytes",
  ]);
  const canonicalJson = request.candidate_canonical_json;
  const digest = request.candidate_sha256;
  const bytes = request.candidate_bytes;
  if (
    request.contract !==
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT ||
    typeof canonicalJson !== "string" ||
    !canonicalJson.endsWith("\n") ||
    canonicalJson.indexOf("\n") !== canonicalJson.length - 1 ||
    canonicalJson.includes("\r") ||
    typeof digest !== "string" ||
    !HEX_64_RE.test(digest) ||
    typeof bytes !== "number" ||
    !numberIsSafeInteger(bytes) ||
    bytes < 2 ||
    bytes > MAX_CANDIDATE_BYTES ||
    bufferByteLength(canonicalJson, "utf8") !== bytes ||
    sha256Utf8(canonicalJson) !== digest
  ) {
    throw new NativeError("private review request fields differ");
  }
  try {
    const parsed = jsonParse(canonicalJson);
    if (`${jsonStringify(parsed)}\n` !== canonicalJson) {
      throw new NativeError("candidate is not canonical JSONL");
    }
  } catch {
    throw new NativeError("candidate is not canonical JSONL");
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_REQUEST_CONTRACT,
    candidate_canonical_json: canonicalJson,
    candidate_sha256: digest,
    candidate_bytes: bytes,
  });
}

function captureDependencies(
  value: FloodgateV7PrivateHumanKeyReviewUiDependenciesForTests,
): CapturedDependencies {
  const dependencies = exactPlainRecord(value, DEPENDENCY_KEYS);
  if (
    typeof dependencies.spawnChild !== "function" ||
    nodeIsProxy(dependencies.spawnChild)
  ) {
    throw new NativeError("private review spawn dependency differs");
  }
  return frozenRecord({
    spawnChild:
      dependencies.spawnChild as FloodgateV7PrivateHumanKeyReviewSpawnForTests,
  });
}

function privateRequestBytes(
  request: Readonly<FloodgateV7PrivateHumanKeyReviewRequest>,
): Buffer {
  const bytes = bufferFrom(`${jsonStringify(request)}\n`, "utf8");
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_PRIVATE_REQUEST_BYTES) {
    zeroize(bytes);
    throw new NativeError("private review helper request is oversized");
  }
  return bytes;
}

function chunkBytes(value: unknown): Buffer {
  if (bufferIsBuffer(value)) return value;
  throw new NativeError("private review helper emitted an invalid chunk");
}

function runHelper(
  requestBytes: Buffer,
  dependencies: CapturedDependencies,
): Promise<Buffer> {
  let child: ChildProcessWithoutNullStreams;
  try {
    child = dependencies.spawnChild(
      FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_OSASCRIPT,
      HELPER_ARGUMENTS,
      frozenRecord({
        cwd: "/" as const,
        detached: false as const,
        env: HELPER_ENVIRONMENT,
        shell: false as const,
        stdio: objectFreeze(["pipe", "pipe", "pipe"] as const),
        windowsHide: true as const,
      }),
    );
  } catch {
    zeroize(requestBytes);
    return rejected("helper");
  }

  return new NativePromise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let spawned = false;
    let failed = false;
    let settled = false;

    const forceFailure = (): void => {
      if (failed) return;
      failed = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // The sanitized failure remains authoritative.
      }
    };
    const onStdoutData = (value: unknown): void => {
      let chunk: Buffer;
      try {
        chunk = chunkBytes(value);
      } catch {
        forceFailure();
        return;
      }
      if (failed) {
        zeroize(chunk);
        return;
      }
      if (chunk.byteLength > MAX_HELPER_STDOUT_BYTES - stdoutBytes) {
        zeroize(chunk);
        forceFailure();
        return;
      }
      stdoutBytes += chunk.byteLength;
      stdoutChunks.push(chunk);
    };
    const onStderrData = (value: unknown): void => {
      let chunk: Buffer | undefined;
      try {
        chunk = chunkBytes(value);
        if (failed) return;
        stderrBytes += chunk.byteLength;
      } catch {
        forceFailure();
        return;
      } finally {
        if (chunk !== undefined) zeroize(chunk);
      }
      if (stderrBytes > MAX_HELPER_STDERR_BYTES) forceFailure();
    };
    const onStreamError = (): void => forceFailure();
    const onSpawn = (): void => {
      spawned = true;
      if (failed) {
        try {
          child.kill("SIGKILL");
        } catch {
          // The sanitized failure remains authoritative.
        }
      }
    };
    const onChildError = (): void => forceFailure();
    const cleanupListeners = (): void => {
      child.off("spawn", onSpawn);
      child.off("error", onChildError);
      child.off("close", onClose);
      child.stdin.off("error", onStreamError);
      child.stdout.off("data", onStdoutData);
      child.stdout.off("error", onStreamError);
      child.stderr.off("data", onStderrData);
      child.stderr.off("error", onStreamError);
    };
    const finishFailure = (): void => {
      if (settled) return;
      settled = true;
      for (const chunk of stdoutChunks) zeroize(chunk);
      stdoutChunks.length = 0;
      zeroize(requestBytes);
      reject(new FloodgateV7PrivateHumanKeyReviewUiError("helper"));
    };
    function onClose(code: number | null, signal: NodeJS.Signals | null): void {
      cleanupListeners();
      if (
        failed ||
        !spawned ||
        code !== 0 ||
        signal !== null ||
        stdoutBytes === 0
      ) {
        finishFailure();
        return;
      }
      if (settled) return;
      settled = true;
      const output = bufferConcat(stdoutChunks, stdoutBytes);
      for (const chunk of stdoutChunks) zeroize(chunk);
      stdoutChunks.length = 0;
      zeroize(requestBytes);
      resolve(output);
    }

    child.once("spawn", onSpawn);
    child.once("error", onChildError);
    child.once("close", onClose);
    child.stdin.on("error", onStreamError);
    child.stdout.on("data", onStdoutData);
    child.stdout.on("error", onStreamError);
    child.stderr.on("data", onStderrData);
    child.stderr.on("error", onStreamError);
    try {
      child.stdin.end(requestBytes, () => zeroize(requestBytes));
    } catch {
      forceFailure();
    }
  });
}

function parseResponse(
  bytes: Buffer,
  expectedDigest: string,
): Readonly<FloodgateV7PrivateHumanKeyReviewResponse> {
  let text: string;
  try {
    text = fatalUtf8Decoder.decode(bytes);
  } catch {
    throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
  }
  if (
    !text.endsWith("\n") ||
    text.indexOf("\n") !== text.length - 1 ||
    text.includes("\r")
  ) {
    throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
  }
  let parsed: unknown;
  try {
    parsed = jsonParse(text);
  } catch {
    throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
  }
  const response = exactPlainRecord(parsed, [
    "contract",
    "decision",
    "typed_candidate_sha256",
  ]);
  if (
    response.contract !==
    FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT
  ) {
    throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
  }
  if (response.decision === "cancel") {
    if (response.typed_candidate_sha256 !== null) {
      throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
    }
    const captured = frozenRecord({
      contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
      decision: "cancel" as const,
      typed_candidate_sha256: null,
    });
    if (`${jsonStringify(captured)}\n` !== text) {
      throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
    }
    return captured;
  }
  if (
    response.decision !== "approve" ||
    typeof response.typed_candidate_sha256 !== "string" ||
    !HEX_64_RE.test(response.typed_candidate_sha256)
  ) {
    throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
  }
  const typedBytes = bufferFrom(response.typed_candidate_sha256, "ascii");
  const expectedBytes = bufferFrom(expectedDigest, "ascii");
  try {
    if (!capturedTimingSafeEqual(typedBytes, expectedBytes)) {
      throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
    }
  } finally {
    zeroize(typedBytes);
    zeroize(expectedBytes);
  }
  const captured = frozenRecord({
    contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
    decision: "approve" as const,
    typed_candidate_sha256: response.typed_candidate_sha256,
  });
  if (`${jsonStringify(captured)}\n` !== text) {
    throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
  }
  return captured;
}

async function review(
  requestValue: FloodgateV7PrivateHumanKeyReviewRequest,
  dependencies: CapturedDependencies,
): Promise<Readonly<FloodgateV7PrivateHumanKeyReviewResponse>> {
  let request: Readonly<FloodgateV7PrivateHumanKeyReviewRequest>;
  let requestBytes: Buffer;
  try {
    request = captureRequest(requestValue);
    requestBytes = privateRequestBytes(request);
  } catch {
    throw new FloodgateV7PrivateHumanKeyReviewUiError("request");
  }
  const responseBytes = await runHelper(requestBytes, dependencies);
  try {
    return parseResponse(responseBytes, request.candidate_sha256);
  } catch (error) {
    if (error instanceof FloodgateV7PrivateHumanKeyReviewUiError) throw error;
    throw new FloodgateV7PrivateHumanKeyReviewUiError("response");
  } finally {
    zeroize(responseBytes);
  }
}

function productionSpawn(
  executable: string,
  arguments_: readonly string[],
  options: Readonly<FloodgateV7PrivateHumanKeyReviewSpawnOptionsForTests>,
): ChildProcessWithoutNullStreams {
  return capturedSpawn(executable, [...arguments_], {
    cwd: options.cwd,
    detached: options.detached,
    env: { ...options.env },
    shell: options.shell,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: options.windowsHide,
  });
}

/** Test-only child seam. It never relaxes the fixed executable or arguments. */
export function reviewFloodgateV7PrivateHumanKeyCandidateCoreForTests(
  request: FloodgateV7PrivateHumanKeyReviewRequest,
  dependenciesValue: FloodgateV7PrivateHumanKeyReviewUiDependenciesForTests,
): Promise<Readonly<FloodgateV7PrivateHumanKeyReviewResponse>> {
  if (arguments.length !== 2) return rejected("capture");
  let dependencies: CapturedDependencies;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected("capture");
  }
  return review(request, dependencies);
}

/**
 * Production macOS wrapper. Candidate content is accepted only as an in-memory
 * object from the orchestrator and is written solely to the helper's stdin.
 */
export function reviewFloodgateV7PrivateHumanKeyCandidate(
  request: FloodgateV7PrivateHumanKeyReviewRequest,
): Promise<Readonly<FloodgateV7PrivateHumanKeyReviewResponse>> {
  if (arguments.length !== 1) return rejected("capture");
  if (process.platform !== "darwin") return rejected("platform");
  return review(request, frozenRecord({ spawnChild: productionSpawn }));
}
