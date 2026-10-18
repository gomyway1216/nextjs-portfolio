import { expect, type Page } from '@playwright/test';

/**
 * Waits until a page that streams in has let go of its hidden copy.
 *
 * A game's page streams in. React first holds the content in a hidden copy
 * (a `div[hidden]` whose id begins `S:`), and on some loads it draws the page
 * itself before it lets that copy go: for a moment there are two of
 * everything, one of them hidden, and a locator that should find one thing
 * finds two. Call this after a `goto` or a `reload`, or once a link's page is
 * in the address bar, and before looking anything up.
 *
 * It first waits for the whole document to have been read (DOMContentLoaded):
 * a click on a link does not wait for that, and the address changes as soon
 * as the new document is committed, before its hidden copy has streamed in.
 * Looked at then, there was no copy yet, and a moment later there were two
 * counters (WebKit on production, baccarat-medals "the Play link on the
 * floor…"). Not `load`, which waits for the page's scripts too: the
 * layout-shift specs hold those back while they look (layoutShift.ts).
 */
export async function arrived(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0);
}
