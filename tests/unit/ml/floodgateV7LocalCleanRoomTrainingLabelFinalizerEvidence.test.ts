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
  it("pins the exact authority-isolated implementation commit and ancestry", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema:
        "shogi-floodgate-v7-local-clean-room-training-label-finalizer-evidence-v1",
      status:
        "implementation-and-local-validation-pass-independent-rereview-pending-operational-stop",
      implementation: {
        authority_isolation_commit: "5686f9ab5b31aa4383792778ac75ec1a90818e9b",
        validated_head: "5686f9ab5b31aa4383792778ac75ec1a90818e9b",
        validated_tree: "18e1a45ab1d0bce2aeb2bd0aec57a03e6c7baf59",
      },
    });
    const implementation = record.implementation as {
      initial_source_commit: string;
      receipt_and_cleanup_hardening_commit: string;
      durable_replay_and_mac_gate_commit: string;
      test_commit: string;
      authority_isolation_commit: string;
      validated_head: string;
      validated_tree: string;
    };
    for (const revision of [
      implementation.initial_source_commit,
      implementation.receipt_and_cleanup_hardening_commit,
      implementation.durable_replay_and_mac_gate_commit,
      implementation.test_commit,
      implementation.authority_isolation_commit,
    ]) {
      expect(gitIsAncestor(revision, "HEAD"), revision).toBe(true);
    }
    expect(
      git(["show", "-s", "--format=%T", implementation.validated_head]),
    ).toBe(implementation.validated_tree);

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
      },
      exact_post_remediation_independent_rereview: "PENDING",
    });
    expect(record.external_services).toEqual({
      aws_api_or_sdk_used: false,
      firebase_or_gcp_used: false,
      vercel_used: false,
      http_or_network_used: false,
      host_not_on_aws_universally_proven: false,
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

  it("keeps the Japanese and English articles aligned on the remediated boundary", () => {
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
      path.basename(evidenceRelative),
    ]) {
      expect(japanese, marker).toContain(marker);
    }
    for (const marker of [
      "accepts no executable dependencies",
      "module-private one-shot grant",
      "durable claim",
      "27 / 27 PASS",
      path.basename(evidenceRelative),
    ]) {
      expect(english, marker).toContain(marker);
    }
  });
});
