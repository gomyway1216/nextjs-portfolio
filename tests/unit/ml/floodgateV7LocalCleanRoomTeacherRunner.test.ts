import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

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
  FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
  FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_PREPARATION_STATUS,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
  type FloodgateV7CleanRoomTeacherPreparedCapability,
} from "../../../ml/floodgate-v7-clean-room-teacher-runner";
import {
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_KEY_ID,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_PACKAGE_SCRIPT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
  FloodgateV7LocalCleanRoomTeacherRunnerError,
  runFloodgateV7LocalCleanRoomTeacher,
  runFloodgateV7LocalCleanRoomTeacherCoreForTests,
  type FloodgateV7LocalCleanRoomFinalizerHandoffEvidence,
  type FloodgateV7LocalCleanRoomTeacherRunnerOperationsForTests,
} from "../../../ml/floodgate-v7-local-clean-room-teacher-runner";
import {
  runFloodgateV7LocalCleanRoomTeacherCli,
  runFloodgateV7LocalCleanRoomTeacherCliCoreForTests,
} from "../../../ml/floodgate-v7-local-clean-room-teacher-cli";

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

  it("accepts only the exact 100 -> 500 -> 24000 same-stream receipt and keeps strength unproven", async () => {
    const events: string[] = [];
    const receipt =
      await runFloodgateV7LocalCleanRoomTeacherCoreForTests(
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
      contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
      stack_boundary: {
        teacher_training_and_ab: "local-machine",
        aws_required: false,
        aws_used: false,
        network_used: false,
        cloud_credentials_used: false,
        production_worktree_used: false,
      },
      preparation: {
        pinned_verifier_revision:
          FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
      },
      capacity: {
        minimum_free_gib: 20,
        checked_before_private_copy: true,
        checked_again_before_teacher_process: true,
        exact_available_bytes_published: false,
      },
      gates: [
        { gate: "durable-prefix-100", resumed_parents: 0, sealed: false },
        { gate: "durable-prefix-500", resumed_parents: 100, sealed: false },
        {
          gate: "sealed-final-24000",
          resumed_parents: 500,
          sealed: true,
        },
      ],
      completion_receipts: {
        count: 3,
        exact_run_key_and_stage_continuity_verified: true,
      },
      finalizer_handoff: {
        created_after_validated_sealed_chain: true,
        finalizer_invoked: false,
      },
      nonclaims: {
        optimizer_training: false,
        formal_ab: false,
        live_weight_read_or_write: false,
        playing_strength: false,
        stable_high_dan: false,
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
    expect(failure).toBeInstanceOf(
      FloodgateV7LocalCleanRoomTeacherRunnerError,
    );
    expect(failure).toMatchObject({
      phase: "receipt",
      clean_room_may_exist: true,
      retry_disposition: "manual-clean-room-reconciliation-required",
    });
    expect(events).toEqual(["capacity", "prepare", "wrong-gates"]);
    expect(childProcess.spawn).not.toHaveBeenCalled();
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
      path.join(
        process.cwd(),
        "ml",
        "floodgate-v7-clean-room-run-gates.ts",
      ),
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
    expect(localSource).toContain('const LOCAL_KEY_BYTES = 32');
    expect(localSource).toContain('"local-integrity-key.bin"');
    expect(localSource).toContain("external_credential: false");
    expect(localSource).toContain("randomBytes(LOCAL_KEY_BYTES)");
    expect(localSource).toContain("rootKey?.fill(0)");
    expect(localSource).toContain("receipts.length !== 3");
    expect(localSource).toContain("final.sealed !== true");
    expect(localSource).toContain(
      "final.work.completed_parents !== 24_000",
    );
    expect(localSource).toContain("final.work.resumed_parents !== 500");
    expect(gateSource.indexOf("validateReceiptChain(chain)")).toBeGreaterThan(
      -1,
    );
    expect(
      gateSource.indexOf("validateReceiptChain(chain)"),
    ).toBeLessThan(
      gateSource.indexOf("finalizeSealedChainHandoff()"),
    );
    expect(entrySource).toContain("if (require.main === module)");
    expect(packageJson.scripts?.[
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_PACKAGE_SCRIPT
    ]).toBe(
      "node -r tsx/cjs ml/run-floodgate-v7-local-clean-room-teacher.ts",
    );
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
