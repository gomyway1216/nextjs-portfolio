import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER_SHA256,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_PYTHON,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
  FloodgateExclusiveRenameIndeterminateError,
  FloodgateExclusiveRenameNotCommittedError,
  exclusiveRenameFloodgateDirectory,
  exclusiveRenameFloodgateDirectoryCoreForTests,
  type ExclusiveDirectoryRenameDependencies,
} from "../../../ml/floodgate-exclusive-directory-rename";

const temporaryRoots: string[] = [];
const darwinIt = process.platform === "darwin" ? it : it.skip;

async function temporaryRoot(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-exclusive-directory-rename-test-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  return root;
}

async function directoryPair(): Promise<{
  root: string;
  parent: string;
  source: string;
  destination: string;
}> {
  const root = await temporaryRoot();
  const parent = path.join(root, "publication-parent");
  const source = path.join(parent, "publish-stage");
  const destination = path.join(parent, "final");
  await fs.promises.mkdir(source, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(parent, 0o700);
  await fs.promises.chmod(source, 0o700);
  return { root, parent, source, destination };
}

function inode(stat: fs.BigIntStats): Readonly<{ dev: bigint; ino: bigint }> {
  return { dev: stat.dev, ino: stat.ino };
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(fs.promises.lstat(filePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
}

async function openDirectoryHandle(
  directoryPath: string,
): Promise<fs.promises.FileHandle> {
  return fs.promises.open(
    directoryPath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_DIRECTORY,
  );
}

async function withSourceHandle<T>(
  source: string,
  operation: (handle: fs.promises.FileHandle) => Promise<T>,
): Promise<T> {
  const handle = await openDirectoryHandle(source);
  try {
    return await operation(handle);
  } finally {
    await handle.close();
  }
}

async function expectNotCommitted(
  operation: Promise<unknown>,
  message: RegExp,
): Promise<FloodgateExclusiveRenameNotCommittedError> {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(FloodgateExclusiveRenameNotCommittedError);
  if (!(failure instanceof FloodgateExclusiveRenameNotCommittedError)) {
    throw new Error("expected a not-committed failure");
  }
  expect(failure.mayHaveCommitted).toBe(false);
  expect(failure.message).toMatch(message);
  return failure;
}

async function expectIndeterminate(
  operation: Promise<unknown>,
  message: RegExp,
): Promise<FloodgateExclusiveRenameIndeterminateError> {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(FloodgateExclusiveRenameIndeterminateError);
  if (!(failure instanceof FloodgateExclusiveRenameIndeterminateError)) {
    throw new Error("expected an indeterminate failure");
  }
  expect(failure.mayHaveCommitted).toBe(true);
  expect(failure.message).toMatch(message);
  return failure;
}

async function temporaryHelper(
  root: string,
  name: string,
  source: string,
): Promise<Readonly<{ helperPath: string; helperSha256: string }>> {
  const helperPath = path.join(root, name);
  await fs.promises.writeFile(helperPath, source, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(helperPath, 0o644);
  return Object.freeze({
    helperPath,
    helperSha256: createHash("sha256").update(source, "utf8").digest("hex"),
  });
}

type RenameReceipt = Awaited<
  ReturnType<typeof exclusiveRenameFloodgateDirectoryCoreForTests>
>;

function expectFrozenReceipt(
  receipt: RenameReceipt,
  parentBefore: fs.BigIntStats,
  sourceBefore: fs.BigIntStats,
): void {
  expect(receipt).toEqual({
    contract: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
    trust_boundary: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
    status: "verified-committed",
    parent_identity: inode(parentBefore),
    destination_identity: inode(sourceBefore),
  });
  expect(Object.isFrozen(receipt)).toBe(true);
  expect(Object.isFrozen(receipt.parent_identity)).toBe(true);
  expect(Object.isFrozen(receipt.destination_identity)).toBe(true);
}

function committingHelperSource(afterRename: readonly string[]): string {
  return [
    "import os",
    "import sys",
    "PARENT_FD = 3",
    "mode = sys.argv[1]",
    "source = sys.argv[2]",
    "destination = sys.argv[3]",
    "expected_dev = int(sys.argv[4], 10)",
    "expected_ino = int(sys.argv[5], 10)",
    "def stat_at(name):",
    "    try:",
    "        return os.stat(name, dir_fd=PARENT_FD, follow_symlinks=False)",
    "    except FileNotFoundError:",
    "        return None",
    "def matches(value):",
    "    return value is not None and value.st_dev == expected_dev and value.st_ino == expected_ino",
    'if mode == "inspect":',
    "    source_stat = stat_at(source)",
    "    destination_stat = stat_at(destination)",
    "    if source_stat is None and matches(destination_stat):",
    '        os.write(1, b"destination\\n")',
    "    elif matches(source_stat) and destination_stat is None:",
    '        os.write(1, b"source\\n")',
    "    else:",
    '        os.write(1, b"other\\n")',
    "    raise SystemExit(0)",
    "os.rename(source, destination, src_dir_fd=PARENT_FD, dst_dir_fd=PARENT_FD)",
    ...afterRename,
    "",
  ].join("\n");
}

const productionTestDependencies: Readonly<ExclusiveDirectoryRenameDependencies> =
  Object.freeze({
    platform: "darwin",
    pythonExecutable: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_PYTHON,
    helperPath: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER,
    helperSha256: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER_SHA256,
    helperTimeoutMilliseconds: 5_000,
    helperMaxOutputBytes: 4_096,
  });

async function portableTestDependencies(
  overrides: Partial<ExclusiveDirectoryRenameDependencies> = {},
): Promise<Readonly<ExclusiveDirectoryRenameDependencies>> {
  return Object.freeze({
    ...productionTestDependencies,
    pythonExecutable: await fs.promises.realpath(
      FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_PYTHON,
    ),
    ...overrides,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("Floodgate exclusive whole-directory rename", () => {
  it("keeps the portable helper bytes equal to the pinned SHA-256", async () => {
    const helperBytes = await fs.promises.readFile(
      FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER,
    );
    expect(createHash("sha256").update(helperBytes).digest("hex")).toBe(
      FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_HELPER_SHA256,
    );
  });

  darwinIt(
    "returns an exact frozen receipt while preserving the caller-held inode",
    async () => {
      const { parent, source, destination } = await directoryPair();
      const payload = path.join(source, "result.json");
      await fs.promises.writeFile(payload, "sealed result\n", { mode: 0o600 });
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      const parentBefore = await fs.promises.lstat(parent, { bigint: true });
      const sourceHandle = await openDirectoryHandle(source);

      try {
        const receipt = await exclusiveRenameFloodgateDirectory(
          source,
          destination,
          sourceHandle,
        );

        await expectMissing(source);
        const destinationAfter = await fs.promises.lstat(destination, {
          bigint: true,
        });
        const parentAfter = await fs.promises.lstat(parent, { bigint: true });
        const heldSourceAfter = await sourceHandle.stat({ bigint: true });
        expect(receipt).toEqual({
          contract: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
          trust_boundary: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
          status: "verified-committed",
          parent_identity: inode(parentBefore),
          destination_identity: inode(sourceBefore),
        });
        expect(Object.isFrozen(receipt)).toBe(true);
        expect(Object.isFrozen(receipt.parent_identity)).toBe(true);
        expect(Object.isFrozen(receipt.destination_identity)).toBe(true);
        expect(destinationAfter.isDirectory()).toBe(true);
        expect(destinationAfter.isSymbolicLink()).toBe(false);
        expect(inode(destinationAfter)).toEqual(inode(sourceBefore));
        expect(inode(heldSourceAfter)).toEqual(inode(sourceBefore));
        expect(inode(heldSourceAfter)).toEqual(receipt.destination_identity);
        expect(inode(parentAfter)).toEqual(inode(parentBefore));
        expect(
          await fs.promises.readFile(
            path.join(destination, "result.json"),
            "utf8",
          ),
        ).toBe("sealed result\n");
      } finally {
        await sourceHandle.close();
      }
    },
  );

  darwinIt(
    "rejects a caller-held handle for a different directory inode",
    async () => {
      const { parent, source, destination } = await directoryPair();
      const otherSource = path.join(parent, "other-stage");
      await fs.promises.mkdir(otherSource, { mode: 0o700 });
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      const otherBefore = await fs.promises.lstat(otherSource, {
        bigint: true,
      });

      await expectNotCommitted(
        withSourceHandle(otherSource, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /held descriptors do not match their requested pathnames/,
      );

      expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
        inode(sourceBefore),
      );
      expect(
        inode(await fs.promises.lstat(otherSource, { bigint: true })),
      ).toEqual(inode(otherBefore));
      await expectMissing(destination);
    },
  );

  darwinIt(
    "rejects a parent directory whose mode is not exactly 0700",
    async () => {
      const { parent, source, destination } = await directoryPair();
      await fs.promises.chmod(parent, 0o755);
      const parentBefore = await fs.promises.lstat(parent, { bigint: true });
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /held parent must be a current-euid-owned 0700 directory/,
      );

      const parentAfter = await fs.promises.lstat(parent, { bigint: true });
      expect(inode(parentAfter)).toEqual(inode(parentBefore));
      expect(parentAfter.mode & BigInt(0o777)).toBe(BigInt(0o755));
      expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
        inode(sourceBefore),
      );
      await expectMissing(destination);
    },
  );

  darwinIt(
    "rejects a caller-held source whose mode is not exactly 0700",
    async () => {
      const { source, destination } = await directoryPair();
      await fs.promises.chmod(source, 0o755);
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /caller-held source must be a current-euid-owned 0700 directory/,
      );

      const sourceAfter = await fs.promises.lstat(source, { bigint: true });
      expect(inode(sourceAfter)).toEqual(inode(sourceBefore));
      expect(sourceAfter.mode & BigInt(0o777)).toBe(BigInt(0o755));
      await expectMissing(destination);
    },
  );

  darwinIt(
    "rejects a 01700 parent instead of ignoring its sticky bit",
    async () => {
      const { parent, source, destination } = await directoryPair();
      await fs.promises.chmod(parent, 0o1700);
      const parentBefore = await fs.promises.lstat(parent, { bigint: true });
      expect(parentBefore.mode & BigInt(0o7777)).toBe(BigInt(0o1700));

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /held parent must be a current-euid-owned 0700 directory/,
      );

      const parentAfter = await fs.promises.lstat(parent, { bigint: true });
      expect(inode(parentAfter)).toEqual(inode(parentBefore));
      expect(parentAfter.mode & BigInt(0o7777)).toBe(BigInt(0o1700));
      await expectMissing(destination);
    },
  );

  darwinIt(
    "rejects a 01700 held source instead of ignoring its sticky bit",
    async () => {
      const { source, destination } = await directoryPair();
      await fs.promises.chmod(source, 0o1700);
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      expect(sourceBefore.mode & BigInt(0o7777)).toBe(BigInt(0o1700));

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /caller-held source must be a current-euid-owned 0700 directory/,
      );

      const sourceAfter = await fs.promises.lstat(source, { bigint: true });
      expect(inode(sourceAfter)).toEqual(inode(sourceBefore));
      expect(sourceAfter.mode & BigInt(0o7777)).toBe(BigInt(0o1700));
      await expectMissing(destination);
    },
  );

  darwinIt(
    "preserves an existing empty destination directory and its inode",
    async () => {
      const { source, destination } = await directoryPair();
      await fs.promises.mkdir(destination, { mode: 0o700 });
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      const destinationBefore = await fs.promises.lstat(destination, {
        bigint: true,
      });

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /destination already exists/,
      );

      expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
        inode(sourceBefore),
      );
      expect(
        inode(await fs.promises.lstat(destination, { bigint: true })),
      ).toEqual(inode(destinationBefore));
      expect(await fs.promises.readdir(destination)).toEqual([]);
    },
  );

  darwinIt(
    "preserves an existing nonempty destination directory byte-for-byte",
    async () => {
      const { source, destination } = await directoryPair();
      await fs.promises.mkdir(destination, { mode: 0o700 });
      const sentinel = path.join(destination, "sentinel.txt");
      await fs.promises.writeFile(sentinel, "do not replace\n", {
        mode: 0o600,
      });
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      const destinationBefore = await fs.promises.lstat(destination, {
        bigint: true,
      });

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /destination already exists/,
      );

      expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
        inode(sourceBefore),
      );
      expect(
        inode(await fs.promises.lstat(destination, { bigint: true })),
      ).toEqual(inode(destinationBefore));
      expect(await fs.promises.readFile(sentinel, "utf8")).toBe(
        "do not replace\n",
      );
    },
  );

  darwinIt("preserves an existing destination regular file", async () => {
    const { source, destination } = await directoryPair();
    await fs.promises.writeFile(destination, "existing file\n", {
      mode: 0o600,
    });
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const destinationBefore = await fs.promises.lstat(destination, {
      bigint: true,
    });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectory(source, destination, handle),
      ),
      /destination already exists/,
    );

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    expect(
      inode(await fs.promises.lstat(destination, { bigint: true })),
    ).toEqual(inode(destinationBefore));
    expect(await fs.promises.readFile(destination, "utf8")).toBe(
      "existing file\n",
    );
  });

  darwinIt(
    "preserves an existing destination symlink and its referent",
    async () => {
      const { parent, source, destination } = await directoryPair();
      const referent = path.join(parent, "referent.txt");
      await fs.promises.writeFile(referent, "referent stays intact\n", {
        mode: 0o600,
      });
      await fs.promises.symlink(referent, destination);
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      const destinationBefore = await fs.promises.lstat(destination, {
        bigint: true,
      });

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /destination already exists/,
      );

      expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
        inode(sourceBefore),
      );
      expect(
        inode(await fs.promises.lstat(destination, { bigint: true })),
      ).toEqual(inode(destinationBefore));
      expect(await fs.promises.readlink(destination)).toBe(referent);
      expect(await fs.promises.readFile(referent, "utf8")).toBe(
        "referent stays intact\n",
      );
    },
  );

  darwinIt(
    "uses the Darwin no-replace syscall when an empty destination races the precheck",
    async () => {
      const { source, destination } = await directoryPair();
      await fs.promises.writeFile(
        path.join(source, "source.txt"),
        "source inode\n",
        {
          mode: 0o600,
        },
      );
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      let destinationCreatedAfterPrecheck:
        Readonly<{ dev: bigint; ino: bigint }> | undefined;

      await expectNotCommitted(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectoryCoreForTests(
            source,
            destination,
            handle,
            {
              ...productionTestDependencies,
              afterDestinationAbsenceCheckForTests: async () => {
                await fs.promises.mkdir(destination, { mode: 0o700 });
                destinationCreatedAfterPrecheck = inode(
                  await fs.promises.lstat(destination, { bigint: true }),
                );
              },
            },
          ),
        ),
        /held source remained at source: .*destination exists/,
      );

      const sourceAfter = await fs.promises.lstat(source, { bigint: true });
      const destinationAfter = await fs.promises.lstat(destination, {
        bigint: true,
      });
      expect(destinationCreatedAfterPrecheck).toBeDefined();
      expect(inode(sourceAfter)).toEqual(inode(sourceBefore));
      expect(inode(destinationAfter)).toEqual(destinationCreatedAfterPrecheck);
      expect(inode(destinationAfter)).not.toEqual(inode(sourceBefore));
      expect(
        await fs.promises.readFile(path.join(source, "source.txt"), "utf8"),
      ).toBe("source inode\n");
      expect(await fs.promises.readdir(destination)).toEqual([]);
    },
  );

  darwinIt(
    "reports an inode swap as indeterminate without publishing the replacement as final",
    async () => {
      const { parent, source, destination } = await directoryPair();
      const displacedSource = path.join(parent, "displaced-held-source");
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      let replacementIdentity:
        Readonly<{ dev: bigint; ino: bigint }> | undefined;

      await expectIndeterminate(
        withSourceHandle(source, (handle) =>
          exclusiveRenameFloodgateDirectoryCoreForTests(
            source,
            destination,
            handle,
            {
              ...productionTestDependencies,
              afterDestinationAbsenceCheckForTests: async () => {
                await fs.promises.rename(source, displacedSource);
                await fs.promises.mkdir(source, { mode: 0o700 });
                replacementIdentity = inode(
                  await fs.promises.lstat(source, { bigint: true }),
                );
              },
            },
          ),
        ),
        /held source was not at one exclusive name/,
      );

      expect(replacementIdentity).toBeDefined();
      expect(
        inode(await fs.promises.lstat(displacedSource, { bigint: true })),
      ).toEqual(inode(sourceBefore));
      expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
        replacementIdentity,
      );
      expect(replacementIdentity).not.toEqual(inode(sourceBefore));
      await expectMissing(destination);
    },
  );

  it("treats a hook throw after moving the held inode to destination as indeterminate", async () => {
    const { source, destination } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const dependencies = await portableTestDependencies({
      afterDestinationAbsenceCheckForTests: async () => {
        await fs.promises.rename(source, destination);
        throw new Error("hook threw after moving held source");
      },
    });

    await expectIndeterminate(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          dependencies,
        ),
      ),
      /test hook effects were not reconciled: hook threw after moving held source/,
    );

    await expectMissing(source);
    expect(
      inode(await fs.promises.lstat(destination, { bigint: true })),
    ).toEqual(inode(sourceBefore));
  });

  darwinIt(
    "rejects a source symlink without changing it or its referent",
    async () => {
      const root = await temporaryRoot();
      const parent = path.join(root, "publication-parent");
      const realSource = path.join(parent, "real-source");
      const source = path.join(parent, "publish-stage");
      const destination = path.join(parent, "final");
      await fs.promises.mkdir(realSource, { recursive: true, mode: 0o700 });
      await fs.promises.writeFile(
        path.join(realSource, "result.json"),
        "still staged\n",
        {
          mode: 0o600,
        },
      );
      await fs.promises.symlink(realSource, source);
      const sourceBefore = await fs.promises.lstat(source, { bigint: true });
      const realSourceBefore = await fs.promises.lstat(realSource, {
        bigint: true,
      });

      await expectNotCommitted(
        withSourceHandle(realSource, (handle) =>
          exclusiveRenameFloodgateDirectory(source, destination, handle),
        ),
        /source pathname must be a current-euid-owned 0700 directory/,
      );

      expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
        inode(sourceBefore),
      );
      expect(
        inode(await fs.promises.lstat(realSource, { bigint: true })),
      ).toEqual(inode(realSourceBefore));
      expect(await fs.promises.readlink(source)).toBe(realSource);
      expect(
        await fs.promises.readFile(
          path.join(realSource, "result.json"),
          "utf8",
        ),
      ).toBe("still staged\n");
      await expectMissing(destination);
    },
  );

  it("rejects source and destination in different parents before invoking a helper", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source-parent", "publish-stage");
    const destination = path.join(root, "destination-parent", "final");
    await fs.promises.mkdir(source, { recursive: true, mode: 0o700 });
    await fs.promises.mkdir(path.dirname(destination), { mode: 0o700 });
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          {
            ...productionTestDependencies,
            pythonExecutable: path.join(root, "must-not-run"),
          },
        ),
      ),
      /distinct siblings/,
    );

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    await expectMissing(destination);
  });

  it("rejects an identical source and destination before invoking a helper", async () => {
    const { root, source } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(source, source, handle, {
          ...productionTestDependencies,
          pythonExecutable: path.join(root, "must-not-run"),
        }),
      ),
      /distinct siblings/,
    );

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
  });

  it("rejects noncanonical source and destination paths before filesystem mutation", async () => {
    const { parent, source, destination } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const invalidCases = [
      { source: "relative/publish-stage", destination },
      { source: `${parent}/./${path.basename(source)}`, destination },
      { source: ` ${source}`, destination },
      { source: `${source}\0`, destination },
      { source, destination: `${parent}//${path.basename(destination)}` },
      { source, destination: `${destination} ` },
    ];

    await withSourceHandle(source, async (handle) => {
      for (const invalid of invalidCases) {
        await expectNotCommitted(
          exclusiveRenameFloodgateDirectoryCoreForTests(
            invalid.source,
            invalid.destination,
            handle,
            productionTestDependencies,
          ),
          /must be a canonical .*absolute path/,
        );
      }
    });

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    await expectMissing(destination);
  });

  it("fails closed on an unsupported platform without invoking the helper", async () => {
    const { root, source, destination } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          {
            ...productionTestDependencies,
            platform: "linux",
            pythonExecutable: path.join(root, "must-not-run"),
          },
        ),
      ),
      /platform does not provide the pinned Darwin no-replace primitive/,
    );

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    await expectMissing(destination);
  });

  it("rejects a helper symlink before reaching the pre-spawn hook", async () => {
    const { root, source, destination } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const helperTarget = await temporaryHelper(
      root,
      "helper-target.py",
      "raise SystemExit(99)\n",
    );
    const helperSymlink = path.join(root, "helper-symlink.py");
    await fs.promises.symlink(helperTarget.helperPath, helperSymlink);
    let preSpawnHookReached = false;
    const dependencies = await portableTestDependencies({
      helperPath: helperSymlink,
      helperSha256: helperTarget.helperSha256,
      afterDestinationAbsenceCheckForTests: () => {
        preSpawnHookReached = true;
      },
    });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          dependencies,
        ),
      ),
      /helper path must not traverse symbolic links/,
    );

    expect(preSpawnHookReached).toBe(false);
    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    await expectMissing(destination);
  });

  it("rejects a 01644 helper before spawn instead of ignoring its sticky bit", async () => {
    const { root, source, destination } = await directoryPair();
    const helper = await temporaryHelper(
      root,
      "sticky-helper.py",
      "raise SystemExit(99)\n",
    );
    await fs.promises.chmod(helper.helperPath, 0o1644);
    const helperStat = await fs.promises.lstat(helper.helperPath, {
      bigint: true,
    });
    expect(helperStat.mode & BigInt(0o7777)).toBe(BigInt(0o1644));
    let preSpawnHookReached = false;
    const dependencies = await portableTestDependencies({
      ...helper,
      afterDestinationAbsenceCheckForTests: () => {
        preSpawnHookReached = true;
      },
    });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          dependencies,
        ),
      ),
      /helper must be one current-euid-owned 0644 regular inode/,
    );

    expect(preSpawnHookReached).toBe(false);
    await expectMissing(destination);
  });

  it("rejects a helper SHA-256 mismatch before reaching the pre-spawn hook", async () => {
    const { source, destination } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    let preSpawnHookReached = false;
    const dependencies = await portableTestDependencies({
      helperSha256: "0".repeat(64),
      afterDestinationAbsenceCheckForTests: () => {
        preSpawnHookReached = true;
      },
    });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          dependencies,
        ),
      ),
      /helper SHA-256 differs from the pinned source/,
    );

    expect(preSpawnHookReached).toBe(false);
    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    await expectMissing(destination);
  });

  it("reconciles helper failure as not committed without plain rename", async () => {
    const { root, source, destination } = await directoryPair();
    await fs.promises.writeFile(
      path.join(source, "sentinel.txt"),
      "still source\n",
      {
        mode: 0o600,
      },
    );
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const helper = await temporaryHelper(
      root,
      "fail-before-rename.py",
      [
        "import sys",
        'if sys.argv[1] == "inspect":',
        '    sys.stdout.write("source\\n")',
        "    raise SystemExit(0)",
        "raise SystemExit(74)",
        "",
      ].join("\n"),
    );
    const dependencies = await portableTestDependencies(helper);

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          dependencies,
        ),
      ),
      /held source remained at source: code=74/,
    );

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    expect(
      await fs.promises.readFile(path.join(source, "sentinel.txt"), "utf8"),
    ).toBe("still source\n");
    await expectMissing(destination);
  });

  it("kills a timed-out helper and reconciles the held inode at source", async () => {
    const { root, source, destination } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const helper = await temporaryHelper(
      root,
      "timeout-then-inspect.py",
      [
        "import sys",
        "import time",
        'if sys.argv[1] == "inspect":',
        '    sys.stdout.write("source\\n")',
        "    raise SystemExit(0)",
        "time.sleep(10)",
        "",
      ].join("\n"),
    );
    const dependencies = await portableTestDependencies({
      ...helper,
      helperTimeoutMilliseconds: 500,
    });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          dependencies,
        ),
      ),
      /held source remained at source: helper exceeded 500 milliseconds/,
    );

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    await expectMissing(destination);
  });

  it("kills an overproducing helper and reconciles the held inode at source", async () => {
    const { root, source, destination } = await directoryPair();
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const helper = await temporaryHelper(
      root,
      "output-limit-then-inspect.py",
      [
        "import os",
        "import sys",
        "import time",
        'if sys.argv[1] == "inspect":',
        '    sys.stdout.write("source\\n")',
        "    raise SystemExit(0)",
        'os.write(1, b"x" * 4096)',
        "time.sleep(10)",
        "",
      ].join("\n"),
    );
    const dependencies = await portableTestDependencies({
      ...helper,
      helperTimeoutMilliseconds: 2_000,
      helperMaxOutputBytes: 64,
    });

    await expectNotCommitted(
      withSourceHandle(source, (handle) =>
        exclusiveRenameFloodgateDirectoryCoreForTests(
          source,
          destination,
          handle,
          dependencies,
        ),
      ),
      /held source remained at source: helper output exceeded the fixed byte limit/,
    );

    expect(inode(await fs.promises.lstat(source, { bigint: true }))).toEqual(
      inode(sourceBefore),
    );
    await expectMissing(destination);
  });

  it("recovers a frozen receipt when the helper exits nonzero after rename", async () => {
    const { root, parent, source, destination } = await directoryPair();
    const parentBefore = await fs.promises.lstat(parent, { bigint: true });
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const helper = await temporaryHelper(
      root,
      "rename-then-nonzero.py",
      committingHelperSource(["raise SystemExit(74)"]),
    );
    const dependencies = await portableTestDependencies(helper);

    const receipt = await withSourceHandle(source, (handle) =>
      exclusiveRenameFloodgateDirectoryCoreForTests(
        source,
        destination,
        handle,
        dependencies,
      ),
    );

    expectFrozenReceipt(receipt, parentBefore, sourceBefore);
    await expectMissing(source);
    expect(inode(await fs.promises.lstat(parent, { bigint: true }))).toEqual(
      inode(parentBefore),
    );
    expect(
      inode(await fs.promises.lstat(destination, { bigint: true })),
    ).toEqual(inode(sourceBefore));
  });

  it("recovers a frozen receipt when the helper times out after rename", async () => {
    const { root, parent, source, destination } = await directoryPair();
    const parentBefore = await fs.promises.lstat(parent, { bigint: true });
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const helper = await temporaryHelper(
      root,
      "rename-then-timeout.py",
      committingHelperSource(["import time", "time.sleep(10)"]),
    );
    const dependencies = await portableTestDependencies({
      ...helper,
      helperTimeoutMilliseconds: 500,
    });

    const receipt = await withSourceHandle(source, (handle) =>
      exclusiveRenameFloodgateDirectoryCoreForTests(
        source,
        destination,
        handle,
        dependencies,
      ),
    );

    expectFrozenReceipt(receipt, parentBefore, sourceBefore);
    await expectMissing(source);
    expect(inode(await fs.promises.lstat(parent, { bigint: true }))).toEqual(
      inode(parentBefore),
    );
    expect(
      inode(await fs.promises.lstat(destination, { bigint: true })),
    ).toEqual(inode(sourceBefore));
  });

  it("recovers a frozen receipt when helper output exceeds the cap after rename", async () => {
    const { root, parent, source, destination } = await directoryPair();
    const parentBefore = await fs.promises.lstat(parent, { bigint: true });
    const sourceBefore = await fs.promises.lstat(source, { bigint: true });
    const helper = await temporaryHelper(
      root,
      "rename-then-output-limit.py",
      committingHelperSource([
        "import time",
        'os.write(1, b"x" * 4096)',
        "time.sleep(10)",
      ]),
    );
    const dependencies = await portableTestDependencies({
      ...helper,
      helperTimeoutMilliseconds: 2_000,
      helperMaxOutputBytes: 64,
    });

    const receipt = await withSourceHandle(source, (handle) =>
      exclusiveRenameFloodgateDirectoryCoreForTests(
        source,
        destination,
        handle,
        dependencies,
      ),
    );

    expectFrozenReceipt(receipt, parentBefore, sourceBefore);
    await expectMissing(source);
    expect(inode(await fs.promises.lstat(parent, { bigint: true }))).toEqual(
      inode(parentBefore),
    );
    expect(
      inode(await fs.promises.lstat(destination, { bigint: true })),
    ).toEqual(inode(sourceBefore));
  });
});
