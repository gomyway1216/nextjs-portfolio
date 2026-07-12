import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_PYTHON,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
  exclusiveRenameFloodgateDirectoryCoreForTests,
  type ExclusiveDirectoryRenameDependencies,
  type FloodgateExclusiveDirectorySourceHandle,
  type FloodgateExclusiveDirectoryRenameReceipt,
} from "../../../ml/floodgate-exclusive-directory-rename";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  FLOODGATE_TEACHER_STAGE_PUBLICATION_CLAIM_BOUNDARY,
  FLOODGATE_TEACHER_STAGE_PUBLICATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_PUBLICATION_STATUS,
  FLOODGATE_TEACHER_STAGE_PUBLICATION_TRUST_BOUNDARY,
  FloodgateTeacherStagePublicationIndeterminateError,
  FloodgateTeacherStagePublicationNotCommittedError,
  FloodgateTeacherStagePublicationOwnershipTransferredError,
  authorizeFloodgateTeacherStage,
  authorizeFloodgateTeacherStageCoreForTests,
  beginFloodgateTeacherStagePublication,
  beginFloodgateTeacherStagePublicationCoreForTests,
  type FloodgateTeacherStageAuthorizationDependencies,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
  type FloodgateTeacherStagePublicationReceipt,
  type FloodgateTeacherStagePublicationTransaction,
} from "../../../ml/floodgate-teacher-stage-authorization";

const SYNTHETIC_WORK_BYTES = "synthetic sealed checkpoint\n";
const temporaryRoots: string[] = [];
const darwinIt = process.platform === "darwin" ? it : it.skip;
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

interface Fixture {
  readonly root: string;
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly leaseRoot: string;
  readonly workPath: string;
  readonly options: FloodgateTeacherStageAuthorizationOptions;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("publication tests require a POSIX effective uid");
  }
  return process.geteuid();
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(filePath: string, contents: string): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(filePath, 0o600);
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-teacher-stage-publication-test-"),
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
  const leaseRoot = path.join(
    publicationParent,
    `.${stageBasename}.authorization-lease`,
  );
  const workPath = path.join(stageRoot, "work.jsonl");
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
    mkdir0700(stageRoot),
    mkdir0700(evalDir),
  ]);
  await Promise.all([
    write0600(legacyProtectedPositionIdsPath, "synthetic legacy ids\n"),
    write0600(engineBin, "synthetic engine bytes\n"),
    write0600(engineReceipt, '{"synthetic":true}\n'),
    write0600(engineArgument, "synthetic engine argument\n"),
    write0600(path.join(evalDir, "nn.bin"), "synthetic eval bytes\n"),
    write0600(workPath, SYNTHETIC_WORK_BYTES),
  ]);

  return {
    root,
    publicationParent,
    stageRoot,
    destinationRoot,
    leaseRoot,
    workPath,
    options: {
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
    },
  };
}

function authorizationDependencies(
  overrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): FloodgateTeacherStageAuthorizationDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    ...overrides,
  };
}

async function authorizeTestLease(
  value: Fixture,
  dependencyOverrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): Promise<Readonly<FloodgateTeacherStageLease>> {
  return authorizeFloodgateTeacherStageCoreForTests(
    value.options,
    authorizationDependencies(dependencyOverrides),
  );
}

async function authorizeProductionLease(
  value: Fixture,
): Promise<Readonly<FloodgateTeacherStageLease>> {
  return authorizeFloodgateTeacherStage(value.options);
}

function identity(
  stat: fs.BigIntStats,
): Readonly<{ dev: bigint; ino: bigint }> {
  return { dev: stat.dev, ino: stat.ino };
}

function frozenRenameReceipt(
  parent: fs.BigIntStats,
  stage: fs.BigIntStats,
): Readonly<FloodgateExclusiveDirectoryRenameReceipt> {
  // Deliberately use a different insertion order from the production helper.
  // Exact receipt validation must compare the field set, not serialization order.
  return Object.freeze({
    destination_identity: Object.freeze(identity(stage)),
    parent_identity: Object.freeze(identity(parent)),
    status: "verified-committed",
    trust_boundary: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
    contract: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
  });
}

function committingHelperSource(afterRename: readonly string[] = []): string {
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

async function portableRenameDependencies(
  value: Fixture,
  afterRename: readonly string[] = [],
): Promise<Readonly<ExclusiveDirectoryRenameDependencies>> {
  const helperSource = committingHelperSource(afterRename);
  const helperPath = path.join(value.root, "portable-exclusive-rename.py");
  await fs.promises.writeFile(helperPath, helperSource, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(helperPath, 0o644);
  return Object.freeze({
    platform: "darwin",
    pythonExecutable: await fs.promises.realpath(
      FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_PYTHON,
    ),
    helperPath,
    helperSha256: createHash("sha256")
      .update(helperSource, "utf8")
      .digest("hex"),
    helperTimeoutMilliseconds: 5_000,
    helperMaxOutputBytes: 4_096,
  });
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(fs.promises.lstat(filePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
}

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

async function captureCallFailure(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await captureFailure(operation());
  } catch (error) {
    return error;
  }
}

async function movingDependencies(
  value: Fixture,
  overrides: Partial<FloodgateTeacherStagePublicationDependencies> = {},
): Promise<Readonly<FloodgateTeacherStagePublicationDependencies>> {
  const [parentBefore, stageBefore] = await Promise.all([
    fs.promises.lstat(value.publicationParent, { bigint: true }),
    fs.promises.lstat(value.stageRoot, { bigint: true }),
  ]);
  return Object.freeze({
    exclusiveRename: async (
      source: string,
      destination: string,
      _sourceHandle: FloodgateExclusiveDirectorySourceHandle,
    ) => {
      await fs.promises.rename(source, destination);
      return frozenRenameReceipt(parentBefore, stageBefore);
    },
    ...overrides,
  });
}

async function portablePublicationDependencies(
  value: Fixture,
  events?: string[],
): Promise<Readonly<FloodgateTeacherStagePublicationDependencies>> {
  const renameDependencies = await portableRenameDependencies(value);
  return Object.freeze({
    exclusiveRename: async (
      source: string,
      destination: string,
      sourceHandle: FloodgateExclusiveDirectorySourceHandle,
    ) => {
      events?.push("rename");
      return exclusiveRenameFloodgateDirectoryCoreForTests(
        source,
        destination,
        sourceHandle,
        renameDependencies,
      );
    },
    ...(events === undefined
      ? {}
      : {
          beforeDestinationReopenForTests: () => {
            events.push("destination-reopen");
          },
          syncDirectoryForTests: async (
            kind: "parent-before-lease-removal" | "parent-after-lease-removal",
            sync: () => Promise<void>,
          ) => {
            events.push(kind);
            await sync();
          },
          removeLeaseDirectoryForTests: async (
            _leaseRoot: string,
            remove: () => Promise<void>,
          ) => {
            events.push("lease-remove");
            await remove();
          },
        }),
  });
}

function beginTestPublication(
  lease: Readonly<FloodgateTeacherStageLease>,
  dependencies: Readonly<FloodgateTeacherStagePublicationDependencies>,
): Readonly<FloodgateTeacherStagePublicationTransaction> {
  return beginFloodgateTeacherStagePublicationCoreForTests(lease, dependencies);
}

function expectFrozenPublicationReceipt(
  receipt: Readonly<FloodgateTeacherStagePublicationReceipt>,
  lease: Readonly<FloodgateTeacherStageLease>,
  executionBoundary:
    "production-fixed-exclusive-rename" | "test-only-injected-exclusive-rename",
): void {
  expect(receipt).toEqual({
    contract: FLOODGATE_TEACHER_STAGE_PUBLICATION_CONTRACT,
    trust_boundary: FLOODGATE_TEACHER_STAGE_PUBLICATION_TRUST_BOUNDARY,
    status: FLOODGATE_TEACHER_STAGE_PUBLICATION_STATUS,
    claim_boundary: FLOODGATE_TEACHER_STAGE_PUBLICATION_CLAIM_BOUNDARY,
    execution_boundary: executionBoundary,
    publication_durability: "published-and-lease-removal-durable",
    parent_identity: lease.receipt.parent_identity,
    destination_identity: lease.receipt.stage_identity,
    lease_identity: lease.receipt.lease_identity,
    stage_basename: lease.receipt.stage_basename,
    destination_basename: lease.receipt.destination_basename,
  });
  expect(Object.isFrozen(receipt)).toBe(true);
  expect(Object.isFrozen(receipt.parent_identity)).toBe(true);
  expect(Object.isFrozen(receipt.destination_identity)).toBe(true);
  expect(Object.isFrozen(receipt.lease_identity)).toBe(true);
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

posixDescribe("Floodgate teacher stage publication transaction", () => {
  it("uses only one synthetic private work file in its authorization fixture", async () => {
    const value = await fixture();
    const stageBefore = await fs.promises.lstat(value.stageRoot, {
      bigint: true,
    });
    const lease = await authorizeTestLease(value);

    expect(await fs.promises.readdir(value.stageRoot)).toEqual(["work.jsonl"]);
    expect(await fs.promises.readFile(value.workPath, "utf8")).toBe(
      SYNTHETIC_WORK_BYTES,
    );
    expect(identity(stageBefore)).toEqual(lease.receipt.stage_identity);
    await expectMissing(value.destinationRoot);

    await lease.close();
    await expectMissing(value.leaseRoot);
  });

  it("isolates production and test-only begin registries", async () => {
    const productionValue = await fixture();
    const productionLease = await authorizeProductionLease(productionValue);
    const productionDependencies = await movingDependencies(productionValue);

    expect(() =>
      beginTestPublication(productionLease, productionDependencies),
    ).toThrow(/test-only.*exact active unclaimed lease/);
    const productionTransaction =
      beginFloodgateTeacherStagePublication(productionLease);
    await productionTransaction.abort();

    const testValue = await fixture();
    const testLease = await authorizeTestLease(testValue);
    expect(() => beginFloodgateTeacherStagePublication(testLease)).toThrow(
      /production.*exact active unclaimed lease/,
    );
    const testTransaction = beginTestPublication(
      testLease,
      await movingDependencies(testValue),
    );
    await testTransaction.abort();
  });

  it("rejects copied, proxied, and duplicate begin claims without consuming the exact lease", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const dependencies = await movingDependencies(value);
    const copied = { ...lease } as Readonly<FloodgateTeacherStageLease>;
    const proxied = new Proxy(lease, {});

    expect(() => beginTestPublication(copied, dependencies)).toThrow(
      /exact active unclaimed lease/,
    );
    expect(() => beginTestPublication(proxied, dependencies)).toThrow(
      /exact active unclaimed lease/,
    );
    const transaction = beginTestPublication(lease, dependencies);
    expect(() => beginTestPublication(lease, dependencies)).toThrow(
      /exact active unclaimed lease/,
    );
    await transaction.abort();
  });

  it("makes close-before-begin terminal and begin-before-close transfer ownership", async () => {
    const closeFirstValue = await fixture();
    const closeFirstLease = await authorizeTestLease(closeFirstValue);
    const closeFirstDependencies = await movingDependencies(closeFirstValue);
    const closing = closeFirstLease.close();
    expect(() =>
      beginTestPublication(closeFirstLease, closeFirstDependencies),
    ).toThrow(/exact active unclaimed lease/);
    await closing;

    const beginFirstValue = await fixture();
    const beginFirstLease = await authorizeTestLease(beginFirstValue);
    const transaction = beginTestPublication(
      beginFirstLease,
      await movingDependencies(beginFirstValue),
    );
    const closeFailure = await captureCallFailure(() =>
      beginFirstLease.close(),
    );
    expect(closeFailure).toBeInstanceOf(
      FloodgateTeacherStagePublicationOwnershipTransferredError,
    );
    expect(await fs.promises.readFile(beginFirstValue.workPath, "utf8")).toBe(
      SYNTHETIC_WORK_BYTES,
    );
    await transaction.abort();
  });

  it("makes commit and abort first-call-wins with stable Promise identity", async () => {
    const commitValue = await fixture();
    const commitLease = await authorizeTestLease(commitValue);
    const commitTransaction = beginTestPublication(
      commitLease,
      await movingDependencies(commitValue),
    );

    const firstCommit = commitTransaction.commit();
    expect(commitTransaction.phase).toBe("commit-started");
    expect(commitTransaction.commit()).toBe(firstCommit);
    const losingAbort = await captureCallFailure(() =>
      commitTransaction.abort(),
    );
    expect(losingAbort).toBeInstanceOf(
      FloodgateTeacherStagePublicationOwnershipTransferredError,
    );
    await firstCommit;
    expect(commitTransaction.phase).toBe("committed");

    const abortValue = await fixture();
    const abortLease = await authorizeTestLease(abortValue);
    const abortTransaction = beginTestPublication(
      abortLease,
      await movingDependencies(abortValue),
    );
    const firstAbort = abortTransaction.abort();
    expect(abortTransaction.phase).toBe("abort-started");
    expect(abortTransaction.abort()).toBe(firstAbort);
    const losingCommit = await captureCallFailure(() =>
      abortTransaction.commit(),
    );
    expect(losingCommit).toBeInstanceOf(
      FloodgateTeacherStagePublicationOwnershipTransferredError,
    );
    await firstAbort;
    expect(abortTransaction.phase).toBe("aborted");
  });

  it.each(["committed", "aborted"] as const)(
    "keeps the original lease close revoked after a %s transaction without re-entering authorization cleanup",
    async (outcome) => {
      const value = await fixture();
      const authorizationCleanupEvents: string[] = [];
      const lease = await authorizeTestLease(value, {
        beforeLeaseRemovalForTests: () => {
          authorizationCleanupEvents.push("before-lease-removal");
        },
        closeDirectoryForTests: async (kind, close) => {
          authorizationCleanupEvents.push(`close-${kind}`);
          await close();
        },
      });
      const transaction = beginTestPublication(
        lease,
        await movingDependencies(value),
      );
      if (outcome === "committed") {
        await transaction.commit();
      } else {
        await transaction.abort();
      }
      const cleanupEventsBeforeRevokedClose = [...authorizationCleanupEvents];

      const closeFailure = await captureCallFailure(() => lease.close());

      expect(closeFailure).toBeInstanceOf(
        FloodgateTeacherStagePublicationOwnershipTransferredError,
      );
      expect(authorizationCleanupEvents).toEqual(
        cleanupEventsBeforeRevokedClose,
      );
      expect(transaction.phase).toBe(outcome);
    },
  );

  it("publishes through the portable exclusive rename with exact bytes, identity, durability, and ordering", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const stageBefore = await fs.promises.lstat(value.stageRoot, {
      bigint: true,
    });
    const workBefore = await fs.promises.readFile(value.workPath);
    const events: string[] = [];
    const transaction = beginTestPublication(
      lease,
      await portablePublicationDependencies(value, events),
    );

    const receipt = await transaction.commit();

    expectFrozenPublicationReceipt(
      receipt,
      lease,
      "test-only-injected-exclusive-rename",
    );
    expect(events).toEqual([
      "rename",
      "destination-reopen",
      "parent-before-lease-removal",
      "lease-remove",
      "parent-after-lease-removal",
    ]);
    await expectMissing(value.stageRoot);
    await expectMissing(value.leaseRoot);
    const destinationAfter = await fs.promises.lstat(value.destinationRoot, {
      bigint: true,
    });
    expect(identity(destinationAfter)).toEqual(identity(stageBefore));
    expect(receipt.destination_identity).toEqual(identity(stageBefore));
    expect(
      await fs.promises.readFile(
        path.join(value.destinationRoot, "work.jsonl"),
      ),
    ).toEqual(workBefore);
  });

  darwinIt("reports the fixed production execution boundary", async () => {
    const value = await fixture();
    const lease = await authorizeProductionLease(value);
    const transaction = beginFloodgateTeacherStagePublication(lease);

    const receipt = await transaction.commit();

    expectFrozenPublicationReceipt(
      receipt,
      lease,
      "production-fixed-exclusive-rename",
    );
  });

  it("clean-aborts when rename rejects and the exact stage remains at source", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const stageBefore = await fs.promises.lstat(value.stageRoot, {
      bigint: true,
    });
    const transaction = beginTestPublication(lease, {
      exclusiveRename: async () => {
        throw new Error("synthetic rename rejection before mutation");
      },
    });

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationNotCommittedError,
    );
    expect(failure).toMatchObject({
      mayHavePublished: false,
      mayHaveCommitted: false,
      publicationDurability: "not-established",
      destinationReopened: false,
      leaseMayRemain: false,
    });
    expect(transaction.phase).toBe("aborted");
    expect(
      identity(await fs.promises.lstat(value.stageRoot, { bigint: true })),
    ).toEqual(identity(stageBefore));
    await expectMissing(value.destinationRoot);
    await expectMissing(value.leaseRoot);
  });

  it("reconciles an exact move and commits even when rename throws afterward", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const stageBefore = await fs.promises.lstat(value.stageRoot, {
      bigint: true,
    });
    const transaction = beginTestPublication(lease, {
      exclusiveRename: async (source, destination) => {
        await fs.promises.rename(source, destination);
        throw new Error("synthetic throw after exact move");
      },
    });

    const receipt = await transaction.commit();

    expect(receipt.destination_identity).toEqual(identity(stageBefore));
    expect(receipt.publication_durability).toBe(
      "published-and-lease-removal-durable",
    );
    await expectMissing(value.stageRoot);
    await expectMissing(value.leaseRoot);
    expect(
      await fs.promises.readFile(
        path.join(value.destinationRoot, "work.jsonl"),
        "utf8",
      ),
    ).toBe(SYNTHETIC_WORK_BYTES);
  });

  it("treats a committed namespace with a mismatched success receipt as indeterminate", async () => {
    const value = await fixture();
    const foreign = path.join(value.publicationParent, "foreign-directory");
    await mkdir0700(foreign);
    const lease = await authorizeTestLease(value);
    const [parentBefore, foreignBefore] = await Promise.all([
      fs.promises.lstat(value.publicationParent, { bigint: true }),
      fs.promises.lstat(foreign, { bigint: true }),
    ]);
    const transaction = beginTestPublication(lease, {
      exclusiveRename: async (source, destination) => {
        await fs.promises.rename(source, destination);
        return frozenRenameReceipt(parentBefore, foreignBefore);
      },
    });

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({
      phase: "rename",
      publicationDurability: "not-established",
      destinationReopened: false,
      leaseMayRemain: true,
    });
    await expectMissing(value.stageRoot);
    expect((await fs.promises.lstat(value.destinationRoot)).isDirectory()).toBe(
      true,
    );
    expect((await fs.promises.lstat(value.leaseRoot)).isDirectory()).toBe(true);
  });

  it("rejects a success receipt when the namespace did not move", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const [parentBefore, stageBefore] = await Promise.all([
      fs.promises.lstat(value.publicationParent, { bigint: true }),
      fs.promises.lstat(value.stageRoot, { bigint: true }),
    ]);
    const transaction = beginTestPublication(lease, {
      exclusiveRename: async () =>
        frozenRenameReceipt(parentBefore, stageBefore),
    });

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationNotCommittedError,
    );
    expect(failure).toMatchObject({
      mayHavePublished: false,
      mayHaveCommitted: false,
      leaseMayRemain: false,
    });
    expect(transaction.phase).toBe("aborted");
    expect(
      identity(await fs.promises.lstat(value.stageRoot, { bigint: true })),
    ).toEqual(identity(stageBefore));
    await expectMissing(value.destinationRoot);
    await expectMissing(value.leaseRoot);
  });

  it.each([
    {
      name: "both source and destination exist",
      mutate: async (value: Fixture) => {
        await mkdir0700(value.destinationRoot);
      },
    },
    {
      name: "both source and destination are absent",
      mutate: async (value: Fixture) => {
        await fs.promises.rename(
          value.stageRoot,
          path.join(value.publicationParent, "hidden-stage"),
        );
      },
    },
    {
      name: "source is a replacement while destination is the held stage",
      mutate: async (value: Fixture) => {
        await fs.promises.rename(value.stageRoot, value.destinationRoot);
        await mkdir0700(value.stageRoot);
      },
    },
    {
      name: "destination is foreign while the held stage is displaced",
      mutate: async (value: Fixture) => {
        await fs.promises.rename(
          value.stageRoot,
          path.join(value.publicationParent, "displaced-stage"),
        );
        await mkdir0700(value.destinationRoot);
      },
    },
  ])(
    "retains the marker when reconciliation sees $name",
    async ({ mutate }) => {
      const value = await fixture();
      const lease = await authorizeTestLease(value);
      const [parentBefore, stageBefore] = await Promise.all([
        fs.promises.lstat(value.publicationParent, { bigint: true }),
        fs.promises.lstat(value.stageRoot, { bigint: true }),
      ]);
      const transaction = beginTestPublication(lease, {
        exclusiveRename: async () => {
          await mutate(value);
          return frozenRenameReceipt(parentBefore, stageBefore);
        },
      });

      const failure = await captureFailure(transaction.commit());

      expect(failure).toBeInstanceOf(
        FloodgateTeacherStagePublicationIndeterminateError,
      );
      expect(failure).toMatchObject({
        mayHavePublished: true,
        mayHaveCommitted: true,
        phase: "reconcile",
        publicationDurability: "not-established",
        destinationReopened: false,
        leaseMayRemain: true,
      });
      expect(transaction.phase).toBe("indeterminate");
      expect((await fs.promises.lstat(value.leaseRoot)).isDirectory()).toBe(
        true,
      );
    },
  );

  it.each([
    {
      name: "a destination symlink",
      mutate: async (value: Fixture) => {
        const displaced = path.join(
          value.publicationParent,
          "destination-before-symlink",
        );
        await fs.promises.rename(value.destinationRoot, displaced);
        await fs.promises.symlink(displaced, value.destinationRoot);
      },
    },
    {
      name: "a destination with mode 0755",
      mutate: async (value: Fixture) => {
        await fs.promises.chmod(value.destinationRoot, 0o755);
      },
    },
    {
      name: "a replacement destination inode",
      mutate: async (value: Fixture) => {
        await fs.promises.rename(
          value.destinationRoot,
          path.join(value.publicationParent, "displaced-destination"),
        );
        await mkdir0700(value.destinationRoot);
      },
    },
  ])(
    "rejects $name before destination reopen and retains the marker",
    async ({ mutate }) => {
      const value = await fixture();
      const lease = await authorizeTestLease(value);
      const dependencies = await movingDependencies(value, {
        beforeDestinationReopenForTests: async () => mutate(value),
      });
      const transaction = beginTestPublication(lease, dependencies);

      const failure = await captureFailure(transaction.commit());

      expect(failure).toBeInstanceOf(
        FloodgateTeacherStagePublicationIndeterminateError,
      );
      expect(failure).toMatchObject({
        mayHavePublished: true,
        mayHaveCommitted: true,
        publicationDurability: "not-established",
        destinationReopened: false,
        leaseMayRemain: true,
      });
      expect((await fs.promises.lstat(value.leaseRoot)).isDirectory()).toBe(
        true,
      );
    },
  );

  it("rejects a swapped publication-parent pathname and preserves the original marker", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const displacedParent = path.join(value.root, "displaced-publication");
    const dependencies = await movingDependencies(value, {
      beforeReconcileForTests: async () => {
        await fs.promises.rename(value.publicationParent, displacedParent);
        await mkdir0700(value.publicationParent);
      },
    });
    const transaction = beginTestPublication(lease, dependencies);

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({
      destinationReopened: false,
      leaseMayRemain: true,
      publicationDurability: "not-established",
    });
    expect(
      (
        await fs.promises.lstat(
          path.join(
            displacedParent,
            `.${lease.receipt.stage_basename}.authorization-lease`,
          ),
        )
      ).isDirectory(),
    ).toBe(true);
  });

  it("rejects a replacement at the source pathname after the held stage moved", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const dependencies = await movingDependencies(value, {
      beforeReconcileForTests: async () => {
        await mkdir0700(value.stageRoot);
      },
    });
    const transaction = beginTestPublication(lease, dependencies);

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({ leaseMayRemain: true });
    expect((await fs.promises.lstat(value.leaseRoot)).isDirectory()).toBe(true);
  });

  it("retains the marker when the first parent fsync fails", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const transaction = beginTestPublication(
      lease,
      await movingDependencies(value, {
        syncDirectoryForTests: async (kind, sync) => {
          if (kind === "parent-before-lease-removal") {
            throw new Error("synthetic first parent fsync failure");
          }
          await sync();
        },
      }),
    );

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({
      mayHavePublished: true,
      mayHaveCommitted: true,
      phase: "parent-sync-before-lease-removal",
      publicationDurability: "not-established",
      destinationReopened: true,
      leaseMayRemain: true,
    });
    expect((await fs.promises.lstat(value.leaseRoot)).isDirectory()).toBe(true);
  });

  it("reports a preflight failure distinctly from post-rename reconciliation", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    let renameCalled = false;
    const transaction = beginTestPublication(lease, {
      exclusiveRename: async () => {
        renameCalled = true;
        throw new Error("rename must not run after failed preflight");
      },
    });
    await fs.promises.chmod(value.stageRoot, 0o755);

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationNotCommittedError,
    );
    expect(failure).toMatchObject({
      phase: "preflight",
      publicationDurability: "not-established",
      destinationReopened: false,
    });
    expect(renameCalled).toBe(false);
    await expectMissing(value.destinationRoot);
  });

  it("classifies a second parent fsync failure after marker removal", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const transaction = beginTestPublication(
      lease,
      await movingDependencies(value, {
        syncDirectoryForTests: async (kind, sync) => {
          if (kind === "parent-after-lease-removal") {
            throw new Error("synthetic second parent fsync failure");
          }
          await sync();
        },
      }),
    );

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({
      mayHavePublished: true,
      mayHaveCommitted: true,
      phase: "parent-sync-after-lease-removal",
      publicationDurability: "renamed-parent-synced",
      destinationReopened: true,
      leaseMayRemain: true,
    });
    await expectMissing(value.leaseRoot);
  });

  it("retains the marker when its exact rmdir fails after the first parent fsync", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const transaction = beginTestPublication(
      lease,
      await movingDependencies(value, {
        removeLeaseDirectoryForTests: async () => {
          throw new Error("synthetic marker rmdir failure");
        },
      }),
    );

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({
      publicationDurability: "renamed-parent-synced",
      destinationReopened: true,
      leaseMayRemain: true,
    });
    expect((await fs.promises.lstat(value.leaseRoot)).isDirectory()).toBe(true);
  });

  it("classifies a lease-descriptor close failure without deleting the marker", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const transaction = beginTestPublication(
      lease,
      await movingDependencies(value, {
        closePublicationDirectoryForTests: async (kind, close) => {
          await close();
          if (kind === "lease") {
            throw new Error("synthetic lease close failure");
          }
        },
      }),
    );

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({
      publicationDurability: "renamed-parent-synced",
      destinationReopened: true,
      leaseMayRemain: true,
    });
    expect(
      (failure as { cleanupFailures: readonly unknown[] }).cleanupFailures,
    ).not.toHaveLength(0);
    expect((await fs.promises.lstat(value.leaseRoot)).isDirectory()).toBe(true);
  });

  it.each(["destination", "stage", "parent"] as const)(
    "keeps the durable publication classification when final %s close reports failure",
    async (failingKind) => {
      const value = await fixture();
      const lease = await authorizeTestLease(value);
      const transaction = beginTestPublication(
        lease,
        await movingDependencies(value, {
          closePublicationDirectoryForTests: async (kind, close) => {
            await close();
            if (kind === failingKind) {
              throw new Error(`synthetic ${failingKind} close failure`);
            }
          },
        }),
      );

      const failure = await captureFailure(transaction.commit());

      expect(failure).toBeInstanceOf(
        FloodgateTeacherStagePublicationIndeterminateError,
      );
      expect(failure).toMatchObject({
        mayHavePublished: true,
        mayHaveCommitted: true,
        publicationDurability: "published-and-lease-removal-durable",
        destinationReopened: true,
        leaseMayRemain: false,
      });
      expect(
        (failure as { cleanupFailures: readonly unknown[] }).cleanupFailures,
      ).not.toHaveLength(0);
      await expectMissing(value.leaseRoot);
      await expectMissing(value.stageRoot);
      expect(
        await fs.promises.readFile(
          path.join(value.destinationRoot, "work.jsonl"),
          "utf8",
        ),
      ).toBe(SYNTHETIC_WORK_BYTES);
    },
  );

  it("preserves the first durability failure, collects cleanup failures, and closes each descriptor once", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const closeCounts = new Map<string, number>();
    const primaryFailure = new Error("synthetic second sync primary");
    const transaction = beginTestPublication(
      lease,
      await movingDependencies(value, {
        syncDirectoryForTests: async (kind, sync) => {
          if (kind === "parent-after-lease-removal") throw primaryFailure;
          await sync();
        },
        closePublicationDirectoryForTests: async (kind, close) => {
          closeCounts.set(kind, (closeCounts.get(kind) ?? 0) + 1);
          await close();
          if (kind === "destination" || kind === "parent") {
            throw new Error(`synthetic ${kind} cleanup failure`);
          }
        },
      }),
    );

    const failure = await captureFailure(transaction.commit());

    expect(failure).toBeInstanceOf(
      FloodgateTeacherStagePublicationIndeterminateError,
    );
    expect(failure).toMatchObject({
      phase: "parent-sync-after-lease-removal",
      primary: primaryFailure,
      publicationDurability: "renamed-parent-synced",
      leaseMayRemain: true,
    });
    const cleanupFailures = (failure as { cleanupFailures: readonly unknown[] })
      .cleanupFailures;
    expect(cleanupFailures).toHaveLength(2);
    expect(cleanupFailures.map((entry) => (entry as Error).message)).toEqual([
      "synthetic destination cleanup failure",
      "synthetic parent cleanup failure",
    ]);
    expect(Object.fromEntries(closeCounts)).toEqual({
      "rename-source": 1,
      destination: 1,
      lease: 1,
      stage: 1,
      parent: 1,
    });
  });

  it("keeps its evidence boundary namespace-only and has no proposal/checkpoint pipeline imports", async () => {
    const value = await fixture();
    const lease = await authorizeTestLease(value);
    const transaction = beginTestPublication(
      lease,
      await movingDependencies(value),
    );

    const receipt = await transaction.commit();

    expect(receipt.claim_boundary).toBe(
      FLOODGATE_TEACHER_STAGE_PUBLICATION_CLAIM_BOUNDARY,
    );
    const receiptKeys = Object.keys(receipt);
    for (const forbiddenKey of [
      "proposal",
      "teacher_label",
      "playing_strength",
      "sfen",
      "usi",
    ]) {
      expect(receiptKeys).not.toContain(forbiddenKey);
    }
    const source = await fs.promises.readFile(
      path.resolve(
        __dirname,
        "../../../ml/floodgate-teacher-stage-authorization.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /(?:from\s+|import\s*\(\s*)["']\.\/(?:floodgate-stable-proposal|floodgate-stable-proposal-checkpoint|floodgate-training-row-consumer)/,
    );
  });
});
