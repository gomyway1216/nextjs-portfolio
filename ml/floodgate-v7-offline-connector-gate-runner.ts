/**
 * Deterministic, test-only composition of all three Floodgate v7 connector
 * gates. This module intentionally has no production capability, filesystem,
 * network, child-process, dataset, training, or live-activation boundary.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
  createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests,
  type FloodgateV7ApprovedKeyEnrollmentCapability,
  type FloodgateV7ApprovedKeyEnrollmentRecord,
} from "./floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
} from "./floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
} from "./floodgate-v7-deployment-key-instance-enrollment";
import {
  FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
  runFloodgateV7ProductionCheckpointConnectorCoreForTests,
  type FloodgateV7ProductionCheckpointConnectorCoreDependencies,
  type FloodgateV7ProductionCheckpointConnectorOptions,
  type FloodgateV7ProductionCheckpointConnectorReceipt,
} from "./floodgate-v7-production-checkpoint-connector";

export const FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_SCHEMA =
  "shogi-floodgate-v7-offline-connector-gate-contract-composition-v1" as const;
export const FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS =
  "complete-fixed-in-memory-three-gate-test-only-contract-composition" as const;
export const FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_CLAIM_BOUNDARY =
  "fixed-in-memory-test-only-approved-enrollment-and-connector-core-contract-composition-for-100-500-24000-gates-with-closed-synthetic-lifecycles-and-pathless-summaries-not-production-filesystem-continuity-dataset-training-live-or-strength-evidence" as const;
export const FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_TRUST_BOUNDARY =
  "trusted-current-process-js-realm-captured-intrinsics-and-imported-test-only-core-seams-with-fixed-synthetic-metadata-v1" as const;
export const FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_EXECUTION_BOUNDARY =
  "test-only-fixed-in-memory-no-production-capability-composition" as const;

type OfflineGate =
  "durable-prefix-100" | "durable-prefix-500" | "sealed-final-24000";

interface SyntheticLifecycleCalls {
  readonly readiness: 1;
  readonly create_coordinator: 1;
  readonly authorize_stage: 1;
  readonly claim_handoff: 1;
  readonly prepare_key: 1;
  readonly consume_rows: 1;
  readonly checkpoint: 1;
  readonly claim_postflight: 1;
  readonly discard_key: 1;
  readonly lease_close: 1;
  readonly coordinator_close: 1;
  readonly coordinator_abort: 0;
  readonly failure_observer: 0;
}

interface OfflineGateSummary {
  readonly order: 1 | 2 | 3;
  readonly gate: OfflineGate;
  readonly checkpoint_receipt_fixture: Readonly<{
    readonly target_parents: 100 | 500 | 24_000;
    readonly completed_parents: 100 | 500 | 24_000;
    readonly resumed_parents: 0 | 100 | 500;
    readonly records: 102 | 503 | 24_004;
    readonly bytes: 1_791_893 | 8_948_379 | 429_247_143;
    readonly sealed: boolean;
  }>;
  readonly connector_receipt: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>;
  readonly synthetic_lifecycle_calls: Readonly<SyntheticLifecycleCalls>;
}

export interface FloodgateV7OfflineConnectorGateRunnerReceipt {
  readonly schema: typeof FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_SCHEMA;
  readonly status: typeof FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_TRUST_BOUNDARY;
  readonly execution_boundary: typeof FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_EXECUTION_BOUNDARY;
  readonly connector: Readonly<{
    readonly contract: typeof FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT;
    readonly execution_boundary: "test-only-injected-capability-composition";
    readonly production_origins: Readonly<{
      readonly approved_enrollment: false;
      readonly coordinator: false;
      readonly stage: false;
      readonly key: false;
      readonly input: false;
      readonly checkpoint: false;
    }>;
  }>;
  readonly synthetic_fixture: Readonly<{
    readonly classification: "deterministic-test-only-fixture-not-production-evidence";
    readonly dynamic_identifiers_are_synthetic: true;
    readonly run_id: string;
    readonly key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
    readonly key_instance_id: string;
    readonly approved_enrollment: Readonly<{
      readonly capability_origin: "test-only-synthetic-factory";
      readonly execution_boundary: "test-only-injected-current-euid-home-control-plane-record";
      readonly actual_control_plane_approval: false;
      readonly actual_record_file_reads: 0;
    }>;
    readonly input: Readonly<{
      readonly schema: "shogi-authenticated-floodgate-training-rows-v1";
      readonly role: "training";
      readonly verifier_revision: string;
      readonly raw_format: "shogi-floodgate-label-free-raw-parent-jsonl-v1";
      readonly records: 24_000;
      readonly games: 240;
      readonly position_ids_count: 24_000;
    }>;
  }>;
  readonly gates: readonly [
    Readonly<OfflineGateSummary>,
    Readonly<OfflineGateSummary>,
    Readonly<OfflineGateSummary>,
  ];
  readonly cross_gate: Readonly<{
    readonly gate_order_exact: true;
    readonly run_id_metadata_equal: true;
    readonly run_binding_metadata_equal: true;
    readonly input_binding_metadata_equal: true;
    readonly synthetic_key_instance_metadata_equal: true;
    readonly cleanup_completed_before_next_gate: true;
    readonly fresh_enrollment_capability_per_gate: true;
    readonly durable_work_file_shared: false;
    readonly filesystem_continuity_observed: false;
    readonly actual_resume_observed: false;
  }>;
  readonly operation_counts: Readonly<{
    readonly synthetic_enrollment_capabilities_created: 3;
    readonly test_only_connector_compositions: Readonly<{
      readonly durable_prefix_100: 1;
      readonly durable_prefix_500: 1;
      readonly sealed_final_24000: 1;
    }>;
    readonly production_enrollment_loads: 0;
    readonly production_connector_invocations: Readonly<{
      readonly durable_prefix_100: 0;
      readonly durable_prefix_500: 0;
      readonly sealed_final_24000: 0;
    }>;
    readonly actual_home_approved_record_opens: 0;
    readonly deployment_key_file_opens: 0;
    readonly deployment_key_bytes_read: 0;
    readonly dataset_file_opens: 0;
    readonly checkpoint_artifact_reads: 0;
    readonly checkpoint_artifact_writes: 0;
    readonly network_requests: 0;
    readonly child_processes: 0;
    readonly module_source_loading_excluded_from_application_data_io_counts: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly production_approval: false;
    readonly production_gate_authorization: false;
    readonly production_checkpoint: false;
    readonly actual_key_or_control_plane_record_access: false;
    readonly filesystem_durability_or_resume: false;
    readonly dataset_read: false;
    readonly teacher_label: false;
    readonly optimizer_training: false;
    readonly weights_changed: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength_established: false;
    readonly stable_high_dan_established: false;
  }>;
}

interface MutableSyntheticLifecycleCalls {
  readiness: number;
  createCoordinator: number;
  authorizeStage: number;
  claimHandoff: number;
  prepareKey: number;
  consumeRows: number;
  checkpoint: number;
  claimPostflight: number;
  discardKey: number;
  leaseClose: number;
  coordinatorClose: number;
  coordinatorAbort: number;
  failureObserver: number;
}

interface GateFixture {
  readonly order: 1 | 2 | 3;
  readonly gate: OfflineGate;
  readonly targetParents: 100 | 500 | 24_000;
  readonly resumedParents: 0 | 100 | 500;
  readonly records: 102 | 503 | 24_004;
  readonly bytes: 1_791_893 | 8_948_379 | 429_247_143;
  readonly sealed: boolean;
  readonly status:
    | "complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published"
    | "complete-authenticated-private-v7-teacher-parent-checkpoint-not-published";
}

const NativeError = Error;
const NativePromise = Promise;
const nativePromiseThen = Promise.prototype.then;
const nativeReflectApply = Reflect.apply;
const nativeCreateHash = createHash;
const nativeHashDigest = nativeCreateHash("sha256").digest;
const nativeHashUpdate = nativeCreateHash("sha256").update;
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const jsonStringify = JSON.stringify;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectHasOwn = Object.hasOwn;
const reflectOwnKeys = Reflect.ownKeys;

const RUN_ID = "12".repeat(32);
const KEY_INSTANCE_ID = "34".repeat(32);
const APPROVAL_ID = "ab".repeat(32);
const APPROVED_AT_UTC = "2000-01-01T00:00:00.000Z";
const OWNER_UID = 4_242;
const PARENT_IDENTITY = frozenRecord({ dev: "1", ino: "20" });
const KEY_IDENTITY = frozenRecord({ dev: "1", ino: "21" });
const VERIFIER_REVISION = "7".repeat(40);
const SYNTHETIC_PATH_ROOT = "/offline-floodgate-v7-contract-fixture";
const CONNECTOR_EXECUTION_BOUNDARY =
  "test-only-injected-capability-composition" as const;

function descriptorAt(
  descriptors: Record<PropertyKey, PropertyDescriptor>,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  if (!objectHasOwn(descriptors, key)) return undefined;
  const entry = objectGetOwnPropertyDescriptor(descriptors, key);
  if (entry === undefined || !objectHasOwn(entry, "value")) {
    throw new NativeError("offline runner descriptor map is invalid");
  }
  return entry.value as PropertyDescriptor;
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptorAt(descriptors, key);
    if (descriptor === undefined || !objectHasOwn(descriptor, "value")) {
      throw new NativeError("offline runner records require data properties");
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: descriptor.enumerable,
      writable: false,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function append<T>(values: T[], value: T): void {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function frozenArray<T>(values: readonly T[]): readonly T[] {
  const output: T[] = [];
  for (let index = 0; index < values.length; index += 1) {
    append(output, values[index]);
  }
  return objectFreeze(output);
}

function resolved<T>(value: T): Promise<T> {
  return new NativePromise<T>((resolve) => resolve(value));
}

function rejected<T>(reason: unknown): Promise<T> {
  return new NativePromise<T>((_resolve, reject) => reject(reason));
}

function sha256(value: string): string {
  const hash = nativeCreateHash("sha256");
  nativeReflectApply(nativeHashUpdate, hash, [value, "utf8"]);
  return nativeReflectApply(nativeHashDigest, hash, ["hex"]) as string;
}

function canonicalReceiptIdentity(value: unknown): Readonly<{
  readonly bytes: number;
  readonly sha256: string;
}> {
  const serialized = `${jsonStringify(value)}\n`;
  return frozenRecord({
    bytes: bufferByteLength(serialized, "utf8"),
    sha256: sha256(serialized),
  });
}

const GATE_FIXTURES = objectFreeze([
  frozenRecord({
    order: 1 as const,
    gate: "durable-prefix-100" as const,
    targetParents: 100 as const,
    resumedParents: 0 as const,
    records: 102 as const,
    bytes: 1_791_893 as const,
    sealed: false,
    status:
      "complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published" as const,
  }),
  frozenRecord({
    order: 2 as const,
    gate: "durable-prefix-500" as const,
    targetParents: 500 as const,
    resumedParents: 100 as const,
    records: 503 as const,
    bytes: 8_948_379 as const,
    sealed: false,
    status:
      "complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published" as const,
  }),
  frozenRecord({
    order: 3 as const,
    gate: "sealed-final-24000" as const,
    targetParents: 24_000 as const,
    resumedParents: 500 as const,
    records: 24_004 as const,
    bytes: 429_247_143 as const,
    sealed: true,
    status:
      "complete-authenticated-private-v7-teacher-parent-checkpoint-not-published" as const,
  }),
] as const satisfies readonly GateFixture[]);

const RUN_BINDING = frozenRecord({
  schema: "shogi-floodgate-v7-teacher-run-binding-v2",
  plan: frozenRecord({
    bytes: 10_890,
    sha256: "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af",
  }),
  producer_control: frozenRecord({
    schema: "shogi-floodgate-v7-teacher-producer-control-v2",
    parent_deadline_ms: 1_800_000,
    abort_drain_ms: 30_000,
    max_in_flight: 12,
    cancel_policy:
      "first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2",
    late_settlement_policy:
      "observe-from-start-consume-after-terminal-without-validation-or-append-v2",
  }),
  stable_runtime_receipt_sha256: "0a".repeat(32),
  teacher_usi_runtime_receipt_sha256: "0b".repeat(32),
});

const INPUT_BINDING = frozenRecord({
  result_receipt_bytes: 7_202,
  result_receipt_sha256: "01".repeat(32),
  bundle_manifest_bytes: 7_202,
  bundle_manifest_sha256: "02".repeat(32),
  bundle_producer_revision: "3".repeat(40),
  verifier_revision: VERIFIER_REVISION,
  raw_format: "shogi-floodgate-label-free-raw-parent-jsonl-v1" as const,
  raw_bytes: 15_369_952,
  raw_sha256: "04".repeat(32),
  records: 24_000 as const,
  games: 240 as const,
  game_ids_sha256: "05".repeat(32),
  parent_ids_sha256: "06".repeat(32),
  position_ids_count: 24_000 as const,
  position_ids_sha256: "08".repeat(32),
});

const SYNTHETIC_INPUT = frozenRecord({
  schema: "shogi-authenticated-floodgate-training-rows-v1" as const,
  role: "training" as const,
  binding: INPUT_BINDING,
  rows: frozenArray([
    frozenRecord({
      schema_version: 1 as const,
      game_id: `sha256:${"11".repeat(32)}`,
      parent_id: `sha256:${"22".repeat(32)}`,
      position_id: `sha256:${"33".repeat(32)}`,
      parent_sfen:
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
      ply: 0,
      played_move: "7g7f",
    }),
  ]),
});

const POSTFLIGHT_RECEIPT = frozenRecord({
  schema: "shogi-authenticated-floodgate-training-postflight-v1",
  status: "verified-runtime-input-claim-postflight-and-descriptors-closed",
  claim_boundary:
    "consumer-input-and-lifecycle-binding-only-not-staged-output-teacher-label-or-playing-strength-evidence",
  execution_boundary: "test-only-injected-bundle-verifier",
  input: frozenRecord({
    schema: "shogi-authenticated-floodgate-training-rows-v1",
    role: "training",
    binding: INPUT_BINDING,
  }),
  runtime_claim:
    "exact-input-single-use-claimed-during-synchronous-callback-invocation",
  postflight: frozenRecord({
    callback_settled_without_value: true,
    filesystem_snapshot_revalidated_after_callback: true,
    input_descriptors_closed: true,
  }),
});

function createSyntheticEnrollmentCapability(): Readonly<FloodgateV7ApprovedKeyEnrollmentCapability> {
  const keyDeployment = frozenRecord({
    layout: "fixed-current-euid-userinfo-home-v1" as const,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    owner_uid: OWNER_UID,
    parent_identity: PARENT_IDENTITY,
    key_identity: KEY_IDENTITY,
    key_instance_id: KEY_INSTANCE_ID,
    key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
  });
  const candidate = frozenRecord({
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    claim_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-key-instance-inspection" as const,
    algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    key_deployment: frozenRecord({
      layout: keyDeployment.layout,
      key_id: keyDeployment.key_id,
      owner_uid: keyDeployment.owner_uid,
      parent_mode: "0700" as const,
      key_mode: "0600" as const,
      key_bytes: 32 as const,
      key_nlink: 1 as const,
      parent_identity: keyDeployment.parent_identity,
      key_identity: keyDeployment.key_identity,
      key_instance_id: keyDeployment.key_instance_id,
      key_instance_algorithm: keyDeployment.key_instance_algorithm,
      held_descriptors_revalidated: true as const,
    }),
    test_boundary: frozenRecord({
      production_home_origin: false as const,
      production_home_alias_rejected: true as const,
      current_effective_uid_required: true as const,
      test_hook_may_observe_key_copy: true as const,
    }),
    nonclaims: frozenRecord({
      key_created_or_written: false as const,
      key_material_disclosed: false as const,
      root_key_hash_disclosed: false as const,
      key_path_disclosed: false as const,
      authorization_mac: false as const,
      run_authorization: false as const,
      stage_authorization: false as const,
      checkpoint_key_capability: false as const,
      control_plane_approval: false as const,
      record_persisted: false as const,
      connector_execution: false as const,
      checkpoint: false as const,
      runtime: false as const,
      dataset_read: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      playing_strength: false as const,
    }),
  });
  const canonicalJson = `${jsonStringify(candidate)}\n`;
  const record: FloodgateV7ApprovedKeyEnrollmentRecord = frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    approval: frozenRecord({
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: APPROVAL_ID,
      approved_at_utc: APPROVED_AT_UTC,
      candidate_receipt: frozenRecord({
        bytes: bufferByteLength(canonicalJson, "utf8"),
        sha256: sha256(canonicalJson),
        canonical_json: canonicalJson,
      }),
    }),
    key_deployment: keyDeployment,
    nonclaims: frozenRecord({
      key_material: false as const,
      key_path: false as const,
      root_key_hash: false as const,
      approval_signature_or_mac: false as const,
      run_authorization: false as const,
      gate_authorization: false as const,
      checkpoint: false as const,
      runtime: false as const,
      dataset_read: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
  return createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(record);
}

function connectorOptions(
  gate: OfflineGate,
  keyEnrollment: Readonly<FloodgateV7ApprovedKeyEnrollmentCapability>,
): Readonly<FloodgateV7ProductionCheckpointConnectorOptions> {
  const repositoryRoot = `${SYNTHETIC_PATH_ROOT}/repository`;
  const rawLockRoot = `${SYNTHETIC_PATH_ROOT}/raw-lock`;
  const roleLockRoot = `${SYNTHETIC_PATH_ROOT}/role-lock`;
  const roleBundleRoot = `${SYNTHETIC_PATH_ROOT}/role-bundle`;
  const protectedIds = `${repositoryRoot}/ml/protocols/wcsc36-policy-exposed-parent-ids.txt`;
  return frozenRecord({
    runId: RUN_ID,
    gate,
    keyEnrollment,
    stageAuthorization: frozenRecord({
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      legacyProtectedPositionIdsPath: protectedIds,
      publicationParent: `${SYNTHETIC_PATH_ROOT}/publication`,
      stageBasename: `floodgate-v7-${RUN_ID}-stage`,
      destinationBasename: `floodgate-v7-${RUN_ID}-final`,
      engineBin: `${SYNTHETIC_PATH_ROOT}/assets/engine/yaneuraou`,
      engineReceipt: `${SYNTHETIC_PATH_ROOT}/assets/engine/receipt.json`,
      engineArgs: frozenArray([]),
      evalDir: `${SYNTHETIC_PATH_ROOT}/assets/eval`,
    }),
    consumer: frozenRecord({
      repositoryRoot,
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot,
      roleLockRoot,
      legacyProtectedPositionIdsPath: protectedIds,
      outputRoot: roleBundleRoot,
    }),
  });
}

function checkpointReceipt(
  fixture: Readonly<GateFixture>,
): Readonly<Record<string, unknown>> {
  return frozenRecord({
    contract: "shogi-floodgate-v7-teacher-work-v3",
    status: fixture.status,
    claim_boundary:
      "fixed-100-500-24000-gates-full-authenticated-input-domain-separated-milestone-chain-prefix-not-sealed-final-sealed-accepted-parent-exactly-once-search-at-least-once-authenticated-bounded-producer-control-trusted-controller-test-hooks-and-current-js-realm-intrinsics-returned-evidence-adversarial-reverified-hmac-persisted-byte-tamper-evidence-for-non-key-holders-only-not-anti-rollback-hostile-same-process-mutation-production-origin-label-holdout-or-playing-strength-evidence",
    algorithm: "hmac-sha256-hkdf-sha256-v7-parent-gated-milestone-chain-v3",
    run_id: RUN_ID,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    gate: fixture.gate,
    gate_contract: frozenRecord({
      schema: "shogi-floodgate-v7-teacher-gate-contract-v1",
      durable_prefix_100_parents: 100 as const,
      durable_prefix_500_parents: 500 as const,
      sealed_final_parents: 24_000 as const,
    }),
    sealed: fixture.sealed,
    work: frozenRecord({
      format: "canonical-jsonl-utf8-single-final-lf-v3",
      training_parents: 24_000,
      records: fixture.records,
      bytes: fixture.bytes,
      sha256: "0c".repeat(32),
      target_parents: fixture.targetParents,
      completed_parents: fixture.targetParents,
      resumed_parents: fixture.resumedParents,
      durability:
        "append-parent-and-milestone-line-fsync-seal-directory-sync-final-reopen-v3",
    }),
  });
}

function newLifecycleCalls(): MutableSyntheticLifecycleCalls {
  return {
    readiness: 0,
    createCoordinator: 0,
    authorizeStage: 0,
    claimHandoff: 0,
    prepareKey: 0,
    consumeRows: 0,
    checkpoint: 0,
    claimPostflight: 0,
    discardKey: 0,
    leaseClose: 0,
    coordinatorClose: 0,
    coordinatorAbort: 0,
    failureObserver: 0,
  };
}

function connectorDependencies(
  fixture: Readonly<GateFixture>,
  calls: MutableSyntheticLifecycleCalls,
): FloodgateV7ProductionCheckpointConnectorCoreDependencies {
  const checkpoint = checkpointReceipt(fixture);
  const authorization = frozenRecord({
    authorization: frozenRecord({
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      key_deployment: frozenRecord({
        layout: "fixed-current-euid-userinfo-home-v1",
        owner_uid: OWNER_UID,
        parent_identity: PARENT_IDENTITY,
        key_identity: KEY_IDENTITY,
        key_instance_id: KEY_INSTANCE_ID,
        key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
      }),
    }),
  });
  const produce = objectFreeze(
    function syntheticProduceMustNotRun(): Promise<never> {
      return rejected(
        new NativeError("synthetic producer must not be invoked"),
      );
    },
  );
  const closeCoordinator = objectFreeze(
    function closeCoordinator(): Promise<void> {
      calls.coordinatorClose += 1;
      return resolved(undefined);
    },
  );
  const abortCoordinator = objectFreeze(
    function abortCoordinator(): Promise<void> {
      calls.coordinatorAbort += 1;
      return resolved(undefined);
    },
  );
  const coordinator = frozenRecord({
    close: closeCoordinator,
    abortAndDrain: abortCoordinator,
  });
  const handoff = frozenRecord({
    produce,
    abortAndDrain: abortCoordinator,
    close: closeCoordinator,
    runBinding: RUN_BINDING,
  });
  const closeLease = objectFreeze(function closeLease(): Promise<void> {
    calls.leaseClose += 1;
    return resolved(undefined);
  });
  const lease = frozenRecord({
    receipt: frozenRecord({ synthetic_test_only_stage_receipt: true }),
    close: closeLease,
  });

  return frozenRecord({
    inspectKeyReadiness: objectFreeze(function inspectKeyReadiness() {
      calls.readiness += 1;
      return resolved(frozenRecord({ status: "ready" as const }));
    }),
    createCoordinator: objectFreeze(function createCoordinator() {
      calls.createCoordinator += 1;
      return resolved(coordinator);
    }),
    claimCoordinatorHandoff: objectFreeze(function claimCoordinatorHandoff(
      value: unknown,
    ) {
      calls.claimHandoff += 1;
      if (value !== coordinator) {
        throw new NativeError("synthetic coordinator identity changed");
      }
      return handoff;
    }),
    authorizeStage: objectFreeze(function authorizeStage() {
      calls.authorizeStage += 1;
      return resolved(lease);
    }),
    prepareKey: objectFreeze(function prepareKey() {
      calls.prepareKey += 1;
      return resolved(authorization);
    }),
    discardKey: objectFreeze(function discardKey(value: unknown): void {
      calls.discardKey += 1;
      if (value !== authorization) {
        throw new NativeError("synthetic key authorization identity changed");
      }
    }),
    consumeRowsAndPostflight: objectFreeze(function consumeRowsAndPostflight(
      _options: unknown,
      consume: (input: unknown) => Promise<void>,
    ): Promise<unknown> {
      calls.consumeRows += 1;
      let callback: Promise<void>;
      try {
        callback = consume(SYNTHETIC_INPUT);
      } catch (error) {
        return rejected(error);
      }
      return new NativePromise((resolve, reject) => {
        try {
          nativeReflectApply(nativePromiseThen, callback, [
            () => resolve(POSTFLIGHT_RECEIPT),
            reject,
          ]);
        } catch (error) {
          reject(error);
        }
      });
    }),
    claimPostflight: objectFreeze(function claimPostflight(
      value: unknown,
    ): void {
      calls.claimPostflight += 1;
      if (value !== POSTFLIGHT_RECEIPT) {
        throw new NativeError("synthetic postflight receipt identity changed");
      }
    }),
    checkpoint: objectFreeze(function runCheckpoint(
      _lease: unknown,
      _input: unknown,
      _runBinding: unknown,
      _controller: unknown,
      options: unknown,
      value: unknown,
    ): Promise<unknown> {
      calls.checkpoint += 1;
      if (value !== authorization) {
        return rejected(
          new NativeError("synthetic checkpoint key identity changed"),
        );
      }
      const gate = (options as Readonly<{ readonly gate?: unknown }>).gate;
      if (gate !== fixture.gate) {
        return rejected(new NativeError("synthetic checkpoint gate changed"));
      }
      return resolved(checkpoint);
    }),
    observeFailureForTests: objectFreeze(
      function observeFailureForTests(): void {
        calls.failureObserver += 1;
      },
    ),
  }) as unknown as FloodgateV7ProductionCheckpointConnectorCoreDependencies;
}

function fixedLifecycleSnapshot(
  calls: Readonly<MutableSyntheticLifecycleCalls>,
): Readonly<SyntheticLifecycleCalls> {
  if (
    calls.readiness !== 1 ||
    calls.createCoordinator !== 1 ||
    calls.authorizeStage !== 1 ||
    calls.claimHandoff !== 1 ||
    calls.prepareKey !== 1 ||
    calls.consumeRows !== 1 ||
    calls.checkpoint !== 1 ||
    calls.claimPostflight !== 1 ||
    calls.discardKey !== 1 ||
    calls.leaseClose !== 1 ||
    calls.coordinatorClose !== 1 ||
    calls.coordinatorAbort !== 0 ||
    calls.failureObserver !== 0
  ) {
    throw new NativeError("synthetic connector lifecycle count changed");
  }
  return frozenRecord({
    readiness: 1 as const,
    create_coordinator: 1 as const,
    authorize_stage: 1 as const,
    claim_handoff: 1 as const,
    prepare_key: 1 as const,
    consume_rows: 1 as const,
    checkpoint: 1 as const,
    claim_postflight: 1 as const,
    discard_key: 1 as const,
    lease_close: 1 as const,
    coordinator_close: 1 as const,
    coordinator_abort: 0 as const,
    failure_observer: 0 as const,
  });
}

function validateConnectorReceipt(
  receipt: Readonly<
    FloodgateV7ProductionCheckpointConnectorReceipt<"test-only-injected-capability-composition">
  >,
  fixture: Readonly<GateFixture>,
): void {
  const boundary = receipt.test_boundary;
  if (
    receipt.contract !==
      FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT ||
    receipt.execution_boundary !== CONNECTOR_EXECUTION_BOUNDARY ||
    receipt.run_id !== RUN_ID ||
    receipt.gate !== fixture.gate ||
    receipt.key_id !== FLOODGATE_V7_DEPLOYMENT_KEY_ID ||
    receipt.key_instance_id !== KEY_INSTANCE_ID ||
    boundary === null ||
    boundary.production_coordinator_origin !== false ||
    boundary.production_stage_origin !== false ||
    boundary.production_key_origin !== false ||
    boundary.production_input_origin !== false ||
    boundary.production_checkpoint_origin !== false ||
    receipt.approved_key_enrollment.execution_boundary !==
      "test-only-injected-current-euid-home-control-plane-record" ||
    receipt.approved_key_enrollment.approval.method !==
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD ||
    receipt.approved_key_enrollment.approval.approval_id !== APPROVAL_ID ||
    receipt.approved_key_enrollment.deployment_identity.owner_uid !==
      OWNER_UID ||
    receipt.approved_key_enrollment.deployment_identity.parent_dev !==
      PARENT_IDENTITY.dev ||
    receipt.approved_key_enrollment.deployment_identity.parent_ino !==
      PARENT_IDENTITY.ino ||
    receipt.approved_key_enrollment.deployment_identity.key_dev !==
      KEY_IDENTITY.dev ||
    receipt.approved_key_enrollment.deployment_identity.key_ino !==
      KEY_IDENTITY.ino ||
    receipt.input_binding.verifier_revision !== VERIFIER_REVISION ||
    receipt.input_binding.records !== INPUT_BINDING.records ||
    receipt.input_binding.games !== INPUT_BINDING.games ||
    receipt.input_binding.position_ids_count !==
      INPUT_BINDING.position_ids_count ||
    receipt.checkpoint.work.target_parents !== fixture.targetParents ||
    receipt.checkpoint.work.completed_parents !== fixture.targetParents ||
    receipt.checkpoint.work.resumed_parents !== fixture.resumedParents ||
    receipt.checkpoint.work.records !== fixture.records ||
    receipt.checkpoint.work.bytes !== fixture.bytes ||
    receipt.checkpoint.sealed !== fixture.sealed ||
    receipt.lifecycle.key_cleanup_settled !== true ||
    receipt.lifecycle.lease_close_joined !== true ||
    receipt.lifecycle.coordinator_closed !== true ||
    receipt.nonclaims.key_bytes_or_key_hash !== false ||
    receipt.nonclaims.absolute_or_caller_path !== false ||
    receipt.nonclaims.teacher_label !== false ||
    receipt.nonclaims.optimizer_training !== false ||
    receipt.nonclaims.weight !== false ||
    receipt.nonclaims.live_evaluation_activation !== false ||
    receipt.nonclaims.match !== false ||
    receipt.nonclaims.playing_strength !== false
  ) {
    throw new NativeError("synthetic connector receipt changed");
  }
}

function gateSummary(
  fixture: Readonly<GateFixture>,
  receipt: Readonly<
    FloodgateV7ProductionCheckpointConnectorReceipt<"test-only-injected-capability-composition">
  >,
  calls: Readonly<MutableSyntheticLifecycleCalls>,
): Readonly<OfflineGateSummary> {
  validateConnectorReceipt(receipt, fixture);
  return frozenRecord({
    order: fixture.order,
    gate: fixture.gate,
    checkpoint_receipt_fixture: frozenRecord({
      target_parents: fixture.targetParents,
      completed_parents: fixture.targetParents,
      resumed_parents: fixture.resumedParents,
      records: fixture.records,
      bytes: fixture.bytes,
      sealed: fixture.sealed,
    }),
    connector_receipt: canonicalReceiptIdentity(receipt),
    synthetic_lifecycle_calls: fixedLifecycleSnapshot(calls),
  });
}

/**
 * Run the fixed 100 -> 500 -> 24,000 test-only contract composition. Each
 * connector invocation must settle and close before the next capability is
 * created. A failed gate therefore prevents every later gate from starting.
 */
export async function runFloodgateV7OfflineConnectorGateContractComposition(): Promise<
  Readonly<FloodgateV7OfflineConnectorGateRunnerReceipt>
> {
  if (arguments.length !== 0) {
    throw new NativeError("offline connector gate runner accepts no arguments");
  }
  const summaries: Readonly<OfflineGateSummary>[] = [];
  for (let index = 0; index < GATE_FIXTURES.length; index += 1) {
    const fixture = GATE_FIXTURES[index];
    const capability = createSyntheticEnrollmentCapability();
    const calls = newLifecycleCalls();
    const receipt =
      await runFloodgateV7ProductionCheckpointConnectorCoreForTests(
        connectorOptions(fixture.gate, capability),
        connectorDependencies(fixture, calls),
      );
    append(summaries, gateSummary(fixture, receipt, calls));
  }
  const gates = frozenArray(summaries) as readonly [
    Readonly<OfflineGateSummary>,
    Readonly<OfflineGateSummary>,
    Readonly<OfflineGateSummary>,
  ];
  return frozenRecord({
    schema: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_SCHEMA,
    status: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_STATUS,
    claim_boundary: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_TRUST_BOUNDARY,
    execution_boundary:
      FLOODGATE_V7_OFFLINE_CONNECTOR_GATE_RUNNER_EXECUTION_BOUNDARY,
    connector: frozenRecord({
      contract: FLOODGATE_V7_PRODUCTION_CHECKPOINT_CONNECTOR_CONTRACT,
      execution_boundary: CONNECTOR_EXECUTION_BOUNDARY,
      production_origins: frozenRecord({
        approved_enrollment: false as const,
        coordinator: false as const,
        stage: false as const,
        key: false as const,
        input: false as const,
        checkpoint: false as const,
      }),
    }),
    synthetic_fixture: frozenRecord({
      classification:
        "deterministic-test-only-fixture-not-production-evidence" as const,
      dynamic_identifiers_are_synthetic: true as const,
      run_id: RUN_ID,
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      key_instance_id: KEY_INSTANCE_ID,
      approved_enrollment: frozenRecord({
        capability_origin: "test-only-synthetic-factory" as const,
        execution_boundary:
          "test-only-injected-current-euid-home-control-plane-record" as const,
        actual_control_plane_approval: false as const,
        actual_record_file_reads: 0 as const,
      }),
      input: frozenRecord({
        schema: "shogi-authenticated-floodgate-training-rows-v1" as const,
        role: "training" as const,
        verifier_revision: VERIFIER_REVISION,
        raw_format: INPUT_BINDING.raw_format,
        records: INPUT_BINDING.records,
        games: INPUT_BINDING.games,
        position_ids_count: INPUT_BINDING.position_ids_count,
      }),
    }),
    gates,
    cross_gate: frozenRecord({
      gate_order_exact: true as const,
      run_id_metadata_equal: true as const,
      run_binding_metadata_equal: true as const,
      input_binding_metadata_equal: true as const,
      synthetic_key_instance_metadata_equal: true as const,
      cleanup_completed_before_next_gate: true as const,
      fresh_enrollment_capability_per_gate: true as const,
      durable_work_file_shared: false as const,
      filesystem_continuity_observed: false as const,
      actual_resume_observed: false as const,
    }),
    operation_counts: frozenRecord({
      synthetic_enrollment_capabilities_created: 3 as const,
      test_only_connector_compositions: frozenRecord({
        durable_prefix_100: 1 as const,
        durable_prefix_500: 1 as const,
        sealed_final_24000: 1 as const,
      }),
      production_enrollment_loads: 0 as const,
      production_connector_invocations: frozenRecord({
        durable_prefix_100: 0 as const,
        durable_prefix_500: 0 as const,
        sealed_final_24000: 0 as const,
      }),
      actual_home_approved_record_opens: 0 as const,
      deployment_key_file_opens: 0 as const,
      deployment_key_bytes_read: 0 as const,
      dataset_file_opens: 0 as const,
      checkpoint_artifact_reads: 0 as const,
      checkpoint_artifact_writes: 0 as const,
      network_requests: 0 as const,
      child_processes: 0 as const,
      module_source_loading_excluded_from_application_data_io_counts:
        true as const,
    }),
    nonclaims: frozenRecord({
      production_approval: false as const,
      production_gate_authorization: false as const,
      production_checkpoint: false as const,
      actual_key_or_control_plane_record_access: false as const,
      filesystem_durability_or_resume: false as const,
      dataset_read: false as const,
      teacher_label: false as const,
      optimizer_training: false as const,
      weights_changed: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength_established: false as const,
      stable_high_dan_established: false as const,
    }),
  });
}
