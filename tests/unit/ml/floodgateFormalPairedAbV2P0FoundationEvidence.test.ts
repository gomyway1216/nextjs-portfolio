import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-formal-paired-ab-v2-p0-foundation-2026-07-20.json";
const japaneseArticleRelative =
  "docs/blog-shogi-formal-paired-ab-v2-p0-foundation.md";
const englishArticleRelative =
  "docs/blog-shogi-formal-paired-ab-v2-p0-foundation.en.md";

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

describe("formal paired A/B v2 P0 foundation evidence", () => {
  it("content-addresses immutable artifacts and detects advanced runtime drift", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const advancedRuntimeArtifacts = new Set([
      "ml/formal_paired_ab_v2_wasm_contract.py",
      "ml/formal-paired-ab-v2-wasm-match-adapter.ts",
      "ml/formal_paired_ab_v2_wasm_match_launcher.py",
    ]);
    const observedAdvancedRuntimeArtifacts = new Set<string>();
    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      const sealedIdentity = {
        bytes: artifact.bytes,
        sha256: artifact.sha256,
      };
      const currentIdentity = bytesAndSha256(artifact.path);
      if (advancedRuntimeArtifacts.has(artifact.path)) {
        expect(currentIdentity).not.toEqual(sealedIdentity);
        observedAdvancedRuntimeArtifacts.add(artifact.path);
      } else {
        expect(currentIdentity).toEqual(sealedIdentity);
      }
    }
    expect(observedAdvancedRuntimeArtifacts).toEqual(advancedRuntimeArtifacts);
  });

  it("binds the real clockless WASM and opening contracts", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    expect(evidence.match_binding_contract).toMatchObject({
      engine: "production-browser-wasm-v20",
      clock: "none",
      fixed_depth: 11,
      quiescence_depth: 10,
      unused_yaneuraou_assets_required: false,
    });
    expect(evidence.opening_contract).toMatchObject({
      required_openings: 384,
      opening_ply: 16,
      label_blind_input: true,
      one_source_game_per_opening: true,
      production_rules_apply_every_move: true,
      terminal_position_rejected: true,
      semantic_final_position_unique: true,
      pair_journal_created_by_preflight: false,
    });
  });

  it("allows only attempt zero, safe seeds, and parity-gated workers", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    expect(evidence.execution_contract).toMatchObject({
      attempt_index: 0,
      attempt_greater_than_zero_rejected_before_journal: true,
      non_integer_attempt_rejected_before_journal: true,
      seed_minimum: 1,
      seed_maximum: Number.MAX_SAFE_INTEGER,
      unsafe_seed_rejected_before_journal: true,
      pair_worker_candidates: [2, 4, 8, 12],
      pair_worker_validation_in_this_change:
        "benchmark-eligible-membership-only",
      benchmark_receipt_identity_bound_before_journal: false,
      selected_pair_workers_equality_bound_before_journal: false,
      safe_maximum_pair_workers: 12,
    });
    expect(evidence.worker_benchmark_contract).toMatchObject({
      pairs_per_round: 12,
      games_per_round: 24,
      total_pairs: 96,
      total_games: 192,
      idealized_worker_waves: 24,
      formal_384_pair_idealized_waves_at_12_workers: 32,
      repetitions_per_setting: 2,
      rounds: 8,
      two_sample_mean_representation:
        "exact-total-numerator-over-denominator-2",
      derived_throughput_is_selection_authority: false,
      selection_condition:
        "lowest-two-sample-total-elapsed-ns-after-exact-transcript-hash-equality",
      any_transcript_hash_drift_forbids_selection: true,
      any_technical_fault_forbids_selection: true,
      observed_peak_must_equal_requested_pair_workers: true,
      real_benchmark_executed: false,
      selected_pair_workers: null,
    });
  });

  it("keeps formal strength and live counters at zero in both languages", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    expect(evidence.status).toMatchObject({
      formal_pairs_started: 0,
      formal_games_started: 0,
      real_worker_benchmark_rounds: 0,
      live_weights_changed: false,
    });
    expect(evidence.nonclaims).toEqual({
      candidate_selected: false,
      formal_ab_executed: false,
      candidate_stronger: false,
      high_dan_calibrated: false,
      promotion_authorized: false,
      live_weights_changed: false,
    });
    for (const article of [
      read(japaneseArticleRelative),
      read(englishArticleRelative),
    ]) {
      expect(article).toContain("0 / 768");
      expect(article).toContain("[2, 4, 8, 12]");
      expect(article).toContain(
        "floodgate-formal-paired-ab-v2-p0-foundation-2026-07-20.json",
      );
    }
  });
});
