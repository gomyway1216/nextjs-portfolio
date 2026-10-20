import { test, expect } from '@playwright/test';

import { openCenter } from './medalCenterPage';
import { arrived } from './streamedPage';

// The card (MedalCenter/bank.ts) goes to a page that asks for it for a moment (the hub taking the day's bonus) as
// soon as the machine holding it hears, even when that page's request is slow to reach the browser's lock manager:
// the page says it wants the card only once its request is in, so the machine, which asks for the card again at once,
// is in the queue behind it.
//
// Here the hub's requests to the lock manager are made late on purpose, in order, a few round trips each, and the
// pages' clock is stopped, so that nothing but the request itself can get the card to the hub. (The bank's tick, which
// says "I want it" again every second, would otherwise put a late request right a second later; a test that stops the
// clock, as the slot machine's jackpot-while-borrowed test does, has no tick, and waited for ever.)

test('a page that asks for the card for a moment gets it, even when its request reaches the lock manager late and no clock runs', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  const hub = await context.newPage();
  await hub.addInitScript(() => {
    const locks = navigator.locks;
    if (!locks) return;
    const request = locks.request.bind(locks) as (...args: unknown[]) => Promise<unknown>;
    const query = locks.query.bind(locks);
    let line: Promise<void> = Promise.resolve();
    // A few round trips to the server: real time, which the stopped clock does not hold up.
    const hop = () =>
      fetch(location.href, { method: 'HEAD', cache: 'no-store' })
        .then(() => fetch(location.href, { method: 'HEAD', cache: 'no-store' }))
        .then(
          () => undefined,
          () => undefined,
        );
    /** Makes a call to the lock manager a while from now, after every call made before it. */
    const late = <T,>(go: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        line = line.then(hop).then(() => {
          go().then(resolve, reject);
        });
      });
    (locks as unknown as { request: unknown }).request = (...args: unknown[]) => late(() => request(...args));
    (locks as unknown as { query: unknown }).query = () => late(() => query());
  });
  await openCenter(hub);
  await expect(hub.getByTestId('pusher-bonus-take')).toBeVisible();

  // A machine holds the card.
  await page.bringToFront();
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await page.goto('/games/slot-machine');
  await arrived(page);
  await expect(page.getByTestId('slot-medals')).toHaveAttribute('data-loaded', 'true', { timeout: 20_000 });
  const spin = page.getByRole('button', { name: 'SPIN', exact: true });
  await expect(spin).toBeEnabled({ timeout: 20_000 });

  // No page's clock runs from here on.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 300);

  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken', { timeout: 10_000 });
  // And the machine has the card back, and takes bets again.
  await expect(spin).toBeEnabled({ timeout: 10_000 });
  await hub.close();
});
