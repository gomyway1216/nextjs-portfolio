import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_STATUS,
} from "../../../ml/floodgate-strength-first-v8-downstream-provenance";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-v8-downstream-provenance-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-downstream-provenance.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-v8-downstream-provenance.en.md",
);
const corePath = path.join(
  repositoryRoot,
  "ml/floodgate-strength-first-v8-downstream-provenance.ts",
);
const cliPath = path.join(
  repositoryRoot,
  "ml/verify-floodgate-strength-first-v8-downstream-provenance.ts",
);
const builderPath = path.join(
  repositoryRoot,
  "ml/build_strength_first_qat_training_plan_candidate.py",
);
const bridgePath = path.join(
  repositoryRoot,
  "ml/strength_first_qat_training_bridge.py",
);
const planPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json",
);

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function evidence(): Record<string, unknown> {
  return JSON.parse(read(evidencePath)) as Record<string, unknown>;
}

describe("Floodgate strength-first v8 downstream provenance evidence", () => {
  it("records real prefix accounting without claiming teacher or strength completion", () => {
    expect(fs.existsSync(planPath)).toBe(false);
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-v8-downstream-provenance-evidence-v1",
      status:
        "bridge-implementation-validated-formal-v8-teacher-still-running",
      formal_teacher_observation: {
        target_parents: 24_000,
        milestone_100_complete: true,
        milestone_500_complete: true,
        milestone_500: {
          completed_parents: 500,
          emitted_parent_groups: 499,
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 1,
          partial_timeout_label_persisted: false,
        },
        observed_progress_at_capture: 690,
        final_result_exists: false,
        training_plan_exists: false,
        training_started: false,
        candidate_selection_started: false,
        formal_ab_started: false,
        live_weight_changes: 0,
      },
      strength_claims: {
        teacher_complete: false,
        model_retrained: false,
        candidate_selected: false,
        playing_strength_improved: false,
        high_dan_calibrated: false,
        live_model_changed: false,
      },
    });
  });

  it("binds the sole semantic authority to the fixed CLI and v2 plan builder", () => {
    expect(FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_SCHEMA).toBe(
      "shogi-floodgate-strength-first-v8-downstream-provenance-v1",
    );
    expect(FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_STATUS).toBe(
      "verified-v8-teacher-source-ready-for-training-plan-review",
    );
    expect(evidence()).toMatchObject({
      implementation: {
        production_parent_target: 24_000,
        milestone_targets: [100, 500],
        work_jsonl_streamed: true,
        network_requests: 0,
        cloud_services: 0,
        live_weight_changes: 0,
      },
      semantic_authority: {
        authenticated_raw_rows_reparsed: true,
        every_work_entry_revalidated_with_shared_teacher_validator: true,
        forced_skip_reasons_recounted: true,
        timeout_quarantine_cap_rechecked: true,
        parent_completion_recomputed: true,
        training_groups_recomputed: true,
        private_identifiers_or_digests_in_success_output: false,
      },
      training_plan_v2: {
        pins_outer_teacher_result_identity: true,
        pins_privacy_safe_teacher_summary: true,
        publishes_private_inner_file_digests: false,
        runtime_rehashes_every_outer_bound_private_inner_file: true,
        reviewed_plan_required_before_training: true,
        selection_or_holdout_read_authorized: false,
        production_weight_write_authorized: false,
      },
    });
    expect(read(corePath)).toContain("validateWorkEntry");
    expect(read(cliPath)).toContain("fs.createReadStream(workPath)");
    expect(read(builderPath)).toContain(
      "ml/verify-floodgate-strength-first-v8-downstream-provenance.ts",
    );
    expect(read(bridgePath)).toContain(
      "shogi-floodgate-strength-first-qat-training-plan-v2",
    );
  });

  it("publishes bilingual limits and aggregate-only evidence", () => {
    const japanese = read(japanesePath);
    const english = read(englishPath);
    for (const article of [japanese, english]) {
      expect(article).toContain("24,000");
      expect(article).toContain("499");
      expect(article).toContain("690");
      expect(article).toContain("89");
      expect(article).toMatch(/(?:まだ|still)/iu);
      expect(article).not.toMatch(
        /(?:\/Users\/|\/private\/|parent_sfen|child_sfen|position_sfen|sha256:)/u,
      );
    }
    const publicRecord = [japanese, english, read(evidencePath)].join("\n");
    expect(publicRecord).not.toMatch(/[0-9a-f]{64}/u);
  });
});
