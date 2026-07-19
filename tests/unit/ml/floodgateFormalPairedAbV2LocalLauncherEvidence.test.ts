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
    expect(
      bytesAndSha256(evidence.implementation_artifacts.launcher.path),
    ).toEqual({
      bytes: evidence.implementation_artifacts.launcher.bytes,
      sha256: evidence.implementation_artifacts.launcher.sha256,
    });
    expect(
      bytesAndSha256(evidence.implementation_artifacts.tests.path),
    ).toEqual({
      bytes: evidence.implementation_artifacts.tests.bytes,
      sha256: evidence.implementation_artifacts.tests.sha256,
    });
  });

  it("records exact local-only and append-only boundaries", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.implementation).toMatchObject({
      execution_boundary: "local-only-core-for-tests-no-production-runner",
      test_only_validation_core:
        "validate_ready_local_run_registry_core_for_tests",
      test_only_execution_core: "run_ready_local_formal_ab_v2_core_for_tests",
      production_ready_registry_identity: null,
      caller_selected_registry_production_api: false,
      production_match_execution_api: false,
      maximum_pair_workers: 6,
      automatic_run: false,
    });
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
      pair_events: [
        "pair-started",
        "game-completed",
        "game-completed",
        "pair-completed",
      ],
      complete_pair_replay: "forbidden",
      partial_pair_replay: "forbidden-stop",
      technical_fault: "terminal-for-run",
      accepted_resume_state: "complete-contiguous-prefix-from-pair-zero",
      repository_path_component_policy:
        "directory-descriptor-no-follow-every-component",
      intermediate_symlink: "reject",
      previous_event_sha256_chain: true,
      full_write_loop_required: true,
      created_journal_mode_checked_before_game: true,
      file_fsync_before_next_event: true,
      complete_journals_reparsed_before_result: true,
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
      attempt_ledger_identity_required: true,
      rerun_authorization_identity_required_for_attempt_one: true,
      attempt_artifacts_must_be_read_only_regular_inodes: true,
      bare_attempt_or_rerun_digest_accepted: false,
      attempt_ledger_semantics_bind_enrolled_experiment: true,
      attempt_one_requires_exact_prior_fault_and_blinded_authorization: true,
      pinned_registry_normal_checkout_mode_supported: true,
      pinned_registry_exact_identity_still_required: true,
      canonical_sfen_validator:
        "fresh_qat_parent_accounting_v2._normalized_sfen",
      core_for_tests_deterministic_options_exact: true,
      caller_supplied_arbitrary_options_accepted: false,
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
      production_ready_registry_identity_pinned: false,
      production_runner_implemented: false,
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
      review_state:
        "pr-review-remediation-validation-pass-rereview-pending",
      pull_request: 510,
      continuous_integration: "IN_PROGRESS",
    });
    expect(evidence.independent_review).toMatchObject({
      initial_state: "changes-required",
      accepted_adversarial_probe_classes_before_remediation: 6,
      rejected_adversarial_probe_classes_before_remediation: 4,
      remediation_state: "local-second-remediation-validation-pass",
      final_independent_rereview:
        "PENDING-AFTER-PR-REVIEW-REMEDIATION",
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
    expect(launcher).toContain("run_ready_local_formal_ab_v2_core_for_tests");
    expect(launcher).toContain(
      "_PINNED_READY_RUN_REGISTRY_IDENTITY: dict[str, Any] | None = None",
    );
    expect(launcher).toContain("candidate-identities-not-enrolled");
    expect(launcher).toContain('"pairs_started": 0');
    expect(launcher).toContain('"games_started": 0');
    expect(evidence.validation).toMatchObject({
      python_compile_status: "PASS",
      focused_tests_passed: 19,
      focused_tests_failed: 0,
      full_tests_passed: 157,
      full_tests_failed: 0,
      evidence_tests_passed: 5,
      evidence_tests_failed: 0,
      argumentless_command_exit: 2,
      argumentless_command_status: "STOP",
      argumentless_pairs_started: 0,
      argumentless_games_started: 0,
      real_game_process_used_by_tests: false,
      real_yaneuraou_used_by_tests: false,
      real_weight_used_by_tests: false,
      operator_abort_propagation_without_synthetic_fault_tested: true,
      journal_event_names_match_implementation: true,
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
      expect(article).toContain("CoreForTests");
      expect(article).toMatch(/no-?follow/);
      expect(article).toContain("2.10");
      expect(article).toContain("157");
      expect(article).toContain("13.68");
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
