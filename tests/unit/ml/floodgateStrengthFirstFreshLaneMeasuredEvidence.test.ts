import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

interface MeasuredTrial {
  readonly ordinal: number;
  readonly parallel_engines: number;
  readonly elapsed_ms: number;
  readonly completed_parents: number;
  readonly forced_parents_skipped: number;
  readonly emitted_parent_groups: number;
  readonly work_records: number;
}

interface MeasuredEvidence {
  readonly schema: string;
  readonly status: string;
  readonly date: string;
  readonly claim_boundary: string;
  readonly trials: readonly MeasuredTrial[];
  readonly comparison: {
    readonly lane_12_elapsed_ms: readonly number[];
    readonly lane_12_median_elapsed_ms: number;
    readonly lane_13_elapsed_ms: readonly number[];
    readonly lane_13_median_elapsed_ms: number;
    readonly abba_pair_1_lane_13_speedup_ppm: number;
    readonly abba_pair_2_lane_13_speedup_ppm: number;
    readonly lane_13_median_speedup_ppm: number;
    readonly minimum_speedup_to_select_lane_13_ppm: number;
    readonly abba_pair_1_favors_lane_13: boolean;
    readonly abba_pair_2_favors_lane_13: boolean;
    readonly median_passed: boolean;
    readonly selected_parallel_engines: number;
  };
  readonly aggregate_completion: {
    readonly target_parent_slots: number;
    readonly completed_parent_slots: number;
    readonly forced_parents_skipped: number;
    readonly emitted_parent_groups: number;
    readonly work_records_including_four_headers: number;
  };
  readonly process_measurement: {
    readonly wall_seconds: number;
    readonly user_seconds: number;
    readonly system_seconds: number;
    readonly process_swaps: number;
  };
  readonly receipt_validation: {
    readonly schema: string;
    readonly status: string;
    readonly current_user_owner_verified: boolean;
    readonly private_file_mode: string;
    readonly regular_file: boolean;
    readonly hard_link_count: number;
    readonly private_payload_fields_emitted: number;
    readonly private_path_published: boolean;
    readonly private_receipt_digest_published: boolean;
    readonly work_fingerprints_published: boolean;
    readonly positions_games_moves_sfen_labels_or_scores_published: boolean;
  };
  readonly safety: {
    readonly shared_policy_writes: number;
    readonly model_writes: number;
    readonly live_weight_changes: number;
    readonly network_requests: number;
    readonly cloud_services: number;
  };
  readonly implementation: {
    readonly benchmark_unit_tests_passed: number;
    readonly measured_evidence_tests_passed: number;
    readonly shared_policy_changed: boolean;
    readonly model_or_live_weight_changed: boolean;
  };
}

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-fresh-lane-multipv6-benchmark-2026-07-20.json",
);
const japaneseArticlePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-fresh-lane-multipv6-benchmark.md",
);
const englishArticlePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-fresh-lane-multipv6-benchmark.en.md",
);

function readEvidence(): MeasuredEvidence {
  return JSON.parse(fs.readFileSync(evidencePath, "utf8")) as MeasuredEvidence;
}

function speedupPpm(elapsed12: number, elapsed13: number): number {
  return Math.round((elapsed12 * 1_000_000) / elapsed13);
}

describe("fresh-lane MultiPV-6 measured evidence", () => {
  it("recomputes the preregistered lane-13 decision from all four trials", () => {
    const evidence = readEvidence();
    expect(evidence.schema).toBe(
      "shogi-floodgate-strength-first-fresh-lane-multipv6-benchmark-measured-evidence-v1",
    );
    expect(evidence.status).toBe("complete-lane-13-selected");
    expect(evidence.date).toBe("2026-07-20");
    expect(evidence.claim_boundary).toBe(
      "local-throughput-only-not-teacher-training-model-selection-or-playing-strength-evidence",
    );
    expect(
      evidence.trials.map(({ ordinal, parallel_engines, elapsed_ms }) => ({
        ordinal,
        parallel_engines,
        elapsed_ms,
      })),
    ).toEqual([
      { ordinal: 1, parallel_engines: 12, elapsed_ms: 35_430 },
      { ordinal: 2, parallel_engines: 13, elapsed_ms: 32_941 },
      { ordinal: 3, parallel_engines: 13, elapsed_ms: 31_332 },
      { ordinal: 4, parallel_engines: 12, elapsed_ms: 31_376 },
    ]);

    const comparison = evidence.comparison;
    expect(comparison.lane_12_elapsed_ms).toEqual([35_430, 31_376]);
    expect(comparison.lane_13_elapsed_ms).toEqual([32_941, 31_332]);
    expect(comparison.lane_12_median_elapsed_ms).toBe(33_403);
    expect(comparison.lane_13_median_elapsed_ms).toBe(32_137);
    expect(comparison.abba_pair_1_lane_13_speedup_ppm).toBe(
      speedupPpm(35_430, 32_941),
    );
    expect(comparison.abba_pair_2_lane_13_speedup_ppm).toBe(
      speedupPpm(31_376, 31_332),
    );
    expect(comparison.lane_13_median_speedup_ppm).toBe(
      speedupPpm(33_403, 32_137),
    );
    expect(comparison).toMatchObject({
      abba_pair_1_favors_lane_13: true,
      abba_pair_2_favors_lane_13: true,
      median_passed: true,
      minimum_speedup_to_select_lane_13_ppm: 1_010_000,
      selected_parallel_engines: 13,
    });
  });

  it("binds complete no-skip execution without publishing private payloads", () => {
    const evidence = readEvidence();
    expect(
      evidence.trials.every(
        (trial) =>
          trial.completed_parents === 42 &&
          trial.forced_parents_skipped === 0 &&
          trial.emitted_parent_groups === 42 &&
          trial.work_records === 43,
      ),
    ).toBe(true);
    expect(evidence.aggregate_completion).toEqual({
      target_parent_slots: 168,
      completed_parent_slots: 168,
      forced_parents_skipped: 0,
      emitted_parent_groups: 168,
      work_records_including_four_headers: 172,
    });
    expect(evidence.process_measurement).toEqual({
      wall_seconds: 140.28,
      user_seconds: 1002.86,
      system_seconds: 30.16,
      process_swaps: 0,
    });
    expect(evidence.receipt_validation).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-fresh-lane-multipv6-benchmark-v1",
      status: "complete-aggregate-only",
      current_user_owner_verified: true,
      private_file_mode: "0600",
      regular_file: true,
      hard_link_count: 1,
      private_payload_fields_emitted: 0,
      private_path_published: false,
      private_receipt_digest_published: false,
      work_fingerprints_published: false,
      positions_games_moves_sfen_labels_or_scores_published: false,
    });
    expect(evidence.safety).toMatchObject({
      shared_policy_writes: 0,
      model_writes: 0,
      live_weight_changes: 0,
      network_requests: 0,
      cloud_services: 0,
    });
    expect(evidence.implementation).toMatchObject({
      benchmark_unit_tests_passed: 11,
      measured_evidence_tests_passed: 2,
      shared_policy_changed: false,
      model_or_live_weight_changed: false,
    });
    for (const articlePath of [japaneseArticlePath, englishArticlePath]) {
      const article = fs.readFileSync(articlePath, "utf8");
      expect(article).toContain("35.430");
      expect(article).toContain("32.941");
      expect(article).toContain("31.332");
      expect(article).toContain("31.376");
      expect(article).not.toContain("/Users/");
      expect(article).not.toMatch(/\b[0-9a-f]{64}\b/iu);
      expect(article).not.toMatch(
        /(?:\/Users\/|\/home\/|\/private\/var\/|[A-Z]:\\Users\\|\.codex\/shogi-(?:runs|data)\/)/iu,
      );
    }
  });
});
