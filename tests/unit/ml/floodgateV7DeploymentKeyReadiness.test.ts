import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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
