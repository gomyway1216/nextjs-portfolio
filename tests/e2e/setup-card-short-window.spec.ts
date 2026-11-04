import { test, expect, type Page } from './fixtures';
import { arrived } from './streamedPage';

// A short desktop window: a laptop with the browser's own bars and a row of tabs leaves about this much page.
test.use({ viewport: { width: 1000, height: 575 } });

// Every game that opens on the shared setup card (DifficultySelector).
const games = [
  'blokus',
  'breakout',
  'doubt-word',
  'gomoku',
  'mahjong',
  'memory-battle',
  'memory-maze',
  'mirror-othello',
  'shogi',
  'tetris',
  'tic-tac-toe',
] as const;

/**
 * Scrolls the way a person does, with the wheel, then says whether the card's last button (Start) is on the screen and
 * is what a click there would land on.
 *
 * Not `click()`: Playwright scrolls a clipped card into view itself, which a script can do to an `overflow: hidden` box
 * and a person cannot, so a click would pass while the button stayed out of reach.
 */
async function startReachable(page: Page) {
  const card = page.locator('section[class*="selector"]');
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.scrollHeight - element.clientHeight), 'the card cuts off its own bottom').toBeLessThanOrEqual(1);

  // Turned until Start is in sight: Firefox takes one turn only so far, and its scroll glides into place.
  const start = card.locator('button').last();
  const inSight = () => start.evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight);
  await page.mouse.move(500, 300);
  for (let turn = 0; turn < 10 && !(await inSight()); turn++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(300);
  }
  // Then hands off the wheel for a moment, as a person's are before a click. Chromium's wheel glide runs on after the
  // last turn, and a click inside it has the glide carry the next screen back down after the jump to the top.
  await page.waitForTimeout(800);
  await expect(start).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      start.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }),
    )
    .toBe(true);
  expect(await card.evaluate((element) => element.scrollTop), 'the card scrolled inside itself').toBe(0);

  // Pressed where it is, with no scrolling of Playwright's own; the game then opens at its top, not where the card left off.
  const box = (await start.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(card).toHaveCount(0);
  const scrolled = () => page.evaluate(() => [...document.querySelectorAll('*')].filter((element) => element.scrollTop > 0).map((element) => `${element.tagName} ${element.scrollTop}`));
  await expect.poll(scrolled).toEqual([]);
}

for (const game of games) {
  test(`${game}: in a short window the page scrolls down to Start, and the game opens at its top`, async ({ page }) => {
    await page.goto(`/games/${game}`);
    await arrived(page);
    await startReachable(page);
  });
}

test('blokus with four players: the tallest setup still scrolls down to Start, and Start starts', async ({ page }) => {
  await page.goto('/games/blokus');
  await arrived(page);
  await page.getByTestId('blokus-count-4').click();
  await expect(page.getByTestId('blokus-seat-3')).toBeVisible();
  await startReachable(page);
  await expect(page.getByTestId('blokus-board')).toBeVisible();
});
