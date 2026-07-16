import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
} from "../../../ml/floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests,
  claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests,
  runFloodgateV7ProductionOuterGateOwnerCoreForTests,
  runFloodgateV7ProductionOuterGatePrefix100,
  runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests,
  type FloodgateV7ProductionOuterGateConnectorCapability,
  type FloodgateV7ProductionOuterGateLeaseDependenciesForTests,
  type FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
} from "../../../ml/floodgate-v7-production-outer-gate-lease";

const EUID = process.geteuid?.() ?? 501;
const ROOT_KEY = Buffer.from("73".repeat(32), "hex");
const REGISTRY_CONTENT = `${JSON.stringify({ same_lock: true })}\n`;
const PREFLIGHT_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-read-only-preflight-under-lock-outcome-v1";
const TEST_PREFLIGHT_BOUNDARY =
  "test-only-injected-current-euid-home-read-only-observation";
const roots: string[] = [];

interface Fixture {
  readonly home: string;
  readonly registryRoot: string;
  readonly registryPath: string;
  readonly controlRoot: string;
  readonly activePath: string;
  readonly dependencies: FloodgateV7ProductionOuterGateLeaseDependenciesForTests;
}

function frozenNullRecord(
  fields: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value,
    });
  }
  return Object.freeze(output);
}

function goOutcome(): Readonly<Record<string, unknown>> {
  return frozenNullRecord({
    contract: PREFLIGHT_CONTRACT,
    status: "GO-observed-under-outer-lock",
    observation: frozenNullRecord({
      execution_boundary: TEST_PREFLIGHT_BOUNDARY,
      outer_control: "absent-pristine",
    }),
  });
}

function noGoOutcome(): Readonly<Record<string, unknown>> {
  return frozenNullRecord({
    contract: PREFLIGHT_CONTRACT,
    status: "NO-GO-observed-under-outer-lock",
    failure: frozenNullRecord({
      phase: "initial-snapshot",
      retry_disposition: "operator-reconciliation-required-no-gate",
    }),
  });
}

function runnerReceipt(): Readonly<Record<string, unknown>> {
  return frozenNullRecord({
    contract: "shogi-floodgate-v7-production-connector-runner-v1",
    status:
      "registry-approved-current-bound-production-connector-gate-complete",
    claim_boundary:
      "one-fixed-production-gate-after-private-registry-approved-record-and-current-key-binding-without-public-run-binding-options-or-raw-connector-receipt-v1",
    execution_boundary:
      "production-fixed-gate-private-registry-and-capability-owners",
    gate: "durable-prefix-100",
    checkpoint: frozenNullRecord({
      target_parents: 100,
      sealed: false,
      checkpoint_may_have_persisted: true,
    }),
    verification: frozenNullRecord({
      private_registry_claimed: true,
      approved_record_binding_matched: true,
      fresh_current_key_binding_validated: true,
      connector_completed: true,
      exact_prefix_100_read_only_continuity_postflight_completed: true,
    }),
    nonclaims: frozenNullRecord({
      run_id_disclosed: false,
      approved_key_binding_disclosed: false,
      connector_options_disclosed: false,
      raw_connector_receipt_disclosed: false,
      key_material_disclosed: false,
      row_or_position_content_disclosed: false,
      teacher_label: false,
      optimizer_training: false,
      weight: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
    }),
  });
}

async function fixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-same-lock-"),
  );
  const home = await fs.promises.realpath(created);
  roots.push(home);
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
  await fs.promises.writeFile(registryPath, REGISTRY_CONTENT, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(registryPath, 0o600);
  const controlRoot = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  );
  return {
    home,
    registryRoot,
    registryPath,
    controlRoot,
    activePath: path.join(
      controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
    ),
    dependencies: {
      effectiveUserId: EUID,
      homeDirectory: home,
      rootKey: ROOT_KEY,
      hostname: "same-lock-test.local",
      pid: process.pid,
      now: () => new Date("2026-07-16T12:34:56.789Z"),
      nonce: () => randomBytes(32),
      installProcessLifecycleHandlers: false,
    },
  };
}

function heldByCompetitor(registryPath: string): number | null {
  const before = fs.lstatSync(registryPath, { bigint: true });
  const beforeBytes = fs.readFileSync(registryPath);
  const descriptor = fs.openSync(
    registryPath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  let status: number | null;
  try {
    status = spawnSync("/usr/bin/lockf", ["-s", "-t", "0", "3"], {
      cwd: "/",
      env: { NODE_ENV: "test" },
      stdio: ["ignore", "ignore", "ignore", descriptor],
    }).status;
  } finally {
    fs.closeSync(descriptor);
  }
  const after = fs.lstatSync(registryPath, { bigint: true });
  const afterBytes = fs.readFileSync(registryPath);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    !beforeBytes.equals(afterBytes)
  ) {
    throw new Error("held-descriptor contention probe changed registry");
  }
  return status;
}

function preflightModule(
  environment: Fixture,
  events: string[],
  outcome: () => unknown = goOutcome,
): Readonly<Record<string, unknown>> {
  return {
    async inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock(
      capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
    ) {
      events.push("preflight");
      expect(fs.existsSync(environment.controlRoot)).toBe(false);
      expect(heldByCompetitor(environment.registryPath)).toBe(75);
      const anchor =
        claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
          capability,
        );
      expect(anchor).toMatchObject({
        effectiveUserId: EUID,
        canonicalHome: environment.home,
      });
      return outcome();
    },
  };
}

function runnerModule(
  environment: Fixture,
  events: string[],
  operation: () => unknown = runnerReceipt,
): Readonly<Record<string, unknown>> {
  return {
    async runFloodgateV7ProductionConnectorPrefix100UnderOuterGate(
      capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
    ) {
      events.push("runner");
      expect(heldByCompetitor(environment.registryPath)).toBe(75);
      expect(fs.existsSync(environment.activePath)).toBe(true);
      expect(
        claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
          capability,
        ),
      ).toBe("durable-prefix-100");
      return operation();
    },
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

const darwinDescribe = describe.runIf(
  process.platform === "darwin" && fs.existsSync("/usr/bin/lockf"),
);

darwinDescribe("Floodgate v7 prefix-100 same-lock one-shot outer owner", () => {
  it("orders one preflight and one runner under one uninterrupted registry lock", async () => {
    const environment = await fixture();
    const events: string[] = [];
    let descriptorCloses = 0;
    const result =
      await runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
        {
          ...environment.dependencies,
          closeLockDescriptorForTests(descriptor) {
            descriptorCloses += 1;
            fs.closeSync(descriptor);
          },
        },
        () => {
          events.push("load-preflight");
          expect(heldByCompetitor(environment.registryPath)).toBe(75);
          return preflightModule(environment, events);
        },
        () => {
          events.push("load-runner");
          return runnerModule(environment, events, () => {
            events.push("postflight-continuity");
            expect(heldByCompetitor(environment.registryPath)).toBe(75);
            return runnerReceipt();
          });
        },
      );

    expect(events).toEqual([
      "load-preflight",
      "preflight",
      "load-runner",
      "runner",
      "postflight-continuity",
    ]);
    expect(descriptorCloses).toBe(1);
    expect(result.value).toEqual(runnerReceipt());
    expect(heldByCompetitor(environment.registryPath)).toBe(0);
  });

  it.each([
    ["NO-GO", () => noGoOutcome()],
    ["malformed", () => ({ ...goOutcome() })],
    ["proxy", () => new Proxy(goOutcome(), {})],
    [
      "accessor",
      () => {
        const value = Object.create(null) as Record<string, unknown>;
        Object.defineProperties(value, {
          contract: {
            configurable: false,
            enumerable: true,
            writable: false,
            value: PREFLIGHT_CONTRACT,
          },
          status: {
            configurable: false,
            enumerable: true,
            writable: false,
            value: "GO-observed-under-outer-lock",
          },
          observation: {
            configurable: false,
            enumerable: true,
            get: () => goOutcome(),
          },
        });
        return Object.freeze(value);
      },
    ],
  ] as const)(
    "rejects a %s outcome before runner invocation or control mutation",
    async (_label, outcome) => {
      const environment = await fixture();
      let runnerCalls = 0;
      const error = await captureFailure(() =>
        runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
          environment.dependencies,
          () => preflightModule(environment, [], outcome as () => unknown),
          () => ({
            runFloodgateV7ProductionConnectorPrefix100UnderOuterGate() {
              runnerCalls += 1;
            },
          }),
        ),
      );
      expect(error).toMatchObject({
        phase: "prefix-100-preflight",
        os_lock_acquired: true,
        authenticated_lease_published: false,
        sensitive_values_disclosed: false,
      });
      expect(runnerCalls).toBe(0);
      expect(fs.existsSync(environment.controlRoot)).toBe(false);
      expect(await fs.promises.readFile(environment.registryPath, "utf8")).toBe(
        REGISTRY_CONTENT,
      );
    },
  );

  it("rejects an unclaimed capability and a thrown preflight without mutation", async () => {
    for (const behavior of ["unclaimed", "throw"] as const) {
      const environment = await fixture();
      let runnerCalls = 0;
      const error = await captureFailure(() =>
        runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
          environment.dependencies,
          () => ({
            async inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock() {
              if (behavior === "throw") throw new Error("private preflight");
              return goOutcome();
            },
          }),
          () => ({
            runFloodgateV7ProductionConnectorPrefix100UnderOuterGate() {
              runnerCalls += 1;
            },
          }),
        ),
      );
      expect(error).toMatchObject({
        phase: "prefix-100-preflight",
        authenticated_lease_published: false,
      });
      expect(runnerCalls).toBe(0);
      expect(fs.existsSync(environment.controlRoot)).toBe(false);
    }
  });

  it("detects named registry anchor replacement after GO before mutation", async () => {
    const environment = await fixture();
    let runnerCalls = 0;
    const error = await captureFailure(() =>
      runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
        environment.dependencies,
        () => ({
          async inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock(
            capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
          ) {
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
              capability,
            );
            const replacement = `${environment.registryPath}.replacement`;
            await fs.promises.writeFile(replacement, REGISTRY_CONTENT, {
              flag: "wx",
              mode: 0o600,
            });
            await fs.promises.rename(replacement, environment.registryPath);
            return goOutcome();
          },
        }),
        () => ({
          runFloodgateV7ProductionConnectorPrefix100UnderOuterGate() {
            runnerCalls += 1;
          },
        }),
      ),
    );
    expect(error).toMatchObject({
      phase: "prefix-100-preflight",
      authenticated_lease_published: false,
    });
    expect(runnerCalls).toBe(0);
    expect(fs.existsSync(environment.controlRoot)).toBe(false);
  });

  it("preserves authenticated stale evidence when the post-preflight runner fails", async () => {
    const environment = await fixture();
    const events: string[] = [];
    const error = await captureFailure(() =>
      runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
        environment.dependencies,
        () => preflightModule(environment, events),
        () =>
          runnerModule(environment, events, () => {
            throw new Error("private postflight failure");
          }),
      ),
    );
    expect(events).toEqual(["preflight", "runner"]);
    expect(error).toMatchObject({
      phase: "operation",
      os_lock_acquired: true,
      authenticated_lease_published: true,
      sensitive_values_disclosed: false,
    });
    const stale = await fs.promises.readFile(environment.activePath, "utf8");
    expect(stale).toContain('"gate":"durable-prefix-100"');
    expect(stale).toMatch(/"mac":"[0-9a-f]{64}"/u);
  });

  it("requires the exact prefix-100 continuity proof before one-shot success", async () => {
    const environment = await fixture();
    const current = runnerReceipt();
    const withoutContinuity = frozenNullRecord({
      contract: current.contract,
      status: current.status,
      claim_boundary: current.claim_boundary,
      execution_boundary: current.execution_boundary,
      gate: current.gate,
      checkpoint: current.checkpoint,
      verification: frozenNullRecord({
        private_registry_claimed: true,
        approved_record_binding_matched: true,
        fresh_current_key_binding_validated: true,
        connector_completed: true,
      }),
      nonclaims: current.nonclaims,
    });
    const error = await captureFailure(() =>
      runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
        environment.dependencies,
        () => preflightModule(environment, []),
        () => runnerModule(environment, [], () => withoutContinuity),
      ),
    );
    expect(error).toMatchObject({
      phase: "operation",
      authenticated_lease_published: true,
      sensitive_values_disclosed: false,
    });
    await expect(
      fs.promises.lstat(environment.activePath),
    ).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it("rereads a copied fresh key after GO and rejects mismatch before mutation", async () => {
    const environment = await fixture();
    const mismatchedKey = new Uint8Array(Buffer.from("91".repeat(32), "hex"));
    const originalBytes = Buffer.from(mismatchedKey);
    let runnerCalls = 0;
    let rereads = 0;
    const error = await captureFailure(() =>
      runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
        {
          ...environment.dependencies,
          rereadRootKeyAfterPrefix100PreflightForTests() {
            rereads += 1;
            return mismatchedKey;
          },
        },
        () => preflightModule(environment, []),
        () => ({
          runFloodgateV7ProductionConnectorPrefix100UnderOuterGate() {
            runnerCalls += 1;
          },
        }),
      ),
    );

    expect(error).toMatchObject({
      phase: "prefix-100-preflight",
      os_lock_acquired: true,
      authenticated_lease_published: false,
      sensitive_values_disclosed: false,
    });
    expect(rereads).toBe(1);
    expect(runnerCalls).toBe(0);
    expect(fs.existsSync(environment.controlRoot)).toBe(false);
    expect(Buffer.from(mismatchedKey)).toEqual(originalBytes);
    expect(heldByCompetitor(environment.registryPath)).toBe(0);
  });

  it.each([
    [
      "non-function fresh-key reader",
      (environment: Fixture) => ({
        ...environment.dependencies,
        rereadRootKeyAfterPrefix100PreflightForTests: "not-a-function",
      }),
    ],
    [
      "extra dependency",
      (environment: Fixture) => ({
        ...environment.dependencies,
        unreviewedDependency: true,
      }),
    ],
  ] as const)(
    "rejects a %s during dependency capture",
    async (_label, make) => {
      const environment = await fixture();
      const error = await captureFailure(() =>
        runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
          make(environment) as never,
          () => preflightModule(environment, []),
          () => runnerModule(environment, []),
        ),
      );
      expect(error).toMatchObject({
        phase: "capture",
        os_lock_acquired: false,
        authenticated_lease_published: false,
      });
      expect(fs.existsSync(environment.controlRoot)).toBe(false);
      expect(heldByCompetitor(environment.registryPath)).toBe(0);
    },
  );

  it("leaves prefix-500 and final fixed-owner behavior outside preflight mode", async () => {
    for (const gate of ["durable-prefix-500", "sealed-final-24000"] as const) {
      const environment = await fixture();
      let runnerCalls = 0;
      const result = await runFloodgateV7ProductionOuterGateOwnerCoreForTests(
        gate,
        environment.dependencies,
        () => ({
          [gate === "durable-prefix-500"
            ? "runFloodgateV7ProductionConnectorPrefix500UnderOuterGate"
            : "runFloodgateV7ProductionConnectorFinal24000UnderOuterGate"](
            capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
          ) {
            runnerCalls += 1;
            expect(
              claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
                capability,
              ),
            ).toBe(gate);
            return { gate };
          },
        }),
      );
      expect(runnerCalls).toBe(1);
      expect(result.value).toEqual({ gate });
    }
  });

  it("never accepts a public advisory value as prefix-100 gate authority", async () => {
    const callable = runFloodgateV7ProductionOuterGatePrefix100 as unknown as (
      advisory: unknown,
    ) => Promise<unknown>;
    const error = await captureFailure(() => callable(goOutcome()));
    expect(error).toMatchObject({
      phase: "capture",
      os_lock_acquired: false,
      authenticated_lease_published: false,
      sensitive_values_disclosed: false,
    });
  });

  it("statically keeps the production one-shot fixed and non-optional", async () => {
    const source = await fs.promises.readFile(
      path.resolve("ml/floodgate-v7-production-outer-gate-lease.ts"),
      "utf8",
    );
    const testSource = await fs.promises.readFile(
      path.resolve(
        "tests/unit/ml/floodgateV7ProductionPrefix100SameLockOneShot.test.ts",
      ),
      "utf8",
    );
    expect(source).toMatch(
      /return\s+runFixedPrefix100SameLockOneShotOwner\(\s*dependencies,\s*loadFixedProductionPrefix100PreflightModule,\s*loadFixedProductionRunnerModule,\s*"production",?\s*\);/u,
    );
    expect(source).toContain(
      'return runFixedProductionOuterGateOwner("durable-prefix-500");',
    );
    expect(source).toContain(
      'return runFixedProductionOuterGateOwner("sealed-final-24000");',
    );
    const goValidation = source.indexOf(
      "requireExactPrefix100PreflightGoOutcome(",
    );
    const freshKeyValidation = source.indexOf(
      "const freshlyReadRootKey = rereadRootKeyAfterPrefix100Preflight(",
    );
    const firstNamespaceMutation = source.indexOf(
      "paths = prepareNamespaceAfterLock(",
    );
    expect(goValidation).toBeGreaterThan(-1);
    expect(freshKeyValidation).toBeGreaterThan(goValidation);
    expect(firstNamespaceMutation).toBeGreaterThan(freshKeyValidation);
    expect(source).toContain(
      'if (boundary === "production") {\n    return readProductionRootKey(',
    );
    expect(source).not.toMatch(
      /runFloodgateV7ProductionOuterGatePrefix100\([^)]*(?:receipt|hook|callback|retry)/u,
    );
    const bannedPathFormPrefix = [
      "[",
      '\"-s\", \"-t\", \"0\", registryPath',
    ].join("");
    expect(testSource).not.toContain(bannedPathFormPrefix);
  });
});
