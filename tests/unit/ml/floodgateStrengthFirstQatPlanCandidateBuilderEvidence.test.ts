import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const sourcePath = path.join(
  repositoryRoot,
  "ml/build_strength_first_qat_training_plan_candidate.py",
);
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-qat-plan-candidate-builder-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-qat-plan-candidate-builder.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-qat-plan-candidate-builder.en.md",
);
const bridgeJapanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-three-seed-training-bridge.md",
);
const bridgeEnglishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-three-seed-training-bridge.en.md",
);
const bridgeEvidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-three-seed-training-bridge-2026-07-19.json",
);
const readmePath = path.join(repositoryRoot, "ml/README.md");
const planPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json",
);

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidencePath)) as Record<string, unknown>;
}

describe("Floodgate strength-first QAT plan candidate builder evidence", () => {
  it("keeps the exact plan unenrolled and records the stdout-only builder", () => {
    expect(fs.existsSync(planPath)).toBe(false);
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-qat-plan-candidate-builder-evidence-v1",
      implementation: {
        builder: "ml/build_strength_first_qat_training_plan_candidate.py",
        command:
          "python3 ml/build_strength_first_qat_training_plan_candidate.py",
        argumentless: true,
        success_output: "one-exact-plan-json-on-stdout",
        tracked_plan_write_implemented: false,
        existing_plan_overwrite_allowed: false,
        training_launch_implemented: false,
        selection_or_holdout_reader_implemented: false,
        network_or_cloud_call_implemented: false,
        live_weight_write_implemented: false,
      },
      observed_active_v7_stop: {
        exit_code: 1,
        stdout_bytes: 0,
        reason: "v7-teacher-lock-held-by-active-run",
        artifact_snapshots: 0,
        runtime_probes: 0,
        torch_imports: 0,
        plan_candidates_emitted: 0,
      },
      observed_released_v7_stop: {
        exit_code: 1,
        stdout_bytes: 0,
        retained_lock_file_present: true,
        retained_lock_acquired: true,
        reason: "terminal-v7-artifact-absent-teacher-result",
        artifact_snapshots: 0,
        runtime_probes: 0,
        torch_imports: 0,
        plan_candidates_emitted: 0,
      },
    });
  });

  it("fixes the narrow read surface and every authority bit", () => {
    expect(evidence()).toMatchObject({
      fixed_paths: {
        teacher_root: "~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v7",
        teacher_terminal_files: [
          "result.json",
          "manifest.json",
          "work.jsonl",
          "parent-completion.jsonl",
          "train.jsonl",
        ],
        role_bundle_files: [
          "manifest.json",
          "training.raw.jsonl",
          "replay-excluded-position-ids.txt",
        ],
        sealed_files: ["runOp1-train.jsonl", "runOp1-best.pt"],
      },
      candidate_contract: {
        seeds: [42, 43, 44],
        training_only: true,
        selection_label_read_authorized: false,
        holdout_label_read_authorized: false,
        candidate_selection_authorized: false,
        production_weight_write_authorized: false,
      },
      forbidden_reads_and_actions: {
        fresh_selection_raw_or_labels: 0,
        fresh_final_holdout_raw_or_labels: 0,
        protected_identifier_files: 0,
        training_output_slots: 0,
        git_commands: 0,
        network_requests: 0,
        cloud_requests: 0,
        training_processes: 0,
        selection_evaluations: 0,
        live_weight_changes: 0,
      },
    });

    const source = read(sourcePath);
    expect(source).toContain("STRENGTH_FIRST_TEACHER_LOCK_FILENAME");
    expect(source).toContain(
      "build_strength_first_qat_training_plan_candidate_data",
    );
    expect(source).toContain("configure_sealed_torch_runtime(2)");
    expect(source).not.toMatch(
      /fresh-(?:selection|final-holdout)\.(?:raw|protected)/u,
    );
    expect(source).not.toMatch(
      /(?:urllib|requests|socket|boto3|firebase|vercel)/u,
    );
  });

  it("records terminal gates before runtime and exact source recomputation", () => {
    expect(evidence()).toMatchObject({
      completion_and_snapshot_gates: {
        tracked_plan_must_be_absent: true,
        retained_teacher_lock_file_may_remain: true,
        retained_teacher_lock_acquired_nonblocking: true,
        retained_teacher_lock_held_through_candidate_construction: true,
        teacher_result_checked_first: true,
        all_terminal_files_required: true,
        effective_owner_required: true,
        accepted_modes: ["0400", "0600"],
        single_link_required: true,
        regular_files_required: true,
        symbolic_link_components_rejected: true,
        snapshot_metadata_revalidated_after_runtime_probe: true,
        retained_teacher_lock_revalidated_before_stdout: true,
        retained_teacher_lock_held_through_stdout_flush: true,
        retained_teacher_lock_path_inode_replacement_rejected: true,
        retained_teacher_lock_released_after_success_or_error: true,
      },
      source_validation: {
        strict_duplicate_rejecting_json: true,
        role_teacher_result_cross_binding: true,
        raw_completion_train_neutral_rescan: true,
        input_parents_required: 24000,
        forced_plus_emitted_required: 24000,
        replacement_parents_allowed: 0,
        resampled_parents_allowed: 0,
        replay_exclusion_ascii_canonical_sorted_unique: true,
        replay_exclusion_file_and_identifier_hashes_recomputed: true,
      },
      runtime_probe: {
        runs_only_after_source_validation: true,
        fixed_training_python: true,
        isolated_python_mode: true,
        canonical_parent_required: true,
        regular_executable_target_required: true,
        safe_target_owner_mode_and_link_count_required: true,
        venv_final_symlink_allowed: true,
        entry_and_target_identity_revalidated_after_probe: true,
        directory_target_rejected_before_subprocess: true,
        dataset_reads: 0,
        model_constructions: 0,
        optimizer_steps: 0,
        checkpoint_writes: 0,
      },
    });
  });

  it("corrects stale v6 documentation and publishes bilingual disclosure", () => {
    expect(read(readmePath)).toContain("strength-first-v7");
    const correctedBridgeRecords = [
      read(bridgeJapanesePath),
      read(bridgeEnglishPath),
      read(bridgeEvidencePath),
    ];
    for (const record of correctedBridgeRecords) {
      expect(record).toContain("strength-first-v7");
      expect(record).not.toContain("strength-first-v6");
    }
    for (const article of [read(japanesePath), read(englishPath)]) {
      expect(article).toContain(
        "python3 ml/build_strength_first_qat_training_plan_candidate.py",
      );
      expect(article).toContain("stdout");
      expect(article).toContain("24,000");
      expect(article).toContain("42");
      expect(article).toContain("43");
      expect(article).toContain("44");
      expect(article).toContain("v7");
      expect(article).not.toMatch(
        /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen)/u,
      );
    }
  });
});
