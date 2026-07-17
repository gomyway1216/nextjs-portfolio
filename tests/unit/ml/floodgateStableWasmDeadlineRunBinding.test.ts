import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY,
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA,
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
  FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
  type FloodgateStableWasmDeadlineDiagnosticAggregate,
} from "../../../ml/floodgate-stable-wasm-deadline-diagnostic";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT,
  FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY,
  aggregateFloodgateStableWasmDeadlinePublicCalibrationCoreForTests,
  runFloodgateStableWasmDeadlinePublicCalibration,
  runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests,
  type FloodgateStableWasmDeadlinePublicCalibrationAssets,
} from "../../../ml/floodgate-stable-wasm-deadline-public-calibration";
import {
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT,
  FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS,
  captureFloodgateStableWasmDeadlineDiagnosticAggregateCoreForTests,
  runFloodgateStableWasmDeadlineRunBindingCoreForTests,
  type FloodgateStableWasmDeadlineRunBindingDependenciesForTests,
} from "../../../ml/floodgate-stable-wasm-deadline-run-binding";
import { FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT } from "../../../ml/floodgate-stable-wasm-deadline-diagnostic-source-provenance";
import { FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT } from "../../../ml/floodgate-v7-production-application-source-provenance";
import type {
  FloodgateStableWasmDeadlineAuthenticatedRows,
  FloodgateStableWasmDeadlineConsumerPostflightCapability,
} from "../../../ml/floodgate-stable-wasm-deadline-read-only-consumer";
import type { FloodgateStableWasmDeadlineReadOnlyConsumerOptions } from "../../../ml/floodgate-stable-wasm-deadline-read-only-registry";

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = process.cwd();
const CALIBRATION_WORKER_SCHEMA =
  "shogi-floodgate-stable-wasm-deadline-public-calibration-worker-v1";
const MATE_SFEN = "4k4/9/5G3/9/4+R4/9/9/9/4K4 b 3P 1";
const ROLE_FILES = [
  "fresh-final-holdout.protected-position-ids.txt",
  "fresh-final-holdout.raw.jsonl",
  "fresh-selection.protected-position-ids.txt",
  "fresh-selection.raw.jsonl",
  "manifest.json",
  "replay-excluded-position-ids.txt",
  "replay-exclusion-receipt.json",
  "training.protected-position-ids.txt",
  "training.raw.jsonl",
] as const;
const DIAGNOSTIC_PHASES = [
  "requested-depth-complete",
  "winning-mate-early",
  "cooperative-deadline-after-completed-depth-0",
  "cooperative-deadline-after-completed-depth-1",
  "cooperative-deadline-after-completed-depth-2",
  "cooperative-deadline-after-completed-depth-3",
  "cooperative-deadline-after-completed-depth-4",
  "cooperative-deadline-after-completed-depth-5",
  "cooperative-deadline-after-completed-depth-6",
  "cooperative-deadline-after-completed-depth-7",
  "cooperative-deadline-after-completed-depth-8",
  "cooperative-deadline-after-completed-depth-9",
  "cooperative-deadline-after-completed-depth-10",
  "outer-watchdog",
  "failure",
] as const;
const COUNTER_BUCKETS = [
  "0",
  "1-1023",
  "1024-32767",
  "32768-1048575",
  "1048576-33554431",
  "33554432-2147483647",
] as const;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function calibrationAssets(
  workerSourceBytes: Uint8Array = readFileSync(
    join(
      REPOSITORY_ROOT,
      "ml",
      "floodgate-stable-wasm-deadline-public-calibration-worker.mjs",
    ),
  ),
): FloodgateStableWasmDeadlinePublicCalibrationAssets {
  return {
    wasmBytes: readFileSync(
      join(
        REPOSITORY_ROOT,
        "src",
        "components",
        "game",
        "ShogiImproved",
        "wasm",
        "shogi.wasm",
      ),
    ),
    weightsBytes: readFileSync(
      join(REPOSITORY_ROOT, "public", "shogi-nnue-weights.bin"),
    ),
    workerSourceBytes,
  };
}

function syntheticCalibrationWorker(mode: string): Buffer {
  const valid = JSON.stringify({
    callback_overhead_ratio_ppm: 1_010_000,
    exact_parity_count: 5,
    schema: CALIBRATION_WORKER_SCHEMA,
    type: "calibration",
  });
  const sourceByMode: Readonly<Record<string, string>> = {
    instant: `process.stdin.resume();process.stdout.write(${JSON.stringify(
      `${valid}\n`,
    )});`,
    "delayed-close": `process.stdin.resume();process.stdout.write(${JSON.stringify(
      `${valid}\n`,
    )});setTimeout(()=>process.exit(0),120);`,
    hang: "setInterval(()=>{},1000);",
    stderr: `process.stderr.write("PRIVATE_CANARY");setInterval(()=>{},1000);`,
    noncanonical: `process.stdout.write(${JSON.stringify(
      `${JSON.stringify({
        schema: CALIBRATION_WORKER_SCHEMA,
        type: "calibration",
        exact_parity_count: 5,
        callback_overhead_ratio_ppm: 1_010_000,
      })}\n`,
    )});`,
    oversize: `process.stdout.write("x".repeat(300)+"\\n");`,
    zero: `process.stdout.write(${JSON.stringify(
      `${JSON.stringify({
        callback_overhead_ratio_ppm: 0,
        exact_parity_count: 5,
        schema: CALIBRATION_WORKER_SCHEMA,
        type: "calibration",
      })}\n`,
    )});`,
    parity: `process.stdout.write(${JSON.stringify(
      `${JSON.stringify({
        callback_overhead_ratio_ppm: 1_010_000,
        exact_parity_count: 4,
        schema: CALIBRATION_WORKER_SCHEMA,
        type: "calibration",
      })}\n`,
    )});`,
  };
  const source = sourceByMode[mode];
  if (source === undefined) throw new Error(`unknown synthetic mode ${mode}`);
  return Buffer.from(source, "utf8");
}

function fakeDiagnosticAggregate(): FloodgateStableWasmDeadlineDiagnosticAggregate {
  return {
    schema: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SCHEMA,
    status: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_STATUS,
    claim_boundary: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_CLAIM_BOUNDARY,
    requests: 12,
    configured_maximum_parallel_children: 6,
    observed_peak_parallel_children: 6,
    cooperative_deadline_ms:
      FLOODGATE_STABLE_WASM_DIAGNOSTIC_COOPERATIVE_DEADLINE_MS,
    outer_watchdog_ms: FLOODGATE_STABLE_WASM_DIAGNOSTIC_OUTER_WATCHDOG_MS,
    outcome_counts: {
      complete: 9,
      deadline: 2,
      watchdog: 1,
      failure: 0,
    },
    phase_histogram: DIAGNOSTIC_PHASES.map((phase) => ({
      phase,
      count:
        phase === "requested-depth-complete"
          ? 9
          : phase === "cooperative-deadline-after-completed-depth-7"
            ? 2
            : phase === "outer-watchdog"
              ? 1
              : 0,
    })),
    completed_depth_histogram: Array.from({ length: 12 }, (_, depth) => ({
      depth,
      count: depth === 7 ? 2 : depth === 11 ? 9 : 0,
    })),
    nodes_bucket_histogram: COUNTER_BUCKETS.map((bucket) => ({
      bucket,
      count: bucket === "32768-1048575" ? 11 : 0,
    })),
    leaves_bucket_histogram: COUNTER_BUCKETS.map((bucket) => ({
      bucket,
      count: bucket === "1048576-33554431" ? 11 : 0,
    })),
    individual_lane_records_returned: 0,
    partial_iteration_results_adopted: 0,
    all_children_reaped: true,
  };
}

function authenticatedRows(): Readonly<FloodgateStableWasmDeadlineAuthenticatedRows> {
  return {
    schema: "shogi-floodgate-training-row-consumer-v1",
    role: "training",
    binding: {},
    rows: Array.from({ length: 14 }, (_, index) => ({
      schema_version: 1 as const,
      game_id: `secret-game-${index}`,
      parent_id: `secret-parent-${index}`,
      position_id: `secret-position-${index}`,
      parent_sfen: MATE_SFEN,
      ply: index,
      played_move: "4c5b",
    })),
  } as unknown as Readonly<FloodgateStableWasmDeadlineAuthenticatedRows>;
}

interface BindingFixture {
  readonly cleanup: () => Promise<void>;
  readonly dependencies: FloodgateStableWasmDeadlineRunBindingDependenciesForTests;
  readonly events: string[];
  readonly roleRoot: string;
}

async function bindingFixture(
  overrides: Partial<FloodgateStableWasmDeadlineRunBindingDependenciesForTests> = {},
): Promise<BindingFixture> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "stable-deadline-binding-")),
  );
  const home = join(root, "home");
  const repositoryRoot = join(root, "repository");
  const verifierRepositoryRoot = join(root, "verifier-repository");
  const roleRoot = join(root, "role");
  const registryRoot = join(
    home,
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-floodgate-v7-production-connector-v1",
  );
  const controlRoot = join(
    home,
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-floodgate-v7-control-plane-v1",
  );
  const assetRoot = join(
    home,
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-production-teacher-assets-v1",
    "stable",
  );
  await Promise.all([
    mkdir(repositoryRoot, { recursive: true }),
    mkdir(verifierRepositoryRoot, { recursive: true }),
    mkdir(roleRoot, { recursive: true }),
    mkdir(registryRoot, { recursive: true }),
    mkdir(controlRoot, { recursive: true }),
    mkdir(assetRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(registryRoot, "registry.json"), "fixed-registry\n"),
    writeFile(
      join(controlRoot, "approved-key-instance.json"),
      "fixed-approved-record\n",
    ),
    writeFile(join(assetRoot, "shogi.wasm"), "fixed-wasm\n"),
    writeFile(join(assetRoot, "shogi-nnue-weights.bin"), "fixed-weights\n"),
    ...ROLE_FILES.map((filename) =>
      writeFile(join(roleRoot, filename), `fixed-${filename}\n`),
    ),
  ]);

  const events: string[] = [];
  const capability = {};
  const availableCapabilities = new WeakSet<object>([capability]);
  const input = authenticatedRows();
  const availableInputs = new WeakSet<object>([input]);
  const receipt =
    {} as Readonly<FloodgateStableWasmDeadlineConsumerPostflightCapability>;
  const availableReceipts = new WeakSet<object>([receipt]);
  const consumer: FloodgateStableWasmDeadlineReadOnlyConsumerOptions = {
    legacyProtectedPositionIdsPath: join(root, "legacy.txt"),
    outputRoot: roleRoot,
    rawLockRoot: join(root, "raw-lock"),
    repositoryRoot: verifierRepositoryRoot,
    roleLockRoot: join(root, "role-lock"),
    verifierRevision: "a".repeat(40),
  };
  let callbackActive = false;

  const dependencies: FloodgateStableWasmDeadlineRunBindingDependenciesForTests =
    {
      effectiveUserId:
        typeof process.getuid === "function" ? process.getuid() : 501,
      homeDirectory: home,
      repositoryRoot,
      expectedDiagnosticSourceBinding: {
        layout: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
        revision: "c".repeat(40),
      },
      loadRegistry: async () => {
        events.push("registry-load");
        return capability;
      },
      claimRegistry: (claimed) => {
        events.push("registry-claim");
        if (!availableCapabilities.delete(claimed)) {
          throw new Error("registry claim repeated");
        }
        return {
          applicationSourceBinding: {
            layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
            revision: "b".repeat(40),
          },
          consumer,
        };
      },
      captureDiagnosticSource: async () => {
        events.push("diagnostic-source");
        return {
          layout: FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_SOURCE_LAYOUT,
          revision: "c".repeat(40),
        };
      },
      captureRegistryApplicationSource: async () => {
        events.push("registry-source");
        return {
          layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
          revision: "b".repeat(40),
        };
      },
      shouldStop: () => false,
      withAssets: async (callback) => {
        events.push("asset-enter");
        try {
          return await callback({
            bytes: {
              wasm: new Uint8Array([1, 2, 3]),
              weights: new Uint8Array([4, 5, 6]),
            },
          });
        } finally {
          events.push("asset-cleanup");
        }
      },
      calibrate: async () => {
        events.push("calibration");
        return {
          callback_overhead_ratio_ppm: 1_010_000,
          exact_parity_count: 5,
        };
      },
      consumeRows: async (_options, callback) => {
        events.push("consumer-open");
        callbackActive = true;
        const callbackPromise = callback(input);
        expect(events.at(-1)).toBe("diagnostic");
        callbackActive = false;
        await callbackPromise;
        events.push("consumer-postflight");
        return receipt;
      },
      claimRows: (claimed) => {
        events.push("input-claim");
        expect(callbackActive).toBe(true);
        if (!availableInputs.delete(claimed)) {
          throw new Error("input claim repeated");
        }
      },
      claimPostflight: (claimed) => {
        events.push("postflight-claim");
        if (!availableReceipts.delete(claimed)) {
          throw new Error("postflight claim repeated");
        }
      },
      diagnose: async (inputs) => {
        events.push("diagnostic");
        expect(inputs).toHaveLength(12);
        expect(inputs.map((entry) => entry.rootTesu)).toEqual([
          2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
        ]);
        for (const diagnosticInput of inputs) {
          expect(Object.keys(diagnosticInput).sort()).toEqual([
            "board",
            "hands",
            "rootTesu",
            "sideToMove",
          ]);
        }
        return fakeDiagnosticAggregate();
      },
      readTrackedWorkers: async () => ({
        calibration: Buffer.from("synthetic-calibration-worker"),
        diagnostic: Buffer.from("synthetic-diagnostic-worker"),
      }),
      ...overrides,
    };

  return {
    cleanup: () => rm(root, { recursive: true, force: true }),
    dependencies,
    events,
    roleRoot,
  };
}

describe("stable-WASM PUBLIC deadline calibration", () => {
  it("runs the pinned public sentinel with exact five-field parity and no raw timing", async () => {
    const result =
      await runFloodgateStableWasmDeadlinePublicCalibration(
        calibrationAssets(),
      );

    expect(result.exact_parity_count).toBe(
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_SAMPLE_COUNT,
    );
    expect(result.callback_overhead_ratio_ppm).toBeGreaterThan(0);
    expect(Object.keys(result).sort()).toEqual([
      "callback_overhead_ratio_ppm",
      "exact_parity_count",
    ]);
  }, 60_000);

  it("reaps an instant child even when it exits as soon as source fd 3 loads", async () => {
    const source = syntheticCalibrationWorker("instant");
    await expect(
      runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests(
        calibrationAssets(source),
        { bytes: source.byteLength, sha256: sha256(source) },
        { watchdogMilliseconds: 2_000 },
      ),
    ).resolves.toEqual({
      callback_overhead_ratio_ppm: 1_010_000,
      exact_parity_count: 5,
    });
  });

  it("settles a successful calibration only after the child close/reap event", async () => {
    const source = syntheticCalibrationWorker("delayed-close");
    const started = Date.now();
    await expect(
      runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests(
        calibrationAssets(source),
        { bytes: source.byteLength, sha256: sha256(source) },
        { watchdogMilliseconds: 2_000 },
      ),
    ).resolves.toEqual({
      callback_overhead_ratio_ppm: 1_010_000,
      exact_parity_count: 5,
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(80);
  });

  it.each(["hang", "stderr", "noncanonical", "oversize", "zero", "parity"])(
    "fails closed and settles only after the %s child closes",
    async (mode) => {
      const source = syntheticCalibrationWorker(mode);
      await expect(
        runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests(
          calibrationAssets(source),
          { bytes: source.byteLength, sha256: sha256(source) },
          { watchdogMilliseconds: 100 },
        ),
      ).rejects.toThrow();
    },
  );

  it("rejects the wrong worker and either wrong runtime asset before launch", () => {
    const source = syntheticCalibrationWorker("instant");
    const validAssets = calibrationAssets(source);
    const changedWasm = Uint8Array.from(validAssets.wasmBytes);
    changedWasm[0] ^= 1;
    const wrongWasm = { ...validAssets, wasmBytes: changedWasm };
    const changedWeights = Uint8Array.from(validAssets.weightsBytes);
    changedWeights[0] ^= 1;
    const wrongWeights = { ...validAssets, weightsBytes: changedWeights };

    expect(() =>
      runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests(
        calibrationAssets(source),
        { bytes: source.byteLength, sha256: "0".repeat(64) },
      ),
    ).toThrow("calibration worker does not match");
    expect(() =>
      runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests(
        wrongWasm,
        { bytes: source.byteLength, sha256: sha256(source) },
      ),
    ).toThrow("calibration WASM does not match");
    expect(() =>
      runFloodgateStableWasmDeadlinePublicCalibrationWithSourceCoreForTests(
        wrongWeights,
        { bytes: source.byteLength, sha256: sha256(source) },
      ),
    ).toThrow("calibration weights does not match");
  });

  it("fails closed on zero, nonfinite, parity-short, and unstable samples", () => {
    const stable = [10, 10, 10, 10, 10];
    expect(() =>
      aggregateFloodgateStableWasmDeadlinePublicCalibrationCoreForTests(
        [0, 10, 10, 10, 10],
        stable,
        5,
      ),
    ).toThrow("invalid");
    expect(() =>
      aggregateFloodgateStableWasmDeadlinePublicCalibrationCoreForTests(
        [Number.NaN, 10, 10, 10, 10],
        stable,
        5,
      ),
    ).toThrow("invalid");
    expect(() =>
      aggregateFloodgateStableWasmDeadlinePublicCalibrationCoreForTests(
        stable,
        stable,
        4,
      ),
    ).toThrow("invalid");
    expect(() =>
      aggregateFloodgateStableWasmDeadlinePublicCalibrationCoreForTests(
        stable,
        [100, 10, 10, 10, 10],
        5,
      ),
    ).toThrow("unstable");
  });

  it("keeps the final tracked worker identity exact", () => {
    const worker = readFileSync(
      join(
        REPOSITORY_ROOT,
        "ml",
        "floodgate-stable-wasm-deadline-public-calibration-worker.mjs",
      ),
    );
    expect(worker.byteLength).toBe(
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY.bytes,
    );
    expect(sha256(worker)).toBe(
      FLOODGATE_STABLE_WASM_DEADLINE_PUBLIC_CALIBRATION_WORKER_IDENTITY.sha256,
    );
  });
});

describe("stable-WASM deadline production run binding", () => {
  it("calibrates before any private claim, synchronously claims exact rows, and emits aggregates only", async () => {
    const fixture = await bindingFixture();
    try {
      const result = await runFloodgateStableWasmDeadlineRunBindingCoreForTests(
        fixture.dependencies,
      );

      expect(fixture.events).toEqual([
        "registry-load",
        "asset-enter",
        "calibration",
        "registry-claim",
        "registry-source",
        "consumer-open",
        "input-claim",
        "diagnostic",
        "consumer-postflight",
        "postflight-claim",
        "asset-cleanup",
        "registry-source",
        "diagnostic-source",
      ]);
      expect(result).toMatchObject({
        schema: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCHEMA,
        status: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_STATUS,
        lifecycle: {
          all_spawned_children_reaped: true,
          authenticated_callbacks: 1,
          calibration_child_reaped: 1,
          diagnostic_lanes_settled: 12,
          exact_input_claims: 1,
          postflight_claims: 1,
          registry_claims: 1,
        },
        persistent_state: {
          all_unchanged: true,
          scope_count: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT,
          unchanged_count:
            FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_SCOPE_COUNT,
        },
        source_closure: {
          diagnostic_before_after_exact_clean: true,
          registry_application_binding_before_after_exact: true,
        },
      });
      const serialized = JSON.stringify(result).toLowerCase();
      for (const forbidden of [
        "secret-",
        "sfen",
        "game_id",
        "parent_id",
        "position_id",
        "played_move",
        "raw_search_score",
        "packed_move",
        "stderr",
        "path",
        "sha256",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not claim the connector or open authenticated rows when PUBLIC calibration fails", async () => {
    const events: string[] = [];
    const fixture = await bindingFixture({
      calibrate: async () => {
        events.push("calibration-failed");
        throw new Error("PRIVATE_DETAILS_MUST_NOT_ESCAPE");
      },
      claimRegistry: () => {
        events.push("forbidden-registry-claim");
        throw new Error("must not run");
      },
      consumeRows: async () => {
        events.push("forbidden-consumer");
        throw new Error("must not run");
      },
    });
    try {
      await expect(
        runFloodgateStableWasmDeadlineRunBindingCoreForTests(
          fixture.dependencies,
        ),
      ).rejects.toMatchObject({ phase: "public-calibration" });
      expect(events).toEqual(["calibration-failed"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("fails after cleanup if any one of the fixed 13 persistent files changes", async () => {
    const fixture = await bindingFixture();
    const originalDiagnose = fixture.dependencies.diagnose;
    const dependencies = {
      ...fixture.dependencies,
      diagnose: async (...parameters: Parameters<typeof originalDiagnose>) => {
        const aggregate = await originalDiagnose(...parameters);
        await writeFile(
          join(fixture.roleRoot, "training.raw.jsonl"),
          "changed-during-diagnostic\n",
        );
        return aggregate;
      },
    };
    try {
      await expect(
        runFloodgateStableWasmDeadlineRunBindingCoreForTests(dependencies),
      ).rejects.toMatchObject({ phase: "persistent-after" });
      expect(fixture.events.at(-1)).toBe("asset-cleanup");
    } finally {
      await fixture.cleanup();
    }
  });

  it.each([
    {
      label: "top-level extra key",
      aggregate: () => ({
        ...fakeDiagnosticAggregate(),
        PRIVATE_CANARY_EXTRA: "secret-position-must-not-escape",
      }),
    },
    {
      label: "nested extra key",
      aggregate: () => ({
        ...fakeDiagnosticAggregate(),
        outcome_counts: {
          ...fakeDiagnosticAggregate().outcome_counts,
          PRIVATE_CANARY_NESTED: "secret-game-must-not-escape",
        },
      }),
    },
    {
      label: "unreaped aggregate header",
      aggregate: () => ({
        ...fakeDiagnosticAggregate(),
        all_children_reaped: false,
      }),
    },
  ])(
    "rejects a malicious diagnostic aggregate: $label",
    async ({ aggregate }) => {
      const fixture = await bindingFixture();
      const dependencies = {
        ...fixture.dependencies,
        diagnose: async () => {
          fixture.events.push("diagnostic");
          return aggregate() as unknown as FloodgateStableWasmDeadlineDiagnosticAggregate;
        },
      };
      try {
        let captured: unknown;
        try {
          await runFloodgateStableWasmDeadlineRunBindingCoreForTests(
            dependencies,
          );
        } catch (error) {
          captured = error;
        }
        expect(captured).toMatchObject({ phase: "private-diagnostic" });
        expect(JSON.stringify(captured)).not.toMatch(
          /PRIVATE_CANARY|secret-(?:game|position)/u,
        );
      } finally {
        await fixture.cleanup();
      }
    },
  );

  it("rejects a Proxy aggregate before any trap can disclose a value", () => {
    let trapCalls = 0;
    const proxy = new Proxy(fakeDiagnosticAggregate(), {
      get() {
        trapCalls += 1;
        throw new Error("PRIVATE_CANARY_PROXY_GETTER");
      },
      getOwnPropertyDescriptor() {
        trapCalls += 1;
        throw new Error("PRIVATE_CANARY_PROXY_DESCRIPTOR");
      },
      getPrototypeOf() {
        trapCalls += 1;
        throw new Error("PRIVATE_CANARY_PROXY_PROTOTYPE");
      },
      ownKeys() {
        trapCalls += 1;
        throw new Error("PRIVATE_CANARY_PROXY_KEYS");
      },
    });
    expect(() =>
      captureFloodgateStableWasmDeadlineDiagnosticAggregateCoreForTests(proxy),
    ).toThrow();
    expect(trapCalls).toBe(0);
  });

  it("rejects an aggregate accessor without invoking its getter", async () => {
    let getterCalls = 0;
    const aggregate = fakeDiagnosticAggregate();
    const descriptors = Object.getOwnPropertyDescriptors(aggregate);
    Object.defineProperty(descriptors, "outcome_counts", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: {
        configurable: true,
        enumerable: true,
        get() {
          getterCalls += 1;
          throw new Error("PRIVATE_CANARY_ACCESSOR");
        },
      },
    });
    const accessorAggregate = Object.defineProperties({}, descriptors);
    const fixture = await bindingFixture();
    const dependencies = {
      ...fixture.dependencies,
      diagnose: async () => {
        fixture.events.push("diagnostic");
        return accessorAggregate as FloodgateStableWasmDeadlineDiagnosticAggregate;
      },
    };
    try {
      await expect(
        runFloodgateStableWasmDeadlineRunBindingCoreForTests(dependencies),
      ).rejects.toMatchObject({ phase: "private-diagnostic" });
      expect(getterCalls).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints one canonical sanitized failure line and no stderr", async () => {
    const cli = join(
      REPOSITORY_ROOT,
      "ml",
      "run-floodgate-stable-wasm-deadline-diagnostic.ts",
    );
    let stdout = "";
    let stderr = "";
    try {
      await execFile(
        process.execPath,
        ["-r", "tsx/cjs", cli, "unexpected-argument"],
        {
          cwd: REPOSITORY_ROOT,
          env: { ...process.env, NODE_ENV: "test" },
          maxBuffer: 1024,
        },
      );
      throw new Error("CLI unexpectedly succeeded");
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string };
      stdout = failure.stdout ?? "";
      stderr = failure.stderr ?? "";
    }

    expect(stderr).toBe("");
    expect(stdout.split("\n")).toEqual([
      JSON.stringify({
        phase: "invocation",
        schema: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_SCHEMA,
        status: FLOODGATE_STABLE_WASM_DEADLINE_RUN_BINDING_FAILURE_STATUS,
      }),
      "",
    ]);
    expect(stdout).not.toContain("unexpected-argument");
  });

  it("contains no writer, root-key read, directory enumeration, retry, resume, or live mutation path", () => {
    const source = [
      "ml/floodgate-stable-wasm-deadline-run-binding.ts",
      "ml/floodgate-stable-wasm-deadline-public-calibration.ts",
      "ml/floodgate-stable-wasm-deadline-public-calibration-worker.mjs",
      "ml/run-floodgate-stable-wasm-deadline-diagnostic.ts",
    ]
      .map((relativePath) =>
        readFileSync(join(REPOSITORY_ROOT, relativePath), "utf8"),
      )
      .join("\n");
    expect(source).not.toMatch(
      /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|readdir|readdirSync|opendir|opendirSync)\b/u,
    );
    expect(source).not.toContain("deployment-root-key");
    expect(source).not.toContain("root-key.json");
    expect(source).not.toContain("checkpoint");
    expect(source).not.toContain("quarantine");
    expect(source).not.toContain("lease");
    expect(source).not.toContain("retry(");
    expect(source).not.toContain("resume(");
  });
});
