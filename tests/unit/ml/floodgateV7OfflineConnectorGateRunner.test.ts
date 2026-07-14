import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import * as approvedEnrollmentModule from "../../../ml/floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_EXECUTION_BOUNDARY,
  FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_SCHEMA,
  FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS,
  FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_TRUST_BOUNDARY,
  runFloodgateV7OfflineConnectorGateContractComposition,
} from "../../../ml/floodgate-v7-offline-connector-gate-runner";
import * as connectorModule from "../../../ml/floodgate-v7-production-checkpoint-connector";

const REPOSITORY_ROOT = process.cwd();
const RUNNER_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-offline-connector-gate-runner.ts",
);
const CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/run-floodgate-v7-offline-connector-gates.ts",
);
const PACKAGE_JSON_PATH = path.join(REPOSITORY_ROOT, "package.json");
const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 offline connector gate contract composition failed without evidence\n";
const requireFromHere = createRequire(import.meta.url);
const NativePromise = Promise;
const nativePromiseThen = Promise.prototype.then;
const nativeReflectApply = Reflect.apply;

function runCli(...arguments_: readonly string[]) {
  return spawnSync(
    process.execPath,
    ["-r", "tsx/cjs", CLI_SOURCE_PATH, ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
}

function assertDeepFrozenRecordGraph(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  if (Array.isArray(value)) {
    expect(Object.getPrototypeOf(value)).toBe(Array.prototype);
  } else {
    expect(Object.getPrototypeOf(value)).toBeNull();
  }
  for (const child of Object.values(value)) {
    assertDeepFrozenRecordGraph(child);
  }
}

function assertNoExecutableOrBinary(value: unknown): void {
  if (value === null || typeof value !== "object") {
    expect(typeof value).not.toBe("function");
    return;
  }
  expect(Buffer.isBuffer(value)).toBe(false);
  for (const child of Object.values(value)) {
    assertNoExecutableOrBinary(child);
  }
}

describe("Floodgate v7 offline connector gate runner", () => {
  it("runs the exact 100, 500, and 24000 contract sequence with closed synthetic lifecycles", async () => {
    expect(runFloodgateV7OfflineConnectorGateContractComposition.length).toBe(
      0,
    );
    const receipt =
      await runFloodgateV7OfflineConnectorGateContractComposition();

    expect(Reflect.ownKeys(receipt)).toEqual([
      "schema",
      "status",
      "claim_boundary",
      "trust_boundary",
      "execution_boundary",
      "connector",
      "synthetic_fixture",
      "gates",
      "cross_gate",
      "operation_counts",
      "nonclaims",
    ]);
    expect(receipt).toMatchObject({
      schema: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_SCHEMA,
      status: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS,
      claim_boundary: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_CLAIM_BOUNDARY,
      trust_boundary: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_TRUST_BOUNDARY,
      execution_boundary:
        FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_EXECUTION_BOUNDARY,
      connector: {
        contract:
          connectorModule.FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
        execution_boundary: "test-only-injected-capability-composition",
        production_origins: {
          approved_enrollment: false,
          coordinator: false,
          stage: false,
          key: false,
          input: false,
          checkpoint: false,
        },
      },
      cross_gate: {
        gate_order_exact: true,
        run_id_metadata_equal: true,
        run_binding_metadata_equal: true,
        input_binding_metadata_equal: true,
        synthetic_key_instance_metadata_equal: true,
        cleanup_completed_before_next_gate: true,
        fresh_enrollment_capability_per_gate: true,
        durable_work_file_shared: false,
        filesystem_continuity_observed: false,
        actual_resume_observed: false,
      },
    });
    expect(Reflect.ownKeys(receipt.connector)).toEqual([
      "contract",
      "execution_boundary",
      "production_origins",
    ]);
    expect(Reflect.ownKeys(receipt.connector.production_origins)).toEqual([
      "approved_enrollment",
      "coordinator",
      "stage",
      "key",
      "input",
      "checkpoint",
    ]);
    expect(Reflect.ownKeys(receipt.cross_gate)).toEqual([
      "gate_order_exact",
      "run_id_metadata_equal",
      "run_binding_metadata_equal",
      "input_binding_metadata_equal",
      "synthetic_key_instance_metadata_equal",
      "cleanup_completed_before_next_gate",
      "fresh_enrollment_capability_per_gate",
      "durable_work_file_shared",
      "filesystem_continuity_observed",
      "actual_resume_observed",
    ]);
    expect(receipt.synthetic_fixture).toEqual({
      classification: "deterministic-test-only-fixture-not-production-evidence",
      dynamic_identifiers_are_synthetic: true,
      run_id: "12".repeat(32),
      key_id: "floodgate-v7-teacher-checkpoint-root-v1",
      key_instance_id: "34".repeat(32),
      approved_enrollment: {
        capability_origin: "test-only-synthetic-factory",
        execution_boundary:
          "test-only-injected-current-euid-home-control-plane-record",
        actual_control_plane_approval: false,
        actual_record_file_reads: 0,
      },
      input: {
        schema: "shogi-authenticated-floodgate-training-rows-v1",
        role: "training",
        verifier_revision: "7".repeat(40),
        raw_format: "shogi-floodgate-label-free-raw-parent-jsonl-v1",
        records: 24_000,
        games: 240,
        position_ids_count: 24_000,
      },
    });
    expect(receipt.gates.map(({ gate }) => gate)).toEqual([
      "durable-prefix-100",
      "durable-prefix-500",
      "sealed-final-24000",
    ]);
    expect(
      receipt.gates.map(({ order, checkpoint_receipt_fixture }) => ({
        order,
        ...checkpoint_receipt_fixture,
      })),
    ).toEqual([
      {
        order: 1,
        target_parents: 100,
        completed_parents: 100,
        resumed_parents: 0,
        records: 102,
        bytes: 1_791_893,
        sealed: false,
      },
      {
        order: 2,
        target_parents: 500,
        completed_parents: 500,
        resumed_parents: 100,
        records: 503,
        bytes: 8_948_379,
        sealed: false,
      },
      {
        order: 3,
        target_parents: 24_000,
        completed_parents: 24_000,
        resumed_parents: 500,
        records: 24_004,
        bytes: 429_247_143,
        sealed: true,
      },
    ]);
    for (const gate of receipt.gates) {
      expect(Reflect.ownKeys(gate)).toEqual([
        "order",
        "gate",
        "checkpoint_receipt_fixture",
        "connector_receipt",
        "synthetic_lifecycle_calls",
      ]);
      expect(Reflect.ownKeys(gate.checkpoint_receipt_fixture)).toEqual([
        "target_parents",
        "completed_parents",
        "resumed_parents",
        "records",
        "bytes",
        "sealed",
      ]);
      expect(Reflect.ownKeys(gate.connector_receipt)).toEqual([
        "bytes",
        "sha256",
      ]);
      expect(gate.synthetic_lifecycle_calls).toEqual({
        readiness: 1,
        create_coordinator: 1,
        authorize_stage: 1,
        claim_handoff: 1,
        prepare_key: 1,
        consume_rows: 1,
        checkpoint: 1,
        claim_postflight: 1,
        discard_key: 1,
        lease_close: 1,
        coordinator_close: 1,
        coordinator_abort: 0,
        failure_observer: 0,
      });
      expect(gate.connector_receipt.bytes).toBeGreaterThan(0);
      expect(gate.connector_receipt.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(receipt.operation_counts).toEqual({
      synthetic_enrollment_capabilities_created: 3,
      test_only_connector_compositions: {
        durable_prefix_100: 1,
        durable_prefix_500: 1,
        sealed_final_24000: 1,
      },
      production_enrollment_loads: 0,
      production_connector_invocations: {
        durable_prefix_100: 0,
        durable_prefix_500: 0,
        sealed_final_24000: 0,
      },
      actual_home_approved_record_opens: 0,
      deployment_key_file_opens: 0,
      deployment_key_bytes_read: 0,
      dataset_file_opens: 0,
      checkpoint_artifact_reads: 0,
      checkpoint_artifact_writes: 0,
      network_requests: 0,
      child_processes: 0,
      module_source_loading_excluded_from_application_data_io_counts: true,
    });
    expect(receipt.nonclaims).toEqual({
      production_approval: false,
      production_gate_authorization: false,
      production_checkpoint: false,
      actual_key_or_control_plane_record_access: false,
      filesystem_durability_or_resume: false,
      dataset_read: false,
      teacher_label: false,
      optimizer_training: false,
      weights_changed: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength_established: false,
      stable_high_dan_established: false,
    });
  });

  it("is deterministic, deeply frozen, null-prototype, and pathless without raw authority", async () => {
    const first = await runFloodgateV7OfflineConnectorGateContractComposition();
    const second =
      await runFloodgateV7OfflineConnectorGateContractComposition();
    const serialized = JSON.stringify(first);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(serialized);
    assertDeepFrozenRecordGraph(first);
    assertNoExecutableOrBinary(first);
    for (const forbidden of [
      '"run_binding"',
      '"input_binding"',
      '"authorization_mac"',
      '"key_material"',
      '"root_key_hash"',
      '"key_bytes_or_key_hash"',
      '"executable_capability"',
      '"parent_sfen"',
      '"played_move"',
      '"rows"',
      "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      "7g7f",
      "file://",
      "/offline-floodgate-v7-contract-fixture",
      "/private/",
      "/Users/",
      "/tmp/",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects extra arguments before starting a composition", async () => {
    await expect(
      Reflect.apply(
        runFloodgateV7OfflineConnectorGateContractComposition,
        undefined,
        ["unexpected"],
      ),
    ).rejects.toThrow();
  });

  it("uses a fresh enrollment capability per gate, awaits cleanup, and stops after a second-gate failure", async () => {
    const capabilities: unknown[] = [];
    const connectorCapabilities: unknown[] = [];
    const events: string[] = [];
    const lifecycleEvents: string[] = [];
    let failSecondGate = false;
    const createCapability = vi.fn(
      (
        ...arguments_: Parameters<
          typeof approvedEnrollmentModule.createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests
        >
      ) => {
        const capability =
          approvedEnrollmentModule.createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(
            ...arguments_,
          );
        capabilities.push(capability);
        events.push(`capability-${capabilities.length}`);
        return capability;
      },
    );
    const runConnector = vi.fn(
      async (
        ...arguments_: Parameters<
          typeof connectorModule.runFloodgateV7ProductionCheckpointConnectorCoreForTests
        >
      ) => {
        const [options, dependencies] = arguments_;
        connectorCapabilities.push(options.keyEnrollment);
        events.push(`start-${options.gate}`);
        const recordLifecycle = (event: string): void => {
          lifecycleEvents.push(`${options.gate}:${event}`);
        };
        const instrumentedDependencies = {
          ...dependencies,
          inspectKeyReadiness: () => {
            recordLifecycle("readiness");
            return dependencies.inspectKeyReadiness();
          },
          createCoordinator: () => {
            recordLifecycle("create-coordinator");
            return dependencies.createCoordinator();
          },
          claimCoordinatorHandoff: (
            ...handoffArguments: Parameters<
              typeof dependencies.claimCoordinatorHandoff
            >
          ) => {
            recordLifecycle("claim-handoff");
            const handoff = dependencies.claimCoordinatorHandoff(
              ...handoffArguments,
            );
            return Object.freeze({
              ...handoff,
              close: Object.freeze(() => {
                recordLifecycle("coordinator-close");
                return handoff.close();
              }),
              abortAndDrain: Object.freeze(() => {
                recordLifecycle("coordinator-abort");
                return handoff.abortAndDrain();
              }),
            });
          },
          authorizeStage: (
            ...stageArguments: Parameters<typeof dependencies.authorizeStage>
          ) => {
            recordLifecycle("authorize-stage");
            const source = dependencies.authorizeStage(...stageArguments);
            return new NativePromise((resolve, reject) => {
              nativeReflectApply(nativePromiseThen, source, [
                (lease: Awaited<typeof source>) =>
                  resolve(
                    Object.freeze({
                      ...lease,
                      close: Object.freeze(() => {
                        recordLifecycle("lease-close");
                        return lease.close();
                      }),
                    }),
                  ),
                reject,
              ]);
            });
          },
          prepareKey: (
            ...keyArguments: Parameters<typeof dependencies.prepareKey>
          ) => {
            recordLifecycle("prepare-key");
            return dependencies.prepareKey(...keyArguments);
          },
          discardKey: (
            ...keyArguments: Parameters<typeof dependencies.discardKey>
          ) => {
            recordLifecycle("discard-key");
            return dependencies.discardKey(...keyArguments);
          },
          consumeRowsAndPostflight: (
            ...consumerArguments: Parameters<
              typeof dependencies.consumeRowsAndPostflight
            >
          ) => {
            recordLifecycle("consume-rows");
            return dependencies.consumeRowsAndPostflight(...consumerArguments);
          },
          claimPostflight: (
            ...postflightArguments: Parameters<
              typeof dependencies.claimPostflight
            >
          ) => {
            recordLifecycle("claim-postflight");
            return dependencies.claimPostflight(...postflightArguments);
          },
          checkpoint: (
            ...checkpointArguments: Parameters<typeof dependencies.checkpoint>
          ) => {
            recordLifecycle("checkpoint");
            if (failSecondGate && options.gate === "durable-prefix-500") {
              events.push(`fail-${options.gate}`);
              return new NativePromise((_resolve, reject) =>
                reject(new Error("second-gate-test-canary")),
              );
            }
            return dependencies.checkpoint(...checkpointArguments);
          },
          observeFailureForTests: (
            ...observerArguments: Parameters<
              NonNullable<typeof dependencies.observeFailureForTests>
            >
          ) => {
            recordLifecycle("failure-observer");
            return dependencies.observeFailureForTests?.(...observerArguments);
          },
        } as typeof dependencies;
        const receipt =
          await connectorModule.runFloodgateV7ProductionCheckpointConnectorCoreForTests(
            options,
            instrumentedDependencies,
          );
        expect(receipt.lifecycle).toEqual({
          readiness_metadata_passed: true,
          authoritative_key_reopen_and_revalidation_succeeded: true,
          exact_input_claimed_synchronously: true,
          checkpoint_settled_before_postflight: true,
          postflight_claimed_once: true,
          key_cleanup_settled: true,
          lease_close_joined: true,
          coordinator_closed: true,
        });
        events.push(`closed-${options.gate}`);
        return receipt;
      },
    );

    vi.resetModules();
    vi.doMock("../../../ml/floodgate-v7-approved-key-enrollment", () => ({
      ...approvedEnrollmentModule,
      createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests:
        createCapability,
    }));
    vi.doMock(
      "../../../ml/floodgate-v7-production-checkpoint-connector",
      () => ({
        ...connectorModule,
        runFloodgateV7ProductionCheckpointConnectorCoreForTests: runConnector,
      }),
    );

    try {
      const isolated =
        await import("../../../ml/floodgate-v7-offline-connector-gate-runner");
      await expect(
        isolated.runFloodgateV7OfflineConnectorGateContractComposition(),
      ).resolves.toMatchObject({
        cross_gate: {
          cleanup_completed_before_next_gate: true,
          fresh_enrollment_capability_per_gate: true,
        },
      });
      expect(capabilities).toHaveLength(3);
      expect(new Set(capabilities).size).toBe(3);
      expect(connectorCapabilities).toEqual(capabilities);
      expect(events).toEqual([
        "capability-1",
        "start-durable-prefix-100",
        "closed-durable-prefix-100",
        "capability-2",
        "start-durable-prefix-500",
        "closed-durable-prefix-500",
        "capability-3",
        "start-sealed-final-24000",
        "closed-sealed-final-24000",
      ]);
      expect(lifecycleEvents).toEqual(
        [
          "durable-prefix-100",
          "durable-prefix-500",
          "sealed-final-24000",
        ].flatMap((gate) =>
          [
            "readiness",
            "create-coordinator",
            "authorize-stage",
            "claim-handoff",
            "prepare-key",
            "consume-rows",
            "checkpoint",
            "claim-postflight",
            "discard-key",
            "lease-close",
            "coordinator-close",
          ].map((event) => `${gate}:${event}`),
        ),
      );

      capabilities.length = 0;
      connectorCapabilities.length = 0;
      events.length = 0;
      lifecycleEvents.length = 0;
      createCapability.mockClear();
      runConnector.mockClear();
      failSecondGate = true;
      await expect(
        isolated.runFloodgateV7OfflineConnectorGateContractComposition(),
      ).rejects.toMatchObject({
        phase: "checkpoint",
        checkpoint_may_have_persisted: false,
        cleanup_failure_count: 0,
      });
      expect(createCapability).toHaveBeenCalledTimes(2);
      expect(runConnector).toHaveBeenCalledTimes(2);
      expect(connectorCapabilities).toEqual(capabilities);
      expect(events).toEqual([
        "capability-1",
        "start-durable-prefix-100",
        "closed-durable-prefix-100",
        "capability-2",
        "start-durable-prefix-500",
        "fail-durable-prefix-500",
      ]);
      expect(lifecycleEvents).toEqual([
        ...[
          "readiness",
          "create-coordinator",
          "authorize-stage",
          "claim-handoff",
          "prepare-key",
          "consume-rows",
          "checkpoint",
          "claim-postflight",
          "discard-key",
          "lease-close",
          "coordinator-close",
        ].map((event) => `durable-prefix-100:${event}`),
        ...[
          "readiness",
          "create-coordinator",
          "authorize-stage",
          "claim-handoff",
          "prepare-key",
          "consume-rows",
          "checkpoint",
          "discard-key",
          "lease-close",
          "coordinator-abort",
          "failure-observer",
        ].map((event) => `durable-prefix-500:${event}`),
      ]);
      for (const cleanup of [
        "discard-key",
        "lease-close",
        "coordinator-abort",
      ]) {
        expect(
          lifecycleEvents.filter(
            (event) => event === `durable-prefix-500:${cleanup}`,
          ),
        ).toHaveLength(1);
      }
      expect(lifecycleEvents).not.toContain(
        "durable-prefix-500:claim-postflight",
      );
      expect(
        lifecycleEvents.some((event) => event.startsWith("sealed-final")),
      ).toBe(false);
    } finally {
      vi.doUnmock("../../../ml/floodgate-v7-approved-key-enrollment");
      vi.doUnmock("../../../ml/floodgate-v7-production-checkpoint-connector");
      vi.resetModules();
    }
  });

  it("uses captured JSON, hash, Promise-static, and iterator intrinsics", async () => {
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    )!;
    const promiseDescriptors = new Map(
      ["resolve", "reject", "all", "allSettled"].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(Promise, key)!,
      ]),
    );
    const jsonDescriptors = new Map(
      ["parse", "stringify"].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(JSON, key)!,
      ]),
    );
    const cryptoModule = requireFromHere("node:crypto") as {
      createHash: typeof import("node:crypto").createHash;
    };
    const originalCreateHash = cryptoModule.createHash;
    let trapCalls = 0;
    const poison = (): never => {
      trapCalls += 1;
      throw new Error("a poisoned live intrinsic was invoked");
    };
    let restored = false;
    const restore = (): void => {
      if (restored) return;
      restored = true;
      Object.defineProperty(
        Array.prototype,
        Symbol.iterator,
        iteratorDescriptor,
      );
      for (const [key, descriptor] of promiseDescriptors) {
        Object.defineProperty(Promise, key, descriptor);
      }
      for (const [key, descriptor] of jsonDescriptors) {
        Object.defineProperty(JSON, key, descriptor);
      }
      cryptoModule.createHash = originalCreateHash;
      syncBuiltinESMExports();
    };
    let receipt: unknown;
    let failure: unknown;
    let finish!: () => void;
    const observed = new NativePromise<void>((resolve) => {
      finish = resolve;
    });

    try {
      cryptoModule.createHash = poison;
      syncBuiltinESMExports();
      for (const [key, descriptor] of promiseDescriptors) {
        Object.defineProperty(Promise, key, { ...descriptor, value: poison });
      }
      for (const [key, descriptor] of jsonDescriptors) {
        Object.defineProperty(JSON, key, { ...descriptor, value: poison });
      }
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        ...iteratorDescriptor,
        value: poison,
      });
      const run = runFloodgateV7OfflineConnectorGateContractComposition();
      nativeReflectApply(nativePromiseThen, run, [
        (value: unknown) => {
          receipt = value;
          restore();
          finish();
        },
        (reason: unknown) => {
          failure = reason;
          restore();
          finish();
        },
      ]);
      await observed;
    } finally {
      restore();
    }

    expect(trapCalls).toBe(0);
    expect(failure).toBeUndefined();
    expect(receipt).toMatchObject({
      status: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS,
    });
  });
});

describe("Floodgate v7 offline connector gate runner source boundary", () => {
  it("keeps the runner offline-only and the argumentless CLI import-safe", () => {
    const runnerSource = fs.readFileSync(RUNNER_SOURCE_PATH, "utf8");
    const cliSource = fs.readFileSync(CLI_SOURCE_PATH, "utf8");
    const packageJson = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");

    expect(runnerSource).not.toMatch(
      /from\s+["']node:(?:fs|os|net|http|https|tls|dgram|dns|child_process|worker_threads)["']/,
    );
    expect(runnerSource).not.toMatch(
      /\bloadFloodgateV7ApprovedKeyEnrollment\s*(?:,|})/,
    );
    expect(runnerSource).not.toMatch(
      /\brunFloodgateV7ProductionCheckpointConnector\s*(?:,|})/,
    );
    expect(runnerSource).not.toMatch(
      /\b(?:readFile|readFileSync|writeFile|writeFileSync|appendFile|mkdir|open|fetch|spawn|exec|fork)\s*\(/,
    );
    expect(runnerSource).not.toMatch(/\bconsole\.(?:log|info|warn|error)\b/);

    expect(cliSource).toContain("require.main === module");
    expect(cliSource).toContain("process.argv.length !== 2");
    expect(cliSource).toContain("await writeOutput(process.stdout");
    expect(cliSource).toContain('stream.on("error", onError)');
    expect(cliSource).toContain('stream.off("error", onError)');
    expect(cliSource).not.toContain("console.log");
    expect(cliSource.indexOf("process.argv.length !== 2")).toBeLessThan(
      cliSource.indexOf(
        "runFloodgateV7OfflineConnectorGateContractComposition()",
      ),
    );
    expect(packageJson).toContain(
      '"shogi:floodgate-v7-offline-connector-gates": "node -r tsx/cjs ml/run-floodgate-v7-offline-connector-gates.ts"',
    );
  });

  it("does nothing on import and rejects an extra CLI argument before runner authority", () => {
    const imported = spawnSync(
      process.execPath,
      [
        "-r",
        "tsx/cjs",
        "-e",
        `require(${JSON.stringify(CLI_SOURCE_PATH)}); process.stdout.write("import-safe\\n");`,
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: { ...process.env, TSX_DISABLE_CACHE: "1" },
        timeout: 30_000,
      },
    );
    expect(imported).toMatchObject({
      status: 0,
      stdout: "import-safe\n",
      stderr: "",
    });

    const rejected = runCli("unexpected-argument");
    expect(rejected).toMatchObject({
      status: 1,
      stdout: "",
      stderr: FIXED_FAILURE_MESSAGE,
    });
  });

  it("prints exactly one deterministic JSON receipt followed by one LF", () => {
    const completed = runCli();
    expect(completed.status).toBe(0);
    expect(completed.signal).toBeNull();
    expect(completed.stderr).toBe("");
    const parsed = JSON.parse(completed.stdout) as Readonly<
      Record<string, unknown>
    >;
    expect(parsed).toMatchObject({
      schema: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_SCHEMA,
      status: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS,
      execution_boundary:
        FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_EXECUTION_BOUNDARY,
    });
    expect(completed.stdout).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  });

  it("imports and runs in a fresh process without application-data, OS identity, process, or network calls", () => {
    const script = `
const fs = require("node:fs");
const os = require("node:os");
const childProcess = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");
const repositoryRoot = ${JSON.stringify(REPOSITORY_ROOT)};
const runnerPath = ${JSON.stringify(RUNNER_SOURCE_PATH)};
const traps = [];
function sourceLoadAllowed(value) {
  if (typeof value !== "string") return false;
  const resolved = path.resolve(value);
  const basename = path.basename(resolved);
  return (
    (resolved === repositoryRoot || resolved.startsWith(repositoryRoot + path.sep)) &&
    (/\\.(?:[cm]?js|tsx?|node|map)$/.test(resolved) ||
      basename === "package.json" ||
      basename === "tsconfig.json")
  );
}
function trap(object, key, allowModuleSource) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || typeof descriptor.value !== "function") return;
  const original = descriptor.value;
  Object.defineProperty(object, key, {
    ...descriptor,
    value: function trappedApplicationOperation(...args) {
      if (allowModuleSource && sourceLoadAllowed(args[0])) {
        return Reflect.apply(original, this, args);
      }
      traps.push(key);
      throw new Error("unexpected application operation: " + key);
    },
  });
}
for (const key of [
  "openSync", "readSync", "readvSync", "readFileSync", "writeSync",
  "writeFileSync", "appendFileSync", "createReadStream", "createWriteStream",
  "open", "read", "readv", "readFile", "write", "writeFile", "appendFile",
]) trap(fs, key, key === "readFileSync" || key === "readFile");
for (const key of ["open", "readFile", "writeFile", "appendFile"]) {
  trap(fs.promises, key, key === "readFile");
}
for (const key of ["userInfo", "homedir"]) trap(os, key, false);
for (const key of ["getuid", "geteuid"]) trap(process, key, false);
for (const key of [
  "spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork",
]) trap(childProcess, key, false);
for (const key of ["connect", "createConnection"]) trap(net, key, false);
for (const module of [http, https]) {
  for (const key of ["request", "get"]) trap(module, key, false);
}
syncBuiltinESMExports();
(async () => {
  try {
    const runner = require(runnerPath);
    const receipt = await runner.runFloodgateV7OfflineConnectorGateContractComposition();
    process.stdout.write(JSON.stringify({ trap_count: traps.length, status: receipt.status }) + "\\n");
  } catch (error) {
    process.stderr.write(String(error) + "\\n" + JSON.stringify(traps) + "\\n");
    process.exitCode = 1;
  }
})();
`;
    const result = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", script],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: { ...process.env, TSX_DISABLE_CACHE: "1" },
        timeout: 30_000,
      },
    );

    expect(result).toMatchObject({ status: 0, signal: null, stderr: "" });
    expect(JSON.parse(result.stdout)).toEqual({
      trap_count: 0,
      status: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS,
    });
  });
});
