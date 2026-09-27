import { test, expect, type Page } from '@playwright/test';

import { WHEEL_GEOMETRY, pocketCenterDeg } from '../../src/components/game/Roulette/ballPhysics';
import { colorOf } from '../../src/components/game/Roulette/engine';

// The roulette result is random, so these checks never assume a number: they
// read the drawn result and verify that the wheel, the ball, the payout and the
// results board all agree with it.

const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

async function openRoulette(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/roulette');
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-spinning]')).toBeVisible();
}

/** Clicks a bet until hydration has attached handlers (SPIN becomes enabled). */
async function placeFirstBet(page: Page, betLabel: RegExp) {
  const spin = page.getByRole('button', { name: 'SPIN', exact: true });
  await expect(async () => {
    await page.getByRole('button', { name: betLabel }).click();
    await expect(spin).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function readBalance(page: Page): Promise<number> {
  const text = await page.locator('span', { hasText: /^Balance$/ }).locator('xpath=following-sibling::span[1]').textContent();
  return Number(text);
}

async function settledResult(page: Page): Promise<number> {
  const wheel = page.locator('[data-spinning]');
  await expect(wheel).toHaveAttribute('data-spinning', 'false', { timeout: 15_000 });
  const label = (await wheel.getAttribute('aria-label')) ?? '';
  const match = label.match(/showing (\d+) \((red|black|green)\)/);
  expect(match, `settled wheel label: ${label}`).not.toBeNull();
  const n = Number(match![1]);
  expect(match![2]).toBe(colorOf(n));
  return n;
}

async function boardNumbers(page: Page): Promise<number[]> {
  const rows = page.getByRole('list', { name: 'Winning numbers, newest first' }).locator('li[data-color]');
  return (await rows.evaluateAll((items) => items.map((li) => li.firstElementChild?.textContent ?? ''))).map(Number);
}

test('the ball lands in the winning pocket, which is paid and posted to the board', async ({ page }) => {
  await openRoulette(page);
  await placeFirstBet(page, /^Straight up \(35:1\) — 17$/);
  expect(await readBalance(page)).toBe(1000);

  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const wheel = page.locator('[data-spinning]');
  await expect(wheel).toHaveAttribute('data-spinning', 'true');
  await expect(page.getByText('No more bets')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spinning…' })).toBeDisabled();

  // The ball really travels (it is animated, not teleported to the result).
  const ball = page.locator('[data-ball]');
  const early = await ball.getAttribute('transform');
  await page.waitForTimeout(400);
  expect(await ball.getAttribute('transform')).not.toBe(early);

  const result = await settledResult(page);

  // Ball at 12 o'clock, seated at pocket depth…
  const [, bx, by] = (await ball.getAttribute('transform'))!.match(/translate\(([\d.-]+) ([\d.-]+)\)/)!.map(Number);
  expect(bx).toBeCloseTo(150, 0);
  expect(by).toBeCloseTo(150 - WHEEL_GEOMETRY.ballPocket * 150, 0);
  // …and the wheel head has carried the winning pocket to 12 o'clock.
  const head = await wheel.locator('svg').nth(1).evaluate((el) => (el as SVGElement).style.transform);
  const rotation = Number(head.match(/rotate\(([\d.-]+)deg\)/)![1]);
  const offTop = mod360(rotation + pocketCenterDeg(result));
  expect(Math.min(offTop, 360 - offTop)).toBeLessThan(0.05);

  // Payout, winning-number marker and results board agree with the pocket.
  expect(await readBalance(page)).toBe(result === 17 ? 1000 + 5 * 35 : 1000 - 5);
  await expect(page.locator('[data-winning="true"]')).toHaveAttribute('aria-label', new RegExp(`— ${result}$`));
  expect(await boardNumbers(page)).toEqual([result]);
  await expect(page.getByText('Last 1 spin', { exact: true })).toBeVisible();

  // A second spin goes on top of the board.
  await page.getByRole('button', { name: /^Straight up \(35:1\) — 17$/ }).click();
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const second = await settledResult(page);
  expect(await boardNumbers(page)).toEqual([second, result]);
});

test('switching tabs mid-spin keeps the spin, the payout and the bankroll', async ({ page }) => {
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const wheel = page.locator('[data-spinning]');
  await expect(wheel).toHaveAttribute('data-spinning', 'true');

  // Leave while the ball is still rolling…
  await page.getByRole('tab', { name: 'Martingale sim' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeVisible();
  // …the spin keeps going on the hidden play tab and settles there.
  await expect(wheel).toHaveAttribute('data-spinning', 'false', { timeout: 15_000 });

  await page.getByRole('tab', { name: 'Play' }).click();
  const n = await settledResult(page);
  expect(await boardNumbers(page)).toEqual([n]);
  const balance = colorOf(n) === 'red' ? 1005 : 995;
  expect(await readBalance(page)).toBe(balance);

  // A second round trip leaves the settled state alone.
  await page.getByRole('tab', { name: 'House edge' }).click();
  await page.getByRole('tab', { name: 'Play' }).click();
  expect(await readBalance(page)).toBe(balance);
  expect(await boardNumbers(page)).toEqual([n]);
});

test('reduced motion settles quickly and builds hot / cold statistics', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);

  const spins = 10;
  let expectedBalance = 1000;
  for (let i = 0; i < spins; i++) {
    if (i > 0) await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
    const startedAt = Date.now();
    await page.getByRole('button', { name: 'SPIN', exact: true }).click();
    const n = await settledResult(page);
    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expectedBalance += colorOf(n) === 'red' ? 5 : -5;
  }

  expect(await readBalance(page)).toBe(expectedBalance);
  const board = await boardNumbers(page);
  expect(board).toHaveLength(spins);
  await expect(page.getByText(`Last ${spins} spins`, { exact: true })).toBeVisible();
  const distinct = new Set(board).size;
  await expect(page.getByRole('list', { name: 'Hot' }).locator('li')).toHaveCount(Math.min(5, distinct));
  await expect(page.getByRole('list', { name: 'Cold' }).locator('li')).toHaveCount(5);
  // The hottest number is one that actually came up the most.
  const hottest = Number(await page.getByRole('list', { name: 'Hot' }).locator('li').first().locator('span').first().textContent());
  const counts = board.reduce<Record<number, number>>((acc, n) => ({ ...acc, [n]: (acc[n] ?? 0) + 1 }), {});
  expect(counts[hottest]).toBe(Math.max(...Object.values(counts)));
});

test('the results board is localized', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page, 'ja');
  await expect(page.getByRole('region', { name: '出目履歴' })).toBeVisible();
  await expect(page.getByText('あと 10 回スピンするとホット / コールド数字を表示します。')).toBeVisible();
});

test('winning numbers are saved across reloads and tab switches, and can be cleared', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);

  for (let i = 0; i < 3; i++) {
    if (i > 0) await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
    await page.getByRole('button', { name: 'SPIN', exact: true }).click();
    await settledResult(page);
  }
  const saved = await boardNumbers(page);
  expect(saved).toHaveLength(3);

  // Survives switching to another tab and back (the play tab remounts).
  await page.getByRole('tab', { name: 'Martingale sim' }).click();
  await page.getByRole('tab', { name: 'Play' }).click();
  expect(await boardNumbers(page)).toEqual(saved);

  // Survives a reload; the bankroll does not (only the board is saved).
  await page.reload();
  await expect.poll(() => boardNumbers(page)).toEqual(saved);
  await expect(page.getByText('Last 3 spins', { exact: true })).toBeVisible();
  expect(await readBalance(page)).toBe(1000);

  // New spins keep stacking on top of the saved history.
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const next = await settledResult(page);
  expect(await boardNumbers(page)).toEqual([next, ...saved]);

  // Clearing asks first, then empties the board for good.
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Clear saved winning numbers' }).click();
  expect(await boardNumbers(page)).toHaveLength(4);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear saved winning numbers' }).click();
  await expect.poll(() => boardNumbers(page)).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('roulette-results-v1'))).toBeNull();
  await page.reload();
  await expect(page.locator('[data-spinning]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear saved winning numbers' })).toBeDisabled();
  expect(await boardNumbers(page)).toEqual([]);
});
