import { test, expect } from '@playwright/test';

// Cross-origin isolation (COOP/COEP) for the shogi page was REMOVED.
// It unlocked SharedArrayBuffer, which turned on the multi-thread (Lazy SMP)
// search — but that parallel search deadlocked in the production build (the
// page froze permanently on "AI Thinking..."), while its strength benefit was
// only a ~+58 Elo point estimate (n=24, not significant). The AI now runs
// single-threaded. These tests pin that decision so isolation (and the
// deadlock) can't be reintroduced by accident. See next.config.ts /
// shogiAiWorkerClient.ts.
//
// The improved implementation is now served at the canonical /games/shogi
// route; the old /games/shogi-improved URL permanently redirects here.

test('shogi is NOT cross-origin isolated (stays single-thread)', async ({ page }) => {
  const response = await page.goto('/games/shogi');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(response!.headers()['cross-origin-opener-policy']).toBeUndefined();
  expect(response!.headers()['cross-origin-embedder-policy']).toBeUndefined();

  // Without isolation the browser exposes no SharedArrayBuffer, so the worker
  // never spawns Lazy SMP helpers (trySpawnSmpHelpers returns []) and the
  // search runs single-threaded — the deadlock is structurally impossible.
  const env = await page.evaluate(() => ({
    isolated: self.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  }));
  expect(env.isolated).toBe(false);
  expect(env.sharedArrayBuffer).toBe(false);

  // The page must still render and be playable.
  await expect(page.getByRole('button', { name: /Start Game/i }).first()).toBeVisible();
});

test('the old /games/shogi-improved URL permanently redirects to /games/shogi', async ({ request, page }) => {
  // Assert the redirect itself is a permanent 308 to the canonical path.
  const raw = await request.get('/games/shogi-improved', { maxRedirects: 0 });
  expect(raw.status()).toBe(308);
  expect(raw.headers()['location']).toBe('/games/shogi');

  // And that following it lands on the working, playable canonical page.
  const response = await page.goto('/games/shogi-improved');
  expect(response!.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe('/games/shogi');
  await expect(page.getByRole('button', { name: /Start Game/i }).first()).toBeVisible();
});

test('no route is cross-origin isolated', async ({ request }) => {
  for (const path of ['/', '/games', '/games/shogi']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cross-origin-embedder-policy']).toBeUndefined();
    expect(response.headers()['cross-origin-opener-policy']).toBeUndefined();
  }
});
