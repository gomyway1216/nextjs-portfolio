import { test as base, type BrowserContextOptions } from '@playwright/test';

import { quietFloor } from './quietFloor';

export * from '@playwright/test';

/**
 * The suite's `test`: Playwright's, with the medal floor's API faked for every browser context a test opens (its own
 * `context` and `page`, and each one it makes with `browser.newContext()` or `browser.newPage()`): a quiet floor and its
 * jackpot, answered at once, with the live database and the sign-in cut off (quietFloor.ts). Nothing reaches a real
 * server. Every spec takes `test` from here (eslint.config.mjs says so).
 *
 * Why by default: every machine's page and the medal center ask the floor's API, and a spec that let those requests
 * through left the server reading a store it cannot reach on CI (no Google credentials): each read waited out its 6 s
 * timeout while the page's other requests queued behind it.
 *
 * A spec that tests the floor itself fakes it its own way on the page (`page.route`, as medal-floor.spec.ts and
 * layoutShift.ts's `holdFloor` do): a page's routes are asked before its context's, so theirs answer. One that wants
 * the real server's answer lets the request through on the page: `page.route(/\/api\/game\/medal-floor/, (route) =>
 * route.continue())`.
 */
export const test = base.extend({
  browser: [
    async ({ browser }, use) => {
      // Playwright makes the test's own context with `browser.newContext()` as well, so this one place covers them all.
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options?: BrowserContextOptions) => {
        const context = await newContext(options);
        await quietFloor(context);
        return context;
      };
      await use(browser);
    },
    { scope: 'worker' },
  ],
});
