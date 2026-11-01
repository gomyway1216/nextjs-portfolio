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

test('a screen reader hears where a held piece lands, and can read the board', async ({ page }) => {
  await start(page, 'Easy');
  const boardText = page.getByTestId('blokus-board-text');
  const heldText = page.getByTestId('blokus-held-text');
  await expect(boardText).toContainText('Your start square: row 1 column 1.');
  await expect(boardText).toContainText('The board is empty.');

  await page.getByTestId('blokus-piece-I1').click();
  await board(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(heldText).toHaveText('I1, 1 square, 1 wide and 1 tall, covers row 1 column 2. It doesn’t fit here.');
  await page.keyboard.press('ArrowLeft');
  await expect(heldText).toHaveText('I1, 1 square, 1 wide and 1 tall, covers row 1 column 1. It fits here.');

  await page.keyboard.press('Enter');
  await expect(heldText).toHaveText('');
  await expect(boardText).toContainText('Row 1: You column 1');
  await expect(boardText).toContainText('Your open corners: row 2 column 2.');
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

/**
 * Why a test that needs a real finger runs in Chromium alone: Playwright sends touches that start, move and end only
 * through Chromium's DevTools protocol. In WebKit and Firefox it has a single tap, so there the drags below are made
 * of pointer events sent to the page: the game's own handling runs, but the browser's scrolling takes no part in it.
 */
const NO_TOUCH = 'Playwright sends real touches (down, move, up) only through Chromium’s DevTools protocol; WebKit and Firefox have a single tap';

interface Finger {
  down: (x: number, y: number) => Promise<void>;
  move: (x: number, y: number) => Promise<void>;
  up: () => Promise<void>;
}

async function realFinger(page: Page): Promise<Finger> {
  const session = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) => {
    await session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  };
  return {
    down: (x, y) => touch('touchStart', [{ x, y }]),
    move: (x, y) => touch('touchMove', [{ x, y }]),
    up: () => touch('touchEnd', []),
  };
}

/** A touch as the page sees one, sent to whatever is under it when it comes down. */
function pointerFinger(page: Page): Finger {
  let last = { x: 0, y: 0 };
  const send = (type: string, x: number, y: number) => {
    last = { x, y };
    return page.evaluate(
      (event) => {
        const holder = window as unknown as { pressed?: Element | null };
        if (event.type === 'pointerdown') holder.pressed = document.elementFromPoint(event.x, event.y);
        holder.pressed?.dispatchEvent(
          new PointerEvent(event.type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: event.x, clientY: event.y, bubbles: true, cancelable: true, composed: true }),
        );
      },
      { type, x, y },
    );
  };
  return {
    down: (x, y) => send('pointerdown', x, y),
    move: (x, y) => send('pointermove', x, y),
    up: () => send('pointerup', last.x, last.y),
  };
}

const fingerOn = async (page: Page, browserName: string) => (browserName === 'chromium' ? realFinger(page) : pointerFinger(page));

/** Moves in steps, a frame apart, as a finger does. */
async function slide(page: Page, finger: Finger, from: [number, number], to: [number, number], steps = 8) {
  for (let step = 1; step <= steps; step++) {
    await finger.move(from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps);
    await page.waitForTimeout(20);
  }
}

async function middleOf(page: Page, testId: string): Promise<[number, number]> {
  const box = (await page.getByTestId(testId).boundingBox())!;
  return [box.x + box.width / 2, box.y + box.height / 2];
}

async function tapStart(page: Page, mode: 'classic' | 'duo' = 'classic') {
  await page.goto('/games/blokus');
  await arrived(page);
  await page.getByTestId(`blokus-mode-${mode}`).tap();
  await page.getByRole('button', { name: /Easy/ }).tap();
  await page.getByRole('button', { name: /Start Game/ }).tap();
  await expect(board(page)).toBeVisible();
}

/** How far the game's own scrolling box has been scrolled. */
const scrolled = (page: Page) => board(page).evaluate((element) => element.closest('[class*="root"]')!.scrollTop);

test.describe('a finger on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('a piece pulled from the tray rides above the finger and settles on the closest legal spot, and only Place plays it', async ({ page, browserName }) => {
    await tapStart(page);
    const finger = await fingerOn(page, browserName);
    const from = await middleOf(page, 'blokus-piece-L4');
    await finger.down(...from);

    // Near the corner, with the finger well below where the piece is going.
    const [x, y] = await cell(page, 1, 1, 20);
    await slide(page, finger, from, [x, y + 60]);
    await expect(ghost(page)).toHaveAttribute('data-legal', 'true');
    await expect(page.getByTestId('blokus-loupe')).toBeVisible();
    const held = (await ghost(page).boundingBox())!;
    expect(held.y + held.height).toBeLessThan(y + 60);

    await finger.up();
    await expect(page.getByTestId('blokus-loupe')).toHaveCount(0);
    await expect(ghost(page)).toHaveAttribute('data-legal', 'true');
    await expect(page.getByTestId('blokus-piece-L4')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('blokus-player-0')).toContainText('89');

    await page.getByTestId('blokus-place').tap();
    await expect(page.getByTestId('blokus-player-0')).toContainText('85');
    await expect(page.getByTestId('blokus-piece-L4')).toHaveAttribute('data-state', 'used');
  });

  test('let go off the board, and the piece goes back to the tray', async ({ page, browserName }) => {
    await tapStart(page);
    const finger = await fingerOn(page, browserName);
    const from = await middleOf(page, 'blokus-piece-L4');
    const box = (await board(page).boundingBox())!;
    await finger.down(...from);
    await slide(page, finger, from, [box.x + box.width / 2, box.y + 10]);

    await expect(page.getByTestId('blokus-float')).toHaveAttribute('data-over', 'false');
    await expect(ghost(page)).toHaveCount(0);
    await finger.up();
    await expect(page.getByTestId('blokus-float')).toHaveCount(0);
    await expect(page.getByTestId('blokus-piece-L4')).toHaveAttribute('aria-pressed', 'false');
    await expect(ghost(page)).toHaveCount(0);
  });

  test('a piece can be turned mid-drag from the tools, with the other thumb', async ({ page, browserName }) => {
    await tapStart(page);
    const finger = await fingerOn(page, browserName);
    const from = await middleOf(page, 'blokus-piece-I4');
    await finger.down(...from);
    const [x, y] = await cell(page, 10, 10, 20);
    await slide(page, finger, from, [x, y + 60]);
    const before = (await ghost(page).boundingBox())!;
    await page.getByTestId('blokus-rotate').click();
    await expect.poll(async () => (await ghost(page).boundingBox())!.height).toBeGreaterThan(before.height);
    await finger.up();
    await expect(page.getByTestId('blokus-piece-I4')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the page holds still under a drag, and scrolls under a finger the rest of the time', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', NO_TOUCH);
    await tapStart(page);
    const finger = await realFinger(page);

    const from = await middleOf(page, 'blokus-piece-L4');
    const [x, y] = await cell(page, 8, 8, 20);
    await finger.down(...from);
    await slide(page, finger, from, [x, y + 60]);
    await expect(ghost(page)).toBeVisible();
    expect(await scrolled(page)).toBe(0);
    await finger.up();
    expect(await scrolled(page)).toBe(0);
    await page.waitForTimeout(200);

    // Nothing in hand, and the same board scrolls the page.
    await page.getByTestId('blokus-piece-L4').tap();
    await expect(page.getByTestId('blokus-piece-L4')).toHaveAttribute('aria-pressed', 'false');
    await finger.down(x, y);
    await slide(page, finger, [x, y], [x, y - 160]);
    await finger.up();
    await expect.poll(() => scrolled(page)).toBeGreaterThan(40);
  });

  test('sliding the tray sideways scrolls it, and picks up nothing', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', NO_TOUCH);
    await tapStart(page);
    const finger = await realFinger(page);
    const tray = page.getByTestId('blokus-tray');
    const [x, y] = await middleOf(page, 'blokus-piece-L4');
    await finger.down(x, y);
    await slide(page, finger, [x, y], [x - 200, y + 2]);
    await finger.up();
    await expect.poll(() => tray.evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
    await expect(page.locator('[data-testid^="blokus-piece-"][aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByTestId('blokus-float')).toHaveCount(0);
  });

  test('a finger on the board moves the piece from where it is, by as far as the finger goes', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', NO_TOUCH);
    await tapStart(page);
    await page.getByTestId('blokus-piece-I2').tap();
    const before = (await ghost(page).boundingBox())!;
    const unit = (await board(page).boundingBox())!.width / 20;

    const finger = await realFinger(page);
    const [x, y] = await cell(page, 12, 12, 20);
    await finger.down(x, y);
    await slide(page, finger, [x, y], [x + 7 * unit, y - unit]);
    await expect(page.getByTestId('blokus-loupe')).toBeVisible();
    await slide(page, finger, [x + 7 * unit, y - unit], [x + 7 * unit, y + 6 * unit]);
    await finger.up();

    const after = (await ghost(page).boundingBox())!;
    expect(Math.round((after.x - before.x) / unit)).toBe(7);
    expect(Math.round((after.y - before.y) / unit)).toBe(6);
    await expect(ghost(page)).toHaveAttribute('data-legal', 'false');
    await expect(page.getByTestId('blokus-player-0')).toContainText('89');
    await expect(page.getByTestId('blokus-loupe')).toHaveCount(0);
  });

  test('a whole four-colour game runs to the final scores, which come into view', async ({ page }) => {
    test.setTimeout(240_000);
    await tapStart(page);

    const result = page.getByTestId('blokus-result');
    const ready = page.locator('[data-testid^="blokus-piece-"][data-state="ready"]');
    while (!(await result.isVisible())) {
      const myTurn = (await status(page).innerText()).includes('Your turn');
      if (!myTurn || (await ready.count()) === 0) {
        await page.waitForTimeout(100);
        continue;
      }
      if ((await page.locator('[data-testid^="blokus-piece-"][aria-pressed="true"]').count()) === 0) await ready.last().tap();
      await expect(ghost(page)).toBeVisible();
      for (let turn = 0; turn < 8 && (await ghost(page).getAttribute('data-legal')) !== 'true'; turn++) {
        await page.getByTestId(turn === 3 ? 'blokus-flip' : 'blokus-rotate').tap();
      }
      await page.getByTestId('blokus-place').tap();
    }

    await expect(result.getByRole('listitem')).toHaveCount(4);
    await expect(result).toBeInViewport({ timeout: 5_000 });
    await expect(status(page)).toContainText('Final scores');
  });
});

test('on its side, a phone can still reach the bottom row, with the piece floating beside the tray on the way', async ({ browser, browserName }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await tapStart(page);
  const finger = await fingerOn(page, browserName);
  const from = await middleOf(page, 'blokus-piece-L4');
  const box = (await board(page).boundingBox())!;
  await finger.down(...from);
  await slide(page, finger, from, [from[0] - 40, from[1] - 20], 4);
  await expect(page.getByTestId('blokus-float')).toHaveAttribute('data-over', 'false');
  await slide(page, finger, [from[0] - 40, from[1] - 20], [box.x + box.width / 2, 389]);
  await expect(ghost(page)).toBeVisible();
  const landed = (await ghost(page).boundingBox())!;
  expect(landed.y + landed.height).toBeGreaterThan(box.y + box.height - box.height / 20);
  await finger.up();
  await context.close();
});

test.describe('every size of screen', () => {
  const screens = [
    [320, 568],
    [320, 800],
    [568, 320],
    [640, 360],
    [360, 640],
    [390, 664],
    [390, 844],
    [430, 932],
    [844, 390],
    [768, 1024],
    [1280, 800],
  ] as const;

  for (const [width, height] of screens) {
    for (const mode of ['classic', 'duo'] as const) {
      test(`${width}×${height} ${mode}: nothing runs off sideways, the board is on the screen, and every target is big enough`, async ({ browser }) => {
        const touch = width < 1000;
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
        const page = await context.newPage();
        await page.goto('/games/blokus');
        await arrived(page);
        const press = (name: RegExp) => (touch ? page.getByRole('button', { name }).tap() : page.getByRole('button', { name }).click());
        const modeButton = page.getByTestId(`blokus-mode-${mode}`);
        await (touch ? modeButton.tap() : modeButton.click());
        await press(/Easy/);
        await press(/Start Game/);
        await expect(board(page)).toBeVisible();

        // 44px, give or take how an engine rounds a box: Firefox reports 2.75rem as 43.99999.
        const bigEnough = 43.99;
        const noSidewaysScroll = () =>
          board(page).evaluate((element) => {
            const root = element.closest('[class*="root"]')!;
            return document.documentElement.scrollWidth <= document.documentElement.clientWidth && root.scrollWidth <= root.clientWidth;
          });
        expect(await noSidewaysScroll()).toBe(true);

        const frame = (await board(page).boundingBox())!;
        // Pointers are read off this box, so it has to be the cells and nothing else.
        expect(Math.abs(frame.width - frame.height)).toBeLessThan(1);
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(height);

        if (touch) {
          // Everything a turn needs, with no scrolling: a piece and the tools.
          await page.getByTestId('blokus-piece-I2').tap();
          await expect(page.getByTestId('blokus-rotate')).toBeEnabled();
          for (const testId of ['blokus-rotate', 'blokus-flip', 'blokus-place', 'blokus-piece-I2']) {
            const box = (await page.getByTestId(testId).boundingBox())!;
            expect(box.width, testId).toBeGreaterThanOrEqual(bigEnough);
            expect(box.height, testId).toBeGreaterThanOrEqual(bigEnough);
            expect(box.y + box.height, testId).toBeLessThanOrEqual(height);
          }
          for (const name of [/Move left/, /Move up/, /Move down/, /Move right/]) {
            const box = (await page.getByRole('button', { name }).boundingBox())!;
            expect(box.width).toBeGreaterThanOrEqual(bigEnough);
            expect(box.height).toBeGreaterThanOrEqual(bigEnough);
          }
          expect(await noSidewaysScroll()).toBe(true);
        }
        await context.close();
      });
    }
  }
});
