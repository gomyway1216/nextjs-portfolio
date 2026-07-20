import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-strength-first-three-seed-training-completion-2026-07-20.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-three-seed-training-completion.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-strength-first-three-seed-training-completion.en.md",
);
const registryPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-selection-preflight-registry.json",
);
const planPath = path.join(
  repositoryRoot,
  "ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json",
);

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

interface ArtifactIdentity {
  path: string;
  schema: string;
  bytes: number;
  sha256: string;
}

interface CompletionEvidence {
  training: {
    plan: ArtifactIdentity;
    runs: Array<{
      seed: number;
      completed_epochs: number;
      torch_threads: number;
      selection_evaluations: number;
      selection_labels_read: boolean;
      result: ArtifactIdentity;
      checkpoint: ArtifactIdentity;
    }>;
  };
  selection_preflight_enrollment: {
    registry: ArtifactIdentity & { status: string };
  };
}

function evidence(): CompletionEvidence {
  return JSON.parse(read(evidencePath)) as CompletionEvidence;
}

describe("Floodgate strength-first three-seed training completion evidence", () => {
  it("records three completed training-only candidates without a strength claim", () => {
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-strength-first-three-seed-training-completion-evidence-v1",
      training: {
        local_only: true,
        cloud_services: [],
        pipeline_revision: "ba52b872599356063d1c4790a59564bf758cddcc",
        parallelism: {
          concurrent_processes: 3,
          seeds: [42, 43, 44],
          threads_per_process: 2,
        },
        launcher: {
          status: "complete-three-training-processes",
          elapsed_seconds: 1814.38,
          swaps: 0,
          returncodes: { "42": 0, "43": 0, "44": 0 },
          training_only: true,
          selection_labels_read: false,
          holdout_labels_read: false,
          candidate_selected: false,
          live_weights_changed: false,
        },
      },
      current_state: {
        trained_candidates: 3,
        selection_teacher_started: false,
        candidate_selected: false,
        holdout_opened: false,
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

  it("binds all three result and checkpoint identities to the READY registry", () => {
    const record = evidence();
    const registry = JSON.parse(read(registryPath)) as {
      status: string;
      training_plan: ArtifactIdentity;
      runs: Array<{
        seed: number;
        result: ArtifactIdentity;
        checkpoint: ArtifactIdentity;
      }>;
      artifact_identities_registered: boolean;
      selection_preflight_ready: boolean;
    };

    expect(record.training.runs.map((run) => run.seed)).toEqual([42, 43, 44]);
    expect(
      record.training.runs.every(
        (run) =>
          run.completed_epochs === 20 &&
          run.torch_threads === 2 &&
          run.selection_evaluations === 0 &&
          run.selection_labels_read === false,
      ),
    ).toBe(true);
    expect(registry.status).toBe(
      "exact-strength-first-plan-and-three-final-run-identities-ready",
    );
    expect(registry.artifact_identities_registered).toBe(true);
    expect(registry.selection_preflight_ready).toBe(true);
    expect(
      registry.runs.map(({ seed, result, checkpoint }) => ({
        seed,
        result,
        checkpoint,
      })),
    ).toEqual(
      record.training.runs.map(({ seed, result, checkpoint }) => ({
        seed,
        result,
        checkpoint,
      })),
    );
  });

  it("binds the checked-in plan and exact generated registry bytes", () => {
    const record = evidence();
    expect(fs.statSync(planPath).size).toBe(record.training.plan.bytes);
    expect(sha256(planPath)).toBe(record.training.plan.sha256);
    expect(fs.statSync(registryPath).size).toBe(
      record.selection_preflight_enrollment.registry.bytes,
    );
    expect(sha256(registryPath)).toBe(
      record.selection_preflight_enrollment.registry.sha256,
    );
  });

  it("publishes matching bilingual boundaries without private positions", () => {
    const publicRecord = [
      read(japanesePath),
      read(englishPath),
      read(evidencePath),
    ].join("\n");
    for (const marker of [
      "1,814.38",
      "278,736",
      "391",
      "0526b163",
      "0.982727",
    ]) {
      expect(publicRecord).toContain(marker);
    }
    expect(publicRecord).not.toMatch(
      /(?:[\\/]Users[\\/]|[\\/]private[\\/]|parent_sfen|child_sfen|position_sfen)/ui,
    );
  });
});
