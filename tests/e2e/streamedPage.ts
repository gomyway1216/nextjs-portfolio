import { expect, type Page } from '@playwright/test';

/**
 * Waits until a page that streams in has let go of its hidden copy.
 *
 * A game's page streams in. React first holds the content in a hidden copy
 * (a `div[hidden]` whose id begins `S:`), and on some loads it draws the page
 * itself before it lets that copy go: for a moment there are two of
 * everything, one of them hidden, and a locator that should find one thing
 * finds two. Call this after a `goto` or a `reload`, which return once the
 * whole document has been received, and before looking anything up.
 */
export async function arrived(page: Page): Promise<void> {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}
