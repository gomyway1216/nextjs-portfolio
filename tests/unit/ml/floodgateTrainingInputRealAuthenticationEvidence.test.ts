import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-training-input-real-authentication-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-training-input-real-authentication.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-training-input-real-authentication.en.md",
);

function evidence(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(evidencePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Floodgate real training-input authentication evidence", () => {
  it("records the successful 24,000-parent callback and consumer completion", () => {
    expect(evidence()).toMatchObject({
      schema: "shogi-floodgate-training-input-real-authentication-evidence-v1",
      execution: {
        runtime: "node-v22.13.0",
        verifier_revision: "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
        exit_code: 0,
        callback_elapsed_ms: 1088742,
        consumer_completion_elapsed_ms: 1088743,
        post_callback_filesystem_recheck_and_descriptor_close_complete: true,
        formal_postflight_receipt_minted: false,
      },
      authenticated_input: {
        role: "training",
        parents: 24000,
        games: 1000,
      },
    });
  });

  it("keeps teacher, training, A/B, and live counters at zero", () => {
    expect(evidence()).toMatchObject({
      current_counts_after_this_execution: {
        successful_full_24000_training_input_consumer_runs: 1,
        authenticated_training_parents: 24000,
        new_finalized_or_published_teacher_datasets: 0,
        historical_partial_authenticated_parent_records_preserved: 3,
        new_teacher_labels_generated_by_this_authentication_run: 0,
        optimizer_runs: 0,
        candidate_weights: 0,
        formal_ab_games: 0,
        live_weight_changes: 0,
      },
      infrastructure: {
        local_mac: true,
        aws_used: false,
        firebase_or_gcp_used: false,
        vercel_evaluator_compute_used: false,
        runtime_network_used: false,
      },
    });
  });

  it("binds the one-callback optimization and bilingual disclosure", () => {
    const record = evidence();
    expect(record).toMatchObject({
      parallelization_audit: {
        machine_logical_cpus: 14,
        equivalent_verified_run_peak_rss_bytes: 5629476864,
        equivalent_verified_run_peak_rss_gb_approx: 5.63,
        equivalent_verified_run_peak_rss_gib_approx: 5.24,
        raw_receipts_per_ordered_pass: 36349,
        ordered_raw_verifier_passes: 4,
        raw_receipt_validation_operations: 145396,
        duplicate_parallel_verifiers_accelerate_one_completion: false,
        three_authentications_minutes_approx: 54.44,
        saved_by_one_callback_minutes_approx: 36.29,
      },
      strength_first_decision: {
        stable_wasm_candidate_removed_from_critical_path: true,
        teacher_processes_planned: 12,
        milestones_in_one_authenticated_callback: [100, 500, 24000],
      },
    });
    const execution = record.execution as Record<string, number>;
    const audit = record.parallelization_audit as Record<string, number>;
    expect(audit.one_authentication_minutes).toBeCloseTo(
      execution.consumer_completion_elapsed_ms / 60_000,
      12,
    );
    expect(audit.three_authentications_minutes_approx).toBeCloseTo(
      (execution.consumer_completion_elapsed_ms * 3) / 60_000,
      2,
    );
    expect(audit.saved_by_one_callback_minutes_approx).toBeCloseTo(
      (execution.consumer_completion_elapsed_ms * 2) / 60_000,
      2,
    );
    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    for (const article of [japanese, english]) {
      expect(article).toContain("24,000");
      expect(article).toContain("1,088.743");
      expect(article).toContain("YaneuraOu");
      expect(article).toContain("12");
      expect(article).toContain("live");
      expect(article).not.toMatch(
        /(?:\/Users\/|\/private\/|[0-9a-f]{64}|parent_sfen)/,
      );
    }
  });
});
