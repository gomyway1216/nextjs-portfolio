import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// This file isolates the run-owner composition contract. The actual
// deployment-key V3 receipt provenance registry is exercised in
// floodgateV7TeacherCheckpoint.test.ts; manual receipts below are accepted
// only through this explicit module mock and are never authentication proof.
vi.mock(
  "../../../ml/floodgate-v7-teacher-checkpoint",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../ml/floodgate-v7-teacher-checkpoint")
      >();
    return {
      ...actual,
      claimFloodgateV7DeploymentKeyTeacherCheckpointV3ReceiptCoreForTests:
        function claimSyntheticCompositionReceipt(
          receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
        ): Readonly<FloodgateV7TeacherCheckpointV3Receipt> {
          return receipt;
        },
    };
  },
);

import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
} from "../../../ml/floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES,
  FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB,
  FloodgateV7CleanRoomRunGateError,
  claimFloodgateV7CleanRoomRunGateCoreForTests,
  runFloodgateV7CleanRoomRunGatesFromPreparedGrantCoreForTests,
  statfsFloodgateV7CleanRoomRunGateCoreForTests,
  type FloodgateV7CleanRoomRunGateDependenciesForTests,
  type FloodgateV7CleanRoomRunGateFailureEvidenceForTests,
} from "../../../ml/floodgate-v7-clean-room-run-gates";
import {
  captureFloodgateV7CleanRoomTeacherPlanCoreForTests,
  prepareFloodgateV7CleanRoomTeacherRunCoreForTests,
  runFloodgateV7CleanRoomTeacherGatesCoreForTests,
  type FloodgateV7CleanRoomTeacherPlanForTests,
  type FloodgateV7CleanRoomTeacherPreparationDependencies,
} from "../../../ml/floodgate-v7-clean-room-teacher-runner";
import {
  FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY,
  FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
  FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS,
  type FloodgateV7CleanRoomCopyReceipt,
} from "../../../ml/floodgate-v7-clean-room-copy";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "../../../ml/floodgate-v7-deployment-key-authority";
import type { FloodgateV7ProductionRuntimeOwnerCoreDependencies } from "../../../ml/floodgate-v7-production-runtime-owner";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  type FloodgateV7TeacherCheckpointV3Gate,
  type FloodgateV7TeacherCheckpointV3Receipt,
} from "../../../ml/floodgate-v7-teacher-checkpoint";
import type {
  FloodgateTrainingParent,
  FloodgateTrainingRowConsumerOptions,
} from "../../../ml/floodgate-training-row-consumer";

const roots: string[] = [];
const effectiveUserId = process.geteuid?.() ?? 501;
const STABLE_RUNTIME_DIGEST = "c".repeat(64);
const RUNTIME_RECEIPT_DIGEST_DOMAIN = "shogi-floodgate-v7-runtime-receipt-v1\0";
const MILESTONE_100_MAC = "a".repeat(64);
const MILESTONE_500_MAC = "b".repeat(64);

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

interface RuntimeCalls {
  coordinator: number;
  stableClose: number;
  teacherClose: number;
  teacherAbort: number;
}

interface TestFixture {
  readonly plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  readonly capability: Awaited<
    ReturnType<typeof prepareFloodgateV7CleanRoomTeacherRunCoreForTests>
  >;
}

async function privateTemporaryDirectory(prefix: string): Promise<string> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix)),
  );
  await fs.promises.chmod(root, 0o700);
  roots.push(root);
  return root;
}

function copyReceipt(
  files: number,
  bytes: number,
  directories = 0,
  concurrency = 8,
): Readonly<FloodgateV7CleanRoomCopyReceipt> {
  return Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
    status: FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS,
    claim_boundary: FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY,
    execution_boundary: "non-production-copy-by-value-preparation" as const,
    copied: Object.freeze({
      directories,
      files,
      bytes,
      source_revalidated_after_copy: true as const,
      destination_revalidated_after_copy: true as const,
      destination_files_single_link: true as const,
      source_destination_inode_aliases: 0 as const,
      filesystem_clone_api_used: false as const,
      file_copy_concurrency_limit: concurrency,
      per_file_fsync_used: false as const,
    }),
    nonclaims: Object.freeze({
      source_path: false as const,
      destination_path: false as const,
      source_or_tree_digest: false as const,
      crash_durable_copy: false as const,
      dataset_semantics: false as const,
      holdout_opened: false as const,
      teacher_process: false as const,
      teacher_label: false as const,
      optimizer_training: false as const,
      weight_changed: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function preparationDependencies(): Readonly<FloodgateV7CleanRoomTeacherPreparationDependencies> {
  async function materializeVerifierRepository(
    _sourceRepository: string,
    destinationRepository: string,
    _revision: string,
    _effectiveUserId: number,
  ): Promise<void> {
    await fs.promises.mkdir(path.join(destinationRepository, "ml"), {
      recursive: true,
      mode: 0o700,
    });
    await fs.promises.chmod(destinationRepository, 0o700);
    await fs.promises.chmod(path.join(destinationRepository, "ml"), 0o700);
  }
  async function copyTree(
    _sourceRoot: string,
    _destinationRoot: string,
    _effectiveUserId: number,
  ): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
    return copyReceipt(2, 10, 1);
  }
  async function copyFile(
    _sourceFile: string,
    _destinationFile: string,
    _effectiveUserId: number,
  ): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
    return copyReceipt(1, 5, 0, 1);
  }
  async function verifyBundle(
    _options: Readonly<FloodgateTrainingRowConsumerOptions>,
  ): Promise<void> {}
  async function verifyAssets(
    _assetRoot: string,
    _effectiveUserId: number,
  ): Promise<void> {}
  return Object.freeze({
    materializeVerifierRepository,
    copyTree,
    copyFile,
    verifyBundle,
    verifyAssets,
  });
}

async function fixture(): Promise<Readonly<TestFixture>> {
  const home = await privateTemporaryDirectory(
    "floodgate-v7-run-gates-fake-home-",
  );
  const cleanParent = await privateTemporaryDirectory(
    "floodgate-v7-run-gates-clean-parent-",
  );
  const plan = captureFloodgateV7CleanRoomTeacherPlanCoreForTests(
    home,
    effectiveUserId,
    path.join(cleanParent, "run"),
  );
  const capability = await prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
    plan,
    preparationDependencies(),
  );
  return Object.freeze({ plan, capability });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function teacherReceipt(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-assets-and-runtime-dependencies",
    asset_authority_execution_boundary:
      "production-fixed-registry-and-deployment-root",
    engine_id: "YaneuraOu NNUE 9.60git 64APPLEM1",
    runtime: Object.freeze({
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
    }),
    fixed_options: Object.freeze([
      "EvalDir=<private-shared-snapshot>/eval",
      "FV_SCALE=20",
      "USI_Hash=64",
      "Threads=1",
      "USI_OwnBook=false",
      "BookFile=no_book",
      "NetworkDelay=0",
      "NetworkDelay2=0",
    ]),
    timeouts: Object.freeze({
      usiMs: 15_000,
      readyMs: 120_000,
      searchMs: 600_000,
      termGraceMs: 500,
      killGraceMs: 1_000,
    }),
    limits: Object.freeze({
      lineBytes: 64 * 1024,
      stdoutBytesPerPhase: 16 * 1024 * 1024,
      stdoutLinesPerPhase: 65_536,
      stderrBytesTotal: 8 * 1024 * 1024,
    }),
    snapshot: Object.freeze({
      one_shared_private_snapshot: true,
      source_authority_revalidated: true,
      destination_revalidated: true,
      engine: Object.freeze({
        ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou,
        mode: "0500",
      }),
      eval: Object.freeze({
        ...FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn,
        mode: "0400",
      }),
    }),
  });
}

function runtimeOwnerDependencies(
  calls: RuntimeCalls,
): Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies> {
  const receipt = teacherReceipt();
  const teacherRuntimeDigest = sha256(
    `${RUNTIME_RECEIPT_DIGEST_DOMAIN}${canonicalJson(receipt)}`,
  );
  const stable = Object.freeze({
    receipt: Object.freeze({ synthetic: true }),
    propose: Object.freeze(async function propose(
      _parent: Readonly<FloodgateTrainingParent>,
    ): Promise<never> {
      throw new Error("synthetic stable proposal must not run");
    }),
    close: Object.freeze(async function close(): Promise<void> {
      calls.stableClose += 1;
    }),
  }) as unknown as StableRuntime;
  const teacher = Object.freeze({
    receipt,
    poisoned: false,
    propose: Object.freeze(async function propose(
      _sfen: string,
      _legalMoveCount: number,
    ): Promise<never> {
      throw new Error("synthetic teacher proposal must not run");
    }),
    rescore: Object.freeze(async function rescore(
      _sfen: string,
      _move: string,
    ): Promise<never> {
      throw new Error("synthetic teacher rescore must not run");
    }),
    close: Object.freeze(async function close(): Promise<void> {
      calls.teacherClose += 1;
    }),
    abortAndReap: Object.freeze(async function abortAndReap(): Promise<void> {
      calls.teacherAbort += 1;
    }),
  }) as unknown as TeacherRuntime;
  return Object.freeze({
    createStableRuntime:
      function createStableRuntime(): Promise<StableRuntime> {
        calls.coordinator += 1;
        return Promise.resolve(stable);
      },
    createTeacherRuntime:
      function createTeacherRuntime(): Promise<TeacherRuntime> {
        return Promise.resolve(teacher);
      },
    getStableRuntimeReceiptDigest: function getStableRuntimeReceiptDigest(
      runtime: StableRuntime,
    ): string {
      expect(runtime).toBe(stable);
      return STABLE_RUNTIME_DIGEST;
    },
    getTeacherRuntimeReceiptDigest: function getTeacherRuntimeReceiptDigest(
      runtime: TeacherRuntime,
    ): string {
      expect(runtime).toBe(teacher);
      return teacherRuntimeDigest;
    },
  });
}

function gateReceipt(
  gate: FloodgateV7TeacherCheckpointV3Gate,
  runId: string,
  overrides: Readonly<{
    readonly stageIno?: string;
    readonly resumedParents?: number;
  }> = {},
): Readonly<FloodgateV7TeacherCheckpointV3Receipt> {
  const prefix100 =
    gate === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100;
  const prefix500 =
    gate === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500;
  const target = prefix100 ? 100 : prefix500 ? 500 : 24_000;
  const resumed =
    overrides.resumedParents ?? (prefix100 ? 0 : prefix500 ? 100 : 500);
  const records = prefix100 ? 102 : prefix500 ? 503 : 24_004;
  const work = Object.freeze({
    filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    format: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
    training_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
    records,
    bytes: prefix100 ? 1_000 : prefix500 ? 5_000 : 240_000,
    sha256: (prefix100 ? "1" : prefix500 ? "2" : "3").repeat(64),
    target_parents: target,
    completed_parents: target,
    resumed_parents: resumed,
    durability: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
    milestone_100_mac: MILESTONE_100_MAC,
    milestone_500_mac: prefix100 ? null : MILESTONE_500_MAC,
  });
  return Object.freeze({
    contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    status:
      prefix100 || prefix500
        ? FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS
        : FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
    algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
    run_id: runId,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    gate,
    gate_contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
    sealed: !(prefix100 || prefix500),
    stage: Object.freeze({
      basename: "clean-room-v7-stage",
      parent_dev: "1",
      parent_ino: "2",
      dev: "1",
      ino: overrides.stageIno ?? "3",
    }),
    work,
  }) as Readonly<FloodgateV7TeacherCheckpointV3Receipt>;
}

function exactCapacityStatfs(): Promise<
  Readonly<{ readonly bsize: bigint; readonly bavail: bigint }>
> {
  const bsize = BigInt(4096);
  return Promise.resolve(
    Object.freeze({
      bsize,
      bavail: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES / bsize,
    }),
  );
}

function successfulRunDependencies(
  calls: RuntimeCalls,
  observedGates: FloodgateV7TeacherCheckpointV3Gate[],
  runIds: string[],
  runBindings: unknown[],
): Readonly<FloodgateV7CleanRoomRunGateDependenciesForTests> {
  async function statfs(
    _cleanRoomFilesystemPath: string,
  ): Promise<Readonly<{ readonly bsize: bigint; readonly bavail: bigint }>> {
    return exactCapacityStatfs();
  }
  async function executeAuthenticatedCheckpointGate(
    capability: Parameters<
      FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"]
    >[0],
  ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
    const claim = claimFloodgateV7CleanRoomRunGateCoreForTests(capability);
    observedGates.push(claim.gate);
    runIds.push(claim.runId);
    runBindings.push(claim.runBinding);
    expect(() =>
      claimFloodgateV7CleanRoomRunGateCoreForTests(capability),
    ).toThrow(FloodgateV7CleanRoomRunGateError);
    return gateReceipt(claim.gate, claim.runId);
  }
  return Object.freeze({
    statfs,
    runtimeOwnerDependencies: runtimeOwnerDependencies(calls),
    executeAuthenticatedCheckpointGate,
    observeFailureForTests: undefined,
  });
}

async function rejectionOf(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error("expected rejection");
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

describe("Floodgate v7 clean-room source/test gate owner", () => {
  it("consumes one prepared capability and proves one exact continuous 100/500/24000 receipt chain", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const gates: FloodgateV7TeacherCheckpointV3Gate[] = [];
    const runIds: string[] = [];
    const runBindings: unknown[] = [];
    const dependencies = successfulRunDependencies(
      calls,
      gates,
      runIds,
      runBindings,
    );

    const receipt = await runFloodgateV7CleanRoomTeacherGatesCoreForTests(
      value.capability,
      dependencies,
    );

    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
      execution_boundary: "test-only-source-contract-not-operational-evidence",
      capacity: {
        minimum_free_gib: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB,
        threshold_passed: true,
        exact_available_bytes_published: false,
        path_or_volume_published: false,
      },
      gates: [
        {
          gate: "durable-prefix-100",
          resumed_parents: 0,
          sealed: false,
        },
        {
          gate: "durable-prefix-500",
          resumed_parents: 100,
          sealed: false,
        },
        {
          gate: "sealed-final-24000",
          resumed_parents: 500,
          sealed: true,
        },
      ],
      continuity: {
        one_prepared_capability_consumed: true,
        one_parent_coordinator_created: true,
        one_checkpoint_handoff_claimed: true,
        one_authenticated_stage_work_stream: true,
        each_gate_authority_claimed_once: true,
      },
      nonclaims: {
        production_authority: false,
        teacher_success: false,
        weight_changed: false,
        live_evaluation_activation: false,
        stable_high_dan: false,
      },
    });
    expect(gates).toEqual([
      "durable-prefix-100",
      "durable-prefix-500",
      "sealed-final-24000",
    ]);
    expect(new Set(runIds)).toHaveLength(1);
    expect(runIds[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(runBindings)).toHaveLength(1);
    expect(calls).toEqual({
      coordinator: 1,
      stableClose: 1,
      teacherClose: 1,
      teacherAbort: 0,
    });
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(value.plan.cleanRoomRoot);
    expect(serialized).not.toContain(runIds[0]);
    expect(serialized).not.toContain(MILESTONE_100_MAC);
    expect(serialized).not.toContain(MILESTONE_500_MAC);

    await expect(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "capture",
      work_state_may_exist: false,
    });
    expect(calls.coordinator).toBe(1);
  });

  it("fails below the exact 20 GiB threshold before coordinator creation and preserves an empty-state retry disposition", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    async function statfs(
      _cleanRoomFilesystemPath: string,
    ): Promise<Readonly<{ readonly bsize: bigint; readonly bavail: bigint }>> {
      return Object.freeze({
        bsize: BigInt(1),
        bavail:
          FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES - BigInt(1),
      });
    }
    async function executeForbidden(
      _capability: Parameters<
        FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"]
      >[0],
    ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
      throw new Error("checkpoint must not start below threshold");
    }
    const dependencies = Object.freeze({
      statfs,
      runtimeOwnerDependencies: runtimeOwnerDependencies(calls),
      executeAuthenticatedCheckpointGate: executeForbidden,
      observeFailureForTests: undefined,
    });

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(failure).toMatchObject({
      phase: "capacity",
      work_state_may_exist: false,
      work_state_disposition: "definitely-absent-fresh-retry-allowed",
      cleanup_failure_count: 0,
      sensitive_values_disclosed: false,
    });
    expect(calls.coordinator).toBe(0);
    expect(JSON.stringify(failure)).not.toContain(value.plan.cleanRoomRoot);
  });

  it("classifies a nonempty prepared work namespace as preserved partial state without starting an owner", async () => {
    const value = await fixture();
    await fs.promises.writeFile(
      path.join(value.plan.targets.stateRoot, "preserved-state"),
      "synthetic",
      { mode: 0o600 },
    );
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const dependencies = successfulRunDependencies(calls, [], [], []);

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(failure).toMatchObject({
      phase: "capacity",
      work_state_may_exist: true,
      work_state_disposition: "preserved-partial-reconciliation-required",
    });
    expect(calls.coordinator).toBe(0);
    expect(
      await fs.promises.readFile(
        path.join(value.plan.targets.stateRoot, "preserved-state"),
        "utf8",
      ),
    ).toBe("synthetic");
  });

  it("uses the existing self-cleaning runtime owner when one coordinator factory side rejects", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const base = successfulRunDependencies(calls, [], [], []);
    const secret = `${value.plan.cleanRoomRoot}/teacher-factory-rejection`;
    const runtimeDependencies = base.runtimeOwnerDependencies;
    const failingRuntimeDependencies = Object.freeze({
      ...runtimeDependencies,
      createTeacherRuntime: function createTeacherRuntime(): Promise<never> {
        return Promise.reject(new Error(secret));
      },
    });
    const dependencies = Object.freeze({
      ...base,
      runtimeOwnerDependencies: failingRuntimeDependencies,
    });

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(failure).toMatchObject({
      phase: "coordinator",
      work_state_may_exist: false,
      work_state_disposition: "definitely-absent-fresh-retry-allowed",
      cleanup_failure_count: 0,
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(calls.coordinator).toBe(1);
    expect(calls.stableClose).toBe(1);
    expect(calls.teacherClose).toBe(0);
    expect(calls.teacherAbort).toBe(0);
  });

  it("aborts, drains, and closes after a claimed gate failure while keeping the partial state for reconciliation", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const evidence: FloodgateV7CleanRoomRunGateFailureEvidenceForTests[] = [];
    const gates: FloodgateV7TeacherCheckpointV3Gate[] = [];
    const secret = `${value.plan.cleanRoomRoot}/secret-checkpoint-failure`;
    async function statfs(
      _cleanRoomFilesystemPath: string,
    ): Promise<Readonly<{ readonly bsize: bigint; readonly bavail: bigint }>> {
      return exactCapacityStatfs();
    }
    async function executeAuthenticatedCheckpointGate(
      capability: Parameters<
        FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"]
      >[0],
    ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
      const claim = claimFloodgateV7CleanRoomRunGateCoreForTests(capability);
      gates.push(claim.gate);
      if (
        claim.gate ===
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500
      ) {
        await fs.promises.writeFile(
          path.join(value.plan.targets.stateRoot, "executor-output"),
          "preserve",
          { mode: 0o600 },
        );
        throw new Error(secret);
      }
      return gateReceipt(claim.gate, claim.runId);
    }
    function observeFailureForTests(
      value: Readonly<FloodgateV7CleanRoomRunGateFailureEvidenceForTests>,
    ): void {
      evidence.push(value);
    }
    const dependencies = Object.freeze({
      statfs,
      runtimeOwnerDependencies: runtimeOwnerDependencies(calls),
      executeAuthenticatedCheckpointGate,
      observeFailureForTests,
    });

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(gates).toEqual(["durable-prefix-100", "durable-prefix-500"]);
    expect(failure).toMatchObject({
      phase: "durable-prefix-500",
      work_state_may_exist: true,
      work_state_disposition: "preserved-partial-reconciliation-required",
      cleanup_failure_count: 0,
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(evidence).toEqual([
      {
        phase: "durable-prefix-500",
        work_state_may_exist: true,
        work_state_disposition: "preserved-partial-reconciliation-required",
        cleanup_failure_count: 0,
        sensitive_values_disclosed: false,
      },
    ]);
    expect(calls.coordinator).toBe(1);
    expect(calls.teacherAbort).toBe(1);
    expect(calls.stableClose).toBe(1);
    // Parent-coordinator close joins the already-started abort lifecycle.
    expect(calls.teacherClose).toBe(0);
  });

  it("keeps work state definitely absent when the first executor rejects without claiming its authority", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const base = successfulRunDependencies(calls, [], [], []);
    async function executeWithoutClaim(
      _capability: Parameters<
        FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"]
      >[0],
    ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
      throw new Error("synthetic pre-claim failure");
    }
    const dependencies = Object.freeze({
      ...base,
      executeAuthenticatedCheckpointGate: executeWithoutClaim,
    });

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(failure).toMatchObject({
      phase: "durable-prefix-100",
      work_state_may_exist: false,
      work_state_disposition: "definitely-absent-fresh-retry-allowed",
    });
    expect(calls.teacherAbort).toBe(1);
    expect(calls.stableClose).toBe(1);
    expect(calls.teacherClose).toBe(0);
  });

  it("preserves partial state when an executor writes output and rejects before claiming", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const base = successfulRunDependencies(calls, [], [], []);
    async function writeThenRejectBeforeClaim(
      _capability: Parameters<
        FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"]
      >[0],
    ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
      await fs.promises.writeFile(
        path.join(value.plan.targets.stateRoot, "unclaimed-output"),
        "preserve",
        { mode: 0o600 },
      );
      throw new Error("synthetic output-before-claim failure");
    }
    const dependencies = Object.freeze({
      ...base,
      executeAuthenticatedCheckpointGate: writeThenRejectBeforeClaim,
    });

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(failure).toMatchObject({
      phase: "durable-prefix-100",
      work_state_may_exist: true,
      work_state_disposition: "preserved-partial-reconciliation-required",
    });
    expect(
      await fs.promises.readFile(
        path.join(value.plan.targets.stateRoot, "unclaimed-output"),
        "utf8",
      ),
    ).toBe("preserve");
    expect(calls.teacherAbort).toBe(1);
  });

  it("does not downgrade an empty replacement directory whose identity changed after executor start", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const base = successfulRunDependencies(calls, [], [], []);
    async function replaceStateThenReject(
      _capability: Parameters<
        FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"]
      >[0],
    ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
      await fs.promises.rename(
        value.plan.targets.stateRoot,
        `${value.plan.targets.stateRoot}-replaced`,
      );
      await fs.promises.mkdir(value.plan.targets.stateRoot, { mode: 0o700 });
      await fs.promises.chmod(value.plan.targets.stateRoot, 0o700);
      throw new Error("synthetic empty identity replacement");
    }
    const dependencies = Object.freeze({
      ...base,
      executeAuthenticatedCheckpointGate: replaceStateThenReject,
    });

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(failure).toMatchObject({
      phase: "durable-prefix-100",
      work_state_may_exist: true,
      work_state_disposition: "preserved-partial-reconciliation-required",
    });
    expect(
      (await fs.promises.readdir(value.plan.targets.stateRoot)).length,
    ).toBe(0);
    expect(calls.teacherAbort).toBe(1);
  });

  it("rejects a broken cross-gate stage identity after the authority is consumed and drains the owner", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const gates: FloodgateV7TeacherCheckpointV3Gate[] = [];
    async function statfs(
      _cleanRoomFilesystemPath: string,
    ): Promise<Readonly<{ readonly bsize: bigint; readonly bavail: bigint }>> {
      return exactCapacityStatfs();
    }
    async function executeAuthenticatedCheckpointGate(
      capability: Parameters<
        FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"]
      >[0],
    ): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
      const claim = claimFloodgateV7CleanRoomRunGateCoreForTests(capability);
      gates.push(claim.gate);
      if (
        claim.gate ===
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000
      ) {
        await fs.promises.writeFile(
          path.join(value.plan.targets.stateRoot, "synthetic-final-output"),
          "preserve",
          { mode: 0o600 },
        );
      }
      return gateReceipt(
        claim.gate,
        claim.runId,
        claim.gate ===
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000
          ? { stageIno: "4" }
          : {},
      );
    }
    const dependencies = Object.freeze({
      statfs,
      runtimeOwnerDependencies: runtimeOwnerDependencies(calls),
      executeAuthenticatedCheckpointGate,
      observeFailureForTests: undefined,
    });

    const failure = await rejectionOf(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    );

    expect(gates).toEqual([
      "durable-prefix-100",
      "durable-prefix-500",
      "sealed-final-24000",
    ]);
    expect(failure).toMatchObject({
      phase: "sealed-final-24000",
      work_state_may_exist: true,
    });
    expect(calls.teacherAbort).toBe(1);
    expect(calls.stableClose).toBe(1);
    expect(calls.teacherClose).toBe(0);
  });

  it("validates immutable dependencies before consuming the prepared capability", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const valid = successfulRunDependencies(calls, [], [], []);
    const invalid = {
      ...valid,
    } as FloodgateV7CleanRoomRunGateDependenciesForTests;

    await expect(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        invalid,
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    await expect(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(value.capability, valid),
    ).resolves.toMatchObject({
      contract: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
    });
    expect(calls.coordinator).toBe(1);
  });

  it("rejects a direct prepared-plan bypass while leaving the real PR1 capability usable", async () => {
    const value = await fixture();
    const calls: RuntimeCalls = {
      coordinator: 0,
      stableClose: 0,
      teacherClose: 0,
      teacherAbort: 0,
    };
    const dependencies = successfulRunDependencies(calls, [], [], []);

    await expect(
      runFloodgateV7CleanRoomRunGatesFromPreparedGrantCoreForTests(
        value.plan as never,
        dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "capture",
      work_state_may_exist: false,
    });
    await expect(
      runFloodgateV7CleanRoomTeacherGatesCoreForTests(
        value.capability,
        dependencies,
      ),
    ).resolves.toMatchObject({
      contract: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
    });
    expect(calls.coordinator).toBe(1);
  });

  it("offers a bigint native statfs adapter without publishing the measured value", async () => {
    const root = await privateTemporaryDirectory(
      "floodgate-v7-run-gates-statfs-",
    );

    const value = await statfsFloodgateV7CleanRoomRunGateCoreForTests(root);

    expect(typeof value.bsize).toBe("bigint");
    expect(typeof value.bavail).toBe("bigint");
    expect(value.bsize).toBeGreaterThan(BigInt(0));
    expect(value.bavail).toBeGreaterThanOrEqual(BigInt(0));
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("keeps reviewed gate evidence intact while isolating the explicit local package entrypoint", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "ml", "floodgate-v7-clean-room-run-gates.ts"),
      "utf8",
    );
    const preparationSource = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "floodgate-v7-clean-room-teacher-runner.ts",
      ),
      "utf8",
    );
    const japanese = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs",
        "blog-shogi-floodgate-v7-clean-room-run-gates.md",
      ),
      "utf8",
    );
    const english = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs",
        "blog-shogi-floodgate-v7-clean-room-run-gates.en.md",
      ),
      "utf8",
    );
    const evidence = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "docs",
          "data",
          "floodgate-v7-clean-room-run-gates-2026-07-18.json",
        ),
        "utf8",
      ),
    ) as {
      runtime_exports?: Record<string, unknown>;
      ownership?: Record<string, unknown>;
      gate_chain?: Record<string, unknown>;
      authentication_reuse?: Record<string, unknown>;
      recovery?: Record<string, unknown>;
      operational_state?: Record<string, unknown>;
      nonclaims?: Record<string, unknown>;
    };
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(source).toContain(
      "claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests",
    );
    expect(source).not.toContain(
      "claimFloodgateV7ProductionParentCoordinatorForCheckpoint(",
    );
    expect(source).not.toContain(
      'from "./floodgate-v7-production-checkpoint-connector"',
    );
    expect(source).not.toContain("process.argv");
    expect(source).not.toContain("require.main");
    expect(preparationSource).toContain(
      "runFloodgateV7CleanRoomTeacherGatesCoreForTests",
    );
    expect(preparationSource).toContain(
      "runFloodgateV7CleanRoomTeacherGates(",
    );
    expect(japanese).toContain("100件 → 500件 → 24,000件");
    expect(japanese).toContain("definitely-absent-fresh-retry-allowed");
    expect(english).toContain("100 → 500 → 24,000");
    expect(english).toContain("preserved-partial-reconciliation-required");
    expect(evidence.runtime_exports).toMatchObject({
      execution_boundary: "test-only-source-contract-not-operational-evidence",
      package_script_added: false,
      cli_added: false,
      production_authority_function_imported: false,
      fixed_private_entrypoint: false,
      opaque_pr1_prepared_run_grant_required: true,
      arbitrary_prepared_plan_entrypoint: false,
    });
    expect(evidence.ownership).toMatchObject({
      pr1_plan_carried_by_private_weakmap: true,
      same_shape_grant_is_authority: false,
      arbitrary_coordinator_factory_accepted: false,
      existing_self_cleaning_parent_coordinator_core_reused: true,
    });
    expect(evidence.gate_chain).toMatchObject({
      same_shape_is_authority: false,
      second_claim_allowed: false,
      successful_deployment_key_v3_receipt_exact_identity_required: true,
      successful_receipt_claimed_once: true,
      forged_or_cloned_receipt_allowed: false,
      replayed_receipt_allowed: false,
      raw_root_key_test_core_receipt_allowed: false,
      one_authenticated_stage_work_stream_required: true,
      run_id_stage_identity_mac_or_digest_published: false,
    });
    expect(evidence.authentication_reuse).toMatchObject({
      v3_receipt_registered_only_after_checkpoint_success: true,
      v3_receipt_registered_only_after_lease_close: true,
      real_v3_receipt_provenance_tested_separately: true,
      injected_executor_receipt_is_operational_evidence: false,
    });
    expect(evidence.recovery).toMatchObject({
      executor_invocation_sets_partial_conservatively: true,
      post_executor_absent_downgrade_requires_abort_drain_and_close_success: true,
      post_executor_absent_downgrade_requires_same_preflight_directory_identities: true,
      post_executor_absent_downgrade_requires_empty_publication_and_state: true,
      output_then_reject_preserves_partial: true,
      empty_directory_identity_replacement_preserves_partial: true,
    });
    expect(evidence.operational_state).toMatchObject({
      real_private_copy_runs: 0,
      real_private_inputs_read: 0,
      teacher_processes_started: 0,
      teacher_rows_created: 0,
      training_runs: 0,
      live_weights_changed: false,
      production_activations: 0,
    });
    expect(evidence.nonclaims).toMatchObject({
      teacher_generation_started: false,
      stable_high_dan_strength_established: false,
    });
    expect(
      packageJson.scripts?.["shogi:floodgate-v7-local-clean-room-teacher"],
    ).toBe(
      "node -r tsx/cjs ml/run-floodgate-v7-local-clean-room-teacher.ts",
    );
  });
});
