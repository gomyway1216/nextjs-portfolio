import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_STATUS,
} from "../../../ml/floodgate-v7-teacher-checkpoint";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-sealed-work-visitor.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-sealed-work-visitor.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-sealed-work-visitor-2026-07-16.json",
);
const IMPLEMENTATION_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-teacher-checkpoint.ts",
);
const FOCUSED_TEST_PATH = path.join(
  REPOSITORY_ROOT,
  "tests/unit/ml/floodgateV7TeacherCheckpoint.test.ts",
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

describe("Floodgate v7 sealed-work verified-parent visitor evidence", () => {
  it("pins unique JSON keys, exact artifact paths, and pending-only validation", () => {
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
      "visitor_contract",
      "sealed_scan_semantics",
      "focused_test_methodology",
      "validation",
      "production_execution_for_this_change",
      "playing_strength",
      "next_boundary",
      "nonclaims",
    ]);
    expect(evidence.schema).toBe(
      "shogi-floodgate-v7-sealed-work-verified-parent-visitor-evidence-v1",
    );
    expect(evidence.evidence_date).toBe("2026-07-16");
    expect(evidence.evidence_scope).toEqual({
      class: "local-source-test-and-documentation-candidate-only",
      implementation_kind:
        "non-production-test-dependency-only-sealed-final-observation-seam",
      test_or_internal_only: true,
      production_state_freshly_observed_for_this_change: false,
      production_namespace_read_for_this_change: false,
      production_namespace_or_file_content_mutated_for_this_change: false,
      production_gate_invocation_authorized_by_this_evidence: false,
      local_source_or_test_execution_counted_as_production_execution: false,
    });
    expect(evidence.artifacts).toEqual({
      implementation_source: "ml/floodgate-v7-teacher-checkpoint.ts",
      focused_unit_test: "tests/unit/ml/floodgateV7TeacherCheckpoint.test.ts",
      japanese_article: "docs/blog-shogi-floodgate-v7-sealed-work-visitor.md",
      english_article: "docs/blog-shogi-floodgate-v7-sealed-work-visitor.en.md",
      machine_readable_evidence:
        "docs/data/floodgate-v7-sealed-work-visitor-2026-07-16.json",
      evidence_unit_test:
        "tests/unit/ml/floodgateV7SealedWorkVisitorEvidence.test.ts",
    });
    for (const relativePath of Object.values(
      evidence.artifacts as Record<string, unknown>,
    )) {
      expect(typeof relativePath).toBe("string");
      if (typeof relativePath !== "string") {
        throw new Error("Evidence artifact path must be a string");
      }
      expect(fs.existsSync(path.join(REPOSITORY_ROOT, relativePath))).toBe(
        true,
      );
    }

    const validation = evidence.validation as Record<string, unknown>;
    expect(validation.validation_candidate_revision).toBeNull();
    for (const [name, result] of Object.entries(validation)) {
      if (name === "validation_candidate_revision") continue;
      expect(result).toMatchObject({ status: "PENDING" });
      expect(
        Object.entries(result as Record<string, unknown>)
          .filter(([field]) => field !== "status")
          .every(([_field, value]) => value === null),
      ).toBe(true);
    }
    const nullPaths = collectNullPaths(evidence);
    expect(nullPaths.length).toBeGreaterThan(0);
    expect(
      nullPaths.every((nullPath) => nullPath.startsWith("validation.")),
    ).toBe(true);
  });

  it("binds the visitor contract to imported literals and test-only scope", () => {
    const evidence = readEvidence();
    expect(evidence.visitor_contract).toEqual({
      contract:
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CONTRACT,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_STATUS,
      claim_boundary:
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CLAIM_BOUNDARY,
      dependency_name: "verifiedParentVisitorForTests",
      surface: "optional-test-dependency-only",
      runtime_contract_constants_added: 3,
      exported_types_added: 2,
      test_dependency_properties_added: 1,
      test_only_runtime_helper_exports_added: 1,
      test_only_runtime_helper_authenticates_or_mints_event: false,
      production_executable_reader_entry_point_added: false,
      production_cli_argument_added: false,
      trusted_test_hooks_and_current_js_realm: true,
      hostile_same_process_mutation_resistance_claimed: false,
      allowed_scan_policy: "sealed-final-only",
      durable_prefix_100_invocations: 0,
      durable_prefix_500_invocations: 0,
      callback: {
        synchronous: true,
        must_return_exactly_undefined: true,
        proxy_allowed: false,
        throw_aborts_enclosing_scan: true,
        promise_or_thenable_handoff_authorized: false,
      },
      event: {
        delivery_condition:
          "after-one-completed-parent-entry-passes-existing-exact-structure-run-binding-digest-canonical-byte-and-hmac-chain-checks",
        fields: [
          "contract",
          "status",
          "claim_boundary",
          "input_index",
          "parent",
          "completed_evidence",
          "completed_evidence_sha256",
          "entry_mac",
        ],
        deep_frozen_runtime_value: true,
        provisional: true,
        enclosing_sealed_final_scan_success_proven: false,
        standalone_work_authentication: false,
        output_authority: false,
      },
    });

    const implementation = readText(IMPLEMENTATION_PATH);
    expect(implementation).toContain(
      "readonly verifiedParentVisitorForTests?: FloodgateV7TeacherCheckpointV3VerifiedParentVisitorForTests",
    );
    expect(implementation).toContain(
      'verifiedParentVisitor !== undefined && policy !== "sealed-final"',
    );
    expect(implementation).toContain(
      "plan.sealed ? invocation.verifiedParentVisitorForTests : undefined",
    );
    expect(implementation).toContain("invokeVerifiedParentVisitorForTests(");
    expect(implementation).toContain(
      "invokeFloodgateV7TeacherCheckpointV3VerifiedParentVisitorCoreForTests",
    );
    expect(implementation).toContain("must return exactly undefined");
    expect(implementation).toContain("must be a non-Proxy function");
  });

  it("records exact sealed-final shape and provisional event semantics", () => {
    const evidence = readEvidence();
    expect(evidence.sealed_scan_semantics).toEqual({
      held_file_descriptor_scan_reused: true,
      new_checkpoint_parser_added: false,
      checkpoint_format_changed: false,
      checkpoint_bytes_written_by_visitor: 0,
      final_parent_records: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      durable_prefix_milestone_records: 2,
      header_records: 1,
      seal_records: 1,
      exact_final_complete_records:
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 4,
      visitor_may_observe_entry_before_seal_validation: true,
      visitor_invocation_implies_enclosing_scan_success: false,
      visitor_invocation_grants_durable_output_authority: false,
      visitor_invocation_grants_publication_authority: false,
      visitor_invocation_grants_training_authority: false,
      no_visitor_path_intended_semantics_changed: false,
    });

    const focusedTest = readText(FOCUSED_TEST_PATH);
    for (const marker of [
      "verifiedParentEvents",
      "expectDeepFrozen(event)",
      "throwingVisitorCalls",
      "nonvoidVisitorCalls",
      "promiseVisitorCalls",
      "proxyVisitorCalls",
      "FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 4",
    ]) {
      expect(focusedTest).toContain(marker);
    }
  });

  it("pins the bounded hybrid load method without claiming per-entry fsync durability", () => {
    const evidence = readEvidence();
    expect(evidence.focused_test_methodology).toEqual({
      classification:
        "synthetic-visitor-semantics-and-load-test-not-production-or-per-entry-fsync-durability-evidence",
      corpus: {
        parents: 24_000,
        forced_parents: 23_999,
        non_forced_parents: 1,
        real_floodgate_games_read: 0,
      },
      checkpoint_build: {
        resumed_from_parents: 500,
        appended_parent_records: 23_500,
        seal_records_appended: 1,
        test_only_regular_file_syncs_suppressed: 23_501,
        suppression_begins_after_native_prefix_resume: true,
        native_file_handle_sync_restored_before_visitor_scan: true,
        work_file_batch_syncs_before_visitor_scan: 1,
        stage_directory_batch_syncs_before_visitor_scan: 1,
        per_entry_fsync_durability_reverified_by_this_run: false,
      },
      visitor_scan: {
        sealed_final_full_scans: 1,
        expected_verified_parent_events: 24_000,
        expected_complete_records: 24_004,
        late_failure_phase: "after-final-scan-before-path-confirmation",
        event_alone_implies_terminal_operation_success: false,
      },
      callback_contract: {
        retained_real_scanner_event_used: true,
        shared_enforcement_helper_used: true,
        negative_cases_run_in_constant_time_without_file_rescan: true,
        cases: [
          "exact-undefined-success",
          "visitor-throw",
          "non-undefined-value",
          "rejecting-native-promise-observed",
          "proxy-rejected-before-call",
        ],
      },
    });

    const focusedTest = readText(FOCUSED_TEST_PATH);
    for (const marker of [
      "forcedParents",
      "suppressedRegularFileSyncs",
      "restoredBeforeVisitorScan",
      "after-final-scan-before-path-confirmation",
      "measureJsonlFile",
      "invokeFloodgateV7TeacherCheckpointV3VerifiedParentVisitorCoreForTests",
    ]) {
      expect(focusedTest).toContain(marker);
    }
  });

  it("keeps both articles at twelve sections with unclaimed validation", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expectedSections = Array.from(
      { length: 12 },
      (_value, index) => index + 1,
    );

    expect(numberedSections(japanese)).toEqual(expectedSections);
    expect(numberedSections(english)).toEqual(expectedSections);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-sealed-work-visitor.en.md",
    );
    expect(english).toContain("blog-shogi-floodgate-v7-sealed-work-visitor.md");
    for (const article of [japanese, english]) {
      expect(article.match(/PENDING/gu)?.length).toBeGreaterThanOrEqual(6);
      expect(article).toContain("24,004");
      expect(article).toContain(
        FLOODGATE_V7_TEACHER_CHECKPOINT_V3_VERIFIED_PARENT_EVENT_CONTRACT,
      );
    }
  });

  it("keeps every production, output, training, weight, live, and match action at zero", () => {
    const evidence = readEvidence();
    const productionExecution =
      evidence.production_execution_for_this_change as Record<string, unknown>;
    expect(Object.keys(productionExecution)).toEqual([
      "production_commands",
      "production_reader_or_command_entry_points_added",
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
    expect(Object.values(productionExecution)).toEqual(
      Array.from({ length: 26 }, () => 0),
    );
    expect(evidence.playing_strength).toEqual({
      current_production_evaluator: "runOp1",
      current_rollback_evaluator: "runOp1",
      live_weight_changed: false,
      playing_strength_changed_by_this_evidence: false,
      stable_high_dan_claimed: false,
      formal_ab_plan: "192 color-swapped pairs / 384 games",
      formal_ab_color_swapped_pairs_required: 192,
      formal_ab_total_games_required: 384,
      external_calibration_games_required: 200,
    });
    expect(evidence.nonclaims).toEqual({
      hostile_same_process_mutation_resistance_established: false,
      standalone_work_authenticated_by_event: false,
      enclosing_sealed_final_scan_success_established_by_event: false,
      production_reader_or_cli_available: false,
      output_authority_granted: false,
      production_output_created: false,
      teacher_dataset_finalized: false,
      durable_result_or_manifest: false,
      published: false,
      optimizer_training: false,
      candidate_selected: false,
      weight_created: false,
      live_evaluation_activated: false,
      formal_ab_completed: false,
      external_calibration_completed: false,
      playing_strength_established: false,
      stable_high_dan_established: false,
    });
  });

  it("holds output behind a successful second scan and fresh finalizer authority", () => {
    const evidence = readEvidence();
    expect(evidence.next_boundary).toEqual({
      name: "authenticated-crash-safe-training-label-finalization-and-publication",
      required_composition: "two-pass-same-held-identity-and-snapshot",
      ordered_requirements: [
        "common-outer-lock-retained",
        "fresh-active-stage-lease-and-opaque-v3-checkpoint-scan-key-acquired-before-pass-one",
        "fresh-active-stage-lease-retained-through-publication-and-destination-revalidation",
        "first-pass-exact-sealed-final-scan-without-visitor",
        "second-pass-same-held-identity-and-snapshot-scan-with-synchronous-visitor",
        "second-enclosing-scan-success-before-output-authorization",
        "current-exact-consumer-postflight-claimed",
        "fresh-domain-separated-output-finalizer-key-authority",
        "crash-safe-training-jsonl-finalization",
        "crash-safe-result-finalization",
        "crash-safe-manifest-finalization",
        "publication-and-destination-revalidation",
        "checkpoint-scan-and-output-keys-zeroized-after-last-required-reverification",
        "terminal-stage-lease-close-while-common-outer-lock-remains-held",
      ],
      implemented_by_this_change: false,
    });
  });
});
