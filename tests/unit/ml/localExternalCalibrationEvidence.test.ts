import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION,
  LOCAL_EXTERNAL_CALIBRATION_MAX_CONCURRENCY,
  PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
} from "../../../ml/local-external-calibration";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY } from "../../../ml/floodgate-production-teacher-asset-authority";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const EVIDENCE = path.join(
  ROOT,
  "docs/data/shogi-local-external-calibration-adapter-2026-07-19.json",
);
const JAPANESE = path.join(
  ROOT,
  "docs/blog-shogi-local-external-calibration-adapter.md",
);
const ENGLISH = path.join(
  ROOT,
  "docs/blog-shogi-local-external-calibration-adapter.en.md",
);
const SOURCE = path.join(ROOT, "ml/local-external-calibration.ts");

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("local external calibration publication evidence", () => {
  it("binds the exact reviewed implementation artifacts", () => {
    const evidence = JSON.parse(read(EVIDENCE));
    expect(evidence.implementation_anchor).toMatchObject({
      revision: "70f9a6d0f1098dd37cb4024691ed92e8336582e9",
      tree: "b8ab2e49c38dbd0333d7e42472f41ba06ef51716",
      base_revision: "f5f49c2bea0c6de1ba5d28696281b9002426308a",
      pushed: false,
      pull_request_created: false,
    });
    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      const bytes = fs.readFileSync(path.join(ROOT, artifact.path));
      expect(bytes.byteLength).toBe(artifact.bytes);
      expect(sha256(bytes)).toBe(artifact.sha256);
    }
  });

  it("matches the exact stable and pinned-reference runtime contracts", () => {
    const evidence = JSON.parse(read(EVIDENCE));
    expect(evidence.runtime_binding.stable).toMatchObject({
      workers: 12,
      depth: PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL.stable_depth,
      timeout_ms:
        PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL.stable_timeout_ms,
      weights: FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.stable.weights,
    });
    expect(evidence.runtime_binding.reference).toMatchObject({
      processes: 12,
      threads_per_process: 1,
      depth: PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL.reference_depth,
      timeout_ms:
        PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL.reference_timeout_ms,
      binary: FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou,
    });
    expect(evidence.pairing).toMatchObject({
      games_per_opening: 2,
      stable_colors: ["sente", "gote"],
      identical_canonical_opening_within_pair: true,
      maximum_game_concurrency: LOCAL_EXTERNAL_CALIBRATION_MAX_CONCURRENCY,
      receipt_order_independent_of_completion_order: true,
    });
    expect(evidence.rules).toMatchObject({
      canonical_sfen_round_trip: true,
      rules_complete_usi_membership: true,
      structural_opening_checks:
        "exactly-one-king-per-side-physical-piece-limits-check-state-no-double-pawn-and-no-immobile-unpromoted-piece",
      fourfold_position_repetition:
        "draw-unless-one-side-gave-continuous-check",
      perpetual_check: "checking-side-loses",
      single_legal_reference_move: "fixed-depth-multipv1-forced-rescore",
    });
    expect(LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION).toContain(
      "perpetual-check-loss",
    );
  });

  it("keeps every write path closed and exposes no argumentless launcher", () => {
    const evidence = JSON.parse(read(EVIDENCE));
    const source = read(SOURCE);
    expect(evidence.entry_boundary).toMatchObject({
      explicit_complete_request_required: true,
      argumentless_entry: false,
      cli: false,
      caller_selected_engine_path: false,
      caller_selected_weight_path: false,
      network: false,
      live_weight_writer: false,
      holdout_reader_or_writer: false,
      production_result_writer: false,
    });
    expect(source).toContain(
      "export function runPinnedLocalExternalCalibration(",
    );
    expect(source).not.toMatch(/\bprocess\.argv\b/u);
    expect(source).not.toMatch(
      /from ["']node:(?:fs|http|https|net|tls|dgram)["']/u,
    );
    expect(source).not.toMatch(/\b(?:fetch|writeFile|appendFile)\s*\(/u);
  });

  it("records fake-only validation, zero real games, and no strength claim", () => {
    const evidence = JSON.parse(read(EVIDENCE));
    expect(evidence.validation).toMatchObject({
      node: "v22.13.0",
      focused_tests_passed: 14,
      focused_tests_failed: 0,
      related_files_passed: 5,
      related_tests_passed: 81,
      related_tests_failed: 0,
      full_ml_final_status: "NOT_RERUN_AFTER_FINAL_P2_FIXES",
      full_ml_attempt_revision: "5ff1bb6d4207c8f9c78de922fad402b2487e8a70",
      full_ml_attempt_status: "FAILED_TWO_UNRELATED_FIVE_SECOND_TIMEOUTS",
      full_ml_test_files_passed: 148,
      full_ml_test_files_failed: 1,
      full_ml_tests_passed: 2570,
      full_ml_tests_failed: 2,
      full_ml_tests_skipped: 1,
      full_ml_duration_seconds: 212.26,
      isolated_timeout_file_tests_passed: 13,
      isolated_timeout_file_tests_failed: 0,
      isolated_timeout_file_duration_seconds: 18.16,
      fake_usi_subprocess_games: 2,
      illegal_move_completed_games_discarded: 1,
      illegal_move_receipts_issued: 0,
      synthetic_timeout_receipts_issued: 0,
      perpetual_check_fixture_plies: 12,
      no_legal_moves_fixture_plies: 1,
      pinned_request_preflight_before_runtime: true,
      combined_operation_and_close_failure_tests_passed: 2,
      eslint: "PASS",
      prettier: "PASS",
      diff_check: "PASS",
    });
    expect(
      Object.values(evidence.execution_counters).every((value) => value === 0),
    ).toBe(true);
    expect(
      Object.values(evidence.nonclaims).every((value) => value === false),
    ).toBe(true);
    expect(evidence.review).toMatchObject({
      independent_review: "complete",
      unresolved_p0: 0,
      unresolved_p1: 0,
      unresolved_p2: 0,
      code_review_gate_passed: true,
      real_pilot_authorized: false,
    });
  });

  it("keeps the Japanese and English reports aligned with the evidence", () => {
    const japanese = read(JAPANESE);
    const english = read(ENGLISH);
    for (const article of [japanese, english]) {
      expect(article).toContain("70f9a6d0");
      expect(article).toContain("14 / 14 PASS");
      expect(article).toContain("81 / 81 PASS");
      expect(article).toMatch(/148 \/ 149 files/iu);
      expect(article).toContain("2,570 PASS");
      expect(article).toContain("212.26");
      expect(article).toContain("13 / 13 PASS");
      expect(article).toContain("18.16");
      expect(article).toMatch(/not been rerun|未再実行/iu);
      expect(article).toContain(
        "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
      );
      expect(article).toContain(
        "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
      );
      expect(article).toMatch(/zero games|0局/iu);
      expect(article).toMatch(/high-dan|高段/iu);
    }
    expect(japanese).toContain(
      "blog-shogi-local-external-calibration-adapter.en.md",
    );
    expect(english).toContain(
      "blog-shogi-local-external-calibration-adapter.md",
    );
  });
});
