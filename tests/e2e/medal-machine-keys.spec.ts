import { test, expect, type Page } from './fixtures';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { pressUntil } from './pressUntil';
import { arrived } from './streamedPage';

// The table machines' keys on a desktop (MedalCenter/machineKeys.ts): the slot machine spins with Space or Enter and
// takes its bet from 1 2 3; the roulette spins with Space, puts the last bets back with R and takes one off with U;
// the video poker deals and draws with Space or Enter, holds with 1–5, bets one with B and the most with M. Keys do
// nothing while the machine's tab is not shown, and Space on a button presses that button, as it always does.

async function open(page: Page, path: string, ready: string) {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await arrived(page);
  await expect(page.locator(ready)).toBeVisible({ timeout: 20_000 });
}

/** Moves the focus off any control, onto the page itself. */
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

const count = async (page: Page, testId: string) => Number(((await page.getByTestId(testId).textContent()) ?? '').replace(/,/g, ''));

test('the slot machine: 1 2 3 choose the bet, Space and Enter spin, and nothing happens from another tab', async ({ page }) => {
  await open(page, '/games/slot-machine', '[data-testid="slot-medals"][data-loaded="true"]');
  await expect(page.getByTestId('slot-keys')).toHaveText('Keys: Space or Enter spins · 1 2 3 choose the bet');
  await blur(page);
  await page.keyboard.press('3');
  await expect(page.getByTestId('slot-bet')).toHaveText('3');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('slot-medals')).toHaveText(String(WELCOME - 3), { timeout: 5_000 });
  await expect(page.locator('[role="img"][data-spinning="false"]')).toBeVisible({ timeout: 10_000 });
  // The page did not scroll for the Space.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press('1');
  await expect(page.getByTestId('slot-bet')).toHaveText('1');
  const before = await count(page, 'slot-medals');
  await page.keyboard.press('Enter');
  await expect.poll(() => count(page, 'slot-medals')).not.toBe(before);
  await expect(page.locator('[role="img"][data-spinning="false"]')).toBeVisible({ timeout: 10_000 });

  // On the odds tab, the machine's keys are the page's again.
  await page.getByRole('tab', { name: 'Exact odds' }).click();
  await blur(page);
  const still = await count(page, 'slot-medals');
  await page.keyboard.press('Enter');
  await page.keyboard.press('2');
  await page.waitForTimeout(400);
  expect(await count(page, 'slot-medals')).toBe(still);
  await expect(page.getByTestId('slot-bet')).toHaveText('1');
});

test('roulette: Space spins the bets on the felt, R puts the last ones back, U takes one off', async ({ page }) => {
  await open(page, '/games/roulette', '[data-testid="roulette-meter"][data-loaded="true"]');
  await expect(page.getByTestId('roulette-keys')).toHaveText('Keys: Space or Enter spins · R rebet · U undo');
  const meter = page.getByTestId('roulette-meter');
  // A medal on red, put there with the mouse; Space on the page spins it.
  await pressUntil(page.getByRole('button', { name: /^Red \(1:1\)$/ }), async () => Number(await meter.getAttribute('data-bet')) > 0);
  await expect(meter).toHaveAttribute('data-bet', '1');
  await blur(page);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-spinning="false"]')).toBeVisible({ timeout: 15_000 });
  await expect(meter).toHaveAttribute('data-bet', '0');
  // R: the same medal on red again; U: off again.
  await page.keyboard.press('r');
  await expect(meter).toHaveAttribute('data-bet', '1');
  await page.keyboard.press('u');
  await expect(meter).toHaveAttribute('data-bet', '0');
});

test('video poker: Space deals, 1–5 hold, Enter draws, B bets one and M bets the most', async ({ page }) => {
  await open(page, '/games/video-poker', '[data-testid="vp-machine"][data-playable="true"]');
  await expect(page.getByTestId('vp-keys')).toContainText('1–5 hold a card');
  await blur(page);
  await page.keyboard.press('b');
  await expect(page.getByTestId('vp-bet')).toHaveText('1');
  await page.keyboard.press('b');
  await expect(page.getByTestId('vp-bet')).toHaveText('2');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'DRAW', exact: true })).toBeVisible();
  await expect(page.getByTestId('vp-medals')).toHaveText(String(WELCOME - 2));
  await page.keyboard.press('1');
  await page.keyboard.press('5');
  await expect(page.locator('[data-slot="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-slot="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-slot="2"]')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('5');
  await expect(page.locator('[data-slot="4"]')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'DEAL', exact: true })).toBeVisible();
  // M bets five and deals at once.
  const before = await count(page, 'vp-medals');
  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: 'DRAW', exact: true })).toBeVisible();
  await expect(page.getByTestId('vp-bet')).toHaveText('5');
  expect(await count(page, 'vp-medals')).toBe(before - 5);
});
