/**
 * Strength-first v9 authority.
 *
 * The already-verified v8 authority remains the immutable asset-provenance
 * leaf. This wrapper binds only the measured v9 proposal/quarantine policy and
 * never executes an engine or reads training data.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  PROPOSAL_INCOMPLETE_QUARANTINE_POLICY,
  STRENGTH_FIRST_TIMEOUT_SKIP_DIVISOR,
} from "./generate-sibling-teacher";
import {
  bindFloodgateStrengthFirstV8TeacherAuthorityCoreForTests,
  captureFloodgateStrengthFirstV8TeacherAuthorityReceipt,
  verifyPinnedFloodgateStrengthFirstV8TeacherAuthority,
  type FloodgateStrengthFirstV8TeacherAuthorityReceipt,
} from "./floodgate-strength-first-v8-teacher-authority";
import type {
  FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
  FloodgateProductionTeacherAssetAuthorityReceipt,
} from "./floodgate-production-teacher-asset-authority";

export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT =
  "shogi-floodgate-strength-first-v9-teacher-authority-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS =
  "verified-pinned-v8-assets-and-measured-strength-first-v9-proposal-rescue-policy" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY =
  "nested-v8-asset-provenance-and-v9-search-policy-not-engine-execution-teacher-completion-training-holdout-or-playing-strength-evidence" as const;

export const FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME = Object.freeze({
  parallel_engines: 12 as const,
  threads_per_engine: 1 as const,
  hash_mb_per_engine: 512 as const,
  timeout_ms_per_search: 600_000 as const,
  proposal: Object.freeze({ multipv: 12 as const, depth: 14 as const }),
  independent_rescore: Object.freeze({
    multipv: 1 as const,
    searchmoves: "exactly-one-candidate" as const,
    depth: 16 as const,
  }),
  proposal_incomplete: Object.freeze({
    policy: PROPOSAL_INCOMPLETE_QUARANTINE_POLICY,
    phase: "proposal-only" as const,
    disposition: "typed-skip-with-no-label" as const,
    exact_rescore_incomplete: "fatal" as const,
    shared_recoverable_search_skip_divisor: STRENGTH_FIRST_TIMEOUT_SKIP_DIVISOR,
  }),
});

export interface FloodgateStrengthFirstV9TeacherAuthorityReceipt<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary = FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT;
  readonly status: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS;
  readonly claim_boundary: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY;
  readonly execution_boundary: TExecutionBoundary;
  readonly asset_authority: Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>
  >;
  readonly assets: Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>["assets"]
  >;
  readonly engine: Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>["engine"]
  >;
  readonly postverification: Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>["postverification"]
  >;
  readonly runtime: typeof FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME;
}

const RECEIPT_FIELDS = new Set([
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
  if (active.has(value)) throw new Error(`${label} contains a cycle`);
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

function hasExactFields(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((field) => expected.has(field))
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function captureFloodgateStrengthFirstV9TeacherAuthorityReceipt(
  receipt: unknown,
  expectedExecutionBoundary: FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
  expectedOwnerUid: number,
): Readonly<FloodgateStrengthFirstV9TeacherAuthorityReceipt> {
  const captured = capturePlainData(
    receipt,
    "strength-first v9 teacher authority receipt",
  ) as Record<string, unknown>;
  if (
    !hasExactFields(captured, RECEIPT_FIELDS) ||
    captured.contract !==
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT ||
    captured.status !== FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS ||
    captured.claim_boundary !==
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY ||
    captured.execution_boundary !== expectedExecutionBoundary ||
    !sameJson(captured.runtime, FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME)
  ) {
    throw new Error("invalid strength-first v9 teacher authority receipt");
  }
  const v8 = captureFloodgateStrengthFirstV8TeacherAuthorityReceipt(
    captured.asset_authority,
    expectedExecutionBoundary,
    expectedOwnerUid,
  );
  if (
    captured.assets !==
      (captured.asset_authority as Record<string, unknown>).assets ||
    captured.engine !==
      (captured.asset_authority as Record<string, unknown>).engine ||
    captured.postverification !==
      (captured.asset_authority as Record<string, unknown>).postverification
  ) {
    throw new Error(
      "strength-first v9 execution policy is not bound to its v8 asset receipt",
    );
  }
  return Object.freeze({
    contract: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT,
    status: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS,
    claim_boundary:
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
    execution_boundary: v8.execution_boundary,
    asset_authority: v8,
    assets: v8.assets,
    engine: v8.engine,
    postverification: v8.postverification,
    runtime: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
  });
}

export function bindFloodgateStrengthFirstV9TeacherAuthorityCoreForTests<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
>(
  v8: Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>
  >,
  expectedOwnerUid: number,
): Readonly<
  FloodgateStrengthFirstV9TeacherAuthorityReceipt<TExecutionBoundary>
> {
  const capturedV8 = captureFloodgateStrengthFirstV8TeacherAuthorityReceipt(
    v8,
    v8.execution_boundary,
    expectedOwnerUid,
  ) as Readonly<
    FloodgateStrengthFirstV8TeacherAuthorityReceipt<TExecutionBoundary>
  >;
  return captureFloodgateStrengthFirstV9TeacherAuthorityReceipt(
    Object.freeze({
      contract: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT,
      status: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS,
      claim_boundary:
        FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
      execution_boundary: capturedV8.execution_boundary,
      asset_authority: capturedV8,
      assets: capturedV8.assets,
      engine: capturedV8.engine,
      postverification: capturedV8.postverification,
      runtime: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
    }),
    capturedV8.execution_boundary,
    expectedOwnerUid,
  ) as Readonly<
    FloodgateStrengthFirstV9TeacherAuthorityReceipt<TExecutionBoundary>
  >;
}

/** Verify the pinned v8 asset authority, then append the measured v9 policy. */
export async function verifyPinnedFloodgateStrengthFirstV9TeacherAuthority(): Promise<
  Readonly<
    FloodgateStrengthFirstV9TeacherAuthorityReceipt<"production-fixed-registry-and-deployment-root">
  >
> {
  if (typeof process.geteuid !== "function") {
    throw new Error(
      "strength-first v9 teacher requires POSIX process.geteuid() before production asset verification",
    );
  }
  return bindFloodgateStrengthFirstV9TeacherAuthorityCoreForTests(
    await verifyPinnedFloodgateStrengthFirstV8TeacherAuthority(),
    process.geteuid(),
  );
}

/**
 * Test helper for building a v9 receipt from the historical v1 asset leaf.
 * Keeping this composition explicit prevents tests from forging a v8 wrapper.
 */
export function bindFloodgateStrengthFirstV9FromLegacyAuthorityCoreForTests<
  TExecutionBoundary extends
    FloodgateProductionTeacherAssetAuthorityExecutionBoundary,
>(
  legacy: Readonly<
    FloodgateProductionTeacherAssetAuthorityReceipt<TExecutionBoundary>
  >,
  expectedOwnerUid: number,
): Readonly<
  FloodgateStrengthFirstV9TeacherAuthorityReceipt<TExecutionBoundary>
> {
  return bindFloodgateStrengthFirstV9TeacherAuthorityCoreForTests(
    bindFloodgateStrengthFirstV8TeacherAuthorityCoreForTests(
      legacy,
      expectedOwnerUid,
    ),
    expectedOwnerUid,
  );
}
