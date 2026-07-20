import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const evidencePath = join(
  root,
  "docs",
  "data",
  "floodgate-strength-first-browser-worker-parity-harness-2026-07-20.json",
);

describe("browser Worker parity harness evidence", () => {
  it("records implemented boundaries without claiming a real candidate result", () => {
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    expect(evidence.status).toBe(
      "implementation-complete-real-browser-execution-pending-remote-ci",
    );
    expect(evidence.implemented.ordinary_game_route).toMatchObject({
      imports_harness: false,
      reads_search_params: false,
      diagnostics_ui_mounted: false,
      static_delivery_contract_preserved: true,
    });
    expect(evidence.implemented.runner).toMatchObject({
      other_request_intercepts: 0,
      artifact_preflight_and_postflight: true,
      requires_prestarted_local_server: true,
      served_app_build_identity_verified_by_standalone_runner: false,
      writes_live_asset: false,
      publishes_raw_move_or_position: false,
    });
    expect(evidence.local_validation).toMatchObject({
      production_build: "not-run-to-avoid-contention-with-active-teacher",
      playwright: "not-run-to-avoid-contention-with-active-teacher",
      private_candidate_read_count: 0,
      browser_candidate_measurement_count: 0,
    });
    expect(evidence.nonclaims).toMatchObject({
      real_selected_candidate_browser_parity: false,
      candidate_enrollment_verified: false,
      served_app_build_identity_verified: false,
      standalone_result_is_formal_parity_evidence: false,
      formal_ab_ready: false,
      formal_ab_games: 0,
      strength_improved: false,
      high_dan_calibrated: false,
      stable_high_dan_achieved: false,
      live_weights_changed: false,
    });
  });

  it("binds the machine evidence to the unchanged shipped fixture and bilingual articles", () => {
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    const weights = readFileSync(
      join(root, "public", "shogi-nnue-weights.bin"),
    );
    expect(weights.byteLength).toBe(
      evidence.checked_in_shipped_fixture_identity.bytes,
    );
    expect(createHash("sha256").update(weights).digest("hex")).toBe(
      evidence.checked_in_shipped_fixture_identity.sha256,
    );

    for (const article of [
      "docs/blog-shogi-browser-worker-parity-harness.md",
      "docs/blog-shogi-browser-worker-parity-harness.en.md",
    ]) {
      const text = readFileSync(join(root, article), "utf8");
      expect(text).toContain("nnue-wasm");
      expect(text).toContain("0c0d9715");
      expect(text).not.toMatch(/strength (?:is|was) improved/i);
    }
  });
});
