import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_EXPECTED_CURRENT_BINDING_STATUS,
} from "../../../ml/floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  type FloodgateV7ApprovedKeyEnrollmentCapability,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
} from "../../../ml/floodgate-v7-approved-key-enrollment";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
} from "../../../ml/floodgate-v7-deployment-key-readiness";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "../../../ml/floodgate-production-teacher-asset-authority";
import { FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT } from "../../../ml/floodgate-v7-production-application-source-provenance";
import {
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
} from "../../../ml/floodgate-v7-production-checkpoint-connector";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  serializeFloodgateV7ProductionConnectorRegistryForInstallationCore,
} from "../../../ml/floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
} from "../../../ml/floodgate-v7-production-connector-verifier-readiness";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_STATUS,
  runFloodgateV7ProductionConnectorCoreForTests,
  type FloodgateV7ProductionConnectorRunnerDependenciesForTests,
} from "../../../ml/floodgate-v7-production-connector-runner";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests,
  runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests,
  type FloodgateV7ProductionOuterGateConnectorCapability,
  type FloodgateV7ProductionPrefix100PreflightOuterLockCapability,
} from "../../../ml/floodgate-v7-production-outer-gate-lease";
import {
  inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests,
  type FloodgateV7ProductionPrefix100PreflightDependenciesForTests,
} from "../../../ml/floodgate-v7-production-prefix-100-preflight";
import { scanFloodgateV7Prefix100CallerAnchorCoreForTests } from "../../../ml/floodgate-v7-production-prefix-100-postflight";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const EUID = process.geteuid?.() ?? 501;
const RUN_ID = "a1".repeat(32);
const RECORD_BYTES = 120;
const RECORD_SHA256 = "b2".repeat(32);
const KEY_INSTANCE_ID = "c3".repeat(32);
const ROOT_KEY = Buffer.from("d4".repeat(32), "hex");
const APPLICATION_REVISION = "e5".repeat(20);
const roots: string[] = [];

function applicationSourceBinding(revision = APPLICATION_REVISION): Readonly<{
  layout: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT;
  revision: string;
}> {
  return Object.freeze(
    Object.assign(Object.create(null) as object, {
      layout: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
      revision,
    }),
  ) as Readonly<{
    layout: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT;
    revision: string;
  }>;
}

interface Fixture {
  readonly home: string;
  readonly registryPath: string;
  readonly runs: string;
  readonly stage: string;
  readonly work: string;
  readonly control: string;
  readonly active: string;
  readonly claim: ReturnType<typeof privateClaim>;
}

function heldByCompetitor(registryPath: string): number | null {
  const descriptor = fs.openSync(
    registryPath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    return spawnSync("/usr/bin/lockf", ["-s", "-t", "0", "3"], {
      cwd: "/",
      env: { NODE_ENV: "test" },
      stdio: ["ignore", "ignore", "ignore", descriptor],
    }).status;
  } finally {
    fs.closeSync(descriptor);
  }
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
  const protectedIds = path.join(
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
      recordBytes: RECORD_BYTES,
      recordSha256: RECORD_SHA256,
      keyInstanceId: KEY_INSTANCE_ID,
    },
    applicationSourceBinding: applicationSourceBinding(),
    stageAuthorization: {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      legacyProtectedPositionIdsPath: protectedIds,
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
      legacyProtectedPositionIdsPath: protectedIds,
      outputRoot: roleBundleRoot,
    },
  };
}

async function fixture(): Promise<Fixture> {
  const home = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-v7-real-boundaries-"),
    ),
  );
  roots.push(home);
  await fs.promises.chmod(home, 0o700);
  const registryRoot = path.join(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
  const runs = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
  await fs.promises.mkdir(runs, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(registryRoot, 0o700);
  await fs.promises.chmod(runs, 0o700);
  const registryPath = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
  const claim = privateClaim(home);
  const registryRecord =
    serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
      {
        run_id: claim.runId,
        approved_key_binding: {
          record_bytes: claim.approvedKeyBinding.recordBytes,
          record_sha256: claim.approvedKeyBinding.recordSha256,
          key_instance_id: claim.approvedKeyBinding.keyInstanceId,
        },
        verifier_revision: claim.consumer.verifierRevision,
        application_source_binding: claim.applicationSourceBinding,
        repository_root: claim.consumer.repositoryRoot,
        raw_lock_root: claim.consumer.rawLockRoot,
        role_lock_root: claim.consumer.roleLockRoot,
        role_bundle_root: claim.consumer.outputRoot,
        legacy_protected_position_ids_path:
          claim.consumer.legacyProtectedPositionIdsPath,
        engine_args: claim.stageAuthorization.engineArgs,
      },
      EUID,
      "test-only-injected-current-euid-home-production-connector-registry",
    );
  await fs.promises.writeFile(registryPath, registryRecord, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(registryPath, 0o600);
  const control = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
  );
  const stage = path.join(runs, claim.stageAuthorization.stageBasename);
  return {
    home,
    registryPath,
    runs,
    stage,
    work: path.join(stage, "work.jsonl"),
    control,
    active: path.join(
      control,
      FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
    ),
    claim,
  };
}

function readinessReceipt() {
  return {
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
    status: "ready",
    claim_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
    execution_boundary: "test-only-injected-current-euid-home-metadata",
    deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      parent: "present-current-euid-exact-0700-directory",
      key: "present-current-euid-exact-0600-regular-nlink-1-32-bytes",
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

function verifierReadinessReceipt() {
  return {
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
    claim_boundary:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-role-bundle-receipt-git-closure",
    verification: {
      fixed_current_euid_home_repository_root: true,
      fixed_verifier_revision: true,
      pinned_receipt_git_closure_checked: true,
      closure_receipt_validated: true,
      sensitive_values_exported: false,
    },
    nonclaims: {
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
    },
  };
}

function expectedBindingReceipt() {
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

function approvedClaim(
  executionBoundary: "test" | "production",
): Readonly<FloodgateV7ApprovedKeyEnrollmentClaim> {
  return {
    execution_boundary:
      executionBoundary === "test"
        ? "test-only-injected-current-euid-home-control-plane-record"
        : "production-fixed-current-euid-userinfo-home-control-plane-record",
    record: { bytes: RECORD_BYTES, sha256: RECORD_SHA256 },
    candidate_receipt: { bytes: RECORD_BYTES, sha256: RECORD_SHA256 },
    approval: {
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: "real-boundaries-integration",
      approved_at_utc: "2026-07-16T14:59:00.000Z",
    },
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    key_instance_id: KEY_INSTANCE_ID,
    deployment_identity: {
      layout: "fixed-current-euid-userinfo-home-v1",
      owner_uid: EUID,
      parent_dev: "1",
      parent_ino: "2",
      key_dev: "1",
      key_ino: "3",
    },
  };
}

function currentBindingReceipt() {
  return {
    contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
    execution_boundary:
      "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding",
    algorithm: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
    verification: {
      approved_record_validated: true,
      current_key_freshly_inspected: true,
      exact_binding_match: true,
      held_descriptors_revalidated: true,
      memory_only: true,
      sensitive_values_exported: false,
    },
    nonclaims: {
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
    },
  };
}

function connectorReceipt(
  workBytes: number,
  workSha256: string,
): Readonly<Record<string, unknown>> {
  const approved = approvedClaim("production");
  return {
    contract: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
    claim_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
    execution_boundary: "production-fixed-capability-composition",
    test_boundary: null,
    gate: "durable-prefix-100",
    run_id: RUN_ID,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    key_instance_id: KEY_INSTANCE_ID,
    approved_key_enrollment: {
      claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
      execution_boundary: approved.execution_boundary,
      record: approved.record,
      candidate_receipt: approved.candidate_receipt,
      approval: approved.approval,
      deployment_identity: approved.deployment_identity,
    },
    run_binding: {},
    input_binding: {},
    checkpoint: {
      contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
      claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
      algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
      gate_contract: {
        schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema,
        durable_prefix_100_parents: 100,
        durable_prefix_500_parents: 500,
        sealed_final_parents: 24_000,
      },
      sealed: false,
      work: {
        format: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
        training_parents: 24_000,
        records: 102,
        bytes: workBytes,
        sha256: workSha256,
        target_parents: 100,
        completed_parents: 100,
        resumed_parents: 0,
        durability: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
      },
    },
    lifecycle: {
      readiness_metadata_passed: true,
      authoritative_key_reopen_and_revalidation_succeeded: true,
      exact_input_claimed_synchronously: true,
      checkpoint_settled_before_postflight: true,
      postflight_claimed_once: true,
      key_cleanup_settled: true,
      lease_close_joined: true,
      coordinator_closed: true,
    },
    holdout_boundary: {
      callback_role: "training",
      callback_parents: 24_000,
      labeled_selection_read: false,
      labeled_final_holdout_read: false,
      label_free_selection_and_final_role_artifacts_may_be_verified: true,
    },
    nonclaims: {
      key_bytes_or_key_hash: false,
      authorization_mac: false,
      absolute_or_caller_path: false,
      row_or_position_content: false,
      executable_capability: false,
      teacher_label: false,
      optimizer_training: false,
      weight: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
    },
  };
}

function preflightDependencies(
  value: Fixture,
  events: string[],
): FloodgateV7ProductionPrefix100PreflightDependenciesForTests {
  return {
    effectiveUserId: EUID,
    homeDirectory: value.home,
    async loadRegistry() {
      events.push("real-preflight-registry");
      expect(heldByCompetitor(value.registryPath)).toBe(75);
      expect(fs.existsSync(value.control)).toBe(false);
      return Object.freeze({ registry: true });
    },
    claimRegistry: () => value.claim,
    captureApplicationSource: async () => {
      events.push("real-preflight-application-source");
      return applicationSourceBinding();
    },
    verifyVerifierReadiness: async () => verifierReadinessReceipt(),
    assertVerifierReadinessIdentityBinding: (
      _receipt,
      effectiveUserId,
      homeDirectory,
    ) => {
      if (effectiveUserId !== EUID || homeDirectory !== value.home) {
        throw new Error("readiness identity differs");
      }
    },
    inspectKeyReadiness: async () => readinessReceipt(),
    loadApprovedEnrollment: async () => Object.freeze({ approved: true }),
    claimApprovedEnrollment: () => approvedClaim("test"),
    verifyExpectedCurrentBinding: async () => expectedBindingReceipt(),
  };
}

function runnerDependencies(
  value: Fixture,
  events: string[],
): FloodgateV7ProductionConnectorRunnerDependenciesForTests {
  const registryCapability = Object.freeze({ registry: true });
  const approvedA = Object.freeze({ approved: "A" });
  const approvedB = Object.freeze({ approved: "B" });
  let approvedLoads = 0;
  return {
    async loadRegistry() {
      events.push("real-runner-registry");
      return registryCapability;
    },
    claimRegistry(capability) {
      expect(capability).toBe(registryCapability);
      return value.claim;
    },
    async loadApprovedEnrollment() {
      approvedLoads += 1;
      return (approvedLoads === 1
        ? approvedA
        : approvedB) as unknown as Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>;
    },
    claimApprovedEnrollment(capability) {
      expect(capability).toBe(approvedA);
      return approvedClaim("production");
    },
    verifyCurrentBinding: async () => currentBindingReceipt(),
    async runConnector(options) {
      events.push("connector-checkpoint");
      expect(options.keyEnrollment).toBe(approvedB);
      expect(heldByCompetitor(value.registryPath)).toBe(75);
      expect(fs.existsSync(value.active)).toBe(true);
      await fs.promises.mkdir(value.stage, { mode: 0o700 });
      const rows = Array.from({ length: 102 }, (_entry, index) =>
        JSON.stringify({ record: index }),
      ).join("\n");
      const content = Buffer.from(`${rows}\n`, "utf8");
      await fs.promises.writeFile(value.work, content, {
        flag: "wx",
        mode: 0o600,
      });
      return connectorReceipt(
        content.byteLength,
        createHash("sha256").update(content).digest("hex"),
      );
    },
    async scanPrefix100CallerAnchor(anchor) {
      events.push("real-caller-anchor-scan");
      expect(heldByCompetitor(value.registryPath)).toBe(75);
      expect(fs.existsSync(value.active)).toBe(true);
      const before = await fs.promises.readFile(value.work);
      const receipt = await scanFloodgateV7Prefix100CallerAnchorCoreForTests(
        anchor,
        { effectiveUserId: EUID },
      );
      expect(await fs.promises.readFile(value.work)).toEqual(before);
      return receipt;
    },
  };
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

darwinDescribe("Floodgate v7 prefix-100 real same-lock boundaries", () => {
  it("composes the real preflight, runner parser, and caller-anchor scan under one disposable lock", async () => {
    const value = await fixture();
    const events: string[] = [];
    const result =
      await runFloodgateV7ProductionOuterGatePrefix100OneShotCoreForTests(
        {
          effectiveUserId: EUID,
          homeDirectory: value.home,
          rootKey: ROOT_KEY,
          hostname: "real-boundaries.test",
          pid: process.pid,
          now: () => new Date("2026-07-16T15:00:00.000Z"),
          nonce: () => randomBytes(32),
          installProcessLifecycleHandlers: false,
          captureApplicationSourceForTests: async () => {
            events.push("outer-application-source");
            return applicationSourceBinding();
          },
        },
        () => ({
          inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLock(
            capability: Readonly<FloodgateV7ProductionPrefix100PreflightOuterLockCapability>,
          ) {
            events.push("real-preflight-entry");
            return inspectFloodgateV7ProductionPrefix100PreflightUnderOuterLockCoreForTests(
              capability,
              preflightDependencies(value, events),
            );
          },
        }),
        () => ({
          runFloodgateV7ProductionConnectorPrefix100UnderOuterGate(
            capability: Readonly<FloodgateV7ProductionOuterGateConnectorCapability>,
          ) {
            events.push("real-runner-entry");
            expect(heldByCompetitor(value.registryPath)).toBe(75);
            expect(
              claimFloodgateV7ProductionOuterGateConnectorCapabilityCoreForTests(
                capability,
              ),
            ).toBe("durable-prefix-100");
            return runFloodgateV7ProductionConnectorCoreForTests(
              "durable-prefix-100",
              runnerDependencies(value, events),
            );
          },
        }),
      );

    expect(events).toEqual([
      "outer-application-source",
      "real-preflight-entry",
      "real-preflight-registry",
      "real-preflight-application-source",
      "real-runner-entry",
      "real-runner-registry",
      "connector-checkpoint",
      "real-caller-anchor-scan",
    ]);
    expect(result.value).toMatchObject({
      contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_STATUS,
      gate: "durable-prefix-100",
      verification: {
        exact_clean_tracked_application_source_closure_validated_under_outer_gate: true,
        exact_prefix_100_read_only_continuity_postflight_completed: true,
      },
    });
    expect(heldByCompetitor(value.registryPath)).toBe(0);
    expect(await fs.promises.readdir(value.runs)).toEqual([
      value.claim.stageAuthorization.stageBasename,
    ]);
    expect(await fs.promises.readdir(value.stage)).toEqual(["work.jsonl"]);
  });
});
