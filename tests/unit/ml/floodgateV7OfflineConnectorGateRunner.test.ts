import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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
import { registerSyntheticFloodgateTeacherStageLeaseTestRealmCoreForTests } from "../../../ml/floodgate-teacher-stage-authorization";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
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
const SECRET_FAILURE_CANARY =
  "offline-connector-private-failure-canary-8fc1c4d70bb64a4e";
const requireFromHere = createRequire(import.meta.url);
const TYPESCRIPT_PACKAGE_PATH = requireFromHere.resolve(
  "typescript/package.json",
);
const TYPESCRIPT_PACKAGE_PROBE_PATHS = (
  requireFromHere.resolve.paths("typescript") ?? []
).map((searchPath) => path.join(searchPath, "typescript/package.json"));
const TSX_CJS_ENTRY_PATH = requireFromHere.resolve("tsx/cjs");
const requireFromTsx = createRequire(TSX_CJS_ENTRY_PATH);
const EFFECTIVE_USER_ID =
  typeof process.geteuid === "function"
    ? process.geteuid()
    : os.userInfo().username;
const TEMP_DIRECTORY = os.tmpdir();
const TSX_PARENT_IPC_BASE_PATH = path.join(
  TEMP_DIRECTORY,
  `tsx-${EFFECTIVE_USER_ID}`,
  `${process.pid}.pipe`,
);
const TSX_PARENT_IPC_PATH =
  process.platform === "win32"
    ? `\\\\?\\pipe\\${TSX_PARENT_IPC_BASE_PATH}`
    : TSX_PARENT_IPC_BASE_PATH;
const TOGGLE_ASCII_CASE = (value: string): string =>
  value.replace(/[A-Za-z]/g, (character) =>
    character === character.toLowerCase()
      ? character.toUpperCase()
      : character.toLowerCase(),
  );
const CASE_PROBE_EXISTS = fs.existsSync(TOGGLE_ASCII_CASE(REPOSITORY_ROOT));
const ESBUILD_VERSION = (
  requireFromTsx("esbuild/package.json") as Readonly<{ version: string }>
).version;
const ESBUILD_WORKER_PATH = fs.realpathSync.native(
  requireFromTsx.resolve("esbuild/lib/main.js"),
);
const TSX_PACKAGE_PATH = requireFromHere.resolve("tsx/package.json");
const TSX_DIST_PATH = path.join(path.dirname(TSX_PACKAGE_PATH), "dist");
const TSX_CJS_LEXER_FILENAMES = fs
  .readdirSync(TSX_DIST_PATH)
  .filter((filename) => /^lexer-.+\.cjs$/.test(filename));
if (TSX_CJS_LEXER_FILENAMES.length !== 1) {
  throw new Error("expected exactly one TSX CommonJS lexer implementation");
}
const TSX_LEXER_TYPESCRIPT_PROBE_PATH = path.join(
  TSX_DIST_PATH,
  TSX_CJS_LEXER_FILENAMES[0].replace(/\.cjs$/, ".cts"),
);
const NativePromise = Promise;
const nativePromiseThen = Promise.prototype.then;
const nativeReflectApply = Reflect.apply;

function cleanChildEnvironment(
  additions: Readonly<Record<string, string | undefined>> = {},
): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.TSX_TSCONFIG_PATH;
  return { ...environment, ...additions };
}

function runCli(...arguments_: readonly string[]) {
  return spawnSync(
    process.execPath,
    ["-r", "tsx/cjs", CLI_SOURCE_PATH, ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: cleanChildEnvironment(),
      timeout: 30_000,
    },
  );
}

function runCliWithInheritedArrayToJsonPoison() {
  const bootstrap = `Object.defineProperty(Array.prototype, "toJSON", { configurable: true, value() { return { compromised: ${JSON.stringify(
    SECRET_FAILURE_CANARY,
  )} }; } }); process.argv = [process.execPath, process.argv[1]]; require("node:module")._load(process.argv[1], null, true);`;
  return spawnSync(
    process.execPath,
    ["-r", "tsx/cjs", "-e", bootstrap, CLI_SOURCE_PATH],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: cleanChildEnvironment(),
      timeout: 30_000,
    },
  );
}

function assertDeepFrozenRecordGraph(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    expect(descriptor).toBeDefined();
    expect(descriptor).toHaveProperty("value");
    expect(descriptor?.get).toBeUndefined();
    expect(descriptor?.set).toBeUndefined();
  }
  expect(Object.isFrozen(value)).toBe(true);
  if (Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    expect(prototype).not.toBe(Array.prototype);
    expect(Object.isFrozen(prototype)).toBe(true);
    expect(Reflect.ownKeys(prototype)).toEqual(["toJSON"]);
    expect(Object.getPrototypeOf(prototype)).toBe(Array.prototype);
    expect(Object.getOwnPropertyDescriptor(prototype, "toJSON")).toEqual({
      configurable: false,
      enumerable: false,
      writable: false,
      value: undefined,
    });
    expect(Object.hasOwn(value, "toJSON")).toBe(false);
    expect(ownKeys).toEqual([
      ...Array.from({ length: value.length }, (_entry, index) => String(index)),
      "length",
    ]);
    for (let index = 0; index < value.length; index += 1) {
      expect(descriptors[String(index)]).toMatchObject({
        configurable: false,
        enumerable: true,
        writable: false,
      });
    }
  } else {
    expect(Object.getPrototypeOf(value)).toBeNull();
    for (const key of ownKeys) {
      expect(Object.getOwnPropertyDescriptor(value, key)).toMatchObject({
        configurable: false,
        enumerable: true,
        writable: false,
      });
    }
  }
  for (const key of ownKeys) {
    assertDeepFrozenRecordGraph(
      Object.getOwnPropertyDescriptor(value, key)?.value,
    );
  }
}

function assertNoExecutableOrBinary(value: unknown): void {
  if (value === null || typeof value !== "object") {
    expect(typeof value).not.toBe("function");
    return;
  }
  expect(Buffer.isBuffer(value)).toBe(false);
  for (const key of Reflect.ownKeys(value)) {
    assertNoExecutableOrBinary(
      Object.getOwnPropertyDescriptor(value, key)?.value,
    );
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

  it("preserves the exact JSON array shape under inherited Array.prototype.toJSON poisoning", async () => {
    const baseline =
      await runFloodgateV7OfflineConnectorGateContractComposition();
    const baselineCompact = JSON.stringify(baseline);
    const baselinePretty = `${JSON.stringify(baseline, null, 2)}\n`;
    const descriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "toJSON",
    );
    try {
      Object.defineProperty(Array.prototype, "toJSON", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: () => ({ compromised: SECRET_FAILURE_CANARY }),
      });
      expect(JSON.stringify(["control-array"])).toBe(
        `{"compromised":"${SECRET_FAILURE_CANARY}"}`,
      );

      const protectedReceipt =
        await runFloodgateV7OfflineConnectorGateContractComposition();
      expect(JSON.stringify(protectedReceipt)).toBe(baselineCompact);
      expect(`${JSON.stringify(protectedReceipt, null, 2)}\n`).toBe(
        baselinePretty,
      );
      expect(Object.getPrototypeOf(protectedReceipt.gates)).not.toBe(
        Array.prototype,
      );
      expect(JSON.parse(baselineCompact).gates).toHaveLength(3);
      expect(baselineCompact).not.toContain(SECRET_FAILURE_CANARY);
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(Array.prototype, "toJSON");
      } else {
        Object.defineProperty(Array.prototype, "toJSON", descriptor);
      }
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
    let failCleanup = false;
    let observedFailureEvidence: unknown;
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
        const engineArgsDescriptor = Object.getOwnPropertyDescriptor(
          options.stageAuthorization,
          "engineArgs",
        );
        expect(engineArgsDescriptor).toMatchObject({
          configurable: false,
          enumerable: true,
          writable: false,
        });
        expect(engineArgsDescriptor).toHaveProperty("value");
        const engineArgs = engineArgsDescriptor?.value as readonly unknown[];
        expect(Array.isArray(engineArgs)).toBe(true);
        expect(Object.getPrototypeOf(engineArgs)).toBe(Array.prototype);
        expect(Object.isFrozen(engineArgs)).toBe(true);
        expect(Reflect.ownKeys(engineArgs)).toEqual(["length"]);
        expect(Object.getOwnPropertyDescriptor(engineArgs, "length")).toEqual({
          configurable: false,
          enumerable: false,
          value: 0,
          writable: false,
        });
        connectorCapabilities.push(options.keyEnrollment);
        events.push(`start-${options.gate}`);
        let originalHandoff: ReturnType<
          typeof dependencies.claimCoordinatorHandoff
        > | null = null;
        let originalLease: Awaited<
          ReturnType<typeof dependencies.authorizeStage>
        > | null = null;
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
            originalHandoff = handoff;
            return Object.freeze({
              ...handoff,
              close: Object.freeze(() => {
                recordLifecycle("coordinator-close");
                return handoff.close();
              }),
              abortAndDrain: Object.freeze(() => {
                recordLifecycle("coordinator-abort");
                const source = handoff.abortAndDrain();
                if (!failCleanup) return source;
                return new NativePromise<void>((_resolve, reject) => {
                  nativeReflectApply(nativePromiseThen, source, [
                    () =>
                      reject(
                        new Error(`${SECRET_FAILURE_CANARY}:coordinator-abort`),
                      ),
                    reject,
                  ]);
                });
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
                  (() => {
                    try {
                      originalLease = lease;
                      const instrumentedLease = Object.freeze({
                        ...lease,
                        close: Object.freeze(() => {
                          recordLifecycle("lease-close");
                          const close = lease.close();
                          if (
                            !failCleanup ||
                            options.gate !== "durable-prefix-500"
                          ) {
                            return close;
                          }
                          return new NativePromise<void>((_resolve, reject) => {
                            nativeReflectApply(nativePromiseThen, close, [
                              () =>
                                reject(
                                  new Error(
                                    `${SECRET_FAILURE_CANARY}:lease-close`,
                                  ),
                                ),
                              reject,
                            ]);
                          });
                        }),
                      });
                      registerSyntheticFloodgateTeacherStageLeaseTestRealmCoreForTests(
                        instrumentedLease,
                      );
                      resolve(instrumentedLease);
                    } catch (error) {
                      reject(error);
                    }
                  })(),
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
            const discarded = dependencies.discardKey(...keyArguments);
            if (failCleanup && options.gate === "durable-prefix-500") {
              throw new Error(`${SECRET_FAILURE_CANARY}:discard-key`);
            }
            return discarded;
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
                reject(new Error(`${SECRET_FAILURE_CANARY}:checkpoint`)),
              );
            }
            if (originalHandoff === null || originalLease === null) {
              throw new Error("instrumented connector sent checkpoint early");
            }
            return dependencies.checkpoint(
              originalLease,
              checkpointArguments[1],
              checkpointArguments[2],
              Object.freeze(
                Object.assign(Object.create(null), {
                  produce: originalHandoff.produce,
                  abortAndDrain: originalHandoff.abortAndDrain,
                }),
              ),
              checkpointArguments[4],
              checkpointArguments[5],
            );
          },
          observeFailureForTests: (
            ...observerArguments: Parameters<
              NonNullable<typeof dependencies.observeFailureForTests>
            >
          ) => {
            recordLifecycle("failure-observer");
            observedFailureEvidence = observerArguments[0];
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
      const successfulReceipt =
        await isolated.runFloodgateV7OfflineConnectorGateContractComposition();
      expect(successfulReceipt).toMatchObject({
        cross_gate: {
          cleanup_completed_before_next_gate: true,
          fresh_enrollment_capability_per_gate: true,
        },
      });
      expect(JSON.stringify(successfulReceipt)).not.toContain(
        SECRET_FAILURE_CANARY,
      );
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
      failCleanup = true;
      let publicFailure: unknown;
      try {
        await isolated.runFloodgateV7OfflineConnectorGateContractComposition();
      } catch (error) {
        publicFailure = error;
      }
      expect(publicFailure).toMatchObject({
        phase: "checkpoint",
        checkpoint_may_have_persisted: true,
        cleanup_failure_count: 3,
        retry_disposition: "checkpoint-reconciliation-required",
      });
      expect(publicFailure).toBeInstanceOf(
        connectorModule.FloodgateV7ProductionCheckpointConnectorError,
      );
      const publicError = publicFailure as Error &
        Readonly<Record<string, unknown>>;
      expect(publicError.message).not.toContain(SECRET_FAILURE_CANARY);
      expect(publicError.stack).not.toContain(SECRET_FAILURE_CANARY);
      expect(String(publicError)).not.toContain(SECRET_FAILURE_CANARY);
      expect(Object.getOwnPropertyDescriptor(publicError, "cause")).toBe(
        undefined,
      );
      expect("cause" in publicError).toBe(false);
      expect(
        Reflect.ownKeys(publicError)
          .map((key) => String(key))
          .join("\n"),
      ).not.toContain(SECRET_FAILURE_CANARY);
      for (const key of Reflect.ownKeys(publicError)) {
        const descriptor = Object.getOwnPropertyDescriptor(publicError, key);
        expect(descriptor).toBeDefined();
        expect(descriptor?.get).toBeUndefined();
        expect(descriptor?.set).toBeUndefined();
        expect(String(descriptor?.value)).not.toContain(SECRET_FAILURE_CANARY);
        expect(String(JSON.stringify(descriptor?.value))).not.toContain(
          SECRET_FAILURE_CANARY,
        );
      }
      expect(JSON.stringify(publicError)).not.toContain(SECRET_FAILURE_CANARY);

      expect(observedFailureEvidence).toMatchObject({
        phase: "checkpoint",
        checkpointMayHavePersisted: true,
      });
      const internalEvidence = observedFailureEvidence as {
        readonly primary: unknown;
        readonly cleanupFailures: readonly unknown[];
      };
      expect(String(internalEvidence.primary)).toContain(
        `${SECRET_FAILURE_CANARY}:checkpoint`,
      );
      expect(internalEvidence.cleanupFailures).toHaveLength(3);
      expect(internalEvidence.cleanupFailures.map(String)).toEqual([
        `Error: ${SECRET_FAILURE_CANARY}:discard-key`,
        `Error: ${SECRET_FAILURE_CANARY}:lease-close`,
        `Error: ${SECRET_FAILURE_CANARY}:coordinator-abort`,
      ]);
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

      const rejectedCli = runCli(SECRET_FAILURE_CANARY);
      expect(rejectedCli).toMatchObject({
        status: 1,
        stdout: "",
        stderr: FIXED_FAILURE_MESSAGE,
      });
      expect(rejectedCli.stderr).not.toContain(SECRET_FAILURE_CANARY);
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
  it("keeps enumerated direct authority imports and named production entrypoints out of the runner", () => {
    const runnerSource = fs.readFileSync(RUNNER_SOURCE_PATH, "utf8");
    const cliSource = fs.readFileSync(CLI_SOURCE_PATH, "utf8");
    const packageJson = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");

    for (const specifier of [
      "node:fs",
      "node:os",
      "node:net",
      "node:http",
      "node:https",
      "node:http2",
      "node:tls",
      "node:dgram",
      "node:dns",
      "node:child_process",
      "node:worker_threads",
    ]) {
      const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(runnerSource).not.toMatch(
        new RegExp(
          `(?:\\bfrom\\s*|\\b(?:module\\.)?require\\s*\\(\\s*|\\bimport\\s*\\(\\s*|\\bimport\\s*)["']${escaped}["']`,
        ),
      );
    }
    expect(runnerSource).not.toMatch(
      /\bloadFloodgateV7ApprovedKeyEnrollment\b/,
    );
    expect(runnerSource).not.toMatch(
      /\brunFloodgateV7ProductionCheckpointConnector\b/,
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
        env: cleanChildEnvironment({ TSX_DISABLE_CACHE: "1" }),
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

  it("prints the unchanged exact CLI JSON shape under inherited array toJSON poisoning", () => {
    const baseline = runCli();
    const poisoned = runCliWithInheritedArrayToJsonPoison();

    expect(baseline).toMatchObject({ status: 0, signal: null, stderr: "" });
    expect(poisoned).toMatchObject({ status: 0, signal: null, stderr: "" });
    expect(poisoned.stdout).toBe(baseline.stdout);
    expect(poisoned.stdout).not.toContain(SECRET_FAILURE_CANARY);
    const parsed = JSON.parse(poisoned.stdout) as {
      readonly gates: readonly unknown[];
    };
    expect(Array.isArray(parsed.gates)).toBe(true);
    expect(parsed.gates).toHaveLength(3);
  });

  it("reports zero unexpected application API calls while exact loader and read-only test-isolation boundary calls stay counted", () => {
    const script = `
const fs = require("node:fs");
const os = require("node:os");
const childProcess = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const http2 = require("node:http2");
const dns = require("node:dns");
const tls = require("node:tls");
const dgram = require("node:dgram");
const workerThreads = require("node:worker_threads");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");
const loaderRealpathSync = fs.realpathSync.native.bind(fs.realpathSync);
const repositoryRoot = ${JSON.stringify(REPOSITORY_ROOT)};
const toggleAsciiCase = (value) => value.replace(/[A-Za-z]/g, (character) =>
  character === character.toLowerCase()
    ? character.toUpperCase()
    : character.toLowerCase(),
);
const upperCaseRootProbe = toggleAsciiCase(repositoryRoot);
const esbuildWorkerPath = ${JSON.stringify(ESBUILD_WORKER_PATH)};
const tsxLexerTypescriptProbePath = ${JSON.stringify(TSX_LEXER_TYPESCRIPT_PROBE_PATH)};
const typescriptPackagePath = ${JSON.stringify(TYPESCRIPT_PACKAGE_PATH)};
const typescriptPackageProbePaths = new Set(${JSON.stringify(TYPESCRIPT_PACKAGE_PROBE_PATHS)});
const tsxEntryPath = ${JSON.stringify(TSX_CJS_ENTRY_PATH)};
const effectiveUserId = ${JSON.stringify(EFFECTIVE_USER_ID)};
const hasEffectiveUserIdApi = typeof process.geteuid === "function";
const tsxParentIpcPath = ${JSON.stringify(TSX_PARENT_IPC_PATH)};
const caseProbeExpected = ${JSON.stringify(CASE_PROBE_EXISTS)};
const esbuildVersion = ${JSON.stringify(ESBUILD_VERSION)};
const exactConfigPaths = new Set([
  path.join(repositoryRoot, "package.json"),
  path.join(repositoryRoot, "tsconfig.json"),
  typescriptPackagePath,
]);
const runnerPath = ${JSON.stringify(RUNNER_SOURCE_PATH)};
const syntheticPathRoot = "/offline-floodgate-v7-contract-fixture";
const boundaryUserInfo = os.userInfo();
const requestedProductionHome = path.resolve(boundaryUserInfo.homedir);
const canonicalProductionHome = fs.realpathSync.native(requestedProductionHome);
const syntheticFilesystemRoot = path.parse(syntheticPathRoot).root;
if (fs.existsSync(syntheticPathRoot)) {
  throw new Error("fixed synthetic test-boundary root unexpectedly exists");
}
const exactSyntheticBoundaryLeafInspectionCounts = new Map([
  [syntheticPathRoot + "/repository", 6],
  [syntheticPathRoot + "/repository/ml/protocols/wcsc36-policy-exposed-parent-ids.txt", 6],
  [syntheticPathRoot + "/raw-lock", 6],
  [syntheticPathRoot + "/role-lock", 6],
  [syntheticPathRoot + "/role-bundle", 6],
  [syntheticPathRoot + "/publication", 3],
  [syntheticPathRoot + "/publication/floodgate-v7-" + ${JSON.stringify("12".repeat(32))} + "-stage", 6],
  [syntheticPathRoot + "/publication/floodgate-v7-" + ${JSON.stringify("12".repeat(32))} + "-final", 6],
  [syntheticPathRoot + "/assets/engine/yaneuraou", 3],
  [syntheticPathRoot + "/assets/engine/receipt.json", 3],
  [syntheticPathRoot + "/assets/eval", 3],
]);
const expectedSyntheticBoundaryPathInspectionCounts = new Map();
for (const [leaf, inspectionCount] of exactSyntheticBoundaryLeafInspectionCounts) {
  let cursor = leaf;
  for (;;) {
    expectedSyntheticBoundaryPathInspectionCounts.set(
      cursor,
      (expectedSyntheticBoundaryPathInspectionCounts.get(cursor) || 0) + inspectionCount,
    );
    if (cursor === syntheticPathRoot) break;
    cursor = path.dirname(cursor);
    if (
      cursor !== syntheticPathRoot &&
      !cursor.startsWith(syntheticPathRoot + path.sep)
    ) {
      throw new Error("fixed synthetic boundary leaf escaped its root");
    }
  }
}
const exactSyntheticBoundaryPaths = new Set(
  expectedSyntheticBoundaryPathInspectionCounts.keys(),
);
const traps = [];
const allowedLoaderCalls = [];
const allowedTestBoundaryCalls = Object.assign(Object.create(null), {
  "current-euid": 0,
  "current-user-info": 0,
  "production-home-realpath": 0,
  "production-home-stat": 0,
  "synthetic-realpath": 0,
  "synthetic-lstat": 0,
  "root-ancestor-realpath": 0,
  "root-ancestor-stat": 0,
});
const observedSyntheticBoundaryPathInspectionCounts = new Map();
let phase = "loader";
function exactRepositorySourceCandidate(value) {
  if (typeof value !== "string") return false;
  const resolved = path.resolve(value);
  return (
    value === resolved &&
    resolved.startsWith(repositoryRoot + path.sep) &&
    /\\.(?:[cm]?js|tsx?|node|map)$/.test(resolved)
  );
}
function classifyObservedLoaderCall(api, args) {
  if (phase !== "loader") return null;
  const value = args[0];
  if (api === "readFileSync") {
    if (exactRepositorySourceCandidate(value)) return "require-cache-source-read";
    if (typeof value === "string" && exactConfigPaths.has(value)) {
      return "exact-package-or-tsconfig-read";
    }
    if (typescriptPackageProbePaths.has(value)) {
      return "tsx-typescript-package-read-probe";
    }
  }
  if (api === "realpathSync" && exactRepositorySourceCandidate(value)) {
    return "require-cache-source-realpath";
  }
  if (api === "existsSync" && exactRepositorySourceCandidate(value)) {
    return "require-cache-source-exists";
  }
  if (
    api === "statSync" &&
    (value === path.join(repositoryRoot, "tsconfig.json") ||
      value === typescriptPackagePath)
  ) {
    return "exact-config-stat";
  }
  if (api === "statSync" && typescriptPackageProbePaths.has(value)) {
    return "tsx-typescript-package-stat-probe";
  }
  if (api === "existsSync" && value === repositoryRoot) {
    return "tsx-exact-repository-root-exists";
  }
  if (api === "existsSync" && value === upperCaseRootProbe) {
    return "tsx-exact-uppercase-root-case-probe";
  }
  if (api === "existsSync" && value === tsxLexerTypescriptProbePath) {
    return "tsx-exact-lexer-typescript-probe";
  }
  if (api === "Worker" && value === esbuildWorkerPath) {
    return "tsx-exact-esbuild-transform-worker";
  }
  if (api === "geteuid" && args.length === 0 && hasEffectiveUserIdApi) {
    return "tsx-bootstrap-effective-user-id";
  }
  if (api === "os.userInfo" && args.length === 0 && !hasEffectiveUserIdApi) {
    return "tsx-bootstrap-user-info";
  }
  if (
    api === "createConnection" &&
    value === tsxParentIpcPath
  ) {
    return "tsx-parent-ipc-pipe";
  }
  if (
    api === "net.Socket.prototype.connect" &&
    args.length === 1 &&
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] !== null &&
    typeof value[0] === "object" &&
    Reflect.ownKeys(value[0]).join("\\n") === "path" &&
    value[0].path === tsxParentIpcPath &&
    typeof value[1] === "function" &&
    Reflect.ownKeys(value).map(String).join("\\n") ===
      ["0", "1", "length", "Symbol(normalizedArgs)"].join("\\n")
  ) {
    return "tsx-parent-ipc-socket-connect";
  }
  return null;
}
function exactBigIntStatOptions(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Reflect.ownKeys(value).join("\\n") === "bigint" &&
    value.bigint === true
  );
}
function exactSyntheticBoundaryPath(value) {
  return (
    typeof value === "string" &&
    path.resolve(value) === value &&
    exactSyntheticBoundaryPaths.has(value)
  );
}
function classifyObservedTestBoundaryCall(api, args) {
  if (phase !== "execution") return null;
  const value = args[0];
  if (
    api === "geteuid" &&
    args.length === 0 &&
    hasEffectiveUserIdApi
  ) {
    return "current-euid";
  }
  if (api === "os.userInfo" && args.length === 0) {
    return "current-user-info";
  }
  if (
    api === "fs.realpathSync.native" &&
    args.length === 1 &&
    value === requestedProductionHome
  ) {
    return "production-home-realpath";
  }
  if (
    api === "statSync" &&
    args.length === 2 &&
    value === canonicalProductionHome &&
    exactBigIntStatOptions(args[1])
  ) {
    return "production-home-stat";
  }
  if (
    api === "fs.realpathSync.native" &&
    args.length === 1 &&
    exactSyntheticBoundaryPath(value)
  ) {
    return "synthetic-realpath";
  }
  if (
    api === "lstatSync" &&
    args.length === 2 &&
    exactSyntheticBoundaryPath(value) &&
    exactBigIntStatOptions(args[1])
  ) {
    return "synthetic-lstat";
  }
  if (
    api === "fs.realpathSync.native" &&
    args.length === 1 &&
    value === syntheticFilesystemRoot
  ) {
    return "root-ancestor-realpath";
  }
  if (
    api === "statSync" &&
    args.length === 2 &&
    value === syntheticFilesystemRoot &&
    exactBigIntStatOptions(args[1])
  ) {
    return "root-ancestor-stat";
  }
  return null;
}
function trap(object, key, allowObservedLoaderCall, api = key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || typeof descriptor.value !== "function") return;
  const original = descriptor.value;
  const trapped = function trappedApplicationOperation(...args) {
    const testBoundaryClassification = classifyObservedTestBoundaryCall(
      api,
      args,
    );
    if (testBoundaryClassification !== null) {
      allowedTestBoundaryCalls[testBoundaryClassification] += 1;
      if (
        testBoundaryClassification === "synthetic-realpath" ||
        testBoundaryClassification === "synthetic-lstat"
      ) {
        const input = args[0];
        let counts = observedSyntheticBoundaryPathInspectionCounts.get(input);
        if (counts === undefined) {
          counts = Object.assign(Object.create(null), {
            realpath: 0,
            lstat: 0,
          });
          observedSyntheticBoundaryPathInspectionCounts.set(input, counts);
        }
        counts[
          testBoundaryClassification === "synthetic-realpath"
            ? "realpath"
            : "lstat"
        ] += 1;
      }
      if (new.target !== undefined) {
        return Reflect.construct(original, args, original);
      }
      return Reflect.apply(original, this, args);
    }
    const classification = allowObservedLoaderCall
      ? classifyObservedLoaderCall(api, args)
      : null;
    if (classification !== null) {
      if (new.target !== undefined) {
        const result = Reflect.construct(original, args, original);
        allowedLoaderCalls.push({
            classification,
            api,
            phase,
            argument_count: args.length,
            second_argument_type: typeof args[1],
            second_argument_value:
              typeof args[1] === "string" ? args[1] : null,
            second_object_keys:
              args[1] !== null && typeof args[1] === "object"
                ? Reflect.ownKeys(args[1]).map(String)
                : null,
            second_object_key_types:
              args[1] !== null && typeof args[1] === "object"
                ? Reflect.ownKeys(args[1]).map((key) => typeof key)
                : null,
            input: String(args[0]),
            output: null,
            result_type: typeof result,
            worker_options: {
              keys: Reflect.ownKeys(args[1]).map(String),
              eval: args[1].eval,
              worker_data_keys: Reflect.ownKeys(args[1].workerData).map(String),
              transfer_list_length: args[1].transferList.length,
              exec_argv: args[1].execArgv,
              default_working_directory: args[1].workerData.defaultWD,
              esbuild_version: args[1].workerData.esbuildVersion,
              worker_port_transferred:
                args[1].transferList[0] === args[1].workerData.workerPort,
            },
          });
        return result;
      }
      const result = Reflect.apply(original, this, args);
      allowedLoaderCalls.push({
        classification,
        api,
        phase,
        argument_count: args.length,
        second_argument_type: typeof args[1],
        second_argument_value:
          typeof args[1] === "string" ? args[1] : null,
        second_object_keys:
          args[1] !== null && typeof args[1] === "object"
            ? Reflect.ownKeys(args[1]).map(String)
            : null,
        second_object_key_types:
          args[1] !== null && typeof args[1] === "object"
            ? Reflect.ownKeys(args[1]).map((key) => typeof key)
            : null,
        input: String(args[0]),
        output:
          api === "realpathSync" ||
          api === "existsSync" ||
          api === "geteuid"
            ? String(result)
            : api === "os.userInfo"
              ? String(result.username)
              : null,
        result_type: typeof result,
        stat_options:
          api === "statSync" && args[1] !== undefined
            ? {
                keys: Reflect.ownKeys(args[1]).map(String),
                throw_if_no_entry: args[1].throwIfNoEntry,
                bigint: args[1].bigint,
              }
            : null,
        worker_options: null,
      });
      return result;
    }
    traps.push(
      api +
        ":" +
        String(args[0]) +
        ":phase=" +
        phase +
        ":type=" +
        typeof args[0],
    );
    throw new Error(
      "unexpected enumerated application public API call: " +
        api +
        ":" +
        String(args[0]) +
        ":phase=" +
        phase +
        ":type=" +
        typeof args[0],
    );
  };
  const nativeDescriptor = Object.getOwnPropertyDescriptor(original, "native");
  if (nativeDescriptor !== undefined) {
    Object.defineProperty(trapped, "native", nativeDescriptor);
  }
  Object.defineProperty(object, key, {
    ...descriptor,
    value: trapped,
  });
}
trap(fs.realpathSync, "native", false, "fs.realpathSync.native");
trap(fs.realpath, "native", false);
for (const key of [
  "openSync", "readSync", "readvSync", "readFileSync", "writeSync",
  "writevSync", "writeFileSync", "appendFileSync", "createReadStream",
  "createWriteStream", "open", "read", "readv", "readFile", "write", "writev",
  "writeFile", "appendFile", "fsyncSync", "fdatasyncSync", "fsync", "fdatasync",
  "closeSync", "close",
  "existsSync", "accessSync", "statSync", "lstatSync", "fstatSync",
  "statfsSync", "realpathSync", "readlinkSync", "access", "stat", "lstat",
  "fstat", "statfs",
  "realpath", "readlink", "mkdirSync", "mkdtempSync", "renameSync",
  "unlinkSync", "rmSync", "rmdirSync", "copyFileSync", "cpSync",
  "truncateSync", "ftruncateSync", "chmodSync", "fchmodSync", "chownSync",
  "fchownSync", "lchownSync", "utimesSync", "futimesSync", "lutimesSync",
  "symlinkSync", "linkSync", "mkdir", "mkdtemp", "rename", "unlink", "rm",
  "rmdir", "copyFile", "cp", "truncate", "ftruncate", "chmod", "fchmod",
  "chown", "fchown", "lchown", "utimes", "futimes", "lutimes", "symlink",
  "link", "watch", "watchFile", "unwatchFile", "glob", "globSync",
  "openAsBlob", "exists", "readdirSync", "opendirSync", "readdir", "opendir",
  "ReadStream", "WriteStream", "FileReadStream", "FileWriteStream",
]) trap(
  fs,
  key,
  ["readFileSync", "realpathSync", "existsSync", "statSync"].includes(key),
);
for (const key of [
  "open", "readFile", "writeFile", "appendFile", "access", "stat", "lstat",
  "statfs", "realpath", "readlink", "readdir", "opendir", "watch", "glob",
  "openAsBlob", "mkdir",
  "mkdtemp", "rename",
  "unlink", "rm", "rmdir", "copyFile", "cp", "truncate", "chmod", "chown",
  "lchown", "utimes", "lutimes", "symlink", "link",
]) {
  trap(fs.promises, key, false);
}
trap(os, "userInfo", true, "os.userInfo");
trap(os, "homedir", false, "os.homedir");
trap(process, "getuid", false);
trap(process, "geteuid", true);
trap(process, "dlopen", false);
for (const key of [
  "spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork",
]) trap(childProcess, key, false);
trap(
  childProcess.ChildProcess.prototype,
  "spawn",
  false,
  "ChildProcess.prototype.spawn",
);
trap(net, "connect", false);
trap(net, "createConnection", true);
trap(
  net.Socket.prototype,
  "connect",
  true,
  "net.Socket.prototype.connect",
);
trap(net.Server.prototype, "listen", false, "net.Server.prototype.listen");
for (const module of [http, https]) {
  for (const key of ["request", "get"]) trap(module, key, false);
}
trap(http, "ClientRequest", false, "http.ClientRequest");
for (const key of ["write", "end", "flushHeaders"]) {
  trap(
    http.OutgoingMessage.prototype,
    key,
    false,
    "http.OutgoingMessage.prototype." + key,
  );
}
trap(
  http.Agent.prototype,
  "createConnection",
  false,
  "http.Agent.prototype.createConnection",
);
trap(
  https.Agent.prototype,
  "createConnection",
  false,
  "https.Agent.prototype.createConnection",
);
for (const key of [
  "connect",
  "createServer",
  "createSecureServer",
  "performServerHandshake",
]) trap(http2, key, false, "http2." + key);
for (const key of [
  "lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny",
  "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs",
  "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse",
]) {
  trap(dns, key, false);
  trap(dns.promises, key, false);
}
for (const resolver of [dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const key of [
    "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa",
    "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr",
    "resolveSoa", "resolveSrv", "resolveTxt", "reverse",
  ]) trap(resolver, key, false, "DNS Resolver.prototype." + key);
}
for (const key of ["connect", "createServer"]) trap(tls, key, false);
trap(dgram, "createSocket", false);
trap(workerThreads, "Worker", true);
trap(globalThis, "fetch", false);
syncBuiltinESMExports();
function validatedAllowedLoaderSummary() {
  const loadedSources = new Set();
  const pendingModules = [require.cache[runnerPath], require.cache[tsxEntryPath]];
  while (pendingModules.length > 0) {
    const current = pendingModules.pop();
    if (current === undefined || loadedSources.has(current.filename)) continue;
    loadedSources.add(current.filename);
    for (const child of current.children) pendingModules.push(child);
  }
  const summary = Object.assign(Object.create(null), {
    "require-cache-source-read": 0,
    "exact-package-or-tsconfig-read": 0,
    "tsx-typescript-package-read-probe": 0,
    "require-cache-source-realpath": 0,
    "require-cache-source-exists": 0,
    "exact-config-stat": 0,
    "tsx-typescript-package-stat-probe": 0,
    "tsx-exact-repository-root-exists": 0,
    "tsx-exact-uppercase-root-case-probe": 0,
    "tsx-exact-lexer-typescript-probe": 0,
    "tsx-exact-esbuild-transform-worker": 0,
    "tsx-bootstrap-effective-user-id": 0,
    "tsx-bootstrap-user-info": 0,
    "tsx-parent-ipc-pipe": 0,
    "tsx-parent-ipc-socket-connect": 0,
  });
  let workerOptions = null;
  for (const call of allowedLoaderCalls) {
    if (call.phase !== "loader") {
      throw new Error("loader allowance escaped the loader phase");
    }
    if (call.classification === "require-cache-source-read") {
      if (
        call.api !== "readFileSync" ||
        call.argument_count !== 2 ||
        call.second_argument_type !== "string" ||
        call.second_argument_value !== "utf8" ||
        call.result_type !== "string" ||
        !exactRepositorySourceCandidate(call.input) ||
        !loadedSources.has(call.input) ||
        call.output !== null
      ) {
        throw new Error("unvalidated require-cache source read allowance");
      }
    } else if (call.classification === "exact-package-or-tsconfig-read") {
      if (
        call.api !== "readFileSync" ||
        call.argument_count !== 2 ||
        call.second_argument_type !== "string" ||
        call.second_argument_value !== "utf8" ||
        call.result_type !== "string" ||
        !exactConfigPaths.has(call.input) ||
        call.output !== null
      ) {
        throw new Error("unvalidated exact config read allowance");
      }
    } else if (
      call.classification === "tsx-typescript-package-read-probe"
    ) {
      if (
        call.api !== "readFileSync" ||
        call.argument_count !== 2 ||
        call.second_argument_type !== "string" ||
        call.second_argument_value !== "utf8" ||
        call.result_type !== "string" ||
        !typescriptPackageProbePaths.has(call.input) ||
        call.output !== null
      ) {
        throw new Error(
          "unvalidated TypeScript package read probe allowance: " +
            JSON.stringify(call),
        );
      }
    } else if (call.classification === "require-cache-source-realpath") {
      if (
        call.api !== "realpathSync" ||
        call.argument_count !== 2 ||
        call.second_argument_type !== "object" ||
        call.second_object_keys?.join("") !== "Symbol(realpathCacheKey)" ||
        call.second_object_key_types?.join("") !== "symbol" ||
        call.result_type !== "string" ||
        !exactRepositorySourceCandidate(call.input) ||
        !exactRepositorySourceCandidate(call.output) ||
        loaderRealpathSync(call.input) !== call.output ||
        !loadedSources.has(call.output)
      ) {
        throw new Error(
          "unvalidated require-cache realpath allowance: " +
            JSON.stringify(call),
        );
      }
    } else if (call.classification === "require-cache-source-exists") {
      if (
        call.api !== "existsSync" ||
        call.argument_count !== 1 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "boolean" ||
        !exactRepositorySourceCandidate(call.input) ||
        !loadedSources.has(call.input) ||
        call.output !== "true"
      ) {
        throw new Error(
          "unvalidated require-cache source exists allowance: " +
            JSON.stringify(call),
        );
      }
    } else if (call.classification === "exact-config-stat") {
      if (
        call.api !== "statSync" ||
        call.argument_count !== 1 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "object" ||
        call.stat_options !== null ||
        (call.input !== path.join(repositoryRoot, "tsconfig.json") &&
          call.input !== typescriptPackagePath) ||
        call.output !== null
      ) {
        throw new Error(
          "unvalidated exact config stat allowance: " + JSON.stringify(call),
        );
      }
    } else if (
      call.classification === "tsx-typescript-package-stat-probe"
    ) {
      if (
        call.api !== "statSync" ||
        (call.argument_count !== 1 && call.argument_count !== 2) ||
        (call.second_argument_type !== "undefined" &&
          (call.stat_options?.keys?.join("") !== "throwIfNoEntry" ||
            call.stat_options.throw_if_no_entry !== false ||
            call.stat_options.bigint !== undefined)) ||
        call.result_type !== "object" ||
        !typescriptPackageProbePaths.has(call.input) ||
        call.output !== null
      ) {
        throw new Error(
          "unvalidated TypeScript package stat probe allowance: " +
            JSON.stringify(call),
        );
      }
    } else if (call.classification === "tsx-exact-repository-root-exists") {
      if (
        call.api !== "existsSync" ||
        call.argument_count !== 1 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "boolean" ||
        call.input !== repositoryRoot ||
        call.output !== "true"
      ) {
        throw new Error("unvalidated repository root exists allowance");
      }
    } else if (call.classification === "tsx-exact-uppercase-root-case-probe") {
      if (
        call.api !== "existsSync" ||
        call.argument_count !== 1 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "boolean" ||
        call.input !== upperCaseRootProbe ||
        call.output !== String(caseProbeExpected)
      ) {
        throw new Error("unvalidated uppercase root exists allowance");
      }
    } else if (call.classification === "tsx-exact-lexer-typescript-probe") {
      if (
        call.api !== "existsSync" ||
        call.argument_count !== 1 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "boolean" ||
        call.input !== tsxLexerTypescriptProbePath ||
        call.output !== "false"
      ) {
        throw new Error("unvalidated TSX lexer TypeScript probe allowance");
      }
    } else if (call.classification === "tsx-exact-esbuild-transform-worker") {
      if (
        call.api !== "Worker" ||
        call.argument_count !== 2 ||
        call.second_argument_type !== "object" ||
        call.result_type !== "object" ||
        call.input !== esbuildWorkerPath ||
        call.output !== null
      ) {
        throw new Error("unvalidated esbuild worker allowance");
      }
      workerOptions = call.worker_options;
      if (
        Reflect.ownKeys(workerOptions).join("\\n") !==
          [
            "keys",
            "eval",
            "worker_data_keys",
            "transfer_list_length",
            "exec_argv",
            "default_working_directory",
            "esbuild_version",
            "worker_port_transferred",
          ].join("\\n") ||
        workerOptions.keys.join("\\n") !==
          ["workerData", "transferList", "execArgv"].join("\\n") ||
        workerOptions.eval !== undefined ||
        workerOptions.worker_data_keys.join("\\n") !==
          ["workerPort", "defaultWD", "esbuildVersion"].join("\\n") ||
        workerOptions.transfer_list_length !== 1 ||
        !Array.isArray(workerOptions.exec_argv) ||
        workerOptions.exec_argv.length !== 0 ||
        workerOptions.default_working_directory !== repositoryRoot ||
        workerOptions.esbuild_version !== esbuildVersion ||
        workerOptions.worker_port_transferred !== true
      ) {
        throw new Error("unvalidated exact esbuild worker options");
      }
    } else if (call.classification === "tsx-bootstrap-effective-user-id") {
      if (
        call.api !== "geteuid" ||
        call.argument_count !== 0 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "number" ||
        call.input !== "undefined" ||
        call.output !== String(effectiveUserId)
      ) {
        throw new Error("unvalidated TSX effective user id allowance");
      }
    } else if (call.classification === "tsx-bootstrap-user-info") {
      if (
        call.api !== "os.userInfo" ||
        call.argument_count !== 0 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "object" ||
        call.input !== "undefined" ||
        call.output !== String(effectiveUserId)
      ) {
        throw new Error("unvalidated TSX user info allowance");
      }
    } else if (call.classification === "tsx-parent-ipc-pipe") {
      if (
        call.api !== "createConnection" ||
        call.argument_count !== 2 ||
        call.second_argument_type !== "function" ||
        call.result_type !== "object" ||
        call.input !== tsxParentIpcPath ||
        call.output !== null
      ) {
        throw new Error(
          "unvalidated TSX parent IPC allowance: " + JSON.stringify(call),
        );
      }
    } else if (call.classification === "tsx-parent-ipc-socket-connect") {
      if (
        call.api !== "net.Socket.prototype.connect" ||
        call.argument_count !== 1 ||
        call.second_argument_type !== "undefined" ||
        call.result_type !== "object" ||
        call.output !== null
      ) {
        throw new Error(
          "unvalidated TSX parent IPC socket allowance: " +
            JSON.stringify(call),
        );
      }
    } else {
      throw new Error("unknown loader allowance classification");
    }
    summary[call.classification] += 1;
  }
  const expectedSummary = {
    "tsx-exact-repository-root-exists": 1,
    "tsx-exact-uppercase-root-case-probe": 1,
    "tsx-exact-lexer-typescript-probe": 1,
    "tsx-exact-esbuild-transform-worker": 1,
    "tsx-parent-ipc-pipe": 1,
    "tsx-parent-ipc-socket-connect": 1,
  };
  expectedSummary[
    hasEffectiveUserIdApi
      ? "tsx-bootstrap-effective-user-id"
      : "tsx-bootstrap-user-info"
  ] = 1;
  for (const key of Object.keys(expectedSummary)) {
    if (summary[key] !== expectedSummary[key]) {
      throw new Error(
        "loader allowance count changed for " +
          key +
          ": expected=" +
          expectedSummary[key] +
          ", actual=" +
          summary[key],
      );
    }
  }
  if (
    summary["require-cache-source-read"] <= 0 ||
    summary["exact-package-or-tsconfig-read"] <= 0 ||
    summary["exact-config-stat"] <= 0 ||
    summary["require-cache-source-realpath"] <= 0 ||
    summary["require-cache-source-exists"] <= 0 ||
    summary["tsx-typescript-package-read-probe"] <= 0 ||
    summary["tsx-typescript-package-stat-probe"] <= 0 ||
    summary[
      hasEffectiveUserIdApi
        ? "tsx-bootstrap-user-info"
        : "tsx-bootstrap-effective-user-id"
    ] !== 0
  ) {
    throw new Error("validated source-loader calls unexpectedly disappeared");
  }
  return { summary, workerOptions };
}
function validatedTestBoundarySummary() {
  const expectedSummary = Object.assign(Object.create(null), {
    "current-euid": 9,
    "current-user-info": 9,
    "production-home-realpath": 9,
    "production-home-stat": 9,
    "synthetic-realpath": 153,
    "synthetic-lstat": 153,
    "root-ancestor-realpath": 54,
    "root-ancestor-stat": 54,
  });
  const expectedKeys = Reflect.ownKeys(expectedSummary);
  if (
    Reflect.ownKeys(allowedTestBoundaryCalls).join("\\n") !==
    expectedKeys.map(String).join("\\n")
  ) {
    throw new Error("test-boundary allowance shape changed");
  }
  for (const key of expectedKeys) {
    if (
      typeof key !== "string" ||
      allowedTestBoundaryCalls[key] !== expectedSummary[key]
    ) {
      throw new Error("test-boundary allowance count changed for " + key);
    }
  }
  const expectedSyntheticPaths = Array.from(
    expectedSyntheticBoundaryPathInspectionCounts.keys(),
  ).sort();
  const observedSyntheticPaths = Array.from(
    observedSyntheticBoundaryPathInspectionCounts.keys(),
  ).sort();
  if (expectedSyntheticPaths.join("\\n") !== observedSyntheticPaths.join("\\n")) {
    throw new Error("test-boundary synthetic path multiset shape changed");
  }
  let expectedSyntheticCallsPerApi = 0;
  for (const syntheticPath of expectedSyntheticPaths) {
    const expectedCount = expectedSyntheticBoundaryPathInspectionCounts.get(
      syntheticPath,
    );
    const observedCounts = observedSyntheticBoundaryPathInspectionCounts.get(
      syntheticPath,
    );
    if (
      !Number.isSafeInteger(expectedCount) ||
      expectedCount <= 0 ||
      observedCounts === undefined ||
      Reflect.ownKeys(observedCounts).join("\\n") !== "realpath\\nlstat" ||
      observedCounts.realpath !== expectedCount ||
      observedCounts.lstat !== expectedCount
    ) {
      throw new Error(
        "test-boundary synthetic path multiset count changed for " +
          syntheticPath,
      );
    }
    expectedSyntheticCallsPerApi += expectedCount;
  }
  if (expectedSyntheticCallsPerApi !== 153) {
    throw new Error("test-boundary synthetic path accounting changed");
  }
  return allowedTestBoundaryCalls;
}
(async () => {
  try {
    require("tsx/cjs");
    const runner = require(runnerPath);
    const loaderReadinessDeadline = Date.now() + 5_000;
    let loaderReady = false;
    while (Date.now() <= loaderReadinessDeadline) {
      loaderReady =
        allowedLoaderCalls.some(
          (call) => call.classification === "tsx-parent-ipc-pipe",
        ) &&
        Object.keys(require.cache).some((value) =>
          value.includes(path.sep + "tsx" + path.sep + "dist" + path.sep) &&
          /^lexer-.+\\.cjs$/.test(path.basename(value)),
        );
      if (loaderReady) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    if (!loaderReady) {
      throw new Error("validated TSX loader infrastructure was not ready");
    }
    phase = "execution";
    const receipt = await runner.runFloodgateV7OfflineConnectorGateContractComposition();
    const allowedLoader = validatedAllowedLoaderSummary();
    const allowedTestBoundary = validatedTestBoundarySummary();
    process.stdout.write(JSON.stringify({
      unexpected_enumerated_application_public_api_call_count: traps.length,
      unexpected_enumerated_application_public_api_calls: traps,
      status: receipt.status,
      boundary: "enumerated-application-public-apis-only-not-a-general-syscall-sandbox",
      validated_loader_infrastructure: [
        "validated-require-cache-source-readFileSync",
        "exact-package-and-tsconfig-readFileSync",
        "validated-require-cache-source-realpathSync",
        "validated-require-cache-source-existsSync",
        "exact-tsconfig-and-typescript-package-statSync",
        "exact-tsx-typescript-package-resolution-statSync",
        "exact-repository-and-uppercase-root-existsSync",
        "exact-tsx-lexer-typescript-probe-existsSync",
        "exact-tsx-esbuild-transform-worker",
        hasEffectiveUserIdApi
          ? "exact-tsx-bootstrap-geteuid"
          : "exact-tsx-bootstrap-userInfo",
        "exact-tsx-parent-ipc-createConnection",
        "exact-tsx-parent-ipc-Socket-connect",
      ],
      validated_loader_infrastructure_call_summary: allowedLoader.summary,
      validated_test_isolation_boundary_call_summary: allowedTestBoundary,
      worker_options: allowedLoader.workerOptions,
    }) + "\\n");
  } catch (error) {
    process.stderr.write(String(error) + "\\n" + JSON.stringify(traps) + "\\n");
    process.exitCode = 1;
  }
})();
`;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: cleanChildEnvironment({ TSX_DISABLE_CACHE: "1" }),
      timeout: 30_000,
    });

    expect(result).toMatchObject({ status: 0, signal: null, stderr: "" });
    const parsed = JSON.parse(result.stdout) as {
      readonly unexpected_enumerated_application_public_api_call_count: number;
      readonly unexpected_enumerated_application_public_api_calls: readonly string[];
      readonly status: string;
      readonly boundary: string;
      readonly validated_loader_infrastructure: readonly string[];
      readonly validated_loader_infrastructure_call_summary: Readonly<
        Record<string, number>
      >;
      readonly validated_test_isolation_boundary_call_summary: Readonly<
        Record<string, number>
      >;
      readonly worker_options: Readonly<Record<string, unknown>>;
    };
    expect(parsed).toMatchObject({
      unexpected_enumerated_application_public_api_call_count: 0,
      unexpected_enumerated_application_public_api_calls: [],
      status: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS,
      boundary:
        "enumerated-application-public-apis-only-not-a-general-syscall-sandbox",
      validated_loader_infrastructure: [
        "validated-require-cache-source-readFileSync",
        "exact-package-and-tsconfig-readFileSync",
        "validated-require-cache-source-realpathSync",
        "validated-require-cache-source-existsSync",
        "exact-tsconfig-and-typescript-package-statSync",
        "exact-tsx-typescript-package-resolution-statSync",
        "exact-repository-and-uppercase-root-existsSync",
        "exact-tsx-lexer-typescript-probe-existsSync",
        "exact-tsx-esbuild-transform-worker",
        typeof process.geteuid === "function"
          ? "exact-tsx-bootstrap-geteuid"
          : "exact-tsx-bootstrap-userInfo",
        "exact-tsx-parent-ipc-createConnection",
        "exact-tsx-parent-ipc-Socket-connect",
      ],
      validated_loader_infrastructure_call_summary: {
        "tsx-exact-repository-root-exists": 1,
        "tsx-exact-uppercase-root-case-probe": 1,
        "tsx-exact-lexer-typescript-probe": 1,
        "tsx-exact-esbuild-transform-worker": 1,
        [typeof process.geteuid === "function"
          ? "tsx-bootstrap-effective-user-id"
          : "tsx-bootstrap-user-info"]: 1,
        "tsx-parent-ipc-pipe": 1,
        "tsx-parent-ipc-socket-connect": 1,
      },
      validated_test_isolation_boundary_call_summary: {
        "current-euid": 9,
        "current-user-info": 9,
        "production-home-realpath": 9,
        "production-home-stat": 9,
        "synthetic-realpath": 153,
        "synthetic-lstat": 153,
        "root-ancestor-realpath": 54,
        "root-ancestor-stat": 54,
      },
      worker_options: {
        keys: ["workerData", "transferList", "execArgv"],
        worker_data_keys: ["workerPort", "defaultWD", "esbuildVersion"],
        transfer_list_length: 1,
        exec_argv: [],
        default_working_directory: REPOSITORY_ROOT,
        esbuild_version: ESBUILD_VERSION,
        worker_port_transferred: true,
      },
    });
    expect(
      parsed.validated_loader_infrastructure_call_summary[
        "exact-package-or-tsconfig-read"
      ],
    ).toBeGreaterThan(0);
    expect(
      parsed.validated_loader_infrastructure_call_summary["exact-config-stat"],
    ).toBeGreaterThan(0);
    expect(
      parsed.validated_loader_infrastructure_call_summary[
        "tsx-typescript-package-read-probe"
      ],
    ).toBeGreaterThan(0);
    expect(
      parsed.validated_loader_infrastructure_call_summary[
        "require-cache-source-read"
      ],
    ).toBeGreaterThan(0);
    expect(
      parsed.validated_loader_infrastructure_call_summary[
        "require-cache-source-realpath"
      ],
    ).toBeGreaterThan(0);
    expect(
      parsed.validated_loader_infrastructure_call_summary[
        "require-cache-source-exists"
      ],
    ).toBeGreaterThan(0);
    expect(
      parsed.validated_loader_infrastructure_call_summary[
        "tsx-typescript-package-stat-probe"
      ],
    ).toBeGreaterThan(0);
    expect(
      Object.values(
        parsed.validated_test_isolation_boundary_call_summary,
      ).reduce((total, count) => total + count, 0),
    ).toBe(450);
  });
});
