import { createHash, timingSafeEqual } from "node:crypto";
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
export const HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-receipt-v1" as const;
export const HALFKP81_DEPTH18_VERIFIED_ARTIFACT_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-verified-artifact-receipt-v1" as const;
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
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9;

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
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9;
  readonly kind: "header";
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
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9;
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
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 {
  return (
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6 ||
    schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
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
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9 {
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
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9;
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
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9) {
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
    yaneuraOnly
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
    header.kind !== "header" ||
    typeof header.run_fingerprint !== "string" ||
    !SHA256_RE.test(header.run_fingerprint) ||
    typeof header.source_revision !== "string" ||
    !REVISION_RE.test(header.source_revision) ||
    plan.source_revision !== header.source_revision
  ) {
    throw new Error("teacher work header fixed identity differs");
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
    { schema: planSchema },
  );
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
  const planEngine = exactObject(
    plan.engine,
    ["binary", "eval_file", "eval_tree_sha256", "source_revision", "id"],
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
  if (
    !sameJson(header.teacher, plan.teacher) ||
    (isBoundedStablePlanSchema(planSchema) &&
      !sameJson(header.teacher, BOUNDED_STABLE_V3_TEACHER)) ||
    (yaneuraOnly &&
      planSchema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 &&
      !sameJson(
        plan.teacher,
        planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 ||
          planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
          ? YANEURA_ONLY_V1R5_TEACHER
          : YANEURA_ONLY_V1_TEACHER,
      )) ||
    (yaneuraOnly &&
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
  if (header.label_policy !== SIBLING_TEACHER_LABEL_POLICY) {
    throw new Error("teacher work label policy differs");
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

function validateRawReceipt(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  plan: Readonly<Record<string, unknown>>,
  completedRows: number,
  roleRows: Readonly<Record<TeacherRole, number>>,
  roleCounts: Readonly<Record<TeacherRole, number>>,
  v1r9FallbackRecount?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const receipt = parseCanonicalDocument(
    request.rawReceipt,
    "raw teacher receipt",
  );
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
    receipt.schema !== HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA ||
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
    ],
    "teacher plan outputs",
  );
  if (
    planOutputs.receipt_json !== request.rawReceipt.identity.path ||
    planOutputs.work_jsonl !== request.work.identity.path ||
    planOutputs.fit_jsonl !== request.fit.identity.path ||
    planOutputs.tune_jsonl !== request.tune.identity.path ||
    planOutputs.sealed_jsonl !== request.sealed.identity.path
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
  if (planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9) {
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
    planSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
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
  validateRawReceipt(
    request,
    plan,
    completedRows,
    roleRows,
    bounds.roleCounts,
    v1r9FallbackRecount,
  );
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
    ],
    "teacher plan outputs",
  );
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
    yaneuraOnly
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
    workHeader.engine,
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
  };
  const result = validateHalfkp81Depth18TeacherArtifacts(request);

  // Re-open every authority-bearing artifact immediately before publishing the
  // receipt.  The receipt itself is the last formal output and is create-only.
  const rereadPairs: readonly [
    Readonly<Halfkp81Depth18PrivateSnapshot>,
    Promise<Readonly<Halfkp81Depth18PrivateSnapshot>>,
  ][] = [
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
