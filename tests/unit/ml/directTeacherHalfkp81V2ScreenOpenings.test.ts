import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildNnueFixedTimeOpening,
  nnueFixedTimeDerivedSeed,
} from "../../../wasm-spike/nnue-fixed-time-opening";

type OpeningManifest = {
  selection: {
    pair_seed_scan_start: number;
    pairs: number;
    pairs_selected: Array<{
      pair_index: number;
      seed: number;
      derived_seed: number;
      opening_fingerprint: string;
    }>;
    prior_inventory_overlap: number;
    within_selection_duplicates: number;
  };
  authority: {
    paired_play_authorized: boolean;
    live_weight_write_authorized: boolean;
  };
};

type ScreenEvidence = {
  status: string;
  opening_preflight: {
    selected_pairs: number;
    prior_inventory_overlap: number;
    within_selection_duplicates: number;
    complete_prior_inventory: {
      fingerprints: number;
    };
  };
  fixed_screen: {
    games: number;
    milliseconds_per_move: number;
    maximum_plies: number;
    pair_workers: number;
    minimum_candidate_halfpoints: number;
    denominator_halfpoints: number;
  };
  durability: {
    strength_failure_resume_authorized: boolean;
    technical_fault_same_plan_resume_only: boolean;
  };
  local_validation: {
    real_games_run: number;
  };
  measured_state: {
    live_weight_bytes_changed: number;
  };
};

const root = resolve(__dirname, "../../..");
const manifest = JSON.parse(
  readFileSync(
    resolve(
      root,
      "ml/protocols/direct-teacher-halfkp81-v2-screen-openings.json",
    ),
    "utf8",
  ),
) as OpeningManifest;
const evidence = JSON.parse(
  readFileSync(
    resolve(
      root,
      "docs/data/shogi-direct-teacher-halfkp81-v2-screen-foundation-2026-07-29.json",
    ),
    "utf8",
  ),
) as ScreenEvidence;

describe("direct-teacher HalfKP81 v2 paired56 openings", () => {
  it("reproduces the 28 frozen match-harness fingerprints", () => {
    expect(manifest.selection.pair_seed_scan_start).toBe(1_200_001);
    expect(manifest.selection.pairs).toBe(28);
    expect(manifest.selection.pairs_selected).toHaveLength(28);

    for (const [index, entry] of manifest.selection.pairs_selected.entries()) {
      const generated = buildNnueFixedTimeOpening(entry.seed, 0);
      expect(entry).toEqual({
        pair_index: index,
        seed: 1_200_001 + index,
        derived_seed: nnueFixedTimeDerivedSeed(entry.seed, 0),
        opening_fingerprint: generated.fingerprint,
      });
    }
    expect(
      new Set(
        manifest.selection.pairs_selected.map(
          (entry) => entry.opening_fingerprint,
        ),
      ).size,
    ).toBe(28);
    expect(manifest.selection.prior_inventory_overlap).toBe(0);
    expect(manifest.selection.within_selection_duplicates).toBe(0);
    expect(manifest.authority.paired_play_authorized).toBe(false);
    expect(manifest.authority.live_weight_write_authorized).toBe(false);
  });

  it("publishes matching no-play evidence and bilingual execution notes", () => {
    expect(evidence.status).toBe(
      "implementation-and-synthetic-tests-complete-no-real-games",
    );
    expect(evidence.opening_preflight).toMatchObject({
      selected_pairs: 28,
      prior_inventory_overlap: 0,
      within_selection_duplicates: 0,
      complete_prior_inventory: { fingerprints: 3_198 },
    });
    expect(evidence.fixed_screen).toMatchObject({
      games: 56,
      milliseconds_per_move: 1_500,
      maximum_plies: 512,
      pair_workers: 12,
      minimum_candidate_halfpoints: 62,
      denominator_halfpoints: 112,
    });
    expect(evidence.durability).toEqual({
      pair_logs_create_only: true,
      pair_receipts_create_only: true,
      journal_attempts_create_only: true,
      faults_create_only: true,
      results_create_only: true,
      strength_failure_resume_authorized: false,
      technical_fault_same_plan_resume_only: true,
    });
    expect(evidence.local_validation.real_games_run).toBe(0);
    expect(evidence.measured_state.live_weight_bytes_changed).toBe(0);

    const japanese = readFileSync(
      resolve(root, "docs/blog-shogi-direct-teacher-halfkp81-v2-pilot.md"),
      "utf8",
    );
    const english = readFileSync(
      resolve(root, "docs/blog-shogi-direct-teacher-halfkp81-v2-pilot.en.md"),
      "utf8",
    );
    for (const article of [japanese, english]) {
      expect(article).toContain("3,198");
      expect(article).toContain("1200001");
      expect(article).toContain("62 / 112");
      expect(article).toContain("technical");
      expect(article).toContain("create-only");
    }
  });
});
