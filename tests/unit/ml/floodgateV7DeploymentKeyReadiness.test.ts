import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
  inspectFloodgateV7DeploymentKeyReadiness,
  inspectFloodgateV7DeploymentKeyReadinessCoreForTests,
  type FloodgateV7DeploymentKeyReadinessReceipt,
} from "../../../ml/floodgate-v7-deployment-key-readiness";

const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("readiness tests require a POSIX effective uid");
  }
  return process.geteuid();
}

async function homeFixture(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-key-readiness-"),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  return home;
}

function parentPath(home: string): string {
  return path.join(
    home,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
}

function managedDirectoryPath(home: string, index: number): string {
  return path.join(
    home,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.slice(0, index + 1),
  );
}

function keyPath(home: string): string {
  return path.join(parentPath(home), FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME);
}

async function inspect(
  home: string,
): Promise<Readonly<FloodgateV7DeploymentKeyReadinessReceipt>> {
  return inspectFloodgateV7DeploymentKeyReadinessCoreForTests({
    effectiveUserId: effectiveUserId(),
    homeDirectory: home,
  });
}

async function inspectWithMutationBeforeSecondLstat(
  home: string,
  targetPath: string,
  mutate: () => void,
): Promise<
  Readonly<{
    receipt: Readonly<FloodgateV7DeploymentKeyReadinessReceipt>;
    targetLstatCalls: number;
  }>
> {
  let targetLstatCalls = 0;
  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    const originalLstat = actual.promises.lstat.bind(actual.promises);
    return {
      ...actual,
      promises: {
        ...actual.promises,
        lstat: (...args: unknown[]): unknown => {
          if (args[0] === targetPath) {
            targetLstatCalls += 1;
            if (targetLstatCalls === 2) mutate();
          }
          return Reflect.apply(originalLstat, actual.promises, args);
        },
      },
    };
  });

  try {
    const isolated =
      await import("../../../ml/floodgate-v7-deployment-key-readiness");
    const receipt =
      await isolated.inspectFloodgateV7DeploymentKeyReadinessCoreForTests({
        effectiveUserId: effectiveUserId(),
        homeDirectory: home,
      });
    return { receipt, targetLstatCalls };
  } finally {
    vi.doUnmock("node:fs");
    vi.resetModules();
  }
}

async function createManagedChain(home: string): Promise<void> {
  for (
    let index = 0;
    index < FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
    index += 1
  ) {
    const directory = managedDirectoryPath(home, index);
    await fs.promises.mkdir(directory, { mode: 0o700 });
    await fs.promises.chmod(directory, 0o700);
  }
}

async function createKey(home: string, fill: number): Promise<void> {
  await fs.promises.writeFile(
    keyPath(home),
    Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, fill),
    { flag: "wx", mode: 0o600 },
  );
  await fs.promises.chmod(keyPath(home), 0o600);
}

function assertDeepFrozenNullPrototype(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.getPrototypeOf(value)).toBeNull();
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    assertDeepFrozenNullPrototype(child);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

posixDescribe("Floodgate v7 deployment-key metadata readiness", () => {
  it("reports a missing parent and a missing key without provisioning either", async () => {
    const home = await homeFixture();
    const receipt = await inspect(home);

    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
      status: "not-provisioned",
      claim_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
      execution_boundary: "test-only-injected-current-euid-home-metadata",
      deployment: {
        parent: "absent",
        key: "absent",
        authoritative_reopen_required: true,
      },
      nonclaims: {
        key_bytes_read: false,
        key_created_or_written: false,
        key_instance_id: false,
      },
    });
    expect(fs.existsSync(parentPath(home))).toBe(false);
    expect(fs.existsSync(keyPath(home))).toBe(false);
    assertDeepFrozenNullPrototype(receipt);
  });

  it("walks an existing safe prefix and stops at the first missing managed component", async () => {
    const home = await homeFixture();
    const firstManagedDirectory = managedDirectoryPath(home, 0);
    await fs.promises.mkdir(firstManagedDirectory, { mode: 0o700 });
    await fs.promises.chmod(firstManagedDirectory, 0o700);

    await expect(inspect(home)).resolves.toMatchObject({
      status: "not-provisioned",
      deployment: { parent: "absent", key: "absent" },
    });
    expect(fs.existsSync(managedDirectoryPath(home, 1))).toBe(false);
    expect(fs.existsSync(keyPath(home))).toBe(false);
  });

  it("distinguishes a safe empty deployment parent from an unsafe key slot", async () => {
    const home = await homeFixture();
    await fs.promises.mkdir(parentPath(home), { recursive: true, mode: 0o700 });
    await fs.promises.chmod(parentPath(home), 0o700);

    await expect(inspect(home)).resolves.toMatchObject({
      status: "not-provisioned",
      deployment: {
        parent: "present-current-euid-exact-0700-directory",
        key: "absent",
      },
    });

    await fs.promises.writeFile(keyPath(home), Buffer.alloc(31, 0x5a), {
      mode: 0o600,
    });
    await fs.promises.chmod(keyPath(home), 0o600);
    await expect(inspect(home)).resolves.toMatchObject({
      status: "unsafe",
      deployment: {
        parent: "present-current-euid-exact-0700-directory",
        key: "unsafe",
      },
    });
  });

  it("reports ready from metadata only while leaving exact key bytes unchanged", async () => {
    const home = await homeFixture();
    await fs.promises.mkdir(parentPath(home), { recursive: true, mode: 0o700 });
    await fs.promises.chmod(parentPath(home), 0o700);
    const key = Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, 0xa7);
    await fs.promises.writeFile(keyPath(home), key, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.promises.chmod(keyPath(home), 0o600);
    const before = await fs.promises.readFile(keyPath(home));

    const receipt = await inspect(home);

    expect(receipt).toMatchObject({
      status: "ready",
      deployment: {
        parent: "present-current-euid-exact-0700-directory",
        key: "present-current-euid-exact-0600-regular-nlink-1-32-bytes",
      },
      nonclaims: {
        key_bytes_read: false,
        key_created_or_written: false,
        key_authority: false,
        checkpoint: false,
        runtime: false,
      },
    });
    expect(await fs.promises.readFile(keyPath(home))).toEqual(before);
    expect(JSON.stringify(receipt)).not.toContain(home);
    expect(JSON.stringify(receipt)).not.toContain(key.toString("hex"));
  });

  it("reports unsafe when the key is replaced before final metadata revalidation", async () => {
    const home = await homeFixture();
    await createManagedChain(home);
    await createKey(home, 0x41);
    const replacementPath = path.join(
      parentPath(home),
      ".root-key-readiness-replacement",
    );
    await fs.promises.writeFile(
      replacementPath,
      Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, 0x42),
      { flag: "wx", mode: 0o600 },
    );
    await fs.promises.chmod(replacementPath, 0o600);
    const originalStat = await fs.promises.lstat(keyPath(home), {
      bigint: true,
    });
    const replacementStat = await fs.promises.lstat(replacementPath, {
      bigint: true,
    });
    expect(replacementStat.ino).not.toBe(originalStat.ino);
    expect(replacementStat.size).toBe(originalStat.size);
    expect(replacementStat.mode & BigInt(0o7777)).toBe(
      originalStat.mode & BigInt(0o7777),
    );

    const result = await inspectWithMutationBeforeSecondLstat(
      home,
      keyPath(home),
      () => fs.renameSync(replacementPath, keyPath(home)),
    );

    expect(result.targetLstatCalls).toBe(2);
    expect(result.receipt).toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });
  });

  it("reports unsafe when the key is removed before final metadata revalidation", async () => {
    const home = await homeFixture();
    await createManagedChain(home);
    await createKey(home, 0x51);

    const result = await inspectWithMutationBeforeSecondLstat(
      home,
      keyPath(home),
      () => fs.unlinkSync(keyPath(home)),
    );

    expect(result.targetLstatCalls).toBe(2);
    expect(result.receipt).toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });
  });

  it("reports unsafe when a missing key is created before absence revalidation", async () => {
    const home = await homeFixture();
    await createManagedChain(home);

    const result = await inspectWithMutationBeforeSecondLstat(
      home,
      keyPath(home),
      () => {
        fs.writeFileSync(
          keyPath(home),
          Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, 0x61),
          { flag: "wx", mode: 0o600 },
        );
        fs.chmodSync(keyPath(home), 0o600);
      },
    );

    expect(result.targetLstatCalls).toBe(2);
    expect(result.receipt).toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });
  });

  it("reports unsafe when a missing managed component is created before absence revalidation", async () => {
    const home = await homeFixture();
    const firstManagedDirectory = managedDirectoryPath(home, 0);
    const missingManagedDirectory = managedDirectoryPath(home, 1);
    await fs.promises.mkdir(firstManagedDirectory, { mode: 0o700 });
    await fs.promises.chmod(firstManagedDirectory, 0o700);

    const result = await inspectWithMutationBeforeSecondLstat(
      home,
      missingManagedDirectory,
      () => {
        fs.mkdirSync(missingManagedDirectory, { mode: 0o700 });
        fs.chmodSync(missingManagedDirectory, 0o700);
      },
    );

    expect(result.targetLstatCalls).toBe(2);
    expect(result.receipt).toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });
  });

  it("does not let an inherited numeric Array setter redirect the fixed readiness path", async () => {
    const home = await homeFixture();
    const alternateHome = await homeFixture();
    const managedPaths =
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.map(
        (_component, index) => managedDirectoryPath(home, index),
      );
    const alternateManagedPaths =
      FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.map(
        (_component, index) => managedDirectoryPath(alternateHome, index),
      );
    for (const directory of managedPaths) {
      await fs.promises.mkdir(directory, { mode: 0o700 });
      await fs.promises.chmod(directory, 0o700);
    }
    for (const directory of alternateManagedPaths) {
      await fs.promises.mkdir(directory, { mode: 0o700 });
      await fs.promises.chmod(directory, 0o700);
    }
    const key = Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, 0x4a);
    await fs.promises.writeFile(keyPath(home), key, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.promises.chmod(keyPath(home), 0o600);
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
    let receipt: Readonly<FloodgateV7DeploymentKeyReadinessReceipt> | undefined;
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

      receipt = await inspect(home);
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
      status: "ready",
      deployment: {
        parent: "present-current-euid-exact-0700-directory",
        key: "present-current-euid-exact-0600-regular-nlink-1-32-bytes",
      },
    });
    expect(await fs.promises.readFile(keyPath(home))).toEqual(key);
    expect(fs.existsSync(keyPath(alternateHome))).toBe(false);
  });

  it("reports ready from a canonical current-EUID 0755 home while every managed parent remains 0700", async () => {
    const home = await homeFixture();
    await fs.promises.mkdir(parentPath(home), { recursive: true, mode: 0o700 });
    const key = Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, 0x75);
    await fs.promises.writeFile(keyPath(home), key, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.promises.chmod(keyPath(home), 0o600);
    await fs.promises.chmod(home, 0o755);

    expect((await fs.promises.lstat(home)).mode & 0o777).toBe(0o755);
    for (
      let depth = 1;
      depth <= FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
      depth += 1
    ) {
      const managedParent = path.join(
        home,
        ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.slice(0, depth),
      );
      expect((await fs.promises.lstat(managedParent)).mode & 0o777).toBe(0o700);
    }

    await expect(inspect(home)).resolves.toMatchObject({
      status: "ready",
      deployment: {
        parent: "present-current-euid-exact-0700-directory",
        key: "present-current-euid-exact-0600-regular-nlink-1-32-bytes",
      },
    });
  });

  it("accepts a canonical current-EUID 0750 home", async () => {
    const home = await homeFixture();
    await fs.promises.mkdir(parentPath(home), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(
      keyPath(home),
      Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, 0x50),
      { flag: "wx", mode: 0o600 },
    );
    await fs.promises.chmod(keyPath(home), 0o600);
    await fs.promises.chmod(home, 0o750);

    await expect(inspect(home)).resolves.toMatchObject({ status: "ready" });
    expect((await fs.promises.lstat(parentPath(home))).mode & 0o777).toBe(
      0o700,
    );
  });

  it("reports unsafe for writable, owner-inaccessible, special-bit, aliased, and wrong-owner home anchors", async () => {
    for (const [label, mode] of [
      ["group writable", 0o775],
      ["world writable", 0o777],
      ["owner lacks execute", 0o600],
      ["special bit", 0o1700],
    ] as const) {
      const home = await homeFixture();
      await fs.promises.chmod(home, mode);
      try {
        expect((await fs.promises.lstat(home)).mode & 0o7777, label).toBe(mode);
        await expect(inspect(home), label).resolves.toMatchObject({
          status: "unsafe",
          deployment: { parent: "unsafe", key: "unsafe" },
        });
      } finally {
        await fs.promises.chmod(home, 0o700);
      }
    }

    const target = await homeFixture();
    const aliasRoot = await homeFixture();
    const alias = path.join(aliasRoot, "home-alias");
    await fs.promises.symlink(target, alias);
    await expect(inspect(alias)).resolves.toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });

    await expect(
      inspectFloodgateV7DeploymentKeyReadinessCoreForTests({
        effectiveUserId: effectiveUserId() + 1,
        homeDirectory: target,
      }),
    ).resolves.toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });
  });

  it("reports unsafe when the first or an intermediate managed directory is not exact 0700", async () => {
    const home = await homeFixture();
    await fs.promises.mkdir(parentPath(home), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(
      keyPath(home),
      Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES, 0x31),
      { flag: "wx", mode: 0o600 },
    );
    await fs.promises.chmod(keyPath(home), 0o600);

    for (const [label, index, mode] of [
      ["first managed directory", 0, 0o755],
      ["intermediate managed directory", 1, 0o777],
    ] as const) {
      const directory = managedDirectoryPath(home, index);
      await fs.promises.chmod(directory, mode);
      try {
        await expect(inspect(home), label).resolves.toMatchObject({
          status: "unsafe",
          deployment: { parent: "unsafe", key: "unsafe" },
        });
      } finally {
        await fs.promises.chmod(directory, 0o700);
      }
    }
  });

  it("fails closed on unsafe parent modes, symlinks, and hard-linked keys", async () => {
    const wrongModeHome = await homeFixture();
    await fs.promises.mkdir(parentPath(wrongModeHome), {
      recursive: true,
      mode: 0o755,
    });
    await fs.promises.chmod(parentPath(wrongModeHome), 0o755);
    await expect(inspect(wrongModeHome)).resolves.toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });

    const symlinkHome = await homeFixture();
    const externalParent = path.join(symlinkHome, "external-parent");
    await fs.promises.mkdir(externalParent, { mode: 0o700 });
    await fs.promises.mkdir(path.dirname(parentPath(symlinkHome)), {
      recursive: true,
      mode: 0o700,
    });
    await fs.promises.symlink(externalParent, parentPath(symlinkHome));
    await expect(inspect(symlinkHome)).resolves.toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });

    const hardLinkHome = await homeFixture();
    await fs.promises.mkdir(parentPath(hardLinkHome), {
      recursive: true,
      mode: 0o700,
    });
    await fs.promises.chmod(parentPath(hardLinkHome), 0o700);
    await fs.promises.writeFile(
      keyPath(hardLinkHome),
      Buffer.alloc(FLOODGATE_V7_DEPLOYMENT_KEY_BYTES),
      { mode: 0o600 },
    );
    await fs.promises.chmod(keyPath(hardLinkHome), 0o600);
    await fs.promises.link(
      keyPath(hardLinkHome),
      path.join(hardLinkHome, "second-link"),
    );
    await expect(inspect(hardLinkHome)).resolves.toMatchObject({
      status: "unsafe",
      deployment: {
        parent: "present-current-euid-exact-0700-directory",
        key: "unsafe",
      },
    });
  });

  it("rejects structural authority and Proxy traps as a pathless unsafe result", async () => {
    const home = await homeFixture();
    let traps = 0;
    const proxy = new Proxy(
      { effectiveUserId: effectiveUserId(), homeDirectory: home },
      {
        ownKeys: () => {
          traps += 1;
          throw new Error(`forbidden ${home}`);
        },
      },
    );

    const proxyReceipt =
      await inspectFloodgateV7DeploymentKeyReadinessCoreForTests(proxy);
    expect(traps).toBe(0);
    expect(proxyReceipt).toMatchObject({
      status: "unsafe",
      deployment: { parent: "unsafe", key: "unsafe" },
    });
    expect(JSON.stringify(proxyReceipt)).not.toContain(home);

    const extra = await inspectFloodgateV7DeploymentKeyReadinessCoreForTests({
      effectiveUserId: effectiveUserId(),
      homeDirectory: home,
      extra: true,
    } as never);
    expect(extra.status).toBe("unsafe");
    await expect(
      Reflect.apply(
        inspectFloodgateV7DeploymentKeyReadinessCoreForTests,
        null,
        [],
      ),
    ).rejects.toThrow(/exactly one argument/);
  });

  it("exposes an argumentless production probe with only fixed metadata", async () => {
    const receipt = await inspectFloodgateV7DeploymentKeyReadiness();
    expect(["ready", "not-provisioned", "unsafe"]).toContain(receipt.status);
    expect(receipt.execution_boundary).toBe(
      "production-fixed-current-euid-userinfo-home-metadata",
    );
    expect(receipt.nonclaims.key_bytes_read).toBe(false);
    expect(receipt.nonclaims.key_created_or_written).toBe(false);
    assertDeepFrozenNullPrototype(receipt);
  });
});
