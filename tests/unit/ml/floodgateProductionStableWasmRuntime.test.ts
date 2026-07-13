import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
  type FloodgateProductionTeacherAssetEvidence,
  type FloodgateProductionStableRuntimeAssets,
  type FloodgateProductionStableRuntimeAssetsCallback,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS,
  FloodgateProductionStableWasmRuntimeError,
  createFloodgateProductionStableWasmRuntime,
  createFloodgateProductionStableWasmRuntimeCoreForTests,
  type FloodgateProductionStableWasmRuntimeCoreDependencies,
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import type { FloodgateTrainingParent } from "../../../ml/floodgate-training-row-consumer";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_QUIESCENCE_DEPTH,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_RECEIPT_SCHEMA,
  FLOODGATE_STABLE_WASM_REUSABLE_POOL_STATUS,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  type FloodgateStableWasmProposalRow,
  type FloodgateStableWasmReusableProposalPool,
  type FloodgateStableWasmReusableProposalPoolOptions,
  type FloodgateStableWasmSearchAssets,
} from "../../../ml/floodgate-stable-wasm-proposer";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";

type TestBoundary = "test-only-injected-expected-registry-and-root";
type TestAssets = FloodgateProductionStableRuntimeAssets<TestBoundary>;
type TestAssetProvider =
  FloodgateProductionStableWasmRuntimeCoreDependencies["assetProvider"];
type TestPoolFactory =
  FloodgateProductionStableWasmRuntimeCoreDependencies["poolFactory"];

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function nullRecord<T extends object>(value: T): Readonly<T> {
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

function positionId(sfen: string): string {
  const fields = sfen.split(" ");
  return `sha256:${sha256(`sfen-v1\0${fields.slice(0, 3).join(" ")}`)}`;
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function parent(
  overrides: Partial<FloodgateTrainingParent> = {},
): FloodgateTrainingParent {
  const gameId = overrides.game_id ?? `sha256:${sha256("synthetic-game")}`;
  const ply = overrides.ply ?? 0;
  const parentSfen = overrides.parent_sfen ?? START_SFEN;
  return {
    schema_version: 1,
    game_id: gameId,
    parent_id: overrides.parent_id ?? parentId(gameId, ply),
    position_id: overrides.position_id ?? positionId(parentSfen),
    parent_sfen: parentSfen,
    ply,
    played_move: overrides.played_move ?? "7g7f",
  };
}

function proposalRow(
  value: Readonly<FloodgateTrainingParent>,
  stableMove = "7g7f",
): Readonly<FloodgateStableWasmProposalRow> {
  const payload = nullRecord({
    schema_version: value.schema_version,
    game_id: value.game_id,
    parent_id: value.parent_id,
    position_id: value.position_id,
    parent_sfen: value.parent_sfen,
    ply: value.ply,
    played_move: value.played_move,
  });
  const childSfen = childSfenAfterUsi(value.parent_sfen, stableMove);
  return nullRecord({
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: value.game_id,
    parent_id: value.parent_id,
    position_id: value.position_id,
    parent_payload_sha256: sha256(
      `shogi-floodgate-stable-parent-v1\0${canonicalJson(payload)}`,
    ),
    stable_move: stableMove,
    child_sfen: childSfen,
    child_position_id: positionId(childSfen),
    search: nullRecord({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      termination: "requested-depth-complete" as const,
      raw_search_score: 321,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 10,
      leaves: 2,
      root_tesu: value.ply,
    }),
  });
}

function identity(bytes: Uint8Array): Readonly<{
  readonly bytes: number;
  readonly sha256: string;
}> {
  return nullRecord({ bytes: bytes.byteLength, sha256: sha256(bytes) });
}

function evidence(
  relativePath: string,
  bytes: Uint8Array,
): Readonly<FloodgateProductionTeacherAssetEvidence> {
  return nullRecord({
    relative_path: relativePath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    mode: "0600" as const,
    identity: nullRecord({ dev: "1", ino: "1" }),
  });
}

interface AssetFixture {
  readonly wasm: Uint8Array;
  readonly weights: Uint8Array;
  readonly worker: Uint8Array;
  readonly receipt: TestAssets["receipt"];
  readonly assets: TestAssets;
}

function assetFixture(
  options: {
    readonly wasm?: Uint8Array;
    readonly weights?: Uint8Array;
    readonly worker?: Uint8Array;
    readonly badWorkerReceipt?: boolean;
    readonly normalOuterPrototype?: boolean;
  } = {},
): AssetFixture {
  const wasm = options.wasm ?? new Uint8Array([1, 2, 3, 4]);
  const weights = options.weights ?? new Uint8Array([5, 6, 7, 8, 9]);
  const worker = options.worker ?? new Uint8Array([10, 11, 12]);
  const plan = new Uint8Array([13]);
  const engine = new Uint8Array([14]);
  const engineReceipt = new Uint8Array([15]);
  const evaluation = new Uint8Array([16]);
  const workerEvidence: Readonly<FloodgateProductionTeacherAssetEvidence> =
    options.badWorkerReceipt
      ? nullRecord({
          relative_path: "stable/worker.mjs",
          bytes: worker.byteLength,
          sha256: "0".repeat(64),
          mode: "0600" as const,
          identity: nullRecord({ dev: "1", ino: "1" }),
        })
      : evidence("stable/worker.mjs", worker);
  const receipt = nullRecord({
    contract: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
    execution_boundary:
      "test-only-injected-expected-registry-and-root" as const,
    deployment: nullRecord({
      layout: "fixed-per-user-application-support-v1" as const,
      owner_uid: 501,
      exact_tree: true as const,
      private_directories: true as const,
    }),
    assets: nullRecord({
      engine: nullRecord({
        yaneuraou: evidence("engine/yaneuraou", engine),
        receipt: evidence("engine/receipt.json", engineReceipt),
      }),
      eval: nullRecord({
        nn: evidence("eval/nn.bin", evaluation),
        tree_sha256: sha256("synthetic-tree"),
      }),
      stable: nullRecord({
        plan: evidence("stable/plan.json", plan),
        wasm: evidence("stable/shogi.wasm", wasm),
        weights: evidence("stable/weights.bin", weights),
        worker: workerEvidence,
      }),
    }),
    engine: nullRecord({
      receipt_schema: "shogi-teacher-engine-receipt-v1" as const,
      source_repository: "https://example.test/engine.git",
      source_commit: "1".repeat(40),
      source_commit_date: "2026-07-12T00:00:00Z",
      engine_id: "synthetic engine",
      binary_cross_bound: true as const,
    }),
    runtime: nullRecord({
      parallel_engines: 12 as const,
      threads_per_engine: 1 as const,
      hash_mb_per_engine: 64 as const,
      timeout_ms_per_search: 600_000 as const,
      proposal: nullRecord({ multipv: 12 as const, depth: 16 as const }),
      independent_rescore: nullRecord({
        multipv: 1 as const,
        searchmoves: "exactly-one-candidate" as const,
        depth: 16 as const,
      }),
      stable: nullRecord({ depth: 11 as const }),
    }),
    postverification: nullRecord({
      embedded_wasm_exactly_equal: true as const,
      exact_entries_revalidated: true as const,
      identities_revalidated: true as const,
      contents_stably_read: true as const,
    }),
  });
  const byteRecord = nullRecord({ wasm, weights, worker });
  const assets = options.normalOuterPrototype
    ? (Object.freeze({ receipt, bytes: byteRecord }) as TestAssets)
    : (nullRecord({ receipt, bytes: byteRecord }) as TestAssets);
  return { wasm, weights, worker, receipt, assets };
}

function assetProvider(
  fixture: AssetFixture,
  options: {
    readonly replaceResult?: boolean;
    readonly callTwice?: boolean;
  } = {},
): TestAssetProvider {
  return async <TResult>(
    callback: FloodgateProductionStableRuntimeAssetsCallback<
      TResult,
      TestBoundary
    >,
  ): Promise<TResult> => {
    try {
      const result = await callback(fixture.assets);
      if (options.callTwice) await callback(fixture.assets);
      if (options.replaceResult) return nullRecord({}) as TResult;
      return result;
    } finally {
      Uint8Array.prototype.fill.call(fixture.wasm, 0);
      Uint8Array.prototype.fill.call(fixture.weights, 0);
      Uint8Array.prototype.fill.call(fixture.worker, 0);
    }
  };
}

function poolReceipt(
  assets: Readonly<FloodgateStableWasmSearchAssets>,
  options: Readonly<FloodgateStableWasmReusableProposalPoolOptions>,
  overrides: { readonly workers?: number; readonly cleanup?: string } = {},
): FloodgateStableWasmReusableProposalPool["receipt"] {
  return nullRecord({
    schema: FLOODGATE_STABLE_WASM_REUSABLE_POOL_RECEIPT_SCHEMA,
    status: FLOODGATE_STABLE_WASM_REUSABLE_POOL_STATUS,
    claim_boundary: FLOODGATE_STABLE_WASM_REUSABLE_POOL_CLAIM_BOUNDARY,
    supplied_engine_assets: nullRecord({
      worker_source: identity(assets.workerSourceBytes),
      wasm: identity(assets.wasmBytes),
      weights: nullRecord({
        ...identity(assets.weightsBytes),
        k: 600,
        buckets: 1,
      }),
    }),
    required_search_contract: nullRecord({
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
      nnue: nullRecord({
        enabled: true,
        buckets: 1,
        k: 600,
        output_scale: "1/1",
      }),
      early_completion:
        "depth-1-through-10-only-for-winning-score-89990000-through-90000000",
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
    }),
    operational: nullRecord({
      workers: overrides.workers ?? options.workers,
      queue_bound: options.queueBound,
      startup_timeout_ms: options.startupTimeoutMilliseconds,
      search_timeout_ms: options.searchTimeoutMilliseconds,
      close_timeout_ms: options.closeTimeoutMilliseconds,
      scheduling: "bounded-fifo-one-parent-per-worker-v1",
      failure_policy: "pool-wide-poison-reject-all-force-stop-v1",
      cleanup:
        overrides.cleanup ??
        "asset-copies-zeroized-idle-quit-active-or-poison-force-stop-idempotent-close-v1",
    }),
  });
}

interface PoolControls {
  closeCalls: number;
  proposeCalls: number;
  readonly retained: {
    wasm: Uint8Array;
    weights: Uint8Array;
    worker: Uint8Array;
  };
  resolveProposal?: () => void;
}

function poolFactory(
  controls: PoolControls,
  options: {
    readonly deferred?: boolean;
    readonly poison?: Error;
    readonly receiptWorkers?: number;
    readonly installHostileFill?: () => void;
    readonly unfrozenPropose?: boolean;
  } = {},
): TestPoolFactory {
  return async (
    assets: Readonly<FloodgateStableWasmSearchAssets>,
    runtimeOptions: Readonly<FloodgateStableWasmReusableProposalPoolOptions>,
  ): Promise<Readonly<FloodgateStableWasmReusableProposalPool>> => {
    controls.retained.wasm = new Uint8Array(assets.wasmBytes);
    controls.retained.weights = new Uint8Array(assets.weightsBytes);
    controls.retained.worker = new Uint8Array(assets.workerSourceBytes);
    options.installHostileFill?.();
    let closed = false;
    const proposeImplementation = (
      capturedParent: Readonly<FloodgateTrainingParent>,
    ) => {
      expect(Object.keys(capturedParent)).toEqual([
        "schema_version",
        "game_id",
        "parent_id",
        "position_id",
        "parent_sfen",
        "ply",
        "played_move",
      ]);
      expect(Object.getPrototypeOf(capturedParent)).toBeNull();
      expect(Object.isFrozen(capturedParent)).toBe(true);
      controls.proposeCalls += 1;
      if (options.poison !== undefined) return Promise.reject(options.poison);
      if (!options.deferred)
        return Promise.resolve(proposalRow(capturedParent));
      return new Promise<Readonly<FloodgateStableWasmProposalRow>>(
        (resolve) => {
          controls.resolveProposal = () => resolve(proposalRow(capturedParent));
        },
      );
    };
    const propose = options.unfrozenPropose
      ? proposeImplementation
      : Object.freeze(proposeImplementation);
    const close = Object.freeze(() => {
      if (!closed) {
        closed = true;
        controls.closeCalls += 1;
      }
      return Promise.resolve();
    });
    return nullRecord({
      receipt: poolReceipt(assets, runtimeOptions, {
        ...(options.receiptWorkers === undefined
          ? {}
          : { workers: options.receiptWorkers }),
      }),
      propose,
      close,
    });
  };
}

function controls(): PoolControls {
  return {
    closeCalls: 0,
    proposeCalls: 0,
    retained: {
      wasm: new Uint8Array(),
      weights: new Uint8Array(),
      worker: new Uint8Array(),
    },
  };
}

function pinNativePromise<T>(promise: Promise<T>): Promise<T> {
  Object.defineProperty(promise, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Promise,
  });
  return promise;
}

function expectFrozenNullGraph(value: unknown): void {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") expect(Object.isFrozen(value)).toBe(true);
    return;
  }
  if (ArrayBuffer.isView(value)) return;
  if (Array.isArray(value)) {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of value) expectFrozenNullGraph(entry);
    return;
  }
  expect(Object.getPrototypeOf(value)).toBeNull();
  expect(Object.isFrozen(value)).toBe(true);
  for (const entry of Object.values(value)) expectFrozenNullGraph(entry);
}

describe("Floodgate production stable-WASM runtime", () => {
  it("keeps the production factory zero-argument and rejects runtime injection", async () => {
    expect(createFloodgateProductionStableWasmRuntime.length).toBe(0);
    await expect(
      (
        createFloodgateProductionStableWasmRuntime as unknown as (
          injected: unknown,
        ) => Promise<unknown>
      )({ poolFactory: "forged" }),
    ).rejects.toMatchObject({ phase: "capture" });
  });

  it("fixes all production options, binds receipts, zeroizes handoff copies, and returns deep-frozen data", async () => {
    const fixture = assetFixture();
    const state = controls();
    let observedOptions:
      Readonly<FloodgateStableWasmReusableProposalPoolOptions> | undefined;
    let handedAssets: Readonly<FloodgateStableWasmSearchAssets> | undefined;
    const baseFactory = poolFactory(state);
    const factory: TestPoolFactory = async (assets, options) => {
      handedAssets = assets;
      observedOptions = options;
      return baseFactory(assets, options);
    };
    const runtime =
      await createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: factory,
      });

    expect(observedOptions).toEqual({
      workers: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS,
      queueBound: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND,
      startupTimeoutMilliseconds:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS,
      searchTimeoutMilliseconds:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
      closeTimeoutMilliseconds:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS,
    });
    expect([...handedAssets!.wasmBytes]).toEqual([0, 0, 0, 0]);
    expect([...handedAssets!.weightsBytes]).toEqual([0, 0, 0, 0, 0]);
    expect([...handedAssets!.workerSourceBytes]).toEqual([0, 0, 0]);
    expect([...state.retained.wasm]).toEqual([1, 2, 3, 4]);
    expect(runtime.receipt).toMatchObject({
      contract: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT,
      status: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS,
      claim_boundary: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY,
      execution_boundary: "test-only-injected-asset-provider-and-pool-factory",
      search_contract: {
        requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
        positive_mate_score_min: FLOODGATE_STABLE_MATE_SCORE_MIN,
        positive_mate_score_max: FLOODGATE_STABLE_MATE_SCORE_MAX,
      },
      nonclaims: {
        parent_authentication: false,
        teacher_label: false,
        training: false,
        selection_or_holdout_access: false,
        playing_strength: false,
      },
    });
    expectFrozenNullGraph(runtime);
    expect(Object.isFrozen(runtime.propose)).toBe(true);
    expect(Object.isFrozen(runtime.close)).toBe(true);

    const result = await runtime.propose(parent());
    expect(result).toMatchObject({
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      runtime_binding: {
        claim_boundary:
          FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    });
    expect(result.runtime_binding.runtime_receipt_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(result.runtime_binding.row_sha256).toMatch(/^[0-9a-f]{64}$/);
    expectFrozenNullGraph(result);
    await runtime.close();
    await runtime.close();
    expect(state.closeCalls).toBe(1);
  });

  it("captures the parent before the first await", async () => {
    const fixture = assetFixture();
    const state = controls();
    const runtime =
      await createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: poolFactory(state, { deferred: true }),
      });
    const mutable = parent() as {
      -readonly [
        TKey in keyof FloodgateTrainingParent
      ]: FloodgateTrainingParent[TKey];
    };
    const pending = runtime.propose(mutable);
    mutable.played_move = "2g2f";
    state.resolveProposal?.();
    const result = await pending;
    expect(result.row.stable_move).toBe("7g7f");
    expect(result.row.parent_id).toBe(parent().parent_id);
    await runtime.close();
  });

  it("rejects forged asset-provider structure and callback result replacement", async () => {
    const normalOuter = assetFixture({ normalOuterPrototype: true });
    const first = controls();
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(normalOuter),
        poolFactory: poolFactory(first),
      }),
    ).rejects.toBeInstanceOf(FloodgateProductionStableWasmRuntimeError);
    expect(first.proposeCalls).toBe(0);

    const replaced = assetFixture();
    const second = controls();
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(replaced, { replaceResult: true }),
        poolFactory: poolFactory(second),
      }),
    ).rejects.toBeInstanceOf(FloodgateProductionStableWasmRuntimeError);
    expect(second.closeCalls).toBe(1);

    const multiple = assetFixture();
    const third = controls();
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(multiple, { callTwice: true }),
        poolFactory: poolFactory(third),
      }),
    ).rejects.toBeInstanceOf(FloodgateProductionStableWasmRuntimeError);
    expect(third.closeCalls).toBe(1);

    const fourth = controls();
    const zeroCallbackProvider: TestAssetProvider = async () =>
      nullRecord({ never: "a runtime" }) as never;
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: zeroCallbackProvider,
        poolFactory: poolFactory(fourth),
      }),
    ).rejects.toBeInstanceOf(FloodgateProductionStableWasmRuntimeError);
    expect(fourth.closeCalls).toBe(0);
  });

  it("closes an initialized exact pool when its receipt is forged", async () => {
    const fixture = assetFixture();
    const state = controls();
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: poolFactory(state, { receiptWorkers: 11 }),
      }),
    ).rejects.toMatchObject({
      phase: "pool-initialization",
    });
    expect(state.closeCalls).toBe(1);

    const malformedFacadeState = controls();
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(assetFixture()),
        poolFactory: poolFactory(malformedFacadeState, {
          unfrozenPropose: true,
        }),
      }),
    ).rejects.toMatchObject({ phase: "pool-initialization" });
    expect(malformedFacadeState.closeCalls).toBe(1);

    const accessorState = controls();
    const validAccessorFactory = poolFactory(accessorState);
    let proposeGetterCalls = 0;
    const accessorFactory: TestPoolFactory = async (assets, options) => {
      const pool = await validAccessorFactory(assets, options);
      const malformed = Object.create(null);
      Object.defineProperties(malformed, {
        receipt: { enumerable: true, value: pool.receipt },
        propose: {
          enumerable: true,
          get() {
            proposeGetterCalls += 1;
            throw new Error("propose getter must not execute");
          },
        },
        close: { enumerable: true, value: pool.close },
      });
      return Object.freeze(
        malformed,
      ) as Readonly<FloodgateStableWasmReusableProposalPool>;
    };
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(assetFixture()),
        poolFactory: accessorFactory,
      }),
    ).rejects.toMatchObject({ phase: "pool-initialization" });
    expect(proposeGetterCalls).toBe(0);
    expect(accessorState.closeCalls).toBe(1);
  });

  it("accepts the low-level pinned native Promise shape without consulting live Promise.prototype.then", async () => {
    const fixture = assetFixture();
    const state = controls();
    const baseFactory = poolFactory(state);
    const factory: TestPoolFactory = async (assets, options) => {
      const pool = await baseFactory(assets, options);
      const propose = Object.freeze(
        (value: Readonly<FloodgateTrainingParent>) =>
          pinNativePromise(pool.propose(value)),
      );
      const close = Object.freeze(() => pinNativePromise(pool.close()));
      return nullRecord({ receipt: pool.receipt, propose, close });
    };
    const runtime =
      await createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: factory,
      });
    const originalThen = Promise.prototype.then;
    let liveThenCalls = 0;
    Object.defineProperty(Promise.prototype, "then", {
      configurable: true,
      writable: true,
      value() {
        liveThenCalls += 1;
        throw new Error("live Promise.prototype.then was consulted");
      },
    });
    try {
      const result = await runtime.propose(parent());
      expect(result.row.stable_move).toBe("7g7f");
      await runtime.close();
    } finally {
      Object.defineProperty(Promise.prototype, "then", {
        configurable: true,
        writable: true,
        value: originalThen,
      });
    }
    expect(liveThenCalls).toBe(0);
  });

  it("uses an intrinsic rejection path after live Promise.reject is poisoned", async () => {
    const fixture = assetFixture();
    const state = controls();
    const runtime =
      await createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: poolFactory(state),
      });
    const originalReject = Promise.reject;
    let liveRejectCalls = 0;
    Object.defineProperty(Promise, "reject", {
      configurable: true,
      writable: true,
      value() {
        liveRejectCalls += 1;
        throw new Error("live Promise.reject was consulted");
      },
    });
    try {
      await expect(
        runtime.propose({ ...parent(), schema_version: 2 } as never),
      ).rejects.toMatchObject({ phase: "proposal" });
    } finally {
      Object.defineProperty(Promise, "reject", {
        configurable: true,
        writable: true,
        value: originalReject,
      });
    }
    expect(liveRejectCalls).toBe(0);
    await runtime.close();
  });

  it("rejects Uint8Array subclasses before hostile typed-array getters and uses intrinsic zeroization", async () => {
    let getterCalls = 0;
    class HostileUint8Array extends Uint8Array {
      override get buffer(): ArrayBuffer {
        getterCalls += 1;
        throw new Error("hostile buffer getter");
      }
    }
    const hostile = new HostileUint8Array([1, 2, 3]);
    const fixture = assetFixture({ wasm: hostile });
    const state = controls();
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: poolFactory(state),
      }),
    ).rejects.toBeInstanceOf(FloodgateProductionStableWasmRuntimeError);
    expect(getterCalls).toBe(0);
    expect(state.proposeCalls).toBe(0);

    const cleanFixture = assetFixture();
    const cleanState = controls();
    let fillTrapCalls = 0;
    const factory: TestPoolFactory = async (assets, options) => {
      Object.defineProperty(assets.wasmBytes, "fill", {
        configurable: true,
        get() {
          fillTrapCalls += 1;
          throw new Error("hostile fill getter");
        },
      });
      return poolFactory(cleanState)(assets, options);
    };
    const runtime =
      await createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(cleanFixture),
        poolFactory: factory,
      });
    expect(fillTrapCalls).toBe(0);
    await runtime.close();
  });

  it("zeroizes provider bytes on partial validation failure and rejects Promise subclasses", async () => {
    const invalid = assetFixture({ badWorkerReceipt: true });
    const state = controls();
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(invalid),
        poolFactory: poolFactory(state),
      }),
    ).rejects.toBeInstanceOf(FloodgateProductionStableWasmRuntimeError);
    expect([...invalid.wasm]).toEqual([0, 0, 0, 0]);
    expect([...invalid.weights]).toEqual([0, 0, 0, 0, 0]);
    expect([...invalid.worker]).toEqual([0, 0, 0]);
    expect(state.proposeCalls).toBe(0);

    class PromiseSubclass<T> extends Promise<T> {}
    const fixture = assetFixture();
    const validState = controls();
    const validFactory = poolFactory(validState);
    const subclassFactory = ((assets, options) =>
      new PromiseSubclass((resolve, reject) => {
        validFactory(assets, options).then(resolve, reject);
      })) as TestPoolFactory;
    await expect(
      createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: subclassFactory,
      }),
    ).rejects.toBeInstanceOf(FloodgateProductionStableWasmRuntimeError);
  });

  it("delegates pool-wide poison without retry and rejects king-capture parent states before the pool", async () => {
    const fixture = assetFixture();
    const state = controls();
    const poison = new Error("synthetic pool-wide poison");
    const runtime =
      await createFloodgateProductionStableWasmRuntimeCoreForTests({
        assetProvider: assetProvider(fixture),
        poolFactory: poolFactory(state, { poison }),
      });
    await expect(runtime.propose(parent())).rejects.toMatchObject({
      phase: "proposal",
    });
    expect(state.proposeCalls).toBe(1);

    const adjacentKings = "9/9/9/9/4k4/4K4/9/9/9 b - 1";
    await expect(
      runtime.propose(
        parent({
          parent_sfen: adjacentKings,
          position_id: positionId(adjacentKings),
          played_move: "5f4g",
        }),
      ),
    ).rejects.toMatchObject({ phase: "proposal" });
    expect(state.proposeCalls).toBe(1);
    await runtime.close();
  });
});
