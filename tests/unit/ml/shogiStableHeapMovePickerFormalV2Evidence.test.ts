import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const evidencePath = join(
  root,
  "docs/data/shogi-stable-heap-move-picker-formal-v2-2026-07-25.json",
);
const rawReportPath = join(
  root,
  "docs/data/shogi-stable-heap-move-picker-formal-v2-raw-2026-07-25.json",
);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(quantile * sorted.length) - 1];
}

describe("stable heap move-picker formal v2 evidence", () => {
  it("records the exact formal rejection without claiming playing strength", () => {
    const evidence = JSON.parse(read(evidencePath));

    expect(evidence).toMatchObject({
      schema: "shogi-stable-heap-move-picker-formal-v2-evidence-v1",
      status: "complete-formal-rejected-live-unchanged",
      claim_boundary: {
        fixed_depth_exactness_preserved: true,
        measured_fixed_work_throughput_improved: true,
        formal_gate_passed: false,
        playing_strength_improved: false,
        fixed_time_screen_started: false,
        production_search_changed: false,
        production_evaluator_changed: false,
        live_weights_changed: false,
        high_dan_calibrated: false,
      },
      formal_result: {
        bytes: 184725,
        sha256:
          "6ce667e41bcc0f8464c6fbfae47660de48f2050e868675f260e9c877ae2f1b72",
        gate: "stable-heap-move-picker-formal-holdout-g2",
        status: "fail",
        passed: false,
        production_changed: false,
      },
      pinned_inputs: {
        research_candidate_wasm: {
          path_at_execution:
            "wasm-spike/artifacts/shogi-lazy-move-picker-research.wasm",
          bytes: 36358,
          sha256:
            "49b66b2466c654232a6bccc5e3d7a72d69ec71d46977aa17f8644cc84361d311",
        },
      },
    });
  });

  it("binds immutable inputs and fails closed after production advances", () => {
    const evidence = JSON.parse(read(evidencePath));

    for (const artifact of [
      evidence.checked_in_control_plan,
      evidence.pinned_inputs.live_weights,
      evidence.pinned_inputs.formal_fixture,
      evidence.pinned_inputs.fixture_builder,
      evidence.pinned_inputs.gate_implementation,
    ]) {
      const artifactPath = join(root, artifact.path);
      expect(readFileSync(artifactPath).byteLength).toBe(artifact.bytes);
      expect(sha256(artifactPath)).toBe(artifact.sha256);
    }

    const baseline = evidence.pinned_inputs.baseline_wasm;
    const currentBaselinePath = join(root, baseline.path);
    expect({
      bytes: readFileSync(currentBaselinePath).byteLength,
      sha256: sha256(currentBaselinePath),
    }).not.toEqual({
      bytes: baseline.bytes,
      sha256: baseline.sha256,
    });
    const oldProductionWasm = Buffer.from(
      read(
        join(
          root,
          "docs/data/shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
        ),
      ),
      "base64",
    );
    expect({
      bytes: oldProductionWasm.byteLength,
      sha256: createHash("sha256").update(oldProductionWasm).digest("hex"),
    }).toEqual({
      bytes: baseline.bytes,
      sha256: baseline.sha256,
    });

    expect(evidence.checked_in_control_plan.status_at_execution).toBe(
      "preregistered-not-run",
    );
    expect(evidence.checked_in_control_plan.limitation).toContain(
      "same pull request",
    );
    expect(evidence.checked_in_control_plan.limitation).toContain(
      "not externally time-proven preregistration",
    );
    expect(evidence.pinned_inputs.live_weights.changed).toBe(false);
  });

  it("archives the complete sanitized raw report and its generator identity", () => {
    const evidence = JSON.parse(read(evidencePath));
    const tracked = evidence.formal_result.tracked_raw_report;
    const sanitizer = evidence.formal_result.tracked_raw_report_sanitizer;
    const archive = JSON.parse(read(rawReportPath));

    expect(readFileSync(rawReportPath).byteLength).toBe(tracked.bytes);
    expect(sha256(rawReportPath)).toBe(tracked.sha256);
    expect(readFileSync(join(root, sanitizer.path)).byteLength).toBe(
      sanitizer.bytes,
    );
    expect(sha256(join(root, sanitizer.path))).toBe(sanitizer.sha256);
    expect(archive).toMatchObject({
      archiveSchema: "shogi-stable-heap-formal-report-archive-v1",
      source: {
        basename: "result.json",
        bytes: tracked.source_bytes,
        sha256: tracked.source_sha256,
      },
      sanitization: {
        rewrittenAbsolutePaths: 4,
      },
    });
    expect(tracked.source_bytes).toBe(evidence.formal_result.bytes);
    expect(tracked.source_sha256).toBe(evidence.formal_result.sha256);

    const absolutePaths: string[] = [];
    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(inspect);
      } else if (value !== null && typeof value === "object") {
        Object.values(value).forEach(inspect);
      } else if (
        typeof value === "string" &&
        (value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value))
      ) {
        absolutePaths.push(value);
      }
    };
    inspect(archive.report);
    expect(absolutePaths).toEqual([]);
  });

  it("recomputes exactness, activation, throughput, percentiles, and categories from raw rows", () => {
    const evidence = JSON.parse(read(evidencePath));
    const report = JSON.parse(read(rawReportPath)).report;
    const fixedRows = report.fixedDepth.rows;
    const timingRows = report.throughput.rows;
    const categories = ["opening", "middlegame", "dropHeavy", "checkEvasion"];

    expect(fixedRows).toHaveLength(64);
    expect(timingRows).toHaveLength(64);
    expect(fixedRows.filter((row: { exact: boolean }) => !row.exact)).toEqual(
      [],
    );
    expect(
      fixedRows.reduce(
        (sum: number, row: { candidate: { lazyNodes: number } }) =>
          sum + row.candidate.lazyNodes,
        0,
      ),
    ).toBe(report.fixedDepth.candidateLazyNodes);
    expect(report.fixedDepth).toMatchObject({
      cases: 64,
      mismatches: 0,
      candidateLazyNodes:
        evidence.formal_measurements.exactness.candidate_activations,
    });

    const armWork = (
      rows: Array<{
        blocks: Array<{ arm: string; work: number }>;
      }>,
      arm: string,
    ): number =>
      rows.reduce(
        (sum, row) =>
          sum +
          row.blocks
            .filter((block) => block.arm === arm)
            .reduce((blockSum, block) => blockSum + block.work, 0),
        0,
      );
    const elapsed = (
      rows: Array<{
        baselineElapsedMs: number;
        candidateElapsedMs: number;
      }>,
      arm: "baseline" | "candidate",
    ): number =>
      rows.reduce(
        (sum, row) =>
          sum +
          (arm === "baseline" ? row.baselineElapsedMs : row.candidateElapsedMs),
        0,
      );
    const aggregate = (
      rows: Array<{
        blocks: Array<{ arm: string; work: number }>;
        baselineElapsedMs: number;
        candidateElapsedMs: number;
      }>,
    ) => {
      const baselineNps =
        (armWork(rows, "baseline") * 1000) / elapsed(rows, "baseline");
      const candidateNps =
        (armWork(rows, "candidate") * 1000) / elapsed(rows, "candidate");
      return {
        baselineNps,
        candidateNps,
        deltaPct: (candidateNps / baselineNps - 1) * 100,
      };
    };

    const all = aggregate(timingRows);
    expect(all.baselineNps).toBe(report.throughput.baselineAggregateNps);
    expect(all.candidateNps).toBe(report.throughput.candidateAggregateNps);
    expect(all.deltaPct).toBe(report.throughput.aggregateDeltaPct);
    const computedMedian = median(
      timingRows.map((row: { npsDeltaPct: number }) => row.npsDeltaPct),
    );
    const computedP90 = percentile(
      timingRows.map(
        (row: { wallRegressionPct: number }) => row.wallRegressionPct,
      ),
      0.9,
    );
    expect(computedMedian).toBe(report.throughput.medianDeltaPct);
    expect(computedP90).toBe(report.throughput.p90WallRegressionPct);
    expect(all.deltaPct).toBe(
      evidence.formal_measurements.fixed_work_throughput.aggregate_delta_pct,
    );
    expect(computedMedian).toBe(
      evidence.formal_measurements.fixed_work_throughput
        .median_position_delta_pct,
    );
    expect(computedP90).toBe(
      evidence.formal_measurements.fixed_work_throughput
        .p90_position_wall_regression_pct,
    );

    for (const category of categories) {
      const rows = timingRows.filter(
        (row: { category: string }) => row.category === category,
      );
      const computed = aggregate(rows);
      const activation = rows.reduce(
        (sum: number, row: { candidateLazyNodes: number }) =>
          sum + row.candidateLazyNodes,
        0,
      );

      expect(rows).toHaveLength(16);
      expect(computed).toEqual({
        baselineNps: report.throughput.categories[category].baselineNps,
        candidateNps: report.throughput.categories[category].candidateNps,
        deltaPct: report.throughput.categories[category].deltaPct,
      });
      expect(activation).toBe(report.throughput.activationByCategory[category]);
      expect(report.throughput.categories[category].deltaPct).toBe(
        evidence.formal_measurements.fixed_work_throughput.categories[category]
          .delta_pct,
      );
    }
  });

  it("records exact64 and the two failed central speed gates", () => {
    const evidence = JSON.parse(read(evidencePath));
    const measurements = evidence.formal_measurements;
    const gates = evidence.formal_gates;

    expect(measurements.exactness).toMatchObject({
      cases: 64,
      mismatches: 0,
      candidate_activations: 421752,
    });
    expect(measurements.fixed_work_throughput).toMatchObject({
      aggregate_delta_pct: 6.791549390522578,
      median_position_delta_pct: 2.9145266539335357,
      p90_position_wall_regression_pct: 1.4342180594631104,
      categories: {
        opening: { cases: 16, delta_pct: 0.015047518726296616 },
        middlegame: { cases: 16, delta_pct: 0.8008039691632662 },
        dropHeavy: { cases: 16, delta_pct: 6.149573345278636 },
        checkEvasion: { cases: 16, delta_pct: 8.506097912321753 },
      },
    });

    expect(gates.aggregate_work_nps_delta.passed).toBe(false);
    expect(gates.aggregate_work_nps_delta.observed_pct).toBeLessThan(
      gates.aggregate_work_nps_delta.required_at_least_pct,
    );
    expect(gates.median_position_nps_delta.passed).toBe(false);
    expect(gates.median_position_nps_delta.observed_pct).toBeLessThan(
      gates.median_position_nps_delta.required_at_least_pct,
    );
    expect(gates.p90_position_wall_regression.passed).toBe(true);
    expect(gates.p90_position_wall_regression.observed_pct).toBeLessThanOrEqual(
      gates.p90_position_wall_regression.required_at_most_pct,
    );
    expect(gates.overall).toBe("failed");
  });

  it("keeps every tuning result non-formal, including the relaxed posthoc pass", () => {
    const evidence = JSON.parse(read(evidencePath));
    const tuning = evidence.tuning_history_not_formal_evidence;
    const relaxed = tuning.find((entry: { candidate: string }) =>
      entry.candidate.includes("posthoc confirmation"),
    );

    expect(tuning).toHaveLength(6);
    expect(
      tuning.every(
        (entry: { formal_evidence_eligible: boolean; formal_pass: boolean }) =>
          !entry.formal_evidence_eligible && !entry.formal_pass,
      ),
    ).toBe(true);
    expect(relaxed).toMatchObject({
      legacy_report_status: "pass",
      formal_evidence_eligible: false,
      formal_pass: false,
      posthoc_relaxed_thresholds: {
        aggregate_at_least_pct: 3,
        median_at_least_pct: 2,
        p90_wall_regression_at_most_pct: 5,
        category_regression_at_most_pct: 1,
      },
    });
    expect(relaxed.interpretation).toContain("not a formal pass");
  });

  it("applies the preregistered stop rule and leaves live unchanged", () => {
    const evidence = JSON.parse(read(evidencePath));

    expect(evidence.decision).toMatchObject({
      candidate: "rejected-for-production",
      fixed_time_56_game_screen_authorized: false,
      fixed_time_56_game_screen_started: false,
      production_source_modified: false,
      production_wasm_modified: false,
      embedded_base64_modified: false,
      live_weights_modified: false,
    });
  });

  it("keeps later implementation microbenchmarks outside the formal claim", () => {
    const evidence = JSON.parse(read(evidencePath));
    const micro = evidence.additional_microbenchmarks_not_formal_evidence;

    expect(micro.selection_scan).toMatchObject({
      formal_evidence_eligible: false,
      decision: "rejected-before-formal",
    });
    expect(micro.index_only_heap).toMatchObject({
      tie_heavy_vectors: 1200,
      stable_order_mismatches: 0,
      formal_evidence_eligible: false,
      decision: "rejected-before-formal",
    });
    expect(micro.packed_key_heap).toMatchObject({
      source: {
        path: "wasm-spike/packed-heap-microbench/bench.ts",
        bytes: 9035,
        sha256:
          "152c7e3aa553b8832a58f42e3acb7d2f714e37246b0717d8cfab945fd0603327",
      },
      runner: {
        path: "wasm-spike/packed-heap-microbench/run.mjs",
        bytes: 11685,
        sha256:
          "92135ef246d9c6cc712fb8efc2c18574e539190adb4e05cfde051d6e80b1bcf4",
        assemblyscript_version: "0.28.19",
      },
      result_path: "wasm-spike/packed-heap-microbench/result.json",
      result_bytes: 77565,
      result_sha256:
        "adc5602c49458c29ed3348c8a69a5194a58705dd94e27f6bc95ff9a5c29b4f4a",
      measurement_protocol: {
        minimum_block_ms: 100,
        calibration_target_ms: 150,
        timing_rounds: 3,
        blocks_per_arm_per_condition: 12,
        same_work_and_seed_within_condition: true,
      },
      verification: {
        tie_heavy_vectors: 18000,
        signed_boundary_vectors: 12288,
        stable_order_mismatches_current: 0,
        stable_order_mismatches_packed: 0,
        signed_boundary_mismatches_current: 0,
        signed_boundary_mismatches_packed: 0,
      },
      candidate_threshold_partial8_elapsed_time_reduction_pct_range: [
        0.5138860769161588, 3.5199905513966248,
      ],
      candidate_threshold_partial8_equal_work_throughput_gain_pct_range: [
        0.5165405066615225, 3.6484143933171787,
      ],
      minimum_round_elapsed_time_reduction_pct: 0.05647213819106061,
      checksums_match_and_nontrivial: true,
      formal_evidence_eligible: false,
      playing_strength_evidence: false,
      decision: "low-priority-real-search-tuning-only",
    });

    for (const artifact of [
      micro.packed_key_heap.source,
      micro.packed_key_heap.runner,
      {
        path: micro.packed_key_heap.result_path,
        bytes: micro.packed_key_heap.result_bytes,
        sha256: micro.packed_key_heap.result_sha256,
      },
    ]) {
      expect(readFileSync(join(root, artifact.path)).byteLength).toBe(
        artifact.bytes,
      );
      expect(sha256(join(root, artifact.path))).toBe(artifact.sha256);
    }

    const packed = JSON.parse(
      read(join(root, micro.packed_key_heap.result_path)),
    );
    const normalVectors = packed.verification.reduce(
      (sum: number, entry: { vectors: number }) => sum + entry.vectors,
      0,
    );
    const boundaryVectors = packed.signedBoundaryVerification.reduce(
      (sum: number, entry: { vectors: number }) => sum + entry.vectors,
      0,
    );
    expect(normalVectors).toBe(18000);
    expect(boundaryVectors).toBe(12288);
    expect(
      [...packed.verification, ...packed.signedBoundaryVerification].reduce(
        (sum: number, entry: { failures: number }) => sum + entry.failures,
        0,
      ),
    ).toBe(0);
    expect(packed.checksums).toMatchObject({
      match: true,
      nontrivial: true,
    });
    expect(packed.checksums.current).toBe(packed.checksums.packed);

    const elapsedReductions = packed.results.map(
      (entry: { elapsedTimeReductionPct: number }) =>
        entry.elapsedTimeReductionPct,
    );
    const throughputGains = packed.results.map(
      (entry: { equalWorkThroughputGainPct: number }) =>
        entry.equalWorkThroughputGainPct,
    );
    expect([
      Math.min(...elapsedReductions),
      Math.max(...elapsedReductions),
    ]).toEqual(
      micro.packed_key_heap.all_conditions_elapsed_time_reduction_pct_range,
    );
    expect([
      Math.min(...throughputGains),
      Math.max(...throughputGains),
    ]).toEqual(
      micro.packed_key_heap.all_conditions_equal_work_throughput_gain_pct_range,
    );
    expect(micro.packed_key_heap.next_step).toContain(
      "Do not build a v3 holdout",
    );
  });
});
