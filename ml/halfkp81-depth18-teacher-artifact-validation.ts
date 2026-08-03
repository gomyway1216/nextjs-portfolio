import { createHash, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  SIBLING_TEACHER_LABEL_POLICY,
  validateWorkEntry,
  type CompletedWorkEntry,
} from "./generate-sibling-teacher";
import {
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_QUIESCENCE_DEPTH,
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_WASM_BYTES,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  FLOODGATE_STABLE_WEIGHTS_BYTES,
  FLOODGATE_STABLE_WEIGHTS_SHA256,
  FLOODGATE_STABLE_WASM_SHA256,
  FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
  FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
  FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
} from "./floodgate-stable-wasm-proposer";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS,
  type FloodgateProductionStableWasmRuntimeResult,
} from "./floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_QUEUE_BOUND_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_RUNTIME_CONTRACT_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_WORKERS_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SHA256_V3,
  getFloodgateBoundedStableWasmRuntimeReceiptDigestV3,
  validateFloodgateBoundedStableWasmOutcomeV3,
  type FloodgateBoundedStableWasmOutcomeV3,
  type FloodgateBoundedStableWasmRuntimeReceiptV3,
} from "./floodgate-bounded-stable-wasm-runtime-v3";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
} from "./floodgate-production-teacher-asset-authority";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { positionKeyFromSfen, type SiblingRecord } from "./sibling-data";
import { USI_RESET_FOR_PARENT_TIMEOUT_MS } from "./usi-engine";
export const HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-work-v1" as const;
export const HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-plan-v2" as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA =
  "shogi-halfkp81-hard-depth18-bounded-stable-teacher-plan-v3" as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2 =
  "shogi-halfkp81-hard-depth18-bounded-stable-teacher-plan-v3r2" as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3 =
  "shogi-halfkp81-hard-depth18-bounded-stable-teacher-plan-v3r3" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r2" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r3" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r4" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r5" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r6" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r9" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r2" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r3" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r4" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r5" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r6" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r9" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11 =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11" as const;
export const HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-receipt-v1" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11 =
  "shogi-halfkp81-hard-depth18-teacher-receipt-v1r11" as const;
export const HALFKP81_DEPTH18_VERIFIED_ARTIFACT_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-verified-artifact-receipt-v1" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_VERIFIED_ARTIFACT_RECEIPT_SCHEMA_V1R11 =
  "shogi-halfkp81-hard-depth18-teacher-verified-artifact-receipt-v1r11" as const;
const HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11" as const;
const HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11" as const;
const HALFKP81_V1R11_PREFORMAL_LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11" as const;
const HALFKP81_V1R11_PREFORMAL_RAW_AUTHORITY_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11" as const;
const HALFKP81_V1R11_POWER_LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-power-continuity-ledger-v1r11" as const;
const HALFKP81_V1R11_POWER_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-power-continuity-receipt-v1r11" as const;
const HALFKP81_V1R11_ENVIRONMENT_FAULT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-environment-terminal-fault-v1r11" as const;
const HALFKP81_V1R11_ENVIRONMENT_FAULT_INTENT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-environment-fault-intent-v1r11" as const;
const HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11" as const;
const HALFKP81_V1R11_POWER_ENTRY_DOMAIN =
  "shogi-halfkp81-depth18-power-continuity-entry-v1r11\0" as const;
const HALFKP81_V1R11_LAUNCHAGENT_FIELDS = Object.freeze([
  "schema",
  "status",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "observed_at_utc",
  "uid",
  "xpc_service_name",
  "label",
  "runner_pid",
  "working_directory",
  "stdout_path",
  "stderr_path",
  "program_arguments",
  "runner_utility_argv",
  "caffeinate_holder",
  "required_assertions",
  "launchctl_command",
  "launchctl_exit_code",
  "launchctl_print",
  "launchctl_stderr",
  "plist_source",
  "plist_snapshot",
  "ps_command",
  "ps_exit_code",
  "ps_stdout",
  "ps_stderr",
  "runner_process",
  "assertion_holder_process",
  "observed_process_group_rows",
  "observed_yaneuraou_engine_rows",
  "producer",
] as const);
const HALFKP81_V1R11_PREFORMAL_VERIFIED_FIELDS = Object.freeze([
  "schema",
  "status",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "required_order",
  "ledger",
  "raw_receipt",
  "gates",
  "launchagent_authority",
  "verifier",
  "authority",
] as const);
const HALFKP81_V1R11_WORK_HEADER_FIELDS = Object.freeze([
  "schema",
  "status",
  "record_kind",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "launchagent_authority_evidence",
  "preformal_authority_verified_receipt",
  "power_admission_entry",
  "opened_at_utc",
] as const);
const HALFKP81_V1R11_POWER_ENTRY_FIELDS = Object.freeze([
  "schema",
  "status",
  "entry_kind",
  "timestamp_utc",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "launchagent_authority_evidence",
  "preformal_authority_verified_receipt",
  "observation",
  "environment_fault",
  "previous_entry_sha256",
  "entry_sha256",
] as const);
const HALFKP81_V1R11_POWER_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "status",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "power_ledger",
  "admission_entry",
  "final_entry",
  "launchagent_authority_evidence",
  "preformal_authority_verified_receipt",
  "pmset_start_anchor",
  "pmset_end_anchor",
  "environment_fault_preimage_sha256",
  "producer",
] as const);
const HALFKP81_V1R11_RAW_TEACHER_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "status",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "teacher_work",
  "teacher_output",
  "preformal_authority_ledger",
  "preformal_authority_raw_receipt",
  "preformal_authority_verified_receipt",
  "launchagent_authority_evidence",
  "power_continuity_ledger",
  "power_continuity_receipt",
  "finalizer",
  "authority",
] as const);
const HALFKP81_V1R11_VERIFIED_ARTIFACT_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "status",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "raw_teacher_receipt",
  "teacher_work",
  "teacher_output",
  "preformal_authority_ledger",
  "preformal_authority_raw_receipt",
  "preformal_authority_verified_receipt",
  "launchagent_authority_evidence",
  "power_continuity_ledger",
  "power_continuity_receipt",
  "verifier",
  "authority",
] as const);
const HALFKP81_V1R11_ENVIRONMENT_FAULT_FIELDS = Object.freeze([
  "schema",
  "status",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "preformal_authority_verified_receipt",
  "launchagent_authority_evidence",
  "power_continuity_ledger",
  "power_continuity_receipt",
  "fault_preimage_sha256",
  "fault",
  "process_cleanup_evidence",
  "process_cleanup",
  "faulted_at_utc",
  "authority",
] as const);
export const HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA =
  "halfkp81-depth18-hard-parent-v2" as const;
export const HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA =
  "halfkp81-depth18-hard-parent-selection-manifest-v2" as const;
export const HALFKP81_DEPTH18_DATASET_SCHEMA =
  "canonical-shogi-sibling-v1-jsonl-one-lf-per-row" as const;
export const HALFKP81_DEPTH18_RUN_FINGERPRINT_DOMAIN =
  "shogi-halfkp81-hard-depth18-teacher-run-v1\0" as const;
export const HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN =
  "shogi-halfkp81-hard-depth18-teacher-work-entry-v1\0" as const;
const STABLE_RUNTIME_RECEIPT_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-receipt-v1\0" as const;
const STABLE_RESULT_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-row-v1\0" as const;

const PRIVATE_FILE_MODE = 0o600;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const V1R11_FORMAL_RUN_INTENT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2" as const;
const V1R11_FORMAL_RUN_INTENT_DOMAIN =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2\0" as const;
const V1R11_ENGINE_BINARY_IDENTITY_SCHEMA =
  "application/x-mach-o-executable-exact-bytes" as const;
const V1R11_ENGINE_EVAL_IDENTITY_SCHEMA =
  "application/octet-stream-exact-bytes" as const;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const FORMAL_ROLE_COUNTS = Object.freeze({
  fit: 6_144,
  tune: 1_024,
  sealed: 1_024,
});
const ROLE_ORDER = Object.freeze(["fit", "tune", "sealed"] as const);
const BOUNDED_STABLE_V3_TEACHER = Object.freeze({
  candidate_policy: Object.freeze({
    deduplication: "USI-move-exact-before-depth18-rescore",
    recorded_move: Object.freeze({ required: true }),
    stable_depth11: Object.freeze({
      accept_partial_result: false,
      budget_milliseconds: FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
      completed_move_requires_independent_depth18_rescore: true,
      cooperative_deadline_required: true,
      omission_must_be_explicit_in_parent_ledger: true,
      optional: true,
      pool_wide_poison_on_timeout: false,
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      timed_out_worker_replacement: "worker-local-clean-replacement",
    }),
    yaneuraou_depth16_multipv: Object.freeze({
      depth: 16,
      multipv: 12,
      required: true,
    }),
  }),
  engine: "YaneuraOu NNUE 9.60git 64APPLEM1",
  expected_rows_point: 95_191,
  hash_mib_per_process: 512,
  maximum_rows: 114_688,
  maximum_rows_per_parent: 14,
  minimum_rows_per_parent: 2,
  processes: 13,
  rescore_policy: Object.freeze({
    all_deduplicated_candidates_independently_rescored: true,
    depth: 18,
    old_depth6_or_depth12_cp_target_rows: 0,
  }),
  threads_per_process: 1,
  timeout_seconds_per_parent: 600,
});
const YANEURA_ONLY_CANDIDATE_GENERATION_V1 = Object.freeze({
  mode: "yaneuraou-depth16-multipv12-plus-recorded-only",
  stable_wasm: "not-instantiated-or-called",
  proposal_depth: 16,
  proposal_multipv: 12,
  recorded_move_required: true,
  deduplication: "USI-move-exact-before-depth18-rescore",
  rescore_depth: 18,
  maximum_rows_per_parent: 13,
});
const YANEURA_ONLY_V1_TEACHER = Object.freeze({
  candidate_policy: Object.freeze({
    deduplication: "USI-move-exact-before-depth18-rescore",
    recorded_move: Object.freeze({ required: true }),
    stable_wasm: Object.freeze({
      allowed: false,
      calls_per_parent: 0,
      candidate_rows: 0,
      worker_processes: 0,
    }),
    yaneuraou_depth16_multipv: Object.freeze({
      depth: 16,
      multipv: 12,
      required: true,
    }),
  }),
  engine: "YaneuraOu NNUE 9.60git 64APPLEM1",
  hash_mib_per_process: 512,
  ledger_candidate_generation: YANEURA_ONLY_CANDIDATE_GENERATION_V1,
  maximum_rows: 106_496,
  maximum_rows_per_parent: 13,
  minimum_rows_per_parent: 2,
  processes: 13,
  rescore_policy: Object.freeze({
    all_deduplicated_candidates_independently_rescored: true,
    depth: 18,
    old_depth6_or_depth12_cp_target_rows: 0,
  }),
  threads_per_process: 1,
  timeout_seconds_per_parent: 600,
});
const YANEURA_ONLY_V1R5_TEACHER = Object.freeze({
  candidate_policy: YANEURA_ONLY_V1_TEACHER.candidate_policy,
  engine: YANEURA_ONLY_V1_TEACHER.engine,
  hash_mib_per_process: 512,
  ledger_candidate_generation: YANEURA_ONLY_CANDIDATE_GENERATION_V1,
  maximum_rows: 106_496,
  maximum_rows_per_parent: 13,
  minimum_rows_per_parent: 2,
  parent_deadline_policy: "per-search-only-no-aggregate-parent-race",
  persistent_engine_processes: true,
  processes: 4,
  rescore_policy: YANEURA_ONLY_V1_TEACHER.rescore_policy,
  search_timeout_milliseconds: 3_600_000,
  threads_per_process: 1,
  whole_parent_publication:
    "durable-only-after-proposal-and-all-depth18-rescores-pass",
});
const YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY =
  "recycle-engine-retry-parent-once" as const;
const YANEURA_ONLY_V1R9_CANDIDATE_GENERATION = Object.freeze({
  mode: "yaneuraou-depth16-multipv12-plus-recorded-only-hash-fallback-v1",
  stable_wasm: "not-instantiated-or-called",
  proposal_depth: 16,
  proposal_multipv: 12,
  recorded_move_required: true,
  deduplication: "USI-move-exact-before-depth18-rescore",
  normal_rescore: Object.freeze({
    depth: 18,
    node_cap: 2_000_000_000,
    minimum_completed_depth_for_routing: 1,
    hash_mib: 512,
    node_cap_result: "route-whole-parent-never-label",
  }),
  fallback_rescore: Object.freeze({
    depth: 18,
    hash_mib: 8_192,
    all_fixed_candidates_recomputed: true,
    normal_rescore_rows_reused: 0,
    candidate_omissions: 0,
    maximum_concurrency: 2,
  }),
  maximum_rows_per_parent: 13,
} as const);
const V1R9_FALLBACK_PARENT_BUDGET = Object.freeze({
  fit: 6,
  tune: 1,
  sealed: 1,
});
const V1R9_FALLBACK_SEARCH_BUDGET = Object.freeze({
  fit: 78,
  tune: 13,
  sealed: 13,
});
const FORBIDDEN_OLD_TARGET_KEYS = new Set([
  "old_depth12_cp",
  "old_outcome",
  "old_depth12_signals_usage",
]);

type TeacherPlanSchema =
  | typeof HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA
  | typeof HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA
  | typeof HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2
  | typeof HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11;

type TeacherRole = (typeof ROLE_ORDER)[number];

export interface Halfkp81Depth18ArtifactIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema?: string;
  readonly rows?: number;
}

export interface Halfkp81Depth18PrivateSnapshot {
  readonly bytes: Uint8Array;
  readonly identity: Readonly<Halfkp81Depth18ArtifactIdentity>;
}

export interface Halfkp81Depth18TeacherSelectionRow {
  readonly schema: typeof HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA;
  readonly source_game_id: string;
  readonly game_id: string;
  readonly source_game_sha256: string;
  readonly position_id: string;
  readonly sfen: string;
  readonly recorded_move: string;
  readonly side_to_move: "b" | "w";
  readonly ply: number;
  readonly phase: "opening" | "mid" | "late";
  readonly old_depth12_cp: number;
  readonly old_outcome: number;
  readonly old_depth12_signals_usage: "selection_only_never_teacher_target";
  readonly minimum_player_rating: number;
  readonly sente_rating: number;
  readonly gote_rating: number;
  readonly legal_move_count: number;
  readonly hardness_cp_outcome_surprise: number;
  readonly hardness_tiebreak_sha256: string;
  readonly role: TeacherRole;
}

export interface Halfkp81Depth18TeacherWorkHeader {
  readonly schema:
    | typeof HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11;
  readonly kind?: "header";
  readonly status?: "formal-work-ledger-open";
  readonly record_kind?: "header";
  readonly run_fingerprint: string;
  readonly teacher_plan: Readonly<Halfkp81Depth18ArtifactIdentity>;
  readonly selection_jsonl: Readonly<Halfkp81Depth18ArtifactIdentity>;
  readonly selection_manifest: Readonly<Halfkp81Depth18ArtifactIdentity>;
  readonly source_revision: string;
  readonly engine: Readonly<{
    readonly binary: Readonly<Halfkp81Depth18ArtifactIdentity>;
    readonly eval_file: Readonly<Halfkp81Depth18ArtifactIdentity>;
    readonly receipt: Readonly<Halfkp81Depth18ArtifactIdentity>;
  }>;
  readonly teacher: Readonly<Record<string, unknown>>;
  readonly launchagent_authority?: Readonly<Halfkp81Depth18ArtifactIdentity>;
  readonly preformal_authority?: Readonly<Halfkp81Depth18ArtifactIdentity>;
  readonly launchagent_authority_evidence?: Readonly<Halfkp81Depth18ArtifactIdentity>;
  readonly preformal_authority_verified_receipt?: Readonly<Halfkp81Depth18ArtifactIdentity>;
  readonly power_admission_entry?: Readonly<Record<string, unknown>>;
  readonly opened_at_utc?: string;
  readonly stable_runtime?: Readonly<{
    readonly receipt_sha256: string;
    readonly receipt: Readonly<Record<string, unknown>>;
  }>;
  readonly candidate_generation?:
    | typeof YANEURA_ONLY_CANDIDATE_GENERATION_V1
    | typeof YANEURA_ONLY_V1R9_CANDIDATE_GENERATION;
  readonly label_policy: string;
}

export interface Halfkp81Depth18TeacherWorkParent {
  readonly schema:
    | typeof HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11;
  readonly kind: "parent";
  readonly run_fingerprint: string;
  readonly parent_id: string;
  readonly role: TeacherRole;
  readonly stable_result?: Readonly<
    | FloodgateProductionStableWasmRuntimeResult
    | FloodgateBoundedStableWasmOutcomeV3
  >;
  readonly candidate_generation?:
    | typeof YANEURA_ONLY_CANDIDATE_GENERATION_V1
    | typeof YANEURA_ONLY_V1R9_CANDIDATE_GENERATION;
  readonly rescore_route?: Readonly<Record<string, unknown>>;
  readonly reset_timeout_recovery?: Readonly<{
    readonly policy: typeof YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY;
    readonly retries_used: 0 | 1;
    readonly engine_recycles: 0 | 1;
    readonly events: readonly Readonly<{
      readonly attempt: 1;
      readonly error_name: "UsiResetForParentTimeoutError";
      readonly phase: "reset-for-parent";
      readonly timeout_ms: number;
    }>[];
  }>;
  readonly teacher_entry: Readonly<CompletedWorkEntry>;
  readonly payload_sha256: string;
}

export interface Halfkp81Depth18ValidationRequest {
  readonly label: string;
  readonly plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly selection: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly selectionManifest: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly work: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly engineBinary: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly engineEval: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly engineReceipt: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly rawReceipt: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly fit: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly tune: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly sealed: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly v1r11ArtifactVerifierIdentity?: Readonly<Record<string, unknown>>;
  readonly powerContinuity?: Readonly<{
    ledger: Readonly<Halfkp81Depth18PrivateSnapshot>;
    receipt: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    preformalAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    preformalLedger?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    preformalRawReceipt?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchctlPrint?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchctlStderr?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPlist?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPsStdout?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPsStderr?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    /** Held post-run pmset transcript used to authenticate the sealed interval. */
    currentPmsetLogRows: readonly string[];
  }>;
}

export interface Halfkp81Depth18ValidationResult {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptBytes: Uint8Array;
  readonly completedParents: number;
  readonly completedRows: number;
  readonly roleParents: Readonly<Record<TeacherRole, number>>;
  readonly roleRows: Readonly<Record<TeacherRole, number>>;
}

export interface Halfkp81Depth18VerifyAndPublishOptions {
  readonly planPath: string;
  readonly artifactRoot: string;
  readonly effectiveUserId?: number;
  readonly maximumWorkBytes?: number;
}

export interface Halfkp81Depth18V1R11EnvironmentFaultValidationRequest {
  readonly plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly ledger: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly receipt: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly launchAgentAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly preformalAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly preformalLedger?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly preformalRawReceipt?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly launchctlPrint?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly launchctlStderr?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly launchAgentPlist?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly launchAgentPsStdout?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly launchAgentPsStderr?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly processCleanupEvidence: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly terminalFault: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly currentPmsetLogRows: readonly string[];
  readonly verifierIdentity?: Readonly<Record<string, unknown>>;
}

interface ValidationBounds {
  readonly roleCounts: Readonly<Record<TeacherRole, number>>;
}

interface SelectionParent {
  readonly selection: Readonly<Halfkp81Depth18TeacherSelectionRow>;
  readonly parent: Readonly<FloodgateTrainingParent>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalHalfkp81Depth18Json(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("depth18 canonical JSON rejects this number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalHalfkp81Depth18Json).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalHalfkp81Depth18Json(object[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error(`depth18 canonical JSON rejects ${typeof value}`);
}

function canonicalDocumentBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalHalfkp81Depth18Json(value)}\n`, "utf8");
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    canonicalHalfkp81Depth18Json(left) === canonicalHalfkp81Depth18Json(right)
  );
}

function isBoundedStablePlanSchema(
  schema: unknown,
): schema is
  | typeof HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA
  | typeof HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2
  | typeof HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3 {
  return (
    schema === HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA ||
    schema === HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2 ||
    schema === HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3
  );
}

function isYaneuraOnlyPlanSchema(
  schema: unknown,
): schema is
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 {
  return (
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
  );
}

function yaneuraOnlyWorkSchema(
  planSchema: TeacherPlanSchema,
):
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11 {
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11) {
    return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11;
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9) {
    return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9;
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6) {
    return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6;
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5) {
    return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5;
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4) {
    return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4;
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3) {
    return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3;
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2) {
    return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2;
  }
  return HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1;
}

function exactObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !sameJson(
      Object.keys(value as Record<string, unknown>).sort(),
      [...fields].sort(),
    )
  ) {
    throw new Error(`${label} fields are not exact`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be non-empty canonical text`);
  }
  return value;
}

function v1r11AuthorityPath(value: unknown, label: string): string {
  const declared = requiredText(value, label);
  const home = process.env.HOME;
  if (
    typeof home !== "string" ||
    !path.isAbsolute(home) ||
    path.normalize(home) !== home ||
    !declared.startsWith("$HOME/")
  ) {
    throw new Error(`${label} home binding differs`);
  }
  const expanded = path.join(home, declared.slice("$HOME/".length));
  if (!expanded.startsWith(`${home}${path.sep}`)) {
    throw new Error(`${label} escapes home`);
  }
  return expanded;
}

function exactV1R11AuthorityOutputNamespace(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const output = exactObject(
    value,
    [
      "initial_directory_collision_policy",
      "artifact_collision_policy",
      "directory",
      "directory_mode_octal",
      "directory_dev_ino_owner_and_realpath_must_be_fixed_at_creation_and_revalidated_before_each_publish",
      "gate_artifact_directory",
      "preformal_authority_ledger_jsonl",
      "preformal_engine_gate_authority_verified_receipt_json",
      "preformal_authority_receipt_json",
      "preformal_authority_verified_receipt_json",
      "preformal_terminal_fault_json",
      "preformal_process_cleanup_evidence_json",
      "launchagent_launchctl_print_txt",
      "launchagent_launchctl_print_stderr_txt",
      "launchagent_plist_snapshot",
      "launchagent_ps_stdout_txt",
      "launchagent_ps_stderr_txt",
      "launchagent_authority_evidence_json",
    ],
    "v1r11 authority output namespace",
  );
  const directory =
    "$HOME/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
  const expected = {
    initial_directory_collision_policy:
      "create-only-fail-if-authority-directory-already-exists",
    artifact_collision_policy: "create-only-fail-if-specific-target-exists",
    directory,
    directory_mode_octal: "0700",
    directory_dev_ino_owner_and_realpath_must_be_fixed_at_creation_and_revalidated_before_each_publish: true,
    gate_artifact_directory: `${directory}/preformal-gates`,
    preformal_authority_ledger_jsonl: `${directory}/preformal-authority-ledger.jsonl`,
    preformal_engine_gate_authority_verified_receipt_json: `${directory}/preformal-engine-gate-authority-verified-receipt.json`,
    preformal_authority_receipt_json: `${directory}/preformal-authority-receipt.json`,
    preformal_authority_verified_receipt_json: `${directory}/preformal-authority-verified-receipt.json`,
    preformal_terminal_fault_json: `${directory}/preformal-terminal-fault.json`,
    preformal_process_cleanup_evidence_json: `${directory}/preformal-process-cleanup-evidence.json`,
    launchagent_launchctl_print_txt: `${directory}/launchagent-launchctl-print.txt`,
    launchagent_launchctl_print_stderr_txt: `${directory}/launchagent-launchctl-print.stderr.txt`,
    launchagent_plist_snapshot: `${directory}/launchagent.plist.snapshot`,
    launchagent_ps_stdout_txt: `${directory}/launchagent-ps.stdout.txt`,
    launchagent_ps_stderr_txt: `${directory}/launchagent-ps.stderr.txt`,
    launchagent_authority_evidence_json: `${directory}/launchagent-authority-evidence.json`,
  };
  if (
    canonicalHalfkp81Depth18Json(output) !==
    canonicalHalfkp81Depth18Json(expected)
  ) {
    throw new Error("v1r11 authority output namespace values differ");
  }
  return output;
}

function requiredInteger(
  value: unknown,
  label: string,
  minimum = Number.MIN_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a bounded integer`);
  }
  return value as number;
}

function requiredDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return value;
}

function parseJson(bytes: Uint8Array, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain one JSON object`);
  }
  return value as Record<string, unknown>;
}

function parseCanonicalDocument(
  snapshot: Readonly<Halfkp81Depth18PrivateSnapshot>,
  label: string,
): Record<string, unknown> {
  const value = parseJson(snapshot.bytes, label);
  if (!canonicalDocumentBytes(value).equals(Buffer.from(snapshot.bytes))) {
    throw new Error(`${label} is not exact canonical JSON`);
  }
  return value;
}

function parseExactJsonl(
  bytes: Uint8Array,
  label: string,
  requireJsCanonical = true,
): unknown[] {
  const buffer = Buffer.from(bytes);
  if (buffer.byteLength === 0 || buffer.at(-1) !== 0x0a) {
    throw new Error(`${label} must end in exactly one LF-delimited row`);
  }
  const text = buffer.toString("utf8");
  const lines = text.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0 || line.includes("\r"))) {
    throw new Error(`${label} contains an empty or non-LF row`);
  }
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`${label} line ${index + 1} is invalid JSON`);
    }
    if (requireJsCanonical && canonicalHalfkp81Depth18Json(value) !== line) {
      throw new Error(`${label} line ${index + 1} is not canonical JSON`);
    }
    return value;
  });
}

function pythonSelectionTieBytes(
  value: Readonly<{
    game_id: unknown;
    minimum_player_rating: unknown;
    old_depth12_cp: unknown;
    old_outcome: unknown;
    position_id: unknown;
  }>,
): Buffer {
  const outcome =
    value.old_outcome === 0
      ? "0.0"
      : value.old_outcome === 1
        ? "1.0"
        : value.old_outcome === 0.5
          ? "0.5"
          : undefined;
  if (
    outcome === undefined ||
    !Number.isSafeInteger(value.minimum_player_rating) ||
    !Number.isSafeInteger(value.old_depth12_cp)
  ) {
    throw new Error("selection tie material is not Python-canonicalizable");
  }
  return Buffer.from(
    `{"game_id":${JSON.stringify(value.game_id)},"minimum_player_rating":${String(
      value.minimum_player_rating,
    )},"old_depth12_cp":${String(value.old_depth12_cp)},"old_outcome":${outcome},"position_id":${JSON.stringify(
      value.position_id,
    )}}\n`,
    "utf8",
  );
}

function identityFromSnapshot(
  snapshot: Readonly<Halfkp81Depth18PrivateSnapshot>,
  schema?: string,
  rows?: number,
): Readonly<Halfkp81Depth18ArtifactIdentity> {
  return Object.freeze({
    path: snapshot.identity.path,
    bytes: snapshot.bytes.byteLength,
    sha256: sha256(snapshot.bytes),
    ...(schema === undefined ? {} : { schema }),
    ...(rows === undefined ? {} : { rows }),
  });
}

function validateDeclaredIdentity(
  value: unknown,
  actual: Readonly<Halfkp81Depth18PrivateSnapshot>,
  label: string,
  options: Readonly<{ schema?: string; rows?: number }> = {},
): void {
  const expectedFields = [
    "path",
    "bytes",
    "sha256",
    ...(options.schema === undefined ? [] : ["schema"]),
    ...(options.rows === undefined ? [] : ["rows"]),
  ];
  const identity = exactObject(value, expectedFields, label);
  const expected = identityFromSnapshot(actual, options.schema, options.rows);
  if (!sameJson(identity, expected)) {
    throw new Error(`${label} differs from held bytes`);
  }
}

function validateV1R11FullIdentity(
  value: unknown,
  actual: Readonly<Halfkp81Depth18PrivateSnapshot>,
  schema: string,
  label: string,
): void {
  validateDeclaredIdentity(value, actual, label, { schema });
}

function validateV1R11IsoUtc(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} is not canonical UTC`);
  }
}

function validateV1R11ImplementationIdentity(
  value: unknown,
  sourceRevision: unknown,
  label: string,
): void {
  const implementation = exactObject(
    value,
    ["source_revision", "entrypoint", "dependency_closure"],
    label,
  );
  if (
    implementation.source_revision !== sourceRevision ||
    typeof implementation.entrypoint !== "string" ||
    !implementation.entrypoint.startsWith("ml/") ||
    !Array.isArray(implementation.dependency_closure) ||
    implementation.dependency_closure.length < 1
  ) {
    throw new Error(`${label} differs`);
  }
  const paths: string[] = [];
  for (const [
    index,
    untrusted,
  ] of implementation.dependency_closure.entries()) {
    const entry = exactObject(
      untrusted,
      ["path", "bytes", "sha256"],
      `${label} dependency ${index + 1}`,
    );
    if (
      typeof entry.path !== "string" ||
      path.isAbsolute(entry.path) ||
      path.normalize(entry.path) !== entry.path ||
      entry.path.startsWith("..") ||
      !Number.isSafeInteger(entry.bytes) ||
      Number(entry.bytes) < 1 ||
      typeof entry.sha256 !== "string" ||
      !SHA256_RE.test(entry.sha256)
    ) {
      throw new Error(`${label} dependency ${index + 1} differs`);
    }
    paths.push(entry.path);
  }
  if (
    paths[0] !== implementation.entrypoint ||
    !sameJson(
      paths.slice(1),
      [...paths.slice(1)].sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right)),
      ),
    ) ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error(`${label} dependency ordering differs`);
  }
}

function v1r11ImplementationIdentityFromRevision(
  sourceRevision: string,
  entrypoint: string,
): Readonly<Record<string, unknown>> {
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const seen = new Map<string, Buffer>();
  const pending = [entrypoint];
  const readAtRevision = (relativePath: string): Buffer =>
    execFileSync(
      "git",
      ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
      {
        encoding: null,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  while (pending.length > 0) {
    const relativePath = pending.shift()!;
    if (seen.has(relativePath)) continue;
    const bytes = readAtRevision(relativePath);
    seen.set(relativePath, bytes);
    const source = bytes.toString("utf8");
    const imports = [
      ...source.matchAll(
        /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](\.[^"']+)["']/gu,
      ),
    ].map((match) => match[1]!);
    for (const specifier of imports) {
      const base = path.posix.normalize(
        path.posix.join(path.posix.dirname(relativePath), specifier),
      );
      const candidates = path.posix.extname(base)
        ? [base]
        : [`${base}.ts`, `${base}.json`, `${base}/index.ts`];
      let resolved: string | undefined;
      for (const candidate of candidates) {
        try {
          readAtRevision(candidate);
          resolved = candidate;
          break;
        } catch {
          // Try the next repository-relative TypeScript/JSON resolution.
        }
      }
      if (resolved === undefined || resolved.startsWith("..")) {
        throw new Error(
          `v1r11 implementation dependency cannot resolve ${specifier}`,
        );
      }
      pending.push(resolved);
    }
  }
  const ordered = [
    entrypoint,
    ...[...seen.keys()]
      .filter((relativePath) => relativePath !== entrypoint)
      .sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right)),
      ),
  ];
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint,
    dependency_closure: Object.freeze(
      ordered.map((relativePath) => {
        const bytes = seen.get(relativePath)!;
        return Object.freeze({
          path: relativePath,
          bytes: bytes.byteLength,
          sha256: sha256(bytes),
        });
      }),
    ),
  });
}

function validateV1R11TrackedImplementationIdentity(
  value: unknown,
  sourceRevision: string,
  label: string,
  expectedEntrypoint?: string,
): void {
  validateV1R11ImplementationIdentity(value, sourceRevision, label);
  const implementation = value as Readonly<Record<string, unknown>>;
  if (
    (expectedEntrypoint !== undefined &&
      implementation.entrypoint !== expectedEntrypoint) ||
    !sameJson(
      implementation,
      v1r11ImplementationIdentityFromRevision(
        sourceRevision,
        String(implementation.entrypoint),
      ),
    )
  ) {
    throw new Error(`${label} tracked dependency closure differs`);
  }
}

const HALFKP81_V1R11_CLEANUP_RAW_FIELDS = Object.freeze([
  "schema",
  "encoding",
  "base64",
  "decoded_bytes",
  "sha256",
] as const);
const HALFKP81_V1R11_CLEANUP_PROCESS_ROW_FIELDS = Object.freeze([
  "pid",
  "ppid",
  "pgid",
  "lstart",
  "executable",
  "argv",
  "role",
] as const);
const HALFKP81_V1R11_CLEANUP_PS_FIELDS = Object.freeze([
  "command",
  "started_at_utc",
  "finished_at_utc",
  "started_monotonic_ns",
  "finished_monotonic_ns",
  "exit_code",
  "signal",
  "stdout",
  "stderr",
  "parsed_process_rows",
] as const);
const HALFKP81_V1R11_CLEANUP_COMMAND_FIELDS = Object.freeze([
  "sequence",
  "phase",
  "argv",
  "target_pid",
  "target_pgid",
  "target_lstart",
  "started_at_utc",
  "finished_at_utc",
  "started_monotonic_ns",
  "finished_monotonic_ns",
  "exit_code",
  "signal",
  "disposition",
  "stdout",
  "stderr",
  "absence_probe",
] as const);
const HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_FIELDS = Object.freeze([
  "schema",
  "status",
  "scope",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "launchagent",
  "runner_identity",
  "pre_cleanup_ps",
  "pre_cleanup_process_rows",
  "ordered_cleanup_commands",
  "service_absence",
  "pid_reuse_rejection",
  "final_ps_first",
  "final_ps_second",
  "remaining_process_rows",
  "remaining_process_group_rows",
  "process_cleanup",
  "producer",
  "captured_at_utc",
  "authority",
] as const);
const HALFKP81_V1R11_CLEANUP_PS_COMMAND = Object.freeze([
  "/bin/ps",
  "-ww",
  "-axo",
  "pid=,ppid=,pgid=,lstart=,command=",
] as const);
const HALFKP81_V1R11_CLEANUP_ROLES = new Set([
  "runner",
  "assertion-holder",
  "power-guardian",
  "stage-b-supervisor",
  "yaneuraou-engine",
  "other-target-descendant",
  "target-process-group-member",
  "pid-reuse-nontarget",
]);

interface V1R11CleanupProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly lstart: string;
  readonly executable: string;
  readonly argv: string;
  readonly role: string;
}

interface V1R11CleanupPsCapture {
  readonly value: Readonly<Record<string, unknown>>;
  readonly started: bigint;
  readonly finished: bigint;
  readonly rows: readonly V1R11CleanupProcessRow[];
  readonly rawRows: readonly Omit<V1R11CleanupProcessRow, "role">[];
}

function validateV1R11CleanupMonotonic(
  value: unknown,
  label: string,
): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new Error(`${label} is not an unsigned decimal string`);
  }
  return BigInt(value);
}

function validateV1R11CleanupRawTranscript(
  value: unknown,
  expectedSchema: string,
  label: string,
): Buffer {
  const raw = exactObject(value, HALFKP81_V1R11_CLEANUP_RAW_FIELDS, label);
  if (
    raw.schema !== expectedSchema ||
    raw.encoding !== "base64" ||
    typeof raw.base64 !== "string" ||
    !Number.isSafeInteger(raw.decoded_bytes) ||
    Number(raw.decoded_bytes) < 0 ||
    typeof raw.sha256 !== "string" ||
    !SHA256_RE.test(raw.sha256)
  ) {
    throw new Error(`${label} differs`);
  }
  const decoded = Buffer.from(raw.base64, "base64");
  if (
    decoded.toString("base64") !== raw.base64 ||
    decoded.byteLength !== raw.decoded_bytes ||
    sha256(decoded) !== raw.sha256
  ) {
    throw new Error(`${label} held bytes differ`);
  }
  return decoded;
}

function parseV1R11CleanupPsRows(
  bytes: Buffer,
  label: string,
): readonly Omit<V1R11CleanupProcessRow, "role">[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not UTF-8`);
  }
  if (text.length === 0) return Object.freeze([]);
  const rows = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  return Object.freeze(
    rows.map((line, index) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/u.exec(
        line,
      );
      if (match === null) {
        throw new Error(`${label} row ${index + 1} is ambiguous`);
      }
      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      const pgid = Number(match[3]);
      if (
        !Number.isSafeInteger(pid) ||
        pid < 1 ||
        !Number.isSafeInteger(ppid) ||
        ppid < 0 ||
        !Number.isSafeInteger(pgid) ||
        pgid < 1
      ) {
        throw new Error(`${label} row ${index + 1} identity differs`);
      }
      return Object.freeze({
        pid,
        ppid,
        pgid,
        lstart: match[4]!,
        executable: /^(\S+)(?:\s|$)/u.exec(match[5]!)?.[1] ?? "",
        argv: match[5]!,
      });
    }),
  );
}

function validateV1R11CleanupProcessRows(
  value: unknown,
  rawRows: readonly Omit<V1R11CleanupProcessRow, "role">[],
  label: string,
): readonly V1R11CleanupProcessRow[] {
  if (!Array.isArray(value)) throw new Error(`${label} differs`);
  let previousPid = 0;
  let previousRole = "";
  const rows = value.map((untrusted, index) => {
    const row = exactObject(
      untrusted,
      HALFKP81_V1R11_CLEANUP_PROCESS_ROW_FIELDS,
      `${label} row ${index + 1}`,
    );
    if (
      !Number.isSafeInteger(row.pid) ||
      Number(row.pid) < 1 ||
      !Number.isSafeInteger(row.ppid) ||
      Number(row.ppid) < 0 ||
      !Number.isSafeInteger(row.pgid) ||
      Number(row.pgid) < 1 ||
      typeof row.lstart !== "string" ||
      row.lstart.length < 1 ||
      typeof row.executable !== "string" ||
      row.executable.length < 1 ||
      typeof row.argv !== "string" ||
      row.argv.length < 1 ||
      typeof row.role !== "string" ||
      !HALFKP81_V1R11_CLEANUP_ROLES.has(row.role)
    ) {
      throw new Error(`${label} row ${index + 1} differs`);
    }
    const typed = row as unknown as V1R11CleanupProcessRow;
    if (
      typed.pid < previousPid ||
      (typed.pid === previousPid &&
        Buffer.compare(Buffer.from(typed.role), Buffer.from(previousRole)) <= 0)
    ) {
      throw new Error(`${label} ordering differs`);
    }
    previousPid = typed.pid;
    previousRole = typed.role;
    const matchingRaw = rawRows.some(
      (raw) =>
        raw.pid === typed.pid &&
        raw.ppid === typed.ppid &&
        raw.pgid === typed.pgid &&
        raw.lstart === typed.lstart &&
        raw.executable === typed.executable &&
        raw.argv === typed.argv,
    );
    if (!matchingRaw) throw new Error(`${label} row ${index + 1} is not in held ps bytes`);
    return Object.freeze({ ...typed });
  });
  return Object.freeze(rows);
}

function validateV1R11CleanupPsCapture(
  value: unknown,
  stdoutSchema: string,
  stderrSchema: string,
  label: string,
): V1R11CleanupPsCapture {
  const capture = exactObject(value, HALFKP81_V1R11_CLEANUP_PS_FIELDS, label);
  if (
    !sameJson(capture.command, HALFKP81_V1R11_CLEANUP_PS_COMMAND) ||
    capture.exit_code !== 0 ||
    capture.signal !== null
  ) {
    throw new Error(`${label} command outcome differs`);
  }
  validateV1R11IsoUtc(capture.started_at_utc, `${label} started_at_utc`);
  validateV1R11IsoUtc(capture.finished_at_utc, `${label} finished_at_utc`);
  const started = validateV1R11CleanupMonotonic(
    capture.started_monotonic_ns,
    `${label} started_monotonic_ns`,
  );
  const finished = validateV1R11CleanupMonotonic(
    capture.finished_monotonic_ns,
    `${label} finished_monotonic_ns`,
  );
  if (
    finished < started ||
    Date.parse(String(capture.finished_at_utc)) <
      Date.parse(String(capture.started_at_utc))
  ) {
    throw new Error(`${label} timestamp order differs`);
  }
  const stdout = validateV1R11CleanupRawTranscript(
    capture.stdout,
    stdoutSchema,
    `${label} stdout`,
  );
  validateV1R11CleanupRawTranscript(
    capture.stderr,
    stderrSchema,
    `${label} stderr`,
  );
  const rawRows = parseV1R11CleanupPsRows(stdout, `${label} stdout`);
  const rows = validateV1R11CleanupProcessRows(
    capture.parsed_process_rows,
    rawRows,
    `${label} parsed_process_rows`,
  );
  return Object.freeze({ value: capture, started, finished, rows, rawRows });
}

function sameV1R11CleanupProcessIdentity(
  left: Pick<V1R11CleanupProcessRow, "pid" | "pgid" | "lstart" | "executable">,
  right: Pick<V1R11CleanupProcessRow, "pid" | "pgid" | "lstart" | "executable">,
): boolean {
  return (
    left.pid === right.pid &&
    left.pgid === right.pgid &&
    left.lstart === right.lstart &&
    left.executable === right.executable
  );
}

function parseV1R11PlistProgramArguments(
  bytes: Uint8Array,
  label: string,
): readonly string[] {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not UTF-8`);
  }
  const blocks = [
    ...xml.matchAll(
      /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/gu,
    ),
  ];
  if (blocks.length !== 1 || blocks[0]?.[1] === undefined) {
    throw new Error(`${label} ProgramArguments differs`);
  }
  const body = blocks[0][1];
  const matches = [...body.matchAll(/<string>([^<]*)<\/string>/gu)];
  if (
    matches.length < 1 ||
    body.replace(/<string>[^<]*<\/string>/gu, "").trim().length !== 0
  ) {
    throw new Error(`${label} ProgramArguments rows differ`);
  }
  const entities: Readonly<Record<string, string>> = Object.freeze({
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
  });
  const arguments_ = matches.map((match, index) => {
    const encoded = match[1]!;
    if (/&(?!amp;|lt;|gt;|quot;|apos;)/u.test(encoded)) {
      throw new Error(`${label} ProgramArguments row ${index + 1} entity differs`);
    }
    const decoded = encoded.replace(
      /&(amp|lt|gt|quot|apos);/gu,
      (entity) => entities[entity]!,
    );
    if (decoded.length < 1 || /[\u0000\r\n]/u.test(decoded)) {
      throw new Error(`${label} ProgramArguments row ${index + 1} differs`);
    }
    return decoded;
  });
  return Object.freeze(arguments_);
}

function validateV1R11FinalLaunchctlTopology(
  rawBytes: Uint8Array,
  launch: Readonly<Record<string, unknown>>,
): void {
  const raw = Buffer.from(rawBytes);
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) {
    throw new Error("v1r11 final launchctl stdout is not exact UTF-8");
  }
  const value = (key: string): string => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const matches = [
      ...text.matchAll(new RegExp(`^\\t${escaped} = (.+)$`, "gmu")),
    ];
    if (matches.length !== 1 || matches[0]?.[1] === undefined) {
      throw new Error(`v1r11 final launchctl ${key} differs`);
    }
    return matches[0][1];
  };
  const argumentsStart = text.indexOf("\n\targuments = {\n");
  const argumentsEnd = text.indexOf("\n\t}\n", argumentsStart + 1);
  if (
    argumentsStart < 0 ||
    argumentsEnd < 0 ||
    text.indexOf("\n\targuments = {\n", argumentsStart + 1) !== -1 ||
    !Array.isArray(launch.program_arguments) ||
    !Array.isArray(launch.runner_utility_argv)
  ) {
    throw new Error("v1r11 final launchctl arguments block differs");
  }
  const arguments_ = text
    .slice(argumentsStart + "\n\targuments = {\n".length, argumentsEnd)
    .split("\n")
    .map((line) => /^\t\t(.+)$/u.exec(line)?.[1] ?? "");
  if (
    !text.startsWith(`gui/${String(launch.uid)}/${String(launch.label)} = {\n`) ||
    !sameJson(arguments_, launch.runner_utility_argv) ||
    !sameJson(launch.program_arguments, launch.runner_utility_argv) ||
    value("program") !== launch.runner_utility_argv[0] ||
    value("pid") !== String(launch.runner_pid)
  ) {
    throw new Error("v1r11 final launchctl node-direct topology differs");
  }
}

function deriveV1R11PreCleanupRows(
  rawRows: readonly Omit<V1R11CleanupProcessRow, "role">[],
  runner: Readonly<{ pid: number; pgid: number; lstart: string }> | null,
  plan: Readonly<Record<string, unknown>>,
  launchAuthority: Readonly<Record<string, unknown>>,
): readonly V1R11CleanupProcessRow[] {
  if (runner === null) return Object.freeze([]);
  const runnerRaw = rawRows.find(
    (row) =>
      row.pid === runner.pid &&
      row.pgid === runner.pgid &&
      row.lstart === runner.lstart,
  );
  if (runnerRaw === undefined) throw new Error("v1r11 cleanup runner is absent from pre-cleanup ps");
  const targetPids = new Set<number>([runner.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rawRows) {
      if (!targetPids.has(row.pid) && targetPids.has(row.ppid)) {
        targetPids.add(row.pid);
        changed = true;
      }
    }
  }
  const engine =
    plan.engine !== null && typeof plan.engine === "object" && !Array.isArray(plan.engine)
      ? (plan.engine as Readonly<Record<string, unknown>>)
      : undefined;
  const binary =
    engine?.binary !== null && typeof engine?.binary === "object" && !Array.isArray(engine.binary)
      ? (engine.binary as Readonly<Record<string, unknown>>)
      : undefined;
  const enginePath = typeof binary?.path === "string" ? binary.path : undefined;
  const holder =
    launchAuthority.caffeinate_holder !== null &&
    typeof launchAuthority.caffeinate_holder === "object" &&
    !Array.isArray(launchAuthority.caffeinate_holder)
      ? (launchAuthority.caffeinate_holder as Readonly<Record<string, unknown>>)
      : undefined;
  const holderPid = Number(holder?.pid);
  const rows = rawRows
    .filter((row) => targetPids.has(row.pid) || row.pgid === runner.pgid)
    .map((row): V1R11CleanupProcessRow => {
      let role: string;
      if (row.pid === runner.pid) role = "runner";
      else if (Number.isSafeInteger(holderPid) && row.pid === holderPid)
        role = "assertion-holder";
      else if (row.argv.includes("ml/halfkp81-depth18-power-continuity-guardian.ts"))
        role = "power-guardian";
      else if (row.argv.includes("ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor.ts"))
        role = "stage-b-supervisor";
      else if (
        enginePath !== undefined &&
        (row.executable === enginePath ||
          row.argv === enginePath ||
          row.argv.startsWith(`${enginePath} `))
      )
        role = "yaneuraou-engine";
      else if (targetPids.has(row.pid)) role = "other-target-descendant";
      else role = "target-process-group-member";
      return Object.freeze({ ...row, role });
    })
    .sort((left, right) => left.pid - right.pid || Buffer.compare(Buffer.from(left.role), Buffer.from(right.role)));
  return Object.freeze(rows);
}

function deriveV1R11LaterCleanupRows(
  rawRows: readonly Omit<V1R11CleanupProcessRow, "role">[],
  preRows: readonly V1R11CleanupProcessRow[],
  runner: Readonly<{ pid: number; pgid: number; lstart: string }> | null,
): readonly V1R11CleanupProcessRow[] {
  const rows: V1R11CleanupProcessRow[] = [];
  for (const raw of rawRows) {
    const exact = preRows.find((row) => sameV1R11CleanupProcessIdentity(row, raw));
    if (exact !== undefined) rows.push(Object.freeze({ ...raw, role: exact.role }));
    else if (preRows.some((row) => row.pid === raw.pid) || raw.pid === runner?.pid)
      rows.push(Object.freeze({ ...raw, role: "pid-reuse-nontarget" }));
    else if (runner !== null && raw.pgid === runner.pgid)
      rows.push(Object.freeze({ ...raw, role: "target-process-group-member" }));
  }
  rows.sort((left, right) => left.pid - right.pid || Buffer.compare(Buffer.from(left.role), Buffer.from(right.role)));
  return Object.freeze(rows);
}

function validateV1R11ProcessCleanupEvidence(
  snapshot: Readonly<Halfkp81Depth18PrivateSnapshot>,
  context: Readonly<{
    plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
    planValue: Readonly<Record<string, unknown>>;
    launchAgentAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPlist: Readonly<Halfkp81Depth18PrivateSnapshot>;
    sourceRevision: string;
    runFingerprint: string;
    scope: "preformal" | "post-formal-environment";
    verifyTrackedProducer: boolean;
  }>,
): Readonly<Record<string, unknown>> {
  const expectedBasename =
    context.scope === "preformal"
      ? "preformal-process-cleanup-evidence.json"
      : "environment-process-cleanup-evidence.json";
  if (path.basename(snapshot.identity.path) !== expectedBasename) {
    throw new Error("v1r11 process cleanup evidence path differs");
  }
  const evidence = parseCanonicalDocument(snapshot, "v1r11 process cleanup evidence");
  exactObject(
    evidence,
    HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_FIELDS,
    "v1r11 process cleanup evidence",
  );
  if (
    evidence.schema !== HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA ||
    evidence.status !== "cleanup-independently-recomputable-no-authority" ||
    evidence.scope !== context.scope ||
    evidence.source_revision !== context.sourceRevision ||
    evidence.run_fingerprint !== context.runFingerprint ||
    !sameJson(evidence.authority, {
      may_execute_preformal_engine_gates: false,
      may_execute_formal_teacher: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error("v1r11 process cleanup evidence authority differs");
  }
  validateV1R11FullIdentity(
    evidence.teacher_plan,
    context.plan,
    String(context.planValue.schema),
    "v1r11 cleanup teacher plan",
  );
  const launch = exactObject(
    evidence.launchagent,
    ["label", "plist_snapshot"],
    "v1r11 cleanup LaunchAgent",
  );
  const launchAuthority = parseCanonicalDocument(
    context.launchAgentAuthority,
    "v1r11 cleanup held LaunchAgent authority",
  );
  if (launch.label !== launchAuthority.label || typeof launch.label !== "string") {
    throw new Error("v1r11 cleanup LaunchAgent label differs");
  }
  validateV1R11FullIdentity(
    launch.plist_snapshot,
    context.launchAgentPlist,
    "application/x-apple-aspen-config-exact-bytes",
    "v1r11 cleanup LaunchAgent plist snapshot",
  );
  const launchProcessRow = (
    value: unknown,
    expectedRole: "runner" | "assertion-holder",
    label: string,
  ): V1R11CleanupProcessRow => {
    const row = exactObject(
      value,
      HALFKP81_V1R11_CLEANUP_PROCESS_ROW_FIELDS,
      label,
    );
    if (
      row.role !== expectedRole ||
      !Number.isSafeInteger(row.pid) ||
      Number(row.pid) < 1 ||
      !Number.isSafeInteger(row.ppid) ||
      Number(row.ppid) < 0 ||
      !Number.isSafeInteger(row.pgid) ||
      Number(row.pgid) < 1 ||
      typeof row.lstart !== "string" ||
      row.lstart.length < 1 ||
      typeof row.executable !== "string" ||
      row.executable.length < 1 ||
      typeof row.argv !== "string" ||
      row.argv.length < 1
    ) {
      throw new Error(`${label} differs`);
    }
    return Object.freeze({ ...(row as unknown as V1R11CleanupProcessRow) });
  };
  const launchRunner = launchProcessRow(
    launchAuthority.runner_process,
    "runner",
    "v1r11 cleanup held LaunchAgent runner process",
  );
  const launchHolder = launchProcessRow(
    launchAuthority.assertion_holder_process,
    "assertion-holder",
    "v1r11 cleanup held LaunchAgent assertion-holder process",
  );
  const launchHolderDeclaration = exactObject(
    launchAuthority.caffeinate_holder,
    ["pid", "parent_runner_pid", "assertion_owner_pid", "executable", "argv"],
    "v1r11 cleanup held LaunchAgent caffeinate holder",
  );
  const expectedHolderArguments = Object.freeze([
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    String(launchRunner.pid),
  ]);
  if (
    !Array.isArray(launchAuthority.runner_utility_argv) ||
    launchAuthority.runner_utility_argv.length < 1 ||
    launchAuthority.runner_utility_argv.some(
      (argument) => typeof argument !== "string" || argument.length < 1,
    ) ||
    !Array.isArray(launchAuthority.program_arguments) ||
    launchAuthority.program_arguments.length < 1 ||
    launchAuthority.program_arguments.some(
      (argument) => typeof argument !== "string" || argument.length < 1,
    ) ||
    !sameJson(
      launchAuthority.program_arguments,
      launchAuthority.runner_utility_argv,
    ) ||
    launchRunner.pid !== launchAuthority.runner_pid ||
    launchRunner.pgid !== launchRunner.pid ||
    launchRunner.executable !== launchAuthority.runner_utility_argv[0] ||
    launchRunner.argv !== launchAuthority.runner_utility_argv.join(" ") ||
    launchHolder.pid !== launchHolderDeclaration.pid ||
    launchHolder.ppid !== launchRunner.pid ||
    launchHolder.pgid !== launchRunner.pgid ||
    launchHolder.executable !== "/usr/bin/caffeinate" ||
    launchHolder.argv !== expectedHolderArguments.join(" ") ||
    launchHolderDeclaration.parent_runner_pid !== launchRunner.pid ||
    launchHolderDeclaration.assertion_owner_pid !== launchHolder.pid ||
    launchHolderDeclaration.executable !== launchHolder.executable ||
    !sameJson(launchHolderDeclaration.argv, expectedHolderArguments) ||
    !sameJson(
      parseV1R11PlistProgramArguments(
        context.launchAgentPlist.bytes,
        "v1r11 cleanup held LaunchAgent plist",
      ),
      launchAuthority.program_arguments,
    )
  ) {
    throw new Error("v1r11 cleanup held LaunchAgent process topology differs");
  }
  let runner: Readonly<{ pid: number; pgid: number; lstart: string }> | null = null;
  if (evidence.runner_identity !== null) {
    const untrusted = exactObject(
      evidence.runner_identity,
      ["pid", "pgid", "lstart"],
      "v1r11 cleanup runner identity",
    );
    if (
      !Number.isSafeInteger(untrusted.pid) ||
      Number(untrusted.pid) < 1 ||
      !Number.isSafeInteger(untrusted.pgid) ||
      Number(untrusted.pgid) < 1 ||
      typeof untrusted.lstart !== "string" ||
      untrusted.lstart.length < 1 ||
      untrusted.pid !== launchRunner.pid ||
      untrusted.pgid !== launchRunner.pgid ||
      untrusted.lstart !== launchRunner.lstart
    ) {
      throw new Error("v1r11 cleanup runner identity differs");
    }
    runner = Object.freeze({
      pid: Number(untrusted.pid),
      pgid: Number(untrusted.pgid),
      lstart: untrusted.lstart,
    });
  }
  if (context.scope === "post-formal-environment" && runner === null) {
    throw new Error("v1r11 post-formal cleanup requires an active runner identity");
  }
  const pre = validateV1R11CleanupPsCapture(
    evidence.pre_cleanup_ps,
    "text/plain-exact-pre-cleanup-ps-stdout",
    "text/plain-exact-pre-cleanup-ps-stderr",
    "v1r11 pre-cleanup ps",
  );
  const expectedPreRows = deriveV1R11PreCleanupRows(
    pre.rawRows,
    runner,
    context.planValue,
    launchAuthority,
  );
  if (!sameJson(pre.rows, expectedPreRows)) {
    throw new Error("v1r11 pre-cleanup ps role derivation differs");
  }
  if (runner !== null) {
    const preRunner = expectedPreRows.find((row) => row.role === "runner");
    const preHolder = expectedPreRows.find(
      (row) => row.role === "assertion-holder",
    );
    if (
      preRunner === undefined ||
      preHolder === undefined ||
      !sameJson(preRunner, launchRunner) ||
      !sameJson(preHolder, launchHolder)
    ) {
      throw new Error(
        "v1r11 cleanup pre-cleanup ps differs from held LaunchAgent topology",
      );
    }
  }
  const declaredPreRows = validateV1R11CleanupProcessRows(
    evidence.pre_cleanup_process_rows,
    pre.rawRows,
    "v1r11 pre-cleanup process rows",
  );
  if (!sameJson(declaredPreRows, expectedPreRows)) {
    throw new Error("v1r11 pre-cleanup process rows differ");
  }
  if (!Array.isArray(evidence.ordered_cleanup_commands) || evidence.ordered_cleanup_commands.length !== 3) {
    throw new Error("v1r11 cleanup command sequence differs");
  }
  const commands = evidence.ordered_cleanup_commands.map((untrusted, index) =>
    exactObject(untrusted, HALFKP81_V1R11_CLEANUP_COMMAND_FIELDS, `v1r11 cleanup command ${index + 1}`),
  );
  const phases = ["bootout", "TERM", "KILL"] as const;
  const expectedArgv = [
    ["/bin/launchctl", "bootout", `gui/${String(launchAuthority.uid)}/${String(launch.label)}`],
    runner === null ? ["/bin/kill", "-TERM", "--"] : ["/bin/kill", "-TERM", "--", `-${runner.pgid}`],
    runner === null ? ["/bin/kill", "-KILL", "--"] : ["/bin/kill", "-KILL", "--", `-${runner.pgid}`],
  ];
  const captures: V1R11CleanupPsCapture[] = [];
  const commandTimes: Readonly<{ started: bigint; finished: bigint }>[] = [];
  for (const [index, command] of commands.entries()) {
    if (
      command.sequence !== index + 1 ||
      command.phase !== phases[index] ||
      !sameJson(command.argv, expectedArgv[index])
    ) {
      throw new Error(`v1r11 cleanup command ${index + 1} order/argv differs`);
    }
    validateV1R11IsoUtc(command.started_at_utc, `v1r11 cleanup command ${index + 1} start`);
    validateV1R11IsoUtc(command.finished_at_utc, `v1r11 cleanup command ${index + 1} finish`);
    const started = validateV1R11CleanupMonotonic(command.started_monotonic_ns, `v1r11 cleanup command ${index + 1} started_monotonic_ns`);
    const finished = validateV1R11CleanupMonotonic(command.finished_monotonic_ns, `v1r11 cleanup command ${index + 1} finished_monotonic_ns`);
    if (finished < started || Date.parse(String(command.finished_at_utc)) < Date.parse(String(command.started_at_utc))) {
      throw new Error(`v1r11 cleanup command ${index + 1} timestamp order differs`);
    }
    commandTimes.push(Object.freeze({ started, finished }));
    const executed = command.disposition === "executed";
    if (executed) {
      if (command.exit_code !== 0 || command.signal !== null) throw new Error(`v1r11 cleanup command ${index + 1} outcome differs`);
      validateV1R11CleanupRawTranscript(command.stdout, "text/plain-exact-command-stdout", `v1r11 cleanup command ${index + 1} stdout`);
      validateV1R11CleanupRawTranscript(command.stderr, "text/plain-exact-command-stderr", `v1r11 cleanup command ${index + 1} stderr`);
    } else if (
      !["not-required-after-held-post-bootout-absence-probe", "not-required-after-held-absence-probe"].includes(String(command.disposition)) ||
      command.exit_code !== null || command.signal !== null || command.stdout !== null || command.stderr !== null
    ) {
      throw new Error(`v1r11 cleanup command ${index + 1} disposition differs`);
    }
    if (index === 0 && !executed) throw new Error("v1r11 cleanup bootout was not executed");
    const targetDiffers =
      runner === null
        ? command.target_pid !== null ||
          command.target_pgid !== null ||
          command.target_lstart !== null
        : command.target_pid !== runner.pid ||
          command.target_pgid !== runner.pgid ||
          command.target_lstart !== runner.lstart;
    if (targetDiffers) {
      throw new Error(`v1r11 cleanup command ${index + 1} target differs`);
    }
    if (
      !executed &&
      ((index === 1 &&
        command.disposition !==
          "not-required-after-held-post-bootout-absence-probe") ||
        (index === 2 &&
          command.disposition !== "not-required-after-held-absence-probe"))
    ) {
      throw new Error(`v1r11 cleanup command ${index + 1} branch disposition differs`);
    }
    const capture = validateV1R11CleanupPsCapture(
      command.absence_probe,
      "text/plain-exact-final-ps-stdout",
      "text/plain-exact-final-ps-stderr",
      `v1r11 cleanup command ${index + 1} absence probe`,
    );
    const derived = deriveV1R11LaterCleanupRows(capture.rawRows, expectedPreRows, runner);
    if (!sameJson(capture.rows, derived)) throw new Error(`v1r11 cleanup command ${index + 1} absence probe rows differ`);
    captures.push(capture);
  }
  const hasTarget = (capture: V1R11CleanupPsCapture) => capture.rows.some((row) => row.role !== "pid-reuse-nontarget");
  const hasSignalGroupTarget = (capture: V1R11CleanupPsCapture) =>
    runner !== null &&
    capture.rows.some(
      (row) => row.role !== "pid-reuse-nontarget" && row.pgid === runner.pgid,
    );
  const hasUnsafeGroupReuse = (capture: V1R11CleanupPsCapture) =>
    runner !== null &&
    capture.rows.some(
      (row) =>
        row.role === "pid-reuse-nontarget" && row.pgid === runner.pgid,
    );
  if (
    (commands[1]!.disposition === "executed") !==
      hasSignalGroupTarget(captures[0]!) ||
    (commands[2]!.disposition === "executed") !==
      hasSignalGroupTarget(captures[1]!) ||
    hasTarget(captures[2]!) ||
    hasUnsafeGroupReuse(captures[0]!) ||
    hasUnsafeGroupReuse(captures[1]!)
  ) {
    throw new Error("v1r11 cleanup command branch decision differs");
  }
  const service = exactObject(
    evidence.service_absence,
    ["command", "started_at_utc", "finished_at_utc", "started_monotonic_ns", "finished_monotonic_ns", "exit_code", "signal", "stdout", "stderr", "parsed_service_absent"],
    "v1r11 cleanup service absence",
  );
  validateV1R11IsoUtc(service.started_at_utc, "v1r11 cleanup service absence start");
  validateV1R11IsoUtc(service.finished_at_utc, "v1r11 cleanup service absence finish");
  const serviceStarted = validateV1R11CleanupMonotonic(service.started_monotonic_ns, "v1r11 cleanup service absence started_monotonic_ns");
  const serviceFinished = validateV1R11CleanupMonotonic(service.finished_monotonic_ns, "v1r11 cleanup service absence finished_monotonic_ns");
  const serviceStdout = validateV1R11CleanupRawTranscript(service.stdout, "text/plain-exact-command-stdout", "v1r11 cleanup service absence stdout");
  const serviceStderr = validateV1R11CleanupRawTranscript(service.stderr, "text/plain-exact-command-stderr", "v1r11 cleanup service absence stderr");
  const expectedServiceStderr = Buffer.from(`Bad request.\nCould not find service "${String(launch.label)}" in domain for user gui: ${String(launchAuthority.uid)}\n`, "utf8");
  if (
    !sameJson(service.command, ["/bin/launchctl", "print", `gui/${String(launchAuthority.uid)}/${String(launch.label)}`]) ||
    service.exit_code !== 113 || service.signal !== null || service.parsed_service_absent !== true ||
    serviceStdout.byteLength !== 0 ||
    serviceStderr.byteLength !== expectedServiceStderr.byteLength ||
    !timingSafeEqual(serviceStderr, expectedServiceStderr) ||
    serviceFinished < serviceStarted || Date.parse(String(service.finished_at_utc)) < Date.parse(String(service.started_at_utc))
  ) {
    throw new Error("v1r11 cleanup service absence differs");
  }
  const first = validateV1R11CleanupPsCapture(evidence.final_ps_first, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr", "v1r11 cleanup final ps first");
  const second = validateV1R11CleanupPsCapture(evidence.final_ps_second, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr", "v1r11 cleanup final ps second");
  const firstDerived = deriveV1R11LaterCleanupRows(first.rawRows, expectedPreRows, runner);
  const secondDerived = deriveV1R11LaterCleanupRows(second.rawRows, expectedPreRows, runner);
  if (!sameJson(first.rows, firstDerived) || !sameJson(second.rows, secondDerived)) {
    throw new Error("v1r11 cleanup final ps rows differ");
  }
  const timeline = [
    pre.finished,
    commandTimes[0]!.started,
    commandTimes[0]!.finished,
    captures[0]!.started,
    captures[0]!.finished,
    commandTimes[1]!.started,
    commandTimes[1]!.finished,
    captures[1]!.started,
    captures[1]!.finished,
    commandTimes[2]!.started,
    commandTimes[2]!.finished,
    captures[2]!.started,
    captures[2]!.finished,
    serviceStarted,
    serviceFinished,
    first.started,
    first.finished,
    second.started,
    second.finished,
  ];
  if (timeline.some((value, index) => index > 0 && value < timeline[index - 1]!)) {
    throw new Error("v1r11 cleanup monotonic timeline differs");
  }
  const wallTimeline = [
    pre.value.finished_at_utc,
    commands[0]!.started_at_utc,
    commands[0]!.finished_at_utc,
    captures[0]!.value.started_at_utc,
    captures[0]!.value.finished_at_utc,
    commands[1]!.started_at_utc,
    commands[1]!.finished_at_utc,
    captures[1]!.value.started_at_utc,
    captures[1]!.value.finished_at_utc,
    commands[2]!.started_at_utc,
    commands[2]!.finished_at_utc,
    captures[2]!.value.started_at_utc,
    captures[2]!.value.finished_at_utc,
    service.started_at_utc,
    service.finished_at_utc,
    first.value.started_at_utc,
    first.value.finished_at_utc,
    second.value.started_at_utc,
    second.value.finished_at_utc,
  ].map((value) => Date.parse(String(value)));
  if (
    wallTimeline.some(
      (value, index) =>
        !Number.isFinite(value) ||
        (index > 0 && value < wallTimeline[index - 1]!),
    )
  ) {
    throw new Error("v1r11 cleanup UTC timeline differs");
  }
  const finalGap = second.started - first.finished;
  const finalWallGap =
    Date.parse(String(second.value.started_at_utc)) -
    Date.parse(String(first.value.finished_at_utc));
  if (
    finalGap < 1_000_000_000n ||
    finalGap > 10_000_000_000n ||
    finalWallGap < 1_000 ||
    finalWallGap > 10_000
  ) {
    throw new Error("v1r11 cleanup final ps separation differs");
  }
  const remainingFirst = firstDerived.filter((row) => row.role !== "pid-reuse-nontarget");
  const remainingSecond = secondDerived.filter((row) => row.role !== "pid-reuse-nontarget");
  const remainingRows = validateV1R11CleanupProcessRows(evidence.remaining_process_rows, second.rawRows, "v1r11 cleanup remaining process rows");
  if (remainingFirst.length !== 0 || remainingSecond.length !== 0 || remainingRows.length !== 0) {
    throw new Error("v1r11 cleanup remaining process rows differ");
  }
  if (!Array.isArray(evidence.remaining_process_group_rows) || evidence.remaining_process_group_rows.length !== 0) {
    throw new Error("v1r11 cleanup remaining process groups differ");
  }
  const reuse = exactObject(evidence.pid_reuse_rejection, ["identity_tuple_fields", "checked_pids", "rejected_reuse_rows", "all_reuse_rejected"], "v1r11 cleanup PID reuse rejection");
  const checkedPids = [...new Set(expectedPreRows.map((row) => row.pid).concat(runner === null ? [] : [runner.pid]))].sort((a, b) => a - b);
  const reuseCandidates = captures
    .flatMap((capture) => deriveV1R11LaterCleanupRows(capture.rawRows, expectedPreRows, runner))
    .concat(firstDerived, secondDerived)
    .filter((row) => row.role === "pid-reuse-nontarget");
  const reuseByIdentity = new Map<string, V1R11CleanupProcessRow>();
  for (const row of reuseCandidates) {
    reuseByIdentity.set(
      `${row.pid}\0${row.pgid}\0${row.lstart}\0${row.executable}\0${row.role}`,
      row,
    );
  }
  const rejectedReuseRows = [...reuseByIdentity.values()].sort(
    (left, right) =>
      left.pid - right.pid ||
      Buffer.compare(Buffer.from(left.role), Buffer.from(right.role)),
  );
  if (
    !sameJson(reuse.identity_tuple_fields, ["pid", "pgid", "lstart", "executable"]) ||
    !sameJson(reuse.checked_pids, checkedPids) ||
    !sameJson(reuse.rejected_reuse_rows, rejectedReuseRows) ||
    reuse.all_reuse_rejected !== true
  ) {
    throw new Error("v1r11 cleanup PID reuse rejection differs");
  }
  const engineCount = expectedPreRows.filter((row) => row.role === "yaneuraou-engine").length;
  const summary = exactObject(evidence.process_cleanup, ["scheduling_stopped", "engines_terminated", "engines_reaped", "remaining_engine_pids"], "v1r11 cleanup summary");
  if (
    summary.scheduling_stopped !== true ||
    summary.engines_terminated !== engineCount ||
    summary.engines_reaped !== engineCount ||
    !sameJson(summary.remaining_engine_pids, [])
  ) {
    throw new Error("v1r11 cleanup summary recomputation differs");
  }
  validateV1R11IsoUtc(evidence.captured_at_utc, "v1r11 cleanup captured_at_utc");
  if (Date.parse(String(evidence.captured_at_utc)) < Date.parse(String(second.value.finished_at_utc))) {
    throw new Error("v1r11 cleanup captured_at_utc order differs");
  }
  if (context.verifyTrackedProducer) {
    validateV1R11TrackedImplementationIdentity(evidence.producer, context.sourceRevision, "v1r11 cleanup producer", "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts");
  } else {
    validateV1R11ImplementationIdentity(evidence.producer, context.sourceRevision, "v1r11 cleanup producer");
    if ((evidence.producer as Readonly<Record<string, unknown>>).entrypoint !== "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts") {
      throw new Error("v1r11 cleanup producer entrypoint differs");
    }
  }
  return Object.freeze({ ...summary });
}

/** Focused semantic seam; production additionally requires the fault binding and tracked closure. */
export function validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
  request: Readonly<{
    evidence: Readonly<Halfkp81Depth18PrivateSnapshot>;
    plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPlist: Readonly<Halfkp81Depth18PrivateSnapshot>;
    sourceRevision: string;
    runFingerprint: string;
    scope: "preformal" | "post-formal-environment";
  }>,
): Readonly<Record<string, unknown>> {
  const planValue = parseCanonicalDocument(request.plan, "v1r11 cleanup test plan");
  return validateV1R11ProcessCleanupEvidence(request.evidence, {
    plan: request.plan,
    planValue,
    launchAgentAuthority: request.launchAgentAuthority,
    launchAgentPlist: request.launchAgentPlist,
    sourceRevision: request.sourceRevision,
    runFingerprint: request.runFingerprint,
    scope: request.scope,
    verifyTrackedProducer: false,
  });
}

function validateV1R11FrozenDownstreamPlanContract(
  plan: Readonly<Record<string, unknown>>,
): void {
  const runIdentity = exactObject(
    plan.run_identity,
    [
      "new_clean_merged_source_revision_required",
      "new_run_fingerprint_required",
      "runtime_fingerprint_status",
      "must_differ_from_v1r10_run_fingerprint",
      "formal_run_intent_v2",
      "training_implementation_boundary",
    ],
    "v1r11 run identity contract",
  );
  if (
    !sameJson(runIdentity, {
      new_clean_merged_source_revision_required: true,
      new_run_fingerprint_required: true,
      runtime_fingerprint_status: "not-issued-before-clean-merged-v1r11-source",
      must_differ_from_v1r10_run_fingerprint:
        "d76ec02ecd721260c380c2a421b6bc7e9d689f37eaf8279e83d78b381390eba7",
      formal_run_intent_v2: runIdentity.formal_run_intent_v2,
      training_implementation_boundary:
        runIdentity.training_implementation_boundary,
    })
  ) {
    throw new Error("v1r11 frozen run identity contract differs");
  }
  const formalRunIntent = exactObject(
    runIdentity.formal_run_intent_v2,
    [
      "schema",
      "status",
      "purpose",
      "domain_utf8_without_separator",
      "domain_separator_hex",
      "canonicalization",
      "formula",
      "payload_required_fields",
      "payload_additional_fields_allowed",
      "payload_schema_value",
      "full_file_identity_required_fields",
      "selection_jsonl_identity_required_fields",
      "engine_required_fields",
      "payload_bindings",
      "planned_descriptor_constraints",
      "forbidden_fingerprint_inputs",
      "self_reference_rule",
      "post_fingerprint_cross_bindings",
      "runtime_formula_migration",
    ],
    "v1r11 formal run intent v2 contract",
  );
  if (
    formalRunIntent.schema !==
      "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2" ||
    formalRunIntent.domain_utf8_without_separator !==
      "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2" ||
    formalRunIntent.domain_separator_hex !== "00" ||
    formalRunIntent.payload_additional_fields_allowed !== false ||
    !sameJson(formalRunIntent.payload_required_fields, [
      "schema",
      "teacher_plan",
      "selection_jsonl",
      "selection_manifest",
      "source_revision",
      "engine",
      "teacher",
      "candidate_generation",
      "planned_final_launchagent_descriptor",
    ])
  ) {
    throw new Error("v1r11 formal run intent v2 contract differs");
  }
  const preformal = exactObject(
    plan.preformal_authority,
    [
      "classification",
      "status",
      "schemas",
      "schema_required_fields",
      "status_values",
      "paths",
      "gate_artifact_path_rule",
      "trusted_producer",
      "implementation_identity_contract",
      "staged_authority",
      "cross_gate_equations",
      "cross_gate_equation_validation",
      "github_primary_source_provenance_contract",
      "semantic_gate_requirements",
      "gate_contracts",
      "semantic_finalizer",
      "preformal_fault_contract",
      "outer_orchestrator_contract",
      "process_cleanup_evidence_contract",
      "launchagent_evidence",
      "downstream_binding_contracts",
      "finalization_order",
      "implementation_tests_required",
    ],
    "v1r11 preformal authority contract",
  );
  const outer = exactObject(
    preformal.outer_orchestrator_contract,
    [
      "entrypoint_exact",
      "preformal_component_entrypoint_exact",
      "formal_child_entrypoint_exact",
      "postformal_component_entrypoint_exact",
      "ownership_interval",
      "sole-owner-of-all-preformal-fault-publication",
      "inner-stage-a-stage-b-stage-c-finalizer-and-independent-verifier-components_may_publish-preformal-fault-or-cleanup-evidence",
      "inner_components_must-propagate-typed-failures-only",
      "typed_failure_required_fields",
      "typed_failure_runner_state_values",
      "typed_failure_error_required_fields",
      "typed_failure_artifacts_required_fields",
      "typed_failure_active_launchagent_required_fields",
      "typed_failure_runner_identity_required_fields",
      "typed_failure_artifact_branch_contract",
      "fault_finalization_order",
      "runner_null_policy",
      "runner_null_launchagent_binding",
      "runner_active_policy",
      "runner_active_launchagent_binding",
      "legacy-direct-inner-fault-publication-accepted",
      "producer_required_fields",
      "producer_dependency_closure_entry_required_fields",
      "dependency_closure_order",
      "tests_required",
    ],
    "v1r11 outer orchestrator contract",
  );
  const nullBinding = exactObject(
    outer.runner_null_launchagent_binding,
    [
      "descriptor_owner",
      "creation_time",
      "label",
      "plist_snapshot",
      "plist_snapshot_path",
      "stage_c_reuse_policy",
      "live-launchagent-authority-evidence-required",
      "may_claim-live-runner-or-formal-authority",
      "cleanup_use",
    ],
    "v1r11 runner-null LaunchAgent binding",
  );
  const artifactBranches = exactObject(
    outer.typed_failure_artifact_branch_contract,
    ["not-created", "active", "launchAgentAuthority", "partialArtifacts"],
    "v1r11 typed failure artifact branch contract",
  );
  if (
    outer.entrypoint_exact !==
      "ml/run-halfkp81-depth18-v1r11-production-outer.ts" ||
    outer.preformal_component_entrypoint_exact !==
      "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts" ||
    outer.formal_child_entrypoint_exact !==
      "ml/run-halfkp81-depth18-v1r11-formal-child.ts" ||
    outer.postformal_component_entrypoint_exact !==
      "ml/run-halfkp81-depth18-v1r11-postformal-supervisor.ts" ||
    outer["sole-owner-of-all-preformal-fault-publication"] !== true ||
    outer[
      "inner-stage-a-stage-b-stage-c-finalizer-and-independent-verifier-components_may_publish-preformal-fault-or-cleanup-evidence"
    ] !== false ||
    outer["inner_components_must-propagate-typed-failures-only"] !== true ||
    !sameJson(outer.typed_failure_required_fields, [
      "phase",
      "gate",
      "sequence",
      "runner_state",
      "error",
      "artifacts",
    ]) ||
    !sameJson(outer.typed_failure_runner_state_values, [
      "not-created",
      "active",
    ]) ||
    !sameJson(outer.typed_failure_error_required_fields, [
      "kind",
      "message",
      "exit_code",
      "signal",
    ]) ||
    !sameJson(outer.typed_failure_artifacts_required_fields, [
      "ledgerPrefix",
      "lastGateReceipt",
      "engineGateVerifiedReceipt",
      "launchAgentAuthority",
      "activeLaunchAgent",
      "runnerIdentity",
      "partialArtifacts",
    ]) ||
    !sameJson(outer.typed_failure_active_launchagent_required_fields, [
      "label",
      "plistSnapshot",
    ]) ||
    !sameJson(outer.typed_failure_runner_identity_required_fields, [
      "pid",
      "pgid",
      "lstart",
    ]) ||
    artifactBranches["not-created"] !==
      "runnerIdentity-null;activeLaunchAgent-null;outer-planned-descriptor-is-the-only-cleanup-LaunchAgent-binding" ||
    artifactBranches.active !==
      "runnerIdentity-and-activeLaunchAgent-both-nonnull;cleanup-input-must-exactly-equal-both;activeLaunchAgent.plistSnapshot-and-all-nonnull-artifact-identities-must-be-held-read-before-cleanup" ||
    artifactBranches.launchAgentAuthority !==
      "nullable-before-final-Stage-C-evidence;when-nonnull-it-must-be-held-read-and-semantically-cross-bound-to-activeLaunchAgent-label-and-plistSnapshot" ||
    artifactBranches.partialArtifacts !==
      "exact-array-of-full-file-identities;every-entry-held-read-before-cleanup-and-fault-publication" ||
    nullBinding.descriptor_owner !== "outer-orchestrator" ||
    nullBinding.creation_time !== "before-first-Stage-A-operation" ||
    nullBinding.label !==
      "deterministic-final-formal-one-shot-label-derived-from-family-and-source-revision" ||
    nullBinding.plist_snapshot !==
      "create-only-private-held-planned-formal-one-shot-plist-snapshot-created-before-Stage-A" ||
    nullBinding.plist_snapshot_path !==
      "$HOME/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority/launchagent.plist.snapshot" ||
    nullBinding.stage_c_reuse_policy !==
      "do-not-rewrite;held-reread-the-same-planned-snapshot-and-require-exact-byte-equality-with-the-live-source-plist-before-final-LaunchAgent-evidence" ||
    nullBinding[
      "live-launchagent-authority-evidence-required"
    ] !== false ||
    nullBinding["may_claim-live-runner-or-formal-authority"] !== false ||
    nullBinding.cleanup_use !==
      "bootout-planned-label-then-held-service-absence-and-process-absence-with-runner_identity-null" ||
    outer.runner_null_policy !==
      "allowed-only-for-bound-not-created-state-before-runner-admission-and-still-requires-rich-cleanup-evidence-before-fault-publication" ||
    outer.runner_active_policy !==
      "requires-full-pid-pgid-lstart-identity-ordered-bootout-TERM-conditional-KILL-service-absence-pid-reuse-rejection-and-dual-final-ps-before-fault-publication" ||
    outer.runner_active_launchagent_binding !==
      "exact-active-phase-LaunchAgent-label-and-held-plist-snapshot-owned-by-the-outer-orchestrator;Stage-B-Stage-C-or-formal-as-applicable;never-substitute-the-planned-runner-null-descriptor-for-an-active-runner" ||
    outer["legacy-direct-inner-fault-publication-accepted"] !== false
  ) {
    throw new Error("v1r11 frozen outer orchestrator contract differs");
  }
  const downstream = exactObject(
    preformal.downstream_binding_contracts,
    [
      "full_file_identity_required_everywhere",
      "power_ledger_entry",
      "power_receipt",
      "teacher_work_header",
      "raw_teacher_receipt",
      "verified_artifact_receipt",
      "environment_terminal_fault",
      "authority_values",
      "formal_like_power_epoch_separation",
    ],
    "v1r11 downstream binding contract",
  );
  if (
    !sameJson(downstream.full_file_identity_required_everywhere, [
      "path",
      "bytes",
      "sha256",
      "schema",
    ]) ||
    !sameJson(downstream.power_ledger_entry, {
      schema: HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
      status_values: [
        "admission-pass",
        "sample-pass",
        "final-pass",
        "environment-fault",
      ],
      required_fields: HALFKP81_V1R11_POWER_ENTRY_FIELDS,
    }) ||
    !sameJson(downstream.power_receipt, {
      schema: HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
      status_values: ["power-continuity-verified", "environment-fault-closed"],
      required_fields: HALFKP81_V1R11_POWER_RECEIPT_FIELDS,
    }) ||
    !sameJson(downstream.teacher_work_header, {
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
      status_values: ["formal-work-ledger-open"],
      required_fields: HALFKP81_V1R11_WORK_HEADER_FIELDS,
    }) ||
    !sameJson(downstream.raw_teacher_receipt, {
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11,
      status_values: ["complete-unverified-no-training-authority"],
      required_fields: HALFKP81_V1R11_RAW_TEACHER_RECEIPT_FIELDS,
    }) ||
    !sameJson(downstream.verified_artifact_receipt, {
      schema:
        HALFKP81_DEPTH18_YANEURA_ONLY_VERIFIED_ARTIFACT_RECEIPT_SCHEMA_V1R11,
      status_values: [
        "teacher-artifacts-and-authority-chain-independently-verified-training-only-authority",
      ],
      required_fields: HALFKP81_V1R11_VERIFIED_ARTIFACT_RECEIPT_FIELDS,
    }) ||
    !sameJson(downstream.environment_terminal_fault, {
      schema: HALFKP81_V1R11_ENVIRONMENT_FAULT_SCHEMA,
      status_values: ["environment-continuity-fault-family-closed"],
      required_fields: HALFKP81_V1R11_ENVIRONMENT_FAULT_FIELDS,
    }) ||
    !sameJson(downstream.authority_values, {
      raw_teacher_receipt: {
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
      verified_artifact_receipt: {
        may_train_fixed_v1r11_candidate: true,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
      environment_terminal_fault: {
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    })
  ) {
    throw new Error("v1r11 frozen downstream binding contract differs");
  }
}

function validateV1R11FileIdentityShape(
  value: unknown,
  schema: string | undefined,
  label: string,
): void {
  const identity = exactObject(
    value,
    ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (
    typeof identity.path !== "string" ||
    !path.isAbsolute(identity.path) ||
    path.normalize(identity.path) !== identity.path ||
    !Number.isSafeInteger(identity.bytes) ||
    Number(identity.bytes) < 1 ||
    typeof identity.sha256 !== "string" ||
    !SHA256_RE.test(identity.sha256) ||
    typeof identity.schema !== "string" ||
    identity.schema.length < 1 ||
    (schema !== undefined && identity.schema !== schema)
  ) {
    throw new Error(`${label} differs`);
  }
}

export type Halfkp81Depth18V1R11FrozenDownstreamDocumentKind =
  | "launchagent-authority"
  | "preformal-verified"
  | "teacher-work-header"
  | "power-ledger-entry"
  | "power-receipt"
  | "raw-teacher-receipt"
  | "verified-artifact-receipt"
  | "environment-terminal-fault";

/** Focused schema seam; production additionally verifies held bytes and chains. */
export function validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
  kind: Halfkp81Depth18V1R11FrozenDownstreamDocumentKind,
  value: unknown,
): void {
  const row = exactObject(
    value,
    kind === "launchagent-authority"
      ? HALFKP81_V1R11_LAUNCHAGENT_FIELDS
      : kind === "preformal-verified"
        ? HALFKP81_V1R11_PREFORMAL_VERIFIED_FIELDS
        : kind === "teacher-work-header"
          ? HALFKP81_V1R11_WORK_HEADER_FIELDS
          : kind === "power-ledger-entry"
            ? HALFKP81_V1R11_POWER_ENTRY_FIELDS
            : kind === "power-receipt"
              ? HALFKP81_V1R11_POWER_RECEIPT_FIELDS
              : kind === "raw-teacher-receipt"
                ? HALFKP81_V1R11_RAW_TEACHER_RECEIPT_FIELDS
                : kind === "verified-artifact-receipt"
                  ? HALFKP81_V1R11_VERIFIED_ARTIFACT_RECEIPT_FIELDS
                  : HALFKP81_V1R11_ENVIRONMENT_FAULT_FIELDS,
    `v1r11 frozen ${kind}`,
  );
  const expected =
    kind === "launchagent-authority"
      ? [
          HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
          "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority",
        ]
      : kind === "preformal-verified"
        ? [
            HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
            "all-required-preformal-gates-independently-verified-formal-only-authority",
          ]
        : kind === "teacher-work-header"
          ? [
              HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
              "formal-work-ledger-open",
            ]
          : kind === "power-ledger-entry"
            ? [HALFKP81_V1R11_POWER_LEDGER_SCHEMA, undefined]
            : kind === "power-receipt"
              ? [HALFKP81_V1R11_POWER_RECEIPT_SCHEMA, undefined]
              : kind === "raw-teacher-receipt"
                ? [
                    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11,
                    "complete-unverified-no-training-authority",
                  ]
                : kind === "verified-artifact-receipt"
                  ? [
                      HALFKP81_DEPTH18_YANEURA_ONLY_VERIFIED_ARTIFACT_RECEIPT_SCHEMA_V1R11,
                      "teacher-artifacts-and-authority-chain-independently-verified-training-only-authority",
                    ]
                  : [
                      HALFKP81_V1R11_ENVIRONMENT_FAULT_SCHEMA,
                      "environment-continuity-fault-family-closed",
                    ];
  if (
    row.schema !== expected[0] ||
    (expected[1] !== undefined && row.status !== expected[1]) ||
    (kind === "power-ledger-entry" &&
      ![
        "admission-pass",
        "sample-pass",
        "final-pass",
        "environment-fault",
      ].includes(String(row.status))) ||
    (kind === "power-receipt" &&
      !["power-continuity-verified", "environment-fault-closed"].includes(
        String(row.status),
      ))
  ) {
    throw new Error(`v1r11 frozen ${kind} schema/status differs`);
  }
  if (
    kind === "power-ledger-entry" &&
    !sameJson(
      [row.status, row.entry_kind],
      row.status === "admission-pass"
        ? ["admission-pass", "admission"]
        : row.status === "sample-pass"
          ? ["sample-pass", "sample"]
          : row.status === "final-pass"
            ? ["final-pass", "final"]
            : ["environment-fault", "environment-fault"],
    )
  ) {
    throw new Error("v1r11 frozen power entry kind/status differs");
  }
  if ("teacher_plan" in row) {
    validateV1R11FileIdentityShape(
      row.teacher_plan,
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11,
      `v1r11 frozen ${kind}.teacher_plan`,
    );
  }
  if (kind === "launchagent-authority") {
    validateV1R11FileIdentityShape(
      row.ps_stdout,
      "text/plain-exact-launchagent-ps-stdout",
      "v1r11 frozen LaunchAgent ps stdout",
    );
    validateV1R11FileIdentityShape(
      row.ps_stderr,
      "text/plain-exact-launchagent-ps-stderr",
      "v1r11 frozen LaunchAgent ps stderr",
    );
  }
  if (kind === "teacher-work-header") {
    validateV1R11FileIdentityShape(
      row.launchagent_authority_evidence,
      HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
      "v1r11 frozen work header LaunchAgent evidence",
    );
    validateV1R11FileIdentityShape(
      row.preformal_authority_verified_receipt,
      HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
      "v1r11 frozen work header preformal receipt",
    );
    if (row.record_kind !== "header") {
      throw new Error("v1r11 frozen work header record kind differs");
    }
    validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
      "power-ledger-entry",
      row.power_admission_entry,
    );
  }
  if (kind === "power-receipt") {
    validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
      "power-ledger-entry",
      row.admission_entry,
    );
    validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
      "power-ledger-entry",
      row.final_entry,
    );
  }
  const identityFields: Readonly<Record<string, string | undefined>> =
    kind === "launchagent-authority"
      ? {
          launchctl_print: "text/plain-utf8-exact-command-stdout",
          launchctl_stderr: "text/plain-utf8-exact-command-stderr",
          plist_snapshot: "application/x-apple-aspen-config-exact-bytes",
        }
      : kind === "preformal-verified"
        ? {
            ledger: HALFKP81_V1R11_PREFORMAL_LEDGER_SCHEMA,
            raw_receipt: HALFKP81_V1R11_PREFORMAL_RAW_AUTHORITY_SCHEMA,
            launchagent_authority:
              HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
          }
        : kind === "power-ledger-entry"
          ? {
              launchagent_authority_evidence:
                HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
              preformal_authority_verified_receipt:
                HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
            }
          : kind === "power-receipt"
            ? {
                power_ledger: HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
                launchagent_authority_evidence:
                  HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
                preformal_authority_verified_receipt:
                  HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
              }
            : kind === "raw-teacher-receipt"
              ? {
                  teacher_work:
                    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
                  preformal_authority_ledger:
                    HALFKP81_V1R11_PREFORMAL_LEDGER_SCHEMA,
                  preformal_authority_raw_receipt:
                    HALFKP81_V1R11_PREFORMAL_RAW_AUTHORITY_SCHEMA,
                  preformal_authority_verified_receipt:
                    HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
                  launchagent_authority_evidence:
                    HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
                  power_continuity_ledger: HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
                  power_continuity_receipt: HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
                }
              : kind === "verified-artifact-receipt"
                ? {
                    raw_teacher_receipt:
                      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11,
                    teacher_work:
                      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
                    preformal_authority_ledger:
                      HALFKP81_V1R11_PREFORMAL_LEDGER_SCHEMA,
                    preformal_authority_raw_receipt:
                      HALFKP81_V1R11_PREFORMAL_RAW_AUTHORITY_SCHEMA,
                    preformal_authority_verified_receipt:
                      HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
                    launchagent_authority_evidence:
                      HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
                    power_continuity_ledger: HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
                    power_continuity_receipt:
                      HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
                  }
                : kind === "environment-terminal-fault"
                  ? {
                      preformal_authority_verified_receipt:
                        HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
                      launchagent_authority_evidence:
                        HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
                      power_continuity_ledger:
                        HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
                      power_continuity_receipt:
                        HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
                      process_cleanup_evidence:
                        HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA,
                    }
                  : {};
  for (const [field, schema] of Object.entries(identityFields)) {
    validateV1R11FileIdentityShape(
      row[field],
      schema,
      `v1r11 frozen ${kind}.${field}`,
    );
  }
  if (kind === "raw-teacher-receipt" || kind === "verified-artifact-receipt") {
    const teacherOutput = exactObject(
      row.teacher_output,
      ROLE_ORDER,
      `v1r11 frozen ${kind}.teacher_output`,
    );
    for (const role of ROLE_ORDER) {
      validateV1R11FileIdentityShape(
        teacherOutput[role],
        HALFKP81_DEPTH18_DATASET_SCHEMA,
        `v1r11 frozen ${kind}.teacher_output.${role}`,
      );
    }
  }
  const falseAuthority = {
    may_train: false,
    may_play_formal_games: false,
    may_write_live_weights: false,
  };
  if (
    kind === "preformal-verified" &&
    !sameJson(row.authority, {
      may_execute_formal_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error("v1r11 frozen preformal verified authority differs");
  }
  if (
    (kind === "raw-teacher-receipt" || kind === "environment-terminal-fault") &&
    !sameJson(row.authority, falseAuthority)
  ) {
    throw new Error(`v1r11 frozen ${kind} authority differs`);
  }
  if (
    kind === "verified-artifact-receipt" &&
    !sameJson(row.authority, {
      may_train_fixed_v1r11_candidate: true,
      may_play_formal_games: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error("v1r11 frozen verified receipt authority differs");
  }
}

export function validateHalfkp81Depth18V1R11FrozenDownstreamPlanForTests(
  value: unknown,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("v1r11 teacher plan is not an object");
  }
  validateV1R11FrozenDownstreamPlanContract(
    value as Readonly<Record<string, unknown>>,
  );
}

function validateV1R11LaunchAgentProcessEvidence(
  launch: Readonly<Record<string, unknown>>,
  psStdout: Readonly<Halfkp81Depth18PrivateSnapshot>,
  psStderr: Readonly<Halfkp81Depth18PrivateSnapshot>,
  plan: Readonly<Record<string, unknown>>,
): void {
  if (
    !sameJson(launch.ps_command, HALFKP81_V1R11_CLEANUP_PS_COMMAND) ||
    launch.ps_exit_code !== 0
  ) {
    throw new Error("v1r11 LaunchAgent ps command outcome differs");
  }
  validateV1R11FullIdentity(
    launch.ps_stdout,
    psStdout,
    "text/plain-exact-launchagent-ps-stdout",
    "v1r11 LaunchAgent ps stdout",
  );
  validateV1R11FullIdentity(
    launch.ps_stderr,
    psStderr,
    "text/plain-exact-launchagent-ps-stderr",
    "v1r11 LaunchAgent ps stderr",
  );
  if (psStderr.bytes.byteLength !== 0) {
    throw new Error("v1r11 LaunchAgent ps stderr is not empty");
  }
  const rawRows = parseV1R11CleanupPsRows(
    Buffer.from(psStdout.bytes),
    "v1r11 LaunchAgent held ps stdout",
  );
  const declaredRow = (
    value: unknown,
    role: "runner" | "assertion-holder",
    label: string,
  ): V1R11CleanupProcessRow => {
    const row = exactObject(
      value,
      HALFKP81_V1R11_CLEANUP_PROCESS_ROW_FIELDS,
      label,
    );
    if (
      row.role !== role ||
      !Number.isSafeInteger(row.pid) ||
      Number(row.pid) < 1 ||
      !Number.isSafeInteger(row.ppid) ||
      Number(row.ppid) < 0 ||
      !Number.isSafeInteger(row.pgid) ||
      Number(row.pgid) < 1 ||
      typeof row.lstart !== "string" ||
      row.lstart.length < 1 ||
      typeof row.executable !== "string" ||
      row.executable.length < 1 ||
      typeof row.argv !== "string" ||
      row.argv.length < 1
    ) {
      throw new Error(`${label} differs`);
    }
    const typed = row as unknown as V1R11CleanupProcessRow;
    const matches = rawRows.filter(
      (raw) =>
        raw.pid === typed.pid &&
        raw.ppid === typed.ppid &&
        raw.pgid === typed.pgid &&
        raw.lstart === typed.lstart &&
        raw.executable === typed.executable &&
        raw.argv === typed.argv,
    );
    if (matches.length !== 1) {
      throw new Error(`${label} is not uniquely recomputed from held ps stdout`);
    }
    return Object.freeze({ ...typed });
  };
  const runner = declaredRow(
    launch.runner_process,
    "runner",
    "v1r11 LaunchAgent runner process",
  );
  const holder = declaredRow(
    launch.assertion_holder_process,
    "assertion-holder",
    "v1r11 LaunchAgent assertion holder process",
  );
  const holderDeclaration = exactObject(
    launch.caffeinate_holder,
    ["pid", "parent_runner_pid", "assertion_owner_pid", "executable", "argv"],
    "v1r11 LaunchAgent caffeinate holder",
  );
  if (
    !Array.isArray(launch.runner_utility_argv) ||
    launch.runner_utility_argv.length < 1 ||
    launch.runner_utility_argv.some(
      (argument) => typeof argument !== "string" || argument.length < 1,
    ) ||
    !Array.isArray(launch.program_arguments) ||
    launch.program_arguments.length < 1 ||
    launch.program_arguments.some(
      (argument) => typeof argument !== "string" || argument.length < 1,
    )
  ) {
    throw new Error("v1r11 LaunchAgent process argv differs");
  }
  const runnerArgv = launch.runner_utility_argv.join(" ");
  const expectedHolderArguments = Object.freeze([
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    String(runner.pid),
  ]);
  const holderArgv = expectedHolderArguments.join(" ");
  if (
    !sameJson(launch.program_arguments, launch.runner_utility_argv) ||
    runner.pid !== launch.runner_pid ||
    runner.pgid !== runner.pid ||
    runner.executable !== launch.runner_utility_argv[0] ||
    runner.argv !== runnerArgv ||
    holder.pid !== holderDeclaration.pid ||
    holder.ppid !== runner.pid ||
    holder.pgid !== runner.pgid ||
    holder.executable !== "/usr/bin/caffeinate" ||
    holder.argv !== holderArgv ||
    holderDeclaration.parent_runner_pid !== runner.pid ||
    holderDeclaration.assertion_owner_pid !== holder.pid ||
    holderDeclaration.executable !== holder.executable ||
    !sameJson(holderDeclaration.argv, expectedHolderArguments)
  ) {
    throw new Error("v1r11 LaunchAgent process topology differs");
  }
  const targetPids = new Set<number>([runner.pid]);
  let discoveredDescendant = true;
  while (discoveredDescendant) {
    discoveredDescendant = false;
    for (const row of rawRows) {
      if (!targetPids.has(row.pid) && targetPids.has(row.ppid)) {
        targetPids.add(row.pid);
        discoveredDescendant = true;
      }
    }
  }
  const groupRows = rawRows.filter(
    (row) =>
      row.pgid === runner.pgid ||
      targetPids.has(row.pid) ||
      row.pid === holder.pid,
  );
  const expectedGroup = [runner, holder];
  if (
    !sameJson(launch.observed_process_group_rows, expectedGroup) ||
    groupRows.length !== 2 ||
    !groupRows.every((raw) =>
      expectedGroup.some(
        (row) =>
          row.pid === raw.pid &&
          row.ppid === raw.ppid &&
          row.pgid === raw.pgid &&
          row.lstart === raw.lstart &&
          row.executable === raw.executable &&
          row.argv === raw.argv,
      ),
    )
  ) {
    throw new Error("v1r11 LaunchAgent observed process group differs");
  }
  if (plan.engine === null || typeof plan.engine !== "object" || Array.isArray(plan.engine)) {
    throw new Error("v1r11 engine differs");
  }
  const engine = plan.engine as Readonly<Record<string, unknown>>;
  const binary = exactObject(engine.binary, ["path", "bytes", "sha256"], "v1r11 engine binary");
  const enginePath = requiredText(binary.path, "v1r11 engine binary path");
  const engineRows = rawRows.filter(
    (row) =>
      row.executable === enginePath ||
      row.argv === enginePath ||
      row.argv.startsWith(`${enginePath} `),
  );
  if (!sameJson(launch.observed_yaneuraou_engine_rows, []) || engineRows.length !== 0) {
    throw new Error("v1r11 LaunchAgent preliminary observation contains an engine");
  }
}

/** Focused held-ps seam; production additionally binds all authority artifacts. */
export function validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests(
  request: Readonly<{
    launchAgentAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPsStdout: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPsStderr: Readonly<Halfkp81Depth18PrivateSnapshot>;
    plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
  }>,
): void {
  const launch = parseCanonicalDocument(
    request.launchAgentAuthority,
    "v1r11 test LaunchAgent authority",
  );
  exactObject(
    launch,
    HALFKP81_V1R11_LAUNCHAGENT_FIELDS,
    "v1r11 test LaunchAgent authority",
  );
  const plan = parseCanonicalDocument(request.plan, "v1r11 test teacher plan");
  validateV1R11LaunchAgentProcessEvidence(
    launch,
    request.launchAgentPsStdout,
    request.launchAgentPsStderr,
    plan,
  );
}

/** Focused FINAL topology seam: plist, launchctl and held ps are all bound. */
export function validateHalfkp81Depth18V1R11FinalLaunchAgentTopologyForTests(
  request: Readonly<{
    launchAgentAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPlist: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchctlPrint: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPsStdout: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPsStderr: Readonly<Halfkp81Depth18PrivateSnapshot>;
    plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
  }>,
): void {
  const launch = parseCanonicalDocument(
    request.launchAgentAuthority,
    "v1r11 test final LaunchAgent authority",
  );
  exactObject(
    launch,
    HALFKP81_V1R11_LAUNCHAGENT_FIELDS,
    "v1r11 test final LaunchAgent authority",
  );
  validateV1R11FullIdentity(
    launch.plist_snapshot,
    request.launchAgentPlist,
    "application/x-apple-aspen-config-exact-bytes",
    "v1r11 test final LaunchAgent plist",
  );
  validateV1R11FullIdentity(
    launch.launchctl_print,
    request.launchctlPrint,
    "text/plain-utf8-exact-command-stdout",
    "v1r11 test final LaunchAgent launchctl stdout",
  );
  if (
    !Array.isArray(launch.runner_utility_argv) ||
    !sameJson(launch.program_arguments, launch.runner_utility_argv) ||
    !sameJson(
      parseV1R11PlistProgramArguments(
        request.launchAgentPlist.bytes,
        "v1r11 test final LaunchAgent plist",
      ),
      launch.runner_utility_argv,
    )
  ) {
    throw new Error("v1r11 test final LaunchAgent node ProgramArguments differ");
  }
  validateV1R11FinalLaunchctlTopology(request.launchctlPrint.bytes, launch);
  const plan = parseCanonicalDocument(request.plan, "v1r11 test teacher plan");
  validateV1R11LaunchAgentProcessEvidence(
    launch,
    request.launchAgentPsStdout,
    request.launchAgentPsStderr,
    plan,
  );
}

function validateV1R11FormalAuthoritySnapshots(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  runFingerprint: string,
): void {
  const evidence = request.powerContinuity;
  if (evidence === undefined) {
    throw new Error("v1r11 formal authority snapshots are missing");
  }
  const {
    launchctlPrint,
    launchctlStderr,
    launchAgentPlist,
    launchAgentPsStdout,
    launchAgentPsStderr,
    preformalLedger,
    preformalRawReceipt,
  } = evidence;
  if (
    launchctlPrint === undefined ||
    launchctlStderr === undefined ||
    launchAgentPlist === undefined ||
    launchAgentPsStdout === undefined ||
    launchAgentPsStderr === undefined ||
    preformalLedger === undefined ||
    preformalRawReceipt === undefined
  ) {
    throw new Error(
      "v1r11 complete downstream authority snapshots are missing",
    );
  }
  validateV1R11FrozenDownstreamPlanContract(plan);
  const authorityOutputs = exactV1R11AuthorityOutputNamespace(
    plan.authority_output_namespace,
  );
  const launch = parseCanonicalDocument(
    evidence.launchAgentAuthority,
    "v1r11 LaunchAgent authority evidence",
  );
  exactObject(
    launch,
    HALFKP81_V1R11_LAUNCHAGENT_FIELDS,
    "v1r11 LaunchAgent authority evidence",
  );
  if (
    launch.schema !== HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA ||
    launch.status !==
      "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority" ||
    launch.source_revision !== plan.source_revision ||
    launch.run_fingerprint !== runFingerprint ||
    launch.launchctl_exit_code !== 0 ||
    !Number.isSafeInteger(launch.uid) ||
    Number(launch.uid) < 0 ||
    !Number.isSafeInteger(launch.runner_pid) ||
    Number(launch.runner_pid) < 1
  ) {
    throw new Error("v1r11 LaunchAgent authority semantics differ");
  }
  validateDeclaredIdentity(
    launch.teacher_plan,
    request.plan,
    "v1r11 LaunchAgent authority teacher plan",
    { schema: plan.schema as TeacherPlanSchema },
  );
  validateV1R11FullIdentity(
    launch.launchctl_print,
    launchctlPrint,
    "text/plain-utf8-exact-command-stdout",
    "v1r11 LaunchAgent launchctl stdout",
  );
  validateV1R11FullIdentity(
    launch.launchctl_stderr,
    launchctlStderr,
    "text/plain-utf8-exact-command-stderr",
    "v1r11 LaunchAgent launchctl stderr",
  );
  validateV1R11FullIdentity(
    launch.plist_snapshot,
    launchAgentPlist,
    "application/x-apple-aspen-config-exact-bytes",
    "v1r11 LaunchAgent plist snapshot",
  );
  if (
    !Array.isArray(launch.program_arguments) ||
    !Array.isArray(launch.runner_utility_argv) ||
    !sameJson(launch.program_arguments, launch.runner_utility_argv) ||
    !sameJson(
      parseV1R11PlistProgramArguments(
        launchAgentPlist.bytes,
        "v1r11 final LaunchAgent plist",
      ),
      launch.runner_utility_argv,
    )
  ) {
    throw new Error("v1r11 final LaunchAgent node ProgramArguments differ");
  }
  validateV1R11FinalLaunchctlTopology(launchctlPrint.bytes, launch);
  validateV1R11LaunchAgentProcessEvidence(
    launch,
    launchAgentPsStdout,
    launchAgentPsStderr,
    plan,
  );
  validateV1R11TrackedImplementationIdentity(
    launch.producer,
    plan.source_revision as string,
    "v1r11 LaunchAgent producer",
    "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
  );
  if (
    v1r11AuthorityPath(
      authorityOutputs.preformal_authority_ledger_jsonl,
      "v1r11 preformal ledger path",
    ) !== preformalLedger.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.preformal_authority_receipt_json,
      "v1r11 preformal raw receipt path",
    ) !== preformalRawReceipt.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.preformal_authority_verified_receipt_json,
      "v1r11 preformal verified receipt path",
    ) !== evidence.preformalAuthority.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.launchagent_authority_evidence_json,
      "v1r11 LaunchAgent evidence path",
    ) !== evidence.launchAgentAuthority.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.launchagent_launchctl_print_txt,
      "v1r11 launchctl stdout path",
    ) !== launchctlPrint.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.launchagent_launchctl_print_stderr_txt,
      "v1r11 launchctl stderr path",
    ) !== launchctlStderr.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.launchagent_plist_snapshot,
      "v1r11 LaunchAgent plist snapshot path",
    ) !== launchAgentPlist.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.launchagent_ps_stdout_txt,
      "v1r11 LaunchAgent ps stdout path",
    ) !== launchAgentPsStdout.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.launchagent_ps_stderr_txt,
      "v1r11 LaunchAgent ps stderr path",
    ) !== launchAgentPsStderr.identity.path
  ) {
    throw new Error("v1r11 LaunchAgent raw capture paths differ");
  }
  const preformal = parseCanonicalDocument(
    evidence.preformalAuthority,
    "v1r11 verified preformal authority",
  );
  exactObject(
    preformal,
    HALFKP81_V1R11_PREFORMAL_VERIFIED_FIELDS,
    "v1r11 verified preformal authority",
  );
  if (
    preformal.schema !== HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA ||
    preformal.status !==
      "all-required-preformal-gates-independently-verified-formal-only-authority" ||
    preformal.source_revision !== plan.source_revision ||
    preformal.run_fingerprint !== runFingerprint ||
    !sameJson(preformal.authority, {
      may_execute_formal_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error("v1r11 verified preformal authority semantics differ");
  }
  validateDeclaredIdentity(
    preformal.teacher_plan,
    request.plan,
    "v1r11 verified preformal teacher plan",
    { schema: plan.schema as TeacherPlanSchema },
  );
  validateV1R11FullIdentity(
    preformal.ledger,
    preformalLedger,
    HALFKP81_V1R11_PREFORMAL_LEDGER_SCHEMA,
    "v1r11 verified preformal ledger",
  );
  validateV1R11FullIdentity(
    preformal.raw_receipt,
    preformalRawReceipt,
    HALFKP81_V1R11_PREFORMAL_RAW_AUTHORITY_SCHEMA,
    "v1r11 verified preformal raw receipt",
  );
  validateV1R11FullIdentity(
    preformal.launchagent_authority,
    evidence.launchAgentAuthority,
    HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
    "v1r11 verified preformal LaunchAgent authority",
  );
  validateV1R11TrackedImplementationIdentity(
    preformal.verifier,
    plan.source_revision as string,
    "v1r11 verified preformal verifier",
    "ml/verify-halfkp81-depth18-v1r11-staged-authority.ts",
  );
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function stableParentPayloadSha256(
  parent: Readonly<FloodgateTrainingParent>,
): string {
  return sha256(
    `shogi-floodgate-stable-parent-v1\0${canonicalHalfkp81Depth18Json({
      schema_version: parent.schema_version,
      game_id: parent.game_id,
      parent_id: parent.parent_id,
      position_id: parent.position_id,
      parent_sfen: parent.parent_sfen,
      ply: parent.ply,
      played_move: parent.played_move,
    })}`,
  );
}

function parseSelectionRow(
  value: unknown,
  index: number,
): Readonly<Halfkp81Depth18TeacherSelectionRow> {
  const label = `selection line ${index + 1}`;
  const row = exactObject(
    value,
    [
      "schema",
      "source_game_id",
      "game_id",
      "source_game_sha256",
      "position_id",
      "sfen",
      "recorded_move",
      "side_to_move",
      "ply",
      "phase",
      "old_depth12_cp",
      "old_outcome",
      "old_depth12_signals_usage",
      "minimum_player_rating",
      "sente_rating",
      "gote_rating",
      "legal_move_count",
      "hardness_cp_outcome_surprise",
      "hardness_tiebreak_sha256",
      "role",
    ],
    label,
  );
  if (
    row.schema !== HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA ||
    !SEMANTIC_ID_RE.test(requiredText(row.game_id, `${label}.game_id`)) ||
    row.source_game_id !== row.game_id ||
    !SHA256_RE.test(
      requiredText(row.source_game_sha256, `${label}.source_game_sha256`),
    ) ||
    !SEMANTIC_ID_RE.test(
      requiredText(row.position_id, `${label}.position_id`),
    ) ||
    !SHA256_RE.test(
      requiredText(
        row.hardness_tiebreak_sha256,
        `${label}.hardness_tiebreak_sha256`,
      ),
    ) ||
    (row.side_to_move !== "b" && row.side_to_move !== "w") ||
    !ROLE_ORDER.includes(row.role as TeacherRole) ||
    !["opening", "mid", "late"].includes(row.phase as string) ||
    row.old_depth12_signals_usage !== "selection_only_never_teacher_target"
  ) {
    throw new Error(`${label} fixed identity or enum differs`);
  }
  const ply = requiredInteger(row.ply, `${label}.ply`, 0);
  const legalMoveCount = requiredInteger(
    row.legal_move_count,
    `${label}.legal_move_count`,
    2,
  );
  for (const key of [
    "old_depth12_cp",
    "old_outcome",
    "minimum_player_rating",
    "sente_rating",
    "gote_rating",
    "hardness_cp_outcome_surprise",
  ]) {
    if (typeof row[key] !== "number" || !Number.isFinite(row[key])) {
      throw new Error(`${label}.${key} must be finite`);
    }
  }
  const sfen = requiredText(row.sfen, `${label}.sfen`);
  const recordedMove = requiredText(
    row.recorded_move,
    `${label}.recorded_move`,
  );
  const parsed = positionFromSfen(sfen);
  const expectedPhase =
    ply >= 12 && ply <= 39
      ? "opening"
      : ply >= 40 && ply <= 79
        ? "mid"
        : ply >= 80 && ply <= 119
          ? "late"
          : undefined;
  const oldCp = row.old_depth12_cp as number;
  const oldOutcome = row.old_outcome as number;
  const expectedTarget =
    oldOutcome === 1 ? 1_000 : oldOutcome === 0 ? -1_000 : 0;
  const tieMaterial = {
    game_id: row.game_id,
    minimum_player_rating: row.minimum_player_rating,
    old_depth12_cp: oldCp,
    old_outcome: oldOutcome,
    position_id: row.position_id,
  };
  if (
    sfen.split(/\s+/u)[1] !== row.side_to_move ||
    positionKeyFromSfen(sfen) !== row.position_id ||
    sfen.split(/\s+/u)[3] !== String(ply + 1) ||
    expectedPhase === undefined ||
    row.phase !== expectedPhase ||
    Math.abs(oldCp) > 1_000 ||
    ![0, 0.5, 1].includes(oldOutcome) ||
    row.minimum_player_rating !==
      Math.min(row.sente_rating as number, row.gote_rating as number) ||
    row.hardness_cp_outcome_surprise !== Math.abs(expectedTarget - oldCp) ||
    row.hardness_tiebreak_sha256 !==
      sha256(pythonSelectionTieBytes(tieMaterial))
  ) {
    throw new Error(`${label} selection/SFEN/hardness binding differs`);
  }
  const legalMoves = rulesCompleteLegalMoves(parsed.position).map(
    (move) => move.usi,
  );
  if (
    legalMoves.length !== legalMoveCount ||
    !legalMoves.includes(recordedMove)
  ) {
    throw new Error(`${label} legal/recorded move binding differs`);
  }
  return Object.freeze({
    ...(row as unknown as Halfkp81Depth18TeacherSelectionRow),
    ply,
    legal_move_count: legalMoveCount,
  });
}

function selectionParent(
  selection: Readonly<Halfkp81Depth18TeacherSelectionRow>,
): Readonly<SelectionParent> {
  return Object.freeze({
    selection,
    parent: Object.freeze({
      schema_version: 1,
      game_id: selection.game_id,
      parent_id: parentOccurrenceId(selection.game_id, selection.ply),
      position_id: selection.position_id,
      parent_sfen: selection.sfen,
      ply: selection.ply,
      played_move: selection.recorded_move,
    }),
  });
}

function assertNoOldTeacherTargetFields(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoOldTeacherTargetFields(entry, `${label}[${index}]`),
    );
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (FORBIDDEN_OLD_TARGET_KEYS.has(key)) {
      throw new Error(
        `${label} contains forbidden old depth12 target field ${key}`,
      );
    }
    assertNoOldTeacherTargetFields(nested, `${label}.${key}`);
  }
}

function validateStableResult(
  value: unknown,
  parent: Readonly<FloodgateTrainingParent>,
  runtimeReceiptSha256: string,
  reusablePoolReceiptSha256: string,
  label: string,
): Readonly<FloodgateProductionStableWasmRuntimeResult> {
  const result = exactObject(
    value,
    ["schema", "row", "runtime_binding"],
    label,
  );
  const row = exactObject(
    result.row,
    [
      "schema",
      "game_id",
      "parent_id",
      "position_id",
      "parent_payload_sha256",
      "stable_move",
      "child_sfen",
      "child_position_id",
      "search",
    ],
    `${label}.row`,
  );
  const search = exactObject(
    row.search,
    [
      "requested_depth",
      "completed_depth",
      "termination",
      "raw_search_score",
      "score_encoding",
      "nodes",
      "leaves",
      "root_tesu",
    ],
    `${label}.row.search`,
  );
  const binding = exactObject(
    result.runtime_binding,
    [
      "claim_boundary",
      "execution_boundary",
      "runtime_receipt_sha256",
      "reusable_pool_receipt_sha256",
      "parent_payload_sha256",
      "row_sha256",
      "origin",
      "plain_result_authentication_claim",
    ],
    `${label}.runtime_binding`,
  );
  const stableMove = requiredText(row.stable_move, `${label}.stable_move`);
  const childSfen = childSfenAfterUsi(parent.parent_sfen, stableMove);
  const stableCompletionIsValid =
    (search.completed_depth === FLOODGATE_STABLE_REQUESTED_DEPTH &&
      search.termination === "requested-depth-complete") ||
    (Number.isSafeInteger(search.completed_depth) &&
      (search.completed_depth as number) >= 1 &&
      (search.completed_depth as number) < FLOODGATE_STABLE_REQUESTED_DEPTH &&
      search.termination === "winning-mate-band-early" &&
      Number.isSafeInteger(search.raw_search_score) &&
      (search.raw_search_score as number) >= FLOODGATE_STABLE_MATE_SCORE_MIN &&
      (search.raw_search_score as number) <= FLOODGATE_STABLE_MATE_SCORE_MAX);
  if (
    result.schema !== FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA ||
    row.schema !== FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA ||
    row.game_id !== parent.game_id ||
    row.parent_id !== parent.parent_id ||
    row.position_id !== parent.position_id ||
    row.parent_payload_sha256 !== stableParentPayloadSha256(parent) ||
    row.child_sfen !== childSfen ||
    row.child_position_id !== positionKeyFromSfen(childSfen) ||
    search.requested_depth !== FLOODGATE_STABLE_REQUESTED_DEPTH ||
    !stableCompletionIsValid ||
    search.score_encoding !== FLOODGATE_STABLE_WASM_SCORE_ENCODING ||
    search.root_tesu !== parent.ply ||
    binding.claim_boundary !==
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY ||
    binding.execution_boundary !==
      "production-fixed-asset-authority-and-reusable-pool" ||
    binding.runtime_receipt_sha256 !== runtimeReceiptSha256 ||
    binding.reusable_pool_receipt_sha256 !== reusablePoolReceiptSha256 ||
    binding.parent_payload_sha256 !== row.parent_payload_sha256 ||
    binding.row_sha256 !==
      sha256(
        `${STABLE_RESULT_ROW_DIGEST_DOMAIN}${canonicalHalfkp81Depth18Json(row)}`,
      ) ||
    binding.origin !== "direct-owning-runtime-capability-call-v1" ||
    binding.plain_result_authentication_claim !== false
  ) {
    throw new Error(`${label} parent/depth/runtime result binding differs`);
  }
  const rawSearchScore = requiredInteger(
    search.raw_search_score,
    `${label}.search.raw_search_score`,
    -FLOODGATE_STABLE_MATE_SCORE_MAX,
  );
  if (rawSearchScore > FLOODGATE_STABLE_MATE_SCORE_MAX) {
    throw new Error(`${label} stable score is outside the signed mate band`);
  }
  for (const field of ["nodes", "leaves"]) {
    requiredInteger(search[field], `${label}.search.${field}`, 0);
  }
  if ((search.nodes as number) + (search.leaves as number) === 0) {
    throw new Error(`${label} stable search has no observed work`);
  }
  return result as unknown as Readonly<FloodgateProductionStableWasmRuntimeResult>;
}

function wrapperPayloadSha256(
  wrapper: Readonly<Record<string, unknown>>,
): string {
  const payload = { ...wrapper };
  delete payload.payload_sha256;
  return sha256(
    `${HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN}${canonicalHalfkp81Depth18Json(payload)}`,
  );
}

function validateV1R9Route(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  const tentative = value as Record<string, unknown> | undefined;
  const fallbackMode = tentative?.mode === "hash8192-parent-fallback";
  const route = exactObject(
    value,
    fallbackMode
      ? [
          "mode",
          "normal_hash_mib",
          "normal_limit",
          "trigger",
          "normal_engine_reaped_before_fallback",
          "fallback",
        ]
      : ["mode", "normal_hash_mib", "normal_limit", "fallback"],
    `${label}.rescore_route`,
  );
  const normalLimit = exactObject(
    route.normal_limit,
    ["depth", "nodes", "minimum_completed_depth"],
    `${label}.rescore_route.normal_limit`,
  );
  if (
    route.normal_hash_mib !== 512 ||
    !sameJson(normalLimit, {
      depth: 18,
      nodes: 2_000_000_000,
      minimum_completed_depth: 1,
    })
  ) {
    throw new Error(`${label} v1r9 normal route binding differs`);
  }
  if (!fallbackMode) {
    if (route.mode !== "normal-depth18" || route.fallback !== null) {
      throw new Error(`${label} v1r9 normal route differs`);
    }
    return route;
  }
  const trigger = exactObject(
    route.trigger,
    [
      "move",
      "candidate_index_zero_based",
      "candidate_count",
      "completed_normal_rescores_discarded",
      "cap",
    ],
    `${label}.rescore_route.trigger`,
  );
  const cap = exactObject(
    trigger.cap,
    [
      "termination_reason",
      "requested_depth",
      "node_cap",
      "minimum_completed_depth",
      "deepest_complete_exact_depth",
      "selected_snapshot_nodes",
      "maximum_observed_nodes",
      "maximum_observed_depth",
      "selected_snapshot_bound",
      "discarded_at_or_above_node_cap_updates",
      "observed_lowerbound_updates",
      "observed_upperbound_updates",
      "cap_witness_depth",
      "cap_witness_nodes",
      "selected_precedes_witness",
      "completed_iteration_witness_depth",
    ],
    `${label}.rescore_route.trigger.cap`,
  );
  const fallback = exactObject(
    route.fallback,
    [
      "hash_mib",
      "depth",
      "timeout_ms",
      "semaphore_limit",
      "all_candidates_recomputed",
      "candidate_count",
      "fallback_reset_retries_used",
      "discarded_completed_rescores_before_retry",
      "searches_executed",
      "normal_rescore_rows_reused",
      "candidate_omissions",
      "engine_quit_before_semaphore_release",
    ],
    `${label}.rescore_route.fallback`,
  );
  const index = requiredInteger(
    trigger.candidate_index_zero_based,
    `${label}.trigger.candidate_index_zero_based`,
    0,
  );
  const count = requiredInteger(
    trigger.candidate_count,
    `${label}.trigger.candidate_count`,
    2,
  );
  const deepest = requiredInteger(
    cap.deepest_complete_exact_depth,
    `${label}.trigger.cap.deepest_complete_exact_depth`,
    1,
  );
  const selectedNodes = requiredInteger(
    cap.selected_snapshot_nodes,
    `${label}.trigger.cap.selected_snapshot_nodes`,
    0,
  );
  const maxNodes = requiredInteger(
    cap.maximum_observed_nodes,
    `${label}.trigger.cap.maximum_observed_nodes`,
    0,
  );
  const maxDepth = requiredInteger(
    cap.maximum_observed_depth,
    `${label}.trigger.cap.maximum_observed_depth`,
    1,
  );
  const witnessDepth = requiredInteger(
    cap.cap_witness_depth,
    `${label}.trigger.cap.cap_witness_depth`,
    1,
  );
  const witnessNodes = requiredInteger(
    cap.cap_witness_nodes,
    `${label}.trigger.cap.cap_witness_nodes`,
    0,
  );
  if (
    route.normal_engine_reaped_before_fallback !== true ||
    typeof trigger.move !== "string" ||
    index >= count ||
    trigger.completed_normal_rescores_discarded !== index ||
    cap.termination_reason !== "node-cap" ||
    cap.requested_depth !== 18 ||
    cap.node_cap !== 2_000_000_000 ||
    cap.minimum_completed_depth !== 1 ||
    deepest >= 18 ||
    selectedNodes >= 2_000_000_000 ||
    maxNodes < witnessNodes ||
    maxDepth < witnessDepth ||
    maxDepth > 18 ||
    witnessDepth <= deepest ||
    witnessDepth > 18 ||
    witnessNodes < 2_000_000_000 ||
    cap.selected_snapshot_bound !== "exact" ||
    cap.selected_precedes_witness !== true ||
    cap.completed_iteration_witness_depth !== deepest ||
    requiredInteger(
      cap.discarded_at_or_above_node_cap_updates,
      `${label}.trigger.cap.discarded`,
      1,
    ) < 1 ||
    requiredInteger(
      cap.observed_lowerbound_updates,
      `${label}.trigger.cap.lower`,
      0,
    ) < 0 ||
    requiredInteger(
      cap.observed_upperbound_updates,
      `${label}.trigger.cap.upper`,
      0,
    ) < 0 ||
    fallback.hash_mib !== 8_192 ||
    fallback.depth !== 18 ||
    fallback.timeout_ms !== 14_400_000 ||
    fallback.semaphore_limit !== 2 ||
    fallback.all_candidates_recomputed !== true ||
    fallback.candidate_count !== count ||
    (fallback.fallback_reset_retries_used !== 0 &&
      fallback.fallback_reset_retries_used !== 1) ||
    !Number.isSafeInteger(fallback.discarded_completed_rescores_before_retry) ||
    (fallback.discarded_completed_rescores_before_retry as number) < 0 ||
    (fallback.discarded_completed_rescores_before_retry as number) >= count ||
    fallback.searches_executed !==
      count + (fallback.discarded_completed_rescores_before_retry as number) ||
    fallback.normal_rescore_rows_reused !== 0 ||
    fallback.candidate_omissions !== 0 ||
    fallback.engine_quit_before_semaphore_release !== true
  ) {
    throw new Error(`${label} v1r9 fallback route evidence differs`);
  }
  return route;
}

export const validateHalfkp81Depth18V1R9RouteCoreForTests = validateV1R9Route;

function validateWrapper(
  value: unknown,
  expectedParent: Readonly<SelectionParent>,
  fingerprint: string,
  planSchema: TeacherPlanSchema,
  stableRuntimeReceiptSha256: string | undefined,
  stableReusablePoolReceiptSha256: string | undefined,
  source: number,
): Readonly<Halfkp81Depth18TeacherWorkParent> {
  const label = `teacher work line ${source}`;
  assertNoOldTeacherTargetFields(value, label);
  const yaneuraOnly = isYaneuraOnlyPlanSchema(planSchema);
  const resetTimeoutRecovery =
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6;
  const hashFallbackV1R9 =
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 ||
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11;
  const wrapper = exactObject(
    value,
    yaneuraOnly
      ? [
          "schema",
          "kind",
          "run_fingerprint",
          "parent_id",
          "role",
          "candidate_generation",
          ...(resetTimeoutRecovery || hashFallbackV1R9
            ? ["reset_timeout_recovery"]
            : []),
          ...(hashFallbackV1R9 ? ["rescore_route"] : []),
          "teacher_entry",
          "payload_sha256",
        ]
      : [
          "schema",
          "kind",
          "run_fingerprint",
          "parent_id",
          "role",
          "stable_result",
          "teacher_entry",
          "payload_sha256",
        ],
    label,
  );
  if (
    wrapper.schema !==
      (yaneuraOnly
        ? yaneuraOnlyWorkSchema(planSchema)
        : HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA) ||
    wrapper.kind !== "parent" ||
    wrapper.run_fingerprint !== fingerprint ||
    wrapper.parent_id !== expectedParent.parent.parent_id ||
    wrapper.role !== expectedParent.selection.role ||
    wrapper.payload_sha256 !== wrapperPayloadSha256(wrapper) ||
    (yaneuraOnly &&
      !sameJson(
        wrapper.candidate_generation,
        hashFallbackV1R9
          ? YANEURA_ONLY_V1R9_CANDIDATE_GENERATION
          : YANEURA_ONLY_CANDIDATE_GENERATION_V1,
      ))
  ) {
    throw new Error(`${label} wrapper identity/digest/role differs`);
  }
  if (resetTimeoutRecovery) {
    const recovery = exactObject(
      wrapper.reset_timeout_recovery,
      ["policy", "retries_used", "engine_recycles", "events"],
      `${label}.reset_timeout_recovery`,
    );
    const retriesUsed = requiredInteger(
      recovery.retries_used,
      `${label}.reset_timeout_recovery.retries_used`,
      0,
    );
    const engineRecycles = requiredInteger(
      recovery.engine_recycles,
      `${label}.reset_timeout_recovery.engine_recycles`,
      0,
    );
    if (
      recovery.policy !== YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY ||
      retriesUsed > 1 ||
      engineRecycles !== retriesUsed ||
      !Array.isArray(recovery.events) ||
      recovery.events.length !== retriesUsed
    ) {
      throw new Error(`${label} reset timeout recovery evidence differs`);
    }
    for (const [index, eventValue] of recovery.events.entries()) {
      const event = exactObject(
        eventValue,
        ["attempt", "error_name", "phase", "timeout_ms"],
        `${label}.reset_timeout_recovery.events[${index}]`,
      );
      if (
        event.attempt !== 1 ||
        event.error_name !== "UsiResetForParentTimeoutError" ||
        event.phase !== "reset-for-parent" ||
        event.timeout_ms !== USI_RESET_FOR_PARENT_TIMEOUT_MS
      ) {
        throw new Error(`${label} reset timeout recovery event differs`);
      }
    }
  }
  let v1r9Route: Readonly<Record<string, unknown>> | undefined;
  let v1r9FallbackRetries = 0;
  if (hashFallbackV1R9) {
    const recovery = exactObject(
      wrapper.reset_timeout_recovery,
      [
        "policy",
        "normal_retries_used",
        "fallback_retries_used",
        "engine_recycles",
        "events",
      ],
      `${label}.reset_timeout_recovery`,
    );
    const normalRetries = requiredInteger(
      recovery.normal_retries_used,
      `${label}.normal_retries_used`,
      0,
    );
    const fallbackRetries = requiredInteger(
      recovery.fallback_retries_used,
      `${label}.fallback_retries_used`,
      0,
    );
    v1r9FallbackRetries = fallbackRetries;
    if (
      recovery.policy !== YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY ||
      normalRetries > 1 ||
      fallbackRetries > 1 ||
      recovery.engine_recycles !== normalRetries + fallbackRetries ||
      !Array.isArray(recovery.events) ||
      recovery.events.length !== normalRetries + fallbackRetries
    ) {
      throw new Error(`${label} v1r9 reset recovery differs`);
    }
    const counts = { normal: 0, fallback: 0 };
    for (const [index, value] of recovery.events.entries()) {
      const event = exactObject(
        value,
        ["route", "attempt", "error_name", "phase", "timeout_ms"],
        `${label}.reset_timeout_recovery.events[${index}]`,
      );
      if (
        (event.route !== "normal" && event.route !== "fallback") ||
        event.attempt !== 1 ||
        event.error_name !== "UsiResetForParentTimeoutError" ||
        event.phase !== "reset-for-parent" ||
        event.timeout_ms !== USI_RESET_FOR_PARENT_TIMEOUT_MS
      ) {
        throw new Error(`${label} v1r9 reset event differs`);
      }
      counts[event.route] += 1;
    }
    if (
      counts.normal !== normalRetries ||
      counts.fallback !== fallbackRetries
    ) {
      throw new Error(`${label} v1r9 reset route accounting differs`);
    }
    v1r9Route = validateV1R9Route(wrapper.rescore_route, label);
    if (v1r9Route.mode === "normal-depth18" && fallbackRetries !== 0) {
      throw new Error(`${label} normal route contains fallback retry evidence`);
    }
  }
  const stableMove = yaneuraOnly
    ? undefined
    : isBoundedStablePlanSchema(planSchema)
      ? validateFloodgateBoundedStableWasmOutcomeV3(
          wrapper.stable_result,
          expectedParent.parent,
          requiredText(
            stableRuntimeReceiptSha256,
            "bounded stable runtime receipt SHA",
          ),
        )
      : validateStableResult(
          wrapper.stable_result,
          expectedParent.parent,
          requiredText(
            stableRuntimeReceiptSha256,
            "stable runtime receipt SHA",
          ),
          requiredText(
            stableReusablePoolReceiptSha256,
            "stable reusable pool receipt SHA",
          ),
          `${label}.stable_result`,
        ).row.stable_move;
  const normalV1R9 = v1r9Route?.mode === "normal-depth18";
  const teacherEntry = validateWorkEntry(
    wrapper.teacher_entry,
    fingerprint,
    new Map([[expectedParent.parent.parent_id, expectedParent.parent]]),
    `${label}.teacher_entry`,
    12,
    normalV1R9
      ? { depth: 18, nodes: 2_000_000_000, minimumCompletedDepth: 1 }
      : { depth: 18 },
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 ||
      planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
      ? 3_600_000
      : hashFallbackV1R9
        ? 14_400_000
        : 600_000,
    { depth: 16 },
    undefined,
    stableMove,
  );
  if (teacherEntry.kind !== "parent") {
    throw new Error(`${label} contains a fault/skip/incomplete parent`);
  }
  if (hashFallbackV1R9 && v1r9Route !== undefined) {
    if (v1r9Route.mode === "normal-depth18") {
      if (
        teacherEntry.exact_search.searches.some(
          (search) =>
            search.dual_bound === undefined ||
            (search.dual_bound.termination_reason !== "depth" &&
              search.dual_bound.termination_reason !== "terminal-mate") ||
            (search.dual_bound.termination_reason === "depth" &&
              search.dual_bound.deepest_complete_exact_depth !== 18),
        )
      ) {
        throw new Error(
          `${label} contains a capped or incomplete normal-lane label`,
        );
      }
    } else {
      const trigger = v1r9Route.trigger as Record<string, unknown>;
      const fallback = v1r9Route.fallback as Record<string, unknown>;
      const index = trigger.candidate_index_zero_based as number;
      if (
        trigger.candidate_count !== teacherEntry.candidate_moves.length ||
        fallback.candidate_count !== teacherEntry.candidate_moves.length ||
        trigger.move !== teacherEntry.candidate_moves[index] ||
        teacherEntry.exact_search.searches.length !==
          teacherEntry.candidate_moves.length ||
        teacherEntry.exact_search.searches.some(
          (search) => search.dual_bound !== undefined,
        ) ||
        fallback.fallback_reset_retries_used !== v1r9FallbackRetries ||
        (v1r9FallbackRetries === 0 &&
          fallback.discarded_completed_rescores_before_retry !== 0)
      ) {
        throw new Error(
          `${label} fallback evidence is not bound to all fixed candidates`,
        );
      }
    }
  }
  if (
    teacherEntry.records.length < 2 ||
    teacherEntry.records.length > (yaneuraOnly ? 13 : 14)
  ) {
    throw new Error(
      `${label} must contain 2 through ${yaneuraOnly ? 13 : 14} fresh target rows`,
    );
  }
  const stableSourced = teacherEntry.records.filter((record) =>
    record.sources.includes("stable"),
  );
  if (
    (stableMove === undefined && stableSourced.length !== 0) ||
    (stableMove !== undefined &&
      (stableSourced.length !== 1 || stableSourced[0].move !== stableMove))
  ) {
    throw new Error(
      `${label} stable source differs from its authenticated outcome`,
    );
  }
  return wrapper as unknown as Readonly<Halfkp81Depth18TeacherWorkParent>;
}

export interface Halfkp81Depth18V1R10ImportSetValidationRequest {
  readonly plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly selection: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly selectionManifest: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly work: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly terminalFault: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly engineBinary: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly engineEval: Readonly<Halfkp81Depth18PrivateSnapshot>;
  readonly engineReceipt: Readonly<Halfkp81Depth18PrivateSnapshot>;
}

const V1R10_IMPORT_SOURCE = Object.freeze({
  plan: Object.freeze({
    bytes: 16_859,
    sha256: "9f56b8ab252ce96a4ee0675252e7b54be6cdb26d294dde08d896dce9b7c60b15",
  }),
  selection: Object.freeze({
    bytes: 7_268_777,
    sha256: "e591aa6d90ca3640b4b0e5963de53e92da0b2541434aaa100f9e5ea7ab83f4e4",
  }),
  selectionManifest: Object.freeze({
    bytes: 3_234,
    sha256: "6823b77be9171fe63cb30cbd2955bd871474cf8ebf662fc203824c673aa3e187",
  }),
  work: Object.freeze({
    bytes: 91_081_134,
    sha256: "39bef71ce5688eb10f47bdbc6e6aa8f1dd884a6f0a244bf090134cd7c10440ff",
  }),
  terminalFault: Object.freeze({
    bytes: 1_084,
    sha256: "436e9c6dfe5d8824cf89b1616ed82e082bfdafe67e7e8ed6870bb5e2d5539997",
  }),
  runFingerprint:
    "d76ec02ecd721260c380c2a421b6bc7e9d689f37eaf8279e83d78b381390eba7",
  completedParents: 4_196,
  completedRows: 49_190,
  contiguousPrefix: 3_890,
  holesBeforeNominalBoundary: Object.freeze([3_890, 4_135, 4_191]),
  extrasAfterNominalBoundary: Object.freeze([4_196, 4_197, 4_198]),
});

function assertV1R10ImportSourceIdentity(
  snapshot: Readonly<Halfkp81Depth18PrivateSnapshot>,
  expected: Readonly<{ bytes: number; sha256: string }>,
  label: string,
): void {
  if (
    snapshot.bytes.byteLength !== expected.bytes ||
    snapshot.identity.bytes !== expected.bytes ||
    snapshot.identity.sha256 !== expected.sha256 ||
    sha256(snapshot.bytes) !== expected.sha256
  ) {
    throw new Error(`v1r10 import ${label} identity differs`);
  }
}

/**
 * Independently validates the immutable, non-contiguous v1r10 completed set.
 * This function does not authorize a same-family resume and does not rewrite
 * the source work ledger. A successor importer must use the returned ordered
 * parent IDs and recompute its own schema, run fingerprint and payload hashes.
 */
export function validateHalfkp81Depth18V1R10ImportableSet(
  request: Readonly<Halfkp81Depth18V1R10ImportSetValidationRequest>,
): Readonly<Record<string, unknown>> {
  assertV1R10ImportSourceIdentity(request.plan, V1R10_IMPORT_SOURCE.plan, "plan");
  assertV1R10ImportSourceIdentity(
    request.selection,
    V1R10_IMPORT_SOURCE.selection,
    "selection",
  );
  assertV1R10ImportSourceIdentity(
    request.selectionManifest,
    V1R10_IMPORT_SOURCE.selectionManifest,
    "selection manifest",
  );
  assertV1R10ImportSourceIdentity(request.work, V1R10_IMPORT_SOURCE.work, "work");
  assertV1R10ImportSourceIdentity(
    request.terminalFault,
    V1R10_IMPORT_SOURCE.terminalFault,
    "terminal fault",
  );

  const plan = parseCanonicalDocument(request.plan, "v1r10 import plan");
  if (plan.schema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9) {
    throw new Error("v1r10 import plan schema differs");
  }
  const selectionRows = parseExactJsonl(
    request.selection.bytes,
    "v1r10 import selection",
    false,
  )
    .map(parseSelectionRow)
    .map(selectionParent);
  if (selectionRows.length !== 8_192) {
    throw new Error("v1r10 import selection count differs");
  }
  const workValues = parseExactJsonl(request.work.bytes, "v1r10 import work");
  if (workValues.length !== V1R10_IMPORT_SOURCE.completedParents + 1) {
    throw new Error("v1r10 import work row count differs");
  }
  const verifierRequest = request as unknown as Halfkp81Depth18ValidationRequest;
  const header = validatePlanAndHeader(
    verifierRequest,
    plan,
    workValues[0],
    selectionRows,
  );
  validateEngineReceipt(request.engineReceipt, request.engineBinary);
  if (header.run_fingerprint !== V1R10_IMPORT_SOURCE.runFingerprint) {
    throw new Error("v1r10 import run fingerprint differs");
  }

  const selectedByParentId = new Map(
    selectionRows.map((selected, index) => [selected.parent.parent_id, { selected, index }] as const),
  );
  const completed = new Map<
    string,
    Readonly<Halfkp81Depth18TeacherWorkParent>
  >();
  let completedRows = 0;
  const roleParents = { fit: 0, tune: 0, sealed: 0 };
  const roleRows = { fit: 0, tune: 0, sealed: 0 };
  const fallback = { parents: 0, rows: 0, searches: 0 };
  for (let offset = 1; offset < workValues.length; offset += 1) {
    const value = workValues[offset] as Record<string, unknown>;
    const parentId = requiredText(value.parent_id, `v1r10 import work line ${offset + 1}.parent_id`);
    const indexed = selectedByParentId.get(parentId);
    if (indexed === undefined || completed.has(parentId)) {
      throw new Error(`v1r10 import work line ${offset + 1} parent membership differs`);
    }
    const wrapper = validateWrapper(
      value,
      indexed.selected,
      V1R10_IMPORT_SOURCE.runFingerprint,
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9,
      undefined,
      undefined,
      offset + 1,
    );
    completed.set(parentId, wrapper);
    const rows = wrapper.teacher_entry.records.length;
    completedRows += rows;
    roleParents[wrapper.role] += 1;
    roleRows[wrapper.role] += rows;
    if (wrapper.rescore_route?.mode === "hash8192-parent-fallback") {
      const fallbackEvidence = wrapper.rescore_route.fallback as Readonly<{
        searches_executed: number;
      }>;
      fallback.parents += 1;
      fallback.rows += rows;
      fallback.searches += fallbackEvidence.searches_executed;
    }
  }
  if (
    completed.size !== V1R10_IMPORT_SOURCE.completedParents ||
    completedRows !== V1R10_IMPORT_SOURCE.completedRows
  ) {
    throw new Error("v1r10 import completed accounting differs");
  }

  const orderedIndexes: number[] = [];
  const orderedParentIds: string[] = [];
  for (const [index, selected] of selectionRows.entries()) {
    if (!completed.has(selected.parent.parent_id)) continue;
    orderedIndexes.push(index);
    orderedParentIds.push(selected.parent.parent_id);
  }
  let contiguousPrefix = 0;
  while (orderedIndexes[contiguousPrefix] === contiguousPrefix) contiguousPrefix += 1;
  const holesBeforeNominalBoundary = Array.from(
    { length: V1R10_IMPORT_SOURCE.completedParents },
    (_, index) => index,
  ).filter((index) => !orderedIndexes.includes(index));
  const extrasAfterNominalBoundary = orderedIndexes.filter(
    (index) => index >= V1R10_IMPORT_SOURCE.completedParents,
  );
  if (
    contiguousPrefix !== V1R10_IMPORT_SOURCE.contiguousPrefix ||
    !sameJson(
      holesBeforeNominalBoundary,
      V1R10_IMPORT_SOURCE.holesBeforeNominalBoundary,
    ) ||
    !sameJson(
      extrasAfterNominalBoundary,
      V1R10_IMPORT_SOURCE.extrasAfterNominalBoundary,
    )
  ) {
    throw new Error("v1r10 import completed selection set differs");
  }

  const terminalFault = exactObject(
    parseCanonicalDocument(request.terminalFault, "v1r10 import terminal fault"),
    [
      "authority",
      "completed_parents",
      "incomplete_parents",
      "message",
      "run_fingerprint",
      "schema",
      "status",
      "teacher_plan",
      "technical_faults",
    ],
    "v1r10 import terminal fault",
  );
  const authority = exactObject(
    terminalFault.authority,
    ["may_play_formal_games", "may_resume_same_family", "may_train", "may_write_live_weights"],
    "v1r10 import terminal fault authority",
  );
  const message = requiredText(terminalFault.message, "v1r10 import terminal fault message");
  const faultParent = /^teacher labeling failed for parent (sha256:[0-9a-f]{64}):/u.exec(message)?.[1];
  if (
    terminalFault.schema !== "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1" ||
    terminalFault.status !== "terminal-fault-family-stopped" ||
    terminalFault.run_fingerprint !== V1R10_IMPORT_SOURCE.runFingerprint ||
    terminalFault.completed_parents !== completed.size ||
    terminalFault.incomplete_parents !== selectionRows.length - completed.size ||
    terminalFault.technical_faults !== 1 ||
    faultParent === undefined ||
    completed.has(faultParent) ||
    !selectedByParentId.has(faultParent) ||
    !sameJson(authority, {
      may_play_formal_games: false,
      may_resume_same_family: false,
      may_train: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error("v1r10 import terminal fault closure differs");
  }
  validateDeclaredIdentity(
    terminalFault.teacher_plan,
    request.plan,
    "v1r10 import terminal fault teacher plan",
    { schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 },
  );

  return Object.freeze({
    schema: "shogi-halfkp81-depth18-v1r10-importable-set-verification-v1",
    status: "source-set-independently-verified-import-eligible-new-family-only",
    source: Object.freeze({
      plan: identityFromSnapshot(request.plan, HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9),
      selection: identityFromSnapshot(request.selection, HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA, 8_192),
      selection_manifest: identityFromSnapshot(request.selectionManifest, HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA),
      work: identityFromSnapshot(request.work, HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9, workValues.length),
      terminal_fault: identityFromSnapshot(request.terminalFault, "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1"),
      run_fingerprint: V1R10_IMPORT_SOURCE.runFingerprint,
    }),
    completed: Object.freeze({
      parents: completed.size,
      rows: completedRows,
      role_parents: Object.freeze(roleParents),
      role_rows: Object.freeze(roleRows),
      selection_order_parent_ids_sha256: sha256(`${orderedParentIds.join("\n")}\n`),
      selection_indexes_sha256: sha256(canonicalHalfkp81Depth18Json(orderedIndexes)),
      contiguous_prefix: contiguousPrefix,
      holes_before_nominal_4196_boundary: Object.freeze(holesBeforeNominalBoundary),
      extras_after_nominal_4196_boundary: Object.freeze(extrasAfterNominalBoundary),
    }),
    fallback_recount: Object.freeze(fallback),
    verification: Object.freeze({
      every_wrapper_payload_digest_recomputed: true,
      every_parent_selection_membership_recomputed: true,
      every_candidate_order_and_record_alignment_recomputed: true,
      every_published_candidate_legal_and_exact_depth18: true,
      partial_or_capped_labels: 0,
      fault_parent_imported: false,
      same_family_resume_authority: false,
    }),
  });
}

export function validateHalfkp81Depth18V1R11ImportedSet(
  request: Readonly<{
    selection: Readonly<Halfkp81Depth18PrivateSnapshot>;
    targetWork: Readonly<Halfkp81Depth18PrivateSnapshot>;
    expectedHeader: Readonly<Record<string, unknown>>;
    targetRunFingerprint: string;
  }>,
): Readonly<Record<string, unknown>> {
  assertV1R10ImportSourceIdentity(
    request.selection,
    V1R10_IMPORT_SOURCE.selection,
    "target verifier selection",
  );
  if (!SHA256_RE.test(request.targetRunFingerprint)) {
    throw new Error("v1r11 imported target fingerprint differs");
  }
  const selectionRows = parseExactJsonl(
    request.selection.bytes,
    "v1r11 imported target selection",
    false,
  )
    .map(parseSelectionRow)
    .map(selectionParent);
  const selectedByParentId = new Map(
    selectionRows.map((selected, index) => [selected.parent.parent_id, { selected, index }] as const),
  );
  const workValues = parseExactJsonl(
    request.targetWork.bytes,
    "v1r11 imported target work",
  );
  if (
    workValues.length !== V1R10_IMPORT_SOURCE.completedParents + 1 ||
    !sameJson(workValues[0], request.expectedHeader) ||
    (workValues[0] as Record<string, unknown>).run_fingerprint !==
      request.targetRunFingerprint
  ) {
    throw new Error("v1r11 imported target header/count differs");
  }
  const indexes: number[] = [];
  const ids: string[] = [];
  const seen = new Set<string>();
  let rows = 0;
  const fallback = { parents: 0, rows: 0, searches: 0 };
  for (let offset = 1; offset < workValues.length; offset += 1) {
    const value = workValues[offset] as Record<string, unknown>;
    const parentId = requiredText(
      value.parent_id,
      `v1r11 imported target line ${offset + 1}.parent_id`,
    );
    const indexed = selectedByParentId.get(parentId);
    if (indexed === undefined || seen.has(parentId)) {
      throw new Error("v1r11 imported target parent membership differs");
    }
    const wrapper = validateWrapper(
      value,
      indexed.selected,
      request.targetRunFingerprint,
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11,
      undefined,
      undefined,
      offset + 1,
    );
    seen.add(parentId);
    indexes.push(indexed.index);
    ids.push(parentId);
    const parentRows = wrapper.teacher_entry.records.length;
    rows += parentRows;
    if (wrapper.rescore_route?.mode === "hash8192-parent-fallback") {
      const fallbackEvidence = wrapper.rescore_route.fallback as Readonly<{
        searches_executed: number;
      }>;
      fallback.parents += 1;
      fallback.rows += parentRows;
      fallback.searches += fallbackEvidence.searches_executed;
    }
  }
  const holes = Array.from(
    { length: V1R10_IMPORT_SOURCE.completedParents },
    (_, index) => index,
  ).filter((index) => !indexes.includes(index));
  const extras = indexes.filter(
    (index) => index >= V1R10_IMPORT_SOURCE.completedParents,
  );
  if (
    rows !== V1R10_IMPORT_SOURCE.completedRows ||
    !indexes.every((index, offset) => offset === 0 || index > indexes[offset - 1]) ||
    !sameJson(holes, V1R10_IMPORT_SOURCE.holesBeforeNominalBoundary) ||
    !sameJson(extras, V1R10_IMPORT_SOURCE.extrasAfterNominalBoundary) ||
    !sameJson(fallback, { parents: 5, rows: 51, searches: 60 })
  ) {
    throw new Error("v1r11 imported target semantic accounting differs");
  }
  return Object.freeze({
    schema: "shogi-halfkp81-depth18-v1r11-imported-set-verification-v1",
    status: "create-only-imported-set-independently-verified",
    target_work: identityFromSnapshot(
      request.targetWork,
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
      workValues.length,
    ),
    run_fingerprint: request.targetRunFingerprint,
    imported_parents: seen.size,
    imported_rows: rows,
    remaining_parent_id_set_difference: selectionRows.length - seen.size,
    selection_order_parent_ids_sha256: sha256(`${ids.join("\n")}\n`),
    selection_indexes_sha256: sha256(canonicalHalfkp81Depth18Json(indexes)),
    fallback_recount: Object.freeze(fallback),
    verification: Object.freeze({
      canonical_selection_order: true,
      every_outer_and_nested_run_fingerprint_rebound: true,
      every_outer_and_nested_payload_digest_recomputed: true,
      every_candidate_legal_ordered_and_exact_depth18: true,
      partial_or_capped_labels: 0,
    }),
  });
}

export function validateHalfkp81Depth18V1R10PrefixOneTeacherSmoke(
  request: Readonly<
    Omit<Halfkp81Depth18V1R10ImportSetValidationRequest, "work" | "terminalFault"> & {
      smokeWork: Readonly<Halfkp81Depth18PrivateSnapshot>;
    }
  >,
): Readonly<Record<string, unknown>> {
  assertV1R10ImportSourceIdentity(request.plan, V1R10_IMPORT_SOURCE.plan, "smoke plan");
  assertV1R10ImportSourceIdentity(
    request.selection,
    V1R10_IMPORT_SOURCE.selection,
    "smoke selection",
  );
  assertV1R10ImportSourceIdentity(
    request.selectionManifest,
    V1R10_IMPORT_SOURCE.selectionManifest,
    "smoke selection manifest",
  );
  const plan = parseCanonicalDocument(request.plan, "v1r10 prefix-one smoke plan");
  const selectionRows = parseExactJsonl(
    request.selection.bytes,
    "v1r10 prefix-one smoke selection",
    false,
  )
    .map(parseSelectionRow)
    .map(selectionParent);
  const work = parseExactJsonl(
    request.smokeWork.bytes,
    "v1r10 prefix-one smoke work",
  );
  if (work.length !== 2 || selectionRows.length !== 8_192) {
    throw new Error("v1r10 prefix-one smoke row count differs");
  }
  const verifierRequest = {
    ...request,
    work: request.smokeWork,
  } as unknown as Halfkp81Depth18ValidationRequest;
  const header = validatePlanAndHeader(
    verifierRequest,
    plan,
    work[0],
    selectionRows,
  );
  validateEngineReceipt(request.engineReceipt, request.engineBinary);
  const prefixOne = selectionRows[0];
  const wrapper = validateWrapper(
    work[1],
    prefixOne,
    header.run_fingerprint,
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9,
    undefined,
    undefined,
    2,
  );
  const expectedCandidates = Object.freeze([
    "1e4b+",
    "3f3e",
    "4c4d",
    "4g4f",
    "4i4h",
    "6h5i",
    "6h7h",
    "7f7e",
    "7g6f",
    "9g9f",
    "P*2c",
    "P*2d",
  ]);
  if (
    prefixOne.parent.parent_id !==
      "sha256:5ef4d6bbe4d6cae683c29e050264a0d9624114e815a23bbbb5175e1ec280b5f6" ||
    wrapper.parent_id !== prefixOne.parent.parent_id ||
    wrapper.rescore_route?.mode !== "normal-depth18" ||
    wrapper.rescore_route.fallback !== null ||
    !sameJson(wrapper.teacher_entry.candidate_moves, expectedCandidates) ||
    wrapper.teacher_entry.records.length !== 12 ||
    wrapper.teacher_entry.exact_search.searches.length !== 12
  ) {
    throw new Error("v1r10 prefix-one smoke fixed result differs");
  }
  return Object.freeze({
    schema: "shogi-halfkp81-depth18-v1r10-prefix-one-teacher-smoke-verification-v1",
    status: "actual-production-teacher-core-scratch-smoke-verified",
    parent_id: wrapper.parent_id,
    selection_index: 0,
    candidate_moves: expectedCandidates,
    completed_rows: 12,
    route: "normal-depth18",
    work: identityFromSnapshot(
      request.smokeWork,
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9,
      2,
    ),
    verification: Object.freeze({
      source_plan_selection_engine_identity: true,
      unchanged_v1r9_candidate_and_rescore_contract: true,
      every_candidate_legal_and_exact_depth18: true,
      candidate_omissions: 0,
      partial_or_capped_labels: 0,
      formal_authority: false,
    }),
  });
}

function validateEngineReceipt(
  snapshot: Readonly<Halfkp81Depth18PrivateSnapshot>,
  engineBinary: Readonly<Halfkp81Depth18PrivateSnapshot>,
): void {
  const receipt = parseJson(snapshot.bytes, "teacher engine receipt");
  const expectedFields = [
    "binary_bytes",
    "binary_sha256",
    "build_command",
    "build_directory",
    "compiler",
    "compiler_target",
    "engine_id",
    "schema",
    "source_commit",
    "source_commit_date",
    "source_repository",
  ];
  exactObject(receipt, expectedFields, "teacher engine receipt");
  if (
    receipt.schema !== "shogi-teacher-engine-receipt-v1" ||
    receipt.binary_bytes !== engineBinary.bytes.byteLength ||
    receipt.binary_sha256 !== sha256(engineBinary.bytes)
  ) {
    throw new Error("teacher engine receipt does not bind the held binary");
  }
}

function validateRequiredStableRuntimeV2(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const row = exactObject(
    value,
    ["receipt_sha256", "receipt"],
    "teacher work stable runtime",
  );
  const receiptSha = requiredDigest(
    row.receipt_sha256,
    "teacher work stable runtime receipt SHA",
  );
  const receipt = exactObject(
    row.receipt,
    [
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
      "asset_authority",
      "stable_engine_assets",
      "search_contract",
      "operational",
      "nonclaims",
    ],
    "teacher work stable runtime receipt",
  );
  if (
    receiptSha !==
    sha256(
      `${STABLE_RUNTIME_RECEIPT_DIGEST_DOMAIN}${canonicalHalfkp81Depth18Json(
        receipt,
      )}`,
    )
  ) {
    throw new Error("stable runtime receipt SHA does not bind its content");
  }
  const assetAuthority = exactObject(
    receipt.asset_authority,
    [
      "contract",
      "status",
      "claim_boundary",
      "trust_boundary",
      "execution_boundary",
      "receipt_sha256",
    ],
    "stable runtime asset authority",
  );
  const assets = exactObject(
    receipt.stable_engine_assets,
    ["worker_schema", "wasm", "weights", "worker_source"],
    "stable runtime assets",
  );
  const wasm = exactObject(
    assets.wasm,
    ["bytes", "sha256"],
    "stable runtime wasm",
  );
  const weights = exactObject(
    assets.weights,
    ["bytes", "sha256", "k", "buckets"],
    "stable runtime weights",
  );
  const worker = exactObject(
    assets.worker_source,
    ["bytes", "sha256"],
    "stable runtime worker",
  );
  const search = exactObject(
    receipt.search_contract,
    [
      "requested_depth",
      "quiescence_depth",
      "early_completion",
      "positive_mate_score_min",
      "positive_mate_score_max",
      "score_encoding",
      "root_tesu",
      "book",
      "fallback",
    ],
    "stable runtime search contract",
  );
  const operational = exactObject(
    receipt.operational,
    [
      "workers",
      "queue_bound",
      "startup_timeout_ms",
      "search_timeout_ms",
      "close_timeout_ms",
      "scheduling",
      "failure_policy",
      "cleanup",
      "reusable_pool_receipt_sha256",
    ],
    "stable runtime operational contract",
  );
  const nonclaims = exactObject(
    receipt.nonclaims,
    [
      "parent_authentication",
      "teacher_label",
      "training",
      "selection_or_holdout_access",
      "playing_strength",
    ],
    "stable runtime nonclaims",
  );
  if (
    receipt.contract !== FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT ||
    receipt.status !== FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY ||
    receipt.execution_boundary !==
      "production-fixed-asset-authority-and-reusable-pool" ||
    assetAuthority.contract !==
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT ||
    assetAuthority.status !==
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS ||
    assetAuthority.claim_boundary !==
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY ||
    assetAuthority.trust_boundary !==
      FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY ||
    assetAuthority.execution_boundary !==
      "production-fixed-registry-and-deployment-root" ||
    !SHA256_RE.test(assetAuthority.receipt_sha256 as string) ||
    assets.worker_schema !== FLOODGATE_STABLE_WASM_WORKER_SCHEMA ||
    !sameJson(wasm, {
      bytes: FLOODGATE_STABLE_WASM_BYTES,
      sha256: FLOODGATE_STABLE_WASM_SHA256,
    }) ||
    !sameJson(weights, {
      bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
      sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
      k: 600,
      buckets: 1,
    }) ||
    !sameJson(worker, {
      bytes: FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
      sha256: FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
    }) ||
    !sameJson(search, {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      quiescence_depth: FLOODGATE_STABLE_QUIESCENCE_DEPTH,
      early_completion: "positive-winning-mate-band-depth-1-through-10-only",
      positive_mate_score_min: FLOODGATE_STABLE_MATE_SCORE_MIN,
      positive_mate_score_max: FLOODGATE_STABLE_MATE_SCORE_MAX,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      root_tesu: "input-ply",
      book: false,
      fallback: "forbidden",
    }) ||
    !sameJson(operational, {
      workers: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_WORKERS,
      queue_bound: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_QUEUE_BOUND,
      startup_timeout_ms:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STARTUP_TIMEOUT_MS,
      search_timeout_ms:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_SEARCH_TIMEOUT_MS,
      close_timeout_ms:
        FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLOSE_TIMEOUT_MS,
      scheduling: "bounded-fifo-one-parent-per-worker-v1",
      failure_policy: "pool-wide-poison-reject-all-force-stop-v1",
      cleanup:
        "asset-copies-zeroized-idle-quit-active-or-poison-force-stop-idempotent-close-v1",
      reusable_pool_receipt_sha256: operational.reusable_pool_receipt_sha256,
    }) ||
    !SHA256_RE.test(operational.reusable_pool_receipt_sha256 as string) ||
    !sameJson(nonclaims, {
      parent_authentication: false,
      teacher_label: false,
      training: false,
      selection_or_holdout_access: false,
      playing_strength: false,
    })
  ) {
    throw new Error("stable runtime production receipt/assets differ");
  }
  return row;
}

function validateBoundedStableRuntimeV3(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const row = exactObject(
    value,
    ["receipt_sha256", "receipt"],
    "teacher work bounded stable runtime",
  );
  const receiptSha = requiredDigest(
    row.receipt_sha256,
    "teacher work bounded stable runtime receipt SHA",
  );
  const receipt = exactObject(
    row.receipt,
    [
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
      "asset_authority_receipt_sha256",
      "engine_assets",
      "search",
      "operational",
    ],
    "teacher work bounded stable runtime receipt",
  );
  const assets = exactObject(
    receipt.engine_assets,
    ["wasm", "weights", "worker_source"],
    "bounded stable runtime assets",
  );
  const search = exactObject(
    receipt.search,
    [
      "requested_depth",
      "quiescence_depth",
      "cooperative_deadline_ms",
      "partial_result_policy",
      "stable_candidate_role",
    ],
    "bounded stable runtime search",
  );
  const operational = exactObject(
    receipt.operational,
    [
      "workers",
      "queue_bound",
      "outer_watchdog_ms",
      "omission_policy",
      "unexpected_failure_policy",
      "replacement_policy",
    ],
    "bounded stable runtime operational policy",
  );
  if (
    receipt.contract !== FLOODGATE_BOUNDED_STABLE_WASM_RUNTIME_CONTRACT_V3 ||
    receipt.status !==
      "initialized-optional-bounded-stable-candidate-capability" ||
    receipt.claim_boundary !==
      "candidate-or-authenticated-omission-only-not-teacher-label-training-holdout-or-playing-strength" ||
    receipt.execution_boundary !== "production-pinned-asset-authority" ||
    typeof receipt.asset_authority_receipt_sha256 !== "string" ||
    !SHA256_RE.test(receipt.asset_authority_receipt_sha256) ||
    !sameJson(assets.wasm, {
      bytes: FLOODGATE_STABLE_WASM_BYTES,
      sha256: FLOODGATE_STABLE_WASM_SHA256,
    }) ||
    !sameJson(assets.weights, {
      bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
      sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
    }) ||
    !sameJson(assets.worker_source, {
      bytes: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
      sha256: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SHA256_V3,
    }) ||
    !sameJson(search, {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      quiescence_depth: FLOODGATE_STABLE_QUIESCENCE_DEPTH,
      cooperative_deadline_ms:
        FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
      partial_result_policy: "discard-entire-move-score-and-counters",
      stable_candidate_role: "optional",
    }) ||
    !sameJson(operational, {
      workers: FLOODGATE_BOUNDED_STABLE_WASM_WORKERS_V3,
      queue_bound: FLOODGATE_BOUNDED_STABLE_WASM_QUEUE_BOUND_V3,
      outer_watchdog_ms: FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3,
      omission_policy: "resolve-explicit-bound-outcome-no-pool-poison",
      unexpected_failure_policy: "reap-replace-reject-parent-no-pool-poison",
      replacement_policy:
        "reap-omitted-or-failed-worker-before-fresh-replacement",
    }) ||
    receiptSha !==
      getFloodgateBoundedStableWasmRuntimeReceiptDigestV3(
        receipt as unknown as FloodgateBoundedStableWasmRuntimeReceiptV3,
      )
  ) {
    throw new Error("bounded stable runtime production receipt/assets differ");
  }
  return row;
}

function validateStableRuntime(
  value: unknown,
  planSchema: TeacherPlanSchema,
): Readonly<Record<string, unknown>> {
  return isBoundedStablePlanSchema(planSchema)
    ? validateBoundedStableRuntimeV3(value)
    : validateRequiredStableRuntimeV2(value);
}

function independentV1R11IntentIdentity(
  value: Readonly<Halfkp81Depth18ArtifactIdentity>,
  label: string,
  requireRows = false,
): Readonly<Halfkp81Depth18ArtifactIdentity> {
  const fields = requireRows
    ? ["path", "bytes", "sha256", "schema", "rows"]
    : ["path", "bytes", "sha256", "schema"];
  if (
    !sameJson(Object.keys(value).sort(), [...fields].sort()) ||
    !path.isAbsolute(value.path) ||
    path.normalize(value.path) !== value.path ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 1 ||
    !SHA256_RE.test(value.sha256) ||
    typeof value.schema !== "string" ||
    value.schema.length < 1 ||
    (requireRows &&
      (!Number.isSafeInteger(value.rows) || Number(value.rows) < 1))
  ) {
    throw new Error(`${label} identity differs`);
  }
  return Object.freeze({ ...value });
}

function independentV1R11IntentContract(
  value: Readonly<Record<string, unknown>>,
  label: string,
): Readonly<Record<string, unknown>> {
  const forbidden = (candidate: unknown): boolean => {
    if (Array.isArray(candidate)) return candidate.some(forbidden);
    if (candidate !== null && typeof candidate === "object") {
      return Object.entries(candidate as Readonly<Record<string, unknown>>).some(
        ([key, child]) =>
          /(?:run_fingerprint|launchagent_authority|launch_agent_authority|launchagent_evidence|launch_agent_evidence|preformal_authority|formal_authority|raw_receipt|verified_receipt|teacher_receipt|artifact_receipt|authority_receipt|power_continuity|process_cleanup|terminal_fault)/u.test(
            key,
          ) || forbidden(child),
      );
    }
    return false;
  };
  if (
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length < 1 ||
    forbidden(value)
  ) {
    throw new Error(`${label} differs or contains a circular authority input`);
  }
  canonicalHalfkp81Depth18Json(value);
  return Object.freeze({ ...value });
}

/** Independent implementation: no producer/finalizer fingerprint helper. */
function independentV1R11RunFingerprint(
  input: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18ArtifactIdentity>;
    selectionJsonl: Readonly<Halfkp81Depth18ArtifactIdentity>;
    selectionManifest: Readonly<Halfkp81Depth18ArtifactIdentity>;
    sourceRevision: string;
    engine: Readonly<{
      binary: Readonly<Halfkp81Depth18ArtifactIdentity>;
      evalFile: Readonly<Halfkp81Depth18ArtifactIdentity>;
      receipt: Readonly<Halfkp81Depth18ArtifactIdentity>;
    }>;
    teacherContract: Readonly<Record<string, unknown>>;
    candidateContract: Readonly<Record<string, unknown>>;
    plannedFinalDescriptor: Readonly<Halfkp81Depth18ArtifactIdentity>;
  }>,
): string {
  if (!/^[0-9a-f]{40}$/u.test(input.sourceRevision)) {
    throw new Error("independent v1r11 source revision differs");
  }
  const payload = Object.freeze({
    schema: V1R11_FORMAL_RUN_INTENT_SCHEMA,
    teacher_plan: independentV1R11IntentIdentity(
      input.teacherPlan,
      "independent formal teacher plan",
    ),
    selection_jsonl: independentV1R11IntentIdentity(
      input.selectionJsonl,
      "independent formal selection JSONL",
      true,
    ),
    selection_manifest: independentV1R11IntentIdentity(
      input.selectionManifest,
      "independent formal selection manifest",
    ),
    source_revision: input.sourceRevision,
    engine: Object.freeze({
      binary: independentV1R11IntentIdentity(
        input.engine.binary,
        "independent formal engine binary",
      ),
      eval_file: independentV1R11IntentIdentity(
        input.engine.evalFile,
        "independent formal eval file",
      ),
      receipt: independentV1R11IntentIdentity(
        input.engine.receipt,
        "independent formal engine receipt",
      ),
    }),
    teacher: independentV1R11IntentContract(
      input.teacherContract,
      "independent formal teacher contract",
    ),
    candidate_generation: independentV1R11IntentContract(
      input.candidateContract,
      "independent formal candidate contract",
    ),
    planned_final_launchagent_descriptor: independentV1R11IntentIdentity(
      input.plannedFinalDescriptor,
      "independent formal planned descriptor",
    ),
  });
  return sha256(
    `${V1R11_FORMAL_RUN_INTENT_DOMAIN}${canonicalHalfkp81Depth18Json(payload)}`,
  );
}

export function independentlyComputeHalfkp81Depth18V1R11ArtifactFingerprintForTests(
  value: unknown,
): string {
  const root = exactObject(
    value,
    [
      "teacherPlan",
      "selectionJsonl",
      "selectionManifest",
      "sourceRevision",
      "engine",
      "teacherContract",
      "candidateContract",
      "plannedFinalDescriptor",
    ],
    "independent artifact formal-run-intent-v2 input",
  );
  const engine = exactObject(
    root.engine,
    ["binary", "evalFile", "receipt"],
    "independent artifact formal engine",
  );
  return independentV1R11RunFingerprint({
    teacherPlan: root.teacherPlan as Readonly<Halfkp81Depth18ArtifactIdentity>,
    selectionJsonl:
      root.selectionJsonl as Readonly<Halfkp81Depth18ArtifactIdentity>,
    selectionManifest:
      root.selectionManifest as Readonly<Halfkp81Depth18ArtifactIdentity>,
    sourceRevision: String(root.sourceRevision),
    engine: {
      binary: engine.binary as Readonly<Halfkp81Depth18ArtifactIdentity>,
      evalFile: engine.evalFile as Readonly<Halfkp81Depth18ArtifactIdentity>,
      receipt: engine.receipt as Readonly<Halfkp81Depth18ArtifactIdentity>,
    },
    teacherContract: root.teacherContract as Readonly<Record<string, unknown>>,
    candidateContract:
      root.candidateContract as Readonly<Record<string, unknown>>,
    plannedFinalDescriptor:
      root.plannedFinalDescriptor as Readonly<Halfkp81Depth18ArtifactIdentity>,
  });
}

function expectedV1R11RunFingerprint(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  selectionRows: readonly Readonly<SelectionParent>[],
): string {
  const evidence = request.powerContinuity;
  if (evidence === undefined) {
    throw new Error("v1r11 run fingerprint authority evidence is missing");
  }
  if (evidence.launchAgentPlist === undefined) {
    throw new Error("v1r11 planned final descriptor evidence is missing");
  }
  if (
    /[0-9a-f]{64}/u.test(
      Buffer.from(evidence.launchAgentPlist.bytes).toString("utf8"),
    )
  ) {
    throw new Error("v1r11 planned final descriptor contains a fingerprint");
  }
  return independentlyComputeHalfkp81Depth18V1R11ArtifactFingerprintForTests({
      teacherPlan: identityFromSnapshot(
        request.plan,
        HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11,
      ),
      selectionJsonl: identityFromSnapshot(
        request.selection,
        HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
        selectionRows.length,
      ),
      selectionManifest: identityFromSnapshot(
        request.selectionManifest,
        HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
      ),
      sourceRevision: String(plan.source_revision),
      engine: {
        binary: identityFromSnapshot(
          request.engineBinary,
          V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
        ),
        evalFile: identityFromSnapshot(
          request.engineEval,
          V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
        ),
        receipt: identityFromSnapshot(
          request.engineReceipt,
          "shogi-teacher-engine-receipt-v1",
        ),
      },
      teacherContract: plan.teacher as Readonly<Record<string, unknown>>,
      candidateContract: YANEURA_ONLY_V1R9_CANDIDATE_GENERATION,
      plannedFinalDescriptor: identityFromSnapshot(
        evidence.launchAgentPlist,
        "application/x-apple-aspen-config-exact-bytes",
      ),
    });
}

function validatePlanAndHeader(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  headerValue: unknown,
  selectionRows: readonly Readonly<SelectionParent>[],
): Readonly<Halfkp81Depth18TeacherWorkHeader> {
  const planSchema = plan.schema;
  const yaneuraOnly = isYaneuraOnlyPlanSchema(planSchema);
  if (
    planSchema !== HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA &&
    !isBoundedStablePlanSchema(planSchema) &&
    !yaneuraOnly
  ) {
    throw new Error("teacher plan schema is unsupported");
  }
  if (
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 ||
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
  ) {
    const teacher = exactObject(
      plan.teacher,
      [
        "candidate_policy",
        "engine",
        "engine_identity",
        "fallback_lane",
        "maximum_rows",
        "maximum_rows_per_parent",
        "minimum_rows_per_parent",
        "normal_lane",
        "old_depth6_or_depth12_cp_target_rows",
        "parent_publication",
        "persistent_normal_engine_processes",
        "reset_timeout_recovery",
      ],
      "v1r9 teacher",
    );
    const normal = exactObject(
      teacher.normal_lane,
      [
        "capped_label_publication_allowed",
        "depth",
        "hash_mib_per_process",
        "minimum_completed_depth",
        "minimum_completed_depth_purpose",
        "node_cap",
        "node_cap_result",
        "processes",
        "routing_condition",
        "routing_scope",
        "search_timeout_milliseconds",
        "threads_per_process",
        "whole_parent_discard_before_fallback",
      ],
      "v1r9 normal lane",
    );
    const fallback = exactObject(
      teacher.fallback_lane,
      [
        "candidate_set",
        "capped_label_publication_allowed",
        "depth",
        "engine_lifetime",
        "fifo_queue",
        "fallback_hash_downgrade_allowed",
        "forbidden_hash_mib_substitutions",
        "hash_mib_per_process",
        "hash_mib_must_equal",
        "maximum_concurrent_processes",
        "node_cap",
        "partial_or_normal_lane_rescore_reuse_allowed",
        "publication",
        "rescore_all_candidates_from_zero",
        "search_timeout_milliseconds",
        "threads_per_process",
      ],
      "v1r9 fallback lane",
    );
    if (
      !sameJson(normal, {
        capped_label_publication_allowed: false,
        depth: 18,
        hash_mib_per_process: 512,
        minimum_completed_depth: 1,
        minimum_completed_depth_purpose: "routing-only-not-label-quality-floor",
        node_cap: 2_000_000_000,
        node_cap_result: "route-whole-parent-never-label",
        processes: 8,
        routing_condition:
          "any-independent-rescore-terminates-at-node-cap-before-exact-depth18",
        routing_scope: "whole-parent",
        search_timeout_milliseconds: 14_400_000,
        threads_per_process: 1,
        whole_parent_discard_before_fallback: true,
      }) ||
      !sameJson(fallback, {
        candidate_set: "reuse-fixed-normal-proposal-candidate-order-and-digest",
        capped_label_publication_allowed: false,
        depth: 18,
        engine_lifetime: "fresh-engine-per-escalated-parent",
        fifo_queue: true,
        fallback_hash_downgrade_allowed: false,
        forbidden_hash_mib_substitutions: [2_048, 4_096],
        hash_mib_per_process: 8_192,
        hash_mib_must_equal: 8_192,
        maximum_concurrent_processes: 2,
        node_cap: null,
        partial_or_normal_lane_rescore_reuse_allowed: false,
        publication: "only-after-all-candidates-complete-exact-depth18",
        rescore_all_candidates_from_zero: true,
        search_timeout_milliseconds: 14_400_000,
        threads_per_process: 1,
      })
    ) {
      throw new Error("v1r9 sealed teacher lane contract differs");
    }
  }
  const header = exactObject(
    headerValue,
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
      ? HALFKP81_V1R11_WORK_HEADER_FIELDS
      : yaneuraOnly
        ? [
            "schema",
            "kind",
            "run_fingerprint",
            "teacher_plan",
            "selection_jsonl",
            "selection_manifest",
            "source_revision",
            "engine",
            "teacher",
            "candidate_generation",
            "label_policy",
          ]
        : [
            "schema",
            "kind",
            "run_fingerprint",
            "teacher_plan",
            "selection_jsonl",
            "selection_manifest",
            "source_revision",
            "engine",
            "teacher",
            "stable_runtime",
            "label_policy",
          ],
    "teacher work header",
  );
  if (
    header.schema !==
      (yaneuraOnly
        ? yaneuraOnlyWorkSchema(planSchema)
        : HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA) ||
    (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
      ? header.status !== "formal-work-ledger-open" ||
        header.record_kind !== "header"
      : header.kind !== "header") ||
    typeof header.run_fingerprint !== "string" ||
    !SHA256_RE.test(header.run_fingerprint) ||
    typeof header.source_revision !== "string" ||
    !REVISION_RE.test(header.source_revision) ||
    plan.source_revision !== header.source_revision
  ) {
    throw new Error("teacher work header fixed identity differs");
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11) {
    validateV1R11FormalAuthoritySnapshots(
      request,
      plan,
      header.run_fingerprint,
    );
    if (request.powerContinuity === undefined) {
      throw new Error("v1r11 work header requires held authority evidence");
    }
    validateDeclaredIdentity(
      header.launchagent_authority_evidence,
      request.powerContinuity.launchAgentAuthority,
      "v1r11 work header LaunchAgent authority",
      { schema: HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA },
    );
    validateDeclaredIdentity(
      header.preformal_authority_verified_receipt,
      request.powerContinuity.preformalAuthority,
      "v1r11 work header verified preformal authority",
      { schema: HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA },
    );
    const entries = parseV1R11FrozenPowerLedger(
      request.powerContinuity.ledger,
      request,
      plan,
      header.run_fingerprint as string,
    );
    if (!sameJson(header.power_admission_entry, entries[0])) {
      throw new Error("v1r11 work header power admission entry differs");
    }
    validateV1R11IsoUtc(
      header.opened_at_utc,
      "v1r11 work header opened_at_utc",
    );
  }
  const selectionEvidence = exactObject(
    plan.selection_evidence,
    [
      "schema",
      "status",
      "source_revision",
      "selection_jsonl",
      "selection_manifest",
      "phase_name_map",
      "accounting",
      "bindings",
      "verification",
    ],
    "teacher plan selection evidence",
  );
  const evidenceSelection = exactObject(
    selectionEvidence.selection_jsonl,
    [
      "path",
      "bytes",
      "sha256",
      "held_read_only_descriptor",
      "stable_double_read",
      "rows",
      "schema",
    ],
    "teacher plan selection JSONL evidence",
  );
  const evidenceManifest = exactObject(
    selectionEvidence.selection_manifest,
    [
      "path",
      "bytes",
      "sha256",
      "held_read_only_descriptor",
      "stable_double_read",
      "schema",
    ],
    "teacher plan selection manifest evidence",
  );
  if (
    selectionEvidence.source_revision !== header.source_revision ||
    evidenceSelection.held_read_only_descriptor !== true ||
    evidenceSelection.stable_double_read !== true ||
    evidenceManifest.held_read_only_descriptor !== true ||
    evidenceManifest.stable_double_read !== true
  ) {
    throw new Error("teacher plan selection held-read evidence differs");
  }
  validateDeclaredIdentity(
    {
      path: evidenceSelection.path,
      bytes: evidenceSelection.bytes,
      sha256: evidenceSelection.sha256,
      schema: evidenceSelection.schema,
      rows: evidenceSelection.rows,
    },
    request.selection,
    "teacher plan selection JSONL evidence",
    {
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
      rows: selectionRows.length,
    },
  );
  validateDeclaredIdentity(
    {
      path: evidenceManifest.path,
      bytes: evidenceManifest.bytes,
      sha256: evidenceManifest.sha256,
      schema: evidenceManifest.schema,
    },
    request.selectionManifest,
    "teacher plan selection manifest evidence",
    { schema: HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA },
  );
  validateDeclaredIdentity(
    plan.selection_manifest,
    request.selectionManifest,
    "teacher plan selection manifest",
    { schema: HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA },
  );
  const selectionManifest = parseCanonicalDocument(
    request.selectionManifest,
    "selection manifest",
  );
  const manifestOutput = exactObject(
    selectionManifest.output,
    ["path", "bytes", "sha256", "rows"],
    "selection manifest output",
  );
  if (
    !sameJson(manifestOutput, {
      path: request.selection.identity.path,
      bytes: request.selection.bytes.byteLength,
      sha256: sha256(request.selection.bytes),
      rows: selectionRows.length,
    })
  ) {
    throw new Error("selection manifest output differs from held selection");
  }
  validateDeclaredIdentity(
    header.teacher_plan,
    request.plan,
    "teacher work teacher plan",
    {
      schema: planSchema,
    },
  );
  if (planSchema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11) {
    validateDeclaredIdentity(
      header.selection_jsonl,
      request.selection,
      "teacher work selection JSONL",
      {
        schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
        rows: selectionRows.length,
      },
    );
    validateDeclaredIdentity(
      header.selection_manifest,
      request.selectionManifest,
      "teacher work selection manifest",
      { schema: HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA },
    );
    const engine = exactObject(
      header.engine,
      ["binary", "eval_file", "receipt"],
      "teacher work engine",
    );
    validateDeclaredIdentity(
      engine.binary,
      request.engineBinary,
      "teacher engine binary",
    );
    validateDeclaredIdentity(
      engine.eval_file,
      request.engineEval,
      "teacher engine eval",
    );
    validateDeclaredIdentity(
      engine.receipt,
      request.engineReceipt,
      "teacher engine receipt",
      { schema: "shogi-teacher-engine-receipt-v1" },
    );
  }
  const planEngine = exactObject(
    plan.engine,
    [
      "binary",
      "eval_file",
      ...(planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
        ? ["receipt"]
        : []),
      "eval_tree_sha256",
      "source_revision",
      "id",
    ],
    "teacher plan engine",
  );
  const planBinary = exactObject(
    planEngine.binary,
    ["path", "bytes", "sha256"],
    "teacher plan engine binary",
  );
  const planEval = exactObject(
    planEngine.eval_file,
    ["path", "bytes", "sha256"],
    "teacher plan engine eval",
  );
  if (
    !sameJson(planBinary, identityFromSnapshot(request.engineBinary)) ||
    !sameJson(planEval, identityFromSnapshot(request.engineEval))
  ) {
    throw new Error("teacher header engine differs from sealed plan");
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11) {
    validateDeclaredIdentity(
      planEngine.receipt,
      request.engineReceipt,
      "v1r11 teacher plan engine receipt",
      { schema: "shogi-teacher-engine-receipt-v1" },
    );
  }
  if (
    (planSchema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 &&
      !sameJson(header.teacher, plan.teacher)) ||
    (isBoundedStablePlanSchema(planSchema) &&
      !sameJson(header.teacher, BOUNDED_STABLE_V3_TEACHER)) ||
    (yaneuraOnly &&
      planSchema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 &&
      planSchema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 &&
      !sameJson(
        plan.teacher,
        planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 ||
          planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
          ? YANEURA_ONLY_V1R5_TEACHER
          : YANEURA_ONLY_V1_TEACHER,
      )) ||
    (yaneuraOnly &&
      planSchema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 &&
      !sameJson(
        header.candidate_generation,
        planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
          ? YANEURA_ONLY_V1R9_CANDIDATE_GENERATION
          : YANEURA_ONLY_CANDIDATE_GENERATION_V1,
      ))
  ) {
    throw new Error("teacher work policy differs from sealed plan");
  }
  const stableRuntime = yaneuraOnly
    ? undefined
    : validateStableRuntime(header.stable_runtime, planSchema);
  if (
    planSchema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 &&
    header.label_policy !== SIBLING_TEACHER_LABEL_POLICY
  ) {
    throw new Error("teacher work label policy differs");
  }
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11) {
    const runIdentity = exactObject(
      plan.run_identity,
      [
        "new_clean_merged_source_revision_required",
        "new_run_fingerprint_required",
        "runtime_fingerprint_status",
        "must_differ_from_v1r10_run_fingerprint",
        "formal_run_intent_v2",
        "training_implementation_boundary",
      ],
      "v1r11 run identity",
    );
    const expectedFingerprint = expectedV1R11RunFingerprint(
      request,
      plan,
      selectionRows,
    );
    if (
      header.run_fingerprint !== expectedFingerprint ||
      header.run_fingerprint ===
        runIdentity.must_differ_from_v1r10_run_fingerprint
    ) {
      throw new Error("v1r11 teacher work run fingerprint differs");
    }
    return header as unknown as Readonly<Halfkp81Depth18TeacherWorkHeader>;
  }
  const fingerprintBase = {
    teacher_plan: header.teacher_plan,
    selection_jsonl: header.selection_jsonl,
    selection_manifest: header.selection_manifest,
    source_revision: header.source_revision,
    engine: header.engine,
    teacher: header.teacher,
  };
  const fingerprintPayload = yaneuraOnly
    ? {
        ...fingerprintBase,
        candidate_generation: header.candidate_generation,
      }
    : {
        ...fingerprintBase,
        stable_runtime: stableRuntime,
      };
  const expectedFingerprint = sha256(
    `${HALFKP81_DEPTH18_RUN_FINGERPRINT_DOMAIN}${canonicalHalfkp81Depth18Json(
      fingerprintPayload,
    )}`,
  );
  if (header.run_fingerprint !== expectedFingerprint) {
    throw new Error("teacher work header run fingerprint differs");
  }
  return header as unknown as Readonly<Halfkp81Depth18TeacherWorkHeader>;
}

function validateV1R11PowerAnchor(value: unknown, label: string): void {
  const anchor = exactObject(
    value,
    [
      "boot_session_identity",
      "timestamp_utc",
      "timezone_offset",
      "pmset_event_ordinal",
      "last_raw_event_line_sha256",
    ],
    label,
  );
  validateV1R11IsoUtc(anchor.timestamp_utc, `${label}.timestamp_utc`);
  if (
    typeof anchor.boot_session_identity !== "string" ||
    anchor.boot_session_identity.length < 1 ||
    typeof anchor.timezone_offset !== "string" ||
    !/^[+-]\d{2}:\d{2}$/u.test(anchor.timezone_offset) ||
    !Number.isSafeInteger(anchor.pmset_event_ordinal) ||
    Number(anchor.pmset_event_ordinal) < 0 ||
    typeof anchor.last_raw_event_line_sha256 !== "string" ||
    !SHA256_RE.test(anchor.last_raw_event_line_sha256)
  ) {
    throw new Error(`${label} differs`);
  }
}

function validateV1R11PowerObservation(
  value: unknown,
  rowTimestamp: unknown,
  evidence: NonNullable<Halfkp81Depth18ValidationRequest["powerContinuity"]>,
  allowFault: boolean,
  label: string,
): Readonly<Record<string, unknown>> {
  const observation = exactObject(
    value,
    [
      "timestamp_utc",
      "power_source",
      "battery_percentage",
      "runner_pid",
      "guardian_pid",
      "caffeinate_assertion_holder_pid",
      "caffeinate_assertion_holder_parent_runner_pid",
      "caffeinate_executable",
      "caffeinate_argv",
      "runner_utility_argv",
      "launchagent_authority_evidence",
      "preformal_authority_verified_receipt",
      "assertion_owner_caffeinate_pid",
      "required_assertions",
      "boot_session_identity",
      "pmset_start_anchor",
      "pmset_current_cursor",
    ],
    label,
  );
  validateV1R11IsoUtc(observation.timestamp_utc, `${label}.timestamp_utc`);
  validateV1R11PowerAnchor(
    observation.pmset_start_anchor,
    `${label}.pmset_start_anchor`,
  );
  validateV1R11PowerAnchor(
    observation.pmset_current_cursor,
    `${label}.pmset_current_cursor`,
  );
  const startAnchor = observation.pmset_start_anchor as Readonly<
    Record<string, unknown>
  >;
  const currentCursor = observation.pmset_current_cursor as Readonly<
    Record<string, unknown>
  >;
  validateV1R11FullIdentity(
    observation.launchagent_authority_evidence,
    evidence.launchAgentAuthority,
    HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
    `${label}.launchagent_authority_evidence`,
  );
  validateV1R11FullIdentity(
    observation.preformal_authority_verified_receipt,
    evidence.preformalAuthority,
    HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
    `${label}.preformal_authority_verified_receipt`,
  );
  const assertions = [
    "PreventSystemSleep",
    "PreventUserIdleSystemSleep",
    "PreventUserIdleDisplaySleep",
  ];
  if (
    observation.timestamp_utc !== rowTimestamp ||
    typeof observation.power_source !== "string" ||
    (!allowFault && observation.power_source !== "AC Power") ||
    !Number.isSafeInteger(observation.battery_percentage) ||
    Number(observation.battery_percentage) < 0 ||
    Number(observation.battery_percentage) > 100 ||
    !Number.isSafeInteger(observation.runner_pid) ||
    Number(observation.runner_pid) < 1 ||
    !Number.isSafeInteger(observation.guardian_pid) ||
    Number(observation.guardian_pid) < 1 ||
    !Number.isSafeInteger(observation.caffeinate_assertion_holder_pid) ||
    Number(observation.caffeinate_assertion_holder_pid) < 1 ||
    !Number.isSafeInteger(
      observation.caffeinate_assertion_holder_parent_runner_pid,
    ) ||
    observation.caffeinate_assertion_holder_parent_runner_pid !==
      observation.runner_pid ||
    observation.caffeinate_assertion_holder_pid === observation.runner_pid ||
    observation.assertion_owner_caffeinate_pid !==
      observation.caffeinate_assertion_holder_pid ||
    observation.caffeinate_executable !== "/usr/bin/caffeinate" ||
    !Array.isArray(observation.runner_utility_argv) ||
    observation.runner_utility_argv.length < 1 ||
    !sameJson(observation.caffeinate_argv, [
      "/usr/bin/caffeinate",
      "-dimsu",
      "-w",
      String(observation.runner_pid),
    ]) ||
    !sameJson(
      [...((observation.required_assertions as unknown[]) ?? [])].sort(),
      [...assertions].sort(),
    ) ||
    typeof observation.boot_session_identity !== "string" ||
    observation.boot_session_identity.length < 1 ||
    startAnchor.boot_session_identity !== observation.boot_session_identity ||
    currentCursor.boot_session_identity !== observation.boot_session_identity
  ) {
    throw new Error(`${label} semantics differ`);
  }
  return observation;
}

function parseV1R11FrozenPowerLedger(
  snapshot: Readonly<Halfkp81Depth18PrivateSnapshot>,
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  runFingerprint: string,
): readonly Readonly<Record<string, unknown>>[] {
  const evidence = request.powerContinuity;
  if (evidence === undefined) {
    throw new Error("v1r11 power evidence is missing");
  }
  const rows = parseExactJsonl(snapshot.bytes, "v1r11 power continuity ledger");
  if (rows.length < 2) {
    throw new Error("v1r11 power continuity ledger is incomplete");
  }
  let previous: string | null = null;
  let previousObservation: Readonly<Record<string, unknown>> | undefined;
  const parsed = rows.map((untrusted, index) => {
    const row = exactObject(
      untrusted,
      HALFKP81_V1R11_POWER_ENTRY_FIELDS,
      `v1r11 power continuity row ${index + 1}`,
    );
    const isLast = index === rows.length - 1;
    const allowed = new Set([
      "admission-pass",
      "sample-pass",
      "final-pass",
      "environment-fault",
    ]);
    if (
      row.schema !== HALFKP81_V1R11_POWER_LEDGER_SCHEMA ||
      !allowed.has(String(row.status)) ||
      typeof row.entry_kind !== "string" ||
      row.source_revision !== plan.source_revision ||
      row.run_fingerprint !== runFingerprint ||
      row.previous_entry_sha256 !== previous ||
      typeof row.entry_sha256 !== "string" ||
      !SHA256_RE.test(row.entry_sha256) ||
      (index === 0 &&
        (row.status !== "admission-pass" || row.entry_kind !== "admission")) ||
      (!isLast &&
        index > 0 &&
        (row.status !== "sample-pass" || row.entry_kind !== "sample")) ||
      (isLast &&
        !(
          (row.status === "final-pass" && row.entry_kind === "final") ||
          (row.status === "environment-fault" &&
            row.entry_kind === "environment-fault")
        ))
    ) {
      throw new Error(`v1r11 power continuity row ${index + 1} differs`);
    }
    if (
      row.status === "environment-fault"
        ? (() => {
            const closure = exactObject(
              row.environment_fault,
              ["kind", "message", "intent_sha256"],
              `v1r11 power continuity row ${index + 1}.environment_fault`,
            );
            return (
              closure.kind !== "environment-continuity" ||
              typeof closure.message !== "string" ||
              closure.message.length < 1 ||
              typeof closure.intent_sha256 !== "string" ||
              !SHA256_RE.test(closure.intent_sha256)
            );
          })()
        : row.environment_fault !== null
    ) {
      throw new Error(
        `v1r11 power continuity row ${index + 1} environment fault closure differs`,
      );
    }
    validateV1R11IsoUtc(
      row.timestamp_utc,
      `v1r11 power continuity row ${index + 1}.timestamp_utc`,
    );
    validateV1R11FullIdentity(
      row.teacher_plan,
      request.plan,
      plan.schema as string,
      `v1r11 power continuity row ${index + 1}.teacher_plan`,
    );
    validateV1R11FullIdentity(
      row.launchagent_authority_evidence,
      evidence.launchAgentAuthority,
      HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
      `v1r11 power continuity row ${index + 1}.launchagent_authority_evidence`,
    );
    validateV1R11FullIdentity(
      row.preformal_authority_verified_receipt,
      evidence.preformalAuthority,
      HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
      `v1r11 power continuity row ${index + 1}.preformal_authority_verified_receipt`,
    );
    const observation = validateV1R11PowerObservation(
      row.observation,
      row.timestamp_utc,
      evidence,
      row.status === "environment-fault",
      `v1r11 power continuity row ${index + 1}.observation`,
    );
    if (index === 0 && Number(observation.battery_percentage) < 80) {
      throw new Error("v1r11 power admission battery is below 80 percent");
    }
    validateV1R11CurrentPmsetAnchors(
      observation.pmset_start_anchor,
      observation.pmset_current_cursor,
      evidence.currentPmsetLogRows,
    );
    if (
      previousObservation !== undefined &&
      (observation.runner_pid !== previousObservation.runner_pid ||
        observation.guardian_pid !== previousObservation.guardian_pid ||
        observation.caffeinate_assertion_holder_pid !==
          previousObservation.caffeinate_assertion_holder_pid ||
        observation.caffeinate_assertion_holder_parent_runner_pid !==
          previousObservation.caffeinate_assertion_holder_parent_runner_pid ||
        observation.assertion_owner_caffeinate_pid !==
          previousObservation.assertion_owner_caffeinate_pid ||
        observation.caffeinate_executable !==
          previousObservation.caffeinate_executable ||
        !sameJson(
          observation.caffeinate_argv,
          previousObservation.caffeinate_argv,
        ) ||
        !sameJson(
          observation.runner_utility_argv,
          previousObservation.runner_utility_argv,
        ) ||
        !sameJson(
          observation.required_assertions,
          previousObservation.required_assertions,
        ) ||
        observation.boot_session_identity !==
          previousObservation.boot_session_identity ||
        !sameJson(
          observation.pmset_start_anchor,
          previousObservation.pmset_start_anchor,
        ) ||
        Number(
          (
            observation.pmset_current_cursor as Readonly<
              Record<string, unknown>
            >
          ).pmset_event_ordinal,
        ) <
          Number(
            (
              previousObservation.pmset_current_cursor as Readonly<
                Record<string, unknown>
              >
            ).pmset_event_ordinal,
          ) ||
        new Date(String(observation.timestamp_utc)).getTime() <
          new Date(String(previousObservation.timestamp_utc)).getTime() ||
        new Date(String(observation.timestamp_utc)).getTime() -
          new Date(String(previousObservation.timestamp_utc)).getTime() >
          30_000)
    ) {
      throw new Error(
        `v1r11 power continuity row ${index + 1} continuity differs`,
      );
    }
    const { entry_sha256: _ignored, ...preimage } = row;
    const digest = sha256(
      `${HALFKP81_V1R11_POWER_ENTRY_DOMAIN}${canonicalHalfkp81Depth18Json(preimage)}`,
    );
    if (digest !== row.entry_sha256) {
      throw new Error(`v1r11 power continuity row ${index + 1} digest differs`);
    }
    previous = digest;
    previousObservation = observation;
    return row;
  });
  return Object.freeze(parsed);
}

function validateV1R11FrozenPowerReceipt(
  snapshot: Readonly<Halfkp81Depth18PrivateSnapshot>,
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  runFingerprint: string,
  entries: readonly Readonly<Record<string, unknown>>[],
  expectedStatus: "power-continuity-verified" | "environment-fault-closed",
  verifyTrackedProducer = true,
): Readonly<Record<string, unknown>> {
  const evidence = request.powerContinuity;
  if (evidence === undefined) {
    throw new Error("v1r11 power receipt evidence is missing");
  }
  const receipt = parseCanonicalDocument(snapshot, "v1r11 power receipt");
  exactObject(
    receipt,
    HALFKP81_V1R11_POWER_RECEIPT_FIELDS,
    "v1r11 power receipt",
  );
  const final = entries[entries.length - 1]!;
  if (
    receipt.schema !== HALFKP81_V1R11_POWER_RECEIPT_SCHEMA ||
    receipt.status !== expectedStatus ||
    receipt.source_revision !== plan.source_revision ||
    receipt.run_fingerprint !== runFingerprint ||
    !sameJson(receipt.admission_entry, entries[0]) ||
    !sameJson(receipt.final_entry, final) ||
    (expectedStatus === "power-continuity-verified"
      ? final.status !== "final-pass" || final.entry_kind !== "final"
      : final.status !== "environment-fault" ||
        final.entry_kind !== "environment-fault") ||
    (expectedStatus === "power-continuity-verified"
      ? receipt.environment_fault_preimage_sha256 !== null
      : typeof receipt.environment_fault_preimage_sha256 !== "string" ||
        !SHA256_RE.test(receipt.environment_fault_preimage_sha256))
  ) {
    throw new Error("v1r11 power receipt differs");
  }
  validateV1R11FullIdentity(
    receipt.teacher_plan,
    request.plan,
    plan.schema as string,
    "v1r11 power receipt teacher plan",
  );
  validateV1R11FullIdentity(
    receipt.power_ledger,
    evidence.ledger,
    HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
    "v1r11 power receipt ledger",
  );
  validateV1R11FullIdentity(
    receipt.launchagent_authority_evidence,
    evidence.launchAgentAuthority,
    HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
    "v1r11 power receipt LaunchAgent authority",
  );
  validateV1R11FullIdentity(
    receipt.preformal_authority_verified_receipt,
    evidence.preformalAuthority,
    HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
    "v1r11 power receipt verified preformal authority",
  );
  if (verifyTrackedProducer) {
    validateV1R11TrackedImplementationIdentity(
      receipt.producer,
      plan.source_revision as string,
      "v1r11 power receipt producer",
      "ml/halfkp81-depth18-power-continuity-guardian.ts",
    );
  } else {
    validateV1R11ImplementationIdentity(
      receipt.producer,
      plan.source_revision,
      "v1r11 power receipt producer",
    );
  }
  const admissionObservation = entries[0]!.observation as Readonly<
    Record<string, unknown>
  >;
  const finalObservation = final.observation as Readonly<
    Record<string, unknown>
  >;
  if (
    !sameJson(
      receipt.pmset_start_anchor,
      admissionObservation.pmset_start_anchor,
    ) ||
    !sameJson(receipt.pmset_end_anchor, finalObservation.pmset_current_cursor)
  ) {
    throw new Error("v1r11 power receipt pmset anchors differ");
  }
  return receipt;
}

function validateV1R11EnvironmentFaultPreimageBinding(
  terminalFault: Readonly<Record<string, unknown>>,
  powerReceipt: Readonly<Record<string, unknown>>,
): string {
  const intent = Object.freeze({
    schema: HALFKP81_V1R11_ENVIRONMENT_FAULT_INTENT_SCHEMA,
    status: "runner-closed-power-fault-awaiting-outer-cleanup",
    teacher_plan: terminalFault.teacher_plan,
    source_revision: terminalFault.source_revision,
    run_fingerprint: terminalFault.run_fingerprint,
    preformal_authority_verified_receipt:
      terminalFault.preformal_authority_verified_receipt,
    launchagent_authority_evidence:
      terminalFault.launchagent_authority_evidence,
    fault: terminalFault.fault,
    authority: Object.freeze({
      may_publish_terminal_fault: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
  const expectedPreimage = sha256(canonicalHalfkp81Depth18Json(intent));
  const finalEntry = exactObject(
    powerReceipt.final_entry,
    HALFKP81_V1R11_POWER_ENTRY_FIELDS,
    "v1r11 environment power receipt final entry",
  );
  const closure = exactObject(
    finalEntry.environment_fault,
    ["kind", "message", "intent_sha256"],
    "v1r11 environment power receipt final fault closure",
  );
  const fault = exactObject(
    terminalFault.fault,
    ["kind", "message"],
    "v1r11 environment terminal fault reason",
  );
  if (
    terminalFault.fault_preimage_sha256 !== expectedPreimage ||
    powerReceipt.environment_fault_preimage_sha256 !== expectedPreimage ||
    closure.intent_sha256 !== expectedPreimage ||
    closure.kind !== fault.kind ||
    closure.message !== fault.message
  ) {
    throw new Error("v1r11 environment terminal fault cross-binding differs");
  }
  return expectedPreimage;
}

/** Focused byte/chain seam for the frozen formal power schemas. */
export function validateHalfkp81Depth18V1R11FrozenPowerChainForTests(
  request: Readonly<{
    plan: Readonly<Halfkp81Depth18PrivateSnapshot>;
    ledger: Readonly<Halfkp81Depth18PrivateSnapshot>;
    receipt: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    preformalAuthority: Readonly<Halfkp81Depth18PrivateSnapshot>;
    launchAgentPlist?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    processCleanupEvidence?: Readonly<Halfkp81Depth18PrivateSnapshot>;
    currentPmsetLogRows: readonly string[];
    runFingerprint: string;
    terminalFault?: Readonly<Halfkp81Depth18PrivateSnapshot>;
  }>,
): Readonly<Record<string, unknown>> {
  const plan = parseCanonicalDocument(request.plan, "v1r11 test teacher plan");
  if (
    plan.schema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 ||
    typeof plan.source_revision !== "string" ||
    !REVISION_RE.test(plan.source_revision) ||
    !SHA256_RE.test(request.runFingerprint)
  ) {
    throw new Error("v1r11 test power context differs");
  }
  const syntheticRequest = {
    plan: request.plan,
    powerContinuity: {
      ledger: request.ledger,
      receipt: request.receipt,
      launchAgentAuthority: request.launchAgentAuthority,
      preformalAuthority: request.preformalAuthority,
      currentPmsetLogRows: request.currentPmsetLogRows,
    },
  } as unknown as Readonly<Halfkp81Depth18ValidationRequest>;
  const entries = parseV1R11FrozenPowerLedger(
    request.ledger,
    syntheticRequest,
    plan,
    request.runFingerprint,
  );
  const final = entries[entries.length - 1]!;
  const terminalFaultSnapshot = request.terminalFault;
  if (terminalFaultSnapshot === undefined) {
    if (final.status !== "final-pass" || final.entry_kind !== "final") {
      throw new Error("v1r11 test success ledger terminal row differs");
    }
    const success = validateV1R11PowerContinuitySuccess(
      syntheticRequest,
      plan,
      request.runFingerprint,
      false,
    );
    return Object.freeze({
      status: "power-continuity-verified",
      rows: entries.length,
      receipt: success.receipt.identity,
    });
  }
  if (
    final.status !== "environment-fault" ||
    final.entry_kind !== "environment-fault"
  ) {
    throw new Error("v1r11 test fault ledger terminal row differs");
  }
  const receipt = validateV1R11FrozenPowerReceipt(
    request.receipt,
    syntheticRequest,
    plan,
    request.runFingerprint,
    entries,
    "environment-fault-closed",
    false,
  );
  const fault = parseCanonicalDocument(
    terminalFaultSnapshot,
    "v1r11 test environment terminal fault",
  );
  exactObject(
    fault,
    HALFKP81_V1R11_ENVIRONMENT_FAULT_FIELDS,
    "v1r11 test environment terminal fault",
  );
  if (
    fault.schema !== HALFKP81_V1R11_ENVIRONMENT_FAULT_SCHEMA ||
    fault.status !== "environment-continuity-fault-family-closed" ||
    fault.source_revision !== plan.source_revision ||
    fault.run_fingerprint !== request.runFingerprint ||
    !sameJson(fault.authority, {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error("v1r11 test environment terminal fault differs");
  }
  validateV1R11FullIdentity(
    fault.teacher_plan,
    request.plan,
    plan.schema as string,
    "v1r11 test fault teacher plan",
  );
  validateV1R11FullIdentity(
    fault.launchagent_authority_evidence,
    request.launchAgentAuthority,
    HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
    "v1r11 test fault LaunchAgent evidence",
  );
  validateV1R11FullIdentity(
    fault.preformal_authority_verified_receipt,
    request.preformalAuthority,
    HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
    "v1r11 test fault preformal authority",
  );
  validateV1R11FullIdentity(
    fault.power_continuity_ledger,
    request.ledger,
    HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
    "v1r11 test fault power ledger",
  );
  validateV1R11FullIdentity(
    fault.power_continuity_receipt,
    request.receipt,
    HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
    "v1r11 test fault power receipt",
  );
  if (
    request.processCleanupEvidence === undefined ||
    request.launchAgentPlist === undefined
  ) {
    throw new Error("v1r11 test fault cleanup held evidence is missing");
  }
  validateV1R11FullIdentity(
    fault.process_cleanup_evidence,
    request.processCleanupEvidence,
    HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA,
    "v1r11 test fault cleanup evidence",
  );
  const cleanup = validateV1R11ProcessCleanupEvidence(
    request.processCleanupEvidence,
    {
      plan: request.plan,
      planValue: plan,
      launchAgentAuthority: request.launchAgentAuthority,
      launchAgentPlist: request.launchAgentPlist,
      sourceRevision: String(plan.source_revision),
      runFingerprint: request.runFingerprint,
      scope: "post-formal-environment",
      verifyTrackedProducer: false,
    },
  );
  if (!sameJson(fault.process_cleanup, cleanup)) {
    throw new Error("v1r11 test fault cleanup summary differs from held evidence");
  }
  validateV1R11IsoUtc(fault.faulted_at_utc, "v1r11 test fault timestamp");
  validateV1R11EnvironmentFaultPreimageBinding(fault, receipt);
  return Object.freeze({
    status: "environment-fault-closed",
    rows: entries.length,
    terminal_entry_sha256: final.entry_sha256,
  });
}

function validateV1R11PowerContinuitySuccess(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  expectedRunFingerprint: string,
  verifyTrackedProducer = true,
): Readonly<{
  ledger: Readonly<Halfkp81Depth18PrivateSnapshot>;
  receipt: Readonly<Halfkp81Depth18PrivateSnapshot>;
  verification: Readonly<Record<string, unknown>>;
  binding: Readonly<Record<string, unknown>>;
  pmsetVerification: Readonly<Record<string, unknown>>;
}> {
  const evidence = request.powerContinuity;
  if (evidence === undefined) {
    throw new Error("v1r11 requires held power continuity evidence");
  }
  const entries = parseV1R11FrozenPowerLedger(
    evidence.ledger,
    request,
    plan,
    expectedRunFingerprint,
  );
  const final = entries[entries.length - 1]!;
  const receipt = validateV1R11FrozenPowerReceipt(
    evidence.receipt,
    request,
    plan,
    expectedRunFingerprint,
    entries,
    "power-continuity-verified",
    verifyTrackedProducer,
  );
  if (
    !sameJson(
      receipt.pmset_start_anchor,
      exactObject(
        entries[0]!.observation,
        [
          "timestamp_utc",
          "power_source",
          "battery_percentage",
          "runner_pid",
          "guardian_pid",
          "caffeinate_assertion_holder_pid",
          "caffeinate_assertion_holder_parent_runner_pid",
          "caffeinate_executable",
          "caffeinate_argv",
          "runner_utility_argv",
          "launchagent_authority_evidence",
          "preformal_authority_verified_receipt",
          "assertion_owner_caffeinate_pid",
          "required_assertions",
          "boot_session_identity",
          "pmset_start_anchor",
          "pmset_current_cursor",
        ],
        "v1r11 admission observation",
      ).pmset_start_anchor,
    ) ||
    !sameJson(
      receipt.pmset_end_anchor,
      exactObject(
        final.observation,
        [
          "timestamp_utc",
          "power_source",
          "battery_percentage",
          "runner_pid",
          "guardian_pid",
          "caffeinate_assertion_holder_pid",
          "caffeinate_assertion_holder_parent_runner_pid",
          "caffeinate_executable",
          "caffeinate_argv",
          "runner_utility_argv",
          "launchagent_authority_evidence",
          "preformal_authority_verified_receipt",
          "assertion_owner_caffeinate_pid",
          "required_assertions",
          "boot_session_identity",
          "pmset_start_anchor",
          "pmset_current_cursor",
        ],
        "v1r11 final observation",
      ).pmset_current_cursor,
    )
  ) {
    throw new Error("v1r11 power receipt pmset anchors differ");
  }

  const pmsetVerification = validateV1R11CurrentPmsetAnchors(
    receipt.pmset_start_anchor,
    receipt.pmset_end_anchor,
    evidence.currentPmsetLogRows,
  );
  return Object.freeze({
    ledger: evidence.ledger,
    receipt: evidence.receipt,
    verification: Object.freeze({
      rows: entries.length,
      terminal_entry_sha256: final.entry_sha256,
      hash_chain_recomputed: true,
    }),
    binding: Object.freeze({
      launchagent_authority_evidence: receipt.launchagent_authority_evidence,
      preformal_authority_verified_receipt:
        receipt.preformal_authority_verified_receipt,
    }),
    pmsetVerification,
  });
}

function validateRawReceipt(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  completedRows: number,
  roleRows: Readonly<Record<TeacherRole, number>>,
  roleCounts: Readonly<Record<TeacherRole, number>>,
  runFingerprint: string,
  v1r9FallbackRecount?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const v1r11 =
    plan.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11;
  const receipt = parseCanonicalDocument(
    request.rawReceipt,
    "raw teacher receipt",
  );
  if (v1r11) {
    const evidence = request.powerContinuity;
    if (evidence === undefined) {
      throw new Error("v1r11 raw receipt requires held authority evidence");
    }
    const { preformalLedger, preformalRawReceipt } = evidence;
    if (preformalLedger === undefined || preformalRawReceipt === undefined) {
      throw new Error("v1r11 raw receipt preformal snapshots are missing");
    }
    exactObject(
      receipt,
      HALFKP81_V1R11_RAW_TEACHER_RECEIPT_FIELDS,
      "v1r11 raw teacher receipt",
    );
    if (
      receipt.schema !==
        HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11 ||
      receipt.status !== "complete-unverified-no-training-authority" ||
      receipt.source_revision !== plan.source_revision ||
      receipt.run_fingerprint !== runFingerprint ||
      !sameJson(receipt.authority, {
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
    ) {
      throw new Error("v1r11 raw teacher receipt semantics differ");
    }
    validateV1R11FullIdentity(
      receipt.teacher_plan,
      request.plan,
      plan.schema as string,
      "v1r11 raw receipt teacher plan",
    );
    validateV1R11FullIdentity(
      receipt.teacher_work,
      request.work,
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
      "v1r11 raw receipt teacher work",
    );
    const output = exactObject(
      receipt.teacher_output,
      ROLE_ORDER,
      "v1r11 raw receipt teacher output",
    );
    for (const role of ROLE_ORDER) {
      validateDeclaredIdentity(
        output[role],
        request[role],
        `v1r11 raw receipt ${role} output`,
        { schema: HALFKP81_DEPTH18_DATASET_SCHEMA },
      );
    }
    validateV1R11FullIdentity(
      receipt.preformal_authority_ledger,
      preformalLedger,
      HALFKP81_V1R11_PREFORMAL_LEDGER_SCHEMA,
      "v1r11 raw receipt preformal ledger",
    );
    validateV1R11FullIdentity(
      receipt.preformal_authority_raw_receipt,
      preformalRawReceipt,
      HALFKP81_V1R11_PREFORMAL_RAW_AUTHORITY_SCHEMA,
      "v1r11 raw receipt preformal raw receipt",
    );
    validateV1R11FullIdentity(
      receipt.preformal_authority_verified_receipt,
      evidence.preformalAuthority,
      HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
      "v1r11 raw receipt verified preformal receipt",
    );
    validateV1R11FullIdentity(
      receipt.launchagent_authority_evidence,
      evidence.launchAgentAuthority,
      HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
      "v1r11 raw receipt LaunchAgent evidence",
    );
    validateV1R11FullIdentity(
      receipt.power_continuity_ledger,
      evidence.ledger,
      HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
      "v1r11 raw receipt power ledger",
    );
    validateV1R11FullIdentity(
      receipt.power_continuity_receipt,
      evidence.receipt,
      HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
      "v1r11 raw receipt power receipt",
    );
    validateV1R11TrackedImplementationIdentity(
      receipt.finalizer,
      plan.source_revision as string,
      "v1r11 raw receipt finalizer",
      "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
    );
    const outputs = exactObject(
      plan.outputs,
      [
        "directory",
        "plan_json",
        "fit_jsonl",
        "tune_jsonl",
        "sealed_jsonl",
        "work_jsonl",
        "milestone_100_json",
        "milestone_500_json",
        "terminal_fault_json",
        "receipt_json",
        "verified_artifact_receipt_json",
        "power_continuity_jsonl",
        "power_continuity_receipt_json",
        "environment_process_cleanup_evidence_json",
      ],
      "v1r11 teacher plan outputs",
    );
    const authorityOutputs = exactV1R11AuthorityOutputNamespace(
      plan.authority_output_namespace,
    );
    if (
      outputs.plan_json !== request.plan.identity.path ||
      outputs.work_jsonl !== request.work.identity.path ||
      outputs.receipt_json !== request.rawReceipt.identity.path ||
      outputs.fit_jsonl !== request.fit.identity.path ||
      outputs.tune_jsonl !== request.tune.identity.path ||
      outputs.sealed_jsonl !== request.sealed.identity.path ||
      outputs.power_continuity_jsonl !== evidence.ledger.identity.path ||
      outputs.power_continuity_receipt_json !==
        evidence.receipt.identity.path ||
      v1r11AuthorityPath(
        authorityOutputs.preformal_authority_ledger_jsonl,
        "v1r11 preformal ledger path",
      ) !== preformalLedger.identity.path ||
      v1r11AuthorityPath(
        authorityOutputs.preformal_authority_receipt_json,
        "v1r11 preformal raw receipt path",
      ) !== preformalRawReceipt.identity.path ||
      v1r11AuthorityPath(
        authorityOutputs.preformal_authority_verified_receipt_json,
        "v1r11 preformal verified receipt path",
      ) !== evidence.preformalAuthority.identity.path ||
      v1r11AuthorityPath(
        authorityOutputs.launchagent_authority_evidence_json,
        "v1r11 LaunchAgent evidence path",
      ) !== evidence.launchAgentAuthority.identity.path
    ) {
      throw new Error("v1r11 held artifact paths differ from sealed plan");
    }
    validateV1R11PowerContinuitySuccess(request, plan, runFingerprint);
    return receipt;
  }
  const fields = [
    "schema",
    "status",
    "teacher_plan",
    "completed_parents",
    "completed_rows",
    "role_parents",
    "role_rows",
    "depth",
    "technical_faults",
    "incomplete_parents",
    "old_depth12_targets",
    ...(v1r9FallbackRecount === undefined ? [] : ["hash8192_fallback_recount"]),
    "outputs",
    "artifact_verification",
    "authority",
  ];
  exactObject(receipt, fields, "raw teacher receipt");
  if (
    receipt.schema !==
      (v1r11
        ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11
        : HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA) ||
    receipt.status !== "structurally-complete-awaiting-artifact-verification" ||
    receipt.completed_parents !==
      ROLE_ORDER.reduce((sum, role) => sum + roleCounts[role], 0) ||
    receipt.completed_rows !== completedRows ||
    !sameJson(receipt.role_parents, roleCounts) ||
    !sameJson(receipt.role_rows, roleRows) ||
    receipt.depth !== 18 ||
    receipt.technical_faults !== 0 ||
    receipt.incomplete_parents !== 0 ||
    receipt.old_depth12_targets !== 0
  ) {
    throw new Error("raw teacher receipt accounting differs from held work");
  }
  if (
    v1r9FallbackRecount !== undefined &&
    !sameJson(receipt.hash8192_fallback_recount, v1r9FallbackRecount)
  ) {
    throw new Error(
      "raw teacher receipt v1r9 fallback recount differs from held work",
    );
  }
  validateDeclaredIdentity(
    receipt.teacher_plan,
    request.plan,
    "raw receipt teacher plan",
    { schema: plan.schema as TeacherPlanSchema },
  );
  const outputs = exactObject(
    receipt.outputs,
    ROLE_ORDER,
    "raw receipt outputs",
  );
  const snapshots = {
    fit: request.fit,
    tune: request.tune,
    sealed: request.sealed,
  };
  for (const role of ROLE_ORDER) {
    validateDeclaredIdentity(
      outputs[role],
      snapshots[role],
      `raw receipt ${role}`,
    );
  }
  if (
    !sameJson(receipt.artifact_verification, {
      held_descriptor_content_scan: false,
      actual_bytes_sha256_rows_recomputed: false,
      selected_parent_role_membership_recomputed: false,
      every_target_depth18_recomputed: false,
      old_depth12_target_absence_recomputed: false,
    }) ||
    !sameJson(receipt.authority, {
      may_build_training_plan: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error(
      "raw receipt improperly self-asserts verification/authority",
    );
  }
  const planOutputs = exactObject(
    plan.outputs,
    [
      "directory",
      "plan_json",
      "fit_jsonl",
      "tune_jsonl",
      "sealed_jsonl",
      "work_jsonl",
      "milestone_100_json",
      "milestone_500_json",
      "terminal_fault_json",
      "receipt_json",
      "verified_artifact_receipt_json",
      ...(v1r11
        ? ["power_continuity_jsonl", "power_continuity_receipt_json"]
        : []),
    ],
    "teacher plan outputs",
  );
  const authorityOutputs = v1r11
    ? exactV1R11AuthorityOutputNamespace(plan.authority_output_namespace)
    : undefined;
  if (
    planOutputs.receipt_json !== request.rawReceipt.identity.path ||
    planOutputs.work_jsonl !== request.work.identity.path ||
    planOutputs.fit_jsonl !== request.fit.identity.path ||
    planOutputs.tune_jsonl !== request.tune.identity.path ||
    planOutputs.sealed_jsonl !== request.sealed.identity.path ||
    (v1r11 &&
      (planOutputs.power_continuity_jsonl !==
        request.powerContinuity?.ledger.identity.path ||
        planOutputs.power_continuity_receipt_json !==
          request.powerContinuity?.receipt.identity.path ||
        v1r11AuthorityPath(
          authorityOutputs!.launchagent_authority_evidence_json,
          "v1r11 LaunchAgent authority evidence path",
        ) !== request.powerContinuity?.launchAgentAuthority.identity.path ||
        v1r11AuthorityPath(
          authorityOutputs!.preformal_authority_verified_receipt_json,
          "v1r11 verified preformal authority path",
        ) !== request.powerContinuity?.preformalAuthority.identity.path))
  ) {
    throw new Error("held artifact paths differ from sealed output paths");
  }
  return receipt;
}

function roleDatasetBytes(records: readonly Readonly<SiblingRecord>[]): Buffer {
  if (records.length === 0) return Buffer.alloc(0);
  return Buffer.from(
    `${records.map(canonicalHalfkp81Depth18Json).join("\n")}\n`,
    "utf8",
  );
}

function validateCore(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  bounds: Readonly<ValidationBounds>,
): Readonly<Halfkp81Depth18ValidationResult> {
  const plan = parseCanonicalDocument(request.plan, "teacher plan");
  const selectionValues = parseExactJsonl(
    request.selection.bytes,
    "selection JSONL",
    false,
  );
  const expectedParents = ROLE_ORDER.reduce(
    (sum, role) => sum + bounds.roleCounts[role],
    0,
  );
  if (selectionValues.length !== expectedParents) {
    throw new Error(
      `selection must contain exactly ${expectedParents} parents`,
    );
  }
  const selectionRows = selectionValues
    .map(parseSelectionRow)
    .map(selectionParent);
  const parentIds = new Set<string>();
  const gamesByRole = new Map<string, TeacherRole>();
  const observedRoleParents = { fit: 0, tune: 0, sealed: 0 };
  for (const { selection, parent } of selectionRows) {
    if (parentIds.has(parent.parent_id)) {
      throw new Error("selection contains a duplicate parent");
    }
    parentIds.add(parent.parent_id);
    const previousRole = gamesByRole.get(selection.game_id);
    if (previousRole !== undefined && previousRole !== selection.role) {
      throw new Error("selection has cross-role game overlap");
    }
    if (previousRole !== undefined) {
      throw new Error("selection contains more than one position per game");
    }
    gamesByRole.set(selection.game_id, selection.role);
    observedRoleParents[selection.role] += 1;
  }
  if (!sameJson(observedRoleParents, bounds.roleCounts)) {
    throw new Error("selection role membership/counts differ");
  }

  const workValues = parseExactJsonl(request.work.bytes, "teacher work");
  if (workValues.length !== expectedParents + 1) {
    throw new Error(
      "teacher work must contain one header and every selected parent",
    );
  }
  const header = validatePlanAndHeader(
    request,
    plan,
    workValues[0],
    selectionRows,
  );
  validateEngineReceipt(request.engineReceipt, request.engineBinary);
  const planSchema = plan.schema as TeacherPlanSchema;
  const yaneuraOnly = isYaneuraOnlyPlanSchema(planSchema);

  const recordsByRole: Record<TeacherRole, SiblingRecord[]> = {
    fit: [],
    tune: [],
    sealed: [],
  };
  const stableOperational = header.stable_runtime?.receipt.operational as
    Record<string, unknown> | undefined;
  const reusablePoolReceiptSha256 =
    planSchema === HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA
      ? requiredDigest(
          stableOperational?.reusable_pool_receipt_sha256,
          "stable reusable pool receipt SHA",
        )
      : undefined;
  const selectedByParentId = new Map(
    selectionRows.map(
      (selected) => [selected.parent.parent_id, selected] as const,
    ),
  );
  const wrapperIds = new Set<string>();
  const wrappers = new Map<
    string,
    Readonly<Halfkp81Depth18TeacherWorkParent>
  >();
  for (let index = 1; index < workValues.length; index += 1) {
    const untrusted = workValues[index] as Record<string, unknown>;
    const parentId = requiredText(
      untrusted?.parent_id,
      `teacher work line ${index + 1}.parent_id`,
    );
    const expected = selectedByParentId.get(parentId);
    if (expected === undefined) {
      throw new Error(`teacher work line ${index + 1} has an unknown parent`);
    }
    if (wrapperIds.has(parentId)) {
      throw new Error("teacher work contains a duplicate parent wrapper");
    }
    const wrapper = validateWrapper(
      workValues[index],
      expected,
      header.run_fingerprint,
      planSchema,
      header.stable_runtime?.receipt_sha256,
      reusablePoolReceiptSha256,
      index + 1,
    );
    wrapperIds.add(wrapper.parent_id);
    wrappers.set(wrapper.parent_id, wrapper);
  }
  if (wrapperIds.size !== expectedParents) {
    throw new Error("teacher work parent coverage is incomplete");
  }
  const v1r9FallbackParents = { fit: 0, tune: 0, sealed: 0 };
  const v1r9CapTriggerSearches = { fit: 0, tune: 0, sealed: 0 };
  const v1r9FallbackRows = { fit: 0, tune: 0, sealed: 0 };
  const v1r9FallbackSearches = { fit: 0, tune: 0, sealed: 0 };
  if (
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 ||
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
  ) {
    for (const wrapper of wrappers.values()) {
      if (wrapper.rescore_route?.mode !== "hash8192-parent-fallback") continue;
      const fallback = wrapper.rescore_route.fallback as Record<
        string,
        unknown
      >;
      const candidateCount = requiredInteger(
        fallback.candidate_count,
        `v1r9 ${wrapper.parent_id} fallback candidate count`,
        2,
      );
      v1r9FallbackParents[wrapper.role] += 1;
      v1r9CapTriggerSearches[wrapper.role] += 1;
      v1r9FallbackRows[wrapper.role] += candidateCount;
      v1r9FallbackSearches[wrapper.role] += requiredInteger(
        fallback.searches_executed,
        `v1r9 ${wrapper.parent_id} fallback searches executed`,
        candidateCount,
      );
    }
    const totalParents = ROLE_ORDER.reduce(
      (sum, role) => sum + v1r9FallbackParents[role],
      0,
    );
    const totalSearches = ROLE_ORDER.reduce(
      (sum, role) => sum + v1r9FallbackSearches[role],
      0,
    );
    if (
      totalParents > 8 ||
      totalSearches > 104 ||
      ROLE_ORDER.some(
        (role) =>
          v1r9FallbackParents[role] > V1R9_FALLBACK_PARENT_BUDGET[role] ||
          v1r9FallbackSearches[role] > V1R9_FALLBACK_SEARCH_BUDGET[role],
      )
    ) {
      throw new Error(
        "v1r9 Hash8192 fallback recount exceeds its sealed budget",
      );
    }
  }
  // Worker completion order is intentionally not authority-bearing.  Formal
  // role artifacts are reconstructed in the authenticated selection order.
  for (const selected of selectionRows) {
    const wrapper = wrappers.get(selected.parent.parent_id);
    if (wrapper === undefined) {
      throw new Error(
        "teacher work is missing an authenticated parent wrapper",
      );
    }
    recordsByRole[wrapper.role].push(...wrapper.teacher_entry.records);
  }

  const roleRows = {
    fit: recordsByRole.fit.length,
    tune: recordsByRole.tune.length,
    sealed: recordsByRole.sealed.length,
  };
  for (const role of ROLE_ORDER) {
    const expectedDataset = roleDatasetBytes(recordsByRole[role]);
    const actual = Buffer.from(request[role].bytes);
    if (
      expectedDataset.byteLength !== actual.byteLength ||
      !timingSafeEqual(expectedDataset, actual)
    ) {
      throw new Error(
        `${role} JSONL does not exactly reconstruct from held work`,
      );
    }
    if (
      roleRows[role] < bounds.roleCounts[role] * 2 ||
      roleRows[role] > bounds.roleCounts[role] * (yaneuraOnly ? 13 : 14)
    ) {
      throw new Error(
        `${role} row count violates 2..${yaneuraOnly ? 13 : 14} rows per parent`,
      );
    }
  }
  const completedRows = ROLE_ORDER.reduce(
    (sum, role) => sum + roleRows[role],
    0,
  );
  const v1r9FallbackRecount =
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 ||
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
      ? Object.freeze({
          fallback_parents_by_role: Object.freeze(v1r9FallbackParents),
          cap_trigger_searches_by_role: Object.freeze(v1r9CapTriggerSearches),
          fallback_rows_by_role: Object.freeze(v1r9FallbackRows),
          fallback_searches_by_role: Object.freeze(v1r9FallbackSearches),
          fallback_parents: ROLE_ORDER.reduce(
            (sum, role) => sum + v1r9FallbackParents[role],
            0,
          ),
          cap_trigger_searches: ROLE_ORDER.reduce(
            (sum, role) => sum + v1r9CapTriggerSearches[role],
            0,
          ),
          fallback_rows: ROLE_ORDER.reduce(
            (sum, role) => sum + v1r9FallbackRows[role],
            0,
          ),
          fallback_searches: ROLE_ORDER.reduce(
            (sum, role) => sum + v1r9FallbackSearches[role],
            0,
          ),
          capped_teacher_labels: 0,
        })
      : undefined;
  const rawTeacherReceipt = validateRawReceipt(
    request,
    plan,
    completedRows,
    roleRows,
    bounds.roleCounts,
    header.run_fingerprint,
    v1r9FallbackRecount,
  );
  const v1r11PowerEvidence =
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
      ? validateV1R11PowerContinuitySuccess(
          request,
          plan,
          header.run_fingerprint,
        )
      : undefined;
  const resetRecoveredParentIds =
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
      ? selectionRows
          .map(({ parent }) => wrappers.get(parent.parent_id))
          .filter(
            (wrapper): wrapper is Readonly<Halfkp81Depth18TeacherWorkParent> =>
              wrapper?.reset_timeout_recovery?.retries_used === 1,
          )
          .map((wrapper) => wrapper.parent_id)
      : [];

  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11) {
    const evidence = request.powerContinuity!;
    const { preformalLedger, preformalRawReceipt } = evidence;
    if (preformalLedger === undefined || preformalRawReceipt === undefined) {
      throw new Error("v1r11 verified receipt preformal snapshots are missing");
    }
    const verifier = request.v1r11ArtifactVerifierIdentity;
    if (verifier === undefined) {
      throw new Error("v1r11 artifact verifier identity is missing");
    }
    validateV1R11TrackedImplementationIdentity(
      verifier,
      plan.source_revision as string,
      "v1r11 artifact verifier",
      "ml/verify-halfkp81-depth18-yaneura-only-v1r11-teacher-artifacts.ts",
    );
    const verifierObject = verifier as Readonly<Record<string, unknown>>;
    const rawFinalizer = exactObject(
      rawTeacherReceipt.finalizer,
      ["source_revision", "entrypoint", "dependency_closure"],
      "v1r11 raw teacher finalizer",
    );
    if (
      verifierObject.entrypoint !==
        "ml/verify-halfkp81-depth18-yaneura-only-v1r11-teacher-artifacts.ts" ||
      verifierObject.entrypoint === rawFinalizer.entrypoint
    ) {
      throw new Error("v1r11 artifact verifier independence differs");
    }
    const teacherOutput = Object.freeze({
      fit: identityFromSnapshot(request.fit, HALFKP81_DEPTH18_DATASET_SCHEMA),
      tune: identityFromSnapshot(request.tune, HALFKP81_DEPTH18_DATASET_SCHEMA),
      sealed: identityFromSnapshot(
        request.sealed,
        HALFKP81_DEPTH18_DATASET_SCHEMA,
      ),
    });
    const receipt = Object.freeze({
      schema:
        HALFKP81_DEPTH18_YANEURA_ONLY_VERIFIED_ARTIFACT_RECEIPT_SCHEMA_V1R11,
      status:
        "teacher-artifacts-and-authority-chain-independently-verified-training-only-authority",
      teacher_plan: identityFromSnapshot(request.plan, planSchema),
      source_revision: plan.source_revision,
      run_fingerprint: header.run_fingerprint,
      raw_teacher_receipt: identityFromSnapshot(
        request.rawReceipt,
        HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11,
      ),
      teacher_work: identityFromSnapshot(
        request.work,
        HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
      ),
      teacher_output: teacherOutput,
      preformal_authority_ledger: identityFromSnapshot(
        preformalLedger,
        HALFKP81_V1R11_PREFORMAL_LEDGER_SCHEMA,
      ),
      preformal_authority_raw_receipt: identityFromSnapshot(
        preformalRawReceipt,
        HALFKP81_V1R11_PREFORMAL_RAW_AUTHORITY_SCHEMA,
      ),
      preformal_authority_verified_receipt: identityFromSnapshot(
        evidence.preformalAuthority,
        HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
      ),
      launchagent_authority_evidence: identityFromSnapshot(
        evidence.launchAgentAuthority,
        HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
      ),
      power_continuity_ledger: identityFromSnapshot(
        evidence.ledger,
        HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
      ),
      power_continuity_receipt: identityFromSnapshot(
        evidence.receipt,
        HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
      ),
      verifier,
      authority: Object.freeze({
        may_train_fixed_v1r11_candidate: true,
        may_play_formal_games: false,
        may_write_live_weights: false,
      }),
    });
    exactObject(
      receipt,
      HALFKP81_V1R11_VERIFIED_ARTIFACT_RECEIPT_FIELDS,
      "v1r11 verified artifact receipt",
    );
    return Object.freeze({
      receipt,
      receiptBytes: new Uint8Array(canonicalDocumentBytes(receipt)),
      completedParents: expectedParents,
      completedRows,
      roleParents: Object.freeze({ ...bounds.roleCounts }),
      roleRows: Object.freeze(roleRows),
    });
  }

  const receipt = Object.freeze({
    schema: HALFKP81_DEPTH18_VERIFIED_ARTIFACT_RECEIPT_SCHEMA,
    status: "verified-artifacts-training-plan-eligible",
    teacher_plan: identityFromSnapshot(request.plan, planSchema),
    selection_jsonl: identityFromSnapshot(
      request.selection,
      HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
      expectedParents,
    ),
    selection_manifest: identityFromSnapshot(
      request.selectionManifest,
      HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
    ),
    work: identityFromSnapshot(
      request.work,
      yaneuraOnly
        ? yaneuraOnlyWorkSchema(planSchema)
        : HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA,
      expectedParents + 1,
    ),
    raw_receipt: identityFromSnapshot(
      request.rawReceipt,
      HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA,
    ),
    completed_parents: expectedParents,
    completed_rows: completedRows,
    role_parents: Object.freeze({ ...bounds.roleCounts }),
    role_rows: Object.freeze(roleRows),
    depth: 18,
    technical_faults: 0,
    incomplete_parents: 0,
    old_depth12_targets: 0,
    ...(v1r11PowerEvidence === undefined
      ? {}
      : {
          power_continuity: Object.freeze({
            status: "verified-pass",
            ledger: identityFromSnapshot(v1r11PowerEvidence.ledger),
            receipt: identityFromSnapshot(v1r11PowerEvidence.receipt),
            verification: v1r11PowerEvidence.verification,
            binding: v1r11PowerEvidence.binding,
            pmset_interval_reauthenticated_against_current_log:
              v1r11PowerEvidence.pmsetVerification,
          }),
        }),
    ...(planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
      ? {
          hash8192_fallback_recount: v1r9FallbackRecount,
        }
      : {}),
    ...(planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
      ? {
          reset_timeout_recovery: Object.freeze({
            policy: YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
            recovered_parents: resetRecoveredParentIds.length,
            engine_recycles: resetRecoveredParentIds.length,
            parent_ids: Object.freeze(resetRecoveredParentIds),
            parent_ids_sha256: sha256(resetRecoveredParentIds.join("\n")),
          }),
        }
      : {}),
    outputs: Object.freeze({
      fit: identityFromSnapshot(
        request.fit,
        HALFKP81_DEPTH18_DATASET_SCHEMA,
        roleRows.fit,
      ),
      tune: identityFromSnapshot(
        request.tune,
        HALFKP81_DEPTH18_DATASET_SCHEMA,
        roleRows.tune,
      ),
      sealed: identityFromSnapshot(
        request.sealed,
        HALFKP81_DEPTH18_DATASET_SCHEMA,
        roleRows.sealed,
      ),
    }),
    artifact_verification: Object.freeze({
      held_descriptor_double_read: true,
      actual_bytes_sha256_rows_recomputed: true,
      selected_parent_role_membership_recomputed: true,
      cross_role_overlap_zero_recomputed: true,
      wrapper_payload_digests_recomputed: true,
      ...(yaneuraOnly
        ? {
            stable_wasm_absence_recomputed: true,
            yaneura_only_candidate_generation_recomputed: true,
            ...(planSchema ===
            HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
              ? { reset_timeout_recovery_evidence_recomputed: true }
              : {}),
            ...(planSchema ===
              HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
              ? {
                  hash8192_route_evidence_recomputed: true,
                  fallback_budgets_recomputed: true,
                  capped_teacher_labels_recomputed_zero: true,
                }
              : {}),
          }
        : { stable_depth11_parent_runtime_binding_recomputed: true }),
      proposal_depth16_exact_depth18_recomputed: true,
      ...(yaneuraOnly
        ? { row_bounds_2_through_13_recomputed: true }
        : { row_bounds_2_through_14_recomputed: true }),
      old_depth12_target_absence_recomputed: true,
      work_to_role_jsonl_canonical_reconstruction: true,
      fault_skip_missing_parents_recomputed_zero: true,
      ...(v1r11PowerEvidence === undefined
        ? {}
        : {
            power_continuity_ledger_hash_chain_recomputed: true,
            power_continuity_receipt_bindings_recomputed: true,
            power_continuity_current_pmset_interval_recomputed: true,
          }),
    }),
    authority: Object.freeze({
      may_build_training_plan: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
  return Object.freeze({
    receipt,
    receiptBytes: new Uint8Array(canonicalDocumentBytes(receipt)),
    completedParents: expectedParents,
    completedRows,
    roleParents: Object.freeze({ ...bounds.roleCounts }),
    roleRows: Object.freeze(roleRows),
  });
}

export function validateHalfkp81Depth18TeacherArtifacts(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
): Readonly<Halfkp81Depth18ValidationResult> {
  const plan = parseCanonicalDocument(request.plan, "teacher plan");
  if (
    plan.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1 ||
    plan.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2 ||
    plan.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3
  ) {
    throw new Error(
      "closed Yaneura-only v1/v1r2/v1r3 family may not publish training-plan-eligible artifacts; use v1r4",
    );
  }
  return validateCore(request, { roleCounts: FORMAL_ROLE_COUNTS });
}

/** A small-count seam for exhaustive unit tests; production always fixes 8192. */
export function validateHalfkp81Depth18TeacherArtifactsCoreForTests(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  roleCounts: Readonly<Record<TeacherRole, number>>,
): Readonly<Halfkp81Depth18ValidationResult> {
  if (
    ROLE_ORDER.some(
      (role) =>
        !Number.isSafeInteger(roleCounts[role]) || roleCounts[role] <= 0,
    )
  ) {
    throw new Error("test role counts must all be positive");
  }
  return validateCore(request, { roleCounts });
}

function statSignature(value: fs.Stats): readonly number[] {
  return [
    value.dev,
    value.ino,
    value.mode,
    value.uid,
    value.gid,
    value.size,
    value.mtimeMs,
    value.ctimeMs,
    value.nlink,
  ];
}

export async function readHalfkp81Depth18PrivateArtifact(
  file: string,
  root: string,
  effectiveUserId: number,
  label: string,
  maximumBytes = Number.MAX_SAFE_INTEGER,
  requirePrivateMode = true,
): Promise<Readonly<Halfkp81Depth18PrivateSnapshot>> {
  if (
    !path.isAbsolute(file) ||
    path.resolve(file) !== file ||
    !path.isAbsolute(root) ||
    path.resolve(root) !== root ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0
  ) {
    throw new Error(`${label} path/root/byte limit is not canonical`);
  }
  const absoluteRoot = path.resolve(root);
  const realRoot = await fs.promises.realpath(root);
  const relative = path.relative(absoluteRoot, file);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    (await fs.promises.realpath(file)) !== path.join(realRoot, relative)
  ) {
    throw new Error(`${label} is outside its canonical artifact root`);
  }
  const before = await fs.promises.lstat(file);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== effectiveUserId ||
    (requirePrivateMode && (before.mode & 0o7777) !== PRIVATE_FILE_MODE) ||
    before.nlink !== 1 ||
    before.size > maximumBytes
  ) {
    throw new Error(
      `${label} is not an owned single-link${requirePrivateMode ? " private 0600" : ""} regular file`,
    );
  }
  const noFollow = "O_NOFOLLOW" in fs.constants ? fs.constants.O_NOFOLLOW : 0;
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
  let first: Buffer;
  let second: Buffer;
  let openedBefore: fs.Stats;
  let openedMiddle: fs.Stats;
  let openedAfter: fs.Stats;
  try {
    openedBefore = await handle.stat();
    first = await handle.readFile();
    openedMiddle = await handle.stat();
    if (first.byteLength > maximumBytes) {
      throw new Error(`${label} exceeds its byte limit`);
    }
    await handle.read(Buffer.alloc(0), 0, 0, 0);
    second = Buffer.alloc(first.byteLength);
    let offset = 0;
    while (offset < second.byteLength) {
      const chunk = await handle.read(
        second,
        offset,
        second.byteLength - offset,
        offset,
      );
      if (chunk.bytesRead === 0) break;
      offset += chunk.bytesRead;
    }
    if (offset !== second.byteLength) {
      throw new Error(`${label} second held read was torn`);
    }
    openedAfter = await handle.stat();
  } finally {
    await handle.close();
  }
  const after = await fs.promises.lstat(file);
  if (
    !sameJson(statSignature(before), statSignature(openedBefore)) ||
    !sameJson(statSignature(before), statSignature(openedMiddle)) ||
    !sameJson(statSignature(before), statSignature(openedAfter)) ||
    !sameJson(statSignature(before), statSignature(after)) ||
    !timingSafeEqual(first, second) ||
    first.byteLength !== before.size ||
    (await fs.promises.realpath(file)) !== path.join(realRoot, relative)
  ) {
    throw new Error(`${label} changed during held descriptor double-read`);
  }
  return Object.freeze({
    bytes: new Uint8Array(first),
    identity: Object.freeze({
      path: file,
      bytes: first.byteLength,
      sha256: sha256(first),
    }),
  });
}

async function createOnlyPrivateFile(
  destination: string,
  bytes: Uint8Array,
): Promise<void> {
  const directory = path.dirname(destination);
  const name = path.basename(destination);
  const temporary = path.join(
    directory,
    `.${name}.${process.pid}.${Date.now().toString(16)}.tmp`,
  );
  const handle = await fs.promises.open(
    temporary,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      ("O_NOFOLLOW" in fs.constants ? fs.constants.O_NOFOLLOW : 0),
    PRIVATE_FILE_MODE,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.promises.link(temporary, destination);
  } catch (error) {
    await fs.promises.unlink(temporary).catch(() => undefined);
    throw error;
  }
  await fs.promises.unlink(temporary);
  const directoryHandle = await fs.promises.open(
    directory,
    fs.constants.O_RDONLY,
  );
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

function snapshotSame(
  left: Readonly<Halfkp81Depth18PrivateSnapshot>,
  right: Readonly<Halfkp81Depth18PrivateSnapshot>,
): boolean {
  return (
    sameJson(left.identity, right.identity) &&
    left.bytes.byteLength === right.bytes.byteLength &&
    timingSafeEqual(Buffer.from(left.bytes), Buffer.from(right.bytes))
  );
}

function parseV1R11PmsetRows(stdout: string): readonly string[] {
  return Object.freeze(
    stdout
      .split(/\r?\n/u)
      .filter((line) =>
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+\S/u.test(line),
      ),
  );
}

function validateV1R11CurrentPmsetAnchors(
  startValue: unknown,
  endValue: unknown,
  currentRows: readonly string[],
): Readonly<Record<string, unknown>> {
  validateV1R11PowerAnchor(startValue, "v1r11 pmset start anchor");
  validateV1R11PowerAnchor(endValue, "v1r11 pmset end anchor");
  const start = startValue as Readonly<Record<string, unknown>>;
  const end = endValue as Readonly<Record<string, unknown>>;
  const startOrdinal = Number(start.pmset_event_ordinal);
  const endOrdinal = Number(end.pmset_event_ordinal);
  if (
    currentRows.length === 0 ||
    start.boot_session_identity !== end.boot_session_identity ||
    endOrdinal < startOrdinal ||
    endOrdinal > currentRows.length ||
    new Date(String(end.timestamp_utc)).getTime() <
      new Date(String(start.timestamp_utc)).getTime() ||
    (startOrdinal > 0 &&
      sha256(currentRows[startOrdinal - 1]!) !==
        start.last_raw_event_line_sha256) ||
    (endOrdinal > 0 &&
      sha256(currentRows[endOrdinal - 1]!) !== end.last_raw_event_line_sha256)
  ) {
    throw new Error(
      "v1r11 current pmset transcript does not authenticate the sealed anchors",
    );
  }
  const interval = currentRows.slice(startOrdinal, endOrdinal);
  if (
    interval.some((line) =>
      /\s(?:Sleep|DarkWake|Wake|Hibernate)\s|Wake from Hibernate/u.test(line),
    )
  ) {
    throw new Error("v1r11 pmset interval contains a forbidden power event");
  }
  return Object.freeze({
    current_filtered_rows: currentRows.length,
    start_ordinal: startOrdinal,
    end_ordinal: endOrdinal,
    interval_rows: interval.length,
    interval_sha256: sha256(interval.join("\n")),
  });
}

/**
 * Independently validate a terminal environment-continuity closure.  This
 * deliberately grants no training authority: the failed family stays closed.
 */
export function validateHalfkp81Depth18V1R11EnvironmentFaultArtifacts(
  request: Readonly<Halfkp81Depth18V1R11EnvironmentFaultValidationRequest>,
): Readonly<Record<string, unknown>> {
  const plan = parseCanonicalDocument(request.plan, "v1r11 teacher plan");
  if (plan.schema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11) {
    throw new Error("environment fault verifier requires a v1r11 plan");
  }
  validateV1R11FrozenDownstreamPlanContract(plan);
  const {
    preformalLedger,
    preformalRawReceipt,
    launchctlPrint,
    launchctlStderr,
    launchAgentPlist,
    launchAgentPsStdout,
    launchAgentPsStderr,
  } = request;
  if (
    preformalLedger === undefined ||
    preformalRawReceipt === undefined ||
    launchctlPrint === undefined ||
    launchctlStderr === undefined ||
    launchAgentPlist === undefined ||
    launchAgentPsStdout === undefined ||
    launchAgentPsStderr === undefined ||
    request.verifierIdentity === undefined
  ) {
    throw new Error("v1r11 environment fault downstream snapshots are missing");
  }
  const outputs = exactObject(
    plan.outputs,
    [
      "directory",
      "plan_json",
      "fit_jsonl",
      "tune_jsonl",
      "sealed_jsonl",
      "work_jsonl",
      "milestone_100_json",
      "milestone_500_json",
      "terminal_fault_json",
      "receipt_json",
      "verified_artifact_receipt_json",
      "power_continuity_jsonl",
      "power_continuity_receipt_json",
      "environment_process_cleanup_evidence_json",
    ],
    "v1r11 teacher plan outputs",
  );
  const authorityOutputs = exactV1R11AuthorityOutputNamespace(
    plan.authority_output_namespace,
  );
  if (
    outputs.plan_json !== request.plan.identity.path ||
    outputs.power_continuity_jsonl !== request.ledger.identity.path ||
    outputs.power_continuity_receipt_json !== request.receipt.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.launchagent_authority_evidence_json,
      "v1r11 LaunchAgent authority evidence path",
    ) !== request.launchAgentAuthority.identity.path ||
    v1r11AuthorityPath(
      authorityOutputs.preformal_authority_verified_receipt_json,
      "v1r11 verified preformal authority path",
    ) !== request.preformalAuthority.identity.path ||
    outputs.environment_process_cleanup_evidence_json !==
      request.processCleanupEvidence.identity.path ||
    outputs.terminal_fault_json !== request.terminalFault.identity.path
  ) {
    throw new Error("v1r11 environment fault artifact paths differ");
  }
  const terminalFault = parseCanonicalDocument(
    request.terminalFault,
    "v1r11 environment terminal fault",
  );
  exactObject(
    terminalFault,
    HALFKP81_V1R11_ENVIRONMENT_FAULT_FIELDS,
    "v1r11 environment terminal fault",
  );
  if (
    terminalFault.schema !== HALFKP81_V1R11_ENVIRONMENT_FAULT_SCHEMA ||
    terminalFault.status !== "environment-continuity-fault-family-closed" ||
    terminalFault.source_revision !== plan.source_revision ||
    typeof terminalFault.run_fingerprint !== "string" ||
    !SHA256_RE.test(terminalFault.run_fingerprint) ||
    !sameJson(terminalFault.authority, {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    })
  ) {
    throw new Error("v1r11 environment terminal fault semantics differ");
  }
  const syntheticRequest = {
    plan: request.plan,
    powerContinuity: {
      ledger: request.ledger,
      receipt: request.receipt,
      launchAgentAuthority: request.launchAgentAuthority,
      preformalAuthority: request.preformalAuthority,
      preformalLedger,
      preformalRawReceipt,
      launchctlPrint,
      launchctlStderr,
      launchAgentPlist,
      launchAgentPsStdout,
      launchAgentPsStderr,
      currentPmsetLogRows: request.currentPmsetLogRows,
    },
  } as unknown as Readonly<Halfkp81Depth18ValidationRequest>;
  validateV1R11FormalAuthoritySnapshots(
    syntheticRequest,
    plan,
    terminalFault.run_fingerprint,
  );
  const entries = parseV1R11FrozenPowerLedger(
    request.ledger,
    syntheticRequest,
    plan,
    terminalFault.run_fingerprint,
  );
  const final = entries[entries.length - 1]!;
  if (
    final.status !== "environment-fault" ||
    final.entry_kind !== "environment-fault"
  ) {
    throw new Error("v1r11 environment power ledger terminal row differs");
  }
  const powerReceipt = validateV1R11FrozenPowerReceipt(
    request.receipt,
    syntheticRequest,
    plan,
    terminalFault.run_fingerprint,
    entries,
    "environment-fault-closed",
  );
  const admissionObservation = exactObject(
    entries[0]!.observation,
    [
      "timestamp_utc",
      "power_source",
      "battery_percentage",
      "runner_pid",
      "guardian_pid",
      "caffeinate_assertion_holder_pid",
      "caffeinate_assertion_holder_parent_runner_pid",
      "caffeinate_executable",
      "caffeinate_argv",
      "runner_utility_argv",
      "launchagent_authority_evidence",
      "preformal_authority_verified_receipt",
      "assertion_owner_caffeinate_pid",
      "required_assertions",
      "boot_session_identity",
      "pmset_start_anchor",
      "pmset_current_cursor",
    ],
    "v1r11 environment admission observation",
  );
  const finalObservation = exactObject(
    final.observation,
    Object.keys(admissionObservation),
    "v1r11 environment final observation",
  );
  if (
    !sameJson(
      powerReceipt.pmset_start_anchor,
      admissionObservation.pmset_start_anchor,
    ) ||
    !sameJson(
      powerReceipt.pmset_end_anchor,
      finalObservation.pmset_current_cursor,
    )
  ) {
    throw new Error("v1r11 environment power receipt pmset anchors differ");
  }
  validateV1R11EnvironmentFaultPreimageBinding(terminalFault, powerReceipt);
  validateV1R11FullIdentity(
    terminalFault.teacher_plan,
    request.plan,
    plan.schema as string,
    "v1r11 environment terminal fault teacher plan",
  );
  validateV1R11FullIdentity(
    terminalFault.preformal_authority_verified_receipt,
    request.preformalAuthority,
    HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
    "v1r11 environment terminal fault verified preformal receipt",
  );
  validateV1R11FullIdentity(
    terminalFault.launchagent_authority_evidence,
    request.launchAgentAuthority,
    HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
    "v1r11 environment terminal fault LaunchAgent evidence",
  );
  validateV1R11FullIdentity(
    terminalFault.power_continuity_ledger,
    request.ledger,
    HALFKP81_V1R11_POWER_LEDGER_SCHEMA,
    "v1r11 environment terminal fault power ledger",
  );
  validateV1R11FullIdentity(
    terminalFault.power_continuity_receipt,
    request.receipt,
    HALFKP81_V1R11_POWER_RECEIPT_SCHEMA,
    "v1r11 environment terminal fault power receipt",
  );
  if (request.launchAgentPlist === undefined) {
    throw new Error("v1r11 environment cleanup LaunchAgent plist is missing");
  }
  validateV1R11FullIdentity(
    terminalFault.process_cleanup_evidence,
    request.processCleanupEvidence,
    HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA,
    "v1r11 environment terminal fault cleanup evidence",
  );
  const cleanup = validateV1R11ProcessCleanupEvidence(
    request.processCleanupEvidence,
    {
      plan: request.plan,
      planValue: plan,
      launchAgentAuthority: request.launchAgentAuthority,
      launchAgentPlist: request.launchAgentPlist,
      sourceRevision: String(plan.source_revision),
      runFingerprint: String(terminalFault.run_fingerprint),
      scope: "post-formal-environment",
      verifyTrackedProducer: true,
    },
  );
  if (!sameJson(terminalFault.process_cleanup, cleanup)) {
    throw new Error(
      "v1r11 environment terminal fault cleanup differs from held evidence",
    );
  }
  validateV1R11IsoUtc(
    terminalFault.faulted_at_utc,
    "v1r11 environment terminal fault faulted_at_utc",
  );
  validateV1R11TrackedImplementationIdentity(
    request.verifierIdentity,
    plan.source_revision as string,
    "v1r11 environment artifact verifier",
    "ml/verify-halfkp81-depth18-yaneura-only-v1r11-teacher-artifacts.ts",
  );
  if (
    request.verifierIdentity.entrypoint !==
    "ml/verify-halfkp81-depth18-yaneura-only-v1r11-teacher-artifacts.ts"
  ) {
    throw new Error("v1r11 environment artifact verifier entrypoint differs");
  }
  const pmsetVerification = validateV1R11CurrentPmsetAnchors(
    powerReceipt.pmset_start_anchor,
    powerReceipt.pmset_end_anchor,
    request.currentPmsetLogRows,
  );
  return Object.freeze({
    schema:
      "shogi-halfkp81-hard-depth18-yaneura-only-environment-fault-verification-v1r11",
    status: "verified-environment-continuity-fault-family-closed",
    teacher_plan: identityFromSnapshot(request.plan, plan.schema as string),
    ledger: identityFromSnapshot(request.ledger),
    receipt: identityFromSnapshot(request.receipt),
    terminal_fault: identityFromSnapshot(request.terminalFault),
    verification: Object.freeze({
      rows: entries.length,
      terminal_entry_sha256: final.entry_sha256,
      hash_chain_recomputed: true,
    }),
    pmset_verification: pmsetVerification,
    authority: Object.freeze({
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
}

export async function verifyAndPublishHalfkp81Depth18TeacherArtifacts(
  options: Readonly<Halfkp81Depth18VerifyAndPublishOptions>,
): Promise<Readonly<Halfkp81Depth18ValidationResult>> {
  const uid = options.effectiveUserId ?? process.geteuid?.();
  if (uid === undefined) {
    throw new Error("effective user ID is unavailable");
  }
  const root = path.resolve(options.artifactRoot);
  const plan = await readHalfkp81Depth18PrivateArtifact(
    path.resolve(options.planPath),
    root,
    uid,
    "teacher plan",
    16 * 1024 * 1024,
  );
  const planValue = parseCanonicalDocument(plan, "teacher plan");
  const yaneuraOnly = isYaneuraOnlyPlanSchema(planValue.schema);
  const v1r11 =
    planValue.schema ===
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11;
  const outputs = exactObject(
    planValue.outputs,
    [
      "directory",
      "plan_json",
      "fit_jsonl",
      "tune_jsonl",
      "sealed_jsonl",
      "work_jsonl",
      "milestone_100_json",
      "milestone_500_json",
      "terminal_fault_json",
      "receipt_json",
      "verified_artifact_receipt_json",
      ...(v1r11
        ? ["power_continuity_jsonl", "power_continuity_receipt_json"]
        : []),
    ],
    "teacher plan outputs",
  );
  const authorityOutputs = v1r11
    ? exactV1R11AuthorityOutputNamespace(planValue.authority_output_namespace)
    : undefined;
  if (outputs.directory !== root || outputs.plan_json !== options.planPath) {
    throw new Error("teacher plan root/path differs from verification request");
  }
  const selectionEvidence = exactObject(
    planValue.selection_evidence,
    [
      "schema",
      "status",
      "source_revision",
      "selection_jsonl",
      "selection_manifest",
      "phase_name_map",
      "accounting",
      "bindings",
      "verification",
    ],
    "teacher plan selection evidence",
  );
  const selectionIdentity = selectionEvidence.selection_jsonl as Record<
    string,
    unknown
  >;
  const manifestIdentity = selectionEvidence.selection_manifest as Record<
    string,
    unknown
  >;
  const work = await readHalfkp81Depth18PrivateArtifact(
    requiredText(outputs.work_jsonl, "work output path"),
    root,
    uid,
    "teacher work",
    options.maximumWorkBytes ?? 2 * 1024 * 1024 * 1024,
  );
  const workRows = parseExactJsonl(work.bytes, "teacher work");
  const workHeader = exactObject(
    workRows[0],
    v1r11
      ? HALFKP81_V1R11_WORK_HEADER_FIELDS
      : yaneuraOnly
        ? [
            "schema",
            "kind",
            "run_fingerprint",
            "teacher_plan",
            "selection_jsonl",
            "selection_manifest",
            "source_revision",
            "engine",
            "teacher",
            "candidate_generation",
            "label_policy",
          ]
        : [
            "schema",
            "kind",
            "run_fingerprint",
            "teacher_plan",
            "selection_jsonl",
            "selection_manifest",
            "source_revision",
            "engine",
            "teacher",
            "stable_runtime",
            "label_policy",
          ],
    "teacher work header",
  );
  const engine = exactObject(
    v1r11 ? planValue.engine : workHeader.engine,
    ["binary", "eval_file", "receipt"],
    "teacher work engine",
  );
  const read = (
    file: unknown,
    label: string,
    maximumBytes = 512 * 1024 * 1024,
    requirePrivateMode = true,
  ) => {
    const absoluteFile = requiredText(file, `${label} path`);
    const relative = path.relative(root, absoluteFile);
    const permittedRoot =
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
        ? root
        : path.dirname(absoluteFile);
    return readHalfkp81Depth18PrivateArtifact(
      absoluteFile,
      permittedRoot,
      uid,
      label,
      maximumBytes,
      requirePrivateMode,
    );
  };
  const powerContinuity = v1r11
    ? Object.freeze({
        ledger: await read(
          outputs.power_continuity_jsonl,
          "v1r11 power continuity ledger",
          256 * 1024 * 1024,
        ),
        receipt: await read(
          outputs.power_continuity_receipt_json,
          "v1r11 power continuity receipt",
          16 * 1024 * 1024,
        ),
        launchAgentAuthority: await read(
          v1r11AuthorityPath(
            authorityOutputs!.launchagent_authority_evidence_json,
            "v1r11 LaunchAgent authority evidence path",
          ),
          "v1r11 LaunchAgent authority evidence",
          16 * 1024 * 1024,
        ),
        preformalAuthority: await read(
          v1r11AuthorityPath(
            authorityOutputs!.preformal_authority_verified_receipt_json,
            "v1r11 verified preformal authority path",
          ),
          "v1r11 verified preformal authority",
          16 * 1024 * 1024,
        ),
        preformalLedger: await read(
          v1r11AuthorityPath(
            authorityOutputs!.preformal_authority_ledger_jsonl,
            "v1r11 preformal ledger path",
          ),
          "v1r11 preformal ledger",
          256 * 1024 * 1024,
        ),
        preformalRawReceipt: await read(
          v1r11AuthorityPath(
            authorityOutputs!.preformal_authority_receipt_json,
            "v1r11 preformal raw receipt path",
          ),
          "v1r11 preformal raw receipt",
          16 * 1024 * 1024,
        ),
        launchctlPrint: await read(
          v1r11AuthorityPath(
            authorityOutputs!.launchagent_launchctl_print_txt,
            "v1r11 launchctl stdout path",
          ),
          "v1r11 launchctl stdout",
          16 * 1024 * 1024,
        ),
        launchctlStderr: await read(
          v1r11AuthorityPath(
            authorityOutputs!.launchagent_launchctl_print_stderr_txt,
            "v1r11 launchctl stderr path",
          ),
          "v1r11 launchctl stderr",
          16 * 1024 * 1024,
        ),
        launchAgentPlist: await read(
          v1r11AuthorityPath(
            authorityOutputs!.launchagent_plist_snapshot,
            "v1r11 LaunchAgent plist snapshot path",
          ),
          "v1r11 LaunchAgent plist snapshot",
          16 * 1024 * 1024,
        ),
        launchAgentPsStdout: await read(
          v1r11AuthorityPath(
            authorityOutputs!.launchagent_ps_stdout_txt,
            "v1r11 LaunchAgent ps stdout path",
          ),
          "v1r11 LaunchAgent ps stdout",
          64 * 1024 * 1024,
        ),
        launchAgentPsStderr: await read(
          v1r11AuthorityPath(
            authorityOutputs!.launchagent_ps_stderr_txt,
            "v1r11 LaunchAgent ps stderr path",
          ),
          "v1r11 LaunchAgent ps stderr",
          16 * 1024 * 1024,
        ),
        currentPmsetLogRows: parseV1R11PmsetRows(
          execFileSync("/usr/bin/pmset", ["-g", "log"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 20_000,
            maxBuffer: 64 * 1024 * 1024,
          }),
        ),
      })
    : undefined;
  const request: Halfkp81Depth18ValidationRequest = {
    label: "HalfKP81 depth18 teacher",
    plan,
    selection: await read(selectionIdentity.path, "selection JSONL"),
    selectionManifest: await read(
      manifestIdentity.path,
      "selection manifest",
      16 * 1024 * 1024,
    ),
    work,
    engineBinary: await read(
      (engine.binary as Record<string, unknown>).path,
      "teacher engine binary",
      512 * 1024 * 1024,
      false,
    ),
    engineEval: await read(
      (engine.eval_file as Record<string, unknown>).path,
      "teacher engine eval",
      2 * 1024 * 1024 * 1024,
      false,
    ),
    engineReceipt: await read(
      (engine.receipt as Record<string, unknown>).path,
      "teacher engine receipt",
      16 * 1024 * 1024,
      false,
    ),
    rawReceipt: await read(outputs.receipt_json, "raw teacher receipt"),
    fit: await read(outputs.fit_jsonl, "fit JSONL"),
    tune: await read(outputs.tune_jsonl, "tune JSONL"),
    sealed: await read(outputs.sealed_jsonl, "sealed JSONL"),
    ...(v1r11
      ? {
          v1r11ArtifactVerifierIdentity:
            v1r11ImplementationIdentityFromRevision(
              requiredText(planValue.source_revision, "v1r11 source revision"),
              "ml/verify-halfkp81-depth18-yaneura-only-v1r11-teacher-artifacts.ts",
            ),
        }
      : {}),
    ...(powerContinuity === undefined ? {} : { powerContinuity }),
  };
  const result = validateHalfkp81Depth18TeacherArtifacts(request);

  // Re-open every authority-bearing artifact immediately before publishing the
  // receipt.  The receipt itself is the last formal output and is create-only.
  const rereadPairs: readonly (readonly [
    Readonly<Halfkp81Depth18PrivateSnapshot>,
    Promise<Readonly<Halfkp81Depth18PrivateSnapshot>>,
  ])[] = [
    [request.plan, read(request.plan.identity.path, "teacher plan")],
    [
      request.selection,
      read(request.selection.identity.path, "selection JSONL"),
    ],
    [
      request.selectionManifest,
      read(request.selectionManifest.identity.path, "selection manifest"),
    ],
    [
      request.work,
      read(
        request.work.identity.path,
        "teacher work",
        options.maximumWorkBytes,
      ),
    ],
    [
      request.engineBinary,
      read(
        request.engineBinary.identity.path,
        "teacher engine binary",
        512 * 1024 * 1024,
        false,
      ),
    ],
    [
      request.engineEval,
      read(
        request.engineEval.identity.path,
        "teacher engine eval",
        2 * 1024 * 1024 * 1024,
        false,
      ),
    ],
    [
      request.engineReceipt,
      read(
        request.engineReceipt.identity.path,
        "teacher engine receipt",
        16 * 1024 * 1024,
        false,
      ),
    ],
    [
      request.rawReceipt,
      read(request.rawReceipt.identity.path, "raw teacher receipt"),
    ],
    [request.fit, read(request.fit.identity.path, "fit JSONL")],
    [request.tune, read(request.tune.identity.path, "tune JSONL")],
    [request.sealed, read(request.sealed.identity.path, "sealed JSONL")],
    ...(request.powerContinuity === undefined
      ? []
      : [
          [
            request.powerContinuity.ledger,
            read(
              request.powerContinuity.ledger.identity.path,
              "v1r11 power continuity ledger",
              256 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.receipt,
            read(
              request.powerContinuity.receipt.identity.path,
              "v1r11 power continuity receipt",
              16 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.launchAgentAuthority,
            read(
              request.powerContinuity.launchAgentAuthority.identity.path,
              "v1r11 LaunchAgent authority evidence",
              16 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.preformalAuthority,
            read(
              request.powerContinuity.preformalAuthority.identity.path,
              "v1r11 verified preformal authority",
              16 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.preformalLedger!,
            read(
              request.powerContinuity.preformalLedger!.identity.path,
              "v1r11 preformal ledger",
              256 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.preformalRawReceipt!,
            read(
              request.powerContinuity.preformalRawReceipt!.identity.path,
              "v1r11 preformal raw receipt",
              16 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.launchctlPrint!,
            read(
              request.powerContinuity.launchctlPrint!.identity.path,
              "v1r11 launchctl stdout",
              16 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.launchctlStderr!,
            read(
              request.powerContinuity.launchctlStderr!.identity.path,
              "v1r11 launchctl stderr",
              16 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.launchAgentPlist!,
            read(
              request.powerContinuity.launchAgentPlist!.identity.path,
              "v1r11 LaunchAgent plist snapshot",
              16 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.launchAgentPsStdout!,
            read(
              request.powerContinuity.launchAgentPsStdout!.identity.path,
              "v1r11 LaunchAgent ps stdout",
              64 * 1024 * 1024,
            ),
          ] as const,
          [
            request.powerContinuity.launchAgentPsStderr!,
            read(
              request.powerContinuity.launchAgentPsStderr!.identity.path,
              "v1r11 LaunchAgent ps stderr",
              16 * 1024 * 1024,
            ),
          ] as const,
        ]),
  ];
  for (const [before, pendingAfter] of rereadPairs) {
    if (!snapshotSame(before, await pendingAfter)) {
      throw new Error(
        "authority artifact changed before manifest-last publication",
      );
    }
  }
  const destination = requiredText(
    outputs.verified_artifact_receipt_json,
    "verified receipt path",
  );
  await createOnlyPrivateFile(destination, result.receiptBytes);
  const published = await read(
    destination,
    "published verified artifact receipt",
    16 * 1024 * 1024,
  );
  if (
    result.receiptBytes.byteLength !== published.bytes.byteLength ||
    !timingSafeEqual(
      Buffer.from(result.receiptBytes),
      Buffer.from(published.bytes),
    )
  ) {
    throw new Error("published verified receipt differs");
  }
  return result;
}

export async function verifyHalfkp81Depth18V1R11EnvironmentFaultArtifacts(
  options: Readonly<
    Pick<
      Halfkp81Depth18VerifyAndPublishOptions,
      "artifactRoot" | "planPath" | "effectiveUserId"
    >
  >,
): Promise<Readonly<Record<string, unknown>>> {
  const uid = options.effectiveUserId ?? process.geteuid?.();
  if (uid === undefined) throw new Error("effective user ID is unavailable");
  const root = path.resolve(options.artifactRoot);
  const plan = await readHalfkp81Depth18PrivateArtifact(
    path.resolve(options.planPath),
    root,
    uid,
    "v1r11 teacher plan",
    16 * 1024 * 1024,
  );
  const planValue = parseCanonicalDocument(plan, "v1r11 teacher plan");
  if (
    planValue.schema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
  ) {
    throw new Error("environment fault verifier requires a v1r11 plan");
  }
  const outputs = exactObject(
    planValue.outputs,
    [
      "directory",
      "plan_json",
      "fit_jsonl",
      "tune_jsonl",
      "sealed_jsonl",
      "work_jsonl",
      "milestone_100_json",
      "milestone_500_json",
      "terminal_fault_json",
      "receipt_json",
      "verified_artifact_receipt_json",
      "power_continuity_jsonl",
      "power_continuity_receipt_json",
      "environment_process_cleanup_evidence_json",
    ],
    "v1r11 teacher plan outputs",
  );
  const authorityOutputs = exactV1R11AuthorityOutputNamespace(
    planValue.authority_output_namespace,
  );
  if (outputs.directory !== root || outputs.plan_json !== options.planPath) {
    throw new Error("v1r11 teacher plan root/path differs");
  }
  const read = (file: unknown, label: string, maximumBytes: number) => {
    const absoluteFile = requiredText(file, `${label} path`);
    const relative = path.relative(root, absoluteFile);
    const permittedRoot =
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
        ? root
        : path.dirname(absoluteFile);
    return readHalfkp81Depth18PrivateArtifact(
      absoluteFile,
      permittedRoot,
      uid,
      label,
      maximumBytes,
    );
  };
  const request: Halfkp81Depth18V1R11EnvironmentFaultValidationRequest = {
    plan,
    ledger: await read(
      outputs.power_continuity_jsonl,
      "v1r11 power continuity ledger",
      256 * 1024 * 1024,
    ),
    receipt: await read(
      outputs.power_continuity_receipt_json,
      "v1r11 power continuity receipt",
      16 * 1024 * 1024,
    ),
    launchAgentAuthority: await read(
      v1r11AuthorityPath(
        authorityOutputs.launchagent_authority_evidence_json,
        "v1r11 LaunchAgent authority evidence path",
      ),
      "v1r11 LaunchAgent authority evidence",
      16 * 1024 * 1024,
    ),
    preformalAuthority: await read(
      v1r11AuthorityPath(
        authorityOutputs.preformal_authority_verified_receipt_json,
        "v1r11 verified preformal authority path",
      ),
      "v1r11 verified preformal authority",
      16 * 1024 * 1024,
    ),
    preformalLedger: await read(
      v1r11AuthorityPath(
        authorityOutputs.preformal_authority_ledger_jsonl,
        "v1r11 preformal ledger path",
      ),
      "v1r11 preformal ledger",
      256 * 1024 * 1024,
    ),
    preformalRawReceipt: await read(
      v1r11AuthorityPath(
        authorityOutputs.preformal_authority_receipt_json,
        "v1r11 preformal raw receipt path",
      ),
      "v1r11 preformal raw receipt",
      16 * 1024 * 1024,
    ),
    launchctlPrint: await read(
      v1r11AuthorityPath(
        authorityOutputs.launchagent_launchctl_print_txt,
        "v1r11 launchctl stdout path",
      ),
      "v1r11 launchctl stdout",
      16 * 1024 * 1024,
    ),
    launchctlStderr: await read(
      v1r11AuthorityPath(
        authorityOutputs.launchagent_launchctl_print_stderr_txt,
        "v1r11 launchctl stderr path",
      ),
      "v1r11 launchctl stderr",
      16 * 1024 * 1024,
    ),
    launchAgentPlist: await read(
      v1r11AuthorityPath(
        authorityOutputs.launchagent_plist_snapshot,
        "v1r11 LaunchAgent plist snapshot path",
      ),
      "v1r11 LaunchAgent plist snapshot",
      16 * 1024 * 1024,
    ),
    launchAgentPsStdout: await read(
      v1r11AuthorityPath(
        authorityOutputs.launchagent_ps_stdout_txt,
        "v1r11 LaunchAgent ps stdout path",
      ),
      "v1r11 LaunchAgent ps stdout",
      64 * 1024 * 1024,
    ),
    launchAgentPsStderr: await read(
      v1r11AuthorityPath(
        authorityOutputs.launchagent_ps_stderr_txt,
        "v1r11 LaunchAgent ps stderr path",
      ),
      "v1r11 LaunchAgent ps stderr",
      16 * 1024 * 1024,
    ),
    processCleanupEvidence: await read(
      outputs.environment_process_cleanup_evidence_json,
      "v1r11 environment process cleanup evidence",
      64 * 1024 * 1024,
    ),
    terminalFault: await read(
      outputs.terminal_fault_json,
      "v1r11 environment terminal fault",
      16 * 1024 * 1024,
    ),
    currentPmsetLogRows: parseV1R11PmsetRows(
      execFileSync("/usr/bin/pmset", ["-g", "log"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20_000,
        maxBuffer: 64 * 1024 * 1024,
      }),
    ),
    verifierIdentity: v1r11ImplementationIdentityFromRevision(
      requiredText(planValue.source_revision, "v1r11 source revision"),
      "ml/verify-halfkp81-depth18-yaneura-only-v1r11-teacher-artifacts.ts",
    ),
  };
  const result = validateHalfkp81Depth18V1R11EnvironmentFaultArtifacts(request);
  for (const [before, label, maximumBytes] of [
    [request.plan, "v1r11 teacher plan", 16 * 1024 * 1024],
    [request.ledger, "v1r11 power continuity ledger", 256 * 1024 * 1024],
    [request.receipt, "v1r11 power continuity receipt", 16 * 1024 * 1024],
    [
      request.launchAgentAuthority,
      "v1r11 LaunchAgent authority evidence",
      16 * 1024 * 1024,
    ],
    [
      request.preformalAuthority,
      "v1r11 verified preformal authority",
      16 * 1024 * 1024,
    ],
    [request.preformalLedger!, "v1r11 preformal ledger", 256 * 1024 * 1024],
    [
      request.preformalRawReceipt!,
      "v1r11 preformal raw receipt",
      16 * 1024 * 1024,
    ],
    [request.launchctlPrint!, "v1r11 launchctl stdout", 16 * 1024 * 1024],
    [request.launchctlStderr!, "v1r11 launchctl stderr", 16 * 1024 * 1024],
    [
      request.launchAgentPlist!,
      "v1r11 LaunchAgent plist snapshot",
      16 * 1024 * 1024,
    ],
    [
      request.launchAgentPsStdout!,
      "v1r11 LaunchAgent ps stdout",
      64 * 1024 * 1024,
    ],
    [
      request.launchAgentPsStderr!,
      "v1r11 LaunchAgent ps stderr",
      16 * 1024 * 1024,
    ],
    [
      request.processCleanupEvidence,
      "v1r11 environment process cleanup evidence",
      64 * 1024 * 1024,
    ],
    [
      request.terminalFault,
      "v1r11 environment terminal fault",
      16 * 1024 * 1024,
    ],
  ] as const) {
    const after = await read(before.identity.path, label, maximumBytes);
    if (!snapshotSame(before, after)) {
      throw new Error(
        "v1r11 environment fault artifact changed during verification",
      );
    }
  }
  return result;
}
