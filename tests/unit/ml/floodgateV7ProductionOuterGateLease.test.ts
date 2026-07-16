import { createHmac, hkdfSync, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
} from "../../../ml/floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_INFO,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_SALT,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HMAC_DOMAIN,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_MANUAL_CONFIRMATION,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
  FloodgateV7ProductionOuterGateLeaseError,
  cancelFloodgateV7ProductionOuterGateStaleLeaseInspectionCoreForTests,
  claimFloodgateV7ProductionOuterGateConnectorCapability,
  claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests,
  confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantineCoreForTests,
  inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests,
  runFloodgateV7ProductionOuterGateFinal24000,
  runFloodgateV7ProductionOuterGateOwnerCoreForTests,
  runFloodgateV7ProductionOuterGatePrefix100,
  runFloodgateV7ProductionOuterGatePrefix500,
  runWithFloodgateV7ProductionOuterGateLeaseCoreForTests,
  type FloodgateV7ProductionOuterGate,
  type FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
} from "../../../ml/floodgate-v7-production-outer-gate-lease";

const EUID = process.geteuid?.() ?? 501;
const ROOT_KEY = Buffer.from("17".repeat(32), "hex");
const PRIVATE_CANARY = "outer-gate-private-canary";
const OUTER_SOURCE_PATH = path.resolve(
  "ml/floodgate-v7-production-outer-gate-lease.ts",
);
const temporaryRoots: string[] = [];
const darwinDescribe = describe.runIf(
  process.platform === "darwin" && fs.existsSync("/usr/bin/lockf"),
);

interface Fixture {
  readonly home: string;
  readonly registryPath: string;
  readonly controlRoot: string;
  readonly activePath: string;
  readonly quarantineRoot: string;
  readonly retiredRoot: string;
  readonly dependencies: FloodgateV7ProductionOuterGateLeaseDependenciesForTests;
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `${PRIVATE_CANARY}-`),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  const registryRoot = path.join(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  await fs.promises.mkdir(registryRoot, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(registryRoot, 0o700);
  const registryPath = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
  await fs.promises.writeFile(
    registryPath,
    `${JSON.stringify({ private: PRIVATE_CANARY })}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await fs.promises.chmod(registryPath, 0o600);
  const controlRoot = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  );
  return {
    home,
    registryPath,
    controlRoot,
    activePath: path.join(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
    ),
    quarantineRoot: path.join(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
    ),
    retiredRoot: path.join(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
    ),
    dependencies: {
      effectiveUserId: EUID,
      homeDirectory: home,
      rootKey: ROOT_KEY,
      hostname: "outer-gate-test.local",
      pid: process.pid,
      now: () => new Date("2026-07-15T12:34:56.789Z"),
      nonce: () => randomBytes(32),
      installProcessLifecycleHandlers: false,
    },
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected outer gate operation to fail");
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function preserveAuthenticatedStaleLease(
  environment: Fixture,
  gate: FloodgateV7ProductionOuterGate = "durable-prefix-100",
): Promise<Buffer> {
  let bytes = Buffer.alloc(0);
  await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
    gate,
    environment.dependencies,
    async () => {
      bytes = await fs.promises.readFile(environment.activePath);
    },
  );
  await fs.promises.writeFile(environment.activePath, bytes, {
    flag: "wx",
    mode: 0o600,
  });
  return bytes;
}

function publicProjection(error: unknown): string {
  return [
    String(error),
    error instanceof Error ? error.stack : "",
    JSON.stringify(error),
  ].join("\n");
}

function fixedRunnerExportName(gate: FloodgateV7ProductionOuterGate): string {
  return gate === "durable-prefix-100"
    ? "runFloodgateV7ProductionConnectorPrefix100UnderOuterGate"
    : gate === "durable-prefix-500"
      ? "runFloodgateV7ProductionConnectorPrefix500UnderOuterGate"
      : "runFloodgateV7ProductionConnectorFinal24000UnderOuterGate";
}

function addExtraFieldWithValidMac(bytes: Buffer): Buffer {
  const parsed = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  const unsigned = { ...parsed };
  delete unsigned.mac;
  const extraUnsigned = { ...unsigned, unexpected: "extra-retired-field" };
  const unsignedBytes = Buffer.from(
    `${JSON.stringify(extraUnsigned)}\n`,
    "utf8",
  );
  const leaseKey = Buffer.from(
    hkdfSync(
      "sha256",
      ROOT_KEY,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_SALT,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HKDF_INFO,
      32,
    ),
  );
  try {
    const mac = createHmac("sha256", leaseKey)
      .update(FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_HMAC_DOMAIN, "utf8")
      .update(unsignedBytes)
      .digest("hex");
    return Buffer.from(
      `${JSON.stringify({ ...extraUnsigned, mac })}\n`,
      "utf8",
    );
  } finally {
    unsignedBytes.fill(0);
    leaseKey.fill(0);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

darwinDescribe("Floodgate v7 production outer gate lease", () => {
  it.each([
    "durable-prefix-100",
    "durable-prefix-500",
    "sealed-final-24000",
  ] as const)(
    "holds one registry-anchored OS lock and authenticated lease around %s",
    async (gate) => {
      const environment = await fixture();
      let operationObserved = false;
      const result =
        await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
          gate,
          environment.dependencies,
          async () => {
            operationObserved = true;
            const active = await fs.promises.readFile(
              environment.activePath,
              "utf8",
            );
            expect(active).toContain(`\"gate\":\"${gate}\"`);
            expect(active).toMatch(/"mac":"[0-9a-f]{64}"/u);
            const competing = spawnSync(
              "/usr/bin/lockf",
              ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
              { stdio: "ignore" },
            );
            expect(competing.status).toBe(75);
            return { gate };
          },
        );

      expect(operationObserved).toBe(true);
      expect(result.value).toEqual({ gate });
      expect(result.lease).toEqual({
        contract: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
        status: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
        algorithm: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
        verification: {
          one_os_lifetime_lock_shared_by_all_three_gates: true,
          os_lifetime_lock_held_before_operation: true,
          authenticated_lease_metadata_durable_before_operation: true,
          signal_and_exit_preserve_stale_evidence: true,
          authenticated_lease_removed_durably_after_operation: true,
          authenticated_retired_evidence_durable_after_operation: true,
          os_lifetime_lock_released_after_operation: true,
          quarantine_empty_after_operation: true,
        },
        nonclaims: {
          lock_or_lease_path_disclosed: false,
          lease_metadata_disclosed: false,
          key_material_disclosed: false,
          key_instance_id_disclosed: false,
          lease_mac_disclosed: false,
          connector_receipt_disclosed: false,
          graceful_signal_cleanup: false,
          checkpoint: false,
          teacher_label: false,
          training: false,
          weight: false,
          live_evaluation_activation: false,
          match: false,
          playing_strength: false,
        },
      });
      await expect(
        fs.promises.lstat(environment.activePath),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
      expect(await fs.promises.readdir(environment.retiredRoot)).toHaveLength(
        1,
      );
      const after = spawnSync(
        "/usr/bin/lockf",
        ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
        { stdio: "ignore" },
      );
      expect(after.status).toBe(0);
      expect(JSON.stringify(result.lease)).not.toContain(PRIVATE_CANARY);
      expect(JSON.stringify(result.lease)).not.toContain(
        ROOT_KEY.toString("hex"),
      );
    },
  );

  it("keeps connector capabilities opaque, gate-bound, and single-use", async () => {
    const environment = await fixture();
    const result = await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-500",
      environment.dependencies,
      async (capability) => {
        const clone = { ...capability };
        expect(() =>
          claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
            clone,
          ),
        ).toThrow(/capability differs/u);
        expect(() =>
          claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests({
            contract:
              "shogi-floodgate-v7-production-outer-gate-connector-capability-v1",
            status: "opaque-single-use-valid-only-while-common-os-lock-is-held",
          }),
        ).toThrow(/capability differs/u);
        expect(() =>
          claimFloodgateV7ProductionOuterGateConnectorCapability(capability),
        ).toThrow(/capability differs/u);
        expect(
          claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
            capability,
          ),
        ).toBe("durable-prefix-500");
        expect(() =>
          claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
            capability,
          ),
        ).toThrow(/capability differs/u);
        return "claimed-once";
      },
    );
    expect(result.value).toBe("claimed-once");
    expect(JSON.stringify(result)).not.toContain(
      "opaque-single-use-valid-only-while-common-os-lock-is-held",
    );
  });

  it.each([
    "durable-prefix-100",
    "durable-prefix-500",
    "sealed-final-24000",
  ] as const)(
    "runs only the fixed %s export after its capability is claimed",
    async (gate) => {
      const environment = await fixture();
      let invoked = 0;
      const exportName = fixedRunnerExportName(gate);
      const result = await runFloodgateV7ProductionOuterGateOwnerCoreForTests(
        gate,
        environment.dependencies,
        () => ({
          [exportName]: async (
            capability: Parameters<
              typeof claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests
            >[0],
          ) => {
            invoked += 1;
            expect(
              claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
                capability,
              ),
            ).toBe(gate);
            return { gate };
          },
        }),
      );
      expect(invoked).toBe(1);
      expect(result.value).toEqual({ gate });
    },
  );

  it("loads the fixed getter export through captured require under tsx/cjs", async () => {
    const environment = await fixture();
    const modulePath = path.resolve(
      "ml/floodgate-v7-production-outer-gate-lease.ts",
    );
    const childSource = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
let outer;
let getterCalls = 0;
let operationCalls = 0;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-connector-runner")) {
    const fake = {};
    Object.defineProperty(fake, "runFloodgateV7ProductionConnectorPrefix100UnderOuterGate", {
      configurable: false,
      enumerable: true,
      get() {
        getterCalls += 1;
        return async (capability) => {
          operationCalls += 1;
          const gate = outer.claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(capability);
          return { gate };
        };
      },
    });
    return fake;
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
outer = require(${JSON.stringify(modulePath)});
outer.runFloodgateV7ProductionOuterGateLazyOwnerCoreForTests(
  "durable-prefix-100",
  {
    effectiveUserId: ${EUID},
    homeDirectory: ${JSON.stringify(environment.home)},
    rootKey: Buffer.from(${JSON.stringify(ROOT_KEY.toString("hex"))}, "hex"),
    hostname: "lazy-owner-test.local",
    pid: process.pid,
    installProcessLifecycleHandlers: false,
  },
).then(
  (result) => process.stdout.write(JSON.stringify({ value: result.value, getterCalls, operationCalls }) + "\n"),
  () => { process.exitCode = 1; },
);
`;
    const child = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", childSource],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: undefined },
        timeout: 10_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout)).toEqual({
      value: { gate: "durable-prefix-100" },
      getterCalls: 1,
      operationCalls: 1,
    });
  });

  it("fails closed when a fixed runner returns without claiming its capability", async () => {
    const environment = await fixture();
    const error = await captureFailure(() =>
      runFloodgateV7ProductionOuterGateOwnerCoreForTests(
        "durable-prefix-100",
        environment.dependencies,
        () => ({
          runFloodgateV7ProductionConnectorPrefix100UnderOuterGate: async () =>
            "unclaimed",
        }),
      ),
    );
    expect(error).toMatchObject({
      phase: "operation",
      disposition: "manual-reconciliation-required",
      authenticated_lease_published: true,
    });
    expect(
      (await fs.promises.lstat(environment.activePath)).size,
    ).toBeGreaterThan(0);
  });

  it("sanitizes lazy runner load failure before any runner operation is invoked", async () => {
    const environment = await fixture();
    let operationCalls = 0;
    const error = await captureFailure(() =>
      runFloodgateV7ProductionOuterGateOwnerCoreForTests(
        "sealed-final-24000",
        environment.dependencies,
        () => {
          const unusedModule = {
            runFloodgateV7ProductionConnectorFinal24000UnderOuterGate:
              async () => {
                operationCalls += 1;
              },
          };
          void unusedModule;
          throw new Error(PRIVATE_CANARY);
        },
      ),
    );
    expect(operationCalls).toBe(0);
    expect(error).toMatchObject({
      phase: "operation",
      authenticated_lease_published: true,
    });
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
  });

  it("exposes only three zero-argument production owners and no generic callback owner", async () => {
    expect(runFloodgateV7ProductionOuterGatePrefix100.length).toBe(0);
    expect(runFloodgateV7ProductionOuterGatePrefix500.length).toBe(0);
    expect(runFloodgateV7ProductionOuterGateFinal24000.length).toBe(0);
    const source = await fs.promises.readFile(OUTER_SOURCE_PATH, "utf8");
    expect(source).not.toMatch(
      /export function runWithFloodgateV7ProductionOuterGateLease(?!CoreForTests)/u,
    );
    expect(source).toContain(
      'capturedRequire("./floodgate-v7-production-connector-runner")',
    );
    expect(source).toContain(
      "opaque-single-use-valid-only-while-common-os-lock-is-held",
    );
  });

  it("serializes prefix and final gates with the same OS lock", async () => {
    const environment = await fixture();
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      environment.dependencies,
      async () => {
        started();
        await hold;
        return "first";
      },
    );
    await startedPromise;

    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "sealed-final-24000",
        environment.dependencies,
        async () => "second",
      ),
    );
    expect(error).toBeInstanceOf(FloodgateV7ProductionOuterGateLeaseError);
    expect(error).toMatchObject({
      phase: "os-lock",
      disposition: "another-gate-invocation-active",
      os_lock_acquired: false,
      authenticated_lease_published: false,
    });
    release();
    await expect(first).resolves.toMatchObject({ value: "first" });
  });

  it("treats only lockf status 75 as contention and sanitizes other helper failures", async () => {
    const environment = await fixture();
    let invoked = false;
    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-100",
        { ...environment.dependencies, lockfPath: "/usr/bin/false" },
        async () => {
          invoked = true;
        },
      ),
    );
    expect(invoked).toBe(false);
    expect(error).toMatchObject({
      phase: "os-lock",
      disposition: "manual-reconciliation-required",
      os_lock_acquired: false,
    });
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
  });

  it("preserves an empty legacy crash lease and repeats inspect-only fail closed", async () => {
    const environment = await fixture();
    await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      environment.dependencies,
      async () => undefined,
    );
    await fs.promises.writeFile(environment.activePath, "", {
      flag: "wx",
      mode: 0o600,
    });

    for (const gate of [
      "durable-prefix-100",
      "durable-prefix-500",
      "sealed-final-24000",
    ] as const) {
      let invoked = false;
      const error = await captureFailure(() =>
        runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
          gate,
          environment.dependencies,
          async () => {
            invoked = true;
          },
        ),
      );
      expect(invoked).toBe(false);
      expect(error).toMatchObject({
        phase: "stale-inspection",
        disposition: "manual-reconciliation-required",
        os_lock_acquired: true,
        authenticated_lease_published: false,
        stale_lease_quarantined: false,
        stale_lease_authenticated: false,
      });
      expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
      expect((await fs.promises.lstat(environment.activePath)).size).toBe(0);
      expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
    }
  });

  it("preserves a valid authenticated stale lease for explicit reconciliation", async () => {
    const environment = await fixture();
    let leaseBytes = Buffer.alloc(0);
    await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-500",
      environment.dependencies,
      async () => {
        leaseBytes = await fs.promises.readFile(environment.activePath);
      },
    );
    await fs.promises.writeFile(environment.activePath, leaseBytes, {
      flag: "wx",
      mode: 0o600,
    });

    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "sealed-final-24000",
        environment.dependencies,
        async () => undefined,
      ),
    );
    expect(error).toMatchObject({
      phase: "stale-inspection",
      disposition: "manual-reconciliation-required",
      stale_lease_quarantined: false,
      stale_lease_authenticated: true,
      quarantine_blocks_all_gates: false,
    });
    expect(await fs.promises.readFile(environment.activePath)).toEqual(
      leaseBytes,
    );
    expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
    leaseBytes.fill(0);
  });

  it("blocks every gate while quarantine is nonempty without invoking work", async () => {
    const environment = await fixture();
    await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      environment.dependencies,
      async () => undefined,
    );
    await fs.promises.writeFile(
      path.join(environment.quarantineRoot, "operator-evidence.json"),
      "preserve",
      { flag: "wx", mode: 0o600 },
    );

    for (const gate of [
      "durable-prefix-100",
      "durable-prefix-500",
      "sealed-final-24000",
    ] as const satisfies readonly FloodgateV7ProductionOuterGate[]) {
      let invoked = false;
      const error = await captureFailure(() =>
        runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
          gate,
          environment.dependencies,
          async () => {
            invoked = true;
          },
        ),
      );
      expect(invoked).toBe(false);
      expect(error).toMatchObject({
        phase: "quarantine",
        disposition: "manual-reconciliation-required",
        quarantine_blocks_all_gates: true,
      });
    }
  });

  it("does not unlink lease metadata that changes during the operation", async () => {
    const environment = await fixture();
    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-100",
        environment.dependencies,
        async () => {
          await fs.promises.appendFile(environment.activePath, "tamper");
        },
      ),
    );
    expect(error).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
      authenticated_lease_published: true,
    });
    expect(
      await fs.promises.readFile(environment.activePath, "utf8"),
    ).toContain("tamper");
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
  });

  it("preserves authenticated metadata when the protected operation rejects", async () => {
    const environment = await fixture();
    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-500",
        environment.dependencies,
        async () => {
          throw new Error(PRIVATE_CANARY);
        },
      ),
    );
    expect(error).toMatchObject({
      phase: "operation",
      disposition: "manual-reconciliation-required",
      os_lock_acquired: true,
      authenticated_lease_published: true,
      stale_lease_quarantined: false,
    });
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
    expect(
      (await fs.promises.lstat(environment.activePath)).size,
    ).toBeGreaterThan(0);
    expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
    const retry = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "sealed-final-24000",
        environment.dependencies,
        async () => undefined,
      ),
    );
    expect(retry).toMatchObject({
      phase: "stale-inspection",
      stale_lease_authenticated: true,
    });
    const lockAfterFailure = spawnSync(
      "/usr/bin/lockf",
      ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
      { stdio: "ignore" },
    );
    expect(lockAfterFailure.status).toBe(0);
  });

  it("leaves a persistent pending retirement block if unlink durability fails", async () => {
    const environment = await fixture();
    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-100",
        {
          ...environment.dependencies,
          afterActiveUnlinkBeforeDirectorySyncForTests() {
            throw new Error(PRIVATE_CANARY);
          },
        },
        async () => "operation-complete",
      ),
    );
    expect(error).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
      os_lock_acquired: true,
      authenticated_lease_published: true,
    });
    await expect(
      fs.promises.lstat(environment.activePath),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const retired = await fs.promises.readdir(environment.retiredRoot);
    expect(retired).toHaveLength(1);
    expect(retired[0]).toMatch(/^\.pending-[0-9a-f]{64}\.json$/u);

    let invoked = false;
    const retry = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "sealed-final-24000",
        environment.dependencies,
        async () => {
          invoked = true;
        },
      ),
    );
    expect(invoked).toBe(false);
    expect(retry).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
      quarantine_blocks_all_gates: true,
    });
    expect(await fs.promises.readdir(environment.retiredRoot)).toEqual(retired);
  });

  it("rejects and preserves a tampered closed retirement record", async () => {
    const environment = await fixture();
    await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      environment.dependencies,
      async () => undefined,
    );
    const [entry] = await fs.promises.readdir(environment.retiredRoot);
    const retiredPath = path.join(environment.retiredRoot, entry);
    await fs.promises.appendFile(retiredPath, "tampered");
    const before = await fs.promises.readFile(retiredPath);
    let invoked = false;

    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-500",
        environment.dependencies,
        async () => {
          invoked = true;
        },
      ),
    );
    expect(invoked).toBe(false);
    expect(error).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
    });
    expect(await fs.promises.readFile(retiredPath)).toEqual(before);
  });

  it("rejects an extra retired field even when its HMAC is recomputed correctly", async () => {
    const environment = await fixture();
    await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      environment.dependencies,
      async () => undefined,
    );
    const [entry] = await fs.promises.readdir(environment.retiredRoot);
    const retiredPath = path.join(environment.retiredRoot, entry);
    const original = await fs.promises.readFile(retiredPath);
    const extra = addExtraFieldWithValidMac(original);
    original.fill(0);
    await fs.promises.writeFile(retiredPath, extra, { mode: 0o600 });
    let invoked = false;

    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "sealed-final-24000",
        environment.dependencies,
        async () => {
          invoked = true;
        },
      ),
    );
    expect(invoked).toBe(false);
    expect(error).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
    });
    expect(await fs.promises.readFile(retiredPath)).toEqual(extra);
    extra.fill(0);
  });

  it("rejects a closed retirement record after the current registry binding changes", async () => {
    const environment = await fixture();
    await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      environment.dependencies,
      async () => undefined,
    );
    await fs.promises.writeFile(
      environment.registryPath,
      `${JSON.stringify({ private: "replacement-registry-binding" })}\n`,
      { mode: 0o600 },
    );
    let invoked = false;
    const error = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-500",
        environment.dependencies,
        async () => {
          invoked = true;
        },
      ),
    );
    expect(invoked).toBe(false);
    expect(error).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
    });
  });

  it("preserves stale evidence and restores SIGTERM default despite a persistent preexisting listener", async () => {
    const environment = await fixture();
    const modulePath = path.resolve(
      "ml/floodgate-v7-production-outer-gate-lease.ts",
    );
    const childSource = [
      `const m = require(${JSON.stringify(modulePath)});`,
      `const key = Buffer.from(${JSON.stringify(ROOT_KEY.toString("hex"))}, "hex");`,
      'process.on("SIGTERM", () => {});',
      "setInterval(() => {}, 1000);",
      `m.runWithFloodgateV7ProductionOuterGateLeaseCoreForTests("durable-prefix-100", {effectiveUserId:${EUID},homeDirectory:${JSON.stringify(environment.home)},rootKey:key,hostname:"signal-test.local",pid:process.pid,installProcessLifecycleHandlers:true}, async () => new Promise(() => {}));`,
    ].join("\n");
    const child = spawn(
      process.execPath,
      ["-r", "tsx/cjs", "-e", childSource],
      { cwd: path.resolve("."), stdio: "ignore" },
    );
    try {
      await waitUntil(async () => {
        try {
          return (await fs.promises.lstat(environment.activePath)).size > 0;
        } catch {
          return false;
        }
      });
      const whileAlive = spawnSync(
        "/usr/bin/lockf",
        ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
        { stdio: "ignore" },
      );
      expect(whileAlive.status).toBe(75);
      child.kill("SIGTERM");
      const exit = await new Promise<{
        readonly code: number | null;
        readonly signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.once("exit", (code, signal) => resolve({ code, signal }));
        child.once("error", reject);
      });
      expect(exit).toEqual({ code: null, signal: "SIGTERM" });
      expect(
        (await fs.promises.lstat(environment.activePath)).size,
      ).toBeGreaterThan(0);
      const afterDeath = spawnSync(
        "/usr/bin/lockf",
        ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
        { stdio: "ignore" },
      );
      expect(afterDeath.status).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }
  }, 10_000);

  it("releases a manual inspection lock on SIGTERM without mutating its stale source", async () => {
    const environment = await fixture();
    const staleBytes = await preserveAuthenticatedStaleLease(environment);
    const modulePath = path.resolve(
      "ml/floodgate-v7-production-outer-gate-lease.ts",
    );
    const readyPath = path.join(environment.home, "manual-inspection-ready");
    const childSource = [
      'const fs = require("node:fs");',
      `const m = require(${JSON.stringify(modulePath)});`,
      `const key = Buffer.from(${JSON.stringify(ROOT_KEY.toString("hex"))}, "hex");`,
      'process.on("SIGTERM", () => {});',
      "setInterval(() => {}, 1000);",
      `m.inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests({effectiveUserId:${EUID},homeDirectory:${JSON.stringify(environment.home)},rootKey:key,hostname:"manual-signal-test.local",pid:process.pid,installProcessLifecycleHandlers:true}).then((inspection) => { globalThis.inspection = inspection; fs.writeFileSync(${JSON.stringify(readyPath)}, "ready"); }, () => { process.exitCode = 2; });`,
    ].join("\n");
    const child = spawn(
      process.execPath,
      ["-r", "tsx/cjs", "-e", childSource],
      { cwd: path.resolve("."), stdio: "ignore" },
    );
    try {
      await waitUntil(async () => {
        try {
          return (await fs.promises.readFile(readyPath, "utf8")) === "ready";
        } catch {
          return false;
        }
      });
      const whileAlive = spawnSync(
        "/usr/bin/lockf",
        ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
        { stdio: "ignore" },
      );
      expect(whileAlive.status).toBe(75);
      child.kill("SIGTERM");
      const exit = await new Promise<{
        readonly code: number | null;
        readonly signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.once("exit", (code, signal) => resolve({ code, signal }));
        child.once("error", reject);
      });
      expect(exit).toEqual({ code: null, signal: "SIGTERM" });
      expect(await fs.promises.readFile(environment.activePath)).toEqual(
        staleBytes,
      );
      expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
      const afterDeath = spawnSync(
        "/usr/bin/lockf",
        ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
        { stdio: "ignore" },
      );
      expect(afterDeath.status).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      staleBytes.fill(0);
    }
  }, 10_000);

  it("requires an exact two-phase confirmation before create-only quarantine", async () => {
    const environment = await fixture();
    const staleBytes = await preserveAuthenticatedStaleLease(
      environment,
      "durable-prefix-500",
    );
    const inspection =
      await inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests(
        environment.dependencies,
      );
    expect(inspection.receipt).toMatchObject({
      status: "authenticated-stale-source-held-for-explicit-confirmation",
      verification: {
        os_lifetime_lock_held: true,
        exact_stale_source_descriptor_inspected: true,
        lease_hmac_authenticated: true,
        registry_binding_matched: true,
        quarantine_empty: true,
        source_mutated: false,
      },
      nonclaims: {
        quarantine_performed: false,
        stale_source_removed: false,
      },
    });
    expect(JSON.stringify(inspection)).not.toContain(
      staleBytes.toString("hex"),
    );

    const competing = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "sealed-final-24000",
        environment.dependencies,
        async () => undefined,
      ),
    );
    expect(competing).toMatchObject({
      phase: "os-lock",
      disposition: "another-gate-invocation-active",
    });

    const wrongConfirmation = await captureFailure(() =>
      confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantineCoreForTests(
        inspection.capability,
        "not confirmed",
      ),
    );
    expect(wrongConfirmation).toMatchObject({ phase: "capture" });
    expect(await fs.promises.readFile(environment.activePath)).toEqual(
      staleBytes,
    );
    expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);

    const receipt =
      await confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantineCoreForTests(
        inspection.capability,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_MANUAL_CONFIRMATION,
      );
    expect(receipt).toMatchObject({
      status:
        "explicitly-confirmed-exact-stale-source-quarantined-and-all-gates-blocked",
      verification: {
        explicit_confirmation_matched: true,
        exact_source_freshly_reinspected: true,
        lease_hmac_reauthenticated: true,
        registry_binding_rematched: true,
        create_only_quarantine_published_durably: true,
        stale_source_removal_durable: true,
        quarantine_blocks_all_three_gates: true,
      },
      nonclaims: {
        quarantine_acknowledged_or_deleted: false,
        next_gate_authorized: false,
      },
    });
    await expect(
      fs.promises.lstat(environment.activePath),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const quarantineEntries = await fs.promises.readdir(
      environment.quarantineRoot,
    );
    expect(quarantineEntries).toHaveLength(1);
    expect(
      await fs.promises.readFile(
        path.join(environment.quarantineRoot, quarantineEntries[0]),
      ),
    ).toEqual(staleBytes);

    const blocked = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-100",
        environment.dependencies,
        async () => undefined,
      ),
    );
    expect(blocked).toMatchObject({
      phase: "quarantine",
      quarantine_blocks_all_gates: true,
    });
    const doubleConfirm = await captureFailure(() =>
      confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantineCoreForTests(
        inspection.capability,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_MANUAL_CONFIRMATION,
      ),
    );
    expect(doubleConfirm).toMatchObject({ phase: "capture" });
    staleBytes.fill(0);
  });

  it("rejects inspection-to-confirmation source changes without quarantining", async () => {
    const environment = await fixture();
    await preserveAuthenticatedStaleLease(environment);
    const inspection =
      await inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests(
        environment.dependencies,
      );
    await fs.promises.appendFile(environment.activePath, "changed");

    const error = await captureFailure(() =>
      confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantineCoreForTests(
        inspection.capability,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_MANUAL_CONFIRMATION,
      ),
    );
    expect(error).toMatchObject({
      phase: "stale-inspection",
      disposition: "manual-reconciliation-required",
    });
    expect(
      await fs.promises.readFile(environment.activePath, "utf8"),
    ).toContain("changed");
    expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
  });

  it("can cancel an inspection without changing the authenticated stale source", async () => {
    const environment = await fixture();
    const staleBytes = await preserveAuthenticatedStaleLease(environment);
    const inspection =
      await inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests(
        environment.dependencies,
      );
    await cancelFloodgateV7ProductionOuterGateStaleLeaseInspectionCoreForTests(
      inspection.capability,
    );
    expect(await fs.promises.readFile(environment.activePath)).toEqual(
      staleBytes,
    );
    expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
    const retry = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-500",
        environment.dependencies,
        async () => undefined,
      ),
    );
    expect(retry).toMatchObject({
      phase: "stale-inspection",
      stale_lease_authenticated: true,
    });
    staleBytes.fill(0);
  });

  it("sanitizes cancellation close failure and preserves the stale source", async () => {
    const environment = await fixture();
    const staleBytes = await preserveAuthenticatedStaleLease(environment);
    const inspection =
      await inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests({
        ...environment.dependencies,
        closeLockDescriptorForTests(descriptor) {
          fs.closeSync(descriptor);
          throw new Error(PRIVATE_CANARY);
        },
      });
    const error = await captureFailure(() =>
      cancelFloodgateV7ProductionOuterGateStaleLeaseInspectionCoreForTests(
        inspection.capability,
      ),
    );
    expect(error).toBeInstanceOf(FloodgateV7ProductionOuterGateLeaseError);
    expect(error).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
      os_lock_acquired: true,
    });
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
    expect(await fs.promises.readFile(environment.activePath)).toEqual(
      staleBytes,
    );
    staleBytes.fill(0);
  });

  it("sanitizes confirmation close failure after durable quarantine", async () => {
    const environment = await fixture();
    await preserveAuthenticatedStaleLease(environment);
    const inspection =
      await inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests({
        ...environment.dependencies,
        closeLockDescriptorForTests(descriptor) {
          fs.closeSync(descriptor);
          throw new Error(PRIVATE_CANARY);
        },
      });
    const error = await captureFailure(() =>
      confirmFloodgateV7ProductionOuterGateStaleLeaseQuarantineCoreForTests(
        inspection.capability,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_MANUAL_CONFIRMATION,
      ),
    );
    expect(error).toBeInstanceOf(FloodgateV7ProductionOuterGateLeaseError);
    expect(error).toMatchObject({
      phase: "cleanup",
      disposition: "manual-reconciliation-required",
      stale_lease_quarantined: true,
      quarantine_blocks_all_gates: true,
    });
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
    await expect(
      fs.promises.lstat(environment.activePath),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.promises.readdir(environment.quarantineRoot)).toHaveLength(
      1,
    );
  });

  it("does not issue a manual quarantine capability for empty legacy metadata", async () => {
    const environment = await fixture();
    await runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      environment.dependencies,
      async () => undefined,
    );
    await fs.promises.writeFile(environment.activePath, "", {
      flag: "wx",
      mode: 0o600,
    });
    const error = await captureFailure(() =>
      inspectFloodgateV7ProductionOuterGateStaleLeaseCoreForTests(
        environment.dependencies,
      ),
    );
    expect(error).toMatchObject({
      phase: "stale-inspection",
      disposition: "manual-reconciliation-required",
      stale_lease_quarantined: false,
      stale_lease_authenticated: false,
    });
    expect((await fs.promises.lstat(environment.activePath)).size).toBe(0);
    expect(await fs.promises.readdir(environment.quarantineRoot)).toEqual([]);
  });
});
