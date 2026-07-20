import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-formal-paired-ab-v2-worker-benchmark-bridge-2026-07-20.json";
const japaneseArticleRelative =
  "docs/blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.md";
const englishArticleRelative =
  "docs/blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.en.md";

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

describe("formal paired A/B v2 worker benchmark bridge evidence", () => {
  it("content-addresses the reviewed implementation and pinned registry", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      expect(bytesAndSha256(artifact.path)).toEqual({
        bytes: artifact.bytes,
        sha256: artifact.sha256,
      });
    }
    expect(evidence.authority.registry_identity).toMatchObject(
      evidence.implementation_artifacts.benchmark_registry,
    );
  });

  it("records the exact deterministic local benchmark contract", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    expect(evidence.benchmark_contract).toMatchObject({
      worker_candidates: [2, 4, 8, 12],
      round_sequence: [2, 4, 8, 12, 12, 8, 4, 2],
      pairs_per_round: 12,
      games_per_round: 24,
      rounds: 8,
      total_pairs: 96,
      total_games: 192,
      repetitions_per_setting: 2,
      maximum_pair_workers: 12,
      maximum_engine_processes: 24,
      technical_faults_allowed: 0,
      observed_peak_must_equal_requested_pair_workers: true,
    });
    expect(evidence.authority).toMatchObject({
      production_entry_argumentless: true,
      caller_selected_registry: false,
      runtime_source_identities_required: 26,
      post_run_source_revalidation_required: true,
      os_account_home_required: true,
      caller_home_override_allowed: false,
      formal_ready_requires_receipt_identity: true,
      formal_ready_requires_selected_worker_equality: true,
    });
  });

  it("keeps benchmark, formal, cloud, and live counters closed", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    expect(evidence.status).toEqual({
      benchmark_registry: "BLOCKED",
      benchmark_rounds_started: 0,
      benchmark_rounds_required: 8,
      benchmark_pairs_started: 0,
      benchmark_games_started: 0,
      formal_pairs_started: 0,
      formal_games_started: 0,
      formal_games_required: 768,
      candidate_selected: false,
      live_weights_changed: false,
    });
    expect(evidence.safety).toEqual({
      local_only: true,
      network: false,
      cloud: false,
      aws: false,
      gcp: false,
      formal_pair_journal_access: false,
      live_weight_write: false,
    });
    expect(evidence.nonclaims).toEqual({
      benchmark_executed: false,
      formal_ab_executed: false,
      candidate_stronger: false,
      high_dan_calibrated: false,
      promotion_authorized: false,
      live_weights_changed: false,
    });
  });

  it("keeps the Japanese and English reports mutually linked and honest", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    for (const article of [japanese, english]) {
      expect(article).toContain("0 / 8");
      expect(article).toContain("0 / 768");
      expect(article).toContain("[2, 4, 8, 12]");
      expect(article).toContain(
        "floodgate-formal-paired-ab-v2-worker-benchmark-bridge-2026-07-20.json",
      );
    }
    expect(japanese).toContain(
      "blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.en.md",
    );
    expect(english).toContain(
      "blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.md",
    );
  });
});
