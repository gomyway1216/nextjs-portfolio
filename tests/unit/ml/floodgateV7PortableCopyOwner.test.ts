import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PORTABLE_COPY_OWNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_PORTABLE_COPY_OWNER_CONTRACT,
  FLOODGATE_V7_PORTABLE_COPY_OWNER_HELD_ROLE_BUNDLE_CLAIM_BOUNDARY,
  FLOODGATE_V7_PORTABLE_COPY_OWNER_HELD_ROLE_BUNDLE_CONTRACT,
  FloodgateV7PortableCopyOwnerError,
  bindFloodgateV7PortableCopyOwnerBridge,
  bindFloodgateV7PortableCopyOwnerBridgeCoreForTests,
  claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot,
  claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests,
  presealFloodgateV7PortableCopyOwner,
  presealFloodgateV7PortableCopyOwnerCoreForTests,
  revokeFloodgateV7PortableCopyOwner,
  revokeFloodgateV7PortableCopyOwnerCoreForTests,
  withFloodgateV7PortableCopyOwnerRevalidation,
  withFloodgateV7PortableCopyOwnerRevalidationCoreForTests,
  withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidation,
  withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests,
  type FloodgateV7PortableCopyOwner,
  type FloodgateV7PortableCopyOwnerBinding,
  type FloodgateV7PortableCopyOwnerBoundBridge,
  type FloodgateV7PortableCopyOwnerExactBinding,
  type FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
  type FloodgateV7PortableCopyOwnerPresealResult,
  type FloodgateV7PortableCopyOwnerVerificationPause,
} from "../../../ml/floodgate-v7-portable-copy-owner";
import {
  FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES,
  type FloodgateV7PortableCopyKind,
} from "../../../ml/floodgate-v7-clean-room-copy";

const roots: string[] = [];
const effectiveUserId = process.geteuid?.() ?? 501;
const kinds = [
  "raw-lock-tree",
  "role-lock-tree",
  "role-bundle-tree",
  "legacy-file",
] as const satisfies readonly FloodgateV7PortableCopyKind[];

interface OwnerFixture {
  readonly root: string;
  readonly sources: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
  readonly destinations: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
}

interface BoundOwner {
  readonly owner: FloodgateV7PortableCopyOwner;
  readonly verificationPause: FloodgateV7PortableCopyOwnerVerificationPause;
  readonly bridge: FloodgateV7PortableCopyOwnerBoundBridge;
}

async function privateDirectory(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function privateFile(file: string, content: string): Promise<void> {
  await fs.promises.writeFile(file, content, { mode: 0o600 });
  await fs.promises.chmod(file, 0o600);
}

async function fixture(): Promise<Readonly<OwnerFixture>> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-portable-owner-"),
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
  await Promise.all([
    privateDirectory(sources["raw-lock-tree"]),
    privateDirectory(sources["role-lock-tree"]),
    privateDirectory(sources["role-bundle-tree"]),
  ]);
  await Promise.all([
    privateFile(
      path.join(sources["raw-lock-tree"], "raw.txt"),
      "raw-lock-tree\n",
    ),
    privateFile(
      path.join(sources["role-lock-tree"], "role.txt"),
      "role-lock-tree\n",
    ),
    ...FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.map((filename) =>
      privateFile(
        path.join(sources["role-bundle-tree"], filename),
        `${filename}\n`,
      ),
    ),
    privateFile(sources["legacy-file"], "legacy-file\n"),
  ]);

  const destinations = Object.freeze({
    "raw-lock-tree": path.join(destinationParent, "raw"),
    "role-lock-tree": path.join(destinationParent, "role"),
    "role-bundle-tree": path.join(destinationParent, "bundle"),
    "legacy-file": path.join(legacyDestinationParent, "legacy.txt"),
  });
  return Object.freeze({ root, sources, destinations });
}

function bindingsFor(
  value: Readonly<OwnerFixture>,
): readonly FloodgateV7PortableCopyOwnerBinding[] {
  return Object.freeze(
    kinds.map((kind) =>
      Object.freeze({
        kind,
        source: value.sources[kind],
        destination: value.destinations[kind],
        dependencies: Object.freeze({ effectiveUserId }),
      }),
    ),
  );
}

function exactBindingsFor(
  value: Readonly<OwnerFixture>,
): readonly FloodgateV7PortableCopyOwnerExactBinding[] {
  return Object.freeze(
    kinds.map((kind) =>
      Object.freeze({
        kind,
        source: value.sources[kind],
        destination: value.destinations[kind],
      }),
    ),
  );
}

async function boundOwnerFor(
  value: Readonly<OwnerFixture>,
): Promise<Readonly<BoundOwner>> {
  const presealed = await presealFloodgateV7PortableCopyOwnerCoreForTests(
    bindingsFor(value),
  );
  const bridge = await bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
    presealed.owner,
    presealed.verificationPause,
    exactBindingsFor(value),
  );
  return Object.freeze({ ...presealed, bridge });
}

async function boundProductionOwnerFor(
  value: Readonly<OwnerFixture>,
): Promise<Readonly<BoundOwner>> {
  const presealed = await presealFloodgateV7PortableCopyOwner(
    bindingsFor(value),
  );
  const bridge = await bindFloodgateV7PortableCopyOwnerBridge(
    presealed.owner,
    presealed.verificationPause,
    exactBindingsFor(value),
  );
  return Object.freeze({ ...presealed, bridge });
}

function everyByteIsZero(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte !== 0) return false;
  }
  return true;
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
  throw new Error("expected synchronous failure");
}

function runPoisoningChild(
  mode:
    "array-string" | "weak-collections" | "reflect" | "promise-resolve-preseal",
): void {
  const child = spawnSync(
    process.execPath,
    [
      "-r",
      "tsx/cjs",
      path.join(__dirname, "floodgateV7PortableCopyOwnerPoisoning.child.ts"),
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
      `owner poisoning child failed (${mode}):\n${child.stdout}\n${child.stderr}`,
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

describe("Floodgate v7 portable copy owner", () => {
  it("classifies every failure conservatively so future consumers cannot auto-retry partial work", () => {
    expect(new FloodgateV7PortableCopyOwnerError("preseal")).toMatchObject({
      destination_write_may_have_started: false,
      consumer_callback_may_have_started: false,
      retry_disposition: "fresh-preseal-allowed",
    });
    expect(new FloodgateV7PortableCopyOwnerError("bind")).toMatchObject({
      destination_write_may_have_started: true,
      consumer_callback_may_have_started: false,
      retry_disposition: "manual-clean-room-reconciliation-required",
    });
    expect(new FloodgateV7PortableCopyOwnerError("borrow")).toMatchObject({
      destination_write_may_have_started: true,
      consumer_callback_may_have_started: true,
      retry_disposition:
        "manual-consumer-and-clean-room-reconciliation-required",
    });
    expect(new FloodgateV7PortableCopyOwnerError("revoke")).toMatchObject({
      destination_write_may_have_started: true,
      consumer_callback_may_have_started: true,
      retry_disposition: "manual-owner-reconciliation-required",
    });
  });

  it("keeps the four underlying capabilities private across the verification pause and serialized borrows", async () => {
    expect(FLOODGATE_V7_PORTABLE_COPY_OWNER_CONTRACT).toBe(
      "shogi-floodgate-v7-portable-copy-owner-v1",
    );
    expect(FLOODGATE_V7_PORTABLE_COPY_OWNER_CLAIM_BOUNDARY).toContain(
      "not-source-semantic-authenticity-held-descriptor-reads-exact-three-gate",
    );
    expect(FLOODGATE_V7_PORTABLE_COPY_OWNER_HELD_ROLE_BUNDLE_CONTRACT).toBe(
      "shogi-floodgate-v7-portable-copy-owner-held-role-bundle-v1",
    );
    expect(
      FLOODGATE_V7_PORTABLE_COPY_OWNER_HELD_ROLE_BUNDLE_CLAIM_BOUNDARY,
    ).toContain("owner-and-bound-bridge-private-ephemeral-single-use-claim");
    const value = await fixture();
    const presealed = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(value),
    );

    for (const token of [
      presealed.owner,
      presealed.verificationPause,
    ] as const) {
      expect(Object.isFrozen(token)).toBe(true);
      expect(Object.getPrototypeOf(token)).toBeNull();
      expect(Reflect.ownKeys(token)).toEqual([]);
    }
    for (const kind of kinds) {
      expect(fs.existsSync(value.destinations[kind])).toBe(false);
    }

    const bridge = await bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
      presealed.owner,
      presealed.verificationPause,
      exactBindingsFor(value),
    );
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(Object.getPrototypeOf(bridge)).toBeNull();
    expect(Reflect.ownKeys(bridge)).toEqual([]);
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        presealed.owner,
        bridge,
        () => "first",
      ),
    ).resolves.toBe("first");
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        presealed.owner,
        bridge,
        async () => "second",
      ),
    ).resolves.toBe("second");

    revokeFloodgateV7PortableCopyOwnerCoreForTests(presealed.owner);
    revokeFloodgateV7PortableCopyOwnerCoreForTests(presealed.owner);
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        presealed.owner,
        bridge,
        () => "replay",
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("rejects a source-A/copy-B/destination-C exact-binding mix and permanently invalidates that owner", async () => {
    const left = await fixture();
    const right = await fixture();
    const presealed = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(left),
    );
    const mixed = [...exactBindingsFor(left)];
    mixed[2] = exactBindingsFor(right)[2]!;

    const error = await rejectionOf(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        presealed.owner,
        presealed.verificationPause,
        mixed,
      ),
    );
    expect(error).toMatchObject({
      name: "FloodgateV7PortableCopyOwnerError",
      operation: "bind",
      sensitive_values_disclosed: false,
    });
    await expect(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        presealed.owner,
        presealed.verificationPause,
        exactBindingsFor(left),
      ),
    ).rejects.toMatchObject({ operation: "bind" });
  });

  it("detects a source mutation across the explicit semantic-verifier pause before starting copy", async () => {
    const value = await fixture();
    const presealed = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(value),
    );
    await privateFile(
      path.join(value.sources["role-lock-tree"], "role.txt"),
      "mutated-during-verifier-pause\n",
    );
    await expect(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        presealed.owner,
        presealed.verificationPause,
        exactBindingsFor(value),
      ),
    ).rejects.toMatchObject({ operation: "bind" });
    for (const kind of kinds) {
      expect(fs.existsSync(value.destinations[kind])).toBe(false);
    }
  });

  it("rejects missing, reordered, accessor, extra-key, and proxied binding lists before issuing authority", async () => {
    const value = await fixture();
    const valid = bindingsFor(value);
    await expect(
      presealFloodgateV7PortableCopyOwnerCoreForTests(valid.slice(0, 3)),
    ).rejects.toMatchObject({ operation: "preseal" });
    await expect(
      presealFloodgateV7PortableCopyOwnerCoreForTests([
        valid[1]!,
        valid[0]!,
        valid[2]!,
        valid[3]!,
      ]),
    ).rejects.toMatchObject({ operation: "preseal" });

    const accessor = {
      get kind(): FloodgateV7PortableCopyKind {
        throw new Error("getter must not run");
      },
      source: value.sources["raw-lock-tree"],
      destination: value.destinations["raw-lock-tree"],
      dependencies: { effectiveUserId },
    };
    await expect(
      presealFloodgateV7PortableCopyOwnerCoreForTests([
        accessor,
        valid[1]!,
        valid[2]!,
        valid[3]!,
      ]),
    ).rejects.toMatchObject({ operation: "preseal" });
    await expect(
      presealFloodgateV7PortableCopyOwnerCoreForTests([
        {
          ...valid[0]!,
          extra: true,
        } as FloodgateV7PortableCopyOwnerBinding,
        valid[1]!,
        valid[2]!,
        valid[3]!,
      ]),
    ).rejects.toMatchObject({ operation: "preseal" });
    await expect(
      presealFloodgateV7PortableCopyOwnerCoreForTests(
        new Proxy([...valid], {}),
      ),
    ).rejects.toMatchObject({ operation: "preseal" });
  });

  it("rejects every cross-kind source/destination overlap before any preseal or copy can mutate a source", async () => {
    const value = await fixture();
    const roleSource = value.sources["role-lock-tree"];
    const before = await fs.promises.readdir(roleSource);
    const crossSourceDestination = bindingsFor(value).map((binding) => ({
      ...binding,
      destination:
        binding.kind === "raw-lock-tree"
          ? path.join(roleSource, "raw-copy-must-not-exist")
          : binding.destination,
    }));
    await expect(
      presealFloodgateV7PortableCopyOwnerCoreForTests(crossSourceDestination),
    ).rejects.toMatchObject({ operation: "preseal" });
    expect(await fs.promises.readdir(roleSource)).toEqual(before);
    expect(
      fs.existsSync(path.join(roleSource, "raw-copy-must-not-exist")),
    ).toBe(false);

    const overlappingDestinations = bindingsFor(value).map((binding) => ({
      ...binding,
      destination:
        binding.kind === "role-lock-tree"
          ? path.join(value.destinations["raw-lock-tree"], "nested")
          : binding.destination,
    }));
    await expect(
      presealFloodgateV7PortableCopyOwnerCoreForTests(overlappingDestinations),
    ).rejects.toMatchObject({ operation: "preseal" });
    for (const kind of kinds) {
      expect(fs.existsSync(value.destinations[kind])).toBe(false);
    }
  });

  it("rejects clones, inherited fakes, proxies, and cross-registry capabilities without consuming the genuine production owner", async () => {
    const value = await fixture();
    const presealed = await presealFloodgateV7PortableCopyOwner(
      bindingsFor(value),
    );
    const fakeOwners = [
      { ...presealed.owner },
      Object.create(presealed.owner) as FloodgateV7PortableCopyOwner,
      new Proxy(presealed.owner, {}),
    ];
    for (const fake of fakeOwners) {
      expect(() =>
        revokeFloodgateV7PortableCopyOwnerCoreForTests(fake),
      ).toThrowError(FloodgateV7PortableCopyOwnerError);
    }
    await expect(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        presealed.owner,
        presealed.verificationPause,
        exactBindingsFor(value),
      ),
    ).rejects.toMatchObject({ operation: "bind" });

    const bridge = await bindFloodgateV7PortableCopyOwnerBridge(
      presealed.owner,
      presealed.verificationPause,
      exactBindingsFor(value),
    );
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidation(
        presealed.owner,
        bridge,
        () => true,
      ),
    ).resolves.toBe(true);
    revokeFloodgateV7PortableCopyOwner(presealed.owner);
  });

  it("rejects same-registry owner, pause, and bridge clones by identity rather than shape", async () => {
    const value = await fixture();
    const presealed = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(value),
    );
    const fakeOwner = structuredClone(
      presealed.owner,
    ) as FloodgateV7PortableCopyOwner;
    expect(() =>
      revokeFloodgateV7PortableCopyOwnerCoreForTests(fakeOwner),
    ).toThrowError(FloodgateV7PortableCopyOwnerError);

    const bridge = await bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
      presealed.owner,
      presealed.verificationPause,
      exactBindingsFor(value),
    );
    const fakeBridge = structuredClone(
      bridge,
    ) as FloodgateV7PortableCopyOwnerBoundBridge;
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        presealed.owner,
        fakeBridge,
        () => "fake",
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        presealed.owner,
        bridge,
        () => "genuine",
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    revokeFloodgateV7PortableCopyOwnerCoreForTests(presealed.owner);

    const second = await fixture();
    const secondPreseal = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(second),
    );
    const fakePause = structuredClone(
      secondPreseal.verificationPause,
    ) as FloodgateV7PortableCopyOwnerVerificationPause;
    await expect(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        secondPreseal.owner,
        fakePause,
        exactBindingsFor(second),
      ),
    ).rejects.toMatchObject({ operation: "bind" });
    await expect(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        secondPreseal.owner,
        secondPreseal.verificationPause,
        exactBindingsFor(second),
      ),
    ).rejects.toMatchObject({ operation: "bind" });
  });

  it("isolates two genuine same-registry owners when their pause or bridge tokens are mixed", async () => {
    const left = await fixture();
    const right = await fixture();
    const leftPreseal = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(left),
    );
    const rightPreseal = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(right),
    );
    await expect(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        leftPreseal.owner,
        rightPreseal.verificationPause,
        exactBindingsFor(left),
      ),
    ).rejects.toMatchObject({ operation: "bind" });
    const rightBridge =
      await bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        rightPreseal.owner,
        rightPreseal.verificationPause,
        exactBindingsFor(right),
      );

    const third = await fixture();
    const thirdBound = await boundOwnerFor(third);
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        thirdBound.owner,
        rightBridge,
        () => "mixed",
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        rightPreseal.owner,
        rightBridge,
        () => "unrelated-genuine-owner-remains-valid",
      ),
    ).resolves.toBe("unrelated-genuine-owner-remains-valid");
    revokeFloodgateV7PortableCopyOwnerCoreForTests(rightPreseal.owner);
  });

  it("rejects every test-only dependency hook from the production owner surface", async () => {
    const value = await fixture();
    let hookCalled = false;
    const unsafe = bindingsFor(value).map((binding) => ({
      ...binding,
      dependencies: {
        effectiveUserId,
        closeCopiedFileHandleForTests: async (
          handle: fs.promises.FileHandle,
          _kind: "source" | "destination",
        ): Promise<void> => {
          hookCalled = true;
          await handle.close();
        },
      },
    }));
    await expect(
      presealFloodgateV7PortableCopyOwner(
        unsafe as unknown as readonly FloodgateV7PortableCopyOwnerBinding[],
      ),
    ).rejects.toMatchObject({ operation: "preseal" });
    expect(hookCalled).toBe(false);
    for (const kind of kinds) {
      expect(fs.existsSync(value.destinations[kind])).toBe(false);
    }
  });

  it("invalidates both concurrent borrowers before either can retain authority", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    let enterFirst!: () => void;
    let releaseFirst!: () => void;
    const entered = new Promise<void>((resolve) => {
      enterFirst = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
      bound.owner,
      bound.bridge,
      async () => {
        enterFirst();
        await release;
        return "first";
      },
    );
    await entered;
    const second = withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
      bound.owner,
      bound.bridge,
      () => "second",
    );
    await expect(second).rejects.toMatchObject({ operation: "borrow" });
    releaseFirst();
    await expect(first).rejects.toMatchObject({ operation: "borrow" });
  });

  it("revokes authority during an in-flight bind without claiming cancellation or rollback of started copies", async () => {
    const value = await fixture();
    let copied!: () => void;
    let release!: () => void;
    let firstCopy = true;
    const copiedOne = new Promise<void>((resolve) => {
      copied = resolve;
    });
    const releaseCopies = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bindings = bindingsFor(value).map((binding) => ({
      ...binding,
      dependencies: {
        effectiveUserId,
        afterFileCopiedForTests: async (
          _relativePath: string,
        ): Promise<void> => {
          if (firstCopy) {
            firstCopy = false;
            copied();
          }
          await releaseCopies;
        },
      },
    }));
    const presealed =
      await presealFloodgateV7PortableCopyOwnerCoreForTests(bindings);
    const binding = bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
      presealed.owner,
      presealed.verificationPause,
      exactBindingsFor(value),
    );
    await copiedOne;
    revokeFloodgateV7PortableCopyOwnerCoreForTests(presealed.owner);
    release();
    await expect(binding).rejects.toMatchObject({ operation: "bind" });
    expect(kinds.some((kind) => fs.existsSync(value.destinations[kind]))).toBe(
      true,
    );
  });

  it("attaches rejection handlers to all four started copies before awaiting the first", async () => {
    const value = await fixture();
    let releaseFirst!: () => void;
    let laterCopiesEntered!: () => void;
    let laterCopyCount = 0;
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const allLaterCopiesEntered = new Promise<void>((resolve) => {
      laterCopiesEntered = resolve;
    });
    const unhandled: unknown[] = [];
    const recordUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", recordUnhandled);

    const bindings = bindingsFor(value).map((binding, index) => ({
      ...binding,
      dependencies: {
        effectiveUserId,
        afterFileCopiedForTests: async (
          _relativePath: string,
        ): Promise<void> => {
          if (index === 0) {
            await firstRelease;
            return;
          }
          laterCopyCount += 1;
          if (laterCopyCount === 3) laterCopiesEntered();
          throw new Error("later copy rejected before first settled");
        },
      },
    }));
    const presealed =
      await presealFloodgateV7PortableCopyOwnerCoreForTests(bindings);
    const binding = bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
      presealed.owner,
      presealed.verificationPause,
      exactBindingsFor(value),
    );

    try {
      await allLaterCopiesEntered;
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      releaseFirst();
      await expect(binding).rejects.toMatchObject({ operation: "bind" });
      process.off("unhandledRejection", recordUnhandled);
    }
  });

  it("invalidates synchronous reentry even when the outer callback catches it", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        async () => {
          await expect(
            withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
              bound.owner,
              bound.bridge,
              () => "inner",
            ),
          ).rejects.toMatchObject({ operation: "borrow" });
          return "outer";
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("invalidates reentry from Promise thenable assimilation", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    let inner: Promise<unknown> | undefined;
    const outer = withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
      bound.owner,
      bound.bridge,
      () =>
        ({
          then(resolve: (value: string) => void): void {
            inner = withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
              bound.owner,
              bound.bridge,
              () => "inner",
            );
            void inner.catch(() => undefined);
            resolve("outer");
          },
        }) as unknown as string,
    );
    await expect(outer).rejects.toMatchObject({ operation: "borrow" });
    expect(inner).toBeDefined();
    await expect(inner).rejects.toMatchObject({ operation: "borrow" });
  });

  it("fails closed when destination bytes change during a borrow", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    const rawDestination = path.join(
      value.destinations["raw-lock-tree"],
      "raw.txt",
    );
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        async () => {
          await privateFile(rawDestination, "changed\n");
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("makes active revocation idempotent and forces the active borrow to fail", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        () => {
          revokeFloodgateV7PortableCopyOwnerCoreForTests(bound.owner);
          revokeFloodgateV7PortableCopyOwnerCoreForTests(bound.owner);
          return "must-not-escape";
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("sanitizes callback failures and never copies callback text or a private path into the owner error", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    const secret = `secret:${value.root}`;
    const error = await rejectionOf(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        () => {
          throw new Error(secret);
        },
      ),
    );
    expect(error).toBeInstanceOf(FloodgateV7PortableCopyOwnerError);
    expect(error).toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain(value.root);
  });

  it("rejects malformed borrow callbacks and fake revocation without exposing authority", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        ((argument: unknown) => argument) as () => unknown,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });

    const fake = Object.freeze(
      Object.create(null),
    ) as FloodgateV7PortableCopyOwner;
    const error = synchronousFailureOf(() =>
      revokeFloodgateV7PortableCopyOwnerCoreForTests(fake),
    );
    expect(error).toMatchObject({
      operation: "revoke",
      sensitive_values_disclosed: false,
    });
  });

  it("consumes a verification pause exactly once", async () => {
    const value = await fixture();
    const presealed = await presealFloodgateV7PortableCopyOwnerCoreForTests(
      bindingsFor(value),
    );
    const bridge = await bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
      presealed.owner,
      presealed.verificationPause,
      exactBindingsFor(value),
    );
    await expect(
      bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
        presealed.owner,
        presealed.verificationPause,
        exactBindingsFor(value),
      ),
    ).rejects.toMatchObject({ operation: "bind" });
    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        presealed.owner,
        bridge,
        () => true,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("binds one pathless held-role-bundle snapshot claim to the exact owner and bridge and returns the exact callback result", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    const exactResult = Object.freeze({ status: "held-bundle-consumed" });
    let retainedManifest: Uint8Array | undefined;
    let retainedTraining: Uint8Array | undefined;

    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        (claim) => {
          expect(Object.isFrozen(claim)).toBe(true);
          expect(Object.getPrototypeOf(claim)).toBeNull();
          expect(Reflect.ownKeys(claim)).toEqual([]);
          const snapshot =
            claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
              bound.owner,
              bound.bridge,
              claim,
            );
          expect(snapshot.files.map((file) => file.filename)).toEqual(
            FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES,
          );
          for (const file of snapshot.files) {
            expect(file.bytes).toBeGreaterThan(0);
            expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
            expect(Reflect.ownKeys(file).sort()).toEqual([
              "bytes",
              "filename",
              "sha256",
            ]);
          }
          expect(Buffer.from(snapshot.manifestBytes).toString("utf8")).toBe(
            "manifest.json\n",
          );
          expect(Buffer.from(snapshot.trainingRawBytes).toString("utf8")).toBe(
            "training.raw.jsonl\n",
          );
          retainedManifest = snapshot.manifestBytes;
          retainedTraining = snapshot.trainingRawBytes;
          return exactResult;
        },
      ),
    ).resolves.toBe(exactResult);
    expect(retainedManifest).toBeDefined();
    expect(retainedTraining).toBeDefined();
    expect(everyByteIsZero(retainedManifest!)).toBe(true);
    expect(everyByteIsZero(retainedTraining!)).toBe(true);

    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        (claim) => {
          claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
            bound.owner,
            bound.bridge,
            claim,
          );
          return Promise.resolve("second-borrow");
        },
      ),
    ).resolves.toBe("second-borrow");
    revokeFloodgateV7PortableCopyOwnerCoreForTests(bound.owner);
  });

  it("expires the owner claim as soon as the callback returns its Promise while retaining bytes only until settlement", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    let entered!: () => void;
    let release!: (result: string) => void;
    const callbackEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const callbackSettlement = new Promise<string>((resolve) => {
      release = resolve;
    });
    let retainedClaim:
      FloodgateV7PortableCopyOwnerHeldRoleBundleClaim | undefined;
    let retainedManifest: Uint8Array | undefined;
    let retainedTraining: Uint8Array | undefined;
    const run =
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        (claim) => {
          retainedClaim = claim;
          const snapshot =
            claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
              bound.owner,
              bound.bridge,
              claim,
            );
          retainedManifest = snapshot.manifestBytes;
          retainedTraining = snapshot.trainingRawBytes;
          entered();
          return callbackSettlement;
        },
      );

    await callbackEntered;
    expect(everyByteIsZero(retainedManifest!)).toBe(false);
    expect(everyByteIsZero(retainedTraining!)).toBe(false);
    const staleError = synchronousFailureOf(() =>
      claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
        bound.owner,
        bound.bridge,
        retainedClaim!,
      ),
    );
    expect(staleError).toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(everyByteIsZero(retainedManifest!)).toBe(false);
    expect(everyByteIsZero(retainedTraining!)).toBe(false);

    release("settled-after-expiry");
    await expect(run).rejects.toMatchObject({ operation: "borrow" });
    expect(everyByteIsZero(retainedManifest!)).toBe(true);
    expect(everyByteIsZero(retainedTraining!)).toBe(true);
  });

  it("denies a microtask-late held-role-bundle claim and invalidates the enclosing borrow", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    let release!: () => void;
    const settlement = new Promise<void>((resolve) => {
      release = resolve;
    });
    let lateError: unknown;
    let lateAttempt: Promise<void> | undefined;
    const run =
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        (claim) => {
          lateAttempt = Promise.resolve().then(() => {
            try {
              claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
                bound.owner,
                bound.bridge,
                claim,
              );
            } catch (error) {
              lateError = error;
            } finally {
              release();
            }
          });
          return settlement;
        },
      );
    await expect(run).rejects.toMatchObject({ operation: "borrow" });
    await lateAttempt;
    expect(lateError).toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
  });

  it.each(["clone", "proxy", "replay"] as const)(
    "rejects a %s owner held-role-bundle claim and permanently invalidates only that owner",
    async (mode) => {
      const value = await fixture();
      const bound = await boundOwnerFor(value);
      let capturedError: unknown;
      const run =
        withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
          bound.owner,
          bound.bridge,
          (claim) => {
            try {
              if (mode === "replay") {
                claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
                  bound.owner,
                  bound.bridge,
                  claim,
                );
              }
              const candidate =
                mode === "clone"
                  ? (structuredClone(
                      claim,
                    ) as FloodgateV7PortableCopyOwnerHeldRoleBundleClaim)
                  : mode === "proxy"
                    ? new Proxy(claim, {})
                    : claim;
              claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
                bound.owner,
                bound.bridge,
                candidate,
              );
            } catch (error) {
              capturedError = error;
            }
            return Promise.resolve();
          },
        );
      await expect(run).rejects.toMatchObject({ operation: "borrow" });
      expect(capturedError).toMatchObject({
        name: "FloodgateV7PortableCopyOwnerError",
        operation: "borrow",
        sensitive_values_disclosed: false,
      });
      await expect(
        withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
          bound.owner,
          bound.bridge,
          () => undefined,
        ),
      ).rejects.toMatchObject({ operation: "borrow" });
    },
  );

  it("invalidates only owner A when owner A is paired with owner B's active claim", async () => {
    const leftValue = await fixture();
    const rightValue = await fixture();
    const left = await boundOwnerFor(leftValue);
    const right = await boundOwnerFor(rightValue);
    let mixedError: unknown;

    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        right.owner,
        right.bridge,
        (claim) => {
          try {
            claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
              left.owner,
              left.bridge,
              claim,
            );
          } catch (error) {
            mixedError = error;
          }
          claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
            right.owner,
            right.bridge,
            claim,
          );
          return Promise.resolve("right-claim");
        },
      ),
    ).resolves.toBe("right-claim");
    expect(mixedError).toMatchObject({
      name: "FloodgateV7PortableCopyOwnerError",
      operation: "borrow",
      sensitive_values_disclosed: false,
    });

    await expect(
      withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
        left.owner,
        left.bridge,
        () => undefined,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });

    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        right.owner,
        right.bridge,
        (claim) => {
          claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
            right.owner,
            right.bridge,
            claim,
          );
          return Promise.resolve("right-still-usable");
        },
      ),
    ).resolves.toBe("right-still-usable");
    revokeFloodgateV7PortableCopyOwnerCoreForTests(right.owner);
  });

  it("keeps production and test held-role-bundle claim registries disjoint without consuming the genuine claim", async () => {
    const value = await fixture();
    const bound = await boundProductionOwnerFor(value);
    let crossRegistryError: unknown;
    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidation(
        bound.owner,
        bound.bridge,
        (claim) => {
          try {
            claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
              bound.owner,
              bound.bridge,
              claim,
            );
          } catch (error) {
            crossRegistryError = error;
          }
          const snapshot =
            claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot(
              bound.owner,
              bound.bridge,
              claim,
            );
          expect(snapshot.files).toHaveLength(9);
          return Promise.resolve("production-claim");
        },
      ),
    ).resolves.toBe("production-claim");
    expect(crossRegistryError).toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    revokeFloodgateV7PortableCopyOwner(bound.owner);
  });

  it("shares serialization between generic and held-role-bundle borrows and invalidates both on concurrency", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    let entered!: () => void;
    let release!: () => void;
    const callbackEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releaseCallback = new Promise<void>((resolve) => {
      release = resolve;
    });
    let retainedTraining: Uint8Array | undefined;
    const held =
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        (claim) => {
          retainedTraining =
            claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
              bound.owner,
              bound.bridge,
              claim,
            ).trainingRawBytes;
          entered();
          return releaseCallback;
        },
      );
    await callbackEntered;
    const generic = withFloodgateV7PortableCopyOwnerRevalidationCoreForTests(
      bound.owner,
      bound.bridge,
      () => "must-not-run",
    );
    await expect(generic).rejects.toMatchObject({ operation: "borrow" });
    release();
    await expect(held).rejects.toMatchObject({ operation: "borrow" });
    expect(everyByteIsZero(retainedTraining!)).toBe(true);
  });

  it("invalidates synchronous held-role-bundle reentry and active revocation under one owner", async () => {
    const reentryValue = await fixture();
    const reentryBound = await boundOwnerFor(reentryValue);
    let inner: Promise<unknown> | undefined;
    const outer =
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        reentryBound.owner,
        reentryBound.bridge,
        (claim) => {
          claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
            reentryBound.owner,
            reentryBound.bridge,
            claim,
          );
          inner =
            withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
              reentryBound.owner,
              reentryBound.bridge,
              (_innerClaim) => Promise.resolve("inner"),
            );
          void inner.catch(() => undefined);
          return Promise.resolve("outer");
        },
      );
    await expect(outer).rejects.toMatchObject({ operation: "borrow" });
    expect(inner).toBeDefined();
    await expect(inner).rejects.toMatchObject({ operation: "borrow" });

    const revokeValue = await fixture();
    const revokeBound = await boundOwnerFor(revokeValue);
    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        revokeBound.owner,
        revokeBound.bridge,
        (claim) => {
          claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
            revokeBound.owner,
            revokeBound.bridge,
            claim,
          );
          revokeFloodgateV7PortableCopyOwnerCoreForTests(revokeBound.owner);
          revokeFloodgateV7PortableCopyOwnerCoreForTests(revokeBound.owner);
          return Promise.resolve("revoked-result");
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("sanitizes held-role-bundle callback failures without retaining private paths or callback text", async () => {
    const value = await fixture();
    const bound = await boundOwnerFor(value);
    const secret = `held-secret:${value.root}`;
    const error = await rejectionOf(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        bound.owner,
        bound.bridge,
        (claim) => {
          claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
            bound.owner,
            bound.bridge,
            claim,
          );
          return Promise.reject(new Error(secret));
        },
      ),
    );
    expect(error).toMatchObject({
      name: "FloodgateV7PortableCopyOwnerError",
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain(value.root);
  });

  it("rejects malformed held-role-bundle callbacks without invoking a length getter", async () => {
    const getterValue = await fixture();
    const getterBound = await boundOwnerFor(getterValue);
    let getterCalls = 0;
    const getterCallback = ((
      _claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
    ) => Promise.resolve()) as (
      claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
    ) => Promise<void>;
    Object.defineProperty(getterCallback, "length", {
      configurable: true,
      get(): number {
        getterCalls += 1;
        return 1;
      },
    });
    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        getterBound.owner,
        getterBound.bridge,
        getterCallback,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(getterCalls).toBe(0);

    const proxyValue = await fixture();
    const proxyBound = await boundOwnerFor(proxyValue);
    const proxyCallback = new Proxy(
      (
        _claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
      ): Promise<void> => Promise.resolve(),
      {},
    );
    await expect(
      withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests(
        proxyBound.owner,
        proxyBound.bridge,
        proxyCallback,
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("does not expose raw A capabilities through the preseal result container", async () => {
    const value = await fixture();
    const result: Readonly<FloodgateV7PortableCopyOwnerPresealResult> =
      await presealFloodgateV7PortableCopyOwnerCoreForTests(bindingsFor(value));
    expect(Reflect.ownKeys(result).sort()).toEqual([
      "owner",
      "verificationPause",
    ]);
    expect(JSON.stringify(result)).toBe('{"owner":{},"verificationPause":{}}');
    revokeFloodgateV7PortableCopyOwnerCoreForTests(result.owner);
  });

  it.each([
    "array-string",
    "weak-collections",
    "reflect",
    "promise-resolve-preseal",
  ] as const)(
    "uses captured post-module-initialization intrinsics in a plain Node child: %s",
    (mode) => {
      runPoisoningChild(mode);
    },
  );
});
