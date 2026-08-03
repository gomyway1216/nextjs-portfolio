import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA,
  HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2,
  HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3,
  HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
  HALFKP81_DEPTH18_TEACHER_DEFAULT_DIRECTORY,
  HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH,
  HALFKP81_DEPTH18_TEACHER_FAULT_SCHEMA,
  HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11,
  HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9,
  Halfkp81Depth18EnvironmentContinuityError,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_DIRECTORY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_DIRECTORY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_PLAN_PATH,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PROCESSES,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PREREGISTRATION_IDENTITY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREREGISTRATION_IDENTITY,
  authenticateHalfkp81Depth18TeacherPlan,
  expectedHalfkp81Depth18YaneuraOnlyInitialMultipv,
  initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests,
  parseExactPinnedHalfkp81Depth18JsonForTests,
  publishHalfkp81Depth18TeacherCreateOnlyCoreForTests,
  runHalfkp81Depth18TeacherCoreForTests,
  runHalfkp81Depth18YaneuraOnlyTeacherV1R5,
  runHalfkp81Depth18YaneuraOnlyPathologicalPreflightCoreV1R5ForTests,
  runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests,
  validateHalfkp81Depth18SelectionRowsCoreForTests,
  validateHalfkp81Depth18V1R9FormalSourceAuthorityForTests,
  validateHalfkp81Depth18YaneuraOnlyPreflightWorkCoreForTests,
  verifyHalfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5,
  type Halfkp81Depth18AuthenticatedTeacherPlan,
  type Halfkp81Depth18TeacherEngine,
  type Halfkp81Depth18TeacherFileIdentity,
  type Halfkp81Depth18TeacherRole,
  type Halfkp81Depth18TeacherRunnerDependencies,
  type Halfkp81Depth18PowerContinuitySession,
  type Halfkp81Depth18TeacherStableRuntime,
} from "../../../ml/halfkp81-depth18-teacher-runner";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
  FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
} from "../../../ml/floodgate-bounded-stable-wasm-runtime-v3";
import {
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
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
  UsiSearchTimeoutError,
  type UsiTeacherEngineOptions,
} from "../../../ml/usi-engine";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const SOURCE_REVISION = "0123456789abcdef0123456789abcdef01234567";
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

function digest(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    )
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${digest(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function identity(
  filePath: string,
  raw: Uint8Array,
): Halfkp81Depth18TeacherFileIdentity {
  return { path: filePath, bytes: raw.byteLength, sha256: digest(raw) };
}

function teacherSettings() {
  return {
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
  } as const;
}

function yaneuraOnlyTeacherSettings() {
  return {
    candidate_policy: {
      deduplication: "USI-move-exact-before-depth18-rescore",
      recorded_move: { required: true },
      stable_wasm: {
        allowed: false,
        calls_per_parent: 0,
        candidate_rows: 0,
        worker_processes: 0,
      },
      yaneuraou_depth16_multipv: {
        depth: 16,
        multipv: 12,
        required: true,
      },
    },
    engine: "YaneuraOu NNUE 9.60git 64APPLEM1",
    hash_mib_per_process: 512,
    ledger_candidate_generation:
      HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
    maximum_rows: 106_496,
    maximum_rows_per_parent: 13,
    minimum_rows_per_parent: 2,
    processes: 13,
    rescore_policy: {
      all_deduplicated_candidates_independently_rescored: true,
      depth: 18,
      old_depth6_or_depth12_cp_target_rows: 0,
    },
    threads_per_process: 1,
    timeout_seconds_per_parent: 600,
  } as const;
}

async function fixture(
  roles: readonly Halfkp81Depth18TeacherRole[],
  options: Readonly<{
    earlyMate?: boolean;
    yaneuraOnly?: boolean;
    yaneuraV1R2?: boolean;
    yaneuraV1R3?: boolean;
    yaneuraV1R4?: boolean;
    yaneuraV1R5?: boolean;
    yaneuraV1R6?: boolean;
    yaneuraV1R9?: boolean;
    v1r9NodeCapCandidateIndex?: number;
    failSearchAt?: number;
    resetTimeoutFailures?: number;
    resetTimeoutAtCalls?: readonly number[];
    unknownResetFailures?: number;
    searchDelayMs?: number;
    parents?: readonly Readonly<{
      parentId?: string;
      sfen: string;
      playedMove: string;
    }>[];
  }> = {},
): Promise<{
  authenticated: Halfkp81Depth18AuthenticatedTeacherPlan;
  dependencies: Halfkp81Depth18TeacherRunnerDependencies;
  root: string;
  proposeCalls: { value: number };
  stableFactoryCalls: { value: number };
  stableCloseCalls: { value: number };
  engineOptions: UsiTeacherEngineOptions[];
  engineStats: Array<{
    resetCalls: number;
    searchCalls: number;
    quitCalls: number;
  }>;
  engineActivity: { active: number; maximum: number };
  fallbackActivity: { active: number; maximum: number };
  engineEvents: string[];
  engineHashEvents: string[];
}> {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "halfkp81-runner-test-"),
  );
  tempRoots.push(root);
  const enginePath = path.join(root, "engine");
  const evalPath = path.join(root, "eval", "eval", "nn.bin");
  const receiptPath = path.join(root, "engine-receipt.json");
  await fs.promises.mkdir(path.dirname(evalPath), { recursive: true });
  await fs.promises.writeFile(enginePath, "engine");
  await fs.promises.writeFile(evalPath, "eval");
  await fs.promises.writeFile(receiptPath, "receipt");
  const binaryRaw = await fs.promises.readFile(enginePath);
  const evalRaw = await fs.promises.readFile(evalPath);
  const receiptRaw = await fs.promises.readFile(receiptPath);
  const parents = roles.map(
    (role, index): Readonly<FloodgateTrainingParent> => {
      const gameId = `sha256:${digest(`game-${index}`)}`;
      const supplied = options.parents?.[index];
      const parentSfen = supplied?.sfen ?? START;
      const ply = Number(parentSfen.split(" ")[3]) - 1;
      return Object.freeze({
        schema_version: 1,
        game_id: gameId,
        parent_id: supplied?.parentId ?? parentId(gameId, ply),
        position_id: positionKeyFromSfen(parentSfen),
        parent_sfen: parentSfen,
        ply,
        played_move: supplied?.playedMove ?? "7g7f",
      });
    },
  );
  const roleMap = new Map(
    parents.map((parent, index) => [parent.parent_id, roles[index]] as const),
  );
  const selectionRows = parents.map((parent, index) =>
    Object.freeze({
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
      source_game_id: parent.game_id,
      game_id: parent.game_id,
      source_game_sha256: digest(`source-game-${index}`),
      position_id: parent.position_id,
      sfen: parent.parent_sfen,
      recorded_move: parent.played_move,
      side_to_move: parent.parent_sfen.split(" ")[1] as "b" | "w",
      ply: parent.ply,
      phase:
        parent.ply <= 39
          ? ("opening" as const)
          : parent.ply <= 79
            ? ("mid" as const)
            : ("late" as const),
      old_depth12_cp: 0,
      old_outcome: 0.5 as const,
      old_depth12_signals_usage: "selection_only_never_teacher_target" as const,
      minimum_player_rating: 3_000,
      sente_rating: 3_000,
      gote_rating: 3_100,
      legal_move_count: rulesCompleteLegalMoves(
        positionFromSfen(parent.parent_sfen).position,
      ).length,
      hardness_cp_outcome_surprise: 0,
      hardness_tiebreak_sha256: digest(`hardness-${index}`),
      role: roles[index],
    }),
  );
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
  const planRaw = Buffer.from("{}\n");
  await fs.promises.writeFile(outputs.plan_json, planRaw);
  const authenticated = {
    plan: Object.freeze({}),
    planIdentity: Object.freeze({
      ...identity(outputs.plan_json, planRaw),
      schema: options.yaneuraV1R6
        ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R6
        : options.yaneuraV1R9
          ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9
          : options.yaneuraV1R5
            ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5
            : options.yaneuraV1R4
              ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4
              : options.yaneuraV1R3
                ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3
                : options.yaneuraV1R2
                  ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2
                  : options.yaneuraOnly
                    ? HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1
                    : "shogi-halfkp81-hard-depth18-teacher-plan-v2",
    }),
    sourceRevision: SOURCE_REVISION,
    selectionIdentity: Object.freeze({
      path: path.join(root, "selection.jsonl"),
      bytes: 1,
      sha256: digest("selection"),
      rows: roles.length,
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
    }),
    selectionManifestIdentity: Object.freeze({
      path: path.join(root, "selection.manifest.json"),
      bytes: 1,
      sha256: digest("manifest"),
      schema: "halfkp81-depth18-hard-parent-selection-manifest-v2",
    }),
    selectionRows: Object.freeze(selectionRows),
    parents: Object.freeze(parents),
    roles: roleMap,
    outputs: Object.freeze(outputs),
    engine: Object.freeze({
      binary: Object.freeze(identity(enginePath, binaryRaw)),
      eval_file: Object.freeze(identity(evalPath, evalRaw)),
      eval_tree_sha256: digest("eval-tree"),
      source_revision: "9133c527791c8b2f5f378a32df29a5e3752bd41b",
      id: "YaneuraOu NNUE 9.60git 64APPLEM1",
    }),
    teacher:
      options.yaneuraOnly ||
      options.yaneuraV1R2 ||
      options.yaneuraV1R3 ||
      options.yaneuraV1R4 ||
      options.yaneuraV1R5 ||
      options.yaneuraV1R6 ||
      options.yaneuraV1R9
        ? yaneuraOnlyTeacherSettings()
        : teacherSettings(),
  } as unknown as Halfkp81Depth18AuthenticatedTeacherPlan;

  const receiptDigest = digest("stable-runtime-receipt");
  const poolDigest = digest("stable-pool-receipt");
  const stableReceipt = Object.freeze({
    contract: "shogi-floodgate-production-stable-wasm-runtime-v1",
    execution_boundary: "production-fixed-asset-authority-and-reusable-pool",
    operational: Object.freeze({
      reusable_pool_receipt_sha256: poolDigest,
    }),
  });
  const proposeCalls = { value: 0 };
  const stableFactoryCalls = { value: 0 };
  const stableCloseCalls = { value: 0 };
  const resetTimeoutFailures = { value: options.resetTimeoutFailures ?? 0 };
  const resetTimeoutAtCalls = new Set(options.resetTimeoutAtCalls ?? []);
  const globalResetCalls = { value: 0 };
  const unknownResetFailures = { value: options.unknownResetFailures ?? 0 };
  const engineStats: Array<{
    resetCalls: number;
    searchCalls: number;
    quitCalls: number;
  }> = [];
  const engineActivity = { active: 0, maximum: 0 };
  const fallbackActivity = { active: 0, maximum: 0 };
  const engineEvents: string[] = [];
  const engineHashEvents: string[] = [];
  const stableRuntime: Halfkp81Depth18TeacherStableRuntime = {
    receipt: stableReceipt,
    receiptDigest,
    propose: async (parent) => {
      proposeCalls.value += 1;
      // Reverse completion order to exercise completion-order durable checkpoints.
      const parentIndex = parents.findIndex(
        (entry) => entry.parent_id === parent.parent_id,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, (parents.length - parentIndex) * 2),
      );
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
        `shogi-floodgate-stable-parent-v1\0${canonical(parentPayload)}`,
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
          requested_depth: 11,
          completed_depth: options.earlyMate ? 5 : 11,
          termination: options.earlyMate
            ? ("winning-mate-band-early" as const)
            : ("requested-depth-complete" as const),
          raw_search_score: options.earlyMate ? 89_995_000 : 10,
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
            `shogi-floodgate-production-stable-runtime-row-v1\0${canonical(row)}`,
          ),
          origin: "direct-owning-runtime-capability-call-v1",
          plain_result_authentication_claim: false,
        },
      } as never;
    },
    close: async () => {
      stableCloseCalls.value += 1;
    },
  };
  class FakeEngine implements Halfkp81Depth18TeacherEngine {
    private readonly stats: {
      resetCalls: number;
      searchCalls: number;
      quitCalls: number;
    };
    private normalCandidateIndex = 0;
    private closed = false;
    private readonly engineIndex: number;
    private readonly hashMb: number;

    constructor(engineOptions: Readonly<UsiTeacherEngineOptions>) {
      this.stats = {
        resetCalls: 0,
        searchCalls: 0,
        quitCalls: 0,
      };
      this.hashMb = engineOptions.hashMb;
      this.engineIndex = engineStats.length;
      engineStats.push(this.stats);
      engineEvents.push(`start:${this.engineIndex}`);
      engineHashEvents.push(`start:${this.engineIndex}:hash${this.hashMb}`);
      engineActivity.active += 1;
      engineActivity.maximum = Math.max(
        engineActivity.maximum,
        engineActivity.active,
      );
      if (this.hashMb === 8_192) {
        fallbackActivity.active += 1;
        fallbackActivity.maximum = Math.max(
          fallbackActivity.maximum,
          fallbackActivity.active,
        );
      }
    }

    async resetForParent(): Promise<void> {
      this.stats.resetCalls += 1;
      globalResetCalls.value += 1;
      if (
        resetTimeoutFailures.value > 0 ||
        resetTimeoutAtCalls.delete(globalResetCalls.value)
      ) {
        resetTimeoutFailures.value = Math.max(
          0,
          resetTimeoutFailures.value - 1,
        );
        throw new UsiResetForParentTimeoutError(
          USI_RESET_FOR_PARENT_TIMEOUT_MS,
        );
      }
      if (unknownResetFailures.value > 0) {
        unknownResetFailures.value -= 1;
        throw new Error("synthetic unknown reset failure");
      }
    }
    async quit(): Promise<void> {
      if (this.closed) return;
      this.closed = true;
      this.stats.quitCalls += 1;
      engineEvents.push(`quit:${this.engineIndex}`);
      engineHashEvents.push(`quit:${this.engineIndex}:hash${this.hashMb}`);
      engineActivity.active -= 1;
      if (this.hashMb === 8_192) fallbackActivity.active -= 1;
    }
    async search(
      sfen: string,
      multipv: number,
      limit: { depth?: number; nodes?: number; minimumCompletedDepth?: number },
      searchmoves: readonly string[],
    ) {
      this.stats.searchCalls += 1;
      if (this.stats.searchCalls === options.failSearchAt) {
        throw new UsiSearchTimeoutError(
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
        );
      }
      if (options.searchDelayMs !== undefined) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.searchDelayMs),
        );
      }
      const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position)
        .map((entry) => entry.usi)
        .filter((move) => move !== "7g7f" && move !== "2g2f");
      const moves =
        searchmoves.length === 1 ? [...searchmoves] : legal.slice(0, multipv);
      const routedCap =
        options.yaneuraV1R9 === true &&
        this.hashMb === 512 &&
        limit.nodes === 2_000_000_000 &&
        searchmoves.length === 1 &&
        this.normalCandidateIndex++ === options.v1r9NodeCapCandidateIndex;
      const depth = routedCap ? 17 : (limit.depth as number);
      return {
        depth,
        lines: moves.map((move, index) => ({
          depth,
          multipv: index + 1,
          cp: (this.hashMb === 8_192 ? 1_000 : 100) - index,
          nodes: routedCap ? 1_900_000_000 : 100,
          move,
          pv: [move],
          scoreKind: "cp" as const,
        })),
        bestmove: moves[0],
        observedNodes: routedCap ? 2_000_000_000 : moves.length * 100,
        ...(limit.nodes === undefined
          ? {}
          : {
              dualBound: {
                terminationReason: routedCap
                  ? ("node-cap" as const)
                  : ("depth" as const),
                requestedDepth: 18,
                nodeCap: 2_000_000_000,
                minimumCompletedDepth: 1,
                deepestCompleteExactDepth: depth,
                selectedSnapshotNodes: routedCap ? 1_900_000_000 : 100,
                maximumObservedNodes: routedCap ? 2_000_000_000 : 100,
                maximumObservedDepth: 18,
                selectedSnapshotBound: "exact" as const,
                discardedAtOrAboveNodeCapUpdates: routedCap ? 1 : 0,
                observedLowerboundUpdates: 0,
                observedUpperboundUpdates: 0,
                capWitnessDepth: routedCap ? 18 : null,
                capWitnessNodes: routedCap ? 2_000_000_000 : null,
                selectedPrecedesWitness: routedCap,
                completedIterationWitnessDepth: depth,
              },
            }),
      };
    }
  }
  const engineOptions: UsiTeacherEngineOptions[] = [];
  const dependencies: Halfkp81Depth18TeacherRunnerDependencies = {
    createStableRuntime: async () => {
      stableFactoryCalls.value += 1;
      return stableRuntime;
    },
    createEngine: async (options) => {
      engineOptions.push(options);
      return new FakeEngine(options);
    },
    authenticateFixedAssets: async () => ({
      binary: identity(enginePath, binaryRaw),
      evalFile: identity(evalPath, evalRaw),
      engineReceipt: {
        ...identity(receiptPath, receiptRaw),
        schema: "shogi-teacher-engine-receipt-v1",
      },
    }),
    processes: Math.min(3, roles.length),
    ...(options.yaneuraOnly ||
    options.yaneuraV1R2 ||
    options.yaneuraV1R3 ||
    options.yaneuraV1R4 ||
    options.yaneuraV1R5 ||
    options.yaneuraV1R6 ||
    options.yaneuraV1R9
      ? { stablePolicy: "yaneuraou-only-v1" as const }
      : {}),
    ...(options.yaneuraV1R9
      ? {
          processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PROCESSES,
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_SEARCH_TIMEOUT_MS,
          parentDeadlinePolicy: "per-search-only" as const,
          resetTimeoutRecoveryPolicy:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        }
      : {}),
  };
  return {
    authenticated,
    dependencies,
    root,
    proposeCalls,
    stableFactoryCalls,
    stableCloseCalls,
    engineOptions,
    engineStats,
    engineActivity,
    fallbackActivity,
    engineEvents,
    engineHashEvents,
  };
}

function coreContract(
  roles: readonly Halfkp81Depth18TeacherRole[],
  maximumRowsPerParent = 14,
) {
  return {
    parentCount: roles.length,
    roleCounts: {
      fit: roles.filter((role) => role === "fit").length,
      tune: roles.filter((role) => role === "tune").length,
      sealed: roles.filter((role) => role === "sealed").length,
    },
    milestones: [],
    maximumRows: roles.length * maximumRowsPerParent,
  };
}

describe("HalfKP81 depth18 teacher runner", () => {
  it("pins the exact tracked v1r9 preregistration bytes", () => {
    const file = path.resolve(
      __dirname,
      `../../../${HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PREREGISTRATION_IDENTITY.path}`,
    );
    const bytes = fs.readFileSync(file);
    expect(bytes.byteLength).toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PREREGISTRATION_IDENTITY.bytes,
    );
    expect(digest(bytes)).toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PREREGISTRATION_IDENTITY.sha256,
    );
    expect(JSON.parse(bytes.toString("utf8")).schema).toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R9_PREREGISTRATION_IDENTITY.schema,
    );
  });

  it("pins the final independently audited v1r11 plan bytes", () => {
    const identity =
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_PREREGISTRATION_IDENTITY;
    expect(identity).toEqual({
      path: "ml/halfkp81-hard-depth18-yaneura-only-v1r11-minimal-r7-plan.json",
      bytes: 156_094,
      sha256:
        "fdd851362531173202fb9b37e639983bf510d7f6a1046e81976ad567bafefddf",
      schema:
        "shogi-halfkp81-hard-depth18-yaneura-only-parent-fallback-ac-power-continuity-plan-v1r11",
    });
    const file = path.resolve(__dirname, `../../../${identity.path}`);
    const bytes = fs.readFileSync(file);
    expect(bytes.byteLength).toBe(identity.bytes);
    expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(
      identity.sha256,
    );
    expect(JSON.parse(bytes.toString("utf8"))).toMatchObject({
      schema: identity.schema,
      teacher: {
        fallback_lane: { search_timeout_milliseconds: 86_400_000 },
        normal_lane: { search_timeout_milliseconds: 14_400_000 },
      },
    });
  });

  it("pins the exact tracked v1r10 recovery preregistration bytes and schema", () => {
    const file = path.resolve(
      __dirname,
      `../../../${HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.path}`,
    );
    const bytes = fs.readFileSync(file);
    expect(bytes.byteLength).toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.bytes,
    );
    expect(digest(bytes)).toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.sha256,
    );
    expect(JSON.parse(bytes.toString("utf8")).schema).toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.schema,
    );
  });

  it("accepts exact pinned pretty JSON only after byte authentication", () => {
    const pretty = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-hard-depth18-bounded-stable-v3r3-plan.json",
      ),
    );
    const expected = {
      bytes: 7_815,
      sha256:
        "5e4e8157d5848fbeca9ecf959d68ed6eca51b0017eb8296ea8ea0ef5bdc24ac7",
    };
    expect(
      parseExactPinnedHalfkp81Depth18JsonForTests(pretty, expected),
    ).toMatchObject({
      schema: "shogi-halfkp81-hard-depth18-bounded-stable-recovery-plan-v3r3",
    });

    const sameLengthDrift = Buffer.from(pretty);
    sameLengthDrift[1] = sameLengthDrift[1] === 0x0a ? 0x20 : 0x0a;
    expect(() =>
      parseExactPinnedHalfkp81Depth18JsonForTests(sameLengthDrift, expected),
    ).toThrow(/identity differs/);

    const yaneuraOnly = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-hard-depth18-yaneura-only-v1-plan.json",
      ),
    );
    expect(
      parseExactPinnedHalfkp81Depth18JsonForTests(yaneuraOnly, {
        bytes: 11_049,
        sha256:
          "b140ee6ec268708e596da6607742f784eaf16b5e9383f9722a36fd1c166a5472",
      }),
    ).toMatchObject({
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-plan-v1",
      teacher: {
        candidate_policy: {
          stable_wasm: {
            allowed: false,
            calls_per_parent: 0,
            candidate_rows: 0,
            worker_processes: 0,
          },
        },
      },
    });

    const yaneuraOnlyV1R2 = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-hard-depth18-yaneura-only-v1r2-plan.json",
      ),
    );
    expect(
      parseExactPinnedHalfkp81Depth18JsonForTests(yaneuraOnlyV1R2, {
        bytes: 15_414,
        sha256:
          "40baa5fa1978f81eaa2a3e4034321d4297d27c2a5e485bc9f754f55b4c00a5e0",
      }),
    ).toMatchObject({
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r2",
      technical_recovery: {
        cross_runtime_canonical_json:
          "ecmascript-compatible-integral-float-normalization-v1",
        strength_contract_changed: false,
        timeout_extension_milliseconds: 0,
      },
    });

    const yaneuraOnlyV1R3 = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-hard-depth18-yaneura-only-v1r3-plan.json",
      ),
    );
    expect(
      parseExactPinnedHalfkp81Depth18JsonForTests(yaneuraOnlyV1R3, {
        bytes: 21_235,
        sha256:
          "9474f94dc9f46ae4100f69680428e6171c0ac9200ddc53ed704369a97d6b10c7",
      }),
    ).toMatchObject({
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r3",
      failed_v1r2: {
        completed_parents: 0,
        teacher_rows: 0,
        work_ledger_created: false,
      },
      technical_recovery: {
        scratch_preflight_directory: {
          create_before_initialize_work: true,
          creation_policy: "create-only-fail-if-target-exists",
          mode: "0700",
          require_empty_real_directory: true,
          symlink_allowed: false,
        },
        strength_contract_changed: false,
        timeout_extension_milliseconds: 0,
      },
    });

    const yaneuraOnlyV1R4 = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-hard-depth18-yaneura-only-v1r4-plan.json",
      ),
    );
    expect(
      parseExactPinnedHalfkp81Depth18JsonForTests(yaneuraOnlyV1R4, {
        bytes: 29_943,
        sha256:
          "29d3356139d7df173150374fa30d117ce01cd5d40cce960be1fe812cc2ce1d7b",
      }),
    ).toMatchObject({
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r4",
      failed_v1r3: {
        completed_parents: 512,
        teacher_rows: 6_134,
        requested_multipv_distribution: {
          "2": 1,
          "6": 1,
          "10": 1,
          "12": 509,
        },
        reuse_completed_parents: 0,
        reuse_teacher_rows: 0,
      },
      technical_recovery: {
        preflight_validator_requested_multipv: {
          expected: "min(12, legal_moves_count)",
          generator_contract_changed: false,
          validator_only_change: true,
        },
        strength_contract_changed: false,
        timeout_extension_milliseconds: 0,
      },
    });

    const yaneuraOnlyV1R5 = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-hard-depth18-yaneura-only-v1r5-plan.json",
      ),
    );
    expect(
      parseExactPinnedHalfkp81Depth18JsonForTests(yaneuraOnlyV1R5, {
        bytes: 9_663,
        sha256:
          "c97892bbc76280490d7f04d867f5c5a86d335bc1868438c31bb74cc4a3e7a595",
      }),
    ).toMatchObject({
      family: "halfkp81-hard-depth18-yaneura-only-v1r5",
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r5",
      predecessor_v1r4: {
        reuse_completed_parents: 0,
        reuse_teacher_rows: 0,
        same_family_resume_authorized: false,
      },
      teacher: {
        processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
        search_timeout_milliseconds:
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
      },
    });

    const yaneuraOnlyV1R6 = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../ml/halfkp81-hard-depth18-yaneura-only-v1r6-plan.json",
      ),
    );
    expect(
      parseExactPinnedHalfkp81Depth18JsonForTests(yaneuraOnlyV1R6, {
        bytes: 10_346,
        sha256:
          "13e6cff20208057e2f23f1811b4698a7e2b085063ef0ed672bb6a788cf3a622b",
      }),
    ).toMatchObject({
      family: "halfkp81-hard-depth18-yaneura-only-v1r6",
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r6",
      predecessor_v1r5: {
        completed_parents: 776,
        reuse_completed_parents: 0,
        reuse_teacher_rows: 0,
      },
      technical_recovery: {
        reset_timeout_recovery_policy:
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        whole_parent_retry_limit: 1,
      },
      teacher: {
        processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
        search_timeout_milliseconds:
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
      },
    });
  });

  it("pins the isolated v1r6 namespace and closes the v1r5 public runner", async () => {
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_DIRECTORY).toBe(
      "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r6",
    );
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_PLAN_PATH).toBe(
      `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_DEFAULT_DIRECTORY}/teacher-plan.json`,
    );
    await expect(runHalfkp81Depth18YaneuraOnlyTeacherV1R5()).rejects.toThrow(
      /v1r5 formal runner is closed.*use v1r6/,
    );
  });

  it("pins the v1r5 resource-recovery namespace and pathological sentinel", () => {
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES).toBe(4);
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS).toBe(3_600_000);
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY).toBe(
      "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r5",
    );
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_PLAN_PATH).toBe(
      `${HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY}/teacher-plan.json`,
    );
    expect(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_DIRECTORY,
    ).not.toBe(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_DEFAULT_DIRECTORY);
    expect(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_RECEIPT_SCHEMA,
    ).toBe(
      "shogi-halfkp81-hard-depth18-yaneura-only-pathological-preflight-receipt-v1r5",
    );
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT).toEqual({
      selection_index_one_based: 2_702,
      parent_id:
        "sha256:5a0784bfa36f2961049c1eae3ca13fe041d089abad1228f9d935f48723826dae",
      sfen: "lgk2B1nl/6g2/2g+Sppsp1/p5p1p/2S4P1/3P1P2P/PP2P4/2+b6/LN2KG1NL w SN2P2r3p 64",
      recorded_move: "7c6c",
    });
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R5).not.toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4 as string,
    );
    expect(HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5).not.toBe(
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4 as string,
    );
  });

  it("changes only resource policy in v1r5 and reuses zero v1r4 rows", () => {
    const preregistration = JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../../ml/halfkp81-hard-depth18-yaneura-only-v1r5-plan.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const teacher = preregistration.teacher as Record<string, unknown>;
    const predecessor = preregistration.predecessor_v1r4 as Record<
      string,
      unknown
    >;
    const recovery = preregistration.technical_recovery as Record<
      string,
      unknown
    >;
    const baseline = yaneuraOnlyTeacherSettings();

    expect(preregistration).toMatchObject({
      family: "halfkp81-hard-depth18-yaneura-only-v1r5",
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r5",
      status: "prospective-pathological-long-tail-recovery-not-executed",
    });
    expect(predecessor).toMatchObject({
      status: "terminal-fault-family-stopped",
      reuse_completed_parents: 0,
      reuse_teacher_rows: 0,
      same_family_resume_authorized: false,
    });
    expect(recovery).toMatchObject({
      aggregate_600_second_parent_race_removed: true,
      candidate_generation_contract_changed: false,
      formal_processes_previous: 13,
      formal_processes_v1r5: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
      partial_parent_publication_allowed: false,
      partial_parent_reuse: 0,
      per_search_timeout_milliseconds:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
      selection_contract_changed: false,
      strength_contract_changed: false,
      teacher_generation_contract_changed: false,
      training_contract_changed: false,
      v1r4_rows_reused: 0,
    });
    expect(teacher).toMatchObject({
      candidate_policy: baseline.candidate_policy,
      engine: baseline.engine,
      hash_mib_per_process: baseline.hash_mib_per_process,
      ledger_candidate_generation: baseline.ledger_candidate_generation,
      maximum_rows: baseline.maximum_rows,
      maximum_rows_per_parent: baseline.maximum_rows_per_parent,
      minimum_rows_per_parent: baseline.minimum_rows_per_parent,
      processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
      rescore_policy: baseline.rescore_policy,
      search_timeout_milliseconds:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
      threads_per_process: baseline.threads_per_process,
      whole_parent_publication:
        "durable-only-after-proposal-and-all-depth18-rescores-pass",
    });
  });

  it("requires four deterministic pathological-sentinel replicas before formal v1r5", async () => {
    const sentinelIndex =
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT.selection_index_one_based -
      1;
    const roles = Array.from(
      { length: sentinelIndex + 1 },
      () => "fit" as const,
    );
    const parents: Array<
      | Readonly<{ parentId?: string; sfen: string; playedMove: string }>
      | undefined
    > = [];
    parents[sentinelIndex] = {
      parentId:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT.parent_id,
      sfen: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT.sfen,
      playedMove:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT.recorded_move,
    };
    const value = await fixture(roles, {
      yaneuraV1R5: true,
      parents: parents as readonly Readonly<{
        parentId?: string;
        sfen: string;
        playedMove: string;
      }>[],
    });
    const output = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-v1r5-pathological-test-"),
    );
    tempRoots.push(output);
    let clock = 0;
    const result =
      await runHalfkp81Depth18YaneuraOnlyPathologicalPreflightCoreV1R5ForTests(
        value.authenticated,
        output,
        { ...value.dependencies, now: () => ++clock },
      );

    expect(result.receipt).toMatchObject({
      schema:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PREFLIGHT_RECEIPT_SCHEMA,
      status: "pathological-four-way-scratch-preflight-passed",
      scope: "scratch-only-never-formal-training-data",
      parent: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PATHOLOGICAL_PARENT,
      parallel_replicas: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
      search_timeout_ms: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
      parent_deadline_policy: "per-search-only-no-aggregate-parent-race",
      process_cleanup: {
        engines_started: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
        engines_quit: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
        active_engines_at_receipt: 0,
      },
      authority: {
        may_replace_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    const replicas = result.receipt.replicas as Array<{
      teacher_payload_sha256: string;
    }>;
    expect(replicas).toHaveLength(HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES);
    expect(
      new Set(replicas.map((replica) => replica.teacher_payload_sha256)).size,
    ).toBe(1);
    expect(value.engineOptions).toHaveLength(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
    );
    expect(
      value.engineOptions.every(
        (options) =>
          options.timeoutMs === HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
      ),
    ).toBe(true);
    expect(value.stableFactoryCalls.value).toBe(0);
    expect(value.proposeCalls.value).toBe(0);
    await expect(
      verifyHalfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5(
        value.authenticated,
        result.receiptIdentity.path,
      ),
    ).resolves.toEqual(result.receiptIdentity);

    const tamperedReceipts = [
      {
        label: "scope",
        mutate: (receipt: Record<string, unknown>) => {
          receipt.scope = "formal-training-data";
        },
      },
      {
        label: "timeout",
        mutate: (receipt: Record<string, unknown>) => {
          receipt.search_timeout_ms = 600_000;
        },
      },
      {
        label: "deadline",
        mutate: (receipt: Record<string, unknown>) => {
          receipt.parent_deadline_policy = "aggregate";
        },
      },
      {
        label: "candidate-generation",
        mutate: (receipt: Record<string, unknown>) => {
          receipt.candidate_generation = {
            ...(receipt.candidate_generation as Record<string, unknown>),
            proposal_depth: 15,
          };
        },
      },
    ] as const;
    for (const tamper of tamperedReceipts) {
      const receipt = structuredClone(result.receipt) as Record<
        string,
        unknown
      >;
      tamper.mutate(receipt);
      const tamperedPath = path.join(output, `${tamper.label}.json`);
      await fs.promises.writeFile(tamperedPath, `${canonical(receipt)}\n`, {
        mode: 0o600,
      });
      await expect(
        verifyHalfkp81Depth18YaneuraOnlyPathologicalPreflightV1R5(
          value.authenticated,
          tamperedPath,
        ),
      ).rejects.toThrow(/pathological preflight receipt differs/);
    }
  });

  it("keeps the startup-faulted v3 family closed", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-closed-v3-test-"),
    );
    tempRoots.push(root);
    const planPath = path.join(root, "teacher-plan.json");
    await fs.promises.writeFile(
      planPath,
      `${canonical({
        schema: HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA,
      })}\n`,
    );
    await expect(
      authenticateHalfkp81Depth18TeacherPlan(planPath),
    ).rejects.toThrow(/v3 family closed after startup fault; use v3r3/);
  });

  it("keeps the source-transfer-faulted v3r2 family closed", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-closed-v3r2-test-"),
    );
    tempRoots.push(root);
    const planPath = path.join(root, "teacher-plan.json");
    await fs.promises.writeFile(
      planPath,
      `${canonical({
        schema: HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R2,
      })}\n`,
    );
    await expect(
      authenticateHalfkp81Depth18TeacherPlan(planPath),
    ).rejects.toThrow(
      /v3r2 family closed after worker source transfer startup fault; use v3r3/,
    );
  });

  it("keeps the worker-replacement-faulted v3r3 family closed", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-closed-v3r3-test-"),
    );
    tempRoots.push(root);
    const planPath = path.join(root, "teacher-plan.json");
    await fs.promises.writeFile(
      planPath,
      `${canonical({
        schema: HALFKP81_DEPTH18_BOUNDED_STABLE_TEACHER_PLAN_SCHEMA_V3R3,
      })}\n`,
    );
    await expect(
      authenticateHalfkp81Depth18TeacherPlan(planPath),
    ).rejects.toThrow(/v3r3 family closed.*Yaneura-only v1/);
  });

  it("closes v1 before its Python float spelling reaches canonical parsing", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-closed-yaneura-v1-test-"),
    );
    tempRoots.push(root);
    const planPath = path.join(root, "teacher-plan.json");
    await fs.promises.writeFile(
      planPath,
      `{"schema":"${HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1}","value":300.0}\n`,
    );
    await expect(
      authenticateHalfkp81Depth18TeacherPlan(planPath),
    ).rejects.toThrow(/v1 family closed.*use v1r4/);
  });

  it("keeps the zero-row missing-directory v1r2 family closed", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-closed-yaneura-v1r2-test-"),
    );
    tempRoots.push(root);
    const planPath = path.join(root, "teacher-plan.json");
    await fs.promises.writeFile(
      planPath,
      `${canonical({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2,
      })}\n`,
    );
    await expect(
      authenticateHalfkp81Depth18TeacherPlan(planPath),
    ).rejects.toThrow(/v1r2 family closed.*use v1r4/);
  });

  it("keeps the completed-but-validator-faulted v1r3 family closed", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-closed-yaneura-v1r3-test-"),
    );
    tempRoots.push(root);
    const planPath = path.join(root, "teacher-plan.json");
    await fs.promises.writeFile(
      planPath,
      `${canonical({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3,
      })}\n`,
    );
    await expect(
      authenticateHalfkp81Depth18TeacherPlan(planPath),
    ).rejects.toThrow(/v1r3 family closed.*MultiPV clamp mismatch.*use v1r4/);
  });

  it("keeps the aggregate-timeout v1r4 family closed with zero successor reuse", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-closed-yaneura-v1r4-test-"),
    );
    tempRoots.push(root);
    const planPath = path.join(root, "teacher-plan.json");
    await fs.promises.writeFile(
      planPath,
      `${canonical({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4,
      })}\n`,
    );
    await expect(
      authenticateHalfkp81Depth18TeacherPlan(planPath),
    ).rejects.toThrow(/v1r4 family closed.*aggregate parent timeout.*use v1r5/);
  });

  it.each([
    ["v1", { yaneuraOnly: true }],
    ["v1r2", { yaneuraV1R2: true }],
    ["v1r3", { yaneuraV1R3: true }],
  ] as const)(
    "rejects the closed %s family before preflight output",
    async (_family, options) => {
      const value = await fixture(["fit"], options);
      const output = path.join(value.root, "closed-family-preflight");
      await fs.promises.mkdir(output);
      await expect(
        runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests(
          value.authenticated,
          output,
          value.dependencies,
          { fit: 1, tune: 0, sealed: 0 },
        ),
      ).rejects.toThrow(/only v1r4 is authorized/);
      expect(await fs.promises.readdir(output)).toEqual([]);
    },
  );

  it.each([
    [2, 2],
    [6, 6],
    [10, 10],
    [12, 12],
    [30, 12],
  ])(
    "clamps Yaneura-only initial MultiPV for %i legal moves to %i",
    (legal, expected) => {
      expect(expectedHalfkp81Depth18YaneuraOnlyInitialMultipv(legal)).toBe(
        expected,
      );
    },
  );

  it("rejects invalid legal counts before deriving initial MultiPV", () => {
    for (const invalid of [-1, 0, 1, 2.5, Number.NaN]) {
      expect(() =>
        expectedHalfkp81Depth18YaneuraOnlyInitialMultipv(invalid),
      ).toThrow(/at least two legal moves/);
    }
  });

  it("integrates 2/6/10/12 MultiPV clamps with candidate, record, and exact-search alignment", async () => {
    const positions = [
      {
        sfen: "ln1gk1s1l/2s3+R+b1/p1pppp2p/6p2/2B6/2P3P2/P1gPPP2P/2K6/L1G2GSNL b RSN2Pn2p 33",
        playedMove: "7h6i",
      },
      {
        sfen: "lr1g2snl/1+Rs1k1gp1/pP1ppp2p/2p4P1/3n5/2bP2P2/P3PP2P/2G1K4/LNS2GSNL b BP2p 39",
        playedMove: "B*6g",
      },
      {
        sfen: "ln1g3nl/2s1ksg2/2pppp2p/p4b1P1/9/1PPP4P/P1S1PPP2/2G1K2+r1/LN3GSNL b BPr2p 39",
        playedMove: "3i2h",
      },
      {
        sfen: "lns1kr1nl/2b1g1g2/1p2ppsp1/p1pp2p1p/7P1/P1P1SP2P/1P1PP1PB1/1SK4R1/LN1G1G1NL b - 27",
        playedMove: "3g3f",
      },
    ] as const;
    const roles = ["fit", "fit", "tune", "sealed"] as const;
    const value = await fixture(roles, {
      yaneuraV1R4: true,
      parents: positions,
    });
    const output = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-yaneura-v1r4-clamp-test-"),
    );
    tempRoots.push(output);
    const result = await runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests(
      value.authenticated,
      output,
      value.dependencies,
      { fit: 2, tune: 1, sealed: 1 },
    );
    expect(result.receipt).toMatchObject({
      verification: {
        requested_multipv_histogram: {
          "2": 1,
          "6": 1,
          "10": 1,
          "12": 1,
        },
      },
    });
    const workPath = path.join(output, "teacher-work.jsonl");
    const work = (await fs.promises.readFile(workPath, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const wrapper of work.slice(1)) {
      const entry = wrapper.teacher_entry as {
        candidate_moves: string[];
        records: Array<{ move: string }>;
        exact_search: { searches: Array<{ moves: string[] }> };
      };
      expect([...entry.candidate_moves].sort()).toEqual(
        entry.records.map((record) => record.move).sort(),
      );
      expect([...entry.candidate_moves].sort()).toEqual(
        entry.exact_search.searches.map((search) => search.moves[0]).sort(),
      );
    }
    const illegalLiteralTwelve = structuredClone(work);
    (
      illegalLiteralTwelve[1].teacher_entry as {
        initial_search: { requested_multipv: number };
      }
    ).initial_search.requested_multipv = 12;
    const forgedRaw = Buffer.from(
      `${illegalLiteralTwelve.map(canonical).join("\n")}\n`,
    );
    expect(() =>
      validateHalfkp81Depth18YaneuraOnlyPreflightWorkCoreForTests(forgedRaw, {
        planIdentity: value.authenticated.planIdentity,
        parents: value.authenticated.parents,
      }),
    ).toThrow(/search or legal-row evidence differs/);

    const wrongCardinality = structuredClone(work);
    (
      wrongCardinality[2].teacher_entry as {
        initial_search: { moves: string[] };
      }
    ).initial_search.moves.pop();
    expect(() =>
      validateHalfkp81Depth18YaneuraOnlyPreflightWorkCoreForTests(
        Buffer.from(`${wrongCardinality.map(canonical).join("\n")}\n`),
        {
          planIdentity: value.authenticated.planIdentity,
          parents: value.authenticated.parents,
        },
      ),
    ).toThrow(/search or legal-row evidence differs/);
  });

  it("isolates formal v2 output from the terminal-faulted v1 directory", () => {
    expect(HALFKP81_DEPTH18_TEACHER_DEFAULT_DIRECTORY).toBe(
      "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-engine-evaldir-v2",
    );
    expect(HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH).toBe(
      `${HALFKP81_DEPTH18_TEACHER_DEFAULT_DIRECTORY}/teacher-plan.json`,
    );
  });

  it("passes the exact directory containing nn.bin as EvalDir", async () => {
    const roles = ["fit"] as const;
    const { authenticated, dependencies, engineOptions } = await fixture(roles);

    await runHalfkp81Depth18TeacherCoreForTests(
      authenticated,
      dependencies,
      coreContract(roles),
    );

    expect(engineOptions).toHaveLength(1);
    expect(engineOptions[0]).toMatchObject({
      engineBin: authenticated.engine.binary.path,
      evalDir: path.dirname(authenticated.engine.eval_file.path),
      fvScale: 20,
      hashMb: 512,
    });
    expect(path.join(engineOptions[0].evalDir as string, "nn.bin")).toBe(
      authenticated.engine.eval_file.path,
    );
    expect(engineOptions[0].evalDir).not.toBe(
      path.dirname(path.dirname(authenticated.engine.eval_file.path)),
    );
  });

  it("routes a capped v1r9 parent to a fresh Hash8192 full rescore", async () => {
    const value = await fixture(["fit"], {
      yaneuraV1R9: true,
      v1r9NodeCapCandidateIndex: 0,
    });

    const result = await runHalfkp81Depth18TeacherCoreForTests(
      value.authenticated,
      value.dependencies,
      coreContract(["fit"], 13),
    );

    expect(value.engineOptions.map((options) => options.hashMb)).toEqual([
      512, 8_192, 512,
    ]);
    expect(value.engineEvents.slice(0, 5)).toEqual([
      "start:0",
      "quit:0",
      "start:1",
      "quit:1",
      "start:2",
    ]);
    const rows = (
      await fs.promises.readFile(value.authenticated.outputs.work_jsonl, "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows[0]).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9,
      candidate_generation:
        HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9,
    });
    expect(rows[1]).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R9,
      rescore_route: {
        mode: "hash8192-parent-fallback",
        normal_engine_reaped_before_fallback: true,
        fallback: {
          hash_mib: 8_192,
          all_candidates_recomputed: true,
          normal_rescore_rows_reused: 0,
          candidate_omissions: 0,
          engine_quit_before_semaphore_release: true,
        },
      },
    });
    const teacher = rows[1].teacher_entry as {
      candidate_moves: string[];
      exact_search: {
        searches: Array<{
          requested_limit: unknown;
          scores: Array<{ cp: number }>;
        }>;
      };
    };
    expect(teacher.exact_search.searches).toHaveLength(
      teacher.candidate_moves.length,
    );
    expect(
      teacher.exact_search.searches.every(
        (search) =>
          canonical(search.requested_limit) === canonical({ depth: 18 }) &&
          search.scores[0].cp >= 988,
      ),
    ).toBe(true);
    expect(result.receipt).toMatchObject({
      hash8192_fallback_recount: {
        fallback_parents: 1,
        cap_trigger_searches: 1,
        fallback_rows: teacher.candidate_moves.length,
        capped_teacher_labels: 0,
      },
    });
  });

  it("keeps a complete v1r9 parent on the Hash512 normal lane", async () => {
    const value = await fixture(["fit"], { yaneuraV1R9: true });

    await runHalfkp81Depth18TeacherCoreForTests(
      value.authenticated,
      value.dependencies,
      coreContract(["fit"], 13),
    );

    expect(value.engineOptions.map((options) => options.hashMb)).toEqual([512]);
    const rows = (
      await fs.promises.readFile(value.authenticated.outputs.work_jsonl, "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows[1]).toMatchObject({
      rescore_route: { mode: "normal-depth18", fallback: null },
      reset_timeout_recovery: { fallback_retries_used: 0 },
    });
  });

  it("rejects v1r9 formal execution away from its clean sealed main revision", () => {
    const valid = {
      branch: "main",
      head: SOURCE_REVISION,
      main: SOURCE_REVISION,
      status: "",
      captured: SOURCE_REVISION,
      planSourceRevision: SOURCE_REVISION,
    };
    expect(() =>
      validateHalfkp81Depth18V1R9FormalSourceAuthorityForTests(valid),
    ).not.toThrow();
    expect(() =>
      validateHalfkp81Depth18V1R9FormalSourceAuthorityForTests({
        ...valid,
        status: " M ml/halfkp81-depth18-teacher-runner.ts",
      }),
    ).toThrow(/clean main/);
    expect(() =>
      validateHalfkp81Depth18V1R9FormalSourceAuthorityForTests({
        ...valid,
        planSourceRevision: "f".repeat(40),
      }),
    ).toThrow(/sealed runtime-plan source revision/);
  });

  it("keeps the legacy v1r11 evidence publisher unreachable from production", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../ml/halfkp81-depth18-teacher-runner.ts"),
      "utf8",
    );
    const v1r9Start = source.indexOf(
      "export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R9(",
    );
    const v1r10Start = source.indexOf(
      "export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R10(",
    );
    const v1r11Start = source.indexOf(
      "export async function runHalfkp81Depth18YaneuraOnlyTeacherV1R11(",
    );
    const modernV1R11Start = source.indexOf(
      "export interface Halfkp81Depth18V1R11ModernVerifiedAuthorityRequest",
      v1r11Start,
    );
    expect(v1r9Start).toBeGreaterThan(0);
    expect(v1r10Start).toBeGreaterThan(v1r9Start);
    expect(v1r11Start).toBeGreaterThan(v1r9Start);
    const v1r9Wrapper = source.slice(v1r9Start, v1r10Start);
    expect(modernV1R11Start).toBeGreaterThan(v1r11Start);
    const v1r11Wrapper = source.slice(v1r11Start, modernV1R11Start);
    const semanticLock = v1r11Wrapper.indexOf(
      "assertHalfkp81Depth18V1R11SemanticPreformalAuthorityForTests();",
    );
    expect(source).not.toContain(
      "mintHalfkp81Depth18V1R11FormalAuthorityForTests",
    );
    expect(semanticLock).toBeGreaterThan(0);
    expect(v1r9Wrapper).not.toContain(
      "authenticateHalfkp81Depth18V1R11LaunchdAuthority(",
    );
    expect(v1r11Wrapper).not.toContain(
      "authenticateHalfkp81Depth18V1R11LaunchdAuthority(",
    );
    expect(v1r11Wrapper).not.toContain(
      "authenticateHalfkp81Depth18V1R11PreformalAuthority(",
    );
    expect(v1r11Wrapper).not.toContain(
      "runHalfkp81Depth18TeacherCoreForTests(",
    );
    expect(v1r11Wrapper).toContain(
      "legacy v1r11 wrapper cannot authenticate or publish LaunchAgent evidence",
    );
  });

  it("admits Hash8192 fallbacks through the fixed FIFO concurrency-two lane", async () => {
    const roles = ["fit", "tune", "sealed"] as const;
    const value = await fixture(roles, {
      yaneuraV1R9: true,
      v1r9NodeCapCandidateIndex: 0,
      searchDelayMs: 2,
    });

    await runHalfkp81Depth18TeacherCoreForTests(
      value.authenticated,
      value.dependencies,
      coreContract(roles, 13),
    );

    expect(value.fallbackActivity).toEqual({ active: 0, maximum: 2 });
    const fallbackEvents = value.engineHashEvents.filter((event) =>
      event.endsWith("hash8192"),
    );
    expect(
      fallbackEvents.filter((event) => event.startsWith("start")),
    ).toHaveLength(3);
    expect(
      fallbackEvents.filter((event) => event.startsWith("quit")),
    ).toHaveLength(3);
    const thirdStart = fallbackEvents.findIndex(
      (event, index) =>
        event.startsWith("start") &&
        fallbackEvents
          .slice(0, index + 1)
          .filter((candidate) => candidate.startsWith("start")).length === 3,
    );
    expect(thirdStart).toBeGreaterThan(1);
    expect(
      fallbackEvents
        .slice(0, thirdStart)
        .some((event) => event.startsWith("quit")),
    ).toBe(true);
  });

  it("accounts discarded fallback searches before its one typed reset retry", async () => {
    const value = await fixture(["fit"], {
      yaneuraV1R9: true,
      v1r9NodeCapCandidateIndex: 0,
      resetTimeoutAtCalls: [4],
    });

    const result = await runHalfkp81Depth18TeacherCoreForTests(
      value.authenticated,
      value.dependencies,
      coreContract(["fit"], 13),
    );
    const rows = (
      await fs.promises.readFile(value.authenticated.outputs.work_jsonl, "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const teacher = rows[1].teacher_entry as { candidate_moves: string[] };
    expect(rows[1]).toMatchObject({
      reset_timeout_recovery: { fallback_retries_used: 1 },
      rescore_route: {
        fallback: {
          fallback_reset_retries_used: 1,
          discarded_completed_rescores_before_retry: 1,
          searches_executed: teacher.candidate_moves.length + 1,
        },
      },
    });
    expect(result.receipt).toMatchObject({
      hash8192_fallback_recount: {
        fallback_rows: teacher.candidate_moves.length,
        fallback_searches: teacher.candidate_moves.length + 1,
      },
    });
    expect(
      value.engineOptions.filter((options) => options.hashMb === 8_192),
    ).toHaveLength(2);

    for (const output of [
      value.authenticated.outputs.receipt_json,
      value.authenticated.outputs.fit_jsonl,
      value.authenticated.outputs.tune_jsonl,
      value.authenticated.outputs.sealed_jsonl,
    ]) {
      await fs.promises.unlink(output);
    }
    const gameId = `sha256:${digest("resume-game")}`;
    const resumedParent = Object.freeze({
      ...value.authenticated.parents[0],
      game_id: gameId,
      parent_id: parentId(gameId, 0),
    });
    const expandedAuthenticated = {
      ...value.authenticated,
      parents: Object.freeze([value.authenticated.parents[0], resumedParent]),
      roles: new Map([
        [value.authenticated.parents[0].parent_id, "fit" as const],
        [resumedParent.parent_id, "fit" as const],
      ]),
    } as Halfkp81Depth18AuthenticatedTeacherPlan;
    const resumed = await runHalfkp81Depth18TeacherCoreForTests(
      expandedAuthenticated,
      value.dependencies,
      coreContract(["fit", "fit"], 13),
    );
    expect(resumed.receipt).toMatchObject({
      hash8192_fallback_recount: {
        fallback_parents: 2,
        fallback_rows: teacher.candidate_moves.length * 2,
        fallback_searches: teacher.candidate_moves.length * 2 + 1,
      },
    });
  });

  it("strictly authenticates canonical selection rows and derives parent IDs", () => {
    const gameId = `sha256:${digest("selection-game")}`;
    const selectionSfen = START.replace(/ 1$/u, " 13");
    const row = {
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
      source_game_id: gameId,
      game_id: gameId,
      source_game_sha256: digest("source-game"),
      position_id: positionKeyFromSfen(selectionSfen),
      sfen: selectionSfen,
      recorded_move: "7g7f",
      side_to_move: "b",
      ply: 12,
      phase: "opening",
      old_depth12_cp: 0,
      old_outcome: 0.5,
      old_depth12_signals_usage: "selection_only_never_teacher_target",
      minimum_player_rating: 3000,
      sente_rating: 3000,
      gote_rating: 3100,
      legal_move_count: rulesCompleteLegalMoves(
        positionFromSfen(selectionSfen).position,
      ).length,
      hardness_cp_outcome_surprise: 0,
      hardness_tiebreak_sha256: digest(
        `${canonical({
          game_id: gameId,
          minimum_player_rating: 3000,
          old_depth12_cp: 0,
          old_outcome: 0.5,
          position_id: positionKeyFromSfen(selectionSfen),
        })}\n`,
      ),
      role: "fit",
    };
    const raw = Buffer.from(`${canonical(row)}\n`);
    const result = validateHalfkp81Depth18SelectionRowsCoreForTests(raw, 1, {
      fit: 1,
      tune: 0,
      sealed: 0,
    });
    expect(result.parents[0].parent_id).toBe(parentId(gameId, 12));
    expect(() =>
      validateHalfkp81Depth18SelectionRowsCoreForTests(
        Buffer.from(`${JSON.stringify({ ...row, legal_move_count: 2 })}\n`),
        1,
        { fit: 1, tune: 0, sealed: 0 },
      ),
    ).toThrow(/canonical JSON|legal-move evidence/);
  });

  it("persists full stable evidence, unions the stable move, splits roles, and publishes receipt last", async () => {
    const roles = ["fit", "fit", "tune", "sealed"] as const;
    const { authenticated, dependencies } = await fixture(roles);
    const result = await runHalfkp81Depth18TeacherCoreForTests(
      authenticated,
      dependencies,
      coreContract(roles),
    );
    expect(result.receipt.schema).toBe(HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA);
    const workLines = (
      await fs.promises.readFile(authenticated.outputs.work_jsonl, "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(workLines[0].schema).toBe(HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA);
    expect(new Set(workLines.slice(1).map((entry) => entry.parent_id))).toEqual(
      new Set(authenticated.parents.map((parent) => parent.parent_id)),
    );
    for (const entry of workLines.slice(1)) {
      expect(entry.stable_result.row.search).toMatchObject({
        requested_depth: 11,
        completed_depth: 11,
      });
      expect(entry.teacher_entry.records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            move: "2g2f",
            sources: expect.arrayContaining(["stable"]),
          }),
        ]),
      );
    }
    for (const role of ["fit", "tune", "sealed"] as const) {
      const rows = (
        await fs.promises.readFile(
          authenticated.outputs[`${role}_jsonl`],
          "utf8",
        )
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(new Set(rows.map((row) => row.parent_id))).toEqual(
        new Set(
          authenticated.parents
            .filter(
              (parent) => authenticated.roles.get(parent.parent_id) === role,
            )
            .map((parent) => parent.parent_id),
        ),
      );
    }
    const receiptStat = await fs.promises.stat(
      authenticated.outputs.receipt_json,
      {
        bigint: true,
      },
    );
    for (const role of ["fit", "tune", "sealed"] as const) {
      const artifactStat = await fs.promises.stat(
        authenticated.outputs[`${role}_jsonl`],
        { bigint: true },
      );
      expect(receiptStat.mtimeNs).toBeGreaterThanOrEqual(artifactStat.mtimeNs);
    }
  });

  it("repairs a torn tail and resumes entirely from durable work", async () => {
    const roles = ["fit", "tune", "sealed"] as const;
    const first = await fixture(roles);
    await runHalfkp81Depth18TeacherCoreForTests(
      first.authenticated,
      first.dependencies,
      coreContract(roles),
    );
    for (const output of [
      first.authenticated.outputs.receipt_json,
      first.authenticated.outputs.fit_jsonl,
      first.authenticated.outputs.tune_jsonl,
      first.authenticated.outputs.sealed_jsonl,
    ]) {
      await fs.promises.rm(output);
    }
    await fs.promises.appendFile(
      first.authenticated.outputs.work_jsonl,
      '{"torn":',
    );
    const callsBeforeResume = first.proposeCalls.value;
    await runHalfkp81Depth18TeacherCoreForTests(
      first.authenticated,
      first.dependencies,
      coreContract(roles),
    );
    expect(first.proposeCalls.value).toBe(callsBeforeResume);
    expect(
      (await fs.promises.readFile(first.authenticated.outputs.work_jsonl)).at(
        -1,
      ),
    ).toBe(0x0a);
  });

  it("accepts the production depth11 stable runtime winning-mate early completion", async () => {
    const roles = ["fit"] as const;
    const value = await fixture(roles, { earlyMate: true });
    const result = await runHalfkp81Depth18TeacherCoreForTests(
      value.authenticated,
      value.dependencies,
      coreContract(roles),
    );
    expect(result.receipt).toMatchObject({
      technical_faults: 0,
      completed_parents: 1,
    });
  });

  it("records a bounded stable omission and still depth18-labels required YaneuraOu and recorded candidates", async () => {
    const roles = ["fit"] as const;
    const value = await fixture(roles);
    const receiptDigest = digest("bounded-stable-v3-receipt");
    const boundedDependencies: Halfkp81Depth18TeacherRunnerDependencies = {
      ...value.dependencies,
      stablePolicy: "optional-bounded-depth11-v3",
      createStableRuntime: async () => ({
        receipt: Object.freeze({
          contract: "shogi-floodgate-bounded-stable-wasm-runtime-v3",
        }),
        receiptDigest,
        propose: async (parent) => {
          const parentPayload = {
            schema_version: parent.schema_version,
            game_id: parent.game_id,
            parent_id: parent.parent_id,
            position_id: parent.position_id,
            parent_sfen: parent.parent_sfen,
            ply: parent.ply,
            played_move: parent.played_move,
          };
          const body = {
            schema: FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
            outcome: "omitted" as const,
            row: null,
            omission: {
              reason: "cooperative-deadline" as const,
              search_budget_ms:
                FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
              completed_depth: 8,
              partial_result_adopted: false as const,
              worker_reaped: true as const,
              worker_replaced: true as const,
            },
          };
          return {
            ...body,
            runtime_binding: {
              runtime_receipt_sha256: receiptDigest,
              parent_payload_sha256: digest(
                `shogi-floodgate-bounded-stable-parent-v3\0${canonical(parentPayload)}`,
              ),
              outcome_sha256: digest(
                `shogi-floodgate-bounded-stable-outcome-v3\0${canonical(body)}`,
              ),
            },
          };
        },
        close: async () => undefined,
      }),
    };

    const result = await runHalfkp81Depth18TeacherCoreForTests(
      value.authenticated,
      boundedDependencies,
      coreContract(roles),
    );
    expect(result.receipt).toMatchObject({
      completed_parents: 1,
      technical_faults: 0,
    });
    const [, entry] = (
      await fs.promises.readFile(value.authenticated.outputs.work_jsonl, "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entry.stable_result).toMatchObject({
      outcome: "omitted",
      row: null,
      omission: {
        reason: "cooperative-deadline",
        partial_result_adopted: false,
      },
    });
    expect(
      entry.teacher_entry.records.some((record: { sources: string[] }) =>
        record.sources.includes("stable"),
      ),
    ).toBe(false);
    expect(entry.teacher_entry.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          move: "7g7f",
          sources: expect.arrayContaining(["played"]),
        }),
      ]),
    );
    expect(entry.teacher_entry.exact_search.searches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moves: ["7g7f"],
          requested_limit: { depth: 18 },
        }),
      ]),
    );
  });

  it("runs Yaneura-only v1 without constructing or calling any stable runtime", async () => {
    const roles = ["fit", "tune", "sealed"] as const;
    const value = await fixture(roles, { yaneuraOnly: true });
    const result = await runHalfkp81Depth18TeacherCoreForTests(
      value.authenticated,
      value.dependencies,
      coreContract(roles, 13),
    );

    expect(result.receipt).toMatchObject({
      completed_parents: 3,
      completed_rows: 39,
      technical_faults: 0,
    });
    expect(value.stableFactoryCalls.value).toBe(0);
    expect(value.proposeCalls.value).toBe(0);
    expect(value.stableCloseCalls.value).toBe(0);

    const workLines = (
      await fs.promises.readFile(value.authenticated.outputs.work_jsonl, "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(workLines[0]).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1,
      kind: "header",
      candidate_generation:
        HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
    });
    expect(workLines[0]).not.toHaveProperty("stable_runtime");

    for (const wrapper of workLines.slice(1)) {
      expect(wrapper).toMatchObject({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1,
        candidate_generation:
          HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
      });
      expect(wrapper).not.toHaveProperty("stable_result");
      const teacherEntry = wrapper.teacher_entry as {
        initial_search: {
          requested_limit: { depth: number };
          requested_multipv: number;
        };
        exact_search: {
          searches: Array<{
            requested_limit: { depth: number };
            moves: string[];
          }>;
        };
        records: Array<{ sources: string[] }>;
      };
      expect(teacherEntry.initial_search).toMatchObject({
        requested_limit: { depth: 16 },
        requested_multipv: 12,
      });
      expect(teacherEntry.records).toHaveLength(13);
      expect(
        teacherEntry.records.every((record) =>
          record.sources.every(
            (source) => source === "teacher" || source === "played",
          ),
        ),
      ).toBe(true);
      expect(teacherEntry.exact_search.searches).toHaveLength(13);
      expect(
        teacherEntry.exact_search.searches.every(
          (search) =>
            search.requested_limit.depth === 18 && search.moves.length === 1,
        ),
      ).toBe(true);
    }
  });

  it("publishes a scratch-only Yaneura-only preflight receipt after process cleanup", async () => {
    const roles = ["fit", "tune", "sealed"] as const;
    const value = await fixture(roles, { yaneuraV1R4: true });
    const preflightRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-yaneura-preflight-test-"),
    );
    tempRoots.push(preflightRoot);
    const result = await runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests(
      value.authenticated,
      preflightRoot,
      value.dependencies,
      { fit: 1, tune: 1, sealed: 1 },
    );

    expect(result.receipt).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_RECEIPT_SCHEMA,
      status: "scratch-preflight-passed-no-formal-authority",
      selected_parents: 3,
      completed_rows: 39,
      verification: {
        stable_runtime_factory_calls: 0,
        stable_calls: 0,
        stable_candidate_rows: 0,
        initial_yaneuraou_depth16_multipv_min_12_legal_moves: true,
        requested_multipv_histogram: { "12": 3 },
        every_candidate_exact_depth18: true,
        every_row_legal: true,
        terminal_faults: 0,
      },
      process_cleanup: {
        engines_started: 3,
        engines_quit: 3,
        active_engines_at_receipt: 0,
      },
      authority: {
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    expect(value.stableFactoryCalls.value).toBe(0);
    expect(value.proposeCalls.value).toBe(0);
    expect(value.stableCloseCalls.value).toBe(0);
    await expect(
      fs.promises.lstat(
        path.join(preflightRoot, "preflight-terminal-fault.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("isolates v1r4 work and preflight receipts in its recovery schema", async () => {
    const roles = ["fit", "tune", "sealed"] as const;
    const value = await fixture(roles, { yaneuraV1R4: true });
    const preflightRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-yaneura-v1r2-preflight-test-"),
    );
    tempRoots.push(preflightRoot);
    const result = await runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests(
      value.authenticated,
      preflightRoot,
      value.dependencies,
      { fit: 1, tune: 1, sealed: 1 },
    );

    expect(result.receipt).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_RECEIPT_SCHEMA,
      selected_parents: 3,
      completed_rows: 39,
      verification: {
        stable_runtime_factory_calls: 0,
        stable_calls: 0,
        stable_candidate_rows: 0,
      },
      process_cleanup: {
        engines_started: 3,
        engines_quit: 3,
        active_engines_at_receipt: 0,
      },
    });
    expect(value.stableFactoryCalls.value).toBe(0);
    const work = (
      await fs.promises.readFile(
        path.join(preflightRoot, "teacher-work.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(
      work.every(
        (entry) =>
          entry.schema ===
          HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4,
      ),
    ).toBe(true);
    expect(work.every((entry) => !Object.hasOwn(entry, "stable_runtime"))).toBe(
      true,
    );
    expect(work.every((entry) => !Object.hasOwn(entry, "stable_result"))).toBe(
      true,
    );
  });

  it("creates the v1r4 preflight directory once as private and empty", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "halfkp81-yaneura-v1r3-directory-test-"),
      ),
    );
    tempRoots.push(root);
    const directory = path.join(root, "scratch");

    await expect(
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(
        directory,
      ),
    ).resolves.toBe(directory);
    expect((await fs.promises.lstat(directory)).mode & 0o777).toBe(0o700);
    expect(await fs.promises.readdir(directory)).toEqual([]);
    await expect(
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(
        directory,
      ),
    ).rejects.toThrow(/must be absent/);
  });

  it("fails closed on unsafe or raced v1r4 preflight directories", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "halfkp81-yaneura-v1r3-unsafe-directory-test-"),
      ),
    );
    tempRoots.push(root);

    const nonPrivate = path.join(root, "non-private");
    await fs.promises.mkdir(nonPrivate, { mode: 0o755 });
    await fs.promises.chmod(nonPrivate, 0o755);
    await expect(
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(
        nonPrivate,
      ),
    ).rejects.toThrow(/mode must be 0700/);

    const nonempty = path.join(root, "nonempty");
    await fs.promises.mkdir(nonempty, { mode: 0o700 });
    await fs.promises.writeFile(path.join(nonempty, "existing"), "evidence");
    await expect(
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(
        nonempty,
      ),
    ).rejects.toThrow(/must be empty/);

    const realDirectory = path.join(root, "real");
    const symlink = path.join(root, "symlink");
    await fs.promises.mkdir(realDirectory, { mode: 0o700 });
    await fs.promises.symlink(realDirectory, symlink);
    await expect(
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(
        symlink,
      ),
    ).rejects.toThrow(/must not be a symlink/);

    const regularFile = path.join(root, "regular-file");
    await fs.promises.writeFile(regularFile, "not a directory");
    await expect(
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(
        regularFile,
      ),
    ).rejects.toThrow(/existing non-directory/);

    const raced = path.join(root, "raced");
    const results = await Promise.allSettled([
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(raced),
      initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests(raced),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("isolates v1r4 preflight work without changing teacher semantics", async () => {
    const roles = ["fit", "tune", "sealed"] as const;
    const value = await fixture(roles, { yaneuraV1R4: true });
    const preflightRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-yaneura-v1r3-preflight-test-"),
    );
    tempRoots.push(preflightRoot);
    const result = await runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests(
      value.authenticated,
      preflightRoot,
      value.dependencies,
      { fit: 1, tune: 1, sealed: 1 },
    );

    expect(result.receipt).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_RECEIPT_SCHEMA,
      selected_parents: 3,
      completed_rows: 39,
      row_bounds_per_parent: { minimum: 2, maximum: 13 },
      candidate_generation:
        HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1,
      verification: {
        stable_runtime_factory_calls: 0,
        stable_calls: 0,
        stable_candidate_rows: 0,
        initial_yaneuraou_depth16_multipv_min_12_legal_moves: true,
        every_candidate_exact_depth18: true,
      },
    });
    expect(value.stableFactoryCalls.value).toBe(0);
    const work = (
      await fs.promises.readFile(
        path.join(preflightRoot, "teacher-work.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(
      work.every(
        (entry) =>
          entry.schema ===
          HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4,
      ),
    ).toBe(true);
  });

  it("treats a parent-level timeout as fatal and publishes no success receipt", async () => {
    const roles = ["fit"] as const;
    const value = await fixture(roles);
    const hangingDependencies: Halfkp81Depth18TeacherRunnerDependencies = {
      ...value.dependencies,
      labelParent: async () => new Promise<never>(() => undefined),
      parentTimeoutMs: 10,
    };
    await expect(
      runHalfkp81Depth18TeacherCoreForTests(
        value.authenticated,
        hangingDependencies,
        coreContract(roles),
      ),
    ).rejects.toThrow(/parent-level timeout/);
    await expect(
      fs.promises.lstat(value.authenticated.outputs.receipt_json),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    const fault = JSON.parse(
      await fs.promises.readFile(
        value.authenticated.outputs.terminal_fault_json,
        "utf8",
      ),
    );
    expect(fault).toMatchObject({
      schema: HALFKP81_DEPTH18_TEACHER_FAULT_SCHEMA,
      technical_faults: 1,
    });
  });

  it.each([
    [1, "proposal", 12, 0],
    [2, "independent-rescore", 1, 1],
  ] as const)(
    "records the %s search call as %s without publishing a partial v1r5 parent",
    async (failSearchAt, phase, requestedMultipv, searchmovesLength) => {
      const value = await fixture(["fit"], {
        yaneuraV1R5: true,
        failSearchAt,
      });
      await expect(
        runHalfkp81Depth18TeacherCoreForTests(
          value.authenticated,
          {
            ...value.dependencies,
            parentDeadlinePolicy: "per-search-only",
            parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
            processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
          },
          coreContract(["fit"], 13),
        ),
      ).rejects.toThrow(/USI search timeout/);

      const fault = JSON.parse(
        await fs.promises.readFile(
          value.authenticated.outputs.terminal_fault_json,
          "utf8",
        ),
      ) as { message: string };
      expect(fault.message).toContain(`\"phase\":\"${phase}\"`);
      expect(fault.message).toContain(
        `\"requested_multipv\":${requestedMultipv}`,
      );
      expect(fault.message).toContain(
        `\"timeout_ms\":${HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS}`,
      );
      const stageText = fault.message.split("; stage=")[1];
      expect(stageText).toBeDefined();
      expect(
        (JSON.parse(stageText as string) as { searchmoves: string[] })
          .searchmoves,
      ).toHaveLength(searchmovesLength);

      const work = (
        await fs.promises.readFile(
          value.authenticated.outputs.work_jsonl,
          "utf8",
        )
      )
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(work).toHaveLength(1);
      expect(work[0]).toMatchObject({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5,
        kind: "header",
      });
      await expect(
        fs.promises.lstat(value.authenticated.outputs.receipt_json),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it.each([
    [13, HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS, "per-search-only"],
    [HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES, 600_000, "per-search-only"],
    [
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
      "aggregate",
    ],
  ] as const)(
    "rejects non-v1r5 execution resources (%i processes, %i ms, %s)",
    async (processes, parentTimeoutMs, parentDeadlinePolicy) => {
      const value = await fixture(["fit"], { yaneuraV1R5: true });
      await expect(
        runHalfkp81Depth18TeacherCoreForTests(
          value.authenticated,
          {
            ...value.dependencies,
            parentDeadlinePolicy,
            parentTimeoutMs,
            processes,
          },
          coreContract(["fit"], 13),
        ),
      ).rejects.toThrow(
        /requires four persistent engines, 3600000ms per-search timeout, and no aggregate parent race/,
      );
      await expect(
        fs.promises.lstat(value.authenticated.outputs.work_jsonl),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("removes the aggregate parent deadline in v1r5 without publishing partial parents", async () => {
    const aggregate = await fixture(["fit"], {
      yaneuraV1R4: true,
      searchDelayMs: 4,
    });
    await expect(
      runHalfkp81Depth18TeacherCoreForTests(
        aggregate.authenticated,
        {
          ...aggregate.dependencies,
          parentDeadlinePolicy: "aggregate",
          parentTimeoutMs: 12,
        },
        coreContract(["fit"], 13),
      ),
    ).rejects.toThrow(/parent-level timeout/);

    // Let the deliberately uncooperative fake search finish. A timed-out parent
    // must still never become a durable partial or late-completing ledger row.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const failedWork = (
      await fs.promises.readFile(
        aggregate.authenticated.outputs.work_jsonl,
        "utf8",
      )
    )
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(failedWork).toHaveLength(1);
    expect(failedWork[0]).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4,
      kind: "header",
    });
    await expect(
      fs.promises.lstat(aggregate.authenticated.outputs.receipt_json),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const perSearchOnly = await fixture(["fit"], {
      yaneuraV1R5: true,
      // Fourteen searches cumulatively exceed the superseded 600ms parent
      // race while every individual search remains well inside v1r5's limit.
      searchDelayMs: 50,
    });
    await expect(
      runHalfkp81Depth18TeacherCoreForTests(
        perSearchOnly.authenticated,
        {
          ...perSearchOnly.dependencies,
          parentDeadlinePolicy: "per-search-only",
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
          processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
        },
        coreContract(["fit"], 13),
      ),
    ).resolves.toMatchObject({
      receipt: { completed_parents: 1, technical_faults: 0 },
    });
    expect(perSearchOnly.engineOptions).toHaveLength(1);
    expect(perSearchOnly.engineOptions[0]).toMatchObject({
      timeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
    });
    const completedWork = (
      await fs.promises.readFile(
        perSearchOnly.authenticated.outputs.work_jsonl,
        "utf8",
      )
    )
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(completedWork).toHaveLength(2);
    expect(completedWork[1]).toMatchObject({
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R5,
      kind: "parent",
    });
    const teacherEntry = completedWork[1].teacher_entry as {
      candidate_moves: string[];
      initial_search: {
        requested_limit: { depth: number };
        requested_multipv: number;
      };
      exact_search: {
        searches: Array<{
          requested_limit: { depth: number };
          moves: string[];
        }>;
      };
      records: Array<{ move: string; sources: string[] }>;
    };
    expect(teacherEntry.initial_search).toMatchObject({
      requested_limit: { depth: 16 },
      requested_multipv: 12,
    });
    expect([...teacherEntry.candidate_moves].sort()).toEqual(
      teacherEntry.records.map((record) => record.move).sort(),
    );
    expect([...teacherEntry.candidate_moves].sort()).toEqual(
      teacherEntry.exact_search.searches
        .map((search) => search.moves[0])
        .sort(),
    );
    expect(
      teacherEntry.exact_search.searches.every(
        (search) =>
          search.requested_limit.depth === 18 && search.moves.length === 1,
      ),
    ).toBe(true);
    expect(
      teacherEntry.records.every((record) =>
        record.sources.every(
          (source) => source === "teacher" || source === "played",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    [1, 0],
    [4, 3],
  ] as const)(
    "recycles only the affected v1r6 engine and retries the whole parent after reset call %i",
    async (resetTimeoutAtCall, discardedSearches) => {
      const value = await fixture(["fit"], {
        yaneuraV1R6: true,
        resetTimeoutAtCalls: [resetTimeoutAtCall],
        searchDelayMs: 2,
      });
      const execution = runHalfkp81Depth18TeacherCoreForTests(
        value.authenticated,
        {
          ...value.dependencies,
          parentDeadlinePolicy: "per-search-only",
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
          processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
          resetTimeoutRecoveryPolicy:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        },
        coreContract(["fit"], 13),
      );
      while (value.engineStats.length < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      const duringRetry = (
        await fs.promises.readFile(
          value.authenticated.outputs.work_jsonl,
          "utf8",
        )
      )
        .trimEnd()
        .split("\n");
      expect(duringRetry).toHaveLength(1);
      await expect(execution).resolves.toMatchObject({
        receipt: { completed_parents: 1, technical_faults: 0 },
      });

      expect(value.engineStats).toHaveLength(2);
      expect(value.engineEvents.slice(0, 3)).toEqual([
        "start:0",
        "quit:0",
        "start:1",
      ]);
      expect(value.engineStats[0]).toEqual({
        resetCalls: resetTimeoutAtCall,
        searchCalls: discardedSearches,
        quitCalls: 1,
      });
      expect(value.engineStats[1]).toMatchObject({
        searchCalls: 14,
        quitCalls: 1,
      });
      expect(value.engineActivity).toEqual({ active: 0, maximum: 1 });
      const work = (
        await fs.promises.readFile(
          value.authenticated.outputs.work_jsonl,
          "utf8",
        )
      )
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(work).toHaveLength(2);
      expect(work[1]).toMatchObject({
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R6,
        kind: "parent",
        reset_timeout_recovery: {
          policy: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
          retries_used: 1,
          engine_recycles: 1,
          events: [
            {
              attempt: 1,
              error_name: "UsiResetForParentTimeoutError",
              phase: "reset-for-parent",
              timeout_ms: USI_RESET_FOR_PARENT_TIMEOUT_MS,
            },
          ],
        },
      });
    },
  );

  it("rejects reset-timeout recycling outside the isolated v1r6 schema", async () => {
    const value = await fixture(["fit"], { yaneuraV1R5: true });
    await expect(
      runHalfkp81Depth18TeacherCoreForTests(
        value.authenticated,
        {
          ...value.dependencies,
          parentDeadlinePolicy: "per-search-only",
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_TIMEOUT_MS,
          processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R5_PROCESSES,
          resetTimeoutRecoveryPolicy:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        },
        coreContract(["fit"], 13),
      ),
    ).rejects.toThrow(/authorized only for Yaneura-only v1r6/);
    await expect(
      fs.promises.lstat(value.authenticated.outputs.work_jsonl),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the normalized v1r6 teacher payload identical after a reset recycle", async () => {
    const baseline = await fixture(["fit"], { yaneuraV1R6: true });
    const recovered = await fixture(["fit"], {
      yaneuraV1R6: true,
      resetTimeoutAtCalls: [4],
    });
    const execute = async (
      value: Awaited<ReturnType<typeof fixture>>,
    ): Promise<Record<string, unknown>> => {
      await runHalfkp81Depth18TeacherCoreForTests(
        value.authenticated,
        {
          ...value.dependencies,
          parentDeadlinePolicy: "per-search-only",
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
          processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
          resetTimeoutRecoveryPolicy:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        },
        coreContract(["fit"], 13),
      );
      return JSON.parse(
        (
          await fs.promises.readFile(
            value.authenticated.outputs.work_jsonl,
            "utf8",
          )
        )
          .trimEnd()
          .split("\n")[1],
      ) as Record<string, unknown>;
    };
    const baselineEntry = await execute(baseline);
    const recoveredEntry = await execute(recovered);
    const normalizedTeacher = (value: unknown): Record<string, unknown> => {
      const teacher = structuredClone(value) as Record<string, unknown>;
      delete teacher.run_fingerprint;
      delete teacher.payload_sha256;
      return teacher;
    };
    expect(normalizedTeacher(recoveredEntry.teacher_entry)).toEqual(
      normalizedTeacher(baselineEntry.teacher_entry),
    );
    expect(recoveredEntry.candidate_generation).toEqual(
      baselineEntry.candidate_generation,
    );
  });

  it("fails v1r6 terminally after the second reset timeout without publishing the parent", async () => {
    const value = await fixture(["fit"], {
      yaneuraV1R6: true,
      resetTimeoutFailures: 2,
    });
    await expect(
      runHalfkp81Depth18TeacherCoreForTests(
        value.authenticated,
        {
          ...value.dependencies,
          parentDeadlinePolicy: "per-search-only",
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
          processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
          resetTimeoutRecoveryPolicy:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        },
        coreContract(["fit"], 13),
      ),
    ).rejects.toThrow(
      /recovery exhausted after two timeouts and one engine recycle/,
    );
    expect(value.engineStats).toHaveLength(2);
    expect(value.engineStats.every((stats) => stats.quitCalls === 1)).toBe(
      true,
    );
    expect(value.engineActivity).toEqual({ active: 0, maximum: 1 });
    const work = (
      await fs.promises.readFile(value.authenticated.outputs.work_jsonl, "utf8")
    )
      .trimEnd()
      .split("\n");
    expect(work).toHaveLength(1);
    const fault = JSON.parse(
      await fs.promises.readFile(
        value.authenticated.outputs.terminal_fault_json,
        "utf8",
      ),
    ) as { message: string };
    expect(fault.message).toContain(
      '"error_name":"UsiResetForParentRecoveryExhaustedError"',
    );
    expect(fault.message).toContain('"phase":"reset-for-parent"');
  });

  it.each([
    ["search timeout", { failSearchAt: 1 }, /USI search timeout/],
    [
      "unknown reset failure",
      { unknownResetFailures: 1 },
      /synthetic unknown reset failure/,
    ],
  ] as const)(
    "does not recycle a v1r6 engine after %s",
    async (_label, failureOptions, expected) => {
      const value = await fixture(["fit"], {
        yaneuraV1R6: true,
        ...failureOptions,
      });
      await expect(
        runHalfkp81Depth18TeacherCoreForTests(
          value.authenticated,
          {
            ...value.dependencies,
            parentDeadlinePolicy: "per-search-only",
            parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
            processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
            resetTimeoutRecoveryPolicy:
              HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
          },
          coreContract(["fit"], 13),
        ),
      ).rejects.toThrow(expected);
      expect(value.engineStats).toHaveLength(1);
      expect(value.engineStats[0].quitCalls).toBe(1);
      expect(value.engineActivity).toEqual({ active: 0, maximum: 1 });
      expect(
        (
          await fs.promises.readFile(
            value.authenticated.outputs.work_jsonl,
            "utf8",
          )
        )
          .trimEnd()
          .split("\n"),
      ).toHaveLength(1);
    },
  );

  it("never exceeds four active engines while v1r6 recycles timed-out workers", async () => {
    const roles = ["fit", "fit", "fit", "fit"] as const;
    const value = await fixture(roles, {
      yaneuraV1R6: true,
      resetTimeoutAtCalls: [1],
    });
    await expect(
      runHalfkp81Depth18TeacherCoreForTests(
        value.authenticated,
        {
          ...value.dependencies,
          parentDeadlinePolicy: "per-search-only",
          parentTimeoutMs: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_TIMEOUT_MS,
          processes: HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_PROCESSES,
          resetTimeoutRecoveryPolicy:
            HALFKP81_DEPTH18_YANEURA_ONLY_V1R6_RESET_RECOVERY_POLICY,
        },
        coreContract(roles, 13),
      ),
    ).resolves.toMatchObject({
      receipt: { completed_parents: 4, technical_faults: 0 },
    });
    expect(value.engineActivity.active).toBe(0);
    expect(value.engineActivity.maximum).toBeLessThanOrEqual(4);
  });

  it("reaps an active v1r11 engine when the independent guardian fails during a blocked search", async () => {
    const value = await fixture(["fit"], {
      yaneuraV1R9: true,
      searchDelayMs: 75,
    });
    const outputs = Object.freeze({
      ...value.authenticated.outputs,
      power_continuity_jsonl: path.join(value.root, "power-continuity.jsonl"),
      power_continuity_receipt_json: path.join(
        value.root,
        "power-continuity-receipt.json",
      ),
    });
    const authenticated = Object.freeze({
      ...value.authenticated,
      outputs,
      planIdentity: Object.freeze({
        ...value.authenticated.planIdentity,
        schema: HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA,
      }),
    }) as Halfkp81Depth18AuthenticatedTeacherPlan;
    let rejectFailure!: (error: Error) => void;
    let continuityError: Error | undefined;
    let signalEngineStart!: () => void;
    const engineStarted = new Promise<void>((resolve) => {
      signalEngineStart = resolve;
    });
    const failure = new Promise<never>((_resolve, reject) => {
      rejectFailure = reject;
    });
    void failure.catch(() => undefined);
    let started = 0;
    let reaped = 0;
    const session: Halfkp81Depth18PowerContinuitySession = {
      failure,
      async assertHealthy(): Promise<void> {
        if (continuityError !== undefined) throw continuityError;
      },
      engineStarted(): void {
        started += 1;
        signalEngineStart();
      },
      engineReaped(): void {
        reaped += 1;
      },
      async finalizeSuccess() {
        throw new Error(
          "power success must not finalize after guardian failure",
        );
      },
      async finalizeFault() {
        return Object.freeze({
          ledger: Object.freeze({
            path: outputs.power_continuity_jsonl,
            bytes: 1,
            sha256: "a".repeat(64),
          }),
          receipt: Object.freeze({
            path: outputs.power_continuity_receipt_json,
            bytes: 1,
            sha256: "b".repeat(64),
          }),
        });
      },
      async close(): Promise<void> {},
    };
    const execution = runHalfkp81Depth18TeacherCoreForTests(
      authenticated,
      {
        ...value.dependencies,
        startPowerContinuity: async () => session,
      },
      coreContract(["fit"], 13),
    );
    await engineStarted;
    continuityError = new Halfkp81Depth18EnvironmentContinuityError(
      "guardian-heartbeat-gap-greater-than-90000ms",
    );
    rejectFailure(continuityError);
    await expect(execution).rejects.toThrow(
      /guardian-heartbeat-gap-greater-than-90000ms/u,
    );
    expect(started).toBeGreaterThan(0);
    expect(reaped).toBe(started);
    expect(value.engineStats.every((stats) => stats.quitCalls === 1)).toBe(
      true,
    );
    expect(value.engineActivity.active).toBe(0);
    const workLines = (await fs.promises.readFile(outputs.work_jsonl, "utf8"))
      .trimEnd()
      .split("\n");
    expect(workLines).toHaveLength(1);
  });

  it("rejects direct v1r11 core calls with a structurally forged formal capability", async () => {
    const value = await fixture(["fit"], { yaneuraV1R9: true });
    const authenticated = Object.freeze({
      ...value.authenticated,
      outputs: Object.freeze({
        ...value.authenticated.outputs,
        power_continuity_jsonl: path.join(value.root, "power-continuity.jsonl"),
        power_continuity_receipt_json: path.join(
          value.root,
          "power-continuity-receipt.json",
        ),
      }),
      planIdentity: Object.freeze({
        ...value.authenticated.planIdentity,
        schema: HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11,
      }),
    }) as Halfkp81Depth18AuthenticatedTeacherPlan;
    const forged = {
      launchAgentEvidence: {
        path: "/private/tmp/forged-launch.json",
        bytes: 1,
        sha256: "e".repeat(64),
      },
      verifiedPreformalAuthority: {
        path: "/private/tmp/forged-preformal.json",
        bytes: 1,
        sha256: "f".repeat(64),
      },
    };
    await expect(
      runHalfkp81Depth18TeacherCoreForTests(
        authenticated,
        {
          ...value.dependencies,
          v1r11FormalAuthority: forged,
          startPowerContinuity: async () => {
            throw new Error("must reject before guardian start");
          },
        },
        coreContract(["fit"], 13),
      ),
    ).rejects.toThrow(/trusted live LaunchAgent capability/u);
  });

  it("reaps a replacement v1r11 engine when guardian failure wins the create/register race", async () => {
    const value = await fixture(["fit"], {
      yaneuraV1R9: true,
      resetTimeoutAtCalls: [1],
    });
    const outputs = Object.freeze({
      ...value.authenticated.outputs,
      power_continuity_jsonl: path.join(value.root, "power-continuity.jsonl"),
      power_continuity_receipt_json: path.join(
        value.root,
        "power-continuity-receipt.json",
      ),
    });
    const authenticated = Object.freeze({
      ...value.authenticated,
      outputs,
      planIdentity: Object.freeze({
        ...value.authenticated.planIdentity,
        schema: HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA,
      }),
    }) as Halfkp81Depth18AuthenticatedTeacherPlan;
    let rejectFailure!: (error: Error) => void;
    let continuityError: Error | undefined;
    const failure = new Promise<never>((_resolve, reject) => {
      rejectFailure = reject;
    });
    void failure.catch(() => undefined);
    let started = 0;
    let reaped = 0;
    const session: Halfkp81Depth18PowerContinuitySession = {
      failure,
      async assertHealthy(): Promise<void> {
        if (continuityError !== undefined) throw continuityError;
      },
      engineStarted(): void {
        started += 1;
      },
      engineReaped(): void {
        reaped += 1;
      },
      async finalizeSuccess() {
        throw new Error(
          "power success must not finalize after guardian failure",
        );
      },
      async finalizeFault() {
        return Object.freeze({
          ledger: Object.freeze({
            path: outputs.power_continuity_jsonl,
            bytes: 1,
            sha256: "a".repeat(64),
          }),
          receipt: Object.freeze({
            path: outputs.power_continuity_receipt_json,
            bytes: 1,
            sha256: "b".repeat(64),
          }),
        });
      },
      async close(): Promise<void> {},
    };
    const originalCreateEngine = value.dependencies.createEngine!;
    let createCalls = 0;
    const execution = runHalfkp81Depth18TeacherCoreForTests(
      authenticated,
      {
        ...value.dependencies,
        startPowerContinuity: async () => session,
        createEngine: async (options) => {
          const engine = await originalCreateEngine(options);
          createCalls += 1;
          if (createCalls === 2) {
            continuityError = new Halfkp81Depth18EnvironmentContinuityError(
              "guardian-heartbeat-gap-greater-than-90000ms",
            );
            rejectFailure(continuityError);
            await Promise.resolve();
          }
          return engine;
        },
      },
      coreContract(["fit"], 13),
    );
    await expect(execution).rejects.toThrow(
      /guardian-heartbeat-gap-greater-than-90000ms/u,
    );
    expect(createCalls).toBe(2);
    expect(started).toBe(2);
    expect(reaped).toBe(2);
    expect(value.engineStats).toEqual([
      { resetCalls: 1, searchCalls: 0, quitCalls: 1 },
      { resetCalls: 0, searchCalls: 0, quitCalls: 1 },
    ]);
    expect(value.engineActivity.active).toBe(0);
  });

  it("durably stops v1r11 without claiming power authority when guardian fault finalization fails", async () => {
    const value = await fixture(["fit"], {
      yaneuraV1R9: true,
      searchDelayMs: 75,
    });
    const outputs = Object.freeze({
      ...value.authenticated.outputs,
      power_continuity_jsonl: path.join(value.root, "power-continuity.jsonl"),
      power_continuity_receipt_json: path.join(
        value.root,
        "power-continuity-receipt.json",
      ),
    });
    const authenticated = Object.freeze({
      ...value.authenticated,
      outputs,
      planIdentity: Object.freeze({
        ...value.authenticated.planIdentity,
        schema: HALFKP81_DEPTH18_V1R11_POWER_TEST_PLAN_SCHEMA,
      }),
    }) as Halfkp81Depth18AuthenticatedTeacherPlan;
    let rejectFailure!: (error: Error) => void;
    let continuityError: Error | undefined;
    let signalEngineStart!: () => void;
    const engineStarted = new Promise<void>((resolve) => {
      signalEngineStart = resolve;
    });
    const failure = new Promise<never>((_resolve, reject) => {
      rejectFailure = reject;
    });
    void failure.catch(() => undefined);
    let started = 0;
    let reaped = 0;
    const session: Halfkp81Depth18PowerContinuitySession = {
      failure,
      async assertHealthy(): Promise<void> {
        if (continuityError !== undefined) throw continuityError;
      },
      engineStarted(): void {
        started += 1;
        signalEngineStart();
      },
      engineReaped(): void {
        reaped += 1;
      },
      async finalizeSuccess() {
        throw new Error(
          "power success must not finalize after guardian failure",
        );
      },
      async finalizeFault() {
        throw new Halfkp81Depth18EnvironmentContinuityError(
          "guardian-finalize-ipc-timeout",
        );
      },
      async close(): Promise<void> {},
    };
    const execution = runHalfkp81Depth18TeacherCoreForTests(
      authenticated,
      {
        ...value.dependencies,
        startPowerContinuity: async () => session,
      },
      coreContract(["fit"], 13),
    );
    await engineStarted;
    continuityError = new Halfkp81Depth18EnvironmentContinuityError(
      "guardian-heartbeat-gap-greater-than-90000ms",
    );
    rejectFailure(continuityError);
    await expect(execution).rejects.toThrow(
      /power guardian terminal closure failed.*guardian-finalize-ipc-timeout/u,
    );
    expect(reaped).toBe(started);
    expect(value.engineActivity.active).toBe(0);
    const fault = JSON.parse(
      await fs.promises.readFile(outputs.terminal_fault_json, "utf8"),
    ) as Record<string, unknown>;
    expect(fault).toMatchObject({
      schema: HALFKP81_DEPTH18_TEACHER_FAULT_SCHEMA,
      status: "terminal-fault-family-stopped",
      technical_faults: 1,
      authority: {
        may_resume_same_family: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    expect(fault).not.toHaveProperty("power_continuity");
    expect(String(fault.message)).toContain(
      "guardian-heartbeat-gap-greater-than-90000ms",
    );
    expect(String(fault.message)).toContain("guardian-finalize-ipc-timeout");
  });

  it("publishes create-only with idempotent equality and rejects a different raced value", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-publish-test-"),
    );
    tempRoots.push(root);
    const output = path.join(root, "artifact.jsonl");
    const first = Buffer.from("first\n");
    await publishHalfkp81Depth18TeacherCreateOnlyCoreForTests(output, first);
    await publishHalfkp81Depth18TeacherCreateOnlyCoreForTests(output, first);
    await expect(
      publishHalfkp81Depth18TeacherCreateOnlyCoreForTests(
        output,
        Buffer.from("different\n"),
      ),
    ).rejects.toThrow(/different bytes/);
    expect(await fs.promises.readFile(output)).toEqual(first);
  });
});
