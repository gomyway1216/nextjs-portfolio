import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_PRODUCTION_ENGINES,
} from "../../../ml/generate-sibling-teacher";
import {
  FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
  FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA,
} from "../../../ml/floodgate-strength-first-teacher-runner";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-v8-milestone-500-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-milestone-500.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-milestone-500.en.md",
);

let rawEvidence: string | undefined;
let cachedEvidence: Record<string, unknown> | undefined;

function evidenceText(): string {
  rawEvidence ??= fs.readFileSync(evidencePath, "utf8");
  return rawEvidence;
}

function evidence(): Record<string, unknown> {
  cachedEvidence ??= JSON.parse(evidenceText()) as Record<string, unknown>;
  return cachedEvidence;
}

describe("Floodgate strength-first v8 milestone 500 evidence", () => {
  it("records the pinned formal run and exact elapsed-time arithmetic", () => {
    expect(evidence()).toMatchObject({
      schema: "shogi-floodgate-strength-first-v8-milestone-500-evidence-v1",
      status:
        "real-formal-v8-milestone-500-accounted-auto-continuing-no-strength-claim",
      formal_run: {
        runner_revision: "400d3e33e8414cf071cbe3cc053e345bdc668ade",
        runner_schema: FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA,
        milestone_schema: FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
        local_compute_only: true,
        runtime_cloud_services: [],
        launch: {
          local: "2026-07-19T22:59:48-07:00",
          utc: "2026-07-20T05:59:48Z",
        },
        targets_in_order: [100, 500, 24000],
        automatic_continuation_without_operator_pause: true,
      },
      authenticated_input: {
        parents: 24000,
        games: 1000,
        authentication_phase: {
          elapsed_seconds_approx: 1225,
        },
      },
      milestone_500: {
        checkpoint_observed_birth_and_modified_local:
          "2026-07-19T23:48:29-07:00",
        checkpoint_observed_birth_and_modified_utc: "2026-07-20T06:48:29Z",
        elapsed_from_launch_seconds: 2921,
        elapsed_from_engine_start_seconds_approx: 1696,
        elapsed_from_milestone_100_seconds_approx: 1316,
      },
    });

    const launch = Date.parse("2026-07-19T22:59:48-07:00");
    const engineStart = Date.parse("2026-07-19T23:20:13-07:00");
    const milestone100 = Date.parse("2026-07-19T23:26:33-07:00");
    const milestone500 = Date.parse("2026-07-19T23:48:29-07:00");
    expect((milestone500 - launch) / 1000).toBe(2921);
    expect((milestone500 - engineStart) / 1000).toBe(1696);
    expect((milestone500 - milestone100) / 1000).toBe(1316);
  });

  it("binds the checkpoint, canonical prefix, and exact 499-plus-one accounting", () => {
    expect(evidence()).toMatchObject({
      milestone_500: {
        target_parents: 500,
        completed_parents: 500,
        authentication_receipt: false,
        playing_strength_evidence: false,
        accounting: {
          header_lines: 1,
          labeled_parent_groups: 499,
          unique_labeled_parent_ids_count: 499,
          child_record_groups: 5749,
          forced_skip_entries: 1,
          forced_skip_reasons: {
            fewer_than_two_legal_moves: 0,
            search_timeout_no_label: 1,
          },
          labeled_plus_skipped_target_slots: 500,
          all_500_targets_labeled: false,
        },
        checkpoint: {
          schema: FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
          bytes: 2338,
          sha256:
            "d8d5aeae084a16820cca13a3934096014456a24ec3901351a20bebd5927cee27",
        },
        canonical_prefix: {
          binding_scope: "canonical-target-prefix-projection",
          schema: SIBLING_TEACHER_WORK_SCHEMA,
          bytes: 6834309,
          sha256:
            "202310d4e858f15fc768f2680426b1b2a2eb05dde3ea788326b6c3a1e57490f1",
          jsonl_lines: 501,
          header_lines: 1,
          parent_lines: 499,
          skip_lines: 1,
          run_fingerprint:
            "7c6a2fadb362bd40a015f76df2849e71dff24650472999599f91b5f67dac9628",
        },
      },
    });
  });

  it("states that v8 contained one timeout rather than eliminating timeouts", () => {
    expect(evidence()).toMatchObject({
      milestone_500: {
        timeout_boundary: {
          search_timeout_skip_cap_at_500: 1,
          observed_search_timeout_skips: 1,
          within_registered_cap: true,
          timeout_entry_persisted_as_skip_without_label: true,
          all_timeouts_eliminated: false,
          run_stopped_at_500: false,
          continued_automatically_to_24000: true,
        },
      },
      v7_comparison: {
        v7_milestone_500_completed: false,
        v7_search_timeouts_before_stop: 2,
        v7_search_timeout_skip_cap_at_500: 1,
        v7_second_timeout_persisted_as_label_or_skip: false,
        v7_stop_reason: "search-timeout-skip-limit-exhausted",
        v8_milestone_500_completed: true,
        v8_search_timeout_skips_at_500: 1,
        v8_continued_within_same_registered_cap: true,
        v8_proved_future_timeout_elimination: false,
      },
      claims: {
        all_500_targets_labeled: false,
        all_timeouts_eliminated: false,
      },
    });
  });

  it("records the fixed 12-engine local configuration and observed headroom", () => {
    expect(STRENGTH_FIRST_PRODUCTION_ENGINES).toBe(12);
    expect(FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE).toBe(512);
    expect(evidence()).toMatchObject({
      teacher_runtime_observation: {
        engine: "YaneuraOu",
        parallel_engines: STRENGTH_FIRST_PRODUCTION_ENGINES,
        threads_per_engine: 1,
        hash_mib_per_engine:
          FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
        configured_hash_total_mib: 6144,
        aggregate_engine_rss_gib_peak_approx: 8.28,
        host_cpu_busy_percent_snapshot: 99.88,
        pages_throttled_observed: 0,
        power_source: "AC Power",
      },
      delta_from_milestone_100: {
        additional_target_slots_accounted: 400,
        additional_labeled_parent_groups: 399,
        additional_search_timeout_skips: 1,
        additional_child_record_groups: 4605,
        elapsed_seconds_approx: 1316,
      },
    });
  });

  it("keeps dataset, optimizer, strength, and live-promotion claims closed", () => {
    expect(evidence()).toMatchObject({
      state_at_milestone_snapshot: {
        milestone_100_evidenced: true,
        milestone_500_evidenced: true,
        final_24000_evidenced_by_this_snapshot: false,
        complete_teacher_dataset_evidenced: false,
        optimizer_runs: 0,
        candidate_selections: 0,
        formal_ab_games: 0,
        external_calibration_games: 0,
        live_weight_changes: 0,
      },
      claims: {
        authentication_receipt: false,
        complete_teacher_dataset: false,
        training_completion: false,
        candidate_selection_completion: false,
        playing_strength_gain: false,
        stable_high_dan_strength: false,
        live_promotion: false,
      },
    });
    expect(evidence().next_gates).toContain("formal-384-pair-768-game-ab");
    expect(evidence().next_gates).not.toContain("formal-192-pair-384-game-ab");
  });

  it("keeps both articles aligned and publishes no private payload or path", () => {
    expect(evidence()).toMatchObject({
      privacy: {
        raw_positions_published: false,
        raw_parent_ids_published: false,
        candidate_moves_published: false,
        absolute_private_paths_published: false,
        secrets_or_keys_published: false,
        canonical_501_line_prefix_digest_published: true,
        mutable_whole_work_file_digest_published: false,
        private_checkpoint_payload_published: false,
      },
    });

    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    for (const publication of [evidenceText(), japanese, english]) {
      expect(publication).toContain("400d3e33e8414cf071cbe3cc053e345bdc668ade");
      expect(publication).toContain(
        "202310d4e858f15fc768f2680426b1b2a2eb05dde3ea788326b6c3a1e57490f1",
      );
      expect(publication).not.toMatch(/\/Users\/|\.codex\/shogi-runs/);
    }
    for (const article of [japanese, english]) {
      expect(article).toContain("authentication_receipt=false");
      expect(article).toContain("playing_strength_evidence=false");
      expect(article).toContain("499");
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-strength-first-v8-milestone-500.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-strength-first-v8-milestone-500.md",
    );
  });
});
