import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const registryPath = path.join(
  root,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-constrained-alignment-v2-result-registry.json",
);
const evidencePath = path.join(
  root,
  "docs/data/floodgate-strength-first-constrained-alignment-v2-completion-2026-07-20.json",
);
const japanesePath = path.join(
  root,
  "docs/blog-shogi-floodgate-strength-first-constrained-alignment-v2-completion.md",
);
const englishPath = path.join(
  root,
  "docs/blog-shogi-floodgate-strength-first-constrained-alignment-v2-completion.en.md",
);

function bytes(file: string): Buffer {
  return fs.readFileSync(file);
}

function sha256(file: string): string {
  return createHash("sha256").update(bytes(file)).digest("hex");
}

describe("constrained alignment v2 completion evidence", () => {
  it("binds the exact checked-in registry", () => {
    const evidence = JSON.parse(bytes(evidencePath).toString("utf8"));
    expect(fs.statSync(registryPath).size).toBe(evidence.registry.bytes);
    expect(sha256(registryPath)).toBe(evidence.registry.sha256);
    expect(evidence.registry).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-qat-constrained-alignment-v2-result-registry-v1",
      bytes: 26117,
      sha256:
        "a90da54d6c66ea78710c3ac8d54519810f4df12990f4cc0eb7650af4cd023e6b",
    });
  });

  it("records the measured local run and all seven integer equalities per seed", () => {
    const registry = JSON.parse(bytes(registryPath).toString("utf8"));
    expect(registry).toMatchObject({
      status: "complete-representation-alignment-only",
      run_observation: {
        authenticated_by_builder: false,
        provenance:
          "operator-transcribed-from-terminal-time-output-not-authenticated-by-result-registry-builder",
        concurrent_processes: 3,
        seeds: [42, 43, 44],
        threads_per_process: 2,
        wall_seconds: 92.69,
        user_cpu_seconds: 263.29,
        system_cpu_seconds: 63.9,
        maximum_resident_set_size_bytes: 1860321280,
        swaps: 0,
      },
    });
    expect(registry.runs.map((run: { seed: number }) => run.seed)).toEqual([
      42, 43, 44,
    ]);
    for (const run of registry.runs) {
      expect(run.integer_target_cache).toMatchObject({
        rows: 278736,
        bytes: 1114944,
        reused_local_epochs: 4,
      });
      expect(run.training_history).toHaveLength(4);
      expect(run.parent).toMatchObject({
        seed: run.seed,
        slot_id: `floodgate-strength-first-int16-aware-seed-${run.seed}`,
        result: {
          path: `ml/runs/floodgate-q1-2026-strength-first-int16-aware/seed-${run.seed}/result.json`,
          schema: "shogi-floodgate-strength-first-qat-training-result-v2",
        },
        checkpoint: {
          path: `ml/runs/floodgate-q1-2026-strength-first-int16-aware/seed-${run.seed}/final.pt`,
          schema: "shogi-floodgate-strength-first-qat-final-checkpoint-v2",
          epoch: 20,
        },
      });
      expect(run.quantized_equality).toMatchObject({
        method: "independent-strict-load-quantize-model-torch-equal",
        equal_tensor_count: 7,
        all_equal: true,
        tensors_equal: {
          w1_board: true,
          w1_hand: true,
          b1: true,
          w2: true,
          b2: true,
          w3: true,
          b3: true,
        },
      });
      expect(run.quantized_equality.parent).toEqual(
        run.quantized_equality.candidate,
      );
    }
  });

  it("keeps every strength, holdout, selection, and live boundary closed", () => {
    const registry = JSON.parse(bytes(registryPath).toString("utf8"));
    expect(registry.boundary).toEqual({
      candidate_selected: false,
      external_calibration_games: 0,
      final_holdout_labels_read: false,
      formal_ab_games: 0,
      live_weights_changed: false,
      local_only: true,
      network_requests: 0,
      replay_rows_read: 0,
      selection_evaluations: 0,
      selection_labels_read: false,
    });
    expect(registry.claims).toEqual({
      exact_parent_integer_tensors_preserved: true,
      high_dan_calibrated: false,
      live_model_changed: false,
      playing_strength_improved: false,
      representation_alignment_completed: true,
    });
  });

  it("publishes matching bilingual facts without private positions", () => {
    const publicText = [japanesePath, englishPath, evidencePath]
      .map((file) => bytes(file).toString("utf8"))
      .join("\n");
    for (const marker of [
      "92.69",
      "1,860,321,280",
      "a6fefc3f41543e35b9745da7f22fc8c7f2f6112f",
      "21 comparisons",
      "not-authenticated-by-result-registry-builder",
      "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
    ]) {
      expect(publicText).toContain(marker);
    }
    expect(publicText).not.toMatch(
      /(?:[\\/]Users[\\/]|parent_sfen|child_sfen|position_sfen)/iu,
    );
  });
});
