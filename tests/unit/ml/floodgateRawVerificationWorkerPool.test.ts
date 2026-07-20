import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_RAW_LOCK_USER_AGENT,
  FLOODGATE_RAW_RECEIPT_SCHEMA,
  floodgateRawObjectPath,
  floodgateRawReceiptPath,
  floodgateRawUrlSha256,
  serializeFloodgateRawReceipt,
  verifyExistingFloodgateRawReceipt,
  type FloodgateRawReceipt,
} from "../../../ml/floodgate-raw-lock";
import {
  FLOODGATE_RAW_VERIFICATION_PRODUCTION_WORKER_COUNT,
  FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
  floodgateRawVerificationActiveWorkerCountCoreForTests,
  mapFloodgateOrderedWorkersCoreForTests,
  verifyFloodgateRawReceiptsWithInjectedWorkerCoreForTests,
  verifyFloodgateRawReceiptsWithOrderedWorkersCoreForTests,
  verifyFloodgateRawReceiptsWithPinnedWorkersCoreForTests,
  type FloodgateRawVerificationWorkerMetrics,
  type FloodgateRawVerificationProductionDependencies,
} from "../../../ml/floodgate-raw-verification-worker-pool";
import {
  capturePinnedFloodgateRawVerificationWorkerBundle,
  type FloodgateRawVerificationWorkerBundleLease,
} from "../../../ml/floodgate-raw-verification-worker-source";
import type {
  FloodgateRawVerificationTaskInput,
  FloodgateRawVerificationTaskResult,
} from "../../../ml/floodgate-raw-verification-worker-protocol";

const temporaryRoots: string[] = [];
const faultWorkerPath = path.join(
  repositoryRoot(),
  "tests/fixtures/ml/floodgateRawVerificationFaultWorker.js",
);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function csaUrl(index: number): string {
  const minute = Math.floor(index / 60);
  const second = index % 60;
  const timestamp = `2026010101${String(minute).padStart(2, "0")}${String(
    second,
  ).padStart(2, "0")}`;
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+Alpha${index}+Beta${index}+${timestamp}.csa`;
}

function receipt(url: string, body: Uint8Array): FloodgateRawReceipt {
  const digest = sha256(body);
  return {
    schema: FLOODGATE_RAW_RECEIPT_SCHEMA,
    kind: "csa",
    url,
    url_sha256: floodgateRawUrlSha256(url),
    request: {
      accept_encoding: "identity",
      redirect: "manual",
      user_agent: FLOODGATE_RAW_LOCK_USER_AGENT,
    },
    response: {
      url,
      status: 200,
      content_encoding: null,
      bytes: body.byteLength,
      sha256: digest,
    },
    object: floodgateRawObjectPath(digest),
  };
}

async function temporaryRoot(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-raw-workers-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  return root;
}

async function writeRelative(
  root: string,
  relative: string,
  bytes: Uint8Array | string,
): Promise<void> {
  const target = path.join(root, ...relative.split("/"));
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, bytes, { flag: "wx" });
}

async function fixture(count: number): Promise<
  Readonly<{
    root: string;
    tasks: readonly FloodgateRawVerificationTaskInput[];
  }>
> {
  const root = await temporaryRoot();
  const tasks: FloodgateRawVerificationTaskInput[] = [];
  for (let index = 0; index < count; index += 1) {
    const url = csaUrl(index);
    const body = new TextEncoder().encode(`fixture CSA bytes ${index}\n`);
    const value = receipt(url, body);
    await writeRelative(root, value.object, body);
    await writeRelative(
      root,
      floodgateRawReceiptPath(url),
      serializeFloodgateRawReceipt(value),
    );
    tasks.push({ receipt_kind: "csa", url });
  }
  return Object.freeze({ root, tasks: Object.freeze(tasks) });
}

async function serialResults(
  root: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  const results: FloodgateRawVerificationTaskResult[] = [];
  for (const task of tasks) {
    const verified = await verifyExistingFloodgateRawReceipt(
      root,
      task.url,
      task.receipt_kind,
    );
    results.push({
      receipt_kind: "csa",
      receipt: verified.receipt,
    });
  }
  return results;
}

function faultTasks(
  count: number,
): readonly FloodgateRawVerificationTaskInput[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({ receipt_kind: "csa" as const, url: csaUrl(index) }),
    ),
  );
}

async function runInjectedFault(
  scenario: string,
  tasks: readonly FloodgateRawVerificationTaskInput[] = faultTasks(1),
  workers = 1,
  taskTimeoutMs = 250,
  shutdownTimeoutMs = 100,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  return verifyFloodgateRawReceiptsWithInjectedWorkerCoreForTests(
    repositoryRoot(),
    tasks,
    workers,
    {
      workerPath: faultWorkerPath,
      workerData: { scenario },
      taskTimeoutMs,
      shutdownTimeoutMs,
    },
  );
}

function expectNoInjectedWorkerLeak(): void {
  expect(floodgateRawVerificationActiveWorkerCountCoreForTests()).toBe(0);
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate ordered raw-verification worker pool", () => {
  it("connects production only through the fixed pinned-worker entrypoint", () => {
    const productionVerifier = fs.readFileSync(
      path.join(repositoryRoot(), "ml/floodgate-raw-lock-verifier.ts"),
      "utf8",
    );
    const workerPool = fs.readFileSync(
      path.join(
        repositoryRoot(),
        "ml/floodgate-raw-verification-worker-pool.ts",
      ),
      "utf8",
    );
    const roleLock = fs.readFileSync(
      path.join(repositoryRoot(), "ml/floodgate-role-lock.ts"),
      "utf8",
    );
    expect(productionVerifier).toContain(
      "verifyFloodgateRawReceiptsWithPinnedOrderedWorkers",
    );
    expect(roleLock).toContain(
      "verifyFloodgateRawLockCandidateWithPinnedWorkers",
    );
    expect(roleLock).not.toMatch(
      /import\s*\{\s*verifyFloodgateRawLockCandidate\s*\}/u,
    );
    expect(workerPool).toContain(
      "workerSource: `(function () {\\n${bundle.source}\\n})();`",
    );
    expect(workerPool).toContain("assertExactCleanRevision");
    expect(FLOODGATE_RAW_VERIFICATION_PRODUCTION_WORKER_COUNT).toBe(12);
  });

  it("keeps the current loaded worker source distinct from the historical semantic verifier", async () => {
    const runnerRoot = repositoryRoot();
    const historicalVerifierRoot = path.join(
      os.homedir(),
      ".codex/worktrees/shogi-floodgate-role-bundle",
    );
    const historicalRevision = "e8a9197608cb48b1160b6707d97b0c4f78f90a1d";
    const currentRunnerRevision = "f".repeat(40);
    expect(runnerRoot).not.toBe(historicalVerifierRoot);
    expect(currentRunnerRevision).not.toBe(historicalRevision);

    const strengthFirstRunner = fs.readFileSync(
      path.join(runnerRoot, "ml/floodgate-strength-first-teacher-runner.ts"),
      "utf8",
    );
    const roleLock = fs.readFileSync(
      path.join(runnerRoot, "ml/floodgate-role-lock.ts"),
      "utf8",
    );
    const workerPool = fs.readFileSync(
      path.join(runnerRoot, "ml/floodgate-raw-verification-worker-pool.ts"),
      "utf8",
    );
    expect(strengthFirstRunner).toContain(historicalRevision);
    expect(strengthFirstRunner).toContain(
      '".codex",\n    "worktrees",\n    "shogi-floodgate-role-bundle"',
    );
    expect(roleLock).toContain(
      "await assertVerifierGitClosure(\n    repositoryRoot,\n    verifierRevision,",
    );
    expect(workerPool).toContain(
      'const repositoryRoot = path.resolve(__dirname, "..");',
    );

    const roots: string[] = [];
    await verifyFloodgateRawReceiptsWithPinnedWorkersCoreForTests(
      runnerRoot,
      runnerRoot,
      [],
      {
        captureBundle: (root) => {
          roots.push(`bundle:${root}`);
          return {
            source: '"use strict";',
            identity: { runtime: {} },
            assertUnchangedAndClose: () => undefined,
          } as unknown as FloodgateRawVerificationWorkerBundleLease;
        },
        captureExactCleanRevision: async (root) => {
          roots.push(`capture:${root}`);
          return currentRunnerRevision;
        },
        assertExactCleanRevision: async (root, revision) => {
          roots.push(`post:${root}:${revision}`);
        },
        runWorkers: async () => [],
      },
    );
    expect(roots).toEqual([
      `bundle:${runnerRoot}`,
      `capture:${runnerRoot}`,
      `post:${runnerRoot}:${currentRunnerRevision}`,
    ]);
    expect(roots.join("\n")).not.toContain(historicalVerifierRoot);
    expect(roots.join("\n")).not.toContain(historicalRevision);
  });

  it("orders source closure around the complete worker lifetime", async () => {
    const events: string[] = [];
    const result = Object.freeze(
      [],
    ) as readonly FloodgateRawVerificationTaskResult[];
    const bundle = Object.freeze({
      source: '"use strict";',
      identity: Object.freeze({
        runtime: Object.freeze({
          node_version: process.version,
          v8_version: process.versions.v8,
          modules_abi: process.versions.modules,
          executable_path: process.execPath,
          platform: process.platform,
          architecture: process.arch,
        }),
      }),
      assertUnchangedAndClose: () => {
        events.push("bundle-postflight");
      },
    }) as unknown as FloodgateRawVerificationWorkerBundleLease;
    const dependencies: FloodgateRawVerificationProductionDependencies = {
      captureBundle: () => {
        events.push("bundle-capture");
        return bundle;
      },
      captureExactCleanRevision: async () => {
        events.push("git-preflight");
        return "a".repeat(40);
      },
      assertExactCleanRevision: async (_root, revision) => {
        expect(revision).toBe("a".repeat(40));
        events.push("git-postflight");
      },
      runWorkers: async () => {
        events.push("workers-spawned");
        await new Promise((resolve) => setTimeout(resolve, 2));
        events.push("workers-drained");
        return result;
      },
    };
    await expect(
      verifyFloodgateRawReceiptsWithPinnedWorkersCoreForTests(
        repositoryRoot(),
        repositoryRoot(),
        [],
        dependencies,
      ),
    ).resolves.toBe(result);
    expect(events).toEqual([
      "bundle-capture",
      "git-preflight",
      "workers-spawned",
      "workers-drained",
      "bundle-postflight",
      "git-postflight",
    ]);
  });

  it("never spawns on a dirty preflight and still closes the held bundle", async () => {
    const events: string[] = [];
    const dependencies: FloodgateRawVerificationProductionDependencies = {
      captureBundle: () =>
        ({
          source: '"use strict";',
          identity: { runtime: {} },
          assertUnchangedAndClose: () => {
            events.push("bundle-closed");
          },
        }) as unknown as FloodgateRawVerificationWorkerBundleLease,
      captureExactCleanRevision: async () => {
        events.push("dirty-rejected");
        throw new Error("dirty tree");
      },
      assertExactCleanRevision: async () => undefined,
      runWorkers: async () => {
        events.push("workers-spawned");
        return [];
      },
    };
    await expect(
      verifyFloodgateRawReceiptsWithPinnedWorkersCoreForTests(
        repositoryRoot(),
        repositoryRoot(),
        [],
        dependencies,
      ),
    ).rejects.toThrow("dirty tree");
    expect(events).toEqual(["dirty-rejected", "bundle-closed"]);
  });

  it("rejects source mutation after drain even when receipt work succeeded", async () => {
    let gitChecks = 0;
    const dependencies: FloodgateRawVerificationProductionDependencies = {
      captureBundle: () =>
        ({
          source: '"use strict";',
          identity: { runtime: {} },
          assertUnchangedAndClose: () => {
            throw new Error("mid-run source mutation");
          },
        }) as unknown as FloodgateRawVerificationWorkerBundleLease,
      captureExactCleanRevision: async () => {
        gitChecks += 1;
        return "c".repeat(40);
      },
      assertExactCleanRevision: async () => {
        gitChecks += 1;
      },
      runWorkers: async () => [],
    };
    await expect(
      verifyFloodgateRawReceiptsWithPinnedWorkersCoreForTests(
        repositoryRoot(),
        repositoryRoot(),
        [],
        dependencies,
      ),
    ).rejects.toThrow("production source closure failed");
    expect(gitChecks).toBe(2);
  });

  it("keeps exact ordered receipt results for 1, 4, 8, and 12 workers", async () => {
    const { root, tasks } = await fixture(24);
    const expected = await serialResults(root, tasks);
    for (const workers of [1, 4, 8, 12]) {
      const actual =
        await verifyFloodgateRawReceiptsWithOrderedWorkersCoreForTests(
          root,
          tasks,
          workers,
        );
      expect(actual).toEqual(expected);
      expect(Object.isFrozen(actual)).toBe(true);
      expect(
        actual.every(
          (result) =>
            Object.isFrozen(result) && Object.isFrozen(result.receipt),
        ),
      ).toBe(true);
      expect(
        actual.map((result) => serializeFloodgateRawReceipt(result.receipt)),
      ).toEqual(
        expected.map((result) => serializeFloodgateRawReceipt(result.receipt)),
      );
      expect(actual.map((result) => result.receipt.url)).toEqual(
        tasks.map((task) => task.url),
      );
    }
  }, 30_000);

  it("runs the pinned in-memory production bundle with twelve workers", async () => {
    const { root, tasks } = await fixture(24);
    const expected = await serialResults(root, tasks);
    let gitChecks = 0;
    const actual =
      await verifyFloodgateRawReceiptsWithPinnedWorkersCoreForTests(
        repositoryRoot(),
        root,
        tasks,
        {
          captureBundle: capturePinnedFloodgateRawVerificationWorkerBundle,
          captureExactCleanRevision: async () => {
            gitChecks += 1;
            return "d".repeat(40);
          },
          assertExactCleanRevision: async () => {
            gitChecks += 1;
          },
          runWorkers: undefined,
        },
      );
    expect(actual).toEqual(expected);
    expect(
      actual.map((result) => serializeFloodgateRawReceipt(result.receipt)),
    ).toEqual(
      expected.map((result) => serializeFloodgateRawReceipt(result.receipt)),
    );
    expect(gitChecks).toBe(2);
  }, 30_000);

  it("reports the lowest input-order failure, not the first timed failure", async () => {
    const completed: number[] = [];
    await expect(
      mapFloodgateOrderedWorkersCoreForTests(
        Array.from({ length: 12 }, (_, index) => index),
        12,
        async (value) => {
          if (value === 2) {
            await new Promise((resolve) => setTimeout(resolve, 40));
            completed.push(value);
            throw new Error("ordered failure 2");
          }
          if (value === 7) {
            completed.push(value);
            throw new Error("timed-first failure 7");
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
          completed.push(value);
          return value;
        },
      ),
    ).rejects.toThrow("ordered failure 2");
    expect(completed.indexOf(7)).toBeLessThan(completed.indexOf(2));
  });

  it("preserves input order while limiting one active task per worker", async () => {
    let metrics: FloodgateRawVerificationWorkerMetrics | undefined;
    const values = Array.from({ length: 120 }, (_, index) => index);
    const actual = await mapFloodgateOrderedWorkersCoreForTests(
      values,
      12,
      async (value) => {
        await new Promise((resolve) =>
          setTimeout(resolve, value % 3 === 0 ? 2 : 0),
        );
        return `result-${value}`;
      },
      (value) => {
        metrics = value;
      },
    );
    expect(actual).toEqual(values.map((value) => `result-${value}`));
    expect(metrics).toEqual({
      configured_workers: 12,
      spawned_workers: 12,
      tasks: 120,
      peak_in_flight_tasks: 12,
      max_tasks_per_worker: 1,
      per_worker_max_old_generation_mb:
        FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
      aggregate_worker_max_old_generation_mb:
        12 * FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
    });
  });

  it("caps worker counts and avoids spawning workers for an empty task set", async () => {
    let metrics: FloodgateRawVerificationWorkerMetrics | undefined;
    await expect(
      mapFloodgateOrderedWorkersCoreForTests(
        [],
        12,
        async () => undefined,
        (value) => {
          metrics = value;
        },
      ),
    ).resolves.toEqual([]);
    expect(metrics).toMatchObject({
      configured_workers: 12,
      spawned_workers: 0,
      tasks: 0,
      peak_in_flight_tasks: 0,
    });
    await expect(
      mapFloodgateOrderedWorkersCoreForTests(
        [0, 1, 2],
        2,
        async () => undefined,
      ),
    ).resolves.toEqual([undefined, undefined, undefined]);
    expect(() =>
      mapFloodgateOrderedWorkersCoreForTests([1], 0, async (value) => value),
    ).toThrow(/1 through 12/);
    expect(() =>
      mapFloodgateOrderedWorkersCoreForTests([1], 13, async (value) => value),
    ).toThrow(/1 through 12/);
  });

  it("times out a nonresponsive task and terminates its worker", async () => {
    const startedAt = Date.now();
    await expect(
      runInjectedFault("hang", faultTasks(1), 1, 50, 100),
    ).rejects.toThrow("task 0 timed out after 50 ms");
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expectNoInjectedWorkerLeak();
  });

  it("bounds graceful shutdown and force-terminates a shutdown hang", async () => {
    const startedAt = Date.now();
    await expect(
      runInjectedFault("shutdown_hang", faultTasks(1), 1, 500, 50),
    ).rejects.toThrow("shutdown timed out after 50 ms");
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expectNoInjectedWorkerLeak();
  });

  it("captures startup errors and cleans up the failed worker", async () => {
    const startedAt = Date.now();
    await expect(runInjectedFault("startup_error")).rejects.toThrow(
      "injected startup error",
    );
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expectNoInjectedWorkerLeak();
  });

  it("cleans earlier workers when a later worker constructor fails", async () => {
    let scenarioReads = 0;
    const workerData = {};
    Object.defineProperty(workerData, "scenario", {
      enumerable: true,
      get: () => {
        scenarioReads += 1;
        return scenarioReads === 1 ? "success" : () => undefined;
      },
    });
    await expect(
      verifyFloodgateRawReceiptsWithInjectedWorkerCoreForTests(
        repositoryRoot(),
        faultTasks(2),
        2,
        {
          workerPath: faultWorkerPath,
          workerData,
          taskTimeoutMs: 250,
          shutdownTimeoutMs: 100,
        },
      ),
    ).rejects.toThrow(/clone/i);
    expect(scenarioReads).toBe(2);
    expectNoInjectedWorkerLeak();
  });

  it("rejects malformed and unsolicited extra worker messages", async () => {
    await expect(runInjectedFault("malformed")).rejects.toThrow(
      "does not have the exact keys",
    );
    expectNoInjectedWorkerLeak();
    await expect(runInjectedFault("extra_message")).rejects.toThrow(
      /unsolicited message|shutdown exited/,
    );
    expectNoInjectedWorkerLeak();
  });

  it("keeps lowest-input failure semantics with real worker failures", async () => {
    await expect(
      runInjectedFault("ordered_failure", faultTasks(12), 12, 500, 100),
    ).rejects.toThrow("ordered failure 2");
    expectNoInjectedWorkerLeak();
  });

  it("reports a lower-index timeout over an earlier higher-index failure", async () => {
    await expect(
      runInjectedFault("ordered_timeout", faultTasks(12), 12, 1_000, 100),
    ).rejects.toThrow("task 2 timed out after 1000 ms");
    expectNoInjectedWorkerLeak();
  });
});

function repositoryRoot(): string {
  return path.resolve(__dirname, "../../..");
}
