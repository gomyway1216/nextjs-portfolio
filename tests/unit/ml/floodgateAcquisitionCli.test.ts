import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_ACQUISITION_RUN_OUTPUT_SCHEMA,
  FLOODGATE_ACQUISITION_STATUS_SCHEMA,
  resolveNonProductionFloodgateRepositoryContextForTests,
  runNonProductionFloodgateAcquisitionCliForTests,
  type NonProductionFloodgateAcquisitionCliDependenciesForTests,
} from "../../../ml/acquire-floodgate-q1";
import { floodgateRawFinalManifestPath } from "../../../ml/floodgate-raw-lock";
import type { FloodgateRawOfflineVerificationReport } from "../../../ml/floodgate-raw-lock-verifier";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const roots: string[] = [];

const VERIFICATION = {
  schema: "shogi-floodgate-raw-offline-verification-v1",
  source_revision: REVISION,
  receipts: {
    total: 36_349,
    listings: 90,
    daily_ratings: 90,
    period_inventory: 1,
    csa: 36_168,
  },
} as unknown as Readonly<FloodgateRawOfflineVerificationReport>;

async function fixture(): Promise<{
  readonly container: string;
  readonly repositoryRoot: string;
  readonly output: string;
}> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-cli-"),
  );
  const container = await fs.promises.realpath(created);
  roots.push(container);
  const repositoryRoot = path.join(container, "repository");
  await fs.promises.mkdir(repositoryRoot);
  return {
    container,
    repositoryRoot,
    output: path.join(container, "raw-lock"),
  };
}

function dependencies(
  repositoryRoot: string,
  stdout: string[],
  overrides: Partial<NonProductionFloodgateAcquisitionCliDependenciesForTests> = {},
): NonProductionFloodgateAcquisitionCliDependenciesForTests {
  return {
    resolveRepositoryContext: vi.fn(async () => ({
      repositoryRoot,
      pipelineRevision: REVISION,
    })),
    runAcquisition: vi.fn(async () => ({
      status: "published" as const,
      fetched: 36_349,
      reused: 0,
      verification: VERIFICATION,
    })),
    getLeaseStatus: vi.fn(async (lockRoot: string) => ({
      state: "absent" as const,
      lease_root: `${lockRoot}.lease`,
    })),
    verifyExistingLock: vi.fn(async () => VERIFICATION),
    writeStdout: (text: string) => stdout.push(text),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate acquisition CLI", () => {
  it("rejects unknown commands and unknown, duplicate, or missing options", async () => {
    const { repositoryRoot, output } = await fixture();
    const stdout: string[] = [];
    const deps = dependencies(repositoryRoot, stdout);
    const invalid: readonly (readonly string[])[] = [
      [],
      ["fetch", "--output", output],
      ["run"],
      ["run", "--output"],
      ["run", "--output", output, "--output", output],
      ["run", "--bogus", output],
      ["run", `--output=${output}`],
      ["status", "--output", output, "extra"],
    ];

    for (const argv of invalid) {
      await expect(
        runNonProductionFloodgateAcquisitionCliForTests(argv, deps),
      ).rejects.toThrow(/invalid Floodgate acquisition CLI/);
    }
    expect(deps.runAcquisition).not.toHaveBeenCalled();
    expect(stdout).toEqual([]);
  });

  it("dispatches run with the discovered root and HEAD and emits structured JSON", async () => {
    const { repositoryRoot, output } = await fixture();
    const stdout: string[] = [];
    const deps = dependencies(repositoryRoot, stdout);

    await expect(
      runNonProductionFloodgateAcquisitionCliForTests(
        ["run", "--output", output],
        deps,
      ),
    ).resolves.toBe(0);

    expect(deps.runAcquisition).toHaveBeenCalledTimes(1);
    expect(deps.runAcquisition).toHaveBeenCalledWith({
      repositoryRoot,
      lockRoot: output,
      pipelineRevision: REVISION,
    });
    const report = JSON.parse(stdout.join(""));
    expect(report).toMatchObject({
      schema: FLOODGATE_ACQUISITION_RUN_OUTPUT_SCHEMA,
      repository_root: repositoryRoot,
      pipeline_revision: REVISION,
      lock_root: output,
      result: { status: "published", fetched: 36_349, reused: 0 },
    });
    expect(stdout[0].endsWith("\n")).toBe(true);
  });

  it("reports an absent manifest without invoking the offline verifier", async () => {
    const { repositoryRoot, output } = await fixture();
    const stdout: string[] = [];
    const verifyExistingLock = vi.fn(async () => VERIFICATION);
    const deps = dependencies(repositoryRoot, stdout, { verifyExistingLock });

    await expect(
      runNonProductionFloodgateAcquisitionCliForTests(
        ["status", "--output", output],
        deps,
      ),
    ).resolves.toBe(0);

    expect(verifyExistingLock).not.toHaveBeenCalled();
    const report = JSON.parse(stdout.join(""));
    expect(report).toEqual({
      schema: FLOODGATE_ACQUISITION_STATUS_SCHEMA,
      repository_root: repositoryRoot,
      pipeline_revision: REVISION,
      lock_root: output,
      lease: { state: "absent", lease_root: `${output}.lease` },
      manifest: {
        state: "absent",
        path: path.join(output, floodgateRawFinalManifestPath()),
      },
    });
  });

  it("fully verifies an existing manifest and reports a held lease", async () => {
    const { repositoryRoot, output } = await fixture();
    await fs.promises.mkdir(output);
    await fs.promises.writeFile(
      path.join(output, floodgateRawFinalManifestPath()),
      "fixture",
    );
    const stdout: string[] = [];
    const verifyExistingLock = vi.fn(async () => VERIFICATION);
    const getLeaseStatus = vi.fn(async () => ({
      state: "held" as const,
      lease_root: `${output}.lease`,
      owner: {
        schema: "shogi-floodgate-acquisition-lease-v1" as const,
        pid: 123,
        hostname: "fixture-host",
        run_token: "ab".repeat(32),
        source_revision: REVISION,
        started_at: "2026-07-10T00:00:00.000Z",
      },
    }));
    const deps = dependencies(repositoryRoot, stdout, {
      verifyExistingLock,
      getLeaseStatus,
    });

    await expect(
      runNonProductionFloodgateAcquisitionCliForTests(
        ["status", "--output", output],
        deps,
      ),
    ).resolves.toBe(0);

    expect(verifyExistingLock).toHaveBeenCalledWith(output);
    const report = JSON.parse(stdout.join(""));
    expect(report.lease).toMatchObject({ state: "held", owner: { pid: 123 } });
    expect(report.manifest).toEqual({
      state: "verified",
      path: path.join(output, floodgateRawFinalManifestPath()),
      verification: VERIFICATION,
    });
  });

  it("returns failure JSON for invalid lease state and failed offline closure", async () => {
    const { repositoryRoot, output } = await fixture();
    await fs.promises.mkdir(output);
    await fs.promises.writeFile(
      path.join(output, floodgateRawFinalManifestPath()),
      "fixture",
    );
    const stdout: string[] = [];
    const deps = dependencies(repositoryRoot, stdout, {
      getLeaseStatus: vi.fn(async () => {
        throw new Error("lease unreadable");
      }),
      verifyExistingLock: vi.fn(async () => {
        throw new Error("closure mismatch");
      }),
    });

    await expect(
      runNonProductionFloodgateAcquisitionCliForTests(
        ["status", "--output", output],
        deps,
      ),
    ).resolves.toBe(1);

    const report = JSON.parse(stdout.join(""));
    expect(report.lease).toEqual({
      state: "invalid",
      lease_root: `${output}.lease`,
      error: "lease unreadable",
    });
    expect(report.manifest).toEqual({
      state: "invalid",
      path: path.join(output, floodgateRawFinalManifestPath()),
      error: "closure mismatch",
    });
  });

  it("requires a canonical external path with no containment in either direction", async () => {
    const { container, repositoryRoot } = await fixture();
    const stdout: string[] = [];
    const deps = dependencies(repositoryRoot, stdout);
    const inside = path.join(repositoryRoot, "raw-lock");

    await expect(
      runNonProductionFloodgateAcquisitionCliForTests(
        ["run", "--output", "relative/raw-lock"],
        deps,
      ),
    ).rejects.toThrow(/canonical non-root absolute/);
    await expect(
      runNonProductionFloodgateAcquisitionCliForTests(
        ["run", "--output", inside],
        deps,
      ),
    ).rejects.toThrow(/must not contain one another/);
    await expect(
      runNonProductionFloodgateAcquisitionCliForTests(
        ["run", "--output", container],
        deps,
      ),
    ).rejects.toThrow(/must not contain one another/);
    expect(deps.runAcquisition).not.toHaveBeenCalled();
  });

  it("derives an exact real worktree root and full HEAD from the module directory", async () => {
    const { repositoryRoot } = await fixture();
    const moduleDirectory = path.join(repositoryRoot, "ml");
    await fs.promises.mkdir(moduleDirectory);
    const calls: { cwd: string; arguments_: readonly string[] }[] = [];
    const git = vi.fn(async (cwd: string, arguments_: readonly string[]) => {
      calls.push({ cwd, arguments_ });
      if (arguments_[1] === "--show-toplevel") return `${repositoryRoot}\n`;
      return `${REVISION}\n`;
    });

    await expect(
      resolveNonProductionFloodgateRepositoryContextForTests(
        moduleDirectory,
        git,
      ),
    ).resolves.toEqual({ repositoryRoot, pipelineRevision: REVISION });
    expect(calls).toEqual([
      {
        cwd: moduleDirectory,
        arguments_: ["rev-parse", "--show-toplevel"],
      },
      {
        cwd: repositoryRoot,
        arguments_: ["rev-parse", "--verify", "HEAD^{commit}"],
      },
    ]);
  });

  it("rejects Git discovery that escapes the CLI module or returns a malformed HEAD", async () => {
    const { container, repositoryRoot } = await fixture();
    const moduleDirectory = path.join(repositoryRoot, "ml");
    const unrelated = path.join(container, "unrelated");
    await fs.promises.mkdir(moduleDirectory);
    await fs.promises.mkdir(unrelated);

    await expect(
      resolveNonProductionFloodgateRepositoryContextForTests(
        moduleDirectory,
        async () => `${unrelated}\n`,
      ),
    ).rejects.toThrow(/not inside the reported Git worktree/);
    await expect(
      resolveNonProductionFloodgateRepositoryContextForTests(
        moduleDirectory,
        async (_cwd, arguments_) =>
          arguments_[1] === "--show-toplevel"
            ? `${repositoryRoot}\n`
            : `${REVISION.toUpperCase()}\n`,
      ),
    ).rejects.toThrow(/not a full lowercase 40-hex commit/);
  });
});
