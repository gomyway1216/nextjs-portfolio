import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "../../../ml/floodgate-v7-deployment-key-authority";
import * as provisioner from "../../../ml/floodgate-v7-deployment-key-provisioner";
import { inspectFloodgateV7DeploymentKeyReadinessCoreForTests } from "../../../ml/floodgate-v7-deployment-key-readiness";

const REPOSITORY_ROOT = process.cwd();
const SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "floodgate-v7-deployment-key-provisioner.ts",
);
const KEY_BYTES = Buffer.from(
  Array.from(
    { length: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES },
    (_value, index) => (index * 29 + 7) & 0xff,
  ),
);
const REPLACEMENT_KEY_BYTES = Buffer.from(
  Array.from(
    { length: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES },
    (_value, index) => (index * 31 + 11) & 0xff,
  ),
);
const PATH_CANARY = "provisioner-path-canary";
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type ProvisionerDependencies = Parameters<
  typeof provisioner.provisionFloodgateV7DeploymentKeyCoreForTests
>[0];
type FailpointHook = NonNullable<ProvisionerDependencies["failpointForTests"]>;
type FailpointPhase = Parameters<FailpointHook>[0];

const FAILPOINT_PHASES = Object.freeze([
  "after-parent-created",
  "after-staging-create",
  "after-write",
  "after-file-sync",
  "before-final-link",
  "after-final-link",
  "after-final-directory-sync",
  "after-staging-unlink",
  "after-cleanup-directory-sync",
  "before-final-revalidation",
  "after-descriptor-close",
] as const satisfies readonly FailpointPhase[]);

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("deployment-key provisioner tests require a POSIX euid");
  }
  return process.geteuid();
}

async function temporaryHome(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `${PATH_CANARY}-`),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  return home;
}

function deploymentParent(home: string): string {
  return path.join(
    home,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
}

function deploymentKey(home: string): string {
  return path.join(
    deploymentParent(home),
    FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

function dependencies(
  homeDirectory: string,
  overrides: Readonly<Record<string, unknown>> = {},
): ProvisionerDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    homeDirectory,
    randomBytesForTests: () => new Uint8Array(KEY_BYTES),
    failpointForTests: undefined,
    observeInternalKeyForTests: undefined,
    observeFailureForTests: undefined,
    ...overrides,
  } as ProvisionerDependencies;
}

function withAccessor<T extends object>(
  value: T,
  key: PropertyKey,
  onAccess: () => void,
): T {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  Object.defineProperty(descriptors, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      configurable: true,
      enumerable: true,
      get(): never {
        onAccess();
        throw new Error("accessor trap must not run");
      },
    },
  });
  return Object.create(Object.getPrototypeOf(value), descriptors) as T;
}

function trapProxy<T extends object>(value: T, onTrap: () => void): T {
  return new Proxy(value, {
    get(): never {
      onTrap();
      throw new Error("Proxy get trap must not run");
    },
    getOwnPropertyDescriptor(): never {
      onTrap();
      throw new Error("Proxy descriptor trap must not run");
    },
    getPrototypeOf(): never {
      onTrap();
      throw new Error("Proxy prototype trap must not run");
    },
    ownKeys(): never {
      onTrap();
      throw new Error("Proxy ownKeys trap must not run");
    },
  });
}

function expectDeepFrozenNullRecords(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  if (!Array.isArray(value)) expect(Object.getPrototypeOf(value)).toBeNull();
  for (const child of Object.values(value)) {
    expectDeepFrozenNullRecords(child, seen);
  }
}

function expectNoByteViewsOrFunctions(
  value: unknown,
  seen = new Set<object>(),
): void {
  expect(typeof value).not.toBe("function");
  expect(ArrayBuffer.isView(value)).toBe(false);
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) {
    expectNoByteViewsOrFunctions(child, seen);
  }
}

async function captureFailure(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

async function directoryEntriesOrEmpty(directory: string): Promise<string[]> {
  try {
    return await fs.promises.readdir(directory);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

async function metadataOnlySnapshot(filePath: string): Promise<unknown> {
  try {
    const stat = await fs.promises.lstat(filePath, { bigint: true });
    return {
      present: true,
      dev: stat.dev.toString(10),
      ino: stat.ino.toString(10),
      mode: stat.mode.toString(8),
      uid: stat.uid.toString(10),
      size: stat.size.toString(10),
      nlink: stat.nlink.toString(10),
      entries: stat.isDirectory()
        ? (await fs.promises.readdir(filePath)).sort()
        : null,
    };
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { present: false };
    }
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

posixDescribe("Floodgate v7 deployment-key provisioner", () => {
  it("creates one exact private durable slot and returns pathless non-secret metadata", async () => {
    const home = await temporaryHome();
    const receipt =
      await provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home),
      );

    const parentStat = await fs.promises.lstat(deploymentParent(home), {
      bigint: true,
    });
    const keyStat = await fs.promises.lstat(deploymentKey(home), {
      bigint: true,
    });
    expect(parentStat.isDirectory()).toBe(true);
    expect(parentStat.uid).toBe(BigInt(effectiveUserId()));
    expect(parentStat.mode & BigInt(0o7777)).toBe(BigInt(0o700));
    expect(keyStat.isFile()).toBe(true);
    expect(keyStat.uid).toBe(BigInt(effectiveUserId()));
    expect(keyStat.mode & BigInt(0o7777)).toBe(BigInt(0o600));
    expect(keyStat.size).toBe(BigInt(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES));
    expect(keyStat.nlink).toBe(BigInt(1));
    expect(await fs.promises.readFile(deploymentKey(home))).toEqual(KEY_BYTES);
    expect(await directoryEntriesOrEmpty(deploymentParent(home))).toEqual([
      FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
    ]);

    expect(provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CONTRACT).toBe(
      "shogi-floodgate-v7-deployment-key-provisioner-v1",
    );
    expect(provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_STATUS).toBe(
      "new-csprng-key-no-clobber-published-durable-and-revalidated",
    );
    expect(provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_ALGORITHM).toBe(
      "node-crypto-random-bytes-32-staged-fsync-hard-link-no-clobber-directory-fsync-v1",
    );
    expect(receipt).toMatchObject({
      contract: provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CONTRACT,
      status: provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_STATUS,
      claim_boundary:
        provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_CLAIM_BOUNDARY,
      trust_boundary:
        provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_TRUST_BOUNDARY,
      algorithm: provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_ALGORITHM,
      execution_boundary:
        "test-only-injected-current-euid-home-key-provisioning",
      key_deployment: {
        layout: "fixed-current-euid-userinfo-home-v1",
        owner_uid: effectiveUserId(),
        parent_mode: "0700",
        key_mode: "0600",
        key_bytes: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
        key_nlink: 1,
        publication:
          "staged-file-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1",
        durability: "key-published-and-staging-removal-durable",
        parent_identity: {
          dev: parentStat.dev.toString(10),
          ino: parentStat.ino.toString(10),
        },
        key_identity: {
          dev: keyStat.dev.toString(10),
          ino: keyStat.ino.toString(10),
        },
        held_descriptors_revalidated: true,
      },
      test_boundary: {
        production_home_origin: false,
        production_effective_uid_origin: false,
        entropy_may_be_test_injected: true,
        test_hooks_may_observe_key_copy: true,
      },
      nonclaims: {
        key_material_disclosed: false,
        key_fingerprint_disclosed: false,
        key_path_disclosed: false,
        key_authority: false,
        checkpoint: false,
        runtime: false,
        dataset_read: false,
        teacher_label: false,
        training: false,
        weight: false,
        live_evaluation_activation: false,
        playing_strength: false,
      },
    });
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(home);
    expect(serialized).not.toContain(PATH_CANARY);
    expect(serialized).not.toContain(KEY_BYTES.toString("hex"));
    expect(serialized).not.toMatch(/(?:absolute|relative)_?path/i);
    expect(serialized).not.toContain('"key_instance_id"');
    expect(Object.keys(receipt.nonclaims).sort()).toEqual(
      [
        "key_material_disclosed",
        "key_fingerprint_disclosed",
        "key_path_disclosed",
        "key_authority",
        "checkpoint",
        "runtime",
        "dataset_read",
        "teacher_label",
        "training",
        "weight",
        "live_evaluation_activation",
        "playing_strength",
      ].sort(),
    );
    expectNoByteViewsOrFunctions(receipt);
    expectDeepFrozenNullRecords(receipt);

    await expect(
      inspectFloodgateV7DeploymentKeyReadinessCoreForTests({
        effectiveUserId: effectiveUserId(),
        homeDirectory: home,
      }),
    ).resolves.toMatchObject({ status: "ready" });
  });

  it("does not let an inherited numeric Array setter redirect the fixed deployment path", async () => {
    const home = await temporaryHome();
    const alternateHome = await temporaryHome();
    const managedPaths =
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.map(
        (_component, index) =>
          path.join(
            home,
            ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.slice(
              0,
              index + 1,
            ),
          ),
      );
    const alternateManagedPaths =
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.map(
        (_component, index) =>
          path.join(
            alternateHome,
            ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.slice(
              0,
              index + 1,
            ),
          ),
      );
    for (const directory of alternateManagedPaths) {
      await mkdir0700(directory);
    }
    const redirects = new Map(
      managedPaths.map(
        (managedPath, index) =>
          [managedPath, alternateManagedPaths[index]] as const,
      ),
    );
    const numericKey = "0";
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      numericKey,
    );
    let targetSetterCalls = 0;
    let unrelatedSetterCalls = 0;
    let receipt:
      | Awaited<
          ReturnType<
            typeof provisioner.provisionFloodgateV7DeploymentKeyCoreForTests
          >
        >
      | undefined;
    const unrelatedProbe: unknown[] = [];

    try {
      Object.defineProperty(Array.prototype, numericKey, {
        configurable: true,
        set(this: unknown[], value: unknown): void {
          const redirect =
            typeof value === "string" ? redirects.get(value) : undefined;
          if (redirect === undefined) unrelatedSetterCalls += 1;
          else targetSetterCalls += 1;
          Object.defineProperty(this, numericKey, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: redirect ?? value,
          });
        },
      });
      unrelatedProbe[0] = "unrelated-array-assignment";

      receipt = await provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home),
      );
    } finally {
      if (originalDescriptor === undefined) {
        Reflect.deleteProperty(Array.prototype, numericKey);
      } else {
        Object.defineProperty(Array.prototype, numericKey, originalDescriptor);
      }
    }

    expect(
      Object.getOwnPropertyDescriptor(Array.prototype, numericKey),
    ).toEqual(originalDescriptor);
    expect(unrelatedProbe[0]).toBe("unrelated-array-assignment");
    expect(unrelatedSetterCalls).toBeGreaterThan(0);
    expect(targetSetterCalls).toBe(0);
    expect(receipt).toMatchObject({
      status: provisioner.FLOODGATE_V7_DEPLOYMENT_KEY_PROVISIONER_STATUS,
      execution_boundary:
        "test-only-injected-current-euid-home-key-provisioning",
    });
    expect(await fs.promises.readFile(deploymentKey(home))).toEqual(KEY_BYTES);
    expect(fs.existsSync(deploymentKey(alternateHome))).toBe(false);
  });

  it.each([
    ["0750", 0o750],
    ["0755", 0o755],
  ] as const)(
    "accepts a canonical %s home while keeping every managed directory exact 0700",
    async (_modeLabel, mode) => {
      const home = await temporaryHome();
      await fs.promises.chmod(home, mode);

      await expect(
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home),
        ),
      ).resolves.toBeDefined();

      const homeStat = await fs.promises.lstat(home, { bigint: true });
      expect(homeStat.mode & BigInt(0o7777)).toBe(BigInt(mode));

      let managedDirectory = home;
      for (const component of FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS) {
        managedDirectory = path.join(managedDirectory, component);
        const stat = await fs.promises.lstat(managedDirectory, {
          bigint: true,
        });
        expect(stat.isDirectory()).toBe(true);
        expect(stat.uid).toBe(BigInt(effectiveUserId()));
        expect(stat.mode & BigInt(0o7777)).toBe(BigInt(0o700));
      }
      expect(await fs.promises.readFile(deploymentKey(home))).toEqual(
        KEY_BYTES,
      );
    },
  );

  it("rejects a symlink home even when its target is a safe current-user directory", async () => {
    const container = await temporaryHome();
    const target = path.join(container, "safe-home-target");
    const linkedHome = path.join(container, "linked-home");
    await mkdir0700(target);
    await fs.promises.symlink(target, linkedHome);
    const before = await metadataOnlySnapshot(target);
    let randomCalls = 0;

    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(linkedHome, {
          randomBytesForTests: () => {
            randomCalls += 1;
            return new Uint8Array(KEY_BYTES);
          },
        }),
      ),
    );

    expect(randomCalls).toBe(0);
    expect(failure).toMatchObject({
      phase: "namespace",
      durability: "no-deployment-change-established",
      may_have_committed: false,
    });
    expect(String(failure)).not.toContain(linkedHome);
    expect(await metadataOnlySnapshot(target)).toEqual(before);
    expect((await fs.promises.lstat(linkedHome)).isSymbolicLink()).toBe(true);
  });

  it("rejects group- or other-writable homes without namespace mutation", async () => {
    for (const mode of [0o775, 0o707, 0o777]) {
      const home = await temporaryHome();
      await fs.promises.chmod(home, mode);
      const before = await metadataOnlySnapshot(home);
      let randomCalls = 0;

      const failure = await captureFailure(() =>
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home, {
            randomBytesForTests: () => {
              randomCalls += 1;
              return new Uint8Array(KEY_BYTES);
            },
          }),
        ),
      );

      expect(randomCalls).toBe(0);
      expect(failure).toMatchObject({
        phase: "namespace",
        durability: "no-deployment-change-established",
        may_have_committed: false,
      });
      expect(String(failure)).not.toContain(home);
      expect(await metadataOnlySnapshot(home)).toEqual(before);
    }
  });

  it("rejects homes without owner rwx or with special permission bits", async () => {
    for (const mode of [0o500, 0o1700]) {
      const home = await temporaryHome();
      await fs.promises.chmod(home, mode);
      const before = await metadataOnlySnapshot(home);

      const failure = await captureFailure(() =>
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home),
        ),
      );

      expect(failure).toMatchObject({
        phase: "namespace",
        durability: "no-deployment-change-established",
        may_have_committed: false,
      });
      expect(await metadataOnlySnapshot(home)).toEqual(before);
    }
  });

  it("revalidates an accepted home mode through its held directory descriptor", async () => {
    const home = await temporaryHome();
    await fs.promises.chmod(home, 0o755);
    let modeRaceCalls = 0;

    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          failpointForTests: (event: FailpointPhase) => {
            if (event === "before-final-revalidation") {
              modeRaceCalls += 1;
              fs.chmodSync(home, 0o775);
            }
          },
        }),
      ),
    );

    expect(modeRaceCalls).toBe(1);
    expect(failure).toMatchObject({
      phase: "revalidation",
      durability: "key-published-and-staging-removal-durable",
      may_have_committed: true,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(String(failure)).not.toContain(home);
    expect(await fs.promises.readFile(deploymentKey(home))).toEqual(KEY_BYTES);
  });

  it("rejects a safe-to-safe home mode change during final revalidation", async () => {
    const home = await temporaryHome();
    await fs.promises.chmod(home, 0o755);
    let modeRaceCalls = 0;

    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          failpointForTests: (event: FailpointPhase) => {
            if (event === "before-final-revalidation") {
              modeRaceCalls += 1;
              fs.chmodSync(home, 0o700);
            }
          },
        }),
      ),
    );

    expect(modeRaceCalls).toBe(1);
    expect(failure).toMatchObject({
      phase: "revalidation",
      durability: "key-published-and-staging-removal-durable",
      may_have_committed: true,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(String(failure)).not.toContain(home);
    const homeStat = await fs.promises.lstat(home, { bigint: true });
    expect(homeStat.mode & BigInt(0o7777)).toBe(BigInt(0o700));
    expect(await fs.promises.readFile(deploymentKey(home))).toEqual(KEY_BYTES);
  });

  it("accepts a preexisting exact empty 0700 parent but never overwrites any final key", async () => {
    const emptyParentHome = await temporaryHome();
    await mkdir0700(deploymentParent(emptyParentHome));
    await expect(
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(emptyParentHome),
      ),
    ).resolves.toBeDefined();

    const existingHome = await temporaryHome();
    await write0600(deploymentKey(existingHome), KEY_BYTES);
    const before = await fs.promises.readFile(deploymentKey(existingHome));
    let randomCalls = 0;
    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(existingHome, {
          randomBytesForTests: () => {
            randomCalls += 1;
            return new Uint8Array(REPLACEMENT_KEY_BYTES);
          },
        }),
      ),
    );
    expect(randomCalls).toBe(0);
    expect(await fs.promises.readFile(deploymentKey(existingHome))).toEqual(
      before,
    );
    expect(String(failure)).not.toContain(existingHome);
    expect(String(failure)).not.toContain(KEY_BYTES.toString("hex"));

    const repeatedFailure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(existingHome),
      ),
    );
    expect(String(repeatedFailure)).toMatch(/already|exists|reconciliation/i);
    expect(
      await directoryEntriesOrEmpty(deploymentParent(existingHome)),
    ).toEqual([FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME]);
  });

  it("fails closed without mutation for unsafe parent and final-key namespace states", async () => {
    const cases: Array<
      Readonly<{
        name: string;
        arrange: (home: string) => Promise<void>;
        claimedUid?: number;
      }>
    > = [
      {
        name: "parent mode",
        arrange: async (home) => {
          await mkdir0700(deploymentParent(home));
          await fs.promises.chmod(deploymentParent(home), 0o755);
        },
      },
      {
        name: "parent symlink",
        arrange: async (home) => {
          const external = path.join(home, "external-private-parent");
          await mkdir0700(external);
          await mkdir0700(path.dirname(deploymentParent(home)));
          await fs.promises.symlink(external, deploymentParent(home));
        },
      },
      {
        name: "intermediate parent mode",
        arrange: async (home) => {
          await mkdir0700(deploymentParent(home));
          await fs.promises.chmod(
            path.join(
              home,
              FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS[0],
              FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS[1],
            ),
            0o755,
          );
        },
      },
      {
        name: "claimed owner mismatch",
        claimedUid: effectiveUserId() + 1,
        arrange: async (home) => {
          await mkdir0700(deploymentParent(home));
        },
      },
      {
        name: "final symlink",
        arrange: async (home) => {
          const external = path.join(home, "external-key");
          await write0600(external, KEY_BYTES);
          await mkdir0700(deploymentParent(home));
          await fs.promises.symlink(external, deploymentKey(home));
        },
      },
      {
        name: "final hard link",
        arrange: async (home) => {
          const external = path.join(home, "external-key");
          await write0600(external, KEY_BYTES);
          await mkdir0700(deploymentParent(home));
          await fs.promises.link(external, deploymentKey(home));
        },
      },
      {
        name: "final wrong mode",
        arrange: async (home) => {
          await write0600(deploymentKey(home), KEY_BYTES);
          await fs.promises.chmod(deploymentKey(home), 0o644);
        },
      },
      {
        name: "final wrong length",
        arrange: async (home) => {
          await write0600(deploymentKey(home), KEY_BYTES.subarray(0, 31));
        },
      },
      {
        name: "final directory",
        arrange: async (home) => {
          await mkdir0700(deploymentKey(home));
        },
      },
    ];

    for (const testCase of cases) {
      const home = await temporaryHome();
      await testCase.arrange(home);
      const beforeParentEntries = await directoryEntriesOrEmpty(
        deploymentParent(home),
      );
      const failure = await captureFailure(() =>
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home, {
            effectiveUserId: testCase.claimedUid ?? effectiveUserId(),
          }),
        ),
      );
      expect(String(failure), testCase.name).not.toContain(home);
      expect(
        await directoryEntriesOrEmpty(deploymentParent(home)),
        testCase.name,
      ).toEqual(beforeParentEntries);
    }
  });

  it("loses a before-link race without replacing the competitor or leaving staging entries", async () => {
    const home = await temporaryHome();
    const competing = Buffer.from(REPLACEMENT_KEY_BYTES);
    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          failpointForTests: (event: FailpointPhase) => {
            if (event === "before-final-link") {
              fs.writeFileSync(deploymentKey(home), competing, {
                flag: "wx",
                mode: 0o600,
              });
              fs.chmodSync(deploymentKey(home), 0o600);
            }
          },
        }),
      ),
    );

    expect(await fs.promises.readFile(deploymentKey(home))).toEqual(competing);
    expect(await directoryEntriesOrEmpty(deploymentParent(home))).toEqual([
      FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
    ]);
    expect(String(failure)).toMatch(/exists|race|reconciliation/i);
    expect(String(failure)).not.toContain(home);
  });

  it("requires manual reconciliation for a fixed stale staging entry and never adopts its bytes", async () => {
    const home = await temporaryHome();
    let stagingBasename: string | undefined;
    await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          failpointForTests: (event: FailpointPhase) => {
            if (event === "after-staging-create") {
              const entries = fs.readdirSync(deploymentParent(home));
              stagingBasename = entries.find(
                (entry) => entry !== FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
              );
              throw new Error("synthetic staging name observation");
            }
          },
        }),
      ),
    );
    expect(stagingBasename).toBeDefined();
    expect(await directoryEntriesOrEmpty(deploymentParent(home))).toEqual([]);

    const stalePath = path.join(
      deploymentParent(home),
      stagingBasename as string,
    );
    await write0600(stalePath, REPLACEMENT_KEY_BYTES);
    const before = await fs.promises.readFile(stalePath);
    let randomCalls = 0;
    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          randomBytesForTests: () => {
            randomCalls += 1;
            return new Uint8Array(KEY_BYTES);
          },
        }),
      ),
    );

    expect(randomCalls).toBe(0);
    expect(await fs.promises.readFile(stalePath)).toEqual(before);
    expect(fs.existsSync(deploymentKey(home))).toBe(false);
    expect(String(failure)).toMatch(/manual|reconciliation|staging/i);
    expect(String(failure)).not.toContain(home);
    expect(String(failure)).not.toContain(
      REPLACEMENT_KEY_BYTES.toString("hex"),
    );
  });

  it("classifies a staging O_EXCL race as manual and leaves the competitor untouched", async () => {
    const home = await temporaryHome();
    const stagingPath = path.join(
      deploymentParent(home),
      ".root-key.bin.provisioning-v1",
    );
    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          failpointForTests: (event: FailpointPhase) => {
            if (event === "after-parent-created") {
              fs.writeFileSync(stagingPath, REPLACEMENT_KEY_BYTES, {
                flag: "wx",
                mode: 0o600,
              });
              fs.chmodSync(stagingPath, 0o600);
            }
          },
        }),
      ),
    );

    expect(failure).toMatchObject({
      phase: "staging-create",
      durability: "staging-may-exist",
      may_have_committed: false,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(await fs.promises.readFile(stagingPath)).toEqual(
      REPLACEMENT_KEY_BYTES,
    );
    expect(fs.existsSync(deploymentKey(home))).toBe(false);
  });

  it.each(FAILPOINT_PHASES)(
    "does not report success or leak secrets when %s fails",
    async (phase) => {
      const home = await temporaryHome();
      const failureCanary = `synthetic-${phase}-${PATH_CANARY}`;
      let observed: Uint8Array | undefined;
      let injected = 0;
      const failure = await captureFailure(() =>
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home, {
            observeInternalKeyForTests: (bytes: Uint8Array) => {
              observed = bytes;
            },
            failpointForTests: (event: FailpointPhase) => {
              if (event === phase) {
                injected += 1;
                throw new Error(failureCanary);
              }
            },
          }),
        ),
      );

      expect(injected).toBe(1);
      expect(String(failure)).not.toContain(failureCanary);
      expect(String(failure)).not.toContain(home);
      expect(String(failure)).not.toContain(KEY_BYTES.toString("hex"));
      const committed =
        FAILPOINT_PHASES.indexOf(phase) >=
        FAILPOINT_PHASES.indexOf("after-final-link");
      expect(failure).toMatchObject({
        phase: {
          "after-parent-created": "namespace",
          "after-staging-create": "staging-create",
          "after-write": "staging-write",
          "after-file-sync": "staging-file-sync",
          "before-final-link": "commit",
          "after-final-link": "commit",
          "after-final-directory-sync": "commit-directory-sync",
          "after-staging-unlink": "staging-removal",
          "after-cleanup-directory-sync": "cleanup-directory-sync",
          "before-final-revalidation": "revalidation",
          "after-descriptor-close": "cleanup",
        }[phase],
        durability: committed
          ? "key-published-and-staging-removal-durable"
          : "parent-chain-durable-key-absent",
        may_have_committed: committed,
        retry_disposition: committed
          ? "manual-reconciliation-required"
          : "safe-to-retry-after-readiness-not-provisioned",
      });
      if (observed !== undefined) {
        expect([...observed]).toEqual(
          Array.from({ length: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES }, () => 0),
        );
      }
      const entries = await directoryEntriesOrEmpty(deploymentParent(home));
      expect(
        entries.every(
          (entry) => entry === FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
        ),
      ).toBe(true);
    },
  );

  it("publishes only fixed pathless error metadata while the test observer receives the raw failure", async () => {
    const home = await temporaryHome();
    const rawFailure = new Error(`raw failure at ${home}`);
    let observedFailure: unknown;
    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          failpointForTests: (event: FailpointPhase) => {
            if (event === "after-write") throw rawFailure;
          },
          observeFailureForTests: (error: unknown) => {
            observedFailure = error;
          },
        }),
      ),
    );

    expect(observedFailure).toBe(rawFailure);
    expect(failure).toBeInstanceOf(
      provisioner.FloodgateV7DeploymentKeyProvisionerError,
    );
    expect(failure).toMatchObject({
      name: "FloodgateV7DeploymentKeyProvisionerError",
      phase: "staging-write",
      durability: "parent-chain-durable-key-absent",
      may_have_committed: false,
      retry_disposition: "safe-to-retry-after-readiness-not-provisioned",
    });
    expect(Reflect.ownKeys(failure as object).sort()).toEqual(
      [
        "durability",
        "may_have_committed",
        "message",
        "name",
        "phase",
        "retry_disposition",
        "stack",
      ].sort(),
    );
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("primary");
    expect(failure).not.toHaveProperty("code");
    expect(String(failure)).not.toContain(home);
    expect((failure as Error).stack).not.toContain(home);
    expect((failure as Error).stack).not.toContain(REPOSITORY_ROOT);
    expect(JSON.stringify(failure)).not.toContain(home);
  });

  it("never calls a durable committed key absent or safe-to-retry after descriptors close", async () => {
    const home = await temporaryHome();
    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(home, {
          failpointForTests: (event: FailpointPhase) => {
            if (event === "after-descriptor-close") {
              throw new Error("synthetic post-close failure");
            }
          },
        }),
      ),
    );

    expect(failure).toMatchObject({
      durability: "key-published-and-staging-removal-durable",
      may_have_committed: true,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(await fs.promises.readFile(deploymentKey(home))).toEqual(KEY_BYTES);
    await expect(
      inspectFloodgateV7DeploymentKeyReadinessCoreForTests({
        effectiveUserId: effectiveUserId(),
        homeDirectory: home,
      }),
    ).resolves.toMatchObject({ status: "ready" });
  });

  it("rejects non-undefined and asynchronous failpoint returns", async () => {
    for (const invalidHook of [
      (() => true) as never,
      (() => Promise.resolve()) as never,
    ]) {
      const home = await temporaryHome();
      const failure = await captureFailure(() =>
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home, { failpointForTests: invalidHook }),
        ),
      );
      expect(String(failure)).not.toContain(home);
      expect(fs.existsSync(deploymentKey(home))).toBe(false);
    }
  });

  it("zeroizes the internal key copy on success without touching the caller-owned random view", async () => {
    const home = await temporaryHome();
    const callerOwned = new Uint8Array(KEY_BYTES);
    let observed: Uint8Array | undefined;

    await provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
      dependencies(home, {
        randomBytesForTests: () => callerOwned,
        observeInternalKeyForTests: (bytes: Uint8Array) => {
          observed = bytes;
        },
      }),
    );

    expect([...callerOwned]).toEqual([...KEY_BYTES]);
    expect(observed).toBeDefined();
    expect(observed).not.toBe(callerOwned);
    expect([...(observed as Uint8Array)]).toEqual(
      Array.from({ length: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES }, () => 0),
    );
  });

  it("zeroizes entropy inside createSecret when the internal observer rejects synchrony", async () => {
    for (const returnPromise of [false, true]) {
      const home = await temporaryHome();
      let observed: Uint8Array | undefined;
      const failure = await captureFailure(() =>
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home, {
            observeInternalKeyForTests: ((bytes: Uint8Array) => {
              observed = bytes;
              if (returnPromise) return Promise.resolve();
              throw new Error("observer failure with retained key view");
            }) as never,
          }),
        ),
      );

      expect(failure).toBeDefined();
      expect(observed).toBeDefined();
      expect([...(observed as Uint8Array)]).toEqual(
        Array.from({ length: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES }, () => 0),
      );
      expect(fs.existsSync(deploymentParent(home))).toBe(false);
    }
  });

  it("rejects malformed randomness and exact-structure violations before filesystem mutation", async () => {
    for (const randomValue of [
      new Uint8Array(31),
      new Uint8Array(33),
      new Proxy(new Uint8Array(KEY_BYTES), {}),
      Object.assign(new Uint8Array(KEY_BYTES), { extra: true }),
    ]) {
      const home = await temporaryHome();
      await expect(
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
          dependencies(home, { randomBytesForTests: () => randomValue }),
        ),
      ).rejects.toBeDefined();
      expect(fs.existsSync(deploymentParent(home))).toBe(false);
    }

    const structuralHome = await temporaryHome();
    let traps = 0;
    const base = dependencies(structuralHome);
    const malformed: ProvisionerDependencies[] = [
      { ...base, extra: true } as never,
      Object.assign({ ...base }, { [Symbol("extra")]: true }) as never,
      withAccessor(base, "homeDirectory", () => {
        traps += 1;
      }),
      trapProxy(base, () => {
        traps += 1;
      }),
    ];
    for (const value of malformed) {
      const failure = await captureFailure(() =>
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(value),
      );
      expect(String(failure)).not.toContain(structuralHome);
    }
    expect(traps).toBe(0);
    expect(fs.existsSync(deploymentParent(structuralHome))).toBe(false);
  });

  it("accepts an exact null-prototype dependency record and rejects proxied hooks without invoking traps", async () => {
    const acceptedHome = await temporaryHome();
    const accepted = Object.assign(
      Object.create(null),
      dependencies(acceptedHome),
    ) as ProvisionerDependencies;
    await expect(
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(accepted),
    ).resolves.toBeDefined();

    const rejectedHome = await temporaryHome();
    let traps = 0;
    const proxiedRandom = trapProxy(
      (() => new Uint8Array(KEY_BYTES)) as () => Uint8Array,
      () => {
        traps += 1;
      },
    );
    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(rejectedHome, {
          randomBytesForTests: proxiedRandom,
        }),
      ),
    );
    expect(traps).toBe(0);
    expect(String(failure)).not.toContain(rejectedHome);
    expect(fs.existsSync(deploymentParent(rejectedHome))).toBe(false);
  });

  it("keeps production injection closed and both entry-point arities exact", async () => {
    expect(provisioner.provisionFloodgateV7DeploymentKey).toHaveLength(0);
    expect(
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests,
    ).toHaveLength(1);

    await expect(
      Reflect.apply(
        provisioner.provisionFloodgateV7DeploymentKeyCoreForTests,
        null,
        [],
      ),
    ).rejects.toThrow(/exactly one argument/i);
    await expect(
      Reflect.apply(provisioner.provisionFloodgateV7DeploymentKey, null, [
        dependencies(await temporaryHome()),
      ]),
    ).rejects.toBeDefined();
  });

  it("rejects the real production home before entropy or namespace mutation", async () => {
    const productionHome = await fs.promises.realpath(os.userInfo().homedir);
    const parentBefore = await metadataOnlySnapshot(
      deploymentParent(productionHome),
    );
    const keyBefore = await metadataOnlySnapshot(deploymentKey(productionHome));
    let randomCalls = 0;

    const failure = await captureFailure(() =>
      provisioner.provisionFloodgateV7DeploymentKeyCoreForTests(
        dependencies(productionHome, {
          randomBytesForTests: () => {
            randomCalls += 1;
            return new Uint8Array(KEY_BYTES);
          },
        }),
      ),
    );

    expect(randomCalls).toBe(0);
    expect(failure).toMatchObject({
      phase: "capture",
      durability: "no-deployment-change-established",
      may_have_committed: false,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(
      await metadataOnlySnapshot(deploymentParent(productionHome)),
    ).toEqual(parentBefore);
    expect(await metadataOnlySnapshot(deploymentKey(productionHome))).toEqual(
      keyBefore,
    );
  });
});

describe("Floodgate v7 deployment-key provisioner source boundary", () => {
  it("uses hard-link no-clobber publication without rename, logging, or checkpoint coupling", async () => {
    const source = await fs.promises.readFile(SOURCE_PATH, "utf8");
    expect(source).toContain("O_EXCL");
    expect(source).toContain("O_NOFOLLOW");
    expect(source).toMatch(/\.link\(|\blink\(/);
    expect(source).not.toMatch(/\.rename\(|\brename\(/);
    expect(source).not.toMatch(/\bconsole\.(?:log|info|warn|error)\b/);
    expect(source).not.toMatch(
      /from\s+["']\.\/floodgate-(?:stable-proposal|v7-teacher-checkpoint|source|roles|training)/,
    );
    expect(source).not.toMatch(
      /readonly\s+(?:absolute_?path|relative_?path|root_?key|key_?hash|key_?instance_?id)\s*:/i,
    );
    expect(source).toMatch(/while\s*\([^)]*offset[^)]*</);
    expect(source).toMatch(/bytesWritten/);
    expect([...source.matchAll(/\.sync\(\)/g)].length).toBeGreaterThanOrEqual(
      3,
    );
    expect(source).toMatch(/\.close\(\)/);
  });
});
