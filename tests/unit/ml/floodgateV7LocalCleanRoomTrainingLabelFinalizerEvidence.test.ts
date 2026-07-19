import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.en.md";
const readmeRelative = "ml/README.md";
const hermeticGitEnvironment: NodeJS.ProcessEnv = {
  PATH: "/usr/bin:/bin",
  HOME: "/var/empty",
  LANG: "C",
  LC_ALL: "C",
  NODE_ENV: "test",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_OPTIONAL_LOCKS: "0",
};

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

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidenceRelative)) as Record<string, unknown>;
}

function git(arguments_: readonly string[]): string {
  return execFileSync("/usr/bin/git", ["--no-replace-objects", ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: hermeticGitEnvironment,
  }).trim();
}

function gitIsAncestor(ancestor: string, descendant: string): boolean {
  const result = spawnSync(
    "/usr/bin/git",
    [
      "--no-replace-objects",
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: hermeticGitEnvironment,
    },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `git merge-base failed with status ${String(result.status)}: ${result.stderr.trim()}`,
  );
}

describe("Floodgate v7 local training-label finalizer evidence", () => {
  it("pins the exact integrated implementation commit, tree, parents, and ancestry", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema:
        "shogi-floodgate-v7-local-clean-room-training-label-finalizer-evidence-v1",
      status:
        "implementation-local-validation-and-independent-rereview-pass-operational-stop",
      source_base: {
        merge_base_with_origin_main: "88afd052c00865b4e7fce4ed25d81a94febb1637",
        origin_main_observed_at_recording:
          "88afd052c00865b4e7fce4ed25d81a94febb1637",
        pull_request_512_state: "MERGED",
        integrated_via_regular_merge_commit:
          "4855f099a397f7cd5d71d827e12dd10780ae6a30",
        history_rewritten: false,
      },
      implementation: {
        authority_isolation_commit: "5686f9ab5b31aa4383792778ac75ec1a90818e9b",
        evidence_verification_commit:
          "2d7f391824c0f520d168a64005361566a8edb73d",
        integrated_origin_main_commit:
          "88afd052c00865b4e7fce4ed25d81a94febb1637",
        integration_merge_commit: "4855f099a397f7cd5d71d827e12dd10780ae6a30",
        readme_evidence_authority_commit:
          "71d1d05d9387f312942a86c3f897e01b5fc52dd4",
        bom_framing_hardening_commit:
          "9470fb5ccba823e62e64d7f17a1bec48530bf5c7",
        validated_head: "9470fb5ccba823e62e64d7f17a1bec48530bf5c7",
        validated_tree: "54aa3e7c5a65fbf19742cc04f16548af7f918884",
      },
    });
    const implementation = record.implementation as {
      initial_source_commit: string;
      receipt_and_cleanup_hardening_commit: string;
      durable_replay_and_mac_gate_commit: string;
      test_commit: string;
      authority_isolation_commit: string;
      evidence_verification_commit: string;
      integrated_origin_main_commit: string;
      integration_merge_commit: string;
      readme_evidence_authority_commit: string;
      bom_framing_hardening_commit: string;
      validated_head: string;
      validated_tree: string;
    };
    for (const revision of [
      implementation.initial_source_commit,
      implementation.receipt_and_cleanup_hardening_commit,
      implementation.durable_replay_and_mac_gate_commit,
      implementation.test_commit,
      implementation.authority_isolation_commit,
      implementation.evidence_verification_commit,
      implementation.integrated_origin_main_commit,
      implementation.integration_merge_commit,
      implementation.readme_evidence_authority_commit,
      implementation.bom_framing_hardening_commit,
    ]) {
      expect(gitIsAncestor(revision, "HEAD"), revision).toBe(true);
    }
    expect(implementation.validated_head).toBe(
      implementation.bom_framing_hardening_commit,
    );
    expect(
      git(["show", "-s", "--format=%T", implementation.validated_head]),
    ).toBe(implementation.validated_tree);
    expect(
      git(["show", "-s", "--format=%P", implementation.validated_head]).split(
        " ",
      ),
    ).toEqual([implementation.readme_evidence_authority_commit]);
    expect(
      git([
        "show",
        "-s",
        "--format=%P",
        implementation.integration_merge_commit,
      ]).split(" "),
    ).toEqual([
      implementation.evidence_verification_commit,
      implementation.integrated_origin_main_commit,
    ]);
    expect(
      git([
        "merge-base",
        implementation.validated_head,
        implementation.integrated_origin_main_commit,
      ]),
    ).toBe(implementation.integrated_origin_main_commit);

    const compatibility =
      record.required_teacher_runner_compatibility as Record<
        string,
        string | boolean
      >;
    for (const key of [
      "preserved_commit",
      "key_boundary_fix_commit",
      "key_and_lease_test_commit",
      "format_commit",
      "pull_request_512_merge_commit",
      "pull_request_512_verifier_materialization_commit",
    ]) {
      const revision = compatibility[key];
      expect(typeof revision).toBe("string");
      expect(
        gitIsAncestor(revision as string, "HEAD"),
        `${key}: ${revision}`,
      ).toBe(true);
    }
  });

  it("recomputes every pinned byte count, SHA-256, Git blob, and marker", () => {
    const record = evidence();
    const implementation = record.implementation as {
      validated_head: string;
      files: Record<string, PinnedFile>;
    };
    const pins = Object.values(implementation.files);
    expect(pins.map((entry) => entry.path)).toEqual([
      "ml/floodgate-v7-local-clean-room-training-label-finalizer.ts",
      "ml/run-floodgate-v7-local-clean-room-training-label-finalizer.ts",
      "tests/unit/ml/floodgateV7LocalCleanRoomTrainingLabelFinalizer.test.ts",
      "package.json",
    ]);
    for (const pin of pins) {
      const bytes = raw(pin.path);
      expect(bytes.byteLength, pin.path).toBe(pin.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), pin.path).toBe(
        pin.sha256,
      );
      expect(git(["hash-object", "--", pin.path]), pin.path).toBe(pin.git_blob);
      expect(
        git(["rev-parse", `${implementation.validated_head}:${pin.path}`]),
        `${implementation.validated_head}:${pin.path}`,
      ).toBe(pin.git_blob);
      const text = bytes.toString("utf8");
      for (const marker of pin.required_markers) {
        expect(text, `${pin.path}: ${marker}`).toContain(marker);
      }
    }
  });

  it("locks the production-authority isolation and zero operational state", () => {
    const record = evidence();
    expect(record.execution_boundary).toMatchObject({
      platform: "darwin-only",
      dedicated_entrypoint_required: true,
      exact_no_argument_argv_required: true,
      test_seam_accepts_executable_dependencies: false,
      test_seam_can_reach_production_authority: false,
      production_authority_requires_module_private_one_shot_grant: true,
      production_authority_grant_minted_after_durable_claim: true,
    });
    expect(record.review).toMatchObject({
      remediation: {
        durable_replay_claim: "IMPLEMENTED",
        darwin_and_dedicated_entry_gate: "IMPLEMENTED",
        production_authority_test_seam_isolation: "IMPLEMENTED",
        executable_dependency_injection_test: "PASS",
        evidence_pin_ci_verification: "IMPLEMENTED",
        pull_request_512_regular_merge_integration: "IMPLEMENTED",
        readme_machine_evidence_authority: "IMPLEMENTED",
        leading_utf8_bom_rejection: "IMPLEMENTED",
        pull_request_513_review_threads_replied_and_resolved: 2,
      },
      pull_request_513_independent_rereview_findings: {
        P0: 0,
        P1: 0,
        P2: 2,
      },
      exact_post_remediation_independent_rereview: {
        commit: "9470fb5ccba823e62e64d7f17a1bec48530bf5c7",
        tree: "54aa3e7c5a65fbf19742cc04f16548af7f918884",
        P0: 0,
        P1: 0,
        P2: 0,
        result: "PASS",
      },
    });
    expect(record.private_handoff).toMatchObject({
      canonical_single_line_utf8_json_required: true,
      leading_utf8_bom_allowed: false,
    });
    expect(record.local_validation).toMatchObject({
      related_suite: {
        test_files: 21,
        tests: 199,
        passed: 199,
        failed: 0,
        wall_duration_seconds: 141.35,
        parallel_aggregate_test_seconds: 573.43,
        result: "PASS",
      },
      pull_request_512_integration_focus: {
        test_files: 6,
        tests: 62,
        passed: 62,
        failed: 0,
        result: "PASS",
      },
    });
    expect(record.external_services).toEqual({
      aws_api_or_sdk_used: false,
      firebase_or_gcp_used: false,
      vercel_used: false,
      http_or_network_used: false,
      host_not_on_aws_universally_proven: false,
    });
    expect(record.publication).toEqual({
      branch: "codex/local-clean-room-training-label-finalizer",
      branch_pushed: true,
      pull_request: 513,
      pull_request_url:
        "https://github.com/gomyway1216/nextjs-portfolio/pull/513",
      pull_request_state_observed: "OPEN",
      pull_request_draft: false,
      base_branch: "main",
      head_at_pull_request_creation: "0aba60d3bd36610fe01bd6446c125a2a855f16ee",
      latest_independently_reviewed_head:
        "9470fb5ccba823e62e64d7f17a1bec48530bf5c7",
      review_threads_resolved: 2,
      merged: false,
    });
    const operational = record.operational_state as Record<string, unknown>;
    for (const key of [
      "real_fixed_path_finalizer_invocations",
      "real_fixed_path_durable_claims_created_by_this_change",
      "real_teacher_processes_started_by_this_change",
      "real_teacher_rows_created_by_this_change",
      "real_training_label_publications",
      "optimizer_training_runs",
      "candidate_selection_runs",
      "formal_ab_games",
      "external_calibration_games",
      "production_activations",
    ]) {
      expect(operational[key], key).toBe(0);
    }
    expect(operational.live_weights_changed).toBe(false);
    expect(operational.pull_request_created_by_this_worktree).toBe(true);
    expect(operational.branch_pushed_by_this_worktree).toBe(true);

    const source = read(
      "ml/floodgate-v7-local-clean-room-training-label-finalizer.ts",
    );
    const testEntry = source.indexOf(
      "export async function runFloodgateV7LocalCleanRoomTrainingLabelFinalizerCoreForTests",
    );
    const commandContext = source.indexOf(
      "function assertOperationalCommandContext",
      testEntry,
    );
    expect(testEntry).toBeGreaterThanOrEqual(0);
    expect(commandContext).toBeGreaterThan(testEntry);
    const exportedTestBoundary = source.slice(testEntry, commandContext);
    expect(exportedTestBoundary).not.toContain("PRODUCTION_DEPENDENCIES");
    expect(exportedTestBoundary).not.toContain(
      "authorizeFloodgateTeacherStage",
    );
    expect(source).not.toContain(
      "export interface FloodgateV7LocalCleanRoomTrainingLabelFinalizerDependencies",
    );
    expect(source).toContain(
      "return executeOperationalFinalizer(mintOperationalFinalizerGrant(), handoff);",
    );
  });

  it("keeps the articles and README aligned on the remediated boundary", () => {
    const record = evidence();
    expect(record.articles).toEqual({
      japanese:
        "../blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.md",
      english:
        "../blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.en.md",
    });
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    for (const marker of [
      "実行可能dependencyを受け取らない",
      "module-private one-shot grant",
      "durable claim",
      "27 / 27 PASS",
      "199 / 199 PASS",
      "PR #512",
      "PR #513",
      "4855f099",
      "valid MAC付き先頭UTF-8 BOM",
      "P0 / P1 / P2が0 / 0 / 0",
      path.basename(evidenceRelative),
    ]) {
      expect(japanese, marker).toContain(marker);
    }
    for (const marker of [
      "accepts no executable dependencies",
      "module-private one-shot grant",
      "durable claim",
      "27 / 27 PASS",
      "199 / 199 PASS",
      "PR #512",
      "PR #513",
      "4855f099",
      "leading UTF-8 BOM with a valid MAC",
      "zero remaining P0, P1, or P2 findings",
      path.basename(evidenceRelative),
    ]) {
      expect(english, marker).toContain(marker);
    }

    const readme = read(readmeRelative);
    expect(readme).toContain(
      "[machine evidence](../docs/data/floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json)",
    );
    expect(readme).toContain("唯一のauthoritative record");
    expect(readme).not.toContain("identityはfinalizer");
    expect(readme).not.toContain("focused 21 / 21、関連168 / 168");
  });
});
