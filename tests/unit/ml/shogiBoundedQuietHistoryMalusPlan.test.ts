import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  searchWasmOpeningSetSha256,
  validateSearchWasmPlan,
} from "../../../wasm-spike/match-search-wasm-vs-production";

type JsonRecord = Record<string, any>;

const root = process.cwd();
const planPath = path.join(
  root,
  "ml/protocols/bounded-quiet-history-malus-v1-plan.json",
);
const plan = JSON.parse(readFileSync(planPath, "utf8")) as JsonRecord;

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

describe("bounded quiet-history malus preregistration", () => {
  it("preserves immutable inputs and fails closed after production advances", () => {
    for (const key of [
      "immutable_live_weights",
      "correctness_fixture",
      "existing_opening_evidence",
    ]) {
      const input = plan.pinned_inputs[key];
      const bytes = readFileSync(path.join(root, input.path));
      expect(bytes.byteLength).toBe(input.bytes);
      expect(sha256(bytes)).toBe(input.sha256);
    }

    for (const key of ["production_search_source", "production_wasm"]) {
      const input = plan.pinned_inputs[key];
      const current = readFileSync(path.join(root, input.path));
      expect(
        { bytes: current.byteLength, sha256: sha256(current) },
        `${key} must not be silently treated as the sealed runtime`,
      ).not.toEqual({ bytes: input.bytes, sha256: input.sha256 });
    }

    const oldProductionWasm = Buffer.from(
      readFileSync(
        path.join(
          root,
          "docs/data/shogi-dual-hash-lock-production-wasm-2026-07-25.base64",
        ),
        "utf8",
      ),
      "base64",
    );
    expect({
      bytes: oldProductionWasm.byteLength,
      sha256: sha256(oldProductionWasm),
    }).toEqual({
      bytes: plan.pinned_inputs.production_wasm.bytes,
      sha256: plan.pinned_inputs.production_wasm.sha256,
    });

    expect(plan.parent_main_commit).toBe(
      "a694e1483df2609ee98aa4d530fa738515ddb665",
    );
    expect(plan.pinned_inputs.correctness_fixture).toMatchObject({
      cases: 64,
      categories: {
        opening: 16,
        middlegame: 16,
        dropHeavy: 16,
        checkEvasion: 16,
      },
      use: "correctness-and-activation-only-not-playing-strength",
    });
  });

  it("registers exactly one bounded cutoff-local candidate", () => {
    expect(plan.plan_id).toBe("bounded-quiet-history-malus-v1");
    expect(plan.status).toContain("single-candidate");
    expect(plan.status).toContain(
      "no-formal-correctness-gate-or-match-started",
    );
    expect(plan.sole_candidate).toMatchObject({
      id: "bounded-quiet-history-malus-v1",
      candidate_count: 1,
      production_default: false,
      research_toggle_required: true,
    });
    expect(plan.sole_candidate.cutoff_update).toEqual({
      reward_target: "the eligible quiet move that causes a beta cutoff",
      malus_targets:
        "the first at most 32 eligible quiet moves, in search order, actually searched before the cutoff move at the same node; later eligible quiets are counted as storage drops and are not updated",
      clamped_depth: "d = clamp(depth_left, 1, 32)",
      reward_bonus: "min(2048, 16 * d * d)",
      malus_bonus: "-min(1024, 8 * d * d)",
      maximum_absolute_history: 16384,
      searched_quiet_capacity_per_ply: 32,
      formula:
        "h = clamp(current, -16384, 16384); b = clamp(raw_bonus, -16384, 16384); next = clamp(h + b - trunc(h * abs(b) / 16384), -16384, 16384)",
      postcondition: "-16384 <= next <= 16384",
      extra_decay: false,
    });
    expect(plan.sole_candidate.enabled_replacement_boundary).toMatchObject({
      new_behavior: expect.stringContaining("first at most 32"),
      overflow_behavior: expect.stringContaining("storageDrops"),
    });
    expect(
      plan.sole_candidate.enabled_replacement_boundary.replaced.join(" "),
    ).toContain("every beta cutoff");
    expect(
      plan.sole_candidate.enabled_replacement_boundary.unchanged,
    ).toContain("killer move updates");
    expect(plan.sole_candidate.eligibility_filter.required).toContain(
      "a non-checking drop is allowed when every other condition holds",
    );
    expect(plan.sole_candidate.eligibility_filter.forbidden).not.toContain(
      "drops",
    );
    expect(plan.sole_candidate.eligibility_filter.forbidden).toContain(
      "moves that give check",
    );

    const prior = plan.relation_to_prior_work;
    expect(prior.rejected_history_gravity.prior_method).toContain(
      "Globally halve",
    );
    expect(prior.rejected_history_gravity.why_this_is_distinct).toContain(
      "never performs periodic global decay",
    );
    expect(prior.invalid_b12_training.decision).toContain("Do not rerun");
    expect(prior.invalid_b12_training.why_this_is_distinct).toContain(
      "live weights byte-identical",
    );
    expect(prior.excluded_families.join(" ")).toContain(
      "No NNUE or scalar-evaluator training",
    );
  });

  it("fixes fail-closed OFF parity and ON safety counters", () => {
    expect(plan.correctness_gate.search).toEqual({
      fixed_depth: 5,
      quiescence_depth: 8,
      timed: false,
      shared_tt: false,
      clear_tt_before_every_search: true,
    });
    expect(plan.correctness_gate.toggle_off).toMatchObject({
      cases: 64,
      required_mismatches: 0,
      state_checksum_mismatches: 0,
    });
    expect(plan.correctness_gate.toggle_off.required_exact_fields).toEqual([
      "best_move",
      "score",
      "completed_depth",
      "nodes",
      "leaves",
    ]);
    expect(plan.correctness_gate.toggle_on).toEqual({
      cases: 64,
      all_returned_moves_legal: true,
      repeat_runs_bit_exact: true,
      state_checksum_mismatches: 0,
      reward_updates_strictly_greater_than: 0,
      malus_updates_strictly_greater_than: 0,
      main_history_updates_strictly_greater_than: 0,
      continuation_history_updates_strictly_greater_than: 0,
      maximum_absolute_main_history_at_most: 16384,
      maximum_absolute_continuation_history_at_most: 16384,
      searched_quiet_capacity_per_ply: 32,
      maximum_observed_stored_quiets_at_most: 32,
      non_quiet_update_violation_count: 0,
      reward_and_malus_activated_in_each_category: true,
    });
    expect(plan.correctness_gate.technical_fault_count).toBe(0);
    expect(plan.correctness_gate.failure_effect).toContain(
      "Stop before direct play",
    );
  });

  it("fixes fresh paired openings, the two-hour boundary, and 62/112", () => {
    expect(plan.direct_play_gate).toMatchObject({
      games: 56,
      opening_pairs: 28,
      games_per_pair: 2,
      time_limit_ms_per_move: 1500,
      pair_workers: 12,
      opening_book: false,
      mate_solver: false,
      heavy_concurrent_work_allowed: false,
      score_unit: "candidate halfpoints out of 112",
      pass_threshold: 62,
      pass_expression: "candidate_halfpoints >= 62",
      early_stop: "mathematical-futility-only",
      early_stop_expression:
        "stop only when candidate_halfpoints + 2 * remaining_games < 62",
      promotion_effect: "none",
    });
    expect(plan.direct_play_gate.weights_for_both_arms).toBe(
      "pinned_inputs.immutable_live_weights",
    );
    expect(plan.direct_play_gate.opening_policy.pair_seeds).toEqual(
      Array.from({ length: 28 }, (_, index) => 970002 + index),
    );
    expect(
      plan.direct_play_gate.opening_policy.opening_fingerprints,
    ).toHaveLength(28);
    expect(
      new Set(plan.direct_play_gate.opening_policy.opening_fingerprints).size,
    ).toBe(28);
    expect(
      plan.direct_play_gate.opening_policy.existing_opening_fingerprint_count,
    ).toBe(3198);
    expect(
      plan.direct_play_gate.opening_policy
        .intersection_with_existing_opening_fingerprints,
    ).toEqual([]);
    expect(plan.direct_play_gate.opening_policy.skipped_seeds).toEqual([
      {
        seed: 970001,
        reason: "fingerprint-already-enrolled",
        fingerprint:
          "7f8787bcefee036754c220d7515f175bb38ea73642daed6d4eb3b4fe89d06eba",
        collides_with_manifest_pair_seeds: [810127],
      },
    ]);
    expect(plan.direct_play_gate.opening_policy.required_preflight).toContain(
      "3,198-fingerprint",
    );
    expect(plan.direct_play_gate.opening_policy.required_preflight).toContain(
      "first-28-fresh",
    );
    expect(plan.direct_play_gate.wall_clock).toEqual({
      target: "complete within two hours",
      maximum_elapsed_ms: 7200000,
      deadline_effect:
        "STOP with no strength conclusion; partial results cannot pass or authorize selective continuation",
    });
    expect(plan.direct_play_gate.required_integrity).toEqual({
      technical_fault_count: 0,
      illegal_move_count: 0,
      unique_openings: 28,
      complete_color_swapped_pairs: 28,
      candidate_runtime_identity_matches: true,
      baseline_runtime_identity_matches: true,
      both_weight_identities_match: true,
      candidate_research_toggle_enabled: true,
      production_research_toggle_absent: true,
      every_played_move_revalidated_legal: true,
      perpetual_check_adjudicated_as_checker_loss: true,
      original_two_hour_deadline_survives_restart: true,
      technical_fault_and_wall_stop_are_durable: true,
    });
    expect(plan.direct_play_gate.any_fault_effect).toContain(
      "complete pilot is invalid",
    );
  });

  it("records the full enrolled-opening set and the deterministic collision skip", () => {
    const evidenceAsset = plan.pinned_inputs.existing_opening_evidence;
    const evidence = JSON.parse(
      readFileSync(path.join(root, evidenceAsset.path), "utf8"),
    ) as JsonRecord;
    const full = evidence.full_enrolled_sorted_unique_fingerprints as string[];

    expect(evidence).toMatchObject({
      schema: "shogi-bounded-quiet-history-existing-openings-v1",
      source_receipt_files: 691,
      sorted_unique_count: 607,
      source_manifest_files: 11,
      manifest_pair_seed_occurrences: 5060,
      manifest_unique_pair_seed_count: 3220,
      manifest_sorted_unique_fingerprint_count: 3198,
      receipt_fingerprints_missing_from_manifest_count: 0,
      full_enrolled_sorted_unique_count: 3198,
      full_enrolled_canonical_list_raw_sha256:
        "0dde79f19d21dbf671de9525dc87bd4e9c8a617e1a06e3a61f704f1dcbaed291",
    });
    expect(full).toHaveLength(3198);
    expect(full).toEqual([...full].sort());
    expect(new Set(full).size).toBe(full.length);
    expect(sha256(Buffer.from(JSON.stringify(full)))).toBe(
      evidence.full_enrolled_canonical_list_raw_sha256,
    );
    expect(evidence.new_opening_selection).toMatchObject({
      seed_start: 970001,
      target_count: 28,
      selected_pair_seeds: Array.from(
        { length: 28 },
        (_, index) => 970002 + index,
      ),
      full_enrolled_fingerprint_intersection_count: 0,
      within_selection_duplicate_fingerprint_count: 0,
    });
  });

  it("binds the executable 12-worker direct-play manifest", () => {
    const manifest = validateSearchWasmPlan(plan.execution_manifest);
    expect(manifest.experiment_id).toBe(plan.plan_id);
    expect(manifest.match).toMatchObject({
      pairs: 28,
      games: 56,
      pair_workers: 12,
      milliseconds_per_move: 1500,
      pass_halfpoints: 62,
      score_denominator_halfpoints: 112,
      wall_clock_limit_seconds: 7200,
    });
    expect(manifest.match.pair_seeds).toEqual(
      plan.direct_play_gate.opening_policy.pair_seeds,
    );
    expect(manifest.match.opening_set_sha256).toBe(
      searchWasmOpeningSetSha256(manifest.match.pair_seeds),
    );
    expect(manifest.assets.runner).toEqual(
      plan.planned_research_artifacts.match_runner,
    );
    expect(manifest.assets.candidate_wasm).toEqual(
      plan.planned_research_artifacts.research_wasm,
    );
  });

  it("keeps research identities fail-closed and forbids production edits", () => {
    for (const key of [
      "patch",
      "builder",
      "research_wasm",
      "correctness_runner",
      "match_runner",
    ]) {
      const artifact = plan.planned_research_artifacts[key];
      const bytes = readFileSync(path.join(root, artifact.path));
      expect(bytes.byteLength).toBe(artifact.bytes);
      expect(sha256(bytes)).toBe(artifact.sha256);
    }
    expect(plan.planned_research_artifacts.identity_rule).toContain(
      "must all be exact before the preregistration PR is merged",
    );

    expect(plan.live_safety.live_change_authorized).toBe(false);
    expect(plan.live_safety.production_deployment_authorized).toBe(false);
    expect(plan.live_safety.forbidden_writes_during_pilot).toEqual([
      "wasm-spike/assembly/index.ts",
      "src/components/game/ShogiImproved/ShogiAIImprovedV20.ts",
      "src/components/game/ShogiImproved/wasm/shogi.wasm",
      "src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts",
      "public/shogi-nnue-weights.bin",
    ]);
    expect(plan.live_safety.research_build_rule).toContain("temporary copy");
    expect(plan.downstream_if_pass).toEqual({
      next_gate:
        "a separately preregistered independent 96-game confirmation with unused seeds and opening fingerprints",
      automatic_live_promotion: false,
      automatic_production_merge: false,
      automatic_parameter_or_variant_expansion: false,
    });
    expect(plan.execution).toMatchObject({
      state:
        "research-build-and-premerge-diagnostic-complete-formal-gate-and-match-not-started",
      implementation_started: true,
      research_artifact_identity_complete: true,
      premerge_implementation_diagnostic_complete: true,
      correctness_gate_started: false,
      opening_preflight_started: true,
      opening_preflight_complete: true,
      match_started: false,
      execution_authorized_by_this_document: false,
    });
    expect(plan.claim_boundary).toContain(
      "externally visible preregistration timestamp is the PR merge",
    );
  });

  it("publishes matching Japanese and English prospective notes", () => {
    const japanese = readFileSync(
      path.join(root, "docs/blog-shogi-bounded-quiet-history-malus-pilot.md"),
      "utf8",
    );
    const english = readFileSync(
      path.join(
        root,
        "docs/blog-shogi-bounded-quiet-history-malus-pilot.en.md",
      ),
      "utf8",
    );

    for (const note of [japanese, english]) {
      expect(note).toContain("bounded-quiet-history-malus-v1");
      expect(note.toLowerCase()).toContain("history gravity");
      expect(note).toContain("B12");
      expect(note).toContain("970001");
      expect(note).toContain("56");
      expect(note).toContain("62/112");
      expect(note).toContain("1.5");
      expect(note).toContain("12");
      expect(note).toContain("2");
      expect(note).toContain(
        "../ml/protocols/bounded-quiet-history-malus-v1-plan.json",
      );
    }
  });
});
