import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-production-lease-recovery.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-production-lease-recovery.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-production-lease-recovery-2026-07-15.json",
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function assertNoDuplicateJsonObjectKeys(source: string): void {
  let offset = 0;

  function fail(message: string): never {
    throw new Error(`${message} at offset ${offset}`);
  }

  function skipWhitespace(): void {
    while (/\s/u.test(source[offset] ?? "")) offset += 1;
  }

  function parseString(): string {
    const start = offset;
    if (source[offset] !== '"') fail("Expected JSON string");
    offset += 1;

    while (offset < source.length) {
      const character = source[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset));
      }
      if (character === "\\") {
        offset += 2;
      } else {
        offset += 1;
      }
    }

    return fail("Unterminated JSON string");
  }

  function consumeLiteral(literal: string): void {
    if (!source.startsWith(literal, offset)) {
      fail(`Expected JSON literal ${literal}`);
    }
    offset += literal.length;
  }

  function parseNumber(): void {
    const match = source
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (match === null) fail("Expected JSON number");
    offset += match[0].length;
  }

  function parseArray(): void {
    offset += 1;
    skipWhitespace();
    if (source[offset] === "]") {
      offset += 1;
      return;
    }

    while (true) {
      parseValue();
      skipWhitespace();
      if (source[offset] === "]") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") fail("Expected comma in JSON array");
      offset += 1;
      skipWhitespace();
    }
  }

  function parseObject(): void {
    offset += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (source[offset] === "}") {
      offset += 1;
      return;
    }

    while (true) {
      const keyOffset = offset;
      const key = parseString();
      if (keys.has(key)) {
        throw new Error(
          `Duplicate JSON object key ${JSON.stringify(key)} at offset ${keyOffset}`,
        );
      }
      keys.add(key);
      skipWhitespace();
      if (source[offset] !== ":") fail("Expected colon after JSON object key");
      offset += 1;
      parseValue();
      skipWhitespace();
      if (source[offset] === "}") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") fail("Expected comma in JSON object");
      offset += 1;
      skipWhitespace();
    }
  }

  function parseValue(): void {
    skipWhitespace();
    switch (source[offset]) {
      case "{":
        parseObject();
        return;
      case "[":
        parseArray();
        return;
      case '"':
        parseString();
        return;
      case "t":
        consumeLiteral("true");
        return;
      case "f":
        consumeLiteral("false");
        return;
      case "n":
        consumeLiteral("null");
        return;
      default:
        parseNumber();
    }
  }

  parseValue();
  skipWhitespace();
  if (offset !== source.length) fail("Unexpected content after JSON value");
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

function collectObjectKeys(value: unknown, keys: Set<string>): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectObjectKeys(entry, keys);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    keys.add(key);
    collectObjectKeys(entry, keys);
  }
}

describe("Floodgate v7 production lease recovery public evidence", () => {
  it("has no duplicate key in any JSON object", () => {
    expect(() =>
      assertNoDuplicateJsonObjectKeys(readText(EVIDENCE_PATH)),
    ).not.toThrow();
    expect(() =>
      assertNoDuplicateJsonObjectKeys('{"outer":{"same":1,"same":2},"same":3}'),
    ).toThrow(/Duplicate JSON object key "same"/u);
    expect(() =>
      assertNoDuplicateJsonObjectKeys('{"escaped":1,"\\u0065scaped":2}'),
    ).toThrow(/Duplicate JSON object key "escaped"/u);
  });

  it("keeps the Japanese and English articles at the same exact twelve-section boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expected = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(numberedSections(japanese)).toEqual(expected);
    expect(numberedSections(english)).toEqual(expected);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-production-lease-recovery.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-production-lease-recovery.md",
    );
    for (const marker of [
      "execution_boundary",
      "final private namespace + retired/quarantine validation under lock",
      "after-staging-unlink-before-quarantine-sync",
      "F/T",
      "T/T",
      "T/F",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
    expect(japanese).not.toContain("moduleゑ");
  });

  it("records local evidence separately from zero real recovery and production execution", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence.schema).toBe(
      "shogi-floodgate-v7-production-lease-recovery-evidence-v1",
    );
    expect(evidence.evidence_date).toBe("2026-07-15");
    expect(evidence.evidence_scope).toMatchObject({
      class: "local-source-test-and-documentation-evidence-only",
      production_state_freshly_observed_for_this_evidence: false,
    });
    expect(evidence.validation.focused_outer_composition_current_tree).toEqual({
      status: "pass",
      tree_classification:
        "latest-partial-publication-repair-included-focused-tree",
      includes_fourth_partial_publication_repair: true,
      files: 4,
      tests: 197,
      passed: 197,
      failed: 0,
      used_as_final_combined_evidence: false,
    });
    expect(evidence.validation.previous_focused_outer_composition).toEqual({
      status: "pass",
      tree_classification:
        "prior-snapshot-before-fourth-partial-publication-repair",
      includes_fourth_partial_publication_repair: false,
      files: 4,
      tests: 193,
      passed: 193,
      failed: 0,
      used_as_final_combined_evidence: false,
    });
    expect(evidence.validation.final_current_tree).toEqual({
      status: "pass",
      tree_classification:
        "latest-partial-publication-repair-included-final-combined-tree",
      includes_latest_additional_independent_review_repairs: true,
      includes_fourth_partial_publication_repair: true,
      node_version: "v22.13.0",
      files: 7,
      tests: 348,
      passed: 348,
      failed: 0,
      vitest_duration_seconds: 8.14,
      wall_time_seconds: 8.49,
      maximum_resident_set_bytes: 298811392,
      swaps: 0,
      final_combined_rerun_completed: true,
      used_as_final_evidence: true,
    });
    expect(evidence.validation.post_final_validation_review_repairs).toEqual({
      implementation_status: "implemented",
      repairs: 4,
      new_targeted_regression_tests_implemented: 10,
      final_combined_rerun_status: "pass",
      used_as_final_evidence: true,
    });
    expect(evidence.validation.previous_combined_stable_tree).toMatchObject({
      tree_classification:
        "prior-snapshot-before-fourth-partial-publication-repair",
      files: 7,
      tests: 344,
      passed: 344,
      failed: 0,
      used_as_final_evidence: false,
    });
    expect(evidence.validation.earlier_combined_stable_tree).toMatchObject({
      tests: 337,
      passed: 337,
      used_as_final_evidence: false,
    });
    expect(evidence.validation.full_vitest).toEqual({
      status: "pass",
      tree_classification:
        "latest-partial-publication-repair-included-final-full-regression-tree",
      includes_latest_additional_independent_review_repairs: true,
      includes_fourth_partial_publication_repair: true,
      node_version: "v22.13.0",
      files: 138,
      tests: 2601,
      passed: 2601,
      failed: 0,
      vitest_duration_seconds: 153.22,
      wall_time_seconds: 153.67,
      maximum_resident_set_bytes: 4325474304,
      swaps: 0,
      full_rerun_completed: true,
      used_as_final_evidence: true,
    });
    expect(evidence.validation.previous_full_vitest).toEqual({
      status: "pass",
      tree_classification:
        "prior-snapshot-before-fourth-partial-publication-repair",
      includes_latest_additional_independent_review_repairs: false,
      includes_fourth_partial_publication_repair: false,
      node_version: "v22.13.0",
      files: 138,
      tests: 2597,
      passed: 2597,
      failed: 0,
      vitest_duration_seconds: 159.26,
      wall_time_seconds: 159.68,
      maximum_resident_set_bytes: 4373102592,
      swaps: 0,
      used_as_final_evidence: false,
    });
    expect(evidence.validation.earlier_full_vitest).toEqual({
      status: "pass",
      tree_classification:
        "prior-tree-before-latest-additional-independent-review-repairs",
      includes_latest_additional_independent_review_repairs: false,
      includes_fourth_partial_publication_repair: false,
      node_version: "v22.13.0",
      files: 138,
      tests: 2590,
      passed: 2590,
      failed: 0,
      vitest_duration_seconds: 152.87,
      wall_time_seconds: 153.53,
      maximum_resident_set_bytes: 4038459392,
      swaps: 0,
      used_as_final_evidence: false,
    });
    expect(evidence.validation.intermediate_attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: "invalid-validation-runtime",
          tests: 280,
          passed: 271,
          failed: 9,
          implementation_regression: false,
          used_as_final_evidence: false,
        }),
        expect.objectContaining({
          classification: "correct-runtime-implementation-in-progress",
          tests: 280,
          passed: 278,
          failed: 2,
          runtime_behavior_failures: 0,
          used_as_final_evidence: false,
        }),
        expect.objectContaining({
          classification: "post-independent-review-focused-outer-composition",
          tests: 187,
          passed: 187,
          failed: 0,
          used_as_final_evidence: false,
        }),
        expect.objectContaining({
          classification: "independent-focused-stage-durability-rerun",
          tests: 147,
          passed: 147,
          failed: 0,
          wall_time_seconds: 8.88,
          used_as_final_evidence: false,
        }),
      ]),
    );
    expect(evidence.implementation.outer_gate_lease).toMatchObject({
      fixed_zero_argument_production_owners: 3,
      generic_production_gate_or_callback_exported: false,
      fixed_runner_loaded_with_captured_commonjs_require_after_active_publication: true,
      dynamic_import_used_for_fixed_runner: false,
      production_execution_boundary:
        "production-fixed-current-euid-home-native-descriptor-close",
      test_execution_boundary:
        "test-only-injected-home-key-lock-helper-and-descriptor-close",
      production_runner_accepts_test_execution_boundary: false,
      lockf_contention_exit_status: 75,
      other_nonzero_lockf_status_classified_as_contention: false,
      descriptor_close_completion_tracked_independently_from_metadata_removal: true,
      unreleased_descriptor_receives_finally_close_retry: true,
      final_namespace_revalidated_while_os_lock_is_held: true,
      final_namespace_validation_precedes_descriptor_close: true,
    });
    expect(evidence.implementation.connector_capability).toMatchObject({
      ordinary_caller_receives_capability: false,
      unclaimed_production_capability_accepts_outer_success: false,
      cloned_forged_wrong_gate_or_double_claim_accepted: false,
    });
    expect(evidence.implementation.partial_publication_progress).toEqual({
      monotonic_failure_state_tracking: true,
      tuple_order: [
        "authenticated_lease_published",
        "quarantine_blocks_all_gates",
      ],
      states: [
        {
          phase: "staging-created-before-active-link",
          tuple: [false, true],
        },
        {
          phase: "active-linked-before-staging-removal-directory-durable",
          tuple: [true, true],
        },
        {
          phase: "staging-removal-quarantine-directory-durable",
          tuple: [true, false],
        },
      ],
      injected_failpoints: [
        "after-staging-create",
        "after-active-link-before-control-sync",
        "after-durable-active-publish-before-staging-cleanup",
        "after-staging-unlink-before-quarantine-sync",
      ],
      local_test_hook_injection_only: true,
      real_process_crash_tested: false,
      real_reboot_tested: false,
    });
    expect(
      evidence.implementation.independent_review_findings_and_fixes,
    ).toMatchObject({
      generic_production_callback_capability_issuer: {
        found: true,
        fixed: true,
        regression_covered: true,
      },
      manual_public_raw_failure_surface: { found: true, fixed: true },
      preexisting_signal_listener_absorbed_default_death: {
        found: true,
        fixed: true,
      },
      noncontention_lockf_status_misclassified_as_busy: {
        found: true,
        fixed: true,
        only_status_75_is_contention: true,
      },
      closed_retired_negative_coverage_gap: { found: true, fixed: true },
      darwin_missing_lock_helper_zero_test_green: {
        found: true,
        fixed: true,
      },
      test_injected_close_could_claim_production_release: {
        found: true,
        fixed: true,
        production_and_test_execution_boundaries_separated: true,
        runner_rejects_test_boundary: true,
        regression_covered: true,
      },
      final_namespace_validation_after_lock_release_race: {
        found: true,
        fixed: true,
        final_validation_moved_under_lock: true,
        successor_owner_race_covered: true,
      },
      early_phase_raw_failure_and_close_settlement_gap: {
        found: true,
        fixed: true,
        phase_aware_sanitation_boundary: true,
        descriptor_close_tracked_independently: true,
      },
      partial_publication_progress_underreported: {
        found: true,
        fixed: true,
        monotonic_false_true_true_true_true_false_states: true,
        injected_publish_failpoints_covered: 4,
        real_crash_or_reboot_claimed: false,
      },
      fixed_manual_operator_orchestrator_absent: {
        found: true,
        fixed: false,
        recorded_as_production_gate_blocker: true,
      },
    });
    expect(evidence.implementation.normal_retirement).toMatchObject({
      final_private_directory_identities_revalidated_under_lock: true,
      final_exact_control_entry_set_revalidated_under_lock: true,
      final_active_absence_and_empty_quarantine_revalidated_under_lock: true,
      successor_owner_can_start_before_predecessor_final_validation: false,
    });
    expect(evidence.implementation.runner_and_cli_integration).toMatchObject({
      outer_success_requires_production_execution_boundary: true,
      test_execution_boundary_accepted_as_production_success: false,
      all_outer_owner_phases_share_typed_sanitation_boundary: true,
    });
    expect(evidence.validation).toMatchObject({
      darwin_ci: {
        fixed_lock_helper_executable_required: true,
        outer_gate_adversarial_suite_required: true,
        missing_helper_can_produce_zero_test_green: false,
      },
      static_validation: {
        typescript: "pass",
        eslint_errors: 0,
        eslint_warnings: 0,
        prettier: "pass",
        git_diff_check: "pass",
        intermediate_attempts: [
          {
            classification: "expanded-changed-file-prettier-check",
            status: "fail",
            formatting_only: true,
            files_with_differences: 1,
            implementation_behavior_regression: false,
            used_as_final_evidence: false,
          },
          {
            classification: "post-format-expanded-prettier-and-diff-rerun",
            status: "pass",
            formatting_only: true,
            files_with_differences: 0,
            used_as_final_evidence: true,
          },
        ],
      },
    });
    expect(evidence.production_execution).toMatchObject({
      real_authenticated_stale_recoveries: 0,
      real_reboot_recoveries: 0,
      production_prefix_100_gate_executions_by_this_change: 0,
      production_prefix_500_gate_executions_by_this_change: 0,
      production_final_24000_gate_executions_by_this_change: 0,
      real_teacher_processes_started_by_this_change: 0,
      teacher_labels_created_by_this_change: 0,
      checkpoint_finalizations_by_this_change: 0,
      optimizer_steps_by_this_change: 0,
      training_runs_by_this_change: 0,
      candidate_weights_created_by_this_change: 0,
      formal_ab_matches_by_this_change: 0,
      live_evaluation_activations_by_this_change: 0,
      external_rank_observations_by_this_change: 0,
      live_weight_changed_by_this_change: false,
      current_live_state_freshly_observed_for_this_evidence: false,
      playing_strength_changed_by_this_evidence: false,
    });
    expect(evidence.implementation.trust_boundary).toEqual({
      loaded_application_code_trusted: true,
      commonjs_module_cache_trusted: true,
      ordinary_supported_api_accepts_arbitrary_production_callback: false,
      hostile_same_process_code_defended: false,
      hostile_require_cache_or_export_replacement_defended: false,
      arbitrary_same_process_root_key_filesystem_or_process_access_defended: false,
      separate_uid_or_isolated_broker_required_for_stronger_boundary: true,
    });
    expect(evidence.blocking_residual_work).toMatchObject({
      production_gate_hold_remains: true,
      authenticated_inner_stage_metadata_required: true,
      inner_stage_reconciliation_required: true,
      quarantine_acknowledgement_and_release_authority_required: true,
      real_restart_and_reboot_drill_required: true,
      speed_priority_minimum_safe_recovery_reassessment: {
        estimate_class:
          "preliminary-planning-range-not-measured-runtime-or-deadline",
        one_shot_parallel_wall_hours: { minimum: 8, maximum: 16 },
        scope_frozen: false,
        equivalent_to_full_hardened_recovery: false,
        safety_requirements_may_be_removed_for_speed: false,
        reassessed_after_this_pull_request: true,
        completion_deadline_claimed: false,
      },
      full_hardened_recovery_design_estimate: {
        estimate_class: "planning-estimate-not-measured-runtime-or-deadline",
        engineer_hours: { minimum: 43, maximum: 67 },
        parallel_dependency_aware_wall_hours: { minimum: 31, maximum: 56 },
        assumes_parallel_execution: true,
        scope_reduction_can_change_estimate: true,
        completion_deadline_claimed: false,
      },
      real_macos_reboot_drill_and_production_preflight_estimate: {
        estimate_class: "planning-estimate-not-measured-runtime-or-deadline",
        parallel_wall_hours: { minimum: 3, maximum: 6 },
        real_production_gate_runtime_included: false,
        completion_deadline_claimed: false,
      },
      stable_high_dan_strength_established: false,
    });
  });

  it("keeps private operational values out of every public artifact", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const evidenceText = readText(EVIDENCE_PATH);
    const evidence = JSON.parse(evidenceText);
    const combined = `${japanese}\n${english}\n${evidenceText}`;

    const forbiddenValuePatterns = [
      /\/Users\//u,
      /\/home\//u,
      /\b[0-9a-f]{64}\b/u,
      /private-raw-connector-canary/u,
      /signal-test\.local/u,
      /outer-gate-test\.local/u,
    ];
    for (const pattern of forbiddenValuePatterns) {
      expect(combined).not.toMatch(pattern);
    }

    const keys = new Set<string>();
    collectObjectKeys(evidence, keys);
    for (const privateValueKey of [
      "uid",
      "pid",
      "hostname",
      "nonce",
      "mac",
      "dev",
      "ino",
      "sha256",
      "raw_error",
    ]) {
      expect(keys.has(privateValueKey)).toBe(false);
    }
    expect(evidence.evidence_scope).toMatchObject({
      personal_environment_values_included: false,
      owner_or_machine_identity_values_included: false,
      filesystem_identity_values_included: false,
      private_registry_values_included: false,
      private_authentication_or_entropy_values_included: false,
      key_material_or_instance_values_included: false,
      raw_connector_receipt_included: false,
      raw_failure_included: false,
    });
  });
});
