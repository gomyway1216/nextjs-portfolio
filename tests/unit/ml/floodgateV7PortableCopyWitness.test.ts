import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
  FLOODGATE_V7_PORTABLE_COPY_WITNESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PORTABLE_COPY_WITNESS_CONTRACT,
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

interface PrototypeMethodPatch {
  readonly target: object;
  readonly property: PropertyKey;
  readonly value: unknown;
}

function applyPrototypeMethodPatches(
  patches: readonly PrototypeMethodPatch[],
): () => void {
  const descriptors: PropertyDescriptor[] = [];
  for (let index = 0; index < patches.length; index += 1) {
    const patch = patches[index]!;
    const descriptor = Object.getOwnPropertyDescriptor(
      patch.target,
      patch.property,
    );
    if (descriptor === undefined) {
      throw new Error(
        `prototype descriptor is required: ${String(patch.property)}`,
      );
    }
    descriptors[index] = descriptor;
    Object.defineProperty(patch.target, patch.property, {
      ...descriptor,
      value: patch.value,
    });
  }
  return (): void => {
    for (let index = patches.length - 1; index >= 0; index -= 1) {
      const patch = patches[index]!;
      Object.defineProperty(patch.target, patch.property, descriptors[index]!);
    }
  };
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

  it("captures the exact witness list without consulting mutable Array.prototype.includes", async () => {
    const witnesses = await witnessesFor(await fixture());
    const includesDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "includes",
    );
    if (includesDescriptor === undefined) {
      throw new Error("Array.prototype.includes descriptor is required");
    }
    let includesCalls = 0;
    let composite: FloodgateV7PortableCopyCompositeDestinationSeal | undefined;
    try {
      Object.defineProperty(Array.prototype, "includes", {
        ...includesDescriptor,
        value: () => {
          includesCalls += 1;
          throw new Error("poisoned Array.prototype.includes was invoked");
        },
      });
      composite =
        await sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
          witnesses,
        );
    } finally {
      Object.defineProperty(Array.prototype, "includes", includesDescriptor);
    }
    expect(includesCalls).toBe(0);
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
        composite!,
        () => "prototype-safe",
      ),
    ).resolves.toBe("prototype-safe");
  });

  it("keeps WeakMap and WeakSet poisoning from forging, replaying, or revoking capabilities", async () => {
    const witnesses = await witnessesFor(await fixture());
    const fakeWitness = Object.freeze(
      Object.create(null),
    ) as FloodgateV7PortableCopyWitness;
    const fakeComposite = Object.freeze(
      Object.create(null),
    ) as FloodgateV7PortableCopyCompositeDestinationSeal;
    const nativeWeakMapGet = WeakMap.prototype.get;
    const nativeWeakMapSet = WeakMap.prototype.set;
    const nativeWeakMapDelete = WeakMap.prototype.delete;
    const nativeWeakSetHas = WeakSet.prototype.has;
    const nativeWeakSetAdd = WeakSet.prototype.add;
    const nativeReflectApply = Reflect.apply;
    let observedRawState: unknown;
    const restore = applyPrototypeMethodPatches([
      {
        target: WeakMap.prototype,
        property: "get",
        value: function (this: WeakMap<object, unknown>, key: object): unknown {
          if (key === fakeWitness && observedRawState !== undefined) {
            return observedRawState;
          }
          const actual = nativeReflectApply(nativeWeakMapGet, this, [
            key,
          ]) as unknown;
          if (
            actual !== null &&
            typeof actual === "object" &&
            (actual as { kind?: unknown }).kind === "raw-lock-tree"
          ) {
            observedRawState = actual;
          }
          return actual;
        },
      },
      {
        target: WeakMap.prototype,
        property: "set",
        value: function (
          this: WeakMap<object, unknown>,
          key: object,
          value: unknown,
        ): WeakMap<object, unknown> {
          if (
            value !== null &&
            typeof value === "object" &&
            "witnesses" in value &&
            "parents" in value
          ) {
            return this;
          }
          return nativeReflectApply(nativeWeakMapSet, this, [
            key,
            value,
          ]) as WeakMap<object, unknown>;
        },
      },
      {
        target: WeakMap.prototype,
        property: "delete",
        value: function (this: WeakMap<object, unknown>, key: object): boolean {
          if (
            key === witnesses[0] ||
            key === witnesses[1] ||
            key === witnesses[2] ||
            key === witnesses[3]
          ) {
            return true;
          }
          return nativeReflectApply(nativeWeakMapDelete, this, [
            key,
          ]) as boolean;
        },
      },
      {
        target: WeakSet.prototype,
        property: "has",
        value: function (this: WeakSet<object>, value: object): boolean {
          return value === fakeComposite
            ? true
            : (nativeReflectApply(nativeWeakSetHas, this, [value]) as boolean);
        },
      },
      {
        target: WeakSet.prototype,
        property: "add",
        value: function (
          this: WeakSet<object>,
          value: object,
        ): WeakSet<object> {
          return Object.getPrototypeOf(value) === null
            ? this
            : (nativeReflectApply(nativeWeakSetAdd, this, [
                value,
              ]) as WeakSet<object>);
        },
      },
      {
        target: Reflect,
        property: "apply",
        value: (
          target: unknown,
          thisArgument: unknown,
          argumentsList: ArrayLike<unknown>,
        ): unknown => {
          if (
            target === nativeWeakMapGet ||
            target === nativeWeakMapSet ||
            target === nativeWeakMapDelete ||
            target === nativeWeakSetHas ||
            target === nativeWeakSetAdd
          ) {
            throw new Error("poisoned Reflect.apply was invoked");
          }
          return nativeReflectApply(
            target as (...arguments_: unknown[]) => unknown,
            thisArgument,
            argumentsList,
          );
        },
      },
    ]);
    let duplicateFailure: unknown;
    let fakeFailure: unknown;
    let replayFailure: unknown;
    let fakeRevocationFailure: unknown;
    let borrowResult: unknown;
    try {
      duplicateFailure = await rejectionOf(
        sealFloodgateV7PortableCopyCompositeDestinationCoreForTests([
          witnesses[0]!,
          witnesses[0]!,
          witnesses[2]!,
          witnesses[3]!,
        ]),
      );
      fakeFailure = await rejectionOf(
        sealFloodgateV7PortableCopyCompositeDestinationCoreForTests([
          witnesses[1]!,
          witnesses[2]!,
          witnesses[3]!,
          fakeWitness,
        ]),
      );
      const composite =
        await sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
          witnesses,
        );
      replayFailure = await rejectionOf(
        sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(witnesses),
      );
      borrowResult =
        await withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
          composite,
          () => "captured-weak-collections",
        );
      fakeRevocationFailure = synchronousFailureOf(() =>
        revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
          fakeComposite,
        ),
      );
      revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
        composite,
      );
      revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
        composite,
      );
    } finally {
      restore();
    }
    expect(duplicateFailure).toMatchObject({ operation: "composite" });
    expect(fakeFailure).toMatchObject({ operation: "composite" });
    expect(replayFailure).toMatchObject({ operation: "composite" });
    expect(fakeRevocationFailure).toMatchObject({ operation: "revoke" });
    expect(borrowResult).toBe("captured-weak-collections");
  });

  it("keeps exact composition and mutation revalidation under collection prototype poisoning", async () => {
    const overlapWitnesses = await witnessesFor(await fixture(true));
    const value = await fixture();
    const witnesses = await witnessesFor(value);
    const copyProbe = await fixture();
    const nativeArrayPush = Array.prototype.push;
    const nativeMapGet = Map.prototype.get;
    const nativeMapSet = Map.prototype.set;
    const nativeMapEntries = Map.prototype.entries;
    const nativeSetAdd = Set.prototype.add;
    const nativeSetHas = Set.prototype.has;
    const nativeSetDelete = Set.prototype.delete;
    const destinationParent = path.dirname(value.destinations["raw-lock-tree"]);
    const restore = applyPrototypeMethodPatches([
      {
        target: Array,
        property: "isArray",
        value: () => true,
      },
      {
        target: Array.prototype,
        property: "includes",
        value: () => true,
      },
      {
        target: Array.prototype,
        property: "every",
        value: () => true,
      },
      {
        target: Array.prototype,
        property: "some",
        value: () => false,
      },
      {
        target: Array.prototype,
        property: "map",
        value: () => [],
      },
      {
        target: Array.prototype,
        property: "sort",
        value: function (this: unknown[]): unknown[] {
          return this;
        },
      },
      {
        target: Array.prototype,
        property: "reverse",
        value: function (this: unknown[]): unknown[] {
          return this;
        },
      },
      {
        target: Array.prototype,
        property: "push",
        value: function (this: unknown[], item: unknown): number {
          if (
            item !== null &&
            typeof item === "object" &&
            ("kind" in item ||
              "relativePath" in item ||
              "destinationInventory" in item)
          ) {
            return this.length;
          }
          return Reflect.apply(nativeArrayPush, this, [item]) as number;
        },
      },
      {
        target: Map.prototype,
        property: "get",
        value: function (this: Map<unknown, unknown>, key: unknown): unknown {
          return key === destinationParent
            ? undefined
            : Reflect.apply(nativeMapGet, this, [key]);
        },
      },
      {
        target: Map.prototype,
        property: "set",
        value: function (
          this: Map<unknown, unknown>,
          key: unknown,
          value: unknown,
        ): Map<unknown, unknown> {
          return key === destinationParent
            ? this
            : (Reflect.apply(nativeMapSet, this, [key, value]) as Map<
                unknown,
                unknown
              >);
        },
      },
      {
        target: Map.prototype,
        property: "entries",
        value: function (
          this: Map<unknown, unknown>,
        ): MapIterator<[unknown, unknown]> {
          return Reflect.apply(nativeMapEntries, this, []) as MapIterator<
            [unknown, unknown]
          >;
        },
      },
      {
        target: Set.prototype,
        property: "add",
        value: function (this: Set<unknown>, value: unknown): Set<unknown> {
          return typeof value === "string" ||
            value === witnesses[0] ||
            value === witnesses[1] ||
            value === witnesses[2] ||
            value === witnesses[3]
            ? this
            : (Reflect.apply(nativeSetAdd, this, [value]) as Set<unknown>);
        },
      },
      {
        target: Set.prototype,
        property: "has",
        value: function (this: Set<unknown>, value: unknown): boolean {
          return typeof value === "string"
            ? true
            : (Reflect.apply(nativeSetHas, this, [value]) as boolean);
        },
      },
      {
        target: Set.prototype,
        property: "delete",
        value: function (this: Set<unknown>, value: unknown): boolean {
          return typeof value === "string"
            ? true
            : (Reflect.apply(nativeSetDelete, this, [value]) as boolean);
        },
      },
      {
        target: String.prototype,
        property: "includes",
        value: () => true,
      },
      {
        target: String.prototype,
        property: "startsWith",
        value: () => false,
      },
      {
        target: String.prototype,
        property: "split",
        value: function (this: string): string[] {
          return [String(this)];
        },
      },
    ]);
    let overlapFailure: unknown;
    let mutationFailure: unknown;
    let borrowResult: unknown;
    let copyContract: unknown;
    try {
      const preseal = await presealFloodgateV7PortableCopySourceCoreForTests(
        "raw-lock-tree",
        copyProbe.sources["raw-lock-tree"],
        copyProbe.destinations["raw-lock-tree"],
        { effectiveUserId },
      );
      const seal =
        await sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
          "raw-lock-tree",
          preseal,
        );
      const copied = await copyFloodgateV7PortableSourceByValueCoreForTests(
        "raw-lock-tree",
        seal,
        copyProbe.destinations["raw-lock-tree"],
      );
      copyContract = copied.receipt.contract;
      overlapFailure = await rejectionOf(
        sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
          overlapWitnesses,
        ),
      );
      const composite =
        await sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
          witnesses,
        );
      borrowResult =
        await withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
          composite,
          () => "captured-collection-intrinsics",
        );
      await privateFile(
        path.join(value.destinations["role-lock-tree"], "role-lock-tree.txt"),
        "mutated-under-poisoning\n",
      );
      mutationFailure = await rejectionOf(
        withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
          composite,
          () => undefined,
        ),
      );
    } finally {
      restore();
    }
    expect(overlapFailure).toMatchObject({ operation: "composite" });
    expect(copyContract).toBe(FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT);
    expect(borrowResult).toBe("captured-collection-intrinsics");
    expect(mutationFailure).toMatchObject({ operation: "borrow" });
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
});
