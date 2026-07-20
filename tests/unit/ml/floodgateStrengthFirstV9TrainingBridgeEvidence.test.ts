import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_STATUS,
} from "../../../ml/floodgate-strength-first-v8-downstream-provenance";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-v9-training-bridge-2026-07-20.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v9-training-bridge.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v9-training-bridge.en.md",
);
const builderPath = path.join(
  repositoryRoot,
  "ml/build_strength_first_qat_training_plan_candidate.py",
);
const launcherPath = path.join(
  repositoryRoot,
  "ml/run_strength_first_three_seed_training.py",
);
const planPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json",
);

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidencePath)) as Record<string, unknown>;
}

describe("Floodgate strength-first v9 training bridge evidence", () => {
  it("records the running teacher boundary without claiming training or strength", () => {
    expect(fs.existsSync(planPath)).toBe(false);
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-v9-training-bridge-evidence-v1",
      status:
        "implementation-focused-validation-pass-formal-v9-running-no-training-or-live-change",
      formal_v9_at_capture: {
        teacher_running: true,
        final_result_exists: false,
        exact_training_plan_exists: false,
        real_training_processes_started: 0,
        candidate_selections: 0,
        formal_ab_games: 0,
        live_weight_changes: 0,
        numeric_progress_snapshot_published_here: false,
      },
      strength_claims: {
        teacher_complete: false,
        model_retrained: false,
        candidate_selected: false,
        playing_strength_improved: false,
        high_dan_calibrated: false,
        live_model_changed: false,
      },
    });
  });

  it("binds full v9 semantics to plan v3 while preserving v8 plan validation", () => {
    expect(FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_SCHEMA).toBe(
      "shogi-floodgate-strength-first-v9-downstream-provenance-v1",
    );
    expect(FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_STATUS).toBe(
      "verified-v9-teacher-source-ready-for-training-plan-review",
    );
    expect(evidence()).toMatchObject({
      source_contract: {
        parents: 24000,
        milestone_targets: [100, 500],
        proposal: { multipv: 12, depth: 14 },
        independent_rescore: {
          multipv: 1,
          searchmoves: "exactly-one-candidate",
          depth: 16,
        },
        parallel_engines: 13,
        hash_mib_per_engine: 512,
        proposal_incomplete_reason: "proposal_incomplete_no_label",
      },
      semantic_verifier: {
        work_jsonl_streamed: true,
        authenticated_raw_rows_reparsed: true,
        every_work_entry_revalidated_with_shared_teacher_validator: true,
        parent_completion_recomputed: true,
        training_groups_recomputed: true,
        success_output_is_aggregate_only: true,
        hash_only_shortcut: false,
      },
      schema_transition: {
        v8_plan_schema:
          "shogi-floodgate-strength-first-qat-training-plan-v2",
        v8_plan_validation_preserved: true,
        v9_plan_schema:
          "shogi-floodgate-strength-first-qat-training-plan-v3",
        cross_generation_plan_summary_pair_rejected: true,
        training_result_schema_unchanged_v2: true,
        final_checkpoint_schema_unchanged_v2: true,
      },
    });
    expect(read(builderPath)).toContain(
      "ml/verify-floodgate-strength-first-v9-downstream-provenance.ts",
    );
    expect(read(launcherPath)).toContain('teacher_generation="v9"');
  });

  it("publishes bilingual aggregate-only evidence and the reviewed three-seed handoff", () => {
    expect(evidence()).toMatchObject({
      training_handoff: {
        reviewed_exact_plan_required: true,
        placeholder_or_invented_identities_allowed: false,
        seeds: [42, 43, 44],
        concurrent: true,
        all_processes_spawned_before_polling: true,
        one_seed_failure_stops_remaining_processes: true,
      },
      authority: {
        training_only: true,
        selection_label_read_authorized: false,
        holdout_label_read_authorized: false,
        candidate_selection_authorized: false,
        production_weight_write_authorized: false,
        live_promotion_authorized: false,
        cloud_required: false,
        runtime_network_required: false,
      },
      focused_validation: {
        python: { status: "PASS", tests: 31 },
        typescript_semantic_chain: {
          status: "PASS",
          tests: 5,
          covers_v8_regression: true,
          covers_v9_d14_d16_chain: true,
          covers_fail_closed_mutation: true,
        },
      },
    });
    const publicRecord = [
      read(japanesePath),
      read(englishPath),
      read(evidencePath),
    ].join("\n");
    for (const marker of ["24,000", "42", "43", "44"]) {
      expect(publicRecord).toContain(marker);
    }
    expect(publicRecord).not.toMatch(
      /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen|sha256:)/u,
    );
    expect(publicRecord).not.toMatch(/[0-9a-f]{64}/u);
  });
});
