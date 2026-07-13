/**
 * Zero-work lifecycle owner for the fixed stable and teacher production runtimes.
 *
 * This boundary owns concurrent initialization, exact-facade receipt-digest
 * lookup, and all-settled cleanup. It deliberately exposes no parent operation,
 * producer, checkpoint, key, label, training, weight, live, or strength surface.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  createFloodgateProductionStableWasmRuntime,
  getFloodgateProductionStableWasmRuntimeReceiptDigest,
  type FloodgateProductionStableWasmRuntime,
} from "./floodgate-production-stable-wasm-runtime";
import {
  createFloodgateProductionTeacherUsiRuntime,
  getFloodgateProductionTeacherUsiRuntimeReceiptDigest,
  type FloodgateProductionTeacherUsiPool,
} from "./floodgate-production-teacher-usi-runtime";

export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CONTRACT =
  "shogi-floodgate-v7-production-runtime-owner-v1" as const;
export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_STATUS =
  "initialized-zero-work-stable-teacher-runtime-lifecycle-owner" as const;
export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLAIM_BOUNDARY =
  "concurrent-fixed-production-runtime-initialization-exact-production-facade-digest-lookup-and-first-valid-zero-argument-call-wins-deadline-bounded-cleanup-not-parent-operations-producer-coordinator-checkpoint-key-label-training-weight-live-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_STATUS =
  "initialized-injected-test-lifecycle-harness-not-production-or-zero-work-evidence" as const;
export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_CLAIM_BOUNDARY =
  "injected-runtime-lifecycle-harness-and-injected-digest-getters-not-production-origin-zero-work-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_INITIALIZATION_TIMEOUT_MS =
  180_000 as const;
export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLEANUP_TIMEOUT_MS =
  30_000 as const;
export const FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS =
  250 as const;

export type FloodgateV7ProductionRuntimeOwnerExecutionBoundary =
  | "production-fixed-stable-and-teacher-runtime-factories"
  | "test-only-injected-runtime-factories-and-digest-getters";

export type FloodgateV7ProductionRuntimeOwnerPhase =
  "capture" | "initialization" | "digest-authority" | "cleanup";

type ProductionExecutionBoundary =
  "production-fixed-stable-and-teacher-runtime-factories";
type TestExecutionBoundary =
  "test-only-injected-runtime-factories-and-digest-getters";

interface FloodgateV7ProductionRuntimeOwnerCommonReceipt<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CONTRACT;
  readonly execution_boundary: TBoundary;
  readonly stable_runtime_receipt_sha256: string;
  readonly teacher_usi_runtime_receipt_sha256: string;
  readonly plain_receipt_origin_claim: false;
  readonly lifecycle: Readonly<{
    readonly initialization: "concurrent-factories-captured-all-settled-with-owner-deadline-v1";
    readonly initialization_timeout_ms: TBoundary extends ProductionExecutionBoundary
      ? typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_INITIALIZATION_TIMEOUT_MS
      : typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS;
    readonly cleanup_timeout_ms: TBoundary extends ProductionExecutionBoundary
      ? typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLEANUP_TIMEOUT_MS
      : typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS;
    readonly trusted_factory_promise: "pinnable-undecorated-exact-native-promise-v1";
    readonly invalid_factory_promise: "rejected-before-authority-best-effort-observation-not-runtime-ownership-v1";
    readonly initialization_failure: "known-trusted-fulfilled-stable-close-and-teacher-abort-and-reap-deadline-bounded-v1";
    readonly transition: "first-valid-zero-argument-call-wins-later-calls-return-exact-same-promise-v1";
    readonly pre_transition_invalid_arity: "reject-without-establishing-transition-v1";
    readonly late_invalid_calls: "join-existing-transition-v1";
    readonly close: "stable-close-and-teacher-close-deadline-bounded-v1";
    readonly abort_and_drain: "stable-close-and-teacher-abort-and-reap-deadline-bounded-v1";
    readonly completion: "all-accepted-promises-settled-or-owner-timeout-failure-v1";
  }>;
  readonly nonclaims: Readonly<{
    readonly parent_operations: false;
    readonly producer: false;
    readonly production_coordinator: false;
    readonly checkpoint: false;
    readonly key_authority: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_deployment: false;
    readonly playing_strength: false;
    readonly invalid_promise_runtime_ownership: false;
    readonly injected_behavior_evidence: false;
    readonly unresolved_factory_resource_ownership: false;
    readonly invalid_promise_rejection_observation: false;
  }>;
}

interface FloodgateV7ProductionRuntimeOwnerProductionReceiptClaims {
  readonly status: typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLAIM_BOUNDARY;
  readonly digest_authority: "exact-production-facade-authorities-v1";
}

interface FloodgateV7ProductionRuntimeOwnerTestReceiptClaims {
  readonly status: typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_CLAIM_BOUNDARY;
  readonly digest_authority: "injected-test-getters-not-origin-authority-v1";
  readonly nonclaims: FloodgateV7ProductionRuntimeOwnerCommonReceipt<TestExecutionBoundary>["nonclaims"] &
    Readonly<{
      readonly production_factory_execution: false;
      readonly production_runtime_origin: false;
      readonly production_exact_facade_digest_authority: false;
      readonly zero_work_evidence: false;
    }>;
}

export type FloodgateV7ProductionRuntimeOwnerReceipt<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary =
    FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
> = TBoundary extends ProductionExecutionBoundary
  ? Readonly<
      FloodgateV7ProductionRuntimeOwnerCommonReceipt<TBoundary> &
        FloodgateV7ProductionRuntimeOwnerProductionReceiptClaims
    >
  : TBoundary extends TestExecutionBoundary
    ? Readonly<
        FloodgateV7ProductionRuntimeOwnerCommonReceipt<TBoundary> &
          FloodgateV7ProductionRuntimeOwnerTestReceiptClaims
      >
    : never;

export interface FloodgateV7ProductionRuntimeOwner<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary =
    FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
> {
  readonly receipt: Readonly<
    FloodgateV7ProductionRuntimeOwnerReceipt<TBoundary>
  >;
  readonly close: () => Promise<void>;
  readonly abortAndDrain: () => Promise<void>;
}

type TestStableRuntime =
  FloodgateProductionStableWasmRuntime<"test-only-injected-asset-provider-and-pool-factory">;
type TestTeacherRuntime =
  FloodgateProductionTeacherUsiPool<"test-only-injected-asset-root-and-runtime-dependencies">;

export interface FloodgateV7ProductionRuntimeOwnerCoreDependencies {
  readonly createStableRuntime: () => Promise<TestStableRuntime>;
  readonly createTeacherRuntime: () => Promise<TestTeacherRuntime>;
  readonly getStableRuntimeReceiptDigest: (
    runtime: TestStableRuntime,
  ) => string;
  readonly getTeacherRuntimeReceiptDigest: (
    runtime: TestTeacherRuntime,
  ) => string;
}

const NativePromise = Promise;
const NativeError = Error;
const NativeAggregateError = AggregateError;
const nativePromisePrototype = Promise.prototype;
const nativePromiseThen = Promise.prototype.then;
const nativePromiseAllSettled = Promise.allSettled;
const nativeReflectApply = Reflect.apply;
const nativeStringSlice = String.prototype.slice;
const nativeStringCharCodeAt = String.prototype.charCodeAt;
const nativeArrayIsArray = Array.isArray;
const NativeWeakSet = WeakSet;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetHas = WeakSet.prototype.has;
const nativeSetTimeout = setTimeout;
const nativeClearTimeout = clearTimeout;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsPromise = nodeUtilTypes.isPromise;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nodeIsNativeError = nodeUtilTypes.isNativeError;
const objectPrototype = Object.prototype;
const arrayIteratorSymbol = Symbol.iterator;
const promiseSpeciesSymbol = Symbol.species;

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
const adoptedSourcePromises = new NativeWeakSet<object>();

function isInternallyPinnedPromise(value: object): boolean {
  return nativeReflectApply(nativeWeakSetHas, internallyPinnedPromises, [
    value,
  ]) as boolean;
}

function isAdoptedSourcePromise(value: object): boolean {
  return nativeReflectApply(nativeWeakSetHas, adoptedSourcePromises, [
    value,
  ]) as boolean;
}

function pinPromiseConstructor<T>(promise: Promise<T>): Promise<T> {
  objectDefineProperty(promise, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: capturedPromiseConstructorHolder,
  });
  return promise;
}

function pinArrayThenUndefined<T extends unknown[]>(values: T): T {
  objectDefineProperty(values, "then", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: undefined,
  });
  return values;
}

const capturedAllSettledPromiseConstructor = function (
  executor: (
    resolve: (value: unknown) => void,
    reject: (reason?: unknown) => void,
  ) => void,
): Promise<unknown> {
  return pinPromiseConstructor(
    new NativePromise((resolve, reject) => {
      executor((value: unknown) => {
        if (nativeArrayIsArray(value)) {
          try {
            pinArrayThenUndefined(value);
          } catch (cause) {
            reject(cause);
            return;
          }
        }
        resolve(value);
      }, reject);
    }),
  );
};
objectDefineProperty(capturedAllSettledPromiseConstructor, "resolve", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: objectFreeze(function (value: unknown): Promise<unknown> {
    // This constructor is private to capturedAllSettled, whose inputs are
    // already pinned native Promises. Identity avoids live constructor/species
    // and thenable-assimilation lookups.
    return value as Promise<unknown>;
  }),
});
objectFreeze(capturedAllSettledPromiseConstructor);

type StableFactory<TStable> = () => Promise<TStable>;
type TeacherFactory<TTeacher> = () => Promise<TTeacher>;
type RuntimeDigestGetter<TRuntime> = (runtime: TRuntime) => string;
type ZeroArgumentLifecycleMethod = () => Promise<void>;

interface OwnerDependencies<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
  TStable,
  TTeacher,
> {
  readonly executionBoundary: TBoundary;
  readonly initializationTimeoutMs: number;
  readonly cleanupTimeoutMs: number;
  readonly createStableRuntime: StableFactory<TStable>;
  readonly createTeacherRuntime: TeacherFactory<TTeacher>;
  readonly getStableRuntimeReceiptDigest: RuntimeDigestGetter<TStable>;
  readonly getTeacherRuntimeReceiptDigest: RuntimeDigestGetter<TTeacher>;
}

interface CapturedStableRuntime<TStable> {
  readonly runtime: TStable;
  readonly close: ZeroArgumentLifecycleMethod;
}

interface CapturedTeacherRuntime<TTeacher> {
  readonly runtime: TTeacher;
  readonly close: ZeroArgumentLifecycleMethod;
  readonly abortAndReap: ZeroArgumentLifecycleMethod;
}

type CleanupInvocation = Readonly<{
  readonly label: string;
  readonly method: ZeroArgumentLifecycleMethod;
}>;

const capturedArrayIterator = objectFreeze(function <T>(
  this: readonly T[],
): IterableIterator<T> {
  const length = this.length;
  let index = 0;
  const iterator = objectCreate(null) as IterableIterator<T>;
  const next = objectFreeze((): IteratorResult<T> => {
    if (index < length) {
      const value = this[index];
      index += 1;
      return frozenRecord({ value, done: false as const });
    }
    return frozenRecord({ value: undefined, done: true as const });
  });
  const returnSelf = objectFreeze(function (): IterableIterator<T> {
    return iterator;
  });
  objectDefineProperty(iterator, "next", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: next,
  });
  objectDefineProperty(iterator, arrayIteratorSymbol, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: returnSelf,
  });
  return objectFreeze(iterator);
});

function freezeArrayInPlace<T>(values: T[]): readonly T[] {
  pinArrayThenUndefined(values);
  objectDefineProperty(values, arrayIteratorSymbol, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: capturedArrayIterator,
  });
  return objectFreeze(values);
}

function defineArrayValue<T>(values: T[], index: number, value: T): void {
  objectDefineProperty(values, index, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function appendArrayValue<T>(values: T[], value: T): void {
  defineArrayValue(values, values.length, value);
}

function frozenList<T>(values: readonly T[]): readonly T[] {
  const output: T[] = [];
  for (let index = 0; index < values.length; index += 1) {
    defineArrayValue(output, index, values[index]);
  }
  return freezeArrayInPlace(output);
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

export interface FloodgateV7ProductionRuntimeOwnerFailureEvidence {
  readonly classification: "error" | "non-error";
  readonly name: string;
  readonly message: string;
}

function boundedFailureText(value: string, fallback: string): string {
  if (value.length === 0) return fallback;
  if (value.length <= 512) return value;
  return `${nativeReflectApply(nativeStringSlice, value, [0, 509])}...`;
}

function captureFailureEvidence(
  value: unknown,
): Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence> {
  let isError = false;
  try {
    isError = nodeIsNativeError(value);
  } catch {
    isError = false;
  }

  let name = isError ? "Error" : "NonError";
  let message = isError
    ? "error without an own data message"
    : `non-Error ${typeof value} failure`;

  if (typeof value === "string") {
    message = boundedFailureText(value, "empty string failure");
  } else if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    !nodeIsProxy(value)
  ) {
    try {
      const nameDescriptor = objectGetOwnPropertyDescriptor(value, "name");
      const messageDescriptor = objectGetOwnPropertyDescriptor(
        value,
        "message",
      );
      const nameValueDescriptor =
        nameDescriptor === undefined
          ? undefined
          : objectGetOwnPropertyDescriptor(nameDescriptor, "value");
      const messageValueDescriptor =
        messageDescriptor === undefined
          ? undefined
          : objectGetOwnPropertyDescriptor(messageDescriptor, "value");
      if (
        nameValueDescriptor !== undefined &&
        typeof nameValueDescriptor.value === "string"
      ) {
        name = boundedFailureText(
          nameValueDescriptor.value,
          isError ? "Error" : "NonError",
        );
      }
      if (
        messageValueDescriptor !== undefined &&
        typeof messageValueDescriptor.value === "string"
      ) {
        message = boundedFailureText(
          messageValueDescriptor.value,
          isError
            ? "error with an empty own message"
            : "non-Error object with an empty own message",
        );
      }
    } catch {
      // Do not invoke hostile accessors or Proxy-like host behavior for evidence.
    }
  }

  return frozenRecord({
    classification: isError ? ("error" as const) : ("non-error" as const),
    name,
    message,
  });
}

function materializeAndFreezeError<T extends Error>(error: T, name: string): T {
  // Reading V8's lazy stack accessor would execute the live
  // Error.prepareStackTrace hook. A deterministic own string keeps the shared
  // failure graph inert under post-import global mutation.
  const stack = `${name}: ${error.message}`;
  objectDefineProperty(error, "name", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: name,
  });
  objectDefineProperty(error, "stack", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: stack,
  });
  return objectFreeze(error);
}

function aggregateFailures(
  failures: readonly Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence>[],
  message: string,
  cause?:
    Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence> | AggregateError,
): AggregateError {
  const aggregate = new NativeAggregateError(
    frozenList(failures),
    message,
    cause === undefined ? undefined : { cause },
  );
  freezeArrayInPlace(aggregate.errors);
  return materializeAndFreezeError(aggregate, "AggregateError");
}

export class FloodgateV7ProductionRuntimeOwnerError extends NativeError {
  declare readonly phase: FloodgateV7ProductionRuntimeOwnerPhase;
  declare readonly primary:
    | Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence>
    | AggregateError
    | undefined;
  declare readonly operationFailures: readonly Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence>[];
  declare readonly cleanupFailure: AggregateError | null;
  declare readonly cleanupFailures: readonly Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence>[];

  constructor(
    phase: FloodgateV7ProductionRuntimeOwnerPhase,
    operationFailures: readonly unknown[],
    cleanupFailures: readonly unknown[] = [],
  ) {
    const operationEvidence: Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence>[] =
      [];
    for (let index = 0; index < operationFailures.length; index += 1) {
      defineArrayValue(
        operationEvidence,
        index,
        captureFailureEvidence(operationFailures[index]),
      );
    }
    const cleanupEvidence: Readonly<FloodgateV7ProductionRuntimeOwnerFailureEvidence>[] =
      [];
    for (let index = 0; index < cleanupFailures.length; index += 1) {
      defineArrayValue(
        cleanupEvidence,
        index,
        captureFailureEvidence(cleanupFailures[index]),
      );
    }
    const capturedOperationFailures = frozenList(operationEvidence);
    const capturedCleanupFailures = frozenList(cleanupEvidence);
    const primary =
      capturedOperationFailures.length === 0
        ? undefined
        : capturedOperationFailures.length === 1
          ? capturedOperationFailures[0]
          : aggregateFailures(
              capturedOperationFailures,
              `runtime owner ${phase} had multiple primary failures`,
            );
    const cleanupFailure =
      capturedCleanupFailures.length === 0
        ? null
        : aggregateFailures(
            capturedCleanupFailures,
            "runtime owner cleanup had one or more failures",
            primary,
          );
    super(`Floodgate v7 production runtime owner failed during ${phase}`, {
      cause: primary ?? cleanupFailure ?? undefined,
    });
    const publicFields = {
      phase,
      primary,
      operationFailures: capturedOperationFailures,
      cleanupFailure,
      cleanupFailures: capturedCleanupFailures,
    } as const;
    const publicFieldKeys = objectKeys(publicFields);
    for (let index = 0; index < publicFieldKeys.length; index += 1) {
      const key = publicFieldKeys[index];
      objectDefineProperty(this, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: (publicFields as Record<string, unknown>)[key],
      });
    }
    materializeAndFreezeError(this, "FloodgateV7ProductionRuntimeOwnerError");
  }
}

function contractFailure(message: string): Error {
  return new NativeError(
    `invalid Floodgate v7 production runtime owner: ${message}`,
  );
}

function deadlineFailure(label: string, timeoutMs: number): Error {
  return new NativeError(
    `Floodgate v7 production runtime owner ${label} exceeded its ${timeoutMs}ms deadline`,
  );
}

function rejectedNativePromise<T>(reason: unknown): Promise<T> {
  return pinInternalPromise(
    new NativePromise<T>((_resolve, reject) => reject(reason)),
  );
}

function pinInternalPromise<T>(promise: Promise<T>): Promise<T> {
  if (isInternallyPinnedPromise(promise)) return promise;
  const pinnedThen = objectFreeze(function (
    onFulfilled?: (value: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    const derived = nativeReflectApply(nativePromiseThen, promise, [
      onFulfilled,
      onRejected,
    ]) as Promise<unknown>;
    return pinInternalPromise(derived);
  });
  pinPromiseConstructor(promise);
  // Promise.allSettled gets each input's `then` dynamically. Pin an own
  // delegating method so later Promise.prototype.then replacement cannot alter
  // this boundary after module capture.
  objectDefineProperty(promise, "then", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: pinnedThen,
  });
  nativeReflectApply(nativeWeakSetAdd, internallyPinnedPromises, [promise]);
  return objectFreeze(promise);
}

function pinnedRejectedNativePromise<T>(reason: unknown): Promise<T> {
  return rejectedNativePromise<T>(reason);
}

function isExactNativePromise(value: unknown): value is Promise<unknown> {
  if (
    !nodeIsPromise(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== nativePromisePrototype
  ) {
    return false;
  }
  const keys = reflectOwnKeys(value);
  if (keys.length === 0) return true;
  return isAdoptedSourcePromise(value);
}

function consumeInvalidNativePromiseBestEffort(value: unknown): void {
  if (
    !nodeIsPromise(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== nativePromisePrototype
  ) {
    return;
  }
  try {
    // A configurable constructor decoration can be replaced without reading
    // it. Observation begins only after that safe pin succeeds.
    pinPromiseConstructor(value as Promise<unknown>);
  } catch {
    // The invalid Promise remains outside lifecycle ownership.
    return;
  }
  try {
    const observation = nativeReflectApply(nativePromiseThen, value, [
      () => undefined,
      () => undefined,
    ]) as Promise<unknown>;
    pinPromiseConstructor(observation);
  } catch {
    // An invalid decorated Promise carries no semantic value into this owner.
  }
}

function adoptExactNativePromise<T>(value: unknown, label: string): Promise<T> {
  if (!isExactNativePromise(value)) {
    consumeInvalidNativePromiseBestEffort(value);
    return pinnedRejectedNativePromise(
      contractFailure(`${label} must return an exact native Promise`),
    );
  }
  try {
    // Return the validated source itself. Bridging through resolve(value)
    // would re-run thenable assimilation on a fulfilled runtime facade after
    // Object.prototype.then mutation.
    const adopted = pinInternalPromise(value as Promise<T>);
    nativeReflectApply(nativeWeakSetAdd, adoptedSourcePromises, [adopted]);
    return adopted;
  } catch {
    consumeInvalidNativePromiseBestEffort(value);
    return pinnedRejectedNativePromise(
      contractFailure(`${label} must return a pinnable exact native Promise`),
    );
  }
}

function invokeFactory<T>(
  factory: () => Promise<T>,
  label: string,
): Promise<T> {
  let value: unknown;
  try {
    value = nativeReflectApply(factory, undefined, []);
  } catch (cause) {
    return pinnedRejectedNativePromise(cause);
  }
  return adoptExactNativePromise<T>(value, label);
}

function invokeCleanup(value: CleanupInvocation): Promise<void> {
  let result: unknown;
  try {
    result = nativeReflectApply(value.method, undefined, []);
  } catch (cause) {
    return pinnedRejectedNativePromise(cause);
  }
  return adoptExactNativePromise<void>(result, value.label);
}

function capturedAllSettled(
  promises: readonly Promise<unknown>[],
): Promise<PromiseSettledResult<unknown>[]> {
  return pinInternalPromise(
    nativeReflectApply(
      nativePromiseAllSettled,
      capturedAllSettledPromiseConstructor,
      [frozenList(promises)],
    ) as Promise<PromiseSettledResult<unknown>[]>,
  );
}

function observeNativePromise<T>(
  promise: Promise<T>,
  onFulfilled: (value: T) => void,
  onRejected: (reason: unknown) => void,
): void {
  const rejectSafely = (reason: unknown): void => {
    try {
      onRejected(reason);
    } catch {
      // Observation must never create a second unhandled rejection.
    }
  };
  const fulfillSafely = (value: T): void => {
    try {
      onFulfilled(value);
    } catch (cause) {
      rejectSafely(cause);
    }
  };
  let observation: Promise<unknown>;
  try {
    observation = nativeReflectApply(nativePromiseThen, promise, [
      fulfillSafely,
      rejectSafely,
    ]) as Promise<unknown>;
    pinPromiseConstructor(observation);
  } catch (cause) {
    rejectSafely(cause);
    return;
  }
  try {
    nativeReflectApply(nativePromiseThen, observation, [
      () => undefined,
      () => undefined,
    ]);
  } catch {
    // The source was already observed through the captured intrinsic.
  }
}

function deadlineBoundArrayPromise<T extends readonly unknown[]>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return pinInternalPromise(
    new NativePromise<T>((resolve, reject) => {
      let finished = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const clearTimer = (): void => {
        if (timer !== undefined) {
          nativeReflectApply(nativeClearTimeout, undefined, [timer]);
          timer = undefined;
        }
      };
      try {
        timer = nativeReflectApply(nativeSetTimeout, undefined, [
          () => {
            if (finished) return;
            finished = true;
            reject(deadlineFailure(label, timeoutMs));
          },
          timeoutMs,
        ]) as ReturnType<typeof setTimeout>;
      } catch (cause) {
        finished = true;
        reject(cause);
      }
      observeNativePromise(
        promise,
        (value) => {
          if (finished) return;
          finished = true;
          try {
            clearTimer();
            if (nativeArrayIsArray(value)) pinArrayThenUndefined(value);
            resolve(value);
          } catch (cause) {
            reject(cause);
          }
        },
        (reason) => {
          if (finished) return;
          finished = true;
          try {
            clearTimer();
            reject(reason);
          } catch (cause) {
            reject(cause);
          }
        },
      );
    }),
  );
}

function settleCleanup(
  invocations: readonly CleanupInvocation[],
  timeoutMs: number,
): Promise<readonly unknown[]> {
  const cleanupPromises: Promise<void>[] = [];
  const knownFailures = objectCreate(null) as Record<string, unknown>;
  const recordKnownFailure = (index: number, reason: unknown): void => {
    objectDefineProperty(knownFailures, index, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: reason,
    });
  };
  for (let index = 0; index < invocations.length; index += 1) {
    defineArrayValue(cleanupPromises, index, invokeCleanup(invocations[index]));
    observeNativePromise(
      cleanupPromises[index],
      (value) => {
        if (value !== undefined) {
          recordKnownFailure(
            index,
            contractFailure(
              `${invocations[index].label} must fulfill with undefined`,
            ),
          );
        }
      },
      (reason) => {
        recordKnownFailure(index, reason);
      },
    );
  }
  let allSettled: Promise<PromiseSettledResult<void>[]>;
  try {
    allSettled = capturedAllSettled(cleanupPromises) as Promise<
      PromiseSettledResult<void>[]
    >;
  } catch (cause) {
    for (let index = 0; index < cleanupPromises.length; index += 1) {
      observeNativePromise(
        cleanupPromises[index],
        () => undefined,
        () => undefined,
      );
    }
    return rejectedNativePromise(cause);
  }
  const boundedAllSettled = deadlineBoundArrayPromise(
    allSettled,
    timeoutMs,
    "cleanup",
  );
  return pinInternalPromise(
    new NativePromise<readonly unknown[]>((resolve) => {
      observeNativePromise(
        boundedAllSettled,
        (settlements) => {
          const failures: unknown[] = [];
          for (let index = 0; index < settlements.length; index += 1) {
            const settlement = settlements[index];
            if (settlement.status === "rejected") {
              appendArrayValue(failures, settlement.reason);
            } else if (settlement.value !== undefined) {
              const descriptor = objectGetOwnPropertyDescriptor(
                knownFailures,
                index,
              );
              appendArrayValue(
                failures,
                descriptor !== undefined && "value" in descriptor
                  ? descriptor.value
                  : contractFailure(
                      `${invocations[index].label} must fulfill with undefined`,
                    ),
              );
            }
          }
          resolve(frozenList(failures));
        },
        (cause) => {
          const failures: unknown[] = [];
          for (let index = 0; index < invocations.length; index += 1) {
            const descriptor = objectGetOwnPropertyDescriptor(
              knownFailures,
              index,
            );
            if (descriptor !== undefined && "value" in descriptor) {
              appendArrayValue(failures, descriptor.value);
            }
          }
          appendArrayValue(failures, cause);
          resolve(frozenList(failures));
        },
      );
    }),
  );
}

function hasExactFunctionArity(
  value: (...args: never[]) => unknown,
  arity: number,
): boolean {
  const descriptor = objectGetOwnPropertyDescriptor(value, "length");
  const descriptorValue =
    descriptor === undefined
      ? undefined
      : objectGetOwnPropertyDescriptor(descriptor, "value");
  return descriptorValue !== undefined && descriptorValue.value === arity;
}

function requiredDependencyFunction(
  descriptor: PropertyDescriptor | undefined,
  arity: number,
  label: string,
): (...args: never[]) => unknown {
  const descriptorValue =
    descriptor === undefined
      ? undefined
      : objectGetOwnPropertyDescriptor(descriptor, "value");
  if (
    descriptor === undefined ||
    descriptorValue === undefined ||
    descriptor.enumerable !== true ||
    typeof descriptorValue.value !== "function" ||
    nodeIsProxy(descriptorValue.value) ||
    !hasExactFunctionArity(descriptorValue.value, arity)
  ) {
    throw contractFailure(
      `${label} must be a non-Proxy arity-${arity} function`,
    );
  }
  return descriptorValue.value as (...args: never[]) => unknown;
}

function captureTestDependencies(
  value: unknown,
): Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw contractFailure("test dependencies must be a non-Proxy plain record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const expected = [
    "createStableRuntime",
    "createTeacherRuntime",
    "getStableRuntimeReceiptDigest",
    "getTeacherRuntimeReceiptDigest",
  ] as const;
  const keys = reflectOwnKeys(descriptors);
  let keysAreExact = keys.length === expected.length;
  for (
    let keyIndex = 0;
    keysAreExact && keyIndex < keys.length;
    keyIndex += 1
  ) {
    const key = keys[keyIndex];
    if (typeof key !== "string") {
      keysAreExact = false;
      break;
    }
    let matched = false;
    for (
      let expectedIndex = 0;
      expectedIndex < expected.length;
      expectedIndex += 1
    ) {
      if (expected[expectedIndex] === key) {
        matched = true;
        break;
      }
    }
    if (!matched) keysAreExact = false;
  }
  if (!keysAreExact) {
    throw contractFailure(
      "test dependencies must contain exactly four functions",
    );
  }
  const createStableRuntime = requiredDependencyFunction(
    descriptors.createStableRuntime,
    0,
    "createStableRuntime",
  ) as StableFactory<TestStableRuntime>;
  const createTeacherRuntime = requiredDependencyFunction(
    descriptors.createTeacherRuntime,
    0,
    "createTeacherRuntime",
  ) as TeacherFactory<TestTeacherRuntime>;
  const getStableRuntimeReceiptDigest = requiredDependencyFunction(
    descriptors.getStableRuntimeReceiptDigest,
    1,
    "getStableRuntimeReceiptDigest",
  ) as RuntimeDigestGetter<TestStableRuntime>;
  const getTeacherRuntimeReceiptDigest = requiredDependencyFunction(
    descriptors.getTeacherRuntimeReceiptDigest,
    1,
    "getTeacherRuntimeReceiptDigest",
  ) as RuntimeDigestGetter<TestTeacherRuntime>;
  return frozenRecord({
    createStableRuntime,
    createTeacherRuntime,
    getStableRuntimeReceiptDigest,
    getTeacherRuntimeReceiptDigest,
  });
}

function requiredLifecycleMethod(
  runtime: unknown,
  key: "close" | "abortAndReap",
  label: string,
): ZeroArgumentLifecycleMethod {
  if (runtime === null || typeof runtime !== "object" || nodeIsProxy(runtime)) {
    throw contractFailure(`${label} must be a non-Proxy runtime facade`);
  }
  const descriptor = objectGetOwnPropertyDescriptor(runtime, key);
  const descriptorValue =
    descriptor === undefined
      ? undefined
      : objectGetOwnPropertyDescriptor(descriptor, "value");
  if (
    descriptor === undefined ||
    descriptorValue === undefined ||
    typeof descriptorValue.value !== "function" ||
    nodeIsProxy(descriptorValue.value) ||
    !hasExactFunctionArity(descriptorValue.value, 0)
  ) {
    throw contractFailure(
      `${label}.${key} must be an own non-Proxy arity-0 function`,
    );
  }
  return descriptorValue.value as ZeroArgumentLifecycleMethod;
}

function captureStableRuntime<TStable>(
  runtime: TStable,
): Readonly<CapturedStableRuntime<TStable>> {
  return frozenRecord({
    runtime,
    close: requiredLifecycleMethod(runtime, "close", "stable runtime"),
  });
}

function captureTeacherRuntime<TTeacher>(
  runtime: TTeacher,
): Readonly<CapturedTeacherRuntime<TTeacher>> {
  return frozenRecord({
    runtime,
    close: requiredLifecycleMethod(runtime, "close", "teacher runtime"),
    abortAndReap: requiredLifecycleMethod(
      runtime,
      "abortAndReap",
      "teacher runtime",
    ),
  });
}

function requiredDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length !== 64) {
    throw contractFailure(`${label} must be a lowercase SHA-256 digest`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = nativeReflectApply(nativeStringCharCodeAt, value, [
      index,
    ]) as number;
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) {
      throw contractFailure(`${label} must be a lowercase SHA-256 digest`);
    }
  }
  return value;
}

function buildReceipt<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
>(
  executionBoundary: TBoundary,
  stableDigest: string,
  teacherDigest: string,
): Readonly<FloodgateV7ProductionRuntimeOwnerReceipt<TBoundary>> {
  const isProduction =
    executionBoundary ===
    "production-fixed-stable-and-teacher-runtime-factories";
  const lifecycle = frozenRecord({
    initialization:
      "concurrent-factories-captured-all-settled-with-owner-deadline-v1" as const,
    initialization_timeout_ms: isProduction
      ? FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_INITIALIZATION_TIMEOUT_MS
      : FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS,
    cleanup_timeout_ms: isProduction
      ? FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLEANUP_TIMEOUT_MS
      : FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS,
    trusted_factory_promise:
      "pinnable-undecorated-exact-native-promise-v1" as const,
    invalid_factory_promise:
      "rejected-before-authority-best-effort-observation-not-runtime-ownership-v1" as const,
    initialization_failure:
      "known-trusted-fulfilled-stable-close-and-teacher-abort-and-reap-deadline-bounded-v1" as const,
    transition:
      "first-valid-zero-argument-call-wins-later-calls-return-exact-same-promise-v1" as const,
    pre_transition_invalid_arity:
      "reject-without-establishing-transition-v1" as const,
    late_invalid_calls: "join-existing-transition-v1" as const,
    close: "stable-close-and-teacher-close-deadline-bounded-v1" as const,
    abort_and_drain:
      "stable-close-and-teacher-abort-and-reap-deadline-bounded-v1" as const,
    completion:
      "all-accepted-promises-settled-or-owner-timeout-failure-v1" as const,
  });
  const common = {
    contract: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CONTRACT,
    execution_boundary: executionBoundary,
    stable_runtime_receipt_sha256: stableDigest,
    teacher_usi_runtime_receipt_sha256: teacherDigest,
    plain_receipt_origin_claim: false as const,
    lifecycle,
  };
  if (isProduction) {
    return frozenRecord({
      ...common,
      status: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_STATUS,
      claim_boundary: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLAIM_BOUNDARY,
      digest_authority: "exact-production-facade-authorities-v1" as const,
      nonclaims: frozenRecord({
        parent_operations: false as const,
        producer: false as const,
        production_coordinator: false as const,
        checkpoint: false as const,
        key_authority: false as const,
        teacher_label: false as const,
        training: false as const,
        weight: false as const,
        live_deployment: false as const,
        playing_strength: false as const,
        invalid_promise_runtime_ownership: false as const,
        injected_behavior_evidence: false as const,
        unresolved_factory_resource_ownership: false as const,
        invalid_promise_rejection_observation: false as const,
      }),
    }) as Readonly<FloodgateV7ProductionRuntimeOwnerReceipt<TBoundary>>;
  }
  return frozenRecord({
    ...common,
    status: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_STATUS,
    claim_boundary: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_CLAIM_BOUNDARY,
    digest_authority: "injected-test-getters-not-origin-authority-v1" as const,
    nonclaims: frozenRecord({
      parent_operations: false as const,
      producer: false as const,
      production_coordinator: false as const,
      checkpoint: false as const,
      key_authority: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_deployment: false as const,
      playing_strength: false as const,
      invalid_promise_runtime_ownership: false as const,
      injected_behavior_evidence: false as const,
      unresolved_factory_resource_ownership: false as const,
      invalid_promise_rejection_observation: false as const,
      production_factory_execution: false as const,
      production_runtime_origin: false as const,
      production_exact_facade_digest_authority: false as const,
      zero_work_evidence: false as const,
    }),
  }) as Readonly<FloodgateV7ProductionRuntimeOwnerReceipt<TBoundary>>;
}

function cleanupAfterInitializationFailure<TStable, TTeacher>(
  stable: Readonly<CapturedStableRuntime<TStable>> | undefined,
  teacher: Readonly<CapturedTeacherRuntime<TTeacher>> | undefined,
  timeoutMs: number,
): Promise<readonly unknown[]> {
  const invocations: CleanupInvocation[] = [];
  if (stable !== undefined) {
    appendArrayValue(
      invocations,
      frozenRecord({
        label: "stable runtime close",
        method: stable.close,
      }),
    );
  }
  if (teacher !== undefined) {
    appendArrayValue(
      invocations,
      frozenRecord({
        label: "teacher runtime abortAndReap",
        method: teacher.abortAndReap,
      }),
    );
  }
  return settleCleanup(invocations, timeoutMs);
}

function createOwnerFacade<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
  TStable,
  TTeacher,
>(
  receipt: Readonly<FloodgateV7ProductionRuntimeOwnerReceipt<TBoundary>>,
  stable: Readonly<CapturedStableRuntime<TStable>>,
  teacher: Readonly<CapturedTeacherRuntime<TTeacher>>,
  cleanupTimeoutMs: number,
): FloodgateV7ProductionRuntimeOwner<TBoundary> {
  let lifecyclePromise: Promise<void> | undefined;

  const startLifecycle = (
    transition: "close" | "abortAndDrain",
  ): Promise<void> => {
    if (lifecyclePromise !== undefined) return lifecyclePromise;

    let resolveLifecycle!: () => void;
    let rejectLifecycle!: (reason: unknown) => void;
    const establishedPromise = pinInternalPromise(
      new NativePromise<void>((resolve, reject) => {
        resolveLifecycle = resolve;
        rejectLifecycle = reject;
      }),
    );
    // Establish the sole public Promise before either child method is invoked,
    // so even a synchronous reentrant lifecycle call joins this transition.
    lifecyclePromise = establishedPromise;

    const cleanup = settleCleanup(
      [
        frozenRecord({ label: "stable runtime close", method: stable.close }),
        transition === "close"
          ? frozenRecord({
              label: "teacher runtime close",
              method: teacher.close,
            })
          : frozenRecord({
              label: "teacher runtime abortAndReap",
              method: teacher.abortAndReap,
            }),
      ],
      cleanupTimeoutMs,
    );
    observeNativePromise(
      cleanup,
      (cleanupFailures) => {
        if (cleanupFailures.length === 0) resolveLifecycle();
        else
          rejectLifecycle(
            new FloodgateV7ProductionRuntimeOwnerError(
              "cleanup",
              [],
              cleanupFailures,
            ),
          );
      },
      (cause) => {
        rejectLifecycle(
          new FloodgateV7ProductionRuntimeOwnerError("cleanup", [], [cause]),
        );
      },
    );
    return establishedPromise;
  };

  const close = objectFreeze(function (): Promise<void> {
    if (lifecyclePromise !== undefined) return lifecyclePromise;
    if (arguments.length !== 0)
      return rejectedNativePromise(
        new FloodgateV7ProductionRuntimeOwnerError("capture", [
          contractFailure("owner.close accepts no arguments"),
        ]),
      );
    return startLifecycle("close");
  });
  const abortAndDrain = objectFreeze(function (): Promise<void> {
    if (lifecyclePromise !== undefined) return lifecyclePromise;
    if (arguments.length !== 0)
      return rejectedNativePromise(
        new FloodgateV7ProductionRuntimeOwnerError("capture", [
          contractFailure("owner.abortAndDrain accepts no arguments"),
        ]),
      );
    return startLifecycle("abortAndDrain");
  });

  return frozenRecord({ receipt, close, abortAndDrain });
}

function createOwnerInternal<
  TBoundary extends FloodgateV7ProductionRuntimeOwnerExecutionBoundary,
  TStable,
  TTeacher,
>(
  dependencies: Readonly<OwnerDependencies<TBoundary, TStable, TTeacher>>,
): Promise<FloodgateV7ProductionRuntimeOwner<TBoundary>> {
  // Invoke both factories before observing either result. A synchronous throw
  // from one side is captured as a rejected internal Promise and never prevents
  // the other factory from starting.
  const stableStart = invokeFactory(
    dependencies.createStableRuntime,
    "stable runtime factory",
  );
  const teacherStart = invokeFactory(
    dependencies.createTeacherRuntime,
    "teacher runtime factory",
  );

  let initializationFailed = false;
  let trackedStable: Readonly<CapturedStableRuntime<TStable>> | undefined;
  let trackedTeacher: Readonly<CapturedTeacherRuntime<TTeacher>> | undefined;
  let stableRejectionKnown = false;
  let teacherRejectionKnown = false;
  let stableRejection: unknown;
  let teacherRejection: unknown;
  let stableCaptureFailureKnown = false;
  let teacherCaptureFailureKnown = false;
  let stableCaptureFailure: unknown;
  let teacherCaptureFailure: unknown;
  let stableCleanupClaimed = false;
  let teacherCleanupClaimed = false;

  const claimTrackedCleanup = (): Promise<readonly unknown[]> | undefined => {
    const stable =
      trackedStable !== undefined && !stableCleanupClaimed
        ? trackedStable
        : undefined;
    const teacher =
      trackedTeacher !== undefined && !teacherCleanupClaimed
        ? trackedTeacher
        : undefined;
    if (stable !== undefined) stableCleanupClaimed = true;
    if (teacher !== undefined) teacherCleanupClaimed = true;
    if (stable === undefined && teacher === undefined) return undefined;
    return cleanupAfterInitializationFailure(
      stable,
      teacher,
      dependencies.cleanupTimeoutMs,
    );
  };

  const startLateCleanupIfNeeded = (): void => {
    if (!initializationFailed) return;
    const cleanup = claimTrackedCleanup();
    if (cleanup === undefined) return;
    observeNativePromise(
      cleanup,
      () => undefined,
      () => undefined,
    );
  };

  observeNativePromise(
    stableStart,
    (runtime) => {
      try {
        trackedStable = captureStableRuntime(runtime);
      } catch (cause) {
        stableCaptureFailureKnown = true;
        stableCaptureFailure = cause;
        return;
      }
      startLateCleanupIfNeeded();
    },
    (reason) => {
      stableRejectionKnown = true;
      stableRejection = reason;
    },
  );
  observeNativePromise(
    teacherStart,
    (runtime) => {
      try {
        trackedTeacher = captureTeacherRuntime(runtime);
      } catch (cause) {
        teacherCaptureFailureKnown = true;
        teacherCaptureFailure = cause;
        return;
      }
      startLateCleanupIfNeeded();
    },
    (reason) => {
      teacherRejectionKnown = true;
      teacherRejection = reason;
    },
  );

  let rawInitialization: Promise<
    [PromiseSettledResult<TStable>, PromiseSettledResult<TTeacher>]
  >;
  try {
    rawInitialization = capturedAllSettled([
      stableStart,
      teacherStart,
    ]) as Promise<
      [PromiseSettledResult<TStable>, PromiseSettledResult<TTeacher>]
    >;
  } catch (cause) {
    initializationFailed = true;
    observeNativePromise(
      stableStart,
      () => undefined,
      () => undefined,
    );
    observeNativePromise(
      teacherStart,
      () => undefined,
      () => undefined,
    );
    return rejectedNativePromise(
      new FloodgateV7ProductionRuntimeOwnerError("initialization", [cause]),
    );
  }

  const initialization = deadlineBoundArrayPromise(
    rawInitialization,
    dependencies.initializationTimeoutMs,
    "initialization",
  );

  return pinInternalPromise(
    new NativePromise<FloodgateV7ProductionRuntimeOwner<TBoundary>>(
      (resolve, reject) => {
        const rejectInitializationAfterTrackedCleanup = (
          cause: unknown,
        ): void => {
          initializationFailed = true;
          const failures: unknown[] = [];
          if (stableRejectionKnown) {
            appendArrayValue(failures, stableRejection);
          } else if (stableCaptureFailureKnown) {
            appendArrayValue(failures, stableCaptureFailure);
          }
          if (teacherRejectionKnown) {
            appendArrayValue(failures, teacherRejection);
          } else if (teacherCaptureFailureKnown) {
            appendArrayValue(failures, teacherCaptureFailure);
          }
          appendArrayValue(failures, cause);
          const cleanup = claimTrackedCleanup();
          if (cleanup === undefined) {
            reject(
              new FloodgateV7ProductionRuntimeOwnerError(
                "initialization",
                failures,
              ),
            );
            return;
          }
          observeNativePromise(
            cleanup,
            (cleanupFailures) => {
              reject(
                new FloodgateV7ProductionRuntimeOwnerError(
                  "initialization",
                  failures,
                  cleanupFailures,
                ),
              );
            },
            (cleanupFailure) => {
              reject(
                new FloodgateV7ProductionRuntimeOwnerError(
                  "initialization",
                  failures,
                  [cleanupFailure],
                ),
              );
            },
          );
        };

        observeNativePromise(
          initialization,
          (settlements) => {
            const operationFailures: unknown[] = [];
            let stable: Readonly<CapturedStableRuntime<TStable>> | undefined;
            let teacher: Readonly<CapturedTeacherRuntime<TTeacher>> | undefined;

            if (settlements[0].status === "rejected") {
              appendArrayValue(operationFailures, settlements[0].reason);
            } else {
              if (stableCaptureFailureKnown) {
                appendArrayValue(operationFailures, stableCaptureFailure);
              } else {
                try {
                  stable =
                    trackedStable ?? captureStableRuntime(settlements[0].value);
                } catch (cause) {
                  appendArrayValue(operationFailures, cause);
                }
              }
            }
            if (settlements[1].status === "rejected") {
              appendArrayValue(operationFailures, settlements[1].reason);
            } else {
              if (teacherCaptureFailureKnown) {
                appendArrayValue(operationFailures, teacherCaptureFailure);
              } else {
                try {
                  teacher =
                    trackedTeacher ??
                    captureTeacherRuntime(settlements[1].value);
                } catch (cause) {
                  appendArrayValue(operationFailures, cause);
                }
              }
            }

            const rejectAfterCleanup = (
              phase: "initialization" | "digest-authority",
              failures: readonly unknown[],
            ): void => {
              initializationFailed = true;
              if (stable !== undefined) stableCleanupClaimed = true;
              if (teacher !== undefined) teacherCleanupClaimed = true;
              const cleanup = cleanupAfterInitializationFailure(
                stable,
                teacher,
                dependencies.cleanupTimeoutMs,
              );
              observeNativePromise(
                cleanup,
                (cleanupFailures) => {
                  reject(
                    new FloodgateV7ProductionRuntimeOwnerError(
                      phase,
                      failures,
                      cleanupFailures,
                    ),
                  );
                },
                (cleanupFailure) => {
                  reject(
                    new FloodgateV7ProductionRuntimeOwnerError(
                      phase,
                      failures,
                      [cleanupFailure],
                    ),
                  );
                },
              );
            };

            if (
              operationFailures.length > 0 ||
              stable === undefined ||
              teacher === undefined
            ) {
              rejectAfterCleanup("initialization", operationFailures);
              return;
            }

            const digestFailures: unknown[] = [];
            let stableDigest: string | undefined;
            let teacherDigest: string | undefined;
            try {
              stableDigest = requiredDigest(
                nativeReflectApply(
                  dependencies.getStableRuntimeReceiptDigest,
                  undefined,
                  [stable.runtime],
                ),
                "stable runtime receipt digest",
              );
            } catch (cause) {
              appendArrayValue(digestFailures, cause);
            }
            try {
              teacherDigest = requiredDigest(
                nativeReflectApply(
                  dependencies.getTeacherRuntimeReceiptDigest,
                  undefined,
                  [teacher.runtime],
                ),
                "teacher runtime receipt digest",
              );
            } catch (cause) {
              appendArrayValue(digestFailures, cause);
            }
            if (
              digestFailures.length > 0 ||
              stableDigest === undefined ||
              teacherDigest === undefined
            ) {
              rejectAfterCleanup("digest-authority", digestFailures);
              return;
            }

            resolve(
              createOwnerFacade(
                buildReceipt(
                  dependencies.executionBoundary,
                  stableDigest,
                  teacherDigest,
                ),
                stable,
                teacher,
                dependencies.cleanupTimeoutMs,
              ),
            );
          },
          rejectInitializationAfterTrackedCleanup,
        );
      },
    ),
  );
}

const PRODUCTION_DEPENDENCIES = frozenRecord({
  initializationTimeoutMs:
    FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_INITIALIZATION_TIMEOUT_MS,
  cleanupTimeoutMs: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLEANUP_TIMEOUT_MS,
  createStableRuntime: createFloodgateProductionStableWasmRuntime,
  createTeacherRuntime: createFloodgateProductionTeacherUsiRuntime,
  getStableRuntimeReceiptDigest:
    getFloodgateProductionStableWasmRuntimeReceiptDigest,
  getTeacherRuntimeReceiptDigest:
    getFloodgateProductionTeacherUsiRuntimeReceiptDigest,
});

/** Dependency-injected test boundary; its runtime digests have no production authority. */
export function createFloodgateV7ProductionRuntimeOwnerCoreForTests(
  dependencies: FloodgateV7ProductionRuntimeOwnerCoreDependencies,
): Promise<
  FloodgateV7ProductionRuntimeOwner<"test-only-injected-runtime-factories-and-digest-getters">
> {
  if (arguments.length !== 1) {
    return rejectedNativePromise(
      new FloodgateV7ProductionRuntimeOwnerError("capture", [
        contractFailure("test owner factory accepts exactly one argument"),
      ]),
    );
  }
  let captured: Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies>;
  try {
    captured = captureTestDependencies(dependencies);
  } catch (cause) {
    return rejectedNativePromise(
      new FloodgateV7ProductionRuntimeOwnerError("capture", [cause]),
    );
  }
  return createOwnerInternal({
    executionBoundary:
      "test-only-injected-runtime-factories-and-digest-getters" as const,
    initializationTimeoutMs:
      FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS,
    cleanupTimeoutMs: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS,
    createStableRuntime: captured.createStableRuntime,
    createTeacherRuntime: captured.createTeacherRuntime,
    getStableRuntimeReceiptDigest: captured.getStableRuntimeReceiptDigest,
    getTeacherRuntimeReceiptDigest: captured.getTeacherRuntimeReceiptDigest,
  });
}

/**
 * Start the fixed stable and teacher production factories concurrently and own
 * only their digest and lifecycle boundaries. No dependency injection is accepted.
 */
export function createFloodgateV7ProductionRuntimeOwner(): Promise<
  FloodgateV7ProductionRuntimeOwner<"production-fixed-stable-and-teacher-runtime-factories">
> {
  if (arguments.length !== 0) {
    return rejectedNativePromise(
      new FloodgateV7ProductionRuntimeOwnerError("capture", [
        contractFailure("production runtime owner accepts no arguments"),
      ]),
    );
  }
  return createOwnerInternal({
    executionBoundary:
      "production-fixed-stable-and-teacher-runtime-factories" as const,
    initializationTimeoutMs: PRODUCTION_DEPENDENCIES.initializationTimeoutMs,
    cleanupTimeoutMs: PRODUCTION_DEPENDENCIES.cleanupTimeoutMs,
    createStableRuntime: PRODUCTION_DEPENDENCIES.createStableRuntime,
    createTeacherRuntime: PRODUCTION_DEPENDENCIES.createTeacherRuntime,
    getStableRuntimeReceiptDigest:
      PRODUCTION_DEPENDENCIES.getStableRuntimeReceiptDigest,
    getTeacherRuntimeReceiptDigest:
      PRODUCTION_DEPENDENCIES.getTeacherRuntimeReceiptDigest,
  });
}
