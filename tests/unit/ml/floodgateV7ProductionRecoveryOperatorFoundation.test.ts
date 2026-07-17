import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as foundation from "../../../ml/floodgate-v7-production-recovery-operator-foundation";

const repositoryRoot = path.resolve(__dirname, "../../..");
const foundationRelative =
  "ml/floodgate-v7-production-recovery-operator-foundation.ts";
const evidenceRelative =
  "docs/data/floodgate-v7-production-recovery-operator-foundation-2026-07-17.json";
const incidentEvidenceRelative =
  "docs/data/floodgate-v7-prefix-100-first-attempt-stop-2026-07-16.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-production-recovery-operator-foundation.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-production-recovery-operator-foundation.en.md";
const incidentJapaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.md";
const incidentEnglishArticleRelative =
  "docs/blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.en.md";
const removedOperationalPaths = [
  "ml/helpers/floodgate-v7-production-recovery-operator-native-launcher.jxa",
  "ml/inspect-floodgate-v7-production-stale-prefix-100-recovery.ts",
  "ml/floodgate-v7-production-recovery-operator-native-launcher-attestation.ts",
  "ml/floodgate-v7-production-recovery-operator-source-authorization.ts",
  "ml/floodgate-v7-production-recovery-operator-source-provenance.ts",
  "tests/fixtures/ml/floodgate-v7-production-recovery-operator-native-launcher-child.ts",
  "tests/fixtures/ml/floodgate-v7-production-recovery-operator-native-launcher-test.jxa",
] as const;

describe("Floodgate v7 non-operational recovery foundation", () => {
  it("has no package-script or repository launcher path", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const scripts = Object.entries(packageJson.scripts ?? {});

    expect(
      scripts.filter(
        ([name, command]) =>
          name.includes("production-recovery") ||
          command.includes("production-recovery"),
      ),
    ).toEqual([]);
    for (const relativePath of removedOperationalPaths) {
      expect(fs.existsSync(path.join(repositoryRoot, relativePath))).toBe(
        false,
      );
    }
  });

  it("exports only a pure contract, external requirement, and STOP reader", () => {
    expect(Object.keys(foundation).sort()).toEqual([
      "FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_FOUNDATION_CONTRACT",
      "FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_EXTERNAL_ATTESTATION_CONTRACT",
      "readFloodgateV7ProductionRecoveryOperatorUnavailableStop",
    ]);

    const source = fs.readFileSync(
      path.join(repositoryRoot, foundationRelative),
      "utf8",
    );
    expect(source).not.toMatch(/^import\s/imu);
    expect(source).not.toContain("require(");
    expect(source).not.toContain("process.");
    expect(source).not.toContain("node:");
    expect(source).not.toContain("tsx/cjs");
    expect(source).not.toContain("osascript");
    expect(source).not.toContain("WeakMap");
    expect(source).not.toContain("authorizeFloodgate");
    expect(source).not.toContain("claimFloodgate");
  });

  it("returns one immutable unavailable STOP marker with zero authority", () => {
    const stop =
      foundation.readFloodgateV7ProductionRecoveryOperatorUnavailableStop();

    expect(Object.isFrozen(stop)).toBe(true);
    expect(
      foundation.readFloodgateV7ProductionRecoveryOperatorUnavailableStop(),
    ).toBe(stop);
    expect(stop).toEqual({
      contract:
        "shogi-floodgate-v7-production-recovery-operator-non-operational-foundation-v1",
      status: "UNAVAILABLE",
      decision: "STOP",
      future_purpose: "inspect-stale-prefix-100",
      required_external_attestation_contract:
        "shogi-floodgate-v7-production-recovery-operator-external-approved-commit-tree-attestation-v1",
      operational_entrypoint_available: false,
      production_issuer_available: false,
      repository_self_authorization_available: false,
      external_trust_root_installed: false,
      approved_revision_enrolled: false,
      approved_tree_enrolled: false,
      source_authorized: false,
      production_state_inspected: false,
      registry_accessed: false,
      lease_accessed: false,
      stage_accessed: false,
      work_accessed: false,
      deployment_key_accessed: false,
      persistent_mutation_performed: false,
      live_weight_changed: false,
      sensitive_values_disclosed: false,
    });
  });

  it("records the deleted authority and open external trust requirements", () => {
    const evidence = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, evidenceRelative), "utf8"),
    );
    const japanese = fs.readFileSync(
      path.join(repositoryRoot, japaneseArticleRelative),
      "utf8",
    );
    const english = fs.readFileSync(
      path.join(repositoryRoot, englishArticleRelative),
      "utf8",
    );

    expect(evidence.schema).toBe(
      "shogi-floodgate-v7-production-recovery-operator-non-operational-foundation-evidence-v2",
    );
    expect(evidence.non_operational_redesign).toMatchObject({
      package_recovery_command_available: false,
      repository_jxa_launcher_available: false,
      repository_native_attestation_available: false,
      production_tsx_preload_available: false,
      production_source_authorizer_available: false,
      production_capability_issuer_available: false,
      production_capability_claim_available: false,
      production_cli_available: false,
      source_authorized: false,
    });
    expect(evidence.candidate_delivery).toMatchObject({
      latest_main_revision_integrated:
        "f1cc9bb9ad80af6916a5a9112f4128b38adc887b",
      latest_main_integration_method: "regular-merge-commit",
      latest_main_integration_commit:
        "beb1dc817b0c2dd2cc6891dca31d64d7b94e7384",
    });
    expect(evidence.future_external_trust_requirements).toMatchObject({
      implemented_by_this_pull_request: false,
      launcher_installed_outside_repository_required: true,
      authenticated_create_only_approved_commit_enrollment_required: true,
      authenticated_create_only_approved_tree_enrollment_required: true,
      head_must_equal_approved_revision: true,
      absolute_git_directory_closure_required: true,
      git_common_directory_closure_required: true,
      git_object_directory_closure_required: true,
      repository_local_production_issuer_permitted: false,
    });
    expect(evidence.validation_at_evidence_capture).toMatchObject({
      validation_head: "29b37ec25d5acd334a26d199c2617249f202e932",
      non_operational_contract_focused_tests: {
        status: "PASS",
        passed: 5,
        total: 5,
      },
      full_vitest: {
        status: "PASS",
        files: 167,
        passed: 3078,
        total: 3078,
        max_workers: 4,
        duration_seconds: 303.47,
        runtime: "node-v22.13.0",
      },
      production_build: "PASS",
      latest_main_integration_head: "beb1dc817b0c2dd2cc6891dca31d64d7b94e7384",
      post_latest_main_affected_validation: {
        vitest: {
          status: "PASS",
          files: 2,
          passed: 11,
          total: 11,
        },
        python_stdlib: {
          status: "PASS",
          passed: 68,
          total: 68,
        },
        production_build: "PASS",
        typescript_typecheck: "PASS",
        changed_file_eslint: "PASS",
        format: "PASS",
        json_parse: "PASS",
        git_diff_check: "PASS",
      },
      redesigned_final_head_github_ci: "PENDING",
      redesigned_final_head_independent_review: "PENDING",
    });
    for (const article of [japanese, english]) {
      expect(article).toContain("33a1ebee795b16bc38e8b98fb99ad2b31a2544a7");
      expect(article).toContain("UNAVAILABLE / STOP");
      expect(article).toContain("600,000");
    }
    expect(japanese).not.toContain("実行可能な唯一のpurpose");
    expect(english).not.toContain("sole executable purpose");
  });

  it("records the exact-final-head diagnostic without a false post-merge claim", () => {
    const evidence = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, evidenceRelative), "utf8"),
    );
    const incidentEvidence = JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, incidentEvidenceRelative),
        "utf8",
      ),
    );
    const incidentJapanese = fs.readFileSync(
      path.join(repositoryRoot, incidentJapaneseArticleRelative),
      "utf8",
    );
    const incidentEnglish = fs.readFileSync(
      path.join(repositoryRoot, incidentEnglishArticleRelative),
      "utf8",
    );
    const chronology = {
      run_started_after_merge: false,
      run_started_before_merge_derived: true,
      merge_occurred_during_run_derived: true,
      result_recorded_after_merge: true,
      post_merge_deployment_execution_established: false,
    };

    expect(evidence.exact_final_head_read_only_diagnostic).toMatchObject({
      ...chronology,
      evidence_pull_request_state: "MERGED",
      evidence_pull_request_final_head:
        "cb3fd9697a8d5dfc5402c0a73b2a1e110a6adbff",
      evidence_pull_request_merge_commit:
        "bf643ceedb78c5103019609f7991f1a9f9664fef",
      candidate_count: 12,
      fulfilled_count: 7,
      rejected_count: 5,
      broadcast_failure_kind: "search-timeout",
      broadcast_timeout_ms: 600000,
      all_five_rejections_independently_timed_out_established: false,
    });
    expect(
      incidentEvidence.root_cause_status
        .exact_final_head_safe_failure_kind_confirmation,
    ).toMatchObject({
      evidence_pull_request_state: "MERGED",
      evidence_pull_request_final_head:
        "cb3fd9697a8d5dfc5402c0a73b2a1e110a6adbff",
      evidence_pull_request_merge_commit:
        "bf643ceedb78c5103019609f7991f1a9f9664fef",
      run_started_after_merge: false,
      merge_occurred_during_run_derived: true,
      result_recorded_after_merge: true,
      post_merge_deployment_execution_established: false,
      candidate_count: 12,
      fulfilled_count: 7,
      rejected_count: 5,
      first_pool_failure_kind: "search-timeout",
      timeout_ms: 600000,
      historical_incident_attempt_retroactively_reclassified: false,
    });
    expect(incidentEvidence.counters).toMatchObject({
      exact_final_head_read_only_diagnostic_runs: 1,
      diagnostic_runs_started_after_regular_merge: 0,
      post_merge_deployment_diagnostic_runs: 0,
      production_gate_invocations_for_diagnostics: 0,
    });
    expect(incidentJapanese).toContain("merge前に開始");
    expect(incidentEnglish).toContain("began before merge");
    expect(incidentJapanese).not.toContain("同じ12件も再実行していない");
    expect(incidentEnglish).not.toContain(
      "the same twelve candidates remain unrun",
    );
  });
});
