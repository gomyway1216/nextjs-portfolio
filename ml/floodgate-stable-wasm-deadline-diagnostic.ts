/**
 * Non-operational, in-memory stable-WASM deadline diagnostic core.
 *
 * This module has no asset reader, dataset reader, CLI, writer, production
 * authority, or runtime binding. Every request gets a fresh child. The child
 * reports only a safe phase, completed depth, and counter buckets; this module
 * returns only deterministic aggregate histograms after every child is reaped.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { isAbsolute } from "node:path";
import type { Writable } from "node:stream";

export const FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-diagnostic-v1" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-diagnostic-worker-v1" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS =
  "non-operational-in-memory-contract-core-no-production-import-binding-reader-writer-or-run-authority" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY =
  "deadline-isolation-and-aggregate-telemetry-only-not-teacher-data-partial-result-adoption-training-playing-strength-or-live-change" as const;

export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS = 600_000;
export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS = 615_000;
export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH = 11;
export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_QUIESCENCE_DEPTH = 10;
export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS = 12;
export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN = 6;

export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY = Object.freeze({
  bytes: 35_597,
  sha256: "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
});
export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY = Object.freeze({
  bytes: 1_185_988,
  sha256: "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
});
export const FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY = Object.freeze({
  bytes: 17_346,
  sha256: "7d085ddfce1c55e8ad792be13e44e48cd34344fe8a876c67fe89389271db16ca",
});

const COUNTER_BUCKETS = Object.freeze([
  "0",
  "1-1023",
  "1024-32767",
  "32768-1048575",
  "1048576-33554431",
  "33554432-2147483647",
] as const);
const PHASES = Object.freeze([
  "requested-depth-complete",
  "winning-mate-early",
  "cooperative-deadline-after-completed-depth-0",
  "cooperative-deadline-after-completed-depth-1",
  "cooperative-deadline-after-completed-depth-2",
  "cooperative-deadline-after-completed-depth-3",
  "cooperative-deadline-after-completed-depth-4",
  "cooperative-deadline-after-completed-depth-5",
  "cooperative-deadline-after-completed-depth-6",
  "cooperative-deadline-after-completed-depth-7",
  "cooperative-deadline-after-completed-depth-8",
  "cooperative-deadline-after-completed-depth-9",
  "cooperative-deadline-after-completed-depth-10",
  "outer-watchdog",
  "failure",
] as const);
const WORKER_BOOTSTRAP_SOURCE =
  'import { readFileSync } from "node:fs";' +
  "const source=readFileSync(3);" +
  'const encoded=Buffer.from(source).toString("base64");' +
  'await import("data:text/javascript;base64,"+encoded);';
const MAX_WORKER_STDOUT_BYTES = 1_024;
const STOP_POLL_MILLISECONDS = 25;
const NEVER_STOP = () => false;
const SENTE = 16;
const GOTE = 32;
const FIRST_HAND_KOMA = 17;
const VALID_BOARD_PIECES = Object.freeze([
  0, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 33, 34, 35, 36, 37,
  38, 39, 40, 41, 42, 43, 44, 46, 47,
] as const);
const MATERIAL_LIMIT_BY_KIND = Object.freeze([
  0, 18, 4, 4, 4, 4, 2, 2,
] as const);

type CounterBucket = (typeof COUNTER_BUCKETS)[number];
type DiagnosticPhase = (typeof PHASES)[number];
type LaneOutcome = "complete" | "deadline" | "watchdog" | "failure";

export interface FloodgateStableWasmDeadlineDiagnosticInput {
  readonly board: readonly number[];
  readonly hands: readonly number[];
  readonly sideToMove: 16 | 32;
  readonly rootTesu: number;
}

export interface FloodgateStableWasmDeadlineDiagnosticAssets {
  readonly wasmBytes: Uint8Array;
  readonly weightsBytes: Uint8Array;
  readonly workerSourceBytes: Uint8Array;
}

export interface FloodgateStableWasmDeadlineDiagnosticTestOptions {
  readonly cooperativeDeadlineMilliseconds?: number;
  readonly outerWatchdogMilliseconds?: number;
  readonly shouldStop?: () => boolean;
  readonly testOnlyChildExecutablePath?: string;
}

export interface FloodgateStableWasmDeadlineDiagnosticAggregate {
  readonly schema: typeof FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA;
  readonly status: typeof FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS;
  readonly claim_boundary: typeof FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY;
  readonly requests: number;
  readonly configured_maximum_parallel_children: 6;
  readonly observed_peak_parallel_children: number;
  readonly cooperative_deadline_ms: number;
  readonly outer_watchdog_ms: number;
  readonly outcome_counts: Readonly<Record<LaneOutcome, number>>;
  readonly phase_histogram: readonly Readonly<{
    readonly phase: DiagnosticPhase;
    readonly count: number;
  }>[];
  readonly completed_depth_histogram: readonly Readonly<{
    readonly depth: number;
    readonly count: number;
  }>[];
  readonly nodes_bucket_histogram: readonly Readonly<{
    readonly bucket: CounterBucket;
    readonly count: number;
  }>[];
  readonly leaves_bucket_histogram: readonly Readonly<{
    readonly bucket: CounterBucket;
    readonly count: number;
  }>[];
  readonly individual_lane_records_returned: 0;
  readonly partial_iteration_results_adopted: 0;
  readonly all_children_reaped: true;
}

interface CapturedInput {
  readonly board: readonly number[];
  readonly hands: readonly number[];
  readonly side_to_move: 16 | 32;
  readonly root_tesu: number;
}

interface CapturedAssets {
  readonly wasmBytes: Buffer;
  readonly weightsBytes: Buffer;
  readonly workerSourceBytes: Buffer;
}

interface CapturedOptions {
  readonly cooperativeDeadlineMilliseconds: number;
  readonly outerWatchdogMilliseconds: number;
  readonly childExecutablePath: string;
  readonly shouldStop: () => boolean;
}

interface SafeLaneTelemetry {
  readonly outcome: LaneOutcome;
  readonly phase: DiagnosticPhase;
  readonly completedDepth: number | null;
  readonly nodesBucket: CounterBucket | null;
  readonly leavesBucket: CounterBucket | null;
}

interface DiagnosticWorkerMessage {
  readonly adopted: false;
  readonly completed_depth: number;
  readonly leaves_bucket: CounterBucket;
  readonly nodes_bucket: CounterBucket;
  readonly outcome: "complete" | "deadline";
  readonly phase: DiagnosticPhase;
  readonly schema: typeof FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA;
  readonly type: "result";
}

interface ParityWorkerMessage {
  readonly compared_field_count: 5;
  readonly exact: boolean;
  readonly schema: typeof FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA;
  readonly type: "parity";
}

interface ChildLifecycleObserver {
  readonly onSpawn: () => void;
  readonly onReap: () => void;
}

function fail(message: string): never {
  throw new Error(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function snapshotBytes(value: Uint8Array, label: string): Buffer {
  if (!(value instanceof Uint8Array)) fail(`${label} must be a Uint8Array`);
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
  assets: Readonly<FloodgateStableWasmDeadlineDiagnosticAssets>,
  workerIdentity: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>,
): CapturedAssets {
  if (assets === null || typeof assets !== "object" || Array.isArray(assets)) {
    fail("diagnostic assets must be an object");
  }
  const wasmBytes = snapshotBytes(assets.wasmBytes, "WASM bytes");
  const weightsBytes = snapshotBytes(assets.weightsBytes, "weights bytes");
  const workerSourceBytes = snapshotBytes(
    assets.workerSourceBytes,
    "worker source bytes",
  );
  assertIdentity(
    wasmBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WASM_IDENTITY,
    "WASM bytes",
  );
  assertIdentity(
    weightsBytes,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WEIGHTS_IDENTITY,
    "weights bytes",
  );
  assertIdentity(workerSourceBytes, workerIdentity, "worker source bytes");
  return Object.freeze({ wasmBytes, weightsBytes, workerSourceBytes });
}

function captureInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} is outside its permitted integer range`);
  }
  return value;
}

function pieceSide(koma: number): number {
  if ((koma & SENTE) !== 0) return SENTE;
  if ((koma & GOTE) !== 0) return GOTE;
  return 0;
}

function basePieceKind(koma: number): number {
  const kind = koma & 0x0f;
  return kind >= 9 ? kind - 8 : kind;
}

function captureInput(
  input: Readonly<FloodgateStableWasmDeadlineDiagnosticInput>,
): CapturedInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("diagnostic input must be an object");
  }
  if (!Array.isArray(input.board) || input.board.length !== 81) {
    fail("diagnostic board must contain exactly 81 squares");
  }
  if (!Array.isArray(input.hands) || input.hands.length !== 23) {
    fail("diagnostic hands must contain exactly 23 slots");
  }
  const materialByKind = Array.from({ length: 9 }, () => 0);
  let senteKings = 0;
  let goteKings = 0;
  const board = Object.freeze(
    input.board.map((value, index) => {
      const koma = captureInteger(
        value,
        0,
        47,
        `diagnostic board square ${index}`,
      );
      if (!(VALID_BOARD_PIECES as readonly number[]).includes(koma)) {
        fail(`diagnostic board square ${index} contains an invalid piece`);
      }
      if (koma === 24) senteKings += 1;
      if (koma === 40) goteKings += 1;
      if (koma !== 0) materialByKind[basePieceKind(koma)] += 1;
      return koma;
    }),
  );
  if (senteKings !== 1 || goteKings !== 1) {
    fail("diagnostic board must contain exactly one king for each side");
  }
  const hands = Object.freeze(
    input.hands.map((value, index) => {
      const count = captureInteger(value, 0, 18, `diagnostic hands[${index}]`);
      const koma = FIRST_HAND_KOMA + index;
      const kind = koma & 0x0f;
      const droppable =
        (pieceSide(koma) === SENTE || pieceSide(koma) === GOTE) &&
        kind >= 1 &&
        kind <= 7;
      if (!droppable && count !== 0) {
        fail(`diagnostic hands[${index}] is not a droppable-piece slot`);
      }
      if (count !== 0) materialByKind[kind] += count;
      return count;
    }),
  );
  for (let kind = 1; kind < MATERIAL_LIMIT_BY_KIND.length; kind += 1) {
    if (materialByKind[kind] > MATERIAL_LIMIT_BY_KIND[kind]) {
      fail(`diagnostic position exceeds the material limit for kind ${kind}`);
    }
  }
  if (input.sideToMove !== 16 && input.sideToMove !== 32) {
    fail("diagnostic side to move is invalid");
  }
  return Object.freeze({
    board,
    hands,
    side_to_move: input.sideToMove,
    root_tesu: captureInteger(
      input.rootTesu,
      0,
      0x7fffffff,
      "diagnostic root tesu",
    ),
  });
}

function captureInputs(
  inputs: readonly Readonly<FloodgateStableWasmDeadlineDiagnosticInput>[],
): readonly CapturedInput[] {
  if (
    !Array.isArray(inputs) ||
    inputs.length < 1 ||
    inputs.length > FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS
  ) {
    fail("diagnostic input count must be between 1 and 12");
  }
  return Object.freeze(inputs.map((input) => captureInput(input)));
}

function captureOptions(
  options: Readonly<FloodgateStableWasmDeadlineDiagnosticTestOptions>,
): CapturedOptions {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    fail("diagnostic test options must be an object");
  }
  const cooperativeDeadlineMilliseconds = captureInteger(
    options.cooperativeDeadlineMilliseconds ??
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
    1,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
    "cooperative deadline",
  );
  const outerWatchdogMilliseconds = captureInteger(
    options.outerWatchdogMilliseconds ??
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
    cooperativeDeadlineMilliseconds + 1,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
    "outer watchdog",
  );
  const childExecutablePath =
    options.testOnlyChildExecutablePath ?? process.execPath;
  const shouldStop = options.shouldStop ?? NEVER_STOP;
  if (
    typeof childExecutablePath !== "string" ||
    !isAbsolute(childExecutablePath) ||
    childExecutablePath.length > 4_096 ||
    /[\u0000-\u001f\u007f]/u.test(childExecutablePath) ||
    typeof shouldStop !== "function"
  ) {
    fail("diagnostic test child executable path is invalid");
  }
  return Object.freeze({
    cooperativeDeadlineMilliseconds,
    outerWatchdogMilliseconds,
    childExecutablePath,
    shouldStop,
  });
}

function stopRequested(shouldStop: () => boolean): boolean {
  try {
    const result = shouldStop();
    return typeof result !== "boolean" || result;
  } catch {
    return true;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
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
  fail(`canonical JSON rejects ${typeof value}`);
}

function isCounterBucket(value: unknown): value is CounterBucket {
  return (
    typeof value === "string" &&
    (COUNTER_BUCKETS as readonly string[]).includes(value)
  );
}

function isDiagnosticPhase(value: unknown): value is DiagnosticPhase {
  return (
    typeof value === "string" && (PHASES as readonly string[]).includes(value)
  );
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

function parseWorkerMessage(stdout: Buffer, mode: "diagnostic" | "parity") {
  if (
    stdout.byteLength < 2 ||
    stdout[stdout.length - 1] !== 0x0a ||
    stdout.subarray(0, stdout.length - 1).includes(0x0a)
  ) {
    return null;
  }
  const line = stdout.subarray(0, stdout.length - 1).toString("ascii");
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
    message.schema !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA
  ) {
    return null;
  }
  if (mode === "parity") {
    if (
      !exactKeys(message, [
        "compared_field_count",
        "exact",
        "schema",
        "type",
      ]) ||
      message.type !== "parity" ||
      message.compared_field_count !== 5 ||
      typeof message.exact !== "boolean"
    ) {
      return null;
    }
    return message as unknown as ParityWorkerMessage;
  }
  if (
    !exactKeys(message, [
      "adopted",
      "completed_depth",
      "leaves_bucket",
      "nodes_bucket",
      "outcome",
      "phase",
      "schema",
      "type",
    ]) ||
    message.type !== "result" ||
    message.adopted !== false ||
    (message.outcome !== "complete" && message.outcome !== "deadline") ||
    !Number.isSafeInteger(message.completed_depth) ||
    (message.completed_depth as number) < 0 ||
    (message.completed_depth as number) >
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH ||
    !isCounterBucket(message.nodes_bucket) ||
    !isCounterBucket(message.leaves_bucket) ||
    !isDiagnosticPhase(message.phase)
  ) {
    return null;
  }
  const completedDepth = message.completed_depth as number;
  const expectedPhase =
    message.outcome === "deadline"
      ? `cooperative-deadline-after-completed-depth-${completedDepth}`
      : completedDepth === FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH
        ? "requested-depth-complete"
        : "winning-mate-early";
  if (message.phase !== expectedPhase) return null;
  return message as unknown as DiagnosticWorkerMessage;
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
  const drive = process.env.SystemDrive;
  return drive === undefined ? "C:\\" : `${drive}\\`;
}

function createWorkerInputLine(
  input: CapturedInput,
  assets: CapturedAssets,
  cooperativeDeadlineMilliseconds: number,
  mode: "diagnostic" | "parity",
): string {
  return `${canonicalJson({
    board: input.board,
    cooperative_deadline_ms: cooperativeDeadlineMilliseconds,
    hands: input.hands,
    mode,
    root_tesu: input.root_tesu,
    schema: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_WORKER_SCHEMA,
    side_to_move: input.side_to_move,
    wasm_base64: assets.wasmBytes.toString("base64"),
    weights_base64: assets.weightsBytes.toString("base64"),
  })}\n`;
}

function safeFailure(): SafeLaneTelemetry {
  return Object.freeze({
    outcome: "failure" as const,
    phase: "failure" as const,
    completedDepth: null,
    nodesBucket: null,
    leavesBucket: null,
  });
}

function runOneChild(
  input: CapturedInput,
  assets: CapturedAssets,
  options: CapturedOptions,
  mode: "diagnostic" | "parity",
  lifecycle?: ChildLifecycleObserver,
): Promise<SafeLaneTelemetry | ParityWorkerMessage | null> {
  if (stopRequested(options.shouldStop)) {
    return Promise.resolve(mode === "diagnostic" ? safeFailure() : null);
  }
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(
        options.childExecutablePath,
        ["--input-type=module", "--eval", WORKER_BOOTSTRAP_SOURCE],
        {
          cwd: workerCwd(),
          env: workerEnvironment(),
          shell: false,
          stdio: ["pipe", "pipe", "pipe", "pipe"],
        },
      ) as ChildProcess;
    } catch {
      resolve(mode === "diagnostic" ? safeFailure() : null);
      return;
    }
    let lifecycleSpawned = false;
    child.once("spawn", () => {
      lifecycleSpawned = true;
      lifecycle?.onSpawn();
    });

    const stdoutPieces: Buffer[] = [];
    let stdoutBytes = 0;
    let invalid = false;
    let stopped = false;
    let watchdog = false;
    let settled = false;

    const killOnlyThisChild = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The close event remains the only successful reap boundary.
      }
    };
    const markInvalid = () => {
      invalid = true;
      killOnlyThisChild();
    };
    const stopPoll = setInterval(() => {
      if (!stopRequested(options.shouldStop)) return;
      stopped = true;
      killOnlyThisChild();
    }, STOP_POLL_MILLISECONDS);
    const timer = setTimeout(() => {
      watchdog = true;
      killOnlyThisChild();
    }, options.outerWatchdogMilliseconds);

    const stdin = child.stdin;
    const stdout = child.stdout;
    const stderr = child.stderr;
    if (stdin === null || stdout === null || stderr === null) {
      markInvalid();
    } else {
      stdout.on("data", (chunk: Buffer) => {
        if (invalid || watchdog) return;
        if (
          chunk.byteLength > MAX_WORKER_STDOUT_BYTES - stdoutBytes ||
          [...chunk].some(
            (byte) => byte !== 0x0a && (byte < 0x20 || byte > 0x7e),
          )
        ) {
          markInvalid();
          return;
        }
        stdoutPieces.push(Buffer.from(chunk));
        stdoutBytes += chunk.byteLength;
      });
      stderr.on("data", () => markInvalid());
      stdin.on("error", () => markInvalid());
    }
    child.on("error", () => markInvalid());
    const sourcePipe = child.stdio[3] as Writable | null | undefined;
    if (sourcePipe === null || sourcePipe === undefined) {
      markInvalid();
    } else {
      try {
        sourcePipe.once("error", () => markInvalid());
        sourcePipe.end(assets.workerSourceBytes);
      } catch {
        markInvalid();
      }
    }

    child.once(
      "close",
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        if (lifecycleSpawned) lifecycle?.onReap();
        clearInterval(stopPoll);
        clearTimeout(timer);
        if (watchdog) {
          resolve(
            mode === "diagnostic"
              ? Object.freeze({
                  outcome: "watchdog" as const,
                  phase: "outer-watchdog" as const,
                  completedDepth: null,
                  nodesBucket: null,
                  leavesBucket: null,
                })
              : null,
          );
          return;
        }
        if (stopped || invalid || code !== 0 || signal !== null) {
          resolve(mode === "diagnostic" ? safeFailure() : null);
          return;
        }
        const message = parseWorkerMessage(
          Buffer.concat(stdoutPieces, stdoutBytes),
          mode,
        );
        if (message === null) {
          resolve(mode === "diagnostic" ? safeFailure() : null);
        } else if (message.type === "parity") {
          resolve(message);
        } else {
          resolve(
            Object.freeze({
              outcome: message.outcome,
              phase: message.phase,
              completedDepth: message.completed_depth,
              nodesBucket: message.nodes_bucket,
              leavesBucket: message.leaves_bucket,
            }),
          );
        }
      },
    );

    if (stdin === null) {
      markInvalid();
      return;
    }
    try {
      stdin.end(
        createWorkerInputLine(
          input,
          assets,
          options.cooperativeDeadlineMilliseconds,
          mode,
        ),
        "ascii",
      );
    } catch {
      markInvalid();
    }
  });
}

function emptyOutcomeCounts(): Record<LaneOutcome, number> {
  return { complete: 0, deadline: 0, watchdog: 0, failure: 0 };
}

function aggregate(
  telemetry: readonly SafeLaneTelemetry[],
  options: CapturedOptions,
  observedPeakParallelChildren: number,
): FloodgateStableWasmDeadlineDiagnosticAggregate {
  const outcomeCounts = emptyOutcomeCounts();
  const phaseCounts = new Map<DiagnosticPhase, number>(
    PHASES.map((phase) => [phase, 0]),
  );
  const depthCounts = Array.from(
    { length: FLOODGATE_STABLE_WASM_DIAGNOSTIC_REQUESTED_DEPTH + 1 },
    () => 0,
  );
  const nodeCounts = new Map<CounterBucket, number>(
    COUNTER_BUCKETS.map((bucket) => [bucket, 0]),
  );
  const leafCounts = new Map<CounterBucket, number>(
    COUNTER_BUCKETS.map((bucket) => [bucket, 0]),
  );

  for (const lane of telemetry) {
    outcomeCounts[lane.outcome] += 1;
    phaseCounts.set(lane.phase, (phaseCounts.get(lane.phase) ?? 0) + 1);
    if (lane.completedDepth !== null) depthCounts[lane.completedDepth] += 1;
    if (lane.nodesBucket !== null) {
      nodeCounts.set(
        lane.nodesBucket,
        (nodeCounts.get(lane.nodesBucket) ?? 0) + 1,
      );
    }
    if (lane.leavesBucket !== null) {
      leafCounts.set(
        lane.leavesBucket,
        (leafCounts.get(lane.leavesBucket) ?? 0) + 1,
      );
    }
  }

  return Object.freeze({
    schema: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA,
    status: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS,
    claim_boundary: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY,
    requests: telemetry.length,
    configured_maximum_parallel_children:
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN as 6,
    observed_peak_parallel_children: observedPeakParallelChildren,
    cooperative_deadline_ms: options.cooperativeDeadlineMilliseconds,
    outer_watchdog_ms: options.outerWatchdogMilliseconds,
    outcome_counts: Object.freeze(outcomeCounts),
    phase_histogram: Object.freeze(
      PHASES.map((phase) =>
        Object.freeze({ phase, count: phaseCounts.get(phase) ?? 0 }),
      ),
    ),
    completed_depth_histogram: Object.freeze(
      depthCounts.map((count, depth) => Object.freeze({ depth, count })),
    ),
    nodes_bucket_histogram: Object.freeze(
      COUNTER_BUCKETS.map((bucket) =>
        Object.freeze({ bucket, count: nodeCounts.get(bucket) ?? 0 }),
      ),
    ),
    leaves_bucket_histogram: Object.freeze(
      COUNTER_BUCKETS.map((bucket) =>
        Object.freeze({ bucket, count: leafCounts.get(bucket) ?? 0 }),
      ),
    ),
    individual_lane_records_returned: 0 as const,
    partial_iteration_results_adopted: 0 as const,
    all_children_reaped: true as const,
  });
}

function runCapturedDiagnostic(
  inputs: readonly CapturedInput[],
  assets: CapturedAssets,
  options: CapturedOptions,
): Promise<FloodgateStableWasmDeadlineDiagnosticAggregate> {
  const outcomes: Array<SafeLaneTelemetry | ParityWorkerMessage | null> =
    new Array(inputs.length);
  let nextInput = 0;
  let activeChildren = 0;
  let observedPeakParallelChildren = 0;
  const lifecycle = Object.freeze({
    onSpawn: () => {
      activeChildren += 1;
      observedPeakParallelChildren = Math.max(
        observedPeakParallelChildren,
        activeChildren,
      );
    },
    onReap: () => {
      activeChildren -= 1;
    },
  });

  const consume = async () => {
    while (nextInput < inputs.length) {
      const inputIndex = nextInput;
      nextInput += 1;
      outcomes[inputIndex] = await runOneChild(
        inputs[inputIndex],
        assets,
        options,
        "diagnostic",
        lifecycle,
      );
    }
  };
  const consumers = Array.from(
    {
      length: Math.min(
        FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN,
        inputs.length,
      ),
    },
    () => consume(),
  );

  return Promise.all(consumers).then(() => {
    if (activeChildren !== 0) {
      fail("diagnostic aggregation requires every child to be reaped");
    }
    const telemetry = outcomes.map((outcome) =>
      outcome === null || "type" in outcome ? safeFailure() : outcome,
    );
    return aggregate(telemetry, options, observedPeakParallelChildren);
  });
}

/**
 * Captures all bytes and positions before the first asynchronous boundary.
 * The optional timing overrides exist only to make the real-WASM and synthetic
 * watchdog tests finish quickly; omitting them fixes 600s + 615s.
 */
export function runFloodgateStableWasmDeadlineDiagnosticCoreForTests(
  inputs: readonly Readonly<FloodgateStableWasmDeadlineDiagnosticInput>[],
  assets: Readonly<FloodgateStableWasmDeadlineDiagnosticAssets>,
  options: Readonly<FloodgateStableWasmDeadlineDiagnosticTestOptions> = {},
): Promise<FloodgateStableWasmDeadlineDiagnosticAggregate> {
  const capturedInputs = captureInputs(inputs);
  const capturedAssets = captureAssets(
    assets,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY,
  );
  const capturedOptions = captureOptions(options);
  return runCapturedDiagnostic(capturedInputs, capturedAssets, capturedOptions);
}

export function runFloodgateStableWasmDeadlineDiagnosticWithSourceCoreForTests(
  inputs: readonly Readonly<FloodgateStableWasmDeadlineDiagnosticInput>[],
  assets: Readonly<FloodgateStableWasmDeadlineDiagnosticAssets>,
  options: Readonly<FloodgateStableWasmDeadlineDiagnosticTestOptions>,
  workerIdentity: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>,
): Promise<FloodgateStableWasmDeadlineDiagnosticAggregate> {
  const capturedInputs = captureInputs(inputs);
  const capturedAssets = captureAssets(assets, workerIdentity);
  const capturedOptions = captureOptions(options);
  return runCapturedDiagnostic(capturedInputs, capturedAssets, capturedOptions);
}

export function confirmFloodgateStableWasmDeadlineParityCoreForTests(
  input: Readonly<FloodgateStableWasmDeadlineDiagnosticInput>,
  assets: Readonly<FloodgateStableWasmDeadlineDiagnosticAssets>,
): Promise<boolean> {
  const capturedInput = captureInput(input);
  const capturedAssets = captureAssets(
    assets,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY,
  );
  const capturedOptions = captureOptions({
    cooperativeDeadlineMilliseconds:
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
    outerWatchdogMilliseconds:
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
  });
  return runOneChild(
    capturedInput,
    capturedAssets,
    capturedOptions,
    "parity",
  ).then((result) =>
    result !== null && "type" in result && result.type === "parity"
      ? result.exact
      : false,
  );
}
