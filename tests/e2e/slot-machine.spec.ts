import { test, expect, type Page } from '@playwright/test';

import { PHYSICAL_STOPS, REELS, evaluateLine, type Line, type SymbolId } from '../../src/components/game/SlotMachine/engine';

// Spins are random, so these checks read what was drawn and verify that the
// reels on screen, the announced payline, the payout and the stats all agree.

const STRIP_CELLS = PHYSICAL_STOPS + 3;
const EN_SYMBOLS: Record<string, SymbolId> = { '7': 'seven', BAR: 'bar', Bell: 'bell', Plum: 'plum', Cherry: 'cherry', Blank: 'blank' };

async function openSlots(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/slot-machine');
  expect(response?.status()).toBe(200);
  await expect(reelWindow(page)).toBeVisible();
}

const reelWindow = (page: Page) => page.locator('[role="img"][data-spinning]');

/** Presses SPIN until hydration has attached the handler and the reels start. */
async function firstSpin(page: Page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'SPIN', exact: true }).click({ timeout: 1_000 });
    await expect(page.getByTestId('slot-credits')).not.toHaveText('500', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function settledLine(page: Page): Promise<Line> {
  await expect(reelWindow(page)).toHaveAttribute('data-spinning', 'false', { timeout: 10_000 });
  const label = (await reelWindow(page).getAttribute('aria-label')) ?? '';
  const names = label.replace(/^Payline: /, '').split(', ');
  expect(names, label).toHaveLength(3);
  return names.map((n) => EN_SYMBOLS[n]) as unknown as Line;
}

/** The symbol each strip is actually showing in the middle (payline) row. */
async function paylineOnScreen(page: Page): Promise<SymbolId[]> {
  const offsets = await page.locator('[data-reel]').evaluateAll((strips) =>
    strips.map((s) => Number((s as HTMLElement).style.transform.match(/(-?[\d.]+)%/)![1])),
  );
  return offsets.map((pct, r) => {
    const top = Math.round((-pct / 100) * STRIP_CELLS);
    return REELS[r][(top + 1) % PHYSICAL_STOPS].symbol;
  });
}

async function stat(page: Page, label: string): Promise<number> {
  const text = await page.locator('dl div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd').innerText();
  return Number(text.replace(/[,+]/g, '').split(' ')[0]);
}

test('the reels stop on the payline that is announced and paid', async ({ page }) => {
  await openSlots(page);
  await firstSpin(page);
  await expect(reelWindow(page)).toHaveAttribute('data-spinning', 'true');
  await expect(page.getByRole('button', { name: 'Spinning…' })).toBeDisabled();

  // The strips really move (animated, not snapped to the result).
  const early = await page.locator('[data-reel="0"]').getAttribute('style');
  await page.waitForTimeout(250);
  expect(await page.locator('[data-reel="0"]').getAttribute('style')).not.toBe(early);

  const line = await settledLine(page);
  expect(await paylineOnScreen(page)).toEqual([...line]);

  const win = (evaluateLine(line)?.pays ?? 0) * 1;
  await expect(page.getByTestId('slot-win')).toHaveText(String(win));
  await expect(page.getByTestId('slot-credits')).toHaveText(String(500 - 1 + win));
  expect(await stat(page, 'Spins')).toBe(1);
  expect(await stat(page, 'Paid out')).toBe(win);
});

test('a jackpot pays 1000× and the session books balance over auto-spins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page);
  await firstSpin(page);
  await settledLine(page);
  const afterFirst = Number(await page.getByTestId('slot-credits').innerText());

  // Force the draw: virtual stop 0 on every reel is the 7. Restored right after.
  await page.evaluate(() => {
    const w = window as unknown as { __random: () => number };
    w.__random = Math.random;
    Math.random = () => 0.001;
  });
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  await page.evaluate(() => {
    Math.random = (window as unknown as { __random: () => number }).__random;
  });
  expect(await settledLine(page)).toEqual(['seven', 'seven', 'seven']);
  expect(await paylineOnScreen(page)).toEqual(['seven', 'seven', 'seven']);
  await expect(page.getByTestId('slot-win')).toHaveText('1000');
  await expect(page.getByTestId('slot-credits')).toHaveText(String(afterFirst - 1 + 1000));
  await expect(page.getByText('Three 7s — you win 1000 credits!')).toBeVisible();

  await page.getByRole('button', { name: 'Auto ×10' }).click();
  await expect.poll(() => stat(page, 'Spins'), { timeout: 30_000 }).toBe(12);
  await expect(reelWindow(page)).toHaveAttribute('data-spinning', 'false');
  await expect(page.getByRole('button', { name: 'Auto ×10' })).toBeEnabled();

  const wagered = await stat(page, 'Wagered');
  const paid = await stat(page, 'Paid out');
  expect(wagered).toBe(12);
  await expect(page.getByTestId('slot-credits')).toHaveText(String(500 - wagered + paid));
  expect(await stat(page, 'Net')).toBe(paid - wagered);
});

test('the exact odds tab shows the computed paytable and virtual reels', async ({ page }) => {
  await openSlots(page);
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await expect(page.getByTestId('slot-rtp')).toHaveText('95.262%');
  await expect(page.locator('tr[data-rule]')).toHaveCount(7);
  await expect(page.locator('tr[data-rule="seven3"]')).toContainText('0.00038%');
  await expect(page.getByText('249,724 ÷ 262,144')).toBeVisible();
  await expect(page.locator('li[title$="of 64 virtual stops"]')).toHaveCount(66);
  await expect(page.getByText(/12× as often as the jackpot/)).toBeVisible();
});

test('the simulations run and report against the theory', async ({ page }) => {
  await openSlots(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();

  await page.getByLabel('Number of spins').selectOption('10000');
  await page.getByRole('button', { name: 'Run' }).first().click();
  await expect(page.getByTestId('slot-convergence-result')).toContainText('After 10,000 spins the observed return was');

  await page.getByLabel('Players (sessions)').fill('300');
  await page.getByRole('button', { name: 'Run' }).nth(1).click();
  const results = page.getByTestId('slot-session-results');
  await expect(results).toBeVisible({ timeout: 20_000 });
  await expect(results).toContainText('Went broke');
  await expect(results).toContainText('Expected final credits');
});

test('the slot machine is localized', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSlots(page, 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('スロットマシン');
  await expect(page.getByRole('tab', { name: '正確な確率' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'レバーを引いて回す' })).toBeVisible();
});
