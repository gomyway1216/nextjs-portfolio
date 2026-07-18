/**
 * Authenticated incremental checkpoint for v7 teacher parents.
 *
 * This boundary accepts an already-authenticated training-row capability and
 * an authorized private stage lease. It authenticates a durable prefix before
 * asking the caller to repeat any search, persists only compact completed
 * parent evidence, and seals the stream only after every parent is present.
 * The authenticated producer-control policy bounds each parent and abort drain.
 * The producer controller, every test hook, and the current JavaScript
 * realm/intrinsics are trusted. Returned parent evidence remains adversarial
 * and is reverified; late producer settlement is observed but quarantined.
 * The HMAC detects persisted-byte tampering by a non-key-holder; without an
 * external monotonic anchor it does not detect whole-file rollback, nor does
 * it defend against hostile same-process mutation or key access.
 * It is not a production coordinator, publication boundary, teacher-label
 * claim, holdout reader, or playing-strength claim.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import { types as nodeUtilTypes } from "node:util";

import {
  buildFloodgateV7CompletedParentCoreForTests,
  verifyFloodgateV7CompletedParentEvidenceCoreForTests,
  type FloodgateV7CompletedParentEvidence,
  type FloodgateV7CompletedParentInput,
} from "./floodgate-v7-completed-parent";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_HKDF_INFO,
  type FloodgateV7TeacherCheckpointV3Gate,
} from "./floodgate-v7-checkpoint-key-contract";
import {
  claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKey,
  claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests,
  claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKey,
  claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests,
  discardFloodgateV7DeploymentTeacherSealedScanV3Key,
  discardFloodgateV7DeploymentTeacherCheckpointV3Key,
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  prepareFloodgateV7DeploymentTeacherSealedScanV3Key,
  prepareFloodgateV7DeploymentTeacherSealedScanV3KeyCoreForTests,
  type FloodgateV7DeploymentKeyAuthorityDependencies,
  type FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
  type FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization,
  type FloodgateV7DeploymentTeacherCheckpointV3KeyRequest,
  type FloodgateV7DeploymentTeacherRunBinding,
  type FloodgateV7DeploymentTeacherSealedScanV3KeyAuthorization,
  type FloodgateV7DeploymentTeacherSealedScanV3KeyRequest,
} from "./floodgate-v7-deployment-key-authority";
import {
  beginFloodgateTeacherStagePublication,
  beginFloodgateTeacherStagePublicationCoreForTests,
  claimActiveAuthorizedFloodgateTeacherStageLease,
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
  type FloodgateTeacherStagePublicationReceipt,
  type FloodgateTeacherStagePublicationTransaction,
} from "./floodgate-teacher-stage-authorization";
import {
  claimActiveVerifiedPinnedFloodgateTrainingRows,
  claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingInputBinding,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-consumer";
import { FLOODGATE_PRODUCTION_TEACHER_RUNTIME } from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
  FLOODGATE_STABLE_MAX_ROWS,
} from "./floodgate-stable-wasm-proposer";
import { toSfen } from "./generate-teacher";
import { positionFromSfen, rulesCompleteLegalMoves } from "./shogi-sfen";
import { positionKeyFromSfen } from "./sibling-data";
import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

export const FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA =
  "shogi-floodgate-v7-teacher-work-v2" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM =
  "hmac-sha256-hkdf-sha256-v7-parent-chain-v2" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_PREFIX_STATUS =
  "authenticated-durable-private-v7-parent-prefix-not-complete-not-published" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS =
  "complete-authenticated-private-v7-teacher-parent-checkpoint-not-published" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY =
  "accepted-parent-exactly-once-search-at-least-once-authenticated-bounded-producer-control-trusted-controller-test-hooks-and-current-js-realm-intrinsics-returned-evidence-adversarial-reverified-hmac-persisted-byte-tamper-evidence-for-non-key-holders-only-not-hostile-same-process-mutation-production-origin-label-holdout-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME =
  "work.jsonl" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA =
  "shogi-floodgate-v7-teacher-work-v3" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM =
  "hmac-sha256-hkdf-sha256-v7-parent-gated-milestone-chain-v3" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_IN_PROGRESS_STATUS =
  "authenticated-private-v7-teacher-parent-gated-stream-in-progress-not-published" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS =
  "complete-authenticated-durable-private-v7-teacher-parent-prefix-not-sealed-not-published" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS =
  "complete-authenticated-private-v7-teacher-parent-checkpoint-not-published" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY =
  "fixed-100-500-24000-gates-full-authenticated-input-domain-separated-milestone-chain-prefix-not-sealed-final-sealed-accepted-parent-exactly-once-search-at-least-once-authenticated-bounded-producer-control-trusted-controller-test-hooks-and-current-js-realm-intrinsics-returned-evidence-adversarial-reverified-hmac-persisted-byte-tamper-evidence-for-non-key-holders-only-not-anti-rollback-hostile-same-process-mutation-production-origin-label-holdout-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CONTRACT =
  "shogi-floodgate-v7-teacher-verified-parent-entry-event-v1" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_STATUS =
  "authenticated-v3-parent-entry-provisional-until-enclosing-sealed-final-scan-succeeds" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CLAIM_BOUNDARY =
  "single-canonical-v3-entry-hmac-chain-parent-run-binding-and-completed-evidence-authenticated-during-held-file-scan-trusted-test-hooks-and-current-js-realm-not-hostile-same-process-mutation-resistant-not-standalone-work-authentication-not-sealed-final-scan-success-not-output-authority-not-durability-publication-training-weight-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CONTRACT =
  "shogi-floodgate-v7-training-label-sealed-scanner-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_STATUS =
  "opaque-two-pass-sealed-final-scanner-held-for-replay-and-terminal-publication-gate" as const;
export const FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CLAIM_BOUNDARY =
  "active-stage-lease-transferred-to-internally-begun-publication-transaction-fresh-authenticated-training-input-same-held-work-unkeyed-full-file-preflight-internal-purpose-specific-v3-scan-key-prepare-and-claim-first-keyed-scan-without-sink-second-keyed-scan-with-awaited-sink-same-full-snapshot-not-output-plan-publication-training-weight-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_RECEIPT_STATUS =
  "same-held-unkeyed-preflight-and-two-enclosing-keyed-sealed-final-scans-complete-snapshot-path-and-stage-prefix-confirmed" as const;
export const FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_TERMINAL_CONTRACT =
  "shogi-floodgate-v7-training-label-sealed-scanner-terminal-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_TERMINAL_STATUS =
  "opaque-final-no-sink-keyed-reverification-complete-handles-closed-and-scan-key-zeroized" as const;
export {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  type FloodgateV7TeacherCheckpointV3Gate,
} from "./floodgate-v7-checkpoint-key-contract";
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS = 24_000 as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT_SCHEMA =
  "shogi-floodgate-v7-teacher-gate-contract-v1" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT = Object.freeze({
  schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT_SCHEMA,
  durable_prefix_100_parents: 100 as const,
  durable_prefix_500_parents: 500 as const,
  sealed_final_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
});
export const FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA =
  "shogi-floodgate-v7-teacher-run-binding-v2" as const;
export const FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA =
  "shogi-floodgate-v7-teacher-producer-control-v2" as const;
export const FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY =
  "first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2" as const;
export const FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY =
  "observe-from-start-consume-after-terminal-without-validation-or-append-v2" as const;

const HEADER_DOMAIN = "shogi-floodgate-v7-teacher-work-header-v2\0";
const ENTRY_DOMAIN = "shogi-floodgate-v7-teacher-work-parent-v2\0";
const SEAL_DOMAIN = "shogi-floodgate-v7-teacher-work-seal-v2\0";
const KEY_INFO = "shogi-floodgate-v7-teacher-checkpoint-key-v2\0";
const V3_HEADER_DOMAIN = "shogi-floodgate-v7-teacher-work-header-v3\0";
const V3_ENTRY_DOMAIN = "shogi-floodgate-v7-teacher-work-parent-v3\0";
const V3_MILESTONE_100_DOMAIN =
  "shogi-floodgate-v7-teacher-work-milestone-100-v3\0";
const V3_MILESTONE_500_DOMAIN =
  "shogi-floodgate-v7-teacher-work-milestone-500-v3\0";
const V3_SEAL_DOMAIN = "shogi-floodgate-v7-teacher-work-seal-v3\0";
const PARENT_STREAM_DOMAIN = "shogi-floodgate-v7-training-parents-v1\0";
const EVIDENCE_DOMAIN = "shogi-floodgate-v7-completed-evidence-v1\0";
const FORMAT = "canonical-jsonl-utf8-single-final-lf-v2" as const;
const DURABILITY =
  "append-parent-line-fsync-seal-directory-sync-final-reopen-v2" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT =
  "canonical-jsonl-utf8-single-final-lf-v3" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY =
  "append-parent-and-milestone-line-fsync-seal-directory-sync-final-reopen-v3" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES = 24 * 1024;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES =
  FLOODGATE_STABLE_MAX_ROWS *
    (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1) +
  2 * (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1);
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES =
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS *
    (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1) +
  4 * (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1);
export const FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT =
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines;
export const FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_MAX_TIMER_MS = 2_147_483_647;
const MAX_TOTAL_BYTES = FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES;
const V3_MAX_TOTAL_BYTES = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES;
const MAX_LINE_BYTES = FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES;
const READ_CHUNK_BYTES = 64 * 1024;
const V3_TRAIN_FILENAME = "train.jsonl" as const;
const V3_RESULT_FILENAME = "result.json" as const;
const V3_MANIFEST_FILENAME = "manifest.json" as const;
const V3_SEALED_STAGE_PREFIX_STATES = Object.freeze([
  Object.freeze([FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME]),
  Object.freeze([
    V3_TRAIN_FILENAME,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  ]),
  Object.freeze([
    V3_RESULT_FILENAME,
    V3_TRAIN_FILENAME,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  ]),
  Object.freeze([
    V3_MANIFEST_FILENAME,
    V3_RESULT_FILENAME,
    V3_TRAIN_FILENAME,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  ]),
] as const);
const MODE_MASK = 0o7777;
const MODE_TYPE_MASK = fs.constants.S_IFMT;
const MODE_DIRECTORY = fs.constants.S_IFDIR;
const MODE_REGULAR = fs.constants.S_IFREG;
const RUN_ID_RE = /^[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get;
const nativeTypedArraySet = typedArrayPrototype.set as (
  source: ArrayLike<number>,
  offset?: number,
) => void;
const nativeTypedArrayFill = typedArrayPrototype.fill as (
  value: number,
  start?: number,
  end?: number,
) => Uint8Array;
const NativePromise = Promise;
const NativeWeakSet = WeakSet;
const nativeWeakSetAdd = WeakSet.prototype.add;
const nativeWeakSetDelete = WeakSet.prototype.delete;
const nativeGetEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const NativeAbortController = AbortController;
const nativePromisePrototype = Promise.prototype;
const nativePromiseThen = Promise.prototype.then;
const nativeAbortControllerAbort = AbortController.prototype.abort;
const nativeSetTimeout = setTimeout;
const nativeClearTimeout = clearTimeout;
const objectDefineProperty = Object.defineProperty;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const nodeIsPromise = nodeUtilTypes.isPromise;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nodeIsUint8Array = nodeUtilTypes.isUint8Array;
const nodeIsSharedArrayBuffer = nodeUtilTypes.isSharedArrayBuffer;
const productionV3ReceiptClaims = new NativeWeakSet<object>();
const testDeploymentKeyV3ReceiptClaims = new NativeWeakSet<object>();

const INPUT_KEYS = Object.freeze([
  "binding",
  "role",
  "rows",
  "schema",
] as const);
const BINDING_KEYS = Object.freeze([
  "bundle_manifest_bytes",
  "bundle_manifest_sha256",
  "bundle_producer_revision",
  "game_ids_sha256",
  "games",
  "parent_ids_sha256",
  "position_ids_count",
  "position_ids_sha256",
  "raw_bytes",
  "raw_format",
  "raw_sha256",
  "records",
  "result_receipt_bytes",
  "result_receipt_sha256",
  "verifier_revision",
] as const);
const PARENT_KEYS = Object.freeze([
  "game_id",
  "parent_id",
  "parent_sfen",
  "played_move",
  "ply",
  "position_id",
  "schema_version",
] as const);
const RUN_BINDING_KEYS = Object.freeze([
  "plan",
  "producer_control",
  "schema",
  "stable_runtime_receipt_sha256",
  "teacher_usi_runtime_receipt_sha256",
] as const);
const PRODUCER_CONTROL_KEYS = Object.freeze([
  "abort_drain_ms",
  "cancel_policy",
  "late_settlement_policy",
  "max_in_flight",
  "parent_deadline_ms",
  "schema",
] as const);
const IDENTITY_KEYS = Object.freeze(["bytes", "sha256"] as const);
const HEADER_KEYS = Object.freeze([
  "algorithm",
  "claim_boundary",
  "header_mac",
  "key_id",
  "kind",
  "run_binding",
  "run_id",
  "schema",
  "stage_binding",
  "status",
  "training",
] as const);
const ENTRY_KEYS = Object.freeze([
  "completed_evidence",
  "completed_evidence_sha256",
  "entry_mac",
  "input_index",
  "kind",
  "parent",
  "parent_id",
  "previous_mac",
  "schema",
  "sequence",
] as const);
const SEAL_KEYS = Object.freeze([
  "entries",
  "final_entry_mac",
  "kind",
  "parent_ids_sha256",
  "seal_mac",
  "schema",
  "status",
  "training_parents_sha256",
] as const);
const V3_HEADER_KEYS = Object.freeze([
  "algorithm",
  "claim_boundary",
  "gate_contract",
  "header_mac",
  "key_id",
  "kind",
  "run_binding",
  "run_id",
  "schema",
  "stage_binding",
  "status",
  "training",
] as const);
const V3_MILESTONE_KEYS = Object.freeze([
  "completed_parents",
  "gate",
  "kind",
  "milestone_mac",
  "prefix_parent_ids_sha256",
  "previous_mac",
  "schema",
  "status",
  "training_parent_ids_sha256",
  "training_parents_sha256",
] as const);
const V3_SEAL_KEYS = Object.freeze([
  "entries",
  "final_entry_mac",
  "kind",
  "milestone_100_mac",
  "milestone_500_mac",
  "parent_ids_sha256",
  "seal_mac",
  "schema",
  "status",
  "training_parents_sha256",
] as const);
export interface FloodgateV7TeacherCheckpointRunBinding {
  readonly schema: typeof FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA;
  readonly plan: Readonly<{
    readonly bytes: typeof FLOODGATE_FRESH_SIBLING_PLAN_BYTES;
    readonly sha256: typeof FLOODGATE_FRESH_SIBLING_PLAN_SHA256;
  }>;
  readonly producer_control: Readonly<FloodgateV7TeacherProducerControl>;
  readonly stable_runtime_receipt_sha256: string;
  readonly teacher_usi_runtime_receipt_sha256: string;
}

export interface FloodgateV7TeacherProducerControl {
  readonly schema: typeof FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA;
  readonly parent_deadline_ms: number;
  readonly abort_drain_ms: number;
  readonly max_in_flight: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT;
  readonly cancel_policy: typeof FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY;
  readonly late_settlement_policy: typeof FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY;
}

export interface FloodgateV7TeacherCheckpointOptions {
  readonly runId: string;
  readonly keyId: string;
}

export type FloodgateV7TeacherCheckpointV3PrefixGate =
  | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
  | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500;

export interface FloodgateV7TeacherCheckpointV3Options {
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
  readonly runId: string;
  readonly keyId: string;
}

export type FloodgateV7TeacherCheckpointFailpointPhase =
  | "after-header-durable"
  | "after-parent-produced-before-entry"
  | "after-entry-durable"
  | "after-seal-durable"
  | "before-final-reopen"
  | "after-final-scan-before-path-confirmation";

export interface FloodgateV7TeacherCheckpointFailpointEvent {
  readonly phase: FloodgateV7TeacherCheckpointFailpointPhase;
  readonly sequence?: number;
}

export interface FloodgateV7TeacherCheckpointDependencies {
  readonly rootKey: Uint8Array;
  readonly effectiveUserId: number;
  readonly failpointForTests?: (
    event: Readonly<FloodgateV7TeacherCheckpointFailpointEvent>,
  ) => void | Promise<void>;
  readonly writeForTests?: (
    request: Readonly<{
      readonly label: string;
      readonly bytes: Uint8Array;
      readonly offset: number;
      readonly length: number;
    }>,
    write: (maximumBytes?: number) => Promise<number>,
  ) => Promise<number>;
  readonly readForTests?: (
    request: Readonly<{
      readonly purpose: "resumable-prefix" | "sealed-final";
      readonly length: number;
      readonly position: number;
    }>,
    read: (maximumBytes?: number) => Promise<number>,
  ) => Promise<number>;
  readonly closeForTests?: (
    kind: "work" | "stage",
    close: () => Promise<void>,
  ) => Promise<void>;
  readonly scheduleProducerControlTimerForTests?: (
    event: Readonly<FloodgateV7TeacherProducerControlTimerEvent>,
    fire: () => void,
  ) => () => void;
}

export type FloodgateV7TeacherCheckpointV3FailpointPhase =
  FloodgateV7TeacherCheckpointFailpointPhase | "after-milestone-durable";

export interface FloodgateV7TeacherCheckpointV3FailpointEvent {
  readonly phase: FloodgateV7TeacherCheckpointV3FailpointPhase;
  readonly sequence?: number;
  readonly gate?: FloodgateV7TeacherCheckpointV3PrefixGate;
}

export interface FloodgateV7TeacherCheckpointV3Dependencies extends Omit<
  FloodgateV7TeacherCheckpointDependencies,
  "failpointForTests" | "readForTests"
> {
  readonly failpointForTests?: (
    event: Readonly<FloodgateV7TeacherCheckpointV3FailpointEvent>,
  ) => void | Promise<void>;
  readonly readForTests?: (
    request: Readonly<{
      readonly purpose:
        "resumable-prefix" | "durable-prefix-final" | "sealed-final";
      readonly length: number;
      readonly position: number;
    }>,
    read: (maximumBytes?: number) => Promise<number>,
  ) => Promise<number>;
  readonly verifiedParentVisitorForTests?: FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests;
}

export type FloodgateV7TeacherCheckpointV3DeploymentKeyDependenciesForTests =
  Omit<FloodgateV7TeacherCheckpointV3Dependencies, "rootKey">;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
    : T;

export type FloodgateV7TeacherCheckpointV3VerifiedParentEvent = DeepReadonly<{
  contract: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CONTRACT;
  status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_STATUS;
  claim_boundary: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CLAIM_BOUNDARY;
  input_index: number;
  parent: FloodgateTrainingParent;
  completed_evidence: FloodgateV7CompletedParentEvidence;
  completed_evidence_sha256: string;
  entry_mac: string;
}>;

export type FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests = (
  event: Readonly<FloodgateV7TeacherCheckpointV3VerifiedParentEvent>,
) => undefined;

/**
 * Internal backpressured consumer for one scanner-authenticated parent. Unlike
 * the test-only synchronous visitor, the scanner awaits this exact native
 * Promise before it reads or emits the next parent.
 */
export type FloodgateV7TeacherCheckpointV3VerifiedParentSink = (
  event: Readonly<FloodgateV7TeacherCheckpointV3VerifiedParentEvent>,
) => Promise<void>;

export type FloodgateV7TrainingLabelSealedScannerExecutionBoundary =
  | "production-fixed-training-input-and-sealed-scan-key-authorities"
  | "test-only-injected-training-input-and-sealed-scan-key-authorities";

export interface FloodgateV7TrainingLabelSealedScannerOptions {
  readonly runId: string;
  readonly keyId: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly work: Readonly<{
    readonly bytes: number;
    readonly sha256: string;
  }>;
}

/** Public facade deliberately contains no rows, paths, handles, or key bytes. */
export interface FloodgateV7TrainingLabelSealedScanner {
  readonly contract: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CLAIM_BOUNDARY;
  readonly execution_boundary: FloodgateV7TrainingLabelSealedScannerExecutionBoundary;
}

export interface FloodgateV7TrainingLabelSealedScannerReceipt {
  readonly contract: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CONTRACT;
  readonly status: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_RECEIPT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CLAIM_BOUNDARY;
  readonly execution_boundary: FloodgateV7TrainingLabelSealedScannerExecutionBoundary;
  readonly run_id: string;
  readonly key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly teacher_run_binding_sha256: string;
  readonly training: Readonly<{
    readonly binding: Readonly<FloodgateTrainingInputBinding>;
    readonly binding_sha256: string;
    readonly parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
    readonly parent_ids_sha256: string;
    readonly canonical_parents_sha256: string;
  }>;
  readonly stage: Readonly<{
    readonly parent_dev: string;
    readonly parent_ino: string;
    readonly stage_dev: string;
    readonly stage_ino: string;
    readonly stage_basename: string;
    readonly destination_basename: string;
  }>;
  readonly work: Readonly<{
    readonly filename: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME;
    readonly bytes: number;
    readonly sha256: string;
    readonly snapshot: Readonly<{
      readonly dev: string;
      readonly ino: string;
      readonly mode: string;
      readonly nlink: string;
      readonly uid: string;
      readonly size: string;
      readonly mtime_ns: string;
      readonly ctime_ns: string;
    }>;
  }>;
  readonly verification: Readonly<{
    readonly unkeyed_preflight_full_file: true;
    readonly unkeyed_preflight_matches_expected_work: true;
    readonly key_prepared_from_same_held_preflight: true;
    readonly first_pass_without_sink: true;
    readonly second_pass_sink_awaited_with_backpressure: true;
    readonly same_held_work_descriptor: true;
    readonly same_full_work_snapshot: true;
    readonly exact_sealed_records: 24_004;
    readonly exact_completed_parents: 24_000;
    readonly no_unauthenticated_tail: true;
    readonly held_and_named_stage_and_work_confirmed_after_second_pass: true;
  }>;
}

export interface FloodgateV7TrainingLabelSealedScannerOpenResult {
  readonly scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>;
  readonly receipt: Readonly<FloodgateV7TrainingLabelSealedScannerReceipt>;
}

/** No transaction control is exposed; commit and abort remain scanner-owned. */
export interface FloodgateV7TrainingLabelSealedScannerPublicationContext {
  readonly authorizationReceipt: Readonly<
    FloodgateTeacherStageLease["receipt"]
  >;
  readonly stageRoot: string;
  readonly destinationRoot: string;
}

export interface FloodgateV7TrainingLabelSealedScannerTerminalReceipt {
  readonly contract: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_TERMINAL_CONTRACT;
  readonly status: typeof FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_TERMINAL_STATUS;
}

export type FloodgateV7TrainingLabelSealedScannerFailpointPhase =
  | "after-unkeyed-preflight-before-confirmation"
  | "after-unkeyed-confirmation-before-key-prepare"
  | "after-key-claimed-before-first-scan"
  | "after-first-scan-before-confirmation"
  | "after-first-confirmation"
  | "after-second-scan-before-confirmation"
  | "after-second-confirmation-before-registration"
  | "before-replay"
  | "after-replay-scan-before-confirmation"
  | "before-terminal-reverification"
  | "after-terminal-scan-before-confirmation"
  | "after-terminal-key-zeroized";

export interface FloodgateV7TrainingLabelSealedScannerDependenciesForTests {
  readonly readForTests?: (
    request: Readonly<{
      readonly purpose:
        | "unkeyed-preflight"
        | "resumable-prefix"
        | "durable-prefix-final"
        | "sealed-final";
      readonly length: number;
      readonly position: number;
    }>,
    read: (maximumBytes?: number) => Promise<number>,
  ) => Promise<number>;
  readonly failpointForTests?: (
    phase: FloodgateV7TrainingLabelSealedScannerFailpointPhase,
  ) => void | Promise<void>;
  readonly observeKeyForTests?: (key: Uint8Array) => undefined;
  readonly closeForTests?: FloodgateV7TeacherCheckpointDependencies["closeForTests"];
}

export type FloodgateV7TeacherProducerControlTimerPhase =
  "parent-deadline" | "abort-drain";

export interface FloodgateV7TeacherProducerControlTimerEvent {
  readonly phase: FloodgateV7TeacherProducerControlTimerPhase;
  readonly milliseconds: number;
  readonly input_index?: number;
}

export interface FloodgateV7TeacherMissingParentRequest {
  readonly input_index: number;
  readonly parent: Readonly<FloodgateTrainingParent>;
  readonly signal: AbortSignal;
}

export type FloodgateV7TeacherMissingParentProducer = (
  request: Readonly<FloodgateV7TeacherMissingParentRequest>,
) => Promise<Readonly<FloodgateV7CompletedParentInput>>;

export interface FloodgateV7TeacherProducerController {
  readonly produce: FloodgateV7TeacherMissingParentProducer;
  readonly abortAndDrain: () => Promise<void>;
}

export interface FloodgateV7TeacherCheckpointReceipt {
  readonly contract: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA;
  readonly status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY;
  readonly algorithm: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM;
  readonly run_id: string;
  readonly key_id: string;
  readonly stage: Readonly<{
    readonly basename: string;
    readonly parent_dev: string;
    readonly parent_ino: string;
    readonly dev: string;
    readonly ino: string;
  }>;
  readonly work: Readonly<{
    readonly filename: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME;
    readonly format: typeof FORMAT;
    readonly records: number;
    readonly bytes: number;
    readonly sha256: string;
    readonly completed_parents: number;
    readonly resumed_parents: number;
    readonly durability: typeof DURABILITY;
  }>;
}

interface FloodgateV7TeacherCheckpointV3ReceiptCommon {
  readonly contract: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA;
  readonly claim_boundary: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY;
  readonly algorithm: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM;
  readonly run_id: string;
  readonly key_id: string;
  readonly gate_contract: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT;
  readonly stage: Readonly<{
    readonly basename: string;
    readonly parent_dev: string;
    readonly parent_ino: string;
    readonly dev: string;
    readonly ino: string;
  }>;
}

interface FloodgateV7TeacherCheckpointV3WorkReceiptCommon {
  readonly filename: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME;
  readonly format: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT;
  readonly training_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  readonly records: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly resumed_parents: number;
  readonly durability: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY;
}

export type FloodgateV7TeacherCheckpointV3Prefix100Receipt = Readonly<
  FloodgateV7TeacherCheckpointV3ReceiptCommon & {
    readonly gate: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100;
    readonly status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS;
    readonly sealed: false;
    readonly work: Readonly<
      FloodgateV7TeacherCheckpointV3WorkReceiptCommon & {
        readonly target_parents: 100;
        readonly completed_parents: 100;
        readonly milestone_100_mac: string;
        readonly milestone_500_mac: null;
      }
    >;
  }
>;

export type FloodgateV7TeacherCheckpointV3Prefix500Receipt = Readonly<
  FloodgateV7TeacherCheckpointV3ReceiptCommon & {
    readonly gate: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500;
    readonly status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS;
    readonly sealed: false;
    readonly work: Readonly<
      FloodgateV7TeacherCheckpointV3WorkReceiptCommon & {
        readonly target_parents: 500;
        readonly completed_parents: 500;
        readonly milestone_100_mac: string;
        readonly milestone_500_mac: string;
      }
    >;
  }
>;

export type FloodgateV7TeacherCheckpointV3FinalReceipt = Readonly<
  FloodgateV7TeacherCheckpointV3ReceiptCommon & {
    readonly gate: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000;
    readonly status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS;
    readonly sealed: true;
    readonly work: Readonly<
      FloodgateV7TeacherCheckpointV3WorkReceiptCommon & {
        readonly target_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
        readonly completed_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
        readonly milestone_100_mac: string;
        readonly milestone_500_mac: string;
      }
    >;
  }
>;

export type FloodgateV7TeacherCheckpointV3Receipt =
  | FloodgateV7TeacherCheckpointV3Prefix100Receipt
  | FloodgateV7TeacherCheckpointV3Prefix500Receipt
  | FloodgateV7TeacherCheckpointV3FinalReceipt;

function claimV3Receipt(
  registry: WeakSet<object>,
  receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
  label: string,
): Readonly<FloodgateV7TeacherCheckpointV3Receipt> {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    !reflectApply(nativeWeakSetDelete, registry, [receipt])
  ) {
    failure(`${label} requires an exact successful unclaimed receipt`);
  }
  return receipt;
}

/**
 * Consume one exact receipt issued by the fixed production deployment-key V3
 * checkpoint. Shape-equivalent objects and replayed receipts are rejected.
 */
export function claimFloodgateV7ProductionTeacherCheckpointV3Receipt(
  receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
): Readonly<FloodgateV7TeacherCheckpointV3Receipt> {
  if (arguments.length !== 1) {
    failure("production v3 receipt claim accepts exactly one argument");
  }
  return claimV3Receipt(
    productionV3ReceiptClaims,
    receipt,
    "production v3 receipt claim",
  );
}

/**
 * Consume one exact receipt issued by the injected deployment-key V3 test
 * core. This is the only receipt origin accepted by the clean-room test owner.
 */
export function claimFloodgateV7DeploymentKeyTeacherCheckpointV3ReceiptCoreForTests(
  receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
): Readonly<FloodgateV7TeacherCheckpointV3Receipt> {
  if (arguments.length !== 1) {
    failure(
      "test deployment-key v3 receipt claim accepts exactly one argument",
    );
  }
  return claimV3Receipt(
    testDeploymentKeyV3ReceiptClaims,
    receipt,
    "test deployment-key v3 receipt claim",
  );
}

export class FloodgateV7TeacherCheckpointError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Floodgate v7 teacher checkpoint failed: ${message}`, options);
    this.name = "FloodgateV7TeacherCheckpointError";
  }
}

export class FloodgateV7TeacherCheckpointPersistenceIndeterminateError extends FloodgateV7TeacherCheckpointError {
  readonly mayHavePersisted = true as const;

  constructor(message: string, options?: ErrorOptions) {
    super(`persistence is indeterminate: ${message}`, options);
    this.name = "FloodgateV7TeacherCheckpointPersistenceIndeterminateError";
  }
}

export class FloodgateV7TeacherProducerTimeoutError extends FloodgateV7TeacherCheckpointError {
  readonly inputIndex: number;
  readonly timeoutMilliseconds: number;

  constructor(inputIndex: number, timeoutMilliseconds: number) {
    super(
      `producer input ${inputIndex} exceeded its authenticated ${timeoutMilliseconds}ms deadline`,
    );
    this.name = "FloodgateV7TeacherProducerTimeoutError";
    this.inputIndex = inputIndex;
    this.timeoutMilliseconds = timeoutMilliseconds;
  }
}

export type FloodgateV7TeacherAbortDrainControllerStatus =
  "pending" | "fulfilled" | "rejected";

export class FloodgateV7TeacherAbortDrainTimeoutError extends FloodgateV7TeacherCheckpointError {
  readonly timeoutMilliseconds: number;
  readonly pendingRawProducers: number;
  readonly controllerStatus: FloodgateV7TeacherAbortDrainControllerStatus;

  constructor(
    timeoutMilliseconds: number,
    pendingRawProducers: number,
    controllerStatus: FloodgateV7TeacherAbortDrainControllerStatus,
  ) {
    super(
      `producer abort drain exceeded its authenticated ${timeoutMilliseconds}ms bound with ${pendingRawProducers} raw producer(s) pending and controller ${controllerStatus}`,
    );
    this.name = "FloodgateV7TeacherAbortDrainTimeoutError";
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.pendingRawProducers = pendingRawProducers;
    this.controllerStatus = controllerStatus;
  }
}

export class FloodgateV7TeacherProducerCleanupError extends FloodgateV7TeacherCheckpointError {
  readonly primary: unknown;
  readonly cleanupFailure: AggregateError;

  constructor(primary: unknown, cleanupFailures: readonly unknown[]) {
    const cleanupFailure = new AggregateError(
      [...cleanupFailures],
      "producer abort/drain cleanup failed",
      { cause: primary },
    );
    super("producer failed and abort/drain cleanup also failed", {
      cause: primary,
    });
    this.name = "FloodgateV7TeacherProducerCleanupError";
    this.primary = primary;
    this.cleanupFailure = cleanupFailure;
  }
}

interface CapturedTraining {
  readonly binding: Readonly<FloodgateTrainingInputBinding>;
  readonly parents: readonly Readonly<FloodgateTrainingParent>[];
  readonly canonicalParentsSha256: string;
  readonly parentIdsSha256: string;
}

type CapturedCheckpointKeyMaterial = Readonly<
  | {
      readonly kind: "root";
      readonly bytes: Buffer;
    }
  | {
      readonly kind: "v3-derived";
      readonly bytes: Buffer;
    }
>;

interface CapturedInvocation {
  readonly lease: Readonly<FloodgateTeacherStageLease>;
  readonly training: CapturedTraining;
  readonly runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
  readonly producerController: Readonly<FloodgateV7TeacherProducerController>;
  readonly runId: string;
  readonly keyId: string;
  readonly keyMaterial: CapturedCheckpointKeyMaterial;
  readonly effectiveUserId: number;
  readonly failpoint?: FloodgateV7TeacherCheckpointV3Dependencies["failpointForTests"];
  readonly writeForTests?: FloodgateV7TeacherCheckpointDependencies["writeForTests"];
  readonly readForTests?: FloodgateV7TeacherCheckpointV3Dependencies["readForTests"];
  readonly verifiedParentVisitorForTests?: FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests;
  readonly closeForTests?: FloodgateV7TeacherCheckpointDependencies["closeForTests"];
  readonly scheduleProducerControlTimerForTests?: FloodgateV7TeacherCheckpointDependencies["scheduleProducerControlTimerForTests"];
  readonly persistenceState: { mayHaveStarted: boolean };
}

interface CapturedInvocationDependencies {
  readonly keyMaterial: CapturedCheckpointKeyMaterial;
  readonly effectiveUserId: number;
  readonly failpoint?: FloodgateV7TeacherCheckpointV3Dependencies["failpointForTests"];
  readonly writeForTests?: FloodgateV7TeacherCheckpointDependencies["writeForTests"];
  readonly readForTests?: FloodgateV7TeacherCheckpointV3Dependencies["readForTests"];
  readonly verifiedParentVisitorForTests?: FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests;
  readonly closeForTests?: FloodgateV7TeacherCheckpointDependencies["closeForTests"];
  readonly scheduleProducerControlTimerForTests?: FloodgateV7TeacherCheckpointDependencies["scheduleProducerControlTimerForTests"];
}

interface CapturedV3Invocation extends CapturedInvocation {
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
}

interface CapturedV3InvocationArguments {
  readonly lease: Readonly<FloodgateTeacherStageLease>;
  readonly training: CapturedTraining;
  readonly runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
  readonly producerController: Readonly<FloodgateV7TeacherProducerController>;
  readonly runId: string;
  readonly keyId: string;
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
}

interface ScanResult {
  readonly completedParents: number;
  readonly previousMac: string;
  readonly sealed: boolean;
  readonly authenticatedBytes: number;
  readonly tornTail: boolean;
}

interface V3ScanResult extends ScanResult {
  readonly completeRecords: number;
  readonly milestone100Mac: string | undefined;
  readonly milestone500Mac: string | undefined;
}

type WorkScanPolicy = "resumable-prefix" | "sealed-final";
type V3WorkScanPolicy =
  "resumable-prefix" | "durable-prefix-final" | "sealed-final";

interface WorkFileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

interface WorkFileSnapshot extends WorkFileIdentity {
  readonly mode: bigint;
  readonly uid: bigint;
  readonly nlink: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

interface WorkFileScanResult extends ScanResult {
  readonly fileBytes: number;
  readonly fileSha256: string;
  readonly snapshot: WorkFileSnapshot;
}

interface V3WorkFileScanResult extends V3ScanResult {
  readonly fileBytes: number;
  readonly fileSha256: string;
  readonly snapshot: WorkFileSnapshot;
}

function failure(message: string, cause?: unknown): never {
  throw new FloodgateV7TeacherCheckpointError(
    message,
    cause === undefined ? undefined : { cause },
  );
}

function zeroBytes(value: Uint8Array): void {
  reflectApply(nativeTypedArrayFill, value, [0]);
}

function copyExactOwned32ByteKey(value: unknown, label: string): Buffer {
  if (
    !nodeIsUint8Array(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== Uint8Array.prototype ||
    typedArrayBufferGetter === undefined ||
    typedArrayByteLengthGetter === undefined ||
    typedArrayByteOffsetGetter === undefined
  ) {
    failure(`${label} must be a non-shared 32-byte Uint8Array`);
  }
  let buffer: ArrayBufferLike;
  let byteLength: number;
  let byteOffset: number;
  try {
    buffer = reflectApply(typedArrayBufferGetter, value, []) as ArrayBufferLike;
    byteLength = reflectApply(typedArrayByteLengthGetter, value, []) as number;
    byteOffset = reflectApply(typedArrayByteOffsetGetter, value, []) as number;
  } catch (cause) {
    return failure(`${label} typed-array state is inaccessible`, cause);
  }
  if (
    nodeIsSharedArrayBuffer(buffer) ||
    byteLength !== 32 ||
    byteOffset !== 0 ||
    buffer.byteLength !== 32
  ) {
    failure(`${label} must own exactly one non-shared 32-byte buffer`);
  }
  const copied = Buffer.alloc(32);
  try {
    reflectApply(nativeTypedArraySet, copied, [value, 0]);
    return copied;
  } catch (cause) {
    zeroBytes(copied);
    return failure(`${label} could not be copied`, cause);
  }
}

function persistenceFailure(message: string, cause: unknown): never {
  throw new FloodgateV7TeacherCheckpointPersistenceIndeterminateError(message, {
    cause,
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function exactStringList(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function sealedStagePrefixState(
  values: readonly string[],
): (typeof V3_SEALED_STAGE_PREFIX_STATES)[number] | undefined {
  const entries = [...values].sort(compareUtf8);
  return V3_SEALED_STAGE_PREFIX_STATES.find((state) =>
    exactStringList(entries, state),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeIsProxy(value)
  ) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value))
    failure(`${label} must be a plain non-Proxy object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    failure(`${label} must not contain symbol keys`);
  }
  const actual = (keys as string[]).sort(compareUtf8);
  const expected = [...expectedKeys].sort(compareUtf8);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    failure(`${label} keys are not exact`);
  }
  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      failure(`${label}.${key} must be an enumerable own data property`);
    }
    captured[key] = descriptor.value;
  }
  return Object.freeze(captured);
}

function strictArray(value: unknown, label: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== Array.prototype
  ) {
    failure(`${label} must be an ordinary non-Proxy array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = value.length;
  if (reflectOwnKeys(descriptors).length !== length + 1) {
    failure(`${label} must be dense and contain no extra properties`);
  }
  const captured: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      failure(`${label}[${index}] must be an enumerable own data property`);
    }
    captured.push(descriptor.value);
  }
  return Object.freeze(captured);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      failure("canonical JSON rejects nonfinite numbers and negative zero");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${strictArray(value, "canonical JSON array")
      .map((entry) => canonicalJson(entry))
      .join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = reflectOwnKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      failure("canonical JSON rejects symbol keys");
    }
    return `{${(keys as string[])
      .sort(compareUtf8)
      .map((key) => {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          failure(`canonical JSON property ${key} is not enumerable data`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(descriptor.value)}`;
      })
      .join(",")}}`;
  }
  return failure(`canonical JSON rejects ${typeof value}`);
}

function deepCapture(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      failure("captured JSON rejects nonfinite numbers and negative zero");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      strictArray(value, "captured JSON array").map((entry) =>
        deepCapture(entry),
      ),
    );
  }
  if (isPlainRecord(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = reflectOwnKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) {
      failure("captured JSON rejects symbol keys");
    }
    const captured = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        failure(`captured JSON property ${key} is not enumerable data`);
      }
      captured[key] = deepCapture(descriptor.value);
    }
    return Object.freeze(captured);
  }
  return failure(`captured JSON rejects ${typeof value}`);
}

function frozen<T extends object>(value: T): Readonly<T> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    output[key] = (value as Record<string, unknown>)[key];
  }
  return Object.freeze(output) as Readonly<T>;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function identifierDigest(values: readonly string[]): string {
  return sha256Hex([...new Set(values)].sort(compareUtf8).join("\n"));
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256Hex(`${domain}${canonicalJson(value)}`);
}

function requiredSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    failure(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requiredSemanticId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SEMANTIC_ID_RE.test(value)) {
    failure(`${label} must be a canonical semantic identifier`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    failure(`${label} must be a safe integer at least ${minimum}`);
  }
  // JSON.parse accepts the signed token `-0`, but the authenticated stream has
  // one canonical representation for zero. Normalize it at capture so later
  // parent IDs, bindings, and canonical hashes all observe the same value.
  return Object.is(value, -0) ? 0 : (value as number);
}

function requiredProducerControlTimerMilliseconds(
  value: unknown,
  label: string,
): number {
  const milliseconds = requiredInteger(value, label, 1);
  if (milliseconds > FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_MAX_TIMER_MS) {
    failure(
      `${label} must be at most ${FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_MAX_TIMER_MS}`,
    );
  }
  return milliseconds;
}

/** Exact integer-capture seam for signed-zero and bound regression tests. */
export const captureFloodgateV7TeacherCheckpointIntegerCoreForTests =
  requiredInteger;

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256Hex(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function captureParent(
  value: unknown,
  index: number,
): Readonly<FloodgateTrainingParent> {
  const row = strictRecord(value, PARENT_KEYS, `training.rows[${index}]`);
  if (row.schema_version !== 1) {
    failure(`training.rows[${index}].schema_version must be 1`);
  }
  const gameId = requiredSemanticId(
    row.game_id,
    `training.rows[${index}].game_id`,
  );
  const parentId = requiredSemanticId(
    row.parent_id,
    `training.rows[${index}].parent_id`,
  );
  const positionId = requiredSemanticId(
    row.position_id,
    `training.rows[${index}].position_id`,
  );
  const ply = requiredInteger(row.ply, `training.rows[${index}].ply`);
  if (ply > 2_147_483_647 || parentId !== parentOccurrenceId(gameId, ply)) {
    failure(`training.rows[${index}] parent occurrence identity is invalid`);
  }
  if (
    typeof row.parent_sfen !== "string" ||
    row.parent_sfen.length === 0 ||
    row.parent_sfen.trim() !== row.parent_sfen ||
    row.parent_sfen.includes("\0") ||
    typeof row.played_move !== "string" ||
    row.played_move.length === 0 ||
    row.played_move.trim() !== row.played_move ||
    row.played_move.includes("\0")
  ) {
    failure(`training.rows[${index}] SFEN or played move is invalid`);
  }
  let parsed: ReturnType<typeof positionFromSfen>;
  try {
    parsed = positionFromSfen(row.parent_sfen);
  } catch (cause) {
    return failure(`training.rows[${index}] SFEN cannot be parsed`, cause);
  }
  if (
    toSfen(parsed.position, parsed.moveNumber) !== row.parent_sfen ||
    parsed.moveNumber !== ply + 1 ||
    positionKeyFromSfen(row.parent_sfen) !== positionId
  ) {
    failure(`training.rows[${index}] SFEN binding is inconsistent`);
  }
  const legal = rulesCompleteLegalMoves(parsed.position);
  if (
    legal.length === 0 ||
    legal.some((move) => getKomashu(move.move.capture) === OU) ||
    !legal.some((move) => move.usi === row.played_move)
  ) {
    failure(`training.rows[${index}] played move is not rules-complete legal`);
  }
  return frozen({
    schema_version: 1 as const,
    game_id: gameId,
    parent_id: parentId,
    position_id: positionId,
    parent_sfen: row.parent_sfen,
    ply,
    played_move: row.played_move,
  });
}

function captureBinding(
  value: unknown,
): Readonly<FloodgateTrainingInputBinding> {
  const binding = strictRecord(value, BINDING_KEYS, "training.binding");
  for (const key of [
    "bundle_manifest_sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
    "raw_sha256",
    "result_receipt_sha256",
  ] as const) {
    requiredSha256(binding[key], `training.binding.${key}`);
  }
  for (const key of [
    "bundle_producer_revision",
    "verifier_revision",
  ] as const) {
    if (typeof binding[key] !== "string" || !REVISION_RE.test(binding[key])) {
      failure(`training.binding.${key} must be a lowercase revision`);
    }
  }
  for (const key of [
    "bundle_manifest_bytes",
    "games",
    "position_ids_count",
    "raw_bytes",
    "records",
    "result_receipt_bytes",
  ] as const) {
    requiredInteger(binding[key], `training.binding.${key}`, 1);
  }
  if (
    (binding.records as number) > FLOODGATE_STABLE_MAX_ROWS ||
    (binding.games as number) > FLOODGATE_STABLE_MAX_ROWS ||
    (binding.position_ids_count as number) > FLOODGATE_STABLE_MAX_ROWS ||
    typeof binding.raw_format !== "string" ||
    binding.raw_format.length === 0 ||
    binding.raw_format.trim() !== binding.raw_format
  ) {
    failure("training.binding aggregate bound or raw format is invalid");
  }
  return Object.freeze(
    deepCapture(binding),
  ) as Readonly<FloodgateTrainingInputBinding>;
}

function captureTraining(
  value: AuthenticatedFloodgateTrainingRows,
): CapturedTraining {
  const input = strictRecord(value, INPUT_KEYS, "authenticated training rows");
  if (
    input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    input.role !== "training"
  ) {
    failure("authenticated training row schema or role is unsupported");
  }
  const binding = captureBinding(input.binding);
  const rowValues = strictArray(input.rows, "training.rows");
  if (
    rowValues.length === 0 ||
    rowValues.length > FLOODGATE_STABLE_MAX_ROWS ||
    rowValues.length !== binding.records
  ) {
    failure("training row count is outside its exact authenticated bound");
  }
  const parents = rowValues.map((row, index) => captureParent(row, index));
  const gameIds = new Set<string>();
  const parentIds = new Set<string>();
  const positionIds = new Set<string>();
  let previousParentId: string | undefined;
  for (const parent of parents) {
    if (
      previousParentId !== undefined &&
      compareUtf8(previousParentId, parent.parent_id) >= 0
    ) {
      failure("training rows are not in strict parent_id byte order");
    }
    previousParentId = parent.parent_id;
    if (
      parentIds.has(parent.parent_id) ||
      positionIds.has(parent.position_id)
    ) {
      failure("training rows duplicate a parent or semantic position");
    }
    gameIds.add(parent.game_id);
    parentIds.add(parent.parent_id);
    positionIds.add(parent.position_id);
  }
  if (
    gameIds.size !== binding.games ||
    parentIds.size !== binding.records ||
    positionIds.size !== binding.position_ids_count ||
    identifierDigest([...gameIds]) !== binding.game_ids_sha256 ||
    identifierDigest([...parentIds]) !== binding.parent_ids_sha256 ||
    identifierDigest([...positionIds]) !== binding.position_ids_sha256
  ) {
    failure("training aggregate identities do not match their binding");
  }
  const parentStream = `${parents.map((parent) => canonicalJson(parent)).join("\n")}\n`;
  return Object.freeze({
    binding,
    parents: Object.freeze(parents),
    canonicalParentsSha256: sha256Hex(`${PARENT_STREAM_DOMAIN}${parentStream}`),
    parentIdsSha256: identifierDigest([...parentIds]),
  });
}

function captureRunBinding(
  value: FloodgateV7TeacherCheckpointRunBinding,
): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  const binding = strictRecord(value, RUN_BINDING_KEYS, "run binding");
  if (binding.schema !== FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA) {
    failure("run binding schema is unsupported");
  }
  const plan = strictRecord(binding.plan, IDENTITY_KEYS, "run binding.plan");
  if (
    plan.bytes !== FLOODGATE_FRESH_SIBLING_PLAN_BYTES ||
    plan.sha256 !== FLOODGATE_FRESH_SIBLING_PLAN_SHA256
  ) {
    failure("run binding does not bind the pinned v7 plan");
  }
  const producerControl = strictRecord(
    binding.producer_control,
    PRODUCER_CONTROL_KEYS,
    "run binding.producer_control",
  );
  if (producerControl.schema !== FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA) {
    failure("run binding producer control schema is unsupported");
  }
  const parentDeadlineMilliseconds = requiredProducerControlTimerMilliseconds(
    producerControl.parent_deadline_ms,
    "run binding.producer_control.parent_deadline_ms",
  );
  const abortDrainMilliseconds = requiredProducerControlTimerMilliseconds(
    producerControl.abort_drain_ms,
    "run binding.producer_control.abort_drain_ms",
  );
  if (
    producerControl.max_in_flight !==
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT
  ) {
    failure("run binding producer control max_in_flight is unsupported");
  }
  if (
    producerControl.cancel_policy !==
    FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY
  ) {
    failure("run binding producer cancel policy is unsupported");
  }
  if (
    producerControl.late_settlement_policy !==
    FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY
  ) {
    failure("run binding producer late-settlement policy is unsupported");
  }
  return frozen({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: frozen({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    }),
    producer_control: frozen({
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms: parentDeadlineMilliseconds,
      abort_drain_ms: abortDrainMilliseconds,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256: requiredSha256(
      binding.stable_runtime_receipt_sha256,
      "run binding.stable_runtime_receipt_sha256",
    ),
    teacher_usi_runtime_receipt_sha256: requiredSha256(
      binding.teacher_usi_runtime_receipt_sha256,
      "run binding.teacher_usi_runtime_receipt_sha256",
    ),
  });
}

function finishCapturedInvocation(
  lease: Readonly<FloodgateTeacherStageLease>,
  trainingValue: AuthenticatedFloodgateTrainingRows,
  runBindingValue: FloodgateV7TeacherCheckpointRunBinding,
  produce: FloodgateV7TeacherMissingParentProducer,
  abortAndDrain: () => Promise<void>,
  runId: string,
  keyId: string,
  dependencies: Readonly<CapturedInvocationDependencies>,
): CapturedInvocation {
  try {
    return Object.freeze({
      lease,
      training: captureTraining(trainingValue),
      runBinding: captureRunBinding(runBindingValue),
      producerController: Object.freeze({ produce, abortAndDrain }),
      runId,
      keyId,
      keyMaterial: dependencies.keyMaterial,
      effectiveUserId: dependencies.effectiveUserId,
      failpoint: dependencies.failpoint,
      writeForTests: dependencies.writeForTests,
      readForTests: dependencies.readForTests,
      verifiedParentVisitorForTests: dependencies.verifiedParentVisitorForTests,
      closeForTests: dependencies.closeForTests,
      scheduleProducerControlTimerForTests:
        dependencies.scheduleProducerControlTimerForTests,
      persistenceState: { mayHaveStarted: false },
    });
  } catch (cause) {
    zeroBytes(dependencies.keyMaterial.bytes);
    throw cause;
  }
}

function captureInvocation(
  lease: Readonly<FloodgateTeacherStageLease>,
  trainingValue: AuthenticatedFloodgateTrainingRows,
  runBindingValue: FloodgateV7TeacherCheckpointRunBinding,
  producerControllerValue: FloodgateV7TeacherProducerController,
  optionsValue: FloodgateV7TeacherCheckpointOptions,
  dependenciesValue:
    | FloodgateV7TeacherCheckpointDependencies
    | FloodgateV7TeacherCheckpointV3Dependencies
    | undefined,
  allowVerifiedParentVisitorForTests: boolean,
  capturedDependencies?: Readonly<CapturedInvocationDependencies>,
): CapturedInvocation {
  const stageReceipt = lease.receipt;
  if (
    stageReceipt.contract !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    stageReceipt.trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    stageReceipt.status !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS ||
    canonicalJson(stageReceipt.allowed_entries) !==
      canonicalJson(FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES)
  ) {
    failure("authorized stage lease receipt boundary is unsupported");
  }
  const options = strictRecord(optionsValue, ["keyId", "runId"], "options");
  if (typeof options.runId !== "string" || !RUN_ID_RE.test(options.runId)) {
    failure("options.runId must be 32 bytes of lowercase hex");
  }
  if (typeof options.keyId !== "string" || !KEY_ID_RE.test(options.keyId)) {
    failure("options.keyId is invalid");
  }
  const producerControllerRecord = strictRecord(
    producerControllerValue,
    ["abortAndDrain", "produce"],
    "producerController",
  );
  const produce = producerControllerRecord.produce;
  const abortAndDrain = producerControllerRecord.abortAndDrain;
  if (typeof produce !== "function" || nodeIsProxy(produce)) {
    failure("producerController.produce must be a non-Proxy function");
  }
  if (typeof abortAndDrain !== "function" || nodeIsProxy(abortAndDrain)) {
    failure("producerController.abortAndDrain must be a non-Proxy function");
  }
  if (capturedDependencies !== undefined) {
    return finishCapturedInvocation(
      lease,
      trainingValue,
      runBindingValue,
      produce as FloodgateV7TeacherMissingParentProducer,
      abortAndDrain as () => Promise<void>,
      options.runId as string,
      options.keyId as string,
      capturedDependencies,
    );
  }
  if (!isPlainRecord(dependenciesValue)) {
    failure("dependencies must be a plain non-Proxy object");
  }
  const optionalKeys = [
    "closeForTests",
    "failpointForTests",
    "readForTests",
    "scheduleProducerControlTimerForTests",
    "writeForTests",
  ];
  if (allowVerifiedParentVisitorForTests) {
    optionalKeys.push("verifiedParentVisitorForTests");
  }
  const expectedDependencyKeys = ["effectiveUserId", "rootKey"];
  for (const key of optionalKeys) {
    if (Object.prototype.hasOwnProperty.call(dependenciesValue, key)) {
      expectedDependencyKeys.push(key);
    }
  }
  const dependencies = strictRecord(
    dependenciesValue,
    expectedDependencyKeys,
    "dependencies",
  );
  const effectiveUserId = requiredInteger(
    dependencies.effectiveUserId,
    "dependencies.effectiveUserId",
  );
  const rootKey = copyExactOwned32ByteKey(
    dependencies.rootKey,
    "dependencies.rootKey",
  );
  const failpoint = dependencies.failpointForTests as
    FloodgateV7TeacherCheckpointV3Dependencies["failpointForTests"] | undefined;
  const writeForTests = dependencies.writeForTests as
    FloodgateV7TeacherCheckpointDependencies["writeForTests"] | undefined;
  const readForTests = dependencies.readForTests as
    FloodgateV7TeacherCheckpointV3Dependencies["readForTests"] | undefined;
  const verifiedParentVisitorForTests = allowVerifiedParentVisitorForTests
    ? (dependencies.verifiedParentVisitorForTests as
        FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests | undefined)
    : undefined;
  const closeForTests = dependencies.closeForTests as
    FloodgateV7TeacherCheckpointDependencies["closeForTests"] | undefined;
  const scheduleProducerControlTimerForTests =
    dependencies.scheduleProducerControlTimerForTests as
      | FloodgateV7TeacherCheckpointDependencies["scheduleProducerControlTimerForTests"]
      | undefined;
  if (
    failpoint !== undefined &&
    (typeof failpoint !== "function" || nodeIsProxy(failpoint))
  ) {
    zeroBytes(rootKey);
    failure("dependencies.failpointForTests must be a function");
  }
  if (
    writeForTests !== undefined &&
    (typeof writeForTests !== "function" || nodeIsProxy(writeForTests))
  ) {
    zeroBytes(rootKey);
    failure("dependencies.writeForTests must be a function");
  }
  if (
    readForTests !== undefined &&
    (typeof readForTests !== "function" || nodeIsProxy(readForTests))
  ) {
    zeroBytes(rootKey);
    failure("dependencies.readForTests must be a function");
  }
  if (
    verifiedParentVisitorForTests !== undefined &&
    (typeof verifiedParentVisitorForTests !== "function" ||
      nodeIsProxy(verifiedParentVisitorForTests))
  ) {
    zeroBytes(rootKey);
    failure(
      "dependencies.verifiedParentVisitorForTests must be a non-Proxy function",
    );
  }
  if (
    closeForTests !== undefined &&
    (typeof closeForTests !== "function" || nodeIsProxy(closeForTests))
  ) {
    zeroBytes(rootKey);
    failure("dependencies.closeForTests must be a function");
  }
  if (
    scheduleProducerControlTimerForTests !== undefined &&
    (typeof scheduleProducerControlTimerForTests !== "function" ||
      nodeIsProxy(scheduleProducerControlTimerForTests))
  ) {
    zeroBytes(rootKey);
    failure(
      "dependencies.scheduleProducerControlTimerForTests must be a function",
    );
  }
  return finishCapturedInvocation(
    lease,
    trainingValue,
    runBindingValue,
    produce as FloodgateV7TeacherMissingParentProducer,
    abortAndDrain as () => Promise<void>,
    options.runId as string,
    options.keyId as string,
    Object.freeze({
      keyMaterial: Object.freeze({ kind: "root" as const, bytes: rootKey }),
      effectiveUserId,
      failpoint,
      writeForTests,
      readForTests,
      verifiedParentVisitorForTests,
      closeForTests,
      scheduleProducerControlTimerForTests,
    }),
  );
}

function captureV3Gate(value: unknown): FloodgateV7TeacherCheckpointV3Gate {
  switch (value) {
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100:
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500:
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000:
      return value;
    default:
      return failure("options.gate is not a supported fixed v3 gate");
  }
}

function finishCapturedV3Invocation(
  invocation: CapturedInvocation,
  gate: FloodgateV7TeacherCheckpointV3Gate,
): CapturedV3Invocation {
  try {
    if (
      invocation.training.parents.length !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS
    ) {
      failure("v3 gates require the exact full 24000-parent training input");
    }
    return Object.freeze({ ...invocation, gate });
  } catch (cause) {
    zeroBytes(invocation.keyMaterial.bytes);
    throw cause;
  }
}

function captureV3Invocation(
  lease: Readonly<FloodgateTeacherStageLease>,
  trainingValue: AuthenticatedFloodgateTrainingRows,
  runBindingValue: FloodgateV7TeacherCheckpointRunBinding,
  producerControllerValue: FloodgateV7TeacherProducerController,
  optionsValue: FloodgateV7TeacherCheckpointV3Options,
  dependenciesValue: FloodgateV7TeacherCheckpointV3Dependencies,
): CapturedV3Invocation {
  const options = strictRecord(
    optionsValue,
    ["gate", "keyId", "runId"],
    "options",
  );
  const gate = captureV3Gate(options.gate);
  const invocation = captureInvocation(
    lease,
    trainingValue,
    runBindingValue,
    producerControllerValue,
    frozen({
      runId: options.runId as string,
      keyId: options.keyId as string,
    }),
    dependenciesValue,
    true,
  );
  return finishCapturedV3Invocation(invocation, gate);
}

function captureV3InvocationArguments(
  lease: Readonly<FloodgateTeacherStageLease>,
  trainingValue: AuthenticatedFloodgateTrainingRows,
  runBindingValue: FloodgateV7TeacherCheckpointRunBinding,
  producerControllerValue: FloodgateV7TeacherProducerController,
  optionsValue: FloodgateV7TeacherCheckpointV3Options,
): CapturedV3InvocationArguments {
  const stageReceipt = lease.receipt;
  if (
    stageReceipt.contract !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    stageReceipt.trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    stageReceipt.status !== FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS ||
    canonicalJson(stageReceipt.allowed_entries) !==
      canonicalJson(FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES)
  ) {
    failure("authorized stage lease receipt boundary is unsupported");
  }
  const options = strictRecord(
    optionsValue,
    ["gate", "keyId", "runId"],
    "options",
  );
  const gate = captureV3Gate(options.gate);
  if (typeof options.runId !== "string" || !RUN_ID_RE.test(options.runId)) {
    failure("options.runId must be 32 bytes of lowercase hex");
  }
  if (typeof options.keyId !== "string" || !KEY_ID_RE.test(options.keyId)) {
    failure("options.keyId is invalid");
  }
  const producerControllerRecord = strictRecord(
    producerControllerValue,
    ["abortAndDrain", "produce"],
    "producerController",
  );
  const produce = producerControllerRecord.produce;
  const abortAndDrain = producerControllerRecord.abortAndDrain;
  if (typeof produce !== "function" || nodeIsProxy(produce)) {
    failure("producerController.produce must be a non-Proxy function");
  }
  if (typeof abortAndDrain !== "function" || nodeIsProxy(abortAndDrain)) {
    failure("producerController.abortAndDrain must be a non-Proxy function");
  }
  const training = captureTraining(trainingValue);
  if (
    training.parents.length !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS
  ) {
    failure("v3 gates require the exact full 24000-parent training input");
  }
  return Object.freeze({
    lease,
    training,
    runBinding: captureRunBinding(runBindingValue),
    producerController: Object.freeze({
      produce: produce as FloodgateV7TeacherMissingParentProducer,
      abortAndDrain: abortAndDrain as () => Promise<void>,
    }),
    runId: options.runId,
    keyId: options.keyId,
    gate,
  });
}

function captureV3InvocationWithDerivedKey(
  captured: Readonly<CapturedV3InvocationArguments>,
  derivedKey: Buffer,
  dependencies: Omit<CapturedInvocationDependencies, "keyMaterial">,
): CapturedV3Invocation {
  try {
    return Object.freeze({
      ...captured,
      keyMaterial: Object.freeze({
        kind: "v3-derived" as const,
        bytes: derivedKey,
      }),
      effectiveUserId: dependencies.effectiveUserId,
      failpoint: dependencies.failpoint,
      writeForTests: dependencies.writeForTests,
      readForTests: dependencies.readForTests,
      verifiedParentVisitorForTests: dependencies.verifiedParentVisitorForTests,
      closeForTests: dependencies.closeForTests,
      scheduleProducerControlTimerForTests:
        dependencies.scheduleProducerControlTimerForTests,
      persistenceState: { mayHaveStarted: false },
    });
  } catch (cause) {
    zeroBytes(derivedKey);
    throw cause;
  }
}

function captureV3DeploymentKeyDependenciesForTests(
  dependenciesValue: FloodgateV7TeacherCheckpointV3DeploymentKeyDependenciesForTests,
): Omit<CapturedInvocationDependencies, "keyMaterial"> {
  if (!isPlainRecord(dependenciesValue)) {
    failure("dependencies must be a plain non-Proxy object");
  }
  const optionalKeys = [
    "closeForTests",
    "failpointForTests",
    "readForTests",
    "scheduleProducerControlTimerForTests",
    "verifiedParentVisitorForTests",
    "writeForTests",
  ];
  const expectedDependencyKeys = ["effectiveUserId"];
  for (const key of optionalKeys) {
    if (Object.prototype.hasOwnProperty.call(dependenciesValue, key)) {
      expectedDependencyKeys.push(key);
    }
  }
  const dependencies = strictRecord(
    dependenciesValue,
    expectedDependencyKeys,
    "dependencies",
  );
  const effectiveUserId = requiredInteger(
    dependencies.effectiveUserId,
    "dependencies.effectiveUserId",
  );
  const failpoint = dependencies.failpointForTests as
    FloodgateV7TeacherCheckpointV3Dependencies["failpointForTests"] | undefined;
  const writeForTests = dependencies.writeForTests as
    FloodgateV7TeacherCheckpointDependencies["writeForTests"] | undefined;
  const readForTests = dependencies.readForTests as
    FloodgateV7TeacherCheckpointV3Dependencies["readForTests"] | undefined;
  const verifiedParentVisitorForTests =
    dependencies.verifiedParentVisitorForTests as
      FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests | undefined;
  const closeForTests = dependencies.closeForTests as
    FloodgateV7TeacherCheckpointDependencies["closeForTests"] | undefined;
  const scheduleProducerControlTimerForTests =
    dependencies.scheduleProducerControlTimerForTests as
      | FloodgateV7TeacherCheckpointDependencies["scheduleProducerControlTimerForTests"]
      | undefined;
  if (
    failpoint !== undefined &&
    (typeof failpoint !== "function" || nodeIsProxy(failpoint))
  ) {
    failure("dependencies.failpointForTests must be a function");
  }
  if (
    writeForTests !== undefined &&
    (typeof writeForTests !== "function" || nodeIsProxy(writeForTests))
  ) {
    failure("dependencies.writeForTests must be a function");
  }
  if (
    readForTests !== undefined &&
    (typeof readForTests !== "function" || nodeIsProxy(readForTests))
  ) {
    failure("dependencies.readForTests must be a function");
  }
  if (
    verifiedParentVisitorForTests !== undefined &&
    (typeof verifiedParentVisitorForTests !== "function" ||
      nodeIsProxy(verifiedParentVisitorForTests))
  ) {
    failure(
      "dependencies.verifiedParentVisitorForTests must be a non-Proxy function",
    );
  }
  if (
    closeForTests !== undefined &&
    (typeof closeForTests !== "function" || nodeIsProxy(closeForTests))
  ) {
    failure("dependencies.closeForTests must be a function");
  }
  if (
    scheduleProducerControlTimerForTests !== undefined &&
    (typeof scheduleProducerControlTimerForTests !== "function" ||
      nodeIsProxy(scheduleProducerControlTimerForTests))
  ) {
    failure(
      "dependencies.scheduleProducerControlTimerForTests must be a function",
    );
  }
  return Object.freeze({
    effectiveUserId,
    failpoint,
    writeForTests,
    readForTests,
    verifiedParentVisitorForTests,
    closeForTests,
    scheduleProducerControlTimerForTests,
  });
}

function deploymentV3KeyRequest(
  captured: Readonly<CapturedV3InvocationArguments>,
): Readonly<FloodgateV7DeploymentTeacherCheckpointV3KeyRequest> {
  if (captured.keyId !== FLOODGATE_V7_DEPLOYMENT_KEY_ID) {
    failure("options.keyId is not the fixed deployment key id");
  }
  return Object.freeze({
    runId: captured.runId,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding:
      captured.runBinding as Readonly<FloodgateV7DeploymentTeacherRunBinding>,
    stageAuthorizationReceipt: captured.lease.receipt,
    gate: captured.gate,
  });
}

type DeploymentV3KeyClaim<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
> = (
  authorization: Readonly<
    FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization<TBoundary>
  >,
  request: FloodgateV7DeploymentTeacherCheckpointV3KeyRequest,
) => Uint8Array;

function claimAndCopyDeploymentV3Key<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
>(
  claim: DeploymentV3KeyClaim<TBoundary>,
  authorization: Readonly<
    FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization<TBoundary>
  >,
  request: Readonly<FloodgateV7DeploymentTeacherCheckpointV3KeyRequest>,
): Buffer {
  let claimed: Uint8Array | undefined;
  let copied: Buffer | undefined;
  try {
    claimed = claim(authorization, request);
    copied = copyExactOwned32ByteKey(
      claimed,
      "claimed v3 checkpoint derived key",
    );
    return copied;
  } finally {
    if (claimed !== undefined) {
      try {
        zeroBytes(claimed);
      } catch (cause) {
        if (copied !== undefined) zeroBytes(copied);
        failure(
          "claimed v3 checkpoint derived key could not be zeroized",
          cause,
        );
      }
    }
  }
}

function hmacHex(
  key: Uint8Array,
  domain: string,
  payload: Readonly<Record<string, unknown>>,
): string {
  return createHmac("sha256", key)
    .update(domain, "utf8")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
}

function withoutKey(
  record: Readonly<Record<string, unknown>>,
  removed: string,
): Readonly<Record<string, unknown>> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== removed) output[key] = record[key];
  }
  return Object.freeze(output);
}

function macEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string" || !SHA256_RE.test(actual)) return false;
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(expected, "hex");
  return left.byteLength === 32 && timingSafeEqual(left, right);
}

function stageBinding(
  invocation: CapturedInvocation,
): Readonly<Record<string, unknown>> {
  const receipt = invocation.lease.receipt;
  return frozen({
    authorization_contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
    authorization_trust_boundary:
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
    stage_basename: receipt.stage_basename,
    parent_dev: receipt.parent_identity.dev.toString(10),
    parent_ino: receipt.parent_identity.ino.toString(10),
    stage_dev: receipt.stage_identity.dev.toString(10),
    stage_ino: receipt.stage_identity.ino.toString(10),
  });
}

function headerPayload(
  invocation: CapturedInvocation,
): Readonly<Record<string, unknown>> {
  return frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
    kind: "header",
    run_id: invocation.runId,
    key_id: invocation.keyId,
    algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_PREFIX_STATUS,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
    stage_binding: stageBinding(invocation),
    training: frozen({
      schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
      role: "training",
      binding: invocation.training.binding,
      records: invocation.training.parents.length,
      parent_ids_sha256: invocation.training.parentIdsSha256,
      canonical_parents_sha256: invocation.training.canonicalParentsSha256,
    }),
    run_binding: invocation.runBinding,
  });
}

function buildHeader(
  invocation: CapturedInvocation,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const payload = headerPayload(invocation);
  return frozen({
    ...payload,
    header_mac: hmacHex(key, HEADER_DOMAIN, payload),
  });
}

function sealPayload(
  invocation: CapturedInvocation,
  previousMac: string,
): Readonly<Record<string, unknown>> {
  return frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
    kind: "seal",
    entries: invocation.training.parents.length,
    final_entry_mac: previousMac,
    parent_ids_sha256: invocation.training.parentIdsSha256,
    training_parents_sha256: invocation.training.canonicalParentsSha256,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
  });
}

function buildSeal(
  invocation: CapturedInvocation,
  previousMac: string,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const payload = sealPayload(invocation, previousMac);
  return frozen({ ...payload, seal_mac: hmacHex(key, SEAL_DOMAIN, payload) });
}

interface V3GatePlan {
  readonly targetParents:
    100 | 500 | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  readonly sealed: boolean;
}

function v3GatePlan(
  gate: FloodgateV7TeacherCheckpointV3Gate,
): Readonly<V3GatePlan> {
  switch (gate) {
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100:
      return frozen({ targetParents: 100 as const, sealed: false });
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500:
      return frozen({ targetParents: 500 as const, sealed: false });
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000:
      return frozen({
        targetParents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        sealed: true,
      });
  }
}

function v3HeaderPayload(
  invocation: CapturedV3Invocation,
): Readonly<Record<string, unknown>> {
  return frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    kind: "header",
    run_id: invocation.runId,
    key_id: invocation.keyId,
    algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_IN_PROGRESS_STATUS,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
    stage_binding: stageBinding(invocation),
    training: frozen({
      schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
      role: "training",
      binding: invocation.training.binding,
      records: invocation.training.parents.length,
      parent_ids_sha256: invocation.training.parentIdsSha256,
      canonical_parents_sha256: invocation.training.canonicalParentsSha256,
    }),
    run_binding: invocation.runBinding,
    gate_contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  });
}

function buildV3Header(
  invocation: CapturedV3Invocation,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const payload = v3HeaderPayload(invocation);
  return frozen({
    ...payload,
    header_mac: hmacHex(key, V3_HEADER_DOMAIN, payload),
  });
}

function buildV3Entry(
  invocation: CapturedInvocation,
  evidence: Readonly<Record<string, unknown>>,
  sequence: number,
  previousMac: string,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const parent = invocation.training.parents[sequence];
  const payload = frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    kind: "completed-parent",
    sequence,
    input_index: sequence,
    parent_id: parent.parent_id,
    parent,
    previous_mac: previousMac,
    completed_evidence_sha256: digestCanonical(EVIDENCE_DOMAIN, evidence),
    completed_evidence: evidence,
  });
  return frozen({
    ...payload,
    entry_mac: hmacHex(key, V3_ENTRY_DOMAIN, payload),
  });
}

function v3PrefixParentIdsSha256(
  invocation: CapturedV3Invocation,
  completedParents: 100 | 500,
): string {
  return identifierDigest(
    invocation.training.parents
      .slice(0, completedParents)
      .map((parent) => parent.parent_id),
  );
}

function v3MilestoneDomain(
  gate: FloodgateV7TeacherCheckpointV3PrefixGate,
): string {
  return gate === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
    ? V3_MILESTONE_100_DOMAIN
    : V3_MILESTONE_500_DOMAIN;
}

function v3MilestoneCompletedParents(
  gate: FloodgateV7TeacherCheckpointV3PrefixGate,
): 100 | 500 {
  return gate === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
    ? 100
    : 500;
}

function v3MilestonePayload(
  invocation: CapturedV3Invocation,
  gate: FloodgateV7TeacherCheckpointV3PrefixGate,
  previousMac: string,
): Readonly<Record<string, unknown>> {
  const completedParents = v3MilestoneCompletedParents(gate);
  return frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    kind: "durable-prefix-milestone",
    gate,
    completed_parents: completedParents,
    previous_mac: previousMac,
    prefix_parent_ids_sha256: v3PrefixParentIdsSha256(
      invocation,
      completedParents,
    ),
    training_parent_ids_sha256: invocation.training.parentIdsSha256,
    training_parents_sha256: invocation.training.canonicalParentsSha256,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  });
}

function buildV3Milestone(
  invocation: CapturedV3Invocation,
  gate: FloodgateV7TeacherCheckpointV3PrefixGate,
  previousMac: string,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const payload = v3MilestonePayload(invocation, gate, previousMac);
  return frozen({
    ...payload,
    milestone_mac: hmacHex(key, v3MilestoneDomain(gate), payload),
  });
}

function v3SealPayload(
  invocation: CapturedV3Invocation,
  previousMac: string,
  milestone100Mac: string,
  milestone500Mac: string,
): Readonly<Record<string, unknown>> {
  return frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    kind: "seal",
    entries: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
    final_entry_mac: previousMac,
    milestone_100_mac: milestone100Mac,
    milestone_500_mac: milestone500Mac,
    parent_ids_sha256: invocation.training.parentIdsSha256,
    training_parents_sha256: invocation.training.canonicalParentsSha256,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
  });
}

function buildV3Seal(
  invocation: CapturedV3Invocation,
  previousMac: string,
  milestone100Mac: string,
  milestone500Mac: string,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const payload = v3SealPayload(
    invocation,
    previousMac,
    milestone100Mac,
    milestone500Mac,
  );
  return frozen({
    ...payload,
    seal_mac: hmacHex(key, V3_SEAL_DOMAIN, payload),
  });
}

function exactJson(left: unknown, right: unknown, label: string): void {
  if (canonicalJson(left) !== canonicalJson(right)) {
    failure(`${label} is not the exact expected projection`);
  }
}

function captureCompletedEvidence(
  value: FloodgateV7CompletedParentEvidence,
  expectedParent: Readonly<FloodgateTrainingParent>,
  inputIndex: number,
  runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
): Readonly<FloodgateV7CompletedParentEvidence> &
  Readonly<Record<string, unknown>> {
  let verified: Readonly<FloodgateV7CompletedParentEvidence>;
  try {
    verified = verifyFloodgateV7CompletedParentEvidenceCoreForTests(value);
  } catch (cause) {
    return failure(
      `completed evidence ${inputIndex} failed compact semantic verification`,
      cause,
    );
  }
  if (
    verified.parent.game_id !== expectedParent.game_id ||
    verified.parent.parent_id !== expectedParent.parent_id ||
    verified.parent.position_id !== expectedParent.position_id ||
    verified.parent.parent_sfen !== expectedParent.parent_sfen ||
    verified.parent.ply !== expectedParent.ply ||
    verified.strong_game_played_move !== expectedParent.played_move ||
    verified.stable_runtime_binding.runtime_receipt_sha256 !==
      runBinding.stable_runtime_receipt_sha256 ||
    (verified.teacher_proposal_runtime_binding !== null &&
      verified.teacher_proposal_runtime_binding.runtime_receipt_sha256 !==
        runBinding.teacher_usi_runtime_receipt_sha256)
  ) {
    failure(
      `completed evidence ${inputIndex} changed its authenticated parent or runtime binding`,
    );
  }
  return verified as Readonly<FloodgateV7CompletedParentEvidence> &
    Readonly<Record<string, unknown>>;
}
function buildEntry(
  invocation: CapturedInvocation,
  evidence: Readonly<Record<string, unknown>>,
  sequence: number,
  previousMac: string,
  key: Uint8Array,
): Readonly<Record<string, unknown>> {
  const parent = invocation.training.parents[sequence];
  const payload = frozen({
    schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
    kind: "completed-parent",
    sequence,
    input_index: sequence,
    parent_id: parent.parent_id,
    parent,
    previous_mac: previousMac,
    completed_evidence_sha256: digestCanonical(EVIDENCE_DOMAIN, evidence),
    completed_evidence: evidence,
  });
  return frozen({ ...payload, entry_mac: hmacHex(key, ENTRY_DOMAIN, payload) });
}

function parseCanonicalLine(
  lineBytes: Buffer,
  label: string,
  decoder: TextDecoder,
): Readonly<Record<string, unknown>> {
  if (lineBytes.byteLength > MAX_LINE_BYTES) {
    failure(`${label} exceeds the line bound`);
  }
  let line: string;
  try {
    line = decoder.decode(lineBytes);
  } catch (cause) {
    return failure("work.jsonl contains invalid UTF-8", cause);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch (cause) {
    return failure(`${label} is not JSON`, cause);
  }
  if (!isPlainRecord(parsed)) {
    failure(`${label} is not a canonical JSON object`);
  }
  const canonicalBytes = Buffer.from(canonicalJson(parsed), "utf8");
  if (
    canonicalBytes.byteLength !== lineBytes.byteLength ||
    !timingSafeEqual(canonicalBytes, lineBytes)
  ) {
    failure(`${label} is not a canonical JSON object`);
  }
  return parsed;
}

function exactLine(
  actual: Buffer,
  expected: Readonly<Record<string, unknown>>,
  label: string,
): void {
  const expectedBytes = Buffer.from(canonicalJson(expected), "utf8");
  if (
    actual.byteLength !== expectedBytes.byteLength ||
    !timingSafeEqual(actual, expectedBytes)
  ) {
    failure(`${label} is not the exact authenticated expected line`);
  }
}

interface MutableWorkScanState {
  completeRecords: number;
  completedParents: number;
  previousMac: string;
  sealed: boolean;
  authenticatedBytes: number;
}

function scanCompleteLine(
  lineBytes: Buffer,
  lineEnd: number,
  state: MutableWorkScanState,
  invocation: CapturedInvocation,
  key: Uint8Array,
  decoder: TextDecoder,
): void {
  if (state.completeRecords === 0) {
    const expectedHeader = buildHeader(invocation, key);
    const header = strictRecord(
      parseCanonicalLine(lineBytes, "work header", decoder),
      HEADER_KEYS,
      "work header",
    );
    const headerPayloadValue = withoutKey(header, "header_mac");
    const expectedHeaderMac = hmacHex(key, HEADER_DOMAIN, headerPayloadValue);
    if (!macEqual(header.header_mac, expectedHeaderMac)) {
      failure("work header MAC is invalid");
    }
    exactLine(lineBytes, expectedHeader, "work header");
    state.previousMac = expectedHeader.header_mac as string;
    state.authenticatedBytes = lineEnd;
    return;
  }

  if (state.sealed) {
    failure("work.jsonl contains a complete line after its seal");
  }
  const parsed = parseCanonicalLine(
    lineBytes,
    `work line ${state.completeRecords}`,
    decoder,
  );
  if (parsed.kind === "seal") {
    if (state.completedParents !== invocation.training.parents.length) {
      failure("work seal appears before every parent entry");
    }
    const seal = strictRecord(parsed, SEAL_KEYS, "work seal");
    const expectedSealMac = hmacHex(
      key,
      SEAL_DOMAIN,
      withoutKey(seal, "seal_mac"),
    );
    if (!macEqual(seal.seal_mac, expectedSealMac)) {
      failure("work seal MAC is invalid");
    }
    exactLine(
      lineBytes,
      buildSeal(invocation, state.previousMac, key),
      "work seal",
    );
    state.sealed = true;
    state.authenticatedBytes = lineEnd;
    return;
  }
  if (state.completedParents >= invocation.training.parents.length) {
    failure("work.jsonl contains an entry beyond the training input");
  }
  const completedParents = state.completedParents;
  const entry = strictRecord(
    parsed,
    ENTRY_KEYS,
    `work entry ${completedParents}`,
  );
  const entryPayload = withoutKey(entry, "entry_mac");
  const expectedMac = hmacHex(key, ENTRY_DOMAIN, entryPayload);
  if (!macEqual(entry.entry_mac, expectedMac)) {
    failure(`work entry ${completedParents} MAC is invalid`);
  }
  const expectedParent = invocation.training.parents[completedParents];
  if (
    entry.schema !== FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA ||
    entry.kind !== "completed-parent" ||
    entry.sequence !== completedParents ||
    entry.input_index !== completedParents ||
    entry.parent_id !== expectedParent.parent_id ||
    entry.previous_mac !== state.previousMac
  ) {
    failure(
      `work entry ${completedParents} chain or parent identity is invalid`,
    );
  }
  exactJson(
    entry.parent,
    expectedParent,
    `work entry ${completedParents}.parent`,
  );
  const evidence = captureCompletedEvidence(
    entry.completed_evidence as FloodgateV7CompletedParentEvidence,
    expectedParent,
    completedParents,
    invocation.runBinding,
  );
  if (
    entry.completed_evidence_sha256 !==
    digestCanonical(EVIDENCE_DOMAIN, evidence)
  ) {
    failure(
      `work entry ${completedParents} completed evidence digest is invalid`,
    );
  }
  exactLine(
    lineBytes,
    buildEntry(invocation, evidence, completedParents, state.previousMac, key),
    `work entry ${completedParents}`,
  );
  state.previousMac = entry.entry_mac as string;
  state.completedParents += 1;
  state.authenticatedBytes = lineEnd;
}

interface MutableV3WorkScanState extends MutableWorkScanState {
  milestone100Mac: string | undefined;
  milestone500Mac: string | undefined;
}

function scanV3CompleteLine(
  lineBytes: Buffer,
  lineEnd: number,
  state: MutableV3WorkScanState,
  invocation: CapturedV3Invocation,
  key: Uint8Array,
  decoder: TextDecoder,
  emitVerifiedParentEvent: boolean,
): Readonly<FloodgateV7TeacherCheckpointV3VerifiedParentEvent> | undefined {
  if (state.completeRecords === 0) {
    const expectedHeader = buildV3Header(invocation, key);
    const header = strictRecord(
      parseCanonicalLine(lineBytes, "v3 work header", decoder),
      V3_HEADER_KEYS,
      "v3 work header",
    );
    const expectedHeaderMac = hmacHex(
      key,
      V3_HEADER_DOMAIN,
      withoutKey(header, "header_mac"),
    );
    if (!macEqual(header.header_mac, expectedHeaderMac)) {
      failure("v3 work header MAC is invalid");
    }
    exactLine(lineBytes, expectedHeader, "v3 work header");
    state.previousMac = expectedHeader.header_mac as string;
    state.authenticatedBytes = lineEnd;
    return;
  }

  if (state.sealed) {
    failure("v3 work.jsonl contains a complete line after its seal");
  }
  const parsed = parseCanonicalLine(
    lineBytes,
    `v3 work line ${state.completeRecords}`,
    decoder,
  );

  if (parsed.kind === "durable-prefix-milestone") {
    const milestone = strictRecord(
      parsed,
      V3_MILESTONE_KEYS,
      "v3 durable-prefix milestone",
    );
    let gate: FloodgateV7TeacherCheckpointV3PrefixGate;
    if (
      milestone.gate ===
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
    ) {
      gate = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100;
      if (
        state.completedParents !== 100 ||
        state.milestone100Mac !== undefined ||
        state.milestone500Mac !== undefined
      ) {
        failure("v3 100-parent milestone is early, late, or duplicate");
      }
    } else if (
      milestone.gate ===
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500
    ) {
      gate = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500;
      if (
        state.completedParents !== 500 ||
        state.milestone100Mac === undefined ||
        state.milestone500Mac !== undefined
      ) {
        failure(
          "v3 500-parent milestone is early, late, skipped, or duplicate",
        );
      }
    } else {
      return failure("v3 milestone gate is unsupported");
    }
    const expectedMac = hmacHex(
      key,
      v3MilestoneDomain(gate),
      withoutKey(milestone, "milestone_mac"),
    );
    if (!macEqual(milestone.milestone_mac, expectedMac)) {
      failure("v3 durable-prefix milestone MAC is invalid");
    }
    const expected = buildV3Milestone(invocation, gate, state.previousMac, key);
    exactLine(lineBytes, expected, "v3 durable-prefix milestone");
    const milestoneMac = expected.milestone_mac as string;
    state.previousMac = milestoneMac;
    if (gate === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100) {
      state.milestone100Mac = milestoneMac;
    } else {
      state.milestone500Mac = milestoneMac;
    }
    state.authenticatedBytes = lineEnd;
    return;
  }

  if (parsed.kind === "seal") {
    if (
      state.completedParents !==
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
      state.milestone100Mac === undefined ||
      state.milestone500Mac === undefined
    ) {
      failure("v3 work seal appears before the full gated parent stream");
    }
    const seal = strictRecord(parsed, V3_SEAL_KEYS, "v3 work seal");
    const expectedSealMac = hmacHex(
      key,
      V3_SEAL_DOMAIN,
      withoutKey(seal, "seal_mac"),
    );
    if (!macEqual(seal.seal_mac, expectedSealMac)) {
      failure("v3 work seal MAC is invalid");
    }
    exactLine(
      lineBytes,
      buildV3Seal(
        invocation,
        state.previousMac,
        state.milestone100Mac,
        state.milestone500Mac,
        key,
      ),
      "v3 work seal",
    );
    state.sealed = true;
    state.authenticatedBytes = lineEnd;
    return;
  }

  if (
    state.completedParents >= FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS
  ) {
    failure("v3 work.jsonl contains an entry beyond the full training input");
  }
  if (state.completedParents === 100 && state.milestone100Mac === undefined) {
    failure("v3 work entry crosses the 100-parent gate without its milestone");
  }
  if (state.completedParents === 500 && state.milestone500Mac === undefined) {
    failure("v3 work entry crosses the 500-parent gate without its milestone");
  }
  const completedParents = state.completedParents;
  const entry = strictRecord(
    parsed,
    ENTRY_KEYS,
    `v3 work entry ${completedParents}`,
  );
  const expectedMac = hmacHex(
    key,
    V3_ENTRY_DOMAIN,
    withoutKey(entry, "entry_mac"),
  );
  if (!macEqual(entry.entry_mac, expectedMac)) {
    failure(`v3 work entry ${completedParents} MAC is invalid`);
  }
  const expectedParent = invocation.training.parents[completedParents];
  if (
    entry.schema !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA ||
    entry.kind !== "completed-parent" ||
    entry.sequence !== completedParents ||
    entry.input_index !== completedParents ||
    entry.parent_id !== expectedParent.parent_id ||
    entry.previous_mac !== state.previousMac
  ) {
    failure(
      `v3 work entry ${completedParents} chain or parent identity is invalid`,
    );
  }
  exactJson(
    entry.parent,
    expectedParent,
    `v3 work entry ${completedParents}.parent`,
  );
  const evidence = captureCompletedEvidence(
    entry.completed_evidence as FloodgateV7CompletedParentEvidence,
    expectedParent,
    completedParents,
    invocation.runBinding,
  );
  if (
    entry.completed_evidence_sha256 !==
    digestCanonical(EVIDENCE_DOMAIN, evidence)
  ) {
    failure(
      `v3 work entry ${completedParents} completed evidence digest is invalid`,
    );
  }
  exactLine(
    lineBytes,
    buildV3Entry(
      invocation,
      evidence,
      completedParents,
      state.previousMac,
      key,
    ),
    `v3 work entry ${completedParents}`,
  );
  state.previousMac = entry.entry_mac as string;
  state.completedParents += 1;
  state.authenticatedBytes = lineEnd;
  if (!emitVerifiedParentEvent) return undefined;
  return Object.freeze({
    contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CONTRACT,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_STATUS,
    claim_boundary:
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CLAIM_BOUNDARY,
    input_index: completedParents,
    parent: expectedParent,
    completed_evidence: evidence,
    completed_evidence_sha256: entry.completed_evidence_sha256 as string,
    entry_mac: entry.entry_mac as string,
  });
}

function verifyStageStat(
  stat: fs.BigIntStats,
  invocation: Pick<CapturedInvocation, "effectiveUserId" | "lease">,
): void {
  const expected = invocation.lease.receipt.stage_identity;
  if (
    (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_DIRECTORY ||
    (Number(stat.mode) & MODE_MASK) !== 0o700 ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    stat.dev !== expected.dev ||
    stat.ino !== expected.ino
  ) {
    failure("held stage identity, owner, type, or mode changed");
  }
}

function verifyWorkStat(
  stat: fs.BigIntStats,
  invocation: CapturedInvocation,
): void {
  if (
    (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_REGULAR ||
    (Number(stat.mode) & MODE_MASK) !== 0o600 ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    stat.size < BigInt(0) ||
    stat.size > BigInt(MAX_TOTAL_BYTES)
  ) {
    failure("work.jsonl owner, type, mode, link count, or size is invalid");
  }
}

function verifyV3WorkStat(
  stat: fs.BigIntStats,
  invocation: Pick<CapturedInvocation, "effectiveUserId">,
): void {
  if (
    (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_REGULAR ||
    (Number(stat.mode) & MODE_MASK) !== 0o600 ||
    stat.uid !== BigInt(invocation.effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    stat.size < BigInt(0) ||
    stat.size > BigInt(V3_MAX_TOTAL_BYTES)
  ) {
    failure("v3 work.jsonl owner, type, mode, link count, or size is invalid");
  }
}

async function verifyStagePath(
  invocation: Pick<CapturedInvocation, "effectiveUserId" | "lease">,
): Promise<void> {
  let stat: fs.BigIntStats;
  try {
    stat = await fs.promises.lstat(invocation.lease.stageRoot, {
      bigint: true,
    });
  } catch (cause) {
    return failure("authorized stage path cannot be reinspected", cause);
  }
  verifyStageStat(stat, invocation);
}

function captureWorkSnapshot(stat: fs.BigIntStats): WorkFileSnapshot {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    uid: stat.uid,
    nlink: stat.nlink,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function verifyWorkIdentity(
  stat: fs.BigIntStats,
  expected: WorkFileIdentity,
  label: string,
): void {
  if (stat.dev !== expected.dev || stat.ino !== expected.ino) {
    failure(`${label} identity changed`);
  }
}

function verifyWorkSnapshot(
  stat: fs.BigIntStats,
  expected: WorkFileSnapshot,
  invocation: CapturedInvocation,
  label: string,
): void {
  verifyWorkStat(stat, invocation);
  if (
    stat.dev !== expected.dev ||
    stat.ino !== expected.ino ||
    stat.mode !== expected.mode ||
    stat.uid !== expected.uid ||
    stat.nlink !== expected.nlink ||
    stat.size !== expected.size ||
    stat.mtimeNs !== expected.mtimeNs ||
    stat.ctimeNs !== expected.ctimeNs
  ) {
    failure(label);
  }
}

function verifyV3WorkSnapshot(
  stat: fs.BigIntStats,
  expected: WorkFileSnapshot,
  invocation: Pick<CapturedInvocation, "effectiveUserId">,
  label: string,
): void {
  verifyV3WorkStat(stat, invocation);
  if (
    stat.dev !== expected.dev ||
    stat.ino !== expected.ino ||
    stat.mode !== expected.mode ||
    stat.uid !== expected.uid ||
    stat.nlink !== expected.nlink ||
    stat.size !== expected.size ||
    stat.mtimeNs !== expected.mtimeNs ||
    stat.ctimeNs !== expected.ctimeNs
  ) {
    failure(label);
  }
}

async function verifyWorkPathSnapshot(
  workPath: string,
  expected: WorkFileSnapshot,
  invocation: CapturedInvocation,
): Promise<void> {
  let stat: fs.BigIntStats;
  try {
    stat = await fs.promises.lstat(workPath, { bigint: true });
  } catch (cause) {
    return failure("work.jsonl path cannot be reinspected", cause);
  }
  verifyWorkSnapshot(
    stat,
    expected,
    invocation,
    "work.jsonl path snapshot changed",
  );
}

async function verifyV3WorkPathSnapshot(
  workPath: string,
  expected: WorkFileSnapshot,
  invocation: Pick<CapturedInvocation, "effectiveUserId">,
): Promise<void> {
  let stat: fs.BigIntStats;
  try {
    stat = await fs.promises.lstat(workPath, { bigint: true });
  } catch (cause) {
    return failure("v3 work.jsonl path cannot be reinspected", cause);
  }
  verifyV3WorkSnapshot(
    stat,
    expected,
    invocation,
    "v3 work.jsonl path snapshot changed",
  );
}

async function scanWorkHandle(
  handle: fs.promises.FileHandle,
  invocation: CapturedInvocation,
  key: Uint8Array,
  policy: WorkScanPolicy,
  expectedIdentity: WorkFileIdentity,
): Promise<Readonly<WorkFileScanResult>> {
  const before = await handle.stat({ bigint: true });
  verifyWorkStat(before, invocation);
  verifyWorkIdentity(before, expectedIdentity, "work.jsonl held file");
  const beforeSnapshot = captureWorkSnapshot(before);
  const fileBytes = Number(before.size);
  const readBuffer = Buffer.alloc(READ_CHUNK_BYTES);
  const lineBuffer = Buffer.alloc(MAX_LINE_BYTES);
  const decoder = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  });
  const digest = createHash("sha256");
  const state: MutableWorkScanState = {
    completeRecords: 0,
    completedParents: 0,
    previousMac: "",
    sealed: false,
    authenticatedBytes: 0,
  };
  const maximumCompleteRecords = invocation.training.parents.length + 2;
  let lineLength = 0;
  let offset = 0;
  while (offset < fileBytes) {
    const maximumRead = Math.min(READ_CHUNK_BYTES, fileBytes - offset);
    let readCalled = false;
    let actualBytesRead: number | undefined;
    const read = async (requestedBytes = maximumRead): Promise<number> => {
      if (readCalled) failure("work.jsonl test read was called more than once");
      if (
        !Number.isSafeInteger(requestedBytes) ||
        requestedBytes < 1 ||
        requestedBytes > maximumRead
      ) {
        failure("work.jsonl test read bound is invalid");
      }
      readCalled = true;
      const result = await handle.read(readBuffer, 0, requestedBytes, offset);
      actualBytesRead = result.bytesRead;
      return result.bytesRead;
    };
    const bytesRead =
      invocation.readForTests === undefined
        ? await read()
        : await invocation.readForTests(
            Object.freeze({
              purpose: policy,
              length: maximumRead,
              position: offset,
            }),
            read,
          );
    if (!readCalled || bytesRead !== actualBytesRead) {
      failure("work.jsonl test read did not report the exact native read");
    }
    if (
      !Number.isSafeInteger(bytesRead) ||
      bytesRead < 0 ||
      bytesRead > maximumRead
    ) {
      failure("work.jsonl read returned an invalid byte count");
    }
    if (bytesRead === 0) failure("work.jsonl changed during read");
    const chunk = readBuffer.subarray(0, bytesRead);
    digest.update(chunk);
    let chunkStart = 0;
    while (chunkStart < chunk.byteLength) {
      const newline = chunk.indexOf(0x0a, chunkStart);
      const chunkEnd = newline === -1 ? chunk.byteLength : newline;
      const segmentLength = chunkEnd - chunkStart;
      if (lineLength + segmentLength > MAX_LINE_BYTES) {
        failure("work.jsonl line exceeds its exact bound");
      }
      if (segmentLength > 0) {
        chunk.copy(lineBuffer, lineLength, chunkStart, chunkEnd);
        lineLength += segmentLength;
      }
      if (newline === -1) break;
      if (state.completeRecords >= maximumCompleteRecords) {
        failure("work.jsonl contains too many complete records");
      }
      if (lineLength === 0) failure("work.jsonl contains an empty line");
      scanCompleteLine(
        lineBuffer.subarray(0, lineLength),
        offset + newline + 1,
        state,
        invocation,
        key,
        decoder,
      );
      state.completeRecords += 1;
      lineLength = 0;
      chunkStart = newline + 1;
    }
    offset += bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  verifyWorkSnapshot(
    after,
    beforeSnapshot,
    invocation,
    "work.jsonl mutated during read",
  );
  const tornTail = lineLength > 0;
  if (state.sealed && tornTail) {
    failure("work.jsonl contains an incomplete fragment after its valid seal");
  }
  if (
    policy === "sealed-final" &&
    (tornTail ||
      !state.sealed ||
      state.completedParents !== invocation.training.parents.length ||
      state.authenticatedBytes !== fileBytes)
  ) {
    failure("final work.jsonl is not the exact authenticated sealed stream");
  }
  return Object.freeze({
    completedParents: state.completedParents,
    previousMac: state.previousMac,
    sealed: state.sealed,
    authenticatedBytes: state.authenticatedBytes,
    tornTail,
    fileBytes,
    fileSha256: digest.digest("hex"),
    snapshot: captureWorkSnapshot(after),
  });
}

async function scanV3WorkHandle(
  handle: fs.promises.FileHandle,
  invocation: CapturedV3Invocation,
  key: Uint8Array,
  policy: V3WorkScanPolicy,
  expectedIdentity: WorkFileIdentity,
  verifiedParentVisitor?: FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests,
  verifiedParentSink?: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
): Promise<Readonly<V3WorkFileScanResult>> {
  if (
    (verifiedParentVisitor !== undefined || verifiedParentSink !== undefined) &&
    policy !== "sealed-final"
  ) {
    failure(
      "verified parent consumer is allowed only during the sealed-final scan",
    );
  }
  const before = await handle.stat({ bigint: true });
  verifyV3WorkStat(before, invocation);
  verifyWorkIdentity(before, expectedIdentity, "v3 work.jsonl held file");
  const beforeSnapshot = captureWorkSnapshot(before);
  const fileBytes = Number(before.size);
  const readBuffer = Buffer.alloc(READ_CHUNK_BYTES);
  const lineBuffer = Buffer.alloc(MAX_LINE_BYTES);
  const decoder = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  });
  const digest = createHash("sha256");
  const state: MutableV3WorkScanState = {
    completeRecords: 0,
    completedParents: 0,
    previousMac: "",
    milestone100Mac: undefined,
    milestone500Mac: undefined,
    sealed: false,
    authenticatedBytes: 0,
  };
  const maximumCompleteRecords =
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 4;
  let lineLength = 0;
  let offset = 0;
  while (offset < fileBytes) {
    const maximumRead = Math.min(READ_CHUNK_BYTES, fileBytes - offset);
    let readCalled = false;
    let actualBytesRead: number | undefined;
    const read = async (requestedBytes = maximumRead): Promise<number> => {
      if (readCalled) {
        failure("v3 work.jsonl test read was called more than once");
      }
      if (
        !Number.isSafeInteger(requestedBytes) ||
        requestedBytes < 1 ||
        requestedBytes > maximumRead
      ) {
        failure("v3 work.jsonl test read bound is invalid");
      }
      readCalled = true;
      const result = await handle.read(readBuffer, 0, requestedBytes, offset);
      actualBytesRead = result.bytesRead;
      return result.bytesRead;
    };
    const bytesRead =
      invocation.readForTests === undefined
        ? await read()
        : await invocation.readForTests(
            Object.freeze({
              purpose: policy,
              length: maximumRead,
              position: offset,
            }),
            read,
          );
    if (!readCalled || bytesRead !== actualBytesRead) {
      failure("v3 work.jsonl test read did not report the exact native read");
    }
    if (
      !Number.isSafeInteger(bytesRead) ||
      bytesRead < 0 ||
      bytesRead > maximumRead
    ) {
      failure("v3 work.jsonl read returned an invalid byte count");
    }
    if (bytesRead === 0) failure("v3 work.jsonl changed during read");
    const chunk = readBuffer.subarray(0, bytesRead);
    digest.update(chunk);
    let chunkStart = 0;
    while (chunkStart < chunk.byteLength) {
      const newline = chunk.indexOf(0x0a, chunkStart);
      const chunkEnd = newline === -1 ? chunk.byteLength : newline;
      const segmentLength = chunkEnd - chunkStart;
      if (lineLength + segmentLength > MAX_LINE_BYTES) {
        failure("v3 work.jsonl line exceeds its exact bound");
      }
      if (segmentLength > 0) {
        chunk.copy(lineBuffer, lineLength, chunkStart, chunkEnd);
        lineLength += segmentLength;
      }
      if (newline === -1) break;
      if (state.completeRecords >= maximumCompleteRecords) {
        failure("v3 work.jsonl contains too many complete records");
      }
      if (lineLength === 0) failure("v3 work.jsonl contains an empty line");
      const verifiedParentEvent = scanV3CompleteLine(
        lineBuffer.subarray(0, lineLength),
        offset + newline + 1,
        state,
        invocation,
        key,
        decoder,
        verifiedParentVisitor !== undefined || verifiedParentSink !== undefined,
      );
      state.completeRecords += 1;
      if (
        verifiedParentEvent !== undefined &&
        verifiedParentVisitor !== undefined
      ) {
        invokeVerifiedParentVisitorForTests(
          verifiedParentVisitor,
          verifiedParentEvent,
        );
      }
      if (
        verifiedParentEvent !== undefined &&
        verifiedParentSink !== undefined
      ) {
        await invokeVerifiedParentSink(verifiedParentSink, verifiedParentEvent);
      }
      lineLength = 0;
      chunkStart = newline + 1;
    }
    offset += bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  verifyV3WorkSnapshot(
    after,
    beforeSnapshot,
    invocation,
    "v3 work.jsonl mutated during read",
  );
  const tornTail = lineLength > 0;
  if (state.sealed && tornTail) {
    failure(
      "v3 work.jsonl contains an incomplete fragment after its valid seal",
    );
  }
  if (
    policy !== "resumable-prefix" &&
    (tornTail || state.authenticatedBytes !== fileBytes)
  ) {
    failure("final v3 work.jsonl contains an unauthenticated tail");
  }
  if (policy === "durable-prefix-final" && state.sealed) {
    failure("final v3 durable prefix is unexpectedly sealed");
  }
  if (
    policy === "sealed-final" &&
    (!state.sealed ||
      state.completedParents !==
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS)
  ) {
    failure("final v3 work.jsonl is not the exact authenticated sealed stream");
  }
  return Object.freeze({
    completeRecords: state.completeRecords,
    completedParents: state.completedParents,
    previousMac: state.previousMac,
    milestone100Mac: state.milestone100Mac,
    milestone500Mac: state.milestone500Mac,
    sealed: state.sealed,
    authenticatedBytes: state.authenticatedBytes,
    tornTail,
    fileBytes,
    fileSha256: digest.digest("hex"),
    snapshot: captureWorkSnapshot(after),
  });
}

function assertV3GateCanResume(
  prefix: Readonly<V3ScanResult>,
  gate: FloodgateV7TeacherCheckpointV3Gate,
): void {
  switch (gate) {
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100:
      if (
        prefix.sealed ||
        prefix.completedParents > 100 ||
        prefix.milestone500Mac !== undefined ||
        (prefix.milestone100Mac !== undefined &&
          (prefix.completedParents !== 100 || prefix.tornTail))
      ) {
        failure("v3 100-parent gate cannot resume advanced or ambiguous work");
      }
      return;
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500:
      if (
        prefix.milestone100Mac === undefined ||
        prefix.sealed ||
        prefix.completedParents < 100 ||
        prefix.completedParents > 500 ||
        (prefix.milestone500Mac !== undefined &&
          (prefix.completedParents !== 500 || prefix.tornTail))
      ) {
        failure(
          "v3 500-parent gate requires milestone 100 and rejects advanced or ambiguous work",
        );
      }
      return;
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000:
      if (
        prefix.milestone100Mac === undefined ||
        prefix.milestone500Mac === undefined ||
        prefix.completedParents < 500 ||
        prefix.completedParents >
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
        (prefix.sealed &&
          (prefix.completedParents !==
            FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
            prefix.tornTail))
      ) {
        failure(
          "v3 final gate requires both milestones and rejects incomplete gate authority",
        );
      }
  }
}

function assertV3ExactGateFinal(
  result: Readonly<V3WorkFileScanResult>,
  gate: FloodgateV7TeacherCheckpointV3Gate,
): void {
  if (
    result.tornTail ||
    result.authenticatedBytes !== result.fileBytes ||
    result.milestone100Mac === undefined
  ) {
    failure("v3 final scan is not a complete authenticated gate stream");
  }
  switch (gate) {
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100:
      if (
        result.sealed ||
        result.completedParents !== 100 ||
        result.completeRecords !== 102 ||
        result.milestone500Mac !== undefined
      ) {
        failure("v3 100-parent final scan is not its exact durable prefix");
      }
      return;
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500:
      if (
        result.sealed ||
        result.completedParents !== 500 ||
        result.completeRecords !== 503 ||
        result.milestone500Mac === undefined
      ) {
        failure("v3 500-parent final scan is not its exact durable prefix");
      }
      return;
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000:
      if (
        !result.sealed ||
        result.completedParents !==
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
        result.completeRecords !==
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 4 ||
        result.milestone500Mac === undefined
      ) {
        failure("v3 final scan is not its exact sealed 24000-parent stream");
      }
  }
}

async function appendLine(
  invocation: CapturedInvocation,
  handle: fs.promises.FileHandle,
  line: string,
  label: string,
): Promise<void> {
  const bytes = Buffer.from(`${line}\n`, "utf8");
  if (bytes.byteLength > MAX_LINE_BYTES + 1)
    failure(`${label} exceeds line bound`);
  let offset = 0;
  try {
    while (offset < bytes.byteLength) {
      const remaining = bytes.byteLength - offset;
      const write = async (maximumBytes = remaining): Promise<number> => {
        if (
          !Number.isSafeInteger(maximumBytes) ||
          maximumBytes < 1 ||
          maximumBytes > remaining
        ) {
          failure(`${label} test write bound is invalid`);
        }
        const result = await handle.write(bytes, offset, maximumBytes, null);
        return result.bytesWritten;
      };
      const written =
        invocation.writeForTests === undefined
          ? await write()
          : await invocation.writeForTests(
              Object.freeze({
                label,
                bytes: new Uint8Array(bytes),
                offset,
                length: remaining,
              }),
              write,
            );
      if (
        !Number.isSafeInteger(written) ||
        written <= 0 ||
        written > remaining
      ) {
        persistenceFailure(
          `${label} append made no progress`,
          new Error("invalid write"),
        );
      }
      offset += written;
    }
    await handle.sync();
  } catch (cause) {
    if (
      cause instanceof FloodgateV7TeacherCheckpointPersistenceIndeterminateError
    ) {
      throw cause;
    }
    persistenceFailure(`${label} append or sync may have persisted`, cause);
  }
}

async function callFailpoint(
  invocation: CapturedInvocation,
  phase: FloodgateV7TeacherCheckpointV3FailpointPhase,
  sequence?: number,
  gate?: FloodgateV7TeacherCheckpointV3PrefixGate,
): Promise<void> {
  if (invocation.failpoint === undefined) return;
  try {
    let event: FloodgateV7TeacherCheckpointV3FailpointEvent;
    if (sequence !== undefined && gate !== undefined) {
      event = { phase, sequence, gate };
    } else if (sequence !== undefined) {
      event = { phase, sequence };
    } else if (gate !== undefined) {
      event = { phase, gate };
    } else {
      event = { phase };
    }
    await invocation.failpoint(Object.freeze(event));
  } catch (cause) {
    persistenceFailure(
      `test failpoint ${phase} interrupted checkpointing`,
      cause,
    );
  }
}

async function closeHandle(
  invocation: CapturedInvocation,
  kind: "work" | "stage",
  handle: fs.promises.FileHandle,
): Promise<void> {
  const close = handle.close.bind(handle);
  if (invocation.closeForTests === undefined) await close();
  else await invocation.closeForTests(kind, close);
}

async function syncStageDirectory(
  handle: fs.promises.FileHandle,
  label: string,
): Promise<void> {
  try {
    await handle.sync();
  } catch (cause) {
    persistenceFailure(`${label} directory sync may have persisted`, cause);
  }
}

function pinNativePromise<T>(value: Promise<T>): Promise<T> {
  objectDefineProperty(value, "constructor", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: NativePromise,
  });
  return value;
}

function isExactNativePromise(value: unknown): value is Promise<unknown> {
  return (
    nodeIsPromise(value) &&
    !nodeIsProxy(value) &&
    objectGetPrototypeOf(value) === nativePromisePrototype &&
    reflectOwnKeys(value).length === 0
  );
}

function consumeNonExactNativePromiseRejectionBestEffort(value: unknown): void {
  if (
    !nodeIsPromise(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== nativePromisePrototype
  ) {
    return;
  }
  try {
    // A native Promise with decoration is still a contract violation, but its
    // eventual rejection must not be abandoned. Invoke the captured intrinsic
    // directly and ignore its species-derived result; this observer carries no
    // semantic value into the checkpoint.
    reflectApply(nativePromiseThen, value, [() => undefined, () => undefined]);
  } catch {
    // The current realm and intrinsics are trusted by the exported boundary.
    // Observation remains best-effort if that trusted realm is corrupted.
  }
}

function invokeVerifiedParentVisitorForTests(
  visitor: FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests,
  event: Readonly<FloodgateV7TeacherCheckpointV3VerifiedParentEvent>,
): void {
  const visitorResult: unknown = visitor(event);
  if (visitorResult !== undefined) {
    consumeNonExactNativePromiseRejectionBestEffort(visitorResult);
    failure(
      "dependencies.verifiedParentVisitorForTests must return exactly undefined",
    );
  }
}

async function invokeVerifiedParentSink(
  sink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
  event: Readonly<FloodgateV7TeacherCheckpointV3VerifiedParentEvent>,
): Promise<void> {
  let sinkResult: unknown;
  try {
    sinkResult = sink(event);
  } catch (cause) {
    return failure("verified parent sink threw synchronously", cause);
  }
  if (!isExactNativePromise(sinkResult)) {
    consumeNonExactNativePromiseRejectionBestEffort(sinkResult);
    failure("verified parent sink must return an exact native Promise");
  }
  const settled = await sinkResult;
  if (settled !== undefined) {
    failure("verified parent sink must resolve exactly undefined");
  }
}

/**
 * Test-only O(1) seam for the callback contract used by the scanner loop. It
 * does not authenticate or mint an event; callers must supply an event that a
 * real sealed-final scan already produced.
 */
export function invokeFloodgateV7TeacherCheckpointV3VerifiedParentVisitorCoreForTests(
  visitor: unknown,
  event: Readonly<FloodgateV7TeacherCheckpointV3VerifiedParentEvent>,
): void {
  if (arguments.length !== 2) {
    failure("test verified-parent visitor invocation accepts two arguments");
  }
  if (typeof visitor !== "function" || nodeIsProxy(visitor)) {
    failure(
      "dependencies.verifiedParentVisitorForTests must be a non-Proxy function",
    );
  }
  invokeVerifiedParentVisitorForTests(
    visitor as FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests,
    event,
  );
}

async function consumePromiseRejection(value: Promise<unknown>): Promise<void> {
  try {
    await value;
  } catch {
    // A separately awaited task still carries the failure to the coordinator.
    // This observer only prevents abandoned cancelled tasks from becoming
    // unhandled rejections.
  }
}

type ProducerControlTimerStop = () => void;

function startProducerControlTimer(
  scheduleForTests:
    | FloodgateV7TeacherCheckpointDependencies["scheduleProducerControlTimerForTests"]
    | undefined,
  event: Readonly<FloodgateV7TeacherProducerControlTimerEvent>,
  fire: () => void,
): ProducerControlTimerStop {
  let active = true;
  const guardedFire = (): void => {
    if (!active) return;
    active = false;
    fire();
  };
  let cancelUnderlying: () => void;
  if (scheduleForTests === undefined) {
    const handle = nativeSetTimeout(guardedFire, event.milliseconds);
    cancelUnderlying = () => nativeClearTimeout(handle);
  } else {
    const candidate = reflectApply(scheduleForTests, undefined, [
      frozen(event),
      guardedFire,
    ]) as unknown;
    if (typeof candidate !== "function" || nodeIsProxy(candidate)) {
      failure("producer control timer hook must return a non-Proxy function");
    }
    cancelUnderlying = candidate as () => void;
  }
  return (): void => {
    if (!active) return;
    active = false;
    reflectApply(cancelUnderlying, undefined, []);
  };
}

interface RawProducerSettlementCounter {
  readonly started: () => void;
  readonly settled: () => void;
  readonly pending: () => number;
  readonly listen: (listener: (() => void) | undefined) => void;
}

function rawProducerSettlementCounter(): RawProducerSettlementCounter {
  let pending = 0;
  let listener: (() => void) | undefined;
  return Object.freeze({
    started: (): void => {
      pending += 1;
    },
    settled: (): void => {
      if (pending > 0) pending -= 1;
      listener?.();
    },
    pending: (): number => pending,
    listen: (next: (() => void) | undefined): void => {
      listener = next;
    },
  });
}

interface AbortDrainObservation {
  status: FloodgateV7TeacherAbortDrainControllerStatus;
  failure: unknown;
  listener: (() => void) | undefined;
}

interface AbortDrainOutcome {
  readonly timedOut: boolean;
  readonly pendingRawProducers: number;
  readonly controllerStatus: FloodgateV7TeacherAbortDrainControllerStatus;
  readonly controllerFailure: unknown;
  readonly timerFailure: Error | undefined;
}

interface ActiveProducerTask {
  readonly result: Promise<Readonly<Record<string, unknown>>>;
  readonly activate: () => void;
  readonly abortRunningOnce: (reason: unknown) => void;
}

type MissingParentEntryBuilder = (
  invocation: CapturedInvocation,
  evidence: Readonly<Record<string, unknown>>,
  sequence: number,
  previousMac: string,
  key: Uint8Array,
) => Readonly<Record<string, unknown>>;

function startMissingParentProduction(
  invocation: CapturedInvocation,
  sequence: number,
  rawSettlements: RawProducerSettlementCounter,
  reportTerminal: (sequence: number, cause: unknown) => void,
): ActiveProducerTask {
  const abortController = new NativeAbortController();
  const expectedParent = invocation.training.parents[sequence];
  const runBinding = invocation.runBinding;
  const request = frozen({
    input_index: sequence,
    parent: expectedParent,
    signal: abortController.signal,
  });
  let activateCalled = false;
  let queuedFailureSet = false;
  let queuedFailure: unknown;
  let rawPending = false;
  let abortSent = false;
  let quarantined = false;
  let supervisedSettled = false;
  let stopDeadline: ProducerControlTimerStop | undefined;
  let report: ((sequence: number, cause: unknown) => void) | undefined =
    reportTerminal;
  let resolveResult!: (value: Readonly<Record<string, unknown>>) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = pinNativePromise(
    new NativePromise<Readonly<Record<string, unknown>>>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    }),
  );
  void consumePromiseRejection(result);

  const cancelDeadline = (): void => {
    const stop = stopDeadline;
    stopDeadline = undefined;
    if (stop === undefined) return;
    try {
      stop();
    } catch {
      // The timer hook is trusted and test-only. Cleanup must remain bounded
      // even if its cancellation seam is faulty.
    }
  };

  const announceFailure = (cause: unknown): void => {
    if (!activateCalled) {
      if (!queuedFailureSet) {
        queuedFailureSet = true;
        queuedFailure = cause;
      }
      return;
    }
    const reporter = report;
    report = undefined;
    reporter?.(sequence, cause);
  };

  const failSupervised = (cause: unknown, quarantine: boolean): void => {
    if (supervisedSettled) return;
    supervisedSettled = true;
    if (quarantine) quarantined = true;
    cancelDeadline();
    rejectResult(cause);
    announceFailure(cause);
  };

  const fulfillRaw = (raw: unknown): void => {
    rawPending = false;
    rawSettlements.settled();
    if (quarantined || supervisedSettled) return;
    cancelDeadline();
    try {
      let completed: Readonly<FloodgateV7CompletedParentEvidence>;
      try {
        completed = buildFloodgateV7CompletedParentCoreForTests(
          raw as FloodgateV7CompletedParentInput,
        );
      } catch (cause) {
        return failSupervised(
          new FloodgateV7TeacherCheckpointError(
            `completed-parent core rejected produced input ${sequence}`,
            { cause },
          ),
          false,
        );
      }
      const evidence = captureCompletedEvidence(
        completed,
        expectedParent,
        sequence,
        runBinding,
      );
      supervisedSettled = true;
      report = undefined;
      resolveResult(evidence);
    } catch (cause) {
      failSupervised(cause, false);
    }
  };

  const rejectRaw = (cause: unknown): void => {
    rawPending = false;
    rawSettlements.settled();
    if (quarantined || supervisedSettled) return;
    failSupervised(cause, false);
  };

  let produced: unknown;
  try {
    produced = reflectApply(invocation.producerController.produce, undefined, [
      request,
    ]);
  } catch (cause) {
    failSupervised(
      new FloodgateV7TeacherCheckpointError(
        `producerController.produce threw synchronously for input ${sequence}`,
        { cause },
      ),
      false,
    );
  }
  if (!supervisedSettled && !isExactNativePromise(produced)) {
    consumeNonExactNativePromiseRejectionBestEffort(produced);
    failSupervised(
      new FloodgateV7TeacherCheckpointError(
        `producerController.produce must return an exact native Promise for input ${sequence}`,
      ),
      false,
    );
  }

  if (!supervisedSettled) {
    rawPending = true;
    rawSettlements.started();
    try {
      reflectApply(nativePromiseThen, produced, [fulfillRaw, rejectRaw]);
    } catch (cause) {
      rawPending = false;
      rawSettlements.settled();
      failSupervised(
        new FloodgateV7TeacherCheckpointError(
          `producer result observation failed for input ${sequence}`,
          { cause },
        ),
        false,
      );
    }
  }

  if (!supervisedSettled) {
    const milliseconds = runBinding.producer_control.parent_deadline_ms;
    try {
      stopDeadline = startProducerControlTimer(
        invocation.scheduleProducerControlTimerForTests,
        Object.freeze({
          phase: "parent-deadline",
          milliseconds,
          input_index: sequence,
        }),
        () => {
          failSupervised(
            new FloodgateV7TeacherProducerTimeoutError(sequence, milliseconds),
            true,
          );
        },
      );
    } catch (cause) {
      failSupervised(
        new FloodgateV7TeacherCheckpointError(
          `producer deadline timer setup failed for input ${sequence}`,
          { cause },
        ),
        true,
      );
    }
  }

  return Object.freeze({
    result,
    activate: (): void => {
      if (activateCalled) return;
      activateCalled = true;
      if (queuedFailureSet) {
        const cause = queuedFailure;
        queuedFailureSet = false;
        queuedFailure = undefined;
        announceFailure(cause);
      }
    },
    abortRunningOnce: (reason: unknown): void => {
      report = undefined;
      quarantined = true;
      cancelDeadline();
      if (!supervisedSettled) {
        supervisedSettled = true;
        rejectResult(reason);
      }
      if (!rawPending || abortSent) return;
      abortSent = true;
      try {
        reflectApply(nativeAbortControllerAbort, abortController, [reason]);
      } catch {
        // A current-realm native AbortController is trusted. Preserve the first
        // terminal cause even if the realm is corrupted after capture.
      }
    },
  });
}

async function appendMissingParentsInOrder(
  invocation: CapturedInvocation,
  workHandle: fs.promises.FileHandle,
  key: Uint8Array,
  startSequence: number,
  initialPreviousMac: string,
  endSequenceExclusive = invocation.training.parents.length,
  entryBuilder: MissingParentEntryBuilder = buildEntry,
): Promise<string> {
  if (
    !Number.isSafeInteger(endSequenceExclusive) ||
    endSequenceExclusive < startSequence ||
    endSequenceExclusive > invocation.training.parents.length
  ) {
    failure("missing-parent scheduler received an invalid private end bound");
  }
  const total = endSequenceExclusive;
  const active = new Map<number, ActiveProducerTask>();
  const rawSettlements = rawProducerSettlementCounter();
  const abortDrain: AbortDrainObservation = {
    status: "pending",
    failure: undefined,
    listener: undefined,
  };
  let nextToSchedule = startSequence;
  let previousMac = initialPreviousMac;
  let terminal: Readonly<{ sequence: number; cause: unknown }> | undefined;
  let abortAndDrainCalled = false;

  const settleAbortDrain = (
    status: Exclude<FloodgateV7TeacherAbortDrainControllerStatus, "pending">,
    failureValue?: unknown,
  ): void => {
    if (abortDrain.status !== "pending") return;
    abortDrain.status = status;
    abortDrain.failure = failureValue;
    abortDrain.listener?.();
  };

  const observeAbortAndDrain = (): void => {
    if (abortAndDrainCalled) return;
    abortAndDrainCalled = true;
    let drainValue: unknown;
    try {
      drainValue = reflectApply(
        invocation.producerController.abortAndDrain,
        undefined,
        [],
      );
    } catch (cause) {
      settleAbortDrain(
        "rejected",
        new FloodgateV7TeacherCheckpointError(
          "producerController.abortAndDrain threw synchronously",
          { cause },
        ),
      );
      return;
    }
    if (!isExactNativePromise(drainValue)) {
      consumeNonExactNativePromiseRejectionBestEffort(drainValue);
      settleAbortDrain(
        "rejected",
        new FloodgateV7TeacherCheckpointError(
          "producerController.abortAndDrain must return an exact native Promise",
        ),
      );
      return;
    }
    void (async (): Promise<void> => {
      try {
        await drainValue;
        settleAbortDrain("fulfilled");
      } catch (cause) {
        settleAbortDrain(
          "rejected",
          new FloodgateV7TeacherCheckpointError(
            "producerController.abortAndDrain rejected",
            { cause },
          ),
        );
      }
    })();
  };

  const establishTerminal = (sequence: number, cause: unknown): void => {
    if (terminal !== undefined) return;
    terminal = Object.freeze({ sequence, cause });
    for (const task of active.values()) task.abortRunningOnce(cause);
    observeAbortAndDrain();
  };

  const throwIfTerminal = (): void => {
    const failureValue = terminal;
    if (failureValue !== undefined) throw failureValue.cause;
  };

  const schedule = (): void => {
    while (
      terminal === undefined &&
      active.size < FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT &&
      nextToSchedule < total
    ) {
      const sequence = nextToSchedule;
      nextToSchedule += 1;
      const task = startMissingParentProduction(
        invocation,
        sequence,
        rawSettlements,
        establishTerminal,
      );
      active.set(sequence, task);
      task.activate();
    }
  };

  const drainOutcome = (
    timedOut: boolean,
    timerFailure: Error | undefined,
  ): Readonly<AbortDrainOutcome> =>
    frozen({
      timedOut,
      pendingRawProducers: rawSettlements.pending(),
      controllerStatus: abortDrain.status,
      controllerFailure: abortDrain.failure,
      timerFailure,
    });

  const awaitBoundedDrain = async (): Promise<Readonly<AbortDrainOutcome>> => {
    if (rawSettlements.pending() === 0 && abortDrain.status !== "pending") {
      return drainOutcome(false, undefined);
    }
    let completed = false;
    let timedOut = false;
    let timerFailure: Error | undefined;
    let outcome: Readonly<AbortDrainOutcome> | undefined;
    let stopBound: ProducerControlTimerStop | undefined;
    let resolveWait!: () => void;
    const wait = pinNativePromise(
      new NativePromise<void>((resolve) => {
        resolveWait = resolve;
      }),
    );
    const finish = (): void => {
      if (completed) return;
      completed = true;
      rawSettlements.listen(undefined);
      abortDrain.listener = undefined;
      const stop = stopBound;
      stopBound = undefined;
      if (stop !== undefined) {
        try {
          stop();
        } catch (cause) {
          timerFailure = new FloodgateV7TeacherCheckpointError(
            "producer abort-drain timer cancellation failed",
            { cause },
          );
        }
      }
      outcome = drainOutcome(timedOut, timerFailure);
      resolveWait();
    };
    const finishIfDrained = (): void => {
      if (rawSettlements.pending() === 0 && abortDrain.status !== "pending") {
        finish();
      }
    };
    rawSettlements.listen(finishIfDrained);
    abortDrain.listener = finishIfDrained;
    try {
      stopBound = startProducerControlTimer(
        invocation.scheduleProducerControlTimerForTests,
        Object.freeze({
          phase: "abort-drain",
          milliseconds: invocation.runBinding.producer_control.abort_drain_ms,
        }),
        () => {
          timedOut = true;
          finish();
        },
      );
    } catch (cause) {
      timerFailure = new FloodgateV7TeacherCheckpointError(
        "producer abort-drain timer setup failed",
        { cause },
      );
      if (completed) outcome = drainOutcome(timedOut, timerFailure);
      else finish();
    }
    finishIfDrained();
    await wait;
    if (outcome === undefined) {
      failure("producer abort-drain wait completed without an outcome");
    }
    return outcome;
  };

  schedule();
  try {
    for (let sequence = startSequence; sequence < total; sequence += 1) {
      const task = active.get(sequence);
      if (task === undefined) {
        const failureValue = terminal;
        if (failureValue !== undefined) throw failureValue.cause;
        failure(`missing-parent scheduler omitted input ${sequence}`);
      }
      let evidence: Readonly<Record<string, unknown>>;
      try {
        evidence = await task.result;
      } catch (cause) {
        establishTerminal(sequence, cause);
        throw terminal?.cause ?? cause;
      } finally {
        active.delete(sequence);
      }
      throwIfTerminal();
      try {
        await callFailpoint(
          invocation,
          "after-parent-produced-before-entry",
          sequence,
        );
        throwIfTerminal();
        const entry = entryBuilder(
          invocation,
          evidence,
          sequence,
          previousMac,
          key,
        );
        invocation.persistenceState.mayHaveStarted = true;
        await appendLine(
          invocation,
          workHandle,
          canonicalJson(entry),
          `checkpoint entry ${sequence}`,
        );
        previousMac = entry.entry_mac as string;
        throwIfTerminal();
        await callFailpoint(invocation, "after-entry-durable", sequence);
        throwIfTerminal();
      } catch (cause) {
        establishTerminal(sequence, cause);
        const failureValue = terminal;
        throw failureValue === undefined ? cause : failureValue.cause;
      }
      schedule();
    }
  } catch (cause) {
    establishTerminal(startSequence, cause);
    const outcome = await awaitBoundedDrain();
    const primary = terminal === undefined ? cause : terminal.cause;
    const cleanupFailures: unknown[] = [];
    if (outcome.controllerStatus === "rejected") {
      cleanupFailures.push(outcome.controllerFailure);
    }
    if (outcome.timerFailure !== undefined) {
      cleanupFailures.push(outcome.timerFailure);
    }
    if (outcome.timedOut) {
      cleanupFailures.push(
        new FloodgateV7TeacherAbortDrainTimeoutError(
          invocation.runBinding.producer_control.abort_drain_ms,
          outcome.pendingRawProducers,
          outcome.controllerStatus,
        ),
      );
    }
    if (cleanupFailures.length > 0) {
      throw new FloodgateV7TeacherProducerCleanupError(
        primary,
        cleanupFailures,
      );
    }
    throw primary;
  }
  return previousMac;
}

async function executeCheckpoint(
  invocation: CapturedInvocation,
): Promise<Readonly<FloodgateV7TeacherCheckpointReceipt>> {
  let stageHandle: fs.promises.FileHandle | undefined;
  let workHandle: fs.promises.FileHandle | undefined;
  let primaryFailure: unknown;
  let salt: Buffer | undefined;
  let derived: Buffer | undefined;
  try {
    salt = Buffer.from(invocation.runId, "hex");
    if (invocation.keyMaterial.kind !== "root") {
      failure("v2 checkpoint received non-root key material");
    }
    derived = Buffer.from(
      hkdfSync(
        "sha256",
        invocation.keyMaterial.bytes,
        salt,
        Buffer.from(KEY_INFO),
        32,
      ),
    );
    try {
      stageHandle = await fs.promises.open(
        invocation.lease.stageRoot,
        fs.constants.O_RDONLY |
          fs.constants.O_DIRECTORY |
          fs.constants.O_NOFOLLOW,
      );
    } catch (cause) {
      return failure(
        "authorized stage cannot be held without following links",
        cause,
      );
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(invocation.lease.stageRoot);
    } catch (cause) {
      return failure("held stage entries cannot be listed", cause);
    }
    if (
      entries.length > 1 ||
      (entries.length === 1 &&
        entries[0] !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME)
    ) {
      failure("v7 teacher stage must contain only work.jsonl");
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);

    const workPath = `${invocation.lease.stageRoot}/${FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME}`;
    const fresh = entries.length === 0;
    if (fresh) invocation.persistenceState.mayHaveStarted = true;
    try {
      workHandle = await fs.promises.open(
        workPath,
        (fresh ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0) |
          fs.constants.O_RDWR |
          fs.constants.O_APPEND |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
    } catch (cause) {
      return failure(
        "work.jsonl cannot be opened with exclusive no-follow policy",
        cause,
      );
    }
    if (fresh) {
      try {
        await workHandle.chmod(0o600);
      } catch (cause) {
        persistenceFailure(
          "fresh work.jsonl exact-mode establishment may have persisted",
          cause,
        );
      }
    }
    let workStat = await workHandle.stat({ bigint: true });
    verifyWorkStat(workStat, invocation);
    const workIdentity = Object.freeze({
      dev: workStat.dev,
      ino: workStat.ino,
    });

    let prefix: ScanResult;
    let resumedParents = 0;
    if (fresh) {
      prefix = Object.freeze({
        completedParents: 0,
        previousMac: "",
        sealed: false,
        authenticatedBytes: 0,
        tornTail: false,
      });
    } else {
      const existing = await scanWorkHandle(
        workHandle,
        invocation,
        derived,
        "resumable-prefix",
        workIdentity,
      );
      await verifyWorkPathSnapshot(workPath, existing.snapshot, invocation);
      prefix = existing;
      resumedParents = prefix.completedParents;
      if (prefix.tornTail) {
        invocation.persistenceState.mayHaveStarted = true;
        try {
          await workHandle.truncate(prefix.authenticatedBytes);
        } catch (cause) {
          persistenceFailure("torn-tail truncation may have persisted", cause);
        }
      }
      try {
        await workHandle.sync();
      } catch (cause) {
        persistenceFailure(
          "existing authenticated work sync may have persisted",
          cause,
        );
      }
      await syncStageDirectory(
        stageHandle,
        "stage before existing-prefix resume",
      );
    }

    let previousMac = prefix.previousMac;
    if (prefix.authenticatedBytes === 0) {
      const header = buildHeader(invocation, derived);
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(header),
        "checkpoint header",
      );
      previousMac = header.header_mac as string;
      await syncStageDirectory(stageHandle, "stage after checkpoint header");
      await callFailpoint(invocation, "after-header-durable");
    }

    if (!prefix.sealed) {
      previousMac = await appendMissingParentsInOrder(
        invocation,
        workHandle,
        derived,
        prefix.completedParents,
        previousMac,
      );
      const seal = buildSeal(invocation, previousMac, derived);
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(seal),
        "checkpoint seal",
      );
      await syncStageDirectory(stageHandle, "stage after checkpoint seal");
      await callFailpoint(invocation, "after-seal-durable");
    }

    await callFailpoint(invocation, "before-final-reopen");
    await verifyStagePath(invocation);
    try {
      await closeHandle(invocation, "work", workHandle);
    } catch (cause) {
      let cleanupCause: unknown;
      try {
        await workHandle.close();
      } catch (cleanupFailure) {
        cleanupCause = cleanupFailure;
      }
      workHandle = undefined;
      persistenceFailure(
        "work.jsonl close before final reopen may have persisted",
        { cause, cleanupCause },
      );
    }
    workHandle = undefined;
    try {
      workHandle = await fs.promises.open(
        workPath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
    } catch (cause) {
      return failure(
        "work.jsonl cannot be reopened without following links",
        cause,
      );
    }
    await verifyStagePath(invocation);
    workStat = await workHandle.stat({ bigint: true });
    verifyWorkStat(workStat, invocation);
    if (
      workStat.dev !== workIdentity.dev ||
      workStat.ino !== workIdentity.ino
    ) {
      failure("work.jsonl identity changed before final verification");
    }
    const finalPrefix = await scanWorkHandle(
      workHandle,
      invocation,
      derived,
      "sealed-final",
      workIdentity,
    );
    await callFailpoint(
      invocation,
      "after-final-scan-before-path-confirmation",
    );
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    const finalEntries = await fs.promises.readdir(invocation.lease.stageRoot);
    if (
      finalEntries.length !== 1 ||
      finalEntries[0] !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME
    ) {
      failure("stage entry set changed before success");
    }
    await verifyWorkPathSnapshot(workPath, finalPrefix.snapshot, invocation);
    verifyWorkSnapshot(
      await workHandle.stat({ bigint: true }),
      finalPrefix.snapshot,
      invocation,
      "held work.jsonl changed after final scan",
    );
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    return Object.freeze({
      contract: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
      claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
      algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
      run_id: invocation.runId,
      key_id: invocation.keyId,
      stage: Object.freeze({
        basename: invocation.lease.receipt.stage_basename,
        parent_dev: invocation.lease.receipt.parent_identity.dev.toString(10),
        parent_ino: invocation.lease.receipt.parent_identity.ino.toString(10),
        dev: invocation.lease.receipt.stage_identity.dev.toString(10),
        ino: invocation.lease.receipt.stage_identity.ino.toString(10),
      }),
      work: Object.freeze({
        filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        format: FORMAT,
        records: invocation.training.parents.length,
        bytes: finalPrefix.fileBytes,
        sha256: finalPrefix.fileSha256,
        completed_parents: invocation.training.parents.length,
        resumed_parents: resumedParents,
        durability: DURABILITY,
      }),
    });
  } catch (cause) {
    const classified =
      invocation.persistenceState.mayHaveStarted &&
      !(
        cause instanceof
        FloodgateV7TeacherCheckpointPersistenceIndeterminateError
      )
        ? new FloodgateV7TeacherCheckpointPersistenceIndeterminateError(
            "failure occurred after checkpoint persistence may have started",
            { cause },
          )
        : cause;
    primaryFailure = classified;
    throw classified;
  } finally {
    if (derived !== undefined) zeroBytes(derived);
    if (salt !== undefined) zeroBytes(salt);
    zeroBytes(invocation.keyMaterial.bytes);
    const closeFailures: Array<{
      readonly kind: "work" | "stage";
      readonly cause: unknown;
    }> = [];
    if (workHandle !== undefined) {
      try {
        await closeHandle(invocation, "work", workHandle);
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await workHandle.close();
        } catch (cleanupFailure) {
          cleanupCause = cleanupFailure;
        }
        closeFailures.push({ kind: "work", cause: { cause, cleanupCause } });
      }
    }
    if (stageHandle !== undefined) {
      try {
        await closeHandle(invocation, "stage", stageHandle);
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await stageHandle.close();
        } catch (cleanupFailure) {
          cleanupCause = cleanupFailure;
        }
        closeFailures.push({ kind: "stage", cause: { cause, cleanupCause } });
      }
    }
    if (closeFailures.length > 0) {
      if (
        invocation.persistenceState.mayHaveStarted ||
        closeFailures.some((entry) => entry.kind === "work")
      ) {
        persistenceFailure(
          "filesystem handle close failed after work.jsonl may have persisted",
          { primaryFailure, closeFailures },
        );
      }
      failure("held stage directory handle could not be closed", {
        primaryFailure,
        closeFailures,
      });
    }
  }
}

function buildV3Receipt(
  invocation: CapturedV3Invocation,
  finalPrefix: Readonly<V3WorkFileScanResult>,
  resumedParents: number,
): Readonly<FloodgateV7TeacherCheckpointV3Receipt> {
  const milestone100Mac = finalPrefix.milestone100Mac;
  if (milestone100Mac === undefined) {
    failure("v3 receipt cannot omit milestone 100");
  }
  const common = {
    contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
    claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
    algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
    run_id: invocation.runId,
    key_id: invocation.keyId,
    gate_contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
    stage: Object.freeze({
      basename: invocation.lease.receipt.stage_basename,
      parent_dev: invocation.lease.receipt.parent_identity.dev.toString(10),
      parent_ino: invocation.lease.receipt.parent_identity.ino.toString(10),
      dev: invocation.lease.receipt.stage_identity.dev.toString(10),
      ino: invocation.lease.receipt.stage_identity.ino.toString(10),
    }),
  } as const;
  const workCommon = {
    filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    format: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
    training_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
    records: finalPrefix.completeRecords,
    bytes: finalPrefix.fileBytes,
    sha256: finalPrefix.fileSha256,
    resumed_parents: resumedParents,
    durability: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  } as const;
  switch (invocation.gate) {
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100:
      return Object.freeze({
        ...common,
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
        sealed: false,
        work: Object.freeze({
          ...workCommon,
          target_parents: 100,
          completed_parents: 100,
          milestone_100_mac: milestone100Mac,
          milestone_500_mac: null,
        }),
      });
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500: {
      const milestone500Mac = finalPrefix.milestone500Mac;
      if (milestone500Mac === undefined) {
        failure("v3 500-parent receipt cannot omit milestone 500");
      }
      return Object.freeze({
        ...common,
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
        sealed: false,
        work: Object.freeze({
          ...workCommon,
          target_parents: 500,
          completed_parents: 500,
          milestone_100_mac: milestone100Mac,
          milestone_500_mac: milestone500Mac,
        }),
      });
    }
    case FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000: {
      const milestone500Mac = finalPrefix.milestone500Mac;
      if (milestone500Mac === undefined) {
        failure("v3 final receipt cannot omit milestone 500");
      }
      return Object.freeze({
        ...common,
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
        sealed: true,
        work: Object.freeze({
          ...workCommon,
          target_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
          completed_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
          milestone_100_mac: milestone100Mac,
          milestone_500_mac: milestone500Mac,
        }),
      });
    }
  }
}

async function executeV3Checkpoint(
  invocation: CapturedV3Invocation,
): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
  let stageHandle: fs.promises.FileHandle | undefined;
  let workHandle: fs.promises.FileHandle | undefined;
  let primaryFailure: unknown;
  let salt: Buffer | undefined;
  let derived: Buffer | undefined;
  try {
    salt = Buffer.from(invocation.runId, "hex");
    derived =
      invocation.keyMaterial.kind === "v3-derived"
        ? invocation.keyMaterial.bytes
        : Buffer.from(
            hkdfSync(
              "sha256",
              invocation.keyMaterial.bytes,
              salt,
              Buffer.from(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_HKDF_INFO),
              32,
            ),
          );
    try {
      stageHandle = await fs.promises.open(
        invocation.lease.stageRoot,
        fs.constants.O_RDONLY |
          fs.constants.O_DIRECTORY |
          fs.constants.O_NOFOLLOW,
      );
    } catch (cause) {
      return failure(
        "authorized v3 stage cannot be held without following links",
        cause,
      );
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(invocation.lease.stageRoot);
    } catch (cause) {
      return failure("held v3 stage entries cannot be listed", cause);
    }
    if (
      entries.length > 1 ||
      (entries.length === 1 &&
        entries[0] !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME)
    ) {
      failure("v3 teacher stage must contain only work.jsonl");
    }
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);

    const workPath = `${invocation.lease.stageRoot}/${FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME}`;
    const fresh = entries.length === 0;
    if (
      fresh &&
      invocation.gate !==
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
    ) {
      failure("a fresh v3 stream must begin at the 100-parent gate");
    }
    if (fresh) invocation.persistenceState.mayHaveStarted = true;
    try {
      workHandle = await fs.promises.open(
        workPath,
        (fresh ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0) |
          fs.constants.O_RDWR |
          fs.constants.O_APPEND |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
    } catch (cause) {
      return failure(
        "v3 work.jsonl cannot be opened with exclusive no-follow policy",
        cause,
      );
    }
    if (fresh) {
      try {
        await workHandle.chmod(0o600);
      } catch (cause) {
        persistenceFailure(
          "fresh v3 work.jsonl exact-mode establishment may have persisted",
          cause,
        );
      }
    }
    let workStat = await workHandle.stat({ bigint: true });
    verifyV3WorkStat(workStat, invocation);
    const workIdentity = Object.freeze({
      dev: workStat.dev,
      ino: workStat.ino,
    });

    let prefix: Readonly<V3ScanResult>;
    let resumedParents = 0;
    if (fresh) {
      prefix = Object.freeze({
        completeRecords: 0,
        completedParents: 0,
        previousMac: "",
        milestone100Mac: undefined,
        milestone500Mac: undefined,
        sealed: false,
        authenticatedBytes: 0,
        tornTail: false,
      });
      assertV3GateCanResume(prefix, invocation.gate);
    } else {
      const existing = await scanV3WorkHandle(
        workHandle,
        invocation,
        derived,
        "resumable-prefix",
        workIdentity,
      );
      await verifyV3WorkPathSnapshot(workPath, existing.snapshot, invocation);
      assertV3GateCanResume(existing, invocation.gate);
      prefix = existing;
      resumedParents = prefix.completedParents;
      if (prefix.tornTail) {
        invocation.persistenceState.mayHaveStarted = true;
        try {
          await workHandle.truncate(prefix.authenticatedBytes);
        } catch (cause) {
          persistenceFailure(
            "v3 same-gate torn-tail truncation may have persisted",
            cause,
          );
        }
      }
      try {
        await workHandle.sync();
      } catch (cause) {
        persistenceFailure(
          "existing authenticated v3 work sync may have persisted",
          cause,
        );
      }
      await syncStageDirectory(
        stageHandle,
        "stage before existing v3 prefix resume",
      );
    }

    let previousMac = prefix.previousMac;
    if (prefix.authenticatedBytes === 0) {
      const header = buildV3Header(invocation, derived);
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(header),
        "v3 checkpoint header",
      );
      previousMac = header.header_mac as string;
      await syncStageDirectory(stageHandle, "stage after v3 checkpoint header");
      await callFailpoint(invocation, "after-header-durable");
    }

    const plan = v3GatePlan(invocation.gate);
    previousMac = await appendMissingParentsInOrder(
      invocation,
      workHandle,
      derived,
      prefix.completedParents,
      previousMac,
      plan.targetParents,
      buildV3Entry,
    );
    let milestone100Mac = prefix.milestone100Mac;
    let milestone500Mac = prefix.milestone500Mac;
    if (
      invocation.gate ===
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100 &&
      milestone100Mac === undefined
    ) {
      const milestone = buildV3Milestone(
        invocation,
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
        previousMac,
        derived,
      );
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(milestone),
        "v3 checkpoint 100-parent milestone",
      );
      milestone100Mac = milestone.milestone_mac as string;
      previousMac = milestone100Mac;
      await syncStageDirectory(
        stageHandle,
        "stage after v3 100-parent milestone",
      );
      await callFailpoint(
        invocation,
        "after-milestone-durable",
        undefined,
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
      );
    } else if (
      invocation.gate ===
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500 &&
      milestone500Mac === undefined
    ) {
      if (milestone100Mac === undefined) {
        failure("v3 500-parent gate lost milestone 100 authority");
      }
      const milestone = buildV3Milestone(
        invocation,
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
        previousMac,
        derived,
      );
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(milestone),
        "v3 checkpoint 500-parent milestone",
      );
      milestone500Mac = milestone.milestone_mac as string;
      previousMac = milestone500Mac;
      await syncStageDirectory(
        stageHandle,
        "stage after v3 500-parent milestone",
      );
      await callFailpoint(
        invocation,
        "after-milestone-durable",
        undefined,
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
      );
    } else if (
      invocation.gate ===
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000 &&
      !prefix.sealed
    ) {
      if (milestone100Mac === undefined || milestone500Mac === undefined) {
        failure("v3 final gate lost milestone authority before sealing");
      }
      const seal = buildV3Seal(
        invocation,
        previousMac,
        milestone100Mac,
        milestone500Mac,
        derived,
      );
      invocation.persistenceState.mayHaveStarted = true;
      await appendLine(
        invocation,
        workHandle,
        canonicalJson(seal),
        "v3 checkpoint seal",
      );
      await syncStageDirectory(stageHandle, "stage after v3 checkpoint seal");
      await callFailpoint(invocation, "after-seal-durable");
    }

    await callFailpoint(invocation, "before-final-reopen");
    await verifyStagePath(invocation);
    try {
      await closeHandle(invocation, "work", workHandle);
    } catch (cause) {
      let cleanupCause: unknown;
      try {
        await workHandle.close();
      } catch (cleanupFailure) {
        cleanupCause = cleanupFailure;
      }
      workHandle = undefined;
      persistenceFailure(
        "v3 work.jsonl close before final reopen may have persisted",
        { cause, cleanupCause },
      );
    }
    workHandle = undefined;
    try {
      workHandle = await fs.promises.open(
        workPath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
    } catch (cause) {
      return failure(
        "v3 work.jsonl cannot be reopened without following links",
        cause,
      );
    }
    await verifyStagePath(invocation);
    workStat = await workHandle.stat({ bigint: true });
    verifyV3WorkStat(workStat, invocation);
    if (
      workStat.dev !== workIdentity.dev ||
      workStat.ino !== workIdentity.ino
    ) {
      failure("v3 work.jsonl identity changed before final verification");
    }
    const finalPrefix = await scanV3WorkHandle(
      workHandle,
      invocation,
      derived,
      plan.sealed ? "sealed-final" : "durable-prefix-final",
      workIdentity,
      plan.sealed ? invocation.verifiedParentVisitorForTests : undefined,
    );
    assertV3ExactGateFinal(finalPrefix, invocation.gate);
    await callFailpoint(
      invocation,
      "after-final-scan-before-path-confirmation",
    );
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    const finalEntries = await fs.promises.readdir(invocation.lease.stageRoot);
    if (
      finalEntries.length !== 1 ||
      finalEntries[0] !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME
    ) {
      failure("v3 stage entry set changed before success");
    }
    await verifyV3WorkPathSnapshot(workPath, finalPrefix.snapshot, invocation);
    verifyV3WorkSnapshot(
      await workHandle.stat({ bigint: true }),
      finalPrefix.snapshot,
      invocation,
      "held v3 work.jsonl changed after final scan",
    );
    verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
    await verifyStagePath(invocation);
    return buildV3Receipt(invocation, finalPrefix, resumedParents);
  } catch (cause) {
    const classified =
      invocation.persistenceState.mayHaveStarted &&
      !(
        cause instanceof
        FloodgateV7TeacherCheckpointPersistenceIndeterminateError
      )
        ? new FloodgateV7TeacherCheckpointPersistenceIndeterminateError(
            "failure occurred after v3 checkpoint persistence may have started",
            { cause },
          )
        : cause;
    primaryFailure = classified;
    throw classified;
  } finally {
    if (derived !== undefined && derived !== invocation.keyMaterial.bytes) {
      zeroBytes(derived);
    }
    if (salt !== undefined) zeroBytes(salt);
    zeroBytes(invocation.keyMaterial.bytes);
    const closeFailures: Array<{
      readonly kind: "work" | "stage";
      readonly cause: unknown;
    }> = [];
    if (workHandle !== undefined) {
      try {
        await closeHandle(invocation, "work", workHandle);
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await workHandle.close();
        } catch (cleanupFailure) {
          cleanupCause = cleanupFailure;
        }
        closeFailures.push({ kind: "work", cause: { cause, cleanupCause } });
      }
    }
    if (stageHandle !== undefined) {
      try {
        await closeHandle(invocation, "stage", stageHandle);
      } catch (cause) {
        let cleanupCause: unknown;
        try {
          await stageHandle.close();
        } catch (cleanupFailure) {
          cleanupCause = cleanupFailure;
        }
        closeFailures.push({ kind: "stage", cause: { cause, cleanupCause } });
      }
    }
    if (closeFailures.length > 0) {
      if (
        invocation.persistenceState.mayHaveStarted ||
        closeFailures.some((entry) => entry.kind === "work")
      ) {
        persistenceFailure(
          "filesystem handle close failed after v3 work.jsonl may have persisted",
          { primaryFailure, closeFailures },
        );
      }
      failure("held v3 stage directory handle could not be closed", {
        primaryFailure,
        closeFailures,
      });
    }
  }
}

async function executeAndClose(
  invocation: CapturedInvocation,
): Promise<Readonly<FloodgateV7TeacherCheckpointReceipt>> {
  let result: Readonly<FloodgateV7TeacherCheckpointReceipt> | undefined;
  let primary: unknown;
  try {
    result = await executeCheckpoint(invocation);
  } catch (cause) {
    primary = cause;
  }
  try {
    await invocation.lease.close();
  } catch (closeCause) {
    if (
      invocation.persistenceState.mayHaveStarted ||
      primary instanceof
        FloodgateV7TeacherCheckpointPersistenceIndeterminateError
    ) {
      persistenceFailure(
        "checkpoint persistence or authorized stage lease close is indeterminate",
        { primary, closeCause },
      );
    }
    if (primary === undefined) {
      failure("authorized stage lease could not be closed", closeCause);
    }
    failure("checkpoint failed and authorized stage lease close also failed", {
      primary,
      closeCause,
    });
  }
  if (primary !== undefined) throw primary;
  if (result === undefined) failure("checkpoint produced no result");
  return result;
}

async function executeV3AndClose(
  invocation: CapturedV3Invocation,
  successfulReceiptRegistry?: WeakSet<object>,
): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
  let result: Readonly<FloodgateV7TeacherCheckpointV3Receipt> | undefined;
  let primary: unknown;
  try {
    result = await executeV3Checkpoint(invocation);
  } catch (cause) {
    primary = cause;
  }
  try {
    await invocation.lease.close();
  } catch (closeCause) {
    if (
      invocation.persistenceState.mayHaveStarted ||
      primary instanceof
        FloodgateV7TeacherCheckpointPersistenceIndeterminateError
    ) {
      persistenceFailure(
        "v3 checkpoint persistence or authorized stage lease close is indeterminate",
        { primary, closeCause },
      );
    }
    if (primary === undefined) {
      failure("authorized v3 stage lease could not be closed", closeCause);
    }
    failure("v3 checkpoint failed and stage lease close also failed", {
      primary,
      closeCause,
    });
  }
  if (primary !== undefined) throw primary;
  if (result === undefined) failure("v3 checkpoint produced no result");
  if (successfulReceiptRegistry !== undefined) {
    reflectApply(nativeWeakSetAdd, successfulReceiptRegistry, [result]);
  }
  return result;
}

async function closeAfterCaptureFailure(
  lease: Readonly<FloodgateTeacherStageLease>,
  primary: unknown,
): Promise<never> {
  try {
    await lease.close();
  } catch (closeCause) {
    failure(
      "argument capture failed and authorized stage lease close also failed",
      { primary, closeCause },
    );
  }
  throw primary;
}

async function discardKeyAndCloseAfterCaptureFailure(
  lease: Readonly<FloodgateTeacherStageLease>,
  authorization: Readonly<FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization>,
  primary: unknown,
  closeLease: boolean,
): Promise<never> {
  let discardFailure: unknown;
  let closeFailure: unknown;
  try {
    discardFloodgateV7DeploymentTeacherCheckpointV3Key(authorization);
  } catch (cause) {
    discardFailure = cause;
  }
  if (closeLease) {
    try {
      await lease.close();
    } catch (cause) {
      closeFailure = cause;
    }
  }
  if (discardFailure !== undefined || closeFailure !== undefined) {
    failure(
      "argument capture failed and v3 deployment key or authorized stage cleanup also failed",
      { primary, discardFailure, closeFailure },
    );
  }
  throw primary;
}

function checkpointV3WithDeploymentKey<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
>(
  lease: Readonly<FloodgateTeacherStageLease>,
  authenticatedTrainingRows: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  producerController: FloodgateV7TeacherProducerController,
  options: FloodgateV7TeacherCheckpointV3Options,
  authorization: Readonly<
    FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization<TBoundary>
  >,
  testDependencies:
    FloodgateV7TeacherCheckpointV3DeploymentKeyDependenciesForTests | undefined,
  claimStage: (lease: Readonly<FloodgateTeacherStageLease>) => void,
  claimTraining: (input: Readonly<AuthenticatedFloodgateTrainingRows>) => void,
  claimKey: DeploymentV3KeyClaim<TBoundary>,
  successfulReceiptRegistry?: WeakSet<object>,
): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
  // Invoking the sink transfers the key capability immediately. The lease
  // remains caller-owned until the exact production/test registry claim wins.
  let stageClaimed = false;
  let executionKey: Buffer | undefined;
  let invocation: CapturedV3Invocation;
  try {
    claimStage(lease);
    stageClaimed = true;
    claimTraining(authenticatedTrainingRows);
    const captured = captureV3InvocationArguments(
      lease,
      authenticatedTrainingRows,
      runBinding,
      producerController,
      options,
    );
    const capturedTestDependencies =
      testDependencies === undefined
        ? undefined
        : captureV3DeploymentKeyDependenciesForTests(testDependencies);
    const request = deploymentV3KeyRequest(captured);
    executionKey = claimAndCopyDeploymentV3Key(
      claimKey,
      authorization,
      request,
    );
    const ownerEffectiveUserId = requiredInteger(
      authorization.authorization.key_deployment.owner_uid,
      "v3 deployment key authorization owner uid",
    );
    if (
      capturedTestDependencies !== undefined &&
      capturedTestDependencies.effectiveUserId !== ownerEffectiveUserId
    ) {
      failure(
        "dependencies.effectiveUserId differs from the v3 deployment key owner uid",
      );
    }
    invocation = captureV3InvocationWithDerivedKey(captured, executionKey, {
      effectiveUserId: ownerEffectiveUserId,
      failpoint: capturedTestDependencies?.failpoint,
      writeForTests: capturedTestDependencies?.writeForTests,
      readForTests: capturedTestDependencies?.readForTests,
      verifiedParentVisitorForTests:
        capturedTestDependencies?.verifiedParentVisitorForTests,
      closeForTests: capturedTestDependencies?.closeForTests,
      scheduleProducerControlTimerForTests:
        capturedTestDependencies?.scheduleProducerControlTimerForTests,
    });
    executionKey = undefined;
  } catch (cause) {
    if (executionKey !== undefined) zeroBytes(executionKey);
    return discardKeyAndCloseAfterCaptureFailure(
      lease,
      authorization,
      cause,
      stageClaimed,
    );
  }
  return executeV3AndClose(invocation, successfulReceiptRegistry);
}

/**
 * Claim authenticated training rows and a private authorized test stage, then
 * resume or create the HMAC-chained compact v7 completed-parent checkpoint.
 */
export function checkpointFloodgateV7TeacherParentsCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  authenticatedTrainingRows: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  producerController: FloodgateV7TeacherProducerController,
  options: FloodgateV7TeacherCheckpointOptions,
  dependencies: FloodgateV7TeacherCheckpointDependencies,
): Promise<Readonly<FloodgateV7TeacherCheckpointReceipt>> {
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests(lease);
  let invocation: CapturedInvocation;
  try {
    claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      authenticatedTrainingRows,
    );
    invocation = captureInvocation(
      lease,
      authenticatedTrainingRows,
      runBinding,
      producerController,
      options,
      dependencies,
      false,
    );
  } catch (cause) {
    return closeAfterCaptureFailure(lease, cause);
  }
  return executeAndClose(invocation);
}

/**
 * Advance one fixed v3 gate using a single-use capability issued by the fixed
 * production deployment-key authority. This boundary accepts no key bytes,
 * effective-user identity, filesystem origin, or injectable dependencies.
 */
export function checkpointFloodgateV7TeacherParentsV3(
  lease: Readonly<FloodgateTeacherStageLease>,
  authenticatedTrainingRows: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  producerController: FloodgateV7TeacherProducerController,
  options: FloodgateV7TeacherCheckpointV3Options,
  authorization: Readonly<
    FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization<"production-fixed-current-euid-userinfo-home-key-deployment">
  >,
): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
  if (arguments.length !== 6) {
    failure("production v3 checkpoint accepts exactly six arguments");
  }
  return checkpointV3WithDeploymentKey(
    lease,
    authenticatedTrainingRows,
    runBinding,
    producerController,
    options,
    authorization,
    undefined,
    claimActiveAuthorizedFloodgateTeacherStageLease,
    claimActiveVerifiedPinnedFloodgateTrainingRows,
    claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKey,
    productionV3ReceiptClaims,
  );
}

/**
 * Test-only connector for an injected deployment-key capability. The seam may
 * inject checkpoint I/O hooks, but it never accepts root or derived key bytes.
 */
export function checkpointFloodgateV7TeacherParentsV3WithDeploymentKeyCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  authenticatedTrainingRows: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  producerController: FloodgateV7TeacherProducerController,
  options: FloodgateV7TeacherCheckpointV3Options,
  authorization: Readonly<
    FloodgateV7DeploymentTeacherCheckpointV3KeyAuthorization<"test-only-injected-current-euid-home-key-deployment">
  >,
  dependencies: FloodgateV7TeacherCheckpointV3DeploymentKeyDependenciesForTests,
): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
  if (arguments.length !== 7) {
    failure(
      "test v3 deployment-key checkpoint accepts exactly seven arguments",
    );
  }
  return checkpointV3WithDeploymentKey(
    lease,
    authenticatedTrainingRows,
    runBinding,
    producerController,
    options,
    authorization,
    dependencies,
    claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests,
    claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
    claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests,
    testDeploymentKeyV3ReceiptClaims,
  );
}

/**
 * Advance exactly one fixed v3 durability gate over the same authenticated
 * full 24,000-parent input. Prefix gates remain deliberately unsealed; only
 * the final gate may append the authenticated seal.
 */
export function checkpointFloodgateV7TeacherParentsV3CoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  authenticatedTrainingRows: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  producerController: FloodgateV7TeacherProducerController,
  options: FloodgateV7TeacherCheckpointV3Options,
  dependencies: FloodgateV7TeacherCheckpointV3Dependencies,
): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
  claimActiveAuthorizedFloodgateTeacherStageLeaseCoreForTests(lease);
  let invocation: CapturedV3Invocation;
  try {
    claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
      authenticatedTrainingRows,
    );
    invocation = captureV3Invocation(
      lease,
      authenticatedTrainingRows,
      runBinding,
      producerController,
      options,
      dependencies,
    );
  } catch (cause) {
    return closeAfterCaptureFailure(lease, cause);
  }
  return executeV3AndClose(invocation);
}

type SealedScannerBoundary =
  FloodgateV7TrainingLabelSealedScannerExecutionBoundary;

interface CapturedSealedScannerTransaction {
  readonly value: Readonly<FloodgateTeacherStagePublicationTransaction>;
  readonly authorizationReceipt: Readonly<
    FloodgateTeacherStagePublicationTransaction["authorizationReceipt"]
  >;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly commit: () => Promise<
    Readonly<FloodgateTeacherStagePublicationReceipt>
  >;
  readonly abort: () => Promise<void>;
}

interface CapturedSealedScannerDependencies {
  readonly readForTests?: FloodgateV7TrainingLabelSealedScannerDependenciesForTests["readForTests"];
  readonly failpointForTests?: FloodgateV7TrainingLabelSealedScannerDependenciesForTests["failpointForTests"];
  readonly observeKeyForTests?: FloodgateV7TrainingLabelSealedScannerDependenciesForTests["observeKeyForTests"];
  readonly closeForTests?: FloodgateV7TeacherCheckpointDependencies["closeForTests"];
}

interface CapturedSealedScannerInputs {
  readonly lease: Readonly<FloodgateTeacherStageLease>;
  readonly training: CapturedTraining;
  readonly runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
  readonly runId: string;
  readonly keyId: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
  readonly effectiveUserId: number;
  readonly dependencies: Readonly<CapturedSealedScannerDependencies>;
}

interface SealedScannerUnkeyedPreflight {
  readonly fileBytes: number;
  readonly fileSha256: string;
  readonly snapshot: WorkFileSnapshot;
}

interface SealedScannerState {
  readonly boundary: SealedScannerBoundary;
  readonly invocation: Readonly<CapturedV3Invocation>;
  readonly transaction: Readonly<CapturedSealedScannerTransaction>;
  readonly dependencies: Readonly<CapturedSealedScannerDependencies>;
  readonly stageHandle: fs.promises.FileHandle;
  readonly workHandle: fs.promises.FileHandle;
  readonly workPath: string;
  readonly initialEntries: readonly string[];
  readonly pinned: Readonly<V3WorkFileScanResult>;
  readonly receipt: Readonly<FloodgateV7TrainingLabelSealedScannerReceipt>;
  phase:
    | "ready"
    | "terminal"
    | "committing"
    | "cleaning"
    | "cleanup-indeterminate"
    | "closed";
  busy: boolean;
  keyZeroized: boolean;
  workClosed: boolean;
  stageClosed: boolean;
  transactionSettled: boolean;
  cleanupFailure?: unknown;
  terminalReceipt?: Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>;
}

interface SealedScannerRegistry {
  readonly boundary: SealedScannerBoundary;
  readonly available: WeakMap<
    Readonly<FloodgateV7TrainingLabelSealedScanner>,
    SealedScannerState
  >;
  readonly known: WeakSet<Readonly<FloodgateV7TrainingLabelSealedScanner>>;
  readonly terminals: WeakMap<
    Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>,
    SealedScannerState
  >;
}

function sealedScannerRegistry(
  boundary: SealedScannerBoundary,
): Readonly<SealedScannerRegistry> {
  return Object.freeze({
    boundary,
    available: new WeakMap<
      Readonly<FloodgateV7TrainingLabelSealedScanner>,
      SealedScannerState
    >(),
    known: new WeakSet<Readonly<FloodgateV7TrainingLabelSealedScanner>>(),
    terminals: new WeakMap<
      Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>,
      SealedScannerState
    >(),
  });
}

const PRODUCTION_SEALED_SCANNERS = sealedScannerRegistry(
  "production-fixed-training-input-and-sealed-scan-key-authorities",
);
const TEST_SEALED_SCANNERS = sealedScannerRegistry(
  "test-only-injected-training-input-and-sealed-scan-key-authorities",
);

function exactOwnKeys(
  value: object,
  expected: readonly string[],
  label: string,
): Readonly<Record<PropertyKey, PropertyDescriptor>> {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.some((key) => typeof key !== "string") ||
    !exactStringList(
      (actual as string[]).sort(compareUtf8),
      [...expected].sort(compareUtf8),
    )
  ) {
    failure(`${label} keys differ`);
  }
  return descriptors;
}

function transactionData<T>(
  descriptors: Readonly<Record<PropertyKey, PropertyDescriptor>>,
  key: string,
  label: string,
): T {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    failure(`${label}.${key} must be an enumerable data property`);
  }
  return descriptor.value as T;
}

function captureSealedScannerTransaction(
  value: FloodgateTeacherStagePublicationTransaction,
): Readonly<CapturedSealedScannerTransaction> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (Object.getPrototypeOf(value) !== null &&
      Object.getPrototypeOf(value) !== Object.prototype)
  ) {
    failure("sealed scanner transaction must be an exact non-Proxy object");
  }
  const descriptors = exactOwnKeys(
    value,
    [
      "abort",
      "authorizationReceipt",
      "commit",
      "destinationRoot",
      "phase",
      "stageRoot",
    ],
    "sealed scanner transaction",
  );
  const phaseDescriptor = descriptors.phase;
  if (
    phaseDescriptor === undefined ||
    !("get" in phaseDescriptor) ||
    typeof phaseDescriptor.get !== "function" ||
    phaseDescriptor.set !== undefined ||
    phaseDescriptor.enumerable !== true ||
    value.phase !== "ready"
  ) {
    failure("sealed scanner transaction is not exactly ready");
  }
  const authorizationReceipt = transactionData<
    FloodgateTeacherStagePublicationTransaction["authorizationReceipt"]
  >(descriptors, "authorizationReceipt", "sealed scanner transaction");
  if (
    authorizationReceipt.contract !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT ||
    authorizationReceipt.trust_boundary !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY ||
    authorizationReceipt.status !==
      FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS ||
    canonicalJson(authorizationReceipt.allowed_entries) !==
      canonicalJson(FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES)
  ) {
    failure("sealed scanner transaction authorization differs");
  }
  const stageRoot = transactionData<string>(
    descriptors,
    "stageRoot",
    "sealed scanner transaction",
  );
  const destinationRoot = transactionData<string>(
    descriptors,
    "destinationRoot",
    "sealed scanner transaction",
  );
  const commit = transactionData<
    FloodgateTeacherStagePublicationTransaction["commit"]
  >(descriptors, "commit", "sealed scanner transaction");
  const abort = transactionData<
    FloodgateTeacherStagePublicationTransaction["abort"]
  >(descriptors, "abort", "sealed scanner transaction");
  if (
    typeof stageRoot !== "string" ||
    typeof destinationRoot !== "string" ||
    typeof commit !== "function" ||
    typeof abort !== "function" ||
    nodeIsProxy(commit) ||
    nodeIsProxy(abort)
  ) {
    failure("sealed scanner transaction fields differ");
  }
  return Object.freeze({
    value,
    authorizationReceipt,
    stageRoot,
    destinationRoot,
    commit: () => Reflect.apply(commit, value, []),
    abort: () => Reflect.apply(abort, value, []),
  });
}

function captureSealedScannerOptions(
  value: FloodgateV7TrainingLabelSealedScannerOptions,
): Readonly<FloodgateV7TrainingLabelSealedScannerOptions> {
  const options = strictRecord(
    value,
    ["keyId", "runId", "work"],
    "sealed scanner options",
  );
  if (typeof options.runId !== "string" || !RUN_ID_RE.test(options.runId)) {
    failure("sealed scanner runId must be 32 bytes of lowercase hex");
  }
  if (options.keyId !== FLOODGATE_V7_DEPLOYMENT_KEY_ID) {
    failure("sealed scanner keyId must be the fixed deployment key id");
  }
  const work = strictRecord(
    options.work,
    ["bytes", "sha256"],
    "sealed scanner work binding",
  );
  const bytes = requiredInteger(work.bytes, "sealed scanner work bytes", 1);
  if (bytes > FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES) {
    failure("sealed scanner work bytes exceed the fixed v3 bound");
  }
  return Object.freeze({
    runId: options.runId,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    work: Object.freeze({
      bytes,
      sha256: requiredSha256(work.sha256, "sealed scanner work sha256"),
    }),
  });
}

function captureSealedScannerSink(
  value: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
): FloodgateV7TeacherCheckpointV3VerifiedParentSink {
  if (typeof value !== "function" || nodeIsProxy(value)) {
    failure("sealed scanner sink must be a non-Proxy function");
  }
  return value;
}

function captureSealedScannerDependencies(
  value: FloodgateV7TrainingLabelSealedScannerDependenciesForTests | undefined,
): Readonly<CapturedSealedScannerDependencies> {
  if (value === undefined) return Object.freeze({});
  const expected = [
    "closeForTests",
    "failpointForTests",
    "observeKeyForTests",
    "readForTests",
  ].filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  const dependencies = strictRecord(
    value,
    expected,
    "sealed scanner dependencies",
  );
  for (const key of expected) {
    const candidate = dependencies[key];
    if (typeof candidate !== "function" || nodeIsProxy(candidate)) {
      failure(`sealed scanner dependencies.${key} must be a function`);
    }
  }
  return Object.freeze({
    readForTests: dependencies.readForTests as
      | FloodgateV7TrainingLabelSealedScannerDependenciesForTests["readForTests"]
      | undefined,
    failpointForTests: dependencies.failpointForTests as
      | FloodgateV7TrainingLabelSealedScannerDependenciesForTests["failpointForTests"]
      | undefined,
    observeKeyForTests: dependencies.observeKeyForTests as
      | FloodgateV7TrainingLabelSealedScannerDependenciesForTests["observeKeyForTests"]
      | undefined,
    closeForTests: dependencies.closeForTests as
      FloodgateV7TeacherCheckpointDependencies["closeForTests"] | undefined,
  });
}

function captureSealedScannerKeyAuthorityDependencies(
  value: FloodgateV7DeploymentKeyAuthorityDependencies,
): Readonly<FloodgateV7DeploymentKeyAuthorityDependencies> {
  if (!isPlainRecord(value)) {
    failure(
      "sealed scanner key authority dependencies must be a plain non-Proxy object",
    );
  }
  const optionalKeys = [
    "beforeFinalRevalidationForTests",
    "observeInternalKeyForTests",
    "observePreparedKeyForTests",
  ].filter((key) => Object.prototype.hasOwnProperty.call(value, key));
  const dependencies = strictRecord(
    value,
    ["effectiveUserId", "homeDirectory", ...optionalKeys],
    "sealed scanner key authority dependencies",
  );
  const effectiveUserId = requiredInteger(
    dependencies.effectiveUserId,
    "sealed scanner key authority dependencies.effectiveUserId",
  );
  if (typeof dependencies.homeDirectory !== "string") {
    failure(
      "sealed scanner key authority dependencies.homeDirectory must be a string",
    );
  }
  for (const key of optionalKeys) {
    const candidate = dependencies[key];
    if (typeof candidate !== "function" || nodeIsProxy(candidate)) {
      failure(
        `sealed scanner key authority dependencies.${key} must be a function`,
      );
    }
  }
  return Object.freeze({
    effectiveUserId,
    homeDirectory: dependencies.homeDirectory,
    beforeFinalRevalidationForTests:
      dependencies.beforeFinalRevalidationForTests as
        | FloodgateV7DeploymentKeyAuthorityDependencies["beforeFinalRevalidationForTests"]
        | undefined,
    observeInternalKeyForTests: dependencies.observeInternalKeyForTests as
      | FloodgateV7DeploymentKeyAuthorityDependencies["observeInternalKeyForTests"]
      | undefined,
    observePreparedKeyForTests: dependencies.observePreparedKeyForTests as
      | FloodgateV7DeploymentKeyAuthorityDependencies["observePreparedKeyForTests"]
      | undefined,
  });
}

type SealedScanKeyClaim<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
> = (
  authorization: Readonly<
    FloodgateV7DeploymentTeacherSealedScanV3KeyAuthorization<TBoundary>
  >,
  request: FloodgateV7DeploymentTeacherSealedScanV3KeyRequest,
) => Uint8Array;

type SealedScanKeyPrepare<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
> = (
  request: FloodgateV7DeploymentTeacherSealedScanV3KeyRequest,
) => Promise<
  Readonly<FloodgateV7DeploymentTeacherSealedScanV3KeyAuthorization<TBoundary>>
>;

interface CapturedSealedScannerKeyAuthority<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
> {
  readonly effectiveUserId: number;
  readonly prepare: SealedScanKeyPrepare<TBoundary>;
  readonly claim: SealedScanKeyClaim<TBoundary>;
}

function claimAndCopySealedScanKey<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
>(
  claim: SealedScanKeyClaim<TBoundary>,
  authorization: Readonly<
    FloodgateV7DeploymentTeacherSealedScanV3KeyAuthorization<TBoundary>
  >,
  request: Readonly<FloodgateV7DeploymentTeacherSealedScanV3KeyRequest>,
): Buffer {
  let claimed: Uint8Array | undefined;
  let copied: Buffer | undefined;
  try {
    claimed = claim(authorization, request);
    copied = copyExactOwned32ByteKey(
      claimed,
      "claimed sealed scanner v3 derived key",
    );
    return copied;
  } finally {
    if (claimed !== undefined) {
      try {
        zeroBytes(claimed);
      } catch (cause) {
        if (copied !== undefined) zeroBytes(copied);
        failure("claimed sealed scanner key could not be zeroized", cause);
      }
    }
  }
}

function sealedScannerKeyRequest(
  stageAuthorizationReceipt: Readonly<FloodgateTeacherStageLease["receipt"]>,
  runBinding: Readonly<FloodgateV7TeacherCheckpointRunBinding>,
  options: Readonly<FloodgateV7TrainingLabelSealedScannerOptions>,
  work: Readonly<{ bytes: number; sha256: string }>,
): Readonly<FloodgateV7DeploymentTeacherSealedScanV3KeyRequest> {
  return Object.freeze({
    runId: options.runId,
    keyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding: runBinding as Readonly<FloodgateV7DeploymentTeacherRunBinding>,
    stageAuthorizationReceipt,
    gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
    work,
  });
}

function sealedScannerLeaseView(
  transaction: Readonly<CapturedSealedScannerTransaction>,
): Readonly<FloodgateTeacherStageLease> {
  return Object.freeze({
    receipt: transaction.authorizationReceipt,
    stageRoot: transaction.stageRoot,
    destinationRoot: transaction.destinationRoot,
    close: () =>
      Promise.reject(
        new Error("sealed scanner owns the publication transaction"),
      ),
  });
}

function captureSealedScannerInputs(
  transaction: Readonly<CapturedSealedScannerTransaction>,
  trainingValue: AuthenticatedFloodgateTrainingRows,
  runBindingValue: FloodgateV7TeacherCheckpointRunBinding,
  options: Readonly<FloodgateV7TrainingLabelSealedScannerOptions>,
  effectiveUserId: number,
  dependencies: Readonly<CapturedSealedScannerDependencies>,
): Readonly<CapturedSealedScannerInputs> {
  const training = captureTraining(trainingValue);
  if (
    training.parents.length !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS
  ) {
    failure("sealed scanner requires exactly 24000 training parents");
  }
  return Object.freeze({
    lease: sealedScannerLeaseView(transaction),
    training,
    runBinding: captureRunBinding(runBindingValue),
    runId: options.runId,
    keyId: options.keyId,
    effectiveUserId,
    dependencies,
  });
}

function completeSealedScannerInvocation(
  inputs: Readonly<CapturedSealedScannerInputs>,
  key: Buffer,
): Readonly<CapturedV3Invocation> {
  try {
    return Object.freeze({
      lease: inputs.lease,
      training: inputs.training,
      runBinding: inputs.runBinding,
      producerController: Object.freeze({
        produce: () =>
          Promise.reject(new Error("sealed scanner cannot produce parents")),
        abortAndDrain: async () => undefined,
      }),
      runId: inputs.runId,
      keyId: inputs.keyId,
      keyMaterial: Object.freeze({ kind: "v3-derived" as const, bytes: key }),
      effectiveUserId: inputs.effectiveUserId,
      readForTests: inputs.dependencies.readForTests,
      closeForTests: inputs.dependencies.closeForTests,
      persistenceState: { mayHaveStarted: false },
      gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
    });
  } catch (cause) {
    zeroBytes(key);
    throw cause;
  }
}

async function scanSealedScannerUnkeyedPreflight(
  handle: fs.promises.FileHandle,
  inputs: Readonly<CapturedSealedScannerInputs>,
  expectedIdentity: Readonly<WorkFileIdentity>,
): Promise<Readonly<SealedScannerUnkeyedPreflight>> {
  const before = await handle.stat({ bigint: true });
  verifyV3WorkStat(before, inputs);
  verifyWorkIdentity(
    before,
    expectedIdentity,
    "sealed scanner unkeyed preflight held work",
  );
  const snapshot = captureWorkSnapshot(before);
  const fileBytes = Number(before.size);
  const buffer = Buffer.alloc(READ_CHUNK_BYTES);
  const digest = createHash("sha256");
  let position = 0;
  while (position < fileBytes) {
    const length = Math.min(READ_CHUNK_BYTES, fileBytes - position);
    let readCalled = false;
    let actualBytesRead: number | undefined;
    const read = async (requestedBytes = length): Promise<number> => {
      if (readCalled) {
        failure("sealed scanner unkeyed preflight read was called twice");
      }
      if (
        !Number.isSafeInteger(requestedBytes) ||
        requestedBytes < 1 ||
        requestedBytes > length
      ) {
        failure("sealed scanner unkeyed preflight read bound is invalid");
      }
      readCalled = true;
      const result = await handle.read(buffer, 0, requestedBytes, position);
      actualBytesRead = result.bytesRead;
      return result.bytesRead;
    };
    const bytesRead =
      inputs.dependencies.readForTests === undefined
        ? await read()
        : await inputs.dependencies.readForTests(
            Object.freeze({
              purpose: "unkeyed-preflight" as const,
              length,
              position,
            }),
            read,
          );
    if (!readCalled || bytesRead !== actualBytesRead) {
      failure(
        "sealed scanner unkeyed preflight hook did not report the native read",
      );
    }
    if (
      !Number.isSafeInteger(bytesRead) ||
      bytesRead < 1 ||
      bytesRead > length
    ) {
      failure("sealed scanner unkeyed preflight read returned invalid bytes");
    }
    digest.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  verifyV3WorkSnapshot(
    after,
    snapshot,
    inputs,
    "sealed scanner work mutated during unkeyed preflight",
  );
  return Object.freeze({
    fileBytes,
    fileSha256: digest.digest("hex"),
    snapshot: captureWorkSnapshot(after),
  });
}

function sameWorkFileSnapshot(
  left: Readonly<WorkFileSnapshot>,
  right: Readonly<WorkFileSnapshot>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function sameSealedScan(
  left: Readonly<V3WorkFileScanResult>,
  right: Readonly<V3WorkFileScanResult>,
): boolean {
  return (
    left.completeRecords === right.completeRecords &&
    left.completedParents === right.completedParents &&
    left.previousMac === right.previousMac &&
    left.milestone100Mac === right.milestone100Mac &&
    left.milestone500Mac === right.milestone500Mac &&
    left.sealed === right.sealed &&
    left.authenticatedBytes === right.authenticatedBytes &&
    left.tornTail === right.tornTail &&
    left.fileBytes === right.fileBytes &&
    left.fileSha256 === right.fileSha256 &&
    sameWorkFileSnapshot(left.snapshot, right.snapshot)
  );
}

function sealedScannerSnapshotReceipt(
  value: Readonly<WorkFileSnapshot>,
): FloodgateV7TrainingLabelSealedScannerReceipt["work"]["snapshot"] {
  return Object.freeze({
    dev: value.dev.toString(10),
    ino: value.ino.toString(10),
    mode: value.mode.toString(10),
    nlink: value.nlink.toString(10),
    uid: value.uid.toString(10),
    size: value.size.toString(10),
    mtime_ns: value.mtimeNs.toString(10),
    ctime_ns: value.ctimeNs.toString(10),
  });
}

function buildSealedScannerReceipt(
  boundary: SealedScannerBoundary,
  invocation: Readonly<CapturedV3Invocation>,
  scan: Readonly<V3WorkFileScanResult>,
): Readonly<FloodgateV7TrainingLabelSealedScannerReceipt> {
  const stage = invocation.lease.receipt;
  return Object.freeze({
    contract: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_RECEIPT_STATUS,
    claim_boundary: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CLAIM_BOUNDARY,
    execution_boundary: boundary,
    run_id: invocation.runId,
    key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    teacher_run_binding_sha256: sha256Hex(canonicalJson(invocation.runBinding)),
    training: Object.freeze({
      binding: invocation.training.binding,
      binding_sha256: sha256Hex(canonicalJson(invocation.training.binding)),
      parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      parent_ids_sha256: invocation.training.parentIdsSha256,
      canonical_parents_sha256: invocation.training.canonicalParentsSha256,
    }),
    stage: Object.freeze({
      parent_dev: stage.parent_identity.dev.toString(10),
      parent_ino: stage.parent_identity.ino.toString(10),
      stage_dev: stage.stage_identity.dev.toString(10),
      stage_ino: stage.stage_identity.ino.toString(10),
      stage_basename: stage.stage_basename,
      destination_basename: stage.destination_basename,
    }),
    work: Object.freeze({
      filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      bytes: scan.fileBytes,
      sha256: scan.fileSha256,
      snapshot: sealedScannerSnapshotReceipt(scan.snapshot),
    }),
    verification: Object.freeze({
      unkeyed_preflight_full_file: true as const,
      unkeyed_preflight_matches_expected_work: true as const,
      key_prepared_from_same_held_preflight: true as const,
      first_pass_without_sink: true as const,
      second_pass_sink_awaited_with_backpressure: true as const,
      same_held_work_descriptor: true as const,
      same_full_work_snapshot: true as const,
      exact_sealed_records: 24_004 as const,
      exact_completed_parents: 24_000 as const,
      no_unauthenticated_tail: true as const,
      held_and_named_stage_and_work_confirmed_after_second_pass: true as const,
    }),
  });
}

async function sealedScannerFailpoint(
  dependencies: Readonly<CapturedSealedScannerDependencies>,
  phase: FloodgateV7TrainingLabelSealedScannerFailpointPhase,
): Promise<void> {
  await dependencies.failpointForTests?.(phase);
}

function exactSealedScannerEntries(
  entries: readonly string[],
  requireComplete: boolean,
): readonly string[] {
  const sorted = [...entries].sort(compareUtf8);
  const state = sealedStagePrefixState(sorted);
  if (
    state === undefined ||
    (requireComplete &&
      state !==
        V3_SEALED_STAGE_PREFIX_STATES[V3_SEALED_STAGE_PREFIX_STATES.length - 1])
  ) {
    failure(
      requireComplete
        ? "terminal sealed scanner requires exact WTRM stage state"
        : "sealed scanner stage is not one exact W, WT, WTR, or WTRM state",
    );
  }
  return Object.freeze(sorted);
}

async function confirmSealedScannerSource(
  invocation: Readonly<Pick<CapturedInvocation, "effectiveUserId" | "lease">>,
  stageHandle: fs.promises.FileHandle,
  workHandle: fs.promises.FileHandle,
  workPath: string,
  expected: Readonly<{ snapshot: WorkFileSnapshot }>,
  expectedEntries: readonly string[] | undefined,
  requireComplete: boolean,
): Promise<readonly string[]> {
  verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
  await verifyStagePath(invocation);
  const entries = exactSealedScannerEntries(
    await fs.promises.readdir(invocation.lease.stageRoot),
    requireComplete,
  );
  if (
    expectedEntries !== undefined &&
    !exactStringList(entries, expectedEntries)
  ) {
    failure("sealed scanner stage entry set changed during a held scan");
  }
  await verifyV3WorkPathSnapshot(workPath, expected.snapshot, invocation);
  verifyV3WorkSnapshot(
    await workHandle.stat({ bigint: true }),
    expected.snapshot,
    invocation,
    "sealed scanner held work changed after scan",
  );
  verifyStageStat(await stageHandle.stat({ bigint: true }), invocation);
  await verifyStagePath(invocation);
  return entries;
}

function assertExactSealedScannerResult(
  result: Readonly<V3WorkFileScanResult>,
): void {
  assertV3ExactGateFinal(
    result,
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  );
  if (
    result.completeRecords !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 4 ||
    result.completedParents !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    !result.sealed ||
    result.tornTail ||
    result.authenticatedBytes !== result.fileBytes
  ) {
    failure("sealed scanner did not reach exact terminal stream success");
  }
}

async function closeSealedScannerHandle(
  kind: "work" | "stage",
  handle: fs.promises.FileHandle,
  dependencies: Readonly<CapturedSealedScannerDependencies>,
): Promise<void> {
  const close = handle.close.bind(handle);
  if (dependencies.closeForTests === undefined) await close();
  else await dependencies.closeForTests(kind, close);
}

function zeroSealedScannerKey(
  invocation: Readonly<CapturedV3Invocation>,
): void {
  zeroBytes(invocation.keyMaterial.bytes);
}

function appendSealedScannerCleanupFailure(
  failures: unknown[],
  cause: unknown,
): void {
  objectDefineProperty(failures, String(failures.length), {
    configurable: true,
    enumerable: true,
    value: cause,
    writable: true,
  });
}

async function cleanupSealedScannerResources(
  transaction: Readonly<CapturedSealedScannerTransaction>,
  invocation: Readonly<CapturedV3Invocation> | undefined,
  workHandle: fs.promises.FileHandle | undefined,
  stageHandle: fs.promises.FileHandle | undefined,
  dependencies: Readonly<CapturedSealedScannerDependencies>,
  abortTransaction: boolean,
): Promise<readonly unknown[]> {
  const failures: unknown[] = [];
  if (invocation !== undefined) {
    try {
      zeroSealedScannerKey(invocation);
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  if (workHandle !== undefined) {
    try {
      await closeSealedScannerHandle("work", workHandle, dependencies);
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  if (stageHandle !== undefined) {
    try {
      await closeSealedScannerHandle("stage", stageHandle, dependencies);
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  if (abortTransaction) {
    try {
      await transaction.abort();
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  return Object.freeze(failures);
}

function scannerFacade(
  boundary: SealedScannerBoundary,
): Readonly<FloodgateV7TrainingLabelSealedScanner> {
  return frozen({
    contract: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_STATUS,
    claim_boundary: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_CLAIM_BOUNDARY,
    execution_boundary: boundary,
  });
}

function terminalFacade(): Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt> {
  return frozen({
    contract: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_TERMINAL_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_SEALED_SCANNER_TERMINAL_STATUS,
  });
}

function lookupSealedScanner(
  registry: Readonly<SealedScannerRegistry>,
  otherRegistry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): SealedScannerState {
  if (scanner === null || typeof scanner !== "object" || nodeIsProxy(scanner)) {
    failure("sealed scanner requires an exact opaque facade");
  }
  const state = registry.available.get(scanner);
  if (state !== undefined) return state;
  if (otherRegistry.known.has(scanner)) {
    failure("sealed scanner belongs to the other execution boundary");
  }
  if (registry.known.has(scanner)) {
    failure("sealed scanner was already consumed or discarded");
  }
  failure("sealed scanner facade is cloned or foreign");
}

function closeSealedScannerState(
  registry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  state: SealedScannerState,
): void {
  registry.available.delete(scanner);
  if (state.terminalReceipt !== undefined) {
    registry.terminals.delete(state.terminalReceipt);
  }
  state.phase = "closed";
}

function throwSealedScannerCleanupIndeterminate(
  state: Readonly<SealedScannerState>,
): never {
  if (state.cleanupFailure !== undefined) throw state.cleanupFailure;
  failure("sealed scanner cleanup is indeterminate");
}

function rememberSealedScannerCleanupIndeterminate(
  registry: Readonly<SealedScannerRegistry>,
  state: SealedScannerState,
  primary: unknown,
  cleanupFailures: readonly unknown[],
  message: string,
): AggregateError {
  const remembered = new AggregateError([primary, ...cleanupFailures], message);
  if (state.terminalReceipt !== undefined) {
    registry.terminals.delete(state.terminalReceipt);
  }
  state.cleanupFailure = remembered;
  state.phase = "cleanup-indeterminate";
  state.busy = false;
  return remembered;
}

async function cleanupRegisteredSealedScannerState(
  state: SealedScannerState,
): Promise<readonly unknown[]> {
  const failures: unknown[] = [];
  if (!state.keyZeroized) {
    try {
      zeroSealedScannerKey(state.invocation);
      state.keyZeroized = true;
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  if (!state.workClosed) {
    try {
      await closeSealedScannerHandle(
        "work",
        state.workHandle,
        state.dependencies,
      );
      state.workClosed = true;
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  if (!state.stageClosed) {
    try {
      await closeSealedScannerHandle(
        "stage",
        state.stageHandle,
        state.dependencies,
      );
      state.stageClosed = true;
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  if (!state.transactionSettled) {
    try {
      await state.transaction.abort();
      state.transactionSettled = true;
    } catch (cause) {
      appendSealedScannerCleanupFailure(failures, cause);
    }
  }
  return Object.freeze(failures);
}

type SealedScannerTrainingClaim = (
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
) => void;

async function rejectAfterSealedScannerCaptureFailure(
  primary: unknown,
  transaction:
    Readonly<FloodgateTeacherStagePublicationTransaction> | undefined,
): Promise<never> {
  const cleanupFailures: unknown[] = [];
  if (transaction !== undefined) {
    try {
      await transaction.abort();
    } catch (cause) {
      appendSealedScannerCleanupFailure(cleanupFailures, cause);
    }
  }
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      [primary, ...cleanupFailures],
      "sealed scanner capture and cleanup both failed",
    );
  }
  throw primary;
}

async function initializeSealedScanner<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
>(
  registry: Readonly<SealedScannerRegistry>,
  transaction: Readonly<CapturedSealedScannerTransaction>,
  inputs: Readonly<CapturedSealedScannerInputs>,
  options: Readonly<FloodgateV7TrainingLabelSealedScannerOptions>,
  sink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
  dependencies: Readonly<CapturedSealedScannerDependencies>,
  keyAuthority: Readonly<CapturedSealedScannerKeyAuthority<TBoundary>>,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerOpenResult>> {
  let stageHandle: fs.promises.FileHandle | undefined;
  let workHandle: fs.promises.FileHandle | undefined;
  let authorization:
    | Readonly<
        FloodgateV7DeploymentTeacherSealedScanV3KeyAuthorization<TBoundary>
      >
    | undefined;
  let key: Buffer | undefined;
  let invocation: Readonly<CapturedV3Invocation> | undefined;
  let primary: unknown;
  try {
    stageHandle = await fs.promises.open(
      transaction.stageRoot,
      fs.constants.O_RDONLY |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    verifyStageStat(await stageHandle.stat({ bigint: true }), inputs);
    await verifyStagePath(inputs);
    const initialEntries = exactSealedScannerEntries(
      await fs.promises.readdir(transaction.stageRoot),
      false,
    );
    const workPath = `${transaction.stageRoot}/${FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME}`;
    workHandle = await fs.promises.open(
      workPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const workStat = await workHandle.stat({ bigint: true });
    verifyV3WorkStat(workStat, inputs);
    const workIdentity = Object.freeze({
      dev: workStat.dev,
      ino: workStat.ino,
    });

    const preflight = await scanSealedScannerUnkeyedPreflight(
      workHandle,
      inputs,
      workIdentity,
    );
    if (
      preflight.fileBytes !== options.work.bytes ||
      preflight.fileSha256 !== options.work.sha256
    ) {
      failure(
        "sealed scanner unkeyed held-file preflight differs from expected work",
      );
    }
    await sealedScannerFailpoint(
      dependencies,
      "after-unkeyed-preflight-before-confirmation",
    );
    await confirmSealedScannerSource(
      inputs,
      stageHandle,
      workHandle,
      workPath,
      preflight,
      initialEntries,
      false,
    );
    await sealedScannerFailpoint(
      dependencies,
      "after-unkeyed-confirmation-before-key-prepare",
    );

    const request = sealedScannerKeyRequest(
      transaction.authorizationReceipt,
      inputs.runBinding,
      options,
      Object.freeze({
        bytes: preflight.fileBytes,
        sha256: preflight.fileSha256,
      }),
    );
    authorization = await keyAuthority.prepare(request);
    key = claimAndCopySealedScanKey(keyAuthority.claim, authorization, request);
    const ownerUid = requiredInteger(
      authorization.authorization.key_deployment.owner_uid,
      "sealed scanner key authorization owner uid",
    );
    discardFloodgateV7DeploymentTeacherSealedScanV3Key(authorization);
    authorization = undefined;
    if (ownerUid !== inputs.effectiveUserId) {
      failure(
        "sealed scanner unkeyed preflight owner differs from key authority owner",
      );
    }
    invocation = completeSealedScannerInvocation(inputs, key);
    key = undefined;
    if (dependencies.observeKeyForTests !== undefined) {
      const observed = dependencies.observeKeyForTests(
        invocation.keyMaterial.bytes,
      );
      if (observed !== undefined) {
        failure("sealed scanner key observer must return exactly undefined");
      }
    }
    await sealedScannerFailpoint(
      dependencies,
      "after-key-claimed-before-first-scan",
    );

    const first = await scanV3WorkHandle(
      workHandle,
      invocation,
      invocation.keyMaterial.bytes,
      "sealed-final",
      preflight.snapshot,
    );
    assertExactSealedScannerResult(first);
    if (
      first.fileBytes !== preflight.fileBytes ||
      first.fileSha256 !== preflight.fileSha256 ||
      !sameWorkFileSnapshot(first.snapshot, preflight.snapshot)
    ) {
      failure(
        "sealed scanner keyed pass one differs from its same-held unkeyed preflight",
      );
    }
    await sealedScannerFailpoint(
      dependencies,
      "after-first-scan-before-confirmation",
    );
    await confirmSealedScannerSource(
      invocation,
      stageHandle,
      workHandle,
      workPath,
      first,
      initialEntries,
      false,
    );
    await sealedScannerFailpoint(dependencies, "after-first-confirmation");

    verifyV3WorkSnapshot(
      await workHandle.stat({ bigint: true }),
      first.snapshot,
      invocation,
      "sealed scanner work changed between pass one and pass two",
    );
    const second = await scanV3WorkHandle(
      workHandle,
      invocation,
      invocation.keyMaterial.bytes,
      "sealed-final",
      preflight.snapshot,
      undefined,
      sink,
    );
    assertExactSealedScannerResult(second);
    await sealedScannerFailpoint(
      dependencies,
      "after-second-scan-before-confirmation",
    );
    if (!sameSealedScan(first, second)) {
      failure("sealed scanner pass two differs from its pinned pass one");
    }
    await confirmSealedScannerSource(
      invocation,
      stageHandle,
      workHandle,
      workPath,
      second,
      initialEntries,
      false,
    );
    await sealedScannerFailpoint(
      dependencies,
      "after-second-confirmation-before-registration",
    );
    if (transaction.value.phase !== "ready") {
      failure("sealed scanner publication transaction changed before mint");
    }
    const receipt = buildSealedScannerReceipt(
      registry.boundary,
      invocation,
      second,
    );
    const scanner = scannerFacade(registry.boundary);
    const state: SealedScannerState = {
      boundary: registry.boundary,
      invocation,
      transaction,
      dependencies,
      stageHandle,
      workHandle,
      workPath,
      initialEntries,
      pinned: second,
      receipt,
      phase: "ready",
      busy: false,
      keyZeroized: false,
      workClosed: false,
      stageClosed: false,
      transactionSettled: false,
    };
    registry.available.set(scanner, state);
    registry.known.add(scanner);
    return frozen({ scanner, receipt });
  } catch (cause) {
    primary = cause;
  }
  const preCleanupFailures: unknown[] = [];
  if (authorization !== undefined) {
    try {
      discardFloodgateV7DeploymentTeacherSealedScanV3Key(authorization);
    } catch (cause) {
      appendSealedScannerCleanupFailure(preCleanupFailures, cause);
    }
  }
  if (key !== undefined) {
    try {
      zeroBytes(key);
    } catch (cause) {
      appendSealedScannerCleanupFailure(preCleanupFailures, cause);
    }
  }
  const cleanupFailures = await cleanupSealedScannerResources(
    transaction,
    invocation,
    workHandle,
    stageHandle,
    dependencies,
    true,
  );
  if (preCleanupFailures.length > 0 || cleanupFailures.length > 0) {
    throw new AggregateError(
      [primary, ...preCleanupFailures, ...cleanupFailures],
      "sealed scanner initialization and cleanup both failed",
    );
  }
  throw primary;
}

function createSealedScanner<
  TBoundary extends FloodgateV7DeploymentKeyAuthorityExecutionBoundary,
>(
  lease: Readonly<FloodgateTeacherStageLease>,
  training: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  optionsValue: FloodgateV7TrainingLabelSealedScannerOptions,
  sinkValue: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
  dependenciesValue:
    FloodgateV7TrainingLabelSealedScannerDependenciesForTests | undefined,
  registry: Readonly<SealedScannerRegistry>,
  claimTraining: SealedScannerTrainingClaim,
  captureKeyAuthority: () => Readonly<
    CapturedSealedScannerKeyAuthority<TBoundary>
  >,
  beginPublication: () => Readonly<FloodgateTeacherStagePublicationTransaction>,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerOpenResult>> {
  let options: Readonly<FloodgateV7TrainingLabelSealedScannerOptions>;
  let dependencies: Readonly<CapturedSealedScannerDependencies>;
  let sink: FloodgateV7TeacherCheckpointV3VerifiedParentSink;
  let keyAuthority: Readonly<CapturedSealedScannerKeyAuthority<TBoundary>>;
  let rawTransaction:
    Readonly<FloodgateTeacherStagePublicationTransaction> | undefined;
  let transaction: Readonly<CapturedSealedScannerTransaction>;
  let inputs: Readonly<CapturedSealedScannerInputs>;
  try {
    // Capture every lease-independent argument before touching lease authority.
    options = captureSealedScannerOptions(optionsValue);
    dependencies = captureSealedScannerDependencies(dependenciesValue);
    sink = captureSealedScannerSink(sinkValue);
    keyAuthority = captureKeyAuthority();
    if (lease === null || typeof lease !== "object" || nodeIsProxy(lease)) {
      failure("sealed scanner lease must be an exact non-Proxy facade");
    }

    // A failed begin did not transfer authority, so it must remain untouched.
    // Once begin succeeds, every later capture failure aborts this transaction.
    rawTransaction = beginPublication();
    transaction = captureSealedScannerTransaction(rawTransaction);

    // Transfer the exact active lease before burning the fresh training-row
    // claim. Both operations and the complete input capture happen in this
    // non-async wrapper before the caller can regain control.
    claimTraining(training);
    inputs = captureSealedScannerInputs(
      transaction,
      training,
      runBinding,
      options,
      keyAuthority.effectiveUserId,
      dependencies,
    );
  } catch (cause) {
    return rejectAfterSealedScannerCaptureFailure(cause, rawTransaction);
  }
  return initializeSealedScanner(
    registry,
    transaction,
    inputs,
    options,
    sink,
    dependencies,
    keyAuthority,
  );
}

/**
 * Production two-pass scanner. The exact active lease is synchronously
 * transferred to a production publication transaction inside this boundary.
 */
export function createFloodgateV7TrainingLabelSealedScanner(
  lease: Readonly<FloodgateTeacherStageLease>,
  training: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  options: FloodgateV7TrainingLabelSealedScannerOptions,
  secondPassSink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerOpenResult>> {
  if (arguments.length !== 5) {
    return Promise.reject(
      new Error("production sealed scanner accepts exactly five arguments"),
    );
  }
  return createSealedScanner(
    lease,
    training,
    runBinding,
    options,
    secondPassSink,
    undefined,
    PRODUCTION_SEALED_SCANNERS,
    claimActiveVerifiedPinnedFloodgateTrainingRows,
    () => {
      if (nativeGetEffectiveUserId === null) {
        failure("production sealed scanner requires a POSIX effective uid");
      }
      return Object.freeze({
        effectiveUserId: requiredInteger(
          nativeGetEffectiveUserId(),
          "production sealed scanner effective uid",
        ),
        prepare: prepareFloodgateV7DeploymentTeacherSealedScanV3Key,
        claim: claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKey,
      });
    },
    () => beginFloodgateTeacherStagePublication(lease),
  );
}

/** Test-only mirror with isolated row, key, scanner, and publication claims. */
export function createFloodgateV7TrainingLabelSealedScannerCoreForTests(
  lease: Readonly<FloodgateTeacherStageLease>,
  training: AuthenticatedFloodgateTrainingRows,
  runBinding: FloodgateV7TeacherCheckpointRunBinding,
  options: FloodgateV7TrainingLabelSealedScannerOptions,
  secondPassSink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
  dependencies: FloodgateV7TrainingLabelSealedScannerDependenciesForTests,
  keyAuthorityDependencies: FloodgateV7DeploymentKeyAuthorityDependencies,
  publicationDependencies: FloodgateTeacherStagePublicationDependencies,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerOpenResult>> {
  if (arguments.length !== 8) {
    return Promise.reject(
      new Error("test sealed scanner accepts exactly eight arguments"),
    );
  }
  return createSealedScanner(
    lease,
    training,
    runBinding,
    options,
    secondPassSink,
    dependencies,
    TEST_SEALED_SCANNERS,
    claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
    () => {
      const captured = captureSealedScannerKeyAuthorityDependencies(
        keyAuthorityDependencies,
      );
      return Object.freeze({
        effectiveUserId: captured.effectiveUserId,
        prepare: (
          request: FloodgateV7DeploymentTeacherSealedScanV3KeyRequest,
        ) =>
          prepareFloodgateV7DeploymentTeacherSealedScanV3KeyCoreForTests(
            request,
            captured,
          ),
        claim:
          claimFloodgateV7DeploymentTeacherSealedScanV3DerivedKeyCoreForTests,
      });
    },
    () =>
      beginFloodgateTeacherStagePublicationCoreForTests(
        lease,
        publicationDependencies,
      ),
  );
}

function publicationContext(
  registry: Readonly<SealedScannerRegistry>,
  otherRegistry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Readonly<FloodgateV7TrainingLabelSealedScannerPublicationContext> {
  const state = lookupSealedScanner(registry, otherRegistry, scanner);
  if (state.phase === "cleanup-indeterminate") {
    throwSealedScannerCleanupIndeterminate(state);
  }
  if (state.phase !== "ready" && state.phase !== "terminal") {
    failure("sealed scanner publication context is no longer available");
  }
  return frozen({
    authorizationReceipt: state.transaction.authorizationReceipt,
    stageRoot: state.transaction.stageRoot,
    destinationRoot: state.transaction.destinationRoot,
  });
}

export function getFloodgateV7TrainingLabelSealedScannerPublicationContext(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Readonly<FloodgateV7TrainingLabelSealedScannerPublicationContext> {
  if (arguments.length !== 1) {
    failure("production scanner publication context accepts one argument");
  }
  return publicationContext(
    PRODUCTION_SEALED_SCANNERS,
    TEST_SEALED_SCANNERS,
    scanner,
  );
}

export function getFloodgateV7TrainingLabelSealedScannerPublicationContextCoreForTests(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Readonly<FloodgateV7TrainingLabelSealedScannerPublicationContext> {
  if (arguments.length !== 1) {
    failure("test scanner publication context accepts one argument");
  }
  return publicationContext(
    TEST_SEALED_SCANNERS,
    PRODUCTION_SEALED_SCANNERS,
    scanner,
  );
}

async function replaySealedScannerState(
  state: SealedScannerState,
  sink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerReceipt>> {
  state.busy = true;
  try {
    if (state.phase !== "ready" || state.transaction.value.phase !== "ready") {
      failure("sealed scanner is not replayable");
    }
    await sealedScannerFailpoint(state.dependencies, "before-replay");
    const entries = await confirmSealedScannerSource(
      state.invocation,
      state.stageHandle,
      state.workHandle,
      state.workPath,
      state.pinned,
      undefined,
      false,
    );
    const replayed = await scanV3WorkHandle(
      state.workHandle,
      state.invocation,
      state.invocation.keyMaterial.bytes,
      "sealed-final",
      state.pinned.snapshot,
      undefined,
      sink,
    );
    assertExactSealedScannerResult(replayed);
    await sealedScannerFailpoint(
      state.dependencies,
      "after-replay-scan-before-confirmation",
    );
    if (!sameSealedScan(state.pinned, replayed)) {
      failure("sealed scanner replay differs from the pinned two-pass scan");
    }
    await confirmSealedScannerSource(
      state.invocation,
      state.stageHandle,
      state.workHandle,
      state.workPath,
      state.pinned,
      entries,
      false,
    );
    return state.receipt;
  } finally {
    state.busy = false;
  }
}

function replaySealedScanner(
  registry: Readonly<SealedScannerRegistry>,
  otherRegistry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  sinkValue: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerReceipt>> {
  try {
    const state = lookupSealedScanner(registry, otherRegistry, scanner);
    if (state.phase === "cleanup-indeterminate") {
      throwSealedScannerCleanupIndeterminate(state);
    }
    if (state.busy || state.phase !== "ready") {
      return Promise.reject(
        new Error("sealed scanner replay is already active"),
      );
    }
    const sink = captureSealedScannerSink(sinkValue);
    return replaySealedScannerState(state, sink);
  } catch (cause) {
    return Promise.reject(cause);
  }
}

export function replayFloodgateV7TrainingLabelSealedScanner(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  sink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerReceipt>> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new Error("production sealed scanner replay accepts two arguments"),
    );
  }
  return replaySealedScanner(
    PRODUCTION_SEALED_SCANNERS,
    TEST_SEALED_SCANNERS,
    scanner,
    sink,
  );
}

export function replayFloodgateV7TrainingLabelSealedScannerCoreForTests(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  sink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerReceipt>> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new Error("test sealed scanner replay accepts two arguments"),
    );
  }
  return replaySealedScanner(
    TEST_SEALED_SCANNERS,
    PRODUCTION_SEALED_SCANNERS,
    scanner,
    sink,
  );
}

async function terminallyReverifySealedScannerState(
  registry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  state: SealedScannerState,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>> {
  state.busy = true;
  let primary: unknown;
  try {
    if (state.phase !== "ready" || state.transaction.value.phase !== "ready") {
      failure("sealed scanner is not ready for terminal reverification");
    }
    await sealedScannerFailpoint(
      state.dependencies,
      "before-terminal-reverification",
    );
    const entries = await confirmSealedScannerSource(
      state.invocation,
      state.stageHandle,
      state.workHandle,
      state.workPath,
      state.pinned,
      undefined,
      true,
    );
    const terminal = await scanV3WorkHandle(
      state.workHandle,
      state.invocation,
      state.invocation.keyMaterial.bytes,
      "sealed-final",
      state.pinned.snapshot,
    );
    assertExactSealedScannerResult(terminal);
    await sealedScannerFailpoint(
      state.dependencies,
      "after-terminal-scan-before-confirmation",
    );
    if (!sameSealedScan(state.pinned, terminal)) {
      failure("terminal sealed scanner reverify differs from pinned work");
    }
    await confirmSealedScannerSource(
      state.invocation,
      state.stageHandle,
      state.workHandle,
      state.workPath,
      state.pinned,
      entries,
      true,
    );

    // Secret lifetime must not depend on descriptor close or failpoint
    // settlement. Zero the owned scan key synchronously before either await.
    zeroSealedScannerKey(state.invocation);
    state.keyZeroized = true;
    await sealedScannerFailpoint(
      state.dependencies,
      "after-terminal-key-zeroized",
    );
    await closeSealedScannerHandle(
      "work",
      state.workHandle,
      state.dependencies,
    );
    state.workClosed = true;
    await closeSealedScannerHandle(
      "stage",
      state.stageHandle,
      state.dependencies,
    );
    state.stageClosed = true;
    state.phase = "terminal";
    const terminalReceipt = terminalFacade();
    state.terminalReceipt = terminalReceipt;
    registry.terminals.set(terminalReceipt, state);
    state.busy = false;
    return terminalReceipt;
  } catch (cause) {
    primary = cause;
  }
  const cleanupFailures = await cleanupRegisteredSealedScannerState(state);
  state.busy = false;
  if (cleanupFailures.length > 0) {
    throw rememberSealedScannerCleanupIndeterminate(
      registry,
      state,
      primary,
      cleanupFailures,
      "terminal sealed scanner reverify and cleanup both failed",
    );
  }
  closeSealedScannerState(registry, scanner, state);
  throw primary;
}

function terminallyReverifySealedScanner(
  registry: Readonly<SealedScannerRegistry>,
  otherRegistry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>> {
  try {
    const state = lookupSealedScanner(registry, otherRegistry, scanner);
    if (state.phase === "cleanup-indeterminate") {
      throwSealedScannerCleanupIndeterminate(state);
    }
    if (state.busy || state.phase !== "ready") {
      return Promise.reject(
        new Error("sealed scanner terminal reverify is already active"),
      );
    }
    return terminallyReverifySealedScannerState(registry, scanner, state);
  } catch (cause) {
    return Promise.reject(cause);
  }
}

export function terminallyReverifyFloodgateV7TrainingLabelSealedScanner(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new Error("production terminal sealed scanner accepts one argument"),
    );
  }
  return terminallyReverifySealedScanner(
    PRODUCTION_SEALED_SCANNERS,
    TEST_SEALED_SCANNERS,
    scanner,
  );
}

export function terminallyReverifyFloodgateV7TrainingLabelSealedScannerCoreForTests(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new Error("test terminal sealed scanner accepts one argument"),
    );
  }
  return terminallyReverifySealedScanner(
    TEST_SEALED_SCANNERS,
    PRODUCTION_SEALED_SCANNERS,
    scanner,
  );
}

async function commitSealedScannerPublication(
  registry: Readonly<SealedScannerRegistry>,
  otherRegistry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  terminalReceipt: Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>,
): Promise<Readonly<FloodgateTeacherStagePublicationReceipt>> {
  const state = lookupSealedScanner(registry, otherRegistry, scanner);
  if (state.phase === "cleanup-indeterminate") {
    throwSealedScannerCleanupIndeterminate(state);
  }
  if (
    state.busy ||
    state.phase !== "terminal" ||
    state.terminalReceipt !== terminalReceipt ||
    registry.terminals.get(terminalReceipt) !== state ||
    state.transaction.value.phase !== "ready"
  ) {
    failure("sealed scanner terminal publication authority differs");
  }
  state.phase = "committing";
  registry.terminals.delete(terminalReceipt);
  try {
    const receipt = await state.transaction.commit();
    state.transactionSettled = true;
    closeSealedScannerState(registry, scanner, state);
    return receipt;
  } catch (cause) {
    throw rememberSealedScannerCleanupIndeterminate(
      registry,
      state,
      cause,
      [],
      "sealed scanner publication became indeterminate",
    );
  }
}

export function commitFloodgateV7TrainingLabelSealedScannerPublication(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  terminalReceipt: Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>,
): Promise<Readonly<FloodgateTeacherStagePublicationReceipt>> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new Error("production sealed scanner commit accepts two arguments"),
    );
  }
  return commitSealedScannerPublication(
    PRODUCTION_SEALED_SCANNERS,
    TEST_SEALED_SCANNERS,
    scanner,
    terminalReceipt,
  );
}

export function commitFloodgateV7TrainingLabelSealedScannerPublicationCoreForTests(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
  terminalReceipt: Readonly<FloodgateV7TrainingLabelSealedScannerTerminalReceipt>,
): Promise<Readonly<FloodgateTeacherStagePublicationReceipt>> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new Error("test sealed scanner commit accepts two arguments"),
    );
  }
  return commitSealedScannerPublication(
    TEST_SEALED_SCANNERS,
    PRODUCTION_SEALED_SCANNERS,
    scanner,
    terminalReceipt,
  );
}

async function discardSealedScanner(
  registry: Readonly<SealedScannerRegistry>,
  otherRegistry: Readonly<SealedScannerRegistry>,
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Promise<void> {
  if (scanner === null || typeof scanner !== "object" || nodeIsProxy(scanner)) {
    failure("sealed scanner discard requires an exact opaque facade");
  }
  const state = registry.available.get(scanner);
  if (state === undefined) {
    if (otherRegistry.known.has(scanner)) {
      failure("sealed scanner belongs to the other execution boundary");
    }
    if (registry.known.has(scanner)) return;
    failure("sealed scanner discard facade is cloned or foreign");
  }
  if (state.phase === "cleanup-indeterminate") {
    throwSealedScannerCleanupIndeterminate(state);
  }
  if (state.busy || state.phase === "committing") {
    failure("sealed scanner cannot be discarded during an active operation");
  }
  state.busy = true;
  state.phase = "cleaning";
  const cleanupFailures = await cleanupRegisteredSealedScannerState(state);
  state.busy = false;
  if (cleanupFailures.length > 0) {
    throw rememberSealedScannerCleanupIndeterminate(
      registry,
      state,
      new Error("sealed scanner discard cleanup failed"),
      cleanupFailures,
      "sealed scanner discard cleanup failed",
    );
  }
  closeSealedScannerState(registry, scanner, state);
}

export function discardFloodgateV7TrainingLabelSealedScanner(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Promise<void> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new Error("production sealed scanner discard accepts one argument"),
    );
  }
  return discardSealedScanner(
    PRODUCTION_SEALED_SCANNERS,
    TEST_SEALED_SCANNERS,
    scanner,
  );
}

export function discardFloodgateV7TrainingLabelSealedScannerCoreForTests(
  scanner: Readonly<FloodgateV7TrainingLabelSealedScanner>,
): Promise<void> {
  if (arguments.length !== 1) {
    return Promise.reject(
      new Error("test sealed scanner discard accepts one argument"),
    );
  }
  return discardSealedScanner(
    TEST_SEALED_SCANNERS,
    PRODUCTION_SEALED_SCANNERS,
    scanner,
  );
}
