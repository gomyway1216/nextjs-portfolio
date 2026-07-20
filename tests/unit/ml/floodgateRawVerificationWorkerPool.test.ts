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
  FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
  floodgateRawVerificationActiveWorkerCountCoreForTests,
  mapFloodgateOrderedWorkersCoreForTests,
  verifyFloodgateRawReceiptsWithInjectedWorkerCoreForTests,
  verifyFloodgateRawReceiptsWithOrderedWorkersCoreForTests,
  type FloodgateRawVerificationWorkerMetrics,
} from "../../../ml/floodgate-raw-verification-worker-pool";
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
  it("stays disconnected from the production verifier until source closure exists", () => {
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
    expect(productionVerifier).not.toContain(
      "floodgate-raw-verification-worker",
    );
    expect(workerPool).toContain("Non-production test/benchmark seam");
    expect(workerPool).not.toMatch(
      /export\s+async\s+function\s+verifyFloodgateRawReceiptsWithOrderedWorkers\s*\(/,
    );
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
