import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { captureFloodgateGitExactCleanRevision } from "../../../ml/floodgate-git";
import {
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
  FloodgateV7ProductionApplicationSourceProvenanceError,
  assertFloodgateV7ProductionApplicationEntrypointContext,
  assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests,
  captureFloodgateV7ProductionApplicationSourceProvenance,
  captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests,
  resolveFloodgateV7ProductionApplicationSourceRoot,
  resolveFloodgateV7ProductionApplicationSourceRootCoreForTests,
  type FloodgateV7ProductionApplicationEntrypointContextForTests,
  type FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests,
} from "../../../ml/floodgate-v7-production-application-source-provenance";

const execFile = promisify(execFileCallback);
const homes: string[] = [];
const APPLICATION_SUFFIX = path.join(
  ".codex",
  "worktrees",
  "shogi-floodgate-v7-production-application",
);
const PURPOSE_ENTRYPOINT = path.join(
  "ml",
  "run-floodgate-v7-training-label-production.ts",
);

interface Fixture {
  readonly home: string;
  readonly root: string;
  readonly revision: string;
  readonly trackedPath: string;
  readonly entrypoint: string;
}

async function git(
  root: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFile("git", [...arguments_], {
    cwd: root,
    encoding: "utf8",
  });
  return stdout;
}

async function createFixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-application-source-"),
  );
  const home = await fs.promises.realpath(created);
  homes.push(home);
  const root = path.join(home, APPLICATION_SUFFIX);
  await fs.promises.mkdir(path.join(root, "ml"), { recursive: true });
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.name", "Floodgate Test"]);
  await git(root, ["config", "user.email", "floodgate@example.invalid"]);
  const trackedPath = path.join(root, "tracked.txt");
  const entrypoint = path.join(root, PURPOSE_ENTRYPOINT);
  await fs.promises.writeFile(trackedPath, "known source\n");
  await fs.promises.writeFile(entrypoint, "export {};\n");
  await git(root, ["add", "tracked.txt", PURPOSE_ENTRYPOINT]);
  await git(root, ["commit", "-q", "-m", "source fixture"]);
  const revision = (await git(root, ["rev-parse", "HEAD"])).trim();
  return Object.freeze({ home, root, revision, trackedPath, entrypoint });
}

function dependencies(
  fixture: Fixture,
  captureExactCleanRevision: FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests["captureExactCleanRevision"] = captureFloodgateGitExactCleanRevision,
): FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests {
  return {
    homeDirectory: fixture.home,
    captureExactCleanRevision,
  };
}

function entrypointContext(
  fixture: Fixture,
  override: Partial<FloodgateV7ProductionApplicationEntrypointContextForTests> = {},
): FloodgateV7ProductionApplicationEntrypointContextForTests {
  return {
    homeDirectory: fixture.home,
    cwd: fixture.root,
    argv: ["/usr/local/bin/node", fixture.entrypoint],
    mainFilename: fixture.entrypoint,
    execArgv: ["-r", "tsx/cjs"],
    ...override,
  };
}

async function capturedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    return error as Error;
  }
  throw new Error("expected source provenance failure");
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.doUnmock("node:os");
  vi.doUnmock("../../../ml/floodgate-git");
  vi.resetModules();
  await Promise.all(
    homes
      .splice(0)
      .map((home) => fs.promises.rm(home, { recursive: true, force: true })),
  );
});

describe("Floodgate v7 production application source provenance", () => {
  it("captures only the fixed layout and exact directly verified clean HEAD", async () => {
    const fixture = await createFixture();
    const capture = vi.fn(captureFloodgateGitExactCleanRevision);

    const binding =
      await captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
        dependencies(fixture, capture),
      );

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(fixture.root);
    expect(binding).toEqual({
      layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
      revision: fixture.revision,
    });
    expect(Reflect.ownKeys(binding)).toEqual(["layout", "revision"]);
    expect(Object.getPrototypeOf(binding)).toBeNull();
    expect(Object.isFrozen(binding)).toBe(true);
    expect(
      resolveFloodgateV7ProductionApplicationSourceRootCoreForTests(
        fixture.home,
      ),
    ).toBe(fixture.root);
    expect(JSON.stringify(binding)).not.toContain(fixture.home);
    expect(JSON.stringify(binding)).not.toContain(fixture.root);
  });

  it("does not cache or replay a prior observation", async () => {
    const fixture = await createFixture();
    const secondRevision = "ba".repeat(20);
    const capture = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce(fixture.revision)
      .mockResolvedValueOnce(secondRevision);
    const input = dependencies(fixture, capture);

    const first =
      await captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
        { ...input },
      );
    const second =
      await captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
        { ...input },
      );

    expect(capture).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
    expect(first.revision).toBe(fixture.revision);
    expect(second.revision).toBe(secondRevision);
  });

  it("rejects dirty, special-index, byte-tampered, and mode-tampered trees", async () => {
    const fixture = await createFixture();
    const capture = () =>
      captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
        dependencies(fixture),
      );

    await fs.promises.writeFile(
      path.join(fixture.root, "untracked.txt"),
      "dirty\n",
    );
    await expect(capture()).rejects.toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    await fs.promises.rm(path.join(fixture.root, "untracked.txt"));

    await git(fixture.root, [
      "update-index",
      "--assume-unchanged",
      "tracked.txt",
    ]);
    await expect(capture()).rejects.toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    await git(fixture.root, [
      "update-index",
      "--no-assume-unchanged",
      "tracked.txt",
    ]);

    const before = await fs.promises.stat(fixture.trackedPath);
    await fs.promises.writeFile(fixture.trackedPath, "evil source!\n");
    await fs.promises.utimes(fixture.trackedPath, before.atime, before.mtime);
    await expect(capture()).rejects.toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );

    await fs.promises.writeFile(fixture.trackedPath, "known source\n");
    await fs.promises.chmod(fixture.trackedPath, 0o755);
    await expect(capture()).rejects.toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
  });

  it("neutralizes inherited Git repository, index, worktree, and object poisoning", async () => {
    const fixture = await createFixture();
    const prior = {
      GIT_DIR: process.env.GIT_DIR,
      GIT_INDEX_FILE: process.env.GIT_INDEX_FILE,
      GIT_OBJECT_DIRECTORY: process.env.GIT_OBJECT_DIRECTORY,
      GIT_WORK_TREE: process.env.GIT_WORK_TREE,
    };
    process.env.GIT_DIR = path.join(fixture.home, "attacker.git");
    process.env.GIT_INDEX_FILE = path.join(fixture.home, "attacker-index");
    process.env.GIT_OBJECT_DIRECTORY = path.join(
      fixture.home,
      "attacker-objects",
    );
    process.env.GIT_WORK_TREE = fixture.home;
    try {
      await expect(
        captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
          dependencies(fixture),
        ),
      ).resolves.toMatchObject({ revision: fixture.revision });
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("fails closed when a nonignored entry races the terminal revalidation", async () => {
    const fixture = await createFixture();
    const verification =
      captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
        dependencies(fixture),
      ).then(
        () => null,
        (error: unknown) => error,
      );
    await fs.promises.writeFile(path.join(fixture.root, "raced.txt"), "race\n");

    expect(await verification).toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
  });

  it.each([
    null,
    false,
    0,
    "",
    "ab".repeat(19),
    "AB".repeat(20),
    "ab".repeat(32),
    `${"ab".repeat(20)}\n`,
  ])("rejects malformed captured revisions %#", async (revision) => {
    const fixture = await createFixture();
    const capture = vi.fn(async (): Promise<unknown> => revision);

    await expect(
      captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
        dependencies(fixture, capture as unknown as () => Promise<string>),
      ),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("rejects dependency Proxies, callback Proxies, accessors, and extra keys", async () => {
    const fixture = await createFixture();
    const capture = vi.fn(async () => fixture.revision);
    const base = dependencies(fixture, capture);
    const proxiedCallback = new Proxy(capture, {});
    let accessorCalls = 0;
    const accessor = Object.defineProperties(
      {},
      {
        homeDirectory: {
          enumerable: true,
          get() {
            accessorCalls += 1;
            return fixture.home;
          },
        },
        captureExactCleanRevision: { enumerable: true, value: capture },
      },
    );
    const values: unknown[] = [
      new Proxy(base, {}),
      dependencies(fixture, proxiedCallback),
      accessor,
      { ...base, repositoryRoot: fixture.root },
      Object.assign(base, { [Symbol("override")]: fixture.root }),
    ];

    for (const value of values) {
      await expect(
        captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
          value as FloodgateV7ProductionApplicationSourceProvenanceDependenciesForTests,
        ),
      ).rejects.toBeInstanceOf(
        FloodgateV7ProductionApplicationSourceProvenanceError,
      );
    }
    expect(accessorCalls).toBe(0);
    expect(capture).not.toHaveBeenCalled();
  });

  it("sanitizes closure errors without retrying or retaining a cause", async () => {
    const fixture = await createFixture();
    const privateValue = `${fixture.root}:${fixture.revision}`;
    const capture = vi.fn(async () => {
      throw new Error(privateValue);
    });

    const error = await capturedError(
      captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests(
        dependencies(fixture, capture),
      ),
    );

    expect(capture).toHaveBeenCalledTimes(1);
    expect(String(error)).not.toContain(privateValue);
    expect(error.message).not.toContain(fixture.root);
    expect(error.stack).not.toContain(fixture.revision);
    expect(Object.prototype.hasOwnProperty.call(error, "cause")).toBe(false);
    expect(Object.isFrozen(error)).toBe(true);
  });

  it("requires the fixed root, purpose entrypoint, cwd, argv, main module, and loader", async () => {
    const fixture = await createFixture();

    expect(() =>
      assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests(
        PURPOSE_ENTRYPOINT,
        entrypointContext(fixture),
      ),
    ).not.toThrow();

    const mismatches: Array<
      readonly [
        string,
        Partial<FloodgateV7ProductionApplicationEntrypointContextForTests>,
      ]
    > = [
      ["cwd", { cwd: fixture.home }],
      ["argv path", { argv: ["node", fixture.trackedPath] }],
      ["argv length", { argv: ["node", fixture.entrypoint, "override"] }],
      ["main", { mainFilename: fixture.trackedPath }],
      ["no main", { mainFilename: null }],
      ["loader", { execArgv: ["--inspect", "-r", "tsx/cjs"] }],
      ["loader alias", { execArgv: ["--require", "tsx/cjs"] }],
    ];
    for (const [, override] of mismatches) {
      expect(() =>
        assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests(
          PURPOSE_ENTRYPOINT,
          entrypointContext(fixture, override),
        ),
      ).toThrow(FloodgateV7ProductionApplicationSourceProvenanceError);
    }
    for (const purpose of [
      fixture.entrypoint,
      "../outside.ts",
      "ml/../outside.ts",
      "tracked.txt",
      `${PURPOSE_ENTRYPOINT}\0override`,
    ]) {
      expect(() =>
        assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests(
          purpose,
          entrypointContext(fixture),
        ),
      ).toThrow(FloodgateV7ProductionApplicationSourceProvenanceError);
    }
  });

  it("rejects proxied or accessor-bearing CLI context before reading it", async () => {
    const fixture = await createFixture();
    const base = entrypointContext(fixture);
    const proxiedArgv = new Proxy([...base.argv], {});
    let accessorCalls = 0;
    const accessor = Object.defineProperties(
      {},
      {
        homeDirectory: { enumerable: true, value: fixture.home },
        cwd: {
          enumerable: true,
          get() {
            accessorCalls += 1;
            return fixture.root;
          },
        },
        argv: { enumerable: true, value: base.argv },
        mainFilename: { enumerable: true, value: fixture.entrypoint },
        execArgv: { enumerable: true, value: base.execArgv },
      },
    );

    for (const value of [
      new Proxy(base, {}),
      { ...base, argv: proxiedArgv },
      accessor,
      { ...base, unexpected: true },
    ]) {
      expect(() =>
        assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests(
          PURPOSE_ENTRYPOINT,
          value as FloodgateV7ProductionApplicationEntrypointContextForTests,
        ),
      ).toThrow(FloodgateV7ProductionApplicationSourceProvenanceError);
    }
    expect(accessorCalls).toBe(0);
  });

  it("rejects relative, symlinked, absent, and caller-overridden roots", async () => {
    const fixture = await createFixture();
    const aliasHome = `${fixture.home}-alias`;
    await fs.promises.symlink(fixture.home, aliasHome);
    homes.push(aliasHome);

    for (const home of [
      path.relative(process.cwd(), fixture.home),
      `${fixture.home}${path.sep}`,
      aliasHome,
      path.join(fixture.home, "absent"),
    ]) {
      expect(() =>
        resolveFloodgateV7ProductionApplicationSourceRootCoreForTests(home),
      ).toThrow(FloodgateV7ProductionApplicationSourceProvenanceError);
    }
  });

  it("binds production capture to the current-EUID user-info home and imported helper", async () => {
    if (typeof process.geteuid !== "function") return;
    const fixture = await createFixture();
    const capture = vi.fn(async () => fixture.revision);
    const effectiveUserId = process.geteuid();
    vi.resetModules();
    vi.doMock("node:os", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:os")>();
      return {
        ...actual,
        userInfo: () => ({
          username: "private-user",
          uid: effectiveUserId,
          gid: effectiveUserId,
          shell: "/private/shell",
          homedir: fixture.home,
        }),
      };
    });
    vi.doMock("../../../ml/floodgate-git", () => ({
      captureFloodgateGitExactCleanRevision: capture,
    }));

    const isolated =
      await import("../../../ml/floodgate-v7-production-application-source-provenance");
    const binding =
      await isolated.captureFloodgateV7ProductionApplicationSourceProvenance();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(fixture.root);
    expect(binding).toEqual({
      layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
      revision: fixture.revision,
    });
    expect(isolated.resolveFloodgateV7ProductionApplicationSourceRoot()).toBe(
      fixture.root,
    );
  });

  it("enforces exact production and test argument counts", async () => {
    const fixture = await createFixture();
    const captureProduction =
      captureFloodgateV7ProductionApplicationSourceProvenance as unknown as (
        ...values: unknown[]
      ) => Promise<unknown>;
    const captureTest =
      captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests as unknown as (
        ...values: unknown[]
      ) => Promise<unknown>;
    const resolveProduction =
      resolveFloodgateV7ProductionApplicationSourceRoot as unknown as (
        ...values: unknown[]
      ) => string;
    const resolveTest =
      resolveFloodgateV7ProductionApplicationSourceRootCoreForTests as unknown as (
        ...values: unknown[]
      ) => string;
    const assertProduction =
      assertFloodgateV7ProductionApplicationEntrypointContext as unknown as (
        ...values: unknown[]
      ) => void;
    const assertTest =
      assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests as unknown as (
        ...values: unknown[]
      ) => void;

    expect(captureFloodgateV7ProductionApplicationSourceProvenance.length).toBe(
      0,
    );
    expect(
      captureFloodgateV7ProductionApplicationSourceProvenanceCoreForTests.length,
    ).toBe(1);
    expect(resolveFloodgateV7ProductionApplicationSourceRoot.length).toBe(0);
    expect(
      resolveFloodgateV7ProductionApplicationSourceRootCoreForTests.length,
    ).toBe(1);
    expect(assertFloodgateV7ProductionApplicationEntrypointContext.length).toBe(
      1,
    );
    expect(
      assertFloodgateV7ProductionApplicationEntrypointContextCoreForTests.length,
    ).toBe(2);
    await expect(captureProduction("override")).rejects.toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    await expect(captureTest()).rejects.toBeInstanceOf(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    expect(() => resolveProduction("override")).toThrow(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    expect(() => resolveTest()).toThrow(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    expect(() => assertProduction()).toThrow(
      FloodgateV7ProductionApplicationSourceProvenanceError,
    );
    expect(() =>
      assertTest(PURPOSE_ENTRYPOINT, entrypointContext(fixture), "extra"),
    ).toThrow(FloodgateV7ProductionApplicationSourceProvenanceError);
  });
});
