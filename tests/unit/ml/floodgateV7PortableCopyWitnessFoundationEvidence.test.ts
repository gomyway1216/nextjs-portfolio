import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-portable-copy-witness-foundation-2026-07-19.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-portable-copy-witness-foundation.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-portable-copy-witness-foundation.en.md";
const readmeRelative = "ml/README.md";
const historicalReplayRelative =
  "ml/protocols/floodgate-q1-2026-role-lock-full-replay-status.json";
const sourceConfirmationRelative =
  "docs/data/floodgate-role-bundle-verify-e8a9197-confirmation-time.txt";
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
}

function raw(relative: string): Buffer {
  return fs.readFileSync(path.join(repositoryRoot, relative));
}

function read(relative: string): string {
  return raw(relative).toString("utf8");
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidenceRelative)) as Record<string, unknown>;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(arguments_: readonly string[]): string {
  return execFileSync("/usr/bin/git", ["--no-replace-objects", ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: hermeticGitEnvironment,
  }).trim();
}

function gitRaw(arguments_: readonly string[]): Buffer {
  return execFileSync("/usr/bin/git", ["--no-replace-objects", ...arguments_], {
    cwd: repositoryRoot,
    env: hermeticGitEnvironment,
  });
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
  throw new Error(`git merge-base failed: ${result.stderr.trim()}`);
}

describe("Floodgate v7 portable copy witness foundation evidence", () => {
  it("pins the dormant filesystem-only boundary and exact state transition", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema: "shogi-floodgate-v7-portable-copy-witness-foundation-evidence-v1",
      status:
        "dormant-filesystem-foundation-local-validation-pass-ci-and-final-review-pending",
      claim_boundary:
        "filesystem-copy-transition-foundation-with-borrow-pre-post-revalidation-only-not-callback-time-namespace-exclusivity-semantic-input-authenticity-source-semantic-verification-teacher-label-training-selection-holdout-ab-live-weight-or-playing-strength-evidence",
      source_base: {
        previous_origin_main_integrated:
          "5f2569dcf730e709ab36346c559d210fa6a63bf1",
        latest_origin_main_integrated:
          "0dd5469cefd88823b9b50c97c0e3531b4323eace",
        latest_main_pull_request: 516,
        integration_method: "regular-merge-commit",
        integration_commit: "5fa4e179a86a5873c08be4b2863ae4075f6a059b",
        integration_tree: "036b40a551da78080d3513f03b824daa33409ea7",
        integration_parents: [
          "aa71e7920b996f1d30a00d5a3f4d489f17cd11be",
          "0dd5469cefd88823b9b50c97c0e3531b4323eace",
        ],
        latest_main_contains_failure_kind_intrinsic_hardening: true,
      },
      implementation: {
        witness_list_review_hardening_commit:
          "b7a3acb4f8fdbe04de77f0abb45ebb70c4800509",
        collection_intrinsic_hardening_commit:
          "89de568e56ca605e74e403b266ac26c254632464",
        state_forgery_regression_hardening_commit:
          "11b7c9e6831dd7607b08b80ee90373995ae337ac",
        validated_source_revision: "11b7c9e6831dd7607b08b80ee90373995ae337ac",
        existing_public_copy_receipt_changed: false,
        existing_public_copy_acceptance_changed: false,
        existing_public_copy_error_shape_changed: false,
        generic_role_lock_verifier_changed: false,
        generic_role_bundle_verifier_changed: false,
        role_bundle_result_verifier_changed: false,
        training_consumer_changed: false,
        teacher_runner_changed: false,
        local_runner_changed: false,
        post_module_initialization_intrinsic_hardening: {
          review_trigger:
            "pull-request-517-copilot-thread-PRRT_kwDOQbO82s6SEtlH",
          review_finding:
            "captureWitnessList-depended-on-mutable-Array.prototype.includes",
          broader_private_capability_risk:
            "mutable-WeakMap-get-set-delete-could-substitute-genuine-private-state-for-a-fake-capability-or-defeat-one-shot-consumption",
          captured_intrinsic_families: [
            "Array",
            "String",
            "WeakMap",
            "WeakSet",
            "Reflect",
          ],
          captured_at_module_initialization: true,
          captured_reflect_apply_used_for_calls: true,
          map_and_set_runtime_instance_method_dependency_eliminated: true,
          selected_dynamic_instance_call_scan_count: 0,
          fake_private_state_substitution_rejected: true,
          consumed_witness_replay_rejected: true,
          overlapping_destinations_rejected_under_collection_poisoning: true,
          destination_mutation_revalidation_fails_under_array_every_poisoning: true,
          claim_scope:
            "post-module-initialization-mutation-of-the-captured-Array-String-WeakMap-WeakSet-and-Reflect-intrinsics",
          compromised_realm_before_module_initialization_claimed: false,
          arbitrary_node_builtin_prototype_mutation_claimed: false,
        },
      },
      filesystem_protocol: {
        fixed_kinds: [
          "raw-lock-tree",
          "role-lock-tree",
          "role-bundle-tree",
          "legacy-file",
        ],
        production_and_test_registries_separate: true,
        module_private_weakmap_provenance: true,
        structural_fake_rejected: true,
        clone_rejected: true,
        replay_rejected: true,
        cross_kind_rejected: true,
        wrong_destination_rejected: true,
        destination_duplicate_or_ancestor_overlap_rejected_before_capture: true,
        source_seal_required_before_destination_creation: true,
        composite: {
          all_four_kinds_required: true,
          parent_scan_probe_limit: "maxEntries+1",
          parent_entries_retained_maximum: "maxEntries",
          unbounded_readdir_array_used: false,
        },
        borrow: {
          foundation_success_limit: null,
          three_gate_limit_owned_by_future_session_composition: true,
          concurrent_use_rejected_fail_closed: true,
          in_use_set_before_first_await: true,
          callback_thenable_assimilation_inside_boundary: true,
          revalidation_scope: "before-and-after-callback-only",
          callback_time_namespace_exclusivity_claimed: false,
          semantic_input_authenticity_claimed: false,
          callback_length_getter_invoked: false,
          callback_or_revalidation_failure_permanently_invalidates: true,
          active_revocation_fails_current_borrow: true,
          idle_revocation_idempotent: true,
        },
      },
    });

    const protocol = record.filesystem_protocol as {
      state_transition: string[];
    };
    expect(protocol.state_transition).toEqual([
      "source-preseal",
      "external-semantic-verification-gap",
      "one-shot-source-filesystem-seal",
      "existing-copy-core-by-value-copy-and-hidden-final-inventory",
      "one-shot-copy-witness",
      "four-kind-composite-destination-and-shared-parent-seal",
      "serialized-pre-callback-post-destination-revalidation",
      "explicit-idempotent-revocation",
    ]);
  });

  it("binds implementation commits, the regular main merge, and exact file identities", () => {
    const record = evidence();
    const sourceBase = record.source_base as {
      latest_origin_main_integrated: string;
      integration_commit: string;
      integration_tree: string;
      integration_parents: string[];
      portable_implementation_and_test_paths_unchanged_by_latest_integration: boolean;
      readme_preserves_second_run_stop_and_portable_foundation_sections: boolean;
      history_rewritten: boolean;
    };
    const implementation = record.implementation as {
      foundation_commit: string;
      callback_and_parent_bound_hardening_commit: string;
      parent_bound_wording_commit: string;
      callback_namespace_nonclaim_commit: string;
      witness_list_review_hardening_commit: string;
      collection_intrinsic_hardening_commit: string;
      state_forgery_regression_hardening_commit: string;
      validated_source_revision: string;
      files: Record<string, PinnedFile>;
    };

    expect(sourceBase.history_rewritten).toBe(false);
    expect(
      sourceBase.portable_implementation_and_test_paths_unchanged_by_latest_integration,
    ).toBe(true);
    expect(
      sourceBase.readme_preserves_second_run_stop_and_portable_foundation_sections,
    ).toBe(true);
    expect(
      git(["show", "-s", "--format=%T", sourceBase.integration_commit]),
    ).toBe(sourceBase.integration_tree);
    expect(
      git(["show", "-s", "--format=%P", sourceBase.integration_commit]).split(
        " ",
      ),
    ).toEqual(sourceBase.integration_parents);
    expect(sourceBase.integration_parents[1]).toBe(
      sourceBase.latest_origin_main_integrated,
    );

    for (const revision of [
      implementation.foundation_commit,
      implementation.callback_and_parent_bound_hardening_commit,
      implementation.parent_bound_wording_commit,
      implementation.callback_namespace_nonclaim_commit,
      implementation.witness_list_review_hardening_commit,
      implementation.collection_intrinsic_hardening_commit,
      implementation.state_forgery_regression_hardening_commit,
      sourceBase.latest_origin_main_integrated,
      sourceBase.integration_commit,
    ]) {
      expect(gitIsAncestor(revision, "HEAD"), revision).toBe(true);
    }
    expect(
      gitIsAncestor(
        sourceBase.integration_commit,
        implementation.validated_source_revision,
      ),
    ).toBe(true);

    for (const pinned of Object.values(implementation.files)) {
      const bytes = raw(pinned.path);
      expect(bytes.byteLength, pinned.path).toBe(pinned.bytes);
      expect(sha256(bytes), pinned.path).toBe(pinned.sha256);
      expect(git(["hash-object", "--", pinned.path]), pinned.path).toBe(
        pinned.git_blob,
      );
      expect(
        gitRaw([
          "show",
          `${implementation.validated_source_revision}:${pinned.path}`,
        ]),
        pinned.path,
      ).toEqual(bytes);
    }
  });

  it("keeps the three timing scopes distinct and binds tracked source measurements", () => {
    const record = evidence();
    const context = record.diagnostic_context as {
      measurements_are_distinct_runs_and_not_interchangeable: boolean;
      historical_role_lock_full_replay: Record<string, unknown>;
      current_source_full_role_bundle_confirmation: Record<string, unknown>;
      copied_destination_isolated_verification: Record<string, unknown>;
      copy_audit: {
        raw_lock: { files: number; bytes: number; byte_mismatches: number };
        role_lock: { files: number; bytes: number; byte_mismatches: number };
        role_bundle: { files: number; bytes: number; byte_mismatches: number };
        teacher_assets: {
          files: number;
          bytes: number;
          byte_mismatches: number;
        };
        total: {
          files: number;
          bytes: number;
          byte_mismatches: number;
          source_destination_inode_aliases: number;
        };
      };
    };
    const replay = JSON.parse(read(historicalReplayRelative)) as {
      state: string;
      elapsed_ms: number;
      process_exit_code: number;
    };

    expect(context.measurements_are_distinct_runs_and_not_interchangeable).toBe(
      true,
    );
    expect(replay).toMatchObject({
      state: "succeeded",
      elapsed_ms: 14059521,
      process_exit_code: 0,
    });
    expect(context.historical_role_lock_full_replay).toMatchObject({
      elapsed_ms: replay.elapsed_ms,
      elapsed_seconds: 14059.521,
      result: "PASS",
    });
    expect(read(sourceConfirmationRelative)).toMatch(/^real 1089\.52$/mu);
    expect(context.current_source_full_role_bundle_confirmation).toMatchObject({
      wall_seconds: 1089.52,
      result: "PASS",
    });
    expect(context.copied_destination_isolated_verification).toMatchObject({
      wall_seconds: 522.211,
      result: "FAIL",
      safe_failure_substage:
        "role-lock-full-replay-watched-directory-closure-binding",
      timeout: false,
      data_corruption_observed: false,
    });
    expect(
      new Set([
        context.historical_role_lock_full_replay.scope,
        context.current_source_full_role_bundle_confirmation.scope,
        context.copied_destination_isolated_verification.scope,
      ]).size,
    ).toBe(3);

    const parts = [
      context.copy_audit.raw_lock,
      context.copy_audit.role_lock,
      context.copy_audit.role_bundle,
      context.copy_audit.teacher_assets,
    ];
    expect(parts.reduce((total, part) => total + part.files, 0)).toBe(
      context.copy_audit.total.files,
    );
    expect(parts.reduce((total, part) => total + part.bytes, 0)).toBe(
      context.copy_audit.total.bytes,
    );
    expect(parts.every((part) => part.byte_mismatches === 0)).toBe(true);
    expect(context.copy_audit.total).toEqual({
      files: 72717,
      bytes: 1227490748,
      byte_mismatches: 0,
      source_destination_inode_aliases: 0,
    });
    expect(record.documented_nonclaim_confirmation).toEqual({
      fixture: "synthetic-private-temp-tree-only",
      real_private_data_read: false,
      operation:
        "rename-destination-common-ancestor-create-different-byte-replacement-read-by-absolute-path-remove-replacement-restore-original",
      different_bytes_observed_inside_callback: true,
      original_destination_passed_post_revalidation_after_restore: true,
      borrow_result_under_current_pre_post_contract: "PASS",
      interpretation: "expected-nonclaim-not-a-semantic-authenticity-proof",
      future_composition_requirement:
        "read-destination-through-held-directory-and-file-descriptors-and-bind-those-exact-bytes-to-the-source-verifier-sha256-and-record-identity",
    });
  });

  it("records local-only validation, zero runtime execution, and bilingual disclosure", () => {
    const record = evidence();
    expect(record.local_validation).toMatchObject({
      node: "v22.13.0",
      portable_witness_tests: { passed: 19, failed: 0 },
      existing_copy_regression_tests: { passed: 13, failed: 0 },
      combined: { passed: 32, failed: 0, wall_seconds: 1.51 },
      evidence_tests: { passed: 4, failed: 0 },
      related_total: { passed: 36, failed: 0, wall_seconds: 1.59 },
      expanded_runner_regression: {
        test_files: 7,
        passed: 107,
        failed: 0,
        wall_seconds: 1.81,
      },
      scoped_eslint: "PASS",
      prettier: "PASS",
      git_diff_check: "PASS",
      full_typescript: {
        status: "BASELINE_FAILURES_ONLY",
        total_errors: 21,
        changed_file_errors: 0,
      },
    });
    expect(record.execution_counts).toEqual({
      real_source_semantic_verification_by_foundation: 0,
      real_copy_by_foundation: 0,
      teacher_process: 0,
      teacher_label: 0,
      optimizer_training: 0,
      candidate_selection: 0,
      holdout_open: 0,
      formal_ab: 0,
      external_calibration: 0,
      weight_changed: 0,
      live_activation: 0,
      match: 0,
    });
    expect(record.infrastructure).toEqual({
      scope: "foundation-runtime-and-local-unit-validation",
      local_cpu_used_for_unit_validation: true,
      aws_required: false,
      aws_used: false,
      gcp_cloud_function_used: false,
      firebase_used: false,
      vercel_used: false,
      network_used: false,
      github_source_control_and_ci_network_used_outside_foundation_scope: true,
      source_control_and_ci_are_not_evaluator_compute: true,
      repository_ci_aws_witness_adapter_source_only_check_present: true,
      aws_service_invocation_by_foundation: false,
      vercel_preview_is_web_deployment_not_evaluator_compute: true,
    });

    const source = read("ml/floodgate-v7-clean-room-copy.ts");
    const selectedDynamicInstanceCalls =
      source.match(
        /\.(?:includes|some|every|map|sort|push|reverse|split|startsWith|get|set|has|delete|add|entries)\s*\(/gmu,
      ) ?? [];
    expect(selectedDynamicInstanceCalls).toEqual([]);
    const imports = [...source.matchAll(/from "(.*?)";$/gmu)].map(
      (match) => match[1],
    );
    expect(imports).toEqual([
      "node:buffer",
      "node:crypto",
      "node:fs",
      "node:path",
      "node:util",
    ]);
    for (const forbidden of [
      "floodgate-role-lock",
      "floodgate-role-bundle",
      "floodgate-role-bundle-result",
      "floodgate-training-row-consumer",
      "floodgate-v7-clean-room-teacher-runner",
      "floodgate-v7-local-clean-room-teacher-runner",
    ]) {
      expect(source).not.toContain(forbidden);
    }

    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    const readme = read(readmeRelative);
    for (const marker of [
      "14,059.521",
      "1,089.52",
      "522.211",
      "maxEntries + 1",
      "19 / 19",
      "32 / 32",
      "107 / 107",
      "#516",
      "0dd5469c",
      "5fa4e179",
      "89de568e",
      "AWS",
      "dormant",
      "namespace exclusivity",
      "held",
      "WeakMap",
      "prototype",
    ]) {
      expect(japanese, marker).toContain(marker);
      expect(english, marker).toContain(marker);
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-portable-copy-witness-foundation.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-portable-copy-witness-foundation.md",
    );
    expect(readme).toContain(
      japaneseArticleRelative.replace("docs/", "../docs/"),
    );
    expect(readme).toContain(
      englishArticleRelative.replace("docs/", "../docs/"),
    );
    expect(readme).toContain(evidenceRelative.replace("docs/", "../docs/"));
  });
});
