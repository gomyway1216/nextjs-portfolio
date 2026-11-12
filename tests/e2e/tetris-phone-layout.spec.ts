import { test, expect, type Page } from './fixtures';
import { arrived } from './streamedPage';

// Tetris on a phone held upright. The score / high score / level / Hold / Next column used to start at the right edge
// of the screen (x = 358 of 390, 32 px of it showing): the board's column was as wide as the row of three buttons under
// it, and the column beside it would not go under 132 px. The game scrolled sideways inside itself, so the page
// reported no overflow. The top of the board also sat under the site's toolbar. Now the board, that column, the
// buttons and the touch pad are all on the screen at once.

const phones = [
  { width: 390, height: 844, language: 'ja' },
  { width: 390, height: 844, language: 'en' },
  { width: 360, height: 740, language: 'ja' },
] as const;

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

const boxesOf = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((elements) =>
    elements.map((element): Box => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    }),
  );

/** Whether a tap in the middle of each element lands on it (nothing lies over it). */
const reachable = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    }),
  );

for (const { width, height, language } of phones) {
  test.describe(`tetris at ${width} × ${height} (${language})`, () => {
    test.use({ viewport: { width, height }, hasTouch: true });

    test('the board, the side column and the touch pad are on the screen together, with no sideways scroll', async ({ page, baseURL }) => {
      await page.context().addCookies([{ name: 'i18nextLng', value: language, url: baseURL ?? 'http://localhost:3000' }]);
      await page.goto('/games/tetris');
      await arrived(page);
      await page.locator('section[class*="selector"] button').last().click();

      const root = page.getByTestId('tetris-root');
      await expect(page.getByTestId('tetris-board')).toBeVisible();
      await expect(page.getByTestId('tetris-touch')).toBeVisible();

      // On the screen, whole. Polled for the side column: the board is sized from the toolbar's measured height.
      const inside = (box: Box) => box.left >= 0 && box.right <= width + 0.5 && box.top >= 0 && box.bottom <= height + 0.5;
      await expect
        .poll(async () => {
          const [side] = await boxesOf(page, '[data-testid="tetris-side"]');
          return inside(side);
        })
        .toBe(true);

      // Nothing scrolls sideways: not the game inside itself (as it did), not the page.
      const sizes = await root.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        page: document.documentElement.scrollWidth,
        window: window.innerWidth,
      }));
      expect(sizes.scrollWidth, 'the game scrolls sideways inside itself').toBeLessThanOrEqual(sizes.clientWidth);
      expect(sizes.page, 'the page scrolls sideways').toBeLessThanOrEqual(sizes.window);

      // Every panel of the column that a phone shows (score, high score, level and lines, Hold, Next; the keyboard
      // help is for desktop).
      const panels = (await boxesOf(page, '[data-testid="tetris-side"] > *')).filter((box) => box.width > 0);
      expect(panels.length).toBe(5);
      for (const panel of panels) {
        expect(inside(panel), `a side panel reaches off the screen: ${JSON.stringify(panel)}`).toBe(true);
        expect(panel.width).toBeGreaterThanOrEqual(90);
      }

      // The board, whole, beside that column, its top not under the site's toolbar.
      const [board] = await boxesOf(page, '[data-testid="tetris-board"]');
      expect(inside(board), `the board reaches off the screen: ${JSON.stringify(board)}`).toBe(true);
      expect(board.right).toBeLessThanOrEqual(panels[0].left);
      const boardTopShows = await page.getByTestId('tetris-board').evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + 8));
      });
      expect(boardTopShows, 'the top of the board is under the toolbar').toBe(true);

      // The seven touch buttons and the three action buttons: on the screen, big enough for a finger, not covered.
      for (const [selector, count] of [
        ['[data-testid="tetris-touch"] button', 7],
        ['[data-testid="tetris-actions"] button', 3],
      ] as const) {
        const buttons = await boxesOf(page, selector);
        expect(buttons.length).toBe(count);
        for (const button of buttons) {
          expect(inside(button), `a button reaches off the screen: ${JSON.stringify(button)}`).toBe(true);
          expect(button.width).toBeGreaterThanOrEqual(44);
          expect(button.height).toBeGreaterThanOrEqual(44);
        }
        expect(await reachable(page, selector)).toEqual(buttons.map(() => true));
      }
      expect(await page.evaluate(() => window.scrollY), 'the page had to scroll to show the game').toBe(0);

      // And the pad plays: a hard drop scores.
      await expect(page.getByTestId('tetris-score')).toHaveText('0');
      await page.getByTestId('tetris-touch').locator('button').last().tap();
      await expect(page.getByTestId('tetris-score')).not.toHaveText('0');
    });
  });
}
