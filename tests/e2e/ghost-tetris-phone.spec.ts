import { test, expect, type Locator, type Page } from './fixtures';
import { arrived } from './streamedPage';

// On a phone the touch pad used to come after the board AND the whole sidebar: the board's last row was under the
// fold, the pad a screen and a half further down, and with the pad in view the board was gone. Ghost Tetris could not
// be played by touch. During play the whole board and all four touch buttons now share the screen, under the site's
// sticky toolbar, with nothing scrolled.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const TOUCH = ['left', 'rotate', 'drop', 'right'] as const;

/** Where the element is, whether all of it is on the screen, and whether a finger on its middle would reach it. */
async function onScreen(target: Locator) {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      inside: box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth,
      reached: hit !== null && element.contains(hit),
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
}

/** A finger where the element is now: no scrolling to it first, which a tap from Playwright's own locator would do. */
async function tap(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function open(page: Page, language: 'ja' | 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: test.info().project.use.baseURL ?? 'http://localhost:3000' }]);
  await page.goto('/games/ghost-tetris');
  await arrived(page);
  const start = page.getByRole('dialog').getByRole('button');
  await expect(start).toBeVisible();
  // Until the page has hydrated a tap on Start does nothing: tapped until the game is running.
  await expect(async () => {
    if (await start.isVisible()) await tap(page, start);
    await expect(page.getByTestId('ghost-tetris-touch-left')).toBeVisible({ timeout: 500 });
  }).toPass();
}

for (const language of ['ja', 'en'] as const) {
  test(`ghost tetris on a phone (${language}): the board and every touch button are on screen together during play`, async ({ page }) => {
    await open(page, language);
    expect(await page.evaluate(() => scrollY), 'starting scrolled the page').toBe(0);

    const board = page.getByTestId('ghost-tetris-board');
    const boardBox = await onScreen(board);
    expect(boardBox.inside, 'the whole board is inside the viewport').toBe(true);
    const toolbarBottom = await page.evaluate(() => {
      const sticky = [...document.querySelectorAll('body *')].filter((element) => {
        const style = getComputedStyle(element);
        return (style.position === 'sticky' || style.position === 'fixed') && element.getBoundingClientRect().top <= 0 && element.getBoundingClientRect().height > 0;
      });
      return Math.max(0, ...sticky.map((element) => element.getBoundingClientRect().bottom));
    });
    expect(toolbarBottom, 'the site toolbar was found').toBeGreaterThan(40);
    expect(boardBox.top, 'the board starts under the sticky toolbar').toBeGreaterThanOrEqual(toolbarBottom);

    let padTop = Infinity;
    for (const name of TOUCH) {
      const button = await onScreen(page.getByTestId(`ghost-tetris-touch-${name}`));
      expect(button.inside, `${name} is inside the viewport`).toBe(true);
      expect(button.reached, `${name} is what a finger there lands on`).toBe(true);
      expect(button.width, `${name} is wide enough to tap`).toBeGreaterThanOrEqual(44);
      expect(button.height, `${name} is tall enough to tap`).toBeGreaterThanOrEqual(44);
      padTop = Math.min(padTop, button.top);
    }
    expect(padTop, 'the pad is under the board, not over it').toBeGreaterThanOrEqual(boardBox.bottom);

    // The score and the next piece stay in sight too.
    expect((await onScreen(page.getByTestId('ghost-tetris-score'))).inside).toBe(true);
    expect((await onScreen(page.getByTestId('ghost-tetris-next'))).inside).toBe(true);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'the page scrolls sideways').toBeLessThanOrEqual(0);

    // The buttons play the game where they are: a hard drop scores, and nothing has moved.
    await tap(page, page.getByTestId('ghost-tetris-touch-left'));
    await tap(page, page.getByTestId('ghost-tetris-touch-rotate'));
    await tap(page, page.getByTestId('ghost-tetris-touch-drop'));
    await expect(page.getByTestId('ghost-tetris-score')).not.toHaveText('0');
    expect(await page.evaluate(() => scrollY)).toBe(0);
    expect((await onScreen(board)).inside).toBe(true);
  });
}

test('ghost tetris on a phone: revealing the board after a run keeps the whole board in view', async ({ page }) => {
  await open(page, 'ja');
  const drop = page.getByTestId('ghost-tetris-touch-drop');
  const over = page.getByRole('alertdialog');
  // Straight drops down the middle end the run within a couple of dozen pieces.
  await expect(async () => {
    for (let i = 0; i < 6 && (await drop.isVisible()); i++) await tap(page, drop);
    await expect(over).toBeVisible({ timeout: 200 });
  }).toPass();

  await tap(page, over.getByRole('button').last());
  const back = page.getByRole('button', { name: '結果に戻る' });
  await expect(back).toBeFocused();

  // Focus going to the button under the board used to scroll all but the board's last rows off the top. The page
  // glides to its place (the site scrolls smoothly): looked at once it has stopped.
  const board = page.getByTestId('ghost-tetris-board');
  let at = NaN;
  await expect
    .poll(async () => {
      const was = at;
      at = await page.evaluate(() => scrollY);
      return at === was;
    })
    .toBe(true);
  expect((await onScreen(board)).inside, 'the whole board is inside the viewport').toBe(true);
  const top = await board.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + 2));
  });
  expect(top, "the board's top row is not under the toolbar").toBe(true);
  expect((await onScreen(back)).inside, 'the way back is on screen as well').toBe(true);
});
