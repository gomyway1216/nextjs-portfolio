/**
 * Fixed production capability for reusable stable-WASM proposals.
 *
 * This boundary initializes the pinned stable assets under the production
 * asset authority and exposes only propose/close.  It does not authenticate a
 * training parent, create a teacher label, train a model, open a holdout, or
 * establish playing strength.
 */

import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
  type FloodgateProductionStableRuntimeAssets,
  type FloodgateProductionStableRuntimeAssetsCallback,
  withVerifiedPinnedFloodgateProductionStableRuntimeAssets,
} from "./floodgate-production-teacher-asset-authority";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import { toSfen } from "./generate-teacher";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_QUIESCENCE_DEPTH,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_BYTES,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_RECEIPT_SCHEMA,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_STATUS,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  FLOODGATE_STABLE_WASM_SHA256,
  FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
  FLOODGATE_STABLE_WEIGHTS_BYTES,
  FLOODGATE_STABLE_WEIGHTS_SHA256,
  FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
  FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
  createFloodgateStableWasmReusableProposalPool,
  type FloodgateStableWasmProposalRow,
  type FloodgateStableWasmReusableProposalPool,
  type FloodgateStableWasmReusableProposalPoolOptions,
  type FloodgateStableWasmSearchAssets,
} from "./floodgate-stable-wasm-proposer";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT =
  "shogi-floodgate-production-stable-wasm-runtime-v1" as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS =
  "initialized-fixed-stable-wasm-reusable-proposal-capability" as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY =
  "fixed-stable-runtime-configuration-and-initialization-not-parent-authentication-teacher-label-training-holdout-or-playing-strength-evidence" as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA =
  "shogi-floodgate-production-stable-wasm-runtime-result-v1" as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY =
  "direct-owning-runtime-capability-result-only-plain-structural-result-is-not-an-authentication-claim" as const;

export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS = 12 as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND = 48 as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS =
  120_000 as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS =
  600_000 as const;
export const FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS =
  15_000 as const;

const AUTHORITY_RECEIPT_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-authority-receipt-v1\0";
const REUSABLE_POOL_RECEIPT_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-pool-receipt-v1\0";
const RUNTIME_RECEIPT_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-receipt-v1\0";
const RESULT_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-row-v1\0";
const RESULT_PARENT_DIGEST_DOMAIN = "shogi-floodgate-stable-parent-v1\0";
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const CANONICAL_USI_MOVE_RE =
  /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/;
const MAX_CAPTURE_DEPTH = 20;
const MAX_CAPTURE_ENTRIES = 10_000;

const NativePromise = Promise;
const NativeUint8Array = Uint8Array;
const nativePromisePrototype = Promise.prototype;
const nativePromiseThen = Promise.prototype.then;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get;
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;
const typedArraySet = typedArrayPrototype.set as (
  source: ArrayLike<number>,
  offset?: number,
) => void;
const typedArrayFill = typedArrayPrototype.fill as (
  value: number,
  start?: number,
  end?: number,
) => Uint8Array;

const FIXED_POOL_OPTIONS: Readonly<FloodgateStableWasmReusableProposalPoolOptions> =
  Object.freeze({
    workers: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS,
    queueBound: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND,
    startupTimeoutMilliseconds:
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS,
    searchTimeoutMilliseconds:
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
    closeTimeoutMilliseconds:
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS,
  });

export type FloodgateProductionStableWasmRuntimeExecutionBoundary =
  | "production-fixed-asset-authority-and-reusable-pool"
  | "test-only-injected-asset-provider-and-pool-factory";

type AssetAuthorityExecutionBoundary =
  | "production-fixed-registry-and-deployment-root"
  | "test-only-injected-expected-registry-and-root";

export type FloodgateProductionStableWasmRuntimePhase =
  | "capture"
  | "asset-authority"
  | "pool-initialization"
  | "proposal"
  | "cleanup";

export class FloodgateProductionStableWasmRuntimeError extends Error {
  readonly phase: FloodgateProductionStableWasmRuntimePhase;
  readonly primary: unknown;

  constructor(
    phase: FloodgateProductionStableWasmRuntimePhase,
    message: string,
    primary: unknown,
  ) {
    super(`Floodgate production stable-WASM runtime failed: ${message}`, {
      cause: primary,
    });
    this.name = "FloodgateProductionStableWasmRuntimeError";
    this.phase = phase;
    this.primary = primary;
  }
}

export interface FloodgateProductionStableWasmRuntimeReceipt<
  TBoundary extends FloodgateProductionStableWasmRuntimeExecutionBoundary =
    FloodgateProductionStableWasmRuntimeExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT;
  readonly status: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS;
  readonly claim_boundary: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly asset_authority: Readonly<{
    readonly contract: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT;
    readonly status: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS;
    readonly claim_boundary: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY;
    readonly trust_boundary: typeof FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY;
    readonly execution_boundary: AssetAuthorityExecutionBoundary;
    readonly receipt_sha256: string;
  }>;
  readonly stable_engine_assets: Readonly<{
    readonly worker_schema: typeof FLOODGATE_STABLE_WASM_WORKER_SCHEMA;
    readonly wasm: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly weights: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
      readonly k: 600;
      readonly buckets: 1;
    }>;
    readonly worker_source: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
  }>;
  readonly search_contract: Readonly<{
    readonly requested_depth: typeof FLOODGATE_STABLE_REQUESTED_DEPTH;
    readonly quiescence_depth: typeof FLOODGATE_STABLE_QUIESCENCE_DEPTH;
    readonly early_completion: "positive-winning-mate-band-depth-1-through-10-only";
    readonly positive_mate_score_min: typeof FLOODGATE_STABLE_MATE_SCORE_MIN;
    readonly positive_mate_score_max: typeof FLOODGATE_STABLE_MATE_SCORE_MAX;
    readonly score_encoding: typeof FLOODGATE_STABLE_WASM_SCORE_ENCODING;
    readonly root_tesu: "input-ply";
    readonly book: false;
    readonly fallback: "forbidden";
  }>;
  readonly operational: Readonly<{
    readonly workers: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS;
    readonly queue_bound: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND;
    readonly startup_timeout_ms: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS;
    readonly search_timeout_ms: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS;
    readonly close_timeout_ms: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS;
    readonly scheduling: "bounded-fifo-one-parent-per-worker-v1";
    readonly failure_policy: "pool-wide-poison-reject-all-force-stop-v1";
    readonly cleanup: "asset-copies-zeroized-idle-quit-active-or-poison-force-stop-idempotent-close-v1";
    readonly reusable_pool_receipt_sha256: string;
  }>;
  readonly nonclaims: Readonly<{
    readonly parent_authentication: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly selection_or_holdout_access: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateProductionStableWasmRuntimeBinding<
  TBoundary extends FloodgateProductionStableWasmRuntimeExecutionBoundary =
    FloodgateProductionStableWasmRuntimeExecutionBoundary,
> {
  readonly claim_boundary: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly runtime_receipt_sha256: string;
  readonly reusable_pool_receipt_sha256: string;
  readonly parent_payload_sha256: string;
  readonly row_sha256: string;
  readonly origin: "direct-owning-runtime-capability-call-v1";
  readonly plain_result_authentication_claim: false;
}

export interface FloodgateProductionStableWasmRuntimeResult<
  TBoundary extends FloodgateProductionStableWasmRuntimeExecutionBoundary =
    FloodgateProductionStableWasmRuntimeExecutionBoundary,
> {
  readonly schema: typeof FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA;
  readonly row: Readonly<FloodgateStableWasmProposalRow>;
  readonly runtime_binding: Readonly<
    FloodgateProductionStableWasmRuntimeBinding<TBoundary>
  >;
}

export interface FloodgateProductionStableWasmRuntime<
  TBoundary extends FloodgateProductionStableWasmRuntimeExecutionBoundary =
    FloodgateProductionStableWasmRuntimeExecutionBoundary,
> {
  readonly receipt: Readonly<
    FloodgateProductionStableWasmRuntimeReceipt<TBoundary>
  >;
  readonly propose: (
    parent: Readonly<FloodgateTrainingParent>,
  ) => Promise<Readonly<FloodgateProductionStableWasmRuntimeResult<TBoundary>>>;
  readonly close: () => Promise<void>;
}

type TestAssetProvider = <TResult>(
  callback: FloodgateProductionStableRuntimeAssetsCallback<
    TResult,
    "test-only-injected-expected-registry-and-root"
  >,
) => Promise<TResult>;

type ReusablePoolFactory = (
  assets: Readonly<FloodgateStableWasmSearchAssets>,
  options: Readonly<FloodgateStableWasmReusableProposalPoolOptions>,
) => Promise<Readonly<FloodgateStableWasmReusableProposalPool>>;

type UnknownCallable = (...arguments_: never[]) => unknown;

export interface FloodgateProductionStableWasmRuntimeCoreDependencies {
  readonly assetProvider: TestAssetProvider;
  readonly poolFactory: ReusablePoolFactory;
}

interface CapturedParent extends Readonly<FloodgateTrainingParent> {
  readonly parent_payload_sha256: string;
}

interface CapturedRuntimeAssets {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly authorityReceiptSha256: string;
  readonly wasm: Uint8Array;
  readonly weights: Uint8Array;
  readonly worker: Uint8Array;
  readonly identities: Readonly<{
    readonly wasm: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly weights: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly worker: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
  }>;
}

function fail(message: string): never {
  throw new Error(`invalid production stable-WASM runtime: ${message}`);
}

function runtimeFailure(
  phase: FloodgateProductionStableWasmRuntimePhase,
  primary: unknown,
): FloodgateProductionStableWasmRuntimeError {
  if (
    !nodeUtilTypes.isProxy(primary) &&
    primary instanceof FloodgateProductionStableWasmRuntimeError
  )
    return primary;
  const detail = safeFailureDetail(primary);
  return new FloodgateProductionStableWasmRuntimeError(phase, detail, primary);
}

function safeFailureDetail(primary: unknown): string {
  if (typeof primary === "string") {
    const sanitized = primary.replace(/[\u0000-\u001f\u007f]/g, "?");
    return sanitized.slice(0, 1_000) || "operation failed";
  }
  if (
    primary !== null &&
    typeof primary === "object" &&
    !nodeUtilTypes.isProxy(primary) &&
    nodeUtilTypes.isNativeError(primary)
  ) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(primary, "message");
      if (
        descriptor !== undefined &&
        "value" in descriptor &&
        typeof descriptor.value === "string"
      ) {
        const sanitized = descriptor.value.replace(
          /[\u0000-\u001f\u007f]/g,
          "?",
        );
        return sanitized.slice(0, 1_000) || "operation failed";
      }
    } catch {
      // Fall through to the bounded generic detail.
    }
  }
  return "operation failed";
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = Object.create(null) as T;
  for (const key of Object.keys(value)) {
    Object.defineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: (value as Record<string, unknown>)[key],
    });
  }
  return Object.freeze(output);
}

function frozenList<T>(values: T[]): readonly T[] {
  return Object.freeze(values);
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail("canonical JSON rejects non-finite numbers and negative zero");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") fail("canonical JSON rejects this value");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256(`${domain}${canonicalJson(value)}`);
}

function strictRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
  options: Readonly<{ nullPrototype?: boolean; frozen?: boolean }> = {},
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    fail(`${label} must be a non-Proxy record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    options.nullPrototype === true
      ? prototype !== null
      : prototype !== null && prototype !== Object.prototype
  ) {
    fail(`${label} has an unsupported prototype`);
  }
  if (options.frozen === true && !Object.isFrozen(value))
    fail(`${label} must be frozen`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string"))
    fail(`${label} contains a symbol key`);
  const actual = Object.keys(descriptors).sort(compareBytewise);
  const expected = [...keys].sort(compareBytewise);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable own data property`);
    }
  }
  return value as Record<string, unknown>;
}

function captureDataTree(
  value: unknown,
  label: string,
  state = { entries: 0 },
  depth = 0,
): unknown {
  state.entries += 1;
  if (state.entries > MAX_CAPTURE_ENTRIES || depth > MAX_CAPTURE_DEPTH)
    fail(`${label} exceeds the capture bound`);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail(`${label} contains an invalid number`);
    return value;
  }
  if (Array.isArray(value)) {
    if (
      nodeUtilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    )
      fail(`${label} contains an invalid array`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expectedKeys = [...Array(value.length).keys()].map(String);
    const actualKeys = Object.keys(descriptors).filter(
      (key) => key !== "length",
    );
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
      fail(`${label} contains a sparse or decorated array`);
    }
    return frozenList(
      value.map((entry, index) =>
        captureDataTree(entry, `${label}[${index}]`, state, depth + 1),
      ),
    );
  }
  if (
    value === null ||
    typeof value !== "object" ||
    nodeUtilTypes.isProxy(value)
  )
    fail(`${label} contains an unsupported value`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    fail(`${label} contains an unsupported object prototype`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string"))
    fail(`${label} contains a symbol key`);
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(descriptors).sort(compareBytewise)) {
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || descriptor.enumerable !== true)
      fail(`${label}.${key} is not an enumerable own data property`);
    Object.defineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: captureDataTree(
        descriptor.value,
        `${label}.${key}`,
        state,
        depth + 1,
      ),
    });
  }
  return Object.freeze(output);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(`${label} is not the fixed value`);
}

function safeInteger(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    fail(`${label} is outside the safe integer range`);
  }
  return value as number;
}

function requiredDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value))
    fail(`${label} is not a lowercase SHA-256 digest`);
  return value;
}

function requiredFrozenFunction(
  value: unknown,
  label: string,
): UnknownCallable {
  if (
    typeof value !== "function" ||
    nodeUtilTypes.isProxy(value) ||
    !Object.isFrozen(value)
  ) {
    fail(`${label} must be a frozen non-Proxy function`);
  }
  return value as UnknownCallable;
}

function copyOwnedBytes(value: unknown, label: string): Uint8Array {
  if (
    !nodeUtilTypes.isUint8Array(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== NativeUint8Array.prototype ||
    typedArrayBufferGetter === undefined ||
    typedArrayByteLengthGetter === undefined ||
    typedArrayByteOffsetGetter === undefined ||
    arrayBufferByteLengthGetter === undefined
  ) {
    fail(`${label} must be an owned whole-buffer Uint8Array`);
  }
  let buffer: ArrayBufferLike;
  let byteLength: number;
  let byteOffset: number;
  try {
    buffer = Reflect.apply(typedArrayBufferGetter, value, []);
    byteLength = Reflect.apply(typedArrayByteLengthGetter, value, []);
    byteOffset = Reflect.apply(typedArrayByteOffsetGetter, value, []);
  } catch {
    return fail(`${label} is detached or has invalid typed-array storage`);
  }
  if (
    nodeUtilTypes.isSharedArrayBuffer(buffer) ||
    byteLength <= 0 ||
    byteOffset !== 0 ||
    Reflect.apply(arrayBufferByteLengthGetter, buffer, []) !== byteLength
  ) {
    fail(`${label} must be an owned whole-buffer Uint8Array`);
  }
  const copy = new NativeUint8Array(byteLength);
  Reflect.apply(typedArraySet, copy, [value, 0]);
  return copy;
}

function zeroBytes(value: Uint8Array): void {
  Reflect.apply(typedArrayFill, value, [0]);
}

function zeroAssetCopies(assets: CapturedRuntimeAssets): readonly unknown[] {
  const failures: unknown[] = [];
  for (const bytes of [assets.wasm, assets.weights, assets.worker]) {
    try {
      zeroBytes(bytes);
    } catch (failure) {
      failures.push(failure);
    }
  }
  return failures;
}

function captureReusablePoolCleanup(
  value: unknown,
): FloodgateStableWasmReusableProposalPool["close"] {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    nodeUtilTypes.isProxy(value)
  ) {
    fail("reusable pool cleanup capability must be a non-Proxy object");
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "close");
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "function" ||
    nodeUtilTypes.isProxy(descriptor.value)
  ) {
    fail("reusable pool.close cleanup capability is not an own data function");
  }
  return descriptor.value as FloodgateStableWasmReusableProposalPool["close"];
}

function rejectedNativePromise<T>(reason: unknown): Promise<T> {
  return new NativePromise<T>((_resolve, reject) => reject(reason));
}

function positionKeyFromSfen(sfen: string): string {
  const fields = sfen.split(" ");
  if (fields.length !== 4 || fields.some((field) => field === ""))
    fail("canonical SFEN must have four non-empty fields");
  return `sha256:${sha256(`sfen-v1\0${fields.slice(0, 3).join(" ")}`)}`;
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function captureParent(value: unknown): Readonly<CapturedParent> {
  const row = strictRecord(
    value,
    [
      "schema_version",
      "game_id",
      "parent_id",
      "position_id",
      "parent_sfen",
      "ply",
      "played_move",
    ],
    "parent",
  );
  exact(row.schema_version, 1, "parent.schema_version");
  for (const key of ["game_id", "parent_id", "position_id"] as const) {
    if (
      typeof row[key] !== "string" ||
      !SEMANTIC_ID_RE.test(row[key] as string)
    )
      fail(`parent.${key} is not a semantic ID`);
  }
  const ply = safeInteger(row.ply, "parent.ply", 0, 2_147_483_647);
  exact(
    row.parent_id,
    parentOccurrenceId(row.game_id as string, ply),
    "parent.parent_id",
  );
  if (
    typeof row.parent_sfen !== "string" ||
    row.parent_sfen === "" ||
    row.parent_sfen.trim() !== row.parent_sfen ||
    row.parent_sfen.includes("\0")
  ) {
    fail("parent.parent_sfen is not canonical text");
  }
  const parentSfen = row.parent_sfen;
  let parsed: ReturnType<typeof positionFromSfen>;
  try {
    parsed = positionFromSfen(parentSfen);
  } catch (error) {
    return fail(`parent.parent_sfen is invalid: ${String(error)}`);
  }
  if (
    toSfen(parsed.position, parsed.moveNumber) !== parentSfen ||
    parsed.moveNumber !== ply + 1 ||
    positionKeyFromSfen(parentSfen) !== row.position_id
  ) {
    fail("parent SFEN identity binding is inconsistent");
  }
  if (
    typeof row.played_move !== "string" ||
    !CANONICAL_USI_MOVE_RE.test(row.played_move)
  ) {
    fail("parent.played_move is not canonical USI");
  }
  const legal = rulesCompleteLegalMoves(parsed.position);
  if (legal.some((entry) => getKomashu(entry.move.capture) === OU)) {
    fail("parent legal move set attempts to capture the opposing king");
  }
  if (
    legal.length === 0 ||
    !legal.some(
      (entry) =>
        entry.usi === row.played_move && getKomashu(entry.move.capture) !== OU,
    )
  ) {
    fail("parent.played_move is not rules-complete legal");
  }
  const payload = frozenRecord({
    schema_version: 1 as const,
    game_id: row.game_id as string,
    parent_id: row.parent_id as string,
    position_id: row.position_id as string,
    parent_sfen: parentSfen,
    ply,
    played_move: row.played_move,
  });
  return frozenRecord({
    ...payload,
    parent_payload_sha256: digestCanonical(
      RESULT_PARENT_DIGEST_DOMAIN,
      payload,
    ),
  });
}

function projectParentForReusablePool(
  parent: Readonly<CapturedParent>,
): Readonly<FloodgateTrainingParent> {
  return frozenRecord({
    schema_version: parent.schema_version,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_sfen: parent.parent_sfen,
    ply: parent.ply,
    played_move: parent.played_move,
  });
}

function captureProposalRow(
  value: unknown,
  parent: Readonly<CapturedParent>,
): Readonly<FloodgateStableWasmProposalRow> {
  const row = strictRecord(
    value,
    [
      "schema",
      "game_id",
      "parent_id",
      "position_id",
      "parent_payload_sha256",
      "stable_move",
      "child_sfen",
      "child_position_id",
      "search",
    ],
    "stable proposal row",
  );
  exact(row.schema, FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA, "row.schema");
  exact(row.game_id, parent.game_id, "row.game_id");
  exact(row.parent_id, parent.parent_id, "row.parent_id");
  exact(row.position_id, parent.position_id, "row.position_id");
  exact(
    row.parent_payload_sha256,
    parent.parent_payload_sha256,
    "row.parent_payload_sha256",
  );
  if (
    typeof row.stable_move !== "string" ||
    !CANONICAL_USI_MOVE_RE.test(row.stable_move)
  ) {
    fail("row.stable_move is not canonical USI");
  }
  const { position } = positionFromSfen(parent.parent_sfen);
  const legal = rulesCompleteLegalMoves(position);
  if (legal.some((entry) => getKomashu(entry.move.capture) === OU)) {
    fail("row parent legal move set attempts to capture the opposing king");
  }
  if (
    !legal.some(
      (entry) =>
        entry.usi === row.stable_move && getKomashu(entry.move.capture) !== OU,
    )
  ) {
    fail("row.stable_move is not rules-complete legal");
  }
  const childSfen = childSfenAfterUsi(parent.parent_sfen, row.stable_move);
  exact(row.child_sfen, childSfen, "row.child_sfen");
  exact(
    row.child_position_id,
    positionKeyFromSfen(childSfen),
    "row.child_position_id",
  );
  const search = strictRecord(
    row.search,
    [
      "requested_depth",
      "completed_depth",
      "termination",
      "raw_search_score",
      "score_encoding",
      "nodes",
      "leaves",
      "root_tesu",
    ],
    "row.search",
  );
  exact(
    search.requested_depth,
    FLOODGATE_STABLE_REQUESTED_DEPTH,
    "row.search.requested_depth",
  );
  exact(
    search.score_encoding,
    FLOODGATE_STABLE_WASM_SCORE_ENCODING,
    "row.search.score_encoding",
  );
  exact(search.root_tesu, parent.ply, "row.search.root_tesu");
  const completedDepth = safeInteger(
    search.completed_depth,
    "row.search.completed_depth",
    1,
    FLOODGATE_STABLE_REQUESTED_DEPTH,
  );
  const rawSearchScore = safeInteger(
    search.raw_search_score,
    "row.search.raw_search_score",
    -FLOODGATE_STABLE_MATE_SCORE_MAX,
    FLOODGATE_STABLE_MATE_SCORE_MAX,
  );
  const nodes = safeInteger(search.nodes, "row.search.nodes", 0, 2_147_483_647);
  const leaves = safeInteger(
    search.leaves,
    "row.search.leaves",
    0,
    2_147_483_647,
  );
  if (nodes + leaves === 0) fail("row search counters are empty");
  const expectedTermination =
    completedDepth === FLOODGATE_STABLE_REQUESTED_DEPTH
      ? "requested-depth-complete"
      : "winning-mate-band-early";
  exact(search.termination, expectedTermination, "row.search.termination");
  if (
    expectedTermination === "winning-mate-band-early" &&
    (rawSearchScore < FLOODGATE_STABLE_MATE_SCORE_MIN ||
      rawSearchScore > FLOODGATE_STABLE_MATE_SCORE_MAX)
  ) {
    fail("row early completion is not in the positive winning-mate band");
  }
  return frozenRecord({
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: parent.parent_payload_sha256,
    stable_move: row.stable_move,
    child_sfen: childSfen,
    child_position_id: row.child_position_id as string,
    search: frozenRecord({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: completedDepth,
      termination: expectedTermination,
      raw_search_score: rawSearchScore,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes,
      leaves,
      root_tesu: parent.ply,
    }),
  });
}

function captureAuthorityAndAssets<
  TBoundary extends AssetAuthorityExecutionBoundary,
>(
  value: Readonly<FloodgateProductionStableRuntimeAssets<TBoundary>>,
  expectedBoundary: TBoundary,
  requirePinnedProductionAssets: boolean,
): CapturedRuntimeAssets {
  const outer = strictRecord(value, ["receipt", "bytes"], "runtime assets", {
    nullPrototype: true,
    frozen: true,
  });
  const byteRecord = strictRecord(
    outer.bytes,
    ["wasm", "weights", "worker"],
    "runtime asset bytes",
    { nullPrototype: true, frozen: true },
  );
  let wasm: Uint8Array | undefined;
  let weights: Uint8Array | undefined;
  let worker: Uint8Array | undefined;
  let completed = false;
  try {
    wasm = copyOwnedBytes(byteRecord.wasm, "runtime asset WASM");
    weights = copyOwnedBytes(byteRecord.weights, "runtime asset weights");
    worker = copyOwnedBytes(byteRecord.worker, "runtime worker source");
    const receipt = strictRecord(
      captureDataTree(outer.receipt, "asset authority receipt"),
      [
        "contract",
        "status",
        "claim_boundary",
        "trust_boundary",
        "execution_boundary",
        "deployment",
        "assets",
        "engine",
        "runtime",
        "postverification",
      ],
      "asset authority receipt",
      { nullPrototype: true, frozen: true },
    );
    exact(
      receipt.contract,
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
      "asset authority contract",
    );
    exact(
      receipt.status,
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
      "asset authority status",
    );
    exact(
      receipt.claim_boundary,
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
      "asset authority claim boundary",
    );
    exact(
      receipt.trust_boundary,
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
      "asset authority trust boundary",
    );
    exact(
      receipt.execution_boundary,
      expectedBoundary,
      "asset authority execution boundary",
    );
    const assets = strictRecord(
      receipt.assets,
      ["engine", "eval", "stable"],
      "authority assets",
    );
    const stable = strictRecord(
      assets.stable,
      ["plan", "wasm", "weights", "worker"],
      "authority stable assets",
    );
    const evidenceBindings = [
      [
        "wasm",
        stable.wasm,
        wasm,
        FLOODGATE_STABLE_WASM_BYTES,
        FLOODGATE_STABLE_WASM_SHA256,
      ],
      [
        "weights",
        stable.weights,
        weights,
        FLOODGATE_STABLE_WEIGHTS_BYTES,
        FLOODGATE_STABLE_WEIGHTS_SHA256,
      ],
      [
        "worker",
        stable.worker,
        worker,
        FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
        FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
      ],
    ] as const;
    const capturedIdentities = Object.create(null) as Record<
      "wasm" | "weights" | "worker",
      Readonly<{ readonly bytes: number; readonly sha256: string }>
    >;
    for (const [
      name,
      evidenceValue,
      bytes,
      pinnedBytes,
      pinnedSha256,
    ] of evidenceBindings) {
      const evidence = strictRecord(
        evidenceValue,
        ["relative_path", "bytes", "sha256", "mode", "identity"],
        `authority stable ${name}`,
      );
      const expectedBytes = safeInteger(
        evidence.bytes,
        `authority stable ${name}.bytes`,
        1,
      );
      const expectedSha256 = requiredDigest(
        evidence.sha256,
        `authority stable ${name}.sha256`,
      );
      if (
        bytes.byteLength !== expectedBytes ||
        sha256(bytes) !== expectedSha256
      ) {
        fail(`runtime stable ${name} bytes differ from the authority receipt`);
      }
      if (
        requirePinnedProductionAssets &&
        (expectedBytes !== pinnedBytes || expectedSha256 !== pinnedSha256)
      ) {
        fail(`production stable ${name} identity is not pinned`);
      }
      capturedIdentities[name] = frozenRecord({
        bytes: expectedBytes,
        sha256: expectedSha256,
      });
    }
    const result: CapturedRuntimeAssets = {
      receipt,
      authorityReceiptSha256: digestCanonical(
        AUTHORITY_RECEIPT_DIGEST_DOMAIN,
        receipt,
      ),
      wasm,
      weights,
      worker,
      identities: frozenRecord({
        wasm: capturedIdentities.wasm,
        weights: capturedIdentities.weights,
        worker: capturedIdentities.worker,
      }),
    };
    completed = true;
    return result;
  } finally {
    if (!completed) {
      if (wasm !== undefined) zeroBytes(wasm);
      if (weights !== undefined) zeroBytes(weights);
      if (worker !== undefined) zeroBytes(worker);
    }
  }
}

function captureReusablePool(
  value: unknown,
  assets: CapturedRuntimeAssets,
): Readonly<FloodgateStableWasmReusableProposalPool> & {
  readonly receiptSha256: string;
} {
  const pool = strictRecord(
    value,
    ["receipt", "propose", "close"],
    "reusable pool",
    {
      nullPrototype: true,
      frozen: true,
    },
  );
  const propose = requiredFrozenFunction(pool.propose, "reusable pool.propose");
  const close = requiredFrozenFunction(pool.close, "reusable pool.close");
  const receipt = captureDataTree(
    pool.receipt,
    "reusable pool receipt",
  ) as Readonly<Record<string, unknown>>;
  exact(
    receipt.schema,
    FLOODGATE_STABLE_WASM_REUSABLE_POOL_RECEIPT_SCHEMA,
    "reusable pool receipt.schema",
  );
  exact(
    receipt.status,
    FLOODGATE_STABLE_WASM_REUSABLE_POOL_STATUS,
    "reusable pool receipt.status",
  );
  exact(
    receipt.claim_boundary,
    FLOODGATE_STABLE_WASM_REUSABLE_POOL_CLAIM_BOUNDARY,
    "reusable pool receipt.claim_boundary",
  );
  const supplied = strictRecord(
    receipt.supplied_engine_assets,
    ["worker_source", "wasm", "weights"],
    "reusable pool supplied assets",
  );
  const expectedIdentities = [
    ["wasm", supplied.wasm, assets.identities.wasm],
    ["weights", supplied.weights, assets.identities.weights],
    ["worker_source", supplied.worker_source, assets.identities.worker],
  ] as const;
  for (const [name, valueIdentity, expectedIdentity] of expectedIdentities) {
    const keys =
      name === "weights"
        ? ["buckets", "bytes", "k", "sha256"]
        : ["bytes", "sha256"];
    const identity = strictRecord(valueIdentity, keys, `reusable pool ${name}`);
    exact(
      identity.bytes,
      expectedIdentity.bytes,
      `reusable pool ${name}.bytes`,
    );
    exact(
      identity.sha256,
      expectedIdentity.sha256,
      `reusable pool ${name}.sha256`,
    );
    if (name === "weights") {
      exact(identity.k, 600, "reusable pool weights.k");
      exact(identity.buckets, 1, "reusable pool weights.buckets");
    }
  }
  const search = strictRecord(
    receipt.required_search_contract,
    [
      "book",
      "external_mate_solver",
      "fallback",
      "max_time_ms",
      "requested_depth",
      "quiescence_depth",
      "search_start_depth",
      "root_tesu",
      "private_tt",
      "shared_tt",
      "nnue",
      "early_completion",
      "score_encoding",
    ],
    "reusable pool search contract",
  );
  exact(search.book, false, "search contract.book");
  exact(
    search.external_mate_solver,
    false,
    "search contract.external_mate_solver",
  );
  exact(search.fallback, "forbidden", "search contract.fallback");
  exact(search.max_time_ms, 0, "search contract.max_time_ms");
  exact(
    search.requested_depth,
    FLOODGATE_STABLE_REQUESTED_DEPTH,
    "search depth",
  );
  exact(
    search.quiescence_depth,
    FLOODGATE_STABLE_QUIESCENCE_DEPTH,
    "quiescence depth",
  );
  exact(search.search_start_depth, 1, "search start depth");
  exact(search.root_tesu, "input-ply", "search root_tesu");
  exact(search.private_tt, "cleared-before-every-parent", "search private_tt");
  exact(search.shared_tt, false, "search shared_tt");
  exact(
    search.early_completion,
    "depth-1-through-10-only-for-winning-score-89990000-through-90000000",
    "search early completion",
  );
  exact(
    search.score_encoding,
    FLOODGATE_STABLE_WASM_SCORE_ENCODING,
    "score encoding",
  );
  const nnue = strictRecord(
    search.nnue,
    ["enabled", "buckets", "k", "output_scale"],
    "search nnue",
  );
  exact(nnue.enabled, true, "search nnue.enabled");
  exact(nnue.buckets, 1, "search nnue.buckets");
  exact(nnue.k, 600, "search nnue.k");
  exact(nnue.output_scale, "1/1", "search nnue.output_scale");
  const operational = strictRecord(
    receipt.operational,
    [
      "workers",
      "queue_bound",
      "startup_timeout_ms",
      "search_timeout_ms",
      "close_timeout_ms",
      "scheduling",
      "failure_policy",
      "cleanup",
    ],
    "reusable pool operational receipt",
  );
  exact(operational.workers, FIXED_POOL_OPTIONS.workers, "pool workers");
  exact(
    operational.queue_bound,
    FIXED_POOL_OPTIONS.queueBound,
    "pool queue bound",
  );
  exact(
    operational.startup_timeout_ms,
    FIXED_POOL_OPTIONS.startupTimeoutMilliseconds,
    "pool startup timeout",
  );
  exact(
    operational.search_timeout_ms,
    FIXED_POOL_OPTIONS.searchTimeoutMilliseconds,
    "pool search timeout",
  );
  exact(
    operational.close_timeout_ms,
    FIXED_POOL_OPTIONS.closeTimeoutMilliseconds,
    "pool close timeout",
  );
  exact(
    operational.scheduling,
    "bounded-fifo-one-parent-per-worker-v1",
    "pool scheduling",
  );
  exact(
    operational.failure_policy,
    "pool-wide-poison-reject-all-force-stop-v1",
    "pool failure policy",
  );
  exact(
    operational.cleanup,
    "asset-copies-zeroized-idle-quit-active-or-poison-force-stop-idempotent-close-v1",
    "pool cleanup",
  );
  return frozenRecord({
    receipt:
      receipt as unknown as FloodgateStableWasmReusableProposalPool["receipt"],
    propose: propose as FloodgateStableWasmReusableProposalPool["propose"],
    close: close as FloodgateStableWasmReusableProposalPool["close"],
    receiptSha256: digestCanonical(
      REUSABLE_POOL_RECEIPT_DIGEST_DOMAIN,
      receipt,
    ),
  });
}

function buildRuntimeReceipt<
  TBoundary extends FloodgateProductionStableWasmRuntimeExecutionBoundary,
  TAssetBoundary extends AssetAuthorityExecutionBoundary,
>(
  executionBoundary: TBoundary,
  assetBoundary: TAssetBoundary,
  assets: CapturedRuntimeAssets,
  reusablePoolReceiptSha256: string,
): Readonly<FloodgateProductionStableWasmRuntimeReceipt<TBoundary>> {
  return frozenRecord({
    contract: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: executionBoundary,
    asset_authority: frozenRecord({
      contract: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
      status: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
      claim_boundary:
        FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
      trust_boundary:
        FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
      execution_boundary: assetBoundary,
      receipt_sha256: assets.authorityReceiptSha256,
    }),
    stable_engine_assets: frozenRecord({
      worker_schema: FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
      wasm: frozenRecord({
        bytes: assets.identities.wasm.bytes,
        sha256: assets.identities.wasm.sha256,
      }),
      weights: frozenRecord({
        bytes: assets.identities.weights.bytes,
        sha256: assets.identities.weights.sha256,
        k: 600 as const,
        buckets: 1 as const,
      }),
      worker_source: frozenRecord({
        bytes: assets.identities.worker.bytes,
        sha256: assets.identities.worker.sha256,
      }),
    }),
    search_contract: frozenRecord({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      quiescence_depth: FLOODGATE_STABLE_QUIESCENCE_DEPTH,
      early_completion:
        "positive-winning-mate-band-depth-1-through-10-only" as const,
      positive_mate_score_min: FLOODGATE_STABLE_MATE_SCORE_MIN,
      positive_mate_score_max: FLOODGATE_STABLE_MATE_SCORE_MAX,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      root_tesu: "input-ply" as const,
      book: false as const,
      fallback: "forbidden" as const,
    }),
    operational: frozenRecord({
      workers: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS,
      queue_bound: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND,
      startup_timeout_ms:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS,
      search_timeout_ms:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
      close_timeout_ms:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS,
      scheduling: "bounded-fifo-one-parent-per-worker-v1" as const,
      failure_policy: "pool-wide-poison-reject-all-force-stop-v1" as const,
      cleanup:
        "asset-copies-zeroized-idle-quit-active-or-poison-force-stop-idempotent-close-v1" as const,
      reusable_pool_receipt_sha256: reusablePoolReceiptSha256,
    }),
    nonclaims: frozenRecord({
      parent_authentication: false as const,
      teacher_label: false as const,
      training: false as const,
      selection_or_holdout_access: false as const,
      playing_strength: false as const,
    }),
  });
}

function guardNativePromise<T>(value: unknown, label: string): Promise<T> {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    nodeUtilTypes.isProxy(value) ||
    !nodeUtilTypes.isPromise(value) ||
    Object.getPrototypeOf(value) !== nativePromisePrototype
  ) {
    return rejectedNativePromise(
      new Error(`${label} must return a pinned or exact native Promise`),
    );
  }
  const ownKeys = Reflect.ownKeys(value);
  const exactNative = ownKeys.length === 0;
  const constructorDescriptor = Object.getOwnPropertyDescriptor(
    value,
    "constructor",
  );
  const pinnedNative =
    ownKeys.length === 1 &&
    ownKeys[0] === "constructor" &&
    constructorDescriptor !== undefined &&
    "value" in constructorDescriptor &&
    constructorDescriptor.value === NativePromise &&
    constructorDescriptor.enumerable === false &&
    constructorDescriptor.writable === false &&
    constructorDescriptor.configurable === false;
  if (!exactNative && !pinnedNative) {
    return rejectedNativePromise(
      new Error(`${label} must return a pinned or exact native Promise`),
    );
  }
  return new NativePromise<T>((resolve, reject) => {
    Reflect.apply(nativePromiseThen, value, [resolve, reject]);
  });
}

function transformNativePromise<TInput, TOutput>(
  promise: Promise<TInput>,
  onFulfilled: (value: TInput) => TOutput,
  onRejected: (reason: unknown) => TOutput,
): Promise<TOutput> {
  return new NativePromise<TOutput>((resolve, reject) => {
    Reflect.apply(nativePromiseThen, promise, [
      (value: TInput) => {
        try {
          resolve(onFulfilled(value));
        } catch (failure) {
          reject(failure);
        }
      },
      (reason: unknown) => {
        try {
          resolve(onRejected(reason));
        } catch (failure) {
          reject(failure);
        }
      },
    ]);
  });
}

function createFacade<
  TBoundary extends FloodgateProductionStableWasmRuntimeExecutionBoundary,
>(
  pool: Readonly<FloodgateStableWasmReusableProposalPool> & {
    readonly receiptSha256: string;
  },
  receipt: Readonly<FloodgateProductionStableWasmRuntimeReceipt<TBoundary>>,
): FloodgateProductionStableWasmRuntime<TBoundary> {
  const runtimeReceiptSha256 = digestCanonical(
    RUNTIME_RECEIPT_DIGEST_DOMAIN,
    receipt,
  );
  const propose = Object.freeze(
    (parentValue: Readonly<FloodgateTrainingParent>) => {
      let parent: Readonly<CapturedParent>;
      try {
        parent = captureParent(parentValue);
      } catch (primary) {
        return rejectedNativePromise<
          Readonly<FloodgateProductionStableWasmRuntimeResult<TBoundary>>
        >(runtimeFailure("proposal", primary));
      }
      let pending: unknown;
      try {
        pending = Reflect.apply(pool.propose, undefined, [
          projectParentForReusablePool(parent),
        ]);
      } catch (primary) {
        return rejectedNativePromise<
          Readonly<FloodgateProductionStableWasmRuntimeResult<TBoundary>>
        >(runtimeFailure("proposal", primary));
      }
      return transformNativePromise(
        guardNativePromise<Readonly<FloodgateStableWasmProposalRow>>(
          pending,
          "reusable pool.propose",
        ),
        (rowValue) => {
          try {
            const row = captureProposalRow(rowValue, parent);
            return frozenRecord({
              schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
              row,
              runtime_binding: frozenRecord({
                claim_boundary:
                  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
                execution_boundary: receipt.execution_boundary,
                runtime_receipt_sha256: runtimeReceiptSha256,
                reusable_pool_receipt_sha256: pool.receiptSha256,
                parent_payload_sha256: parent.parent_payload_sha256,
                row_sha256: digestCanonical(RESULT_ROW_DIGEST_DOMAIN, row),
                origin: "direct-owning-runtime-capability-call-v1" as const,
                plain_result_authentication_claim: false as const,
              }),
            });
          } catch (primary) {
            throw runtimeFailure("proposal", primary);
          }
        },
        (primary) => {
          throw runtimeFailure("proposal", primary);
        },
      );
    },
  );
  const close = Object.freeze(() => {
    try {
      return transformNativePromise(
        guardNativePromise<void>(
          Reflect.apply(pool.close, undefined, []),
          "reusable pool.close",
        ),
        () => undefined,
        (primary) => {
          throw runtimeFailure("cleanup", primary);
        },
      );
    } catch (primary) {
      return rejectedNativePromise<void>(runtimeFailure("cleanup", primary));
    }
  });
  return frozenRecord({ receipt, propose, close });
}

async function createRuntimeInternal<
  TBoundary extends FloodgateProductionStableWasmRuntimeExecutionBoundary,
  TAssetBoundary extends AssetAuthorityExecutionBoundary,
>(value: {
  readonly executionBoundary: TBoundary;
  readonly assetBoundary: TAssetBoundary;
  readonly requirePinnedProductionAssets: boolean;
  readonly assetProvider: <TResult>(
    callback: FloodgateProductionStableRuntimeAssetsCallback<
      TResult,
      TAssetBoundary
    >,
  ) => Promise<TResult>;
  readonly poolFactory: ReusablePoolFactory;
}): Promise<FloodgateProductionStableWasmRuntime<TBoundary>> {
  let callbackCount = 0;
  let phase: FloodgateProductionStableWasmRuntimePhase = "asset-authority";
  let callbackResult:
    FloodgateProductionStableWasmRuntime<TBoundary> | undefined;
  let createdPoolClose:
    FloodgateStableWasmReusableProposalPool["close"] | undefined;
  try {
    const providerResult = await guardNativePromise<
      FloodgateProductionStableWasmRuntime<TBoundary>
    >(
      Reflect.apply(value.assetProvider, undefined, [
        async (
          assetValue: Readonly<
            FloodgateProductionStableRuntimeAssets<TAssetBoundary>
          >,
        ) => {
          callbackCount += 1;
          if (callbackCount !== 1)
            fail("asset provider invoked its callback more than once");
          phase = "asset-authority";
          const assets = captureAuthorityAndAssets(
            assetValue,
            value.assetBoundary,
            value.requirePinnedProductionAssets,
          );
          const searchAssets = frozenRecord({
            wasmBytes: assets.wasm,
            weightsBytes: assets.weights,
            workerSourceBytes: assets.worker,
          });
          let poolValue: unknown;
          let operationFailure: unknown;
          try {
            phase = "pool-initialization";
            poolValue = await guardNativePromise(
              Reflect.apply(value.poolFactory, undefined, [
                searchAssets,
                FIXED_POOL_OPTIONS,
              ]),
              "reusable pool factory",
            );
            createdPoolClose = captureReusablePoolCleanup(poolValue);
            const pool = captureReusablePool(poolValue, assets);
            const receipt = buildRuntimeReceipt(
              value.executionBoundary,
              value.assetBoundary,
              assets,
              pool.receiptSha256,
            );
            const facade = createFacade(pool, receipt);
            callbackResult = facade;
            phase = "asset-authority";
            return facade;
          } catch (primary) {
            operationFailure = primary;
            throw primary;
          } finally {
            const zeroizeFailures = zeroAssetCopies(assets);
            if (zeroizeFailures.length > 0) {
              phase = "cleanup";
              throw new AggregateError(
                operationFailure === undefined
                  ? zeroizeFailures
                  : [operationFailure, ...zeroizeFailures],
                "runtime-owned asset copy zeroization failed",
              );
            }
          }
        },
      ]),
      "asset provider",
    );
    if (callbackCount !== 1 || callbackResult === undefined)
      fail("asset provider did not invoke its callback exactly once");
    if (providerResult !== callbackResult)
      fail("asset provider replaced the callback result");
    return providerResult;
  } catch (primary) {
    if (createdPoolClose === undefined) throw runtimeFailure(phase, primary);
    try {
      await guardNativePromise(
        Reflect.apply(createdPoolClose, undefined, []),
        "reusable pool.close after initialization failure",
      );
    } catch (cleanupFailure) {
      throw runtimeFailure(
        "cleanup",
        new AggregateError(
          [primary, cleanupFailure],
          "runtime initialization and cleanup both failed",
        ),
      );
    }
    throw runtimeFailure(phase, primary);
  }
}

/** Dependency-injected synthetic boundary; fixed production options remain fixed. */
export function createFloodgateProductionStableWasmRuntimeCoreForTests(
  dependencies: FloodgateProductionStableWasmRuntimeCoreDependencies,
): Promise<
  FloodgateProductionStableWasmRuntime<"test-only-injected-asset-provider-and-pool-factory">
> {
  let captured: FloodgateProductionStableWasmRuntimeCoreDependencies;
  try {
    const input = strictRecord(
      dependencies,
      ["assetProvider", "poolFactory"],
      "test runtime dependencies",
    );
    if (
      typeof input.assetProvider !== "function" ||
      nodeUtilTypes.isProxy(input.assetProvider) ||
      typeof input.poolFactory !== "function" ||
      nodeUtilTypes.isProxy(input.poolFactory)
    ) {
      fail("test runtime dependencies must be non-Proxy functions");
    }
    captured = frozenRecord({
      assetProvider: input.assetProvider as TestAssetProvider,
      poolFactory: input.poolFactory as ReusablePoolFactory,
    });
  } catch (primary) {
    return rejectedNativePromise(runtimeFailure("capture", primary));
  }
  return createRuntimeInternal({
    executionBoundary:
      "test-only-injected-asset-provider-and-pool-factory" as const,
    assetBoundary: "test-only-injected-expected-registry-and-root" as const,
    requirePinnedProductionAssets: false,
    assetProvider: captured.assetProvider,
    poolFactory: captured.poolFactory,
  });
}

/** Create the fixed production stable-WASM capability. No injection is accepted. */
export function createFloodgateProductionStableWasmRuntime(): Promise<
  FloodgateProductionStableWasmRuntime<"production-fixed-asset-authority-and-reusable-pool">
> {
  if (arguments.length !== 0) {
    return rejectedNativePromise(
      runtimeFailure(
        "capture",
        new Error("production stable-WASM runtime accepts no arguments"),
      ),
    );
  }
  return createRuntimeInternal({
    executionBoundary:
      "production-fixed-asset-authority-and-reusable-pool" as const,
    assetBoundary: "production-fixed-registry-and-deployment-root" as const,
    requirePinnedProductionAssets: true,
    assetProvider: withVerifiedPinnedFloodgateProductionStableRuntimeAssets,
    poolFactory: createFloodgateStableWasmReusableProposalPool,
  });
}
