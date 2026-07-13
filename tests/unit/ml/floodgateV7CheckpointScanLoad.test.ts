import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import currentEvidence from "../../../ml/protocols/floodgate-v7-valid-24k-scan-load-017692c-result.json";
import historicalEvidence from "../../../ml/protocols/floodgate-v7-valid-24k-scan-load-183e95f-result.json";
import v3Evidence from "../../../ml/protocols/floodgate-v7-valid-24k-scan-load-v3-9bd1cfc-result.json";
import {
  FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA,
  FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS,
  FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_CLAIM_BOUNDARY,
  FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_SCHEMA,
  FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_STATUS,
  buildFloodgateV7ScanLoadSourceUrlCoreForTests,
  parseFloodgateV7CheckpointScanLoadInternalOptionsCoreForTests,
  parseFloodgateV7CheckpointScanLoadOptionsCoreForTests,
  parseFloodgateV7CheckpointV3ScanLoadInternalOptionsCoreForTests,
  parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests,
  runFloodgateV7CheckpointScanLoadHarness,
  runFloodgateV7CheckpointV3ScanLoadHarness,
  summarizeFloodgateV7ScanLoadLengthsCoreForTests,
  validateFloodgateV7ScanLoadMemoryCoreForTests,
  validateFloodgateV7CheckpointV3ScanLoadChildrenCoreForTests,
  verifyFloodgateV7ScanLoadSyncRestorationCoreForTests,
} from "../../../ml/floodgate-v7-checkpoint-scan-load";
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
} from "../../../ml/floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const evidenceRuntimeIt = process.version === "v22.13.0" ? it : it.skip;

function v3ChildResultFixture() {
  const parents = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  const records = parents + 4;
  const headerBytes = 100;
  const entryBytes = 100;
  const entryBytesTotal = parents * entryBytes;
  const milestone100Bytes = 100;
  const milestone500Bytes = 100;
  const sealBytes = 100;
  const workBytes =
    headerBytes +
    entryBytesTotal +
    milestone100Bytes +
    milestone500Bytes +
    sealBytes +
    records;
  const milestone100Mac = "4".repeat(64);
  const milestone500Mac = "5".repeat(64);
  const finalSha256 = "3".repeat(64);
  const build = {
    phase: "fixture-v3-three-gate-build-non-evidence",
    node: "v22.13.0",
    parents,
    games: 1_000,
    candidates_per_parent: 14,
    raw: { bytes: 1_000_000, sha256: "0".repeat(64) },
    gates: [
      {
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
        sealed: false,
        target_parents: 100,
        completed_parents: 100,
        resumed_parents: 0,
        records: 102,
        bytes: 10_000,
        sha256: "1".repeat(64),
        milestone_100_mac: milestone100Mac,
        milestone_500_mac: null,
        producer: {
          calls: 100,
          first_input_index: 0,
          last_input_index: 99,
        },
      },
      {
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
        sealed: false,
        target_parents: 500,
        completed_parents: 500,
        resumed_parents: 100,
        records: 503,
        bytes: 50_000,
        sha256: "2".repeat(64),
        milestone_100_mac: milestone100Mac,
        milestone_500_mac: milestone500Mac,
        producer: {
          calls: 400,
          first_input_index: 100,
          last_input_index: 499,
        },
      },
      {
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
        sealed: true,
        target_parents: parents,
        completed_parents: parents,
        resumed_parents: 500,
        records,
        bytes: workBytes,
        sha256: finalSha256,
        milestone_100_mac: milestone100Mac,
        milestone_500_mac: milestone500Mac,
        producer: {
          calls: parents - 500,
          first_input_index: 500,
          last_input_index: parents - 1,
        },
      },
    ],
    work: {
      bytes: workBytes,
      sha256: finalSha256,
      line_statistics: {
        records,
        header_bytes: headerBytes,
        entries: parents,
        entry_bytes_total: entryBytesTotal,
        entry_bytes_min: entryBytes,
        entry_bytes_max: entryBytes,
        entry_bytes_mean: entryBytes,
        milestones: 2,
        milestone_100_bytes: milestone100Bytes,
        milestone_500_bytes: milestone500Bytes,
        milestone_bytes_total: milestone100Bytes + milestone500Bytes,
        seal_bytes: sealBytes,
        maximum_line_bytes: entryBytes,
      },
    },
    sync: {
      suppressed_regular_file_syncs: parents + 6,
      expected_suppressed_regular_file_syncs: parents + 6,
      line_syncs: parents + 4,
      expected_line_syncs: parents + 4,
      pre_resume_syncs: 2,
      expected_pre_resume_syncs: 2,
      native_method_restored_before_batch_sync: true,
      one_work_batch_sync_completed: true,
      one_stage_directory_batch_sync_completed: true,
    },
    timing: {
      generation_wall_ms: 1,
      fixture_wall_ms: 2,
      durable_prefix_100_wall_ms: 3,
      durable_prefix_500_wall_ms: 4,
      sealed_final_24000_wall_ms: 5,
      batch_sync_and_measure_wall_ms: 6,
    },
    memory: {
      baseline_rss_bytes: 100,
      final_rss_bytes: 200,
      resource_max_rss_bytes: 300,
    },
  };
  const expectedReadCalls = Math.ceil(workBytes / (64 * 1024));
  const scan = {
    phase: "native-v3-sealed-final-retry-evidence",
    node: "v22.13.0",
    parents,
    gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
    status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
    sealed: true,
    producer_calls: 0,
    completed_parents: parents,
    resumed_parents: parents,
    work: {
      records,
      target_parents: parents,
      training_parents: parents,
      milestone_100_mac: milestone100Mac,
      milestone_500_mac: milestone500Mac,
      bytes: workBytes,
      receipt_sha256: finalSha256,
      independent_sha256: finalSha256,
      sha256_match: true,
    },
    reads: {
      calls: {
        "resumable-prefix": expectedReadCalls,
        "sealed-final": expectedReadCalls,
      },
      bytes: {
        "resumable-prefix": workBytes,
        "sealed-final": workBytes,
      },
      maximum_request_bytes: {
        "resumable-prefix": 64 * 1024,
        "sealed-final": 64 * 1024,
      },
      first_ms: { "resumable-prefix": 1, "sealed-final": 2 },
    },
    timing: {
      total_checkpoint_wall_ms: 10,
      resumable_prefix_start_to_final_scan_start_wall_ms: 4,
      sealed_final_scan_start_to_receipt_wall_ms: 5,
      independent_sha256_wall_ms: 6,
    },
    memory: {
      baseline_rss_bytes: 100,
      final_rss_bytes: 200,
      resource_max_rss_bytes: 300,
      sampled_peak_rss_bytes: 250,
    },
  };
  return { build, scan };
}

describe("Floodgate v7 semantic checkpoint scanner load harness", () => {
  it("summarizes argument-limit-scale line sets in one pass", () => {
    const values = Array.from(
      { length: 200_000 },
      (_, index) => (index % 17) + 1,
    );
    const expectedTotal = values.reduce((total, value) => total + value, 0);
    expect(summarizeFloodgateV7ScanLoadLengthsCoreForTests(values)).toEqual({
      total: expectedTotal,
      minimum: 1,
      maximum: 17,
    });
    expect(() => summarizeFloodgateV7ScanLoadLengthsCoreForTests([])).toThrow(
      /non-empty/,
    );
  });

  evidenceRuntimeIt(
    "revalidates 100 unique legal 14-candidate parents in isolated native-sync children",
    async () => {
      const result = await runFloodgateV7CheckpointScanLoadHarness({
        parents: 100,
      });

      expect(result).toMatchObject({
        schema: FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA,
        status: FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS,
        checkpoint_identity: {
          schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
          status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
          claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
          algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
          run_binding: {
            schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
            producer_control: {
              schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
              parent_deadline_ms: 30 * 60 * 1_000,
              abort_drain_ms: 30_000,
              max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
              cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
              late_settlement_policy:
                FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
            },
          },
          teacher_usi_runtime: {
            contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
            status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
            claim_boundary:
              FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
          },
        },
        data: {
          public_dataset_paths_accepted: false,
          network_reads: false,
          parents: 100,
          unique_parent_ids: true,
          unique_position_ids: true,
          candidates_per_parent: 14,
        },
        fixture_build: {
          classification: "non-evidence-build-receipt-discarded",
          sync: {
            suppressed_per_line_regular_file_syncs: 102,
            expected_suppressed_syncs: 102,
            native_method_restored_before_batch_sync: true,
            one_work_batch_sync_completed: true,
            one_stage_directory_batch_sync_completed: true,
          },
        },
        native_scan: {
          producer_calls: 0,
          completed_parents: 100,
          resumed_parents: 100,
          work: { sha256_match: true },
        },
      });
      expect(result.valid_stream.actual_bytes).toBeGreaterThan(0);
      expect(result.valid_stream.actual_bytes).toBeLessThan(
        FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
      );
      expect(result.valid_stream.line_statistics).toMatchObject({
        records: 102,
        entries: 100,
      });
      expect(
        result.valid_stream.line_statistics.maximum_line_bytes,
      ).toBeLessThanOrEqual(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES);
      expect(result.bounds).toEqual({
        theoretical_rejection_cap_bytes:
          FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
        theoretical_rejection_cap_classification:
          "conservative-cap-not-valid-stream-size",
        maximum_line_bytes: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
        maximum_parents: 24_000,
      });
      expect(result.valid_stream.actual_is_not_theoretical_cap).toBe(true);
      expect(result.native_scan.work.receipt_sha256).toBe(
        result.native_scan.work.independent_sha256,
      );
      for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
        expect(result.native_scan.reads.bytes[purpose]).toBe(
          result.valid_stream.actual_bytes,
        );
        expect(
          result.native_scan.reads.maximum_request_bytes[purpose],
        ).toBeLessThanOrEqual(64 * 1024);
      }
      expect(result).not.toHaveProperty("preserved_fixture_root");
    },
    30_000,
  );

  evidenceRuntimeIt(
    "rejects counts outside the exact 24,000-parent bound before spawning",
    async () => {
      await expect(
        runFloodgateV7CheckpointScanLoadHarness({ parents: 0 }),
      ).rejects.toThrow(/1 through 24000/);
      await expect(
        runFloodgateV7CheckpointScanLoadHarness({ parents: 24_001 }),
      ).rejects.toThrow(/1 through 24000/);
    },
  );

  evidenceRuntimeIt(
    "cleans setup failures and restores native sync after action rejection",
    async () => {
      await expect(
        verifyFloodgateV7ScanLoadSyncRestorationCoreForTests(),
      ).resolves.toBeUndefined();
      await expect(
        verifyFloodgateV7ScanLoadSyncRestorationCoreForTests(true),
      ).resolves.toBeUndefined();
    },
  );

  it("accepts final RSS sampled after sampler stop without weakening peak bounds", () => {
    expect(() =>
      validateFloodgateV7ScanLoadMemoryCoreForTests({
        baseline_rss_bytes: 100,
        final_rss_bytes: 300,
        resource_max_rss_bytes: 400,
        sampled_peak_rss_bytes: 200,
      }),
    ).not.toThrow();
    expect(() =>
      validateFloodgateV7ScanLoadMemoryCoreForTests({
        baseline_rss_bytes: 100,
        final_rss_bytes: 300,
        resource_max_rss_bytes: 400,
        sampled_peak_rss_bytes: 99,
      }),
    ).toThrow(/sampled RSS peak/);
    expect(() =>
      validateFloodgateV7ScanLoadMemoryCoreForTests({
        baseline_rss_bytes: 100,
        final_rss_bytes: 200,
        resource_max_rss_bytes: 250,
        sampled_peak_rss_bytes: 300,
      }),
    ).toThrow(/sampled RSS peak/);
  });

  it("accepts only canonical, nonduplicated public CLI options", () => {
    expect(
      parseFloodgateV7CheckpointScanLoadOptionsCoreForTests([
        "--parents",
        "24000",
      ]),
    ).toEqual({ parents: 24_000, keepFixture: false });
    for (const value of ["0", "024000", "2.4e4", "0x5dc0", "24000 "]) {
      expect(() =>
        parseFloodgateV7CheckpointScanLoadOptionsCoreForTests([
          "--parents",
          value,
        ]),
      ).toThrow();
    }
    expect(() =>
      parseFloodgateV7CheckpointScanLoadOptionsCoreForTests([
        "--parents",
        "100",
        "--parents",
        "100",
      ]),
    ).toThrow(/duplicated/);
    expect(() =>
      parseFloodgateV7CheckpointScanLoadOptionsCoreForTests([
        "--parents",
        "100",
        "--unknown",
      ]),
    ).toThrow(/unknown/);
    expect(() =>
      parseFloodgateV7CheckpointScanLoadOptionsCoreForTests([
        "--parents",
        "100",
        "--keep-fixture",
        "--keep-fixture",
      ]),
    ).toThrow(/duplicated/);
    expect(
      parseFloodgateV7CheckpointScanLoadInternalOptionsCoreForTests([
        "--internal-phase",
        "scan",
      ]),
    ).toEqual({ phase: "scan" });
    expect(() =>
      parseFloodgateV7CheckpointScanLoadInternalOptionsCoreForTests([
        "--internal-phase",
        "scan",
        "--root",
        "/tmp/forbidden",
      ]),
    ).toThrow(/not exact/);
  });

  it("keeps V3 behind an explicit fixed-24k CLI and separate hidden phases", () => {
    expect(
      parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests([
        "--v3-gates",
        "--parents",
        "24000",
      ]),
    ).toEqual({ parents: 24_000, keepFixture: false });
    expect(
      parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests([
        "--v3-gates",
        "--parents",
        "24000",
        "--keep-fixture",
      ]),
    ).toEqual({ parents: 24_000, keepFixture: true });
    for (const value of ["100", "024000", "24001", "2.4e4"]) {
      expect(() =>
        parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests([
          "--v3-gates",
          "--parents",
          value,
        ]),
      ).toThrow(/24000/);
    }
    expect(() =>
      parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests([
        "--parents",
        "24000",
        "--v3-gates",
      ]),
    ).toThrow(/first/);
    expect(() =>
      parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests(["--v3-gates"]),
    ).toThrow(/required/);
    expect(() =>
      parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests([
        "--v3-gates",
        "--v3-gates",
        "--parents",
        "24000",
      ]),
    ).toThrow(/duplicated/);
    expect(() =>
      parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests([
        "--v3-gates",
        "--parents",
        "24000",
        "--unknown",
      ]),
    ).toThrow(/unknown/);
    expect(
      parseFloodgateV7CheckpointV3ScanLoadInternalOptionsCoreForTests([
        "--internal-v3-phase",
        "build",
      ]),
    ).toEqual({ phase: "build" });
    expect(
      parseFloodgateV7CheckpointV3ScanLoadInternalOptionsCoreForTests([
        "--internal-v3-phase",
        "scan",
      ]),
    ).toEqual({ phase: "scan" });
    expect(() =>
      parseFloodgateV7CheckpointV3ScanLoadInternalOptionsCoreForTests([
        "--internal-v3-phase",
        "scan",
        "--root",
        "/tmp/forbidden",
      ]),
    ).toThrow(/not exact/);
    expect(() =>
      parseFloodgateV7CheckpointScanLoadOptionsCoreForTests([
        "--v3-gates",
        "--parents",
        "24000",
      ]),
    ).toThrow(/unknown/);
  });

  it("requires an explicit 24k V3 API request before creating children", async () => {
    const uncheckedHarness =
      runFloodgateV7CheckpointV3ScanLoadHarness as unknown as (
        options?: Readonly<{ parents?: number }>,
      ) => Promise<unknown>;
    await expect(uncheckedHarness()).rejects.toThrow(/exactly 24000/);
    await expect(uncheckedHarness({ parents: 100 })).rejects.toThrow(
      /exactly 24000/,
    );
  });

  it("validates the V3 gate, milestone, line, sync, timing, and scan schema cheaply", () => {
    expect(FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_SCHEMA).toBe(
      "shogi-floodgate-v7-checkpoint-semantic-scan-load-v3",
    );
    expect(FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_STATUS).toContain(
      "fixed-gates",
    );
    expect(FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_CLAIM_BOUNDARY).toContain(
      "100-500-24000",
    );
    expect(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA).toBe(
      "shogi-floodgate-v7-teacher-work-v3",
    );
    expect(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM).toContain(
      "milestone-chain-v3",
    );
    expect(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY).toContain(
      "fixed-100-500-24000-gates",
    );
    expect(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES).toBe(
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS *
        (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1) +
        4 * (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1),
    );

    const valid = v3ChildResultFixture();
    expect(() =>
      validateFloodgateV7CheckpointV3ScanLoadChildrenCoreForTests(
        valid.build,
        valid.scan,
      ),
    ).not.toThrow();

    const invalidRecords = v3ChildResultFixture();
    invalidRecords.build.work.line_statistics.records = 24_002;
    expect(() =>
      validateFloodgateV7CheckpointV3ScanLoadChildrenCoreForTests(
        invalidRecords.build,
        invalidRecords.scan,
      ),
    ).toThrow(/records/);

    const invalidSync = v3ChildResultFixture();
    invalidSync.build.sync.line_syncs = 24_003;
    expect(() =>
      validateFloodgateV7CheckpointV3ScanLoadChildrenCoreForTests(
        invalidSync.build,
        invalidSync.scan,
      ),
    ).toThrow(/line_syncs/);

    const invalidProducerRange = v3ChildResultFixture();
    invalidProducerRange.build.gates[1].producer.first_input_index = 99;
    expect(() =>
      validateFloodgateV7CheckpointV3ScanLoadChildrenCoreForTests(
        invalidProducerRange.build,
        invalidProducerRange.scan,
      ),
    ).toThrow(/first_input_index/);

    const invalidMilestone = v3ChildResultFixture();
    invalidMilestone.scan.work.milestone_500_mac = "6".repeat(64);
    expect(() =>
      validateFloodgateV7CheckpointV3ScanLoadChildrenCoreForTests(
        invalidMilestone.build,
        invalidMilestone.scan,
      ),
    ).toThrow(/identities/);
  });

  it("encodes synthetic game counters as valid HHMMSS timestamps", () => {
    const cases = [
      [0, "000000"],
      [59, "000059"],
      [60, "000100"],
      [3_599, "005959"],
      [3_600, "010000"],
      [86_399, "235959"],
    ] as const;
    for (const [game, timestamp] of cases) {
      const url = buildFloodgateV7ScanLoadSourceUrlCoreForTests(game);
      expect(url).toContain(`20260101${timestamp}.csa`);
      expect(() => floodgateCanonicalUrlGameId(url)).not.toThrow();
    }
    expect(() => buildFloodgateV7ScanLoadSourceUrlCoreForTests(86_400)).toThrow(
      /one UTC day/,
    );
  });

  it("pins the historical v1 24,000-parent evidence without treating it as current v2 evidence", async () => {
    const bytes = await fs.promises.readFile(
      path.join(
        process.cwd(),
        "ml/protocols/floodgate-v7-valid-24k-scan-load-183e95f-result.json",
      ),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "bc8d54822c7d95fd9fe3b5f664427f5402a5a0d1839b51549b465449aa4b6209",
    );
    expect(historicalEvidence).toMatchObject({
      status: "complete-accepted-synthetic-24k-test-only-scan-load-evidence",
      attempts: [
        { attempt: 1, accepted_evidence: false },
        { attempt: 2, accepted_evidence: false },
        { attempt: 3, accepted_evidence: true, current_evidence: false },
        { attempt: 4, accepted_evidence: false, current_evidence: false },
        {
          attempt: 5,
          accepted_evidence: true,
          current_evidence: true,
          source_commit: "183e95f409347c37feee72b0509af17317891a36",
          harness_sha256:
            "d0f8b2f21b26c523949b4026171c35b7158c2509a54d5a81edba56006623d20f",
          exit_code: 0,
          new_temp_roots_after_exit: 0,
        },
      ],
      acceptance: {
        all_required_checks_passed: true,
        derived_candidate_instances: 336_000,
        production_entry_point_claimed: false,
        playing_strength_claimed: false,
        live_weight_changed: false,
      },
    });
    expect(historicalEvidence.result.schema).toBe(
      "shogi-floodgate-v7-checkpoint-semantic-scan-load-v1",
    );
    expect(String(historicalEvidence.result.schema)).not.toBe(
      FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA,
    );
    const stream = historicalEvidence.result.valid_stream;
    const lines = stream.line_statistics;
    expect(lines.records).toBe(24_002);
    expect(lines.entries).toBe(24_000);
    expect(
      lines.header_bytes +
        lines.entry_bytes_total +
        lines.seal_bytes +
        lines.records,
    ).toBe(stream.actual_bytes);
    expect(Math.round(lines.entry_bytes_total / lines.entries)).toBe(
      lines.entry_bytes_mean,
    );
    expect(stream.actual_sha256).toBe(
      historicalEvidence.result.native_scan.work.receipt_sha256,
    );
    expect(stream.actual_sha256).toBe(
      historicalEvidence.result.native_scan.work.independent_sha256,
    );
    for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
      expect(historicalEvidence.result.native_scan.reads.bytes[purpose]).toBe(
        stream.actual_bytes,
      );
      expect(historicalEvidence.result.native_scan.reads.calls[purpose]).toBe(
        Math.ceil(stream.actual_bytes / (64 * 1024)),
      );
      expect(
        historicalEvidence.result.native_scan.reads.maximum_request_bytes[
          purpose
        ],
      ).toBe(64 * 1024);
    }
  });

  it("pins Attempt 6 as the only current v2 24,000-parent evidence", async () => {
    const evidencePath = path.join(
      process.cwd(),
      "ml/protocols/floodgate-v7-valid-24k-scan-load-017692c-result.json",
    );
    const bytes = await fs.promises.readFile(evidencePath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "e33b1ec4766decd0bc4aeee12346a53415d50dd1028c77a7cae8ecb48e6fb3f7",
    );

    expect(currentEvidence).toMatchObject({
      schema: "shogi-floodgate-v7-checkpoint-semantic-scan-load-evidence-v2",
      status: "complete-accepted-synthetic-24k-v2-test-only-scan-load-evidence",
      supersedes: {
        path: "ml/protocols/floodgate-v7-valid-24k-scan-load-183e95f-result.json",
        sha256:
          "bc8d54822c7d95fd9fe3b5f664427f5402a5a0d1839b51549b465449aa4b6209",
      },
      attempts: [
        { attempt: 1, current_evidence: false },
        { attempt: 2, current_evidence: false },
        { attempt: 3, current_evidence: false },
        { attempt: 4, current_evidence: false },
        {
          attempt: 5,
          current_evidence: false,
          historical_schema:
            "shogi-floodgate-v7-checkpoint-semantic-scan-load-v1",
          superseded_by_attempt: 6,
        },
        {
          attempt: 6,
          accepted_evidence: true,
          current_evidence: true,
          source_commit: "017692c7a076babbd40e7be0b14ea27d9988fa6c",
          harness_sha256:
            "23578cbf11deafb49cd288f38d9f3ec081e76d0f41a5b2948b3ccf08fabfb9a2",
          checkpoint_schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
          exit_code: 0,
          wrapper_exit_code: 0,
          external_wall_seconds: 435.6,
          external_user_seconds: 442.23,
          external_system_seconds: 5.74,
          external_maximum_resident_set_bytes: 483_491_840,
          started_at_utc: "2026-07-13T11:51:53Z",
          finished_at_utc: "2026-07-13T11:59:09Z",
          complete_result_json: true,
          worktree_clean_before_run: true,
          worktree_clean_after_run: true,
          temporary_fixture_roots_before_run: 0,
          temporary_fixture_roots_after_run: 0,
          new_temp_roots_after_exit: 0,
        },
      ],
      acceptance: {
        all_required_checks_passed: true,
        derived_candidate_instances: 336_000,
        stream_receipt_independent_sha256_match: true,
        source_commit_unchanged_after_run: true,
        harness_sha256_unchanged_after_run: true,
        temporary_fixture_cleanup_observed: true,
        v1_checkpoint_resumed_or_resigned_as_v2: false,
        production_entry_point_claimed: false,
        official_teacher_runtime_receipt_claimed: false,
        playing_strength_claimed: false,
        live_weight_changed: false,
      },
    });
    expect(
      currentEvidence.attempts.filter((attempt) => attempt.current_evidence),
    ).toHaveLength(1);

    const result = currentEvidence.result;
    expect(result).toMatchObject({
      schema: FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA,
      status: FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS,
      checkpoint_identity: {
        schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
        claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
        algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
        run_binding: {
          schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
          producer_control: {
            schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
            parent_deadline_ms: 30 * 60 * 1_000,
            abort_drain_ms: 30_000,
            max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
            cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
            late_settlement_policy:
              FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
          },
        },
        teacher_usi_runtime: {
          contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
          status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
          claim_boundary:
            FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
        },
      },
      data: {
        parents: 24_000,
        candidates_per_parent: 14,
        public_dataset_paths_accepted: false,
        network_reads: false,
      },
      native_scan: {
        producer_calls: 0,
        completed_parents: 24_000,
        resumed_parents: 24_000,
        work: { sha256_match: true },
      },
    });

    const stream = result.valid_stream;
    const lines = stream.line_statistics;
    expect(lines.records).toBe(lines.entries + 2);
    expect(
      lines.header_bytes +
        lines.entry_bytes_total +
        lines.seal_bytes +
        lines.records,
    ).toBe(stream.actual_bytes);
    expect(Math.round(lines.entry_bytes_total / lines.entries)).toBe(
      lines.entry_bytes_mean,
    );
    expect(lines.entry_bytes_total).toBeGreaterThanOrEqual(
      lines.entry_bytes_min * lines.entries,
    );
    expect(lines.entry_bytes_total).toBeLessThanOrEqual(
      lines.entry_bytes_max * lines.entries,
    );
    expect(lines.maximum_line_bytes).toBe(
      Math.max(lines.header_bytes, lines.entry_bytes_max, lines.seal_bytes),
    );
    expect(stream.actual_sha256).toBe(result.native_scan.work.receipt_sha256);
    expect(stream.actual_sha256).toBe(
      result.native_scan.work.independent_sha256,
    );
    for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
      expect(result.native_scan.reads.bytes[purpose]).toBe(stream.actual_bytes);
      expect(result.native_scan.reads.calls[purpose]).toBe(
        Math.ceil(stream.actual_bytes / (64 * 1024)),
      );
      expect(result.native_scan.reads.maximum_request_bytes[purpose]).toBe(
        64 * 1024,
      );
    }
    expect(
      Math.round(
        result.native_scan.reads.first_ms["sealed-final"] -
          result.native_scan.reads.first_ms["resumable-prefix"],
      ),
    ).toBe(
      result.native_scan.timing
        .resumable_prefix_start_to_final_scan_start_wall_ms,
    );
    expect(
      currentEvidence.attempts[5].external_maximum_resident_set_bytes,
    ).toBeGreaterThanOrEqual(result.native_scan.memory.resource_max_rss_bytes);
  });

  it("pins and independently recomputes the accepted V3 fixed-gate evidence", async () => {
    const evidencePath = path.join(
      process.cwd(),
      "ml/protocols/floodgate-v7-valid-24k-scan-load-v3-9bd1cfc-result.json",
    );
    const bytes = await fs.promises.readFile(evidencePath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "d8e038577a80bd00588bf4316ce05879ca110cc8c1499fc9959a1e7152e6fe7c",
    );
    expect(Object.keys(v3Evidence).sort()).toEqual(
      [
        "acceptance",
        "attempts",
        "claim_boundary",
        "comparison_baseline",
        "invocation",
        "machine",
        "result",
        "schema",
        "status",
      ].sort(),
    );
    expect(Object.hasOwn(v3Evidence, "supersedes")).toBe(false);
    expect(v3Evidence).toMatchObject({
      schema: "shogi-floodgate-v7-checkpoint-semantic-scan-load-evidence-v3",
      status:
        "complete-accepted-synthetic-24k-v3-fixed-gates-test-only-scan-load-evidence",
      comparison_baseline: {
        path: "ml/protocols/floodgate-v7-valid-24k-scan-load-017692c-result.json",
        bytes: 13_359,
        sha256:
          "e33b1ec4766decd0bc4aeee12346a53415d50dd1028c77a7cae8ecb48e6fb3f7",
        schema: currentEvidence.schema,
        relationship: "immutable-comparison-only-not-superseded",
      },
      attempts: [
        {
          attempt: 1,
          source_commit: "9bd1cfc1490c2c19f24e0ff20622aadddc8ed3f8",
          implementation_commit: "b2d1d8ce799968f711f1122ca21b8616c5d24c86",
          accepted_evidence: true,
          current_evidence: true,
          exit_code: 0,
          timed_command_exit_code: 0,
          external_wall_seconds: 474.99,
          external_user_seconds: 480.44,
          external_system_seconds: 7.3,
          external_maximum_resident_set_bytes: 583_827_456,
          complete_result_json: true,
          worktree_clean_before_run: true,
          worktree_clean_after_run: true,
          scan_load_roots_observed_during_run: 1,
          scan_load_roots_after_run: 0,
          new_temp_roots_after_exit: 0,
        },
      ],
      acceptance: {
        all_required_checks_passed: true,
        derived_candidate_instances: 336_000,
        prefix_build_summary_claimed_as_durability_evidence: false,
        v2_evidence_superseded_by_v3: false,
        production_entry_point_claimed: false,
        production_key_claimed: false,
        teacher_label_claimed: false,
        playing_strength_claimed: false,
        live_weight_changed: false,
      },
    });
    expect(
      v3Evidence.attempts.filter((attempt) => attempt.current_evidence),
    ).toHaveLength(1);

    const baselinePath = path.join(
      process.cwd(),
      v3Evidence.comparison_baseline.path,
    );
    const baselineBytes = await fs.promises.readFile(baselinePath);
    expect(baselineBytes.byteLength).toBe(v3Evidence.comparison_baseline.bytes);
    expect(createHash("sha256").update(baselineBytes).digest("hex")).toBe(
      v3Evidence.comparison_baseline.sha256,
    );

    const result = v3Evidence.result;
    expect(result).toMatchObject({
      schema: FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_SCHEMA,
      status: FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_STATUS,
      claim_boundary: FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_CLAIM_BOUNDARY,
      checkpoint_identity: {
        schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
        prefix_status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
        claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
        algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
      },
      data: {
        parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        candidates_per_parent: 14,
        public_dataset_paths_accepted: false,
        network_reads: false,
      },
      native_scan: {
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
        sealed: true,
        producer_calls: 0,
        completed_parents: 24_000,
        resumed_parents: 24_000,
        work_unchanged_since_build: true,
      },
    });
    expect(result.data.parents * result.data.candidates_per_parent).toBe(
      v3Evidence.acceptance.derived_candidate_instances,
    );

    const gate100 = result.fixture_build.gate_progress["durable-prefix-100"];
    const gate500 = result.fixture_build.gate_progress["durable-prefix-500"];
    const finalGate = result.fixture_build.gate_progress["sealed-final-24000"];
    const gates = [gate100, gate500, finalGate] as const;
    const expected = [
      [100, 100, 0, 102, 100, 0, 99],
      [500, 500, 100, 503, 400, 100, 499],
      [24_000, 24_000, 500, 24_004, 23_500, 500, 23_999],
    ] as const;
    for (let index = 0; index < gates.length; index += 1) {
      const gate = gates[index];
      const [target, completed, resumed, records, calls, first, last] =
        expected[index];
      expect([
        gate.target_parents,
        gate.completed_parents,
        gate.resumed_parents,
        gate.records,
        gate.producer.calls,
        gate.producer.first_input_index,
        gate.producer.last_input_index,
      ]).toEqual([target, completed, resumed, records, calls, first, last]);
    }
    expect(gates.reduce((sum, gate) => sum + gate.producer.calls, 0)).toBe(
      24_000,
    );
    expect(gate100.bytes).toBeLessThan(gate500.bytes);
    expect(gate500.bytes).toBeLessThan(finalGate.bytes);
    expect(gate100.milestone_100_mac).toBe(gate500.milestone_100_mac);
    expect(gate100.milestone_100_mac).toBe(finalGate.milestone_100_mac);
    expect(gate100.milestone_500_mac).toBeNull();
    expect(gate500.milestone_500_mac).toBe(finalGate.milestone_500_mac);

    const stream = result.valid_stream;
    const lines = stream.line_statistics;
    expect(lines.records).toBe(lines.entries + lines.milestones + 2);
    expect(lines.milestone_bytes_total).toBe(
      lines.milestone_100_bytes + lines.milestone_500_bytes,
    );
    expect(
      lines.header_bytes +
        lines.entry_bytes_total +
        lines.milestone_bytes_total +
        lines.seal_bytes +
        lines.records,
    ).toBe(stream.actual_bytes);
    expect(Math.round(lines.entry_bytes_total / lines.entries)).toBe(
      lines.entry_bytes_mean,
    );
    expect(lines.entry_bytes_total).toBeGreaterThanOrEqual(
      lines.entry_bytes_min * lines.entries,
    );
    expect(lines.entry_bytes_total).toBeLessThanOrEqual(
      lines.entry_bytes_max * lines.entries,
    );
    expect(lines.maximum_line_bytes).toBe(
      Math.max(
        lines.header_bytes,
        lines.entry_bytes_max,
        lines.milestone_100_bytes,
        lines.milestone_500_bytes,
        lines.seal_bytes,
      ),
    );
    expect(stream.actual_bytes).toBe(finalGate.bytes);
    expect(stream.actual_sha256).toBe(finalGate.sha256);

    const sync = result.fixture_build.sync;
    expect(sync.suppressed_regular_file_syncs).toBe(
      sync.line_syncs + sync.pre_resume_syncs,
    );
    expect(sync).toMatchObject({
      suppressed_regular_file_syncs: 24_006,
      expected_suppressed_regular_file_syncs: 24_006,
      line_syncs: 24_004,
      expected_line_syncs: 24_004,
      pre_resume_syncs: 2,
      expected_pre_resume_syncs: 2,
      native_method_restored_before_batch_sync: true,
      one_work_batch_sync_completed: true,
      one_stage_directory_batch_sync_completed: true,
    });

    const native = result.native_scan;
    expect(native.work.records).toBe(lines.records);
    expect(native.work.bytes).toBe(stream.actual_bytes);
    expect(native.work.milestone_100_mac).toBe(gate100.milestone_100_mac);
    expect(native.work.milestone_500_mac).toBe(gate500.milestone_500_mac);
    expect(native.work.receipt_sha256).toBe(stream.actual_sha256);
    expect(native.work.independent_sha256).toBe(stream.actual_sha256);
    expect(native.work.sha256_match).toBe(true);
    for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
      expect(native.reads.bytes[purpose]).toBe(stream.actual_bytes);
      expect(native.reads.calls[purpose]).toBe(
        Math.ceil(stream.actual_bytes / (64 * 1024)),
      );
      expect(native.reads.maximum_request_bytes[purpose]).toBe(64 * 1024);
    }
    expect(
      Math.round(
        native.reads.first_ms["sealed-final"] -
          native.reads.first_ms["resumable-prefix"],
      ),
    ).toBe(native.timing.resumable_prefix_start_to_final_scan_start_wall_ms);

    const buildWall = Object.values(result.fixture_build.timing).reduce(
      (sum, value) => sum + value,
      0,
    );
    const measuredInternalWall =
      buildWall +
      native.timing.total_checkpoint_wall_ms +
      native.timing.independent_sha256_wall_ms;
    const externalWall = v3Evidence.attempts[0].external_wall_seconds * 1_000;
    expect(externalWall).toBeGreaterThanOrEqual(measuredInternalWall);
    expect(externalWall - measuredInternalWall).toBeLessThan(10_000);
    expect(
      result.fixture_build.memory.resource_max_rss_bytes,
    ).toBeGreaterThanOrEqual(result.fixture_build.memory.final_rss_bytes);
    expect(native.memory.resource_max_rss_bytes).toBeGreaterThanOrEqual(
      native.memory.final_rss_bytes,
    );
    expect(native.memory.resource_max_rss_bytes).toBeGreaterThanOrEqual(
      native.memory.sampled_peak_rss_bytes,
    );
    expect(
      v3Evidence.attempts[0].external_maximum_resident_set_bytes,
    ).toBeGreaterThanOrEqual(
      result.fixture_build.memory.resource_max_rss_bytes,
    );
    expect(
      v3Evidence.attempts[0].external_maximum_resident_set_bytes,
    ).toBeGreaterThanOrEqual(native.memory.resource_max_rss_bytes);

    const serialized = JSON.stringify(v3Evidence);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("/var/folders/");
    expect(serialized).not.toContain(".v7-scan-load-capability");
  });
});
