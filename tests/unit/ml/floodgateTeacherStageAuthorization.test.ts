import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  FloodgateTeacherStageAuthorizationCleanupError,
  FloodgateTeacherStageCloseError,
  FloodgateTeacherStageLeaseUnavailableError,
  authorizeFloodgateTeacherStage,
  authorizeFloodgateTeacherStageCoreForTests,
} from "../../../ml/floodgate-teacher-stage-authorization";

type AuthorizationOptions = Parameters<
  typeof authorizeFloodgateTeacherStageCoreForTests
>[0];
type AuthorizationDependencies = Parameters<
  typeof authorizeFloodgateTeacherStageCoreForTests
>[1];
type AuthorizationLease = Awaited<
  ReturnType<typeof authorizeFloodgateTeacherStageCoreForTests>
>;

const temporaryRoots: string[] = [];

interface Fixture {
  readonly root: string;
  readonly repositoryRoot: string;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly roleBundleRoot: string;
  readonly legacyProtectedPositionIdsPath: string;
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly engineBin: string;
  readonly engineReceipt: string;
  readonly engineArgument: string;
  readonly evalDir: string;
  readonly options: AuthorizationOptions;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("stage authorization tests require a POSIX effective uid");
  }
  return process.geteuid();
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function writeSentinel(
  filePath: string,
  contents: string,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, {
    flag: "wx",
    mode: 0o600,
  });
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-teacher-stage-authorization-test-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);

  const repositoryRoot = path.join(root, "repository");
  const rawLockRoot = path.join(root, "raw-lock");
  const roleLockRoot = path.join(root, "role-lock");
  const roleBundleRoot = path.join(root, "role-bundle");
  const legacyProtectedPositionIdsPath = path.join(
    root,
    "legacy",
    "protected-position-ids.txt",
  );
  const publicationParent = path.join(root, "publication");
  const stageBasename = "teacher-stage";
  const destinationBasename = "teacher-final";
  const stageRoot = path.join(publicationParent, stageBasename);
  const destinationRoot = path.join(publicationParent, destinationBasename);
  const engineBin = path.join(root, "engine", "yaneuraou");
  const engineReceipt = path.join(root, "engine", "receipt.json");
  const engineArgument = path.join(root, "engine", "argument.bin");
  const evalDir = path.join(root, "eval");

  await Promise.all([
    mkdir0700(repositoryRoot),
    mkdir0700(rawLockRoot),
    mkdir0700(roleLockRoot),
    mkdir0700(roleBundleRoot),
    mkdir0700(publicationParent),
    mkdir0700(evalDir),
  ]);
  await Promise.all([
    writeSentinel(legacyProtectedPositionIdsPath, "synthetic legacy ids\n"),
    writeSentinel(engineBin, "synthetic engine bytes\n"),
    writeSentinel(engineReceipt, '{"synthetic":true}\n'),
    writeSentinel(engineArgument, "synthetic engine argument\n"),
    writeSentinel(path.join(evalDir, "nn.bin"), "synthetic eval bytes\n"),
  ]);

  const options: AuthorizationOptions = {
    repositoryRoot,
    rawLockRoot,
    roleLockRoot,
    roleBundleRoot,
    legacyProtectedPositionIdsPath,
    publicationParent,
    stageBasename,
    destinationBasename,
    engineBin,
    engineReceipt,
    engineArgs: [engineArgument],
    evalDir,
  };

  return {
    root,
    repositoryRoot,
    rawLockRoot,
    roleLockRoot,
    roleBundleRoot,
    legacyProtectedPositionIdsPath,
    publicationParent,
    stageRoot,
    destinationRoot,
    engineBin,
    engineReceipt,
    engineArgument,
    evalDir,
    options,
  };
}

function dependencies(
  overrides: Partial<AuthorizationDependencies> = {},
): AuthorizationDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    ...overrides,
  };
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(fs.promises.lstat(filePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
}

function identity(
  stat: fs.BigIntStats,
): Readonly<{ dev: bigint; ino: bigint }> {
  return { dev: stat.dev, ino: stat.ino };
}

async function closeLease(lease: AuthorizationLease): Promise<void> {
  await lease.close();
  await lease.close();
}

async function authorize(
  value: Fixture,
  overrides: Partial<AuthorizationOptions> = {},
  dependencyOverrides: Partial<AuthorizationDependencies> = {},
): Promise<AuthorizationLease> {
  return authorizeFloodgateTeacherStageCoreForTests(
    { ...value.options, ...overrides },
    dependencies(dependencyOverrides),
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await fs.promises.chmod(root, 0o700).catch(() => undefined);
      await fs.promises.rm(root, { recursive: true, force: true });
    }),
  );
});

describe("Floodgate teacher stage authorization", () => {
  it("authorizes a fresh private stage without creating the destination", async () => {
    const value = await fixture();
    const parentBefore = await fs.promises.lstat(value.publicationParent, {
      bigint: true,
    });

    const lease = await authorize(value);
    const stageAfter = await fs.promises.lstat(value.stageRoot, {
      bigint: true,
    });

    expect(lease.stageRoot).toBe(value.stageRoot);
    expect(lease.destinationRoot).toBe(value.destinationRoot);
    expect(stageAfter.isDirectory()).toBe(true);
    expect(stageAfter.mode & BigInt(0o7777)).toBe(BigInt(0o700));
    expect(
      identity(
        await fs.promises.lstat(value.publicationParent, { bigint: true }),
      ),
    ).toEqual(identity(parentBefore));
    await expectMissing(value.destinationRoot);

    await closeLease(lease);
    expect((await fs.promises.lstat(value.stageRoot)).isDirectory()).toBe(true);
    await expectMissing(value.destinationRoot);
  });

  it("uses the current effective uid in the production authorization entry", async () => {
    const value = await fixture();

    const lease = await authorizeFloodgateTeacherStage(value.options);

    expect(lease.receipt.status).toBe(
      "authorized-private-stage-not-generated-not-published",
    );
    await closeLease(lease);
  });

  it("does not inherit a production inspector override from Object.prototype", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    await writeSentinel(
      path.join(value.stageRoot, "unexpected.tmp"),
      "synthetic unknown entry\n",
    );
    const inheritedDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "inspectorScriptForTests",
    );
    const bypassScript = String.raw`import os
s = os.fstat(3)
line = f"ROOT\t{s.st_dev}\t{s.st_ino}\t{s.st_mode}\t{s.st_nlink}\t{s.st_uid}\t0\nEND\n"
os.write(1, line.encode("ascii"))
`;
    let failure: unknown;
    let unexpectedLease: AuthorizationLease | undefined;

    Object.defineProperty(Object.prototype, "inspectorScriptForTests", {
      configurable: true,
      value: bypassScript,
    });
    try {
      try {
        unexpectedLease = await authorizeFloodgateTeacherStage(value.options);
      } catch (error) {
        failure = error;
      }
    } finally {
      if (inheritedDescriptor === undefined) {
        delete (Object.prototype as { inspectorScriptForTests?: unknown })
          .inspectorScriptForTests;
      } else {
        Object.defineProperty(
          Object.prototype,
          "inspectorScriptForTests",
          inheritedDescriptor,
        );
      }
    }

    await unexpectedLease?.close();
    expect(unexpectedLease).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /inspector|unknown|name|allowlist/i,
    );
    expect(
      await fs.promises.readFile(
        path.join(value.stageRoot, "unexpected.tmp"),
        "utf8",
      ),
    ).toBe("synthetic unknown entry\n");
  });

  it("rejects accessor-backed and unexpected option fields before creating a stage", async () => {
    const value = await fixture();
    const accessorOptions = { ...value.options } as Record<string, unknown>;
    Object.defineProperty(accessorOptions, "engineBin", {
      enumerable: true,
      get: () => value.engineBin,
    });

    await expect(
      authorizeFloodgateTeacherStageCoreForTests(
        accessorOptions as unknown as AuthorizationOptions,
        dependencies(),
      ),
    ).rejects.toThrow(/data property|options/i);
    await expect(
      authorizeFloodgateTeacherStageCoreForTests(
        { ...value.options, unexpected: true } as AuthorizationOptions,
        dependencies(),
      ),
    ).rejects.toThrow(/unexpected field|options/i);
    const nonEnumerableOptions = { ...value.options } as Record<
      string,
      unknown
    >;
    Object.defineProperty(nonEnumerableOptions, "engineBin", {
      enumerable: false,
      value: value.engineBin,
    });
    await expect(
      authorizeFloodgateTeacherStageCoreForTests(
        nonEnumerableOptions as unknown as AuthorizationOptions,
        dependencies(),
      ),
    ).rejects.toThrow(/enumerable.*data property|options/i);
    await expectMissing(value.stageRoot);
  });

  it("captures only enumerable own dependency data without invoking accessors", async () => {
    const value = await fixture();
    const accessorDependencies = { ...dependencies() } as Record<
      string,
      unknown
    >;
    let getterCalls = 0;
    Object.defineProperty(accessorDependencies, "inspectorScriptForTests", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'raise SystemExit("must not run")\n';
      },
    });

    await expect(
      authorizeFloodgateTeacherStageCoreForTests(
        value.options,
        accessorDependencies as unknown as AuthorizationDependencies,
      ),
    ).rejects.toThrow(/dependencies.*data property/i);
    expect(getterCalls).toBe(0);

    const hiddenDependencies = { ...dependencies() } as Record<string, unknown>;
    Object.defineProperty(hiddenDependencies, "inspectorScriptForTests", {
      enumerable: false,
      value: 'raise SystemExit("must not run")\n',
    });
    await expect(
      authorizeFloodgateTeacherStageCoreForTests(
        value.options,
        hiddenDependencies as unknown as AuthorizationDependencies,
      ),
    ).rejects.toThrow(/dependencies.*enumerable.*data property/i);
    await expect(
      authorizeFloodgateTeacherStageCoreForTests(value.options, {
        ...dependencies(),
        unexpected: true,
      } as AuthorizationDependencies),
    ).rejects.toThrow(/dependencies.*unexpected field/i);
    await expectMissing(value.stageRoot);
  });

  it("does not accept an accessor through Object.prototype.value poisoning", async () => {
    const value = await fixture();
    const accessorOptions = { ...value.options } as Record<string, unknown>;
    Object.defineProperty(accessorOptions, "engineBin", {
      enumerable: true,
      get: () => value.engineBin,
    });
    const inheritedDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    Object.defineProperty(Object.prototype, "value", {
      configurable: true,
      value: value.engineBin,
    });
    let failure: unknown;
    try {
      try {
        await authorizeFloodgateTeacherStageCoreForTests(
          accessorOptions as unknown as AuthorizationOptions,
          dependencies(),
        );
      } catch (error) {
        failure = error;
      }
    } finally {
      if (inheritedDescriptor === undefined) {
        delete (Object.prototype as { value?: unknown }).value;
      } else {
        Object.defineProperty(Object.prototype, "value", inheritedDescriptor);
      }
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/data property|options/i);
    await expectMissing(value.stageRoot);
  });

  it("rejects accessor-backed engine arguments without invoking the accessor", async () => {
    const value = await fixture();
    const engineArgs = [value.engineArgument];
    let getterCalls = 0;
    Object.defineProperty(engineArgs, "0", {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return value.engineArgument;
      },
    });

    await expect(authorize(value, { engineArgs })).rejects.toThrow(
      /engineArgs\[0\].*data property|accessor/i,
    );

    expect(getterCalls).toBe(0);

    const nonEnumerableEngineArgs = [value.engineArgument];
    Object.defineProperty(nonEnumerableEngineArgs, "0", {
      configurable: true,
      enumerable: false,
      value: value.engineArgument,
      writable: true,
    });
    await expect(
      authorize(value, { engineArgs: nonEnumerableEngineArgs }),
    ).rejects.toThrow(/engineArgs\[0\].*enumerable.*data property/i);
    await expectMissing(value.stageRoot);
  });

  it("authorizes resume without reading or changing a synthetic work sentinel", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const work = path.join(value.stageRoot, "work.jsonl");
    await writeSentinel(work, "synthetic checkpoint sentinel\n");
    const stageBefore = await fs.promises.lstat(value.stageRoot, {
      bigint: true,
    });
    const workBefore = await fs.promises.lstat(work, { bigint: true });

    const readFile = vi
      .spyOn(fs.promises, "readFile")
      .mockRejectedValue(
        new Error("stage authorization must not read content"),
      );
    const rename = vi
      .spyOn(fs.promises, "rename")
      .mockRejectedValue(new Error("stage authorization must not rename"));

    const lease = await authorize(value);

    expect(readFile).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(
      identity(await fs.promises.lstat(value.stageRoot, { bigint: true })),
    ).toEqual(identity(stageBefore));
    expect(identity(await fs.promises.lstat(work, { bigint: true }))).toEqual(
      identity(workBefore),
    );
    readFile.mockRestore();
    rename.mockRestore();
    expect(await fs.promises.readFile(work, "utf8")).toBe(
      "synthetic checkpoint sentinel\n",
    );

    await closeLease(lease);
  });

  it("accepts only the fixed regular-file resume entry allowlist", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    for (const filename of [
      "train.jsonl",
      "val.jsonl",
      "manifest.json",
      "work.jsonl",
      "result.json",
    ]) {
      await writeSentinel(
        path.join(value.stageRoot, filename),
        `synthetic ${filename}\n`,
      );
    }

    const lease = await authorize(value);
    await closeLease(lease);
  });

  it("rejects an invalid-UTF8 stage entry reported as raw bytes by the held descriptor inspector", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const invalidEntry = Buffer.concat([
      Buffer.from(`${value.stageRoot}${path.sep}`),
      Buffer.from([0xff]),
    ]);
    try {
      await fs.promises.writeFile(invalidEntry, "synthetic invalid name\n", {
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EILSEQ") {
        expect((error as NodeJS.ErrnoException).code).toBe("EILSEQ");
        return;
      }
      throw error;
    }

    await expect(authorize(value)).rejects.toThrow(
      /entry inspector|unknown|name|allowlist/i,
    );
    await expectMissing(value.destinationRoot);
  });

  it.each([
    {
      failure: "malformed protocol",
      script: 'import os\nos.write(1, b"bad\\n")\n',
      overrides: {},
    },
    {
      failure: "wrong held-root identity",
      script:
        'import os\ns = os.fstat(3)\nline = f"ROOT\\t{s.st_dev + 1}\\t{s.st_ino}\\t{s.st_mode}\\t{s.st_nlink}\\t{s.st_uid}\\t0\\nEND\\n"\nos.write(1, line.encode("ascii"))\n',
      overrides: {},
    },
    {
      failure: "success stderr",
      script:
        'import os\nos.write(1, b"bad\\n")\nos.write(2, b"unexpected\\n")\n',
      overrides: {},
    },
    {
      failure: "nonzero exit",
      script: "raise SystemExit(7)\n",
      overrides: {},
    },
    {
      failure: "timeout",
      script: "import time\ntime.sleep(1)\n",
      overrides: { inspectorTimeoutMillisecondsForTests: 10 },
    },
    {
      failure: "output overflow",
      script: 'import os\nos.write(1, b"x" * 4096)\n',
      overrides: { inspectorMaxOutputBytesForTests: 64 },
    },
  ] as const)(
    "fails closed on held-descriptor inspector $failure and permits later reconciliation",
    async ({ script, overrides }) => {
      const value = await fixture();
      const leaseRoot = path.join(
        value.publicationParent,
        `.${value.options.stageBasename}.authorization-lease`,
      );

      await expect(
        authorize(value, {}, { inspectorScriptForTests: script, ...overrides }),
      ).rejects.toThrow(/inspector|protocol|execute|output|status|failed/i);

      expect((await fs.promises.lstat(value.stageRoot)).isDirectory()).toBe(
        true,
      );
      await expectMissing(leaseRoot);
      await expectMissing(value.destinationRoot);
      const resumed = await authorize(value);
      await closeLease(resumed);
    },
  );

  it.each([
    ["unknown file", "unexpected.tmp", "file"],
    ["known-name symlink", "work.jsonl", "symlink"],
    ["known-name directory", "manifest.json", "directory"],
  ] as const)(
    "rejects a resume stage containing an %s",
    async (_label, name, kind) => {
      const value = await fixture();
      await mkdir0700(value.stageRoot);
      const entry = path.join(value.stageRoot, name);
      if (kind === "file") {
        await writeSentinel(entry, "synthetic unknown entry\n");
      } else if (kind === "directory") {
        await mkdir0700(entry);
      } else {
        await fs.promises.symlink(value.engineBin, entry);
      }

      await expect(authorize(value)).rejects.toThrow(
        /stage|entry|allow|symlink/i,
      );
      await expectMissing(value.destinationRoot);
    },
  );

  it.each([
    ["0755", 0o755],
    ["special-bit 01700", 0o1700],
  ] as const)(
    "rejects a publication parent with %s mode",
    async (_label, mode) => {
      const value = await fixture();
      await fs.promises.chmod(value.publicationParent, mode);

      await expect(authorize(value)).rejects.toThrow(/0700|mode|private/i);
      await expectMissing(value.stageRoot);
      await expectMissing(value.destinationRoot);
    },
  );

  it.each([
    ["0755", 0o755],
    ["special-bit 01700", 0o1700],
  ] as const)("rejects a resume stage with %s mode", async (_label, mode) => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    await fs.promises.chmod(value.stageRoot, mode);

    await expect(authorize(value)).rejects.toThrow(/0700|mode|private/i);
    expect((await fs.promises.lstat(value.stageRoot)).isDirectory()).toBe(true);
    await expectMissing(value.destinationRoot);
  });

  it("rejects a missing or non-directory publication parent", async () => {
    const missing = await fixture();
    await fs.promises.rmdir(missing.publicationParent);
    await expect(authorize(missing)).rejects.toThrow(
      /parent|directory|missing|exist/i,
    );
    await expectMissing(missing.stageRoot);

    const regular = await fixture();
    await fs.promises.rmdir(regular.publicationParent);
    await writeSentinel(regular.publicationParent, "synthetic parent file\n");
    await expect(authorize(regular)).rejects.toThrow(/parent|directory/i);
    expect(await fs.promises.readFile(regular.publicationParent, "utf8")).toBe(
      "synthetic parent file\n",
    );
  });

  it("rejects an existing regular file at the stage basename", async () => {
    const value = await fixture();
    await writeSentinel(value.stageRoot, "synthetic stage file\n");
    const before = await fs.promises.lstat(value.stageRoot, { bigint: true });

    await expect(authorize(value)).rejects.toThrow(/stage|directory/i);
    expect(
      identity(await fs.promises.lstat(value.stageRoot, { bigint: true })),
    ).toEqual(identity(before));
    expect(await fs.promises.readFile(value.stageRoot, "utf8")).toBe(
      "synthetic stage file\n",
    );
  });

  it("uses the injected effective uid for both parent and stage ownership", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);

    await expect(
      authorize(value, {}, { effectiveUserId: effectiveUserId() + 1 }),
    ).rejects.toThrow(/owner|uid|euid/i);
    await expectMissing(value.destinationRoot);
  });

  it.each([
    ["dot", "."],
    ["dot-dot", ".."],
    ["slash", "nested/stage"],
    ["backslash", "nested\\stage"],
    ["NUL", "stage\0suffix"],
    ["control", "stage\nsuffix"],
    ["empty", ""],
  ] as const)(
    "rejects a non-strict stage basename: %s",
    async (_label, stageBasename) => {
      const value = await fixture();

      await expect(authorize(value, { stageBasename })).rejects.toThrow(
        /basename|stage|strict|control/i,
      );
      await expectMissing(value.destinationRoot);
    },
  );

  it.each([
    ["dot", "."],
    ["dot-dot", ".."],
    ["slash", "nested/final"],
    ["backslash", "nested\\final"],
    ["NUL", "final\0suffix"],
    ["control", "final\nsuffix"],
    ["empty", ""],
  ] as const)(
    "rejects a non-strict destination basename: %s",
    async (_label, destinationBasename) => {
      const value = await fixture();

      await expect(authorize(value, { destinationBasename })).rejects.toThrow(
        /basename|destination|strict|control/i,
      );
      await expectMissing(value.stageRoot);
    },
  );

  it("requires stage and destination to be distinct direct siblings", async () => {
    const value = await fixture();

    await expect(
      authorize(value, { destinationBasename: value.options.stageBasename }),
    ).rejects.toThrow(/distinct|same|stage|destination/i);
    await expectMissing(value.stageRoot);
  });

  it.each([
    "file",
    "symlink",
    "empty directory",
    "nonempty directory",
  ] as const)(
    "preserves and rejects an existing destination %s",
    async (kind) => {
      const value = await fixture();
      const referent = path.join(value.root, "destination-symlink-referent");
      if (kind === "file") {
        await writeSentinel(
          value.destinationRoot,
          "synthetic destination file\n",
        );
      } else if (kind === "symlink") {
        await writeSentinel(referent, "synthetic destination referent\n");
        await fs.promises.symlink(referent, value.destinationRoot);
      } else {
        await mkdir0700(value.destinationRoot);
        if (kind === "nonempty directory") {
          await writeSentinel(
            path.join(value.destinationRoot, "sentinel"),
            "synthetic destination child\n",
          );
        }
      }
      const before = await fs.promises.lstat(value.destinationRoot, {
        bigint: true,
      });

      await expect(authorize(value)).rejects.toThrow(/destination|exist/i);

      expect(
        identity(
          await fs.promises.lstat(value.destinationRoot, { bigint: true }),
        ),
      ).toEqual(identity(before));
      if (kind === "symlink") {
        expect(await fs.promises.readFile(referent, "utf8")).toBe(
          "synthetic destination referent\n",
        );
      }
      await expectMissing(value.stageRoot);
    },
  );

  it("rejects publication-parent and resume-stage symlink traversal", async () => {
    const value = await fixture();
    const realParent = path.join(value.root, "real-publication");
    const parentAlias = path.join(value.root, "publication-alias");
    await mkdir0700(realParent);
    await fs.promises.symlink(realParent, parentAlias);

    await expect(
      authorize(value, { publicationParent: parentAlias }),
    ).rejects.toThrow(/canonical|real|symlink/i);

    const realStage = path.join(value.root, "real-stage");
    await mkdir0700(realStage);
    await fs.promises.symlink(realStage, value.stageRoot);
    await expect(authorize(value)).rejects.toThrow(/stage|symlink|directory/i);
    await expectMissing(value.destinationRoot);
  });

  const descendantProtectedCases: ReadonlyArray<{
    readonly label: string;
    readonly prepare: (
      value: Fixture,
      protectedPath: string,
    ) => Promise<Partial<AuthorizationOptions>>;
  }> = [
    {
      label: "repository root",
      prepare: async (_value, protectedPath) => {
        await mkdir0700(protectedPath);
        return { repositoryRoot: protectedPath };
      },
    },
    {
      label: "raw-lock root",
      prepare: async (_value, protectedPath) => {
        await mkdir0700(protectedPath);
        return { rawLockRoot: protectedPath };
      },
    },
    {
      label: "role-lock root",
      prepare: async (_value, protectedPath) => {
        await mkdir0700(protectedPath);
        return { roleLockRoot: protectedPath };
      },
    },
    {
      label: "role-bundle root",
      prepare: async (_value, protectedPath) => {
        await mkdir0700(protectedPath);
        return { roleBundleRoot: protectedPath };
      },
    },
    {
      label: "legacy protected-position ID file",
      prepare: async (_value, protectedPath) => {
        await writeSentinel(protectedPath, "synthetic protected ids\n");
        return { legacyProtectedPositionIdsPath: protectedPath };
      },
    },
    {
      label: "engine binary",
      prepare: async (_value, protectedPath) => {
        await writeSentinel(protectedPath, "synthetic protected engine\n");
        return { engineBin: protectedPath };
      },
    },
    {
      label: "engine receipt",
      prepare: async (_value, protectedPath) => {
        await writeSentinel(protectedPath, "synthetic protected receipt\n");
        return { engineReceipt: protectedPath };
      },
    },
    {
      label: "file-valued engine argument",
      prepare: async (value, protectedPath) => {
        await writeSentinel(protectedPath, "synthetic protected argument\n");
        return {
          engineArgs: [protectedPath, value.engineArgument],
        };
      },
    },
    {
      label: "eval tree",
      prepare: async (_value, protectedPath) => {
        await mkdir0700(protectedPath);
        await writeSentinel(
          path.join(protectedPath, "nn.bin"),
          "synthetic protected eval\n",
        );
        return { evalDir: protectedPath };
      },
    },
  ];

  it.each(descendantProtectedCases)(
    "rejects a protected $label that is a publication-parent descendant",
    async ({ label, prepare }) => {
      const value = await fixture();
      const protectedPath = path.join(
        value.publicationParent,
        `protected-${label.replaceAll(/[^a-z]+/gi, "-")}`,
      );
      const overrides = await prepare(value, protectedPath);

      await expect(authorize(value, overrides)).rejects.toThrow(
        /protected|ancestor|descendant|overlap|disjoint/i,
      );
      await expectMissing(value.stageRoot);
      await expectMissing(value.destinationRoot);
    },
  );

  it.each([
    "repositoryRoot",
    "rawLockRoot",
    "roleLockRoot",
    "roleBundleRoot",
    "evalDir",
  ] as const)(
    "rejects a publication parent below protected directory %s",
    async (protectedKey) => {
      const value = await fixture();
      const protectedAncestor = path.join(
        value.root,
        `ancestor-${protectedKey}`,
      );
      const nestedPublication = path.join(protectedAncestor, "publication");
      await mkdir0700(nestedPublication);
      if (protectedKey === "evalDir") {
        await writeSentinel(
          path.join(protectedAncestor, "nn.bin"),
          "synthetic ancestor eval\n",
        );
      }

      await expect(
        authorize(value, {
          [protectedKey]: protectedAncestor,
          publicationParent: nestedPublication,
        }),
      ).rejects.toThrow(/protected|ancestor|descendant|overlap|disjoint/i);
      await expectMissing(
        path.join(nestedPublication, value.options.stageBasename),
      );
    },
  );

  it("rejects exact-path and realpath aliases of protected directories", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);

    await expect(
      authorize(value, { roleBundleRoot: value.stageRoot }),
    ).rejects.toThrow(/protected|same|alias|inode|overlap/i);

    const alias = path.join(value.root, "stage-realpath-alias");
    await fs.promises.symlink(value.stageRoot, alias);
    await expect(authorize(value, { repositoryRoot: alias })).rejects.toThrow(
      /protected|realpath|symlink|alias|overlap/i,
    );
  });

  it("rejects a fixed resume output hard-linked to an explicit protected input", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const work = path.join(value.stageRoot, "work.jsonl");
    await fs.promises.link(value.engineBin, work);
    const engineBefore = await fs.promises.lstat(value.engineBin, {
      bigint: true,
    });

    await expect(authorize(value)).rejects.toThrow(
      /protected|hard.?link|inode|alias|overlap/i,
    );

    expect(identity(await fs.promises.lstat(work, { bigint: true }))).toEqual(
      identity(engineBefore),
    );
    expect(await fs.promises.readFile(value.engineBin, "utf8")).toBe(
      "synthetic engine bytes\n",
    );
  });

  it("does not ignore a relative engine argument that resolves to a stage file", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const work = path.join(value.stageRoot, "work.jsonl");
    await writeSentinel(work, "synthetic relative engine argument\n");
    const relativeArgument = path.relative(process.cwd(), work);
    expect(path.isAbsolute(relativeArgument)).toBe(false);
    expect(path.resolve(relativeArgument)).toBe(work);

    await expect(
      authorize(value, { engineArgs: [relativeArgument] }),
    ).rejects.toThrow(/engineArgs|protected|absolute|alias|overlap/i);
    expect(await fs.promises.readFile(work, "utf8")).toBe(
      "synthetic relative engine argument\n",
    );
  });

  it("rejects an absent future stage path supplied as an engine argument", async () => {
    const value = await fixture();
    const futureWork = path.join(value.stageRoot, "work.jsonl");

    await expect(
      authorize(value, { engineArgs: [futureWork] }),
    ).rejects.toThrow(/engineArgs|existing file|resolve|protected/i);

    await expectMissing(value.stageRoot);
    await expectMissing(value.destinationRoot);
  });

  it.each([
    ["inline path option", `--config=${path.sep}tmp${path.sep}config.bin`],
    ["relative absent path", `config${path.sep}engine.bin`],
    ["bare non-option token", "config.bin"],
  ] as const)(
    "rejects an ambiguous engine argument form: %s",
    async (_label, argument) => {
      const value = await fixture();

      await expect(
        authorize(value, { engineArgs: [argument] }),
      ).rejects.toThrow(/engineArgs|simple option|absolute existing file/i);
      await expectMissing(value.stageRoot);
    },
  );

  it("rejects a stage pathname swap after acquiring the lease", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const displaced = path.join(value.publicationParent, "displaced-stage");
    let replacementIdentity: Readonly<{ dev: bigint; ino: bigint }> | undefined;

    await expect(
      authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: async () => {
            await fs.promises.rename(value.stageRoot, displaced);
            await mkdir0700(value.stageRoot);
            replacementIdentity = identity(
              await fs.promises.lstat(value.stageRoot, { bigint: true }),
            );
          },
        },
      ),
    ).rejects.toThrow(/stage|identity|changed|swap/i);

    expect(replacementIdentity).toBeDefined();
    expect(
      identity(await fs.promises.lstat(value.stageRoot, { bigint: true })),
    ).toEqual(replacementIdentity);
    expect(
      identity(await fs.promises.lstat(displaced, { bigint: true })),
    ).not.toEqual(replacementIdentity);
    await expectMissing(value.destinationRoot);
  });

  it("inspects the held stage fd and rejects a pathname replacement after the scan", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    await writeSentinel(
      path.join(value.stageRoot, "work.jsonl"),
      "synthetic held stage sentinel\n",
    );
    const displaced = path.join(
      value.publicationParent,
      "fd-inspection-displaced-stage",
    );
    let inspectionCalls = 0;
    let failure: unknown;

    try {
      await authorize(
        value,
        {},
        {
          beforeHeldStageEntryInspectionForTests: async () => {
            inspectionCalls += 1;
            if (inspectionCalls !== 2) return;
            await fs.promises.rename(value.stageRoot, displaced);
            await mkdir0700(value.stageRoot);
            await writeSentinel(
              path.join(value.stageRoot, "unexpected.tmp"),
              "synthetic replacement-only entry\n",
            );
          },
        },
      );
    } catch (error) {
      failure = error;
    }

    expect(inspectionCalls).toBe(2);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/stage|identity|changed|swap/i);
    expect((failure as Error).message).not.toMatch(
      /unknown|unexpected|allowlist/i,
    );
    expect(
      await fs.promises.readFile(path.join(displaced, "work.jsonl"), "utf8"),
    ).toBe("synthetic held stage sentinel\n");
    expect(
      await fs.promises.readFile(
        path.join(value.stageRoot, "unexpected.tmp"),
        "utf8",
      ),
    ).toBe("synthetic replacement-only entry\n");
  });

  it("does not trust a poisoned global Promise.all during identity checks", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const displaced = path.join(
      value.publicationParent,
      "promise-all-displaced-stage",
    );
    const descriptor = Object.getOwnPropertyDescriptor(Promise, "all");
    if (descriptor === undefined) throw new Error("Promise.all is unavailable");

    Object.defineProperty(Promise, "all", {
      ...descriptor,
      value: () => {
        throw new Error("poisoned Promise.all must not be consulted");
      },
    });
    try {
      await expect(
        authorize(
          value,
          {},
          {
            afterLeaseAcquiredForTests: async () => {
              await fs.promises.rename(value.stageRoot, displaced);
              await mkdir0700(value.stageRoot);
            },
          },
        ),
      ).rejects.toThrow(/stage|identity|changed|swap/i);
    } finally {
      Object.defineProperty(Promise, "all", descriptor);
    }
  });

  it("does not assimilate filesystem objects through Object.prototype.then", () => {
    const compiledRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "stage-then-compiled-"),
    );
    temporaryRoots.push(compiledRoot);
    const compiledModulePath = path.join(compiledRoot, "authorization.cjs");
    const source = fs.readFileSync(
      path.join(process.cwd(), "ml/floodgate-teacher-stage-authorization.ts"),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: "floodgate-teacher-stage-authorization.ts",
    }).outputText;
    fs.writeFileSync(compiledModulePath, compiled, { mode: 0o600 });
    const compiledModuleLiteral = JSON.stringify(compiledModulePath);
    const script = String.raw`
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const authorizationModule = require(${compiledModuleLiteral});
const {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  authorizeFloodgateTeacherStageCoreForTests,
} = authorizationModule;

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stage-then-isolation-")));
const repositoryRoot = path.join(root, "repository");
const rawLockRoot = path.join(root, "raw-lock");
const roleLockRoot = path.join(root, "role-lock");
const roleBundleRoot = path.join(root, "role-bundle");
const publicationParent = path.join(root, "publication");
const stageRoot = path.join(publicationParent, "teacher-stage");
const displaced = path.join(publicationParent, "then-displaced-stage");
const legacy = path.join(root, "legacy", "ids.txt");
const engineBin = path.join(root, "engine", "engine");
const engineReceipt = path.join(root, "engine", "receipt.json");
const engineArgument = path.join(root, "engine", "argument.bin");
const evalDir = path.join(root, "eval");
const mkdir = (target) => {
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  fs.chmodSync(target, 0o700);
};
const write = (target, contents) => {
  mkdir(path.dirname(target));
  fs.writeFileSync(target, contents, { mode: 0o600 });
};
const directories = [repositoryRoot, rawLockRoot, roleLockRoot, roleBundleRoot, publicationParent, evalDir, stageRoot];
for (let index = 0; index < directories.length; index += 1) mkdir(directories[index]);
write(legacy, "ids\n");
write(engineBin, "engine\n");
write(engineReceipt, "{}\n");
write(engineArgument, "argument\n");
write(path.join(evalDir, "nn.bin"), "eval\n");

const options = {
  repositoryRoot,
  rawLockRoot,
  roleLockRoot,
  roleBundleRoot,
  legacyProtectedPositionIdsPath: legacy,
  publicationParent,
  stageBasename: "teacher-stage",
  destinationBasename: "teacher-final",
  engineBin,
  engineReceipt,
  engineArgs: [engineArgument],
  evalDir,
};

(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  const inheritedThen = Object.getOwnPropertyDescriptor(Object.prototype, "then");
  let poisonCalls = 0;
  let failure;
  let unexpectedLease;
  Object.defineProperty(Object.prototype, "then", {
    configurable: true,
    value: function poisonedThen() {
      poisonCalls += 1;
      const names = Object.getOwnPropertyNames(this).join(",");
      const tag = Object.prototype.toString.call(this);
      throw new Error("poisoned Object.prototype.then must not be consulted: " + tag + " own=" + names);
    },
  });
  try {
    try {
      unexpectedLease = await authorizeFloodgateTeacherStageCoreForTests(options, {
        effectiveUserId: process.geteuid(),
        inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
        afterLeaseAcquiredForTests: async () => {
          await fs.promises.rename(stageRoot, displaced);
          await fs.promises.mkdir(stageRoot, { mode: 0o700 });
          await fs.promises.chmod(stageRoot, 0o700);
        },
      });
    } catch (error) {
      failure = error;
    }
  } finally {
    if (inheritedThen === undefined) delete Object.prototype.then;
    else Object.defineProperty(Object.prototype, "then", inheritedThen);
  }
  if (unexpectedLease) {
    try { await unexpectedLease.close(); } catch {}
  }
  if (poisonCalls !== 0) throw new Error("Object.prototype.then was consulted");
  const message = failure && typeof failure.message === "string" ? failure.message : "";
  if (!/stage|identity|changed|swap/i.test(message) || /poisoned.*then/i.test(message)) {
    throw new Error("stage identity failure was not preserved: " + message);
  }
  fs.rmSync(root, { recursive: true, force: true });
  process.stdout.write("then-isolation-pass");
})().catch((error) => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  process.stderr.write(String(error && error.stack ? error.stack : error));
  process.exitCode = 1;
});
`;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 1_048_576,
      timeout: 20_000,
    });

    expect({
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    }).toEqual({
      status: 0,
      stderr: "",
      stdout: "then-isolation-pass",
    });
  });

  it("does not let Array.prototype.push poisoning drop an engine path", async () => {
    const value = await fixture();
    const futureWork = path.join(value.stageRoot, "work.jsonl");
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "push");
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("Array.prototype.push is unavailable");
    }
    const originalPush = descriptor.value as (...items: unknown[]) => number;

    Object.defineProperty(Array.prototype, "push", {
      ...descriptor,
      value: function poisonedPush(this: unknown[], ...items: unknown[]) {
        if (items[0] === futureWork) return this.length;
        return Reflect.apply(originalPush, this, items) as number;
      },
    });
    try {
      await expect(
        authorize(value, { engineArgs: [futureWork] }),
      ).rejects.toThrow(/engineArgs|existing file|resolve|protected/i);
      await expectMissing(value.stageRoot);
    } finally {
      Object.defineProperty(Array.prototype, "push", descriptor);
    }
  });

  it("does not let an inherited numeric setter drop an engine path", async () => {
    const value = await fixture();
    const futureWork = path.join(value.stageRoot, "work.jsonl");
    const engineArgs = [futureWork];
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0");
    let setterCalls = 0;
    let failure: unknown;
    let unexpectedLease: AuthorizationLease | undefined;

    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      set(this: unknown[], entry: unknown) {
        if (entry === futureWork) {
          setterCalls += 1;
          return;
        }
        Object.defineProperty(this, "0", {
          configurable: true,
          enumerable: true,
          value: entry,
          writable: true,
        });
      },
    });
    try {
      try {
        unexpectedLease = await authorize(value, { engineArgs });
      } catch (error) {
        failure = error;
      }
    } finally {
      if (descriptor === undefined) {
        delete (Array.prototype as unknown as Record<string, unknown>)["0"];
      } else {
        Object.defineProperty(Array.prototype, "0", descriptor);
      }
    }

    await unexpectedLease?.close();
    expect(setterCalls).toBe(0);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /engineArgs|existing file|resolve|protected/i,
    );
    await expectMissing(value.stageRoot);
  });

  it("does not let an inherited numeric setter drop held-inspector protocol fields", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    await writeSentinel(
      path.join(value.stageRoot, "work.jsonl"),
      "synthetic protocol field sentinel\n",
    );
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0");
    let setterCalls = 0;
    let failure: unknown;

    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      set(this: unknown[], entry: unknown) {
        if (entry === "ROOT" || entry === "ENTRY") {
          setterCalls += 1;
          return;
        }
        Object.defineProperty(this, "0", {
          configurable: true,
          enumerable: true,
          value: entry,
          writable: true,
        });
      },
    });
    try {
      try {
        const lease = await authorize(value);
        await closeLease(lease);
      } catch (error) {
        failure = error;
      }
    } finally {
      if (descriptor === undefined) {
        delete (Array.prototype as unknown as Record<string, unknown>)["0"];
      } else {
        Object.defineProperty(Array.prototype, "0", descriptor);
      }
    }

    expect(failure).toBeUndefined();
    expect(setterCalls).toBe(0);
    await expectMissing(value.destinationRoot);
  });

  it("does not trust a poisoned String.prototype.split while parsing inspector output", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    await writeSentinel(
      path.join(value.stageRoot, "work.jsonl"),
      "synthetic split poison sentinel\n",
    );
    const descriptor = Object.getOwnPropertyDescriptor(
      String.prototype,
      "split",
    );
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("String.prototype.split is unavailable");
    }
    let failure: unknown;

    Object.defineProperty(String.prototype, "split", {
      ...descriptor,
      value: () => {
        throw new Error(
          "poisoned String.prototype.split must not be consulted",
        );
      },
    });
    try {
      try {
        const lease = await authorize(value);
        await closeLease(lease);
      } catch (error) {
        failure = error;
      }
    } finally {
      Object.defineProperty(String.prototype, "split", descriptor);
    }

    expect(failure).toBeUndefined();
    await expectMissing(value.destinationRoot);
  });

  it("does not let RegExp.prototype.exec poisoning disguise an engine path as an option", async () => {
    const value = await fixture();
    const futureWork = path.join(value.stageRoot, "work.jsonl");
    const descriptor = Object.getOwnPropertyDescriptor(
      RegExp.prototype,
      "exec",
    );
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("RegExp.prototype.exec is unavailable");
    }
    const originalExec = descriptor.value as (
      this: RegExp,
      value: string,
    ) => RegExpExecArray | null;
    let failure: unknown;
    let unexpectedLease: AuthorizationLease | undefined;

    Object.defineProperty(RegExp.prototype, "exec", {
      ...descriptor,
      value: function poisonedExec(this: RegExp, value: string) {
        if (
          this.source === "^--?[A-Za-z0-9][A-Za-z0-9_-]*$" &&
          value === futureWork
        ) {
          return [value] as RegExpExecArray;
        }
        return Reflect.apply(originalExec, this, [
          value,
        ]) as RegExpExecArray | null;
      },
    });
    try {
      try {
        unexpectedLease = await authorize(value, {
          engineArgs: [futureWork],
        });
      } catch (error) {
        failure = error;
      }
    } finally {
      Object.defineProperty(RegExp.prototype, "exec", descriptor);
    }

    await unexpectedLease?.close();
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /engineArgs|existing file|resolve|protected/i,
    );
    await expectMissing(value.stageRoot);
  });

  it("rejects a stage symlink replacement after acquiring the lease", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const displaced = path.join(value.publicationParent, "displaced-stage");

    await expect(
      authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: async () => {
            await fs.promises.rename(value.stageRoot, displaced);
            await fs.promises.symlink(displaced, value.stageRoot);
          },
        },
      ),
    ).rejects.toThrow(/stage|identity|symlink|changed/i);

    expect((await fs.promises.lstat(value.stageRoot)).isSymbolicLink()).toBe(
      true,
    );
    await expectMissing(value.destinationRoot);
  });

  it("rejects a publication-parent pathname swap after acquiring the lease", async () => {
    const value = await fixture();
    await mkdir0700(value.stageRoot);
    const displaced = path.join(value.root, "displaced-publication");

    await expect(
      authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: async () => {
            await fs.promises.rename(value.publicationParent, displaced);
            await mkdir0700(value.publicationParent);
          },
        },
      ),
    ).rejects.toThrow(/parent|identity|changed|swap/i);

    expect(
      (await fs.promises.lstat(value.publicationParent)).isDirectory(),
    ).toBe(true);
    expect((await fs.promises.lstat(displaced)).isDirectory()).toBe(true);
    await expectMissing(value.destinationRoot);
  });

  it("rejects a destination created after the initial absence check", async () => {
    const value = await fixture();
    let destinationIdentity: Readonly<{ dev: bigint; ino: bigint }> | undefined;

    await expect(
      authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: async () => {
            await mkdir0700(value.destinationRoot);
            destinationIdentity = identity(
              await fs.promises.lstat(value.destinationRoot, { bigint: true }),
            );
          },
        },
      ),
    ).rejects.toThrow(/destination|exist|changed/i);

    expect(destinationIdentity).toBeDefined();
    expect(
      identity(
        await fs.promises.lstat(value.destinationRoot, { bigint: true }),
      ),
    ).toEqual(destinationIdentity);
  });

  it("rejects a protected-input inode swap after acquiring the lease", async () => {
    const value = await fixture();
    const displaced = path.join(value.root, "displaced-engine");
    const originalIdentity = identity(
      await fs.promises.lstat(value.engineBin, { bigint: true }),
    );
    let replacementIdentity: Readonly<{ dev: bigint; ino: bigint }> | undefined;

    await expect(
      authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: async () => {
            await fs.promises.rename(value.engineBin, displaced);
            await writeSentinel(
              value.engineBin,
              "synthetic replacement engine\n",
            );
            replacementIdentity = identity(
              await fs.promises.lstat(value.engineBin, { bigint: true }),
            );
          },
        },
      ),
    ).rejects.toThrow(/protected|engine|identity|changed|swap/i);

    expect(
      identity(await fs.promises.lstat(displaced, { bigint: true })),
    ).toEqual(originalIdentity);
    expect(replacementIdentity).not.toEqual(originalIdentity);
    await expectMissing(value.destinationRoot);
  });

  it("rejects a concurrent lease and allows resume after the owner closes", async () => {
    const value = await fixture();
    const first = await authorize(value);

    let concurrentFailure: unknown;
    try {
      await authorize(value);
    } catch (error) {
      concurrentFailure = error;
    }
    expect(concurrentFailure).toBeInstanceOf(
      FloodgateTeacherStageLeaseUnavailableError,
    );

    await closeLease(first);
    const resumed = await authorize(value);
    await closeLease(resumed);
  });

  it("does not steal or delete a stale lease", async () => {
    const value = await fixture();
    let receiptPaths: unknown;
    const initial = await authorize(
      value,
      {},
      {
        afterLeaseAcquiredForTests: (paths) => {
          receiptPaths = paths;
        },
      },
    );
    const pathValues = Object.values(
      receiptPaths as Readonly<Record<string, unknown>>,
    ).filter((candidate): candidate is string => typeof candidate === "string");
    const leaseRoot = pathValues.find((candidate) =>
      path.basename(candidate).toLowerCase().includes("lease"),
    );
    expect(leaseRoot).toBeDefined();
    if (!leaseRoot) throw new Error("test hook did not expose a lease path");
    const liveLease = await fs.promises.lstat(leaseRoot, { bigint: true });
    expect(liveLease.isDirectory()).toBe(true);
    await closeLease(initial);
    await expectMissing(leaseRoot);

    await mkdir0700(leaseRoot);
    const staleBefore = await fs.promises.lstat(leaseRoot, { bigint: true });
    await writeSentinel(
      path.join(leaseRoot, "stale-sentinel"),
      "synthetic stale lease\n",
    );

    let staleFailure: unknown;
    try {
      await authorize(value);
    } catch (error) {
      staleFailure = error;
    }
    expect(staleFailure).toBeInstanceOf(
      FloodgateTeacherStageLeaseUnavailableError,
    );
    expect(
      identity(await fs.promises.lstat(leaseRoot, { bigint: true })),
    ).toEqual(identity(staleBefore));
    expect(
      await fs.promises.readFile(
        path.join(leaseRoot, "stale-sentinel"),
        "utf8",
      ),
    ).toBe("synthetic stale lease\n");
  });

  it("does not create a fresh stage when a stale sibling lease already exists", async () => {
    const value = await fixture();
    const leaseRoot = path.join(
      value.publicationParent,
      `.${value.options.stageBasename}.authorization-lease`,
    );
    await mkdir0700(leaseRoot);
    await writeSentinel(
      path.join(leaseRoot, "stale-sentinel"),
      "synthetic preexisting stale lease\n",
    );

    let failure: unknown;
    try {
      await authorize(value);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(FloodgateTeacherStageLeaseUnavailableError);
    await expectMissing(value.stageRoot);
    expect(
      await fs.promises.readFile(
        path.join(leaseRoot, "stale-sentinel"),
        "utf8",
      ),
    ).toBe("synthetic preexisting stale lease\n");
  });

  it("returns a deeply frozen narrowly-scoped authorization receipt", async () => {
    const value = await fixture();
    const parentBefore = await fs.promises.lstat(value.publicationParent, {
      bigint: true,
    });
    let leaseBefore: fs.BigIntStats | undefined;
    const lease = await authorize(
      value,
      {},
      {
        afterLeaseAcquiredForTests: async ({ leaseRoot }) => {
          leaseBefore = await fs.promises.lstat(leaseRoot, { bigint: true });
        },
      },
    );
    const stageAfter = await fs.promises.lstat(value.stageRoot, {
      bigint: true,
    });

    if (!leaseBefore) throw new Error("lease hook did not observe the lease");
    expect(lease.receipt).toEqual({
      contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      trust_boundary: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
      parent_identity: identity(parentBefore),
      stage_identity: identity(stageAfter),
      lease_identity: identity(leaseBefore),
      stage_basename: value.options.stageBasename,
      destination_basename: value.options.destinationBasename,
      allowed_entries: FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
    });
    expect(
      JSON.stringify(lease.receipt, (_key, field) =>
        typeof field === "bigint" ? field.toString(10) : field,
      ),
    ).not.toMatch(/generated.*true|published.*true|teacher.*score/i);
    expect(Object.isFrozen(lease.receipt)).toBe(true);
    for (const field of Object.values(lease.receipt)) {
      if (field !== null && typeof field === "object") {
        expect(Object.isFrozen(field)).toBe(true);
      }
    }

    const receiptText = JSON.stringify(lease.receipt, (_key, field) =>
      typeof field === "bigint" ? field.toString(10) : field,
    );
    expect(receiptText).toContain(parentBefore.dev.toString(10));
    expect(receiptText).toContain(parentBefore.ino.toString(10));
    expect(receiptText).toContain(stageAfter.dev.toString(10));
    expect(receiptText).toContain(stageAfter.ino.toString(10));
    await expectMissing(value.destinationRoot);

    await closeLease(lease);
  });

  it("shares one successful close promise and performs cleanup once", async () => {
    const value = await fixture();
    let cleanupCalls = 0;
    const lease = await authorize(
      value,
      {},
      {
        beforeLeaseRemovalForTests: () => {
          cleanupCalls++;
        },
      },
    );

    const firstClose = lease.close();
    const secondClose = lease.close();
    expect(secondClose).toBe(firstClose);
    await firstClose;
    await lease.close();
    expect(cleanupCalls).toBe(1);

    const resumed = await authorize(value);
    await closeLease(resumed);
  });

  it("shares one failed close promise and reports that the lease may remain", async () => {
    const value = await fixture();
    let cleanupCalls = 0;
    const lease = await authorize(
      value,
      {},
      {
        beforeLeaseRemovalForTests: () => {
          cleanupCalls++;
          throw new Error("injected lease cleanup failure");
        },
      },
    );

    const firstClose = lease.close();
    const secondClose = lease.close();
    expect(secondClose).toBe(firstClose);
    let failure: unknown;
    try {
      await firstClose;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(FloodgateTeacherStageCloseError);
    if (!(failure instanceof FloodgateTeacherStageCloseError)) {
      throw new Error("expected a typed stage close failure");
    }
    expect(failure.leaseMayRemain).toBe(true);
    expect(failure.message).toMatch(/injected lease cleanup failure/i);
    await expect(lease.close()).rejects.toBe(failure);
    expect(cleanupCalls).toBe(1);

    let collision: unknown;
    try {
      await authorize(value);
    } catch (error) {
      collision = error;
    }
    expect(collision).toBeInstanceOf(
      FloodgateTeacherStageLeaseUnavailableError,
    );
  });

  it("preserves typed close failure when Error Symbol.hasInstance is poisoned", async () => {
    const value = await fixture();
    const ownHasInstance = Object.getOwnPropertyDescriptor(
      Error,
      Symbol.hasInstance,
    );
    const lease = await authorize(
      value,
      {},
      {
        beforeLeaseRemovalForTests: async () => {
          await mkdir0700(value.destinationRoot);
          Object.defineProperty(Error, Symbol.hasInstance, {
            configurable: true,
            value: () => {
              throw new Error("poisoned Error Symbol.hasInstance");
            },
          });
        },
      },
    );

    let failure: unknown;
    try {
      await lease.close();
    } catch (error) {
      failure = error;
    } finally {
      if (ownHasInstance === undefined) {
        delete (Error as unknown as Record<PropertyKey, unknown>)[
          Symbol.hasInstance
        ];
      } else {
        Object.defineProperty(Error, Symbol.hasInstance, ownHasInstance);
      }
    }

    expect(failure).toBeInstanceOf(FloodgateTeacherStageCloseError);
    if (!(failure instanceof FloodgateTeacherStageCloseError)) {
      throw new Error("expected a typed stage close failure");
    }
    expect(failure.leaseMayRemain).toBe(true);
    expect(failure.message).toMatch(/destination.*exists/i);
  });

  it("does not delete a replacement lease created during close", async () => {
    const value = await fixture();
    let replacementIdentity: Readonly<{ dev: bigint; ino: bigint }> | undefined;
    let displacedLeaseRoot: string | undefined;
    const lease = await authorize(
      value,
      {},
      {
        beforeLeaseRemovalForTests: async (paths) => {
          displacedLeaseRoot = path.join(
            value.publicationParent,
            ".displaced-authorization-lease",
          );
          await fs.promises.rename(paths.leaseRoot, displacedLeaseRoot);
          await mkdir0700(paths.leaseRoot);
          replacementIdentity = identity(
            await fs.promises.lstat(paths.leaseRoot, { bigint: true }),
          );
        },
      },
    );

    let failure: unknown;
    try {
      await lease.close();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(FloodgateTeacherStageCloseError);
    expect(replacementIdentity).toBeDefined();
    expect(displacedLeaseRoot).toBeDefined();
    const liveLeasePath = path.join(
      value.publicationParent,
      `.${value.options.stageBasename}.authorization-lease`,
    );
    expect(
      identity(await fs.promises.lstat(liveLeasePath, { bigint: true })),
    ).toEqual(replacementIdentity);
    expect(
      (await fs.promises.lstat(displacedLeaseRoot as string)).isDirectory(),
    ).toBe(true);
  });

  it("does not delete a replacement lease while cleaning authorization failure", async () => {
    const value = await fixture();
    let replacementIdentity: Readonly<{ dev: bigint; ino: bigint }> | undefined;

    await expect(
      authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: async (paths) => {
            await fs.promises.rename(
              paths.leaseRoot,
              path.join(value.publicationParent, ".displaced-failed-lease"),
            );
            await mkdir0700(paths.leaseRoot);
            replacementIdentity = identity(
              await fs.promises.lstat(paths.leaseRoot, { bigint: true }),
            );
            throw new Error("injected failure after lease replacement");
          },
        },
      ),
    ).rejects.toThrow(/injected failure after lease replacement/i);

    const liveLeasePath = path.join(
      value.publicationParent,
      `.${value.options.stageBasename}.authorization-lease`,
    );
    expect(replacementIdentity).toBeDefined();
    expect(
      identity(await fs.promises.lstat(liveLeasePath, { bigint: true })),
    ).toEqual(replacementIdentity);
  });

  it("reports indeterminate cleanup when the publication parent is swapped after lease acquisition", async () => {
    const value = await fixture();
    const displacedParent = path.join(value.root, "displaced-publication");
    let leaseRoot: string | undefined;
    let failure: unknown;

    try {
      await authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: async (paths) => {
            leaseRoot = paths.leaseRoot;
            await fs.promises.rename(value.publicationParent, displacedParent);
            await mkdir0700(value.publicationParent);
          },
        },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStageAuthorizationCleanupError,
    );
    if (!(failure instanceof FloodgateTeacherStageAuthorizationCleanupError)) {
      throw new Error("expected a typed authorization cleanup failure");
    }
    expect(failure.leaseMayRemain).toBe(true);
    expect(failure.primary).toBeInstanceOf(Error);
    expect(failure.cleanupFailures.length).toBeGreaterThan(0);
    expect(Array.isArray(failure.cleanupFailures)).toBe(true);
    expect([...failure.cleanupFailures]).toHaveLength(
      failure.cleanupFailures.length,
    );
    expect(failure.cleanupFailures.map((entry) => entry)).toHaveLength(
      failure.cleanupFailures.length,
    );
    expect(Object.isFrozen(failure.cleanupFailures)).toBe(true);
    expect(leaseRoot).toBeDefined();

    const displacedLeaseRoot = path.join(
      displacedParent,
      path.basename(leaseRoot as string),
    );
    expect((await fs.promises.lstat(displacedLeaseRoot)).isDirectory()).toBe(
      true,
    );
    await expectMissing(leaseRoot as string);
  });

  it.each([
    {
      mutation: "stage replacement",
      mutate: async (value: Fixture) => {
        await fs.promises.rename(
          value.stageRoot,
          path.join(value.root, "displaced-stage-during-close"),
        );
        await mkdir0700(value.stageRoot);
      },
    },
    {
      mutation: "protected engine replacement",
      mutate: async (value: Fixture) => {
        await fs.promises.rename(
          value.engineBin,
          path.join(value.root, "displaced-engine-during-close"),
        );
        await writeSentinel(value.engineBin, "replacement engine sentinel\n");
      },
    },
    {
      mutation: "destination creation",
      mutate: async (value: Fixture) => {
        await mkdir0700(value.destinationRoot);
      },
    },
  ])(
    "rejects $mutation during close and retains the lease",
    async ({ mutate }) => {
      const value = await fixture();
      let leaseRoot: string | undefined;
      const lease = await authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: (paths) => {
            leaseRoot = paths.leaseRoot;
          },
          beforeLeaseRemovalForTests: () => mutate(value),
        },
      );

      let failure: unknown;
      try {
        await lease.close();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(FloodgateTeacherStageCloseError);
      if (!(failure instanceof FloodgateTeacherStageCloseError)) {
        throw new Error("expected a typed stage close failure");
      }
      expect(failure.leaseMayRemain).toBe(true);
      expect(leaseRoot).toBeDefined();
      expect((await fs.promises.lstat(leaseRoot as string)).isDirectory()).toBe(
        true,
      );
    },
  );

  it("reports an injected lease-directory close failure and retains the lease", async () => {
    const value = await fixture();
    const closedKinds: string[] = [];
    let leaseRoot: string | undefined;
    const lease = await authorize(
      value,
      {},
      {
        afterLeaseAcquiredForTests: (paths) => {
          leaseRoot = paths.leaseRoot;
        },
        closeDirectoryForTests: async (kind, close) => {
          closedKinds.push(kind);
          await close();
          if (kind === "lease") {
            throw new Error("injected lease-directory close failure");
          }
        },
      },
    );

    let failure: unknown;
    try {
      await lease.close();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(FloodgateTeacherStageCloseError);
    if (!(failure instanceof FloodgateTeacherStageCloseError)) {
      throw new Error("expected a typed stage close failure");
    }
    expect(failure.leaseMayRemain).toBe(true);
    expect(failure.message).toMatch(/injected lease-directory close failure/i);
    expect(closedKinds).toEqual(["lease", "stage", "parent"]);
    expect(leaseRoot).toBeDefined();
    expect((await fs.promises.lstat(leaseRoot as string)).isDirectory()).toBe(
      true,
    );
  });

  it("cleans an authorization-hook failure and permits a later resume", async () => {
    const value = await fixture();
    await expect(
      authorize(
        value,
        {},
        {
          afterLeaseAcquiredForTests: () => {
            throw new Error("injected post-lease authorization failure");
          },
        },
      ),
    ).rejects.toThrow(/injected post-lease authorization failure/i);
    await expectMissing(value.destinationRoot);

    const resumed = await authorize(value);
    await closeLease(resumed);
  });
});

describe("Floodgate teacher stage authorization article parity", () => {
  it("keeps generation, publication, and live iterable primordials outside this boundary", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "ml/floodgate-teacher-stage-authorization.ts"),
      "utf8",
    );

    expect(source).not.toMatch(
      /from ["']\.\/(?:floodgate-training-row-consumer|generate-sibling-teacher|floodgate-exclusive-directory-rename)["']/,
    );
    expect(source).not.toContain("Promise.all(");
    expect(source).not.toContain("fs.promises.lstat");
    expect(source).not.toContain("fs.promises.readdir");
    expect(source).not.toContain("readdirDescriptor");
    expect(source).not.toContain("directoryEntryNames");
    expect(source).toContain("os.listdir(FD)");
    expect(source).toContain("dir_fd=FD");
    expect(source).not.toMatch(/\.push\(/);
    expect(source).not.toMatch(/for \(const .* of /);
    expect(source).not.toMatch(/\.(?:isDirectory|isFile|isSymbolicLink)\(\)/);
  });

  it("keeps the namespace boundary and readiness evidence bilingual", () => {
    const japanese = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-teacher-stage-authorization.md",
      ),
      "utf8",
    );
    const english = fs.readFileSync(
      path.join(
        process.cwd(),
        "docs/blog-shogi-floodgate-teacher-stage-authorization.en.md",
      ),
      "utf8",
    );
    const sharedFacts = [
      "authorizeFloodgateTeacherStage",
      "authorizeFloodgateTeacherStageCoreForTests",
      "authorized-private-stage-not-generated-not-published",
      "O_NOFOLLOW | O_DIRECTORY",
      "M4 Pro",
      "104 GiB",
      "11.47",
      "24,000",
      "/usr/bin/python3",
      "os.listdir(3)",
      "dir_fd=3",
      "97/97",
      "a448c6be",
      "e4e738f9",
      "final holdout",
    ];
    for (const fact of sharedFacts) {
      expect(japanese).toContain(fact);
      expect(english).toContain(fact);
    }
  });
});
