import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-production-verifier-git-artifact-closure-2026-07-16.json",
);
const READINESS_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-production-connector-verifier-readiness.ts",
);
const PROVISIONER_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-production-connector-registry-provisioner.ts",
);
const PROVISIONER_CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/provision-floodgate-v7-production-connector-registry.ts",
);
const PREFLIGHT_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-production-prefix-100-preflight.ts",
);
const PREFLIGHT_CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/inspect-floodgate-v7-production-prefix-100-preflight.ts",
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
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

describe("Floodgate v7 production verifier Git/artifact closure evidence", () => {
  it("keeps the bilingual articles at the same twelve-section boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expected = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(numberedSections(japanese)).toEqual(expected);
    expect(numberedSections(english)).toEqual(expected);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-production-verifier-git-artifact-closure.md",
    );
    for (const marker of [
      "https://github.com/gomyway1216/nextjs-portfolio/pull/474",
      "9f647bef3568634f3b3c7634fb66a79ffa090723",
      "779fe1b607403848ca3c4c33d8e7aeb9c7dea7d7",
      "7e4a4a9ffe5960a013d409f886d73e6041c7789e",
      "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
      "1,431",
      "21,322,485",
      "42,644,970",
      "37,775",
      "113,325",
      "1045.52",
      "1089.52",
      "0.68",
      "0.53",
      "179,748,864",
      "186,564,608",
      "186,368,000",
      "2,804",
      "193 / 193",
      "192 color-swapped pairs / 384 games",
      "runOp1",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
  });

  it("has unique JSON keys, no null placeholder, and exact delivery state", () => {
    const source = readText(EVIDENCE_PATH);
    expect(() => assertNoDuplicateJsonObjectKeys(source)).not.toThrow();
    expect(() =>
      assertNoDuplicateJsonObjectKeys(
        '{"outer":{"same":1,"\\u0073ame":2},"same":3}',
      ),
    ).toThrow(/Duplicate JSON object key "same"/u);

    const evidence = JSON.parse(source);
    expect(collectNullPaths(evidence)).toEqual([]);
    expect(evidence).toMatchObject({
      schema:
        "shogi-floodgate-v7-production-verifier-git-artifact-closure-evidence-v1",
      evidence_date: "2026-07-16",
      prerequisite_delivery: {
        pull_request: 473,
        state: "merged",
        merge_method: "regular-merge-commit",
        merge_commit: "7e4a4a9ffe5960a013d409f886d73e6041c7789e",
      },
      current_delivery: {
        pull_request: 474,
        url: "https://github.com/gomyway1216/nextjs-portfolio/pull/474",
        state: "ready-open",
        implementation_revision: "9f647bef3568634f3b3c7634fb66a79ffa090723",
        continuous_integration:
          "not-run-for-test-only-repair-and-validation-refresh-head",
        review:
          "two-copilot-comments-fixed-replied-resolved-zero-unresolved-gemini-zero-actionable",
        merge: "pending-regular-merge-required",
      },
    });
  });

  it("pins the exact revision chain and quantified read surface", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.revision_closure).toEqual({
      independent_verifier_revision: "313c7699e206332f9d380858d90d0326a0a1fd12",
      receipt_producer_revision: "0f3cadb76ec46eb82d5bc9623277525ce1d2252b",
      production_verifier_revision: "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
      independent_verifier_is_receipt_producer_ancestor: true,
      receipt_producer_is_production_verifier_ancestor: true,
      exact_production_verifier_head_required: true,
      standard_git_ignore_rules_used: true,
      ignored_entries_in_closure: false,
      special_index_flags_accepted: false,
    });
    expect(evidence.tracked_source_tree).toEqual({
      blob_count: 1431,
      bytes_per_pass: 21322485,
      minimum_passes: 2,
      minimum_bytes_read: 42644970,
      all_tracked_modes_checked: true,
      all_tracked_bytes_checked: true,
      check_is_metadata_only: false,
    });
    expect(evidence.pinned_artifact_closure).toMatchObject({
      artifact_count: 7,
      bytes_per_set: 37775,
      worktree_passes: 2,
      worktree_bytes_read: 75550,
      producer_git_blob_passes: 1,
      producer_git_blob_bytes_read: 37775,
      minimum_total_artifact_bytes_read: 113325,
      external_role_bundle_files_read: 0,
      full_role_bundle_verifier_runs: 0,
    });
  });

  it("binds v1 readiness to current source-bound v3 consumer contracts and rejects old source shapes", () => {
    const readiness = readText(READINESS_SOURCE_PATH);
    const provisioner = readText(PROVISIONER_SOURCE_PATH);
    const provisionerCli = readText(PROVISIONER_CLI_SOURCE_PATH);
    const preflight = readText(PREFLIGHT_SOURCE_PATH);
    const preflightCli = readText(PREFLIGHT_CLI_SOURCE_PATH);

    expect(readiness).toContain(
      '"shogi-floodgate-v7-production-connector-verifier-readiness-v1"',
    );
    expect(readiness).toContain('"e8a9197608cb48b1160b6707d97b0c4f78f90a1d"');
    expect(provisioner).toContain(
      '"shogi-floodgate-v7-production-connector-registry-provisioner-v3"',
    );
    for (const version of ["v1", "v2"]) {
      expect(provisioner).not.toContain(
        `"shogi-floodgate-v7-production-connector-registry-provisioner-${version}"`,
      );
    }
    expect(provisionerCli).toContain(
      '"shogi-floodgate-v7-production-connector-registry-provision-failure-v3"',
    );
    for (const version of ["v1", "v2"]) {
      expect(provisionerCli).not.toContain(
        `"shogi-floodgate-v7-production-connector-registry-provision-failure-${version}"`,
      );
    }
    for (const marker of [
      "shogi-floodgate-v7-production-prefix-100-read-only-preflight-v3",
      "point-in-time-fixed-current-user-exact-clean-application-source-bound-read-only-observation-without-gate-authority-or-persistent-mutation-v3",
      "shogi-floodgate-v7-production-prefix-100-read-only-preflight-under-lock-outcome-v3",
      "application_source_binding_matched_to_exact_clean_application_closure",
      "application_source_revision_disclosed",
      "application_source_path_disclosed",
      "application_source_digest_disclosed",
    ]) {
      expect(preflight).toContain(marker);
    }
    for (const marker of [
      "shogi-floodgate-v7-production-prefix-100-read-only-preflight-v1",
      "point-in-time-fixed-current-user-read-only-observation-without-gate-authority-or-persistent-mutation-v1",
      "shogi-floodgate-v7-production-prefix-100-read-only-preflight-under-lock-outcome-v1",
      "shogi-floodgate-v7-production-prefix-100-read-only-preflight-v2",
      "point-in-time-fixed-current-user-read-only-observation-without-gate-authority-or-persistent-mutation-v2",
      "shogi-floodgate-v7-production-prefix-100-read-only-preflight-under-lock-outcome-v2",
    ]) {
      expect(preflight).not.toContain(marker);
    }
    expect(preflightCli).toContain(
      '"shogi-floodgate-v7-production-prefix-100-preflight-cli-success-v3"',
    );
    expect(preflightCli).toContain(
      '"shogi-floodgate-v7-production-prefix-100-preflight-cli-failure-v3"',
    );
    for (const version of ["v1", "v2"]) {
      expect(preflightCli).not.toContain(
        `"shogi-floodgate-v7-production-prefix-100-preflight-cli-success-${version}"`,
      );
      expect(preflightCli).not.toContain(
        `"shogi-floodgate-v7-production-prefix-100-preflight-cli-failure-${version}"`,
      );
    }
    for (const marker of [
      "application_source_binding_matched_to_exact_clean_application_closure",
      "application_source_revision_disclosed",
      "application_source_path_disclosed",
      "application_source_digest_disclosed",
    ]) {
      expect(preflightCli).toContain(marker);
    }
  });

  it("fixes the identity, ordering, and failure-before-install boundary", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.readiness_identity_boundary).toMatchObject({
      operator_repository_override_accepted: false,
      operator_revision_override_accepted: false,
      identity_binding_claims_per_receipt: 1,
      identity_binding_replay_accepted: false,
      identity_value_exported: false,
      path_value_exported: false,
      filesystem_identity_value_exported: false,
      private_digest_value_exported: false,
    });
    expect(evidence.execution_order).toEqual({
      provisioner_readiness_before_current_binding: true,
      provisioner_readiness_before_approved_enrollment: true,
      provisioner_readiness_before_entropy: true,
      provisioner_readiness_before_create_only_install: true,
      preflight_readiness_after_fixed_registry_claim: true,
      preflight_readiness_before_runs_namespace_check: true,
      preflight_readiness_before_deployment_key_check: true,
      readiness_failure_registry_creations: 0,
      readiness_failure_gate_invocations: 0,
    });
    expect(readText(PROVISIONER_SOURCE_PATH)).toContain(
      "verifier_source_artifact_closure_checked_before_install",
    );
    expect(readText(PREFLIGHT_SOURCE_PATH)).toContain(
      "verifier_source_artifact_closure_rechecked",
    );
  });

  it("keeps the fast closure distinct from both full-verifier observations", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.performance_observations).toMatchObject({
      historical_full_verifier_accepted: {
        status: "accepted",
        wall_seconds: 1045.52,
        maximum_rss_bytes: 5629476864,
      },
      historical_full_verifier_confirmation: {
        status: "accepted",
        wall_seconds: 1089.52,
        maximum_rss_bytes: 5492424704,
      },
      current_read_only_git_artifact_closure: {
        status: "accepted",
        bounded_read_repair_included: true,
        same_clean_verifier_worktree: true,
        runs: [
          {
            exit_code: 0,
            wall_seconds: 0.68,
            maximum_rss_bytes: 179748864,
            swaps: 0,
            block_output_operations: 0,
          },
          {
            exit_code: 0,
            wall_seconds: 0.53,
            maximum_rss_bytes: 186564608,
            swaps: 0,
            block_output_operations: 0,
          },
          {
            exit_code: 0,
            wall_seconds: 0.53,
            maximum_rss_bytes: 186368000,
            swaps: 0,
            block_output_operations: 0,
          },
        ],
        external_role_bundle_files_read: 0,
        full_role_bundle_verifier_runs: 0,
        persistent_content_or_namespace_write_operations: 0,
      },
      git_artifact_closure_equivalent_to_full_verifier: false,
      git_artifact_closure_replaces_full_verifier: false,
    });
  });

  it("records the exact implementation-head validation without invented counts", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.validation).toEqual({
      validation_candidate_revision: "779fe1b607403848ca3c4c33d8e7aeb9c7dea7d7",
      validated_exact_tree_revision: "779fe1b607403848ca3c4c33d8e7aeb9c7dea7d7",
      implementation_revision_in_validated_tree:
        "9f647bef3568634f3b3c7634fb66a79ffa090723",
      full_vitest: {
        status: "pass",
        files: 150,
        tests: 2804,
        passed: 2804,
        failed: 0,
        vitest_duration_seconds: 155.73,
        wall_seconds: 156.22,
        maximum_rss_bytes: 4373692416,
        swaps: 0,
      },
      production_build: {
        status: "pass",
        static_pages: 193,
        passed: 193,
        failed: 0,
        wall_seconds: 35.21,
        maximum_rss_bytes: 2654404608,
        swaps: 0,
      },
      ml_stdlib: {
        status: "pass",
        tests: 58,
        passed: 58,
        failed: 0,
      },
      npm_audit: {
        status: "pass",
        vulnerabilities: 0,
      },
      focused_evidence_vitest: {
        status: "pass",
        files: 1,
        tests: 9,
        passed: 9,
        failed: 0,
      },
      review_fix_head: {
        revision: "9f647bef3568634f3b3c7634fb66a79ffa090723",
        focused_git_and_receipt_files: 2,
        focused_git_and_receipt_tests: 29,
        focused_git_and_receipt_passed: 29,
        focused_git_and_receipt_failed: 0,
        typescript: "pass",
      },
      github_ci_review_fix_head: {
        revision: "9f647bef3568634f3b3c7634fb66a79ffa090723",
        test_and_build_status: "fail",
        passed_files: 146,
        skipped_files: 3,
        passed_tests: 2696,
        skipped_tests: 99,
        unhandled_rejections: 1,
        failure_classification:
          "test-only-race-handler-attached-after-await-unhandled-under-ci-delay",
        darwin: "pass",
        e2e: "pass",
        audit: "pass",
        vercel: "pass",
      },
      test_only_ci_repair: {
        revision: "c26e0cc8639286cacf3a38e49141bf86b983b3df",
        repair: "attach-intentional-rejection-handler-immediately-before-await",
        repaired_test_file_consecutive_runs: 5,
        repaired_test_file_consecutive_passes: 5,
        typescript: "pass",
        github_ci_for_repair_and_refresh_head: "not-run",
      },
    });
  });

  it("contains no sensitive value or overclaim in the public artifacts", () => {
    const publicText = [
      readText(JAPANESE_ARTICLE_PATH),
      readText(ENGLISH_ARTICLE_PATH),
      readText(EVIDENCE_PATH),
    ].join("\n");
    const evidence = JSON.parse(readText(EVIDENCE_PATH));

    expect(publicText).not.toMatch(
      /(?:^|[\s"'`(])\/(?:Users|home|private|var)\//mu,
    );
    expect(publicText).not.toMatch(/\b[0-9a-f]{64}\b/iu);
    expect(publicText).not.toMatch(/\b(?:euid|uid|inode)\s*[:=]\s*[0-9]+\b/iu);
    expect(evidence.privacy).toEqual({
      absolute_local_path_values_included: false,
      numeric_user_identity_values_included: false,
      filesystem_identity_values_included: false,
      private_digest_values_included: false,
      sixty_four_hex_values_included: false,
      private_configuration_values_included: false,
    });
    expect(evidence.nonclaims).toMatchObject({
      metadata_only_closure_claimed: false,
      access_time_invariance_claimed: false,
      atomic_filesystem_snapshot_claimed: false,
      arbitrary_same_user_process_isolation_claimed: false,
      production_registry_ready: false,
      production_gate_completed: false,
      playing_strength_established: false,
      stable_high_dan_established: false,
    });
  });

  it("keeps all production and strength counters at the reviewed future gates", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.production_execution_for_this_change).toEqual({
      production_commands: 0,
      production_registry_provisions: 0,
      production_prefix_100_gates: 0,
      production_prefix_500_gates: 0,
      production_final_24000_gates: 0,
      teacher_generation_runs: 0,
      teacher_labels: 0,
      training_runs: 0,
      optimizer_steps: 0,
      candidate_selection_runs: 0,
      candidate_promotions: 0,
      candidate_weight_artifacts: 0,
      formal_ab_games: 0,
      external_calibration_games: 0,
      production_weight_overwrites: 0,
      live_evaluation_activations: 0,
    });
    expect(evidence.playing_strength).toEqual({
      current_production_evaluator: "runOp1",
      current_rollback_evaluator: "runOp1",
      live_weight_changed: false,
      playing_strength_changed_by_this_evidence: false,
      stable_high_dan_claimed: false,
      formal_ab_plan: "192 color-swapped pairs / 384 games",
      formal_ab_color_swapped_pairs: 192,
      formal_ab_total_games: 384,
      external_calibration_games_required: 200,
    });
  });
});
