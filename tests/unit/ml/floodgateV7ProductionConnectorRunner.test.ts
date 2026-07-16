import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
} from "../../../ml/floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  type FloodgateV7ApprovedKeyEnrollmentCapability,
  type FloodgateV7ApprovedKeyEnrollmentClaim,
} from "../../../ml/floodgate-v7-approved-key-enrollment";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
  FloodgateV7ProductionCheckpointConnectorError,
  type FloodgateV7ProductionCheckpointConnectorOptions,
} from "../../../ml/floodgate-v7-production-checkpoint-connector";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_STATUS,
  FloodgateV7ProductionConnectorRunnerError,
  runFloodgateV7ProductionConnectorCoreForTests,
  runFloodgateV7ProductionConnectorFinal24000,
  runFloodgateV7ProductionConnectorFinal24000UnderOuterGate,
  runFloodgateV7ProductionConnectorPrefix100,
  runFloodgateV7ProductionConnectorPrefix100UnderOuterGate,
  runFloodgateV7ProductionConnectorPrefix500,
  runFloodgateV7ProductionConnectorPrefix500UnderOuterGate,
  validateFloodgateV7ProductionOuterGateSuccessCoreForTests,
  type FloodgateV7ProductionConnectorRunnerDependenciesForTests,
  type FloodgateV7ProductionConnectorRunnerGate,
} from "../../../ml/floodgate-v7-production-connector-runner";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_TEST_EXECUTION_BOUNDARY,
} from "../../../ml/floodgate-v7-production-outer-gate-lease";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const RUNNER_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-production-connector-runner.ts",
);
const PRIVATE_RUN_ID = "11".repeat(32);
const PRIVATE_RECORD_SHA256 = "22".repeat(32);
const PRIVATE_KEY_INSTANCE_ID = "33".repeat(32);
const PRIVATE_PATH_CANARY = "/private/connector/path/must-not-be-public";
const RECORD_BYTES = 4_242;

function targetForGate(
  gate: FloodgateV7ProductionConnectorRunnerGate,
): 100 | 500 | 24_000 {
  return gate === "durable-prefix-100"
    ? 100
    : gate === "durable-prefix-500"
      ? 500
      : 24_000;
}

function approvedClaim(): Readonly<FloodgateV7ApprovedKeyEnrollmentClaim> {
  return {
    execution_boundary:
      "production-fixed-current-euid-userinfo-home-control-plane-record",
    record: {
      bytes: RECORD_BYTES,
      sha256: PRIVATE_RECORD_SHA256,
    },
    candidate_receipt: {
      bytes: RECORD_BYTES,
      sha256: PRIVATE_RECORD_SHA256,
    },
    approval: {
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: "approval-id",
      approved_at_utc: "2026-07-15T00:00:00.000Z",
    },
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    key_instance_id: PRIVATE_KEY_INSTANCE_ID,
    deployment_identity: {
      layout: "fixed-current-euid-userinfo-home-v1",
      owner_uid: 501,
      parent_dev: "1",
      parent_ino: "2",
      key_dev: "1",
      key_ino: "3",
    },
  } as Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
}

function currentBindingReceipt(): unknown {
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
  gate: FloodgateV7ProductionConnectorRunnerGate,
): unknown {
  const target = targetForGate(gate);
  const enrollment = approvedClaim();
  return {
    contract: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
    claim_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
    execution_boundary: "production-fixed-capability-composition",
    test_boundary: null,
    gate,
    run_id: PRIVATE_RUN_ID,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    key_instance_id: PRIVATE_KEY_INSTANCE_ID,
    approved_key_enrollment: {
      claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
      execution_boundary: enrollment.execution_boundary,
      record: enrollment.record,
      candidate_receipt: enrollment.candidate_receipt,
      approval: enrollment.approval,
      deployment_identity: enrollment.deployment_identity,
    },
    run_binding: {},
    input_binding: {},
    checkpoint: {
      contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
      status:
        gate === "sealed-final-24000"
          ? FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS
          : FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
      claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
      algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
      gate_contract: {
        schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema,
        durable_prefix_100_parents: 100,
        durable_prefix_500_parents: 500,
        sealed_final_parents: 24_000,
      },
      sealed: gate === "sealed-final-24000",
      work: {
        format: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
        training_parents: 24_000,
        records:
          gate === "durable-prefix-100"
            ? 102
            : gate === "durable-prefix-500"
              ? 503
              : 24_004,
        bytes: 1,
        sha256: "44".repeat(32),
        target_parents: target,
        completed_parents: target,
        resumed_parents:
          gate === "durable-prefix-100"
            ? 0
            : gate === "durable-prefix-500"
              ? 100
              : 500,
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

function outerOwnerReceipt(executionBoundary: string, value: unknown): unknown {
  return {
    value,
    lease: {
      contract: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_STATUS,
      algorithm: FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_ALGORITHM,
      execution_boundary: executionBoundary,
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
    },
  };
}

function dependencies(
  gate: FloodgateV7ProductionConnectorRunnerGate,
  events: string[] = [],
  runConnector: (
    options: FloodgateV7ProductionCheckpointConnectorOptions,
  ) => Promise<unknown> = async () => connectorReceipt(gate),
): FloodgateV7ProductionConnectorRunnerDependenciesForTests {
  const registryCapability = Object.freeze({ registry: true });
  const approvedA = Object.freeze({ approved: "A" });
  const approvedB = Object.freeze({ approved: "B" });
  let approvedLoads = 0;
  return {
    async loadRegistry() {
      events.push("registry-load");
      return registryCapability;
    },
    claimRegistry(capability) {
      events.push("registry-claim");
      expect(capability).toBe(registryCapability);
      return {
        runId: PRIVATE_RUN_ID,
        approvedKeyBinding: {
          recordBytes: RECORD_BYTES,
          recordSha256: PRIVATE_RECORD_SHA256,
          keyInstanceId: PRIVATE_KEY_INSTANCE_ID,
        },
        stageAuthorization: {
          repositoryRoot: PRIVATE_PATH_CANARY,
        },
        consumer: {
          repositoryRoot: PRIVATE_PATH_CANARY,
        },
      };
    },
    async loadApprovedEnrollment() {
      approvedLoads += 1;
      events.push(`approved-load-${approvedLoads}`);
      return (approvedLoads === 1
        ? approvedA
        : approvedB) as unknown as Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>;
    },
    claimApprovedEnrollment(capability) {
      events.push("approved-claim-A");
      expect(capability).toBe(approvedA);
      return approvedClaim();
    },
    async verifyCurrentBinding() {
      events.push("current-binding");
      return currentBindingReceipt();
    },
    async runConnector(options) {
      events.push("connector");
      expect(options.keyEnrollment).toBe(approvedB);
      expect(options.runId).toBe(PRIVATE_RUN_ID);
      expect(options.gate).toBe(gate);
      return await runConnector(options);
    },
  };
}

function expectSanitized(error: unknown, persisted: boolean): void {
  expect(error).toBeInstanceOf(FloodgateV7ProductionConnectorRunnerError);
  expect(error).toMatchObject({
    connector_invoked: persisted,
    checkpoint_may_have_persisted: persisted,
    raw_connector_receipt_disclosed: false,
  });
  const projection = [
    String(error),
    error instanceof Error ? error.stack : "",
    JSON.stringify(error),
  ].join("\n");
  for (const privateValue of [
    PRIVATE_RUN_ID,
    PRIVATE_RECORD_SHA256,
    PRIVATE_KEY_INSTANCE_ID,
    PRIVATE_PATH_CANARY,
  ]) {
    expect(projection).not.toContain(privateValue);
  }
}

describe("Floodgate v7 production connector runner", () => {
  it("accepts only a production outer-owner receipt, never test-only close evidence", () => {
    const value = Object.freeze({ status: "private-runner-value" });
    expect(
      validateFloodgateV7ProductionOuterGateSuccessCoreForTests(
        outerOwnerReceipt(
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_PRODUCTION_EXECUTION_BOUNDARY,
          value,
        ),
      ),
    ).toBe(value);
    expect(() =>
      validateFloodgateV7ProductionOuterGateSuccessCoreForTests(
        outerOwnerReceipt(
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_LEASE_TEST_EXECUTION_BOUNDARY,
          value,
        ),
      ),
    ).toThrow("runner outer gate receipt differs");
  });

  it.each([
    "durable-prefix-100",
    "durable-prefix-500",
    "sealed-final-24000",
  ] as const)(
    "runs the exact private capability sequence for %s and returns only a sanitized receipt",
    async (gate) => {
      const events: string[] = [];
      const receipt = await runFloodgateV7ProductionConnectorCoreForTests(
        gate,
        dependencies(gate, events),
      );

      expect(events).toEqual([
        "registry-load",
        "registry-claim",
        "approved-load-1",
        "approved-claim-A",
        "current-binding",
        "approved-load-2",
        "connector",
      ]);
      expect(receipt).toEqual({
        contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CONTRACT,
        status: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_STATUS,
        claim_boundary: FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_CLAIM_BOUNDARY,
        execution_boundary:
          FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNNER_EXECUTION_BOUNDARY,
        gate,
        checkpoint: {
          target_parents: targetForGate(gate),
          sealed: gate === "sealed-final-24000",
          checkpoint_may_have_persisted: true,
        },
        verification: {
          private_registry_claimed: true,
          approved_record_binding_matched: true,
          fresh_current_key_binding_validated: true,
          connector_completed: true,
        },
        nonclaims: {
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
        },
      });
      expect(Object.isFrozen(receipt)).toBe(true);
      expect(Object.isFrozen(receipt.checkpoint)).toBe(true);
      expect(Object.isFrozen(receipt.verification)).toBe(true);
      expect(Object.isFrozen(receipt.nonclaims)).toBe(true);
      const publicJson = JSON.stringify(receipt);
      for (const privateValue of [
        PRIVATE_RUN_ID,
        PRIVATE_RECORD_SHA256,
        PRIVATE_KEY_INSTANCE_ID,
        PRIVATE_PATH_CANARY,
      ]) {
        expect(publicJson).not.toContain(privateValue);
      }
    },
  );

  it("fails before current binding and connector when the registry binding differs", async () => {
    const events: string[] = [];
    const base = dependencies("durable-prefix-100", events);
    const error = await runFloodgateV7ProductionConnectorCoreForTests(
      "durable-prefix-100",
      {
        ...base,
        claimApprovedEnrollment(capability) {
          const claim = base.claimApprovedEnrollment(capability);
          return {
            ...claim,
            key_instance_id: "44".repeat(32),
          };
        },
      },
    ).catch((failure: unknown) => failure);

    expectSanitized(error, false);
    expect(error).toMatchObject({
      phase: "approved-binding",
      retry_disposition: "operator-reconciliation-required",
    });
    expect(events).not.toContain("current-binding");
    expect(events).not.toContain("connector");
  });

  it.each([
    [
      "a test-only execution boundary",
      () => ({
        ...(currentBindingReceipt() as Record<string, unknown>),
        execution_boundary:
          "test-only-injected-current-euid-home-approved-record-current-key-binding",
      }),
    ],
    [
      "an extra top-level field",
      () => ({
        ...(currentBindingReceipt() as Record<string, unknown>),
        private_canary: PRIVATE_PATH_CANARY,
      }),
    ],
    [
      "a false nonclaim",
      () => {
        const receipt = currentBindingReceipt() as Record<string, unknown>;
        return {
          ...receipt,
          nonclaims: {
            ...(receipt.nonclaims as Record<string, unknown>),
            runtime: true,
          },
        };
      },
    ],
    [
      "an accessor field",
      () => {
        const receipt = currentBindingReceipt() as Record<string, unknown>;
        return Object.defineProperty(receipt, "verification", {
          enumerable: true,
          get() {
            throw new Error(PRIVATE_PATH_CANARY);
          },
        });
      },
    ],
    ["a Proxy receipt", () => new Proxy(currentBindingReceipt() as object, {})],
  ] as const)(
    "rejects current-binding receipt with %s before connector invocation",
    async (_description, receiptFactory) => {
      const events: string[] = [];
      const base = dependencies("durable-prefix-100", events);
      const error = await runFloodgateV7ProductionConnectorCoreForTests(
        "durable-prefix-100",
        {
          ...base,
          async verifyCurrentBinding() {
            events.push("current-binding");
            return receiptFactory();
          },
        },
      ).catch((failure: unknown) => failure);

      expectSanitized(error, false);
      expect(error).toMatchObject({
        phase: "current-binding",
        retry_disposition: "operator-reconciliation-required",
      });
      expect(events).not.toContain("connector");
    },
  );

  it.each(["accessor", "proxy"] as const)(
    "rejects an approved claim %s without reading attacker-controlled binding values",
    async (mode) => {
      const events: string[] = [];
      const base = dependencies("durable-prefix-100", events);
      const error = await runFloodgateV7ProductionConnectorCoreForTests(
        "durable-prefix-100",
        {
          ...base,
          claimApprovedEnrollment(capability) {
            base.claimApprovedEnrollment(capability);
            const claim = approvedClaim();
            if (mode === "proxy") {
              return new Proxy(claim, {});
            }
            return Object.defineProperty({ ...claim }, "record", {
              enumerable: true,
              get() {
                throw new Error(PRIVATE_PATH_CANARY);
              },
            }) as Readonly<FloodgateV7ApprovedKeyEnrollmentClaim>;
          },
        },
      ).catch((failure: unknown) => failure);

      expectSanitized(error, false);
      expect(error).toMatchObject({ phase: "approved-binding" });
      expect(events).not.toContain("current-binding");
      expect(events).not.toContain("connector");
    },
  );

  it.each([
    [
      "test execution",
      { execution_boundary: "test-only-injected-capability-composition" },
    ],
    ["non-null test boundary", { test_boundary: {} }],
    ["wrong checkpoint contract", { checkpoint_contract: "old-contract" }],
    ["a true nonclaim", { nonclaim: "teacher_label" }],
  ] as const)(
    "rejects a connector success receipt with %s as potentially persistent",
    async (_description, mutation) => {
      const error = await runFloodgateV7ProductionConnectorCoreForTests(
        "durable-prefix-100",
        dependencies("durable-prefix-100", [], async () => {
          const receipt = connectorReceipt("durable-prefix-100") as Record<
            string,
            unknown
          >;
          if ("execution_boundary" in mutation) {
            receipt.execution_boundary = mutation.execution_boundary;
          } else if ("test_boundary" in mutation) {
            receipt.test_boundary = mutation.test_boundary;
          } else if ("checkpoint_contract" in mutation) {
            const checkpoint = receipt.checkpoint as Record<string, unknown>;
            checkpoint.contract = mutation.checkpoint_contract;
          } else {
            const nonclaims = receipt.nonclaims as Record<string, unknown>;
            nonclaims[mutation.nonclaim] = true;
          }
          return receipt;
        }),
      ).catch((failure: unknown) => failure);

      expectSanitized(error, true);
      expect(error).toMatchObject({
        phase: "receipt",
        retry_disposition: "checkpoint-reconciliation-required",
      });
    },
  );

  it.each([
    [
      "a gate-inconsistent record count",
      (work: Record<string, unknown>) => {
        work.records = 101;
      },
    ],
    [
      "a resumed parent below the predecessor gate",
      (work: Record<string, unknown>) => {
        work.resumed_parents = 99;
      },
    ],
    [
      "checkpoint bytes above the V3 bound",
      (work: Record<string, unknown>) => {
        work.bytes = Number.MAX_SAFE_INTEGER;
      },
    ],
  ] as const)(
    "rejects %s in a prefix-500 connector receipt",
    async (_description, mutateWork) => {
      const error = await runFloodgateV7ProductionConnectorCoreForTests(
        "durable-prefix-500",
        dependencies("durable-prefix-500", [], async () => {
          const receipt = connectorReceipt("durable-prefix-500") as Record<
            string,
            unknown
          >;
          const checkpoint = receipt.checkpoint as Record<string, unknown>;
          mutateWork(checkpoint.work as Record<string, unknown>);
          return receipt;
        }),
      ).catch((failure: unknown) => failure);

      expectSanitized(error, true);
      expect(error).toMatchObject({
        phase: "receipt",
        retry_disposition: "checkpoint-reconciliation-required",
      });
    },
  );

  it("preserves a typed connector persistence disposition without exposing its raw failure", async () => {
    const error = await runFloodgateV7ProductionConnectorCoreForTests(
      "durable-prefix-500",
      dependencies("durable-prefix-500", [], async () => {
        throw new FloodgateV7ProductionCheckpointConnectorError(
          "checkpoint",
          null,
          true,
          0,
        );
      }),
    ).catch((failure: unknown) => failure);

    expectSanitized(error, true);
    expect(error).toMatchObject({
      phase: "connector",
      connector_phase: "checkpoint",
      connector_retry_disposition: "checkpoint-reconciliation-required",
      retry_disposition: "checkpoint-reconciliation-required",
    });
  });

  it("treats every unknown post-invocation failure as potentially persistent", async () => {
    const secretFailure = new Error(PRIVATE_PATH_CANARY);
    const error = await runFloodgateV7ProductionConnectorCoreForTests(
      "sealed-final-24000",
      dependencies("sealed-final-24000", [], async () => {
        throw secretFailure;
      }),
    ).catch((failure: unknown) => failure);

    expectSanitized(error, true);
    expect(error).toMatchObject({
      phase: "connector",
      retry_disposition: "checkpoint-reconciliation-required",
    });
  });

  it.each([
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error(PRIVATE_PATH_CANARY);
        },
      },
    ),
    new Proxy(
      new FloodgateV7ProductionCheckpointConnectorError(
        "checkpoint",
        null,
        true,
        0,
      ),
      {},
    ),
  ])(
    "projects a proxied connector rejection as an unknown persistent failure",
    async (proxiedFailure) => {
      const error = await runFloodgateV7ProductionConnectorCoreForTests(
        "durable-prefix-100",
        dependencies("durable-prefix-100", [], async () => {
          throw proxiedFailure;
        }),
      ).catch((failure: unknown) => failure);

      expectSanitized(error, true);
      expect(error).toMatchObject({
        phase: "connector",
        connector_phase: null,
        connector_retry_disposition: null,
        retry_disposition: "checkpoint-reconciliation-required",
      });
    },
  );

  it("does not copy forged typed connector metadata into the public error", async () => {
    const forged = new FloodgateV7ProductionCheckpointConnectorError(
      PRIVATE_PATH_CANARY as never,
      null,
      false,
      0,
    );
    const error = await runFloodgateV7ProductionConnectorCoreForTests(
      "durable-prefix-500",
      dependencies("durable-prefix-500", [], async () => {
        throw forged;
      }),
    ).catch((failure: unknown) => failure);

    expectSanitized(error, true);
    expect(error).toMatchObject({
      phase: "connector",
      connector_phase: null,
      connector_retry_disposition: null,
      retry_disposition: "checkpoint-reconciliation-required",
    });
  });

  it("rejects inconsistent typed connector persistence metadata", async () => {
    const forged = Object.create(
      FloodgateV7ProductionCheckpointConnectorError.prototype,
    ) as Record<string, unknown>;
    Object.defineProperties(forged, {
      phase: { enumerable: true, value: "checkpoint" },
      checkpoint_may_have_persisted: { enumerable: true, value: false },
      retry_disposition: {
        enumerable: true,
        value: "checkpoint-reconciliation-required",
      },
    });
    const error = await runFloodgateV7ProductionConnectorCoreForTests(
      "durable-prefix-100",
      dependencies("durable-prefix-100", [], async () => {
        throw forged;
      }),
    ).catch((failure: unknown) => failure);

    expectSanitized(error, true);
    expect(error).toMatchObject({
      connector_phase: null,
      connector_retry_disposition: null,
      retry_disposition: "checkpoint-reconciliation-required",
    });
  });

  it("treats a mismatched raw success receipt as potentially persistent and never returns it", async () => {
    const error = await runFloodgateV7ProductionConnectorCoreForTests(
      "durable-prefix-100",
      dependencies("durable-prefix-100", [], async () => ({
        ...(connectorReceipt("durable-prefix-100") as object),
        run_id: "55".repeat(32),
      })),
    ).catch((failure: unknown) => failure);

    expectSanitized(error, true);
    expect(error).toMatchObject({ phase: "receipt" });
  });

  it("exports only three zero-argument production gate wrappers and no generic production gate", async () => {
    expect(runFloodgateV7ProductionConnectorPrefix100.length).toBe(0);
    expect(runFloodgateV7ProductionConnectorPrefix500.length).toBe(0);
    expect(runFloodgateV7ProductionConnectorFinal24000.length).toBe(0);
    expect(
      runFloodgateV7ProductionConnectorPrefix100UnderOuterGate.length,
    ).toBe(1);
    expect(
      runFloodgateV7ProductionConnectorPrefix500UnderOuterGate.length,
    ).toBe(1);
    expect(
      runFloodgateV7ProductionConnectorFinal24000UnderOuterGate.length,
    ).toBe(1);
    const source = await fs.promises.readFile(RUNNER_SOURCE_PATH, "utf8");
    expect(source).not.toMatch(
      /export function runFloodgateV7ProductionConnector(?:Gate|\s*\()/u,
    );
    expect(source).toContain("runFloodgateV7ProductionOuterGatePrefix100,");
    expect(source).toContain(
      "runFloodgateV7ProductionConnectorPrefix100UnderOuterGate",
    );
    expect(source).not.toContain("runWithFloodgateV7ProductionOuterGateLease");
    expect(source).not.toMatch(
      /export function runFloodgateV7ProductionConnectorUnderOuterGate/u,
    );
  });
});
