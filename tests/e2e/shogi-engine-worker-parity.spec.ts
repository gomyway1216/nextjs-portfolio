import { expect, test } from "@playwright/test";

import {
  BROWSER_WORKER_PARITY_REQUEST_SCHEMA,
  BROWSER_WORKER_PARITY_RESULT_SCHEMA,
  CANDIDATE_WEIGHTS_SCHEMA,
  NNUE_WEIGHTS_BYTES,
  PRODUCTION_WASM_BYTES,
  PRODUCTION_WASM_PATH,
  PRODUCTION_WASM_SCHEMA,
  PRODUCTION_WASM_SHA256,
  runBrowserWorkerParityWithPageForTests,
} from "../../ml/run-strength-first-browser-worker-parity";
import { SHOGI_ENGINE_PARITY_TEST_ID } from "../../src/components/game/ShogiImproved/shogiEngineParityProtocol";

const SHIPPED_WEIGHTS_SHA256 =
  "e04e60c7962ae89528ca384f2055866b01dd3c47f870c2eb1f21bcdf985a1e72";

test("ordinary Shogi never mounts the unlinked parity harness", async ({
  page,
}) => {
  await page.goto("/games/shogi");
  await expect(page.getByTestId(SHOGI_ENGINE_PARITY_TEST_ID)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Start Game/i }).first(),
  ).toBeVisible();
});

test("explicit local weights traverse the real browser Worker/WASM/NNUE path", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const result = await runBrowserWorkerParityWithPageForTests(
    page,
    process.cwd(),
    {
      schema: BROWSER_WORKER_PARITY_REQUEST_SCHEMA,
      candidate_weights: {
        path: "public/shogi-halfkp81-production-weights.bin",
        bytes: NNUE_WEIGHTS_BYTES,
        sha256: SHIPPED_WEIGHTS_SHA256,
        schema: CANDIDATE_WEIGHTS_SCHEMA,
      },
      production_wasm: {
        path: PRODUCTION_WASM_PATH,
        bytes: PRODUCTION_WASM_BYTES,
        sha256: PRODUCTION_WASM_SHA256,
        schema: PRODUCTION_WASM_SCHEMA,
      },
    },
  );

  expect(result).toMatchObject({
    schema: BROWSER_WORKER_PARITY_RESULT_SCHEMA,
    status: "complete-explicit-artifact-browser-worker-parity",
    environment: {
      cross_origin_isolated: true,
      shared_array_buffer: true,
    },
    execution: {
      worker_response: true,
      legal_result: true,
      search_path: "wasm",
      evaluation_path: "nnue-wasm",
    },
    engine_state: {
      nnue_fetch_status: "loaded",
      nnue_loaded: true,
      nnue_enabled: true,
      wasm_ready: true,
    },
    network: {
      exact_candidate_asset_intercepts: 1,
      external_origins: [],
    },
    safety: {
      measurement_only: true,
      candidate_served_from_memory: false,
      live_asset_modified: false,
      live_weight_write: false,
    },
    nonclaims: {
      candidate_enrollment_verified: false,
      real_selected_candidate_measured: false,
      served_app_build_identity_verified: false,
      standalone_result_is_formal_parity_evidence: false,
      formal_ab_ready: false,
      formal_ab_games: 0,
      strength_improved: false,
      high_dan_calibrated: false,
      live_weights_changed: false,
    },
  });
  expect(JSON.stringify(result)).not.toMatch(/"move"|"board"|"hand"|"sfen"/i);
});
