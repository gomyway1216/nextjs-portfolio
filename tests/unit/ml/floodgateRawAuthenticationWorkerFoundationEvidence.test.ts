import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-raw-authentication-worker-foundation-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-raw-authentication-worker-foundation.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-raw-authentication-worker-foundation.en.md",
);

function evidence(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(evidencePath, "utf8")) as Record<
    string,
    unknown
  >;
}

function numericField(
  record: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new Error(`expected evidence field ${key} to be numeric`);
  }
  return value;
}

describe("Floodgate raw-authentication worker-foundation evidence", () => {
  it("keeps the measured worker foundation out of production", () => {
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-raw-authentication-worker-foundation-evidence-v1",
      status:
        "non-production-foundation-measured-production-formal-v7-and-live-unchanged",
      scope: {
        production_wiring: false,
        formal_v7_waited_for_this_foundation: false,
        formal_v7_modified: false,
        teacher_modified: false,
        training_modified: false,
        live_weight_changes: 0,
        aws_used: false,
        runtime_network_used: false,
      },
      implementation: {
        default_workers: 4,
        maximum_workers: 12,
        one_active_task_per_worker: true,
        input_ordered_result_merge: true,
        lowest_input_index_failure_wins: true,
        canonical_receipt_byte_equivalence_tested: true,
        task_response_timeout_ms: 60000,
        shutdown_timeout_ms: 5000,
        shutdown_timeout_forces_worker_termination: true,
        protocol_violation_forces_worker_termination: true,
        abnormal_real_worker_tests_passed: true,
        active_workers_after_each_abnormal_test: 0,
        production_entrypoint_imports_worker_pool: false,
        source_dependency_closure_complete: false,
      },
    });
  });

  it("records the real full-pass speed and memory tradeoff", () => {
    const record = evidence();
    expect(record).toMatchObject({
      historical_pre_response_capture_full_raw_pass_measurement: {
        tasks: 36349,
        source_stage:
          "foundation-before-parent-side-response-capture-hardening",
        superseded_by_current_source_remeasurement: true,
        serial: {
          elapsed_ms: 33290,
          maximum_rss_bytes: 606666752,
          reconstruction_status: "pass",
        },
        workers_4: {
          elapsed_ms: 20140,
          maximum_rss_bytes: 727515136,
          reconstruction_status: "pass",
        },
        wall_saved_ms: 13150,
        maximum_rss_increase_bytes: 120848384,
      },
      current_source_worker_component_diagnostic: {
        tasks: 36349,
        serial_production_path_reference_not_directly_comparable: {
          elapsed_ms: 35008.12825,
          maximum_rss_bytes: 679804928,
          reconstruction_status: "pass",
        },
        worker_component_4: {
          elapsed_ms: 11755.669208,
          maximum_rss_bytes: 589725696,
          reconstruction_status: "pass",
        },
        worker_component_8: {
          elapsed_ms: 10634.754459,
          maximum_rss_bytes: 766705664,
          reconstruction_status: "pass",
        },
        worker_component_12: {
          elapsed_ms: 9437.927583,
          maximum_rss_bytes: 866992128,
          reconstruction_status: "pass",
        },
        accepted_as_production_shape_speed_comparison: false,
        all_runs_swaps: 0,
        all_runs_block_input_operations: 0,
        all_runs_block_output_operations: 0,
      },
      current_source_production_shape_emulation: {
        tasks: 36349,
        serial_actual_production_path: {
          elapsed_ms: 35008.12825,
          reconstruction_status: "pass",
        },
        worker_method: {
          candidate_revalidation_included: true,
          worker_verification_included: true,
          test_core_reconstruction_and_deep_equality_included: true,
          two_manifest_serializations_included: true,
          actual_production_wiring_used: false,
        },
        round_orders: [
          [4, 8, 12],
          [12, 8, 4],
        ],
        measurements: [
          {
            workers: 4,
            elapsed_ms: [15765.243083, 15571.458167],
            median_elapsed_ms: 15668.350625,
          },
          {
            workers: 8,
            elapsed_ms: [13860.855167, 13721.354292],
            median_elapsed_ms: 13791.104729499999,
          },
          {
            workers: 12,
            elapsed_ms: [12502.513583, 12333.698125],
            median_elapsed_ms: 12418.105854000001,
          },
        ],
        all_six_runs_reconstructed_receipts: 36349,
        all_six_runs_reconstruction_status: "pass",
      },
      current_source_full_exact_equivalence: {
        tasks: 36349,
        worker_count: 12,
        deep_ordered_result_equivalence: true,
        canonical_receipt_bytes_equivalence: true,
        all_four_receipt_kinds_exercised: true,
        reconstruction_receipts: 36349,
        reconstruction_status: "pass",
      },
    });
    const historical =
      record.historical_pre_response_capture_full_raw_pass_measurement as Record<
        string,
        unknown
      >;
    const historicalSerial = historical.serial as Record<string, unknown>;
    const historicalWorkers = historical.workers_4 as Record<string, unknown>;
    expect(numericField(historical, "wall_speedup")).toBeCloseTo(
      numericField(historicalSerial, "elapsed_ms") /
        numericField(historicalWorkers, "elapsed_ms"),
      12,
    );
    const full = record.current_source_production_shape_emulation as Record<
      string,
      unknown
    >;
    const serial = full.serial_actual_production_path as Record<
      string,
      unknown
    >;
    const measurements = full.measurements as Array<Record<string, unknown>>;
    for (const measurement of measurements) {
      expect(numericField(measurement, "speedup_over_serial")).toBeCloseTo(
        numericField(serial, "elapsed_ms") /
          numericField(measurement, "median_elapsed_ms"),
        12,
      );
    }
  });

  it("preserves every 1/4/8/12 sample and exact equivalence result", () => {
    const record = evidence();
    expect(record).toMatchObject({
      real_mixed_kind_equivalence_check: {
        tasks: 205,
        daily_listings: 90,
        daily_ratings: 90,
        period_end_inventories: 1,
        csa_receipts: 24,
        worker_counts: [1, 4, 8, 12],
        all_results_exactly_equal_to_serial: true,
        all_four_receipt_kinds_exercised: true,
      },
    });
    const benchmark = record.real_4000_receipt_benchmark as Record<
      string,
      unknown
    >;
    const samples = benchmark.raw_elapsed_ms_samples as Array<
      Record<string, unknown>
    >;
    expect(samples.map((entry) => entry.workers)).toEqual([1, 4, 8, 12]);
    for (const entry of samples) {
      expect(entry.elapsed_ms).toHaveLength(3);
    }
    expect(benchmark.medians).toMatchObject([
      { workers: 1, exact_ordered_equivalence: true },
      { workers: 4, exact_ordered_equivalence: true },
      { workers: 8, exact_ordered_equivalence: true },
      { workers: 12, exact_ordered_equivalence: true },
    ]);
    expect(
      benchmark.all_worker_counts_exactly_equal_to_serial_in_input_order,
    ).toBe(true);
    expect(benchmark.eight_to_twelve_wall_improvement_fraction).toBeCloseTo(
      0.09856069956422724,
      12,
    );
    expect(evidence()).toMatchObject({
      post_deadline_hardening_real_4000_receipt_check: {
        tasks: 4000,
        samples_per_worker_count: 1,
        serial_reference_elapsed_ms: 2141.96125,
        measurements: [
          { workers: 1, exact_ordered_equivalence: true },
          { workers: 4, exact_ordered_equivalence: true },
          { workers: 8, exact_ordered_equivalence: true },
          {
            workers: 12,
            elapsed_ms: 793.612584,
            exact_ordered_equivalence: true,
          },
        ],
        all_worker_counts_exactly_equal_to_serial_in_input_order: true,
      },
      independent_review: {
        initial: {
          p0_findings: 0,
          p1_findings: 0,
          p2_findings: 1,
        },
        p2_resolution: {
          status: "implemented-and-focused-tests-passed",
          focused_tests_passed: 17,
          focused_tests_failed: 0,
          active_workers_after_each_abnormal_test: 0,
        },
        re_review: {
          status: "pass",
          p0_findings: 0,
          p1_findings: 0,
          p2_findings: 0,
          focused_tests_passed: 17,
          production_worker_imports: 0,
        },
      },
    });
  });

  it("marks the full-authentication number as a projection", () => {
    const projection = evidence()
      .effect_on_historical_full_authentication as Record<string, unknown>;
    expect(projection).toMatchObject({
      historical_elapsed_ms: 1088743,
      raw_passes: 4,
      projected_saved_ms_if_all_four_passes_match_the_production_shape_twelve_worker_gain: 90360.089584,
      projected_elapsed_ms: 998382.910416,
      projection_not_a_measured_full_authentication: true,
    });
    expect(projection.projected_elapsed_ms).toBe(
      (projection.historical_elapsed_ms as number) -
        (projection.projected_saved_ms_if_all_four_passes_match_the_production_shape_twelve_worker_gain as number),
    );
  });

  it("publishes the same boundaries in Japanese and English without private identifiers", () => {
    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    for (const article of [japanese, english]) {
      expect(article).toContain("33.29");
      expect(article).toContain("20.14");
      expect(article).toContain("606,666,752");
      expect(article).toContain("727,515,136");
      expect(article).toContain("35.008");
      expect(article).toContain("9.438");
      expect(article).toContain("9.96%");
      expect(article).toContain("12.418");
      expect(article).toContain("24,000");
      expect(article).toContain("formal v7");
      expect(article).toContain("live");
      expect(article).toContain("production");
      expect(article).toContain("response capture");
      expect(article).toContain("deadline");
      expect(article).toContain("793.61");
      expect(article).not.toMatch(
        /(?:\/Users\/|\/private\/|[0-9a-f]{64}|parent_sfen)/,
      );
    }
    expect(JSON.stringify(evidence())).not.toMatch(
      /(?:\/Users\/|\/private\/|[0-9a-f]{64}|parent_sfen)/,
    );
  });
});
