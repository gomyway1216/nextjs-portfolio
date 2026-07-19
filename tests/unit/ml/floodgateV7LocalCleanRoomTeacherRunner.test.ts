import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const childProcess = vi.hoisted(() => ({
  exec: vi.fn(() => {
    throw new Error("focused local-runner tests must never exec");
  }),
  execFile: vi.fn(() => {
    throw new Error("focused local-runner tests must never execFile");
  }),
  execFileSync: vi.fn(() => {
    throw new Error("focused local-runner tests must never execFileSync");
  }),
  execSync: vi.fn(() => {
    throw new Error("focused local-runner tests must never execSync");
  }),
  fork: vi.fn(() => {
    throw new Error("focused local-runner tests must never fork");
  }),
  spawn: vi.fn(() => {
    throw new Error("focused local-runner tests must never spawn a teacher");
  }),
  spawnSync: vi.fn(() => {
    throw new Error("focused local-runner tests must never spawnSync");
  }),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, ...childProcess };
});

import {
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES,
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB,
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_STATUS,
  type FloodgateV7CleanRoomRunGatesReceipt,
} from "../../../ml/floodgate-v7-clean-room-run-gates";
import {
  FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
  FLOODGATE_V7_CLEAN_ROOM_GIT_COMMAND_PREFIX,
  FLOODGATE_V7_CLEAN_ROOM_GIT_FIXED_ENVIRONMENT,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_PREPARATION_STATUS,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
  captureFloodgateV7CleanRoomEngineSpawnCoreForTests,
  captureFloodgateV7CleanRoomGitCommandCoreForTests,
  inspectFloodgateV7CleanRoomGitConfigurationCoreForTests,
  type FloodgateV7CleanRoomTeacherPreparedCapability,
} from "../../../ml/floodgate-v7-clean-room-teacher-runner";
import {
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_KEY_ID,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_PACKAGE_SCRIPT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_COMPLETION_CONTRACT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_STATUS,
  FloodgateV7LocalCleanRoomTeacherRunnerError,
  canonicalizeFloodgateV7LocalCleanRoomJsonCoreForTests,
  claimFloodgateV7LocalCleanRoomTeacherOperationalCompletion,
  runFloodgateV7LocalCheckpointLeaseOwnershipCoreForTests,
  runFloodgateV7LocalCleanRoomTeacher,
  runFloodgateV7LocalCleanRoomTeacherCoreForTests,
  writeFloodgateV7LocalCleanRoomPrivateFileCoreForTests,
  type FloodgateV7LocalCleanRoomFinalizerHandoffEvidence,
  type FloodgateV7LocalCleanRoomTeacherOperationalCompletion,
  type FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests,
} from "../../../ml/floodgate-v7-local-clean-room-teacher-runner";
import {
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_CLAIM_BOUNDARY,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_STATUS,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_SUCCESS_CONTRACT,
  runFloodgateV7LocalCleanRoomTeacherCli,
  runFloodgateV7LocalCleanRoomTeacherCliCoreForTests,
} from "../../../ml/floodgate-v7-local-clean-room-teacher-cli";

const privateWriterRoots: string[] = [];

async function privateWriterRoot(): Promise<string> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-local-private-writer-"),
    ),
  );
  await fs.promises.chmod(root, 0o700);
  privateWriterRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    privateWriterRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

function preparedCapability(): Readonly<FloodgateV7CleanRoomTeacherPreparedCapability> {
  return Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
    execution_boundary:
      "fixed-non-production-home-external-real-test-core-route" as const,
    receipt: Object.freeze({
      contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
      status: FLOODGATE_V7_CLEAN_ROOM_TEACHER_PREPARATION_STATUS,
      claim_boundary: FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY,
      execution_boundary:
        "fixed-non-production-home-external-real-test-core-route" as const,
      preparation: Object.freeze({
        fixed_clean_room: true as const,
        private_mode: "0700" as const,
        copied_trees: 4 as const,
        copied_standalone_files: 1 as const,
        copied_files: 72_718,
        copied_bytes: 1_228_115_564,
        copy_by_value_revalidated: true as const,
        parallel_tree_materializations: 4 as const,
        file_copy_concurrency_per_tree: 8 as const,
        maximum_parallel_copy_core_file_workers: 32 as const,
        git_clone_internal_io_bounded_by_copy_worker_counter: false as const,
        first_failure_stops_new_file_scheduling_within_failing_tree:
          true as const,
        first_failure_globally_cancels_other_trees_or_clone: false as const,
        started_parallel_operations_drained_before_return: true as const,
        per_file_fsync_used: false as const,
        accepted_verifier_materialized_without_local_hardlinks: true as const,
        full_role_bundle_verifier_passed: true as const,
        teacher_asset_authority_passed: true as const,
      }),
      runtime_binding: Object.freeze({
        stable_factory: "real-stable-wasm-test-core" as const,
        teacher_factory: "real-yaneuraou-usi-test-core" as const,
        engines: 12 as const,
        threads_per_engine: 1 as const,
        proposal_depth: 16 as const,
        gate_sequence: Object.freeze([
          "durable-prefix-100",
          "durable-prefix-500",
          "sealed-final-24000",
        ] as const),
        gate_execution_implemented_by_this_change: false as const,
      }),
      nonclaims: Object.freeze({
        path_or_digest_disclosed: false as const,
        crash_durable_copy: false as const,
        selection_or_final_holdout_opened: false as const,
        teacher_process: false as const,
        teacher_label: false as const,
        checkpoint: false as const,
        optimizer_training: false as const,
        weight_changed: false as const,
        live_evaluation_activation: false as const,
        match: false as const,
        playing_strength: false as const,
      }),
    }),
  });
}

function gateReceipt(
  gates: FloodgateV7CleanRoomRunGatesReceipt["gates"] = Object.freeze([
    Object.freeze({
      order: 1 as const,
      gate: "durable-prefix-100" as const,
      target_parents: 100 as const,
      completed_parents: 100 as const,
      resumed_parents: 0 as const,
      sealed: false as const,
    }),
    Object.freeze({
      order: 2 as const,
      gate: "durable-prefix-500" as const,
      target_parents: 500 as const,
      completed_parents: 500 as const,
      resumed_parents: 100 as const,
      sealed: false as const,
    }),
    Object.freeze({
      order: 3 as const,
      gate: "sealed-final-24000" as const,
      target_parents: 24_000 as const,
      completed_parents: 24_000 as const,
      resumed_parents: 500 as const,
      sealed: true as const,
    }),
  ]),
): Readonly<FloodgateV7CleanRoomRunGatesReceipt> {
  return Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
    status: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_STATUS,
    claim_boundary: "synthetic-focused-test",
    trust_boundary: "synthetic-focused-test",
    execution_boundary: "test-only-source-contract-not-operational-evidence",
    capacity: Object.freeze({
      minimum_free_gib: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB,
      threshold_passed: true as const,
      exact_available_bytes_published: false as const,
      path_or_volume_published: false as const,
    }),
    gates,
    continuity: Object.freeze({
      one_prepared_capability_consumed: true as const,
      one_parent_coordinator_created: true as const,
      one_checkpoint_handoff_claimed: true as const,
      one_authenticated_stage_work_stream: true as const,
      same_run_key_and_stage_identity: true as const,
      milestone_100_chain_equal: true as const,
      milestone_500_chain_equal: true as const,
      prefix_500_exactly_resumed_100: true as const,
      final_24000_exactly_resumed_500: true as const,
      work_bytes_strictly_increased: true as const,
      work_digest_changed_at_each_advance: true as const,
      next_authority_issued_only_after_prior_receipt: true as const,
      each_gate_authority_claimed_once: true as const,
      owner_closed_after_final_receipt: true as const,
    }),
    recovery: Object.freeze({
      failure_aborts_and_drains_started_owner: true as const,
      owner_close_joined_after_failure: true as const,
      pre_gate_absence_is_distinguished_from_partial_state: true as const,
      partial_state_is_preserved_for_reconciliation: true as const,
      automatic_partial_state_deletion: false as const,
    }),
    nonclaims: Object.freeze({
      exact_free_space_or_path: false as const,
      production_authority: false as const,
      operational_checkpoint: false as const,
      private_dataset_read: false as const,
      teacher_success: false as const,
      label_finalized: false as const,
      optimizer_training: false as const,
      weight_changed: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
      stable_high_dan: false as const,
    }),
  }) as Readonly<FloodgateV7CleanRoomRunGatesReceipt>;
}

function handoff(): Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence> {
  return Object.freeze({
    bytes: 1_024,
    sha256: "a".repeat(64),
    created_after_validated_sealed_chain: true as const,
    finalizer_invoked: false as const,
    finalizer_labels_published: false as const,
  });
}

function operations(
  events: string[],
  overrides: Partial<FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests> = {},
): Readonly<FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests> {
  const capability = preparedCapability();
  async function preflightCapacity(): Promise<void> {
    events.push("capacity");
  }
  async function prepare(): Promise<
    Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>
  > {
    events.push("prepare");
    return capability;
  }
  async function runGates(
    received: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
  ): Promise<
    Readonly<{
      readonly receipt: Readonly<FloodgateV7CleanRoomRunGatesReceipt>;
      readonly handoff: Readonly<FloodgateV7LocalCleanRoomFinalizerHandoffEvidence>;
    }>
  > {
    events.push("100");
    events.push("500");
    events.push("24000");
    events.push("handoff");
    expect(received).toBe(capability);
    return Object.freeze({ receipt: gateReceipt(), handoff: handoff() });
  }
  return Object.freeze({
    preflightCapacity,
    prepare,
    runGates,
    ...overrides,
  });
}

function cliIo(output: { stdout: string; stderr: string; exitCode?: number }) {
  return Object.freeze({
    writeStdout: (value: string): void => {
      output.stdout += value;
    },
    writeStderr: (value: string): void => {
      output.stderr += value;
    },
    setExitCode: (value: number): void => {
      output.exitCode = value;
    },
  });
}

describe("Floodgate v7 explicit local clean-room teacher runner", () => {
  it("is argumentless-only and import-safe; forbidden CLI arguments never reach a runner", async () => {
    expect(runFloodgateV7LocalCleanRoomTeacher).toHaveLength(0);
    expect(runFloodgateV7LocalCleanRoomTeacherCli).toHaveLength(0);
    expect(childProcess.spawn).not.toHaveBeenCalled();

    await expect(
      Reflect.apply(runFloodgateV7LocalCleanRoomTeacher, undefined, [
        "forbidden",
      ]),
    ).rejects.toMatchObject({
      phase: "capture",
      clean_room_may_exist: false,
      checkpoint_may_exist: false,
    });

    const runner = vi.fn(async () => {
      throw new Error("must not run");
    });
    const output = { stdout: "", stderr: "" };
    await runFloodgateV7LocalCleanRoomTeacherCliCoreForTests(
      Object.freeze(["forbidden"]),
      runner,
      cliIo(output),
    );
    expect(runner).not.toHaveBeenCalled();
    expect(output.stdout).toBe("");
    expect(JSON.parse(output.stderr)).toMatchObject({
      status: "STOP",
      phase: "capture",
      aws_used: false,
      network_used: false,
      live_weight_touched: false,
    });
    expect(output.exitCode).toBe(1);
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("fails closed on undefined, sparse, cyclic, and non-finite canonical JSON values", async () => {
    expect(
      canonicalizeFloodgateV7LocalCleanRoomJsonCoreForTests({
        z: Object.freeze([true, null]),
        a: 1,
      }),
    ).toBe('{"a":1,"z":[true,null]}');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const invalid of [
      undefined,
      Number.NaN,
      Object.freeze({ invalid: undefined }),
      Object.freeze([undefined]),
      new Array(1),
      cyclic,
    ]) {
      expect(() =>
        canonicalizeFloodgateV7LocalCleanRoomJsonCoreForTests(invalid),
      ).toThrow();
    }

    const receipt = await runFloodgateV7LocalCleanRoomTeacherCoreForTests(
      operations([]),
    );
    for (const surprise of [undefined, Object.freeze([undefined])]) {
      const output = { stdout: "", stderr: "" };
      await runFloodgateV7LocalCleanRoomTeacherCliCoreForTests(
        Object.freeze([]),
        async () =>
          Object.freeze({
            ...receipt,
            surprise,
          }) as typeof receipt,
        cliIo(output),
      );
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr)).toMatchObject({
        status: "STOP",
        phase: "capture",
      });
      expect(output.exitCode).toBe(1);
    }
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("checks the exact 20 GiB threshold before preparation and publishes only the boolean boundary", async () => {
    expect(FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB).toBe(20);
    expect(FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES).toBe(
      BigInt(20) * BigInt(1024) * BigInt(1024) * BigInt(1024),
    );
    const events: string[] = [];
    async function insufficientCapacity(): Promise<void> {
      events.push("capacity");
      throw new Error("exact available bytes must remain private");
    }
    const failure = await runFloodgateV7LocalCleanRoomTeacherCoreForTests(
      operations(events, { preflightCapacity: insufficientCapacity }),
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      phase: "capacity",
      clean_room_may_exist: false,
      checkpoint_may_exist: false,
      sensitive_values_disclosed: false,
    });
    expect(events).toEqual(["capacity"]);
    expect(JSON.stringify(failure)).not.toContain("available bytes");
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("closes the stage lease when deployment-key preparation fails before checkpoint ownership transfer", async () => {
    const events: string[] = [];
    const keyFailure = new Error(
      "synthetic deployment-key preparation failure",
    );
    async function closeUntransferredLease(): Promise<void> {
      events.push("lease-closed");
    }
    async function prepareCheckpointKey(): Promise<void> {
      events.push("key-prepare");
      throw keyFailure;
    }
    async function invokeCheckpoint(): Promise<void> {
      events.push("checkpoint");
    }

    await expect(
      runFloodgateV7LocalCheckpointLeaseOwnershipCoreForTests(
        closeUntransferredLease,
        prepareCheckpointKey,
        invokeCheckpoint,
      ),
    ).rejects.toBe(keyFailure);
    expect(events).toEqual(["key-prepare", "lease-closed"]);
  });

  it("does not double-close a stage lease after checkpoint ownership transfer", async () => {
    const events: string[] = [];
    const checkpointFailure = new Error("synthetic checkpoint failure");
    async function closeUntransferredLease(): Promise<void> {
      events.push("lease-closed");
    }
    async function prepareCheckpointKey(): Promise<void> {
      events.push("key-prepared");
    }
    async function invokeCheckpoint(): Promise<void> {
      events.push("checkpoint");
      throw checkpointFailure;
    }

    await expect(
      runFloodgateV7LocalCheckpointLeaseOwnershipCoreForTests(
        closeUntransferredLease,
        prepareCheckpointKey,
        invokeCheckpoint,
      ),
    ).rejects.toBe(checkpointFailure);
    expect(events).toEqual(["key-prepared", "checkpoint"]);
  });

  it("accepts only the exact 100 -> 500 -> 24000 same-stream receipt and keeps strength unproven", async () => {
    const events: string[] = [];
    const receipt = await runFloodgateV7LocalCleanRoomTeacherCoreForTests(
      operations(events),
    );
    expect(events).toEqual([
      "capacity",
      "prepare",
      "100",
      "500",
      "24000",
      "handoff",
    ]);
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT,
      status: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_STATUS,
      claim_boundary:
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CLAIM_BOUNDARY,
      execution_boundary: "test-only-injected-opaque-operations",
      operational_evidence: false,
      gates: [
        { gate: "durable-prefix-100", resumed_parents: 0, sealed: false },
        { gate: "durable-prefix-500", resumed_parents: 100, sealed: false },
        {
          gate: "sealed-final-24000",
          resumed_parents: 500,
          sealed: true,
        },
      ],
      finalizer_handoff_observed: true,
      nonclaims: {
        private_source_read: false,
        teacher_process: false,
        operational_checkpoint: false,
        finalizer_published: false,
        optimizer_training: false,
        live_weight_read_or_write: false,
        playing_strength: false,
      },
    });
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("fails closed on an out-of-order receipt after preparation", async () => {
    const events: string[] = [];
    const wrong = gateReceipt(
      Object.freeze([
        Object.freeze({
          order: 1 as const,
          gate: "durable-prefix-100" as const,
          target_parents: 100 as const,
          completed_parents: 100 as const,
          resumed_parents: 0 as const,
          sealed: false as const,
        }),
        Object.freeze({
          order: 2 as const,
          gate: "durable-prefix-500" as const,
          target_parents: 500 as const,
          completed_parents: 500 as const,
          resumed_parents: 0 as const,
          sealed: false as const,
        }),
        Object.freeze({
          order: 3 as const,
          gate: "sealed-final-24000" as const,
          target_parents: 24_000 as const,
          completed_parents: 24_000 as const,
          resumed_parents: 500 as const,
          sealed: true as const,
        }),
      ]) as FloodgateV7CleanRoomRunGatesReceipt["gates"],
    );
    async function wrongRunGates(
      _capability: Readonly<FloodgateV7CleanRoomTeacherPreparedCapability>,
    ) {
      events.push("wrong-gates");
      return Object.freeze({ receipt: wrong, handoff: handoff() });
    }
    const failure = await runFloodgateV7LocalCleanRoomTeacherCoreForTests(
      operations(events, { runGates: wrongRunGates }),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FloodgateV7LocalCleanRoomTeacherRunnerError);
    expect(failure).toMatchObject({
      phase: "receipt",
      clean_room_may_exist: true,
      retry_disposition: "manual-clean-room-reconciliation-required",
    });
    expect(events).toEqual(["capacity", "prepare", "wrong-gates"]);
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("keeps injected runner/CLI results test-only and rejects forged operational completion brands", async () => {
    const receipt = await runFloodgateV7LocalCleanRoomTeacherCoreForTests(
      operations([]),
    );
    const output = { stdout: "", stderr: "" };
    await runFloodgateV7LocalCleanRoomTeacherCliCoreForTests(
      Object.freeze([]),
      async () => receipt,
      cliIo(output),
    );
    const envelope = JSON.parse(output.stdout) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_SUCCESS_CONTRACT,
      status: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_STATUS,
      claim_boundary:
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_CLAIM_BOUNDARY,
      execution_boundary: "test-only-injected-cli-seam",
      operational_evidence: false,
      receipt: {
        contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT,
        operational_evidence: false,
      },
    });
    expect(output.stderr).toBe("");
    expect(output.exitCode).toBe(0);
    expect(receipt.contract).not.toBe(
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
    );

    const forged = Object.freeze({
      contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_COMPLETION_CONTRACT,
      execution_boundary:
        "one-shot-internal-real-local-run-completion" as const,
    }) as Readonly<FloodgateV7LocalCleanRoomTeacherOperationalCompletion>;
    expect(() =>
      claimFloodgateV7LocalCleanRoomTeacherOperationalCompletion(forged),
    ).toThrow(FloodgateV7LocalCleanRoomTeacherRunnerError);
    expect(() =>
      claimFloodgateV7LocalCleanRoomTeacherOperationalCompletion(
        receipt as unknown as Readonly<FloodgateV7LocalCleanRoomTeacherOperationalCompletion>,
      ),
    ).toThrow(FloodgateV7LocalCleanRoomTeacherRunnerError);

    const forgedOutput = { stdout: "", stderr: "" };
    await runFloodgateV7LocalCleanRoomTeacherCliCoreForTests(
      Object.freeze([]),
      async () =>
        Object.freeze({
          ...receipt,
          contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
        }) as unknown as typeof receipt,
      cliIo(forgedOutput),
    );
    expect(forgedOutput.stdout).toBe("");
    expect(JSON.parse(forgedOutput.stderr)).toMatchObject({
      status: "STOP",
      execution_boundary: "test-only-injected-cli-seam",
    });
    expect(forgedOutput.exitCode).toBe(1);
  });

  it("rejects private-file rename, symlink, and same-content replacement races while holding both descriptors", async () => {
    const successRoot = await privateWriterRoot();
    const successFile = path.join(successRoot, "success.bin");
    const successBytes = Buffer.from("private-writer-success", "utf8");
    const evidence =
      await writeFloodgateV7LocalCleanRoomPrivateFileCoreForTests(
        successFile,
        successBytes,
      );
    expect(evidence.bytes).toBe(successBytes.byteLength);
    expect(await fs.promises.readFile(successFile)).toEqual(successBytes);
    successBytes.fill(0);

    const cases = ["rename", "symlink", "same-content"] as const;
    for (const race of cases) {
      const root = await privateWriterRoot();
      const filename = path.join(root, `${race}.bin`);
      const moved = path.join(root, `${race}.held`);
      const bytes = Buffer.from("private-local-integrity-material", "utf8");
      await expect(
        writeFloodgateV7LocalCleanRoomPrivateFileCoreForTests(
          filename,
          bytes,
          async () => {
            await fs.promises.rename(filename, moved);
            if (race === "symlink") {
              await fs.promises.symlink(moved, filename);
            } else if (race === "same-content") {
              await fs.promises.writeFile(filename, bytes, { mode: 0o600 });
              await fs.promises.chmod(filename, 0o600);
            }
          },
        ),
      ).rejects.toThrow();
      bytes.fill(0);
    }
  });

  it("captures exact allowlisted Git and engine child contracts", () => {
    const git = captureFloodgateV7CleanRoomGitCommandCoreForTests(
      Object.freeze([
        "clone",
        "--quiet",
        "--no-local",
        "--no-checkout",
        "--no-tags",
        "--",
        "/private/source",
        "/private/destination",
      ]),
    );
    expect(git.file).toBe("/usr/bin/git");
    expect(git.options.cwd).toBe("/");
    expect(git.options.maxBuffer).toBe(64 * 1024 * 1024);
    expect(git.options.env).toEqual(
      FLOODGATE_V7_CLEAN_ROOM_GIT_FIXED_ENVIRONMENT,
    );
    expect(
      git.arguments.slice(0, FLOODGATE_V7_CLEAN_ROOM_GIT_COMMAND_PREFIX.length),
    ).toEqual(FLOODGATE_V7_CLEAN_ROOM_GIT_COMMAND_PREFIX);
    expect(git.arguments).toContain("core.hooksPath=/dev/null");
    expect(git.arguments).toContain("credential.helper=");
    expect(git.arguments).toContain("protocol.allow=never");
    expect(git.arguments).toContain("protocol.file.allow=always");
    expect(
      Object.keys(git.options.env).some((key) =>
        /AWS|FIREBASE|VERCEL|PROXY|SSH|CREDENTIAL/iu.test(key),
      ),
    ).toBe(false);
    const preparationSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "floodgate-v7-clean-room-teacher-runner.ts",
      ),
      "utf8",
    );
    expect(preparationSource).toContain('"--no-dangling"');
    expect(preparationSource).toContain('"--missing=print"');
    expect(preparationSource).toContain("partialclonefilter");
    expect(
      inspectFloodgateV7CleanRoomGitConfigurationCoreForTests(
        "http.postBuffer",
      ),
    ).toBe("ALLOWED");
    for (const configuration of [
      "http.extraHeader",
      "http.proxy",
      "http.sslCert",
      "https.proxy",
      "remote.origin.proxy",
      "credential.helper",
      "url.https://example.invalid/.insteadOf",
    ]) {
      expect(
        inspectFloodgateV7CleanRoomGitConfigurationCoreForTests(configuration),
      ).toBe("FORBIDDEN");
    }
    expect(() =>
      inspectFloodgateV7CleanRoomGitConfigurationCoreForTests(
        "http.postBuffer\nhttp.extraHeader",
      ),
    ).toThrow();

    const snapshotParent =
      "/private/tmp/shogi-floodgate-v7-clean-room-teacher-v1/runtime/snapshots";
    const snapshot = path.join(snapshotParent, "shogi-teacher-runtime-focused");
    const worker = path.join(snapshot, "workers", "worker-00");
    const engine = captureFloodgateV7CleanRoomEngineSpawnCoreForTests(
      path.join(snapshot, "engine", "yaneuraou"),
      Object.freeze([]),
      {
        cwd: path.join(worker, "cwd"),
        env: Object.freeze({
          HOME: path.join(worker, "home"),
          TMPDIR: path.join(worker, "tmp"),
          LANG: "C",
          LC_ALL: "C",
          PATH: "/usr/bin:/bin",
          TZ: "UTC",
        }),
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        detached: true,
      },
      snapshotParent,
    );
    expect(engine.arguments).toEqual([]);
    expect(engine.options.cwd).toBe(path.join(worker, "cwd"));
    expect(engine.options.env).toEqual({
      HOME: path.join(worker, "home"),
      TMPDIR: path.join(worker, "tmp"),
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      TZ: "UTC",
    });
    expect(() =>
      captureFloodgateV7CleanRoomEngineSpawnCoreForTests(
        engine.file,
        Object.freeze([]),
        {
          ...engine.options,
          env: Object.freeze({
            ...engine.options.env,
            AWS_SECRET_ACCESS_KEY: "forbidden",
          }),
        },
        snapshotParent,
      ),
    ).toThrow("spawn options differ");
  });

  it("binds a private local integrity key and cannot hand off before the validated sealed final receipt", () => {
    const localSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "floodgate-v7-local-clean-room-teacher-runner.ts",
      ),
      "utf8",
    );
    const gateSource = fs.readFileSync(
      path.join(process.cwd(), "ml", "floodgate-v7-clean-room-run-gates.ts"),
      "utf8",
    );
    const entrySource = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "run-floodgate-v7-local-clean-room-teacher.ts",
      ),
      "utf8",
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_KEY_ID).not.toContain(
      "deployment",
    );
    expect(FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_KEY_ID).toBe(
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
    );
    expect(localSource).toContain("const LOCAL_KEY_BYTES = 32");
    expect(localSource).toContain('"local-integrity-key.bin"');
    expect(localSource).toContain("external_credential: false");
    expect(localSource).toContain("randomBytes(LOCAL_KEY_BYTES)");
    expect(localSource).toContain("integrityKey?.fill(0)");
    expect(localSource).toContain("FLOODGATE_V7_DEPLOYMENT_KEY_ID");
    expect(localSource).toContain(
      "prepareFloodgateV7DeploymentTeacherCheckpointV3Key",
    );
    expect(localSource).toContain("checkpointFloodgateV7TeacherParentsV3(");
    expect(localSource).toContain("authorizeFloodgateTeacherStage(");
    expect(localSource).toContain("withVerifiedPinnedFloodgateTrainingRows(");
    expect(localSource).toContain("run_binding_sha256");
    expect(localSource).not.toContain(
      "checkpointFloodgateV7TeacherParentsV3CoreForTests(",
    );
    expect(localSource).not.toContain(
      "authorizeFloodgateTeacherStageCoreForTests(",
    );
    expect(localSource).not.toContain(
      "withVerifiedPinnedFloodgateTrainingRowsCoreForTests(",
    );
    expect(localSource).toContain("receipts.length !== 3");
    expect(localSource).toContain("final.sealed !== true");
    expect(localSource).toContain("final.work.completed_parents !== 24_000");
    expect(localSource).toContain("final.work.resumed_parents !== 500");
    expect(gateSource.indexOf("validateReceiptChain(chain)")).toBeGreaterThan(
      -1,
    );
    expect(gateSource.indexOf("validateReceiptChain(chain)")).toBeLessThan(
      gateSource.indexOf("await handoff.close()"),
    );
    expect(gateSource.indexOf("await handoff.close()")).toBeLessThan(
      gateSource.indexOf("finalizeSealedChainHandoff()"),
    );
    expect(entrySource).toContain("if (require.main === module)");
    expect(
      packageJson.scripts?.[
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_PACKAGE_SCRIPT
      ],
    ).toBe("node -r tsx/cjs ml/run-floodgate-v7-local-clean-room-teacher.ts");
    expect(localSource).not.toContain(
      'from "./floodgate-v7-production-connector',
    );
    for (const forbidden of [
      "amazonaws",
      "AWS_",
      "firebase-functions",
      "production-native-launcher",
      "shogi-nnue-weights.bin",
      "node:http",
      "node:https",
      "node:net",
    ]) {
      expect(localSource).not.toContain(forbidden);
    }
    expect(FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT).toBe(
      "/private/tmp/shogi-floodgate-v7-clean-room-teacher-v1",
    );
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });
});
