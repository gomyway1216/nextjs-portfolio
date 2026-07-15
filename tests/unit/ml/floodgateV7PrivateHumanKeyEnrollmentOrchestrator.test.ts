import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
  type FloodgateV7ApprovedKeyEnrollmentInstallationInput,
} from "../../../ml/floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_STATUS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_TRUST_BOUNDARY,
  FloodgateV7ApprovedKeyEnrollmentInstallerError,
  type FloodgateV7ApprovedKeyEnrollmentInstallerReceipt,
} from "../../../ml/floodgate-v7-approved-key-enrollment-installer";
import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
  type FloodgateV7ApprovedKeyCurrentBindingReceipt,
} from "../../../ml/floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
} from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
  type FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt,
} from "../../../ml/floodgate-v7-deployment-key-instance-enrollment";
import {
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CONTRACT,
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_STATUS,
  FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError,
  runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests,
  verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests,
  type FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDependenciesForTests,
} from "../../../ml/floodgate-v7-private-human-key-enrollment-orchestrator";
import {
  FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
  type FloodgateV7PrivateHumanKeyReviewRequest,
  type FloodgateV7PrivateHumanKeyReviewResponse,
} from "../../../ml/floodgate-v7-private-human-key-review-ui";

const EUID = 501;
const ACTUAL_EUID = process.geteuid?.() ?? EUID;
const INSTANCE_ID = "ab".repeat(32);
const OTHER_INSTANCE_ID = "cd".repeat(32);
const APPROVED_AT_UTC = "2026-07-15T20:45:12.345Z";
const PARENT_DEV = "101";
const PARENT_INO = "202";
const KEY_DEV = "101";
const KEY_INO = "203";
const APPROVAL_BYTE = 0xa7;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

async function temporaryHome(label: string): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `floodgate-v7-${label}-`),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  return home;
}

async function createManagedPrefix(
  home: string,
  count: number,
): Promise<string> {
  let current = home;
  for (
    let index = 0;
    index < count &&
    index <
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length;
    index += 1
  ) {
    const component =
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS[index]!;
    current = path.join(current, component);
    await fs.promises.mkdir(current, { mode: 0o700 });
    await fs.promises.chmod(current, 0o700);
  }
  return current;
}

type CandidateReceipt =
  FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<"test-only-injected-current-euid-home-key-instance-inspection">;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function candidate(
  overrides: Readonly<
    Partial<{
      instanceId: string;
      ownerUid: number;
      parentDev: string;
      parentIno: string;
      keyDev: string;
      keyIno: string;
    }>
  > = {},
): CandidateReceipt {
  return {
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    claim_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-key-instance-inspection",
    algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    key_deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      owner_uid: overrides.ownerUid ?? EUID,
      parent_mode: "0700",
      key_mode: "0600",
      key_bytes: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
      key_nlink: 1,
      parent_identity: {
        dev: overrides.parentDev ?? PARENT_DEV,
        ino: overrides.parentIno ?? PARENT_INO,
      },
      key_identity: {
        dev: overrides.keyDev ?? KEY_DEV,
        ino: overrides.keyIno ?? KEY_INO,
      },
      key_instance_id: overrides.instanceId ?? INSTANCE_ID,
      key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
      held_descriptors_revalidated: true,
    },
    test_boundary: {
      production_home_origin: false,
      production_home_alias_rejected: true,
      current_effective_uid_required: true,
      test_hook_may_observe_key_copy: true,
    },
    nonclaims: {
      key_created_or_written: false,
      key_material_disclosed: false,
      root_key_hash_disclosed: false,
      key_path_disclosed: false,
      authorization_mac: false,
      run_authorization: false,
      stage_authorization: false,
      checkpoint_key_capability: false,
      control_plane_approval: false,
      record_persisted: false,
      connector_execution: false,
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

function installerReceipt(): FloodgateV7ApprovedKeyEnrollmentInstallerReceipt {
  return {
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_STATUS,
    claim_boundary:
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_TRUST_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-control-plane-record-installation",
    algorithm: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_INSTALLER_ALGORITHM,
    record: {
      record_mode: "0600",
      record_nlink: 1,
      publication:
        "staged-record-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1",
      durability: "record-published-and-staging-removal-durable",
      held_descriptors_revalidated: true,
    },
    approval_binding: {
      candidate_canonical_json_validated: true,
      candidate_sha256_exactly_matched: true,
      candidate_bytes_recomputed: true,
    },
    test_boundary: {
      production_home_origin: false,
      production_effective_uid_origin: false,
      failure_hooks_may_be_test_injected: true,
    },
    nonclaims: {
      approval_generated: false,
      approval_id_disclosed: false,
      candidate_digest_disclosed: false,
      candidate_json_disclosed: false,
      key_instance_id_disclosed: false,
      owner_uid_disclosed: false,
      filesystem_identity_disclosed: false,
      record_path_disclosed: false,
      capability_issued: false,
      run_authorization: false,
      gate_authorization: false,
      checkpoint: false,
      runtime: false,
      training: false,
      live_evaluation_activation: false,
      playing_strength: false,
    },
  };
}

function bindingReceipt(): FloodgateV7ApprovedKeyCurrentBindingReceipt {
  return {
    contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-approved-record-current-key-binding",
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

function expectedClaim(
  input: Readonly<FloodgateV7ApprovedKeyEnrollmentInstallationInput>,
  candidateReceipt: CandidateReceipt = candidate(),
): FloodgateV7ApprovedKeyEnrollmentClaim {
  const deployment = candidateReceipt.key_deployment;
  return {
    execution_boundary:
      "test-only-injected-current-euid-home-control-plane-record",
    record: { bytes: 2_048, sha256: "ef".repeat(32) },
    candidate_receipt: {
      bytes: Buffer.byteLength(input.candidate_canonical_json, "utf8"),
      sha256: input.approved_candidate_sha256,
    },
    approval: {
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: input.approval_id,
      approved_at_utc: input.approved_at_utc,
    },
    key_id: deployment.key_id,
    key_instance_id: deployment.key_instance_id,
    deployment_identity: {
      layout: deployment.layout,
      owner_uid: deployment.owner_uid,
      parent_dev: deployment.parent_identity.dev,
      parent_ino: deployment.parent_identity.ino,
      key_dev: deployment.key_identity.dev,
      key_ino: deployment.key_identity.ino,
    },
  };
}

type Dependencies =
  FloodgateV7PrivateHumanKeyEnrollmentOrchestratorDependenciesForTests;

type Harness = Readonly<{
  dependencies: Dependencies;
  order: string[];
  reviewRequests: FloodgateV7PrivateHumanKeyReviewRequest[];
  installedInputs: FloodgateV7ApprovedKeyEnrollmentInstallationInput[];
  entropy: Uint8Array;
}>;

function harness(overrides: Readonly<Partial<Dependencies>> = {}): Harness {
  const order: string[] = [];
  const reviewRequests: FloodgateV7PrivateHumanKeyReviewRequest[] = [];
  const installedInputs: FloodgateV7ApprovedKeyEnrollmentInstallationInput[] =
    [];
  const entropy = new Uint8Array(32).fill(APPROVAL_BYTE);

  const defaults: Dependencies = {
    hasValidExistingApprovedRecord: async () => {
      order.push("existing");
      return false;
    },
    inspectCandidate: async () => {
      order.push("inspect");
      return candidate();
    },
    reviewCandidate: async (request) => {
      order.push("review");
      reviewRequests.push(request);
      return {
        contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
        decision: "approve",
        typed_candidate_sha256: request.candidate_sha256,
      };
    },
    nowIsoUtc: () => {
      order.push("clock");
      return APPROVED_AT_UTC;
    },
    randomApprovalBytes: () => {
      order.push("entropy");
      return entropy;
    },
    installApprovedRecord: async (input) => {
      order.push("install");
      installedInputs.push(input);
      return installerReceipt();
    },
    loadAndClaimApprovedRecord: async () => {
      order.push("claim");
      const input = installedInputs.at(-1);
      if (input === undefined) throw new Error("missing install input");
      return expectedClaim(input);
    },
    verifyCurrentBinding: async () => {
      order.push("binding");
      return bindingReceipt();
    },
  };
  return {
    dependencies: { ...defaults, ...overrides },
    order,
    reviewRequests,
    installedInputs,
    entropy,
  };
}

function approveResponse(
  digest: string,
): FloodgateV7PrivateHumanKeyReviewResponse {
  return {
    contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
    decision: "approve",
    typed_candidate_sha256: digest,
  };
}

async function expectOrchestratorError(
  promise: Promise<unknown>,
  expected: Readonly<
    Partial<FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError>
  >,
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(
    FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError,
  );
  await expect(promise).rejects.toMatchObject(expected);
}

describe("Floodgate v7 approved-record verified-absence probe", () => {
  it("accepts absence at the first missing managed component under a held safe home", async () => {
    const home = await temporaryHome("absence-empty");

    expect(
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: home,
      }),
    ).toBe(true);
  });

  it("rejects when the exact missing path appears before final absence revalidation", async () => {
    const home = await temporaryHome("absence-race");
    const first =
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS[0]!;

    expect(() =>
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: home,
        beforeMissingPathRevalidationForTests: () => {
          fs.mkdirSync(path.join(home, first), { mode: 0o700 });
          fs.chmodSync(path.join(home, first), 0o700);
        },
      }),
    ).toThrow("verified-absence probe failed");
  });

  it("accepts absence after a partial safe exact-0700 managed prefix", async () => {
    const home = await temporaryHome("absence-partial");
    await createManagedPrefix(home, 2);

    expect(
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: home,
      }),
    ).toBe(true);
  });

  it("accepts a missing final record after the full safe managed prefix", async () => {
    const home = await temporaryHome("absence-final");
    await createManagedPrefix(
      home,
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length,
    );

    expect(
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: home,
      }),
    ).toBe(true);
  });

  it("rejects an unsafe managed-directory mode instead of calling it absent", async () => {
    const home = await temporaryHome("absence-mode");
    const first = await createManagedPrefix(home, 1);
    await fs.promises.chmod(first, 0o755);

    expect(() =>
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: home,
      }),
    ).toThrow("verified-absence probe failed");
  });

  it("rejects an intermediate symlink even when its target lacks the final record", async () => {
    const home = await temporaryHome("absence-symlink-home");
    const target = await temporaryHome("absence-symlink-target");
    const first =
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS[0]!;
    await fs.promises.symlink(target, path.join(home, first));

    expect(() =>
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: home,
      }),
    ).toThrow("verified-absence probe failed");
  });

  it("rejects every existing final name without opening or adopting it", async () => {
    const home = await temporaryHome("absence-existing");
    const parent = await createManagedPrefix(
      home,
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length,
    );
    const recordPath = path.join(
      parent,
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
    );
    await fs.promises.writeFile(recordPath, "not-an-approved-record\n", {
      mode: 0o600,
    });

    expect(() =>
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: home,
      }),
    ).toThrow("verified-absence probe failed");
  });

  it("rejects the production home and aliases at the test-only boundary", () => {
    expect(() =>
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        effectiveUserId: ACTUAL_EUID,
        homeDirectory: os.userInfo().homedir,
      }),
    ).toThrow();
  });

  it("rejects proxy and unknown dependency fields", async () => {
    const home = await temporaryHome("absence-dependencies");
    const dependencies = {
      effectiveUserId: ACTUAL_EUID,
      homeDirectory: home,
    };

    expect(() =>
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests(
        new Proxy(dependencies, {}),
      ),
    ).toThrow();
    expect(() =>
      verifyFloodgateV7ApprovedKeyRecordAbsentCoreForTests({
        ...dependencies,
        unexpected: true,
      } as typeof dependencies),
    ).toThrow();
  });
});

describe("Floodgate v7 private human key enrollment orchestrator", () => {
  it("reviews exact LF-inclusive bytes, reinspects, installs, and completes both postflights in order", async () => {
    const state = harness();

    const receipt =
      await runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      );

    expect(state.order).toEqual([
      "existing",
      "inspect",
      "review",
      "clock",
      "inspect",
      "entropy",
      "install",
      "claim",
      "binding",
    ]);
    expect(state.reviewRequests).toHaveLength(1);
    const request = state.reviewRequests[0]!;
    const canonical = `${JSON.stringify(candidate())}\n`;
    expect(request).toEqual({
      contract: "shogi-floodgate-v7-private-human-key-review-request-v1",
      candidate_canonical_json: canonical,
      candidate_sha256: sha256(canonical),
      candidate_bytes: Buffer.byteLength(canonical, "utf8"),
    });
    expect(state.installedInputs).toEqual([
      {
        approval_id: APPROVAL_BYTE.toString(16).repeat(32),
        approved_at_utc: APPROVED_AT_UTC,
        approved_candidate_sha256: sha256(canonical),
        candidate_canonical_json: canonical,
      },
    ]);
    expect([...state.entropy]).toEqual(new Array(32).fill(0));
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_CONTRACT,
      status: FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_ORCHESTRATOR_STATUS,
      execution_boundary:
        "test-only-injected-private-human-key-enrollment-orchestration",
      review: {
        private_native_ui: false,
        full_candidate_sha256_typed_back: true,
        candidate_reinspected_after_review: true,
      },
      record: {
        create_only_installer_succeeded: true,
        expected_record_postflight_validated: true,
        fresh_current_key_binding_validated: true,
        atomic_key_and_record_commit: false,
        supported_key_writers_create_only_no_clobber: true,
        concurrent_out_of_band_key_rotation_excluded: true,
        postflight_mismatch_requires_manual_reconciliation: true,
      },
    });
    const publicJson = JSON.stringify(receipt);
    expect(publicJson).not.toContain(INSTANCE_ID);
    expect(publicJson).not.toContain(sha256(canonical));
    expect(publicJson).not.toContain(APPROVED_AT_UTC);
    expect(publicJson).not.toContain(PARENT_INO);
  });

  it("does not open review or inspect a candidate when a valid record already exists", async () => {
    const state = harness({
      hasValidExistingApprovedRecord: async () => true,
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "existing-record-check",
        approved_record_may_have_been_created: false,
        retry_disposition: "do-not-retry-existing-record",
      },
    );
    expect(state.order).toEqual([]);
  });

  it("treats an indeterminate existing-record check as manual reconciliation", async () => {
    const state = harness({
      hasValidExistingApprovedRecord: async () => {
        throw new Error("private record canary");
      },
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "existing-record-check",
        approved_record_may_have_been_created: false,
        retry_disposition: "manual-reconciliation-required",
      },
    );
  });

  it("cancellation stops before the clock, reinspection, entropy, and installer", async () => {
    const state = harness({
      reviewCandidate: async () => ({
        contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_REVIEW_RESPONSE_CONTRACT,
        decision: "cancel",
        typed_candidate_sha256: null,
      }),
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "private-human-review",
        durability: "no-approved-record-change-established",
        approved_record_may_have_been_created: false,
        retry_disposition: "safe-to-restart-with-a-fresh-private-review",
      },
    );
    expect(state.order).toEqual(["existing", "inspect"]);
    expect(state.installedInputs).toHaveLength(0);
  });

  it.each([
    ["63 lowercase characters", "a".repeat(63)],
    ["65 lowercase characters", "a".repeat(65)],
    ["uppercase", "A".repeat(64)],
    ["leading space", ` ${"a".repeat(64)}`],
    ["trailing LF", `${"a".repeat(64)}\n`],
    ["prefix", `sha256:${"a".repeat(64)}`],
    ["one wrong lowercase digit", `0${"a".repeat(63)}`],
  ])("rejects an approval digest with %s", async (_label, digest) => {
    const state = harness({
      reviewCandidate: async () => approveResponse(digest),
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "private-human-review",
        approved_record_may_have_been_created: false,
      },
    );
    expect(state.installedInputs).toHaveLength(0);
  });

  it.each([
    ["instance ID", { instanceId: OTHER_INSTANCE_ID }],
    ["owner UID", { ownerUid: EUID + 1 }],
    ["parent dev", { parentDev: "999" }],
    ["parent ino", { parentIno: "999" }],
    ["key dev", { keyDev: "999" }],
    ["key ino", { keyIno: "999" }],
  ])("rejects a post-review candidate change in %s", async (_label, change) => {
    let inspections = 0;
    const state = harness({
      inspectCandidate: async () => {
        inspections += 1;
        return inspections === 1 ? candidate() : candidate(change);
      },
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "candidate-reinspection",
        approved_record_may_have_been_created: false,
        retry_disposition: "safe-to-restart-with-a-fresh-private-review",
      },
    );
    expect(inspections).toBe(2);
    expect(state.installedInputs).toHaveLength(0);
  });

  it.each([
    "2026-07-15T20:45:12Z",
    "2026-07-15T20:45:12.345+00:00",
    "not-a-date",
  ])("rejects noncanonical approval time %s", async (timestamp) => {
    const state = harness({ nowIsoUtc: () => timestamp });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "approval-generation",
        approved_record_may_have_been_created: false,
      },
    );
    expect(state.installedInputs).toHaveLength(0);
  });

  it.each([new Uint8Array(31), new Uint8Array(33)])(
    "rejects approval entropy with %s bytes",
    async (entropy) => {
      const state = harness({ randomApprovalBytes: () => entropy });

      await expectOrchestratorError(
        runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
          state.dependencies,
        ),
        {
          phase: "approval-generation",
          approved_record_may_have_been_created: false,
        },
      );
      expect(state.installedInputs).toHaveLength(0);
    },
  );

  it.each([
    [
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "commit",
        "parent-chain-durable-record-absent",
        false,
        "safe-to-retry-after-not-installed",
      ),
      "safe-to-restart-with-a-fresh-private-review",
    ],
    [
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "namespace",
        "managed-prefix-may-exist-existing-record-not-adopted",
        false,
        "do-not-retry-existing-record",
      ),
      "do-not-retry-existing-record",
    ],
    [
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "revalidation",
        "final-link-may-exist",
        true,
        "manual-reconciliation-required",
      ),
      "do-not-retry-installation-may-have-committed",
    ],
    [
      new FloodgateV7ApprovedKeyEnrollmentInstallerError(
        "cleanup",
        "record-published-and-staging-removal-durable",
        true,
        "do-not-retry-existing-record",
      ),
      "do-not-retry-installation-may-have-committed",
    ],
  ] as const)(
    "preserves installer reconciliation metadata for %s",
    async (installerFailure, orchestratorDisposition) => {
      const state = harness({
        installApprovedRecord: async () => {
          throw installerFailure;
        },
      });

      await expectOrchestratorError(
        runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
          state.dependencies,
        ),
        {
          phase: "installation",
          durability: installerFailure.durability,
          approved_record_may_have_been_created:
            installerFailure.may_have_committed,
          retry_disposition: orchestratorDisposition,
          installer_phase: installerFailure.phase,
          installer_retry_disposition: installerFailure.retry_disposition,
        },
      );
    },
  );

  it("conservatively treats an unknown installer failure as possibly committed", async () => {
    const state = harness({
      installApprovedRecord: async () => {
        throw new Error("candidate-and-path-canary");
      },
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "installation",
        durability: "final-link-may-exist",
        approved_record_may_have_been_created: true,
        retry_disposition: "do-not-retry-installation-may-have-committed",
      },
    );
  });

  it("rejects a forged typed installer error without projecting its untrusted metadata", async () => {
    const privateCanary = "private-durability-canary";
    const forged = new FloodgateV7ApprovedKeyEnrollmentInstallerError(
      "commit",
      privateCanary as FloodgateV7ApprovedKeyEnrollmentInstallerError["durability"],
      false,
      "safe-to-retry-after-not-installed",
    );
    const state = harness({
      installApprovedRecord: async () => {
        throw forged;
      },
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "installation",
        durability: "final-link-may-exist",
        approved_record_may_have_been_created: true,
        installer_phase: null,
        installer_retry_disposition: null,
      },
    );
  });

  it("requires the complete installer success receipt and exact test boundary", async () => {
    const state = harness({
      installApprovedRecord: async () =>
        ({
          ...installerReceipt(),
          execution_boundary:
            "production-fixed-current-euid-userinfo-home-control-plane-record-installation",
        }) as FloodgateV7ApprovedKeyEnrollmentInstallerReceipt,
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "installation",
        durability: "final-link-may-exist",
        approved_record_may_have_been_created: true,
      },
    );
  });

  it.each([
    [
      "execution boundary",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        execution_boundary:
          "production-fixed-current-euid-userinfo-home-control-plane-record" as const,
      }),
    ],
    [
      "approval method",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        approval: {
          ...claim.approval,
          method:
            "forged-private-method" as typeof FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
        },
      }),
    ],
    [
      "approval ID",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        approval: { ...claim.approval, approval_id: "00".repeat(32) },
      }),
    ],
    [
      "timestamp",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        approval: {
          ...claim.approval,
          approved_at_utc: "2026-07-15T00:00:00.000Z",
        },
      }),
    ],
    [
      "candidate bytes",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        candidate_receipt: {
          ...claim.candidate_receipt,
          bytes: claim.candidate_receipt.bytes + 1,
        },
      }),
    ],
    [
      "candidate digest",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        candidate_receipt: {
          ...claim.candidate_receipt,
          sha256: "00".repeat(32),
        },
      }),
    ],
    [
      "instance ID",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        key_instance_id: OTHER_INSTANCE_ID,
      }),
    ],
    [
      "owner UID",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        deployment_identity: {
          ...claim.deployment_identity,
          owner_uid: EUID + 1,
        },
      }),
    ],
    [
      "parent dev",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        deployment_identity: {
          ...claim.deployment_identity,
          parent_dev: "999",
        },
      }),
    ],
    [
      "parent ino",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        deployment_identity: {
          ...claim.deployment_identity,
          parent_ino: "999",
        },
      }),
    ],
    [
      "key dev",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        deployment_identity: { ...claim.deployment_identity, key_dev: "999" },
      }),
    ],
    [
      "key ino",
      (claim: FloodgateV7ApprovedKeyEnrollmentClaim) => ({
        ...claim,
        deployment_identity: { ...claim.deployment_identity, key_ino: "999" },
      }),
    ],
  ] as const)(
    "fails closed after install when the loaded %s differs",
    async (_label, mutate) => {
      let installed:
        | FloodgateV7ApprovedKeyEnrollmentInstallationInput
        | undefined;
      const state = harness({
        installApprovedRecord: async (input) => {
          installed = input;
          return installerReceipt();
        },
        loadAndClaimApprovedRecord: async () => {
          if (installed === undefined) throw new Error("missing install");
          return mutate(expectedClaim(installed));
        },
      });

      await expectOrchestratorError(
        runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
          state.dependencies,
        ),
        {
          phase: "record-postflight",
          durability: "record-published-and-staging-removal-durable",
          approved_record_may_have_been_created: true,
          retry_disposition: "manual-reconciliation-required",
        },
      );
    },
  );

  it("fails closed after install when current-key binding cannot be verified", async () => {
    const state = harness({
      verifyCurrentBinding: async () => {
        throw new Error("private current identity canary");
      },
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "current-binding-postflight",
        durability: "record-published-and-staging-removal-durable",
        approved_record_may_have_been_created: true,
        retry_disposition: "manual-reconciliation-required",
      },
    );
  });

  it("requires the complete fulfilled binding receipt and exact test boundary", async () => {
    const state = harness({
      verifyCurrentBinding: async () =>
        ({
          ...bindingReceipt(),
          execution_boundary:
            "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding",
        }) as FloodgateV7ApprovedKeyCurrentBindingReceipt,
    });

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        state.dependencies,
      ),
      {
        phase: "current-binding-postflight",
        durability: "record-published-and-staging-removal-durable",
        approved_record_may_have_been_created: true,
        retry_disposition: "manual-reconciliation-required",
      },
    );
  });

  it("rejects proxy, accessor, and unknown dependency surfaces at capture", async () => {
    const state = harness();
    const proxy = new Proxy(state.dependencies, {});
    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(proxy),
      { phase: "capture", retry_disposition: "manual-reconciliation-required" },
    );

    const accessor = { ...state.dependencies } as Record<string, unknown>;
    Object.defineProperty(accessor, "nowIsoUtc", {
      enumerable: true,
      get: () => () => APPROVED_AT_UTC,
    });
    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests(
        accessor as unknown as Dependencies,
      ),
      { phase: "capture" },
    );

    await expectOrchestratorError(
      runFloodgateV7PrivateHumanKeyEnrollmentOrchestratorCoreForTests({
        ...state.dependencies,
        unexpected: () => undefined,
      } as Dependencies),
      { phase: "capture" },
    );
  });
});
