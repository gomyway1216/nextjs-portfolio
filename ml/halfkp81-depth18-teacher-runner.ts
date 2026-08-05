/**
 * Formal HalfKP81 hard-parent depth18 teacher runner.
 *
 * The public plan and selected parents are immutable inputs.  Private work is
 * append-only and durable; the three role artifacts are reconstructed from
 * authenticated work and published without replacement.  The structural
 * receipt is deliberately published last and does not authorize training.
 */

import * as crypto from "node:crypto";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

import {
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SIBLING_TEACHER_LABEL_POLICY,
  labelSiblingParent,
  prepareSiblingParentLabel,
  rescorePreparedSiblingParent,
  SiblingTeacherNodeCapRoutingError,
  SiblingTeacherRescoreResetTimeoutError,
  SiblingTeacherRescoreSearchTimeoutError,
  validateWorkEntry,
  type CompletedWorkEntry,
  type PreparedSiblingParentLabel,
} from "./generate-sibling-teacher";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
  createFloodgateProductionStableWasmRuntime,
  getFloodgateProductionStableWasmRuntimeReceiptDigest,
  type FloodgateProductionStableWasmRuntimeResult,
} from "./floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_GIT_COMMAND_PREFIX,
  FLOODGATE_GIT_EXECUTABLE,
  captureFloodgateGitExactCleanRevision,
  floodgateGitEnvironment,
} from "./floodgate-git";
import {
  createFloodgateBoundedStableWasmRuntimeV3,
  getFloodgateBoundedStableWasmRuntimeReceiptDigestV3,
  validateFloodgateBoundedStableWasmOutcomeV3,
  type FloodgateBoundedStableWasmOutcomeV3,
} from "./floodgate-bounded-stable-wasm-runtime-v3";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "./floodgate-stable-wasm-proposer";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import {
  positionKeyFromSfen,
  validateParentGroups,
  type SiblingRecord,
} from "./sibling-data";
import {
  USI_RESET_FOR_PARENT_TIMEOUT_MS,
  UsiResetForParentTimeoutError,
  UsiTeacherEngine,
  type UsiTeacherEngineOptions,
} from "./usi-engine";
import { buildHalfkp81V1R11PlannedLaunchAgentPlistForTests } from "./prepare-halfkp81-depth18-v1r11-planned-launchagent";
import {
  HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
  HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
  halfkp81V1R11FormalRunFingerprintV2,
} from "./halfkp81-depth18-v1r11-formal-run-intent";
import type {
  V1R11AuthorityDirectoryIdentity,
  V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import type { IndependentFormalRunIntentInput } from "./verify-halfkp81-depth18-v1r11-staged-authority";
import { importHalfkp81Depth18V1R11MinimalR13CompletedSetIntoR14 } from "./halfkp81-depth18-v1r11-import-v1r10-set";
const HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11" as const;

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
/**
 * Non-authoritative unit-test harness. This schema can exercise the v1r11
 * engine/power lifecycle, but it is deliberately not accepted by the formal
 * plan authenticator and can never mint production authority.
 */
export const HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA =
  "shogi-halfkp81-depth18-v1r11-power-test-plan-v1" as const;
export const HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-receipt-v1" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11 =
  "shogi-halfkp81-hard-depth18-teacher-receipt-v1r11" as const;
export const HALFKP81_DEPTH18_V1R11_DATASET_SCHEMA =
  "canonical-shogi-sibling-v1-jsonl-one-lf-per-row" as const;
export const HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-work-v1" as const;
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
export const HALFKP81_DEPTH18_V1R11_POWER_TEST_WORK_SCHEMA =
  "shogi-halfkp81-depth18-v1r11-power-test-work-v1" as const;
export const HALFKP81_DEPTH18_TEACHER_MILESTONE_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-milestone-v1" as const;
export const HALFKP81_DEPTH18_TEACHER_FAULT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1" as const;
export const HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA =
  "halfkp81-depth18-hard-parent-v2" as const;
export const HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA =
  "halfkp81-depth18-hard-parent-selection-manifest-v2" as const;

export const HALFKP81_DEPTH18_TEACHER_PARENT_COUNT = 8_192 as const;
export const HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS = Object.freeze({
  fit: 6_144,
  tune: 1_024,
  sealed: 1_024,
} as const);
export const HALFKP81_DEPTH18_TEACHER_MILESTONES = Object.freeze([
  100, 500,
] as const);
export const HALFKP81_DEPTH18_TEACHER_PROCESSES = 13 as const;
export const HALFKP81_DEPTH18_TEACHER_MULTIPV = 12 as const;
export const HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH = 16 as const;
export const HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH = 18 as const;
export const HALFKP81_DEPTH18_TEACHER_HASH_MIB = 512 as const;
export const HALFKP81_DEPTH18_TEACHER_PARENT_TIMEOUT_MS = 600_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES = 4 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS = 3_600_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES = 4 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS = 3_600_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY =
  "recycle-engine-retry-parent-once" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PROCESSES = 8 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB = 512 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP =
  2_000_000_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR =
  1 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_HASH_MIB =
  8_192 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_CONCURRENCY =
  2 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS =
  14_400_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_FALLBACK_SEARCH_TIMEOUT_MS =
  86_400_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY =
  "defer-once-then-retry-whole-parent" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_PLAN =
  Object.freeze({
    policy: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY,
    maximum_deferrals_per_parent: 1,
    queue_position: "tail-after-primary-queue",
    retry_engine: "fresh-hash8192",
    retry_candidate_scope: "whole-fixed-parent-from-zero",
    partial_results_reused: false,
    search_budget_accounting:
      "all-final-reset-retry-and-timeout-attempts-counted",
    maximum_searches_executed_per_parent: 38,
    second_timeout: "terminal-fault",
  } as const);
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_PARENT_BUDGET =
  Object.freeze({ fit: 6_144, tune: 1_024, sealed: 1_024 } as const);
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_SEARCH_BUDGET =
  Object.freeze({ fit: 79_872, tune: 13_312, sealed: 13_312 } as const);
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_ESCALATION_BUDGETS =
  Object.freeze({
    actual_cap_parent_counts_by_role_required: true,
    actual_cap_trigger_search_counts_by_role_required: true,
    actual_fallback_rows_by_role_required: true,
    artifact_verifier_recount_required: true,
    capped_teacher_labels_maximum: 0,
    fallback_parent_count_maximum: 8_192,
    fallback_parent_count_maximum_by_role: Object.freeze({
      fit: 6_144,
      sealed: 1_024,
      tune: 1_024,
    }),
    fallback_search_count_maximum: 311_296,
    fallback_search_count_maximum_by_role: Object.freeze({
      fit: 233_472,
      sealed: 38_912,
      tune: 38_912,
    }),
    fallback_search_count_maximum_per_parent: 38,
    runtime_recount_after_every_routing_and_fallback_publication: true,
    threshold_change_after_results: false,
    threshold_exceeded_policy: "immediate-family-terminal-fault",
  } as const);

export const HALFKP81_DEPTH18_TEACHER_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-engine-evaldir-v2" as const;
export const HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_TEACHER_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-bounded-stable-v3" as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_BOUNDED_STABLE_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_V3R2_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-bounded-stable-v3r2" as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_V3R2_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_BOUNDED_STABLE_V3R2_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_V3R3_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-bounded-stable-v3r3" as const;
export const HALFKP81_DEPTH18_BOUNDED_STABLE_V3R3_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_BOUNDED_STABLE_V3R3_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1-preflight-512" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-preflight-receipt-v1" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_ROLE_COUNTS =
  Object.freeze({ fit: 384, tune: 64, sealed: 64 } as const);
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r2" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_PREFLIGHT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-depth18-yaneura-only-v1r2-preflight" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_PREFLIGHT_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-preflight-receipt-v1r2" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r3" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_PREFLIGHT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-depth18-yaneura-only-v1r3-preflight" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_PREFLIGHT_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-preflight-receipt-v1r3" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r4" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-depth18-yaneura-only-v1r4-preflight" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-preflight-receipt-v1r4" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r5" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r6" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r9" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r10" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R14_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r14" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R14_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R14_DEFAULT_DIRECTORY}/power-continuity.jsonl` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R14_DEFAULT_DIRECTORY}/power-continuity-receipt.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r14-authority" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREFORMAL_AUTHORITY_RECEIPT_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY}/preformal-authority-receipt.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREFORMAL_VERIFIED_AUTHORITY_RECEIPT_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY}/preformal-authority-verified-receipt.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREFORMAL_AUTHORITY_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREFORMAL_AUTHORITY_LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREFORMAL_VERIFIED_AUTHORITY_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHCTL_SNAPSHOT_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY}/launchagent-launchctl-print.txt` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PLIST_SNAPSHOT_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY}/launchagent.plist.snapshot` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_PATH =
  `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY}/launchagent-authority-evidence.json` as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-power-continuity-ledger-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-power-continuity-receipt-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_FAULT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-environment-terminal-fault-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_ENVIRONMENT_FAULT_INTENT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-environment-fault-intent-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA =
  "shogi-halfkp81-depth18-power-guardian-ipc-v1r11" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_SAMPLE_INTERVAL_MS =
  30_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_MAXIMUM_GAP_MS =
  90_000 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMUM_BATTERY_PERCENTAGE =
  80 as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-depth18-yaneura-only-v1r5-pathological-preflight" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-pathological-preflight-receipt-v1r5" as const;
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT =
  Object.freeze({
    selection_index_one_based: 2_702,
    parent_id:
      "sha256:5a0784bfa36f2961049c1eae3ca13fe041d089abad1228f9d935f48723826dae",
    sfen: "lgk2B1nl/6g2/2g+Sppsp1/p5p1p/2S4P1/3P1P2P/PP2P4/2+b6/LN2KG1NL w SN2P2r3p 64",
    recorded_move: "7c6c",
  } as const);
export const HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_RELATIVE_PATH =
  "ml/engine-receipts/yaneuraou-9133c527-applem1.json" as const;
export const HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_BYTES = 654 as const;
export const HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_SHA256 =
  "a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e" as const;

const EXPECTED_ENGINE_BINARY = Object.freeze({
  path: "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou",
  bytes: 700_048,
  sha256: "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
});
const EXPECTED_ENGINE_EVAL = Object.freeze({
  path: "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/eval/eval/nn.bin",
  bytes: 64_217_066,
  sha256: "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782",
});
const EXPECTED_EVAL_TREE_SHA256 =
  "639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568";
const EXPECTED_ENGINE_SOURCE_REVISION =
  "9133c527791c8b2f5f378a32df29a5e3752bd41b";
const EXPECTED_ENGINE_ID = "YaneuraOu NNUE 9.60git 64APPLEM1";
const EXPECTED_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-strength-v1-plan.json",
  bytes: 5_855,
  sha256: "fc25e155345cb61739e2ef5a9198511501b12340e8d05b56ee77ba267b232971",
  schema: "shogi-halfkp81-hard-depth18-strength-plan-v1",
});
const EXPECTED_TECHNICAL_RECOVERY = Object.freeze({
  path: "ml/halfkp81-hard-depth18-engine-evaldir-v2-plan.json",
  bytes: 5_889,
  sha256: "58410d65bb553486c51c2ab332abba21ddcc8ef743af27378208ffcb3ec8baf2",
  schema: "shogi-halfkp81-hard-depth18-engine-evaldir-recovery-plan-v2",
});
const EXPECTED_BOUNDED_STABLE_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-bounded-stable-v3-plan.json",
  bytes: 8_607,
  sha256: "e72510d0e34a2904810591f12bc909c1ae9f770abb596195161ab9dd9d9375f1",
  schema: "shogi-halfkp81-hard-depth18-bounded-stable-plan-v3",
});
const EXPECTED_BOUNDED_STABLE_V3R2_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-bounded-stable-v3r2-plan.json",
  bytes: 5_378,
  sha256: "a543e03804b9215abab25eb34f3937f5cc1fa212fc12af80b7a25e923665a7e5",
  schema: "shogi-halfkp81-hard-depth18-bounded-stable-recovery-plan-v3r2",
});
const EXPECTED_BOUNDED_STABLE_V3R3_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-bounded-stable-v3r3-plan.json",
  bytes: 7_815,
  sha256: "5e4e8157d5848fbeca9ecf959d68ed6eca51b0017eb8296ea8ea0ef5bdc24ac7",
  schema: "shogi-halfkp81-hard-depth18-bounded-stable-recovery-plan-v3r3",
});
const EXPECTED_BOUNDED_STABLE_V3R3_DIAGNOSTIC_RECEIPT = Object.freeze({
  path: "ml/halfkp81-depth18-bounded-stable-v3r3-diagnostic-receipt.json",
  bytes: 2_299,
  sha256: "a6b6f5ed9b3305a51a66dda69bf1887313c9f87bcbc0a86d3ca2826fba23f51d",
  schema: "shogi-halfkp81-depth18-bounded-stable-fd3-diagnostic-receipt-v3r3",
});
const EXPECTED_YANEURA_ONLY_V1R4_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-yaneura-only-v1r4-plan.json",
  bytes: 29_943,
  sha256: "29d3356139d7df173150374fa30d117ce01cd5d40cce960be1fe812cc2ce1d7b",
  schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r4",
});
const EXPECTED_YANEURA_ONLY_V1R5_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-yaneura-only-v1r5-plan.json",
  bytes: 9_663,
  sha256: "c97892bbc76280490d7f04d867f5c5a86d335bc1868438c31bb74cc4a3e7a595",
  schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r5",
});
const EXPECTED_YANEURA_ONLY_V1R6_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-yaneura-only-v1r6-plan.json",
  bytes: 10_346,
  sha256: "13e6cff20208057e2f23f1811b4698a7e2b085063ef0ed672bb6a788cf3a622b",
  schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r6",
});
const EXPECTED_YANEURA_ONLY_V1R9_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-yaneura-only-v1r9-plan.json",
  bytes: 15_598,
  sha256: "63d819028f4aea646f4bc9af22b90d23aedeb50f6470bbef8753937ad80b4827",
  schema: "shogi-halfkp81-hard-depth18-yaneura-only-parent-fallback-plan-v1r9",
});
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PREREGISTRATION_IDENTITY =
  EXPECTED_YANEURA_ONLY_V1R9_PREREGISTRATION;
const EXPECTED_YANEURA_ONLY_V1R10_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-yaneura-only-v1r10-plan.json",
  bytes: 16_121,
  sha256: "0d60b491f55078969ffc483902dc65aad2db4878e3dfd62e247e02de3470d0dc",
  schema: "shogi-halfkp81-hard-depth18-yaneura-only-parent-fallback-plan-v1r10",
});
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY =
  EXPECTED_YANEURA_ONLY_V1R10_PREREGISTRATION;
const EXPECTED_YANEURA_ONLY_V1R11_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r14-plan.json",
  bytes: 156_324,
  sha256: "f6af0fc10ab75258d083ef692eb7299c8719128cfa92ab6f2e049013795eb31c",
  schema:
    "shogi-halfkp81-hard-depth18-yaneura-only-parent-fallback-ac-power-continuity-plan-v1r11",
});
export const HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREREGISTRATION_IDENTITY =
  EXPECTED_YANEURA_ONLY_V1R11_PREREGISTRATION;

const EXPECTED_TEACHER = Object.freeze({
  engine: EXPECTED_ENGINE_ID,
  proposal_depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH,
  proposal_multipv: HALFKP81_DEPTH18_TEACHER_MULTIPV,
  stable_move_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
  rescore_depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
  threads_per_process: 1,
  hash_mib_per_process: HALFKP81_DEPTH18_TEACHER_HASH_MIB,
  processes: HALFKP81_DEPTH18_TEACHER_PROCESSES,
  timeout_seconds_per_parent: 600,
  minimum_rows_per_parent: 2,
  maximum_rows_per_parent: 14,
  expected_rows_point: 95_191,
  maximum_rows: 114_688,
});

export const HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1 =
  Object.freeze({
    mode: "yaneuraou-depth16-multipv12-plus-recorded-only",
    stable_wasm: "not-instantiated-or-called",
    proposal_depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH,
    proposal_multipv: HALFKP81_DEPTH18_TEACHER_MULTIPV,
    recorded_move_required: true,
    deduplication: "USI-move-exact-before-depth18-rescore",
    rescore_depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
    maximum_rows_per_parent: 13,
  } as const);

export const HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9 =
  Object.freeze({
    mode: "yaneuraou-depth16-multipv12-plus-recorded-only-hash-fallback-v1",
    stable_wasm: "not-instantiated-or-called",
    proposal_depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH,
    proposal_multipv: HALFKP81_DEPTH18_TEACHER_MULTIPV,
    recorded_move_required: true,
    deduplication: "USI-move-exact-before-depth18-rescore",
    normal_rescore: Object.freeze({
      depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
      node_cap: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP,
      minimum_completed_depth_for_routing:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR,
      hash_mib: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB,
      node_cap_result: "route-whole-parent-never-label",
    }),
    fallback_rescore: Object.freeze({
      depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
      hash_mib: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_HASH_MIB,
      all_fixed_candidates_recomputed: true,
      normal_rescore_rows_reused: 0,
      candidate_omissions: 0,
      maximum_concurrency:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_CONCURRENCY,
    }),
    maximum_rows_per_parent: 13,
  } as const);

export function expectedHalfkp81Depth18YaneuraOnlyInitialMultipv(
  legalMoveCount: number,
): number {
  if (!Number.isSafeInteger(legalMoveCount) || legalMoveCount < 2) {
    throw new Error(
      "Yaneura-only initial MultiPV requires at least two legal moves",
    );
  }
  return Math.min(HALFKP81_DEPTH18_TEACHER_MULTIPV, legalMoveCount);
}

const EXPECTED_PLAN_OUTPUT_KEYS = Object.freeze([
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
] as const);
export const HALFKP81_DEPTH18_V1R11_EXPECTED_PLAN_OUTPUT_KEYS = Object.freeze([
  ...EXPECTED_PLAN_OUTPUT_KEYS,
  "power_continuity_jsonl",
  "power_continuity_receipt_json",
  "environment_process_cleanup_evidence_json",
] as const);
const SHA256_RE = /^[0-9a-f]{64}$/u;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const STABLE_PARENT_DIGEST_DOMAIN = "shogi-floodgate-stable-parent-v1\0";
const STABLE_RESULT_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-row-v1\0";
const WORK_FINGERPRINT_DOMAIN = "shogi-halfkp81-hard-depth18-teacher-run-v1\0";
const WORK_ENTRY_DIGEST_DOMAIN =
  "shogi-halfkp81-hard-depth18-teacher-work-entry-v1\0";

export type Halfkp81Depth18TeacherRole = "fit" | "tune" | "sealed";

export interface Halfkp81Depth18TeacherFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema?: string;
}

export interface Halfkp81Depth18SelectionRow {
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
  readonly old_outcome: 0 | 0.5 | 1;
  readonly old_depth12_signals_usage: "selection_only_never_teacher_target";
  readonly minimum_player_rating: number;
  readonly sente_rating: number;
  readonly gote_rating: number;
  readonly legal_move_count: number;
  readonly hardness_cp_outcome_surprise: number;
  readonly hardness_tiebreak_sha256: string;
  readonly role: Halfkp81Depth18TeacherRole;
}

export interface Halfkp81Depth18AuthenticatedTeacherPlan {
  readonly plan: Readonly<Record<string, unknown>>;
  readonly planIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity> & {
    readonly schema:
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
      | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
      | typeof HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA;
  };
  readonly sourceRevision: string;
  readonly selectionIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity> & {
    readonly rows: number;
    readonly schema: typeof HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA;
  };
  readonly selectionManifestIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly selectionRows: readonly Readonly<Halfkp81Depth18SelectionRow>[];
  readonly parents: readonly Readonly<FloodgateTrainingParent>[];
  readonly roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>;
  readonly outputs: Readonly<
    Record<(typeof EXPECTED_PLAN_OUTPUT_KEYS)[number], string>
  > &
    Readonly<
      Partial<
        Record<
          "power_continuity_jsonl" | "power_continuity_receipt_json",
          string
        >
      >
    >;
  readonly engine: Readonly<{
    readonly binary: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly eval_file: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly eval_tree_sha256: string;
    readonly source_revision: string;
    readonly id: string;
  }>;
  readonly teacher: Readonly<Record<string, unknown>>;
}

interface Halfkp81Depth18LegacyTeacherWorkHeader {
  readonly schema:
    | typeof HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9
    | typeof HALFKP81_DEPTH18_V1R11_POWER_TEST_WORK_SCHEMA;
  readonly kind: "header";
  readonly run_fingerprint: string;
  readonly teacher_plan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly source_revision: string;
  readonly selection_jsonl: Readonly<Halfkp81Depth18TeacherFileIdentity> & {
    readonly rows: number;
    readonly schema: typeof HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA;
  };
  readonly selection_manifest: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly engine: Readonly<{
    readonly binary: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly eval_file: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  }>;
  readonly teacher: Readonly<Record<string, unknown>>;
  readonly stable_runtime?: Readonly<{
    readonly receipt_sha256: string;
    readonly receipt: Readonly<Record<string, unknown>>;
  }>;
  readonly candidate_generation?:
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9;
  readonly label_policy: typeof SIBLING_TEACHER_LABEL_POLICY;
}

export interface Halfkp81Depth18V1R11TeacherWorkHeader {
  readonly schema: typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11;
  readonly status: "formal-work-ledger-open";
  readonly record_kind: "header";
  readonly teacher_plan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly source_revision: string;
  readonly run_fingerprint: string;
  readonly launchagent_authority_evidence: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly preformal_authority_verified_receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly power_admission_entry: Readonly<Record<string, unknown>>;
  readonly opened_at_utc: string;
  readonly kind?: never;
  readonly selection_jsonl?: never;
  readonly selection_manifest?: never;
  readonly engine?: never;
  readonly teacher?: never;
  readonly stable_runtime?: never;
  readonly candidate_generation?: never;
  readonly label_policy?: never;
}

export type Halfkp81Depth18TeacherWorkHeader =
  | Halfkp81Depth18LegacyTeacherWorkHeader
  | Halfkp81Depth18V1R11TeacherWorkHeader;

interface Halfkp81Depth18V1R9NormalRoute {
  readonly mode: "normal-depth18";
  readonly normal_hash_mib: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB;
  readonly normal_limit: Readonly<{
    readonly depth: typeof HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH;
    readonly nodes: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP;
    readonly minimum_completed_depth: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR;
  }>;
  readonly fallback: null;
}

interface Halfkp81Depth18V1R9FallbackRoute {
  readonly mode: "hash8192-parent-fallback";
  readonly normal_hash_mib: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB;
  readonly normal_limit: Readonly<{
    readonly depth: typeof HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH;
    readonly nodes: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP;
    readonly minimum_completed_depth: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR;
  }>;
  readonly trigger: Readonly<{
    readonly move: string;
    readonly candidate_index_zero_based: number;
    readonly candidate_count: number;
    readonly completed_normal_rescores_discarded: number;
    readonly cap: Readonly<{
      readonly termination_reason: "node-cap";
      readonly requested_depth: number;
      readonly node_cap: number;
      readonly minimum_completed_depth: number;
      readonly deepest_complete_exact_depth: number;
      readonly selected_snapshot_nodes: number;
      readonly maximum_observed_nodes: number;
      readonly maximum_observed_depth: number;
      readonly selected_snapshot_bound: "exact";
      readonly discarded_at_or_above_node_cap_updates: number;
      readonly observed_lowerbound_updates: number;
      readonly observed_upperbound_updates: number;
      readonly cap_witness_depth: number;
      readonly cap_witness_nodes: number;
      readonly selected_precedes_witness: true;
      readonly completed_iteration_witness_depth: number;
    }>;
  }>;
  readonly normal_engine_reaped_before_fallback: true;
  readonly fallback: Readonly<{
    readonly hash_mib: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_HASH_MIB;
    readonly depth: typeof HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH;
    readonly timeout_ms:
      | typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS
      | typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_FALLBACK_SEARCH_TIMEOUT_MS;
    readonly semaphore_limit: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_CONCURRENCY;
    readonly all_candidates_recomputed: true;
    readonly candidate_count: number;
    readonly fallback_reset_retries_used: 0 | 1;
    readonly discarded_completed_rescores_before_retry: number;
    readonly search_timeout_deferrals_used?: 1;
    readonly discarded_completed_rescores_before_timeout_retry?: number;
    readonly timed_out_searchmoves?: readonly [string];
    readonly searches_executed: number;
    readonly normal_rescore_rows_reused: 0;
    readonly candidate_omissions: 0;
    readonly engine_quit_before_semaphore_release: true;
  }>;
}

interface Halfkp81Depth18V1R9ResetTimeoutRecovery {
  readonly policy: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY;
  readonly normal_retries_used: 0 | 1;
  readonly fallback_retries_used: 0 | 1;
  readonly engine_recycles: 0 | 1 | 2;
  readonly events: readonly Readonly<{
    readonly route: "normal" | "fallback";
    readonly attempt: 1;
    readonly error_name: "UsiResetForParentTimeoutError";
    readonly phase: "reset-for-parent";
    readonly timeout_ms: number;
  }>[];
}

export type Halfkp81Depth18V1R9RescoreRoute =
  Halfkp81Depth18V1R9NormalRoute | Halfkp81Depth18V1R9FallbackRoute;

class Halfkp81Depth18DeferredFallbackTimeoutError extends Error {
  readonly parentId: string;

  constructor(parentId: string) {
    super(`deferred fallback timeout for ${parentId}`);
    this.name = "Halfkp81Depth18DeferredFallbackTimeoutError";
    this.parentId = parentId;
  }
}

class Halfkp81Depth18DeferredFallbackAdmissionError extends Error {
  readonly parentId: string;

  constructor(parentId: string) {
    super(`deferred saturated fallback admission for ${parentId}`);
    this.name = "Halfkp81Depth18DeferredFallbackAdmissionError";
    this.parentId = parentId;
  }
}

interface Halfkp81Depth18DeferredFallbackAdmissionState {
  readonly prepared: Readonly<PreparedSiblingParentLabel>;
  readonly routeError: Readonly<SiblingTeacherNodeCapRoutingError>;
  readonly normalResetRetries: 0 | 1;
  readonly normalResetEvents: readonly Readonly<{
    attempt: 1;
    error_name: "UsiResetForParentTimeoutError";
    phase: "reset-for-parent";
    timeout_ms: number;
  }>[];
}

interface Halfkp81Depth18DeferredFallbackState {
  readonly prepared: Readonly<PreparedSiblingParentLabel>;
  readonly routeError: Readonly<SiblingTeacherNodeCapRoutingError>;
  readonly timedOutSearchmove: string;
  readonly discardedCompletedRescores: number;
  readonly discardedSearches: number;
  readonly normalResetRetries: 0 | 1;
  readonly normalResetEvents: readonly Readonly<{
    attempt: 1;
    error_name: "UsiResetForParentTimeoutError";
    phase: "reset-for-parent";
    timeout_ms: number;
  }>[];
  readonly fallbackResetRetries: 0 | 1;
  readonly discardedResetSearches: number;
  readonly fallbackResetEvents: readonly Readonly<{
    route: "fallback";
    attempt: 1;
    error_name: "UsiResetForParentTimeoutError";
    phase: "reset-for-parent";
    timeout_ms: number;
  }>[];
}

class Halfkp81Depth18FallbackTimeoutRecoveryExhaustedError extends Error {
  readonly phase = "independent-rescore" as const;
  readonly parentId: string;
  readonly timeoutMs: number;
  readonly fallbackTimeoutRecovery: Readonly<{
    policy: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY;
    deferrals_used: 1;
    first_timeout: Readonly<{
      searchmove: string;
      completed_rescores_discarded: number;
      searches_discarded: number;
    }>;
    second_timeout: Readonly<{
      searchmove: string;
      completed_rescores_discarded: number;
      searches_discarded: number;
    }>;
    reset_retry_searches_discarded: number;
    timeout_searches_discarded: number;
    total_discarded_searches: number;
  }>;

  constructor(
    deferred: Readonly<Halfkp81Depth18DeferredFallbackState>,
    second: Readonly<SiblingTeacherRescoreSearchTimeoutError>,
    resetRetrySearchesDiscarded: number,
  ) {
    const secondDiscardedSearches = second.completedSearchesDiscarded + 1;
    const timeoutSearchesDiscarded =
      deferred.discardedSearches + secondDiscardedSearches;
    super(
      `fallback exact-rescore timeout recovery exhausted for ${second.parentId} after one deferred whole-parent retry`,
      { cause: second },
    );
    this.name = "Halfkp81Depth18FallbackTimeoutRecoveryExhaustedError";
    this.parentId = second.parentId;
    this.timeoutMs = second.timeoutMs;
    this.fallbackTimeoutRecovery = Object.freeze({
      policy: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY,
      deferrals_used: 1,
      first_timeout: Object.freeze({
        searchmove: deferred.timedOutSearchmove,
        completed_rescores_discarded: deferred.discardedCompletedRescores,
        searches_discarded: deferred.discardedSearches,
      }),
      second_timeout: Object.freeze({
        searchmove: second.searchmoves[0] ?? "",
        completed_rescores_discarded: second.completedSearchesDiscarded,
        searches_discarded: secondDiscardedSearches,
      }),
      reset_retry_searches_discarded: resetRetrySearchesDiscarded,
      timeout_searches_discarded: timeoutSearchesDiscarded,
      total_discarded_searches:
        resetRetrySearchesDiscarded + timeoutSearchesDiscarded,
    });
  }
}

export interface Halfkp81Depth18TeacherWorkEntry {
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
  readonly role: Halfkp81Depth18TeacherRole;
  readonly stable_result?: Readonly<
    | FloodgateProductionStableWasmRuntimeResult
    | FloodgateBoundedStableWasmOutcomeV3
  >;
  readonly candidate_generation?:
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9;
  readonly rescore_route?: Readonly<Halfkp81Depth18V1R9RescoreRoute>;
  readonly reset_timeout_recovery?:
    | Readonly<{
        readonly policy: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY;
        readonly retries_used: 0 | 1;
        readonly engine_recycles: 0 | 1;
        readonly events: readonly Readonly<{
          readonly attempt: 1;
          readonly error_name: "UsiResetForParentTimeoutError";
          readonly phase: "reset-for-parent";
          readonly timeout_ms: number;
        }>[];
      }>
    | Readonly<Halfkp81Depth18V1R9ResetTimeoutRecovery>;
  readonly teacher_entry: Readonly<CompletedWorkEntry>;
  readonly payload_sha256: string;
}

export interface Halfkp81Depth18TeacherStableRuntime {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptDigest: string;
  readonly propose: (
    parent: Readonly<FloodgateTrainingParent>,
  ) => Promise<
    Readonly<
      | FloodgateProductionStableWasmRuntimeResult
      | FloodgateBoundedStableWasmOutcomeV3
    >
  >;
  readonly close: () => Promise<void>;
}

export interface Halfkp81Depth18TeacherEngine {
  readonly resetForParent: UsiTeacherEngine["resetForParent"];
  readonly search: UsiTeacherEngine["search"];
  readonly quit: UsiTeacherEngine["quit"];
}

export interface Halfkp81Depth18TeacherRunnerDependencies {
  readonly createStableRuntime?: () => Promise<Halfkp81Depth18TeacherStableRuntime>;
  readonly createEngine?: (
    options: Readonly<UsiTeacherEngineOptions>,
  ) => Promise<Halfkp81Depth18TeacherEngine>;
  readonly labelParent?: typeof labelSiblingParent;
  readonly authenticateFixedAssets?: (
    authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  ) => Promise<
    Readonly<{
      binary: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      evalFile: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      engineReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    }>
  >;
  readonly now?: () => number;
  readonly parentTimeoutMs?: number;
  readonly processes?: number;
  readonly parentDeadlinePolicy?: "aggregate" | "per-search-only";
  readonly resetTimeoutRecoveryPolicy?:
    "fatal" | typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY;
  readonly fallbackTimeoutRecoveryPolicy?:
    | "fatal"
    | typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY;
  readonly stablePolicy?: Halfkp81Depth18StablePolicy;
  readonly startPowerContinuity?: (
    context: Readonly<{
      teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      sourceRevision: string;
      runFingerprint: string;
      launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      preformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    }>,
  ) => Promise<Halfkp81Depth18PowerContinuitySession>;
  /** Opaque, process-local capability minted only after live LaunchAgent authentication. */
  readonly v1r11FormalAuthority?: Readonly<Halfkp81Depth18V1R11FormalAuthorityCapability>;
  /** Independent all-13 fingerprint that the formal core must exactly recompute. */
  readonly expectedV1R11RunFingerprint?: string;
}

export interface Halfkp81Depth18V1R11FormalAuthorityCapability {
  readonly launchAgentEvidence: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly plannedFinalDescriptor: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly preformalLedger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly preformalRawReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly verifiedPreformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
}

const trustedV1R11FormalAuthorities = new WeakSet<object>();
const trustedFallbackTimeoutRecoveryTestPlans = new WeakSet<object>();
const V1R11_MINIMAL_FORMAL_CAPABILITY = Symbol(
  "halfkp81-v1r11-minimal-formal-capability",
);

export interface Halfkp81Depth18PowerContinuitySession {
  readonly failure: Promise<never>;
  readonly guardianPid?: number;
  readonly caffeinatePid?: number;
  readonly admissionEntry?: Readonly<Record<string, unknown>>;
  readonly assertHealthy: (fresh?: boolean) => Promise<void>;
  readonly engineStarted: (observedAtMs: number) => void;
  readonly engineReaped: (observedAtMs: number) => void;
  readonly finalizeSuccess: () => Promise<
    Readonly<{
      ledger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    }>
  >;
  readonly finalizeFault: (
    reason: string,
    terminalFaultPreimageSha256: string,
  ) => Promise<
    Readonly<{
      ledger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    }>
  >;
  readonly close: () => Promise<void>;
}

export type Halfkp81Depth18StablePolicy =
  "required-depth11-v2" | "optional-bounded-depth11-v3" | "yaneuraou-only-v1";

export interface Halfkp81Depth18TeacherCoreContract {
  readonly parentCount: number;
  readonly roleCounts: Readonly<Record<Halfkp81Depth18TeacherRole, number>>;
  readonly milestones: readonly number[];
  readonly maximumRows: number;
}

export interface Halfkp81Depth18TeacherRunResult {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
}

function yaneuraOnlyWorkSchema(
  planSchema: Halfkp81Depth18AuthenticatedTeacherPlan["planIdentity"]["schema"],
):
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9
  | typeof HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11
  | typeof HALFKP81_DEPTH18_V1R11_POWER_TEST_WORK_SCHEMA {
  if (planSchema === HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA) {
    return HALFKP81_DEPTH18_V1R11_POWER_TEST_WORK_SCHEMA;
  }
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

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function v1r11ImplementationIdentityFromRevision(
  repositoryRoot: string,
  sourceRevision: string,
  entrypoint: string,
): Readonly<Record<string, unknown>> {
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
    const imports = [
      ...bytes
        .toString("utf8")
        .matchAll(
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
      const resolved = candidates.find((candidate) => {
        try {
          readAtRevision(candidate);
          return true;
        } catch {
          return false;
        }
      });
      if (resolved === undefined || resolved.startsWith("..")) {
        throw new Error(`v1r11 implementation cannot resolve ${specifier}`);
      }
      pending.push(resolved);
    }
  }
  const ordered = [
    entrypoint,
    ...[...seen.keys()]
      .filter((relativePath) => relativePath !== entrypoint)
      .sort(compareBytewise),
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

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(
        "canonical JSON rejects non-finite numbers and negative zero",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort(compareBytewise)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

function canonicalJsonLine(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function sha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function expandHalfkp81Depth18V1R11HomePathForTests(
  value: string,
  canonicalHome: string,
  environmentHome: string | undefined,
): string {
  if (
    !path.isAbsolute(canonicalHome) ||
    path.normalize(canonicalHome) !== canonicalHome ||
    environmentHome !== canonicalHome ||
    !value.startsWith("$HOME/")
  ) {
    throw new Error("v1r11 canonical passwd home binding differs");
  }
  const expanded = path.join(canonicalHome, value.slice("$HOME/".length));
  if (
    !path.isAbsolute(expanded) ||
    path.normalize(expanded) !== expanded ||
    !expanded.startsWith(`${canonicalHome}${path.sep}`)
  ) {
    throw new Error("v1r11 expanded output path is not canonical");
  }
  return expanded;
}

function currentCanonicalPasswdHome(): string {
  const euid = process.getuid?.();
  if (!Number.isSafeInteger(euid)) {
    throw new Error("v1r11 requires a numeric effective uid");
  }
  const output = execFileSync(
    "/usr/bin/dscacheutil",
    ["-q", "user", "-a", "uid", String(euid)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const homes = output
    .split("\n")
    .map((line) => /^dir:\s*(\/.*)$/u.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
  if (homes.length !== 1) {
    throw new Error("v1r11 passwd lookup did not return one canonical home");
  }
  const home = homes[0]!;
  const expanded = expandHalfkp81Depth18V1R11HomePathForTests(
    "$HOME/.codex",
    home,
    process.env.HOME,
  );
  const realHome = fs.realpathSync.native(home);
  const realCodexAncestor = fs.realpathSync.native(path.dirname(expanded));
  if (realHome !== home || realCodexAncestor !== path.dirname(expanded)) {
    throw new Error("v1r11 canonical home contains a symlink or alias");
  }
  return home;
}

const POWER_CONTINUITY_ENTRY_DIGEST_DOMAIN =
  "shogi-halfkp81-depth18-power-continuity-entry-v1r11\0";
const V1R11_REQUIRED_CAFFEINATE_ASSERTIONS = Object.freeze([
  "PreventSystemSleep",
  "PreventUserIdleSystemSleep",
  "PreventUserIdleDisplaySleep",
] as const);

export type Halfkp81Depth18PowerEventClass =
  "Sleep" | "DarkWake" | "Wake" | "Hibernate";

export interface Halfkp81Depth18PowerContinuityObservation {
  readonly observed_at_ms: number;
  readonly timestamp_utc: string;
  readonly power_source: string;
  readonly battery_percentage: number;
  readonly runner_pid: number;
  readonly guardian_pid: number;
  readonly caffeinate_assertion_holder_pid: number;
  readonly caffeinate_assertion_holder_parent_runner_pid: number;
  readonly caffeinate_executable: string;
  readonly caffeinate_argv: readonly string[];
  readonly runner_utility_argv: readonly string[];
  readonly assertion_owner_caffeinate_pid: number;
  readonly assertions: readonly string[];
  readonly boot_session_identity: string;
  readonly pmset_event_ordinal: number;
  readonly pmset_previous_raw_event_line_sha256: string | null;
  readonly pmset_last_raw_event_line_sha256: string;
  readonly pmset_anchor_raw_event_line: string;
  readonly pmset_new_raw_event_lines: readonly string[];
}

export interface Halfkp81Depth18PowerContinuityFinalBinding {
  readonly outcome: "success";
  readonly teacher_plan_sha256: string;
  readonly run_fingerprint: string;
  readonly launchagent_authority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly preformal_authority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly runner_pid: number;
  readonly guardian_pid: number;
  readonly caffeinate_assertion_holder_pid: number;
  readonly engines_started: number;
  readonly engines_reaped: number;
  readonly first_engine_started_at_ms: number;
  readonly last_engine_reaped_at_ms: number;
  readonly all_yaneuraou_processes_reaped: true;
}

export interface Halfkp81Depth18PowerContinuityFaultBinding {
  readonly outcome: "environment-continuity-fault";
  readonly teacher_plan_sha256: string;
  readonly run_fingerprint: string | null;
  readonly launchagent_authority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly preformal_authority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly runner_pid: number;
  readonly guardian_pid: number;
  readonly caffeinate_assertion_holder_pid: number;
  readonly engines_started: number;
  readonly engines_reaped: number;
  readonly first_engine_started_at_ms: number | null;
  readonly last_engine_reaped_at_ms: number | null;
  readonly all_yaneuraou_processes_reaped: true;
  readonly terminal_fault_preimage_sha256: string;
}

export interface Halfkp81Depth18PowerContinuityLedgerEntry {
  readonly schema: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA;
  readonly kind: "admission" | "heartbeat" | "terminal-fault" | "final";
  readonly sequence: number;
  readonly previous_entry_sha256: string | null;
  readonly gap_ms: number;
  readonly status: "pass" | "fail";
  readonly fault_reason: string | null;
  readonly observation: Readonly<Halfkp81Depth18PowerContinuityObservation>;
  readonly binding?: Readonly<
    | Halfkp81Depth18PowerContinuityFinalBinding
    | Halfkp81Depth18PowerContinuityFaultBinding
  >;
  readonly entry_sha256: string;
}

export interface Halfkp81Depth18PowerContinuityLedgerState {
  readonly entries: readonly Readonly<Halfkp81Depth18PowerContinuityLedgerEntry>[];
  readonly start: Readonly<Halfkp81Depth18PowerContinuityObservation>;
  readonly previous: Readonly<Halfkp81Depth18PowerContinuityObservation>;
}

export class Halfkp81Depth18EnvironmentContinuityError extends Error {
  readonly code = "environment-continuity" as const;

  constructor(readonly reason: string) {
    super(`environment continuity failed: ${reason}`);
    this.name = "Halfkp81Depth18EnvironmentContinuityError";
  }
}

export interface Halfkp81Depth18PowerHeartbeatWatchdog {
  readonly heartbeat: () => void;
  readonly close: () => void;
}

/** Injectable watchdog seam: production uses a real timer; tests use a fake clock. */
export function startHalfkp81Depth18PowerHeartbeatWatchdogForTests(
  dependencies: Readonly<{
    now: () => number;
    schedule: (callback: () => void, intervalMs: number) => unknown;
    cancel: (handle: unknown) => void;
    fail: (reason: string) => void;
  }>,
): Readonly<Halfkp81Depth18PowerHeartbeatWatchdog> {
  let lastHeartbeatAt = dependencies.now();
  let closed = false;
  let failed = false;
  const handle = dependencies.schedule(() => {
    if (
      !closed &&
      !failed &&
      dependencies.now() - lastHeartbeatAt >
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_MAXIMUM_GAP_MS
    ) {
      failed = true;
      dependencies.fail("guardian-heartbeat-gap-greater-than-90000ms");
    }
  }, HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_SAMPLE_INTERVAL_MS);
  return Object.freeze({
    heartbeat(): void {
      if (!closed && !failed) lastHeartbeatAt = dependencies.now();
    },
    close(): void {
      if (closed) return;
      closed = true;
      dependencies.cancel(handle);
    },
  });
}

function validPowerObservationInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const POWER_OBSERVATION_KEYS = Object.freeze([
  "observed_at_ms",
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
  "assertion_owner_caffeinate_pid",
  "assertions",
  "boot_session_identity",
  "pmset_event_ordinal",
  "pmset_previous_raw_event_line_sha256",
  "pmset_last_raw_event_line_sha256",
  "pmset_anchor_raw_event_line",
  "pmset_new_raw_event_lines",
] as const);

function validatePowerObservationShape(
  observation: Readonly<Halfkp81Depth18PowerContinuityObservation>,
): void {
  exactKeys(
    observation as unknown as Readonly<Record<string, unknown>>,
    POWER_OBSERVATION_KEYS,
    "power continuity observation",
  );
  if (
    !validPowerObservationInteger(observation.observed_at_ms) ||
    observation.timestamp_utc !==
      new Date(observation.observed_at_ms).toISOString() ||
    !Number.isSafeInteger(observation.battery_percentage) ||
    observation.battery_percentage < 0 ||
    observation.battery_percentage > 100 ||
    !validPowerObservationInteger(observation.runner_pid) ||
    observation.runner_pid < 1 ||
    !validPowerObservationInteger(observation.guardian_pid) ||
    observation.guardian_pid < 1 ||
    !validPowerObservationInteger(
      observation.caffeinate_assertion_holder_pid,
    ) ||
    observation.caffeinate_assertion_holder_pid < 1 ||
    !validPowerObservationInteger(
      observation.caffeinate_assertion_holder_parent_runner_pid,
    ) ||
    observation.caffeinate_assertion_holder_parent_runner_pid < 1 ||
    !validPowerObservationInteger(observation.assertion_owner_caffeinate_pid) ||
    observation.assertion_owner_caffeinate_pid < 1 ||
    !validPowerObservationInteger(observation.pmset_event_ordinal) ||
    observation.boot_session_identity.length === 0 ||
    (observation.pmset_previous_raw_event_line_sha256 !== null &&
      !SHA256_RE.test(observation.pmset_previous_raw_event_line_sha256)) ||
    !SHA256_RE.test(observation.pmset_last_raw_event_line_sha256) ||
    observation.pmset_anchor_raw_event_line.length === 0 ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+\S/u.test(
      observation.pmset_anchor_raw_event_line,
    ) ||
    !Array.isArray(observation.assertions) ||
    observation.assertions.some((value) => typeof value !== "string") ||
    !Array.isArray(observation.caffeinate_argv) ||
    observation.caffeinate_argv.length < 3 ||
    observation.caffeinate_argv.some(
      (value) => typeof value !== "string" || value.length === 0,
    ) ||
    !Array.isArray(observation.runner_utility_argv) ||
    observation.runner_utility_argv.length < 1 ||
    observation.runner_utility_argv.some(
      (value) => typeof value !== "string" || value.length === 0,
    ) ||
    !Array.isArray(observation.pmset_new_raw_event_lines) ||
    observation.pmset_new_raw_event_lines.some(
      (value) => typeof value !== "string" || value.length === 0,
    )
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "malformed-power-observation",
    );
  }
  const lastRawLine =
    observation.pmset_new_raw_event_lines[
      observation.pmset_new_raw_event_lines.length - 1
    ];
  const expectedLastDigest =
    lastRawLine === undefined
      ? (observation.pmset_previous_raw_event_line_sha256 ??
        sha256(observation.pmset_anchor_raw_event_line))
      : sha256(lastRawLine);
  if (expectedLastDigest !== observation.pmset_last_raw_event_line_sha256) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "pmset-anchor-missing-truncated-reset-or-ambiguous",
    );
  }
}

export function classifyHalfkp81Depth18PmsetEventLineForTests(
  line: string,
): Halfkp81Depth18PowerEventClass | null {
  const match =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+(Sleep|DarkWake|Wake) *\t/u.exec(
      line,
    );
  if (match?.[1] === "DarkWake") return "DarkWake";
  if (match?.[1] === "Sleep") return "Sleep";
  if (match?.[1] === "Wake")
    return /Wake from Hibernate/u.test(line) ? "Hibernate" : "Wake";
  return null;
}

function validatePowerObservationContinuityFields(
  observation: Readonly<Halfkp81Depth18PowerContinuityObservation>,
): void {
  validatePowerObservationShape(observation);
  if (observation.power_source !== "AC Power") {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "power-source-not-AC-Power",
    );
  }
  if (
    observation.caffeinate_assertion_holder_parent_runner_pid !==
      observation.runner_pid ||
    observation.caffeinate_assertion_holder_pid === observation.runner_pid
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "caffeinate-assertion-holder-parent-pid-not-exact-runner-pid",
    );
  }
  if (
    observation.caffeinate_executable !== "/usr/bin/caffeinate" ||
    canonicalJson(observation.caffeinate_argv) !==
      canonicalJson([
        "/usr/bin/caffeinate",
        "-dimsu",
        "-w",
        String(observation.runner_pid),
      ])
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "caffeinate-executable-or-argv-mismatch",
    );
  }
  if (
    observation.assertion_owner_caffeinate_pid !==
    observation.caffeinate_assertion_holder_pid
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "assertion-owner-caffeinate-pid-mismatch",
    );
  }
  if (
    canonicalJson([...observation.assertions].sort(compareBytewise)) !==
    canonicalJson(
      [...V1R11_REQUIRED_CAFFEINATE_ASSERTIONS].sort(compareBytewise),
    )
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "required-caffeinate-assertion-missing",
    );
  }
  const event = observation.pmset_new_raw_event_lines
    .map(classifyHalfkp81Depth18PmsetEventLineForTests)
    .find((value) => value !== null);
  if (event !== undefined) {
    throw new Halfkp81Depth18EnvironmentContinuityError(`power-event-${event}`);
  }
}

/**
 * Validate the sealed v1r11 admission contract. This function is deliberately
 * pure so fake clocks and power sources can exercise every fail-closed branch.
 */
export function validateHalfkp81Depth18PowerContinuityAdmissionForTests(
  observation: Readonly<Halfkp81Depth18PowerContinuityObservation>,
): void {
  validatePowerObservationContinuityFields(observation);
  if (
    observation.pmset_previous_raw_event_line_sha256 !== null ||
    observation.pmset_new_raw_event_lines.length !== 0
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "pmset-anchor-missing-truncated-reset-or-ambiguous",
    );
  }
  if (
    observation.battery_percentage <
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMUM_BATTERY_PERCENTAGE
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "battery-below-80-percent",
    );
  }
}

/** Return the first sealed continuity failure, preserving classification order. */
export function halfkp81Depth18PowerContinuityFailureReasonForTests(
  start: Readonly<Halfkp81Depth18PowerContinuityObservation>,
  previous: Readonly<Halfkp81Depth18PowerContinuityObservation>,
  current: Readonly<Halfkp81Depth18PowerContinuityObservation>,
): string | null {
  const gap = current.observed_at_ms - previous.observed_at_ms;
  if (
    gap < 0 ||
    gap > HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_MAXIMUM_GAP_MS
  ) {
    return "heartbeat-gap-greater-than-90000ms";
  }
  try {
    validatePowerObservationContinuityFields(current);
  } catch (error) {
    return error instanceof Halfkp81Depth18EnvironmentContinuityError
      ? error.reason
      : "malformed-power-observation";
  }
  if (current.boot_session_identity !== start.boot_session_identity) {
    return "boot-session-identity-change";
  }
  if (
    current.runner_pid !== start.runner_pid ||
    current.guardian_pid !== start.guardian_pid ||
    current.caffeinate_assertion_holder_pid !==
      start.caffeinate_assertion_holder_pid ||
    current.assertion_owner_caffeinate_pid !==
      start.assertion_owner_caffeinate_pid ||
    current.caffeinate_executable !== start.caffeinate_executable ||
    canonicalJson(current.caffeinate_argv) !==
      canonicalJson(start.caffeinate_argv) ||
    canonicalJson(current.runner_utility_argv) !==
      canonicalJson(start.runner_utility_argv)
  ) {
    return "power-process-identity-change";
  }
  if (
    current.pmset_anchor_raw_event_line !== start.pmset_anchor_raw_event_line ||
    current.pmset_previous_raw_event_line_sha256 !==
      previous.pmset_last_raw_event_line_sha256 ||
    current.pmset_event_ordinal !==
      previous.pmset_event_ordinal + current.pmset_new_raw_event_lines.length ||
    current.pmset_event_ordinal < previous.pmset_event_ordinal
  ) {
    return "pmset-anchor-missing-truncated-reset-or-ambiguous";
  }
  return null;
}

function powerContinuityEntryDigest(
  value: Omit<Halfkp81Depth18PowerContinuityLedgerEntry, "entry_sha256">,
): string {
  return sha256(
    `${POWER_CONTINUITY_ENTRY_DIGEST_DOMAIN}${canonicalJson(value)}`,
  );
}

function validatePowerContinuityBinding(
  binding: Readonly<
    | Halfkp81Depth18PowerContinuityFinalBinding
    | Halfkp81Depth18PowerContinuityFaultBinding
  >,
): void {
  const sharedKeys = [
    "outcome",
    "teacher_plan_sha256",
    "run_fingerprint",
    "launchagent_authority",
    "preformal_authority",
    "runner_pid",
    "guardian_pid",
    "caffeinate_assertion_holder_pid",
    "engines_started",
    "engines_reaped",
    "all_yaneuraou_processes_reaped",
  ] as const;
  exactKeys(
    binding as unknown as Readonly<Record<string, unknown>>,
    binding.outcome === "success"
      ? [
          ...sharedKeys,
          "first_engine_started_at_ms",
          "last_engine_reaped_at_ms",
        ]
      : [
          ...sharedKeys,
          "first_engine_started_at_ms",
          "last_engine_reaped_at_ms",
          "terminal_fault_preimage_sha256",
        ],
    "power continuity final binding",
  );
  if (
    !SHA256_RE.test(binding.teacher_plan_sha256) ||
    !SHA256_RE.test(binding.launchagent_authority.sha256) ||
    !SHA256_RE.test(binding.preformal_authority.sha256) ||
    (binding.run_fingerprint !== null &&
      !SHA256_RE.test(binding.run_fingerprint)) ||
    !validPowerObservationInteger(binding.runner_pid) ||
    binding.runner_pid < 1 ||
    !validPowerObservationInteger(binding.guardian_pid) ||
    binding.guardian_pid < 1 ||
    !validPowerObservationInteger(binding.caffeinate_assertion_holder_pid) ||
    binding.caffeinate_assertion_holder_pid < 1 ||
    !validPowerObservationInteger(binding.engines_started) ||
    !validPowerObservationInteger(binding.engines_reaped) ||
    binding.engines_started !== binding.engines_reaped ||
    binding.all_yaneuraou_processes_reaped !== true
  ) {
    throw new Error("power continuity final binding differs");
  }
  if (
    binding.outcome === "success" &&
    (!SHA256_RE.test(binding.run_fingerprint) ||
      !validPowerObservationInteger(binding.first_engine_started_at_ms) ||
      !validPowerObservationInteger(binding.last_engine_reaped_at_ms) ||
      binding.last_engine_reaped_at_ms < binding.first_engine_started_at_ms)
  ) {
    throw new Error("power continuity success binding differs");
  }
  if (
    binding.outcome === "environment-continuity-fault" &&
    (!SHA256_RE.test(binding.terminal_fault_preimage_sha256) ||
      (binding.engines_started === 0
        ? binding.first_engine_started_at_ms !== null ||
          binding.last_engine_reaped_at_ms !== null
        : !validPowerObservationInteger(binding.first_engine_started_at_ms) ||
          !validPowerObservationInteger(binding.last_engine_reaped_at_ms) ||
          binding.last_engine_reaped_at_ms <
            binding.first_engine_started_at_ms))
  ) {
    throw new Error("power continuity fault preimage binding differs");
  }
}

export function appendHalfkp81Depth18PowerContinuityObservationForTests(
  state: Readonly<Halfkp81Depth18PowerContinuityLedgerState> | undefined,
  observation: Readonly<Halfkp81Depth18PowerContinuityObservation>,
  options: Readonly<{
    kind?: "heartbeat" | "terminal-fault" | "final";
    binding?: Readonly<
      | Halfkp81Depth18PowerContinuityFinalBinding
      | Halfkp81Depth18PowerContinuityFaultBinding
    >;
    forcedFaultReason?: string;
  }> = {},
): Readonly<Halfkp81Depth18PowerContinuityLedgerState> {
  const previous = state?.previous;
  const start = state?.start ?? observation;
  const reason =
    options.forcedFaultReason ??
    (previous === undefined
      ? (() => {
          try {
            validateHalfkp81Depth18PowerContinuityAdmissionForTests(
              observation,
            );
            return null;
          } catch (error) {
            return error instanceof Halfkp81Depth18EnvironmentContinuityError
              ? error.reason
              : "malformed-power-observation";
          }
        })()
      : halfkp81Depth18PowerContinuityFailureReasonForTests(
          start,
          previous,
          observation,
        ));
  const kind =
    options.kind ??
    (state === undefined
      ? "admission"
      : reason === null
        ? "heartbeat"
        : "terminal-fault");
  if ((kind === "terminal-fault") !== (reason !== null)) {
    throw new Error("power continuity entry kind differs from fault state");
  }
  if (kind === "final" && options.binding === undefined) {
    throw new Error("final power continuity entry requires a binding");
  }
  if (options.binding !== undefined) {
    validatePowerContinuityBinding(options.binding);
    if (
      options.binding.runner_pid !== observation.runner_pid ||
      options.binding.guardian_pid !== observation.guardian_pid ||
      options.binding.caffeinate_assertion_holder_pid !==
        observation.caffeinate_assertion_holder_pid
    ) {
      throw new Error("power continuity binding process identity differs");
    }
  }
  if (
    kind === "terminal-fault" &&
    options.binding?.outcome !== "environment-continuity-fault"
  ) {
    throw new Error("terminal power continuity entry requires a fault binding");
  }
  if (
    kind === "terminal-fault" &&
    options.binding?.outcome === "environment-continuity-fault" &&
    options.binding.last_engine_reaped_at_ms !== null &&
    observation.observed_at_ms < options.binding.last_engine_reaped_at_ms
  ) {
    throw new Error("power continuity fault coverage differs");
  }
  if (kind === "final" && options.binding?.outcome !== "success") {
    throw new Error("final power continuity entry requires a success binding");
  }
  if (
    kind === "final" &&
    options.binding?.outcome === "success" &&
    (options.binding.engines_started < 1 ||
      start.observed_at_ms > options.binding.first_engine_started_at_ms ||
      observation.observed_at_ms < options.binding.last_engine_reaped_at_ms)
  ) {
    throw new Error("power continuity success coverage differs");
  }
  const withoutDigest = Object.freeze({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
    kind,
    sequence: state?.entries.length ?? 0,
    previous_entry_sha256:
      state?.entries[state.entries.length - 1]?.entry_sha256 ?? null,
    gap_ms:
      previous === undefined
        ? 0
        : observation.observed_at_ms - previous.observed_at_ms,
    status: reason === null ? ("pass" as const) : ("fail" as const),
    fault_reason: reason,
    observation,
    ...(options.binding === undefined ? {} : { binding: options.binding }),
  });
  const entry = Object.freeze({
    ...withoutDigest,
    entry_sha256: powerContinuityEntryDigest(withoutDigest),
  });
  return Object.freeze({
    entries: Object.freeze([...(state?.entries ?? []), entry]),
    start,
    previous: observation,
  });
}

export function verifyHalfkp81Depth18PowerContinuityLedgerForTests(
  entries: readonly Readonly<Halfkp81Depth18PowerContinuityLedgerEntry>[],
): Readonly<{
  samples: number;
  maximum_gap_ms: number;
  final_entry_sha256: string;
}> {
  if (entries.length < 2 || entries[0]?.kind !== "admission") {
    throw new Error("power continuity ledger lacks admission and final rows");
  }
  let state: Halfkp81Depth18PowerContinuityLedgerState | undefined;
  let maximumGap = 0;
  for (const [index, entry] of entries.entries()) {
    exactKeys(
      entry as unknown as Readonly<Record<string, unknown>>,
      entry.binding === undefined
        ? [
            "schema",
            "kind",
            "sequence",
            "previous_entry_sha256",
            "gap_ms",
            "status",
            "fault_reason",
            "observation",
            "entry_sha256",
          ]
        : [
            "schema",
            "kind",
            "sequence",
            "previous_entry_sha256",
            "gap_ms",
            "status",
            "fault_reason",
            "observation",
            "binding",
            "entry_sha256",
          ],
      `power continuity ledger row ${index + 1}`,
    );
    const { entry_sha256: claimedDigest, ...withoutDigest } = entry;
    if (
      entry.sequence !== index ||
      entry.previous_entry_sha256 !==
        (entries[index - 1]?.entry_sha256 ?? null) ||
      powerContinuityEntryDigest(withoutDigest) !== claimedDigest ||
      entry.status !== "pass" ||
      entry.fault_reason !== null
    ) {
      throw new Error(`power continuity ledger row ${index + 1} differs`);
    }
    state = appendHalfkp81Depth18PowerContinuityObservationForTests(
      state,
      entry.observation,
      {
        kind: entry.kind === "admission" ? undefined : entry.kind,
        ...(entry.binding === undefined ? {} : { binding: entry.binding }),
      },
    );
    if (state.entries[index]?.entry_sha256 !== entry.entry_sha256) {
      throw new Error(
        `power continuity ledger row ${index + 1} is not canonical`,
      );
    }
    maximumGap = Math.max(maximumGap, entry.gap_ms);
  }
  if (entries[entries.length - 1]?.kind !== "final") {
    throw new Error("power continuity ledger is not closed by a final row");
  }
  return Object.freeze({
    samples: entries.length,
    maximum_gap_ms: maximumGap,
    final_entry_sha256: entries[entries.length - 1]!.entry_sha256,
  });
}

export function verifyHalfkp81Depth18PowerContinuityFaultLedgerForTests(
  entries: readonly Readonly<Halfkp81Depth18PowerContinuityLedgerEntry>[],
): Readonly<{
  samples: number;
  fault_reason: string;
  final_entry_sha256: string;
}> {
  if (
    entries.length < 2 ||
    entries[0]?.kind !== "admission" ||
    entries[entries.length - 1]?.kind !== "terminal-fault"
  ) {
    throw new Error("power continuity fault ledger is not sealed");
  }
  let state: Halfkp81Depth18PowerContinuityLedgerState | undefined;
  for (const [index, entry] of entries.entries()) {
    const terminal = index === entries.length - 1;
    const { entry_sha256: claimedDigest, ...withoutDigest } = entry;
    if (
      entry.sequence !== index ||
      entry.previous_entry_sha256 !==
        (entries[index - 1]?.entry_sha256 ?? null) ||
      powerContinuityEntryDigest(withoutDigest) !== claimedDigest ||
      (!terminal && (entry.status !== "pass" || entry.fault_reason !== null)) ||
      (terminal &&
        (entry.status !== "fail" ||
          entry.fault_reason === null ||
          entry.binding?.outcome !== "environment-continuity-fault"))
    ) {
      throw new Error(`power continuity fault ledger row ${index + 1} differs`);
    }
    state = appendHalfkp81Depth18PowerContinuityObservationForTests(
      state,
      entry.observation,
      terminal
        ? {
            kind: "terminal-fault",
            forcedFaultReason: entry.fault_reason ?? undefined,
            binding: entry.binding,
          }
        : {},
    );
    if (state.entries[index]?.entry_sha256 !== entry.entry_sha256) {
      throw new Error(
        `power continuity fault ledger row ${index + 1} is not canonical`,
      );
    }
  }
  const terminal = entries[entries.length - 1]!;
  return Object.freeze({
    samples: entries.length,
    fault_reason: terminal.fault_reason as string,
    final_entry_sha256: terminal.entry_sha256,
  });
}

export interface Halfkp81Depth18PowerContinuityGuardianConfig {
  readonly schema: "shogi-halfkp81-depth18-power-continuity-guardian-config-v1r11";
  readonly runnerPid: number;
  readonly teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly sourceRevision?: string;
  readonly producer?: Readonly<Record<string, unknown>>;
  readonly runFingerprint: string;
  readonly launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  /** Stage-B only: full live evidence carried in rows while the held file
   * identity above remains the final-binding capability. Formal runs omit it. */
  readonly inlineLaunchAgentEvidence?: Readonly<Record<string, unknown>>;
  readonly preformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly ledgerPath: string;
  readonly receiptPath: string;
  readonly runnerUtilityArgv: readonly string[];
}

function validatePowerContinuityOutputTarget(filePath: string): void {
  if (!path.isAbsolute(filePath) || path.normalize(filePath) !== filePath) {
    throw new Error("power continuity target is not canonical absolute");
  }
  let cursor = path.dirname(filePath);
  while (true) {
    const status = fs.lstatSync(cursor);
    if (status.isSymbolicLink()) {
      throw new Error("power continuity target ancestor is a symlink");
    }
    if (fs.realpathSync.native(cursor) !== cursor) {
      throw new Error("power continuity target ancestor is an alias");
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

export interface Halfkp81Depth18PmsetCursor {
  readonly anchorRawLine: string;
  readonly anchorOrdinal: number;
  readonly previousRawLine: string;
  readonly previousOrdinal: number;
  readonly rows: readonly string[];
}

export const HALFKP81_DEPTH18_SYSTEM_COMMAND_TIMEOUT_MS = 60_000;

function systemText(executable: string, args: readonly string[]): string {
  return execFileSync(executable, [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: HALFKP81_DEPTH18_SYSTEM_COMMAND_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export const HALFKP81_DEPTH18_PMSET_LOG_TAIL_ROWS = 4_096;

export function halfkp81Depth18BoundedPmsetLogCommandForTests(): Readonly<{
  executable: string;
  args: readonly string[];
  timeoutMs: number;
}> {
  return Object.freeze({
    executable: "/bin/sh",
    args: Object.freeze([
      "-c",
      [
        "set -o pipefail",
        "/usr/bin/pmset -g log |",
        "/usr/bin/awk '/^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9] [+-][0-9][0-9][0-9][0-9][[:space:]]/' |",
        `/usr/bin/tail -n ${HALFKP81_DEPTH18_PMSET_LOG_TAIL_ROWS}`,
      ].join("\n"),
    ]),
    timeoutMs: HALFKP81_DEPTH18_SYSTEM_COMMAND_TIMEOUT_MS,
  });
}

function boundedSystemPmsetLogText(): string {
  const command = halfkp81Depth18BoundedPmsetLogCommandForTests();
  return systemText(command.executable, command.args);
}

export function parseHalfkp81Depth18PmsetLogRowsForTests(
  raw: string,
): readonly string[] {
  const rows = raw
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .filter(
      (line) =>
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+\S/u.test(line) &&
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+: Showing all currently held IOKit power assertions$/u.test(
          line,
        ),
    );
  if (rows.length === 0) throw new Error("pmset log has no anchorable rows");
  return Object.freeze(rows);
}

export function parseHalfkp81Depth18PmsetBatteryForTests(raw: string): {
  powerSource: string;
  batteryPercentage: number;
} {
  const powerSource = /Now drawing from '([^']+)'/u.exec(raw)?.[1];
  const battery = /\b(\d{1,3})%;/u.exec(raw)?.[1];
  if (powerSource === undefined || battery === undefined) {
    throw new Error("pmset battery output is not parseable");
  }
  return { powerSource, batteryPercentage: Number(battery) };
}

export function parseHalfkp81Depth18CaffeinateAssertionsForTests(
  raw: string,
  caffeinatePid: number,
): readonly string[] {
  const ownerPrefix = new RegExp(
    `^\\s*pid ${caffeinatePid}\\(caffeinate\\):`,
    "u",
  );
  const assertions = new Set<string>();
  for (const line of raw.split("\n")) {
    if (!ownerPrefix.test(line)) continue;
    for (const name of V1R11_REQUIRED_CAFFEINATE_ASSERTIONS) {
      if (new RegExp(`\\b${name}\\b`, "u").test(line)) assertions.add(name);
    }
  }
  return Object.freeze([...assertions].sort(compareBytewise));
}

function initialPmsetCursor(
  rows: readonly string[],
): Halfkp81Depth18PmsetCursor {
  const ownedRows = Object.freeze(
    rows.map((row) => Buffer.from(row, "utf8").toString("utf8")),
  );
  const rawLine = ownedRows[ownedRows.length - 1]!;
  return Object.freeze({
    anchorRawLine: rawLine,
    anchorOrdinal: rows.length,
    previousRawLine: rawLine,
    previousOrdinal: rows.length,
    rows: ownedRows,
  });
}

export function advanceHalfkp81Depth18PmsetCursorForTests(
  rows: readonly string[],
  cursor: Readonly<Halfkp81Depth18PmsetCursor> | undefined,
): Readonly<{
  cursor: Readonly<Halfkp81Depth18PmsetCursor>;
  newRows: readonly string[];
}> {
  if (rows.length === 0) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "pmset-anchor-missing-truncated-reset-or-ambiguous",
    );
  }
  if (cursor === undefined) {
    return Object.freeze({
      cursor: initialPmsetCursor(rows),
      newRows: Object.freeze([]),
    });
  }
  const matches: number[] = [];
  for (const [index, row] of rows.entries()) {
    if (row === cursor.previousRawLine) matches.push(index);
  }
  if (matches.length !== 1) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "pmset-anchor-missing-truncated-reset-or-ambiguous",
    );
  }
  const newRows = Object.freeze(
    rows
      .slice(matches[0]! + 1)
      .map((row) => Buffer.from(row, "utf8").toString("utf8")),
  );
  const currentRawLine = newRows.at(-1) ?? cursor.previousRawLine;
  return Object.freeze({
    cursor: Object.freeze({
      anchorRawLine: cursor.anchorRawLine,
      anchorOrdinal: cursor.anchorOrdinal,
      previousRawLine: currentRawLine,
      previousOrdinal: cursor.previousOrdinal + newRows.length,
      rows: Object.freeze([...cursor.rows, ...newRows]),
    }),
    newRows,
  });
}

export function deriveHalfkp81Depth18DarwinBootIdentityForTests(
  bootSessionUuidRaw: string,
  bootUuidRaw: string,
): string {
  const bootSessionUuid = bootSessionUuidRaw.trim();
  const bootUuid = bootUuidRaw.trim();
  const uuid = /^[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}$/u;
  if (
    !uuid.test(bootSessionUuid) ||
    !uuid.test(bootUuid) ||
    bootSessionUuidRaw.trimEnd() !== bootSessionUuid ||
    bootUuidRaw.trimEnd() !== bootUuid
  ) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "boot-session-identity-missing-or-malformed",
    );
  }
  return sha256(`darwin-boot-identity-v1\0${bootSessionUuid}\0${bootUuid}`);
}

async function captureSystemPowerContinuityObservation(
  config: Readonly<Halfkp81Depth18PowerContinuityGuardianConfig>,
  cursor: Readonly<Halfkp81Depth18PmsetCursor> | undefined,
  now = Date.now(),
): Promise<
  Readonly<{
    observation: Readonly<Halfkp81Depth18PowerContinuityObservation>;
    cursor: Readonly<Halfkp81Depth18PmsetCursor>;
  }>
> {
  const battery = parseHalfkp81Depth18PmsetBatteryForTests(
    systemText("/usr/bin/pmset", ["-g", "batt"]),
  );
  const parsedProcessRows = systemText("/bin/ps", [
    "-ww",
    "-axo",
    "pid=,ppid=,command=",
  ])
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  const runnerCommandRows = parsedProcessRows.filter(
    (match) => Number(match[1]) === config.runnerPid,
  );
  if (runnerCommandRows.length !== 1) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "runner-process-identity-missing-or-ambiguous",
    );
  }
  const expectedRunnerCommand = config.runnerUtilityArgv.join(" ");
  if (runnerCommandRows[0]![3] !== expectedRunnerCommand) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "runner-utility-argv-mismatch",
    );
  }
  const expectedCaffeinateCommand = `/usr/bin/caffeinate -dimsu -w ${String(config.runnerPid)}`;
  const processRows = parsedProcessRows.filter(
    (match) =>
      Number(match[2]) === config.runnerPid &&
      match[3] === expectedCaffeinateCommand,
  );
  if (processRows.length !== 1) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "caffeinate-assertion-holder-parent-pid-not-exact-runner-pid",
    );
  }
  const runnerChildCaffeinatePid = Number(processRows[0]![1]);
  const caffeinateCommand = processRows[0]![3];
  const commandTokens = caffeinateCommand.split(/\s+/u);
  const caffeinateExecutable = commandTokens[0] ?? "";
  const assertions = parseHalfkp81Depth18CaffeinateAssertionsForTests(
    systemText("/usr/bin/pmset", ["-g", "assertions"]),
    runnerChildCaffeinatePid,
  );
  const bootSessionIdentity = deriveHalfkp81Depth18DarwinBootIdentityForTests(
    systemText("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"]),
    systemText("/usr/sbin/sysctl", ["-n", "kern.bootuuid"]),
  );
  const rows = parseHalfkp81Depth18PmsetLogRowsForTests(
    boundedSystemPmsetLogText(),
  );
  const advanced = advanceHalfkp81Depth18PmsetCursorForTests(rows, cursor);
  const prior = cursor ?? advanced.cursor;
  const newRows = advanced.newRows;
  const currentRawLine = advanced.cursor.previousRawLine;
  const nextCursor = advanced.cursor;
  const observation = Object.freeze({
    observed_at_ms: now,
    timestamp_utc: new Date(now).toISOString(),
    power_source: battery.powerSource,
    battery_percentage: battery.batteryPercentage,
    runner_pid: config.runnerPid,
    guardian_pid: process.pid,
    caffeinate_assertion_holder_pid: runnerChildCaffeinatePid,
    caffeinate_assertion_holder_parent_runner_pid: config.runnerPid,
    caffeinate_executable: caffeinateExecutable,
    caffeinate_argv: Object.freeze(commandTokens),
    runner_utility_argv: Object.freeze([...config.runnerUtilityArgv]),
    assertion_owner_caffeinate_pid: runnerChildCaffeinatePid,
    assertions,
    boot_session_identity: bootSessionIdentity,
    pmset_event_ordinal: nextCursor.previousOrdinal,
    pmset_previous_raw_event_line_sha256:
      cursor === undefined ? null : sha256(prior.previousRawLine),
    pmset_last_raw_event_line_sha256: sha256(currentRawLine),
    pmset_anchor_raw_event_line: prior.anchorRawLine,
    pmset_new_raw_event_lines: Object.freeze(newRows),
  });
  return Object.freeze({ observation, cursor: nextCursor });
}

async function appendPowerContinuityLedgerEntry(
  handle: fs.promises.FileHandle,
  entry: Readonly<Halfkp81Depth18PowerContinuityLedgerEntry>,
): Promise<void> {
  await handle.write(canonicalJsonLine(entry));
  await handle.sync();
}

function frozenPowerAnchor(
  rawLine: string,
  ordinal: number,
  bootSessionIdentity: string,
): Readonly<Record<string, unknown>> {
  const match =
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})\b/u.exec(
      rawLine,
    );
  if (match === null) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "pmset-anchor-timestamp-is-not-parseable",
    );
  }
  const timezoneOffset = `${match[3]}:${match[4]}`;
  const timestamp = new Date(`${match[1]}T${match[2]}${timezoneOffset}`);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Halfkp81Depth18EnvironmentContinuityError(
      "pmset-anchor-timestamp-is-not-finite",
    );
  }
  return Object.freeze({
    boot_session_identity: bootSessionIdentity,
    timestamp_utc: timestamp.toISOString(),
    timezone_offset: timezoneOffset,
    pmset_event_ordinal: ordinal,
    last_raw_event_line_sha256: sha256(rawLine),
  });
}

function frozenPowerObservation(
  config: Readonly<Halfkp81Depth18PowerContinuityGuardianConfig>,
  captured: Readonly<{
    observation: Readonly<Halfkp81Depth18PowerContinuityObservation>;
    cursor: Readonly<Halfkp81Depth18PmsetCursor>;
  }>,
): Readonly<Record<string, unknown>> {
  const observation = captured.observation;
  if (config.sourceRevision === undefined || config.producer === undefined) {
    throw new Error("frozen power observation requires formal configuration");
  }
  return Object.freeze({
    observed_at_ms: observation.observed_at_ms,
    timestamp_utc: observation.timestamp_utc,
    power_source: observation.power_source,
    battery_percentage: observation.battery_percentage,
    runner_pid: observation.runner_pid,
    guardian_pid: observation.guardian_pid,
    caffeinate_assertion_holder_pid:
      observation.caffeinate_assertion_holder_pid,
    caffeinate_assertion_holder_parent_runner_pid:
      observation.caffeinate_assertion_holder_parent_runner_pid,
    caffeinate_executable: observation.caffeinate_executable,
    caffeinate_argv: observation.caffeinate_argv,
    runner_utility_argv: observation.runner_utility_argv,
    launchagent_authority_evidence:
      config.inlineLaunchAgentEvidence ?? config.launchAgentAuthority,
    preformal_authority_verified_receipt: config.preformalAuthority,
    assertion_owner_caffeinate_pid: observation.assertion_owner_caffeinate_pid,
    required_assertions: V1R11_REQUIRED_CAFFEINATE_ASSERTIONS,
    boot_session_identity: observation.boot_session_identity,
    pmset_start_anchor: frozenPowerAnchor(
      captured.cursor.anchorRawLine,
      captured.cursor.anchorOrdinal,
      observation.boot_session_identity,
    ),
    pmset_current_cursor: frozenPowerAnchor(
      captured.cursor.previousRawLine,
      captured.cursor.previousOrdinal,
      observation.boot_session_identity,
    ),
  });
}

function frozenPowerEntry(
  config: Readonly<Halfkp81Depth18PowerContinuityGuardianConfig>,
  observation: Readonly<Record<string, unknown>>,
  status: "admission-pass" | "sample-pass" | "final-pass" | "environment-fault",
  entryKind: "admission" | "sample" | "final" | "environment-fault",
  previousEntrySha256: string | null,
  environmentFault: Readonly<{
    kind: "environment-continuity";
    message: string;
    intent_sha256: string;
  }> | null = null,
): Readonly<Record<string, unknown>> {
  if (
    (entryKind === "environment-fault") !== (environmentFault !== null) ||
    (environmentFault !== null &&
      (environmentFault.kind !== "environment-continuity" ||
        environmentFault.message.length < 1 ||
        !SHA256_RE.test(environmentFault.intent_sha256)))
  ) {
    throw new Error("frozen power environment fault closure differs");
  }
  const preimage = Object.freeze({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
    status,
    entry_kind: entryKind,
    timestamp_utc: observation.timestamp_utc,
    teacher_plan: config.teacherPlan,
    source_revision: config.sourceRevision,
    run_fingerprint: config.runFingerprint,
    launchagent_authority_evidence:
      config.inlineLaunchAgentEvidence ?? config.launchAgentAuthority,
    preformal_authority_verified_receipt: config.preformalAuthority,
    observation,
    environment_fault: environmentFault,
    previous_entry_sha256: previousEntrySha256,
  });
  return Object.freeze({
    ...preimage,
    entry_sha256: sha256(
      `${POWER_CONTINUITY_ENTRY_DIGEST_DOMAIN}${canonicalJson(preimage)}`,
    ),
  });
}

async function runFrozenHalfkp81Depth18V1R11PowerGuardian(
  config: Readonly<Halfkp81Depth18PowerContinuityGuardianConfig>,
): Promise<void> {
  let captured = await captureSystemPowerContinuityObservation(
    config,
    undefined,
  );
  let legacyState = appendHalfkp81Depth18PowerContinuityObservationForTests(
    undefined,
    captured.observation,
  );
  let entries: readonly Readonly<Record<string, unknown>>[] = Object.freeze([
    frozenPowerEntry(
      config,
      frozenPowerObservation(config, captured),
      "admission-pass",
      "admission",
      null,
    ),
  ]);
  const handle = await fs.promises.open(
    config.ledgerPath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600,
  );
  const append = async (entry: Readonly<Record<string, unknown>>) => {
    await handle.write(canonicalJsonLine(entry));
    await handle.sync();
  };
  await append(entries[0]!);
  let fault: Halfkp81Depth18EnvironmentContinuityError | undefined;
  let faultCapture:
    | Readonly<{
        observation: Readonly<Halfkp81Depth18PowerContinuityObservation>;
        cursor: Readonly<Halfkp81Depth18PmsetCursor>;
      }>
    | undefined;
  let closed = false;
  let tickTail = Promise.resolve();
  const appendCaptured = async (
    next: typeof captured,
    status: "sample-pass" | "final-pass" | "environment-fault",
    kind: "sample" | "final" | "environment-fault",
    environmentFault: Readonly<{
      kind: "environment-continuity";
      message: string;
      intent_sha256: string;
    }> | null = null,
  ) => {
    const entry = frozenPowerEntry(
      config,
      frozenPowerObservation(config, next),
      status,
      kind,
      String(entries.at(-1)!.entry_sha256),
      environmentFault,
    );
    entries = Object.freeze([...entries, entry]);
    await append(entry);
  };
  const sample = async (): Promise<void> => {
    if (closed || fault !== undefined) return;
    const next = await captureSystemPowerContinuityObservation(
      config,
      captured.cursor,
    );
    const reason = halfkp81Depth18PowerContinuityFailureReasonForTests(
      legacyState.start,
      legacyState.previous,
      next.observation,
    );
    if (reason !== null) {
      fault = new Halfkp81Depth18EnvironmentContinuityError(reason);
      faultCapture = next;
      process.send?.({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
        type: "fault",
        reason,
      });
      return;
    }
    legacyState = appendHalfkp81Depth18PowerContinuityObservationForTests(
      legacyState,
      next.observation,
    );
    captured = next;
    await appendCaptured(next, "sample-pass", "sample");
    process.send?.({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
      type: "heartbeat",
      observedAtMs: next.observation.observed_at_ms,
    });
  };
  const timer = setInterval(() => {
    tickTail = tickTail.then(sample).catch((error: unknown) => {
      if (fault === undefined) {
        fault = new Halfkp81Depth18EnvironmentContinuityError(
          `guardian-sample-failed:${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        process.send?.({
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
          type: "fault",
          reason: fault.reason,
        });
      }
    });
  }, 20_000);
  timer.unref();
  let lastRequestId = 0;
  const finalize = async (
    request: Extract<
      PowerContinuityGuardianRequest,
      { type: "finalize-success" | "finalize-fault" }
    >,
  ): Promise<void> => {
    clearInterval(timer);
    await tickTail;
    let closing = captured;
    if (request.type === "finalize-success") {
      if (fault !== undefined) throw fault;
      closing = await captureSystemPowerContinuityObservation(
        config,
        captured.cursor,
      );
      const reason = halfkp81Depth18PowerContinuityFailureReasonForTests(
        legacyState.start,
        legacyState.previous,
        closing.observation,
      );
      if (reason !== null) {
        throw new Halfkp81Depth18EnvironmentContinuityError(reason);
      }
      await appendCaptured(closing, "final-pass", "final");
    } else {
      if (faultCapture !== undefined) closing = faultCapture;
      else {
        try {
          closing = await captureSystemPowerContinuityObservation(
            config,
            captured.cursor,
          );
        } catch {
          closing = captured;
        }
      }
      await appendCaptured(
        closing,
        "environment-fault",
        "environment-fault",
        Object.freeze({
          kind: "environment-continuity",
          message: request.reason,
          intent_sha256: request.binding.terminal_fault_preimage_sha256,
        }),
      );
    }
    await handle.close();
    closed = true;
    const ledgerRaw = await readHeldStableFile(
      config.ledgerPath,
      "closed frozen v1r11 power ledger",
    );
    const ledgerIdentity = v1r11FullIdentity(
      fileIdentity(config.ledgerPath, ledgerRaw),
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
    );
    const first = entries[0]!;
    const final = entries.at(-1)!;
    const firstObservation = first.observation as Readonly<
      Record<string, unknown>
    >;
    const finalObservation = final.observation as Readonly<
      Record<string, unknown>
    >;
    const receipt = Object.freeze({
      schema:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
      status:
        request.type === "finalize-success"
          ? "power-continuity-verified"
          : "environment-fault-closed",
      teacher_plan: config.teacherPlan,
      source_revision: config.sourceRevision,
      run_fingerprint: config.runFingerprint,
      power_ledger: ledgerIdentity,
      admission_entry: first,
      final_entry: final,
      launchagent_authority_evidence:
        config.inlineLaunchAgentEvidence ?? config.launchAgentAuthority,
      preformal_authority_verified_receipt: config.preformalAuthority,
      pmset_start_anchor: firstObservation.pmset_start_anchor,
      pmset_end_anchor: finalObservation.pmset_current_cursor,
      environment_fault_preimage_sha256:
        request.type === "finalize-fault"
          ? request.binding.terminal_fault_preimage_sha256
          : null,
      producer: config.producer,
    });
    const receiptIdentity = v1r11FullIdentity(
      await publishCreateOnly(config.receiptPath, canonicalJsonLine(receipt)),
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
    );
    process.send?.({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
      type: "finalized",
      requestId: request.requestId,
      ledger: ledgerIdentity,
      receipt: receiptIdentity,
    });
  };
  process.on("message", (raw: unknown) => {
    let request: Readonly<PowerContinuityGuardianRequest>;
    try {
      request = validatePowerContinuityGuardianRequest(raw, lastRequestId);
      if (closed) throw new Error("power guardian request follows closure");
      lastRequestId = request.requestId;
    } catch (error) {
      const reason = `guardian-malformed-request:${
        error instanceof Error ? error.message : String(error)
      }`;
      fault ??= new Halfkp81Depth18EnvironmentContinuityError(reason);
      process.send?.({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
        type: "fault",
        reason,
      });
      return;
    }
    if (request.type === "check") {
      void sample()
        .then(() => {
          if (fault !== undefined) throw fault;
          process.send?.({
            schema:
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
            type: "checked",
            requestId: request.requestId,
          });
        })
        .catch((error: unknown) =>
          process.send?.({
            schema:
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
            type: "fault",
            requestId: request.requestId,
            reason: error instanceof Error ? error.message : String(error),
          }),
        );
      return;
    }
    void finalize(request).catch((error: unknown) =>
      process.send?.({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
        type: "fatal",
        requestId: request.requestId,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  });
  process.send?.({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
    type: "ready",
    observedAtMs: captured.observation.observed_at_ms,
    guardianPid: process.pid,
    caffeinatePid: captured.observation.caffeinate_assertion_holder_pid,
    admissionEntry: entries[0],
  });
}

type PowerContinuityGuardianRequest =
  | Readonly<{
      schema: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA;
      type: "check";
      requestId: number;
    }>
  | Readonly<{
      schema: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA;
      type: "finalize-success";
      requestId: number;
      binding: Readonly<Halfkp81Depth18PowerContinuityFinalBinding>;
    }>
  | Readonly<{
      schema: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA;
      type: "finalize-fault";
      requestId: number;
      reason: string;
      binding: Readonly<Halfkp81Depth18PowerContinuityFaultBinding>;
    }>;

function validatePowerContinuityGuardianRequest(
  raw: unknown,
  previousRequestId: number,
): Readonly<PowerContinuityGuardianRequest> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("power guardian request is not an object");
  }
  const request = raw as Readonly<Record<string, unknown>>;
  const type = request.type;
  exactKeys(
    request,
    type === "check"
      ? ["schema", "type", "requestId"]
      : type === "finalize-success"
        ? ["schema", "type", "requestId", "binding"]
        : type === "finalize-fault"
          ? ["schema", "type", "requestId", "reason", "binding"]
          : [],
    "power guardian request",
  );
  if (
    request.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA ||
    !["check", "finalize-success", "finalize-fault"].includes(String(type)) ||
    !validPowerObservationInteger(request.requestId) ||
    request.requestId <= previousRequestId ||
    (type === "finalize-fault" &&
      (typeof request.reason !== "string" || request.reason.length === 0))
  ) {
    throw new Error("power guardian request values differ");
  }
  if (type === "finalize-success" || type === "finalize-fault") {
    validatePowerContinuityBinding(
      request.binding as Readonly<
        | Halfkp81Depth18PowerContinuityFinalBinding
        | Halfkp81Depth18PowerContinuityFaultBinding
      >,
    );
  }
  return request as unknown as Readonly<PowerContinuityGuardianRequest>;
}

export function validateHalfkp81Depth18PowerGuardianMessageForTests(
  raw: unknown,
): Readonly<Record<string, unknown>> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("power guardian IPC message is not an object");
  }
  const message = raw as Readonly<Record<string, unknown>>;
  const type = message.type;
  const keys =
    type === "ready"
      ? [
          "schema",
          "type",
          "observedAtMs",
          "guardianPid",
          "caffeinatePid",
          ...(message.admissionEntry === undefined ? [] : ["admissionEntry"]),
        ]
      : type === "heartbeat"
        ? ["schema", "type", "observedAtMs"]
        : type === "checked"
          ? ["schema", "type", "requestId"]
          : type === "finalized"
            ? ["schema", "type", "requestId", "ledger", "receipt"]
            : type === "fatal"
              ? [
                  "schema",
                  "type",
                  ...(message.requestId === undefined ? [] : ["requestId"]),
                  "reason",
                ]
              : type === "fault"
                ? [
                    "schema",
                    "type",
                    ...(message.requestId === undefined ? [] : ["requestId"]),
                    "reason",
                  ]
                : undefined;
  if (keys === undefined) throw new Error("power guardian IPC type differs");
  exactKeys(message, keys, "power guardian IPC message");
  if (
    message.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA ||
    ((type === "ready" || type === "heartbeat") &&
      !validPowerObservationInteger(message.observedAtMs)) ||
    (type === "ready" &&
      (!validPowerObservationInteger(message.guardianPid) ||
        Number(message.guardianPid) < 1 ||
        !validPowerObservationInteger(message.caffeinatePid) ||
        Number(message.caffeinatePid) < 1)) ||
    (["checked", "finalized"].includes(String(type)) &&
      (!validPowerObservationInteger(message.requestId) ||
        Number(message.requestId) < 1)) ||
    (type === "fatal" &&
      message.requestId !== undefined &&
      (!validPowerObservationInteger(message.requestId) ||
        Number(message.requestId) < 1)) ||
    (type === "fault" &&
      message.requestId !== undefined &&
      (!validPowerObservationInteger(message.requestId) ||
        Number(message.requestId) < 1)) ||
    ((type === "fault" || type === "fatal") &&
      (typeof message.reason !== "string" || message.reason.length === 0))
  ) {
    throw new Error("power guardian IPC message values differ");
  }
  if (type === "finalized") {
    for (const [label, identity] of [
      ["ledger", message.ledger],
      ["receipt", message.receipt],
    ] as const) {
      if (
        identity === null ||
        typeof identity !== "object" ||
        Array.isArray(identity)
      ) {
        throw new Error(`power guardian ${label} IPC identity differs`);
      }
      const record = identity as Readonly<Record<string, unknown>>;
      exactKeys(
        record,
        [
          "path",
          "bytes",
          "sha256",
          ...(record.schema === undefined ? [] : ["schema"]),
        ],
        `power guardian ${label}`,
      );
      if (
        !path.isAbsolute(String(record.path)) ||
        !Number.isSafeInteger(record.bytes) ||
        Number(record.bytes) < 1 ||
        !SHA256_RE.test(String(record.sha256)) ||
        (record.schema !== undefined &&
          (typeof record.schema !== "string" || record.schema.length < 1))
      ) {
        throw new Error(`power guardian ${label} IPC identity differs`);
      }
    }
  }
  if (
    type === "ready" &&
    message.admissionEntry !== undefined &&
    (message.admissionEntry === null ||
      typeof message.admissionEntry !== "object" ||
      Array.isArray(message.admissionEntry))
  ) {
    throw new Error("power guardian admission IPC entry differs");
  }
  return message;
}

/** Entry used only by the independent guardian child. */
export async function runHalfkp81Depth18V1R11PowerContinuityGuardianProcess(
  config: Readonly<Halfkp81Depth18PowerContinuityGuardianConfig>,
): Promise<void> {
  const frozenFormal = config.sourceRevision !== undefined;
  if (
    config.schema !==
      "shogi-halfkp81-depth18-power-continuity-guardian-config-v1r11" ||
    !Number.isSafeInteger(config.runnerPid) ||
    config.runnerPid < 1 ||
    !SHA256_RE.test(config.teacherPlan.sha256) ||
    !SHA256_RE.test(config.launchAgentAuthority.sha256) ||
    !SHA256_RE.test(config.preformalAuthority.sha256) ||
    !SHA256_RE.test(config.runFingerprint) ||
    (frozenFormal &&
      (!REVISION_RE.test(config.sourceRevision ?? "") ||
        config.producer === undefined)) ||
    (!frozenFormal && config.producer !== undefined) ||
    (config.inlineLaunchAgentEvidence !== undefined &&
      (config.inlineLaunchAgentEvidence === null ||
        Array.isArray(config.inlineLaunchAgentEvidence)))
  ) {
    throw new Error("power guardian configuration differs");
  }
  exactKeys(
    config as unknown as Readonly<Record<string, unknown>>,
    [
      "schema",
      "runnerPid",
      "teacherPlan",
      ...(frozenFormal ? ["sourceRevision", "producer"] : []),
      "runFingerprint",
      "launchAgentAuthority",
      ...(config.inlineLaunchAgentEvidence === undefined
        ? []
        : ["inlineLaunchAgentEvidence"]),
      "preformalAuthority",
      "ledgerPath",
      "receiptPath",
      "runnerUtilityArgv",
    ],
    "power guardian configuration",
  );
  validatePowerContinuityOutputTarget(config.ledgerPath);
  validatePowerContinuityOutputTarget(config.receiptPath);
  if (
    path.dirname(config.ledgerPath) !== path.dirname(config.receiptPath) ||
    path.basename(config.ledgerPath) !== "power-continuity.jsonl" ||
    path.basename(config.receiptPath) !== "power-continuity-receipt.json"
  ) {
    throw new Error("power guardian output namespace differs");
  }
  if (frozenFormal) {
    return runFrozenHalfkp81Depth18V1R11PowerGuardian(config);
  }
  let captured = await captureSystemPowerContinuityObservation(
    config,
    undefined,
  );
  let state = appendHalfkp81Depth18PowerContinuityObservationForTests(
    undefined,
    captured.observation,
  );
  const handle = await fs.promises.open(
    config.ledgerPath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600,
  );
  await appendPowerContinuityLedgerEntry(handle, state.entries[0]!);
  let fault: Halfkp81Depth18EnvironmentContinuityError | undefined;
  let faultObservation:
    Readonly<Halfkp81Depth18PowerContinuityObservation> | undefined;
  let closed = false;
  let tickTail: Promise<void> = Promise.resolve();
  const sample = async (): Promise<void> => {
    if (closed || fault !== undefined) return;
    const next = await captureSystemPowerContinuityObservation(
      config,
      captured.cursor,
    );
    const reason = halfkp81Depth18PowerContinuityFailureReasonForTests(
      state.start,
      state.previous,
      next.observation,
    );
    captured = next;
    if (reason !== null) {
      fault = new Halfkp81Depth18EnvironmentContinuityError(reason);
      faultObservation = next.observation;
      process.send?.({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
        type: "fault",
        reason,
      });
      return;
    }
    state = appendHalfkp81Depth18PowerContinuityObservationForTests(
      state,
      next.observation,
    );
    await appendPowerContinuityLedgerEntry(
      handle,
      state.entries[state.entries.length - 1]!,
    );
    process.send?.({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
      type: "heartbeat",
      observedAtMs: next.observation.observed_at_ms,
    });
  };
  const timer = setInterval(() => {
    tickTail = tickTail.then(sample).catch((error: unknown) => {
      if (fault === undefined) {
        fault =
          error instanceof Halfkp81Depth18EnvironmentContinuityError
            ? error
            : new Halfkp81Depth18EnvironmentContinuityError(
                `guardian-sample-failed:${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
        process.send?.({
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
          type: "fault",
          reason: fault.reason,
        });
      }
    });
  }, HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_SAMPLE_INTERVAL_MS);
  timer.unref();

  const finalize = async (
    request: Extract<
      PowerContinuityGuardianRequest,
      { type: "finalize-success" | "finalize-fault" }
    >,
  ): Promise<void> => {
    clearInterval(timer);
    await tickTail;
    if (request.type === "finalize-success") {
      if (fault !== undefined) throw fault;
      const finalCapture = await captureSystemPowerContinuityObservation(
        config,
        captured.cursor,
      );
      const finalReason = halfkp81Depth18PowerContinuityFailureReasonForTests(
        state.start,
        state.previous,
        finalCapture.observation,
      );
      if (finalReason !== null) {
        throw new Halfkp81Depth18EnvironmentContinuityError(finalReason);
      }
      captured = finalCapture;
      state = appendHalfkp81Depth18PowerContinuityObservationForTests(
        state,
        finalCapture.observation,
        { kind: "final", binding: request.binding },
      );
    } else {
      const reason = fault?.reason ?? request.reason;
      let closingObservation = faultObservation;
      if (closingObservation === undefined) {
        try {
          const finalCapture = await captureSystemPowerContinuityObservation(
            config,
            captured.cursor,
          );
          closingObservation = finalCapture.observation;
          captured = finalCapture;
        } catch {
          // A parser/transport failure has no newer trustworthy observation;
          // the fault row repeats the last authenticated sample explicitly.
          closingObservation = state.previous;
        }
      }
      state = appendHalfkp81Depth18PowerContinuityObservationForTests(
        state,
        closingObservation,
        {
          kind: "terminal-fault",
          forcedFaultReason: reason,
          binding: request.binding,
        },
      );
    }
    await appendPowerContinuityLedgerEntry(
      handle,
      state.entries[state.entries.length - 1]!,
    );
    await handle.close();
    closed = true;
    const ledgerRaw = await readHeldStableFile(
      config.ledgerPath,
      "closed v1r11 power continuity ledger",
    );
    const ledgerIdentity = fileIdentity(config.ledgerPath, ledgerRaw);
    const verification =
      request.type === "finalize-success"
        ? verifyHalfkp81Depth18PowerContinuityLedgerForTests(state.entries)
        : verifyHalfkp81Depth18PowerContinuityFaultLedgerForTests(
            state.entries,
          );
    const receipt = Object.freeze({
      schema:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
      status:
        request.type === "finalize-success"
          ? "power-continuity-pass"
          : "environment-continuity-fault",
      teacher_plan: config.teacherPlan,
      run_fingerprint: config.runFingerprint,
      ledger: ledgerIdentity,
      verification,
      binding: request.binding,
      authority: {
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    const receiptIdentity = await publishCreateOnly(
      config.receiptPath,
      canonicalJsonLine(receipt),
    );
    process.send?.({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
      type: "finalized",
      requestId: request.requestId,
      ledger: ledgerIdentity,
      receipt: receiptIdentity,
    });
  };

  let lastRequestId = 0;
  process.on("message", (raw: unknown) => {
    let request: Readonly<PowerContinuityGuardianRequest>;
    try {
      request = validatePowerContinuityGuardianRequest(raw, lastRequestId);
      if (closed) throw new Error("power guardian request follows closure");
      lastRequestId = request.requestId;
    } catch (error) {
      const reason = `guardian-malformed-request:${
        error instanceof Error ? error.message : String(error)
      }`;
      fault ??= new Halfkp81Depth18EnvironmentContinuityError(reason);
      process.send?.({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
        type: "fault",
        reason,
      });
      return;
    }
    if (request?.type === "check") {
      tickTail = tickTail
        .then(sample)
        .then(() => {
          if (fault !== undefined) throw fault;
          process.send?.({
            schema:
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
            type: "checked",
            requestId: request.requestId,
          });
        })
        .catch((error: unknown) => {
          process.send?.({
            schema:
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
            type: "fault",
            requestId: request.requestId,
            reason:
              error instanceof Halfkp81Depth18EnvironmentContinuityError
                ? error.reason
                : `guardian-check-failed:${
                    error instanceof Error ? error.message : String(error)
                  }`,
          });
        });
      return;
    }
    if (
      request?.type === "finalize-success" ||
      request?.type === "finalize-fault"
    ) {
      void finalize(request).catch((error: unknown) => {
        process.send?.({
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
          type: "fatal",
          requestId: request.requestId,
          reason: error instanceof Error ? error.message : String(error),
        });
      });
    }
  });
  process.send?.({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
    type: "ready",
    observedAtMs: state.previous.observed_at_ms,
    guardianPid: process.pid,
    caffeinatePid: state.previous.caffeinate_assertion_holder_pid,
  });
  await new Promise<void>((resolve) => {
    process.once("disconnect", resolve);
  });
  if (!closed) {
    clearInterval(timer);
    await handle.close().catch(() => undefined);
  }
}

function waitForGuardianMessage(
  child: ChildProcess,
  predicate: (message: Readonly<Record<string, unknown>>) => boolean,
  timeoutMs = 60_000,
): Promise<Readonly<Record<string, unknown>>> {
  if (
    !child.connected ||
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return Promise.reject(
      new Halfkp81Depth18EnvironmentContinuityError(
        `guardian-exited:${child.exitCode ?? "signal"}:${child.signalCode ?? "none"}`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Halfkp81Depth18EnvironmentContinuityError("guardian-ipc-timeout"),
      );
    }, timeoutMs);
    const onMessage = (raw: unknown): void => {
      if (
        raw === null ||
        typeof raw !== "object" ||
        !predicate(raw as Readonly<Record<string, unknown>>)
      ) {
        return;
      }
      cleanup();
      resolve(raw as Readonly<Record<string, unknown>>);
    };
    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      cleanup();
      reject(
        new Halfkp81Depth18EnvironmentContinuityError(
          `guardian-exited:${code ?? "signal"}:${signal ?? "none"}`,
        ),
      );
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

interface Halfkp81Depth18ClosableGuardianChild {
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  readonly connected: boolean;
  once(event: "exit", listener: () => void): unknown;
  disconnect(): void;
  kill(signal: NodeJS.Signals): boolean;
}

export async function closeHalfkp81Depth18GuardianChildForTests(
  child: Halfkp81Depth18ClosableGuardianChild,
  waitForExit: (
    exited: Promise<void>,
    timeoutMs: number,
  ) => Promise<boolean> = async (exited, timeoutMs) =>
    Promise.race([
      exited.then(() => true),
      new Promise<false>((resolve) =>
        setTimeout(() => resolve(false), timeoutMs),
      ),
    ]),
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  if (child.connected) child.disconnect();
  if (await waitForExit(exited, 5_000)) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.kill("SIGTERM")) {
    throw new Error("power guardian SIGTERM delivery failed");
  }
  if (await waitForExit(exited, 5_000)) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.kill("SIGKILL")) {
    throw new Error("power guardian SIGKILL delivery failed");
  }
  if (!(await waitForExit(exited, 5_000))) {
    throw new Error("power guardian did not exit after SIGKILL");
  }
}

export async function startHalfkp81Depth18V1R11PowerContinuitySession(
  context: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    sourceRevision?: string;
    runFingerprint: string;
    launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    inlineLaunchAgentEvidence?: Readonly<Record<string, unknown>>;
    preformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    ledgerPath?: string;
    receiptPath?: string;
  }>,
): Promise<Halfkp81Depth18PowerContinuitySession> {
  const config: Halfkp81Depth18PowerContinuityGuardianConfig = Object.freeze({
    schema: "shogi-halfkp81-depth18-power-continuity-guardian-config-v1r11",
    runnerPid: process.pid,
    teacherPlan: context.teacherPlan,
    ...(context.sourceRevision === undefined
      ? {}
      : {
          sourceRevision: context.sourceRevision,
          producer: v1r11ImplementationIdentityFromRevision(
            path.resolve(__dirname, ".."),
            context.sourceRevision,
            "ml/halfkp81-depth18-power-continuity-guardian.ts",
          ),
        }),
    runFingerprint: context.runFingerprint,
    launchAgentAuthority: context.launchAgentAuthority,
    ...(context.inlineLaunchAgentEvidence === undefined
      ? {}
      : { inlineLaunchAgentEvidence: context.inlineLaunchAgentEvidence }),
    preformalAuthority: context.preformalAuthority,
    ledgerPath:
      context.ledgerPath ??
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_PATH,
    receiptPath:
      context.receiptPath ??
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_PATH,
    runnerUtilityArgv: Object.freeze([
      process.execPath,
      ...process.execArgv,
      ...process.argv.slice(1),
    ]),
  });
  validatePowerContinuityOutputTarget(config.ledgerPath);
  validatePowerContinuityOutputTarget(config.receiptPath);
  for (const target of [config.ledgerPath, config.receiptPath]) {
    try {
      await fs.promises.lstat(target);
      throw new Error(`power continuity create-only target exists: ${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const guardianPath = path.join(
    __dirname,
    "halfkp81-depth18-power-continuity-guardian.ts",
  );
  const child = fork(guardianPath, [], {
    env: {
      ...process.env,
      HALFKP81_DEPTH18_POWER_GUARDIAN_CONFIG: Buffer.from(
        canonicalJson(config),
        "utf8",
      ).toString("base64"),
    },
    execArgv: process.execArgv,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  let failureError: Halfkp81Depth18EnvironmentContinuityError | undefined;
  let finalized = false;
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
  });
  void failure.catch(() => undefined);
  const fail = (reason: string): void => {
    if (failureError !== undefined) return;
    failureError = new Halfkp81Depth18EnvironmentContinuityError(reason);
    rejectFailure(failureError);
  };
  const heartbeatWatchdog = startHalfkp81Depth18PowerHeartbeatWatchdogForTests({
    now: Date.now,
    schedule(callback, intervalMs) {
      const timer = setInterval(callback, intervalMs);
      timer.unref();
      return timer;
    },
    cancel(handle) {
      clearInterval(handle as NodeJS.Timeout);
    },
    fail,
  });
  let readySeen = false;
  let lastGuardianObservedAtMs = -1;
  let lastGuardianResponseRequestId = 0;
  child.on("message", (raw: unknown) => {
    let message: Readonly<Record<string, unknown>>;
    try {
      message = validateHalfkp81Depth18PowerGuardianMessageForTests(raw);
    } catch (error) {
      fail(
        `guardian-malformed-ipc:${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
    if (message.type === "heartbeat" || message.type === "ready") {
      const observedAtMs = Number(message.observedAtMs);
      if (
        observedAtMs <= lastGuardianObservedAtMs ||
        (message.type === "ready" && readySeen) ||
        (message.type === "heartbeat" && !readySeen)
      ) {
        fail("guardian-stale-duplicate-or-out-of-order-ipc");
        return;
      }
      if (message.type === "ready") readySeen = true;
      lastGuardianObservedAtMs = observedAtMs;
      heartbeatWatchdog.heartbeat();
    }
    if (message.requestId !== undefined) {
      const responseRequestId = Number(message.requestId);
      if (responseRequestId <= lastGuardianResponseRequestId) {
        fail("guardian-stale-duplicate-or-out-of-order-ipc");
        return;
      }
      lastGuardianResponseRequestId = responseRequestId;
    }
    if (message.type === "fault" || message.type === "fatal") {
      fail(String(message.reason ?? "guardian-fault-without-reason"));
    }
  });
  child.once("exit", (code, signal) => {
    if (!finalized) {
      fail(`guardian-exited:${code ?? "signal"}:${signal ?? "none"}`);
    }
  });
  child.on("error", (error) => {
    if (!finalized) fail(`guardian-ipc-error:${error.message}`);
  });
  let ready: Readonly<Record<string, unknown>>;
  try {
    ready = await waitForGuardianMessage(
      child,
      (message) =>
        message.type === "ready" ||
        message.type === "fault" ||
        message.type === "fatal",
    );
  } catch (error) {
    fail(
      error instanceof Halfkp81Depth18EnvironmentContinuityError
        ? error.reason
        : `guardian-ready-ipc-failed:${
            error instanceof Error ? error.message : String(error)
          }`,
    );
    heartbeatWatchdog.close();
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    throw failureError;
  }
  if (ready.type !== "ready") {
    fail(String(ready.reason ?? "guardian-failed-before-ready"));
    heartbeatWatchdog.close();
    throw failureError;
  }
  if (
    ready.guardianPid !== child.pid ||
    !Number.isSafeInteger(ready.caffeinatePid) ||
    Number(ready.caffeinatePid) < 1
  ) {
    fail("guardian-ready-process-identity-mismatch");
    throw failureError;
  }
  const admissionEntry = ready.admissionEntry as
    Readonly<Record<string, unknown>> | undefined;
  if (
    (context.sourceRevision === undefined) !==
    (admissionEntry === undefined)
  ) {
    fail("guardian-ready-admission-contract-mismatch");
    throw failureError;
  }
  const authenticatedGuardianPid = Number(ready.guardianPid);
  const authenticatedCaffeinatePid = Number(ready.caffeinatePid);
  let requestId = 0;
  let enginesStarted = 0;
  let enginesReaped = 0;
  let firstEngineStartedAtMs: number | undefined;
  let lastEngineReapedAtMs: number | undefined;
  const assertHealthy = async (fresh = false): Promise<void> => {
    if (failureError !== undefined) throw failureError;
    if (!fresh) return;
    if (!child.connected) {
      fail("guardian-ipc-channel-closed");
      throw failureError;
    }
    const id = ++requestId;
    child.send?.({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
      type: "check",
      requestId: id,
    });
    let response: Readonly<Record<string, unknown>>;
    try {
      response = await waitForGuardianMessage(
        child,
        (message) =>
          (message.type === "checked" || message.type === "fault") &&
          message.requestId === id,
      );
    } catch (error) {
      fail(
        error instanceof Halfkp81Depth18EnvironmentContinuityError
          ? error.reason
          : `guardian-check-ipc-failed:${
              error instanceof Error ? error.message : String(error)
            }`,
      );
      throw failureError;
    }
    if (response.type === "fault") fail(String(response.reason));
    if (failureError !== undefined) throw failureError;
  };
  const finalize = async (
    type: "finalize-success" | "finalize-fault",
    reason?: string,
    terminalFaultPreimageSha256?: string,
  ): Promise<
    Readonly<{
      ledger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    }>
  > => {
    if (
      finalized ||
      enginesStarted !== enginesReaped ||
      (type === "finalize-success" && enginesStarted < 1) ||
      (enginesStarted > 0 &&
        (firstEngineStartedAtMs === undefined ||
          lastEngineReapedAtMs === undefined))
    ) {
      throw new Error(
        "power guardian cannot finalize before every engine reap",
      );
    }
    const id = ++requestId;
    const shared = {
      teacher_plan_sha256: context.teacherPlan.sha256,
      run_fingerprint: context.runFingerprint,
      launchagent_authority: context.launchAgentAuthority,
      preformal_authority: context.preformalAuthority,
      runner_pid: process.pid,
      guardian_pid: authenticatedGuardianPid,
      caffeinate_assertion_holder_pid: authenticatedCaffeinatePid,
      engines_started: enginesStarted,
      engines_reaped: enginesReaped,
      all_yaneuraou_processes_reaped: true as const,
    };
    const binding =
      type === "finalize-success"
        ? {
            outcome: "success" as const,
            ...shared,
            first_engine_started_at_ms: firstEngineStartedAtMs ?? Date.now(),
            last_engine_reaped_at_ms: lastEngineReapedAtMs ?? Date.now(),
          }
        : {
            outcome: "environment-continuity-fault" as const,
            ...shared,
            first_engine_started_at_ms: firstEngineStartedAtMs ?? null,
            last_engine_reaped_at_ms: lastEngineReapedAtMs ?? null,
            terminal_fault_preimage_sha256:
              terminalFaultPreimageSha256 as string,
          };
    if (!child.connected) {
      fail("guardian-ipc-channel-closed");
      throw failureError;
    }
    child.send?.({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
      type,
      requestId: id,
      ...(reason === undefined ? {} : { reason }),
      binding,
    });
    let response: Readonly<Record<string, unknown>>;
    try {
      response = await waitForGuardianMessage(
        child,
        (message) =>
          (message.type === "finalized" || message.type === "fatal") &&
          message.requestId === id,
      );
    } catch (error) {
      fail(
        error instanceof Halfkp81Depth18EnvironmentContinuityError
          ? error.reason
          : `guardian-finalize-ipc-failed:${
              error instanceof Error ? error.message : String(error)
            }`,
      );
      throw failureError;
    }
    if (failureError !== undefined) throw failureError;
    if (response.type === "fatal") {
      fail(String(response.reason));
      throw failureError;
    }
    finalized = true;
    heartbeatWatchdog.close();
    return Object.freeze({
      ledger: Object.freeze(
        response.ledger as Halfkp81Depth18TeacherFileIdentity,
      ),
      receipt: Object.freeze(
        response.receipt as Halfkp81Depth18TeacherFileIdentity,
      ),
    });
  };
  return Object.freeze({
    failure,
    guardianPid: authenticatedGuardianPid,
    caffeinatePid: authenticatedCaffeinatePid,
    ...(admissionEntry === undefined ? {} : { admissionEntry }),
    assertHealthy,
    engineStarted(observedAtMs: number): void {
      enginesStarted += 1;
      firstEngineStartedAtMs ??= observedAtMs;
    },
    engineReaped(observedAtMs: number): void {
      enginesReaped += 1;
      lastEngineReapedAtMs = observedAtMs;
    },
    finalizeSuccess: () => finalize("finalize-success"),
    finalizeFault: (reason: string, terminalFaultPreimageSha256: string) =>
      finalize("finalize-fault", reason, terminalFaultPreimageSha256),
    async close(): Promise<void> {
      heartbeatWatchdog.close();
      await closeHalfkp81Depth18GuardianChildForTests(child);
    },
  });
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

async function readHeldStableFile(
  filePath: string,
  label: string,
): Promise<Buffer> {
  const beforePath = await fs.promises.lstat(filePath, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const handle = await fs.promises.open(filePath, flags);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.dev !== beforePath.dev ||
      before.ino !== beforePath.ino ||
      before.size !== beforePath.size
    ) {
      throw new Error(`${label} changed during safe open`);
    }
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label} exceeds the safe read bound`);
    }
    const size = Number(before.size);
    const first = Buffer.allocUnsafe(size);
    const second = Buffer.allocUnsafe(size);
    const firstRead = await handle.read(first, 0, size, 0);
    const afterFirst = await handle.stat({ bigint: true });
    const secondRead = await handle.read(second, 0, size, 0);
    const afterSecond = await handle.stat({ bigint: true });
    const afterPath = await fs.promises.lstat(filePath, { bigint: true });
    const signature = (entry: fs.BigIntStats): string =>
      [entry.dev, entry.ino, entry.size, entry.mtimeNs, entry.ctimeNs].join(
        ":",
      );
    if (
      firstRead.bytesRead !== size ||
      secondRead.bytesRead !== size ||
      !first.equals(second) ||
      new Set(
        [before, afterFirst, afterSecond, afterPath].map((entry) =>
          signature(entry),
        ),
      ).size !== 1
    ) {
      throw new Error(`${label} changed during held double read`);
    }
    return first;
  } finally {
    await handle.close();
  }
}

function parseCanonicalJson(
  raw: Buffer,
  label: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !raw.equals(canonicalJsonLine(value))
  ) {
    throw new Error(`${label} is not canonical JSON with one terminal LF`);
  }
  return value as Record<string, unknown>;
}

function peekJsonObjectSchema(raw: Buffer, label: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must contain one plain JSON object`);
  }
  return (value as Record<string, unknown>).schema;
}

function parseExactPinnedJson(
  raw: Buffer,
  expected: Readonly<{ bytes: number; sha256: string }>,
  label: string,
): Record<string, unknown> {
  // Formatting is part of this artifact's pinned identity, not a second
  // canonicalization contract. Authenticate the exact bytes before parsing.
  if (raw.byteLength !== expected.bytes || sha256(raw) !== expected.sha256) {
    throw new Error(`${label} identity differs`);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must contain one plain JSON object`);
  }
  return value as Record<string, unknown>;
}

export function parseExactPinnedHalfkp81Depth18JsonForTests(
  raw: Uint8Array,
  expected: Readonly<{ bytes: number; sha256: string }>,
  label = "pinned JSON",
): Readonly<Record<string, unknown>> {
  return Object.freeze(parseExactPinnedJson(Buffer.from(raw), expected, label));
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareBytewise);
  const expected = [...keys].sort(compareBytewise);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields differ`);
  }
}

function fileIdentity(
  filePath: string,
  raw: Uint8Array,
): Halfkp81Depth18TeacherFileIdentity {
  return { path: filePath, bytes: raw.byteLength, sha256: sha256(raw) };
}

function assertIdentity(
  value: unknown,
  actual: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  label: string,
  schema?: string,
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} identity is missing`);
  }
  const identity = value as Record<string, unknown>;
  exactKeys(
    identity,
    schema === undefined
      ? ["path", "bytes", "sha256"]
      : ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (
    identity.path !== actual.path ||
    identity.bytes !== actual.bytes ||
    identity.sha256 !== actual.sha256 ||
    (schema !== undefined && identity.schema !== schema)
  ) {
    throw new Error(`${label} identity differs`);
  }
}

function teacherSettings(value: unknown): typeof EXPECTED_TEACHER {
  if (canonicalJson(value) !== canonicalJson(EXPECTED_TEACHER)) {
    throw new Error("teacher plan settings differ");
  }
  return EXPECTED_TEACHER;
}

function validateSelectionRows(
  raw: Buffer,
  expectedCount: number,
  expectedRoleCounts: Readonly<Record<Halfkp81Depth18TeacherRole, number>>,
): {
  rows: readonly Readonly<Halfkp81Depth18SelectionRow>[];
  parents: readonly Readonly<FloodgateTrainingParent>[];
  roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>;
} {
  if (!raw.toString("utf8").endsWith("\n")) {
    throw new Error("selection JSONL must end with LF");
  }
  const lines = raw.toString("utf8").split("\n");
  lines.pop();
  if (lines.length !== expectedCount) {
    throw new Error(`selection must contain exactly ${expectedCount} rows`);
  }
  const expectedKeys = [
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
  ] as const;
  const rows: Halfkp81Depth18SelectionRow[] = [];
  const parents: FloodgateTrainingParent[] = [];
  const roles = new Map<string, Halfkp81Depth18TeacherRole>();
  const games = new Set<string>();
  const positions = new Set<string>();
  const roleCounts = { fit: 0, tune: 0, sealed: 0 };
  const phaseSideCounts = {
    opening: { b: 0, w: 0 },
    mid: { b: 0, w: 0 },
    late: { b: 0, w: 0 },
  };
  const roleSideCounts = {
    fit: { b: 0, w: 0 },
    tune: { b: 0, w: 0 },
    sealed: { b: 0, w: 0 },
  };
  const roleOrder = { fit: 0, tune: 1, sealed: 2 };
  const phaseOrder = { opening: 0, mid: 1, late: 2 };
  let previousOrder: readonly (string | number)[] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      throw new Error(`selection line ${index + 1} is invalid JSON`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`selection line ${index + 1} is not an object`);
    }
    const row = parsed as unknown as Halfkp81Depth18SelectionRow;
    exactKeys(
      row as unknown as Record<string, unknown>,
      expectedKeys,
      `selection line ${index + 1}`,
    );
    // Python's canonical encoder preserves 0.0/1.0 while JSON.parse collapses
    // them to JavaScript numbers.  The held bytes are already SHA-bound by the
    // authenticated plan, so semantic validation is authoritative here.
    const role = row.role;
    const phase =
      row.ply >= 12 && row.ply <= 39
        ? "opening"
        : row.ply >= 40 && row.ply <= 79
          ? "mid"
          : row.ply >= 80 && row.ply <= 119
            ? "late"
            : undefined;
    if (
      row.schema !== HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA ||
      !SEMANTIC_ID_RE.test(row.game_id) ||
      row.source_game_id !== row.game_id ||
      !SHA256_RE.test(row.source_game_sha256) ||
      !SEMANTIC_ID_RE.test(row.position_id) ||
      games.has(row.game_id) ||
      positions.has(row.position_id) ||
      (role !== "fit" && role !== "tune" && role !== "sealed") ||
      phase === undefined ||
      row.phase !== phase ||
      !Number.isSafeInteger(row.ply) ||
      !Number.isSafeInteger(row.legal_move_count) ||
      row.legal_move_count < 2 ||
      !Number.isSafeInteger(row.old_depth12_cp) ||
      Math.abs(row.old_depth12_cp) > 1_000 ||
      ![0, 0.5, 1].includes(row.old_outcome) ||
      row.old_depth12_signals_usage !== "selection_only_never_teacher_target" ||
      row.minimum_player_rating !== Math.min(row.sente_rating, row.gote_rating)
    ) {
      throw new Error(
        `selection line ${index + 1} violates the fixed contract`,
      );
    }
    const fields = row.sfen.split(" ");
    if (
      fields.length !== 4 ||
      fields.some((field) => field === "") ||
      (row.side_to_move !== "b" && row.side_to_move !== "w") ||
      fields[1] !== row.side_to_move ||
      Number(fields[3]) !== row.ply + 1 ||
      positionKeyFromSfen(row.sfen) !== row.position_id
    ) {
      throw new Error(
        `selection line ${index + 1} has inconsistent SFEN identity`,
      );
    }
    const { position } = positionFromSfen(row.sfen);
    const legal = rulesCompleteLegalMoves(position).map((entry) => entry.usi);
    if (
      legal.length !== row.legal_move_count ||
      !legal.includes(row.recorded_move) ||
      new Set(legal).size !== legal.length
    ) {
      throw new Error(
        `selection line ${index + 1} legal-move evidence differs`,
      );
    }
    const target =
      row.old_outcome === 1 ? 1_000 : row.old_outcome === 0 ? -1_000 : 0;
    const tieMaterial =
      `{"game_id":${JSON.stringify(row.game_id)}` +
      `,"minimum_player_rating":${row.minimum_player_rating}` +
      `,"old_depth12_cp":${row.old_depth12_cp}` +
      `,"old_outcome":${Number(row.old_outcome).toFixed(1)}` +
      `,"position_id":${JSON.stringify(row.position_id)}}\n`;
    const surprise = Math.abs(target - row.old_depth12_cp);
    const currentOrder: readonly (string | number)[] = [
      roleOrder[role],
      phaseOrder[phase],
      row.side_to_move,
      -surprise,
      -row.minimum_player_rating,
      row.hardness_tiebreak_sha256,
    ];
    const orderDiff =
      previousOrder === undefined
        ? 0
        : currentOrder.findIndex((value, position) => {
            const previous = previousOrder?.[position] as string | number;
            return value !== previous;
          });
    if (orderDiff >= 0 && previousOrder !== undefined) {
      const left = currentOrder[orderDiff];
      const right = previousOrder[orderDiff];
      const comparison =
        typeof left === "string" && typeof right === "string"
          ? compareBytewise(left, right)
          : Number(left) - Number(right);
      if (comparison < 0) {
        throw new Error(`selection line ${index + 1} ordering differs`);
      }
    }
    if (
      row.hardness_cp_outcome_surprise !== surprise ||
      row.hardness_tiebreak_sha256 !== sha256(tieMaterial)
    ) {
      throw new Error(`selection line ${index + 1} hardness binding differs`);
    }
    const parent: FloodgateTrainingParent = {
      schema_version: 1,
      game_id: row.game_id,
      parent_id: parentOccurrenceId(row.game_id, row.ply),
      position_id: row.position_id,
      parent_sfen: row.sfen,
      ply: row.ply,
      played_move: row.recorded_move,
    };
    games.add(row.game_id);
    positions.add(row.position_id);
    roleCounts[role] += 1;
    phaseSideCounts[phase][row.side_to_move] += 1;
    roleSideCounts[role][row.side_to_move] += 1;
    previousOrder = currentOrder;
    roles.set(parent.parent_id, role);
    rows.push(Object.freeze({ ...row }));
    parents.push(Object.freeze(parent));
  }
  if (canonicalJson(roleCounts) !== canonicalJson(expectedRoleCounts)) {
    throw new Error("selection role counts differ");
  }
  if (
    expectedCount === HALFKP81_DEPTH18_TEACHER_PARENT_COUNT &&
    (canonicalJson(phaseSideCounts) !==
      canonicalJson({
        opening: { b: 1_024, w: 1_024 },
        mid: { b: 1_536, w: 1_536 },
        late: { b: 1_536, w: 1_536 },
      }) ||
      canonicalJson(roleSideCounts) !==
        canonicalJson({
          fit: { b: 3_072, w: 3_072 },
          tune: { b: 512, w: 512 },
          sealed: { b: 512, w: 512 },
        }))
  ) {
    throw new Error("selection phase/side or role/side quotas differ");
  }
  return {
    rows: Object.freeze(rows),
    parents: Object.freeze(parents),
    roles,
  };
}

export function validateHalfkp81Depth18SelectionRowsCoreForTests(
  raw: Uint8Array,
  expectedCount: number,
  expectedRoleCounts: Readonly<Record<Halfkp81Depth18TeacherRole, number>>,
): ReturnType<typeof validateSelectionRows> {
  return validateSelectionRows(
    Buffer.from(raw),
    expectedCount,
    expectedRoleCounts,
  );
}

export async function authenticateHalfkp81Depth18TeacherPlan(
  planPath = HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>> {
  const absolutePlanPath = path.resolve(planPath);
  const planRaw = await readHeldStableFile(absolutePlanPath, "teacher plan");
  const peekedPlanSchema = peekJsonObjectSchema(planRaw, "teacher plan");
  if (
    peekedPlanSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1
  ) {
    throw new Error(
      "Yaneura-only v1 family closed after cross-runtime canonical JSON preflight fault; use v1r4",
    );
  }
  if (
    peekedPlanSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2
  ) {
    throw new Error(
      "Yaneura-only v1r2 family closed after missing preflight output directory startup fault; use v1r4",
    );
  }
  if (
    peekedPlanSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3
  ) {
    throw new Error(
      "Yaneura-only v1r3 family closed after the completed 512-parent preflight exposed a validator MultiPV clamp mismatch; use v1r4",
    );
  }
  if (
    peekedPlanSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4
  ) {
    throw new Error(
      "Yaneura-only v1r4 family closed after a 600-second aggregate parent timeout on pathological parent #2702; use v1r5",
    );
  }
  if (
    peekedPlanSchema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5
  ) {
    throw new Error(
      "Yaneura-only v1r5 family closed after a resetForParent timeout; use v1r6",
    );
  }
  const plan = parseCanonicalJson(planRaw, "teacher plan");
  const boundedStableV3 =
    plan.schema === HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA;
  const boundedStableV3R2 =
    plan.schema === HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2;
  const boundedStableV3R3 =
    plan.schema === HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3;
  if (boundedStableV3) {
    throw new Error(
      "bounded stable v3 family closed after startup fault; use v3r3",
    );
  }
  if (boundedStableV3R2) {
    throw new Error(
      "bounded stable v3r2 family closed after worker source transfer startup fault; use v3r3",
    );
  }
  if (boundedStableV3R3) {
    throw new Error(
      "bounded stable v3r3 family closed after worker replacement startup fault; use Yaneura-only v1r4",
    );
  }
  const yaneuraOnlyV1R6 =
    plan.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6;
  const yaneuraOnlyV1R9 =
    plan.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9;
  const yaneuraOnlyV1R11 =
    plan.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11;
  const yaneuraOnlyV1R9Protocol = yaneuraOnlyV1R9 || yaneuraOnlyV1R11;
  const yaneuraOnly = yaneuraOnlyV1R6 || yaneuraOnlyV1R9Protocol;
  const boundedStable = boundedStableV3R3;
  exactKeys(
    plan,
    yaneuraOnly
      ? yaneuraOnlyV1R11
        ? [
            "authority",
            "downstream_gates",
            "engine",
            "escalation_budgets",
            "family",
            "large_hash_evidence",
            "live_baseline",
            "outputs",
            "portable_home_path_binding",
            "power_continuity",
            "preformal_authority",
            "predecessor_failures",
            "preregistration",
            "required_post_formal_gate",
            "required_preformal_gates",
            "reused_selection",
            "run_identity",
            "schema",
            "selection_evidence",
            "selection_manifest",
            "selection_roles",
            "source_revision",
            "source_revision_policy",
            "status",
            "teacher",
            "training",
          ]
        : yaneuraOnlyV1R9
          ? [
              "authority",
              "downstream_gates",
              "engine",
              "escalation_budgets",
              "family",
              "large_hash_evidence",
              "outputs",
              "predecessor_failures",
              "preregistration",
              "required_preformal_gates",
              "reused_selection",
              "schema",
              "selection_evidence",
              "selection_manifest",
              "selection_roles",
              "source_revision",
              "source_revision_policy",
              "status",
              "teacher",
              "training",
            ]
          : [
              "authority",
              "downstream_gates",
              "engine",
              "outputs",
              "predecessor_v1r5",
              "preregistration",
              "reused_selection",
              "schema",
              "selection_evidence",
              "selection_manifest",
              "selection_roles",
              "source_revision",
              "status",
              "teacher",
              "technical_recovery",
              "training",
            ]
      : boundedStable
        ? [
            "schema",
            "status",
            "source_revision",
            "preregistration",
            "predecessor_v2",
            "predecessor_v3",
            "predecessor_v3r2",
            "diagnostic_receipt",
            "selection_manifest",
            "selection_evidence",
            "selection_roles",
            "engine",
            "teacher",
            "outputs",
            "authority",
          ]
        : [
            "schema",
            "status",
            "source_revision",
            "preregistration",
            "technical_recovery",
            "selection_manifest",
            "selection_evidence",
            "selection_roles",
            "engine",
            "teacher",
            "outputs",
            "authority",
          ],
    "teacher plan",
  );
  let teacher: Readonly<Record<string, unknown>>;
  let familyExpectedOutputs: Readonly<Record<string, unknown>> | undefined;
  if (yaneuraOnly) {
    const repositoryRoot = path.resolve(__dirname, "..");
    const v1r10Recovery =
      yaneuraOnlyV1R9 &&
      canonicalJson(plan.preregistration) ===
        canonicalJson(EXPECTED_YANEURA_ONLY_V1R10_PREREGISTRATION);
    const expectedPreregistration = yaneuraOnlyV1R11
      ? EXPECTED_YANEURA_ONLY_V1R11_PREREGISTRATION
      : v1r10Recovery
        ? EXPECTED_YANEURA_ONLY_V1R10_PREREGISTRATION
        : yaneuraOnlyV1R9
          ? EXPECTED_YANEURA_ONLY_V1R9_PREREGISTRATION
          : EXPECTED_YANEURA_ONLY_V1R6_PREREGISTRATION;
    const yaneuraOnlyLabel = yaneuraOnlyV1R11
      ? "v1r11"
      : v1r10Recovery
        ? "v1r10"
        : yaneuraOnlyV1R9
          ? "v1r9"
          : "v1r6";
    const preregistrationPath = path.join(
      repositoryRoot,
      expectedPreregistration.path,
    );
    const preregistrationRaw = await readHeldStableFile(
      preregistrationPath,
      `Yaneura-only ${yaneuraOnlyLabel} preregistration`,
    );
    const preregistration = parseExactPinnedJson(
      preregistrationRaw,
      expectedPreregistration,
      `Yaneura-only ${yaneuraOnlyLabel} preregistration`,
    );
    const sourceRevisionPolicy = preregistration.source_revision_policy as
      Record<string, unknown> | undefined;
    if (
      preregistration.schema !== expectedPreregistration.schema ||
      canonicalJson(plan.preregistration) !==
        canonicalJson(expectedPreregistration) ||
      (!yaneuraOnlyV1R9Protocol &&
        canonicalJson(plan.predecessor_v1r5) !==
          canonicalJson(preregistration.predecessor_v1r5)) ||
      (yaneuraOnlyV1R9Protocol &&
        canonicalJson(plan.predecessor_failures) !==
          canonicalJson(preregistration.predecessor_failures)) ||
      canonicalJson(plan.reused_selection) !==
        canonicalJson(preregistration.reused_selection) ||
      (!yaneuraOnlyV1R9Protocol &&
        canonicalJson(plan.technical_recovery) !==
          canonicalJson(preregistration.technical_recovery)) ||
      canonicalJson(plan.downstream_gates) !==
        canonicalJson(preregistration.downstream_gates) ||
      (yaneuraOnlyV1R9Protocol &&
        (canonicalJson(plan.escalation_budgets) !==
          canonicalJson(preregistration.escalation_budgets) ||
          canonicalJson(plan.family) !==
            canonicalJson(preregistration.family) ||
          canonicalJson(plan.large_hash_evidence) !==
            canonicalJson(preregistration.large_hash_evidence) ||
          canonicalJson(plan.required_preformal_gates) !==
            canonicalJson(preregistration.required_preformal_gates) ||
          canonicalJson(plan.source_revision_policy) !==
            canonicalJson(preregistration.source_revision_policy))) ||
      (yaneuraOnlyV1R11 &&
        (canonicalJson(plan.power_continuity) !==
          canonicalJson(preregistration.power_continuity) ||
          canonicalJson(plan.live_baseline) !==
            canonicalJson(preregistration.live_baseline) ||
          canonicalJson(plan.portable_home_path_binding) !==
            canonicalJson(preregistration.portable_home_path_binding) ||
          canonicalJson(plan.preformal_authority) !==
            canonicalJson(preregistration.preformal_authority) ||
          canonicalJson(plan.required_post_formal_gate) !==
            canonicalJson(preregistration.required_post_formal_gate) ||
          canonicalJson(plan.run_identity) !==
            canonicalJson(preregistration.run_identity))) ||
      canonicalJson(plan.teacher) !== canonicalJson(preregistration.teacher) ||
      canonicalJson(plan.training) !==
        canonicalJson(preregistration.training) ||
      canonicalJson(plan.selection_roles) !==
        canonicalJson(preregistration.selection_roles) ||
      (!yaneuraOnlyV1R9Protocol &&
        plan.source_revision ===
          sourceRevisionPolicy?.forbidden_failed_v1r5_revision) ||
      canonicalJson(plan.authority) !==
        canonicalJson({
          may_execute_teacher: true,
          may_train: false,
          may_play_formal_games: false,
          may_write_live_weights: false,
        })
    ) {
      throw new Error(
        `Yaneura-only ${yaneuraOnlyLabel} fixed authority differs`,
      );
    }
    const stableWasm = (
      (plan.teacher as Record<string, unknown>).candidate_policy as
        Record<string, unknown> | undefined
    )?.stable_wasm;
    const ledgerCandidateGeneration = (plan.teacher as Record<string, unknown>)
      .ledger_candidate_generation;
    if (
      canonicalJson(stableWasm) !==
        canonicalJson({
          allowed: false,
          calls_per_parent: 0,
          candidate_rows: 0,
          worker_processes: 0,
        }) ||
      (!yaneuraOnlyV1R9Protocol &&
        canonicalJson(ledgerCandidateGeneration) !==
          canonicalJson(HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1))
    ) {
      throw new Error(
        `Yaneura-only ${yaneuraOnlyLabel} stable-WASM absence contract differs`,
      );
    }
    const outputNamespace = preregistration.output_namespace;
    if (
      !outputNamespace ||
      typeof outputNamespace !== "object" ||
      Array.isArray(outputNamespace)
    ) {
      throw new Error(
        `Yaneura-only ${yaneuraOnlyLabel} output namespace is missing`,
      );
    }
    const { collision_policy: collisionPolicy, ...portableExpectedOutputs } =
      outputNamespace as Record<string, unknown>;
    if (collisionPolicy !== "create-only-fail-if-any-target-exists") {
      throw new Error(
        `Yaneura-only ${yaneuraOnlyLabel} collision policy differs`,
      );
    }
    const expectedOutputs = yaneuraOnlyV1R11
      ? Object.fromEntries(
          Object.entries(portableExpectedOutputs).map(([key, value]) => [
            key,
            expandHalfkp81Depth18V1R11HomePathForTests(
              String(value),
              currentCanonicalPasswdHome(),
              process.env.HOME,
            ),
          ]),
        )
      : portableExpectedOutputs;
    familyExpectedOutputs = Object.freeze(expectedOutputs);
    teacher = Object.freeze({
      ...(plan.teacher as Readonly<Record<string, unknown>>),
    });
  } else if (boundedStable) {
    const expectedPreregistration =
      EXPECTED_BOUNDED_STABLE_V3R3_PREREGISTRATION;
    const preregistrationLabel = "bounded stable v3r3 preregistration";
    const repositoryRoot = path.resolve(__dirname, "..");
    const preregistrationPath = path.join(
      repositoryRoot,
      expectedPreregistration.path,
    );
    const preregistrationRaw = await readHeldStableFile(
      preregistrationPath,
      preregistrationLabel,
    );
    const preregistration = parseExactPinnedJson(
      preregistrationRaw,
      expectedPreregistration,
      preregistrationLabel,
    );
    const strengthPath = path.join(
      repositoryRoot,
      EXPECTED_BOUNDED_STABLE_PREREGISTRATION.path,
    );
    const strengthRaw = await readHeldStableFile(
      strengthPath,
      "bounded stable v3 strength contract",
    );
    const strengthPreregistration = parseExactPinnedJson(
      strengthRaw,
      EXPECTED_BOUNDED_STABLE_PREREGISTRATION,
      "bounded stable v3 strength contract",
    );
    const v3r2Path = path.join(
      repositoryRoot,
      EXPECTED_BOUNDED_STABLE_V3R2_PREREGISTRATION.path,
    );
    const v3r2Raw = await readHeldStableFile(
      v3r2Path,
      "bounded stable v3r2 preregistration",
    );
    const v3r2Preregistration = parseExactPinnedJson(
      v3r2Raw,
      EXPECTED_BOUNDED_STABLE_V3R2_PREREGISTRATION,
      "bounded stable v3r2 preregistration",
    );
    const diagnosticPath = path.join(
      repositoryRoot,
      EXPECTED_BOUNDED_STABLE_V3R3_DIAGNOSTIC_RECEIPT.path,
    );
    const diagnosticRaw = await readHeldStableFile(
      diagnosticPath,
      "bounded stable v3r3 diagnostic receipt",
    );
    const diagnosticReceipt = parseExactPinnedJson(
      diagnosticRaw,
      EXPECTED_BOUNDED_STABLE_V3R3_DIAGNOSTIC_RECEIPT,
      "bounded stable v3r3 diagnostic receipt",
    );
    if (
      preregistration.schema !== expectedPreregistration.schema ||
      diagnosticReceipt.schema !==
        EXPECTED_BOUNDED_STABLE_V3R3_DIAGNOSTIC_RECEIPT.schema ||
      canonicalJson(plan.preregistration) !==
        canonicalJson(expectedPreregistration) ||
      canonicalJson(plan.diagnostic_receipt) !==
        canonicalJson(EXPECTED_BOUNDED_STABLE_V3R3_DIAGNOSTIC_RECEIPT) ||
      canonicalJson(plan.predecessor_v2) !==
        canonicalJson(strengthPreregistration.predecessor_v2) ||
      canonicalJson(plan.predecessor_v3) !==
        canonicalJson(v3r2Preregistration.failed_v3) ||
      canonicalJson(plan.predecessor_v3r2) !==
        canonicalJson(preregistration.failed_v3r2) ||
      canonicalJson(plan.teacher) !==
        canonicalJson(strengthPreregistration.teacher) ||
      plan.source_revision ===
        (
          preregistration.source_revision_policy as
            Record<string, unknown> | undefined
        )?.forbidden_failed_v3r2_revision ||
      canonicalJson(plan.authority) !==
        canonicalJson({
          may_execute_teacher: true,
          may_train: false,
          may_play_formal_games: false,
          may_write_live_weights: false,
        })
    ) {
      throw new Error("bounded stable v3 fixed authority differs");
    }
    const outputNamespace = preregistration.output_namespace;
    if (
      !outputNamespace ||
      typeof outputNamespace !== "object" ||
      Array.isArray(outputNamespace)
    ) {
      throw new Error("bounded stable v3 output namespace is missing");
    }
    const { collision_policy: collisionPolicy, ...expectedOutputs } =
      outputNamespace as Record<string, unknown>;
    if (collisionPolicy !== "create-only-fail-if-any-target-exists") {
      throw new Error("bounded stable v3 collision policy differs");
    }
    familyExpectedOutputs = Object.freeze(expectedOutputs);
    teacher = Object.freeze({
      ...(plan.teacher as Readonly<Record<string, unknown>>),
    });
  } else {
    teacher = teacherSettings(plan.teacher);
  }
  if (
    (!boundedStable &&
      !yaneuraOnly &&
      plan.schema !== HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA) ||
    plan.status !== "sealed-not-executed" ||
    typeof plan.source_revision !== "string" ||
    !REVISION_RE.test(plan.source_revision) ||
    plan.source_revision === "0".repeat(40) ||
    canonicalJson(plan.selection_roles) !==
      canonicalJson(HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS) ||
    (!boundedStable &&
      !yaneuraOnly &&
      (canonicalJson(plan.preregistration) !==
        canonicalJson(EXPECTED_PREREGISTRATION) ||
        canonicalJson(plan.technical_recovery) !==
          canonicalJson(EXPECTED_TECHNICAL_RECOVERY) ||
        canonicalJson(plan.authority) !==
          canonicalJson({
            may_execute_teacher: true,
            may_train: false,
            may_play_formal_games: false,
            may_write_live_weights: false,
          })))
  ) {
    throw new Error("teacher plan authority or fixed accounting differs");
  }
  const engine = plan.engine as Record<string, unknown>;
  exactKeys(
    engine,
    [
      "binary",
      "eval_file",
      ...(yaneuraOnlyV1R11 ? ["receipt"] : []),
      "eval_tree_sha256",
      "source_revision",
      "id",
    ],
    "teacher engine",
  );
  if (
    canonicalJson(engine.binary) !== canonicalJson(EXPECTED_ENGINE_BINARY) ||
    canonicalJson(engine.eval_file) !== canonicalJson(EXPECTED_ENGINE_EVAL) ||
    engine.eval_tree_sha256 !== EXPECTED_EVAL_TREE_SHA256 ||
    engine.source_revision !== EXPECTED_ENGINE_SOURCE_REVISION ||
    engine.id !== EXPECTED_ENGINE_ID
  ) {
    throw new Error("teacher engine binding differs");
  }
  if (yaneuraOnlyV1R11) {
    const expectedReceipt = Object.freeze({
      path: path.join(
        path.resolve(__dirname, ".."),
        HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_RELATIVE_PATH,
      ),
      bytes: HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_BYTES,
      sha256: HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_SHA256,
      schema: "shogi-teacher-engine-receipt-v1",
    });
    if (canonicalJson(engine.receipt) !== canonicalJson(expectedReceipt)) {
      throw new Error("v1r11 teacher engine receipt binding differs");
    }
  }
  const outputs = plan.outputs as Record<string, unknown>;
  const expectedOutputKeys = yaneuraOnlyV1R11
    ? HALFKP81_DEPTH18_V1R11_EXPECTED_PLAN_OUTPUT_KEYS
    : EXPECTED_PLAN_OUTPUT_KEYS;
  exactKeys(outputs, expectedOutputKeys, "teacher outputs");
  const directory = outputs.directory;
  if (
    typeof directory !== "string" ||
    !path.isAbsolute(directory) ||
    path.normalize(directory) !== directory
  ) {
    throw new Error("teacher output directory is not canonical absolute");
  }
  const capturedOutputs: Record<string, string> = {};
  for (const key of expectedOutputKeys) {
    const output = outputs[key];
    if (
      typeof output !== "string" ||
      !path.isAbsolute(output) ||
      path.normalize(output) !== output ||
      (key !== "directory" && path.dirname(output) !== directory)
    ) {
      throw new Error(`teacher output ${key} is not a canonical child`);
    }
    capturedOutputs[key] = output;
  }
  if (
    new Set(expectedOutputKeys.slice(1).map((key) => capturedOutputs[key]))
      .size !==
    expectedOutputKeys.length - 1
  ) {
    throw new Error("teacher output paths are not distinct");
  }
  if (
    familyExpectedOutputs !== undefined &&
    canonicalJson(capturedOutputs) !== canonicalJson(familyExpectedOutputs)
  ) {
    throw new Error("family output namespace differs");
  }
  if (capturedOutputs.plan_json !== absolutePlanPath) {
    throw new Error("teacher plan path differs from its sealed output path");
  }
  const evidence = plan.selection_evidence as Record<string, unknown>;
  if (!evidence || typeof evidence !== "object") {
    throw new Error("teacher plan selection evidence is missing");
  }
  exactKeys(
    evidence,
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
    "selection evidence",
  );
  if (
    evidence.schema !==
      "shogi-halfkp81-depth18-authenticated-selection-evidence-v1" ||
    evidence.status !==
      "authenticated-selection-complete-teacher-plan-eligible" ||
    evidence.source_revision !== plan.source_revision ||
    canonicalJson(evidence.phase_name_map) !==
      canonicalJson({
        "opening-ply12-39": "opening",
        "midgame-ply40-79": "mid",
        "late-ply80-119": "late",
      })
  ) {
    throw new Error("selection evidence authority differs");
  }
  const selectionDeclared = evidence.selection_jsonl as Record<string, unknown>;
  const manifestDeclared = evidence.selection_manifest as Record<
    string,
    unknown
  >;
  if (
    !selectionDeclared ||
    !manifestDeclared ||
    typeof selectionDeclared.path !== "string" ||
    typeof manifestDeclared.path !== "string"
  ) {
    throw new Error("teacher plan selection identities are missing");
  }
  const selectionRaw = await readHeldStableFile(
    selectionDeclared.path,
    "selection JSONL",
  );
  const selectionActual = fileIdentity(selectionDeclared.path, selectionRaw);
  exactKeys(
    selectionDeclared,
    [
      "path",
      "bytes",
      "sha256",
      "held_read_only_descriptor",
      "stable_double_read",
      "rows",
      "schema",
    ],
    "selection JSONL evidence",
  );
  if (
    selectionDeclared.path !== selectionActual.path ||
    selectionDeclared.bytes !== selectionActual.bytes ||
    selectionDeclared.sha256 !== selectionActual.sha256 ||
    selectionDeclared.held_read_only_descriptor !== true ||
    selectionDeclared.stable_double_read !== true ||
    selectionDeclared.schema !== HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA ||
    selectionDeclared.rows !== HALFKP81_DEPTH18_TEACHER_PARENT_COUNT
  ) {
    throw new Error("selection JSONL row count differs");
  }
  const selection = validateSelectionRows(
    selectionRaw,
    HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
    HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
  );
  const manifestRaw = await readHeldStableFile(
    manifestDeclared.path,
    "selection manifest",
  );
  const manifestActual = fileIdentity(manifestDeclared.path, manifestRaw);
  const manifestSchema = manifestDeclared.schema;
  exactKeys(
    manifestDeclared,
    [
      "path",
      "bytes",
      "sha256",
      "held_read_only_descriptor",
      "stable_double_read",
      "schema",
    ],
    "selection manifest evidence",
  );
  if (
    manifestSchema !== HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA ||
    manifestDeclared.path !== manifestActual.path ||
    manifestDeclared.bytes !== manifestActual.bytes ||
    manifestDeclared.sha256 !== manifestActual.sha256 ||
    manifestDeclared.held_read_only_descriptor !== true ||
    manifestDeclared.stable_double_read !== true
  ) {
    throw new Error("selection manifest evidence differs");
  }
  const manifest = parseCanonicalJson(manifestRaw, "selection manifest");
  const manifestOutput = manifest.output as Record<string, unknown>;
  if (
    !manifestOutput ||
    manifestOutput.path !== selectionActual.path ||
    manifestOutput.bytes !== selectionActual.bytes ||
    manifestOutput.sha256 !== selectionActual.sha256 ||
    manifestOutput.rows !== HALFKP81_DEPTH18_TEACHER_PARENT_COUNT
  ) {
    throw new Error("selection manifest output binding differs");
  }
  assertIdentity(
    plan.selection_manifest,
    manifestActual,
    "plan selection manifest",
    manifestSchema,
  );
  const verification = evidence.verification;
  if (
    canonicalJson(verification) !==
    canonicalJson({
      held_descriptor_double_read: true,
      canonical_8192_rows: true,
      phase_side_quotas: true,
      role_side_quotas: true,
      one_game_one_position: true,
      cross_role_game_overlap_zero: true,
      source_overlap_legal_bindings: true,
    })
  ) {
    throw new Error("selection evidence verification differs");
  }
  return Object.freeze({
    plan: Object.freeze({ ...plan }),
    planIdentity: Object.freeze({
      ...fileIdentity(absolutePlanPath, planRaw),
      schema: boundedStableV3R3
        ? HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3
        : boundedStableV3R2
          ? HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2
          : boundedStableV3
            ? HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA
            : yaneuraOnlyV1R11
              ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
              : yaneuraOnlyV1R9
                ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
                : yaneuraOnly
                  ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
                  : HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA,
    }),
    sourceRevision: plan.source_revision,
    selectionIdentity: Object.freeze({
      ...selectionActual,
      rows: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
    }),
    selectionManifestIdentity: Object.freeze({
      ...manifestActual,
      schema: manifestSchema,
    }),
    selectionRows: selection.rows,
    parents: selection.parents,
    roles: selection.roles,
    outputs: Object.freeze(capturedOutputs),
    engine: Object.freeze(
      engine as unknown as Halfkp81Depth18AuthenticatedTeacherPlan["engine"],
    ),
    teacher,
  });
}

function repositoryGitText(
  repositoryRoot: string,
  args: readonly string[],
): string {
  return execFileSync(
    FLOODGATE_GIT_EXECUTABLE,
    [...FLOODGATE_GIT_COMMAND_PREFIX, ...args],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: floodgateGitEnvironment(),
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

/**
 * Create-only publication of the sealed v1r5 runtime plan.
 *
 * This is intentionally usable only after the implementation and tracked
 * preregistration are merged on a clean local main. It reuses only v1r4's
 * authenticated selection evidence, never its partial teacher rows.
 */
export async function publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R5(): Promise<
  Readonly<Halfkp81Depth18TeacherFileIdentity>
> {
  throw new Error(
    "Yaneura-only v1r5 runtime-plan publisher is closed after the formal resetForParent timeout; use v1r6",
  );
  const repositoryRoot = path.resolve(__dirname, "..");
  const capturedRevision =
    await captureFloodgateGitExactCleanRevision(repositoryRoot);
  const branch = repositoryGitText(repositoryRoot, [
    "branch",
    "--show-current",
  ]);
  const sourceRevision = repositoryGitText(repositoryRoot, [
    "rev-parse",
    "HEAD",
  ]);
  const mainRevision = repositoryGitText(repositoryRoot, ["rev-parse", "main"]);
  const status = repositoryGitText(repositoryRoot, ["status", "--porcelain"]);
  if (
    branch !== "main" ||
    sourceRevision !== mainRevision ||
    sourceRevision !== capturedRevision ||
    status !== "" ||
    !REVISION_RE.test(sourceRevision) ||
    sourceRevision === "28d113dbe6bff8ec7d21beb823058c8aae6c0bf4"
  ) {
    throw new Error(
      "v1r5 plan publication requires clean merged local main at a new source revision",
    );
  }
  const preregistrationPath = path.join(
    repositoryRoot,
    EXPECTED_YANEURA_ONLY_V1R5_PREREGISTRATION.path,
  );
  const preregistrationRaw = await readHeldStableFile(
    preregistrationPath,
    "v1r5 tracked preregistration",
  );
  const preregistration = parseExactPinnedJson(
    preregistrationRaw,
    EXPECTED_YANEURA_ONLY_V1R5_PREREGISTRATION,
    "v1r5 tracked preregistration",
  );
  const predecessor = preregistration.predecessor_v1r4 as Record<
    string,
    unknown
  >;
  for (const [key, label] of [
    ["teacher_plan", "v1r4 teacher plan"],
    ["work_ledger", "v1r4 work ledger"],
    ["terminal_fault", "v1r4 terminal fault"],
  ] as const) {
    const declared = predecessor[key] as Halfkp81Depth18TeacherFileIdentity;
    await authenticateFixedFile(declared, label);
  }
  const predecessorPlanIdentity =
    predecessor.teacher_plan as Halfkp81Depth18TeacherFileIdentity;
  const predecessorPlanRaw = await readHeldStableFile(
    predecessorPlanIdentity.path,
    "v1r4 predecessor teacher plan",
  );
  const predecessorPlan = parseCanonicalJson(
    predecessorPlanRaw,
    "v1r4 predecessor teacher plan",
  );
  const selectionEvidence = {
    ...(predecessorPlan.selection_evidence as Record<string, unknown>),
    source_revision: sourceRevision,
  };
  const outputNamespace = preregistration.output_namespace as Record<
    string,
    unknown
  >;
  const { collision_policy: collisionPolicy, ...outputs } = outputNamespace;
  if (
    collisionPolicy !== "create-only-fail-if-any-target-exists" ||
    outputs.plan_json !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH ||
    outputs.directory !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY
  ) {
    throw new Error("v1r5 output namespace differs before publication");
  }
  try {
    await fs.promises.lstat(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY,
    );
    throw new Error("v1r5 formal output directory already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const plan = Object.freeze({
    authority: {
      may_execute_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
    downstream_gates: preregistration.downstream_gates,
    engine: predecessorPlan.engine,
    outputs,
    pathological_preflight_contract:
      preregistration.pathological_preflight_contract,
    predecessor_v1r4: predecessor,
    preregistration: EXPECTED_YANEURA_ONLY_V1R5_PREREGISTRATION,
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5,
    selection_evidence: selectionEvidence,
    selection_manifest: predecessorPlan.selection_manifest,
    selection_roles: preregistration.selection_roles,
    source_revision: sourceRevision,
    status: "sealed-not-executed",
    teacher: preregistration.teacher,
    technical_recovery: preregistration.technical_recovery,
    training: preregistration.training,
  });
  const planIdentity = await publishCreateOnly(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH,
    canonicalJsonLine(plan),
  );
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH,
  );
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 ||
    authenticated.planIdentity.sha256 !== planIdentity.sha256
  ) {
    throw new Error("published v1r5 plan failed self-authentication");
  }
  return Object.freeze({
    ...planIdentity,
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5,
  });
}

/** Create-only publication of the sealed v1r6 runtime plan on clean main. */
export async function publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R6(): Promise<
  Readonly<Halfkp81Depth18TeacherFileIdentity>
> {
  const repositoryRoot = path.resolve(__dirname, "..");
  const capturedRevision =
    await captureFloodgateGitExactCleanRevision(repositoryRoot);
  const branch = repositoryGitText(repositoryRoot, [
    "branch",
    "--show-current",
  ]);
  const sourceRevision = repositoryGitText(repositoryRoot, [
    "rev-parse",
    "HEAD",
  ]);
  const mainRevision = repositoryGitText(repositoryRoot, ["rev-parse", "main"]);
  const status = repositoryGitText(repositoryRoot, ["status", "--porcelain"]);
  if (
    branch !== "main" ||
    sourceRevision !== mainRevision ||
    sourceRevision !== capturedRevision ||
    status !== "" ||
    !REVISION_RE.test(sourceRevision) ||
    sourceRevision === "3b3f85cc7ead5eeda637a76a63d07b98e10aa1c4"
  ) {
    throw new Error(
      "v1r6 plan publication requires clean merged local main at a new source revision",
    );
  }
  const preregistrationPath = path.join(
    repositoryRoot,
    EXPECTED_YANEURA_ONLY_V1R6_PREREGISTRATION.path,
  );
  const preregistrationRaw = await readHeldStableFile(
    preregistrationPath,
    "v1r6 tracked preregistration",
  );
  const preregistration = parseExactPinnedJson(
    preregistrationRaw,
    EXPECTED_YANEURA_ONLY_V1R6_PREREGISTRATION,
    "v1r6 tracked preregistration",
  );
  const predecessor = preregistration.predecessor_v1r5 as Record<
    string,
    unknown
  >;
  for (const [key, label] of [
    ["teacher_plan", "v1r5 teacher plan"],
    ["terminal_fault", "v1r5 terminal fault"],
  ] as const) {
    await authenticateFixedFile(
      predecessor[key] as Halfkp81Depth18TeacherFileIdentity,
      label,
    );
  }
  const predecessorPlanIdentity =
    predecessor.teacher_plan as Halfkp81Depth18TeacherFileIdentity;
  const predecessorPlanRaw = await readHeldStableFile(
    predecessorPlanIdentity.path,
    "v1r5 predecessor teacher plan",
  );
  const predecessorPlan = parseCanonicalJson(
    predecessorPlanRaw,
    "v1r5 predecessor teacher plan",
  );
  const priorSelectionEvidence = predecessorPlan.selection_evidence as Record<
    string,
    unknown
  >;
  const reusedSelection = preregistration.reused_selection as Record<
    string,
    unknown
  >;
  const priorSelectionJsonl = priorSelectionEvidence.selection_jsonl as Record<
    string,
    unknown
  >;
  const priorSelectionManifest =
    priorSelectionEvidence.selection_manifest as Record<string, unknown>;
  if (
    predecessorPlan.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5 ||
    canonicalJson({
      path: priorSelectionJsonl.path,
      bytes: priorSelectionJsonl.bytes,
      sha256: priorSelectionJsonl.sha256,
      rows: priorSelectionJsonl.rows,
      schema: priorSelectionJsonl.schema,
    }) !== canonicalJson(reusedSelection.jsonl) ||
    canonicalJson({
      path: priorSelectionManifest.path,
      bytes: priorSelectionManifest.bytes,
      sha256: priorSelectionManifest.sha256,
      schema: priorSelectionManifest.schema,
    }) !== canonicalJson(reusedSelection.manifest)
  ) {
    throw new Error("v1r6 predecessor selection binding differs");
  }
  const selectionEvidence = {
    ...priorSelectionEvidence,
    source_revision: sourceRevision,
  };
  const outputNamespace = preregistration.output_namespace as Record<
    string,
    unknown
  >;
  const { collision_policy: collisionPolicy, ...outputs } = outputNamespace;
  if (
    collisionPolicy !== "create-only-fail-if-any-target-exists" ||
    outputs.plan_json !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_PLAN_PATH ||
    outputs.directory !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_DIRECTORY
  ) {
    throw new Error("v1r6 output namespace differs before publication");
  }
  try {
    await fs.promises.lstat(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_DIRECTORY,
    );
    throw new Error("v1r6 formal output directory already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const plan = Object.freeze({
    authority: {
      may_execute_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
    downstream_gates: preregistration.downstream_gates,
    engine: predecessorPlan.engine,
    outputs,
    predecessor_v1r5: predecessor,
    preregistration: EXPECTED_YANEURA_ONLY_V1R6_PREREGISTRATION,
    reused_selection: preregistration.reused_selection,
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6,
    selection_evidence: selectionEvidence,
    selection_manifest: predecessorPlan.selection_manifest,
    selection_roles: preregistration.selection_roles,
    source_revision: sourceRevision,
    status: "sealed-not-executed",
    teacher: preregistration.teacher,
    technical_recovery: preregistration.technical_recovery,
    training: preregistration.training,
  });
  const planIdentity = await publishCreateOnly(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_PLAN_PATH,
    canonicalJsonLine(plan),
  );
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_PLAN_PATH,
  );
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6 ||
    authenticated.planIdentity.sha256 !== planIdentity.sha256
  ) {
    throw new Error("published v1r6 plan failed self-authentication");
  }
  return Object.freeze({
    ...planIdentity,
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6,
  });
}

/** Shared create-only publication for the sealed Hash8192-fallback protocol. */
async function publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R9Protocol(
  options: Readonly<{
    familyLabel: "v1r9" | "v1r10" | "v1r11";
    preregistration: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    outputDirectory: string;
    outputPlanPath: string;
  }>,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const repositoryRoot = path.resolve(__dirname, "..");
  const capturedRevision =
    await captureFloodgateGitExactCleanRevision(repositoryRoot);
  const branch = repositoryGitText(repositoryRoot, [
    "branch",
    "--show-current",
  ]);
  const sourceRevision = repositoryGitText(repositoryRoot, [
    "rev-parse",
    "HEAD",
  ]);
  const mainRevision = repositoryGitText(repositoryRoot, ["rev-parse", "main"]);
  const status = repositoryGitText(repositoryRoot, ["status", "--porcelain"]);
  const stableV1R11PrHead =
    options.familyLabel === "v1r11" &&
    branch.startsWith("codex/") &&
    sourceRevision === capturedRevision &&
    status === "";
  if (
    (!stableV1R11PrHead &&
      (branch !== "main" ||
        sourceRevision !== mainRevision ||
        sourceRevision !== capturedRevision ||
        status !== "")) ||
    !REVISION_RE.test(sourceRevision)
  ) {
    throw new Error(
      `${options.familyLabel} plan publication requires clean merged local main`,
    );
  }
  const preregistrationRaw = await readHeldStableFile(
    path.join(repositoryRoot, options.preregistration.path),
    `${options.familyLabel} tracked preregistration`,
  );
  const preregistration = parseExactPinnedJson(
    preregistrationRaw,
    options.preregistration,
    `${options.familyLabel} tracked preregistration`,
  );
  const predecessorPlanPath =
    "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r6/teacher-plan.json";
  const predecessorRaw = await readHeldStableFile(
    predecessorPlanPath,
    "v1r6 predecessor teacher plan",
  );
  const predecessorIdentity = fileIdentity(predecessorPlanPath, predecessorRaw);
  const v1r6Failure = (
    preregistration.predecessor_failures as Record<string, unknown>
  ).v1r6 as Record<string, unknown>;
  if (
    predecessorIdentity.sha256 !== v1r6Failure.teacher_plan_sha256 ||
    predecessorIdentity.sha256 !==
      "deb8097134c1ec166b1c1e0729ba495d34c007ee8084745ba646f07ae25f5725"
  ) {
    throw new Error(
      `${options.familyLabel} predecessor v1r6 teacher plan identity differs`,
    );
  }
  const predecessor = parseCanonicalJson(
    predecessorRaw,
    "v1r6 predecessor teacher plan",
  );
  const predecessorFault = await authenticateFixedFile(
    {
      path: "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r6/teacher-terminal-fault.json",
      bytes: 1_030,
      sha256:
        "99677994fec8fd1b941d0546bef92347255914819b7112f27613e6efc5d609cf",
    },
    "v1r6 terminal fault",
  );
  const predecessorWork = await authenticateFixedFile(
    {
      path: "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r6/teacher-work.jsonl",
      bytes: 48_118_137,
      sha256:
        "ee66fd5a2cab03e8318564923af82ad723d2dccd1379685324abc87d66fb1fa5",
    },
    "v1r6 terminal work ledger",
  );
  const fault = parseCanonicalJson(
    await readHeldStableFile(
      predecessorFault.path,
      "v1r6 terminal fault recount",
    ),
    "v1r6 terminal fault recount",
  );
  const workRaw = await readHeldStableFile(
    predecessorWork.path,
    "v1r6 terminal work ledger recount",
  );
  const workLines = workRaw.toString("utf8").trimEnd().split("\n");
  let completedTeacherRows = 0;
  for (const [index, line] of workLines.slice(1).entries()) {
    const value = JSON.parse(line) as Record<string, unknown>;
    const teacherEntry = value.teacher_entry as
      Record<string, unknown> | undefined;
    if (!teacherEntry || !Array.isArray(teacherEntry.records)) {
      throw new Error(`v1r6 terminal work line ${index + 2} is incomplete`);
    }
    completedTeacherRows += teacherEntry.records.length;
  }
  if (
    workLines.length !== 3_263 ||
    completedTeacherRows !== 38_393 ||
    fault.completed_parents !== 3_262 ||
    fault.incomplete_parents !== 4_930 ||
    fault.technical_faults !== 1 ||
    (fault.authority as Record<string, unknown>)?.may_resume_same_family !==
      false ||
    canonicalJson(fault.teacher_plan) !==
      canonicalJson({
        ...predecessorIdentity,
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6,
      })
  ) {
    throw new Error("v1r6 terminal fault/work accounting differs");
  }
  if (options.familyLabel === "v1r10") {
    await authenticateFixedFile(
      {
        path: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_PLAN_PATH,
        bytes: 16_406,
        sha256:
          "c42b47efa41293f8170fe3792bcfb21798b9dd287226c67face6eb49e163ea19",
      },
      "v1r9 unauthenticated runtime-plan publication failure",
    );
    const v1r9Files = await fs.promises.readdir(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_DIRECTORY,
    );
    if (
      v1r9Files.length !== 1 ||
      v1r9Files[0] !==
        path.basename(HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_PLAN_PATH)
    ) {
      throw new Error(
        "v1r9 failed namespace contains teacher execution artifacts",
      );
    }
  }
  if (options.familyLabel === "v1r11") {
    for (const [label, expected] of Object.entries({
      "v1r10 teacher plan": {
        path: `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_DIRECTORY}/teacher-plan.json`,
        bytes: 16_859,
        sha256:
          "9f56b8ab252ce96a4ee0675252e7b54be6cdb26d294dde08d896dce9b7c60b15",
      },
      "v1r10 teacher work": {
        path: `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_DIRECTORY}/teacher-work.jsonl`,
        bytes: 91_081_134,
        sha256:
          "39bef71ce5688eb10f47bdbc6e6aa8f1dd884a6f0a244bf090134cd7c10440ff",
      },
      "v1r10 terminal fault": {
        path: `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_DIRECTORY}/teacher-terminal-fault.json`,
        bytes: 1_084,
        sha256:
          "436e9c6dfe5d8824cf89b1616ed82e082bfdafe67e7e8ed6870bb5e2d5539997",
      },
    })) {
      await authenticateFixedFile(expected, label);
    }
  }
  const selectionEvidence = {
    ...(predecessor.selection_evidence as Record<string, unknown>),
    source_revision: sourceRevision,
  };
  const outputNamespace = preregistration.output_namespace as Record<
    string,
    unknown
  >;
  const { collision_policy: collisionPolicy, ...portableOutputs } =
    outputNamespace;
  const outputs =
    options.familyLabel === "v1r11"
      ? Object.fromEntries(
          Object.entries(portableOutputs).map(([key, value]) => [
            key,
            expandHalfkp81Depth18V1R11HomePathForTests(
              String(value),
              currentCanonicalPasswdHome(),
              process.env.HOME,
            ),
          ]),
        )
      : portableOutputs;
  if (
    collisionPolicy !== "create-only-fail-if-any-target-exists" ||
    outputs.directory !== options.outputDirectory ||
    outputs.plan_json !== options.outputPlanPath
  ) {
    throw new Error(
      `${options.familyLabel} output namespace differs before publication`,
    );
  }
  try {
    await fs.promises.lstat(options.outputDirectory);
    throw new Error(
      `${options.familyLabel} formal output directory already exists`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const v1r11 = options.familyLabel === "v1r11";
  const v1r11EngineReceipt = v1r11
    ? await authenticateEngineReceipt(
        repositoryRoot,
        predecessor.engine
          .binary as Readonly<Halfkp81Depth18TeacherFileIdentity>,
      )
    : undefined;
  const plan = Object.freeze({
    authority: {
      may_execute_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
    downstream_gates: preregistration.downstream_gates,
    engine: v1r11
      ? {
          ...(predecessor.engine as Readonly<Record<string, unknown>>),
          receipt: v1r11EngineReceipt,
        }
      : predecessor.engine,
    escalation_budgets: preregistration.escalation_budgets,
    family: preregistration.family,
    large_hash_evidence: preregistration.large_hash_evidence,
    ...(v1r11
      ? {
          live_baseline: preregistration.live_baseline,
          portable_home_path_binding:
            preregistration.portable_home_path_binding,
          power_continuity: preregistration.power_continuity,
          preformal_authority: preregistration.preformal_authority,
        }
      : {}),
    outputs,
    predecessor_failures: preregistration.predecessor_failures,
    preregistration: options.preregistration,
    required_preformal_gates: preregistration.required_preformal_gates,
    ...(v1r11
      ? {
          required_post_formal_gate: preregistration.required_post_formal_gate,
        }
      : {}),
    reused_selection: preregistration.reused_selection,
    ...(v1r11 ? { run_identity: preregistration.run_identity } : {}),
    schema: v1r11
      ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
      : HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9,
    selection_evidence: selectionEvidence,
    selection_manifest: predecessor.selection_manifest,
    selection_roles: preregistration.selection_roles,
    source_revision: sourceRevision,
    source_revision_policy: preregistration.source_revision_policy,
    status: "sealed-not-executed",
    teacher: preregistration.teacher,
    training: preregistration.training,
  });
  const planIdentity = await publishCreateOnly(
    options.outputPlanPath,
    canonicalJsonLine(plan),
  );
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    options.outputPlanPath,
  );
  if (
    authenticated.planIdentity.schema !==
      (v1r11
        ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
        : HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9) ||
    authenticated.planIdentity.sha256 !== planIdentity.sha256
  ) {
    throw new Error(
      `published ${options.familyLabel} plan failed self-authentication`,
    );
  }
  return Object.freeze({
    ...planIdentity,
    schema: v1r11
      ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
      : HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9,
  });
}

/** Create-only publication of the sealed v1r9 Hash8192-fallback runtime plan. */
export async function publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R9(): Promise<
  Readonly<Halfkp81Depth18TeacherFileIdentity>
> {
  return publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R9Protocol({
    familyLabel: "v1r9",
    preregistration: EXPECTED_YANEURA_ONLY_V1R9_PREREGISTRATION,
    outputDirectory: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_DIRECTORY,
    outputPlanPath: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_PLAN_PATH,
  });
}

/** Create-only v1r10 recovery after v1r9 failed post-write self-authentication. */
export async function publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R10(): Promise<
  Readonly<Halfkp81Depth18TeacherFileIdentity>
> {
  return publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R9Protocol({
    familyLabel: "v1r10",
    preregistration: EXPECTED_YANEURA_ONLY_V1R10_PREREGISTRATION,
    outputDirectory: HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_DIRECTORY,
    outputPlanPath: HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_PLAN_PATH,
  });
}

/** Create-only v1r11 recovery with independently verified AC continuity. */
export async function publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R11(): Promise<
  Readonly<Halfkp81Depth18TeacherFileIdentity>
> {
  return publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R9Protocol({
    familyLabel: "v1r11",
    preregistration: EXPECTED_YANEURA_ONLY_V1R11_PREREGISTRATION,
    outputDirectory:
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R14_DEFAULT_DIRECTORY,
    outputPlanPath: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  });
}

async function authenticateFixedFile(
  expected: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  label: string,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const raw = await readHeldStableFile(expected.path, label);
  const actual = fileIdentity(expected.path, raw);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(`${label} differs from the sealed identity`);
  }
  return Object.freeze(actual);
}

async function authenticateEngineReceipt(
  repositoryRoot: string,
  binary: Readonly<Halfkp81Depth18TeacherFileIdentity>,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const receiptPath = path.join(
    repositoryRoot,
    HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_RELATIVE_PATH,
  );
  const raw = await readHeldStableFile(receiptPath, "YaneuraOu engine receipt");
  if (
    raw.byteLength !== HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_BYTES ||
    sha256(raw) !== HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_SHA256
  ) {
    throw new Error("YaneuraOu engine receipt identity differs");
  }
  const receipt = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  if (
    receipt.schema !== "shogi-teacher-engine-receipt-v1" ||
    receipt.source_commit !== EXPECTED_ENGINE_SOURCE_REVISION ||
    receipt.engine_id !== EXPECTED_ENGINE_ID ||
    receipt.binary_bytes !== binary.bytes ||
    receipt.binary_sha256 !== binary.sha256
  ) {
    throw new Error("YaneuraOu engine receipt does not bind the fixed binary");
  }
  return Object.freeze({
    ...fileIdentity(receiptPath, raw),
    schema: "shogi-teacher-engine-receipt-v1",
  });
}

function sealTeacherEntry(
  entry: CompletedWorkEntry,
  fingerprint: string,
): CompletedWorkEntry {
  const captured = {
    ...entry,
    run_fingerprint: fingerprint,
    payload_sha256: "",
  };
  const payload = { ...captured } as Record<string, unknown>;
  delete payload.payload_sha256;
  captured.payload_sha256 = sha256(canonicalJson(payload));
  return captured;
}

function workEntryDigest(
  entry: Omit<Halfkp81Depth18TeacherWorkEntry, "payload_sha256">,
): string {
  return sha256(`${WORK_ENTRY_DIGEST_DOMAIN}${canonicalJson(entry)}`);
}

function parentPayloadDigest(
  parent: Readonly<FloodgateTrainingParent>,
): string {
  return sha256(
    `${STABLE_PARENT_DIGEST_DOMAIN}${canonicalJson({
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

function validateStableResult(
  result: Readonly<
    | FloodgateProductionStableWasmRuntimeResult
    | FloodgateBoundedStableWasmOutcomeV3
  >,
  parent: Readonly<FloodgateTrainingParent>,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  stablePolicy: Halfkp81Depth18StablePolicy,
): string | undefined {
  if (stablePolicy === "yaneuraou-only-v1") {
    throw new Error("yaneura-only work must not contain a stable result");
  }
  const stableRuntime = header.stable_runtime;
  if (stableRuntime === undefined) {
    throw new Error("stable work header omits its runtime binding");
  }
  if (stablePolicy === "optional-bounded-depth11-v3") {
    return validateFloodgateBoundedStableWasmOutcomeV3(
      result,
      parent,
      stableRuntime.receipt_sha256,
    );
  }
  if (
    (result as Readonly<Record<string, unknown>>).schema !==
    FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA
  ) {
    throw new Error(`stable depth11 evidence differs for ${parent.parent_id}`);
  }
  const requiredResult =
    result as Readonly<FloodgateProductionStableWasmRuntimeResult>;
  const row = requiredResult.row;
  const binding = requiredResult.runtime_binding;
  const stableReceipt = stableRuntime.receipt as Record<string, unknown>;
  const operational = stableReceipt.operational as Record<string, unknown>;
  const requestedDepthComplete =
    row.search.completed_depth === FLOODGATE_STABLE_REQUESTED_DEPTH &&
    row.search.termination === "requested-depth-complete";
  const winningMateBandEarly =
    Number.isSafeInteger(row.search.completed_depth) &&
    row.search.completed_depth >= 1 &&
    row.search.completed_depth < FLOODGATE_STABLE_REQUESTED_DEPTH &&
    row.search.termination === "winning-mate-band-early" &&
    row.search.raw_search_score >= FLOODGATE_STABLE_MATE_SCORE_MIN &&
    row.search.raw_search_score <= FLOODGATE_STABLE_MATE_SCORE_MAX;
  if (
    requiredResult.schema !==
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA ||
    row.schema !== FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA ||
    row.game_id !== parent.game_id ||
    row.parent_id !== parent.parent_id ||
    row.position_id !== parent.position_id ||
    row.parent_payload_sha256 !== parentPayloadDigest(parent) ||
    row.child_sfen !== childSfenAfterUsi(parent.parent_sfen, row.stable_move) ||
    row.child_position_id !== positionKeyFromSfen(row.child_sfen) ||
    row.search.requested_depth !== FLOODGATE_STABLE_REQUESTED_DEPTH ||
    (!requestedDepthComplete && !winningMateBandEarly) ||
    row.search.score_encoding !== FLOODGATE_STABLE_WASM_SCORE_ENCODING ||
    row.search.root_tesu !== parent.ply ||
    !Number.isSafeInteger(row.search.raw_search_score) ||
    row.search.raw_search_score < -FLOODGATE_STABLE_MATE_SCORE_MAX ||
    row.search.raw_search_score > FLOODGATE_STABLE_MATE_SCORE_MAX ||
    !Number.isSafeInteger(row.search.nodes) ||
    row.search.nodes < 0 ||
    !Number.isSafeInteger(row.search.leaves) ||
    row.search.leaves < 0 ||
    row.search.nodes + row.search.leaves <= 0 ||
    binding.runtime_receipt_sha256 !== stableRuntime.receipt_sha256 ||
    binding.reusable_pool_receipt_sha256 !==
      operational?.reusable_pool_receipt_sha256 ||
    binding.parent_payload_sha256 !== row.parent_payload_sha256 ||
    binding.row_sha256 !==
      sha256(`${STABLE_RESULT_ROW_DIGEST_DOMAIN}${canonicalJson(row)}`) ||
    binding.claim_boundary !==
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY ||
    binding.execution_boundary !== stableReceipt.execution_boundary ||
    binding.origin !== "direct-owning-runtime-capability-call-v1" ||
    binding.plain_result_authentication_claim !== false
  ) {
    throw new Error(`stable depth11 evidence differs for ${parent.parent_id}`);
  }
  return row.stable_move;
}

function validateFormalWorkEntry(
  value: unknown,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  parents: ReadonlyMap<string, Readonly<FloodgateTrainingParent>>,
  roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>,
  stablePolicy: Halfkp81Depth18StablePolicy,
  source: string,
  allowFallbackTimeoutRecovery = false,
): Halfkp81Depth18TeacherWorkEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be an object`);
  }
  const entry = value as Halfkp81Depth18TeacherWorkEntry;
  const yaneuraOnly = stablePolicy === "yaneuraou-only-v1";
  const resetTimeoutRecoveryV1R6 =
    header.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6;
  const hashFallbackV1R9 =
    header.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9 ||
    header.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11;
  exactKeys(
    entry as unknown as Record<string, unknown>,
    yaneuraOnly
      ? [
          "schema",
          "kind",
          "run_fingerprint",
          "parent_id",
          "role",
          "candidate_generation",
          ...(resetTimeoutRecoveryV1R6 || hashFallbackV1R9
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
    source,
  );
  const parent = parents.get(entry.parent_id);
  if (
    entry.schema !==
      (yaneuraOnly ? header.schema : HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA) ||
    entry.kind !== "parent" ||
    entry.run_fingerprint !== header.run_fingerprint ||
    parent === undefined ||
    entry.role !== roles.get(entry.parent_id) ||
    (yaneuraOnly &&
      canonicalJson(entry.candidate_generation) !==
        canonicalJson(
          hashFallbackV1R9
            ? HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9
            : HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
        ))
  ) {
    throw new Error(`${source} identity or role differs`);
  }
  if (resetTimeoutRecoveryV1R6) {
    const recovery = entry.reset_timeout_recovery as
      | Readonly<{
          policy: string;
          retries_used: 0 | 1;
          engine_recycles: 0 | 1;
          events: readonly Readonly<{
            attempt: 1;
            error_name: string;
            phase: string;
            timeout_ms: number;
          }>[];
        }>
      | undefined;
    if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) {
      throw new Error(`${source} reset timeout recovery evidence is missing`);
    }
    exactKeys(
      recovery as unknown as Record<string, unknown>,
      ["policy", "retries_used", "engine_recycles", "events"],
      `${source} reset timeout recovery`,
    );
    if (
      recovery.policy !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY ||
      (recovery.retries_used !== 0 && recovery.retries_used !== 1) ||
      recovery.engine_recycles !== recovery.retries_used ||
      !Array.isArray(recovery.events) ||
      recovery.events.length !== recovery.retries_used
    ) {
      throw new Error(`${source} reset timeout recovery evidence differs`);
    }
    for (const [index, event] of recovery.events.entries()) {
      exactKeys(
        event as unknown as Record<string, unknown>,
        ["attempt", "error_name", "phase", "timeout_ms"],
        `${source} reset timeout event ${index}`,
      );
      if (
        event.attempt !== 1 ||
        event.error_name !== "UsiResetForParentTimeoutError" ||
        event.phase !== "reset-for-parent" ||
        event.timeout_ms !== USI_RESET_FOR_PARENT_TIMEOUT_MS
      ) {
        throw new Error(`${source} reset timeout event ${index} differs`);
      }
    }
  }
  if (hashFallbackV1R9) {
    const recovery = entry.reset_timeout_recovery as
      Readonly<Halfkp81Depth18V1R9ResetTimeoutRecovery> | undefined;
    if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) {
      throw new Error(
        `${source} v1r9 reset timeout recovery evidence is missing`,
      );
    }
    exactKeys(
      recovery as unknown as Record<string, unknown>,
      [
        "policy",
        "normal_retries_used",
        "fallback_retries_used",
        "engine_recycles",
        "events",
      ],
      `${source} v1r9 reset timeout recovery`,
    );
    if (
      recovery.policy !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY ||
      (recovery.normal_retries_used !== 0 &&
        recovery.normal_retries_used !== 1) ||
      (recovery.fallback_retries_used !== 0 &&
        recovery.fallback_retries_used !== 1) ||
      recovery.engine_recycles !==
        recovery.normal_retries_used + recovery.fallback_retries_used ||
      !Array.isArray(recovery.events) ||
      recovery.events.length !== recovery.engine_recycles
    ) {
      throw new Error(`${source} v1r9 reset timeout recovery evidence differs`);
    }
    let normalEvents = 0;
    let fallbackEvents = 0;
    for (const [index, event] of recovery.events.entries()) {
      exactKeys(
        event as unknown as Record<string, unknown>,
        ["route", "attempt", "error_name", "phase", "timeout_ms"],
        `${source} v1r9 reset timeout event ${index}`,
      );
      if (
        (event.route !== "normal" && event.route !== "fallback") ||
        event.attempt !== 1 ||
        event.error_name !== "UsiResetForParentTimeoutError" ||
        event.phase !== "reset-for-parent" ||
        event.timeout_ms !== USI_RESET_FOR_PARENT_TIMEOUT_MS
      ) {
        throw new Error(`${source} v1r9 reset timeout event ${index} differs`);
      }
      if (event.route === "normal") normalEvents += 1;
      else fallbackEvents += 1;
    }
    if (
      normalEvents !== recovery.normal_retries_used ||
      fallbackEvents !== recovery.fallback_retries_used
    ) {
      throw new Error(`${source} v1r9 reset timeout route accounting differs`);
    }
  }
  const payload = { ...entry } as Record<string, unknown>;
  delete payload.payload_sha256;
  if (
    entry.payload_sha256 !==
    sha256(`${WORK_ENTRY_DIGEST_DOMAIN}${canonicalJson(payload)}`)
  ) {
    throw new Error(`${source} payload checksum differs`);
  }
  const stableMove = yaneuraOnly
    ? undefined
    : validateStableResult(
        entry.stable_result as Readonly<
          | FloodgateProductionStableWasmRuntimeResult
          | FloodgateBoundedStableWasmOutcomeV3
        >,
        parent,
        header,
        stablePolicy,
      );
  let v1r9Route: Halfkp81Depth18V1R9RescoreRoute | undefined;
  if (hashFallbackV1R9) {
    const route = entry.rescore_route;
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      throw new Error(`${source} v1r9 rescore route is missing`);
    }
    exactKeys(
      route as unknown as Record<string, unknown>,
      route.mode === "normal-depth18"
        ? ["mode", "normal_hash_mib", "normal_limit", "fallback"]
        : [
            "mode",
            "normal_hash_mib",
            "normal_limit",
            "trigger",
            "normal_engine_reaped_before_fallback",
            "fallback",
          ],
      `${source} v1r9 rescore route`,
    );
    const expectedNormalLimit = {
      depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
      nodes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP,
      minimum_completed_depth:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR,
    };
    if (
      route.normal_hash_mib !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB ||
      canonicalJson(route.normal_limit) !== canonicalJson(expectedNormalLimit)
    ) {
      throw new Error(`${source} v1r9 normal rescore binding differs`);
    }
    if (route.mode === "normal-depth18") {
      if (route.fallback !== null) {
        throw new Error(
          `${source} normal v1r9 route contains fallback evidence`,
        );
      }
    } else if (route.mode === "hash8192-parent-fallback") {
      const trigger = route.trigger;
      const fallback = route.fallback;
      if (
        !trigger ||
        typeof trigger !== "object" ||
        Array.isArray(trigger) ||
        !fallback ||
        typeof fallback !== "object" ||
        Array.isArray(fallback)
      ) {
        throw new Error(`${source} v1r9 fallback route evidence is missing`);
      }
      const timeoutRecoveryEvidence = Object.prototype.hasOwnProperty.call(
        fallback,
        "search_timeout_deferrals_used",
      );
      exactKeys(
        trigger as unknown as Record<string, unknown>,
        [
          "move",
          "candidate_index_zero_based",
          "candidate_count",
          "completed_normal_rescores_discarded",
          "cap",
        ],
        `${source} v1r9 fallback trigger`,
      );
      exactKeys(
        fallback as unknown as Record<string, unknown>,
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
          ...(timeoutRecoveryEvidence
            ? [
                "search_timeout_deferrals_used",
                "discarded_completed_rescores_before_timeout_retry",
                "timed_out_searchmoves",
              ]
            : []),
        ],
        `${source} v1r9 fallback execution`,
      );
      const cap = trigger.cap;
      if (!cap || typeof cap !== "object" || Array.isArray(cap)) {
        throw new Error(`${source} v1r9 fallback cap evidence is missing`);
      }
      exactKeys(
        cap as unknown as Record<string, unknown>,
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
        `${source} v1r9 fallback cap evidence`,
      );
      if (
        route.normal_engine_reaped_before_fallback !== true ||
        typeof trigger.move !== "string" ||
        !Number.isSafeInteger(trigger.candidate_index_zero_based) ||
        trigger.candidate_index_zero_based < 0 ||
        !Number.isSafeInteger(trigger.candidate_count) ||
        trigger.candidate_count < 1 ||
        trigger.candidate_index_zero_based >= trigger.candidate_count ||
        !Number.isSafeInteger(trigger.completed_normal_rescores_discarded) ||
        trigger.completed_normal_rescores_discarded < 0 ||
        trigger.completed_normal_rescores_discarded !==
          trigger.candidate_index_zero_based ||
        cap.termination_reason !== "node-cap" ||
        cap.requested_depth !== HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH ||
        cap.node_cap !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP ||
        cap.minimum_completed_depth !==
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR ||
        !Number.isSafeInteger(cap.deepest_complete_exact_depth) ||
        cap.deepest_complete_exact_depth < cap.minimum_completed_depth ||
        cap.deepest_complete_exact_depth >= cap.requested_depth ||
        !Number.isSafeInteger(cap.selected_snapshot_nodes) ||
        cap.selected_snapshot_nodes < 0 ||
        cap.selected_snapshot_nodes >= cap.node_cap ||
        !Number.isSafeInteger(cap.maximum_observed_nodes) ||
        cap.maximum_observed_nodes < 0 ||
        !Number.isSafeInteger(cap.maximum_observed_depth) ||
        cap.maximum_observed_depth < 1 ||
        cap.maximum_observed_depth > cap.requested_depth ||
        cap.selected_snapshot_bound !== "exact" ||
        cap.selected_precedes_witness !== true ||
        !Number.isSafeInteger(cap.cap_witness_depth) ||
        !Number.isSafeInteger(cap.cap_witness_nodes) ||
        cap.cap_witness_depth <= cap.deepest_complete_exact_depth ||
        cap.cap_witness_depth > cap.requested_depth ||
        cap.cap_witness_nodes < cap.node_cap ||
        cap.maximum_observed_nodes < cap.cap_witness_nodes ||
        cap.maximum_observed_depth < cap.cap_witness_depth ||
        !Number.isSafeInteger(cap.discarded_at_or_above_node_cap_updates) ||
        cap.discarded_at_or_above_node_cap_updates < 1 ||
        !Number.isSafeInteger(cap.observed_lowerbound_updates) ||
        cap.observed_lowerbound_updates < 0 ||
        !Number.isSafeInteger(cap.observed_upperbound_updates) ||
        cap.observed_upperbound_updates < 0 ||
        cap.completed_iteration_witness_depth !==
          cap.deepest_complete_exact_depth ||
        fallback.hash_mib !==
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_HASH_MIB ||
        fallback.depth !== HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH ||
        (fallback.timeout_ms !==
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS &&
          (fallback.timeout_ms !==
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_FALLBACK_SEARCH_TIMEOUT_MS ||
            (header.schema !==
              HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11 &&
              !allowFallbackTimeoutRecovery))) ||
        fallback.semaphore_limit !==
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_CONCURRENCY ||
        fallback.all_candidates_recomputed !== true ||
        fallback.candidate_count !== trigger.candidate_count ||
        (fallback.fallback_reset_retries_used !== 0 &&
          fallback.fallback_reset_retries_used !== 1) ||
        !Number.isSafeInteger(
          fallback.discarded_completed_rescores_before_retry,
        ) ||
        fallback.discarded_completed_rescores_before_retry < 0 ||
        fallback.discarded_completed_rescores_before_retry >=
          fallback.candidate_count ||
        (timeoutRecoveryEvidence
          ? !allowFallbackTimeoutRecovery ||
            (fallback.timeout_ms !==
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS &&
              fallback.timeout_ms !==
                HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_FALLBACK_SEARCH_TIMEOUT_MS) ||
            fallback.search_timeout_deferrals_used !== 1 ||
            !Number.isSafeInteger(
              fallback.discarded_completed_rescores_before_timeout_retry,
            ) ||
            fallback.discarded_completed_rescores_before_timeout_retry < 0 ||
            fallback.discarded_completed_rescores_before_timeout_retry >=
              fallback.candidate_count ||
            !Array.isArray(fallback.timed_out_searchmoves) ||
            fallback.timed_out_searchmoves.length !== 1 ||
            typeof fallback.timed_out_searchmoves[0] !== "string" ||
            fallback.searches_executed !==
              fallback.candidate_count +
                fallback.discarded_completed_rescores_before_retry +
                fallback.discarded_completed_rescores_before_timeout_retry +
                1 ||
            fallback.searches_executed >
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_ESCALATION_BUDGETS.fallback_search_count_maximum_per_parent
          : fallback.searches_executed !==
            fallback.candidate_count +
              fallback.discarded_completed_rescores_before_retry) ||
        fallback.normal_rescore_rows_reused !== 0 ||
        fallback.candidate_omissions !== 0 ||
        fallback.engine_quit_before_semaphore_release !== true
      ) {
        throw new Error(`${source} v1r9 fallback route evidence differs`);
      }
    } else {
      throw new Error(`${source} v1r9 rescore route mode differs`);
    }
    v1r9Route = route;
  }
  const expectedTeacherLimit =
    v1r9Route?.mode === "normal-depth18"
      ? {
          depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
          nodes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP,
          minimumCompletedDepth:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR,
        }
      : { depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH };
  const teacher = validateWorkEntry(
    entry.teacher_entry,
    header.run_fingerprint,
    parents,
    `${source} teacher entry`,
    HALFKP81_DEPTH18_TEACHER_MULTIPV,
    expectedTeacherLimit,
    header.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5 ||
      header.schema ===
        HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6 ||
      hashFallbackV1R9
      ? hashFallbackV1R9
        ? v1r9Route?.mode === "hash8192-parent-fallback"
          ? ((v1r9Route.fallback as Readonly<{ timeout_ms: number }>)
              .timeout_ms as 14_400_000 | 86_400_000)
          : HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS
        : HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS
      : HALFKP81_DEPTH18_TEACHER_PARENT_TIMEOUT_MS,
    { depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH },
    allowFallbackTimeoutRecovery ? HALFKP81_DEPTH18_TEACHER_MULTIPV : undefined,
    stableMove,
  );
  if (hashFallbackV1R9) {
    const route = v1r9Route as Halfkp81Depth18V1R9RescoreRoute;
    const recovery =
      entry.reset_timeout_recovery as Readonly<Halfkp81Depth18V1R9ResetTimeoutRecovery>;
    if (route.mode === "normal-depth18") {
      if (recovery.fallback_retries_used !== 0) {
        throw new Error(
          `${source} normal v1r9 route contains fallback recovery evidence`,
        );
      }
      for (const [index, search] of teacher.exact_search.searches.entries()) {
        const dual = search.dual_bound;
        if (
          dual === undefined ||
          (dual.termination_reason !== "depth" &&
            dual.termination_reason !== "terminal-mate") ||
          (dual.termination_reason === "depth" &&
            dual.deepest_complete_exact_depth !==
              HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH)
        ) {
          throw new Error(
            `${source} normal v1r9 exact search ${index} is not an admitted depth18 result`,
          );
        }
      }
    } else {
      if (
        route.trigger.candidate_count !== teacher.candidate_moves.length ||
        route.fallback.candidate_count !== teacher.candidate_moves.length ||
        route.trigger.candidate_index_zero_based >=
          teacher.candidate_moves.length ||
        route.trigger.move !==
          teacher.candidate_moves[route.trigger.candidate_index_zero_based] ||
        teacher.exact_search.searches.length !==
          teacher.candidate_moves.length ||
        teacher.exact_search.searches.some(
          (search) => search.dual_bound !== undefined,
        ) ||
        (Object.prototype.hasOwnProperty.call(
          route.fallback,
          "search_timeout_deferrals_used",
        ) &&
          (!Array.isArray(route.fallback.timed_out_searchmoves) ||
            route.fallback.timed_out_searchmoves[0] !==
              teacher.candidate_moves[
                route.fallback
                  .discarded_completed_rescores_before_timeout_retry as number
              ])) ||
        route.fallback.fallback_reset_retries_used !==
          recovery.fallback_retries_used ||
        (recovery.fallback_retries_used === 0 &&
          route.fallback.discarded_completed_rescores_before_retry !== 0)
      ) {
        throw new Error(
          `${source} v1r9 fallback route is not bound to the final candidate set`,
        );
      }
    }
  }
  if (
    teacher.kind !== "parent" ||
    teacher.records.length < 2 ||
    teacher.records.length > (yaneuraOnly ? 13 : 14) ||
    (stableMove !== undefined &&
      !teacher.records.some(
        (record) =>
          record.move === stableMove && record.sources.includes("stable"),
      )) ||
    (stableMove === undefined &&
      teacher.records.some((record) => record.sources.includes("stable"))) ||
    teacher.records.some(
      (record) =>
        Object.prototype.hasOwnProperty.call(record, "old_depth12_cp") ||
        record.teacher_rank < 1,
    )
  ) {
    throw new Error(
      `${source} is not a complete ${
        yaneuraOnly ? "Yaneura-only" : "stable-union"
      } depth18 label`,
    );
  }
  return entry;
}

async function initializeWork(
  workPath: string,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  parents: ReadonlyMap<string, Readonly<FloodgateTrainingParent>>,
  roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>,
  stablePolicy: Halfkp81Depth18StablePolicy,
  allowFallbackTimeoutRecovery = false,
): Promise<Map<string, Halfkp81Depth18TeacherWorkEntry>> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(workPath, "wx", 0o600);
    await handle.writeFile(canonicalJsonLine(header));
    await handle.datasync();
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const raw = await fs.promises.readFile(workPath);
  const hasTerminalLf = raw.length > 0 && raw[raw.length - 1] === 0x0a;
  const text = raw.toString("utf8");
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const entries = new Map<string, Halfkp81Depth18TeacherWorkEntry>();
  let validBytes = 0;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      if (!hasTerminalLf && index === lines.length - 1) break;
      throw new Error(`work checkpoint line ${index + 1} is invalid JSON`);
    }
    if (index === 0) {
      if (canonicalJson(parsed) !== canonicalJson(header)) {
        throw new Error(
          "work checkpoint header differs from the current fixed run",
        );
      }
    } else {
      const entry = validateFormalWorkEntry(
        parsed,
        header,
        parents,
        roles,
        stablePolicy,
        `work checkpoint line ${index + 1}`,
        allowFallbackTimeoutRecovery,
      );
      if (entries.has(entry.parent_id)) {
        throw new Error(
          `duplicate parent in work checkpoint: ${entry.parent_id}`,
        );
      }
      entries.set(entry.parent_id, entry);
    }
    validBytes += Buffer.byteLength(lines[index], "utf8") + 1;
  }
  if (lines.length === 0) throw new Error("work checkpoint has no header");
  if (validBytes !== raw.byteLength) {
    const repair = await fs.promises.open(workPath, "r+");
    try {
      await repair.truncate(validBytes);
      await repair.datasync();
    } finally {
      await repair.close();
    }
  }
  return entries;
}

async function appendDurable(
  handle: fs.promises.FileHandle,
  entry: Readonly<Halfkp81Depth18TeacherWorkEntry>,
): Promise<void> {
  await handle.appendFile(canonicalJsonLine(entry));
  await handle.datasync();
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishCreateOnly(
  destination: string,
  bytes: Uint8Array,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const directory = path.dirname(destination);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const existing = await readHeldStableFile(
      destination,
      "existing create-only output",
    );
    if (!Buffer.from(bytes).equals(existing)) {
      throw new Error(
        `create-only output already exists with different bytes: ${destination}`,
      );
    }
    return Object.freeze(fileIdentity(destination, existing));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${crypto.randomBytes(12).toString("hex")}.tmp`,
  );
  const handle = await fs.promises.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.datasync();
  } finally {
    await handle.close();
  }
  try {
    try {
      await fs.promises.link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readHeldStableFile(
        destination,
        "raced create-only output",
      );
      if (!Buffer.from(bytes).equals(existing)) {
        throw new Error(
          `create-only publication race produced different bytes: ${destination}`,
        );
      }
    }
    await fsyncDirectory(directory);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return Object.freeze(fileIdentity(destination, bytes));
}

export const publishHalfkp81Depth18TeacherCreateOnlyCoreForTests =
  publishCreateOnly;

function engineEnvironment(workerCwd: string): NodeJS.ProcessEnv {
  const realCwd = fs.realpathSync.native(workerCwd);
  return Object.fromEntries(
    Object.entries(SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT.variables).map(
      ([name, value]) => [
        name,
        value === "<private-worker-cwd>" ? realCwd : value,
      ],
    ),
  ) as NodeJS.ProcessEnv;
}

async function defaultStableRuntime(): Promise<Halfkp81Depth18TeacherStableRuntime> {
  const runtime = await createFloodgateProductionStableWasmRuntime();
  return {
    receipt: runtime.receipt as unknown as Readonly<Record<string, unknown>>,
    receiptDigest:
      getFloodgateProductionStableWasmRuntimeReceiptDigest(runtime),
    propose: (parent) =>
      runtime.propose(parent) as Promise<
        Readonly<FloodgateProductionStableWasmRuntimeResult>
      >,
    close: () => runtime.close(),
  };
}

async function defaultBoundedStableRuntimeV3(): Promise<Halfkp81Depth18TeacherStableRuntime> {
  const runtime = await createFloodgateBoundedStableWasmRuntimeV3();
  return {
    receipt: runtime.receipt as unknown as Readonly<Record<string, unknown>>,
    receiptDigest: getFloodgateBoundedStableWasmRuntimeReceiptDigestV3(
      runtime.receipt,
    ),
    propose: (parent) => runtime.propose(parent),
    close: () => runtime.close(),
  };
}

async function defaultCreateEngine(
  options: Readonly<UsiTeacherEngineOptions>,
): Promise<Halfkp81Depth18TeacherEngine> {
  const engine = new UsiTeacherEngine(options);
  try {
    await engine.init();
    return engine;
  } catch (error) {
    await engine.quit().catch(() => undefined);
    throw error;
  }
}

async function withParentDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<void>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      void onTimeout().catch(() => undefined);
      reject(new Error(`parent-level timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  operation.catch(() => undefined);
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (timedOut) operation.catch(() => undefined);
  }
}

function buildMilestone(
  target: number,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  entries: ReadonlyMap<string, Halfkp81Depth18TeacherWorkEntry>,
  parents: readonly Readonly<FloodgateTrainingParent>[],
): Readonly<Record<string, unknown>> {
  const prefix = parents.slice(0, target);
  if (prefix.some((parent) => !entries.has(parent.parent_id))) {
    throw new Error(`milestone ${target} prefix is incomplete`);
  }
  const projected = prefix.map(
    (parent) =>
      entries.get(parent.parent_id) as Halfkp81Depth18TeacherWorkEntry,
  );
  const routeAccounting =
    header.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9
      ? v1r9RouteAccounting(projected)
      : undefined;
  return Object.freeze({
    schema: HALFKP81_DEPTH18_TEACHER_MILESTONE_SCHEMA,
    status: "durable-prefix-complete-not-training-authority",
    target_parents: target,
    run_fingerprint: header.run_fingerprint,
    parent_ids_sha256: sha256(
      prefix.map((parent) => parent.parent_id).join("\n"),
    ),
    work_entry_payloads_sha256: sha256(
      projected.map((entry) => entry.payload_sha256).join("\n"),
    ),
    completed_rows: projected.reduce(
      (sum, entry) => sum + entry.teacher_entry.records.length,
      0,
    ),
    technical_faults: 0,
    ...(routeAccounting === undefined
      ? {}
      : { hash8192_fallback_recount: routeAccounting }),
    authority: {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  });
}

function v1r9RouteAccounting(
  entries: Iterable<Readonly<Halfkp81Depth18TeacherWorkEntry>>,
): Readonly<Record<string, unknown>> {
  const parents = { fit: 0, tune: 0, sealed: 0 };
  const capTriggers = { fit: 0, tune: 0, sealed: 0 };
  const rows = { fit: 0, tune: 0, sealed: 0 };
  const searches = { fit: 0, tune: 0, sealed: 0 };
  for (const entry of entries) {
    if (entry.rescore_route?.mode !== "hash8192-parent-fallback") continue;
    parents[entry.role] += 1;
    capTriggers[entry.role] += 1;
    rows[entry.role] += entry.rescore_route.fallback.candidate_count;
    searches[entry.role] += entry.rescore_route.fallback.searches_executed;
  }
  return Object.freeze({
    fallback_parents_by_role: Object.freeze(parents),
    cap_trigger_searches_by_role: Object.freeze(capTriggers),
    fallback_rows_by_role: Object.freeze(rows),
    fallback_searches_by_role: Object.freeze(searches),
    fallback_parents: Object.values(parents).reduce(
      (sum, value) => sum + value,
      0,
    ),
    cap_trigger_searches: Object.values(capTriggers).reduce(
      (sum, value) => sum + value,
      0,
    ),
    fallback_rows: Object.values(rows).reduce((sum, value) => sum + value, 0),
    fallback_searches: Object.values(searches).reduce(
      (sum, value) => sum + value,
      0,
    ),
    capped_teacher_labels: 0,
  });
}

async function publishReadyMilestones(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  contract: Readonly<Halfkp81Depth18TeacherCoreContract>,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  entries: ReadonlyMap<string, Halfkp81Depth18TeacherWorkEntry>,
  published: Set<number>,
): Promise<void> {
  for (const target of contract.milestones) {
    if (published.has(target)) continue;
    const prefix = authenticated.parents.slice(0, target);
    if (
      prefix.length !== target ||
      prefix.some((parent) => !entries.has(parent.parent_id))
    ) {
      continue;
    }
    const key = `milestone_${target}_json` as
      "milestone_100_json" | "milestone_500_json";
    const output = authenticated.outputs[key];
    if (output === undefined)
      throw new Error(`plan omits milestone output ${target}`);
    const milestone = buildMilestone(
      target,
      header,
      entries,
      authenticated.parents,
    );
    await publishCreateOnly(output, canonicalJsonLine(milestone));
    published.add(target);
    process.stderr.write(
      `[halfkp81-depth18-teacher] durable prefix ${target}/${contract.parentCount}, ` +
        `${String(milestone.completed_rows)} depth18 rows, faults=0\n`,
    );
  }
}

function teacherFailureTelemetry(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const context = error as Error & {
    readonly phase?: unknown;
    readonly requestedMultipv?: unknown;
    readonly requestedLimit?: unknown;
    readonly searchmoves?: unknown;
    readonly timeoutMs?: unknown;
    readonly fallbackTimeoutRecovery?: unknown;
  };
  const stage = {
    error_name: error.name,
    phase: context.phase,
    requested_multipv: context.requestedMultipv,
    requested_limit: context.requestedLimit,
    searchmoves: context.searchmoves,
    timeout_ms: context.timeoutMs,
    fallback_timeout_recovery: context.fallbackTimeoutRecovery,
  };
  const telemetry = Object.fromEntries(
    Object.entries(stage).filter(([, value]) => value !== undefined),
  );
  return Object.keys(telemetry).length === 0
    ? error.message
    : `${error.message}; stage=${canonicalJson(telemetry)}`;
}

/** Fair, bounded admission for the memory-heavy Hash8192 fallback engines. */
class FifoSemaphore {
  private active = 0;
  private readonly waiters: Array<(release: () => void) => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error("FIFO semaphore limit must be a positive integer");
    }
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const admit = (): void => {
        this.active += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active -= 1;
          this.admitNext();
        });
      };
      if (this.active < this.limit && this.waiters.length === 0) admit();
      else this.waiters.push(admit);
    });
  }

  tryAcquire(): (() => void) | undefined {
    if (this.active >= this.limit || this.waiters.length > 0) return undefined;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.admitNext();
    };
  }

  private admitNext(): void {
    if (this.active >= this.limit) return;
    this.waiters.shift()?.();
  }
}

function v1r9CapEvidence(error: SiblingTeacherNodeCapRoutingError) {
  const cap = error.cap;
  if (cap.capWitnessDepth === null || cap.capWitnessNodes === null) {
    throw new Error("node-cap route is missing its cap witness");
  }
  return Object.freeze({
    termination_reason: cap.terminationReason,
    requested_depth: cap.requestedDepth,
    node_cap: cap.nodeCap,
    minimum_completed_depth: cap.minimumCompletedDepth,
    deepest_complete_exact_depth: cap.deepestCompleteExactDepth,
    selected_snapshot_nodes: cap.selectedSnapshotNodes,
    maximum_observed_nodes: cap.maximumObservedNodes,
    maximum_observed_depth: cap.maximumObservedDepth,
    selected_snapshot_bound: cap.selectedSnapshotBound,
    discarded_at_or_above_node_cap_updates:
      cap.discardedAtOrAboveNodeCapUpdates,
    observed_lowerbound_updates: cap.observedLowerboundUpdates,
    observed_upperbound_updates: cap.observedUpperboundUpdates,
    cap_witness_depth: cap.capWitnessDepth,
    cap_witness_nodes: cap.capWitnessNodes,
    selected_precedes_witness: cap.selectedPrecedesWitness as true,
    completed_iteration_witness_depth: cap.completedIterationWitnessDepth,
  });
}

function v1r11FallbackTimeoutRecoveryPlanIsAuthorized(
  plan: Readonly<Record<string, unknown>>,
): boolean {
  const teacher = plan.teacher;
  if (
    teacher === null ||
    typeof teacher !== "object" ||
    Array.isArray(teacher)
  ) {
    return false;
  }
  const teacherRecord = teacher as Readonly<Record<string, unknown>>;
  const fallbackLane = teacherRecord.fallback_lane;
  const normalLane = teacherRecord.normal_lane;
  const resetRecovery = teacherRecord.reset_timeout_recovery;
  if (
    fallbackLane === null ||
    typeof fallbackLane !== "object" ||
    Array.isArray(fallbackLane) ||
    normalLane === null ||
    typeof normalLane !== "object" ||
    Array.isArray(normalLane) ||
    resetRecovery === null ||
    typeof resetRecovery !== "object" ||
    Array.isArray(resetRecovery)
  ) {
    return false;
  }
  const searchRecovery = (fallbackLane as Readonly<Record<string, unknown>>)
    .search_timeout_recovery;
  if (
    searchRecovery === null ||
    typeof searchRecovery !== "object" ||
    Array.isArray(searchRecovery)
  ) {
    return false;
  }
  return (
    (fallbackLane as Readonly<Record<string, unknown>>)
      .search_timeout_milliseconds ===
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS &&
    (normalLane as Readonly<Record<string, unknown>>)
      .search_timeout_milliseconds ===
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS &&
    canonicalJson(plan.escalation_budgets) ===
      canonicalJson(
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_ESCALATION_BUDGETS,
      ) &&
    (resetRecovery as Readonly<Record<string, unknown>>)
      .search_timeout_retry_allowed === true &&
    canonicalJson(searchRecovery) ===
      canonicalJson(HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_PLAN)
  );
}

export const v1r11FallbackTimeoutRecoveryPlanIsAuthorizedForTests =
  v1r11FallbackTimeoutRecoveryPlanIsAuthorized;

async function runWorkers(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  stable: Readonly<Halfkp81Depth18TeacherStableRuntime> | undefined,
  entries: Map<string, Halfkp81Depth18TeacherWorkEntry>,
  dependencies: Readonly<Halfkp81Depth18TeacherRunnerDependencies>,
  contract: Readonly<Halfkp81Depth18TeacherCoreContract>,
  runtimeRoot: string,
  publishedMilestones: Set<number>,
  allowFallbackTimeoutRecovery: boolean,
  powerContinuity?: Readonly<Halfkp81Depth18PowerContinuitySession>,
): Promise<void> {
  const parentMap = new Map(
    authenticated.parents.map((parent) => [parent.parent_id, parent] as const),
  );
  const pending = authenticated.parents.filter(
    (parent) => !entries.has(parent.parent_id),
  );
  const workHandle = await fs.promises.open(
    authenticated.outputs.work_jsonl,
    "a",
    0o600,
  );
  const createEngine = dependencies.createEngine ?? defaultCreateEngine;
  const labelParent = dependencies.labelParent ?? labelSiblingParent;
  const processCount =
    dependencies.processes ?? HALFKP81_DEPTH18_TEACHER_PROCESSES;
  const parentTimeoutMs =
    dependencies.parentTimeoutMs ?? HALFKP81_DEPTH18_TEACHER_PARENT_TIMEOUT_MS;
  const parentDeadlinePolicy = dependencies.parentDeadlinePolicy ?? "aggregate";
  const resetTimeoutRecoveryPolicy =
    dependencies.resetTimeoutRecoveryPolicy ?? "fatal";
  const fallbackTimeoutRecoveryPolicy =
    dependencies.fallbackTimeoutRecoveryPolicy ?? "fatal";
  const stablePolicy = dependencies.stablePolicy ?? "required-depth11-v2";
  const yaneuraOnly = stablePolicy === "yaneuraou-only-v1";
  const hashFallbackV1R9 =
    header.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9 ||
    header.schema === HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11;
  const fallbackSearchTimeoutMs = (() => {
    if (
      header.schema !== HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11
    ) {
      return allowFallbackTimeoutRecovery
        ? HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_FALLBACK_SEARCH_TIMEOUT_MS
        : HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS;
    }
    const configured = (
      (authenticated.plan.teacher as Readonly<Record<string, unknown>>)
        .fallback_lane as Readonly<Record<string, unknown>>
    ).search_timeout_milliseconds;
    if (
      configured !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS &&
      configured !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_FALLBACK_SEARCH_TIMEOUT_MS
    ) {
      throw new Error("v1r11 fallback timeout differs from its sealed plan");
    }
    return configured;
  })();
  const fallbackSemaphore = new FifoSemaphore(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_CONCURRENCY,
  );
  const fallbackSearchBudgetByRole = allowFallbackTimeoutRecovery
    ? HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_ESCALATION_BUDGETS.fallback_search_count_maximum_by_role
    : HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_SEARCH_BUDGET;
  const fallbackSearchBudgetTotal = allowFallbackTimeoutRecovery
    ? HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_ESCALATION_BUDGETS.fallback_search_count_maximum
    : 106_496;
  const fallbackParentsByRole: Record<Halfkp81Depth18TeacherRole, number> = {
    fit: 0,
    tune: 0,
    sealed: 0,
  };
  const fallbackSearchesByRole: Record<Halfkp81Depth18TeacherRole, number> = {
    fit: 0,
    tune: 0,
    sealed: 0,
  };
  const activeFallbackReservations = new Map<
    string,
    Readonly<{ role: Halfkp81Depth18TeacherRole; candidateCount: number }>
  >();
  const deferredFallbackParents = new Map<
    string,
    Readonly<Halfkp81Depth18DeferredFallbackState>
  >();
  const admissionDeferredFallbackParents = new Map<
    string,
    Readonly<Halfkp81Depth18DeferredFallbackAdmissionState>
  >();
  if (hashFallbackV1R9) {
    for (const entry of entries.values()) {
      if (entry.rescore_route?.mode !== "hash8192-parent-fallback") continue;
      fallbackParentsByRole[entry.role] += 1;
      fallbackSearchesByRole[entry.role] +=
        entry.rescore_route.fallback.searches_executed;
    }
    const resumedParents = Object.values(fallbackParentsByRole).reduce(
      (sum, value) => sum + value,
      0,
    );
    const resumedSearches = Object.values(fallbackSearchesByRole).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (
      resumedParents > 8_192 ||
      resumedSearches > fallbackSearchBudgetTotal ||
      (["fit", "tune", "sealed"] as const).some(
        (role) =>
          fallbackParentsByRole[role] >
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_PARENT_BUDGET[role] ||
          fallbackSearchesByRole[role] > fallbackSearchBudgetByRole[role],
      )
    ) {
      throw new Error(
        "v1r9 resumed Hash8192 fallback evidence exceeds its sealed budget",
      );
    }
  }
  const reserveFallbackBudget = (
    role: Halfkp81Depth18TeacherRole,
    candidateCount: number,
  ): void => {
    if (
      !Number.isSafeInteger(candidateCount) ||
      candidateCount < 2 ||
      candidateCount > 13 ||
      fallbackParentsByRole[role] + 1 >
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_PARENT_BUDGET[role] ||
      fallbackSearchesByRole[role] + candidateCount >
        fallbackSearchBudgetByRole[role] ||
      Object.values(fallbackParentsByRole).reduce(
        (sum, value) => sum + value,
        0,
      ) +
        1 >
        8_192 ||
      Object.values(fallbackSearchesByRole).reduce(
        (sum, value) => sum + value,
        0,
      ) +
        candidateCount >
        fallbackSearchBudgetTotal
    ) {
      throw new Error(
        `v1r9 Hash8192 fallback budget exceeded for ${role}: parents=${fallbackParentsByRole[role] + 1}, searches=${fallbackSearchesByRole[role] + candidateCount}`,
      );
    }
    // This mutation is synchronous and occurs before waiting on the FIFO, so
    // concurrent workers cannot over-admit based on stale counts.
    fallbackParentsByRole[role] += 1;
    fallbackSearchesByRole[role] += candidateCount;
  };
  const reserveFallbackRetrySearches = (
    parentId: string,
    role: Halfkp81Depth18TeacherRole,
    completedSearchesDiscarded: number,
  ): void => {
    if (
      !Number.isSafeInteger(completedSearchesDiscarded) ||
      completedSearchesDiscarded < 0 ||
      fallbackSearchesByRole[role] + completedSearchesDiscarded >
        fallbackSearchBudgetByRole[role] ||
      Object.values(fallbackSearchesByRole).reduce(
        (sum, value) => sum + value,
        0,
      ) +
        completedSearchesDiscarded >
        fallbackSearchBudgetTotal
    ) {
      throw new Error(
        `v1r9 Hash8192 fallback retry search budget exceeded for ${role}`,
      );
    }
    fallbackSearchesByRole[role] += completedSearchesDiscarded;
    const reservation = activeFallbackReservations.get(parentId);
    if (reservation === undefined) {
      throw new Error("v1r9 fallback retry has no active budget reservation");
    }
    activeFallbackReservations.set(
      parentId,
      Object.freeze({
        role,
        candidateCount: reservation.candidateCount + completedSearchesDiscarded,
      }),
    );
  };
  if ((stable === undefined) !== yaneuraOnly) {
    throw new Error("teacher candidate runtime differs from its fixed policy");
  }
  const primaryPendingCount = pending.length;
  let next = 0;
  let failure: Error | undefined;
  const activeEngines = new Set<Halfkp81Depth18TeacherEngine>();
  const reapingEngines = new Map<Halfkp81Depth18TeacherEngine, Promise<void>>();
  const stopEngine = async (
    engine: Halfkp81Depth18TeacherEngine | undefined,
  ): Promise<void> => {
    if (engine === undefined || !activeEngines.has(engine)) return;
    const existing = reapingEngines.get(engine);
    if (existing !== undefined) return existing;
    const operation = engine.quit().then(() => {
      activeEngines.delete(engine);
      powerContinuity?.engineReaped(dependencies.now?.() ?? Date.now());
    });
    reapingEngines.set(engine, operation);
    try {
      await operation;
    } finally {
      reapingEngines.delete(engine);
    }
  };
  const reapAllActiveEngines = async (): Promise<void> => {
    await Promise.all([...activeEngines].map((engine) => stopEngine(engine)));
  };
  let workerFailureReap: Promise<void> | undefined;
  const failWorkers = (error: Error): void => {
    failure ??= error;
    workerFailureReap ??= reapAllActiveEngines();
    void workerFailureReap.catch(() => undefined);
  };
  let powerFailureReap: Promise<void> | undefined;
  const powerFailureWatcher = powerContinuity?.failure.catch(
    async (error: unknown) => {
      failure ??=
        error instanceof Error
          ? error
          : new Halfkp81Depth18EnvironmentContinuityError(String(error));
      powerFailureReap = reapAllActiveEngines();
      await powerFailureReap;
    },
  );
  let appendTail: Promise<void> = Promise.resolve();
  const persist = async (
    entry: Halfkp81Depth18TeacherWorkEntry,
  ): Promise<void> => {
    const operation = appendTail.then(async () => {
      await powerContinuity?.assertHealthy();
      await appendDurable(workHandle, entry);
      entries.set(entry.parent_id, entry);
      activeFallbackReservations.delete(entry.parent_id);
      deferredFallbackParents.delete(entry.parent_id);
      admissionDeferredFallbackParents.delete(entry.parent_id);
      if (hashFallbackV1R9) {
        const committed = v1r9RouteAccounting(entries.values()) as Record<
          string,
          unknown
        >;
        const committedParents = committed.fallback_parents_by_role as Record<
          Halfkp81Depth18TeacherRole,
          number
        >;
        const committedSearches = committed.fallback_searches_by_role as Record<
          Halfkp81Depth18TeacherRole,
          number
        >;
        const activeParents = { fit: 0, tune: 0, sealed: 0 };
        const activeRows = { fit: 0, tune: 0, sealed: 0 };
        for (const reservation of activeFallbackReservations.values()) {
          activeParents[reservation.role] += 1;
          activeRows[reservation.role] += reservation.candidateCount;
        }
        if (
          (["fit", "tune", "sealed"] as const).some(
            (role) =>
              committedParents[role] + activeParents[role] !==
                fallbackParentsByRole[role] ||
              committedSearches[role] + activeRows[role] !==
                fallbackSearchesByRole[role],
          )
        ) {
          throw new Error(
            "v1r9 fallback reservation differs from durable recount",
          );
        }
      }
      await powerContinuity?.assertHealthy();
      await publishReadyMilestones(
        authenticated,
        contract,
        header,
        entries,
        publishedMilestones,
      );
    });
    appendTail = operation.catch(() => undefined);
    await operation;
  };
  try {
    const workers = Array.from(
      { length: Math.min(processCount, pending.length) },
      async (_unused, workerIndex) => {
        const workerCwd = path.join(runtimeRoot, `worker-${workerIndex}`);
        await fs.promises.mkdir(workerCwd, { recursive: true, mode: 0o700 });
        let generation = 0;
        let engine: Halfkp81Depth18TeacherEngine | undefined;
        const startEngine = async (
          hashMb = HALFKP81_DEPTH18_TEACHER_HASH_MIB,
          timeoutMs = parentTimeoutMs,
        ): Promise<Halfkp81Depth18TeacherEngine> => {
          const cwd = path.join(workerCwd, `engine-${generation++}`);
          await fs.promises.mkdir(cwd, { mode: 0o700 });
          await powerContinuity?.assertHealthy();
          const started = await createEngine({
            engineBin: authenticated.engine.binary.path,
            evalDir: path.dirname(authenticated.engine.eval_file.path),
            cwd,
            env: engineEnvironment(cwd),
            fvScale: 20,
            hashMb,
            timeoutMs,
          });
          activeEngines.add(started);
          powerContinuity?.engineStarted(dependencies.now?.() ?? Date.now());
          try {
            // Close the create/register race with the independent guardian:
            // a failure that fired while createEngine was pending may have
            // reaped an earlier snapshot before this engine was registered.
            await powerContinuity?.assertHealthy();
            if (failure !== undefined) throw failure;
            return started;
          } catch (error) {
            await stopEngine(started).catch(() => undefined);
            throw error;
          }
        };
        try {
          engine = await startEngine();
          while (failure === undefined) {
            await powerContinuity?.assertHealthy();
            // Do not advance beyond the current tail. Workers that observe an
            // empty queue may finish while another worker is still appending a
            // deferred parent; overshooting here would strand that parent.
            const parent = pending[next];
            if (parent === undefined || engine === undefined) break;
            next += 1;
            try {
              const admissionDeferredFallback =
                admissionDeferredFallbackParents.get(parent.parent_id);
              const deferredFallback = deferredFallbackParents.get(
                parent.parent_id,
              );
              if (
                admissionDeferredFallback !== undefined &&
                deferredFallback !== undefined
              ) {
                throw new Error(
                  "fallback parent cannot be admission- and timeout-deferred",
                );
              }
              const queuedFallback =
                admissionDeferredFallback ?? deferredFallback;
              let resetTimeoutRetries =
                admissionDeferredFallback?.normalResetRetries ??
                deferredFallback?.normalResetRetries ??
                0;
              const resetTimeoutEvents: Array<{
                attempt: 1;
                error_name: "UsiResetForParentTimeoutError";
                phase: "reset-for-parent";
                timeout_ms: number;
              }> =
                (
                  admissionDeferredFallback?.normalResetEvents ??
                  deferredFallback?.normalResetEvents
                )?.map((event) => ({ ...event })) ?? [];
              const fallbackResetTimeoutEvents: Array<{
                route: "fallback";
                attempt: 1;
                error_name: "UsiResetForParentTimeoutError";
                phase: "reset-for-parent";
                timeout_ms: number;
              }> =
                deferredFallback?.fallbackResetEvents.map((event) => ({
                  ...event,
                })) ?? [];
              let completed: Halfkp81Depth18TeacherWorkEntry;
              while (true) {
                try {
                  const operation = (async () => {
                    const stableResult = yaneuraOnly
                      ? undefined
                      : await (
                          stable as Readonly<Halfkp81Depth18TeacherStableRuntime>
                        ).propose(parent);
                    const stableMove = yaneuraOnly
                      ? undefined
                      : validateStableResult(
                          stableResult as Readonly<
                            | FloodgateProductionStableWasmRuntimeResult
                            | FloodgateBoundedStableWasmOutcomeV3
                          >,
                          parent,
                          header,
                          stablePolicy,
                        );
                    const legalMoves = rulesCompleteLegalMoves(
                      positionFromSfen(parent.parent_sfen).position,
                    ).map((entry) => entry.usi);
                    let rawTeacher: CompletedWorkEntry;
                    let rescoreRoute:
                      Halfkp81Depth18V1R9RescoreRoute | undefined;
                    if (hashFallbackV1R9) {
                      const prepared =
                        queuedFallback?.prepared ??
                        (await prepareSiblingParentLabel(
                          engine as UsiTeacherEngine,
                          parent,
                          HALFKP81_DEPTH18_TEACHER_MULTIPV,
                          { depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH },
                          legalMoves,
                          allowFallbackTimeoutRecovery
                            ? HALFKP81_DEPTH18_TEACHER_MULTIPV
                            : undefined,
                          stableMove,
                        ));
                      try {
                        if (queuedFallback !== undefined) {
                          throw queuedFallback.routeError;
                        }
                        rawTeacher = await rescorePreparedSiblingParent(
                          engine as UsiTeacherEngine,
                          parent,
                          prepared,
                          {
                            depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
                            nodes:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP,
                            minimumCompletedDepth:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR,
                          },
                          "route-whole-parent",
                        );
                        rescoreRoute = Object.freeze({
                          mode: "normal-depth18" as const,
                          normal_hash_mib:
                            HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB,
                          normal_limit: Object.freeze({
                            depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
                            nodes:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP,
                            minimum_completed_depth:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR,
                          }),
                          fallback: null,
                        });
                      } catch (routeError) {
                        if (
                          !(
                            routeError instanceof
                            SiblingTeacherNodeCapRoutingError
                          )
                        ) {
                          throw routeError;
                        }
                        if (
                          admissionDeferredFallback === undefined &&
                          deferredFallback === undefined
                        ) {
                          reserveFallbackBudget(
                            authenticated.roles.get(
                              parent.parent_id,
                            ) as Halfkp81Depth18TeacherRole,
                            prepared.candidateMoves.length,
                          );
                          activeFallbackReservations.set(
                            parent.parent_id,
                            Object.freeze({
                              role: authenticated.roles.get(
                                parent.parent_id,
                              ) as Halfkp81Depth18TeacherRole,
                              candidateCount: prepared.candidateMoves.length,
                            }),
                          );
                        } else if (
                          prepared.candidateMoves.length !==
                            queuedFallback.prepared.candidateMoves.length ||
                          prepared.candidateMoves.some(
                            (move, index) =>
                              move !==
                              queuedFallback.prepared.candidateMoves[index],
                          ) ||
                          !activeFallbackReservations.has(parent.parent_id)
                        ) {
                          throw new Error(
                            "deferred fallback candidate set or reservation differs",
                          );
                        }
                        let release = fallbackSemaphore.tryAcquire();
                        if (
                          release === undefined &&
                          next < primaryPendingCount
                        ) {
                          admissionDeferredFallbackParents.set(
                            parent.parent_id,
                            Object.freeze({
                              prepared,
                              routeError,
                              normalResetRetries: resetTimeoutRetries as 0 | 1,
                              normalResetEvents: Object.freeze(
                                resetTimeoutEvents.map((event) =>
                                  Object.freeze({ ...event }),
                                ),
                              ),
                            }),
                          );
                          throw new Halfkp81Depth18DeferredFallbackAdmissionError(
                            parent.parent_id,
                          );
                        }
                        if (release === undefined) {
                          release = await fallbackSemaphore.acquire();
                        }
                        if (failure !== undefined) {
                          release();
                          throw failure;
                        }
                        const failedNormalEngine = engine;
                        engine = undefined;
                        await stopEngine(failedNormalEngine);
                        let fallbackEngine:
                          Halfkp81Depth18TeacherEngine | undefined;
                        let fallbackRetries =
                          deferredFallback?.fallbackResetRetries ?? 0;
                        let discardedFallbackSearches =
                          deferredFallback?.discardedResetSearches ?? 0;
                        try {
                          while (true) {
                            try {
                              fallbackEngine = await startEngine(
                                HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_HASH_MIB,
                                fallbackSearchTimeoutMs,
                              );
                              rawTeacher = await rescorePreparedSiblingParent(
                                fallbackEngine as UsiTeacherEngine,
                                parent,
                                prepared,
                                {
                                  depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
                                },
                              );
                              await stopEngine(fallbackEngine);
                              fallbackEngine = undefined;
                              break;
                            } catch (fallbackError) {
                              const failedFallbackEngine = fallbackEngine;
                              fallbackEngine = undefined;
                              await stopEngine(failedFallbackEngine);
                              if (
                                allowFallbackTimeoutRecovery &&
                                fallbackTimeoutRecoveryPolicy ===
                                  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY &&
                                deferredFallback === undefined &&
                                fallbackError instanceof
                                  SiblingTeacherRescoreSearchTimeoutError &&
                                fallbackError.parentId === parent.parent_id &&
                                fallbackError.phase === "independent-rescore" &&
                                fallbackError.timeoutMs ===
                                  fallbackSearchTimeoutMs &&
                                fallbackError.searchmoves.length === 1 &&
                                fallbackError.candidateCount ===
                                  prepared.candidateMoves.length &&
                                fallbackError.candidateIndex ===
                                  fallbackError.completedSearchesDiscarded &&
                                fallbackError.searchmoves[0] ===
                                  prepared.candidateMoves[
                                    fallbackError.candidateIndex
                                  ] &&
                                fallbackError.completedSearchesDiscarded >= 0 &&
                                fallbackError.completedSearchesDiscarded <
                                  prepared.candidateMoves.length
                              ) {
                                await powerContinuity?.assertHealthy();
                                if (failure !== undefined) throw failure;
                                const discardedSearches =
                                  fallbackError.completedSearchesDiscarded + 1;
                                reserveFallbackRetrySearches(
                                  parent.parent_id,
                                  authenticated.roles.get(
                                    parent.parent_id,
                                  ) as Halfkp81Depth18TeacherRole,
                                  discardedSearches,
                                );
                                deferredFallbackParents.set(
                                  parent.parent_id,
                                  Object.freeze({
                                    prepared,
                                    routeError,
                                    timedOutSearchmove:
                                      fallbackError.searchmoves[0],
                                    discardedCompletedRescores:
                                      fallbackError.completedSearchesDiscarded,
                                    discardedSearches,
                                    normalResetRetries: resetTimeoutRetries as
                                      0 | 1,
                                    normalResetEvents: Object.freeze(
                                      resetTimeoutEvents.map((event) =>
                                        Object.freeze({ ...event }),
                                      ),
                                    ),
                                    fallbackResetRetries: fallbackRetries,
                                    discardedResetSearches:
                                      discardedFallbackSearches,
                                    fallbackResetEvents: Object.freeze(
                                      fallbackResetTimeoutEvents.map((event) =>
                                        Object.freeze({ ...event }),
                                      ),
                                    ),
                                  }),
                                );
                                admissionDeferredFallbackParents.delete(
                                  parent.parent_id,
                                );
                                throw new Halfkp81Depth18DeferredFallbackTimeoutError(
                                  parent.parent_id,
                                );
                              }
                              if (
                                allowFallbackTimeoutRecovery &&
                                fallbackTimeoutRecoveryPolicy ===
                                  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY &&
                                deferredFallback !== undefined &&
                                fallbackError instanceof
                                  SiblingTeacherRescoreSearchTimeoutError &&
                                fallbackError.parentId === parent.parent_id &&
                                fallbackError.phase === "independent-rescore" &&
                                fallbackError.timeoutMs ===
                                  fallbackSearchTimeoutMs &&
                                fallbackError.searchmoves.length === 1 &&
                                fallbackError.candidateCount ===
                                  prepared.candidateMoves.length &&
                                fallbackError.candidateIndex ===
                                  fallbackError.completedSearchesDiscarded &&
                                fallbackError.searchmoves[0] ===
                                  prepared.candidateMoves[
                                    fallbackError.candidateIndex
                                  ] &&
                                fallbackError.completedSearchesDiscarded >= 0 &&
                                fallbackError.completedSearchesDiscarded <
                                  prepared.candidateMoves.length
                              ) {
                                throw new Halfkp81Depth18FallbackTimeoutRecoveryExhaustedError(
                                  deferredFallback,
                                  fallbackError,
                                  discardedFallbackSearches,
                                );
                              }
                              if (
                                !(
                                  fallbackError instanceof
                                  UsiResetForParentTimeoutError
                                )
                              ) {
                                throw fallbackError;
                              }
                              if (fallbackRetries >= 1) {
                                const exhausted = new Error(
                                  `fallback resetForParent timeout recovery exhausted after two timeouts and one engine recycle: ${fallbackError.message}`,
                                ) as Error & {
                                  phase: "reset-for-parent";
                                  timeoutMs: number;
                                };
                                exhausted.name =
                                  "UsiFallbackResetForParentRecoveryExhaustedError";
                                exhausted.phase = "reset-for-parent";
                                exhausted.timeoutMs = fallbackError.timeoutMs;
                                throw exhausted;
                              }
                              if (
                                !(
                                  fallbackError instanceof
                                  SiblingTeacherRescoreResetTimeoutError
                                )
                              ) {
                                throw new Error(
                                  "fallback reset timeout lacks candidate-local search accounting",
                                );
                              }
                              discardedFallbackSearches =
                                fallbackError.completedSearchesDiscarded;
                              reserveFallbackRetrySearches(
                                parent.parent_id,
                                authenticated.roles.get(
                                  parent.parent_id,
                                ) as Halfkp81Depth18TeacherRole,
                                discardedFallbackSearches,
                              );
                              fallbackRetries += 1;
                              fallbackResetTimeoutEvents.push({
                                route: "fallback",
                                attempt: 1,
                                error_name: "UsiResetForParentTimeoutError",
                                phase: "reset-for-parent",
                                timeout_ms: fallbackError.timeoutMs,
                              });
                            }
                          }
                        } finally {
                          try {
                            await stopEngine(fallbackEngine);
                          } finally {
                            release();
                          }
                        }
                        rescoreRoute = Object.freeze({
                          mode: "hash8192-parent-fallback" as const,
                          normal_hash_mib:
                            HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB,
                          normal_limit: Object.freeze({
                            depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
                            nodes:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_NODE_CAP,
                            minimum_completed_depth:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_ROUTING_DEPTH_FLOOR,
                          }),
                          trigger: Object.freeze({
                            move: routeError.move,
                            candidate_index_zero_based:
                              routeError.candidateIndex,
                            candidate_count: routeError.candidateCount,
                            completed_normal_rescores_discarded:
                              routeError.completedSearchesDiscarded,
                            cap: v1r9CapEvidence(routeError),
                          }),
                          normal_engine_reaped_before_fallback: true as const,
                          fallback: Object.freeze({
                            hash_mib:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_HASH_MIB,
                            depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
                            timeout_ms: fallbackSearchTimeoutMs,
                            semaphore_limit:
                              HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_FALLBACK_CONCURRENCY,
                            all_candidates_recomputed: true as const,
                            candidate_count: prepared.candidateMoves.length,
                            fallback_reset_retries_used: fallbackRetries as
                              0 | 1,
                            discarded_completed_rescores_before_retry:
                              discardedFallbackSearches,
                            ...(deferredFallback === undefined
                              ? {}
                              : {
                                  search_timeout_deferrals_used: 1 as const,
                                  discarded_completed_rescores_before_timeout_retry:
                                    deferredFallback.discardedCompletedRescores,
                                  timed_out_searchmoves: Object.freeze([
                                    deferredFallback.timedOutSearchmove,
                                  ]) as readonly [string],
                                }),
                            searches_executed:
                              prepared.candidateMoves.length +
                              discardedFallbackSearches +
                              (deferredFallback?.discardedSearches ?? 0),
                            normal_rescore_rows_reused: 0 as const,
                            candidate_omissions: 0 as const,
                            engine_quit_before_semaphore_release: true as const,
                          }),
                        });
                        engine = await startEngine(
                          HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB,
                        );
                      }
                    } else {
                      rawTeacher = await labelParent(
                        engine as UsiTeacherEngine,
                        parent,
                        HALFKP81_DEPTH18_TEACHER_MULTIPV,
                        { depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH },
                        legalMoves,
                        { depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH },
                        undefined,
                        stableMove,
                      );
                    }
                    const teacherEntry = sealTeacherEntry(
                      rawTeacher,
                      header.run_fingerprint,
                    );
                    const withoutDigest = {
                      schema: yaneuraOnly
                        ? header.schema
                        : HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA,
                      kind: "parent" as const,
                      run_fingerprint: header.run_fingerprint,
                      parent_id: parent.parent_id,
                      role: authenticated.roles.get(
                        parent.parent_id,
                      ) as Halfkp81Depth18TeacherRole,
                      ...(yaneuraOnly
                        ? {
                            candidate_generation: hashFallbackV1R9
                              ? HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9
                              : HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
                            ...(hashFallbackV1R9
                              ? {
                                  rescore_route:
                                    rescoreRoute as Halfkp81Depth18V1R9RescoreRoute,
                                  reset_timeout_recovery: {
                                    policy:
                                      HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
                                    normal_retries_used: resetTimeoutRetries as
                                      0 | 1,
                                    fallback_retries_used:
                                      fallbackResetTimeoutEvents.length as
                                        0 | 1,
                                    engine_recycles: (resetTimeoutRetries +
                                      fallbackResetTimeoutEvents.length) as
                                      0 | 1 | 2,
                                    events: [
                                      ...resetTimeoutEvents.map((event) => ({
                                        route: "normal" as const,
                                        ...event,
                                      })),
                                      ...fallbackResetTimeoutEvents,
                                    ],
                                  },
                                }
                              : {}),
                            ...(header.schema ===
                            HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6
                              ? {
                                  reset_timeout_recovery: {
                                    policy:
                                      HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
                                    retries_used: resetTimeoutRetries as 0 | 1,
                                    engine_recycles: resetTimeoutRetries as
                                      0 | 1,
                                    events: [...resetTimeoutEvents],
                                  },
                                }
                              : {}),
                          }
                        : { stable_result: stableResult }),
                      teacher_entry: teacherEntry,
                    };
                    const formalEntry: Halfkp81Depth18TeacherWorkEntry = {
                      ...withoutDigest,
                      payload_sha256: workEntryDigest(withoutDigest),
                    };
                    return validateFormalWorkEntry(
                      formalEntry,
                      header,
                      parentMap,
                      authenticated.roles,
                      stablePolicy,
                      `runtime parent ${parent.parent_id}`,
                      allowFallbackTimeoutRecovery,
                    );
                  })();
                  completed =
                    parentDeadlinePolicy === "per-search-only"
                      ? await operation
                      : await withParentDeadline(
                          operation,
                          parentTimeoutMs,
                          async () => {
                            await stopEngine(engine).catch(() => undefined);
                            engine = undefined;
                          },
                        );
                  break;
                } catch (error) {
                  if (
                    resetTimeoutRecoveryPolicy !==
                      HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY ||
                    !(error instanceof UsiResetForParentTimeoutError)
                  ) {
                    throw error;
                  }
                  if (resetTimeoutRetries >= 1) {
                    const exhausted = new Error(
                      `resetForParent timeout recovery exhausted after two timeouts and one engine recycle: ${error.message}`,
                    ) as Error & {
                      phase: "reset-for-parent";
                      timeoutMs: number;
                    };
                    exhausted.name = "UsiResetForParentRecoveryExhaustedError";
                    exhausted.phase = "reset-for-parent";
                    exhausted.timeoutMs = error.timeoutMs;
                    throw exhausted;
                  }
                  resetTimeoutRetries += 1;
                  resetTimeoutEvents.push({
                    attempt: 1,
                    error_name: "UsiResetForParentTimeoutError",
                    phase: "reset-for-parent",
                    timeout_ms: error.timeoutMs,
                  });
                  const failedEngine = engine;
                  engine = undefined;
                  await stopEngine(failedEngine);
                  engine = await startEngine();
                  process.stderr.write(
                    `[halfkp81-depth18-teacher] resetForParent timeout for ${parent.parent_id}; recycled worker ${workerIndex} engine and retrying whole parent 1/1\n`,
                  );
                }
              }
              await persist(completed);
            } catch (error) {
              if (
                error instanceof
                  Halfkp81Depth18DeferredFallbackAdmissionError &&
                error.parentId === parent.parent_id &&
                admissionDeferredFallbackParents.has(parent.parent_id) &&
                failure === undefined
              ) {
                pending.push(parent);
                continue;
              }
              if (
                error instanceof Halfkp81Depth18DeferredFallbackTimeoutError &&
                error.parentId === parent.parent_id &&
                deferredFallbackParents.has(parent.parent_id) &&
                failure === undefined
              ) {
                await powerContinuity?.assertHealthy();
                pending.push(parent);
                if (engine === undefined) {
                  engine = await startEngine(
                    HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_NORMAL_HASH_MIB,
                  );
                }
                process.stderr.write(
                  `[halfkp81-depth18-teacher] exact fallback timeout for ${parent.parent_id}; deferred one whole-parent retry behind the primary queue\n`,
                );
                continue;
              }
              failWorkers(
                new Error(
                  `teacher labeling failed for parent ${parent.parent_id}: ${teacherFailureTelemetry(
                    error,
                  )}`,
                ),
              );
            }
          }
        } catch (error) {
          failWorkers(
            new Error(
              `YaneuraOu worker initialization failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        } finally {
          await stopEngine(engine).catch(() => undefined);
        }
      },
    );
    await Promise.all(workers);
    await Promise.resolve();
    if (powerFailureReap !== undefined) await powerFailureWatcher;
    if (workerFailureReap !== undefined)
      await workerFailureReap.catch(() => undefined);
    await reapAllActiveEngines();
    if (activeEngines.size !== 0) {
      throw new Error("YaneuraOu engine reap did not complete");
    }
    await appendTail;
  } finally {
    await reapAllActiveEngines();
    if (activeEngines.size !== 0) {
      throw new Error("YaneuraOu engine remained active after reap");
    }
    await appendTail.catch(() => undefined);
    await workHandle.close();
  }
  if (failure !== undefined) throw failure;
  await powerContinuity?.assertHealthy();
}

function roleArtifactBytes(
  role: Halfkp81Depth18TeacherRole,
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  entries: ReadonlyMap<string, Halfkp81Depth18TeacherWorkEntry>,
): { bytes: Buffer; rows: number; parents: number } {
  const records: SiblingRecord[] = [];
  let parents = 0;
  for (const parent of authenticated.parents) {
    if (authenticated.roles.get(parent.parent_id) !== role) continue;
    const entry = entries.get(parent.parent_id);
    if (entry === undefined)
      throw new Error(`missing ${role} parent ${parent.parent_id}`);
    validateParentGroups(entry.teacher_entry.records);
    records.push(...entry.teacher_entry.records);
    parents += 1;
  }
  const bytes = Buffer.from(
    records.map((record) => canonicalJson(record)).join("\n") +
      (records.length > 0 ? "\n" : ""),
    "utf8",
  );
  return { bytes, rows: records.length, parents };
}

function v1r11FullIdentity(
  identity: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  schema: string,
): Readonly<Halfkp81Depth18TeacherFileIdentity> {
  return Object.freeze({ ...identity, schema });
}

export function buildHalfkp81Depth18V1R11FrozenWorkHeaderForTests(
  value: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    verifiedPreformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    powerAdmissionEntry: Readonly<Record<string, unknown>>;
    openedAtUtc: string;
  }>,
): Readonly<Halfkp81Depth18V1R11TeacherWorkHeader> {
  if (
    !REVISION_RE.test(value.sourceRevision) ||
    !SHA256_RE.test(value.runFingerprint) ||
    !Number.isFinite(new Date(value.openedAtUtc).getTime())
  ) {
    throw new Error("v1r11 frozen work header inputs differ");
  }
  return Object.freeze({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
    status: "formal-work-ledger-open",
    record_kind: "header",
    teacher_plan: value.teacherPlan,
    source_revision: value.sourceRevision,
    run_fingerprint: value.runFingerprint,
    launchagent_authority_evidence: value.launchAgentAuthority,
    preformal_authority_verified_receipt: value.verifiedPreformalAuthority,
    power_admission_entry: value.powerAdmissionEntry,
    opened_at_utc: new Date(value.openedAtUtc).toISOString(),
  });
}

export function buildHalfkp81Depth18V1R11FrozenRawReceiptForTests(
  value: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    teacherWork: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    teacherOutput: Readonly<
      Record<
        Halfkp81Depth18TeacherRole,
        Readonly<Halfkp81Depth18TeacherFileIdentity>
      >
    >;
    preformalLedger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    preformalRawReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    verifiedPreformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    powerLedger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    powerReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    finalizer: Readonly<Record<string, unknown>>;
  }>,
): Readonly<Record<string, unknown>> {
  if (
    !REVISION_RE.test(value.sourceRevision) ||
    !SHA256_RE.test(value.runFingerprint)
  ) {
    throw new Error("v1r11 frozen raw receipt inputs differ");
  }
  return Object.freeze({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_RECEIPT_SCHEMA_V1R11,
    status: "complete-unverified-no-training-authority",
    teacher_plan: value.teacherPlan,
    source_revision: value.sourceRevision,
    run_fingerprint: value.runFingerprint,
    teacher_work: value.teacherWork,
    teacher_output: Object.freeze({ ...value.teacherOutput }),
    preformal_authority_ledger: value.preformalLedger,
    preformal_authority_raw_receipt: value.preformalRawReceipt,
    preformal_authority_verified_receipt: value.verifiedPreformalAuthority,
    launchagent_authority_evidence: value.launchAgentAuthority,
    power_continuity_ledger: value.powerLedger,
    power_continuity_receipt: value.powerReceipt,
    finalizer: value.finalizer,
    authority: Object.freeze({
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
}

function v1r11EnvironmentFaultPreimage(
  value: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    sourceRevision: string;
    runFingerprint: string | null;
    verifiedPreformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    processCleanupEvidence?: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    processCleanup?: Readonly<{
      scheduling_stopped: true;
      engines_terminated: number;
      engines_reaped: number;
      remaining_engine_pids: readonly number[];
    }>;
    fault: Readonly<Record<string, unknown>>;
    faultedAtUtc: string;
  }>,
): Readonly<Record<string, unknown>> {
  const cleanup = value.processCleanup;
  if (
    value.processCleanupEvidence === undefined ||
    value.processCleanupEvidence.schema !==
      "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11" ||
    !path.isAbsolute(value.processCleanupEvidence.path) ||
    !Number.isSafeInteger(value.processCleanupEvidence.bytes) ||
    value.processCleanupEvidence.bytes < 1 ||
    !SHA256_RE.test(value.processCleanupEvidence.sha256) ||
    cleanup === undefined ||
    cleanup.scheduling_stopped !== true ||
    !Number.isSafeInteger(cleanup.engines_terminated) ||
    cleanup.engines_terminated < 0 ||
    !Number.isSafeInteger(cleanup.engines_reaped) ||
    cleanup.engines_reaped < 0 ||
    cleanup.engines_reaped !== cleanup.engines_terminated ||
    !Array.isArray(cleanup.remaining_engine_pids) ||
    cleanup.remaining_engine_pids.length !== 0
  ) {
    throw new Error(
      "v1r11 rich cleanup evidence is required before environment fault",
    );
  }
  return Object.freeze({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_FAULT_SCHEMA,
    status: "environment-continuity-fault-family-closed",
    teacher_plan: value.teacherPlan,
    source_revision: value.sourceRevision,
    run_fingerprint: value.runFingerprint,
    preformal_authority_verified_receipt: value.verifiedPreformalAuthority,
    launchagent_authority_evidence: value.launchAgentAuthority,
    fault: value.fault,
    process_cleanup_evidence: value.processCleanupEvidence,
    process_cleanup: Object.freeze({
      ...cleanup,
      remaining_engine_pids: Object.freeze([]),
    }),
    faulted_at_utc: new Date(value.faultedAtUtc).toISOString(),
    authority: Object.freeze({
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
}

/**
 * Runner-owned environment-fault intent. This deliberately excludes process
 * cleanup because the final LaunchAgent supervisor cannot prove cleanup until
 * the runner and its service have stopped. The guardian seals the digest of
 * this intent into its final fault row/receipt; only the outer supervisor may
 * later combine it with rich cleanup evidence and publish the terminal fault.
 */
export function buildHalfkp81Depth18V1R11EnvironmentFaultIntentForTests(
  value: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    sourceRevision: string;
    runFingerprint: string | null;
    verifiedPreformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    fault: Readonly<{ kind: "environment-continuity"; message: string }>;
  }>,
): Readonly<Record<string, unknown>> {
  if (
    !REVISION_RE.test(value.sourceRevision) ||
    (value.runFingerprint !== null && !SHA256_RE.test(value.runFingerprint)) ||
    !SHA256_RE.test(value.teacherPlan.sha256) ||
    !SHA256_RE.test(value.verifiedPreformalAuthority.sha256) ||
    !SHA256_RE.test(value.launchAgentAuthority.sha256) ||
    value.fault.kind !== "environment-continuity" ||
    value.fault.message.length < 1
  ) {
    throw new Error("v1r11 environment fault intent differs");
  }
  return Object.freeze({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_ENVIRONMENT_FAULT_INTENT_SCHEMA,
    status: "runner-closed-power-fault-awaiting-outer-cleanup",
    teacher_plan: value.teacherPlan,
    source_revision: value.sourceRevision,
    run_fingerprint: value.runFingerprint,
    preformal_authority_verified_receipt: value.verifiedPreformalAuthority,
    launchagent_authority_evidence: value.launchAgentAuthority,
    fault: Object.freeze({ ...value.fault }),
    authority: Object.freeze({
      may_publish_terminal_fault: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
}

export function buildHalfkp81Depth18V1R11FrozenEnvironmentFaultForTests(
  value: Parameters<typeof v1r11EnvironmentFaultPreimage>[0] &
    Readonly<{
      powerLedger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      powerReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      faultPreimageSha256: string;
    }>,
): Readonly<Record<string, unknown>> {
  if (!SHA256_RE.test(value.faultPreimageSha256)) {
    throw new Error("v1r11 environment fault preimage digest differs");
  }
  const preimage = v1r11EnvironmentFaultPreimage(value);
  return Object.freeze({
    ...preimage,
    power_continuity_ledger: value.powerLedger,
    power_continuity_receipt: value.powerReceipt,
    fault_preimage_sha256: value.faultPreimageSha256,
  });
}

function terminalFaultPreimage(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  runFingerprint: string | null,
  message: string,
  completedParents: number,
  environmentFault: boolean,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schema: environmentFault
      ? HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_FAULT_SCHEMA
      : HALFKP81_DEPTH18_TEACHER_FAULT_SCHEMA,
    status: "terminal-fault-family-stopped",
    teacher_plan: authenticated.planIdentity,
    run_fingerprint: runFingerprint,
    completed_parents: completedParents,
    technical_faults: 1,
    incomplete_parents: authenticated.parents.length - completedParents,
    message,
    authority: {
      may_resume_same_family: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  });
}

async function publishTerminalFault(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  runFingerprint: string | null,
  message: string,
  completedParents: number,
  powerContinuity?: Readonly<{
    ledger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    launchAgentAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    preformalAuthority: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    environmentFault: boolean;
    faultPreimageSha256?: string;
    faultedAtUtc?: string;
  }>,
): Promise<void> {
  if (
    authenticated.planIdentity.schema ===
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 &&
    powerContinuity?.environmentFault
  ) {
    throw new Error(
      "v1r11 environment terminal fault publication is outer-supervisor-only",
    );
  }
  await publishCreateOnly(
    authenticated.outputs.terminal_fault_json,
    canonicalJsonLine({
      ...terminalFaultPreimage(
        authenticated,
        runFingerprint,
        message,
        completedParents,
        powerContinuity?.environmentFault ?? false,
      ),
      ...(powerContinuity === undefined
        ? {}
        : {
            power_continuity: {
              ledger: powerContinuity.ledger,
              receipt: powerContinuity.receipt,
              launchagent_authority: powerContinuity.launchAgentAuthority,
              preformal_authority: powerContinuity.preformalAuthority,
            },
          }),
    }),
  );
}

async function existingReceipt(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
): Promise<Halfkp81Depth18TeacherRunResult | undefined> {
  try {
    const raw = await readHeldStableFile(
      authenticated.outputs.receipt_json,
      "existing teacher receipt",
    );
    const receipt = parseCanonicalJson(raw, "existing teacher receipt");
    if (
      receipt.schema !== HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA ||
      receipt.completed_parents !== authenticated.parents.length
    ) {
      throw new Error("existing teacher receipt differs");
    }
    const outputs = receipt.outputs as Record<
      string,
      Halfkp81Depth18TeacherFileIdentity
    >;
    for (const role of ["fit", "tune", "sealed"] as const) {
      const artifact = await readHeldStableFile(
        authenticated.outputs[`${role}_jsonl`],
        `existing ${role} artifact`,
      );
      assertIdentity(
        outputs[role],
        fileIdentity(authenticated.outputs[`${role}_jsonl`], artifact),
        `${role} artifact`,
      );
    }
    return {
      receipt: Object.freeze(receipt),
      receiptIdentity: Object.freeze(
        fileIdentity(authenticated.outputs.receipt_json, raw),
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function runHalfkp81Depth18TeacherCoreForTests(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  dependencies: Readonly<Halfkp81Depth18TeacherRunnerDependencies> = {},
  contract: Readonly<Halfkp81Depth18TeacherCoreContract> = {
    parentCount: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
    roleCounts: HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
    milestones: HALFKP81_DEPTH18_TEACHER_MILESTONES,
    maximumRows: EXPECTED_TEACHER.maximum_rows,
  },
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const stablePolicy = dependencies.stablePolicy ?? "required-depth11-v2";
  const recoveryV1R5 =
    authenticated.planIdentity.schema ===
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5;
  const recoveryV1R6 =
    authenticated.planIdentity.schema ===
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6;
  const recoveryV1R9 =
    authenticated.planIdentity.schema ===
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9;
  const recoveryV1R11 =
    authenticated.planIdentity.schema ===
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11;
  const v1r11PowerTestHarness =
    authenticated.planIdentity.schema ===
    HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA;
  const v1r11PowerProtocol = recoveryV1R11 || v1r11PowerTestHarness;
  const recoveryV1R9Protocol = recoveryV1R9 || v1r11PowerProtocol;
  const fallbackTimeoutRecoveryTestHarness =
    recoveryV1R9 &&
    trustedFallbackTimeoutRecoveryTestPlans.has(authenticated as object);
  if (
    (v1r11PowerProtocol && dependencies.startPowerContinuity === undefined) ||
    (!v1r11PowerProtocol && dependencies.startPowerContinuity !== undefined) ||
    (recoveryV1R11 &&
      (dependencies.v1r11FormalAuthority === undefined ||
        dependencies.expectedV1R11RunFingerprint === undefined ||
        !SHA256_RE.test(dependencies.expectedV1R11RunFingerprint) ||
        !trustedV1R11FormalAuthorities.has(
          dependencies.v1r11FormalAuthority as object,
        ))) ||
    (!recoveryV1R11 &&
      (dependencies.v1r11FormalAuthority !== undefined ||
        dependencies.expectedV1R11RunFingerprint !== undefined))
  ) {
    throw new Error(
      "power-continuity guardian and trusted live LaunchAgent capability are mandatory only for Yaneura-only v1r11",
    );
  }
  const v1r11Authority = recoveryV1R11
    ? dependencies.v1r11FormalAuthority!
    : v1r11PowerTestHarness
      ? Object.freeze({
          plannedFinalDescriptor: Object.freeze({
            path: path.join(
              authenticated.outputs.directory,
              ".v1r11-power-test-planned-final-descriptor.plist",
            ),
            bytes: 0,
            sha256: "0".repeat(64),
            schema: "application/x-apple-aspen-config-exact-bytes",
          }),
          launchAgentEvidence: Object.freeze({
            path: path.join(
              authenticated.outputs.directory,
              ".v1r11-power-test-launchagent-evidence.json",
            ),
            bytes: 0,
            sha256: "0".repeat(64),
            schema:
              "shogi-halfkp81-depth18-v1r11-power-test-launchagent-evidence-v1",
          }),
          verifiedPreformalAuthority: Object.freeze({
            path: path.join(
              authenticated.outputs.directory,
              ".v1r11-power-test-preformal-authority.json",
            ),
            bytes: 0,
            sha256: "0".repeat(64),
            schema:
              "shogi-halfkp81-depth18-v1r11-power-test-preformal-authority-v1",
          }),
          preformalLedger: Object.freeze({
            path: path.join(
              authenticated.outputs.directory,
              ".v1r11-power-test-preformal-ledger.jsonl",
            ),
            bytes: 0,
            sha256: "0".repeat(64),
            schema:
              "shogi-halfkp81-depth18-v1r11-power-test-preformal-ledger-v1",
          }),
          preformalRawReceipt: Object.freeze({
            path: path.join(
              authenticated.outputs.directory,
              ".v1r11-power-test-preformal-raw-receipt.json",
            ),
            bytes: 0,
            sha256: "0".repeat(64),
            schema:
              "shogi-halfkp81-depth18-v1r11-power-test-preformal-raw-receipt-v1",
          }),
        })
      : undefined;
  const fallbackTimeoutRecoveryAuthorized =
    dependencies.fallbackTimeoutRecoveryPolicy ===
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY &&
    (fallbackTimeoutRecoveryTestHarness ||
      (recoveryV1R11 &&
        v1r11FallbackTimeoutRecoveryPlanIsAuthorized(
          authenticated.plan as Readonly<Record<string, unknown>>,
        )));
  if (
    recoveryV1R5 &&
    (stablePolicy !== "yaneuraou-only-v1" ||
      dependencies.processes !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES ||
      dependencies.parentTimeoutMs !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS ||
      dependencies.parentDeadlinePolicy !== "per-search-only")
  ) {
    throw new Error(
      "Yaneura-only v1r5 requires four persistent engines, 3600000ms per-search timeout, and no aggregate parent race",
    );
  }
  if (
    recoveryV1R6 &&
    (stablePolicy !== "yaneuraou-only-v1" ||
      dependencies.processes !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES ||
      dependencies.parentTimeoutMs !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS ||
      dependencies.parentDeadlinePolicy !== "per-search-only" ||
      dependencies.resetTimeoutRecoveryPolicy !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY)
  ) {
    throw new Error(
      "Yaneura-only v1r6 requires four persistent engines, 3600000ms per-search timeout, no aggregate parent race, and one reset-timeout engine recycle",
    );
  }
  if (
    recoveryV1R9Protocol &&
    (stablePolicy !== "yaneuraou-only-v1" ||
      dependencies.processes !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PROCESSES ||
      dependencies.parentTimeoutMs !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS ||
      dependencies.parentDeadlinePolicy !== "per-search-only" ||
      dependencies.resetTimeoutRecoveryPolicy !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY ||
      (recoveryV1R11 && !fallbackTimeoutRecoveryAuthorized))
  ) {
    throw new Error(
      "Yaneura-only v1r9 requires eight Hash512 normal engines, 14400000ms per-search timeout, no aggregate parent race, one typed reset recycle per route, and FIFO Hash8192 fallback concurrency two",
    );
  }
  if (
    dependencies.fallbackTimeoutRecoveryPolicy !== undefined &&
    dependencies.fallbackTimeoutRecoveryPolicy !== "fatal" &&
    !fallbackTimeoutRecoveryAuthorized
  ) {
    throw new Error(
      "fallback timeout deferral is authorized only for the Yaneura-only Hash8192 fallback protocol",
    );
  }
  if (
    !recoveryV1R6 &&
    !recoveryV1R9Protocol &&
    dependencies.resetTimeoutRecoveryPolicy !== undefined &&
    dependencies.resetTimeoutRecoveryPolicy !== "fatal"
  ) {
    throw new Error(
      "reset-timeout engine recycle is authorized only for Yaneura-only v1r6/v1r9",
    );
  }
  if (
    authenticated.parents.length !== contract.parentCount ||
    canonicalJson(
      Object.fromEntries(
        (["fit", "tune", "sealed"] as const).map((role) => [
          role,
          authenticated.parents.filter(
            (parent) => authenticated.roles.get(parent.parent_id) === role,
          ).length,
        ]),
      ),
    ) !== canonicalJson(contract.roleCounts)
  ) {
    throw new Error(
      "authenticated parent or role count differs from the execution contract",
    );
  }
  try {
    await fs.promises.lstat(authenticated.outputs.terminal_fault_json);
    throw new Error(
      "terminal fault already exists; this family may not resume",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (recoveryV1R11) {
    try {
      await fs.promises.lstat(authenticated.outputs.receipt_json);
      throw new Error(
        "v1r11 existing receipt must be handled by the independent continuity verifier",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const priorReceipt = recoveryV1R11
    ? undefined
    : await existingReceipt(authenticated);
  if (priorReceipt !== undefined) return priorReceipt;
  const repositoryRoot = path.resolve(__dirname, "..");
  const fixedAssets =
    dependencies.authenticateFixedAssets === undefined
      ? await (async () => {
          const binary = await authenticateFixedFile(
            authenticated.engine.binary,
            "YaneuraOu binary",
          );
          const evalFile = await authenticateFixedFile(
            authenticated.engine.eval_file,
            "YaneuraOu eval",
          );
          const engineReceipt = await authenticateEngineReceipt(
            repositoryRoot,
            binary,
          );
          return { binary, evalFile, engineReceipt };
        })()
      : await dependencies.authenticateFixedAssets(authenticated);
  const { binary, evalFile, engineReceipt } = fixedAssets;
  const yaneuraOnly = stablePolicy === "yaneuraou-only-v1";
  let stable: Halfkp81Depth18TeacherStableRuntime | undefined;
  if (!yaneuraOnly) {
    const makeStable = dependencies.createStableRuntime ?? defaultStableRuntime;
    try {
      stable = await makeStable();
    } catch (error) {
      await publishTerminalFault(
        authenticated,
        null,
        error instanceof Error ? error.message : String(error),
        0,
      ).catch(() => undefined);
      throw error;
    }
  }
  let stableClosed = false;
  let runtimeRoot: string | undefined;
  let header: Halfkp81Depth18TeacherWorkHeader | undefined;
  let entries = new Map<string, Halfkp81Depth18TeacherWorkEntry>();
  let powerContinuity: Halfkp81Depth18PowerContinuitySession | undefined;
  let powerContinuityIdentities:
    | Readonly<{
        ledger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
        receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      }>
    | undefined;
  try {
    const fingerprintPayload = recoveryV1R11
      ? undefined
      : (() => {
          const fingerprintBase = {
            teacher_plan: authenticated.planIdentity,
            selection_jsonl: authenticated.selectionIdentity,
            selection_manifest: authenticated.selectionManifestIdentity,
            source_revision: authenticated.sourceRevision,
            engine: { binary, eval_file: evalFile, receipt: engineReceipt },
            teacher: authenticated.teacher,
            ...(v1r11PowerProtocol
              ? {
                  launchagent_authority: v1r11Authority!.launchAgentEvidence,
                  preformal_authority:
                    v1r11Authority!.verifiedPreformalAuthority,
                }
              : {}),
          };
          return yaneuraOnly
            ? {
                ...fingerprintBase,
                candidate_generation: recoveryV1R9Protocol
                  ? HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9
                  : HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
              }
            : {
                ...fingerprintBase,
                stable_runtime: {
                  receipt_sha256: (
                    stable as Readonly<Halfkp81Depth18TeacherStableRuntime>
                  ).receiptDigest,
                  receipt: (
                    stable as Readonly<Halfkp81Depth18TeacherStableRuntime>
                  ).receipt,
                },
              };
        })();
    const effectiveRunFingerprint = recoveryV1R11
      ? halfkp81V1R11FormalRunFingerprintV2({
          teacherPlan:
            authenticated.planIdentity as Required<Halfkp81Depth18TeacherFileIdentity>,
          selectionJsonl:
            authenticated.selectionIdentity as Required<Halfkp81Depth18TeacherFileIdentity>,
          selectionManifest:
            authenticated.selectionManifestIdentity as Required<Halfkp81Depth18TeacherFileIdentity>,
          sourceRevision: authenticated.sourceRevision,
          engine: {
            binary: Object.freeze({
              ...binary,
              schema: HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
            }),
            evalFile: Object.freeze({
              ...evalFile,
              schema: HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
            }),
            receipt:
              engineReceipt as Required<Halfkp81Depth18TeacherFileIdentity>,
          },
          teacherContract: authenticated.teacher,
          candidateContract:
            HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9,
          plannedFinalDescriptor: v1r11Authority!
            .plannedFinalDescriptor as Required<Halfkp81Depth18TeacherFileIdentity>,
        })
      : sha256(
          `${WORK_FINGERPRINT_DOMAIN}${canonicalJson(fingerprintPayload)}`,
        );
    if (recoveryV1R11) {
      assertHalfkp81Depth18V1R11RunnerVerifierFingerprintAgreementForTests(
        effectiveRunFingerprint,
        dependencies.expectedV1R11RunFingerprint!,
      );
    }
    if (dependencies.startPowerContinuity !== undefined) {
      powerContinuity = await dependencies.startPowerContinuity({
        teacherPlan: authenticated.planIdentity,
        sourceRevision: authenticated.sourceRevision,
        runFingerprint: effectiveRunFingerprint,
        launchAgentAuthority: v1r11Authority!.launchAgentEvidence,
        preformalAuthority: v1r11Authority!.verifiedPreformalAuthority,
      });
      await powerContinuity.assertHealthy();
    }
    header = recoveryV1R11
      ? buildHalfkp81Depth18V1R11FrozenWorkHeaderForTests({
          teacherPlan: authenticated.planIdentity,
          sourceRevision: authenticated.sourceRevision,
          runFingerprint: effectiveRunFingerprint,
          launchAgentAuthority: v1r11Authority!.launchAgentEvidence,
          verifiedPreformalAuthority:
            v1r11Authority!.verifiedPreformalAuthority,
          powerAdmissionEntry:
            powerContinuity?.admissionEntry ??
            (() => {
              throw new Error(
                "v1r11 power guardian did not return the frozen admission entry",
              );
            })(),
          openedAtUtc: new Date(
            dependencies.now?.() ?? Date.now(),
          ).toISOString(),
        })
      : {
          schema: yaneuraOnly
            ? yaneuraOnlyWorkSchema(authenticated.planIdentity.schema)
            : HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA,
          kind: "header",
          run_fingerprint: effectiveRunFingerprint,
          ...fingerprintPayload!,
          label_policy: SIBLING_TEACHER_LABEL_POLICY,
        };
    const parentMap = new Map(
      authenticated.parents.map(
        (parent) => [parent.parent_id, parent] as const,
      ),
    );
    if (recoveryV1R11) {
      await importHalfkp81Depth18V1R11MinimalR13CompletedSetIntoR14({
        repositoryRoot,
        targetWorkPath: authenticated.outputs.work_jsonl,
        targetHeader: header as unknown as Readonly<Record<string, unknown>>,
        targetRunFingerprint: effectiveRunFingerprint,
        selectionOrderedParentIds: authenticated.parents.map(
          (parent) => parent.parent_id,
        ),
        authorityDirectory:
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY,
      });
    }
    entries = await initializeWork(
      authenticated.outputs.work_jsonl,
      header,
      parentMap,
      authenticated.roles,
      stablePolicy,
      fallbackTimeoutRecoveryAuthorized,
    );
    const publishedMilestones = new Set<number>();
    await publishReadyMilestones(
      authenticated,
      contract,
      header,
      entries,
      publishedMilestones,
    );
    runtimeRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-depth18-teacher-"),
    );
    await fs.promises.chmod(runtimeRoot, 0o700);
    await runWorkers(
      authenticated,
      header,
      stable,
      entries,
      dependencies,
      contract,
      runtimeRoot,
      publishedMilestones,
      fallbackTimeoutRecoveryAuthorized,
      powerContinuity,
    );
    if (entries.size !== contract.parentCount) {
      throw new Error(
        `formal work is incomplete: ${entries.size}/${contract.parentCount} parents`,
      );
    }
    await powerContinuity?.assertHealthy(true);
    powerContinuityIdentities = await powerContinuity?.finalizeSuccess();
    const artifacts = {} as Record<
      Halfkp81Depth18TeacherRole,
      {
        identity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
        rows: number;
        parents: number;
      }
    >;
    for (const role of ["fit", "tune", "sealed"] as const) {
      const artifact = roleArtifactBytes(role, authenticated, entries);
      if (artifact.parents !== contract.roleCounts[role]) {
        throw new Error(`${role} parent count differs`);
      }
      artifacts[role] = {
        ...artifact,
        identity: await publishCreateOnly(
          authenticated.outputs[`${role}_jsonl`],
          artifact.bytes,
        ),
      };
    }
    const completedRows = Object.values(artifacts).reduce(
      (sum, artifact) => sum + artifact.rows,
      0,
    );
    if (
      completedRows < 2 * contract.parentCount ||
      completedRows > contract.maximumRows ||
      (["fit", "tune", "sealed"] as const).some(
        (role) => artifacts[role].rows < 2 * artifacts[role].parents,
      )
    ) {
      throw new Error(
        "completed teacher row count is outside the sealed bounds",
      );
    }
    const receipt = recoveryV1R11
      ? await (async () => {
          if (powerContinuityIdentities === undefined) {
            throw new Error("v1r11 success lacks a closed power interval");
          }
          const workRaw = await readHeldStableFile(
            authenticated.outputs.work_jsonl,
            "v1r11 completed teacher work",
          );
          const teacherWork = v1r11FullIdentity(
            fileIdentity(authenticated.outputs.work_jsonl, workRaw),
            HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
          );
          const teacherOutput = Object.fromEntries(
            (["fit", "tune", "sealed"] as const).map((role) => [
              role,
              v1r11FullIdentity(
                artifacts[role].identity,
                HALFKP81_DEPTH18_V1R11_DATASET_SCHEMA,
              ),
            ]),
          ) as Record<
            Halfkp81Depth18TeacherRole,
            Readonly<Halfkp81Depth18TeacherFileIdentity>
          >;
          return buildHalfkp81Depth18V1R11FrozenRawReceiptForTests({
            teacherPlan: authenticated.planIdentity,
            sourceRevision: authenticated.sourceRevision,
            runFingerprint: header!.run_fingerprint,
            teacherWork,
            teacherOutput,
            preformalLedger: v1r11Authority!.preformalLedger,
            preformalRawReceipt: v1r11Authority!.preformalRawReceipt,
            verifiedPreformalAuthority:
              v1r11Authority!.verifiedPreformalAuthority,
            launchAgentAuthority: v1r11Authority!.launchAgentEvidence,
            powerLedger: powerContinuityIdentities.ledger,
            powerReceipt: powerContinuityIdentities.receipt,
            finalizer: v1r11ImplementationIdentityFromRevision(
              repositoryRoot,
              authenticated.sourceRevision,
              "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
            ),
          });
        })()
      : {
          schema: HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA,
          status: "structurally-complete-awaiting-artifact-verification",
          teacher_plan: authenticated.planIdentity,
          completed_parents: contract.parentCount,
          completed_rows: completedRows,
          role_parents: Object.fromEntries(
            (["fit", "tune", "sealed"] as const).map((role) => [
              role,
              artifacts[role].parents,
            ]),
          ),
          role_rows: Object.fromEntries(
            (["fit", "tune", "sealed"] as const).map((role) => [
              role,
              artifacts[role].rows,
            ]),
          ),
          depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
          technical_faults: 0,
          incomplete_parents: 0,
          old_depth12_targets: 0,
          ...(recoveryV1R9Protocol
            ? {
                hash8192_fallback_recount: v1r9RouteAccounting(
                  entries.values(),
                ),
              }
            : {}),
          outputs: Object.fromEntries(
            (["fit", "tune", "sealed"] as const).map((role) => [
              role,
              artifacts[role].identity,
            ]),
          ),
          artifact_verification: {
            held_descriptor_content_scan: false,
            actual_bytes_sha256_rows_recomputed: false,
            selected_parent_role_membership_recomputed: false,
            every_target_depth18_recomputed: false,
            old_depth12_target_absence_recomputed: false,
          },
          authority: {
            may_build_training_plan: false,
            may_train: false,
            may_play_formal_games: false,
            may_write_live_weights: false,
          },
        };
    if (stable !== undefined) {
      await stable.close();
      stableClosed = true;
    }
    await authenticateFixedFile(binary, "YaneuraOu binary postflight");
    await authenticateFixedFile(evalFile, "YaneuraOu eval postflight");
    await authenticateFixedFile(engineReceipt, "YaneuraOu receipt postflight");
    // Receipt publication is intentionally the final write.
    const receiptBytes = canonicalJsonLine(receipt);
    const receiptIdentity = await publishCreateOnly(
      authenticated.outputs.receipt_json,
      receiptBytes,
    );
    return {
      receipt: Object.freeze(receipt),
      receiptIdentity,
    };
  } catch (error) {
    let effectiveError =
      error instanceof Error ? error : new Error(String(error));
    let environmentFault =
      effectiveError instanceof Halfkp81Depth18EnvironmentContinuityError;
    let environmentFaultPreimageSha256: string | undefined;
    let environmentFaultedAtUtc: string | undefined;
    if (
      powerContinuity !== undefined &&
      powerContinuityIdentities === undefined
    ) {
      try {
        await powerContinuity.assertHealthy(true);
      } catch (continuityError) {
        effectiveError =
          continuityError instanceof Error
            ? continuityError
            : new Halfkp81Depth18EnvironmentContinuityError(
                String(continuityError),
              );
        environmentFault = true;
      }
      try {
        if (environmentFault) {
          environmentFaultedAtUtc = new Date(
            dependencies.now?.() ?? Date.now(),
          ).toISOString();
          const preimage = recoveryV1R11
            ? buildHalfkp81Depth18V1R11EnvironmentFaultIntentForTests({
                teacherPlan: authenticated.planIdentity,
                sourceRevision: authenticated.sourceRevision,
                runFingerprint: header?.run_fingerprint ?? null,
                verifiedPreformalAuthority:
                  v1r11Authority!.verifiedPreformalAuthority,
                launchAgentAuthority: v1r11Authority!.launchAgentEvidence,
                fault: Object.freeze({
                  kind: "environment-continuity",
                  message: effectiveError.message,
                }),
              })
            : terminalFaultPreimage(
                authenticated,
                header?.run_fingerprint ?? null,
                effectiveError.message,
                entries.size,
                true,
              );
          environmentFaultPreimageSha256 = sha256(canonicalJson(preimage));
          powerContinuityIdentities = await powerContinuity.finalizeFault(
            effectiveError.message,
            environmentFaultPreimageSha256,
          );
        } else {
          // This closes a clean power interval; the subsequently published
          // teacher terminal fault remains technical, not environmental.
          powerContinuityIdentities = await powerContinuity.finalizeSuccess();
        }
      } catch (finalizationError) {
        // A dead or hung guardian cannot authenticate a closed continuity
        // interval. Preserve a durable, non-authoritative family stop without
        // pretending the incomplete power ledger passed verification.
        effectiveError = new Error(
          `power guardian terminal closure failed after ${
            environmentFault ? "environment" : "teacher"
          } fault (${effectiveError.message}): ${
            finalizationError instanceof Error
              ? finalizationError.message
              : String(finalizationError)
          }`,
        );
        environmentFault = false;
        powerContinuityIdentities = undefined;
      }
    }
    const message = effectiveError.message;
    if (recoveryV1R11 && environmentFault) {
      // The guardian has durably closed the power ledger/receipt after every
      // engine reap. The outer LaunchAgent supervisor now owns service stop,
      // rich cleanup, independent revalidation and the sole terminal-fault
      // publication. Exiting nonzero is the handoff; publishing here would
      // race cleanup and create an unauthenticated environmental claim.
      throw effectiveError;
    }
    await publishTerminalFault(
      authenticated,
      header?.run_fingerprint ?? null,
      message,
      entries.size,
      powerContinuityIdentities === undefined
        ? undefined
        : {
            ...powerContinuityIdentities,
            launchAgentAuthority: v1r11Authority!.launchAgentEvidence,
            preformalAuthority: v1r11Authority!.verifiedPreformalAuthority,
            environmentFault,
            ...(environmentFaultPreimageSha256 === undefined
              ? {}
              : { faultPreimageSha256: environmentFaultPreimageSha256 }),
            ...(environmentFaultedAtUtc === undefined
              ? {}
              : { faultedAtUtc: environmentFaultedAtUtc }),
          },
    );
    throw effectiveError;
  } finally {
    await powerContinuity?.close().catch(() => undefined);
    if (!stableClosed && stable !== undefined) {
      await stable.close().catch(() => undefined);
    }
    if (runtimeRoot !== undefined) {
      await fs.promises.rm(runtimeRoot, { recursive: true, force: true });
    }
  }
}

/** Integration-only seam for the closed v1r9 fixture; production v1r9 stays fatal. */
export async function runHalfkp81Depth18FallbackTimeoutRecoveryCoreForTests(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  dependencies: Readonly<Halfkp81Depth18TeacherRunnerDependencies>,
  contract: Readonly<Halfkp81Depth18TeacherCoreContract>,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
  ) {
    throw new Error("fallback timeout recovery test seam requires v1r9");
  }
  trustedFallbackTimeoutRecoveryTestPlans.add(authenticated as object);
  try {
    return await runHalfkp81Depth18TeacherCoreForTests(
      authenticated,
      {
        ...dependencies,
        fallbackTimeoutRecoveryPolicy:
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY,
      },
      contract,
    );
  } finally {
    trustedFallbackTimeoutRecoveryTestPlans.delete(authenticated as object);
  }
}

function yaneuraOnlyPreflightOutputs(
  outputDirectory: string,
): Halfkp81Depth18AuthenticatedTeacherPlan["outputs"] {
  const directory = path.resolve(outputDirectory);
  return Object.freeze({
    directory,
    plan_json: path.join(directory, "teacher-plan.json"),
    fit_jsonl: path.join(directory, "fit.jsonl"),
    tune_jsonl: path.join(directory, "tune.jsonl"),
    sealed_jsonl: path.join(directory, "sealed.jsonl"),
    work_jsonl: path.join(directory, "teacher-work.jsonl"),
    milestone_100_json: path.join(directory, "teacher-milestone-100.json"),
    milestone_500_json: path.join(directory, "teacher-milestone-500.json"),
    terminal_fault_json: path.join(directory, "teacher-terminal-fault.json"),
    receipt_json: path.join(directory, "teacher-receipt.json"),
    verified_artifact_receipt_json: path.join(
      directory,
      "teacher-verified-artifact-receipt.json",
    ),
  });
}

function yaneuraOnlyPreflightSelection(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  roleCounts: Readonly<Record<Halfkp81Depth18TeacherRole, number>>,
): Readonly<{
  parents: readonly Readonly<FloodgateTrainingParent>[];
  rows: readonly Readonly<Halfkp81Depth18SelectionRow>[];
  roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>;
}> {
  if (
    authenticated.selectionRows.length !== authenticated.parents.length ||
    authenticated.parents.some(
      (parent, index) =>
        authenticated.selectionRows[index]?.game_id !== parent.game_id ||
        authenticated.selectionRows[index]?.sfen !== parent.parent_sfen ||
        authenticated.selectionRows[index]?.recorded_move !==
          parent.played_move ||
        authenticated.selectionRows[index]?.role !==
          authenticated.roles.get(parent.parent_id),
    )
  ) {
    throw new Error(
      "authenticated selection rows are not aligned with preflight parents",
    );
  }
  const remaining = { ...roleCounts };
  const selectedIndexes: number[] = [];
  authenticated.parents.forEach((parent, index) => {
    const role = authenticated.roles.get(parent.parent_id);
    if (role !== undefined && remaining[role] > 0) {
      selectedIndexes.push(index);
      remaining[role] -= 1;
    }
  });
  if (
    (["fit", "tune", "sealed"] as const).some((role) => remaining[role] !== 0)
  ) {
    throw new Error("authenticated selection cannot satisfy preflight roles");
  }
  const parents = selectedIndexes.map(
    (index) =>
      authenticated.parents[index] as Readonly<FloodgateTrainingParent>,
  );
  const rows = selectedIndexes.map(
    (index) =>
      authenticated.selectionRows[
        index
      ] as Readonly<Halfkp81Depth18SelectionRow>,
  );
  const roles = new Map(
    parents.map((parent) => [
      parent.parent_id,
      authenticated.roles.get(parent.parent_id) as Halfkp81Depth18TeacherRole,
    ]),
  );
  return Object.freeze({
    parents: Object.freeze(parents),
    rows: Object.freeze(rows),
    roles,
  });
}

function validateYaneuraOnlyPreflightWork(
  raw: Buffer,
  authenticated: Readonly<
    Pick<Halfkp81Depth18AuthenticatedTeacherPlan, "planIdentity" | "parents">
  >,
): Readonly<{
  parents: number;
  rows: number;
  requestedMultipvHistogram: Readonly<Record<string, number>>;
}> {
  const expectedWorkSchema = yaneuraOnlyWorkSchema(
    authenticated.planIdentity.schema,
  );
  if (raw.byteLength === 0 || raw.at(-1) !== 0x0a) {
    throw new Error("preflight work must be nonempty LF-terminated JSONL");
  }
  const lines = raw.toString("utf8").slice(0, -1).split("\n");
  const values = lines.map((line, index) => {
    const value = JSON.parse(line) as Record<string, unknown>;
    if (canonicalJson(value) !== line) {
      throw new Error(`preflight work line ${index + 1} is not canonical`);
    }
    return value;
  });
  const header = values[0];
  if (
    header?.schema !== expectedWorkSchema ||
    header.kind !== "header" ||
    Object.hasOwn(header, "stable_runtime") ||
    canonicalJson(header.candidate_generation) !==
      canonicalJson(HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1)
  ) {
    throw new Error("preflight work header violates Yaneura-only policy");
  }
  const parentMap = new Map(
    authenticated.parents.map((parent) => [parent.parent_id, parent] as const),
  );
  let rows = 0;
  const requestedMultipvHistogram: Record<string, number> = {};
  const seen = new Set<string>();
  for (const [offset, wrapper] of values.slice(1).entries()) {
    const parentId = wrapper.parent_id;
    const parent =
      typeof parentId === "string" ? parentMap.get(parentId) : undefined;
    const entry = wrapper.teacher_entry as
      Readonly<CompletedWorkEntry> | undefined;
    if (
      wrapper.schema !== expectedWorkSchema ||
      wrapper.kind !== "parent" ||
      parent === undefined ||
      seen.has(parent.parent_id) ||
      Object.hasOwn(wrapper, "stable_result") ||
      canonicalJson(wrapper.candidate_generation) !==
        canonicalJson(HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1) ||
      entry === undefined
    ) {
      throw new Error(
        `preflight work parent line ${offset + 2} violates Yaneura-only policy`,
      );
    }
    seen.add(parent.parent_id);
    const records = entry.records;
    if (records.length < 2 || records.length > 13) {
      throw new Error("preflight parent row count is outside 2..13");
    }
    const legal = new Set(
      rulesCompleteLegalMoves(
        positionFromSfen(parent.parent_sfen).position,
      ).map((move) => move.usi),
    );
    const recordMoves = records.map((record) => record.move);
    const exactSearches = entry.exact_search.searches;
    const exactMoves = exactSearches.map((search) => search.moves[0]);
    const candidateMoves = [...entry.candidate_moves];
    const initialMoves = [...entry.initial_search.moves];
    const played = records.find((record) => record.move === parent.played_move);
    const expectedInitialMultipv =
      expectedHalfkp81Depth18YaneuraOnlyInitialMultipv(legal.size);
    if (
      entry.initial_search.requested_multipv !== expectedInitialMultipv ||
      initialMoves.length !== expectedInitialMultipv ||
      entry.initial_search.scores.length !== expectedInitialMultipv ||
      new Set(initialMoves).size !== initialMoves.length ||
      initialMoves.some((move) => !legal.has(move)) ||
      canonicalJson(entry.initial_search.requested_limit) !==
        canonicalJson({ depth: 16 }) ||
      exactSearches.length !== records.length ||
      exactSearches.some(
        (search) =>
          search.moves.length !== 1 ||
          canonicalJson(search.requested_limit) !==
            canonicalJson({ depth: 18 }),
      ) ||
      new Set(recordMoves).size !== records.length ||
      recordMoves.some((move) => !legal.has(move)) ||
      canonicalJson([...candidateMoves].sort(compareBytewise)) !==
        canonicalJson([...recordMoves].sort(compareBytewise)) ||
      canonicalJson([...recordMoves].sort(compareBytewise)) !==
        canonicalJson([...exactMoves].sort(compareBytewise)) ||
      records.some((record) =>
        record.sources.some(
          (source) => source !== "teacher" && source !== "played",
        ),
      ) ||
      played === undefined ||
      !played.sources.includes("played")
    ) {
      throw new Error(
        `preflight parent ${parent.parent_id} search or legal-row evidence differs`,
      );
    }
    requestedMultipvHistogram[String(expectedInitialMultipv)] =
      (requestedMultipvHistogram[String(expectedInitialMultipv)] ?? 0) + 1;
    rows += records.length;
  }
  if (seen.size !== authenticated.parents.length) {
    throw new Error("preflight work does not cover every selected parent");
  }
  return Object.freeze({
    parents: seen.size,
    rows,
    requestedMultipvHistogram: Object.freeze({
      ...requestedMultipvHistogram,
    }),
  });
}

export function validateHalfkp81Depth18YaneuraOnlyPreflightWorkCoreForTests(
  raw: Buffer,
  authenticated: Readonly<
    Pick<Halfkp81Depth18AuthenticatedTeacherPlan, "planIdentity" | "parents">
  >,
): ReturnType<typeof validateYaneuraOnlyPreflightWork> {
  return validateYaneuraOnlyPreflightWork(raw, authenticated);
}

export function diagnoseHalfkp81Depth18YaneuraOnlyV1R3PreflightCoreForTests(
  workRaw: Buffer,
  selectionRaw: Buffer,
): Readonly<{
  parents: number;
  rows: number;
  requestedMultipvHistogram: Readonly<Record<string, number>>;
  clampedParents: number;
  candidateRecordExactAlignment: true;
}> {
  const selection = validateSelectionRows(
    selectionRaw,
    HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
    HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
  );
  const remaining = {
    ...HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_ROLE_COUNTS,
  };
  const parents = selection.parents.filter((parent) => {
    const role = selection.roles.get(parent.parent_id);
    if (role === undefined || remaining[role] === 0) return false;
    remaining[role] -= 1;
    return true;
  });
  if (
    parents.length !==
      Object.values(
        HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_ROLE_COUNTS,
      ).reduce((total, count) => total + count, 0) ||
    Object.values(remaining).some((count) => count !== 0)
  ) {
    throw new Error("v1r3 diagnostic selection cannot satisfy fixed roles");
  }
  const verified = validateYaneuraOnlyPreflightWork(workRaw, {
    planIdentity: {
      path: "read-only-v1r3-diagnostic",
      bytes: 0,
      sha256: "0".repeat(64),
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3,
    },
    parents,
  });
  const lines = workRaw.toString("utf8").trimEnd().split("\n").slice(1);
  for (const [offset, line] of lines.entries()) {
    const wrapper = JSON.parse(line) as Halfkp81Depth18TeacherWorkEntry;
    const entry = wrapper.teacher_entry;
    const candidates = [...entry.candidate_moves].sort(compareBytewise);
    const records = entry.records
      .map((record) => record.move)
      .sort(compareBytewise);
    const exact = entry.exact_search.searches
      .map((search) => search.moves[0])
      .sort(compareBytewise);
    if (
      canonicalJson(candidates) !== canonicalJson(records) ||
      canonicalJson(candidates) !== canonicalJson(exact)
    ) {
      throw new Error(
        `v1r3 diagnostic line ${offset + 2} candidate/record/exact-search alignment differs`,
      );
    }
  }
  return Object.freeze({
    ...verified,
    clampedParents: Object.entries(verified.requestedMultipvHistogram).reduce(
      (total, [requested, count]) =>
        total +
        (Number(requested) < HALFKP81_DEPTH18_TEACHER_MULTIPV ? count : 0),
      0,
    ),
    candidateRecordExactAlignment: true,
  });
}

export interface Halfkp81Depth18YaneuraOnlyPreflightResult {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
}

async function initializeHalfkp81Depth18YaneuraOnlyPreflightDirectory(
  outputDirectory: string,
  familyLabel: string,
  effectiveUserId = typeof process.getuid === "function"
    ? process.getuid()
    : undefined,
): Promise<string> {
  const directory = path.resolve(outputDirectory);
  if (!path.isAbsolute(outputDirectory) || directory !== outputDirectory) {
    throw new Error(
      `${familyLabel} preflight output directory must be a normalized absolute path`,
    );
  }
  try {
    const existing = await fs.promises.lstat(directory);
    if (existing.isSymbolicLink()) {
      throw new Error(
        `${familyLabel} preflight output directory must not be a symlink`,
      );
    }
    if (!existing.isDirectory()) {
      throw new Error(
        `${familyLabel} preflight output directory must not be an existing non-directory`,
      );
    }
    if ((existing.mode & 0o777) !== 0o700) {
      throw new Error(
        `${familyLabel} preflight output directory existing mode must be 0700`,
      );
    }
    if (effectiveUserId !== undefined && existing.uid !== effectiveUserId) {
      throw new Error(
        `${familyLabel} preflight output directory existing owner differs`,
      );
    }
    if ((await fs.promises.readdir(directory)).length !== 0) {
      throw new Error(
        `${familyLabel} preflight output directory existing directory must be empty`,
      );
    }
    throw new Error(
      `${familyLabel} preflight output directory must be absent before create-only initialization`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await fs.promises.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    throw new Error(
      `${familyLabel} preflight output directory create-only initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const created = await fs.promises.lstat(directory);
  if (
    created.isSymbolicLink() ||
    !created.isDirectory() ||
    (created.mode & 0o777) !== 0o700 ||
    (effectiveUserId !== undefined && created.uid !== effectiveUserId) ||
    (await fs.promises.realpath(directory)) !== directory ||
    (await fs.promises.readdir(directory)).length !== 0
  ) {
    throw new Error(
      `${familyLabel} preflight output directory failed post-create authentication`,
    );
  }
  return directory;
}

export async function initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(
  outputDirectory: string,
  effectiveUserId = typeof process.getuid === "function"
    ? process.getuid()
    : undefined,
): Promise<string> {
  return initializeHalfkp81Depth18YaneuraOnlyPreflightDirectory(
    outputDirectory,
    "v1r4",
    effectiveUserId,
  );
}

export interface Halfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5Result {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
}

function assertV1R5PathologicalParent(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
): Readonly<FloodgateTrainingParent> {
  const index =
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT.selection_index_one_based -
    1;
  const parent = authenticated.parents[index];
  const fixed = HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT;
  if (
    parent === undefined ||
    parent.parent_id !== fixed.parent_id ||
    parent.parent_sfen !== fixed.sfen ||
    parent.played_move !== fixed.recorded_move
  ) {
    throw new Error(
      "v1r5 pathological parent binding differs at selection #2702",
    );
  }
  return parent;
}

export async function verifyHalfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  receiptPath = path.join(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_DIRECTORY,
    "pathological-preflight-receipt.json",
  ),
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const raw = await readHeldStableFile(
    receiptPath,
    "v1r5 pathological receipt",
  );
  const receipt = parseCanonicalJson(raw, "v1r5 pathological receipt");
  exactKeys(
    receipt,
    [
      "schema",
      "status",
      "scope",
      "formal_teacher_plan",
      "selection_source",
      "parent",
      "parallel_replicas",
      "search_timeout_ms",
      "parent_deadline_policy",
      "candidate_generation",
      "replicas",
      "process_cleanup",
      "authority",
    ],
    "v1r5 pathological receipt",
  );
  const replicas = receipt.replicas as readonly Readonly<
    Record<string, unknown>
  >[];
  const cleanup = receipt.process_cleanup as Record<string, unknown>;
  const authority = receipt.authority as Record<string, unknown>;
  if (
    receipt.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_RECEIPT_SCHEMA ||
    receipt.status !== "pathological-four-way-scratch-preflight-passed" ||
    receipt.scope !== "scratch-only-never-formal-training-data" ||
    canonicalJson(receipt.formal_teacher_plan) !==
      canonicalJson(authenticated.planIdentity) ||
    canonicalJson(receipt.selection_source) !==
      canonicalJson(authenticated.selectionIdentity) ||
    canonicalJson(receipt.parent) !==
      canonicalJson(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT) ||
    receipt.parallel_replicas !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES ||
    receipt.search_timeout_ms !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS ||
    receipt.parent_deadline_policy !==
      "per-search-only-no-aggregate-parent-race" ||
    canonicalJson(receipt.candidate_generation) !==
      canonicalJson(HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1) ||
    !Array.isArray(replicas) ||
    replicas.length !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES ||
    replicas.some((replica, index) => {
      exactKeys(
        replica,
        [
          "replica",
          "status",
          "duration_ms",
          "teacher_payload_sha256",
          "proposal_observed_nodes",
          "exact_total_observed_nodes",
          "exact_candidate_count",
        ],
        `v1r5 pathological replica ${index}`,
      );
      return (
        replica.replica !== index ||
        replica.status !== "complete" ||
        !Number.isSafeInteger(replica.duration_ms) ||
        (replica.duration_ms as number) <= 0 ||
        (replica.duration_ms as number) > 3_000_000 ||
        !SHA256_RE.test(String(replica.teacher_payload_sha256)) ||
        !Number.isSafeInteger(replica.proposal_observed_nodes) ||
        (replica.proposal_observed_nodes as number) <= 0 ||
        !Number.isSafeInteger(replica.exact_total_observed_nodes) ||
        (replica.exact_total_observed_nodes as number) <= 0 ||
        !Number.isSafeInteger(replica.exact_candidate_count) ||
        (replica.exact_candidate_count as number) < 2 ||
        (replica.exact_candidate_count as number) > 13
      );
    }) ||
    new Set(replicas.map((replica) => replica.teacher_payload_sha256)).size !==
      1 ||
    canonicalJson(cleanup) !==
      canonicalJson({
        engines_started: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
        engines_quit: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
        active_engines_at_receipt: 0,
      }) ||
    canonicalJson(authority) !==
      canonicalJson({
        may_replace_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("v1r5 pathological preflight receipt differs");
  }
  return Object.freeze(fileIdentity(receiptPath, raw));
}

export async function runHalfkp81Depth18YaneuraOnlyPathologicalPreflightCoreV1R5ForTests(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  outputDirectory: string,
  dependencies: Readonly<Halfkp81Depth18TeacherRunnerDependencies> = {},
): Promise<
  Readonly<Halfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5Result>
> {
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5
  ) {
    throw new Error("pathological preflight accepts only the v1r5 family");
  }
  const parent = assertV1R5PathologicalParent(authenticated);
  const directory = path.resolve(outputDirectory);
  if (
    directory === path.resolve(authenticated.outputs.directory) ||
    directory.startsWith(
      `${path.resolve(authenticated.outputs.directory)}${path.sep}`,
    )
  ) {
    throw new Error(
      "pathological preflight must be isolated from formal outputs",
    );
  }
  const receiptPath = path.join(
    directory,
    "pathological-preflight-receipt.json",
  );
  const faultPath = path.join(
    directory,
    "pathological-preflight-terminal-fault.json",
  );
  const repositoryRoot = path.resolve(__dirname, "..");
  const fixedAssets =
    dependencies.authenticateFixedAssets === undefined
      ? await (async () => {
          const binary = await authenticateFixedFile(
            authenticated.engine.binary,
            "pathological preflight YaneuraOu binary",
          );
          const evalFile = await authenticateFixedFile(
            authenticated.engine.eval_file,
            "pathological preflight YaneuraOu eval",
          );
          const engineReceipt = await authenticateEngineReceipt(
            repositoryRoot,
            binary,
          );
          return { binary, evalFile, engineReceipt };
        })()
      : await dependencies.authenticateFixedAssets(authenticated);
  const createEngine = dependencies.createEngine ?? defaultCreateEngine;
  const now = dependencies.now ?? Date.now;
  const diagnosticFingerprint = sha256(
    `${WORK_FINGERPRINT_DOMAIN}${canonicalJson({
      scope: "v1r5-pathological-four-way-scratch-preflight",
      teacher_plan: authenticated.planIdentity,
      selection: authenticated.selectionIdentity,
      parent: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT,
      processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
      timeout_ms: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
    })}`,
  );
  const parentMap = new Map([[parent.parent_id, parent] as const]);
  const runtimeRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "halfkp81-depth18-v1r5-pathological-"),
  );
  await fs.promises.chmod(runtimeRoot, 0o700);
  let engineStarts = 0;
  let engineQuits = 0;
  let activeEngines = 0;
  try {
    const replicas = await Promise.allSettled(
      Array.from(
        { length: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES },
        async (_unused, replica) => {
          const cwd = path.join(runtimeRoot, `replica-${replica}`);
          await fs.promises.mkdir(cwd, { mode: 0o700 });
          let engine: Halfkp81Depth18TeacherEngine | undefined;
          const started = now();
          try {
            engine = await createEngine({
              engineBin: fixedAssets.binary.path,
              evalDir: path.dirname(fixedAssets.evalFile.path),
              cwd,
              env: engineEnvironment(cwd),
              fvScale: 20,
              hashMb: HALFKP81_DEPTH18_TEACHER_HASH_MIB,
              timeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
            });
            engineStarts += 1;
            activeEngines += 1;
            const legalMoves = rulesCompleteLegalMoves(
              positionFromSfen(parent.parent_sfen).position,
            ).map((entry) => entry.usi);
            const raw = await labelSiblingParent(
              engine as UsiTeacherEngine,
              parent,
              HALFKP81_DEPTH18_TEACHER_MULTIPV,
              { depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH },
              legalMoves,
              { depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH },
            );
            const sealed = sealTeacherEntry(raw, diagnosticFingerprint);
            const verified = validateWorkEntry(
              sealed,
              diagnosticFingerprint,
              parentMap,
              `v1r5 pathological replica ${replica}`,
              HALFKP81_DEPTH18_TEACHER_MULTIPV,
              { depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH },
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
              { depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH },
            ) as CompletedWorkEntry;
            const durationMs = now() - started;
            if (
              !Number.isSafeInteger(durationMs) ||
              durationMs <= 0 ||
              durationMs > 3_000_000
            ) {
              throw new Error(
                `v1r5 pathological replica ${replica} duration ${durationMs}ms exceeds the fixed margin`,
              );
            }
            return Object.freeze({
              replica,
              status: "complete",
              duration_ms: durationMs,
              teacher_payload_sha256: verified.payload_sha256,
              proposal_observed_nodes: verified.initial_search.observed_nodes,
              exact_total_observed_nodes:
                verified.exact_search.total_observed_nodes,
              exact_candidate_count: verified.exact_search.candidate_count,
            });
          } catch (error) {
            throw new Error(
              `v1r5 pathological replica ${replica} failed: ${teacherFailureTelemetry(error)}`,
            );
          } finally {
            if (engine !== undefined) {
              try {
                await engine.quit();
              } finally {
                engineQuits += 1;
                activeEngines -= 1;
              }
            }
          }
        },
      ),
    );
    const rejected = replicas.find(
      (replica): replica is PromiseRejectedResult =>
        replica.status === "rejected",
    );
    if (rejected !== undefined) throw rejected.reason;
    const completed = replicas.map(
      (replica) =>
        (replica as PromiseFulfilledResult<Readonly<Record<string, unknown>>>)
          .value,
    );
    if (
      engineStarts !== HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES ||
      engineQuits !== engineStarts ||
      activeEngines !== 0 ||
      new Set(completed.map((replica) => replica.teacher_payload_sha256))
        .size !== 1
    ) {
      throw new Error(
        "v1r5 pathological replica determinism or cleanup differs",
      );
    }
    const receipt = Object.freeze({
      schema:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_RECEIPT_SCHEMA,
      status: "pathological-four-way-scratch-preflight-passed",
      scope: "scratch-only-never-formal-training-data",
      formal_teacher_plan: authenticated.planIdentity,
      selection_source: authenticated.selectionIdentity,
      parent: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT,
      parallel_replicas: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
      search_timeout_ms: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
      parent_deadline_policy: "per-search-only-no-aggregate-parent-race",
      candidate_generation:
        HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
      replicas: completed,
      process_cleanup: {
        engines_started: engineStarts,
        engines_quit: engineQuits,
        active_engines_at_receipt: activeEngines,
      },
      authority: {
        may_replace_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    const receiptIdentity = await publishCreateOnly(
      receiptPath,
      canonicalJsonLine(receipt),
    );
    return Object.freeze({ receipt, receiptIdentity });
  } catch (error) {
    await publishCreateOnly(
      faultPath,
      canonicalJsonLine({
        schema:
          "shogi-halfkp81-hard-depth18-yaneura-only-pathological-preflight-terminal-fault-v1r5",
        status: "pathological-scratch-preflight-failed-no-formal-authority",
        message: teacherFailureTelemetry(error),
        parent: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT,
        process_cleanup: {
          engines_started: engineStarts,
          engines_quit: engineQuits,
          active_engines_at_fault: activeEngines,
        },
        authority: {
          may_train: false,
          may_play_formal_games: false,
          may_write_live_weights: false,
        },
      }),
    ).catch(() => undefined);
    throw error;
  } finally {
    await fs.promises.rm(runtimeRoot, { recursive: true, force: true });
  }
}

export async function runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests(
  formal: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  outputDirectory: string,
  dependencies: Readonly<Halfkp81Depth18TeacherRunnerDependencies> = {},
  roleCounts: Readonly<
    Record<Halfkp81Depth18TeacherRole, number>
  > = HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_ROLE_COUNTS,
): Promise<Readonly<Halfkp81Depth18YaneuraOnlyPreflightResult>> {
  const recoveryV1R4 =
    formal.planIdentity.schema ===
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4;
  if (!recoveryV1R4) {
    throw new Error(
      "Yaneura-only preflight rejects closed or unrelated plan family; only v1r4 is authorized",
    );
  }
  const directory = path.resolve(outputDirectory);
  if (
    directory === path.resolve(formal.outputs.directory) ||
    directory.startsWith(`${path.resolve(formal.outputs.directory)}${path.sep}`)
  ) {
    throw new Error("preflight output must be isolated from formal outputs");
  }
  const preflightReceiptPath = path.join(directory, "preflight-receipt.json");
  const preflightFaultPath = path.join(
    directory,
    "preflight-terminal-fault.json",
  );
  for (const target of [preflightReceiptPath, preflightFaultPath]) {
    try {
      await fs.promises.lstat(target);
      throw new Error(`preflight create-only target already exists: ${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const selection = yaneuraOnlyPreflightSelection(formal, roleCounts);
  const outputs = yaneuraOnlyPreflightOutputs(directory);
  const authenticated = Object.freeze({
    ...formal,
    selectionRows: selection.rows,
    parents: selection.parents,
    roles: selection.roles,
    outputs,
  });
  const engineFactory = dependencies.createEngine ?? defaultCreateEngine;
  let engineStarts = 0;
  let engineQuits = 0;
  let activeEngines = 0;
  const createEngine = async (
    options: Readonly<UsiTeacherEngineOptions>,
  ): Promise<Halfkp81Depth18TeacherEngine> => {
    const engine = await engineFactory(options);
    engineStarts += 1;
    activeEngines += 1;
    let closed = false;
    return {
      resetForParent: () => engine.resetForParent(),
      search: (sfen, multipv, limit, searchmoves) =>
        engine.search(sfen, multipv, limit, searchmoves),
      quit: async () => {
        if (closed) return;
        closed = true;
        try {
          await engine.quit();
        } finally {
          engineQuits += 1;
          activeEngines -= 1;
        }
      },
    };
  };
  try {
    const result = await runHalfkp81Depth18TeacherCoreForTests(
      authenticated,
      {
        ...dependencies,
        createEngine,
        stablePolicy: "yaneuraou-only-v1",
      },
      {
        parentCount: selection.parents.length,
        roleCounts,
        milestones: selection.parents.length >= 500 ? [100, 500] : [],
        maximumRows: selection.parents.length * 13,
      },
    );
    if (activeEngines !== 0 || engineStarts !== engineQuits) {
      throw new Error(
        `preflight engine cleanup differs: starts=${engineStarts}, quits=${engineQuits}, active=${activeEngines}`,
      );
    }
    const workRaw = await readHeldStableFile(
      outputs.work_jsonl,
      "Yaneura-only preflight work",
    );
    const verified = validateYaneuraOnlyPreflightWork(workRaw, authenticated);
    const terminalFaultPresent = await fs.promises
      .lstat(outputs.terminal_fault_json)
      .then(() => true)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
    if (terminalFaultPresent) {
      throw new Error("preflight terminal fault exists after successful core");
    }
    const selectedParentIds = selection.parents.map(
      (parent) => parent.parent_id,
    );
    const receipt = Object.freeze({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_RECEIPT_SCHEMA,
      status: "scratch-preflight-passed-no-formal-authority",
      scope: "scratch-only-never-formal-training-data",
      formal_teacher_plan: formal.planIdentity,
      selection_source: formal.selectionIdentity,
      selection_method:
        "first-by-authenticated-selection-order-within-each-role",
      selected_parent_ids_sha256: sha256(selectedParentIds.join("\n")),
      selected_parents: selection.parents.length,
      role_parents: roleCounts,
      completed_rows: verified.rows,
      row_bounds_per_parent: { minimum: 2, maximum: 13 },
      candidate_generation:
        HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
      verification: {
        stable_runtime_factory_calls: 0,
        stable_calls: 0,
        stable_candidate_rows: 0,
        initial_yaneuraou_depth16_multipv_min_12_legal_moves: true,
        requested_multipv_histogram: verified.requestedMultipvHistogram,
        every_candidate_exact_depth18: true,
        every_recorded_move_present: true,
        every_row_legal: true,
        row_bounds_2_through_13: true,
        terminal_faults: 0,
      },
      process_cleanup: {
        engines_started: engineStarts,
        engines_quit: engineQuits,
        active_engines_at_receipt: activeEngines,
      },
      outputs: {
        work: fileIdentity(outputs.work_jsonl, workRaw),
        structural_receipt: result.receiptIdentity,
      },
      authority: {
        may_replace_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    const receiptIdentity = await publishCreateOnly(
      preflightReceiptPath,
      canonicalJsonLine(receipt),
    );
    return Object.freeze({ receipt, receiptIdentity });
  } catch (error) {
    const fault = {
      schema:
        "shogi-halfkp81-hard-depth18-yaneura-only-preflight-terminal-fault-v1r4",
      status: "scratch-preflight-failed-no-formal-authority",
      message: error instanceof Error ? error.message : String(error),
      selected_parents: selection.parents.length,
      process_cleanup: {
        engines_started: engineStarts,
        engines_quit: engineQuits,
        active_engines_at_fault: activeEngines,
      },
      authority: {
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    };
    await publishCreateOnly(preflightFaultPath, canonicalJsonLine(fault)).catch(
      () => undefined,
    );
    throw error;
  }
}

export async function runHalfkp81Depth18YaneuraOnlyPreflightV1(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18YaneuraOnlyPreflightResult>> {
  throw new Error(
    "Yaneura-only v1 preflight is closed and cannot create output; use v1r4",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyPreflightV1R2(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18YaneuraOnlyPreflightResult>> {
  throw new Error(
    "Yaneura-only v1r2 preflight is closed and cannot create output; use v1r4",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyPreflightV1R3(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18YaneuraOnlyPreflightResult>> {
  throw new Error(
    "Yaneura-only v1r3 preflight is closed and cannot create output; use v1r4",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyPreflightV1R4(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18YaneuraOnlyPreflightResult>> {
  throw new Error(
    "Yaneura-only v1r4 preflight is closed after the formal aggregate timeout; use the v1r5 pathological preflight",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5(
  planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH,
): Promise<
  Readonly<Halfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5Result>
> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5
  ) {
    throw new Error("Yaneura-only v1r5 preflight rejects another plan family");
  }
  await initializeHalfkp81Depth18YaneuraOnlyPreflightDirectory(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_DIRECTORY,
    "v1r5 pathological",
  );
  return runHalfkp81Depth18YaneuraOnlyPathologicalPreflightCoreV1R5ForTests(
    authenticated,
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_DIRECTORY,
  );
}

export async function runHalfkp81Depth18Teacher(
  planPath = HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  return runHalfkp81Depth18TeacherCoreForTests(authenticated);
}

export async function runHalfkp81Depth18BoundedStableTeacherV3(
  planPath = HALFKP81_DEPTH18_BOUNDED_STABLE_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA
  ) {
    throw new Error("bounded stable v3 runner rejects another plan family");
  }
  return runHalfkp81Depth18TeacherCoreForTests(authenticated, {
    createStableRuntime: defaultBoundedStableRuntimeV3,
    stablePolicy: "optional-bounded-depth11-v3",
  });
}

export async function runHalfkp81Depth18BoundedStableTeacherV3R2(
  planPath = HALFKP81_DEPTH18_BOUNDED_STABLE_V3R2_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2
  ) {
    throw new Error("bounded stable v3r2 runner rejects another plan family");
  }
  return runHalfkp81Depth18TeacherCoreForTests(authenticated, {
    createStableRuntime: defaultBoundedStableRuntimeV3,
    stablePolicy: "optional-bounded-depth11-v3",
  });
}

export async function runHalfkp81Depth18BoundedStableTeacherV3R3(
  planPath = HALFKP81_DEPTH18_BOUNDED_STABLE_V3R3_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3
  ) {
    throw new Error("bounded stable v3r3 runner rejects another plan family");
  }
  return runHalfkp81Depth18TeacherCoreForTests(authenticated, {
    createStableRuntime: defaultBoundedStableRuntimeV3,
    stablePolicy: "optional-bounded-depth11-v3",
  });
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  throw new Error(
    "Yaneura-only v1 formal runner is closed and cannot create output; use v1r4",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R2(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  throw new Error(
    "Yaneura-only v1r2 formal runner is closed and cannot create output; use v1r4",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R3(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  throw new Error(
    "Yaneura-only v1r3 formal runner is closed and cannot create output; use v1r4",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R4(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  throw new Error(
    "Yaneura-only v1r4 formal runner is closed after the aggregate parent timeout; use v1r5",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R5(
  _planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  throw new Error(
    "Yaneura-only v1r5 formal runner is closed after a resetForParent timeout; use v1r6",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R6(
  planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
  ) {
    throw new Error("Yaneura-only v1r6 runner rejects another plan family");
  }
  return runHalfkp81Depth18TeacherCoreForTests(
    authenticated,
    {
      stablePolicy: "yaneuraou-only-v1",
      processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
      parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
      parentDeadlinePolicy: "per-search-only",
      resetTimeoutRecoveryPolicy:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
    },
    {
      parentCount: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
      roleCounts: HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
      milestones: HALFKP81_DEPTH18_TEACHER_MILESTONES,
      maximumRows: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT * 13,
    },
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R9(
  planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  if (
    authenticated.planIdentity.schema !==
    HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
  ) {
    throw new Error("Yaneura-only v1r9 runner rejects another plan family");
  }
  const repositoryRoot = path.resolve(__dirname, "..");
  validateHalfkp81Depth18V1R9FormalSourceAuthorityForTests({
    branch: repositoryGitText(repositoryRoot, ["branch", "--show-current"]),
    head: repositoryGitText(repositoryRoot, ["rev-parse", "HEAD"]),
    main: repositoryGitText(repositoryRoot, ["rev-parse", "main"]),
    status: repositoryGitText(repositoryRoot, ["status", "--porcelain"]),
    captured: await captureFloodgateGitExactCleanRevision(repositoryRoot),
    planSourceRevision: authenticated.sourceRevision,
  });
  return runHalfkp81Depth18TeacherCoreForTests(
    authenticated,
    {
      stablePolicy: "yaneuraou-only-v1",
      processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PROCESSES,
      parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS,
      parentDeadlinePolicy: "per-search-only",
      resetTimeoutRecoveryPolicy:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
    },
    {
      parentCount: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
      roleCounts: HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
      milestones: HALFKP81_DEPTH18_TEACHER_MILESTONES,
      maximumRows: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT * 13,
    },
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R10(
  planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 ||
    canonicalJson(authenticated.plan.preregistration) !==
      canonicalJson(EXPECTED_YANEURA_ONLY_V1R10_PREREGISTRATION)
  ) {
    throw new Error("Yaneura-only v1r10 runner rejects another plan family");
  }
  return runHalfkp81Depth18YaneuraOnlyTeacherV1R9(planPath);
}

/**
 * Outcome-first v1r11 formal path. This deliberately does not call the legacy
 * thirteen-gate/preformal orchestrator. Its process-local capability is minted
 * only after the fixed smoke/import/power evidence has been reauthenticated.
 */
export async function runHalfkp81Depth18V1R11MinimalFormalFromFixedGate(): Promise<
  Readonly<Halfkp81Depth18TeacherRunResult>
> {
  const repositoryRoot = path.resolve(__dirname, "..");
  const fixedGate = loadHalfkp81Depth18V1R11MinimalFormalModuleForTests();
  const gate =
    await fixedGate.verifyHalfkp81Depth18V1R11MinimalFormalFixedGate();
  if (gate.status !== "minimal-formal-fixed-gate-pass") {
    throw new Error("v1r11 minimal formal fixed gate did not pass");
  }
  if (!fs.existsSync(HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH)) {
    await publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R11();
  }
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  );
  const captured = await captureFloodgateGitExactCleanRevision(repositoryRoot);
  const head = repositoryGitText(repositoryRoot, ["rev-parse", "HEAD"]);
  const branch = repositoryGitText(repositoryRoot, [
    "branch",
    "--show-current",
  ]);
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 ||
    (branch !== "main" && !branch.startsWith("codex/")) ||
    repositoryGitText(repositoryRoot, ["status", "--porcelain"]) !== "" ||
    captured !== head ||
    authenticated.sourceRevision !== head
  ) {
    throw new Error(
      "v1r11 minimal formal requires the exact clean merged main plan source",
    );
  }
  const fixedPowerLedger = Object.freeze({
    path: "/private/tmp/v1r11-power-smoke-final4-05b81a1e/power-continuity.jsonl",
    bytes: 6_838,
    sha256: "6080244f2920c59d3de6ceab483249593a00f1bb9ee6ca71728b1e46cb081fd0",
    schema: "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
  });
  const fixedPowerReceipt = Object.freeze({
    path: "/private/tmp/v1r11-power-smoke-final4-05b81a1e/power-continuity-receipt.json",
    bytes: 1_868,
    sha256: "3564c9041c1021b33b0a16aed69428ba358c6b7d2e844b631d2ac649aa6ca102",
    schema: "shogi-halfkp81-depth18-power-continuity-receipt-v1r11",
  });
  const fixedSmokeReceipt = Object.freeze({
    path: "/private/tmp/v1r11-prefix1-v1r9-smoke.xOenkB/teacher-receipt.json",
    bytes: 1_831,
    sha256: "c4090f40cf611dffa438ba560c7b70fa0cea16e530280a15677648797eda5883",
    schema: HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA,
  });
  const liveLaunch = await authenticateHalfkp81Depth18V1R11LaunchdAuthority(
    authenticated.planIdentity,
    authenticated.sourceRevision,
    repositoryRoot,
    path.join(
      repositoryRoot,
      "ml/run-halfkp81-depth18-v1r11-minimal-formal.ts",
    ),
  );
  const minimalAuthorityPayload = Object.freeze({
    schema: "shogi-halfkp81-depth18-v1r11-minimal-formal-authority-v1",
    status: "fixed-minimal-start-gate-reauthenticated",
    source_revision: authenticated.sourceRevision,
    teacher_plan: authenticated.planIdentity,
    planned_launchagent_descriptor: liveLaunch.plistSnapshot,
    live_launchagent_evidence: liveLaunch.evidence,
    fixed_evidence: Object.freeze({
      minimal_r6_source_work: Object.freeze({
        path: "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r6/teacher-work.jsonl",
        bytes: 105_333_287,
        sha256:
          "74c887374e3e9c26401f8da2850b9d0cbf2695ad08f474cb3f5962e26dd22b94",
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R11,
      }),
      minimal_r6_terminal_fault: Object.freeze({
        path: "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r6/teacher-terminal-fault.json",
        bytes: 2_316,
        sha256:
          "c6717518a7aab00c7eaeb5a74791076bf69e9c957caa888c3a0a287669f76b8a",
        schema: "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1",
      }),
      minimal_r6_power_ledger: Object.freeze({
        path: "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r6/power-continuity.jsonl",
        bytes: 3_628_882,
        sha256:
          "4338bea0f5f14b3cff799fa6d073a02f7a758c9c45d59fac8234cc5e7e4598e7",
        schema: "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
      }),
      minimal_r6_power_receipt: Object.freeze({
        path: "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r6/power-continuity-receipt.json",
        bytes: 17_859,
        sha256:
          "cba2f1f4b08328d2072e38418bff6ce662a0d670046f41cd16e1e5e23c3331a5",
        schema: "shogi-halfkp81-depth18-power-continuity-receipt-v1r11",
      }),
      smoke_receipt: fixedSmokeReceipt,
      power_ledger: fixedPowerLedger,
      power_receipt: fixedPowerReceipt,
    }),
    verification: Object.freeze({
      exact_imported_parents: 4_881,
      exact_imported_teacher_rows: 56_831,
      exact_remaining_parents: 3_311,
      minimal_r6_completed_set_independently_verified: true,
      smoke_exact_depth18_rows: 12,
      power_ledger_independently_verified: true,
      engine_processes_before_launch: 0,
      legacy_thirteen_gate_authority_used: false,
    }),
  });
  const minimalAuthorityBase = await publishCreateOnly(
    path.join(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY,
      "minimal-formal-authority.json",
    ),
    canonicalJsonLine(minimalAuthorityPayload),
  );
  const minimalAuthority = Object.freeze({
    ...minimalAuthorityBase,
    schema: String(minimalAuthorityPayload.schema),
  });
  const capability = Object.freeze({
    [V1R11_MINIMAL_FORMAL_CAPABILITY]: true,
    launchAgentEvidence: liveLaunch.evidence,
    plannedFinalDescriptor: liveLaunch.plistSnapshot,
    preformalLedger: minimalAuthority,
    preformalRawReceipt: minimalAuthority,
    verifiedPreformalAuthority: minimalAuthority,
  });
  trustedV1R11FormalAuthorities.add(capability);
  const engineReceipt = authenticated.engine
    .receipt as Required<Halfkp81Depth18TeacherFileIdentity>;
  const expectedFingerprint = halfkp81V1R11FormalRunFingerprintV2({
    teacherPlan:
      authenticated.planIdentity as Required<Halfkp81Depth18TeacherFileIdentity>,
    selectionJsonl:
      authenticated.selectionIdentity as Required<Halfkp81Depth18TeacherFileIdentity>,
    selectionManifest:
      authenticated.selectionManifestIdentity as Required<Halfkp81Depth18TeacherFileIdentity>,
    sourceRevision: authenticated.sourceRevision,
    engine: {
      binary: Object.freeze({
        ...authenticated.engine.binary,
        schema: HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
      }),
      evalFile: Object.freeze({
        ...authenticated.engine.eval_file,
        schema: HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
      }),
      receipt: engineReceipt,
    },
    teacherContract: authenticated.teacher,
    candidateContract: HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9,
    plannedFinalDescriptor: liveLaunch.plistSnapshot,
  });
  return runHalfkp81Depth18TeacherCoreForTests(
    authenticated,
    {
      stablePolicy: "yaneuraou-only-v1",
      processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PROCESSES,
      parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS,
      parentDeadlinePolicy: "per-search-only",
      resetTimeoutRecoveryPolicy:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
      ...(v1r11FallbackTimeoutRecoveryPlanIsAuthorized(
        authenticated.plan as Readonly<Record<string, unknown>>,
      )
        ? {
            fallbackTimeoutRecoveryPolicy:
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY,
          }
        : {}),
      startPowerContinuity: (context) =>
        startHalfkp81Depth18V1R11PowerContinuitySession(context),
      v1r11FormalAuthority: capability,
      expectedV1R11RunFingerprint: expectedFingerprint,
    },
    {
      parentCount: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
      roleCounts: HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
      milestones: HALFKP81_DEPTH18_TEACHER_MILESTONES,
      maximumRows: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT * 13,
    },
  );
}

export function loadHalfkp81Depth18V1R11MinimalFormalModuleForTests(): typeof import("./run-halfkp81-depth18-v1r11-minimal-formal") {
  return createRequire(__filename)(
    "./run-halfkp81-depth18-v1r11-minimal-formal.ts",
  ) as typeof import("./run-halfkp81-depth18-v1r11-minimal-formal");
}

const V1R11_PREFORMAL_GATE_NAMES = Object.freeze([
  "ready-pr",
  "all-required-ci-success",
  "regular-merge",
  "clean-main-source-authentication",
  "preformal-authority-implementation-tests-pass",
  "artifact-verifier-implementation-tests-pass",
  "power-guardian-implementation-tests-pass",
  "candidate-order-gate",
  "known10-probe",
  "pathological-fallback-probe",
  "mixed-load-gate",
  "formal-like-512",
  "ac-power-start-admission-pass",
] as const);
// Deliberately false until a trusted producer and per-gate semantic verifier
// replace the identity-only receipt scaffold below. Never flip this based on a
// user-authored receipt or a runtime flag.
const V1R11_SEMANTIC_PREFORMAL_AUTHORITY_IMPLEMENTED = false as const;

export function assertHalfkp81Depth18V1R11SemanticPreformalAuthorityForTests(): void {
  if (!V1R11_SEMANTIC_PREFORMAL_AUTHORITY_IMPLEMENTED) {
    throw new Error(
      "v1r11 formal remains locked until trusted semantic preformal authority is implemented",
    );
  }
}

export function assertHalfkp81Depth18V1R11RunnerVerifierFingerprintAgreementForTests(
  officialRunnerFingerprint: string,
  independentVerifierFingerprint: string,
): void {
  if (
    !SHA256_RE.test(officialRunnerFingerprint) ||
    !SHA256_RE.test(independentVerifierFingerprint) ||
    officialRunnerFingerprint ===
      "d76ec02ecd721260c380c2a421b6bc7e9d689f37eaf8279e83d78b381390eba7" ||
    officialRunnerFingerprint !== independentVerifierFingerprint
  ) {
    throw new Error(
      "v1r11 official runner and independent all-13 fingerprint differ or equal forbidden old identity",
    );
  }
}

const V1R11_LAUNCHD_LABEL_PREFIX =
  "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-minimal-r14-" as const;

export interface Halfkp81Depth18V1R11LaunchdAuthority {
  readonly label: string;
  readonly plistPath: string;
  readonly programArguments: readonly string[];
  readonly workingDirectory: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly pid: number;
}

export interface Halfkp81Depth18V1R11LaunchAgentAuthorityEvidence {
  readonly schema: typeof HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA;
  readonly status: "pass";
  readonly teacher_plan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly source_revision: string;
  readonly label: string;
  readonly runner_pid: number;
  readonly program_arguments: readonly string[];
  readonly working_directory: string;
  readonly stdout_path: string;
  readonly stderr_path: string;
  readonly launchctl_snapshot: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly plist_snapshot: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly live_plist_path: string;
  readonly authority: Readonly<{
    may_execute_formal_teacher: true;
    may_train: false;
    may_play_formal_games: false;
    may_write_live_weights: false;
  }>;
}

function uniqueLaunchctlValue(raw: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matches = [
    ...raw.matchAll(new RegExp(`^\\t${escaped} = (.+)$`, "gmu")),
  ];
  if (matches.length !== 1 || matches[0]?.[1] === undefined) {
    throw new Error(`v1r11 launchctl ${key} differs`);
  }
  return matches[0][1];
}

/** Pure parser used by production launch authentication and fixture tests. */
export function validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(
  raw: string,
  context: Readonly<{
    uid: number;
    sourceRevision: string;
    xpcServiceName: string | undefined;
    runnerPid: number;
    runnerUtilityArgv: readonly string[];
    repositoryRoot: string;
    entrypointPath?: string;
    expectedPlistPath?: string;
    expectedStdoutPath?: string;
    expectedStderrPath?: string;
  }>,
): Readonly<Halfkp81Depth18V1R11LaunchdAuthority> {
  if (
    !Number.isSafeInteger(context.uid) ||
    context.uid < 1 ||
    !/^[0-9a-f]{40}$/u.test(context.sourceRevision) ||
    !Number.isSafeInteger(context.runnerPid) ||
    context.runnerPid < 1 ||
    !path.isAbsolute(context.repositoryRoot) ||
    path.normalize(context.repositoryRoot) !== context.repositoryRoot ||
    context.runnerUtilityArgv.length !== 4 ||
    context.runnerUtilityArgv.some(
      (value) => typeof value !== "string" || value.length === 0,
    ) ||
    [
      context.expectedPlistPath,
      context.expectedStdoutPath,
      context.expectedStderrPath,
    ].filter((value) => value !== undefined).length %
      3 !==
      0
  ) {
    throw new Error("v1r11 launchd authority context differs");
  }
  const label = `${V1R11_LAUNCHD_LABEL_PREFIX}${context.sourceRevision.slice(0, 8)}`;
  if (context.xpcServiceName !== label) {
    throw new Error("v1r11 exact launchd service name differs");
  }
  if (!raw.startsWith(`gui/${context.uid}/${label} = {\n`)) {
    throw new Error("v1r11 launchctl service header differs");
  }
  const argumentsStart = raw.indexOf("\n\targuments = {\n");
  const argumentsEnd = raw.indexOf("\n\t}\n", argumentsStart + 1);
  if (
    argumentsStart < 0 ||
    argumentsEnd < 0 ||
    raw.indexOf("\n\targuments = {\n", argumentsStart + 1) !== -1
  ) {
    throw new Error("v1r11 launchctl ProgramArguments differ");
  }
  const programArguments = raw
    .slice(argumentsStart + "\n\targuments = {\n".length, argumentsEnd)
    .split("\n")
    .map((line) => /^\t\t(.+)$/u.exec(line)?.[1] ?? "");
  const expectedProgramArguments = Object.freeze([
    ...context.runnerUtilityArgv,
  ]);
  const expectedNode = process.execPath;
  const expectedPreload = path.join(
    context.repositoryRoot,
    "node_modules/tsx/dist/cjs/index.cjs",
  );
  const expectedEntrypoint =
    context.entrypointPath ??
    path.join(
      context.repositoryRoot,
      "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
    );
  if (
    canonicalJson(programArguments) !==
      canonicalJson(expectedProgramArguments) ||
    canonicalJson(context.runnerUtilityArgv) !==
      canonicalJson([
        expectedNode,
        "-r",
        expectedPreload,
        expectedEntrypoint,
      ]) ||
    uniqueLaunchctlValue(raw, "state") !== "running" ||
    uniqueLaunchctlValue(raw, "program") !== expectedNode ||
    Number(uniqueLaunchctlValue(raw, "pid")) !== context.runnerPid ||
    uniqueLaunchctlValue(raw, "working directory") !== context.repositoryRoot
  ) {
    throw new Error("v1r11 launchd program identity differs");
  }
  const plistPath = uniqueLaunchctlValue(raw, "path");
  const stdoutPath = uniqueLaunchctlValue(raw, "stdout path");
  const stderrPath = uniqueLaunchctlValue(raw, "stderr path");
  const exactProductionPathsSupplied =
    context.expectedPlistPath !== undefined &&
    context.expectedStdoutPath !== undefined &&
    context.expectedStderrPath !== undefined;
  if (
    !path.isAbsolute(plistPath) ||
    path.basename(plistPath) !== `${label}.plist` ||
    !path.isAbsolute(stdoutPath) ||
    !path.isAbsolute(stderrPath) ||
    (exactProductionPathsSupplied
      ? plistPath !== context.expectedPlistPath ||
        stdoutPath !== context.expectedStdoutPath ||
        stderrPath !== context.expectedStderrPath
      : path.dirname(plistPath) !== path.dirname(stdoutPath) ||
        path.dirname(plistPath) !== path.dirname(stderrPath))
  ) {
    throw new Error("v1r11 launchd private paths differ");
  }
  return Object.freeze({
    label,
    plistPath,
    programArguments: Object.freeze(programArguments),
    workingDirectory: context.repositoryRoot,
    stdoutPath,
    stderrPath,
    pid: context.runnerPid,
  });
}

async function publishV1R11ExclusivePrivateFile(
  destination: string,
  bytes: Uint8Array,
  schema?: string,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  if (
    path.dirname(destination) !==
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY
  ) {
    throw new Error("v1r11 launch evidence namespace differs");
  }
  const directoryStatus = await fs.promises.lstat(path.dirname(destination));
  if (
    !directoryStatus.isDirectory() ||
    directoryStatus.isSymbolicLink() ||
    directoryStatus.uid !== process.geteuid?.() ||
    (directoryStatus.mode & 0o7777) !== 0o700 ||
    (await fs.promises.realpath(path.dirname(destination))) !==
      path.dirname(destination)
  ) {
    throw new Error(
      "v1r11 authority namespace is not owned private real directory",
    );
  }
  const handle = await fs.promises.open(
    destination,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.datasync();
  } finally {
    await handle.close();
  }
  await fsyncDirectory(path.dirname(destination));
  return Object.freeze({
    ...fileIdentity(destination, bytes),
    ...(schema === undefined ? {} : { schema }),
  });
}

export function validateHalfkp81Depth18V1R11LaunchAgentEvidenceForTests(
  evidence: Readonly<Halfkp81Depth18V1R11LaunchAgentAuthorityEvidence>,
  context: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    sourceRevision: string;
    authority: Readonly<Halfkp81Depth18V1R11LaunchdAuthority>;
    launchctlSnapshot: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    plistSnapshot: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  }>,
): void {
  exactKeys(
    evidence as unknown as Record<string, unknown>,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "label",
      "runner_pid",
      "program_arguments",
      "working_directory",
      "stdout_path",
      "stderr_path",
      "launchctl_snapshot",
      "plist_snapshot",
      "live_plist_path",
      "authority",
    ],
    "v1r11 LaunchAgent authority evidence",
  );
  if (
    evidence.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA ||
    evidence.status !== "pass" ||
    canonicalJson(evidence.teacher_plan) !==
      canonicalJson(context.teacherPlan) ||
    evidence.source_revision !== context.sourceRevision ||
    evidence.label !== context.authority.label ||
    evidence.runner_pid !== context.authority.pid ||
    canonicalJson(evidence.program_arguments) !==
      canonicalJson(context.authority.programArguments) ||
    evidence.working_directory !== context.authority.workingDirectory ||
    evidence.stdout_path !== context.authority.stdoutPath ||
    evidence.stderr_path !== context.authority.stderrPath ||
    evidence.live_plist_path !== context.authority.plistPath ||
    canonicalJson(evidence.launchctl_snapshot) !==
      canonicalJson(context.launchctlSnapshot) ||
    canonicalJson(evidence.plist_snapshot) !==
      canonicalJson(context.plistSnapshot) ||
    canonicalJson(evidence.authority) !==
      canonicalJson({
        may_execute_formal_teacher: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("v1r11 LaunchAgent authority evidence differs");
  }
}

async function authenticateHalfkp81Depth18V1R11LaunchdAuthority(
  teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  sourceRevision: string,
  repositoryRoot: string,
  entrypointPath?: string,
): Promise<
  Readonly<{
    evidence: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    plistSnapshot: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  }>
> {
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid) || Number(uid) < 1) {
    throw new Error("v1r11 launchd authentication requires a numeric uid");
  }
  const label = `${V1R11_LAUNCHD_LABEL_PREFIX}${sourceRevision.slice(0, 8)}`;
  const raw = execFileSync("/bin/launchctl", ["print", `gui/${uid}/${label}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const runnerUtilityArgv = Object.freeze([
    process.execPath,
    ...process.execArgv,
    ...process.argv.slice(1),
  ]);
  const authority = validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(raw, {
    uid: Number(uid),
    sourceRevision,
    xpcServiceName: process.env.XPC_SERVICE_NAME,
    runnerPid: process.pid,
    runnerUtilityArgv,
    repositoryRoot,
    ...(entrypointPath === undefined ? {} : { entrypointPath }),
    expectedPlistPath: path.join(
      currentCanonicalPasswdHome(),
      "Library/LaunchAgents",
      `${label}.plist`,
    ),
    expectedStdoutPath: path.join(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R14_DEFAULT_DIRECTORY,
      "formal-launchagent.stdout.log",
    ),
    expectedStderrPath: path.join(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R14_DEFAULT_DIRECTORY,
      "formal-launchagent.stderr.log",
    ),
  });
  const metadata = await fs.promises.lstat(authority.plistPath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== uid ||
    (metadata.mode & 0o7777) !== 0o600 ||
    metadata.nlink !== 1 ||
    (await fs.promises.realpath(authority.plistPath)) !== authority.plistPath
  ) {
    throw new Error(
      "v1r11 launchd plist is not an owned private single-link file",
    );
  }
  const plistRaw = await readHeldStableFile(
    authority.plistPath,
    "v1r11 launchd plist",
  );
  const expectedPlist = buildHalfkp81V1R11PlannedLaunchAgentPlistForTests({
    label: authority.label,
    nodePath: runnerUtilityArgv[0]!,
    entrypointPath: runnerUtilityArgv[3]!,
    repositoryRoot: authority.workingDirectory,
    stdoutPath: authority.stdoutPath,
    stderrPath: authority.stderrPath,
  }).bytes;
  if (!plistRaw.equals(expectedPlist)) {
    throw new Error("v1r11 launchd plist policy differs");
  }
  const launchctlRaw = Buffer.from(raw, "utf8");
  const launchctlSnapshot = await publishV1R11ExclusivePrivateFile(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHCTL_SNAPSHOT_PATH,
    launchctlRaw,
  );
  const plistSnapshot = await (async () => {
    try {
      const held = await readHeldStableFile(
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PLIST_SNAPSHOT_PATH,
        "v1r11 preplanned plist snapshot",
      );
      if (!held.equals(plistRaw)) {
        throw new Error(
          "v1r11 preplanned plist snapshot differs from live plist",
        );
      }
      return Object.freeze({
        ...fileIdentity(
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PLIST_SNAPSHOT_PATH,
          held,
        ),
        schema: "application/x-apple-aspen-config-exact-bytes",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return publishV1R11ExclusivePrivateFile(
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PLIST_SNAPSHOT_PATH,
        plistRaw,
        "application/x-apple-aspen-config-exact-bytes",
      );
    }
  })();
  const evidence = Object.freeze({
    schema:
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
    status: "pass" as const,
    teacher_plan: teacherPlan,
    source_revision: sourceRevision,
    label: authority.label,
    runner_pid: authority.pid,
    program_arguments: authority.programArguments,
    working_directory: authority.workingDirectory,
    stdout_path: authority.stdoutPath,
    stderr_path: authority.stderrPath,
    launchctl_snapshot: launchctlSnapshot,
    plist_snapshot: plistSnapshot,
    live_plist_path: authority.plistPath,
    authority: Object.freeze({
      may_execute_formal_teacher: true as const,
      may_train: false as const,
      may_play_formal_games: false as const,
      may_write_live_weights: false as const,
    }),
  });
  validateHalfkp81Depth18V1R11LaunchAgentEvidenceForTests(evidence, {
    teacherPlan,
    sourceRevision,
    authority,
    launchctlSnapshot,
    plistSnapshot,
  });
  const evidenceBytes = canonicalJsonLine(evidence);
  const published = await publishV1R11ExclusivePrivateFile(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_PATH,
    evidenceBytes,
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
  );
  return Object.freeze({ evidence: published, plistSnapshot });
}

export function validateHalfkp81Depth18V1R11PreformalAuthorityReceiptForTests(
  receipt: Readonly<Record<string, unknown>>,
  context: Readonly<{
    teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    sourceRevision: string;
    requiredOrder: readonly unknown[];
  }>,
): readonly Readonly<Halfkp81Depth18TeacherFileIdentity>[] {
  if (
    canonicalJson(context.requiredOrder) !==
    canonicalJson([...V1R11_PREFORMAL_GATE_NAMES, "formal-teacher"])
  ) {
    throw new Error("v1r11 preformal required order differs");
  }
  exactKeys(
    receipt,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "required_order",
      "gates",
      "authority",
    ],
    "v1r11 preformal authority receipt",
  );
  if (
    receipt.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREFORMAL_AUTHORITY_RECEIPT_SCHEMA ||
    receipt.status !== "all-required-preformal-gates-passed" ||
    canonicalJson(receipt.teacher_plan) !==
      canonicalJson(context.teacherPlan) ||
    receipt.source_revision !== context.sourceRevision ||
    canonicalJson(receipt.required_order) !==
      canonicalJson(context.requiredOrder) ||
    canonicalJson(receipt.authority) !==
      canonicalJson({
        may_execute_formal_teacher: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("v1r11 preformal authority receipt differs");
  }
  const gates = receipt.gates;
  if (gates === null || typeof gates !== "object" || Array.isArray(gates)) {
    throw new Error("v1r11 preformal gate receipts are missing");
  }
  exactKeys(
    gates as Readonly<Record<string, unknown>>,
    V1R11_PREFORMAL_GATE_NAMES,
    "v1r11 preformal gate receipts",
  );
  return Object.freeze(
    V1R11_PREFORMAL_GATE_NAMES.map((gate, index) => {
      const row = (gates as Readonly<Record<string, unknown>>)[gate];
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`v1r11 preformal ${gate} receipt is missing`);
      }
      const value = row as Readonly<Record<string, unknown>>;
      exactKeys(
        value,
        ["sequence", "status", "evidence"],
        `v1r11 preformal ${gate} receipt`,
      );
      if (value.sequence !== index + 1 || value.status !== "pass") {
        throw new Error(`v1r11 preformal ${gate} order/status differs`);
      }
      const evidence = value.evidence;
      if (
        evidence === null ||
        typeof evidence !== "object" ||
        Array.isArray(evidence)
      ) {
        throw new Error(`v1r11 preformal ${gate} evidence is missing`);
      }
      const identity =
        evidence as unknown as Halfkp81Depth18TeacherFileIdentity;
      exactKeys(
        identity as unknown as Readonly<Record<string, unknown>>,
        ["path", "bytes", "sha256", "schema"],
        `v1r11 preformal ${gate} evidence identity`,
      );
      if (
        !path.isAbsolute(identity.path) ||
        !Number.isSafeInteger(identity.bytes) ||
        identity.bytes < 1 ||
        !SHA256_RE.test(identity.sha256) ||
        identity.schema !== HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA
      ) {
        throw new Error(`v1r11 preformal ${gate} evidence identity differs`);
      }
      return Object.freeze(identity);
    }),
  );
}

async function authenticateHalfkp81Depth18V1R11PreformalAuthority(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
): Promise<
  Readonly<{
    ledger: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    rawReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    verifiedReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  }>
> {
  assertHalfkp81Depth18V1R11SemanticPreformalAuthorityForTests();
  void authenticated;
  throw new Error(
    "v1r11 formal remains locked until the final Stage A/B/C independent verifier is wired",
  );
}

export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R11(
  planPath = HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  // This must remain the first operation. A locked binary may not read a plan,
  // query launchd, or create any authority artifact.
  assertHalfkp81Depth18V1R11SemanticPreformalAuthorityForTests();
  void planPath;
  throw new Error(
    "legacy v1r11 wrapper cannot authenticate or publish LaunchAgent evidence; use the outer-verified formal child capability",
  );
}

export interface Halfkp81Depth18V1R11ModernVerifiedAuthorityRequest {
  readonly repositoryRoot: string;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly preformalLedger: Readonly<V1R11AuthorityFileIdentity>;
  readonly preformalRawReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly launchAgentEvidence: Readonly<V1R11AuthorityFileIdentity>;
  readonly verifiedPreformalAuthority: Readonly<V1R11AuthorityFileIdentity>;
  readonly plannedFinalDescriptor: Readonly<V1R11AuthorityFileIdentity>;
  readonly formalRunIntent: Readonly<IndependentFormalRunIntentInput>;
}

/**
 * The sole modern v1r11 guardian/core entrypoint. The lock is intentionally the
 * first operation: while false, even a caller with forged identity objects
 * cannot read authority files, start the guardian, or create teacher output.
 */
export async function runHalfkp81Depth18V1R11FromModernVerifiedAuthority(
  request: Readonly<Halfkp81Depth18V1R11ModernVerifiedAuthorityRequest>,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  assertHalfkp81Depth18V1R11SemanticPreformalAuthorityForTests();
  exactKeys(
    request as unknown as Readonly<Record<string, unknown>>,
    [
      "repositoryRoot",
      "teacherPlan",
      "sourceRevision",
      "runFingerprint",
      "authorityDirectory",
      "gateDirectory",
      "stageAReceipt",
      "preformalLedger",
      "preformalRawReceipt",
      "launchAgentEvidence",
      "verifiedPreformalAuthority",
      "plannedFinalDescriptor",
      "formalRunIntent",
    ],
    "modern v1r11 verified authority request",
  );
  const authorityIo = await import("./halfkp81-depth18-v1r11-authority-io");
  const stagedAuthority =
    await import("./verify-halfkp81-depth18-v1r11-staged-authority");
  await authorityIo.readV1R11HeldIdentity(
    request.plannedFinalDescriptor,
    "application/x-apple-aspen-config-exact-bytes",
    "modern v1r11 planned final descriptor",
  );
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  );
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11 ||
    canonicalJson(authenticated.planIdentity) !==
      canonicalJson(request.teacherPlan) ||
    authenticated.sourceRevision !== request.sourceRevision ||
    canonicalJson(request.formalRunIntent.plannedFinalDescriptor) !==
      canonicalJson(request.plannedFinalDescriptor)
  ) {
    throw new Error("modern v1r11 authenticated plan binding differs");
  }
  await stagedAuthority.reauthenticateHalfkp81V1R11ExistingStagedAuthorityForFormalChild(
    {
      repositoryRoot: request.repositoryRoot,
      teacherPlan: request.teacherPlan,
      sourceRevision: request.sourceRevision,
      runFingerprint: request.runFingerprint,
      authorityDirectory: request.authorityDirectory,
      gateDirectory: request.gateDirectory,
      stageAReceipt: request.stageAReceipt,
      ledger: request.preformalLedger,
      rawReceipt: request.preformalRawReceipt,
      launchAgentAuthority: request.launchAgentEvidence,
      verifiedReceipt: request.verifiedPreformalAuthority,
      formalRunIntent: request.formalRunIntent,
    },
  );
  const capability = Object.freeze({
    launchAgentEvidence: request.launchAgentEvidence,
    plannedFinalDescriptor: request.plannedFinalDescriptor,
    preformalLedger: request.preformalLedger,
    preformalRawReceipt: request.preformalRawReceipt,
    verifiedPreformalAuthority: request.verifiedPreformalAuthority,
  });
  trustedV1R11FormalAuthorities.add(capability);
  return runHalfkp81Depth18TeacherCoreForTests(
    authenticated,
    {
      stablePolicy: "yaneuraou-only-v1",
      processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PROCESSES,
      parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS,
      parentDeadlinePolicy: "per-search-only",
      resetTimeoutRecoveryPolicy:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
      ...(v1r11FallbackTimeoutRecoveryPlanIsAuthorized(
        authenticated.plan as Readonly<Record<string, unknown>>,
      )
        ? {
            fallbackTimeoutRecoveryPolicy:
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_TIMEOUT_RECOVERY_POLICY,
          }
        : {}),
      startPowerContinuity: (context) =>
        startHalfkp81Depth18V1R11PowerContinuitySession(context),
      v1r11FormalAuthority: capability,
      expectedV1R11RunFingerprint: request.runFingerprint,
    },
    {
      parentCount: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
      roleCounts: HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
      milestones: HALFKP81_DEPTH18_TEACHER_MILESTONES,
      maximumRows: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT * 13,
    },
  );
}

export function validateHalfkp81Depth18V1R9FormalSourceAuthorityForTests(
  value: Readonly<{
    branch: string;
    head: string;
    main: string;
    status: string;
    captured: string;
    planSourceRevision: string;
  }>,
): void {
  if (
    value.branch !== "main" ||
    value.status !== "" ||
    !REVISION_RE.test(value.head) ||
    value.head !== value.main ||
    value.head !== value.captured ||
    value.head !== value.planSourceRevision
  ) {
    throw new Error(
      "v1r9 formal execution requires clean main at the sealed runtime-plan source revision",
    );
  }
}
