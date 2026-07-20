import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-formal-paired-ab-v2-production-activation-foundation-2026-07-19.json";
const registryRelative =
  "ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-production-activation-registry.json";
const moduleRelative = "ml/formal_paired_ab_v2_production_activation.py";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.en.md";

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

describe("formal paired A/B v2 production activation foundation evidence", () => {
  it("pins the implementation and exact closed registry", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const registry = JSON.parse(read(registryRelative));

    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      expect(bytesAndSha256(artifact.path)).toEqual({
        bytes: artifact.bytes,
        sha256: artifact.sha256,
      });
    }
    expect(registry.schema).toBe(
      "shogi-floodgate-formal-paired-ab-v2-production-activation-registry-v1",
    );
    expect(registry.status).toBe("closed-awaiting-reviewed-enrollments");
    expect(
      Object.values(registry.enrollments).every((value) => value === null),
    ).toBe(true);
    expect(
      Object.values(registry.gates).every((value) => value === false),
    ).toBe(true);
  });

  it("records every required deterministic composition binding", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.protocol_binding).toMatchObject({
      pairs: 384,
      games_per_pair: 2,
      games: 768,
      candidate_colors: ["sente", "gote"],
      candidate_sente_games: 384,
      candidate_gote_games: 384,
      maximum_pair_workers: 6,
      opening_id_domain_matches_existing_local_launcher: true,
      game_id_domain_matches_existing_local_launcher: true,
      opening_manifest_schema_matches_existing_local_launcher: true,
      unique_positive_signed_64_bit_seed_per_pair: true,
    });
    expect(evidence.test_only_composition_binding).toMatchObject({
      candidate_weights_identity: true,
      stable_weights_identity: true,
      candidate_and_stable_must_differ: true,
      candidate_and_stable_paths_must_differ: true,
      canonical_openings_and_identity: true,
      activation_registry_identity: true,
      candidate_colors: true,
      time_control_content_identity: true,
      pair_workers_integer_1_through_6: true,
      match_adapter_identity: true,
      result_receipt_identity: true,
      retention_receipt_identity: true,
      rollback_receipt_identity: true,
      receipt_paths_and_digests_must_be_distinct: true,
      plain_json_only: true,
      canonical_relative_paths_only: true,
      seed_boundary_probes: [
        "duplicate",
        "boolean",
        "zero",
        "negative",
        "signed-64-bit-overflow",
      ],
      non_string_sfen_probes: ["null", "integer", "list"],
      exact_768_game_accounting: true,
      deterministic_binding_sha256: true,
      opens_artifact_files: false,
      executes_games: false,
      production_authority: false,
    });
  });

  it("keeps the production entry argumentless and disconnected", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const source = read(moduleRelative);

    expect(evidence.production_entry).toEqual({
      arguments_allowed: false,
      registry_path_caller_selectable: false,
      closed_exit_code: 2,
      closed_status: "STOP",
      closed_reason: "enrollments-closed",
      pairs_started: 0,
      games_started: 0,
      engine_processes_started: 0,
      network_requests: 0,
      live_weight_changes: 0,
    });
    expect(source).toContain("def argumentless_production_preflight()");
    expect(source).toContain("compose_formal_ab_v2_activation_core_for_tests");
    expect(source).not.toMatch(
      /^import (?:subprocess|socket|urllib|requests)\b/mu,
    );
    expect(evidence.implementation).toMatchObject({
      production_match_execution_api: false,
      caller_selected_registry_production_api: false,
      automatic_activation: false,
    });
  });

  it("records zero real execution and no strength claim", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(
      Object.values(evidence.execution_counters).every((value) => value === 0),
    ).toBe(true);
    expect(evidence.nonclaims).toEqual({
      candidate_selected: false,
      formal_ab_executed: false,
      strength_improved: false,
      high_dan_calibrated: false,
      promotion_authorized: false,
      production_weight_write_authorized: false,
      live_weights_changed: false,
    });
    expect(evidence.validation).toMatchObject({
      python_compile: "PASS",
      focused_tests_passed: 11,
      focused_tests_failed: 0,
      related_tests_passed: 48,
      related_tests_failed: 0,
      publication_evidence_tests_passed: 5,
      publication_evidence_tests_failed: 0,
      full_ml_stdlib_tests_passed: 204,
      full_ml_stdlib_tests_failed: 0,
      full_ml_stdlib_wall_seconds: 13.89,
      ruff: "PASS",
      prettier: "PASS",
      diff_check: "PASS",
      argumentless_command_status: "expected-STOP",
      argumentless_command_exit_code: 2,
      argumentless_games_started: 0,
      real_engine_used_by_tests: false,
      real_game_process_used_by_tests: false,
      real_weight_used_by_tests: false,
      network_used_by_tests: false,
    });
    expect(evidence.review).toMatchObject({
      final_independent_rereview: "PASS-P0-0-P1-0-P2-0",
      final_review_head: "ea56f82b44234a41243545fbb8e6960bb9b06010",
      final_review_tree: "a879fb9597320b83234d645cc9822c116e5e3e51",
      safe_to_review: true,
      unresolved_p0: 0,
      unresolved_p1: 0,
      unresolved_p2: 0,
      github_review_remediation: {
        thread_id: "PRRT_kwDOQbO82s6SIQd1",
        finding: "non-string-sfen-could-escape-before-explicit-type-check",
        revision: "35d0ca71bd5d60747667c3dad4e804b270cb3551",
        regression_probes: ["null", "integer", "list"],
        local_validation: "PASS",
        reply_url:
          "https://github.com/gomyway1216/nextjs-portfolio/pull/529#discussion_r3611694906",
        thread_state: "resolved",
      },
    });
  });

  it("keeps the Japanese and English explanations aligned", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    for (const article of [japanese, english]) {
      expect(article).toContain("384");
      expect(article).toContain("768");
      expect(article).toContain("CoreForTests");
      expect(article).toContain("result");
      expect(article).toContain("retention");
      expect(article).toContain("rollback");
      expect(article).toContain("time control");
      expect(article).toContain("STOP");
      expect(article).toContain("651359df");
      expect(article).toContain("35d0ca71");
      expect(article).toContain("P0=0");
      expect(article).toContain("P1=0");
      expect(article).toContain("P2=0");
      expect(article).toMatch(/no-?follow/iu);
    }
    expect(japanese).toContain("0 / 768局");
    expect(english).toContain("0 / 768 games");
    expect(japanese).toContain(
      "blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.md",
    );
  });
});
