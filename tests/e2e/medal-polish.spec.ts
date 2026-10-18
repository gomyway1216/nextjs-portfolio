import { test, expect, type Page } from '@playwright/test';

import { FLOOR_GAMES } from '../../src/lib/medalFloor/games';
import { holdFloor } from './layoutShift';
import { pressUntil } from './pressUntil';
import { arrived } from './streamedPage';

// Small things a player on a phone noticed in the play-through, kept as they are now. The floor's API is faked;
// nothing reaches a real server.

test('the way back to the medal center reads the same on every machine: the arrow, a gap, the words', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
  const page = await context.newPage();
  const floor = await holdFloor(page);
  floor.release();
  for (const path of [...FLOOR_GAMES.map((game) => `/games/${game}`), '/games/medal-center', '/games/medal-center/records', '/games/medal-center/rankings']) {
    await page.goto(path);
    await arrived(page);
    // The first link on the page whose arrow is drawn apart from its words.
    const gap = await page.evaluate(() => {
      const link = [...document.querySelectorAll('main a')].find((a) => a.firstElementChild?.getAttribute('aria-hidden') !== null && a.firstElementChild?.textContent?.trim() === '←');
      if (!link) return null;
      const arrow = link.firstElementChild!.getBoundingClientRect();
      const range = document.createRange();
      const words = [...link.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '');
      if (!words) return null;
      range.selectNodeContents(words);
      const text = range.getBoundingClientRect();
      return text.left - arrow.right;
    });
    expect(gap, `${path}: the back link`).not.toBeNull();
    expect(gap!, `${path}: the arrow and the words apart`).toBeGreaterThanOrEqual(3);
  }
  await context.close();
});

test('the race caller names a horse by its number on its saddle cloth, as the board under the line does', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
  const page = await context.newPage();
  const floor = await holdFloor(page);
  floor.release();
  await page.goto('/games/horse-race');
  await arrived(page);
  await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  const ticket = page.getByTestId('hr-ticket-win:1');
  await pressUntil(ticket, async () => Number(await ticket.getAttribute('data-medals')) > 0);
  await page.getByTestId('hr-start').click();
  const line = page.getByTestId('hr-commentary');
  // Once the field has settled into a line, the caller names the leaders.
  const badge = line.locator('span').first();
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await expect(badge).toHaveText(/^[1-6]$/);
  const gate = Number(await badge.textContent());
  // Its colours are the saddle cloth's, as on the running order under the line.
  const chip = page.getByTestId('hr-order').locator('li').filter({ hasText: new RegExp(`^${gate}$`) });
  const colours = async (target: typeof badge) => target.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  expect(await colours(badge)).toEqual(await colours(chip));
  // No circled number is left in the line (「④」 read as 「◎」 in its small bold type).
  expect(await line.textContent()).not.toMatch(/[①②③④⑤⑥]/);
  await context.close();
});

/** The craps table shown (the half one on a phone, the full one on a desk): every die that lies on a bet's box. */
const diceOnBets = (page: Page) =>
  page.locator('[data-table-kind]:visible').evaluate((view) => {
    const boxes = [...view.querySelectorAll('[data-bet]')].map((el) => ({ id: el.getAttribute('data-bet'), r: el.getBoundingClientRect() }));
    const over: string[] = [];
    view.querySelectorAll('[data-die]').forEach((die, i) => {
      const d = die.getBoundingClientRect();
      for (const { id, r } of boxes) {
        const w = Math.min(d.right, r.right) - Math.max(d.left, r.left);
        const h = Math.min(d.bottom, r.bottom) - Math.max(d.top, r.top);
        if (w > 0.5 && h > 0.5) over.push(`die ${i} on ${id} (${w.toFixed(1)} × ${h.toFixed(1)})`);
      }
    });
    return over;
  });

for (const [where, width, height, phone] of [
  ['a phone', 375, 812, true],
  ['a desk', 1280, 900, false],
] as const) {
  test(`craps on ${where}: between rolls the stickman has the dice off the layout, never on a bet`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
    await context.addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
    const page = await context.newPage();
    const floor = await holdFloor(page);
    floor.release();
    await page.goto('/games/craps');
    await arrived(page);
    await expect(page.getByTestId('craps-counter')).toHaveAttribute('data-loaded', 'true');
    const table = page.getByTestId('craps-table');
    // Before the first roll.
    await expect(table).toHaveAttribute('data-dice', 'parked');
    expect(await diceOnBets(page)).toEqual([]);
    const pass = page.locator('#craps-panel-play').getByRole('button', { name: /^Pass Line \(1:1\)/ });
    await pressUntil(pass, async () => (await page.getByTestId('craps-on-table').textContent()) !== '0');
    const roll = async () => {
      // A bet on the table to throw for: the Pass Line again if the last roll took it.
      if ((await page.getByTestId('craps-on-table').textContent()) === '0') await pass.click();
      await expect(page.getByTestId('craps-on-table')).not.toHaveText('0');
      const before = await table.getAttribute('data-settled');
      await page.getByRole('button', { name: 'ROLL', exact: true }).click();
      await expect.poll(() => table.getAttribute('data-settled'), { timeout: 10_000 }).not.toBe(before);
      // Called and paid, the dice are pulled back off the layout.
      await expect(table).toHaveAttribute('data-dice', 'parked', { timeout: 8_000 });
      expect(await diceOnBets(page)).toEqual([]);
    };
    await roll();
    await roll();
    // Quick roll: the dice are at rest at once, and then pulled back all the same.
    await page.getByTestId('craps-quick').click();
    await roll();
    // Reduced motion: they are put off the layout with no slide.
    await page.getByTestId('craps-quick').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await roll();
    // After a reload the last roll's dice are where the stickman left them.
    await page.reload();
    await arrived(page);
    await expect(table).toHaveAttribute('data-dice', 'parked');
    expect(await diceOnBets(page)).toEqual([]);
    await context.close();
  });
}
