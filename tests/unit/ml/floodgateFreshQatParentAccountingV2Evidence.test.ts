import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidenceRelative =
  "docs/data/floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json";
const amendmentRelative =
  "ml/protocols/floodgate-q1-2026-fresh-qat-parent-accounting-v2-amendment.json";
const registryRelative =
  "ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry-v2.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-fresh-qat-parent-accounting-v2.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-fresh-qat-parent-accounting-v2.en.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function identity(relativePath: string): {
  bytes: number;
  sha256: string;
} {
  const bytes = fs.readFileSync(path.join(repositoryRoot, relativePath));
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

describe("fresh QAT parent-accounting v2 evidence", () => {
  it("pins the append-only implementation and every immutable predecessor", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const amendment = JSON.parse(read(amendmentRelative));

    for (const record of Object.values(
      evidence.implementation_identities,
    ) as Array<{
      path: string;
      bytes: number;
      sha256: string;
    }>) {
      expect(identity(record.path), record.path).toEqual({
        bytes: record.bytes,
        sha256: record.sha256,
      });
    }
    for (const record of Object.values(evidence.immutable_upstream) as Array<{
      path?: string;
      bytes?: number;
      sha256?: string;
    }>) {
      if (
        typeof record.path === "string" &&
        typeof record.bytes === "number" &&
        typeof record.sha256 === "string"
      ) {
        expect(identity(record.path), record.path).toEqual({
          bytes: record.bytes,
          sha256: record.sha256,
        });
      }
    }
    for (const record of Object.values(
      amendment.immutable_historical_evidence,
    ) as Array<{
      path: string;
      bytes: number;
      sha256: string;
    }>) {
      expect(identity(record.path), record.path).toEqual({
        bytes: record.bytes,
        sha256: record.sha256,
      });
    }
    expect(identity("package.json")).toEqual({
      bytes: 7964,
      sha256:
        "770ceaf033d00245e84a439656b68141606c36f24eb9b7fe8322a97a426fd866",
    });
  });

  it("separates input, forced, and emitted parents and passes only E to training", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const amendment = JSON.parse(read(amendmentRelative));
    const policy = amendment.amendment.fixed_parent_accounting;

    expect(policy).toMatchObject({
      input_parents: 24000,
      input_games: 1000,
      equation: "forced_parents_skipped+emitted_parent_groups=input_parents",
      model_training_parents_source: "emitted_parent_groups",
      replacement_or_resampling: "forbidden",
      all_forced_policy:
        "account-for-all-inputs-then-STOP-no-trainable-parent-groups",
    });
    expect(evidence.fixed_parent_accounting).toMatchObject({
      input_parents: 24000,
      model_training_parents_source: "emitted_parent_groups",
      input_and_emitted_parent_digests_bound_separately: true,
      forced_parent_digest_bound: true,
      replacement_allowed: false,
      resampling_allowed: false,
      cases: {
        zero_forced: "valid-E-24000",
        some_forced: "valid-E-24000-minus-F",
        all_forced: "accountable-STOP-no-trainable-parent-groups",
      },
    });
    expect(evidence.model_training_binding.fields).toEqual([
      "bytes",
      "sha256",
      "records",
      "parents",
      "games",
      "game_ids_sha256",
      "parent_ids_sha256",
      "semantic_position_ids_count",
      "semantic_position_ids_sha256",
    ]);
    expect(
      evidence.model_training_binding.parents_equals_emitted_parent_groups,
    ).toBe(true);
  });

  it("keeps model, seed, loss, epoch, selection, and holdout contracts fixed", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const amendment = JSON.parse(read(amendmentRelative));
    const nonChanges = amendment.amendment.non_changes;

    expect(evidence.unchanged_contracts).toMatchObject({
      training_canonical_sha256:
        "b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac",
      slots_canonical_sha256:
        "aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed",
      selection_canonical_sha256:
        "9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c",
      seeds: [42, 43, 44],
      architecture: "2282-256-32-1-clipped-relu",
      loss: "sibling-ranking",
      optimizer: "AdamW",
      learning_rate: 0.0001,
      epochs: 20,
      selection_gates_changed: false,
      holdout_policy_changed: false,
    });
    expect(Object.values(nonChanges).every((value) => value === false)).toBe(
      true,
    );
  });

  it("keeps the registry, observations, and every authority boundary closed", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const registry = JSON.parse(read(registryRelative));

    expect(
      Object.values(registry.enrollments).every((value) => value === null),
    ).toBe(true);
    expect(
      Object.values(registry.gates).every((value) => value === false),
    ).toBe(true);
    expect(
      Object.values(registry.authority).every((value) => value === false),
    ).toBe(true);
    expect(evidence.closed_registry).toMatchObject({
      enrollments_null: 5,
      gates_false: 8,
      authority_flags_false: 7,
      training_dispatch_ready: false,
      selection_preflight_ready: false,
      promotion_authorized: false,
      production_weight_write_authorized: false,
    });
    expect(evidence.observations).toMatchObject({
      real_teacher_parents_processed: 0,
      real_forced_parents_observed: 0,
      real_emitted_parent_groups_observed: 0,
      real_training_artifacts_enrolled: 0,
      fresh_qat_training_runs: 0,
      fresh_qat_results: 0,
      selection_labels_read: false,
      final_holdout_labels_read: false,
      matches_executed: 0,
      strength_improved: false,
      high_dan_calibrated: false,
      live_weights_changed: false,
    });
  });

  it("keeps Japanese, English, README, and the stdlib-only source aligned", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    const readme = read("ml/README.md");
    const source = read("ml/fresh_qat_parent_accounting_v2.py");

    for (const article of [japanese, english]) {
      for (const marker of [
        "24000",
        "forced_parents_skipped",
        "emitted_parent_groups",
        "model_training_parents",
        "no-trainable-parent-groups",
        evidence.implementation_identities.pre_result_amendment.sha256,
        evidence.implementation_identities.closed_v2_registry.sha256,
        "134 / 134",
        "11 / 11",
      ]) {
        expect(article).toContain(marker);
      }
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-fresh-qat-parent-accounting-v2.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-fresh-qat-parent-accounting-v2.md",
    );
    expect(readme).toContain(
      "input_parents = forced_parents_skipped + emitted_parent_groups",
    );
    expect(readme).toContain("STOP-no-trainable-parent-groups");
    expect(source).toContain(
      "materialize_fresh_qat_parent_accounting_proposal_v2",
    );
    expect(source).toContain("model_training_parents");
    expect(source).toContain("registry remains STOP");
    expect(source).not.toMatch(/^(?:from\s+torch|import\s+torch)\b/mu);
    expect(evidence.materializer_boundary).toMatchObject({
      stdlib_only: true,
      writes_files: false,
      mutates_registry: false,
      imports_torch: false,
      runs_teacher: false,
      runs_training: false,
      reads_selection: false,
      reads_holdout: false,
      enrolls_artifacts: false,
      grants_authority: false,
    });
  });
});
