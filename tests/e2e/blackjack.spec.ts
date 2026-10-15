import { test, expect } from '@playwright/test';

import { handValue, hiLo, type Card } from '../../src/components/game/Blackjack/engine';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { cardsIn, dealButton, finishRound, medalsShown, openBlackjack, playByHint, shownNet } from './blackjackPage';
import { bankBalance } from './medalCenterPage';

// Rounds are random: each test reads the cards off the table and checks the
// dealer's play, every total and the medals against the rules. The table plays
// with the player's medals from the medal center (blackjack-medals.spec.ts).

test('every round follows the rules and moves the medals by what it shows', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  let left: number | null = null;
  for (let round = 0; round < 8; round++) {
    const before = await medalsShown(page);
    await playByHint(page);
    const dealer = await cardsIn(page, '[data-area="dealer"]');
    const handCount = await page.locator('[data-hand]').count();
    const hands: Card[][] = [];
    for (let i = 0; i < handCount; i++) hands.push(await cardsIn(page, `[data-hand="${i}"]`));

    const dealerTotal = handValue(dealer).total;
    const naturalEnd = (dealer.length === 2 && dealerTotal === 21) || (handCount === 1 && hands[0].length === 2 && handValue(hands[0]).total === 21);
    const allBust = hands.every((h) => handValue(h).total > 21);
    if (!naturalEnd && !allBust) {
      // The dealer drew to 17 and stopped there (standing on soft 17).
      expect(dealerTotal).toBeGreaterThanOrEqual(17);
      if (dealer.length > 2) expect(handValue(dealer.slice(0, -1)).total).toBeLessThan(17);
    } else {
      expect(dealer).toHaveLength(2);
    }
    await expect(page.getByTestId('dealer-total')).toContainText(String(dealerTotal));
    for (let i = 0; i < handCount; i++) {
      const total = handValue(hands[i]).total;
      if (total <= 21 && !(handCount === 1 && hands[i].length === 2 && total === 21)) {
        await expect(page.getByTestId(`hand-total-${i}`)).toContainText(String(total));
      }
    }

    // The medals moved by exactly the results listed, in whole medals, and the medal center keeps the same count.
    const net = await shownNet(page);
    expect(Number.isInteger(net)).toBe(true);
    await expect.poll(() => medalsShown(page)).toBe(before + net);
    expect(await bankBalance(page)).toBe(before + net);
    await expect(page.getByTestId('bj-on-table')).toHaveText('2');

    // The shoe count drops by exactly the cards on the table (unless it was reshuffled).
    const shownLeft = Number((await page.getByTestId('shoe-info').textContent())?.match(/(\d+) cards left/)?.[1]);
    const onTable = dealer.length + hands.reduce((n, h) => n + h.length, 0);
    if (left !== null && left - onTable >= 0 && shownLeft <= left) expect(shownLeft).toBe(left - onTable);
    left = shownLeft;
  }
  await expect(page.getByTestId('bj-stats')).toContainText('100%');
});

test('1 BET adds a medal up to ten, MAX BET bets ten, and a hand needs a bet', async ({ page }) => {
  await openBlackjack(page);
  await expect(page.getByTestId('bj-bet')).toHaveText('2');
  await page.getByTestId('bj-one-bet').click();
  await expect(page.getByTestId('bj-bet')).toHaveText('3');
  // An odd bet: the table says how a blackjack's half medal is rounded.
  await expect(page.getByTestId('bj-bet-note')).toContainText('a bet of 3 wins 4, not 4½');
  await page.getByTestId('bj-max-bet').click();
  await expect(page.getByTestId('bj-bet')).toHaveText('10');
  await expect(page.getByTestId('bj-one-bet')).toBeDisabled();
  await expect(page.getByTestId('bj-on-table')).toHaveText('10');
  await page.getByRole('button', { name: 'Clear bet' }).click();
  await expect(page.getByTestId('bj-bet')).toHaveText('0');
  await dealButton(page).click();
  await expect(page.getByTestId('bj-message')).toHaveText('Place a bet and deal.');
  expect(await medalsShown(page)).toBe(WELCOME);
});

test('switching tabs mid-deal leaves the round intact', async ({ page }) => {
  await openBlackjack(page);
  await dealButton(page).click();
  await page.getByRole('tab', { name: 'Odds' }).click();
  await page.waitForTimeout(1_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(async () => {
    const done = await dealButton(page).isEnabled();
    const acting = await page.locator('button[data-action="stand"]:enabled').count();
    const insurance = await page.getByTestId('bj-insurance').isVisible();
    expect(done || acting > 0 || insurance).toBe(true);
  }).toPass({ timeout: 10_000 });
  await expect(page.getByTestId('bj-on-table')).not.toHaveText('');
});

test('the odds tab explains every cell of the chart and the edge of every bet in medals', async ({ page }) => {
  await openBlackjack(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('bj-house-edge')).toHaveText('0.512%');
  await expect(async () => {
    await page.locator('[data-cell="hard-12-2"]').click({ timeout: 1_000 });
    await expect(page.getByTestId('bj-cell-info')).toContainText('12 対 ディーラーの2', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('[data-cell="hard-12-2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-cell="pairs-8-11"]').click();
  await expect(page.getByTestId('bj-cell-info')).toContainText('8,8 対 ディーラーのA');
  await expect(page.getByTestId('bj-cell-info').locator('[data-best="true"]')).toContainText('スプリット');
  await expect(page.getByTestId('rule-sixFive')).toHaveText('1.865%');
  await expect(page.getByTestId('bj-medal-table').locator('tbody tr')).toHaveCount(10);
  await expect(page.getByTestId('medal-edge-2')).toHaveText('0.512%');
  await expect(page.getByTestId('medal-edge-1')).toHaveText('2.767%');
});

test('the simulation tab plays three strategies on the same shoes, and never with the player’s medals', async ({ page }) => {
  await openBlackjack(page);
  const medals = await bankBalance(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const strategies = page.locator('section', { has: page.getByRole('heading', { name: 'Three ways to play, same shoes' }) });
  await strategies.getByRole('combobox').selectOption('10000');
  await expect(async () => {
    await strategies.getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('bj-sim-table')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId('bj-sim-table').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('bj-sim-table')).toContainText('Simulated (10,000 rounds)');

  // Counting: flat vs spread on the same rounds, bars for every true count.
  const counting = page.locator('section', { has: page.getByRole('heading', { name: 'Counting cards' }) });
  await counting.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('bj-count-table')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('bj-count-table').locator('tbody tr')).toHaveCount(2);
  await expect(counting.locator('[data-tc]')).toHaveCount(12);
  // Tens of thousands of rounds, and not one medal moved.
  expect(await bankBalance(page)).toBe(medals);
  await page.getByRole('tab', { name: 'Table' }).click();
  expect(await medalsShown(page)).toBe(medals);
});

test('the Hi-Lo count follows every card a player can see', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  await page.getByLabel('Count cards (Hi-Lo)').check();
  await expect(page.getByTestId('bj-running-count')).toHaveText('0');
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const tableCount = async () => {
    const all = [...(await cardsIn(page, '[data-area="dealer"]')), ...(await cardsIn(page, '[data-area="player"]'))];
    return all.reduce((n, card) => n + hiLo(card), 0);
  };

  await playByHint(page);
  let count = await tableCount();
  await expect(page.getByTestId('bj-running-count')).toHaveText(signed(count));

  // Mid-round, the face-down hole card is not counted (and not in the DOM as a card).
  await dealButton(page).click();
  await expect(async () => {
    const waiting = (await page.locator('button[data-action="stand"]:enabled').count()) > 0 || (await page.getByTestId('bj-insurance').isVisible());
    expect(waiting || (await dealButton(page).isEnabled())).toBe(true);
  }).toPass({ timeout: 10_000 });
  if (!(await dealButton(page).isEnabled())) {
    expect(await page.locator('[data-hole="true"]').count()).toBe(1);
    await expect(page.getByTestId('bj-running-count')).toHaveText(signed(count + (await tableCount())));
  }
  await finishRound(page);
  count += await tableCount();
  await expect(page.getByTestId('bj-running-count')).toHaveText(signed(count));
});
