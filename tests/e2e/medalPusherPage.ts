import { expect, type Page } from '@playwright/test';

/**
 * Waits until the Medal Pusher's page has finished arriving.
 *
 * The page streams in. React first holds the content in a hidden copy (a
 * `div[hidden]` whose id begins `S:`), and on some loads it draws the game
 * itself before it lets that copy go: for a moment there are two of
 * everything, one of them hidden. Counting one purse is not enough to tell,
 * because the hidden copy alone has one. The page is ready when a field is
 * being drawn, the copy is gone, and there is one of everything.
 */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="pusher-field"][data-renderer]')).toHaveCount(1);
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
}
