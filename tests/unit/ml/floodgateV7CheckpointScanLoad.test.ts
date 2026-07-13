import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import currentEvidence from "../../../ml/protocols/floodgate-v7-valid-24k-scan-load-017692c-result.json";
import historicalEvidence from "../../../ml/protocols/floodgate-v7-valid-24k-scan-load-183e95f-result.json";
import {
  FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA,
  FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS,
  buildFloodgateV7ScanLoadSourceUrlCoreForTests,
  parseFloodgateV7CheckpointScanLoadInternalOptionsCoreForTests,
  parseFloodgateV7CheckpointScanLoadOptionsCoreForTests,
  runFloodgateV7CheckpointScanLoadHarness,
  validateFloodgateV7ScanLoadMemoryCoreForTests,
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
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const evidenceRuntimeIt = process.version === "v22.13.0" ? it : it.skip;

describe("Floodgate v7 semantic checkpoint scanner load harness", () => {
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
});
