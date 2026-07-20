import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT,
  FRESH_FINAL_TEACHER_SOURCE,
} from "../../../ml/floodgate-fresh-final-teacher-runner";
import {
  FRESH_SELECTION_TEACHER_HASH_MB_PER_ENGINE,
  FRESH_SELECTION_TEACHER_PARALLEL_ENGINES,
} from "../../../ml/floodgate-fresh-selection-teacher-runner";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-fresh-final-teacher-runner-2026-07-20.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-fresh-final-teacher-runner.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-fresh-final-teacher-runner.en.md",
);
const registryPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-selection-evaluator-registry.json",
);

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

describe("Floodgate strength-first fresh-final teacher evidence", () => {
  it("records the real closed selection gate and exact all-zero STOP counters", () => {
    expect(readJson(registryPath)).toMatchObject({
      status: "awaiting-exact-plan-three-checkpoints-and-selection-teacher",
      gates: {
        local_selection_evaluation_authorized: false,
        final_holdout_read_authorized: false,
        production_weight_write_authorized: false,
      },
      nonclaims: {
        real_candidate_selected: false,
        final_holdout_label_reads: 0,
        live_weights_changed: false,
        strength_improved: false,
        high_dan_calibrated: false,
      },
    });
    expect(readJson(evidencePath)).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-fresh-final-teacher-runner-evidence-v1",
      current_selection_gate: {
        selected_candidate_receipt_enrolled: false,
        selected_candidate_exists: false,
        downstream_ready_registry_consulted: false,
        downstream_ready_registry_required: false,
        direct_command: {
          exit_code: 2,
          status: "STOP",
          reason: "selected-candidate-receipt-not-ready",
          selection_evaluator_registry_reads: 1,
          selection_receipt_reads: 0,
          selection_dataset_reads: 0,
          fresh_final_source_reads: 0,
          fresh_final_label_reads: 0,
          teacher_engines_started: 0,
          network_requests: 0,
          cloud_requests: 0,
          live_weight_writes: 0,
        },
      },
    });
  });

  it("binds the registered 4,800-position fresh-final source without claiming a read", () => {
    expect(readJson(evidencePath)).toMatchObject({
      fixed_source: {
        role: "fresh_final_holdout",
        records: FRESH_FINAL_TEACHER_SOURCE.records,
        games: FRESH_FINAL_TEACHER_SOURCE.games,
        bytes: FRESH_FINAL_TEACHER_SOURCE.bytes,
        sha256: FRESH_FINAL_TEACHER_SOURCE.sha256,
        game_ids_sha256: FRESH_FINAL_TEACHER_SOURCE.game_ids_sha256,
        parent_ids_sha256: FRESH_FINAL_TEACHER_SOURCE.parent_ids_sha256,
        position_ids_count: FRESH_FINAL_TEACHER_SOURCE.position_ids_count,
        position_ids_sha256: FRESH_FINAL_TEACHER_SOURCE.position_ids_sha256,
        opened_during_implementation_or_validation: false,
      },
      observed_counts_at_publication: {
        real_selected_candidates: 0,
        real_selection_receipt_reads: 0,
        real_fresh_final_source_reads: 0,
        real_fresh_final_teacher_engine_processes: 0,
        real_fresh_final_parent_labels: 0,
        complete_fresh_final_teacher_datasets: 0,
        live_weight_changes: 0,
      },
    });
  });

  it("records the shared measured 12-by-512 local policy and exact output", () => {
    expect(FRESH_SELECTION_TEACHER_PARALLEL_ENGINES).toBe(12);
    expect(FRESH_SELECTION_TEACHER_HASH_MB_PER_ENGINE).toBe(512);
    expect(readJson(evidencePath)).toMatchObject({
      local_compute: {
        execution: "local-mac-only",
        parallel_processes: 12,
        threads_per_process: 1,
        hash_mib_per_process: 512,
        aggregate_hash_mib: 6_144,
        pre_first_run_parallelism_benchmark: {
          required: true,
          timing: "after-current-24000-run-releases-cpu",
          sample: "public-non-holdout-positions",
          exact_policy_multipv: 6,
          process_candidates: [12, 13],
          fresh_final_holdout_reads: 0,
          amend_reviewed_policy_only_if_13_is_measured_faster: true,
          existing_13_process_measurement_policy_multipv: 12,
          existing_measurement_claimed_applicable_to_multipv6: false,
        },
        runtime_network_requests: 0,
        cloud_services_required: [],
        aws_used: false,
        firebase_or_gcp_used: false,
        vercel_used_for_teacher_compute: false,
      },
      completion_contract: {
        output_root: `~/${FRESH_FINAL_TEACHER_OUTPUT_RELATIVE_ROOT}`,
        dataset: "final.jsonl",
        directory_mode: "0700",
        file_mode: "0600",
        strict_existing_result_revalidation: true,
        existing_result_tamper_negatives: [
          "dataset-byte",
          "manifest",
          "authority",
          "completion-type",
          "selected-checkpoint",
        ],
      },
    });
  });

  it("keeps bilingual disclosure private and every strength claim false", () => {
    expect(readJson(evidencePath)).toMatchObject({
      local_validation: {
        typescript_compile: "PASS",
        focused_runtime_vitest: { status: "PASS", files: 3, tests: 20 },
        publication_evidence_vitest: { status: "PASS", files: 1, tests: 4 },
        combined_focused_vitest: { status: "PASS", files: 4, tests: 24 },
        python_receipt_preflight: { status: "PASS", tests: 4 },
        production_stop_command: "PASS",
        git_diff_check: "PASS",
        independent_review: "PENDING",
        github_ci: "PENDING",
      },
      privacy: {
        private_absolute_home_path_published: false,
        fresh_final_positions_or_labels_published: false,
        selected_checkpoint_bytes_published: false,
      },
      nonclaims: {
        playing_strength_improved: false,
        high_dan_calibrated: false,
        candidate_selected: false,
        fresh_final_evaluated: false,
        formal_ab_passed: false,
        external_calibration_passed: false,
        live_weights_changed: false,
      },
    });
    for (const articlePath of [japanesePath, englishPath]) {
      const article = fs.readFileSync(articlePath, "utf8");
      expect(article).toContain("12");
      expect(article).toContain("512");
      expect(article).toContain("final.jsonl");
      expect(article).not.toContain("/Users/");
      expect(article).not.toContain("高段になった");
      expect(article).not.toContain("high-dan achieved");
    }
  });
});
