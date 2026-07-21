import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT } from "../../../ml/floodgate-fresh-final-teacher-runner";
import {
  FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
} from "../../../ml/floodgate-fresh-selection-teacher-runner";
import { strengthFirstTimeoutSkipLimit } from "../../../ml/generate-sibling-teacher";

const repositoryRoot = path.resolve(__dirname, "../../..");
const dataPath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json",
);
const policyPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-fresh-role-teacher-search-policy-v2.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.en.md",
);

function readJson(file: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
}

describe("strength-first fresh timeout quarantine v2 evidence", () => {
  it("records both real v1 failures without claiming a completion", () => {
    expect(readJson(dataPath)).toMatchObject({
      observed_v1_runs: {
        fixed_parent_target: 4_800,
        first_run: {
          completed_parents: 1_678,
          completed_label_records: 9_993,
          terminal_status: "fatal-search-timeout-no-completion-publication",
        },
        exact_resume: {
          newly_completed_parents: 991,
          total_completed_parents: 2_669,
          total_completed_label_records: 15_884,
          terminal_status:
            "same-private-parent-fatal-search-timeout-no-completion-publication",
        },
        same_private_parent_timed_out_twice: true,
        work_skip_records: 0,
        complete_selection_dataset_published: false,
        result_published: false,
      },
    });
  });

  it("binds the exact timeout-only cap-five policy for both fresh roles", () => {
    const policy = readJson(policyPath);
    const policyRaw = fs.readFileSync(policyPath);
    const evidence = readJson(dataPath);
    expect(policy).toMatchObject({
      schema: FRESH_SELECTION_TEACHER_SEARCH_POLICY_SCHEMA,
      role: "fresh_selection_and_fresh_final",
      runtime: {
        parallel_engines: 13,
        threads_per_engine: 1,
        hash_mb_per_engine: 512,
        timeout_ms_per_search: 600_000,
        network: false,
      },
      completion: {
        search_timeout_no_label: {
          disposition: "forced-parent-skip-no-label",
          skip_limit_divisor: 1_000,
          maximum_skips: 5,
          partial_parent_labels_accepted: false,
        },
        proposal_fallback_timeout: "fatal-no-publication",
        proposal_incomplete_without_exact_fallback: "fatal-no-publication",
      },
    });
    expect(strengthFirstTimeoutSkipLimit(4_800)).toBe(5);
    expect(policyRaw.byteLength).toBe(evidence.v2_policy.bytes);
    expect(createHash("sha256").update(policyRaw).digest("hex")).toBe(
      evidence.v2_policy.sha256,
    );
    expect(evidence.execution).toMatchObject({
      local_mac_only: true,
      parallel_engines: 13,
      threads_per_engine: 1,
      hash_mib_per_engine: 512,
      aggregate_hash_mib: 6_656,
      network_requests: 0,
    });
    expect(FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT).toContain(
      "strength-first-selection-v2",
    );
    expect(FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT).toContain(
      "fresh-final-teacher-v2",
    );
  });

  it("records the completed real v2 selection teacher without hiding timeout skips", () => {
    expect(readJson(dataPath)).toMatchObject({
      status:
        "real-v2-fresh-selection-complete-two-selection-invocations-safely-stopped-no-live-write",
      observed_v2_selection_run: {
        terminal_status: "complete-fresh-selection-only-postflight-bound",
        fixed_parent_target: 4_800,
        completed_parents: 4_800,
        emitted_parent_groups: 4_798,
        wall_seconds_approx: 3_450,
        wall_time_approx: "00:57:30",
        forced_parents_skipped: 2,
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 2,
        },
        sealed: true,
        dataset_records: 28_518,
        parallel_engines: 13,
        timeout_skips: 2,
        timeout_skip_cap: 5,
        partial_labels_from_timeout_parents: 0,
        dataset: {
          artifact: "selection.jsonl",
          bytes: 23_800_461,
          sha256:
            "9b18864c2d119edd8714301cddded4112d58adfe1bc5767a7760603d086bc088",
        },
        work: {
          artifact: "work.jsonl",
          bytes: 35_630_716,
          sha256:
            "64f1548ff8abc0481aed3993bfe8b0f7ccb1f5b323ba6937bdc2467438f80365",
        },
        completion_sha256:
          "8751f17692d9d1f2dd3a0358a5a8cf34252acc920fa2ec3eb5bab0617ac47900",
        generation_fingerprint:
          "adfe4c48d524ddca737596b9ac8e12cc6c04ca5c00abd1540bb113bf74545d42",
        run_fingerprint:
          "ea8bb3b8c166928b6806acf9b2db92cad7543e254087ce9f50299e114380ab13",
        complete_selection_dataset_published: true,
        result_published: true,
        candidate_selection_completed: false,
        local_mac_only: true,
        network_requests: 0,
        live_weight_writes: 0,
        aws_training_jobs: 0,
        gcp_or_firebase_training_jobs: 0,
        vercel_training_jobs: 0,
      },
    });
  });

  it("records the first real selection invocation as a pre-evaluation safety stop", () => {
    expect(readJson(dataPath)).toMatchObject({
      observed_first_selection_invocation: {
        ready_registry_pull_request: 579,
        ready_registry_regular_merged: true,
        elapsed_seconds_approx: 4,
        terminal_status:
          "pre-model-evaluation-safety-stop-training-plan-receipt-shape-mismatch",
        raw_preflight_training_plan_fields: ["path", "bytes", "sha256"],
        evaluator_required_fields_before_fix: [
          "path",
          "bytes",
          "sha256",
          "schema",
        ],
        candidate_checkpoint_strict_loads: 3,
        stopped_before_selection_dataset_read: true,
        selection_metric_model_evaluations: 0,
        selection_outputs: 0,
        fresh_final_holdout_reads: 0,
        live_weight_writes: 0,
        fix: {
          status: "reviewed-and-regular-merged",
          pull_request: 581,
          regular_merged: true,
          accepted_preflight_training_plan_fields: ["path", "bytes", "sha256"],
          schema_source: "ready-registry-enrolled-training-plan-identity",
          teacher_artifact_identities_changed: false,
          checkpoint_preflight_sha256_changed: false,
        },
      },
      observed_claims: {
        selection_evaluator_invocations: 2,
        selection_safety_stops: 2,
        selection_preflight_safety_stops: 1,
        selection_dataset_format_safety_stops: 1,
        candidate_checkpoint_strict_loads: 6,
        selection_metric_model_evaluations: 0,
        selection_outputs: 0,
        candidate_selections: 0,
        fresh_final_holdout_reads: 0,
        live_weight_changes: 0,
        strength_improved: false,
        high_dan_calibrated: false,
      },
      next_step:
        "review-and-regular-merge-splitless-fresh-selection-role-adapter-then-rerun-fixed-local-selection-evaluator",
    });
  });

  it("records the second real selection invocation as a splitless-role safety stop", () => {
    expect(readJson(dataPath)).toMatchObject({
      observed_second_selection_invocation: {
        preflight_receipt_fix_pull_request: 581,
        preflight_receipt_fix_regular_merged: true,
        elapsed_seconds_approx: 13.2,
        terminal_status:
          "pre-selection-metric-safety-stop-splitless-fresh-role-loader-mismatch",
        candidate_checkpoint_strict_loads: 3,
        selection_dataset_read: true,
        selection_dataset_records_strict_scanned: 28_518,
        selection_dataset_records_with_split: 0,
        selection_dataset_records_without_split: 28_518,
        fresh_selection_split_absence_intentional: true,
        legacy_loader_required_splits: ["train", "val"],
        legacy_loader_accepted_records: 0,
        legacy_loader_rejected_records: 28_518,
        teacher_data_corrupt: false,
        root_cause:
          "missing-fixed-role-fresh-selection-to-legacy-loader-format-bridge",
        stable_selection_metric_model_loads: 0,
        candidate_selection_metric_model_loads: 0,
        stable_selection_metric_model_evaluations: 0,
        candidate_selection_metric_model_evaluations: 0,
        selection_metric_model_evaluations: 0,
        selection_outputs: 0,
        fresh_final_holdout_reads: 0,
        live_weight_writes: 0,
        fix: {
          status: "implemented-awaiting-review-and-regular-merge",
          scope: "adapter-only",
          missing_split_projection: "val",
          temporary_directory_mode: "0700",
          temporary_file_mode: "0600",
          existing_split_disposition: "reject",
          preserves_original_identity: true,
          preserves_original_order: true,
          preserves_features: true,
          preserves_cp_values: true,
          preserves_ranks: true,
          temporary_file_deleted_on_success: true,
          temporary_file_deleted_on_error: true,
          teacher_artifacts_changed: false,
        },
      },
      observed_claims: {
        selection_evaluator_invocations: 2,
        selection_safety_stops: 2,
        selection_preflight_safety_stops: 1,
        selection_dataset_format_safety_stops: 1,
        candidate_checkpoint_strict_loads: 6,
        selection_dataset_records_strict_scanned: 28_518,
        stable_selection_metric_model_loads: 0,
        candidate_selection_metric_model_loads: 0,
        stable_selection_metric_model_evaluations: 0,
        candidate_selection_metric_model_evaluations: 0,
        selection_metric_model_evaluations: 0,
        selection_outputs: 0,
        candidate_selections: 0,
        fresh_final_holdout_reads: 0,
        live_weight_changes: 0,
      },
    });
  });

  it("records semantic tests and leaves all strength gates unclaimed", () => {
    expect(readJson(dataPath)).toMatchObject({
      local_validation: {
        focused_vitest: {
          files: 4,
          tests: 64,
          passed: 64,
          failed: 0,
        },
        integrated_publication_vitest: {
          files: 7,
          tests: 76,
          passed: 76,
          failed: 0,
        },
        selection_semantic_bridge_vitest: {
          files: 5,
          tests: 68,
          passed: 68,
          failed: 0,
        },
        selection_semantic_bridge_python_focused: {
          tests: 33,
          passed: 33,
          failed: 0,
        },
        selection_splitless_role_evidence_vitest: {
          files: 1,
          tests: 7,
          passed: 7,
          failed: 0,
        },
        selection_splitless_role_python_focused: {
          tests: 8,
          passed: 8,
          failed: 0,
        },
        selection_splitless_role_real_loader_torch: {
          tests: 1,
          passed: 1,
          failed: 0,
        },
        python_stdlib: {
          tests: 421,
          passed: 421,
          failed: 0,
        },
        semantic_timeout_cases: {
          timeout_quarantine_and_engine_restart: "PASS",
          partial_labels_from_timed_out_parent: 0,
          sixth_timeout_fails_closed: "PASS",
          proposal_incomplete_remains_fatal: "PASS",
          proposal_fallback_timeout_remains_fatal: "PASS",
          forbidden_resume_skip_rejected_before_engine_start: "PASS",
          coherently_rehashed_nested_semantic_drift_fails_before_evaluation:
            "PASS",
          real_generator_fixture_validates_source_result_manifest_dataset_and_work:
            "PASS",
        },
        typescript_compile: "PASS",
        eslint: "PASS",
        prettier: "PASS",
        git_diff_check: "PASS",
      },
      observed_claims: {
        real_v2_parent_labels: 4_798,
        real_v2_label_records: 28_518,
        complete_v2_selection_datasets: 1,
        candidate_selections: 0,
        formal_ab_games: 0,
        live_weight_changes: 0,
        strength_improved: false,
        high_dan_calibrated: false,
      },
    });
  });

  it("keeps the bilingual record free of private positions and absolute paths", () => {
    for (const file of [japanesePath, englishPath]) {
      const text = fs.readFileSync(file, "utf8");
      expect(text).toContain("2,669");
      expect(text).toContain("64");
      expect(text).not.toContain("/Users/");
      expect(text).not.toMatch(/\b[0-9a-f]{64}\b/iu);
      expect(text).not.toMatch(
        /(?:\/Users\/|\/home\/|\/private\/var\/|[A-Z]:\\Users\\|\.codex\/shogi-(?:runs|data)\/)/iu,
      );
      expect(text.toLowerCase()).not.toContain("parent_sfen");
    }
    expect(readJson(dataPath)).toMatchObject({
      privacy: {
        private_absolute_home_path_published: false,
        private_parent_identifier_published: false,
        sfen_or_moves_published: false,
        teacher_scores_published: false,
        private_work_sha256_published: true,
        private_work_contents_published: false,
      },
    });
  });
});
