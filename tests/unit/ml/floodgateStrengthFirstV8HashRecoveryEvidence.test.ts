import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { FLOODGATE_PRODUCTION_TEACHER_RUNTIME } from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT,
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME,
} from "../../../ml/floodgate-strength-first-v8-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
  FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_OUTPUT_DIRECTORY,
  FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA,
} from "../../../ml/floodgate-strength-first-teacher-runner";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-v8-hash-recovery-2026-07-19.json",
);
const amendmentPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-v8-hash-recovery-amendment.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-hash-recovery.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-hash-recovery.en.md",
);
const bridgePath = path.join(
  repositoryRoot,
  "ml/strength_first_qat_training_bridge.py",
);

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Floodgate strength-first v8 hash recovery evidence", () => {
  it("records the exact aggregate v7 failure without claiming completion", () => {
    expect(readJson(evidencePath)).toMatchObject({
      schema: "shogi-floodgate-strength-first-v8-hash-recovery-evidence-v1",
      status: "implementation-candidate-under-review-formal-v8-not-started",
      formal_v7_failure: {
        authentication_completed: true,
        milestone_100_completed: true,
        milestone_500_completed: false,
        final_result_published: false,
        saved_work: {
          records_including_header: 500,
          bytes: 6818743,
          header_records: 1,
          non_timeout_parent_entries: 498,
          timeout_skip_entries: 1,
        },
        target_500: {
          allowed_timeout_skips: 1,
          observed_timeout_searches: 2,
          second_timeout_entry_persisted: false,
          second_partial_label_persisted: false,
        },
        training_started: false,
        formal_ab_started: false,
        live_weight_changes: 0,
      },
      claims: {
        teacher_completion: false,
        training_completion: false,
        candidate_selection: false,
        playing_strength_gain: false,
        live_promotion: false,
      },
      execution_authority: {
        legacy_v1_asset_authority_modified: false,
        legacy_v1_asset_runtime_hash_mb_per_engine: 64,
        v8_authority_contract:
          "shogi-floodgate-strength-first-v8-teacher-authority-v1",
        v8_runtime_hash_mb_per_engine: 512,
        nested_legacy_asset_provenance_required: true,
        "raw_v1_receipt_accepted_by-v8-runner": false,
        "top_v8_policy_and-nested-v1-contract-runtime-validated": true,
        "top_asset_aliases_must-match-nested-receipt": true,
        "final_teacher_assets_match_nested-receipt": true,
        "nested_assets_match_static-production-registry": true,
        "nested_engine_metadata-and-postverification-pinned": true,
        "proxy-accessor-symbol-hidden-and-custom-prototype-rejected": true,
        "runner_uses_canonical-deep-frozen-captured-receipt": true,
      },
      independent_diagnostic_audit: {
        status: "PASS",
        scope: "v7-failure-artifacts-and-v8-search-configuration-only",
        implementation_security_review_complete: false,
        recommended_configuration_matches_candidate: true,
        confirmed_v7_saved_rows: {
          records_including_header: 500,
          header: 1,
          completed_parents: 498,
          timeout_skips: 1,
          valid_completed_checksums_and_ids: 499,
          second_timeout_parent_absent_entirely: true,
        },
        confirmed_no_v7_holder_or_engine_process: true,
      },
    });
  });

  it("binds the measured 64, 256, and 512 MiB diagnostics exactly", () => {
    expect(readJson(evidencePath)).toMatchObject({
      measured_hash_diagnostics: {
        normal_nine_position_aggregate: {
          hash_256_elapsed_seconds: 212.208,
          hash_512_elapsed_seconds: 206.092,
          hash_512_reduction_percent: 2.882078,
        },
        first_formal_timeout_independent_rescore: {
          hash_64: {
            elapsed_seconds: 870.566,
            nodes: 707909200,
            formal_600_second_limit_would_timeout: true,
          },
          hash_256: {
            elapsed_seconds: 132.162,
            nodes: 130950979,
            within_formal_600_second_limit: true,
          },
          hash_512: {
            elapsed_seconds: 157.325,
            nodes: 162457860,
            within_formal_600_second_limit: true,
          },
        },
        first_formal_timeout_fresh_full_label_hash_512: {
          total_elapsed_seconds: 51.379,
          candidate_count: 12,
          proposal_nodes: 37909321,
          aggregate_independent_rescore_nodes: 9745451,
          timeout_ms_per_search: 600000,
          completed: true,
          fresh_candidate_set_not_v7_migration: true,
        },
        second_formal_timeout_full_parent: {
          hash_64: {
            total_elapsed_seconds: 1007.432,
            independent_rescore_timed_out_at_seconds: 900,
            completed: false,
          },
          hash_256: {
            total_elapsed_seconds: 88.063,
            completed: true,
          },
          hash_512: {
            total_elapsed_seconds: 70.316,
            completed: true,
          },
        },
        production_like_hash_512_load_test: {
          parallel_processes: 12,
          representative_normal_parents: 12,
          completed: 12,
          failures: 0,
          wall_elapsed_seconds: 47.557,
          parent_elapsed_seconds: {
            minimum: 11.894,
            maximum: 47.52,
          },
          peak_engine_rss_gib_approx: 8,
          system_memory_free_percent_at_peak: 45,
          pages_throttled: 0,
          post_test_engine_processes: 0,
          post_test_private_temporary_directories: 0,
          post_test_memory_free_percent: 49,
        },
        temporary_directory_cleanup_complete: true,
        diagnostic_engine_processes_remaining: 0,
      },
    });
  });

  it("keeps v8 code/protocol aligned while downstream remains closed", () => {
    expect(FLOODGATE_PRODUCTION_TEACHER_RUNTIME.hash_mb_per_engine).toBe(64);
    expect(FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME.hash_mb_per_engine).toBe(
      512,
    );
    expect(FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT).toBe(
      "shogi-floodgate-strength-first-v8-teacher-authority-v1",
    );
    expect(FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE).toBe(512);
    expect(FLOODGATE_STRENGTH_FIRST_TEACHER_OUTPUT_DIRECTORY).toBe(
      "floodgate-q1-2026-strength-first-v8",
    );
    expect(FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA).toBe(
      "shogi-floodgate-strength-first-teacher-runner-v2",
    );
    expect(FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA).toBe(
      "shogi-floodgate-strength-first-teacher-milestone-v2",
    );
    expect(FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA).toBe(
      "shogi-floodgate-strength-first-teacher-postflight-result-v2",
    );
    expect(FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA).toBe(
      "shogi-floodgate-strength-first-teacher-public-receipt-v2",
    );

    expect(readJson(amendmentPath)).toMatchObject({
      schema:
        "shogi-floodgate-q1-2026-strength-first-v8-hash-recovery-amendment-v1",
      status: "preregistered-after-v7-failed-before-formal-v8-start",
      v8_change: {
        output_generation: "floodgate-q1-2026-strength-first-v8",
        hash_mb_per_engine: 512,
        parallel_engines: 12,
        threads_per_engine: 1,
        timeout_ms_per_search: 600000,
        full_input_reauthentication: true,
        v7_work_or_labels_reused: false,
        v7_to_v8_migration_authorized: false,
        downstream_training_bridge_status:
          "existing-v7-v1-bridge-rejects-v8-fail-closed-pending-separate-provenance-pr",
        execution_authority: {
          "legacy_v1_asset_receipt_is-nested-and-unchanged": true,
          legacy_v1_hash_mb_per_engine: 64,
          v8_hash_mb_per_engine: 512,
          raw_legacy_v1_receipt_accepted: false,
          "top_policy_and-nested-provenance_must-match": true,
          "nested_assets_match_static-production-registry": true,
          "nested_engine-metadata-owner-and-postverification-pinned": true,
          "untrusted-receipt-is-captured-as-canonical-deep-frozen-data": true,
          "proxy-accessor-symbol-hidden-and-custom-prototype-rejected": true,
        },
      },
      launch_gate: {
        formal_v8_started_by_this_change: false,
        live_weights_may_change: false,
      },
      independent_diagnostic_audit: {
        status: "PASS",
        scope: "v7-failure-artifacts-and-v8-search-configuration-only",
        implementation_security_review_complete: false,
        recommended_hash_mb_per_engine: 512,
        recommended_timeout_ms_per_search: 600000,
        recommended_timeout_skip_caps: {
          "100": 1,
          "500": 1,
          "24000": 24,
        },
        v7_reuse_reseal_or_migration_allowed: false,
      },
    });

    const bridge = fs.readFileSync(bridgePath, "utf8");
    expect(bridge).toContain(
      ".codex/shogi-runs/floodgate-q1-2026-strength-first-v7",
    );
    expect(bridge).toContain(
      "shogi-floodgate-strength-first-teacher-postflight-result-v1",
    );
    expect(bridge).not.toContain(
      ".codex/shogi-runs/floodgate-q1-2026-strength-first-v8",
    );
    expect(bridge).not.toContain(
      "shogi-floodgate-strength-first-teacher-postflight-result-v2",
    );
  });

  it("publishes bilingual aggregate evidence without private identities", () => {
    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    for (const article of [japanese, english]) {
      expect(article).toContain("512");
      expect(article).toContain("870.566");
      expect(article).toContain("70.316");
      expect(article).toContain("51.379");
      expect(article).toContain("47.557");
      expect(article).toContain("24,000");
      expect(article).toMatch(/(?:まだ完了していない|not complete)/i);
    }

    const publicText = [
      japanese,
      english,
      fs.readFileSync(evidencePath, "utf8"),
      fs.readFileSync(amendmentPath, "utf8"),
    ].join("\n");
    expect(publicText).not.toMatch(
      /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen|S\*2a)/,
    );
    expect(publicText).not.toMatch(/(?:036be569|0113412f|cb3e7b19|ca9c4e)/);
  });
});
