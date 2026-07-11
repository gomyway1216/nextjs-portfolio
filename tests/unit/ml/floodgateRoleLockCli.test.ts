import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_ROLE_LOCK_CLI_OUTPUT_SCHEMA,
  resolveNonProductionFloodgateRoleLockRepositoryContextForTests,
  runNonProductionFloodgateRoleLockCliForTests,
  type NonProductionFloodgateRoleLockCliDependenciesForTests,
} from "../../../ml/create-floodgate-role-lock";
import {
  acquireAndReleaseFreshFloodgateRoleLockRootForTests,
  runFreshFloodgateRoleLockOutputLifecycleCoreForTests,
  runFreshFloodgateRoleLockRootGuardCoreForTests,
  type FloodgateRoleLockManifest,
} from "../../../ml/floodgate-role-lock";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const roots: string[] = [];
const MANIFEST = {
  schema: "shogi-floodgate-role-lock-v1",
  status: "complete-label-blind-role-lock",
} as unknown as Readonly<FloodgateRoleLockManifest>;

interface Fixture {
  readonly container: string;
  readonly repositoryRoot: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-role-lock-cli-"),
  );
  const container = await fs.promises.realpath(created);
  roots.push(container);
  const repositoryRoot = path.join(container, "repository");
  const rawLockRoot = path.join(container, "raw-lock");
  await Promise.all([
    fs.promises.mkdir(repositoryRoot),
    fs.promises.mkdir(rawLockRoot),
  ]);
  return {
    container,
    repositoryRoot,
    rawLockRoot,
    roleLockRoot: path.join(container, "role-lock"),
  };
}

function dependencies(
  repositoryRoot: string,
  stdout: string[] = [],
): NonProductionFloodgateRoleLockCliDependenciesForTests {
  return {
    resolveRepositoryContext: vi.fn(async () => ({
      repositoryRoot,
      pipelineRevision: REVISION,
    })),
    createRoleLock: vi.fn(async () => MANIFEST),
    writeStdout: (text: string) => stdout.push(text),
  };
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate role-lock CLI", () => {
  it("accepts only the exact input/output argv, dispatches pinned options, and writes one JSON document", async () => {
    const { repositoryRoot, rawLockRoot, roleLockRoot } = await fixture();
    const stdout: string[] = [];
    const deps = dependencies(repositoryRoot, stdout);

    await expect(
      runNonProductionFloodgateRoleLockCliForTests(
        ["--input", rawLockRoot, "--output", roleLockRoot],
        deps,
      ),
    ).resolves.toBe(0);

    expect(deps.createRoleLock).toHaveBeenCalledTimes(1);
    expect(deps.createRoleLock).toHaveBeenCalledWith({
      repositoryRoot,
      pipelineRevision: REVISION,
      rawLockRoot,
      roleLockRoot,
      legacyProtectedPositionIdsPath: path.join(
        repositoryRoot,
        "ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt",
      ),
    });
    expect(stdout).toHaveLength(1);
    expect(stdout[0].endsWith("\n")).toBe(true);
    expect(JSON.parse(stdout[0])).toEqual({
      schema: FLOODGATE_ROLE_LOCK_CLI_OUTPUT_SCHEMA,
      repository_root: repositoryRoot,
      pipeline_revision: REVISION,
      raw_lock_root: rawLockRoot,
      role_lock_root: roleLockRoot,
      manifest: MANIFEST,
    });
  });

  it("fails when another creator wins the CLI-check-to-core-mkdir race", async () => {
    const { repositoryRoot, rawLockRoot, roleLockRoot } = await fixture();
    const deps = {
      ...dependencies(repositoryRoot),
      createRoleLock: vi.fn(async (options) => {
        await fs.promises.mkdir(options.roleLockRoot);
        await fs.promises.writeFile(
          path.join(options.roleLockRoot, "racing-extra-entry"),
          "must never be accepted",
        );
        await acquireAndReleaseFreshFloodgateRoleLockRootForTests(
          options.roleLockRoot,
        );
        return MANIFEST;
      }),
    } satisfies NonProductionFloodgateRoleLockCliDependenciesForTests;

    await expect(
      runNonProductionFloodgateRoleLockCliForTests(
        ["--input", rawLockRoot, "--output", roleLockRoot],
        deps,
      ),
    ).rejects.toThrow(/freshly and exclusively created/);
    expect(deps.createRoleLock).toHaveBeenCalledTimes(1);
  });

  it("detects output-root rename-and-restore ABA while the original directory handle remains open", async () => {
    const { roleLockRoot } = await fixture();
    const movedRoot = `${roleLockRoot}.moved`;
    await expect(
      runFreshFloodgateRoleLockRootGuardCoreForTests(
        roleLockRoot,
        async (root) => {
          await fs.promises.rename(root, movedRoot);
          await fs.promises.mkdir(root);
          await fs.promises.rmdir(root);
          await fs.promises.rename(movedRoot, root);
        },
      ),
    ).rejects.toThrow(/possible output-root ABA/);
    await expect(fs.promises.realpath(roleLockRoot)).resolves.toBe(
      roleLockRoot,
    );
  });

  it("keeps manifest unpublished when the output root is swapped after final artifact verification", async () => {
    const { roleLockRoot } = await fixture();
    const movedRoot = `${roleLockRoot}.between-artifacts-and-manifest`;
    await expect(
      runFreshFloodgateRoleLockOutputLifecycleCoreForTests(
        roleLockRoot,
        async (root) => {
          await fs.promises.rename(root, movedRoot);
          await fs.promises.mkdir(root);
          await fs.promises.rmdir(root);
          await fs.promises.rename(movedRoot, root);
        },
      ),
    ).rejects.toThrow(/possible output-root ABA/);
    await expect(
      fs.promises.lstat(path.join(roleLockRoot, "manifest.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const inputStat = await fs.promises.lstat(
      path.join(roleLockRoot, "materialized-input.json"),
    );
    const allocationStat = await fs.promises.lstat(
      path.join(roleLockRoot, "allocation.json"),
    );
    expect(inputStat.isFile()).toBe(true);
    expect(allocationStat.isFile()).toBe(true);
  });

  it("holds one output-root identity through the complete manifest-last lifecycle", async () => {
    const { roleLockRoot } = await fixture();
    await expect(
      runFreshFloodgateRoleLockOutputLifecycleCoreForTests(
        roleLockRoot,
        async () => undefined,
      ),
    ).resolves.toBeUndefined();
    await expect(
      fs.promises.readFile(path.join(roleLockRoot, "manifest.json"), "utf8"),
    ).resolves.toBe('{"fixture":"manifest"}\n');
    const entries = await fs.promises.readdir(roleLockRoot);
    expect(entries.sort()).toEqual([
      "allocation.json",
      "manifest.json",
      "materialized-input.json",
    ]);
  });

  it("rejects every malformed or reordered argv before production dispatch", async () => {
    const { repositoryRoot, rawLockRoot, roleLockRoot } = await fixture();
    const invalid: readonly (readonly string[])[] = [
      [],
      ["--input", rawLockRoot],
      ["--output", roleLockRoot, "--input", rawLockRoot],
      ["--raw-lock", rawLockRoot, "--output", roleLockRoot],
      ["--input", rawLockRoot, "--role-lock", roleLockRoot],
      ["--input", rawLockRoot, "--output", roleLockRoot, "extra"],
      ["--input", rawLockRoot, "--input", roleLockRoot],
      ["--input", "relative/raw-lock", "--output", roleLockRoot],
      ["--input", path.parse(rawLockRoot).root, "--output", roleLockRoot],
      ["--input", rawLockRoot, "--output", "relative/role-lock"],
      ["--input", rawLockRoot, "--output", path.parse(roleLockRoot).root],
      ["--input", `${rawLockRoot}\0tail`, "--output", roleLockRoot],
    ];

    for (const argv of invalid) {
      const deps = dependencies(repositoryRoot);
      await expect(
        runNonProductionFloodgateRoleLockCliForTests(argv, deps),
      ).rejects.toThrow(/invalid Floodgate role-lock CLI/);
      expect(deps.resolveRepositoryContext).not.toHaveBeenCalled();
      expect(deps.createRoleLock).not.toHaveBeenCalled();
    }
  });

  it("fails closed for missing, non-directory, symlinked, existing, nested, or worktree-contained roots", async () => {
    const { container, repositoryRoot, rawLockRoot, roleLockRoot } =
      await fixture();
    const rawFile = path.join(container, "raw-file");
    const rawLink = path.join(container, "raw-link");
    const missingRaw = path.join(container, "missing-raw");
    const missingParentOutput = path.join(
      container,
      "missing-parent",
      "role-lock",
    );
    const linkedParent = path.join(container, "linked-parent");
    const linkedParentOutput = path.join(linkedParent, "role-lock");
    const nestedOutput = path.join(rawLockRoot, "role-lock");
    const rawInsideWorktree = path.join(repositoryRoot, "raw-lock");
    const outputInsideWorktree = path.join(repositoryRoot, "role-lock");
    await fs.promises.writeFile(rawFile, "fixture");
    await fs.promises.symlink(rawLockRoot, rawLink);
    await fs.promises.symlink(container, linkedParent);
    await fs.promises.mkdir(rawInsideWorktree);

    const cases: readonly (readonly [string, string])[] = [
      [missingRaw, roleLockRoot],
      [rawFile, roleLockRoot],
      [rawLink, roleLockRoot],
      [rawLockRoot, missingParentOutput],
      [rawLockRoot, linkedParentOutput],
      [rawLockRoot, nestedOutput],
      [rawInsideWorktree, roleLockRoot],
      [rawLockRoot, outputInsideWorktree],
    ];
    for (const [input, output] of cases) {
      const deps = dependencies(repositoryRoot);
      await expect(
        runNonProductionFloodgateRoleLockCliForTests(
          ["--input", input, "--output", output],
          deps,
        ),
      ).rejects.toThrow(/invalid Floodgate role-lock CLI/);
      expect(deps.createRoleLock).not.toHaveBeenCalled();
    }

    await fs.promises.mkdir(roleLockRoot);
    const existingDeps = dependencies(repositoryRoot);
    await expect(
      runNonProductionFloodgateRoleLockCliForTests(
        ["--input", rawLockRoot, "--output", roleLockRoot],
        existingDeps,
      ),
    ).rejects.toThrow(/output must not already exist/);
    expect(existingDeps.createRoleLock).not.toHaveBeenCalled();
  });

  it("derives one exact real worktree root and full lowercase HEAD", async () => {
    const { repositoryRoot } = await fixture();
    const moduleDirectory = path.join(repositoryRoot, "ml");
    await fs.promises.mkdir(moduleDirectory);
    const calls: { cwd: string; arguments_: readonly string[] }[] = [];
    const git = vi.fn(async (cwd: string, arguments_: readonly string[]) => {
      calls.push({ cwd, arguments_ });
      return arguments_[1] === "--show-toplevel"
        ? `${repositoryRoot}\n`
        : `${REVISION}\n`;
    });

    await expect(
      resolveNonProductionFloodgateRoleLockRepositoryContextForTests(
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
});
