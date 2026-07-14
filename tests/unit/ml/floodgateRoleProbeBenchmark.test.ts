import { describe, expect, it } from "vitest";

import {
  FLOODGATE_ROLE_PROBE_BENCHMARK_SCHEMA,
  runFloodgateRoleProbeBenchmark,
} from "../../../ml/benchmark-floodgate-role-probe";

describe("Floodgate role-probe benchmark harness", () => {
  it("retains raw samples and requires exact parent parity", () => {
    const report = runFloodgateRoleProbeBenchmark({
      blockedIdCounts: [0, 16],
      samples: 1,
    });

    expect(report.schema).toBe(FLOODGATE_ROLE_PROBE_BENCHMARK_SCHEMA);
    expect(report.samples_per_path).toBe(1);
    expect(report.method.legacy_set_to_array_conversion_timed).toBe(true);
    expect(report.method.removed_sampler_set_clone_emulated).toBe(true);
    expect(report.method.blocked_set_construction_timed).toBe(false);
    expect(report.fixture_game_json_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.measurements).toHaveLength(2);
    for (const measurement of report.measurements) {
      expect(measurement.exact_parent_parity).toBe(true);
      expect(measurement.selected_parents).toBe(24);
      expect(measurement.parent_projection_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(measurement.legacy_ms_samples).toHaveLength(1);
      expect(measurement.sampler_ms_samples).toHaveLength(1);
      expect(measurement.legacy_ms_median).toBeGreaterThan(0);
      expect(measurement.sampler_ms_median).toBeGreaterThan(0);
      expect(measurement.median_speedup).toBeGreaterThan(0);
    }
  });

  it("rejects unsafe benchmark dimensions", () => {
    expect(() =>
      runFloodgateRoleProbeBenchmark({
        blockedIdCounts: [-0],
        samples: 1,
      }),
    ).toThrow(/blocked-ID counts/);
    expect(() =>
      runFloodgateRoleProbeBenchmark({
        blockedIdCounts: [0],
        samples: 0,
      }),
    ).toThrow(/samples/);
  });
});
