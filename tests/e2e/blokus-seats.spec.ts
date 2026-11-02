import { test, expect, type Page } from './fixtures';

import { arrived } from './streamedPage';

const board = (page: Page) => page.getByTestId('blokus-board');
const status = (page: Page) => page.getByTestId('blokus-status');
const player = (page: Page, color: number) => page.getByTestId(`blokus-player-${color}`);

async function setup(page: Page) {
  await page.goto('/games/blokus');
  await arrived(page);
}

const begin = (page: Page) => page.getByRole('button', { name: /Start Game/ }).click();

/** Pick a piece and click the board with it over a cell. */
async function place(page: Page, piece: string, row: number, col: number, size = 20) {
  await page.getByTestId(`blokus-piece-${piece}`).click();
  const box = (await board(page).boundingBox())!;
  const x = box.x + ((col + 0.5) / size) * box.width;
  const y = box.y + ((row + 0.5) / size) * box.height;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

const friends = async (page: Page, seats: number[]) => {
  for (const seat of seats) await page.getByTestId(`blokus-seat-${seat}-control`).selectOption('friend');
};

test('the setup defaults to you against three AIs, and Duo seats two', async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId('blokus-count-4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('blokus-seat-3')).toBeVisible();
  await page.getByTestId('blokus-mode-duo').click();
  await expect(page.getByTestId('blokus-seat-1')).toBeVisible();
  await expect(page.getByTestId('blokus-seat-2')).toHaveCount(0);
  await expect(page.getByTestId('blokus-count-2')).toHaveCount(0);
});

test('choosing yellow means blue moves first, and the tray is yellow', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Easy/ }).click();
  await page.getByTestId('blokus-seat-0-color-1').click();
  await expect(page.getByTestId('blokus-seat-0-color-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('blokus-seat-1-color-0')).toHaveAttribute('aria-pressed', 'true');
  await begin(page);

  await expect(status(page)).toContainText('Your turn', { timeout: 10_000 });
  await expect(player(page, 0)).toContainText('20 pieces');
  await place(page, 'I1', 0, 19);
  await expect(player(page, 1)).toContainText('20 pieces');
  await expect(page.getByTestId('blokus-piece-I1')).toHaveAttribute('data-state', 'used');
});

test('a screen reader is told the start square of the colour you chose', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Easy/ }).click();
  await page.getByTestId('blokus-seat-0-color-1').click();
  await begin(page);
  const text = page.getByTestId('blokus-board-text');
  await expect(text).toContainText('start square: row 1 column 20');
  await expect(status(page)).toContainText('Your turn', { timeout: 10_000 });
  await expect(text).toContainText('start square: row 1 column 20');
});

test('in Duo you can take the second colour', async ({ page }) => {
  await setup(page);
  await page.getByTestId('blokus-mode-duo').click();
  await page.getByRole('button', { name: /Easy/ }).click();
  await page.getByTestId('blokus-seat-0-color-1').click();
  await begin(page);
  await expect(status(page)).toContainText('Your turn', { timeout: 10_000 });
  await place(page, 'I1', 9, 9, 14);
  await expect(player(page, 1)).toContainText('20 pieces');
});

test('two players on the classic board each play two colours, and the side scores together', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Easy/ }).click();
  await page.getByTestId('blokus-count-2').click();
  await expect(page.getByText(/two colours on opposite corners/)).toBeVisible();
  await begin(page);

  await expect(player(page, 0)).toContainText('You (Blue)');
  await expect(player(page, 2)).toContainText('You (Red)');
  await expect(player(page, 1)).toContainText('Yellow AI');
  await expect(status(page)).toContainText('Playing Blue');
  await place(page, 'I1', 0, 0);
  await expect(player(page, 0)).toContainText('20 pieces');

  // The AI plays yellow, and the tray has already turned to your red: a full hand, and its start corner.
  await expect(status(page)).toContainText('Playing Red', { timeout: 10_000 });
  await expect(page.getByTestId('blokus-piece-I1')).toHaveAttribute('data-state', 'ready');
  await place(page, 'I1', 19, 19);
  await expect(player(page, 2)).toContainText('20 pieces');
});

test('three players take turns with the shared colour', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Easy/ }).click();
  await page.getByTestId('blokus-count-3').click();
  await expect(page.getByText(/Green is shared/)).toBeVisible();
  await friends(page, [1, 2]);
  await begin(page);
  await expect(player(page, 3)).toContainText('Green (shared)');

  await expect(status(page)).toContainText('Player 1');
  await place(page, 'I1', 0, 0);
  await expect(status(page)).toContainText('Player 2');
  await place(page, 'I1', 0, 19);
  await expect(status(page)).toContainText('Player 3');
  await place(page, 'I1', 19, 19);

  // The shared colour's first turn belongs to the first seat, the next one to the second.
  await expect(status(page)).toContainText('Player 1');
  await expect(status(page)).toContainText('Playing Green');
  await place(page, 'I1', 19, 0);
  await expect(player(page, 3)).toContainText('20 pieces');
  await expect(status(page)).toContainText('Player 1');
});

test('four friends share one screen, and an AI level can differ by seat', async ({ page }) => {
  await setup(page);
  await friends(page, [1, 2]);
  await page.getByTestId('blokus-seat-3-control').selectOption('master');
  await begin(page);
  await expect(status(page)).toContainText('Player 1');
  await place(page, 'I1', 0, 0);
  await expect(status(page)).toContainText('Player 2');
  await place(page, 'I1', 0, 19);
  await expect(status(page)).toContainText('Player 3');
  await place(page, 'I1', 19, 19);
  await expect(status(page)).toContainText('Green AI');
  await expect(status(page)).toContainText('Player 1', { timeout: 15_000 });
});

test('a held piece does not carry over to the next player', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Easy/ }).click();
  await page.getByTestId('blokus-count-2').click();
  await begin(page);
  await place(page, 'I1', 0, 0);
  await page.getByTestId('blokus-piece-V5').click();
  await expect(page.getByTestId('blokus-piece-V5')).toHaveAttribute('aria-pressed', 'true');
  await expect(status(page)).toContainText('Playing Red', { timeout: 10_000 });
  await expect(page.getByTestId('blokus-piece-V5')).toHaveAttribute('aria-pressed', 'true');
});

test.describe('whole games on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  for (const [count, rows] of [
    [2, 2],
    [3, 3],
  ] as const) {
    test(`${count} players reach the final scores, one row a seat`, async ({ page }) => {
      test.setTimeout(240_000);
      await setup(page);
      await page.getByRole('button', { name: /Easy/ }).tap();
      await page.getByTestId(`blokus-count-${count}`).tap();
      await page.getByRole('button', { name: /Start Game/ }).tap();

      const result = page.getByTestId('blokus-result');
      const ready = page.locator('[data-testid^="blokus-piece-"][data-state="ready"]');
      const ghost = page.getByTestId('blokus-ghost');
      while (!(await result.isVisible())) {
        const myTurn = (await status(page).innerText()).includes('Your turn');
        if (!myTurn || (await ready.count()) === 0) {
          await page.waitForTimeout(100);
          continue;
        }
        // The tray turns to your next colour before your turn comes, so a piece may be left in hand from before.
        if ((await page.locator('[data-testid^="blokus-piece-"][aria-pressed="true"]').count()) === 0) await ready.last().tap();
        await expect(ghost).toBeVisible();
        for (let turn = 0; turn < 8 && (await ghost.getAttribute('data-legal')) !== 'true'; turn++) {
          await page.getByTestId(turn === 3 ? 'blokus-flip' : 'blokus-rotate').tap();
        }
        await page.getByTestId('blokus-place').tap();
      }
      await expect(result.getByRole('listitem')).toHaveCount(rows);
      await expect(result.getByRole('heading')).toHaveText(/You win|tie|You lost/);
    });
  }
});

test('a click with no pointer position plays the piece where it already is', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Easy/ }).click();
  await begin(page);
  await page.getByTestId('blokus-piece-I1').click();
  await board(page).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('blokus-ghost')).toHaveAttribute('data-legal', 'true');
  await board(page).dispatchEvent('click', { detail: 0, clientX: 0, clientY: 0 });
  await expect(page.getByTestId('blokus-piece-I1')).toHaveAttribute('data-state', 'used');
});
