import { test, expect, type Browser, type Locator, type Page } from './fixtures';

import { dealButton, openBlackjack } from './blackjackPage';
import { holdFloor } from './layoutShift';
import { pressUntil } from './pressUntil';
import { openRoulette, placeFirstBet, settledResult, spinButton } from './roulettePage';
import { arrived } from './streamedPage';

// On a phone a machine's show and the button that starts it are a screen apart. Pressing the button brings the show on
// screen (MedalCenter/lookUp.ts): the roulette wheel on SPIN, and the view goes back down to the felt once the number
// has been seen (unless the player has touched the page meanwhile); the race track on START. At the blackjack table the
// moves take the place of the bet buttons during a hand, right where DEAL was pressed. The floor's API is faked and the
// live database cut off.

/** A phone, in English, its floor faked. */
async function phone(browser: Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const floor = await holdFloor(page);
  floor.release();
  return page;
}

/** Layout is measured to fractions of a pixel, and fonts differ by a fraction from one system to another: a pixel either way is allowed at every edge. */
const SLACK = 1;

/** How much of an element is inside the window, from 0 to 1 (a pixel over an edge still counts as inside). */
const onScreen = (target: Locator) =>
  target.evaluate((el, slack) => {
    const r = el.getBoundingClientRect();
    const visible = Math.min(r.bottom, window.innerHeight + slack) - Math.max(r.top, -slack);
    return Math.min(1, Math.max(0, visible) / r.height);
  }, SLACK);

/** Where an element's top is in the window. */
const topInWindow = (target: Locator) => target.evaluate((el) => el.getBoundingClientRect().top);

/** Puts `target` at the bottom of the window, as a player who has scrolled down to it. */
const scrollToBottom = (target: Locator) => target.evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));

test('roulette on a phone: SPIN brings the wheel on screen, and the view goes back down to the felt once the number has been seen', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await phone(browser, 375, 812);
  await openRoulette(page);
  await placeFirstBet(page, /^Red/);
  const wheel = page.locator('[data-spinning]');
  await scrollToBottom(spinButton(page));
  expect(await onScreen(wheel)).toBeLessThan(0.6);
  const spinAt = await topInWindow(spinButton(page));

  await spinButton(page).click();
  // The ball is still rolling and the wheel is on screen.
  await expect.poll(() => onScreen(wheel), { timeout: 4_000 }).toBeGreaterThanOrEqual(0.95);
  await expect(wheel).toHaveAttribute('data-spinning', 'true');
  await settledResult(page);
  // The number is shown under the wheel, on screen.
  expect(await onScreen(page.getByTestId('roulette-result'))).toBe(1);
  // Then the view goes back down to the felt: SPIN is where it was.
  await expect.poll(async () => Math.abs((await topInWindow(spinButton(page))) - spinAt), { timeout: 6_000 }).toBeLessThanOrEqual(2 * SLACK);
  await page.context().close();
});

test('roulette on a phone: a player who moves the page while the ball rolls keeps the view', async ({ browser, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright cannot move a phone’s page in WebKit as a player does: mobile WebKit has no mouse wheel there, and no finger that drags');
  test.setTimeout(60_000);
  const page = await phone(browser, 320, 640);
  await openRoulette(page);
  await placeFirstBet(page, /^Red/);
  const wheel = page.locator('[data-spinning]');
  await scrollToBottom(spinButton(page));
  await spinButton(page).click();
  await expect.poll(() => onScreen(wheel), { timeout: 4_000 }).toBeGreaterThanOrEqual(0.95);
  // The player scrolls a little to look at the history under the wheel.
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 2_000 }).toBeGreaterThan(0);
  await settledResult(page);
  const kept = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(3_000);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - kept)).toBeLessThanOrEqual(2 * SLACK);
  expect(await onScreen(spinButton(page))).toBeLessThan(0.1);
  await page.context().close();
});

test('the horse race on a phone: START brings the track on screen', async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await phone(browser, 375, 812);
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await page.goto('/games/horse-race');
  await arrived(page);
  await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  const ticket = page.getByTestId('hr-ticket-win:1');
  await pressUntil(ticket, async () => Number(await ticket.getAttribute('data-medals')) > 0);
  const start = page.getByTestId('hr-start');
  await scrollToBottom(start);
  const track = page.getByTestId('hr-track');
  expect(await onScreen(track)).toBeLessThan(0.6);
  await start.click();
  await expect.poll(() => onScreen(track), { timeout: 4_000 }).toBe(1);
  await expect(track).toHaveAttribute('data-running', 'true');
  await page.context().close();
});

for (const [width, height] of [
  [375, 812],
  [320, 640],
] as const) {
  test(`the smart ball (smart-ball) at ${width}×${height}: START brings the whole board and the plunger on screen together, under the toolbar`, async ({ browser }) => {
    test.setTimeout(60_000);
    const page = await phone(browser, width, height);
    await page.context().addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
    await page.goto('/games/smart-ball');
    await arrived(page);
    const machine = page.getByTestId('smb-machine');
    await expect(machine).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    const start = page.getByTestId('smb-start');
    // Scrolled on past the board, START in the middle of the window, as a player back from the figures under it: the top
    // of the board is under the toolbar or off the screen.
    await start.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const board = page.getByTestId('smb-board');
    const covered = () =>
      board.evaluate((el) => {
        const bar = document.querySelector('[class*="GlobalToolbar"]')?.getBoundingClientRect().bottom ?? 0;
        return el.getBoundingClientRect().top < bar - 1;
      });
    expect(await covered()).toBe(true);
    await pressUntil(start, async () => ((await machine.getAttribute('data-round')) ?? '') !== '');
    // The whole board under the toolbar, and the plunger under it, inside the window.
    await expect.poll(covered, { timeout: 4_000 }).toBe(false);
    expect(await onScreen(board)).toBe(1);
    expect(await onScreen(page.getByTestId('smb-plunger'))).toBe(1);
    await page.context().close();
  });
}

for (const [width, height] of [
  [375, 812],
  [320, 640],
] as const) {
  test(`the pachinko (pachinko) at ${width}×${height}: LEND brings the whole board, its screen and the handle on screen together, under the toolbar`, async ({ browser }) => {
    test.setTimeout(60_000);
    const page = await phone(browser, width, height);
    await page.context().addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
    await page.goto('/games/pachinko');
    await arrived(page);
    const machine = page.getByTestId('pk-machine');
    await expect(machine).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
    const lend = page.getByTestId('pk-lend');
    // Scrolled on past the board, LEND in the middle of the window: the top of the board is under the toolbar or off the screen.
    await lend.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const board = page.getByTestId('pk-board');
    const covered = () =>
      board.evaluate((el) => {
        const bar = document.querySelector('[class*="GlobalToolbar"]')?.getBoundingClientRect().bottom ?? 0;
        return el.getBoundingClientRect().top < bar - 1;
      });
    expect(await covered()).toBe(true);
    await pressUntil(lend, async () => (await machine.getAttribute('data-tray')) !== '0');
    await expect.poll(covered, { timeout: 4_000 }).toBe(false);
    expect(await onScreen(board)).toBe(1);
    expect(await onScreen(page.getByTestId('pk-lcd'))).toBe(1);
    expect(await onScreen(page.getByTestId('pk-handle'))).toBe(1);
    await page.context().close();
  });
}

for (const [width, height] of [
  [375, 812],
  [320, 640],
] as const) {
  test(`blackjack at ${width}×${height}: during a hand the moves are where DEAL was pressed, on screen`, async ({ browser }) => {
    test.setTimeout(60_000);
    const page = await phone(browser, width, height);
    await openBlackjack(page);
    const dismiss = page.getByTestId('bj-notice-dismiss');
    if (await dismiss.isVisible()) await dismiss.click();
    const spot = page.getByTestId('bj-play-spot');
    await expect(spot).toHaveAttribute('data-phase', 'bet');
    // Between hands the moves are out of sight; the bet buttons are there.
    await expect(page.locator('button[data-action="hit"]')).toBeHidden();
    await expect(page.getByTestId('bj-one-bet')).toBeVisible();
    const oneBetAt = await page.getByTestId('bj-one-bet').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await scrollToBottom(dealButton(page));

    await pressUntil(dealButton(page), async () => (await spot.getAttribute('data-phase')) === 'hand');
    // During the hand the bet buttons are out of sight and the moves are in their place, inside the window.
    await expect(dealButton(page)).toBeHidden();
    const moves = page.locator('button[data-action]');
    await expect(moves).toHaveCount(4);
    for (const move of await moves.all()) await expect(move).toBeVisible();
    const hitAt = await page.locator('button[data-action="hit"]').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(Math.abs(hitAt - oneBetAt)).toBeLessThanOrEqual(SLACK);
    const room = await moves.evaluateAll((els) => {
      const rects = els.map((el) => el.getBoundingClientRect());
      return { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
    });
    expect(room.top).toBeGreaterThanOrEqual(-SLACK);
    expect(room.bottom).toBeLessThanOrEqual(height + SLACK);

    // The hand played out (insurance declined, the hand stood), the bet buttons are back.
    await expect(async () => {
      if (await page.getByTestId('bj-insurance').isVisible()) await page.getByRole('button', { name: 'No insurance', exact: true }).click({ timeout: 1_000 });
      const stand = page.locator('button[data-action="stand"]:enabled');
      if (await stand.count()) await stand.click({ timeout: 1_000 });
      expect(await spot.getAttribute('data-phase')).toBe('bet');
    }).toPass({ timeout: 20_000 });
    await expect(spot).toHaveAttribute('data-phase', 'bet');
    await expect(dealButton(page)).toBeVisible();
    await expect(page.locator('button[data-action="hit"]')).toBeHidden();
    await page.context().close();
  });
}

test('blackjack on a desk: the bet buttons and the moves are both on the panel', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const floor = await holdFloor(page);
  floor.release();
  await openBlackjack(page);
  await expect(page.locator('button[data-action="hit"]')).toBeVisible();
  await expect(dealButton(page)).toBeVisible();
});
