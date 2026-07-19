import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-portable-copy-owner-2026-07-19.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-portable-copy-owner.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-portable-copy-owner.en.md";
const readmeRelative = "ml/README.md";
const implementationRevision = "dff9ee445686693e852afafb9ac0f593027bca27";
const implementationRevisionParent = "ab9ac4d8363682776fc0e8518ec3f8b539f3566b";
const historicalOwnerContract =
  "shogi-floodgate-v7-portable-copy-owner-v1" as const;
const historicalOwnerClaimBoundary =
  "owner-private-exact-four-kind-source-preseal-filesystem-seal-copy-witness-composite-and-serialized-borrow-lifecycle-not-source-semantic-authenticity-held-descriptor-reads-exact-three-gate-teacher-training-live-weight-or-playing-strength-evidence" as const;
const historicalOwnerFailureTable = {
  preseal: {
    destination_write_may_have_started: false,
    consumer_callback_may_have_started: false,
    retry_disposition: "fresh-preseal-allowed",
  },
  bind: {
    destination_write_may_have_started: true,
    consumer_callback_may_have_started: false,
    retry_disposition: "manual-clean-room-reconciliation-required",
  },
  borrow: {
    destination_write_may_have_started: true,
    consumer_callback_may_have_started: true,
    retry_disposition: "manual-consumer-and-clean-room-reconciliation-required",
  },
  revoke: {
    destination_write_may_have_started: true,
    consumer_callback_may_have_started: true,
    retry_disposition: "manual-owner-reconciliation-required",
  },
} as const;
const implementationFiles = [
  {
    path: "ml/floodgate-v7-portable-copy-owner.ts",
    bytes: 32309,
    sha256: "040798583c6cb56e6fe461d51179a2ff5c289effc7d2ca1966be88f1ea931b3c",
    git_blob: "391c08cf3551086a2a2e398cfcc03096dab82e23",
  },
  {
    path: "tests/unit/ml/floodgateV7PortableCopyOwner.test.ts",
    bytes: 30117,
    sha256: "9560dd70a2ba6b285f7fae8d32a9d39300b8841cd64c9bddbb94704d82034a75",
    git_blob: "9a0ab95d552b20938bd7876bec4ecf067de7b364",
  },
  {
    path: "tests/unit/ml/floodgateV7PortableCopyOwnerPoisoning.child.ts",
    bytes: 6921,
    sha256: "6610f685ad19fc6b527bd48c75090706fc194709868ead6f67b233ea3e539c6d",
    git_blob: "a008fee38008c12ebc7031fe2b7c3072e2783d62",
  },
] as const;
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

function read(relative: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relative), "utf8");
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

function gitRaw(arguments_: readonly string[]): Buffer {
  return execFileSync("/usr/bin/git", ["--no-replace-objects", ...arguments_], {
    cwd: repositoryRoot,
    env: hermeticGitEnvironment,
    maxBuffer: 1024 * 1024,
  });
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function historicalImplementation(relative: string): string {
  return gitRaw(["show", `${implementationRevision}:${relative}`]).toString(
    "utf8",
  );
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

describe("Floodgate v7 portable copy owner evidence", () => {
  it("pins the source A, copy B, and destination C threat boundary", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema: "shogi-floodgate-v7-portable-copy-owner-evidence-v1",
      status:
        "dormant-local-owner-binding-validation-and-final-review-pass-live-gates-closed-real-execution-zero",
      claim_boundary:
        "owner-private-exact-four-kind-source-preseal-filesystem-seal-copy-witness-composite-and-serialized-borrow-lifecycle-not-source-semantic-authenticity-held-descriptor-reads-exact-three-gate-teacher-training-live-weight-or-playing-strength-evidence",
      owner_protocol: {
        threat_model: {
          source_a:
            "canonical-source-filesystem-closure-not-semantic-verification",
          copy_b:
            "by-value-fresh-inode-transition-bound-to-hidden-final-inventory",
          destination_c:
            "owner-bound-pre-and-post-callback-destination-closure-revalidation",
          separately_valid_cross_session_components_are_authority: false,
          structural_fake_rejection_alone_closes_cross_session_confusion: false,
          owner_private_same_lifecycle_binding_required: true,
        },
        mapping_contract: {
          exact_kind_count: 4,
          fixed_caller_order: [
            "raw-lock-tree",
            "role-lock-tree",
            "role-bundle-tree",
            "legacy-file",
          ],
          canonical_source_and_destination_private_snapshot: true,
          caller_mapping_proxy_allowed: false,
          caller_mapping_getter_invoked: false,
          data_descriptor_snapshot_required: true,
          all_four_exact_mappings_required_at_bind: true,
          private_kind_source_destination_strict_comparison: true,
          all_pair_namespace_disjoint_preflight_required: true,
          source_to_source_overlap_allowed: false,
          destination_to_destination_overlap_allowed: false,
          any_destination_to_any_source_overlap_allowed: false,
          cross_kind_overlap_rejected_before_underlying_preseal_or_copy: true,
          composite_consumed_once_after_exact_match: true,
          missing_kind_allowed: false,
          duplicate_kind_allowed: false,
          unknown_kind_allowed: false,
          ordering_grants_authority: false,
          plain_path_strings_grant_authority: false,
          path_accepted_in_public_binding_input: true,
          path_disclosed_in_opaque_capability_success_result_or_sanitized_error: false,
        },
        dependency_boundary: {
          production_binding_dependencies_type:
            "FloodgateV7PortableCopyOwnerDependencies",
          production_allowed_own_data_keys: [
            "effectiveUserId",
            "maxEntries",
            "maxTotalBytes",
          ],
          production_proxy_or_accessor_dependencies_allowed: false,
          production_test_only_dependency_keys_allowed: false,
          production_rejected_test_only_dependency_keys: [
            "maxConcurrencyForTests",
            "afterSourceInventoryForTests",
            "afterFileCopiedForTests",
            "beforeFinalRevalidationForTests",
            "closeCopiedFileHandleForTests",
          ],
          core_for_tests_binding_type:
            "FloodgateV7PortableCopyOwnerBindingForTests",
          core_for_tests_full_clean_room_dependencies_allowed: true,
        },
        private_composition: {
          existing_pr_517_low_level_exports_changed: false,
          global_foundation_capability_unreachability_claimed: false,
          owner_path_only_underlying_capability_non_escape_claimed: true,
          underlying_capability_disclosed_by_argument_result_callback_or_public_receipt: false,
          owner_preseal_is_opaque: true,
          underlying_source_preseal_stored_in_module_private_weakmap: true,
          all_four_preseals_required_before_external_verifier_pause: true,
          external_generic_source_verifier_pause_present: true,
          preseal_result_contains_only_opaque_owner_and_verification_pause: true,
          pause_self_reports_verifier_authority: false,
          bind_accepts_external_verifier_receipt: false,
          bind_proves_external_verifier_success: false,
          same_fixed_order_mapping_required_for_one_shot_bind: true,
          bind_internally_performs_seal_copy_and_composite: true,
          source_preseal_escapes_owner_path: false,
          source_filesystem_seal_escapes_owner_path: false,
          copy_witness_escapes_owner_path: false,
          composite_destination_seal_escapes_owner_path: false,
          underlying_nominal_capability_types_in_public_parameter_or_result: false,
          underlying_nominal_capability_types_kept_private: [
            "FloodgateV7PortableCopySourcePreseal",
            "FloodgateV7PortableCopySourceFilesystemSeal",
            "FloodgateV7PortableCopyWitness",
            "FloodgateV7PortableCopyCompositeDestinationSeal",
          ],
          production_and_core_for_tests_registries_disjoint: true,
          public_capability_surface:
            "opaque-owner-verification-pause-and-bound-bridge-only",
          bind_result_contains_only_opaque_bound_bridge: true,
          sanitized_error_discloses_sensitive_values: false,
          borrow_and_owner_revoke_are_top_level_owner_apis: true,
          revoke_accepts_exact_owner_only: true,
          module_private_identity_required: true,
          structural_clone_authorized: false,
          consumed_replay_authorized: false,
          cross_owner_or_cross_registry_use_authorized: false,
          explicit_revocation_required: true,
        },
        revocation_and_failure: {
          owner_authority_invalidated_immediately: true,
          bound_bridge_issued_after_failed_or_revoked_bind: false,
          already_started_filesystem_promises_cancelled: false,
          partial_destination_automatic_rollback_claimed: false,
          existing_copy_partial_destination_preservation_contract_maintained: true,
          fresh_retry_requires_configured_destination_reconciliation_or_removal: true,
          fresh_absent_destination_required_for_retry: true,
        },
        post_module_intrinsic_boundary: {
          plain_node_child_exact_modes_verified: [
            "array-string",
            "weak-collections",
            "reflect",
            "promise-resolve-preseal",
          ],
          plain_node_child_exact_mode_count: 4,
          poisoned_intrinsics_by_mode: {
            "array-string": [
              "Array.isArray",
              "Array.prototype.map",
              "Array.prototype.some",
              "Array.prototype.includes",
              "String.prototype.includes",
              "String.prototype.startsWith",
            ],
            "weak-collections": [
              "WeakMap.prototype.get",
              "WeakMap.prototype.set",
              "WeakMap.prototype.delete",
              "WeakSet.prototype.has",
              "WeakSet.prototype.add",
            ],
            reflect: ["Reflect.apply", "Reflect.ownKeys"],
            "promise-resolve-preseal": ["Promise.resolve"],
          },
          verification_scope:
            "post-module-initialization-listed-intrinsics-only-with-promise-resolve-limited-to-preseal-and-revoke",
          promise_resolve_preseal_mode_runs_bind_copy_or_borrow: false,
          promise_prototype_then_poisoning_resistance_claimed: false,
          arbitrary_global_promise_or_object_poisoning_resistance_claimed: false,
          underlying_pr_517_full_lifecycle_poisoning_resistance_claimed: false,
          legacy_pattern_control_experiment: {
            captured_promise_all_settled_and_native_promise_used: true,
            genuine_native_promise_created_before_substitution: true,
            promise_resolve_substituted_after_capture: true,
            result:
              "OLD_PATTERN_REJECTED=substituted Promise.resolve consulted",
          },
          settlement_regression: {
            all_four_started_operations_receive_rejection_handlers_before_any_await: true,
            out_of_order_later_rejection_unhandled_rejection_count: 0,
          },
        },
        destination_boundary: {
          revalidation_scope: "before-and-after-callback-only",
          callback_time_namespace_exclusivity_claimed: false,
          held_directory_or_file_descriptor_read_binding_implemented: false,
          semantic_input_authenticity_claimed: false,
          source_verifier_sha256_and_record_identity_binding_implemented: false,
          exact_three_gate_teacher_session_implemented: false,
        },
      },
    });
    const ownerSource = historicalImplementation(
      "ml/floodgate-v7-portable-copy-owner.ts",
    );
    const functionalTest = historicalImplementation(
      "tests/unit/ml/floodgateV7PortableCopyOwner.test.ts",
    );
    const poisoningChild = historicalImplementation(
      "tests/unit/ml/floodgateV7PortableCopyOwnerPoisoning.child.ts",
    );
    expect(ownerSource).not.toContain(
      "const promiseAllSettled = Promise.allSettled;",
    );
    expect(ownerSource).not.toContain("const nativePromise = Promise;");
    expect(ownerSource).not.toContain("applyFunction(promiseAllSettled");
    expect(functionalTest).toContain(
      "attaches rejection handlers to all four started copies before awaiting the first",
    );
    expect(functionalTest).toContain('process.on("unhandledRejection"');
    expect(poisoningChild).toContain('"promise-resolve-preseal"');
    expect(poisoningChild).toContain("Promise.resolve = poison");
  });

  it("pins the exact staged-owner contract and public API names", () => {
    const implementation = evidence().implementation as {
      module: string;
      functional_test: string;
      poisoning_child: string;
      owner_foundation_revision: string;
      promise_hardening_revision: string;
      validated_revision: string;
      validated_revision_subject: string;
      validated_revision_parent: string;
      files: Array<{
        path: string;
        bytes: number;
        sha256: string;
        git_blob: string;
      }>;
      contract: string;
      claim_boundary: string;
      production_apis: string[];
      core_for_tests_apis: string[];
      preseal_result_exact_keys: string[];
      bind_result: string;
      owner_error_name: string;
      owner_error_message: string;
      owner_error_operations: string[];
      owner_error_sensitive_values_disclosed: boolean;
      owner_error_failure_table: Record<
        string,
        {
          destination_write_may_have_started: boolean;
          consumer_callback_may_have_started: boolean;
          retry_disposition: string;
        }
      >;
    };
    expect(implementation).toEqual({
      module: "ml/floodgate-v7-portable-copy-owner.ts",
      functional_test: "tests/unit/ml/floodgateV7PortableCopyOwner.test.ts",
      poisoning_child:
        "tests/unit/ml/floodgateV7PortableCopyOwnerPoisoning.child.ts",
      owner_foundation_revision: "ab9ac4d8363682776fc0e8518ec3f8b539f3566b",
      promise_hardening_revision: implementationRevision,
      validated_revision: implementationRevision,
      validated_revision_subject: "Harden owner promise settlement",
      validated_revision_parent: implementationRevisionParent,
      files: implementationFiles,
      contract: historicalOwnerContract,
      claim_boundary: historicalOwnerClaimBoundary,
      production_apis: [
        "presealFloodgateV7PortableCopyOwner",
        "bindFloodgateV7PortableCopyOwnerBridge",
        "withFloodgateV7PortableCopyOwnerRevalidation",
        "revokeFloodgateV7PortableCopyOwner",
      ],
      core_for_tests_apis: [
        "presealFloodgateV7PortableCopyOwnerCoreForTests",
        "bindFloodgateV7PortableCopyOwnerBridgeCoreForTests",
        "withFloodgateV7PortableCopyOwnerRevalidationCoreForTests",
        "revokeFloodgateV7PortableCopyOwnerCoreForTests",
      ],
      preseal_result_exact_keys: ["owner", "verificationPause"],
      bind_result: "empty-frozen-null-prototype-opaque-bound-bridge",
      owner_error_name: "FloodgateV7PortableCopyOwnerError",
      owner_error_message: "Floodgate v7 portable copy owner failed",
      owner_error_operations: ["preseal", "bind", "borrow", "revoke"],
      owner_error_sensitive_values_disclosed: false,
      owner_error_failure_table: historicalOwnerFailureTable,
    });
    expect(implementation.owner_error_failure_table).toEqual(
      historicalOwnerFailureTable,
    );
    expect(git(["show", "-s", "--format=%s", implementationRevision])).toBe(
      "Harden owner promise settlement",
    );
    expect(git(["show", "-s", "--format=%P", implementationRevision])).toBe(
      implementationRevisionParent,
    );
    expect(gitIsAncestor(implementationRevision, "HEAD")).toBe(true);
    expect(
      git([
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        implementationRevision,
      ])
        .split("\n")
        .sort(),
    ).toEqual(implementationFiles.map(({ path: file }) => file).sort());
    for (const file of implementationFiles) {
      const committed = gitRaw([
        "show",
        `${implementationRevision}:${file.path}`,
      ]);
      expect(committed.byteLength, file.path).toBe(file.bytes);
      expect(sha256(committed), file.path).toBe(file.sha256);
      expect(
        git(["rev-parse", `${implementationRevision}:${file.path}`]),
        file.path,
      ).toBe(file.git_blob);
      expect(gitRaw(["cat-file", "blob", file.git_blob]), file.path).toEqual(
        committed,
      );
    }
    expect(implementation.claim_boundary).toBe(
      (evidence() as { claim_boundary: string }).claim_boundary,
    );
  });

  it("pins the fixed caller order and exact four inventory types", () => {
    const record = evidence();
    const mapping = (
      record.owner_protocol as {
        fixed_mapping: Array<{ kind: string; inventory_type: string }>;
      }
    ).fixed_mapping;
    expect(mapping).toEqual([
      { kind: "raw-lock-tree", inventory_type: "tree" },
      { kind: "role-lock-tree", inventory_type: "tree" },
      { kind: "role-bundle-tree", inventory_type: "tree" },
      { kind: "legacy-file", inventory_type: "file" },
    ]);
    expect(new Set(mapping.map(({ kind }) => kind)).size).toBe(4);
  });

  it("binds the exact regular-merge base without rewriting history", () => {
    const sourceBase = evidence().source_base as {
      origin_main: string;
      origin_main_tree: string;
      origin_main_parents: string[];
      portable_copy_foundation_pull_request: number;
      portable_copy_foundation_merge_method: string;
      portable_copy_foundation_integrated: boolean;
      history_rewritten: boolean;
    };
    expect(sourceBase).toEqual({
      origin_main: "de9636c825de73aff886b27d8281b0601f7ccc3a",
      origin_main_tree: "faa4718d2cda7ce6a8d7dc61d4a5b0f914a23a16",
      origin_main_parents: [
        "3bdf6d1127b86401ef08854737c700629a2d2ea7",
        "180835cb77a1ee036bee5295bc9d05884539df2f",
      ],
      portable_copy_foundation_pull_request: 517,
      portable_copy_foundation_merge_method: "regular-merge-commit",
      portable_copy_foundation_integrated: true,
      history_rewritten: false,
    });
    expect(git(["show", "-s", "--format=%T", sourceBase.origin_main])).toBe(
      sourceBase.origin_main_tree,
    );
    expect(
      git(["show", "-s", "--format=%P", sourceBase.origin_main]).split(" "),
    ).toEqual(sourceBase.origin_main_parents);
    expect(gitIsAncestor(sourceBase.origin_main, "HEAD")).toBe(true);
  });

  it("records local-only non-live execution and bilingual disclosure", () => {
    const record = evidence();
    expect(record.implementation_effects).toEqual({
      portable_copy_foundation_public_contract_changed: false,
      portable_copy_foundation_source_bytes_changed: false,
      portable_copy_foundation_async_export_wrappers_changed: false,
      owner_public_async_export_wrapper_declarations_changed_by_promise_hardening_revision: false,
      generic_raw_lock_verifier_changed: false,
      generic_role_lock_verifier_changed: false,
      generic_role_bundle_verifier_changed: false,
      role_bundle_result_verifier_changed: false,
      training_consumer_changed: false,
      teacher_runner_changed: false,
      local_runner_changed: false,
      live_weight_changed: false,
    });
    expect(record.execution_counts).toEqual({
      real_source_semantic_verification: 0,
      real_copy: 0,
      real_destination_consumer: 0,
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
      scope: "owner-contract-and-synthetic-local-unit-validation",
      local_cpu_and_temporary_filesystem_used: true,
      real_private_source_or_destination_used: false,
      aws_required: false,
      aws_used: false,
      gcp_cloud_function_used: false,
      firebase_used: false,
      vercel_evaluator_compute_used: false,
      network_used_by_owner_runtime_or_unit_tests: false,
      github_source_control_and_ci_are_not_evaluator_compute: true,
      vercel_preview_is_web_deployment_not_evaluator_compute: true,
    });
    expect(record.local_validation).toEqual({
      status: "pass-frozen-source-identity-pinned",
      node: "v22.13.0",
      functional_test_count: 25,
      evidence_test_count: 5,
      combined_test_count: 30,
      failed_test_count: 0,
      functional_repeat_run_count: 5,
      functional_repeat_total_test_count: 125,
      functional_repeat_failed_test_count: 0,
      related_regression_max_workers: 4,
      related_regression_files: [
        {
          path: "tests/unit/ml/floodgateV7CleanRoomCopy.test.ts",
          test_count: 13,
        },
        {
          path: "tests/unit/ml/floodgateV7PortableCopyWitness.test.ts",
          test_count: 19,
        },
        {
          path: "tests/unit/ml/floodgateV7PortableCopyWitnessFoundationEvidence.test.ts",
          test_count: 4,
        },
        {
          path: "tests/unit/ml/floodgateV7PortableCopyOwner.test.ts",
          test_count: 25,
        },
        {
          path: "tests/unit/ml/floodgateV7PortableCopyOwnerEvidence.test.ts",
          test_count: 5,
        },
      ],
      related_regression_file_count: 5,
      related_regression_test_count: 66,
      related_regression_failed_test_count: 0,
      related_regression_vitest_duration_seconds: 1.83,
      related_regression_aggregate_test_duration_seconds: 5.73,
      typescript_repository_baseline_diagnostic_count: 21,
      typescript_changed_file_diagnostic_count: 0,
      eslint_error_count: 0,
      prettier_unformatted_file_count: 0,
      diff_check_error_count: 0,
    });
    expect(record.security_review).toEqual({
      status: "final-pass",
      reviewed_revision: implementationRevision,
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      unresolved_findings: 0,
    });

    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    const readme = read(readmeRelative);
    for (const marker of [
      "source A",
      "copy B",
      "destination C",
      "raw-lock-tree",
      "role-lock-tree",
      "role-bundle-tree",
      "legacy-file",
      "opaque",
      "replay",
      "revoke",
      "held",
      "AWS",
      "GCP",
      "Vercel",
      "dormant",
    ]) {
      expect(japanese, marker).toContain(marker);
      expect(english, marker).toContain(marker);
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-portable-copy-owner.en.md",
    );
    expect(english).toContain("blog-shogi-floodgate-v7-portable-copy-owner.md");
    expect(readme).toContain(
      japaneseArticleRelative.replace("docs/", "../docs/"),
    );
    expect(readme).toContain(
      englishArticleRelative.replace("docs/", "../docs/"),
    );
    expect(readme).toContain(evidenceRelative.replace("docs/", "../docs/"));
  });
});
