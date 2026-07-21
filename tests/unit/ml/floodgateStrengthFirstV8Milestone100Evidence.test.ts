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
  "docs/data/floodgate-strength-first-v8-milestone-100-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-milestone-100.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-milestone-100.en.md",
);

let cachedEvidence: Record<string, unknown> | undefined;

function evidence(): Record<string, unknown> {
  cachedEvidence ??= JSON.parse(
    fs.readFileSync(evidencePath, "utf8"),
  ) as Record<string, unknown>;
  return cachedEvidence;
}

function nextGates(): string[] {
  const value = evidence().next_gates;
  if (!Array.isArray(value) || value.some((gate) => typeof gate !== "string")) {
    throw new Error("milestone 100 next_gates must be a string array");
  }
  return value;
}

describe("Floodgate strength-first v8 milestone 100 evidence", () => {
  it("records the real pinned launch and completed input authentication", () => {
    expect(evidence()).toMatchObject({
      schema: "shogi-floodgate-strength-first-v8-milestone-100-evidence-v1",
      status:
        "real-formal-v8-milestone-100-complete-auto-continuing-no-strength-claim",
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
        schema: "shogi-authenticated-floodgate-training-rows-v1",
        role: "training",
        parents: 24000,
        games: 1000,
        authentication_phase: {
          status: "complete-before-teacher-engines-started",
          elapsed_seconds_approx: 1225,
        },
      },
    });
  });

  it("binds the independently verified checkpoint and canonical prefix", () => {
    expect(evidence()).toMatchObject({
      milestone_100: {
        status:
          "local-work-prefix-complete-not-an-authentication-or-playing-strength-receipt",
        authentication_receipt: false,
        playing_strength_evidence: false,
        checkpoint: {
          schema: FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
          bytes: 2338,
          sha256:
            "a4442d8c12d459d1769ed86e4f44e3c0247ee1e66983609be151668e0fd556c5",
        },
        canonical_prefix: {
          binding_scope: "canonical-target-prefix-projection",
          schema: SIBLING_TEACHER_WORK_SCHEMA,
          bytes: 1362695,
          sha256:
            "80b5605869994692b38f50cb56482f77a9e2374a50aebfbe77e7a216509cfb85",
          jsonl_lines: 101,
          header_lines: 1,
          parent_groups: 100,
          unique_parent_ids_count: 100,
          child_record_groups: 1144,
          forced_parent_skips: 0,
          search_timeout_skips: 0,
          run_fingerprint:
            "7c6a2fadb362bd40a015f76df2849e71dff24650472999599f91b5f67dac9628",
        },
      },
    });
  });

  it("records the full local search configuration and observed headroom", () => {
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
        aggregate_engine_rss_gib_peak_approx: 8.17,
        host_cpu_busy_percent_snapshot: 99.88,
        pages_throttled_observed: 0,
        power_source: "AC Power",
      },
      milestone_100: {
        elapsed_from_launch_seconds_approx: 1605,
        elapsed_from_engine_start_seconds_approx: 380,
      },
    });
  });

  it("keeps completion, strength, and live-promotion claims closed", () => {
    expect(evidence()).toMatchObject({
      state_at_milestone_snapshot: {
        milestone_100_evidenced: true,
        milestone_500_evidenced_by_this_snapshot: false,
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
    expect(nextGates()).toContain("formal-384-pair-768-game-ab");
    expect(nextGates()).not.toContain("formal-192-pair-384-game-ab");
  });

  it("keeps both articles aligned and publishes no private payload or path", () => {
    const record = evidence();
    expect(record).toMatchObject({
      privacy: {
        raw_positions_published: false,
        raw_parent_ids_published: false,
        candidate_moves_published: false,
        absolute_private_paths_published: false,
        secrets_or_keys_published: false,
        canonical_101_line_prefix_digest_published: true,
        mutable_whole_work_file_digest_published: false,
        private_checkpoint_payload_published: false,
      },
    });

    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    for (const article of [japanese, english]) {
      expect(article).toContain("400d3e33e8414cf071cbe3cc053e345bdc668ade");
      expect(article).toContain(
        "80b5605869994692b38f50cb56482f77a9e2374a50aebfbe77e7a216509cfb85",
      );
      expect(article).toContain("authentication_receipt=false");
      expect(article).toContain("playing_strength_evidence=false");
      expect(article).not.toMatch(/\/Users\/|\.codex\/shogi-runs/);
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-strength-first-v8-milestone-100.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-strength-first-v8-milestone-100.md",
    );
  });
});
