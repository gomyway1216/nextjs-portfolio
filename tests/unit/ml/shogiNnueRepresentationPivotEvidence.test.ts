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
      status: "halfkp81-g3-direct-screen-rejected-live-unchanged",
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
      "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
    ]) {
      expect(publicText).toContain(marker);
    }
    expect(publicText).not.toMatch(/(?:[\\/]Users[\\/]|[\\/]private[\\/]|parent_sfen|child_sfen)/ui);
  });
});
