import { test, expect } from '@playwright/test';

// ⚠️ TEMPORARY — SMP FREEZE-REPRODUCTION PREVIEW (instrumented branch).
//
// Cross-origin isolation (COOP/COEP) for /games/shogi is RE-ENABLED on this
// branch so SharedArrayBuffer exists and the multi-thread (Lazy SMP) search
// turns on — deliberately un-freeze-proofed, so the historical production
// freeze can be reproduced in real Chrome on the Vercel preview. These tests
// assert the isolated state (the inverse of the shipped single-thread pin).
// The freeze-proofing follow-up will decide the final assertions. See
// next.config.ts / shogiAiWorkerClient.ts.

test('shogi IS cross-origin isolated (Lazy SMP enabled)', async ({ page }) => {
  const response = await page.goto('/games/shogi');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(response!.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(response!.headers()['cross-origin-embedder-policy']).toBe('require-corp');

  // With isolation the browser exposes SharedArrayBuffer, so the worker can
  // spawn Lazy SMP helpers (trySpawnSmpHelpers) on machines with enough cores.
  const env = await page.evaluate(() => ({
    isolated: self.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  }));
  expect(env.isolated).toBe(true);
  expect(env.sharedArrayBuffer).toBe(true);

  // The page must still render and be playable.
  await expect(page.getByRole('button', { name: /Start Game/i }).first()).toBeVisible();
});

test('the old /games/shogi-improved URL no longer exists (direct 404, not a redirect)', async ({ request }) => {
  // The improved implementation now lives only at /games/shogi; the old route
  // was removed outright. maxRedirects:0 pins that the FIRST response is a 404,
  // so a reintroduced redirect-that-ends-at-404 would still fail this test.
  const response = await request.get('/games/shogi-improved', { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});

test('only /games/shogi is cross-origin isolated', async ({ request }) => {
  // Isolation is scoped to the shogi route only; the rest of the site must not
  // inherit COOP/COEP (it would break third-party embeds elsewhere).
  for (const path of ['/', '/games']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cross-origin-embedder-policy']).toBeUndefined();
    expect(response.headers()['cross-origin-opener-policy']).toBeUndefined();
  }
});
