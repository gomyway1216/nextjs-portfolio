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
  it("keeps publication local-only and every production counter at zero", () => {
    const record = evidence();

    expect(record).toMatchObject({
      schema: "shogi-floodgate-exact24k-ci-parallel-shards-evidence-v1",
      evidence_date: "2026-07-18",
      evidence_timezone: "America/Los_Angeles",
      publication_state: {
        status: "LOCAL-PASS-AWS-SYNC-REVIEW-GITHUB-CI-PENDING",
        claims_final: false,
        local_validation_final: true,
        github_ci_measured: false,
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
        aws_witness_adapter_contract_present_in_base: false,
        aws_aggregate_edge_status: "PENDING-AFTER-AWS-PR-MERGE-AND-MAIN-SYNC",
        github_ci_critical_path_seconds: null,
        github_ci_critical_path_status: "UNMEASURED",
      },
    });
  });

  it("pins the two committed implementation revisions and their exact files", () => {
    const record = evidence();
    const {
      base_revision: base,
      test_split_revision: split,
      ci_wiring_revision: ci,
    } = record.revision;

    expect(git("merge-base", "--is-ancestor", base, split)).toHaveLength(0);
    expect(git("merge-base", "--is-ancestor", split, ci)).toHaveLength(0);
    expect(git("show", "-s", "--format=%T", ci).toString().trim()).toBe(
      record.revision.ci_wiring_tree,
    );

    for (const snapshot of record.committed_candidate_snapshots as CandidateSnapshot[]) {
      const bytes = git("show", `${ci}:${snapshot.path}`);
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
      scanner_runtime_tests: 5,
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
      parallel_process_wall_seconds: 135.12,
      sum_individual_process_wall_seconds: 530.07,
      files_passed: 5,
      tests_passed: 5,
      tests_failed: 0,
      reports_exact_file_and_title_verified: 5,
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
      process_wall_seconds: 80.86,
      test_files: 186,
      tests_total: 3222,
      tests_passed: 3221,
      tests_failed: 0,
      tests_pending: 1,
    });
    expect(record.local_test_only_critical_path).toEqual({
      seconds: 135.12,
      source: "five concurrent scanner shard processes",
      github_ci_inference_allowed: false,
    });
  });

  it("publishes matching bilingual limits, findings, and next gates", () => {
    const record = evidence();
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    for (const marker of [
      "135.12",
      "101.16",
      "80.86",
      "3.92",
      "49",
      "AWS",
      "PENDING",
    ]) {
      expect(japanese).toContain(marker);
      expect(english).toContain(marker);
    }
    expect(record.intermediate_findings).toHaveLength(3);
    expect(record.next_gates).toEqual([
      "exact-review-local-commits",
      "merge-aws-witness-adapter-contract-first",
      "sync-latest-main",
      "add-aws-witness-adapter-contract-to-required-aggregate-needs-and-result-check",
      "rerun-local-validation",
      "open-ready-for-review-pr",
      "measure-and-pass-github-ci",
      "address-review-comments",
      "normal-merge",
    ]);
    expect(japanese).toContain("ライブ重みは変えない");
    expect(english).toContain("live weights remain unchanged");
  });
});
