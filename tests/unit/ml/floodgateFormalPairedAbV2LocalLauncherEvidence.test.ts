import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-formal-paired-ab-v2-local-launcher-2026-07-18.json";
const registryRelative =
  "ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-registry.json";
const launcherRelative = "ml/formal_paired_ab_local_launcher.py";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.en.md";

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

describe("formal paired A/B v2 local launcher publication evidence", () => {
  it("binds the existing plan, closed registry, and amendment", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const registry = JSON.parse(read(registryRelative));

    expect(bytesAndSha256(evidence.protocol_binding.source_plan.path)).toEqual({
      bytes: evidence.protocol_binding.source_plan.bytes,
      sha256: evidence.protocol_binding.source_plan.sha256,
    });
    expect(
      bytesAndSha256(evidence.protocol_binding.source_closed_v2_registry.path),
    ).toEqual({
      bytes: evidence.protocol_binding.source_closed_v2_registry.bytes,
      sha256: evidence.protocol_binding.source_closed_v2_registry.sha256,
    });
    expect(registry.supersession.amendment.sha256).toBe(
      evidence.protocol_binding.protocol_amendment_sha256,
    );
    expect(
      Object.values(registry.enrollments).every((value) => value === null),
    ).toBe(true);
    expect(
      Object.values(registry.gates).every((value) => value === false),
    ).toBe(true);
  });

  it("records exact local-only and append-only boundaries", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.implementation.maximum_pair_workers).toBe(6);
    expect(evidence.protocol_binding).toMatchObject({
      required_pairs: 384,
      required_games: 768,
      candidate_colors_per_pair: ["sente", "gote"],
      existing_engine_protocol: "USI",
      existing_opening_protocol: "SFEN+USI",
    });
    expect(evidence.resume_contract).toMatchObject({
      receipt_directory_mode: "0700",
      pair_journal_mode: "0600",
      complete_pair_replay: "forbidden",
      partial_pair_replay: "forbidden-stop",
      technical_fault: "terminal-for-run",
      accepted_resume_state: "complete-contiguous-prefix-from-pair-zero",
      previous_event_sha256_chain: true,
      file_fsync_before_next_event: true,
      directory_entry_power_loss_durability_claimed: false,
      same_uid_malicious_tamper_proof_claimed: false,
    });
    expect(evidence.safety).toMatchObject({
      local_only: true,
      network: false,
      aws: false,
      external_calibration: false,
      live_weight_write: false,
      automatic_run: false,
    });
  });

  it("keeps every real execution and authority counter at zero", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(
      Object.values(evidence.execution_counters).every((value) => value === 0),
    ).toBe(true);
    expect(evidence.enrollment_state).toMatchObject({
      candidate_weights_enrolled: 0,
      stable_weights_enrolled: 0,
      real_opening_manifests_enrolled: 0,
      real_match_bindings_enrolled: 0,
      real_local_match_adapters_enrolled: 0,
      ready_registry_checked_in: false,
      argumentless_ready_core_route_implemented: false,
    });
    expect(evidence.nonclaims).toEqual({
      formal_ab_executed: false,
      candidate_selected: false,
      strength_improved: false,
      high_dan_calibrated: false,
      promotion_authorized: false,
      production_weight_write_authorized: false,
      live_weights_changed: false,
    });
    expect(evidence.implementation_anchor).toMatchObject({
      review_state: "local-validation-pass-independent-review-pending",
      pull_request: null,
      continuous_integration: "NOT_RUN",
    });
  });

  it("publishes an argumentless command whose current path stops at zero", () => {
    const packageJson = JSON.parse(read("package.json"));
    const launcher = read(launcherRelative);
    const evidence = JSON.parse(read(evidenceRelative));

    expect(packageJson.scripts["shogi:formal-ab-v2-local"]).toBe(
      "python3 ml/formal_paired_ab_local_launcher.py",
    );
    expect(launcher).toContain("argumentless_closed_preflight");
    expect(launcher).toContain("candidate-identities-not-enrolled");
    expect(launcher).toContain('"pairs_started": 0');
    expect(launcher).toContain('"games_started": 0');
    expect(evidence.validation).toMatchObject({
      focused_tests_passed: 10,
      focused_tests_failed: 0,
      full_tests_passed: 148,
      full_tests_failed: 0,
      argumentless_command_exit: 2,
      argumentless_command_status: "STOP",
      argumentless_pairs_started: 0,
      argumentless_games_started: 0,
      real_game_process_used_by_tests: false,
      real_yaneuraou_used_by_tests: false,
      real_weight_used_by_tests: false,
    });
  });

  it("keeps the Japanese and English articles aligned with the machine record", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    for (const article of [japanese, english]) {
      expect(article).toContain("384");
      expect(article).toContain("768");
      expect(article).toContain("USI");
      expect(article).toContain("SFEN+USI");
      expect(article).toContain("AWS");
      expect(article).toContain("0.87");
      expect(article).toContain("148");
      expect(article).toContain("11.75");
      expect(article).toContain("STOP");
    }
    expect(japanese).toContain("追記専用");
    expect(japanese).toContain("実対局はまだ0局");
    expect(english).toContain("append-only");
    expect(english).toContain("zero real games");
    expect(japanese).toContain(
      "blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.md",
    );
  });
});
