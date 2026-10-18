import type { Locator } from '@playwright/test';

/**
 * Presses `target` until `landed` says the press has taken effect, and never once it has.
 *
 * A page that has just arrived may not have attached its handlers yet (it streams in and hydrates), and a machine may
 * not hold the player's medals yet, so the first press can be lost and has to be made again. But a press that did land
 * can take a while to show on a busy machine, and pressing again then puts a second medal down: a table that shows 10
 * where the test put 5. So a press is made only while nothing has landed, and each one is given `settle` ms to show
 * before the next.
 */
export async function pressUntil(
  target: Locator,
  landed: () => Promise<boolean>,
  { timeout = 30_000, settle = 3_000 }: { timeout?: number; settle?: number } = {},
): Promise<void> {
  const page = target.page();
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await landed()) return;
    // Not there yet, or covered for a moment: the next round presses again.
    await pressOnce(target).catch(() => undefined);
    const shown = Math.min(until, Date.now() + settle);
    while (Date.now() < shown) {
      if (await landed()) return;
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`pressUntil: ${target} was pressed for ${timeout} ms and never took effect`);
}

/**
 * One press: a click, or a finger's tap in Playwright's Firefox on a page that has a touch screen. There Playwright
 * sends a click as mouse events with no pointer events, the way a page hears the mouse events a browser makes up after
 * a touch, so a control that acts on pointerdown (a Medal Pusher's feed buttons) never hears it. A tap sends the
 * pointer events a finger makes, as a phone does. Everywhere else the press is the click it always was.
 */
async function pressOnce(target: Locator): Promise<void> {
  const page = target.page();
  if (page.context().browser()?.browserType().name() === 'firefox' && (await page.evaluate(() => 'ontouchstart' in window))) {
    await target.tap({ timeout: 1_000 });
    return;
  }
  await target.click({ timeout: 1_000 });
}
