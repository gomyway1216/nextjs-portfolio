import { test, expect } from '@playwright/test';

// Cross-origin isolation (COOP/COEP) is enabled on /games/shogi to unlock
// SharedArrayBuffer + the multi-thread (Lazy SMP) search. The historical
// "AI Thinking… forever" freeze was NOT a Lazy SMP deadlock: under COEP
// require-corp the dedicated-Worker script chunks (/_next/static/chunks/
// turbopack-worker-*.js) were themselves blocked (net::ERR_BLOCKED_BY_RESPONSE)
// because they lacked their own COEP header, so the AI worker never booted and
// every search hung — even single-thread. The fix adds COEP to /_next/* (see
// next.config.ts). These tests pin: isolation is on, the worker actually boots,
// and a real best-move request RETURNS (no freeze).

test('/games/shogi is cross-origin isolated with SharedArrayBuffer', async ({ page }) => {
  const response = await page.goto('/games/shogi');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(response!.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response!.headers()['cross-origin-embedder-policy']).toBe('require-corp');

  const env = await page.evaluate(() => ({
    isolated: self.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  }));
  expect(env.isolated).toBe(true);
  expect(env.sharedArrayBuffer).toBe(true);

  await expect(page.getByRole('button', { name: /Start Game/i }).first()).toBeVisible();
});

test('worker script chunks carry COEP so the AI worker can boot (freeze regression)', async ({ request }) => {
  // A dedicated Worker created from a require-corp document is blocked unless its
  // OWN script response asserts COEP. Pin that /_next assets carry it, so the AI
  // worker boots instead of silently failing to load (the historical freeze).
  const res = await request.get('/games/shogi');
  const html = await res.text();
  const m = html.match(/\/_next\/static\/[^"']+\.js/);
  expect(m, 'expected at least one /_next/static/*.js reference').not.toBeNull();
  const chunk = await request.get(m![0]);
  expect(chunk.status()).toBe(200);
  expect(chunk.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(chunk.headers()['cross-origin-resource-policy']).toBe('same-origin');
});

test('the AI worker boots under isolation and a best-move request returns (no freeze)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/games/shogi?smpharness=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => (window as unknown as { __smpHarnessReady?: boolean }).__smpHarnessReady === true,
    { timeout: 20_000 }
  );

  const result = await page.evaluate(async () => {
    type K = { teban: number; clone(): K };
    type Te = { koma: number; from: number; to: number; promote: boolean; capture: number };
    const w = window as unknown as {
      __smpHarness: {
        createClient: () => {
          requestBestMoveWithInfo: (p: unknown, d: string, t: number) => Promise<{ move: unknown | null; depth?: number }>;
          terminate: () => void;
        };
        serialize: (k: K) => unknown;
        newHirate: () => K;
        legalMoves: (k: K) => Te[];
      };
    };
    const H = w.__smpHarness;
    const k = H.newHirate();
    for (let ply = 0; ply < 16; ply++) {
      const legal = H.legalMoves(k);
      if (!legal.length) break;
      const te = legal[0]; te.capture = 0;
      (k as unknown as { move: (t: Te) => void; toggleTeban: () => void }).move(te);
      (k as unknown as { toggleTeban: () => void }).toggleTeban();
    }
    const client = H.createClient();
    await new Promise((r) => setTimeout(r, 1500));
    const t0 = performance.now();
    // A freeze would never resolve; race a 15s ceiling to fail fast instead.
    const info = await Promise.race([
      client.requestBestMoveWithInfo(H.serialize(k), 'hard', 16).then((r) => ({ ...r, hung: false })),
      new Promise<{ move: null; hung: true; depth?: number }>((r) => setTimeout(() => r({ move: null, hung: true }), 15000)),
    ]);
    const ms = performance.now() - t0;
    client.terminate();
    return { ms, hung: (info as { hung?: boolean }).hung === true, hasMove: !!info.move, depth: (info as { depth?: number }).depth };
  });

  expect(result.hung, 'best-move request must not hang (freeze regression)').toBe(false);
  expect(result.hasMove, 'a legal best move must be returned').toBe(true);
  // Hard budget is 2000ms; a healthy search returns near budget, well under 15s.
  expect(result.ms).toBeLessThan(10_000);
});

test('the old /games/shogi-improved URL no longer exists (direct 404, not a redirect)', async ({ request }) => {
  const response = await request.get('/games/shogi-improved', { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

test('isolation is scoped to /games/shogi only', async ({ request }) => {
  for (const path of ['/', '/games']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cross-origin-embedder-policy']).toBeUndefined();
    expect(response.headers()['cross-origin-opener-policy']).toBeUndefined();
  }
});
