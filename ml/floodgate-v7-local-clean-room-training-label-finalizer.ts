/**
 * Explicit Mac-local finalizer for the sealed clean-room teacher handoff.
 *
 * The operational entry point is argumentless. It reads only the fixed private
 * handoff and its local integrity key, revalidates their MAC and exact
 * run/stage/work binding, and then composes the existing production stage,
 * pinned-training-input, sealed-scanner, and training-label finalizer APIs.
 * It has no AWS, network, cloud, optimizer, weight, match, or live authority.
 */

import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { TextDecoder, types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
} from "./floodgate-stable-wasm-proposer";
import {
  authorizeFloodgateTeacherStage,
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStageLease,
} from "./floodgate-teacher-stage-authorization";
import {
  withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingRowConsumerOptions,
} from "./floodgate-training-row-consumer";
import {
  FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
  FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
} from "./floodgate-v7-clean-room-teacher-runner";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "./floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
} from "./floodgate-v7-local-clean-room-teacher-runner";
import {
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS,
  FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS,
} from "./floodgate-v7-production-parent-coordinator";
import {
  createFloodgateV7TrainingLabelFinalizationPlan,
  discardFloodgateV7TrainingLabelFinalizationPlan,
  finalizeAndPublishFloodgateV7TrainingLabels,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
  type FloodgateV7TrainingLabelFinalizationPlan,
  type FloodgateV7TrainingLabelFinalizationReceipt,
} from "./floodgate-v7-training-label-finalizer-core";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TrainingLabelSealedScannerOptions,
} from "./floodgate-v7-teacher-checkpoint";

export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-training-label-finalizer-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_STATUS =
  "authenticated-sealed-24000-local-training-label-artifacts-published" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CLAIM_BOUNDARY =
  "argumentless-fixed-mac-local-private-handoff-mac-run-binding-stage-work-and-production-sealed-scanner-finalizer-without-cloud-training-weight-live-or-strength-authority" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_TEST_STATUS =
  "test-only-fixed-in-memory-orchestration-complete-not-operational-evidence" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_PACKAGE_SCRIPT =
  "shogi:floodgate-v7-local-clean-room-training-label-finalizer" as const;

const LOCAL_STATE_BASENAME = "local-run-v1";
const LOCAL_INTEGRITY_KEY_FILENAME = "local-integrity-key.bin";
const LOCAL_HANDOFF_FILENAME = "finalizer-handoff.json";
const LOCAL_HANDOFF_CLAIM_FILENAME = "finalizer-handoff.claimed.json";
const LOCAL_HANDOFF_CLAIM_SCHEMA =
  "shogi-floodgate-v7-local-clean-room-finalizer-handoff-one-shot-claim-v1";
const LOCAL_HANDOFF_CLAIM_STATUS =
  "durably-consumed-before-stage-authorization";
const LOCAL_FINALIZER_ENTRYPOINT_FILENAME =
  "run-floodgate-v7-local-clean-room-training-label-finalizer.ts";
const LOCAL_KEY_BYTES = 32;
const MAX_HANDOFF_BYTES = 1024 * 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MODE_MASK = 0o7777;
const FINALIZER_HANDOFF_HMAC_DOMAIN =
  "shogi-floodgate-v7-local-clean-room-finalizer-handoff-v1\0";
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const DECIMAL_RE = /^(?:0|[1-9][0-9]*)$/;
const objectPrototype = Object.prototype;

const HANDOFF_KEYS = Object.freeze([
  "schema",
  "status",
  "claim_boundary",
  "run_id",
  "key_id",
  "integrity_key_id",
  "local_integrity_key_filename",
  "local_integrity_key_is_external_credential",
  "run_binding",
  "run_binding_sha256",
  "stage",
  "work",
  "input",
  "completion_receipts",
  "requirements",
  "external_services",
  "nonclaims",
  "handoff_mac",
] as const);
const RUN_BINDING_KEYS = Object.freeze([
  "schema",
  "plan",
  "producer_control",
  "stable_runtime_receipt_sha256",
  "teacher_usi_runtime_receipt_sha256",
] as const);
const PLAN_KEYS = Object.freeze(["bytes", "sha256"] as const);
const PRODUCER_CONTROL_KEYS = Object.freeze([
  "schema",
  "parent_deadline_ms",
  "abort_drain_ms",
  "max_in_flight",
  "cancel_policy",
  "late_settlement_policy",
] as const);
const STAGE_KEYS = Object.freeze([
  "basename",
  "parent_dev",
  "parent_ino",
  "dev",
  "ino",
] as const);
const WORK_KEYS = Object.freeze([
  "filename",
  "bytes",
  "sha256",
  "parents",
  "records",
  "resumed_parents",
  "sealed",
] as const);
const INPUT_KEYS = Object.freeze([
  "verifier_revision",
  "role",
  "parents",
] as const);
const COMPLETION_KEYS = Object.freeze([
  "gate",
  "filename",
  "bytes",
  "sha256",
] as const);
const REQUIREMENT_KEYS = Object.freeze([
  "separate_explicit_finalizer_command_required",
  "same_sealed_work_and_key_binding_required",
  "prefix_100_or_500_finalization_forbidden",
] as const);
const EXTERNAL_KEYS = Object.freeze([
  "network",
  "aws",
  "firebase_gcp",
  "vercel",
] as const);
const NONCLAIM_KEYS = Object.freeze([
  "labels_finalized",
  "optimizer_training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);
const GATE_ORDER = Object.freeze([
  "durable-prefix-100",
  "durable-prefix-500",
  "sealed-final-24000",
] as const);
const COMPLETION_FILENAMES = Object.freeze([
  "completion-prefix-100.json",
  "completion-prefix-500.json",
  "completion-final-24000.json",
] as const);

export type FloodgateV7LocalCleanRoomTrainingLabelFinalizerPhase =
  | "capture"
  | "handoff"
  | "stage-authorization"
  | "stage-binding"
  | "training-consumer"
  | "plan-composition"
  | "finalization"
  | "receipt"
  | "cleanup";

export class FloodgateV7LocalCleanRoomTrainingLabelFinalizerError extends Error {
  readonly phase: FloodgateV7LocalCleanRoomTrainingLabelFinalizerPhase;
  readonly publication_may_have_occurred: boolean;
  readonly stage_or_lease_may_remain: boolean;
  readonly retry_disposition:
    | "fresh-authenticated-handoff-required"
    | "manual-local-publication-reconciliation-required";
  readonly sensitive_values_disclosed = false as const;

  constructor(
    phase: FloodgateV7LocalCleanRoomTrainingLabelFinalizerPhase,
    publicationMayHaveOccurred: boolean,
    stageOrLeaseMayRemain: boolean,
  ) {
    super("Floodgate v7 local clean-room training-label finalizer failed");
    this.name = "FloodgateV7LocalCleanRoomTrainingLabelFinalizerError";
    this.phase = phase;
    this.publication_may_have_occurred = publicationMayHaveOccurred;
    this.stage_or_lease_may_remain = stageOrLeaseMayRemain;
    this.retry_disposition =
      publicationMayHaveOccurred || stageOrLeaseMayRemain
        ? "manual-local-publication-reconciliation-required"
        : "fresh-authenticated-handoff-required";
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: `${this.name}: ${this.message}`,
    });
    Object.freeze(this);
  }
}

export interface FloodgateV7LocalCleanRoomTrainingLabelFinalizerReceipt {
  readonly contract: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CONTRACT;
  readonly status:
    | typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_STATUS
    | typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_TEST_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CLAIM_BOUNDARY;
  readonly execution_boundary:
    | "fixed-mac-local-argumentless-command"
    | "test-only-fixed-in-memory-orchestration";
  readonly operational_evidence: boolean;
  readonly output: Readonly<{
    readonly parents: 24_000;
    readonly training_records: number;
    readonly work: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly train: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly result: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly manifest: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
  }>;
  readonly verification: Readonly<{
    readonly handoff_mac_revalidated: true;
    readonly exact_run_binding_digest_revalidated: true;
    readonly fixed_deployment_key_revalidated: true;
    readonly fixed_stage_identity_revalidated: true;
    readonly exact_sealed_work_revalidated: true;
    readonly durable_one_shot_replay_claimed: boolean;
    readonly sealed_scanner_and_finalizer_composed: true;
    readonly destination_content_reverified: true;
  }>;
  readonly nonclaims: Readonly<{
    readonly private_path_or_receipt_disclosed: false;
    readonly run_id_or_binding_disclosed: false;
    readonly key_id_material_or_mac_disclosed: false;
    readonly row_or_position_content_disclosed: false;
    readonly aws_or_network_used: false;
    readonly firebase_gcp_or_vercel_used: false;
    readonly optimizer_training: false;
    readonly weight_or_live_activation: false;
    readonly match_or_playing_strength: false;
  }>;
}

interface LocalFinalizerHandoff {
  readonly runId: string;
  readonly handoffMac: string;
  readonly runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
  readonly runBindingSha256: string;
  readonly stage: Readonly<{
    readonly basename: string;
    readonly parentDev: string;
    readonly parentIno: string;
    readonly dev: string;
    readonly ino: string;
  }>;
  readonly work: Readonly<{
    readonly filename: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME;
    readonly bytes: number;
    readonly sha256: string;
    readonly parents: 24_000;
    readonly records: number;
    readonly resumedParents: 500;
    readonly sealed: true;
  }>;
}

interface FloodgateV7LocalCleanRoomTrainingLabelFinalizerDependencies<
  TPlan = Readonly<FloodgateV7TrainingLabelFinalizationPlan>,
> {
  readonly authorizeStage: (
    options: Readonly<FloodgateTeacherStageAuthorizationOptions>,
  ) => Promise<Readonly<FloodgateTeacherStageLease>>;
  readonly consumeRowsAndPostflight: (
    options: Readonly<FloodgateTrainingRowConsumerOptions>,
    consume: (
      input: Readonly<AuthenticatedFloodgateTrainingRows>,
    ) => Promise<void>,
  ) => Promise<Readonly<FloodgateTrainingConsumerPostflightReceipt>>;
  readonly createPlan: (
    lease: Readonly<FloodgateTeacherStageLease>,
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
    runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
    options: Readonly<FloodgateV7TrainingLabelSealedScannerOptions>,
  ) => Promise<TPlan>;
  readonly discardPlan: (plan: TPlan) => Promise<void>;
  readonly finalize: (
    plan: TPlan,
    postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  ) => Promise<Readonly<FloodgateV7TrainingLabelFinalizationReceipt>>;
}

export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_TEST_SCENARIOS =
  Object.freeze([
    "success",
    "authorize-failure",
    "handoff-revalidation-after-authorize",
    "consume-failure",
    "consume-and-close-failure",
    "handoff-revalidation-before-plan",
    "create-plan-failure",
    "postflight-failure",
    "postflight-and-discard-failure",
    "finalize-failure",
    "receipt-work-mismatch",
  ] as const);

export type FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestScenario =
  (typeof FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_TEST_SCENARIOS)[number];

interface FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestFailure {
  readonly name: typeof FloodgateV7LocalCleanRoomTrainingLabelFinalizerError.name;
  readonly phase: FloodgateV7LocalCleanRoomTrainingLabelFinalizerPhase;
  readonly publication_may_have_occurred: boolean;
  readonly stage_or_lease_may_remain: boolean;
  readonly retry_disposition:
    | "fresh-authenticated-handoff-required"
    | "manual-local-publication-reconciliation-required";
  readonly sensitive_values_disclosed: false;
}

export type FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestOutcome =
  | Readonly<{
      readonly status: "PASS";
      readonly events: readonly string[];
      readonly receipt: Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerReceipt>;
    }>
  | Readonly<{
      readonly status: "STOP";
      readonly events: readonly string[];
      readonly failure: Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestFailure>;
    }>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    )
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== objectPrototype &&
      Object.getPrototypeOf(value) !== null) ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error(`${label} differs`);
  }
  return value as Record<string, unknown>;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error(`${label} differs`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} differs`);
  }
  return value as number;
}

function decimal(value: unknown, label: string): string {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    throw new Error(`${label} differs`);
  }
  return value;
}

function allBoolean(
  value: unknown,
  keys: readonly string[],
  expected: boolean,
  label: string,
): void {
  const record = exactRecord(value, keys, label);
  if (keys.some((key) => record[key] !== expected)) {
    throw new Error(`${label} differs`);
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function captureRunBinding(
  value: unknown,
): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  const binding = exactRecord(value, RUN_BINDING_KEYS, "run binding");
  const plan = exactRecord(binding.plan, PLAN_KEYS, "run binding plan");
  const control = exactRecord(
    binding.producer_control,
    PRODUCER_CONTROL_KEYS,
    "producer control",
  );
  if (
    binding.schema !== FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA ||
    plan.bytes !== FLOODGATE_FRESH_SIBLING_PLAN_BYTES ||
    plan.sha256 !== FLOODGATE_FRESH_SIBLING_PLAN_SHA256 ||
    control.schema !== FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA ||
    control.parent_deadline_ms !==
      FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_PARENT_DEADLINE_MS ||
    control.abort_drain_ms !==
      FLOODGATE_V7_PRODUCTION_PARENT_COORDINATOR_ABORT_DRAIN_MS ||
    control.max_in_flight !== FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT ||
    control.cancel_policy !== FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY ||
    control.late_settlement_policy !==
      FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY
  ) {
    throw new Error("run binding fixed contract differs");
  }
  digest(binding.stable_runtime_receipt_sha256, "stable runtime digest");
  digest(binding.teacher_usi_runtime_receipt_sha256, "teacher runtime digest");
  return deepFreeze(
    JSON.parse(
      canonicalJson(binding),
    ) as FloodgateV7TeacherCheckpointRunBinding,
  );
}

function captureHandoff(
  keyValue: Uint8Array,
  bytesValue: Uint8Array,
): Readonly<LocalFinalizerHandoff> {
  if (
    !(keyValue instanceof Uint8Array) ||
    !(bytesValue instanceof Uint8Array) ||
    nodeUtilTypes.isProxy(keyValue) ||
    nodeUtilTypes.isProxy(bytesValue) ||
    keyValue.byteLength !== LOCAL_KEY_BYTES ||
    bytesValue.byteLength < 2 ||
    bytesValue.byteLength > MAX_HANDOFF_BYTES
  ) {
    throw new Error("private handoff input differs");
  }
  const text = new TextDecoder("utf-8", {
    fatal: true,
    // Keep a leading BOM visible so the exact canonical-byte comparison below
    // rejects it instead of TextDecoder silently stripping alternate framing.
    ignoreBOM: true,
  }).decode(bytesValue);
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n")) {
    throw new Error("private handoff framing differs");
  }
  const parsed = JSON.parse(text.slice(0, -1)) as unknown;
  if (`${canonicalJson(parsed)}\n` !== text) {
    throw new Error("private handoff is not canonical JSON");
  }
  const handoff = exactRecord(parsed, HANDOFF_KEYS, "private handoff");
  if (
    handoff.schema !==
      "shogi-floodgate-v7-local-clean-room-finalizer-handoff-v1" ||
    handoff.status !== "sealed-final-ready-for-separate-local-finalizer" ||
    handoff.claim_boundary !==
      "validated-three-gate-local-stream-fixed-current-user-deployment-checkpoint-key-private-handoff-integrity-key-exact-run-binding-and-sealed-work-binding-not-finalized-label-training-weight-match-live-or-strength-evidence" ||
    typeof handoff.run_id !== "string" ||
    !RUN_ID_RE.test(handoff.run_id) ||
    handoff.key_id !== FLOODGATE_V7_DEPLOYMENT_KEY_ID ||
    handoff.integrity_key_id !==
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_INTEGRITY_KEY_ID ||
    handoff.local_integrity_key_filename !== LOCAL_INTEGRITY_KEY_FILENAME ||
    handoff.local_integrity_key_is_external_credential !== false
  ) {
    throw new Error("private handoff fixed contract differs");
  }
  const handoffMac = digest(handoff.handoff_mac, "handoff MAC");
  const payload: Record<string, unknown> = {};
  for (const key of HANDOFF_KEYS) {
    if (key !== "handoff_mac") payload[key] = handoff[key];
  }
  const expectedMac = createHmac("sha256", keyValue)
    .update(FINALIZER_HANDOFF_HMAC_DOMAIN, "utf8")
    .update(canonicalJson(payload), "utf8")
    .digest();
  const actualMac = Buffer.from(handoffMac, "hex");
  try {
    if (
      actualMac.byteLength !== expectedMac.byteLength ||
      !timingSafeEqual(actualMac, expectedMac)
    ) {
      throw new Error("private handoff MAC differs");
    }
  } finally {
    actualMac.fill(0);
    expectedMac.fill(0);
  }

  const runBinding = captureRunBinding(handoff.run_binding);
  const runBindingSha256 = digest(
    handoff.run_binding_sha256,
    "run binding digest",
  );
  if (
    createHash("sha256")
      .update(canonicalJson(runBinding), "utf8")
      .digest("hex") !== runBindingSha256
  ) {
    throw new Error("run binding digest differs");
  }
  const stage = exactRecord(handoff.stage, STAGE_KEYS, "handoff stage");
  if (stage.basename !== FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME) {
    throw new Error("handoff stage basename differs");
  }
  const work = exactRecord(handoff.work, WORK_KEYS, "handoff work");
  const workBytes = integer(work.bytes, "work bytes", 1);
  const workRecords = integer(work.records, "work records");
  if (
    work.filename !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME ||
    work.parents !== 24_000 ||
    work.resumed_parents !== 500 ||
    work.sealed !== true
  ) {
    throw new Error("handoff is not exact sealed 24000 work");
  }
  const input = exactRecord(handoff.input, INPUT_KEYS, "handoff input");
  if (
    input.verifier_revision !==
      FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION ||
    input.role !== "training" ||
    input.parents !== 24_000
  ) {
    throw new Error("handoff input differs");
  }
  const completions = handoff.completion_receipts;
  if (!Array.isArray(completions) || completions.length !== 3) {
    throw new Error("handoff completion chain differs");
  }
  completions.forEach((value, index) => {
    const completion = exactRecord(
      value,
      COMPLETION_KEYS,
      "handoff completion",
    );
    if (
      completion.gate !== GATE_ORDER[index] ||
      completion.filename !== COMPLETION_FILENAMES[index]
    ) {
      throw new Error("handoff completion order differs");
    }
    integer(completion.bytes, "completion bytes", 1);
    digest(completion.sha256, "completion digest");
  });
  allBoolean(
    handoff.requirements,
    REQUIREMENT_KEYS,
    true,
    "handoff requirements",
  );
  allBoolean(
    handoff.external_services,
    EXTERNAL_KEYS,
    false,
    "handoff external services",
  );
  allBoolean(handoff.nonclaims, NONCLAIM_KEYS, false, "handoff nonclaims");
  return Object.freeze({
    runId: handoff.run_id,
    handoffMac,
    runBinding,
    runBindingSha256,
    stage: Object.freeze({
      basename: stage.basename as string,
      parentDev: decimal(stage.parent_dev, "stage parent dev"),
      parentIno: decimal(stage.parent_ino, "stage parent ino"),
      dev: decimal(stage.dev, "stage dev"),
      ino: decimal(stage.ino, "stage ino"),
    }),
    work: Object.freeze({
      filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      bytes: workBytes,
      sha256: digest(work.sha256, "work digest"),
      parents: 24_000 as const,
      records: workRecords,
      resumedParents: 500 as const,
      sealed: true as const,
    }),
  });
}

function fixedTargets() {
  const verifierRepository = path.join(
    FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
    "verifier",
    "accepted-e8a9197",
  );
  return Object.freeze({
    verifierRepository,
    rawLockRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "inputs",
      "raw-lock",
    ),
    roleLockRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "inputs",
      "role-lock",
    ),
    roleBundleRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "inputs",
      "role-bundle",
    ),
    legacyProtectedPositionIdsPath: path.join(
      verifierRepository,
      "ml",
      "data",
      "wcsc36",
      "int16-aware-replay-excluded-position-ids.txt",
    ),
    assetRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "assets",
      "teacher",
    ),
    publicationParent: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "publication",
    ),
    localStateRoot: path.join(
      FLOODGATE_V7_CLEAN_ROOM_FIXED_ROOT,
      "state",
      LOCAL_STATE_BASENAME,
    ),
  });
}

function stageOptions(): Readonly<FloodgateTeacherStageAuthorizationOptions> {
  const fixed = fixedTargets();
  return Object.freeze({
    repositoryRoot: fixed.verifierRepository,
    rawLockRoot: fixed.rawLockRoot,
    roleLockRoot: fixed.roleLockRoot,
    roleBundleRoot: fixed.roleBundleRoot,
    legacyProtectedPositionIdsPath: fixed.legacyProtectedPositionIdsPath,
    publicationParent: fixed.publicationParent,
    stageBasename: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_STAGE_BASENAME,
    destinationBasename:
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
    engineBin: path.join(fixed.assetRoot, "engine", "yaneuraou"),
    engineReceipt: path.join(
      fixed.assetRoot,
      "engine",
      "yaneuraou-receipt.json",
    ),
    engineArgs: Object.freeze([]),
    evalDir: path.join(fixed.assetRoot, "eval"),
  });
}

function consumerOptions(): Readonly<FloodgateTrainingRowConsumerOptions> {
  const fixed = fixedTargets();
  return Object.freeze({
    repositoryRoot: fixed.verifierRepository,
    verifierRevision: FLOODGATE_V7_CLEAN_ROOM_ACCEPTED_VERIFIER_REVISION,
    rawLockRoot: fixed.rawLockRoot,
    roleLockRoot: fixed.roleLockRoot,
    legacyProtectedPositionIdsPath: fixed.legacyProtectedPositionIdsPath,
    outputRoot: fixed.roleBundleRoot,
  });
}

async function readPrivateFile(
  filename: string,
  exactBytes: number | null,
  maximumBytes: number,
): Promise<Buffer> {
  const uid = typeof process.geteuid === "function" ? process.geteuid() : -1;
  const parent = path.dirname(filename);
  const parentStat = await fs.promises.lstat(parent, { bigint: true });
  if (
    uid < 1 ||
    (await fs.promises.realpath(parent)) !== parent ||
    !parentStat.isDirectory() ||
    parentStat.uid !== BigInt(uid) ||
    Number(parentStat.mode & BigInt(MODE_MASK)) !== PRIVATE_DIRECTORY_MODE
  ) {
    throw new Error("private handoff directory differs");
  }
  const handle = await fs.promises.open(
    filename,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const before = await handle.stat({ bigint: true });
    const namedBefore = await fs.promises.lstat(filename, { bigint: true });
    if (
      !before.isFile() ||
      before.uid !== BigInt(uid) ||
      before.nlink !== BigInt(1) ||
      Number(before.mode & BigInt(MODE_MASK)) !== PRIVATE_FILE_MODE ||
      before.dev !== namedBefore.dev ||
      before.ino !== namedBefore.ino ||
      (await fs.promises.realpath(filename)) !== filename ||
      before.size < BigInt(1) ||
      before.size > BigInt(maximumBytes) ||
      (exactBytes !== null && before.size !== BigInt(exactBytes))
    ) {
      throw new Error("private handoff file differs");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const namedAfter = await fs.promises.lstat(filename, { bigint: true });
    if (
      bytes.byteLength !== Number(before.size) ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.dev !== namedAfter.dev ||
      after.ino !== namedAfter.ino
    ) {
      bytes.fill(0);
      throw new Error("private handoff file changed");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function replayClaimBytes(
  handoffMac: string,
  runBindingSha256: string,
  workSha256: string,
): Buffer {
  const payload = Object.freeze({
    schema: LOCAL_HANDOFF_CLAIM_SCHEMA,
    status: LOCAL_HANDOFF_CLAIM_STATUS,
    handoff_mac_sha256: createHash("sha256")
      .update(handoffMac, "utf8")
      .digest("hex"),
    run_binding_sha256: runBindingSha256,
    work_sha256: workSha256,
  });
  return Buffer.from(`${canonicalJson(payload)}\n`, "utf8");
}

async function claimDurableHandoffOnce(
  localStateRoot: string,
  handoffMac: string,
  runBindingSha256: string,
  workSha256: string,
): Promise<void> {
  const uid = typeof process.geteuid === "function" ? process.geteuid() : -1;
  if (
    uid < 1 ||
    !path.isAbsolute(localStateRoot) ||
    path.normalize(localStateRoot) !== localStateRoot
  ) {
    throw new Error("private replay-claim directory differs");
  }
  const claimPath = path.join(localStateRoot, LOCAL_HANDOFF_CLAIM_FILENAME);
  const claimBytes = replayClaimBytes(
    digest(handoffMac, "handoff MAC"),
    digest(runBindingSha256, "run binding digest"),
    digest(workSha256, "work digest"),
  );
  try {
    const directoryHandle = await fs.promises.open(
      localStateRoot,
      fs.constants.O_RDONLY |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    try {
      const directoryBefore = await directoryHandle.stat({ bigint: true });
      const namedDirectoryBefore = await fs.promises.lstat(localStateRoot, {
        bigint: true,
      });
      if (
        (await fs.promises.realpath(localStateRoot)) !== localStateRoot ||
        !directoryBefore.isDirectory() ||
        directoryBefore.uid !== BigInt(uid) ||
        Number(directoryBefore.mode & BigInt(MODE_MASK)) !==
          PRIVATE_DIRECTORY_MODE ||
        directoryBefore.dev !== namedDirectoryBefore.dev ||
        directoryBefore.ino !== namedDirectoryBefore.ino
      ) {
        throw new Error("private replay-claim directory differs");
      }

      const claimHandle = await fs.promises.open(
        claimPath,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_NOFOLLOW,
        PRIVATE_FILE_MODE,
      );
      try {
        const empty = await claimHandle.stat({ bigint: true });
        if (
          !empty.isFile() ||
          empty.uid !== BigInt(uid) ||
          empty.nlink !== BigInt(1) ||
          Number(empty.mode & BigInt(MODE_MASK)) !== PRIVATE_FILE_MODE ||
          empty.size !== BigInt(0)
        ) {
          throw new Error("private replay claim differs");
        }
        await claimHandle.writeFile(claimBytes);
        await claimHandle.sync();
        const written = await claimHandle.stat({ bigint: true });
        const namedClaim = await fs.promises.lstat(claimPath, {
          bigint: true,
        });
        const namedDirectoryAfter = await fs.promises.lstat(localStateRoot, {
          bigint: true,
        });
        if (
          (await fs.promises.realpath(claimPath)) !== claimPath ||
          written.dev !== empty.dev ||
          written.ino !== empty.ino ||
          written.uid !== BigInt(uid) ||
          written.nlink !== BigInt(1) ||
          Number(written.mode & BigInt(MODE_MASK)) !== PRIVATE_FILE_MODE ||
          written.size !== BigInt(claimBytes.byteLength) ||
          written.dev !== namedClaim.dev ||
          written.ino !== namedClaim.ino ||
          directoryBefore.dev !== namedDirectoryAfter.dev ||
          directoryBefore.ino !== namedDirectoryAfter.ino
        ) {
          throw new Error("private replay claim changed");
        }
      } finally {
        await claimHandle.close();
      }
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }

    const verified = await readPrivateFile(
      claimPath,
      claimBytes.byteLength,
      claimBytes.byteLength,
    );
    try {
      if (!timingSafeEqual(verified, claimBytes)) {
        throw new Error("private replay claim content differs");
      }
    } finally {
      verified.fill(0);
    }
  } finally {
    claimBytes.fill(0);
  }
}

/**
 * Test-only filesystem seam for proving the durable one-shot primitive across
 * independent processes. It cannot authorize a stage or finalize labels.
 */
export async function claimFloodgateV7LocalCleanRoomTrainingLabelHandoffOnceCoreForTests(
  localStateRootValue: string,
  handoffMacValue: string,
  runBindingSha256Value: string,
  workSha256Value: string,
): Promise<void> {
  if (
    arguments.length !== 4 ||
    typeof localStateRootValue !== "string" ||
    typeof handoffMacValue !== "string" ||
    typeof runBindingSha256Value !== "string" ||
    typeof workSha256Value !== "string"
  ) {
    throw new Error("test replay-claim input differs");
  }
  await claimDurableHandoffOnce(
    localStateRootValue,
    handoffMacValue,
    runBindingSha256Value,
    workSha256Value,
  );
}

async function loadFixedHandoff(): Promise<Readonly<LocalFinalizerHandoff>> {
  const root = fixedTargets().localStateRoot;
  const key = await readPrivateFile(
    path.join(root, LOCAL_INTEGRITY_KEY_FILENAME),
    LOCAL_KEY_BYTES,
    LOCAL_KEY_BYTES,
  );
  let handoff: Buffer | undefined;
  try {
    handoff = await readPrivateFile(
      path.join(root, LOCAL_HANDOFF_FILENAME),
      null,
      MAX_HANDOFF_BYTES,
    );
    return captureHandoff(key, handoff);
  } finally {
    key.fill(0);
    handoff?.fill(0);
  }
}

function assertSameHandoff(
  expected: Readonly<LocalFinalizerHandoff>,
  actual: Readonly<LocalFinalizerHandoff>,
): void {
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    throw new Error("private handoff changed during finalization");
  }
}

function assertStageBinding(
  lease: Readonly<FloodgateTeacherStageLease>,
  handoff: Readonly<LocalFinalizerHandoff>,
): void {
  const receipt = lease.receipt;
  const fixed = fixedTargets();
  if (
    receipt.contract !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    receipt.trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    receipt.stage_basename !== handoff.stage.basename ||
    receipt.destination_basename !==
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME ||
    receipt.parent_identity.dev.toString(10) !== handoff.stage.parentDev ||
    receipt.parent_identity.ino.toString(10) !== handoff.stage.parentIno ||
    receipt.stage_identity.dev.toString(10) !== handoff.stage.dev ||
    receipt.stage_identity.ino.toString(10) !== handoff.stage.ino ||
    lease.stageRoot !==
      path.join(fixed.publicationParent, handoff.stage.basename) ||
    lease.destinationRoot !==
      path.join(
        fixed.publicationParent,
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
      )
  ) {
    throw new Error("authorized stage differs from private handoff");
  }
}

function fileEvidence(value: unknown, expectedFilename: string, label: string) {
  const record = exactRecord(
    value,
    ["filename", "dev", "ino", "mode", "bytes", "sha256"],
    label,
  );
  if (record.filename !== expectedFilename || record.mode !== "0600") {
    throw new Error(`${label} differs`);
  }
  decimal(record.dev, `${label} device`);
  decimal(record.ino, `${label} inode`);
  return Object.freeze({
    bytes: integer(record.bytes, `${label} bytes`, 1),
    sha256: digest(record.sha256, `${label} digest`),
  });
}

function buildReceipt(
  handoff: Readonly<LocalFinalizerHandoff>,
  finalization: Readonly<FloodgateV7TrainingLabelFinalizationReceipt>,
  operational: boolean,
): Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerReceipt> {
  if (
    finalization.content.parents !== 24_000 ||
    finalization.content.work.bytes !== handoff.work.bytes ||
    finalization.content.work.sha256 !== handoff.work.sha256 ||
    finalization.postpublication.destination_reopened !== true ||
    finalization.postpublication.content_reverified !== true ||
    finalization.publication.stage_basename !== handoff.stage.basename ||
    finalization.publication.destination_basename !==
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME
  ) {
    throw new Error("local finalization result differs from handoff");
  }
  return Object.freeze({
    contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CONTRACT,
    status: operational
      ? FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_STATUS
      : FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_TEST_STATUS,
    claim_boundary:
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TRAINING_LABEL_FINALIZER_CLAIM_BOUNDARY,
    execution_boundary: operational
      ? "fixed-mac-local-argumentless-command"
      : "test-only-fixed-in-memory-orchestration",
    operational_evidence: operational,
    output: Object.freeze({
      parents: 24_000 as const,
      training_records: integer(
        finalization.content.training_records,
        "training records",
      ),
      work: fileEvidence(
        finalization.content.work,
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        "work",
      ),
      train: fileEvidence(
        finalization.content.train,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        "train",
      ),
      result: fileEvidence(
        finalization.content.result,
        FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        "result",
      ),
      manifest: fileEvidence(
        finalization.content.manifest,
        FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
        "manifest",
      ),
    }),
    verification: Object.freeze({
      handoff_mac_revalidated: true as const,
      exact_run_binding_digest_revalidated: true as const,
      fixed_deployment_key_revalidated: true as const,
      fixed_stage_identity_revalidated: true as const,
      exact_sealed_work_revalidated: true as const,
      durable_one_shot_replay_claimed: operational,
      sealed_scanner_and_finalizer_composed: true as const,
      destination_content_reverified: true as const,
    }),
    nonclaims: Object.freeze({
      private_path_or_receipt_disclosed: false as const,
      run_id_or_binding_disclosed: false as const,
      key_id_material_or_mac_disclosed: false as const,
      row_or_position_content_disclosed: false as const,
      aws_or_network_used: false as const,
      firebase_gcp_or_vercel_used: false as const,
      optimizer_training: false as const,
      weight_or_live_activation: false as const,
      match_or_playing_strength: false as const,
    }),
  });
}

function captureTestScenario(
  value: unknown,
): FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestScenario {
  switch (value) {
    case "success":
    case "authorize-failure":
    case "handoff-revalidation-after-authorize":
    case "consume-failure":
    case "consume-and-close-failure":
    case "handoff-revalidation-before-plan":
    case "create-plan-failure":
    case "postflight-failure":
    case "postflight-and-discard-failure":
    case "finalize-failure":
    case "receipt-work-mismatch":
      return value;
    default:
      throw new Error("test scenario differs");
  }
}

function testFileEvidence(
  filename: string,
  bytes: number,
  sha256: string,
): Readonly<{
  readonly filename: string;
  readonly dev: string;
  readonly ino: string;
  readonly mode: "0600";
  readonly bytes: number;
  readonly sha256: string;
}> {
  return Object.freeze({
    filename,
    dev: "101",
    ino: "102",
    mode: "0600" as const,
    bytes,
    sha256,
  });
}

function testFinalizationReceipt(
  handoff: Readonly<LocalFinalizerHandoff>,
  mismatchWork: boolean,
): Readonly<FloodgateV7TrainingLabelFinalizationReceipt> {
  return Object.freeze({
    contract:
      "shogi-floodgate-v7-training-label-finalization-publication-core-v1",
    status:
      "test-only-authenticated-sealed-scan-plan-exact-prefix-content-finalized-and-injected-publication-reverified",
    claim_boundary:
      "fixed-in-memory-local-finalizer-test-scenario-not-production-authority",
    execution_boundary:
      "test-only-injected-authenticated-sealed-scan-plan-finalizer-and-exclusive-private-directory-publication",
    content: Object.freeze({
      work: testFileEvidence(
        handoff.work.filename,
        handoff.work.bytes,
        mismatchWork ? "9".repeat(64) : handoff.work.sha256,
      ),
      train: testFileEvidence(
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        1,
        "2".repeat(64),
      ),
      result: testFileEvidence(
        FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        1,
        "3".repeat(64),
      ),
      manifest: testFileEvidence(
        FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
        1,
        "4".repeat(64),
      ),
      parents: 24_000,
      training_records: handoff.work.records,
      consumer_postflight_sha256: "5".repeat(64),
    }),
    publication: Object.freeze({
      stage_basename: handoff.stage.basename,
      destination_basename:
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
    }),
    postpublication: Object.freeze({
      destination_reopened: true,
      exact_entries: Object.freeze([
        FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
        FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      ]),
      content_reverified: true,
    }),
  }) as unknown as Readonly<FloodgateV7TrainingLabelFinalizationReceipt>;
}

interface SafeTestExecution {
  readonly dependencies: Readonly<
    FloodgateV7LocalCleanRoomTrainingLabelFinalizerDependencies<
      Readonly<{ readonly safe_test_plan: true }>
    >
  >;
  readonly events: string[];
}

function safeTestExecution(
  handoff: Readonly<LocalFinalizerHandoff>,
  scenario: FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestScenario,
): Readonly<SafeTestExecution> {
  const events: string[] = [];
  const safePlan = Object.freeze({ safe_test_plan: true as const });
  const close = async (): Promise<void> => {
    events.push("close");
    if (scenario === "consume-and-close-failure") {
      throw new Error("fixed test close failure");
    }
  };
  const lease = Object.freeze({
    receipt: Object.freeze({
      contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      trust_boundary: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
      parent_identity: Object.freeze({
        dev: BigInt(handoff.stage.parentDev),
        ino: BigInt(handoff.stage.parentIno),
      }),
      stage_identity: Object.freeze({
        dev: BigInt(handoff.stage.dev),
        ino: BigInt(handoff.stage.ino),
      }),
      lease_identity: Object.freeze({ dev: BigInt(103), ino: BigInt(104) }),
      stage_basename: handoff.stage.basename,
      destination_basename:
        FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
      allowed_entries: FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
    }),
    stageRoot: path.join(
      fixedTargets().publicationParent,
      handoff.stage.basename,
    ),
    destinationRoot: path.join(
      fixedTargets().publicationParent,
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_DESTINATION_BASENAME,
    ),
    close,
  }) as Readonly<FloodgateTeacherStageLease>;
  return Object.freeze({
    events,
    dependencies: Object.freeze({
      authorizeStage: async () => {
        events.push("authorize");
        if (scenario === "authorize-failure") {
          throw new Error("fixed test authorization failure");
        }
        return lease;
      },
      consumeRowsAndPostflight: async (
        _options: Readonly<FloodgateTrainingRowConsumerOptions>,
        consume: (
          input: Readonly<AuthenticatedFloodgateTrainingRows>,
        ) => Promise<void>,
      ) => {
        events.push("consume");
        if (
          scenario === "consume-failure" ||
          scenario === "consume-and-close-failure"
        ) {
          throw new Error("fixed test consumer failure");
        }
        await consume(
          Object.freeze({}) as Readonly<AuthenticatedFloodgateTrainingRows>,
        );
        if (
          scenario === "postflight-failure" ||
          scenario === "postflight-and-discard-failure"
        ) {
          throw new Error("fixed test postflight failure");
        }
        return Object.freeze(
          {},
        ) as Readonly<FloodgateTrainingConsumerPostflightReceipt>;
      },
      createPlan: async () => {
        events.push("create-plan");
        if (scenario === "create-plan-failure") {
          throw new Error("fixed test plan-composition failure");
        }
        return safePlan;
      },
      discardPlan: async () => {
        events.push("discard");
        if (scenario === "postflight-and-discard-failure") {
          throw new Error("fixed test discard failure");
        }
      },
      finalize: async () => {
        events.push("finalize");
        if (scenario === "finalize-failure") {
          throw new Error("fixed test finalization failure");
        }
        return testFinalizationReceipt(
          handoff,
          scenario === "receipt-work-mismatch",
        );
      },
    }),
  });
}

function testFailure(
  phase: FloodgateV7LocalCleanRoomTrainingLabelFinalizerPhase,
  publicationMayHaveOccurred: boolean,
  stageOrLeaseMayRemain: boolean,
): Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestFailure> {
  const error = new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
    phase,
    publicationMayHaveOccurred,
    stageOrLeaseMayRemain,
  );
  return Object.freeze({
    name: "FloodgateV7LocalCleanRoomTrainingLabelFinalizerError",
    phase: error.phase,
    publication_may_have_occurred: error.publication_may_have_occurred,
    stage_or_lease_may_remain: error.stage_or_lease_may_remain,
    retry_disposition: error.retry_disposition,
    sensitive_values_disclosed: false as const,
  });
}

function testFailureFromError(
  error: unknown,
): Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestFailure> {
  if (error instanceof FloodgateV7LocalCleanRoomTrainingLabelFinalizerError) {
    return testFailure(
      error.phase,
      error.publication_may_have_occurred,
      error.stage_or_lease_may_remain,
    );
  }
  return testFailure("capture", false, false);
}

function testStop(
  events: readonly string[],
  failure: Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestFailure>,
): Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestOutcome> {
  return Object.freeze({
    status: "STOP" as const,
    events: Object.freeze([...events]),
    failure,
  });
}

async function executeFinalizer<TPlan>(
  handoff: Readonly<LocalFinalizerHandoff>,
  dependencies: Readonly<
    FloodgateV7LocalCleanRoomTrainingLabelFinalizerDependencies<TPlan>
  >,
  revalidateHandoff: () => Promise<Readonly<LocalFinalizerHandoff>>,
  operational: boolean,
): Promise<Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerReceipt>> {
  let phase: FloodgateV7LocalCleanRoomTrainingLabelFinalizerPhase =
    "stage-authorization";
  let lease: Readonly<FloodgateTeacherStageLease> | undefined;
  let plan: TPlan | undefined;
  let composerInvoked = false;
  let finalizerInvoked = false;
  let stageOrLeaseMayRemain = false;
  try {
    lease = await dependencies.authorizeStage(stageOptions());
    stageOrLeaseMayRemain = true;
    phase = "stage-binding";
    assertStageBinding(lease, handoff);
    assertSameHandoff(handoff, await revalidateHandoff());
    phase = "training-consumer";
    const postflight = await dependencies.consumeRowsAndPostflight(
      consumerOptions(),
      async (input): Promise<void> => {
        phase = "plan-composition";
        assertSameHandoff(handoff, await revalidateHandoff());
        composerInvoked = true;
        plan = await dependencies.createPlan(
          lease as Readonly<FloodgateTeacherStageLease>,
          input,
          handoff.runBinding,
          Object.freeze({
            runId: handoff.runId,
            keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
            work: Object.freeze({
              bytes: handoff.work.bytes,
              sha256: handoff.work.sha256,
            }),
          }),
        );
        phase = "training-consumer";
      },
    );
    if (plan === undefined) throw new Error("local plan is unavailable");
    phase = "finalization";
    finalizerInvoked = true;
    const result = await dependencies.finalize(plan, postflight);
    phase = "receipt";
    return buildReceipt(handoff, result, operational);
  } catch {
    if (!finalizerInvoked) {
      if (plan !== undefined) {
        try {
          await dependencies.discardPlan(plan);
          stageOrLeaseMayRemain = false;
        } catch {
          throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
            "cleanup",
            false,
            true,
          );
        }
      } else if (!composerInvoked && lease !== undefined) {
        try {
          await lease.close();
          stageOrLeaseMayRemain = false;
        } catch {
          throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
            "cleanup",
            false,
            true,
          );
        }
      }
    }
    throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
      phase,
      finalizerInvoked,
      stageOrLeaseMayRemain,
    );
  }
}

const PRODUCTION_DEPENDENCIES: Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerDependencies> =
  Object.freeze({
    authorizeStage: authorizeFloodgateTeacherStage,
    consumeRowsAndPostflight:
      withVerifiedPinnedFloodgateTrainingRowsAndPostflight,
    createPlan: createFloodgateV7TrainingLabelFinalizationPlan,
    discardPlan: discardFloodgateV7TrainingLabelFinalizationPlan,
    finalize: finalizeAndPublishFloodgateV7TrainingLabels,
  });

interface OperationalFinalizerGrant {
  readonly contract: "shogi-floodgate-v7-local-clean-room-training-label-finalizer-operational-grant-v1";
}

const operationalFinalizerGrants = new WeakSet<
  Readonly<OperationalFinalizerGrant>
>();

function mintOperationalFinalizerGrant(): Readonly<OperationalFinalizerGrant> {
  const grant = Object.freeze({
    contract:
      "shogi-floodgate-v7-local-clean-room-training-label-finalizer-operational-grant-v1" as const,
  });
  operationalFinalizerGrants.add(grant);
  return grant;
}

async function executeOperationalFinalizer(
  grant: Readonly<OperationalFinalizerGrant>,
  handoff: Readonly<LocalFinalizerHandoff>,
): Promise<Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerReceipt>> {
  if (
    grant.contract !==
      "shogi-floodgate-v7-local-clean-room-training-label-finalizer-operational-grant-v1" ||
    !operationalFinalizerGrants.delete(grant)
  ) {
    throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
      "capture",
      false,
      false,
    );
  }
  return executeFinalizer(
    handoff,
    PRODUCTION_DEPENDENCIES,
    loadFixedHandoff,
    true,
  );
}

/**
 * Fixed in-memory test seam. It accepts no callbacks, executable dependencies,
 * paths, or production capabilities. The same strict handoff verifier and
 * orchestration lifecycle run only against module-owned inert operations.
 */
export async function runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests(
  keyValue: Uint8Array,
  handoffValue: Uint8Array,
  scenarioValue: FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestScenario,
): Promise<
  Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestOutcome>
> {
  let scenario: FloodgateV7LocalCleanRoomTrainingLabelFinalizerTestScenario;
  if (arguments.length !== 3) {
    return testStop([], testFailure("capture", false, false));
  }
  try {
    scenario = captureTestScenario(scenarioValue);
  } catch {
    return testStop([], testFailure("capture", false, false));
  }
  let handoff: Readonly<LocalFinalizerHandoff>;
  try {
    handoff = captureHandoff(keyValue, handoffValue);
  } catch {
    return testStop([], testFailure("handoff", false, false));
  }
  const test = safeTestExecution(handoff, scenario);
  let revalidations = 0;
  try {
    const receipt = await executeFinalizer(
      handoff,
      test.dependencies,
      async () => {
        revalidations += 1;
        if (
          (scenario === "handoff-revalidation-after-authorize" &&
            revalidations === 1) ||
          (scenario === "handoff-revalidation-before-plan" &&
            revalidations === 2)
        ) {
          throw new Error("fixed test handoff revalidation failure");
        }
        return captureHandoff(keyValue, handoffValue);
      },
      false,
    );
    return Object.freeze({
      status: "PASS" as const,
      events: Object.freeze([...test.events]),
      receipt,
    });
  } catch (error) {
    return testStop(test.events, testFailureFromError(error));
  }
}

function assertOperationalCommandContext(): void {
  if (
    process.platform !== "darwin" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() < 1
  ) {
    throw new Error("Mac-local command context differs");
  }
  const repositoryRoot = path.resolve(__dirname, "..");
  const entrypoint = path.join(__dirname, LOCAL_FINALIZER_ENTRYPOINT_FILENAME);
  const entrypointStat = fs.lstatSync(entrypoint);
  if (
    fs.realpathSync(repositoryRoot) !== repositoryRoot ||
    fs.realpathSync(process.cwd()) !== repositoryRoot ||
    fs.realpathSync(entrypoint) !== entrypoint ||
    !entrypointStat.isFile() ||
    entrypointStat.isSymbolicLink() ||
    (require.main?.filename ?? null) !== entrypoint ||
    process.argv.length !== 2 ||
    process.argv[0] !== process.execPath ||
    path.resolve(process.argv[1] ?? "") !== entrypoint
  ) {
    throw new Error("dedicated local command context differs");
  }
}

/** The sole operational entry point. Importing this module performs no I/O. */
export async function runFloodgateV7LocalCleanRoomTrainingLabelFinalizer(): Promise<
  Readonly<FloodgateV7LocalCleanRoomTrainingLabelFinalizerReceipt>
> {
  if (arguments.length !== 0) {
    throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
      "capture",
      false,
      false,
    );
  }
  try {
    assertOperationalCommandContext();
  } catch {
    throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
      "capture",
      false,
      false,
    );
  }
  let handoff: Readonly<LocalFinalizerHandoff>;
  try {
    handoff = await loadFixedHandoff();
    await claimDurableHandoffOnce(
      fixedTargets().localStateRoot,
      handoff.handoffMac,
      handoff.runBindingSha256,
      handoff.work.sha256,
    );
  } catch {
    throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
      "handoff",
      false,
      false,
    );
  }
  return executeOperationalFinalizer(mintOperationalFinalizerGrant(), handoff);
}

function canonicalFailure(error: unknown): Readonly<Record<string, unknown>> {
  const typed =
    error instanceof FloodgateV7LocalCleanRoomTrainingLabelFinalizerError
      ? error
      : undefined;
  return Object.freeze({
    contract:
      "shogi-floodgate-v7-local-clean-room-training-label-finalizer-cli-failure-v1",
    status: "STOP",
    phase: typed?.phase ?? "capture",
    publication_may_have_occurred:
      typed?.publication_may_have_occurred ?? false,
    stage_or_lease_may_remain: typed?.stage_or_lease_may_remain ?? false,
    retry_disposition:
      typed?.retry_disposition ?? "fresh-authenticated-handoff-required",
    sensitive_values_disclosed: false,
    aws_used: false,
    network_used: false,
    training_or_live_action: false,
  });
}

/** Argumentless CLI used only by the dedicated package command. */
export async function runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCli(): Promise<void> {
  try {
    if (arguments.length !== 0 || process.argv.slice(2).length !== 0) {
      throw new FloodgateV7LocalCleanRoomTrainingLabelFinalizerError(
        "capture",
        false,
        false,
      );
    }
    const receipt = await runFloodgateV7LocalCleanRoomTrainingLabelFinalizer();
    process.stdout.write(`${canonicalJson(receipt)}\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`${canonicalJson(canonicalFailure(error))}\n`);
    process.exitCode = 1;
  }
}
