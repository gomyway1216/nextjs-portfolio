import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
  FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_CLAIM_BOUNDARY,
  FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_CONTRACT,
  FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES,
  FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_MANIFEST_MAX_BYTES,
  FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_TRAINING_RAW_MAX_BYTES,
  FLOODGATE_V7_PORTABLE_COPY_WITNESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PORTABLE_COPY_WITNESS_CONTRACT,
  claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests,
  copyFloodgateV7PortableSourceByValueCoreForTests,
  presealFloodgateV7PortableCopySource,
  presealFloodgateV7PortableCopySourceCoreForTests,
  revokeFloodgateV7PortableCopyCompositeDestinationSeal,
  revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests,
  sealFloodgateV7PortableCopyCompositeDestinationCoreForTests,
  sealFloodgateV7PortableCopySourceFilesystem,
  sealFloodgateV7PortableCopySourceFilesystemCoreForTests,
  withFloodgateV7PortableCopyCompositeDestinationRevalidation,
  withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests,
  withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests,
  type FloodgateV7PortableCopyCompositeDestinationSeal,
  type FloodgateV7PortableCopyKind,
  type FloodgateV7PortableCopyWitness,
  type FloodgateV7PortableCopyWitnessResult,
} from "../../../ml/floodgate-v7-clean-room-copy";

const roots: string[] = [];
const effectiveUserId = process.geteuid?.() ?? 501;
const kinds = [
  "raw-lock-tree",
  "role-lock-tree",
  "role-bundle-tree",
  "legacy-file",
] as const satisfies readonly FloodgateV7PortableCopyKind[];

interface PortableFixture {
  readonly root: string;
  readonly sources: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
  readonly destinations: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
}

async function privateDirectory(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function privateFile(file: string, content: string): Promise<void> {
  await fs.promises.writeFile(file, content, { mode: 0o600 });
  await fs.promises.chmod(file, 0o600);
}

async function fixture(overlap = false): Promise<Readonly<PortableFixture>> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-portable-copy-"),
    ),
  );
  roots.push(root);
  await fs.promises.chmod(root, 0o700);
  const sourceParent = path.join(root, "sources");
  const destinationParent = path.join(root, "destinations");
  const legacyDestinationParent = path.join(root, "legacy-destination");
  await privateDirectory(sourceParent);
  await privateDirectory(destinationParent);
  await privateDirectory(legacyDestinationParent);

  const sources = Object.freeze({
    "raw-lock-tree": path.join(sourceParent, "raw"),
    "role-lock-tree": path.join(sourceParent, "role"),
    "role-bundle-tree": path.join(sourceParent, "bundle"),
    "legacy-file": path.join(sourceParent, "legacy.txt"),
  });
  await Promise.all(
    kinds.slice(0, 3).map(async (kind) => {
      await privateDirectory(sources[kind]);
      await privateFile(path.join(sources[kind], `${kind}.txt`), `${kind}\n`);
    }),
  );
  await privateFile(sources["legacy-file"], "legacy\n");

  const rawDestination = path.join(destinationParent, "raw");
  const destinations = Object.freeze({
    "raw-lock-tree": rawDestination,
    "role-lock-tree": overlap
      ? path.join(rawDestination, "role")
      : path.join(destinationParent, "role"),
    "role-bundle-tree": path.join(destinationParent, "bundle"),
    "legacy-file": path.join(legacyDestinationParent, "legacy.txt"),
  });
  return Object.freeze({ root, sources, destinations });
}

async function heldRoleBundleFixture(): Promise<Readonly<PortableFixture>> {
  const value = await fixture();
  const roleBundle = value.sources["role-bundle-tree"];
  await fs.promises.rm(path.join(roleBundle, "role-bundle-tree.txt"));
  for (const filename of FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES) {
    await privateFile(path.join(roleBundle, filename), `${filename}\n`);
  }
  return value;
}

async function resultsFor(
  value: Readonly<PortableFixture>,
  maxEntries?: number,
): Promise<readonly Readonly<FloodgateV7PortableCopyWitnessResult>[]> {
  const preseals = await Promise.all(
    kinds.map((kind) =>
      presealFloodgateV7PortableCopySourceCoreForTests(
        kind,
        value.sources[kind],
        value.destinations[kind],
        {
          effectiveUserId,
          ...(maxEntries === undefined ? {} : { maxEntries }),
        },
      ),
    ),
  );
  const seals = await Promise.all(
    kinds.map((kind, index) =>
      sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        kind,
        preseals[index]!,
      ),
    ),
  );
  const results = [];
  for (const [index, kind] of kinds.entries()) {
    results.push(
      await copyFloodgateV7PortableSourceByValueCoreForTests(
        kind,
        seals[index]!,
        value.destinations[kind],
      ),
    );
  }
  return Object.freeze(results);
}

async function witnessesFor(
  value: Readonly<PortableFixture>,
  maxEntries?: number,
): Promise<readonly FloodgateV7PortableCopyWitness[]> {
  return Object.freeze(
    (await resultsFor(value, maxEntries)).map((result) => result.witness),
  );
}

async function compositeFor(
  value: Readonly<PortableFixture>,
): Promise<FloodgateV7PortableCopyCompositeDestinationSeal> {
  return sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
    await witnessesFor(value),
  );
}

async function rejectionOf(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error("expected rejection");
}

function synchronousFailureOf(operation: () => void): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected synchronous rejection");
}

function runPoisoningChild(
  mode: "array-includes" | "weak-collections" | "collections",
): void {
  const child = spawnSync(
    process.execPath,
    [
      "-r",
      "tsx/cjs",
      path.join(__dirname, "floodgateV7PortableCopyWitnessPoisoning.child.ts"),
      mode,
    ],
    {
      cwd: path.resolve(__dirname, "../../.."),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        LANG: "C",
        LC_ALL: "C",
        NODE_ENV: "test",
        FORCE_COLOR: "0",
      },
      timeout: 30_000,
    },
  );
  if (child.error !== undefined) throw child.error;
  if (child.status !== 0) {
    throw new Error(
      `poisoning child failed (${mode}):\n${child.stdout}\n${child.stderr}`,
    );
  }
  expect(child.signal).toBeNull();
  expect(child.stdout.trim()).toBe(`PASS ${mode}`);
  expect(child.stderr).toBe("");
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

describe("Floodgate v7 portable copy filesystem witness foundation", () => {
  it("seals four exact new-inode copies and revalidates three serialized borrows", async () => {
    expect(FLOODGATE_V7_PORTABLE_COPY_WITNESS_CLAIM_BOUNDARY).toContain(
      "not-callback-time-namespace-exclusivity-or-semantic-input-authenticity",
    );
    const value = await fixture();
    const rawSource = await fs.promises.lstat(
      path.join(value.sources["raw-lock-tree"], "raw-lock-tree.txt"),
      { bigint: true },
    );
    const results = await resultsFor(value);
    const raw = results[0]!;
    expect(raw.receipt.contract).toBe(FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT);
    expect(JSON.stringify(raw)).not.toContain(value.root);
    expect(JSON.stringify(raw)).not.toMatch(/[a-f0-9]{64}/u);

    const composite =
      await sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
        results.map((result) => result.witness),
      );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => "first",
      ),
    ).resolves.toBe("first");
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        async () => "second",
      ),
    ).resolves.toBe("second");
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => Promise.resolve("third"),
      ),
    ).resolves.toBe("third");

    const rawDestination = await fs.promises.lstat(
      path.join(value.destinations["raw-lock-tree"], "raw-lock-tree.txt"),
      { bigint: true },
    );
    expect(
      await fs.promises.readFile(
        path.join(value.destinations["raw-lock-tree"], "raw-lock-tree.txt"),
        "utf8",
      ),
    ).toBe("raw-lock-tree\n");
    expect(Number(rawDestination.mode & BigInt(0o7777))).toBe(0o600);
    expect(rawDestination.nlink).toBe(BigInt(1));
    expect([rawDestination.dev, rawDestination.ino]).not.toEqual([
      rawSource.dev,
      rawSource.ino,
    ]);
  });

  it("rejects source mutation after the one-shot filesystem seal", async () => {
    const value = await fixture();
    const preseal = await presealFloodgateV7PortableCopySourceCoreForTests(
      "role-lock-tree",
      value.sources["role-lock-tree"],
      value.destinations["role-lock-tree"],
      { effectiveUserId },
    );
    const seal = await sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
      "role-lock-tree",
      preseal,
    );
    await privateFile(
      path.join(value.sources["role-lock-tree"], "role-lock-tree.txt"),
      "mutated\n",
    );
    await expect(
      copyFloodgateV7PortableSourceByValueCoreForTests(
        "role-lock-tree",
        seal,
        value.destinations["role-lock-tree"],
      ),
    ).rejects.toMatchObject({ operation: "copy" });
    await expect(
      copyFloodgateV7PortableSourceByValueCoreForTests(
        "role-lock-tree",
        seal,
        value.destinations["role-lock-tree"],
      ),
    ).rejects.toMatchObject({ operation: "copy" });
  });

  it("rejects tree-root and standalone-file delete/recreate with identical bytes", async () => {
    const tree = await fixture();
    const treePreseal = await presealFloodgateV7PortableCopySourceCoreForTests(
      "role-bundle-tree",
      tree.sources["role-bundle-tree"],
      tree.destinations["role-bundle-tree"],
      { effectiveUserId },
    );
    await fs.promises.rm(tree.sources["role-bundle-tree"], {
      recursive: true,
    });
    await privateDirectory(tree.sources["role-bundle-tree"]);
    await privateFile(
      path.join(tree.sources["role-bundle-tree"], "role-bundle-tree.txt"),
      "role-bundle-tree\n",
    );
    await expect(
      sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        "role-bundle-tree",
        treePreseal,
      ),
    ).rejects.toMatchObject({ operation: "seal" });

    const file = await fixture();
    const filePreseal = await presealFloodgateV7PortableCopySourceCoreForTests(
      "legacy-file",
      file.sources["legacy-file"],
      file.destinations["legacy-file"],
      { effectiveUserId },
    );
    await fs.promises.rm(file.sources["legacy-file"]);
    await privateFile(file.sources["legacy-file"], "legacy\n");
    await expect(
      sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        "legacy-file",
        filePreseal,
      ),
    ).rejects.toMatchObject({ operation: "seal" });
  });

  it("rejects preseal, seal, and witness replay plus structural and cross-kind fakes", async () => {
    const value = await fixture();
    const preseal = await presealFloodgateV7PortableCopySourceCoreForTests(
      "raw-lock-tree",
      value.sources["raw-lock-tree"],
      value.destinations["raw-lock-tree"],
      { effectiveUserId },
    );
    await expect(
      sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        "role-lock-tree",
        preseal,
      ),
    ).rejects.toMatchObject({ operation: "seal" });
    await expect(
      sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        "raw-lock-tree",
        preseal,
      ),
    ).rejects.toMatchObject({ operation: "seal" });
    await expect(
      sealFloodgateV7PortableCopySourceFilesystemCoreForTests("raw-lock-tree", {
        ...preseal,
      }),
    ).rejects.toMatchObject({ operation: "seal" });
  });

  it("captures the exact witness list without consulting mutable Array.prototype.includes", () => {
    runPoisoningChild("array-includes");
  });

  it("keeps WeakMap and WeakSet poisoning from forging, replaying, or revoking capabilities", () => {
    runPoisoningChild("weak-collections");
  });

  it("keeps exact composition and mutation revalidation under collection prototype poisoning", () => {
    runPoisoningChild("collections");
  });

  it("keeps production and test capability registries disjoint", async () => {
    const value = await fixture();
    const testPreseal = await presealFloodgateV7PortableCopySourceCoreForTests(
      "raw-lock-tree",
      value.sources["raw-lock-tree"],
      value.destinations["raw-lock-tree"],
      { effectiveUserId },
    );
    await expect(
      sealFloodgateV7PortableCopySourceFilesystem("raw-lock-tree", testPreseal),
    ).rejects.toMatchObject({ operation: "seal" });

    const productionPreseal = await presealFloodgateV7PortableCopySource(
      "raw-lock-tree",
      value.sources["raw-lock-tree"],
      value.destinations["raw-lock-tree"],
      { effectiveUserId },
    );
    await expect(
      sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        "raw-lock-tree",
        productionPreseal,
      ),
    ).rejects.toMatchObject({ operation: "seal" });

    const composite = await compositeFor(await fixture());
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidation(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(
      synchronousFailureOf(() =>
        revokeFloodgateV7PortableCopyCompositeDestinationSeal(composite),
      ),
    ).toMatchObject({
      operation: "revoke",
    });
    expect(
      synchronousFailureOf(() =>
        revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
          {} as FloodgateV7PortableCopyCompositeDestinationSeal,
        ),
      ),
    ).toMatchObject({
      operation: "revoke",
    });
  });

  it("never invokes a callback length getter before composite prevalidation", async () => {
    const composite = await compositeFor(await fixture());
    let getterCalls = 0;
    let callbackCalls = 0;
    const callback = (): void => {
      callbackCalls += 1;
    };
    Object.defineProperty(callback, "length", {
      configurable: true,
      get: () => {
        getterCalls += 1;
        return 0;
      },
    });

    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        {} as FloodgateV7PortableCopyCompositeDestinationSeal,
        callback,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        callback,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(getterCalls).toBe(0);
    expect(callbackCalls).toBe(0);
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => "still-valid",
      ),
    ).resolves.toBe("still-valid");
  });

  it("rejects duplicate or ancestor-overlapping destinations before composite capture", async () => {
    const overlap = await fixture(true);
    const witnesses = await witnessesFor(overlap);
    await expect(
      sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(witnesses),
    ).rejects.toMatchObject({ operation: "composite" });

    const duplicate = await fixture();
    const rawPreseal = await presealFloodgateV7PortableCopySourceCoreForTests(
      "raw-lock-tree",
      duplicate.sources["raw-lock-tree"],
      duplicate.destinations["raw-lock-tree"],
      { effectiveUserId },
    );
    const rolePreseal = await presealFloodgateV7PortableCopySourceCoreForTests(
      "role-lock-tree",
      duplicate.sources["role-lock-tree"],
      duplicate.destinations["raw-lock-tree"],
      { effectiveUserId },
    );
    const rawSeal =
      await sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        "raw-lock-tree",
        rawPreseal,
      );
    const roleSeal =
      await sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
        "role-lock-tree",
        rolePreseal,
      );
    await copyFloodgateV7PortableSourceByValueCoreForTests(
      "raw-lock-tree",
      rawSeal,
      duplicate.destinations["raw-lock-tree"],
    );
    await expect(
      copyFloodgateV7PortableSourceByValueCoreForTests(
        "role-lock-tree",
        roleSeal,
        duplicate.destinations["raw-lock-tree"],
      ),
    ).rejects.toMatchObject({ operation: "copy" });
  });

  it("requires exactly one witness of every fixed kind without consuming a malformed list", async () => {
    const witnesses = await witnessesFor(await fixture());
    await expect(
      sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
        witnesses.slice(0, 3),
      ),
    ).rejects.toMatchObject({ operation: "composite" });
    await expect(
      sealFloodgateV7PortableCopyCompositeDestinationCoreForTests([
        witnesses[0]!,
        witnesses[0]!,
        witnesses[2]!,
        witnesses[3]!,
      ]),
    ).rejects.toMatchObject({ operation: "composite" });
    await expect(
      sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(witnesses),
    ).resolves.toBeDefined();
    await expect(
      sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(witnesses),
    ).rejects.toMatchObject({ operation: "composite" });
  });

  it("bounds each shared-parent scan before retaining an extra entry", async () => {
    const witnesses = await witnessesFor(await fixture(), 1);
    await expect(
      sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(witnesses),
    ).rejects.toMatchObject({ operation: "composite" });
    const implementation = await fs.promises.readFile(
      path.join(process.cwd(), "ml", "floodgate-v7-clean-room-copy.ts"),
      "utf8",
    );
    expect(implementation).toContain("if (dirents.length >= maxEntries)");
    expect(implementation).toContain(
      "const directory = await fs.promises.opendir(parent)",
    );
  });

  it("makes idle revocation idempotent and permanently rejects reuse", async () => {
    const composite = await compositeFor(await fixture());
    revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
      composite,
    );
    revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
      composite,
    );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("makes active revocation fail the current borrow and every replay", async () => {
    const composite = await compositeFor(await fixture());
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const enteredGate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run =
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        async () => {
          entered?.();
          await releaseGate;
        },
      );
    await enteredGate;
    revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
      composite,
    );
    release?.();
    await expect(run).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("permanently invalidates callback failure and concurrent use", async () => {
    const composite = await compositeFor(await fixture());
    const secret = "private-semantic-operation-detail";
    const failure = await rejectionOf(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => {
          throw new Error(secret);
        },
      ),
    );
    expect(failure).toMatchObject({
      contract: FLOODGATE_V7_PORTABLE_COPY_WITNESS_CONTRACT,
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(secret);
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });

    const asyncComposite = await compositeFor(await fixture());
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        asyncComposite,
        () => Promise.reject(new Error("private async rejection")),
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        asyncComposite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("rejects a concurrent borrow atomically and invalidates the active one", async () => {
    const composite = await compositeFor(await fixture());
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const enteredGate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const active =
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        async () => {
          entered?.();
          await releaseGate;
        },
      );
    await enteredGate;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    release?.();
    await expect(active).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("invalidates the seal when an exact shared-parent sibling is added", async () => {
    const value = await fixture();
    const composite = await compositeFor(value);
    await privateFile(
      path.join(path.dirname(value.destinations["raw-lock-tree"]), "extra"),
      "extra\n",
    );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("rejects destination byte, root-inode, extra-entry, and missing-entry mutations", async () => {
    const byte = await fixture();
    const byteComposite = await compositeFor(byte);
    await privateFile(
      path.join(byte.destinations["role-bundle-tree"], "role-bundle-tree.txt"),
      "changed-byte-role\n",
    );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        byteComposite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });

    const swapped = await fixture();
    const swappedComposite = await compositeFor(swapped);
    const swappedRoot = swapped.destinations["raw-lock-tree"];
    await fs.promises.rename(swappedRoot, `${swappedRoot}-old`);
    await privateDirectory(swappedRoot);
    await privateFile(
      path.join(swappedRoot, "raw-lock-tree.txt"),
      "raw-lock-tree\n",
    );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        swappedComposite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });

    const extra = await fixture();
    const extraComposite = await compositeFor(extra);
    await privateFile(
      path.join(extra.destinations["raw-lock-tree"], "extra"),
      "extra\n",
    );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        extraComposite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });

    const missing = await fixture();
    const missingComposite = await compositeFor(missing);
    await fs.promises.rm(
      path.join(missing.destinations["role-lock-tree"], "role-lock-tree.txt"),
    );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        missingComposite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("runs thenable assimilation inside the pre/post revalidation boundary", async () => {
    const value = await fixture();
    const composite = await compositeFor(value);
    const destinationFile = path.join(
      value.destinations["role-lock-tree"],
      "role-lock-tree.txt",
    );
    const hostileThenable = Object.freeze({
      get then() {
        return (resolve: (value: string) => void): void => {
          void fs.promises
            .writeFile(destinationFile, "mutated\n", { mode: 0o600 })
            .then(() => resolve("ignored"));
        };
      },
    });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests<unknown>(
        composite,
        () => hostileThenable,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("holds, claims, and zeroizes the exact nine-file role-bundle snapshot", async () => {
    expect(FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_CONTRACT).toBe(
      "shogi-floodgate-v7-portable-copy-held-role-bundle-v1",
    );
    expect(
      FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_CLAIM_BOUNDARY,
    ).toContain(
      "exact-nine-fixed-file-no-follow-open-fstat-read-sha256-explicit-eof",
    );
    const value = await heldRoleBundleFixture();
    await privateFile(
      path.join(
        value.sources["role-bundle-tree"],
        "replay-excluded-position-ids.txt",
      ),
      "",
    );
    const composite = await compositeFor(value);
    let manifestBytes: Uint8Array | undefined;
    let trainingRawBytes: Uint8Array | undefined;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (claim) => {
          const snapshot =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            );
          expect(Object.isFrozen(snapshot)).toBe(true);
          expect(Object.isFrozen(snapshot.files)).toBe(true);
          expect(snapshot.files.map((file) => file.filename)).toEqual(
            FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES,
          );
          expect(snapshot.files.every((file) => Object.isFrozen(file))).toBe(
            true,
          );
          expect(
            snapshot.files.find(
              (file) => file.filename === "replay-excluded-position-ids.txt",
            ),
          ).toMatchObject({
            bytes: 0,
            sha256:
              "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          });
          expect(JSON.stringify(snapshot.files)).not.toContain(value.root);
          expect(JSON.stringify(snapshot.files)).not.toContain('"dev"');
          expect(JSON.stringify(snapshot.files)).not.toContain('"ino"');
          expect(new TextDecoder().decode(snapshot.manifestBytes)).toBe(
            "manifest.json\n",
          );
          expect(new TextDecoder().decode(snapshot.trainingRawBytes)).toBe(
            "training.raw.jsonl\n",
          );
          expect(snapshot.manifestBytes.buffer).toBeInstanceOf(
            SharedArrayBuffer,
          );
          expect(() =>
            structuredClone(snapshot.manifestBytes, {
              transfer: [snapshot.manifestBytes.buffer as ArrayBuffer],
            }),
          ).toThrow();
          expect(new TextDecoder().decode(snapshot.manifestBytes)).toBe(
            "manifest.json\n",
          );
          manifestBytes = snapshot.manifestBytes;
          trainingRawBytes = snapshot.trainingRawBytes;
          return "held";
        },
      ),
    ).resolves.toBe("held");
    expect(Array.from(manifestBytes ?? [])).toEqual(
      new Array(manifestBytes?.byteLength ?? 0).fill(0),
    );
    expect(Array.from(trainingRawBytes ?? [])).toEqual(
      new Array(trainingRawBytes?.byteLength ?? 0).fill(0),
    );
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite,
        () => "still-bound",
      ),
    ).resolves.toBe("still-bound");
  });

  it("rejects a non-nine-file bundle before callback and a fresh-inode pre-open swap", async () => {
    expect(FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_MANIFEST_MAX_BYTES).toBe(
      64 * 1024,
    );
    expect(
      FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_TRAINING_RAW_MAX_BYTES,
    ).toBe(64 * 1024 * 1024);
    const malformed = await compositeFor(await fixture());
    let malformedCalls = 0;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        malformed,
        (_claim) => {
          malformedCalls += 1;
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(malformedCalls).toBe(0);

    const oversized = await heldRoleBundleFixture();
    await fs.promises.writeFile(
      path.join(oversized.sources["role-bundle-tree"], "manifest.json"),
      Buffer.alloc(
        FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_MANIFEST_MAX_BYTES + 1,
      ),
    );
    const oversizedComposite = await compositeFor(oversized);
    let oversizedCalls = 0;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        oversizedComposite,
        (_claim) => {
          oversizedCalls += 1;
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(oversizedCalls).toBe(0);

    const value = await heldRoleBundleFixture();
    const composite = await compositeFor(value);
    const destination = value.destinations["role-bundle-tree"];
    let callbackCalls = 0;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (_claim) => {
          callbackCalls += 1;
        },
        {
          afterCompositePrecheck: async (): Promise<void> => {
            await fs.promises.rename(destination, `${destination}-old`);
            await privateDirectory(destination);
            for (const filename of FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES) {
              await privateFile(
                path.join(destination, filename),
                `${filename}\n`,
              );
            }
          },
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(callbackCalls).toBe(0);
  });

  it("rejects post-root-open and partial-file-open path replacements after closing every opened handle", async () => {
    const rootSwap = await heldRoleBundleFixture();
    const rootComposite = await compositeFor(rootSwap);
    const rootDestination = rootSwap.destinations["role-bundle-tree"];
    let rootCallbackCalls = 0;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        rootComposite,
        (_claim) => {
          rootCallbackCalls += 1;
        },
        {
          afterRootOpen: async (): Promise<void> => {
            await fs.promises.rename(
              rootDestination,
              `${rootDestination}-after-open`,
            );
            await privateDirectory(rootDestination);
            for (const filename of FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES) {
              await privateFile(
                path.join(rootDestination, filename),
                `${filename}\n`,
              );
            }
          },
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(rootCallbackCalls).toBe(0);

    const fileSwap = await heldRoleBundleFixture();
    const fileComposite = await compositeFor(fileSwap);
    const fileDestination = fileSwap.destinations["role-bundle-tree"];
    const closeCalls: string[] = [];
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        fileComposite,
        (_claim) => undefined,
        {
          afterFileOpen: async (filename, openedFiles): Promise<void> => {
            if (openedFiles !== 3) return;
            const named = path.join(fileDestination, filename);
            await fs.promises.rename(named, `${named}.after-open`);
            await privateFile(named, `${filename}\n`);
          },
          beforeHandleClose: (kind, filename): void => {
            closeCalls.push(`${kind}:${filename ?? "root"}`);
          },
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(closeCalls).toHaveLength(4);
    expect(closeCalls.at(-1)).toBe("root:root");
  });

  it("revokes replayed and late held claims and zeroizes failed callback views", async () => {
    const replayComposite = await compositeFor(await heldRoleBundleFixture());
    let replayManifest: Uint8Array | undefined;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        replayComposite,
        (claim) => {
          replayManifest =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            ).manifestBytes;
          expect(() =>
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            ),
          ).toThrow();
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(Array.from(replayManifest ?? []).every((byte) => byte === 0)).toBe(
      true,
    );

    const lateComposite = await compositeFor(await heldRoleBundleFixture());
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        lateComposite,
        async (claim) => {
          await Promise.resolve();
          claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(claim);
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("revalidates callback path replacement and drains every close hook once", async () => {
    const changed = await heldRoleBundleFixture();
    const changedComposite = await compositeFor(changed);
    const changedFile = path.join(
      changed.destinations["role-bundle-tree"],
      "training.raw.jsonl",
    );
    let changedTraining: Uint8Array | undefined;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        changedComposite,
        async (claim) => {
          changedTraining =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            ).trainingRawBytes;
          await fs.promises.rename(changedFile, `${changedFile}.old`);
          await privateFile(changedFile, "training.raw.jsonl\n");
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(Array.from(changedTraining ?? []).every((byte) => byte === 0)).toBe(
      true,
    );

    const overwritten = await heldRoleBundleFixture();
    const overwrittenComposite = await compositeFor(overwritten);
    const overwrittenFile = path.join(
      overwritten.destinations["role-bundle-tree"],
      "training.raw.jsonl",
    );
    let overwrittenTraining: Uint8Array | undefined;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        overwrittenComposite,
        async (claim) => {
          overwrittenTraining =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            ).trainingRawBytes;
          const replacement = Buffer.from(overwrittenTraining);
          replacement[0] = replacement[0] === 0x74 ? 0x54 : 0x74;
          await fs.promises.writeFile(overwrittenFile, replacement);
          expect(replacement.byteLength).toBe(overwrittenTraining.byteLength);
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(
      Array.from(overwrittenTraining ?? []).every((byte) => byte === 0),
    ).toBe(true);

    const closing = await compositeFor(await heldRoleBundleFixture());
    const closeCalls: string[] = [];
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        closing,
        (claim) => {
          claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(claim);
        },
        {
          beforeHandleClose: async (kind, filename): Promise<void> => {
            closeCalls.push(`${kind}:${filename ?? "root"}`);
            if (closeCalls.length === 1) {
              throw new Error("test-only close hook failure");
            }
          },
        },
      ),
    ).rejects.toMatchObject({
      contract: FLOODGATE_V7_PORTABLE_COPY_WITNESS_CONTRACT,
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(closeCalls).toHaveLength(
      FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.length + 1,
    );
    expect(new Set(closeCalls).size).toBe(closeCalls.length);
  });
});
