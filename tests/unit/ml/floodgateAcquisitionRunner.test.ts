import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_ACQUISITION_BATCH_SIZE,
  acquireNonProductionFloodgateLeaseForTests,
  cleanupNonProductionFloodgateAcquisitionForTests,
  getFloodgateAcquisitionLeaseStatus,
  runFloodgateQ1Acquisition,
  runNonProductionFloodgateAcquisitionCoreForTests,
  type FloodgateAcquisitionCoreDependencies,
  type FloodgateListingBarrierResult,
  type FloodgateManifestCandidate,
} from "../../../ml/floodgate-acquisition-runner";
import type {
  FloodgateFetchedResponse,
  FloodgateRequest,
  FloodgateRequestScheduler,
} from "../../../ml/floodgate-request-scheduler";
import type { VerifiedFloodgateRawReceipt } from "../../../ml/floodgate-raw-lock";
import type { FloodgateRawOfflineVerificationReport } from "../../../ml/floodgate-raw-lock-verifier";

const REVISION = "a".repeat(40);
const OTHER_REVISION = "b".repeat(40);
const TOKEN = "1".repeat(64);
const OTHER_TOKEN = "2".repeat(64);
const temporaryRoots: string[] = [];

const REPORT = Object.freeze({
  schema: "shogi-floodgate-raw-offline-verification-v1",
}) as unknown as FloodgateRawOfflineVerificationReport;
const CANDIDATE = Object.freeze({
  manifest: Object.freeze({}),
  verification: REPORT,
}) as unknown as FloodgateManifestCandidate;
const VERIFIED_RECEIPT = Object.freeze({}) as VerifiedFloodgateRawReceipt;

async function temporaryRoot(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-acquisition-runner-test-"),
  );
  const real = await fs.promises.realpath(created);
  temporaryRoots.push(real);
  return real;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function listingRequest(index: number): FloodgateRequest {
  return {
    kind: "daily_listing",
    url: `https://wdoor.c.u-tokyo.ac.jp/shogi/x/non-production/${index
      .toString()
      .padStart(4, "0")}/`,
  };
}

function fetched(
  request: Readonly<FloodgateRequest>,
): Readonly<FloodgateFetchedResponse> {
  return Object.freeze({
    ...request,
    status: 200,
    contentEncoding: null,
    bytes: new Uint8Array([1]),
  });
}

function emptyBarrier(): FloodgateListingBarrierResult {
  return Object.freeze({
    phases: Object.freeze([
      Object.freeze({ name: "daily_ratings", requests: Object.freeze([]) }),
      Object.freeze({ name: "period_inventory", requests: Object.freeze([]) }),
      Object.freeze({ name: "csa", requests: Object.freeze([]) }),
    ]),
    audit: Object.freeze({ fixture: true }),
  });
}

function coreDependencies(
  overrides: Partial<FloodgateAcquisitionCoreDependencies> = {},
): FloodgateAcquisitionCoreDependencies {
  const scheduler: FloodgateRequestScheduler = {
    run: vi.fn(async (requests: readonly FloodgateRequest[]) =>
      Object.freeze(requests.map(fetched)),
    ),
  };
  return {
    assertRevision: vi.fn(async () => undefined),
    verifyExistingManifestIfPresent: vi.fn(async () => null),
    readExistingReceipt: vi.fn(async () => null),
    createScheduler: vi.fn(() => scheduler),
    persistFetched: vi.fn(async () => undefined),
    deriveListingBarrier: vi.fn(async () => emptyBarrier()),
    buildAndVerifyManifest: vi.fn(async () => CANDIDATE),
    publishManifest: vi.fn(async () => undefined),
    audit: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("Floodgate acquisition runner", () => {
  it("fixes the resumable network batch at 64 responses", () => {
    expect(FLOODGATE_ACQUISITION_BATCH_SIZE).toBe(64);
  });

  it("acquires an external fail-closed lease, reports it, and releases it", async () => {
    const root = await temporaryRoot();
    const lockRoot = path.join(root, "raw-lock");
    const environment = {
      pid: 123,
      hostname: "fixture-host",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      token: () => TOKEN,
    };

    const lease = await acquireNonProductionFloodgateLeaseForTests(
      lockRoot,
      REVISION,
      environment,
    );
    expect(await getFloodgateAcquisitionLeaseStatus(lockRoot)).toMatchObject({
      state: "held",
      owner: {
        pid: 123,
        hostname: "fixture-host",
        run_token: TOKEN,
        source_revision: REVISION,
        started_at: "2026-01-01T00:00:00.000Z",
      },
    });
    await expect(
      acquireNonProductionFloodgateLeaseForTests(lockRoot, OTHER_REVISION, {
        ...environment,
        token: () => OTHER_TOKEN,
      }),
    ).rejects.toThrow(/already held/);

    await lease.release();
    expect(await getFloodgateAcquisitionLeaseStatus(lockRoot)).toMatchObject({
      state: "absent",
    });
  });

  it("never auto-steals an old lease", async () => {
    const root = await temporaryRoot();
    const lockRoot = path.join(root, "raw-lock");
    const lease = await acquireNonProductionFloodgateLeaseForTests(
      lockRoot,
      REVISION,
      {
        pid: 1,
        hostname: "old-host",
        now: () => new Date("2000-01-01T00:00:00.000Z"),
        token: () => TOKEN,
      },
    );
    await expect(
      acquireNonProductionFloodgateLeaseForTests(lockRoot, REVISION, {
        pid: 2,
        hostname: "new-host",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
        token: () => OTHER_TOKEN,
      }),
    ).rejects.toThrow(/already held/);
    await lease.release();
  });

  it("validates lease inputs before mkdir and rejects ancestor symlinks", async () => {
    const root = await temporaryRoot();
    const invalidLock = path.join(root, "invalid-lock");
    await expect(
      acquireNonProductionFloodgateLeaseForTests(invalidLock, REVISION, {
        pid: 1,
        hostname: "host",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
        token: () => "invalid",
      }),
    ).rejects.toThrow(/token/);
    await expect(
      fs.promises.lstat(`${invalidLock}.lease`),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const realParent = path.join(root, "real-parent");
    const linkedParent = path.join(root, "linked-parent");
    await fs.promises.mkdir(realParent);
    await fs.promises.symlink(realParent, linkedParent);
    const linkedLock = path.join(linkedParent, "raw-lock");
    await expect(
      acquireNonProductionFloodgateLeaseForTests(linkedLock, REVISION, {
        pid: 1,
        hostname: "host",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
        token: () => TOKEN,
      }),
    ).rejects.toThrow(/symbolic-link component/);
    await expect(
      fs.promises.lstat(path.join(realParent, "raw-lock.lease")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to release a mutated canonical owner", async () => {
    const root = await temporaryRoot();
    const lockRoot = path.join(root, "raw-lock");
    const lease = await acquireNonProductionFloodgateLeaseForTests(
      lockRoot,
      REVISION,
      {
        pid: 1,
        hostname: "host",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
        token: () => TOKEN,
      },
    );
    const ownerPath = path.join(`${lockRoot}.lease`, "owner.json");
    const owner = JSON.parse(await fs.promises.readFile(ownerPath, "utf8"));
    owner.started_at = "2026-01-02T00:00:00.000Z";
    await fs.promises.writeFile(
      ownerPath,
      `${JSON.stringify(owner)}\n`,
      "utf8",
    );

    await expect(lease.release()).rejects.toThrow(/owner identity changed/);
    expect(await getFloodgateAcquisitionLeaseStatus(lockRoot)).toMatchObject({
      state: "held",
      owner: { started_at: "2026-01-02T00:00:00.000Z" },
    });
  });

  it("attempts lease release after audit close fails and retains every failure", async () => {
    const closeFailure = new Error("audit close failed");
    const release = vi.fn(async () => undefined);
    await expect(
      cleanupNonProductionFloodgateAcquisitionForTests({
        audit: {
          close: vi.fn(async () => {
            throw closeFailure;
          }),
        },
        lease: { release },
        primaryFailed: false,
      }),
    ).rejects.toBe(closeFailure);
    expect(release).toHaveBeenCalledTimes(1);

    const primaryFailure = new Error("acquisition failed");
    const secondCloseFailure = new Error("second close failed");
    const releaseFailure = new Error("release failed");
    let caught: unknown;
    try {
      await cleanupNonProductionFloodgateAcquisitionForTests({
        audit: {
          close: vi.fn(async () => {
            throw secondCloseFailure;
          }),
        },
        lease: {
          release: vi.fn(async () => {
            throw releaseFailure;
          }),
        },
        primaryFailed: true,
        primaryFailure,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).cause).toBe(primaryFailure);
    expect((caught as AggregateError).errors).toEqual([
      primaryFailure,
      secondCloseFailure,
      releaseFailure,
    ]);
  });

  it("returns an existing verified manifest without scheduler or audit writes", async () => {
    const createScheduler = vi.fn(() => {
      throw new Error("scheduler must stay unused");
    });
    const audit = vi.fn(async () => undefined);
    const dependencies = coreDependencies({
      verifyExistingManifestIfPresent: vi.fn(async () => REPORT),
      createScheduler,
      audit,
    });

    const result = await runNonProductionFloodgateAcquisitionCoreForTests(
      [listingRequest(0)],
      dependencies,
    );

    expect(result).toMatchObject({
      status: "already_complete",
      fetched: 0,
      reused: 0,
      verification: REPORT,
    });
    expect(createScheduler).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("revalidates receipts, skips verified responses, and fetches fixed batches", async () => {
    const requests = Array.from({ length: 130 }, (_, index) =>
      listingRequest(index),
    );
    const batchLengths: number[] = [];
    const events: string[] = [];
    const scheduler: FloodgateRequestScheduler = {
      run: vi.fn(async (batch: readonly FloodgateRequest[]) => {
        batchLengths.push(batch.length);
        return Object.freeze(batch.map(fetched));
      }),
    };
    const dependencies = coreDependencies({
      assertRevision: vi.fn(async (stage) => {
        events.push(`revision:${stage}`);
      }),
      readExistingReceipt: vi.fn(async (request) =>
        request.url === requests[0].url ? VERIFIED_RECEIPT : null,
      ),
      createScheduler: vi.fn(() => scheduler),
      deriveListingBarrier: vi.fn(async () => {
        events.push("barrier");
        return emptyBarrier();
      }),
      buildAndVerifyManifest: vi.fn(async () => {
        events.push("verify");
        return CANDIDATE;
      }),
      publishManifest: vi.fn(async () => {
        events.push("publish");
      }),
    });

    const result = await runNonProductionFloodgateAcquisitionCoreForTests(
      requests,
      dependencies,
    );

    expect(batchLengths).toEqual([64, 64, 1]);
    expect(result).toMatchObject({
      status: "published",
      fetched: 129,
      reused: 1,
    });
    expect(events).toEqual([
      "revision:start",
      "barrier",
      "verify",
      "revision:prepublish",
      "publish",
    ]);
  });

  it("does not cross the listing barrier after a listing fetch failure", async () => {
    const deriveListingBarrier = vi.fn(async () => emptyBarrier());
    const dependencies = coreDependencies({
      createScheduler: vi.fn(() => ({
        run: vi.fn(async () => {
          throw new Error("network failed");
        }),
      })),
      deriveListingBarrier,
    });

    await expect(
      runNonProductionFloodgateAcquisitionCoreForTests(
        [listingRequest(0)],
        dependencies,
      ),
    ).rejects.toThrow("network failed");
    expect(deriveListingBarrier).not.toHaveBeenCalled();
  });

  it("rejects a post-listing phase whose requests use the wrong kind", async () => {
    const dependencies = coreDependencies({
      deriveListingBarrier: vi.fn(
        async (): Promise<FloodgateListingBarrierResult> => ({
          phases: [
            {
              name: "daily_ratings" as const,
              requests: [
                {
                  kind: "csa" as const,
                  url: "https://wdoor.c.u-tokyo.ac.jp/shogi/x/non-production/a.csa",
                },
              ],
            },
            { name: "period_inventory" as const, requests: [] },
            { name: "csa" as const, requests: [] },
          ],
          audit: {},
        }),
      ),
    });

    await expect(
      runNonProductionFloodgateAcquisitionCoreForTests([], dependencies),
    ).rejects.toThrow(/wrong kind/);
    expect(dependencies.buildAndVerifyManifest).not.toHaveBeenCalled();
  });

  it("rejects scheduler response loss before persistence", async () => {
    const persistFetched = vi.fn(async () => undefined);
    const dependencies = coreDependencies({
      createScheduler: vi.fn(() => ({
        run: vi.fn(async () => Object.freeze([])),
      })),
      persistFetched,
    });

    await expect(
      runNonProductionFloodgateAcquisitionCoreForTests(
        [listingRequest(0)],
        dependencies,
      ),
    ).rejects.toThrow(/does not exactly match/);
    expect(persistFetched).not.toHaveBeenCalled();
  });

  it("drains in-flight persistence before surfacing the first failure", async () => {
    const requests = Array.from({ length: 4 }, (_, index) =>
      listingRequest(index),
    );
    const releases: Array<() => void> = [];
    let calls = 0;
    const dependencies = coreDependencies({
      persistFetched: vi.fn(async () => {
        const call = calls;
        calls += 1;
        if (call === 0) throw new Error("persist failed");
        await new Promise<void>((resolve) => releases.push(resolve));
      }),
    });

    let settled = false;
    const run = runNonProductionFloodgateAcquisitionCoreForTests(
      requests,
      dependencies,
    ).finally(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(calls).toBe(4));
    expect(settled).toBe(false);
    for (const release of releases) release();

    await expect(run).rejects.toThrow("persist failed");
    expect(settled).toBe(true);
  });

  it("never publishes when the prepublish revision check fails", async () => {
    const publishManifest = vi.fn(async () => undefined);
    const dependencies = coreDependencies({
      assertRevision: vi.fn(async (stage) => {
        if (stage === "prepublish") throw new Error("revision drift");
      }),
      publishManifest,
    });

    await expect(
      runNonProductionFloodgateAcquisitionCoreForTests([], dependencies),
    ).rejects.toThrow("revision drift");
    expect(publishManifest).not.toHaveBeenCalled();
  });

  it("rejects production output paths that intersect the source worktree", async () => {
    const repositoryRoot = path.resolve(".");
    const lockRoot = path.join(repositoryRoot, ".must-not-create-raw-lock");
    await expect(
      runFloodgateQ1Acquisition({
        repositoryRoot,
        lockRoot,
        pipelineRevision: REVISION,
      }),
    ).rejects.toThrow(/disjoint/);
    await expect(fs.promises.lstat(lockRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      runFloodgateQ1Acquisition({
        repositoryRoot,
        lockRoot: path.dirname(repositoryRoot),
        pipelineRevision: REVISION,
      }),
    ).rejects.toThrow(/disjoint/);
  });

  it("rejects Proxy and accessor production options without invoking traps", async () => {
    let proxyTrapTouched = false;
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          proxyTrapTouched = true;
          return [];
        },
      },
    );
    await expect(
      runFloodgateQ1Acquisition(
        proxy as unknown as Parameters<typeof runFloodgateQ1Acquisition>[0],
      ),
    ).rejects.toThrow(/non-Proxy plain object/);
    expect(proxyTrapTouched).toBe(false);

    let getterTouched = false;
    const accessor = {
      lockRoot: "/tmp/floodgate-lock",
      pipelineRevision: REVISION,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, "repositoryRoot", {
      enumerable: true,
      get() {
        getterTouched = true;
        return path.resolve(".");
      },
    });
    await expect(
      runFloodgateQ1Acquisition(
        accessor as unknown as Parameters<typeof runFloodgateQ1Acquisition>[0],
      ),
    ).rejects.toThrow(/enumerable data property/);
    expect(getterTouched).toBe(false);
  });
});
