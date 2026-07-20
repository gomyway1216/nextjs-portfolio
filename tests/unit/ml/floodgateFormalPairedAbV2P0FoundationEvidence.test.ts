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
  it("content-addresses the implementation artifacts", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      expect(bytesAndSha256(artifact.path)).toEqual({
        bytes: artifact.bytes,
        sha256: artifact.sha256,
      });
    }
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
      seed_minimum: 1,
      seed_maximum: Number.MAX_SAFE_INTEGER,
      unsafe_seed_rejected_before_journal: true,
      pair_worker_candidates: [2, 4, 8, 12],
      safe_maximum_pair_workers: 12,
    });
    expect(evidence.worker_benchmark_contract).toMatchObject({
      repetitions_per_setting: 3,
      rounds: 12,
      any_transcript_hash_drift_forbids_selection: true,
      any_technical_fault_forbids_selection: true,
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
