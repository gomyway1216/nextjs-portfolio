import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT } from "../../../ml/generate-sibling-teacher";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-teacher-runner-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-teacher-runner.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-teacher-runner.en.md",
);

function evidence(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(evidencePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Floodgate strength-first teacher runner evidence", () => {
  it("separates completed implementation from a real teacher execution", () => {
    expect(evidence()).toMatchObject({
      schema: "shogi-floodgate-strength-first-teacher-runner-evidence-v1",
      implementation_state: {
        local_runner_implementation_complete: true,
        pre_review_focused_tests_complete: true,
        final_post_review_focused_tests_complete: true,
        real_teacher_run_started: false,
        argumentless_command:
          '"$HOME/.nvm/versions/node/v22.13.0/bin/node" -r tsx/cjs ml/run-floodgate-strength-first-teacher.ts',
        package_json_changed: false,
        accepts_path_overrides: false,
        runtime: "node-v22.13.0",
        platform: "darwin-arm64",
      },
      observed_counts_at_publication: {
        real_strength_first_command_invocations: 0,
        real_strength_first_authenticated_callbacks: 0,
        real_teacher_engine_processes_started: 0,
        complete_teacher_milestones: 0,
        complete_teacher_datasets: 0,
        generated_teacher_label_rows: 0,
        optimizer_runs: 0,
        candidate_weights: 0,
        completed_candidate_selections: 0,
        formal_ab_games: 0,
        external_calibration_games: 0,
        live_weight_changes: 0,
        historical_partial_parent_records: 3,
        historical_partial_records_count_as_completed_milestone_or_dataset: false,
      },
    });
  });

  it("records the real source authentication and exact one-versus-three math", () => {
    const record = evidence();
    expect(record).toMatchObject({
      authenticated_source_reference: {
        successful_real_consumer_runs: 1,
        parents: 24000,
        games: 1000,
        callback_elapsed_ms: 1088742,
        consumer_completion_elapsed_ms: 1088743,
        bundle_verifier_revision: "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
      },
      authentication_time_math: {
        one_authentication_minutes: 18.145716666666666,
        three_authentications_minutes_approx: 54.44,
        saved_by_one_callback_minutes_approx: 36.29,
        math_source_elapsed_ms: 1088743,
      },
    });
    const authentication = record.authenticated_source_reference as Record<
      string,
      number
    >;
    const timing = record.authentication_time_math as Record<string, number>;
    expect(timing.one_authentication_minutes).toBeCloseTo(
      authentication.consumer_completion_elapsed_ms / 60_000,
      12,
    );
    expect(timing.three_authentications_minutes_approx).toBeCloseTo(
      (authentication.consumer_completion_elapsed_ms * 3) / 60_000,
      2,
    );
    expect(timing.saved_by_one_callback_minutes_approx).toBeCloseTo(
      (authentication.consumer_completion_elapsed_ms * 2) / 60_000,
      2,
    );
  });

  it("binds one callback, three targets, and the fixed local teacher contract", () => {
    const record = evidence();
    expect(record).toMatchObject({
      runner_identity: {
        runner_revision: "captured-at-runtime-as-exact-clean-git-head",
        bundle_verifier_revision: "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
        runner_and_bundle_verifier_revisions_are_separate: true,
        actual_runner_revision_from_real_execution: null,
      },
      single_authenticated_lifetime_contract: {
        formal_postflight_consumer_invocations: 1,
        authenticated_consumer_callbacks: 1,
        synchronous_runtime_input_claims_at_callback_entry: 1,
        consumer_postflight_claims_before_result_commit: 1,
        same_authenticated_input_for_all_targets: true,
        same_flat_stage_for_all_targets: true,
        targets_in_order: [100, 500, 24000],
        automatic_continuation_without_operator_confirmation: true,
      },
      teacher_contract: {
        engine: "YaneuraOu",
        parallel_processes: 12,
        threads_per_process: 1,
        proposal: {
          depth: 16,
          multipv: 12,
          candidate_union_includes_strong_game_played_move: true,
        },
        independent_rescore: {
          depth: 16,
          multipv: 1,
          searchmoves: "exactly-one-candidate",
        },
        hash_mb_per_process: 64,
        timeout_ms_per_search: 600000,
        stable_assets_integrity_verified_by_preflight: true,
        stable_engine_or_policy_executions: 0,
      },
      infrastructure: {
        local_mac_only: true,
        runtime_network_requests: 0,
        runtime_cloud_services: [],
        aws_used: false,
        firebase_or_gcp_used: false,
        vercel_used_for_teacher_compute: false,
      },
    });
    expect(
      (record.teacher_contract as Record<string, unknown>).engine_environment,
    ).toEqual(SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT);
  });

  it("records flat durable publication and canonical training-only completion", () => {
    expect(evidence()).toMatchObject({
      durable_output_contract: {
        root: "~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v6",
        flat_root: true,
        exclusive_run_lock: {
          implementation:
            "macos-/usr/bin/lockf-inherited-fd-kernel-advisory-lock",
          retained_private_inode: true,
          parent_held_descriptor_backed_lock: true,
          acquisition_helper_exits_before_acquisition_returns: true,
          parent_and_helper_share_same_open_file_description: true,
          parent_retained_descriptor_keeps_lock_after_helper_exit: true,
          parent_fd_close_releases_lock: true,
          parent_death_auto_closes_fd_and_releases_lock: true,
          nonblocking_active_holder_rejection: true,
          lock_path_unlink_or_reopen: false,
          pid_token_or_keeper_process: false,
          two_contender_test_exactly_one_success: true,
        },
        files: [
          "work.jsonl",
          "milestone-100.json",
          "milestone-500.json",
          "train.jsonl",
          "parent-completion.jsonl",
          "manifest.json",
          "staged-result.json",
          "result.json",
        ],
        work_entry_datasync: true,
        canonical_atomic_rewrite: true,
        file_sync_before_rename: true,
        same_directory_rename: true,
        directory_sync_after_rename: true,
        result_committed_only_after_exact_consumer_postflight_claim: true,
        completed_retry_revalidates_all_bound_files: true,
        completed_retry_reauthenticates_input: false,
        completed_retry_runs_engines: false,
        idempotent_completion: true,
      },
      training_only_completion_contract: {
        canonical_train_jsonl: true,
        all_emitted_rows_split: "train",
        internal_random_validation_split: false,
        parent_completion_records_expected: 24000,
        each_parent_is_emitted_group_or_forced_skip: true,
        manifest_binds_training_and_parent_completion: true,
        fresh_selection_read_during_teacher_run: false,
        fresh_final_holdout_read_during_teacher_run: false,
        existing_final_holdout_read_during_teacher_run: false,
      },
    });
  });

  it("publishes cautious estimates, validation state, and no private payloads", () => {
    const record = evidence();
    expect(record).toMatchObject({
      duration_estimates_not_measurements: {
        real_100_end_to_end_minutes_from_command_start: {
          lower: 22,
          upper: 35,
        },
        full_24000_teacher_hours_excluding_authentication: {
          lower: 11.5,
          upper: 12,
        },
        authentication_is_additional: true,
      },
      local_validation: {
        pre_review_focused_snapshot: {
          status: "PASS",
          files: 4,
          tests: 26,
        },
        final_post_review_focused_rerun: {
          status: "PASS",
          files: 5,
          tests: 46,
        },
        runner_unit_validation: {
          status: "PASS",
          tests: 23,
        },
        final_related_runner_asset_usi_postflight_rerun: {
          status: "PASS",
          files: 8,
          tests: 120,
        },
        publication_evidence: {
          status: "PASS",
          tests: 5,
        },
        scoped_eslint: "PASS",
        prettier: "PASS",
        git_diff_check: "PASS",
        new_typescript_files: {
          errors: 0,
        },
        repository_wide_typescript: {
          status: "not-clean-unrelated-pre-existing-errors-remain",
          attributed_to_strength_first_runner: false,
        },
      },
      local_resource_plan: {
        observed_physical_cpus: 14,
        observed_logical_cpus: 14,
        observed_memory_bytes: 51539607552,
        observed_memory_gib: 48,
        observed_free_disk_gib: 106,
        teacher_search_processes: 12,
        reserved_cores_for_input_durability_and_os: 2,
        primary_bottleneck: "cpu-search-not-memory-or-disk-capacity",
      },
      independent_review: {
        teacher_core: {
          status: "PASS",
          P0: 0,
          P1: 0,
          P2: 0,
        },
        runner: {
          status: "PASS",
          P0: 0,
          P1: 0,
          P2: 0,
        },
      },
      privacy: {
        durable_root_disclosed_with_tilde_not_private_absolute_home: true,
        private_absolute_paths_published: false,
        training_positions_published: false,
        training_parent_or_game_identifiers_published: false,
        private_file_digests_published: false,
      },
    });

    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    const publicText = [
      japanese,
      english,
      fs.readFileSync(evidencePath, "utf8"),
    ].join("\n");
    for (const article of [japanese, english]) {
      expect(article).toContain("24,000");
      expect(article).toContain("1,088.743");
      expect(article).toContain("54.44");
      expect(article).toContain("36.29");
      expect(article).toContain("11.5");
      expect(article).toContain("YaneuraOu");
      expect(article).toContain("12");
      expect(article).toContain("__CF_USER_TEXT_ENCODING");
      expect(article).toContain("OMP_THREAD_LIMIT");
      expect(article).toMatch(
        /(?:実teacher runはまだ[\s>]*開始していない|real teacher run has not started)/i,
      );
    }
    expect(publicText).not.toMatch(
      /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen)/,
    );
    expect(publicText).not.toMatch(/[0-9a-f]{64}/);
  });
});
