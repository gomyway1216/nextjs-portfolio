import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-fresh-prefix-100-one-shot-2026-07-16.json",
);
const PACKAGE_JSON_PATH = path.join(REPOSITORY_ROOT, "package.json");
const CI_WORKFLOW_PATH = path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml");

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
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
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset));
      }
      offset += source[offset] === "\\" ? 2 : 1;
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

describe("Floodgate v7 fresh prefix-100 one-shot public evidence", () => {
  it("has no duplicate JSON object key", () => {
    expect(() =>
      assertNoDuplicateJsonObjectKeys(readText(EVIDENCE_PATH)),
    ).not.toThrow();
    expect(() =>
      assertNoDuplicateJsonObjectKeys('{"same":1,"same":2}'),
    ).toThrow(/Duplicate JSON object key "same"/u);
  });

  it("keeps the Japanese and English articles at the same twelve-section boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expected = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(numberedSections(japanese)).toEqual(expected);
    expect(numberedSections(english)).toEqual(expected);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.md",
    );
    for (const marker of [
      "gate_invocation_authorized = false",
      "outer-active-durable",
      "stage-lease-durable",
      "checkpoint-first-byte-written",
      "/private/tmp",
      "P1",
      "P2",
      "NO-GO",
      "exactly once",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
    expect(japanese).toContain("write後・fsync前に1 byteがvisible");
    expect(english).toContain("visible after write but before fsync");
    expect(japanese).toContain("24,000 / 4,800 / 4,800");
    expect(english).toContain("24,000 / 4,800 / 4,800");
    expect(japanese).toContain("2,121,074 / 425,344 / 413,221");
    expect(english).toContain("2,121,074 / 425,344 / 413,221");
    expect(japanese).toContain("named `lstat`");
    expect(english).toContain("named-`lstat`");
    expect(japanese).toContain("local successful caseは18");
    expect(english).toContain("18 local cases succeeded");
    expect(japanese).toContain("153 / 153 PASS");
    expect(english).toContain("passed 153 / 153");
    expect(japanese).toContain("2,680 / 2,680 PASS");
    expect(english).toContain("passed 2,680 / 2,680");
    expect(japanese).toContain("1 runあたり4件");
    expect(english).toContain(
      "four added failure-path child-reap regressions per run",
    );
    expect(japanese).toContain("PR #471はready / open");
    expect(english).toContain("PR #471 is ready and open");
    expect(japanese).toContain("real production preflight command 1");
    expect(english).toContain("one real production preflight command");
    expect(japanese).toContain("295,620,795 bytes");
    expect(english).toContain("295,620,795 bytes");
    expect(japanese).toContain("固定`registry.json`が存在しなかった");
    expect(english).toContain("fixed `registry.json` was absent");
  });

  it("pins the package and Darwin CI source contract without invoking a production package command", () => {
    const packageJson = JSON.parse(readText(PACKAGE_JSON_PATH));
    const scripts = packageJson.scripts as Record<string, unknown>;
    const ci = readText(CI_WORKFLOW_PATH);
    const nativeLauncher =
      '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-v7-production-native-launcher.jxa"';

    expect(scripts["shogi:floodgate-v7-production-prefix-100-preflight"]).toBe(
      `${nativeLauncher} prefix-100-read-only-preflight`,
    );
    expect(scripts["shogi:floodgate-v7-production-prefix-100-kill-drill"]).toBe(
      `${nativeLauncher} prefix-100-disposable-kill-drill`,
    );
    expect(scripts["shogi:floodgate-v7-production-connector-prefix-100"]).toBe(
      `${nativeLauncher} durable-prefix-100`,
    );

    expect(
      ci.match(/node-version: "22\.13\.0"/gu)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(ci).toContain("run: test -x /usr/bin/lockf");
    expect(ci).toContain("run: test -x /usr/bin/caffeinate");
    expect(ci).toContain(
      "run: test -x /usr/bin/osascript && test -x /usr/sbin/lsof && test -x /bin/ps",
    );
    expect(ci).toContain(
      "tests/unit/ml/floodgateV7ProductionPrefix100Preflight.test.ts tests/unit/ml/floodgateV7ProductionPrefix100PreflightCli.test.ts",
    );
    expect(ci).toContain(
      "tests/unit/ml/floodgateV7ProductionPrefix100KillDrill.test.ts tests/unit/ml/floodgateV7ProductionPrefix100KillDrillCli.test.ts",
    );
    expect(ci).not.toMatch(/run:\s+npm run shogi:floodgate-v7-production-/u);
  });

  it("records NO-GO separately from read-only audits and zero write or gate execution", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-v7-fresh-prefix-100-one-shot-evidence-v1",
      evidence_date: "2026-07-16",
      evidence_scope: {
        class:
          "source-test-documentation-and-read-only-production-audit-evidence-before-production-prefix-100",
        production_state_freshly_observed_for_this_evidence: true,
        production_private_namespace_read_for_this_evidence: true,
        production_private_namespace_read_class:
          "current-user-ancestor-path-metadata-binding-and-readiness-only",
        production_registry_read_for_this_evidence: false,
        production_namespace_or_file_content_mutated_for_this_evidence: false,
        production_gate_invocation_authorized_by_this_evidence: false,
      },
      prerequisite_delivery: {
        pull_request: 470,
        state: "merged",
        merge_method: "regular-merge-commit",
        production_prefix_100_executed_by_prerequisite: false,
      },
      go_no_go: {
        decision_for_production_prefix_100: "NO-GO",
        reason:
          "fixed-registry-json-absent-pr-471-not-merged-and-same-lock-one-shot-owner-not-present",
        public_preflight_receipt_is_gate_authority: false,
        success_contract_requires_all_checks_and_terminal_revalidations_in_one_outer_lock_held_observation: true,
        all_required_checks_and_terminal_revalidations_passed_in_actual_observation: false,
        actual_preflight_success_receipt_observed: false,
        multi_namespace_observation_is_atomic: false,
        conditions: {
          reviewed_merged_head: "not-merged-pr-471-ready-open",
          exact_node_22_13_0: "pass-observed-by-zero-argument-preflight-cli",
          approved_enrollment_registry_and_current_key_binding:
            "approved-current-binding-read-only-cli-pass-but-fixed-registry-json-absent",
          production_readiness:
            "teacher-and-input-assets-pass-but-gate-readiness-incomplete",
          common_outer_lock_free: "not-reached-fixed-registry-json-absent",
          fixed_runs_root_private_and_exactly_empty:
            "observed-absent-not-valid-private-empty-root",
          stage_destination_inner_lease_work_and_checkpoint_absent:
            "path-metadata-observed-absent-under-lock-validation-not-reached",
          outer_active_quarantine_pending_and_unknown_zero:
            "under-lock-validation-not-reached",
          double_held_descriptor_snapshot_matched:
            "not-reached-fixed-registry-json-absent",
          six_disposable_process_death_cases_passed:
            "not-executed-as-reviewed-command",
          monitor_and_stop_owner_assigned: "not-recorded",
        },
        blocking_facts: {
          fixed_registry_json_absent: true,
          pr_471_merged: false,
          same_lock_one_shot_owner_present: false,
        },
        unknown_or_false_condition_result: "NO-GO",
        failure_signal_timeout_or_receipt_mismatch_retry: false,
        successful_prefix_100_automatically_authorizes_prefix_500: false,
      },
    });
    expect(evidence.implementation.read_only_preflight).toMatchObject({
      contract_success_status:
        "fresh-zero-work-prefix-100-read-only-preconditions-observed",
      fixed_zero_argument_public_owner: true,
      complete_observation_requires_production_outer_lock_held: true,
      private_outer_anchor: {
        effective_user_identity_bound: true,
        canonical_home_bound: true,
        registry_byte_count_bound: true,
        registry_digest_bound: true,
        registry_device_and_inode_bound: true,
        private_anchor_values_exported: false,
      },
      inner_held_registry_revalidation: {
        outer_anchor_matches_inner_user_and_home: true,
        read_only_descriptor_start_revalidated: true,
        read_only_descriptor_end_revalidated: true,
        identity_bytes_and_digest_revalidated: true,
        cross_home_or_registry_mix_accepted: false,
      },
      expected_approved_binding: {
        initial_approved_claim_matched_registry: true,
        initial_claim_retained_as_private_expected_binding: true,
        approved_record_reloaded_and_claimed: true,
        reloaded_approved_matched_fresh_current_key: true,
        initial_and_reloaded_approved_bindings_matched: true,
        expected_binding_exported: false,
      },
      create_only_or_no_clobber_contract_changed: false,
      multi_namespace_observation_is_one_atomic_filesystem_transaction: false,
      multi_namespace_observation_fail_closed_and_revalidated: true,
      current_process_loaded_code_and_same_euid_trusted: true,
      production_namespace_or_file_content_mutated: false,
      gate_invocation_authorized_by_receipt: false,
      receipt_reuse_authorizes_later_gate: false,
      production_preflight_command_executed_for_this_evidence: true,
    });
    expect(evidence.implementation.delivery_state).toBe(
      "pull-request-471-ready-open-post-review-evidence-refresh",
    );
    expect(evidence.implementation.pull_request_delivery).toEqual({
      pull_request: 471,
      url: "https://github.com/gomyway1216/nextjs-portfolio/pull/471",
      state: "ready-open",
      review_state: "post-review-evidence-refresh-recorded",
      whole_change_uncommitted_or_unpushed: false,
    });
    expect(evidence.implementation.disposable_kill_drill).toMatchObject({
      failpoints: [
        "outer-active-durable",
        "stage-lease-durable",
        "checkpoint-first-byte-written",
      ],
      signals_per_failpoint: ["SIGTERM", "SIGKILL"],
      expected_cases: 6,
      disposable_fixture_only: true,
      production_namespace_used: false,
      production_gate_invoked: false,
      delete_truncate_or_repair_before_evidence: false,
      power_loss_or_reboot_tested: false,
      fixed_temporary_parent: "/private/tmp",
      temporary_parent_selected_by_environment: false,
      private_anchor_exact_mode: "0700",
      private_anchor_validation_method: "canonical-realpath-and-named-lstat",
      private_anchor_descriptor_held_for_full_lifetime: false,
      global_temporary_parent_snapshot_required: false,
      production_home_alias_rejected: true,
      production_home_ancestor_overlap_rejected: true,
      production_home_descendant_overlap_rejected: true,
      case_cleanup_runs_only_after_that_case_verification_succeeds: true,
      fixed_anchor_cleanup_runs_only_after_six_case_success: true,
      failure_fixture_preserved_for_manual_reconciliation: true,
      typed_failure_discloses_fixture_path: false,
      child_nested_paths_confined_to_disposable_fixture: true,
      partial_setup_exact_authority_rollback_attempted: true,
      partial_setup_uncertain_orphan_preserved: true,
      checkpoint_first_byte_visible_after_write_before_fsync: true,
      checkpoint_first_byte_durable: false,
      checkpoint_first_byte_power_loss_survival_claimed: false,
      reviewed_post_merge_kill_drill_package_cli_invocations_for_this_evidence: 0,
    });
    expect(evidence.implementation.independent_audit).toMatchObject({
      severity_counts: {
        preflight_p1: 1,
        preflight_p2: 1,
        kill_drill_p1: 2,
        kill_drill_p2: 3,
      },
      preflight_expected_approved_binding: {
        severity: "P2",
        repair_present_in_candidate_tree: true,
        authoritative_post_fix_result: "pass",
      },
      preflight_outer_uid_home_registry_anchor_binding: {
        severity: "P1",
        repair_present_in_candidate_tree: true,
        authoritative_post_fix_result: "pass",
      },
      kill_drill_temporary_root_production_home_ancestry: {
        severity: "P1",
        repair_present_in_candidate_tree: true,
        authoritative_post_fix_result: "pass",
      },
      kill_drill_failure_cleanup_can_remove_unrecorded_evidence: {
        severity: "P1",
        repair_present_in_candidate_tree: true,
        authoritative_post_fix_result: "pass",
      },
      kill_drill_child_nested_path_confinement: {
        severity: "P2",
        repair_present_in_candidate_tree: true,
        authoritative_post_fix_result: "pass",
      },
      kill_drill_partial_setup_rollback_and_orphan_preservation: {
        severity: "P2",
        repair_present_in_candidate_tree: true,
        authoritative_post_fix_result: "pass",
      },
      kill_drill_checkpoint_visibility_wording: {
        severity: "P2",
        repair_present_in_candidate_tree: true,
        authoritative_post_fix_result: "pass",
      },
      post_fix_residual_findings: { p0: 0, p1: 0, p2: 0 },
      pre_audit_validation_used_as_final_evidence: false,
    });
    expect(
      evidence.implementation.independent_audit.post_fix_reaudit_history,
    ).toEqual({
      preflight_lock_contention_coverage: {
        severity: "P2",
        fixed: true,
      },
      kill_partial_capture_and_setup_classification: {
        severity: "P2",
        fixed: true,
      },
      kill_anchor_descriptor_overclaim_narrowed_to_named_lstat: {
        severity: "P2",
        fixed: true,
      },
      kill_global_temporary_snapshot_race: {
        severity: "P2",
        fixed: true,
      },
      kill_test_seam_path_privacy: { severity: "P2", fixed: true },
      integration_execution_accounting_boundary: {
        severity: "P2",
        fixed: true,
      },
      integration_non_atomic_observation_and_source_contract: {
        severity: "P2",
        fixed: true,
      },
      integration_preflight_cli_exact_record_and_privacy_boundary: {
        severity: "P2",
        fixed: true,
        regression_covered: true,
        proxy_rejected: true,
        accessor_rejected: true,
        extra_string_key_rejected: true,
        extra_symbol_key_rejected: true,
        nonplain_prototype_rejected: true,
      },
      kill_cli_cases_array_exactness: { severity: "P2", fixed: true },
      kill_failure_timeout_or_malformed_ipc_child_reap_and_close_confirmation: {
        severity: "P2",
        found: true,
        fixed: true,
        regression_covered: true,
        shared_close_observation: true,
        terminate_and_await_on_every_failure_path: true,
        adversarial_arm_probe_regressions: 4,
        child_pid_esrch_confirmed: true,
        registry_json_fd3_lock_reacquisition_confirmed: true,
        stable_process_tree_observation_milliseconds: 150,
        no_late_writes_observed: true,
        production_cases: 0,
      },
      kill_initial_lock_assertion_targets_actual_registry_json: {
        severity: "P2",
        found_in_follow_up_test_review: true,
        fixed: true,
        regression_covered: true,
        previous_registry_directory_targeted: true,
        actual_registry_json_targeted: true,
      },
      authoritative_final_aggregate_values:
        "recorded-after-pr-471-final-review-repair",
    });
    expect(evidence.implementation.package_and_ci).toMatchObject({
      existing_production_prefix_100_script_changed_by_post_green_native_launch_remediation: true,
      package_source_contract_rechecked: true,
      command_strings_are_current_post_green_native_launch_source_contract: true,
      historical_execution_count_or_class_rewritten_by_command_update: false,
      preflight_script_exact:
        '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-v7-production-native-launcher.jxa" prefix-100-read-only-preflight',
      kill_drill_script_exact:
        '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-v7-production-native-launcher.jxa" prefix-100-disposable-kill-drill',
      production_prefix_100_script_exact_current:
        '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-v7-production-native-launcher.jxa" durable-prefix-100',
      ci_exact_node_version: "22.13.0",
      darwin_lockf_required: true,
      darwin_caffeinate_required: true,
      darwin_osascript_required: true,
      darwin_lsof_required: true,
      darwin_ps_required: true,
      darwin_preflight_suite_required: true,
      darwin_kill_drill_suite_required: true,
      ci_production_package_commands_invoked: 0,
      ci_uses_production_private_namespace: false,
      ci_invokes_production_gate: false,
    });
    expect(evidence.actual_read_only_audits).toEqual({
      observed_after_commit: "afcf7b4",
      production_preflight_cli: {
        invocations: 1,
        feature_checkout: true,
        exact_node_version: "v22.13.0",
        zero_argument: true,
        exit_code: 1,
        decision: "NO-GO",
        phase: "outer-gate-lock",
        reason: "fixed-registry-json-absent",
        sanitized_output: true,
        success_receipt_observed: false,
        current_user_production_ancestor_and_path_metadata_read: true,
        registry_bytes_read: false,
        persistent_mutation: false,
        gate_invoked: false,
        fixed_namespace_presence_before: {
          registry_root: "absent",
          final: "absent",
          staging: "absent",
          runs: "absent",
        },
        fixed_namespace_presence_after: {
          registry_root: "absent",
          final: "absent",
          staging: "absent",
          runs: "absent",
        },
        authorizes_gate: false,
      },
      approved_current_binding_cli: {
        invocations: 1,
        status: "pass",
        identifier_free_output: true,
        persistent_mutation: false,
        authorizes_gate: false,
      },
      deployment_key_instance_inspector: {
        invocations: 1,
        status: "pass",
        result_classification: "candidate-only",
        private_instance_values_included: false,
        persistent_mutation: false,
        authorizes_gate: false,
      },
      teacher_and_input_readiness: {
        audits: 1,
        status: "pass",
        input_bundle: {
          files_expected: 9,
          files_passed: 9,
          identity_hash_and_mode_matched: true,
          total_bytes: 295620795,
          replay_exclusion_position_ids: 847243,
        },
        teacher_fixed_assets: {
          files_expected: 7,
          files_passed: 7,
          total_bytes: 66169459,
        },
        related_validation: {
          files: 3,
          tests: 72,
          passed: 72,
          failed: 0,
          duration_seconds: 7.4,
          swaps: 0,
        },
        available_resources: {
          logical_cpu_cores: 14,
          memory_gib: 48,
          available_disk_gib: 162.25,
          fixed_engine_count: 12,
        },
        path_or_hash_values_included: false,
        teacher_process_started: false,
        training_started: false,
        authorizes_gate_or_training: false,
      },
      all_audits_read_only: true,
      additional_production_commands_executed_by_this_refresh: false,
    });
    expect(evidence.independent_read_only_input_recheck).toEqual({
      observed_on: "2026-07-16",
      manifest_counts_matched: true,
      manifest_hashes_matched: true,
      bundle_files_expected: 9,
      bundle_files_passed: 9,
      bundle_identity_hash_and_mode_matched: true,
      bundle_total_bytes: 295620795,
      replay_exclusion_position_ids: 847243,
      roles: [
        {
          role: "training",
          raw_parents: 24000,
          protected_position_ids: 2121074,
        },
        {
          role: "selection",
          raw_parents: 4800,
          protected_position_ids: 425344,
        },
        {
          role: "final",
          raw_parents: 4800,
          protected_position_ids: 413221,
        },
      ],
      teacher_fixed_assets: {
        files_expected: 7,
        files_passed: 7,
        total_bytes: 66169459,
      },
      related_validation: {
        files: 3,
        tests: 72,
        passed: 72,
        failed: 0,
        duration_seconds: 7.4,
        swaps: 0,
      },
      available_resources: {
        logical_cpu_cores: 14,
        memory_gib: 48,
        available_disk_gib: 162.25,
        fixed_engine_count: 12,
      },
      path_values_included: false,
      hash_values_included: false,
      private_values_included: false,
      production_namespace_mutated: false,
      teacher_generation_or_production_gate_executed: false,
    });
    expect(evidence.validation.authoritative_post_fix_validation).toEqual({
      status: "pass",
      focused_values_recorded: true,
      full_values_recorded: true,
      static_values_recorded: true,
      residual_p0: 0,
      residual_p1: 0,
      residual_p2: 0,
      used_as_authoritative_final_local_evidence: true,
      production_execution_evidence: false,
    });
    expect(evidence.validation.post_fix_pre_review_candidate).toEqual({
      status: "pass",
      node_version: "v22.13.0",
      focused: {
        files: 8,
        tests: 149,
        passed: 149,
        failed: 0,
        vitest_duration_seconds: 55.84,
        wall_time_seconds: 56.19,
        maximum_resident_set_bytes: 413237248,
        swaps: 0,
      },
      full: {
        files: 143,
        tests: 2676,
        passed: 2676,
        failed: 0,
        vitest_duration_seconds: 148.28,
        wall_time_seconds: 148.68,
        maximum_resident_set_bytes: 4373479424,
        swaps: 0,
      },
      production_build: {
        static_pages_generated: 193,
        static_pages_expected: 193,
        wall_time_seconds: 24.43,
        maximum_resident_set_bytes: 2590097408,
        swaps: 0,
      },
      used_as_final_evidence: false,
      reason_not_final: "superseded-by-pr-471-final-review-repair",
    });
    expect(evidence.validation.focused_current_tree).toEqual({
      status: "pass",
      tree_classification: "authoritative-final-stable-substantive-local-tree",
      node_version: "v22.13.0",
      files: 8,
      tests: 153,
      passed: 153,
      failed: 0,
      vitest_duration_seconds: 69.36,
      wall_time_seconds: 69.71,
      maximum_resident_set_bytes: 419643392,
      swaps: 0,
      used_as_authoritative_final_local_evidence: true,
    });
    expect(evidence.validation.full_vitest).toEqual({
      status: "pass",
      node_version: "v22.13.0",
      files: 143,
      tests: 2680,
      passed: 2680,
      failed: 0,
      vitest_duration_seconds: 156.65,
      wall_time_seconds: 157.07,
      maximum_resident_set_bytes: 4374691840,
      swaps: 0,
      used_as_authoritative_final_local_evidence: true,
    });
    expect(evidence.validation.kill_drill_execution_accounting).toEqual({
      reviewed_post_merge_kill_drill_package_cli: {
        fixed_owner_invocations: 0,
        complete_six_case_drills: 0,
        successful_local_cases: 0,
        production_cases: 0,
      },
      post_fix_kill_test_file_run: {
        fixed_owner_invocations: 2,
        complete_six_case_drills: 3,
        successful_local_cases: 18,
        distinct_failpoint_signal_classes: 6,
        failure_path_child_reap_regressions_per_post_fix_test_file_run: 4,
        failure_path_child_reap_regressions_are_production_cases: false,
        production_cases: 0,
        used_as_authoritative_final_aggregate: true,
      },
      historical_pre_audit_candidate: {
        successful_local_cases: 6,
        distinct_failpoint_signal_classes: 6,
        production_cases: 0,
        combined_with_post_fix_cases: false,
        used_as_authoritative_final_aggregate: false,
      },
      authoritative_final_aggregate: {
        status: "recorded-as-authoritative-local-validation",
        values_recorded: true,
        fixed_owner_invocations: 2,
        complete_six_case_drills: 3,
        successful_local_cases: 18,
        distinct_failpoint_signal_classes: 6,
        failure_path_child_reap_regressions_per_post_fix_test_file_run: 4,
        failure_path_child_reap_regressions_are_production_cases: false,
        production_cases: 0,
      },
    });
    expect(evidence.validation.static_validation).toEqual({
      tree_classification: "authoritative-final-local-post-fix-tree",
      typescript: "pass",
      full_eslint: {
        exit_code: 0,
        errors: 0,
        existing_warnings: 157,
      },
      changed_scope_eslint: { errors: 0, warnings: 0 },
      ml_stdlib: { tests: 58, passed: 58, failed: 0 },
      npm_audit: { all_severities: 0 },
      prettier:
        "pass-all-changed-source-test-document-data-package-and-ci-files",
      git_diff_check: "pass",
      production_build: {
        status: "pass",
        static_pages_generated: 193,
        static_pages_expected: 193,
        wall_time_seconds: 26.11,
        maximum_resident_set_bytes: 2619424768,
        swaps: 0,
      },
      used_as_authoritative_final_local_evidence: true,
    });
    expect(
      evidence.validation.full_vitest_pre_audit_candidate
        .used_as_final_evidence,
    ).toBe(false);
    expect(evidence.production_execution).toEqual({
      real_production_preflight_commands_by_this_change: 1,
      approved_current_binding_read_only_cli_invocations_by_this_change: 1,
      deployment_key_instance_read_only_inspector_invocations_by_this_change: 1,
      teacher_asset_readiness_read_only_audits_by_this_change: 1,
      reviewed_post_merge_kill_drill_package_cli_invocations_by_this_change: 0,
      production_process_death_cases_by_this_change: 0,
      production_registry_provisions_by_this_change: 0,
      production_prefix_100_gate_executions_by_this_change: 0,
      production_prefix_500_gate_executions_by_this_change: 0,
      production_final_24000_gate_executions_by_this_change: 0,
      search_runs_by_this_change: 0,
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
      playing_strength_changed_by_this_evidence: false,
    });
    for (const value of Object.values(evidence.nonclaims)) {
      expect(value).toBe(false);
    }
  });

  it("keeps private operational values out of every public artifact", () => {
    const evidenceText = readText(EVIDENCE_PATH);
    const evidence = JSON.parse(evidenceText);
    const combined = `${readText(JAPANESE_ARTICLE_PATH)}\n${readText(ENGLISH_ARTICLE_PATH)}\n${evidenceText}`;

    for (const pattern of [
      /\/Users\//u,
      /\/home\//u,
      /\b[0-9a-f]{64}\b/u,
      /private-(?:raw|preflight|kill)-canary/u,
      /(?:preflight|kill-drill)-test\.local/u,
    ]) {
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
      "absolute_path",
    ]) {
      expect(keys.has(privateValueKey)).toBe(false);
    }
    for (const ambiguousLegacyKey of [
      "fixed_kill_drill_command_executed_for_this_evidence",
      "real_disposable_kill_drill_commands_by_this_change",
    ]) {
      expect(keys.has(ambiguousLegacyKey)).toBe(false);
    }
    expect(evidence.production_execution).toMatchObject({
      reviewed_post_merge_kill_drill_package_cli_invocations_by_this_change: 0,
    });
    expect(evidence.evidence_scope).toMatchObject({
      personal_environment_values_included: false,
      owner_or_machine_identity_values_included: false,
      filesystem_identity_values_included: false,
      private_registry_values_included: false,
      private_authentication_or_entropy_values_included: false,
      key_material_or_instance_values_included: false,
      raw_preflight_or_kill_drill_receipt_included: false,
      raw_failure_included: false,
    });
  });
});
