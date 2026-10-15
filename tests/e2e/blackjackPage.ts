import { expect, type Page } from '@playwright/test';

import type { Card, Rank, Suit } from '../../src/components/game/Blackjack/engine';
import { arrived } from './streamedPage';

/**
 * The blackjack table: opened, arrived, the player's medals found, and the medal center's card here, so that a bet
 * can be made. Until the card is here every betting button is disabled.
 */
export async function openBlackjack(page: Page, language: 'en' | 'ja' = 'en'): Promise<void> {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/blackjack');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await seated(page);
}

/**
 * Waits until the table has the player's medals and the card: the medals are on the counter, and a bet can be made
 * (MAX BET can be pressed) or the hand on the table played.
 */
export async function seated(page: Page): Promise<void> {
  await expect(page.getByTestId('bj-counter')).toHaveAttribute('data-loaded', 'true', { timeout: 15_000 });
  await expect
    .poll(
      async () =>
        (await page.getByTestId('bj-max-bet').isEnabled()) ||
        (await page.locator('button[data-action]:enabled').count()) > 0 ||
        (await page.getByTestId('bj-insurance').isVisible()),
      { timeout: 15_000 },
    )
    .toBe(true);
}

/** The medals on the table's counter, as a number. */
export async function medalsShown(page: Page): Promise<number> {
  return Number(((await page.getByTestId('bj-medals').textContent()) ?? '').replace(/,/g, ''));
}

export const dealButton = (page: Page) => page.getByRole('button', { name: /^(DEAL|ディール)$/ });

export async function cardsIn(page: Page, selector: string): Promise<Card[]> {
  return page.locator(`${selector} [data-rank]`).evaluateAll((els) =>
    els.map((el) => ({ rank: el.getAttribute('data-rank') as Rank, suit: el.getAttribute('data-suit') as Suit })),
  );
}

/** Deals and plays a round by the basic-strategy hint, declining insurance. */
export async function playByHint(page: Page): Promise<void> {
  await expect(dealButton(page)).toBeEnabled();
  await dealButton(page).click();
  await finishRound(page);
}

/** Plays the round in progress to the end by the hint. */
export async function finishRound(page: Page): Promise<void> {
  for (let step = 0; step < 20; step++) {
    await expect(async () => {
      const done = await dealButton(page).isEnabled();
      const insurance = await page.getByTestId('bj-insurance').isVisible();
      const hinted = await page.locator('button[data-hint="true"][data-action]:enabled').count();
      expect(done || insurance || hinted > 0).toBe(true);
    }).toPass({ timeout: 10_000 });
    if (await dealButton(page).isEnabled()) return;
    if (await page.getByTestId('bj-insurance').isVisible()) {
      await page.getByRole('button', { name: /^(No insurance|掛けない)$/ }).click();
      continue;
    }
    await page.locator('button[data-hint="true"][data-action]:enabled').first().click();
  }
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
}

/** The net of the round just shown, from its list of results (each hand and the insurance). */
export async function shownNet(page: Page): Promise<number> {
  const amounts = await page
    .getByTestId('bj-results')
    .locator('li span:last-child')
    .evaluateAll((els) => els.map((el) => el.textContent ?? ''));
  return amounts.reduce((sum, a) => sum + (a.startsWith('±') ? 0 : Number(a.replace('−', '-').replace('+', ''))), 0);
}
