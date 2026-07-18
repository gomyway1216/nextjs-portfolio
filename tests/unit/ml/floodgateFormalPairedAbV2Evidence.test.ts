import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const amendmentRelative =
  "ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-amendment.json";
const registryRelative =
  "ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-registry.json";
const evidenceRelative =
  "docs/data/floodgate-formal-paired-ab-protocol-v2-2026-07-18.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-formal-paired-ab-protocol-v2.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-formal-paired-ab-protocol-v2.en.md";

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

describe("formal paired A/B v2 publication evidence", () => {
  it("pins the immutable v1 chain and current v2 records", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    for (const identity of Object.values(
      evidence.supersession_chain,
    ) as unknown[]) {
      if (
        typeof identity !== "object" ||
        identity === null ||
        !("path" in identity) ||
        !("bytes" in identity) ||
        !("sha256" in identity)
      ) {
        continue;
      }
      const record = identity as {
        path: string;
        bytes: number;
        sha256: string;
      };
      expect(bytesAndSha256(record.path)).toEqual({
        bytes: record.bytes,
        sha256: record.sha256,
      });
    }
  });

  it("makes the amendment SHA bind the complete decision rule", () => {
    const amendment = JSON.parse(read(amendmentRelative));
    const registry = JSON.parse(read(registryRelative));
    const evidence = JSON.parse(read(evidenceRelative));
    const rule = amendment.amendment.fixed_decision_rule;

    expect(rule).toEqual(registry.fixed_protocol);
    expect(rule).toMatchObject({
      pairs: 384,
      games: 768,
      bootstrap_seed: 20260710,
      bootstrap_replicates: 100000,
      one_sided_95_lower_rank: 5000,
      two_sided_95_lower_rank: 2500,
      maximum_attempts_per_experiment: 2,
      acceptance_statistic: "full-run-pair-bootstrap-only",
    });
    expect(evidence.fixed_protocol).toMatchObject({
      pairs: rule.pairs,
      games: rule.games,
      bootstrap_seed: rule.bootstrap_seed,
      bootstrap_replicates: rule.bootstrap_replicates,
      maximum_attempts_per_experiment: rule.maximum_attempts_per_experiment,
    });
  });

  it("records the cross-run optional-stopping controls without authority", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const registry = JSON.parse(read(registryRelative));

    expect(evidence.fixed_protocol).toMatchObject({
      maximum_attempts_per_experiment: 2,
      attempt_ledger:
        "append-only-all-attempt-fault-and-partial-result-identities",
      rerun_authorization:
        "at-most-one-new-run-from-technical-evidence-before-any-result-unblinding",
      second_fault:
        "experiment-stops-without-strength-conclusion-and-candidate-cannot-rerun",
    });
    expect(evidence.fixed_protocol.result_identity_binding).toEqual([
      "experiment_id",
      "run_id",
      "attempt_index",
      "attempt_ledger_sha256",
      "rerun_authorization_sha256",
      "match_binding_sha256",
    ]);
    expect(registry.enrollments.attempt_ledger).toBeNull();
    expect(registry.enrollments.rerun_authorization).toBeNull();
    expect(
      Object.values(registry.gates).every((value) => value === false),
    ).toBe(true);
  });

  it("keeps every real observation and live authority at zero", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.observations).toMatchObject({
      real_matches_executed: false,
      formal_experiments_observed: 0,
      formal_attempts_observed: 0,
      real_pairs_observed: 0,
      real_games_observed: 0,
      candidate_selected: false,
      strength_improved: false,
      high_dan_calibrated: false,
      external_calibration_games_observed: 0,
      live_weights_changed: false,
    });
    expect(evidence.registry_state).toMatchObject({
      execution_authorized: false,
      result_reader_authorized: false,
      promotion_authorized: false,
      production_weight_write_authorized: false,
    });
    expect(evidence.implementation).toMatchObject({
      match_launcher_added: false,
      weight_reader_added: false,
      holdout_reader_added: false,
      production_import_added: false,
    });
    expect(evidence.external_calibration_basis).toMatchObject({
      official_terms_url: "https://81dojo.com/jp/terms.html",
      official_rating_threshold_announcement_url:
        "https://81dojo.com/announcements/260411.html",
      software_account_prefix_required: "COM_",
      official_apps_only: true,
      "2026_five_dan_lower_rating": 2050,
      our_rule_is_an_81dojo_official_rule: false,
      rules_must_be_reverified_before_execution: true,
      external_games_observed: 0,
    });
  });

  it("keeps Japanese and English articles aligned with the machine record", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    const amendmentSha =
      evidence.supersession_chain.pre_result_amendment.sha256;
    const registrySha =
      evidence.supersession_chain.current_closed_v2_registry.sha256;

    for (const article of [japanese, english]) {
      expect(article).toContain("384");
      expect(article).toContain("768");
      expect(article).toContain(amendmentSha);
      expect(article).toContain(registrySha);
      expect(article).toContain("attempt");
      expect(article).toContain("unblind");
      expect(article).toContain("production");
      expect(article).toContain("https://81dojo.com/");
      expect(article).toContain("2050");
    }
    expect(japanese).toContain("追記専用");
    expect(english).toContain("append-only");
    expect(japanese).toContain(
      "blog-shogi-floodgate-formal-paired-ab-protocol-v2.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-formal-paired-ab-protocol-v2.md",
    );
  });
});
