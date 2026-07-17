import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-stable-timeout-confirmation.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-stable-timeout-confirmation.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-stable-timeout-confirmation-2026-07-17.json",
);
const CONTRACT_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-stable-wasm-failure-kind.md",
);
const CONTRACT_ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-stable-wasm-failure-kind.en.md",
);
const CONTRACT_EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-stable-wasm-failure-kind-2026-07-16.json",
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

describe("stable-WASM merged timeout confirmation evidence", () => {
  it("keeps the Japanese and English articles at the same seven-section boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);

    expect(numberedSections(japanese)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(numberedSections(english)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(japanese).toContain(
      "blog-shogi-floodgate-stable-timeout-confirmation.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-stable-timeout-confirmation.md",
    );
    for (const marker of [
      "6a804a7954a9685361944aeb2be32494638fae2e",
      "4b46fd3761512f38bada4c7c23537a969349a804",
      "1,103.693",
      "1,704.974",
      "6,781.5 MiB",
      "600000",
      "search-timeout",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
  });

  it("records the exact sanitized outcomes and trusted failure metadata", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-stable-wasm-timeout-confirmation-evidence-v1",
      evidence_date: "2026-07-17",
      source_delivery: {
        pull_request: 485,
        state: "MERGED",
        implementation_head: "6a804a7954a9685361944aeb2be32494638fae2e",
        merge_method: "regular-merge-commit",
        merge_commit: "4b46fd3761512f38bada4c7c23537a969349a804",
        final_head_checks_total: 6,
        final_head_checks_passed: 6,
        unresolved_review_threads: 0,
      },
      execution_boundary: {
        mode: "same-configuration-read-only-stable-proposal-diagnostic",
        fixed_node_version: "v22.13.0",
        authenticated_training_input: true,
        workers: 12,
        search_timeout_ms: 600000,
        production_gate_invocations: 0,
      },
      timing: {
        before_snapshot_seconds: 0.04,
        training_input_authentication_and_ordering_seconds: 1103.693,
        stable_runtime_initialization_seconds: 0.165,
        diagnostic_total_seconds: 1704.974,
        parent_process_peak_rss_mib: 6781.5,
      },
      outcomes: {
        fulfilled_count: 7,
        rejected_count: 5,
        all_rejections_inspected_as_genuine_safe_metadata: true,
        broadcast_failure_kind: "search-timeout",
        broadcast_timeout_ms: 600000,
        same_genuine_safe_metadata_received_by_all_rejections: true,
      },
    });
    expect(evidence.outcomes.fulfilled_elapsed_seconds).toEqual([
      0.855, 1.334, 5.728, 66.382, 95.132, 107.763, 264.59,
    ]);
    expect(evidence.outcomes.rejected_elapsed_seconds).toEqual([
      599.997, 599.999, 600, 600.001, 600.003,
    ]);
    expect(
      evidence.outcomes.fulfilled_count + evidence.outcomes.rejected_count,
    ).toBe(
      evidence.execution_boundary.logical_candidate_window.candidate_count,
    );
  });

  it("states the pool-broadcast nonclaim without assigning a trigger index", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);

    expect(evidence.broadcast_interpretation).toMatchObject({
      first_pool_poison_safe_kind_established: true,
      classification_is_timing_inference_only: false,
      all_five_rejections_independently_timed_out_established: false,
      first_trigger_worker_identified: false,
      first_trigger_input_index_identified: false,
      outer_runtime_wrapper_identity_claimed: false,
      pool_terminal_error_identity_covered_by_merged_unit_tests: true,
    });
    expect(japanese).toContain(
      "5件がそれぞれ独立に600秒timeoutした」と読んではならない",
    );
    expect(japanese).toContain("最初にtriggerしたindexは非特定");
    expect(english).toContain(
      "must not be interpreted as five independently established timeout events",
    );
    expect(english).toContain(
      "the first triggering index remains unidentified",
    );
  });

  it("keeps every production mutation counter at zero and proves process reap", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    const persistentCounters = Object.entries(evidence.persistent_state)
      .filter(([key]) => key.endsWith("_mutation_counter"))
      .map(([, value]) => value);

    expect(persistentCounters).toEqual([0, 0, 0, 0, 0]);
    expect(Object.values(evidence.downstream_counters)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(evidence.persistent_state).toMatchObject({
      existing_lease_stage_checkpoint_or_quarantine_mutated: false,
      live_weights_mutated: false,
      persistent_state_unchanged: true,
    });
    expect(evidence.cleanup).toEqual({
      runtime_close: "fulfilled",
      fixed_worker_bootstrap_residual_processes: 0,
      yaneuraou_residual_processes: 0,
      all_workers_reaped: true,
    });
  });

  it("publishes no private payload and back-links the original contract evidence", () => {
    const evidenceText = readText(EVIDENCE_PATH);
    const evidence = JSON.parse(evidenceText);
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const contractJapanese = readText(CONTRACT_ARTICLE_PATH);
    const contractEnglish = readText(CONTRACT_ENGLISH_ARTICLE_PATH);
    const contractEvidence = JSON.parse(readText(CONTRACT_EVIDENCE_PATH));

    for (const value of Object.values(evidence.privacy)) {
      expect(value).toBe(false);
    }
    for (const forbidden of [
      "/Users/",
      "/private/tmp/",
      '"parent_sfen"',
      '"played_move"',
      '"game_id"',
      '"parent_id"',
      '"position_id"',
      "sha256:",
    ]) {
      expect(evidenceText).not.toContain(forbidden);
      expect(japanese).not.toContain(forbidden);
      expect(english).not.toContain(forbidden);
    }
    expect(contractJapanese).toContain(
      "blog-shogi-floodgate-stable-timeout-confirmation.md",
    );
    expect(contractEnglish).toContain(
      "blog-shogi-floodgate-stable-timeout-confirmation.en.md",
    );
    expect(contractEvidence.merged_code_confirmation).toMatchObject({
      evidence_path: "floodgate-stable-timeout-confirmation-2026-07-17.json",
      all_rejections_genuine_failure_kind: "search-timeout",
      all_rejections_timeout_ms: 600000,
      all_five_independently_timed_out_established: false,
      first_trigger_input_index_identified: false,
      persistent_state_unchanged: true,
      production_mutation_counters_total: 0,
      live_weights_changed: false,
    });
    expect(contractEvidence.delivery).toMatchObject({
      pull_request: 485,
      final_head_github_ci: "PASS",
      regular_merge: "PASS",
      same_twelve_candidate_rerun_on_merged_code: true,
    });
  });
});
