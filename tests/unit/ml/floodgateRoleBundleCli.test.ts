import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_ROLE_BUNDLE_CLI_OUTPUT_SCHEMA,
  FLOODGATE_ROLE_BUNDLE_LEGACY_REPLAY_PATH,
  FLOODGATE_ROLE_BUNDLE_PRODUCTION_GIT_PREFIX,
  floodgateRoleBundleCliErrorDiagnosticForTests,
  resolveNonProductionFloodgateRoleBundleRepositoryContextForTests,
  runNonProductionFloodgateRoleBundleCliForTests,
  type NonProductionFloodgateRoleBundleCliDependenciesForTests,
} from "../../../ml/create-floodgate-role-bundle";
import {
  acquireAndReleaseFreshFloodgateRoleBundleRootForTests,
  type FloodgateRoleBundleManifest,
  type VerifiedFloodgateRoleBundle,
} from "../../../ml/floodgate-role-bundle";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const PRODUCER_REVISION = "89abcdef0123456789abcdef0123456789abcdef";
const roots: string[] = [];
const MANIFEST = {
  schema: "shogi-floodgate-label-free-role-bundle-v1",
  status: "complete-label-free-role-bundle",
  pipeline: {
    source_revision: REVISION,
    tracked_tree_clean: true,
  },
} as unknown as Readonly<FloodgateRoleBundleManifest>;
const HISTORICAL_MANIFEST = {
  ...MANIFEST,
  pipeline: {
    source_revision: PRODUCER_REVISION,
    tracked_tree_clean: true,
  },
} as unknown as Readonly<FloodgateRoleBundleManifest>;
const VERIFIED = {
  manifest: HISTORICAL_MANIFEST,
  manifestText: "fixture\n",
  roleLock: {},
  producerRevision: PRODUCER_REVISION,
  verifierRevision: REVISION,
} as unknown as Readonly<VerifiedFloodgateRoleBundle>;

interface Fixture {
  readonly container: string;
  readonly repositoryRoot: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly outputRoot: string;
  readonly legacyPath: string;
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-role-bundle-cli-"),
  );
  const container = await fs.promises.realpath(created);
  roots.push(container);
  const repositoryRoot = path.join(container, "repository");
  const rawLockRoot = path.join(container, "raw-lock");
  const roleLockRoot = path.join(container, "role-lock");
  const outputRoot = path.join(container, "role-bundle");
  const legacyPath = path.join(
    repositoryRoot,
    FLOODGATE_ROLE_BUNDLE_LEGACY_REPLAY_PATH,
  );
  await Promise.all([
    fs.promises.mkdir(path.dirname(legacyPath), { recursive: true }),
    fs.promises.mkdir(rawLockRoot),
    fs.promises.mkdir(roleLockRoot),
  ]);
  await fs.promises.writeFile(legacyPath, `sha256:${"1".repeat(64)}\n`);
  return {
    container,
    repositoryRoot,
    rawLockRoot,
    roleLockRoot,
    outputRoot,
    legacyPath,
  };
}

function dependencies(
  repositoryRoot: string,
  stdout: string[] = [],
): NonProductionFloodgateRoleBundleCliDependenciesForTests {
  return {
    resolveRepositoryContext: vi.fn(async () => ({
      repositoryRoot,
      verifierRevision: REVISION,
    })),
    publishBundle: vi.fn(async () => MANIFEST),
    verifyBundle: vi.fn(async () => VERIFIED),
    writeStdout: (text: string) => stdout.push(text),
  };
}

function argv(
  mode: "publish" | "verify",
  rawLockRoot: string,
  roleLockRoot: string,
  outputRoot: string,
): string[] {
  return [
    mode,
    "--raw-lock",
    rawLockRoot,
    "--role-lock",
    roleLockRoot,
    "--output",
    outputRoot,
  ];
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate role-bundle CLI", () => {
  it("disables Git object replacements and preserves failure stacks", () => {
    expect(FLOODGATE_ROLE_BUNDLE_PRODUCTION_GIT_PREFIX).toEqual([
      "--no-replace-objects",
      "--no-optional-locks",
    ]);

    const withStack = new Error("outer message");
    withStack.stack = "pinned stack";
    expect(floodgateRoleBundleCliErrorDiagnosticForTests(withStack)).toBe(
      "pinned stack",
    );
    const withoutStack = new Error("message fallback");
    withoutStack.stack = undefined;
    expect(floodgateRoleBundleCliErrorDiagnosticForTests(withoutStack)).toBe(
      "message fallback",
    );
    expect(floodgateRoleBundleCliErrorDiagnosticForTests("raw failure")).toBe(
      "raw failure",
    );
  });

  it("publishes with exact pinned options and writes one JSON document", async () => {
    const {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      outputRoot,
      legacyPath,
    } = await fixture();
    const stdout: string[] = [];
    const deps = dependencies(repositoryRoot, stdout);

    await expect(
      runNonProductionFloodgateRoleBundleCliForTests(
        argv("publish", rawLockRoot, roleLockRoot, outputRoot),
        deps,
      ),
    ).resolves.toBe(0);

    expect(deps.publishBundle).toHaveBeenCalledTimes(1);
    expect(deps.verifyBundle).not.toHaveBeenCalled();
    expect(deps.publishBundle).toHaveBeenCalledWith({
      repositoryRoot,
      verifierRevision: REVISION,
      rawLockRoot,
      roleLockRoot,
      legacyProtectedPositionIdsPath: legacyPath,
      outputRoot,
    });
    expect(stdout).toHaveLength(1);
    expect(stdout[0].endsWith("\n")).toBe(true);
    expect(JSON.parse(stdout[0])).toEqual({
      schema: FLOODGATE_ROLE_BUNDLE_CLI_OUTPUT_SCHEMA,
      mode: "publish",
      repository_root: repositoryRoot,
      producer_revision: REVISION,
      verifier_revision: REVISION,
      raw_lock_root: rawLockRoot,
      role_lock_root: roleLockRoot,
      output_root: outputRoot,
      manifest: MANIFEST,
    });
  });

  it("verifies only an existing output and dispatches the independent verifier", async () => {
    const {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      outputRoot,
      legacyPath,
    } = await fixture();
    await fs.promises.mkdir(outputRoot);
    const stdout: string[] = [];
    const deps = dependencies(repositoryRoot, stdout);

    await expect(
      runNonProductionFloodgateRoleBundleCliForTests(
        argv("verify", rawLockRoot, roleLockRoot, outputRoot),
        deps,
      ),
    ).resolves.toBe(0);

    expect(deps.publishBundle).not.toHaveBeenCalled();
    expect(deps.verifyBundle).toHaveBeenCalledWith({
      repositoryRoot,
      verifierRevision: REVISION,
      rawLockRoot,
      roleLockRoot,
      legacyProtectedPositionIdsPath: legacyPath,
      outputRoot,
    });
    expect(JSON.parse(stdout[0])).toMatchObject({
      schema: FLOODGATE_ROLE_BUNDLE_CLI_OUTPUT_SCHEMA,
      mode: "verify",
      producer_revision: PRODUCER_REVISION,
      verifier_revision: REVISION,
      manifest: HISTORICAL_MANIFEST,
    });
  });

  it("rejects malformed, reordered, relative, and label-bearing argv before dispatch", async () => {
    const { repositoryRoot, rawLockRoot, roleLockRoot, outputRoot } =
      await fixture();
    const invalid: readonly (readonly string[])[] = [
      [],
      ["publish"],
      [
        "create",
        ...argv("publish", rawLockRoot, roleLockRoot, outputRoot).slice(1),
      ],
      [
        "publish",
        "--role-lock",
        roleLockRoot,
        "--raw-lock",
        rawLockRoot,
        "--output",
        outputRoot,
      ],
      [
        ...argv("publish", rawLockRoot, roleLockRoot, outputRoot),
        "--teacher-scores",
        path.join(repositoryRoot, "forbidden"),
      ],
      argv("publish", "relative/raw-lock", roleLockRoot, outputRoot),
      argv("publish", rawLockRoot, "relative/role-lock", outputRoot),
      argv("publish", rawLockRoot, roleLockRoot, "relative/output"),
      argv("publish", `${rawLockRoot} `, roleLockRoot, outputRoot),
      argv("publish", path.parse(rawLockRoot).root, roleLockRoot, outputRoot),
      argv("publish", `${rawLockRoot}\0tail`, roleLockRoot, outputRoot),
    ];

    for (const arguments_ of invalid) {
      const deps = dependencies(repositoryRoot);
      await expect(
        runNonProductionFloodgateRoleBundleCliForTests(arguments_, deps),
      ).rejects.toThrow(/invalid Floodgate role-bundle CLI/);
      expect(deps.resolveRepositoryContext).not.toHaveBeenCalled();
      expect(deps.publishBundle).not.toHaveBeenCalled();
      expect(deps.verifyBundle).not.toHaveBeenCalled();
    }

    let proxyTrapTouched = false;
    const proxy = new Proxy(
      argv("publish", rawLockRoot, roleLockRoot, outputRoot),
      {
        getPrototypeOf() {
          proxyTrapTouched = true;
          return Array.prototype;
        },
      },
    );
    const deps = dependencies(repositoryRoot);
    await expect(
      runNonProductionFloodgateRoleBundleCliForTests(proxy, deps),
    ).rejects.toThrow(/invalid Floodgate role-bundle CLI/);
    expect(proxyTrapTouched).toBe(false);
  });

  it("fails closed for missing, symlinked, nested, or existing roots", async () => {
    const { container, repositoryRoot, rawLockRoot, roleLockRoot, outputRoot } =
      await fixture();
    const missing = path.join(container, "missing");
    const rawFile = path.join(container, "raw-file");
    const rawLink = path.join(container, "raw-link");
    const roleLink = path.join(container, "role-link");
    const linkedParent = path.join(container, "linked-parent");
    const rawInsideRepository = path.join(repositoryRoot, "raw-lock");
    await fs.promises.writeFile(rawFile, "fixture");
    await fs.promises.symlink(rawLockRoot, rawLink);
    await fs.promises.symlink(roleLockRoot, roleLink);
    await fs.promises.symlink(container, linkedParent);
    await fs.promises.mkdir(rawInsideRepository);

    const cases: readonly (readonly [string, string, string])[] = [
      [missing, roleLockRoot, outputRoot],
      [rawFile, roleLockRoot, outputRoot],
      [rawLink, roleLockRoot, outputRoot],
      [rawLockRoot, missing, outputRoot],
      [rawLockRoot, roleLink, outputRoot],
      [rawLockRoot, roleLockRoot, path.join(missing, "bundle")],
      [rawLockRoot, roleLockRoot, path.join(linkedParent, "bundle")],
      [rawLockRoot, roleLockRoot, path.join(rawLockRoot, "bundle")],
      [rawInsideRepository, roleLockRoot, outputRoot],
      [rawLockRoot, rawLockRoot, outputRoot],
    ];
    for (const [raw, role, output] of cases) {
      const deps = dependencies(repositoryRoot);
      await expect(
        runNonProductionFloodgateRoleBundleCliForTests(
          argv("publish", raw, role, output),
          deps,
        ),
      ).rejects.toThrow(/invalid Floodgate role-bundle CLI/);
      expect(deps.publishBundle).not.toHaveBeenCalled();
    }

    await fs.promises.mkdir(outputRoot);
    const existingDeps = dependencies(repositoryRoot);
    await expect(
      runNonProductionFloodgateRoleBundleCliForTests(
        argv("publish", rawLockRoot, roleLockRoot, outputRoot),
        existingDeps,
      ),
    ).rejects.toThrow(/publish output must not already exist/);
    expect(existingDeps.publishBundle).not.toHaveBeenCalled();

    await fs.promises.rmdir(outputRoot);
    const verifyDeps = dependencies(repositoryRoot);
    await expect(
      runNonProductionFloodgateRoleBundleCliForTests(
        argv("verify", rawLockRoot, roleLockRoot, outputRoot),
        verifyDeps,
      ),
    ).rejects.toThrow(/verify output must be a real existing directory/);
    expect(verifyDeps.verifyBundle).not.toHaveBeenCalled();
  });

  it("loses safely when another publisher wins the precheck-to-core race", async () => {
    const { repositoryRoot, rawLockRoot, roleLockRoot, outputRoot } =
      await fixture();
    const deps = {
      ...dependencies(repositoryRoot),
      publishBundle: vi.fn(async (options) => {
        await fs.promises.mkdir(options.outputRoot);
        await fs.promises.writeFile(
          path.join(options.outputRoot, "racing-entry"),
          "must not be accepted",
        );
        await acquireAndReleaseFreshFloodgateRoleBundleRootForTests(
          options.outputRoot,
        );
        return MANIFEST;
      }),
    } satisfies NonProductionFloodgateRoleBundleCliDependenciesForTests;

    await expect(
      runNonProductionFloodgateRoleBundleCliForTests(
        argv("publish", rawLockRoot, roleLockRoot, outputRoot),
        deps,
      ),
    ).rejects.toThrow(/must be freshly created/);
    expect(deps.publishBundle).toHaveBeenCalledTimes(1);
  });

  it("derives one exact worktree root and full lowercase HEAD", async () => {
    const { repositoryRoot } = await fixture();
    const moduleDirectory = path.join(repositoryRoot, "ml");
    const calls: { cwd: string; arguments_: readonly string[] }[] = [];
    const git = vi.fn(async (cwd: string, arguments_: readonly string[]) => {
      calls.push({ cwd, arguments_ });
      return arguments_[1] === "--show-toplevel"
        ? `${repositoryRoot}\n`
        : `${REVISION}\n`;
    });

    await expect(
      resolveNonProductionFloodgateRoleBundleRepositoryContextForTests(
        moduleDirectory,
        git,
      ),
    ).resolves.toEqual({ repositoryRoot, verifierRevision: REVISION });
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
