import { test, expect, type Page } from './fixtures';

import { getStrings } from '../../src/components/game/MemoryBattle/i18n';
import { arrived } from './streamedPage';

// Memory Battle on a laptop. The cards are 3:4 and were as wide as the panel allowed, so the 4×4 board was taller
// than a 1280×800 screen: its fourth row and the buttons under it were below the fold. The grid is now no wider
// than lets all its rows fit in the height the screen has.

const t = getStrings('en');

async function openBoard(page: Page, grid: string, cards: number) {
  await page.goto('/games/memory-battle');
  await arrived(page);
  await page.getByRole('button', { name: grid }).click();
  await page.getByRole('button', { name: t.startLabel }).click();
  await expect(page.getByTestId('mb-card')).toHaveCount(cards);
}

test.describe('on a 1280×800 screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const [grid, cards] of [[t.grids.small, 12], [t.grids.medium, 16], [t.grids.large, 24]] as const) {
    test(`every card of the ${grid} board, and Play Again, are on the screen without scrolling`, async ({ page }) => {
      await openBoard(page, grid, cards);
      const measured = await page.evaluate((playAgain) => {
        const hit = (el: Element) => {
          const box = el.getBoundingClientRect();
          const at = document.elementFromPoint(box.left + box.width / 2, box.bottom - 4);
          return { top: box.top, bottom: box.bottom, width: box.width, hit: !!at && (at === el || el.contains(at)) };
        };
        const again = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === playAgain)!;
        return {
          height: window.innerHeight,
          cards: [...document.querySelectorAll('[data-testid="mb-card"]')].map(hit),
          again: hit(again),
        };
      }, t.playAgain);
      for (const card of [...measured.cards, measured.again]) {
        expect(card.top).toBeGreaterThanOrEqual(0);
        expect(card.bottom).toBeLessThanOrEqual(measured.height);
        expect(card.hit).toBe(true);
      }
      // Still cards, not slivers.
      for (const card of measured.cards) expect(card.width).toBeGreaterThanOrEqual(48);
    });
  }

  test('every card has a key: 0 turns the tenth card and a letter the ones after it', async ({ page }) => {
    await openBoard(page, t.grids.medium, 16);
    const card = (index: number) => page.getByTestId('mb-card').nth(index);
    await expect(page.getByTestId('mb-card-key')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'A', 'B', 'C', 'D', 'E', 'F']);
    await page.keyboard.press('0');
    await expect(card(9)).toHaveAttribute('data-state', 'up');
    await page.keyboard.press('f');
    await expect(card(15)).not.toHaveAttribute('data-state', 'down');
  });
});
