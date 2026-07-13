import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import evidence from "../../../ml/protocols/floodgate-v7-valid-24k-scan-load-7844ea4-result.json";
import {
  FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA,
  FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS,
  buildFloodgateV7ScanLoadSourceUrlCoreForTests,
  parseFloodgateV7CheckpointScanLoadInternalOptionsCoreForTests,
  parseFloodgateV7CheckpointScanLoadOptionsCoreForTests,
  runFloodgateV7CheckpointScanLoadHarness,
  verifyFloodgateV7ScanLoadSyncRestorationCoreForTests,
} from "../../../ml/floodgate-v7-checkpoint-scan-load";
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
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
    "restores the native sync descriptor when the isolated build action rejects",
    async () => {
      await expect(
        verifyFloodgateV7ScanLoadSyncRestorationCoreForTests(),
      ).resolves.toBeUndefined();
    },
  );

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

  it("pins the accepted synthetic 24,000-parent evidence and exact arithmetic", async () => {
    const bytes = await fs.promises.readFile(
      path.join(
        process.cwd(),
        "ml/protocols/floodgate-v7-valid-24k-scan-load-7844ea4-result.json",
      ),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "7fc84e5e6168859d1bdcb0d352839725fe53a1dc8994ea34b7b44bb3b20eda58",
    );
    expect(evidence).toMatchObject({
      status: "complete-accepted-synthetic-24k-test-only-scan-load-evidence",
      attempts: [
        { attempt: 1, accepted_evidence: false },
        { attempt: 2, accepted_evidence: false },
        {
          attempt: 3,
          accepted_evidence: true,
          source_commit: "7844ea49f9e0326a5531824d7e356d6d51726d58",
          harness_sha256:
            "d1debecd249f70c36f5a0b72f653f1de1764f22022f7864fd1baa68a078485ff",
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
    const stream = evidence.result.valid_stream;
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
      evidence.result.native_scan.work.receipt_sha256,
    );
    expect(stream.actual_sha256).toBe(
      evidence.result.native_scan.work.independent_sha256,
    );
    for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
      expect(evidence.result.native_scan.reads.bytes[purpose]).toBe(
        stream.actual_bytes,
      );
      expect(evidence.result.native_scan.reads.calls[purpose]).toBe(
        Math.ceil(stream.actual_bytes / (64 * 1024)),
      );
      expect(
        evidence.result.native_scan.reads.maximum_request_bytes[purpose],
      ).toBe(64 * 1024);
    }
  });
});
