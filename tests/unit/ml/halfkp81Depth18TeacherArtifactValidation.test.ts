import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA,
  HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2,
  HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3,
  HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
  HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
  HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA,
  HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6,
  canonicalHalfkp81Depth18Json,
  readHalfkp81Depth18PrivateArtifact,
  validateHalfkp81Depth18TeacherArtifacts,
  validateHalfkp81Depth18TeacherArtifactsCoreForTests,
  validateHalfkp81Depth18V1R9RouteCoreForTests,
  type Halfkp81Depth18PrivateSnapshot,
  type Halfkp81Depth18ValidationRequest,
} from "../../../ml/halfkp81-depth18-teacher-artifact-validation";
import {
  FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_QUEUE_BOUND_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_RUNTIME_CONTRACT_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_WORKERS_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SHA256_V3,
  getFloodgateBoundedStableWasmRuntimeReceiptDigestV3,
  type FloodgateBoundedStableWasmOutcomeV3,
  type FloodgateBoundedStableWasmRuntimeReceiptV3,
} from "../../../ml/floodgate-bounded-stable-wasm-runtime-v3";
import {
  HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
  runHalfkp81Depth18TeacherCoreForTests,
  type Halfkp81Depth18AuthenticatedTeacherPlan,
  type Halfkp81Depth18TeacherEngine,
  type Halfkp81Depth18TeacherFileIdentity,
  type Halfkp81Depth18TeacherRunnerDependencies,
  type Halfkp81Depth18TeacherStableRuntime,
} from "../../../ml/halfkp81-depth18-teacher-runner";
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
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
  FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
} from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_QUIESCENCE_DEPTH,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_BYTES,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  FLOODGATE_STABLE_WASM_SHA256,
  FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
  FLOODGATE_STABLE_WEIGHTS_BYTES,
  FLOODGATE_STABLE_WEIGHTS_SHA256,
  FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
  FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
} from "../../../ml/floodgate-stable-wasm-proposer";
import type { FloodgateTrainingParent } from "../../../ml/floodgate-training-row-consumer";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { positionKeyFromSfen } from "../../../ml/sibling-data";
import {
  USI_RESET_FOR_PARENT_TIMEOUT_MS,
  UsiResetForParentTimeoutError,
} from "../../../ml/usi-engine";

const SOURCE_REVISION = "0123456789abcdef0123456789abcdef01234567";
const START =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 13";
const STABLE_RECEIPT_DOMAIN =
  "shogi-floodgate-production-stable-runtime-receipt-v1\0";
const STABLE_ROW_DOMAIN = "shogi-floodgate-production-stable-runtime-row-v1\0";
const BOUNDED_PARENT_DOMAIN = "shogi-floodgate-bounded-stable-parent-v3\0";
const BOUNDED_OUTCOME_DOMAIN = "shogi-floodgate-bounded-stable-outcome-v3\0";
const roots: string[] = [];

type FixtureStableMode =
  | "required-v2"
  | "bounded-v3-omitted"
  | "bounded-v3-proposal"
  | "bounded-v3r2-omitted"
  | "bounded-v3r3-omitted"
  | "yaneura-only-v1"
  | "yaneura-only-v1r2"
  | "yaneura-only-v1r3"
  | "yaneura-only-v1r4"
  | "yaneura-only-v1r6";

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalLine(value: unknown): Buffer {
  return Buffer.from(`${canonicalHalfkp81Depth18Json(value)}\n`, "utf8");
}

function semanticId(seed: string): string {
  return `sha256:${digest(seed)}`;
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${digest(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function identity(
  file: string,
  bytes: Uint8Array,
  schema?: string,
): Halfkp81Depth18TeacherFileIdentity {
  return {
    path: file,
    bytes: bytes.byteLength,
    sha256: digest(bytes),
    ...(schema === undefined ? {} : { schema }),
  };
}

async function writePrivate(file: string, bytes: Uint8Array): Promise<void> {
  await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(file, bytes, { mode: 0o600 });
  await fs.promises.chmod(file, 0o600);
}

async function snapshot(
  file: string,
): Promise<Readonly<Halfkp81Depth18PrivateSnapshot>> {
  const bytes = await fs.promises.readFile(file);
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    identity: Object.freeze(identity(file, bytes)),
  });
}

function teacherSettings() {
  return Object.freeze({
    engine: "YaneuraOu NNUE 9.60git 64APPLEM1",
    proposal_depth: 16,
    proposal_multipv: 12,
    stable_move_depth: 11,
    rescore_depth: 18,
    threads_per_process: 1,
    hash_mib_per_process: 512,
    processes: 13,
    timeout_seconds_per_parent: 600,
    minimum_rows_per_parent: 2,
    maximum_rows_per_parent: 14,
    expected_rows_point: 95_191,
    maximum_rows: 114_688,
  });
}

function boundedTeacherSettings() {
  return Object.freeze({
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
}

function yaneuraOnlyTeacherSettings() {
  return Object.freeze({
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
    ledger_candidate_generation:
      HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
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
}

function yaneuraOnlyV1r6TeacherSettings() {
  const base = yaneuraOnlyTeacherSettings();
  return Object.freeze({
    candidate_policy: base.candidate_policy,
    engine: base.engine,
    hash_mib_per_process: 512,
    ledger_candidate_generation:
      HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
    maximum_rows: 106_496,
    maximum_rows_per_parent: 13,
    minimum_rows_per_parent: 2,
    parent_deadline_policy: "per-search-only-no-aggregate-parent-race",
    persistent_engine_processes: true,
    processes: 4,
    rescore_policy: base.rescore_policy,
    search_timeout_milliseconds: 3_600_000,
    threads_per_process: 1,
    whole_parent_publication:
      "durable-only-after-proposal-and-all-depth18-rescores-pass",
  });
}

function boundedStableReceipt(): Readonly<FloodgateBoundedStableWasmRuntimeReceiptV3> {
  return Object.freeze({
    contract: FLOODGATE_BOUNDED_STABLE_WASM_RUNTIME_CONTRACT_V3,
    status: "initialized-optional-bounded-stable-candidate-capability",
    claim_boundary:
      "candidate-or-authenticated-omission-only-not-teacher-label-training-holdout-or-playing-strength",
    execution_boundary: "production-pinned-asset-authority",
    asset_authority_receipt_sha256: digest("bounded-asset-authority"),
    engine_assets: Object.freeze({
      wasm: Object.freeze({
        bytes: FLOODGATE_STABLE_WASM_BYTES,
        sha256: FLOODGATE_STABLE_WASM_SHA256,
      }),
      weights: Object.freeze({
        bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
        sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
      }),
      worker_source: Object.freeze({
        bytes: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
        sha256: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SHA256_V3,
      }),
    }),
    search: Object.freeze({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      quiescence_depth: FLOODGATE_STABLE_QUIESCENCE_DEPTH,
      cooperative_deadline_ms:
        FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
      partial_result_policy: "discard-entire-move-score-and-counters",
      stable_candidate_role: "optional",
    }),
    operational: Object.freeze({
      workers: FLOODGATE_BOUNDED_STABLE_WASM_WORKERS_V3,
      queue_bound: FLOODGATE_BOUNDED_STABLE_WASM_QUEUE_BOUND_V3,
      outer_watchdog_ms: FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3,
      omission_policy: "resolve-explicit-bound-outcome-no-pool-poison",
      unexpected_failure_policy: "reap-replace-reject-parent-no-pool-poison",
      replacement_policy:
        "reap-omitted-or-failed-worker-before-fresh-replacement",
    }),
  });
}

function boundedOutcome(
  parent: Readonly<FloodgateTrainingParent>,
  receiptSha256: string,
  outcome: "omitted" | "proposal",
): Readonly<FloodgateBoundedStableWasmOutcomeV3> {
  const parentPayload = {
    schema_version: parent.schema_version,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_sfen: parent.parent_sfen,
    ply: parent.ply,
    played_move: parent.played_move,
  };
  const parentPayloadSha256 = digest(
    `${BOUNDED_PARENT_DOMAIN}${canonicalHalfkp81Depth18Json(parentPayload)}`,
  );
  if (outcome === "omitted") {
    const body = {
      schema: FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
      outcome: "omitted" as const,
      row: null,
      omission: {
        reason: "cooperative-deadline" as const,
        search_budget_ms: FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
        completed_depth: 9,
        partial_result_adopted: false as const,
        worker_reaped: true as const,
        worker_replaced: true as const,
      },
    };
    return Object.freeze({
      ...body,
      runtime_binding: Object.freeze({
        runtime_receipt_sha256: receiptSha256,
        parent_payload_sha256: parentPayloadSha256,
        outcome_sha256: digest(
          `${BOUNDED_OUTCOME_DOMAIN}${canonicalHalfkp81Depth18Json(body)}`,
        ),
      }),
    });
  }
  const stableMove = "2g2f";
  const childSfen = childSfenAfterUsi(parent.parent_sfen, stableMove);
  const row = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: digest(
      `shogi-floodgate-stable-parent-v1\0${canonicalHalfkp81Depth18Json(
        parentPayload,
      )}`,
    ),
    stable_move: stableMove,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      termination: "requested-depth-complete" as const,
      raw_search_score: 10,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 10,
      leaves: 5,
      root_tesu: parent.ply,
    },
  };
  const body = {
    schema: FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
    outcome: "proposal" as const,
    row,
    omission: null,
  };
  return Object.freeze({
    ...body,
    runtime_binding: Object.freeze({
      runtime_receipt_sha256: receiptSha256,
      parent_payload_sha256: parentPayloadSha256,
      outcome_sha256: digest(
        `${BOUNDED_OUTCOME_DOMAIN}${canonicalHalfkp81Depth18Json(body)}`,
      ),
    }),
  });
}

function stableReceipt(poolDigest: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    contract: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-asset-authority-and-reusable-pool",
    asset_authority: Object.freeze({
      contract: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CONTRACT,
      status: FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_STATUS,
      claim_boundary:
        FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_CLAIM_BOUNDARY,
      trust_boundary:
        FLOODGATE_PRODUCTION_TEACHER_ASSET_AUTHORITY_TRUST_BOUNDARY,
      execution_boundary: "production-fixed-registry-and-deployment-root",
      receipt_sha256: digest("asset-authority"),
    }),
    stable_engine_assets: Object.freeze({
      worker_schema: FLOODGATE_STABLE_WASM_WORKER_SCHEMA,
      wasm: Object.freeze({
        bytes: FLOODGATE_STABLE_WASM_BYTES,
        sha256: FLOODGATE_STABLE_WASM_SHA256,
      }),
      weights: Object.freeze({
        bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
        sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
        k: 600,
        buckets: 1,
      }),
      worker_source: Object.freeze({
        bytes: FLOODGATE_STABLE_WORKER_SOURCE_BYTES,
        sha256: FLOODGATE_STABLE_WORKER_SOURCE_SHA256,
      }),
    }),
    search_contract: Object.freeze({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      quiescence_depth: FLOODGATE_STABLE_QUIESCENCE_DEPTH,
      early_completion: "positive-winning-mate-band-depth-1-through-10-only",
      positive_mate_score_min: FLOODGATE_STABLE_MATE_SCORE_MIN,
      positive_mate_score_max: FLOODGATE_STABLE_MATE_SCORE_MAX,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      root_tesu: "input-ply",
      book: false,
      fallback: "forbidden",
    }),
    operational: Object.freeze({
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
      reusable_pool_receipt_sha256: poolDigest,
    }),
    nonclaims: Object.freeze({
      parent_authentication: false,
      teacher_label: false,
      training: false,
      selection_or_holdout_access: false,
      playing_strength: false,
    }),
  });
}

interface Fixture {
  readonly request: Readonly<Halfkp81Depth18ValidationRequest>;
  readonly root: string;
  readonly stableFactoryCalls: number;
}

async function generatedFixture(
  stableMode: FixtureStableMode = "required-v2",
): Promise<Fixture> {
  const yaneuraOnly =
    stableMode === "yaneura-only-v1" ||
    stableMode === "yaneura-only-v1r2" ||
    stableMode === "yaneura-only-v1r3" ||
    stableMode === "yaneura-only-v1r4" ||
    stableMode === "yaneura-only-v1r6";
  const boundedStableV3 = stableMode !== "required-v2" && !yaneuraOnly;
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "halfkp81-depth18-artifact-"),
  );
  roots.push(root);
  await fs.promises.chmod(root, 0o700);
  const roles = ["fit", "tune", "sealed"] as const;
  const legalCount = rulesCompleteLegalMoves(
    positionFromSfen(START).position,
  ).length;
  const selectionRows = roles.map((role, index) => {
    const gameId = semanticId(`game-${index}`);
    const tie = {
      game_id: gameId,
      minimum_player_rating: 3_000,
      old_depth12_cp: 0,
      old_outcome: 0.5,
      position_id: positionKeyFromSfen(START),
    };
    return {
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
      source_game_id: gameId,
      game_id: gameId,
      source_game_sha256: digest(`source-${index}`),
      position_id: positionKeyFromSfen(START),
      sfen: START,
      recorded_move: "7g7f",
      side_to_move: "b",
      ply: 12,
      phase: "opening",
      old_depth12_cp: 0,
      old_outcome: 0.5,
      old_depth12_signals_usage: "selection_only_never_teacher_target",
      minimum_player_rating: 3_000,
      sente_rating: 3_000,
      gote_rating: 3_100,
      legal_move_count: legalCount,
      hardness_cp_outcome_surprise: 0,
      hardness_tiebreak_sha256: digest(canonicalLine(tie)),
      role,
    };
  });
  const selectionBytes = Buffer.from(
    `${selectionRows.map(canonicalHalfkp81Depth18Json).join("\n")}\n`,
  );
  const selectionPath = path.join(root, "selection.jsonl");
  const selectionManifestPath = path.join(root, "selection.manifest.json");
  const selectionManifest = {
    schema: HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
    output: {
      path: selectionPath,
      bytes: selectionBytes.byteLength,
      sha256: digest(selectionBytes),
      rows: roles.length,
    },
  };
  const selectionManifestBytes = canonicalLine(selectionManifest);
  await writePrivate(selectionPath, selectionBytes);
  await writePrivate(selectionManifestPath, selectionManifestBytes);

  const enginePath = path.join(root, "engine");
  const evalPath = path.join(root, "eval.bin");
  const engineReceiptPath = path.join(root, "engine-receipt.json");
  const engineBytes = Buffer.from("engine");
  const evalBytes = Buffer.from("eval");
  const engineReceipt = {
    schema: "shogi-teacher-engine-receipt-v1",
    source_repository: "https://example.test/yaneuraou",
    source_commit: "9133c527791c8b2f5f378a32df29a5e3752bd41b",
    source_commit_date: "2026-01-01T00:00:00Z",
    build_directory: "source",
    build_command: "make",
    compiler: "clang",
    compiler_target: "arm64",
    engine_id: "YaneuraOu NNUE 9.60git 64APPLEM1",
    binary_bytes: engineBytes.byteLength,
    binary_sha256: digest(engineBytes),
  };
  const engineReceiptBytes = canonicalLine(engineReceipt);
  await writePrivate(enginePath, engineBytes);
  await writePrivate(evalPath, evalBytes);
  await writePrivate(engineReceiptPath, engineReceiptBytes);

  const outputs = {
    directory: root,
    plan_json: path.join(root, "teacher-plan.json"),
    fit_jsonl: path.join(root, "fit.jsonl"),
    tune_jsonl: path.join(root, "tune.jsonl"),
    sealed_jsonl: path.join(root, "sealed.jsonl"),
    work_jsonl: path.join(root, "teacher-work.jsonl"),
    milestone_100_json: path.join(root, "teacher-milestone-100.json"),
    milestone_500_json: path.join(root, "teacher-milestone-500.json"),
    terminal_fault_json: path.join(root, "teacher-terminal-fault.json"),
    receipt_json: path.join(root, "teacher-receipt.json"),
    verified_artifact_receipt_json: path.join(
      root,
      "teacher-verified-artifact-receipt.json",
    ),
  };
  const selectionEvidence = {
    schema: "shogi-halfkp81-depth18-authenticated-selection-evidence-v1",
    status: "authenticated-selection-complete-teacher-plan-eligible",
    source_revision: SOURCE_REVISION,
    selection_jsonl: {
      ...identity(
        selectionPath,
        selectionBytes,
        HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
      ),
      held_read_only_descriptor: true,
      stable_double_read: true,
      rows: roles.length,
    },
    selection_manifest: {
      ...identity(
        selectionManifestPath,
        selectionManifestBytes,
        HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
      ),
      held_read_only_descriptor: true,
      stable_double_read: true,
    },
    phase_name_map: {},
    accounting: {},
    bindings: {},
    verification: {},
  };
  const plan = {
    schema: yaneuraOnly
      ? stableMode === "yaneura-only-v1r6"
        ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
        : stableMode === "yaneura-only-v1r4"
          ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4
          : stableMode === "yaneura-only-v1r3"
            ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3
            : stableMode === "yaneura-only-v1r2"
              ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2
              : HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1
      : stableMode === "bounded-v3r2-omitted" ||
          stableMode === "bounded-v3r3-omitted"
        ? stableMode === "bounded-v3r3-omitted"
          ? HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3
          : HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2
        : boundedStableV3
          ? HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA
          : HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA,
    source_revision: SOURCE_REVISION,
    selection_evidence: selectionEvidence,
    selection_manifest: identity(
      selectionManifestPath,
      selectionManifestBytes,
      HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
    ),
    engine: {
      binary: identity(enginePath, engineBytes),
      eval_file: identity(evalPath, evalBytes),
      eval_tree_sha256: digest("eval-tree"),
      source_revision: "9133c527791c8b2f5f378a32df29a5e3752bd41b",
      id: "YaneuraOu NNUE 9.60git 64APPLEM1",
    },
    teacher: yaneuraOnly
      ? stableMode === "yaneura-only-v1r6"
        ? yaneuraOnlyV1r6TeacherSettings()
        : yaneuraOnlyTeacherSettings()
      : boundedStableV3
        ? boundedTeacherSettings()
        : teacherSettings(),
    outputs,
  };
  const planBytes = canonicalLine(plan);
  await writePrivate(outputs.plan_json, planBytes);
  const parents = selectionRows.map((row): Readonly<FloodgateTrainingParent> =>
    Object.freeze({
      schema_version: 1,
      game_id: row.game_id,
      parent_id: parentId(row.game_id, row.ply),
      position_id: row.position_id,
      parent_sfen: row.sfen,
      ply: row.ply,
      played_move: row.recorded_move,
    }),
  );
  const roleMap = new Map(
    parents.map((parent, index) => [parent.parent_id, roles[index]] as const),
  );
  const authenticated = {
    plan: Object.freeze(plan),
    planIdentity: Object.freeze({
      ...identity(outputs.plan_json, planBytes),
      schema: plan.schema,
    }),
    sourceRevision: SOURCE_REVISION,
    selectionIdentity: Object.freeze({
      ...identity(selectionPath, selectionBytes),
      rows: roles.length,
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
    }),
    selectionManifestIdentity: Object.freeze(
      identity(
        selectionManifestPath,
        selectionManifestBytes,
        HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
      ),
    ),
    selectionRows: Object.freeze(selectionRows),
    parents: Object.freeze(parents),
    roles: roleMap,
    outputs: Object.freeze(outputs),
    engine: Object.freeze(plan.engine),
    teacher: plan.teacher,
  } as unknown as Halfkp81Depth18AuthenticatedTeacherPlan;

  const poolDigest = digest("pool");
  const receipt = boundedStableV3
    ? boundedStableReceipt()
    : stableReceipt(poolDigest);
  const receiptDigest = boundedStableV3
    ? getFloodgateBoundedStableWasmRuntimeReceiptDigestV3(
        receipt as Readonly<FloodgateBoundedStableWasmRuntimeReceiptV3>,
      )
    : digest(
        `${STABLE_RECEIPT_DOMAIN}${canonicalHalfkp81Depth18Json(receipt)}`,
      );
  const stable: Halfkp81Depth18TeacherStableRuntime = {
    receipt,
    receiptDigest,
    propose: async (parent) => {
      if (stableMode !== "required-v2") {
        return boundedOutcome(
          parent,
          receiptDigest,
          stableMode === "bounded-v3-omitted" ||
            stableMode === "bounded-v3r2-omitted" ||
            stableMode === "bounded-v3r3-omitted"
            ? "omitted"
            : "proposal",
        );
      }
      const stableMove = "2g2f";
      const parentPayload = {
        schema_version: parent.schema_version,
        game_id: parent.game_id,
        parent_id: parent.parent_id,
        position_id: parent.position_id,
        parent_sfen: parent.parent_sfen,
        ply: parent.ply,
        played_move: parent.played_move,
      };
      const parentPayloadSha = digest(
        `shogi-floodgate-stable-parent-v1\0${canonicalHalfkp81Depth18Json(
          parentPayload,
        )}`,
      );
      const childSfen = childSfenAfterUsi(parent.parent_sfen, stableMove);
      const row = {
        schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
        game_id: parent.game_id,
        parent_id: parent.parent_id,
        position_id: parent.position_id,
        parent_payload_sha256: parentPayloadSha,
        stable_move: stableMove,
        child_sfen: childSfen,
        child_position_id: positionKeyFromSfen(childSfen),
        search: {
          requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
          completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
          termination: "requested-depth-complete" as const,
          raw_search_score: 10,
          score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
          nodes: 10,
          leaves: 5,
          root_tesu: parent.ply,
        },
      };
      return {
        schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
        row,
        runtime_binding: {
          claim_boundary:
            FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
          execution_boundary:
            "production-fixed-asset-authority-and-reusable-pool",
          runtime_receipt_sha256: receiptDigest,
          reusable_pool_receipt_sha256: poolDigest,
          parent_payload_sha256: parentPayloadSha,
          row_sha256: digest(
            `${STABLE_ROW_DOMAIN}${canonicalHalfkp81Depth18Json(row)}`,
          ),
          origin: "direct-owning-runtime-capability-call-v1",
          plain_result_authentication_claim: false,
        },
      } as never;
    },
    close: async () => undefined,
  };
  let resetTimeoutPending = stableMode === "yaneura-only-v1r6";
  class FakeEngine implements Halfkp81Depth18TeacherEngine {
    async resetForParent(): Promise<void> {
      if (resetTimeoutPending) {
        resetTimeoutPending = false;
        throw new UsiResetForParentTimeoutError(
          USI_RESET_FOR_PARENT_TIMEOUT_MS,
        );
      }
    }
    async quit(): Promise<void> {}
    async search(
      sfen: string,
      multipv: number,
      limit: { depth?: number },
      searchmoves: readonly string[],
    ) {
      const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position)
        .map((move) => move.usi)
        .filter((move) => move !== "7g7f" && move !== "2g2f");
      const moves =
        searchmoves.length === 1 ? [...searchmoves] : legal.slice(0, multipv);
      return {
        depth: limit.depth as number,
        lines: moves.map((move, index) => ({
          depth: limit.depth as number,
          multipv: index + 1,
          cp: 100 - index,
          nodes: 100,
          move,
          pv: [move],
          scoreKind: "cp" as const,
        })),
        bestmove: moves[0],
        observedNodes: moves.length * 100,
      };
    }
  }
  let stableFactoryCalls = 0;
  const dependencies: Halfkp81Depth18TeacherRunnerDependencies = {
    createStableRuntime: async () => {
      stableFactoryCalls += 1;
      return stable;
    },
    createEngine: async () => new FakeEngine(),
    authenticateFixedAssets: async () => ({
      binary: identity(enginePath, engineBytes),
      evalFile: identity(evalPath, evalBytes),
      engineReceipt: identity(
        engineReceiptPath,
        engineReceiptBytes,
        "shogi-teacher-engine-receipt-v1",
      ),
    }),
    processes:
      stableMode === "yaneura-only-v1r6"
        ? HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES
        : 3,
    ...(stableMode === "yaneura-only-v1r6"
      ? {
          parentDeadlinePolicy: "per-search-only" as const,
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
          resetTimeoutRecoveryPolicy:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        }
      : {}),
    stablePolicy: yaneuraOnly
      ? "yaneuraou-only-v1"
      : boundedStableV3
        ? "optional-bounded-depth11-v3"
        : "required-depth11-v2",
  };
  await runHalfkp81Depth18TeacherCoreForTests(authenticated, dependencies, {
    parentCount: roles.length,
    roleCounts: { fit: 1, tune: 1, sealed: 1 },
    milestones: [],
    maximumRows: roles.length * (yaneuraOnly ? 13 : 14),
  });
  return {
    root,
    stableFactoryCalls,
    request: Object.freeze({
      label: "test depth18 teacher",
      plan: await snapshot(outputs.plan_json),
      selection: await snapshot(selectionPath),
      selectionManifest: await snapshot(selectionManifestPath),
      work: await snapshot(outputs.work_jsonl),
      engineBinary: await snapshot(enginePath),
      engineEval: await snapshot(evalPath),
      engineReceipt: await snapshot(engineReceiptPath),
      rawReceipt: await snapshot(outputs.receipt_json),
      fit: await snapshot(outputs.fit_jsonl),
      tune: await snapshot(outputs.tune_jsonl),
      sealed: await snapshot(outputs.sealed_jsonl),
    }),
  };
}

function withWorkRows(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
  rows: readonly Record<string, unknown>[],
): Readonly<Halfkp81Depth18ValidationRequest> {
  const bytes = Buffer.from(
    `${rows.map(canonicalHalfkp81Depth18Json).join("\n")}\n`,
  );
  return {
    ...request,
    work: {
      bytes,
      identity: {
        ...request.work.identity,
        bytes: bytes.length,
        sha256: digest(bytes),
      },
    },
  };
}

function cloneWork(
  request: Readonly<Halfkp81Depth18ValidationRequest>,
): Record<string, unknown>[] {
  return Buffer.from(request.work.bytes)
    .toString()
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function resealWrapper(wrapper: Record<string, unknown>): void {
  const payload = { ...wrapper };
  delete payload.payload_sha256;
  wrapper.payload_sha256 = digest(
    `${HALFKP81_DEPTH18_WRAPPER_DIGEST_DOMAIN}${canonicalHalfkp81Depth18Json(
      payload,
    )}`,
  );
}

function resealTeacherEntry(wrapper: Record<string, unknown>): void {
  const teacher = wrapper.teacher_entry as Record<string, unknown>;
  const payload = { ...teacher };
  delete payload.payload_sha256;
  teacher.payload_sha256 = digest(canonicalHalfkp81Depth18Json(payload));
  resealWrapper(wrapper);
}

function resealStableWrapper(wrapper: Record<string, unknown>): void {
  const result = wrapper.stable_result as Record<string, unknown>;
  const row = result.row as Record<string, unknown>;
  const binding = result.runtime_binding as Record<string, unknown>;
  binding.row_sha256 = digest(
    `${STABLE_ROW_DOMAIN}${canonicalHalfkp81Depth18Json(row)}`,
  );
  resealWrapper(wrapper);
}

describe("HalfKP81 depth18 teacher artifact verifier", () => {
  it("accepts actual runner output and issues only training-plan authority", async () => {
    const fixture = await generatedFixture();
    const result = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      fixture.request,
      { fit: 1, tune: 1, sealed: 1 },
    );
    expect(result).toMatchObject({
      completedParents: 3,
      completedRows: 42,
      roleParents: { fit: 1, tune: 1, sealed: 1 },
      roleRows: { fit: 14, tune: 14, sealed: 14 },
    });
    expect(result.receipt).toMatchObject({
      status: "verified-artifacts-training-plan-eligible",
      authority: {
        may_build_training_plan: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });

    const negativeScore = cloneWork(fixture.request);
    (
      (
        (negativeScore[1].stable_result as Record<string, unknown>)
          .row as Record<string, unknown>
      ).search as Record<string, unknown>
    ).raw_search_score = -500;
    resealStableWrapper(negativeScore[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, negativeScore),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).not.toThrow();

    const earlyMate = cloneWork(fixture.request);
    const earlySearch = (
      (earlyMate[1].stable_result as Record<string, unknown>).row as Record<
        string,
        unknown
      >
    ).search as Record<string, unknown>;
    earlySearch.completed_depth = 8;
    earlySearch.termination = "winning-mate-band-early";
    earlySearch.raw_search_score = FLOODGATE_STABLE_MATE_SCORE_MIN;
    resealStableWrapper(earlyMate[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, earlyMate),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).not.toThrow();
  });

  it("accepts authenticated v3 omission and proposal ledgers with schema-bound receipts", async () => {
    const omitted = await generatedFixture("bounded-v3-omitted");
    const omittedResult = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      omitted.request,
      {
        fit: 1,
        tune: 1,
        sealed: 1,
      },
    );
    expect(omittedResult).toMatchObject({
      completedParents: 3,
      completedRows: 39,
      roleRows: { fit: 13, tune: 13, sealed: 13 },
      receipt: {
        teacher_plan: {
          schema: HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA,
        },
      },
    });

    const proposed = await generatedFixture("bounded-v3-proposal");
    const proposedResult = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      proposed.request,
      {
        fit: 1,
        tune: 1,
        sealed: 1,
      },
    );
    expect(proposedResult).toMatchObject({
      completedParents: 3,
      completedRows: 42,
      roleRows: { fit: 14, tune: 14, sealed: 14 },
      receipt: {
        teacher_plan: {
          schema: HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA,
        },
      },
    });
  });

  it("preserves the actual v3r2 plan schema in the verified receipt", async () => {
    const fixture = await generatedFixture("bounded-v3r2-omitted");
    const result = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      fixture.request,
      {
        fit: 1,
        tune: 1,
        sealed: 1,
      },
    );
    expect(result.receipt).toMatchObject({
      teacher_plan: {
        schema: HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2,
      },
    });
  });

  it("preserves the actual v3r3 plan schema in the verified receipt", async () => {
    const fixture = await generatedFixture("bounded-v3r3-omitted");
    const result = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      fixture.request,
      {
        fit: 1,
        tune: 1,
        sealed: 1,
      },
    );
    expect(result.receipt).toMatchObject({
      teacher_plan: {
        schema: HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3,
      },
    });
  });

  it("verifies Yaneura-only v1 ledgers and recomputes stable-WASM absence", async () => {
    const fixture = await generatedFixture("yaneura-only-v1");
    expect(fixture.stableFactoryCalls).toBe(0);
    const result = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      fixture.request,
      {
        fit: 1,
        tune: 1,
        sealed: 1,
      },
    );
    expect(result).toMatchObject({
      completedParents: 3,
      completedRows: 39,
      roleRows: { fit: 13, tune: 13, sealed: 13 },
      receipt: {
        teacher_plan: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1,
        },
        work: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1,
        },
        artifact_verification: {
          stable_wasm_absence_recomputed: true,
          yaneura_only_candidate_generation_recomputed: true,
          row_bounds_2_through_13_recomputed: true,
        },
      },
    });

    const stableHeaderForgery = cloneWork(fixture.request);
    stableHeaderForgery[0].stable_runtime = { forbidden: true };
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, stableHeaderForgery),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/teacher work header fields are not exact/);

    const stableParentForgery = cloneWork(fixture.request);
    stableParentForgery[1].stable_result = { forbidden: true };
    resealWrapper(stableParentForgery[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, stableParentForgery),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/teacher work line 2 fields are not exact/);
  });

  it("verifies isolated Yaneura-only v1r2 recovery schemas", async () => {
    const fixture = await generatedFixture("yaneura-only-v1r2");
    expect(fixture.stableFactoryCalls).toBe(0);
    const result = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      fixture.request,
      { fit: 1, tune: 1, sealed: 1 },
    );
    expect(result).toMatchObject({
      completedParents: 3,
      completedRows: 39,
      receipt: {
        teacher_plan: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2,
        },
        work: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2,
        },
        artifact_verification: {
          stable_wasm_absence_recomputed: true,
          row_bounds_2_through_13_recomputed: true,
        },
      },
    });
  });

  it("verifies isolated Yaneura-only v1r4 recovery schemas", async () => {
    const fixture = await generatedFixture("yaneura-only-v1r4");
    expect(fixture.stableFactoryCalls).toBe(0);
    const result = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      fixture.request,
      { fit: 1, tune: 1, sealed: 1 },
    );
    expect(result).toMatchObject({
      completedParents: 3,
      completedRows: 39,
      receipt: {
        teacher_plan: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4,
        },
        work: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4,
        },
        artifact_verification: {
          stable_wasm_absence_recomputed: true,
          row_bounds_2_through_13_recomputed: true,
        },
      },
    });
  });

  it("verifies v1r6 reset recovery evidence and binds it into the verified receipt", async () => {
    const fixture = await generatedFixture("yaneura-only-v1r6");
    expect(fixture.stableFactoryCalls).toBe(0);
    const work = cloneWork(fixture.request);
    const recoveredWrapper = work
      .slice(1)
      .find(
        (wrapper) =>
          (
            wrapper.reset_timeout_recovery as
              Record<string, unknown> | undefined
          )?.retries_used === 1,
      ) as Record<string, unknown>;
    const recoveredParentId = recoveredWrapper.parent_id;
    const result = validateHalfkp81Depth18TeacherArtifactsCoreForTests(
      fixture.request,
      { fit: 1, tune: 1, sealed: 1 },
    );
    expect(result).toMatchObject({
      completedParents: 3,
      completedRows: 39,
      receipt: {
        teacher_plan: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6,
        },
        work: {
          schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6,
        },
        reset_timeout_recovery: {
          policy: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
          recovered_parents: 1,
          engine_recycles: 1,
          parent_ids: [recoveredParentId],
        },
        artifact_verification: {
          reset_timeout_recovery_evidence_recomputed: true,
        },
      },
    });

    const forged = cloneWork(fixture.request);
    const forgedRecovered = forged
      .slice(1)
      .find(
        (wrapper) =>
          (
            wrapper.reset_timeout_recovery as
              Record<string, unknown> | undefined
          )?.retries_used === 1,
      ) as Record<string, unknown>;
    const recovery = forgedRecovered.reset_timeout_recovery as Record<
      string,
      unknown
    >;
    recovery.engine_recycles = 0;
    resealWrapper(forgedRecovered);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, forged),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/reset timeout recovery evidence differs/);
  });

  it("keeps closed Yaneura-only v1, v1r2, and v1r3 artifacts from production authority", async () => {
    for (const family of [
      "yaneura-only-v1",
      "yaneura-only-v1r2",
      "yaneura-only-v1r3",
    ] as const) {
      const fixture = await generatedFixture(family);
      expect(() =>
        validateHalfkp81Depth18TeacherArtifacts(fixture.request),
      ).toThrow(/closed Yaneura-only v1\/v1r2\/v1r3 family.*use v1r4/);
    }
  });

  it("rejects forged v3 outcomes and stable-source adoption drift", async () => {
    const omitted = await generatedFixture("bounded-v3-omitted");
    const forgedOutcome = cloneWork(omitted.request);
    (
      (forgedOutcome[1].stable_result as Record<string, unknown>)
        .omission as Record<string, unknown>
    ).completed_depth = 8;
    resealWrapper(forgedOutcome[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(omitted.request, forgedOutcome),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/outcome digest/);

    const leakedStableSource = cloneWork(omitted.request);
    const omittedRecords = (
      leakedStableSource[1].teacher_entry as Record<string, unknown>
    ).records as Record<string, unknown>[];
    omittedRecords[0].sources = [
      ...(omittedRecords[0].sources as string[]),
      "stable",
    ];
    resealTeacherEntry(leakedStableSource[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(omitted.request, leakedStableSource),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/stable|sources/);

    const proposed = await generatedFixture("bounded-v3-proposal");
    const missingStableSource = cloneWork(proposed.request);
    const proposalRecords = (
      missingStableSource[1].teacher_entry as Record<string, unknown>
    ).records as Record<string, unknown>[];
    const stableRecord = proposalRecords.find(
      (record) => record.move === "2g2f",
    );
    expect(stableRecord).toBeDefined();
    stableRecord!.sources = (stableRecord!.sources as string[]).filter(
      (source) => source !== "stable",
    );
    resealTeacherEntry(missingStableSource[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(proposed.request, missingStableSource),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/stable|sources/);
  });

  it("rejects wrong role, stable depth/binding, and old depth12 target fields", async () => {
    const fixture = await generatedFixture();
    const wrongRole = cloneWork(fixture.request);
    wrongRole[1].role = "tune";
    resealWrapper(wrongRole[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, wrongRole),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/role/);

    const wrongStable = cloneWork(fixture.request);
    (
      (
        (wrongStable[1].stable_result as Record<string, unknown>).row as Record<
          string,
          unknown
        >
      ).search as Record<string, unknown>
    ).completed_depth = 10;
    resealWrapper(wrongStable[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, wrongStable),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/stable|depth|binding/);

    const oldTarget = cloneWork(fixture.request);
    (oldTarget[1].teacher_entry as Record<string, unknown>).old_depth12_cp = 10;
    resealWrapper(oldTarget[1]);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, oldTarget),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/forbidden old depth12/);
  });

  it("rejects work/output drift, missing wrappers, and raw authority forgery", async () => {
    const fixture = await generatedFixture();
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        {
          ...fixture.request,
          fit: {
            bytes: Buffer.concat([
              Buffer.from(fixture.request.fit.bytes),
              Buffer.from("\n"),
            ]),
            identity: fixture.request.fit.identity,
          },
        },
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/reconstruct/);

    const missing = cloneWork(fixture.request).slice(0, -1);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        withWorkRows(fixture.request, missing),
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/every selected parent/);

    const raw = JSON.parse(
      Buffer.from(fixture.request.rawReceipt.bytes).toString("utf8"),
    ) as Record<string, unknown>;
    (raw.authority as Record<string, unknown>).may_build_training_plan = true;
    const rawBytes = canonicalLine(raw);
    expect(() =>
      validateHalfkp81Depth18TeacherArtifactsCoreForTests(
        {
          ...fixture.request,
          rawReceipt: {
            bytes: rawBytes,
            identity: {
              ...fixture.request.rawReceipt.identity,
              bytes: rawBytes.length,
              sha256: digest(rawBytes),
            },
          },
        },
        { fit: 1, tune: 1, sealed: 1 },
      ),
    ).toThrow(/self-asserts/);
  });

  it("double-reads private files and rejects mode, symlink, and hardlink aliases", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-private-read-"),
    );
    roots.push(root);
    await fs.promises.chmod(root, 0o700);
    const file = path.join(root, "artifact.json");
    await writePrivate(file, Buffer.from("{}\n"));
    const uid = process.geteuid();
    await expect(
      readHalfkp81Depth18PrivateArtifact(file, root, uid, "artifact"),
    ).resolves.toMatchObject({ identity: { bytes: 3 } });

    await fs.promises.chmod(file, 0o644);
    await expect(
      readHalfkp81Depth18PrivateArtifact(file, root, uid, "artifact"),
    ).rejects.toThrow(/0600/);
    await fs.promises.chmod(file, 0o600);

    const link = path.join(root, "link.json");
    await fs.promises.symlink(file, link);
    await expect(
      readHalfkp81Depth18PrivateArtifact(link, root, uid, "link"),
    ).rejects.toThrow();
    await fs.promises.unlink(link);

    const hardlink = path.join(root, "hardlink.json");
    await fs.promises.link(file, hardlink);
    await expect(
      readHalfkp81Depth18PrivateArtifact(file, root, uid, "artifact"),
    ).rejects.toThrow(/single-link/);
  });

  it("independently rejects forged v1r9 Hash8192 route evidence", () => {
    const route = {
      mode: "hash8192-parent-fallback",
      normal_hash_mib: 512,
      normal_limit: {
        depth: 18,
        nodes: 2_000_000_000,
        minimum_completed_depth: 1,
      },
      trigger: {
        move: "7g7f",
        candidate_index_zero_based: 0,
        candidate_count: 13,
        completed_normal_rescores_discarded: 0,
        cap: {
          termination_reason: "node-cap",
          requested_depth: 18,
          node_cap: 2_000_000_000,
          minimum_completed_depth: 1,
          deepest_complete_exact_depth: 17,
          selected_snapshot_nodes: 1_900_000_000,
          maximum_observed_nodes: 2_000_000_000,
          maximum_observed_depth: 18,
          selected_snapshot_bound: "exact",
          discarded_at_or_above_node_cap_updates: 1,
          observed_lowerbound_updates: 0,
          observed_upperbound_updates: 0,
          cap_witness_depth: 18,
          cap_witness_nodes: 2_000_000_000,
          selected_precedes_witness: true,
          completed_iteration_witness_depth: 17,
        },
      },
      normal_engine_reaped_before_fallback: true,
      fallback: {
        hash_mib: 8_192,
        depth: 18,
        timeout_ms: 14_400_000,
        semaphore_limit: 2,
        all_candidates_recomputed: true,
        candidate_count: 13,
        fallback_reset_retries_used: 0,
        discarded_completed_rescores_before_retry: 0,
        searches_executed: 13,
        normal_rescore_rows_reused: 0,
        candidate_omissions: 0,
        engine_quit_before_semaphore_release: true,
      },
    };
    expect(() =>
      validateHalfkp81Depth18V1R9RouteCoreForTests(route, "route"),
    ).not.toThrow();
    expect(() =>
      validateHalfkp81Depth18V1R9RouteCoreForTests(
        {
          ...route,
          fallback: { ...route.fallback, hash_mib: 4_096 },
        },
        "route",
      ),
    ).toThrow(/fallback route evidence differs/);
    expect(() =>
      validateHalfkp81Depth18V1R9RouteCoreForTests(
        {
          ...route,
          trigger: {
            ...route.trigger,
            cap: { ...route.trigger.cap, maximum_observed_depth: 19 },
          },
        },
        "route",
      ),
    ).toThrow(/fallback route evidence differs/);
  });

  it("keeps independent power semantics out of the producer/runner dependency closure", () => {
    const artifactVerifier = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-depth18-teacher-artifact-validation.ts",
      ),
      "utf8",
    );
    const powerVerifier = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-depth18-v1r11-independent-power-verifier.ts",
      ),
      "utf8",
    );
    expect(artifactVerifier).not.toContain(
      'from "./halfkp81-depth18-teacher-runner"',
    );
    expect(powerVerifier).not.toContain("halfkp81-depth18-teacher-runner");
    expect(powerVerifier).not.toContain("v1r11-preformal-authority");
    expect(powerVerifier).not.toContain("v1r11-preformal-gates");
  });
});
