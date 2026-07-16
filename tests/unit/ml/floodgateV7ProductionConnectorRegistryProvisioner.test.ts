import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
  type FloodgateV7ApprovedKeyCurrentBindingReceipt,
} from "../../../ml/floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_STATUS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
  FloodgateV7ProductionConnectorRegistryProvisionerError,
  provisionFloodgateV7ProductionConnectorRegistry,
  provisionFloodgateV7ProductionConnectorRegistryCoreForTests,
  type FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests,
} from "../../../ml/floodgate-v7-production-connector-registry-provisioner";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_STATUS,
  FloodgateV7ProductionConnectorRegistryInstallerError,
  installFloodgateV7ProductionConnectorRegistryCoreForTests,
  type FloodgateV7ProductionConnectorRegistryInstallerReceipt,
} from "../../../ml/floodgate-v7-production-connector-registry-installer";
import {
  claimFloodgateV7ProductionConnectorRegistryCoreForTests,
  loadFloodgateV7ProductionConnectorRegistryCoreForTests,
  type FloodgateV7ProductionConnectorRegistryCapability,
  type FloodgateV7ProductionConnectorRegistryInstallationInput,
  type FloodgateV7ProductionConnectorRegistryPrivateClaim,
} from "../../../ml/floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
} from "../../../ml/floodgate-v7-production-connector-verifier-readiness";
import type {
  FloodgateV7ApprovedKeyEnrollmentCapability,
  FloodgateV7ApprovedKeyEnrollmentClaim,
} from "../../../ml/floodgate-v7-approved-key-enrollment";

const RECORD_BYTES = 12_345;
const EUID = process.geteuid?.() ?? 501;
const RECORD_SHA256 = "cd".repeat(32);
const KEY_INSTANCE_ID = "ef".repeat(32);
const RUN_ID = "ab".repeat(32);
const APPLICATION_REVISION = "12".repeat(20);
const APPLICATION_SOURCE_LAYOUT =
  "fixed-current-euid-userinfo-home-production-application-v1" as const;
const VALUE_CANARY = "private-provisioner-canary-must-never-leak";
const temporaryRoots: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryRoots.map((root) =>
      fs.promises.rm(root, { force: true, recursive: true }),
    ),
  );
});

function approvedCapability(): FloodgateV7ApprovedKeyEnrollmentCapability {
  return Object.freeze({
    contract: "shogi-floodgate-v7-approved-key-enrollment-capability-v1",
    status: "opaque-single-use-approved-key-enrollment-not-claimed",
    claim_boundary: "test-opaque-claim-boundary",
    execution_boundary:
      "test-only-injected-current-euid-home-control-plane-record",
  }) as unknown as FloodgateV7ApprovedKeyEnrollmentCapability;
}

function approvedClaim(): FloodgateV7ApprovedKeyEnrollmentClaim {
  return Object.freeze({
    execution_boundary:
      "test-only-injected-current-euid-home-control-plane-record",
    record: Object.freeze({ bytes: RECORD_BYTES, sha256: RECORD_SHA256 }),
    candidate_receipt: Object.freeze({
      bytes: RECORD_BYTES,
      sha256: RECORD_SHA256,
    }),
    approval: Object.freeze({
      method: "separate-human-review-and-fixed-private-record-persistence-v1",
      approval_id: "test-approval",
      approved_at_utc: "2026-07-15T00:00:00.000Z",
    }),
    key_id: "floodgate-v7-teacher-checkpoint-root-v1",
    key_instance_id: KEY_INSTANCE_ID,
    deployment_identity: Object.freeze({
      layout: "fixed-current-euid-userinfo-home-v1",
      owner_uid: EUID,
      parent_dev: "1",
      parent_ino: "2",
      key_dev: "1",
      key_ino: "3",
    }),
  }) as unknown as FloodgateV7ApprovedKeyEnrollmentClaim;
}

function registryCapability(): FloodgateV7ProductionConnectorRegistryCapability {
  return Object.freeze({
    contract: "shogi-floodgate-v7-production-connector-registry-capability-v1",
    status: "opaque-single-use-private-registry-not-claimed",
    execution_boundary:
      "test-only-injected-current-euid-home-production-connector-registry",
  });
}

function expectedRegistryClaim(
  home: string,
  overrides: Partial<FloodgateV7ProductionConnectorRegistryPrivateClaim> = {},
): FloodgateV7ProductionConnectorRegistryPrivateClaim {
  const repositoryRoot = path.join(
    home,
    ".codex",
    "worktrees",
    "shogi-floodgate-role-bundle",
  );
  const registryRoot = path.join(
    home,
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-floodgate-v7-production-connector-v1",
  );
  const assetRoot = path.join(
    home,
    "Library",
    "Application Support",
    "nextjs-portfolio",
    "shogi-production-teacher-assets-v1",
  );
  return Object.freeze({
    runId: overrides.runId ?? RUN_ID,
    approvedKeyBinding:
      overrides.approvedKeyBinding ??
      Object.freeze({
        recordBytes: RECORD_BYTES,
        recordSha256: RECORD_SHA256,
        keyInstanceId: KEY_INSTANCE_ID,
      }),
    applicationSourceBinding:
      overrides.applicationSourceBinding ??
      Object.freeze({
        layout: APPLICATION_SOURCE_LAYOUT,
        revision: APPLICATION_REVISION,
      }),
    stageAuthorization:
      overrides.stageAuthorization ??
      Object.freeze({
        repositoryRoot,
        rawLockRoot: path.join(
          home,
          ".codex",
          "shogi-data",
          "floodgate-q1-2026-raw-lock",
        ),
        roleLockRoot: path.join(
          home,
          ".codex",
          "shogi-data",
          "floodgate-q1-2026-role-lock-v1",
        ),
        roleBundleRoot: path.join(
          home,
          ".codex",
          "shogi-bundles",
          "floodgate-q1-2026-label-free-role-bundle-v2",
        ),
        legacyProtectedPositionIdsPath: path.join(
          repositoryRoot,
          "ml",
          "data",
          "wcsc36",
          "int16-aware-replay-excluded-position-ids.txt",
        ),
        publicationParent: path.join(registryRoot, "runs"),
        stageBasename: `floodgate-v7-${RUN_ID}-stage`,
        destinationBasename: `floodgate-v7-${RUN_ID}-final`,
        engineBin: path.join(assetRoot, "engine", "yaneuraou"),
        engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
        engineArgs: Object.freeze([] as string[]),
        evalDir: path.join(assetRoot, "eval"),
      }),
    consumer:
      overrides.consumer ??
      Object.freeze({
        repositoryRoot,
        verifierRevision: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
        rawLockRoot: path.join(
          home,
          ".codex",
          "shogi-data",
          "floodgate-q1-2026-raw-lock",
        ),
        roleLockRoot: path.join(
          home,
          ".codex",
          "shogi-data",
          "floodgate-q1-2026-role-lock-v1",
        ),
        legacyProtectedPositionIdsPath: path.join(
          repositoryRoot,
          "ml",
          "data",
          "wcsc36",
          "int16-aware-replay-excluded-position-ids.txt",
        ),
        outputRoot: path.join(
          home,
          ".codex",
          "shogi-bundles",
          "floodgate-q1-2026-label-free-role-bundle-v2",
        ),
      }),
  });
}

function installerReceipt(): FloodgateV7ProductionConnectorRegistryInstallerReceipt {
  return Object.freeze({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_STATUS,
  }) as FloodgateV7ProductionConnectorRegistryInstallerReceipt;
}

function currentBindingReceipt(): FloodgateV7ApprovedKeyCurrentBindingReceipt<"test-only-injected-current-euid-home-approved-record-current-key-binding"> {
  return Object.freeze({
    contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-approved-record-current-key-binding",
    algorithm: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
    verification: Object.freeze({
      approved_record_validated: true,
      current_key_freshly_inspected: true,
      exact_binding_match: true,
      held_descriptors_revalidated: true,
      memory_only: true,
      sensitive_values_exported: false,
    }),
    nonclaims: Object.freeze({
      single_use_capability_returned: false,
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
    }),
  });
}

function verifierReadinessReceipt() {
  return Object.freeze({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
    claim_boundary:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-role-bundle-receipt-git-closure",
    verification: Object.freeze({
      fixed_current_euid_home_repository_root: true,
      fixed_verifier_revision: true,
      pinned_receipt_git_closure_checked: true,
      closure_receipt_validated: true,
      sensitive_values_exported: false,
    }),
    nonclaims: Object.freeze({
      external_role_bundle_files_read: false,
      full_role_bundle_verifier_run: false,
      gate_authority: false,
      registry_authority: false,
      connector_authority: false,
      teacher_label: false,
      training: false,
      weight: false,
      live_evaluation_activation: false,
      playing_strength: false,
      path_disclosed: false,
      revision_disclosed: false,
      digest_disclosed: false,
      private_identity_disclosed: false,
    }),
  });
}

interface HarnessOverrides {
  readonly verifyVerifierReadiness?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["verifyVerifierReadiness"];
  readonly assertVerifierReadinessIdentityBinding?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["assertVerifierReadinessIdentityBinding"];
  readonly captureApplicationSource?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["captureApplicationSource"];
  readonly verifyCurrentBinding?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["verifyCurrentBinding"];
  readonly loadApprovedEnrollment?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["loadApprovedEnrollment"];
  readonly claimApprovedEnrollment?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["claimApprovedEnrollment"];
  readonly installRegistry?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["installRegistry"];
  readonly loadRegistry?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["loadRegistry"];
  readonly claimRegistry?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["claimRegistry"];
  readonly randomBytes?: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests["randomBytes"];
}

function harness(home: string, overrides: HarnessOverrides = {}) {
  const calls: string[] = [];
  const entropy = Buffer.alloc(32, 0xab);
  let installedInput:
    | Readonly<FloodgateV7ProductionConnectorRegistryInstallationInput>
    | undefined;
  const capability = approvedCapability();
  const privateCapability = registryCapability();
  const defaults = {
    verifyVerifierReadiness: async () => {
      calls.push("verifier-readiness");
      return verifierReadinessReceipt();
    },
    assertVerifierReadinessIdentityBinding: (
      receipt: unknown,
      effectiveUserId: number,
      expectedHome: string,
    ) => {
      calls.push("verifier-readiness-binding");
      expect(receipt).toEqual(verifierReadinessReceipt());
      expect(effectiveUserId).toBe(EUID);
      expect(expectedHome).toBe(home);
    },
    captureApplicationSource: async () => {
      calls.push("application-source");
      return Object.freeze({
        layout: APPLICATION_SOURCE_LAYOUT,
        revision: APPLICATION_REVISION,
      });
    },
    verifyCurrentBinding: async () => {
      calls.push("approved-current-binding");
      return currentBindingReceipt();
    },
    loadApprovedEnrollment: async () => {
      calls.push("approved-enrollment-load");
      return capability;
    },
    claimApprovedEnrollment: (
      received: FloodgateV7ApprovedKeyEnrollmentCapability,
    ) => {
      calls.push("approved-enrollment-claim");
      expect(received).toBe(capability);
      return approvedClaim();
    },
    randomBytes: (size: number) => {
      calls.push(`entropy-${size}`);
      return entropy;
    },
    installRegistry: async (
      input: FloodgateV7ProductionConnectorRegistryInstallationInput,
    ) => {
      calls.push("install");
      installedInput = input;
      expect([...entropy]).toEqual(new Array(32).fill(0));
      return installerReceipt();
    },
    loadRegistry: async () => {
      calls.push("registry-load");
      return privateCapability;
    },
    claimRegistry: (
      received: FloodgateV7ProductionConnectorRegistryCapability,
    ) => {
      calls.push("registry-claim");
      expect(received).toBe(privateCapability);
      return expectedRegistryClaim(home);
    },
  } satisfies HarnessOverrides;
  const dependencies: FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests =
    {
      effectiveUserId: EUID,
      homeDirectory: home,
      verifyVerifierReadiness:
        overrides.verifyVerifierReadiness ?? defaults.verifyVerifierReadiness,
      assertVerifierReadinessIdentityBinding:
        overrides.assertVerifierReadinessIdentityBinding ??
        defaults.assertVerifierReadinessIdentityBinding,
      captureApplicationSource:
        overrides.captureApplicationSource ?? defaults.captureApplicationSource,
      verifyCurrentBinding:
        overrides.verifyCurrentBinding ?? defaults.verifyCurrentBinding,
      loadApprovedEnrollment:
        overrides.loadApprovedEnrollment ?? defaults.loadApprovedEnrollment,
      claimApprovedEnrollment:
        overrides.claimApprovedEnrollment ?? defaults.claimApprovedEnrollment,
      installRegistry: overrides.installRegistry ?? defaults.installRegistry,
      loadRegistry: overrides.loadRegistry ?? defaults.loadRegistry,
      claimRegistry: overrides.claimRegistry ?? defaults.claimRegistry,
      randomBytes: overrides.randomBytes ?? defaults.randomBytes,
    };
  return {
    calls,
    dependencies,
    entropy,
    installedInput: () => installedInput,
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected provisioner failure");
}

function expectSanitizedFailure(
  error: unknown,
  expected: Partial<FloodgateV7ProductionConnectorRegistryProvisionerError>,
): void {
  expect(error).toBeInstanceOf(
    FloodgateV7ProductionConnectorRegistryProvisionerError,
  );
  expect(error).toMatchObject(expected);
  expect(String(error)).not.toContain(VALUE_CANARY);
  expect((error as Error).stack).not.toContain(VALUE_CANARY);
  expect(JSON.stringify(error)).not.toContain(VALUE_CANARY);
}

describe("Floodgate v7 production connector registry provisioner", () => {
  it("composes the actual provisioner, installer, loader, and claim in one test home", async () => {
    const createdHome = await fs.promises.mkdtemp(
      path.join(
        await fs.promises.realpath(os.tmpdir()),
        "floodgate-v7-provision-e2e-",
      ),
    );
    const home = await fs.promises.realpath(createdHome);
    temporaryRoots.push(home);
    await fs.promises.chmod(home, 0o700);
    const state = harness(home, {
      installRegistry: (input) =>
        installFloodgateV7ProductionConnectorRegistryCoreForTests(input, {
          effectiveUserId: EUID,
          homeDirectory: home,
        }),
      loadRegistry: () =>
        loadFloodgateV7ProductionConnectorRegistryCoreForTests({
          effectiveUserId: EUID,
          homeDirectory: home,
        }),
      claimRegistry: (capability) =>
        claimFloodgateV7ProductionConnectorRegistryCoreForTests(capability),
    });

    const receipt =
      await provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
        state.dependencies,
      );

    expect(receipt.status).toBe(
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_STATUS,
    );
    expect(receipt.verification).toMatchObject({
      verifier_source_artifact_closure_checked_before_install: true,
      production_application_source_closure_checked_before_current_key_and_install: true,
      application_source_binding_bound_and_postflight_checked: true,
      create_only_install_succeeded: true,
      registry_loader_postflight_succeeded: true,
      exact_private_claim_postflight_succeeded: true,
      sensitive_values_exported: false,
    });
  });

  it("runs the exact sequence, zeroizes 32-byte entropy, and pins all fixed configuration", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-success");
    const state = harness(home);

    const receipt =
      await provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
        state.dependencies,
      );

    expect(state.calls).toEqual([
      "verifier-readiness",
      "verifier-readiness-binding",
      "application-source",
      "approved-current-binding",
      "approved-enrollment-load",
      "approved-enrollment-claim",
      "entropy-32",
      "install",
      "registry-load",
      "registry-claim",
    ]);
    expect([...state.entropy]).toEqual(new Array(32).fill(0));
    expect(state.installedInput()).toEqual({
      run_id: RUN_ID,
      approved_key_binding: {
        record_bytes: RECORD_BYTES,
        record_sha256: RECORD_SHA256,
        key_instance_id: KEY_INSTANCE_ID,
      },
      verifier_revision: "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
      application_source_binding: {
        layout: APPLICATION_SOURCE_LAYOUT,
        revision: APPLICATION_REVISION,
      },
      repository_root: path.join(
        home,
        ".codex",
        "worktrees",
        "shogi-floodgate-role-bundle",
      ),
      raw_lock_root: path.join(
        home,
        ".codex",
        "shogi-data",
        "floodgate-q1-2026-raw-lock",
      ),
      role_lock_root: path.join(
        home,
        ".codex",
        "shogi-data",
        "floodgate-q1-2026-role-lock-v1",
      ),
      role_bundle_root: path.join(
        home,
        ".codex",
        "shogi-bundles",
        "floodgate-q1-2026-label-free-role-bundle-v2",
      ),
      legacy_protected_position_ids_path: path.join(
        home,
        ".codex",
        "worktrees",
        "shogi-floodgate-role-bundle",
        "ml",
        "data",
        "wcsc36",
        "int16-aware-replay-excluded-position-ids.txt",
      ),
      engine_args: [],
    });
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISIONER_STATUS,
      execution_boundary: "test-only-injected-private-registry-provisioning",
      verification: {
        verifier_source_artifact_closure_checked_before_install: true,
        production_application_source_closure_checked_before_current_key_and_install: true,
        approved_record_current_key_binding_checked: true,
        approved_record_bound_into_registry: true,
        application_source_binding_bound_and_postflight_checked: true,
        run_id_generated_from_32_byte_csprng: true,
        fixed_configuration_only: true,
        create_only_install_succeeded: true,
        registry_loader_postflight_succeeded: true,
        exact_private_claim_postflight_succeeded: true,
        sensitive_values_exported: false,
      },
      nonclaims: {
        run_id_disclosed: false,
        approved_record_digest_disclosed: false,
        application_source_revision_disclosed: false,
        application_source_path_disclosed: false,
        application_source_digest_disclosed: false,
        key_instance_id_disclosed: false,
        path_disclosed: false,
        gate_executed: false,
        training: false,
        live_evaluation_activation: false,
        playing_strength: false,
      },
    });
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(RUN_ID);
    expect(serialized).not.toContain(RECORD_SHA256);
    expect(serialized).not.toContain(KEY_INSTANCE_ID);
    expect(serialized).not.toContain(APPLICATION_REVISION);
    expect(serialized).not.toContain(home);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("fails verifier readiness before current binding, enrollment, entropy, and install", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-readiness");
    const valid = verifierReadinessReceipt();
    const malformedReceipts: readonly unknown[] = [
      Object.freeze({}),
      { ...valid, execution_boundary: "production-wrong-home" },
      { ...valid, unexpected: VALUE_CANARY },
      {
        ...valid,
        nonclaims: {
          ...valid.nonclaims,
          external_role_bundle_files_read: true,
        },
      },
      new Proxy(valid, {}),
    ];
    for (const verifyVerifierReadiness of [
      async () => {
        throw new Error(VALUE_CANARY);
      },
      ...malformedReceipts.map((receipt) => async () => receipt),
    ]) {
      const state = harness(home, { verifyVerifierReadiness });
      const failure = await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          state.dependencies,
        ),
      );
      expectSanitizedFailure(failure, {
        phase: "verifier-readiness",
        durability: "no-registry-change-established",
        registry_may_have_been_created: false,
        retry_disposition: "fresh-invocation-required",
      });
      expect(state.calls).toEqual([]);
      expect(state.installedInput()).toBeUndefined();
      expect([...state.entropy]).toEqual(new Array(32).fill(0xab));
    }
  });

  it("rejects a readiness receipt bound to another captured identity before all later work", async () => {
    const home = path.join(
      os.tmpdir(),
      "floodgate-v7-provisioner-readiness-identity",
    );
    let bindingCalls = 0;
    const state = harness(home, {
      assertVerifierReadinessIdentityBinding: () => {
        bindingCalls += 1;
        throw new Error(VALUE_CANARY);
      },
    });
    const failure = await captureFailure(() =>
      provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
        state.dependencies,
      ),
    );
    expectSanitizedFailure(failure, {
      phase: "verifier-readiness",
      durability: "no-registry-change-established",
      registry_may_have_been_created: false,
      retry_disposition: "fresh-invocation-required",
    });
    expect(bindingCalls).toBe(1);
    expect(state.calls).toEqual(["verifier-readiness"]);
    expect(state.installedInput()).toBeUndefined();
    expect([...state.entropy]).toEqual(new Array(32).fill(0xab));
  });

  it("fails application-source closure before current-key, entropy, or any registry write", async () => {
    const home = path.join(
      os.tmpdir(),
      "floodgate-v7-provisioner-application-source",
    );
    let getterCalls = 0;
    const accessorBinding = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(accessorBinding, {
      layout: {
        enumerable: true,
        get() {
          getterCalls += 1;
          return APPLICATION_SOURCE_LAYOUT;
        },
      },
      revision: { enumerable: true, value: APPLICATION_REVISION },
    });
    const invalidCaptures: readonly HarnessOverrides["captureApplicationSource"][] =
      [
        async () => {
          throw new Error(VALUE_CANARY);
        },
        async () =>
          ({
            layout: "wrong-layout",
            revision: APPLICATION_REVISION,
          }) as never,
        async () =>
          ({
            layout: APPLICATION_SOURCE_LAYOUT,
            revision: "AB".repeat(20),
          }) as never,
        async () =>
          ({
            layout: APPLICATION_SOURCE_LAYOUT,
            revision: APPLICATION_REVISION,
            extra: VALUE_CANARY,
          }) as never,
        async () => new Proxy(accessorBinding, {}) as never,
        async () => accessorBinding as never,
      ];

    for (const captureApplicationSource of invalidCaptures) {
      if (captureApplicationSource === undefined) continue;
      const state = harness(home, { captureApplicationSource });
      const failure = await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          state.dependencies,
        ),
      );
      expectSanitizedFailure(failure, {
        phase: "application-source",
        durability: "no-registry-change-established",
        registry_may_have_been_created: false,
        retry_disposition: "fresh-invocation-required",
      });
      expect(state.calls).toEqual([
        "verifier-readiness",
        "verifier-readiness-binding",
      ]);
      expect(state.installedInput()).toBeUndefined();
      expect([...state.entropy]).toEqual(new Array(32).fill(0xab));
    }
    expect(getterCalls).toBe(0);
  });

  it("fails closed at current binding and enrollment load or claim before entropy", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-early");
    const scenarios: readonly [HarnessOverrides, string, readonly string[]][] =
      [
        [
          {
            verifyCurrentBinding: async () => {
              throw new Error(VALUE_CANARY);
            },
          },
          "approved-current-binding",
          [
            "verifier-readiness",
            "verifier-readiness-binding",
            "application-source",
          ],
        ],
        [
          {
            verifyCurrentBinding: async () => Object.freeze({}) as never,
          },
          "approved-current-binding",
          [
            "verifier-readiness",
            "verifier-readiness-binding",
            "application-source",
          ],
        ],
        [
          {
            loadApprovedEnrollment: async () => {
              throw new Error(VALUE_CANARY);
            },
          },
          "approved-enrollment",
          [
            "verifier-readiness",
            "verifier-readiness-binding",
            "application-source",
            "approved-current-binding",
          ],
        ],
        [
          {
            claimApprovedEnrollment: () => {
              throw new Error(VALUE_CANARY);
            },
          },
          "approved-enrollment",
          [
            "verifier-readiness",
            "verifier-readiness-binding",
            "application-source",
            "approved-current-binding",
            "approved-enrollment-load",
          ],
        ],
      ];
    for (const [overrides, phase, expectedPrefix] of scenarios) {
      const state = harness(home, overrides);
      const failure = await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          state.dependencies,
        ),
      );
      expectSanitizedFailure(failure, {
        phase: phase as "approved-current-binding" | "approved-enrollment",
        durability: "no-registry-change-established",
        registry_may_have_been_created: false,
        retry_disposition: "fresh-invocation-required",
      });
      expect(state.calls).toEqual(expectedPrefix);
      expect(state.installedInput()).toBeUndefined();
    }
  });

  it("rejects accessor and Proxy current-binding receipts without invoking them", async () => {
    const home = path.join(
      os.tmpdir(),
      "floodgate-v7-provisioner-binding-shape",
    );
    let getterCalls = 0;
    const accessorReceipt = { ...currentBindingReceipt() } as Record<
      string,
      unknown
    >;
    Object.defineProperty(accessorReceipt, "verification", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error(VALUE_CANARY);
      },
    });
    const proxyReceipt = new Proxy(currentBindingReceipt(), {
      getPrototypeOf() {
        throw new Error(VALUE_CANARY);
      },
    });
    for (const receipt of [accessorReceipt, proxyReceipt]) {
      const state = harness(home, {
        verifyCurrentBinding: async () => receipt as never,
      });
      expectSanitizedFailure(
        await captureFailure(() =>
          provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
            state.dependencies,
          ),
        ),
        {
          phase: "approved-current-binding",
          registry_may_have_been_created: false,
        },
      );
      expect(state.installedInput()).toBeUndefined();
    }
    expect(getterCalls).toBe(0);
  });

  it("maps entropy failures and zeroizes every returned Buffer", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-entropy");
    for (const invalidEntropy of [
      Buffer.alloc(31, 0x7a),
      Buffer.alloc(33, 0x7a),
    ]) {
      const state = harness(home, {
        randomBytes: () => invalidEntropy,
      });
      const failure = await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          state.dependencies,
        ),
      );
      expectSanitizedFailure(failure, {
        phase: "entropy",
        durability: "no-registry-change-established",
        registry_may_have_been_created: false,
      });
      expect([...invalidEntropy]).toEqual(
        new Array(invalidEntropy.byteLength).fill(0),
      );
      expect(state.installedInput()).toBeUndefined();
    }

    const throwing = harness(home, {
      randomBytes: () => {
        throw new Error(VALUE_CANARY);
      },
    });
    expectSanitizedFailure(
      await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          throwing.dependencies,
        ),
      ),
      { phase: "entropy", registry_may_have_been_created: false },
    );
  });

  it("maps private configuration access failure after zeroizing entropy", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-config");
    let getterCalls = 0;
    const poisonedClaim = Object.create(
      null,
    ) as FloodgateV7ApprovedKeyEnrollmentClaim;
    Object.defineProperty(poisonedClaim, "record", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error(VALUE_CANARY);
      },
    });
    const state = harness(home, {
      claimApprovedEnrollment: () => poisonedClaim,
    });

    const failure = await captureFailure(() =>
      provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
        state.dependencies,
      ),
    );

    expectSanitizedFailure(failure, {
      phase: "configuration",
      durability: "no-registry-change-established",
      registry_may_have_been_created: false,
    });
    expect(getterCalls).toBe(0);
    expect([...state.entropy]).toEqual(new Array(32).fill(0));
    expect(state.installedInput()).toBeUndefined();
  });

  it("preserves typed installer reconciliation and treats unknown or invalid receipts conservatively", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-install");
    const typedAbsent =
      new FloodgateV7ProductionConnectorRegistryInstallerError(
        "cleanup",
        "parent-chain-durable-registry-absent",
        false,
        "safe-to-retry-after-not-installed",
      );
    const typedCreated =
      new FloodgateV7ProductionConnectorRegistryInstallerError(
        "revalidation",
        "registry-published-and-staging-removal-durable",
        true,
        "manual-reconciliation-required",
      );
    const proxiedFailure = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error(VALUE_CANARY);
        },
      },
    );
    const inconsistentTyped =
      new FloodgateV7ProductionConnectorRegistryInstallerError(
        "revalidation",
        "registry-published-and-staging-removal-durable",
        true,
        "safe-to-retry-after-not-installed",
      );
    const forgedTyped =
      new FloodgateV7ProductionConnectorRegistryInstallerError(
        VALUE_CANARY as never,
        VALUE_CANARY as never,
        false,
        VALUE_CANARY as never,
      );
    const scenarios: readonly [
      () => Promise<FloodgateV7ProductionConnectorRegistryInstallerReceipt>,
      Partial<FloodgateV7ProductionConnectorRegistryProvisionerError>,
    ][] = [
      [
        async () => {
          throw typedAbsent;
        },
        {
          phase: "installation",
          durability: "no-registry-change-established",
          registry_may_have_been_created: false,
          retry_disposition: "safe-to-retry-after-not-installed",
        },
      ],
      [
        async () => {
          throw typedCreated;
        },
        {
          phase: "installation",
          durability: "registry-may-have-been-created",
          registry_may_have_been_created: true,
          retry_disposition: "manual-reconciliation-required",
        },
      ],
      [
        async () => {
          throw new Error(VALUE_CANARY);
        },
        {
          phase: "installation",
          durability: "registry-may-have-been-created",
          registry_may_have_been_created: true,
          retry_disposition: "registry-reconciliation-required",
        },
      ],
      [
        async () => {
          throw proxiedFailure;
        },
        {
          phase: "installation",
          durability: "registry-may-have-been-created",
          registry_may_have_been_created: true,
          retry_disposition: "registry-reconciliation-required",
        },
      ],
      [
        async () => {
          throw inconsistentTyped;
        },
        {
          phase: "installation",
          durability: "registry-may-have-been-created",
          registry_may_have_been_created: true,
          retry_disposition: "registry-reconciliation-required",
        },
      ],
      [
        async () => {
          throw forgedTyped;
        },
        {
          phase: "installation",
          durability: "registry-may-have-been-created",
          registry_may_have_been_created: true,
          retry_disposition: "registry-reconciliation-required",
        },
      ],
      [
        async () =>
          ({
            contract: `${FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_CONTRACT}-wrong`,
            status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_INSTALLER_STATUS,
          }) as unknown as FloodgateV7ProductionConnectorRegistryInstallerReceipt,
        {
          phase: "installation",
          durability: "registry-may-have-been-created",
          registry_may_have_been_created: true,
          retry_disposition: "registry-reconciliation-required",
        },
      ],
    ];

    for (const [installRegistry, expected] of scenarios) {
      const state = harness(home, { installRegistry });
      const failure = await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          state.dependencies,
        ),
      );
      expectSanitizedFailure(failure, expected);
      expect(state.calls).not.toContain("registry-load");
    }
  });

  it("fails postflight on load, claim, explicit mismatch, accessors, and proxies", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-postflight");
    let accessorCalls = 0;
    const accessorClaim = Object.create(null);
    Object.defineProperties(accessorClaim, {
      runId: {
        enumerable: true,
        get() {
          accessorCalls += 1;
          throw new Error(VALUE_CANARY);
        },
      },
      approvedKeyBinding: { enumerable: true, value: {} },
      applicationSourceBinding: { enumerable: true, value: {} },
      stageAuthorization: { enumerable: true, value: {} },
      consumer: { enumerable: true, value: {} },
    });
    const proxyClaim = new Proxy(expectedRegistryClaim(home), {
      get() {
        throw new Error(VALUE_CANARY);
      },
    });
    const scenarios: HarnessOverrides[] = [
      {
        loadRegistry: async () => {
          throw new Error(VALUE_CANARY);
        },
      },
      {
        claimRegistry: () => {
          throw new Error(VALUE_CANARY);
        },
      },
      {
        claimRegistry: () =>
          expectedRegistryClaim(home, { runId: "00".repeat(32) }),
      },
      {
        claimRegistry: () =>
          expectedRegistryClaim(home, {
            applicationSourceBinding: Object.freeze({
              layout: APPLICATION_SOURCE_LAYOUT,
              revision: "34".repeat(20),
            }),
          }),
      },
      {
        claimRegistry: () =>
          accessorClaim as FloodgateV7ProductionConnectorRegistryPrivateClaim,
      },
      { claimRegistry: () => proxyClaim },
    ];

    for (const overrides of scenarios) {
      const state = harness(home, overrides);
      const failure = await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          state.dependencies,
        ),
      );
      expectSanitizedFailure(failure, {
        phase: "postflight",
        durability: "registry-may-have-been-created",
        registry_may_have_been_created: true,
        retry_disposition: "registry-reconciliation-required",
      });
      expect(state.calls).toContain("install");
    }
    expect(accessorCalls).toBe(0);
  });

  it("rejects malformed dependency records, wrong arity, and production-home aliases at capture", async () => {
    const home = path.join(os.tmpdir(), "floodgate-v7-provisioner-capture");
    const state = harness(home);
    const malformedValues = [
      { ...state.dependencies, extra: VALUE_CANARY },
      new Proxy(state.dependencies, {}),
      Object.defineProperty({ ...state.dependencies }, "randomBytes", {
        enumerable: true,
        get() {
          throw new Error(VALUE_CANARY);
        },
      }),
    ];
    for (const malformed of malformedValues) {
      const failure = await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          malformed as FloodgateV7ProductionConnectorRegistryProvisionerDependenciesForTests,
        ),
      );
      expectSanitizedFailure(failure, {
        phase: "capture",
        durability: "no-registry-change-established",
        registry_may_have_been_created: false,
      });
    }

    const wrongArityFailure = await captureFailure(() =>
      Reflect.apply(
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests,
        undefined,
        [],
      ),
    );
    expectSanitizedFailure(wrongArityFailure, { phase: "capture" });

    const realHomeState = harness(path.resolve(os.homedir()));
    expectSanitizedFailure(
      await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          realHomeState.dependencies,
        ),
      ),
      { phase: "capture", registry_may_have_been_created: false },
    );

    const aliasRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-provisioner-home-alias-"),
    );
    temporaryRoots.push(aliasRoot);
    const alias = path.join(aliasRoot, "home-alias");
    await fs.promises.symlink(await fs.promises.realpath(os.homedir()), alias);
    const aliasState = harness(alias);
    expectSanitizedFailure(
      await captureFailure(() =>
        provisionFloodgateV7ProductionConnectorRegistryCoreForTests(
          aliasState.dependencies,
        ),
      ),
      { phase: "capture", registry_may_have_been_created: false },
    );
  });

  it("keeps production argumentless and distinguishes test-only receipts without touching production", async () => {
    expect(provisionFloodgateV7ProductionConnectorRegistry.length).toBe(0);
    const failure = await captureFailure(() =>
      Reflect.apply(
        provisionFloodgateV7ProductionConnectorRegistry,
        undefined,
        [VALUE_CANARY],
      ),
    );
    expectSanitizedFailure(failure, {
      phase: "capture",
      durability: "no-registry-change-established",
      registry_may_have_been_created: false,
    });

    const source = await fs.promises.readFile(
      path.resolve(
        process.cwd(),
        "ml/floodgate-v7-production-connector-registry-provisioner.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/process\.(?:argv|env|cwd|stdin)\b/);
    expect(source).toContain("getUserInfo().homedir");
    expect(source).toContain("arguments.length !== 0");
    expect(source).toContain(
      '"production-fixed-current-euid-private-registry-provisioning"',
    );
    expect(source).toContain(
      '"test-only-injected-private-registry-provisioning"',
    );
  });
});
