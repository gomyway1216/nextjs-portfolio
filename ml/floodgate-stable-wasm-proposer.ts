/**
 * Synthetic-only, pathless stable-WASM proposal primitive.
 *
 * This module deliberately exports no production runner.  Its test core accepts
 * the structural shape emitted by the authenticated Floodgate consumer, copies
 * every byte input before its first await, and returns an in-memory artifact.
 * A later runner must synchronously claim the real consumer input, authorize a
 * private stage, and add authenticated/durable publication around this core.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { posix as pathPosix, win32 as pathWin32 } from "node:path";
import type { Writable } from "node:stream";
import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
} from "./floodgate-role-bundle-result";
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from "./floodgate-role-bundle";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingInputBinding,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-consumer";
import { toSfen } from "./generate-teacher";
import {
  childSfenAfterUsi,
  positionFromSfen,
  resolveUsiMove,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

export const FLOODGATE_STABLE_WASM_WORKER_SCHEMA =
  "shogi-floodgate-stable-wasm-worker-v1" as const;
export const FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA =
  "shogi-floodgate-stable-wasm-proposal-row-v1" as const;
export const FLOODGATE_STABLE_WASM_PROPOSER_RECEIPT_SCHEMA =
  "shogi-floodgate-stable-wasm-proposer-receipt-v1" as const;
export const FLOODGATE_STABLE_WASM_PROPOSER_STATUS =
  "complete-in-memory-dependency-injected-test-core-not-engine-authenticated-not-durable-not-published" as const;
export const FLOODGATE_STABLE_WASM_PROPOSER_CLAIM_BOUNDARY =
  "stable-candidate-structure-only-not-search-authentication-teacher-label-or-playing-strength-evidence" as const;
export const FLOODGATE_STABLE_WASM_OUTPUT_FORMAT =
  "canonical-jsonl-utf8-single-final-lf-v1" as const;
export const FLOODGATE_STABLE_WASM_SCORE_ENCODING =
  "wasm-v20-raw-parent-perspective-mate-band-v1" as const;

export const FLOODGATE_FRESH_SIBLING_PLAN_BYTES = 10_890;
export const FLOODGATE_FRESH_SIBLING_PLAN_SHA256 =
  "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af";
export const FLOODGATE_STABLE_WASM_BYTES = 35_597;
export const FLOODGATE_STABLE_WASM_SHA256 =
  "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c";
export const FLOODGATE_STABLE_WEIGHTS_BYTES = 1_185_988;
export const FLOODGATE_STABLE_WEIGHTS_SHA256 =
  "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc";
export const FLOODGATE_STABLE_WORKER_SOURCE_BYTES = 19_216;
export const FLOODGATE_STABLE_WORKER_SOURCE_SHA256 =
  "d21e347268fa0830882a7f8fb40893aeeed0425f8d92519b26a13444efc467e3";

export const FLOODGATE_STABLE_REQUESTED_DEPTH = 11;
export const FLOODGATE_STABLE_QUIESCENCE_DEPTH = 10;
export const FLOODGATE_STABLE_MATE_SCORE_MIN = 89_990_000;
export const FLOODGATE_STABLE_MATE_SCORE_MAX = 90_000_000;
export const FLOODGATE_STABLE_MAX_WORKERS = 12;
export const FLOODGATE_STABLE_MAX_ROWS = 24_000;

const NativeError = Error;
const NativePromise = Promise;
const NativeString = String;
const NativeTextDecoder = TextDecoder;
const NativeUint8Array = Uint8Array;
const NativeSet = Set;
const nativeClearTimeout = clearTimeout;
const nativeSetTimeout = setTimeout;
const arrayIsArray = Array.isArray;
const nativeArrayJoin = Array.prototype.join;
const nativeArrayMap = Array.prototype.map;
const nativeArraySome = Array.prototype.some;
const nativeArraySort = Array.prototype.sort;
const nativeCreateHash = createHash;
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const bufferCompare = Buffer.compare.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const nativeBufferToString = Buffer.prototype.toString;
const isNativePromise = nodeUtilTypes.isPromise.bind(nodeUtilTypes);
const isProxy = nodeUtilTypes.isProxy.bind(nodeUtilTypes);
const isSharedArrayBuffer =
  nodeUtilTypes.isSharedArrayBuffer.bind(nodeUtilTypes);
const isUint8Array = nodeUtilTypes.isUint8Array.bind(nodeUtilTypes);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectIs = Object.is;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nativeHashPrototype = objectGetPrototypeOf(
  nativeCreateHash("sha256"),
) as {
  digest: (encoding: "hex") => string;
  update: (value: Uint8Array | string) => unknown;
};
const nativeHashDigest = nativeHashPrototype.digest;
const nativeHashUpdate = nativeHashPrototype.update;
const nativePromiseThen = Promise.prototype.then;
const nativeRegExpTest = RegExp.prototype.test;
const nativeSetAdd = Set.prototype.add;
const nativeSetHas = Set.prototype.has;
const nativeSetSize = Object.getOwnPropertyDescriptor(
  Set.prototype,
  "size",
)?.get;
const nativeStringIncludes = String.prototype.includes;
const nativeStringIndexOf = String.prototype.indexOf;
const nativeStringSlice = String.prototype.slice;
const nativeStringTrim = String.prototype.trim;
const nativeStringToUpperCase = String.prototype.toUpperCase;
const nativeStringFromCharCode = String.fromCharCode.bind(String);
const pathPosixIsAbsolute = pathPosix.isAbsolute.bind(pathPosix);
const pathPosixParse = pathPosix.parse.bind(pathPosix);
const pathWin32IsAbsolute = pathWin32.isAbsolute.bind(pathWin32);
const pathWin32Normalize = pathWin32.normalize.bind(pathWin32);
const pathWin32Parse = pathWin32.parse.bind(pathWin32);
const typedArrayPrototype = objectGetPrototypeOf(Uint8Array.prototype);
const nativeTypedArrayBuffer = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const nativeTypedArrayByteLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const nativeTypedArraySet = typedArrayPrototype.set as (
  source: ArrayLike<number>,
  offset?: number,
) => void;

const SHA256_RE = /^[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/;
const WORKER_STDOUT_LINE_MAX_BYTES = 4_096;
const WORKER_STDERR_MAX_BYTES = 8_192;
const WORKER_SHUTDOWN_TIMEOUT_MILLISECONDS = 5_000;
const WORKER_BOOTSTRAP_SOURCE =
  'import { readFileSync } from "node:fs";' +
  "const source=readFileSync(3);" +
  'const encoded=Buffer.from(source).toString("base64");' +
  'await import("data:text/javascript;base64,"+encoded);';
const WINDOWS_DRIVE_RE = /^[A-Za-z]:$/;

const INPUT_KEYS = objectFreeze(["binding", "role", "rows", "schema"] as const);
const BINDING_KEYS = objectFreeze([
  "bundle_manifest_bytes",
  "bundle_manifest_sha256",
  "bundle_producer_revision",
  "game_ids_sha256",
  "games",
  "parent_ids_sha256",
  "position_ids_count",
  "position_ids_sha256",
  "raw_bytes",
  "raw_format",
  "raw_sha256",
  "records",
  "result_receipt_bytes",
  "result_receipt_sha256",
  "verifier_revision",
] as const);
const PARENT_KEYS = objectFreeze([
  "game_id",
  "parent_id",
  "parent_sfen",
  "played_move",
  "ply",
  "position_id",
  "schema_version",
] as const);
const ASSET_KEYS = objectFreeze([
  "embeddedWasmBytes",
  "planBytes",
  "wasmBytes",
  "weightsBytes",
  "workerSourceBytes",
] as const);
const OPTION_KEYS = objectFreeze([
  "searchTimeoutMilliseconds",
  "startupTimeoutMilliseconds",
  "workers",
] as const);
const DEPENDENCY_KEYS = objectFreeze(["search"] as const);
const RAW_RESULT_KEYS = objectFreeze([
  "completed_depth",
  "index",
  "leaves",
  "nodes",
  "packed_move",
  "raw_search_score",
] as const);

export type FloodgateStableWasmTermination =
  "requested-depth-complete" | "winning-mate-band-early";

export interface FloodgateStableWasmProposerAssets {
  readonly planBytes: Uint8Array;
  readonly wasmBytes: Uint8Array;
  readonly embeddedWasmBytes: Uint8Array;
  readonly weightsBytes: Uint8Array;
  readonly workerSourceBytes: Uint8Array;
}

export interface FloodgateStableWasmProposerOptions {
  readonly workers: number;
  readonly startupTimeoutMilliseconds: number;
  readonly searchTimeoutMilliseconds: number;
}

export interface FloodgateStableWasmSearchRequest {
  readonly index: number;
  readonly board: readonly number[];
  readonly hands: readonly number[];
  readonly side_to_move: number;
  readonly root_tesu: number;
}

export interface FloodgateStableWasmRawSearchResult {
  readonly index: number;
  readonly packed_move: number;
  readonly raw_search_score: number;
  readonly completed_depth: number;
  readonly nodes: number;
  readonly leaves: number;
}

export interface FloodgateStableWasmSearchAssets {
  readonly wasmBytes: Uint8Array;
  readonly weightsBytes: Uint8Array;
  readonly workerSourceBytes: Uint8Array;
}

export interface FloodgateStableWasmSearchResultBox {
  readonly results: readonly Readonly<FloodgateStableWasmRawSearchResult>[];
}

export interface FloodgateStableWasmWorkerSourceIdentity {
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateStableWasmProposerDependencies {
  readonly search: (
    requests: readonly Readonly<FloodgateStableWasmSearchRequest>[],
    assets: Readonly<FloodgateStableWasmSearchAssets>,
    options: Readonly<FloodgateStableWasmProposerOptions>,
  ) => Promise<Readonly<FloodgateStableWasmSearchResultBox>>;
}

export interface FloodgateStableWasmProposalRow {
  readonly schema: typeof FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA;
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_payload_sha256: string;
  readonly stable_move: string;
  readonly child_sfen: string;
  readonly child_position_id: string;
  readonly search: Readonly<{
    readonly requested_depth: typeof FLOODGATE_STABLE_REQUESTED_DEPTH;
    readonly completed_depth: number;
    readonly termination: FloodgateStableWasmTermination;
    readonly raw_search_score: number;
    readonly score_encoding: typeof FLOODGATE_STABLE_WASM_SCORE_ENCODING;
    readonly nodes: number;
    readonly leaves: number;
    readonly root_tesu: number;
  }>;
}

export interface FloodgateStableWasmProposalArtifact {
  readonly rows: readonly Readonly<FloodgateStableWasmProposalRow>[];
  readonly jsonl: string;
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receipt_json: string;
}

interface CapturedAssets {
  readonly planBytes: Uint8Array;
  readonly wasmBytes: Uint8Array;
  readonly embeddedWasmBytes: Uint8Array;
  readonly weightsBytes: Uint8Array;
  readonly workerSourceBytes: Uint8Array;
}

interface CapturedInput {
  readonly binding: Readonly<FloodgateTrainingInputBinding>;
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
  readonly inputRowsSha256: string;
}

function fail(message: string): never {
  throw new NativeError(`invalid Floodgate stable-WASM proposer: ${message}`);
}

function compareBytewise(left: string, right: string): number {
  return bufferCompare(bufferFrom(left, "utf8"), bufferFrom(right, "utf8"));
}

function arrayMap<T, U>(
  values: readonly T[],
  callback: (value: T, index: number) => U,
): U[] {
  return reflectApply(nativeArrayMap, values, [callback]) as U[];
}

function arraySome<T>(
  values: readonly T[],
  callback: (value: T, index: number) => boolean,
): boolean {
  return reflectApply(nativeArraySome, values, [callback]) as boolean;
}

function arraySort<T>(
  values: T[],
  compare?: (left: T, right: T) => number,
): T[] {
  return reflectApply(nativeArraySort, values, [compare]) as T[];
}

function arrayJoin(values: readonly unknown[], separator: string): string {
  return reflectApply(nativeArrayJoin, values, [separator]) as string;
}

function arraySetOwn<T>(values: T[], index: number, value: T): void {
  objectDefineProperty(values, NativeString(index), {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function arrayAppendOwn<T>(values: T[], value: T): void {
  arraySetOwn(values, values.length, value);
}

function setAdd<T>(values: Set<T>, value: T): void {
  reflectApply(nativeSetAdd, values, [value]);
}

function setHas<T>(values: Set<T>, value: T): boolean {
  return reflectApply(nativeSetHas, values, [value]) as boolean;
}

function setSize(values: Set<unknown>): number {
  if (nativeSetSize === undefined)
    fail("native Set size getter is unavailable");
  return reflectApply(nativeSetSize, values, []) as number;
}

function regexTest(expression: RegExp, value: string): boolean {
  return reflectApply(nativeRegExpTest, expression, [value]) as boolean;
}

function identifierDigest(values: readonly string[]): string {
  const unique = new NativeSet<string>();
  const captured: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (setHas(unique, value)) continue;
    setAdd(unique, value);
    arrayAppendOwn(captured, value);
  }
  arraySort(captured, compareBytewise);
  return sha256Hex(arrayJoin(captured, "\n"));
}

function sha256Hex(value: Uint8Array | string): string {
  const hash = nativeCreateHash("sha256");
  reflectApply(nativeHashUpdate, hash, [value]);
  return reflectApply(nativeHashDigest, hash, ["hex"]) as string;
}

function positionKeyFromCanonicalSfen(sfen: string): string {
  const firstSpace = reflectApply(nativeStringIndexOf, sfen, [" "]) as number;
  const secondSpace = reflectApply(nativeStringIndexOf, sfen, [
    " ",
    firstSpace + 1,
  ]) as number;
  const thirdSpace = reflectApply(nativeStringIndexOf, sfen, [
    " ",
    secondSpace + 1,
  ]) as number;
  const fourthSpace = reflectApply(nativeStringIndexOf, sfen, [
    " ",
    thirdSpace + 1,
  ]) as number;
  if (
    firstSpace < 1 ||
    secondSpace <= firstSpace + 1 ||
    thirdSpace <= secondSpace + 1 ||
    thirdSpace >= sfen.length - 1 ||
    fourthSpace !== -1
  ) {
    fail("canonical SFEN must contain exactly four non-empty fields");
  }
  const canonicalPosition = reflectApply(nativeStringSlice, sfen, [
    0,
    thirdSpace,
  ]) as string;
  return `sha256:${sha256Hex(`sfen-v1\0${canonicalPosition}`)}`;
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const keys = objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: (value as Record<string, unknown>)[key],
    });
  }
  return objectFreeze(output);
}

function frozenList<T>(values: T[]): readonly T[] {
  return objectFreeze(values);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return jsonStringify(value);
  }
  if (typeof value === "number") {
    if (!numberIsFinite(value) || objectIs(value, -0)) {
      fail("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return jsonStringify(value);
  }
  if (arrayIsArray(value)) {
    const captured = strictArray(value, "canonical JSON array");
    return `[${arrayJoin(
      arrayMap(captured, (entry) => canonicalJson(entry)),
      ",",
    )}]`;
  }
  if (value !== null && typeof value === "object") {
    if (isProxy(value)) fail("canonical JSON rejects Proxy objects");
    const prototype = objectGetPrototypeOf(value);
    if (prototype !== objectPrototype && prototype !== null) {
      fail("canonical JSON rejects non-plain objects");
    }
    const descriptors = objectGetOwnPropertyDescriptors(value);
    const keys = reflectOwnKeys(descriptors);
    if (arraySome(keys, (key) => typeof key !== "string")) {
      fail("canonical JSON rejects symbol keys");
    }
    const strings = arraySort(keys as string[], compareBytewise);
    return `{${arrayJoin(
      arrayMap(strings, (key) => {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          fail(`canonical JSON property ${key} is not enumerable data`);
        }
        return `${jsonStringify(key)}:${canonicalJson(descriptor.value)}`;
      }),
      ",",
    )}}`;
  }
  return fail(`canonical JSON rejects ${typeof value}`);
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    arrayIsArray(value) ||
    isProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    fail(`${label} must be a non-Proxy plain object`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  const keys = reflectOwnKeys(descriptors);
  if (arraySome(keys, (key) => typeof key !== "string")) {
    fail(`${label} must not contain symbol keys`);
  }
  const actual = arraySort(keys as string[], compareBytewise);
  const expected: string[] = [];
  for (let index = 0; index < expectedKeys.length; index += 1) {
    arraySetOwn(expected, index, expectedKeys[index]);
  }
  arraySort(expected, compareBytewise);
  if (
    actual.length !== expected.length ||
    arraySome(actual, (key, index) => key !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
  const captured = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < expected.length; index += 1) {
    const key = expected[index];
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable own data property`);
    }
    captured[key] = descriptor.value;
  }
  return objectFreeze(captured);
}

function strictArray(
  value: unknown,
  label: string,
  expectedLength?: number,
  maximumLength = FLOODGATE_STABLE_MAX_ROWS,
): readonly unknown[] {
  if (
    !arrayIsArray(value) ||
    isProxy(value) ||
    objectGetPrototypeOf(value) !== arrayPrototype
  ) {
    fail(`${label} must be a non-Proxy ordinary array`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !numberIsSafeInteger(lengthDescriptor.value) ||
    (lengthDescriptor.value as number) < 0
  ) {
    fail(`${label}.length is invalid`);
  }
  const length = lengthDescriptor.value as number;
  if (
    length > maximumLength ||
    (expectedLength !== undefined && length !== expectedLength)
  ) {
    fail(`${label}.length is outside its exact safety bound`);
  }
  const keys = reflectOwnKeys(descriptors);
  if (
    arraySome(keys, (key) => typeof key !== "string") ||
    keys.length !== length + 1
  ) {
    fail(`${label} must be dense and contain no extra properties`);
  }
  const captured: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[NativeString(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}[${index}] must be an enumerable own data property`);
    }
    arraySetOwn(captured, index, descriptor.value);
  }
  return frozenList(captured);
}

function captureExactDefinedArray<T>(
  values: T[],
  expectedLength: number,
  label: string,
): readonly T[] {
  const captured = strictArray(values, label, expectedLength) as readonly T[];
  for (let index = 0; index < captured.length; index += 1) {
    if (captured[index] === undefined) {
      fail(`${label} omits an assigned index`);
    }
  }
  return captured;
}

function copyBytes(
  value: unknown,
  label: string,
  expectedBytes: number,
): Uint8Array {
  if (
    !isUint8Array(value) ||
    isProxy(value) ||
    nativeTypedArrayBuffer === undefined ||
    nativeTypedArrayByteLength === undefined
  ) {
    fail(`${label} must be a non-Proxy Uint8Array`);
  }
  let byteLength: number;
  let buffer: ArrayBufferLike;
  try {
    byteLength = reflectApply(nativeTypedArrayByteLength, value, []) as number;
    buffer = reflectApply(nativeTypedArrayBuffer, value, []) as ArrayBufferLike;
  } catch {
    return fail(`${label} must be a non-Proxy Uint8Array`);
  }
  if (isSharedArrayBuffer(buffer)) {
    fail(`${label} must not use SharedArrayBuffer backing storage`);
  }
  if (byteLength !== expectedBytes) {
    fail(`${label} byte length is outside its exact safety bound`);
  }
  const copy = new NativeUint8Array(byteLength);
  reflectApply(nativeTypedArraySet, copy, [value as ArrayLike<number>, 0]);
  return copy;
}

function verifyIdentity(
  bytes: Uint8Array,
  expectedBytes: number,
  expectedSha256: string,
  label: string,
): void {
  if (
    bytes.byteLength !== expectedBytes ||
    sha256Hex(bytes) !== expectedSha256
  ) {
    fail(`${label} identity is not pinned`);
  }
}

function captureAssets(
  value: FloodgateStableWasmProposerAssets,
): CapturedAssets {
  const input = strictRecord(value, ASSET_KEYS, "assets");
  const captured = frozenRecord({
    planBytes: copyBytes(
      input.planBytes,
      "assets.planBytes",
      FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
    ),
    wasmBytes: copyBytes(
      input.wasmBytes,
      "assets.wasmBytes",
      FLOODGATE_STABLE_WASM_BYTES,
    ),
    embeddedWasmBytes: copyBytes(
      input.embeddedWasmBytes,
      "assets.embeddedWasmBytes",
      FLOODGATE_STABLE_WASM_BYTES,
    ),
    weightsBytes: copyBytes(
      input.weightsBytes,
      "assets.weightsBytes",
      FLOODGATE_STABLE_WEIGHTS_BYTES,
    ),
    workerSourceBytes: copyBytes(
      input.workerSourceBytes,
      "assets.workerSourceBytes",
      FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
    ),
  });
  verifyIdentity(
    captured.planBytes,
    FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
    FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    "fresh-sibling plan",
  );
  verifyIdentity(
    captured.wasmBytes,
    FLOODGATE_STABLE_WASM_BYTES,
    FLOODGATE_STABLE_WASM_SHA256,
    "tracked WASM",
  );
  verifyIdentity(
    captured.embeddedWasmBytes,
    FLOODGATE_STABLE_WASM_BYTES,
    FLOODGATE_STABLE_WASM_SHA256,
    "embedded WASM",
  );
  if (bufferCompare(captured.wasmBytes, captured.embeddedWasmBytes) !== 0) {
    fail("tracked and embedded WASM bytes differ");
  }
  verifyIdentity(
    captured.weightsBytes,
    FLOODGATE_STABLE_WEIGHTS_BYTES,
    FLOODGATE_STABLE_WEIGHTS_SHA256,
    "stable weights",
  );
  verifyIdentity(
    captured.workerSourceBytes,
    FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
    FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
    "stable worker source",
  );
  try {
    new NativeTextDecoder("utf-8", { fatal: true }).decode(
      captured.workerSourceBytes,
    );
  } catch {
    fail("stable worker source is not fatal-valid UTF-8");
  }
  return captured;
}

function captureOptions(
  value: FloodgateStableWasmProposerOptions,
): Readonly<FloodgateStableWasmProposerOptions> {
  const input = strictRecord(value, OPTION_KEYS, "options");
  if (
    !numberIsSafeInteger(input.workers) ||
    (input.workers as number) < 1 ||
    (input.workers as number) > FLOODGATE_STABLE_MAX_WORKERS
  ) {
    fail(
      `options.workers must be between 1 and ${FLOODGATE_STABLE_MAX_WORKERS}`,
    );
  }
  const timeoutKeys = [
    "startupTimeoutMilliseconds",
    "searchTimeoutMilliseconds",
  ] as const;
  for (let index = 0; index < timeoutKeys.length; index += 1) {
    const key = timeoutKeys[index];
    if (
      !numberIsSafeInteger(input[key]) ||
      (input[key] as number) < 1 ||
      (input[key] as number) > 600_000
    ) {
      fail(`options.${key} must be an integer from 1 through 600000`);
    }
  }
  return frozenRecord({
    workers: input.workers as number,
    startupTimeoutMilliseconds: input.startupTimeoutMilliseconds as number,
    searchTimeoutMilliseconds: input.searchTimeoutMilliseconds as number,
  });
}

function captureDependencies(
  value: FloodgateStableWasmProposerDependencies,
): Readonly<FloodgateStableWasmProposerDependencies> {
  const input = strictRecord(value, DEPENDENCY_KEYS, "dependencies");
  if (typeof input.search !== "function" || isProxy(input.search)) {
    fail("dependencies.search must be a non-Proxy function");
  }
  return frozenRecord({
    search: input.search as FloodgateStableWasmProposerDependencies["search"],
  });
}

function requiredDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !regexTest(SHA256_RE, value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  if (!numberIsSafeInteger(value) || (value as number) <= 0) {
    fail(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256Hex(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function captureBinding(
  value: unknown,
): Readonly<FloodgateTrainingInputBinding> {
  const binding = strictRecord(value, BINDING_KEYS, "input.binding");
  if (
    binding.result_receipt_bytes !==
      FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES ||
    binding.result_receipt_sha256 !==
      FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256 ||
    binding.bundle_manifest_bytes !==
      FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.bytes ||
    binding.bundle_manifest_sha256 !==
      FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.sha256 ||
    binding.raw_format !== FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT
  ) {
    fail("input.binding does not bind the pinned role-bundle receipts");
  }
  const revisionKeys = [
    "bundle_producer_revision",
    "verifier_revision",
  ] as const;
  for (let index = 0; index < revisionKeys.length; index += 1) {
    const key = revisionKeys[index];
    if (
      typeof binding[key] !== "string" ||
      !regexTest(REVISION_RE, binding[key])
    ) {
      fail(`input.binding.${key} is not a pinned revision shape`);
    }
  }
  const digestKeys = [
    "raw_sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
  ] as const;
  for (let index = 0; index < digestKeys.length; index += 1) {
    const key = digestKeys[index];
    requiredDigest(binding[key], `input.binding.${key}`);
  }
  const countKeys = [
    "raw_bytes",
    "records",
    "games",
    "position_ids_count",
  ] as const;
  for (let index = 0; index < countKeys.length; index += 1) {
    const key = countKeys[index];
    requiredPositiveInteger(binding[key], `input.binding.${key}`);
  }
  if (
    (binding.records as number) > FLOODGATE_STABLE_MAX_ROWS ||
    (binding.position_ids_count as number) > FLOODGATE_STABLE_MAX_ROWS ||
    (binding.games as number) > FLOODGATE_STABLE_MAX_ROWS
  ) {
    fail("input.binding aggregate counts exceed the proposer safety bound");
  }
  return frozenRecord({
    result_receipt_bytes: binding.result_receipt_bytes as number,
    result_receipt_sha256: binding.result_receipt_sha256 as string,
    bundle_manifest_bytes: binding.bundle_manifest_bytes as number,
    bundle_manifest_sha256: binding.bundle_manifest_sha256 as string,
    bundle_producer_revision: binding.bundle_producer_revision as string,
    verifier_revision: binding.verifier_revision as string,
    raw_format:
      binding.raw_format as typeof FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    raw_bytes: binding.raw_bytes as number,
    raw_sha256: binding.raw_sha256 as string,
    records: binding.records as number,
    games: binding.games as number,
    game_ids_sha256: binding.game_ids_sha256 as string,
    parent_ids_sha256: binding.parent_ids_sha256 as string,
    position_ids_count: binding.position_ids_count as number,
    position_ids_sha256: binding.position_ids_sha256 as string,
  });
}

function captureParent(
  value: unknown,
  index: number,
): Readonly<FloodgateTrainingParent> {
  const row = strictRecord(value, PARENT_KEYS, `input.rows[${index}]`);
  if (row.schema_version !== 1) {
    fail(`input.rows[${index}].schema_version must be 1`);
  }
  const semanticIdKeys = ["game_id", "parent_id", "position_id"] as const;
  for (let keyIndex = 0; keyIndex < semanticIdKeys.length; keyIndex += 1) {
    const key = semanticIdKeys[keyIndex];
    if (typeof row[key] !== "string" || !regexTest(SEMANTIC_ID_RE, row[key])) {
      fail(`input.rows[${index}].${key} is not a semantic ID`);
    }
  }
  if (
    !numberIsSafeInteger(row.ply) ||
    (row.ply as number) < 0 ||
    (row.ply as number) > 2_147_483_647
  ) {
    fail(`input.rows[${index}].ply is outside the i32-safe range`);
  }
  const ply = row.ply as number;
  if (row.parent_id !== parentOccurrenceId(row.game_id as string, ply)) {
    fail(`input.rows[${index}].parent_id does not match game_id and ply`);
  }
  const textKeys = ["parent_sfen", "played_move"] as const;
  for (let keyIndex = 0; keyIndex < textKeys.length; keyIndex += 1) {
    const key = textKeys[keyIndex];
    if (
      typeof row[key] !== "string" ||
      row[key] === "" ||
      reflectApply(nativeStringTrim, row[key], []) !== row[key] ||
      (reflectApply(nativeStringIncludes, row[key], ["\0"]) as boolean)
    ) {
      fail(`input.rows[${index}].${key} is not a canonical non-empty string`);
    }
  }
  const parentSfen = row.parent_sfen as string;
  let parsed: ReturnType<typeof positionFromSfen>;
  try {
    parsed = positionFromSfen(parentSfen);
  } catch (error) {
    fail(`input.rows[${index}].parent_sfen is invalid: ${NativeString(error)}`);
  }
  if (
    toSfen(parsed.position, parsed.moveNumber) !== parentSfen ||
    parsed.moveNumber !== ply + 1 ||
    positionKeyFromCanonicalSfen(parentSfen) !== row.position_id
  ) {
    fail(`input.rows[${index}] SFEN binding is inconsistent`);
  }
  const legal = rulesCompleteLegalMoves(parsed.position);
  if (
    legal.length === 0 ||
    !arraySome(
      legal,
      (move) =>
        move.usi === row.played_move && getKomashu(move.move.capture) !== OU,
    )
  ) {
    fail(`input.rows[${index}] has no legal played move`);
  }
  return frozenRecord({
    schema_version: 1 as const,
    game_id: row.game_id as string,
    parent_id: row.parent_id as string,
    position_id: row.position_id as string,
    parent_sfen: parentSfen,
    ply,
    played_move: row.played_move as string,
  });
}

function parentCanonicalPayload(
  row: Readonly<FloodgateTrainingParent>,
): string {
  return canonicalJson(
    frozenRecord({
      schema_version: row.schema_version,
      game_id: row.game_id,
      parent_id: row.parent_id,
      position_id: row.position_id,
      parent_sfen: row.parent_sfen,
      ply: row.ply,
      played_move: row.played_move,
    }),
  );
}

function captureInput(
  value: AuthenticatedFloodgateTrainingRows,
): CapturedInput {
  const input = strictRecord(value, INPUT_KEYS, "input");
  if (
    input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    input.role !== "training"
  ) {
    fail("input schema or role is unsupported");
  }
  const binding = captureBinding(input.binding);
  const rowValues = strictArray(input.rows, "input.rows");
  if (rowValues.length !== binding.records) {
    fail("input row count does not match binding.records");
  }
  const rows = arrayMap(rowValues, (row, index) => captureParent(row, index));
  const gameIds = new NativeSet<string>();
  const parentIds = new NativeSet<string>();
  const positionIds = new NativeSet<string>();
  const gameIdValues: string[] = [];
  const parentIdValues: string[] = [];
  const positionIdValues: string[] = [];
  let previousParentId: string | undefined;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (
      previousParentId !== undefined &&
      compareBytewise(previousParentId, row.parent_id) >= 0
    ) {
      fail("input rows are not in strict parent_id byte order");
    }
    previousParentId = row.parent_id;
    if (
      setHas(parentIds, row.parent_id) ||
      setHas(positionIds, row.position_id)
    ) {
      fail("input rows contain a duplicate parent or semantic position");
    }
    if (!setHas(gameIds, row.game_id))
      arrayAppendOwn(gameIdValues, row.game_id);
    setAdd(gameIds, row.game_id);
    setAdd(parentIds, row.parent_id);
    setAdd(positionIds, row.position_id);
    arrayAppendOwn(parentIdValues, row.parent_id);
    arrayAppendOwn(positionIdValues, row.position_id);
  }
  if (
    setSize(gameIds) !== binding.games ||
    setSize(parentIds) !== binding.records ||
    setSize(positionIds) !== binding.position_ids_count ||
    identifierDigest(gameIdValues) !== binding.game_ids_sha256 ||
    identifierDigest(parentIdValues) !== binding.parent_ids_sha256 ||
    identifierDigest(positionIdValues) !== binding.position_ids_sha256
  ) {
    fail("input aggregate identity does not match its binding");
  }
  const inputJsonl = `${arrayJoin(arrayMap(rows, parentCanonicalPayload), "\n")}\n`;
  const inputRowsSha256 = sha256Hex(
    `shogi-floodgate-stable-proposer-input-v1\0${inputJsonl}`,
  );
  return frozenRecord({
    binding,
    rows: frozenList(rows),
    inputRowsSha256,
  });
}

function buildSearchRequest(
  row: Readonly<FloodgateTrainingParent>,
  index: number,
): Readonly<FloodgateStableWasmSearchRequest> {
  const { position } = positionFromSfen(row.parent_sfen);
  const board: number[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      arrayAppendOwn(board, position.ban[(file << 4) + rank] | 0);
    }
  }
  const hands: number[] = [];
  for (let piece = 17; piece <= 39; piece += 1) {
    arrayAppendOwn(hands, position.hand[piece] | 0);
  }
  return frozenRecord({
    index,
    board: frozenList(board),
    hands: frozenList(hands),
    side_to_move: position.teban,
    root_tesu: row.ply,
  });
}

function pinNativePromise<T>(value: Promise<T>): Promise<T> {
  objectDefineProperty(value, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: NativePromise,
  });
  return value;
}

function guardNativePromise<T>(value: unknown, label: string): Promise<T> {
  const guarded = new NativePromise<T>((resolve, reject) => {
    try {
      if (!isNativePromise(value)) {
        throw new NativeError(`${label} returned a non-native Promise`);
      }
      reflectApply(nativePromiseThen, value, [resolve, reject]);
    } catch {
      reject(
        new NativeError(
          `invalid Floodgate stable-WASM proposer: ${label} must return a native Promise`,
        ),
      );
    }
  });
  return pinNativePromise(guarded);
}

function waitAllVoid(values: readonly Promise<unknown>[]): Promise<void> {
  const completion = new NativePromise<void>((resolve, reject) => {
    if (values.length === 0) {
      resolve();
      return;
    }
    let remaining = values.length;
    let settled = false;
    for (let index = 0; index < values.length; index += 1) {
      reflectApply(nativePromiseThen, values[index], [
        () => {
          if (settled) return;
          remaining -= 1;
          if (remaining === 0) {
            settled = true;
            resolve();
          }
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(error);
        },
      ]);
    }
  });
  return pinNativePromise(completion);
}

function settleAllVoid(values: readonly Promise<unknown>[]): Promise<void> {
  const completion = new NativePromise<void>((resolve) => {
    if (values.length === 0) {
      resolve();
      return;
    }
    let remaining = values.length;
    const settledOne = () => {
      remaining -= 1;
      if (remaining === 0) resolve();
    };
    for (let index = 0; index < values.length; index += 1) {
      reflectApply(nativePromiseThen, values[index], [settledOne, settledOne]);
    }
  });
  return pinNativePromise(completion);
}

function captureRawResult(
  value: unknown,
  rowCount: number,
  label: string,
): Readonly<FloodgateStableWasmRawSearchResult> {
  const result = strictRecord(value, RAW_RESULT_KEYS, label);
  const numericKeys = [
    "index",
    "packed_move",
    "raw_search_score",
    "completed_depth",
    "nodes",
    "leaves",
  ] as const;
  for (let keyIndex = 0; keyIndex < numericKeys.length; keyIndex += 1) {
    const key = numericKeys[keyIndex];
    if (!numberIsSafeInteger(result[key])) {
      fail(`${label}.${key} must be a safe integer`);
    }
  }
  const index = result.index as number;
  const packedMove = result.packed_move as number;
  const rawSearchScore = result.raw_search_score as number;
  const completedDepth = result.completed_depth as number;
  const nodes = result.nodes as number;
  const leaves = result.leaves as number;
  if (index < 0 || index >= rowCount) fail(`${label}.index is unassigned`);
  if (packedMove <= 0 || packedMove > 0x7fffff) {
    fail(`${label}.packed_move contains zero or unused high bits`);
  }
  if (
    rawSearchScore < -FLOODGATE_STABLE_MATE_SCORE_MAX ||
    rawSearchScore > FLOODGATE_STABLE_MATE_SCORE_MAX ||
    nodes < 0 ||
    nodes > 2_147_483_647 ||
    leaves < 0 ||
    leaves > 2_147_483_647
  ) {
    fail(`${label} score or observed i32 counters are invalid`);
  }
  if (nodes + leaves === 0) {
    fail(`${label} contains empty observed search counters`);
  }
  if (
    completedDepth !== FLOODGATE_STABLE_REQUESTED_DEPTH &&
    !(
      completedDepth >= 1 &&
      completedDepth < FLOODGATE_STABLE_REQUESTED_DEPTH &&
      rawSearchScore >= FLOODGATE_STABLE_MATE_SCORE_MIN &&
      rawSearchScore <= FLOODGATE_STABLE_MATE_SCORE_MAX
    )
  ) {
    fail(`${label} is neither depth-complete nor a winning-mate early exit`);
  }
  return frozenRecord({
    index,
    packed_move: packedMove,
    raw_search_score: rawSearchScore,
    completed_depth: completedDepth,
    nodes,
    leaves,
  });
}

function captureSearchResultBox(
  value: unknown,
  rowCount: number,
): readonly Readonly<FloodgateStableWasmRawSearchResult>[] {
  const box = strictRecord(value, ["results"], "search result box");
  const rawResults = strictArray(
    box.results,
    "search result box.results",
    rowCount,
  );
  if (rawResults.length !== rowCount) {
    fail("search result count does not match input rows");
  }
  const results: Readonly<FloodgateStableWasmRawSearchResult>[] = [];
  const seen = new NativeSet<number>();
  for (let index = 0; index < rawResults.length; index += 1) {
    const result = captureRawResult(
      rawResults[index],
      rowCount,
      `search result box.results[${index}]`,
    );
    if (setHas(seen, result.index))
      fail("search results contain a duplicate index");
    setAdd(seen, result.index);
    arraySetOwn(results, result.index, result);
  }
  return captureExactDefinedArray(results, rowCount, "captured search results");
}

function packedMoveToUsi(packedMove: number, parentSfen: string): string {
  const piece = packedMove & 0x3f;
  const from = (packedMove >> 6) & 0xff;
  const to = (packedMove >> 14) & 0xff;
  const promote = ((packedMove >> 22) & 1) === 1;
  const toFile = to >> 4;
  const toRank = to & 0x0f;
  if (toFile < 1 || toFile > 9 || toRank < 1 || toRank > 9) {
    fail("packed move destination is outside the board");
  }
  let usi: string;
  if (from === 0) {
    const dropLetters = ["", "P", "L", "N", "S", "G", "B", "R"];
    const letter = dropLetters[piece & 0x0f];
    if (letter === undefined || letter === "" || promote) {
      fail("packed drop has an invalid piece or promotion bit");
    }
    usi = `${letter}*${toFile}${nativeStringFromCharCode(96 + toRank)}`;
  } else {
    const fromFile = from >> 4;
    const fromRank = from & 0x0f;
    if (fromFile < 1 || fromFile > 9 || fromRank < 1 || fromRank > 9) {
      fail("packed move origin is outside the board");
    }
    usi = `${fromFile}${nativeStringFromCharCode(96 + fromRank)}${toFile}${nativeStringFromCharCode(96 + toRank)}${promote ? "+" : ""}`;
  }
  const { position } = positionFromSfen(parentSfen);
  let resolved: ReturnType<typeof resolveUsiMove>;
  try {
    resolved = resolveUsiMove(position, usi);
  } catch (error) {
    fail(`packed move is not rules-complete legal: ${NativeString(error)}`);
  }
  if ((resolved.koma & 0x3f) !== piece) {
    fail("packed move piece does not match the legal parent position");
  }
  if (getKomashu(resolved.capture) === OU) {
    fail("packed move attempts to capture the opposing king");
  }
  return usi;
}

function buildProposalRow(
  parent: Readonly<FloodgateTrainingParent>,
  result: Readonly<FloodgateStableWasmRawSearchResult>,
): Readonly<FloodgateStableWasmProposalRow> {
  const stableMove = packedMoveToUsi(result.packed_move, parent.parent_sfen);
  const childSfen = childSfenAfterUsi(parent.parent_sfen, stableMove);
  const termination: FloodgateStableWasmTermination =
    result.completed_depth === FLOODGATE_STABLE_REQUESTED_DEPTH
      ? "requested-depth-complete"
      : "winning-mate-band-early";
  return frozenRecord({
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: sha256Hex(
      `shogi-floodgate-stable-parent-v1\0${parentCanonicalPayload(parent)}`,
    ),
    stable_move: stableMove,
    child_sfen: childSfen,
    child_position_id: positionKeyFromCanonicalSfen(childSfen),
    search: frozenRecord({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: result.completed_depth,
      termination,
      raw_search_score: result.raw_search_score,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: result.nodes,
      leaves: result.leaves,
      root_tesu: parent.ply,
    }),
  });
}

function assetIdentity(
  bytes: number,
  sha256: string,
): Readonly<Record<string, unknown>> {
  return frozenRecord({ bytes, sha256 });
}

function semanticSearchContract(): Readonly<Record<string, unknown>> {
  return frozenRecord({
    book: false,
    external_mate_solver: false,
    fallback: "forbidden",
    max_time_ms: 0,
    requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
    quiescence_depth: FLOODGATE_STABLE_QUIESCENCE_DEPTH,
    search_start_depth: 1,
    root_tesu: "input-ply",
    private_tt: "cleared-before-every-parent",
    shared_tt: false,
    nnue: frozenRecord({
      enabled: true,
      buckets: 1,
      k: 600,
      output_scale: "1/1",
    }),
    early_completion:
      "depth-1-through-10-only-for-winning-score-89990000-through-90000000",
    score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  });
}

async function generateArtifact(
  input: CapturedInput,
  assets: CapturedAssets,
  options: Readonly<FloodgateStableWasmProposerOptions>,
  dependencies: Readonly<FloodgateStableWasmProposerDependencies>,
): Promise<Readonly<FloodgateStableWasmProposalArtifact>> {
  const requests = frozenList(
    arrayMap(input.rows, (row, index) => buildSearchRequest(row, index)),
  );
  const searchAssets = frozenRecord({
    wasmBytes: copyBytes(
      assets.wasmBytes,
      "captured WASM",
      FLOODGATE_STABLE_WASM_BYTES,
    ),
    weightsBytes: copyBytes(
      assets.weightsBytes,
      "captured weights",
      FLOODGATE_STABLE_WEIGHTS_BYTES,
    ),
    workerSourceBytes: copyBytes(
      assets.workerSourceBytes,
      "captured worker source",
      FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
    ),
  });
  const searchPromise = reflectApply(dependencies.search, undefined, [
    requests,
    searchAssets,
    options,
  ]);
  const resultBox = await guardNativePromise<
    Readonly<FloodgateStableWasmSearchResultBox>
  >(searchPromise, "dependencies.search");
  const results = captureSearchResultBox(resultBox, input.rows.length);
  const rows = frozenList(
    arrayMap(input.rows, (parent, index) =>
      buildProposalRow(parent, results[index]),
    ),
  );
  const jsonl = `${arrayJoin(
    arrayMap(rows, (row) => canonicalJson(row)),
    "\n",
  )}\n`;
  const parentIdValues = arrayMap(rows, (row) => row.parent_id);
  const childPositionIdValues = arrayMap(rows, (row) => row.child_position_id);
  const outputIdentity = frozenRecord({
    format: FLOODGATE_STABLE_WASM_OUTPUT_FORMAT,
    records: rows.length,
    bytes: bufferByteLength(jsonl, "utf8"),
    sha256: sha256Hex(jsonl),
    parent_ids_sha256: identifierDigest(parentIdValues),
    child_position_ids_sha256: identifierDigest(childPositionIdValues),
  });
  const searchContract = semanticSearchContract();
  const engineIdentity = frozenRecord({
    worker_source: assetIdentity(
      FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
      FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
    ),
    wasm: assetIdentity(
      FLOODGATE_STABLE_WASM_BYTES,
      FLOODGATE_STABLE_WASM_SHA256,
    ),
    embedded_wasm: assetIdentity(
      FLOODGATE_STABLE_WASM_BYTES,
      FLOODGATE_STABLE_WASM_SHA256,
    ),
    weights: frozenRecord({
      bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
      sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
      k: 600,
      buckets: 1,
    }),
  });
  const runFingerprintPayload = frozenRecord({
    authenticated_training_binding: input.binding,
    input_rows_sha256: input.inputRowsSha256,
    plan: assetIdentity(
      FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    ),
    supplied_engine_assets: engineIdentity,
    required_search_contract: searchContract,
  });
  const runFingerprint = sha256Hex(
    `shogi-floodgate-stable-proposer-run-v1\0${canonicalJson(runFingerprintPayload)}`,
  );
  const receipt = frozenRecord({
    schema: FLOODGATE_STABLE_WASM_PROPOSER_RECEIPT_SCHEMA,
    status: FLOODGATE_STABLE_WASM_PROPOSER_STATUS,
    claim_boundary: FLOODGATE_STABLE_WASM_PROPOSER_CLAIM_BOUNDARY,
    input: frozenRecord({
      authenticated_training_binding: input.binding,
      input_rows_sha256: input.inputRowsSha256,
      records: input.rows.length,
    }),
    preregistered_plan: assetIdentity(
      FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    ),
    supplied_engine_assets: engineIdentity,
    required_search_contract: searchContract,
    execution_boundary:
      "dependency-injected-search-adapter-not-authenticated-by-this-receipt",
    semantic_run_fingerprint_sha256: runFingerprint,
    operational: frozenRecord({
      workers: options.workers,
      startup_timeout_ms: options.startupTimeoutMilliseconds,
      search_timeout_ms: options.searchTimeoutMilliseconds,
      node_version: process.version,
      counters: "observed-signed-i32-nonnegative-v1",
    }),
    output: outputIdentity,
  });
  return frozenRecord({
    rows,
    jsonl,
    receipt,
    receipt_json: `${canonicalJson(receipt)}\n`,
  });
}

/**
 * Structural, dependency-injected test core.  It cannot claim production
 * consumer provenance and writes no file.  All argument capture is synchronous.
 */
export function generateFloodgateStableWasmProposalsCoreForTests(
  inputValue: AuthenticatedFloodgateTrainingRows,
  assetValue: FloodgateStableWasmProposerAssets,
  optionValue: FloodgateStableWasmProposerOptions,
  dependencyValue: FloodgateStableWasmProposerDependencies,
): Promise<Readonly<FloodgateStableWasmProposalArtifact>> {
  let input: CapturedInput;
  let assets: CapturedAssets;
  let options: Readonly<FloodgateStableWasmProposerOptions>;
  let dependencies: Readonly<FloodgateStableWasmProposerDependencies>;
  try {
    input = captureInput(inputValue);
    assets = captureAssets(assetValue);
    options = captureOptions(optionValue);
    dependencies = captureDependencies(dependencyValue);
  } catch (error) {
    return pinNativePromise(NativePromise.reject(error));
  }
  return pinNativePromise(
    generateArtifact(input, assets, options, dependencies),
  );
}

export interface FloodgateStableWasmChildRuntime {
  readonly cwd: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

export function captureFloodgateStableWasmChildRuntimeCoreForTests(
  platform: string,
  executablePath: string,
  systemRoot?: string,
  systemDrive?: string,
): Readonly<FloodgateStableWasmChildRuntime> {
  if (
    typeof platform !== "string" ||
    platform === "" ||
    (reflectApply(nativeStringIncludes, platform, ["\0"]) as boolean) ||
    typeof executablePath !== "string" ||
    executablePath === "" ||
    (reflectApply(nativeStringIncludes, executablePath, ["\0"]) as boolean)
  ) {
    fail("child runtime platform or executable path is invalid");
  }
  const windows = platform === "win32";
  const isAbsolute = windows ? pathWin32IsAbsolute : pathPosixIsAbsolute;
  const parsePath = windows ? pathWin32Parse : pathPosixParse;
  if (!isAbsolute(executablePath)) {
    fail("child runtime executable path must be absolute");
  }
  const cwd = parsePath(executablePath).root;
  if (cwd === "") fail("child runtime executable has no filesystem root");

  const environment = objectCreate(null) as NodeJS.ProcessEnv;
  if (windows) {
    if (
      typeof systemRoot !== "string" ||
      typeof systemDrive !== "string" ||
      !pathWin32IsAbsolute(systemRoot) ||
      pathWin32Normalize(systemRoot) !== systemRoot ||
      !regexTest(WINDOWS_DRIVE_RE, systemDrive) ||
      (reflectApply(nativeStringIncludes, systemRoot, ["\0"]) as boolean) ||
      (reflectApply(nativeStringIncludes, systemDrive, ["\0"]) as boolean)
    ) {
      fail("Windows child runtime bootstrap environment is invalid");
    }
    const systemRootDrive = reflectApply(
      nativeStringSlice,
      systemRoot,
      [0, 2],
    ) as string;
    const normalizedRootDrive = reflectApply(
      nativeStringToUpperCase,
      systemRootDrive,
      [],
    ) as string;
    const normalizedSystemDrive = reflectApply(
      nativeStringToUpperCase,
      systemDrive,
      [],
    ) as string;
    if (normalizedRootDrive !== normalizedSystemDrive) {
      fail("Windows child runtime drives do not match");
    }
    objectDefineProperty(environment, "SystemRoot", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: systemRoot,
    });
    objectDefineProperty(environment, "SystemDrive", {
      configurable: false,
      enumerable: true,
      writable: false,
      value: systemDrive,
    });
  }
  objectFreeze(environment);
  return frozenRecord({ cwd, env: environment });
}

const stableWasmChildRuntime =
  captureFloodgateStableWasmChildRuntimeCoreForTests(
    process.platform,
    process.execPath,
    process.env.SystemRoot,
    process.env.SystemDrive,
  );

interface PendingWorkerResponse {
  readonly label: string;
  readonly resolve: (line: string) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

class StableWasmWorkerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private stdout = "";
  private stderr = "";
  private stderrBytes = 0;
  private pending: PendingWorkerResponse | undefined;
  private failure: Error | undefined;
  private gracefulClosing = false;
  private closePromise: Promise<void>;
  private resolveClose!: () => void;

  constructor(sourceBytes: Uint8Array) {
    this.closePromise = pinNativePromise(
      new NativePromise<void>((resolve) => {
        this.resolveClose = resolve;
      }),
    );
    this.child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", WORKER_BOOTSTRAP_SOURCE],
      {
        cwd: stableWasmChildRuntime.cwd,
        env: stableWasmChildRuntime.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe", "pipe"],
      },
    );
    this.child.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => this.onStderr(chunk));
    this.child.on("error", (error) =>
      this.failWorker(`process error: ${error.message}`),
    );
    this.child.stdin.on("error", (error) =>
      this.failWorker(`stdin error: ${error.message}`),
    );
    this.child.on("close", (code, signal) => {
      this.resolveClose();
      if (
        !this.gracefulClosing ||
        code !== 0 ||
        signal !== null ||
        this.stdout !== ""
      ) {
        this.failWorker(
          `process closed (code=${NativeString(code)}, signal=${NativeString(signal)})`,
        );
      }
    });
    const sourcePipe = this.child.stdio[3] as Writable | null | undefined;
    if (sourcePipe === null || sourcePipe === undefined) {
      this.failWorker("has no worker-source pipe");
      return;
    }
    sourcePipe.once("error", (error) =>
      this.failWorker(`worker-source pipe error: ${error.message}`),
    );
    sourcePipe.end(sourceBytes);
  }

  private diagnostic(message: string): Error {
    const detail = reflectApply(nativeStringTrim, this.stderr, []) as string;
    return new NativeError(
      `stable-WASM worker ${message}${detail === "" ? "" : `; stderr: ${detail}`}`,
    );
  }

  private failWorker(message: string): void {
    if (this.failure === undefined) this.failure = this.diagnostic(message);
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) {
      nativeClearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    if (
      this.child.pid !== undefined &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    ) {
      this.child.kill("SIGKILL");
    }
  }

  private onStdout(chunk: Buffer): void {
    if (this.failure !== undefined) return;
    if (chunk.byteLength > WORKER_STDOUT_LINE_MAX_BYTES - this.stdout.length) {
      this.failWorker("exceeded the stdout line bound");
      return;
    }
    for (let index = 0; index < chunk.byteLength; index += 1) {
      const byte = chunk[index];
      if (byte !== 0x0a && (byte < 0x20 || byte > 0x7e)) {
        this.failWorker("emitted non-canonical stdout bytes");
        return;
      }
    }
    this.stdout += reflectApply(nativeBufferToString, chunk, [
      "ascii",
    ]) as string;
    if (bufferByteLength(this.stdout, "ascii") > WORKER_STDOUT_LINE_MAX_BYTES) {
      this.failWorker("exceeded the stdout line bound");
      return;
    }
    let newline = reflectApply(nativeStringIndexOf, this.stdout, [
      "\n",
    ]) as number;
    while (newline >= 0) {
      const line = reflectApply(nativeStringSlice, this.stdout, [
        0,
        newline,
      ]) as string;
      this.stdout = reflectApply(nativeStringSlice, this.stdout, [
        newline + 1,
      ]) as string;
      const pending = this.pending;
      if (pending === undefined || line === "") {
        this.failWorker("emitted an unsolicited or empty stdout frame");
        return;
      }
      this.pending = undefined;
      nativeClearTimeout(pending.timer);
      pending.resolve(line);
      newline = reflectApply(nativeStringIndexOf, this.stdout, [
        "\n",
      ]) as number;
    }
  }

  private onStderr(chunk: Buffer): void {
    if (this.failure !== undefined) return;
    if (chunk.byteLength > WORKER_STDERR_MAX_BYTES - this.stderrBytes) {
      this.failWorker("exceeded the stderr bound");
      return;
    }
    this.stderr += reflectApply(nativeBufferToString, chunk, [
      "utf8",
    ]) as string;
    this.stderrBytes += chunk.byteLength;
  }

  private waitForClose(timeout: number, label: string): Promise<void> {
    const completion = new NativePromise<void>((resolve, reject) => {
      let settled = false;
      const timer = nativeSetTimeout(() => {
        if (settled) return;
        settled = true;
        const error = this.diagnostic(`${label} timed out after ${timeout}ms`);
        if (this.failure === undefined) this.failure = error;
        if (
          this.child.pid !== undefined &&
          this.child.exitCode === null &&
          this.child.signalCode === null
        ) {
          this.child.kill("SIGKILL");
        }
        reject(error);
      }, timeout);
      reflectApply(nativePromiseThen, this.closePromise, [
        () => {
          if (settled) return;
          settled = true;
          nativeClearTimeout(timer);
          resolve();
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          nativeClearTimeout(timer);
          reject(error);
        },
      ]);
    });
    return pinNativePromise(completion);
  }

  private async writeLine(line: string): Promise<void> {
    if (this.failure !== undefined) throw this.failure;
    await new NativePromise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.child.stdin.off("drain", onDrain);
        reject(error);
      };
      const onDrain = () => {
        this.child.stdin.off("error", onError);
        resolve();
      };
      this.child.stdin.once("error", onError);
      const writable = this.child.stdin.write(`${line}\n`);
      if (writable) {
        this.child.stdin.off("error", onError);
        resolve();
      } else {
        this.child.stdin.once("drain", onDrain);
      }
    });
  }

  request(
    message: Readonly<Record<string, unknown>>,
    timeout: number,
    label: string,
  ): Promise<string> {
    if (this.pending !== undefined) {
      return pinNativePromise(
        NativePromise.reject(this.diagnostic("already has a pending request")),
      );
    }
    if (this.failure !== undefined)
      return pinNativePromise(NativePromise.reject(this.failure));
    const line = canonicalJson(message);
    const response = new NativePromise<string>((resolve, reject) => {
      const timer = nativeSetTimeout(() => {
        this.pending = undefined;
        const error = this.diagnostic(`${label} timed out after ${timeout}ms`);
        this.failure = error;
        reject(error);
        this.child.kill("SIGKILL");
      }, timeout);
      this.pending = frozenRecord({ label, resolve, reject, timer });
      const writePromise = this.writeLine(line);
      reflectApply(nativePromiseThen, writePromise, [
        undefined,
        (error: unknown) => {
          if (this.pending?.timer === timer) {
            this.pending = undefined;
            nativeClearTimeout(timer);
            const failure = this.diagnostic(
              `${label} write failed: ${NativeString(error)}`,
            );
            this.failure = failure;
            reject(failure);
            this.child.kill("SIGKILL");
          }
        },
      ]);
    });
    return pinNativePromise(response);
  }

  async initialize(
    assets: Readonly<FloodgateStableWasmSearchAssets>,
    timeout: number,
  ): Promise<void> {
    const line = await this.request(
      frozenRecord({
        schema: FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
        type: "init",
        wasm_base64: reflectApply(
          nativeBufferToString,
          bufferFrom(assets.wasmBytes),
          ["base64"],
        ) as string,
        weights_base64: reflectApply(
          nativeBufferToString,
          bufferFrom(assets.weightsBytes),
          ["base64"],
        ) as string,
      }),
      timeout,
      "initialization",
    );
    const message = parseCanonicalWorkerLine(line, [
      "node_version",
      "schema",
      "type",
      "wasm_sha256",
      "weights_sha256",
    ]);
    if (
      message.schema !== FLOODGATE_STABLE_WASM_WORKER_SCHEMA ||
      message.type !== "ready" ||
      message.node_version !== process.version ||
      message.wasm_sha256 !== FLOODGATE_STABLE_WASM_SHA256 ||
      message.weights_sha256 !== FLOODGATE_STABLE_WEIGHTS_SHA256
    ) {
      fail("worker ready receipt does not bind the pinned runtime assets");
    }
  }

  async search(
    request: Readonly<FloodgateStableWasmSearchRequest>,
    timeout: number,
  ): Promise<Readonly<FloodgateStableWasmRawSearchResult>> {
    const requestPayload = frozenRecord({
      schema: FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
      type: "search",
      index: request.index,
      board: request.board,
      hands: request.hands,
      side_to_move: request.side_to_move,
      root_tesu: request.root_tesu,
    });
    const requestSha256 = sha256Hex(
      `shogi-floodgate-stable-wasm-worker-request-v1\0${canonicalJson(requestPayload)}`,
    );
    const line = await this.request(
      frozenRecord({
        ...requestPayload,
        request_sha256: requestSha256,
      }),
      timeout,
      `search ${request.index}`,
    );
    const message = parseCanonicalWorkerLine(line, [
      "completed_depth",
      "index",
      "leaves",
      "nodes",
      "packed_move",
      "raw_search_score",
      "request_sha256",
      "schema",
      "type",
    ]);
    if (
      message.schema !== FLOODGATE_STABLE_WASM_WORKER_SCHEMA ||
      message.type !== "result" ||
      message.request_sha256 !== requestSha256
    ) {
      fail("worker search response schema, type, or request digest is invalid");
    }
    return captureRawResult(
      frozenRecord({
        index: message.index,
        packed_move: message.packed_move,
        raw_search_score: message.raw_search_score,
        completed_depth: message.completed_depth,
        nodes: message.nodes,
        leaves: message.leaves,
      }),
      Number.MAX_SAFE_INTEGER,
      "worker result",
    );
  }

  async quit(): Promise<void> {
    if (this.failure !== undefined) throw this.failure;
    this.gracefulClosing = true;
    const line = await this.request(
      frozenRecord({
        schema: FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
        type: "quit",
      }),
      WORKER_SHUTDOWN_TIMEOUT_MILLISECONDS,
      "shutdown",
    );
    const message = parseCanonicalWorkerLine(line, ["schema", "type"]);
    if (
      message.schema !== FLOODGATE_STABLE_WASM_WORKER_SCHEMA ||
      message.type !== "bye"
    ) {
      fail("worker shutdown response is invalid");
    }
    this.child.stdin.end();
    await this.waitForClose(
      WORKER_SHUTDOWN_TIMEOUT_MILLISECONDS,
      "shutdown close",
    );
    if (this.stderr !== "")
      fail("worker emitted stderr during a successful run");
    if (this.failure !== undefined) throw this.failure;
  }

  async forceStop(): Promise<void> {
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) {
      nativeClearTimeout(pending.timer);
      pending.reject(this.diagnostic("was force-stopped"));
    }
    if (
      this.child.pid !== undefined &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    ) {
      this.child.kill("SIGKILL");
    }
    await this.waitForClose(
      WORKER_SHUTDOWN_TIMEOUT_MILLISECONDS,
      "force-stop close",
    );
  }
}

function parseCanonicalWorkerLine(
  line: string,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = jsonParse(line);
  } catch {
    fail("worker response is not JSON");
  }
  const message = strictRecord(parsed, keys, "worker response");
  if (canonicalJson(message) !== line) {
    fail("worker response is not canonical JSON");
  }
  return message;
}

function capturePoolRequests(
  value: readonly Readonly<FloodgateStableWasmSearchRequest>[],
): readonly Readonly<FloodgateStableWasmSearchRequest>[] {
  const rows = strictArray(value, "worker-pool requests");
  if (rows.length === 0) fail("worker-pool requests must not be empty");
  return frozenList(
    arrayMap(rows, (entry, index) => {
      const request = strictRecord(
        entry,
        ["board", "hands", "index", "root_tesu", "side_to_move"],
        `worker-pool requests[${index}]`,
      );
      if (request.index !== index)
        fail("worker-pool request indexes must be dense");
      const board = strictArray(
        request.board,
        `worker-pool requests[${index}].board`,
        81,
      );
      const hands = strictArray(
        request.hands,
        `worker-pool requests[${index}].hands`,
        23,
      );
      if (board.length !== 81 || hands.length !== 23) {
        fail("worker-pool board or hand vector has the wrong length");
      }
      const checkedBoard = arrayMap(board, (piece) => {
        if (
          !numberIsSafeInteger(piece) ||
          (piece as number) < 0 ||
          (piece as number) > 63
        ) {
          fail("worker-pool board contains an invalid piece");
        }
        return piece as number;
      });
      const checkedHands = arrayMap(hands, (count) => {
        if (
          !numberIsSafeInteger(count) ||
          (count as number) < 0 ||
          (count as number) > 18
        ) {
          fail("worker-pool hands contain an invalid count");
        }
        return count as number;
      });
      if (
        (request.side_to_move !== 16 && request.side_to_move !== 32) ||
        !numberIsSafeInteger(request.root_tesu) ||
        (request.root_tesu as number) < 0 ||
        (request.root_tesu as number) > 2_147_483_647
      ) {
        fail("worker-pool side or root tesu is invalid");
      }
      return frozenRecord({
        index,
        board: frozenList(checkedBoard),
        hands: frozenList(checkedHands),
        side_to_move: request.side_to_move as number,
        root_tesu: request.root_tesu as number,
      });
    }),
  );
}

function capturePoolAssets(
  value: Readonly<FloodgateStableWasmSearchAssets>,
  expectedWorkerSource: Readonly<FloodgateStableWasmWorkerSourceIdentity>,
): Readonly<FloodgateStableWasmSearchAssets> {
  const assets = strictRecord(
    value,
    ["wasmBytes", "weightsBytes", "workerSourceBytes"],
    "worker-pool assets",
  );
  const wasmBytes = copyBytes(
    assets.wasmBytes,
    "worker-pool WASM",
    FLOODGATE_STABLE_WASM_BYTES,
  );
  const weightsBytes = copyBytes(
    assets.weightsBytes,
    "worker-pool weights",
    FLOODGATE_STABLE_WEIGHTS_BYTES,
  );
  const workerSourceBytes = copyBytes(
    assets.workerSourceBytes,
    "worker-pool worker source",
    expectedWorkerSource.bytes,
  );
  verifyIdentity(
    wasmBytes,
    FLOODGATE_STABLE_WASM_BYTES,
    FLOODGATE_STABLE_WASM_SHA256,
    "worker-pool WASM",
  );
  verifyIdentity(
    weightsBytes,
    FLOODGATE_STABLE_WEIGHTS_BYTES,
    FLOODGATE_STABLE_WEIGHTS_SHA256,
    "worker-pool weights",
  );
  verifyIdentity(
    workerSourceBytes,
    expectedWorkerSource.bytes,
    expectedWorkerSource.sha256,
    "worker-pool worker source",
  );
  return frozenRecord({ wasmBytes, weightsBytes, workerSourceBytes });
}

function runCapturedWorkerPool(
  requests: readonly Readonly<FloodgateStableWasmSearchRequest>[],
  assets: Readonly<FloodgateStableWasmSearchAssets>,
  options: Readonly<FloodgateStableWasmProposerOptions>,
): Promise<Readonly<FloodgateStableWasmSearchResultBox>> {
  const run = async (): Promise<
    Readonly<FloodgateStableWasmSearchResultBox>
  > => {
    const clients: StableWasmWorkerClient[] = [];
    const workerCount =
      options.workers < requests.length ? options.workers : requests.length;
    for (let index = 0; index < workerCount; index += 1) {
      arraySetOwn(
        clients,
        index,
        new StableWasmWorkerClient(assets.workerSourceBytes),
      );
    }
    const results: Readonly<FloodgateStableWasmRawSearchResult>[] = [];
    let nextIndex = 0;
    try {
      const initializations: Promise<void>[] = [];
      for (let index = 0; index < clients.length; index += 1) {
        arraySetOwn(
          initializations,
          index,
          clients[index].initialize(assets, options.startupTimeoutMilliseconds),
        );
      }
      await waitAllVoid(initializations);
      const loops: Promise<void>[] = [];
      for (
        let workerIndex = 0;
        workerIndex < clients.length;
        workerIndex += 1
      ) {
        const client = clients[workerIndex];
        arraySetOwn(
          loops,
          workerIndex,
          (async () => {
            while (true) {
              const index = nextIndex;
              nextIndex += 1;
              if (index >= requests.length) return;
              const result = await client.search(
                requests[index],
                options.searchTimeoutMilliseconds,
              );
              if (result.index !== index)
                fail("worker returned an unassigned request index");
              arraySetOwn(results, index, result);
            }
          })(),
        );
      }
      try {
        await waitAllVoid(loops);
      } catch (error) {
        const stops: Promise<void>[] = [];
        for (let index = 0; index < clients.length; index += 1) {
          arraySetOwn(stops, index, clients[index].forceStop());
        }
        await settleAllVoid(stops);
        await settleAllVoid(loops);
        throw error;
      }
      const quits: Promise<void>[] = [];
      for (let index = 0; index < clients.length; index += 1) {
        arraySetOwn(quits, index, clients[index].quit());
      }
      await waitAllVoid(quits);
    } catch (error) {
      const stops: Promise<void>[] = [];
      for (let index = 0; index < clients.length; index += 1) {
        arraySetOwn(stops, index, clients[index].forceStop());
      }
      await settleAllVoid(stops);
      throw error;
    }
    const capturedResults = captureExactDefinedArray(
      results,
      requests.length,
      "worker pool result coverage",
    );
    return frozenRecord({ results: capturedResults });
  };
  return pinNativePromise(run());
}

function captureWorkerSourceIdentity(
  value: FloodgateStableWasmWorkerSourceIdentity,
): Readonly<FloodgateStableWasmWorkerSourceIdentity> {
  const identity = strictRecord(
    value,
    ["bytes", "sha256"],
    "worker source identity",
  );
  if (
    !numberIsSafeInteger(identity.bytes) ||
    (identity.bytes as number) <= 0 ||
    (identity.bytes as number) > 128 * 1024 ||
    typeof identity.sha256 !== "string" ||
    !regexTest(SHA256_RE, identity.sha256)
  ) {
    fail("worker source identity is invalid");
  }
  return frozenRecord({
    bytes: identity.bytes as number,
    sha256: identity.sha256 as string,
  });
}

function runWorkerPoolWithIdentity(
  requestValue: readonly Readonly<FloodgateStableWasmSearchRequest>[],
  assetValue: Readonly<FloodgateStableWasmSearchAssets>,
  optionValue: Readonly<FloodgateStableWasmProposerOptions>,
  identityValue: FloodgateStableWasmWorkerSourceIdentity,
): Promise<Readonly<FloodgateStableWasmSearchResultBox>> {
  let requests: readonly Readonly<FloodgateStableWasmSearchRequest>[];
  let assets: Readonly<FloodgateStableWasmSearchAssets>;
  let options: Readonly<FloodgateStableWasmProposerOptions>;
  try {
    const identity = captureWorkerSourceIdentity(identityValue);
    requests = capturePoolRequests(requestValue);
    assets = capturePoolAssets(assetValue, identity);
    options = captureOptions(optionValue);
  } catch (error) {
    return pinNativePromise(NativePromise.reject(error));
  }
  return runCapturedWorkerPool(requests, assets, options);
}

/** Actual pinned child-process pool, still only a test-core building block. */
export function runFloodgateStableWasmWorkerPoolCoreForTests(
  requestValue: readonly Readonly<FloodgateStableWasmSearchRequest>[],
  assetValue: Readonly<FloodgateStableWasmSearchAssets>,
  optionValue: Readonly<FloodgateStableWasmProposerOptions>,
): Promise<Readonly<FloodgateStableWasmSearchResultBox>> {
  return runWorkerPoolWithIdentity(
    requestValue,
    assetValue,
    optionValue,
    frozenRecord({
      bytes: FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
      sha256: FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
    }),
  );
}

/**
 * Adversarial transport seam. It keeps exact content addressing but permits a
 * synthetic worker so timeout/crash/protocol cleanup can be exercised.
 */
export function runFloodgateStableWasmWorkerPoolWithSourceCoreForTests(
  requestValue: readonly Readonly<FloodgateStableWasmSearchRequest>[],
  assetValue: Readonly<FloodgateStableWasmSearchAssets>,
  optionValue: Readonly<FloodgateStableWasmProposerOptions>,
  workerSourceIdentity: FloodgateStableWasmWorkerSourceIdentity,
): Promise<Readonly<FloodgateStableWasmSearchResultBox>> {
  return runWorkerPoolWithIdentity(
    requestValue,
    assetValue,
    optionValue,
    workerSourceIdentity,
  );
}
