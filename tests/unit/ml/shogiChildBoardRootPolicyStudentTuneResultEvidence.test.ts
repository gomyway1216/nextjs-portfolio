import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const evidencePath =
  "docs/data/shogi-child-board-root-policy-student-tune-result-2026-07-29.json";
const japaneseArticlePath =
  "docs/blog-shogi-child-board-root-policy-student-runtime-v1-plan.md";
const englishArticlePath =
  "docs/blog-shogi-child-board-root-policy-student-runtime-v1-plan.en.md";

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("child-board root-policy student tune result evidence", () => {
  const evidence = JSON.parse(read(evidencePath));

  it("records the complete one-shot workload and immutable result identities", () => {
    expect(evidence.status).toBe("complete-one-shot-tune-fail-lane-closed");
    expect(evidence.workload.parents).toBe(
      evidence.workload.domains.browser_tune.parents +
        evidence.workload.domains.v9_tune.parents,
    );
    expect(evidence.workload).toMatchObject({
      parents: 4607,
      rows: 67870,
    });
    expect(evidence.source_results.tune_result).toMatchObject({
      bytes: 3678,
      sha256:
        "65e93a2bd82bd5ec0cc5cc75ccd53207d6e8e0f7f7628d944ca3e009a5d55399",
    });
    expect(evidence.source_results.pending_result).toMatchObject({
      bytes: 3678,
      sha256: evidence.source_results.tune_result.sha256,
      byte_identical_to_tune_result: true,
    });
    expect(evidence.source_results.score_bundle).toMatchObject({
      bytes: 23409640,
      sha256:
        "2b1f5a4b5f3a1b1dd866022259b6863343d8bcb7d18b8093fb17c764a8cbe299",
    });
  });

  it("recomputes a failure for every artifact in both domains", () => {
    const browser = evidence.preregistered_gates.browser_tune;
    const v9 = evidence.preregistered_gates.v9_tune;

    for (const artifact of Object.values(evidence.artifacts) as Array<{
      pass: boolean;
      browser_tune: {
        pass: boolean;
        top1_correct: number;
        pair_accuracy: number;
        mean_regret_cp: number;
      };
      v9_tune: {
        pass: boolean;
        top1_correct: number;
        top1_accuracy: number;
        pair_accuracy: number;
        mean_regret_cp: number;
      };
    }>) {
      const browserPass =
        artifact.browser_tune.top1_correct >= browser.minimum_top1_correct &&
        artifact.browser_tune.pair_accuracy >= browser.minimum_pair_accuracy &&
        artifact.browser_tune.mean_regret_cp <= browser.maximum_mean_regret_cp;
      const v9Pass =
        artifact.v9_tune.top1_correct >= v9.minimum_top1_correct &&
        artifact.v9_tune.top1_accuracy >= v9.minimum_top1_accuracy &&
        artifact.v9_tune.pair_accuracy >= v9.minimum_pair_accuracy &&
        artifact.v9_tune.mean_regret_cp <= v9.maximum_mean_regret_cp;

      expect(browserPass).toBe(false);
      expect(v9Pass).toBe(false);
      expect(artifact.browser_tune.pass).toBe(false);
      expect(artifact.v9_tune.pass).toBe(false);
      expect(artifact.pass).toBe(false);
    }
  });

  it("separates a verified score bundle from threshold-derivation defects", () => {
    const audit = evidence.independent_recalculation_audit;
    expect(audit.score_rows_recomputed).toBe(67870);
    expect(audit.score_rows_matched).toBe(67870);
    expect(audit.domain_rows.browser_tune + audit.domain_rows.v9_tune).toBe(
      67870,
    );
    expect(audit.checks).toMatchObject({
      source_rows_missing: 0,
      exact_live_cp_mismatches: 0,
      teacher_cp_mismatches: 0,
      membership_differences: 0,
      score_orientation: "pass",
      artifact_sha_binding: "pass",
      student_export: "pass",
      protected_overlap: "pass",
    });
    expect(
      audit.artifact_integrity.frozen_student_runtime_tensor,
    ).toMatchObject({
      bytes: 3510532,
      sha256:
        "bfa44796406cd1e6e0f20a3cce8b3701ab4e43b731afa3285b02269ba3898003",
      source_and_public_copies_byte_identical: true,
    });

    const mismatch = audit.threshold_derivation_mismatch;
    expect(
      mismatch.v9_exact_live_mean_regret_cp.recomputed_current_reference -
        mismatch.v9_exact_live_mean_regret_cp.registered,
    ).toBeCloseTo(mismatch.v9_exact_live_mean_regret_cp.delta, 12);
    expect(
      mismatch.browser_projection_reference.historical_moves_before_projection -
        mismatch.browser_projection_reference.current_moves_after_projection,
    ).toBe(
      mismatch.browser_projection_reference
        .nonpromoting_bishop_rook_moves_removed,
    );
    expect(
      mismatch.browser_projection_reference.gate_effect
        .failure_made_artificially_stricter,
    ).toBe(false);
    expect(mismatch.impact).toMatchObject({
      result_computation_corrupted: false,
      current_lane_rerun_authorized: false,
      current_lane_failure_reversed: false,
    });

    const coverage = audit.fit_tune_population_gap;
    expect(
      coverage.fit_v9_original_candidate_moves +
        coverage.fit_v9_added_seed42_pseudolabel_moves,
    ).toBe(coverage.fit_v9_production_moves);
    expect(coverage.fit_expansion_ratio).toBe(
      coverage.fit_v9_production_moves /
        coverage.fit_v9_original_candidate_moves,
    );
    expect(coverage.tune_v9_added_moves).toBe(0);
  });

  it("keeps downstream authority and live state closed", () => {
    expect(evidence.decision).toMatchObject({
      tune_passed: false,
      deployment_authorized: false,
      stronger_than_live_claimed: false,
      high_dan_claimed: false,
      rerun_authorized: false,
      threshold_change_authorized: false,
      alternate_artifact_authorized: false,
    });
    expect(evidence.downstream).toEqual({
      sealed512_labels_generated: 0,
      sealed512_scores_opened: false,
      parity_1024_formal_invocation_executed: false,
      runtime_admission_executed: false,
      formal_games_completed: 0,
      formal_games_planned: 768,
      external_games_completed: 0,
      external_games_planned: 200,
      live_weights_changed: false,
      live_flags_changed: false,
    });
  });

  it("labels the scratch speed result as non-authoritative and still too slow", () => {
    const speed = evidence.runtime_performance_diagnostic;
    expect(speed.authority).toBe(
      "non-authoritative-prototype-only-formal-latency-not-opened",
    );
    expect(speed.reported_warm_latency_ms).toEqual({
      baseline: 44,
      prototype: 41.27,
    });
    expect(speed.relative_reduction).toBeCloseTo((44 - 41.27) / 44, 15);
    expect(speed.reported_warm_latency_ms.prototype).toBeGreaterThan(
      speed.preregistered_incremental_limits_ms.p95,
    );
    expect(speed.passed).toBe(false);
    expect(speed.formal_latency_result_created).toBe(false);
  });

  it("records the three green regular-merge prerequisites", () => {
    expect(evidence.supporting_delivery_prs).toEqual([
      expect.objectContaining({
        number: 646,
        ci: "success",
        merge_method: "regular-merge",
      }),
      expect.objectContaining({
        number: 647,
        ci: "success",
        merge_method: "regular-merge",
      }),
      expect.objectContaining({
        number: 648,
        ci: "success",
        merge_method: "regular-merge",
      }),
    ]);
  });

  it("publishes matching Japanese and English claim boundaries", () => {
    const japanese = read(japaneseArticlePath);
    const english = read(englishArticlePath);

    for (const article of [japanese, english]) {
      expect(article).toContain("4,607");
      expect(article).toContain("67,870");
      expect(article).toContain(
        "65e93a2bd82bd5ec0cc5cc75ccd53207d6e8e0f7f7628d944ca3e009a5d55399",
      );
      expect(article).toContain("44.00");
      expect(article).toContain("41.27");
      expect(article).toContain("0 / 768");
      expect(article).toContain("0 / 200");
      expect(article).toContain(
        "./data/shogi-child-board-root-policy-student-tune-result-2026-07-29.json",
      );
    }
  });
});
