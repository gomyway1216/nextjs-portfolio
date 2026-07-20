import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LOCAL_EXTERNAL_CALIBRATION_ADJUDICATION,
  LOCAL_EXTERNAL_CALIBRATION_MAX_CONCURRENCY,
  PINNED_LOCAL_EXTERNAL_CALIBRATION_TIME_CONTROL,
  localExternalCalibrationOpeningId,
  validatePinnedLocalExternalCalibrationRequestCoreForTests,
} from "../../../ml/local-external-calibration";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY } from "../../../ml/floodgate-production-teacher-asset-authority";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const EVIDENCE = path.join(
  ROOT,
  "docs/data/shogi-local-external-calibration-adapter-2026-07-19.json",
);
const PILOT_REQUEST = path.join(
  ROOT,
  "docs/data/shogi-local-external-calibration-pilot-request-2026-07-19.json",
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
      pushed: true,
      pull_request_created: true,
      pull_request_number: 531,
      pull_request_url:
        "https://github.com/gomyway1216/nextjs-portfolio/pull/531",
      pull_request_ready_for_review: true,
    });
    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      const bytes = fs.readFileSync(path.join(ROOT, artifact.path));
      expect(bytes.byteLength).toBe(artifact.bytes);
      expect(sha256(bytes)).toBe(artifact.sha256);
    }
    const pilotBytes = fs.readFileSync(PILOT_REQUEST);
    expect(pilotBytes.byteLength).toBe(
      evidence.pilot_preregistration.request.bytes,
    );
    expect(sha256(pilotBytes)).toBe(
      evidence.pilot_preregistration.request.sha256,
    );
    const pilot = JSON.parse(pilotBytes.toString("utf8"));
    validatePinnedLocalExternalCalibrationRequestCoreForTests(pilot);
    expect(pilot.openings).toHaveLength(6);
    expect(pilot.game_concurrency).toBe(12);
    expect(pilot.max_plies).toBe(8);
    expect(
      pilot.openings.every(
        (opening: { opening_id: string; sfen: string }) =>
          opening.opening_id ===
          localExternalCalibrationOpeningId(opening.sfen),
      ),
    ).toBe(true);
    expect(evidence.pilot_preregistration).toMatchObject({
      status: "INDEPENDENT_REVIEW_PASS_FIXED_BEFORE_RESULTS",
      run_id: pilot.run_id,
      opening_pairs: 6,
      games: 12,
      game_concurrency: 12,
      max_plies: 8,
    });
    expect(evidence.pilot_preregistration.run_id_derivation).toMatchObject({
      domain_bytes: 46,
      canonical_body_bytes: 1372,
      canonical_body_sha256:
        "0d84be515d14f54d7b7174638459ab58808eb35caab973ddbd18b6025381c0c1",
    });
    expect(evidence.pilot_preregistration.independent_review).toMatchObject({
      p0: 0,
      p1: 0,
      p2: 0,
      schedule_games_rederived: 12,
    });
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

  it("records both real attempts without making a strength claim", () => {
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
    expect(evidence.execution_counters).toMatchObject({
      real_stable_games: 24,
      real_yaneuraou_games: 24,
      real_engine_processes_started_by_this_change: 24,
      claimable_real_games: 12,
      claimable_pilot_receipts: 1,
      non_issuable_completed_attempts: 1,
      network_requests: 0,
      aws_operations: 0,
      gcp_operations: 0,
      firebase_operations: 0,
      vercel_operations: 0,
      holdout_reads: 0,
      holdout_writes: 0,
      production_result_writes: 0,
      live_weight_changes: 0,
    });
    expect(
      Object.values(evidence.nonclaims).every((value) => value === false),
    ).toBe(true);
    expect(evidence.review).toMatchObject({
      independent_review: "complete",
      unresolved_p0: 0,
      unresolved_p1: 0,
      unresolved_p2: 0,
      code_review_gate_passed: true,
      technical_pilot_authorized: true,
      technical_pilot_completed: true,
      real_pilot_authorized: true,
    });
    expect(evidence.review.remaining_pilot_gates).toEqual([]);
    expect(evidence.pilot_execution_attempts.attempt_1).toMatchObject({
      status: "NON_ISSUABLE_WRAPPER_PUBLICATION_RACE",
      games_completed: 12,
      cleanup_completed: true,
      result_claimable: false,
      wdl_published: false,
    });
    expect(evidence.pilot_execution_attempts.attempt_2).toMatchObject({
      status: "NOT_LAUNCHED_REVIEW_REJECTED",
      engine_processes_started: 0,
    });
    expect(evidence.pilot_execution_attempts.attempt_3).toMatchObject({
      status: "VALID_COMPLETE_RECEIPT",
      engine_processes_started: 12,
      output_directory_claimed: true,
      games_completed: 12,
      technical_faults: 0,
      cleanup_completed: true,
      result_claimable: true,
    });
    expect(evidence.pilot_result).toMatchObject({
      status: "VALID_COMPLETE_TECHNICAL_PILOT_ZERO_STRENGTH_SIGNAL",
      attempt: 3,
      terminal: {
        outcome: "receipt",
        bytes: 21066,
        file_sha256:
          "f1f77b1c74a3b0a3fb2579d316e492e904cead5db898e4ef987714e7cc285723",
        receipt_sha256:
          "6fa8de0d10a30791f9cc75a4b312fcc2e3b85ec481d770672c1be1d62c070a87",
      },
      execution_identity: {
        head: "cacfa730fdc8d7bfd3005eb1c47bb855c0495a70",
        tree: "b1ac618c3ecb2e284f663edc7948033cc911f0cf",
        adapter_sha256:
          "85c6a8aabc1b62ab0a755fe746daa4e4b6893ab5cb1ee7a7eeb5b0d5ff3957d3",
        wrapper: {
          bytes: 9656,
          sha256:
            "4870280cd801c775adc3a277b3416dbed3f83fe24b56ee232aea79dd5332c6f0",
        },
        launcher: {
          bytes: 5056,
          sha256:
            "990f8f52bef19b17f549813cb3f6162ce834c3abec3af3fa49ef112b9acbf54a",
        },
        publication:
          "exclusive-one-shot-claim-and-fsync-hard-link-no-replace-single-terminal-v1",
        supervisor_deadline_seconds: 900,
      },
      summary: {
        games: 12,
        plies: 96,
        stable_wins: 0,
        draws: 12,
        stable_losses: 0,
        decisive_games: 0,
        technical_faults: 0,
        cleanup_completed: true,
      },
      independent_recomputation: {
        game_ids_recomputed: 12,
        transcript_digests_recomputed: 12,
        legal_plies_replayed: 96,
        final_sfen_matches: 12,
      },
      strength_interpretation: {
        technical_completion_signal: true,
        strength_signal: false,
        elo_signal: false,
        rank_signal: false,
      },
    });
    expect(evidence.pilot_result.games).toHaveLength(12);
    expect(
      evidence.pilot_result.games.every(
        (game) =>
          game.result_for_stable === "draw" &&
          game.termination === "max-plies" &&
          game.plies === 8,
      ),
    ).toBe(true);
    expect(
      new Set(evidence.pilot_result.games.map((game) => game.transcript_sha256))
        .size,
    ).toBe(12);
    expect(
      evidence.pilot_preflight.exact_private_asset_read_only,
    ).toMatchObject({
      status: "PASS",
      engine: FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou,
      stable_weights:
        FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.stable.weights,
    });
    expect(evidence.pilot_preflight.writer_closure).toMatchObject({
      status: "PASS_ATTEMPT_3_VALID_SINGLE_TERMINAL",
      adapter_status: "PASS",
      adapter_filesystem_writer: false,
      adapter_network_writer: false,
      live_weight_writer: false,
      holdout_reader_or_writer: false,
      production_result_writer: false,
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
      expect(article).toMatch(/non-issuable|採用不能/iu);
      expect(article).toContain(
        "6fa8de0d10a30791f9cc75a4b312fcc2e3b85ec481d770672c1be1d62c070a87",
      );
      expect(article).toMatch(/zero strength signal|棋力signalは0/iu);
      expect(article).toMatch(/high-dan|高段/iu);
    }
    expect(japanese).toContain(
      "blog-shogi-local-external-calibration-adapter.en.md",
    );
    expect(japanese).toMatch(/採用不能12局.*有効.*12局/iu);
    expect(english).toContain(
      "blog-shogi-local-external-calibration-adapter.md",
    );
    expect(english).toMatch(/12 non-issuable games.*12 valid/iu);
    expect(english).not.toMatch(/real calibration.*zero games/iu);
  });
});
