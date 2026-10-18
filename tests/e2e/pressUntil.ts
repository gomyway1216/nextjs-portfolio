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
    await target.click({ timeout: 1_000 }).catch(() => undefined);
    const shown = Math.min(until, Date.now() + settle);
    while (Date.now() < shown) {
      if (await landed()) return;
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`pressUntil: ${target} was pressed for ${timeout} ms and never took effect`);
}
