import { expect, type Locator, type Page } from '@playwright/test';

import { playRound, type Card, type Rank, type Suit } from '../../src/components/game/Baccarat/engine';
import { bankWritten } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { arrived } from './streamedPage';

// The baccarat table, as the specs drive it. Hands are random: a spec reads the dealt cards off the table, replays
// them through the engine's drawing rules and checks the table, and the player's medals, against that.

/**
 * Opens the table, waits for the page to have streamed in, for the player's medals to be on the counter, and for them
 * to be written down in this browser (bankWritten).
 */
export async function openBaccarat(page: Page, language: 'en' | 'ja' = 'en'): Promise<void> {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/baccarat');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(page.getByTestId('baccarat-callout')).toBeVisible();
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await bankWritten(page);
}

const medalsIn = async (locator: Locator): Promise<number> => Number(await locator.getAttribute('data-medals'));

/** The medals the counter shows in hand: the player's, less those on the felt. */
export const medalsShown = (page: Page): Promise<number> => medalsIn(page.getByTestId('baccarat-medals'));
/** The medals on the felt. */
export const onTable = (page: Page): Promise<number> => medalsIn(page.getByTestId('baccarat-on-table'));

export const spot = (page: Page, name: RegExp): Locator => page.getByRole('button', { name });
export const dealButton = (page: Page): Locator => page.getByRole('button', { name: 'DEAL', exact: true });

/** Chooses how many medals a press of a spot puts on it. */
export async function betStep(page: Page, medals: number): Promise<void> {
  await page.getByRole('radio', { name: `Bet ${medals} ${medals === 1 ? 'medal' : 'medals'} a press` }).click();
}

/** Presses a spot until the table holds the player's card and takes the bet (hydration, and the card, come a moment after the page). */
export async function firstBet(page: Page, name: RegExp): Promise<void> {
  await pressUntil(spot(page, name), async () => (await onTable(page)) > 0);
}

export async function dealAndSettle(page: Page): Promise<void> {
  await dealButton(page).click();
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
}

export async function cardsOf(page: Page, side: 'player' | 'banker'): Promise<Card[]> {
  return page
    .locator(`[data-hand="${side}"] [data-rank]`)
    .evaluateAll((els) => els.map((el) => ({ rank: el.getAttribute('data-rank'), suit: el.getAttribute('data-suit') })))
    .then((cards) => cards.map((c) => ({ rank: c.rank as Rank, suit: c.suit as Suit })));
}

/** Replays the cards in dealing order (P, B, P, B, P3, B3) through the rules. */
export function replay(player: Card[], banker: Card[]) {
  const order = [player[0], banker[0], player[1], banker[1]];
  if (player[2]) order.push(player[2]);
  if (banker[2]) order.push(banker[2]);
  let i = 0;
  const hand = playRound(() => order[i++]);
  expect(i, 'the rules drew exactly the cards on the table').toBe(player.length + banker.length);
  return hand;
}

/** The hand on the table, replayed from its cards. */
export const handOnTable = async (page: Page) => replay(await cardsOf(page, 'player'), await cardsOf(page, 'banker'));
