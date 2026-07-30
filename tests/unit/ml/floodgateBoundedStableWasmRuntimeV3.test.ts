import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_BOUNDED_STABLE_WASM_SOURCE_TRANSFER_TIMEOUT_MS_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
  FloodgateBoundedStableWasmSourceTransferErrorV3,
  completeFloodgateBoundedStableWasmWorkerStartupStagesV3CoreForTests,
  createFloodgateBoundedStableWasmProductionWorkerLaneV3CoreForTests,
  createFloodgateBoundedStableWasmRuntimeV3CoreForTests,
  getFloodgateBoundedStableWasmRuntimeReceiptDigestV3,
  transferFloodgateBoundedStableWasmWorkerSourceV3CoreForTests,
  validateFloodgateBoundedStableWasmOutcomeV3,
  type FloodgateBoundedStableWasmWorkerFactoryV3,
  type FloodgateBoundedStableWasmWorkerLaneV3,
  type FloodgateBoundedStableWasmWorkerResultV3,
} from "../../../ml/floodgate-bounded-stable-wasm-runtime-v3";
import type { FloodgateTrainingParent } from "../../../ml/floodgate-training-row-consumer";
import { SHOGI_WASM_BASE64 } from "../../../src/components/game/ShogiImproved/wasm/shogiWasmBase64";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const PACKED_7G7F = 17 | (0x77 << 6) | (0x76 << 14);

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parent(label: string): FloodgateTrainingParent {
  return {
    schema_version: 1,
    game_id: `sha256:${digest(`game:${label}`)}`,
    parent_id: `sha256:${digest(`parent:${label}`)}`,
    position_id: `sha256:${digest(`position:${label}`)}`,
    parent_sfen: START_SFEN,
    ply: 0,
    played_move: "7g7f",
  };
}

function proposal(): Readonly<FloodgateBoundedStableWasmWorkerResultV3> {
  return Object.freeze({
    outcome: "proposal" as const,
    index: 0,
    packed_move: PACKED_7G7F,
    raw_search_score: 125,
    completed_depth: 11,
    nodes: 5_000,
    leaves: 1_000,
  });
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

interface ScriptedLane extends FloodgateBoundedStableWasmWorkerLaneV3 {
  readonly closed: boolean;
}

function factoryFromScripts(
  scripts: Array<
    () => Promise<Readonly<FloodgateBoundedStableWasmWorkerResultV3>>
  >,
  events: string[],
): Readonly<FloodgateBoundedStableWasmWorkerFactoryV3> {
  let next = 0;
  return Object.freeze({
    async create(): Promise<Readonly<FloodgateBoundedStableWasmWorkerLaneV3>> {
      const index = next;
      next += 1;
      events.push(`create:${index}`);
      let closed = false;
      const script = scripts[index] ?? (async () => proposal());
      const lane: FloodgateBoundedStableWasmWorkerLaneV3 = {
        startupTelemetry: Object.freeze({
          worker_pid: index + 1,
          source_bytes: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
          source_transfer_milliseconds: 1,
          init_ready_milliseconds: 2,
          total_milliseconds: 3,
          source_transfer_completed_before_init: true,
        }),
        async search() {
          events.push(`search:${index}`);
          return script();
        },
        async close(force) {
          closed = true;
          events.push(`close:${index}:${String(force)}`);
        },
      };
      Object.defineProperty(lane, "closed", {
        enumerable: true,
        get: () => closed,
      });
      return lane as ScriptedLane;
    },
  });
}

describe("bounded optional stable-WASM runtime v3", () => {
  it("does not send init before the source end callback", async () => {
    let finishSource!: () => void;
    const sourcePipe = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
      final(callback) {
        finishSource = callback;
      },
    });
    const sourceTransfer =
      transferFloodgateBoundedStableWasmWorkerSourceV3CoreForTests(
        sourcePipe,
        Buffer.alloc(FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3),
        1_000,
      );
    const events: string[] = [];
    let remainingMilliseconds = 0;
    const startup =
      completeFloodgateBoundedStableWasmWorkerStartupStagesV3CoreForTests(
        sourceTransfer,
        async (remaining) => {
          remainingMilliseconds = remaining;
          events.push("init");
          return "ready";
        },
      );
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual([]);

    finishSource();
    const result = await startup;
    expect(result.ready).toBe("ready");
    expect(result.sourceTransfer.completed).toBe(true);
    expect(events).toEqual(["init"]);
    expect(remainingMilliseconds).toBeGreaterThan(0);
    expect(remainingMilliseconds).toBeLessThanOrEqual(120_000);
  });

  it("fails source transfer with typed stream and bounded timeout errors", async () => {
    const failingPipe = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error("synthetic source write failure"));
      },
    });
    const streamFailure =
      transferFloodgateBoundedStableWasmWorkerSourceV3CoreForTests(
        failingPipe,
        Buffer.alloc(FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3),
        1_000,
      ).catch((error: unknown) => error);
    await expect(streamFailure).resolves.toMatchObject({
      name: "FloodgateBoundedStableWasmSourceTransferErrorV3",
      stage: "worker-source-transfer",
      reason: "stream-error",
    });

    const stalledPipe = new Writable({
      write() {
        // Deliberately never acknowledge this bounded test write.
      },
    });
    const timeout =
      transferFloodgateBoundedStableWasmWorkerSourceV3CoreForTests(
        stalledPipe,
        Buffer.alloc(FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3),
        10,
      ).catch((error: unknown) => error);
    const timeoutError = await timeout;
    expect(timeoutError).toBeInstanceOf(
      FloodgateBoundedStableWasmSourceTransferErrorV3,
    );
    expect(timeoutError).toMatchObject({
      stage: "worker-source-transfer",
      reason: "timeout",
    });
    expect(
      (timeoutError as FloodgateBoundedStableWasmSourceTransferErrorV3)
        .elapsedMilliseconds,
    ).toBeGreaterThanOrEqual(5);
  });

  it("cold-starts twelve real workers after bounded source transfer", async () => {
    const source = readFileSync(
      new URL(
        "../../../ml/floodgate-bounded-stable-wasm-worker-v3.mjs",
        import.meta.url,
      ),
    );
    const weights = readFileSync(
      new URL("../../../public/shogi-nnue-weights.bin", import.meta.url),
    );
    const wasm = Buffer.from(SHOGI_WASM_BASE64, "base64");
    const lanes = await Promise.all(
      Array.from({ length: 12 }, () =>
        createFloodgateBoundedStableWasmProductionWorkerLaneV3CoreForTests(
          { wasm, weights },
          source,
        ),
      ),
    );
    try {
      expect(FLOODGATE_BOUNDED_STABLE_WASM_SOURCE_TRANSFER_TIMEOUT_MS_V3).toBe(
        120_000,
      );
      expect(lanes).toHaveLength(12);
      for (const lane of lanes) {
        expect(lane.startupTelemetry).toEqual(
          expect.objectContaining({
            source_bytes: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
            source_transfer_completed_before_init: true,
          }),
        );
        expect(
          lane.startupTelemetry?.source_transfer_milliseconds,
        ).toBeGreaterThanOrEqual(0);
        expect(lane.startupTelemetry?.init_ready_milliseconds).toBeGreaterThan(
          0,
        );
      }
    } finally {
      await Promise.all(lanes.map((lane) => lane.close(true)));
    }
  });

  it("binds the fixed 20s cooperative budget into the runtime receipt", async () => {
    const events: string[] = [];
    const runtime = await createFloodgateBoundedStableWasmRuntimeV3CoreForTests(
      {
        assetAuthorityReceiptSha256: "a".repeat(64),
        workers: 1,
        queueBound: 2,
        workerFactory: factoryFromScripts([async () => proposal()], events),
      },
    );

    expect(FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3).toBe(20_000);
    expect(runtime.receipt.search).toEqual(
      expect.objectContaining({
        cooperative_deadline_ms: 20_000,
        partial_result_policy: "discard-entire-move-score-and-counters",
        stable_candidate_role: "optional",
      }),
    );
    expect(runtime.receipt.operational.omission_policy).toBe(
      "resolve-explicit-bound-outcome-no-pool-poison",
    );
    await runtime.close();
  });

  it("force-closes every initialized lane when a peer fails during startup", async () => {
    const events: string[] = [];
    let creation = 0;
    const factory: FloodgateBoundedStableWasmWorkerFactoryV3 = Object.freeze({
      async create() {
        const index = creation;
        creation += 1;
        events.push(`create:${index}`);
        if (index === 1) throw new Error("synthetic startup failure");
        return Object.freeze({
          async search() {
            return proposal();
          },
          async close(force: boolean) {
            events.push(`close:${index}:${String(force)}`);
          },
        });
      },
    });

    await expect(
      createFloodgateBoundedStableWasmRuntimeV3CoreForTests({
        assetAuthorityReceiptSha256: "e".repeat(64),
        workers: 2,
        queueBound: 2,
        workerFactory: factory,
      }),
    ).rejects.toThrow("bounded stable worker initialization failed closed");
    expect(events).toEqual(["create:0", "create:1", "close:0:true"]);
  });

  it("returns an authenticated omission with no partial move and replaces only its lane", async () => {
    const events: string[] = [];
    const delayed =
      deferred<Readonly<FloodgateBoundedStableWasmWorkerResultV3>>();
    const runtime = await createFloodgateBoundedStableWasmRuntimeV3CoreForTests(
      {
        assetAuthorityReceiptSha256: "b".repeat(64),
        workers: 2,
        queueBound: 4,
        workerFactory: factoryFromScripts(
          [
            () => delayed.promise,
            async () => proposal(),
            async () => proposal(),
          ],
          events,
        ),
      },
    );
    const receiptDigest = getFloodgateBoundedStableWasmRuntimeReceiptDigestV3(
      runtime.receipt,
    );
    const omittedParent = parent("omitted");
    const completedParent = parent("completed");
    const omittedPromise = runtime.propose(omittedParent);
    const completedPromise = runtime.propose(completedParent);

    const completed = await completedPromise;
    expect(completed.outcome).toBe("proposal");
    expect(
      validateFloodgateBoundedStableWasmOutcomeV3(
        completed,
        completedParent,
        receiptDigest,
      ),
    ).toBe("7g7f");
    expect(events).not.toContain("close:1:true");

    delayed.resolve(
      Object.freeze({
        outcome: "omitted",
        reason: "cooperative-deadline",
        completed_depth: 9,
      }),
    );
    const omitted = await omittedPromise;
    expect(omitted).toEqual(
      expect.objectContaining({
        schema: FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
        outcome: "omitted",
        row: null,
        omission: {
          reason: "cooperative-deadline",
          search_budget_ms: 20_000,
          completed_depth: 9,
          partial_result_adopted: false,
          worker_reaped: true,
          worker_replaced: true,
        },
      }),
    );
    expect(
      validateFloodgateBoundedStableWasmOutcomeV3(
        omitted,
        omittedParent,
        receiptDigest,
      ),
    ).toBeUndefined();
    expect(events).toContain("close:0:true");
    expect(events).toContain("create:2");
    expect(events.indexOf("create:2")).toBeGreaterThan(
      events.indexOf("close:0:true"),
    );
    expect(runtime.getWorkerStartupTelemetry()).toHaveLength(3);
    expect(runtime.getWorkerStartupTelemetry().at(-1)).toMatchObject({
      worker_pid: 3,
      source_transfer_completed_before_init: true,
    });
    await runtime.close();
  });

  it("rejects a corrupt worker job while a sibling lane completes and the failed lane is replaced", async () => {
    const events: string[] = [];
    const corrupt =
      deferred<Readonly<FloodgateBoundedStableWasmWorkerResultV3>>();
    const runtime = await createFloodgateBoundedStableWasmRuntimeV3CoreForTests(
      {
        assetAuthorityReceiptSha256: "c".repeat(64),
        workers: 2,
        queueBound: 4,
        workerFactory: factoryFromScripts(
          [
            () => corrupt.promise,
            async () => proposal(),
            async () => proposal(),
          ],
          events,
        ),
      },
    );
    const receiptDigest = getFloodgateBoundedStableWasmRuntimeReceiptDigestV3(
      runtime.receipt,
    );
    const failedParent = parent("failed");
    const failedPromise = runtime.propose(failedParent);
    const siblingParent = parent("sibling");
    const sibling = await runtime.propose(siblingParent);
    expect(
      validateFloodgateBoundedStableWasmOutcomeV3(
        sibling,
        siblingParent,
        receiptDigest,
      ),
    ).toBe("7g7f");
    corrupt.resolve(
      Object.freeze({
        outcome: "proposal" as const,
        index: 0,
        packed_move: 0,
        raw_search_score: 0,
        completed_depth: 11,
        nodes: 1,
        leaves: 1,
      }),
    );
    await expect(failedPromise).rejects.toThrow(
      "bounded stable packed move is invalid",
    );

    const nextParent = parent("next");
    const next = await runtime.propose(nextParent);
    expect(
      validateFloodgateBoundedStableWasmOutcomeV3(
        next,
        nextParent,
        receiptDigest,
      ),
    ).toBe("7g7f");
    expect(events).toEqual(
      expect.arrayContaining([
        "search:0",
        "search:1",
        "close:0:true",
        "create:2",
        "search:2",
      ]),
    );
    await runtime.close();
  });

  it("rejects a forged omission that adopts or adds partial search data", async () => {
    const events: string[] = [];
    const runtime = await createFloodgateBoundedStableWasmRuntimeV3CoreForTests(
      {
        assetAuthorityReceiptSha256: "d".repeat(64),
        workers: 1,
        queueBound: 2,
        workerFactory: factoryFromScripts(
          [
            async () =>
              Object.freeze({
                outcome: "omitted" as const,
                reason: "cooperative-deadline" as const,
                completed_depth: 8,
              }),
            async () => proposal(),
          ],
          events,
        ),
      },
    );
    const valueParent = parent("forgery");
    const outcome = await runtime.propose(valueParent);
    const forged = {
      ...outcome,
      omission: {
        ...outcome.omission,
        partial_result_adopted: true,
        stable_move: "7g7f",
      },
    };
    expect(() =>
      validateFloodgateBoundedStableWasmOutcomeV3(
        forged,
        valueParent,
        getFloodgateBoundedStableWasmRuntimeReceiptDigestV3(runtime.receipt),
      ),
    ).toThrow();
    await runtime.close();
  });
});
