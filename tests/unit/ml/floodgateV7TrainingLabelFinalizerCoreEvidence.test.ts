import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CLAIM_BOUNDARY,
  FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_STATUS,
  FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA,
  FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
} from "../../../ml/floodgate-v7-training-label-finalizer-core";
import {
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN,
} from "../../../ml/floodgate-v7-training-label-finalizer-key-contract";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-training-label-finalizer-core.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-training-label-finalizer-core.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-training-label-finalizer-core-2026-07-16.json",
);
const IMPLEMENTATION_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-training-label-finalizer-core.ts",
);
const KEY_CONTRACT_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-training-label-finalizer-key-contract.ts",
);
const FOCUSED_TEST_PATH = path.join(
  REPOSITORY_ROOT,
  "tests/unit/ml/floodgateV7TrainingLabelFinalizerCore.test.ts",
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function readEvidence(): Record<string, unknown> {
  return JSON.parse(readText(EVIDENCE_PATH)) as Record<string, unknown>;
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

function collectNullPaths(value: unknown, prefix = ""): string[] {
  if (value === null) return [prefix];
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectNullPaths(entry, `${prefix}[${index}]`),
    );
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    collectNullPaths(entry, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}

function assertNoDuplicateJsonObjectKeys(source: string): void {
  let offset = 0;

  function fail(message: string): never {
    throw new Error(`${message} at offset ${offset}`);
  }

  function skipWhitespace(): void {
    while (/\s/u.test(source[offset] ?? "")) offset += 1;
  }

  function parseString(): string {
    const start = offset;
    if (source[offset] !== '"') fail("Expected JSON string");
    offset += 1;
    while (offset < source.length) {
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset)) as string;
      }
      offset += source[offset] === "\\" ? 2 : 1;
    }
    return fail("Unterminated JSON string");
  }

  function consumeLiteral(literal: string): void {
    if (!source.startsWith(literal, offset)) {
      fail(`Expected JSON literal ${literal}`);
    }
    offset += literal.length;
  }

  function parseNumber(): void {
    const match = source
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (match === null) fail("Expected JSON number");
    offset += match[0].length;
  }

  function parseArray(): void {
    offset += 1;
    skipWhitespace();
    if (source[offset] === "]") {
      offset += 1;
      return;
    }
    while (true) {
      parseValue();
      skipWhitespace();
      if (source[offset] === "]") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") fail("Expected comma in JSON array");
      offset += 1;
      skipWhitespace();
    }
  }

  function parseObject(): void {
    offset += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (source[offset] === "}") {
      offset += 1;
      return;
    }
    while (true) {
      const keyOffset = offset;
      const key = parseString();
      if (keys.has(key)) {
        throw new Error(
          `Duplicate JSON object key ${JSON.stringify(key)} at offset ${keyOffset}`,
        );
      }
      keys.add(key);
      skipWhitespace();
      if (source[offset] !== ":") fail("Expected colon after JSON object key");
      offset += 1;
      parseValue();
      skipWhitespace();
      if (source[offset] === "}") {
        offset += 1;
        return;
      }
      if (source[offset] !== ",") fail("Expected comma in JSON object");
      offset += 1;
      skipWhitespace();
    }
  }

  function parseValue(): void {
    skipWhitespace();
    switch (source[offset]) {
      case "{":
        parseObject();
        return;
      case "[":
        parseArray();
        return;
      case '"':
        parseString();
        return;
      case "t":
        consumeLiteral("true");
        return;
      case "f":
        consumeLiteral("false");
        return;
      case "n":
        consumeLiteral("null");
        return;
      default:
        parseNumber();
    }
  }

  parseValue();
  skipWhitespace();
  if (offset !== source.length) fail("Unexpected content after JSON value");
}

describe("Floodgate v7 training-label finalizer core evidence", () => {
  it("pins unique JSON keys, exact artifacts, local validation, and pending GitHub observations", () => {
    const source = readText(EVIDENCE_PATH);
    expect(() => assertNoDuplicateJsonObjectKeys(source)).not.toThrow();
    expect(() =>
      assertNoDuplicateJsonObjectKeys(
        '{"outer":{"same":1,"\\u0073ame":2},"same":3}',
      ),
    ).toThrow(/Duplicate JSON object key "same"/u);

    const evidence = readEvidence();
    expect(Object.keys(evidence)).toEqual([
      "schema",
      "evidence_date",
      "evidence_scope",
      "artifacts",
      "finalizer_contract",
      "authority_model",
      "output_contract",
      "staged_state_machine",
      "persistence_and_publication",
      "focused_test_methodology",
      "validation",
      "production_execution_for_this_change",
      "playing_strength",
      "next_boundary",
      "nonclaims",
    ]);
    expect(evidence.schema).toBe(
      "shogi-floodgate-v7-training-label-finalizer-core-evidence-v1",
    );
    expect(evidence.evidence_date).toBe("2026-07-16");

    const artifacts = evidence.artifacts as Record<string, unknown>;
    expect(artifacts).toEqual({
      key_contract_source:
        "ml/floodgate-v7-training-label-finalizer-key-contract.ts",
      implementation_source: "ml/floodgate-v7-training-label-finalizer-core.ts",
      focused_unit_test:
        "tests/unit/ml/floodgateV7TrainingLabelFinalizerCore.test.ts",
      japanese_article:
        "docs/blog-shogi-floodgate-v7-training-label-finalizer-core.md",
      english_article:
        "docs/blog-shogi-floodgate-v7-training-label-finalizer-core.en.md",
      machine_readable_evidence:
        "docs/data/floodgate-v7-training-label-finalizer-core-2026-07-16.json",
      evidence_unit_test:
        "tests/unit/ml/floodgateV7TrainingLabelFinalizerCoreEvidence.test.ts",
    });
    for (const relativePath of Object.values(artifacts)) {
      expect(typeof relativePath).toBe("string");
      if (typeof relativePath !== "string") {
        throw new Error("Evidence artifact path must be a string");
      }
      expect(fs.existsSync(path.join(REPOSITORY_ROOT, relativePath))).toBe(
        true,
      );
    }

    const validation = evidence.validation as Record<string, unknown>;
    expect(validation.validation_candidate_revision).toBe(
      "311c0a8a79b413336a0d46f2179257a968a639bb",
    );
    for (const [name, result] of Object.entries(validation)) {
      if (name === "validation_candidate_revision") continue;
      expect(result).toMatchObject({
        status: name === "github_ci_and_review" ? "PENDING" : "COMPLETE",
      });
    }
    const nullPaths = collectNullPaths(evidence);
    expect(nullPaths.sort()).toEqual([
      "validation.github_ci_and_review.checks_failed",
      "validation.github_ci_and_review.checks_passed",
      "validation.github_ci_and_review.head_revision",
      "validation.github_ci_and_review.pull_request",
      "validation.github_ci_and_review.unresolved_review_threads",
    ]);

    expect(validation.focused_finalizer_vitest).toMatchObject({
      files: 1,
      tests: 22,
      passed: 22,
      failed: 0,
      vitest_duration_ms: 12510,
      wall_seconds: 12.85,
      maximum_rss_bytes: 302776320,
      swaps: 0,
    });
    expect(validation.related_contract_vitest).toMatchObject({
      files: 3,
      tests: 20,
      passed: 20,
      failed: 0,
      vitest_duration_ms: 607,
      wall_seconds: 0.95,
      maximum_rss_bytes: 270450688,
      swaps: 0,
    });
    expect(validation.typescript).toMatchObject({
      exit_code: 0,
      wall_seconds: 2.4,
      maximum_rss_bytes: 1127546880,
      swaps: 0,
    });
    expect(validation.prettier).toMatchObject({
      files: 7,
      observation: "all-matched",
      wall_seconds: 0.89,
      maximum_rss_bytes: 225853440,
      swaps: 0,
    });
    expect(validation.full_vitest).toMatchObject({
      files: 155,
      tests: 2852,
      passed: 2852,
      failed: 0,
      vitest_duration_seconds: 98.06,
      wall_seconds: 98.48,
      maximum_rss_bytes: 2433712128,
      swaps: 0,
      attempts_on_branch: 2,
      timeout_fix_revision: "311c0a8a79b413336a0d46f2179257a968a639bb",
      initial_attempt: {
        revision: "71bb9d9a703dadc633aa6eecf8d285e8de2caa20",
        status: "FAILED",
        files: 155,
        tests: 2852,
        passed: 2850,
        failed: 2,
        vitest_duration_seconds: 97.77,
        wall_seconds: 98.18,
        maximum_rss_bytes: 2181365760,
        swaps: 0,
      },
      isolated_preexisting_stable_resume_rerun: {
        status: "COMPLETE",
        tests: 1,
        passed: 1,
        failed: 0,
        skipped: 10,
        vitest_duration_ms: 953,
        wall_seconds: 1.31,
        maximum_rss_bytes: 288423936,
        swaps: 0,
      },
    });
    const fullVitest = validation.full_vitest as Record<string, unknown>;
    expect(
      (fullVitest.initial_attempt as Record<string, unknown>).observations,
    ).toEqual([
      "new-v7-failpoint-matrix-exceeded-default-5000ms-test-timeout-under-full-suite-load",
      "preexisting-stable-resume-transient-retry-disposition-mismatch",
    ]);
    expect(validation.eslint).toMatchObject({
      exit_code: 0,
      errors: 0,
      warnings: 157,
      wall_seconds: 26.72,
      maximum_rss_bytes: 2268020736,
      swaps: 0,
    });
    expect(validation.production_build).toMatchObject({
      static_pages: 193,
      passed: 193,
      failed: 0,
      wall_seconds: 26.83,
      maximum_rss_bytes: 2620227584,
      swaps: 0,
    });
    expect(validation.ml_stdlib).toMatchObject({
      tests: 58,
      passed: 58,
      failed: 0,
      wall_seconds: 0.52,
      maximum_rss_bytes: 63979520,
      swaps: 0,
    });
    expect(validation.npm_audit).toMatchObject({
      exit_code: 0,
      vulnerabilities: 0,
      wall_seconds: 0.96,
      maximum_rss_bytes: 132186112,
      swaps: 0,
    });
  });

  it("records an opaque test-only authority rather than V3 origin", () => {
    const evidence = readEvidence();
    expect(evidence.finalizer_contract).toEqual({
      contract: FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_STATUS,
      claim_boundary: FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CLAIM_BOUNDARY,
      execution_boundary:
        "test-only-injected-opaque-plan-finalizer-and-exclusive-private-directory-publication",
      production_entry_point_added: false,
      production_reader_added: false,
      production_cli_added: false,
      production_registry_changed: false,
    });
    expect(evidence.authority_model).toMatchObject({
      storage: "module-private-weakmap",
      claim: "exact-object-identity-one-shot",
      test_plan_factory_accepts_and_deep_captures_synthetic_projections: true,
      finalizer_accepts_caller_supplied_rows_or_replay_callback: false,
      caller_supplied_rows_accepted_as_production_authority: false,
      caller_supplied_serialized_bytes_accepted_as_production_authority: false,
      caller_supplied_pathname_accepted_as_production_authority: false,
      caller_supplied_replay_callback_accepted_as_production_authority: false,
      private_plan_uses_restartable_async_replay_driver: true,
      plan_run_id_and_key_id_cross_bound_before_authority_transfer: true,
      facade_exposes_rows_bytes_path_handle_key_or_callback: false,
      clone_allowed: false,
      proxy_allowed: false,
      second_claim_allowed: false,
      v3_work_origin_authenticated: false,
      fixed_production_dependencies_used: false,
    });

    const implementation = readText(IMPLEMENTATION_PATH);
    expect(implementation).toContain("WeakMap");
    expect(implementation).toContain("CoreForTests");
    expect(implementation).toContain("failed = true");
    expect(implementation).not.toContain(
      "export function finalizeAndPublishFloodgateV7TrainingLabels(",
    );
  });

  it("pins four files, four legal states, exact-prefix resume, and manifest-last ordering", () => {
    const evidence = readEvidence();
    const output = evidence.output_contract as Record<string, unknown>;
    expect(output.creation_order).toEqual([
      "work.jsonl",
      FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
    ]);
    expect(output.canonical_exact_entry_set_order).toEqual(
      FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
    );
    expect(output).toMatchObject({
      result_and_manifest_keys_are_distinct_owned_buffers: true,
      training_parent_ids_commitment_bound_by_result_and_manifest: true,
      teacher_run_binding_sha256_bound_by_result_and_manifest: true,
      teacher_run_binding_authenticated_by_v3_in_this_change: false,
      stage_parent_and_stage_identity_and_basenames_bound_by_result_and_manifest: true,
      deterministic_payload_contains_lease_identity: false,
      deterministic_payload_contains_absolute_path: false,
      deterministic_payload_contains_callback: false,
    });
    expect(output.manifest).toMatchObject({
      created_last: true,
      content_commit_marker: true,
    });

    const machine = evidence.staged_state_machine as Record<string, unknown>;
    expect(machine.allowed_initial_entry_sets).toEqual([
      ["work.jsonl"],
      ["train.jsonl", "work.jsonl"],
      ["result.json", "train.jsonl", "work.jsonl"],
      ["manifest.json", "result.json", "train.jsonl", "work.jsonl"],
    ]);
    expect(machine).toMatchObject({
      successor_requires_exact_complete_predecessor: true,
      positioned_short_write_loop: true,
      zero_progress_write_rejected: true,
      mismatch_preserved_for_manual_reconciliation: true,
      oversize_preserved_for_manual_reconciliation: true,
      unknown_or_val_entry_preserved_for_manual_reconciliation: true,
      automatic_truncation: false,
      automatic_unlink: false,
      rename_overwrite: false,
      automatic_rollback: false,
    });

    expect(evidence.persistence_and_publication).toEqual({
      new_files_opened_with_o_excl: true,
      new_files_opened_with_o_nofollow: true,
      new_file_mode: "0600",
      required_link_count: 1,
      file_data_sync_before_directory_sync: true,
      immediate_held_reread_and_digest_after_file_sync_before_directory_sync: true,
      source_stage_held_inode_and_pathname_reverified: true,
      source_work_held_inode_pathname_snapshot_and_sha256_reverified: true,
      source_exact_entry_set_reverified_before_publication: true,
      exclusive_private_directory_publication_reused: true,
      destination_directory_reopened: true,
      destination_exact_entry_set_reverified: true,
      destination_file_identities_and_bytes_reverified: true,
      point_in_time_audit_only: true,
      future_immutability_claimed: false,
      throw_undefined_tracked_with_independent_failure_boolean: true,
      unsafe_content_with_abort_rejection_requires_content_and_lease_reconciliation: true,
      owned_root_result_and_manifest_keys_zeroized_on_all_paths: true,
      caller_root_key_mutated: false,
    });
    expect(
      (evidence.focused_test_methodology as Record<string, unknown>)
        .covered_state_classes,
    ).toEqual([
      "work-only",
      "train-exact-prefix",
      "complete-train-and-result-exact-prefix",
      "complete-predecessors-and-manifest-exact-prefix",
      "complete-four-file-set",
      "illegal-entry-subsets-and-extra-entry",
      "mismatch-oversize-and-incomplete-predecessor",
      "unsafe-file-metadata",
      "short-zero-and-invalid-write-reports",
      "source-and-destination-replacement",
      "stage-parent-stage-and-basename-binding",
      "training-parent-id-commitment-and-teacher-run-binding",
      "restartable-private-async-replay",
      "immediate-post-datasync-reread-before-directory-sync",
      "clone-proxy-reuse-and-cross-binding",
      "throw-undefined-and-key-zeroization",
    ]);
  });

  it("separates result and manifest derivation and MAC domains", () => {
    const evidence = readEvidence();
    const output = evidence.output_contract as Record<string, unknown>;
    const result = output.result as Record<string, unknown>;
    const manifest = output.manifest as Record<string, unknown>;
    expect(result.filename).toBe(FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME);
    expect(result.schema).toBe(FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA);
    expect(manifest.filename).toBe(
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
    );
    expect(manifest.schema).toBe(FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA);
    expect(result.hkdf_info).toBe(FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO);
    expect(manifest.hkdf_info).toBe(
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
    );
    expect(result.mac_domain).toBe(
      FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN,
    );
    expect(manifest.mac_domain).toBe(
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN,
    );
    expect(result.hkdf_info).not.toBe(manifest.hkdf_info);
    expect(result.mac_domain).not.toBe(manifest.mac_domain);

    const keyContract = readText(KEY_CONTRACT_PATH);
    for (const marker of [
      "shogi-floodgate-v7-training-label-result-key-v1\\0",
      "shogi-floodgate-v7-training-label-manifest-key-v1\\0",
    ]) {
      expect(keyContract).toContain(marker);
    }
    const implementation = readText(IMPLEMENTATION_PATH);
    for (const marker of [
      "Reflect.apply(nativeTypedArrayFill",
      "datasync",
      "O_EXCL",
      "O_NOFOLLOW",
      "teacherRunBindingSha256",
      "RestartableTrainingReplay",
      "floodgateIdentifierDigest",
    ]) {
      expect(implementation).toContain(marker);
    }
  });

  it("keeps both articles at twelve sections and states the production boundary", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expectedSections = Array.from(
      { length: 12 },
      (_value, index) => index + 1,
    );
    expect(numberedSections(japanese)).toEqual(expectedSections);
    expect(numberedSections(english)).toEqual(expectedSections);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-training-label-finalizer-core.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-training-label-finalizer-core.md",
    );
    for (const article of [japanese, english]) {
      expect(article).toContain("WeakMap");
      expect(article).toContain("train.jsonl");
      expect(article).toContain("result.json");
      expect(article).toContain("manifest.json");
      expect(article).toContain("production adapter");
      expect(article).toContain("24,000");
      expect(article).toContain("192 color-swapped pairs / 384 games");
      expect(article).toContain("200");
      expect(article).toContain("high-dan");
      for (const metric of [
        "311c0a8a79b413336a0d46f2179257a968a639bb",
        "12.85",
        "302776320",
        "0.95",
        "270450688",
        "2.40",
        "1127546880",
        "0.89",
        "225853440",
        "26.72",
        "2268020736",
        "98.48",
        "2433712128",
        "26.83",
        "2620227584",
        "0.52",
        "63979520",
        "0.96",
        "132186112",
        "2,850",
        "2,852",
      ]) {
        expect(article).toContain(metric);
      }
    }
  });

  it("keeps every production, training, weight, live, and match action at zero", () => {
    const evidence = readEvidence();
    const production = evidence.production_execution_for_this_change as Record<
      string,
      unknown
    >;
    expect(Object.keys(production)).toEqual([
      "production_commands",
      "production_reader_or_command_entry_points_added",
      "production_finalizer_entry_points_added",
      "production_registry_provisions",
      "production_prefix_100_gates",
      "production_prefix_500_gates",
      "production_final_24000_gates",
      "production_checkpoint_records_read",
      "production_hmac_records_verified",
      "production_verified_parent_events",
      "real_floodgate_games_read",
      "teacher_generation_runs",
      "teacher_labels_materialized",
      "production_finalizer_invocations",
      "production_publication_transactions",
      "production_output_files_created",
      "training_jsonl_files_finalized",
      "result_json_files_finalized",
      "manifest_json_files_finalized",
      "training_runs",
      "optimizer_steps",
      "candidate_selection_runs",
      "candidate_promotions",
      "candidate_weight_artifacts",
      "formal_ab_color_swapped_pairs",
      "formal_ab_games",
      "external_calibration_games",
      "production_weight_overwrites",
      "live_evaluation_activations",
    ]);
    expect(Object.values(production)).toEqual(
      Array.from({ length: 29 }, () => 0),
    );
    expect(evidence.playing_strength).toEqual({
      recorded_repository_evaluator: "runOp1",
      recorded_rollback_evaluator: "runOp1",
      production_state_freshly_observed: false,
      live_weight_changed: false,
      playing_strength_changed_by_this_evidence: false,
      stable_high_dan_claimed: false,
      formal_ab_plan: "192 color-swapped pairs / 384 games",
      formal_ab_color_swapped_pairs_required: 192,
      formal_ab_total_games_required: 384,
      external_calibration_games_required: 200,
    });

    const nonclaims = evidence.nonclaims as Record<string, unknown>;
    expect(Object.keys(nonclaims)).toEqual([
      "v3_sealed_work_origin_authenticated",
      "teacher_run_binding_authenticated",
      "enclosing_second_scan_success_established",
      "production_plan_minted",
      "production_registry_runner_or_cli_available",
      "actual_process_kill_durability_established",
      "hardware_power_loss_durability_established",
      "anti_rollback_established",
      "process_crossing_exactly_once_established",
      "hostile_same_process_mutation_resistance_established",
      "hostile_same_euid_or_root_resistance_established",
      "engine_identity_search_correctness_or_source_truth_established",
      "real_24000_labels_finalized",
      "production_dataset_published",
      "optimizer_training",
      "candidate_selected",
      "weight_created",
      "live_evaluation_activated",
      "formal_ab_completed",
      "external_calibration_completed",
      "playing_strength_established",
      "stable_high_dan_established",
    ]);
    expect(Object.values(nonclaims)).toEqual(
      Array.from({ length: 22 }, () => false),
    );
    expect(nonclaims).toMatchObject({
      v3_sealed_work_origin_authenticated: false,
      teacher_run_binding_authenticated: false,
      enclosing_second_scan_success_established: false,
      production_plan_minted: false,
      production_dataset_published: false,
      optimizer_training: false,
      weight_created: false,
      live_evaluation_activated: false,
      formal_ab_completed: false,
      external_calibration_completed: false,
      playing_strength_established: false,
      stable_high_dan_established: false,
    });
  });

  it("holds production output behind the exact two-pass next gate", () => {
    const evidence = readEvidence();
    const next = evidence.next_boundary as Record<string, unknown>;
    expect(next.name).toBe(
      "production-two-pass-v3-authenticated-plan-composition",
    );
    expect(next.implemented_by_this_change).toBe(false);
    expect(next.ordered_requirements).toEqual([
      "common-outer-lock-retained",
      "fixed-production-registry-and-dependencies",
      "fresh-active-stage-lease-and-opaque-v3-scan-key-acquired-before-pass-one",
      "first-pass-exact-sealed-final-held-fd-scan-without-visitor",
      "same-held-work-identity-and-snapshot-pinned",
      "second-pass-same-held-identity-and-snapshot-scan-with-synchronous-visitor",
      "second-enclosing-scan-seal-tail-snapshot-and-path-confirmation-success-before-plan-mint",
      "current-exact-consumer-postflight-claimed",
      "stage-publication-transaction-retained-through-its-own-destination-reconciliation",
      "transaction-lease-removal-and-parent-sync-durable-before-commit-returns",
      "common-outer-lock-retained-through-finalizer-content-audit",
      "separate-result-and-manifest-key-authority-acquired",
      "module-private-persistence-runner-shared-by-separate-test-and-production-adapters",
      "production-adapter-never-enters-test-core-or-test-registries",
      "final-work-reverification",
      "all-keys-zeroized-after-last-use",
      "common-outer-lock-released-only-after-finalizer-content-audit-and-key-zeroization",
      "owner-and-cli-deferred-to-following-boundary",
    ]);
    expect(fs.existsSync(FOCUSED_TEST_PATH)).toBe(true);
  });
});
