import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS,
  canonicalHalfkp81V1R11FormalLikeJson,
  produceHalfkp81Depth18V1R11FormalLike512Artifacts,
  sealHalfkp81V1R11FormalLikeTeacherEntry,
  type Halfkp81V1R11FormalLikeCompletedParent,
  type Halfkp81V1R11FormalLikeExecutionResult,
  type Halfkp81V1R11FormalLikeRole,
} from "../../../ml/halfkp81-depth18-v1r11-formal-like-512";
import { verifyHalfkp81Depth18V1R11FormalLike512Artifacts } from "../../../ml/verify-halfkp81-depth18-v1r11-formal-like-512-artifacts";
import { childSfenAfterUsi } from "../../../ml/shogi-sfen";
import {
  buildSiblingGroup,
  positionKeyFromSfen,
} from "../../../ml/sibling-data";
import type { CompletedWorkEntry } from "../../../ml/generate-sibling-teacher";
import type { FloodgateTrainingParent } from "../../../ml/floodgate-training-row-consumer";

const START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const REVISION = "a".repeat(40);
const FINGERPRINT = "b".repeat(64);
const TEACHER_PLAN = Object.freeze({
  path: "/tmp/halfkp81-v1r11-formal-like-test-plan.json",
  bytes: 123,
  sha256: "c".repeat(64),
  schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
});
const CANDIDATES = Object.freeze(
  [
    "1g1f",
    "2g2f",
    "3g3f",
    "4g4f",
    "5g5f",
    "6g6f",
    "7g7f",
    "8g8f",
    "9g9f",
    "2h1h",
    "2h3h",
    "2h4h",
  ].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
  ),
);

const roots: string[] = [];

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fixture(): Readonly<{
  parents: readonly Readonly<FloodgateTrainingParent>[];
  roles: ReadonlyMap<string, Halfkp81V1R11FormalLikeRole>;
  execution: Readonly<Halfkp81V1R11FormalLikeExecutionResult>;
}> {
  const parents: FloodgateTrainingParent[] = [];
  const roles = new Map<string, Halfkp81V1R11FormalLikeRole>();
  const completed: Readonly<Halfkp81V1R11FormalLikeCompletedParent>[] = [];
  const mutableCompleted =
    completed as Halfkp81V1R11FormalLikeCompletedParent[];
  for (let index = 0; index < 512; index += 1) {
    const parentId = `sha256:${digest(`parent-${index}`)}`;
    const role: Halfkp81V1R11FormalLikeRole =
      index < 384 ? "fit" : index < 448 ? "tune" : "sealed";
    const parent: FloodgateTrainingParent = Object.freeze({
      schema_version: 1 as const,
      game_id: `game-${digest(`game-${index}`)}`,
      parent_id: parentId,
      position_id: positionKeyFromSfen(START),
      parent_sfen: START,
      ply: 0,
      played_move: "7g7f",
    });
    parents.push(parent);
    roles.set(parentId, role);
    const ranked = [...CANDIDATES].map((move, rank) => ({
      move,
      cp: 120 - rank,
      score_kind: "cp" as const,
    }));
    const scoresByMove = new Map(ranked.map((score) => [score.move, score]));
    const initialMoves = [...CANDIDATES].reverse();
    const records = buildSiblingGroup(
      {
        game_id: parent.game_id,
        parent_id: parent.parent_id,
        position_id: parent.position_id,
        parent_sfen: parent.parent_sfen,
        parent_ply: parent.ply,
      },
      ranked.map((score, rank) => ({
        move: score.move,
        child_sfen: childSfenAfterUsi(START, score.move),
        sources: [
          ...(score.move === parent.played_move ? ["played"] : []),
          "teacher",
        ],
        teacher_parent_cp: score.cp,
        teacher_rank: rank + 1,
        teacher_score_kind: "cp" as const,
      })),
    );
    const dual = Object.freeze({
      termination_reason: "depth" as const,
      requested_depth: 18,
      node_cap: 2_000_000_000,
      minimum_completed_depth: 1,
      deepest_complete_exact_depth: 18,
      selected_snapshot_nodes: 100,
      maximum_observed_nodes: 100,
      maximum_observed_depth: 18,
      selected_snapshot_bound: "exact" as const,
      discarded_at_or_above_node_cap_updates: 0,
      observed_lowerbound_updates: 0,
      observed_upperbound_updates: 0,
      cap_witness_depth: null,
      cap_witness_nodes: null,
      selected_precedes_witness: false,
      completed_iteration_witness_depth: 18,
    });
    const teacher: CompletedWorkEntry = {
      schema: "shogi-sibling-teacher-work-v2",
      kind: "parent",
      run_fingerprint: "",
      payload_sha256: "",
      parent_id: parent.parent_id,
      candidate_set_sha256: digest(
        `candidate-set-v1\0${CANDIDATES.join("\n")}`,
      ),
      candidate_moves: [...CANDIDATES],
      initial_search: {
        requested_multipv: 12,
        requested_limit: { depth: 16 },
        depth: 16,
        observed_nodes: 50,
        bestmove: initialMoves[0]!,
        moves: initialMoves,
        scores: initialMoves.map((move) => scoresByMove.get(move)!),
      },
      exact_search: {
        mode: "independent-single-move",
        candidate_count: 12,
        synthesized_rank1_move: ranked[0]!.move,
        moves: ranked.map((score) => score.move),
        scores: ranked,
        searches: CANDIDATES.map((move) => ({
          requested_multipv: 1,
          requested_limit: {
            depth: 18,
            nodes: 2_000_000_000,
            minimum_completed_depth: 1,
          },
          depth: 18,
          observed_nodes: 100,
          dual_bound: dual,
          bestmove: move,
          moves: [move],
          scores: [scoresByMove.get(move)!],
        })),
        total_observed_nodes: 1_200,
      },
      records,
    };
    mutableCompleted.push(
      Object.freeze({
        parent_id: parent.parent_id,
        role,
        teacher_entry: sealHalfkp81V1R11FormalLikeTeacherEntry(
          teacher,
          FINGERPRINT,
        ),
        rescore_route: Object.freeze({
          mode: "normal-depth18" as const,
          normal_hash_mib: 512 as const,
          normal_limit: Object.freeze({
            depth: 18 as const,
            nodes: 2_000_000_000 as const,
            minimum_completed_depth: 1 as const,
          }),
          fallback: null,
        }),
        reset_timeout_recovery: Object.freeze({
          policy: "recycle-engine-retry-parent-once" as const,
          normal_retries_used: 0 as const,
          fallback_retries_used: 0 as const,
          engine_recycles: 0 as const,
          events: Object.freeze([]),
        }),
      }),
    );
  }
  return Object.freeze({
    parents: Object.freeze(parents),
    roles,
    execution: Object.freeze({
      completed: Object.freeze(mutableCompleted),
      normal_engines: 8 as const,
      fallback_engines: 2 as const,
      maximum_normal_active: 8 as const,
      maximum_fallback_active: 2 as const,
      fallback_parents: 0,
      fallback_parents_by_role: Object.freeze({ fit: 0, tune: 0, sealed: 0 }),
      fallback_searches: 0,
      fallback_searches_by_role: Object.freeze({ fit: 0, tune: 0, sealed: 0 }),
      normal_partial_rows_published: 0 as const,
      capped_rows_published: 0 as const,
      technical_faults: 0 as const,
    }),
  });
}

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("v1r11 formal-like-512 production artifact boundary", () => {
  // 512 parents through a real publish/verify cycle is genuinely compute- and
  // filesystem-bound: ~6s locally, and shared CI runners are slower still. It
  // timed out at vitest's 5s default on three separate PRs (#702, #715, #722),
  // each time costing a re-run to confirm the code was fine. The budget is a
  // runaway guard, not a performance assertion.
  it("publishes only after all 512 parents and an independent held-byte verification pass", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(path.join(os.tmpdir(), "v1r11-formal-like-")),
    );
    roots.push(root);
    const artifacts = path.join(root, "artifacts");
    const sample = fixture();
    const result = await produceHalfkp81Depth18V1R11FormalLike512Artifacts(
      {
        outputDirectory: artifacts,
        teacherPlan: TEACHER_PLAN,
        sourceRevision: REVISION,
        runFingerprint: FINGERPRINT,
        parents: sample.parents,
        roles: sample.roles,
      },
      async () => sample.execution,
    );
    expect(result).toMatchObject({
      parents: 512,
      completed_parents: 512,
      technical_faults: 0,
      teacher_contract_equal_formal: true,
      power_semantics_equal_formal: true,
      artifact_verified_receipt: {
        schema:
          "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-verified-artifact-receipt-v1",
      },
    });
    expect(await fs.promises.readdir(artifacts)).toEqual([
      "formal-like-512-raw-receipt.json",
      "formal-like-512-verified-artifact-receipt.json",
      "formal-like-512-work.jsonl",
    ]);
    const work = await fs.promises.readFile(
      path.join(artifacts, "formal-like-512-work.jsonl"),
      "utf8",
    );
    expect(work.trimEnd().split("\n")).toHaveLength(513);
    expect(HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS).toEqual({
      fit: 384,
      tune: 64,
      sealed: 64,
    });
  }, 60_000);

  it("rejects changed completed bytes instead of minting a second verifier PASS", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(path.join(os.tmpdir(), "v1r11-formal-like-")),
    );
    roots.push(root);
    const artifacts = path.join(root, "artifacts");
    const sample = fixture();
    await produceHalfkp81Depth18V1R11FormalLike512Artifacts(
      {
        outputDirectory: artifacts,
        teacherPlan: TEACHER_PLAN,
        sourceRevision: REVISION,
        runFingerprint: FINGERPRINT,
        parents: sample.parents,
        roles: sample.roles,
      },
      async () => sample.execution,
    );
    const workPath = path.join(artifacts, "formal-like-512-work.jsonl");
    const raw = await fs.promises.readFile(workPath, "utf8");
    const lines = raw.trimEnd().split("\n");
    const parent = JSON.parse(lines[1]!) as Record<string, unknown>;
    parent.role = "sealed";
    lines[1] = canonicalHalfkp81V1R11FormalLikeJson(parent);
    await fs.promises.writeFile(workPath, `${lines.join("\n")}\n`, {
      mode: 0o600,
    });
    const verifiedReceiptPath = path.join(
      artifacts,
      "formal-like-512-verified-artifact-receipt.json",
    );
    await fs.promises.rm(verifiedReceiptPath);
    await expect(
      verifyHalfkp81Depth18V1R11FormalLike512Artifacts({
        workPath,
        rawReceiptPath: path.join(
          artifacts,
          "formal-like-512-raw-receipt.json",
        ),
        verifiedReceiptPath,
        teacherPlan: TEACHER_PLAN,
        sourceRevision: REVISION,
        runFingerprint: FINGERPRINT,
        parents: sample.parents,
        roles: sample.roles,
      }),
    ).rejects.toThrow();
  });

  it("accepts one whole-parent Hash8192 route only when every capped normal row is discarded", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(path.join(os.tmpdir(), "v1r11-formal-like-")),
    );
    roots.push(root);
    const artifacts = path.join(root, "artifacts");
    const sample = fixture();
    const completed = [...sample.execution.completed];
    const first = completed[0]!;
    const teacher = structuredClone(first.teacher_entry);
    for (const search of teacher.exact_search.searches) {
      search.requested_limit = { depth: 18 };
      delete search.dual_bound;
    }
    completed[0] = Object.freeze({
      ...first,
      teacher_entry: sealHalfkp81V1R11FormalLikeTeacherEntry(
        teacher,
        FINGERPRINT,
      ),
      rescore_route: Object.freeze({
        mode: "hash8192-parent-fallback" as const,
        normal_hash_mib: 512 as const,
        normal_limit: Object.freeze({
          depth: 18 as const,
          nodes: 2_000_000_000 as const,
          minimum_completed_depth: 1 as const,
        }),
        trigger: Object.freeze({
          move: teacher.candidate_moves[0]!,
          candidate_index_zero_based: 0,
          candidate_count: teacher.candidate_moves.length,
          completed_normal_rescores_discarded: 0,
          cap: Object.freeze({
            termination_reason: "node-cap" as const,
            requested_depth: 18,
            node_cap: 2_000_000_000,
            minimum_completed_depth: 1,
            deepest_complete_exact_depth: 17,
            selected_snapshot_nodes: 1_900_000_000,
            maximum_observed_nodes: 2_000_000_001,
            maximum_observed_depth: 18,
            selected_snapshot_bound: "exact" as const,
            discarded_at_or_above_node_cap_updates: 1,
            observed_lowerbound_updates: 0,
            observed_upperbound_updates: 0,
            cap_witness_depth: 18,
            cap_witness_nodes: 2_000_000_001,
            selected_precedes_witness: true as const,
            completed_iteration_witness_depth: 17,
          }),
        }),
        normal_engine_reaped_before_fallback: true as const,
        fallback: Object.freeze({
          hash_mib: 8192 as const,
          depth: 18 as const,
          timeout_ms: 14_400_000 as const,
          semaphore_limit: 2 as const,
          all_candidates_recomputed: true as const,
          candidate_count: teacher.candidate_moves.length,
          fallback_reset_retries_used: 0 as const,
          discarded_completed_rescores_before_retry: 0,
          searches_executed: teacher.candidate_moves.length,
          normal_rescore_rows_reused: 0 as const,
          candidate_omissions: 0 as const,
          engine_quit_before_semaphore_release: true as const,
        }),
      }),
    });
    const execution: Readonly<Halfkp81V1R11FormalLikeExecutionResult> =
      Object.freeze({
        ...sample.execution,
        completed: Object.freeze(completed),
        fallback_parents: 1,
        fallback_parents_by_role: Object.freeze({
          fit: 1,
          tune: 0,
          sealed: 0,
        }),
        fallback_searches: teacher.candidate_moves.length,
        fallback_searches_by_role: Object.freeze({
          fit: teacher.candidate_moves.length,
          tune: 0,
          sealed: 0,
        }),
      });
    const result = await produceHalfkp81Depth18V1R11FormalLike512Artifacts(
      {
        outputDirectory: artifacts,
        teacherPlan: TEACHER_PLAN,
        sourceRevision: REVISION,
        runFingerprint: FINGERPRINT,
        parents: sample.parents,
        roles: sample.roles,
      },
      async () => execution,
    );
    expect(result).toMatchObject({
      completed_parents: 512,
      technical_faults: 0,
      artifact_verified_receipt: {
        schema:
          "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-verified-artifact-receipt-v1",
      },
    });
    const verified = JSON.parse(
      await fs.promises.readFile(
        path.join(artifacts, "formal-like-512-verified-artifact-receipt.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(verified).toMatchObject({
      fallback_parents: 1,
      fallback_searches: 12,
      normal_partial_rows_published: 0,
      capped_rows_published: 0,
    });
  });

  it("stops before artifact publication on an incomplete executor result", async () => {
    const root = await fs.promises.realpath(
      await fs.promises.mkdtemp(path.join(os.tmpdir(), "v1r11-formal-like-")),
    );
    roots.push(root);
    const artifacts = path.join(root, "artifacts");
    const sample = fixture();
    const incomplete = {
      ...sample.execution,
      completed: sample.execution.completed.slice(0, 511),
    } as Readonly<Halfkp81V1R11FormalLikeExecutionResult>;
    await expect(
      produceHalfkp81Depth18V1R11FormalLike512Artifacts(
        {
          outputDirectory: artifacts,
          teacherPlan: TEACHER_PLAN,
          sourceRevision: REVISION,
          runFingerprint: FINGERPRINT,
          parents: sample.parents,
          roles: sample.roles,
        },
        async () => incomplete,
      ),
    ).rejects.toThrow("execution result differs");
    expect(await fs.promises.readdir(artifacts)).toEqual([]);
  });
});
