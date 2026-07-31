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
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R2,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R3,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R4,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R2,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R3,
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_WORK_SCHEMA_V1R4,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R2_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_PREFLIGHT_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_PREFLIGHT_RECEIPT_SCHEMA,
  authenticateHalfkp81Depth18TeacherPlan,
  expectedHalfkp81Depth18YaneuraOnlyInitialMultipv,
  initializeHalfkp81Depth18YaneuraOnlyPreflightDirectoryV1R4ForTests,
  parseExactPinnedHalfkp81Depth18JsonForTests,
  publishHalfkp81Depth18TeacherCreateOnlyCoreForTests,
  runHalfkp81Depth18TeacherCoreForTests,
  runHalfkp81Depth18YaneuraOnlyPreflightCoreForTests,
  validateHalfkp81Depth18SelectionRowsCoreForTests,
  validateHalfkp81Depth18YaneuraOnlyPreflightWorkCoreForTests,
  type Halfkp81Depth18AuthenticatedTeacherPlan,
  type Halfkp81Depth18TeacherEngine,
  type Halfkp81Depth18TeacherFileIdentity,
  type Halfkp81Depth18TeacherRole,
  type Halfkp81Depth18TeacherRunnerDependencies,
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
import type { UsiTeacherEngineOptions } from "../../../ml/usi-engine";

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
    parents?: readonly Readonly<{ sfen: string; playedMove: string }>[];
  }> = {},
): Promise<{
  authenticated: Halfkp81Depth18AuthenticatedTeacherPlan;
  dependencies: Halfkp81Depth18TeacherRunnerDependencies;
  root: string;
  proposeCalls: { value: number };
  stableFactoryCalls: { value: number };
  stableCloseCalls: { value: number };
  engineOptions: UsiTeacherEngineOptions[];
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
        parent_id: parentId(gameId, ply),
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
      schema: options.yaneuraV1R4
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
      options.yaneuraV1R4
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
    async resetForParent(): Promise<void> {}
    async quit(): Promise<void> {}
    async search(
      sfen: string,
      multipv: number,
      limit: { depth?: number },
      searchmoves: readonly string[],
    ) {
      const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position)
        .map((entry) => entry.usi)
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
  const engineOptions: UsiTeacherEngineOptions[] = [];
  const dependencies: Halfkp81Depth18TeacherRunnerDependencies = {
    createStableRuntime: async () => {
      stableFactoryCalls.value += 1;
      return stableRuntime;
    },
    createEngine: async (options) => {
      engineOptions.push(options);
      return new FakeEngine();
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
    options.yaneuraV1R4
      ? { stablePolicy: "yaneuraou-only-v1" as const }
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
