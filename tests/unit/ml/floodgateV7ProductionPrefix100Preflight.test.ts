import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS,
} from "../../../ml/floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
} from "../../../ml/floodgate-v7-deployment-key-readiness";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
} from "../../../ml/floodgate-v7-production-connector-registry";
import { FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION } from "../../../ml/floodgate-v7-production-connector-registry-provisioner";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_CONTRACT,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_STATUS,
  claimFloodgateV7ProductionPrefix100PreflightOuterLockCapability,
  claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests,
  runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests,
  runWithFloodgateV7ProductionOuterGateLeaseCoreForTests,
  type FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
} from "../../../ml/floodgate-v7-production-outer-gate-lease";
import {
  FloodgateV7ProductionPrefix100PreflightError,
  inspectFloodgateV7ProductionPrefix100Preflight,
  inspectFloodgateV7ProductionPrefix100PreflightCoreForTests,
  inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests,
  type FloodgateV7ProductionPrefix100PreflightDependenciesForTests,
} from "../../../ml/floodgate-v7-production-prefix-100-preflight";

const EUID = process.geteuid?.() ?? 501;
const RUN_ID = "31".repeat(32);
const RECORD_SHA = "41".repeat(32);
const KEY_INSTANCE = "51".repeat(32);
const ROOT_KEY = Buffer.from("71".repeat(32), "hex");
const PRIVATE_CANARY = "prefix-100-preflight-private-canary";
const PREFLIGHT_SOURCE_PATH = path.resolve(
  "ml/floodgate-v7-production-prefix-100-preflight.ts",
);
const OUTER_SOURCE_PATH = path.resolve(
  "ml/floodgate-v7-production-outer-gate-lease.ts",
);
const temporaryRoots: string[] = [];
const darwinDescribe = describe.runIf(
  process.platform === "darwin" && fs.existsSync("/usr/bin/lockf"),
);

interface Fixture {
  readonly home: string;
  readonly registryRoot: string;
  readonly registryPath: string;
  readonly runsParent: string;
  readonly controlRoot: string;
  readonly stagePath: string;
  readonly dependencies: FloodgateV7ProductionPrefix100PreflightDependenciesForTests;
}

function readiness(status: "ready" | "unsafe" | "not-provisioned" = "ready") {
  return {
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
    status,
    claim_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
    execution_boundary: "test-only-injected-current-euid-home-metadata",
    deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      parent:
        status === "ready"
          ? "present-current-euid-exact-0700-directory"
          : status === "not-provisioned"
            ? "absent"
            : "unsafe",
      key:
        status === "ready"
          ? "present-current-euid-exact-0600-regular-nlink-1-32-bytes"
          : status === "not-provisioned"
            ? "absent"
            : "unsafe",
      authoritative_reopen_required: true,
    },
    nonclaims: {
      key_bytes_read: false,
      key_created_or_written: false,
      key_instance_id: false,
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
  };
}

function expectedCurrentBinding() {
  return {
    contract: FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS,
    claim_boundary:
      FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-approved-record-current-key-binding",
    algorithm: FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM,
    verification: {
      approved_record_reloaded_and_validated: true,
      current_key_freshly_inspected: true,
      approved_to_current_exact_binding_match: true,
      reloaded_approved_to_private_expected_exact_match: true,
      held_descriptors_revalidated: true,
      memory_only: true,
      sensitive_values_exported: false,
    },
    nonclaims: {
      expected_binding_returned: false,
      approved_claim_returned: false,
      approval_created: false,
      record_created_or_written: false,
      key_created_or_written: false,
      run_authority: false,
      stage_authority: false,
      connector_authority: false,
      checkpoint_key_capability: false,
      checkpoint: false,
      runtime: false,
      dataset_read: false,
      teacher_label: false,
      training: false,
      weight: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
    },
  };
}

function privateClaim(home: string) {
  const registryRoot = path.join(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  const publicationParent = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
  const repositoryRoot = path.join(
    home,
    ".codex",
    "worktrees",
    "shogi-floodgate-role-bundle",
  );
  const rawLockRoot = path.join(
    home,
    ".codex",
    "shogi-data",
    "floodgate-q1-2026-raw-lock",
  );
  const roleLockRoot = path.join(
    home,
    ".codex",
    "shogi-data",
    "floodgate-q1-2026-role-lock-v1",
  );
  const roleBundleRoot = path.join(
    home,
    ".codex",
    "shogi-bundles",
    "floodgate-q1-2026-label-free-role-bundle-v2",
  );
  const legacyProtectedPositionIdsPath = path.join(
    repositoryRoot,
    "ml",
    "data",
    "wcsc36",
    "int16-aware-replay-excluded-position-ids.txt",
  );
  const assetRoot = path.join(
    home,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  return {
    runId: RUN_ID,
    approvedKeyBinding: {
      recordBytes: 120,
      recordSha256: RECORD_SHA,
      keyInstanceId: KEY_INSTANCE,
    },
    stageAuthorization: {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      legacyProtectedPositionIdsPath,
      publicationParent,
      stageBasename: `floodgate-v7-${RUN_ID}-stage`,
      destinationBasename: `floodgate-v7-${RUN_ID}-final`,
      engineBin: path.join(assetRoot, "engine", "yaneuraou"),
      engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
      engineArgs: Object.freeze([]),
      evalDir: path.join(assetRoot, "eval"),
    },
    consumer: {
      repositoryRoot,
      verifierRevision: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
      rawLockRoot,
      roleLockRoot,
      legacyProtectedPositionIdsPath,
      outputRoot: roleBundleRoot,
    },
  };
}

function approvedClaim() {
  return {
    execution_boundary:
      "test-only-injected-current-euid-home-control-plane-record",
    record: { bytes: 120, sha256: RECORD_SHA },
    candidate_receipt: {},
    approval: {},
    key_id: "floodgate-v7-deployment-root-v1",
    key_instance_id: KEY_INSTANCE,
    deployment_identity: {},
  };
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
  const runsParent = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
  await fs.promises.mkdir(runsParent, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(registryRoot, 0o700);
  await fs.promises.chmod(runsParent, 0o700);
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
  const claim = privateClaim(home);
  return {
    home,
    registryRoot,
    registryPath,
    runsParent,
    controlRoot: path.join(
      registryRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
    ),
    stagePath: path.join(runsParent, claim.stageAuthorization.stageBasename),
    dependencies: {
      effectiveUserId: EUID,
      homeDirectory: home,
      loadRegistry: async () => ({ capability: true }),
      claimRegistry: () => claim,
      inspectKeyReadiness: async () => readiness(),
      loadApprovedEnrollment: async () => ({ capability: true }),
      claimApprovedEnrollment: () => approvedClaim(),
      verifyExpectedCurrentBinding: async (expected) => {
        if (
          !Object.isFrozen(expected) ||
          Object.getPrototypeOf(expected) !== null ||
          expected.recordBytes !== 120 ||
          expected.recordSha256 !== RECORD_SHA ||
          expected.keyInstanceId !== KEY_INSTANCE
        ) {
          throw new Error("private expected binding differs");
        }
        return expectedCurrentBinding();
      },
    },
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected preflight to fail");
}

function publicProjection(error: unknown): string {
  return [
    String(error),
    error instanceof Error ? error.stack : "",
    JSON.stringify(error),
  ].join("\n");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate v7 production prefix-100 read-only preflight core", () => {
  it("accepts one exact empty fresh namespace without mutating it", async () => {
    const environment = await fixture();
    const before = await fs.promises.readdir(environment.registryRoot);
    const observation =
      await inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(
        environment.dependencies,
      );
    expect(observation).toEqual({
      execution_boundary:
        "test-only-injected-current-euid-home-read-only-observation",
      outer_control: "absent-pristine",
    });
    expect(await fs.promises.readdir(environment.registryRoot)).toEqual(before);
    await expect(
      fs.promises.lstat(environment.controlRoot),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts only an exact present-but-empty outer control namespace", async () => {
    const environment = await fixture();
    await fs.promises.mkdir(
      path.join(
        environment.controlRoot,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
      ),
      { recursive: true, mode: 0o700 },
    );
    await fs.promises.mkdir(
      path.join(
        environment.controlRoot,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
      ),
      { mode: 0o700 },
    );
    await fs.promises.chmod(environment.controlRoot, 0o700);
    expect(
      await inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(
        environment.dependencies,
      ),
    ).toMatchObject({ outer_control: "present-exact-empty" });
  });

  it.each([
    [
      "runs entry",
      async (environment: Fixture) => {
        await fs.promises.writeFile(
          path.join(environment.runsParent, "unknown"),
          "x",
        );
      },
    ],
    [
      "stage",
      async (environment: Fixture) => {
        await fs.promises.mkdir(environment.stagePath, { mode: 0o700 });
      },
    ],
  ])("rejects a non-fresh %s", async (_label, arrange) => {
    const environment = await fixture();
    await arrange(environment);
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(
        environment.dependencies,
      ),
    ).rejects.toMatchObject({
      decision: "NO-GO",
      phase: "initial-snapshot",
      persistent_mutation_performed: false,
      gate_invoked: false,
    });
  });

  it.each([
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
    "unknown-control-entry",
  ])("rejects outer control entry %s", async (entry) => {
    const environment = await fixture();
    await fs.promises.mkdir(environment.controlRoot, { mode: 0o700 });
    await fs.promises.mkdir(
      path.join(
        environment.controlRoot,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
      ),
      { mode: 0o700 },
    );
    await fs.promises.mkdir(
      path.join(
        environment.controlRoot,
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
      ),
      { mode: 0o700 },
    );
    await fs.promises.writeFile(
      path.join(environment.controlRoot, entry),
      "unsafe",
      { mode: 0o600 },
    );
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(
        environment.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "outer-control" });
  });

  it("detects an add-remove race even when the final runs directory is empty", async () => {
    const environment = await fixture();
    const race = path.join(environment.runsParent, "transient");
    const dependencies = {
      ...environment.dependencies,
      beforeFinalSnapshotForTests: async () => {
        await fs.promises.writeFile(race, "x");
        await fs.promises.unlink(race);
      },
    };
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(dependencies),
    ).rejects.toMatchObject({ phase: "final-snapshot" });
  });

  it("rejects key readiness, approved binding, and current binding independently", async () => {
    const notReady = await fixture();
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests({
        ...notReady.dependencies,
        inspectKeyReadiness: async () => readiness("unsafe"),
      }),
    ).rejects.toMatchObject({ phase: "key-readiness" });

    const approvedMismatch = await fixture();
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests({
        ...approvedMismatch.dependencies,
        claimApprovedEnrollment: () => ({
          ...approvedClaim(),
          key_instance_id: "61".repeat(32),
        }),
      }),
    ).rejects.toMatchObject({ phase: "approved-binding" });

    const currentMismatch = await fixture();
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests({
        ...currentMismatch.dependencies,
        verifyExpectedCurrentBinding: async () => ({
          ...expectedCurrentBinding(),
          status: "wrong",
        }),
      }),
    ).rejects.toMatchObject({ phase: "current-binding" });
  });

  it("rejects an arbitrary fixed registry configuration without disclosing it", async () => {
    const environment = await fixture();
    const error = await captureFailure(() =>
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests({
        ...environment.dependencies,
        claimRegistry: () => ({
          ...privateClaim(environment.home),
          runId: "not-a-run-id",
          private: PRIVATE_CANARY,
        }),
      }),
    );
    expect(error).toBeInstanceOf(FloodgateV7ProductionPrefix100PreflightError);
    expect(error).toMatchObject({ phase: "registry-fixed-configuration" });
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
    expect(publicProjection(error)).not.toContain(environment.home);
  });

  it("rejects wrong arity, extra dependency keys, and public production arguments", async () => {
    const environment = await fixture();
    await expect(
      Reflect.apply(
        inspectFloodgateV7ProductionPrefix100PreflightCoreForTests,
        undefined,
        [],
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests({
        ...environment.dependencies,
        extra: true,
      } as never),
    ).rejects.toMatchObject({ phase: "capture" });
    expect(inspectFloodgateV7ProductionPrefix100Preflight.length).toBe(0);
    await expect(
      Reflect.apply(inspectFloodgateV7ProductionPrefix100Preflight, undefined, [
        "unexpected",
      ]),
    ).rejects.toMatchObject({ phase: "capture" });
  });

  it("turns descriptor close uncertainty into cleanup NO-GO", async () => {
    const environment = await fixture();
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests({
        ...environment.dependencies,
        closeDirectoryDescriptorForTests: (descriptor) => {
          fs.closeSync(descriptor);
          throw new Error(PRIVATE_CANARY);
        },
      }),
    ).rejects.toMatchObject({
      phase: "cleanup",
      retry_disposition: "operator-reconciliation-required-no-gate",
    });
  });

  it("rejects dependency and readiness Proxies without module-level trap access", async () => {
    const environment = await fixture();
    let dependencyTraps = 0;
    const dependencyProxy = new Proxy(environment.dependencies, {
      get() {
        dependencyTraps += 1;
        throw new Error(PRIVATE_CANARY);
      },
      ownKeys() {
        dependencyTraps += 1;
        throw new Error(PRIVATE_CANARY);
      },
    });
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(
        dependencyProxy,
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    expect(dependencyTraps).toBe(0);

    let readinessTraps = 0;
    const readinessProxy = new Proxy(readiness(), {
      get() {
        readinessTraps += 1;
        throw new Error(PRIVATE_CANARY);
      },
      ownKeys() {
        readinessTraps += 1;
        throw new Error(PRIVATE_CANARY);
      },
    });
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests({
        ...environment.dependencies,
        inspectKeyReadiness: async () => readinessProxy,
      }),
    ).rejects.toMatchObject({ phase: "key-readiness" });
    // Native Promise resolution performs the unavoidable single `then` get;
    // exact receipt capture performs no additional Proxy operation.
    expect(readinessTraps).toBe(1);
  });

  it.each([
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
  ])("rejects any evidence inside outer %s", async (basename) => {
    const environment = await fixture();
    const quarantine = path.join(
      environment.controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
    );
    const retired = path.join(
      environment.controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
    );
    await fs.promises.mkdir(quarantine, { recursive: true, mode: 0o700 });
    await fs.promises.mkdir(retired, { mode: 0o700 });
    await fs.promises.chmod(environment.controlRoot, 0o700);
    await fs.promises.writeFile(
      path.join(basename === "quarantine" ? quarantine : retired, "evidence"),
      "preserve",
      { mode: 0o600 },
    );
    await expect(
      inspectFloodgateV7ProductionPrefix100PreflightCoreForTests(
        environment.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "outer-control" });
  });

  it("contains no filesystem mutation primitive or generic production callback surface", async () => {
    const [preflightSource, outerSource] = await Promise.all([
      fs.promises.readFile(PREFLIGHT_SOURCE_PATH, "utf8"),
      fs.promises.readFile(OUTER_SOURCE_PATH, "utf8"),
    ]);
    expect(preflightSource).not.toMatch(
      /\b(?:writeFileSync|writeSync|mkdirSync|unlinkSync|renameSync|linkSync|chmodSync|fsyncSync|rmSync)\s*\(/u,
    );
    expect(outerSource).not.toMatch(
      /export function runFloodgateV7ProductionPrefix100PreflightOuterLock\s*\([^)]/u,
    );
    expect(outerSource).toContain(
      'capturedRequire("./floodgate-v7-production-prefix-100-preflight")',
    );
  });
});

darwinDescribe("Floodgate v7 prefix-100 preflight outer lock", () => {
  it("holds and releases the registry lock without creating control state", async () => {
    const environment = await fixture();
    const result =
      await runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        {
          effectiveUserId: EUID,
          homeDirectory: environment.home,
        },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: async (
            capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
          ) => {
            const competing = spawnSync(
              "/usr/bin/lockf",
              ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
              { stdio: "ignore" },
            );
            expect(competing.status).toBe(75);
            return inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests(
              capability,
              environment.dependencies,
            );
          },
        }),
      );
    expect(result.value).toMatchObject({
      contract:
        "shogi-floodgate-v7-production-prefix-100-read-only-preflight-under-lock-outcome-v1",
      status: "GO-observed-under-outer-lock",
      observation: { outer_control: "absent-pristine" },
    });
    expect(result.lock).toEqual({
      contract:
        FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_PREFIX_100_PREFLIGHT_OUTER_LOCK_STATUS,
      execution_boundary:
        "test-only-injected-home-lock-helper-and-descriptor-close",
      verification: {
        common_os_lock_acquired_nonblocking: true,
        common_os_lock_held_around_fixed_preflight: true,
        registry_anchor_held_descriptor_and_bytes_revalidated: true,
        common_os_lock_released_before_receipt: true,
        persistent_namespace_or_file_content_mutation_performed: false,
      },
      nonclaims: {
        registry_path_or_bytes_disclosed: false,
        registry_digest_or_identity_disclosed: false,
        key_material_disclosed: false,
        active_lease_created_or_written: false,
        control_namespace_created_or_written: false,
        connector_capability_issued: false,
        gate_invoked: false,
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
      fs.promises.lstat(environment.controlRoot),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      spawnSync(
        "/usr/bin/lockf",
        ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
        { stdio: "ignore" },
      ).status,
    ).toBe(0);
  });

  it("keeps production and test capability registries separate and single-use", async () => {
    const environment = await fixture();
    let captured:
      FloodgateV7ProductionPrefix100PreflightOuterLockCapability | undefined;
    await runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
      { effectiveUserId: EUID, homeDirectory: environment.home },
      () => ({
        inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: async (
          capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
        ) => {
          captured = capability;
          expect(() =>
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapability(
              capability,
            ),
          ).toThrow();
          const anchor =
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
              capability,
            );
          expect(anchor.effectiveUserId).toBe(EUID);
          expect(anchor.canonicalHome).toBe(environment.home);
          expect(anchor.registry.bytes).toBeGreaterThan(1);
          expect(anchor.registry.sha256).toMatch(/^[0-9a-f]{64}$/u);
          expect(anchor.registry.dev).toMatch(/^[0-9]+$/u);
          expect(anchor.registry.ino).toMatch(/^[0-9]+$/u);
          expect(() =>
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
              capability,
            ),
          ).toThrow();
          return true;
        },
      }),
    );
    expect(captured).toBeDefined();
    expect(() =>
      claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
        { ...captured! },
      ),
    ).toThrow();
  });

  it("releases the OS lock after a sanitized under-lock NO-GO", async () => {
    const environment = await fixture();
    await fs.promises.writeFile(
      path.join(environment.runsParent, "existing-work"),
      "preserve",
    );
    const result =
      await runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: environment.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: (
            capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
          ) =>
            inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests(
              capability,
              environment.dependencies,
            ),
        }),
      );
    expect(result.value).toMatchObject({
      status: "NO-GO-observed-under-outer-lock",
      failure: { phase: "initial-snapshot" },
    });
    expect(
      spawnSync(
        "/usr/bin/lockf",
        ["-s", "-t", "0", environment.registryPath, "/usr/bin/true"],
        { stdio: "ignore" },
      ).status,
    ).toBe(0);
    expect(
      await fs.promises.readFile(
        path.join(environment.runsParent, "existing-work"),
        "utf8",
      ),
    ).toBe("preserve");
  });

  it("serializes concurrent preflight owners with status-75 contention", async () => {
    const environment = await fixture();
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first =
      runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: environment.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: async (
            capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
          ) => {
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
              capability,
            );
            started();
            await hold;
            return true;
          },
        }),
      );
    await startedPromise;
    const error = await captureFailure(() =>
      runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: environment.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock:
            async () => true,
        }),
      ),
    );
    expect(error).toMatchObject({
      phase: "os-lock",
      disposition: "another-gate-invocation-active",
      authenticated_lease_published: false,
    });
    release();
    await expect(first).resolves.toMatchObject({ value: true });
  });

  it("blocks a later mutation owner while the read-only preflight lock is held", async () => {
    const environment = await fixture();
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const preflight =
      runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: environment.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: async (
            capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
          ) => {
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
              capability,
            );
            started();
            await hold;
            return true;
          },
        }),
      );
    await startedPromise;

    let mutationCalls = 0;
    const mutationError = await captureFailure(() =>
      runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
        "durable-prefix-100",
        {
          effectiveUserId: EUID,
          homeDirectory: environment.home,
          rootKey: ROOT_KEY,
          installProcessLifecycleHandlers: false,
        },
        async () => {
          mutationCalls += 1;
          return true;
        },
      ),
    );
    expect(mutationError).toMatchObject({
      phase: "os-lock",
      disposition: "another-gate-invocation-active",
      os_lock_acquired: false,
      authenticated_lease_published: false,
    });
    expect(mutationCalls).toBe(0);
    await expect(
      fs.promises.lstat(environment.controlRoot),
    ).rejects.toMatchObject({ code: "ENOENT" });

    release();
    await expect(preflight).resolves.toMatchObject({ value: true });
    await expect(
      fs.promises.lstat(environment.controlRoot),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks a later read-only preflight owner while a mutation owner holds the common lock", async () => {
    const environment = await fixture();
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let mutationCalls = 0;
    const mutation = runWithFloodgateV7ProductionOuterGateLeaseCoreForTests(
      "durable-prefix-100",
      {
        effectiveUserId: EUID,
        homeDirectory: environment.home,
        rootKey: ROOT_KEY,
        installProcessLifecycleHandlers: false,
      },
      async () => {
        mutationCalls += 1;
        started();
        await hold;
        return true;
      },
    );
    await startedPromise;

    const activePath = path.join(
      environment.controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
    );
    const quarantinePath = path.join(
      environment.controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_QUARANTINE_BASENAME,
    );
    const retiredPath = path.join(
      environment.controlRoot,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_RETIRED_BASENAME,
    );
    const before = {
      active: await fs.promises.readFile(activePath),
      control: (await fs.promises.readdir(environment.controlRoot)).sort(),
      quarantine: await fs.promises.readdir(quarantinePath),
      retired: await fs.promises.readdir(retiredPath),
    };
    let preflightLoaderCalls = 0;
    const preflightError = await captureFailure(() =>
      runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: environment.home },
        () => {
          preflightLoaderCalls += 1;
          return {
            inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock:
              async () => true,
          };
        },
      ),
    );
    expect(preflightError).toMatchObject({
      phase: "os-lock",
      disposition: "another-gate-invocation-active",
      os_lock_acquired: false,
      authenticated_lease_published: false,
    });
    expect(preflightLoaderCalls).toBe(0);
    expect(mutationCalls).toBe(1);
    expect(await fs.promises.readFile(activePath)).toEqual(before.active);
    expect((await fs.promises.readdir(environment.controlRoot)).sort()).toEqual(
      before.control,
    );
    expect(await fs.promises.readdir(quarantinePath)).toEqual(
      before.quarantine,
    );
    expect(await fs.promises.readdir(retiredPath)).toEqual(before.retired);

    release();
    await expect(mutation).resolves.toMatchObject({ value: true });
  });

  it("rejects an unclaimed or throwing fixed module without leaking its failure", async () => {
    const unclaimed = await fixture();
    const unclaimedError = await captureFailure(() =>
      runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: unclaimed.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock:
            async () => true,
        }),
      ),
    );
    expect(unclaimedError).toMatchObject({
      phase: "operation",
      authenticated_lease_published: false,
    });

    const throwing = await fixture();
    const throwingError = await captureFailure(() =>
      runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: throwing.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: async (
            capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
          ) => {
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
              capability,
            );
            throw new Error(PRIVATE_CANARY);
          },
        }),
      ),
    );
    expect(throwingError).toMatchObject({ phase: "operation" });
    expect(publicProjection(throwingError)).not.toContain(PRIVATE_CANARY);
  });

  it("detects registry bytes changed while the lock is held", async () => {
    const environment = await fixture();
    const error = await captureFailure(() =>
      runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: environment.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: async (
            capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
          ) => {
            claimFloodgateV7ProductionPrefix100PreflightOuterLockCapabilityCoreForTests(
              capability,
            );
            await fs.promises.writeFile(
              environment.registryPath,
              `${JSON.stringify({ private: `${PRIVATE_CANARY}-changed` })}\n`,
              { mode: 0o600 },
            );
            return true;
          },
        }),
      ),
    );
    expect(error).toMatchObject({
      phase: "cleanup",
      os_lock_acquired: true,
      authenticated_lease_published: false,
    });
    expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
  });

  it("binds a lock from home A to only home A, never injected home B", async () => {
    const environmentA = await fixture();
    const environmentB = await fixture();
    let registryLoadsB = 0;
    const result =
      await runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
        { effectiveUserId: EUID, homeDirectory: environmentA.home },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock: (
            capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
          ) =>
            inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests(
              capability,
              {
                ...environmentB.dependencies,
                loadRegistry: async () => {
                  registryLoadsB += 1;
                  return { capability: true };
                },
              },
            ),
        }),
      );
    expect(result.value).toMatchObject({
      status: "NO-GO-observed-under-outer-lock",
      failure: { phase: "registry-fixed-configuration" },
    });
    expect(registryLoadsB).toBe(0);
    expect(
      result.lock.verification.common_os_lock_released_before_receipt,
    ).toBe(true);
  });

  it.each(["digest", "inode"] as const)(
    "rejects a registry %s mismatch before any private loader runs",
    async (change) => {
      const environment = await fixture();
      let registryLoads = 0;
      const dependencies = {
        ...environment.dependencies,
        loadRegistry: async () => {
          registryLoads += 1;
          return { capability: true };
        },
      };
      const error = await captureFailure(() =>
        runFloodgateV7ProductionPrefix100PreflightOuterLockCoreForTests(
          { effectiveUserId: EUID, homeDirectory: environment.home },
          () => ({
            inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock:
              async (
                capability: FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
              ) => {
                if (change === "digest") {
                  await fs.promises.writeFile(
                    environment.registryPath,
                    `${JSON.stringify({ private: "different-same-path" })}\n`,
                    { mode: 0o600 },
                  );
                } else {
                  const replacement = `${environment.registryPath}.replacement`;
                  await fs.promises.writeFile(
                    replacement,
                    `${JSON.stringify({ private: PRIVATE_CANARY })}\n`,
                    { flag: "wx", mode: 0o600 },
                  );
                  await fs.promises.rename(
                    replacement,
                    environment.registryPath,
                  );
                }
                return inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests(
                  capability,
                  dependencies,
                );
              },
          }),
        ),
      );
      expect(error).toMatchObject({
        phase: "cleanup",
        os_lock_acquired: true,
        authenticated_lease_published: false,
      });
      expect(registryLoads).toBe(0);
      expect(publicProjection(error)).not.toContain(PRIVATE_CANARY);
    },
  );
});
