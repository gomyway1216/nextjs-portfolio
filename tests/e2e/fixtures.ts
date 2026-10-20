import { test as base, type APIRequestContext, type BrowserContext, type BrowserContextOptions } from '@playwright/test';

import { quietFloor } from './quietFloor';

export * from '@playwright/test';

/**
 * Every image the page asks the image optimizer (`/_next/image`) for is asked for by the test runner on its behalf,
 * and read whole, wherever the page has gone in the meantime.
 *
 * Why: `next start`'s image optimizer reads a local image by serving it to itself over the requesting browser's own
 * socket, and a browser that lets go of the request while the file is being read (a test that ends, or navigates away,
 * with covers still coming in) leaves the optimizer waiting for ever on that image at that width: every later request
 * for it hangs until the server restarts, and a page that shows it never fires `load` (seen in a local run of the
 * suite: two covers hung from its sixth minute, and medal-a11y's and medal-center's cover tests failed every attempt).
 * Production is not affected (Vercel optimizes the images itself). Asked for by the runner, through a request context
 * that lives as long as the worker, the server always sees the whole request; the page gets the same answer, or
 * nothing if it has gone.
 */
async function wholeImages(context: BrowserContext, runner: APIRequestContext, inFlight: Set<Promise<unknown>>): Promise<void> {
  await context.route(/\/_next\/image\?/, async (route) => {
    const asked = runner.fetch(route.request(), { maxRedirects: 0 });
    inFlight.add(asked);
    try {
      const response = await asked;
      await route.fulfill({ response }).catch(() => undefined);
    } catch {
      await route.abort().catch(() => undefined);
    } finally {
      inFlight.delete(asked);
    }
  });
}

/**
 * The suite's `test`: Playwright's, with two things done for every browser context a test opens (its own `context` and
 * `page`, and each one it makes with `browser.newContext()` or `browser.newPage()`). Every spec takes `test` from here
 * (eslint.config.mjs says so).
 *
 * - The medal floor's API is faked: a quiet floor and its jackpot, answered at once, with the live database and the
 *   sign-in cut off (quietFloor.ts). Nothing reaches a real server. Every machine's page and the medal center ask the
 *   floor's API, and a spec that let those requests through left the server reading a store it cannot reach on CI (no
 *   Google credentials): each read waited out its 6 s timeout while the page's other requests queued behind it.
 * - The optimizer's images are asked for whole (`wholeImages`, above).
 *
 * A spec that tests the floor itself fakes it its own way on the page (`page.route`, as medal-floor.spec.ts and
 * layoutShift.ts's `holdFloor` do): a page's routes are asked before its context's, so theirs answer. One that wants
 * the real server's answer lets the request through on the page: `page.route(/\/api\/game\/medal-floor/, (route) =>
 * route.continue())`.
 */
export const test = base.extend<object, { imageRunner: { request: APIRequestContext; inFlight: Set<Promise<unknown>> } }>({
  imageRunner: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext();
      const inFlight = new Set<Promise<unknown>>();
      await use({ request, inFlight });
      // Every image asked for is read to its end before the runner goes: none is let go half-read.
      await Promise.allSettled([...inFlight]);
      await request.dispose();
    },
    // Time for that last read: a request of the runner's gives up after its own 30 s at most, and this teardown had
    // only the test's 30 s too, so on a slow macOS runner, with an image still being made, the worker's end itself
    // failed the run ("Fixture imageRunner timeout … exceeded during teardown").
    { scope: 'worker', timeout: 60_000 },
  ],
  browser: [
    async ({ browser, imageRunner }, use) => {
      // Playwright makes the test's own context with `browser.newContext()` as well, so this one place covers them all.
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options?: BrowserContextOptions) => {
        const context = await newContext(options);
        await quietFloor(context);
        await wholeImages(context, imageRunner.request, imageRunner.inFlight);
        return context;
      };
      await use(browser);
    },
    { scope: 'worker' },
  ],
});
