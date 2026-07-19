import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES,
  claimFloodgateV7PortableCopyHeldRoleBundleSnapshot,
  claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests,
  copyFloodgateV7PortableSourceByValue,
  copyFloodgateV7PortableSourceByValueCoreForTests,
  presealFloodgateV7PortableCopySource,
  presealFloodgateV7PortableCopySourceCoreForTests,
  revokeFloodgateV7PortableCopyCompositeDestinationSeal,
  revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests,
  sealFloodgateV7PortableCopyCompositeDestination,
  sealFloodgateV7PortableCopyCompositeDestinationCoreForTests,
  sealFloodgateV7PortableCopySourceFilesystem,
  sealFloodgateV7PortableCopySourceFilesystemCoreForTests,
  withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundle,
  withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests,
  type FloodgateV7PortableCopyCompositeDestinationSeal,
  type FloodgateV7PortableCopyHeldRoleBundleFilename,
  type FloodgateV7PortableCopyHeldRoleBundleSnapshot,
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
const zeroByteFilename =
  "replay-excluded-position-ids.txt" as const satisfies FloodgateV7PortableCopyHeldRoleBundleFilename;

interface ExactNineFixture {
  readonly root: string;
  readonly sources: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
  readonly destinations: Readonly<Record<FloodgateV7PortableCopyKind, string>>;
}

type Registry = "production" | "test";

async function privateDirectory(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function privateFile(
  file: string,
  content: string | Uint8Array,
): Promise<void> {
  await fs.promises.writeFile(file, content, { mode: 0o600 });
  await fs.promises.chmod(file, 0o600);
}

function exactNineBytes(
  filename: FloodgateV7PortableCopyHeldRoleBundleFilename,
): Buffer {
  if (filename === zeroByteFilename) return Buffer.alloc(0);
  if (filename === "manifest.json") {
    return Buffer.from('{"fixture":"held-role-bundle"}\n', "utf8");
  }
  if (filename === "training.raw.jsonl") {
    return Buffer.from('{"fixture":"training-row"}\n', "utf8");
  }
  return Buffer.from(`fixture:${filename}\n`, "utf8");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exactNineFixture(): Promise<Readonly<ExactNineFixture>> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-portable-held-role-bundle-"),
    ),
  );
  roots.push(root);
  await fs.promises.chmod(root, 0o700);

  const sourceParent = path.join(root, "sources");
  const destinationParent = path.join(root, "destinations");
  const legacyDestinationParent = path.join(root, "legacy-destination");
  await Promise.all([
    privateDirectory(sourceParent),
    privateDirectory(destinationParent),
    privateDirectory(legacyDestinationParent),
  ]);

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
      path.join(sources["raw-lock-tree"], "raw-lock-tree.txt"),
      "raw-lock-tree\n",
    ),
    privateFile(
      path.join(sources["role-lock-tree"], "role-lock-tree.txt"),
      "role-lock-tree\n",
    ),
    privateFile(sources["legacy-file"], "legacy-file\n"),
    ...FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.map((filename) =>
      privateFile(
        path.join(sources["role-bundle-tree"], filename),
        exactNineBytes(filename),
      ),
    ),
  ]);

  expect(
    (await fs.promises.readdir(sources["role-bundle-tree"])).sort(),
  ).toEqual([...FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES]);
  expect(
    (
      await fs.promises.lstat(
        path.join(sources["role-bundle-tree"], zeroByteFilename),
        { bigint: true },
      )
    ).size,
  ).toBe(BigInt(0));

  const destinations = Object.freeze({
    "raw-lock-tree": path.join(destinationParent, "raw"),
    "role-lock-tree": path.join(destinationParent, "role"),
    "role-bundle-tree": path.join(destinationParent, "bundle"),
    "legacy-file": path.join(legacyDestinationParent, "legacy.txt"),
  });
  return Object.freeze({ root, sources, destinations });
}

async function compositeFor(
  value: Readonly<ExactNineFixture>,
  registry: Registry,
): Promise<FloodgateV7PortableCopyCompositeDestinationSeal> {
  const preseal =
    registry === "production"
      ? presealFloodgateV7PortableCopySource
      : presealFloodgateV7PortableCopySourceCoreForTests;
  const seal =
    registry === "production"
      ? sealFloodgateV7PortableCopySourceFilesystem
      : sealFloodgateV7PortableCopySourceFilesystemCoreForTests;
  const copy =
    registry === "production"
      ? copyFloodgateV7PortableSourceByValue
      : copyFloodgateV7PortableSourceByValueCoreForTests;
  const composite =
    registry === "production"
      ? sealFloodgateV7PortableCopyCompositeDestination
      : sealFloodgateV7PortableCopyCompositeDestinationCoreForTests;

  const preseals = await Promise.all(
    kinds.map((kind) =>
      preseal(
        kind,
        value.sources[kind],
        value.destinations[kind],
        Object.freeze({ effectiveUserId }),
      ),
    ),
  );
  const seals = await Promise.all(
    kinds.map((kind, index) => seal(kind, preseals[index]!)),
  );
  const witnesses = [];
  for (const [index, kind] of kinds.entries()) {
    witnesses.push(
      (await copy(kind, seals[index]!, value.destinations[kind])).witness,
    );
  }
  return composite(Object.freeze(witnesses));
}

async function rejectionOf(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error("expected rejection");
}

function synchronousFailureOf(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected synchronous failure");
}

function everyByteIsZero(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte !== 0) return false;
  }
  return true;
}

function ownStringKeysDeep(value: unknown): readonly string[] {
  const keys: string[] = [];
  const seen = new Set<object>();
  const visit = (candidate: unknown): void => {
    if (
      (typeof candidate !== "object" && typeof candidate !== "function") ||
      candidate === null ||
      seen.has(candidate)
    ) {
      return;
    }
    seen.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key === "string") keys.push(key);
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor !== undefined && "value" in descriptor) {
        visit(descriptor.value);
      }
    }
  };
  visit(value);
  return keys;
}

function observeHeldRoleBundleHandles(bundleRoot: string): Readonly<{
  handles: fs.promises.FileHandle[];
  restore: () => void;
  startCapture: () => void;
}> {
  const handles: fs.promises.FileHandle[] = [];
  let capture = false;
  const originalOpen = fs.promises.open.bind(fs.promises);
  const openSpy = vi
    .spyOn(fs.promises, "open")
    .mockImplementation(
      async (...arguments_: Parameters<typeof fs.promises.open>) => {
        const handle = await originalOpen(...arguments_);
        const location = arguments_[0];
        if (
          capture &&
          typeof location === "string" &&
          (location === bundleRoot ||
            location.startsWith(`${bundleRoot}${path.sep}`))
        ) {
          handles.push(handle);
        }
        return handle;
      },
    );
  return Object.freeze({
    handles,
    restore: () => openSpy.mockRestore(),
    startCapture: () => {
      capture = true;
    },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

describe("Floodgate v7 portable held role-bundle", () => {
  it("claims the exact nine ordered files, including one legitimate empty file, without disclosing paths or descriptors", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "test");
    const exactResult = Object.freeze({ status: "exact-nine-consumed" });
    let retainedSnapshot:
      Readonly<FloodgateV7PortableCopyHeldRoleBundleSnapshot> | undefined;

    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (claim) => {
          expect(Object.isFrozen(claim)).toBe(true);
          expect(Object.getPrototypeOf(claim)).toBeNull();
          expect(Reflect.ownKeys(claim)).toEqual([]);

          const snapshot =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            );
          retainedSnapshot = snapshot;
          expect(Object.isFrozen(snapshot)).toBe(true);
          expect(Reflect.ownKeys(snapshot).sort()).toEqual([
            "files",
            "manifestBytes",
            "trainingRawBytes",
          ]);
          expect(snapshot.files.map((file) => file.filename)).toEqual(
            FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES,
          );
          expect(snapshot.files).toHaveLength(9);
          for (const file of snapshot.files) {
            const expected = exactNineBytes(file.filename);
            expect(Object.isFrozen(file)).toBe(true);
            expect(Reflect.ownKeys(file).sort()).toEqual([
              "bytes",
              "filename",
              "sha256",
            ]);
            expect(file.bytes).toBe(expected.byteLength);
            expect(file.sha256).toBe(sha256(expected));
          }
          expect(
            snapshot.files.find((file) => file.filename === zeroByteFilename),
          ).toMatchObject({
            bytes: 0,
            sha256: sha256(Buffer.alloc(0)),
          });
          expect(snapshot.manifestBytes).toEqual(
            exactNineBytes("manifest.json"),
          );
          expect(snapshot.trainingRawBytes).toEqual(
            exactNineBytes("training.raw.jsonl"),
          );

          const disclosedKeys = ownStringKeysDeep({ claim, snapshot });
          for (const forbidden of [
            "path",
            "fd",
            "dev",
            "ino",
            "source",
            "destination",
          ]) {
            expect(disclosedKeys).not.toContain(forbidden);
          }
          expect(JSON.stringify(snapshot)).not.toContain(value.root);
          expect(JSON.stringify(snapshot)).not.toMatch(
            /"(?:path|fd|dev|ino|source|destination)"/u,
          );
          return exactResult;
        },
      ),
    ).resolves.toBe(exactResult);

    expect(retainedSnapshot).toBeDefined();
    expect(everyByteIsZero(retainedSnapshot!.manifestBytes)).toBe(true);
    expect(everyByteIsZero(retainedSnapshot!.trainingRawBytes)).toBe(true);
    revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
      composite,
    );
  });

  it("continues positional reads until each requested chunk is complete", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "test");
    const target = path.join(
      value.destinations["role-bundle-tree"],
      "manifest.json",
    );
    const originalOpen = fs.promises.open.bind(fs.promises);
    let shortReadActive = false;
    let shortReads = 0;
    const openSpy = vi
      .spyOn(fs.promises, "open")
      .mockImplementation(
        async (...arguments_: Parameters<typeof fs.promises.open>) => {
          const handle = await originalOpen(...arguments_);
          if (!shortReadActive || arguments_[0] !== target) return handle;
          const originalRead = handle.read.bind(handle);
          vi.spyOn(handle, "read").mockImplementation(
            async (
              buffer: Uint8Array,
              offset: number,
              length: number,
              position: number,
            ) => {
              if (length > 1) shortReads += 1;
              return originalRead(
                buffer,
                offset,
                length > 1 ? Math.max(1, Math.floor(length / 2)) : length,
                position,
              );
            },
          );
          return handle;
        },
      );

    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (claim) => {
          const snapshot =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            );
          expect(snapshot.manifestBytes).toEqual(
            exactNineBytes("manifest.json"),
          );
          openSpy.mockRestore();
          return "short-reads-complete";
        },
        {
          afterCompositePrecheck() {
            shortReadActive = true;
          },
        },
      ),
    ).resolves.toBe("short-reads-complete");
    expect(shortReads).toBeGreaterThan(1);
    revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
      composite,
    );
  });

  it("makes the snapshot claim synchronous and one-shot, then poisons the composite when replay escapes", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "test");
    let replayError: unknown;
    let firstClaimReturnedSynchronously = false;

    const failure = await rejectionOf(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (claim) => {
          const snapshot =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            );
          firstClaimReturnedSynchronously =
            typeof (snapshot as { then?: unknown }).then !== "function";
          try {
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            );
          } catch (error) {
            replayError = error;
            throw error;
          }
          return "replay-must-not-return";
        },
      ),
    );

    expect(firstClaimReturnedSynchronously).toBe(true);
    expect(replayError).toMatchObject({
      name: "FloodgateV7PortableCopyWitnessError",
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(failure).toMatchObject({
      name: "FloodgateV7PortableCopyWitnessError",
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (claim) => {
          claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(claim);
          return "poisoned-composite-must-not-run";
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
  });

  it("denies a microtask-late claim and never treats its eventual callback value as success", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "test");
    let lateError: unknown;
    let lateAttempt: Promise<void> | undefined;
    let callbackValueProduced = false;

    const run =
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (claim) => {
          lateAttempt = Promise.resolve().then(() => {
            lateError = synchronousFailureOf(() =>
              claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
                claim,
              ),
            );
            callbackValueProduced = true;
          });
          return lateAttempt.then(() => "microtask-value-must-not-escape");
        },
      );

    await expect(run).rejects.toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    await lateAttempt;
    expect(callbackValueProduced).toBe(true);
    expect(lateError).toMatchObject({
      name: "FloodgateV7PortableCopyWitnessError",
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
  });

  it("keeps retained manifest and training views readable until callback settlement, then zeroizes both", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "test");
    let entered!: () => void;
    let release!: (value: string) => void;
    const callbackEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const callbackSettlement = new Promise<string>((resolve) => {
      release = resolve;
    });
    let retainedManifest: Uint8Array | undefined;
    let retainedTraining: Uint8Array | undefined;

    const run =
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (claim) => {
          const snapshot =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            );
          retainedManifest = snapshot.manifestBytes;
          retainedTraining = snapshot.trainingRawBytes;
          entered();
          return callbackSettlement;
        },
      );

    await callbackEntered;
    expect(retainedManifest).toEqual(exactNineBytes("manifest.json"));
    expect(retainedTraining).toEqual(exactNineBytes("training.raw.jsonl"));
    expect(everyByteIsZero(retainedManifest!)).toBe(false);
    expect(everyByteIsZero(retainedTraining!)).toBe(false);

    release("settled");
    await expect(run).resolves.toBe("settled");
    expect(everyByteIsZero(retainedManifest!)).toBe(true);
    expect(everyByteIsZero(retainedTraining!)).toBe(true);
    revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests(
      composite,
    );
  });

  it("keeps production and test composite and claim registries disjoint without consuming the production claim", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "production");
    let wrongCompositeCallbackEntered = false;

    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (_claim) => {
          wrongCompositeCallbackEntered = true;
          return "wrong-registry";
        },
      ),
    ).rejects.toMatchObject({ operation: "borrow" });
    expect(wrongCompositeCallbackEntered).toBe(false);

    let crossClaimError: unknown;
    await expect(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundle(
        composite,
        (claim) => {
          crossClaimError = synchronousFailureOf(() =>
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
              claim,
            ),
          );
          const snapshot =
            claimFloodgateV7PortableCopyHeldRoleBundleSnapshot(claim);
          expect(snapshot.files).toHaveLength(9);
          return "production-registry";
        },
      ),
    ).resolves.toBe("production-registry");
    expect(crossClaimError).toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    revokeFloodgateV7PortableCopyCompositeDestinationSeal(composite);
  });

  it.each(["missing", "extra"] as const)(
    "rejects a role bundle with an exact-nine %s violation before entering the callback",
    async (mode) => {
      const value = await exactNineFixture();
      if (mode === "missing") {
        await fs.promises.unlink(
          path.join(
            value.sources["role-bundle-tree"],
            "fresh-selection.raw.jsonl",
          ),
        );
      } else {
        await privateFile(
          path.join(value.sources["role-bundle-tree"], "unexpected.txt"),
          "unexpected\n",
        );
      }
      const composite = await compositeFor(value, "test");
      let callbackEntered = false;

      const failure = await rejectionOf(
        withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
          composite,
          (_claim) => {
            callbackEntered = true;
            return "wrong-nine-must-not-run";
          },
        ),
      );

      expect(callbackEntered).toBe(false);
      expect(failure).toMatchObject({
        operation: "borrow",
        sensitive_values_disclosed: false,
      });
      expect(String(failure)).not.toContain(value.root);
    },
  );

  it("rejects an exact-byte fresh-inode swap between composite precheck and descriptor open", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "test");
    const target = path.join(
      value.destinations["role-bundle-tree"],
      "manifest.json",
    );
    const replacement = path.join(value.root, "fresh-manifest-replacement");
    let callbackEntered = false;
    let swapped = false;

    const failure = await rejectionOf(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        (_claim) => {
          callbackEntered = true;
          return "swapped-inode-must-not-run";
        },
        {
          async afterCompositePrecheck() {
            const bytes = await fs.promises.readFile(target);
            const before = await fs.promises.lstat(target, { bigint: true });
            await privateFile(replacement, bytes);
            await fs.promises.rename(replacement, target);
            const after = await fs.promises.lstat(target, { bigint: true });
            expect(await fs.promises.readFile(target)).toEqual(bytes);
            expect(after.size).toBe(before.size);
            expect(after.ino).not.toBe(before.ino);
            swapped = true;
          },
        },
      ),
    );

    expect(swapped).toBe(true);
    expect(callbackEntered).toBe(false);
    expect(failure).toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(value.root);
  });

  it("detects a callback-time same-size rewrite even after the exact original bytes are restored", async () => {
    const value = await exactNineFixture();
    const composite = await compositeFor(value, "test");
    const target = path.join(
      value.destinations["role-bundle-tree"],
      "training.raw.jsonl",
    );
    const original = await fs.promises.readFile(target);
    const altered = Buffer.from(original);
    altered[0] ^= 0x01;
    const before = await fs.promises.lstat(target, { bigint: true });
    let callbackReturnedValue = false;

    const failure = await rejectionOf(
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
        composite,
        async (claim) => {
          claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(claim);
          const handle = await fs.promises.open(target, "r+");
          try {
            const alteredWrite = await handle.write(
              altered,
              0,
              altered.byteLength,
              0,
            );
            expect(alteredWrite.bytesWritten).toBe(altered.byteLength);
            await handle.sync();
            const restoredWrite = await handle.write(
              original,
              0,
              original.byteLength,
              0,
            );
            expect(restoredWrite.bytesWritten).toBe(original.byteLength);
            await handle.sync();
          } finally {
            await handle.close();
          }
          expect(await fs.promises.readFile(target)).toEqual(original);
          callbackReturnedValue = true;
          return "restored-bytes-must-not-escape";
        },
      ),
    );

    const after = await fs.promises.lstat(target, { bigint: true });
    expect(callbackReturnedValue).toBe(true);
    expect(after.ino).toBe(before.ino);
    expect(after.size).toBe(before.size);
    expect(await fs.promises.readFile(target)).toEqual(original);
    expect(failure).toMatchObject({
      operation: "borrow",
      sensitive_values_disclosed: false,
    });
    expect(String(failure)).not.toContain(value.root);
  });

  it.each(["partial-open", "pre-close"] as const)(
    "drains every actually opened handle exactly once and returns no success after an injected %s failure",
    async (mode) => {
      const value = await exactNineFixture();
      const composite = await compositeFor(value, "test");
      const bundleRoot = value.destinations["role-bundle-tree"];
      const observed = observeHeldRoleBundleHandles(bundleRoot);
      const closeAttempts: Array<
        readonly [
          "file" | "root",
          FloodgateV7PortableCopyHeldRoleBundleFilename | null,
        ]
      > = [];
      let callbackEntered = false;
      let closeFailureInjected = false;
      let failure: unknown;
      try {
        failure = await rejectionOf(
          withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests(
            composite,
            (claim) => {
              callbackEntered = true;
              claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests(
                claim,
              );
              return "cleanup-failure-must-not-escape";
            },
            {
              afterCompositePrecheck() {
                observed.startCapture();
              },
              afterFileOpen(_filename, openedFiles) {
                if (mode === "partial-open" && openedFiles === 4) {
                  throw new Error("injected partial-open failure");
                }
              },
              beforeHandleClose(kind, filename) {
                closeAttempts.push([kind, filename]);
                if (
                  mode === "pre-close" &&
                  filename === "manifest.json" &&
                  !closeFailureInjected
                ) {
                  closeFailureInjected = true;
                  throw new Error("injected pre-close failure");
                }
              },
            },
          ),
        );
      } finally {
        observed.restore();
      }

      const openedFilenames =
        mode === "partial-open"
          ? FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES.slice(0, 4)
          : FLOODGATE_V7_PORTABLE_COPY_HELD_ROLE_BUNDLE_FILES;
      expect(observed.handles).toHaveLength(openedFilenames.length + 1);
      expect(closeAttempts).toEqual([
        ...[...openedFilenames]
          .reverse()
          .map((filename) => ["file", filename] as const),
        ["root", null],
      ]);
      for (const handle of observed.handles) {
        await expect(handle.stat()).rejects.toMatchObject({ code: "EBADF" });
      }
      expect(callbackEntered).toBe(mode === "pre-close");
      expect(closeFailureInjected).toBe(mode === "pre-close");
      expect(failure).toMatchObject({
        operation: "borrow",
        sensitive_values_disclosed: false,
      });
      expect(String(failure)).not.toContain(value.root);
    },
  );
});
