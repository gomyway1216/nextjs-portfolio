import { expect, type Page } from '@playwright/test';

import { colorOf } from '../../src/components/game/Roulette/engine';
import { arrived } from './streamedPage';

/** The roulette table: opened, arrived, and the player's medals found. */
export async function openRoulette(page: Page, language: 'en' | 'ja' = 'en'): Promise<void> {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/roulette');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(page.locator('[data-spinning]')).toBeVisible();
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-loaded', 'true');
}

/** The SPIN button, in English. */
export const spinButton = (page: Page) => page.getByRole('button', { name: 'SPIN', exact: true });

/** Taps a bet until hydration has attached the handlers and the table holds the medals (SPIN becomes enabled). */
export async function placeFirstBet(page: Page, betLabel: RegExp): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: betLabel }).click();
    await expect(spinButton(page)).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** The medals on the table's counter that are not on the felt. */
export async function shownMedals(page: Page): Promise<number> {
  return Number(await page.getByTestId('roulette-meter').getAttribute('data-medals'));
}

/** The medals on the felt, as the BET counter shows them. */
export async function shownBet(page: Page): Promise<number> {
  return Number(await page.getByTestId('roulette-meter').getAttribute('data-bet'));
}

/** Waits for the ball to stop and returns the number, checking that the wheel's label and colour agree. */
export async function settledResult(page: Page): Promise<number> {
  const wheel = page.locator('[data-spinning]');
  await expect(wheel).toHaveAttribute('data-spinning', 'false', { timeout: 15_000 });
  const label = (await wheel.getAttribute('aria-label')) ?? '';
  const match = label.match(/showing (\d+) \((red|black|green)\)/);
  expect(match, `settled wheel label: ${label}`).not.toBeNull();
  const n = Number(match![1]);
  expect(match![2]).toBe(colorOf(n));
  return n;
}

/** The winning numbers on the results board, newest first. */
export async function boardNumbers(page: Page): Promise<number[]> {
  const rows = page.getByRole('list', { name: 'Winning numbers, newest first' }).locator('li[data-color]');
  return (await rows.evaluateAll((items) => items.map((li) => li.firstElementChild?.textContent ?? ''))).map(Number);
}
