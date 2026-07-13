/**
 * Owns the direct operation path for one Floodgate v7 parent.
 *
 * This module performs no dataset, checkpoint, key, label, or weight I/O.
 * The production factory accepts no arguments and receives its runtime
 * capabilities only through the runtime owner's exact single-use handoff.
 */

import { Buffer } from "node:buffer";
import { types as nodeUtilTypes } from "node:util";

import {
  buildFloodgateV7CandidateUnionForProductionParentCoordinator,
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  type FloodgateV7CandidateUnionInput,
  type FloodgateV7CandidateUnionReceipt,
} from "./floodgate-v7-candidate-union";
import {
  buildFloodgateV7CompletedParentCoreForTests,
  type FloodgateV7CompletedParentInput,
} from "./floodgate-v7-completed-parent";
import type { FloodgateProductionStableWasmRuntimeResult } from "./floodgate-production-stable-wasm-runtime";
import type {
  FloodgateProductionTeacherProposalResult,
  FloodgateProductionTeacherRescoreResult,
  FloodgateProductionTeacherUsiRuntimeReceipt,
} from "./floodgate-production-teacher-usi-runtime";
import {
  claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator,
  claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests,
  createFloodgateV7ProductionRuntimeOwner,
  createFloodgateV7ProductionRuntimeOwnerCoreForTests,
  type FloodgateV7ProductionRuntimeOwner,
  type FloodgateV7ProductionRuntimeOwnerCoreDependencies,
  type FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
  type FloodgateV7ProductionRuntimeOwnerParentCoordinatorHandoff,
} from "./floodgate-v7-production-runtime-owner";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
} from "./floodgate-stable-wasm-proposer";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TeacherMissingParentRequest,
} from "./floodgate-v7-teacher-checkpoint";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import { positionFromSfen, rulesCompleteLegalMoves } from "./shogi-sfen";

export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CONTRACT =
  "shogi-floodgate-v7-production-parent-coordinator-v1" as const;
export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_STATUS =
  "initialized-exact-production-owner-parent-operation-coordinator" as const;
export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CLAIM_BOUNDARY =
  "exact-single-use-production-owner-handoff-direct-stable-teacher-parent-operations-v2-run-binding-and-deadline-bounded-owner-cleanup-not-checkpoint-key-label-training-weight-live-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_STATUS =
  "initialized-injected-test-parent-operation-coordinator-not-production-evidence" as const;
export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_CLAIM_BOUNDARY =
  "injected-owner-parent-operation-composition-not-production-origin-checkpoint-key-label-training-weight-live-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TRUST_BOUNDARY =
  "trusted-current-process-js-realm-and-imported-structural-validator-intrinsics-v1" as const;
export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS =
  1_800_000 as const;
export const FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS =
  30_000 as const;

type ProductionOwnerBoundary =
  "production-fixed-stable-and-teacher-runtime-factories";
type TestOwnerBoundary =
  "test-only-injected-runtime-factories-and-digest-getters";

export type FloodgateV7ProductionParentCoordinatorExecutionBoundary =
  | "production-exact-runtime-owner-single-use-handoff"
  | "test-only-injected-runtime-owner-single-use-handoff";

export type FloodgateV7ProductionParentCoordinatorPhase =
  | "capture"
  | "owner-handoff"
  | "stable-proposal"
  | "teacher-proposal"
  | "candidate-union"
  | "independent-rescore"
  | "completed-parent"
  | "deadline"
  | "cancellation"
  | "cleanup";

export class FloodgateV7ProductionParentCoordinatorError extends Error {
  readonly phase: FloodgateV7ProductionParentCoordinatorPhase;
  readonly primary: unknown;
  readonly cleanup_failures: readonly unknown[];

  constructor(
    phase: FloodgateV7ProductionParentCoordinatorPhase,
    primary: unknown,
    cleanupFailures: readonly unknown[] = [],
  ) {
    super(`Floodgate v7 production parent coordinator failed during ${phase}`, {
      cause: primary,
    });
    this.name = "FloodgateV7ProductionParentCoordinatorError";
    this.phase = phase;
    this.primary = primary;
    const capturedCleanupFailures: unknown[] = [];
    for (let index = 0; index < cleanupFailures.length; index += 1) {
      objectDefineProperty(capturedCleanupFailures, index, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: cleanupFailures[index],
      });
    }
    this.cleanup_failures = objectFreeze(capturedCleanupFailures);
    objectFreeze(this);
  }
}

export interface FloodgateV7ProductionParentCoordinatorReceipt {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CONTRACT;
  readonly status:
    | typeof FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_STATUS
    | typeof FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_STATUS;
  readonly claim_boundary:
    | typeof FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CLAIM_BOUNDARY
    | typeof FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TRUST_BOUNDARY;
  readonly execution_boundary: FloodgateV7ProductionParentCoordinatorExecutionBoundary;
  readonly handoff: Readonly<{
    readonly exact_owner_facade_claimed_once: true;
    readonly raw_runtime_facades_exposed: false;
  }>;
  readonly operation: Readonly<{
    readonly stable_then_teacher_then_union_then_rescore: true;
    readonly candidate_order: "utf8-bytewise-ascending-v1";
    readonly completed_parent_core_reverified_before_return: true;
  }>;
  readonly test_boundary: Readonly<{
    readonly production_factory_execution: false;
    readonly production_runtime_origin: false;
  }> | null;
  readonly nonclaims: Readonly<{
    readonly checkpoint: false;
    readonly key_authority: false;
    readonly input_authentication: false;
    readonly dataset_read: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly selection_or_holdout_access: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export interface FloodgateV7ProductionParentCoordinator {
  readonly receipt: Readonly<FloodgateV7ProductionParentCoordinatorReceipt>;
  readonly run_binding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
  readonly produce: (
    request: Readonly<FloodgateV7TeacherMissingParentRequest>,
  ) => Promise<Readonly<FloodgateV7CompletedParentInput>>;
  readonly close: () => Promise<void>;
  readonly abortAndDrain: () => Promise<void>;
}

const NativePromise = Promise;
const NativeError = Error;
const NativeSet = Set;
const nativePromisePrototype = Promise.prototype;
const nativePromiseThen = Promise.prototype.then;
const nativeSetAdd = Set.prototype.add;
const nativeSetDelete = Set.prototype.delete;
const nativeSetClear = Set.prototype.clear;
const nativeSetForEach = Set.prototype.forEach;
const NativeWeakSet = WeakSet;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetHas = WeakSet.prototype.has;
const nativeReflectApply = Reflect.apply;
const nativeSetTimeout = setTimeout;
const nativeClearTimeout = clearTimeout;
const nativeArrayIsArray = Array.isArray;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectIs = Object.is;
const objectPrototype = Object.prototype;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const reflectOwnKeys = Reflect.ownKeys;
const promiseSpeciesSymbol = Symbol.species;
const nativeSignalAborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)?.get;
const nativeSignalReason = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "reason",
)?.get;
const nativeAddEventListener = EventTarget.prototype.addEventListener;
const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
const bufferCompare = Buffer.compare.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const MAX_CAPTURE_ENTRIES = 100_000;
const MAX_PARENT_STRING_CODE_UNITS = 4_096;
const PARENT_KEYS = objectFreeze([
  "game_id",
  "parent_id",
  "parent_sfen",
  "played_move",
  "ply",
  "position_id",
  "schema_version",
] as const);
const PARENT_STRING_KEYS = objectFreeze([
  "game_id",
  "parent_id",
  "position_id",
  "parent_sfen",
  "played_move",
] as const);

const capturedPromiseConstructorHolder = objectCreate(null) as Record<
  symbol,
  unknown
>;
objectDefineProperty(capturedPromiseConstructorHolder, promiseSpeciesSymbol, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: NativePromise,
});
objectFreeze(capturedPromiseConstructorHolder);
const internallyPinnedPromises = new NativeWeakSet<object>();

function pinCoordinatorPromise<T>(promise: Promise<T>): Promise<T> {
  if (
    nativeReflectApply(nativeWeakSetHas, internallyPinnedPromises, [promise])
  ) {
    return promise;
  }
  const pinnedThen = objectFreeze(function (
    onFulfilled?: (value: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    const derived = nativeReflectApply(nativePromiseThen, promise, [
      onFulfilled,
      onRejected,
    ]) as Promise<unknown>;
    return pinCoordinatorPromise(derived);
  });
  objectDefineProperty(promise, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: capturedPromiseConstructorHolder,
  });
  objectDefineProperty(promise, "then", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: pinnedThen,
  });
  nativeReflectApply(nativeWeakSetAdd, internallyPinnedPromises, [promise]);
  return objectFreeze(promise);
}

function frozenRecord<T extends object>(values: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const keys = objectKeys(values);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: (values as Record<string, unknown>)[key],
    });
  }
  return objectFreeze(output);
}

function strictRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    nativeArrayIsArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    throw new NativeError(`${label} must be a plain non-Proxy object`);
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== objectPrototype && prototype !== null) {
    throw new NativeError(`${label} must be a plain non-Proxy object`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const actual = reflectOwnKeys(descriptors);
  let keysAreExact = actual.length === keys.length;
  for (let index = 0; keysAreExact && index < actual.length; index += 1) {
    const key = actual[index];
    let found = false;
    if (typeof key === "string") {
      for (
        let expectedIndex = 0;
        expectedIndex < keys.length;
        expectedIndex += 1
      ) {
        if (key === keys[expectedIndex]) {
          found = true;
          break;
        }
      }
    }
    if (!found) keysAreExact = false;
  }
  if (!keysAreExact) {
    throw new NativeError(`${label} keys are not exact`);
  }
  const output = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(
        `${label}.${key} must be an enumerable data property`,
      );
    }
    output[key] = descriptor.value;
  }
  return objectFreeze(output);
}

function snapshotJson(
  value: unknown,
  label: string,
  depth = 0,
  budget: { remaining: number } = { remaining: MAX_CAPTURE_ENTRIES },
): unknown {
  if (depth > 32) throw new NativeError(`${label} exceeds the capture depth`);
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!numberIsFinite(value) || objectIs(value, -0)) {
      throw new NativeError(`${label} contains a non-canonical number`);
    }
    return value;
  }
  if (typeof value !== "object" || nodeUtilTypes.isProxy(value)) {
    throw new NativeError(`${label} is not JSON-like data`);
  }
  if (nativeArrayIsArray(value)) {
    const descriptors = objectGetOwnPropertyDescriptors(value);
    const length = value.length;
    if (length > budget.remaining) {
      throw new NativeError(`${label} exceeds the capture entry bound`);
    }
    budget.remaining -= length;
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        throw new NativeError(`${label} must be a dense data-property array`);
      }
      objectDefineProperty(output, index, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: snapshotJson(
          descriptor.value,
          `${label}[${index}]`,
          depth + 1,
          budget,
        ),
      });
    }
    if (reflectOwnKeys(descriptors).length !== length + 1) {
      throw new NativeError(`${label} contains unexpected array properties`);
    }
    return objectFreeze(output);
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== objectPrototype && prototype !== null) {
    throw new NativeError(`${label} must contain only plain records`);
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length > budget.remaining) {
    throw new NativeError(`${label} exceeds the capture entry bound`);
  }
  budget.remaining -= keys.length;
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== "string") {
      throw new NativeError(`${label} contains symbol keys`);
    }
  }
  const output = objectCreate(null) as Record<string, unknown>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] as string;
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError(
        `${label}.${key} must be an enumerable data property`,
      );
    }
    output[key] = snapshotJson(
      descriptor.value,
      `${label}.${key}`,
      depth + 1,
      budget,
    );
  }
  return objectFreeze(output);
}

function rejectedPromise<T>(reason: unknown): Promise<T> {
  return new NativePromise<T>((_resolve, reject) => reject(reason));
}

function consumeInvalidNativePromiseBestEffort(value: unknown): void {
  if (
    !nodeUtilTypes.isPromise(value) ||
    nodeUtilTypes.isProxy(value) ||
    objectGetPrototypeOf(value) !== nativePromisePrototype
  ) {
    return;
  }
  try {
    // Do not read a caller-controlled constructor or Symbol.species. A
    // configurable decoration can be replaced safely; otherwise this invalid
    // Promise remains outside coordinator lifecycle ownership.
    objectDefineProperty(value, "constructor", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: capturedPromiseConstructorHolder,
    });
  } catch {
    return;
  }
  try {
    nativeReflectApply(nativePromiseThen, value, [
      () => undefined,
      () => undefined,
    ]);
  } catch {
    // Observation is best effort and carries no semantic value into the run.
  }
}

function requireOperationPromise<T>(value: unknown, label: string): Promise<T> {
  const exactNative =
    nodeUtilTypes.isPromise(value) &&
    !nodeUtilTypes.isProxy(value) &&
    objectGetPrototypeOf(value) === nativePromisePrototype;
  if (!exactNative || reflectOwnKeys(value as object).length !== 0) {
    consumeInvalidNativePromiseBestEffort(value);
    throw new NativeError(
      `${label} must return an undecorated exact native Promise`,
    );
  }
  try {
    return pinCoordinatorPromise(value as Promise<T>);
  } catch {
    consumeInvalidNativePromiseBestEffort(value);
    throw new NativeError(
      `${label} must return a pinnable exact native Promise`,
    );
  }
}

function signalAborted(signal: AbortSignal): boolean {
  if (nativeSignalAborted === undefined || nodeUtilTypes.isProxy(signal)) {
    throw new NativeError("request.signal must be a current-realm AbortSignal");
  }
  return nativeReflectApply(nativeSignalAborted, signal, []) as boolean;
}

function signalReason(signal: AbortSignal): unknown {
  if (nativeSignalReason === undefined)
    return new NativeError("parent request aborted");
  const reason = nativeReflectApply(nativeSignalReason, signal, []);
  return reason === undefined
    ? new NativeError("parent request aborted")
    : reason;
}

function captureRequest(value: unknown): Readonly<{
  readonly input_index: number;
  readonly parent: Readonly<FloodgateTrainingParent>;
  readonly signal: AbortSignal;
  readonly legalMoves: readonly string[];
}> {
  const input = strictRecord(
    value,
    ["input_index", "parent", "signal"],
    "parent request",
  );
  if (
    !numberIsSafeInteger(input.input_index) ||
    (input.input_index as number) < 0
  ) {
    throw new NativeError(
      "parent request.input_index must be a nonnegative safe integer",
    );
  }
  const parentInput = strictRecord(
    input.parent,
    PARENT_KEYS,
    "parent request.parent",
  );
  if (parentInput.schema_version !== 1) {
    throw new NativeError("parent request.parent.schema_version must equal 1");
  }
  for (let index = 0; index < PARENT_STRING_KEYS.length; index += 1) {
    const key = PARENT_STRING_KEYS[index];
    if (typeof parentInput[key] !== "string") {
      throw new NativeError(`parent request.parent.${key} must be a string`);
    }
    const length = (parentInput[key] as string).length;
    if (length < 1 || length > MAX_PARENT_STRING_CODE_UNITS) {
      throw new NativeError(
        `parent request.parent.${key} exceeds the string bound`,
      );
    }
  }
  if (
    !numberIsSafeInteger(parentInput.ply) ||
    (parentInput.ply as number) < 0
  ) {
    throw new NativeError(
      "parent request.parent.ply must be a nonnegative safe integer",
    );
  }
  const parent = frozenRecord({
    schema_version: parentInput.schema_version as 1,
    game_id: parentInput.game_id as string,
    parent_id: parentInput.parent_id as string,
    position_id: parentInput.position_id as string,
    parent_sfen: parentInput.parent_sfen as string,
    ply: parentInput.ply as number,
    played_move: parentInput.played_move as string,
  }) as Readonly<FloodgateTrainingParent>;
  if (input.signal === null || typeof input.signal !== "object") {
    throw new NativeError("parent request.signal must be an AbortSignal");
  }
  const signal = input.signal as AbortSignal;
  signalAborted(signal);
  const { position } = positionFromSfen(parent.parent_sfen);
  const legalEntries = rulesCompleteLegalMoves(position);
  const legalMoveValues: string[] = [];
  for (let index = 0; index < legalEntries.length; index += 1) {
    objectDefineProperty(legalMoveValues, index, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: legalEntries[index].usi,
    });
  }
  const legalMoves = objectFreeze(legalMoveValues);
  return frozenRecord({
    input_index: input.input_index as number,
    parent,
    signal,
    legalMoves,
  });
}

function buildRunBinding(
  handoff: Readonly<
    FloodgateV7ProductionRuntimeOwnerParentCoordinatorHandoff<FloodgateV7ProductionRuntimeOwnerExecutionBoundary>
  >,
): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  return frozenRecord({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: frozenRecord({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    }),
    producer_control: frozenRecord({
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms:
        FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
      abort_drain_ms: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256:
      handoff.receipt.stable_runtime_receipt_sha256,
    teacher_usi_runtime_receipt_sha256:
      handoff.receipt.teacher_usi_runtime_receipt_sha256,
  });
}

function buildReceipt(
  production: boolean,
): Readonly<FloodgateV7ProductionParentCoordinatorReceipt> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CONTRACT,
    status: production
      ? FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_STATUS
      : FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_STATUS,
    claim_boundary: production
      ? FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CLAIM_BOUNDARY
      : FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TRUST_BOUNDARY,
    execution_boundary: production
      ? ("production-exact-runtime-owner-single-use-handoff" as const)
      : ("test-only-injected-runtime-owner-single-use-handoff" as const),
    handoff: frozenRecord({
      exact_owner_facade_claimed_once: true as const,
      raw_runtime_facades_exposed: false as const,
    }),
    operation: frozenRecord({
      stable_then_teacher_then_union_then_rescore: true as const,
      candidate_order: "utf8-bytewise-ascending-v1" as const,
      completed_parent_core_reverified_before_return: true as const,
    }),
    test_boundary: production
      ? null
      : frozenRecord({
          production_factory_execution: false as const,
          production_runtime_origin: false as const,
        }),
    nonclaims: frozenRecord({
      checkpoint: false as const,
      key_authority: false as const,
      input_authentication: false as const,
      dataset_read: false as const,
      teacher_label: false as const,
      training: false as const,
      selection_or_holdout_access: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function createCoordinatorFacade(
  handoff: Readonly<
    FloodgateV7ProductionRuntimeOwnerParentCoordinatorHandoff<FloodgateV7ProductionRuntimeOwnerExecutionBoundary>
  >,
  production: boolean,
): FloodgateV7ProductionParentCoordinator {
  const teacherReceipt = snapshotJson(
    handoff.teacherReceipt,
    "teacher runtime receipt",
  ) as Readonly<
    FloodgateProductionTeacherUsiRuntimeReceipt<"production-fixed-assets-and-runtime-dependencies">
  >;
  let lifecyclePromise: Promise<void> | undefined;
  let lifecycleInternalPromise: Promise<void> | undefined;
  let terminalReason: unknown;
  const terminalRejectors = new NativeSet<(reason: unknown) => void>();

  const startLifecycle = (
    transition: "close" | "abortAndDrain",
    reason: unknown,
  ): Promise<void> => {
    if (lifecyclePromise !== undefined) return lifecyclePromise;
    let resolveLifecycle!: () => void;
    let rejectLifecycle!: (cause: unknown) => void;
    let resolveInternal!: () => void;
    let rejectInternal!: (cause: unknown) => void;
    const established = new NativePromise<void>((resolve, reject) => {
      resolveLifecycle = resolve;
      rejectLifecycle = reject;
    });
    const internal = pinCoordinatorPromise(
      new NativePromise<void>((resolve, reject) => {
        resolveInternal = resolve;
        rejectInternal = reject;
      }),
    );
    // Publish the sole coordinator lifecycle Promise before notifying active
    // producers. Their terminal callbacks reenter abortAndDrain; they must
    // join this exact transition instead of racing close with abort.
    lifecyclePromise = established;
    lifecycleInternalPromise = internal;
    terminalReason = reason;
    const resolveBoth = (): void => {
      resolveLifecycle();
      resolveInternal();
    };
    const rejectBoth = (cause: unknown): void => {
      rejectLifecycle(cause);
      rejectInternal(cause);
    };
    let child: unknown;
    try {
      child = nativeReflectApply(
        transition === "close" ? handoff.close : handoff.abortAndDrain,
        undefined,
        [],
      );
    } catch (cause) {
      rejectBoth(cause);
      child = undefined;
    }
    if (child !== undefined) {
      if (!nodeUtilTypes.isPromise(child) || nodeUtilTypes.isProxy(child)) {
        rejectBoth(
          new NativeError(
            `owner ${transition} must return a non-Proxy Promise`,
          ),
        );
      } else {
        nativeReflectApply(nativePromiseThen, child, [resolveBoth, rejectBoth]);
      }
    }
    // Observe cleanup even when an operation failure is the only public
    // consumer. The checkpoint can separately await this same Promise through
    // abortAndDrain and classify a cleanup failure.
    nativeReflectApply(nativePromiseThen, internal, [
      () => undefined,
      () => undefined,
    ]);
    nativeReflectApply(nativeSetForEach, terminalRejectors, [
      (reject: (reason: unknown) => void) => reject(reason),
    ]);
    nativeReflectApply(nativeSetClear, terminalRejectors, []);
    return established;
  };

  const requireOperationActive = (): void => {
    if (lifecyclePromise !== undefined) {
      throw terminalReason ?? new NativeError("coordinator lifecycle started");
    }
  };

  const produce = objectFreeze(function (
    requestValue: Readonly<FloodgateV7TeacherMissingParentRequest>,
  ): Promise<Readonly<FloodgateV7CompletedParentInput>> {
    if (arguments.length !== 1) {
      return rejectedPromise(
        new FloodgateV7ProductionParentCoordinatorError(
          "capture",
          new NativeError("coordinator.produce accepts exactly one argument"),
        ),
      );
    }
    let request: ReturnType<typeof captureRequest>;
    try {
      request = captureRequest(requestValue);
    } catch (primary) {
      return rejectedPromise(
        new FloodgateV7ProductionParentCoordinatorError("capture", primary),
      );
    }
    if (lifecyclePromise !== undefined) {
      return rejectedPromise(
        new FloodgateV7ProductionParentCoordinatorError(
          "cleanup",
          terminalReason ?? new NativeError("coordinator lifecycle started"),
        ),
      );
    }

    return new NativePromise<Readonly<FloodgateV7CompletedParentInput>>(
      (resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        let phase: FloodgateV7ProductionParentCoordinatorPhase =
          "stable-proposal";
        const finishReject = (primary: unknown): void => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) nativeClearTimeout(timer);
          try {
            nativeReflectApply(nativeRemoveEventListener, request.signal, [
              "abort",
              onAbort,
            ]);
          } catch {
            // The current-realm signal was already captured; preserve primary.
          }
          nativeReflectApply(nativeSetDelete, terminalRejectors, [
            rejectTerminal,
          ]);
          startLifecycle("abortAndDrain", primary);
          const cleanup = lifecycleInternalPromise as Promise<void>;
          nativeReflectApply(nativePromiseThen, cleanup, [
            () =>
              reject(
                new FloodgateV7ProductionParentCoordinatorError(phase, primary),
              ),
            (cleanupFailure: unknown) =>
              reject(
                new FloodgateV7ProductionParentCoordinatorError(
                  phase,
                  primary,
                  [cleanupFailure],
                ),
              ),
          ]);
        };
        const rejectTerminal = (reason: unknown): void => {
          phase = "cancellation";
          finishReject(reason);
        };
        const onAbort = (): void => {
          phase = "cancellation";
          finishReject(signalReason(request.signal));
        };

        nativeReflectApply(nativeSetAdd, terminalRejectors, [rejectTerminal]);
        try {
          nativeReflectApply(nativeAddEventListener, request.signal, [
            "abort",
            onAbort,
            frozenRecord({ once: true }),
          ]);
          timer = nativeSetTimeout(() => {
            phase = "deadline";
            finishReject(
              new NativeError(
                `parent ${request.input_index} exceeded ${FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS}ms`,
              ),
            );
          }, FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS);
          if (signalAborted(request.signal)) onAbort();
        } catch (primary) {
          phase = "capture";
          finishReject(primary);
        }
        if (settled) return;

        const workflow = async (): Promise<
          Readonly<FloodgateV7CompletedParentInput>
        > => {
          const captureBudget = { remaining: MAX_CAPTURE_ENTRIES };
          requireOperationActive();
          phase = "stable-proposal";
          const stablePending = requireOperationPromise<
            Readonly<
              FloodgateProductionStableWasmRuntimeResult<"production-fixed-asset-authority-and-reusable-pool">
            >
          >(handoff.stablePropose(request.parent), "stable runtime propose");
          const stableRuntime = snapshotJson(
            await stablePending,
            "stable runtime result",
            0,
            captureBudget,
          ) as Readonly<
            FloodgateProductionStableWasmRuntimeResult<"production-fixed-asset-authority-and-reusable-pool">
          >;
          requireOperationActive();

          let proposal: Readonly<FloodgateProductionTeacherProposalResult> | null =
            null;
          if (request.legalMoves.length >= 2) {
            phase = "teacher-proposal";
            requireOperationActive();
            const teacherPending = requireOperationPromise<
              Readonly<FloodgateProductionTeacherProposalResult>
            >(
              handoff.teacherPropose(
                request.parent.parent_sfen,
                request.legalMoves.length,
              ),
              "teacher runtime propose",
            );
            proposal = snapshotJson(
              await teacherPending,
              "teacher proposal result",
              0,
              captureBudget,
            ) as Readonly<FloodgateProductionTeacherProposalResult>;
            requireOperationActive();
          }

          phase = "candidate-union";
          requireOperationActive();
          const unionInput = frozenRecord({
            parent: request.parent,
            legal: frozenRecord({
              source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
              parent_sfen: request.parent.parent_sfen,
              count: request.legalMoves.length,
              moves: request.legalMoves,
            }),
            stable: stableRuntime.row,
            runtime:
              proposal === null
                ? null
                : frozenRecord({ receipt: teacherReceipt, proposal }),
          }) satisfies FloodgateV7CandidateUnionInput;
          const union = snapshotJson(
            buildFloodgateV7CandidateUnionForProductionParentCoordinator(
              unionInput,
            ),
            "candidate union",
            0,
            captureBudget,
          ) as Readonly<FloodgateV7CandidateUnionReceipt>;

          const rescores: Readonly<FloodgateProductionTeacherRescoreResult>[] =
            [];
          phase = "independent-rescore";
          let previousMoveBytes: Buffer | undefined;
          for (let index = 0; index < union.candidates.length; index += 1) {
            requireOperationActive();
            const currentMove = union.candidates[index].move;
            const currentMoveBytes = bufferFrom(currentMove, "utf8");
            if (
              previousMoveBytes !== undefined &&
              bufferCompare(previousMoveBytes, currentMoveBytes) >= 0
            ) {
              throw new NativeError(
                "candidate union is not in strict UTF-8 byte order",
              );
            }
            previousMoveBytes = currentMoveBytes;
            objectDefineProperty(rescores, index, {
              configurable: true,
              enumerable: true,
              writable: true,
              value: snapshotJson(
                await requireOperationPromise(
                  handoff.teacherRescore(
                    request.parent.parent_sfen,
                    currentMove,
                  ),
                  `teacher runtime rescore ${index}`,
                ),
                `teacher rescore result ${index}`,
                0,
                captureBudget,
              ) as Readonly<FloodgateProductionTeacherRescoreResult>,
            });
            requireOperationActive();
          }
          requireOperationActive();
          const input = frozenRecord({
            union,
            stable_runtime: stableRuntime,
            rescores: objectFreeze(rescores),
          }) satisfies FloodgateV7CompletedParentInput;
          phase = "completed-parent";
          requireOperationActive();
          buildFloodgateV7CompletedParentCoreForTests(input);
          requireOperationActive();
          return input;
        };

        const workflowPromise = pinCoordinatorPromise(workflow());
        nativeReflectApply(nativePromiseThen, workflowPromise, [
          (input: Readonly<FloodgateV7CompletedParentInput>) => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) nativeClearTimeout(timer);
            nativeReflectApply(nativeRemoveEventListener, request.signal, [
              "abort",
              onAbort,
            ]);
            nativeReflectApply(nativeSetDelete, terminalRejectors, [
              rejectTerminal,
            ]);
            resolve(input);
          },
          (primary: unknown) => finishReject(primary),
        ]);
      },
    );
  });

  const close = objectFreeze(function (): Promise<void> {
    if (lifecyclePromise !== undefined) return lifecyclePromise;
    if (arguments.length !== 0) {
      return rejectedPromise(
        new FloodgateV7ProductionParentCoordinatorError(
          "capture",
          new NativeError("coordinator.close accepts no arguments"),
        ),
      );
    }
    return startLifecycle(
      "close",
      new NativeError("coordinator close started"),
    );
  });
  const abortAndDrain = objectFreeze(function (): Promise<void> {
    if (lifecyclePromise !== undefined) return lifecyclePromise;
    if (arguments.length !== 0) {
      return rejectedPromise(
        new FloodgateV7ProductionParentCoordinatorError(
          "capture",
          new NativeError("coordinator.abortAndDrain accepts no arguments"),
        ),
      );
    }
    return startLifecycle(
      "abortAndDrain",
      new NativeError("coordinator abort and drain started"),
    );
  });

  return frozenRecord({
    receipt: buildReceipt(production),
    run_binding: buildRunBinding(handoff),
    produce,
    close,
    abortAndDrain,
  });
}

function createFromOwner<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
>(
  ownerPromise: Promise<FloodgateV7ProductionRuntimeOwner<TBoundary>>,
  claim: (
    owner: FloodgateV7ProductionRuntimeOwner<TBoundary>,
  ) => Readonly<
    FloodgateV7ProductionRuntimeOwnerParentCoordinatorHandoff<TBoundary>
  >,
  production: boolean,
): Promise<FloodgateV7ProductionParentCoordinator> {
  return new NativePromise((resolve, reject) => {
    nativeReflectApply(nativePromiseThen, ownerPromise, [
      (owner: FloodgateV7ProductionRuntimeOwner<TBoundary>) => {
        try {
          resolve(
            createCoordinatorFacade(
              claim(owner) as Readonly<
                FloodgateV7ProductionRuntimeOwnerParentCoordinatorHandoff<FloodgateV7ProductionRuntimeOwnerExecutionBoundary>
              >,
              production,
            ),
          );
        } catch (primary) {
          let cleanup: Promise<void>;
          try {
            cleanup = owner.abortAndDrain();
          } catch (cleanupFailure) {
            reject(
              new FloodgateV7ProductionParentCoordinatorError(
                "owner-handoff",
                primary,
                [cleanupFailure],
              ),
            );
            return;
          }
          nativeReflectApply(nativePromiseThen, cleanup, [
            () =>
              reject(
                new FloodgateV7ProductionParentCoordinatorError(
                  "owner-handoff",
                  primary,
                ),
              ),
            (cleanupFailure: unknown) =>
              reject(
                new FloodgateV7ProductionParentCoordinatorError(
                  "owner-handoff",
                  primary,
                  [cleanupFailure],
                ),
              ),
          ]);
        }
      },
      (primary: unknown) =>
        reject(
          new FloodgateV7ProductionParentCoordinatorError(
            "owner-handoff",
            primary,
          ),
        ),
    ]);
  });
}

/** Dependency-injected owner boundary. Injected behavior is never production evidence. */
export function createFloodgateV7ProductionParentCoordinatorCoreForTests(
  dependencies: FloodgateV7ProductionRuntimeOwnerCoreDependencies,
): Promise<FloodgateV7ProductionParentCoordinator> {
  if (arguments.length !== 1) {
    return rejectedPromise(
      new FloodgateV7ProductionParentCoordinatorError(
        "capture",
        new NativeError(
          "test coordinator factory accepts exactly one argument",
        ),
      ),
    );
  }
  return createFromOwner<TestOwnerBoundary>(
    createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
    claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests,
    false,
  );
}

/** Fixed production factory; no dependency injection or I/O argument is accepted. */
export function createFloodgateV7ProductionParentCoordinator(): Promise<FloodgateV7ProductionParentCoordinator> {
  if (arguments.length !== 0) {
    return rejectedPromise(
      new FloodgateV7ProductionParentCoordinatorError(
        "capture",
        new NativeError("production coordinator factory accepts no arguments"),
      ),
    );
  }
  return createFromOwner<ProductionOwnerBoundary>(
    createFloodgateV7ProductionRuntimeOwner(),
    claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator,
    true,
  );
}
