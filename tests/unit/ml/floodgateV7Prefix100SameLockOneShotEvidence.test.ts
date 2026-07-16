import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-prefix-100-same-lock-one-shot-2026-07-16.json",
);
const CI_WORKFLOW_PATH = path.join(REPOSITORY_ROOT, ".github/workflows/ci.yml");
const REGISTRY_PROVISIONER_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-production-connector-registry-provisioner.ts",
);
const ROLE_BUNDLE_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-role-bundle.ts",
);
const ROLE_BUNDLE_RESULT_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-role-bundle-result.ts",
);

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

function collectNullPaths(value: unknown, prefix = ""): string[] {
  if (value === null) return [prefix];
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectNullPaths(entry, `${prefix}[${index}]`),
    );
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    collectNullPaths(entry, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
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

describe("Floodgate v7 prefix-100 same-lock one-shot public evidence", () => {
  it("has no duplicate key in any JSON object", () => {
    expect(() =>
      assertNoDuplicateJsonObjectKeys(readText(EVIDENCE_PATH)),
    ).not.toThrow();
    expect(() =>
      assertNoDuplicateJsonObjectKeys(
        '{"outer":{"same":1,"\\u0073ame":2},"same":3}',
      ),
    ).toThrow(/Duplicate JSON object key "same"/u);
  });

  it("keeps the Japanese and English articles at the same twelve-section boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expected = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(numberedSections(japanese)).toEqual(expected);
    expect(numberedSections(english)).toEqual(expected);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.md",
    );
    for (const marker of [
      "4a14507a5a228cac71c011c94989fa9307f8218a",
      "b086243781396e2c197cc9e1cfab1fc6b773ae2a",
      "0f3cadb76ec46eb82d5bc9623277525ce1d2252b",
      "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
      "runOp1",
      "verifier_revision",
      "exact-prefix-100-postflight",
      "192 color-swapped pairs / 384 games",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
    expect(japanese).toContain("1回だけ取得した同じouter OS lock");
    expect(english).toContain("same outer OS lock acquired once");
    expect(japanese).toContain("独立したHMAC再認証ではない");
    expect(english).toContain("not independent HMAC authentication");
    expect(japanese).toContain("最初のcontrol mutationより前");
    expect(english).toContain("before the first control mutation");
    expect(japanese).toContain("production commandは0");
    expect(english).toContain("zero new production commands");
  });

  it("records the one-lock ordering, continuity boundary, and key-reread repair", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-v7-prefix-100-same-lock-one-shot-evidence-v1",
      evidence_date: "2026-07-16",
      evidence_scope: {
        class: "local-source-test-and-documentation-candidate-only",
        production_state_freshly_observed_for_this_change: false,
        production_namespace_read_for_this_change: false,
        production_namespace_or_file_content_mutated_for_this_change: false,
        production_gate_invocation_authorized_by_this_evidence: false,
        historical_pr_471_read_only_audit_recounted_as_this_change: false,
        local_source_or_test_execution_counted_as_production_execution: false,
      },
      prerequisite_delivery: {
        pull_request: 471,
        state: "merged",
        merge_method: "regular-merge-commit",
        merge_commit: "4a14507a5a228cac71c011c94989fa9307f8218a",
        production_prefix_100_executed_by_prerequisite: false,
      },
      current_delivery: {
        pull_request: null,
        state: "local-candidate-before-pr",
        review_state: "pending",
        final_integrated_validation:
          "authoritative-local-complete-required-darwin-ci-pending",
      },
      same_lock_composition: {
        fixed_gate: "durable-prefix-100",
        fixed_zero_argument_production_owner: true,
        generic_production_callback_added: false,
        public_preflight_receipt_used_as_gate_authority: false,
        common_outer_os_lock_acquisitions: 1,
        same_lock_retained_from_preflight_through_postflight_receipt_validation: true,
        preflight_connector_or_postflight_split_across_lock_ownership: false,
      },
      preflight_boundary: {
        runs_before_first_control_namespace_mutation: true,
        no_go_publishes_active_lease: false,
        no_go_invokes_connector: false,
      },
      deployment_key_reread_repair: {
        fresh_key_read_after_preflight_while_lock_held: true,
        fresh_key_compared_with_initial_private_capture: true,
        constant_time_byte_comparison: true,
        fresh_copy_zeroized_after_comparison: true,
        mismatch_reaches_first_control_mutation: false,
        key_rotation_claimed: false,
      },
      connector_boundary: {
        fixed_runner_invocations_on_success: 1,
        automatic_retry_after_connector_started_failure: false,
        stdout_failure_reinvokes_connector: false,
      },
      exact_prefix_100_postflight: {
        low_level_scan_accepts_caller_supplied_anchor: true,
        low_level_scan_is_standalone_production_authority: false,
        low_level_scan_result_is_production_authenticated_receipt: false,
        low_level_scan_claims_outer_lock_held: false,
        low_level_scan_claims_connector_origin: false,
        low_level_scan_claims_anchor_authenticity: false,
        low_level_scan_claims_authenticated_continuity: false,
        low_level_scan_authorizes_gate: false,
        read_only: true,
        records: 102,
        completed_parents: 100,
        recomputed_sha256_matches_caller_supplied_anchor: true,
        all_descriptors_must_close: true,
        file_content_or_namespace_write_operation_performed: false,
        atime_invariance_claimed: false,
        fixed_runner_supplies_genuine_connector_anchor: true,
        fixed_runner_invokes_scan_under_same_outer_lock: true,
        fixed_runner_exactly_validates_scan_observation: true,
        only_fixed_runner_promotes_composition_to_authenticated_final_scan_continuity: true,
        independent_hmac_authentication_claimed: false,
        hmac_key_available_to_low_level_scan: false,
      },
      failure_policy: {
        preflight_failure_connector_invocations: 0,
        postflight_failure_checkpoint_may_have_persisted: true,
        postflight_failure_retry_disposition:
          "checkpoint-reconciliation-required",
        automatic_delete_truncate_repair_or_fresh_retry: false,
      },
      other_gate_compatibility: {
        durable_prefix_500_receipt_shape_changed: false,
        sealed_final_24000_receipt_shape_changed: false,
        durable_prefix_500_invokes_prefix_100_postflight: false,
        sealed_final_24000_invokes_prefix_100_postflight: false,
      },
    });

    expect(evidence.independent_audit_findings).toMatchObject({
      low_level_path_anchor_api_production_authenticated_receipt_overclaim: {
        severity: "P1",
        found: true,
        repair_completed: true,
        focused_regression_passed: true,
      },
      throw_undefined_no_error_sentinel_collision: {
        severity: "P2",
        found: true,
        repair_completed: true,
        focused_regression_passed: true,
      },
      filesystem_mutated_false_atime_overclaim: {
        severity: "P2",
        found: true,
        repair_completed: true,
        focused_regression_passed: true,
      },
      registry_revision_current_app_head_ordering_overclaim: {
        severity: "P1",
        found: true,
        false_rationale:
          "future-finalizer-merge-would-change-head-away-from-registry-verifier-revision",
        configured_historical_verifier_revision:
          "b086243781396e2c197cc9e1cfab1fc6b773ae2a",
        required_result_receipt_producer_revision:
          "0f3cadb76ec46eb82d5bc9623277525ce1d2252b",
        required_repair:
          "block-provisioning-until-compatible-verifier-and-complete-source-artifact-producer-ancestry-closure-is-reviewed-and-merged",
        claim_repair_completed: true,
        focused_evidence_regression_passed: true,
        operational_follow_up_repair_pr_required: true,
      },
      all_current_candidate_audit_repairs_completed: true,
      all_focused_audit_regressions_passed: true,
      repair_required_before_authoritative_final_evidence: false,
      repair_validation_state: "completed-and-focused-regressions-passed",
      final_integrated_validation_counts_may_remain_pending: true,
      intermediate_pre_repair_pass_counts_are_final_evidence: false,
    });

    expect(evidence.validation).toMatchObject({
      status: "authoritative-local-complete-required-darwin-ci-pending",
      exact_node_version: "v22.13.0",
      authoritative_focused_files: 9,
      authoritative_focused_tests_passed: 179,
      authoritative_full_files: 147,
      authoritative_full_tests_passed: 2734,
      authoritative_full_wall_seconds: 150.96,
      authoritative_full_maximum_rss_bytes: 4355293184,
      authoritative_full_swaps: 0,
      authoritative_full_max_workers: 8,
      authoritative_full_is_exact_final_tree: true,
      authoritative_production_build_static_pages: 193,
      typescript_passed: true,
      changed_scope_eslint_errors: 0,
      changed_scope_eslint_warnings: 0,
      prettier_passed: true,
      diff_check_passed: true,
      ml_stdlib_tests_passed: 58,
      ml_stdlib_tests_total: 58,
      npm_audit_vulnerabilities: 0,
      earlier_default_full_build_ml_and_audit_executed_four_way_in_parallel: true,
      intermediate_counts_used_as_authoritative_final_evidence: false,
    });
    expect(evidence.validation.earlier_default_concurrency_full_pass).toEqual({
      files: 147,
      tests_passed: 2734,
      wall_seconds: 159.48,
      maximum_rss_bytes: 4307124224,
      swaps: 0,
      executed_in_parallel_with_build_ml_and_audit: true,
    });
    expect(
      evidence.validation.nonfinal_default_concurrency_confirmation_history,
    ).toMatchObject({
      attempts: 2,
      failed_attempts: 2,
      distinct_unrelated_failed_suites: 2,
      classification: "nonfinal-concurrency-flake-candidate-not-authoritative",
      resource_contention_proved: false,
      stable_wasm_isolated_tests_passed: 53,
      stable_wasm_isolated_tests_total: 53,
      stable_proposal_finalization_isolated_tests_passed: 11,
      stable_proposal_finalization_isolated_tests_total: 11,
    });

    expect(evidence.same_lock_composition.success_order).toEqual([
      "open-fixed-private-registry-and-acquire-common-outer-os-lock",
      "fresh-read-only-prefix-100-preflight-before-first-control-mutation",
      "exact-go-and-same-registry-anchor-revalidation",
      "fresh-deployment-key-reread-and-exact-private-comparison",
      "prepare-control-namespace-and-publish-authenticated-active-lease",
      "invoke-fixed-prefix-100-connector-exactly-once",
      "read-only-exact-prefix-100-continuity-postflight",
      "validate-runner-continuity-receipt-under-same-lock",
      "retire-active-evidence-validate-final-namespace-and-release-lock",
    ]);
  });

  it("keeps production counters at zero and runOp1 unchanged", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(
      Object.values(evidence.production_execution_for_this_change),
    ).toEqual(expect.arrayContaining([0]));
    for (const count of Object.values(
      evidence.production_execution_for_this_change,
    )) {
      expect(count).toBe(0);
    }
    expect(evidence.playing_strength).toMatchObject({
      current_production_evaluator: "runOp1",
      current_rollback_evaluator: "runOp1",
      live_weight_changed: false,
      playing_strength_changed_by_this_evidence: false,
      stable_high_dan_claimed: false,
      formal_ab_color_swapped_pairs: 192,
      formal_ab_total_games: 384,
      external_calibration_games_required: 200,
    });
    expect(evidence.playing_strength.formal_ab_total_games).toBe(
      evidence.playing_strength.formal_ab_color_swapped_pairs * 2,
    );
    for (const claim of Object.values(evidence.nonclaims)) {
      expect(claim).toBe(false);
    }
  });

  it("requires the exact macOS CI step for Darwin-only same-lock boundaries", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    const workflow = readText(CI_WORKFLOW_PATH);
    const expectedCommand =
      "npm test -- tests/unit/ml/floodgateV7ProductionPrefix100SameLockOneShot.test.ts tests/unit/ml/floodgateV7ProductionPrefix100RealBoundariesIntegration.test.ts";

    expect(evidence.validation.darwin_ci).toEqual({
      required: true,
      ubuntu_full_suite_covers_darwin_run_if_paths: false,
      workflow_path: ".github/workflows/ci.yml",
      job_id: "darwin_exclusive_directory_rename",
      runner: "macos-latest",
      step_name: "Run Darwin prefix-100 same-lock one-shot adversarial tests",
      command: expectedCommand,
      test_paths: [
        "tests/unit/ml/floodgateV7ProductionPrefix100SameLockOneShot.test.ts",
        "tests/unit/ml/floodgateV7ProductionPrefix100RealBoundariesIntegration.test.ts",
      ],
      authoritative_local_darwin_paths_passed: true,
      github_ci_state: "pending-before-pull-request",
      required_before_final_integrated_validation: true,
    });
    expect(workflow).toContain("  darwin_exclusive_directory_rename:\n");
    expect(workflow).toContain("    runs-on: macos-latest\n");
    expect(workflow).toContain(
      `      - name: Run Darwin prefix-100 same-lock one-shot adversarial tests\n        run: ${expectedCommand}`,
    );

    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    for (const article of [japanese, english]) {
      expect(article).toContain(".github/workflows/ci.yml");
      expect(article).toContain(
        "Run Darwin prefix-100 same-lock one-shot adversarial tests",
      );
      expect(article).toContain(
        "tests/unit/ml/floodgateV7ProductionPrefix100SameLockOneShot.test.ts",
      );
      expect(article).toContain(
        "tests/unit/ml/floodgateV7ProductionPrefix100RealBoundariesIntegration.test.ts",
      );
    }
  });

  it("blocks provisioning on compatible verifier source/artifact closure and the real gate on the finalizer", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    const provisionerSource = readText(REGISTRY_PROVISIONER_SOURCE_PATH);
    const roleBundleSource = readText(ROLE_BUNDLE_SOURCE_PATH);
    const roleBundleResultSource = readText(ROLE_BUNDLE_RESULT_SOURCE_PATH);

    expect(evidence.registry_ordering_gate).toEqual({
      registry_is_create_only: true,
      configured_verifier_revision: "b086243781396e2c197cc9e1cfab1fc6b773ae2a",
      configured_verifier_revision_is_current_merged_app_head: false,
      consumer_requires_clean_repository_head_equal_verifier_revision: true,
      result_receipt_and_evidence_producer_revision:
        "0f3cadb76ec46eb82d5bc9623277525ce1d2252b",
      result_receipt_and_evidence_present_at_configured_verifier_revision: false,
      result_receipt_producer_is_ancestor_of_configured_verifier_revision: false,
      evidence_backed_viable_verifier_revision_candidate:
        "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
      result_receipt_producer_is_ancestor_of_viable_candidate: true,
      required_result_receipt_and_evidence_present_at_viable_candidate: true,
      viable_candidate_accepted_full_verifier_exit_code: 0,
      viable_candidate_confirmation_full_verifier_exit_code: 0,
      viable_candidate_is_already_configured: false,
      separate_fail_before_install_closure_repair_pr_required: true,
      provision_before_closure_repair_pr_regular_merge: false,
      provision_with_current_configuration_would_create_usable_registry: false,
      provision_before_compatible_verifier_and_complete_source_artifact_closure: false,
      training_label_finalizer_required_before_real_gate_start: true,
      training_label_finalizer_is_verifier_head_compatibility_reason: false,
      reason:
        "historical-b086243-cannot-satisfy-clean-head-and-0f3cadb-artifact-producer-ancestry-closure-together",
      required_order: [
        "regular-merge-same-lock-one-shot",
        "implement-review-and-regular-merge-e8a9197-binding-and-fail-before-install-closure-repair",
        "regular-merge-authenticated-training-label-finalizer-before-real-gate-start",
        "provision-create-only-registry-only-after-both-prerequisites",
        "run-reviewed-disposable-kill-drill",
        "run-prefix-100-once-and-stop-for-exact-100-review",
      ],
      overwrite_adopt_or_rotate_registry_as_shortcut: false,
    });
    expect(provisionerSource).toMatch(
      /FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION\s*=\s*\n?\s*"b086243781396e2c197cc9e1cfab1fc6b773ae2a"/u,
    );
    expect(roleBundleSource).toContain("head !== verifierRevision");
    expect(roleBundleResultSource).toMatch(
      /FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION\s*=\s*\n?\s*"0f3cadb76ec46eb82d5bc9623277525ce1d2252b"/u,
    );
    expect(roleBundleResultSource).toContain(
      "FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,\n      verifierRevision",
    );

    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    for (const article of [japanese, english]) {
      expect(article).not.toContain(
        "a-finalizer-merge-would-change-head-after-the-create-only-registry-pinned-the-earlier-revision",
      );
      expect(article).not.toContain(
        "registry pins `verifier_revision` to the exact merged code revision",
      );
      expect(article).not.toContain(
        "`verifier_revision`をexact merged code revisionへ固定",
      );
    }
  });

  it("limits placeholders, rejects stale A/B sizing, and excludes private values", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const evidenceText = readText(EVIDENCE_PATH);
    const evidence = JSON.parse(evidenceText);
    const combined = `${japanese}\n${english}\n${evidenceText}`;

    expect(collectNullPaths(evidence).sort()).toEqual([
      "current_delivery.pull_request",
    ]);
    expect(combined).toContain("192 color-swapped pairs / 384 games");
    expect(combined).not.toMatch(/\b768\b/u);
    expect(combined).not.toContain("/Users/");
    expect(combined).not.toMatch(/\b[0-9a-f]{64}\b/u);
    expect(combined).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
    expect(combined).not.toContain("PRIVATE_CANARY");

    const keys = new Set<string>();
    collectObjectKeys(evidence, keys);
    for (const forbidden of [
      "absolute_path",
      "effective_user_id",
      "filesystem_device",
      "filesystem_inode",
      "home_directory",
      "key_instance_id",
      "key_material",
      "registry_digest",
      "run_id",
      "work_sha256",
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false);
    }
  });
});
