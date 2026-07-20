import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-training-runtime-env-parity-2026-07-20.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-training-runtime-env-parity.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-training-runtime-env-parity.en.md",
);
const launcherPath = path.join(
  repositoryRoot,
  "ml/run_strength_first_three_seed_training.py",
);

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidencePath)) as Record<string, unknown>;
}

describe("Floodgate strength-first training runtime environment parity evidence", () => {
  it("pins all seven child values for every fixed seed", () => {
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-training-runtime-environment-parity-evidence-v1",
      status:
        "implementation-and-focused-validation-pass-no-training-selection-or-live-change",
      implementation: {
        seeds: [42, 43, 44],
        children_started_by_validation: 0,
        parent_environment_copied_before_fixed_overrides: true,
        independent_environment_map_per_child: true,
        fixed_child_environment: {
          PYTHONHASHSEED: "0",
          OMP_NUM_THREADS: "2",
          MKL_NUM_THREADS: "2",
          OPENBLAS_NUM_THREADS: "2",
          VECLIB_MAXIMUM_THREADS: "2",
          OMP_DYNAMIC: "FALSE",
          MKL_DYNAMIC: "FALSE",
        },
        aligned_with_thread_benchmark_environment: true,
        current_threads_per_seed_changed: false,
        future_thread_benchmark_decision_bypassed: false,
      },
      adversarial_test: {
        hostile_inherited_values_supplied_for_all_fixed_keys: true,
        all_three_child_environments_checked: true,
        seed_order_checked: [42, 43, 44],
        distinct_child_environment_maps_checked: true,
        parent_environment_unchanged_checked: true,
      },
    });

    const launcher = read(launcherPath);
    for (const [key, value] of Object.entries({
      PYTHONHASHSEED: "0",
      OMP_NUM_THREADS: "2",
      MKL_NUM_THREADS: "2",
      OPENBLAS_NUM_THREADS: "2",
      VECLIB_MAXIMUM_THREADS: "2",
      OMP_DYNAMIC: "FALSE",
      MKL_DYNAMIC: "FALSE",
    })) {
      expect(launcher).toContain(`"${key}": "${value}"`);
    }
  });

  it("keeps the historical record additive and every downstream authority closed", () => {
    expect(evidence()).toMatchObject({
      historical_record_boundary: {
        existing_cpu_model_article_rewritten: false,
        existing_cpu_model_evidence_rewritten: false,
        historical_validation_counts_rewritten: false,
        this_is_a_new_additive_record: true,
      },
      authority: {
        teacher_or_training_data_read: false,
        training_plan_read: false,
        selection_labels_read: false,
        holdout_labels_read: false,
        real_optimizer_training_authorized_by_this_change: false,
        candidate_selection_authorized: false,
        production_weight_write_authorized: false,
        live_promotion_authorized: false,
      },
      strength_claims: {
        model_retrained: false,
        candidate_selected: false,
        playing_strength_improved: false,
        high_dan_calibrated: false,
        live_model_changed: false,
      },
    });
  });

  it("publishes matching bilingual aggregate-only disclosure", () => {
    const publicRecord = [
      read(japanesePath),
      read(englishPath),
      read(evidencePath),
    ].join("\n");
    for (const marker of [
      "PYTHONHASHSEED",
      "OMP_DYNAMIC",
      "MKL_DYNAMIC",
      "42",
      "43",
      "44",
    ]) {
      expect(publicRecord).toContain(marker);
    }
    expect(publicRecord).not.toMatch(
      /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen|sha256:)/u,
    );
    expect(publicRecord).not.toMatch(/[0-9a-f]{64}/u);
  });
});
