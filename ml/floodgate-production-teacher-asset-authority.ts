/**
 * Fixed production authority for the private YaneuraOu, evaluation, and
 * stable-policy assets used by the Floodgate training teacher.
 *
 * This module verifies assets only. It does not execute an engine, read a
 * dataset, create a teacher label, train a model, or establish playing strength.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";
import { markAsUntransferable } from "node:worker_threads";

import { SHOGI_WASM_BASE64 } from "../src/components/game/ShogiImproved/wasm/shogiWasmBase64";

export const FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT =
  "shogi-floodgate-production-teacher-asset-authority-v1" as const;
export const FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS =
  "verified-pinned-private-engine-eval-and-stable-assets" as const;
export const FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY =
  "asset-content-and-private-deployment-authority-not-engine-execution-teacher-label-training-holdout-or-playing-strength-evidence" as const;
export const FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY =
  "trusted-current-euid-private-0700-deployment-v1" as const;

const ENGINE_RECEIPT_SCHEMA = "shogi-teacher-engine-receipt-v1" as const;
const SHA256_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;
const MODE_TYPE_MASK = BigInt(0o170000);
const MODE_DIRECTORY = BigInt(0o040000);
const MODE_REGULAR = BigInt(0o100000);
const MODE_PERMISSION_AND_SPECIAL = BigInt(0o7777);
const DIRECTORY_MODE = BigInt(0o700);
const MAX_ASSET_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 256 * 1024 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;
const ROOT_RELATIVE_COMPONENTS = Object.freeze([
  "Library",
  "Application Support",
  "nextjs-portfolio",
  "shogi-production-teacher-assets-v1",
] as const);
export const FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS =
  ROOT_RELATIVE_COMPONENTS;

export const FLOODGATE_PRODUCTION_TEACHER_RUNTIME = Object.freeze({
  parallel_engines: 12 as const,
  threads_per_engine: 1 as const,
  hash_mb_per_engine: 64 as const,
  timeout_ms_per_search: 600_000 as const,
  proposal: Object.freeze({ multipv: 12 as const, depth: 16 as const }),
  independent_rescore: Object.freeze({
    multipv: 1 as const,
    searchmoves: "exactly-one-candidate" as const,
    depth: 16 as const,
  }),
  stable: Object.freeze({ depth: 11 as const }),
});

export interface FloodgateProductionTeacherExpectedAssetIdentity {
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateProductionTeacherExpectedAssetRegistry {
  readonly engine: Readonly<{
    readonly yaneuraou: FloodgateProductionTeacherExpectedAssetIdentity;
    readonly receipt: FloodgateProductionTeacherExpectedAssetIdentity;
  }>;
  readonly eval: Readonly<{
    readonly nn: FloodgateProductionTeacherExpectedAssetIdentity;
    readonly treeSha256: string;
  }>;
  readonly stable: Readonly<{
    readonly plan: FloodgateProductionTeacherExpectedAssetIdentity;
    readonly wasm: FloodgateProductionTeacherExpectedAssetIdentity;
    readonly weights: FloodgateProductionTeacherExpectedAssetIdentity;
    readonly worker: FloodgateProductionTeacherExpectedAssetIdentity;
  }>;
}

export interface FloodgateProductionTeacherAssetAuthorityDependencies {
  readonly effectiveUserId: number;
  readonly embeddedWasmBase64: string;
  readonly afterAssetReadForTests?: (
    relativePath: string,
  ) => void | Promise<void>;
  readonly beforeFinalRevalidationForTests?: () => void | Promise<void>;
}

export type FloodgateProductionTeacherAssetAuthorityPhase =
  | "capture"
  | "namespace"
  | "asset-read"
  | "receipt"
  | "revalidation"
  | "callback";

export class FloodgateProductionTeacherAssetAuthorityError extends Error {
  readonly phase: FloodgateProductionTeacherAssetAuthorityPhase;
  readonly primary: unknown;

  constructor(
    phase: FloodgateProductionTeacherAssetAuthorityPhase,
    message: string,
    primary: unknown,
  ) {
    super(`Floodgate production teacher asset authority failed: ${message}`, {
      cause: primary,
    });
    this.name = "FloodgateProductionTeacherAssetAuthorityError";
    this.phase = phase;
    this.primary = primary;
  }
}

export interface FloodgateProductionTeacherAssetEvidence {
  readonly relative_path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly mode: "0600" | "0700";
  readonly identity: Readonly<{ readonly dev: string; readonly ino: string }>;
}

export type FloodgateProductionTeacherAssetAuthorityExecutionBoundary =
  | "production-fixed-registry-and-deployment-root"
  | "test-only-injected-expected-registry-and-root";

export interface FloodgateProductionTeacherAssetAuthorityReceipt<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary =
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT;
  readonly status: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS;
  readonly claim_boundary: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY;
  readonly execution_boundary: TExecutionBoundary;
  readonly deployment: Readonly<{
    readonly layout: "fixed-per-user-application-support-v1";
    readonly owner_uid: number;
    readonly exact_tree: true;
    readonly private_directories: true;
  }>;
  readonly assets: Readonly<{
    readonly engine: Readonly<{
      readonly yaneuraou: Readonly<FloodgateProductionTeacherAssetEvidence>;
      readonly receipt: Readonly<FloodgateProductionTeacherAssetEvidence>;
    }>;
    readonly eval: Readonly<{
      readonly nn: Readonly<FloodgateProductionTeacherAssetEvidence>;
      readonly tree_sha256: string;
    }>;
    readonly stable: Readonly<{
      readonly plan: Readonly<FloodgateProductionTeacherAssetEvidence>;
      readonly wasm: Readonly<FloodgateProductionTeacherAssetEvidence>;
      readonly weights: Readonly<FloodgateProductionTeacherAssetEvidence>;
      readonly worker: Readonly<FloodgateProductionTeacherAssetEvidence>;
    }>;
  }>;
  readonly engine: Readonly<{
    readonly receipt_schema: typeof ENGINE_RECEIPT_SCHEMA;
    readonly source_repository: string;
    readonly source_commit: string;
    readonly source_commit_date: string;
    readonly engine_id: string;
    readonly binary_cross_bound: true;
  }>;
  readonly runtime: typeof FLOODGATE_PRODUCTION_TEACHER_RUNTIME;
  readonly postverification: Readonly<{
    readonly embedded_wasm_exactly_equal: true;
    readonly exact_entries_revalidated: true;
    readonly identities_revalidated: true;
    readonly contents_stably_read: true;
  }>;
}

/**
 * Ephemeral, authority-owned stable-runtime byte copies. The containing plain
 * records are frozen; the byte leaves deliberately remain mutable so they can
 * be consumed by a worker initializer and then zero-filled by this authority.
 */
export interface FloodgateProductionStableRuntimeAssetBytes {
  readonly wasm: Uint8Array;
  readonly weights: Uint8Array;
  readonly worker: Uint8Array;
}

export interface FloodgateProductionStableRuntimeAssets<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary =
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
> {
  readonly receipt: Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>
  >;
  readonly bytes: Readonly<FloodgateProductionStableRuntimeAssetBytes>;
}

export type FloodgateProductionStableRuntimeAssetsCallback<
  TResult,
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary =
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
> = (
  assets: Readonly<FloodgateProductionStableRuntimeAssets<TExecutionBoundary>>,
) => Promise<TResult>;

interface CapturedDependencies {
  readonly effectiveUserId: number;
  readonly embeddedWasmBytes: Buffer;
  readonly afterAssetRead?: FloodgateProductionTeacherAssetAuthorityDependencies["afterAssetReadForTests"];
  readonly beforeFinalRevalidation?: FloodgateProductionTeacherAssetAuthorityDependencies["beforeFinalRevalidationForTests"];
}

interface StatSnapshot {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly gid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

interface DirectorySnapshot {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly stat: Readonly<StatSnapshot>;
}

interface AssetSpecification {
  readonly key:
    | "engine.yaneuraou"
    | "engine.receipt"
    | "eval.nn"
    | "stable.plan"
    | "stable.wasm"
    | "stable.weights"
    | "stable.worker";
  readonly relativePath: string;
  readonly expected: Readonly<FloodgateProductionTeacherExpectedAssetIdentity>;
  readonly mode: 0o600 | 0o700;
  readonly retainBytes: boolean;
}

interface ReadAsset {
  readonly specification: AssetSpecification;
  readonly evidence: Readonly<FloodgateProductionTeacherAssetEvidence>;
  readonly stat: Readonly<StatSnapshot>;
  readonly bytes?: Buffer;
}

interface ParsedEngineReceipt {
  readonly schema: typeof ENGINE_RECEIPT_SCHEMA;
  readonly source_repository: string;
  readonly source_commit: string;
  readonly source_commit_date: string;
  readonly engine_id: string;
  readonly binary_bytes: number;
  readonly binary_sha256: string;
}

export const FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY: FloodgateProductionTeacherExpectedAssetRegistry =
  Object.freeze({
    engine: Object.freeze({
      yaneuraou: Object.freeze({
        bytes: 700_048,
        sha256:
          "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
      }),
      receipt: Object.freeze({
        bytes: 654,
        sha256:
          "a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e",
      }),
    }),
    eval: Object.freeze({
      nn: Object.freeze({
        bytes: 64_217_066,
        sha256:
          "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782",
      }),
      treeSha256:
        "639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568",
    }),
    stable: Object.freeze({
      plan: Object.freeze({
        bytes: 10_890,
        sha256:
          "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af",
      }),
      wasm: Object.freeze({
        bytes: 35_597,
        sha256:
          "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
      }),
      weights: Object.freeze({
        bytes: 1_185_988,
        sha256:
          "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
      }),
      worker: Object.freeze({
        bytes: 19_216,
        sha256:
          "d21e347268fa0830882a7f8fb40893aeeed0425f8d92519b26a13444efc467e3",
      }),
    }),
  });

function fail(message: string): never {
  throw new Error(message);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    output[key] = (value as Record<string, unknown>)[key];
  }
  return Object.freeze(output) as Readonly<T>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) fail(`${label} must be a plain non-Proxy object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail(`${label} must not contain symbol keys`);
  }
  const actual = keys as string[];
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    requiredKeys.some((key) => !actual.includes(key)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    fail(`${label} keys are not exact`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable own data property`);
    }
    output[key] = descriptor.value;
  }
  return Object.freeze(output);
}

function captureIdentity(
  value: unknown,
  label: string,
): Readonly<FloodgateProductionTeacherExpectedAssetIdentity> {
  const source = exactRecord(value, ["bytes", "sha256"], [], label);
  if (
    !Number.isSafeInteger(source.bytes) ||
    (source.bytes as number) <= 0 ||
    (source.bytes as number) > MAX_ASSET_BYTES
  ) {
    fail(`${label}.bytes must be a positive bounded safe integer`);
  }
  if (typeof source.sha256 !== "string" || !SHA256_RE.test(source.sha256)) {
    fail(`${label}.sha256 must be a lowercase SHA-256`);
  }
  return frozenRecord({
    bytes: source.bytes as number,
    sha256: source.sha256,
  });
}

function captureRegistry(
  value: FloodgateProductionTeacherExpectedAssetRegistry,
): Readonly<FloodgateProductionTeacherExpectedAssetRegistry> {
  const registry = exactRecord(
    value,
    ["engine", "eval", "stable"],
    [],
    "expected registry",
  );
  const engine = exactRecord(
    registry.engine,
    ["receipt", "yaneuraou"],
    [],
    "expected registry.engine",
  );
  const evaluation = exactRecord(
    registry.eval,
    ["nn", "treeSha256"],
    [],
    "expected registry.eval",
  );
  const stable = exactRecord(
    registry.stable,
    ["plan", "wasm", "weights", "worker"],
    [],
    "expected registry.stable",
  );
  const captured = frozenRecord({
    engine: frozenRecord({
      yaneuraou: captureIdentity(
        engine.yaneuraou,
        "expected registry.engine.yaneuraou",
      ),
      receipt: captureIdentity(
        engine.receipt,
        "expected registry.engine.receipt",
      ),
    }),
    eval: frozenRecord({
      nn: captureIdentity(evaluation.nn, "expected registry.eval.nn"),
      treeSha256:
        typeof evaluation.treeSha256 === "string" &&
        SHA256_RE.test(evaluation.treeSha256)
          ? evaluation.treeSha256
          : fail(
              "expected registry.eval.treeSha256 must be a lowercase SHA-256",
            ),
    }),
    stable: frozenRecord({
      plan: captureIdentity(stable.plan, "expected registry.stable.plan"),
      wasm: captureIdentity(stable.wasm, "expected registry.stable.wasm"),
      weights: captureIdentity(
        stable.weights,
        "expected registry.stable.weights",
      ),
      worker: captureIdentity(stable.worker, "expected registry.stable.worker"),
    }),
  });
  const total = [
    captured.engine.yaneuraou,
    captured.engine.receipt,
    captured.eval.nn,
    captured.stable.plan,
    captured.stable.wasm,
    captured.stable.weights,
    captured.stable.worker,
  ].reduce((sum, entry) => sum + entry.bytes, 0);
  if (!Number.isSafeInteger(total) || total > MAX_TOTAL_ASSET_BYTES) {
    fail("expected registry total asset bytes exceed the safety bound");
  }
  const expectedEvalTree = createHash("sha256")
    .update(
      `eval-tree-v1\0${JSON.stringify({
        bytes: captured.eval.nn.bytes,
        path: "nn.bin",
        sha256: captured.eval.nn.sha256,
      })}`,
    )
    .digest("hex");
  if (captured.eval.treeSha256 !== expectedEvalTree) {
    fail("expected registry eval tree SHA-256 does not bind eval/nn.bin");
  }
  return captured;
}

function canonicalRoot(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    CONTROL_CHARACTER_RE.test(value) ||
    path.resolve(value) !== value ||
    path.parse(value).root === value
  ) {
    fail("asset root must be a canonical non-root absolute path");
  }
  return value;
}

function nonProxyFunction(
  value: unknown,
  label: string,
): (...args: never[]) => unknown {
  if (typeof value !== "function" || nodeUtilTypes.isProxy(value)) {
    fail(`${label} must be a non-Proxy function`);
  }
  return value as (...args: never[]) => unknown;
}

function decodeCanonicalBase64(value: unknown, expectedBytes: number): Buffer {
  const expectedTextLength = Math.ceil(expectedBytes / 3) * 4;
  if (
    typeof value !== "string" ||
    value.length !== expectedTextLength ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    fail("embeddedWasmBase64 must be canonical RFC 4648 base64");
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength !== expectedBytes ||
    decoded.toString("base64") !== value
  ) {
    decoded.fill(0);
    fail("embeddedWasmBase64 does not have the exact expected identity size");
  }
  return decoded;
}

function captureDependencies(
  value: FloodgateProductionTeacherAssetAuthorityDependencies,
  expectedEmbeddedWasmBytes: number,
): Readonly<CapturedDependencies> {
  const source = exactRecord(
    value,
    ["effectiveUserId", "embeddedWasmBase64"],
    ["afterAssetReadForTests", "beforeFinalRevalidationForTests"],
    "asset authority dependencies",
  );
  if (
    !Number.isSafeInteger(source.effectiveUserId) ||
    (source.effectiveUserId as number) < 0
  ) {
    fail("effectiveUserId must be a nonnegative safe integer");
  }
  const afterAssetRead = source.afterAssetReadForTests;
  const beforeFinalRevalidation = source.beforeFinalRevalidationForTests;
  const capturedAfterAssetRead =
    afterAssetRead === undefined
      ? undefined
      : (nonProxyFunction(
          afterAssetRead,
          "afterAssetReadForTests",
        ) as FloodgateProductionTeacherAssetAuthorityDependencies["afterAssetReadForTests"]);
  const capturedBeforeFinalRevalidation =
    beforeFinalRevalidation === undefined
      ? undefined
      : (nonProxyFunction(
          beforeFinalRevalidation,
          "beforeFinalRevalidationForTests",
        ) as FloodgateProductionTeacherAssetAuthorityDependencies["beforeFinalRevalidationForTests"]);
  const embeddedWasmBytes = decodeCanonicalBase64(
    source.embeddedWasmBase64,
    expectedEmbeddedWasmBytes,
  );
  return frozenRecord({
    effectiveUserId: source.effectiveUserId as number,
    embeddedWasmBytes,
    ...(capturedAfterAssetRead === undefined
      ? {}
      : {
          afterAssetRead: capturedAfterAssetRead,
        }),
    ...(capturedBeforeFinalRevalidation === undefined
      ? {}
      : {
          beforeFinalRevalidation: capturedBeforeFinalRevalidation,
        }),
  });
}

function statSnapshot(stat: fs.BigIntStats): Readonly<StatSnapshot> {
  return frozenRecord({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function sameStat(
  left: Readonly<StatSnapshot>,
  right: Readonly<StatSnapshot>,
): boolean {
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

async function lstatSnapshot(target: string): Promise<Readonly<StatSnapshot>> {
  return statSnapshot(await fs.promises.lstat(target, { bigint: true }));
}

function assertDirectoryStat(
  stat: Readonly<StatSnapshot>,
  effectiveUserId: number,
  label: string,
): void {
  if (
    (stat.mode & MODE_TYPE_MASK) !== MODE_DIRECTORY ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_PERMISSION_AND_SPECIAL) !== DIRECTORY_MODE
  ) {
    fail(`${label} must be a current-euid-owned exact 0700 real directory`);
  }
}

function assertFileStat(
  stat: Readonly<StatSnapshot>,
  effectiveUserId: number,
  expected: Readonly<FloodgateProductionTeacherExpectedAssetIdentity>,
  mode: 0o600 | 0o700,
  label: string,
): void {
  if (
    (stat.mode & MODE_TYPE_MASK) !== MODE_REGULAR ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_PERMISSION_AND_SPECIAL) !== BigInt(mode) ||
    stat.nlink !== BigInt(1) ||
    stat.size !== BigInt(expected.bytes)
  ) {
    fail(
      `${label} must be a current-euid-owned, single-link, exact-mode regular file with the pinned size`,
    );
  }
}

function assertFileNamespaceStat(
  stat: Readonly<StatSnapshot>,
  effectiveUserId: number,
  mode: 0o600 | 0o700,
  label: string,
): void {
  if (
    (stat.mode & MODE_TYPE_MASK) !== MODE_REGULAR ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_PERMISSION_AND_SPECIAL) !== BigInt(mode) ||
    stat.nlink !== BigInt(1)
  ) {
    fail(
      `${label} must be a current-euid-owned, single-link, exact-mode real regular file`,
    );
  }
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

async function assertExactEntries(
  directory: string,
  expected: readonly string[],
  label: string,
): Promise<void> {
  const actual = (await fs.promises.readdir(directory)).sort(compareUtf8);
  const sortedExpected = [...expected].sort(compareUtf8);
  if (
    actual.length !== sortedExpected.length ||
    actual.some((entry, index) => entry !== sortedExpected[index])
  ) {
    fail(`${label} entries are not exact`);
  }
}

async function inspectDirectory(
  absolutePath: string,
  relativePath: string,
  effectiveUserId: number,
): Promise<Readonly<DirectorySnapshot>> {
  const resolved = await fs.promises.realpath(absolutePath);
  if (resolved !== absolutePath) {
    fail(`${relativePath || "root"} must be its canonical real path`);
  }
  const stat = await lstatSnapshot(absolutePath);
  assertDirectoryStat(stat, effectiveUserId, relativePath || "root");
  return frozenRecord({ absolutePath, relativePath, stat });
}

function assetSpecifications(
  registry: Readonly<FloodgateProductionTeacherExpectedAssetRegistry>,
  retainStableRuntimeBytes: boolean,
): readonly AssetSpecification[] {
  return Object.freeze([
    frozenRecord({
      key: "engine.yaneuraou" as const,
      relativePath: "engine/yaneuraou",
      expected: registry.engine.yaneuraou,
      mode: 0o700 as const,
      retainBytes: false,
    }),
    frozenRecord({
      key: "engine.receipt" as const,
      relativePath: "engine/yaneuraou-receipt.json",
      expected: registry.engine.receipt,
      mode: 0o600 as const,
      retainBytes: true,
    }),
    frozenRecord({
      key: "eval.nn" as const,
      relativePath: "eval/nn.bin",
      expected: registry.eval.nn,
      mode: 0o600 as const,
      retainBytes: false,
    }),
    frozenRecord({
      key: "stable.plan" as const,
      relativePath: "stable/floodgate-plan.json",
      expected: registry.stable.plan,
      mode: 0o600 as const,
      retainBytes: false,
    }),
    frozenRecord({
      key: "stable.wasm" as const,
      relativePath: "stable/shogi.wasm",
      expected: registry.stable.wasm,
      mode: 0o600 as const,
      retainBytes: true,
    }),
    frozenRecord({
      key: "stable.weights" as const,
      relativePath: "stable/shogi-nnue-weights.bin",
      expected: registry.stable.weights,
      mode: 0o600 as const,
      retainBytes: retainStableRuntimeBytes,
    }),
    frozenRecord({
      key: "stable.worker" as const,
      relativePath: "stable/floodgate-stable-wasm-worker.mjs",
      expected: registry.stable.worker,
      mode: 0o600 as const,
      retainBytes: retainStableRuntimeBytes,
    }),
  ]);
}

async function readAsset(
  root: string,
  specification: Readonly<AssetSpecification>,
  effectiveUserId: number,
): Promise<Readonly<ReadAsset>> {
  const absolutePath = path.join(
    root,
    ...specification.relativePath.split("/"),
  );
  const resolved = await fs.promises.realpath(absolutePath);
  if (resolved !== absolutePath) {
    fail(`${specification.relativePath} must be its canonical real path`);
  }
  const pathBefore = await lstatSnapshot(absolutePath);
  assertFileStat(
    pathBefore,
    effectiveUserId,
    specification.expected,
    specification.mode,
    specification.relativePath,
  );
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") fail("O_NOFOLLOW is required");
  const hash = createHash("sha256");
  const retained = specification.retainBytes
    ? Buffer.alloc(specification.expected.bytes)
    : undefined;
  const scratch = Buffer.alloc(
    Math.min(READ_CHUNK_BYTES, specification.expected.bytes),
  );
  const extra = Buffer.alloc(1);
  const handle = await fs.promises.open(
    absolutePath,
    fs.constants.O_RDONLY | noFollow,
  );
  let handleBefore: Readonly<StatSnapshot>;
  let handleAfter: Readonly<StatSnapshot>;
  let closed = false;
  let delivered = false;
  let bodyFailed = false;
  try {
    handleBefore = statSnapshot(await handle.stat({ bigint: true }));
    assertFileStat(
      handleBefore,
      effectiveUserId,
      specification.expected,
      specification.mode,
      specification.relativePath,
    );
    if (!sameStat(pathBefore, handleBefore)) {
      fail(`${specification.relativePath} changed before held read`);
    }
    let offset = 0;
    while (offset < specification.expected.bytes) {
      const length = Math.min(
        scratch.byteLength,
        specification.expected.bytes - offset,
      );
      const result = await handle.read(scratch, 0, length, offset);
      if (result.bytesRead !== length) {
        fail(`${specification.relativePath} produced a short held read`);
      }
      const chunk = scratch.subarray(0, result.bytesRead);
      hash.update(chunk);
      retained?.set(chunk, offset);
      offset += result.bytesRead;
    }
    if (
      (await handle.read(extra, 0, 1, specification.expected.bytes))
        .bytesRead !== 0
    ) {
      fail(`${specification.relativePath} exceeds its pinned byte length`);
    }
    handleAfter = statSnapshot(await handle.stat({ bigint: true }));
    if (!sameStat(handleBefore, handleAfter)) {
      fail(`${specification.relativePath} changed during held read`);
    }
    await handle.close();
    closed = true;
    const pathAfter = await lstatSnapshot(absolutePath);
    if (!sameStat(pathBefore, pathAfter)) {
      fail(`${specification.relativePath} pathname changed during held read`);
    }
    const digest = hash.digest("hex");
    if (digest !== specification.expected.sha256) {
      fail(
        `${specification.relativePath} SHA-256 differs from the pinned identity`,
      );
    }
    const result = frozenRecord({
      specification,
      evidence: frozenRecord({
        relative_path: specification.relativePath,
        bytes: specification.expected.bytes,
        sha256: digest,
        mode:
          specification.mode === 0o700 ? ("0700" as const) : ("0600" as const),
        identity: frozenRecord({
          dev: pathAfter.dev.toString(10),
          ino: pathAfter.ino.toString(10),
        }),
      }),
      stat: pathAfter,
      ...(retained === undefined ? {} : { bytes: retained }),
    });
    delivered = true;
    return result;
  } catch (primary) {
    bodyFailed = true;
    throw primary;
  } finally {
    scratch.fill(0);
    extra.fill(0);
    if (!delivered) retained?.fill(0);
    if (!closed) {
      try {
        await handle.close();
      } catch (closeFailure) {
        if (!bodyFailed) throw closeFailure;
      }
    }
  }
}

function requiredReceiptText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    CONTROL_CHARACTER_RE.test(value)
  ) {
    fail(`engine receipt ${label} must be canonical nonempty text`);
  }
  return value;
}

function parseEngineReceipt(bytes: Buffer): Readonly<ParsedEngineReceipt> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("engine receipt is not fatal-valid UTF-8");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return fail("engine receipt is not valid JSON");
  }
  const receipt = exactRecord(
    value,
    [
      "binary_bytes",
      "binary_sha256",
      "build_command",
      "build_directory",
      "compiler",
      "compiler_target",
      "engine_id",
      "schema",
      "source_commit",
      "source_commit_date",
      "source_repository",
    ],
    [],
    "engine receipt",
  );
  if (receipt.schema !== ENGINE_RECEIPT_SCHEMA) {
    fail(`engine receipt schema must be ${ENGINE_RECEIPT_SCHEMA}`);
  }
  const repository = requiredReceiptText(
    receipt.source_repository,
    "source_repository",
  );
  try {
    const parsed = new URL(repository);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      fail(
        "engine receipt source_repository must be an absolute credential-free HTTPS URL",
      );
    }
  } catch {
    fail(
      "engine receipt source_repository must be an absolute credential-free HTTPS URL",
    );
  }
  const sourceCommit = requiredReceiptText(
    receipt.source_commit,
    "source_commit",
  );
  if (!COMMIT_RE.test(sourceCommit))
    fail("engine receipt source_commit is invalid");
  const sourceCommitDate = requiredReceiptText(
    receipt.source_commit_date,
    "source_commit_date",
  );
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      sourceCommitDate,
    ) ||
    !Number.isFinite(Date.parse(sourceCommitDate))
  ) {
    fail("engine receipt source_commit_date is invalid");
  }
  for (const key of [
    "build_command",
    "build_directory",
    "compiler",
    "compiler_target",
  ]) {
    requiredReceiptText(receipt[key], key);
  }
  const engineId = requiredReceiptText(receipt.engine_id, "engine_id");
  if (
    !Number.isSafeInteger(receipt.binary_bytes) ||
    (receipt.binary_bytes as number) <= 0
  ) {
    fail("engine receipt binary_bytes must be a positive safe integer");
  }
  if (
    typeof receipt.binary_sha256 !== "string" ||
    !SHA256_RE.test(receipt.binary_sha256)
  ) {
    fail("engine receipt binary_sha256 must be a lowercase SHA-256");
  }
  return frozenRecord({
    schema: ENGINE_RECEIPT_SCHEMA,
    source_repository: repository,
    source_commit: sourceCommit,
    source_commit_date: sourceCommitDate,
    engine_id: engineId,
    binary_bytes: receipt.binary_bytes as number,
    binary_sha256: receipt.binary_sha256,
  });
}

function readAssetByKey(
  assets: readonly Readonly<ReadAsset>[],
  key: AssetSpecification["key"],
): Readonly<ReadAsset> {
  const result = assets.find((asset) => asset.specification.key === key);
  if (result === undefined) fail(`verified asset ${key} is unavailable`);
  return result;
}

async function revalidate(
  root: string,
  directories: readonly Readonly<DirectorySnapshot>[],
  assets: readonly Readonly<ReadAsset>[],
  effectiveUserId: number,
): Promise<void> {
  await assertExactEntries(root, ["engine", "eval", "stable"], "root");
  await assertExactEntries(
    path.join(root, "engine"),
    ["yaneuraou", "yaneuraou-receipt.json"],
    "engine",
  );
  await assertExactEntries(path.join(root, "eval"), ["nn.bin"], "eval");
  await assertExactEntries(
    path.join(root, "stable"),
    [
      "floodgate-plan.json",
      "floodgate-stable-wasm-worker.mjs",
      "shogi-nnue-weights.bin",
      "shogi.wasm",
    ],
    "stable",
  );
  for (const directory of directories) {
    const current = await inspectDirectory(
      directory.absolutePath,
      directory.relativePath,
      effectiveUserId,
    );
    if (!sameStat(directory.stat, current.stat)) {
      fail(`${directory.relativePath || "root"} changed during verification`);
    }
  }
  for (const asset of assets) {
    const current = await lstatSnapshot(
      path.join(root, ...asset.specification.relativePath.split("/")),
    );
    assertFileStat(
      current,
      effectiveUserId,
      asset.specification.expected,
      asset.specification.mode,
      asset.specification.relativePath,
    );
    if (!sameStat(asset.stat, current)) {
      fail(`${asset.specification.relativePath} changed after stable read`);
    }
  }
}

function failureDetail(value: unknown): string {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    try {
      return String(value);
    } catch {
      return "unprintable failure";
    }
  }
  if (nodeUtilTypes.isProxy(value)) return "uninspectable Proxy failure";
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "message");
    if (
      descriptor !== undefined &&
      "value" in descriptor &&
      typeof descriptor.value === "string"
    ) {
      return descriptor.value;
    }
  } catch {
    return "uninspectable failure";
  }
  return "non-message failure";
}

const INTRINSIC_OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const INTRINSIC_REFLECT_APPLY = Reflect.apply;
const INTRINSIC_REFLECT_OWN_KEYS = Reflect.ownKeys;
const NATIVE_PROMISE_PROTOTYPE = Promise.prototype;
const UINT8_ARRAY_CONSTRUCTOR = Uint8Array;
const ARRAY_BUFFER_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;
const TYPED_ARRAY_PROTOTYPE = INTRINSIC_OBJECT_GET_PROTOTYPE_OF(
  Uint8Array.prototype,
);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "buffer",
)?.get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
)?.get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteOffset",
)?.get;
const TYPED_ARRAY_FILL = Uint8Array.prototype.fill;
const TYPED_ARRAY_SET = Uint8Array.prototype.set;

function typedArrayBuffer(value: Uint8Array): ArrayBufferLike {
  if (TYPED_ARRAY_BUFFER_GETTER === undefined) {
    return fail("the Uint8Array buffer intrinsic is unavailable");
  }
  return INTRINSIC_REFLECT_APPLY(
    TYPED_ARRAY_BUFFER_GETTER,
    value,
    [],
  ) as ArrayBufferLike;
}

function typedArrayByteLength(value: Uint8Array): number {
  if (TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined) {
    return fail("the Uint8Array byteLength intrinsic is unavailable");
  }
  return INTRINSIC_REFLECT_APPLY(
    TYPED_ARRAY_BYTE_LENGTH_GETTER,
    value,
    [],
  ) as number;
}

function typedArrayByteOffset(value: Uint8Array): number {
  if (TYPED_ARRAY_BYTE_OFFSET_GETTER === undefined) {
    return fail("the Uint8Array byteOffset intrinsic is unavailable");
  }
  return INTRINSIC_REFLECT_APPLY(
    TYPED_ARRAY_BYTE_OFFSET_GETTER,
    value,
    [],
  ) as number;
}

function ownedArrayBufferByteLength(value: ArrayBufferLike): number {
  if (ARRAY_BUFFER_BYTE_LENGTH_GETTER === undefined) {
    return fail("the ArrayBuffer byteLength intrinsic is unavailable");
  }
  return INTRINSIC_REFLECT_APPLY(
    ARRAY_BUFFER_BYTE_LENGTH_GETTER,
    value,
    [],
  ) as number;
}

function exactNativePromise(value: unknown): value is Promise<unknown> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    nodeUtilTypes.isProxy(value) ||
    !nodeUtilTypes.isPromise(value)
  ) {
    return false;
  }
  try {
    return (
      INTRINSIC_OBJECT_GET_PROTOTYPE_OF(value) === NATIVE_PROMISE_PROTOTYPE &&
      INTRINSIC_REFLECT_OWN_KEYS(value).length === 0
    );
  } catch {
    return false;
  }
}

function ownedStableRuntimeByteCopy(
  source: Buffer,
  expected: Readonly<FloodgateProductionTeacherExpectedAssetIdentity>,
  label: string,
): Uint8Array {
  if (
    source.byteLength !== expected.bytes ||
    createHash("sha256").update(source).digest("hex") !== expected.sha256
  ) {
    fail(`${label} retained bytes lost their pinned identity`);
  }
  const copy = new UINT8_ARRAY_CONSTRUCTOR(expected.bytes);
  INTRINSIC_REFLECT_APPLY(TYPED_ARRAY_SET, copy, [source]);
  markAsUntransferable(typedArrayBuffer(copy));
  return copy;
}

function assertStableRuntimeByteCopy(
  bytes: Uint8Array,
  expected: Readonly<FloodgateProductionTeacherExpectedAssetIdentity>,
  label: string,
): void {
  const backing = typedArrayBuffer(bytes);
  if (
    typedArrayByteLength(bytes) !== expected.bytes ||
    typedArrayByteOffset(bytes) !== 0 ||
    ownedArrayBufferByteLength(backing) !== expected.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== expected.sha256
  ) {
    fail(`${label} callback bytes changed or lost their owned exact identity`);
  }
}

interface TrackedEphemeralBytes {
  readonly bytes: Uint8Array;
  readonly expectedBytes: number;
}

function zeroizeEphemeralBytes(
  retained: readonly Readonly<TrackedEphemeralBytes>[],
  delivered: readonly Readonly<TrackedEphemeralBytes>[],
): unknown | undefined {
  let firstFailure: unknown;
  const zeroizeGroup = (
    tracked: readonly Readonly<TrackedEphemeralBytes>[],
  ): void => {
    for (let entryIndex = 0; entryIndex < tracked.length; entryIndex += 1) {
      const entry = tracked[entryIndex];
      if (entry === undefined) {
        firstFailure ??= new Error(
          "ephemeral runtime asset tracking became sparse",
        );
        continue;
      }
      let length = -1;
      try {
        length = typedArrayByteLength(entry.bytes);
      } catch (failure) {
        firstFailure ??= failure;
      }
      if (length !== entry.expectedBytes) {
        firstFailure ??= new Error(
          "an ephemeral runtime asset byte buffer was detached or resized",
        );
      }
      try {
        INTRINSIC_REFLECT_APPLY(TYPED_ARRAY_FILL, entry.bytes, [0]);
        if (length >= 0) {
          for (let index = 0; index < length; index += 1) {
            if (entry.bytes[index] !== 0) {
              fail(
                "an ephemeral runtime asset byte buffer was not zero-filled",
              );
            }
          }
        }
      } catch (failure) {
        firstFailure ??= failure;
      }
    }
  };
  zeroizeGroup(retained);
  zeroizeGroup(delivered);
  return firstFailure;
}

async function verifyPinnedFloodgateProductionTeacherAssetsInternal<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
>(
  expectedRegistryValue: FloodgateProductionTeacherExpectedAssetRegistry,
  rootValue: string,
  dependenciesValue: FloodgateProductionTeacherAssetAuthorityDependencies,
  executionBoundary: TExecutionBoundary,
  callbackValue: null,
): Promise<
  Readonly<FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>>
>;
async function verifyPinnedFloodgateProductionTeacherAssetsInternal<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
  TResult,
>(
  expectedRegistryValue: FloodgateProductionTeacherExpectedAssetRegistry,
  rootValue: string,
  dependenciesValue: FloodgateProductionTeacherAssetAuthorityDependencies,
  executionBoundary: TExecutionBoundary,
  callbackValue: FloodgateProductionStableRuntimeAssetsCallback<
    TResult,
    TExecutionBoundary
  >,
): Promise<TResult>;
async function verifyPinnedFloodgateProductionTeacherAssetsInternal(
  expectedRegistryValue: FloodgateProductionTeacherExpectedAssetRegistry,
  rootValue: string,
  dependenciesValue: FloodgateProductionTeacherAssetAuthorityDependencies,
  executionBoundary: FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
  callbackValue: FloodgateProductionStableRuntimeAssetsCallback<
    unknown,
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary
  > | null,
): Promise<unknown> {
  let registry: Readonly<FloodgateProductionTeacherExpectedAssetRegistry>;
  let root: string;
  let dependencies: Readonly<CapturedDependencies>;
  let callback: FloodgateProductionStableRuntimeAssetsCallback<
    unknown,
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary
  > | null;
  try {
    callback =
      callbackValue === null
        ? null
        : (nonProxyFunction(
            callbackValue,
            "stable runtime assets callback",
          ) as FloodgateProductionStableRuntimeAssetsCallback<
            unknown,
            FloodgateProductionTeacherAssetAuthorityExecutionBoundary
          >);
    registry = captureRegistry(expectedRegistryValue);
    root = canonicalRoot(rootValue);
    dependencies = captureDependencies(
      dependenciesValue,
      registry.stable.wasm.bytes,
    );
  } catch (primary) {
    throw new FloodgateProductionTeacherAssetAuthorityError(
      "capture",
      failureDetail(primary),
      primary,
    );
  }

  let phase: FloodgateProductionTeacherAssetAuthorityPhase = "namespace";
  const retainedBuffers: Buffer[] = [dependencies.embeddedWasmBytes];
  const retainedEphemeralBuffers: TrackedEphemeralBytes[] = [
    {
      bytes: dependencies.embeddedWasmBytes,
      expectedBytes: registry.stable.wasm.bytes,
    },
  ];
  const ephemeralBuffers: TrackedEphemeralBytes[] = [];
  let wrappedPrimary: FloodgateProductionTeacherAssetAuthorityError | undefined;
  try {
    const directories = Object.freeze([
      await inspectDirectory(root, "", dependencies.effectiveUserId),
      await inspectDirectory(
        path.join(root, "engine"),
        "engine",
        dependencies.effectiveUserId,
      ),
      await inspectDirectory(
        path.join(root, "eval"),
        "eval",
        dependencies.effectiveUserId,
      ),
      await inspectDirectory(
        path.join(root, "stable"),
        "stable",
        dependencies.effectiveUserId,
      ),
    ]);
    await assertExactEntries(root, ["engine", "eval", "stable"], "root");
    await assertExactEntries(
      path.join(root, "engine"),
      ["yaneuraou", "yaneuraou-receipt.json"],
      "engine",
    );
    await assertExactEntries(path.join(root, "eval"), ["nn.bin"], "eval");
    await assertExactEntries(
      path.join(root, "stable"),
      [
        "floodgate-plan.json",
        "floodgate-stable-wasm-worker.mjs",
        "shogi-nnue-weights.bin",
        "shogi.wasm",
      ],
      "stable",
    );

    const specifications = assetSpecifications(registry, callback !== null);
    for (const specification of specifications) {
      const assetPath = path.join(
        root,
        ...specification.relativePath.split("/"),
      );
      assertFileNamespaceStat(
        await lstatSnapshot(assetPath),
        dependencies.effectiveUserId,
        specification.mode,
        specification.relativePath,
      );
    }

    phase = "asset-read";
    const assets: Readonly<ReadAsset>[] = [];
    for (const specification of specifications) {
      const asset = await readAsset(
        root,
        specification,
        dependencies.effectiveUserId,
      );
      assets.push(asset);
      if (asset.bytes !== undefined) {
        retainedBuffers.push(asset.bytes);
        retainedEphemeralBuffers.push({
          bytes: asset.bytes,
          expectedBytes: asset.specification.expected.bytes,
        });
      }
      await dependencies.afterAssetRead?.(specification.relativePath);
    }

    phase = "receipt";
    const binary = readAssetByKey(assets, "engine.yaneuraou");
    const receiptAsset = readAssetByKey(assets, "engine.receipt");
    if (receiptAsset.bytes === undefined)
      fail("engine receipt bytes were not retained");
    const receipt = parseEngineReceipt(receiptAsset.bytes);
    if (
      receipt.binary_bytes !== binary.evidence.bytes ||
      receipt.binary_sha256 !== binary.evidence.sha256
    ) {
      fail("engine receipt binary identity does not match deployed YaneuraOu");
    }
    const wasm = readAssetByKey(assets, "stable.wasm");
    if (wasm.bytes === undefined) fail("deployed WASM bytes were not retained");
    if (!wasm.bytes.equals(dependencies.embeddedWasmBytes)) {
      fail("deployed stable WASM differs from decoded embedded WASM");
    }

    phase = "revalidation";
    await dependencies.beforeFinalRevalidation?.();
    await revalidate(root, directories, assets, dependencies.effectiveUserId);

    const engineBinary = readAssetByKey(assets, "engine.yaneuraou");
    const engineReceipt = readAssetByKey(assets, "engine.receipt");
    const evalNn = readAssetByKey(assets, "eval.nn");
    const stablePlan = readAssetByKey(assets, "stable.plan");
    const stableWasm = readAssetByKey(assets, "stable.wasm");
    const stableWeights = readAssetByKey(assets, "stable.weights");
    const stableWorker = readAssetByKey(assets, "stable.worker");
    const authorityReceipt = frozenRecord({
      contract: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
      status: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
      claim_boundary:
        FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
      trust_boundary:
        FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
      execution_boundary: executionBoundary,
      deployment: frozenRecord({
        layout: "fixed-per-user-application-support-v1" as const,
        owner_uid: dependencies.effectiveUserId,
        exact_tree: true as const,
        private_directories: true as const,
      }),
      assets: frozenRecord({
        engine: frozenRecord({
          yaneuraou: engineBinary.evidence,
          receipt: engineReceipt.evidence,
        }),
        eval: frozenRecord({
          nn: evalNn.evidence,
          tree_sha256: registry.eval.treeSha256,
        }),
        stable: frozenRecord({
          plan: stablePlan.evidence,
          wasm: stableWasm.evidence,
          weights: stableWeights.evidence,
          worker: stableWorker.evidence,
        }),
      }),
      engine: frozenRecord({
        receipt_schema: ENGINE_RECEIPT_SCHEMA,
        source_repository: receipt.source_repository,
        source_commit: receipt.source_commit,
        source_commit_date: receipt.source_commit_date,
        engine_id: receipt.engine_id,
        binary_cross_bound: true as const,
      }),
      runtime: FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
      postverification: frozenRecord({
        embedded_wasm_exactly_equal: true as const,
        exact_entries_revalidated: true as const,
        identities_revalidated: true as const,
        contents_stably_read: true as const,
      }),
    });

    if (callback === null) return authorityReceipt;

    const retainedWasm = stableWasm.bytes;
    const retainedWeights = stableWeights.bytes;
    const retainedWorker = stableWorker.bytes;
    if (
      retainedWasm === undefined ||
      retainedWeights === undefined ||
      retainedWorker === undefined
    ) {
      fail("stable runtime bytes were not retained for the callback");
    }
    const wasmCopy = ownedStableRuntimeByteCopy(
      retainedWasm,
      registry.stable.wasm,
      "stable WASM",
    );
    ephemeralBuffers.push({
      bytes: wasmCopy,
      expectedBytes: registry.stable.wasm.bytes,
    });
    const weightsCopy = ownedStableRuntimeByteCopy(
      retainedWeights,
      registry.stable.weights,
      "stable weights",
    );
    ephemeralBuffers.push({
      bytes: weightsCopy,
      expectedBytes: registry.stable.weights.bytes,
    });
    const workerCopy = ownedStableRuntimeByteCopy(
      retainedWorker,
      registry.stable.worker,
      "stable worker",
    );
    ephemeralBuffers.push({
      bytes: workerCopy,
      expectedBytes: registry.stable.worker.bytes,
    });
    const callbackAssets = frozenRecord({
      receipt: authorityReceipt,
      bytes: frozenRecord({
        wasm: wasmCopy,
        weights: weightsCopy,
        worker: workerCopy,
      }),
    });

    phase = "callback";
    const callbackPromise = INTRINSIC_REFLECT_APPLY(callback, undefined, [
      callbackAssets,
    ]) as unknown;
    if (!exactNativePromise(callbackPromise)) {
      fail(
        "stable runtime assets callback must return an exact native Promise",
      );
    }
    const callbackResult = await callbackPromise;
    if (
      callbackResult !== null &&
      (typeof callbackResult === "object" ||
        typeof callbackResult === "function") &&
      nodeUtilTypes.isProxy(callbackResult)
    ) {
      fail("stable runtime assets callback must not resolve to a Proxy");
    }
    assertStableRuntimeByteCopy(wasmCopy, registry.stable.wasm, "stable WASM");
    assertStableRuntimeByteCopy(
      weightsCopy,
      registry.stable.weights,
      "stable weights",
    );
    assertStableRuntimeByteCopy(
      workerCopy,
      registry.stable.worker,
      "stable worker",
    );
    phase = "revalidation";
    await revalidate(root, directories, assets, dependencies.effectiveUserId);
    return callbackResult;
  } catch (primary) {
    wrappedPrimary = new FloodgateProductionTeacherAssetAuthorityError(
      phase,
      failureDetail(primary),
      primary,
    );
    throw wrappedPrimary;
  } finally {
    if (callback === null) {
      for (const buffer of retainedBuffers) buffer.fill(0);
    } else {
      const cleanupFailure = zeroizeEphemeralBytes(
        retainedEphemeralBuffers,
        ephemeralBuffers,
      );
      if (cleanupFailure !== undefined) {
        if (wrappedPrimary !== undefined) {
          throw new FloodgateProductionTeacherAssetAuthorityError(
            wrappedPrimary.phase,
            "operation and ephemeral runtime asset byte zeroization both failed",
            new AggregateError(
              [wrappedPrimary, cleanupFailure],
              "asset authority operation and cleanup both failed",
            ),
          );
        }
        throw new FloodgateProductionTeacherAssetAuthorityError(
          "callback",
          "ephemeral runtime asset byte zeroization failed",
          cleanupFailure,
        );
      }
    }
  }
}

/** Dependency-injected test seam with a small exact registry and private root. */
export function verifyPinnedFloodgateProductionTeacherAssetsCoreForTests(
  expectedRegistry: FloodgateProductionTeacherExpectedAssetRegistry,
  root: string,
  dependencies: FloodgateProductionTeacherAssetAuthorityDependencies,
): Promise<
  Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<"test-only-injected-expected-registry-and-root">
  >
> {
  return verifyPinnedFloodgateProductionTeacherAssetsInternal(
    expectedRegistry,
    root,
    dependencies,
    "test-only-injected-expected-registry-and-root",
    null,
  );
}

/**
 * Dependency-injected seam for exercising the ephemeral stable-runtime asset
 * handoff without opening the fixed production deployment.
 */
export function withVerifiedPinnedFloodgateProductionStableRuntimeAssetsCoreForTests<
  TResult,
>(
  expectedRegistry: FloodgateProductionTeacherExpectedAssetRegistry,
  root: string,
  dependencies: FloodgateProductionTeacherAssetAuthorityDependencies,
  callback: FloodgateProductionStableRuntimeAssetsCallback<
    TResult,
    "test-only-injected-expected-registry-and-root"
  >,
): Promise<TResult> {
  return verifyPinnedFloodgateProductionTeacherAssetsInternal(
    expectedRegistry,
    root,
    dependencies,
    "test-only-injected-expected-registry-and-root",
    callback,
  );
}

interface FixedProductionAssetAuthorityInvocation {
  readonly effectiveUserId: number;
  readonly root: string;
}

function fixedProductionAssetAuthorityInvocation(): Readonly<FixedProductionAssetAuthorityInvocation> {
  try {
    if (process.platform !== "darwin" || process.arch !== "arm64") {
      fail("the pinned APPLEM1 production assets require darwin arm64");
    }
    if (typeof process.geteuid !== "function") {
      fail("POSIX effective-user identity is required");
    }
    const effectiveUserId = process.geteuid();
    const user = os.userInfo();
    if (user.uid !== effectiveUserId) {
      fail("effective-user account lookup does not match the process EUID");
    }
    return frozenRecord({
      effectiveUserId,
      root: path.join(user.homedir, ...ROOT_RELATIVE_COMPONENTS),
    });
  } catch (primary) {
    throw new FloodgateProductionTeacherAssetAuthorityError(
      "capture",
      failureDetail(primary),
      primary,
    );
  }
}

/** Verify the fixed current-user production teacher deployment. */
export async function verifyPinnedFloodgateProductionTeacherAssets(): Promise<
  Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<"production-fixed-registry-and-deployment-root">
  >
> {
  const { effectiveUserId, root } = fixedProductionAssetAuthorityInvocation();
  return verifyPinnedFloodgateProductionTeacherAssetsInternal(
    FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
    root,
    {
      effectiveUserId,
      embeddedWasmBase64: SHOGI_WASM_BASE64,
    },
    "production-fixed-registry-and-deployment-root",
    null,
  );
}

/**
 * Hand fixed, revalidated production stable-runtime bytes to one asynchronous
 * initializer. All byte copies are rechecked and zero-filled before this
 * operation settles; no root, registry, EUID, path, or descriptor override is
 * accepted from the caller.
 */
export function withVerifiedPinnedFloodgateProductionStableRuntimeAssets<
  TResult,
>(
  callback: FloodgateProductionStableRuntimeAssetsCallback<
    TResult,
    "production-fixed-registry-and-deployment-root"
  >,
): Promise<TResult> {
  const { effectiveUserId, root } = fixedProductionAssetAuthorityInvocation();
  return verifyPinnedFloodgateProductionTeacherAssetsInternal(
    FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
    root,
    {
      effectiveUserId,
      embeddedWasmBase64: SHOGI_WASM_BASE64,
    },
    "production-fixed-registry-and-deployment-root",
    callback,
  );
}
