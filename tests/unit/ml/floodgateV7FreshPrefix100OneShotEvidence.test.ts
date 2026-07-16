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
  });

  it("pins the package and Darwin CI source contract without invoking a production package command", () => {
    const packageJson = JSON.parse(readText(PACKAGE_JSON_PATH));
    const scripts = packageJson.scripts as Record<string, unknown>;
    const ci = readText(CI_WORKFLOW_PATH);

    expect(scripts["shogi:floodgate-v7-production-prefix-100-preflight"]).toBe(
      "node -r tsx/cjs ml/inspect-floodgate-v7-production-prefix-100-preflight.ts",
    );
    expect(scripts["shogi:floodgate-v7-production-prefix-100-kill-drill"]).toBe(
      "/usr/bin/caffeinate -dimsu node -r tsx/cjs ml/run-floodgate-v7-production-prefix-100-kill-drill.ts",
    );
    expect(scripts["shogi:floodgate-v7-production-connector-prefix-100"]).toBe(
      "/usr/bin/caffeinate -dimsu node -r tsx/cjs ml/run-floodgate-v7-production-connector-prefix-100.ts",
    );

    expect(
      ci.match(/node-version: "22\.13\.0"/gu)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(ci).toContain("run: test -x /usr/bin/lockf");
    expect(ci).toContain("run: test -x /usr/bin/caffeinate");
    expect(ci).toContain(
      "tests/unit/ml/floodgateV7ProductionPrefix100Preflight.test.ts tests/unit/ml/floodgateV7ProductionPrefix100PreflightCli.test.ts",
    );
    expect(ci).toContain(
      "tests/unit/ml/floodgateV7ProductionPrefix100KillDrill.test.ts tests/unit/ml/floodgateV7ProductionPrefix100KillDrillCli.test.ts",
    );
    expect(ci).not.toMatch(/run:\s+npm run shogi:floodgate-v7-production-/u);
  });

  it("records NO-GO separately from zero production execution", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-v7-fresh-prefix-100-one-shot-evidence-v1",
      evidence_date: "2026-07-16",
      evidence_scope: {
        class:
          "local-source-test-and-documentation-evidence-before-production-prefix-100",
        production_state_freshly_observed_for_this_evidence: false,
        production_private_namespace_read_for_this_evidence: false,
        production_registry_read_for_this_evidence: false,
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
        public_preflight_receipt_is_gate_authority: false,
        all_required_checks_and_terminal_revalidations_pass_in_one_outer_lock_held_observation: true,
        multi_namespace_observation_is_atomic: false,
        unknown_or_false_condition_result: "NO-GO",
        failure_signal_timeout_or_receipt_mismatch_retry: false,
        successful_prefix_100_automatically_authorizes_prefix_500: false,
      },
    });
    expect(evidence.implementation.read_only_preflight).toMatchObject({
      fixed_zero_argument_public_owner: true,
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
      production_preflight_command_executed_for_this_evidence: false,
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
    ).toMatchObject({
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
      authoritative_final_aggregate_values: "recorded-as-local-validation",
    });
    expect(evidence.implementation.package_and_ci).toMatchObject({
      package_source_contract_rechecked: true,
      preflight_script_exact:
        "node -r tsx/cjs ml/inspect-floodgate-v7-production-prefix-100-preflight.ts",
      kill_drill_script_exact:
        "/usr/bin/caffeinate -dimsu node -r tsx/cjs ml/run-floodgate-v7-production-prefix-100-kill-drill.ts",
      production_prefix_100_script_exact_and_unchanged:
        "/usr/bin/caffeinate -dimsu node -r tsx/cjs ml/run-floodgate-v7-production-connector-prefix-100.ts",
      ci_exact_node_version: "22.13.0",
      darwin_lockf_required: true,
      darwin_caffeinate_required: true,
      darwin_preflight_suite_required: true,
      darwin_kill_drill_suite_required: true,
      ci_production_package_commands_invoked: 0,
      ci_uses_production_private_namespace: false,
      ci_invokes_production_gate: false,
    });
    expect(evidence.independent_read_only_input_recheck).toEqual({
      observed_on: "2026-07-16",
      manifest_counts_matched: true,
      manifest_hashes_matched: true,
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
    expect(evidence.validation.focused_current_tree).toEqual({
      status: "pass",
      tree_classification: "authoritative-final-stable-substantive-local-tree",
      node_version: "v22.13.0",
      files: 8,
      tests: 149,
      passed: 149,
      failed: 0,
      vitest_duration_seconds: 55.84,
      wall_time_seconds: 56.19,
      maximum_resident_set_bytes: 413237248,
      swaps: 0,
      used_as_authoritative_final_local_evidence: true,
    });
    expect(evidence.validation.full_vitest).toEqual({
      status: "pass",
      node_version: "v22.13.0",
      files: 143,
      tests: 2676,
      passed: 2676,
      failed: 0,
      vitest_duration_seconds: 148.28,
      wall_time_seconds: 148.68,
      maximum_resident_set_bytes: 4373479424,
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
        wall_time_seconds: 24.43,
        maximum_resident_set_bytes: 2590097408,
        swaps: 0,
      },
      used_as_authoritative_final_local_evidence: true,
    });
    expect(
      evidence.validation.full_vitest_pre_audit_candidate
        .used_as_final_evidence,
    ).toBe(false);
    for (const value of Object.values(evidence.production_execution)) {
      expect(value === 0 || value === false).toBe(true);
    }
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
