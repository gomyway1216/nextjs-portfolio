import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLEANUP_TIMEOUT_MS,
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CONTRACT,
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_INITIALIZATION_TIMEOUT_MS,
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_STATUS,
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_STATUS,
  FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS,
  FloodgateV7ProductionRuntimeOwnerError,
  createFloodgateV7ProductionRuntimeOwner,
  createFloodgateV7ProductionRuntimeOwnerCoreForTests,
  type FloodgateV7ProductionRuntimeOwnerCoreDependencies,
} from "../../../ml/floodgate-v7-production-runtime-owner";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWNER_SOURCE_PATH = path.resolve(
  HERE,
  "../../../ml/floodgate-v7-production-runtime-owner.ts",
);
const STABLE_DIGEST = "a".repeat(64);
const TEACHER_DIGEST = "b".repeat(64);

type StableRuntime = Awaited<
  ReturnType<
    FloodgateV7ProductionRuntimeOwnerCoreDependencies["createStableRuntime"]
  >
>;
type TeacherRuntime = Awaited<
  ReturnType<
    FloodgateV7ProductionRuntimeOwnerCoreDependencies["createTeacherRuntime"]
  >
>;
type InitMode = "success" | "sync-throw" | "async-reject";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

interface Calls {
  stableFactory: number;
  teacherFactory: number;
  stableDigest: number;
  teacherDigest: number;
  stableClose: number;
  teacherClose: number;
  teacherAbort: number;
}

interface Fixture {
  readonly calls: Calls;
  readonly stable: StableRuntime;
  readonly teacher: TeacherRuntime;
  readonly stableFactoryError: Error;
  readonly teacherFactoryError: Error;
  readonly dependencies: FloodgateV7ProductionRuntimeOwnerCoreDependencies;
  stableCloseImplementation: () => Promise<void>;
  teacherCloseImplementation: () => Promise<void>;
  teacherAbortImplementation: () => Promise<void>;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected rejection");
    },
    (reason) => reason,
  );
}

function errorEvidence(message: string): Readonly<{
  readonly classification: "error";
  readonly name: "Error";
  readonly message: string;
}> {
  return { classification: "error", name: "Error", message };
}

function makeFixture(
  stableMode: InitMode = "success",
  teacherMode: InitMode = "success",
): Fixture {
  const calls: Calls = {
    stableFactory: 0,
    teacherFactory: 0,
    stableDigest: 0,
    teacherDigest: 0,
    stableClose: 0,
    teacherClose: 0,
    teacherAbort: 0,
  };
  const stableFactoryError = new Error("stable factory failed");
  const teacherFactoryError = new Error("teacher factory failed");
  const fixture = {} as Fixture;

  const stable = {
    close: function (): Promise<void> {
      calls.stableClose += 1;
      return fixture.stableCloseImplementation();
    },
  } as unknown as StableRuntime;
  const teacher = {
    close: function (): Promise<void> {
      calls.teacherClose += 1;
      return fixture.teacherCloseImplementation();
    },
    abortAndReap: function (): Promise<void> {
      calls.teacherAbort += 1;
      return fixture.teacherAbortImplementation();
    },
  } as unknown as TeacherRuntime;

  const createStableRuntime = function (): Promise<StableRuntime> {
    calls.stableFactory += 1;
    if (stableMode === "sync-throw") throw stableFactoryError;
    if (stableMode === "async-reject")
      return Promise.reject(stableFactoryError);
    return Promise.resolve(stable);
  };
  const createTeacherRuntime = function (): Promise<TeacherRuntime> {
    calls.teacherFactory += 1;
    if (teacherMode === "sync-throw") throw teacherFactoryError;
    if (teacherMode === "async-reject")
      return Promise.reject(teacherFactoryError);
    return Promise.resolve(teacher);
  };
  const getStableRuntimeReceiptDigest = function (
    runtime: StableRuntime,
  ): string {
    calls.stableDigest += 1;
    expect(runtime).toBe(stable);
    return STABLE_DIGEST;
  };
  const getTeacherRuntimeReceiptDigest = function (
    runtime: TeacherRuntime,
  ): string {
    calls.teacherDigest += 1;
    expect(runtime).toBe(teacher);
    return TEACHER_DIGEST;
  };

  Object.assign(fixture, {
    calls,
    stable,
    teacher,
    stableFactoryError,
    teacherFactoryError,
    dependencies: {
      createStableRuntime,
      createTeacherRuntime,
      getStableRuntimeReceiptDigest,
      getTeacherRuntimeReceiptDigest,
    },
    stableCloseImplementation: () => Promise.resolve(),
    teacherCloseImplementation: () => Promise.resolve(),
    teacherAbortImplementation: () => Promise.resolve(),
  });
  return fixture;
}

function replaceDependencies(
  base: FloodgateV7ProductionRuntimeOwnerCoreDependencies,
  replacement: Partial<FloodgateV7ProductionRuntimeOwnerCoreDependencies>,
): FloodgateV7ProductionRuntimeOwnerCoreDependencies {
  return {
    createStableRuntime:
      replacement.createStableRuntime ?? base.createStableRuntime,
    createTeacherRuntime:
      replacement.createTeacherRuntime ?? base.createTeacherRuntime,
    getStableRuntimeReceiptDigest:
      replacement.getStableRuntimeReceiptDigest ??
      base.getStableRuntimeReceiptDigest,
    getTeacherRuntimeReceiptDigest:
      replacement.getTeacherRuntimeReceiptDigest ??
      base.getTeacherRuntimeReceiptDigest,
  };
}

const FAILED_INITIALIZATION_CASES = [
  ["sync-throw", "success"],
  ["async-reject", "success"],
  ["success", "sync-throw"],
  ["success", "async-reject"],
  ["sync-throw", "sync-throw"],
  ["sync-throw", "async-reject"],
  ["async-reject", "sync-throw"],
  ["async-reject", "async-reject"],
] as const satisfies readonly (readonly [InitMode, InitMode])[];

describe("Floodgate v7 production runtime owner", () => {
  it("starts both runtimes concurrently, waits for both, then exposes only a frozen zero-work owner", async () => {
    const fixture = makeFixture();
    const stableStart = deferred<StableRuntime>();
    const teacherStart = deferred<TeacherRuntime>();
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        fixture.calls.stableFactory += 1;
        return stableStart.promise;
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        fixture.calls.teacherFactory += 1;
        return teacherStart.promise;
      },
    });

    const result =
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    expect(Object.isFrozen(result)).toBe(true);
    expect(fixture.calls.stableFactory).toBe(1);
    expect(fixture.calls.teacherFactory).toBe(1);
    expect(fixture.calls.stableDigest).toBe(0);
    expect(fixture.calls.teacherDigest).toBe(0);

    stableStart.resolve(fixture.stable);
    await Promise.resolve();
    expect(fixture.calls.stableDigest).toBe(0);
    expect(fixture.calls.teacherDigest).toBe(0);
    teacherStart.resolve(fixture.teacher);
    const owner = await result;

    expect(Reflect.ownKeys(owner).sort()).toEqual([
      "abortAndDrain",
      "close",
      "receipt",
    ]);
    expect(Object.getPrototypeOf(owner)).toBeNull();
    expect(Object.isFrozen(owner)).toBe(true);
    expect(Object.isFrozen(owner.close)).toBe(true);
    expect(Object.isFrozen(owner.abortAndDrain)).toBe(true);
    expect(Object.getPrototypeOf(owner.receipt)).toBeNull();
    expect(Object.getPrototypeOf(owner.receipt.lifecycle)).toBeNull();
    expect(Object.getPrototypeOf(owner.receipt.nonclaims)).toBeNull();
    expect(Object.isFrozen(owner.receipt)).toBe(true);
    expect(Object.isFrozen(owner.receipt.lifecycle)).toBe(true);
    expect(Object.isFrozen(owner.receipt.nonclaims)).toBe(true);
    expect(owner.receipt).toMatchObject({
      contract: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_STATUS,
      claim_boundary: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_CLAIM_BOUNDARY,
      execution_boundary:
        "test-only-injected-runtime-factories-and-digest-getters",
      digest_authority: "injected-test-getters-not-origin-authority-v1",
      stable_runtime_receipt_sha256: STABLE_DIGEST,
      teacher_usi_runtime_receipt_sha256: TEACHER_DIGEST,
      plain_receipt_origin_claim: false,
    });
    expect(Object.values(owner.receipt.nonclaims)).toEqual(
      Array(18).fill(false),
    );
    expect(owner.receipt.nonclaims.production_factory_execution).toBe(false);
    expect(owner.receipt.nonclaims.production_runtime_origin).toBe(false);
    expect(
      owner.receipt.nonclaims.production_exact_facade_digest_authority,
    ).toBe(false);
    expect(owner.receipt.nonclaims.zero_work_evidence).toBe(false);
    expect(owner.receipt.claim_boundary).not.toContain(
      "exact-production-facade",
    );
    expect(owner.receipt.lifecycle).toMatchObject({
      initialization:
        "concurrent-factories-captured-all-settled-with-owner-deadline-v1",
      initialization_timeout_ms:
        FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS,
      cleanup_timeout_ms: FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS,
      trusted_factory_promise: "pinnable-undecorated-exact-native-promise-v1",
      invalid_factory_promise:
        "rejected-before-authority-best-effort-observation-not-runtime-ownership-v1",
      transition:
        "first-valid-zero-argument-call-wins-later-calls-return-exact-same-promise-v1",
      pre_transition_invalid_arity: "reject-without-establishing-transition-v1",
      late_invalid_calls: "join-existing-transition-v1",
      completion: "all-accepted-promises-settled-or-owner-timeout-failure-v1",
    });
    expect(fixture.calls).toMatchObject({
      stableDigest: 1,
      teacherDigest: 1,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    });
    expect("propose" in owner).toBe(false);
    expect("rescore" in owner).toBe(false);
    expect("checkpoint" in owner).toBe(false);
    expect("key" in owner).toBe(false);

    await owner.close();
  });

  it("does not turn injected getter work into production or zero-work evidence", async () => {
    const fixture = makeFixture();
    let injectedWork = 0;
    const dependencies = replaceDependencies(fixture.dependencies, {
      getStableRuntimeReceiptDigest: function (
        _runtime: StableRuntime,
      ): string {
        injectedWork += 1;
        return STABLE_DIGEST;
      },
      getTeacherRuntimeReceiptDigest: function (
        _runtime: TeacherRuntime,
      ): string {
        injectedWork += 1;
        return TEACHER_DIGEST;
      },
    });

    const owner =
      await createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    expect(injectedWork).toBe(2);
    expect(owner.receipt.status).toBe(
      FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_STATUS,
    );
    expect(owner.receipt.digest_authority).toBe(
      "injected-test-getters-not-origin-authority-v1",
    );
    expect(owner.receipt.nonclaims.zero_work_evidence).toBe(false);
    expect(owner.receipt.nonclaims.production_runtime_origin).toBe(false);
    await owner.close();
  });

  it.each(FAILED_INITIALIZATION_CASES)(
    "all-settles failed initialization %s / %s and cleans every fulfilled runtime",
    async (stableMode, teacherMode) => {
      const fixture = makeFixture(stableMode, teacherMode);
      const error = await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(
          fixture.dependencies,
        ),
      );

      expect(error).toBeInstanceOf(FloodgateV7ProductionRuntimeOwnerError);
      const ownerError = error as FloodgateV7ProductionRuntimeOwnerError;
      expect(ownerError.phase).toBe("initialization");
      expect(ownerError.operationFailures).toHaveLength(
        Number(stableMode !== "success") + Number(teacherMode !== "success"),
      );
      expect(fixture.calls).toMatchObject({
        stableFactory: 1,
        teacherFactory: 1,
        stableDigest: 0,
        teacherDigest: 0,
        stableClose: stableMode === "success" ? 1 : 0,
        teacherClose: 0,
        teacherAbort: teacherMode === "success" ? 1 : 0,
      });
    },
  );

  it("bounds fully pending initialization and cleans runtimes that fulfill after the timeout", async () => {
    const fixture = makeFixture();
    const stableStart = deferred<StableRuntime>();
    const teacherStart = deferred<TeacherRuntime>();
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        fixture.calls.stableFactory += 1;
        return stableStart.promise;
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        fixture.calls.teacherFactory += 1;
        return teacherStart.promise;
      },
    });

    const error = (await rejectionOf(
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures[0].message).toContain(
      `runtime owner initialization exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
    );
    expect(fixture.calls.stableClose).toBe(0);
    expect(fixture.calls.teacherAbort).toBe(0);

    stableStart.resolve(fixture.stable);
    teacherStart.resolve(fixture.teacher);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("bounds a factory source that resolves to the owner creation Promise and cleans the known peer", async () => {
    const fixture = makeFixture();
    const stableStart = deferred<StableRuntime>();
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return stableStart.promise;
      },
    });

    const creation =
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    stableStart.resolve(creation as unknown as StableRuntime);
    const error = (await rejectionOf(
      creation,
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures[0].message).toContain(
      `runtime owner initialization exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
    );
    expect(fixture.calls.stableClose).toBe(0);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("bounds inherited-then interference while resolving a pending factory source", async () => {
    const fixture = makeFixture();
    const stableStart = deferred<StableRuntime>();
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return stableStart.promise;
      },
    });
    const thenDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "then",
    );
    let thenCalls = 0;
    let error!: FloodgateV7ProductionRuntimeOwnerError;
    const creation =
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    try {
      Object.defineProperty(Object.prototype, "then", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: function (): void {
          thenCalls += 1;
        },
      });
      stableStart.resolve(fixture.stable);
      let captured: unknown;
      await creation.then(
        () => undefined,
        (reason) => {
          captured = reason;
        },
      );
      error = captured as FloodgateV7ProductionRuntimeOwnerError;
    } finally {
      if (thenDescriptor === undefined) {
        Reflect.deleteProperty(Object.prototype, "then");
      } else {
        Object.defineProperty(Object.prototype, "then", thenDescriptor);
      }
    }

    expect(thenCalls).toBeGreaterThan(0);
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures[0].message).toContain(
      `runtime owner initialization exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
    );
    expect(fixture.calls.stableClose).toBe(0);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("reports a cleanup timeout while rejecting failed initialization", async () => {
    const fixture = makeFixture("sync-throw", "success");
    const pendingCleanup = deferred<void>();
    fixture.teacherAbortImplementation = () => pendingCleanup.promise;

    const error = (await rejectionOf(
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(fixture.dependencies),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures[0]).toEqual(
      errorEvidence("stable factory failed"),
    );
    expect(error.cleanupFailures[0].message).toContain(
      `runtime owner cleanup exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
    );
    expect(fixture.calls.teacherAbort).toBe(1);
    pendingCleanup.resolve();
  });

  it("preserves a known factory rejection before the initialization timeout", async () => {
    const fixture = makeFixture();
    const teacherStart = deferred<TeacherRuntime>();
    const knownFailure = new Error("known stable factory rejection");
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return Promise.reject(knownFailure);
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return teacherStart.promise;
      },
    });

    const error = (await rejectionOf(
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures).toEqual([
      errorEvidence("known stable factory rejection"),
      errorEvidence(
        `Floodgate v7 production runtime owner initialization exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
      ),
    ]);
    teacherStart.resolve(fixture.teacher);
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("preserves a known runtime-capture failure before the initialization timeout", async () => {
    const fixture = makeFixture();
    const teacherStart = deferred<TeacherRuntime>();
    const invalidStable = {} as StableRuntime;
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return Promise.resolve(invalidStable);
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return teacherStart.promise;
      },
    });

    const error = (await rejectionOf(
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures).toHaveLength(2);
    expect(error.operationFailures[0].message).toContain(
      "stable runtime.close must be an own non-Proxy arity-0 function",
    );
    expect(error.operationFailures[1].message).toContain(
      `initialization exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
    );
    teacherStart.resolve(fixture.teacher);
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("keeps an early runtime-capture failure sticky after the facade is repaired", async () => {
    const fixture = makeFixture();
    const invalidStable = {} as StableRuntime;
    const stableStart = Promise.resolve(invalidStable);
    const teacherStart = deferred<TeacherRuntime>();
    let repairedCloseCalls = 0;
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return stableStart;
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return teacherStart.promise;
      },
    });

    const creation =
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    await Promise.resolve();
    Object.defineProperty(invalidStable, "close", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function (): Promise<void> {
        repairedCloseCalls += 1;
        return Promise.resolve();
      },
    });
    teacherStart.resolve(fixture.teacher);
    const error = (await rejectionOf(
      creation,
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures[0].message).toContain(
      "stable runtime.close must be an own non-Proxy arity-0 function",
    );
    expect(repairedCloseCalls).toBe(0);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("orders stable capture failure before teacher rejection", async () => {
    const fixture = makeFixture();
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return Promise.resolve({} as StableRuntime);
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return Promise.reject(new Error("teacher factory rejected"));
      },
    });

    const error = (await rejectionOf(
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures).toHaveLength(2);
    expect(error.operationFailures[0].message).toContain(
      "stable runtime.close must be an own non-Proxy arity-0 function",
    );
    expect(error.operationFailures[1]).toEqual(
      errorEvidence("teacher factory rejected"),
    );
  });

  it("attempts both digest authorities only after both factories succeed and preserves digest plus cleanup failures", async () => {
    const fixture = makeFixture();
    const stableDigestError = new Error("stable digest failed");
    const teacherDigestError = new Error("teacher digest failed");
    const stableCleanupError = new Error("stable cleanup failed");
    const teacherCleanupError = new Error("teacher cleanup failed");
    fixture.stableCloseImplementation = function (): Promise<void> {
      throw stableCleanupError;
    };
    fixture.teacherAbortImplementation = function (): Promise<void> {
      return Promise.reject(teacherCleanupError);
    };
    const dependencies = replaceDependencies(fixture.dependencies, {
      getStableRuntimeReceiptDigest: function (
        _runtime: StableRuntime,
      ): string {
        fixture.calls.stableDigest += 1;
        throw stableDigestError;
      },
      getTeacherRuntimeReceiptDigest: function (
        _runtime: TeacherRuntime,
      ): string {
        fixture.calls.teacherDigest += 1;
        throw teacherDigestError;
      },
    });

    const error = (await rejectionOf(
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
    )) as FloodgateV7ProductionRuntimeOwnerError;

    expect(error.phase).toBe("digest-authority");
    expect(error.operationFailures).toEqual([
      errorEvidence("stable digest failed"),
      errorEvidence("teacher digest failed"),
    ]);
    expect(error.primary).toBeInstanceOf(AggregateError);
    expect((error.primary as AggregateError).errors).toEqual([
      errorEvidence("stable digest failed"),
      errorEvidence("teacher digest failed"),
    ]);
    expect(error.cleanupFailures).toEqual([
      errorEvidence("stable cleanup failed"),
      errorEvidence("teacher cleanup failed"),
    ]);
    expect(error.cleanupFailure?.errors).toEqual([
      errorEvidence("stable cleanup failed"),
      errorEvidence("teacher cleanup failed"),
    ]);
    expect(fixture.calls).toMatchObject({
      stableDigest: 1,
      teacherDigest: 1,
      stableClose: 1,
      teacherClose: 0,
      teacherAbort: 1,
    });
  });

  it("publishes immutable failure snapshots without exposing caller-owned Error objects", async () => {
    const fixture = makeFixture();
    const stableDigestError = new Error("stable digest snapshot");
    const teacherDigestError = new Error("teacher digest snapshot");
    const stableCleanupError = new Error("stable cleanup snapshot");
    const teacherCleanupError = new Error("teacher cleanup snapshot");
    fixture.stableCloseImplementation = () =>
      Promise.reject(stableCleanupError);
    fixture.teacherAbortImplementation = () =>
      Promise.reject(teacherCleanupError);
    const dependencies = replaceDependencies(fixture.dependencies, {
      getStableRuntimeReceiptDigest: function (
        _runtime: StableRuntime,
      ): string {
        throw stableDigestError;
      },
      getTeacherRuntimeReceiptDigest: function (
        _runtime: TeacherRuntime,
      ): string {
        throw teacherDigestError;
      },
    });

    const creation =
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    const first = (await rejectionOf(
      creation,
    )) as FloodgateV7ProductionRuntimeOwnerError;
    const primary = first.primary as AggregateError;
    const cleanup = first.cleanupFailure as AggregateError;
    const original = {
      stack: first.stack,
      primaryStack: primary.stack,
      cleanupStack: cleanup.stack,
      operationMessage: first.operationFailures[0].message,
      cleanupMessage: first.cleanupFailures[0].message,
    };

    expect(first.operationFailures[0]).not.toBe(stableDigestError);
    expect(first.cleanupFailures[0]).not.toBe(stableCleanupError);
    expect(Reflect.set(first, "stack", "poisoned owner stack")).toBe(false);
    expect(Reflect.set(primary, "stack", "poisoned primary stack")).toBe(false);
    expect(Reflect.set(cleanup, "stack", "poisoned cleanup stack")).toBe(false);
    expect(
      Reflect.set(first.operationFailures[0], "message", "poisoned operation"),
    ).toBe(false);
    expect(
      Reflect.set(first.cleanupFailures[0], "message", "poisoned cleanup"),
    ).toBe(false);

    stableDigestError.message = "raw operation changed later";
    stableCleanupError.message = "raw cleanup changed later";
    const second = (await rejectionOf(
      creation,
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(second).toBe(first);
    expect(second.stack).toBe(original.stack);
    expect((second.primary as AggregateError).stack).toBe(
      original.primaryStack,
    );
    expect(second.cleanupFailure?.stack).toBe(original.cleanupStack);
    expect(second.operationFailures[0].message).toBe(original.operationMessage);
    expect(second.cleanupFailures[0].message).toBe(original.cleanupMessage);
    expect(Object.getOwnPropertyDescriptor(second, "stack")).toMatchObject({
      writable: false,
      configurable: false,
    });
    expect(
      Object.getOwnPropertyDescriptor(
        second.primary as AggregateError,
        "stack",
      ),
    ).toMatchObject({ writable: false, configurable: false });
    expect(Object.isFrozen(second.operationFailures[0])).toBe(true);
    expect(Object.isFrozen(second.cleanupFailures[0])).toBe(true);
  });

  it("captures failure evidence without live stack formatting or inherited name access", async () => {
    const fixture = makeFixture("sync-throw", "success");
    const prepareStackDescriptor = Object.getOwnPropertyDescriptor(
      Error,
      "prepareStackTrace",
    );
    const objectNameDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "name",
    );
    const errorNameDescriptor = Object.getOwnPropertyDescriptor(
      Error.prototype,
      "name",
    )!;
    let traps = 0;
    let error!: FloodgateV7ProductionRuntimeOwnerError;
    try {
      Object.defineProperty(Error, "prepareStackTrace", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: () => {
          traps += 1;
          throw new Error("live stack formatter must not run");
        },
      });
      Object.defineProperty(Object.prototype, "name", {
        configurable: true,
        enumerable: false,
        get() {
          traps += 1;
          throw new Error("inherited name getter must not run");
        },
      });
      Object.defineProperty(Error.prototype, "name", {
        configurable: errorNameDescriptor.configurable,
        enumerable: errorNameDescriptor.enumerable,
        get() {
          traps += 1;
          throw new Error("live Error name getter must not run");
        },
        set() {
          traps += 1;
          throw new Error("live Error name setter must not run");
        },
      });
      error = (await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(
          fixture.dependencies,
        ),
      )) as FloodgateV7ProductionRuntimeOwnerError;
    } finally {
      if (prepareStackDescriptor === undefined) {
        Reflect.deleteProperty(Error, "prepareStackTrace");
      } else {
        Object.defineProperty(
          Error,
          "prepareStackTrace",
          prepareStackDescriptor,
        );
      }
      if (objectNameDescriptor === undefined) {
        Reflect.deleteProperty(Object.prototype, "name");
      } else {
        Object.defineProperty(Object.prototype, "name", objectNameDescriptor);
      }
      Object.defineProperty(Error.prototype, "name", errorNameDescriptor);
    }

    expect(traps).toBe(0);
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures[0]).toEqual(
      errorEvidence("stable factory failed"),
    );
    expect(error.stack).toBe(
      "FloodgateV7ProductionRuntimeOwnerError: Floodgate v7 production runtime owner failed during initialization",
    );
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("defines array evidence indices without inherited numeric setters", async () => {
    const fixture = makeFixture("sync-throw", "success");
    const zeroDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "0",
    );
    let traps = 0;
    let error!: FloodgateV7ProductionRuntimeOwnerError;
    try {
      Object.defineProperty(Array.prototype, "0", {
        configurable: true,
        enumerable: false,
        get() {
          return undefined;
        },
        set(value: unknown) {
          if (value !== null && typeof value === "object") {
            const classification = Object.getOwnPropertyDescriptor(
              value,
              "classification",
            );
            if (classification?.value === "error") traps += 1;
          }
          Object.defineProperty(this, "0", {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
        },
      });
      error = (await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(
          fixture.dependencies,
        ),
      )) as FloodgateV7ProductionRuntimeOwnerError;
    } finally {
      if (zeroDescriptor === undefined) {
        Reflect.deleteProperty(Array.prototype, "0");
      } else {
        Object.defineProperty(Array.prototype, "0", zeroDescriptor);
      }
    }

    expect(traps).toBe(0);
    expect(error.operationFailures[0]).toEqual(
      errorEvidence("stable factory failed"),
    );
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it.each([
    ["stable", "not-a-digest"],
    ["teacher", "A".repeat(64)],
  ] as const)("fails closed for an invalid %s digest", async (side, digest) => {
    const fixture = makeFixture();
    const dependencies = replaceDependencies(fixture.dependencies, {
      ...(side === "stable"
        ? {
            getStableRuntimeReceiptDigest: function (
              _runtime: StableRuntime,
            ): string {
              return digest;
            },
          }
        : {
            getTeacherRuntimeReceiptDigest: function (
              _runtime: TeacherRuntime,
            ): string {
              return digest;
            },
          }),
    });

    const error = (await rejectionOf(
      createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("digest-authority");
    expect(error.operationFailures).toHaveLength(1);
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("validates digest code units without live RegExp.exec", async () => {
    const fixture = makeFixture();
    const execDescriptor = Object.getOwnPropertyDescriptor(
      RegExp.prototype,
      "exec",
    )!;
    let traps = 0;
    const invalidDigest = `${"a".repeat(63)}G`;
    const dependencies = replaceDependencies(fixture.dependencies, {
      getStableRuntimeReceiptDigest: function (
        _runtime: StableRuntime,
      ): string {
        return invalidDigest;
      },
      getTeacherRuntimeReceiptDigest: function (
        _runtime: TeacherRuntime,
      ): string {
        return invalidDigest;
      },
    });
    let error!: FloodgateV7ProductionRuntimeOwnerError;
    try {
      Object.defineProperty(RegExp.prototype, "exec", {
        ...execDescriptor,
        value: function (): RegExpExecArray {
          traps += 1;
          return [] as unknown as RegExpExecArray;
        },
      });
      error = (await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
      )) as FloodgateV7ProductionRuntimeOwnerError;
    } finally {
      Object.defineProperty(RegExp.prototype, "exec", execDescriptor);
    }

    expect(traps).toBe(0);
    expect(error.phase).toBe("digest-authority");
    expect(error.operationFailures).toHaveLength(2);
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("rejects accessor lifecycle descriptors without inherited value access", async () => {
    const fixture = makeFixture();
    let lifecycleGetterReads = 0;
    const invalidStable = Object.defineProperty({}, "close", {
      configurable: true,
      enumerable: true,
      get() {
        lifecycleGetterReads += 1;
        throw new Error("runtime lifecycle getter must not run");
      },
    }) as StableRuntime;
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return Promise.resolve(invalidStable);
      },
    });
    const valueDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let inheritedValueReads = 0;
    let error!: FloodgateV7ProductionRuntimeOwnerError;
    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        enumerable: false,
        get() {
          inheritedValueReads += 1;
          throw new Error("inherited descriptor value must not run");
        },
      });
      error = (await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
      )) as FloodgateV7ProductionRuntimeOwnerError;
    } finally {
      if (valueDescriptor === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", valueDescriptor);
      }
    }

    expect(inheritedValueReads).toBe(0);
    expect(lifecycleGetterReads).toBe(0);
    expect(error.phase).toBe("initialization");
    expect(error.operationFailures[0].message).toContain(
      "stable runtime.close must be an own non-Proxy arity-0 function",
    );
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it.each(["close", "abortAndDrain"] as const)(
    "makes first %s transition win and returns its exact Promise forever",
    async (firstTransition) => {
      const fixture = makeFixture();
      const stableDone = deferred<void>();
      const teacherDone = deferred<void>();
      fixture.teacherCloseImplementation = () => teacherDone.promise;
      fixture.teacherAbortImplementation = () => teacherDone.promise;
      const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
        fixture.dependencies,
      );
      let reentrant: Promise<void> | undefined;
      fixture.stableCloseImplementation = () => {
        reentrant =
          firstTransition === "close" ? owner.abortAndDrain() : owner.close();
        return stableDone.promise;
      };

      const first = owner[firstTransition]();
      expect(Object.isFrozen(first)).toBe(true);
      const competing =
        firstTransition === "close" ? owner.abortAndDrain() : owner.close();
      expect(competing).toBe(first);
      expect(reentrant).toBe(first);
      expect(owner[firstTransition]()).toBe(first);
      expect(fixture.calls.stableClose).toBe(1);
      expect(fixture.calls.teacherClose).toBe(
        firstTransition === "close" ? 1 : 0,
      );
      expect(fixture.calls.teacherAbort).toBe(
        firstTransition === "abortAndDrain" ? 1 : 0,
      );

      stableDone.resolve();
      teacherDone.resolve();
      await first;
      expect(owner.close()).toBe(first);
      expect(owner.abortAndDrain()).toBe(first);
    },
  );

  it("rejects invalid arity before transition but joins it after a valid call wins", async () => {
    const fixture = makeFixture();
    const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
      fixture.dependencies,
    );

    const early = Reflect.apply(owner.close, undefined, ["early-extra"]);
    const earlyError = (await rejectionOf(
      early,
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(earlyError.phase).toBe("capture");
    expect(fixture.calls.stableClose).toBe(0);
    expect(fixture.calls.teacherClose).toBe(0);
    expect(fixture.calls.teacherAbort).toBe(0);

    const stableDone = deferred<void>();
    const teacherDone = deferred<void>();
    fixture.stableCloseImplementation = () => stableDone.promise;
    fixture.teacherAbortImplementation = () => teacherDone.promise;
    const lifecycle = owner.abortAndDrain();
    expect(Reflect.apply(owner.close, undefined, ["late-extra"])).toBe(
      lifecycle,
    );
    expect(Reflect.apply(owner.abortAndDrain, undefined, ["late-extra"])).toBe(
      lifecycle,
    );
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(1);

    stableDone.resolve();
    teacherDone.resolve();
    await lifecycle;
  });

  it("rejects a child that returns the owner's lifecycle Promise instead of creating a cleanup cycle", async () => {
    const fixture = makeFixture();
    const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
      fixture.dependencies,
    );
    fixture.stableCloseImplementation = () => owner.close();

    const lifecycle = owner.close();
    const error = (await rejectionOf(
      lifecycle,
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("cleanup");
    expect(error.cleanupFailures).toHaveLength(1);
    expect(error.cleanupFailures[0].message).toContain(
      "stable runtime close must return an exact native Promise",
    );
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
    expect(owner.close()).toBe(lifecycle);
  });

  it("rejects a reused adopted source that fulfills cleanup with a runtime value", async () => {
    const fixture = makeFixture();
    const stableSource = Promise.resolve(fixture.stable);
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return stableSource;
      },
    });
    const owner =
      await createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    fixture.stableCloseImplementation = () =>
      stableSource as unknown as Promise<void>;

    const error = (await rejectionOf(
      owner.close(),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("cleanup");
    expect(error.cleanupFailures[0].message).toContain(
      "stable runtime close must fulfill with undefined",
    );
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
  });

  it.each(["wrapped-lifecycle", "pending-resolves-to-lifecycle"] as const)(
    "bounds a hidden cleanup dependency cycle (%s)",
    async (kind) => {
      const fixture = makeFixture();
      const pending = deferred<void>();
      const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
        fixture.dependencies,
      );
      fixture.stableCloseImplementation =
        kind === "wrapped-lifecycle"
          ? () => Promise.resolve(owner.close())
          : () => pending.promise;

      const lifecycle = owner.close();
      if (kind === "pending-resolves-to-lifecycle") {
        pending.resolve(lifecycle as unknown as void);
      }
      const error = (await rejectionOf(
        lifecycle,
      )) as FloodgateV7ProductionRuntimeOwnerError;
      expect(error.phase).toBe("cleanup");
      expect(error.cleanupFailures).toHaveLength(1);
      expect(error.cleanupFailures[0].message).toContain(
        `runtime owner cleanup exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
      );
      expect(fixture.calls.stableClose).toBe(1);
      expect(fixture.calls.teacherClose).toBe(1);
      expect(owner.close()).toBe(lifecycle);
    },
  );

  it("preserves a known cleanup rejection before the cleanup timeout", async () => {
    const fixture = makeFixture();
    const teacherPending = deferred<void>();
    fixture.stableCloseImplementation = () =>
      Promise.reject(new Error("known stable cleanup rejection"));
    fixture.teacherCloseImplementation = () => teacherPending.promise;
    const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
      fixture.dependencies,
    );

    const lifecycle = owner.close();
    const error = (await rejectionOf(
      lifecycle,
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(error.phase).toBe("cleanup");
    expect(error.cleanupFailures).toEqual([
      errorEvidence("known stable cleanup rejection"),
      errorEvidence(
        `Floodgate v7 production runtime owner cleanup exceeded its ${FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_TEST_TIMEOUT_MS}ms deadline`,
      ),
    ]);
    teacherPending.resolve();
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
  });

  it.each(["close", "abortAndDrain"] as const)(
    "%s waits for both cleanup attempts and aggregates failures in stable/teacher order",
    async (transition) => {
      const fixture = makeFixture();
      const stableError = new Error("stable transition failed");
      const teacherError = new Error("teacher transition failed");
      const teacherDone = deferred<void>();
      fixture.stableCloseImplementation = () => Promise.reject(stableError);
      fixture.teacherCloseImplementation = () => teacherDone.promise;
      fixture.teacherAbortImplementation = () => teacherDone.promise;
      const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
        fixture.dependencies,
      );

      const lifecycle = owner[transition]();
      let settled = false;
      void lifecycle.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(fixture.calls.stableClose).toBe(1);
      expect(fixture.calls.teacherClose + fixture.calls.teacherAbort).toBe(1);

      teacherDone.reject(teacherError);
      const error = (await rejectionOf(
        lifecycle,
      )) as FloodgateV7ProductionRuntimeOwnerError;
      expect(error.phase).toBe("cleanup");
      expect(error.operationFailures).toEqual([]);
      expect(error.cleanupFailures).toEqual([
        errorEvidence("stable transition failed"),
        errorEvidence("teacher transition failed"),
      ]);
      expect(error.cleanupFailure?.errors).toEqual([
        errorEvidence("stable transition failed"),
        errorEvidence("teacher transition failed"),
      ]);
      expect(Object.isFrozen(error)).toBe(true);
      expect(Object.isFrozen(error.cleanupFailure)).toBe(true);
      expect(Object.isFrozen(error.cleanupFailure?.errors)).toBe(true);
      expect(owner.close()).toBe(lifecycle);
      expect(owner.abortAndDrain()).toBe(lifecycle);
    },
  );

  it("rejects Proxy, extra-key, and wrong-arity dependency records before any factory runs", async () => {
    const fixture = makeFixture();
    let proxyTrapCalls = 0;
    const proxy = new Proxy(fixture.dependencies, {
      get() {
        proxyTrapCalls += 1;
        throw new Error("dependency Proxy trap must not run");
      },
      ownKeys() {
        proxyTrapCalls += 1;
        throw new Error("dependency Proxy trap must not run");
      },
    });
    const extra = { ...fixture.dependencies, extra: true };
    const wrongArity = {
      ...fixture.dependencies,
      createStableRuntime: function (_unexpected: unknown) {
        return Promise.resolve(fixture.stable);
      },
    };

    for (const dependencies of [proxy, extra, wrongArity]) {
      const error = (await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(
          dependencies as FloodgateV7ProductionRuntimeOwnerCoreDependencies,
        ),
      )) as FloodgateV7ProductionRuntimeOwnerError;
      expect(error.phase).toBe("capture");
    }
    expect(proxyTrapCalls).toBe(0);
    expect(fixture.calls.stableFactory).toBe(0);
    expect(fixture.calls.teacherFactory).toBe(0);
  });

  it.each(["thenable", "proxy-promise", "decorated-promise"] as const)(
    "fails closed without assimilating or claiming ownership of an invalid factory %s and cleans the trusted peer",
    async (kind) => {
      const fixture = makeFixture();
      let thenReads = 0;
      let invalid: unknown;
      if (kind === "thenable") {
        invalid = Object.defineProperty({}, "then", {
          get() {
            thenReads += 1;
            throw new Error("thenable getter must not run");
          },
        });
      } else if (kind === "proxy-promise") {
        invalid = new Proxy(Promise.resolve(fixture.stable), {
          get() {
            thenReads += 1;
            throw new Error("Promise Proxy trap must not run");
          },
        });
      } else {
        invalid = Promise.resolve(fixture.stable);
        Object.defineProperty(invalid, "decoration", { value: true });
      }
      const dependencies = replaceDependencies(fixture.dependencies, {
        createStableRuntime: function (): Promise<StableRuntime> {
          return invalid as Promise<StableRuntime>;
        },
      });

      const error = (await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
      )) as FloodgateV7ProductionRuntimeOwnerError;
      expect(error.phase).toBe("initialization");
      expect(error.operationFailures).toHaveLength(1);
      expect(thenReads).toBe(0);
      expect(fixture.calls.teacherAbort).toBe(1);
      expect(fixture.calls.stableClose).toBe(0);
    },
  );

  it.each(["non-extensible", "hostile-constructor"] as const)(
    "rejects a fulfilled but unpinnable factory Promise (%s) without claiming its runtime",
    async (kind) => {
      const fixture = makeFixture();
      let constructorReads = 0;
      const invalid = Promise.resolve(fixture.stable);
      if (kind === "non-extensible") {
        Object.preventExtensions(invalid);
      } else {
        Object.defineProperty(invalid, "constructor", {
          configurable: false,
          enumerable: false,
          get() {
            constructorReads += 1;
            throw new Error("hostile Promise constructor must not run");
          },
        });
      }
      const dependencies = replaceDependencies(fixture.dependencies, {
        createStableRuntime: function (): Promise<StableRuntime> {
          return invalid;
        },
      });

      const error = (await rejectionOf(
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies),
      )) as FloodgateV7ProductionRuntimeOwnerError;
      expect(error.phase).toBe("initialization");
      expect(error.operationFailures).toHaveLength(1);
      expect(constructorReads).toBe(0);
      expect(fixture.calls.stableClose).toBe(0);
      expect(fixture.calls.teacherAbort).toBe(1);
    },
  );

  it("pins source, returned, and lifecycle Promises away from live constructor/species", async () => {
    const fixture = makeFixture();
    const stableStart = Promise.resolve(fixture.stable);
    const teacherStart = Promise.resolve(fixture.teacher);
    const stableCleanup = Promise.resolve();
    const teacherCleanup = Promise.resolve();
    fixture.stableCloseImplementation = () => stableCleanup;
    fixture.teacherAbortImplementation = () => teacherCleanup;
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return stableStart;
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return teacherStart;
      },
    });
    const speciesDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      Symbol.species,
    )!;
    const constructorDescriptor = Object.getOwnPropertyDescriptor(
      Promise.prototype,
      "constructor",
    )!;
    const weakSetAddDescriptor = Object.getOwnPropertyDescriptor(
      WeakSet.prototype,
      "add",
    )!;
    const weakSetHasDescriptor = Object.getOwnPropertyDescriptor(
      WeakSet.prototype,
      "has",
    )!;
    const setTimeoutDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "setTimeout",
    )!;
    const clearTimeoutDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "clearTimeout",
    )!;
    let traps = 0;
    const poison = (): void => {
      Object.defineProperty(Promise, Symbol.species, {
        configurable: speciesDescriptor.configurable,
        enumerable: speciesDescriptor.enumerable,
        get() {
          traps += 1;
          throw new Error("live Promise species must not run");
        },
      });
      Object.defineProperty(Promise.prototype, "constructor", {
        configurable: constructorDescriptor.configurable,
        enumerable: constructorDescriptor.enumerable,
        get() {
          traps += 1;
          throw new Error("live Promise prototype constructor must not run");
        },
      });
      Object.defineProperty(WeakSet.prototype, "add", {
        ...weakSetAddDescriptor,
        value: () => {
          traps += 1;
          throw new Error("live WeakSet.add must not run");
        },
      });
      Object.defineProperty(WeakSet.prototype, "has", {
        ...weakSetHasDescriptor,
        value: () => {
          traps += 1;
          throw new Error("live WeakSet.has must not run");
        },
      });
      Object.defineProperty(globalThis, "setTimeout", {
        ...setTimeoutDescriptor,
        value: () => {
          traps += 1;
          throw new Error("live setTimeout must not run");
        },
      });
      Object.defineProperty(globalThis, "clearTimeout", {
        ...clearTimeoutDescriptor,
        value: () => {
          traps += 1;
          throw new Error("live clearTimeout must not run");
        },
      });
    };
    const restore = (): void => {
      Object.defineProperty(Promise, Symbol.species, speciesDescriptor);
      Object.defineProperty(
        Promise.prototype,
        "constructor",
        constructorDescriptor,
      );
      Object.defineProperty(WeakSet.prototype, "add", weakSetAddDescriptor);
      Object.defineProperty(WeakSet.prototype, "has", weakSetHasDescriptor);
      Object.defineProperty(globalThis, "setTimeout", setTimeoutDescriptor);
      Object.defineProperty(globalThis, "clearTimeout", clearTimeoutDescriptor);
    };

    let creation!: ReturnType<
      typeof createFloodgateV7ProductionRuntimeOwnerCoreForTests
    >;
    let creationObservation!: Promise<unknown>;
    try {
      poison();
      creation =
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
      creationObservation = creation.then(() => undefined);
    } finally {
      restore();
    }
    await creationObservation;
    const owner = await creation;

    let lifecycle!: Promise<void>;
    let lifecycleObservation!: Promise<unknown>;
    try {
      poison();
      lifecycle = owner.abortAndDrain();
      lifecycleObservation = lifecycle.then(() => undefined);
    } finally {
      restore();
    }
    await lifecycleObservation;
    await lifecycle;
    expect(traps).toBe(0);
    expect(Object.isFrozen(creation)).toBe(true);
    expect(Object.isFrozen(lifecycle)).toBe(true);
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("does not depend on live Array map, flatMap, or push during cleanup", async () => {
    const fixture = makeFixture();
    const stableCleanup = Promise.resolve();
    const teacherCleanup = Promise.resolve();
    fixture.stableCloseImplementation = () => stableCleanup;
    fixture.teacherCloseImplementation = () => teacherCleanup;
    const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
      fixture.dependencies,
    );
    const mapDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "map",
    )!;
    const flatMapDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "flatMap",
    )!;
    const pushDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "push",
    )!;
    let traps = 0;
    const poison = (): never => {
      traps += 1;
      throw new Error("live Array helper must not run");
    };

    let lifecycle!: Promise<void>;
    try {
      Object.defineProperty(Array.prototype, "map", {
        ...mapDescriptor,
        value: poison,
      });
      Object.defineProperty(Array.prototype, "flatMap", {
        ...flatMapDescriptor,
        value: poison,
      });
      Object.defineProperty(Array.prototype, "push", {
        ...pushDescriptor,
        value: poison,
      });
      lifecycle = owner.close();
      await lifecycle;
    } finally {
      Object.defineProperty(Array.prototype, "map", mapDescriptor);
      Object.defineProperty(Array.prototype, "flatMap", flatMapDescriptor);
      Object.defineProperty(Array.prototype, "push", pushDescriptor);
    }
    expect(traps).toBe(0);
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
  });

  it("does not re-assimilate an already fulfilled runtime through Object.prototype.then", async () => {
    const fixture = makeFixture();
    const stableStart = Promise.resolve(fixture.stable);
    const teacherStart = Promise.resolve(fixture.teacher);
    const thenDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "then",
    );
    let thenCalls = 0;
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        Object.defineProperty(Object.prototype, "then", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function (resolve: (value: undefined) => void): void {
            thenCalls += 1;
            resolve(undefined);
          },
        });
        return stableStart;
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return teacherStart;
      },
    });

    let owner:
      | Awaited<
          ReturnType<typeof createFloodgateV7ProductionRuntimeOwnerCoreForTests>
        >
      | undefined;
    let failure: unknown;
    try {
      owner =
        await createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    } catch (cause) {
      failure = cause;
    } finally {
      if (thenDescriptor === undefined) {
        Reflect.deleteProperty(Object.prototype, "then");
      } else {
        Object.defineProperty(Object.prototype, "then", thenDescriptor);
      }
    }

    expect(failure).toBeUndefined();
    expect(owner).toBeDefined();
    expect(thenCalls).toBe(0);
    expect(fixture.calls.stableDigest).toBe(1);
    expect(fixture.calls.teacherDigest).toBe(1);
    await owner?.close();
  });

  it("pins owner arrays as non-thenable before Promise resolution", async () => {
    const targets = [Array.prototype, Object.prototype] as const;
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const fixture = makeFixture();
      const stableCleanup = Promise.resolve();
      const teacherCleanup = Promise.resolve();
      const thenDescriptor = Object.getOwnPropertyDescriptor(target, "then");
      let thenCalls = 0;
      fixture.stableCloseImplementation = function (): Promise<void> {
        Object.defineProperty(target, "then", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function (): void {
            thenCalls += 1;
          },
        });
        return stableCleanup;
      };
      fixture.teacherCloseImplementation = () => teacherCleanup;
      const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
        fixture.dependencies,
      );

      try {
        await owner.close();
      } finally {
        if (thenDescriptor === undefined) {
          Reflect.deleteProperty(target, "then");
        } else {
          Object.defineProperty(target, "then", thenDescriptor);
        }
      }
      expect(thenCalls).toBe(0);
      expect(fixture.calls.stableClose).toBe(1);
      expect(fixture.calls.teacherClose).toBe(1);
    }
  });

  it("uses an own iterator and next method for every all-settled input", async () => {
    const fixture = makeFixture();
    const stableStart = Promise.resolve(fixture.stable);
    const teacherStart = Promise.resolve(fixture.teacher);
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return stableStart;
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return teacherStart;
      },
    });
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    )!;
    const iteratorPrototype = Object.getPrototypeOf([][Symbol.iterator]());
    const nextDescriptor = Object.getOwnPropertyDescriptor(
      iteratorPrototype,
      "next",
    )!;
    let traps = 0;
    const poison = (): never => {
      traps += 1;
      throw new Error("live Array iterator must not run");
    };

    let creation!: ReturnType<
      typeof createFloodgateV7ProductionRuntimeOwnerCoreForTests
    >;
    try {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        ...iteratorDescriptor,
        value: poison,
      });
      Object.defineProperty(iteratorPrototype, "next", {
        ...nextDescriptor,
        value: poison,
      });
      creation =
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    } finally {
      Object.defineProperty(
        Array.prototype,
        Symbol.iterator,
        iteratorDescriptor,
      );
      Object.defineProperty(iteratorPrototype, "next", nextDescriptor);
    }
    const owner = await creation;
    expect(traps).toBe(0);
    await owner.close();
  });

  it("uses captured resolve, allSettled, then, and Reflect.apply after the live intrinsics are replaced", async () => {
    const fixture = makeFixture();
    const stableStart = Promise.resolve(fixture.stable);
    const teacherStart = Promise.resolve(fixture.teacher);
    const cleanupDone = Promise.resolve();
    fixture.stableCloseImplementation = () => cleanupDone;
    fixture.teacherAbortImplementation = () => cleanupDone;
    const dependencies = replaceDependencies(fixture.dependencies, {
      createStableRuntime: function (): Promise<StableRuntime> {
        return stableStart;
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        return teacherStart;
      },
    });
    const applyDescriptor = Object.getOwnPropertyDescriptor(Reflect, "apply")!;
    const resolveDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      "resolve",
    )!;
    const allSettledDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      "allSettled",
    )!;
    const thenDescriptor = Object.getOwnPropertyDescriptor(
      Promise.prototype,
      "then",
    )!;
    const poisonLiveIntrinsics = (): void => {
      Object.defineProperty(Reflect, "apply", {
        ...applyDescriptor,
        value: () => {
          throw new Error("live Reflect.apply must not run");
        },
      });
      Object.defineProperty(Promise, "resolve", {
        ...resolveDescriptor,
        value: () => {
          throw new Error("live Promise.resolve must not run");
        },
      });
      Object.defineProperty(Promise, "allSettled", {
        ...allSettledDescriptor,
        value: () => {
          throw new Error("live Promise.allSettled must not run");
        },
      });
      Object.defineProperty(Promise.prototype, "then", {
        ...thenDescriptor,
        value: () => {
          throw new Error("live Promise.prototype.then must not run");
        },
      });
    };
    const restoreLiveIntrinsics = (): void => {
      Object.defineProperty(Reflect, "apply", applyDescriptor);
      Object.defineProperty(Promise, "resolve", resolveDescriptor);
      Object.defineProperty(Promise, "allSettled", allSettledDescriptor);
      Object.defineProperty(Promise.prototype, "then", thenDescriptor);
    };

    let creation!: ReturnType<
      typeof createFloodgateV7ProductionRuntimeOwnerCoreForTests
    >;
    try {
      poisonLiveIntrinsics();
      creation =
        createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);
    } finally {
      restoreLiveIntrinsics();
    }
    const owner = await creation;

    let cleanup!: Promise<void>;
    try {
      poisonLiveIntrinsics();
      cleanup = owner.abortAndDrain();
    } finally {
      restoreLiveIntrinsics();
    }
    await cleanup;
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(1);
  });

  it("keeps the production boundary zero-argument and wired only to fixed production imports", async () => {
    type ProductionOwner = Awaited<
      ReturnType<typeof createFloodgateV7ProductionRuntimeOwner>
    >;
    const productionReceiptLiterals = (
      owner: ProductionOwner,
    ): readonly [
      typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_STATUS,
      typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLAIM_BOUNDARY,
      "exact-production-facade-authorities-v1",
      typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_INITIALIZATION_TIMEOUT_MS,
      typeof FLOODGATE_V7_PRODUCTION_RUNTIME_OWNER_CLEANUP_TIMEOUT_MS,
    ] => [
      owner.receipt.status,
      owner.receipt.claim_boundary,
      owner.receipt.digest_authority,
      owner.receipt.lifecycle.initialization_timeout_ms,
      owner.receipt.lifecycle.cleanup_timeout_ms,
    ];
    expect(productionReceiptLiterals).toBeTypeOf("function");
    expect(createFloodgateV7ProductionRuntimeOwner.length).toBe(0);
    expect(createFloodgateV7ProductionRuntimeOwnerCoreForTests.length).toBe(1);
    const productionError = (await rejectionOf(
      (
        createFloodgateV7ProductionRuntimeOwner as unknown as (
          injected: unknown,
        ) => Promise<unknown>
      )({}),
    )) as FloodgateV7ProductionRuntimeOwnerError;
    expect(productionError.phase).toBe("capture");

    const source = fs.readFileSync(OWNER_SOURCE_PATH, "utf8");
    expect(source).toContain("createFloodgateProductionStableWasmRuntime");
    expect(source).toContain("createFloodgateProductionTeacherUsiRuntime");
    expect(source).toContain(
      "getFloodgateProductionStableWasmRuntimeReceiptDigest",
    );
    expect(source).toContain(
      "getFloodgateProductionTeacherUsiRuntimeReceiptDigest",
    );
    expect(source).not.toContain(
      "getFloodgateProductionStableWasmRuntimeReceiptDigestCoreForTests",
    );
    expect(source).not.toContain(
      "getFloodgateProductionTeacherUsiRuntimeReceiptDigestCoreForTests",
    );
  });
});
