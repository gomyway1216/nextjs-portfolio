import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS } from "../../../ml/floodgate-v7-candidate-union";
import {
  FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY,
  FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS,
} from "../../../ml/floodgate-v7-training-label-projection";
import { SIBLING_SCHEMA } from "../../../ml/sibling-data";

const REPOSITORY_ROOT = process.cwd();
const JAPANESE_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-training-label-projection.md",
);
const ENGLISH_ARTICLE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/blog-shogi-floodgate-v7-training-label-projection.en.md",
);
const EVIDENCE_PATH = path.join(
  REPOSITORY_ROOT,
  "docs/data/floodgate-v7-training-label-projection-2026-07-16.json",
);
const IMPLEMENTATION_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-training-label-projection.ts",
);
const FOCUSED_TEST_PATH = path.join(
  REPOSITORY_ROOT,
  "tests/unit/ml/floodgateV7TrainingLabelProjection.test.ts",
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
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
        return JSON.parse(source.slice(start, offset));
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

describe("Floodgate v7 training-label projection evidence", () => {
  it("keeps both articles at twelve sections and replaces stale validation placeholders", () => {
    const japanese = readText(JAPANESE_ARTICLE_PATH);
    const english = readText(ENGLISH_ARTICLE_PATH);
    const expectedSections = Array.from(
      { length: 12 },
      (_value, index) => index + 1,
    );

    expect(numberedSections(japanese)).toEqual(expectedSections);
    expect(numberedSections(english)).toEqual(expectedSections);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-training-label-projection.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-training-label-projection.md",
    );
    for (const article of [japanese, english]) {
      expect(article).toMatch(/1 file\s*\/\s*6 tests/u);
      expect(article).toContain("631 ms");
      expect(article).toMatch(/(?:tsc --noEmit|typecheck|TypeScript)/u);
      expect(article).toContain("Prettier");
    }
    expect(japanese).not.toContain("実行後にのみ記録する予定");
    expect(english).not.toContain("only after execution");
  });

  it("pins unique JSON keys, exact artifact paths, and only observed validation", () => {
    const source = readText(EVIDENCE_PATH);
    expect(() => assertNoDuplicateJsonObjectKeys(source)).not.toThrow();
    expect(() =>
      assertNoDuplicateJsonObjectKeys(
        '{"outer":{"same":1,"\\u0073ame":2},"same":3}',
      ),
    ).toThrow(/Duplicate JSON object key "same"/u);

    const evidence = JSON.parse(source);
    expect(collectNullPaths(evidence)).toEqual([]);
    expect(Object.keys(evidence)).toEqual([
      "schema",
      "evidence_date",
      "evidence_scope",
      "artifacts",
      "projection_contract",
      "mapping_rules",
      "validation",
      "production_execution_for_this_change",
      "playing_strength",
      "next_boundary",
      "nonclaims",
    ]);
    expect(evidence.schema).toBe(
      "shogi-floodgate-v7-training-label-projection-evidence-v1",
    );
    expect(evidence.evidence_date).toBe("2026-07-16");
    expect(evidence.evidence_scope).toEqual({
      class: "local-source-test-and-documentation-candidate-only",
      implementation_kind: "pure-synchronous-structural-projection",
      production_state_freshly_observed_for_this_change: false,
      production_namespace_read_for_this_change: false,
      production_namespace_or_file_content_mutated_for_this_change: false,
      production_gate_invocation_authorized_by_this_evidence: false,
      local_source_or_test_execution_counted_as_production_execution: false,
    });
    expect(evidence.artifacts).toEqual({
      implementation_source: "ml/floodgate-v7-training-label-projection.ts",
      focused_unit_test:
        "tests/unit/ml/floodgateV7TrainingLabelProjection.test.ts",
      japanese_article:
        "docs/blog-shogi-floodgate-v7-training-label-projection.md",
      english_article:
        "docs/blog-shogi-floodgate-v7-training-label-projection.en.md",
      machine_readable_evidence:
        "docs/data/floodgate-v7-training-label-projection-2026-07-16.json",
      evidence_unit_test:
        "tests/unit/ml/floodgateV7TrainingLabelProjectionEvidence.test.ts",
    });
    for (const relativePath of Object.values(evidence.artifacts)) {
      expect(typeof relativePath).toBe("string");
      if (typeof relativePath !== "string") {
        throw new Error("Evidence artifact path must be a string");
      }
      expect(fs.existsSync(path.join(REPOSITORY_ROOT, relativePath))).toBe(
        true,
      );
    }
    expect(evidence.validation).toEqual({
      projection_focused_vitest: {
        status: "pass",
        files: 1,
        tests: 6,
        passed: 6,
        failed: 0,
        vitest_duration_ms: 631,
        test_duration_ms: 90,
      },
      typescript: {
        status: "pass",
        command: "npx tsc --noEmit",
        exit_code: 0,
      },
      prettier: { status: "pass", observation: "formatter-ran" },
      evidence_focused_vitest: {
        status: "pass",
        files: 1,
        tests: 6,
        passed: 6,
        failed: 0,
        vitest_duration_ms: 436,
        test_duration_ms: 5,
      },
      full_vitest: { status: "not-run" },
      eslint: { status: "not-run" },
      production_build: { status: "not-run" },
      ml_stdlib: { status: "not-run" },
      npm_audit: { status: "not-run" },
      github_ci: { status: "not-run" },
    });
  });

  it("binds the public contract to imported literals and structural reverification", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.projection_contract).toEqual({
      contract: FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS,
      claim_boundary: FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY,
      input: "one-caller-supplied-completed-parent-evidence-value",
      input_origin_authenticated: false,
      training_role_authenticated: false,
      completed_parent_structure_reverified: true,
      output_record_schema: SIBLING_SCHEMA,
      output: "deep-frozen-train-rows-in-memory",
      durable_output_created: false,
    });

    const implementation = readText(IMPLEMENTATION_PATH);
    expect(implementation).toContain(
      "verifyFloodgateV7CompletedParentEvidenceCoreForTests(evidenceValue)",
    );
    expect(implementation).toContain(
      "FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CONTRACT",
    );
    expect(implementation).toContain(
      "FLOODGATE_V7_TRAINING_LABEL_PROJECTION_STATUS",
    );
    expect(implementation).toContain(
      "FLOODGATE_V7_TRAINING_LABEL_PROJECTION_CLAIM_BOUNDARY",
    );
    expect(implementation).not.toMatch(/readFile|writeFile|rename|fsync/u);
  });

  it("records the exact forced, rank, score, source, mate, split, and freeze mappings", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.mapping_rules).toEqual({
      forced_parent: {
        candidate_union_status: FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
        completed_parent_state: "forced-parent-skip",
        rows: 0,
        teacher_labels_emitted: 0,
        synthetic_score_created: false,
      },
      ranking: {
        primary: "teacher-parent-cp-descending",
        tie_break: "utf8-move-bytewise-ascending",
        teacher_rank: "one-based-contiguous",
        output_order: "teacher-rank-ascending-then-utf8-move-bytewise",
      },
      child_score: {
        teacher_parent_cp: "verified-independent-rescore-parent-perspective-cp",
        teacher_child_cp: "canonical-sign-inversion-of-teacher-parent-cp",
        cp: "equal-to-teacher-child-cp",
        zero: "canonical-positive-zero",
      },
      sources: {
        provenance_fields: [
          "strong_game_played",
          "production_proposal",
          "stable_policy",
        ],
        row_values: ["played", "teacher", "stable"],
        canonical_order: ["played", "teacher", "stable"],
        deduplicated: true,
        inferred_from_move_or_rank: false,
      },
      mate: {
        teacher_score_kind: "mate",
        teacher_mate: "signed-mate-distance-with-canonical-positive-zero",
        teacher_mate_sign: "exact-verified-explicit-sign",
        mapped_parent_cp_preserved: true,
        child_cp_sign_inverted: true,
        negative_zero_distance_serialized: false,
        negative_zero_sign_preserved_separately: true,
        ordinary_cp_rows_have_mate_fields: false,
      },
      split: {
        value: "train",
        rationale:
          "output-assignment-for-future-authenticated-training-only-caller",
        random_resplit_performed: false,
        selection_or_final_holdout_read: false,
      },
      determinism_and_immutability: {
        filesystem_network_clock_randomness_or_engine_dependencies: 0,
        same_verified_evidence_same_row_semantics_and_order: true,
        input_mutated: false,
        top_level_projection_frozen: true,
        rows_frozen: true,
        nested_source_arrays_frozen: true,
      },
    });

    const implementation = readText(IMPLEMENTATION_PATH);
    const focusedTest = readText(FOCUSED_TEST_PATH);
    for (const marker of [
      'sources.push("played")',
      'sources.push("teacher")',
      'sources.push("stable")',
      "right.rescore.score.cp - left.rescore.score.cp",
      "compareBytewise(left.rescore.move, right.rescore.move)",
      "if (score.mate_distance === 0) return 0",
      'split: "train" as const',
      "rows = Object.freeze([])",
      "validateParentGroups(assignedRows)",
    ]) {
      expect(implementation).toContain(marker);
    }
    expect(focusedTest.match(/^\s*it\(/gmu)).toHaveLength(6);
    expect(focusedTest).toContain("teacher_mate_sign: -1");
    expect(focusedTest).toContain(
      "Object.is(negativeZeroMate?.teacher_mate, -0)",
    );
    expect(focusedTest).toContain('row.split === "train"');
  });

  it("keeps every real operation at zero and runOp1 unchanged", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(Object.keys(evidence.production_execution_for_this_change)).toEqual([
      "production_commands",
      "production_registry_provisions",
      "production_prefix_100_gates",
      "production_prefix_500_gates",
      "production_final_24000_gates",
      "production_checkpoint_records_read",
      "production_hmac_records_verified",
      "real_floodgate_games_read",
      "teacher_generation_runs",
      "teacher_labels_materialized",
      "training_jsonl_files_finalized",
      "training_runs",
      "optimizer_steps",
      "candidate_selection_runs",
      "candidate_promotions",
      "candidate_weight_artifacts",
      "formal_ab_games",
      "external_calibration_games",
      "production_weight_overwrites",
      "live_evaluation_activations",
    ]);
    expect(
      Object.values(evidence.production_execution_for_this_change),
    ).toEqual(Array.from({ length: 20 }, () => 0));
    expect(evidence.playing_strength).toEqual({
      current_production_evaluator: "runOp1",
      current_rollback_evaluator: "runOp1",
      live_weight_changed: false,
      playing_strength_changed_by_this_evidence: false,
      stable_high_dan_claimed: false,
      formal_ab_plan: "192 color-swapped pairs / 384 games",
      formal_ab_color_swapped_pairs: 192,
      formal_ab_total_games: 384,
      external_calibration_games_required: 200,
    });
    expect(evidence.nonclaims).toEqual({
      input_origin_authenticated: false,
      training_role_authenticated: false,
      sealed_work_verified: false,
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

  it("holds publication behind held-FD HMAC, crash safety, and postflight binding", () => {
    const evidence = JSON.parse(readText(EVIDENCE_PATH));
    expect(evidence.next_boundary).toEqual({
      name: "authenticated-crash-safe-training-label-finalization-and-publication",
      ordered_requirements: [
        "held-file-descriptor-incremental-checkpoint-scan",
        "hmac-chain-and-exact-final-24000-completion-verification",
        "deterministic-training-label-projection",
        "crash-safe-training-jsonl-finalization",
        "crash-safe-result-finalization",
        "crash-safe-manifest-finalization",
        "exact-consumer-postflight-receipt-binding",
        "publication-transaction",
      ],
      held_file_descriptor_scan_required: true,
      incremental_hmac_chain_verification_required: true,
      exact_final_24000_completion_required: true,
      training_jsonl_result_and_manifest_crash_safety_required: true,
      consumer_postflight_receipt_binding_required: true,
      publication_transaction_required: true,
      implemented_by_this_change: false,
    });
  });
});
