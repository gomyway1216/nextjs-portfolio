import { test, expect } from '@playwright/test';

// Cross-origin isolation for the improved-shogi page (multi-thread Lazy SMP
// search needs SharedArrayBuffer, which browsers only expose on isolated
// pages — see the headers() block in next.config.ts).
//
// Deliberately NOT asserted here: helper worker counts / SMP engagement. The
// thread count adapts to the machine (min(4, hardwareConcurrency - 2)), so on
// 2-core CI runners the game legitimately stays single-thread.

test('shogi-improved is served cross-origin isolated', async ({ page }) => {
  const response = await page.goto('/games/shogi-improved');
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

  // The page must still render and be playable under COEP (no blocked
  // same-origin resources taking down the UI).
  await expect(page.getByRole('button', { name: /Start Game/i }).first()).toBeVisible();
});

test('worker chunks carry the COEP header an isolated page requires', async ({ page, request }) => {
  // A cross-origin-isolated document may only spawn dedicated workers whose
  // script responses themselves carry a compatible COEP; /_next/static must
  // therefore send require-corp (next.config.ts). Sample a real chunk URL
  // from the page rather than hardcoding a hashed filename.
  await page.goto('/games/shogi-improved');
  const chunkUrl = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLScriptElement>('script[src*="/_next/static/"]')].map((s) => s.src)[0] ?? null
  );
  expect(chunkUrl).not.toBeNull();
  const chunk = await request.get(chunkUrl!);
  expect(chunk.status()).toBe(200);
  expect(chunk.headers()['cross-origin-embedder-policy']).toBe('require-corp');
});

test('isolation does not leak to other routes', async ({ request }) => {
  for (const path of ['/', '/games']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cross-origin-embedder-policy']).toBeUndefined();
    expect(response.headers()['cross-origin-opener-policy']).toBeUndefined();
  }
});
