import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-three-seed-training-bridge-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-three-seed-training-bridge.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-three-seed-training-bridge.en.md",
);
const planPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json",
);
const packagePath = path.join(repositoryRoot, "package.json");

function evidence(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(evidencePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Floodgate strength-first three-seed training bridge evidence", () => {
  it("keeps the future exact plan absent and records the pre-dispatch STOP", () => {
    expect(fs.existsSync(planPath)).toBe(false);
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-three-seed-training-bridge-evidence-v1",
      future_exact_plan: {
        path: "ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json",
        exists_at_publication: false,
        intentionally_absent_until_real_24000_teacher_identities_exist: true,
        placeholder_or_invented_hashes_allowed: false,
      },
      observed_argumentless_stop: {
        command: "python3 ml/run_strength_first_three_seed_training.py",
        exit_code: 1,
        status: "expected-STOP-exact-data-only-plan-absent",
        git_revision_reads: 0,
        local_training_artifact_scans: 0,
        training_subprocesses_spawned: 0,
        train_py_invocations: 0,
        torch_loads: 0,
        stop_order_verified_by_injected_regression_test: true,
      },
    });
  });

  it("binds the exact flat teacher source through result, manifest, and rescanning", () => {
    expect(evidence()).toMatchObject({
      fixed_teacher_source: {
        root: "~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v6",
        flat_root: true,
        files: {
          work: "work.jsonl",
          result: "result.json",
          manifest: "manifest.json",
          train: "train.jsonl",
          parent_completion: "parent-completion.jsonl",
        },
      },
      cross_binding: {
        future_plan_pins_bytes_and_sha256_for_each_teacher_file: true,
        teacher_result_binds: [
          "work",
          "train",
          "parent_completion",
          "manifest",
        ],
        teacher_manifest_binds: ["train", "parent_completion"],
        role_bundle_training_raw_bound_to_same_plan: true,
        raw_input_completion_and_train_rescanned: true,
        parent_disposition: "exactly-one-of-forced-skip-or-emitted-group",
        completion_records_expected: 24000,
        group_records_and_digest_recomputed: true,
        game_parent_and_semantic_position_accounting_recomputed: true,
        near_plan_paths_rejected: true,
        symlinked_plan_path_rejected: true,
        plan_reread_after_tracking_verification: true,
      },
    });
  });

  it("fixes three concurrent warm-only CPU seeds without selection authority", () => {
    expect(evidence()).toMatchObject({
      future_training_grid: {
        processes_spawned_before_polling: 3,
        concurrent: true,
        seeds: [42, 43, 44],
        initializer: "fixed-warm-model-only",
        optimizer_and_scheduler_resumed: false,
        learning_rate: 0.0001,
        epochs: 20,
        batch: 256,
        device: "cpu",
        torch_threads_per_process: 2,
        torch_interop_threads_per_process: 1,
        early_stopping: false,
        checkpoint_policy: "fixed-final-epoch-only",
        candidate_artifact: "final.pt",
        one_seed_failure_stops_remaining_processes: true,
      },
      authority: {
        training_only: true,
        selection_label_read_authorized: false,
        holdout_label_read_authorized: false,
        protected_identifier_lists_may_be_used_for_leakage_rejection: true,
        candidate_selection_authorized: false,
        production_weight_write_authorized: false,
        live_promotion_authorized: false,
      },
    });
  });

  it("keeps every real downstream counter at zero while validation and rereview pass", () => {
    expect(evidence()).toMatchObject({
      observed_counts_at_publication: {
        complete_real_strength_first_teacher_runs: 0,
        complete_real_strength_first_teacher_datasets: 0,
        real_three_seed_training_processes: 0,
        complete_real_training_runs: 0,
        candidate_checkpoints_from_this_bridge: 0,
        candidate_selections: 0,
        holdout_evaluations: 0,
        formal_ab_games: 0,
        external_calibration_games: 0,
        live_weight_changes: 0,
      },
      validation: {
        focused_stdlib: {
          status: "PASS",
          tests: 23,
        },
        full_ml_stdlib: {
          status: "PASS",
          tests: 190,
          elapsed_seconds: 12.04,
        },
        direct_argumentless_stop: "PASS",
        diff_check: "PASS",
        package_json_clean: true,
      },
      independent_rereview: {
        status: "PASS",
        P0: 0,
        P1: 0,
        P2: 0,
      },
      estimates_and_strength_claims: {
        training_duration_estimate_published: false,
        playing_strength_estimate_published: false,
        strength_improved_claimed: false,
        high_dan_calibrated_claimed: false,
      },
    });
  });

  it("proves package.json stayed unchanged and bilingual disclosure contains no private path", () => {
    const packageBytes = fs.readFileSync(packagePath);
    const packageJson = JSON.parse(packageBytes.toString("utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageBytes.byteLength).toBe(8463);
    expect(createHash("sha256").update(packageBytes).digest("hex")).toBe(
      "788771f7a99a615159ebbd8b174dd85bad1f3a7fb80ab8cd7cf652a680467647",
    );
    expect(
      packageJson.scripts["shogi:floodgate-strength-first-training"],
    ).toBeUndefined();
    expect(evidence()).toMatchObject({
      implementation: {
        package_json_changed: false,
        npm_script_added: false,
        direct_python_command_required: true,
      },
      package_json_identity: {
        path: "package.json",
        bytes: 8463,
        sha256:
          "788771f7a99a615159ebbd8b174dd85bad1f3a7fb80ab8cd7cf652a680467647",
        changed_by_bridge: false,
        strength_first_training_script_present: false,
      },
      privacy: {
        teacher_root_disclosed_with_tilde_not_private_absolute_home: true,
        private_absolute_paths_published: false,
        training_positions_or_identifiers_published: false,
      },
    });

    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    for (const article of [japanese, english]) {
      expect(article).toContain("24,000");
      expect(article).toContain("23");
      expect(article).toContain("190");
      expect(article).toContain("42");
      expect(article).toContain("43");
      expect(article).toContain("44");
      expect(article).toContain("package.json");
      expect(article).toMatch(/(?:意図的に|intentionally)/i);
      expect(article).toMatch(/STOP/i);
      expect(article).not.toMatch(
        /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen)/,
      );
    }
  });
});
