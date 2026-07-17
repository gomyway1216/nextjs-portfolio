import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-stable-worker6-comparison.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-stable-worker6-comparison.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-stable-worker6-comparison-2026-07-17.json",
);
const BASELINE_EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-stable-timeout-confirmation-2026-07-17.json",
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

function mean(values: number[]): number {
  if (values.length === 0) {
    throw new Error("mean requires at least one value");
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error("median requires at least one value");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

describe("stable-WASM six-versus-twelve-worker evidence", () => {
  it("uses total helper semantics for empty and even-length inputs", () => {
    expect(() => mean([])).toThrow("at least one value");
    expect(() => median([])).toThrow("at least one value");
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("keeps Japanese and English articles aligned on the seven-section STOP boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);

    expect(numberedSections(japanese)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(numberedSections(english)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(japanese).toContain(
      "blog-shogi-floodgate-stable-worker6-comparison.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-stable-worker6-comparison.md",
    );
    for (const marker of [
      "ce33913014eb0e990dfaabe344e2e7c8d5e393d5",
      "7 / 5",
      "91.617",
      "132.708",
      "601.243",
      "6,822.3 MiB",
      "search-timeout",
      "STOP",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
  });

  it("records exact fixed inputs and the six-worker outcomes", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-stable-wasm-worker-count-comparison-evidence-v1",
      execution_source: {
        repository_revision: "ce33913014eb0e990dfaabe344e2e7c8d5e393d5",
        repository_tree: "c49276cb15568677c65780ddd188f6a4c3fdb247",
        revision_was_merged_main_at_start: true,
        fixed_node_version: "v22.13.0",
        inline_diagnostic_wrapper_tracked: false,
        production_deployment_run: false,
      },
      fixed_comparison_boundary: {
        authenticated_training_input: true,
        requested_depth: 11,
        quiescence_depth: 10,
        queue_bound: 48,
        search_timeout_ms: 600000,
        only_changed_setting: "workers-12-to-6",
        production_gate_invocations: 0,
      },
      candidate_6_workers: {
        workers: 6,
        preprocessing_seconds: 1063.005,
        runtime_initialization_seconds: 0.113,
        diagnostic_total_seconds: 1664.248,
        parent_peak_rss_mib: 6822.3,
        fulfilled_count: 7,
        rejected_count: 5,
        broadcast_failure_kind: "search-timeout",
        broadcast_timeout_ms: 600000,
        pool_close: "fulfilled",
        fatal_safe: null,
      },
    });
    expect(evidence.candidate_6_workers.fulfilled_elapsed_seconds).toEqual([
      5.391, 89.634, 90.887, 91.617, 153.173, 242.635, 255.621,
    ]);
    expect(evidence.candidate_6_workers.rejected_elapsed_seconds).toEqual([
      600, 600.001, 600.002, 600.002, 600.004,
    ]);
    expect(
      evidence.candidate_6_workers.fulfilled_count +
        evidence.candidate_6_workers.rejected_count,
    ).toBe(
      evidence.fixed_comparison_boundary.logical_candidate_window
        .candidate_count,
    );
  });

  it("recomputes the comparison and rejects a worker-count improvement claim", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    const baseline = evidence.baseline_12_workers;
    const candidate = evidence.candidate_6_workers;
    const derived = evidence.derived_comparison;

    expect(median(baseline.fulfilled_elapsed_seconds)).toBe(
      derived.baseline_fulfilled_median_seconds,
    );
    expect(median(candidate.fulfilled_elapsed_seconds)).toBe(
      derived.candidate_fulfilled_median_seconds,
    );
    expect(mean(baseline.fulfilled_elapsed_seconds)).toBeCloseTo(
      derived.baseline_fulfilled_mean_seconds,
      12,
    );
    expect(mean(candidate.fulfilled_elapsed_seconds)).toBeCloseTo(
      derived.candidate_fulfilled_mean_seconds,
      12,
    );
    expect(
      candidate.diagnostic_total_seconds - candidate.preprocessing_seconds,
    ).toBeCloseTo(candidate.post_preprocessing_total_seconds, 12);
    expect(
      baseline.diagnostic_total_seconds - baseline.preprocessing_seconds,
    ).toBeCloseTo(baseline.post_preprocessing_total_seconds, 12);
    expect(
      candidate.post_preprocessing_total_seconds -
        baseline.post_preprocessing_total_seconds,
    ).toBeCloseTo(derived.post_preprocessing_total_change_seconds, 12);
    expect(
      candidate.preprocessing_seconds - baseline.preprocessing_seconds,
    ).toBeCloseTo(derived.preprocessing_change_seconds, 12);
    expect(
      candidate.diagnostic_total_seconds - baseline.diagnostic_total_seconds,
    ).toBeCloseTo(derived.diagnostic_total_change_seconds, 12);
    expect(
      (derived.candidate_fulfilled_median_seconds /
        derived.baseline_fulfilled_median_seconds -
        1) *
        100,
    ).toBeCloseTo(derived.fulfilled_median_change_percent, 12);
    expect(
      (derived.candidate_fulfilled_mean_seconds /
        derived.baseline_fulfilled_mean_seconds -
        1) *
        100,
    ).toBeCloseTo(derived.fulfilled_mean_change_percent, 12);
    expect(
      Math.max(...candidate.fulfilled_elapsed_seconds) -
        Math.max(...baseline.fulfilled_elapsed_seconds),
    ).toBeCloseTo(derived.fulfilled_max_change_seconds, 12);
    expect(
      candidate.parent_peak_rss_mib - baseline.parent_peak_rss_mib,
    ).toBeCloseTo(derived.parent_peak_rss_change_mib, 12);
    expect(
      (candidate.parent_peak_rss_mib / baseline.parent_peak_rss_mib - 1) * 100,
    ).toBeCloseTo(derived.parent_peak_rss_change_percent, 12);
    expect(derived).toMatchObject({
      fulfilled_count_delta: 0,
      rejected_count_delta: 0,
      search_terminal_wall_time_effectively_unchanged: true,
      overall_time_reduction_attributed_to_workers: false,
      overall_time_reduction_explained_by_preprocessing: true,
      worker_reduction_improved_timeout_count: false,
      worker_reduction_improved_completed_count: false,
      worker_reduction_demonstrated_parent_memory_saving: false,
      worker_reduction_worsened_typical_fulfilled_latency: true,
    });
    expect(derived.fulfilled_median_change_percent).toBeGreaterThan(38);
    expect(derived.fulfilled_mean_change_percent).toBeGreaterThan(71);
    expect(derived.parent_peak_rss_change_mib).toBe(40.8);
  });

  it("preserves the pool-broadcast nonclaim and exact baseline backlink", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    const baselineEvidence = JSON.parse(readText(BASELINE_EVIDENCE_PATH));

    expect(evidence.broadcast_interpretation).toMatchObject({
      first_pool_poison_safe_kind_established: true,
      all_five_rejections_independently_timed_out_established: false,
      first_trigger_worker_identified: false,
      first_trigger_input_index_identified: false,
    });
    expect(evidence.baseline_12_workers.evidence).toBe(
      path.basename(BASELINE_EVIDENCE_PATH),
    );
    expect(evidence.baseline_12_workers.fulfilled_elapsed_seconds).toEqual(
      baselineEvidence.outcomes.fulfilled_elapsed_seconds,
    );
    expect(evidence.baseline_12_workers.rejected_elapsed_seconds).toEqual(
      baselineEvidence.outcomes.rejected_elapsed_seconds,
    );
    expect(evidence.baseline_12_workers.parent_peak_rss_mib).toBe(
      baselineEvidence.timing.parent_process_peak_rss_mib,
    );
  });

  it("keeps persistent mutation, residual process, downstream, and privacy counters closed", () => {
    const evidenceText = readText(EVIDENCE_PATH);
    const evidence = JSON.parse(evidenceText);
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const persistentCounters = Object.entries(evidence.persistent_state)
      .filter(([key]) => key.endsWith("_mutation_counter"))
      .map(([, value]) => value);

    expect(persistentCounters).toHaveLength(5);
    expect(persistentCounters.every((value) => value === 0)).toBe(true);
    const downstreamCounters = Object.values(evidence.downstream_counters);
    expect(downstreamCounters).toHaveLength(12);
    expect(downstreamCounters.every((value) => value === 0)).toBe(true);
    expect(evidence.cleanup).toEqual({
      runtime_close: "fulfilled",
      diagnostic_root_residual_processes: 0,
      fixed_worker_bootstrap_residual_processes: 0,
      yaneuraou_residual_processes: 0,
      all_workers_reaped: true,
    });
    expect(evidence.persistent_state).toMatchObject({
      existing_lease_stage_checkpoint_or_quarantine_mutated: false,
      live_weights_mutated: false,
      persistent_state_unchanged: true,
    });
    for (const value of Object.values(evidence.privacy)) {
      expect(value).toBe(false);
    }
    for (const forbidden of [
      "/Users/",
      "/private/tmp/",
      '"parent_sfen"',
      '"played_move"',
      '"game_id"',
      '"parent_id"',
      '"position_id"',
      "sha256:",
    ]) {
      expect(evidenceText).not.toContain(forbidden);
      expect(japanese).not.toContain(forbidden);
      expect(english).not.toContain(forbidden);
    }
  });

  it("keeps the operational decision at STOP without auto-running four workers", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence.operational_decision).toMatchObject({
      state: "STOP",
      adopt_six_worker_production_binding: false,
      run_four_worker_comparison_automatically: false,
      live_weights_remain_unchanged: true,
    });
    expect(evidence.nonclaims).toMatchObject({
      exact_inline_wrapper_reproduced_from_tracked_bytes: false,
      timeout_root_cause_fully_identified: false,
      optimal_worker_count_identified: false,
      teacher_dataset_created: false,
      training_completed: false,
      playing_strength_established: false,
      stable_high_dan_established: false,
    });
  });
});
