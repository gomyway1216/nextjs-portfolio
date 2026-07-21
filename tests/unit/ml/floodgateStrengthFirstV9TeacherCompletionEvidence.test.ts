import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-v9-teacher-completion-2026-07-20.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v9-teacher-completion.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v9-teacher-completion.en.md",
);

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

interface CompletionEvidence {
  training_thread_benchmark: {
    cross_revision_equivalence: {
      unchanged_sources: Record<string, { bytes: number; sha256: string }>;
    };
  };
}

function evidence(): CompletionEvidence {
  return JSON.parse(read(evidencePath)) as CompletionEvidence;
}

describe("Floodgate strength-first v9 teacher completion evidence", () => {
  it("records exact completion without claiming training, strength, or a live change", () => {
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-v9-teacher-completion-evidence-v1",
      formal_teacher: {
        completion: {
          input_parents: 24000,
          completed_parents: 24000,
          emitted_parent_groups: 23980,
          forced_parents_skipped: 20,
          skip_reasons: {
            search_timeout_no_label: 15,
            proposal_incomplete_no_label: 5,
            fewer_than_two_legal_moves: 0,
          },
          training_rows: 278736,
        },
      },
      current_state: {
        teacher_complete: true,
        exact_training_plan_issued: false,
        real_training_processes_started: 0,
        trained_candidates: 0,
        candidate_selected: false,
        formal_ab_games: 0,
        external_calibration_games: 0,
        live_weight_changes: 0,
      },
      strength_claims: {
        playing_strength_improved: false,
        high_dan_calibrated: false,
        live_model_changed: false,
      },
    });
  });

  it("records the fail-closed v9 revision defect and corrected full scan", () => {
    expect(evidence()).toMatchObject({
      independent_audit_and_verifier: {
        review_findings_before_fix: { p0: 0, p1: 1, p2: 0 },
        p1_boundary:
          "downstream-verifier-revision-expectation-bug-not-teacher-artifact-corruption",
        pre_fix_observed_stop: "input-binding",
        v9_aware_independent_full_scan: "PASS",
        corrected_production_verifier: {
          status: "verified-v9-teacher-source-ready-for-training-plan-review",
          focused_tests: { status: "PASS", tests: 6 },
          formal_artifact_full_scan: {
            status: "PASS",
            target_parents: 24000,
            emitted_parent_groups: 23980,
            skipped_parents: 20,
            training_rows: 278736,
            swaps: 0,
          },
          fix_reviewed_and_merged_at_capture: false,
          exact_plan_issued: false,
        },
      },
    });
  });

  it("binds the two-thread decision and unchanged cross-revision sources", () => {
    const record = evidence();
    expect(record).toMatchObject({
      training_thread_benchmark: {
        receipt: {
          bytes: 30416,
          sha256:
            "4903916e4f1770947fad8986a9b0119ab41b5c63b94fffa259c796b46188ec9d",
        },
        comparison: {
          pair_speedups_ppm_for_four_threads: [1003031, 962423],
          median_speedup_ppm_for_four_threads: 982727,
          minimum_adoption_speedup_ppm: 1050000,
          selected_threads_per_seed: 2,
        },
        cross_revision_equivalence: {
          strict_main_receipt: false,
          execution_revision: "f0f943e5251bc8b511a050e614561eca3903f8ba",
          comparison_main_revision: "e9fed482e4d83a38feddaf6dabf3abd66d09aab9",
          execution_is_ancestor_of_comparison_main: true,
          benchmark_or_training_sources_changed: false,
        },
      },
    });
    const sources =
      record.training_thread_benchmark.cross_revision_equivalence
        .unchanged_sources;
    for (const [relativePath, identity] of Object.entries(sources)) {
      const fullPath = path.join(repositoryRoot, relativePath);
      expect(fs.statSync(fullPath).size).toBe(identity.bytes);
      expect(sha256(fullPath)).toBe(identity.sha256);
    }
  });

  it("publishes matching bilingual boundaries without private positions", () => {
    const publicRecord = [
      read(japanesePath),
      read(englishPath),
      read(evidencePath),
    ].join("\n");
    for (const marker of ["24,000", "23,980", "278,736", "50.74", "0.982727"]) {
      expect(publicRecord).toContain(marker);
    }
    expect(publicRecord).not.toMatch(
      /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen)/u,
    );
  });
});
