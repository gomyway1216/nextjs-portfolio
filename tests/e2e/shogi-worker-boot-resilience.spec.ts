import { expect, test } from "@playwright/test";

import { NNUE_WEIGHTS_BYTES } from "../../ml/run-strength-first-browser-worker-parity";

/**
 * These tests run against the PRODUCTION build (see playwright.config.ts —
 * `npm run start`), and they deliberately mock nothing: the point is that the
 * real bundler output boots a real Worker and that the real search runs in it.
 *
 * Background — the gap this closes. shogi-engine-worker-parity.spec.ts already
 * proves the Worker/WASM/NNUE path, but it drives the unlinked parity harness
 * and serves the weights through `page.route`, so it says nothing about the
 * ordinary game page or about what happens when the worker's own script fails
 * to load. Both incidents we have had were exactly that: the page fell back to
 * the main-thread JS engine ("低速互換モード") and no existing test noticed,
 * because every test either stubbed the worker or asserted only that a move
 * came back — and a main-thread move comes back too.
 *
 * So these assert on `data-search-path`, i.e. WHICH engine produced the move.
 */

/** Play as 二枚落ち: the position is outside the opening book, so the AI's very
 * first move is a real search rather than a book lookup. */
async function startHandicapGame(page: import("@playwright/test").Page) {
  await page.goto("/games/shogi");
  await page.getByRole("button", { name: /Level 3/i }).click();
  await page.getByRole("button", { name: "二枚落ち" }).click();
  await page.getByRole("button", { name: /Start Game/i }).click();
}

async function waitForAiMove(page: import("@playwright/test").Page) {
  const status = page.getByTestId("shogi-engine-status");
  await expect(status).toHaveAttribute("data-thinking", "false", { timeout: 90_000 });
  return status;
}

test("the real game page searches in the Worker, not on the main thread", async ({
  page,
}) => {
  test.setTimeout(150_000);

  // Requests made INSIDE the worker surface on the page, so this observes the
  // real delivery of the real asset — no page.route, no substituted bytes.
  // shogi-engine-worker-parity.spec.ts intercepts the weights URL and therefore
  // cannot catch a broken delivery path; this is the half it cannot see.
  const weightsResponses: Array<{ status: number; length: string | null }> = [];
  page.on("response", (r) => {
    if (r.url().endsWith("/shogi-halfkp81-production-weights.bin")) {
      weightsResponses.push({
        status: r.status(),
        length: r.headers()["content-length"] ?? null,
      });
    }
  });

  await startHandicapGame(page);
  const status = await waitForAiMove(page);

  // 'wasm' is the healthy route. 'main-thread-js' is 低速互換モード, 'worker-js'
  // means the WASM engine never came up, 'engine-error' means no engine at all.
  expect(await status.getAttribute("data-search-path")).toBe("wasm");
  // The NNUE evaluation network really was delivered to the worker. Without
  // this the search still reports 'wasm' while silently evaluating on the
  // weaker hand-crafted V3 net.
  expect(weightsResponses).toHaveLength(1);
  expect(weightsResponses[0].status).toBe(200);
  expect(Number(weightsResponses[0].length)).toBe(NNUE_WEIGHTS_BYTES);
  // A worker search must not block the UI thread at all.
  expect(Number(await status.getAttribute("data-main-thread-blocked-ms"))).toBe(0);
  // A real search, not a degenerate one-ply answer.
  expect(Number(await status.getAttribute("data-search-depth"))).toBeGreaterThan(5);
  await expect(status).not.toContainText("低速互換モード");
});

test("a transient failure loading the worker script does not strand the session", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const consoleLogs: string[] = [];
  page.on("console", (m) => consoleLogs.push(m.text()));

  // Simulate a couple of seconds of CDN trouble on the worker's entry chunk —
  // the shape of the real incident. Before the backoff existed this consumed
  // all five respawn attempts within ~66ms and demoted the page permanently.
  let outageStart = 0;
  let blocked = 0;
  await context.route(/turbopack-worker-.*\.js/, async (route) => {
    const now = Date.now();
    if (!outageStart) outageStart = now;
    if (now - outageStart < 2000) {
      blocked++;
      await route.fulfill({ status: 503, body: "" });
      return;
    }
    await route.continue();
  });

  await startHandicapGame(page);
  const status = await waitForAiMove(page);
  // Guard against a silently-inert route pattern (e.g. a bundler change that
  // renames the worker entry chunk): if nothing was blocked this test proves
  // nothing, so fail loudly rather than pass green.
  expect(blocked).toBeGreaterThan(0);

  // The outage is long over by the player's turn. Play 7六歩 and check which
  // engine answers.
  await page.waitForTimeout(6000);
  await page.getByTestId("cell-7-7").click();
  await page.getByTestId("cell-7-6").click();
  await expect(status).toHaveAttribute("data-thinking", "true", { timeout: 30_000 });
  await waitForAiMove(page);

  expect(await status.getAttribute("data-search-path")).toBe("wasm");
  expect(Number(await status.getAttribute("data-main-thread-blocked-ms"))).toBe(0);
  // The storm guard must not have fired for a blip this short.
  expect(consoleLogs.filter((l) => l.includes("keeps failing"))).toEqual([]);
});
