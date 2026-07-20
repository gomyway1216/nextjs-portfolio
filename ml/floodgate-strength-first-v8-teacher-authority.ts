/**
 * Append-only strength-first v8 authority.
 *
 * The pinned asset verifier remains the legacy v1 authority whose historical
 * runtime policy fixes Hash 64 MiB. This wrapper preserves that receipt as an
 * asset-provenance leaf while issuing the distinct v8 execution policy used by
 * the strength-first runner. It never executes an engine or reads teacher data.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
  verifyPinnedFloodgateProductionTeacherAssets,
  type FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
  type FloodgateProductionTeacherAssetAuthorityReceipt,
} from "./floodgate-production-teacher-asset-authority";

export const FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT =
  "shogi-floodgate-strength-first-v8-teacher-authority-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS =
  "verified-pinned-v1-assets-and-strength-first-v8-execution-policy" as const;
export const FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY =
  "nested-v1-asset-provenance-and-v8-search-policy-not-engine-execution-teacher-completion-training-holdout-or-playing-strength-evidence" as const;

export const FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME = Object.freeze({
  parallel_engines: 12 as const,
  threads_per_engine: 1 as const,
  hash_mb_per_engine: 512 as const,
  timeout_ms_per_search: 600_000 as const,
  proposal: Object.freeze({ multipv: 12 as const, depth: 16 as const }),
  independent_rescore: Object.freeze({
    multipv: 1 as const,
    searchmoves: "exactly-one-candidate" as const,
    depth: 16 as const,
  }),
});

export interface FloodgateStrengthFirstV8TeacherAuthorityReceipt<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary =
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT;
  readonly status: typeof FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS;
  readonly claim_boundary: typeof FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY;
  readonly execution_boundary: TExecutionBoundary;
  readonly asset_authority: Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>
  >;
  readonly assets: Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>["assets"]
  >;
  readonly engine: Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>["engine"]
  >;
  readonly postverification: Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>["postverification"]
  >;
  readonly runtime: typeof FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME;
}

const LEGACY_RECEIPT_FIELDS = new Set([
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
]);
const V8_RECEIPT_FIELDS = new Set([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "asset_authority",
  "assets",
  "engine",
  "postverification",
  "runtime",
]);
const DEPLOYMENT_FIELDS = new Set([
  "layout",
  "owner_uid",
  "exact_tree",
  "private_directories",
]);
const ASSETS_FIELDS = new Set(["engine", "eval", "stable"]);
const ENGINE_ASSETS_FIELDS = new Set(["yaneuraou", "receipt"]);
const EVAL_ASSETS_FIELDS = new Set(["nn", "tree_sha256"]);
const STABLE_ASSETS_FIELDS = new Set(["plan", "wasm", "weights", "worker"]);
const ASSET_EVIDENCE_FIELDS = new Set([
  "relative_path",
  "bytes",
  "sha256",
  "mode",
  "identity",
]);
const IDENTITY_FIELDS = new Set(["dev", "ino"]);
const ENGINE_FIELDS = new Set([
  "receipt_schema",
  "source_repository",
  "source_commit",
  "source_commit_date",
  "engine_id",
  "binary_cross_bound",
]);
const POSTVERIFICATION_FIELDS = new Set([
  "embedded_wasm_exactly_equal",
  "exact_entries_revalidated",
  "identities_revalidated",
  "contents_stably_read",
]);
const EXPECTED_ENGINE = Object.freeze({
  receipt_schema: "shogi-teacher-engine-receipt-v1" as const,
  source_repository: "https://github.com/yaneurao/YaneuraOu.git",
  source_commit: "9133c527791c8b2f5f378a32df29a5e3752bd41b",
  source_commit_date: "2026-07-02T13:41:06+09:00",
  engine_id: "YaneuraOu NNUE 9.60git 64APPLEM1",
  binary_cross_bound: true as const,
});
const EXPECTED_POSTVERIFICATION = Object.freeze({
  embedded_wasm_exactly_equal: true as const,
  exact_entries_revalidated: true as const,
  identities_revalidated: true as const,
  contents_stably_read: true as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
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

function hasExactFields(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      );
    })
  ) {
    return false;
  }
  const fields = keys as string[];
  return (
    fields.length === expected.size &&
    fields.every((field) => expected.has(field))
  );
}

function capturePlainData(
  value: unknown,
  label: string,
  memo = new WeakMap<object, unknown>(),
  active = new WeakSet<object>(),
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number`);
    }
    return value;
  }
  if (!isRecord(value)) {
    throw new Error(`${label} must contain only plain non-Proxy records`);
  }
  if (active.has(value)) {
    throw new Error(`${label} contains a cycle`);
  }
  const existing = memo.get(value);
  if (existing !== undefined) return existing;
  active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  memo.set(value, output);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new Error(
        `${label}.${key} must be an enumerable own data property`,
      );
    }
    output[key] = capturePlainData(
      descriptor.value,
      `${label}.${key}`,
      memo,
      active,
    );
  }
  active.delete(value);
  return Object.freeze(output);
}

function sameJson(left: unknown, right: unknown): boolean {
  if (typeof left !== typeof right || left === null || right === null) {
    return left === right;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJson(value, right[index]))
    );
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(rightRecord, key) &&
          sameJson(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return Object.is(left, right);
}

function exactRecord(
  value: unknown,
  fields: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value) || !hasExactFields(value, fields)) {
    throw new Error(`${label} fields are not exact`);
  }
  return value;
}

function assertAssetEvidence(
  value: unknown,
  expected: Readonly<{
    relativePath: string;
    bytes: number;
    sha256: string;
    mode: "0600" | "0700";
  }>,
  label: string,
): void {
  const evidence = exactRecord(value, ASSET_EVIDENCE_FIELDS, label);
  const identity = exactRecord(
    evidence.identity,
    IDENTITY_FIELDS,
    `${label} identity`,
  );
  if (
    evidence.relative_path !== expected.relativePath ||
    evidence.bytes !== expected.bytes ||
    evidence.sha256 !== expected.sha256 ||
    evidence.mode !== expected.mode ||
    typeof identity.dev !== "string" ||
    !/^(?:0|[1-9][0-9]*)$/.test(identity.dev) ||
    typeof identity.ino !== "string" ||
    !/^[1-9][0-9]*$/.test(identity.ino)
  ) {
    throw new Error(`${label} does not match the pinned v1 asset identity`);
  }
}

function assertLegacyAssetTree(value: unknown): void {
  const assets = exactRecord(value, ASSETS_FIELDS, "legacy assets");
  const engine = exactRecord(
    assets.engine,
    ENGINE_ASSETS_FIELDS,
    "legacy engine assets",
  );
  const evaluation = exactRecord(
    assets.eval,
    EVAL_ASSETS_FIELDS,
    "legacy evaluation assets",
  );
  const stable = exactRecord(
    assets.stable,
    STABLE_ASSETS_FIELDS,
    "legacy stable assets",
  );
  assertAssetEvidence(
    engine.yaneuraou,
    {
      relativePath: "engine/yaneuraou",
      ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou,
      mode: "0700",
    },
    "legacy YaneuraOu",
  );
  assertAssetEvidence(
    engine.receipt,
    {
      relativePath: "engine/yaneuraou-receipt.json",
      ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.receipt,
      mode: "0600",
    },
    "legacy engine receipt",
  );
  assertAssetEvidence(
    evaluation.nn,
    {
      relativePath: "eval/nn.bin",
      ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn,
      mode: "0600",
    },
    "legacy evaluation",
  );
  if (
    evaluation.tree_sha256 !==
    FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.treeSha256
  ) {
    throw new Error(
      "legacy evaluation tree does not match the pinned registry",
    );
  }
  for (const [name, relativePath] of [
    ["plan", "stable/floodgate-plan.json"],
    ["wasm", "stable/shogi.wasm"],
    ["weights", "stable/shogi-nnue-weights.bin"],
    ["worker", "stable/floodgate-stable-wasm-worker.mjs"],
  ] as const) {
    assertAssetEvidence(
      stable[name],
      {
        relativePath,
        ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.stable[name],
        mode: "0600",
      },
      `legacy stable ${name}`,
    );
  }
}

function assertLegacyAssetAuthorityReceipt(
  legacy: unknown,
  expectedExecutionBoundary: FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
  expectedOwnerUid: number,
): asserts legacy is Readonly<FloodgateProductionTeacherAssetAuthorityReceipt> {
  if (
    !isRecord(legacy) ||
    !hasExactFields(legacy, LEGACY_RECEIPT_FIELDS) ||
    legacy.contract !== FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT ||
    legacy.status !== FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS ||
    legacy.claim_boundary !==
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY ||
    legacy.trust_boundary !==
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY ||
    legacy.execution_boundary !== expectedExecutionBoundary ||
    !sameJson(legacy.runtime, FLOODGATE_PRODUCTION_TEACHER_RUNTIME)
  ) {
    throw new Error(
      "strength-first v8 authority requires the exact legacy v1 asset receipt",
    );
  }
  const deployment = exactRecord(
    legacy.deployment,
    DEPLOYMENT_FIELDS,
    "legacy deployment",
  );
  if (
    !Number.isSafeInteger(expectedOwnerUid) ||
    expectedOwnerUid < 0 ||
    deployment.layout !== "fixed-per-user-application-support-v1" ||
    deployment.owner_uid !== expectedOwnerUid ||
    deployment.exact_tree !== true ||
    deployment.private_directories !== true
  ) {
    throw new Error(
      "legacy deployment does not match the current private owner",
    );
  }
  assertLegacyAssetTree(legacy.assets);
  const engine = exactRecord(legacy.engine, ENGINE_FIELDS, "legacy engine");
  if (!sameJson(engine, EXPECTED_ENGINE)) {
    throw new Error("legacy engine summary does not match its pinned receipt");
  }
  const postverification = exactRecord(
    legacy.postverification,
    POSTVERIFICATION_FIELDS,
    "legacy postverification",
  );
  if (!sameJson(postverification, EXPECTED_POSTVERIFICATION)) {
    throw new Error("legacy asset postverification is incomplete");
  }
}

export function captureFloodgateStrengthFirstV8TeacherAuthorityReceipt(
  receipt: unknown,
  expectedExecutionBoundary: FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
  expectedOwnerUid: number,
): Readonly<FloodgateStrengthFirstV8TeacherAuthorityReceipt> {
  const captured = capturePlainData(
    receipt,
    "strength-first v8 teacher authority receipt",
  ) as Record<string, unknown>;
  if (
    !hasExactFields(captured, V8_RECEIPT_FIELDS) ||
    captured.contract !==
      FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT ||
    captured.status !== FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS ||
    captured.claim_boundary !==
      FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY ||
    captured.execution_boundary !== expectedExecutionBoundary ||
    !sameJson(captured.runtime, FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME)
  ) {
    throw new Error("invalid strength-first v8 teacher authority receipt");
  }
  assertLegacyAssetAuthorityReceipt(
    captured.asset_authority,
    expectedExecutionBoundary,
    expectedOwnerUid,
  );
  const legacy =
    captured.asset_authority as Readonly<FloodgateProductionTeacherAssetAuthorityReceipt>;
  if (
    captured.assets !== legacy.assets ||
    captured.engine !== legacy.engine ||
    captured.postverification !== legacy.postverification
  ) {
    throw new Error(
      "strength-first v8 execution policy is not bound to its legacy asset receipt",
    );
  }
  return captured as unknown as Readonly<FloodgateStrengthFirstV8TeacherAuthorityReceipt>;
}

/**
 * Testable binding seam. A raw legacy receipt is accepted only as the nested
 * immutable asset-provenance leaf; callers receive a new v8 authority receipt.
 */
export function bindFloodgateStrengthFirstV8TeacherAuthorityCoreForTests<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
>(
  legacy: Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>
  >,
  expectedOwnerUid: number,
): Readonly<
  FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>
> {
  const capturedLegacy = capturePlainData(
    legacy,
    "legacy v1 asset authority receipt",
  ) as unknown as Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>
  >;
  assertLegacyAssetAuthorityReceipt(
    capturedLegacy,
    capturedLegacy.execution_boundary,
    expectedOwnerUid,
  );
  const receipt = Object.freeze({
    contract: FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT,
    status: FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS,
    claim_boundary:
      FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
    execution_boundary: capturedLegacy.execution_boundary,
    asset_authority: capturedLegacy,
    assets: capturedLegacy.assets,
    engine: capturedLegacy.engine,
    postverification: capturedLegacy.postverification,
    runtime: FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME,
  });
  return captureFloodgateStrengthFirstV8TeacherAuthorityReceipt(
    receipt,
    capturedLegacy.execution_boundary,
    expectedOwnerUid,
  ) as Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>
  >;
}

/** Verify pinned production assets and bind the separate v8 execution policy. */
export async function verifyPinnedFloodgateStrengthFirstV8TeacherAuthority(): Promise<
  Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<"production-fixed-registry-and-deployment-root">
  >
> {
  return bindFloodgateStrengthFirstV8TeacherAuthorityCoreForTests(
    await verifyPinnedFloodgateProductionTeacherAssets(),
    process.geteuid(),
  );
}
