import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-formal-paired-ab-v2-real-wasm-match-runtime-2026-07-20.json";
const adapterRelative = "ml/formal-paired-ab-v2-wasm-match-adapter.ts";
const childRelative = "ml/formal-paired-ab-v2-wasm-player-child.ts";
const pairEntryRelative = "ml/run-formal-paired-ab-v2-wasm-pair.ts";
const launcherRelative = "ml/formal_paired_ab_v2_wasm_match_launcher.py";
const japaneseArticleRelative =
  "docs/blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.md";
const englishArticleRelative =
  "docs/blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.en.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function bytesAndSha256(relativePath: string): {
  bytes: number;
  sha256: string;
} {
  const bytes = fs.readFileSync(path.join(repositoryRoot, relativePath));
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

describe("formal paired A/B v2 real WASM match runtime evidence", () => {
  it("content-addresses the executable runtime without changing historical publication files", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      expect(bytesAndSha256(artifact.path)).toEqual({
        bytes: artifact.bytes,
        sha256: artifact.sha256,
      });
    }
    for (const artifact of Object.values(
      evidence.historical_publication_preserved,
    ) as Array<{ path?: string; bytes?: number; sha256?: string } | boolean>) {
      if (typeof artifact === "boolean") continue;
      expect(bytesAndSha256(artifact.path as string)).toEqual({
        bytes: artifact.bytes,
        sha256: artifact.sha256,
      });
    }
    expect(evidence.historical_publication_preserved.modified).toBe(false);
    expect(evidence.implementation).toMatchObject({
      production_callable: "run_pinned_ready_wasm_pairs",
      actual_match_execution_api: true,
      stop_only_protocol: false,
      caller_selected_ready_registry: false,
      code_pinned_ready_registry: null,
      production_route_status: "closed-no-code-pinned-ready-registry",
      live_weight_write_api: false,
    });
    expect(read(launcherRelative)).toContain(
      "def run_pinned_ready_wasm_pairs(",
    );
  });

  it("records the exact dual-process search and 384-pair accounting contract", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.runtime_contract).toEqual({
      pairs: 384,
      games_per_pair: 2,
      games: 768,
      candidate_sente_games: 384,
      candidate_gote_games: 384,
      maximum_pair_workers: 2,
      maximum_concurrent_engine_processes: 4,
      engine: "production-browser-wasm-v20",
      wasm_bytes: 35_597,
      wasm_sha256:
        "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c",
      weights_bytes_each: 1_185_988,
      candidate_and_stable_paths_distinct: true,
      candidate_and_stable_sha256_distinct: true,
      isolated_candidate_and_stable_processes: true,
      nnue_scale_k: 600,
      fixed_depth: 11,
      quiescence_depth: 10,
      early_mate_absolute_score_min: 89_990_000,
      early_mate_absolute_score_max: 90_000_000,
      private_tt_cleared_before_every_decision: true,
      opening_book: false,
      fallback: false,
      maximum_plies: 512,
      adjudication: [
        "no-legal-moves",
        "fourfold-repetition",
        "perpetual-check",
        "max-plies",
      ],
    });
    expect(evidence.authentication_and_cleanup).toMatchObject({
      plain_object_execution_authority: false,
      capability_one_shot: true,
      child_independent_exact_bytes_and_sha256_before_wasm_load: true,
      inode_metadata_and_content_revalidated_after_both_games: true,
      both_children_closed_and_reaped_before_receipt: true,
      listener_first_close_wait_with_recheck: true,
      incremental_stdin_hard_cap_bytes: 131_072,
      subprocess_fault_diagnostic:
        "returncode-stderr-bytes-sha256-no-raw-stderr",
      receipt_on_partial_or_cleanup_failure: false,
    });
    expect(evidence.journal_and_resume).toMatchObject({
      completed_pair_replayed: false,
      partial_or_technical_fault_replayed: false,
      sidecar_or_artifact_drift_accepted: false,
      authoritative_v2_decoder_reused: true,
    });
    const adapter = read(adapterRelative);
    expect(adapter).toContain(
      "export function authenticateFormalPairedAbV2WasmPair(",
    );
    expect(adapter).toContain(
      "export function runAuthenticatedFormalPairedAbV2WasmPair(",
    );
    expect(adapter).toContain(
      "export function validateFormalPairedAbV2ExactAccounting(",
    );
    expect(adapter).toContain('child.once("close", onClose);');
    expect(adapter).toContain("if (isClosed())");
    expect(read(childRelative)).toContain(
      "Math.abs(stats.score) >= MATE_SCORE_ABS_MIN",
    );
    const pairEntry = read(pairEntryRelative);
    expect(pairEntry).toContain("for await (const value of process.stdin)");
    expect(pairEntry).not.toContain("readFileSync(0)");
  });

  it("separates real dual-WASM execution tests from synthetic full accounting", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.test_scope.real_dual_process_wasm_test).toEqual({
      two_distinct_1185988_byte_files_loaded: true,
      independent_candidate_and_stable_children: true,
      production_browser_wasm_search_executed: true,
      same_opening_color_swap_executed: true,
      canonical_stdin_pair_entry_executed: true,
      oversized_stdin_rejected_incrementally: true,
      close_event_ordering_race_tested: true,
      sanitized_subprocess_fault_diagnostic_tested: true,
      cleanup_verified: true,
      formal_strength_result: false,
    });
    expect(evidence.test_scope.full_384_pair_accounting_test).toEqual({
      pairs: 384,
      games: 768,
      receipt_source: "fast-injected-test-receipts",
      real_wasm_games: false,
      maximum_two_concurrent_pair_callbacks_verified: true,
      all_journals_and_sidecars_verified: true,
      zero_callback_resume_verified: true,
      terminal_crash_verified: true,
      sidecar_drift_rejection_verified: true,
    });
    expect(evidence.validation).toMatchObject({
      typescript_no_emit: "PASS",
      pair_adapter_tests_passed: 10,
      pair_adapter_tests_failed: 0,
      formal_launcher_tests_passed: 4,
      formal_launcher_tests_failed: 0,
      selected_related_tests_passed: 33,
      selected_related_tests_failed: 0,
      runtime_publication_evidence_tests_passed: 4,
      runtime_publication_evidence_tests_failed: 0,
      full_ml_stdlib_tests_passed: 288,
      full_ml_stdlib_tests_failed: 0,
      ruff: "PASS",
      prettier: "PASS",
      diff_check: "PASS",
    });
  });

  it("keeps formal execution and strength claims at zero in both articles", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    expect(
      Object.values(evidence.execution_counters).every((value) => value === 0),
    ).toBe(true);
    expect(evidence.nonclaims).toEqual({
      candidate_selected: false,
      formal_ab_executed: false,
      candidate_stronger: false,
      high_dan_calibrated: false,
      promotion_authorized: false,
      live_weights_changed: false,
    });
    expect(evidence.safety).toMatchObject({
      local_only: true,
      network: false,
      aws: false,
      gcp: false,
      cloud: false,
      live_weight_write: false,
    });
    for (const article of [japanese, english]) {
      expect(article).toContain("0 / 768");
      expect(article).toContain("384");
      expect(article).toContain("dual-WASM");
      expect(article).toContain(
        "floodgate-formal-paired-ab-v2-real-wasm-match-runtime-2026-07-20.json",
      );
    }
  });
});
