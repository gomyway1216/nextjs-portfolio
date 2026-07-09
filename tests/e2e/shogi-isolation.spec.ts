import { test, expect } from '@playwright/test';

// Cross-origin isolation (COOP/COEP) is enabled on /games/shogi to unlock
// SharedArrayBuffer + the multi-thread (Lazy SMP) engine search.
//
// The historical "AI Thinking… forever" freeze was NOT a Lazy SMP deadlock:
// under COEP require-corp the dedicated-Worker script chunks
// (/_next/static/chunks/turbopack-worker-*.js) were themselves blocked
// (net::ERR_BLOCKED_BY_RESPONSE) because they lacked their own COEP header, so
// the AI worker never booted and every search hung — even single-thread. The
// fix adds COEP to /_next/* (see next.config.ts). These tests pin: isolation is
// on, the worker chunks carry COEP, the AI actually answers (no freeze), and
// isolation stays scoped to /games/shogi.

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

test('the AI answers a move under isolation (no freeze)', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/games/shogi');
  // Start a normal (no-handicap) game; the human plays first as SENTE.
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  // Make a legal opening move: 7g-7f (push the SENTE pawn at file 7 from rank 7
  // to rank 6). Cells expose data-testid `cell-<suji>-<dan>`.
  await page.getByTestId('cell-7-7').click();
  await page.getByTestId('cell-7-6').click();

  // While GOTE moves, the status strip shows either 'AIが考えています…' (a real
  // search) or '定跡どおりに指しています' (an instant book reply — 7g7f is in
  // book), then 'あなたの番です' once it has answered. If the AI worker were
  // wedged (the historical freeze) it would never return to 'あなたの番です'.
  await expect(
    page.getByText('AIが考えています…').or(page.getByText('定跡どおりに指しています')),
  ).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('あなたの番です')).toBeVisible({ timeout: 30_000 });
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
