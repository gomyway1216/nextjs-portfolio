import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
  copyFloodgateV7PortableSourceByValueCoreForTests,
  presealFloodgateV7PortableCopySourceCoreForTests,
  revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests,
  sealFloodgateV7PortableCopyCompositeDestinationCoreForTests,
  sealFloodgateV7PortableCopySourceFilesystemCoreForTests,
  withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests,
  type FloodgateV7PortableCopyCompositeDestinationSeal,
  type FloodgateV7PortableCopyKind,
  type FloodgateV7PortableCopyWitness,
  type FloodgateV7PortableCopyWitnessResult,
} from "../../../ml/floodgate-v7-clean-room-copy";

type PoisoningMode = "array-includes" | "weak-collections" | "collections";

const roots: string[] = [];
const effectiveUserId = process.geteuid?.() ?? 501;
const kinds = [
  "raw-lock-tree",
  "role-lock-tree",
  "role-bundle-tree",
  "legacy-file",
] as const satisfies readonly FloodgateV7PortableCopyKind[];

interface PortableFixture {
  readonly sources: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
  readonly destinations: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
}

interface PrototypeMethodPatch {
  readonly target: object;
  readonly property: PropertyKey;
  readonly value: unknown;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectOperation(error: unknown, operation: string): void {
  assert(
    error !== null &&
      typeof error === "object" &&
      "operation" in error &&
      error.operation === operation,
    `expected ${operation} failure`,
  );
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
      path.join(os.tmpdir(), "floodgate-v7-portable-poisoning-"),
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
  return Object.freeze({
    sources,
    destinations: Object.freeze({
      "raw-lock-tree": rawDestination,
      "role-lock-tree": overlap
        ? path.join(rawDestination, "role")
        : path.join(destinationParent, "role"),
      "role-bundle-tree": path.join(destinationParent, "bundle"),
      "legacy-file": path.join(legacyDestinationParent, "legacy.txt"),
    }),
  });
}

async function resultsFor(
  value: Readonly<PortableFixture>,
): Promise<readonly Readonly<FloodgateV7PortableCopyWitnessResult>[]> {
  const preseals = await Promise.all(
    kinds.map((kind) =>
      presealFloodgateV7PortableCopySourceCoreForTests(
        kind,
        value.sources[kind],
        value.destinations[kind],
        { effectiveUserId },
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
  const results: Readonly<FloodgateV7PortableCopyWitnessResult>[] = [];
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
): Promise<readonly FloodgateV7PortableCopyWitness[]> {
  return Object.freeze(
    (await resultsFor(value)).map((result) => result.witness),
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

async function runArrayIncludes(): Promise<void> {
  const witnesses = await witnessesFor(await fixture());
  const nativeIncludes = Array.prototype.includes;
  let targetCalls = 0;
  const restore = applyPrototypeMethodPatches([
    {
      target: Array.prototype,
      property: "includes",
      value: function (
        this: ArrayLike<unknown>,
        searchElement: unknown,
        fromIndex?: number,
      ): boolean {
        if (
          searchElement === "length" &&
          this.length === 5 &&
          this[0] === "0" &&
          this[1] === "1" &&
          this[2] === "2" &&
          this[3] === "3" &&
          this[4] === "length"
        ) {
          targetCalls += 1;
          return false;
        }
        return Reflect.apply(nativeIncludes, this, [
          searchElement,
          fromIndex,
        ]) as boolean;
      },
    },
  ]);
  let composite: FloodgateV7PortableCopyCompositeDestinationSeal | undefined;
  try {
    composite =
      await sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
        witnesses,
      );
  } finally {
    restore();
  }
  assert(targetCalls === 0, "mutable Array.prototype.includes was consulted");
  const result =
    await withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests(
      composite!,
      () => "prototype-safe",
    );
  assert(result === "prototype-safe", "composite borrow differs");
}

async function runWeakCollections(): Promise<void> {
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
        return nativeReflectApply(nativeWeakMapDelete, this, [key]) as boolean;
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
      value: function (this: WeakSet<object>, value: object): WeakSet<object> {
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
  let forgedReplacementFailure: unknown;
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
    const composite =
      await sealFloodgateV7PortableCopyCompositeDestinationCoreForTests(
        witnesses,
      );
    forgedReplacementFailure = await rejectionOf(
      sealFloodgateV7PortableCopyCompositeDestinationCoreForTests([
        fakeWitness,
        witnesses[1]!,
        witnesses[2]!,
        witnesses[3]!,
      ]),
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
  expectOperation(duplicateFailure, "composite");
  expectOperation(forgedReplacementFailure, "composite");
  expectOperation(replayFailure, "composite");
  expectOperation(fakeRevocationFailure, "revoke");
  assert(
    borrowResult === "captured-weak-collections",
    "weak collection borrow differs",
  );
}

async function runCollections(): Promise<void> {
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
    { target: Array, property: "isArray", value: () => true },
    { target: Array.prototype, property: "includes", value: () => true },
    { target: Array.prototype, property: "every", value: () => true },
    { target: Array.prototype, property: "some", value: () => false },
    { target: Array.prototype, property: "map", value: () => [] },
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
      value: function (this: Set<unknown>, value_: unknown): Set<unknown> {
        return typeof value_ === "string" ||
          value_ === witnesses[0] ||
          value_ === witnesses[1] ||
          value_ === witnesses[2] ||
          value_ === witnesses[3]
          ? this
          : (Reflect.apply(nativeSetAdd, this, [value_]) as Set<unknown>);
      },
    },
    {
      target: Set.prototype,
      property: "has",
      value: function (this: Set<unknown>, value_: unknown): boolean {
        return typeof value_ === "string"
          ? true
          : (Reflect.apply(nativeSetHas, this, [value_]) as boolean);
      },
    },
    {
      target: Set.prototype,
      property: "delete",
      value: function (this: Set<unknown>, value_: unknown): boolean {
        return typeof value_ === "string"
          ? true
          : (Reflect.apply(nativeSetDelete, this, [value_]) as boolean);
      },
    },
    { target: String.prototype, property: "includes", value: () => true },
    { target: String.prototype, property: "startsWith", value: () => false },
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
    const seal = await sealFloodgateV7PortableCopySourceFilesystemCoreForTests(
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
  expectOperation(overlapFailure, "composite");
  assert(
    copyContract === FLOODGATE_V7_CLEAN_ROOM_COPY_CONTRACT,
    "copy contract differs",
  );
  assert(
    borrowResult === "captured-collection-intrinsics",
    "collection borrow differs",
  );
  expectOperation(mutationFailure, "borrow");
}

async function cleanup(): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const root of roots.splice(0)) {
    pending.push(fs.promises.rm(root, { force: true, recursive: true }));
  }
  await Promise.all(pending);
}

function modeFromArgument(value: string | undefined): PoisoningMode {
  switch (value) {
    case "array-includes":
    case "weak-collections":
    case "collections":
      return value;
    default:
      throw new Error("exact poisoning mode is required");
  }
}

async function main(): Promise<void> {
  const mode = modeFromArgument(process.argv[2]);
  try {
    switch (mode) {
      case "array-includes":
        await runArrayIncludes();
        break;
      case "weak-collections":
        await runWeakCollections();
        break;
      case "collections":
        await runCollections();
        break;
    }
    process.stdout.write(`PASS ${mode}\n`);
  } finally {
    await cleanup();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
