import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
  type FloodgateProductionTeacherProposalResult,
  type FloodgateProductionTeacherRescoreResult,
} from "../../../ml/floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "../../../ml/floodgate-stable-wasm-proposer";
import { buildFloodgateV7CompletedParentCoreForTests } from "../../../ml/floodgate-v7-completed-parent";
import {
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CONTRACT,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_STATUS,
  FloodgateV7ProductionParentCoordinatorError,
  claimFloodgateV7ProductionParentCoordinatorForCheckpoint,
  claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests,
  createFloodgateV7ProductionParentCoordinator,
  createFloodgateV7ProductionParentCoordinatorCoreForTests,
} from "../../../ml/floodgate-v7-production-parent-coordinator";
import {
  claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator,
  claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests,
  createFloodgateV7ProductionRuntimeOwnerCoreForTests,
  type FloodgateV7ProductionRuntimeOwnerCoreDependencies,
} from "../../../ml/floodgate-v7-production-runtime-owner";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import type { FloodgateTrainingParent } from "../../../ml/floodgate-training-row-consumer";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COORDINATOR_SOURCE_PATH = path.resolve(
  HERE,
  "../../../ml/floodgate-v7-production-parent-coordinator.ts",
);
const OWNER_SOURCE_PATH = path.resolve(
  HERE,
  "../../../ml/floodgate-v7-production-runtime-owner.ts",
);
const SMALL_LEGAL_SET_SFEN = "4k4/9/9/9/9/9/9/9/K8 b - 1";
const FORCED_SFEN = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 1";
const STABLE_RUNTIME_DIGEST = "c".repeat(64);
const STABLE_POOL_DIGEST = "d".repeat(64);
const RUNTIME_RECEIPT_DIGEST_DOMAIN = "shogi-floodgate-v7-runtime-receipt-v1\0";
const STABLE_PARENT_DIGEST_DOMAIN = "shogi-floodgate-stable-parent-v1\0";
const STABLE_RUNTIME_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-row-v1\0";
const OVERSIZED_CAPTURE_ENTRY_COUNT = 100_001;
const nativeArrayPush = Array.prototype.push;
const nativeObjectDefineProperty = Object.defineProperty;
const nativePromiseThen = Promise.prototype.then;
const nativeReflectApply = Reflect.apply;

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
  stablePropose: number;
  teacherPropose: number;
  teacherRescore: number;
  stableClose: number;
  teacherClose: number;
  teacherAbort: number;
}

interface RuntimeFixture {
  readonly calls: Calls;
  readonly events: string[];
  readonly stable: StableRuntime;
  readonly teacher: TeacherRuntime;
  readonly teacherReceipt: Readonly<Record<string, unknown>>;
  readonly teacherRuntimeDigest: string;
  readonly dependencies: FloodgateV7ProductionRuntimeOwnerCoreDependencies;
  stableProposeImplementation: (
    parent: Readonly<FloodgateTrainingParent>,
  ) => Promise<unknown>;
  teacherProposeImplementation: (
    sfen: string,
    legalMoveCount: number,
  ) => Promise<Readonly<FloodgateProductionTeacherProposalResult>>;
  teacherRescoreImplementation: (
    sfen: string,
    move: string,
  ) => Promise<Readonly<FloodgateProductionTeacherRescoreResult>>;
  stableCloseImplementation: () => Promise<void>;
  teacherCloseImplementation: () => Promise<void>;
  teacherAbortImplementation: () => Promise<void>;
}

function appendArrayValue<T>(values: T[], value: T): void {
  nativeReflectApply(nativeArrayPush, values, [value]);
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256(`${domain}${canonicalJson(value)}`);
}

function legalMoves(sfen: string): string[] {
  return rulesCompleteLegalMoves(positionFromSfen(sfen).position).map(
    (entry) => entry.usi,
  );
}

function makeParent(sfen = SMALL_LEGAL_SET_SFEN): FloodgateTrainingParent {
  const legal = legalMoves(sfen);
  const gameId = `sha256:${sha256(`production-parent-game:${sfen}`)}`;
  return {
    schema_version: 1,
    game_id: gameId,
    parent_id: `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${0}`)}`,
    position_id: positionKeyFromSfen(sfen),
    parent_sfen: sfen,
    ply: 0,
    played_move: legal[legal.length - 1],
  };
}

function makeTeacherReceipt(): Readonly<Record<string, unknown>> {
  return {
    contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-assets-and-runtime-dependencies",
    asset_authority_execution_boundary:
      "production-fixed-registry-and-deployment-root",
    engine_id: "YaneuraOu NNUE 9.60git 64APPLEM1",
    runtime: {
      engine_count: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
      threads_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.threads_per_engine,
      hash_mb_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.hash_mb_per_engine,
      fv_scale: 20,
      depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
      proposal_multipv_max:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
      independent_rescore_multipv:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.multipv,
      no_process_arguments: true,
      shell: false,
      minimal_environment: true,
      per_worker_private_directories: true,
      queue_bound: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines * 4,
    },
    fixed_options: [
      "EvalDir=<private-shared-snapshot>/eval",
      "FV_SCALE=20",
      "USI_Hash=64",
      "Threads=1",
      "USI_OwnBook=false",
      "BookFile=no_book",
      "NetworkDelay=0",
      "NetworkDelay2=0",
    ],
    timeouts: {
      usiMs: 15_000,
      readyMs: 120_000,
      searchMs: 600_000,
      termGraceMs: 500,
      killGraceMs: 1_000,
    },
    limits: {
      lineBytes: 64 * 1024,
      stdoutBytesPerPhase: 16 * 1024 * 1024,
      stdoutLinesPerPhase: 65_536,
      stderrBytesTotal: 8 * 1024 * 1024,
    },
    snapshot: {
      one_shared_private_snapshot: true,
      source_authority_revalidated: true,
      destination_revalidated: true,
      engine: {
        ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou,
        mode: "0500",
      },
      eval: {
        ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn,
        mode: "0400",
      },
    },
  };
}

function makeStableResult(parent: Readonly<FloodgateTrainingParent>): unknown {
  const legal = legalMoves(parent.parent_sfen);
  const stableMove = legal[Math.min(1, legal.length - 1)];
  const childSfen = childSfenAfterUsi(parent.parent_sfen, stableMove);
  const row = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: digestCanonical(STABLE_PARENT_DIGEST_DOMAIN, parent),
    stable_move: stableMove,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      termination: "requested-depth-complete",
      raw_search_score: 17,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 100,
      leaves: 50,
      root_tesu: parent.ply,
    },
  };
  return {
    schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
    row,
    runtime_binding: {
      claim_boundary:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
      execution_boundary: "production-fixed-asset-authority-and-reusable-pool",
      runtime_receipt_sha256: STABLE_RUNTIME_DIGEST,
      reusable_pool_receipt_sha256: STABLE_POOL_DIGEST,
      parent_payload_sha256: row.parent_payload_sha256,
      row_sha256: digestCanonical(STABLE_RUNTIME_ROW_DIGEST_DOMAIN, row),
      origin: "direct-owning-runtime-capability-call-v1",
      plain_result_authentication_claim: false,
    },
  };
}

function makeTeacherProposal(
  sfen: string,
  legalMoveCount: number,
): Readonly<FloodgateProductionTeacherProposalResult> {
  const legal = legalMoves(sfen);
  expect(legalMoveCount).toBe(legal.length);
  const requested = Math.min(12, legal.length);
  const moves = legal.slice(0, requested);
  return {
    depth: 16,
    lines: moves.map((move, index) => ({
      depth: 16,
      multipv: index + 1,
      cp: index,
      nodes: 10 + index,
      move,
      pv: [move],
      scoreKind: "cp" as const,
    })),
    bestmove: moves[0],
    observedNodes: 9 + moves.length,
    requested_multipv: requested,
    legal_move_count_evidence: {
      source: "caller-supplied-until-authenticated-by-v7-coordinator",
      count: legal.length,
    },
    reset_before_search: true,
  };
}

function makeTeacherRescore(
  move: string,
  index = 0,
): Readonly<FloodgateProductionTeacherRescoreResult> {
  return {
    depth: 16,
    lines: [
      {
        depth: 16,
        multipv: 1,
        cp: index,
        nodes: 100 + index,
        move,
        pv: [move],
        scoreKind: "cp",
      },
    ],
    bestmove: move,
    observedNodes: 100 + index,
    requested_multipv: 1,
    searchmoves: [move],
    reset_before_search: true,
  };
}

function makeRuntimeFixture(): RuntimeFixture {
  const calls: Calls = {
    stableFactory: 0,
    teacherFactory: 0,
    stableDigest: 0,
    teacherDigest: 0,
    stablePropose: 0,
    teacherPropose: 0,
    teacherRescore: 0,
    stableClose: 0,
    teacherClose: 0,
    teacherAbort: 0,
  };
  const events: string[] = [];
  const teacherReceipt = makeTeacherReceipt();
  const teacherRuntimeDigest = digestCanonical(
    RUNTIME_RECEIPT_DIGEST_DOMAIN,
    teacherReceipt,
  );
  const fixture = {} as RuntimeFixture;

  const stable = Object.freeze({
    receipt: Object.freeze({ test_fixture: true }),
    propose: Object.freeze(function (
      parent: Readonly<FloodgateTrainingParent>,
    ): Promise<unknown> {
      calls.stablePropose += 1;
      appendArrayValue(events, "stable-propose");
      return fixture.stableProposeImplementation(parent);
    }),
    close: Object.freeze(function (): Promise<void> {
      calls.stableClose += 1;
      appendArrayValue(events, "stable-close");
      return fixture.stableCloseImplementation();
    }),
  }) as unknown as StableRuntime;
  const teacher = Object.freeze({
    receipt: teacherReceipt,
    poisoned: false,
    propose: Object.freeze(function (
      sfen: string,
      legalMoveCount: number,
    ): Promise<Readonly<FloodgateProductionTeacherProposalResult>> {
      calls.teacherPropose += 1;
      appendArrayValue(events, "teacher-propose");
      return fixture.teacherProposeImplementation(sfen, legalMoveCount);
    }),
    rescore: Object.freeze(function (
      sfen: string,
      move: string,
    ): Promise<Readonly<FloodgateProductionTeacherRescoreResult>> {
      calls.teacherRescore += 1;
      appendArrayValue(events, `teacher-rescore:${move}`);
      return fixture.teacherRescoreImplementation(sfen, move);
    }),
    close: Object.freeze(function (): Promise<void> {
      calls.teacherClose += 1;
      appendArrayValue(events, "teacher-close");
      return fixture.teacherCloseImplementation();
    }),
    abortAndReap: Object.freeze(function (): Promise<void> {
      calls.teacherAbort += 1;
      appendArrayValue(events, "teacher-abort");
      return fixture.teacherAbortImplementation();
    }),
  }) as unknown as TeacherRuntime;

  Object.assign(fixture, {
    calls,
    events,
    stable,
    teacher,
    teacherReceipt,
    teacherRuntimeDigest,
    dependencies: {
      createStableRuntime: function (): Promise<StableRuntime> {
        calls.stableFactory += 1;
        appendArrayValue(events, "stable-factory");
        return Promise.resolve(stable);
      },
      createTeacherRuntime: function (): Promise<TeacherRuntime> {
        calls.teacherFactory += 1;
        appendArrayValue(events, "teacher-factory");
        return Promise.resolve(teacher);
      },
      getStableRuntimeReceiptDigest: function (runtime: StableRuntime): string {
        calls.stableDigest += 1;
        expect(runtime).toBe(stable);
        return STABLE_RUNTIME_DIGEST;
      },
      getTeacherRuntimeReceiptDigest: function (
        runtime: TeacherRuntime,
      ): string {
        calls.teacherDigest += 1;
        expect(runtime).toBe(teacher);
        return teacherRuntimeDigest;
      },
    },
    stableProposeImplementation: (parent: Readonly<FloodgateTrainingParent>) =>
      Promise.resolve(makeStableResult(parent)),
    teacherProposeImplementation: (sfen: string, legalMoveCount: number) =>
      Promise.resolve(makeTeacherProposal(sfen, legalMoveCount)),
    teacherRescoreImplementation: (_sfen: string, move: string) =>
      Promise.resolve(makeTeacherRescore(move)),
    stableCloseImplementation: () => Promise.resolve(),
    teacherCloseImplementation: () => Promise.resolve(),
    teacherAbortImplementation: () => Promise.resolve(),
  });
  return fixture;
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child, seen);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("condition did not become true within 100 microtasks");
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

interface LiveIntrinsicTarget {
  readonly receiver: object;
  readonly key: PropertyKey;
  readonly label: string;
}

const LIVE_INTRINSIC_TARGETS: readonly LiveIntrinsicTarget[] = [
  { receiver: Set.prototype, key: "delete", label: "Set.prototype.delete" },
  { receiver: Set.prototype, key: "add", label: "Set.prototype.add" },
  { receiver: Set.prototype, key: "clear", label: "Set.prototype.clear" },
  { receiver: Set.prototype, key: "forEach", label: "Set.prototype.forEach" },
  {
    receiver: Set.prototype,
    key: Symbol.iterator,
    label: "Set.prototype[Symbol.iterator]",
  },
  { receiver: Object, key: "defineProperty", label: "Object.defineProperty" },
  { receiver: Array.prototype, key: "map", label: "Array.prototype.map" },
  { receiver: Array.prototype, key: "push", label: "Array.prototype.push" },
  { receiver: RegExp.prototype, key: "exec", label: "RegExp.prototype.exec" },
];
const LIVE_SUCCESS_INTRINSIC_TARGET_COUNT = 1;

function installLiveIntrinsicPoisons(targetCount: number): Readonly<{
  readonly trapCalls: () => number;
  readonly restore: () => void;
}> {
  const descriptors: PropertyDescriptor[] = [];
  for (let index = 0; index < targetCount; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      LIVE_INTRINSIC_TARGETS[index].receiver,
      LIVE_INTRINSIC_TARGETS[index].key,
    );
    if (descriptor === undefined) {
      throw new Error(
        `missing live intrinsic ${LIVE_INTRINSIC_TARGETS[index].label}`,
      );
    }
    appendArrayValue(descriptors, descriptor);
  }

  let trapCalls = 0;
  const poison = function (): never {
    trapCalls += 1;
    throw new Error("a poisoned live intrinsic was invoked");
  };
  let installed = 0;
  try {
    for (; installed < targetCount; installed += 1) {
      const target = LIVE_INTRINSIC_TARGETS[installed];
      const descriptor = descriptors[installed];
      nativeObjectDefineProperty(target.receiver, target.key, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        writable: descriptor.writable,
        value: poison,
      });
    }
  } catch (cause) {
    for (let index = installed - 1; index >= 0; index -= 1) {
      const target = LIVE_INTRINSIC_TARGETS[index];
      nativeObjectDefineProperty(
        target.receiver,
        target.key,
        descriptors[index],
      );
    }
    throw cause;
  }

  let restored = false;
  return {
    trapCalls: () => trapCalls,
    restore: () => {
      if (restored) return;
      restored = true;
      for (let index = targetCount - 1; index >= 0; index -= 1) {
        const target = LIVE_INTRINSIC_TARGETS[index];
        nativeObjectDefineProperty(
          target.receiver,
          target.key,
          descriptors[index],
        );
      }
    },
  };
}

describe("Floodgate v7 production parent coordinator", () => {
  it("keeps the injected fixture production-shaped without treating it as production evidence", () => {
    const fixture = makeRuntimeFixture();
    const parent = makeParent();
    const stable = makeStableResult(parent) as Parameters<
      typeof buildFloodgateV7CompletedParentCoreForTests
    >[0]["stable_runtime"];

    expect(fixture.teacherRuntimeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(stable.runtime_binding.runtime_receipt_sha256).toBe(
      STABLE_RUNTIME_DIGEST,
    );
    expect(legalMoves(SMALL_LEGAL_SET_SFEN)).toHaveLength(3);
    expect(legalMoves(FORCED_SFEN)).toHaveLength(1);
  });

  it("hands the exact owner to the coordinator once and rejects clones or Proxies without traps", async () => {
    const fixture = makeRuntimeFixture();
    const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
      fixture.dependencies,
    );
    const clone = {
      receipt: structuredClone(owner.receipt),
      close: owner.close,
      abortAndDrain: owner.abortAndDrain,
    };
    let proxyTraps = 0;
    const proxy = new Proxy(owner, {
      get() {
        proxyTraps += 1;
        throw new Error("owner Proxy get trap must not run");
      },
      ownKeys() {
        proxyTraps += 1;
        throw new Error("owner Proxy ownKeys trap must not run");
      },
    });

    expect(() =>
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(
        clone as never,
      ),
    ).toThrow(/handoff is unavailable/);
    expect(() =>
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(
        proxy,
      ),
    ).toThrow(/exact non-Proxy owner/);
    expect(proxyTraps).toBe(0);
    expect(() =>
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator(
        owner as never,
      ),
    ).toThrow(/another boundary/);

    const handoff =
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(
        owner,
      );
    expect(Reflect.ownKeys(handoff)).toEqual([
      "receipt",
      "stablePropose",
      "teacherReceipt",
      "teacherPropose",
      "teacherRescore",
      "close",
      "abortAndDrain",
    ]);
    expect(Object.getPrototypeOf(handoff)).toBeNull();
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(handoff.receipt).toBe(owner.receipt);
    expect(handoff.teacherReceipt).toBe(fixture.teacherReceipt);
    expect(handoff.stablePropose).toBe(fixture.stable.propose);
    expect(handoff.teacherPropose).toBe(fixture.teacher.propose);
    expect(handoff.teacherRescore).toBe(fixture.teacher.rescore);
    expect(handoff.close).toBe(owner.close);
    expect(handoff.abortAndDrain).toBe(owner.abortAndDrain);
    expect(() =>
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(
        owner,
      ),
    ).toThrow(/already consumed/);
    expect(fixture.calls.stablePropose).toBe(0);
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(fixture.calls.teacherRescore).toBe(0);

    await handoff.close();
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(0);
  });

  it("consumes a malformed issued test handoff before it can be repaired and retried", async () => {
    const fixture = makeRuntimeFixture();
    const malformedStable = {
      receipt: { test_fixture: true },
      close: fixture.stable.close,
    } as unknown as StableRuntime;
    const dependencies: FloodgateV7ProductionRuntimeOwnerCoreDependencies = {
      ...fixture.dependencies,
      createStableRuntime: function (): Promise<StableRuntime> {
        fixture.calls.stableFactory += 1;
        return Promise.resolve(malformedStable);
      },
      getStableRuntimeReceiptDigest: function (
        _runtime: StableRuntime,
      ): string {
        fixture.calls.stableDigest += 1;
        return STABLE_RUNTIME_DIGEST;
      },
    };
    const owner =
      await createFloodgateV7ProductionRuntimeOwnerCoreForTests(dependencies);

    expect(() =>
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(
        owner,
      ),
    ).toThrow(/stable runtime\.propose/);
    Reflect.set(malformedStable, "propose", fixture.stable.propose);
    expect(() =>
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(
        owner,
      ),
    ).toThrow(/already consumed/);
    expect(fixture.calls.stablePropose).toBe(0);
    await owner.abortAndDrain();
  });

  it("does not hand off an owner whose lifecycle already started", async () => {
    const fixture = makeRuntimeFixture();
    const owner = await createFloodgateV7ProductionRuntimeOwnerCoreForTests(
      fixture.dependencies,
    );
    const lifecycle = owner.close();

    expect(() =>
      claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(
        owner,
      ),
    ).toThrow(/handoff is unavailable|lifecycle already started/);
    await lifecycle;
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(0);
  });

  it("hands the exact test coordinator to a checkpoint connector once without crossing registries", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const clone = {
      receipt: coordinator.receipt,
      run_binding: coordinator.run_binding,
      produce: coordinator.produce,
      close: coordinator.close,
      abortAndDrain: coordinator.abortAndDrain,
    };
    let proxyTraps = 0;
    const proxy = new Proxy(coordinator, {
      get() {
        proxyTraps += 1;
        throw new Error("coordinator Proxy get trap must not run");
      },
      ownKeys() {
        proxyTraps += 1;
        throw new Error("coordinator Proxy ownKeys trap must not run");
      },
    });

    expect(() =>
      claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(
        clone as never,
      ),
    ).toThrow(/handoff is unavailable/);
    expect(() =>
      claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(
        proxy,
      ),
    ).toThrow(/exact non-Proxy coordinator/);
    expect(proxyTraps).toBe(0);
    expect(() =>
      claimFloodgateV7ProductionParentCoordinatorForCheckpoint(coordinator),
    ).toThrow(/another boundary/);
    expect(() =>
      nativeReflectApply(
        claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests,
        undefined,
        [],
      ),
    ).toThrow(/exactly one argument/);
    expect(() =>
      nativeReflectApply(
        claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests,
        undefined,
        [coordinator, coordinator],
      ),
    ).toThrow(/exactly one argument/);
    expect(() =>
      nativeReflectApply(
        claimFloodgateV7ProductionParentCoordinatorForCheckpoint,
        undefined,
        [],
      ),
    ).toThrow(/exactly one argument/);
    expect(() =>
      nativeReflectApply(
        claimFloodgateV7ProductionParentCoordinatorForCheckpoint,
        undefined,
        [coordinator, coordinator],
      ),
    ).toThrow(/exactly one argument/);

    const handoff =
      claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(
        coordinator,
      );
    expect(Reflect.ownKeys(handoff)).toEqual([
      "produce",
      "abortAndDrain",
      "close",
      "runBinding",
    ]);
    expect(Object.getPrototypeOf(handoff)).toBeNull();
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(Object.getOwnPropertyDescriptors(handoff)).toEqual({
      produce: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: coordinator.produce,
      },
      abortAndDrain: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: coordinator.abortAndDrain,
      },
      close: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: coordinator.close,
      },
      runBinding: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: coordinator.run_binding,
      },
    });
    expect(handoff.produce).toBe(coordinator.produce);
    expect(handoff.abortAndDrain).toBe(coordinator.abortAndDrain);
    expect(handoff.close).toBe(coordinator.close);
    expect(handoff.runBinding).toBe(coordinator.run_binding);
    expect(() =>
      claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(
        coordinator,
      ),
    ).toThrow(/already consumed/);
    expect(fixture.calls.stablePropose).toBe(0);
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(fixture.calls.teacherRescore).toBe(0);

    await handoff.close();
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(0);
  });

  it.each(["close", "abortAndDrain"] as const)(
    "keeps an unclaimed checkpoint handoff after invalid-arity %s",
    async (method) => {
      const fixture = makeRuntimeFixture();
      const coordinator =
        await createFloodgateV7ProductionParentCoordinatorCoreForTests(
          fixture.dependencies,
        );

      await expect(
        nativeReflectApply(coordinator[method], undefined, ["unexpected"]),
      ).rejects.toMatchObject({ phase: "capture" });
      const handoff =
        claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(
          coordinator,
        );
      await handoff.close();
      expect(fixture.calls.stableClose).toBe(1);
      expect(fixture.calls.teacherClose).toBe(1);
      expect(fixture.calls.teacherAbort).toBe(0);
    },
  );

  it.each([
    ["close", { stableClose: 1, teacherClose: 1, teacherAbort: 0 }],
    ["abortAndDrain", { stableClose: 1, teacherClose: 0, teacherAbort: 1 }],
  ] as const)(
    "invalidates an unclaimed checkpoint handoff when coordinator %s starts",
    async (method, expectedCalls) => {
      const fixture = makeRuntimeFixture();
      const coordinator =
        await createFloodgateV7ProductionParentCoordinatorCoreForTests(
          fixture.dependencies,
        );
      const lifecycle = nativeReflectApply(coordinator[method], undefined, []);

      expect(() =>
        claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(
          coordinator,
        ),
      ).toThrow(/handoff is unavailable/);
      await lifecycle;
      expect(fixture.calls.stableClose).toBe(expectedCalls.stableClose);
      expect(fixture.calls.teacherClose).toBe(expectedCalls.teacherClose);
      expect(fixture.calls.teacherAbort).toBe(expectedCalls.teacherAbort);
    },
  );

  it("runs one non-forced parent in exact order and returns a detached frozen checkpoint input", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const parent = structuredClone(makeParent());
    const signal = new AbortController().signal;

    expect(Reflect.ownKeys(coordinator)).toEqual([
      "receipt",
      "run_binding",
      "produce",
      "close",
      "abortAndDrain",
    ]);
    expect(Object.getPrototypeOf(coordinator)).toBeNull();
    expect(Object.isFrozen(coordinator)).toBe(true);
    expect(coordinator.receipt).toMatchObject({
      contract: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_STATUS,
      claim_boundary:
        FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_TEST_CLAIM_BOUNDARY,
      execution_boundary: "test-only-injected-runtime-owner-single-use-handoff",
      handoff: {
        exact_owner_facade_claimed_once: true,
        raw_runtime_facades_exposed: false,
      },
      operation: {
        stable_then_teacher_then_union_then_rescore: true,
        candidate_order: "utf8-bytewise-ascending-v1",
        completed_parent_core_reverified_before_return: true,
      },
      test_boundary: {
        production_factory_execution: false,
        production_runtime_origin: false,
      },
    });
    expect(Object.values(coordinator.receipt.nonclaims)).toEqual(
      Array(11).fill(false),
    );
    expect(coordinator.run_binding).toMatchObject({
      schema: "shogi-floodgate-v7-teacher-run-binding-v2",
      producer_control: {
        parent_deadline_ms:
          FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
        abort_drain_ms:
          FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
        max_in_flight: 12,
      },
      stable_runtime_receipt_sha256: STABLE_RUNTIME_DIGEST,
      teacher_usi_runtime_receipt_sha256: fixture.teacherRuntimeDigest,
    });
    expectDeepFrozen(coordinator.receipt);
    expectDeepFrozen(coordinator.run_binding);

    const produced = coordinator.produce({
      input_index: 7,
      parent,
      signal,
    });
    expect(Reflect.ownKeys(produced)).toEqual([]);
    expect(Object.getPrototypeOf(produced)).toBe(Promise.prototype);
    const result = await produced;
    expect(Reflect.ownKeys(result)).toEqual([
      "union",
      "stable_runtime",
      "rescores",
    ]);
    expectDeepFrozen(result);
    const evidence = buildFloodgateV7CompletedParentCoreForTests(result);
    expect(evidence.parent.parent_id).toBe(parent.parent_id);
    expect(evidence.completion).toMatchObject({
      state: "complete",
      candidates: 3,
      independent_rescores_required: 3,
      independent_rescores_completed: 3,
      teacher_labels_emitted: 0,
    });
    expect(fixture.events).toEqual([
      "stable-factory",
      "teacher-factory",
      "stable-propose",
      "teacher-propose",
      "teacher-rescore:9i8h",
      "teacher-rescore:9i8i",
      "teacher-rescore:9i9h",
    ]);
    expect(fixture.calls).toMatchObject({
      stableFactory: 1,
      teacherFactory: 1,
      stableDigest: 1,
      teacherDigest: 1,
      stablePropose: 1,
      teacherPropose: 1,
      teacherRescore: 3,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    });

    Reflect.set(parent, "parent_sfen", FORCED_SFEN);
    Reflect.set(parent, "played_move", legalMoves(FORCED_SFEN)[0]);
    expect(evidence.parent.parent_sfen).toBe(SMALL_LEGAL_SET_SFEN);
    await coordinator.close();
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(0);
  });

  it("skips every teacher operation for the exact forced-parent branch", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const parent = makeParent(FORCED_SFEN);
    const result = await coordinator.produce({
      input_index: 8,
      parent,
      signal: new AbortController().signal,
    });
    const evidence = buildFloodgateV7CompletedParentCoreForTests(result);

    expect(evidence.completion).toMatchObject({
      state: "forced-parent-skip",
      candidates: 0,
      independent_rescores_required: 0,
      independent_rescores_completed: 0,
      teacher_labels_emitted: 0,
    });
    expect(fixture.calls.stablePropose).toBe(1);
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(fixture.calls.teacherRescore).toBe(0);
    await coordinator.close();
  });

  it("captures the request synchronously and isolates the returned graph from caller mutation", async () => {
    const fixture = makeRuntimeFixture();
    const stableGate = deferred<unknown>();
    let capturedParent: Readonly<FloodgateTrainingParent> | undefined;
    fixture.stableProposeImplementation = (
      parent: Readonly<FloodgateTrainingParent>,
    ) => {
      capturedParent = parent;
      return stableGate.promise;
    };
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const parent = structuredClone(makeParent());
    const original = structuredClone(parent);
    const operation = coordinator.produce({
      input_index: 9,
      parent,
      signal: new AbortController().signal,
    });

    expect(capturedParent).toBeDefined();
    expect(capturedParent).not.toBe(parent);
    expect(capturedParent).toEqual(original);
    Reflect.set(parent, "parent_sfen", FORCED_SFEN);
    Reflect.set(parent, "played_move", legalMoves(FORCED_SFEN)[0]);
    stableGate.resolve(
      makeStableResult(capturedParent as FloodgateTrainingParent),
    );
    const result = await operation;
    const evidence = buildFloodgateV7CompletedParentCoreForTests(result);
    expect(evidence.parent.parent_sfen).toBe(original.parent_sfen);
    expect(evidence.strong_game_played_move).toBe(original.played_move);
    expectDeepFrozen(result);

    Reflect.set(parent, "parent_id", `sha256:${"0".repeat(64)}`);
    expect(evidence.parent.parent_id).toBe(original.parent_id);
    await coordinator.close();
  });

  it("aborts once on the first operation failure, preserves cleanup evidence, and rejects later work", async () => {
    const fixture = makeRuntimeFixture();
    const primary = new Error("synthetic stable proposal failure");
    const stableCleanup = new Error("synthetic stable cleanup failure");
    const teacherCleanup = new Error("synthetic teacher cleanup failure");
    fixture.stableProposeImplementation = () => Promise.reject(primary);
    fixture.stableCloseImplementation = () => Promise.reject(stableCleanup);
    fixture.teacherAbortImplementation = () => Promise.reject(teacherCleanup);
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );

    const failure = (await rejectionOf(
      coordinator.produce({
        input_index: 10,
        parent: makeParent(),
        signal: new AbortController().signal,
      }),
    )) as FloodgateV7ProductionParentCoordinatorError;
    expect(failure).toBeInstanceOf(FloodgateV7ProductionParentCoordinatorError);
    expect(failure.phase).toBe("stable-proposal");
    expect(failure.primary).toBe(primary);
    expect(failure.cleanup_failures).toHaveLength(1);
    expect(fixture.calls).toMatchObject({
      stablePropose: 1,
      teacherPropose: 0,
      teacherRescore: 0,
      stableClose: 1,
      teacherClose: 0,
      teacherAbort: 1,
    });

    const before = { ...fixture.calls };
    const later = (await rejectionOf(
      coordinator.produce({
        input_index: 11,
        parent: makeParent(),
        signal: new AbortController().signal,
      }),
    )) as FloodgateV7ProductionParentCoordinatorError;
    expect(later.phase).toBe("cleanup");
    expect(fixture.calls).toEqual(before);
    const lifecycle = coordinator.close();
    expect(coordinator.abortAndDrain()).toBe(lifecycle);
    const cleanup = (await rejectionOf(lifecycle)) as {
      readonly phase: string;
      readonly cleanupFailures: readonly unknown[];
    };
    expect(cleanup.phase).toBe("cleanup");
    expect(cleanup.cleanupFailures).toHaveLength(2);
  });

  it("quarantines a rescore that settles after cancellation without scheduling later candidates", async () => {
    const fixture = makeRuntimeFixture();
    const firstRescore =
      deferred<Readonly<FloodgateProductionTeacherRescoreResult>>();
    let firstMove: string | undefined;
    fixture.teacherRescoreImplementation = (_sfen: string, move: string) => {
      if (firstMove === undefined) {
        firstMove = move;
        return firstRescore.promise;
      }
      return Promise.resolve(makeTeacherRescore(move));
    };
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const controller = new AbortController();
    const operation = coordinator.produce({
      input_index: 12,
      parent: makeParent(),
      signal: controller.signal,
    });
    await waitFor(() => fixture.calls.teacherRescore === 1);

    const cancellation = new Error("synthetic caller cancellation");
    controller.abort(cancellation);
    const failure = (await rejectionOf(
      operation,
    )) as FloodgateV7ProductionParentCoordinatorError;
    expect(failure.phase).toBe("cancellation");
    expect(failure.primary).toBe(cancellation);
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(1);
    expect(fixture.calls.teacherClose).toBe(0);

    firstRescore.resolve(makeTeacherRescore(firstMove as string));
    await nextTurn();
    expect(fixture.calls.teacherRescore).toBe(1);
    expect(
      fixture.events.filter((event) => event.startsWith("teacher-rescore")),
    ).toEqual([`teacher-rescore:${firstMove}`]);
    expect(coordinator.close()).toBe(coordinator.abortAndDrain());
  });

  it("makes close win exactly once across concurrent work and quarantines both late stable settlements", async () => {
    const fixture = makeRuntimeFixture();
    const gates = [deferred<unknown>(), deferred<unknown>()];
    const captured: Readonly<FloodgateTrainingParent>[] = [];
    fixture.stableProposeImplementation = (
      parent: Readonly<FloodgateTrainingParent>,
    ) => {
      captured.push(parent);
      return gates[captured.length - 1].promise;
    };
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const first = coordinator.produce({
      input_index: 13,
      parent: makeParent(),
      signal: new AbortController().signal,
    });
    const second = coordinator.produce({
      input_index: 14,
      parent: makeParent(),
      signal: new AbortController().signal,
    });
    expect(fixture.calls.stablePropose).toBe(2);

    const close = coordinator.close();
    expect(Reflect.ownKeys(close)).toEqual([]);
    expect(Object.getPrototypeOf(close)).toBe(Promise.prototype);
    expect(coordinator.abortAndDrain()).toBe(close);
    await close;
    await Promise.all([rejectionOf(first), rejectionOf(second)]);
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(0);

    gates[0].resolve(makeStableResult(captured[0]));
    gates[1].resolve(makeStableResult(captured[1]));
    await nextTurn();
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(fixture.calls.teacherRescore).toBe(0);
  });

  it("rejects hostile or I/O-shaped test dependencies before a runtime factory starts", async () => {
    const fixture = makeRuntimeFixture();
    let proxyTraps = 0;
    const proxy = new Proxy(fixture.dependencies, {
      get() {
        proxyTraps += 1;
        throw new Error("dependency Proxy get trap must not run");
      },
      ownKeys() {
        proxyTraps += 1;
        throw new Error("dependency Proxy ownKeys trap must not run");
      },
    });
    const withIoAuthority = {
      ...fixture.dependencies,
      rootKey: new Uint8Array(32),
      checkpointPath: "/forbidden/work.jsonl",
      datasetPath: "/forbidden/training.jsonl",
    };

    for (const dependencies of [proxy, withIoAuthority]) {
      const failure = (await rejectionOf(
        createFloodgateV7ProductionParentCoordinatorCoreForTests(
          dependencies as FloodgateV7ProductionRuntimeOwnerCoreDependencies,
        ),
      )) as FloodgateV7ProductionParentCoordinatorError;
      expect(failure.phase).toBe("owner-handoff");
    }
    expect(proxyTraps).toBe(0);
    expect(fixture.calls.stableFactory).toBe(0);
    expect(fixture.calls.teacherFactory).toBe(0);
  });

  it("rejects a hostile parent-request Proxy without traps or engine work", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    let proxyTraps = 0;
    const request = new Proxy(
      {
        input_index: 15,
        parent: makeParent(),
        signal: new AbortController().signal,
      },
      {
        get() {
          proxyTraps += 1;
          throw new Error("request Proxy get trap must not run");
        },
        ownKeys() {
          proxyTraps += 1;
          throw new Error("request Proxy ownKeys trap must not run");
        },
      },
    );

    const failure = (await rejectionOf(
      coordinator.produce(request),
    )) as FloodgateV7ProductionParentCoordinatorError;
    expect(failure.phase).toBe("capture");
    expect(proxyTraps).toBe(0);
    expect(fixture.calls.stablePropose).toBe(0);
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(fixture.calls.teacherRescore).toBe(0);
    await coordinator.close();
  });

  it("rejects extra-key and million-key-style parents before runtime work", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const extraKeyParent = { ...makeParent(), unexpected: true };
    const oversizedParent = makeParent() as FloodgateTrainingParent &
      Record<string, unknown>;
    for (let index = 0; index < OVERSIZED_CAPTURE_ENTRY_COUNT; index += 1) {
      nativeObjectDefineProperty(oversizedParent, `unexpected_${index}`, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: index,
      });
    }
    const parents: readonly unknown[] = [extraKeyParent, oversizedParent];

    for (let index = 0; index < parents.length; index += 1) {
      const failure = (await rejectionOf(
        coordinator.produce({
          input_index: 20 + index,
          parent: parents[index] as FloodgateTrainingParent,
          signal: new AbortController().signal,
        }),
      )) as FloodgateV7ProductionParentCoordinatorError;
      expect(failure.phase).toBe("capture");
      expect(failure.primary).toBeInstanceOf(Error);
      expect((failure.primary as Error).message).toMatch(/keys are not exact/);
    }
    expect(fixture.calls.stablePropose).toBe(0);
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(fixture.calls.teacherRescore).toBe(0);
    await coordinator.close();
  });

  it("bounds every parent string before parsing and accepts the 4096-code-unit edge", async () => {
    const fixture = makeRuntimeFixture();
    const stableGate = deferred<unknown>();
    let capturedParent: Readonly<FloodgateTrainingParent> | undefined;
    fixture.stableProposeImplementation = (
      parent: Readonly<FloodgateTrainingParent>,
    ) => {
      capturedParent = parent;
      return stableGate.promise;
    };
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const base = makeParent();
    const stringKeys = [
      "game_id",
      "parent_id",
      "position_id",
      "parent_sfen",
      "played_move",
    ] as const;
    const invalidValues = ["", "g".repeat(4_097)] as const;
    let invalidIndex = 0;

    for (let keyIndex = 0; keyIndex < stringKeys.length; keyIndex += 1) {
      for (
        let valueIndex = 0;
        valueIndex < invalidValues.length;
        valueIndex += 1
      ) {
        const failure = (await rejectionOf(
          coordinator.produce({
            input_index: 28 + invalidIndex,
            parent: {
              ...base,
              [stringKeys[keyIndex]]: invalidValues[valueIndex],
            },
            signal: new AbortController().signal,
          }),
        )) as FloodgateV7ProductionParentCoordinatorError;
        expect(failure.phase).toBe("capture");
        expect(failure.primary).toBeInstanceOf(Error);
        expect((failure.primary as Error).message).toMatch(/string bound/);
        invalidIndex += 1;
      }
    }
    expect(fixture.calls.stablePropose).toBe(0);

    const controller = new AbortController();
    const operation = coordinator.produce({
      input_index: 38,
      parent: { ...base, game_id: "g".repeat(4_096) },
      signal: controller.signal,
    });
    expect(fixture.calls.stablePropose).toBe(1);
    expect(capturedParent?.game_id).toHaveLength(4_096);
    controller.abort(new Error("stop after the accepted string edge"));
    const cancellation = (await rejectionOf(
      operation,
    )) as FloodgateV7ProductionParentCoordinatorError;
    expect(cancellation.phase).toBe("cancellation");
    stableGate.resolve(
      makeStableResult(capturedParent as FloodgateTrainingParent),
    );
    await nextTurn();
    expect(fixture.calls.teacherPropose).toBe(0);
    await coordinator.abortAndDrain();
  });

  it("rejects an over-budget runtime snapshot before traversing its oversized array", async () => {
    const fixture = makeRuntimeFixture();
    const parent = makeParent();
    fixture.stableProposeImplementation = () =>
      Promise.resolve({
        ...(makeStableResult(parent) as Record<string, unknown>),
        oversized: new Array<unknown>(OVERSIZED_CAPTURE_ENTRY_COUNT),
      });
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );

    const failure = (await rejectionOf(
      coordinator.produce({
        input_index: 22,
        parent,
        signal: new AbortController().signal,
      }),
    )) as FloodgateV7ProductionParentCoordinatorError;
    expect(failure.phase).toBe("stable-proposal");
    expect(failure.primary).toBeInstanceOf(Error);
    expect((failure.primary as Error).message).toMatch(
      /exceeds the capture entry bound/,
    );
    expect(fixture.calls).toMatchObject({
      stablePropose: 1,
      teacherPropose: 0,
      teacherRescore: 0,
      stableClose: 1,
      teacherAbort: 1,
    });
    await coordinator.abortAndDrain();
  });

  it.each([
    "thenable",
    "proxy-promise",
    "decorated-promise",
    "hostile-constructor-promise",
  ] as const)(
    "rejects an invalid stable operation %s without assimilating hostile behavior",
    async (kind) => {
      const fixture = makeRuntimeFixture();
      let trapCalls = 0;
      const validResult = makeStableResult(makeParent());
      let invalid: unknown;
      if (kind === "thenable") {
        invalid = Object.defineProperty({}, "then", {
          get() {
            trapCalls += 1;
            throw new Error("operation thenable getter must not run");
          },
        });
      } else if (kind === "proxy-promise") {
        invalid = new Proxy(Promise.resolve(validResult), {
          get() {
            trapCalls += 1;
            throw new Error("operation Promise Proxy trap must not run");
          },
        });
      } else if (kind === "decorated-promise") {
        invalid = Promise.resolve(validResult);
        Object.defineProperty(invalid, "decoration", {
          enumerable: true,
          value: "not-an-exact-operation-promise",
        });
      } else {
        invalid = Promise.resolve(validResult);
        Object.defineProperty(invalid, "constructor", {
          configurable: false,
          get() {
            trapCalls += 1;
            throw new Error("operation Promise constructor must not run");
          },
        });
      }
      fixture.stableProposeImplementation = () => invalid as Promise<unknown>;
      const coordinator =
        await createFloodgateV7ProductionParentCoordinatorCoreForTests(
          fixture.dependencies,
        );

      const failure = (await rejectionOf(
        coordinator.produce({
          input_index: 16,
          parent: makeParent(),
          signal: new AbortController().signal,
        }),
      )) as FloodgateV7ProductionParentCoordinatorError;
      expect(failure.phase).toBe("stable-proposal");
      expect(trapCalls).toBe(0);
      expect(fixture.calls.stablePropose).toBe(1);
      expect(fixture.calls.teacherPropose).toBe(0);
      expect(fixture.calls.teacherRescore).toBe(0);
      expect(fixture.calls.stableClose).toBe(1);
      expect(fixture.calls.teacherAbort).toBe(1);
      await coordinator.abortAndDrain();
    },
  );

  it("contract-rejects a foreign-realm native Promise without assimilating it", async () => {
    const fixture = makeRuntimeFixture();
    const foreign = runInNewContext(`
      ({ promise: Promise.resolve(null) })
    `) as unknown as { readonly promise: Promise<unknown> };
    fixture.stableProposeImplementation = () => foreign.promise;
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const failure = (await rejectionOf(
      coordinator.produce({
        input_index: 23,
        parent: makeParent(),
        signal: new AbortController().signal,
      }),
    )) as FloodgateV7ProductionParentCoordinatorError;

    expect(failure.phase).toBe("stable-proposal");
    expect(failure.primary).toBeInstanceOf(Error);
    expect((failure.primary as Error).message).toMatch(
      /undecorated exact native Promise/,
    );
    expect(fixture.calls).toMatchObject({
      stablePropose: 1,
      teacherPropose: 0,
      teacherRescore: 0,
      stableClose: 1,
      teacherAbort: 1,
    });
    await coordinator.abortAndDrain();
  });

  it("uses captured Set.delete throughout a successful parent", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const poisons = installLiveIntrinsicPoisons(
      LIVE_SUCCESS_INTRINSIC_TARGET_COUNT,
    );
    let result: Awaited<ReturnType<typeof coordinator.produce>> | undefined;

    try {
      result = await coordinator.produce({
        input_index: 24,
        parent: makeParent(),
        signal: new AbortController().signal,
      });
    } finally {
      poisons.restore();
    }

    expect(poisons.trapCalls()).toBe(0);
    expect(result).toBeDefined();
    expectDeepFrozen(result);
    await coordinator.close();
  });

  it("pins accepted operation Promises away from live constructor and then", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const constructorDescriptor = Object.getOwnPropertyDescriptor(
      Promise.prototype,
      "constructor",
    );
    const thenDescriptor = Object.getOwnPropertyDescriptor(
      Promise.prototype,
      "then",
    );
    if (constructorDescriptor === undefined || thenDescriptor === undefined) {
      throw new Error("missing native Promise prototype descriptors");
    }
    const produced = coordinator.produce({
      input_index: 30,
      parent: makeParent(),
      signal: new AbortController().signal,
    });
    let result: Awaited<ReturnType<typeof coordinator.produce>> | undefined;
    let failure: unknown;
    let settled = false;
    nativeReflectApply(nativePromiseThen, produced, [
      (value: Awaited<ReturnType<typeof coordinator.produce>>) => {
        result = value;
        settled = true;
      },
      (reason: unknown) => {
        failure = reason;
        settled = true;
      },
    ]);
    let restored = false;
    const restore = (): void => {
      if (restored) return;
      restored = true;
      nativeObjectDefineProperty(Promise.prototype, "then", thenDescriptor);
      nativeObjectDefineProperty(
        Promise.prototype,
        "constructor",
        constructorDescriptor,
      );
    };
    const turn = new Promise<void>((resolve) => {
      setImmediate(() => {
        restore();
        resolve();
      });
    });
    nativeObjectDefineProperty(turn, "constructor", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: Promise,
    });
    let trapCalls = 0;
    const poison = function (): never {
      trapCalls += 1;
      throw new Error("a poisoned live Promise intrinsic was invoked");
    };
    nativeObjectDefineProperty(Promise.prototype, "constructor", {
      configurable: constructorDescriptor.configurable,
      enumerable: constructorDescriptor.enumerable,
      get: poison,
    });
    nativeObjectDefineProperty(Promise.prototype, "then", {
      configurable: thenDescriptor.configurable,
      enumerable: thenDescriptor.enumerable,
      writable: thenDescriptor.writable,
      value: poison,
    });
    try {
      await turn;
    } finally {
      restore();
    }

    expect(trapCalls).toBe(0);
    expect(settled).toBe(true);
    expect(failure).toBeUndefined();
    expect(result).toBeDefined();
    expectDeepFrozen(result);
    await coordinator.close();
  });

  it("uses captured live intrinsics while cancellation drains a pending runtime", async () => {
    const fixture = makeRuntimeFixture();
    const stableGate = deferred<unknown>();
    let capturedParent: Readonly<FloodgateTrainingParent> | undefined;
    fixture.stableProposeImplementation = (
      parent: Readonly<FloodgateTrainingParent>,
    ) => {
      capturedParent = parent;
      return stableGate.promise;
    };
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const controller = new AbortController();
    const operation = coordinator.produce({
      input_index: 25,
      parent: makeParent(),
      signal: controller.signal,
    });
    expect(fixture.calls.stablePropose).toBe(1);
    const cancellation = new Error("synthetic intrinsic-poison cancellation");
    const poisons = installLiveIntrinsicPoisons(LIVE_INTRINSIC_TARGETS.length);
    let failure: FloodgateV7ProductionParentCoordinatorError | undefined;

    try {
      controller.abort(cancellation);
      failure = (await rejectionOf(
        operation,
      )) as FloodgateV7ProductionParentCoordinatorError;
    } finally {
      poisons.restore();
    }

    expect(poisons.trapCalls()).toBe(0);
    expect(failure?.phase).toBe("cancellation");
    expect(failure?.primary).toBe(cancellation);
    expect(fixture.calls).toMatchObject({
      stablePropose: 1,
      teacherPropose: 0,
      teacherRescore: 0,
      stableClose: 1,
      teacherClose: 0,
      teacherAbort: 1,
    });
    stableGate.resolve(
      makeStableResult(capturedParent as FloodgateTrainingParent),
    );
    await nextTurn();
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(coordinator.close()).toBe(coordinator.abortAndDrain());
  });

  it("uses captured live intrinsics while close drains a pending runtime", async () => {
    const fixture = makeRuntimeFixture();
    const stableGate = deferred<unknown>();
    let capturedParent: Readonly<FloodgateTrainingParent> | undefined;
    fixture.stableProposeImplementation = (
      parent: Readonly<FloodgateTrainingParent>,
    ) => {
      capturedParent = parent;
      return stableGate.promise;
    };
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const operation = coordinator.produce({
      input_index: 26,
      parent: makeParent(),
      signal: new AbortController().signal,
    });
    expect(fixture.calls.stablePropose).toBe(1);
    const poisons = installLiveIntrinsicPoisons(LIVE_INTRINSIC_TARGETS.length);
    let failure: FloodgateV7ProductionParentCoordinatorError | undefined;

    try {
      const close = coordinator.close();
      await close;
      failure = (await rejectionOf(
        operation,
      )) as FloodgateV7ProductionParentCoordinatorError;
    } finally {
      poisons.restore();
    }

    expect(poisons.trapCalls()).toBe(0);
    expect(failure?.phase).toBe("cancellation");
    expect(fixture.calls).toMatchObject({
      stablePropose: 1,
      teacherPropose: 0,
      teacherRescore: 0,
      stableClose: 1,
      teacherClose: 1,
      teacherAbort: 0,
    });
    stableGate.resolve(
      makeStableResult(capturedParent as FloodgateTrainingParent),
    );
    await nextTurn();
    expect(fixture.calls.teacherPropose).toBe(0);
    expect(coordinator.close()).toBe(coordinator.abortAndDrain());
  });

  it("re-snapshots and freezes a candidate union built while live Object.freeze is inert", async () => {
    const fixture = makeRuntimeFixture();
    const parent = makeParent();
    const stableResult = makeStableResult(parent);
    const proposal = makeTeacherProposal(
      parent.parent_sfen,
      legalMoves(parent.parent_sfen).length,
    );
    fixture.stableProposeImplementation = () => Promise.resolve(stableResult);
    fixture.teacherProposeImplementation = () => Promise.resolve(proposal);
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const freezeDescriptor = Object.getOwnPropertyDescriptor(Object, "freeze");
    if (freezeDescriptor === undefined) {
      throw new Error("missing Object.freeze descriptor");
    }
    let liveFreezeCalls = 0;
    let result: Awaited<ReturnType<typeof coordinator.produce>> | undefined;

    try {
      nativeObjectDefineProperty(Object, "freeze", {
        configurable: freezeDescriptor.configurable,
        enumerable: freezeDescriptor.enumerable,
        writable: freezeDescriptor.writable,
        value: <T>(value: T): T => {
          liveFreezeCalls += 1;
          return value;
        },
      });
      result = await coordinator.produce({
        input_index: 27,
        parent,
        signal: new AbortController().signal,
      });
    } finally {
      nativeObjectDefineProperty(Object, "freeze", freezeDescriptor);
    }

    expect(liveFreezeCalls).toBeGreaterThan(0);
    expect(result).toBeDefined();
    expectDeepFrozen(result?.union);
    await coordinator.close();
  });

  it("uses captured timers after live setTimeout and clearTimeout are poisoned", async () => {
    const fixture = makeRuntimeFixture();
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const setTimeoutDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "setTimeout",
    );
    const clearTimeoutDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "clearTimeout",
    );
    let poisonCalls = 0;

    try {
      Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        writable: true,
        value: () => {
          poisonCalls += 1;
          throw new Error("live setTimeout must not run");
        },
      });
      Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        writable: true,
        value: () => {
          poisonCalls += 1;
          throw new Error("live clearTimeout must not run");
        },
      });
      const result = await coordinator.produce({
        input_index: 17,
        parent: makeParent(),
        signal: new AbortController().signal,
      });
      expect(
        buildFloodgateV7CompletedParentCoreForTests(result).completion.state,
      ).toBe("complete");
      await coordinator.close();
    } finally {
      if (setTimeoutDescriptor !== undefined) {
        Object.defineProperty(globalThis, "setTimeout", setTimeoutDescriptor);
      }
      if (clearTimeoutDescriptor !== undefined) {
        Object.defineProperty(
          globalThis,
          "clearTimeout",
          clearTimeoutDescriptor,
        );
      }
    }
    expect(poisonCalls).toBe(0);
  });

  it("keeps close first and exactly once when orderly cleanup rejects", async () => {
    const fixture = makeRuntimeFixture();
    fixture.stableCloseImplementation = () =>
      Promise.reject(new Error("synthetic stable close rejection"));
    fixture.teacherCloseImplementation = () =>
      Promise.reject(new Error("synthetic teacher close rejection"));
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );

    const close = coordinator.close();
    expect(coordinator.abortAndDrain()).toBe(close);
    expect(Reflect.apply(coordinator.close, undefined, ["late-extra"])).toBe(
      close,
    );
    const failure = (await rejectionOf(close)) as {
      readonly phase: string;
      readonly cleanupFailures: readonly unknown[];
    };
    expect(failure.phase).toBe("cleanup");
    expect(failure.cleanupFailures).toHaveLength(2);
    expect(fixture.calls.stableClose).toBe(1);
    expect(fixture.calls.teacherClose).toBe(1);
    expect(fixture.calls.teacherAbort).toBe(0);
  });

  it("starts independent parent proposals concurrently without mixing their captured parents", async () => {
    const fixture = makeRuntimeFixture();
    const gates = [deferred<unknown>(), deferred<unknown>()];
    const captured: Readonly<FloodgateTrainingParent>[] = [];
    fixture.stableProposeImplementation = (
      parent: Readonly<FloodgateTrainingParent>,
    ) => {
      captured.push(parent);
      return gates[captured.length - 1].promise;
    };
    const coordinator =
      await createFloodgateV7ProductionParentCoordinatorCoreForTests(
        fixture.dependencies,
      );
    const firstParent = makeParent();
    const secondParent = {
      ...makeParent(),
      game_id: `sha256:${sha256("concurrent-second-game")}`,
    };
    secondParent.parent_id = `sha256:${sha256(
      `parent-occurrence-v1\0${secondParent.game_id}\0${0}`,
    )}`;
    const first = coordinator.produce({
      input_index: 18,
      parent: firstParent,
      signal: new AbortController().signal,
    });
    const second = coordinator.produce({
      input_index: 19,
      parent: secondParent,
      signal: new AbortController().signal,
    });
    expect(fixture.calls.stablePropose).toBe(2);
    expect(fixture.calls.teacherPropose).toBe(0);

    gates[0].resolve(makeStableResult(captured[0]));
    await waitFor(() => fixture.calls.teacherPropose === 1);
    expect(fixture.calls.stablePropose).toBe(2);
    gates[1].resolve(makeStableResult(captured[1]));
    const [firstResult, secondResult] = await Promise.all([first, second]);
    const firstEvidence =
      buildFloodgateV7CompletedParentCoreForTests(firstResult);
    const secondEvidence =
      buildFloodgateV7CompletedParentCoreForTests(secondResult);
    expect(firstEvidence.parent.game_id).toBe(firstParent.game_id);
    expect(secondEvidence.parent.game_id).toBe(secondParent.game_id);
    expect(fixture.calls.teacherPropose).toBe(2);
    expect(fixture.calls.teacherRescore).toBe(6);
    await coordinator.close();
  });

  it("keeps the production factory zero-argument without starting production assets", () => {
    type ProductionCoordinator = Awaited<
      ReturnType<typeof createFloodgateV7ProductionParentCoordinator>
    >;
    const productionReceiptLiterals = (
      coordinator: ProductionCoordinator,
    ): readonly [
      string,
      string,
      ProductionCoordinator["receipt"]["test_boundary"],
      false,
      false,
      false,
    ] => [
      coordinator.receipt.status,
      coordinator.receipt.claim_boundary,
      coordinator.receipt.test_boundary,
      coordinator.receipt.nonclaims.checkpoint,
      coordinator.receipt.nonclaims.key_authority,
      coordinator.receipt.nonclaims.playing_strength,
    ];
    expect(productionReceiptLiterals).toBeTypeOf("function");
    expect(createFloodgateV7ProductionParentCoordinator.length).toBe(0);
    expect(
      createFloodgateV7ProductionParentCoordinatorCoreForTests.length,
    ).toBe(1);
    expect(
      claimFloodgateV7ProductionParentCoordinatorForCheckpoint.length,
    ).toBe(1);
    expect(
      claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests.length,
    ).toBe(1);
    const source = fs.readFileSync(COORDINATOR_SOURCE_PATH, "utf8");
    expect(source).toContain("createFloodgateV7ProductionRuntimeOwner()");
    expect(source).toContain(
      "claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator",
    );
    expect(source).toContain("productionCheckpointHandoffs");
    expect(source).toContain("testCheckpointHandoffs");
    expect(source).toContain(
      "claimFloodgateV7ProductionParentCoordinatorForCheckpoint",
    );
    expect(source).toContain(
      "claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests",
    );
    expect(source).not.toMatch(/from ["']node:fs["']/);
    expect(source).not.toContain("checkpointFloodgateV7TeacherParents");
    expect(source).not.toContain("rootKey");
    expect(source).not.toContain("datasetPath");
  });

  it("keeps the exact owner handoff free of checkpoint, key, and dataset I/O", () => {
    const source = fs.readFileSync(OWNER_SOURCE_PATH, "utf8");
    expect(source).toContain("productionParentCoordinatorHandoffs");
    expect(source).toContain("testParentCoordinatorHandoffs");
    expect(source).toContain(
      "claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator",
    );
    expect(source).toContain(
      "claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests",
    );
    expect(source).not.toMatch(/from ["']node:fs["']/);
    expect(source).not.toContain("checkpointFloodgateV7TeacherParents");
    expect(source).not.toContain("rootKey");
    expect(source).not.toContain("datasetPath");
  });
});
