import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-exact24k-ci-parallel-shards-2026-07-18.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-exact24k-ci-parallel-shards.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-exact24k-ci-parallel-shards.en.md";

interface CandidateSnapshot {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function git(...arguments_: string[]): Buffer {
  return execFileSync("git", ["--no-replace-objects", ...arguments_], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function evidence() {
  return JSON.parse(read(evidenceRelative));
}

describe("exact-24k CI parallel-shard evidence", () => {
  it("keeps the current branch non-production while recording post-merge main CI", () => {
    const record = evidence();

    expect(record).toMatchObject({
      schema: "shogi-floodgate-exact24k-ci-parallel-shards-evidence-v1",
      evidence_date: "2026-07-18",
      evidence_timezone: "America/Los_Angeles",
      publication_state: {
        status:
          "LOCAL-PASS-AWS-MERGED-POST-MERGE-MAIN-CI-PASS-CURRENT-BRANCH-GITHUB-CI-PENDING",
        claims_final: false,
        local_validation_final: true,
        github_ci_measured: false,
        post_merge_main_ci_measured: true,
        current_branch_github_ci_measured: false,
      },
      scope: {
        test_workflow_documentation_only: true,
        production_ml_source_files_changed: 0,
        application_source_files_changed: 0,
        package_json_changed: false,
        package_lock_changed: false,
        teacher_generation_performed: false,
        training_performed: false,
        candidate_selection_performed: false,
        formal_ab_performed: false,
        external_calibration_performed: false,
        production_execution_performed: false,
        live_evaluator_changed: false,
        live_weights_changed: false,
      },
      ci_contract: {
        required_aggregate_name: "Test and build",
        required_aggregate_if_always: true,
        aws_witness_adapter_contract_present_in_initial_base: false,
        aws_witness_adapter_contract_present_after_main_sync: true,
        aws_aggregate_edge_status: "REQUIRED-AND-WIRED",
        verifier_requires_aws_job_unconditionally: true,
        verifier_rejects_aws_job_and_aggregate_edge_deletion: true,
        aws_contract_scope: "SOURCE-ONLY",
        aws_production_connected: false,
        github_ci_critical_path_seconds: null,
        github_ci_critical_path_status: "CURRENT-BRANCH-UNMEASURED",
      },
      remote_ci: {
        post_merge_main_ci: {
          run_id: 29672131794,
          status: "PASS",
          checks_passed: 5,
          checks_total: 5,
        },
        post_merge_main_security: {
          run_id: 29672131782,
          status: "PASS",
          checks_passed: 1,
          checks_total: 1,
        },
        current_exact24k_branch: {
          status: "PENDING-NOT-YET-RUN",
          pull_request: null,
          production_authorization: false,
        },
      },
    });
  });

  it("pins the implementation, AWS merge, main sync, and rereview revisions", () => {
    const record = evidence();
    const {
      base_revision: base,
      test_split_revision: split,
      ci_wiring_revision: ci,
      audit_hardening_revision: audit,
      aws_merge_revision: awsMerge,
      main_sync_revision: mainSync,
      first_rereview_revision: firstRereview,
      second_rereview_revision: secondRereview,
    } = record.revision;

    expect(git("merge-base", "--is-ancestor", base, split)).toHaveLength(0);
    expect(git("merge-base", "--is-ancestor", split, ci)).toHaveLength(0);
    expect(git("merge-base", "--is-ancestor", ci, audit)).toHaveLength(0);
    expect(git("merge-base", "--is-ancestor", awsMerge, mainSync)).toHaveLength(
      0,
    );
    expect(git("merge-base", "--is-ancestor", audit, mainSync)).toHaveLength(0);
    expect(
      git("merge-base", "--is-ancestor", mainSync, firstRereview),
    ).toHaveLength(0);
    expect(
      git("merge-base", "--is-ancestor", firstRereview, secondRereview),
    ).toHaveLength(0);
    expect(git("show", "-s", "--format=%T", ci).toString().trim()).toBe(
      record.revision.ci_wiring_tree,
    );
    expect(git("show", "-s", "--format=%T", audit).toString().trim()).toBe(
      record.revision.audit_hardening_tree,
    );
    expect(git("show", "-s", "--format=%T", awsMerge).toString().trim()).toBe(
      record.revision.aws_merge_tree,
    );
    expect(git("show", "-s", "--format=%T", mainSync).toString().trim()).toBe(
      record.revision.main_sync_tree,
    );
    expect(
      git("show", "-s", "--format=%T", firstRereview).toString().trim(),
    ).toBe(record.revision.first_rereview_tree);
    expect(
      git("show", "-s", "--format=%T", secondRereview).toString().trim(),
    ).toBe(record.revision.second_rereview_tree);

    for (const snapshot of record.committed_candidate_snapshots as CandidateSnapshot[]) {
      const bytes = git("show", `${ci}:${snapshot.path}`);
      expect(bytes.byteLength, snapshot.path).toBe(snapshot.bytes);
      expect(sha256(bytes), snapshot.path).toBe(snapshot.sha256);
    }
    for (const snapshot of record.audit_hardening_snapshots as CandidateSnapshot[]) {
      const bytes = git("show", `${audit}:${snapshot.path}`);
      expect(bytes.byteLength, snapshot.path).toBe(snapshot.bytes);
      expect(sha256(bytes), snapshot.path).toBe(snapshot.sha256);
    }
    for (const snapshot of record.rereview_hardening_snapshots as CandidateSnapshot[]) {
      const bytes = git("show", `${secondRereview}:${snapshot.path}`);
      expect(bytes.byteLength, snapshot.path).toBe(snapshot.bytes);
      expect(sha256(bytes), snapshot.path).toBe(snapshot.sha256);
    }

    const changed = git("diff", "--name-only", `${base}..${ci}`)
      .toString("utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(changed).not.toContain("package.json");
    expect(changed).not.toContain("package-lock.json");
    expect(
      changed.filter(
        (candidate) =>
          candidate.startsWith("ml/") ||
          candidate.startsWith("src/") ||
          candidate.startsWith("public/"),
      ),
    ).toEqual([]);
  });

  it("records the exact measured test counts and local critical path", () => {
    const record = evidence();

    expect(record.split_contract).toMatchObject({
      exact_parent_count: 24_000,
      gates: [100, 500, 24_000],
      scanner_shards: 5,
      scanner_runtime_tests: 19,
      conceptual_case_ids: 19,
      conceptual_case_duplicate_ids: 0,
      conceptual_case_missing_ids: 0,
      teacher_direct_it_titles: 40,
      teacher_runtime_titles: 49,
      core_explicit_exclusions: 6,
      vitest_title_filter_used: false,
      vitest_generic_shard_used: false,
      each_scanner_shard_builds_fresh_fixture: true,
      each_scanner_shard_runs_all_exact_gates: true,
    });
    expect(record.scanner_parallel_validation).toMatchObject({
      status: "PASS",
      parallel_process_wall_seconds: 138.589,
      sum_individual_process_wall_seconds: 542.92,
      files_passed: 5,
      test_suites_passed: 10,
      tests_passed: 19,
      tests_failed: 0,
      reports_exact_file_and_runtime_case_set_verified: 5,
    });
    expect(record.teacher_validation).toMatchObject({
      status: "PASS",
      process_wall_seconds: 101.16,
      direct_it_titles: 40,
      runtime_tests: 49,
      tests_passed: 49,
      tests_failed: 0,
      exact_file_and_all_runtime_titles_verified: true,
    });
    expect(record.core_validation).toMatchObject({
      status: "PASS",
      process_wall_seconds: 81.54,
      test_files: 187,
      tests_total: 3230,
      tests_passed: 3229,
      tests_failed: 0,
      tests_pending: 1,
    });
    expect(record.local_test_only_critical_path).toEqual({
      seconds: 138.589,
      source: "five concurrent scanner shard processes",
      github_ci_inference_allowed: false,
    });
    expect(record.supporting_validation).toMatchObject({
      inventory_and_adversarial_verifier_tests: {
        status: "PASS",
        files: 1,
        tests_passed: 13,
        tests_failed: 0,
      },
      first_rereview_focused_validation: {
        status: "PASS",
        runtime_not_separately_recorded: true,
        files: 5,
        tests_passed: 37,
        tests_failed: 0,
      },
      second_rereview_focused_validation: {
        status: "PASS",
        runtime: "node-22.13.0",
        files: 5,
        tests_passed: 37,
        tests_failed: 0,
      },
      dependency_free_ml_contracts: {
        status: "PASS",
        tests_passed: 119,
        tests_failed: 0,
        process_wall_seconds: 11.59,
      },
      production_build: {
        status: "PASS",
        process_wall_seconds: 28.87,
      },
    });
  });

  it("publishes matching bilingual limits, findings, and next gates", () => {
    const record = evidence();
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    for (const marker of [
      "138.589",
      "101.16",
      "81.54",
      "3.917",
      "19",
      "49",
      "AWS",
      "PENDING",
      "42d8757d",
      "2a903151",
      "29672131794",
      "29672131782",
      "P1",
      "P2",
      "source-only",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
    expect(record.intermediate_findings).toHaveLength(3);
    expect(record.audit_findings).toHaveLength(4);
    expect(
      record.audit_findings.map(
        ({ severity }: { severity: string }) => severity,
      ),
    ).toEqual(["P1", "P1", "P2", "P2"]);
    expect(record.rereview_history).toHaveLength(2);
    expect(
      record.rereview_history.map(
        ({
          finding_counts: counts,
        }: {
          finding_counts: { P1: number; P2: number };
        }) => counts,
      ),
    ).toEqual([
      { P1: 1, P2: 2 },
      { P1: 1, P2: 1 },
    ]);
    expect(record.next_gates).toEqual([
      "complete-final-local-validation",
      "exact-review-local-commits",
      "open-ready-for-review-pr",
      "measure-and-pass-current-branch-github-ci",
      "address-review-comments",
      "normal-merge",
    ]);
    expect(japanese).toContain("ライブ重みは変えない");
    expect(english).toContain("live weights remain unchanged");
  });
});
