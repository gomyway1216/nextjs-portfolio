import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const evidencePath = join(
  root,
  "docs/data/shogi-nnue-representation-pivot-2026-07-21.json",
);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("shogi NNUE representation pivot evidence", () => {
  it("records the failed small representation without claiming strength", () => {
    const evidence = JSON.parse(read(evidencePath));
    expect(evidence).toMatchObject({
      schema: "shogi-nnue-representation-pivot-evidence-v1",
      status: "halfkp81-alpha-0.5-formal768-rejected-live-unchanged",
      live_baseline: {
        bytes: 1185988,
        sha256:
          "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
        changed: false,
      },
      claims: {
        playing_strength_improved: false,
        live_model_changed: false,
        high_dan_calibrated: false,
      },
    });
    expect(evidence.terminated_family.experiments).toMatchObject([
      { candidate_wins: 0, live_wins: 52, draws: 1, adopted: false },
      { candidate_wins: 0, live_wins: 15, draws: 0, adopted: false },
      { candidate_wins: 0, live_wins: 11, draws: 0, adopted: false },
    ]);
  });

  it("records the exact-lift runtime gate and binds the unchanged live bytes", () => {
    const evidence = JSON.parse(read(evidencePath));
    expect(evidence.halfkp81).toMatchObject({
      buckets: 81,
      bytes: 94656708,
      exact_lift_required: true,
      g1: {
        status: "pass",
        static_positions: 1000,
        static_mismatches: 0,
        fixed_depth_cases: 6,
        fixed_depth_mismatches: 0,
        maximum_allowed_slowdown_pct: 5,
      },
    });
    expect(evidence.halfkp81.g1.median_search_slowdown_pct).toBeLessThan(5);
    expect(evidence.halfkp81.g1.aggregate_search_slowdown_pct).toBeLessThan(5);

    const researchRuntime = readFileSync(
      join(root, evidence.halfkp81.g1.runtime.path),
    );
    expect(researchRuntime.byteLength).toBe(evidence.halfkp81.g1.runtime.bytes);
    expect(createHash("sha256").update(researchRuntime).digest("hex")).toBe(
      evidence.halfkp81.g1.runtime.sha256,
    );
    const researchPatch = readFileSync(
      join(root, evidence.halfkp81.g1.runtime.research_patch_path),
    );
    expect(createHash("sha256").update(researchPatch).digest("hex")).toBe(
      evidence.halfkp81.g1.runtime.research_patch_sha256,
    );

    const live = readFileSync(join(root, evidence.live_baseline.path));
    expect(live.byteLength).toBe(evidence.live_baseline.bytes);
    expect(createHash("sha256").update(live).digest("hex")).toBe(
      evidence.live_baseline.sha256,
    );
  });

  it("records the rejected full-corpus exception without promoting it", () => {
    const evidence = JSON.parse(read(evidencePath));
    expect(evidence.halfkp81.g3).toMatchObject({
      status: "direct-screen-rejected",
      source_rows: 5892192,
      valid_rows: 5892140,
      skipped_malformed_rows: 52,
      epochs: 6,
      process_swaps: 0,
      selected_epoch: {
        epoch: 6,
        selection_metric: "validation-pair-accuracy",
        weights_sha256:
          "9321723100311af3440fa6ff96f825e8c1cee71bdd6f61f2316a88bb4c430e94",
        validation_pair_accuracy: 0.934331,
      },
      clear_strength_gain: false,
      adopted: false,
    });
    expect(evidence.halfkp81.g3.direct_screen).toMatchObject({
      status: "stopped-after-mathematical-elimination",
      planned_games: 28,
      completed_games: 27,
      candidate_wins: 8,
      live_wins: 18,
      draws: 1,
      concatenated_lane_logs_sha256:
        "872b6fcf16ce971117e1596f7e9c7de4677276abe04c589dcb483532f314d3ea",
    });
    expect(evidence.halfkp81.multiworker_resource_measurement).toMatchObject({
      decision: "measurement-only-no-browser-pass",
      maximum_instances: 4,
      four_instance_logical_wasm_memory_bytes: 605290496,
      browser_gate_passed: false,
    });
  });

  it("keeps the 88-game pilot explicitly inconclusive and off live", () => {
    const evidence = JSON.parse(read(evidencePath));
    expect(evidence.halfkp81.g2.selected_epoch_6.combined).toMatchObject({
      games: 88,
      candidate_wins: 44,
      live_wins: 40,
      draws: 4,
      clear_strength_gain: false,
      adopted: false,
    });
    expect(evidence.halfkp81.g2.delta_only_screen).toMatchObject({
      candidate_wins: 6,
      live_wins: 21,
      draws: 1,
      adopted: false,
    });
  });

  it("records both rejected early checkpoints and the preregistered stopping boundary", () => {
    const evidence = JSON.parse(read(evidencePath));
    expect(evidence.halfkp81.g3.early_checkpoint_audit).toMatchObject({
      status: "both-rejected",
      games_per_checkpoint: 56,
      pass_half_points: 62,
      result_sha256:
        "8a0703da55e5378ed14808f4dc059c63d875ec047dfb0d41ccb0e7e2718a34da",
      epoch_1: {
        checkpoint_sha256:
          "c4e227634d2466f3cf3250780a0254abea5bd00572c2e1b0d421399bd4df5455",
        candidate_wins: 29,
        live_wins: 26,
        draws: 1,
        candidate_half_points: 59,
        intermediate_after_16_games: {
          candidate_wins: 12,
          live_wins: 4,
          decision_value: "none; the preregistered screen continued",
        },
        concatenated_lane_logs_bytes: 19186,
        concatenated_lane_logs_sha256:
          "76c3df52e6f18db903e1291f30301148abde2c8483f6e31f4658cc9e32fa0290",
        passed: false,
      },
      epoch_2: {
        checkpoint_sha256:
          "c7d250ab808cd8719594dae5ed69c54bd1c978fe90cb479bd0ed06594bd1cff9",
        candidate_wins: 29,
        live_wins: 24,
        draws: 3,
        candidate_half_points: 61,
        concatenated_lane_logs_bytes: 19131,
        concatenated_lane_logs_sha256:
          "46696319801a63a1502689c55579fc84faaf9a6eb886d2a5af00d445d3d2271b",
        passed: false,
      },
      legal_searched_moves: 13069,
      all_searched_moves_legal: true,
      independent_96_game_confirmation_started: false,
      formal_ab_started: false,
      live_promoted: false,
    });
  });

  it("records rejected dual experiments and the completed formal rejection", () => {
    const evidence = JSON.parse(read(evidencePath));
    expect(evidence.dual_perspective_experiments).toMatchObject({
      status: "custom-and-bonapiece-dual-rejected",
      custom_halfkp: {
        runtime_format: 82,
      },
      bonapiece_halfkp: {
        weight_format: 83,
      },
    });
    expect(evidence.next_experiment).toMatchObject({
      status: "browser-confusion-generation-complete-ranking-fine-tune-next",
      representation: "single-perspective HalfKP81 ranking model trained on browser-confusion legal siblings",
      uses_published_nnue_weights: false,
      strength_claimed_before_direct_play: false,
    });
    const rankingTeacher =
      evidence.speed_preserving_experiments.browser_confusion_ranking_teacher;
    expect(rankingTeacher).toMatchObject({
      status: "batch3-generation-complete-ranking-fine-tune-next",
      smoke_parents: 3,
      smoke_legal_moves: 239,
      shards_completed: 16,
      parents_per_shard: 125,
      parents: 2000,
      ranking_records: 171429,
      unique_games: 53,
      forced_positions: 27,
      agreement_positions: 1012,
      eligible_positions: 3213,
      typed_skips: {
        browser: 21,
        teacher: 153,
      },
      ranking_bytes: 146984194,
      parents_bytes: 211038587,
      ordered_shard_identity_sha256:
        "5a198b50a617c0c427ce87082c8ec97a917788be1ccbdb4883476ec485f83f53",
      elapsed_seconds: 2555,
      technical_faults: 0,
      implementation_pr: 609,
      implementation_pr_merged: true,
      live_weights_changed: false,
    });
    expect(rankingTeacher.parents).toBe(
      rankingTeacher.shards_completed * rankingTeacher.parents_per_shard,
    );
    expect(rankingTeacher.elapsed_seconds).toBe(42 * 60 + 35);
    expect(rankingTeacher).not.toHaveProperty("estimated_parents_per_day_at_8_shards");
    expect(evidence.claims.playing_strength_improved).toBe(false);
    expect(evidence.live_baseline.changed).toBe(false);
    expect(evidence.speed_preserving_experiments.halfkp81_alpha_0_5_interpolation.independent96).toMatchObject({
      status: "passed-clean-rerun-after-invalidated-technical-fault-attempt",
      candidate_wins: 53,
      live_wins: 37,
      draws: 6,
      bootstrap_lower_half_points: 98,
      bootstrap_denominator_half_points: 192,
      report_sha256: "5536d314cfa03d93920435159bf53924fc32fc61d15cf35c1dd5bfb8d2f92038",
      technical_faults: 0,
      passed: true,
    });
    expect(evidence.speed_preserving_experiments.halfkp81_alpha_0_5_interpolation.formal768).toMatchObject({
      status: "rejected-complete",
      report_sha256: "1f83896df8e55c631caa475494a4ba66a10f930068d2ec8ee236c9bf4abfa8ec",
      manifest_sha256: "6470c79b95ccf94fdd51fd017b05daab9e39b9ea98f7a22db4e8a7b72f0cc4e0",
      pairs: 384,
      games: 768,
      workers: 12,
      candidate_wins: 376,
      live_wins: 357,
      draws: 35,
      candidate_half_points: 787,
      score_denominator_half_points: 1536,
      bootstrap_seed: 20260710,
      bootstrap_replicates: 100000,
      bootstrap_denominator_half_points: 1536,
      one_sided_95_lower_half_points: 742,
      two_sided_95_lower_half_points: 733,
      safety_passed: true,
      stronger_passed: false,
      all_moves_legal: true,
      all_openings_unique: true,
      technical_faults: 0,
      completed: true,
      decision: "rejected-complete",
      passed: false,
      promotion_authorized_before_completion: false,
      promotion_authorized_after_completion: false,
      external_calibration_started: false,
    });
  });

  it("publishes the same bilingual boundaries without private paths", () => {
    const publicText = [
      "docs/blog-shogi-opening-book.md",
      "docs/blog-shogi-opening-book.en.md",
      "docs/data/shogi-nnue-representation-pivot-2026-07-21.json",
    ]
      .map((file) => read(join(root, file)))
      .join("\n");
    for (const marker of [
      "0勝・現行52勝・1分",
      "candidate 0 wins, production 52 wins, one draw",
      "94,656,708",
      "3.99%",
      "44勝40敗4分",
      "44 wins, 40 losses, four draws",
      "候補8勝・現行18勝・1分",
      "eight candidate wins, 18 production wins, and one draw",
      "29勝26敗1分、得点率52.68%",
      "29 wins, 26 losses, one draw: a 52.68% score",
      "29勝24敗3分、得点率54.46%",
      "29 wins, 24 losses, three draws: a 54.46% score",
      "候補53勝、現行37勝、6分",
      "53 candidate wins, 37 production wins, and six draws",
      "51.04%",
      "候補376勝、現行357勝、35分",
      "376 candidate wins, 357 production wins, and 35 draws",
      "51.236979%",
      "48.307292%",
      "47.721354%",
      "1f83896df8e55c631caa475494a4ba66a10f930068d2ec8ee236c9bf4abfa8ec",
      "16 shard（各125親）",
      "16 shards at 125 parents each",
      "2,000親",
      "2,000 parents",
      "171,429 ranking records",
      "42分35秒",
      "42 minutes 35 seconds",
      "技術障害0",
      "zero technical faults",
      "PR #609",
      "13,069",
      "[256 us, 256 them] -> 32 -> 32 -> 1",
      "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
    ]) {
      expect(publicText).toContain(marker);
    }
    expect(publicText).not.toMatch(/(?:[\\/]Users[\\/]|[\\/]private[\\/]|parent_sfen|child_sfen)/ui);
  });
});
