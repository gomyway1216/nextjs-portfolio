import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FRESH_SELECTION_TEACHER_HASH_MB_PER_ENGINE,
  FRESH_SELECTION_TEACHER_PARALLEL_ENGINES,
  FRESH_SELECTION_TEACHER_SOURCE,
} from "../../../ml/floodgate-fresh-selection-teacher-runner";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-selection-teacher-runner-2026-07-20.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-selection-teacher-runner.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-selection-teacher-runner.en.md",
);
const policyPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-selection-teacher-search-policy.json",
);
function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

describe("Floodgate strength-first fresh-selection teacher evidence", () => {
  it("records the publication-time gate without asserting current registry state", () => {
    const evidence = readJson(evidencePath);
    expect(evidence).not.toHaveProperty("current_checkpoint_gate");
    expect(evidence).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-selection-teacher-runner-evidence-v1",
      checkpoint_gate_observed_at_publication: {
        status:
          "awaiting-exact-strength-first-plan-and-three-final-run-identities",
        artifact_identities_registered: false,
        selection_preflight_ready: false,
        strict_loaded_candidate_checkpoints: 0,
        direct_preflight: {
          exit_code: 1,
          stdout_bytes: 0,
          status: "expected-stop-selection-registry-remains-closed",
        },
        selection_source_opened_by_direct_preflight: false,
        teacher_engine_started_by_direct_preflight: false,
      },
      observed_counts_at_publication: {
        real_fresh_selection_teacher_command_invocations: 0,
        real_fresh_selection_source_reads: 0,
        real_selection_teacher_engine_processes: 0,
        real_selection_teacher_parent_labels: 0,
        complete_selection_teacher_datasets: 0,
        candidate_selections: 0,
        live_weight_changes: 0,
      },
      ordering_contract: {
        formal_teacher_exclusion: {
          roots: [
            "~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8",
            "~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v9",
          ],
          acquisition_order: ["v8", "v9"],
          release_order: ["v9", "v8"],
          held_for_entire_run: true,
          v9_acquisition_failure_releases_v8: true,
          active_v8_or_v9_blocks_before_checkpoint_source_or_engine: true,
        },
        process_umask_changed: false,
      },
    });
  });

  it("preserves the historical 12-by-512 evidence while the current runner uses measured 13", () => {
    const policy = readJson(policyPath);
    expect(policy).toMatchObject({
      teacher: {
        proposal: { depth: 14, multipv: 6 },
        independent_rescore: { depth: 16, multipv: 1 },
      },
      runtime: {
        parallel_engines: 12,
        threads_per_engine: 1,
        hash_mb_per_engine: 512,
        timeout_ms_per_search: 600_000,
        network: false,
      },
    });
    expect(FRESH_SELECTION_TEACHER_PARALLEL_ENGINES).toBe(13);
    expect(FRESH_SELECTION_TEACHER_HASH_MB_PER_ENGINE).toBe(512);
    expect(readJson(evidencePath)).toMatchObject({
      fixed_source: {
        records: FRESH_SELECTION_TEACHER_SOURCE.records,
        games: FRESH_SELECTION_TEACHER_SOURCE.games,
        bytes: FRESH_SELECTION_TEACHER_SOURCE.bytes,
        sha256: FRESH_SELECTION_TEACHER_SOURCE.sha256,
        opened_during_implementation_or_validation: false,
      },
      search_policy: {
        parallel_processes: 12,
        threads_per_process: 1,
        hash_mib_per_process: 512,
        aggregate_hash_mib: 6_144,
      },
      hash_selection_basis: {
        fresh_hash_64_selected: false,
        selected_hash_mib_per_process: 512,
        production_like_completed: 12,
        production_like_failures: 0,
        production_like_pages_throttled: 0,
        host_memory_gib: 48,
        host_cores: 14,
      },
      infrastructure: {
        execution: "local-mac-only",
        runtime_network_requests: 0,
        cloud_services_required: [],
        aws_used: false,
        firebase_or_gcp_used: false,
        vercel_used_for_teacher_compute: false,
      },
    });
  });

  it("records all-legal fallback with fatal timeout and no mixed ranks", () => {
    expect(readJson(evidencePath)).toMatchObject({
      typed_incomplete_proposal_fallback: {
        allowed_only_when_legal_moves_at_most: 6,
        partial_proposal_ranks_discarded: true,
        mixed_partial_and_fallback_ranks_accepted: false,
        fallback_searches_every_legal_move_separately: true,
        fallback_depth: 14,
        fallback_multipv: 1,
        candidate_set_after_fallback: "all-legal-moves",
        every_fallback_candidate_exact_rescored: true,
        exact_rescore_depth: 16,
        timeout_in_proposal_fallback_or_rescore: "fatal-no-publication",
        unrescuable_incomplete_proposal: "fatal-no-publication",
        only_allowed_completed_skip_reason: "fewer_than_two_legal_moves",
      },
      local_validation: {
        typed_incomplete_two_legal_move_trace: {
          status: "PASS",
          incomplete_proposal_searches: 1,
          depth_14_all_legal_fallback_searches: 2,
          depth_16_exact_rescore_searches: 2,
          candidate_set_equals_all_legal_moves: true,
          unknown_trigger_field_rejected: true,
        },
      },
    });
  });

  it("keeps bilingual disclosure private and strength claims at zero", () => {
    const record = readJson(evidencePath);
    expect(record).toMatchObject({
      upstream_dependency: {
        strength_first_v9_proposal_rescue_source_commit:
          "a8ec6975113f7feacbc55bb87ba80f2d9b64dbbe",
        same_change_present_in_local_cherry_pick: true,
        exact_source_commit_present_in_branch_ancestry: true,
        dependency_merge_commit:
          "34c643cda934a262ceab06b5dc9cabcf6ff4d70f",
        dependency_merge_tree_matches_premerge_head: true,
        dependency_must_be_declared_before_merge: true,
        nonduplicated_final_diff_must_be_confirmed: true,
      },
      local_validation: {
        typescript_compile: "PASS",
        focused_runtime_vitest: { status: "PASS", files: 4, tests: 58 },
        publication_evidence_vitest: {
          status: "PASS",
          files: 1,
          tests: 4,
        },
        combined_focused_vitest: {
          status: "PASS",
          files: 5,
          tests: 62,
        },
        python_preflight_projection: { status: "PASS", tests: 3 },
        full_ml_stdlib: { status: "PASS", tests: 287 },
        git_diff_check: "PASS",
        independent_review: "PENDING",
        github_ci: "PENDING",
      },
      privacy: {
        private_absolute_home_path_published: false,
        source_root_disclosed_with_tilde: true,
        selection_positions_or_labels_published: false,
      },
    });
    for (const articlePath of [japanesePath, englishPath]) {
      const article = fs.readFileSync(articlePath, "utf8");
      expect(article).toContain("12");
      expect(article).toContain("512");
      expect(article).toContain("58");
      expect(article).not.toContain("/Users/");
      expect(article).not.toContain("高段になった");
      expect(article).not.toContain("high-dan achieved");
    }
  });
});
