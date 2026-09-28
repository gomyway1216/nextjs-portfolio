import { test, expect, type Page } from '@playwright/test';

import { betOdds, exactOdds } from '../../src/components/game/Baccarat/analysis';
import {
  RANKS,
  fullShoeCounts,
  playRound,
  settleBets,
  type Card,
  type Rank,
  type Suit,
} from '../../src/components/game/Baccarat/engine';

// Hands are random: the test reads the dealt cards off the table, replays
// them through the engine's drawing rules and checks the table against it.

async function openBaccarat(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/baccarat');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('baccarat-callout')).toBeVisible();
}

const bankroll = (page: Page) => page.getByTestId('baccarat-bankroll');
const onTable = (page: Page) => page.getByTestId('baccarat-on-table');
const spot = (page: Page, name: RegExp) => page.getByRole('button', { name });
const dealButton = (page: Page) => page.getByRole('button', { name: 'DEAL', exact: true });

/** Clicks a spot until hydration has attached handlers. */
async function firstBet(page: Page, name: RegExp) {
  await expect(async () => {
    await spot(page, name).click({ timeout: 1_000 });
    await expect(onTable(page)).not.toHaveText('0', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function dealAndSettle(page: Page) {
  await dealButton(page).click();
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
}

async function cardsOf(page: Page, side: 'player' | 'banker'): Promise<Card[]> {
  return page
    .locator(`[data-hand="${side}"] [data-rank]`)
    .evaluateAll((els) => els.map((el) => ({ rank: el.getAttribute('data-rank'), suit: el.getAttribute('data-suit') })))
    .then((cards) => cards.map((c) => ({ rank: c.rank as Rank, suit: c.suit as Suit })));
}

/** Replays the cards in dealing order (P, B, P, B, P3, B3) through the rules. */
function replay(player: Card[], banker: Card[]) {
  const order = [player[0], banker[0], player[1], banker[1]];
  if (player[2]) order.push(player[2]);
  if (banker[2]) order.push(banker[2]);
  let i = 0;
  const hand = playRound(() => order[i++]);
  expect(i, 'the rules drew exactly the cards on the table').toBe(player.length + banker.length);
  return hand;
}

test('a dealt hand follows the drawing rules and settles every bet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await firstBet(page, /^Banker \(0\.95:1\)/); // Banker 5
  await spot(page, /^Banker \(0\.95:1\)/).click(); // Banker 10
  await spot(page, /^Tie \(8:1\)/).click(); // Tie 5
  await spot(page, /^Player Pair/).click(); // Player Pair 5
  await expect(bankroll(page)).toHaveText('980');

  await dealAndSettle(page);
  const player = await cardsOf(page, 'player');
  const banker = await cardsOf(page, 'banker');
  const hand = replay(player, banker);
  expect(hand.player).toEqual(player);
  expect(hand.banker).toEqual(banker);
  await expect(page.getByTestId('player-total')).toHaveText(String(hand.playerTotal));
  await expect(page.getByTestId('banker-total')).toHaveText(String(hand.bankerTotal));

  const { returned } = settleBets({ banker: 10, tie: 5, playerPair: 5 }, hand, 'commission');
  const expected = Math.round((980 + returned) * 100) / 100;
  await expect(bankroll(page)).toHaveText(Number.isInteger(expected) ? String(expected) : expected.toFixed(2));
  await expect(onTable(page)).toHaveText('0');
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  await expect(page.locator(`[data-road="bead"] [data-cell="${hand.winner}"]`)).toHaveCount(1);

  // The live odds for the next hand come from exactly the unseen cards:
  // the shoe minus the exposed burn card and the six (or fewer) dealt cards.
  const info = (await page.getByTestId('shoe-info').textContent()) ?? '';
  const burn = info.match(/Burn card (10|[A2-9JQK])/);
  expect(burn, info).not.toBeNull();
  const counts = fullShoeCounts(8);
  const seen = [burn![1] === '10' ? 'T' : burn![1], ...[...player, ...banker].map((c) => c.rank)] as Rank[];
  for (const rank of seen) counts[RANKS.indexOf(rank)]--;
  const next = exactOdds(counts);
  const bankerWin = `${(betOdds('banker', next).win * 100).toFixed(3)}%`;
  await expect(page.locator('[data-live="banker"] td').nth(1)).toHaveText(bankerWin);
  await expect(page.getByText(`Computed from the ${next.cards} cards`)).toBeVisible();
});

test('rebet and a run of hands keep the books straight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  let expected = 1000;
  for (let i = 0; i < 8; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Rebet' }).click();
    await expect(onTable(page)).toHaveText('5');
    expected -= 5;
    await dealAndSettle(page);
    const hand = replay(await cardsOf(page, 'player'), await cardsOf(page, 'banker'));
    expected += settleBets({ player: 5 }, hand, 'commission').returned;
    await expect(bankroll(page)).toHaveText(String(expected));
  }
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(8);
  await expect(page.getByTestId('shoe-info')).toContainText('Hand 8');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(bankroll(page)).toHaveText('1000');
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(0);
  await expect(page.getByTestId('shoe-info')).toHaveText('A fresh eight-deck shoe is shuffled on the first deal.');
});

test('the EZ table swaps the banker payout and adds Dragon 7 and Panda 8', async ({ page }) => {
  await openBaccarat(page);
  await firstBet(page, /^Banker \(0\.95:1\)/);
  // Can't switch tables with chips down.
  await page.getByRole('radio', { name: 'No commission (EZ)' }).click();
  await expect(page.getByTestId('baccarat-message')).toHaveText('Take your bets down to switch tables.');
  await expect(page.getByTestId('ez-bets')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('radio', { name: 'No commission (EZ)' }).click();
  await expect(page.getByRole('radio', { name: 'No commission (EZ)' })).toHaveAttribute('aria-checked', 'true');
  await expect(spot(page, /^Banker \(1:1 · 3-card 7 pushes\)/)).toBeVisible();
  await expect(spot(page, /^Dragon 7 \(40:1\)/)).toBeVisible();
  await expect(spot(page, /^Panda 8 \(25:1\)/)).toBeVisible();
  await expect(page.locator('[data-live="dragon7"]')).toBeVisible();
});

test('switching tabs mid-deal does not drop the hand', async ({ page }) => {
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  await dealButton(page).click();
  await expect(page.getByRole('button', { name: 'Dealing…' })).toBeVisible();
  await page.getByRole('tab', { name: 'Odds' }).click();
  await page.waitForTimeout(3_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(dealButton(page)).toBeEnabled();
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  await expect(onTable(page)).toHaveText('0');
});

test('the odds tab recomputes the exact odds for each deck count', async ({ page }) => {
  await openBaccarat(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('edge-banker')).toHaveText('1.058%');
  await expect(page.getByTestId('total-ways')).toHaveText('4,998,398,275,503,360');
  await expect(async () => {
    await page.getByRole('radio', { name: '6デッキ' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('edge-banker')).toHaveText('1.056%', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId('p-tie')).toHaveText('9.5069%');
  await page.getByRole('radio', { name: '1デッキ' }).click();
  await expect(page.getByTestId('edge-banker')).toHaveText('1.012%');
  await expect(page.getByTestId('pair-body')).toContainText('= 1/17');
});
