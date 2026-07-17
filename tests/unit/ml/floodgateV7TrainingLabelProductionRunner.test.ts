import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
} from "../../../ml/floodgate-v7-production-outer-gate-lease";
import {
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_EXECUTION_BOUNDARY,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_MUTATION_PURPOSE,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_STATUS,
  FloodgateV7TrainingLabelProductionRunnerError,
  runFloodgateV7TrainingLabelProduction,
  runFloodgateV7TrainingLabelProductionRunnerCoreForTests,
} from "../../../ml/floodgate-v7-training-label-production-runner";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const RUNNER_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-training-label-production-runner.ts",
);
const PRIVATE_CANARY = "private-owner-receipt-canary-must-not-cross-runner";
const HASHES = {
  work: "11".repeat(32),
  train: "22".repeat(32),
  result: "33".repeat(32),
  manifest: "44".repeat(32),
  postflight: "55".repeat(32),
} as const;

function ownerReceipt(): Record<string, unknown> {
  return {
    contract: "shogi-floodgate-v7-training-label-production-owner-v1",
    status: "outer-gate-owned-sealed-work-training-label-finalization-complete",
    claim_boundary:
      "purpose-specific-common-outer-gate-capability-private-registry-approved-current-key-held-stage-unkeyed-header-preflight-fresh-training-callback-scanner-backed-plan-and-terminal-finalizer-without-public-path-binding-row-key-mac-training-weight-live-or-strength-authority-v1",
    execution_boundary:
      "production-fixed-outer-gate-registry-key-stage-training-composer-and-finalizer",
    verification: {
      outer_gate_capability_claimed_synchronously: true,
      registry_and_approved_enrollment_claimed_once: true,
      registry_to_approved_binding_exact_match: true,
      approved_binding_freshly_current: true,
      stage_authorized_under_outer_gate: true,
      held_stage_and_work_unkeyed_preflight: true,
      canonical_v3_header_shape_verified: true,
      composer_invoked_inside_fresh_training_callback: true,
      scanner_backed_plan_minted: true,
      consumer_postflight_completed: true,
      finalizer_completed_and_destination_reverified: true,
    },
    lifecycle: {
      initial_stage_prefix: "work-train-result",
      lease_before_composer: "owner-closes-on-failure",
      lease_after_composer_invocation: "composer-or-plan-owns",
      plan_after_consumer_failure: "owner-discards-before-return",
      plan_after_finalizer_invocation: "finalizer-owns-no-double-cleanup",
    },
    output: {
      work: { bytes: 400_000_000, sha256: HASHES.work },
      train: { bytes: 200_000_000, sha256: HASHES.train },
      result: { bytes: 1_024, sha256: HASHES.result },
      manifest: { bytes: 2_048, sha256: HASHES.manifest },
      parents: 24_000,
      training_records: 23_001,
      consumer_postflight_sha256: HASHES.postflight,
    },
    nonclaims: {
      absolute_or_caller_path: false,
      run_id: false,
      key_id_or_instance: false,
      key_material_or_hash: false,
      authorization_or_content_mac: false,
      run_binding_or_header_candidate: false,
      row_or_position_content: false,
      optimizer_training: false,
      weight: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
    },
  };
}

function outerReceipt(
  value: unknown = ownerReceipt(),
): Record<string, unknown> {
  return {
    value,
    lease: {
      contract: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
      algorithm: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
      execution_boundary:
        FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY,
      mutation_purpose: "training-label-finalization-24000",
      verification: {
        application_source_binding_read_from_locked_registry: true,
        exact_clean_tracked_application_source_closure_verified_before_persistent_mutation: true,
        registry_anchor_revalidated_after_source_verification_before_persistent_mutation: true,
        one_os_lifetime_lock_shared_by_all_four_mutation_purposes: true,
        os_lifetime_lock_held_before_operation: true,
        authenticated_purpose_bound_lease_metadata_durable_before_operation: true,
        signal_and_exit_preserve_stale_evidence: true,
        authenticated_lease_removed_durably_after_operation: true,
        authenticated_purpose_bound_retired_evidence_durable_after_operation: true,
        os_lifetime_lock_released_after_operation: true,
        quarantine_empty_after_operation: true,
      },
      nonclaims: {
        application_source_revision_disclosed: false,
        application_source_path_disclosed: false,
        application_source_digest_disclosed: false,
        ignored_untracked_dependency_bytes_verified: false,
        same_uid_race_isolation: false,
        atomic_source_snapshot: false,
        lock_or_lease_path_disclosed: false,
        private_lease_metadata_disclosed: false,
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
    },
  };
}

describe("Floodgate v7 training-label production runner", () => {
  it("strictly validates and rebuilds the owner and outer receipts", async () => {
    const operation = vi.fn(async (...arguments_: unknown[]) => {
      expect(arguments_).toEqual([]);
      return outerReceipt();
    });
    const receipt =
      await runFloodgateV7TrainingLabelProductionRunnerCoreForTests(operation);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(receipt).toEqual({
      contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_STATUS,
      claim_boundary:
        FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_CLAIM_BOUNDARY,
      execution_boundary:
        FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_EXECUTION_BOUNDARY,
      mutation_purpose:
        FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_RUNNER_MUTATION_PURPOSE,
      output: {
        parents: 24_000,
        training_records: 23_001,
        work: { bytes: 400_000_000, sha256: HASHES.work },
        train: { bytes: 200_000_000, sha256: HASHES.train },
        result: { bytes: 1_024, sha256: HASHES.result },
        manifest: { bytes: 2_048, sha256: HASHES.manifest },
      },
      verification: {
        owner_completed: true,
        destination_content_reverified: true,
        purpose_bound_outer_lease_removed_durably: true,
        common_os_lock_released: true,
        exact_clean_tracked_application_source_closure_validated_under_outer_gate: true,
      },
      nonclaims: {
        path_disclosed: false,
        run_id_disclosed: false,
        key_id_disclosed: false,
        identity_disclosed: false,
        mac_disclosed: false,
        consumer_postflight_digest_disclosed: false,
        raw_outer_receipt_disclosed: false,
        raw_owner_receipt_disclosed: false,
        raw_finalizer_receipt_disclosed: false,
        row_or_position_content_disclosed: false,
        application_source_revision_disclosed: false,
        application_source_path_disclosed: false,
        application_source_digest_disclosed: false,
        ignored_untracked_dependency_bytes_verified: false,
        same_uid_race_isolation: false,
        atomic_source_snapshot: false,
        teacher_truth: false,
        optimizer_training: false,
        weight: false,
        live_evaluation_activation: false,
        match: false,
        playing_strength: false,
      },
    });
    expect(Object.getPrototypeOf(receipt)).toBeNull();
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.getPrototypeOf(receipt.output)).toBeNull();
    expect(Object.isFrozen(receipt.output)).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain(HASHES.postflight);
    expect(JSON.stringify(receipt)).not.toContain(PRIVATE_CANARY);
  });

  it("maps unknown outer rejection to publication and lease reconciliation", async () => {
    let caught: unknown;
    try {
      await runFloodgateV7TrainingLabelProductionRunnerCoreForTests(
        async () => {
          throw new Error(PRIVATE_CANARY);
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(
      FloodgateV7TrainingLabelProductionRunnerError,
    );
    expect(caught).toMatchObject({
      phase: "outer-gate",
      publication_may_have_occurred: true,
      lease_may_remain: true,
      cleanup_failure_count: null,
      retry_disposition: "manual-publication-and-lease-reconciliation-required",
      raw_outer_receipt_disclosed: false,
      raw_owner_receipt_disclosed: false,
      raw_finalizer_receipt_disclosed: false,
    });
    expect(JSON.stringify(caught)).not.toContain(PRIVATE_CANARY);
    expect((caught as Error).cause).toBeUndefined();
  });

  it("rejects invalid test seam capture without crossing the outer boundary", async () => {
    const operation = vi.fn(async () => outerReceipt());
    await expect(
      Reflect.apply(
        runFloodgateV7TrainingLabelProductionRunnerCoreForTests,
        undefined,
        [operation, PRIVATE_CANARY],
      ),
    ).rejects.toMatchObject({
      phase: "capture",
      publication_may_have_occurred: false,
      lease_may_remain: false,
      cleanup_failure_count: 0,
      retry_disposition: "fresh-invocation-required",
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "owner extra key",
      mutate: (result: Record<string, unknown>) => {
        (result.value as Record<string, unknown>).private_canary =
          PRIVATE_CANARY;
      },
    },
    {
      name: "owner proxy",
      mutate: (result: Record<string, unknown>) => {
        result.value = new Proxy(result.value as object, {});
      },
    },
    {
      name: "owner accessor",
      mutate: (result: Record<string, unknown>) => {
        Object.defineProperty(result.value, "status", {
          enumerable: true,
          get() {
            throw new Error(PRIVATE_CANARY);
          },
        });
      },
    },
    {
      name: "postflight digest",
      mutate: (result: Record<string, unknown>) => {
        const owner = result.value as Record<string, unknown>;
        (owner.output as Record<string, unknown>).consumer_postflight_sha256 =
          PRIVATE_CANARY;
      },
    },
    {
      name: "parent count",
      mutate: (result: Record<string, unknown>) => {
        const owner = result.value as Record<string, unknown>;
        (owner.output as Record<string, unknown>).parents = 23_999;
      },
    },
    {
      name: "outer purpose",
      mutate: (result: Record<string, unknown>) => {
        (result.lease as Record<string, unknown>).mutation_purpose =
          "sealed-final-24000";
      },
    },
    {
      name: "outer cleanup verification",
      mutate: (result: Record<string, unknown>) => {
        const lease = result.lease as Record<string, unknown>;
        (
          lease.verification as Record<string, unknown>
        ).authenticated_lease_removed_durably_after_operation = false;
      },
    },
  ])("rejects $name as a conservative receipt failure", async ({ mutate }) => {
    const result = outerReceipt();
    mutate(result);
    await expect(
      runFloodgateV7TrainingLabelProductionRunnerCoreForTests(async () =>
        Promise.resolve(result),
      ),
    ).rejects.toMatchObject({
      phase: "receipt",
      publication_may_have_occurred: true,
      lease_may_remain: true,
      retry_disposition: "manual-publication-and-lease-reconciliation-required",
      raw_owner_receipt_disclosed: false,
      raw_finalizer_receipt_disclosed: false,
    });
  });

  it("contains no ambient path/input seam or raw receipt projection", async () => {
    const source = await fs.promises.readFile(RUNNER_SOURCE_PATH, "utf8");
    expect(source).not.toMatch(/process\.(?:argv|env|cwd|stdin)\b/u);
    expect(source).not.toContain("stringify");
    expect(source).not.toContain("consumer_postflight_sha256:");
    expect(source).not.toContain("primary:");
    expect(source).not.toContain("cause:");
    expect(source).not.toContain(
      'from "./floodgate-v7-training-label-production-owner"',
    );
    expect(source).toContain(
      "runFloodgateV7ProductionOuterGateTrainingLabelFinalization",
    );
    expect(source).toContain("raw_outer_receipt_disclosed: false");
    expect(source).toContain("raw_owner_receipt_disclosed: false");
    expect(source).toContain("raw_finalizer_receipt_disclosed: false");
    const runnerStart = source.indexOf(
      "export function runFloodgateV7TrainingLabelProduction(",
    );
    const runner = source.slice(runnerStart);
    const contextGuard = runner.indexOf(
      "assertFloodgateV7ProductionApplicationEntrypointContext(",
    );
    const applicationClaim = runner.indexOf(
      "claimFloodgateV7ProductionApplicationExecution(",
    );
    const outerOwner = runner.indexOf(
      "runFloodgateV7ProductionOuterGateTrainingLabelFinalization(",
    );
    expect(contextGuard).toBeGreaterThan(-1);
    expect(applicationClaim).toBeGreaterThan(contextGuard);
    expect(outerOwner).toBeGreaterThan(applicationClaim);
    expect(runner).toContain('"runner-entry"');
    expect(runner).toContain("applicationExecutionCapability");
  });

  it("rejects a direct/stale production-runner import before the outer operation", async () => {
    const failure = await Reflect.apply(
      runFloodgateV7TrainingLabelProduction,
      undefined,
      [Object.freeze({})],
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(
      FloodgateV7TrainingLabelProductionRunnerError,
    );
    expect(failure).toMatchObject({
      phase: "capture",
      publication_may_have_occurred: false,
      lease_may_remain: false,
      cleanup_failure_count: 0,
      retry_disposition: "fresh-invocation-required",
      raw_outer_receipt_disclosed: false,
      raw_owner_receipt_disclosed: false,
      raw_finalizer_receipt_disclosed: false,
    });
    const projection = [
      String(failure),
      failure instanceof Error ? failure.stack : "",
      JSON.stringify(failure),
    ].join("\n");
    expect(projection).not.toContain(
      "ml/run-floodgate-v7-training-label-production.ts",
    );
    expect(projection).not.toContain(".codex/worktrees");
  });
});
