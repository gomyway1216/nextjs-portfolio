import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type JsonRecord = Record<string, any>;

const root = process.cwd();
const planPath = path.join(
  root,
  "ml/protocols/halfkp-alpha050-balanced-pure-depth12-v1-plan.json",
);
const plan = JSON.parse(readFileSync(planPath, "utf8")) as JsonRecord;

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

describe("balanced pure depth-12 preregistration", () => {
  it("pins one fixed, value-only training arm", () => {
    expect(plan.plan_id).toBe("B12-alpha050-balanced-pure-v1");
    expect(plan.status).toContain("no-compute-started");
    expect(plan.training.candidate_count).toBe(1);
    expect(plan.training.candidate_selection).toBe("epoch-one-only-no-best-of");

    expect(plan.training.fixed_arm).toMatchObject({
      features: "halfkp-factor",
      halfkp_train_scope: "all",
      epochs: 1,
      batch: 1024,
      learning_rate: 0.00001,
      k: 600,
      cp_clamp: 3000,
      loss: "sigmoid",
      wdl_mix: 0,
      rank_weight: 0,
      policy_weight: 0,
      sibling_weight: 0,
      seed: 42,
      device: "mps",
      torch_threads: 2,
    });
  });

  it("preregisters exact deterministic, color-balanced row counts", () => {
    expect(plan.deterministic_dataset.status).toBe("not-built");
    expect(plan.deterministic_dataset.digest).toBe("sha256");
    expect(plan.deterministic_dataset.sampler).toEqual({
      path: "ml/sample_balanced_teacher_dataset.py",
      schema: "shogi-balanced-strong-teacher-sample-v1",
    });
    expect(plan.deterministic_dataset.selection_key_preimage).toBe(
      "UTF8('shogi-balanced-strong-teacher-sample-v1' + NUL) + UTF8(selection_seed) + NUL + ASCII(position_id)",
    );
    expect(plan.deterministic_dataset.output_order).toBe(
      "selection digest ascending, then position_id ascending across both selected sides",
    );
    expect(plan.deterministic_dataset.training).toMatchObject({
      total_rows: 200000,
      side_rows: { b: 100000, w: 100000 },
      sha256: null,
    });
    expect(plan.deterministic_dataset.validation).toMatchObject({
      total_rows: 2968,
      side_rows: { b: 1484, w: 1484 },
      sha256: null,
    });

    expect(plan.inputs.teacher_training.rows).toBe(800000);
    expect(plan.inputs.teacher_validation.rows).toBe(3000);
    expect(plan.inputs.preparation_report.cross_split_game_overlap).toBe(0);
    expect(
      plan.inputs.preparation_report.cross_split_semantic_position_overlap,
    ).toBe(0);

    const checks = plan.deterministic_dataset.required_checks.join(" ");
    expect(checks).toContain("cp target only");
    expect(checks).toContain("No WDL");
    expect(checks).toContain("position_id is unique");
    expect(checks).toContain("no game, position_id");
  });

  it("fixes the correctness and 56-game decision gates", () => {
    expect(plan.correctness_gate.strength_metric).toBe(false);
    expect(plan.correctness_gate.required_before_match.join(" ")).toContain(
      "at least 200 frozen positions",
    );
    expect(plan.correctness_gate.quantization).toMatchObject({
      maximum_mean_absolute_error_ratio: 1.05,
      maximum_max_absolute_error_ratio: 1.05,
    });

    expect(plan.direct_play_gate).toMatchObject({
      games: 56,
      opening_pairs: 28,
      opening_seed_start: 960001,
      time_limit_ms_per_move: 1500,
      pair_workers: 7,
      opening_book: false,
      mate_solver: false,
      score_unit: "candidate halfpoints out of 112",
      pass_threshold: 62,
      early_stop: "mathematical-futility-only",
      promotion_effect: "none",
    });
    expect(plan.direct_play_gate.required_integrity).toEqual({
      technical_fault_count: 0,
      illegal_move_count: 0,
      unique_openings: 28,
      complete_color_swapped_pairs: 28,
    });
  });

  it("keeps tracked runtime artifacts byte-identical and forbids live writes", () => {
    for (const key of ["immutable_live_baseline", "research_wasm"]) {
      const input = plan.inputs[key];
      const bytes = readFileSync(path.join(root, input.path));
      expect(bytes.byteLength).toBe(input.bytes);
      expect(sha256(bytes)).toBe(input.sha256);
    }

    expect(plan.live_safety).toEqual({
      live_change_authorized: false,
      live_weights_must_remain_unchanged: true,
      production_deployment_authorized: false,
    });
    expect(plan.execution).toMatchObject({
      state: "not-started",
      dataset_preparation_started: false,
      training_started: false,
      correctness_gate_started: false,
      match_started: false,
      execution_authorized_by_this_document: false,
    });
    expect(plan.stop_rules.join(" ")).toContain("Never write the live weight");
    expect(plan.claim_boundary).toContain("no training result");
  });

  it("publishes matching Japanese and English plan notes", () => {
    const japanese = readFileSync(
      path.join(root, "docs/blog-shogi-balanced-pure-depth12-pilot.md"),
      "utf8",
    );
    const english = readFileSync(
      path.join(root, "docs/blog-shogi-balanced-pure-depth12-pilot.en.md"),
      "utf8",
    );

    for (const note of [japanese, english]) {
      expect(note).toContain("B12-alpha050-balanced-pure-v1");
      expect(note).toContain("200,000");
      expect(note).toContain("2,968");
      expect(note).toContain("56");
      expect(note).toContain("62");
      expect(note).toContain(
        "../ml/protocols/halfkp-alpha050-balanced-pure-depth12-v1-plan.json",
      );
    }
  });
});
