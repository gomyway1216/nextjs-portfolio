import { expect, test } from '@playwright/test';
import { arrived } from '../e2e/streamedPage';

/** No emulators needed: this doesn't talk to the server. */
test('an invite link can be turned down, and solo play is still there', async ({ page }) => {
  await page.goto('/games/blokus?room=ABC123&key=secret');
  await arrived(page);
  await expect(page.getByTestId('blokus-online-lobby')).toBeVisible();
  await page.getByTestId('blokus-online-back').click();
  await expect(page.getByTestId('blokus-online-lobby')).toHaveCount(0);
  await expect(page.getByTestId('blokus-online')).toBeVisible();
  expect(page.url()).not.toContain('key=');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('blokus-online')).toBeVisible();
});
