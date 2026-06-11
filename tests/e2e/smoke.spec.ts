import { test, expect } from '@playwright/test';

// Data-independent smoke checks: these must pass with placeholder
// Firebase credentials (CI), where every Firestore-backed section
// renders its fallback state.

test('home page renders the hero and sidebar navigation', async ({ page }) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1, name: 'Yudai Yaguchi' })).toBeVisible();
  await expect(page.locator('.header-left')).toBeVisible();
});

test('games page lists game cards from the static catalog', async ({ page }) => {
  const response = await page.goto('/games');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);

  await expect(page.locator('a[href="/games/tic-tac-toe"]').first()).toBeVisible();
  await expect(page.locator('a[href="/games/tetris"]').first()).toBeVisible();
});

test('blog listing responds and renders its shell', async ({ page }) => {
  const response = await page.goto('/blog');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);

  // Post content depends on Firestore; the page shell (main + category
  // heading) must render even when the post list is empty.
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible();
});

test('unknown routes return the 404 page', async ({ page }) => {
  const response = await page.goto('/definitely-not-a-real-page');
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(404);
});
