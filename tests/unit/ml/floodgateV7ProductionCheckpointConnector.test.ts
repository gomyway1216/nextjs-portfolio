import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
  createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests,
  type FloodgateV7ApprovedKeyEnrollmentRecord,
} from "../../../ml/floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
} from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
} from "../../../ml/floodgate-v7-deployment-key-instance-enrollment";
import {
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
  FloodgateV7ProductionCheckpointConnectorError,
  runFloodgateV7ProductionCheckpointConnector,
  runFloodgateV7ProductionCheckpointConnectorCoreForTests,
  type FloodgateV7ProductionCheckpointConnectorCoreDependencies,
  type FloodgateV7ProductionCheckpointConnectorFailureEvidence,
  type FloodgateV7ProductionCheckpointConnectorOptions,
} from "../../../ml/floodgate-v7-production-checkpoint-connector";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
  type FloodgateV7DeploymentKeyReadinessReceipt,
  type FloodgateV7DeploymentKeyReadinessStatus,
} from "../../../ml/floodgate-v7-deployment-key-readiness";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const CONNECTOR_SOURCE_PATH = path.resolve(
  process.cwd(),
  "ml/floodgate-v7-production-checkpoint-connector.ts",
);
const RUN_ID = "12".repeat(32);
const EXPECTED_KEY_INSTANCE_ID = "34".repeat(32);
const OTHER_KEY_INSTANCE_ID = "56".repeat(32);
const TEST_OWNER_UID = 501;
const TEST_PARENT_IDENTITY = { dev: "1", ino: "20" } as const;
const TEST_KEY_IDENTITY = { dev: "1", ino: "21" } as const;
const VERIFIER_REVISION = "7".repeat(40);
const AUTHORIZATION_MAC_CANARY =
  "9e8d7c6b5a4938271605f4e3d2c1b0a99e8d7c6b5a4938271605f4e3d2c1b0a9";
const KEY_BYTES_CANARY = Buffer.from(
  "connector-root-and-derived-key-bytes-must-not-escape",
  "utf8",
);
const ABSOLUTE_PATH_CANARY = "/private/connector-canary/root-key-and-role-data";
const SFEN_CANARY =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const MOVE_CANARY = "7g7f";
const FUNCTION_CANARY = "executableCapabilityCanary";
const NativePromise = Promise;
const nativePromiseThen = Promise.prototype.then;
const nativeReflectApply = Reflect.apply;
const TEST_PINNED_PROMISE_CONSTRUCTOR_HOLDER = Object.create(null) as Record<
  PropertyKey,
  unknown
>;
Object.defineProperty(TEST_PINNED_PROMISE_CONSTRUCTOR_HOLDER, Symbol.species, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: NativePromise,
});
Object.freeze(TEST_PINNED_PROMISE_CONSTRUCTOR_HOLDER);
const testPinnedPromises = new WeakSet<Promise<unknown>>();

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

interface Faults {
  readonly create?: unknown;
  readonly stage?: unknown;
  readonly prepare?: unknown;
  readonly consumerBeforeCallback?: unknown;
  readonly checkpoint?: unknown;
  readonly checkpointClosesLease?: boolean;
  readonly postflight?: unknown;
  readonly discard?: unknown;
  readonly leaseClose?: unknown;
  readonly coordinatorClose?: unknown;
  readonly coordinatorAbort?: unknown;
  readonly observer?: unknown;
}

interface Calls {
  readiness: number;
  createCoordinator: number;
  authorizeStage: number;
  claimHandoff: number;
  prepareKey: number;
  consumer: number;
  checkpoint: number;
  claimPostflight: number;
  discardKey: number;
  leaseCloseCalls: number;
  leaseCloseStarts: number;
  coordinatorClose: number;
  coordinatorAbort: number;
  observer: number;
}

interface FixtureConfiguration {
  readonly readinessStatus?: FloodgateV7DeploymentKeyReadinessStatus;
  readonly approvedOwnerUid?: number;
  readonly actualKeyId?: string;
  readonly actualLayout?: string;
  readonly actualKeyInstanceId?: string;
  readonly actualKeyInstanceAlgorithm?: string;
  readonly actualOwnerUid?: number;
  readonly actualParentIdentity?: Readonly<{ dev: string; ino: string }>;
  readonly actualKeyIdentity?: Readonly<{ dev: string; ino: string }>;
  readonly gate?: FloodgateV7ProductionCheckpointConnectorOptions["gate"];
  readonly omitEvalDir?: boolean;
  readonly runBindingOverride?: Readonly<Record<string, unknown>>;
  readonly inputBindingOverride?: Readonly<Record<string, unknown>>;
  readonly checkpointReceiptOverride?: Readonly<Record<string, unknown>>;
  readonly faults?: Readonly<Faults>;
  readonly coordinatorDeferred?: Deferred<unknown>;
  readonly stageDeferred?: Deferred<unknown>;
  readonly checkpointDeferred?: Deferred<unknown>;
  readonly consumerPromiseOwnProperty?: "production-pin" | "unexpected";
  readonly undefinedFailurePoint?: "handoff" | "checkpoint" | "postflight";
}

interface Fixture {
  readonly options: FloodgateV7ProductionCheckpointConnectorOptions;
  dependencies: FloodgateV7ProductionCheckpointConnectorCoreDependencies;
  readonly calls: Calls;
  readonly events: string[];
  readonly authorization: Readonly<Record<string, unknown>>;
  readonly checkpointReceipt: Readonly<Record<string, unknown>>;
  readonly postflightReceipt: Readonly<Record<string, unknown>>;
  readonly coordinator: Readonly<Record<string, unknown>>;
  readonly lease: Readonly<Record<string, unknown>>;
  readonly handoff: Readonly<Record<string, unknown>>;
  readonly input: Readonly<Record<string, unknown>>;
  readonly observedFailures: FloodgateV7ProductionCheckpointConnectorFailureEvidence[];
  readonly checkpointArguments: unknown[][];
  readonly stageAuthorizationArguments: unknown[];
  callbackSettledValue: unknown;
  checkpointCallsWhenCallbackReturned: number;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function decoratePromise<T>(promise: Promise<T>): Promise<T> {
  Object.defineProperty(promise, "unexpected", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: "decorated-promise-canary",
  });
  return promise;
}

function pinConstructorOnlyAndPreventExtensions<T>(
  promise: Promise<T>,
  freeze: boolean,
): Promise<T> {
  Object.defineProperty(promise, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: TEST_PINNED_PROMISE_CONSTRUCTOR_HOLDER,
  });
  if (freeze) Object.freeze(promise);
  else Object.preventExtensions(promise);
  return promise;
}

function pinPromiseLikeProductionConsumer<T>(promise: Promise<T>): Promise<T> {
  if (testPinnedPromises.has(promise)) return promise;
  Object.defineProperty(promise, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: TEST_PINNED_PROMISE_CONSTRUCTOR_HOLDER,
  });
  const pinnedThen = Object.freeze(function (
    onFulfilled?: (settled: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown> {
    const derived = nativeReflectApply(nativePromiseThen, promise, [
      onFulfilled,
      onRejected,
    ]) as Promise<unknown>;
    return pinPromiseLikeProductionConsumer(derived);
  });
  Object.defineProperty(promise, "then", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: pinnedThen,
  });
  testPinnedPromises.add(promise);
  return promise;
}

function livePromiseConstructorPoison(): Readonly<{
  readonly install: () => void;
  readonly restore: () => void;
  readonly trapCalls: () => number;
}> {
  const speciesDescriptor = Object.getOwnPropertyDescriptor(
    Promise,
    Symbol.species,
  )!;
  const constructorDescriptor = Object.getOwnPropertyDescriptor(
    Promise.prototype,
    "constructor",
  )!;
  let calls = 0;
  let installed = false;
  const poison = (): never => {
    calls += 1;
    throw new Error("live Promise constructor or species must not run");
  };
  return {
    install: () => {
      if (installed) return;
      installed = true;
      Object.defineProperty(Promise, Symbol.species, {
        configurable: speciesDescriptor.configurable,
        enumerable: speciesDescriptor.enumerable,
        get: poison,
      });
      Object.defineProperty(Promise.prototype, "constructor", {
        configurable: constructorDescriptor.configurable,
        enumerable: constructorDescriptor.enumerable,
        get: poison,
      });
    },
    restore: () => {
      if (!installed) return;
      installed = false;
      Object.defineProperty(Promise, Symbol.species, speciesDescriptor);
      Object.defineProperty(
        Promise.prototype,
        "constructor",
        constructorDescriptor,
      );
    },
    trapCalls: () => calls,
  };
}

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected rejection");
    },
    (reason) => reason,
  );
}

function readinessReceipt(
  status: FloodgateV7DeploymentKeyReadinessStatus,
): Readonly<FloodgateV7DeploymentKeyReadinessReceipt> {
  const ready = status === "ready";
  const absent = status === "not-provisioned";
  return {
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CONTRACT,
    status,
    claim_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_DEPLOYMENT_KEY_READINESS_TRUST_BOUNDARY,
    execution_boundary: "test-only-injected-current-euid-home-metadata",
    deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      parent: ready
        ? "present-current-euid-exact-0700-directory"
        : absent
          ? "absent"
          : "unsafe",
      key: ready
        ? "present-current-euid-exact-0600-regular-nlink-1-32-bytes"
        : absent
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

function approvedKeyEnrollmentCapability(ownerUid = TEST_OWNER_UID) {
  const keyDeployment = {
    layout: "fixed-current-euid-userinfo-home-v1" as const,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    owner_uid: ownerUid,
    parent_identity: TEST_PARENT_IDENTITY,
    key_identity: TEST_KEY_IDENTITY,
    key_instance_id: EXPECTED_KEY_INSTANCE_ID,
    key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
  };
  const candidate = {
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
      layout: keyDeployment.layout,
      key_id: keyDeployment.key_id,
      owner_uid: keyDeployment.owner_uid,
      parent_mode: "0700",
      key_mode: "0600",
      key_bytes: 32,
      key_nlink: 1,
      parent_identity: keyDeployment.parent_identity,
      key_identity: keyDeployment.key_identity,
      key_instance_id: keyDeployment.key_instance_id,
      key_instance_algorithm: keyDeployment.key_instance_algorithm,
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
  } as const;
  const canonicalJson = `${JSON.stringify(candidate)}\n`;
  const record: FloodgateV7ApprovedKeyEnrollmentRecord = {
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    approval: {
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: "ab".repeat(32),
      approved_at_utc: "2026-07-14T17:00:00.000Z",
      candidate_receipt: {
        bytes: Buffer.byteLength(canonicalJson),
        sha256: createHash("sha256").update(canonicalJson).digest("hex"),
        canonical_json: canonicalJson,
      },
    },
    key_deployment: keyDeployment,
    nonclaims: {
      key_material: false,
      key_path: false,
      root_key_hash: false,
      approval_signature_or_mac: false,
      run_authorization: false,
      gate_authorization: false,
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
  return createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(record);
}

function connectorOptions(
  omitEvalDir = false,
  gate: FloodgateV7ProductionCheckpointConnectorOptions["gate"] = "durable-prefix-100",
  approvedOwnerUid = TEST_OWNER_UID,
): FloodgateV7ProductionCheckpointConnectorOptions {
  const repositoryRoot = "/connector/repository";
  const rawLockRoot = "/connector/raw-lock";
  const roleLockRoot = "/connector/role-lock";
  const roleBundleRoot = "/connector/role-bundle";
  const legacyProtectedPositionIdsPath =
    "/connector/repository/ml/protocols/wcsc36-policy-exposed-parent-ids.txt";
  const stageAuthorizationBase = {
    repositoryRoot,
    rawLockRoot,
    roleLockRoot,
    roleBundleRoot,
    legacyProtectedPositionIdsPath,
    publicationParent: "/connector/publication",
    stageBasename: `floodgate-v7-${RUN_ID}-stage`,
    destinationBasename: `floodgate-v7-${RUN_ID}-final`,
    engineBin: "/connector/assets/engine/yaneuraou",
    engineReceipt: "/connector/assets/engine/yaneuraou-receipt.json",
    engineArgs: [],
  };
  return {
    runId: RUN_ID,
    gate,
    keyEnrollment: approvedKeyEnrollmentCapability(approvedOwnerUid),
    stageAuthorization: omitEvalDir
      ? stageAuthorizationBase
      : { ...stageAuthorizationBase, evalDir: "/connector/assets/eval" },
    consumer: {
      repositoryRoot,
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot,
      roleLockRoot,
      legacyProtectedPositionIdsPath,
      outputRoot: roleBundleRoot,
    },
  };
}

function inputBinding(): Readonly<Record<string, unknown>> {
  return {
    result_receipt_bytes: 7202,
    result_receipt_sha256: "01".repeat(32),
    bundle_manifest_bytes: 7202,
    bundle_manifest_sha256: "02".repeat(32),
    bundle_producer_revision: "3".repeat(40),
    verifier_revision: VERIFIER_REVISION,
    raw_format: "shogi-floodgate-label-free-raw-parent-jsonl-v1",
    raw_bytes: 15_369_952,
    raw_sha256: "04".repeat(32),
    records: 24_000,
    games: 240,
    game_ids_sha256: "05".repeat(32),
    parent_ids_sha256: "06".repeat(32),
    position_ids_count: 24_000,
    position_ids_sha256: "08".repeat(32),
  };
}

function runBinding(): Readonly<Record<string, unknown>> {
  return {
    schema: "shogi-floodgate-v7-teacher-run-binding-v2",
    plan: {
      bytes: 10_890,
      sha256:
        "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af",
    },
    producer_control: {
      schema: "shogi-floodgate-v7-teacher-producer-control-v2",
      parent_deadline_ms: 1_800_000,
      abort_drain_ms: 30_000,
      max_in_flight: 12,
      cancel_policy:
        "first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2",
      late_settlement_policy:
        "observe-from-start-consume-after-terminal-without-validation-or-append-v2",
    },
    stable_runtime_receipt_sha256: "0a".repeat(32),
    teacher_usi_runtime_receipt_sha256: "0b".repeat(32),
  };
}

interface CheckpointGateExpectation {
  readonly gate: FloodgateV7ProductionCheckpointConnectorOptions["gate"];
  readonly status: string;
  readonly sealed: boolean;
  readonly targetParents: number;
  readonly records: number;
  readonly bytes: number;
  readonly acceptedResumeRange: readonly [number, number];
}

const CHECKPOINT_GATE_EXPECTATIONS = [
  {
    gate: "durable-prefix-100",
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
    sealed: false,
    targetParents: 100,
    records: 102,
    bytes: 1_791_893,
    acceptedResumeRange: [0, 100],
  },
  {
    gate: "durable-prefix-500",
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
    sealed: false,
    targetParents: 500,
    records: 503,
    bytes: 8_948_379,
    acceptedResumeRange: [100, 500],
  },
  {
    gate: "sealed-final-24000",
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
    sealed: true,
    targetParents: 24_000,
    records: 24_004,
    bytes: 429_247_143,
    acceptedResumeRange: [500, 24_000],
  },
] as const satisfies readonly CheckpointGateExpectation[];

interface CheckpointReceiptOverrides {
  readonly bytes?: unknown;
  readonly status?: unknown;
  readonly sealed?: unknown;
  readonly targetParents?: unknown;
  readonly completedParents?: unknown;
  readonly resumedParents?: unknown;
  readonly records?: unknown;
}

function checkpointGateExpectation(
  gate: FloodgateV7ProductionCheckpointConnectorOptions["gate"],
): CheckpointGateExpectation {
  const expectation = CHECKPOINT_GATE_EXPECTATIONS.find(
    (candidate) => candidate.gate === gate,
  );
  if (expectation === undefined) throw new Error(`unsupported gate: ${gate}`);
  return expectation;
}

function checkpointReceipt(
  gate: FloodgateV7ProductionCheckpointConnectorOptions["gate"] = "durable-prefix-100",
  overrides: Readonly<CheckpointReceiptOverrides> = {},
): Readonly<Record<string, unknown>> {
  const expectation = checkpointGateExpectation(gate);
  const [minimumResumedParents] = expectation.acceptedResumeRange;
  return {
    contract: "shogi-floodgate-v7-teacher-work-v3",
    status: overrides.status ?? expectation.status,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
    algorithm: "hmac-sha256-hkdf-sha256-v7-parent-gated-milestone-chain-v3",
    run_id: RUN_ID,
    key_id: "floodgate-v7-teacher-checkpoint-root-v1",
    gate,
    gate_contract: {
      schema: "shogi-floodgate-v7-teacher-gate-contract-v1",
      durable_prefix_100_parents: 100,
      durable_prefix_500_parents: 500,
      sealed_final_parents: 24_000,
    },
    stage: {
      basename: `floodgate-v7-${RUN_ID}-stage`,
      parent_dev: "1",
      parent_ino: "2",
      dev: "1",
      ino: "3",
      hidden_absolute_path_canary: ABSOLUTE_PATH_CANARY,
    },
    sealed: overrides.sealed ?? expectation.sealed,
    work: {
      filename: "work.jsonl",
      format: "canonical-jsonl-utf8-single-final-lf-v3",
      training_parents: 24_000,
      records: overrides.records ?? expectation.records,
      bytes: overrides.bytes ?? expectation.bytes,
      sha256: "0c".repeat(32),
      target_parents: overrides.targetParents ?? expectation.targetParents,
      completed_parents:
        overrides.completedParents ?? expectation.targetParents,
      resumed_parents: overrides.resumedParents ?? minimumResumedParents,
      durability:
        "append-parent-and-milestone-line-fsync-seal-directory-sync-final-reopen-v3",
      milestone_100_mac: "0d".repeat(32),
      milestone_500_mac: null,
    },
  };
}

function makeFixture(
  configuration: Readonly<FixtureConfiguration> = {},
): Fixture {
  const gate = configuration.gate ?? "durable-prefix-100";
  const faults = configuration.faults ?? {};
  const calls: Calls = {
    readiness: 0,
    createCoordinator: 0,
    authorizeStage: 0,
    claimHandoff: 0,
    prepareKey: 0,
    consumer: 0,
    checkpoint: 0,
    claimPostflight: 0,
    discardKey: 0,
    leaseCloseCalls: 0,
    leaseCloseStarts: 0,
    coordinatorClose: 0,
    coordinatorAbort: 0,
    observer: 0,
  };
  const events: string[] = [];
  const observedFailures: FloodgateV7ProductionCheckpointConnectorFailureEvidence[] =
    [];
  const checkpointArguments: unknown[][] = [];
  const stageAuthorizationArguments: unknown[] = [];
  const binding = configuration.inputBindingOverride ?? inputBinding();
  const input = {
    schema: "shogi-authenticated-floodgate-training-rows-v1",
    role: "training",
    binding,
    rows: [
      {
        schema_version: 1,
        game_id: `sha256:${"11".repeat(32)}`,
        parent_id: `sha256:${"22".repeat(32)}`,
        position_id: `sha256:${"33".repeat(32)}`,
        parent_sfen: SFEN_CANARY,
        ply: 0,
        played_move: MOVE_CANARY,
      },
    ],
  };
  const postflightReceipt = {
    schema: "shogi-authenticated-floodgate-training-postflight-v1",
    status: "verified-runtime-input-claim-postflight-and-descriptors-closed",
    claim_boundary:
      "consumer-input-and-lifecycle-binding-only-not-staged-output-teacher-label-or-playing-strength-evidence",
    execution_boundary: "test-only-injected-bundle-verifier",
    input: {
      schema: "shogi-authenticated-floodgate-training-rows-v1",
      role: "training",
      binding,
    },
    runtime_claim:
      "exact-input-single-use-claimed-during-synchronous-callback-invocation",
    postflight: {
      callback_settled_without_value: true,
      filesystem_snapshot_revalidated_after_callback: true,
      input_descriptors_closed: true,
    },
    forbidden_rows_canary: input.rows,
  };
  const producedCheckpointReceipt =
    configuration.checkpointReceiptOverride ?? checkpointReceipt(gate);
  const authorization = {
    contract:
      "shogi-floodgate-v7-deployment-teacher-checkpoint-v3-key-authorization-v1",
    status: "prepared-opaque-single-use-v3-derived-key-not-checkpointed",
    claim_boundary: "opaque-key-fixture",
    gate,
    authorization: {
      key_id: configuration.actualKeyId ?? FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      key_deployment: {
        layout:
          configuration.actualLayout ?? "fixed-current-euid-userinfo-home-v1",
        owner_uid: configuration.actualOwnerUid ?? TEST_OWNER_UID,
        parent_identity:
          configuration.actualParentIdentity ?? TEST_PARENT_IDENTITY,
        key_identity: configuration.actualKeyIdentity ?? TEST_KEY_IDENTITY,
        key_instance_id:
          configuration.actualKeyInstanceId ?? EXPECTED_KEY_INSTANCE_ID,
        key_instance_algorithm:
          configuration.actualKeyInstanceAlgorithm ??
          FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
        forbidden_key_bytes: KEY_BYTES_CANARY,
        forbidden_key_path: ABSOLUTE_PATH_CANARY,
      },
      authorization_mac: AUTHORIZATION_MAC_CANARY,
    },
    executable_capability_canary: function executableCapabilityCanary() {
      throw new Error(FUNCTION_CANARY);
    },
  };
  let leaseClosePromise: Promise<void> | undefined;
  const lease = {
    receipt: {
      contract: "floodgate-teacher-private-stage-authorization-v3",
      trust_boundary: "trusted-current-euid-writer-private-0700-stage-v1",
      status: "authorized-private-stage-not-generated-not-published",
      parent_identity: { dev: BigInt(1), ino: BigInt(2) },
      stage_identity: { dev: BigInt(1), ino: BigInt(3) },
      lease_identity: { dev: BigInt(1), ino: BigInt(4) },
      stage_basename: `floodgate-v7-${RUN_ID}-stage`,
      destination_basename: `floodgate-v7-${RUN_ID}-final`,
      allowed_entries: [
        "manifest.json",
        "result.json",
        "train.jsonl",
        "val.jsonl",
        "work.jsonl",
      ],
    },
    stageRoot: `${ABSOLUTE_PATH_CANARY}/stage`,
    destinationRoot: `${ABSOLUTE_PATH_CANARY}/destination`,
    close(): Promise<void> {
      calls.leaseCloseCalls += 1;
      events.push("lease-close-call");
      if (leaseClosePromise === undefined) {
        calls.leaseCloseStarts += 1;
        events.push("lease-close-start");
        leaseClosePromise =
          faults.leaseClose === undefined
            ? Promise.resolve()
            : Promise.reject(faults.leaseClose);
      }
      return leaseClosePromise;
    },
  };
  const bindingReceipt = configuration.runBindingOverride ?? runBinding();
  const produce = function executableCapabilityCanary(): Promise<never> {
    return Promise.reject(new Error(FUNCTION_CANARY));
  };
  const coordinatorClose = (): Promise<void> => {
    calls.coordinatorClose += 1;
    events.push("coordinator-close");
    return faults.coordinatorClose === undefined
      ? Promise.resolve()
      : Promise.reject(faults.coordinatorClose);
  };
  const coordinatorAbort = (): Promise<void> => {
    calls.coordinatorAbort += 1;
    events.push("coordinator-abort");
    return faults.coordinatorAbort === undefined
      ? Promise.resolve()
      : Promise.reject(faults.coordinatorAbort);
  };
  const coordinator = {
    receipt: { hidden_path: ABSOLUTE_PATH_CANARY },
    run_binding: bindingReceipt,
    produce,
    close: coordinatorClose,
    abortAndDrain: coordinatorAbort,
  };
  const handoff = {
    produce,
    abortAndDrain: coordinatorAbort,
    close: coordinatorClose,
    runBinding: bindingReceipt,
  };
  const fixture: Fixture = {
    options: connectorOptions(
      configuration.omitEvalDir,
      gate,
      configuration.approvedOwnerUid,
    ),
    dependencies:
      undefined as unknown as FloodgateV7ProductionCheckpointConnectorCoreDependencies,
    calls,
    events,
    authorization,
    checkpointReceipt: producedCheckpointReceipt,
    postflightReceipt,
    coordinator,
    lease,
    handoff,
    input,
    observedFailures,
    checkpointArguments,
    stageAuthorizationArguments,
    callbackSettledValue: Symbol("not-settled"),
    checkpointCallsWhenCallbackReturned: -1,
  };
  const dependencies = {
    inspectKeyReadiness(): Promise<
      Readonly<FloodgateV7DeploymentKeyReadinessReceipt>
    > {
      calls.readiness += 1;
      events.push("readiness");
      return Promise.resolve(
        readinessReceipt(configuration.readinessStatus ?? "ready"),
      );
    },
    createCoordinator(): Promise<never> {
      calls.createCoordinator += 1;
      events.push("coordinator-start");
      if (configuration.coordinatorDeferred !== undefined) {
        return configuration.coordinatorDeferred.promise as Promise<never>;
      }
      return faults.create === undefined
        ? (Promise.resolve(coordinator) as Promise<never>)
        : Promise.reject(faults.create);
    },
    claimCoordinatorHandoff(value: unknown): never {
      calls.claimHandoff += 1;
      events.push("handoff");
      expect(value).toBe(coordinator);
      if (configuration.undefinedFailurePoint === "handoff") {
        const undefinedFailure: undefined = undefined;
        throw undefinedFailure;
      }
      return handoff as never;
    },
    authorizeStage(value: unknown): Promise<never> {
      calls.authorizeStage += 1;
      events.push("stage-start");
      stageAuthorizationArguments.push(value);
      expect(value).not.toBe(fixture.options.stageAuthorization);
      expect(value).toMatchObject(fixture.options.stageAuthorization);
      if (configuration.stageDeferred !== undefined) {
        return configuration.stageDeferred.promise as Promise<never>;
      }
      return faults.stage === undefined
        ? (Promise.resolve(lease) as Promise<never>)
        : Promise.reject(faults.stage);
    },
    prepareKey(request: unknown): Promise<never> {
      calls.prepareKey += 1;
      events.push("prepare-key");
      const captured = request as Readonly<Record<string, unknown>>;
      expect(Object.getPrototypeOf(captured)).toBeNull();
      expect(Reflect.ownKeys(captured)).toEqual([
        "gate",
        "keyId",
        "runBinding",
        "runId",
        "stageAuthorizationReceipt",
      ]);
      expect(captured).toMatchObject({
        gate,
        keyId: "floodgate-v7-teacher-checkpoint-root-v1",
        runId: RUN_ID,
      });
      return faults.prepare === undefined
        ? (Promise.resolve(authorization) as Promise<never>)
        : Promise.reject(faults.prepare);
    },
    discardKey(value: unknown): void {
      calls.discardKey += 1;
      events.push("discard-key");
      expect(value).toBe(authorization);
      if (faults.discard !== undefined) throw faults.discard;
    },
    consumeRowsAndPostflight(
      value: unknown,
      consume: (input: never) => Promise<void>,
    ): Promise<never> {
      calls.consumer += 1;
      events.push("consumer-start");
      expect(value).not.toBe(fixture.options.consumer);
      expect(value).toMatchObject(fixture.options.consumer);
      if (faults.consumerBeforeCallback !== undefined) {
        return Promise.reject(faults.consumerBeforeCallback);
      }
      const callbackPromise = consume(input as never);
      fixture.checkpointCallsWhenCallbackReturned = calls.checkpoint;
      events.push("consumer-callback-return");
      const settleConsumer = (settled: void): never => {
        fixture.callbackSettledValue = settled;
        events.push("consumer-settled");
        return postflightReceipt as never;
      };
      const consumerPromise =
        configuration.consumerPromiseOwnProperty === "production-pin"
          ? (nativeReflectApply(nativePromiseThen, callbackPromise, [
              settleConsumer,
            ]) as Promise<never>)
          : callbackPromise.then(settleConsumer);
      if (configuration.consumerPromiseOwnProperty === "production-pin") {
        pinPromiseLikeProductionConsumer(consumerPromise);
      } else if (configuration.consumerPromiseOwnProperty === "unexpected") {
        Object.defineProperty(consumerPromise, "unexpected", {
          configurable: false,
          enumerable: false,
          writable: false,
          value: "decorated-promise-canary",
        });
      }
      return consumerPromise;
    },
    claimPostflight(value: unknown): void {
      calls.claimPostflight += 1;
      events.push("claim-postflight");
      expect(value).toBe(postflightReceipt);
      if (configuration.undefinedFailurePoint === "postflight") {
        const undefinedFailure: undefined = undefined;
        throw undefinedFailure;
      }
      if (faults.postflight !== undefined) throw faults.postflight;
    },
    checkpoint(...args: unknown[]): Promise<never> {
      calls.checkpoint += 1;
      events.push("checkpoint");
      checkpointArguments.push(args);
      expect(args[0]).toBe(lease);
      expect(args[1]).toBe(input);
      expect(args[2]).not.toBe(bindingReceipt);
      expect(args[2]).toEqual(bindingReceipt);
      const projectedController = args[3] as object;
      expect(Object.getPrototypeOf(projectedController)).toBeNull();
      expect(Object.isFrozen(projectedController)).toBe(true);
      expect(Reflect.ownKeys(projectedController)).toEqual([
        "produce",
        "abortAndDrain",
      ]);
      expect(args[5]).toBe(authorization);
      if (configuration.undefinedFailurePoint === "checkpoint") {
        return Promise.reject(undefined);
      }
      if (configuration.checkpointDeferred !== undefined) {
        return configuration.checkpointDeferred.promise as Promise<never>;
      }
      if (faults.checkpoint !== undefined) {
        if (faults.checkpointClosesLease === true) {
          return lease
            .close()
            .then(() => Promise.reject(faults.checkpoint)) as Promise<never>;
        }
        return Promise.reject(faults.checkpoint);
      }
      return Promise.resolve(producedCheckpointReceipt) as Promise<never>;
    },
    observeFailureForTests(
      evidence: Readonly<FloodgateV7ProductionCheckpointConnectorFailureEvidence>,
    ): void {
      calls.observer += 1;
      observedFailures.push(evidence);
      if (faults.observer !== undefined) throw faults.observer;
    },
  } satisfies FloodgateV7ProductionCheckpointConnectorCoreDependencies;
  fixture.dependencies = dependencies;
  return fixture;
}

function assertDeepFrozenRecordGraph(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  if (Array.isArray(value)) {
    expect(Object.getPrototypeOf(value)).toBe(Array.prototype);
  } else {
    expect(Object.getPrototypeOf(value)).toBeNull();
  }
  for (const child of Object.values(value)) {
    assertDeepFrozenRecordGraph(child);
  }
}

function assertNoExecutableOrBinary(value: unknown): void {
  if (value === null || typeof value !== "object") {
    expect(typeof value).not.toBe("function");
    return;
  }
  expect(Buffer.isBuffer(value)).toBe(false);
  for (const child of Object.values(value)) {
    expect(typeof child).not.toBe("function");
    assertNoExecutableOrBinary(child);
  }
}

async function waitForEvent(
  events: readonly string[],
  event: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (events.includes(event)) return;
    await Promise.resolve();
  }
  throw new Error(`event did not occur: ${event}`);
}

describe("Floodgate v7 production checkpoint connector", () => {
  it("composes the exact happy path in order and returns only closed evidence", async () => {
    const fixture = makeFixture();

    const receipt =
      await runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      );

    expect(fixture.events).toEqual([
      "readiness",
      "coordinator-start",
      "stage-start",
      "handoff",
      "prepare-key",
      "consumer-start",
      "checkpoint",
      "consumer-callback-return",
      "consumer-settled",
      "claim-postflight",
      "discard-key",
      "lease-close-call",
      "lease-close-start",
      "coordinator-close",
    ]);
    expect(fixture.callbackSettledValue).toBeUndefined();
    expect(fixture.checkpointCallsWhenCallbackReturned).toBe(1);
    expect(fixture.calls).toMatchObject({
      readiness: 1,
      createCoordinator: 1,
      authorizeStage: 1,
      claimHandoff: 1,
      prepareKey: 1,
      consumer: 1,
      checkpoint: 1,
      claimPostflight: 1,
      discardKey: 1,
      leaseCloseCalls: 1,
      leaseCloseStarts: 1,
      coordinatorClose: 1,
      coordinatorAbort: 0,
      observer: 0,
    });
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
      claim_boundary:
        FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CLAIM_BOUNDARY,
      trust_boundary:
        FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_TRUST_BOUNDARY,
      execution_boundary: "test-only-injected-capability-composition",
      test_boundary: {
        production_coordinator_origin: false,
        production_stage_origin: false,
        production_key_origin: false,
        production_input_origin: false,
        production_checkpoint_origin: false,
      },
      run_id: RUN_ID,
      gate: "durable-prefix-100",
      key_id: "floodgate-v7-teacher-checkpoint-root-v1",
      key_instance_id: EXPECTED_KEY_INSTANCE_ID,
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
    });
  });

  it("accepts owner UID 0 when the approved enrollment and actual authority match", async () => {
    const fixture = makeFixture({
      approvedOwnerUid: 0,
      actualOwnerUid: 0,
    });

    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    ).resolves.toMatchObject({
      key_instance_id: EXPECTED_KEY_INSTANCE_ID,
    });
    expect(fixture.calls).toMatchObject({
      prepareKey: 1,
      consumer: 1,
      checkpoint: 1,
      claimPostflight: 1,
    });
  });

  describe.each(CHECKPOINT_GATE_EXPECTATIONS)(
    "checkpoint receipt matrix for $gate",
    (expectation) => {
      const [minimumResumedParents, maximumResumedParents] =
        expectation.acceptedResumeRange;
      const representativeResumedParents = Math.trunc(
        (minimumResumedParents + maximumResumedParents) / 2,
      );

      it.each([
        minimumResumedParents,
        representativeResumedParents,
        maximumResumedParents,
      ])(
        "accepts resumed_parents=%i within the inclusive gate range",
        async (resumedParents) => {
          const fixture = makeFixture({
            gate: expectation.gate,
            checkpointReceiptOverride: checkpointReceipt(expectation.gate, {
              resumedParents,
            }),
          });

          await expect(
            runFloodgateV7ProductionCheckpointConnectorCoreForTests(
              fixture.options,
              fixture.dependencies,
            ),
          ).resolves.toMatchObject({
            gate: expectation.gate,
            checkpoint: {
              status: expectation.status,
              sealed: expectation.sealed,
              work: {
                target_parents: expectation.targetParents,
                completed_parents: expectation.targetParents,
                resumed_parents: resumedParents,
                records: expectation.records,
              },
            },
          });
        },
      );

      it.each([1, FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES])(
        "accepts work.bytes=%i at an inclusive V3 endpoint",
        async (bytes) => {
          const fixture = makeFixture({
            gate: expectation.gate,
            checkpointReceiptOverride: checkpointReceipt(expectation.gate, {
              bytes,
            }),
          });

          await expect(
            runFloodgateV7ProductionCheckpointConnectorCoreForTests(
              fixture.options,
              fixture.dependencies,
            ),
          ).resolves.toMatchObject({
            gate: expectation.gate,
            checkpoint: { work: { bytes } },
          });
        },
      );

      const rejectionCases = [
        {
          field: "status",
          overrides: {
            status:
              expectation.status === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS
                ? FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS
                : FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
          },
        },
        {
          field: "sealed",
          overrides: { sealed: !expectation.sealed },
        },
        {
          field: "target_parents",
          overrides: { targetParents: expectation.targetParents - 1 },
        },
        {
          field: "completed_parents",
          overrides: { completedParents: expectation.targetParents - 1 },
        },
        {
          field: "records",
          overrides: { records: expectation.records - 1 },
        },
        {
          field: "zero bytes",
          overrides: { bytes: 0 },
        },
        {
          field: "bytes above the V3 bound",
          overrides: {
            bytes: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES + 1,
          },
        },
        {
          field: "resumed_parents below the accepted range",
          overrides: { resumedParents: minimumResumedParents - 1 },
        },
        {
          field: "resumed_parents above the accepted range",
          overrides: { resumedParents: maximumResumedParents + 1 },
        },
      ] as const satisfies readonly {
        readonly field: string;
        readonly overrides: Readonly<CheckpointReceiptOverrides>;
      }[];

      it.each(rejectionCases)(
        "rejects an invalid $field receipt",
        async ({ overrides }) => {
          const fixture = makeFixture({
            gate: expectation.gate,
            checkpointReceiptOverride: checkpointReceipt(
              expectation.gate,
              overrides,
            ),
          });

          const error = await rejectionOf(
            runFloodgateV7ProductionCheckpointConnectorCoreForTests(
              fixture.options,
              fixture.dependencies,
            ),
          );

          expect(error).toMatchObject({
            phase: "receipt",
            checkpoint_may_have_persisted: true,
            retry_disposition: "checkpoint-reconciliation-required",
          });
          expect(fixture.calls).toMatchObject({
            checkpoint: 1,
            claimPostflight: 0,
            discardKey: 1,
            leaseCloseCalls: 1,
            coordinatorClose: 0,
            coordinatorAbort: 1,
          });
        },
      );
    },
  );

  it("preserves the optional absence of evalDir through stage authorization", async () => {
    const fixture = makeFixture({ omitEvalDir: true });

    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    ).resolves.toMatchObject({
      lifecycle: { coordinator_closed: true },
    });

    expect(
      Object.getOwnPropertyDescriptor(
        fixture.options.stageAuthorization,
        "evalDir",
      ),
    ).toBeUndefined();
    expect(fixture.stageAuthorizationArguments).toHaveLength(1);
    expect(
      Object.getOwnPropertyDescriptor(
        fixture.stageAuthorizationArguments[0] as object,
        "evalDir",
      ),
    ).toBeUndefined();
  });

  it("starts coordinator and stage authorization concurrently after readiness", async () => {
    const coordinatorGate = deferred<unknown>();
    const stageGate = deferred<unknown>();
    const fixture = makeFixture({
      coordinatorDeferred: coordinatorGate,
      stageDeferred: stageGate,
    });
    const run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
      fixture.options,
      fixture.dependencies,
    );
    await waitForEvent(fixture.events, "stage-start");

    expect(fixture.calls.createCoordinator).toBe(1);
    expect(fixture.calls.authorizeStage).toBe(1);
    expect(fixture.calls.claimHandoff).toBe(0);
    coordinatorGate.resolve(fixture.coordinator);
    await Promise.resolve();
    expect(fixture.calls.claimHandoff).toBe(0);
    stageGate.resolve(fixture.lease);

    await expect(run).resolves.toMatchObject({
      lifecycle: { coordinator_closed: true },
    });
  });

  it.each(["coordinator", "stage", "key"] as const)(
    "captures and cleans a fulfilled %s resource from a decorated genuine Promise",
    async (target) => {
      const fixture = makeFixture();
      let dependencies = fixture.dependencies;
      if (target === "coordinator") {
        const operation = fixture.dependencies.createCoordinator;
        dependencies = {
          ...fixture.dependencies,
          createCoordinator: (() =>
            decoratePromise(operation())) as typeof operation,
        };
      } else if (target === "stage") {
        const operation = fixture.dependencies.authorizeStage;
        dependencies = {
          ...fixture.dependencies,
          authorizeStage: ((...args: Parameters<typeof operation>) =>
            decoratePromise(operation(...args))) as typeof operation,
        };
      } else {
        const operation = fixture.dependencies.prepareKey;
        dependencies = {
          ...fixture.dependencies,
          prepareKey: ((...args: Parameters<typeof operation>) =>
            decoratePromise(operation(...args))) as typeof operation,
        };
      }

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          dependencies,
        ),
      );

      expect(error).toMatchObject({
        phase: target === "key" ? "key-prepare" : "coordinator-stage",
        checkpoint_may_have_persisted: false,
        cleanup_failure_count: 0,
        retry_disposition: "operator-reconciliation-required",
      });
      expect(fixture.calls).toMatchObject({
        consumer: 0,
        checkpoint: 0,
        discardKey: target === "key" ? 1 : 0,
        leaseCloseCalls: 1,
        coordinatorAbort: 1,
        coordinatorClose: 0,
      });
    },
  );

  it.each([
    ["coordinator", false],
    ["stage", false],
    ["key", true],
  ] as const)(
    "accepts and terminally cleans a %s resource from a constructor-safe non-extensible Promise",
    async (target, freeze) => {
      const fixture = makeFixture();
      let dependencies = fixture.dependencies;
      if (target === "coordinator") {
        const operation = fixture.dependencies.createCoordinator;
        dependencies = {
          ...fixture.dependencies,
          createCoordinator: (() =>
            pinConstructorOnlyAndPreventExtensions(
              operation(),
              freeze,
            )) as typeof operation,
        };
      } else if (target === "stage") {
        const operation = fixture.dependencies.authorizeStage;
        dependencies = {
          ...fixture.dependencies,
          authorizeStage: ((...args: Parameters<typeof operation>) =>
            pinConstructorOnlyAndPreventExtensions(
              operation(...args),
              freeze,
            )) as typeof operation,
        };
      } else {
        const operation = fixture.dependencies.prepareKey;
        dependencies = {
          ...fixture.dependencies,
          prepareKey: ((...args: Parameters<typeof operation>) =>
            pinConstructorOnlyAndPreventExtensions(
              operation(...args),
              freeze,
            )) as typeof operation,
        };
      }

      await expect(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          dependencies,
        ),
      ).resolves.toMatchObject({
        execution_boundary: "test-only-injected-capability-composition",
        lifecycle: { coordinator_closed: true, lease_close_joined: true },
      });
      expect(fixture.calls).toMatchObject({
        consumer: 1,
        checkpoint: 1,
        discardKey: 1,
        leaseCloseCalls: 1,
        coordinatorAbort: 0,
        coordinatorClose: 1,
      });
    },
  );

  it.each([
    ["coordinator", "getter"],
    ["coordinator", "non-frozen-function"],
    ["coordinator", "callable-proxy"],
    ["stage", "getter"],
    ["stage", "non-frozen-function"],
    ["stage", "callable-proxy"],
    ["key", "getter"],
    ["key", "non-frozen-function"],
    ["key", "callable-proxy"],
  ] as const)(
    "observes and cleans a fulfilled %s resource without invoking its unsafe own then (%s)",
    async (target, variant) => {
      const fixture = makeFixture();
      let ownThenCalls = 0;
      let proxyTraps = 0;
      const addUnsafeThen = <T>(promise: Promise<T>): Promise<T> => {
        if (variant === "getter") {
          Object.defineProperty(promise, "then", {
            configurable: false,
            enumerable: false,
            get: () => {
              ownThenCalls += 1;
              throw new Error("unsafe own Promise then getter must not run");
            },
          });
          return promise;
        }
        const unsafeThen = function (): never {
          ownThenCalls += 1;
          throw new Error("unsafe own Promise then function must not run");
        };
        const thenValue =
          variant === "non-frozen-function"
            ? unsafeThen
            : new Proxy(unsafeThen, {
                apply: () => {
                  proxyTraps += 1;
                  throw new Error("callable Promise then Proxy must not run");
                },
                get: () => {
                  proxyTraps += 1;
                  throw new Error("callable Promise then Proxy must not trap");
                },
                getOwnPropertyDescriptor: () => {
                  proxyTraps += 1;
                  throw new Error("callable Promise then Proxy must not trap");
                },
                isExtensible: () => {
                  proxyTraps += 1;
                  throw new Error("callable Promise then Proxy must not trap");
                },
                ownKeys: () => {
                  proxyTraps += 1;
                  throw new Error("callable Promise then Proxy must not trap");
                },
                preventExtensions: () => {
                  proxyTraps += 1;
                  throw new Error("callable Promise then Proxy must not trap");
                },
              });
        Object.defineProperty(promise, "then", {
          configurable: false,
          enumerable: false,
          writable: false,
          value: thenValue,
        });
        return promise;
      };
      let dependencies = fixture.dependencies;
      if (target === "coordinator") {
        const operation = fixture.dependencies.createCoordinator;
        dependencies = {
          ...fixture.dependencies,
          createCoordinator: (() =>
            addUnsafeThen(operation())) as typeof operation,
        };
      } else if (target === "stage") {
        const operation = fixture.dependencies.authorizeStage;
        dependencies = {
          ...fixture.dependencies,
          authorizeStage: ((...args: Parameters<typeof operation>) =>
            addUnsafeThen(operation(...args))) as typeof operation,
        };
      } else {
        const operation = fixture.dependencies.prepareKey;
        dependencies = {
          ...fixture.dependencies,
          prepareKey: ((...args: Parameters<typeof operation>) =>
            addUnsafeThen(operation(...args))) as typeof operation,
        };
      }

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          dependencies,
        ),
      );

      expect(ownThenCalls).toBe(0);
      expect(proxyTraps).toBe(0);
      expect(error).toMatchObject({
        phase: target === "key" ? "key-prepare" : "coordinator-stage",
        checkpoint_may_have_persisted: false,
        cleanup_failure_count: 0,
        retry_disposition: "operator-reconciliation-required",
      });
      expect(fixture.calls).toMatchObject({
        consumer: 0,
        checkpoint: 0,
        discardKey: target === "key" ? 1 : 0,
        leaseCloseCalls: 1,
        coordinatorAbort: 1,
        coordinatorClose: 0,
      });
    },
  );

  it("closes a malformed fulfilled stage when its receipt is a Proxy", async () => {
    const fixture = makeFixture();
    let proxyTraps = 0;
    const receipt = new Proxy(
      {},
      {
        get: () => {
          proxyTraps += 1;
          throw new Error("stage receipt Proxy trap must not run");
        },
        ownKeys: () => {
          proxyTraps += 1;
          throw new Error("stage receipt Proxy trap must not run");
        },
      },
    );
    const malformedStage = {
      receipt,
      close: fixture.lease.close as () => Promise<void>,
    };
    const authorizeStage = (() => {
      fixture.calls.authorizeStage += 1;
      fixture.events.push("stage-start");
      return Promise.resolve(malformedStage) as Promise<never>;
    }) as typeof fixture.dependencies.authorizeStage;
    const dependencies = { ...fixture.dependencies, authorizeStage };

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        dependencies,
      ),
    );

    expect(proxyTraps).toBe(0);
    expect(error).toMatchObject({
      phase: "coordinator-stage",
      checkpoint_may_have_persisted: false,
      retry_disposition: "operator-reconciliation-required",
    });
    expect(fixture.calls).toMatchObject({
      prepareKey: 0,
      leaseCloseCalls: 1,
      leaseCloseStarts: 1,
      coordinatorAbort: 1,
      coordinatorClose: 0,
    });
  });

  it("captures coordinator lifecycle without touching unrelated Proxy metadata", async () => {
    const stageFailure = new Error("stage startup failure");
    const fixture = makeFixture({ faults: { stage: stageFailure } });
    let proxyTraps = 0;
    const unrelatedMetadata = new Proxy(
      {},
      {
        get: () => {
          proxyTraps += 1;
          throw new Error("unrelated coordinator metadata trap must not run");
        },
        ownKeys: () => {
          proxyTraps += 1;
          throw new Error("unrelated coordinator metadata trap must not run");
        },
      },
    );
    const malformedCoordinator = {
      ...fixture.coordinator,
      receipt: unrelatedMetadata,
    };
    const createCoordinator = (() => {
      fixture.calls.createCoordinator += 1;
      fixture.events.push("coordinator-start");
      return Promise.resolve(malformedCoordinator) as Promise<never>;
    }) as typeof fixture.dependencies.createCoordinator;
    const dependencies = { ...fixture.dependencies, createCoordinator };

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        dependencies,
      ),
    );

    expect(proxyTraps).toBe(0);
    expect(error).toMatchObject({
      phase: "coordinator-stage",
      checkpoint_may_have_persisted: false,
      retry_disposition: "operator-reconciliation-required",
    });
    expect(fixture.calls).toMatchObject({
      prepareKey: 0,
      leaseCloseCalls: 0,
      coordinatorAbort: 1,
      coordinatorClose: 0,
    });
  });

  it.each(["not-provisioned", "unsafe"] as const)(
    "stops at %s readiness before coordinator, stage, consumer, or sink",
    async (status) => {
      const fixture = makeFixture({ readinessStatus: status });

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          fixture.dependencies,
        ),
      );

      expect(error).toBeInstanceOf(
        FloodgateV7ProductionCheckpointConnectorError,
      );
      expect(error).toMatchObject({
        phase: "readiness",
        readiness_status: status,
        retry_disposition:
          status === "not-provisioned"
            ? "provision-required"
            : "operator-reconciliation-required",
      });
      expect(fixture.calls).toMatchObject({
        readiness: 1,
        createCoordinator: 0,
        authorizeStage: 0,
        claimHandoff: 0,
        prepareKey: 0,
        consumer: 0,
        checkpoint: 0,
        claimPostflight: 0,
        discardKey: 0,
        leaseCloseCalls: 0,
        coordinatorClose: 0,
        coordinatorAbort: 0,
      });
    },
  );

  it.each([
    {
      field: "key_id",
      configuration: { actualKeyId: "unexpected-checkpoint-key-id" },
    },
    {
      field: "deployment layout",
      configuration: { actualLayout: "unexpected-deployment-layout" },
    },
    {
      field: "key_instance_algorithm",
      configuration: {
        actualKeyInstanceAlgorithm: "unexpected-key-instance-algorithm",
      },
    },
  ] as const)(
    "rejects invalid actual authority $field before exposing rows or invoking the sink",
    async ({ configuration }) => {
      const fixture = makeFixture(configuration);

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          fixture.dependencies,
        ),
      );

      expect(error).toMatchObject({
        phase: "key-prepare",
        checkpoint_may_have_persisted: false,
        retry_disposition: "operator-reconciliation-required",
      });
      expect(fixture.calls).toMatchObject({
        prepareKey: 1,
        consumer: 0,
        checkpoint: 0,
        claimPostflight: 0,
        discardKey: 1,
      });
    },
  );

  it("rejects key rotation before exposing rows or invoking the sink", async () => {
    const fixture = makeFixture({ actualKeyInstanceId: OTHER_KEY_INSTANCE_ID });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(error).toMatchObject({
      phase: "key-instance",
      checkpoint_may_have_persisted: false,
      cleanup_failure_count: 0,
      retry_disposition: "operator-reconciliation-required",
    });
    expect(fixture.calls).toMatchObject({
      prepareKey: 1,
      consumer: 0,
      checkpoint: 0,
      claimPostflight: 0,
      discardKey: 1,
      leaseCloseCalls: 1,
      coordinatorAbort: 1,
      coordinatorClose: 0,
    });
  });

  it.each([
    { actualOwnerUid: TEST_OWNER_UID + 1 },
    { actualParentIdentity: { dev: "9", ino: TEST_PARENT_IDENTITY.ino } },
    { actualParentIdentity: { dev: TEST_PARENT_IDENTITY.dev, ino: "99" } },
    { actualKeyIdentity: { dev: "9", ino: TEST_KEY_IDENTITY.ino } },
    { actualKeyIdentity: { dev: TEST_KEY_IDENTITY.dev, ino: "99" } },
  ])(
    "rejects stale approved deployment identity before exposing rows",
    async (configuration) => {
      const fixture = makeFixture(configuration);

      await expect(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toMatchObject({
        phase: "key-instance",
        retry_disposition: "operator-reconciliation-required",
      });
      expect(fixture.calls.consumer).toBe(0);
      expect(fixture.calls.checkpoint).toBe(0);
    },
  );

  it("does not run postflight or cleanup until a delayed sink settles", async () => {
    const sink = deferred<unknown>();
    const fixture = makeFixture({ checkpointDeferred: sink });
    const run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
      fixture.options,
      fixture.dependencies,
    );
    await waitForEvent(fixture.events, "consumer-callback-return");

    expect(fixture.checkpointCallsWhenCallbackReturned).toBe(1);
    expect(fixture.calls).toMatchObject({
      checkpoint: 1,
      claimPostflight: 0,
      discardKey: 0,
      leaseCloseCalls: 0,
      coordinatorClose: 0,
      coordinatorAbort: 0,
    });
    sink.resolve(fixture.checkpointReceipt);

    await expect(run).resolves.toMatchObject({
      lifecycle: {
        checkpoint_settled_before_postflight: true,
        key_cleanup_settled: true,
      },
    });
    expect(fixture.callbackSettledValue).toBeUndefined();
  });

  it("starts coordinator close while lease close is still pending", async () => {
    const leaseClose = deferred<void>();
    const fixture = makeFixture();
    Object.defineProperty(fixture.lease, "close", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: (): Promise<void> => {
        fixture.calls.leaseCloseCalls += 1;
        fixture.calls.leaseCloseStarts += 1;
        fixture.events.push("lease-close-call", "lease-close-start");
        return leaseClose.promise;
      },
    });
    let settled = false;
    const run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
      fixture.options,
      fixture.dependencies,
    );
    void run.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await waitForEvent(fixture.events, "coordinator-close");

    expect(settled).toBe(false);
    expect(fixture.calls).toMatchObject({
      leaseCloseCalls: 1,
      leaseCloseStarts: 1,
      coordinatorClose: 1,
      coordinatorAbort: 0,
    });
    expect(fixture.events.indexOf("coordinator-close")).toBeGreaterThan(
      fixture.events.indexOf("lease-close-start"),
    );
    leaseClose.resolve(undefined);

    await expect(run).resolves.toMatchObject({
      lifecycle: {
        lease_close_joined: true,
        coordinator_closed: true,
      },
    });
    expect(settled).toBe(true);
  });

  it("starts coordinator abort while lease close is still pending", async () => {
    const primary = new Error("checkpoint failure before pending cleanup");
    const leaseClose = deferred<void>();
    const fixture = makeFixture({ faults: { checkpoint: primary } });
    Object.defineProperty(fixture.lease, "close", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: (): Promise<void> => {
        fixture.calls.leaseCloseCalls += 1;
        fixture.calls.leaseCloseStarts += 1;
        fixture.events.push("lease-close-call", "lease-close-start");
        return leaseClose.promise;
      },
    });
    let settled = false;
    const run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
      fixture.options,
      fixture.dependencies,
    );
    void run.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await waitForEvent(fixture.events, "coordinator-abort");

    expect(settled).toBe(false);
    expect(fixture.calls).toMatchObject({
      leaseCloseCalls: 1,
      leaseCloseStarts: 1,
      coordinatorClose: 0,
      coordinatorAbort: 1,
      observer: 0,
    });
    expect(fixture.events.indexOf("coordinator-abort")).toBeGreaterThan(
      fixture.events.indexOf("lease-close-start"),
    );
    leaseClose.resolve(undefined);

    await expect(run).rejects.toMatchObject({
      phase: "checkpoint",
      checkpoint_may_have_persisted: true,
      retry_disposition: "checkpoint-reconciliation-required",
    });
    expect(settled).toBe(true);
    expect(fixture.observedFailures[0]?.primary).toBe(primary);
  });

  it("accepts the production consumer's frozen constructor-holder and then pin", async () => {
    const fixture = makeFixture({
      consumerPromiseOwnProperty: "production-pin",
    });

    const receipt =
      await runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      );

    expect(receipt.lifecycle).toMatchObject({
      checkpoint_settled_before_postflight: true,
      postflight_claimed_once: true,
      coordinator_closed: true,
    });
    expect(fixture.callbackSettledValue).toBeUndefined();
    expect(fixture.calls.coordinatorAbort).toBe(0);
  });

  it("joins an already-started consumer operation before rejecting a decorated Promise", async () => {
    const sink = deferred<unknown>();
    const fixture = makeFixture({
      checkpointDeferred: sink,
      consumerPromiseOwnProperty: "unexpected",
    });
    const run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
      fixture.options,
      fixture.dependencies,
    );
    await waitForEvent(fixture.events, "consumer-callback-return");
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.calls).toMatchObject({
      checkpoint: 1,
      claimPostflight: 0,
      discardKey: 0,
      leaseCloseCalls: 0,
      coordinatorClose: 0,
      coordinatorAbort: 0,
    });
    sink.resolve(fixture.checkpointReceipt);

    await expect(run).rejects.toMatchObject({ phase: "consumer" });
    expect(fixture.events.indexOf("consumer-settled")).toBeLessThan(
      fixture.events.indexOf("discard-key"),
    );
    expect(fixture.calls).toMatchObject({
      discardKey: 1,
      leaseCloseCalls: 1,
      coordinatorAbort: 1,
    });
  });

  it("closes a caller-owned lease after a stage-claim-equivalent sink failure", async () => {
    const primary = new Error("stage claim failed before transfer");
    const fixture = makeFixture({ faults: { checkpoint: primary } });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(error).toMatchObject({ phase: "checkpoint" });
    expect(fixture.calls).toMatchObject({
      discardKey: 1,
      leaseCloseCalls: 1,
      leaseCloseStarts: 1,
      coordinatorAbort: 1,
    });
    expect(fixture.observedFailures[0]?.primary).toBe(primary);
  });

  it("joins the same lease-close Promise after a post-claim sink failure", async () => {
    const primary = new Error("checkpoint failed after stage claim");
    const fixture = makeFixture({
      faults: { checkpoint: primary, checkpointClosesLease: true },
    });

    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "checkpoint" });

    expect(fixture.calls).toMatchObject({
      discardKey: 1,
      leaseCloseCalls: 2,
      leaseCloseStarts: 1,
      coordinatorAbort: 1,
    });
  });

  it.each([
    {
      label: "synchronous handoff",
      undefinedFailurePoint: "handoff",
      phase: "handoff",
      checkpointMayHavePersisted: false,
      retryDisposition: "fresh-invocation-required",
      expectedCalls: {
        prepareKey: 0,
        consumer: 0,
        checkpoint: 0,
        claimPostflight: 0,
        discardKey: 0,
      },
    },
    {
      label: "checkpoint Promise after sink invocation",
      undefinedFailurePoint: "checkpoint",
      phase: "checkpoint",
      checkpointMayHavePersisted: true,
      retryDisposition: "checkpoint-reconciliation-required",
      expectedCalls: {
        prepareKey: 1,
        consumer: 1,
        checkpoint: 1,
        claimPostflight: 0,
        discardKey: 1,
      },
    },
    {
      label: "valid receipt postflight claim",
      undefinedFailurePoint: "postflight",
      phase: "postflight",
      checkpointMayHavePersisted: true,
      retryDisposition: "checkpoint-reconciliation-required",
      expectedCalls: {
        prepareKey: 1,
        consumer: 1,
        checkpoint: 1,
        claimPostflight: 1,
        discardKey: 1,
      },
    },
  ] as const)(
    "fails closed when $label throws or rejects undefined",
    async ({
      undefinedFailurePoint,
      phase,
      checkpointMayHavePersisted,
      retryDisposition,
      expectedCalls,
    }) => {
      const fixture = makeFixture({ undefinedFailurePoint });

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          fixture.dependencies,
        ),
      );

      expect(error).toBeInstanceOf(
        FloodgateV7ProductionCheckpointConnectorError,
      );
      expect(error).toMatchObject({
        phase,
        checkpoint_may_have_persisted: checkpointMayHavePersisted,
        cleanup_failure_count: 0,
        retry_disposition: retryDisposition,
      });
      expect(fixture.calls).toMatchObject({
        claimHandoff: 1,
        ...expectedCalls,
        leaseCloseCalls: 1,
        coordinatorClose: 0,
        coordinatorAbort: 1,
        observer: 1,
      });
      expect(fixture.observedFailures).toHaveLength(1);
      expect(fixture.observedFailures[0]).toMatchObject({
        phase,
        primary: undefined,
        cleanupFailures: [],
        checkpointMayHavePersisted,
      });
    },
  );

  it("requires checkpoint reconciliation when a sink failure may have persisted", async () => {
    const primary = Object.assign(new Error("ambiguous checkpoint failure"), {
      mayHavePersisted: true,
    });
    const fixture = makeFixture({ faults: { checkpoint: primary } });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(error).toMatchObject({
      phase: "checkpoint",
      checkpoint_may_have_persisted: true,
      cleanup_failure_count: 0,
      retry_disposition: "checkpoint-reconciliation-required",
    });
    expect(fixture.observedFailures[0]).toMatchObject({
      primary,
      checkpointMayHavePersisted: true,
    });
    expect(fixture.calls).toMatchObject({
      discardKey: 1,
      leaseCloseCalls: 1,
      coordinatorAbort: 1,
    });
  });

  it.each(["wrap", "ignore"] as const)(
    "tracks a synchronously thrown checkpoint through callbackPromise when the consumer chooses to %s it",
    async (mode) => {
      const checkpointFailure = new Error("synchronous checkpoint throw");
      const wrapperFailure = new Error("consumer wrapper failure");
      const fixture = makeFixture();
      const checkpoint = (() => {
        fixture.calls.checkpoint += 1;
        fixture.events.push("checkpoint");
        throw checkpointFailure;
      }) as typeof fixture.dependencies.checkpoint;
      const consumeRowsAndPostflight = ((
        _options: unknown,
        consume: (input: never) => Promise<void>,
      ): Promise<never> => {
        fixture.calls.consumer += 1;
        fixture.events.push("consumer-start");
        const callback = consume(fixture.input as never);
        fixture.checkpointCallsWhenCallbackReturned = fixture.calls.checkpoint;
        fixture.events.push("consumer-callback-return");
        if (mode === "wrap") {
          return callback.then(
            () => fixture.postflightReceipt as never,
            () => Promise.reject(wrapperFailure),
          ) as Promise<never>;
        }
        void callback.then(
          () => undefined,
          () => undefined,
        );
        return Promise.resolve(fixture.postflightReceipt) as Promise<never>;
      }) as typeof fixture.dependencies.consumeRowsAndPostflight;
      const dependencies = {
        ...fixture.dependencies,
        checkpoint,
        consumeRowsAndPostflight,
      };

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          dependencies,
        ),
      );

      expect(fixture.checkpointCallsWhenCallbackReturned).toBe(1);
      expect(error).toMatchObject({
        phase: "checkpoint",
        checkpoint_may_have_persisted: true,
        cleanup_failure_count: 0,
        retry_disposition: "checkpoint-reconciliation-required",
      });
      expect(fixture.observedFailures[0]).toMatchObject({
        primary: mode === "wrap" ? wrapperFailure : checkpointFailure,
        checkpointMayHavePersisted: true,
      });
      expect(fixture.calls).toMatchObject({
        checkpoint: 1,
        claimPostflight: 0,
        discardKey: 1,
        leaseCloseCalls: 1,
        coordinatorAbort: 1,
      });
    },
  );

  it.each([
    ["postflight", { postflight: new Error("postflight") }, "postflight"],
    ["discard", { discard: new Error("discard") }, "cleanup"],
    ["lease close", { leaseClose: new Error("lease close") }, "cleanup"],
    [
      "coordinator close",
      { coordinatorClose: new Error("coordinator close") },
      "cleanup",
    ],
  ] as const)(
    "fails without a success receipt on an isolated %s fault",
    async (_label, faults, phase) => {
      const fixture = makeFixture({ faults });

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          fixture.dependencies,
        ),
      );

      expect(error).toBeInstanceOf(
        FloodgateV7ProductionCheckpointConnectorError,
      );
      expect(error).toMatchObject({
        phase,
        checkpoint_may_have_persisted: true,
        retry_disposition: "checkpoint-reconciliation-required",
      });
      expect(fixture.calls.discardKey).toBe(1);
      expect(fixture.calls.leaseCloseCalls).toBe(1);
      expect(
        fixture.calls.coordinatorClose + fixture.calls.coordinatorAbort,
      ).toBe(1);
    },
  );

  it("attempts every cleanup and preserves compound faults only in test evidence", async () => {
    const primary = new Error("checkpoint primary");
    const discard = new Error("discard cleanup");
    const leaseClose = new Error("lease cleanup");
    const abort = new Error("abort cleanup");
    const fixture = makeFixture({
      faults: {
        checkpoint: primary,
        discard,
        leaseClose,
        coordinatorAbort: abort,
      },
    });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(error).toMatchObject({
      phase: "checkpoint",
      cleanup_failure_count: 3,
      checkpoint_may_have_persisted: true,
      retry_disposition: "checkpoint-reconciliation-required",
    });
    expect(fixture.calls).toMatchObject({
      discardKey: 1,
      leaseCloseCalls: 1,
      coordinatorAbort: 1,
      coordinatorClose: 0,
      observer: 1,
    });
    expect(fixture.observedFailures).toHaveLength(1);
    expect(fixture.observedFailures[0]?.primary).toBe(primary);
    expect(fixture.observedFailures[0]?.cleanupFailures).toEqual([
      discard,
      leaseClose,
      abort,
    ]);
  });

  it("surfaces an isolated abort fault without skipping key or lease cleanup", async () => {
    const primary = new Error("checkpoint primary");
    const abort = new Error("abort only cleanup fault");
    const fixture = makeFixture({
      faults: { checkpoint: primary, coordinatorAbort: abort },
    });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(error).toMatchObject({
      phase: "checkpoint",
      cleanup_failure_count: 1,
    });
    expect(fixture.calls).toMatchObject({
      discardKey: 1,
      leaseCloseCalls: 1,
      coordinatorAbort: 1,
    });
    expect(fixture.observedFailures[0]?.cleanupFailures).toEqual([abort]);
  });

  it("keeps receipt records exact, null-prototype, and deeply frozen", async () => {
    const fixture = makeFixture();
    const receipt =
      await runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      );

    expect(Reflect.ownKeys(receipt)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "trust_boundary",
      "execution_boundary",
      "test_boundary",
      "run_id",
      "gate",
      "key_id",
      "key_instance_id",
      "approved_key_enrollment",
      "run_binding",
      "input_binding",
      "checkpoint",
      "lifecycle",
      "holdout_boundary",
      "nonclaims",
    ]);
    expect(Reflect.ownKeys(receipt.lifecycle)).toEqual([
      "readiness_metadata_passed",
      "authoritative_key_reopen_and_revalidation_succeeded",
      "exact_input_claimed_synchronously",
      "checkpoint_settled_before_postflight",
      "postflight_claimed_once",
      "key_cleanup_settled",
      "lease_close_joined",
      "coordinator_closed",
    ]);
    expect(Reflect.ownKeys(receipt.approved_key_enrollment)).toEqual([
      "claim_boundary",
      "execution_boundary",
      "record",
      "candidate_receipt",
      "approval",
      "deployment_identity",
    ]);
    expect(Reflect.ownKeys(receipt.nonclaims)).toEqual([
      "key_bytes_or_key_hash",
      "authorization_mac",
      "absolute_or_caller_path",
      "row_or_position_content",
      "executable_capability",
      "teacher_label",
      "optimizer_training",
      "weight",
      "live_evaluation_activation",
      "match",
      "playing_strength",
    ]);
    assertDeepFrozenRecordGraph(receipt);
  });

  it("allows only the pseudonymous key instance id and leaks no capability or sensitive canary", async () => {
    const fixture = makeFixture();
    const receipt =
      await runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      );
    const serialized = JSON.stringify(receipt);

    expect(receipt.key_instance_id).toBe(EXPECTED_KEY_INSTANCE_ID);
    for (const forbidden of [
      AUTHORIZATION_MAC_CANARY,
      KEY_BYTES_CANARY.toString("hex"),
      KEY_BYTES_CANARY.toString("base64"),
      KEY_BYTES_CANARY.toString("utf8"),
      ABSOLUTE_PATH_CANARY,
      SFEN_CANARY,
      MOVE_CANARY,
      FUNCTION_CANARY,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).toContain(EXPECTED_KEY_INSTANCE_ID);
    expect(receipt.nonclaims).toEqual({
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
    });
    assertNoExecutableOrBinary(receipt);
  });

  it("rejects a Proxy in projected run metadata without invoking its traps", async () => {
    let proxyTraps = 0;
    const hostileBinding = new Proxy(runBinding(), {
      get: () => {
        proxyTraps += 1;
        throw new Error(`${ABSOLUTE_PATH_CANARY}/${FUNCTION_CANARY}`);
      },
    });
    const fixture = makeFixture({ runBindingOverride: hostileBinding });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(proxyTraps).toBe(0);
    expect(error).toMatchObject({
      phase: "handoff",
      checkpoint_may_have_persisted: false,
      retry_disposition: "fresh-invocation-required",
    });
    expect(String(error)).not.toContain(ABSOLUTE_PATH_CANARY);
    expect(String(error)).not.toContain(FUNCTION_CANARY);
    expect(fixture.calls).toMatchObject({
      discardKey: 0,
      leaseCloseCalls: 1,
      coordinatorClose: 0,
      coordinatorAbort: 1,
    });
  });

  it("rejects an accessor in projected input metadata without invoking it", async () => {
    const hostileBinding = { ...inputBinding() };
    let getterCalls = 0;
    Object.defineProperty(hostileBinding, "raw_sha256", {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;
        throw new Error(`${ABSOLUTE_PATH_CANARY}/${FUNCTION_CANARY}`);
      },
    });
    const fixture = makeFixture({ inputBindingOverride: hostileBinding });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(getterCalls).toBe(0);
    expect(error).toMatchObject({
      phase: "receipt",
      checkpoint_may_have_persisted: true,
      retry_disposition: "checkpoint-reconciliation-required",
    });
    expect(String(error)).not.toContain(ABSOLUTE_PATH_CANARY);
    expect(String(error)).not.toContain(FUNCTION_CANARY);
  });

  it.each([
    ["absolute-path value", ABSOLUTE_PATH_CANARY],
    ["file-URI value", `file://${ABSOLUTE_PATH_CANARY}`],
  ] as const)(
    "rejects a hostile %s masquerading as raw_format without leaking it",
    async (_label, hostileRawFormat) => {
      const hostileBinding = {
        ...inputBinding(),
        raw_format: hostileRawFormat,
      };
      const fixture = makeFixture({ inputBindingOverride: hostileBinding });

      const error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          fixture.dependencies,
        ),
      );
      const publicText = `${String(error)}${JSON.stringify(error)}`;

      expect(error).toMatchObject({
        phase: "receipt",
        checkpoint_may_have_persisted: true,
        retry_disposition: "checkpoint-reconciliation-required",
      });
      expect(publicText).not.toContain(hostileRawFormat);
      expect(publicText).not.toContain(ABSOLUTE_PATH_CANARY);
      expect(fixture.calls).toMatchObject({
        checkpoint: 1,
        claimPostflight: 0,
        discardKey: 1,
        leaseCloseCalls: 1,
        coordinatorClose: 0,
        coordinatorAbort: 1,
      });
    },
  );

  it("rejects an absolute path smuggled into projected checkpoint metadata", async () => {
    const base = checkpointReceipt();
    const work = base.work as Readonly<Record<string, unknown>>;
    const hostileCheckpoint = {
      ...base,
      work: { ...work, sha256: ABSOLUTE_PATH_CANARY },
    };
    const fixture = makeFixture({
      checkpointReceiptOverride: hostileCheckpoint,
    });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(error).toMatchObject({
      phase: "receipt",
      checkpoint_may_have_persisted: true,
      retry_disposition: "checkpoint-reconciliation-required",
    });
    expect(String(error)).not.toContain(ABSOLUTE_PATH_CANARY);
    expect(JSON.stringify(error)).not.toContain(ABSOLUTE_PATH_CANARY);
  });

  it("rejects a function smuggled into projected run metadata", async () => {
    const hostileBinding = {
      ...runBinding(),
      stable_runtime_receipt_sha256:
        function executableCapabilityCanary(): never {
          throw new Error(FUNCTION_CANARY);
        },
    };
    const fixture = makeFixture({ runBindingOverride: hostileBinding });

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    );

    expect(error).toMatchObject({
      phase: "handoff",
      checkpoint_may_have_persisted: false,
      retry_disposition: "fresh-invocation-required",
    });
    expect(String(error)).not.toContain(FUNCTION_CANARY);
    expect(JSON.stringify(error)).not.toContain(FUNCTION_CANARY);
  });

  it("publishes no raw primary or cleanup cause on its public error", async () => {
    const rawPrimary = Object.assign(new Error("raw-primary-canary"), {
      secretBuffer: KEY_BYTES_CANARY,
      path: ABSOLUTE_PATH_CANARY,
      authorizationMac: AUTHORIZATION_MAC_CANARY,
    });
    const fixture = makeFixture({ faults: { checkpoint: rawPrimary } });

    const error = (await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      ),
    )) as Error;
    const descriptors = Object.getOwnPropertyDescriptors(error);
    const serialized = JSON.stringify(error);

    expect(error).toBeInstanceOf(FloodgateV7ProductionCheckpointConnectorError);
    expect(descriptors.cause).toBeUndefined();
    expect(descriptors.primary).toBeUndefined();
    expect(descriptors.cleanupFailures).toBeUndefined();
    expect(String(error)).not.toContain("raw-primary-canary");
    expect(serialized).not.toContain("raw-primary-canary");
    expect(serialized).not.toContain(ABSOLUTE_PATH_CANARY);
    expect(serialized).not.toContain(AUTHORIZATION_MAC_CANARY);
    expect(fixture.observedFailures[0]?.primary).toBe(rawPrimary);
  });

  it("defines public failure fields without invoking an Error prototype setter", async () => {
    const fixture = makeFixture({ actualKeyInstanceId: OTHER_KEY_INSTANCE_ID });
    const original = Object.getOwnPropertyDescriptor(Error.prototype, "phase");
    let setterCalls = 0;
    let error: unknown;

    try {
      Object.defineProperty(Error.prototype, "phase", {
        configurable: true,
        enumerable: false,
        set: () => {
          setterCalls += 1;
          throw new Error("Error.prototype.phase setter must not run");
        },
      });
      error = await rejectionOf(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests(
          fixture.options,
          fixture.dependencies,
        ),
      );
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(Error.prototype, "phase");
      } else {
        Object.defineProperty(Error.prototype, "phase", original);
      }
    }

    expect(setterCalls).toBe(0);
    expect(error).toBeInstanceOf(FloodgateV7ProductionCheckpointConnectorError);
    expect(error).toMatchObject({
      phase: "key-instance",
      retry_disposition: "operator-reconciliation-required",
    });
  });

  it("uses no live array iterator or Promise static during the full composition", async () => {
    const fixture = makeFixture();
    const settledVoid = new NativePromise<void>((resolve) => resolve());
    const ready = new NativePromise<
      Readonly<FloodgateV7DeploymentKeyReadinessReceipt>
    >((resolve) => resolve(readinessReceipt("ready")));
    const safeLease = {
      ...fixture.lease,
      close: (): Promise<void> => settledVoid,
    };
    const safeHandoff = {
      ...fixture.handoff,
      close: (): Promise<void> => settledVoid,
      abortAndDrain: (): Promise<void> => settledVoid,
    };
    const coordinatorStart = new NativePromise<unknown>((resolve) =>
      resolve(fixture.coordinator),
    );
    const stageStart = new NativePromise<unknown>((resolve) =>
      resolve(safeLease),
    );
    const authorization = new NativePromise<unknown>((resolve) =>
      resolve(fixture.authorization),
    );
    const checkpoint = new NativePromise<unknown>((resolve) =>
      resolve(fixture.checkpointReceipt),
    );
    const dependencies = {
      inspectKeyReadiness: () => ready,
      createCoordinator: () => coordinatorStart as Promise<never>,
      claimCoordinatorHandoff: () => safeHandoff as never,
      authorizeStage: () => stageStart as Promise<never>,
      prepareKey: () => authorization as Promise<never>,
      discardKey: () => undefined,
      consumeRowsAndPostflight: (
        _options: unknown,
        consume: (input: never) => Promise<void>,
      ): Promise<never> => {
        const callback = consume(fixture.input as never);
        return new NativePromise<never>((resolve, reject) => {
          nativeReflectApply(nativePromiseThen, callback, [
            () => resolve(fixture.postflightReceipt as never),
            reject,
          ]);
        });
      },
      claimPostflight: () => undefined,
      checkpoint: () => checkpoint as Promise<never>,
      observeFailureForTests: undefined,
    } satisfies FloodgateV7ProductionCheckpointConnectorCoreDependencies;
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    )!;
    const resolveDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      "resolve",
    )!;
    const rejectDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      "reject",
    )!;
    const allDescriptor = Object.getOwnPropertyDescriptor(Promise, "all")!;
    const allSettledDescriptor = Object.getOwnPropertyDescriptor(
      Promise,
      "allSettled",
    )!;
    let trapCalls = 0;
    const poison = (): never => {
      trapCalls += 1;
      throw new Error("a poisoned live iterator or Promise static was invoked");
    };
    let restored = false;
    const restore = (): void => {
      if (restored) return;
      restored = true;
      Object.defineProperty(
        Array.prototype,
        Symbol.iterator,
        iteratorDescriptor,
      );
      Object.defineProperty(Promise, "resolve", resolveDescriptor);
      Object.defineProperty(Promise, "reject", rejectDescriptor);
      Object.defineProperty(Promise, "all", allDescriptor);
      Object.defineProperty(Promise, "allSettled", allSettledDescriptor);
    };
    let receipt: unknown;
    let failure: unknown;
    let finish!: () => void;
    const observation = new NativePromise<void>((resolve) => {
      finish = resolve;
    });

    try {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        ...iteratorDescriptor,
        value: poison,
      });
      Object.defineProperty(Promise, "resolve", {
        ...resolveDescriptor,
        value: poison,
      });
      Object.defineProperty(Promise, "reject", {
        ...rejectDescriptor,
        value: poison,
      });
      Object.defineProperty(Promise, "all", {
        ...allDescriptor,
        value: poison,
      });
      Object.defineProperty(Promise, "allSettled", {
        ...allSettledDescriptor,
        value: poison,
      });
      const run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        dependencies,
      );
      nativeReflectApply(nativePromiseThen, run, [
        (value: unknown) => {
          receipt = value;
          restore();
          finish();
        },
        (reason: unknown) => {
          failure = reason;
          restore();
          finish();
        },
      ]);
      await observation;
    } finally {
      restore();
    }

    expect(trapCalls).toBe(0);
    expect(failure).toBeUndefined();
    expect(receipt).toMatchObject({
      status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
      lifecycle: { coordinator_closed: true },
    });
  });

  it("fails closed without invoking a nonconfigurable Promise constructor getter", async () => {
    const fixture = makeFixture();
    let getterCalls = 0;
    const hostileReadiness = Promise.resolve(readinessReceipt("ready"));
    Object.defineProperty(hostileReadiness, "constructor", {
      configurable: false,
      enumerable: false,
      get: () => {
        getterCalls += 1;
        throw new Error("hostile Promise constructor getter must not run");
      },
    });
    const dependencies = {
      ...fixture.dependencies,
      inspectKeyReadiness: () => {
        fixture.calls.readiness += 1;
        fixture.events.push("readiness");
        return hostileReadiness;
      },
    };

    const error = await rejectionOf(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        dependencies,
      ),
    );

    expect(getterCalls).toBe(0);
    expect(error).toMatchObject({
      phase: "readiness",
      readiness_status: "unsafe",
      checkpoint_may_have_persisted: false,
      cleanup_failure_count: 0,
      retry_disposition: "operator-reconciliation-required",
    });
    expect(fixture.calls).toMatchObject({
      readiness: 1,
      createCoordinator: 0,
      authorizeStage: 0,
      prepareKey: 0,
      consumer: 0,
      checkpoint: 0,
    });
  });

  it("rejects a bare nonconfigurable NativePromise constructor without consulting live species", async () => {
    const fixture = makeFixture();
    const oldPinnedReadiness = Promise.resolve(readinessReceipt("ready"));
    Object.defineProperty(oldPinnedReadiness, "constructor", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: NativePromise,
    });
    const poison = livePromiseConstructorPoison();
    const dependencies = {
      ...fixture.dependencies,
      inspectKeyReadiness: () => {
        fixture.calls.readiness += 1;
        fixture.events.push("readiness");
        poison.install();
        return oldPinnedReadiness;
      },
    };
    let run!: ReturnType<
      typeof runFloodgateV7ProductionCheckpointConnectorCoreForTests
    >;

    try {
      run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        dependencies,
      );
    } finally {
      poison.restore();
    }
    const error = await rejectionOf(run);

    expect(poison.trapCalls()).toBe(0);
    expect(error).toMatchObject({
      phase: "readiness",
      readiness_status: "unsafe",
      checkpoint_may_have_persisted: false,
      retry_disposition: "operator-reconciliation-required",
    });
    expect(fixture.calls.createCoordinator).toBe(0);
  });

  it("pins accepted readiness against live Promise species and prototype constructor poison", async () => {
    const fixture = makeFixture();
    const poison = livePromiseConstructorPoison();
    const ready = Promise.resolve(readinessReceipt("ready"));
    const dependencies = {
      ...fixture.dependencies,
      inspectKeyReadiness: () => {
        fixture.calls.readiness += 1;
        fixture.events.push("readiness");
        poison.install();
        return ready;
      },
    };
    let run!: ReturnType<
      typeof runFloodgateV7ProductionCheckpointConnectorCoreForTests
    >;

    try {
      run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        dependencies,
      );
    } finally {
      poison.restore();
    }

    await expect(run).resolves.toMatchObject({
      status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
      lifecycle: { coordinator_closed: true },
    });
    expect(poison.trapCalls()).toBe(0);
  });

  it("pins checkpoint callbacks against live Promise species and prototype constructor poison", async () => {
    const fixture = makeFixture();
    const poison = livePromiseConstructorPoison();
    const originalCheckpoint = fixture.dependencies.checkpoint;
    const originalConsumer = fixture.dependencies.consumeRowsAndPostflight;
    const checkpoint = ((...args: Parameters<typeof originalCheckpoint>) => {
      const result = originalCheckpoint(...args);
      poison.install();
      return result;
    }) as typeof originalCheckpoint;
    const consumeRowsAndPostflight = ((
      ...args: Parameters<typeof originalConsumer>
    ) => {
      try {
        return originalConsumer(...args);
      } finally {
        poison.restore();
      }
    }) as typeof originalConsumer;
    const dependencies = {
      ...fixture.dependencies,
      checkpoint,
      consumeRowsAndPostflight,
    };

    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        dependencies,
      ),
    ).resolves.toMatchObject({
      status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
      lifecycle: { checkpoint_settled_before_postflight: true },
    });
    expect(poison.trapCalls()).toBe(0);
  });

  it("does not consult Object.prototype for a missing key or descriptor value", async () => {
    const missingFixture = makeFixture();
    const accessorFixture = makeFixture();
    const missingOptions = {
      consumer: missingFixture.options.consumer,
      gate: missingFixture.options.gate,
      keyEnrollment: missingFixture.options.keyEnrollment,
      replacementRunId: RUN_ID,
      stageAuthorization: missingFixture.options.stageAuthorization,
    } as never;
    const accessorOptions = { ...accessorFixture.options } as Record<
      string,
      unknown
    >;
    let inputGetterCalls = 0;
    Object.defineProperty(accessorOptions, "runId", {
      configurable: true,
      enumerable: true,
      get: () => {
        inputGetterCalls += 1;
        throw new Error("input runId getter must not run");
      },
    });
    const originalRunId = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "runId",
    );
    const originalValue = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let missingKeyGetterCalls = 0;
    let descriptorValueGetterCalls = 0;
    let missingRun!: Promise<unknown>;
    let accessorRun!: Promise<unknown>;

    try {
      Object.defineProperty(Object.prototype, "runId", {
        configurable: true,
        enumerable: false,
        get: () => {
          missingKeyGetterCalls += 1;
          throw new Error("Object.prototype.runId getter must not run");
        },
      });
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        enumerable: false,
        get: () => {
          descriptorValueGetterCalls += 1;
          throw new Error("Object.prototype.value getter must not run");
        },
      });
      missingRun = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        missingOptions,
        missingFixture.dependencies,
      );
      accessorRun = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        accessorOptions as never,
        accessorFixture.dependencies,
      );
    } finally {
      if (originalRunId === undefined) {
        Reflect.deleteProperty(Object.prototype, "runId");
      } else {
        Object.defineProperty(Object.prototype, "runId", originalRunId);
      }
      if (originalValue === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", originalValue);
      }
    }

    await expect(missingRun).rejects.toMatchObject({
      phase: "capture",
      checkpoint_may_have_persisted: false,
      cleanup_failure_count: 0,
      retry_disposition: "fresh-invocation-required",
    });
    await expect(accessorRun).rejects.toMatchObject({ phase: "capture" });
    expect(missingKeyGetterCalls).toBe(0);
    expect(descriptorValueGetterCalls).toBe(0);
    expect(inputGetterCalls).toBe(0);
    expect(missingFixture.calls.readiness).toBe(0);
    expect(accessorFixture.calls.readiness).toBe(0);
  });

  it("captures engine arguments without consulting a poisoned live String constructor", async () => {
    const fixture = makeFixture();
    const stageAuthorization = {
      ...fixture.options.stageAuthorization,
      engineArgs: ["--connector-string-capture-canary"],
    };
    Object.defineProperty(fixture.options, "stageAuthorization", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: stageAuthorization,
    });
    const originalString = Object.getOwnPropertyDescriptor(
      globalThis,
      "String",
    );
    let poisonCalls = 0;
    let run!: ReturnType<
      typeof runFloodgateV7ProductionCheckpointConnectorCoreForTests
    >;

    try {
      Object.defineProperty(globalThis, "String", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: (): never => {
          poisonCalls += 1;
          throw new Error("live String constructor must not run");
        },
      });
      run = runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        fixture.options,
        fixture.dependencies,
      );
    } finally {
      if (originalString === undefined) {
        Reflect.deleteProperty(globalThis, "String");
      } else {
        Object.defineProperty(globalThis, "String", originalString);
      }
    }

    await expect(run).resolves.toMatchObject({
      status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
    });
    expect(poisonCalls).toBe(0);
    expect(fixture.stageAuthorizationArguments).toHaveLength(1);
    expect(fixture.stageAuthorizationArguments[0]).toMatchObject({
      engineArgs: ["--connector-string-capture-canary"],
    });
  });

  it("rejects arity, extra keys, Proxies, and accessors before authority calls", async () => {
    expect(runFloodgateV7ProductionCheckpointConnector.length).toBe(2);
    expect(runFloodgateV7ProductionCheckpointConnectorCoreForTests.length).toBe(
      2,
    );
    const fixture = makeFixture();

    await expect(
      Reflect.apply(
        runFloodgateV7ProductionCheckpointConnectorCoreForTests,
        undefined,
        [fixture.options],
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    await expect(
      Reflect.apply(runFloodgateV7ProductionCheckpointConnector, undefined, [
        fixture.options,
        fixture.dependencies,
      ]),
    ).rejects.toMatchObject({ phase: "capture" });
    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        { ...fixture.options, extra: true } as never,
        fixture.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(fixture.options, {
        ...fixture.dependencies,
        extra: true,
      } as never),
    ).rejects.toMatchObject({ phase: "capture" });

    let proxyTraps = 0;
    const proxy = new Proxy(fixture.options, {
      ownKeys: () => {
        proxyTraps += 1;
        throw new Error("proxy trap must not run");
      },
    });
    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        proxy,
        fixture.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    expect(proxyTraps).toBe(0);

    let getterCalls = 0;
    const accessor = { ...fixture.options } as Record<string, unknown>;
    Object.defineProperty(accessor, "runId", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return RUN_ID;
      },
    });
    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        accessor as never,
        fixture.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    expect(getterCalls).toBe(0);
    expect(fixture.calls.readiness).toBe(0);
  });

  it("rejects a test-only enrollment capability at the production entry before readiness", async () => {
    const fixture = makeFixture();

    await expect(
      runFloodgateV7ProductionCheckpointConnector(
        fixture.options,
        undefined as never,
      ),
    ).rejects.toMatchObject({
      phase: "capture",
      retry_disposition: "fresh-invocation-required",
    });
    expect(fixture.calls.readiness).toBe(0);
  });

  it("rejects a cloned enrollment capability and consumes an authentic one once", async () => {
    const cloneFixture = makeFixture();
    const clonedOptions = {
      ...cloneFixture.options,
      keyEnrollment: { ...cloneFixture.options.keyEnrollment },
    } as FloodgateV7ProductionCheckpointConnectorOptions;

    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        clonedOptions,
        cloneFixture.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "enrollment" });
    expect(cloneFixture.calls.readiness).toBe(0);

    const singleUseFixture = makeFixture();
    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        singleUseFixture.options,
        singleUseFixture.dependencies,
      ),
    ).resolves.toMatchObject({
      status: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_STATUS,
    });
    const callsAfterSuccess = { ...singleUseFixture.calls };
    await expect(
      runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        singleUseFixture.options,
        singleUseFixture.dependencies,
      ),
    ).rejects.toMatchObject({ phase: "enrollment" });
    expect(singleUseFixture.calls).toEqual(callsAfterSuccess);
  });

  it("imports only the capability owners required for the production composition", () => {
    const source = fs.readFileSync(CONNECTOR_SOURCE_PATH, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    );

    expect(imports).toEqual([
      "node:util",
      "./floodgate-v7-approved-key-enrollment",
      "./floodgate-v7-deployment-key-authority",
      "./floodgate-v7-deployment-key-readiness",
      "./floodgate-teacher-stage-authorization",
      "./floodgate-training-row-consumer",
      "./floodgate-v7-production-parent-coordinator",
      "./floodgate-v7-teacher-checkpoint",
      "./floodgate-v7-production-outer-gate-lease",
    ]);
    expect(source).not.toMatch(
      /from ["']node:(?:fs|path|crypto|child_process)["']/,
    );
    expect(source).not.toMatch(/\bconsole\.(?:log|info|warn|error)\b/);
  });
});
