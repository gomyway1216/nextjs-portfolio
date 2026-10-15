import { test, expect } from '@playwright/test';

import { betOdds, exactOdds } from '../../src/components/game/Baccarat/analysis';
import { RANKS, fullShoeCounts, type Rank } from '../../src/components/game/Baccarat/engine';
import { medalsBack } from '../../src/components/game/Baccarat/medals';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { betStep, cardsOf, dealAndSettle, dealButton, firstBet, handOnTable, medalsShown, onTable, openBaccarat, replay, spot } from './baccaratPage';
import { arrived } from './streamedPage';
import { bankBalance } from './medalCenterPage';

// Hands are random: the test reads the dealt cards off the table, replays
// them through the engine's drawing rules and checks the table against it.
// The table plays with the player's medals from the Medal Game Center: a new
// browser is a new guest, with a new member's medals.

test('a dealt hand follows the drawing rules and settles every bet in whole medals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  expect(await medalsShown(page)).toBe(WELCOME);
  await betStep(page, 5);
  await firstBet(page, /^Banker \(1:1/); // Banker 5
  await spot(page, /^Banker \(1:1/).click(); // Banker 10
  await spot(page, /^Tie \(8:1\)/).click(); // Tie 5
  await spot(page, /^Player Pair/).click(); // Player Pair 5
  expect(await onTable(page)).toBe(20);
  expect(await medalsShown(page)).toBe(WELCOME - 20);
  // Nothing has left the player's medals yet: they go at the deal.
  expect(await bankBalance(page)).toBe(WELCOME);

  await dealAndSettle(page);
  const player = await cardsOf(page, 'player');
  const banker = await cardsOf(page, 'banker');
  const hand = replay(player, banker);
  expect(hand.player).toEqual(player);
  expect(hand.banker).toEqual(banker);
  await expect(page.getByTestId('player-total')).toHaveText(String(hand.playerTotal));
  await expect(page.getByTestId('banker-total')).toHaveText(String(hand.bankerTotal));

  const { returned } = medalsBack({ banker: 10, tie: 5, playerPair: 5 }, hand, 'ez');
  const expected = WELCOME - 20 + returned;
  await expect.poll(() => bankBalance(page)).toBe(expected);
  expect(await medalsShown(page)).toBe(expected);
  expect(await onTable(page)).toBe(0);
  await expect(page.getByTestId('baccarat-won')).toHaveAttribute('data-medals', String(returned));
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
  const bankerWin = `${(betOdds('bankerEz', next).win * 100).toFixed(3)}%`;
  await expect(page.locator('[data-live="banker"] td').nth(1)).toHaveText(bankerWin);
  await expect(page.getByText(`Computed from the ${next.cards} cards`)).toBeVisible();
});

test('rebet and a run of hands keep the medals straight, and the table carries on after a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await betStep(page, 5);
  await firstBet(page, /^Player \(1:1\)/);
  let expected = WELCOME;
  for (let i = 0; i < 8; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Rebet' }).click();
    expect(await onTable(page)).toBe(5);
    expected -= 5;
    await dealAndSettle(page);
    expected += medalsBack({ player: 5 }, await handOnTable(page), 'ez').returned;
    await expect.poll(() => medalsShown(page)).toBe(expected);
  }
  expect(await bankBalance(page)).toBe(expected);
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(8);
  await expect(page.getByTestId('shoe-info')).toContainText('Hand 8');
  // The table has no reset of its own: the medals are reset only at the Medal Game Center.
  await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0);
  await expect(page.getByTestId('baccarat-center')).toHaveAttribute('href', '/games/medal-center');

  // A reload carries on with the same shoe, scoreboards and medals.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => medalsShown(page)).toBe(expected);
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(8);
  await expect(page.getByTestId('shoe-info')).toContainText('Hand 8');
  await expect(page.locator('[data-hand="player"] [data-rank]').first()).toBeVisible();
});

test('the 5% table bets the Banker in twenties, pays it 19 for 20, and has no Dragon 7 or Panda 8', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await expect(page.getByRole('radio', { name: 'No commission (EZ)' })).toHaveAttribute('aria-checked', 'true');
  await expect(spot(page, /^Dragon 7 \(40:1\)/)).toBeVisible();
  await firstBet(page, /^Player \(1:1\)/);
  // Can't switch tables with medals on the felt.
  await page.getByRole('radio', { name: '5% commission' }).click();
  await expect(page.getByTestId('baccarat-message')).toHaveText('Take your bets down to switch tables.');
  await page.getByRole('button', { name: 'Clear' }).click();
  expect(await onTable(page)).toBe(0);
  await page.getByRole('radio', { name: '5% commission' }).click();
  await expect(page.getByRole('radio', { name: '5% commission' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ez-bets')).toHaveCount(0);
  // One press of BET 1 on the Banker puts 20 medals down: 5% of 20 is a whole medal.
  await spot(page, /^Banker \(0\.95:1 · in 20s\)/).click();
  await expect(page.getByTestId('stake-banker')).toHaveText('20');
  await spot(page, /^Tie \(8:1\)/).click();
  expect(await onTable(page)).toBe(21);
  await dealAndSettle(page);
  const hand = await handOnTable(page);
  const { returned } = medalsBack({ banker: 20, tie: 1 }, hand, 'commission');
  if (hand.winner === 'banker') expect(returned).toBe(39);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 21 + returned);
  // The limits: a Tie takes up to 20 medals.
  await betStep(page, 20);
  await spot(page, /^Tie \(8:1\)/).click();
  await spot(page, /^Tie \(8:1\)/).click();
  await expect(page.getByTestId('baccarat-message')).toHaveText('Tie takes up to 20 medals.');
  await expect(page.getByTestId('stake-tie')).toHaveText('20');
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
  expect(await onTable(page)).toBe(0);
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

test('the simulation tab runs every simulation through the real rules, and never touches the medals', async ({ page }) => {
  await openBaccarat(page);
  const before = await bankBalance(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const section = (title: string) => page.locator('section', { has: page.getByRole('heading', { name: title }) });

  const lines = section('Every bet on the same cards');
  await lines.getByRole('combobox').selectOption('10000');
  await expect(async () => {
    await lines.getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('baccarat-sim-lines')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId('baccarat-sim-lines').locator('tbody tr')).toHaveCount(7);
  await expect(page.getByTestId('baccarat-sim-lines')).toContainText('Simulated (10,000 hands)');

  const road = section('Chasing the road');
  await road.getByRole('combobox').selectOption('10000');
  await road.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('baccarat-sim-patterns').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('baccarat-sim-patterns').locator('tr[data-pattern="banker"] td').nth(2)).toHaveText('100.0%');
  await expect(page.getByTestId('baccarat-sim-streaks')).toContainText('complete shoes');

  const counting = section('Counting cards');
  await counting.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('baccarat-sim-counting')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('baccarat-sim-counting').locator('tbody tr')).toHaveCount(7);
  // The main bets almost never favor even a perfect counter.
  const bankerFavorable = await page.getByTestId('baccarat-sim-counting').locator('tr[data-line="banker"] td').nth(1).textContent();
  expect(parseFloat(bankerFavorable ?? '')).toBeLessThan(3);
  await expect(page.getByText(/^10 shoes, [\d,]+ hands\./)).toBeVisible();
  // Thousands of simulated hands, and not one medal moved.
  expect(await bankBalance(page)).toBe(before);
});
