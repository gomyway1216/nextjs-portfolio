import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-v7-portable-copy-held-role-bundle-2026-07-19.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-portable-copy-held-role-bundle.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-portable-copy-held-role-bundle.en.md";
const readmeRelative = "ml/README.md";
const baseRevision = "e1bbf8f1b52fed1474541ed1ec74acade59ddbc2";
const historicalEvidenceFixRevision =
  "fce2c9e44ce1610f09d102a78de47d92e84ff384";
const lowLevelRevision = "7418a4f8262137e058eafd081eeae3d72dd01fca";
const validatedRevision = "4aac34df6b65beeade12722fd116f6ce39a2105a";
const reviewFixRevision = "177e4b88a2a7fc830269f5e38b8ff65498c9875c";
const reviewFixParent = "cb2c67bb30b77871287f38e895dd55841b9a32eb";
const reviewFixTree = "e0c233b77a92c704dfaf3f5cd9919fd6f98e7a44";
const lowLevelContract = "shogi-floodgate-v7-portable-copy-held-role-bundle-v1";
const lowLevelClaimBoundary =
  "private-inventory-bound-held-root-and-exact-nine-fixed-file-no-follow-open-fstat-read-sha256-explicit-eof-synchronous-single-use-path-fd-stat-identity-free-snapshot-claim-callback-settlement-post-fstat-buffer-zeroization-all-handle-close-and-composite-postflight-not-callback-time-namespace-exclusivity-source-semantic-authenticity-source-verifier-binding-teacher-label-training-gate-weight-live-activation-or-playing-strength-evidence";
const ownerContract =
  "shogi-floodgate-v7-portable-copy-owner-held-role-bundle-v1";
const ownerClaimBoundary =
  "owner-and-bound-bridge-private-ephemeral-single-use-claim-over-one-composite-held-role-bundle-exact-nine-file-pathless-snapshot-callback-settlement-postflight-and-close-not-source-semantic-authenticity-exact-three-gate-teacher-training-live-weight-or-playing-strength-evidence";
const fixedFiles = [
  "fresh-final-holdout.protected-position-ids.txt",
  "fresh-final-holdout.raw.jsonl",
  "fresh-selection.protected-position-ids.txt",
  "fresh-selection.raw.jsonl",
  "manifest.json",
  "replay-excluded-position-ids.txt",
  "replay-exclusion-receipt.json",
  "training.protected-position-ids.txt",
  "training.raw.jsonl",
] as const;
const implementationFiles = [
  {
    path: "ml/floodgate-v7-clean-room-copy.ts",
    bytes: 101566,
    sha256: "71059b52666292654a6d1f556dbb6aa1aad97e915d603aaffca3945f4c2503f4",
    git_blob: "1b5cc466b9bdc19be2f77253090faa7930061e75",
  },
  {
    path: "ml/floodgate-v7-portable-copy-owner.ts",
    bytes: 43192,
    sha256: "c781320bc91dae97b87c8bfbb9ac31ac5f169dec4000bf4d800cb72b662b5312",
    git_blob: "72aa74d709b957dabeac76364c129a9e7ca06219",
  },
  {
    path: "tests/unit/ml/floodgateV7PortableCopyWitness.test.ts",
    bytes: 38656,
    sha256: "8db59f7f3261f16f38ac498e215d8df7611a18c041ab30a3ca97634b563f5570",
    git_blob: "db6b2ca96760f4c979542dd607eb8e5280d409a8",
  },
  {
    path: "tests/unit/ml/floodgateV7PortableCopyOwner.test.ts",
    bytes: 47856,
    sha256: "de728a71209cc841a4691c14cd3a6b121c9d85c6959c0eae1edf7893d009a3f8",
    git_blob: "059767f9a9e15c1d93d229d38634b439076bf7d7",
  },
  {
    path: "tests/unit/ml/floodgateV7PortableCopyHeldRoleBundle.test.ts",
    bytes: 25719,
    sha256: "fb87bd1229c0e9c4ad1c134fc03bb8ad19eeaecebf2e440eef7cdafe1a544418",
    git_blob: "07f1f8d4fdc7597c4ca9625ed030007fde0158aa",
  },
] as const;
const reviewFixFiles = [
  {
    path: "ml/floodgate-v7-clean-room-copy.ts",
    bytes: 101810,
    sha256: "ac9f6c17de6f984d19bbffa72b84370be4f5492b2847e591d5fa92ccd9ae64eb",
    git_blob: "e9ac75cedab0a56c01031999eeddc45dc92b48d4",
  },
  {
    path: "tests/unit/ml/floodgateV7PortableCopyHeldRoleBundle.test.ts",
    bytes: 27799,
    sha256: "591c853e58644a90081eb023d5354dcafdb8afb694afb6d436a75ce292ec9433",
    git_blob: "c6af4d9471dd1641d33c07ccf85df93135e2d68f",
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

describe("Floodgate v7 portable copy held role-bundle evidence", () => {
  it("pins the exact held-descriptor and owner claim boundaries", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema: "shogi-floodgate-v7-portable-copy-held-role-bundle-evidence-v1",
      status:
        "dormant-final-safety-foundation-review-fix-fixed-awaiting-thread-resolution-live-gates-closed-real-execution-zero",
      recorded_date: "2026-07-19",
      claim_boundary: lowLevelClaimBoundary,
      implementation: {
        low_level_contract: lowLevelContract,
        low_level_claim_boundary: lowLevelClaimBoundary,
        owner_contract: ownerContract,
        owner_claim_boundary: ownerClaimBoundary,
        production_apis: {
          low_level: [
            "withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundle",
            "claimFloodgateV7PortableCopyHeldRoleBundleSnapshot",
          ],
          owner: [
            "withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidation",
            "claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot",
          ],
        },
        core_for_tests_apis: {
          low_level: [
            "withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests",
            "claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests",
          ],
          owner: [
            "withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests",
            "claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests",
          ],
        },
      },
    });
    const lowLevelSource = gitRaw([
      "show",
      `${validatedRevision}:ml/floodgate-v7-clean-room-copy.ts`,
    ]).toString("utf8");
    const ownerSource = gitRaw([
      "show",
      `${validatedRevision}:ml/floodgate-v7-portable-copy-owner.ts`,
    ]).toString("utf8");
    for (const marker of [
      lowLevelContract,
      lowLevelClaimBoundary,
      ...fixedFiles,
      "withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundle",
      "claimFloodgateV7PortableCopyHeldRoleBundleSnapshot",
    ]) {
      expect(lowLevelSource, marker).toContain(marker);
    }
    for (const marker of [
      ownerContract,
      ownerClaimBoundary,
      "withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidation",
      "claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot",
    ]) {
      expect(ownerSource, marker).toContain(marker);
    }
  });

  it("binds the validated base and additive review-fix historical identities", () => {
    const record = evidence();
    expect(record.source_base).toEqual({
      origin_main: baseRevision,
      origin_main_tree: "c63e290def82eb89e8c8f33bc2a9e46e0a23ce1e",
      origin_main_parents: [
        "de9636c825de73aff886b27d8281b0601f7ccc3a",
        "7556494cc597213c3393d328479e81763ed55e0d",
      ],
      portable_copy_owner_pull_request: 519,
      portable_copy_owner_merge_method: "regular-merge-commit",
      portable_copy_owner_integrated: true,
      historical_evidence_fix_revision: historicalEvidenceFixRevision,
      historical_evidence_fix_parent: baseRevision,
      history_rewritten: false,
    });
    const implementation = record.implementation as {
      low_level_introduction_revision: string;
      low_level_introduction_subject: string;
      low_level_introduction_parent: string;
      validated_revision: string;
      validated_revision_subject: string;
      validated_revision_parent: string;
      files: typeof implementationFiles;
    };
    expect(implementation).toMatchObject({
      low_level_introduction_revision: lowLevelRevision,
      low_level_introduction_subject:
        "Hold portable role bundles by descriptor",
      low_level_introduction_parent: historicalEvidenceFixRevision,
      validated_revision: validatedRevision,
      validated_revision_subject: "Bind held role bundles to portable owners",
      validated_revision_parent: lowLevelRevision,
      files: implementationFiles,
    });
    expect(record.review_fix).toEqual({
      status: "fixed-awaiting-thread-resolution",
      revision: reviewFixRevision,
      subject: "Handle short descriptor reads",
      parent: reviewFixParent,
      tree: reviewFixTree,
      validated_base_revision: validatedRevision,
      changed_files: reviewFixFiles,
      review: {
        provider: "gemini-code-assist",
        severity: "medium",
        finding_count: 1,
        finding:
          "legal-short-descriptor-read-was-rejected-before-requested-chunk-completion",
        implementation_fixed: true,
        regression_test_added: true,
        unresolved_threads_at_recording: 1,
        required_unresolved_threads_before_merge: 0,
      },
      behavior: {
        positive_short_reads_accumulated: true,
        zero_or_oversized_read_rejected: true,
        sha256_explicit_eof_post_callback_fstat_preserved: true,
      },
      validation: {
        node: "v22.13.0",
        test_files: 7,
        passed: 100,
        failed: 0,
      },
    });
    expect(git(["show", "-s", "--format=%T", baseRevision])).toBe(
      "c63e290def82eb89e8c8f33bc2a9e46e0a23ce1e",
    );
    expect(git(["show", "-s", "--format=%P", baseRevision]).split(" ")).toEqual(
      [
        "de9636c825de73aff886b27d8281b0601f7ccc3a",
        "7556494cc597213c3393d328479e81763ed55e0d",
      ],
    );
    expect(
      git(["show", "-s", "--format=%s", historicalEvidenceFixRevision]),
    ).toBe("Preserve historical portable evidence snapshots");
    expect(
      git(["show", "-s", "--format=%P", historicalEvidenceFixRevision]),
    ).toBe(baseRevision);
    expect(git(["show", "-s", "--format=%s", lowLevelRevision])).toBe(
      "Hold portable role bundles by descriptor",
    );
    expect(git(["show", "-s", "--format=%P", lowLevelRevision])).toBe(
      historicalEvidenceFixRevision,
    );
    expect(git(["show", "-s", "--format=%s", validatedRevision])).toBe(
      "Bind held role bundles to portable owners",
    );
    expect(git(["show", "-s", "--format=%P", validatedRevision])).toBe(
      lowLevelRevision,
    );
    expect(git(["show", "-s", "--format=%s", reviewFixRevision])).toBe(
      "Handle short descriptor reads",
    );
    expect(git(["show", "-s", "--format=%P", reviewFixRevision])).toBe(
      reviewFixParent,
    );
    expect(git(["show", "-s", "--format=%T", reviewFixRevision])).toBe(
      reviewFixTree,
    );
    expect(
      git([
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        lowLevelRevision,
      ])
        .split("\n")
        .sort(),
    ).toEqual(
      [
        "ml/floodgate-v7-clean-room-copy.ts",
        "tests/unit/ml/floodgateV7PortableCopyHeldRoleBundle.test.ts",
        "tests/unit/ml/floodgateV7PortableCopyWitness.test.ts",
      ].sort(),
    );
    expect(
      git([
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        validatedRevision,
      ])
        .split("\n")
        .sort(),
    ).toEqual(
      [
        "ml/floodgate-v7-portable-copy-owner.ts",
        "tests/unit/ml/floodgateV7PortableCopyOwner.test.ts",
      ].sort(),
    );
    expect(
      git([
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        reviewFixRevision,
      ])
        .split("\n")
        .sort(),
    ).toEqual(reviewFixFiles.map((file) => file.path).sort());
    expect(gitIsAncestor(validatedRevision, reviewFixRevision)).toBe(true);
    expect(gitIsAncestor(reviewFixRevision, "HEAD")).toBe(true);
    expect(gitIsAncestor(validatedRevision, "HEAD")).toBe(true);
    for (const file of implementationFiles) {
      const committed = gitRaw(["show", `${validatedRevision}:${file.path}`]);
      expect(committed.byteLength, file.path).toBe(file.bytes);
      expect(sha256(committed), file.path).toBe(file.sha256);
      expect(
        git(["rev-parse", `${validatedRevision}:${file.path}`]),
        file.path,
      ).toBe(file.git_blob);
      expect(gitRaw(["cat-file", "blob", file.git_blob]), file.path).toEqual(
        committed,
      );
    }
    for (const file of reviewFixFiles) {
      const committed = gitRaw(["show", `${reviewFixRevision}:${file.path}`]);
      expect(committed.byteLength, file.path).toBe(file.bytes);
      expect(sha256(committed), file.path).toBe(file.sha256);
      expect(
        git(["rev-parse", `${reviewFixRevision}:${file.path}`]),
        file.path,
      ).toBe(file.git_blob);
      expect(gitRaw(["cat-file", "blob", file.git_blob]), file.path).toEqual(
        committed,
      );
    }
    expect(
      gitRaw([
        "show",
        `${reviewFixRevision}:ml/floodgate-v7-clean-room-copy.ts`,
      ]).toString("utf8"),
    ).toContain("bytesRead <= 0 || bytesRead > remaining");
    expect(
      gitRaw([
        "show",
        `${reviewFixRevision}:tests/unit/ml/floodgateV7PortableCopyHeldRoleBundle.test.ts`,
      ]).toString("utf8"),
    ).toContain(
      "continues positional reads until each requested chunk is complete",
    );
  });

  it("pins the exact nine-file snapshot and fail-closed descriptor lifecycle", () => {
    const protocol = evidence().held_role_bundle_protocol as {
      exact_inventory: Record<string, unknown>;
      snapshot: Record<string, unknown>;
      descriptor_lifecycle: Record<string, unknown>;
      claim_lifecycle: Record<string, unknown>;
      owner_binding: Record<string, unknown>;
      covered_mutations_and_misuse: string[];
    };
    expect(protocol.exact_inventory).toEqual({
      root_only: true,
      exact_file_count: 9,
      fixed_order: fixedFiles,
      subdirectories_allowed: false,
      missing_or_extra_files_allowed: false,
      required_file_mode_octal: "0600",
      zero_byte_non_retained_file_allowed: true,
      manifest_max_bytes: 65536,
      training_raw_max_bytes: 67108864,
    });
    expect(protocol.snapshot).toEqual({
      claim_shape: "empty-frozen-null-prototype",
      snapshot_exact_keys: ["files", "manifestBytes", "trainingRawBytes"],
      file_identity_exact_keys: ["filename", "bytes", "sha256"],
      outer_metadata_frozen: true,
      retained_byte_views_mutable_and_ephemeral: true,
      retained_files: ["manifest.json", "training.raw.jsonl"],
      path_disclosed: false,
      file_descriptor_disclosed: false,
      device_or_inode_disclosed: false,
      stat_identity_disclosed: false,
    });
    expect(protocol.descriptor_lifecycle).toMatchObject({
      composite_precheck: true,
      held_root_handle_count: 1,
      held_file_handle_count: 9,
      pre_read_fstat_and_named_identity_check: true,
      all_nine_sha256_checked: true,
      all_nine_explicit_eof_checked: true,
      post_callback_fstat: true,
      retained_views_zeroized_before_close: true,
      all_opened_handles_drained_on_every_exit: true,
      reverse_file_close_then_root_close: true,
      composite_postflight_after_close: true,
      partial_open_tested_handle_count: 5,
      closed_handles_observed_as_ebadf: true,
    });
    expect(protocol.claim_lifecycle).toEqual({
      synchronous_consumption_required: true,
      single_use: true,
      replay_invalidates_issued_composite: true,
      microtask_late_allowed: false,
      clone_or_proxy_allowed: false,
      production_and_test_registries_disjoint: true,
      views_live_until_callback_promise_settlement: true,
      success_after_cleanup_failure_allowed: false,
    });
    expect(protocol.owner_binding).toEqual({
      exact_owner_and_bound_bridge_required: true,
      one_private_underlying_claim: true,
      cross_owner_use_allowed: false,
      production_and_test_registries_disjoint: true,
      generic_and_held_borrow_serialization_shared: true,
      reentry_or_active_revocation_invalidates: true,
      callback_failure_sanitized: true,
    });
    expect(protocol.covered_mutations_and_misuse).toContain(
      "callback-same-size-rewrite-and-exact-restore",
    );
    expect(protocol.covered_mutations_and_misuse).toContain(
      "partial-open-and-injected-pre-close-failure",
    );
    expect(protocol.covered_mutations_and_misuse).toContain(
      "legal-positive-short-read-completion",
    );
  });

  it("separates current-PR zero counters from the historical prefix-100 attempt", () => {
    const record = evidence();
    expect(record).not.toHaveProperty("execution_counts");
    expect(record.current_pr_execution_counts).toEqual({
      scope:
        "this-pr-and-current-held-role-bundle-gate-execution-only-not-cumulative-project-history",
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
    expect(record.historical_context).toEqual({
      excluded_from_current_pr_execution_counts: true,
      prefix_100_attempt: {
        started_date: "2026-07-16",
        start_count: 1,
        elapsed_seconds_before_safe_stop: 1597,
        authenticated_parent_records_preserved: 3,
        persisted_lines_including_header: 4,
        target_parent_count: 100,
        target_100_completed: false,
        sealed_or_final_labels: 0,
        optimizer_training: 0,
        formal_ab: 0,
        live_activation: 0,
      },
    });
    expect(record.infrastructure).toEqual({
      scope: "held-role-bundle-contract-and-synthetic-local-unit-validation",
      local_cpu_and_temporary_filesystem_used: true,
      real_private_source_or_destination_used: false,
      aws_required: false,
      aws_used: false,
      gcp_cloud_function_used: false,
      firebase_used: false,
      vercel_evaluator_compute_used: false,
      network_used_by_runtime_or_unit_tests: false,
      github_source_control_and_ci_are_not_evaluator_compute: true,
      vercel_preview_is_web_deployment_not_evaluator_compute: true,
    });
    expect(record.local_validation).toEqual({
      node: "v22.13.0",
      dedicated_held_test: { passed: 11, failed: 0 },
      owner_test: { passed: 37, failed: 0, wall_seconds: 1.66 },
      pre_evidence_related_regression: {
        test_files: 6,
        passed: 94,
        failed: 0,
        wall_seconds: 3.21,
      },
      evidence_test: { passed: 5, failed: 0 },
      focused_with_evidence: {
        test_files: 7,
        passed: 99,
        failed: 0,
      },
      eslint_error_count: 0,
      prettier_unformatted_file_count: 0,
      diff_check_error_count: 0,
    });
    expect(record.security_review).toEqual({
      status: "independent-final-rereview-pass",
      reviewed_revision: validatedRevision,
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      unresolved_findings: 0,
    });
    expect(record.nonclaims).toMatchObject({
      source_semantic_authenticity_proved: false,
      source_verifier_sha256_and_record_identity_bound: false,
      snapshot_sha256_is_semantic_authority: false,
      callback_time_absolute_path_namespace_exclusivity: false,
      caller_created_byte_copies_zeroized: false,
      exact_three_gate_teacher_session_implemented: false,
      playing_strength_improvement_claimed: false,
    });
    expect(record.next_safe_step).toEqual({
      this_is_last_safety_foundation_before_real_labels: true,
      next_gate: "first-100-real-labels",
      next_gate_executed_by_this_change: false,
      bind_generic_source_verifier_identity_to_held_snapshot: true,
      inspect_label_receipts_failure_classification_and_replay_exclusion: true,
      candidate_training_authorized_now: false,
      formal_ab_authorized_now: false,
      live_weight_change_authorized: false,
    });
  });

  it("keeps the concise Japanese, English, and README disclosures linked", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    const readme = read(readmeRelative);
    for (const marker of [
      "exact 9",
      "100",
      "94 / 94",
      "37 / 37",
      "11 / 11",
      "100 / 100",
      "4aac34df",
      "7418a4f8",
      "177e4b88",
      "fixed-awaiting-thread-resolution",
      "short read",
      "P0 / P1 / P2 / P3",
      "AWS",
      "GCP",
      "Vercel",
      "zero",
      "live",
      "current",
      "2026-07-16",
      "prefix-100",
      "1,597",
      "header",
    ]) {
      expect(japanese, marker).toContain(marker);
      expect(english, marker).toContain(marker);
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-portable-copy-held-role-bundle.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-portable-copy-held-role-bundle.md",
    );
    expect(japanese).toContain(
      "floodgate-v7-portable-copy-held-role-bundle-2026-07-19.json",
    );
    expect(english).toContain(
      "floodgate-v7-portable-copy-held-role-bundle-2026-07-19.json",
    );
    expect(readme).toContain(
      "#### Floodgate v7 portable copy held role-bundle（2026-07-19）",
    );
    expect(readme).toContain(
      japaneseArticleRelative.replace("docs/", "../docs/"),
    );
    expect(readme).toContain(
      englishArticleRelative.replace("docs/", "../docs/"),
    );
    expect(readme).toContain(evidenceRelative.replace("docs/", "../docs/"));
    for (const marker of [
      "current",
      "2026-07-16",
      "prefix-100",
      "1,597",
      "header",
      "100 / 100",
      "177e4b88",
      "fixed-awaiting-thread-resolution",
      "short read",
    ]) {
      expect(readme, marker).toContain(marker);
    }
  });
});
