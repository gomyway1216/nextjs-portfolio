import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-local-clean-room-teacher-runner-2026-07-19.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-teacher-runner.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-clean-room-teacher-runner.en.md";

interface PinnedFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly git_blob: string;
  readonly required_markers?: readonly string[];
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function raw(relativePath: string): Buffer {
  return fs.readFileSync(path.join(repositoryRoot, relativePath));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidenceRelative)) as Record<string, unknown>;
}

function gitOutput(arguments_: readonly string[]): string {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin",
    },
  }).trim();
}

function gitIsAncestor(ancestor: string, descendant: string): boolean {
  const result = spawnSync(
    "git",
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
      env: {
        LANG: "C",
        LC_ALL: "C",
        NODE_ENV: "test",
        PATH: "/usr/bin:/bin",
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `git merge-base --is-ancestor failed with status ${String(result.status)}: ${result.stderr?.trim() ?? ""}`,
  );
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

describe("Floodgate v7 explicit local clean-room teacher evidence", () => {
  it("pins the reviewed implementation and post-main integration revisions", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema: "shogi-floodgate-v7-local-clean-room-teacher-runner-evidence-v1",
      evidence_date: "2026-07-19",
      evidence_timezone: "UTC",
      revision: {
        initial_implementation_revision:
          "629f2a689ad0ce6b79f7f287fa27512eab67572d",
        initial_implementation_tree: "66333d4b1db8d4f49bd1e3fa04bd5ac60693a5d2",
        test_revision: "75e84919b01e587dd0fc5fdfe6698f94410ce413",
        test_tree: "f437dd3984c17a9adde4f94dd2afb986f9607ce2",
        reviewed_remediation_revision:
          "5e4f42d8a8a38bf7790cbff91dd6cd8a32b6fe49",
        reviewed_remediation_tree: "6b882b8cea5a3a9322b4649e824ccd524090cfc8",
        latest_main_revision_integrated:
          "1f98c3661361254bbc0854fa52888ed4b65bc689",
        integration_revision: "30663f7f496382a0f9082d22cc2c8fb09a10dca7",
        integration_tree: "1ef5aa8c0626d8b5c08795bf6a9852601a1712be",
        integration_parents: [
          "5e4f42d8a8a38bf7790cbff91dd6cd8a32b6fe49",
          "1f98c3661361254bbc0854fa52888ed4b65bc689",
        ],
        reviewed_paths_unchanged_by_integration_merge: true,
        pull_request: null,
        continuous_integration: "PENDING",
      },
    });

    const revision = record.revision as {
      initial_implementation_revision: string;
      initial_implementation_tree: string;
      test_revision: string;
      test_tree: string;
      reviewed_remediation_revision: string;
      reviewed_remediation_tree: string;
      latest_main_revision_integrated: string;
      integration_revision: string;
      integration_tree: string;
      integration_parents: string[];
    };
    for (const [commit, tree] of [
      [
        revision.initial_implementation_revision,
        revision.initial_implementation_tree,
      ],
      [revision.test_revision, revision.test_tree],
      [
        revision.reviewed_remediation_revision,
        revision.reviewed_remediation_tree,
      ],
      [revision.integration_revision, revision.integration_tree],
    ]) {
      expect(gitIsAncestor(commit, "HEAD"), commit).toBe(true);
      expect(
        gitOutput([
          "--no-replace-objects",
          "show",
          "-s",
          "--format=%T",
          commit,
        ]),
        commit,
      ).toBe(tree);
    }
    expect(
      gitIsAncestor(revision.latest_main_revision_integrated, "HEAD"),
    ).toBe(true);
    expect(
      gitOutput([
        "--no-replace-objects",
        "show",
        "-s",
        "--format=%P",
        revision.integration_revision,
      ]),
    ).toBe(revision.integration_parents.join(" "));
  });

  it("pins every operational source and focused-test byte snapshot", () => {
    const record = evidence();
    const sourcePins = record.source_pins as PinnedFile[];
    const focusedPins = record.focused_test_pins as PinnedFile[];

    expect(sourcePins.map((entry) => entry.path)).toEqual([
      "ml/floodgate-git.ts",
      "ml/floodgate-v7-clean-room-run-gates.ts",
      "ml/floodgate-v7-clean-room-teacher-runner.ts",
      "ml/floodgate-v7-local-clean-room-teacher-cli.ts",
      "ml/floodgate-v7-local-clean-room-teacher-runner.ts",
      "ml/run-floodgate-v7-local-clean-room-teacher.ts",
      "package.json",
    ]);
    expect(focusedPins.map((entry) => entry.path)).toEqual([
      "tests/unit/ml/floodgateGit.test.ts",
      "tests/unit/ml/floodgateV7CleanRoomTeacherRunner.test.ts",
      "tests/unit/ml/floodgateV7CleanRoomRunGates.test.ts",
      "tests/unit/ml/floodgateV7LocalCleanRoomTeacherRunner.test.ts",
    ]);

    for (const entry of [...sourcePins, ...focusedPins]) {
      const bytes = raw(entry.path);
      expect(bytes.byteLength, entry.path).toBe(entry.bytes);
      expect(sha256(bytes), entry.path).toBe(entry.sha256);
      expect(
        gitOutput(["--no-replace-objects", "hash-object", entry.path]),
        entry.path,
      ).toBe(entry.git_blob);
      const source = bytes.toString("utf8");
      for (const marker of entry.required_markers ?? []) {
        expect(source, `${entry.path}: ${marker}`).toContain(marker);
      }
    }
  });

  it("fixes the argumentless local-only command and one-shot completion boundary", () => {
    const record = evidence();
    expect(record.command_boundary).toEqual({
      package_script: "shogi:floodgate-v7-local-clean-room-teacher",
      package_script_value:
        "node -r tsx/cjs ml/run-floodgate-v7-local-clean-room-teacher.ts",
      entrypoint: "ml/run-floodgate-v7-local-clean-room-teacher.ts",
      argumentless: true,
      direct_invocation_guarded: true,
      import_has_no_execution_side_effect: true,
      test_injected_receipt_is_operational_evidence: false,
      real_completion_capability:
        "module-private-weakmap-exact-object-one-shot",
      extra_argument_disposition: "STOP-before-teacher",
    });
    expect(record.local_only_contract).toMatchObject({
      runner_contract: "shogi-floodgate-v7-local-clean-room-teacher-runner-v1",
      execution_boundary: "explicit-local-only-argumentless-package-command",
      aws_required: false,
      aws_used: false,
      network_used: false,
      cloud_credentials_used: false,
      firebase_gcp_used: false,
      vercel_used: false,
      production_worktree_used: false,
      minimum_free_gib: 20,
      capacity_checked_before_private_copy: true,
      capacity_checked_again_before_teacher_process: true,
      exact_available_bytes_published: false,
    });

    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(
      packageJson.scripts["shogi:floodgate-v7-local-clean-room-teacher"],
    ).toBe("node -r tsx/cjs ml/run-floodgate-v7-local-clean-room-teacher.ts");
    const runner = read("ml/floodgate-v7-local-clean-room-teacher-runner.ts");
    expect(runner).not.toMatch(/\bfetch\s*\(/u);
    expect(runner).not.toMatch(
      /from\s+["'][^"']*(?:aws-sdk|firebase|vercel)[^"']*["']/iu,
    );
  });

  it("pins one exact stream and close-before-finalizer handoff ordering", () => {
    const record = evidence();
    expect(record.same_stream_gate_contract).toMatchObject({
      one_authenticated_stage_work_stream: true,
      same_run_key_and_stage_identity: true,
      separate_single_use_authority_per_gate: true,
      sequence: [
        {
          order: 1,
          gate: "durable-prefix-100",
          target_parents: 100,
          resumed_parents: 0,
          new_parents: 100,
          sealed: false,
        },
        {
          order: 2,
          gate: "durable-prefix-500",
          target_parents: 500,
          resumed_parents: 100,
          new_parents: 400,
          sealed: false,
        },
        {
          order: 3,
          gate: "sealed-final-24000",
          target_parents: 24000,
          resumed_parents: 500,
          new_parents: 23500,
          sealed: true,
        },
      ],
      total_unique_target_parents: 24000,
      incorrect_sum_100_plus_500_plus_24000: false,
      milestone_100_chain_continuity_required: true,
      milestone_500_chain_continuity_required: true,
    });
    expect(record.finalizer_handoff_contract).toEqual({
      receipt_chain_validated_before_owner_close: true,
      owner_close_before_handoff_publication: true,
      handoff_published_when_owner_close_fails: false,
      handoff_created_only_for_sealed_final_24000: true,
      prefix_100_or_500_finalization_forbidden: true,
      separate_explicit_finalizer_command_required: true,
      label_finalizer_invoked_by_runner: false,
      labels_published_by_runner: false,
      handoff_is_training_or_deployment_authority: false,
    });

    const gates = read("ml/floodgate-v7-clean-room-run-gates.ts");
    const validateIndex = gates.indexOf("validateReceiptChain(chain);");
    const closeIndex = gates.indexOf("await handoff.close();", validateIndex);
    const finalizerIndex = gates.indexOf(
      "const handoffPromise = finalizeSealedChainHandoff();",
      closeIndex,
    );
    expect(validateIndex).toBeGreaterThanOrEqual(0);
    expect(closeIndex).toBeGreaterThan(validateIndex);
    expect(finalizerIndex).toBeGreaterThan(closeIndex);
  });

  it("records only the measured review and zero operational state", () => {
    const record = evidence();
    expect(record.validation).toMatchObject({
      focused_vitest: {
        files: 4,
        tests_passed: 43,
        tests_failed: 0,
        result: "PASS",
      },
      changed_file_lint: {
        files: 8,
        files_passed: 8,
        result: "PASS",
      },
      custom_adversarial: {
        cases: 15,
        passed: 15,
        failed: 0,
        result: "PASS",
      },
      import_side_effect_probe: {
        events_observed: 0,
        result: "PASS",
      },
      module_closure_scan: {
        local_modules: 51,
        external_imports: "NODE-BUILTINS-ONLY",
        textual_fetch_definitions: 2,
        fetch_definitions_reachable_from_local_runner_execution: 0,
        result: "PASS",
      },
      independent_review: {
        result: "PASS",
        unresolved_p0: 0,
        unresolved_p1: 0,
        unresolved_p2: 0,
      },
    });
    const customAdversarial = (
      record.validation as {
        custom_adversarial: {
          cases: number;
          case_ids: string[];
        };
      }
    ).custom_adversarial;
    expect(customAdversarial.case_ids).toHaveLength(15);
    expect(new Set(customAdversarial.case_ids).size).toBe(15);

    expect(record.operational_state).toMatchObject({
      state: "STOP-NOT-YET-RUN",
      package_command_added: true,
      successful_operational_command_runs: 0,
      capture_only_negative_cli_runs: 1,
      real_private_copy_runs: 0,
      real_teacher_runs: 0,
      teacher_processes_started: 0,
      teacher_parents_completed: 0,
      teacher_rows_created: 0,
      network_requests: 0,
      aws_calls: 0,
      aws_credentials_used: 0,
      firebase_gcp_calls: 0,
      vercel_calls: 0,
      label_finalizer_runs: 0,
      training_runs: 0,
      candidate_selection_runs: 0,
      formal_ab_games: 0,
      external_calibration_games: 0,
      live_weight_changes: 0,
      live_weights_changed: false,
      production_activations: 0,
    });
    expect(
      Object.values(record.nonclaims as Record<string, boolean>).every(
        (value) => value === false,
      ),
    ).toBe(true);
  });

  it("keeps the Japanese and English articles aligned on limits and next stages", () => {
    const record = evidence();
    expect(record.articles).toEqual({
      japanese: "../blog-shogi-floodgate-v7-local-clean-room-teacher-runner.md",
      english:
        "../blog-shogi-floodgate-v7-local-clean-room-teacher-runner.en.md",
    });
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    expect(numberedSections(japanese)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(numberedSections(english)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    for (const marker of [
      "AWSではない",
      "100 → 500 → 24,000",
      "4 files / 43 tests PASS",
      "15 / 15 PASS",
      "0 / 0 / 0",
      "実clean-room copy",
      "formal A/B",
      "live deploy / activation",
      "floodgate-v7-local-clean-room-teacher-runner-2026-07-19.json",
    ]) {
      expect(japanese, marker).toContain(marker);
    }
    for (const marker of [
      "this runner does not use AWS",
      "100 → 500 → 24,000",
      "4 files / 43 tests PASS",
      "15 / 15 PASS",
      "0 / 0 / 0",
      "real clean-room copy",
      "formal A/B",
      "live deployment or activation",
      "floodgate-v7-local-clean-room-teacher-runner-2026-07-19.json",
    ]) {
      expect(english, marker).toContain(marker);
    }
  });
});
