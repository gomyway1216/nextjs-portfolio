import { test, expect, type Page } from './fixtures';

import { arrived } from './streamedPage';

// Othello on a phone. The board's cells were sized from the screen's width alone (11vw), which forgot the row
// labels, the frame's padding and the page's margins: on a 390px phone the frame was 398px wide, its left and right
// edges were cut off and the whole page scrolled sideways. The cell is now what is left of the screen after those.

const board = (page: Page) => page.getByTestId('othello-board');

async function startGame(page: Page) {
  await page.goto('/games/othello');
  await arrived(page);
  await page.getByRole('button', { name: /^Start vs AI/ }).click();
  await expect(board(page)).toBeVisible();
  await expect(board(page).getByRole('grid').getByRole('button')).toHaveCount(64);
}

for (const [width, height] of [[390, 844], [360, 740], [320, 640]] as const) {
  test.describe(`on a ${width}px phone`, () => {
    test.use({ viewport: { width, height }, hasTouch: true });

    test('the whole board is inside the screen and the page does not scroll sideways', async ({ page }) => {
      await startGame(page);

      const measured = await page.evaluate(() => {
        const root = document.documentElement;
        const frame = document.querySelector('[data-testid="othello-board"]')!.getBoundingClientRect();
        const cells = [...document.querySelectorAll('[data-testid="othello-board"] [role="grid"] button')].map((cell) => {
          const box = cell.getBoundingClientRect();
          return { left: box.left, right: box.right, width: box.width, height: box.height };
        });
        return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, left: frame.left, right: frame.right, cells };
      });

      expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
      expect(measured.left).toBeGreaterThanOrEqual(0);
      expect(measured.right).toBeLessThanOrEqual(width);
      for (const cell of measured.cells) {
        expect(cell.left).toBeGreaterThanOrEqual(0);
        expect(cell.right).toBeLessThanOrEqual(width);
        // Square, and still a size a finger can hit.
        expect(Math.abs(cell.width - cell.height)).toBeLessThanOrEqual(0.5);
        expect(cell.width).toBeGreaterThanOrEqual(28);
      }
    });

    test('a tap on a corner square of the last column lands on that square', async ({ page }) => {
      await startGame(page);
      const hit = await board(page)
        .getByRole('grid')
        .getByRole('button')
        .nth(7)
        .evaluate((cell) => {
          cell.scrollIntoView({ block: 'center', behavior: 'instant' });
          const box = cell.getBoundingClientRect();
          const at = document.elementFromPoint(box.right - 3, box.top + box.height / 2);
          return !!at && (at === cell || cell.contains(at));
        });
      expect(hit).toBe(true);
    });
  });
}
