import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-local-checkpoint-runtime-claim-order-2026-07-19.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-checkpoint-runtime-claim-order.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-local-checkpoint-runtime-claim-order.en.md";
const gitEnvironment = Object.freeze({
  HOME: "/var/empty",
  LANG: "C",
  LC_ALL: "C",
  NODE_ENV: "test",
  PATH: "/usr/bin:/bin",
});

interface PinnedFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly git_blob: string;
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

function git(arguments_: readonly string[]): string {
  return execFileSync(
    "/usr/bin/git",
    [
      "--no-replace-objects",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "credential.helper=",
      "-c",
      "protocol.allow=never",
      ...arguments_,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: gitEnvironment,
    },
  ).trim();
}

function gitIsAncestor(ancestor: string, descendant: string): boolean {
  const result = spawnSync(
    "/usr/bin/git",
    [
      "--no-replace-objects",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "credential.helper=",
      "-c",
      "protocol.allow=never",
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: gitEnvironment,
    },
  );
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(
    `git ancestry check failed: ${result.stderr?.trim() ?? String(result.status)}`,
  );
}

describe("Floodgate v7 local checkpoint runtime-claim ordering evidence", () => {
  it("pins the exact reviewed implementation commit and file identities", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema:
        "shogi-floodgate-v7-local-checkpoint-runtime-claim-order-evidence-v1",
      evidence_date: "2026-07-19",
      status: "DORMANT-FIX-VALIDATED-NOT-EXECUTED",
      revision: {
        base_main_revision: "0dd5469cefd88823b9b50c97c0e3531b4323eace",
        implementation_revision: "e86cbb5f0673f87121a9d789da6e990fc97a4170",
        implementation_tree: "5f771978e9514b0c92e2b2a076a4d2e2e6223c49",
        implementation_parent: "0dd5469cefd88823b9b50c97c0e3531b4323eace",
      },
    });
    const revision = record.revision as {
      base_main_revision: string;
      implementation_revision: string;
      implementation_tree: string;
      implementation_parent: string;
      files: Record<string, PinnedFile>;
    };
    expect(
      git(["show", "-s", "--format=%T", revision.implementation_revision]),
    ).toBe(revision.implementation_tree);
    expect(
      git(["show", "-s", "--format=%P", revision.implementation_revision]),
    ).toBe(revision.implementation_parent);
    expect(revision.implementation_parent).toBe(revision.base_main_revision);
    expect(gitIsAncestor(revision.implementation_revision, "HEAD")).toBe(true);

    for (const pinned of Object.values(revision.files)) {
      const bytes = raw(pinned.path);
      expect(bytes.byteLength, pinned.path).toBe(pinned.bytes);
      expect(sha256(bytes), pinned.path).toBe(pinned.sha256);
      expect(git(["hash-object", "--", pinned.path]), pinned.path).toBe(
        pinned.git_blob,
      );
    }
  });

  it("records the synchronous claim order and complete cleanup semantics", () => {
    expect(evidence()).toMatchObject({
      root_cause: {
        training_row_runtime_claim_lifetime:
          "synchronous-consumer-callback-invocation-only",
        old_key_preparation_awaited_inside_callback_before_checkpoint_invocation: true,
        old_checkpoint_would_observe_expired_training_row_claim: true,
      },
      remediation: {
        checkpoint_key_prepared_before_consumer_entry: true,
        checkpoint_invoked_synchronously_inside_consumer_callback: true,
        checkpoint_promise_awaited_only_after_direct_invocation: true,
        production_training_row_claim_consumed_exactly_once: true,
        authorization_discarded_in_finally: true,
        stage_close_joined_after_every_operation_outcome: true,
        checkpoint_started_close_and_outer_join_share_memoized_promise: true,
        physical_close_count_for_two_join_calls: 1,
        operation_discard_and_close_failures_all_preserved: true,
        cleanup_failure_container: "nested-AggregateError",
      },
      validation: {
        package_supported_runtime: "node-v22.13.0",
        supported_runtime_related: {
          test_files: 4,
          tests_passed: 121,
          tests_failed: 0,
        },
        changed_suites: {
          test_files: 2,
          tests_passed: 68,
          tests_failed: 0,
        },
        expanded_checkpoint_regression: {
          test_files: 3,
          tests_passed: 117,
          tests_failed: 0,
        },
        evidence_tests: {
          test_files: 1,
          tests_passed: 4,
          tests_failed: 0,
        },
        independent_review: {
          p0: 0,
          p1: 0,
          p2: 0,
          p3: 0,
          blocking_findings: 0,
        },
      },
    });
  });

  it("keeps cloud, teacher, training, games, and live state at zero", () => {
    expect(evidence()).toMatchObject({
      stack_boundary: {
        teacher_generation_training_and_ab: "local-Mac",
        aws_required: false,
        aws_used: false,
        aws_api_calls: 0,
        aws_credentials_used: 0,
        firebase_gcp_calls: 0,
        vercel_runner_calls: 0,
        network_requests: 0,
      },
      nonactions: {
        private_source_reads: 0,
        clean_room_mutations: 0,
        teacher_processes_started: 0,
        checkpoint_work_created: 0,
        teacher_parents_completed: 0,
        teacher_rows_created: 0,
        labels_finalized: 0,
        training_runs: 0,
        candidate_selection_runs: 0,
        formal_ab_games: 0,
        external_calibration_games: 0,
        live_weight_changes: 0,
        production_activations: 0,
      },
      next_gate: {
        portable_copy_witness_foundation_review_ci_regular_merge_required: true,
        portable_source_semantic_authority_bridge_required: true,
        three_ordered_gates: [100, 500, 24000],
        real_teacher_allowed_by_this_change_alone: false,
        live_weight_must_remain_unchanged: true,
      },
    });
  });

  it("keeps the Japanese and English articles aligned on the evidence", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    for (const marker of [
      "e86cbb5f",
      "68 / 68",
      "117 / 117",
      "121 / 121",
      "synchronous",
      "idempotent",
      "AggregateError",
      "AWS",
      "100",
      "500",
      "24,000",
    ]) {
      expect(japanese, marker).toContain(marker);
      expect(english, marker).toContain(marker);
    }
  });
});
