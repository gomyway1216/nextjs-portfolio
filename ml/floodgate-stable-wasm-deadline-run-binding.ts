/**
 * Fixed, zero-configuration, read-only production binding for the isolated
 * stable-WASM deadline diagnostic.
 *
 * PUBLIC calibration must pass before the connector capability is claimed or
 * authenticated training rows are opened. The private path returns aggregate
 * telemetry only and compares a fixed 13-file persistence scope before/after.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA,
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY,
  runFloodgateStableWasmDeadlineDiagnosticCoreForTests,
  type FloodgateStableWasmDeadlineDiagnosticAggregate,
  type FloodgateStableWasmDeadlineDiagnosticAssets,
  type FloodgateStableWasmDeadlineDiagnosticInput,
} from "./floodgate-stable-wasm-deadline-diagnostic";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT,
  FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY,
  runFloodgateStableWasmDeadlinePublicCalibration,
  type FloodgateStableWasmDeadlinePublicCalibrationAssets,
  type FloodgateStableWasmDeadlinePublicCalibrationResult,
} from "./floodgate-stable-wasm-deadline-public-calibration";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
  captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance,
  type FloodgateStableWasmDeadlineDiagnosticSourceBinding,
} from "./floodgate-stable-wasm-deadline-diagnostic-source-provenance";
import {
  captureFloodgateStableWasmDeadlineRegistryApplicationSource,
  type FloodgateStableWasmDeadlineRegistryApplicationSourceBinding,
} from "./floodgate-stable-wasm-deadline-read-only-application-source";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS,
  withFloodgateStableWasmDeadlineReadOnlyAssets,
  type FloodgateStableWasmDeadlineReadOnlyAssets,
} from "./floodgate-stable-wasm-deadline-read-only-assets";
import {
  claimFloodgateStableWasmDeadlineConsumerPostflight,
  claimFloodgateStableWasmDeadlineReadOnlyRows,
  withFloodgateStableWasmDeadlineReadOnlyRows,
  type FloodgateStableWasmDeadlineAuthenticatedRows,
  type FloodgateStableWasmDeadlineConsumerPostflightCapability,
} from "./floodgate-stable-wasm-deadline-read-only-consumer";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME,
  FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS,
  FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
  claimFloodgateStableWasmDeadlineReadOnlyRegistry,
  loadFloodgateStableWasmDeadlineReadOnlyRegistry,
  type FloodgateStableWasmDeadlineReadOnlyConsumerOptions,
  type FloodgateStableWasmDeadlineReadOnlyRegistryCapability,
} from "./floodgate-stable-wasm-deadline-read-only-registry";
import { positionFromSfen } from "./shogi-sfen";

export const FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-run-binding-v1" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS =
  "aggregate-only-read-only-diagnostic-complete" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY =
  "read-only-public-calibration-and-private-aggregate-deadline-observation-only-no-teacher-label-training-playing-strength-live-weight-or-production-gate-authority" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-run-binding-failure-v1" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS =
  "STOP-fixed-phase-no-private-detail" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_REQUIRED_NODE =
  "v22.13.0" as const;
export const FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT = 13;

const ROLE_BUNDLE_FILES = Object.freeze([
  "fresh-final-holdout.protected-position-ids.txt",
  "fresh-final-holdout.raw.jsonl",
  "fresh-selection.protected-position-ids.txt",
  "fresh-selection.raw.jsonl",
  "manifest.json",
  "replay-excluded-position-ids.txt",
  "replay-exclusion-receipt.json",
  "training.protected-position-ids.txt",
  "training.raw.jsonl",
] as const);
const STABLE_WASM_RELATIVE_PATH = Object.freeze(["stable", "shogi.wasm"]);
const STABLE_WEIGHTS_RELATIVE_PATH = Object.freeze([
  "stable",
  "shogi-nnue-weights.bin",
]);
const DIAGNOSTIC_WORKER_FILENAME =
  "floodgate-stable-wasm-deadline-diagnostic-worker.mjs";
const CALIBRATION_WORKER_FILENAME =
  "floodgate-stable-wasm-deadline-public-calibration-worker.mjs";
const APPROVED_KEY_ENROLLMENT_ROOT_COMPONENTS = Object.freeze([
  "Library",
  "Application Support",
  "nextjs-portfolio",
  "shogi-floodgate-v7-control-plane-v1",
] as const);
const APPROVED_KEY_ENROLLMENT_FILENAME = "approved-key-instance.json" as const;
const CONTROL_MAX_BYTES = 64 * 1024;
const ROLE_FILE_MAX_BYTES = 512 * 1024 * 1024;
const TRACKED_SOURCE_MAX_BYTES = 128 * 1024;
const MODE_TYPE_MASK = BigInt(0o170000);
const MODE_REGULAR = BigInt(0o100000);
const DIAGNOSTIC_COUNTER_BUCKETS = Object.freeze([
  "0",
  "1-1023",
  "1024-32767",
  "32768-1048575",
  "1048576-33554431",
  "33554432-2147483647",
] as const);
const DIAGNOSTIC_PHASES = Object.freeze([
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

export type FloodgateStableWasmDeadlineRunBindingFailurePhase =
  | "invocation"
  | "platform"
  | "persistent-before-control"
  | "registry-load"
  | "worker-source"
  | "persistent-before-assets"
  | "asset-authority"
  | "public-calibration"
  | "registry-claim"
  | "registry-application-source-before"
  | "persistent-before-role"
  | "consumer-authentication"
  | "consumer-claim"
  | "row-selection"
  | "private-diagnostic"
  | "consumer-postflight"
  | "postflight-claim"
  | "asset-cleanup"
  | "persistent-after"
  | "registry-application-source-after"
  | "diagnostic-source-after"
  | "signal"
  | "output"
  | "internal";

export class FloodgateStableWasmDeadlineRunBindingError extends Error {
  readonly phase: FloodgateStableWasmDeadlineRunBindingFailurePhase;

  constructor(phase: FloodgateStableWasmDeadlineRunBindingFailurePhase) {
    super("Floodgate stable-WASM deadline run binding stopped");
    this.name = "FloodgateStableWasmDeadlineRunBindingError";
    this.phase = phase;
    Object.freeze(this);
  }
}

export interface FloodgateStableWasmDeadlineRunBindingFailure {
  readonly phase: FloodgateStableWasmDeadlineRunBindingFailurePhase;
  readonly schema: typeof FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA;
  readonly status: typeof FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS;
}

export interface FloodgateStableWasmDeadlineRunBindingSuccess {
  readonly calibration: Readonly<{
    readonly callback_overhead_ratio_ppm: number;
    readonly exact_parity_count: 5;
  }>;
  readonly claim_boundary: typeof FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY;
  readonly diagnostic: Readonly<{
    readonly all_children_reaped: true;
    readonly completed_depth_histogram: FloodgateStableWasmDeadlineDiagnosticAggregate["completed_depth_histogram"];
    readonly configured_maximum_parallel_children: 6;
    readonly cooperative_deadline_ms: 600_000;
    readonly individual_lane_records_returned: 0;
    readonly leaves_bucket_histogram: FloodgateStableWasmDeadlineDiagnosticAggregate["leaves_bucket_histogram"];
    readonly nodes_bucket_histogram: FloodgateStableWasmDeadlineDiagnosticAggregate["nodes_bucket_histogram"];
    readonly observed_peak_parallel_children: number;
    readonly outcome_counts: FloodgateStableWasmDeadlineDiagnosticAggregate["outcome_counts"];
    readonly outer_watchdog_ms: 615_000;
    readonly partial_iteration_results_adopted: 0;
    readonly phase_histogram: FloodgateStableWasmDeadlineDiagnosticAggregate["phase_histogram"];
    readonly requests: 12;
  }>;
  readonly lifecycle: Readonly<{
    readonly all_spawned_children_reaped: true;
    readonly authenticated_callbacks: 1;
    readonly calibration_child_reaped: 1;
    readonly diagnostic_lanes_settled: 12;
    readonly exact_input_claims: 1;
    readonly postflight_claims: 1;
    readonly registry_claims: 1;
  }>;
  readonly nonclaims: Readonly<{
    readonly live_mutation: false;
    readonly playing_strength: false;
    readonly teacher_generation: false;
    readonly training: false;
    readonly tt_retry_or_resume: false;
  }>;
  readonly persistent_state: Readonly<{
    readonly all_unchanged: true;
    readonly scope_count: 13;
    readonly unchanged_count: 13;
  }>;
  readonly schema: typeof FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA;
  readonly source_closure: Readonly<{
    readonly diagnostic_before_after_exact_clean: true;
    readonly registry_application_binding_before_after_exact: true;
  }>;
  readonly status: typeof FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS;
}

type StableRuntimeAssets = FloodgateStableWasmDeadlineReadOnlyAssets;

interface RegistryClaim {
  readonly applicationSourceBinding: Readonly<FloodgateStableWasmDeadlineRegistryApplicationSourceBinding>;
  readonly consumer: Readonly<FloodgateStableWasmDeadlineReadOnlyConsumerOptions>;
}

interface ScopeSpecification {
  readonly label: string;
  readonly path: string;
  readonly maximumBytes: number;
}

interface FileFingerprint {
  readonly label: string;
  readonly path: string;
  readonly bytes: string;
  readonly sha256: string;
  readonly stat: string;
}

interface StableFileRead {
  readonly bytes: Buffer;
  readonly fingerprint: Readonly<FileFingerprint>;
}

interface TrackedWorkers {
  readonly calibration: Buffer;
  readonly diagnostic: Buffer;
}

export interface FloodgateStableWasmDeadlineRunBindingDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly repositoryRoot: string;
  readonly expectedDiagnosticSourceBinding: Readonly<FloodgateStableWasmDeadlineDiagnosticSourceBinding>;
  readonly loadRegistry: () => Promise<object>;
  readonly claimRegistry: (capability: object) => Readonly<RegistryClaim>;
  readonly captureDiagnosticSource: () => Promise<
    Readonly<FloodgateStableWasmDeadlineDiagnosticSourceBinding>
  >;
  readonly captureRegistryApplicationSource: () => Promise<
    Readonly<FloodgateStableWasmDeadlineRegistryApplicationSourceBinding>
  >;
  readonly shouldStop: () => boolean;
  readonly withAssets: <TResult>(
    callback: (assets: Readonly<StableRuntimeAssets>) => Promise<TResult>,
  ) => Promise<TResult>;
  readonly calibrate: (
    assets: Readonly<FloodgateStableWasmDeadlinePublicCalibrationAssets>,
  ) => Promise<FloodgateStableWasmDeadlinePublicCalibrationResult>;
  readonly consumeRows: (
    options: FloodgateStableWasmDeadlineReadOnlyConsumerOptions,
    callback: (
      input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
    ) => Promise<void>,
  ) => Promise<
    Readonly<FloodgateStableWasmDeadlineConsumerPostflightCapability> | object
  >;
  readonly claimRows: (
    input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
  ) => void;
  readonly claimPostflight: (
    receipt:
      | Readonly<FloodgateStableWasmDeadlineConsumerPostflightCapability>
      | object,
  ) => void;
  readonly diagnose: (
    inputs: readonly Readonly<FloodgateStableWasmDeadlineDiagnosticInput>[],
    assets: Readonly<FloodgateStableWasmDeadlineDiagnosticAssets>,
  ) => Promise<FloodgateStableWasmDeadlineDiagnosticAggregate>;
  readonly readTrackedWorkers?: () => Promise<Readonly<TrackedWorkers>>;
}

function fail(phase: FloodgateStableWasmDeadlineRunBindingFailurePhase): never {
  throw new FloodgateStableWasmDeadlineRunBindingError(phase);
}

function statString(stat: fs.BigIntStats): string {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.nlink,
    stat.uid,
    stat.gid,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ]
    .map(String)
    .join(":");
}

function sameIdentityAndMetadata(
  left: fs.BigIntStats,
  right: fs.BigIntStats,
): boolean {
  return statString(left) === statString(right);
}

function canonicalAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    path.isAbsolute(value) &&
    path.resolve(value) === value &&
    !value.includes("\0")
  );
}

async function readStableRegularFile(
  specification: Readonly<ScopeSpecification>,
  effectiveUserId: number,
): Promise<Readonly<StableFileRead>> {
  if (
    !canonicalAbsolutePath(specification.path) ||
    !Number.isSafeInteger(specification.maximumBytes) ||
    specification.maximumBytes < 1
  ) {
    throw new Error("invalid fixed file specification");
  }
  const before = await fs.promises.lstat(specification.path, {
    bigint: true,
  });
  const beforeRealpath = await fs.promises.realpath(specification.path);
  if (
    beforeRealpath !== specification.path ||
    (before.mode & MODE_TYPE_MASK) !== MODE_REGULAR ||
    before.nlink !== BigInt(1) ||
    before.uid !== BigInt(effectiveUserId) ||
    before.size < BigInt(0) ||
    before.size > BigInt(specification.maximumBytes)
  ) {
    throw new Error("fixed file namespace or metadata is invalid");
  }

  const handle = await fs.promises.open(
    specification.path,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  let bytes: Buffer | null = null;
  let completed = false;
  let closeFailure: unknown = null;
  try {
    const heldBefore = await handle.stat({ bigint: true });
    if (!sameIdentityAndMetadata(before, heldBefore)) {
      throw new Error("pathname and held descriptor differ");
    }
    bytes = await handle.readFile();
    if (BigInt(bytes.byteLength) !== heldBefore.size) {
      throw new Error("held file byte count changed");
    }
    const heldAfter = await handle.stat({ bigint: true });
    const after = await fs.promises.lstat(specification.path, {
      bigint: true,
    });
    const afterRealpath = await fs.promises.realpath(specification.path);
    if (
      afterRealpath !== specification.path ||
      !sameIdentityAndMetadata(heldBefore, heldAfter) ||
      !sameIdentityAndMetadata(heldAfter, after)
    ) {
      throw new Error("fixed file changed during stable read");
    }
    completed = true;
    return Object.freeze({
      bytes,
      fingerprint: Object.freeze({
        label: specification.label,
        path: specification.path,
        bytes: String(bytes.byteLength),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        stat: statString(heldAfter),
      }),
    });
  } finally {
    try {
      await handle.close();
    } catch (error) {
      closeFailure = error;
    }
    if (!completed || closeFailure !== null) bytes?.fill(0);
    if (closeFailure !== null) throw closeFailure;
  }
}

async function snapshotScope(
  specifications: readonly Readonly<ScopeSpecification>[],
  effectiveUserId: number,
): Promise<readonly Readonly<FileFingerprint>[]> {
  const snapshots: FileFingerprint[] = [];
  for (const specification of specifications) {
    const stable = await readStableRegularFile(specification, effectiveUserId);
    try {
      snapshots.push(stable.fingerprint);
    } finally {
      stable.bytes.fill(0);
    }
  }
  return Object.freeze(snapshots);
}

function controlSpecifications(
  homeDirectory: string,
): readonly Readonly<ScopeSpecification>[] {
  return Object.freeze([
    Object.freeze({
      label: "control.connector-registry",
      path: path.join(
        homeDirectory,
        ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_ROOT_COMPONENTS,
        FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_REGISTRY_FILENAME,
      ),
      maximumBytes: CONTROL_MAX_BYTES,
    }),
    Object.freeze({
      label: "control.approved-key-enrollment",
      path: path.join(
        homeDirectory,
        ...APPROVED_KEY_ENROLLMENT_ROOT_COMPONENTS,
        APPROVED_KEY_ENROLLMENT_FILENAME,
      ),
      maximumBytes: CONTROL_MAX_BYTES,
    }),
  ]);
}

function assetSpecifications(
  homeDirectory: string,
): readonly Readonly<ScopeSpecification>[] {
  const assetRoot = path.join(
    homeDirectory,
    ...FLOODGATE_STABLE_WASM_DEADLINE_READ_ONLY_ASSET_ROOT_COMPONENTS,
  );
  return Object.freeze([
    Object.freeze({
      label: "runtime.stable-wasm",
      path: path.join(assetRoot, ...STABLE_WASM_RELATIVE_PATH),
      maximumBytes: 35_597,
    }),
    Object.freeze({
      label: "runtime.stable-weights",
      path: path.join(assetRoot, ...STABLE_WEIGHTS_RELATIVE_PATH),
      maximumBytes: 1_185_988,
    }),
  ]);
}

function roleSpecifications(
  outputRoot: string,
): readonly Readonly<ScopeSpecification>[] {
  if (!canonicalAbsolutePath(outputRoot)) {
    throw new Error("role output root is not canonical");
  }
  return Object.freeze(
    ROLE_BUNDLE_FILES.map((filename) =>
      Object.freeze({
        label: `role.${filename}`,
        path: path.join(outputRoot, filename),
        maximumBytes: ROLE_FILE_MAX_BYTES,
      }),
    ),
  );
}

function fingerprintsEqual(
  left: Readonly<FileFingerprint>,
  right: Readonly<FileFingerprint>,
): boolean {
  return (
    left.label === right.label &&
    left.path === right.path &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256 &&
    left.stat === right.stat
  );
}

function comparePersistentState(
  before: readonly Readonly<FileFingerprint>[],
  after: readonly Readonly<FileFingerprint>[],
): Readonly<{
  readonly all_unchanged: true;
  readonly scope_count: 13;
  readonly unchanged_count: 13;
}> {
  if (
    before.length !== FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT ||
    after.length !== FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT
  ) {
    throw new Error("persistent scope count is invalid");
  }
  const beforeByLabel = new Map(
    before.map((fingerprint) => [fingerprint.label, fingerprint]),
  );
  let unchanged = 0;
  for (const current of after) {
    const earlier = beforeByLabel.get(current.label);
    if (earlier !== undefined && fingerprintsEqual(earlier, current)) {
      unchanged += 1;
    }
  }
  if (unchanged !== FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT) {
    throw new Error("persistent scope changed");
  }
  return Object.freeze({
    all_unchanged: true as const,
    scope_count: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT as 13,
    unchanged_count:
      FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT as 13,
  });
}

async function readTrackedWorkers(
  repositoryRoot: string,
  effectiveUserId: number,
): Promise<Readonly<TrackedWorkers>> {
  const calibration = await readStableRegularFile(
    {
      label: "tracked.public-calibration-worker",
      path: path.join(repositoryRoot, "ml", CALIBRATION_WORKER_FILENAME),
      maximumBytes: TRACKED_SOURCE_MAX_BYTES,
    },
    effectiveUserId,
  );
  let diagnostic: Readonly<StableFileRead> | null = null;
  try {
    diagnostic = await readStableRegularFile(
      {
        label: "tracked.private-diagnostic-worker",
        path: path.join(repositoryRoot, "ml", DIAGNOSTIC_WORKER_FILENAME),
        maximumBytes: TRACKED_SOURCE_MAX_BYTES,
      },
      effectiveUserId,
    );
    if (
      calibration.bytes.byteLength !==
        FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY.bytes ||
      createHash("sha256").update(calibration.bytes).digest("hex") !==
        FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY.sha256 ||
      diagnostic.bytes.byteLength !==
        FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY.bytes ||
      createHash("sha256").update(diagnostic.bytes).digest("hex") !==
        FLOODGATE_STABLE_WASM_DIAGNOSTIC_WORKER_IDENTITY.sha256
    ) {
      throw new Error("tracked worker source identity is invalid");
    }
    return Object.freeze({
      calibration: Buffer.from(calibration.bytes),
      diagnostic: Buffer.from(diagnostic.bytes),
    });
  } finally {
    calibration.bytes.fill(0);
    diagnostic?.bytes.fill(0);
  }
}

function trainingRowsToDiagnosticInputs(
  input: Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>,
): readonly Readonly<FloodgateStableWasmDeadlineDiagnosticInput>[] {
  if (!Array.isArray(input.rows) || input.rows.length < 14) {
    throw new Error("authenticated training input has too few rows");
  }
  const selected = input.rows.slice(2, 14);
  if (selected.length !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS) {
    throw new Error("fixed logical row selection is incomplete");
  }
  return Object.freeze(
    selected.map((row) => {
      const { position } = positionFromSfen(row.parent_sfen);
      const board: number[] = [];
      for (let file = 1; file <= 9; file += 1) {
        for (let rank = 1; rank <= 9; rank += 1) {
          board.push(position.ban[(file << 4) + rank] | 0);
        }
      }
      const hands: number[] = [];
      for (let koma = 17; koma <= 39; koma += 1) {
        hands.push(position.hand[koma] | 0);
      }
      return Object.freeze({
        board: Object.freeze(board),
        hands: Object.freeze(hands),
        sideToMove: position.teban as 16 | 32,
        rootTesu: row.ply,
      });
    }),
  );
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeUtilTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error("aggregate record is not an exact plain record");
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as PropertyDescriptorMap;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    throw new Error("aggregate record has unexpected keys");
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new Error("aggregate record contains an accessor");
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

function exactDataArray(
  value: unknown,
  expectedLength: number,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw new Error("aggregate array is not an exact array");
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as PropertyDescriptorMap;
  const length = descriptors.length;
  if (
    length === undefined ||
    !("value" in length) ||
    length.value !== expectedLength ||
    Reflect.ownKeys(descriptors).length !== expectedLength + 1
  ) {
    throw new Error("aggregate array shape is invalid");
  }
  const output: unknown[] = [];
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new Error("aggregate array contains an accessor");
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

function safeCount(value: unknown, maximum = 12): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > maximum
  ) {
    throw new Error("aggregate count is invalid");
  }
  return value as number;
}

function captureCalibration(
  value: unknown,
): Readonly<FloodgateStableWasmDeadlinePublicCalibrationResult> {
  const record = exactDataRecord(value, [
    "callback_overhead_ratio_ppm",
    "exact_parity_count",
  ]);
  const ratio = record.callback_overhead_ratio_ppm;
  if (
    !Number.isSafeInteger(ratio) ||
    (ratio as number) <= 0 ||
    record.exact_parity_count !==
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT
  ) {
    throw new Error("public calibration aggregate is invalid");
  }
  return Object.freeze({
    callback_overhead_ratio_ppm: ratio as number,
    exact_parity_count:
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT,
  });
}

function captureHistogram<TLabel extends string>(
  value: unknown,
  labels: readonly TLabel[],
  labelKey: string,
): readonly Readonly<Record<string, unknown>>[] {
  const entries = exactDataArray(value, labels.length);
  return Object.freeze(
    entries.map((entry, index) => {
      const record = exactDataRecord(entry, ["count", labelKey]);
      if (record[labelKey] !== labels[index]) {
        throw new Error("aggregate histogram label is invalid");
      }
      return Object.freeze({
        [labelKey]: labels[index],
        count: safeCount(record.count),
      });
    }),
  );
}

function captureDiagnostic(
  value: unknown,
): FloodgateStableWasmDeadlineRunBindingSuccess["diagnostic"] {
  const aggregate = exactDataRecord(value, [
    "all_children_reaped",
    "claim_boundary",
    "completed_depth_histogram",
    "configured_maximum_parallel_children",
    "cooperative_deadline_ms",
    "individual_lane_records_returned",
    "leaves_bucket_histogram",
    "nodes_bucket_histogram",
    "observed_peak_parallel_children",
    "outcome_counts",
    "outer_watchdog_ms",
    "partial_iteration_results_adopted",
    "phase_histogram",
    "requests",
    "schema",
    "status",
  ]);
  if (
    aggregate.schema !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA ||
    aggregate.status !== FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS ||
    aggregate.claim_boundary !==
      FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY ||
    aggregate.requests !== FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS ||
    aggregate.configured_maximum_parallel_children !==
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN ||
    aggregate.cooperative_deadline_ms !==
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS ||
    aggregate.outer_watchdog_ms !==
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS ||
    aggregate.all_children_reaped !== true ||
    aggregate.individual_lane_records_returned !== 0 ||
    aggregate.partial_iteration_results_adopted !== 0
  ) {
    throw new Error("private diagnostic aggregate header is invalid");
  }
  const observedPeak = safeCount(
    aggregate.observed_peak_parallel_children,
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_CONCURRENT_CHILDREN,
  );
  const outcomes = exactDataRecord(aggregate.outcome_counts, [
    "complete",
    "deadline",
    "failure",
    "watchdog",
  ]);
  const capturedOutcomes = Object.freeze({
    complete: safeCount(outcomes.complete),
    deadline: safeCount(outcomes.deadline),
    failure: safeCount(outcomes.failure),
    watchdog: safeCount(outcomes.watchdog),
  });
  if (
    Object.values(capturedOutcomes).reduce((sum, count) => sum + count, 0) !==
    FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS
  ) {
    throw new Error("private diagnostic outcome total is invalid");
  }

  const phases = captureHistogram(
    aggregate.phase_histogram,
    DIAGNOSTIC_PHASES,
    "phase",
  ) as FloodgateStableWasmDeadlineRunBindingSuccess["diagnostic"]["phase_histogram"];
  const depthEntries = exactDataArray(aggregate.completed_depth_histogram, 12);
  const depths = Object.freeze(
    depthEntries.map((entry, depth) => {
      const record = exactDataRecord(entry, ["count", "depth"]);
      if (record.depth !== depth) {
        throw new Error("private diagnostic depth label is invalid");
      }
      return Object.freeze({ depth, count: safeCount(record.count) });
    }),
  );
  const nodes = captureHistogram(
    aggregate.nodes_bucket_histogram,
    DIAGNOSTIC_COUNTER_BUCKETS,
    "bucket",
  ) as FloodgateStableWasmDeadlineRunBindingSuccess["diagnostic"]["nodes_bucket_histogram"];
  const leaves = captureHistogram(
    aggregate.leaves_bucket_histogram,
    DIAGNOSTIC_COUNTER_BUCKETS,
    "bucket",
  ) as FloodgateStableWasmDeadlineRunBindingSuccess["diagnostic"]["leaves_bucket_histogram"];

  const completedOrDeadline =
    capturedOutcomes.complete + capturedOutcomes.deadline;
  const sumCounts = (
    entries: readonly Readonly<{ readonly count: number }>[],
  ) => entries.reduce((sum, entry) => sum + entry.count, 0);
  if (
    sumCounts(phases) !== 12 ||
    sumCounts(depths) !== completedOrDeadline ||
    sumCounts(nodes) !== completedOrDeadline ||
    sumCounts(leaves) !== completedOrDeadline
  ) {
    throw new Error("private diagnostic histogram totals are invalid");
  }
  const completePhases = phases[0].count + phases[1].count;
  const deadlinePhases = phases
    .slice(2, 13)
    .reduce((sum, entry) => sum + entry.count, 0);
  if (
    completePhases !== capturedOutcomes.complete ||
    deadlinePhases !== capturedOutcomes.deadline ||
    phases[13].count !== capturedOutcomes.watchdog ||
    phases[14].count !== capturedOutcomes.failure
  ) {
    throw new Error("private diagnostic phase totals are invalid");
  }

  return Object.freeze({
    all_children_reaped: true,
    completed_depth_histogram: depths,
    configured_maximum_parallel_children: 6,
    cooperative_deadline_ms: 600_000,
    individual_lane_records_returned: 0,
    leaves_bucket_histogram: leaves,
    nodes_bucket_histogram: nodes,
    observed_peak_parallel_children: observedPeak,
    outcome_counts: capturedOutcomes,
    outer_watchdog_ms: 615_000,
    partial_iteration_results_adopted: 0,
    phase_histogram: phases,
    requests: 12,
  });
}

/** Isolated adversarial seam for exact aggregate-shape validation. */
export function captureFloodgateStableWasmDeadlineDiagnosticAggregateCoreForTests(
  value: unknown,
): FloodgateStableWasmDeadlineRunBindingSuccess["diagnostic"] {
  if (arguments.length !== 1) {
    throw new Error("diagnostic aggregate capture invocation is invalid");
  }
  return captureDiagnostic(value);
}

function captureSourceBinding<TLayout extends string>(
  value: unknown,
  expectedLayout: TLayout,
): Readonly<{ readonly layout: TLayout; readonly revision: string }> {
  const record = exactDataRecord(value, ["layout", "revision"]);
  if (
    record.layout !== expectedLayout ||
    typeof record.revision !== "string" ||
    !/^[0-9a-f]{40}$/u.test(record.revision)
  ) {
    throw new Error("source binding is invalid");
  }
  return Object.freeze({
    layout: expectedLayout,
    revision: record.revision,
  });
}

function sameSourceBinding(
  left: Readonly<{ readonly layout: string; readonly revision: string }>,
  right: Readonly<{ readonly layout: string; readonly revision: string }>,
): boolean {
  return left.layout === right.layout && left.revision === right.revision;
}

function captureConsumerOptions(
  value: unknown,
): Readonly<FloodgateStableWasmDeadlineReadOnlyConsumerOptions> {
  const record = exactDataRecord(value, [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot",
    "verifierRevision",
  ]);
  for (const key of [
    "legacyProtectedPositionIdsPath",
    "outputRoot",
    "rawLockRoot",
    "repositoryRoot",
    "roleLockRoot",
  ] as const) {
    if (!canonicalAbsolutePath(record[key])) {
      throw new Error("consumer path is invalid");
    }
  }
  if (
    typeof record.verifierRevision !== "string" ||
    !/^[0-9a-f]{40}$/u.test(record.verifierRevision)
  ) {
    throw new Error("consumer verifier revision is invalid");
  }
  return Object.freeze({
    legacyProtectedPositionIdsPath:
      record.legacyProtectedPositionIdsPath as string,
    outputRoot: record.outputRoot as string,
    rawLockRoot: record.rawLockRoot as string,
    repositoryRoot: record.repositoryRoot as string,
    roleLockRoot: record.roleLockRoot as string,
    verifierRevision: record.verifierRevision,
  });
}

function captureRegistryClaim(value: unknown): Readonly<RegistryClaim> {
  const record = exactDataRecord(value, [
    "applicationSourceBinding",
    "consumer",
  ]);
  return Object.freeze({
    applicationSourceBinding: captureSourceBinding(
      record.applicationSourceBinding,
      FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
    ),
    consumer: captureConsumerOptions(record.consumer),
  });
}

function assertFixedContext(
  dependencies: Readonly<FloodgateStableWasmDeadlineRunBindingDependenciesForTests>,
): void {
  if (
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId <= 0 ||
    !canonicalAbsolutePath(dependencies.homeDirectory) ||
    !canonicalAbsolutePath(dependencies.repositoryRoot)
  ) {
    throw new Error("fixed execution context is invalid");
  }
  captureSourceBinding(
    dependencies.expectedDiagnosticSourceBinding,
    FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
  );
}

export async function runFloodgateStableWasmDeadlineRunBindingCoreForTests(
  dependencies: Readonly<FloodgateStableWasmDeadlineRunBindingDependenciesForTests>,
): Promise<Readonly<FloodgateStableWasmDeadlineRunBindingSuccess>> {
  let phase: FloodgateStableWasmDeadlineRunBindingFailurePhase =
    "persistent-before-control";
  try {
    assertFixedContext(dependencies);
    const assertRunning = () => {
      if (dependencies.shouldStop()) {
        phase = "signal";
        throw new Error("run binding interrupted");
      }
    };
    assertRunning();
    const expectedDiagnosticSource = captureSourceBinding(
      dependencies.expectedDiagnosticSourceBinding,
      FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
    );
    const controlScope = controlSpecifications(dependencies.homeDirectory);
    const assetScope = assetSpecifications(dependencies.homeDirectory);

    const controlBefore = await snapshotScope(
      controlScope,
      dependencies.effectiveUserId,
    );
    phase = "registry-load";
    const capability = await dependencies.loadRegistry();

    phase = "worker-source";
    const workers =
      dependencies.readTrackedWorkers === undefined
        ? await readTrackedWorkers(
            dependencies.repositoryRoot,
            dependencies.effectiveUserId,
          )
        : await dependencies.readTrackedWorkers();

    phase = "persistent-before-assets";
    const assetsBefore = await snapshotScope(
      assetScope,
      dependencies.effectiveUserId,
    );

    let roleScope: readonly Readonly<ScopeSpecification>[] | null = null;
    let roleBefore: readonly Readonly<FileFingerprint>[] | null = null;
    let registryApplicationBinding: Readonly<FloodgateStableWasmDeadlineRegistryApplicationSourceBinding> | null =
      null;
    let callbackEntered = false;
    let callbackCompleted = false;
    let authenticatedCallbacks = 0;
    let exactInputClaims = 0;
    let registryClaims = 0;
    let postflightClaims = 0;

    phase = "asset-authority";
    let boundResult: Readonly<{
      calibration: FloodgateStableWasmDeadlinePublicCalibrationResult;
      diagnostic: FloodgateStableWasmDeadlineRunBindingSuccess["diagnostic"];
    }>;
    try {
      boundResult = await dependencies.withAssets(async (runtimeAssets) => {
        if (callbackEntered) throw new Error("asset callback repeated");
        callbackEntered = true;

        phase = "public-calibration";
        const calibration = captureCalibration(
          await dependencies.calibrate({
            wasmBytes: runtimeAssets.bytes.wasm,
            weightsBytes: runtimeAssets.bytes.weights,
            workerSourceBytes: workers.calibration,
          }),
        );
        assertRunning();

        phase = "registry-claim";
        const claim = captureRegistryClaim(
          dependencies.claimRegistry(capability),
        );
        registryClaims += 1;
        registryApplicationBinding = claim.applicationSourceBinding;

        phase = "registry-application-source-before";
        const freshRegistryApplicationSource = captureSourceBinding(
          await dependencies.captureRegistryApplicationSource(),
          FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
        );
        if (
          !sameSourceBinding(
            registryApplicationBinding,
            freshRegistryApplicationSource,
          )
        ) {
          throw new Error("registry application source binding is stale");
        }
        const consumer = claim.consumer;

        phase = "persistent-before-role";
        roleScope = roleSpecifications(consumer.outputRoot);
        roleBefore = await snapshotScope(
          roleScope,
          dependencies.effectiveUserId,
        );
        assertRunning();

        let diagnostic:
          FloodgateStableWasmDeadlineRunBindingSuccess["diagnostic"] | null =
          null;
        phase = "consumer-authentication";
        const postflight = await dependencies.consumeRows(
          consumer,
          (authenticatedInput) => {
            authenticatedCallbacks += 1;
            phase = "consumer-claim";
            dependencies.claimRows(authenticatedInput);
            exactInputClaims += 1;

            phase = "row-selection";
            const diagnosticInputs =
              trainingRowsToDiagnosticInputs(authenticatedInput);

            phase = "private-diagnostic";
            return dependencies
              .diagnose(diagnosticInputs, {
                wasmBytes: runtimeAssets.bytes.wasm,
                weightsBytes: runtimeAssets.bytes.weights,
                workerSourceBytes: workers.diagnostic,
              })
              .then((aggregate) => {
                diagnostic = captureDiagnostic(aggregate);
                assertRunning();
                phase = "consumer-postflight";
              });
          },
        );
        if (
          authenticatedCallbacks !== 1 ||
          exactInputClaims !== 1 ||
          diagnostic === null
        ) {
          throw new Error("authenticated callback lifecycle is invalid");
        }

        phase = "postflight-claim";
        dependencies.claimPostflight(postflight);
        postflightClaims += 1;
        if (registryClaims !== 1 || postflightClaims !== 1) {
          throw new Error("single-use claim lifecycle is invalid");
        }
        callbackCompleted = true;
        return Object.freeze({ calibration, diagnostic });
      });
    } catch (error) {
      if (!callbackEntered) phase = "asset-authority";
      else if (callbackCompleted) phase = "asset-cleanup";
      throw error;
    }

    phase = "persistent-after";
    if (roleScope === null || roleBefore === null) {
      throw new Error("role persistence scope was not captured");
    }
    const [controlAfter, assetsAfter, roleAfter] = await Promise.all([
      snapshotScope(controlScope, dependencies.effectiveUserId),
      snapshotScope(assetScope, dependencies.effectiveUserId),
      snapshotScope(roleScope, dependencies.effectiveUserId),
    ]);
    const persistentState = comparePersistentState(
      [...controlBefore, ...assetsBefore, ...roleBefore],
      [...controlAfter, ...assetsAfter, ...roleAfter],
    );
    assertRunning();

    phase = "registry-application-source-after";
    if (registryApplicationBinding === null) {
      throw new Error("registry application source was not captured");
    }
    const finalRegistryApplicationSource = captureSourceBinding(
      await dependencies.captureRegistryApplicationSource(),
      FLOODGATE_STABLE_WASM_DEADLINE_REGISTRY_APPLICATION_LAYOUT,
    );
    if (
      !sameSourceBinding(
        registryApplicationBinding,
        finalRegistryApplicationSource,
      )
    ) {
      throw new Error("registry application source changed");
    }

    phase = "diagnostic-source-after";
    const finalDiagnosticSource = captureSourceBinding(
      await dependencies.captureDiagnosticSource(),
      FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
    );
    if (!sameSourceBinding(expectedDiagnosticSource, finalDiagnosticSource)) {
      throw new Error("diagnostic source changed");
    }
    assertRunning();

    return Object.freeze({
      calibration: boundResult.calibration,
      claim_boundary: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_CLAIM_BOUNDARY,
      diagnostic: boundResult.diagnostic,
      lifecycle: Object.freeze({
        // Calibration resolves only from its child "close" handler, while the
        // diagnostic aggregate header and histogram totals above prove all 12
        // exact lanes settled and their child processes were reaped.
        all_spawned_children_reaped: true as const,
        authenticated_callbacks: 1 as const,
        calibration_child_reaped: 1 as const,
        diagnostic_lanes_settled:
          FLOODGATE_STABLE_WASM_DIAGNOSTIC_MAX_REQUESTS as 12,
        exact_input_claims: 1 as const,
        postflight_claims: 1 as const,
        registry_claims: 1 as const,
      }),
      nonclaims: Object.freeze({
        live_mutation: false as const,
        playing_strength: false as const,
        teacher_generation: false as const,
        training: false as const,
        tt_retry_or_resume: false as const,
      }),
      persistent_state: persistentState,
      schema: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA,
      source_closure: Object.freeze({
        diagnostic_before_after_exact_clean: true as const,
        registry_application_binding_before_after_exact: true as const,
      }),
      status: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS,
    });
  } catch {
    fail(phase);
  }
}

function productionContext(): Readonly<{
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly repositoryRoot: string;
}> {
  if (
    process.platform !== "darwin" ||
    process.arch !== "arm64" ||
    process.version !==
      FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_REQUIRED_NODE ||
    typeof process.geteuid !== "function"
  ) {
    fail("platform");
  }
  try {
    const effectiveUserId = process.geteuid();
    const user = os.userInfo();
    const repositoryRoot = path.resolve(__dirname, "..");
    if (
      effectiveUserId <= 0 ||
      user.uid !== effectiveUserId ||
      !canonicalAbsolutePath(user.homedir) ||
      !canonicalAbsolutePath(repositoryRoot) ||
      fs.realpathSync(repositoryRoot) !== repositoryRoot ||
      fs.realpathSync(process.cwd()) !== repositoryRoot
    ) {
      fail("platform");
    }
    return Object.freeze({
      effectiveUserId,
      homeDirectory: user.homedir,
      repositoryRoot,
    });
  } catch {
    fail("platform");
  }
}

export function runFloodgateStableWasmDeadlineRunBinding(
  expectedDiagnosticSourceBinding: Readonly<FloodgateStableWasmDeadlineDiagnosticSourceBinding>,
  shouldStop: () => boolean,
): Promise<Readonly<FloodgateStableWasmDeadlineRunBindingSuccess>> {
  if (
    arguments.length !== 2 ||
    typeof shouldStop !== "function" ||
    nodeUtilTypes.isProxy(shouldStop)
  ) {
    return Promise.reject(
      new FloodgateStableWasmDeadlineRunBindingError("invocation"),
    );
  }
  const context = productionContext();
  return runFloodgateStableWasmDeadlineRunBindingCoreForTests({
    ...context,
    expectedDiagnosticSourceBinding,
    shouldStop,
    loadRegistry:
      loadFloodgateStableWasmDeadlineReadOnlyRegistry as () => Promise<object>,
    claimRegistry: (capability) => {
      const claim = claimFloodgateStableWasmDeadlineReadOnlyRegistry(
        capability as FloodgateStableWasmDeadlineReadOnlyRegistryCapability,
      );
      return Object.freeze({
        applicationSourceBinding: claim.applicationSourceBinding,
        consumer: claim.consumer,
      });
    },
    captureDiagnosticSource:
      captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance,
    captureRegistryApplicationSource:
      captureFloodgateStableWasmDeadlineRegistryApplicationSource,
    withAssets: async <TResult>(
      callback: (assets: Readonly<StableRuntimeAssets>) => Promise<TResult>,
    ) => withFloodgateStableWasmDeadlineReadOnlyAssets(callback),
    calibrate: runFloodgateStableWasmDeadlinePublicCalibration,
    consumeRows: (options, callback) =>
      withFloodgateStableWasmDeadlineReadOnlyRows(
        options,
        callback,
        context.effectiveUserId,
      ),
    claimRows: claimFloodgateStableWasmDeadlineReadOnlyRows,
    claimPostflight: (receipt) =>
      claimFloodgateStableWasmDeadlineConsumerPostflight(
        receipt as Readonly<FloodgateStableWasmDeadlineConsumerPostflightCapability>,
      ),
    diagnose: (inputs, assets) =>
      runFloodgateStableWasmDeadlineDiagnosticCoreForTests(inputs, assets),
  });
}

export function floodgateStableWasmDeadlineRunBindingFailure(
  error: unknown,
): Readonly<FloodgateStableWasmDeadlineRunBindingFailure> {
  return Object.freeze({
    phase:
      nodeUtilTypes.isNativeError(error) &&
      error instanceof FloodgateStableWasmDeadlineRunBindingError
        ? error.phase
        : ("internal" as const),
    schema: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA,
    status: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS,
  });
}

export function assertFloodgateStableWasmDeadlineRunBindingInvocation(
  argvLength: number,
): void {
  if (argvLength !== 2) fail("invocation");
}
