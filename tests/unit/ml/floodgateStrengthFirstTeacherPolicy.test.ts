import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT } from "../../../ml/generate-sibling-teacher";

const BASE_PATH = path.join(
  process.cwd(),
  "ml",
  "protocols",
  "floodgate-q1-2026-fresh-sibling-plan.json",
);
const AMENDMENT_PATH = path.join(
  process.cwd(),
  "ml",
  "protocols",
  "floodgate-q1-2026-strength-first-teacher-amendment.json",
);
const BASE_BYTES = 10_890;
const BASE_SHA256 =
  "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af";

function json(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

describe("Floodgate strength-first teacher append-only policy", () => {
  it("leaves the original preregistration at its exact byte identity", () => {
    const bytes = fs.readFileSync(BASE_PATH);
    expect(bytes.byteLength).toBe(BASE_BYTES);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BASE_SHA256);
    const base = JSON.parse(bytes.toString("utf8")) as {
      teacher: { candidate_union: string[] };
    };
    expect(base.teacher.candidate_union).toEqual([
      "teacher-multipv-12",
      "strong-game-played-move",
      "frozen-runop1-production-int16-fixed-depth-11-move",
    ]);
  });

  it("removes only the prospective stable proposal and fixes one local 12-engine run", () => {
    const amendment = json(AMENDMENT_PATH) as {
      schema: string;
      status: string;
      amendment_mode: string;
      base_plan: { bytes: number; sha256: string };
      teacher_change: Record<string, unknown>;
      strength_first_execution: Record<string, unknown>;
      training_dataset_change: Record<string, unknown>;
      unchanged: string[];
    };
    expect(amendment).toMatchObject({
      schema: "shogi-floodgate-q1-2026-strength-first-teacher-amendment-v1",
      status: "preregistered-before-first-complete-teacher-milestone",
      amendment_mode: "append-only-base-plan-bytes-remain-unchanged",
      base_plan: { bytes: BASE_BYTES, sha256: BASE_SHA256 },
    });
    expect(amendment.teacher_change).toMatchObject({
      candidate_union_after: ["teacher-multipv-12", "strong-game-played-move"],
      stable_candidate_generation: "removed-prospectively",
      stable_engine_or_policy_execution: "forbidden",
      proposal: { multipv: 12, depth: 16 },
      independent_rescore: {
        multipv: 1,
        searchmoves: "exactly-one-candidate",
        depth: 16,
      },
    });
    expect(amendment.strength_first_execution).toMatchObject({
      authenticated_training_row_consumer_callbacks: 1,
      runtime_input_claims: 1,
      consumer_postflight_claims_before_public_result: 1,
      same_authenticated_input_for_all_targets: true,
      same_private_stage_for_all_targets: true,
      targets_in_order: [100, 500, 24_000],
      parallel_engines: 12,
      threads_per_engine: 1,
      hash_mb_per_engine: 64,
      timeout_ms_per_search: 600_000,
      node: "v22.13.0",
      exclusive_single_process_run_lock:
        "macos-lockf-inherited-fd-same-open-file-description-parent-retained-helper-exits-before-return-parent-close-or-death-releases-no-unlink-reopen-pid-token-keeper",
      local_machine_only: true,
      runtime_network_requests: 0,
      runtime_cloud_services: [],
      aws: false,
      gcp: false,
      vercel: false,
    });
    expect(amendment.strength_first_execution.engine_environment).toEqual(
      SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
    );
    expect(amendment.training_dataset_change).toMatchObject({
      teacher_output_role: "training-only",
      all_emitted_canonical_sibling_rows_split: "train",
      internal_random_validation_split: "removed",
      fresh_selection_role: "unchanged-and-unread-during-training",
      fresh_final_holdout_role: "unchanged-and-sealed",
    });
    expect(amendment.unchanged).toContain(
      "training-architecture-features-initializer-objective-optimizer-learning-rate-epochs-batch-replay-seeds-and-final-epoch-policy",
    );
    expect(amendment.unchanged).toContain("formal-paired-ab-protocol");
  });

  it("records zero completed teacher, training, A/B, and live changes before execution", () => {
    const observed = json(AMENDMENT_PATH).observed_before_amendment as Record<
      string,
      unknown
    >;
    expect(observed).toMatchObject({
      authenticated_training_parents: 24_000,
      authenticated_training_games: 1_000,
      complete_teacher_milestones: 0,
      complete_teacher_datasets: 0,
      completed_training_runs: 0,
      completed_candidate_selections: 0,
      completed_formal_paired_ab_runs: 0,
      live_weight_changes: 0,
      earlier_disposable_partial_parent_records: 3,
      earlier_disposable_partial_records_are_not_a_completed_milestone_or_dataset: true,
    });
  });
});
