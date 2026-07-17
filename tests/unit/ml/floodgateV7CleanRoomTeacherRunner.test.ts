import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
  FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
  FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
  FLOODGATE_V7_CLEAN_ROOM_TEACHER_TEST_PREPARATION_STATUS,
  FloodgateV7CleanRoomTeacherPreparationError,
  captureFloodgateV7CleanRoomTeacherPlanCoreForTests,
  createFloodgateV7CleanRoomParentCoordinator,
  createFloodgateV7CleanRoomParentCoordinatorCoreForTests,
  inspectFloodgateV7CleanRoomTeacherRunnerContract,
  prepareFloodgateV7CleanRoomTeacherRunCoreForTests,
  type FloodgateV7CleanRoomTeacherPlanForTests,
  type FloodgateV7CleanRoomTeacherPreparationDependencies,
} from "../../../ml/floodgate-v7-clean-room-teacher-runner";
import {
  FLOODGATE_V7_CLEAN_ROOM_COPY_CLAIM_BOUNDARY,
  FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
  FLOODGATE_V7_CLEAN_ROOM_COPY_STATUS,
  type FloodgateV7CleanRoomCopyReceipt,
} from "../../../ml/floodgate-v7-clean-room-copy";
import type { FloodgateV7ProductionParentCoordinator } from "../../../ml/floodgate-v7-production-parent-coordinator";
import type { FloodgateTrainingRowConsumerOptions } from "../../../ml/floodgate-training-row-consumer";

const roots: string[] = [];
const effectiveUserId = process.geteuid?.() ?? 501;

async function privateTemporaryDirectory(prefix: string): Promise<string> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix)),
  );
  await fs.promises.chmod(root, 0o700);
  roots.push(root);
  return root;
}

async function fixture(): Promise<
  Readonly<{
    home: string;
    cleanParent: string;
    cleanRoot: string;
    plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  }>
> {
  const home = await privateTemporaryDirectory("floodgate-v7-fake-home-");
  const cleanParent = await privateTemporaryDirectory(
    "floodgate-v7-clean-parent-",
  );
  const cleanRoot = path.join(cleanParent, "run");
  const plan = captureFloodgateV7CleanRoomTeacherPlanCoreForTests(
    home,
    effectiveUserId,
    cleanRoot,
  );
  return Object.freeze({ home, cleanParent, cleanRoot, plan });
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

function successfulDependencies(
  events: string[],
  verified: {
    bundle?: Readonly<FloodgateTrainingRowConsumerOptions>;
    assetRoot?: string;
  } = {},
): Readonly<FloodgateV7CleanRoomTeacherPreparationDependencies> {
  async function materializeVerifierRepository(
    _sourceRepository: string,
    destinationRepository: string,
    _revision: string,
    _effectiveUserId: number,
  ): Promise<void> {
    events.push("materialize");
    await fs.promises.mkdir(
      path.join(destinationRepository, "ml"),
      { recursive: true, mode: 0o700 },
    );
    await fs.promises.chmod(destinationRepository, 0o700);
    await fs.promises.chmod(
      path.join(destinationRepository, "ml"),
      0o700,
    );
  }
  async function copyTree(
    sourceRoot: string,
    _destinationRoot: string,
    _effectiveUserId: number,
  ): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
    events.push(`tree:${path.basename(sourceRoot)}`);
    return copyReceipt(2, 10, 1);
  }
  async function copyFile(
    _sourceFile: string,
    _destinationFile: string,
    _effectiveUserId: number,
  ): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
    events.push("legacy");
    return copyReceipt(1, 5, 0, 1);
  }
  async function verifyBundle(
    options: Readonly<FloodgateTrainingRowConsumerOptions>,
  ): Promise<void> {
    events.push("verify-bundle");
    verified.bundle = options;
  }
  async function verifyAssets(
    assetRoot: string,
    _effectiveUserId: number,
  ): Promise<void> {
    events.push("verify-assets");
    verified.assetRoot = assetRoot;
  }
  return Object.freeze({
    materializeVerifierRepository,
    copyTree,
    copyFile,
    verifyBundle,
    verifyAssets,
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

async function waitForBarrier(
  barrier: Promise<void>,
  timeoutMs = 5_000,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      barrier,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("synthetic barrier timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.promises.rm(root, { force: true, recursive: true }),
    ),
  );
});

describe("Floodgate v7 clean-room teacher runner preparation", () => {
  it("captures the fixed revision, fixed three-gate schedule, and home-external target tree", async () => {
    const value = await fixture();

    expect(value.plan.verifierRevision).toBe(
      FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
    );
    expect(value.plan.gateSequence).toBe(
      FLOODGATE_V7_CLEAN_ROOM_GATE_SEQUENCE,
    );
    expect(value.plan.gateSequence).toEqual([
      "durable-prefix-100",
      "durable-prefix-500",
      "sealed-final-24000",
    ]);
    for (const target of Object.values(value.plan.targets)) {
      expect(path.relative(value.cleanRoot, target)).not.toMatch(
        /^(?:\.\.(?:\/|$)|\/)/u,
      );
    }
    for (const source of Object.values(value.plan.sources)) {
      expect(path.relative(value.home, source)).not.toMatch(
        /^(?:\.\.(?:\/|$)|\/)/u,
      );
    }
    expect(value.cleanRoot.startsWith(value.home)).toBe(false);
  });

  it("inspects the argumentless fixed contract without mutating the clean-room root", async () => {
    const before = await fs.promises
      .lstat(FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT, { bigint: true })
      .catch(() => null);

    const receipt = inspectFloodgateV7CleanRoomTeacherRunnerContract();

    const after = await fs.promises
      .lstat(FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT, { bigint: true })
      .catch(() => null);
    expect(inspectFloodgateV7CleanRoomTeacherRunnerContract.length).toBe(0);
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
      claim_boundary: FLOODGATE_V7_CLEAN_ROOM_TEACHER_CLAIM_BOUNDARY,
      status: "fixed-source-only-contract-no-operator-command",
      contract_binding: {
        argumentless_fixed_plan: true,
        accepted_verifier_revision_fixed: true,
        gate_execution_implemented_by_this_change: false,
      },
      nonclaims: {
        private_source_read: false,
        clean_room_created: false,
        teacher_process: false,
        weight_changed: false,
        live_evaluation_activation: false,
      },
    });
    expect(after).toEqual(before);

    const failure = (() => {
      try {
        (
          inspectFloodgateV7CleanRoomTeacherRunnerContract as (
            value: string,
          ) => unknown
        )("forbidden");
      } catch (error) {
        return error;
      }
      throw new Error("expected rejection");
    })();
    expect(failure).toMatchObject({
      phase: "capture",
      clean_room_may_exist: false,
      sensitive_values_disclosed: false,
    });
  });

  it("prepares all fixed inputs, verifies both authorities, and returns only a sanitized capability", async () => {
    const value = await fixture();
    const events: string[] = [];
    const verified: {
      bundle?: Readonly<FloodgateTrainingRowConsumerOptions>;
      assetRoot?: string;
    } = {};

    const capability =
      await prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
        value.plan,
        successfulDependencies(events, verified),
      );

    expect(capability.receipt).toMatchObject({
      contract: FLOODGATE_V7_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
      status: FLOODGATE_V7_CLEAN_ROOM_TEACHER_TEST_PREPARATION_STATUS,
      execution_boundary:
        "test-only-injected-home-external-preparation-route",
      preparation: {
        copied_trees: 4,
        copied_standalone_files: 1,
        copied_files: 9,
        copied_bytes: 45,
        copy_by_value_revalidated: true,
        parallel_tree_materializations: 4,
        file_copy_concurrency_per_tree: 8,
        maximum_parallel_copy_core_file_workers: 32,
        git_clone_internal_io_bounded_by_copy_worker_counter: false,
        first_failure_stops_new_file_scheduling_within_failing_tree:
          true,
        first_failure_globally_cancels_other_trees_or_clone: false,
        started_parallel_operations_drained_before_return: true,
        per_file_fsync_used: false,
        full_role_bundle_verifier_passed: true,
        teacher_asset_authority_passed: true,
      },
      runtime_binding: {
        stable_factory: "real-stable-wasm-test-core",
        teacher_factory: "real-yaneuraou-usi-test-core",
        engines: 12,
        threads_per_engine: 1,
        proposal_depth: 16,
        gate_execution_implemented_by_this_change: false,
      },
      nonclaims: {
        path_or_digest_disclosed: false,
        crash_durable_copy: false,
        teacher_process: false,
        teacher_label: false,
        optimizer_training: false,
        weight_changed: false,
        live_evaluation_activation: false,
      },
    });
    expect(events).toEqual([
      "tree:floodgate-q1-2026-raw-lock",
      "tree:floodgate-q1-2026-role-lock-v1",
      "tree:floodgate-q1-2026-label-free-role-bundle-v2",
      "tree:shogi-production-teacher-assets-v1",
      "materialize",
      "legacy",
      "verify-bundle",
      "verify-assets",
    ]);
    expect(verified.bundle).toEqual({
      repositoryRoot: value.plan.targets.verifierRepository,
      verifierRevision: value.plan.verifierRevision,
      rawLockRoot: value.plan.targets.rawLockRoot,
      roleLockRoot: value.plan.targets.roleLockRoot,
      legacyProtectedPositionIdsPath:
        value.plan.targets.legacyProtectedPositionIdsPath,
      outputRoot: value.plan.targets.roleBundleRoot,
    });
    expect(verified.assetRoot).toBe(value.plan.targets.assetRoot);
    expect(JSON.stringify(capability.receipt)).not.toContain(value.home);
    expect(JSON.stringify(capability.receipt)).not.toContain(value.cleanRoot);
    expect(Object.isFrozen(capability)).toBe(true);
    expect(capability.execution_boundary).toBe(
      "test-only-injected-home-external-preparation-route",
    );
    expect(
      Number(
        (
          await fs.promises.lstat(value.cleanRoot, { bigint: true })
        ).mode & BigInt(0o7777),
      ),
    ).toBe(0o700);
  });

  it("waits for every parallel materialization to settle before returning a sanitized failure", async () => {
    const value = await fixture();
    const secret = "private-materialization-secret";
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let treeCalls = 0;
    let started = 0;
    let settled = 0;
    let resolveAllStarted: (() => void) | undefined;
    const allStarted = new Promise<void>((resolve) => {
      resolveAllStarted = resolve;
    });
    const markStarted = (): void => {
      started += 1;
      if (started === 5) resolveAllStarted?.();
    };
    function materializeVerifierRepository(
      _sourceRepository: string,
      _destinationRepository: string,
      _revision: string,
      _effectiveUserId: number,
    ): Promise<void> {
      markStarted();
      return gate.then(() => {
        settled += 1;
      });
    }
    function copyTree(
      _sourceRoot: string,
      _destinationRoot: string,
      _effectiveUserId: number,
    ): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
      markStarted();
      treeCalls += 1;
      if (treeCalls === 2) {
        settled += 1;
        throw new Error(secret);
      }
      return gate.then(() => {
        settled += 1;
        return copyReceipt(1, 1);
      });
    }
    async function copyFile(
      _sourceFile: string,
      _destinationFile: string,
      _effectiveUserId: number,
    ): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
      throw new Error("must not copy the legacy input");
    }
    async function verifyBundle(
      _options: Readonly<FloodgateTrainingRowConsumerOptions>,
    ): Promise<void> {
      throw new Error("must not verify");
    }
    async function verifyAssets(
      _assetRoot: string,
      _effectiveUserId: number,
    ): Promise<void> {
      throw new Error("must not verify");
    }
    const run = prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
      value.plan,
      Object.freeze({
        materializeVerifierRepository,
        copyTree,
        copyFile,
        verifyBundle,
        verifyAssets,
      }),
    );
    await waitForBarrier(allStarted);
    const startedBeforeRelease = started;
    const settledBeforeRelease = settled;
    release?.();

    const failure = await rejectionOf(run);

    expect(startedBeforeRelease).toBe(5);
    expect(settledBeforeRelease).toBe(1);
    expect(settled).toBe(5);
    expect(failure).toBeInstanceOf(
      FloodgateV7CleanRoomTeacherPreparationError,
    );
    expect(failure).toMatchObject({
      phase: "materialization",
      clean_room_may_exist: true,
      retry_disposition: "manual-clean-room-reconciliation-required",
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(
      (await fs.promises.lstat(value.cleanRoot)).isDirectory(),
    ).toBe(true);
  });

  it("drains a pending verifier when the second verifier throws synchronously", async () => {
    const value = await fixture();
    const base = successfulDependencies([]);
    const secret = "private-verifier-sync-throw";
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    let settled = 0;
    let resolveAllStarted: (() => void) | undefined;
    const allStarted = new Promise<void>((resolve) => {
      resolveAllStarted = resolve;
    });
    const markStarted = (): void => {
      started += 1;
      if (started === 2) resolveAllStarted?.();
    };
    function verifyBundle(
      _options: Readonly<FloodgateTrainingRowConsumerOptions>,
    ): Promise<void> {
      markStarted();
      return gate.then(() => {
        settled += 1;
      });
    }
    function verifyAssets(
      _assetRoot: string,
      _effectiveUserId: number,
    ): Promise<void> {
      markStarted();
      settled += 1;
      throw new Error(secret);
    }
    const run = prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
      value.plan,
      Object.freeze({
        ...base,
        verifyBundle,
        verifyAssets,
      }),
    );
    await waitForBarrier(allStarted);
    const startedBeforeRelease = started;
    const settledBeforeRelease = settled;
    release?.();

    const failure = await rejectionOf(run);

    expect(startedBeforeRelease).toBe(2);
    expect(settledBeforeRelease).toBe(1);
    expect(settled).toBe(2);
    expect(failure).toMatchObject({
      phase: "verification",
      clean_room_may_exist: true,
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(secret);
  });

  it("rejects accessor dependencies and forged plans before creating a namespace", async () => {
    const accessorFixture = await fixture();
    let getterCalls = 0;
    const dependencies = {
      materializeVerifierRepository: async function (
        _sourceRepository: string,
        _destinationRepository: string,
        _revision: string,
        _effectiveUserId: number,
      ): Promise<void> {},
      copyFile: async function (
        _sourceFile: string,
        _destinationFile: string,
        _effectiveUserId: number,
      ): Promise<Readonly<FloodgateV7CleanRoomCopyReceipt>> {
        return copyReceipt(1, 1);
      },
      verifyBundle: async function (
        _options: Readonly<FloodgateTrainingRowConsumerOptions>,
      ): Promise<void> {},
      verifyAssets: async function (
        _assetRoot: string,
        _effectiveUserId: number,
      ): Promise<void> {},
      get copyTree(): FloodgateV7CleanRoomTeacherPreparationDependencies["copyTree"] {
        getterCalls += 1;
        throw new Error("private getter detail");
      },
    };
    const accessorFailure = await rejectionOf(
      prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
        accessorFixture.plan,
        dependencies,
      ),
    );
    expect(getterCalls).toBe(0);
    expect(accessorFailure).toMatchObject({
      phase: "capture",
      clean_room_may_exist: false,
    });
    await expect(
      fs.promises.lstat(accessorFixture.cleanRoot),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const forgedFixture = await fixture();
    const forged = Object.freeze({
      ...forgedFixture.plan,
    }) as Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
    const forgedFailure = await rejectionOf(
      prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
        forged,
        successfulDependencies([]),
      ),
    );
    expect(forgedFailure).toMatchObject({
      phase: "capture",
      clean_room_may_exist: false,
    });
    await expect(
      fs.promises.lstat(forgedFixture.cleanRoot),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("hands the prepared plan to a coordinator factory exactly once", async () => {
    const value = await fixture();
    const capability =
      await prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
        value.plan,
        successfulDependencies([]),
      );
    const coordinator = Object.freeze({
      marker: "synthetic coordinator",
    }) as unknown as FloodgateV7ProductionParentCoordinator;
    let received:
      | Readonly<FloodgateV7CleanRoomTeacherPlanForTests>
      | undefined;
    async function createCoordinator(
      plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
    ): Promise<FloodgateV7ProductionParentCoordinator> {
      received = plan;
      return coordinator;
    }
    const dependencies = Object.freeze({ createCoordinator });

    await expect(
      createFloodgateV7CleanRoomParentCoordinator(capability),
    ).rejects.toMatchObject({
      phase: "capability",
      clean_room_may_exist: true,
    });
    expect(received).toBeUndefined();
    await expect(
      createFloodgateV7CleanRoomParentCoordinatorCoreForTests(
        capability,
        dependencies,
      ),
    ).resolves.toBe(coordinator);
    expect(received).toBe(value.plan);
    await expect(
      createFloodgateV7CleanRoomParentCoordinatorCoreForTests(
        capability,
        dependencies,
      ),
    ).rejects.toMatchObject({
      phase: "capability",
      clean_room_may_exist: true,
    });
  });

  it("sanitizes an asynchronous coordinator failure and consumes the capability", async () => {
    const value = await fixture();
    const capability =
      await prepareFloodgateV7CleanRoomTeacherRunCoreForTests(
        value.plan,
        successfulDependencies([]),
      );
    const secret = "private-coordinator-rejection-path";
    let factoryCalls = 0;
    async function createCoordinator(
      _plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
    ): Promise<FloodgateV7ProductionParentCoordinator> {
      factoryCalls += 1;
      throw new Error(secret);
    }
    const dependencies = Object.freeze({ createCoordinator });

    const failure = await rejectionOf(
      createFloodgateV7CleanRoomParentCoordinatorCoreForTests(
        capability,
        dependencies,
      ),
    );

    expect(factoryCalls).toBe(1);
    expect(failure).toMatchObject({
      phase: "capability",
      clean_room_may_exist: true,
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);
    await expect(
      createFloodgateV7CleanRoomParentCoordinatorCoreForTests(
        capability,
        dependencies,
      ),
    ).rejects.toMatchObject({ phase: "capability" });
    expect(factoryCalls).toBe(1);
  });

  it("pins the independent clone and real test-core factories without adding an operator command", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "ml",
        "floodgate-v7-clean-room-teacher-runner.ts",
      ),
      "utf8",
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(source).toContain(
      `"${FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION}"`,
    );
    expect(source).toContain('"--no-local"');
    expect(source).toContain('"alternates"');
    expect(source).toContain("destination.nlink !== BigInt(1)");
    expect(source).toContain(
      "createFloodgateProductionStableWasmRuntimeCoreForTests",
    );
    expect(source).toContain(
      "createFloodgateProductionTeacherUsiRuntimeCoreForTests",
    );
    expect(source).toContain(
      "createFloodgateV7ProductionParentCoordinatorCoreForTests",
    );
    expect(source).toContain("const testPreparedPlans");
    expect(source).toContain("const fixedPreparedPlans");
    expect(source).toContain("const testCapturedPlans");
    expect(source).toContain("const fixedCapturedPlans");
    expect(source).not.toContain(
      'from "./floodgate-v7-production-connector"',
    );
    expect(source).not.toContain(
      'from "./floodgate-v7-production-checkpoint-runner"',
    );
    expect(source).not.toContain(
      'from "./floodgate-v7-production-stage-control"',
    );
    expect(
      Object.keys(packageJson.scripts ?? {}).some((key) =>
        key.includes("clean-room"),
      ),
    ).toBe(false);
  });
});
