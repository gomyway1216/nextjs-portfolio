import { test, expect, type Page } from './fixtures';

import { arrived } from './streamedPage';

const board = (page: Page) => page.getByTestId('blokus-board');
const status = (page: Page) => page.getByTestId('blokus-status');
const ghost = (page: Page) => page.getByTestId('blokus-ghost');

async function start(page: Page, level: string, mode: 'classic' | 'duo' = 'classic') {
  await page.goto('/games/blokus');
  await arrived(page);
  await page.getByTestId(`blokus-mode-${mode}`).click();
  await page.getByRole('button', { name: new RegExp(level) }).click();
  await page.getByRole('button', { name: /Start Game/ }).click();
  await expect(board(page)).toBeVisible();
}

/** The middle of a board cell, in page coordinates. */
async function cell(page: Page, row: number, col: number, size: number): Promise<[number, number]> {
  const box = (await board(page).boundingBox())!;
  return [box.x + ((col + 0.5) / size) * box.width, box.y + ((row + 0.5) / size) * box.height];
}

test('a piece goes down on the start corner with the mouse, and all three AIs reply', async ({ page }) => {
  await start(page, 'Easy');
  await expect(page.getByTestId('blokus-player-0')).toContainText('89');

  await page.getByTestId('blokus-piece-V5').click();
  const [x, y] = await cell(page, 1, 1, 20);
  await page.mouse.move(x, y);
  await expect(ghost(page)).toHaveAttribute('data-legal', 'true');
  await page.mouse.click(x, y);

  await expect(page.getByTestId('blokus-player-0')).toContainText('84');
  await expect(page.getByTestId('blokus-piece-V5')).toHaveAttribute('data-state', 'used');
  await expect(status(page)).toContainText('Your turn', { timeout: 10_000 });
  for (const color of [1, 2, 3]) {
    await expect(page.getByTestId(`blokus-player-${color}`)).toContainText('20 pieces');
  }
});

test('a piece that does not touch the start corner is refused', async ({ page }) => {
  await start(page, 'Easy');
  await page.getByTestId('blokus-piece-I2').click();
  const [x, y] = await cell(page, 10, 10, 20);
  await page.mouse.move(x, y);
  await expect(ghost(page)).toHaveAttribute('data-legal', 'false');
  await page.mouse.click(x, y);

  await expect(status(page)).toContainText('doesn’t fit');
  await expect(page.getByTestId('blokus-player-0')).toContainText('89');
  await expect(page.getByTestId('blokus-piece-I2')).toHaveAttribute('data-state', 'ready');
});

test('the X piece has no way into a corner, so it starts out of play', async ({ page }) => {
  await start(page, 'Easy');
  await expect(page.getByTestId('blokus-piece-X5')).toHaveAttribute('data-state', 'stuck');
  await expect(page.getByTestId('blokus-piece-X5')).toBeDisabled();
});

test('the keyboard can turn, move and place a piece', async ({ page }) => {
  await start(page, 'Easy');
  await page.getByTestId('blokus-piece-I5').click();
  await board(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(ghost(page)).toBeVisible();
  // Upright, then up and left into the corner.
  await page.keyboard.press('r');
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
  }
  await expect(ghost(page)).toHaveAttribute('data-legal', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('blokus-player-0')).toContainText('84');

  await page.getByTestId('blokus-piece-I4').click();
  await expect(page.getByTestId('blokus-piece-I4')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('blokus-piece-I4')).toHaveAttribute('aria-pressed', 'false');
});

test('the AI thinks in a worker, so the page can still pick up a piece meanwhile', async ({ page }) => {
  await start(page, 'Master');
  await page.getByTestId('blokus-piece-V5').click();
  const [x, y] = await cell(page, 1, 1, 20);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);

  await expect(status(page)).toContainText('thinking');
  await expect.poll(() => page.workers().length).toBeGreaterThan(0);
  await page.getByTestId('blokus-piece-I2').click();
  await expect(page.getByTestId('blokus-piece-I2')).toHaveAttribute('aria-pressed', 'true');
  await expect(status(page)).toContainText('thinking');
  await expect(status(page)).toContainText('Your turn', { timeout: 15_000 });
});

test('a mouse press after keyboard play lands on the piece it was aimed at', async ({ page }) => {
  await start(page, 'Easy');
  await page.getByTestId('blokus-piece-I2').click();
  await board(page).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByTestId('blokus-piece-I3').click();
  await expect(page.getByTestId('blokus-piece-I3')).toHaveAttribute('aria-pressed', 'true');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('the board, the tools and the tray share one screen, and nothing runs off it', async ({ page }) => {
    await page.goto('/games/blokus');
    await arrived(page);
    await page.getByRole('button', { name: /Easy/ }).tap();
    await page.getByRole('button', { name: /Start Game/ }).tap();
    await page.getByTestId('blokus-piece-V5').tap();

    const place = await page.getByTestId('blokus-place').boundingBox();
    const tray = await page.getByTestId('blokus-tray').boundingBox();
    const height = page.viewportSize()!.height;
    expect(place!.y + place!.height).toBeLessThanOrEqual(height);
    expect(tray!.y + 40).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('a tap never plays a piece: the Place button does', async ({ page }) => {
    await page.goto('/games/blokus');
    await arrived(page);
    await page.getByRole('button', { name: /Easy/ }).tap();
    await page.getByRole('button', { name: /Start Game/ }).tap();
    await page.getByTestId('blokus-piece-V5').tap();
    await expect(ghost(page)).toHaveAttribute('data-legal', 'true');

    const [x, y] = await cell(page, 2, 2, 20);
    await page.touchscreen.tap(x, y);
    await expect(ghost(page)).toHaveAttribute('data-legal', 'true');
    await expect(page.getByTestId('blokus-player-0')).toContainText('89');

    await page.getByTestId('blokus-place').tap();
    await expect(page.getByTestId('blokus-player-0')).toContainText('84');
  });

  test('a whole Duo game runs to the final scores', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/games/blokus');
    await arrived(page);
    await page.getByTestId('blokus-mode-duo').tap();
    await page.getByRole('button', { name: /Easy/ }).tap();
    await page.getByRole('button', { name: /Start Game/ }).tap();

    const result = page.getByTestId('blokus-result');
    const ready = page.locator('[data-testid^="blokus-piece-"][data-state="ready"]');
    while (!(await result.isVisible())) {
      const myTurn = (await status(page).innerText()).includes('Your turn');
      if (!myTurn || (await ready.count()) === 0) {
        await page.waitForTimeout(100);
        continue;
      }
      // The last ready piece in the tray; turning it lands it on the closest spot that way up can go.
      if ((await page.locator('[data-testid^="blokus-piece-"][aria-pressed="true"]').count()) === 0) await ready.last().tap();
      await expect(ghost(page)).toBeVisible();
      for (let turn = 0; turn < 8 && (await ghost(page).getAttribute('data-legal')) !== 'true'; turn++) {
        await page.getByTestId(turn === 3 ? 'blokus-flip' : 'blokus-rotate').tap();
      }
      await page.getByTestId('blokus-place').tap();
    }

    await expect(result.getByRole('listitem')).toHaveCount(2);
    await expect(result.getByRole('heading')).toHaveText(/You win|tie|You lost/);
    await expect(status(page)).toContainText('Final scores');
    await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();
    await expect(page.getByLabel(/1 wins|0 wins/)).toBeVisible();
  });
});
