import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_ORDER,
  FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS,
  assertFloodgateStrengthFirstFreshLaneAggregateReceiptForTests,
  assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments,
  assertFloodgateStrengthFirstFreshLaneBenchmarkPathsForTests,
  assertFloodgateStrengthFirstFreshLaneBenchmarkRuntimeForTests,
  assertFloodgateStrengthFirstFreshLaneInputPostflightForTests,
  buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests,
  floodgateStrengthFirstFreshLaneBenchmarkPaths,
  runFloodgateStrengthFirstFreshLaneTrialCoreForTests,
  validateFloodgateStrengthFirstFreshLaneSearchPolicyForTests,
  type FloodgateStrengthFirstFreshLaneTrial,
} from "../../../ml/floodgate-strength-first-fresh-lane-benchmark";
import {
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
  type FreshSelectionTeacherSearchPolicy,
} from "../../../ml/floodgate-fresh-selection-teacher-runner";
import type { AuthenticatedFloodgateTrainingRows } from "../../../ml/floodgate-training-row-consumer";

const REPOSITORY = path.resolve(__dirname, "../../..");
const POLICY_FILE = path.join(
  REPOSITORY,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
);
const POLICY_BYTES = fs.readFileSync(POLICY_FILE);
const POLICY = JSON.parse(
  POLICY_BYTES.toString("utf8"),
) as Readonly<FreshSelectionTeacherSearchPolicy>;
const REVISION = "1".repeat(40);
const FINGERPRINT_12 = "a".repeat(64);
const FINGERPRINT_13 = "b".repeat(64);

function trial(
  ordinal: 1 | 2 | 3 | 4,
  elapsedMs: number,
  fingerprint?: string,
): Readonly<FloodgateStrengthFirstFreshLaneTrial> {
  const lane =
    FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_ORDER[ordinal - 1];
  return Object.freeze({
    ordinal,
    parallel_engines: lane,
    elapsed_ms: elapsedMs,
    parents_per_second_ppm: Math.round(
      (FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS *
        1_000_000_000) /
        elapsedMs,
    ),
    target_parents: 42,
    completed_parents: 42,
    forced_parents_skipped: 0,
    emitted_parent_groups: 42,
    work_records: 43,
    current_work_records: 43,
    run_fingerprint:
      fingerprint ?? (lane === 12 ? FINGERPRINT_12 : FINGERPRINT_13),
  });
}

function prefixOutcome(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    status: "local-work-prefix-complete-not-an-authentication-receipt",
    target_parents: 42,
    completed_parents: 42,
    forced_parents_skipped: 0,
    forced_skip_reasons: Object.freeze({
      fewer_than_two_legal_moves: 0,
      search_timeout_no_label: 0,
      proposal_incomplete_no_label: 0,
    }),
    emitted_parent_groups: 42,
    run_fingerprint: FINGERPRINT_12,
    work: Object.freeze({ records: 43 }),
    current_work: Object.freeze({ records: 43 }),
    ...overrides,
  });
}

function fakeInput(): Readonly<AuthenticatedFloodgateTrainingRows> {
  return Object.freeze({}) as Readonly<AuthenticatedFloodgateTrainingRows>;
}

describe("fresh-lane MultiPV 6 benchmark", () => {
  it("selects 13 only when both ABBA pairs and the median reach 1 percent", () => {
    const receipt =
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests([
        trial(1, 1_010),
        trial(2, 1_000),
        trial(3, 1_000),
        trial(4, 1_010),
      ]);

    expect(receipt.comparison).toEqual({
      lane_12_elapsed_ms: [1_010, 1_010],
      lane_12_median_elapsed_ms: 1_010,
      lane_13_elapsed_ms: [1_000, 1_000],
      lane_13_median_elapsed_ms: 1_000,
      abba_pair_1_lane_13_speedup_ppm: 1_010_000,
      abba_pair_2_lane_13_speedup_ppm: 1_010_000,
      lane_13_median_speedup_ppm: 1_010_000,
      abba_pair_favors_lane_13_boundary_ppm: 1_000_000,
      minimum_speedup_to_select_lane_13_ppm: 1_010_000,
      abba_pair_1_favors_lane_13: true,
      abba_pair_2_favors_lane_13: true,
      median_passed: true,
      selected_parallel_engines: 13,
    });
    expect(JSON.stringify(receipt)).not.toContain("run_fingerprint");
  });

  it("selects 13 when both pairs favor it and the median reaches 1 percent", () => {
    const receipt =
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests([
        trial(1, 1_005),
        trial(2, 1_000),
        trial(3, 1_000),
        trial(4, 1_015),
      ]);
    const comparison = receipt.comparison as Readonly<
      Record<string, unknown>
    >;

    expect(comparison.abba_pair_1_lane_13_speedup_ppm).toBe(1_005_000);
    expect(comparison.abba_pair_2_lane_13_speedup_ppm).toBe(1_015_000);
    expect(comparison.abba_pair_1_favors_lane_13).toBe(true);
    expect(comparison.abba_pair_2_favors_lane_13).toBe(true);
    expect(comparison.median_passed).toBe(true);
    expect(comparison.selected_parallel_engines).toBe(13);
  });

  it("retains 12 when one ABBA pair ties despite a passing median", () => {
    const receipt =
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests([
        trial(1, 1_000),
        trial(2, 1_000),
        trial(3, 980),
        trial(4, 1_020),
      ]);
    const comparison = receipt.comparison as Readonly<
      Record<string, unknown>
    >;

    expect(comparison.abba_pair_1_favors_lane_13).toBe(false);
    expect(comparison.abba_pair_2_favors_lane_13).toBe(true);
    expect(comparison.median_passed).toBe(true);
    expect(comparison.selected_parallel_engines).toBe(12);
  });

  it("rejects order, count, and work-identity drift", () => {
    const valid = [
      trial(1, 1_010),
      trial(2, 1_000),
      trial(3, 1_000),
      trial(4, 1_010),
    ] as const;

    expect(() =>
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests([
        valid[1],
        valid[0],
        valid[2],
        valid[3],
      ]),
    ).toThrow(/trial 1/iu);
    expect(() =>
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests(
        valid.slice(0, 3),
      ),
    ).toThrow(/exactly four/iu);
    expect(() =>
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests([
        valid[0],
        valid[1],
        trial(3, 1_000, "c".repeat(64)),
        valid[3],
      ]),
    ).toThrow(/work identity/iu);
    expect(() =>
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests([
        valid[0],
        trial(2, 1_000, FINGERPRINT_12),
        trial(3, 1_000, FINGERPRINT_12),
        valid[3],
      ]),
    ).toThrow(/collided/iu);
  });

  it("rejects private payload fields in aggregate output", () => {
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneAggregateReceiptForTests({
        trials: [{ elapsed_ms: 100, parent_id: "private" }],
      }),
    ).toThrow(/forbidden field parent_id/iu);
  });

  it("cleans the disposable stage before and after a skipped workload", async () => {
    const removeStage = vi.fn(async () => undefined);
    let tick = 0;
    const generate = vi.fn(async () =>
      prefixOutcome({
        forced_parents_skipped: 1,
        emitted_parent_groups: 41,
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 1,
          search_timeout_no_label: 0,
          proposal_incomplete_no_label: 0,
        },
      }),
    );

    await expect(
      runFloodgateStrengthFirstFreshLaneTrialCoreForTests(
        {
          input: fakeInput(),
          revision: REVISION,
          outputRoot: "/private/benchmark",
          assetRoot: "/private/assets",
          policy: POLICY,
          ordinal: 1,
          parallelEngines: 12,
        },
        {
          nowMs: () => {
            tick += 100;
            return tick;
          },
          removeStage,
          generate:
            generate as Parameters<
              typeof runFloodgateStrengthFirstFreshLaneTrialCoreForTests
            >[1]["generate"],
        },
      ),
    ).rejects.toThrow(/exact no-skip 42-position workload/iu);

    expect(removeStage).toHaveBeenCalledTimes(2);
    expect(removeStage.mock.calls[0]).toEqual(removeStage.mock.calls[1]);
  });

  it("cleans the disposable stage after record-count mismatch", async () => {
    const removeStage = vi.fn(async () => undefined);
    let tick = 0;

    await expect(
      runFloodgateStrengthFirstFreshLaneTrialCoreForTests(
        {
          input: fakeInput(),
          revision: REVISION,
          outputRoot: "/private/benchmark",
          assetRoot: "/private/assets",
          policy: POLICY,
          ordinal: 1,
          parallelEngines: 12,
        },
        {
          nowMs: () => {
            tick += 100;
            return tick;
          },
          removeStage,
          generate: async () =>
            prefixOutcome({
              current_work: { records: 42 },
            }) as Awaited<
              ReturnType<
                Parameters<
                  typeof runFloodgateStrengthFirstFreshLaneTrialCoreForTests
                >[1]["generate"]
              >
            >,
        },
      ),
    ).rejects.toThrow(/exact no-skip 42-position workload/iu);

    expect(removeStage).toHaveBeenCalledTimes(2);
  });

  it("pins policy bytes, path, MultiPV 6 semantics, and 13-CPU capacity", () => {
    expect(
      validateFloodgateStrengthFirstFreshLaneSearchPolicyForTests(
        POLICY_FILE,
        REPOSITORY,
        POLICY_BYTES,
        14,
      ),
    ).toEqual(POLICY);

    const changed = Buffer.from(POLICY_BYTES);
    changed[changed.byteLength - 2] =
      changed[changed.byteLength - 2] === 0x20 ? 0x21 : 0x20;
    expect(() =>
      validateFloodgateStrengthFirstFreshLaneSearchPolicyForTests(
        POLICY_FILE,
        REPOSITORY,
        changed,
        14,
      ),
    ).toThrow(/bytes drifted/iu);
    expect(() =>
      validateFloodgateStrengthFirstFreshLaneSearchPolicyForTests(
        path.join(REPOSITORY, "policy.json"),
        REPOSITORY,
        POLICY_BYTES,
        14,
      ),
    ).toThrow(/path drifted/iu);
    expect(() =>
      validateFloodgateStrengthFirstFreshLaneSearchPolicyForTests(
        POLICY_FILE,
        REPOSITORY,
        POLICY_BYTES,
        12,
      ),
    ).toThrow(/exceeds this Mac|available parallelism/iu);
  });

  it("postflight compares public input identity without serializing rows", () => {
    const publicInput = {
      schema: "schema",
      role: "training",
      policy: "policy",
      manifest: { bytes: 1, sha256: "a" },
      source: { bytes: 2, sha256: "b", records: 24_000 },
    };
    const before = {
      ...publicInput,
      rows: Object.freeze([{ parent_id: "private-before" }]),
    } as unknown as Parameters<
      typeof assertFloodgateStrengthFirstFreshLaneInputPostflightForTests
    >[0];
    const samePublicAfter = {
      ...publicInput,
      rows: Object.freeze([{ parent_id: "private-after" }]),
    } as unknown as Parameters<
      typeof assertFloodgateStrengthFirstFreshLaneInputPostflightForTests
    >[1];
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneInputPostflightForTests(
        before,
        samePublicAfter,
      ),
    ).not.toThrow();

    const changedSource = {
      ...samePublicAfter,
      source: { bytes: 2, sha256: "changed", records: 24_000 },
    };
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneInputPostflightForTests(
        before,
        changedSource,
      ),
    ).toThrow(/training input changed/iu);
  });

  it("rejects platform, fixed-root, and CLI-option drift before work", () => {
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneBenchmarkRuntimeForTests({
        platform: "darwin",
        arch: "arm64",
        nodeVersion: "v22.13.0",
        availableParallelism: 13,
        effectiveUserId: 501,
      }),
    ).not.toThrow();
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneBenchmarkRuntimeForTests({
        platform: "darwin",
        arch: "arm64",
        nodeVersion: "v22.13.0",
        availableParallelism: 12,
        effectiveUserId: 501,
      }),
    ).toThrow(/at least 13/iu);

    const paths = floodgateStrengthFirstFreshLaneBenchmarkPaths(
      "/Users/test",
      "/Users/test/source",
    );
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneBenchmarkPathsForTests(paths),
    ).not.toThrow();
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneBenchmarkPathsForTests({
        ...paths,
        outputRoot: "/tmp/drift",
      }),
    ).toThrow(/path drifted/iu);

    expect(() =>
      assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments([]),
    ).not.toThrow();
    expect(() =>
      assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments(["--run"]),
    ).toThrow(/accepts no arguments/iu);
  });
});
