/**
 * One-child PUBLIC deterministic maxTime=0/maxTime=1 calibration.
 *
 * The child accepts only pinned runtime bytes. Its position, sample count,
 * constant clock, and search knobs are compiled into the tracked worker.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import type { Writable } from "node:stream";

import {
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY,
} from "./floodgate-stable-wasm-deadline-diagnostic";

export const FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-public-calibration-v1" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-public-calibration-worker-v1" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_STATUS =
  "public-fixed-sentinel-constant-clock-callback-calibration-complete" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT = 5;
export const FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WATCHDOG_MS = 180_000;
export const FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY =
  Object.freeze({
    bytes: 13_153,
    sha256: "a9d7112920eabbb12de29732eeb4540e2884d94cd6677b6ac43a8352f4648caf",
  });

const WORKER_BOOTSTRAP_SOURCE =
  'import { readFileSync } from "node:fs";' +
  "const source=readFileSync(3);" +
  'const encoded=Buffer.from(source).toString("base64");' +
  'await import("data:text/javascript;base64,"+encoded);';
const MAX_WORKER_STDOUT_BYTES = 256;
const STABILITY_LIMIT_PPM = 250_000;

export interface FloodgateStableWasmDeadlinePublicCalibrationAssets {
  readonly wasmBytes: Uint8Array;
  readonly weightsBytes: Uint8Array;
  readonly workerSourceBytes: Uint8Array;
}

export interface FloodgateStableWasmDeadlinePublicCalibrationResult {
  readonly callback_overhead_ratio_ppm: number;
  readonly exact_parity_count: 5;
}

export interface FloodgateStableWasmDeadlinePublicCalibrationTestOptions {
  readonly childExecutablePath?: string;
  readonly watchdogMilliseconds?: number;
}

interface CapturedAssets {
  readonly wasmBytes: Buffer;
  readonly weightsBytes: Buffer;
  readonly workerSourceBytes: Buffer;
}

interface WorkerResult {
  readonly callback_overhead_ratio_ppm: number;
  readonly exact_parity_count: 5;
  readonly schema: typeof FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA;
  readonly type: "calibration";
}

function fail(message: string): never {
  throw new Error(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function snapshotBytes(value: Uint8Array, label: string): Buffer {
  if (!(value instanceof Uint8Array)) fail(`${label} must be bytes`);
  return Buffer.from(value.slice());
}

function assertIdentity(
  bytes: Buffer,
  identity: Readonly<{ readonly bytes: number; readonly sha256: string }>,
  label: string,
): void {
  if (
    bytes.byteLength !== identity.bytes ||
    sha256(bytes) !== identity.sha256
  ) {
    fail(`${label} does not match its fixed identity`);
  }
}

function captureAssets(
  assets: Readonly<FloodgateStableWasmDeadlinePublicCalibrationAssets>,
  workerIdentity: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>,
): CapturedAssets {
  if (assets === null || typeof assets !== "object") {
    fail("calibration assets must be an object");
  }
  const captured = {
    wasmBytes: snapshotBytes(assets.wasmBytes, "calibration WASM"),
    weightsBytes: snapshotBytes(assets.weightsBytes, "calibration weights"),
    workerSourceBytes: snapshotBytes(
      assets.workerSourceBytes,
      "calibration worker",
    ),
  };
  assertIdentity(
    captured.wasmBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY,
    "calibration WASM",
  );
  assertIdentity(
    captured.weightsBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY,
    "calibration weights",
  );
  assertIdentity(
    captured.workerSourceBytes,
    workerIdentity,
    "calibration worker",
  );
  return Object.freeze(captured);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  fail("canonical JSON rejects unsupported values");
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

function parseWorkerResult(bytes: Buffer): WorkerResult | null {
  if (
    bytes.byteLength < 2 ||
    bytes[bytes.byteLength - 1] !== 0x0a ||
    bytes.subarray(0, bytes.byteLength - 1).includes(0x0a)
  ) {
    return null;
  }
  const line = bytes.subarray(0, bytes.byteLength - 1).toString("ascii");
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    canonicalJson(parsed) !== line
  ) {
    return null;
  }
  const message = parsed as Readonly<Record<string, unknown>>;
  if (
    !exactKeys(message, [
      "callback_overhead_ratio_ppm",
      "exact_parity_count",
      "schema",
      "type",
    ]) ||
    message.schema !==
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA ||
    message.type !== "calibration" ||
    !Number.isSafeInteger(message.callback_overhead_ratio_ppm) ||
    (message.callback_overhead_ratio_ppm as number) <= 0 ||
    message.exact_parity_count !==
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT
  ) {
    return null;
  }
  return message as unknown as WorkerResult;
}

function workerEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "test",
  };
  if (process.platform !== "win32") return Object.freeze(environment);
  if (process.env.SystemRoot !== undefined) {
    environment.SystemRoot = process.env.SystemRoot;
  }
  if (process.env.SystemDrive !== undefined) {
    environment.SystemDrive = process.env.SystemDrive;
  }
  return Object.freeze(environment);
}

function workerCwd(): string {
  if (process.platform !== "win32") return "/";
  return process.env.SystemDrive === undefined
    ? "C:\\"
    : `${process.env.SystemDrive}\\`;
}

function workerInputLine(assets: CapturedAssets): string {
  return `${canonicalJson({
    schema: FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_SCHEMA,
    wasm_base64: assets.wasmBytes.toString("base64"),
    weights_base64: assets.weightsBytes.toString("base64"),
  })}\n`;
}

/**
 * Test seam for the worker's fixed aggregate-only timing policy. Production
 * raw timings never leave the child.
 */
export function aggregateFloodgateStableWasmDeadlinePublicCalibrationCoreForTests(
  untimedDurations: readonly number[],
  callbackDurations: readonly number[],
  exactParityCount: number,
): FloodgateStableWasmDeadlinePublicCalibrationResult {
  if (
    untimedDurations.length !==
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT ||
    callbackDurations.length !==
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT ||
    exactParityCount !==
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT ||
    [...untimedDurations, ...callbackDurations].some(
      (duration) => !Number.isFinite(duration) || duration <= 0,
    )
  ) {
    fail("calibration samples are invalid");
  }
  const ratios = untimedDurations.map(
    (duration, index) => callbackDurations[index] / duration,
  );
  const sortedRatios = [...ratios].sort((left, right) => left - right);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];
  if (
    !Number.isFinite(medianRatio) ||
    medianRatio <= 0 ||
    ratios.some(
      (ratio) =>
        !Number.isFinite(ratio) ||
        ratio <= 0 ||
        Math.abs(ratio - medianRatio) / medianRatio >
          STABILITY_LIMIT_PPM / 1_000_000,
    )
  ) {
    fail("calibration samples are unstable");
  }
  const untimedTotal = untimedDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const callbackTotal = callbackDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const ratioPpm = Math.round((callbackTotal / untimedTotal) * 1_000_000);
  if (!Number.isSafeInteger(ratioPpm) || ratioPpm <= 0) {
    fail("aggregate calibration ratio is invalid");
  }
  return Object.freeze({
    callback_overhead_ratio_ppm: ratioPpm,
    exact_parity_count:
      exactParityCount as typeof FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT,
  });
}

function runCapturedCalibration(
  assets: CapturedAssets,
  options: Readonly<FloodgateStableWasmDeadlinePublicCalibrationTestOptions>,
): Promise<FloodgateStableWasmDeadlinePublicCalibrationResult> {
  const childExecutablePath = options.childExecutablePath ?? process.execPath;
  const watchdogMilliseconds =
    options.watchdogMilliseconds ??
    FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WATCHDOG_MS;
  if (
    typeof childExecutablePath !== "string" ||
    childExecutablePath.length === 0 ||
    !Number.isSafeInteger(watchdogMilliseconds) ||
    watchdogMilliseconds < 1 ||
    watchdogMilliseconds >
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WATCHDOG_MS
  ) {
    return Promise.reject(new Error("invalid calibration child options"));
  }

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(
        childExecutablePath,
        ["--input-type=module", "--eval", WORKER_BOOTSTRAP_SOURCE],
        {
          cwd: workerCwd(),
          env: workerEnvironment(),
          shell: false,
          stdio: ["pipe", "pipe", "pipe", "pipe"],
        },
      ) as ChildProcess;
    } catch (error) {
      reject(error);
      return;
    }

    const stdoutPieces: Buffer[] = [];
    let stdoutBytes = 0;
    let invalid = false;
    let watchdog = false;
    let settled = false;

    const killChild = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Only close is accepted as the successful reap boundary.
      }
    };
    const invalidate = () => {
      invalid = true;
      killChild();
    };
    const timer = setTimeout(() => {
      watchdog = true;
      killChild();
    }, watchdogMilliseconds);

    child.once(
      "close",
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (watchdog || invalid || code !== 0 || signal !== null) {
          reject(new Error("public calibration child failed closed"));
          return;
        }
        const result = parseWorkerResult(
          Buffer.concat(stdoutPieces, stdoutBytes),
        );
        if (result === null) {
          reject(new Error("public calibration child result was invalid"));
          return;
        }
        resolve(
          Object.freeze({
            callback_overhead_ratio_ppm: result.callback_overhead_ratio_ppm,
            exact_parity_count: result.exact_parity_count,
          }),
        );
      },
    );

    const stdin = child.stdin;
    const stdout = child.stdout;
    const stderr = child.stderr;
    if (stdin === null || stdout === null || stderr === null) {
      invalidate();
    } else {
      stdout.on("data", (chunk: Buffer) => {
        if (
          invalid ||
          watchdog ||
          chunk.byteLength > MAX_WORKER_STDOUT_BYTES - stdoutBytes ||
          [...chunk].some(
            (byte) => byte !== 0x0a && (byte < 0x20 || byte > 0x7e),
          )
        ) {
          invalidate();
          return;
        }
        stdoutPieces.push(Buffer.from(chunk));
        stdoutBytes += chunk.byteLength;
      });
      stderr.on("data", invalidate);
      stdin.on("error", invalidate);
    }
    child.on("error", invalidate);

    const sourcePipe = child.stdio[3] as Writable | null | undefined;
    if (sourcePipe === null || sourcePipe === undefined) {
      invalidate();
    } else {
      sourcePipe.once("error", invalidate);
      try {
        sourcePipe.end(assets.workerSourceBytes);
      } catch {
        invalidate();
      }
    }

    if (stdin === null) {
      invalidate();
      return;
    }
    try {
      stdin.end(workerInputLine(assets), "ascii");
    } catch {
      invalidate();
    }
  });
}

export function runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests(
  assets: Readonly<FloodgateStableWasmDeadlinePublicCalibrationAssets>,
  workerIdentity: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>,
  options: Readonly<FloodgateStableWasmDeadlinePublicCalibrationTestOptions> = {},
): Promise<FloodgateStableWasmDeadlinePublicCalibrationResult> {
  return runCapturedCalibration(captureAssets(assets, workerIdentity), options);
}

export function runFloodgateStableWasmDeadlinePublicCalibration(
  assets: Readonly<FloodgateStableWasmDeadlinePublicCalibrationAssets>,
): Promise<FloodgateStableWasmDeadlinePublicCalibrationResult> {
  return runCapturedCalibration(
    captureAssets(
      assets,
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY,
    ),
    {},
  );
}
