import { test, expect, type Page } from './fixtures';

import { arrived } from './streamedPage';

// Daifugo against the AIs on a phone. With a full starting hand (18 cards with two AIs) the hand's row, which did not
// wrap, widened the whole game to 939px in a 390px screen: the table sat off to the right, Hint was cut off at the
// edge and New Game / Back were a screen and a half away. The hand wraps now, and on a phone the side seats move
// above the table, so nothing but the page's own height is left to scroll.

const hand = (page: Page) => page.getByTestId('daifugo-hand');

async function startRound(page: Page, ais: number) {
  await page.goto('/games/daifugo');
  await arrived(page);
  await page.getByRole('button', { name: /Play vs AI/ }).click();
  await page.getByRole('combobox').selectOption(String(ais));
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(hand(page)).toBeVisible();
}

/** How far the page and the game's scrolling area reach past their own width. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const area = document.querySelector('[data-testid="daifugo-game-area"]')!;
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      area: area.scrollWidth - area.clientWidth,
    };
  });

/**
 * A button can be brought on the screen by scrolling down only: it is wholly inside the screen's width, and a tap at
 * its centre lands on it. Scrolled to and measured in one step, since the AIs' plays move the page while they think.
 */
async function reachable(page: Page, testId: string) {
  const button = page.getByTestId(testId);
  await expect(button).toBeVisible();
  const hit = await button.evaluate((el) => {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const box = el.getBoundingClientRect();
    const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
      hit: !!at && (at === el || el.contains(at)),
    };
  });
  expect(hit.left).toBeGreaterThanOrEqual(0);
  expect(hit.right).toBeLessThanOrEqual(hit.width);
  expect(hit.top).toBeGreaterThanOrEqual(0);
  expect(hit.bottom).toBeLessThanOrEqual(hit.height);
  expect(hit.hit).toBe(true);
}

for (const [width, height] of [[390, 844], [320, 640]] as const) {
  test.describe(`on a ${width}px phone`, () => {
    test.use({ viewport: { width, height }, hasTouch: true });

    test('a round starts with the whole game inside the screen, the full hand included', async ({ page }) => {
      await startRound(page, 2);
      // 54 cards among three players: the largest hand the game deals (an AI's 7 may already have handed over more).
      await expect(hand(page).getByRole('button').nth(17)).toBeVisible();
      expect(await sideways(page)).toEqual({ page: 0, area: 0 });

      await reachable(page, 'daifugo-hint');
      await reachable(page, 'daifugo-new-game');

      // Every card of the hand is inside the screen's width: the row wraps, it does not run off to the right.
      const cards = await hand(page)
        .getByRole('button')
        .evaluateAll((els) => els.map((el) => { const box = el.getBoundingClientRect(); return [box.left, box.right]; }));
      for (const [left, right] of cards) {
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(width);
      }
    });

    test('five AIs fit too, their seats above the table', async ({ page }) => {
      await startRound(page, 5);
      expect(await sideways(page)).toEqual({ page: 0, area: 0 });
      await reachable(page, 'daifugo-hint');
      await reachable(page, 'daifugo-new-game');
    });
  });
}
