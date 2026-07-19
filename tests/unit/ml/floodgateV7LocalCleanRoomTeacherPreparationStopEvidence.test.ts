import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-local-clean-room-teacher-first-run-preparation-stop-2026-07-19.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.en.md";

interface PinnedFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly git_blob: string;
  readonly required_markers: readonly string[];
}

function read(relative: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relative), "utf8");
}

function raw(relative: string): Buffer {
  return fs.readFileSync(path.join(repositoryRoot, relative));
}

function git(arguments_: readonly string[]): string {
  return execFileSync("/usr/bin/git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin",
      HOME: "/var/empty",
      LANG: "C",
      LC_ALL: "C",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_OPTIONAL_LOCKS: "0",
    },
  }).trim();
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidenceRelative)) as Record<string, unknown>;
}

describe("Floodgate v7 first local teacher preparation-stop evidence", () => {
  it("pins the stopped attempt and its no-cloud, no-teacher boundary", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema:
        "shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop-evidence-v1",
      evidence_date: "2026-07-19",
      evidence_timezone: "UTC",
      first_operational_attempt: {
        package_script: "shogi:floodgate-v7-local-clean-room-teacher",
        argumentless: true,
        exit_code: 1,
        status: "STOP",
        phase: "preparation",
        retry_disposition: "manual-clean-room-reconciliation-required",
        clean_room_may_exist: true,
        checkpoint_may_exist: false,
        aws_used: false,
        network_used: false,
        live_weight_touched: false,
      },
      diagnosis: {
        aws_or_cloud_related: false,
        source_repository_local_configuration_names: 800,
        previously_forbidden_configuration_names_relevant_to_failure: [
          "http.postBuffer",
        ],
        other_forbidden_configuration_names_observed: 0,
        object_closure_listing_bytes: 1188132,
        previous_git_stdout_cap_bytes: 1048576,
        object_closure_exceeded_previous_cap_bytes: 139556,
        first_actual_stop_cause:
          "file-protocol-inert-http-postbuffer-was-overbroadly-rejected",
        next_deterministic_blocker_discovered_after_isolating_first:
          "complete-object-list-exceeded-one-mibibyte-git-stdout-cap",
        blockers_required_to_clear_before_retry: [
          "file-protocol-inert-http-postbuffer-was-overbroadly-rejected",
          "complete-object-list-exceeded-one-mibibyte-git-stdout-cap",
        ],
      },
      nonactions: {
        teacher_processes_started: 0,
        teacher_parents_completed: 0,
        teacher_rows_created: 0,
        checkpoint_work_created: 0,
        labels_finalized: 0,
        training_runs: 0,
        aws_calls: 0,
        firebase_gcp_calls: 0,
        vercel_runner_calls: 0,
        network_requests: 0,
        live_weight_changes: 0,
        production_activations: 0,
      },
    });
    expect(record.diagnosis).not.toHaveProperty("root_causes");
  });

  it("pins the exact remediation commit, tree, source bytes, and blobs", () => {
    const record = evidence();
    const revision = record.revision as {
      remediation_base_revision: string;
      remediation_revision: string;
      remediation_tree: string;
      pull_request: number;
      pull_request_state_at_recording: string;
      continuous_integration: Record<string, unknown>;
      independent_review: Record<string, unknown>;
      github_review: Record<string, unknown>;
      followup_failure_kind_review_revision: string;
      followup_failure_kind_review_tree: string;
      followup_failure_kind_review_parent: string;
      failure_kind_pull_request_merge_revision: string;
      postmerge_intrinsic_hardening_revision: string;
      postmerge_intrinsic_hardening_tree: string;
      postmerge_intrinsic_hardening_parent: string;
    };
    expect(revision).toEqual(
      expect.objectContaining({
        remediation_base_revision: "acdc3de9c3691d5719260b2d032586a13f5b56be",
        remediation_revision: "9cdaee882e80d7be8667b733505dd86bf3db5923",
        remediation_tree: "1bd82ef2cf11d064fde36e4918eb2d7dfcd5bdaa",
        pull_request: 512,
        pull_request_state_at_recording: "OPEN",
        continuous_integration: {
          result: "PASS",
          run: 29678783495,
          revision: "5eefa61d0c9eca2d6894a289d1e9d12a53957d3d",
          ci_jobs_passed: 12,
          pr_checks_passed: 15,
          failed: 0,
        },
        independent_review: {
          result: "PASS",
          revision: "59c7712f039e30535bc3f6ac1f358c05da5df968",
          tree: "d73bc16214179da3d7078cc6b817c3366522ec33",
          p0: 0,
          p1: 0,
          p2: 0,
          evidence_tests_passed: 31,
          runner_tests_passed: 47,
        },
        github_review: {
          comments: 2,
          comments_addressed: 2,
          unresolved_threads: 0,
          addressed_revision: "5eefa61d0c9eca2d6894a289d1e9d12a53957d3d",
          different_cwd_evidence_tests_passed: 4,
        },
        followup_failure_kind_review_revision:
          "5c00ea324f36e3c3bdd6a77f2f2e7d13ff93690b",
        followup_failure_kind_review_tree:
          "b817b3922595b5ef794c72757e6bba7452f11dc5",
        followup_failure_kind_review_parent:
          "e12d862c2c076db3f24c867cb455922bc83c544c",
        source_pins_refreshed_after_followup_review: true,
        real_teacher_invocation_during_followup_review: false,
        failure_kind_pull_request_merge_revision:
          "5f2569dcf730e709ab36346c559d210fa6a63bf1",
        postmerge_intrinsic_hardening_revision:
          "52145c9f4b7f3ef434db3cfc7d52755e32f11ca5",
        postmerge_intrinsic_hardening_tree:
          "3a8893491eff145849d50752be76cebeefc8cea2",
        postmerge_intrinsic_hardening_parent:
          "5f2569dcf730e709ab36346c559d210fa6a63bf1",
        source_pins_refreshed_after_intrinsic_hardening: true,
        real_teacher_invocation_during_intrinsic_hardening: false,
      }),
    );
    expect(
      git([
        "merge-base",
        "--is-ancestor",
        revision.remediation_revision,
        "HEAD",
      ]),
    ).toBe("");
    expect(
      git(["show", "-s", "--format=%T", revision.remediation_revision]),
    ).toBe(revision.remediation_tree);
    expect(
      git([
        "merge-base",
        "--is-ancestor",
        revision.followup_failure_kind_review_revision,
        "HEAD",
      ]),
    ).toBe("");
    expect(
      git([
        "show",
        "-s",
        "--format=%T",
        revision.followup_failure_kind_review_revision,
      ]),
    ).toBe(revision.followup_failure_kind_review_tree);
    expect(
      git([
        "show",
        "-s",
        "--format=%P",
        revision.followup_failure_kind_review_revision,
      ]),
    ).toBe(revision.followup_failure_kind_review_parent);
    expect(
      git([
        "merge-base",
        "--is-ancestor",
        revision.failure_kind_pull_request_merge_revision,
        "HEAD",
      ]),
    ).toBe("");
    expect(
      git([
        "merge-base",
        "--is-ancestor",
        revision.postmerge_intrinsic_hardening_revision,
        "HEAD",
      ]),
    ).toBe("");
    expect(
      git([
        "show",
        "-s",
        "--format=%T",
        revision.postmerge_intrinsic_hardening_revision,
      ]),
    ).toBe(revision.postmerge_intrinsic_hardening_tree);
    expect(
      git([
        "show",
        "-s",
        "--format=%P",
        revision.postmerge_intrinsic_hardening_revision,
      ]),
    ).toBe(revision.postmerge_intrinsic_hardening_parent);

    const pins = record.source_pins as PinnedFile[];
    expect(pins.map((entry) => entry.path)).toEqual([
      "ml/floodgate-v7-clean-room-teacher-runner.ts",
      "tests/unit/ml/floodgateV7LocalCleanRoomTeacherRunner.test.ts",
    ]);
    for (const entry of pins) {
      const bytes = raw(entry.path);
      expect(bytes.byteLength, entry.path).toBe(entry.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), entry.path).toBe(
        entry.sha256,
      );
      expect(git(["hash-object", entry.path]), entry.path).toBe(entry.git_blob);
      const text = bytes.toString("utf8");
      for (const marker of entry.required_markers) {
        expect(text, `${entry.path}: ${marker}`).toContain(marker);
      }
    }
  });

  it("keeps the remediation narrow and the real-source validation bounded", () => {
    const record = evidence();
    expect(record.remediation).toMatchObject({
      only_http_postbuffer_newly_allowed: true,
      other_http_and_https_controls_still_forbidden: true,
      credential_proxy_filter_include_and_url_rewrite_still_forbidden: true,
      fixed_protocol_allowlist: ["file"],
      git_stdout_cap_bytes: 67108864,
      git_stdout_cap_bounded: true,
      disposable_real_source_materialization: {
        result: "PASS",
        tracked_files_revalidated: 1431,
        source_destination_inode_aliases_allowed: false,
        temporary_copy_removed_after_validation: true,
      },
      focused_vitest: {
        files: 2,
        tests: 21,
        passed: 21,
        failed: 0,
        result: "PASS",
      },
      eslint: "PASS",
      prettier: "PASS",
      diff_check: "PASS",
    });
  });

  it("keeps the bilingual articles aligned on cause, safety, and next gate", () => {
    const record = evidence();
    expect(record.articles).toEqual({
      japanese:
        "../blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.md",
      english:
        "../blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.en.md",
    });
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    for (const marker of [
      "原因はAWSではない",
      "最初の実停止の直接原因",
      "次の必然的blocker",
      "`http.postBuffer`",
      "1,188,132-byte",
      "1,048,576-byte",
      "67,108,864 bytes",
      "1,431 tracked files",
      "teacher process / parents / rows",
      "PR #512",
      "29678783495",
      "15 / 15",
      "live weightは引き続き変更しない",
      path.basename(evidenceRelative),
    ]) {
      expect(japanese, marker).toContain(marker);
    }
    for (const marker of [
      "The cause was not AWS",
      "direct cause of the first actual stop",
      "next deterministic blocker",
      "`http.postBuffer`",
      "1,188,132-byte",
      "1,048,576-byte",
      "67,108,864 bytes",
      "1,431 tracked files",
      "Teacher processes / parents / rows",
      "PR #512",
      "29678783495",
      "15 / 15",
      "Live weights remain unchanged",
      path.basename(evidenceRelative),
    ]) {
      expect(english, marker).toContain(marker);
    }
  });
});
